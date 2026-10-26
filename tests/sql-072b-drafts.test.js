// tests/sql-072b-drafts.test.js - run: node --test tests/sql-072b-drafts.test.js
// (Task B1 moved it here from docs/national-v5/handover/tests/, git mv.)
// The 072b drafts (national v5 vehicle handover) at build time, plain node, no database (principle 6):
//   - the six files and the builder are there; ASCII only; the writing files are ONE DO block; verify and
//     fingerprint write nothing; the dry run and the rollback are regenerated, never hand-edited;
//   - every function 072b relies on is guarded in PART 0; each one it does NOT change is proved again in PART 9 and
//     counted in the verify; each hooked one has its PART 0 md5 as the hook's "before" (one list, never two);
//   - the 18 hooks in 10 functions, ordered by k: the first hook of a function starts from 072's text (PART 0), each
//     next one from the text the one before it left (a chain), the last one's text is the verify's; the rollback
//     holds the same texts (generated) and undoes them in reverse order;
//   - born closed: every function 072b creates is in the REVOKE, only the three acts get EXECUTE, the builder's
//     drop list = the functions the source creates; the table has RLS and exactly ONE policy, monitor_read, SELECT
//     for the two auditor roles only (review R1 finding 4);
//   - every plan: code 072b raises or returns has a case in the rules test; every con: of the rules test is a
//     CHECK of 072b; the eight reasons are the spec's; Greek only as base64 that decodes;
//   - the order 072 -> 072b -> 073 is guarded both ways (073 present = stop, here and in the rollback);
//   - the hook diff the code review reads (build-072b.mjs --hooks, review R2 DB finding 7) covers the eighteen hooks;
//   - the auditor checks B-91..B-93 sit OUTSIDE the catalog until 073b (tms-auditor/checks-072b/, review R4 finding 1).
// The rules themselves are proven on PGlite (tms-auditor/test/plan-072b.test.mjs).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'worker/migrations/drafts');   // until the owner runs 072b (then: worker/migrations)
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const noStrings = (s) => strip(s).replace(/'[^']*'/g, "''");
const SRC = '072b_plan_vehicle_segments.sql';
const DO_FILES = [SRC, '072b_plan_vehicle_segments_dryrun.sql', '072b_plan_vehicle_segments_test.sql',
  '072b_plan_vehicle_segments_rollback.sql'];
const READ_ONLY = ['072b_plan_vehicle_segments_verify.sql', '072b_plan_vehicle_segments_fingerprint.sql'];
const BUILDER = path.join(DIR, 'tools/build-072b.mjs');
const REASONS = ['vehicle_breakdown', 'reefer_breakdown', 'accident', 'driver_hours', 'driver_unavailable',
  'planned_driver', 'planned_truck', 'other'];
