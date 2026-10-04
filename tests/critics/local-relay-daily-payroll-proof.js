// Proof rig — local relays (060) on Daily Ops, Payroll and the Drivers card.
// Owner 4/10/2026: «οκ προχωρα με τις τοπικες παραδοσεις»; OWNER-Q2 answered
// 4/10 (both: salary = track record only, per_trip = daily ΤΟΠΙΚΟ line);
// Q3 (availability) deliberately NOT built — nothing here asserts it.
//
// Run from the MAIN repo (node_modules/playwright + the .har live there):
//   cd /Users/dimitrispetras/PETRASGROUP-TMS
//   python3 -m http.server 8799 -d <worktree> &
//   NODE_PATH=$PWD/node_modules PW_BASE_URL=http://127.0.0.1:8799/ \
//     node <worktree>/tests/critics/local-relay-daily-payroll-proof.js
//
// The HAR (28/8) holds 0 local_moves and no relay columns, so every table the
// three screens read is STUBBED here with fictional names (public repo: no
// real client, driver or plate reaches the screenshots). Registered AFTER
// preparePage, so it wins over the HAR replay; anything it does not know
// falls back to the replay (route.fallback). Static code loads LIVE from
// PW_BASE_URL — the worktree under test.
//
// Scenarios (plan Β7, Daily/Payroll part):
//   Ημερήσιο   import with relay (same truck) · relay without driver (red,
//              clickable) · Cancelled relay covers nothing · drop-and-hook
//              (other tractor + other trailer) · delivered → «Παραδόθηκε από
//              τοπικό …» · groupage of 3 with 2 relays «ΤΟΠ. 2/3» · export
//              loading relay + confirm text · overdue zone · FOUR sections ·
//              relay request separate from OPS_FIELDS (Relay.loadForOrders) ·
//              REAL Relay.openPanel in the app modal: prefilled, PATCH, read-back,
//              re-read, dropped label said, Enter, Άκυρο · missing panel = toast ·
//              warehouse sees, cannot open, no amounts · failed read / no
//              «Move Kind» = visible zone, day still renders
//   Μισθοδοσία local line label (the trigger's route text), no ↗, Διόρθωση
//              only while a live relay holds the day (no Επαναφορά even for
//              owner) · Ακύρωση with a reason when the day has no live relay
//              or the driver is salaried · «Αξία 0» asks why (note) · RT line
//              «⇄ τοπ. <who> · <day>» · month cards «· τοπ. M» · pay basis
//              unknown / salaried · track record table from local_moves ·
//              dispatcher sees no payroll
//   Οδηγοί     card «Τοπικές κινήσεις» (dispatcher) · form «Τύπος αμοιβής»
//              (owner; not drawn for the dispatcher; a Worker that drops it
//              is said after the save)

const path = require('path');
const fs = require('fs');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { preparePage, gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8799/';
const SHOT_DIR = process.env.PW_SHOT_DIR || path.join(__dirname, '..', '..', 'docs', 'data-audit', '2026-10', 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const BACKEND = 'petras-tms-backend-staging.petrasgroup.workers.dev';

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error('ΑΠΟΤΥΧΙΑ: ' + msg);
  passed++;
  console.log('  ✓ ' + msg);
}

// ── dates: the browser runs on this machine's clock, so «today» is the same ──
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return iso(d); };
const TODAY = addDays(0), YDAY = addDays(-1), PLUS3 = addDays(3), MINUS3 = addDays(-3);

// ── reference data (fictional) ─────────────────────────────────────────────
const rec = (id, fields) => ({ id, createdTime: '2026-10-01T00:00:00.000Z', fields });
const VER = 'recJucKOhC1zh4IP3';   // CLAUDE.md: the Veroia Cross-Dock location id
const TRK = { A: 'recTrkA001', B: 'recTrkB002', L: 'recTrkL003' };
const TRL = { A: 'recTrlA001', B: 'recTrlB002', C: 'recTrlC003' };
const DRV = { IA: 'recDrvIntlA1', IB: 'recDrvIntlB2', P: 'recDrvLocP31', K: 'recDrvLocK16' };
const REF = {
  trucks: [rec(TRK.A, { 'License Plate': 'ΚΒΧ1001', Active: true }), rec(TRK.B, { 'License Plate': 'ΚΒΧ1002', Active: true }), rec(TRK.L, { 'License Plate': 'ΚΒΧ2000', Active: true })],
  trailers: [rec(TRL.A, { 'License Plate': 'Ρ-501', Active: true }), rec(TRL.B, { 'License Plate': 'Ρ-502', Active: true }), rec(TRL.C, { 'License Plate': 'Ρ-503', Active: true })],
  // 'Pay Basis': P absent (= unknown, facade trap 2), K salaried.
  drivers: [
    rec(DRV.IA, { 'Full Name': 'Διεθνής Α', Active: true, Type: 'Internal' }),
    rec(DRV.IB, { 'Full Name': 'Διεθνής Β', Active: true, Type: 'Internal' }),
    rec(DRV.P, { 'Full Name': 'Τοπικός Π', Active: true, Type: 'Internal' }),
    rec(DRV.K, { 'Full Name': 'Τοπικός Κ', Active: true, Type: 'Internal', 'Pay Basis': 'salary' }),
  ],
  locations: [rec(VER, { Name: 'VEROIA CROSS-DOCK' }), rec('recLocSky01', { Name: 'SKYDRA' }), rec('recLocNl001', { Name: 'BARENDRECHT' }),
    rec('recLocNao01', { Name: 'NAOUSA' }), rec('recLocDe001', { Name: 'MUENCHEN' })],
  clients: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(x => rec('recCli000' + x, { 'Company Name': 'Πελάτης ' + x })),
  partners: [],
};

// ── orders of the day (Daily Ops) ──────────────────────────────────────────
const ORD = { I1: 'recOrdImp0001', I2: 'recOrdImp0002', I3: 'recOrdImp0003', I4: 'recOrdImp0004',
  E1: 'recOrdExp0011', E2: 'recOrdExp0012', E3: 'recOrdExp0013', E5: 'recOrdExp0015', OV: 'recOrdImp0009' };
