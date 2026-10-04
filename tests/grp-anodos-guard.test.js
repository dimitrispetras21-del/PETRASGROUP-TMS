// Groupage form (orders_natl.js _grpSubmit): South→North refused out loud
// (owner 5/10, «Να χτιστεί το εργαλείο ανόδου τώρα»). The form only knows
// the ΚΑΘΟΔΟΣ shape — one pickup → N deliveries — so an ΑΝΟΔΟΣ entry was saved
// in that shape. Temporary until the ΑΝΟΔΟΣ groupage tool lands.
// UNIT ONLY: _grpSubmit extracted verbatim and run against stubs; the browser
// proof is tests/critics/natl-wave0-proof.js («P1-β»).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ON = fs.readFileSync(path.join(__dirname, '..', 'modules', 'orders_natl.js'), 'utf8');
const fn = (ON.match(/async function _grpSubmit\(\) \{[\s\S]*?\n\}\n/) || [''])[0];

async function run(direction) {
  const toasts = [], chain = [];
  const vals = { nf_Direction: direction, lv_npickup: 'recLoc1', nf_LoadDate: '2026-10-06', nf_Goods: '', nf_Temp: '' };
  const ctx = {
    document: { getElementById: id => (id in vals ? { value: vals[id] } : null) },
    getRefLocations: () => [{ id: 'recLoc1', fields: { Name: 'X' } }],
    _grpGroups: () => [{ stops: [{ date: '2026-10-06' }] }],
    _natlWriteGroupageChain: async (c, g) => { chain.push(c); return { orders: [1], gls: [1] }; },
    toast: (m, k) => toasts.push([m, k]), invalidateCache: () => {}, closeModal: () => {},
    TABLES: {}, console,
  };
  vm.runInNewContext(fn + '\nthis._grpSubmit=_grpSubmit;', ctx);
  await ctx._grpSubmit();
  return { toasts, chain };
}

test('_grpSubmit extracted', () => assert.ok(fn, '_grpSubmit not found in modules/orders_natl.js'));

test('South→North: refused with an error toast, the groupage chain is never called', async () => {
  const { toasts, chain } = await run('South→North');
  assert.strictEqual(chain.length, 0);
  assert.strictEqual(toasts.length, 1);
  assert.match(toasts[0][0], /groupage ανόδου .*χτίζεται τώρα/);
  assert.match(toasts[0][0], /χωριστές εθνικές με το ίδιο φορτηγό/);
  assert.strictEqual(toasts[0][1], 'error');
});

test('North→South: unchanged — the chain is written', async () => {
  const { chain } = await run('North→South');
  assert.strictEqual(chain.length, 1);
  assert.strictEqual(chain[0].direction, 'North→South');
});

test('no direction: still the old «υποχρεωτική» refusal', async () => {
  const { toasts, chain } = await run('');
  assert.strictEqual(chain.length, 0);
  assert.match(toasts[0][0], /Η κατεύθυνση είναι υποχρεωτική/);
});