const pairsOf = (s) => [...s.matchAll(/\('(public\.[^']+)', '([0-9a-f]{32})'\)/g)].map((m) => `${m[1]}=${m[2]}`);
const part = (s, a, b) => s.slice(s.indexOf(a), b ? s.indexOf(b) : undefined);

test('the files are there, ASCII only, one DO block per writing file, read-only files write nothing', () => {
  for (const f of [...DO_FILES, ...READ_ONLY]) {
    const s = read(f);
    assert.ok(!/[^\x00-\x7F]/.test(s), `${f} has a non-ASCII character`);
  }
  for (const f of DO_FILES) {
    const n = (strip(read(f)).match(/^DO \$/gm) || []).length;
    assert.strictEqual(n, 1, `${f}: ${n} DO blocks`);
  }
  for (const f of READ_ONLY) {
    assert.ok(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/i.test(noStrings(read(f))), `${f} writes`);
  }
  assert.ok(fs.existsSync(BUILDER));
});

test('the dry run and the rollback are what the builder makes of the source (never hand-edited)', () => {
  execFileSync(process.execPath, [BUILDER, '--check'], { stdio: 'pipe' });
});

test('guards: PART 0 holds every relied-on function; the unchanged ones again in PART 9 and the verify; hooks match', () => {
  const src = read(SRC);
  const p0 = pairsOf(part(src, '===== PART 0', '===== PART 1'));
  const p9 = pairsOf(part(src, '===== PART 9', 'END $do$;'));
  const hooks = [...part(src, '===== PART 6', '===== PART 7').matchAll(/\((\d+), '(public\.[^']+)', h_\w+, h_\w+,\n\s+'([0-9a-f]{32})', '([0-9a-f]{32})'\)/g)]
    .map((m) => ({ k: Number(m[1]), sig: m[2], before: m[3], after: m[4] }));
  assert.strictEqual(p0.length, 47, 'PART 0: 22 of 072 + 25 of 072 (15 relied on + 10 hooked)');
  assert.strictEqual(hooks.length, 18, 'eighteen hooks');
  assert.deepStrictEqual(hooks.map((h) => h.k), Array.from({ length: 18 }, (_, i) => i + 1), 'k = 1..18 in order');
  const fns = [...new Set(hooks.map((h) => h.sig))];
  assert.strictEqual(fns.length, 10, 'ten hooked functions');
  assert.strictEqual(new Set(p0).size, p0.length, 'no pair twice in PART 0');
  const last = {};
  for (const h of hooks) {
    // the chain: the first hook of a function starts from PART 0's text, every next one from the one before it
    if (!(h.sig in last)) assert.ok(p0.includes(`${h.sig}=${h.before}`), `${h.sig} hook ${h.k}: its before = PART 0`);
    else assert.strictEqual(h.before, last[h.sig], `${h.sig} hook ${h.k}: its before = the after of the hook before it`);
    assert.notStrictEqual(h.before, h.after);
    last[h.sig] = h.after;
  }
  for (const f of fns) assert.ok(!p9.some((x) => x.startsWith(f + '=')), `${f} is hooked: proved by the hook loop, not PART 9`);
  const unchanged = p0.filter((x) => !fns.some((f) => x.startsWith(f + '=')));
  assert.deepStrictEqual(p9, unchanged, 'PART 9 = PART 0 minus the hooked, same order');
  const verify = read('072b_plan_vehicle_segments_verify.sql');
  for (const x of unchanged) assert.ok(pairsOf(verify).includes(x), `verify counts ${x}`);
  for (const f of fns) assert.ok(pairsOf(verify).includes(`${f}=${last[f]}`), `verify knows ${f} at its final text`);
  const rb = read('072b_plan_vehicle_segments_rollback.sql');
  assert.match(rb, /\) v\(k, sig, a, b, m0, m1\) ORDER BY k DESC LOOP/, 'the rollback undoes the hooks last first');
  // the 22 of 072 are all among them: 072b changes none of 072's guarded functions
  // 072 was executed 26/10 and left drafts/ (PR #91); a missing 072 is a failure, never a skipped check (principle 1)
  const f072 = [path.join(DIR, '..', '072_plan_functions.sql'), path.join(DIR, '072_plan_functions.sql')].find((f) => fs.existsSync(f));
  assert.ok(f072, '072_plan_functions.sql is in worker/migrations/ (or drafts/)');
  const g072 = pairsOf(part(fs.readFileSync(f072, 'utf8'), '0. GUARDS', '1. HELPERS'));
  assert.ok(g072.length >= 22, `072's guard list read (${g072.length} pairs)`);
  for (const x of g072) assert.ok(unchanged.includes(x), `072's ${x} is guarded and unchanged by 072b`);
});

test('born closed: every created function revoked, EXECUTE only on the three acts; the drop list = the created', async () => {
  const src = read(SRC);
  const created = [...src.matchAll(/CREATE FUNCTION (public\.\w+)\(([^)]*)\)/g)].map((m) => m[1]);
  assert.strictEqual(created.length, 25);
  const revoke = /REVOKE ALL ON FUNCTION ([\s\S]*?)\n\s+FROM PUBLIC, anon, authenticated, service_role;/.exec(src);
  assert.ok(revoke, 'one REVOKE over the functions');
  for (const f of created) assert.ok(revoke[1].includes(f + '('), `${f} is revoked`);
  const grant = /GRANT EXECUTE ON FUNCTION ([\s\S]*?) TO service_role;/.exec(src);
  assert.deepStrictEqual([...grant[1].matchAll(/public\.(\w+)\(/g)].map((m) => m[1]).sort(),
    ['plan_seg_change', 'plan_seg_fix', 'plan_seg_remove']);
  assert.match(src, /ALTER TABLE public\.rt_vehicle_segments ENABLE ROW LEVEL SECURITY;/);
  // ONE policy, for the auditor only (review R1 finding 4, the rule of D-14): never for an API role
  const pols = strip(src).match(/CREATE POLICY[^;]*;/g) || [];
  assert.deepStrictEqual(pols, ['CREATE POLICY monitor_read ON public.rt_vehicle_segments FOR SELECT TO tms_check_runner, tms_reader USING (true);']);
  assert.match(src, /GRANT SELECT ON public\.rt_vehicle_segments, public\.v_rt_segments, public\.v_rt_vehicle_windows\n\s+TO service_role, tms_reader, tms_check_runner;/);
  const { CREATED } = await import(BUILDER);
  assert.deepStrictEqual(CREATED.map((s) => s.split('(')[0]).sort(), created.slice().sort(), 'rollback drops exactly these');
  for (const s of CREATED) assert.ok(read('072b_plan_vehicle_segments_rollback.sql').includes(`'${s}'`));
});

test('the order 072 -> 072b -> 073 is guarded in the migration and in the rollback', () => {
  assert.match(read(SRC), /proname = 'plan_h_pallet_sync'\) THEN\n\s+RAISE EXCEPTION '072b: 073 is applied/);
  assert.match(read('072b_plan_vehicle_segments_rollback.sql'), /proname = 'plan_h_pallet_sync'\) THEN\n\s+RAISE EXCEPTION '072b rollback: 073 is applied/);
  assert.match(read(SRC), /v5 row\(s\) exist - the EXCLUDE move needs 0 v5 cycles/);
});

test('every plan: code of 072b has a case; every con: of the rules test is a CHECK of 072b; the eight reasons', () => {
  const src = read(SRC);
  const tst = read('072b_plan_vehicle_segments_test.sql');
  const raised = new Set([...src.matchAll(/plan_h_raise\('([a-z_]+)'/g)].map((m) => m[1]));
  for (const m of src.matchAll(/(?:return|prob :=) '([a-z_]+):/g)) raised.add(m[1]);
  raised.add('hard_delete');
  const wants = [...tst.matchAll(/^\s+, '(plan|con):([a-z_0-9]+)'/gm)].map((m) => [m[1], m[2]]);
  const planWanted = new Set(wants.filter((w) => w[0] === 'plan').map((w) => w[1]));
  for (const c of raised) assert.ok(planWanted.has(c), `plan:${c} has no case in the rules test`);
  const checks = new Set([...src.matchAll(/CONSTRAINT (\w+) CHECK/g)].map((m) => m[1]));
  for (const [kind, c] of wants) if (kind === 'con') assert.ok(checks.has(c), `con:${c} is not a CHECK of 072b`);
  const list = /CONSTRAINT seg_reason_list CHECK \(reason IS NULL OR reason IN \(([\s\S]*?)\)\)/.exec(src);
  assert.deepStrictEqual([...list[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), REASONS);
  // R-8: the label is derived (v_rt_segments), never a column of the table
  const table = /CREATE TABLE public\.rt_vehicle_segments \(([\s\S]*?)\n  \);/.exec(src);
  assert.ok(table && !/\blabel\b/.test(strip(table[1])), 'no label column on rt_vehicle_segments');
  // R-16: the two codes 067 uses for the same events are in 067's delay CHECK too (one fault, one code)
  // code review xhigh 26/10: one place only (the old fallback reached above the checkout, from docs/ before B1)
  const f067 = path.join(DIR, '..', '067_stop_delay_reason.sql');
  assert.ok(fs.existsSync(f067), '067_stop_delay_reason.sql not found (it is live since 24/10: worker/migrations/)');
  for (const c of ['vehicle_breakdown', 'driver_hours']) assert.ok(fs.readFileSync(f067, 'utf8').includes(`'${c}'`), `067 has ${c}`);
  const n = (tst.match(/^\s+, '(?:ok|plan:[a-z_]+|con:[a-z_]+|state:\w+)'\s+-- \d+ /gm) || []).length;
  assert.ok(n >= 60, `${n} cases`);
});

test('the hook diff (--hooks, read by the code review of Task B4): eighteen hooks, each puts a 072b line in', async () => {
  const { hookDiffs } = await import(BUILDER);
  const h = hookDiffs(read(SRC));
  assert.deepStrictEqual(h.map((x) => x.k), Array.from({ length: 18 }, (_, i) => i + 1));
  for (const x of h) {
    assert.ok(x.diff.some((l) => l.startsWith('+ ') && /072b/.test(l)), `hook ${x.k}: no "072b" line put in`);
    assert.ok(x.diff.length > 0);
  }
  const out = execFileSync(process.execPath, [BUILDER, '--hooks'], { encoding: 'utf8' });
  assert.strictEqual((out.match(/^=== hook \d+ /gm) || []).length, 18);
});

// Review R4 (finding 1): B-91..B-93 enter the catalog only with 073b (its seed, fixture and grants know
// rt_vehicle_segments). In tms-auditor/checks/ now, every seeded tms-auditor test and the catalog test would go red.
test('the auditor checks of 072b are not in the catalog yet (tms-auditor/checks-072b/ until 073b)', () => {
  const cat = path.join(ROOT, 'tms-auditor/checks');
  // after Task B1 the catalog is always there: a missing folder is a failure, never a silent pass (principle 1)
  assert.ok(fs.existsSync(cat), 'tms-auditor/checks/ exists');
  for (const id of ['B-91', 'B-92', 'B-93']) assert.ok(!fs.existsSync(path.join(cat, `${id}.sql`)), `${id} is in tms-auditor/checks/ before 073b`);
  const own = path.join(ROOT, 'tms-auditor/checks-072b');
  assert.deepStrictEqual(fs.existsSync(own) && fs.readdirSync(own).sort(), ['B-91.sql', 'B-92.sql', 'B-93.sql'], 'tms-auditor/checks-072b/ holds B-91..B-93');
});

test('Greek only as base64 that decodes to Greek; the notice template takes three %s', () => {
  const src = read(SRC);
  const b64 = [...src.matchAll(/'([A-Za-z0-9+/]{40,}={0,2})'/g)].map((m) => Buffer.from(m[1], 'base64').toString('utf8'));
  assert.ok(b64.length >= 2);
  for (const t of b64) assert.match(t, /[Ͱ-Ͽ]/, 'decodes to Greek');
  assert.ok(b64.some((t) => (t.match(/%s/g) || []).length === 3), 'costs notice: RT code, count, plate');
});
