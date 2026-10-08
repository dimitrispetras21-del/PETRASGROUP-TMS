// 064 (worker/migrations/drafts/064_b34_session_rows.sql) moves the LIVE B-34 and B-34b from the texts 047b seeded
// and 057b extended (5/10) to the catalog's texts (tms-auditor/checks/B-34.sql, B-34b.sql). Ways it could go wrong
// on the evening, each pinned here at build time instead (principle 6):
//   1. two copies of a new text (064 and the catalog) drift apart — the seed would then say one thing and
//      production another (principle 3): 064's literals must BE the catalog texts, and its rollback's literals the
//      texts before it, both by md5 and byte for byte;
//   2. a guard md5 names a text production does not hold: each chain 047b (the md5 057b guarded) → 057b's appended
//      line → the md5 064 guards is re-derived from the catalog, not trusted;
//   3. one check changes and the other refuses: 064 is all or nothing, and a check already at its 064 text is left
//      as it is (a second paste, or a B-34 changed by an earlier draft of 064);
//   4. the new exclusion hides more than the routine end of a login: both checks are run on rows of every
//      «session:» kind.
// The front end's own rows are matched against the same LIKE patterns in tests/session-expired-quiet.test.mjs
// (first-401 rows) and tests/critics/session-at-load-rig.js (at-load rows, real Chromium).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadChecks } from '../checks/load.mjs';
import { DRAFTS } from '../lib/db.mjs';
import { freshDb, one } from './helpers.mjs';

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');
const nonAscii = (s) => [...s].filter((c) => c.charCodeAt(0) > 127);
const SRC = read('064_b34_session_rows.sql');
const RB = read('064_b34_session_rows_rollback.sql');
const R057b = read('057b_stock_monitoring.sql');
const catalog = (id) => loadChecks().checks.find((c) => c.id === id).sql;
const literal = (src, name) => (src.match(new RegExp(`${name}\\s+constant text := \\$c\\$([\\s\\S]*?)\\$c\\$;`)) || [])[1];

// per check: the alias its LIKE uses, the md5 057b guarded (047b's text), 064's guard and 064's result
const C = {
  'B-34': { col: 'message', base: 'ee5498c631cd9c1b9426ba7cda9d69b2', old: 'b26af3ea8f32a0ce01984d6f3eb3921d', neu: '27c40fa3d9f1f153ebc43e6e130cd767', v: 'v_b34' },
  'B-34b': { col: 'e.message', base: '077efbe51163e3630b7a96b3f09fbe96', old: '94d6570352907febd3f4aea2aa98ebeb', neu: '810faa4eb43bbc660755c640c5a1ec8f', v: 'v_b34b' },
};
for (const [id, c] of Object.entries(C)) {
  c.NEW = catalog(id);
  const line = `\n AND ${c.col} NOT LIKE 'session: expired%'`;
  c.OLD = c.NEW.endsWith(line) ? c.NEW.slice(0, -line.length) : null;   // live before 064 = 047b + 057b
  c.L057b = `\n AND ${c.col} NOT LIKE '_atRetry 422 rule%'`;
}

