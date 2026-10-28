// 075 (owner 28/10, Υ2): the dry run is 075's block verbatim (generated), and, where PGlite is installed
// (PGLITE=<path to @electric-sql/pglite/dist/index.js>), the whole sequence runs on a copy of audit_log with the
// CHECK as Postgres writes it: dry run keeps nothing, 075 accepts the 8 Worker actions and refuses an unknown one,
// a second 075 stops, rollback brings the old CHECK back NOT VALID without deleting a row, 075 runs again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build075Dryrun } from '../migrations/drafts/tools/build-075-dryrun.mjs';

const D = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations/drafts');
const read = (f) => fs.readFileSync(path.join(D, f), 'utf8');
const ACTIONS = ['create', 'update', 'delete', 'cascade_delete', 'confirm', 'reverse', 'invoice_override', 'upload'];

test('the dry run is 075 verbatim plus the deliberate error', () => {
  assert.equal(read('075_audit_actions_dryrun.sql'), build075Dryrun(read('075_audit_actions.sql')));
});

test('075 lists exactly the actions the Worker writes', () => {
  const src = fs.readFileSync(path.resolve(D, '../../src/index.js'), 'utf8');
  const worker = [...new Set([...src.matchAll(/action: "([a-z_]+)"/g)].map((m) => m[1]))].filter((a) => a !== 'action').sort();
  assert.deepEqual(worker, [...ACTIONS].sort());
  const add = read('075_audit_actions.sql').match(/ADD CONSTRAINT audit_log_action_check CHECK \(action = ANY \(ARRAY\[([^\]]+)\]/)[1];
  assert.deepEqual(add.match(/'([a-z_]+)'/g).map((s) => s.slice(1, -1)).sort(), [...ACTIONS].sort());
});

test('PGlite: dry run, apply, re-apply, rollback, apply again', { skip: !process.env.PGLITE && 'set PGLITE to run' }, async () => {
  const { PGlite } = await import(process.env.PGLITE);
  const db = new PGlite();
  const def = async () => (await db.query(`SELECT convalidated v, pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'audit_log_action_check'`)).rows[0];
  const ins = async (a) => { try { await db.query(`INSERT INTO audit_log (actor, role, action, table_name) VALUES ('t', 'owner', $1, 'x')`, [a]); return true; } catch { return false; } };
  const runs = async (f) => { try { await db.exec(read(f)); return 'ok'; } catch (e) { return e.message; } };
  await db.exec(`CREATE TABLE audit_log (id bigserial PRIMARY KEY, actor text NOT NULL, role text NOT NULL,
      action text NOT NULL CHECK (action IN ('create','update','delete','cascade_delete')), table_name text NOT NULL,
      record_id text, before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO audit_log (actor, role, action, table_name) SELECT 'x', 'owner', (ARRAY['create','update','delete','cascade_delete'])[1 + g % 4], 't' FROM generate_series(1, 200) g;`);
  const old = (await def()).d;
  assert.match(await runs('075_audit_actions_dryrun.sql'), /DRY RUN 075 finished/);
  assert.equal((await def()).d, old);
  assert.equal(await runs('075_audit_actions.sql'), 'ok');
  for (const a of ACTIONS) assert.ok(await ins(a), a);
  assert.equal(await ins('bogus'), false);
  assert.equal((await db.query(`SELECT count(*)::int n FROM audit_log WHERE actor = '075-proof'`)).rows[0].n, 0);
  assert.match(await runs('075_audit_actions.sql'), /already applied/);
  assert.equal(await runs('075_audit_actions_rollback.sql'), 'ok');
  assert.equal((await def()).v, false);
  assert.equal(await ins('confirm'), false);
  assert.ok((await db.query(`SELECT count(*)::int n FROM audit_log WHERE action = 'confirm'`)).rows[0].n >= 1, 'no audit row deleted');
  assert.equal(await runs('075_audit_actions.sql'), 'ok');
  // a definition that is not the measured one stops 075 (re-measure), even if it holds the same words
  await runs('075_audit_actions_rollback.sql');
  await db.exec(`ALTER TABLE audit_log DROP CONSTRAINT audit_log_action_check; ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
    CHECK (action IN ('create','update','cascade_delete')) NOT VALID`);
  assert.match(await runs('075_audit_actions.sql'), /unexpected definition/);
});
