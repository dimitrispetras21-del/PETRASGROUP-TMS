// The 065 dry run (worker/migrations/drafts/065_temp_per_cmr_dryrun.sql) is GENERATED from 065 - same idea as the
// 060/063 pairs: a hand-edited or stale copy would «prove» statements the owner will never run (principle 3). Its
// behaviour on a production-shaped database (3 OK, nothing kept, the guards speaking with their own messages, the
// rollback giving back grants and comments, all as a NOSUPERUSER owner too) needs orders_with_derived as 057 left
// it, which this fixture does not have; what IS proved here is the shape, at build time (principle 6).
// Second test: 065, its dry run, its rollback and its verify file each carry the SAME facts - the md5 of
// orders_with_derived before (the 057 text) and after 065, and the ONE line 065 appends to the view. Four copies of
// one fact drift the first time one file is edited (principle 3); a stale copy would surface only on the evening as
// «065 rollback: the view text without the flag is not the 057 text» - here it fails at build time instead.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { buildDryRun, SOURCE, TARGET, DRAFTS, OWD_MD5_AFTER } from '../../worker/migrations/drafts/tools/build-065-dryrun.mjs';

const OPEN = '\nDO $do$\n';
const CLOSE = '\nEND $do$;\n';
const nonAscii = (s) => [...s].filter((c) => c.charCodeAt(0) > 127);
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');
const MD5_BEFORE = '4f82b738847c4770ccc379b1d558d542';   // orders_with_derived as 057 left it (5/10)
const count = (s, sub) => s.split(sub).length - 1;

test('065 dry run is regenerated from 065, never hand-edited (run: node worker/migrations/drafts/tools/build-065-dryrun.mjs)', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const dry = fs.readFileSync(TARGET, 'utf8');
  assert.equal(dry, buildDryRun(src));
  // 065 itself: ONE DO block, ASCII only (the owner pastes it from a clipboard that has mangled Greek before)
  assert.equal((src.match(/^DO \$/gm) || []).length, 1, '065 must stay ONE DO block');
  assert.deepEqual(nonAscii(src), [], '065 must stay ASCII');
  const body = src.slice(src.indexOf(OPEN) + OPEN.length, src.lastIndexOf(CLOSE));
  assert.ok(dry.includes(body + '\nEND;\n'), 'the dry run must hold 065\'s block unchanged');
  assert.equal((dry.match(/^DO \$/gm) || []).length, 1, 'exactly ONE DO block');
  assert.deepEqual(nonAscii(dry), [], 'the dry run is ASCII');
  const tail = dry.slice(dry.lastIndexOf('RAISE EXCEPTION'));
  assert.match(tail, /^RAISE EXCEPTION 'DRY RUN 065 finished - EVERYTHING UNDONE, nothing kept\. Result: % OK, % FAIL {2}\|\| {2}%', ok, bad, array_to_string\(res, ' {2}\| {2}'\);\nEND\n\$dry\$;\n$/);
  const added = dry.replace(body, '');
  for (const s of ['A', 'B', 'C']) assert.ok(added.includes(`EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('${s} ERROR ' || SQLERRM);`), `scenario ${s}`);
  // B-54: a column adds no trigger. 065 asserts 35 = live count = B-54 before, unchanged after, and never writes it.
  assert.match(body, /IF trg_before <> 35 OR b54_before IS DISTINCT FROM 35 OR b54_baseline IS NOT NULL THEN/);
  assert.match(body, /IF trg_after <> trg_before OR NOT EXISTS \(SELECT 1 FROM monitoring\.checks WHERE id = 'B-54' AND red_value = trg_after\)/);
  assert.doesNotMatch(body, /UPDATE monitoring\.checks/, '065 must not write any auditor row');
  assert.ok(added.includes('dry_n = dry_trg_before AND'), 'scenario B must check the unchanged count');
  // lock_timeout before the first ALTER: behind an idle transaction the app would queue on orders
  assert.ok(body.indexOf("set_config('lock_timeout', '5s', true)") < body.indexOf('ALTER TABLE public.orders'), 'lock_timeout first');
  // the C fingerprint drops the ONE new key: every value that existed before must be identical after
  assert.equal(count(added, "(to_jsonb(x) - 'temp_per_cmr')::text"), 4, 'orders + orders_with_derived, before and after');
});

test('the 065 builder refuses a 065 it does not understand (loud, never a silent wrong copy)', () => {
  assert.throws(() => buildDryRun('select 1;'), /not found/);
  assert.throws(() => buildDryRun('x\nDO $do$\nDECLARE\nBEGIN PERFORM 1; -- $dry$\nEND $do$;\n'), /choose other tags/);
});

test('065, rollback, verify: ASCII, one DO block each, and the same md5s and the same appended line everywhere', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const dry = fs.readFileSync(TARGET, 'utf8');
  const rb = read('065_temp_per_cmr_rollback.sql');
  const vf = read('065_temp_per_cmr_verify.sql');
  assert.deepEqual(nonAscii(rb), [], 'rollback must stay ASCII');
  assert.deepEqual(nonAscii(vf), [], 'verify must stay ASCII');
  assert.equal((rb.match(/^DO \$/gm) || []).length, 1, 'rollback must stay ONE DO block');
  assert.equal((vf.match(/^DO \$/gm) || []).length, 0, 'verify is SELECT only');
  // comments and string literals out ('UPDATE' is a privilege name in has_column_privilege), then no write verb
  assert.doesNotMatch(vf.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''"), /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|TRUNCATE)\b/i, 'verify writes nothing');
  // before = the 057 text: 065 guards on it, the rollback proves it gave it back, verify V0 shows it
  assert.ok(src.includes(`IF md5(old_view) <> '${MD5_BEFORE}' THEN`), '065 guard');
  assert.equal(count(rb, `'${MD5_BEFORE}'`), 2, 'rollback: the text it rebuilds and the text it proves');
  assert.ok(vf.includes(MD5_BEFORE), 'verify V0');
  // after = 065's text: named in 065's header, checked by the dry run, guarded by the rollback, shown by V1
  assert.ok(src.includes(`After 065: orders_with_derived md5 ${OWD_MD5_AFTER}`), '065 header');
  assert.ok(dry.includes(`= '${OWD_MD5_AFTER}' THEN`), 'dry run scenario A');
  assert.ok(rb.includes(`IF md5(cur_view) <> '${OWD_MD5_AFTER}' THEN`), 'rollback guard');
  assert.ok(vf.includes(`= '${OWD_MD5_AFTER}' AS view_text_ok`), 'verify V1');
  // the ONE appended line, the same two strings in 065 and in its rollback
  const anchors = (s) => [s.match(/anchor_old text := (E'[^']*');/)?.[1], s.match(/anchor_new text := (E'[^']*');/)?.[1]];
  assert.deepEqual(anchors(rb), anchors(src));
  assert.deepEqual(anchors(src), [String.raw`E' AS stock_lot_reference\n   FROM '`, String.raw`E' AS stock_lot_reference,\n    o.temp_per_cmr\n   FROM '`]);
  // the column itself: NOT NULL with a constant default - the facade drops NULL columns (trap 2), so a
  // nullable flag would read «absent» on every old order
  assert.ok(src.includes('ALTER TABLE public.orders ADD COLUMN temp_per_cmr boolean NOT NULL DEFAULT false;'));
});
