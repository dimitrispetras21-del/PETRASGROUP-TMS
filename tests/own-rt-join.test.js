// node --test tests/own-rt-join.test.js
// The import join (_wiImpJoin) and an order's OWN round trip (coordinator
// 9/10, fix/own-rt-join-rota). Since 033 every assigned order gets its own
// trip at assignment; «Καθαρισμός ανάθεσης» on a solo trip keeps the leg
// (_wiClear). The join did not look at that trip at all: it wrote the load's
// Group ID + vehicle, rt_create_from_order returned early (a live leg
// existed) and the load ended on TWO live trips — the 7/10 GI-MUV7FNKE class
// (Worker 409 on every sync, banner, B-77 red). Now _wiOwnRtFree runs before
// the first write:
//   (a) no own trip            → the join as before;
//   (b) an EMPTY own trip      → its leg leaves first (DELETE …/legs), a
//       re-read proves the order is on no live trip, then the join writes;
//   (c) other orders / closed / payroll / cost lines → refused, nothing
//       written; any read that fails (a dispatcher's 403 included) refuses.
// The REAL _wiImpJoin and its board helpers run in a vm (extracted verbatim
// from modules/weekly_intl.js) with the REAL core/pallet-feed.js plFetch, the
// REAL _wiRtOf/_wiRtLeave/_wiRtLegDelete and a scripted fetch that plays the
// Worker + the DB's rt_recompute (an emptied trip is cancelled). The proof is
// the call log and the fake tables, never a toast. Nothing leaves the process.
// WI_SRC=<path> runs the same cases against another copy of weekly_intl.js
// (on origin/main 5863a5e9 the (b)/(c) cases fail: no own-trip check at all).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const WI = fs.readFileSync(process.env.WI_SRC || path.join(ROOT, 'modules/weekly_intl.js'), 'utf8');
const PL_SRC = fs.readFileSync(path.join(ROOT, 'core/pallet-feed.js'), 'utf8');
const grab = (re, name, optional) => { const m = WI.match(re); if (!m && !optional) throw new Error(name + ' not found in weekly_intl.js'); return m ? m[0] : ''; };
const one = name => grab(new RegExp('function ' + name + '\\([^)]*\\)\\{[^\\n]*\\}\\n'), name);
const many = name => grab(new RegExp('(?:^|\\n)function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}\\n'), name);
const asyncMany = (name, optional) => grab(new RegExp('async function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}\\n'), name, optional);
const line = (re, name) => grab(re, name);

vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'core/data-helpers.js'), 'utf8'));
const { OrdersStock, OrdersCommon } = require(path.join(ROOT, 'core/orders-common.js'));

const WI_PARTS = [
  line(/const WI_EXECUTING=\[[^\]]*\];\n/, 'WI_EXECUTING'), line(/const WI_PAL_CAP=\d+;\n/, 'WI_PAL_CAP'),
  one('_wiPalOver'), one('_wiRecsPals'), one('_wiPalNote'), one('_wiIsPiece'), one('_wiIsLot'), one('_wiRecOf'), one('_wiVehOfF'),
  many('_wiLotHeld'), many('_wiImpGroupRowOf'), many('_wiPieceIn'), many('_wiGrpOrder'), many('_wiGiSortRecs'), many('_wiLoadRecs'),
  many('_wiJoinPalText'), many('_wiAssignLbl'), many('_wiAssignedText'), many('_wiVehLbl'), many('_wiJoinLoadLbl'), many('_wiJoinWho'),
  many('_wiJoinCheck'), many('_wiInhOf'), many('_wiRefuse'),
  asyncMany('_wiJoinReadLoad'), asyncMany('_wiImpJoin'),
  asyncMany('_wiOwnRtFree', true), asyncMany('_wiRtOf'), asyncMany('_wiRtLeave'), asyncMany('_wiRtLegDelete'),
].join('\n');

