// tests/intl-group.test.js — run: node --test tests/intl-group.test.js
// The one international form (owner 15/11): the pure parts of modules/orders_intl_group.js and the stop field the
// groupage writes (core/stops-helpers.js «Load Seq», 113). The form itself is checked by hand in the live app.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const ctx = { window: {}, FEATURES: { INTL_GROUP_FORM: true }, console,
  getLinkedId: v => (Array.isArray(v) ? v[0] : v) || '' };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'modules', 'orders_intl_group.js'), 'utf8'), ctx);
const IG = ctx.window.IntlGroup;
const plain = v => JSON.parse(JSON.stringify(v));

test('the flag turns the shell on and off', () => {
  assert.strictEqual(IG.on(), true);
  ctx.FEATURES.INTL_GROUP_FORM = false;
  assert.strictEqual(IG.on(), false);
  ctx.FEATURES.INTL_GROUP_FORM = true;
});

test('drag: a point moves to the place of the one it is dropped on; on itself nothing changes', () => {
  const l = ['a', 'b', 'c', 'd'];
  assert.deepStrictEqual(plain(IG._moveBefore(l, 'd', 'b')), ['a', 'd', 'b', 'c']);
  assert.deepStrictEqual(plain(IG._moveBefore(l, 'a', 'd')), ['b', 'c', 'a', 'd']);
  assert.deepStrictEqual(plain(IG._moveBefore(l, 'b', null)), ['a', 'c', 'd', 'b']);
  assert.deepStrictEqual(plain(IG._moveBefore(l, 'c', 'c')), l);
  assert.deepStrictEqual(plain(IG._moveBefore(l, 'x', 'a')), l);
});

test('the old order list follows the first point of each order (export: deliveries)', () => {
  const m1 = { key: 'm1' }, m2 = { key: 'm2' }, m3 = { key: 'm3' };
  const dl = ['m2:u:1', 'm1:u:1', 'm3:u:1', 'm1:u:2'];
  assert.deepStrictEqual(plain(IG._orderByFirstPoint([m1, m2, m3], dl).map(m => m.key)), ['m2', 'm1', 'm3']);
  // an order with no point yet goes last
  assert.deepStrictEqual(plain(IG._orderByFirstPoint([{ key: 'm9' }, m1], dl).map(m => m.key)), ['m1', 'm9']);
});

test('the load vehicle: one truck = copied without the partner fee; trucks that disagree = no source', () => {
  const a = IG._assignmentOf([
    { id: 'o1', fields: { Direction: 'Export', Truck: ['t1'], Driver: ['d1'], Trailer: ['r1'], Status: 'Assigned', 'Matched Import ID': 'i1', 'Partner Rate': 2400 } },
    { id: 'o2', fields: { Direction: 'Export' } },
  ]);
  assert.strictEqual(a.truck, 't1');
  assert.deepStrictEqual(Object.keys(a.fields).sort(), ['Driver', 'Matched Import ID', 'Partner', 'Status', 'Trailer', 'Truck']);
  assert.ok(!('Partner Rate' in a.fields), 'the partner fee is per truck (owner 15/11): never copied to a new order');
  assert.deepStrictEqual(plain(a.fields.Partner), []);
  assert.strictEqual(IG._assignmentOf([{ id: 'o1', fields: {} }]), null);
  assert.deepStrictEqual(plain(IG._assignmentOf([{ id: 'o1', fields: { Truck: ['t1'] } }, { id: 'o2', fields: { Truck: ['t2'] } }])), { mixed: true });
  // an import's match lives on its export: not copied
  const imp = IG._assignmentOf([{ id: 'o1', fields: { Direction: 'Import', Truck: ['t1'], 'Matched Import ID': 'x' } }]);
  assert.ok(!('Matched Import ID' in imp.fields));
});

test('a stop with a place in the load sends «Load Seq»; one without sends nothing', () => {
  const sctx = { F: { STOP_NUMBER: 'Stop Number', STOP_TYPE: 'Stop Type', STOP_LABEL: 'Stop Label', STOP_LOCATION: 'Location',
    STOP_DATETIME: 'DateTime', STOP_PALLETS: 'Pallets', STOP_CLIENT: 'Client at Stop', STOP_TEMP: 'Temperature', STOP_REF: 'Reference',
    STOP_GOODS: 'Goods', STOP_NOTES: 'Notes', STOP_TIME_FROM: 'Time From', STOP_TIME_TO: 'Time To', STOP_VIA_HUB: 'Via Hub',
    STOP_PALLETS_EXCHANGED: 'Pallets Exchanged', STOP_LOAD_SEQ: 'Load Seq' } };
  vm.createContext(sctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'core', 'stops-helpers.js'), 'utf8') + '\nthis._f=_stopObjToFields;', sctx);
  const withSeq = sctx._f({ stopNumber: 2, stopType: 'Unloading', locationId: 'l1', loadSeq: 3 }, 'o1', 'Parent Order');
  assert.strictEqual(withSeq['Load Seq'], 3);
  assert.strictEqual(withSeq['Stop Number'], 2);
  const one = sctx._f({ stopNumber: 1, stopType: 'Loading', locationId: 'l1' }, 'o1', 'Parent Order');
  assert.ok(!('Load Seq' in one), 'a single load never names the 113 column');
});

test('stored places are used only when complete and distinct (113 rule)', () => {
  assert.strictEqual(IG._seqUsable([1, 2, 3]), true);
  assert.strictEqual(IG._seqUsable(['2', '1']), true);
  assert.strictEqual(IG._seqUsable([1, 1, 2]), false, 'two points with the same place');
  assert.strictEqual(IG._seqUsable([1, null, 2]), false, 'a point without a place');
  assert.strictEqual(IG._seqUsable([0, 1]), false);
  assert.strictEqual(IG._seqUsable([]), false);
});

test('config: the label the groupage writes, and the flag', () => {
  const cfg = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
  assert.match(cfg, /STOP_LOAD_SEQ:\s*'Load Seq'/);
  assert.match(cfg, /INTL_GROUP_FORM: true/);
});
