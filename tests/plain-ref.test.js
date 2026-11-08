// tests/plain-ref.test.js — run: node --test tests/plain-ref.test.js
// core/plain-ref.js: the one text that names an order or a trip (owner 8/11,
// «μηνύματα χωρίς κωδικούς»). The examples are the approved before → after
// (docs/plain-messages/2026-11-08-before-after.md).
'use strict';
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../core/plain-ref.js');

const CODE = /RT-\d|#\d|\brec[A-Za-z0-9]{6,}|GI-[A-Z0-9]/;

test('loads as a node module and as a browser global (only window.PlainRef)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../core/plain-ref.js'), 'utf8');
  const win = {};
  vm.runInNewContext(src, { window: win });
  assert.deepStrictEqual(Object.keys(win), ['PlainRef']);
  assert.strictEqual(typeof win.PlainRef.orderOf, 'function');
});

test('day / dm: local calendar day, no zero pad, Greek weekday', () => {
  assert.strictEqual(P.day('2026-11-02'), 'Δευ 2/11');
  assert.strictEqual(P.dm('2026-11-02'), '2/11');
  // a datetime is read in local (Athens) time: 23:30Z on 1/11 is already 2/11 there
  assert.strictEqual(P.day('2026-11-01T23:30:00.000Z'), 'Δευ 2/11');
  assert.strictEqual(P.day(''), '');
  assert.strictEqual(P.day('not a day'), '');
});

test('person: surname + initial, one word as it is', () => {
  assert.strictEqual(P.person('Σαρίδης Γεώργιος'), 'Σαρίδης Γ.');
  assert.strictEqual(P.person('  Σαρίδης  '), 'Σαρίδης');
  assert.strictEqual(P.person(null), '');
});

test('order: client, route, day — each part optional, never a code', () => {
  assert.strictEqual(P.order({ client: 'ΦΑΓΕ', from: 'Βέροια', to: 'Μόναχο', day: '2026-11-02' }), 'ΦΑΓΕ, Βέροια → Μόναχο · Δευ 2/11');
  assert.strictEqual(P.order({ client: 'ΦΑΓΕ', from: 'Βέροια', to: 'Μόναχο' }), 'ΦΑΓΕ, Βέροια → Μόναχο');
  assert.strictEqual(P.order({ client: 'ΦΑΓΕ' }), 'ΦΑΓΕ');
  assert.strictEqual(P.order({ to: 'Μόναχο' }), 'για Μόναχο');
  assert.strictEqual(P.order({ from: 'Βέροια' }), 'από Βέροια');
  assert.strictEqual(P.order({ day: '2026-11-02' }), 'φόρτωση Δευ 2/11');
  assert.strictEqual(P.order({}), '');
  assert.strictEqual(P.order(null), '');
});

test('trip: plate · driver · day; partner by name; a span only across days', () => {
  assert.strictEqual(P.trip({ plate: 'ΚΖΗ-1234', driver: 'Σαρίδης Γεώργιος', day: '2026-11-02' }), 'ΚΖΗ-1234 · Σαρίδης Γ. · Δευ 2/11');
  assert.strictEqual(P.trip({ plate: 'ΚΖΗ-1234', driver: 'Σαρίδης', day: '2026-11-02', dayEnd: '2026-11-07' }), 'ΚΖΗ-1234 · Σαρίδης · 2/11–7/11');
  assert.strictEqual(P.trip({ plate: 'ΚΖΗ-1234', day: '2026-11-02', dayEnd: '2026-11-02' }), 'ΚΖΗ-1234 · Δευ 2/11');
  assert.strictEqual(P.trip({ partner: 'Trans Balkan', driver: 'x y', day: '2026-11-02' }), 'Trans Balkan · Δευ 2/11');
  assert.strictEqual(P.trip({}), '');
});