const LOAD = 'GI-MUX|recI461,recI463';
const imp = (id, no, ref, pal, extra = {}) => ({ Type: 'International', Direction: 'Import', Status: 'Pending', Reference: ref, 'Order No': no,
  'Total Pallets': pal, 'Loading DateTime': '2026-10-08T08:00:00', 'Delivery DateTime': '2026-10-12T10:00:00', ...extra });
// ledger_entry: what GET /costs/rt carries for the trip's live payroll line (null = none).
const trip = (id, code, pgs, extra = {}) => ({ id, code, status: 'planned', trip_type: 'OWNED', truck_id: null, driver_id: null,
  date_start: '2026-10-08', date_end: '2026-10-12', ledger_entry: null, ct_rt_legs: pgs.map((o, i) => ({ id: id * 10 + i, order_id: o, seq: i + 1, direction: 'IMPORT' })), ...extra });

// rts: the live round trips · role 'dispatcher' = 403 on /costs/lines ·
// lines: {rtId: n} · rtListFails: GET /costs/rt answers 500 ·
// legDelete(pg) → 'ok' | an HTTP status (refused) for that leg's DELETE.
function world({ rts = [], role = 'owner', lines = {}, rtListFails = false, legDelete = () => 'ok' } = {}) {
  const orders = {
    recE27: { Type: 'International', Direction: 'Export', Status: 'In Transit', Reference: 'E27', 'Order No': 27, 'Matched Import ID': 'recI461', Truck: ['recT27'], Driver: ['recD27'],
      'Loading DateTime': '2026-10-06T08:00:00', 'Delivery DateTime': '2026-10-08T10:00:00', 'Total Pallets': 33 },
    recI461: imp('recI461', 461, '461', 12, { Status: 'In Transit', 'Group ID': LOAD, Truck: ['recT27'], Driver: ['recD27'] }),
    recI463: imp('recI463', 463, '463', 12, { Status: 'Assigned', 'Group ID': LOAD, Truck: ['recT27'], Driver: ['recD27'], 'Loading DateTime': '2026-10-09T08:00:00' }),
    recI470: imp('recI470', 470, '470', 8),
    recIE: imp('recIE', 601, 'IE', 3, { 'Group ID': 'GI-TWO|recIE,recIF' }),
    recIF: imp('recIF', 602, 'IF', 3, { 'Group ID': 'GI-TWO|recIE,recIF', 'Loading DateTime': '2026-10-09T08:00:00' }),
  };
  const calls = [], errToasts = [], toasts = [], logged = [], reports = [], syncs = [], rtSaved = [];
  const copy = id => (orders[id] ? { id, fields: JSON.parse(JSON.stringify(orders[id])) } : null);
  const resp = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const board = () => ({
    exports: [copy('recE27')],
    imports: ['recI461', 'recI463', 'recI470', 'recIE', 'recIF'].map(copy),
    trucks: [{ id: 'recT27', label: 'TRK-27' }], partners: [], trailers: [], drivers: [{ id: 'recD27', label: 'Driver 27' }], stock: null,
  });
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {} }, JSON, Math, Date, Promise, Array, Object, Set, Map, Error, Number, String,
    OrdersStock, OrdersCommon, getLinkedId,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    PROXY_URL: 'https://w.invalid',
    TABLES: { ORDERS: 'tblO' },
    atGetOne: async (_t, id) => copy(id),
    atGetAll: async (_t, { filterByFormula }) => {
      const m = /^\{([^}]+)\}='(.*)'$/.exec(filterByFormula);
      return Object.keys(orders).filter(id => m && orders[id][m[1]] === m[2]).map(copy);
    },
    atSafePatch: async (_t, id, f) => {
      calls.push('PATCH order ' + id);
      for (const [k, v] of Object.entries(f)) { if (v === null || v === '' || (Array.isArray(v) && !v.length)) delete orders[id][k]; else orders[id][k] = v; }
      return copy(id);
    },
    showErrorToast: (m, type) => errToasts.push({ m, type }),
    toast: (m, k) => toasts.push({ m, k: k || 'success' }),
    logError: (e, where) => logged.push({ msg: e && e.message, where }),
    reportError: m => reports.push(m),
    escapeHtml: s => String(s),
    renderWeeklyIntl: async () => {},
    invalidateCache() {},
    rtOnOrderSaved: async id => { rtSaved.push(id); },
    _wiBlockReadOnly: () => false,
    _wiPalConfirm: async () => true,
    _wiSync: (slot, st, msg) => syncs.push([slot, st, msg]),
    _wiPlanPatch: async (_oid, f) => f,
    _wiWeekOf: () => 41,
    _wiStockLockSure: async () => '', _wiRewriteGroupSuffix: async () => true, _wiStockLockUndo: async () => null, _wiLockUndoNote: () => '',
    _wiStockPrime() {}, _wiBuildRows() {}, _wiPaint() {}, _wiNoUndo() {},
    WINTL: {
      data: board(),
      rows: [
        { id: 1, type: 'export', orderId: 'recE27', orderIds: ['recE27'], importId: 'recI461', truckId: 'recT27', driverId: 'recD27', trailerId: '', partnerId: '', truckLabel: 'TRK-27' },
        { id: 2, type: 'import', orderId: 'recI461', orderIds: ['recI461', 'recI463'], matchedTo: 'recE27', truckId: 'recT27', partnerId: '' },
        { id: 3, type: 'import', orderId: 'recI470', orderIds: ['recI470'], matchedTo: null, truckId: '', partnerId: '' },
        { id: 4, type: 'import', orderId: 'recIE', orderIds: ['recIE', 'recIF'], matchedTo: null, truckId: '', partnerId: '' },
      ],
    },
  };
  ctx.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const p = String(url).replace(ctx.PROXY_URL, '');
    calls.push(method + ' ' + p);
    if (p.startsWith('/costs/lines')) {
      if (role === 'dispatcher') return resp(403, { error: 'Forbidden' });
      const n = lines[Number((/rt_id=(\d+)/.exec(p) || [])[1])] || 0;
      return resp(200, { records: n ? [{ id: 1 }] : [], next_offset: n > 1 ? 1 : null });
    }
    if (p.startsWith('/costs/rt?') && method === 'GET') return rtListFails ? resp(500, { error: 'boom' }) : resp(200, { records: JSON.parse(JSON.stringify(rts)) });
    const del = /^\/costs\/rt\/(\d+)\/legs\?order_id=(\d+)$/.exec(p);
    if (del && method === 'DELETE') {
      const r = rts.find(x => x.id === Number(del[1])), pg = Number(del[2]);
      const verdict = legDelete(pg);
      if (verdict !== 'ok') return resp(verdict, { error: 'refused' });
      if (!r || !r.ct_rt_legs.some(l => l.order_id === pg)) return resp(404, { error: 'Leg not found on this round trip' });
      r.ct_rt_legs = r.ct_rt_legs.filter(l => l.order_id !== pg);
      if (!r.ct_rt_legs.length) r.status = 'cancelled';   // 013 rt_recompute
      return resp(200, { deleted: true });
    }
    return resp(404, { error: 'unexpected ' + method + ' ' + p });
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(PL_SRC, ctx, { filename: 'core/pallet-feed.js' });
  vm.runInContext(WI_PARTS + '\nwindow._wiImpJoin=_wiImpJoin;', ctx, { filename: 'modules/weekly_intl.js#join' });
  const writes = () => calls.filter(c => !c.startsWith('GET '));
  return { ctx, orders, rts, calls, writes, errToasts, toasts, logged, reports, syncs, rtSaved };
}

