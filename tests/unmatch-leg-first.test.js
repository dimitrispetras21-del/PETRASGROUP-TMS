// node --test tests/unmatch-leg-first.test.js
// 4/10/2026 (live P1, RT-1193 on 30/9) — an order must leave its round trip
// BEFORE anything clears its vehicle. The live trigger rt_sync_from_order
// (pg_get_functiondef, read 4/10) copies an order's truck/driver onto its round
// trip and onto every other order of that trip:
//   update ct_round_trips set driver_id = new.driver_id, truck_id = new.truck_id, …
//   for sib in (… other orders of the trip …) loop update orders set truck_id = new.truck_id, …
// and dl_sync_from_rt soft-deletes the driver's payroll line when the trip is
// left without a driver. So «×» unmatch (_wiRemoveImport), «Διάλυση groupage»
// (_wiDissolveClearMember) and «Ακύρωση groupage» (_wiCancelGroupMember) must
// take the leg off first and clear nothing when that fails.
//
// UNIT ONLY: the functions are extracted verbatim from the module source and run
// against a model of the facade + those two triggers. Nothing is sent anywhere.
// WI_SRC=<path> runs the same cases against another copy of weekly_intl.js
// (the «before» proof: main e1a66597 fails the wipe cases).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WI = fs.readFileSync(process.env.WI_SRC || path.join(__dirname, '..', 'modules/weekly_intl.js'), 'utf8');
const grab = (re, name, optional) => { const m = WI.match(re); if (!m && !optional) throw new Error(name + ' not found'); return m ? m[0] : ''; };
const wiSrc = [
  grab(/async function _wiRtOf\(orderId\)\{[\s\S]*?\n\}\n/, '_wiRtOf', true),       // absent in the «before» copy
  grab(/async function _wiRtLeave\(orderId\)\{[\s\S]*?\n\}\n/, '_wiRtLeave', true), // absent in the «before» copy
  grab(/async function _wiRemoveImport\(rowId\)\{[\s\S]*?\n\}\n/, '_wiRemoveImport'),
  grab(/async function _wiDissolveClearMember\(oid\)\{[\s\S]*?\n\}\n/, '_wiDissolveClearMember'),
  grab(/async function _wiCancelGroupMember\(rowId,orderId,isImportSide(?:,ask)?\)\{[\s\S]*?\n\}\n/, '_wiCancelGroupMember'),
  grab(/async function _wiDoSplit\(rowId\)\{[\s\S]*?\n\}\n/, '_wiDoSplit'),
].join('\n');

