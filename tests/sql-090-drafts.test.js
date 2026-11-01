// tests/sql-090-drafts.test.js - run: node --test tests/sql-090-drafts.test.js
// The 090 drafts (locations: ISO country, one space, the merge of duplicates; owner 1/11) at build time, plain node,
// no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs have 0 drift;
//   - born closed: entity_merge is revoked from every API role, and no file grants anything.
// The rules are proven on PGlite by tms-auditor/test/plan-090.test.mjs.
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
const P = '090_locations_clean_merge';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-090.mjs');

test('090: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('090: the builder has no drift (the two dry runs)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('090: born closed - the merge is revoked from every API role, nothing is granted', () => {
  const src = strip(read(`${P}.sql`));
  assert.match(src, /REVOKE ALL ON FUNCTION public\.entity_merge\(text, bigint, bigint, text\) FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(src, /REVOKE ALL ON public\.loc_090_before FROM PUBLIC, anon, authenticated, service_role;/);
  for (const f of DO_FILES) assert.ok(!/\bGRANT\b/i.test(strip(read(f))), `${f} grants`);
  // the record of what 090 changed is not a reference: a foreign key there would make a merge move it
  assert.ok(!/loc_090_before \([^;]*REFERENCES/s.test(src));
});

test('090: one country list - the CHECK holds exactly the codes of core/countries.js (COUNTRY_CODES)', () => {
  const vm = require('node:vm');
  const ctx = { window: {}, console, Intl };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/countries.js'), 'utf8'), ctx);
  const app = Array.from(vm.runInContext('COUNTRY_CODES', ctx)).sort();   // an array of this realm: deepStrictEqual compares prototypes
  const src = strip(read(`${P}.sql`));
  const m = src.match(/ADD CONSTRAINT locations_country_iso CHECK \(country IS NULL OR country = ANY \('\{([A-Z,\s]+)\}'::text\[\]\)\)/);
  assert.ok(m, 'the CHECK with its list');
  assert.deepStrictEqual(m[1].split(',').map((x) => x.trim()).sort(), app);
  // every code country_iso maps a name to is one of them
  for (const [, c] of src.matchAll(/\('[a-z ]+', '([A-Z]{2})'\)/g)) assert.ok(app.includes(c), c);
});