const join470 = w => w.ctx._wiImpJoin('recI461', 'recE27', 'recI470');
const joinTwo = w => w.ctx._wiImpJoin('recI461', 'recE27', 'recIE');
const INTO = 'φορτίο TRK-27 (461+463 · 24 π.)';
const joined = (w, id) => w.orders[id]['Group ID'] === LOAD && JSON.stringify(w.orders[id].Truck) === '["recT27"]';
function refusedClean(w, text) {
  assert.deepStrictEqual(w.writes(), [], 'something was written: ' + w.writes().join(', '));
  assert.deepStrictEqual(w.errToasts.map(t => t.m), [text]);
  assert.strictEqual(w.logged.length, 1, 'logged once: ' + JSON.stringify(w.logged));
  assert.strictEqual(w.logged[0].msg, text);
  assert.deepStrictEqual(w.toasts.filter(t => /✓/.test(t.m)), [], 'a green ✓ over a refusal');
  assert.deepStrictEqual(w.syncs[w.syncs.length - 1], ['wi-sync-1', null, undefined], 'the spinner was left on');
}

test('(a) 470 on no trip of its own: one PATCH, the load\'s Group ID + truck — no cost read, no DELETE', async () => {
  const w = world();
  assert.strictEqual(await join470(w), true);
  assert.deepStrictEqual(w.writes(), ['PATCH order recI470']);
  assert.ok(joined(w, 'recI470'));
  assert.ok(!w.calls.some(c => c.includes('/costs/lines')));
  assert.deepStrictEqual(w.toasts.map(t => t.m), ['Η εισαγωγή 470 μπήκε στο ' + INTO + ' ✓']);
  assert.deepStrictEqual(w.logged, []);
  assert.deepStrictEqual(w.rtSaved, ['recE27'], 'the export\'s trip is synced after the join');
});

