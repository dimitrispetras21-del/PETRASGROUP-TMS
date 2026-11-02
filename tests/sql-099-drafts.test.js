// tests/sql-099-drafts.test.js - run: node --test tests/sql-099-drafts.test.js
// The 099 drafts (the act "Change on the road", plan_transfer; transfer at any point, piece 2b, owner 2/11) at build
// time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs, rollback and verify have 0 drift;
//   - one md5 per fact: the measured text of plan_transfer is its body's md5, and the one verify, the dry run and the
//     rollback read; 099 builds on the texts 098 writes;
//   - 099 creates one function (born closed, then service_role only), one column, one place - and patches nothing.
// The act is proven on PGlite by tms-auditor/test/plan-099.test.mjs (GO, refusals, replay, dry run, rollback).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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
const P = '099_plan_transfer';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-099.mjs');

test('099: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('099: the builder has no drift (dry runs, rollback, verify)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('099: one md5 per fact - the body of plan_transfer = m_fn = verify = the dry run = the rollback', () => {
  const src = read(`${P}.sql`);
  const fn = /m_fn CONSTANT text := '([0-9a-f]{32})'/.exec(src)[1];
  const a = src.indexOf('AS $f$'), b = src.indexOf('$f$;', a);
  assert.strictEqual(crypto.createHash('md5').update(src.slice(a + 6, b)).digest('hex'), fn, 'm_fn is the body\'s md5');
  assert.ok(read(`${P}_verify.sql`).includes(`'${fn}'`));
  assert.ok(read(`${P}_dryrun.sql`).split('\n').filter((l) => l.startsWith('--')).join('\n').includes(fn));
  assert.ok(read(`${P}_rollback.sql`).includes(`'${fn}'`));
  assert.ok(!/'@F'/.test(src), 'no placeholder left');
});

test('099 builds on the texts 098 writes (one fact each)', () => {
  const src = read(`${P}.sql`);
  const s98 = read('098_plan_transfer_point.sql');
  const part2 = s98.slice(s98.indexOf('===== PART 2'), s98.indexOf('===== PART 3'));
  for (const sig of ['plan_leg_problem\\(bigint\\)', 'plan_shipment_problem\\(bigint\\)', 'plan_split_piece\\(jsonb,text,text\\)']) {
    const m98 = new RegExp(`'public\\.${sig}', ARRAY\\[[a-z0-9_, ]+\\], ARRAY\\[[a-z0-9_, ]+\\], '([0-9a-f]{32})'`).exec(part2)[1];
    assert.ok(new RegExp(`'public\\.${sig}', '${m98}'`).test(src), `${sig}: 099 guards on 098's output`);
  }
});

test('099 creates one function (born closed, service_role only), one column, one place; patches nothing', () => {
  const src = strip(read(`${P}.sql`));
  assert.deepStrictEqual([...src.matchAll(/CREATE (OR REPLACE )?(TABLE|FUNCTION|VIEW|INDEX|(CONSTRAINT )?TRIGGER)\s+([a-z_.]+)/g)].map((m) => m[4]),
    ['public.plan_transfer']);
  assert.ok(!/CREATE OR REPLACE FUNCTION/.test(src), 'no function patched');
  assert.deepStrictEqual([...src.matchAll(/ADD COLUMN ([a-z_]+)/g)].map((m) => m[1]), ['transfer_place']);
  assert.match(src, /REVOKE ALL ON FUNCTION public\.plan_transfer\(jsonb,text,text\) FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.plan_transfer\(jsonb,text,text\) TO service_role;/);
  assert.strictEqual((src.match(/INSERT INTO public\.locations/g) || []).length, 1);
  const rb = strip(read(`${P}_rollback.sql`));
  assert.match(rb, /DROP FUNCTION public\.plan_transfer\(jsonb,text,text\);/);
  assert.match(rb, /DROP COLUMN transfer_place;/);
  assert.match(rb, /DELETE FROM public\.locations WHERE legacy_id = 'v5_transfer_point';/);
});
