// tests/sql-102-drafts.test.js - run: node --test tests/sql-102-drafts.test.js
// The 102 drafts (owner 2/11: shared draft loads, "Synthesi fortion") at build time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs and rollback have 0 drift (the rollback's lists are the source's c_acts / c_helpers);
//   - the rollback drops exactly what 102 creates, never with CASCADE;
//   - 102 changes no existing text and writes no existing row but B-54's red_value (it only CREATEs).
// The rules are proven on PGlite by tms-auditor/test/plan-102.test.mjs (NO-GO before, GO after, rollback).
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
const P = '102_plan_drafts';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-102.mjs');

test('102: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  // column names and the privilege names has_table_privilege reads ('INSERT,UPDATE,DELETE') are not statements
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|realized_at|created_at/g, '').replace(/'[A-Z,]+'/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|comment)\b/i.test(v));
});

test('102: the builder has no drift (dry runs and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('102 only CREATEs: no existing function or table changed, the one existing row written is B-54', () => {
  const src = strip(read(`${P}.sql`));
  assert.ok(!/CREATE OR REPLACE/.test(src), 'no existing text replaced');
  assert.ok(!/\bALTER TABLE (?!public\.plan_draft)/.test(src), 'no existing table altered');
  assert.ok(!/\bDROP\b|\bCASCADE\b/.test(src));
  // statements outside the function bodies ($f$ ... $f$) that write a row
  const outside = src.replace(/\$f\$[\s\S]*?\$f\$/g, '');
  const writes = outside.match(/\b(UPDATE|INSERT INTO|DELETE FROM)\s+[a-z_.]+/gi) || [];
  assert.deepStrictEqual(writes, ['UPDATE monitoring.checks']);
  // every function 102 creates is in its lists (the rollback drops from them)
  const made = [...src.matchAll(/CREATE FUNCTION (public\.[a-z_]+)\(/g)].map((m) => m[1]).sort();
  const listed = [...src.matchAll(/'(public\.plan_[a-z_]+)\(/g)].map((m) => m[1]);
  for (const f of made) assert.ok(listed.includes(f), `${f} created but not in c_acts / c_helpers`);
});

test('102 rollback: drops what 102 created, never with CASCADE, refuses with a live draft', () => {
  const rb = strip(read(`${P}_rollback.sql`));
  assert.ok(!/CASCADE/.test(rb));
  for (const t of ['DROP VIEW public.v_plan_draft_piece_state', 'DROP TABLE public.plan_draft_pieces', 'DROP TABLE public.plan_drafts']) assert.ok(rb.includes(t), t);
  assert.match(rb, /live draft\(s\) - realize or delete them first/);
});
