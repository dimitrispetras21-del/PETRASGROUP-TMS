// The 063 dry run (worker/migrations/drafts/063_local_line_guard_dryrun.sql) is GENERATED from 063 - same idea as
// the 060 pair (dryrun-060.test.mjs): a hand-edited or stale copy would «prove» statements the owner will never run
// (principle 3). Its behaviour on a production-shaped database (3 OK, nothing kept, the guards speaking with their
// own messages) needs 060's functions at their 6/10 text, which this fixture does not have; what IS proved here is
// the shape, at build time (principle 6).
// Second test: 063 and its rollback carry md5 fingerprints of function TEXTS (060's guard and sync, 063's guard and
// sync). Those texts live in the files themselves, so a fingerprint left stale after an edit would surface only on
// the evening as «063: dl_local_line_guard is not the 060 text» or «063 rollback: ... edited by hand» - here it fails
// at build time instead.
// Third test: 063 re-creates dl_local_day_sync from 060's text with exactly three additions (the flag around its
// relabel). The first draft stored the flag on the function (ALTER FUNCTION ... SET), which needs superuser and so
// fails in the SQL editor (postgres is rolsuper = false; review 6/10). Pinned here, at build time (principle 6).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildDryRun, SOURCE, TARGET, DRAFTS } from '../../worker/migrations/drafts/tools/build-063-dryrun.mjs';

const OPEN = '\nDO $do$\n';
const CLOSE = '\nEND $do$;\n';
const nonAscii = (s) => [...s].filter((c) => c.charCodeAt(0) > 127);
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
// prosrc of a plpgsql function = the text between «AS $f$» and the closing «$f$», byte for byte
const fnBody = (src, head) => {
  const i = src.indexOf(head);
  assert.ok(i >= 0, `${head} not found`);
  const a = src.indexOf('AS $f$', i) + 'AS $f$'.length;
  return src.slice(a, src.indexOf('$f$', a));
};

test('063 dry run is regenerated from 063, never hand-edited (run: node worker/migrations/drafts/tools/build-063-dryrun.mjs)', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const dry = fs.readFileSync(TARGET, 'utf8');
  assert.equal(dry, buildDryRun(src));
  // 063 itself: ONE DO block, ASCII only (the owner pastes it from a clipboard that has mangled Greek before)
  assert.equal((src.match(/^DO \$/gm) || []).length, 1, '063 must stay ONE DO block');
  assert.deepEqual(nonAscii(src), [], '063 must stay ASCII');
  const body = src.slice(src.indexOf(OPEN) + OPEN.length, src.lastIndexOf(CLOSE));
  assert.ok(dry.includes(body + '\nEND;\n'), 'the dry run must hold 063\'s block unchanged');
  assert.equal((dry.match(/^DO \$/gm) || []).length, 1, 'exactly ONE DO block');
  assert.deepEqual(nonAscii(dry), [], 'the dry run is ASCII');
  const tail = dry.slice(dry.lastIndexOf('RAISE EXCEPTION'));
  assert.match(tail, /^RAISE EXCEPTION 'DRY RUN 063 finished - EVERYTHING UNDONE, nothing kept\. Result: % OK, % FAIL {2}\|\| {2}%', ok, bad, array_to_string\(res, ' {2}\| {2}'\);\nEND\n\$dry\$;\n$/);
  const added = dry.replace(body, '');
  for (const s of ['A', 'B', 'C']) assert.ok(added.includes(`EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('${s} ERROR ' || SQLERRM);`), `scenario ${s}`);
  // B-54: 063 drops and re-creates ONE trigger under the same name - the count must not move and B-54 is never
  // written (counted inside the block, never typed); the dry run checks the same equality on the result.
  assert.match(body, /IF NOT EXISTS \(SELECT 1 FROM monitoring\.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL\)/);
  assert.match(body, /IF trg_after <> trg_before OR NOT EXISTS \(SELECT 1 FROM monitoring\.checks WHERE id = 'B-54' AND red_value = trg_after\)/);
  assert.doesNotMatch(body, /UPDATE monitoring\.checks/, '063 must not write any auditor row');
  assert.ok(added.includes('dry_n = dry_trg_before AND'), 'scenario B must check the unchanged count');
  // the dry run's fingerprint names no 060 column: on a base without 060, 063's own guard must be what speaks
  assert.doesNotMatch(added.slice(0, added.indexOf('-- ===== 063_local_line_guard.sql')), /local_move_id|move_kind/);
  assert.ok(added.includes("'C FAIL data changed during the dry run") && added.includes('wait 5 minutes and run the dry run once more'), 'scenario C FAIL names the retry');
});

test('the 063 builder refuses a 063 it does not understand (loud, never a silent wrong copy)', () => {
  assert.throws(() => buildDryRun('select 1;'), /not found/);
  assert.throws(() => buildDryRun('x\nDO $do$\nDECLARE\nBEGIN PERFORM 1; -- $dry$\nEND $do$;\n'), /choose other tags/);
});