function order(id, no, o) {
  const imp = o.dir === 'Import';
  const r = rec(id, Object.assign({
    'Order No': no, Direction: o.dir, Client: [o.cli], Status: o.st, 'Total Pallets': 33,
    'Loading DateTime': o.load, 'Delivery DateTime': o.del,
    Truck: [o.trk], Trailer: [o.trl], Driver: [o.drv], 'ORDER STOPS': ['recStp' + no + 'L', 'recStp' + no + 'U'],
  }, o.gid ? { 'Group ID': o.gid } : {}));
  r._stops = imp ? ['recLocNl001', 'recLocNao01'] : ['recLocSky01', 'recLocDe001'];
  return r;
}
const ORDERS = [
  order(ORD.I1, 415, { dir: 'Import', cli: 'recCli000A', st: 'In Transit', load: MINUS3, del: TODAY, trk: TRK.A, trl: TRL.A, drv: DRV.IA }),
  order(ORD.I2, 416, { dir: 'Import', cli: 'recCli000B', st: 'Assigned', load: MINUS3, del: TODAY, trk: TRK.B, trl: TRL.B, drv: DRV.IB }),
  order(ORD.I3, 417, { dir: 'Import', cli: 'recCli000C', st: 'Assigned', load: MINUS3, del: TODAY, trk: TRK.A, trl: TRL.A, drv: DRV.IA }),
  order(ORD.I4, 418, { dir: 'Import', cli: 'recCli000D', st: 'Delivered', load: MINUS3, del: TODAY, trk: TRK.B, trl: TRL.B, drv: DRV.IB }),
  order(ORD.E1, 431, { dir: 'Export', cli: 'recCli000E', st: 'Assigned', load: TODAY, del: PLUS3, trk: TRK.A, trl: TRL.A, drv: DRV.IA, gid: 'GRP-77' }),
  order(ORD.E2, 432, { dir: 'Export', cli: 'recCli000F', st: 'Assigned', load: TODAY, del: PLUS3, trk: TRK.A, trl: TRL.A, drv: DRV.IA, gid: 'GRP-77' }),
  order(ORD.E3, 433, { dir: 'Export', cli: 'recCli000G', st: 'Assigned', load: TODAY, del: PLUS3, trk: TRK.A, trl: TRL.A, drv: DRV.IA, gid: 'GRP-77' }),
  order(ORD.E5, 435, { dir: 'Export', cli: 'recCli000B', st: 'Assigned', load: TODAY, del: PLUS3, trk: TRK.B, trl: TRL.B, drv: DRV.IB }),
];
const OVERDUE = [order(ORD.OV, 409, { dir: 'Import', cli: 'recCli000C', st: 'In Transit', load: addDays(-4), del: YDAY, trk: TRK.A, trl: TRL.A, drv: DRV.IA })];
const ALL_ORDERS = [...ORDERS, ...OVERDUE];
const STOPS = ALL_ORDERS.flatMap(o => [
  rec('recStp' + o.fields['Order No'] + 'L', { 'Parent Order': [o.id], 'Stop Type': 'Loading', 'Stop Number': 1, Location: [o._stops[0]], DateTime: o.fields['Loading DateTime'] }),
  rec('recStp' + o.fields['Order No'] + 'U', { 'Parent Order': [o.id], 'Stop Type': 'Unloading', 'Stop Number': 1, Location: [o._stops[1]], DateTime: o.fields['Delivery DateTime'] }),
]);

// ── LOCAL MOVES (060 shape: Move Kind always present, NOT NULL) ────────────
function lm(id, f) { return rec(id, Object.assign({ Sequence: 1 }, f)); }
const MOVES = [
  lm('recLmv0000001', { 'Parent Order': [ORD.I1], 'Move Kind': 'relay_delivery', Driver: [DRV.P], Trailer: [TRL.A], 'From Location': [VER], 'Time From': '07:00', Status: 'Assigned', Date: TODAY }),
  lm('recLmv0000002', { 'Parent Order': [ORD.I2], 'Move Kind': 'relay_delivery', 'From Location': [VER], Status: 'Pending', Date: TODAY }),
  lm('recLmv0000003', { 'Parent Order': [ORD.I3], 'Move Kind': 'relay_delivery', Driver: [DRV.P], Trailer: [TRL.A], 'From Location': [VER], Status: 'Cancelled', Date: TODAY }),
  lm('recLmv0000004', { 'Parent Order': [ORD.I4], 'Move Kind': 'relay_delivery', Driver: [DRV.P], Truck: [TRK.L], Trailer: [TRL.C], 'From Location': [VER], 'Time From': '08:30', Status: 'Assigned', Date: TODAY }),
  lm('recLmv0000005', { 'Parent Order': [ORD.E1], 'Move Kind': 'relay_loading', Driver: [DRV.K], Trailer: [TRL.A], 'To Location': [VER], 'Time From': '06:00', Status: 'Assigned', Date: TODAY }),
  lm('recLmv0000006', { 'Parent Order': [ORD.E2], 'Move Kind': 'relay_loading', Driver: [DRV.K], Trailer: [TRL.A], 'To Location': [VER], 'Time From': '06:00', Status: 'Assigned', Date: TODAY }),
  lm('recLmv0000007', { 'Parent Order': [ORD.E5], 'Move Kind': 'relay_loading', Driver: [DRV.K], Trailer: [TRL.B], 'To Location': [VER], 'Time From': '06:00', Status: 'Assigned', Date: TODAY }),
  lm('recLmv0000008', { 'Parent Order': [ORD.OV], 'Move Kind': 'relay_delivery', Driver: [DRV.P], Trailer: [TRL.A], 'From Location': [VER], 'Time From': '07:30', Status: 'Assigned', Date: YDAY }),
  // A plain errand from Weekly National (no order) — part of P's track record.
  lm('recLmv0000009', { 'Move Kind': 'local', Driver: [DRV.P], 'From Location': [VER], 'To Location': ['recLocNao01'], Description: 'Μεταφορά παλετών', 'Time From': '13:00', Status: 'Assigned', Date: TODAY }),
];

// ── payroll fixtures (no real amounts: neutral test values only) ───────────
const PG = { P: 31, K: 16, IA: 37 };
const LOOKUPS = { trucks: [], trailers: [], partners: [], pay_sources: [],
  drivers: [{ id: PG.P, legacy_id: DRV.P, full_name: 'Τοπικός Π', active: true }, { id: PG.K, legacy_id: DRV.K, full_name: 'Τοπικός Κ', active: true },
    { id: PG.IA, legacy_id: DRV.IA, full_name: 'Διεθνής Α', active: true }] };