test('064 and its rollback: ASCII, ONE DO block, texts and md5s = the catalog after / before, for B-34 and B-34b', () => {
  for (const [n, s] of [['064', SRC], ['064 rollback', RB]]) {
    assert.deepEqual(nonAscii(s), [], `${n} must stay ASCII (the owner pastes it from a clipboard that has mangled Greek)`);
    assert.equal((s.match(/^DO \$/gm) || []).length, 1, `${n} must stay ONE DO block (the SQL editor is not atomic)`);
  }
  for (const [id, c] of Object.entries(C)) {
    assert.ok(c.OLD, `tms-auditor/checks/${id}.sql must END with the line 064 adds`);
    assert.equal(md5(c.NEW), c.neu, `catalog ${id} changed: regenerate 064 and its rollback`);
    assert.equal(md5(c.OLD), c.old);
    // the chain: 047b's text is what 057b guarded; 057b appended exactly this line
    assert.ok(c.OLD.endsWith(c.L057b), `${id}: the text before 064 ends with 057b's line`);
    assert.equal(md5(c.OLD.slice(0, -c.L057b.length)), c.base);
    assert.ok(R057b.includes(`where id = '${id}';\n  if v_md5 is distinct from '${c.base}' then`), `${id}: 057b guarded ${c.base}`);
    assert.ok(R057b.includes(`update monitoring.checks set sql_text = sql_text || E'\\n AND ${c.col} NOT LIKE ''_atRetry 422 rule%''' where id = '${id}';`));
    assert.equal(literal(SRC, `${c.v}_new`), c.NEW, `064 must write the ${id} catalog text byte for byte`);
    assert.equal(literal(RB, `${c.v}_old`), c.OLD, `the rollback must restore the ${id} 057b text byte for byte`);
    assert.match(SRC, new RegExp(`${c.v}_old_md5\\s+constant text := '${c.old}'`), `064 guards ${id} with ${c.old}`);
    assert.match(RB, new RegExp(`${c.v}_064_md5\\s+constant text := '${c.neu}'`), `the rollback guards ${id} with ${c.neu}`);
    assert.ok(SRC.includes(`'${c.neu}'`) && RB.includes(`'${c.old}'`), `${id}: the proof SELECTs name the expected md5s`);
  }
  assert.doesNotMatch(SRC.replace(/--[^\n]*/g, ''), /UPDATE monitoring\.checks SET (?!sql_text = r\.new_text WHERE id = r\.id;)/, '064 writes sql_text of B-34/B-34b and nothing else');
  assert.doesNotMatch(RB.replace(/--[^\n]*/g, ''), /UPDATE monitoring\.checks SET (?!sql_text = r\.old_text WHERE id = r\.id;)/);
  assert.match(SRC, /VALUES \('B-34', v_b34_old_md5, v_b34_new\), \('B-34b', v_b34b_old_md5, v_b34b_new\)/, 'exactly these two checks');
});

test('064 on PGlite: all or nothing, applies over the 057b texts, a second paste changes nothing; the rollback mirrors it', async () => {
  const db = await freshDb();
  const text = async (id) => (await one(db, 'SELECT sql_text FROM monitoring.checks WHERE id = $1', [id])).sql_text;
  const set = (id, t) => db.query('UPDATE monitoring.checks SET sql_text = $1 WHERE id = $2', [t, id]);
  const B = C['B-34'], Bb = C['B-34b'];
  // the seed holds the catalog (= 064) texts; production holds the 057b ones
  await set('B-34', B.OLD); await set('B-34b', Bb.OLD + ' ');
  await assert.rejects(db.exec(SRC), /064 refused: B-34b sql_text md5 is [0-9a-f]{32}, expected 94d6570352907febd3f4aea2aa98ebeb/);
  assert.equal(await text('B-34'), B.OLD, 'a refusal on B-34b undoes B-34 too');
  assert.equal(await text('B-34b'), Bb.OLD + ' ');
  await set('B-34b', Bb.OLD);
  const r = await db.exec(SRC);
  assert.equal(await text('B-34'), B.NEW);
  assert.equal(await text('B-34b'), Bb.NEW);
  assert.deepEqual(r.at(-1).rows.map((x) => ({ ...x })), [
    { id: 'B-34', is_064_text: true, md5: B.neu, enabled: true, red_op: '>', red_value: 5 },
    { id: 'B-34b', is_064_text: true, md5: Bb.neu, enabled: true, red_op: '>', red_value: 0 },
  ]);
  const again = await db.exec(SRC);
  assert.equal(await text('B-34'), B.NEW, 'a second paste is a NOTICE, not a change');
  assert.deepEqual(again.at(-1).rows.map((x) => x.is_064_text), [true, true]);
  // a B-34 already at 064's text (an earlier draft of 064 ran) and a B-34b at the 057b one: only B-34b moves
  await set('B-34b', Bb.OLD);
  await db.exec(SRC);
  assert.equal(await text('B-34'), B.NEW);
  assert.equal(await text('B-34b'), Bb.NEW);
  // both still run inside the auditor (as tms_check_runner, through the guard): no error row
  await db.query("UPDATE monitoring.checks SET enabled = false, disabled_reason = 'test: isolated' WHERE id NOT IN ('B-34', 'B-34b')");
  await db.query("SELECT monitoring.run_checks('hourly')");
  for (const id of ['B-34', 'B-34b'])
    assert.deepEqual({ ...(await one(db, 'SELECT status, err FROM monitoring.results WHERE check_id = $1 ORDER BY id DESC LIMIT 1', [id])) }, { status: 'green', err: null }, id);

  await set('B-34', B.NEW + ' ');
  await assert.rejects(db.exec(RB), /064 rollback refused: B-34 sql_text md5 is [0-9a-f]{32}, expected 27c40fa3d9f1f153ebc43e6e130cd767/);
  assert.equal(await text('B-34'), B.NEW + ' ');
  assert.equal(await text('B-34b'), Bb.NEW, 'nothing of the rollback happened');
  await set('B-34', B.NEW);
  const rb = await db.exec(RB);
  assert.equal(await text('B-34'), B.OLD);
  assert.equal(await text('B-34b'), Bb.OLD);
  assert.deepEqual(rb.at(-1).rows.map((x) => x.is_057b_text), [true, true]);
  await db.exec(RB);
  assert.equal(await text('B-34'), B.OLD);
  assert.equal(await text('B-34b'), Bb.OLD);
  await db.close();
});

