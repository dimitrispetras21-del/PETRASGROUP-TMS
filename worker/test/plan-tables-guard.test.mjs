// National v5 F2 — the deploy guard markers and «born closed» for /plan/*
// (CLAUDE.md «Ο WORKER», «Τρεις κανόνες μίας πηγής» rule 3; αρχή 5).
// Read from worker/src/index.js itself — the deploy source — never a copy.
//   - the v5 tables never enter TABLES: the facade's "*" rows (owner all,
//     management/accountant GET) would open them by themselves (trap 3);
//   - PLAN_PERMS: no "*" anywhere, `var PLAN_PERMS = {` exactly once and in use
//     (esbuild drops an unused top-level var — the live guard would then miss it);
//   - the older markers (CLAUDE.md, and the features live since 24/10) stay exactly once;
//   - writes are closed in the source that is deployed (decision 22).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8');
const count = (needle) => src.split(needle).length - 1;
function liftVar(name) {
  const m = src.match(new RegExp(`(?:var|const) ${name} = \\{[\\s\\S]*?\\n\\};\\n`));
  assert.ok(m, `${name} not found in worker/src/index.js`);
  return m[0];
}
const TABLES = new Function(liftVar('TABLES') + '\nreturn TABLES;')();
const PLAN_PERMS = new Function(liftVar('PLAN_PERMS') + '\nreturn PLAN_PERMS;')();
const V5_TABLES = ['shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices', 'plan_config'];

test('no v5 table is reachable through the facade (TABLES pg / readView)', () => {
  for (const [id, cfg] of Object.entries(TABLES)) {
    assert.ok(!V5_TABLES.includes(cfg.pg), `${id} maps a v5 table: ${cfg.pg}`);
    assert.ok(!V5_TABLES.includes(cfg.readView), `${id} reads a v5 table: ${cfg.readView}`);
    for (const l of Object.values(cfg.links || {})) assert.ok(!V5_TABLES.includes(l.table), `${id} links a v5 table: ${l.table}`);
  }
  for (const t of V5_TABLES) assert.ok(!Object.prototype.hasOwnProperty.call(TABLES, t), `TABLES key ${t}`);
});

test('PLAN_PERMS: five roles, no wildcard, only GET/POST/PATCH', () => {
  assert.deepEqual(Object.keys(PLAN_PERMS).sort(), ['accountant', 'dispatcher', 'management', 'owner', 'warehouse']);
  for (const [role, map] of Object.entries(PLAN_PERMS)) {
    assert.ok(!Object.prototype.hasOwnProperty.call(map, '*'), `${role} has "*"`);
    for (const [res, methods] of Object.entries(map)) {
      assert.ok(!res.includes('*'), `${role}.${res}`);
      for (const m of methods) assert.ok(['GET', 'POST', 'PATCH'].includes(m), `${role}.${res} ${m}`);
    }
  }
});

test('deploy guard markers: the older ones and var PLAN_PERMS = { exactly once; PLAN_PERMS in use', () => {
  assert.equal(count('var PLAN_PERMS = {'), 1, 'var PLAN_PERMS = {');
  assert.match(src, /\nvar PLAN_PERMS = \{\n/, 'at column 0, alone on its line');
  assert.match(src, /function planCan\(role, resource, method\) \{\n {2}const r = PLAN_PERMS\[role\];/, 'planCan reads PLAN_PERMS');
  assert.match(src, /if \(!planCan\(caller\.role, route\.resource, method\)\)/, 'handlePlan calls planCan');
  assert.match(src, /if \(url\.pathname\.startsWith\("\/plan\/"\)\) \{\n {6}return handlePlan\(request, url, origin, env\);/, 'router reaches handlePlan');
  // inside the dispatcher block only: the lazy scan stops at the next 2-space key (another role)
  assert.match(src, /\n {2}dispatcher: \{\n(?:(?! {2}\S)[^\n]*\n)*? {4}order_stops: \["GET", "POST", "PATCH", "DELETE"\]/, 'dispatcher order_stops DELETE');
  assert.equal(count('"VS CD Date": "cross_dock_date"'), 1, 'VS CD Date');
  // the WORKSHOPS fields counted INSIDE the WORKSHOPS block: Country: "country" is in six tables, so a whole-file
  // count could never see it go missing from this one (CLAUDE.md: the three; review 23/10)
  const ws = (src.match(/\n {2}tblMiFxbm9ky8PCQi: \{\n[\s\S]*?\n {2}\},?\n/) || [''])[0];
  for (const m of ['Country: "country"', 'Aliases: "aliases"', '"VAT Number": "tax_id"', '"Legal Name": "legal_name"']) {
    assert.equal(ws.split(m).length - 1, 1, `WORKSHOPS ${m}`);
  }
  assert.equal(count('tblStockLots: {'), 1, 'tblStockLots');
  assert.equal(count('"Move Kind": "move_kind"'), 1, 'Move Kind');
  // the features live before F2 (rule of one source 3; deploys of 23-24/10): stop-delay, presence, temp per CMR
  assert.equal(count('"Delay Reason": "delay_reason"'), 1, 'Delay Reason');
  assert.equal(count('var PRESENCE_ROLES'), 1, 'PRESENCE_ROLES');
  assert.equal(count('Temp Per CMR'), 1, 'Temp Per CMR');
  assert.equal(count('{0,49}$/'), 1, 'VD /costs/rt order_ids (decision 29)');
});

test('writes closed until day L, in the deployed source (decision 22); one switch, no env override', () => {
  assert.equal(count('var PLAN_WRITES_OPEN = false;'), 1);
  assert.equal(count('PLAN_WRITES_OPEN = true'), 0);
  assert.ok(!/env\.PLAN_WRITES/.test(src), 'no environment switch beside the constant');
});

test('one DB-rule mapper still: no planRuleError / planRuleResponse beside stockRuleError', () => {
  assert.equal((src.match(/^function \w+RuleError\(/gm) || []).length, 1);
  assert.equal((src.match(/^function \w+RuleResponse\(/gm) || []).length, 1);
});
