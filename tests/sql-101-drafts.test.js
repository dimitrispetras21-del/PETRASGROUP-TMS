// tests/sql-101-drafts.test.js - run: node --test tests/sql-101-drafts.test.js
// The 101 drafts (owner 2/11: "Aftoparadosi" - self delivery, invoiced without an ERP transport invoice) at build
// time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs and rollback have 0 drift (the rollback declares 101's own constants, never a copy);
//   - one md5 per fact: the texts 101 writes (GEN_MD5) are the ones verify reads and the dry run expects; the live ones
//     (the source's constants) the ones the rollback returns to and verify calls "before 101";
//   - 101 grants nothing, revokes nothing, creates no table / index / trigger, touches no row of orders.
// The rules are proven on PGlite by tms-auditor/test/plan-101.test.mjs (NO-GO live, GO after, rollback).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
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
const P = '101_self_delivery';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-101.mjs');
const constant = (src, k) => new RegExp(`^ {2}${k} CONSTANT text := '([0-9a-f]{32})';$`, 'm').exec(src)[1];

test('101: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|comment)\b/i.test(v));
});

test('101: the builder has no drift (dry runs and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('101: one md5 per fact - GEN_MD5 = verify = the dry run; the live constants = the rollback\'s end = verify "before"', async () => {
  const { GEN_MD5 } = await import(pathToFileURL(BUILDER).href);
  const src = read(`${P}.sql`), ver = read(`${P}_verify.sql`);
  const dryHead = read(`${P}_dryrun.sql`).split('\n').filter((l) => l.startsWith('--')).join('\n');
  const rbDryHead = read(`${P}_rollback_dryrun.sql`).split('\n').filter((l) => l.startsWith('--')).join('\n');
  for (const m of Object.values(GEN_MD5)) {
    assert.match(m, /^[0-9a-f]{32}$/);
    assert.ok(ver.includes(`'${m}'`), `verify reads ${m}`);
    assert.ok(dryHead.includes(m), `the dry run header expects ${m}`);
  }
  for (const k of ['c_fn_live', 'c_b11_sql', 'c_b12_sql']) {
    const m = constant(src, k);
    assert.ok(ver.includes(`'${m}'`), `verify knows the live ${k}`);
    assert.ok(rbDryHead.includes(m), `the rollback dry run header expects the live ${k}`);
  }
  assert.ok(!/GEN_|LIVE_[A-Z0-9]+\b/.test(dryHead + rbDryHead), 'no placeholder left');
});

test('101 grants nothing, creates no table / index / trigger, writes no order row; its two ALTERs only ADD the column', () => {
  const src = strip(read(`${P}.sql`));
  assert.ok(!/\b(GRANT|REVOKE|CASCADE)\b/.test(src));
  // statements only (c_trg_o / c_trg_n hold 043's trigger texts as strings, to compare with pg_get_triggerdef)
  assert.ok(!/^\s*CREATE (TABLE|INDEX|TRIGGER)\b/m.test(src), 'triggers are only CREATE OR REPLACE');
  assert.ok(!/\b(INSERT INTO|DELETE FROM)\b/i.test(src));
  assert.ok(!/UPDATE public\.(national_)?orders\b/i.test(src));
  const alters = src.match(/ALTER TABLE[^;]*;/g) || [];
  assert.deepStrictEqual(alters, ['ALTER TABLE public.orders ADD COLUMN self_delivery boolean NOT NULL DEFAULT false;',
    'ALTER TABLE public.national_orders ADD COLUMN self_delivery boolean NOT NULL DEFAULT false;']);
  // the rollback never drops a view with CASCADE (a dependent object must stop it)
  assert.ok(!/CASCADE/.test(strip(read(`${P}_rollback.sql`))));
});

// The base and the Worker say the SAME thing about who may skip the ERP number: only self_delivery = true
test('101 and the Worker: the same label on both tables, the same exception', () => {
  const w = fs.readFileSync(path.join(ROOT, 'worker/src/index.js'), 'utf8');
  assert.strictEqual((w.match(/"Self Delivery": "self_delivery"/g) || []).length, 2, 'ORDERS and NATIONAL ORDERS map the label');
  const fn = /function invoiceMarkError\(table, patch, before\) \{[\s\S]*?\n\}\n/.exec(w)[0];
  assert.match(fn, /self_delivery/);
});
