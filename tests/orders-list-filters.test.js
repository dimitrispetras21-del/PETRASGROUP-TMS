// node --test tests/orders-list-filters.test.js
// SPEC of step 2b of the orders-lists unification (22/9/2026): the two
// _applyFilters bodies (orders_intl.js:722-748, orders_natl.js:568-595) as a
// pure function, written BEFORE the engine exists so that 2b is «passes the
// tests that describe today». Every assertion below is today's behaviour,
// including the two asymmetries the modules currently have:
//   · intl treats a missing Status as 'Pending' (both for 'Status' and the
//     '_status' select); natl compares Status literally, so an unset one
//     never matches — kept as-is here, to be decided in 2b, not silently fixed;
//   · natl has Type / _groupage / _trip; intl has Brand / _week / _status.
// The specs are the real OrdersList.filterSpecs.* objects (reviewer P4) —
// only the module-owned helpers/maps are stubbed.
// The queries reach the engine already lowercased + trimmed (intlSearch /
// natlSearch do that at the input) — the engine must not trim again.
//
// Target signature (skipped until it exists):
//   OrdersList.applyFilters(recs, filters, {
//     search: f => [strings the free-text search looks into],  // module-specific
//     eq:     ['Direction', 'Brand', ...],                    // exact-match fields
//     statusDefault: 'Pending' | undefined,                   // intl: 'Pending'
//   })
//   OrdersList.tripState(f)  → 'assigned' | 'unassigned'  (natl Linked Trip /
//                              NATIONAL TRIPS / NATIONAL TRIPS 2)
const { test } = require('node:test');
const assert = require('node:assert');
const OrdersList = require('../core/orders-list.js');

const missing = typeof OrdersList.applyFilters !== 'function';
const opts = { skip: missing && 'βήμα 2β: OrdersList.applyFilters δεν υπάρχει ακόμη' };

const rec = (id, fields) => ({ id, fields });
const ids = recs => recs.map(r => r.id);

// ── international ───────────────────────────────────────────────────────
const CLIENTS = { c1: 'ALPHA FRUITS', c2: 'Beta Logistics' };
// The REAL spec (reviewer P4): only the module helpers are stubbed.
const INTL = OrdersList.filterSpecs.intl({
  clientName: f => CLIENTS[(f['Client'] || [])[0]] || '',
  cleanSummary: s => s || '',
});
const intlRecs = [
  rec('a', { Client: ['c1'], Reference: 'REF-100', 'Order No': 165, Direction: 'Export', Brand: 'DPS', 'Week Number': 36, Status: 'Assigned', Goods: 'Kiwi', 'Loading Summary': 'Veria / Skydra' }),
  rec('b', { Client: ['c2'], Reference: 'ref-200', 'Order No': 166, Direction: 'Import', Brand: 'PETRAS', 'Week Number': 35, Goods: 'Cherries', 'Delivery Summary': 'Berlin' }),
  rec('c', { Client: ['c1'], Reference: 'REF-300', 'Order No': 167, Direction: 'Export', Brand: 'PETRAS', 'Week Number': 36, Status: 'Cancelled', Goods: 'Peaches' }),
];

test('intl: no filters → the same array, untouched', opts, () => {
  assert.strictEqual(OrdersList.applyFilters(intlRecs, {}, INTL), intlRecs);
});

test('intl: free-text search is a lowercase substring over client, Reference, Order No, summaries, Goods', opts, () => {
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { _q: 'alpha' }, INTL)), ['a', 'c']);   // client name
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { _q: 'ref-2' }, INTL)), ['b']);        // Reference, case-insensitive
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { _q: '166' }, INTL)), ['b']);          // Order No (number → string)
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { _q: 'skydra' }, INTL)), ['a']);       // Loading Summary
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { _q: 'berlin' }, INTL)), ['b']);       // Delivery Summary
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { _q: 'peach' }, INTL)), ['c']);        // Goods
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { _q: 'nothing' }, INTL)), []);
});

test('intl: Direction and Brand are exact matches, ANDed', opts, () => {
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { Direction: 'Export' }, INTL)), ['a', 'c']);
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { Brand: 'PETRAS' }, INTL)), ['b', 'c']);
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { Direction: 'Export', Brand: 'PETRAS' }, INTL)), ['c']);
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { Direction: 'export' }, INTL)), []);  // no case folding on selects
});

test('intl: Status / _status — a missing Status counts as Pending', opts, () => {
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { Status: 'Pending' }, INTL)), ['b']);
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { _status: 'Pending' }, INTL)), ['b']);
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { _status: 'Cancelled' }, INTL)), ['c']);
});