function ent(o) {
  return Object.assign({ rt_id: null, rt_code: null, date_end: null, route_legs: null, needs_review: false, review_note: null, deleted_reason: null,
    note: null, advance: null, expenses: null, amount: null, trip_value: null, cancelled: false, pending: false, balance_delta: 0, running_balance: 0,
    local_move_id: null, relay_info: null, cash_lines: 0, cash_sum: 0, source: 'auto' }, o);
}
function freshLedger() {
  return {
    [PG.P]: [
      // relay_info: one entry per move, its RT codes as an array (060 view).
      ent({ id: 9001, driver_id: PG.P, entry_type: 'trip', entry_date: TODAY, local_move_id: 501, pending: true, balance_delta: null,
        route_text: 'ΤΟΠΙΚΟ · παράδοση 415 · παράδοση 418', relay_info: { kind: 'local_day', moves: [
          { id: 501, move_kind: 'relay_delivery', order_id: 415, rt_codes: ['RT-9415'] },
          { id: 504, move_kind: 'relay_delivery', order_id: 418, rt_codes: ['RT-9418'] }] } }),
      ent({ id: 9003, driver_id: PG.P, entry_type: 'trip', entry_date: YDAY, local_move_id: 508, trip_value: 0, balance_delta: 0,
        route_text: 'ΤΟΠΙΚΟ · παράδοση 409', note: 'πληρώθηκε μέσα στο δρομολόγιο',
        relay_info: { kind: 'local_day', moves: [{ id: 508, move_kind: 'relay_delivery', order_id: 409, rt_codes: [] }] } }),
      // money written, then its relay was deleted: the trigger flagged it and
      // can no longer resolve it — accounting may cancel it, with a reason
      ent({ id: 9005, driver_id: PG.P, entry_type: 'trip', entry_date: MINUS3, local_move_id: 510, trip_value: 1, balance_delta: 1,
        needs_review: true, review_note: 'τοπικές κινήσεις: καμία ζωντανή πια', route_text: 'ΤΟΠΙΚΟ · παράδοση 410',
        relay_info: { kind: 'local_day', moves: [] } }),
      ent({ id: 9002, driver_id: PG.P, entry_type: 'trip', entry_date: YDAY, local_move_id: 503, cancelled: true,
        route_text: 'ΤΟΠΙΚΟ · παράδοση 417', deleted_reason: 'Τοπικές κινήσεις: καμία ζωντανή κίνηση της ημέρας', relay_info: null }),
      ent({ id: 9004, driver_id: PG.P, entry_type: 'trip', entry_date: YDAY, route_text: 'Χειροκίνητη δοκιμή', source: 'manual', cancelled: true, deleted_reason: 'fixture' }),
    ],
    [PG.IA]: [
      ent({ id: 9101, driver_id: PG.IA, entry_type: 'trip', entry_date: MINUS3, date_end: TODAY, rt_id: 9415, rt_code: 'RT-9415', pending: true, balance_delta: null,
        route_text: null, route_legs: [{ dir: 'IMPORT', load: MINUS3, deliv: TODAY, from: { name: 'BARENDRECHT', country: 'NL' }, to: { name: 'NAOUSA', country: 'GR' } }], relay_info: { kind: 'rt', relays: [{ id: 501, rec: 'recLmv0000001', move_kind: 'relay_delivery', order_id: 415, reference: null, driver_id: PG.P, driver_name: 'Τοπικός Π', move_date: TODAY }] } }),
      ent({ id: 9102, driver_id: PG.IA, entry_type: 'trip', entry_date: MINUS3, rt_id: 9440, rt_code: 'RT-9440', pending: true, balance_delta: null, route_text: null,
        route_legs: [{ dir: 'EXPORT', load: MINUS3, deliv: TODAY, from: { name: 'SKYDRA', country: 'GR' }, to: { name: 'MUENCHEN', country: 'DE' } }] }),
    ],
    [PG.K]: [ent({ id: 9201, driver_id: PG.K, entry_type: 'payment_bank', entry_date: MINUS3, amount: 1, balance_delta: -1, running_balance: -1 }),
      // paid per trip, then made salaried: the trigger flagged the line (money
      // was written) and will never resolve it — cancellable, with a reason
      ent({ id: 9202, driver_id: PG.K, entry_type: 'trip', entry_date: TODAY, local_move_id: 505, trip_value: 1, balance_delta: 1,
        needs_review: true, review_note: 'ο οδηγός έγινε μισθωτός (μόνο ιστορικό)', route_text: 'ΤΟΠΙΚΟ · φόρτωση 431 · φόρτωση 432 · φόρτωση 435',
        relay_info: { kind: 'local_day', moves: [{ id: 505, move_kind: 'relay_loading', order_id: 431, rt_codes: [] },
          { id: 506, move_kind: 'relay_loading', order_id: 432, rt_codes: [] }, { id: 507, move_kind: 'relay_loading', order_id: 435, rt_codes: [] }] } })],
  };
}
function balances() {
  const b = (id, name, pend) => ({ driver_id: id, full_name: name, type: 'Internal', active: true, has_entries: true, balance: 0, pending_count: pend,
    trips_ytd: 1, last_entry_date: TODAY, last_trip_date: TODAY, last_payment_date: null, last_payment_type: null });
  return [b(PG.P, 'Τοπικός Π', 1), b(PG.K, 'Τοπικός Κ', 0), b(PG.IA, 'Διεθνής Α', 2)];
}
function monthBlock() {
  const z = { trips: 0, local_days: 0, pending: 0, value: 0, expenses: 0, advance: 0, payments: 0, adjustments: 0, last_payment: null };
  return { from: TODAY.slice(0, 8) + '01', to: TODAY.slice(0, 8) + '28',
    drivers: { [PG.P]: Object.assign({}, z, { local_days: 2 }), [PG.K]: Object.assign({}, z), [PG.IA]: Object.assign({}, z, { trips: 2, pending: 2 }) } };
}

// ── one backend stub, dispatched by path ───────────────────────────────────
function idsIn(formula, label) {
  const re = new RegExp('FIND\\("(rec[A-Za-z0-9]+)",ARRAYJOIN\\(\\{' + label.replace(/ /g, ' ') + '\\}', 'g');
  return [...String(formula).matchAll(re)].map(m => m[1]);
}
function recordIds(formula) { return [...String(formula).matchAll(/RECORD_ID\(\)="(rec[A-Za-z0-9]+)"/g)].map(m => m[1]); }
const strip = r => ({ id: r.id, createdTime: r.createdTime, fields: r.fields });