// every «session:» kind the front end writes (core/session-streak.js), plus neighbours
const ROUTINE = [
  'session: expired → login (user pantelis; first 401: TRUCKS; exp 3 min ago; nav navigate; from none; Win Chrome 149; #daily_ops)',
  'session: expired → login (user sotiris; login already removed by another tab; first 401: offline queue; nav navigate; from index.html; Win Chrome 149; #weekly_intl)',
];
const NOT_ROUTINE = [
  'session: redirect loop — 50 loads in 9 s (user eirini, reason expired; expired ×50; exp 4 min ago; nav navigate; from index.html; Win Chrome 149; #dashboard)',
  'session: rejected before expiry → login (user eirini; first 401: TRUCKS; exp in 300 min; nav navigate; from index.html; Win Chrome 149; #dashboard)',
  'session: login rejected at load — unknown username (user ghost; exp in 60 min; nav navigate; from index.html; Win Chrome 149; #dashboard)',
  'preload_tblEAPExIAjiA3asD: Unauthorized',
];

test('B-34 after 064: the routine end of a login does not count; a loop, a refusal before expiry and a tamper bounce do', async () => {
  const db = await freshDb();
  const rows = [...ROUTINE, ...NOT_ROUTINE,
    // excluded before 064 already
    'queue: offline flush synced 1, conflicts 0, failed 0 · r1',
    '_atRetry 422 rule: Το κομμάτι δεν είναι σε φορτηγό · ORDERS',
  ];
  for (const m of rows) await db.query('INSERT INTO app_errors (message) VALUES ($1)', [m]);
  assert.equal(Number((await one(db, C['B-34'].NEW)).count), 4, 'after 064');
  assert.equal(Number((await one(db, C['B-34'].OLD)).count), 6, 'before 064 the two routine rows counted');
  await db.close();
});

test('B-34b after 064: a user\'s first routine row is not a «new message»; the other session kinds still are', async () => {
  const db = await freshDb();
  // all new this hour, none seen in the 8 days before: B-34b counts distinct first-40 characters
  for (const m of [...ROUTINE, ...NOT_ROUTINE]) await db.query('INSERT INTO app_errors (message) VALUES ($1)', [m]);
  const n = async (sql) => Number((await one(db, sql)).count);
  assert.equal(await n(C['B-34b'].NEW), 4, 'after 064: the 4 non-routine messages');
  assert.equal(await n(C['B-34b'].OLD), 6, 'before 064 each user\'s routine row was a «new message»');
  // the routine row is per user: its first 40 characters differ by name — why a prefix and not «seen before» helps
  assert.notEqual(ROUTINE[0].slice(0, 40), ROUTINE[1].slice(0, 40));
  await db.close();
});