test('intl: _week compares Week Number as strings (select value vs number field)', opts, () => {
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { _week: '36' }, INTL)), ['a', 'c']);
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { _week: 35 }, INTL)), ['b']);
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { _week: '99' }, INTL)), []);
});

test('intl: empty/falsy filter values are ignored (intlFilter deletes them)', opts, () => {
  assert.deepStrictEqual(ids(OrdersList.applyFilters(intlRecs, { _q: '', Direction: '', Brand: undefined, _week: 0 }, INTL)), ['a', 'b', 'c']);
});

// ── national ────────────────────────────────────────────────────────────
const LOCS = { l1: 'Veria Cross-Dock', l2: 'Athens Market', l3: 'Thessaloniki Port' };
const NATL = OrdersList.filterSpecs.natl({ clientsMap: CLIENTS, locationsMap: LOCS });
const natlRecs = [
  rec('n1', { Reference: 'N-1', Client: ['c1'], 'Pickup Location 1': ['l1'], 'Delivery Location 1': ['l2'], Direction: 'North→South', Type: 'FTL', Status: 'Pending', 'Linked Trip': ['t1'] }),
  rec('n2', { Reference: 'N-2', Client: ['c2'], 'Pickup Location 1': ['l3'], 'Delivery Location': ['l1'], Direction: 'South→North', Type: 'Groupage', 'National Groupage': true, Goods: 'Apples' }),
  rec('n3', { Reference: 'N-3', Client: ['c1'], Direction: 'North→South', Type: 'FTL', Status: 'Assigned', 'NATIONAL TRIPS 2': ['t2'] }),
];

test('natl: search over Reference, client, pickup, delivery (Location 1 or legacy Delivery Location), Goods', opts, () => {
  assert.deepStrictEqual(ids(OrdersList.applyFilters(natlRecs, { _q: 'n-2' }, NATL)), ['n2']);
  assert.deepStrictEqual(ids(OrdersList.applyFilters(natlRecs, { _q: 'alpha' }, NATL)), ['n1', 'n3']);
  assert.deepStrictEqual(ids(OrdersList.applyFilters(natlRecs, { _q: 'port' }, NATL)), ['n2']);       // pickup
  assert.deepStrictEqual(ids(OrdersList.applyFilters(natlRecs, { _q: 'cross-dock' }, NATL)), ['n1', 'n2']); // delivery via both field names
  assert.deepStrictEqual(ids(OrdersList.applyFilters(natlRecs, { _q: 'apple' }, NATL)), ['n2']);
});

test('natl: Direction / Type / Status are literal — an unset Status never matches (today’s asymmetry with intl)', opts, () => {
  assert.deepStrictEqual(ids(OrdersList.applyFilters(natlRecs, { Direction: 'North→South' }, NATL)), ['n1', 'n3']);
  assert.deepStrictEqual(ids(OrdersList.applyFilters(natlRecs, { Type: 'Groupage' }, NATL)), ['n2']);
  assert.deepStrictEqual(ids(OrdersList.applyFilters(natlRecs, { Status: 'Pending' }, NATL)), ['n1']);
});

test('natl: _groupage keeps only National Groupage = true', opts, () => {
  assert.deepStrictEqual(ids(OrdersList.applyFilters(natlRecs, { _groupage: '1' }, NATL)), ['n2']);
});

test('natl: _trip assigned/unassigned from Linked Trip, NATIONAL TRIPS, NATIONAL TRIPS 2', opts, () => {
  assert.deepStrictEqual(ids(OrdersList.applyFilters(natlRecs, { _trip: 'assigned' }, NATL)), ['n1', 'n3']);
  assert.deepStrictEqual(ids(OrdersList.applyFilters(natlRecs, { _trip: 'unassigned' }, NATL)), ['n2']);
  assert.strictEqual(OrdersList.tripState({ 'NATIONAL TRIPS': ['x'] }), 'assigned');
  assert.strictEqual(OrdersList.tripState({ 'Linked Trip': [] }), 'unassigned');
  assert.strictEqual(OrdersList.tripState({}), 'unassigned');
});

test('natl: filters AND together in any combination', opts, () => {
  assert.deepStrictEqual(ids(OrdersList.applyFilters(natlRecs, { _q: 'alpha', Type: 'FTL', _trip: 'assigned', Status: 'Assigned' }, NATL)), ['n3']);
});

test('specs are the real ones: eq lists and the Status asymmetry', () => {
  assert.deepStrictEqual(INTL.eq, ['Direction', 'Brand']);
  assert.strictEqual(INTL.statusDefault, 'Pending');
  assert.deepStrictEqual(NATL.eq, ['Direction', 'Type']);
  assert.strictEqual(NATL.statusDefault, undefined);
});
