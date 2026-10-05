// node --test tests/relay-core.test.js
// core/relay.js (migration 060, owner 4/10 «οκ προχωρα με τις τοπικες
// παραδοσεις») — the pure parts every screen leans on: which orders may take a
// relay, how relays are read (batched FIND on Parent Order, loud when the
// Worker lacks «Move Kind»), a driver's track record, and the read-back check
// that turns a silently dropped label into a named problem. The board itself
// is proven by tests/critics/local-relay-weekly-proof.js.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// core/data-helpers.js as the browser loads it: orderClientName is the ONE
// client-name rule Relay.orderName and the Weekly board share (principle 3).
// The stubs below then take over the reference data.
require('node:vm').runInThisContext(require('node:fs').readFileSync(path.resolve(__dirname, '../core/data-helpers.js'), 'utf8'));
// Browser globals relay.js uses at call time (utils/data-helpers/api).
global.toLocalDate = v => String(v || '').slice(0, 10);
global.getLinkedId = v => (Array.isArray(v) ? v[0] : v) || '';
global.isPreorder = f => !!f && f['Ops Status'] === 'Provisional' && f['Status'] !== 'Cancelled';
global.TABLES = { LOCAL_MOVES: 'local_moves', ORDERS: 'orders' };
global.escapeHtml = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
global.getRefTrucks = () => [{ id: 'recTk1', fields: { 'License Plate': 'INT-1' } }, { id: 'recTkL', fields: { 'License Plate': 'LOC-1' } }];
global.getRefTrailers = () => [{ id: 'recTl1', fields: { 'License Plate': 'TRL-1' } }];
global.getRefDrivers = () => [];
global.getRefLocations = () => [{ id: 'recV', fields: { Name: 'CROSS-DOCK', City: 'Veroia' } }, { id: 'recN', fields: { Name: 'NAOUSA' } }];
let calls = [];
let reply = () => [];
let deletes = [];
global.atGetAll = async (table, opts) => { calls.push({ table, f: opts.filterByFormula, fields: opts.fields, sort: opts.sort }); return reply(opts.filterByFormula, table); };
global.atDelete = async (table, id) => { deletes.push({ table, id }); };
const Relay = require(path.resolve(__dirname, '../core/relay.js'));

const ord = (f) => ({ id: 'recO', fields: Object.assign({ Direction: 'Import', 'Delivery DateTime': '2026-10-05', 'Loading DateTime': '2026-10-02' }, f) });

test('kind follows the direction: import → delivery, export → loading', () => {
  assert.strictEqual(Relay.kindFor({ Direction: 'Import' }), 'relay_delivery');
  assert.strictEqual(Relay.kindFor({ Direction: 'Export' }), 'relay_loading');
  assert.strictEqual(Relay.kindFor({}), null);
});

test('blockReason mirrors the base: VS, cancelled, pre-order, split parent hidden; partner and no date disabled', () => {
  assert.strictEqual(Relay.blockReason(ord({})), '');
  assert.strictEqual(Relay.blockReason(ord({ 'Veroia Switch': true })), 'vs');
  assert.strictEqual(Relay.blockReason(ord({ Status: 'Cancelled' })), 'cancelled');
  assert.strictEqual(Relay.blockReason(ord({ 'Ops Status': 'Provisional' })), 'preorder');
  assert.strictEqual(Relay.blockReason(ord({}), { isSplitParent: true }), 'split_parent');
  assert.strictEqual(Relay.blockReason(ord({ Partner: ['recP1'] })), 'partner');
  assert.strictEqual(Relay.blockReason(ord({ 'Is Partner Trip': true })), 'partner');
  assert.strictEqual(Relay.blockReason(ord({ 'Delivery DateTime': '' })), 'no_date');
  assert.strictEqual(Relay.isHiddenReason('no_date'), false);
  assert.strictEqual(Relay.isHiddenReason('partner'), false, 'shown disabled, with the reason');
  assert.strictEqual(Relay.isHiddenReason('vs'), true);
  assert.strictEqual(Relay.isHiddenReason(''), false);
});

