// tests/sql-085-drafts.test.js - run: node --test tests/sql-085-drafts.test.js
// The 085 drafts (F62 the client of a national changes until it is invoiced; an invoiced price only from owner /
// accountant; the read says invoiced - owner 31/10) at build time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs and rollback have 0 drift (the rollback reads 085's hunks and md5, never a copy);
//   - one md5 per fact: the generated texts of PART 1 + 2 are the ones verify reads and the dry run expects, the live
//     ones of PART 0 the ones the rollback returns to;
//   - 085 creates nothing (no table, function, trigger, grant); the client refusal has no role exception, the price
//     rule names exactly owner / accountant, and only a change is refused.
// The rules are proven on PGlite by tms-auditor/test/plan-085.test.mjs (NO-GO live, GO after, rollback).
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
const P = '085_plan_invoiced_client_price';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-085.mjs');

test('085: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  // the audit_log filter on action = 'update' is a value read, not a statement
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at|action = 'update'/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('085: the builder has no drift (dry runs and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('085: one md5 per fact - PART 1 + 2 = verify = the dry run; PART 0 = the rollback\'s end', () => {
  const src = read(`${P}.sql`);
  const part12 = src.slice(src.indexOf('===== PART 1'), src.indexOf('===== PART 3'));
  const gen = [...part12.matchAll(/\], '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 2, 'two generated texts');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = [...part0.matchAll(/', '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(live.length, 2, 'two live texts');
  const head = (f) => read(f).split('\n').filter((l) => l.startsWith('--')).join('\n');
  for (const m of gen) {
    assert.ok(read(`${P}_verify.sql`).includes(m), 'verify reads the generated md5');
    assert.ok(head(`${P}_dryrun.sql`).includes(m), 'the dry run header expects it');
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback starts from it');
  }
  for (const m of live) {
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback returns to the live text');
    assert.ok(head(`${P}_rollback_dryrun.sql`).includes(m), 'its dry run header expects it');
  }
  assert.ok(!/GEN_[OR]\b|LIVE_[OR]\b/.test(src + read(`${P}_dryrun.sql`) + read(`${P}_rollback_dryrun.sql`)), 'no placeholder left');
});

test('085 creates nothing; the client refusal has no role exception; the price rule is owner / accountant; only a change is refused', () => {
  const src = strip(read(`${P}.sql`));
  assert.ok(!/CREATE (TABLE|FUNCTION|VIEW|INDEX|(CONSTRAINT )?TRIGGER)\b/.test(src));
  assert.ok(!/\b(GRANT|REVOKE|ALTER)\b/.test(src));
  const hunk = (k) => new RegExp(`${k} CONSTANT text := \\$h\\$([\\s\\S]*?)\\$h\\$;`).exec(read(`${P}.sql`))[1];
  assert.match(hunk('o_2b'), /if n\.invoiced is true then perform plan_h_raise\('invoiced_client'/);
  assert.match(hunk('o_2b'), /n\.invoiced is true and p_role not in \('owner', 'accountant'\)[\s\S]*plan_h_raise\('invoiced_price'/);
  assert.match(hunk('o_2b'), /\(v_set->>'client_id'\)::bigint is distinct from n\.client_id/);
  assert.match(hunk('o_2b'), /\(v_set->>'price'\)::numeric is distinct from n\.price/);
  assert.match(hunk('o_3b'), /client_id = case when v_set \? 'client_id'/);
  assert.match(hunk('r_1b'), /'invoiced', coalesce\(n\.invoiced, false\)/);
});
