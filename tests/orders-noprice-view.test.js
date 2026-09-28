// tests/orders-noprice-view.test.js — run: node --test tests/orders-noprice-view.test.js
// The pure half of modules/orders_noprice_view.js (the «Χωρίς τιμή» view):
// price parsing, which records are listed, their order, the last-price hint and
// what counts as «Συμπληρώθηκαν σήμερα» in the audit trail. Runs the REAL
// module (its module.exports), not a copy.
const { test } = require('node:test');
const assert = require('node:assert');
const NP = require('../modules/orders_noprice_view.js');

test('parsePrice: Greek money input → number, anything doubtful → null', () => {
  assert.strictEqual(NP.parsePrice('950'), 950);
  assert.strictEqual(NP.parsePrice('950,5'), 950.5);
  assert.strictEqual(NP.parsePrice('950,50'), 950.5);
  assert.strictEqual(NP.parsePrice('1.250,00'), 1250);
  assert.strictEqual(NP.parsePrice('1.250'), 1250);          // strict thousands shape
  assert.strictEqual(NP.parsePrice('12.500.000'), 12500000);
  assert.strictEqual(NP.parsePrice('950.555'), 950555);       // Greek: a dot + 3 digits IS thousands
  assert.strictEqual(NP.parsePrice('1250.50'), 1250.5);      // dot typed as decimal
  assert.strictEqual(NP.parsePrice(' 3.300,00 € '), 3300);
  assert.strictEqual(NP.parsePrice('1250,5'), 1250.5);
  // rejected: empty, zero, negative, letters, ambiguous shapes, >2 decimals
  for (const bad of ['', '   ', null, undefined, '0', '0,00', '-5', 'abc', '9 5 0x', '1,2,3', '1.25,00', '950,555', '1.2345', '.5']) {
    assert.strictEqual(NP.parsePrice(bad), null, 'must reject ' + JSON.stringify(bad));
  }
});

const rec = (id, type, f) => ({ id, _type: type, fields: f });
const stateByPrice = r => (r.fields.Invoiced ? { key: 'invoiced' } : !(parseFloat(r.fields.Price) > 0) ? { key: 'blocked', reason: 'price' } : { key: 'ready' });

test('selectNoPrice: only blocked-for-price, filtered by scope', () => {
  const recs = [
    rec('a', 'intl', { Price: null }),
    rec('b', 'intl', { Price: 500 }),
    rec('c', 'natl', {}),
    rec('d', 'natl', { Price: 0 }),
    rec('e', 'intl', { Invoiced: true }),
  ];
  const s = r => (r.id === 'd' ? { key: 'blocked', reason: 'sheets' } : stateByPrice(r));
  assert.deepStrictEqual(NP.selectNoPrice(recs, s, 'all').map(r => r.id), ['a', 'c']);
  assert.deepStrictEqual(NP.selectNoPrice(recs, s, 'intl').map(r => r.id), ['a']);
  assert.deepStrictEqual(NP.selectNoPrice(recs, s, 'natl').map(r => r.id), ['c']);
});

test('groupByClient: clients by their oldest item, items oldest first, undated last', () => {
  const items = [
    rec('n1', 'natl', { Client: ['recC3'], 'Delivery DateTime': '2026-09-24' }),
    rec('i2', 'intl', { Client: ['recC2'], 'Delivery DateTime': '2026-09-21T10:00:00Z' }),
    rec('i1', 'intl', { Client: ['recC1'], 'Delivery DateTime': '2026-09-11' }),
    rec('i3', 'intl', { Client: ['recC2'], 'Delivery DateTime': '2026-09-05' }),
    rec('i4', 'intl', { Client: ['recC2'] }),
  ];
  const g = NP.groupByClient(items);
  assert.deepStrictEqual(g.map(x => x.clientId), ['recC2', 'recC1', 'recC3']);
  assert.deepStrictEqual(g[0].items.map(r => r.id), ['i3', 'i2', 'i4']);
});

test('routeKey: first loading + first delivery, per type, both needed', () => {
  assert.strictEqual(NP.routeKey(rec('x', 'intl', { 'Loading Location 1': ['L1'], 'Unloading Location 1': ['L2'] })), 'L1>L2');
  assert.strictEqual(NP.routeKey(rec('x', 'natl', { 'Pickup Location 1': ['L1'], 'Delivery Location 2': ['L3'] })), 'L1>L3');
  assert.strictEqual(NP.routeKey(rec('x', 'natl', { 'Pickup Location 1': ['L1'], 'Delivery Location': ['L4'] })), 'L1>L4');
  assert.strictEqual(NP.routeKey(rec('x', 'intl', { 'Loading Location 1': ['L1'] })), '');
});