test('«done» is the ORDER status: delivery = Delivered; loading = In Transit or Delivered', () => {
  assert.strictEqual(Relay.isDone({ Status: 'In Transit' }, 'relay_delivery'), false);
  assert.strictEqual(Relay.isDone({ Status: 'Delivered' }, 'relay_delivery'), true);
  assert.strictEqual(Relay.isDone({ Status: 'In Transit' }, 'relay_loading'), true);
  assert.strictEqual(Relay.isDone({ Status: 'Assigned' }, 'relay_loading'), false);
});

test('loadForOrders: FIND on {Parent Order}, 50 per request, «Move Kind» in the filter, explicit fields, Cancelled and plain moves left out', async () => {
  calls = [];
  const ids = Array.from({ length: 95 }, (_, i) => 'recA' + i);
  reply = f => [
    { id: 'recR1', fields: { 'Move Kind': 'relay_delivery', 'Parent Order': ['recA1'], Status: 'Assigned' } },
    { id: 'recR2', fields: { 'Move Kind': 'relay_delivery', 'Parent Order': ['recA2'], Status: 'Cancelled' } },
    { id: 'recR3', fields: { 'Move Kind': 'local', 'Parent Order': ['recA3'], Status: 'Pending' } },
  ].filter(r => f.includes('"' + r.fields['Parent Order'][0] + '"'));
  const recs = await Relay.loadForOrders([...ids, 'not-an-id', '']);
  assert.strictEqual(calls.length, 2, 'two batches for 95 ids');
  assert.ok(calls.every(c => c.table === 'local_moves'));
  assert.ok(calls[0].f.startsWith('AND(OR(FIND("recA0",ARRAYJOIN({Parent Order},","))>0,'));
  assert.ok(calls.every(c => c.f.endsWith(',{Move Kind}!=BLANK())')), 'the probe: an older Worker answers 422 instead of 0 rows');
  assert.strictEqual((calls[0].f.match(/FIND\(/g) || []).length, 50);
  assert.strictEqual((calls[1].f.match(/FIND\(/g) || []).length, 45);
  assert.ok(encodeURIComponent(calls[0].f).length < 4500, 'one request stays near 4 KB of URL: ' + encodeURIComponent(calls[0].f).length);
  assert.deepStrictEqual(calls[0].fields, ['Parent Order', 'Move Kind', 'Driver', 'Truck', 'Trailer', 'From Location', 'To Location', 'Time From', 'Date', 'Status']);
  assert.ok(!calls.some(c => c.f.includes('not-an-id')), 'only record ids reach the formula');
  assert.deepStrictEqual(recs.map(r => r.id), ['recR1']);
});

test('loadForOrders: an older Worker (422 on the «Move Kind» filter, or rows without it) THROWS instead of guessing', async () => {
  reply = () => { throw new Error('Unsupported query for this table'); };
  await assert.rejects(() => Relay.loadForOrders(['recA1']), e => e.code === 'no_move_kind' && /Move Kind/.test(e.message) && /060/.test(e.message));
  reply = () => [{ id: 'recR1', fields: { 'Parent Order': ['recA1'], Status: 'Assigned' } }];
  await assert.rejects(() => Relay.loadForOrders(['recA1']), e => e.code === 'no_move_kind' && /Move Kind/.test(e.message));
  reply = () => { throw new Error('Σφάλμα σύνδεσης'); };
  await assert.rejects(() => Relay.loadForOrders(['recA1']), e => !e.code && /σύνδεσης/.test(e.message), 'any other failure passes through as it is');
});

test('loadForOrders: no ids → no request', async () => {
  calls = [];
  assert.deepStrictEqual(await Relay.loadForOrders([]), []);
  assert.strictEqual(calls.length, 0);
});

test('index keeps ONE relay per order and kind (a second is a base fault, logged)', () => {
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try {
    const by = Relay.index([
      { id: 'r1', fields: { 'Move Kind': 'relay_delivery', 'Parent Order': ['o1'] } },
      { id: 'r2', fields: { 'Move Kind': 'relay_delivery', 'Parent Order': ['o1'] } },
      { id: 'r3', fields: { 'Move Kind': 'relay_loading', 'Parent Order': ['o2'] } },
    ]);
    assert.strictEqual(by.o1.relay_delivery.id, 'r1');
    assert.strictEqual(by.o2.relay_loading.id, 'r3');
    assert.strictEqual(warned, 1);
  } finally { console.warn = warn; }
});

test('verify: every label sent + what the base derives; a dropped one is named', () => {
  const want = { orderId: 'recO', kind: 'relay_delivery', drv: 'recD', trk: '', trl: 'recT', ptLabel: 'From Location', pt: 'recV', time: '07:00', day: '2026-10-05' };
  const good = { fields: { 'Parent Order': ['recO'], 'Move Kind': 'relay_delivery', Driver: ['recD'], Trailer: ['recT'], 'From Location': ['recV'], 'Time From': '07:00', Date: '2026-10-05', Status: 'Assigned' } };
  assert.deepStrictEqual(Relay.verify(good, want), []);
  const noTrailer = JSON.parse(JSON.stringify(good)); delete noTrailer.fields.Trailer;
  assert.deepStrictEqual(Relay.verify(noTrailer, want), ['Ρυμούλκα']);
  const stray = JSON.parse(JSON.stringify(good)); stray.fields.Truck = ['recX'];
  assert.deepStrictEqual(Relay.verify(stray, want), ['Τράκτορας'], '«ίδιος» means NO Truck on the row');
  const noTrigger = JSON.parse(JSON.stringify(good)); delete noTrigger.fields.Date; noTrigger.fields.Status = 'Pending';
  assert.deepStrictEqual(Relay.verify(noTrigger, want).map(s => s.split(' ')[0]), ['Ημέρα', 'Κατάσταση']);
  // An empty read-back (the row is not what was sent at all): everything but
  // the two empty links (driver «ΠΡΟΣ ΑΝΑΘΕΣΗ», tractor «ίδιος») is named.
  assert.deepStrictEqual(Relay.verify({ fields: {} }, Object.assign({}, want, { drv: '' })).map(s => s.split(' ')[0]),
    ['Παραγγελία', 'Είδος', 'Ρυμούλκα', 'Από', 'Ώρα', 'Ημέρα', 'Κατάσταση']);
});

test('fmtDay: the boards\' «Δευ 05/10», with the year in a track record', () => {
  assert.strictEqual(Relay.fmtDay('2026-10-05'), 'Δευ 05/10');
  assert.strictEqual(Relay.fmtDay('2026-10-03', true), 'Σάβ 03/10/26');
  assert.strictEqual(Relay.fmtDay(''), '—');
});

test('remove: the DELETE only — the caller re-reads and judges', async () => {
  deletes = []; calls = [];
  await Relay.remove('recR9');
  assert.deepStrictEqual(deletes, [{ table: 'local_moves', id: 'recR9' }]);
  assert.strictEqual(calls.length, 0, 'no re-read inside remove');
});

test('loadForDriver: FIND on {Driver} + the probe, Date desc, Cancelled dropped, plain errands kept, order numbers read once', async () => {
  calls = [];
  reply = (f, table) => table === 'orders'
    ? [{ id: 'recO1', fields: { 'Order No': 415, Truck: ['recTk1'], Trailer: ['recTl1'] } }]
    : [
      { id: 'recM1', fields: { 'Move Kind': 'relay_delivery', 'Parent Order': ['recO1'], Driver: ['recD'], Trailer: ['recTl1'], 'From Location': ['recV'], 'Time From': '07:00', Date: '2026-10-05', Status: 'Assigned' } },
      { id: 'recM2', fields: { 'Move Kind': 'relay_delivery', 'Parent Order': ['recO1'], Driver: ['recD'], Date: '2026-10-04', Status: 'Cancelled' } },
      { id: 'recM3', fields: { 'Move Kind': 'local', Driver: ['recD'], Truck: ['recTkL'], 'From Location': ['recV'], 'To Location': ['recN'], Description: 'Παλέτες', Date: '2026-10-03', Status: 'Assigned' } },
    ];
  const rows = await Relay.loadForDriver('recD');
  assert.strictEqual(calls[0].f, 'AND(FIND("recD",ARRAYJOIN({Driver},","))>0,{Move Kind}!=BLANK())');
  assert.deepStrictEqual(calls[0].sort, [{ field: 'Date', direction: 'desc' }]);
  assert.ok(calls[0].fields.includes('Description') && calls[0].fields.includes('Move Kind'));
  assert.strictEqual(calls.filter(c => c.table === 'orders').length, 1);
  assert.deepStrictEqual(rows.map(r => [r.id, r.date, r.kind]), [['recM1', '2026-10-05', 'relay_delivery'], ['recM3', '2026-10-03', 'local']]);
  const table = Relay.historyTableHtml(rows);
  assert.ok(table.includes('<td>Δευ 05/10/26</td><td>Παράδοση 415</td><td>ίδιο INT-1 · ρυμ. TRL-1</td><td>από CROSS-DOCK</td><td>07:00</td>'), table);
  assert.ok(table.includes('<td>Τοπική κίνηση · Παλέτες</td><td>LOC-1</td><td>CROSS-DOCK → NAOUSA</td>'), table);
  assert.ok(!/€|\d+,\d\d/.test(table), 'no amounts');
  const list = Relay.historyListHtml(rows.slice(0, 1));
  assert.ok(list.includes('<b>Παράδοση 415</b><span>Δευ 05/10/26 · 07:00</span>') && list.includes('ίδιο INT-1 · ρυμ. TRL-1 · από CROSS-DOCK'), list);
});

test('vehicleText: «ίδιο <the order\'s tractor>» or «άλλο <own>», then the relay\'s trailer', () => {
  assert.strictEqual(Relay.vehicleText({ sameTractor: true, tractor: 'INT-1', trailer: 'TRL-1' }), 'ίδιο INT-1 · ρυμ. TRL-1');
  assert.strictEqual(Relay.vehicleText({ sameTractor: false, tractor: 'LOC-1', trailer: '' }), 'άλλο LOC-1');
  assert.strictEqual(Relay.vehicleText({ sameTractor: true, tractor: '', trailer: '' }), 'ίδιο φορτηγό');
});

// Review round 3 (5/10): Reference is empty on most imports, so a relay's
// menu, sub-row and badge named nothing. orderName = Reference, else the
// client with the order number, else the number alone.
test('orderName: Reference first, then client + order number, then the number alone', () => {
  global.getRefClients = () => [{ id: 'recC1', fields: { 'Company Name': 'Client A' } }];
  try {
    assert.strictEqual(Relay.orderName({ Reference: ' REF-9 ', Client: ['recC1'], 'Order No': 415 }), 'REF-9');
    assert.strictEqual(Relay.orderName({ Reference: '', Client: ['recC1'], 'Order No': 415 }), 'Client A #415');
    assert.strictEqual(Relay.orderName({ 'Client Summary': 'Client Z', 'Order No': 416 }), 'Client Z #416');
    assert.strictEqual(Relay.orderName({ 'Order No': 417 }), '#417');
    assert.strictEqual(Relay.orderName({ Client: ['recUnknown'] }), '');
    assert.strictEqual(Relay.orderName(null), '');
  } finally { delete global.getRefClients; }
});

// Screenshot review 5/10: the Weekly sub-row says only what differs from the
// order above it; the full vehicle stays in Daily Ops, the track record and
// the tooltip (vehicleText).
test('diffParts: nothing when the local takes the order\'s tractor and trailer at Veroia; each difference named', () => {
  const o = { id: 'recO', fields: { Direction: 'Import', Truck: ['recTk1'], Trailer: ['recTl1'], 'Delivery DateTime': '2026-10-05' } };
  const same = Relay.summary({ fields: { 'Move Kind': 'relay_delivery', Trailer: ['recTl1'], 'From Location': ['recJucKOhC1zh4IP3'] } }, o);
  assert.deepStrictEqual(Relay.diffParts(same), []);
  assert.strictEqual(same.pointDefault, true);
  const other = Relay.summary({ fields: { 'Move Kind': 'relay_delivery', Truck: ['recTkL'], Trailer: ['recTlX'], 'From Location': ['recN'] } }, o);
  assert.deepStrictEqual(Relay.diffParts(other), ['άλλο φορτηγό LOC-1', 'ρυμ. —', 'από NAOUSA']);
  // an order without a trailer: the relay's is the only one written anywhere → said
  const noTrl = Relay.summary({ fields: { 'Move Kind': 'relay_delivery', Trailer: ['recTl1'], 'From Location': ['recJucKOhC1zh4IP3'] } }, { id: 'recO', fields: { Direction: 'Import' } });
  assert.deepStrictEqual(Relay.diffParts(noTrl), ['ρυμ. TRL-1']);
});