test('063, its rules test and its rollback: ASCII, ONE DO block, md5 fingerprints = the texts they name', () => {
  const s060 = read('060_local_relay.sql');
  const s063 = fs.readFileSync(SOURCE, 'utf8');
  const rb = read('063_local_line_guard_rollback.sql');
  const rt = read('063_local_line_guard_test.sql');
  for (const [name, s] of [['rollback', rb], ['rules test', rt]]) {
    assert.deepEqual(nonAscii(s), [], `063 ${name} must stay ASCII`);
    assert.equal((s.match(/^DO \$/gm) || []).length, 1, `063 ${name} must stay ONE DO block`);
  }
  const guard060 = md5(fnBody(s060, 'CREATE FUNCTION public.dl_local_line_guard()'));
  const sync060 = md5(fnBody(s060, 'CREATE FUNCTION public.dl_local_day_sync('));
  const guard063 = md5(fnBody(s063, 'CREATE OR REPLACE FUNCTION public.dl_local_line_guard()'));
  const sync063 = md5(fnBody(s063, 'CREATE OR REPLACE FUNCTION public.dl_local_day_sync('));
  // 063 refuses unless the live guard / sync are 060's texts, and proves the sync body untouched after
  assert.ok(s063.includes(`IF md5(old_src) <> '${guard060}' THEN`), `063 guard fingerprint is not 060's guard text ${guard060}`);
  assert.equal(s063.split(`'${sync060}'`).length - 1, 2, `063 must check dl_local_day_sync = 060's text ${sync060} before, and 060's text + the additions after`);
  assert.equal(s063.split(`'${sync063}'`).length - 1, 2, `063 proof and result row must name its own sync text ${sync063}`);
  // the rollback refuses unless the live guard is 063's text, puts 060's text back byte for byte, and proves it
  assert.ok(rb.includes(`<> '${guard063}' THEN`), `rollback: 063 guard fingerprint is not ${guard063}`);
  assert.equal(md5(fnBody(rb, 'CREATE OR REPLACE FUNCTION public.dl_local_line_guard()')), guard060, 'rollback must restore 060\'s guard text verbatim');
  assert.ok(rb.includes(`<> '${guard060}' THEN`) && rb.includes(`md5(prosrc) = '${sync060}'`), 'rollback proofs name 060\'s texts');
  assert.ok(rb.includes(`IF md5(sync_src) <> '${sync063}'`), `rollback: 063 sync fingerprint is not ${sync063}`);
  assert.equal(md5(fnBody(rb, 'CREATE OR REPLACE FUNCTION public.dl_local_day_sync(')), sync060, 'rollback must restore 060\'s sync text verbatim');
  // 063's guard = one new first rule + 060's rules verbatim (063 also proves this on the live text)
  const rules060 = fnBody(s060, 'CREATE FUNCTION public.dl_local_line_guard()');
  const rest = rules060.slice(rules060.indexOf('    IF OLD.deleted_at IS NOT NULL'));
  assert.ok(fnBody(s063, 'CREATE OR REPLACE FUNCTION public.dl_local_line_guard()').endsWith(rest), '063 must keep 060\'s two rules verbatim at the end of the guard');
  // one hint for the new rule, in 060's family; the rules test expects exactly that hint
  assert.deepEqual([...new Set([...s063.matchAll(/HINT = 'local_relay:(\w+)'/g)].map((m) => m[1]))].sort(), ['line_has_relay', 'line_locked', 'line_restore']);
  assert.ok(rt.includes("hint = 'local_relay:line_locked'"));
});

test('063 re-creates dl_local_day_sync = 060 + three additions; no superuser-only statement in any 063 file', () => {
  const s060 = read('060_local_relay.sql');
  const s063 = fs.readFileSync(SOURCE, 'utf8');
  // the three additions, read from 063's own DECLARE (the in-database proof strips the same strings)
  const lit = (name) => {
    const h = `  ${name} text := $i$`;
    const a = s063.indexOf(h);
    assert.ok(a >= 0, `${name} not declared`);
    return s063.slice(a + h.length, s063.indexOf('$i$;', a + h.length));
  };
  const adds = ['sync_add_var', 'sync_add_set', 'sync_add_back'].map(lit);
  const body = fnBody(s063, 'CREATE OR REPLACE FUNCTION public.dl_local_day_sync(');
  for (const x of adds) assert.equal(body.split(x).length - 1, 1, `addition must appear once in the sync: ${x.slice(0, 40)}`);
  assert.equal(adds.reduce((t, x) => t.replace(x, ''), body), fnBody(s060, 'CREATE FUNCTION public.dl_local_day_sync('),
    '063 sync minus the three additions must be 060\'s text byte for byte');
  // the statement itself keeps 060's signature, SECURITY DEFINER and search_path (CREATE OR REPLACE resets what it omits)
  assert.ok(s063.includes('  CREATE OR REPLACE FUNCTION public.dl_local_day_sync(p_driver bigint, p_day date) RETURNS void\n    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$'));
  // set 'on' -> the relabel UPDATE -> give back the caller's value; nothing in between can leave the function
  const on = body.indexOf("PERFORM set_config('tms.local_day_sync', 'on', true);");
  const back = body.indexOf("PERFORM set_config('tms.local_day_sync', coalesce(prev_flag, ''), true);");
  assert.ok(on > 0 && back > on, 'flag set before and given back after');
  const between = body.slice(on, back);
  assert.match(between, /UPDATE dl_entries SET local_move_id = anchor, route = route_txt/);
  assert.doesNotMatch(between.replace(/--[^\n]*/g, ''), /\b(RETURN|EXIT|CONTINUE)\b/i, 'no way out between set and give-back');
  assert.equal(body.split("set_config('tms.local_day_sync'").length - 1, 2, 'exactly one set and one give-back');
  // storing a custom setting on a function (ALTER FUNCTION ... SET / RESET) needs superuser: none anywhere
  for (const f of ['063_local_line_guard.sql', '063_local_line_guard_dryrun.sql', '063_local_line_guard_rollback.sql', '063_local_line_guard_test.sql']) {
    assert.doesNotMatch(read(f).replace(/--[^\n]*/g, ''), /ALTER\s+FUNCTION[^;]*\b(SET|RESET)\b/i, `${f}: ALTER FUNCTION SET/RESET needs superuser`);
  }
});
