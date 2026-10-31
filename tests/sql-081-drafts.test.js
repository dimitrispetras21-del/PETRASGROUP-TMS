// tests/sql-081-drafts.test.js - run: node --test tests/sql-081-drafts.test.js
// The 081 drafts (F28 the stops of a cycle by the road, and the truck's stop follows its point; owner 31/10) at build
// time, plain node, no database:
//   - every file and the builder are there; ASCII only; the writing files are ONE DO block; verify only reads;
//   - the generated dry runs and rollback have 0 drift (the rollback reads 081's hunks and md5, never a copy);
//   - one md5 per fact: the generated texts of PART 1 + 2 are the ones verify reads and the dry run expects, the live
//     ones of PART 0 the ones the rollback returns to;
//   - 081 creates nothing (no table, function, trigger, grant), and the stop move is plan_rt_update's, never a copy.
// The rules are proven on PGlite by tms-auditor/test/plan-081.test.mjs (F28 and the stop that stays NO-GO live, GO after).
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
const P = '081_plan_stop_order_follows';
const DO_FILES = [`${P}.sql`, `${P}_dryrun.sql`, `${P}_rollback.sql`, `${P}_rollback_dryrun.sql`];
const BUILDER = path.join(DRAFTS, 'tools/build-081.mjs');

test('081: every file is there, ASCII only; one DO block per writing file; verify only reads', () => {
  for (const f of [...DO_FILES, `${P}_verify.sql`]) {
    const bad = read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[^\x00-\x7f]/.test(l));
    assert.deepStrictEqual(bad, [], `${f}: non-ASCII lines`);
  }
  for (const f of DO_FILES) assert.strictEqual((strip(read(f)).match(/^DO \$/gm) || []).length, 1, f);
  const v = strip(read(`${P}_verify.sql`)).replace(/deleted_at|created_at/g, '');
  assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(v));
});

test('081: the builder has no drift (dry runs and rollback)', () => {
  assert.match(execFileSync(process.execPath, [BUILDER, '--check']).toString(), /0 drift/);
});

test('081: one md5 per fact - PART 1 + 2 = verify = the dry run; PART 0 = the rollback\'s end', () => {
  const src = read(`${P}.sql`);
  const part12 = src.slice(src.indexOf('===== PART 1'), src.indexOf('===== PART 3'));
  const gen = [...part12.matchAll(/\], '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(gen.length, 2, 'two generated texts');
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  const live = [...part0.matchAll(/', '([0-9a-f]{32})'\)/g)].map((m) => m[1]);
  assert.strictEqual(live.length, 2, 'two live texts');
  for (const m of gen) {
    assert.ok(read(`${P}_verify.sql`).includes(m), 'verify reads the generated md5');
    assert.ok(read(`${P}_dryrun.sql`).split('\n').filter((l) => l.startsWith('--')).join('\n').includes(m), 'the dry run header expects it');
    assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback starts from it');
  }
  for (const m of live) assert.ok(read(`${P}_rollback.sql`).includes(m), 'the rollback returns to the live text');
  assert.ok(!/GEN_/.test(src), 'no placeholder left');
});

test('081 creates nothing; a stop moves only through plan_rt_update; the reseq keeps 071\'s groups', () => {
  const src = strip(read(`${P}.sql`));
  assert.ok(!/CREATE (TABLE|FUNCTION|VIEW|INDEX|(CONSTRAINT )?TRIGGER)\b/.test(src));
  assert.ok(!/\b(GRANT|REVOKE|ALTER)\b/.test(src));
  const hunk = (k) => new RegExp(`${k} CONSTANT text := \\$h\\$([\\s\\S]*?)\\$h\\$;`).exec(read(`${P}.sql`))[1];
  // the order form never writes a stop itself (principle 3: the F29 path holds truck_busy, payroll, VS day)
  assert.ok(hunk('o_3b').includes('plan_rt_update('));
  assert.ok(!/update rt_stops/i.test(hunk('o_3b')));
  // the groups of the old key stay (side, then planned_from): an hour still decides first, 071 side/stop_order hold
  assert.ok(/group by 1, 2 order by 1, 2/.test(hunk('r_2b')));
  assert.ok(/\(s\.side = 'ANODOS'\) as up, s\.planned_from/.test(hunk('r_2b')));
  // the cycles are locked at the start of a window save, before any point / piece is written (cycle before piece, as
  // plan_put_pieces) and before the order row (plan_delete), before "who else stops there" is read (code review xhigh r2, r3)
  assert.match(hunk('o_5b'), /from ct_round_trips c[\s\S]*for no key update;[\s\S]*end if;\n  select \* into n from national_orders/,
    'the cycles before the national order row (plan_delete\'s order: cycles, then the order)');
  assert.ok(!/for no key update/.test(hunk('o_3b')), 'no second, late lock');
});
