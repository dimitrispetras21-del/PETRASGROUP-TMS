// node --test tests/stops-helpers-identity.test.mjs
// F5 FE-1 (plan 2026-10-28, Task F): stopsSave keeps a stop's IDENTITY by its record id. Matching by
// (type, number) alone renumbered the survivors when a middle row was removed — stop #3 took the record of the
// deleted #2 — and the v5 bridge (one shipment per order_stop_id) would follow the wrong record. A stop delete
// that fails throws to the caller (it was a console.error only). The REAL core/stops-helpers.js runs in a vm
// against an in-memory facade. Synthetic ids only.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.resolve(HERE, '..');

function sandbox(stops, opts = {}) {
  const log = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} }, Map, Set, Promise, Object, Array, Error, JSON, String, Number, parseFloat,
    TABLES: { ORDERS: 'tO', ORDER_STOPS: 'tS', NAT_LOADS: 'tNL', NAT_ORDERS: 'tNO' },
    F: { STOP_PARENT_ORDER: 'Parent Order', STOP_PARENT_NL: 'Parent Nat Load', STOP_TYPE: 'Stop Type', STOP_NUMBER: 'Stop Number',
         STOP_LABEL: 'Stop Label', STOP_LOCATION: 'Location', STOP_DATETIME: 'DateTime', STOP_PALLETS: 'Pallets', STOP_CLIENT: 'Client',
         STOP_TEMP: 'Temperature', STOP_REF: 'Reference', STOP_GOODS: 'Goods', STOP_NOTES: 'Notes' },
    atGetOne: async () => ({ id: 'recORD1', fields: { 'ORDER STOPS': stops.map((s) => s.id) } }),
    atGetAll: async () => stops.map((s) => ({ id: s.id, fields: { 'Stop Type': s.type, 'Stop Number': s.n, Location: [s.loc] } })),
    atCreateBatch: async (t, recs) => { log.push({ k: 'create', recs: JSON.parse(JSON.stringify(recs)) }); return recs.map((_, i) => ({ id: 'recNEW' + i })); },
    atPatchBatch: async (t, recs) => { log.push({ k: 'patch', recs: JSON.parse(JSON.stringify(recs)) }); },
    atDelete: async (t, id) => { log.push({ k: 'delete', id }); if (opts.failDelete && opts.failDelete.includes(id)) throw Object.assign(new Error('rig 403'), { _noRetry: true }); },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/stops-helpers.js'), 'utf8'), ctx, { filename: 'core/stops-helpers.js' });
  return { log, run: (code) => vm.runInContext(code, ctx), ctx };
}
const THREE = [
  { id: 'recS1', type: 'Loading', n: 1, loc: 'recL1' }, { id: 'recS2', type: 'Loading', n: 2, loc: 'recL2' },
  { id: 'recS3', type: 'Loading', n: 3, loc: 'recL3' }, { id: 'recS4', type: 'Unloading', n: 1, loc: 'recL9' },
];
const form = (rows) => JSON.stringify(rows);

test('F5-FE1: the middle row removed → #3 keeps its own record (renumbered to 2), #2 is deleted', async () => {
  const s = sandbox(THREE);
  await s.run(`stopsSave('recORD1', ${form([
    { recordId: 'recS1', stopNumber: 1, stopType: 'Loading', locationId: 'recL1' },
    { recordId: 'recS3', stopNumber: 2, stopType: 'Loading', locationId: 'recL3' },
    { recordId: 'recS4', stopNumber: 1, stopType: 'Unloading', locationId: 'recL9' }])}, 'Parent Order')`);
  const patch = s.log.find((x) => x.k === 'patch').recs.map((r) => [r.id, r.fields['Stop Number'], r.fields.Location[0]]);
  assert.deepStrictEqual(patch, [['recS1', 1, 'recL1'], ['recS3', 2, 'recL3'], ['recS4', 1, 'recL9']]);
  assert.deepStrictEqual(s.log.filter((x) => x.k === 'delete').map((x) => x.id), ['recS2']);
  assert.ok(!s.log.some((x) => x.k === 'create'));
});