async function installStubs(page, opts = {}) {
  const cap = { moves: [], orders: [], ledgerGets: 0, patches: [], drivers: [], lmPatches: [], lmReads: [], dropLabels: [], driverPatches: [] };
  // Per page: the end-to-end save below writes into its own copy, so no
  // other scenario sees a time it did not set.
  const moves = MOVES.map(r => ({ ...r, fields: { ...r.fields } }));
  const ledger = freshLedger();
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': route.request().headers()['origin'] || '*' }, body: JSON.stringify(body) });
  await page.route(`**/${BACKEND}/**`, async route => {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname;
    const f = u.searchParams.get('filterByFormula') || '';
    const m = p.match(/^\/v0\/[^/]+\/([^/]+)$/);
    // One LOCAL MOVES record: the panel's PATCH and its read-back (atGetOne).
    const one = p.match(/^\/v0\/[^/]+\/local_moves\/(rec[A-Za-z0-9]+)$/);
    if (one) {
      const r = moves.find(x => x.id === one[1]);
      if (!r) return json(route, { error: { type: 'NOT_FOUND', message: 'Record not found' } }, 404);
      if (req.method() === 'GET') { cap.lmReads.push(one[1]); return json(route, strip(r)); }
      if (req.method() === 'PATCH') {
        const body = req.postDataJSON(); cap.lmPatches.push({ id: one[1], fields: body.fields });
        // A label the Worker map lacks is dropped with 200 OK (facade trap 1).
        for (const [k, v] of Object.entries(body.fields || {})) {
          if (cap.dropLabels.includes(k)) continue;
          if (v == null || (Array.isArray(v) && !v.length)) delete r.fields[k]; else r.fields[k] = v;
        }
        // 060's BEFORE trigger derives a relay's Status from its driver.
        r.fields.Status = r.fields.Driver ? 'Assigned' : 'Pending';
        return json(route, strip(r));
      }
    }
    const drvOne = p.match(/^\/v0\/[^/]+\/tbl7UGmYhc2Y82pPs\/(rec[A-Za-z0-9]+)$/);
    if (drvOne && req.method() === 'PATCH') {
      const body = req.postDataJSON(); cap.driverPatches.push({ id: drvOne[1], fields: body.fields });
      const r = REF.drivers.find(x => x.id === drvOne[1]);
      const out = Object.assign({}, r.fields, body.fields);
      Object.keys(out).forEach(k => { if (out[k] == null) delete out[k]; });
      // the pre-060 Worker has no «Pay Basis» label: dropped with 200 OK
      if (opts.dropPayBasis) delete out['Pay Basis'];
      return json(route, { id: r.id, createdTime: r.createdTime, fields: out });
    }
    if (m && req.method() === 'GET') {
      const t = m[1];
      if (t === 'tblEAPExIAjiA3asD') return json(route, { records: REF.trucks });
      if (t === 'tblDcrqRJXzPrtYLm') return json(route, { records: REF.trailers });
      if (t === 'tblxu8DRfTQOFRCzS') return json(route, { records: REF.locations });
      if (t === 'tblFWKAQVUzAM8mCE') return json(route, { records: REF.clients });
      if (t === 'tblLHl5m8bqONfhWv') return json(route, { records: REF.partners });
      if (t === 'tbl7UGmYhc2Y82pPs') {
        cap.drivers.push(u.search);
        const want = recordIds(f);
        const rows = want.length ? REF.drivers.filter(r => want.includes(r.id)) : REF.drivers;
        // plOnly (Worker 060): dispatcher/warehouse never receive «Pay Basis».
        const pl = ['owner', 'management', 'accountant'].includes(opts.role);
        return json(route, { records: rows.map(r => { const c = strip(r); if (!pl) { c.fields = Object.assign({}, c.fields); delete c.fields['Pay Basis']; } return c; }) });
      }
      if (t === 'tblaeY5QOHAS1gyE8') { const want = recordIds(f); return json(route, { records: STOPS.filter(s => want.includes(s.id)) }); }
      if (t === 'tblgHlNmLBH3JTdIM') {
        cap.orders.push(u.search);
        if (/IS_SAME\(\{Loading DateTime\}/.test(f)) return json(route, { records: ORDERS.map(strip) });
        if (/IS_BEFORE\(\{Delivery DateTime\}/.test(f)) return json(route, { records: OVERDUE.map(strip) });
        const want = recordIds(f);
        if (want.length) return json(route, { records: ALL_ORDERS.filter(o => want.includes(o.id)).map(strip) });
        return json(route, { records: [] });
      }
      if (t === 'local_moves') {
        cap.moves.push(u.search);
        if (opts.movesFail) return json(route, { error: 'Forbidden' }, 403);
        // The live (pre-060) Worker has no «Move Kind» label: an unknown label
        // in a FILTER is its one loud path — 422, «Unsupported query».
        if (opts.noKind && /\{Move Kind\}/.test(f)) return json(route, { error: 'Unsupported query for this table' }, 422);
        const byParent = idsIn(f, 'Parent Order'), byDriver = idsIn(f, 'Driver');
        let rows = byParent.length ? moves.filter(r => byParent.includes((r.fields['Parent Order'] || [])[0]))
          : byDriver.length ? moves.filter(r => byDriver.includes((r.fields.Driver || [])[0])) : [];
        if (byDriver.length) rows = rows.slice().sort((a, b) => String(b.fields.Date).localeCompare(String(a.fields.Date)));
        rows = rows.map(strip);
        return json(route, { records: rows });
      }
      return route.fallback();
    }
    if (p === '/costs/lookups') return json(route, LOOKUPS);
    if (p === '/costs/rt') return json(route, { records: [] });
    if (p === '/costs/ledger' && req.method() === 'GET') { cap.ledgerGets++; return json(route, { records: balances(), gap: 0, gapRts: [], month: monthBlock() }); }
    const lm2 = p.match(/^\/costs\/ledger\/(\d+)$/);
    if (lm2 && req.method() === 'GET') { cap.ledgerGets++; return json(route, { records: ledger[Number(lm2[1])] || [], rts: [] }); }
    if (lm2 && req.method() === 'PATCH') {
      const body = req.postDataJSON(); cap.patches.push({ id: Number(lm2[1]), body });
      for (const list of Object.values(ledger)) { const e = list.find(x => x.id === Number(lm2[1])); if (e) { Object.assign(e, body); if ('trip_value' in body) e.pending = body.trip_value == null; return json(route, { record: e }); } }
      return json(route, { error: 'Not found' }, 404);
    }
    return route.fallback();
  });
  return cap;
}

async function newPage(browser, role) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await preparePage(page, role);
  return { context, page, errors };
}
const txt = (page, sel) => page.locator(sel).first().innerText();

// ═════════════════════ Daily Ops ═════════════════════
async function dailyDispatcher(browser) {
  console.log('\n== Ημερήσιο · dispatcher ==');
  const { context, page, errors } = await newPage(browser, 'dispatcher');
  const cap = await installStubs(page, { role: 'dispatcher' });
  await gotoPage(page, 'daily_ops', BASE_URL);
  await page.waitForSelector(`#r_${ORD.I1}`, { timeout: 20000 });
  assert(await page.locator('.do-sec').count() === 4, 'Daily Ops keeps exactly FOUR sections');

  const i1 = await txt(page, `#r_${ORD.I1} td.do-asg`);
  assert(/ΤΟΠ\.\s*Τοπικός Π · 07:00/.test(i1), 'import with relay: «ΤΟΠ. Τοπικός Π · 07:00» leads the ΑΝΑΘΕΣΗ cell — ' + JSON.stringify(i1));
  assert(i1.includes('ίδιο ΚΒΧ1001 · ρυμ. Ρ-501 · διεθν. Διεθνής Α'), 'below, ONE line: «ίδιο ΚΒΧ1001 · ρυμ. Ρ-501 · διεθν. Διεθνής Α» (same tractor, the international stays) — ' + JSON.stringify(i1));
  const fit = await page.evaluate(id => { const td = document.querySelector('#r_' + id + ' td.do-asg'); const sub = td.querySelector('.do-rl-sub');
    return { subs: td.querySelectorAll('.do-sl').length, tip: sub && sub.getAttribute('title'), over: td.scrollHeight - td.clientHeight }; }, ORD.I1);
  assert(fit.subs === 1 && fit.tip === 'ίδιο ΚΒΧ1001 · ρυμ. Ρ-501 · διεθν. Διεθνής Α' && fit.over <= 1, 'the relay cell is two lines like its neighbours (nothing clipped into the next row); the whole line in the tooltip — ' + JSON.stringify(fit));
  const i2 = await txt(page, `#r_${ORD.I2} td.do-asg`);
  assert(i2.includes('ΤΟΠ. ΠΡΟΣ ΑΝΑΘΕΣΗ') && await page.locator(`#r_${ORD.I2} td.do-asg .do-tag.none`).count() === 1, 'relay without a local driver: red «ΤΟΠ. ΠΡΟΣ ΑΝΑΘΕΣΗ»');
  const i3 = await txt(page, `#r_${ORD.I3} td.do-asg`);
  assert(!i3.includes('ΤΟΠ.') && i3.includes('ΚΒΧ1001 / Ρ-501') && i3.includes('Διεθνής Α'), 'Cancelled relay covers nothing: the cell is the international assignment as before');
  const i4 = await txt(page, `#r_${ORD.I4} td.do-asg`);
  assert(i4.includes('άλλο ΚΒΧ2000 · ρυμ. Ρ-503'), 'drop-and-hook: «άλλο ΚΒΧ2000 · ρυμ. Ρ-503» (own tractor, the relay\'s own trailer)');
  const i4st = await txt(page, `#r_${ORD.I4} td.do-st`);
  assert(i4st.includes('Παραδόθηκε από τοπικό Τοπικός Π ✓'), 'delivered import: status reads «Παραδόθηκε από τοπικό Τοπικός Π ✓» — ' + JSON.stringify(i4st));
  const g = await txt(page, '#r_g\\:GGRP-77 td.do-asg');
  assert(/ΤΟΠ\.\s*2\/3 · Τοπικός Κ/.test(g), 'groupage of 3 with 2 relays: «ΤΟΠ. 2/3 · Τοπικός Κ» — ' + JSON.stringify(g));
  const e5 = await txt(page, `#r_${ORD.E5} td.do-asg`);
  assert(/ΤΟΠ\.\s*Τοπικός Κ · 06:00/.test(e5), 'export loading relay: «ΤΟΠ. Τοπικός Κ · 06:00»');
  assert(await page.locator(`#r_${ORD.E5} .do-btn[title="Φορτώθηκε από τοπικό Τοπικός Κ"]`).count() === 1, 'the ✓ button carries «Φορτώθηκε από τοπικό Τοπικός Κ» (one short word on the button)');
  await page.locator(`#r_${ORD.E5} .do-btn`).first().click();
  await page.waitForSelector('#_cfaOk', { timeout: 5000 });
  const ask = await page.locator('#modalOverlay').innerText();
  assert(ask.includes('Φορτώθηκε από τοπικό Τοπικός Κ;'), 'confirm asks «Φορτώθηκε από τοπικό Τοπικός Κ;» — the status write stays the order\'s own path');
  await page.locator('#_cfaCancel').click();
  const zone = await txt(page, `#r_${ORD.OV}`);
  assert(zone.includes('ΤΟΠ.') && zone.includes('Τοπικός Π'), 'overdue delivery zone names the local driver');

  // the relay read is its own request — core/relay.js's Relay.loadForOrders,
  // the ONE reader Weekly International uses too; the day request never asks
  // for relay labels
  assert(cap.moves.length === 1, 'one LOCAL MOVES request for the day (' + cap.moves.length + ')');
  const mq = decodeURIComponent(cap.moves[0]);
  assert(mq.includes('ARRAYJOIN({Parent Order},",")') && mq.includes(ORD.I1) && mq.includes(ORD.OV), 'it filters FIND on {Parent Order} for the day AND the overdue orders');
  assert(mq.includes('{Move Kind}!=BLANK()') && mq.includes('fields[]=Move Kind') && mq.includes('fields[]=Parent Order'), 'it is Relay.loadForOrders\' request: the «Move Kind» probe in the filter, explicit fields[]');
  assert(cap.orders.every(q => !decodeURIComponent(q).includes('Move Kind')), 'no ORDERS request carries a relay label (OPS_FIELDS untouched)');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(SHOT_DIR, 'local-relay-daily-dispatcher-1440.png'), fullPage: true });

  // END TO END (integration feat/local-relay-phi1): the click opens
  // core/relay.js's REAL panel in the app modal — no stub — prefilled from the
  // loaded relay; the save PATCHes LOCAL MOVES, reads the row back, closes and
  // re-reads the day.
  await page.locator(`#r_${ORD.I1} .do-rl[role=button]`).click();
  await page.waitForSelector('#rly_drv', { timeout: 5000 });
  const pv = await page.evaluate(() => ({ title: document.getElementById('modalTitle').textContent,
    drv: document.getElementById('rly_drv').value, trl: document.getElementById('rly_trl').value,
    time: document.getElementById('rly_time').value, pt: (document.getElementById('lv_rly_pt') || {}).value,
    tm: (document.querySelector('input[name="rly_tm"]:checked') || {}).value,
    ctx: (document.querySelector('#modalOverlay .do-sub') || {}).innerText }));
  assert(pv.title === 'Τοπική παράδοση — αλλαγή' && pv.drv === DRV.P && pv.trl === TRL.A && pv.time === '07:00' && pv.pt === VER && pv.tm === 'same',
    'click → the real Relay.openPanel in the app modal, prefilled from the loaded relay — ' + JSON.stringify(pv));
  assert(pv.ctx === 'Πελάτης A', 'its context line names the client (OPS_FIELDS reads no Reference) — ' + JSON.stringify(pv.ctx));
  await page.waitForTimeout(400);   // the overlay fades in (style.css overlay-fade)
  await page.screenshot({ path: path.join(SHOT_DIR, 'local-relay-daily-panel-1440.png'), fullPage: false });
  const reloads = cap.moves.length;
  await page.fill('#rly_time', '07:15');
  await page.click('#rly_submit');
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'), null, { timeout: 8000 });
  const p1 = cap.lmPatches[0] || {}, pf = p1.fields || {};
  assert(cap.lmPatches.length === 1 && p1.id === 'recLmv0000001' && pf['Time From'] === '07:15' && (pf.Driver || [])[0] === DRV.P
    && Array.isArray(pf.Truck) && pf.Truck.length === 0 && (pf.Trailer || [])[0] === TRL.A && (pf['From Location'] || [])[0] === VER
    && !('Date' in pf) && !('Status' in pf) && !('Move Kind' in pf) && !('Parent Order' in pf),
    'Αποθήκευση → ONE PATCH of LOCAL MOVES with the panel\'s labels; never Date/Status (060 derives them), never kind/parent on edit — ' + JSON.stringify(p1));
  assert(cap.lmReads.includes('recLmv0000001'), 'the row is READ BACK after the PATCH (principle 2)');
  await page.waitForTimeout(800);
  assert(cap.moves.length > reloads, 'after the save the day is re-read (relays fetched again)');
  await page.waitForSelector(`#r_${ORD.I1}`, { timeout: 20000 });
  const i1b = await txt(page, `#r_${ORD.I1} td.do-asg`);
  assert(/ΤΟΠ\.\s*Τοπικός Π · 07:15/.test(i1b), 'the cell shows the saved time «07:15» — ' + JSON.stringify(i1b));

  // a label the Worker drops (facade trap 1) → the read-back says so
  cap.dropLabels = ['Time From'];
  await page.locator(`#r_${ORD.I1} .do-rl[role=button]`).click();
  await page.waitForSelector('#rly_time', { timeout: 5000 });
  await page.fill('#rly_time', '07:45');
  await page.click('#rly_submit');
  await page.waitForTimeout(1000);
  assert((await page.evaluate(() => document.body.innerText)).includes('ΔΕΝ επιβεβαιώθηκαν: Ώρα'), 'a save whose read-back failed is said (warn toast), not hidden');
  cap.dropLabels = [];

  // keyboard: Enter on the focused red relay opens it too; Άκυρο writes nothing
  await page.waitForSelector(`#r_${ORD.I2} .do-rl[role=button]`, { timeout: 20000 });
  const nPatch = cap.lmPatches.length;
  await page.locator(`#r_${ORD.I2} .do-rl[role=button]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('#rly_drv', { timeout: 5000 });
  assert((await page.evaluate(() => document.getElementById('rly_drv').value)) === '', 'Enter on the focused «ΤΟΠ. ΠΡΟΣ ΑΝΑΘΕΣΗ» opens its panel, driver still empty (keyboard)');
  await page.locator('#modalOverlay button:has-text("Άκυρο")').click();
  await page.waitForTimeout(300);
  assert(!(await page.evaluate(() => document.getElementById('modalOverlay').classList.contains('open'))) && cap.lmPatches.length === nPatch, 'Άκυρο closes the panel without a write');

  // an older cached build without core/relay.js → said, never a dead click
  await page.evaluate(() => { delete window.Relay; });
  await page.locator(`#r_${ORD.I1} .do-rl[role=button]`).click();
  await page.waitForTimeout(300);
  const toastTxt = await page.evaluate(() => document.body.innerText);
  assert(toastTxt.includes('Το πάνελ τοπικού οδηγού δεν είναι διαθέσιμο εδώ'), 'without the panel the click says so (no dead click)');
  await context.close();
  return errors;
}

