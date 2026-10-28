// tests/sql-079-drafts.test.js - run: node --test tests/sql-079-drafts.test.js
// The 079 drafts (day L moves back from 31/10 to 24/10, owner 28/10) at build time, plain node, no database
// (principle 6):
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the dry runs are their source + a deliberate error, generated (0 drift);
//   - the two days are written once each in 079 and its rollback, and the same in both;
//   - 079 adds no trigger and no function; it writes plan_config once, never plan_cutover_log itself, never opened_at;
//   - the rollback retires with '074 rollback', the one reason the cut ignores (plan_h_vs_in_v5, B-95, B-26).
// The rules themselves are proven on PGlite by tms-auditor/test/plan-079.test.mjs.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DRAFTS = path.join(ROOT, 'worker/migrations/drafts');
// drafts/ until the owner runs them, then one up (CLAUDE.md rule 5); never both
const file = (f) => {
  const d = path.join(DRAFTS, f), m = path.join(ROOT, 'worker/migrations', f);
  if (fs.existsSync(d) && fs.existsSync(m)) throw new Error(`${f} in drafts/ AND one up`);
  return fs.existsSync(d) ? d : m;
};
const read = (f) => fs.readFileSync(file(f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const noStrings = (s) => strip(s).replace(/'[^']*'/g, "''");
const SRC = '079_plan_cutover_move.sql';
const RB = '079_plan_cutover_move_rollback.sql';
const DO_FILES = [SRC, '079_plan_cutover_move_dryrun.sql', RB, '079_plan_cutover_move_rollback_dryrun.sql'];
const READ_ONLY = ['079_plan_cutover_move_verify.sql'];
const BUILDER = path.join(DRAFTS, 'tools/build-079.mjs');

test('079: every file is there, ASCII only, one DO block per writing file, the verify only reads', () => {
  for (const f of [...DO_FILES, ...READ_ONLY]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  for (const f of READ_ONLY) assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(noStrings(read(f))), f);
  assert.ok(fs.existsSync(BUILDER));
});

test('079: the dry runs are what the builder makes of the sources (0 drift), each its block + a deliberate error', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
  for (const [src, dry, name] of [[SRC, DO_FILES[1], 'DRY RUN 079'], [RB, DO_FILES[3], 'DRY RUN 079 ROLLBACK']]) {
    const s = read(src);
    const body = s.slice(s.indexOf('\nDO $do$\n') + '\nDO $do$\n'.length, s.lastIndexOf('\nEND $do$;\n'));
    assert.ok(body.length > 1000, src);
    assert.ok(read(dry).includes(body), `${dry} holds ${src} verbatim`);
    assert.match(read(dry), new RegExp(`RAISE EXCEPTION '${name} finished - EVERYTHING UNDONE`));
  }
});

test('079: the two days, once each, the same in 079 and its rollback; the floor is the new day', () => {
  for (const f of [SRC, RB]) {
    assert.strictEqual((read(f).match(/c_old CONSTANT date := DATE '2026-10-31';/g) || []).length, 1, f);
    assert.strictEqual((read(f).match(/c_new CONSTANT date := DATE '2026-10-24';/g) || []).length, 1, f);
  }
  assert.match(read(SRC), /ADD CONSTRAINT plan_config_floor CHECK \(cutover_day >= DATE '2026-10-24'\)/);
  assert.match(read(RB), /ADD CONSTRAINT plan_config_future CHECK \(cutover_day > \(opened_at AT TIME ZONE 'Europe\/Athens'\)::date\)/);
});

test('079 writes day L once and nothing of 074\'s own: no trigger, no function, no plan_cutover_log row, no opened_at', () => {
  const s = noStrings(read(SRC));
  assert.ok(!/CREATE (OR REPLACE )?(TRIGGER|FUNCTION)|DROP FUNCTION|DROP TRIGGER/i.test(s), 'no trigger or function');
  assert.ok(!/INSERT INTO public\.plan_cutover_log/i.test(s), 'plan_cutover_log is written only by plan_bridge_sync');
  assert.ok(!/opened_at\s*=/.test(s.replace(/\(SELECT opened_at[^)]*\)/g, '')), 'opened_at is never set');
  assert.strictEqual((s.match(/UPDATE public\.plan_config /g) || []).length, 1);
  assert.match(read(SRC), /PERFORM public\.plan_bridge_sync\(x\.id, '079 backfill'\);/);
  assert.match(read(SRC), /SET CONSTRAINTS ALL IMMEDIATE;/, '071\'s deferred rules inside the dry run too');
});

test('079 rollback: the reason the cut ignores, the point of no return, no hard delete of a v5 row', () => {
  const r = read(RB);
  assert.match(r, /deleted_reason = '074 rollback'/);
  assert.match(read('074_plan_cutover.sql'), /s\.deleted_reason is distinct from '074 rollback'/, 'plan_h_vs_in_v5 ignores it');
  assert.match(r, /079 rollback: after the point of no return/);
  assert.ok(!/DELETE FROM public\.(shipments|shipment_pieces|piece_legs|national_loads|plan_notices)/i.test(r));
});
