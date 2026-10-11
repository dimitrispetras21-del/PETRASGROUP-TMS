// tests/sql-069-drafts.test.js — run: node --test tests/sql-069-drafts.test.js
// The 069 drafts (worker/migrations/drafts/069_hub_day_once*) at build time, plain node, no database
// (principle 6: a stale fingerprint should fail here, not at 15:30 on the owner's evening):
//   - ASCII only (the owner pastes them from a clipboard that has mangled Greek before);
//   - the writing files are ONE DO block (the SQL editor is not atomic across statements); the two
//     verify files write nothing;
//   - the dry runs are regenerated from their sources, never hand-edited;
//   - the md5 chain holds: the repo's 028 text without its comment lines IS the live text 069 guards
//     (e977…, read on production 11/10), 069's two substitutions on it give the text whose md5 (4b5d…)
//     the rollback, the rules test, the verify and the repair guard on, and the rollback undoes exactly
//     069's substitutions.
// The rules themselves are proven by 069_hub_day_once_test.sql (9 cases, run on the PGlite copy of the
// schema with the live 028 text: 9 OK; with 028 as it lives today, case 2 — the double move — FAILS).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const DRAFTS = path.join(ROOT, 'worker/migrations/drafts');
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const FILES = fs.readdirSync(DRAFTS).filter((f) => f.startsWith('069_hub_day_once'));
const DO_FILES = ['069_hub_day_once.sql', '069_hub_day_once_dryrun.sql', '069_hub_day_once_test.sql', '069_hub_day_once_rollback.sql',
  '069_hub_day_once_repair.sql', '069_hub_day_once_repair_dryrun.sql', '069_hub_day_once_repair_rollback.sql'];
const READ_ONLY = ['069_hub_day_once_verify.sql', '069_hub_day_once_repair_verify.sql'];

// A `name CONSTANT text := '…' || E'\n' || '…';` of a DO block, evaluated.
function sqlConst(src, name) {
  const m = new RegExp(`\\b${name} CONSTANT text := ([\\s\\S]*?);\\n`).exec(src);
  assert.ok(m, `${name} not found`);
  let out = '';
  for (const t of m[1].matchAll(/E'((?:[^'\\]|\\.)*)'|'((?:[^']|'')*)'/g))
    out += t[1] !== undefined ? t[1].replace(/\\n/g, '\n') : t[2].replace(/''/g, "'");
  return out;
}

test('the nine 069 files are all there', () => {
  assert.deepStrictEqual(FILES.slice().sort(), DO_FILES.concat(READ_ONLY).sort());
});
test('ASCII only, every 069 file and the dry-run builder', () => {
  for (const f of FILES.concat(['tools/build-069-dryruns.mjs'])) {
    const bad = [...read(f)].filter((c) => c.charCodeAt(0) > 127);
    assert.deepStrictEqual(bad, [], f);
  }
});
test('each writing file is ONE DO block; the verify files write nothing', () => {
  for (const f of DO_FILES) assert.strictEqual((read(f).match(/^DO \$/gm) || []).length, 1, f);
  for (const f of READ_ONLY) {
    const sql = read(f).replace(/--[^\n]*/g, '');
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|GRANT|REVOKE|TRUNCATE)\b/i, f);
    assert.doesNotMatch(sql, /^DO \$/m, f);
  }
});
test('the dry runs are regenerated from their sources (node worker/migrations/drafts/tools/build-069-dryruns.mjs)', async () => {
  const { PAIRS, buildDryRun } = await import(path.join(DRAFTS, 'tools/build-069-dryruns.mjs'));
  assert.strictEqual(PAIRS.length, 2);
  for (const p of PAIRS) assert.strictEqual(read(p.target), buildDryRun(read(p.source), p), p.target + ' drifted');
});

