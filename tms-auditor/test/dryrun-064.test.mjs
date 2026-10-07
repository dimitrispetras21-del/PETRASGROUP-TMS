// 064 (worker/migrations/drafts/064_b34_session_rows.sql) moves the LIVE B-34 from the text 047b seeded and 057b
// extended (5/10) to the catalog's text (tms-auditor/checks/B-34.sql). Three ways it could go wrong on the evening,
// each pinned here at build time instead (principle 6):
//   1. two copies of the new text (064 and the catalog) drift apart — the seed would then say one thing and
//      production another (principle 3): 064's literal must BE the catalog text, and its rollback's literal the text
//      before it, both by md5 and byte for byte;
//   2. the guard md5 names a text production does not hold: the chain 047b (ee5498c6…, the md5 057b guarded) →
//      057b's appended line → b26af3ea… is re-derived from the catalog, not trusted;
//   3. the new exclusion hides more than the routine end of a login: B-34 is run on rows of every «session:» kind.
// The front end's own rows are matched against the same LIKE patterns in tests/session-expired-quiet.test.mjs.
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
const NEW = loadChecks().checks.find((c) => c.id === 'B-34').sql;
const LINE = "\n AND message NOT LIKE 'session: expired%'";
const OLD = NEW.endsWith(LINE) ? NEW.slice(0, -LINE.length) : null;   // live before 064 = 047b + 057b
const OLD_MD5 = 'b26af3ea8f32a0ce01984d6f3eb3921d';
const NEW_MD5 = '27c40fa3d9f1f153ebc43e6e130cd767';
const literal = (src, name) => (src.match(new RegExp(`${name}\\s+constant text := \\$c\\$([\\s\\S]*?)\\$c\\$;`)) || [])[1];

test('064 and its rollback: ASCII, ONE DO block, texts and md5s = the catalog after / before', () => {
  for (const [n, s] of [['064', SRC], ['064 rollback', RB]]) {
    assert.deepEqual(nonAscii(s), [], `${n} must stay ASCII (the owner pastes it from a clipboard that has mangled Greek)`);
    assert.equal((s.match(/^DO \$/gm) || []).length, 1, `${n} must stay ONE DO block (the SQL editor is not atomic)`);
  }
  assert.ok(OLD, 'tms-auditor/checks/B-34.sql must END with the line 064 adds');
  assert.equal(md5(NEW), NEW_MD5, 'catalog B-34 changed: regenerate 064 and its rollback');
  assert.equal(md5(OLD), OLD_MD5);
  // the chain: 047b's text is what 057b guarded; 057b appended exactly this line (057b_stock_monitoring.sql)
  const L057b = "\n AND message NOT LIKE '_atRetry 422 rule%'";
  assert.ok(OLD.endsWith(L057b));
  assert.equal(md5(OLD.slice(0, -L057b.length)), 'ee5498c631cd9c1b9426ba7cda9d69b2');
  assert.ok(read('057b_stock_monitoring.sql').includes("if v_md5 is distinct from 'ee5498c631cd9c1b9426ba7cda9d69b2' then"));
  assert.ok(read('057b_stock_monitoring.sql').includes("update monitoring.checks set sql_text = sql_text || E'\\n AND message NOT LIKE ''_atRetry 422 rule%''' where id = 'B-34';"));
  assert.equal(literal(SRC, 'v_new'), NEW, '064 must write the catalog text byte for byte');
  assert.equal(literal(RB, 'v_old'), OLD, 'the rollback must restore the 057b text byte for byte');
  assert.ok(SRC.includes(`v_old_md5 constant text := '${OLD_MD5}'`));
  assert.ok(RB.includes(`v_064_md5 constant text := '${NEW_MD5}'`));
  assert.ok(SRC.includes(`md5(sql_text) = '${NEW_MD5}' AS is_064_text`));
  assert.ok(RB.includes(`md5(sql_text) = '${OLD_MD5}' AS is_057b_text`) && RB.includes(`md5(v_old) <> '${OLD_MD5}'`));
  assert.doesNotMatch(SRC.replace(/--[^\n]*/g, ''), /UPDATE monitoring\.checks SET (?!sql_text = v_new WHERE id = 'B-34';)/, '064 writes B-34.sql_text and nothing else');
});

