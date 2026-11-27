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
  grab(/async function _wiRtLeave\(orderId(?:,opts)?\)\{[\s\S]*?\n\}\n/, '_wiRtLeave', true), // absent in the «before» copy
  // T195 (27/11): the unmatch reads its exports live first (absent in older copies)
  grab(/async function _wiUnmatchLiveCheck\(orderIds,impId\)\{[\s\S]*?\n\}\n/, '_wiUnmatchLiveCheck', true),
  // fix/wi-assign-never-locks (4/10): _wiCancelGroupMember reads the live status
  // and builds its one confirm through these (absent in older copies)
  grab(/const WI_EXECUTING=\[[^\]]*\];/, 'WI_EXECUTING', true),
  grab(/async function _wiLiveOrders\(ids\)\{[\s\S]*?\n\}\n/, '_wiLiveOrders', true),
  grab(/function _wiExecConfirmText\(execs,what,closedOk\)\{[\s\S]*?\n\}\n/, '_wiExecConfirmText', true),
  // _wiRemoveImport clears the import GROUP's row through it (review 8/11/2026)
  grab(/function _wiImpGroupRowOf\(oid\)\{[\s\S]*?\n\}\n/, '_wiImpGroupRowOf', true),
  // the whole-group move keeps the import's own vehicle through it (owner 24/11)
  grab(/function _wiRecOf\(id\)\{[^\n]*\n/, '_wiRecOf', true),
  grab(/async function _wiExpPassedOn\(expIds,impIds\)\{[\s\S]*?\n\}\n/, '_wiExpPassedOn', true),
  grab(/async function _wiRemoveImport\(rowId(?:,opts)?\)\{[\s\S]*?\n\}\n/, '_wiRemoveImport'),
  grab(/async function _wiDissolveClearMember\(oid\)\{[\s\S]*?\n\}\n/, '_wiDissolveClearMember'),
  grab(/async function _wiCancelGroupMember\(rowId,orderId,isImportSide(?:,ask)?\)\{[\s\S]*?\n\}\n/, '_wiCancelGroupMember'),
  grab(/async function _wiDoSplit\(rowId\)\{[\s\S]*?\n\}\n/, '_wiDoSplit'),
  // owner 8/11 (core/plain-ref.js): the messages name orders/trips in words, through these.
  grab(/function _wiOrdTxt\(r,fb\)\{[^\n]*\n/, '_wiOrdTxt', true),
  grab(/async function _wiRtTxt\(rt\)\{[^\n]*\n/, '_wiRtTxt', true),
  grab(/function _wiErrList\(list,recs\)\{[^\n]*\n/, '_wiErrList', true),
].join('\n');

// One round trip RT1 = export E (truck T1, driver D1) + its imports. The model
// applies rt_sync_from_order / dl_sync_from_rt to every PATCH that touches a
// vehicle, exactly in the order the browser sends them.
function world({ imports = ['I'], exportsOnRt = ['E'], failLeg = null, lookupThrows = false, rtStatus = 'planned', noOrderNo = false, exportTruck = 'T1', exportOnTrip = true } = {}) {
  // exportTruck null = an export with no vehicle (owner 8/11 #10: matched before the assignment);
  // exportOnTrip false = it rides no trip, so the import's trip is its own.
  const orders = {}; const legs = new Set([...(exportOnTrip ? exportsOnRt : []), ...imports]);
  for (const id of [...exportsOnRt, ...imports]) orders[id] = { truck: 'T1', driver: 'D1', group: imports.length > 1 && imports.includes(id) ? 'GI-X|' + imports[0] : null };
  for (const id of exportsOnRt) if (!exportTruck) { orders[id].truck = null; orders[id].driver = null; }
  // A trip whose export lost its vehicle by «Καθαρισμός ανάθεσης» waits with none (_wiClear).
  const rt = exportTruck ? { id: 1, code: 'RT-1', truck: 'T1', driver: 'D1', payroll: 'live' } : { id: 1, code: 'RT-1', truck: null, driver: null, payroll: 'live' };
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
    WINTL: { rows: [], data: { exports: exportsOnRt.map(id => ({ id, fields: {} })), imports: imports.map(id => ({ id, fields: { 'Group ID': orders[id].group, 'Order No': pgOf(id) } })) }, _seq: 100, ui: {} },
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
    PlainRef: require(path.join(__dirname, '..', 'core/plain-ref.js')), _fhLocationsMap: {}, escapeHtml: s => String(s),
    rtFindForOrder: async id => { if (lookupThrows) throw new Error('network'); return { pg: id, rt: legs.has(id) ? { id: 1, code: 'RT-1' } : null }; }, // «before» lookup
    // «after» lookup (_wiRtOf): the order itself, then trips in a date window
    atGetOne: async (_t, id) => ({ id, fields: Object.assign(noOrderNo ? {} : { 'Order No': pgOf(id) }, orders[id] && orders[id].truck ? { Truck: [orders[id].truck] } : {}, exportsOnRt.includes(id) ? { 'Matched Import ID': imports[0] } : {}, { 'Loading DateTime': '2026-09-28T06:00:00Z', 'Delivery DateTime': '2026-09-30T06:00:00Z' }) }),
    plFetch: async (url) => { rtQueries.push(url); if (lookupThrows) throw new Error('network');
      return { records: [{ id: 1, code: 'RT-1', status: rtStatus, ct_rt_legs: [...legs].map(o => ({ order_id: pgOf(o), direction: exportsOnRt.includes(o) ? 'EXPORT' : 'IMPORT' })) }] }; },
    _wiRtLegDelete: async (_rtId, pg) => { const id = typeof pg === 'number' ? Object.keys(orders)[pg - 1] : pg;
      if (failLeg === id) return { ok: false, status: 409, error: 'closed' }; legs.delete(id); return { ok: true, status: 200 }; },
    rtOnImportUnmatched: async (_exp, imp) => { legs.delete(imp); },            // the «before» trailing pass
    _wiGiGroup: async () => ({ members: imports.slice() }),
    _wiExecutingLive: async () => false,
    syncOrderDownstream: async () => {},
    confirmAction: async () => true,
    reportError: (m) => log.push({ error: m }), toast: (m, k) => log.push({ toast: m, k }), _wiRefuse: (m) => log.push({ refuse: m }),
    _wiPaint() {}, _wiSync() {}, atClearCache() {}, renderWeeklyIntl: async () => {},
    // v4 seam (§g.4): a no-op while v4 is inactive, which is this world.
    _wiDataSet() {},
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
    // truckId as the board builds it (_wiBuildRows): every export here rides T1.
    { id: 1, type: 'export', orderIds: exportsOnRt.slice(), importId: imports[0], truckId: exportTruck || '' },
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

test('«×» unmatch, export with no vehicle and on no trip (owner 24/11, «πάντα»; replaces 8/11 #10): the import loses its own truck too, leg first', async () => {
  const w = world({ exportTruck: null, exportOnTrip: false });
  const ok = await w.ctx._wiRemoveImport(1);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(ok, true);
  assert.strictEqual(w.orders.I.truck, null, 'the import kept its truck');
  assert.ok(!w.legs.has('I'), 'the import\'s leg stayed on its trip');
  assert.strictEqual(w.orders.E.truck, null, 'the export was given a vehicle');
});

test('whole-group MOVE (keepOwn), old export with no vehicle and on no trip (owner 24/11 «να το κρατά»): the import keeps its own truck and trip', async () => {
  const w = world({ exportTruck: null, exportOnTrip: false });
  const ok = await w.ctx._wiRemoveImport(1, { keepOwn: true });
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(ok, true);
  assert.strictEqual(w.orders.I.truck, 'T1', 'the import\'s own truck was wiped');
  assert.ok(w.legs.has('I'), 'the import left its own trip');
  assert.ok(!w.log.some(x => x.id === 'I'), 'something was written on the import');
});

test('whole-group MOVE (keepOwn), old export WITH a truck: the inherited vehicle still leaves', async () => {
  const w = world();
  const ok = await w.ctx._wiRemoveImport(1, { keepOwn: true });
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(ok, true);
  assert.strictEqual(w.orders.I.truck, null, 'the inherited truck stayed');
  assert.ok(!w.legs.has('I'));
  assert.strictEqual(w.orders.E.truck, 'T1');
});

test('«×» unmatch, export with no vehicle still on a trip holding the import: the leg leaves, then the vehicle (today\'s path)', async () => {
  const w = world({ exportTruck: null, exportOnTrip: true });
  const ok = await w.ctx._wiRemoveImport(1);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(ok, true);
  assert.ok(!w.legs.has('I'), 'the import\'s leg stayed on the export\'s trip');
  assert.strictEqual(w.orders.I.truck, null, 'the inherited vehicle stayed');
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
  assert.ok(w.log.some(x => x.toast && /^Το δρομολόγιο είναι κλειστό — το σπάσιμο δεν ξεκίνησε/.test(x.toast)));
});

test('lookup: one date only opens the window 60 days back; no date at all clears nothing', async () => {
  const w = world();
  w.ctx.atGetOne = async (_t, id) => ({ id, fields: { 'Order No': 2, 'Matched Import ID': 'I', 'Loading DateTime': '2026-09-20T06:00:00Z' } });
  await w.ctx._wiRemoveImport(1);
  await new Promise(r => setTimeout(r, 10));
  assert.ok(w.rtQueries.some(q => /overlap=1&from=2026-07-22&to=2026-09-27/.test(q)), w.rtQueries.join(' | '));
  const w2 = world();
  w2.ctx.atGetOne = async (_t, id) => ({ id, fields: { 'Order No': 2, 'Matched Import ID': 'I' } });
  await w2.ctx._wiRemoveImport(1);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(w2.orders.I.truck, 'T1');
  assert.ok(w2.log.some(x => x.error && /δεν έχει ημερομηνίες/.test(x.error)));
});

// T195 (27/11/2026): on 20/11 a board drawn before kelesmitos re-matched (#759 → #770 moved to #750) unmatched
// #759 at 12:28 UTC: the export pointer was already empty, and the clear took #770 off #750's trip.
test('T195 stale board: the export no longer points at the import → refused before ANY write, the board reloads', async () => {
  const w = world();
  const base = w.ctx.atGetOne;
  w.ctx.atGetOne = async (t, id) => { const r = await base(t, id); if (id === 'E') r.fields['Matched Import ID'] = ''; return r; };
  let reloaded = 0; w.ctx.renderWeeklyIntl = async () => { reloaded++; };
  const res = await w.ctx._wiRemoveImport(1);
  assert.strictEqual(res, null, 'null = refused before any write');
  assert.strictEqual(w.log.filter(x => x.id).length, 0, 'no PATCH at all: ' + JSON.stringify(w.log));
  assert.strictEqual(w.orders.I.truck, 'T1', 'the import keeps its vehicle');
  assert.ok(w.log.some(x => x.refuse && /άλλαξε από άλλον χρήστη/.test(x.refuse)), JSON.stringify(w.log));
  assert.strictEqual(reloaded, 1);
});

test('T195 the export cannot be read → refused before any write, no reload (nothing known)', async () => {
  const w = world();
  w.ctx.atGetOne = async () => { throw new Error('network'); };
  const res = await w.ctx._wiRemoveImport(1);
  assert.strictEqual(res, null);
  assert.strictEqual(w.log.filter(x => x.id).length, 0);
  assert.ok(w.log.some(x => x.refuse && /δεν διαβάστηκε/.test(x.refuse)));
});

// 20/11 09:51 UTC: #700 and #759 both pointed at #770, whose leg sat on #759's trip; unmatching #700 took it off.
test('T195 the import rides another export\'s trip → its leg stays, its vehicle stays, said', async () => {
  const w = world();
  w.ctx.plFetch = async () => ({ records: [{ id: 1, code: 'RT-1', status: 'planned', ct_rt_legs: [
    { order_id: 99, direction: 'EXPORT' },                    // another export's trip
    { order_id: 2, direction: 'IMPORT' },                     // the import (Order No 2 = I)
  ] }] });
  await w.ctx._wiRemoveImport(1);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(w.orders.I.truck, 'T1', 'the import keeps its vehicle');
  assert.ok(w.log.some(x => x.error && /άλλης εξαγωγής/.test(x.error)), JSON.stringify(w.log));
});

// Review 27/11: a rota export (or an export-group member off this week's board) rides the row's OWN trip;
// the unmatch must still take the import off it.
test('T195 another export on the row\'s OWN trip (rota): the import still leaves and is cleared', async () => {
  const w = world();
  w.ctx.plFetch = async () => ({ records: [{ id: 1, code: 'RT-1', status: 'planned', ct_rt_legs: [
    { order_id: 1, direction: 'EXPORT' }, { order_id: 99, direction: 'EXPORT' }, { order_id: 2, direction: 'IMPORT' }] }] });
  await w.ctx._wiRemoveImport(1);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(w.orders.I.truck, null, 'the import is cleared: ' + JSON.stringify(w.log));
  assert.ok(!w.log.some(x => x.error && /άλλης εξαγωγής/.test(x.error)));
});

test('T195 the export points at ANOTHER member of the import group: the unmatch is not refused', async () => {
  const w = world({ imports: ['I', 'I2'] });
  const base = w.ctx.atGetOne;
  w.ctx.atGetOne = async (t, id) => { const r = await base(t, id); if (id === 'E') r.fields['Matched Import ID'] = 'I2'; return r; };
  const res = await w.ctx._wiRemoveImport(1);
  assert.notStrictEqual(res, null, 'refused: ' + JSON.stringify(w.log));
  assert.ok(w.log.some(x => x.id === 'E'), 'the export pointer was cleared');
});

test('T195 a second «×» while the first reads the server: refused, one unmatch only', async () => {
  const w = world();
  const [a, b] = await Promise.all([w.ctx._wiRemoveImport(1), w.ctx._wiRemoveImport(1)]);
  assert.ok(a === null || b === null, 'one of the two calls must stop');
  assert.strictEqual(w.log.filter(x => x.id === 'E').length, 1, 'the export was written once: ' + JSON.stringify(w.log));
});
