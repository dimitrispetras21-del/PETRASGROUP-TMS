// tests/sql-070-drafts.test.js - run: node --test tests/sql-070-drafts.test.js
// The 070 drafts (worker/migrations/drafts/070_revoke_truncate*) at build time, plain node, no database:
//   - ASCII only (the owner pastes them from a clipboard that has mangled Greek before);
//   - the writing files are ONE DO block (the SQL editor is not atomic across statements); verify writes nothing;
//   - the dry run is 070's block verbatim plus one deliberate error, so what was rehearsed is what runs.
// The grants themselves were proven on the local copy of production (dump 15/10): dry run, 070, verify,
// rollback, verify (docs/sessions/2026-10-16-vd-nick-s7-revoke-truncate.md).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DRAFTS = path.join(__dirname, '..', 'worker/migrations/drafts');
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');
const FILES = fs.readdirSync(DRAFTS).filter((f) => f.startsWith('070_revoke_truncate'));
const DO_FILES = ['070_revoke_truncate.sql', '070_revoke_truncate_dryrun.sql', '070_revoke_truncate_rollback.sql'];
const READ_ONLY = ['070_revoke_truncate_verify.sql'];

test('the four 070 files are all there', () => {
  assert.deepStrictEqual(FILES.slice().sort(), DO_FILES.concat(READ_ONLY).sort());
});
test('ASCII only', () => {
  for (const f of FILES) assert.deepStrictEqual([...read(f)].filter((c) => c.charCodeAt(0) > 127), [], f);
});
test('each writing file is ONE DO block; verify writes nothing', () => {
  for (const f of DO_FILES) assert.strictEqual((read(f).match(/^DO \$/gm) || []).length, 1, f);
  // Privilege names inside string literals ('TRUNCATE' in has_table_privilege) are reads, not statements.
  const sql = read(READ_ONLY[0]).replace(/--[^\n]*/g, '').replace(/'[^']*'/g, "''");
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|GRANT|REVOKE|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /^DO \$/m);
});
test('the dry run is 070 verbatim plus one deliberate error before END', () => {
  const block = (f) => read(f).slice(read(f).indexOf('DO $do$'));
  const main = block('070_revoke_truncate.sql'), dry = block('070_revoke_truncate_dryrun.sql');
  const end = 'END\n$do$;\n';
  assert.ok(main.endsWith(end) && dry.endsWith(end));
  const extra = dry.slice(main.length - end.length, -end.length);
  assert.strictEqual(dry.slice(0, main.length - end.length), main.slice(0, -end.length), 'dry run drifted from 070');
  assert.match(extra, /^  RAISE EXCEPTION 'DRY RUN 070 finished - EVERYTHING UNDONE/);
  assert.strictEqual(extra.split('\n').length, 2, 'exactly one added line');
});
test('070 touches TRUNCATE only, never DELETE/INSERT/UPDATE/SELECT grants', () => {
  const sql = read('070_revoke_truncate.sql').replace(/--[^\n]*/g, '');
  for (const m of sql.matchAll(/\b(REVOKE|GRANT)\s+(\w+)/g)) assert.strictEqual(m[2], 'TRUNCATE', m[0]);
});
