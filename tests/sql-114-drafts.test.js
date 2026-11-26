// tests/sql-114-drafts.test.js - run: node --test tests/sql-114-drafts.test.js
// The 114 drafts (a waiting load splits at its own loading point, owner 8/11 and 25/11) at build time, plain node,
// no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs, rollback and verify have 0 drift (the rollback reads 114's hunks and md5, never a copy);
//   - one md5 per fact: PART 2's generated texts are the ones verify reads and the dry run expects; PART 0's live texts
//     are the rollback's end; 114 guards on 112's plan_board and 098's two texts;
//   - 114 patches only its three functions and replaces one view; no table, column, trigger, grant.
// The rules are proven on PGlite by tms-auditor/test/plan-114.test.mjs (NO-GO before, GO after, refusals, rollback).
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
const P = '114_plan_split_at_loading';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-114.mjs');

test('114: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('114: the builder has no drift (dry runs, rollback, verify)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('114: one md5 per fact - PART 2 = verify = the dry run; PART 0 = the rollback\'s end; on 112 and 098', () => {
  const src = read(`${P}.sql`);
  assert.ok(!/'@[PSBV]'/.test(src), 'no placeholder left');
  const part2 = src.slice(src.indexOf('===== PART 2'), src.indexOf('===== PART 3'));
  const gen = [...part2.matchAll(/\], '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 3, 'three generated texts');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = [...part0.matchAll(/', '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(live.length, 4, 'four texts: three patched, plan_h_put relied on');
  const viewNew = /m_view_new CONSTANT text := '([0-9a-f]{32})'/.exec(src)[1];
  const viewOld = /m_view_old CONSTANT text := '([0-9a-f]{32})'/.exec(src)[1];
  const dryHead = read(`${P}_dryrun.sql`).split('\n').filter((l) => l.startsWith('--')).join('\n');
  for (const m of [...gen, viewNew]) {
    assert.ok(read(`${P}_verify.sql`).includes(m), 'verify reads the generated md5');
    assert.ok(dryHead.includes(m), 'the dry run header expects it');
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback starts from it');
  }
  for (const m of [...live.slice(0, 3), viewOld]) assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback returns to the live text');
  // 112 -> 114: the plan_board 114 guards on is the one 112 wrote; 098 -> 114: split and problem as 098 left them
  const m112 = /board_md5\s+(?:--\s+)?([0-9a-f]{32})/.exec(fs.readFileSync(path.join(ROOT, 'worker/migrations/112_plan_board_local_truck.sql'), 'utf8'))[1];
  assert.ok(part0.includes(`('public.plan_board(date,text)', '${m112}')`), '114 guards on 112\'s board');
  const s98 = fs.readFileSync(path.join(ROOT, 'worker/migrations/098_plan_transfer_point.sql'), 'utf8');
  for (const sig of ['public.plan_split_piece(jsonb,text,text)', 'public.plan_shipment_problem(bigint)']) {
    const m98 = new RegExp(`\\('${sig.replace(/[()]/g, '\\$&')}', ARRAY\\[[^\\]]+\\], ARRAY\\[[^\\]]+\\], '([0-9a-f]{32})'\\)`).exec(s98)[1];
    assert.ok(part0.includes(`('${sig}', '${m98}')`), `114 guards on 098's ${sig}`);
  }
});

test('114 replaces one view and patches only its three functions; no table, column, trigger, grant', () => {
  const src = strip(read(`${P}.sql`));
  assert.deepStrictEqual([...src.matchAll(/CREATE (OR REPLACE )?(TABLE|VIEW|INDEX|(CONSTRAINT )?TRIGGER)\s+([a-z_.]+)/g)].map((m) => m[4]),
    ['public.v_piece_state']);
  assert.ok(!/\b(GRANT|REVOKE|DROP|ALTER TABLE|ADD COLUMN)\b/.test(src));
  const raw = read(`${P}.sql`);
  const part2 = raw.slice(raw.indexOf('===== PART 2'), raw.indexOf('===== PART 3'));
  assert.deepStrictEqual([...part2.matchAll(/\('(public\.[a-z_]+)\(/g)].map((m) => m[1]),
    ['public.plan_split_piece', 'public.plan_shipment_problem', 'public.plan_board']);
  // the view is 071's text but for is_stock: every line before that expression is the same, comments aside
  const v071 = fs.readFileSync(path.join(ROOT, 'worker/migrations/071_plan_schema.sql'), 'utf8');
  const head = (s) => {
    const a = s.indexOf('VIEW public.v_piece_state');
    return s.slice(a, s.indexOf('(pp.parent_piece_id IS NOT NULL AND pp.own_last_leg_id IS NULL', a))
      .replace(/^\s*--[^\n]*\n/gm, '').replace(/\s+/g, ' ');
  };
  assert.strictEqual(head(raw), head(v071));
  const tail = (s) => { const a = s.indexOf('AS is_stock', s.indexOf('VIEW public.v_piece_state')); return s.slice(a, s.indexOf('WHERE NOT pp.is_split;', a)).replace(/\s+/g, ' '); };
  assert.strictEqual(tail(raw), tail(v071));
  assert.match(read(`${P}_rollback.sql`), /\(pp\.parent_piece_id IS NOT NULL AND pp\.own_last_leg_id IS NULL\) AS is_stock/);
});