test('(b) 470 alone on its empty RT-1300 (after «Καθαρισμός ανάθεσης»): the leg leaves FIRST, re-read, then the join — never two live trips', async () => {
  const w = world({ rts: [trip(300, 'RT-1300', [470]), trip(301, 'RT-1217', [27, 461, 463], { truck_id: 27, driver_id: 27 })] });
  assert.strictEqual(await join470(w), true);
  const del = w.calls.indexOf('DELETE /costs/rt/300/legs?order_id=470'), patch = w.calls.indexOf('PATCH order recI470');
  assert.ok(del >= 0, 'the leg never left RT-1300: ' + w.calls.join(', '));
  assert.ok(del < patch, 'the join wrote before the leg left its own trip: ' + w.calls.join(', '));
  assert.ok(w.calls.slice(del + 1, patch).some(c => c.startsWith('GET /costs/rt?')), 'no re-read between the DELETE and the write');
  assert.strictEqual(w.rts[0].status, 'cancelled', 'the empty trip is cancelled (the DB, 013)');
  assert.ok(joined(w, 'recI470'));
  assert.deepStrictEqual(w.toasts.map(t => t.m), ['Η εισαγωγή 470 μπήκε στο ' + INTO + ' ✓ · η #470 βγήκε από το άδειο RT-1300']);
  assert.deepStrictEqual(w.logged, []);
  assert.deepStrictEqual(w.errToasts, []);
});

test('(b) a two-member import on ONE shared empty trip: both legs leave, the trip goes, both members join', async () => {
  const w = world({ rts: [trip(400, 'RT-1400', [601, 602])] });
  assert.strictEqual(await joinTwo(w), true);
  const d1 = w.calls.indexOf('DELETE /costs/rt/400/legs?order_id=601'), d2 = w.calls.indexOf('DELETE /costs/rt/400/legs?order_id=602');
  assert.ok(d1 >= 0 && d2 >= 0, w.calls.join(', '));
  assert.ok(Math.max(d1, d2) < w.calls.indexOf('PATCH order recIE'), 'a member was written before both legs left');
  assert.strictEqual(w.rts[0].status, 'cancelled');
  assert.ok(joined(w, 'recIE') && joined(w, 'recIF'));
  assert.deepStrictEqual(w.toasts.map(t => t.m), ['Οι εισαγωγές IE+IF μπήκαν στο φορτίο TRK-27 (461+463 · 24 π.) ✓ · οι #IE, #IF βγήκαν από το άδειο RT-1400']);
});

