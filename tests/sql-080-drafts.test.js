// tests/sql-080-drafts.test.js - run: node --test tests/sql-080-drafts.test.js
// The 080 drafts (F1/F4 of the real-user test, owner 28/10: price and pallets optional) at build time, plain node, no
// database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry run and rollback have 0 drift (the rollback reads 080's hunks, md5, 073's views, 071's CHECKs);
//   - one md5 list per fact: PART 2's generated texts = what verify reads;
//   - the money views 080 starts from ARE 073's text (comments stripped: a view keeps none);
//   - B-100 in 080 is the text of tms-auditor/checks/B-100.sql (md5);
//   - 080 adds no trigger and leaves plan_order_update alone (077 / #153 patch it).
// The rules are proven on PGlite by tms-auditor/test/plan-080.test.mjs (NO-GO before 080: case «before 080»).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DRAFTS = path.join(ROOT, 'worker/migrations/drafts');
const file = (f) => {
  const d = path.join(DRAFTS, f), m = path.join(ROOT, 'worker/migrations', f);
  if (fs.existsSync(d) && fs.existsSync(m)) throw new Error(`${f} in drafts/ AND one up`);
  return fs.existsSync(d) ? d : m;
};
const read = (f) => fs.readFileSync(file(f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const SRC = '080_plan_optional_price_pallets.sql';
const DO_FILES = [SRC, '080_plan_optional_price_pallets_dryrun.sql', '080_plan_optional_price_pallets_rollback.sql'];
const VERIFY = '080_plan_optional_price_pallets_verify.sql';
const BUILDER = path.join(DRAFTS, 'tools/build-080.mjs');

test('080: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, VERIFY]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(VERIFY)).replace(/deleted_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('080: the builder has no drift (dry run and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('080: one md5 list per fact - PART 2 = verify; no placeholder left', () => {
  const src = read(SRC);
  const part2 = src.slice(src.indexOf('===== PART 2'), src.indexOf('===== PART 3'));
  const gen = [...part2.matchAll(/'([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 7);
  const verify = read(VERIFY);
  for (const m of gen) assert.ok(verify.includes(m), `verify reads ${m}`);
  assert.ok(!/@@/.test(src), 'no placeholder left');
});

test('080: the money views it starts from are 073\'s text, comments stripped', () => {
  const s73 = fs.readFileSync(path.join(ROOT, 'worker/migrations/073_plan_money.sql'), 'utf8');
  const view = (head) => {
    const out = [];
    for (const l of s73.slice(s73.indexOf(head) + head.length).split('\n')) {
      const code = l.split('--')[0].replace(/\s+$/, '');
      if (code.trim()) out.push(code);
      if (code.endsWith(';')) break;
    }
    return out.join('\n').replace(/;$/, '');
  };
  const src = read(SRC);
  for (const [k, head] of [['v_v5_0', 'CREATE VIEW public.ct_v_v5_revenue AS\n'], ['v_rev_0', 'CREATE OR REPLACE VIEW public.ct_v_rt_revenue AS\n'],
    ['v_pnl_0', 'CREATE OR REPLACE VIEW public.ct_v_rt_pnl AS\n']]) {
    const m = new RegExp(`  ${k} CONSTANT text := \\$v\\$([\\s\\S]*?)\\$v\\$;`).exec(src);
    assert.ok(m, k);
    assert.strictEqual(m[1], view(head), k);
  }
});

test('080: B-100 is the text of its check file (md5), and the catalog file passes the lint', async () => {
  const { loadChecks } = await import(path.join(ROOT, 'tms-auditor/checks/load.mjs'));
  const { checks, errors } = loadChecks();
  assert.deepStrictEqual(errors.filter((e) => /B-100/.test(e)), []);
  const c = checks.find((x) => x.id === 'B-100');
  assert.ok(c && c.enabled && c.is_queue && c.severity === 'P2');
  const src = read(SRC);
  assert.ok(src.includes(`'${md5(c.sql)}'`) && src.includes(`'${md5(c.ids_sql)}'`), 'PART 5 proves the file\'s text');
});

test('080: no trigger; plan_order_update is not touched; the rollback undoes exactly 080', () => {
  const src = strip(read(SRC)), rb = strip(read('080_plan_optional_price_pallets_rollback.sql'));
  assert.ok(!/CREATE (CONSTRAINT )?TRIGGER/.test(src));
  assert.ok(!/plan_order_update\(jsonb/.test(src), '077 / #153 own plan_order_update');
  assert.match(rb, /ALTER COLUMN pallets SET NOT NULL/);
  assert.match(rb, /DELETE FROM monitoring\.checks WHERE id = 'B-100'/);
  assert.match(rb, /unknown pallets - write their pallets first/);
});
