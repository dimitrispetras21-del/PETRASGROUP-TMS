// tests/sql-077-drafts.test.js - run: node --test tests/sql-077-drafts.test.js
// The 077 drafts (the edit of a national order is complete, live test 28/10, F13 + F21) at build time, plain node, no
// database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry run and rollback have 0 drift (the rollback reads 077's hunks and md5, never a copy);
//   - one md5 per fact: the generated text of PART 2 is the one verify reads and the dry run expects;
//   - the new read is born closed; 077 adds no trigger and the rollback drops exactly what 077 creates.
// The rules are proven on PGlite by tms-auditor/test/plan-077.test.mjs.
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
const DO_FILES = ['077_plan_order_edit.sql', '077_plan_order_edit_dryrun.sql', '077_plan_order_edit_rollback.sql'];
const BUILDER = path.join(DRAFTS, 'tools/build-077.mjs');

test('077: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, '077_plan_order_edit_verify.sql']) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read('077_plan_order_edit_verify.sql')).replace(/deleted_at|deleted_reason/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('077: the builder has no drift (dry run and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('077: one md5 per fact - PART 2 = verify = the dry run\'s expected line; PART 0 = 075\'s generated text', () => {
  const src = read('077_plan_order_edit.sql');
  const part2 = src.slice(src.indexOf('===== PART 2'), src.indexOf('===== PART 3'));
  const gen = [...part2.matchAll(/'([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 1);
  assert.ok(read('077_plan_order_edit_verify.sql').includes(gen[0]), 'verify reads the generated md5');
  const head = read('077_plan_order_edit_dryrun.sql').split('\n').filter((l) => l.startsWith('--')).join('\n');
  assert.ok(head.includes(gen[0].slice(0, 8)), 'the dry run header expects it');
  assert.ok(!/NEW_U_MD5/.test(src), 'no placeholder left');
  // the live text 077 guards on is the one 075 wrote (production 28/10): one fact, two files
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = /'public\.plan_order_update\(jsonb,text,text\)', '([0-9a-f]{32})'/.exec(part0)[1];
  assert.match(read('075_plan_order_side_verify.sql'), new RegExp(`plan_order_update\\(jsonb,text,text\\)', '${live}'`));
});

test('077: the read is born closed (Worker only), no trigger, the rollback drops exactly what 077 creates', () => {
  const src = read('077_plan_order_edit.sql'), rb = read('077_plan_order_edit_rollback.sql');
  const body = src.slice(0, src.indexOf('===== PART 2'));
  const created = [...body.matchAll(/CREATE FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]).sort();
  assert.deepStrictEqual(created, ['plan_order_read']);
  assert.match(src, /REVOKE ALL ON FUNCTION public\.plan_order_read\(bigint,text\) FROM PUBLIC, anon, authenticated, service_role;\n  GRANT EXECUTE ON FUNCTION public\.plan_order_read\(bigint,text\) TO service_role;/);
  assert.ok(!/CREATE (CONSTRAINT )?TRIGGER/.test(src));
  assert.deepStrictEqual([...rb.matchAll(/DROP FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]).sort(), created);
});