// One round trip RT1 = export E (truck T1, driver D1) + its imports. The model
// applies rt_sync_from_order / dl_sync_from_rt to every PATCH that touches a
// vehicle, exactly in the order the browser sends them.
function world({ imports = ['I'], exportsOnRt = ['E'], failLeg = null, lookupThrows = false, rtStatus = 'planned', noOrderNo = false } = {}) {
  const orders = {}; const legs = new Set([...exportsOnRt, ...imports]);
  for (const id of [...exportsOnRt, ...imports]) orders[id] = { truck: 'T1', driver: 'D1', group: imports.length > 1 && imports.includes(id) ? 'GI-X|' + imports[0] : null };
  const rt = { id: 1, code: 'RT-1', truck: 'T1', driver: 'D1', payroll: 'live' };
  const log = [], rtQueries = [];
  const pgOf = id => Object.keys(orders).indexOf(id) + 1;   // «Order No» = orders.id
  const rtSync = (id) => {                       // rt_sync_from_order + dl_sync_from_rt
    if (!legs.has(id)) return;
    const o = orders[id];
    if (rt.truck !== o.truck || rt.driver !== o.driver) {
      rt.truck = o.truck; rt.driver = o.driver;
      for (const sib of legs) if (sib !== id) { orders[sib].truck = o.truck; orders[sib].driver = o.driver; }
      if (rt.driver == null) rt.payroll = 'deleted («έμεινε χωρίς οδηγό μας»)';
    }
  };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    TABLES: { ORDERS: 'O' },
    WINTL: { rows: [], data: { exports: exportsOnRt.map(id => ({ id, fields: {} })), imports: imports.map(id => ({ id, fields: { 'Group ID': orders[id].group } })) }, _seq: 100, ui: {} },
    atSafePatch: async (_t, id, f) => {
      log.push({ id, f: Object.keys(f) });
      const o = orders[id];
      if ('Truck' in f) o.truck = (f.Truck || [])[0] || null;
      if ('Driver' in f) o.driver = (f.Driver || [])[0] || null;
      if ('Group ID' in f) o.group = f['Group ID'] || null;
      if ('Truck' in f || 'Driver' in f) rtSync(id);
      const fields = {}; if (o.truck) fields.Truck = [o.truck]; if (o.group) fields['Group ID'] = o.group;
      return { id, fields };
    },
    getLinkedId: v => (Array.isArray(v) ? v[0] || null : v || null),
    rtFindForOrder: async id => { if (lookupThrows) throw new Error('network'); return { pg: id, rt: legs.has(id) ? { id: 1, code: 'RT-1' } : null }; }, // «before» lookup
    // «after» lookup (_wiRtOf): the order itself, then trips in a date window
    atGetOne: async (_t, id) => ({ id, fields: Object.assign(noOrderNo ? {} : { 'Order No': pgOf(id) }, { 'Loading DateTime': '2026-09-28T06:00:00Z', 'Delivery DateTime': '2026-09-30T06:00:00Z' }) }),
    plFetch: async (url) => { rtQueries.push(url); if (lookupThrows) throw new Error('network');
      return { records: [{ id: 1, code: 'RT-1', status: rtStatus, ct_rt_legs: [...legs].map(o => ({ order_id: pgOf(o) })) }] }; },
    _wiRtLegDelete: async (_rtId, pg) => { const id = typeof pg === 'number' ? Object.keys(orders)[pg - 1] : pg;
      if (failLeg === id) return { ok: false, status: 409, error: 'closed' }; legs.delete(id); return { ok: true, status: 200 }; },
    rtOnImportUnmatched: async (_exp, imp) => { legs.delete(imp); },            // the «before» trailing pass
    _wiGiGroup: async () => ({ members: imports.slice() }),
    _wiExecutingLive: async () => false,
    syncOrderDownstream: async () => {},
    confirmAction: async () => true,
    reportError: (m) => log.push({ error: m }), toast: (m, k) => log.push({ toast: m, k }),
    _wiPaint() {}, _wiSync() {}, atClearCache() {}, renderWeeklyIntl: async () => {},
    _wiSyncGroupResidue: async () => {}, _wiRewriteGroupSuffix: async () => true,
    // «Σπάσιμο σκέλους» (_wiDoSplit): the panel inputs, the two leg POSTs, their stops
    document: { getElementById: id => ({ lv_wiSplitLoc: { value: 'recHUB' }, wiSplitDt: { value: '2026-10-05T10:00' }, wiSplitMode: { value: '' } })[id] || null },
    F: { STOP_PARENT_ORDER: 'Parent' }, stopsLoad: async () => [],
    _wiParentPalletsTotal: () => 33, _wiOrderPoints: () => [{ locId: 'recA', dateTime: null, pallets: 33 }],
    atCreate: async (_t, f) => ({ id: 'recLEG' + f['Leg No'], fields: { 'Parent Order': f['Parent Order'], 'Leg No': f['Leg No'] } }),
    _wiCreateLegStops: async () => {}, _wiPanelSetBusy() {}, _wiPanelClose() {},
    atPatch: async (t, id, f) => ctx.atSafePatch(t, id, f), rtOnOrderSaved: async () => {},
  };
  ctx.WINTL.rows = [
    { id: 1, type: 'export', orderIds: exportsOnRt.slice(), importId: imports[0] },
    { id: 2, type: 'import', orderId: imports[0], orderIds: imports.slice(), matchedTo: 1 },
  ];
  vm.runInNewContext(wiSrc + '\nObject.assign(this,{_wiRemoveImport,_wiDissolveClearMember,_wiCancelGroupMember,_wiDoSplit});', ctx);
  return { ctx, orders, rt, legs, log, rtQueries };
}

test('«×» unmatch of a lone import: the export keeps its truck and the driver keeps the payroll line', async () => {
  const w = world();
  await w.ctx._wiRemoveImport(1);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(w.orders.E.truck, 'T1', 'export truck wiped');
  assert.strictEqual(w.rt.truck, 'T1', 'round trip truck wiped');
  assert.strictEqual(w.rt.payroll, 'live', 'payroll line deleted');
  assert.strictEqual(w.orders.I.truck, null, 'import still assigned');
  assert.ok(!w.legs.has('I'), 'import leg still on the round trip');
});

test('«×» unmatch of an import GROUP: every member leaves first, the export is untouched', async () => {
  const w = world({ imports: ['I1', 'I2'] });
  await w.ctx._wiRemoveImport(1);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(w.orders.E.truck, 'T1');
  assert.strictEqual(w.rt.payroll, 'live');
  assert.deepStrictEqual([w.orders.I1.truck, w.orders.I2.truck], [null, null]);
  assert.ok(!w.legs.has('I1') && !w.legs.has('I2'));
});

test('«×» unmatch when the leg cannot leave (closed RT): the member keeps its vehicle, nothing is wiped, it is reported', async () => {
  const w = world({ failLeg: 'I' });
  await w.ctx._wiRemoveImport(1);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(w.orders.E.truck, 'T1');
  assert.strictEqual(w.rt.payroll, 'live');
  assert.strictEqual(w.orders.I.truck, 'T1', 'vehicle cleared although its leg stayed on');
  assert.ok(w.log.some(x => x.error && /ΔΕΝ καθαρίστηκε/.test(x.error)), 'failure not reported');
});