test('lastPriceHint: most recent OTHER priced order, same client, same route', () => {
  const route = { 'Loading Location 1': ['L1'], 'Unloading Location 1': ['L2'] };
  const target = rec('t', 'intl', { ...route, Client: ['C1'], 'Delivery DateTime': '2026-09-10' });
  const pool = [
    target,
    rec('old', 'intl', { ...route, Client: ['C1'], Price: 900, 'Delivery DateTime': '2026-08-01' }),
    rec('new', 'intl', { ...route, Client: ['C1'], Price: 950, 'Delivery DateTime': '2026-09-15' }),
    rec('zero', 'intl', { ...route, Client: ['C1'], Price: 0, 'Delivery DateTime': '2026-09-20' }),
    rec('other', 'intl', { ...route, Client: ['C2'], Price: 1200, 'Delivery DateTime': '2026-09-25' }),
    rec('route', 'intl', { 'Loading Location 1': ['L1'], 'Unloading Location 1': ['L9'], Client: ['C1'], Price: 700, 'Delivery DateTime': '2026-09-26' }),
  ];
  const h = NP.lastPriceHint(target, pool);
  assert.strictEqual(h.rec.id, 'new');
  assert.strictEqual(h.price, 950);
  assert.strictEqual(h.date, '2026-09-15');
  assert.strictEqual(NP.lastPriceHint(rec('u', 'intl', { ...route, Client: ['C9'] }), pool), null);   // first time
});

test('filledFromAudit: before without price → after with price; one per record; newest first', () => {
  const E = (id, rec, before, after, at, action = 'update', table = 'orders') => ({
    id, record_id: rec, table_name: table, action, actor: 'dimitris', created_at: at,
    before_data: before === undefined ? null : JSON.stringify(before),
    after_data: after === undefined ? null : JSON.stringify(after),
  });
  const entries = [
    E(1, 'recA', { price: null }, { price: 950 }, '2026-09-28T05:52:00Z'),
    E(2, 'recB', { price: 0 }, { price: '420.00' }, '2026-09-28T06:10:00Z', 'update', 'national_orders'),
    E(3, 'recC', { price: 500 }, { price: 520 }, '2026-09-28T06:20:00Z'),        // a correction, not a fill
    E(4, 'recD', undefined, { price: 800 }, '2026-09-28T06:30:00Z'),             // no before row → unprovable
    E(5, 'recE', { price: null }, { price: null }, '2026-09-28T06:40:00Z'),      // other field edited
    E(6, 'recF', null, { price: 300 }, '2026-09-28T06:50:00Z', 'create'),        // created with a price
    E(7, 'recA', { price: null }, { price: 980 }, '2026-09-28T07:00:00Z'),       // same record again later
    { id: 8, record_id: 'recG', table_name: 'orders', action: 'update', created_at: '2026-09-28T07:10:00Z', before_data: { price: -2 }, after_data: { price: 100 } },   // objects, not strings
  ];
  const out = NP.filledFromAudit(entries);
  assert.deepStrictEqual(out.map(x => x.recordId), ['recG', 'recA', 'recB']);
  assert.strictEqual(out.find(x => x.recordId === 'recA').price, 980);
  assert.strictEqual(out.find(x => x.recordId === 'recB').table, 'national_orders');
  assert.strictEqual(out.find(x => x.recordId === 'recB').price, 420);
});

test('mergeFilled: audit wins over this tab, tab adds what audit cannot show', () => {
  const a = [{ recordId: 'r1', table: 'orders', price: 950, at: '2026-09-28T06:00:00Z', actor: 'dimitris' }];
  const s = [
    { recordId: 'r1', table: 'orders', price: 950, at: '2026-09-28T06:00:01Z', actor: 'dimitris' },
    { recordId: 'r1', table: 'national_orders', price: 300, at: '2026-09-28T07:00:00Z', actor: 'dimitris' },
  ];
  const m = NP.mergeFilled(a, s);
  assert.strictEqual(m.length, 2);
  assert.deepStrictEqual(m.map(x => x.table), ['national_orders', 'orders']);
  assert.strictEqual(m[1].at, '2026-09-28T06:00:00Z');
});
