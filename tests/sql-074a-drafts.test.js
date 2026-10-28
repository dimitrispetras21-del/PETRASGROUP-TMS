// tests/sql-074a-drafts.test.js - run: node --test tests/sql-074a-drafts.test.js
// The 074a drafts (national v5 F5, the reads day L needs) at build time, plain node, no database (principle 6):
//   - the five files and the builder are there; ASCII only; the writing files are ONE DO block; verify writes nothing;
//   - the dry run, the rollback and the verify are what the builder makes of the source (never hand-edited);
//   - every md5 pair of PART 0 is there twice (the guard + the proof of PART 6); the four hooks chain from the live
//     text of 28/10 (= fixtures/live-073b.sql) and the rollback undoes them last first; the verify knows each hooked
//     function at its final text;
//   - born closed: every created function revoked from every API role, EXECUTE to service_role on the Worker's three
//     only; the table RLS on with ONE policy (monitor_read, the two auditor roles); the drop list = the created;
//   - no trigger, no Greek, no day L (that is 074's one constant), no write to plan_config;
//   - every con: of the rules test is a CHECK of 074a.
// The rules themselves are proven on PGlite (tms-auditor/test/plan-074a.test.mjs).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'worker/migrations/drafts');   // 074a is a draft: it leaves drafts/ when the owner runs it
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const noStrings = (s) => strip(s).replace(/'[^']*'/g, "''");
const SRC = '074a_plan_reads.sql';
const DO_FILES = [SRC, '074a_plan_reads_dryrun.sql', '074a_plan_reads_test.sql', '074a_plan_reads_rollback.sql'];
const READ_ONLY = ['074a_plan_reads_verify.sql'];
const BUILDER = path.join(DIR, 'tools/build-074a.mjs');
const LIVE = path.join(ROOT, 'tms-auditor/test/fixtures/live-073b.sql');
const pairsOf = (s) => [...s.matchAll(/\('(public\.[^']+)', '([0-9a-f]{32})'\)/g)].map((m) => `${m[1]}=${m[2]}`);
const part = (s, a, b) => s.slice(s.indexOf(a), b ? s.indexOf(b) : undefined);

test('the files are there, ASCII only, one DO block per writing file, the verify writes nothing', () => {
  for (const f of [...DO_FILES, ...READ_ONLY]) assert.ok(!/[^\x00-\x7F]/.test(read(f)), `${f} has a non-ASCII character`);
  for (const f of DO_FILES) {
    const n = (strip(read(f)).match(/^DO \$/gm) || []).length;
    assert.strictEqual(n, 1, `${f}: ${n} DO blocks`);
  }
  for (const f of READ_ONLY) {
    assert.ok(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/i.test(noStrings(read(f))), `${f} writes`);
  }
  assert.ok(fs.existsSync(BUILDER));
});

test('the dry run, the rollback and the verify are what the builder makes of the source (0 drift)', () => {
  const out = execFileSync(process.execPath, [BUILDER, '--check'], { encoding: 'utf8' });
  assert.match(out, /0 drift/);
});

test('guards: PART 0 = PART 6 (unchanged functions); four hooks chain from the live texts of 28/10', async () => {
  const src = read(SRC);
  const p0 = pairsOf(part(src, '===== PART 0', '===== PART 1'));
  const p6 = pairsOf(part(src, '===== PART 6', 'END $do$;'));
  assert.strictEqual(p0.length, 6);
  assert.deepStrictEqual(p6, p0, 'every guarded pair proved again, same order');
  const { hooks, finalMd5 } = await import(BUILDER);
  const h = hooks(src);
  assert.deepStrictEqual(h.map((x) => x.k), [1, 2, 3, 4]);
  // the live texts, from the production capture (one source with the fixture the PGlite test checks)
  const live = Object.fromEntries([...fs.readFileSync(LIVE, 'utf8').matchAll(/\('fn', '([^']+)', '([0-9a-f]{32})'\)/g)].map((m) => [m[1], m[2]]));
  const last = {};
  for (const x of h) {
    if (!(x.sig in last)) assert.strictEqual(x.m0, live[x.sig], `${x.sig} hook ${x.k} starts from the live text`);
    else assert.strictEqual(x.m0, last[x.sig], `${x.sig} hook ${x.k} starts where the hook before it ended`);
    assert.notStrictEqual(x.m0, x.m1);
    last[x.sig] = x.m1;
  }
  for (const x of p0) assert.strictEqual(x.split('=')[1], live[x.split('=')[0]], `${x} = the production capture`);
  const verify = read('074a_plan_reads_verify.sql');
  for (const f of finalMd5(src)) assert.ok(pairsOf(verify).includes(`${f.sig}=${f.after}`), `verify knows ${f.sig} at its final text`);
  const rb = read('074a_plan_reads_rollback.sql');
  assert.match(rb, /\) v\(k, sig, a, b, m0, m1\) ORDER BY k DESC LOOP/, 'the rollback undoes the hooks last first');
  for (const f of finalMd5(src)) assert.ok(rb.includes(`'${f.before}'`), `the rollback proves ${f.sig} back at ${f.before}`);
  // each hook puts a 074a line in (the reviewer finds every change by "074a (E-")
  const consts = Object.fromEntries([...src.matchAll(/^  (h_\w+) CONSTANT text := \$h\$([\s\S]*?)\$h\$;/gm)].map((m) => [m[1], m[2]]));
  for (const x of h) {
    assert.ok(consts[x.a] && consts[x.b], `hook ${x.k}: its texts are declared`);
    assert.ok(/074a \(E-/.test(consts[x.b]) && !/074a/.test(consts[x.a]), `hook ${x.k}: its new text says 074a, its old one does not`);
  }
});

test('born closed: revoke all, EXECUTE only on the Worker three, RLS + ONE auditor policy; the drop list = the created', async () => {
  const src = read(SRC);
  const created = [...src.matchAll(/CREATE FUNCTION (public\.\w+)\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepStrictEqual(created.slice().sort(), ['public.order_delete_preview', 'public.plan_config_read', 'public.plan_cutover_day', 'public.plan_lookups']);
  const revoke = /REVOKE ALL ON FUNCTION ([\s\S]*?) FROM PUBLIC, anon, authenticated, service_role;/.exec(src);
  for (const f of created) assert.ok(revoke && revoke[1].includes(f + '('), `${f} is revoked`);
  const grant = /GRANT EXECUTE ON FUNCTION ([\s\S]*?)\n\s+TO service_role;/.exec(src);
  assert.deepStrictEqual([...grant[1].matchAll(/public\.(\w+)\(/g)].map((m) => m[1]).sort(), ['order_delete_preview', 'plan_config_read', 'plan_lookups']);
  for (const f of ['plan_config_read', 'plan_lookups', 'order_delete_preview']) {
    assert.match(src, new RegExp(`CREATE FUNCTION public\\.${f}\\([^)]*\\) RETURNS jsonb\\n\\s+LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public`), `${f}: STABLE definer, search_path fixed`);
  }
  assert.match(src, /ALTER TABLE public\.plan_config ENABLE ROW LEVEL SECURITY;/);
  assert.match(src, /REVOKE ALL ON public\.plan_config FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(src, /GRANT SELECT ON public\.plan_config TO service_role, tms_reader, tms_check_runner;/);
  assert.deepStrictEqual(strip(src).match(/CREATE POLICY[^;]*;/g), ['CREATE POLICY monitor_read ON public.plan_config FOR SELECT TO tms_check_runner, tms_reader USING (true);']);
  const { CREATED } = await import(BUILDER);
  assert.deepStrictEqual(CREATED.map((s) => s.split('(')[0]).sort(), created.slice().sort(), 'the rollback drops exactly these');
  const rb = read('074a_plan_reads_rollback.sql');
  for (const s of CREATED) assert.ok(rb.includes(`'${s}'`));
  assert.match(rb, /DROP TABLE public\.plan_config;/);
  assert.match(rb, /ALTER TABLE public\.shipment_pieces DROP COLUMN for_split_at;/);
});

test('074a is reads only: no trigger, no row in plan_config, no day L, refuses with v5 rows; 074 before the rollback', () => {
  const src = strip(read(SRC));
  assert.ok(!/CREATE TRIGGER/i.test(src), 'no trigger (B-54 unchanged)');
  assert.ok(!/INSERT INTO (public\.)?plan_config/i.test(src), 'plan_config is born empty (074 writes its row)');
  assert.ok(!/'20\d\d-\d\d-\d\d'/.test(src), 'no date constant: day L is 074\'s');
  assert.match(read(SRC), /v5 row\(s\) exist - 074a runs before day L/);
  assert.match(read('074a_plan_reads_rollback.sql'), /074 is applied \(plan_config has its row or plan_cutover_log exists\) - roll back 074 first/);
});

test('every con: of the rules test is a CHECK of 074a (or the table key); every plan: code it raises has a case', () => {
  const src = read(SRC);
  const tst = read('074a_plan_reads_test.sql');
  const wants = [...tst.matchAll(/^\s+, '(plan|con):([a-z_0-9]+)'/gm)].map((m) => [m[1], m[2]]);
  const cons = new Set([...src.matchAll(/CONSTRAINT (\w+) CHECK/g)].map((m) => m[1]).concat(['plan_config_pkey']));
  for (const [kind, c] of wants) if (kind === 'con') assert.ok(cons.has(c), `con:${c} is not a CHECK of 074a`);
  assert.deepStrictEqual([...cons].sort(), [...new Set(wants.filter((w) => w[0] === 'con').map((w) => w[1]))].sort(), 'each CHECK has its case');
  const raised = new Set([...src.matchAll(/plan_h_raise\('([a-z_]+)'/g)].map((m) => m[1]));
  for (const c of raised) assert.ok(wants.some((w) => w[0] === 'plan' && w[1] === c), `plan:${c} has a case`);
  const n = (tst.match(/^\s+, '(?:ok|plan:[a-z_]+|con:[a-z_]+|state:\w+)'\s+-- \d+ /gm) || []).length;
  assert.ok(n >= 26, `${n} cases`);
});
