// tests/sql-075-drafts.test.js - run: node --test tests/sql-075-drafts.test.js
// The 075 drafts (the side of a national order is stored, live bug 28/10) at build time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry run and rollback have 0 drift (the rollback reads 075's hunks and md5, never a copy);
//   - one md5 list per fact: the generated texts of PART 2 are the ones verify reads and the dry run expects;
//   - the two helpers are born closed; 075 adds no trigger.
// The rules are proven on PGlite by tms-auditor/test/plan-075.test.mjs.
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
const DO_FILES = ['075_plan_order_side.sql', '075_plan_order_side_dryrun.sql', '075_plan_order_side_rollback.sql'];
const BUILDER = path.join(DRAFTS, 'tools/build-075.mjs');

test('075: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, '075_plan_order_side_verify.sql']) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read('075_plan_order_side_verify.sql')).replace(/deleted_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('075: the builder has no drift (dry run and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('075: one md5 list per fact - PART 2 = verify = the dry run\'s expected line', () => {
  const src = read('075_plan_order_side.sql');
  const part2 = src.slice(src.indexOf('===== PART 2'), src.indexOf('===== PART 3'));
  const gen = [...part2.matchAll(/'([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 3);
  const verify = read('075_plan_order_side_verify.sql');
  for (const m of gen) assert.ok(verify.includes(m), `verify reads ${m}`);
  const head = read('075_plan_order_side_dryrun.sql').split('\n').filter((l) => l.startsWith('--')).join('\n');
  for (const m of gen) assert.ok(head.includes(m.slice(0, 8)), `the dry run header expects ${m.slice(0, 8)}`);
  assert.ok(!/NEW_[CUB]_MD5/.test(src + verify), 'no placeholder left');
});

test('075: helpers born closed, no trigger, the rollback drops exactly what 075 creates', () => {
  const src = read('075_plan_order_side.sql'), rb = read('075_plan_order_side_rollback.sql');
  const created = [...src.matchAll(/CREATE FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]).sort();
  assert.deepStrictEqual(created, ['plan_h_dir_side', 'plan_h_side_dir']);
  assert.match(src, /REVOKE ALL ON FUNCTION public\.plan_h_side_dir\(text\), public\.plan_h_dir_side\(text\) FROM PUBLIC, anon, authenticated, service_role;/);
  assert.ok(!/CREATE (CONSTRAINT )?TRIGGER/.test(src));
  assert.deepStrictEqual([...rb.matchAll(/DROP FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]).sort(), created);
});
