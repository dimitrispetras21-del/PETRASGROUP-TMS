// The 065 dry run (worker/migrations/drafts/065_temp_per_cmr_dryrun.sql) is GENERATED from 065 - same idea as the
// 060/063 pairs: a hand-edited or stale copy would «prove» statements the owner will never run (principle 3). Its
// behaviour on a production-shaped database (3 OK, nothing kept, the guards speaking with their own messages, the
// rollback giving back grants and comments, all as a NOSUPERUSER owner too) needs orders_with_derived as 057 left
// it, which this fixture does not have; what IS proved here is the shape, at build time (principle 6).
// Second test: 065, its dry run, its rollback and its verify file each carry the SAME facts - the md5 of
// orders_with_derived before (the 057 text) and after 065, and the ONE line 065 appends to the view. Four copies of
// one fact drift the first time one file is edited (principle 3); a stale copy would surface only on the evening as
// «065 rollback: the view text without the flag is not the 057 text» - here it fails at build time instead.
// Third test (reviewer F1, 7/10): Supabase's default privileges give every NEW view ALL for anon, authenticated
// and service_role, so a rollback that re-creates orders_with_derived must REVOKE right after the CREATE and only
// then grant back what was there (as 060's rollback does) - without it the rollback's own ACL proof refuses on
// production and 065 cannot be reversed. The PGlite harness proves the behaviour; this pins the statement.
// Fourth test (reviewer F2, coordinator 7/10, principle 4): 065 also teaches 020's order_parent_to_legs to copy
// the flag to split legs. The edit strings and the md5s of the function and its trigger (before = 020 as read on
// production 4/10, after = 065) live in 065, its dry run, its rollback and verify - one fact, four copies.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { buildDryRun, SOURCE, TARGET, DRAFTS, OWD_MD5_AFTER, FN_MD5_AFTER, TRG_MD5_AFTER } from '../../worker/migrations/drafts/tools/build-065-dryrun.mjs';

const OPEN = '\nDO $do$\n';
const CLOSE = '\nEND $do$;\n';
const nonAscii = (s) => [...s].filter((c) => c.charCodeAt(0) > 127);
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');
const MD5_BEFORE = '4f82b738847c4770ccc379b1d558d542';   // orders_with_derived as 057 left it (5/10)
const FN_MD5_020 = 'b1f552325162375855244a4161685fdc';   // order_parent_to_legs as 020 left it (production 4/10)
const TRG_MD5_020 = 'a0ce809945f493872557b6e1a08001a3';  // its trigger, same read
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
  for (const s of ['A', 'B', 'C', 'D']) assert.ok(added.includes(`EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('${s} ERROR ' || SQLERRM);`), `scenario ${s}`);
  // B-54: a column adds no trigger and the leg-sync trigger is re-created under its own name. 065 asserts 35 =
  // live count = B-54 before, still exactly 35 after, and never writes it.
  assert.match(body, /IF trg_before <> 35 OR b54_before IS DISTINCT FROM 35 OR b54_baseline IS NOT NULL THEN/);
  assert.match(body, /IF trg_after <> 35 OR trg_after <> trg_before OR NOT EXISTS \(SELECT 1 FROM monitoring\.checks WHERE id = 'B-54' AND red_value = trg_after\)/);
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

test('065 rollback revokes Supabase\'s default privileges right after re-creating the view, before giving grants back (F1)', () => {
  const rb = read('065_temp_per_cmr_rollback.sql');
  const block = rb.slice(rb.indexOf('\nDO $do$\n'), rb.lastIndexOf('\nEND $do$;\n'));
  assert.ok(block.includes(`  DROP VIEW public.orders_with_derived;
  EXECUTE 'CREATE VIEW public.orders_with_derived AS ' || old_view;
  REVOKE ALL ON public.orders_with_derived FROM PUBLIC, anon, authenticated, service_role;
  FOREACH stmt IN ARRAY give_back LOOP`), 'REVOKE ALL from PUBLIC, anon, authenticated, service_role directly after CREATE VIEW, before give_back');
  assert.equal(count(block, 'REVOKE ALL ON public.orders_with_derived FROM PUBLIC, anon, authenticated, service_role;'), 1);
  // 065 itself never re-creates the view: CREATE OR REPLACE keeps the ACL (default privileges apply to new objects only)
  const src = fs.readFileSync(SOURCE, 'utf8');
  assert.doesNotMatch(src.replace(/--.*$/gm, ''), /DROP VIEW|CREATE VIEW public\.orders_with_derived/);
});