async function dailyWarehouse(browser) {
  console.log('\n== Ημερήσιο · warehouse ==');
  const { context, page, errors } = await newPage(browser, 'warehouse');
  await installStubs(page, { role: 'warehouse' });
  await gotoPage(page, 'daily_ops', BASE_URL);
  await page.waitForSelector(`#r_${ORD.I1}`, { timeout: 20000 });
  const i1 = await txt(page, `#r_${ORD.I1} td.do-asg`);
  assert(/ΤΟΠ\.\s*Τοπικός Π · 07:00/.test(i1), 'warehouse sees who comes: «ΤΟΠ. Τοπικός Π · 07:00»');
  assert(await page.locator('.do-rl[role=button]').count() === 0, 'warehouse: no relay is clickable (no role=button)');
  await page.locator(`#r_${ORD.I2} .do-rl`).click();
  await page.waitForTimeout(300);
  assert(await page.locator('#rly_drv').count() === 0, 'warehouse: clicking the red «ΤΟΠ. ΠΡΟΣ ΑΝΑΘΕΣΗ» opens nothing');
  const cells = await page.locator('td.do-asg').allInnerTexts();
  assert(cells.every(c => !/€|\d+,\d\d/.test(c)), 'warehouse: no amount in any ΑΝΑΘΕΣΗ cell');
  await page.screenshot({ path: path.join(SHOT_DIR, 'local-relay-daily-warehouse-1440.png'), fullPage: true });
  // The Worker gives warehouse NO DRIVERS read (PERMISSIONS: no drivers row,
  // no wildcard), so in production no name resolves. The stub above is more
  // generous; simulate the unresolved name and repaint: an ASSIGNED relay
  // must still read assigned («ΤΟΠ. —»), never «ΠΡΟΣ ΑΝΑΘΕΣΗ».
  await page.evaluate(() => { window.getDriverName = () => ''; _opsSetFilter('q', (OPS.filters && OPS.filters.q) || ''); });
  const i1n = await txt(page, `#r_${ORD.I1} td.do-asg`);
  assert(/ΤΟΠ\.\s*— · 07:00/.test(i1n) && !i1n.includes('ΠΡΟΣ ΑΝΑΘΕΣΗ'), 'warehouse without a readable name: «ΤΟΠ. — · 07:00», never «ΠΡΟΣ ΑΝΑΘΕΣΗ» — ' + JSON.stringify(i1n));
  assert((await txt(page, `#r_${ORD.I2} td.do-asg`)).includes('ΤΟΠ. ΠΡΟΣ ΑΝΑΘΕΣΗ'), 'warehouse: the relay with no driver still reads red «ΤΟΠ. ΠΡΟΣ ΑΝΑΘΕΣΗ»');
  await context.close();
  return errors;
}