test('(c) every trip is judged before the first leg leaves: IE on an empty trip, IF on a trip with costs — refused, IE\'s trip untouched', async () => {
  const w = world({ rts: [trip(400, 'RT-1400', [601]), trip(401, 'RT-1401', [602])], lines: { 401: 2 } });
  assert.strictEqual(await joinTwo(w), false);
  refusedClean(w, 'Η #IF είναι ακόμη στο δρομολόγιο RT-1401, που έχει έξοδα — ζήτα από τον owner να το ακυρώσει · δεν γράφτηκε τίποτα');
  assert.deepStrictEqual(w.rts.map(r => r.status), ['planned', 'planned']);
});

for (const [name, opts, why] of [
  ['the trip carries another order', { rts: [trip(300, 'RT-1300', [470, 999])] }, ' μαζί με άλλες παραγγελίες — δεν βγαίνει αυτόματα· ζήτα από τον owner'],
  ['the trip is closed', { rts: [trip(300, 'RT-1300', [470], { status: 'closed' })] }, ', που είναι κλειστό — ζήτα από τον owner'],
  ['the trip has a payroll line', { rts: [trip(300, 'RT-1300', [470], { ledger_entry: { id: 81, expenses: 120 } })] }, ', που έχει γραμμή μισθοδοσίας — ζήτα από τον owner να το ακυρώσει'],
  ['the trip has cost lines', { rts: [trip(300, 'RT-1300', [470])], lines: { 300: 1 } }, ', που έχει έξοδα — ζήτα από τον owner να το ακυρώσει'],
  ['a dispatcher cannot read the trip\'s cost lines (403)', { rts: [trip(300, 'RT-1300', [470])], role: 'dispatcher' }, ' και ο ρόλος σου δεν βλέπει αν έχει έξοδα — ζήτα από τον owner να το ακυρώσει'],
]) {
  test('(c) ' + name + ': refused, nothing written, said and logged once', async () => {
    const w = world(opts);
    assert.strictEqual(await join470(w), false);
    refusedClean(w, 'Η #470 είναι ακόμη στο δρομολόγιο RT-1300' + why + ' · δεν γράφτηκε τίποτα');
    assert.strictEqual(w.rts[0].status, opts.rts[0].status, 'the trip changed');
    assert.ok(!w.orders.recI470['Group ID'], '470 was given a group');
  });
}

test('read failure: the trips cannot be read — refused, nothing written (never a guess)', async () => {
  const w = world({ rtListFails: true });
  assert.strictEqual(await join470(w), false);
  refusedClean(w, 'Ο γύρος της #470 δεν διαβάστηκε (ο γύρος δεν διαβάστηκε (boom)) · δεν γράφτηκε τίποτα');
});

test('a leg DELETE refused after another member already left: stopped, said what DID happen, no member written', async () => {
  const w = world({ rts: [trip(400, 'RT-1400', [601, 602])], legDelete: pg => (pg === 602 ? 403 : 'ok') });
  assert.strictEqual(await joinTwo(w), false);
  assert.ok(!w.calls.some(c => c.startsWith('PATCH order')), 'a member was written: ' + w.calls.join(', '));
  const text = 'η #IE βγήκε από το RT-1400 · Η #IF ΔΕΝ βγήκε από το RT-1400 (χωρίς δικαίωμα αφαίρεσης σκέλους γύρου) · η ένταξη στο ' + INTO + ' δεν έγινε';
  assert.deepStrictEqual(w.reports, [text]);
  assert.strictEqual(w.logged.length, 1);
  assert.deepStrictEqual(w.syncs[w.syncs.length - 1], ['wi-sync-1', 'err', text]);
});