test('064 on PGlite: refuses a text it does not know, applies over the 057b text, a second paste changes nothing; the rollback mirrors it', async () => {
  const db = await freshDb();
  const b34 = async () => (await one(db, "SELECT sql_text FROM monitoring.checks WHERE id = 'B-34'")).sql_text;
  const set = (t) => db.query("UPDATE monitoring.checks SET sql_text = $1 WHERE id = 'B-34'", [t]);
  // the seed holds the catalog (= 064) text; production holds the 057b one
  await set(OLD + ' ');
  await assert.rejects(db.exec(SRC), /064 refused: B-34 sql_text md5 is [0-9a-f]{32}, expected b26af3ea8f32a0ce01984d6f3eb3921d/);
  assert.equal(await b34(), OLD + ' ', 'a refusal changes nothing');
  await set(OLD);
  const r = await db.exec(SRC);
  assert.equal(await b34(), NEW);
  assert.deepEqual({ ...r.at(-1).rows[0] }, { id: 'B-34', is_064_text: true, md5: NEW_MD5, enabled: true, red_op: '>', red_value: 5 });
  const again = await db.exec(SRC);
  assert.equal(await b34(), NEW, 'a second paste is a NOTICE, not a change');
  assert.equal(again.at(-1).rows[0].is_064_text, true);
  // the check still runs inside the auditor (as tms_check_runner, through the guard): no error row
  await db.query("UPDATE monitoring.checks SET enabled = false, disabled_reason = 'test: isolated' WHERE id <> 'B-34'");
  await db.query("SELECT monitoring.run_checks('hourly')");
  assert.deepEqual({ ...(await one(db, "SELECT status, err FROM monitoring.results WHERE check_id = 'B-34' ORDER BY id DESC LIMIT 1")) }, { status: 'green', err: null });

  await set(NEW + ' ');
  await assert.rejects(db.exec(RB), /064 rollback refused: B-34 sql_text md5 is [0-9a-f]{32}, expected 27c40fa3d9f1f153ebc43e6e130cd767/);
  assert.equal(await b34(), NEW + ' ');
  await set(NEW);
  const rb = await db.exec(RB);
  assert.equal(await b34(), OLD);
  assert.equal(rb.at(-1).rows[0].is_057b_text, true);
  await db.exec(RB);
  assert.equal(await b34(), OLD);
  await db.close();
});

test('B-34 after 064: the routine end of a login does not count; a loop, a refusal before expiry and a tamper bounce do', async () => {
  const db = await freshDb();
  const rows = [
    // excluded by 064 — the routine end of an 8 h login, one per tab and per day
    'session: expired → login (user pantelis; first 401: TRUCKS; exp 3 min ago; nav navigate; from none; Win Chrome 149; #daily_ops)',
    'session: expired → login (user sotiris; first 401: offline queue; nav navigate; from index.html; Win Chrome 149; #weekly_intl)',
    // still counted
    'session: redirect loop — 50 loads in 9 s (user ?, reason no login; no login ×50; nav navigate; from index.html; Win Chrome 149; no hash)',
    'session: rejected before expiry → login (user eirini; first 401: TRUCKS; exp in 300 min; nav navigate; from index.html; Win Chrome 149; #dashboard)',
    'session: login rejected at load — unknown username (user ghost; nav navigate; from index.html; Win Chrome 149; #dashboard)',
    'preload_tblEAPExIAjiA3asD: Unauthorized',
    // excluded before 064 already
    'queue: offline flush synced 1, conflicts 0, failed 0 · r1',
    '_atRetry 422 rule: Το κομμάτι δεν είναι σε φορτηγό · ORDERS',
  ];
  for (const m of rows) await db.query('INSERT INTO app_errors (message) VALUES ($1)', [m]);
  assert.equal(Number((await one(db, NEW)).count), 4, 'after 064');
  assert.equal(Number((await one(db, OLD)).count), 6, 'before 064 the two routine rows counted');
  await db.close();
});
