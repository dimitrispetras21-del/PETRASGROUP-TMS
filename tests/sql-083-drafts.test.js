// tests/sql-083-drafts.test.js - run: node --test tests/sql-083-drafts.test.js
// The 083 drafts (a load without a truck, owner 31/10) at build time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs and rollback have 0 drift (the rollback reads 083's hunks and md5, never a copy);
//   - one md5 per fact: the generated text of PART 1 is the one verify reads and the dry run expects, the live one of
//     PART 0 the one the rollback returns to;
//   - 083 creates nothing (no table, function, trigger, grant), and a missing truck without "later" stays no_vehicle.
// The rules are proven on PGlite by tms-auditor/test/plan-083.test.mjs (NO-GO live, GO after, rollback).
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
const P = '083_plan_load_without_truck';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-083.mjs');

test('083: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('083: the builder has no drift (dry runs and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('083: one md5 per fact - PART 1 = verify = the dry run; PART 0 = the rollback\'s end', () => {
  const src = read(`${P}.sql`);
  const part1 = src.slice(src.indexOf('===== PART 1'), src.indexOf('===== PART 3'));
  const gen = [...part1.matchAll(/\], '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 1, 'one generated text');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = [...part0.matchAll(/\(json[a-z,]*\)', '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(live.length, 1, 'one live text');
  assert.ok(read(`${P}_verify.sql`).includes(gen[0]), 'verify reads the generated md5');
  assert.ok(read(`${P}_dryrun.sql`).split('\n').filter((l) => l.startsWith('--')).join('\n').includes(gen[0]), 'the dry run header expects it');
  assert.ok(read(`${P}_rollback.sql`).includes(gen[0]), 'the rollback starts from it');
  assert.ok(read(`${P}_rollback.sql`).includes(live[0]), 'the rollback returns to the live text');
  assert.ok(!/GEN_|GEN83/.test(src), 'no placeholder left');
});

test('083 creates nothing; "later" is opt-in and a forgotten truck is still no_vehicle', () => {
  const src = strip(read(`${P}.sql`));
  assert.ok(!/CREATE (TABLE|FUNCTION|VIEW|INDEX|(CONSTRAINT )?TRIGGER)\b/.test(src));
  assert.ok(!/\b(GRANT|REVOKE|ALTER)\b/.test(src));
  const u3b = /u_3b CONSTANT text := \$h\$([\s\S]*?)\$h\$;/.exec(read(`${P}.sql`))[1];
  assert.match(u3b, /elsif v_type = 'OWNED' then\n$/, 'the OWNED branch (and its no_vehicle) stays for every request without "later"');
  assert.match(u3b, /jsonb_typeof\(nr->'later'\) is distinct from 'boolean'/);
});
