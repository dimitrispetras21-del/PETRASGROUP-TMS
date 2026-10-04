// node --test tests/relay-core.test.js
// core/relay.js (migration 060, owner 4/10 «οκ προχωρα με τις τοπικες
// παραδοσεις») — the pure parts every screen leans on: which orders may take a
// relay, how relays are read (batched FIND on Parent Order, loud when the
// Worker lacks «Move Kind»), and the read-back check that turns a silently
// dropped label into a named problem. The board itself is proven by
// tests/critics/local-relay-weekly-proof.js.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// Browser globals relay.js uses at call time (utils/data-helpers/api).
global.toLocalDate = v => String(v || '').slice(0, 10);
global.getLinkedId = v => (Array.isArray(v) ? v[0] : v) || '';
global.isPreorder = f => !!f && f['Ops Status'] === 'Provisional' && f['Status'] !== 'Cancelled';
global.TABLES = { LOCAL_MOVES: 'local_moves' };
let calls = [];
let reply = () => [];
global.atGetAll = async (table, opts) => { calls.push({ table, f: opts.filterByFormula }); return reply(opts.filterByFormula); };
const Relay = require(path.resolve(__dirname, '../core/relay.js'));

const ord = (f) => ({ id: 'recO', fields: Object.assign({ Direction: 'Import', 'Delivery DateTime': '2026-10-05', 'Loading DateTime': '2026-10-02' }, f) });

test('kind follows the direction: import → delivery, export → loading', () => {
  assert.strictEqual(Relay.kindFor({ Direction: 'Import' }), 'relay_delivery');
  assert.strictEqual(Relay.kindFor({ Direction: 'Export' }), 'relay_loading');
  assert.strictEqual(Relay.kindFor({}), null);
});

test('blockReason mirrors the base: VS, cancelled, pre-order, split parent hidden; no date disabled', () => {
  assert.strictEqual(Relay.blockReason(ord({})), '');
  assert.strictEqual(Relay.blockReason(ord({ 'Veroia Switch': true })), 'vs');
  assert.strictEqual(Relay.blockReason(ord({ Status: 'Cancelled' })), 'cancelled');
  assert.strictEqual(Relay.blockReason(ord({ 'Ops Status': 'Provisional' })), 'preorder');
  assert.strictEqual(Relay.blockReason(ord({}), { isSplitParent: true }), 'split_parent');
  assert.strictEqual(Relay.blockReason(ord({ 'Delivery DateTime': '' })), 'no_date');
  assert.strictEqual(Relay.isHiddenReason('no_date'), false);
  assert.strictEqual(Relay.isHiddenReason('vs'), true);
});

test('«done» is the ORDER status: delivery = Delivered; loading = In Transit or Delivered', () => {
  assert.strictEqual(Relay.isDone({ Status: 'In Transit' }, 'relay_delivery'), false);
  assert.strictEqual(Relay.isDone({ Status: 'Delivered' }, 'relay_delivery'), true);
  assert.strictEqual(Relay.isDone({ Status: 'In Transit' }, 'relay_loading'), true);
  assert.strictEqual(Relay.isDone({ Status: 'Assigned' }, 'relay_loading'), false);
});

test('loadForOrders: FIND on {Parent Order}, 90 per request, Cancelled and plain moves left out', async () => {
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
  assert.ok(calls[0].f.startsWith('OR(FIND("recA0",ARRAYJOIN({Parent Order},","))>0,'));
  assert.strictEqual((calls[0].f.match(/FIND\(/g) || []).length, 90);
  assert.ok(!calls.some(c => c.f.includes('not-an-id')), 'only record ids reach the formula');
  assert.deepStrictEqual(recs.map(r => r.id), ['recR1']);
});

test('loadForOrders: a row without «Move Kind» (old Worker map) THROWS instead of guessing', async () => {
  reply = () => [{ id: 'recR1', fields: { 'Parent Order': ['recA1'], Status: 'Assigned' } }];
  await assert.rejects(() => Relay.loadForOrders(['recA1']), e => e.code === 'no_move_kind' && /Move Kind/.test(e.message));
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

test('fmtDay: the boards\' «Δευ 05/10»', () => {
  assert.strictEqual(Relay.fmtDay('2026-10-05'), 'Δευ 05/10');
  assert.strictEqual(Relay.fmtDay(''), '—');
});