test('«×» unmatch when the round-trip LOOKUP fails: treated as failure, not as «no round trip»', async () => {
  const w = world({ lookupThrows: true });
  await w.ctx._wiRemoveImport(1);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(w.orders.E.truck, 'T1');
  assert.strictEqual(w.orders.I.truck, 'T1');
  assert.ok(w.log.some(x => x.error && /δεν διαβάστηκε/.test(x.error)));
});

test('«Διάλυση groupage»: the member split out leaves the trip first, the member kept keeps its truck', async () => {
  const w = world({ exportsOnRt: ['E1', 'E2'], imports: [] });
  await w.ctx._wiDissolveClearMember('E2');
  assert.strictEqual(w.orders.E1.truck, 'T1', 'kept member lost its truck');
  assert.strictEqual(w.rt.payroll, 'live');
  assert.strictEqual(w.orders.E2.truck, null);
});

test('«Διάλυση groupage» with a failed leg removal: throws, nothing cleared', async () => {
  const w = world({ exportsOnRt: ['E1', 'E2'], imports: [], failLeg: 'E2' });
  await assert.rejects(() => w.ctx._wiDissolveClearMember('E2'), /ΔΕΝ αδειάστηκε/);
  assert.strictEqual(w.orders.E2.truck, 'T1');
  assert.strictEqual(w.orders.E1.truck, 'T1');
});

test('«Ακύρωση groupage» with a failed LOOKUP: stops before any write', async () => {
  const w = world({ imports: ['I1', 'I2'], lookupThrows: true });
  await w.ctx._wiCancelGroupMember(2, 'I2', true);
  assert.deepStrictEqual(w.log.filter(x => x.id), [], 'a PATCH was sent');
  assert.strictEqual(w.orders.E.truck, 'T1');
  assert.ok(w.log.some(x => x.toast && /σταμάτησε/.test(x.toast)));
});

test('«Σπάσιμο σκέλους»: the parent leaves its round trip before its vehicle is cleared — the matched import keeps the truck', async () => {
  const w = world();                                   // RT1 = export E (the parent) + matched import I
  w.ctx.WINTL.data.exports[0].fields = { Truck: ['T1'], Driver: ['D1'], Status: 'Assigned' };
  await w.ctx._wiDoSplit(1);
  assert.strictEqual(w.orders.I.truck, 'T1', 'matched import lost its truck');
  assert.strictEqual(w.rt.payroll, 'live', 'payroll line deleted');
  assert.strictEqual(w.orders.E.truck, null, 'parent still assigned');
  assert.ok(!w.legs.has('E'), 'parent leg still on the round trip');
});

test('«Σπάσιμο σκέλους» with a failed parent-leg removal: the parent keeps its vehicle and it is reported', async () => {
  const w = world({ failLeg: 'E' });
  w.ctx.WINTL.data.exports[0].fields = { Truck: ['T1'], Driver: ['D1'], Status: 'Assigned' };
  await w.ctx._wiDoSplit(1);
  assert.strictEqual(w.orders.E.truck, 'T1');
  assert.strictEqual(w.orders.I.truck, 'T1');
  assert.ok(w.log.some(x => x.error && /ΔΕΝ βγήκε από τον γύρο/.test(x.error)));
});

test('lookup: the trip is searched in a date window around the order (not the newest-200 list), by its Order No', async () => {
  const w = world();
  await w.ctx._wiRemoveImport(1);
  await new Promise(r => setTimeout(r, 10));
  assert.ok(w.rtQueries.length > 0 && w.rtQueries.every(q => /overlap=1&from=2026-09-21&to=2026-10-07/.test(q)), w.rtQueries.join(' | '));
  assert.ok(!w.legs.has('I'));
});

test('lookup: an order whose Order No cannot be read clears nothing (fail-closed)', async () => {
  const w = world({ noOrderNo: true });
  await w.ctx._wiRemoveImport(1);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(w.orders.I.truck, 'T1');
  assert.strictEqual(w.orders.E.truck, 'T1');
  assert.ok(w.log.some(x => x.error && /αριθμός της παραγγελίας/.test(x.error)));
});

test('«Σπάσιμο σκέλους» on a CLOSED trip stops before any leg is created', async () => {
  const w = world({ rtStatus: 'closed' });
  w.ctx.WINTL.data.exports[0].fields = { Truck: ['T1'], Driver: ['D1'], Status: 'Assigned' };
  let created = 0; const orig = w.ctx.atCreate; w.ctx.atCreate = async (...a) => { created++; return orig(...a); };
  await w.ctx._wiDoSplit(1);
  assert.strictEqual(created, 0, 'a leg was created');
  assert.strictEqual(w.orders.E.truck, 'T1');
  assert.ok(w.log.some(x => x.toast && /κλειστός — το σπάσιμο δεν ξεκίνησε/.test(x.toast)));
});