test('md5 chain: repo 028 without comments = the live text 069 guards; 069\'s substitutions give the text everyone else guards on', () => {
  const f028 = fs.readFileSync(path.join(ROOT, 'worker/migrations/028_order_dates_follow.sql'), 'utf8');
  const a = f028.indexOf('as $$') + 5;
  const live = f028.slice(a, f028.indexOf('$$;', a)).split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  const src = read('069_hub_day_once.sql');
  assert.ok(src.includes(`md5(old_src) <> '${md5(live)}'`), `069 must guard on the live 028 text md5 ${md5(live)}`);
  assert.strictEqual(md5(live), 'e977a5a31a3cd2dce85dae6e39b0764f');
  const C = Object.fromEntries(['a_old', 'a_new', 'b_old', 'b_new'].map((n) => [n, sqlConst(src, n)]));
  assert.strictEqual(live.split(C.a_old).length - 1, 1, 'a_old once in the live text');
  assert.strictEqual(live.split(C.b_old).length - 1, 1, 'b_old once in the live text');
  const next = live.split(C.a_old).join(C.a_new).split(C.b_old).join(C.b_new);
  const NEW = md5(next);
  assert.ok(src.includes(`md5(new_src) <> '${NEW}'`), `069 must prove the generated text md5 ${NEW}`);
  for (const f of ['069_hub_day_once_rollback.sql', '069_hub_day_once_test.sql', '069_hub_day_once_verify.sql', '069_hub_day_once_repair.sql'])
    assert.ok(read(f).includes(`'${NEW}'`), `${f} must guard on the 069 text md5 ${NEW}`);
  // the rollback undoes exactly 069's substitutions
  const rb = read('069_hub_day_once_rollback.sql');
  for (const n of ['a_old', 'a_new', 'b_old', 'b_new']) assert.strictEqual(sqlConst(rb, n), C[n], `rollback ${n} = 069 ${n}`);
  assert.strictEqual(next.split(C.a_new).join(C.a_old).split(C.b_new).join(C.b_old), live);
  assert.ok(rb.includes(`'${md5(live)}'`));
  // the two changes say what the plan says
  assert.match(C.b_new, /old\.cross_dock_date is not distinct from new\.cross_dock_date/);
  assert.match(C.a_new, /s\.stop_type is distinct from 'Cross-dock' or new\.cross_dock_date is null/);
});

test('the new triggers fire on what the plan says (cross-dock set and changed; a stop\'s day changed) and are born closed', () => {
  const src = read('069_hub_day_once.sql');
  assert.match(src, /AFTER UPDATE OF cross_dock_date ON public\.orders\s+FOR EACH ROW WHEN \(old\.cross_dock_date IS DISTINCT FROM new\.cross_dock_date AND new\.cross_dock_date IS NOT NULL\)/);
  assert.match(src, /AFTER UPDATE OF datetime ON public\.order_stops\s+FOR EACH ROW WHEN \(old\.datetime IS DISTINCT FROM new\.datetime/);
  assert.match(src, /k := 'STOP:' \|\| new\.legacy_id;/, 'the Ramp link is the stop\'s facade id, never its primary key');
  assert.match(src, /REVOKE ALL ON FUNCTION public\.order_cd_stop_follow\(\), public\.ramp_follows_stop\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(src, /IF NOT EXISTS \(SELECT 1 FROM monitoring\.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL\)/);
  assert.match(src, /IF trg_after <> trg_before \+ 2 THEN/);
});
test('the repair touches only the 7 measured orders and refuses any other', () => {
  const src = read('069_hub_day_once_repair.sql');
  assert.match(src, /measured CONSTANT bigint\[\] := ARRAY\[318, 341, 388, 409, 418, 460, 467\]::bigint\[\];/);
  assert.match(src, /are NOT among the 7 measured - stop/);
  assert.match(src, /WHERE id = r\.oid AND cross_dock_date IS NOT DISTINCT FROM r\.old_cd;/, 'each write conditional on the value read');
});