async function dailyFailure(browser, mode) {
  console.log('\n== Ημερήσιο · ' + mode + ' ==');
  const { context, page, errors } = await newPage(browser, 'dispatcher');
  await installStubs(page, mode === 'fail' ? { role: 'dispatcher', movesFail: true } : { role: 'dispatcher', noKind: true });
  await gotoPage(page, 'daily_ops', BASE_URL);
  await page.waitForSelector(`#r_${ORD.I1}`, { timeout: 20000 });
  const err = await page.locator('.do-err').allInnerTexts();
  assert(err.some(t => t.includes('Οι τοπικές παραδόσεις/φορτώσεις δεν φορτώθηκαν — δεν σημαίνει ότι δεν υπάρχουν')), mode + ': the zone says the relays did not load');
  assert(await page.locator('.do-sec').count() === 4, mode + ': the day still renders its four sections');
  const i1 = await txt(page, `#r_${ORD.I1} td.do-asg`);
  assert(!i1.includes('ΤΟΠ.') && i1.includes('Διεθνής Α'), mode + ': ΑΝΑΘΕΣΗ falls back to the international driver, never a guessed relay');
  if (mode === 'fail') await page.screenshot({ path: path.join(SHOT_DIR, 'local-relay-daily-not-loaded-1440.png'), fullPage: false });
  await context.close();
  return errors;
}

