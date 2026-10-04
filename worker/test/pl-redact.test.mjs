// P&L redaction by role (4/10/2026, ledger A7 / Sotiris report SA-11): the
// owner lock 23/8 «dispatcher δεν βλέπει P&L» was not enforced by the facade —
// every dispatcher read of PARTNER ASSIGNMENTS carried Client Revenue, Gross
// Profit and Margin Percent. Like invoice-mark-guard.test.mjs, this lifts the
// real source text out of the bundled worker/src/index.js (no exports there)
// so the test exercises the code that is deployed, not a copy (αρχή 3).
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8');

function lift(re, what) {
  const m = src.match(re);
  assert.ok(m, `${what} not found in worker/src/index.js`);
  return m[0];
}
const parts = [
  lift(/var TABLES = \{[\s\S]*?\n\};\n/, 'TABLES'),
  lift(/var PL_READERS = [^\n]*\n/, 'PL_READERS'),
  lift(/function cfgForRole\(cfg, role\) \{[\s\S]*?\n\}\n/, 'cfgForRole'),
  lift(/function columnToLabel\(cfg\) \{[\s\S]*?\n\}\n/, 'columnToLabel'),
  lift(/function fieldsToColumns\(cfg, fields\) \{[\s\S]*?\n\}\n/, 'fieldsToColumns'),
  lift(/function filterFieldMap\(cfg\) \{[\s\S]*?\n\}\n/, 'filterFieldMap'),
  lift(/function toAirtableRecord\(row, colToLabel\) \{[\s\S]*?\n\}\n/, 'toAirtableRecord'),
];
const W = new Function('__name', parts.join('\n') +
  '\nreturn { TABLES, PL_READERS, cfgForRole, columnToLabel, fieldsToColumns, filterFieldMap, toAirtableRecord };')(() => {});

const PA = W.TABLES.tblUhgqnmiam5MGNK;
const ORDERS = W.TABLES.tblgHlNmLBH3JTdIM;
const PL = ['Client Revenue', 'Gross Profit', 'Margin Percent'];
// A row as `select=*` on partner_assignments_computed returns it.
const viewRow = {
  id: 7, legacy_id: 'recPA1', airtable_seq: 12, partner_rate: 900, status: 'Assigned',
  client_revenue: 1500, gross_profit: 600, margin_percent: 40, partner_id: 3, order_id: 9,
};
const readAs = (cfg, role) => {
  const c = W.cfgForRole(cfg, role);
  return W.toAirtableRecord(viewRow, W.columnToLabel(c)).fields;
};

test('PARTNER ASSIGNMENTS declares exactly the three P&L labels as plOnly', () => {
  assert.deepStrictEqual(PA.plOnly, PL);
  for (const l of PL) assert.ok(PA.computed[l], `${l} must still be a computed label for P&L readers`);
});

test('dispatcher read (list / get-one shape) loses every P&L label; Partner Rate stays', () => {
  const f = readAs(PA, 'dispatcher');
  for (const l of PL) assert.ok(!(l in f), `${l} leaked to dispatcher`);
  assert.strictEqual(f['Partner Rate'], 900);
  assert.strictEqual(f.Status, 'Assigned');
});

test('owner, management, accountant keep the P&L labels', () => {
  for (const role of ['owner', 'management', 'accountant']) {
    const f = readAs(PA, role);
    assert.strictEqual(f['Client Revenue'], 1500, role);
    assert.strictEqual(f['Gross Profit'], 600, role);
    assert.strictEqual(f['Margin Percent'], 40, role);
  }
});

test('closed by default: warehouse and an unknown future role get no P&L', () => {
  for (const role of ['warehouse', 'driver', undefined]) {
    const f = readAs(PA, role);
    for (const l of PL) assert.ok(!(l in f), `${l} leaked to ${role}`);
  }
});

test('dispatcher: no computed re-read after a write, no filter on P&L, no write accepted', () => {
  const c = W.cfgForRole(PA, 'dispatcher');
  // shapeOneWithLinks / batch shaper re-read only when cfg.computed is set.
  assert.strictEqual(c.computed, undefined);
  const fm = W.filterFieldMap(c);
  for (const l of PL) assert.ok(!(l in fm), `${l} filterable by dispatcher`);
  assert.deepStrictEqual(W.fieldsToColumns(c, { 'Gross Profit': 1, 'Partner Rate': 950 }), { partner_rate: 950 });
  assert.deepStrictEqual(c.plRedacted, PL);
});

test('the original config is never mutated (owner after dispatcher still sees P&L)', () => {
  W.cfgForRole(PA, 'dispatcher');
  assert.ok(PA.computed['Gross Profit']);
  assert.strictEqual(readAs(PA, 'owner')['Gross Profit'], 600);
});

test('Price stays visible to the dispatcher on ORDERS (owner lock: until the P&L phase)', () => {
  const c = W.cfgForRole(ORDERS, 'dispatcher');
  assert.strictEqual(c, ORDERS, 'tables without plOnly pass through untouched');
  assert.strictEqual(c.fields.Price, 'price');
});