test('065 extends 020\'s leg sync: same edit strings, same md5s in 065, dry run, rollback and verify (F2)', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const dry = fs.readFileSync(TARGET, 'utf8');
  const rb = read('065_temp_per_cmr_rollback.sql');
  const vf = read('065_temp_per_cmr_verify.sql');
  const strs = (s) => ['fn_set_old', 'fn_set_new', 'fn_dif_old', 'fn_dif_new', 'trg_col_old', 'trg_col_new']
    .map((k) => s.match(new RegExp(`  ${k} text := ('[^']*');`))?.[1]);
  assert.deepEqual(strs(rb), strs(src), 'the rollback undoes exactly what 065 adds');
  assert.deepEqual(strs(src), [
    "'temperature_c = new.temperature_c,'", "'temperature_c = new.temperature_c, temp_per_cmr = new.temp_per_cmr,'",
    "'temperature_c is distinct from new.temperature_c or '",
    "'temperature_c is distinct from new.temperature_c or temp_per_cmr is distinct from new.temp_per_cmr or '",
    "'temperature_c, pallet_type,'", "'temperature_c, temp_per_cmr, pallet_type,'"]);
  // before = 020 (production 4/10): 065 guards on it, the rollback proves it gave it back, V0 shows it
  assert.ok(src.includes(`IF md5(old_fn) <> '${FN_MD5_020}' THEN`) && src.includes(`IF md5(old_trg) <> '${TRG_MD5_020}'`), '065 guards');
  assert.ok(rb.includes(`IF md5(old_fn) <> '${FN_MD5_020}' THEN`) && rb.includes(`md5(pg_get_functiondef(fn_oid)) <> '${FN_MD5_020}'`), 'rollback: function');
  assert.ok(rb.includes(`IF md5(old_trg) <> '${TRG_MD5_020}' THEN`) && rb.includes(`md5(pg_get_triggerdef(t.oid)) = '${TRG_MD5_020}'`), 'rollback: trigger');
  assert.ok(vf.includes(`legs_fn_md5 ${FN_MD5_020}`) && vf.includes(TRG_MD5_020), 'verify V0');
  // after = 065: 065's header, the dry run's scenario D, the rollback's guards, V1
  assert.ok(src.includes(`order_parent_to_legs\n-- md5 ${FN_MD5_AFTER}; its trigger md5 ${TRG_MD5_AFTER}.`), '065 header');
  assert.ok(dry.includes(`= '${FN_MD5_AFTER}'`) && dry.includes(`= '${TRG_MD5_AFTER}' THEN`), 'dry run scenario D');
  assert.ok(rb.includes(`IF md5(cur_fn) <> '${FN_MD5_AFTER}' THEN`) && rb.includes(`IF md5(cur_trg) <> '${TRG_MD5_AFTER}'`), 'rollback guards');
  assert.ok(vf.includes(`= '${FN_MD5_AFTER}' AS legs_fn_ok`) && vf.includes(`= '${TRG_MD5_AFTER}' AS legs_trg_ok`), 'verify V1');
  // order inside the blocks: 065 adds the column BEFORE the trigger names it; the rollback restores 020's
  // function and trigger BEFORE it drops the column (a trigger's UPDATE OF list depends on the column)
  const at = (s, x) => { const i = s.indexOf(x); assert.ok(i >= 0, x); return i; };
  assert.ok(at(src, 'ALTER TABLE public.orders ADD COLUMN temp_per_cmr') < at(src, '  EXECUTE new_fn;') && at(src, '  EXECUTE new_fn;') < at(src, '  DROP TRIGGER order_parent_to_legs ON public.orders;\n  EXECUTE new_trg;'));
  assert.ok(at(rb, '  EXECUTE old_fn;\n  DROP TRIGGER order_parent_to_legs ON public.orders;\n  EXECUTE old_trg;') < at(rb, 'ALTER TABLE public.orders DROP COLUMN temp_per_cmr;'));
  // CREATE OR REPLACE keeps the function's oid, owner and grants: neither file ever drops it
  for (const f of [src, rb]) assert.doesNotMatch(f.replace(/--.*$/gm, ''), /DROP FUNCTION/);
});
