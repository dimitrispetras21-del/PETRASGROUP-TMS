// node --test tests/match-own-trip.test.js
// 24/11/2026 (code review high of #332, pre_existing; owner: separate session).
// An import with its OWN truck, on its OWN live round trip, matched onto an
// export that HAS a vehicle. _wiSaveImportMatch wrote the export's vehicle onto
// the import while its leg was still on its own trip: rt_sync_from_order copied
// the new truck onto that old trip, rtOnOrderSaved saw a live leg and did not
// attach the import to the export's trip — one pair on TWO live trips (the
// GI-MUV7FNKE / B-77 class, Worker 409). The import must first leave its own
// trip (_wiOwnRtFree, «first the leg, then the vehicle»), or nothing is written.
//
// UNIT ONLY: the functions are extracted verbatim from the module source and run
// against a model of the facade + the triggers. Nothing is sent anywhere.
// WI_SRC=<path> runs the same cases against another copy of weekly_intl.js
// (the «before» proof: origin/main fails the first case).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WI = fs.readFileSync(process.env.WI_SRC || path.join(__dirname, '..', 'modules/weekly_intl.js'), 'utf8');
const grab = (re, name) => { const m = WI.match(re); if (!m) throw new Error(name + ' not found'); return m[0]; };
const wiSrc = [
  grab(/async function _wiRtOf\(orderId\)\{[\s\S]*?\n\}\n/, '_wiRtOf'),
  grab(/async function _wiRtLeave\(orderId(?:,opts)?\)\{[\s\S]*?\n\}\n/, '_wiRtLeave'),
  grab(/async function _wiOwnRtFree\(recs\)\{[\s\S]*?\n\}\n/, '_wiOwnRtFree'),
  grab(/function _wiInhOf\(row\)\{[\s\S]*?\n\}\n/, '_wiInhOf'),
  grab(/function _wiRecOf\(id\)\{[^\n]*\n/, '_wiRecOf'),
  grab(/function _wiOrdTxt\(r,fb\)\{[^\n]*\n/, '_wiOrdTxt'),
  grab(/async function _wiRtTxt\(rt\)\{[^\n]*\n/, '_wiRtTxt'),
  grab(/function _wiErrList\(list,recs\)\{[^\n]*\n/, '_wiErrList'),
  grab(/async function _wiSaveImportMatch\(rowId,impId\)\{[\s\S]*?\n\}\n/, '_wiSaveImportMatch'),
].join('\n');

// Export E (truck T1, driver D1) on RT1. Import I (own truck T14, driver D14)
// alone on its own RT2. The model applies, in the order the browser sends them:
//   rt_sync_from_order — a vehicle PATCH on an order copies it onto its live trip
//                        and onto every other order of that trip;
//   rt_recompute + dl_sync_from_rt — a trip left with no legs is cancelled and
//                        its empty payroll line dropped;
//   rtOnOrderSaved(E)  — N1: the matched import's leg is attached to E's trip
//                        ONLY when it is on no live trip (a live leg = stop).
function world({ ownLedger = null, costs = 'none', exportTruck = 'T1', role = 'owner', failExport = false, alreadyMatched = false } = {}) {
  const orders = {
    E: { no: 1, truck: exportTruck, driver: exportTruck ? 'D1' : null, matched: alreadyMatched ? 'I' : null },
    I: { no: 2, truck: 'T14', driver: 'D14', matched: null },
  };
  const trips = {
    1: { id: 1, code: 'RT-1', status: 'planned', truck: exportTruck, legs: new Set(exportTruck ? ['E'] : []), ledger_entry: null },
    2: { id: 2, code: 'RT-2', status: 'planned', truck: 'T14', legs: new Set(['I']), ledger_entry: ownLedger },
  };
  const idOfNo = no => Object.keys(orders).find(k => orders[k].no === no);
  const liveTripOf = id => Object.values(trips).find(t => t.status !== 'cancelled' && t.legs.has(id)) || null;
  const log = [];
  const rtSync = id => {
    const t = liveTripOf(id); if (!t) return;
    t.truck = orders[id].truck;
    for (const sib of t.legs) if (sib !== id) { orders[sib].truck = orders[id].truck; orders[sib].driver = orders[id].driver; }
  };
  const recOf = id => ({ id, fields: Object.assign({ 'Order No': orders[id].no, 'Loading DateTime': '2026-11-23T06:00:00Z', 'Delivery DateTime': '2026-11-25T06:00:00Z' },
    orders[id].truck ? { Truck: [orders[id].truck] } : {}, orders[id].matched ? { 'Matched Import ID': orders[id].matched } : {}) });
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    TABLES: { ORDERS: 'O' }, ROLE: role,
    WINTL: { rows: [], data: { exports: [{ id: 'E', fields: {} }], imports: [{ id: 'I', fields: {} }] }, ui: {} },
    PlainRef: require(path.join(__dirname, '..', 'core/plain-ref.js')), _fhLocationsMap: {}, escapeHtml: s => String(s),
    _rtLookups: async () => null,
    getLinkedId: v => (Array.isArray(v) ? v[0] || null : v || null),
    LoadGroup: { sameLoad: () => false },
    atGetOne: async (_t, id) => recOf(id),
    // T195 (27/11): the match asks which exports already point at the import
    atGetAll: async (_t, o) => { const ids = (String(o.filterByFormula).match(/'([^']+)'/g) || []).map(x => x.slice(1, -1));
      return Object.keys(orders).filter(k => ids.includes(orders[k].matched)).map(recOf); },
    atSafePatch: async (_t, id, f) => {
      log.push({ patch: id, f: Object.keys(f) });
      if (failExport && id === 'E') return { error: { message: 'rig: export write failed' } };
      const o = orders[id];
      if ('Matched Import ID' in f) o.matched = f['Matched Import ID'] || null;
      if ('Truck' in f) o.truck = (f.Truck || [])[0] || null;
      if ('Driver' in f) o.driver = (f.Driver || [])[0] || null;
      if ('Truck' in f || 'Driver' in f) rtSync(id);
      return recOf(id);
    },
    plFetch: async url => {
      log.push({ get: url.split('?')[0] });
      if (url.startsWith('/costs/lines')) {
        if (costs === 'forbidden') throw new Error('HTTP 403 forbidden');
        return { records: costs === 'some' ? [{ id: 9 }] : [] };
      }
      return { records: Object.values(trips).map(t => ({ id: t.id, code: t.code, status: t.status, ledger_entry: t.ledger_entry,
        ct_rt_legs: [...t.legs].map(o => ({ order_id: orders[o].no })) })) };
    },
    _wiRtLegDelete: async (rtId, pg) => {
      log.push({ del: rtId });
      const t = trips[rtId]; t.legs.delete(idOfNo(pg));
      if (!t.legs.size) { t.status = 'cancelled'; t.ledger_entry = null; }
      return { ok: true, status: 200 };
    },
    rtOnOrderSaved: async id => {
      log.push({ rtSaved: id });
      const imp = orders[id].matched; const t = liveTripOf(id);
      if (!imp || !t || liveTripOf(imp)) return;   // a live leg elsewhere: N1 does not attach
      t.legs.add(imp);
    },
    _wiBlockReadOnly: () => false, _wiLotHeld: () => false,
    _wiGiGroup: async id => ({ lead: id, members: [id] }),
    _wiPieceIn: () => [], _wiIsPiece: () => false,
    _wiV2Active: () => false, _wiExpectOpt: () => undefined, _wiQuietOpt: () => undefined, _wiExpectNote: () => '',
    _wiPlanPatch: async (_id, inh) => inh,
    _wiDataSet() {}, _wiPaint() {}, _wiSync() {}, syncOrderDownstream: async () => {},
    renderWeeklyIntl: async () => { log.push({ reload: true }); },
    _wiRefuse: (m) => log.push({ refuse: m }), toast: (m) => log.push({ toast: m }),
    reportError: (m) => log.push({ error: m }), logError() {},
    _wiImpGroupRowOf: () => null, _wiRemoveImport: async () => true,
  };
  ctx.WINTL.rows = [
    { id: 1, type: 'export', orderId: 'E', orderIds: ['E'], importId: null, truckId: exportTruck || '', driverId: exportTruck ? 'D1' : '' },
    { id: 2, type: 'import', orderId: 'I', orderIds: ['I'], matchedTo: null, truckId: 'T14' },
  ];
  vm.runInNewContext(wiSrc + '\nObject.assign(this,{_wiSaveImportMatch});', ctx);
  return { ctx, orders, trips, log, liveTripOf };
}
const settle = () => new Promise(r => setTimeout(r, 10));

test('own trip, empty shell: the import leaves its trip FIRST, then takes the export\'s vehicle and rides the export\'s trip', async () => {
  const w = world();
  await w.ctx._wiSaveImportMatch(1, 'I');
  await settle();
  const del = w.log.findIndex(x => x.del === 2);
  const veh = w.log.findIndex(x => x.patch === 'I' && x.f.includes('Truck'));
  assert.ok(del >= 0, 'the import\'s leg never left its own trip');
  assert.ok(veh > del, 'the vehicle was written before the leg left');
  assert.strictEqual(w.orders.I.truck, 'T1');
  assert.strictEqual(w.trips[2].status, 'cancelled', 'the import\'s own trip is still live (two trips)');
  assert.strictEqual(w.trips[2].truck, 'T14', 'the export\'s truck was copied onto the import\'s old trip');
  assert.strictEqual(w.liveTripOf('I'), w.trips[1], 'the import is not on the export\'s trip');
  assert.strictEqual(w.orders.E.truck, 'T1');
});

test('own trip with a payroll line: refused, NOTHING written, the import keeps its truck and trip', async () => {
  const w = world({ ownLedger: { id: 5 } });
  await w.ctx._wiSaveImportMatch(1, 'I');
  await settle();
  assert.deepStrictEqual(w.log.filter(x => x.patch || x.del), [], 'something was written');
  assert.strictEqual(w.orders.E.matched, null);
  assert.strictEqual(w.orders.I.truck, 'T14');
  assert.strictEqual(w.liveTripOf('I'), w.trips[2]);
  const r = w.log.find(x => x.refuse);
  assert.ok(r && /μισθοδοσίας/.test(r.refuse) && /ΔΕΝ έγινε/.test(r.refuse), JSON.stringify(w.log));
  assert.ok(!/RT-\d|rec[A-Za-z0-9]{3}/.test(r.refuse), 'a code in the message: ' + r.refuse);
  assert.ok(/πρώτα «Καθαρισμός ανάθεσης» στην εισαγωγή/.test(r.refuse), 'no next step for the dispatcher: ' + r.refuse);
});

test('dispatcher, own trip with a payroll line: refused, and no «Καθαρισμός ανάθεσης» advice (their retry hits the 403)', async () => {
  const w = world({ ownLedger: { id: 5 }, role: 'dispatcher' });
  await w.ctx._wiSaveImportMatch(1, 'I');
  await settle();
  assert.deepStrictEqual(w.log.filter(x => x.patch || x.del), []);
  const r = w.log.find(x => x.refuse);
  assert.ok(r && /ζήτα από τον owner/.test(r.refuse) && !/Καθαρισμός ανάθεσης/.test(r.refuse), r && r.refuse);
});

test('the export write fails after the import left its own trip: the import gets a trip back from its own vehicle, and it is said', async () => {
  const w = world({ failExport: true });
  await w.ctx._wiSaveImportMatch(1, 'I');
  await settle();
  assert.ok(w.log.some(x => x.del === 2), 'the leg did not leave first');
  assert.strictEqual(w.orders.I.truck, 'T14', 'the import lost its own truck');
  assert.ok(w.log.some(x => x.rtSaved === 'I'), 'nothing gave the import a trip back');
  assert.ok(w.log.some(x => x.toast && /κρατά το δικό της όχημα/.test(x.toast)), 'not said');
});

test('a two-export group whose second match PATCH fails: the import is NOT given its own trip back (it is matched), and it is said', async () => {
  const w = world();
  w.orders.E2 = { no: 3, truck: 'T1', driver: 'D1', matched: null }; w.trips[1].legs.add('E2');
  w.ctx.WINTL.rows[0].orderIds = ['E', 'E2'];
  const orig = w.ctx.atSafePatch;
  w.ctx.atSafePatch = async (t, id, f) => (id === 'E2' ? { error: { message: 'rig: second export failed' } } : orig(t, id, f));
  await w.ctx._wiSaveImportMatch(1, 'I');
  await settle();
  assert.strictEqual(w.orders.E.matched, 'I');
  assert.ok(!w.log.some(x => x.rtSaved === 'I'), 'a matched import was given its own trip again');
  assert.ok(w.log.some(x => x.toast && /χωρίς δρομολόγιο/.test(x.toast)), 'not said');
});

test('the server already names this import on this export (re-confirmation, 8/9): no own-trip step, no refusal', async () => {
  const w = world({ alreadyMatched: true, ownLedger: { id: 5 } });
  await w.ctx._wiSaveImportMatch(1, 'I');
  await settle();
  assert.ok(!w.log.some(x => x.refuse), JSON.stringify(w.log));
  assert.ok(!w.log.some(x => x.del), 'a leg was taken off');
});

test('own trip whose costs the role cannot read (dispatcher, 403): refused, nothing written', async () => {
  const w = world({ costs: 'forbidden' });
  await w.ctx._wiSaveImportMatch(1, 'I');
  await settle();
  assert.deepStrictEqual(w.log.filter(x => x.patch || x.del), []);
  assert.strictEqual(w.orders.I.truck, 'T14');
  assert.ok(w.log.some(x => x.refuse && /έξοδα/.test(x.refuse)));
});

test('own trip with cost lines: refused, nothing written', async () => {
  const w = world({ costs: 'some' });
  await w.ctx._wiSaveImportMatch(1, 'I');
  await settle();
  assert.deepStrictEqual(w.log.filter(x => x.patch || x.del), []);
  assert.strictEqual(w.liveTripOf('I'), w.trips[2]);
});

test('export with NO vehicle (owner 8/11 #10): only the match is written, the import keeps its own truck and trip', async () => {
  const w = world({ exportTruck: null });
  await w.ctx._wiSaveImportMatch(1, 'I');
  await settle();
  assert.strictEqual(w.orders.E.matched, 'I');
  assert.ok(!w.log.some(x => x.del), 'a leg was taken off');
  assert.ok(!w.log.some(x => x.patch === 'I'), 'the import was written');
  assert.ok(!w.log.some(x => x.get === '/costs/lines'), 'trips were judged for a match that moves none');
  assert.strictEqual(w.orders.I.truck, 'T14');
  assert.strictEqual(w.liveTripOf('I'), w.trips[2]);
});

// T195 (27/11/2026): the import-side lock read «Matched Export ID», which the Worker does not serve, so a second
// export could match an import that already rode with another (#700 and #759 on #770, 19/11).
test('T195 an import another export already points at: refused, nothing written, the board reloads', async () => {
  const w = world();
  w.ctx.atGetAll = async () => [{ id: 'X', fields: { 'Matched Import ID': 'I', 'Order No': 77 } }];
  await w.ctx._wiSaveImportMatch(1, 'I');
  assert.ok(!w.log.some(x => x.patch), 'no write: ' + JSON.stringify(w.log));
  assert.ok(w.log.some(x => x.refuse && /ήδη ταιριασμένη με άλλη εξαγωγή \(#77\)/.test(x.refuse)), JSON.stringify(w.log));
  assert.ok(w.log.some(x => x.reload));
});

test('T195 the pointer check cannot be read: refused, nothing written', async () => {
  const w = world();
  w.ctx.atGetAll = async () => { throw new Error('network'); };
  await w.ctx._wiSaveImportMatch(1, 'I');
  assert.ok(!w.log.some(x => x.patch));
  assert.ok(w.log.some(x => x.refuse && /Δεν διαβάστηκε αν η εισαγωγή είναι ήδη ταιριασμένη/.test(x.refuse)));
});
