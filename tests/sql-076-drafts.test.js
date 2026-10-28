// tests/sql-076-drafts.test.js - run: node --test tests/sql-076-drafts.test.js
// The 076 drafts (the board answers in time) at build time, plain node, no database (principle 6):
//   - the four files and the builder are there; ASCII only; the writing files are ONE DO block; verify writes nothing;
//   - the dry run, the rollback and the verify are what the builder makes of the source (0 drift);
//   - the rollback holds 071's view, read from 071's own file (the text production holds);
//   - 076 writes no row and adds no trigger, function or table change; plan_board is only read (its md5);
//   - the new view keeps 071's rule (late, end_stop_id) and every column of 071's view, in order.
// The rules themselves are proven on PGlite (tms-auditor/test/plan-076.test.mjs).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'worker/migrations/drafts');   // 076 is a draft: it leaves drafts/ when the owner runs it
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const noStrings = (s) => strip(s).replace(/'[^']*'/g, "''");
const SRC = '076_plan_board_speed.sql';
const DO_FILES = [SRC, '076_plan_board_speed_dryrun.sql', '076_plan_board_speed_rollback.sql'];
const READ_ONLY = ['076_plan_board_speed_verify.sql'];
const BUILDER = path.join(DIR, 'tools/build-076.mjs');

test('the files are there, ASCII only, one DO block per writing file, the verify writes nothing', () => {
  for (const f of [...DO_FILES, ...READ_ONLY]) assert.ok(!/[^\x00-\x7F]/.test(read(f)), `${f} has a non-ASCII character`);
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, `${f}: one DO block`);
  for (const f of READ_ONLY) assert.ok(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE|ANALYZE)\b/i.test(noStrings(read(f))), `${f} writes`);
});

test('the dry run, the rollback and the verify are what the builder makes of the source (0 drift)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check'], { encoding: 'utf8' }), /0 drift/);
});

test('076 writes no row, adds no trigger, function or table change; plan_board is only read; the rollback holds 071', async () => {
  const src = noStrings(read(SRC));
  assert.ok(!/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(src), 'no row written');
  assert.ok(!/CREATE (OR REPLACE )?(TRIGGER|FUNCTION)|ALTER TABLE|DROP /i.test(src), 'no trigger, no function, no table change');
  assert.match(read(SRC), /v_board := md5\(\(SELECT prosrc FROM pg_proc WHERE oid = 'public\.plan_board\(date,text\)'::regprocedure\)\);/);
  assert.match(read(SRC), /RAISE EXCEPTION '076 proof: plan_board changed'/);
  const { view071, constants } = await import(BUILDER);
  assert.ok(read('076_plan_board_speed_rollback.sql').includes(view071()), 'the rollback holds 071\'s text verbatim');
  assert.strictEqual(constants(read(SRC)).old, 'f758827112c0a1a34f3feebb8cd36c44');
});

test('the new view keeps 071\'s rule and columns: late at an end stop, the same names in the same order', async () => {
  const { view071 } = await import(BUILDER);
  const cols = (s) => [...strip(s).matchAll(/ AS (\w+)/g)].map((m) => m[1]).filter((c) => !['late', 'st'].includes(c));
  const neu = /CREATE OR REPLACE VIEW public\.v_rt_stop_state[\s\S]*?\n  FROM st;/.exec(read(SRC))[0];
  assert.deepStrictEqual(cols(neu), cols(view071()), 'every column of 071, in order');
  assert.match(neu, /FROM public\.v_piece_state ps WHERE ps\.late AND ps\.end_stop_id IS NOT NULL/);
  assert.match(view071(), /WHERE ps\.end_stop_id = s\.id AND ps\.late\) AS has_late/);
  assert.ok(!/EXISTS \(SELECT 1 FROM public\.v_piece_state/.test(neu), 'no sub-query per stop');
});