// ═════════════════════ Payroll ═════════════════════
async function openCard(page, driverId) {
  await page.evaluate(id => renderPayrollDriver(id), driverId);
  await page.waitForSelector('.dl-ledger', { timeout: 15000 });
  await page.locator('button:has-text("Όλο το έτος")').click();
  await page.waitForTimeout(300);
}
async function payrollAccountant(browser) {
  console.log('\n== Μισθοδοσία · accountant ==');
  const { context, page, errors } = await newPage(browser, 'accountant');
  const cap = await installStubs(page, { role: 'accountant' });
  await gotoPage(page, 'payroll', BASE_URL);
  await page.waitForSelector(`.dl-card[data-driver="${PG.P}"]`, { timeout: 20000 });
  const card = await txt(page, `.dl-card[data-driver="${PG.P}"] .dl-ms`);
  assert(/0\s*· τοπ\. 2/.test(card), 'month card: «Δρομ. μήνα 0 · τοπ. 2» (local days counted apart) — ' + JSON.stringify(card));
  const kpi = await txt(page, '.dl-kpi-tile[data-kpi="trips"]');
  assert(/2\s*· τοπικά 2/.test(kpi), 'KPI «Δρομολόγια μήνα 2 · τοπικά 2» — ' + JSON.stringify(kpi));
  await page.screenshot({ path: path.join(SHOT_DIR, 'local-relay-payroll-home-1440.png'), fullPage: false });

  await openCard(page, PG.P);
  await page.waitForSelector('#dlLocalMoves .lh-t', { timeout: 10000 });
  const row = page.locator('.dl-row[data-entry="9001"]');
  const rowTxt = await row.innerText();
  assert(rowTxt.includes('ΤΟΠΙΚΟ · παράδοση 415 · παράδοση 418'), 'local line label «ΤΟΠΙΚΟ · παράδοση 415 · παράδοση 418» (one line for the day, the trigger\'s route text)');
  assert(await row.locator('.dl-rt').count() === 0, 'local line: no ↗ (no RT link)');
  assert(rowTxt.includes('χωρίς αξία'), 'local line without amount reads «χωρίς αξία» (accounting enters it, never automatic)');
  assert((await txt(page, '#dlPayBasis')).includes('τύπος αμοιβής άγνωστος'), 'hero: «τύπος αμοιβής άγνωστος» with a link to the driver form (said once, on the hero)');
  assert(await page.locator('.dl-pb-note').count() === 0, 'the unknown pay basis is not repeated on every local line');
  const t9001 = await row.locator('.m').first().getAttribute('title');
  assert(/Αξία 0 = δεν πληρώνεται χωριστά/.test(t9001) && /RT-9415, RT-9418/.test(t9001), 'tooltip: system-held day/route, «Αξία 0», and the RTs served — codes only in the tooltip');
  assert((await page.locator('.dl-row[data-entry="9003"]').innerText()).includes('ΤΟΠΙΚΟ · παράδοση 409'), 'a «Αξία 0» day shows as a real value, not pending');
  assert(/Σημείωση: πληρώθηκε μέσα στο δρομολόγιο/.test(await page.locator('.dl-row[data-entry="9003"] .m').first().getAttribute('title')), 'a «Αξία 0» day carries its reason (note) in the tooltip');
  assert(await page.locator('.dl-row.canc[data-entry="9002"] .dl-more').count() === 0, 'cancelled local line: no «···» (no Επαναφορά)');
  assert((await page.locator('.dl-row.canc[data-entry="9002"]').innerText()).includes('ΤΟΠΙΚΟ · παράδοση 417'), 'cancelled local line (view relay_info NULL): the trigger\'s route label still names it');
  await row.locator('.dl-more').click();
  await page.waitForSelector('.dl-menu', { timeout: 5000 });
  assert(await page.locator('.dl-menu .dl-menu-edit').count() === 1 && await page.locator('.dl-menu .dl-menu-cancel').count() === 0, 'local line with a live relay: Διόρθωση only — no Ακύρωση (the trigger holds it)');
  assert((await txt(page, '.dl-menu .dl-menu-edit')).includes('0 = δεν πληρώνεται χωριστά'), 'Διόρθωση says «0 = δεν πληρώνεται χωριστά»');
  await page.locator('.dl-menu .dl-menu-edit').click();
  await page.waitForSelector('#dlEiValue', { timeout: 5000 });
  assert(await page.locator('.dl-local-hint').isVisible(), 'edit row shows «Αξία 0 = δεν πληρώνεται χωριστά»');
  await page.fill('#dlEiValue', '0');
  await page.press('#dlEiValue', 'Enter');
  await page.waitForSelector('#dlReason', { timeout: 5000 });
  assert((await txt(page, '#dlReasonTitle')) === 'Αξία 0 — γιατί;' && cap.patches.length === 0, '«Αξία 0» on a local day asks why before anything is sent');
  await page.fill('#dlReason', 'μισθωτός');
  await Promise.all([page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/costs/ledger/9001')), page.press('#dlReason', 'Enter')]);
  const pt = cap.patches.find(x => x.id === 9001);
  assert(pt && pt.body.trip_value === 0 && pt.body.note === 'μισθωτός' && Object.keys(pt.body).length === 2, '«Αξία 0» → PATCH /costs/ledger/9001 {trip_value:0, note} — amount and its reason: ' + JSON.stringify(pt && pt.body));
  await page.waitForTimeout(400);
  await page.waitForSelector('#dlLocalMoves .lh-t', { timeout: 10000 });

  const lh = await page.locator('#dlLocalMoves .lh-t tbody tr').allInnerTexts();
  assert(lh.length === 4, 'track record: 4 moves of the period (the Cancelled one is not something he did) — ' + lh.length);
  const all = lh.join('\n');
  assert(all.includes('Παράδοση 415') && all.includes('ίδιο ΚΒΧ1001') && all.includes('ρυμ. Ρ-501') && all.includes('από VEROIA CROSS-DOCK') && all.includes('07:00'),
    'track record row: «Παράδοση 415 · ίδιο ΚΒΧ1001 · ρυμ. Ρ-501 · από VEROIA CROSS-DOCK · 07:00»');
  assert(all.includes('άλλο ΚΒΧ2000') && all.includes('Τοπική κίνηση · Μεταφορά παλετών'), 'track record: other tractor, and the plain errand from Weekly National');
  assert(!/€|\d+,\d\d/.test(all), 'track record: no amounts');
  const dq = cap.moves.map(decodeURIComponent).find(q => q.includes('{Driver}'));
  assert(dq && dq.includes(`FIND("${DRV.P}",ARRAYJOIN({Driver},","))>0`) && dq.includes('{Move Kind}!=BLANK()') && dq.includes('sort[0][field]=Date') && dq.includes('sort[0][direction]=desc'),
    'track record read: FIND("<driver rec>",ARRAYJOIN({Driver},","))>0 + the «Move Kind» probe, Date desc (Worker 060 contract)');
  // a local line whose day has no live relay left (flagged, money written):
  // accounting may cancel it — with a reason — and the PATCH says cancel
  await page.locator('.dl-row[data-entry="9005"] .dl-more').click();
  await page.waitForSelector('.dl-menu', { timeout: 5000 });
  assert(await page.locator('.dl-menu .dl-menu-cancel').count() === 1 && (await txt(page, '.dl-menu .dl-menu-cancel')).includes('Καμία ζωντανή τοπική κίνηση'), 'local line with NO live relay that day: Ακύρωση offered, saying why');
  await page.locator('.dl-menu .dl-menu-cancel').click();
  await page.waitForSelector('#dlReason', { timeout: 5000 });
  await page.fill('#dlReason', 'η κίνηση δεν έγινε');
  await Promise.all([page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/costs/ledger/9005')), page.press('#dlReason', 'Enter')]);
  const pc = cap.patches.find(x => x.id === 9005);
  assert(pc && pc.body.cancel === true && pc.body.reason === 'η κίνηση δεν έγινε' && Object.keys(pc.body).length === 2, 'Ακύρωση → PATCH {cancel:true, reason} — ' + JSON.stringify(pc && pc.body));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOT_DIR, 'local-relay-payroll-local-card-1440.png'), fullPage: true });

  await openCard(page, PG.IA);
  const rt = page.locator('.dl-row[data-entry="9101"]');
  const badge = await rt.locator('.dl-relay').innerText().catch(() => '');
  assert(await rt.locator('.dl-relay').count() === 1 && badge.includes('⇄ τοπ. Τοπικός · ' + TODAY.slice(8, 10) + '/' + TODAY.slice(5, 7)), 'international RT line: «⇄ τοπ. <who> · <day>» on the line itself — ' + JSON.stringify(badge));
  assert((await rt.locator('.dl-relay').getAttribute('title')).includes('τοπ. παράδοση 415 · Τοπικός Π'), '«⇄ τοπ.» tooltip: who did it and which day — no amount (OWNER-Q4 answered 4/10: never auto-reduced)');
  assert(await rt.locator('.dl-rt').count() === 1, 'the RT line keeps its ↗');
  assert(await page.locator('.dl-row[data-entry="9102"] .dl-relay').count() === 0, 'an RT without a relay has no badge');
  await page.waitForTimeout(400);
  assert(!(await txt(page, '#dlPayBasis')).includes('άγνωστος'), 'an international driver without relay work is not nagged about his pay basis');
  await page.screenshot({ path: path.join(SHOT_DIR, 'local-relay-payroll-rt-badge-1440.png'), fullPage: false });

  await openCard(page, PG.K);
  await page.waitForSelector('#dlLocalMoves .lh-t', { timeout: 10000 });
  assert((await txt(page, '#dlPayBasis')).includes('Μισθωτός'), 'salaried driver: hero says «Μισθωτός»');
  assert((await txt(page, '#dlLocalMoves')).includes('μισθωτός: καταγραφή, χωρίς γραμμή πληρωμής'), 'salaried driver: track record only — «καταγραφή, χωρίς γραμμή πληρωμής»');
  assert(await page.locator('#dlLocalMoves .lh-t tbody tr').count() === 3, 'salaried driver: his 3 loadings are listed');
  assert((await page.locator('.dl-ledger').innerText()).split('ΤΟΠΙΚΟ').length === 2 && await page.locator('.dl-row.review[data-entry="9202"]').count() === 1,
    'salaried driver: the only ΤΟΠΙΚΟ line is the flagged one paid before he became salaried');
  await page.waitForTimeout(300);
  await page.locator('.dl-row[data-entry="9202"] .dl-more').click();
  await page.waitForSelector('.dl-menu', { timeout: 5000 });
  assert(await page.locator('.dl-menu .dl-menu-cancel').count() === 1 && (await txt(page, '.dl-menu .dl-menu-cancel')).includes('Ο οδηγός είναι μισθωτός'), 'salaried driver\'s flagged local line (relays still live): Ακύρωση offered, saying why');
  await page.keyboard.press('Escape');

  const csv = await page.evaluate(e => dlCsvKinisi(e), freshLedger()[PG.P][0]);
  assert(csv === 'ΤΟΠΙΚΟ · παράδοση 415 · παράδοση 418 (χωρίς καταχωρισμένη αξία)', 'CSV uses the same label: ' + JSON.stringify(csv));
  await context.close();
  return errors;
}

async function payrollOwnerCancelled(browser) {
  console.log('\n== Μισθοδοσία · owner (Επαναφορά) ==');
  const { context, page, errors } = await newPage(browser, 'owner');
  await installStubs(page, { role: 'owner' });
  await gotoPage(page, 'payroll', BASE_URL);
  await page.waitForSelector('.dl-card', { timeout: 20000 });
  await openCard(page, PG.P);
  assert(await page.locator('.dl-row.canc[data-entry="9004"] .dl-more').count() === 1, 'owner: an ordinary cancelled line still offers «···» (Επαναφορά)');
  assert(await page.locator('.dl-row.canc[data-entry="9002"] .dl-more').count() === 0, 'owner: a cancelled LOCAL line offers nothing — the trigger owns it');
  await context.close();
  return errors;
}

async function payrollDispatcher(browser) {
  console.log('\n== Μισθοδοσία · dispatcher ==');
  const { context, page, errors } = await newPage(browser, 'dispatcher');
  const cap = await installStubs(page, { role: 'dispatcher' });
  await gotoPage(page, 'payroll', BASE_URL);
  await page.waitForTimeout(1500);
  assert(await page.locator('.dl-page').count() === 0, 'dispatcher: payroll does not render');
  assert(cap.ledgerGets === 0, 'dispatcher: no /costs/ledger request at all');
  await context.close();
  return errors;
}

// ═════════════════════ Drivers card ═════════════════════
async function driversCard(browser) {
  console.log('\n== Οδηγοί · dispatcher (καρτέλα) ==');
  const { context, page, errors } = await newPage(browser, 'dispatcher');
  await installStubs(page, { role: 'dispatcher' });
  await gotoPage(page, 'drivers', BASE_URL);
  await page.waitForFunction(() => typeof _entityState !== 'undefined' && _entityState.drivers && (_entityState.drivers.records || []).length > 0, null, { timeout: 20000 });
  await page.evaluate(id => selectEntity('drivers', id), DRV.P);
  await page.waitForSelector(`#ec_${DRV.P}_lm .lh-l`, { timeout: 15000 });
  const rows = await page.locator(`#ec_${DRV.P}_lm .lh-i`).allInnerTexts();
  assert(rows.length === 4 && rows.join('\n').includes('Παράδοση 415'), 'Drivers card: «Τοπικές κινήσεις» lists his 4 moves (dispatcher sees the track record)');
  assert(rows[0].includes('ίδιο ΚΒΧ1001 · ρυμ. Ρ-501 · από VEROIA CROSS-DOCK') && rows[0].includes('07:00'),
    'Drivers card row: plates and the hand-over point resolve (reference data awaited) — ' + JSON.stringify(rows[0]));
  assert(!/€|\d+,\d\d/.test(rows.join('\n')), 'Drivers card: no amounts');
  await page.waitForTimeout(900);   // the card panel slides in
  await page.locator(`#ec_${DRV.P}_lm`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOT_DIR, 'local-relay-drivers-card-1440.png'), fullPage: false });
  // The row ✎ lets a dispatcher open the Drivers form (pre-existing): payroll
  // information is not drawn there (coordinator 4/10).
  await page.evaluate(id => openEntityEdit('drivers', id), DRV.P);
  await page.waitForSelector('#ef_Full_Name', { timeout: 10000 });
  assert(await page.locator('#ef_Pay_Basis').count() === 0 && !(await page.locator('#modalOverlay').innerText()).includes('Τύπος αμοιβής'), 'dispatcher: the Drivers form has no «Τύπος αμοιβής» (payroll information)');
  await context.close();

  console.log('\n== Οδηγοί · owner (φόρμα) ==');
  const o = await newPage(browser, 'owner');
  await installStubs(o.page, { role: 'owner' });
  await gotoPage(o.page, 'drivers', BASE_URL);
  await o.page.waitForFunction(() => typeof _entityState !== 'undefined' && _entityState.drivers && (_entityState.drivers.records || []).length > 0, null, { timeout: 20000 });
  await o.page.evaluate(id => openEntityEdit('drivers', id), DRV.K);
  await o.page.waitForSelector('#ef_Pay_Basis', { timeout: 10000 });
  const opts = await o.page.locator('#ef_Pay_Basis option').allInnerTexts();
  assert(JSON.stringify(opts.slice(1)) === JSON.stringify(['Μισθωτός', 'Ανά δρομολόγιο']), 'form «Τύπος αμοιβής»: Μισθωτός / Ανά δρομολόγιο (+ empty = unknown)');
  assert(await o.page.locator('#ef_Pay_Basis').inputValue() === 'salary', 'form prefills the salaried driver as «Μισθωτός»');
  assert((await o.page.locator('#modalOverlay').innerText()).includes('Κενό = άγνωστο'), 'form hint says «Κενό = άγνωστο»');
  await o.context.close();

  // A Worker that drops «Pay Basis» (pre-060 map) answers 200 — the returned
  // row lacks it, and the save says so instead of «ενημερώθηκε».
  console.log('\n== Οδηγοί · owner (φόρμα, Worker χωρίς «Pay Basis») ==');
  const d = await newPage(browser, 'owner');
  const dcap = await installStubs(d.page, { role: 'owner', dropPayBasis: true });
  await gotoPage(d.page, 'drivers', BASE_URL);
  await d.page.waitForFunction(() => typeof _entityState !== 'undefined' && _entityState.drivers && (_entityState.drivers.records || []).length > 0, null, { timeout: 20000 });
  await d.page.evaluate(id => openEntityEdit('drivers', id), DRV.P);
  await d.page.waitForSelector('#ef_Pay_Basis', { timeout: 10000 });
  await d.page.selectOption('#ef_Pay_Basis', 'per_trip');
  // The real button: saveEntityRecord labels document.activeElement «Αποθήκευση…»
  // (pre-existing), so a call without the click could relabel whatever has focus.
  await d.page.click('#ef_save_drivers');
  // the toast is read where the user reads it — on the page
  const said = await d.page.waitForFunction(() => /ΔΕΝ γράφτηκε: Τύπος αμοιβής/.test(document.body.innerText), null, { timeout: 8000 }).then(() => true, () => false);
  const body = await d.page.evaluate(() => document.body.innerText);
  const dp = dcap.driverPatches[0] || {};
  assert(dp.fields && dp.fields['Pay Basis'] === 'per_trip', 'owner: the PATCH carries «Pay Basis» = per_trip');
  assert(said && !/Η εγγραφή ενημερώθηκε/.test(body), 'a dropped «Pay Basis» is said after the save («…ΔΕΝ γράφτηκε: Τύπος αμοιβής…»), never «ενημερώθηκε»' + (said ? '' : ' — errors: ' + JSON.stringify(d.errors.slice(-5))));
  await d.context.close();
  return [...errors, ...o.errors, ...d.errors];
}

