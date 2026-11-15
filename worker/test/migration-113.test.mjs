// 113 (owner 15/11/2026: the order of points in a groupage is kept per point): the four files are ASCII, the dry run
// carries the apply block word for word, and, where PGlite is installed (PGLITE=<path to
// @electric-sql/pglite/dist/index.js>), on a small copy of order_stops with 111's hours and a column-list trigger:
// the dry run keeps nothing and its proofs pass; apply adds the column, all NULL, triggers unchanged; a 0 is refused;
// a second apply stops; rollback refuses while a row has a position, then drops; apply runs again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// drafts/ until it runs, then worker/migrations/ (CLAUDE.md, rule 5): either place
const M = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const FILES = ['113_stop_load_seq.sql', '113_stop_load_seq_dryrun.sql', '113_stop_load_seq_rollback.sql', '113_stop_load_seq_verify.sql'];
const read = (f) => fs.readFileSync([path.join(M, 'drafts', f), path.join(M, f)].find((p) => fs.existsSync(p)) || path.join(M, f), 'utf8');

test('113 files are ASCII', () => {
  for (const f of FILES) assert.ok(!/[^\x00-\x7F]/.test(read(f)), f);
});

test('the dry run is the apply block plus proofs, and ends in a deliberate error', () => {
  const apply = read('113_stop_load_seq.sql');
  const dry = read('113_stop_load_seq_dryrun.sql');
  const part = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b));
  assert.equal(part(dry, '-- ===== PART 0', '-- ===== DRY RUN ONLY').trimEnd(), part(apply, '-- ===== PART 0', 'END\n$do$;').trimEnd());
  assert.match(dry, /RAISE EXCEPTION 'DRY RUN 113 finished: [^']*nothing kept \(deliberate error\)'/);
  assert.match(apply, /CHECK \(\s*load_seq IS NULL OR \(load_seq > 0 AND order_id IS NOT NULL\)\)/);
});

const SCHEMA = `
  CREATE ROLE anon;
  CREATE TABLE orders (id bigint PRIMARY KEY, group_id text);
  CREATE TABLE order_stops (id bigint PRIMARY KEY, order_id bigint, stop_type text, stop_number numeric, datetime date,
    deleted_at timestamptz, time_from text, time_to text);
  CREATE TABLE pl_movements (id serial PRIMARY KEY, order_stop_id bigint);
  CREATE TABLE ramp (id serial PRIMARY KEY, stop_id bigint, d date);
  CREATE FUNCTION ramp_follows() RETURNS trigger LANGUAGE plpgsql AS $f$ begin insert into ramp (stop_id, d) values (new.id, new.datetime); return new; end $f$;
  CREATE TRIGGER ramp_follows_stop AFTER UPDATE OF datetime ON order_stops FOR EACH ROW EXECUTE FUNCTION ramp_follows();
  CREATE FUNCTION pl_ins() RETURNS trigger LANGUAGE plpgsql AS $f$ begin insert into pl_movements (order_stop_id) values (new.id); return new; end $f$;
  CREATE TRIGGER pl_delivery_from_stop AFTER INSERT ON order_stops FOR EACH ROW EXECUTE FUNCTION pl_ins();
  INSERT INTO order_stops VALUES (1, 10, 'Loading', 1, '2026-11-16', null, null, null), (2, 10, 'Unloading', 1, '2026-11-17', null, null, null),
    (3, 11, 'Unloading', null, '2026-11-17', '2026-11-01', null, null), (4, 10, 'Cross-dock', 2, '2026-11-16', null, null, null),
    (5, null, 'Loading', 1, '2026-11-15', null, null, null);
`;

test('PGlite: dry run keeps nothing; apply; 0 refused; apply again stops; rollback guarded; apply again', { skip: !process.env.PGLITE && 'set PGLITE to run' }, async () => {
  const { PGlite } = await import(process.env.PGLITE);
  const db = new PGlite();
  await db.exec(SCHEMA);
  const col = async () => (await db.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'order_stops' AND column_name = 'load_seq'`)).rows[0].n;
  await assert.rejects(db.exec(read('113_stop_load_seq_dryrun.sql')),
    /DRY RUN 113 finished: 5 rows, 2 live stops given a position, 0 rows written in the other 3 tables; refused 0: yes; triggers 2 \(unchanged\), on any UPDATE: none/);
  assert.equal(await col(), 0, 'the dry run kept nothing');
  await db.exec(read('113_stop_load_seq.sql'));
  assert.equal(await col(), 1);
  let v = (await db.query(read('113_stop_load_seq_verify.sql'))).rows[0];
  assert.equal(v.result, '113 in place');
  assert.equal(Number(v.stops_with_position), 0);
  assert.equal(Number(v.triggers_on_stops), 2);
  await db.exec('UPDATE order_stops SET load_seq = 2 WHERE id = 2');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM ramp')).rows[0].n, 0, 'a position write wakes no column-list trigger');
  await assert.rejects(db.exec('UPDATE order_stops SET load_seq = 0 WHERE id = 1'), /order_stops_load_seq_pos/);
  // a cross-dock stop is not refused (its type may change later; readers skip it), a NULL type neither: only the
  // national stop (no order) is
  await db.exec('UPDATE order_stops SET load_seq = 1 WHERE id = 4');
  await db.exec("UPDATE order_stops SET stop_type = 'Unloading' WHERE id = 4");
  await db.exec('UPDATE order_stops SET load_seq = NULL WHERE id = 4');
  await assert.rejects(db.exec('UPDATE order_stops SET load_seq = 1 WHERE id = 5'), /order_stops_load_seq_pos/, 'a national stop (no order) has no place');
  await assert.rejects(db.exec(read('113_stop_load_seq.sql')), /already exists - 113 has run/);
  await assert.rejects(db.exec(read('113_stop_load_seq_rollback.sql')), /refused: 1 stops carry a position/);
  assert.equal(await col(), 1, 'nothing dropped while a position exists');
  await db.exec('UPDATE order_stops SET load_seq = NULL');
  await db.exec(read('113_stop_load_seq_rollback.sql'));
  assert.equal(await col(), 0);
  v = (await db.query(read('113_stop_load_seq_verify.sql'))).rows[0];
  assert.equal(v.result, '113 NOT in place (column absent)');
  await db.exec(read('113_stop_load_seq.sql'));
  assert.equal(await col(), 1, '113 runs again after a rollback');
});

test('PGlite: without 111 (no hours) 113 stops before writing', { skip: !process.env.PGLITE && 'set PGLITE to run' }, async () => {
  const { PGlite } = await import(process.env.PGLITE);
  const db = new PGlite();
  await db.exec('CREATE TABLE order_stops (id bigint PRIMARY KEY, stop_number numeric, deleted_at timestamptz)');
  await assert.rejects(db.exec(read('113_stop_load_seq.sql')), /111 is not in place/);
});

test('PGlite: a trigger that fires on ANY update and writes elsewhere makes the dry run fail, by name', { skip: !process.env.PGLITE && 'set PGLITE to run' }, async () => {
  const { PGlite } = await import(process.env.PGLITE);
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(`CREATE FUNCTION any_upd() RETURNS trigger LANGUAGE plpgsql AS $f$ begin insert into ramp (stop_id) values (new.id); return new; end $f$;
    CREATE TRIGGER noisy AFTER UPDATE ON order_stops FOR EACH ROW EXECUTE FUNCTION any_upd();`);
  await assert.rejects(db.exec(read('113_stop_load_seq_dryrun.sql')), /113 DRY RUN FAILED: writing load_seq on 2 stops wrote rows elsewhere: public\.ramp=2/);
});