test('list: «και», and the rest counted past max', () => {
  assert.strictEqual(P.list(['α']), 'α');
  assert.strictEqual(P.list(['α', 'β']), 'α και β');
  assert.strictEqual(P.list(['α', 'β', 'γ']), 'α, β και γ');
  assert.strictEqual(P.list(['α', 'β', 'γ', 'δ', 'ε'], 3), 'α, β, γ και 2 ακόμη');
  assert.strictEqual(P.list(['', null, 'β']), 'β');
  assert.strictEqual(P.list([]), '');
});

test('orderOf: an ORDERS record, with the page lookups; never the Reference or the id', () => {
  const rec = { id: 'recAbC123XYZ', fields: {
    Reference: 'ΦΑΓ-118', Client: ['recCLIENT1'], 'Loading Summary': '"Βέροια"', 'Delivery Summary': '"München" / "Augsburg"',
    'Loading DateTime': '2026-11-02T06:00:00.000Z',
  } };
  globalThis.orderClientName = (f) => (f.Client && f.Client[0] === 'recCLIENT1' ? 'ΦΑΓΕ' : '');
  try {
    const t = P.orderOf(rec);
    assert.strictEqual(t, 'ΦΑΓΕ, Βέροια → München +1 · Δευ 2/11');
    assert.ok(!t.includes('ΦΑΓ-118') && !CODE.test(t));
    assert.strictEqual(P.orderOf(rec, { day: false }), 'ΦΑΓΕ, Βέροια → München +1');
    // a page's own location map for Location 1, used only when the Summary is empty
    assert.strictEqual(P.orderOf({ 'Client Name': 'ΦΑΓΕ', 'Loading Location 1': ['recL9'], 'Delivery Summary': 'Graz' }, { loc: (id) => (id === 'recL9' ? 'Veria X' : '') }), 'ΦΑΓΕ, Veria X → Graz');
  } finally { delete globalThis.orderClientName; }
  // no lookups at all: the order's own Client Name, the locations through getRefLocations
  globalThis.getRefLocations = () => [{ id: 'recLOC1', fields: { Name: 'Verona' } }];
  try {
    assert.strictEqual(P.orderOf({ 'Client Name': 'Lidl', 'Loading Location 1': ['recLOC1'] }), 'Lidl, από Verona');
  } finally { delete globalThis.getRefLocations; }
  // a lookup that throws gives fewer words, never a throw
  globalThis.orderClientName = () => { throw new Error('x'); };
  try { assert.strictEqual(P.orderOf({ 'Delivery Summary': 'Graz' }), 'για Graz'); } finally { delete globalThis.orderClientName; }
  assert.strictEqual(P.orderOf(null), '');
  // a name can never open a tag in a toast
  assert.strictEqual(P.order({ client: 'A<img src=x onerror=1>B' }), 'Aimg src=x onerror=1B');
});

test('tripOf: a /costs/rt row with /costs/lookups; partner trips by the partner', () => {
  const lk = {
    trucks: [{ id: 7, license_plate: 'ΚΖΗ-1234' }],
    drivers: [{ id: 3, full_name: 'Σαρίδης Γεώργιος' }],
    partners: [{ id: 5, company_name: 'Trans Balkan' }],
  };
  const own = { id: 812, code: 'RT-1543', trip_type: 'OWN', truck_id: 7, driver_id: 3, date_start: '2026-11-02', date_end: '2026-11-07' };
  assert.strictEqual(P.tripOf(own, lk), 'ΚΖΗ-1234 · Σαρίδης Γ. · Δευ 2/11');
  assert.strictEqual(P.tripOf(own, lk, { span: true }), 'ΚΖΗ-1234 · Σαρίδης Γ. · 2/11–7/11');
  assert.strictEqual(P.tripOf({ trip_type: 'PARTNER', partner_id: 5, date_start: '2026-11-02' }, lk), 'Trans Balkan · Δευ 2/11');
  // nothing known but the day: the day, never the code
  const t = P.tripOf({ code: 'RT-1543', truck_id: 99, date_start: '2026-11-02' }, lk);
  assert.strictEqual(t, 'Δευ 2/11');
  assert.strictEqual(P.tripOf(null, null), '');
});