(async () => {
  const browser = await chromium.launch();
  const errs = {};
  try {
    errs.dailyDispatcher = await dailyDispatcher(browser);
    errs.dailyWarehouse = await dailyWarehouse(browser);
    errs.dailyFail = await dailyFailure(browser, 'fail');
    errs.dailyNoKind = await dailyFailure(browser, 'noKind');
    errs.payrollAccountant = await payrollAccountant(browser);
    errs.payrollOwner = await payrollOwnerCancelled(browser);
    errs.payrollDispatcher = await payrollDispatcher(browser);
    errs.drivers = await driversCard(browser);
    console.log('\n== console errors (HAR-replay noise is expected: aborted unknown requests) ==');
    for (const [k, v] of Object.entries(errs)) {
      const real = v.filter(e => !/Failed to load resource|net::ERR_FAILED/.test(e));
      console.log(k + ': ' + v.length + ' (' + real.length + ' not network)');
      real.forEach(e => console.log('  ! ' + e.slice(0, 220)));
    }
    const pageErrors = Object.values(errs).flat().filter(e => e.startsWith('pageerror'));
    assert(pageErrors.length === 0, 'no uncaught page error in any scenario');
    console.log(`\nΟΛΟΙ ΟΙ ΕΛΕΓΧΟΙ ΠΕΡΑΣΑΝ: ${passed}/${passed}`);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('\n' + (e && e.stack || e)); console.error(`(${passed} passed before the failure)`); process.exit(1); });
