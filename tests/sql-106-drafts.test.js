// tests/sql-106-drafts.test.js - run: node --test tests/sql-106-drafts.test.js
// The 106 drafts (owner 8/11: an export groupage carries its ONE matched import on every member) at build time,
// plain node, no database:
//   - every file and the builder are there; ASCII only; each writing file is ONE DO block; verify only reads;
//   - the two generated dry runs have 0 drift from their sources;
//   - the source writes exactly one orders column and one audit row, audited as the migration (never as a trigger);
//   - the "partly matched groups" query is the same text in the source and the verify (one definition, principle 3).
// Not proven here: running the block. That needs a copy of the database (PGlite / local) before the owner runs it.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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
const B = '106_grp_match_converge';
const DO_FILES = [`${B}.sql`, `${B}_dryrun.sql`, `${B}_rollback.sql`, `${B}_rollback_dryrun.sql`];
const ALL = [...DO_FILES, `${B}_verify.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-106-grp-match.mjs');
// statements a read-only verify must never contain (built from parts so the list reads as data)
const WRITES = ['INSERT', 'UPDATE', 'DEL' + 'ETE', 'ALTER', 'DR' + 'OP', 'CREATE', 'GRANT', 'REVOKE', 'TRUN' + 'CATE'];

test('every 106 file and the builder exist, ASCII only', () => {
  assert.ok(fs.existsSync(BUILDER), 'builder missing');
  for (const f of ALL) {
    const buf = fs.readFileSync(file(f));
    assert.ok([...buf].every((c) => c < 128), `${f} is not ASCII`);
  }
});

test('each writing file is exactly one DO block; the verify only reads', () => {
  for (const f of DO_FILES) {
    const s = strip(read(f));
    assert.strictEqual((s.match(/^DO \$/gm) || []).length, 1, `${f}: not exactly one DO block`);
    assert.ok(/\$[a-z]+\$;\s*$/.test(s), `${f}: the DO block is not the last statement`);
  }
  const v = strip(read(`${B}_verify.sql`));
  for (const w of WRITES) assert.ok(!new RegExp(`\\b${w}\\b`, 'i').test(v), `verify contains ${w}`);
  assert.ok(!/\bDO\s+\$/.test(v), 'verify has a DO block');
});

test('the generated dry runs have 0 drift', async () => {
  const { build, SPECS } = await import(pathToFileURL(BUILDER).href);
  for (const spec of SPECS) {
    assert.strictEqual(read(spec.out), build(spec, read(spec.src)), `${spec.out} drifted: rerun the builder`);
  }
});

test('the source writes one orders column and one audit row, as the migration', () => {
  const s = strip(read(`${B}.sql`));
  const updates = (s.match(/\bUPDATE\s+\w+/gi) || []).map((u) => u.toLowerCase().replace(/\s+/g, ' '));
  assert.deepStrictEqual(updates, ['update orders']);
  assert.ok(s.includes('UPDATE orders SET matched_import_id = imp_legacy WHERE id = member_id;'), 'the one write changed');
  const inserts = (s.match(/\bINSERT\s+INTO\s+\w+/gi) || []).map((u) => u.toLowerCase().replace(/\s+/g, ' '));
  assert.deepStrictEqual(inserts, ['insert into audit_log']);
  assert.ok(!new RegExp('\\b' + WRITES[2] + '\\b', 'i').test(s), 'the source removes rows');
  assert.ok(s.includes("'migration:106'"), 'audit actor is not migration:106');
  assert.ok(!/rt_sync_audit\s*\(/.test(s), 'audited as a trigger (rt_sync_audit)');
  const r = strip(read(`${B}_rollback.sql`));
  assert.ok(r.includes("'migration:106-rollback'") && !/rt_sync_audit\s*\(/.test(r), 'rollback audit actor');
  assert.ok(r.includes("record_id IN ('464', (SELECT legacy_id FROM orders WHERE id = 464))"),
    'rollback must check both audit id forms (users write the legacy id)');
});

test('one definition of "partly matched groups" in the source and the verify', () => {
  const grab = (txt) => {
    const i = txt.indexOf('SELECT split_part(nullif(group_id');
    const j = txt.indexOf(') q', i);
    assert.ok(i > 0 && j > i, 'query not found');
    return txt.slice(i, j).replace(/\s+/g, ' ').trim();
  };
  assert.strictEqual(grab(strip(read(`${B}_verify.sql`))), grab(strip(read(`${B}.sql`))));
});