test('F5-FE1: a reordered list keeps the same ids (the place in the list is not the identity)', async () => {
  const s = sandbox(THREE);
  await s.run(`stopsSave('recORD1', ${form([
    { recordId: 'recS2', stopNumber: 1, stopType: 'Loading', locationId: 'recL2' },
    { recordId: 'recS1', stopNumber: 2, stopType: 'Loading', locationId: 'recL1' },
    { recordId: 'recS3', stopNumber: 3, stopType: 'Loading', locationId: 'recL3' },
    { recordId: 'recS4', stopNumber: 1, stopType: 'Unloading', locationId: 'recL9' }])}, 'Parent Order')`);
  const patch = s.log.find((x) => x.k === 'patch').recs.map((r) => [r.id, r.fields.Location[0]]);
  assert.deepStrictEqual(patch, [['recS2', 'recL2'], ['recS1', 'recL1'], ['recS3', 'recL3'], ['recS4', 'recL9']]);
  assert.ok(!s.log.some((x) => x.k === 'delete' || x.k === 'create'));
});

test('F5-FE1: a stop without an id (a new row, or a caller that rebuilds the list) falls back to (type, number), only among unclaimed records', async () => {
  const s = sandbox(THREE);
  await s.run(`stopsSave('recORD1', ${form([
    { recordId: 'recS2', stopNumber: 1, stopType: 'Loading', locationId: 'recL2' },
    { stopNumber: 2, stopType: 'Loading', locationId: 'recLX' },
    { stopNumber: 1, stopType: 'Unloading', locationId: 'recL9' }])}, 'Parent Order')`);
  const patch = s.log.find((x) => x.k === 'patch').recs.map((r) => r.id);
  // recS2 is claimed by its id; Loading_2 by key would be recS2 again, already claimed → a NEW stop, never a double PATCH
  assert.deepStrictEqual(patch, ['recS2', 'recS4']);
  assert.strictEqual(s.log.find((x) => x.k === 'create').recs.length, 1);
  assert.deepStrictEqual(s.log.filter((x) => x.k === 'delete').map((x) => x.id).sort(), ['recS1', 'recS3']);
});

test('F5-FE1: today\'s callers without ids keep today\'s behaviour (same numbers → same records)', async () => {
  const s = sandbox(THREE);
  await s.run(`stopsSave('recORD1', ${form([
    { stopNumber: 1, stopType: 'Loading', locationId: 'recL1' }, { stopNumber: 2, stopType: 'Loading', locationId: 'recL2' },
    { stopNumber: 3, stopType: 'Loading', locationId: 'recL3' }, { stopNumber: 1, stopType: 'Unloading', locationId: 'recL9' }])}, 'Parent Order')`);
  assert.deepStrictEqual(s.log.find((x) => x.k === 'patch').recs.map((r) => r.id), ['recS1', 'recS2', 'recS3', 'recS4']);
  assert.ok(!s.log.some((x) => x.k === 'delete' || x.k === 'create'));
});

test('F5-FE1: a stop delete that fails THROWS (all deletes tried; the error as api.js made it, with the ids still live)', async () => {
  const s = sandbox(THREE, { failDelete: ['recS2'] });
  const r = JSON.parse(await s.run(`stopsSave('recORD1', ${form([
    { recordId: 'recS1', stopNumber: 1, stopType: 'Loading', locationId: 'recL1' },
    { recordId: 'recS4', stopNumber: 1, stopType: 'Unloading', locationId: 'recL9' }])}, 'Parent Order')
    .then(() => JSON.stringify({ threw: false }), (e) => JSON.stringify({ threw: true, m: e.message, nr: e._noRetry, left: e.stopsNotDeleted }))`));
  assert.deepStrictEqual(r, { threw: true, m: 'rig 403', nr: true, left: ['recS2'] });
  assert.deepStrictEqual(s.log.filter((x) => x.k === 'delete').map((x) => x.id).sort(), ['recS2', 'recS3'], 'the other delete still ran');
});
