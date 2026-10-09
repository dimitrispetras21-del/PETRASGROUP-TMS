// node --test tests/daily-ops-delay.test.js   (TZ=Europe/Athens)
// «Καθυστέρηση» with a reason on the Ημερήσιο (dispatcher Pantelis / owner 9/10/2026, migration 067).
// The REAL modules/daily_ops.js runs in a vm (the whole IIFE, as the browser loads it) with the REAL
// OrdersStock and getLinkedId; the facade (atGetAll/atSafePatch) and the page helpers are in-memory
// stubs. Nothing is sent anywhere.
//   DRIFT  the front constant OPS_DELAY = 067's CASE (every code, its responsibility) — read from
//          worker/migrations/drafts/067_stop_delay_reason.sql (on main once 067's branch is merged), or
//          from STOP_DELAY_SQL=<path> while the branches are apart. Missing = a FAILED test, never a skip.
//   the button is «Καθυστέρηση» on loadings AND deliveries and in the overdue zone; a lot keeps its words
//   one PATCH on the stop: Performance 'Delayed' + Delay Reason + Delay Note, then the order as before
//   the Worker that drops the label: red, logged, the click not lost, the screen claims nothing
//   a refused order write puts reason and note back with the stamp; escaping of the note
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'core', 'data-helpers.js'), 'utf8'));
global.TmsWeek = require('../core/tms-week.js');
const { OrdersStock } = require('../core/orders-common.js');
const SRC = fs.readFileSync(path.join(ROOT, 'modules', 'daily_ops.js'), 'utf8');

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOff = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = dayOff(0);

// ── the SQL the base runs: 067's generated CASE is THE list ─────────────────────────────────────
const SQL_PATH = process.env.STOP_DELAY_SQL || path.join(ROOT, 'worker', 'migrations', 'drafts', '067_stop_delay_reason.sql');
function caseOf067() {
  assert.ok(fs.existsSync(SQL_PATH), `067 not found at ${SQL_PATH} — merge branch feat/067-stop-delay first (release order 067 → Worker → front), or run with STOP_DELAY_SQL=<path to 067_stop_delay_reason.sql>`);
  const src = fs.readFileSync(SQL_PATH, 'utf8');
  const a = src.indexOf('GENERATED ALWAYS AS (CASE delay_reason'), b = src.indexOf('END) STORED', a);
  assert.ok(a > 0 && b > a, 'the generated CASE of 067 not found');
  const out = {};
  for (const m of src.slice(a, b).matchAll(/WHEN '([a-z_]+)' THEN '([a-z]+)'/g)) out[m[1]] = m[2];
  return out;
}

function fixtures() {
  const o = (id, f) => ({ id, fields: Object.assign({ Client: ['recCLIA'], 'Total Pallets': 10 }, f) });
  return {
    day: [
      o('recEXL0000000001', { Direction: 'Export', 'Loading DateTime': TODAY, 'Delivery DateTime': dayOff(2), Status: 'Assigned', Truck: ['recTRK1'], 'ORDER STOPS': ['recSTEXL1', 'recSTEXU1'] }),
      o('recIMD0000000001', { Direction: 'Import', 'Loading DateTime': dayOff(-2), 'Delivery DateTime': TODAY, Status: 'In Transit', Truck: ['recTRK1'], 'ORDER STOPS': ['recSTIDL1', 'recSTIDU1'] }),
      o('recIMM0000000001', { Direction: 'Import', 'Loading DateTime': dayOff(-2), 'Delivery DateTime': TODAY, Status: 'In Transit', Truck: ['recTRK1'], 'ORDER STOPS': ['recSTIML1', 'recSTIMU1', 'recSTIMU2'] }),
      o('recNOS0000000001', { Direction: 'Import', 'Loading DateTime': dayOff(-2), 'Delivery DateTime': TODAY, Status: 'In Transit', Truck: ['recTRK1'] }),
      o('recLOT0000000001', { Direction: 'Import', 'Loading DateTime': dayOff(-1), 'Delivery DateTime': TODAY, Status: 'In Transit', Partner: ['recPRT1'], 'Is Partner Trip': true, 'Own Stock Lot': 'recSTOCKLOT1', 'ORDER STOPS': ['recSTLTL1', 'recSTLTU1'] }),
    ],
    ov: [o('recOVD0000000001', { Direction: 'Import', 'Loading DateTime': dayOff(-4), 'Delivery DateTime': dayOff(-1), Status: 'In Transit', Truck: ['recTRK1'], 'ORDER STOPS': ['recSTOVL1', 'recSTOVU1'] })],
    ovL: [],
    stops: [
      ['recSTEXL1', 'recEXL0000000001', 'Loading', 1], ['recSTEXU1', 'recEXL0000000001', 'Unloading', 1],
      ['recSTIDL1', 'recIMD0000000001', 'Loading', 1], ['recSTIDU1', 'recIMD0000000001', 'Unloading', 1],
      ['recSTIML1', 'recIMM0000000001', 'Loading', 1], ['recSTIMU1', 'recIMM0000000001', 'Unloading', 1], ['recSTIMU2', 'recIMM0000000001', 'Unloading', 2],
      ['recSTLTL1', 'recLOT0000000001', 'Loading', 1], ['recSTLTU1', 'recLOT0000000001', 'Unloading', 1],
      ['recSTOVL1', 'recOVD0000000001', 'Loading', 1], ['recSTOVU1', 'recOVD0000000001', 'Unloading', 1],
    ].map(([id, ord, type, n]) => ({ id, fields: { 'Parent Order': [ord], 'Stop Type': type, 'Stop Number': n, Location: ['recLOC' + n], Pallets: 10 } })),
  };
}

// 067's CHECKs on a stop row as the base holds it after a write (the rig holds the same copy; the
// known-code CHECK is the DRIFT test's): a write that would leave the row breaking one is answered 500 and
// recorded in S.violations, as Postgres + the Worker do (23514 → 500) — so a test sees what the base refuses.
function baseRefuses(row) {
  const r = row['Delay Reason'], n = row['Delay Note'];
  if (r === 'other' && !/\S/.test(n || '')) return 'order_stops_delay_other_note_check';
  if ((r != null && row.Performance !== 'Delayed') || (n != null && r == null)) return 'order_stops_delay_only_delayed_check';
  return null;
}

// S.drop: the Worker does not map the delay labels yet (drops them, 200). S.refuse(t, id, f): an Error to throw.
// S.base: each stop row as the base holds it after the writes (merged), checked by baseRefuses.
function load() {
  const fx = fixtures();
  const S = { patches: [], toasts: [], errToasts: [], logged: [], content: { innerHTML: '' }, refuse: null, drop: false, base: {}, violations: [] };
  const clone = a => a.map(r => ({ id: r.id, fields: JSON.parse(JSON.stringify(r.fields)) }));
  const names = { recCLIA: 'Πελάτης Α', recTRK1: 'ΑΒΓ-1234', recPRT1: 'Συνεργάτης Α' };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    OrdersStock, getLinkedId, escapeHtml: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    TABLES: { ORDERS: 'tblO', ORDER_STOPS: 'tblS' }, F: { STOP_PARENT_ORDER: 'Parent Order', STOP_TYPE: 'Stop Type', STOP_NUMBER: 'Stop Number', STOP_LOCATION: 'Location' },
    FEATURES: {}, localToday: () => TODAY, localTomorrow: () => dayOff(1),
    toLocalDate: raw => { if (!raw) return ''; const d = new Date(String(raw).length === 10 ? raw + 'T12:00:00' : raw); return isNaN(d) ? '' : ymd(d); },
    showLoading: () => '', preloadReferenceData: async () => {}, getRefTrucks: () => [], getRefDrivers: () => [], getRefLocations: () => [], getRefClients: () => [], getRefTrailers: () => [],
    getLocationName: id => (id ? 'Τοποθεσία ' + id : ''), getClientName: id => names[id] || '', getTruckPlate: id => names[id] || '', getDriverName: () => '', getPartnerName: id => names[id] || '',
    isPreorder: () => false, preorderCounterHtml: () => '', preorderChipHtml: () => '', preorderCountryText: () => '', preorderLevel: () => '',
    can: () => 'full', confirmAction: async () => true, fmtDate: d => d,
    toast: (m, t) => S.toasts.push((t || 'success') + ': ' + m),
    showErrorToast: (m, t) => S.errToasts.push(m),
    logError: (e, where) => S.logged.push(where + ' | ' + e.message),
    atSafePatch: async (t, id, f) => {
      S.patches.push({ t, id, f: JSON.parse(JSON.stringify(f)) });
      const e = S.refuse && S.refuse(t, id, f); if (e) throw e;
      const back = { ...f };
      if (t === 'tblS' && S.drop) { delete back['Delay Reason']; delete back['Delay Note']; }
      if (t === 'tblS') {
        const next = Object.assign({}, S.base[id], back), bad = baseRefuses(next);
        if (bad) { S.violations.push({ id, bad, f: JSON.parse(JSON.stringify(f)) }); throw new Error('500 Failed to update record'); }
        S.base[id] = next;
        // The base echoes the generated responsibility column (067) — inside the
        // tblS block, or the «responsibility is never sent» assertion below is vacuous.
        if (f['Delay Reason']) back['Delay Responsibility'] = ({ loading_wait: 'client', unloading_wait: 'consignee', traffic: 'external', other: 'other', customs: 'borders' })[f['Delay Reason']];
      }
      for (const k of Object.keys(back)) if (back[k] == null) delete back[k];   // trap 2: NULL is absent
      return { id, fields: back };
    },
    paSyncStatus: async () => null,
    atGetAll: async (table, opts) => {
      const fm = (opts && opts.filterByFormula) || '';
      if (table === 'tblS') return clone(fx.stops.filter(s => fm.includes(`"${s.id}"`)));
      if (table !== 'tblO') return [];
      if (fm.startsWith('OR(IS_SAME(')) return clone(fx.day);
      if (fm.startsWith('AND(IS_BEFORE({Delivery DateTime}')) return clone(fx.ov);
      if (fm.startsWith('AND(IS_BEFORE({Loading DateTime}')) return clone(fx.ovL);
      return [];
    },
    document: { getElementById: id => (id === 'content' ? S.content : null), querySelectorAll: () => [], querySelector: () => null, removeEventListener() {}, addEventListener() {} },
  };
  ctx.window = ctx;
  vm.runInNewContext(SRC, ctx);
  return { ctx, S };
}
const rowOf = (html, id) => { const m = html.match(new RegExp(`<tr id="r_${id}"[\\s\\S]*?</tr>`)); return m ? m[0] : ''; };
const zrowOf = (html, id) => { const m = html.match(new RegExp(`<div class="do-zrow[^"]*" id="r_${id}"[\\s\\S]*?</div>`)); return m ? m[0] : ''; };
const stopPatch = S => S.patches.filter(p => p.t === 'tblS');
const orderPatch = S => S.patches.filter(p => p.t === 'tblO');

// ── 1. the list ─────────────────────────────────────────────────────────────────────────────────
test('DRIFT: OPS_DELAY codes and responsibilities = 067\'s CASE (the base derives whose a delay was)', () => {
  const { ctx } = load();
  const front = Object.fromEntries(ctx.OPS_DELAY.reasons.map(r => [r.code, r.resp]));
  assert.deepStrictEqual(front, caseOf067());
  assert.strictEqual(ctx.OPS_DELAY.reasons.length, 17);
  assert.strictEqual(new Set(ctx.OPS_DELAY.reasons.map(r => r.code)).size, 17, 'codes unique');
  assert.deepStrictEqual(Array.from(ctx.OPS_DELAY.resp, r => r.code), ['us', 'client', 'consignee', 'borders', 'external', 'other']);
  for (const g of ctx.OPS_DELAY.resp) assert.ok(ctx.OPS_DELAY.reasons.some(r => r.resp === g.code), g.code + ' has reasons');
});

test('the words the owner approved (9/10): reasons and responsibilities', () => {
  const { ctx } = load();
  assert.deepStrictEqual(Object.fromEntries(ctx.OPS_DELAY.reasons.map(r => [r.code, r.label])), {
    vehicle_breakdown: 'Βλάβη οχήματος', driver_hours: 'Οδηγός / ώρες οδήγησης', planning_error: 'Λάθος προγραμματισμού', previous_stop: 'Αργήσαμε σε προηγούμενη στάση',
    cargo_not_ready: 'Το φορτίο δεν ήταν έτοιμο', loading_wait: 'Αναμονή στη φόρτωση', order_change: 'Αλλαγή εντολής', missing_docs: 'Λείπουν έγγραφα',
    unloading_wait: 'Αναμονή στην εκφόρτωση', closed_refused: 'Κλειστά / δεν παρέλαβε', border_queue: 'Ουρά ή έλεγχος στα σύνορα', customs: 'Τελωνείο',
    traffic: 'Κίνηση / ατύχημα', weather: 'Καιρός', ferry_train: 'Φέρι / τρένο', strike_roads: 'Απεργία / κλειστοί δρόμοι', other: 'Άλλο' });
  assert.deepStrictEqual(Array.from(ctx.OPS_DELAY.resp, r => r.label), ['Εμείς', 'Πελάτης / αποστολέας', 'Παραλήπτης', 'Σύνορα / αρχές', 'Εξωτερικοί', 'Άλλο']);
});

test('_opsDelayCheck says what the base would refuse, before any request', () => {
  const { ctx } = load();
  assert.match(ctx._opsDelayCheck('', ''), /Διάλεξε αιτία/);
  assert.match(ctx._opsDelayCheck('lost_keys', 'x'), /Διάλεξε αιτία/);
  assert.match(ctx._opsDelayCheck('other', ''), /«Άλλο»/);
  assert.match(ctx._opsDelayCheck('other', ' \t\n '), /«Άλλο»/);
  assert.strictEqual(ctx._opsDelayCheck('other', 'η ράμπα πλημμύρισε'), '');
  assert.strictEqual(ctx._opsDelayCheck('traffic', ''), '');
});

// ── 2. the buttons ──────────────────────────────────────────────────────────────────────────────
test('«Καθυστέρηση» on a loading, a delivery and the overdue zone (each opens the panel); a lot keeps «Παραλαβή (καθυστέρηση)»; «Καθυστέρησε» is gone', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  const html = S.content.innerHTML;
  assert.match(rowOf(html, 'recEXL0000000001'), /onclick="_opsDelayOpen\(event,'recEXL0000000001','el'\)">Καθυστέρηση</);
  assert.match(rowOf(html, 'recIMD0000000001'), /onclick="_opsDelayOpen\(event,'recIMD0000000001','id'\)">Καθυστέρηση</);
  assert.match(zrowOf(html, 'recOVD0000000001'), /onclick="_opsDelayOpen\(event,'recOVD0000000001','ovd'\)">Καθυστέρηση</);
  // multi: the order's button opens the points, like «Παραδόθηκε» (owner 26/8)
  assert.match(rowOf(html, 'recIMM0000000001'), /_opsToggleStops\('recIMM0000000001'\)">Καθυστέρηση</);
  const lot = rowOf(html, 'recLOT0000000001');
  assert.ok(/>Παραλαβή \(καθυστέρηση\)</.test(lot) && !/_opsDelayOpen/.test(lot), lot);
  assert.ok(!/Καθυστέρησε/.test(html), 'the old word is gone from the page');
  // the points of a multi-stop order: each its own «Καθυστέρηση» → the panel for THAT point
  ctx._opsToggleStops('recIMM0000000001');
  assert.match(S.content.innerHTML, /_opsDelayOpen\(event,'recIMM0000000001','id','recSTIMU2'\)">Καθυστέρηση</);
});

// ── 3. the writes ───────────────────────────────────────────────────────────────────────────────
test('delay on a LOADING: one stop PATCH (Delayed + reason + note), then the order In Transit; the row says why', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  await ctx._opsDelayApply({ id: 'recEXL0000000001', isL: true, isOv: false, stopId: null }, { reason: 'loading_wait', note: null });
  const sp = stopPatch(S);
  assert.strictEqual(sp.length, 1);
  assert.strictEqual(sp[0].id, 'recSTEXL1');
  assert.deepStrictEqual(Object.keys(sp[0].f).sort(), ['Completed At', 'Completed By', 'Delay Note', 'Delay Reason', 'Performance']);
  assert.strictEqual(sp[0].f.Performance, 'Delayed');
  assert.strictEqual(sp[0].f['Delay Reason'], 'loading_wait');
  assert.strictEqual(sp[0].f['Delay Note'], null);
  assert.deepStrictEqual(orderPatch(S).map(p => p.f.Status), ['In Transit']);
  assert.ok(S.patches.indexOf(sp[0]) < S.patches.indexOf(orderPatch(S)[0]), 'stamp first, then the order (11/9)');
  assert.match(rowOf(S.content.innerHTML, 'recEXL0000000001'), /<span class="do-sl do-dly"><b>Καθυστέρηση<\/b> · Πελάτης: Αναμονή στη φόρτωση<\/span>/);
  assert.match(S.toasts.slice(-1)[0], /Φορτώθηκε με καθυστέρηση ✓ · Πελάτης: Αναμονή στη φόρτωση/);
  assert.deepStrictEqual(S.errToasts, []);
});

test('delay on a DELIVERY of the day: stop PATCH, then Delivered + Delivery Performance Delayed (the existing aggregate)', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  await ctx._opsDelayApply({ id: 'recIMD0000000001', isL: false, isOv: false, stopId: null }, { reason: 'unloading_wait', note: 'περίμενε 3 ώρες' });
  const sp = stopPatch(S)[0];
  assert.deepStrictEqual([sp.id, sp.f.Performance, sp.f['Delay Reason'], sp.f['Delay Note']], ['recSTIDU1', 'Delayed', 'unloading_wait', 'περίμενε 3 ώρες']);
  const op = orderPatch(S)[0].f;
  assert.deepStrictEqual([op.Status, op['Delivery Performance']], ['Delivered', 'Delayed']);
  assert.match(rowOf(S.content.innerHTML, 'recIMD0000000001'), /Παραδόθηκε ✓[\s\S]*Καθυστέρηση<\/b> · Παραλήπτης: Αναμονή στην εκφόρτωση — περίμενε 3 ώρες/);
});

test('delay from the OVERDUE zone: stop PATCH, then Delivered with today\'s Actual Delivery Date; the row leaves the zone', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  await ctx._opsDelayApply({ id: 'recOVD0000000001', isL: false, isOv: true, stopId: null }, { reason: 'traffic', note: null });
  assert.deepStrictEqual([stopPatch(S)[0].id, stopPatch(S)[0].f['Delay Reason']], ['recSTOVU1', 'traffic']);
  const op = orderPatch(S)[0].f;
  assert.deepStrictEqual([op.Status, op['Delivery Performance'], op['Actual Delivery Date']], ['Delivered', 'Delayed', TODAY]);
  assert.deepStrictEqual(Array.from(ctx.OPS.overdue, r => r.id), []);
  assert.match(S.toasts.slice(-1)[0], /Σημειώθηκε ως καθυστερημένη · Εξωτερικοί: Κίνηση \/ ατύχημα/);
});

test('multi-stop: point ① late with its reason (only the stop is written), point ② on time → the order closes Delayed; each point shows its own', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  ctx._opsToggleStops('recIMM0000000001');
  await ctx._opsDelayApply({ id: 'recIMM0000000001', isL: false, isOv: false, stopId: 'recSTIMU1' }, { reason: 'customs', note: null });
  assert.deepStrictEqual(orderPatch(S), [], 'one point of two: the order is not touched');
  assert.match(S.content.innerHTML, /Καθυστέρηση ✓<\/span><span class="do-dly-why">Σύνορα: Τελωνείο<\/span>/);
  await ctx._opsMarkStopUI('recIMM0000000001', 'recSTIMU2', 'On Time');
  const op = orderPatch(S)[0].f;
  assert.deepStrictEqual([op.Status, op['Delivery Performance']], ['Delivered', 'Delayed']);
  assert.strictEqual(stopPatch(S)[1].f['Delay Reason'], undefined, 'an on-time point sends no reason');
});

// ── 4. when it does not hold ────────────────────────────────────────────────────────────────────
test('the Worker drops «Delay Reason» (not mapped yet): red + logged, the click is not lost (Delayed + Delivered written), the screen claims no reason', async () => {
  const { ctx, S } = load();
  S.drop = true;
  await ctx.renderDailyOps();
  await ctx._opsDelayApply({ id: 'recIMD0000000001', isL: false, isOv: false, stopId: null }, { reason: 'unloading_wait', note: null });
  assert.strictEqual(stopPatch(S)[0].f.Performance, 'Delayed');
  assert.deepStrictEqual([orderPatch(S)[0].f.Status, orderPatch(S)[0].f['Delivery Performance']], ['Delivered', 'Delayed']);
  assert.strictEqual(S.errToasts.length, 1);
  assert.match(S.errToasts[0], /η ΑΙΤΙΑ ΔΕΝ κρατήθηκε από τον server/);
  assert.ok(S.logged.some(l => /daily-ops: delay reason recSTIDU1 \| Delay Reason not read back: sent unloading_wait, got nothing/.test(l)), S.logged);
  const row = rowOf(S.content.innerHTML, 'recIMD0000000001');
  assert.match(row, /<b>Καθυστέρηση<\/b><\/span>/, 'Delayed is true, said alone');
  assert.ok(!/Αναμονή στην εκφόρτωση/.test(row), 'no reason the base does not hold');
});

test('a refused order write puts the stamp back WITH reason and note (one PATCH) — the base\'s CHECK allows exactly that', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  S.refuse = (t) => (t === 'tblO' ? Object.assign(new Error('422 rule'), { _noRetry: true }) : null);
  await ctx._opsDelayApply({ id: 'recIMD0000000001', isL: false, isOv: false, stopId: null }, { reason: 'other', note: 'TEST' });
  const sp = stopPatch(S);
  assert.strictEqual(sp.length, 2);
  assert.deepStrictEqual(sp[1].f, { 'Completed At': null, 'Completed By': null, Performance: null, 'Delay Reason': null, 'Delay Note': null });
  assert.match(S.toasts.slice(-1)[0], /σφραγίδα του σημείου αναιρέθηκε/);
});

test('an order with no delivery point: the declaration goes on, the reason that had nowhere to go is said and logged', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  await ctx._opsDelayApply({ id: 'recNOS0000000001', isL: false, isOv: false, stopId: null }, { reason: 'traffic', note: null });
  assert.deepStrictEqual(stopPatch(S), []);
  assert.strictEqual(orderPatch(S)[0].f['Delivery Performance'], 'Delayed');
  assert.match(S.errToasts[0], /η ΑΙΤΙΑ ΔΕΝ γράφτηκε: η παραγγελία δεν έχει σημείο παράδοσης/);
  assert.ok(S.logged.some(l => /delay reason nowhere/.test(l)));
});

test('the note is escaped wherever it is drawn (sub-row, status line, toast)', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  const evil = '<img src=x onerror=alert(1)>';
  await ctx._opsDelayApply({ id: 'recIMD0000000001', isL: false, isOv: false, stopId: null }, { reason: 'other', note: evil });
  const html = S.content.innerHTML;
  assert.ok(!html.includes(evil) && html.includes('Άλλο: &lt;img src=x onerror=alert(1)&gt;'), rowOf(html, 'recIMD0000000001'));
  assert.ok(!S.toasts.slice(-1)[0].includes(evil), S.toasts.slice(-1)[0]);
});

// ── 5. a declared single-stop row stamped AGAIN (review F1, 9/10) ───────────────────────────────
// The top-bar Revert puts back the ORDER write only (core/api.js undo: the stop is not in it), so the row
// is pending again while its one stop still holds Delayed + reason. Same after a connection failure (the
// stamp stays) or a status moved back on another screen. Here the Revert is the order's Status put back.
const revertOrder = (ctx, id, status) => { ctx.OPS.intl.find(r => r.id === id).fields.Status = status; };

test('F1: after the Revert, «Παραδόθηκε» on a delayed single delivery clears reason and note in the SAME stop PATCH — On Time is declarable again', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  await ctx._opsDelayApply({ id: 'recIMD0000000001', isL: false, isOv: false, stopId: null }, { reason: 'unloading_wait', note: 'περίμενε 3 ώρες' });
  revertOrder(ctx, 'recIMD0000000001', 'In Transit');
  await ctx._opsDel('recIMD0000000001', 'On Time');
  const sp = stopPatch(S);
  assert.strictEqual(sp.length, 2);
  assert.strictEqual(sp[1].id, 'recSTIDU1');
  assert.deepStrictEqual(Object.keys(sp[1].f).sort(), ['Completed At', 'Completed By', 'Delay Note', 'Delay Reason', 'Performance']);
  assert.deepStrictEqual([sp[1].f.Performance, sp[1].f['Delay Reason'], sp[1].f['Delay Note']], ['On Time', null, null]);
  assert.deepStrictEqual(S.violations, [], 'the base refuses nothing');
  assert.deepStrictEqual([S.base.recSTIDU1.Performance, S.base.recSTIDU1['Delay Reason'], S.base.recSTIDU1['Delay Note']], ['On Time', null, null]);
  const op = orderPatch(S)[1].f;
  assert.deepStrictEqual([op.Status, op['Delivery Performance']], ['Delivered', 'On Time']);
  const row = rowOf(S.content.innerHTML, 'recIMD0000000001');
  assert.ok(/Παραδόθηκε ✓/.test(row) && !/Καθυστέρηση<\/b>/.test(row) && !/Αναμονή στην εκφόρτωση/.test(row), row);
  const f = ctx.OPS._stopsByOrder.recIMD0000000001.find(s => s.id === 'recSTIDU1').fields;
  assert.ok(f['Delay Reason'] == null && f['Delay Note'] == null && !('Delay Responsibility' in f), 'the screen keeps no reason the base dropped');
  assert.match(S.toasts.slice(-1)[0], /Παραδόθηκε ✓/);
  assert.deepStrictEqual(S.errToasts, []);
});

test('F1: after the Revert, «Φορτώθηκε» on a delayed single loading clears Performance, reason and note together — no stale «Καθυστέρηση»', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  await ctx._opsDelayApply({ id: 'recEXL0000000001', isL: true, isOv: false, stopId: null }, { reason: 'other', note: 'άλλαξε ράμπα' });
  revertOrder(ctx, 'recEXL0000000001', 'Assigned');
  await ctx._opsStat('recEXL0000000001', 'In Transit');
  const sp = stopPatch(S);
  assert.strictEqual(sp.length, 2);
  assert.deepStrictEqual(Object.keys(sp[1].f).sort(), ['Completed At', 'Completed By', 'Delay Note', 'Delay Reason', 'Performance']);
  assert.deepStrictEqual([sp[1].f.Performance, sp[1].f['Delay Reason'], sp[1].f['Delay Note']], [null, null, null], 'the plain single-loading stamp: no Performance, as before 067');
  assert.deepStrictEqual(S.violations, []);
  assert.deepStrictEqual(orderPatch(S).map(p => p.f.Status), ['In Transit', 'In Transit']);
  const row = rowOf(S.content.innerHTML, 'recEXL0000000001');
  assert.ok(/Φορτώθηκε ✓/.test(row) && !/Καθυστέρηση<\/b>/.test(row) && !/άλλαξε ράμπα/.test(row), row);
  assert.match(S.toasts.slice(-1)[0], /: Φορτώθηκε ✓$/);
});

test('F1: the correction refused by the order write puts the stamp back WITH Delayed, reason and note in one PATCH (the base allows it)', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  await ctx._opsDelayApply({ id: 'recIMD0000000001', isL: false, isOv: false, stopId: null }, { reason: 'unloading_wait', note: 'περίμενε 3 ώρες' });
  const first = stopPatch(S)[0].f;
  revertOrder(ctx, 'recIMD0000000001', 'In Transit');
  S.refuse = (t) => (t === 'tblO' ? Object.assign(new Error('422 rule'), { _noRetry: true }) : null);
  await ctx._opsDel('recIMD0000000001', 'On Time');
  const sp = stopPatch(S);
  assert.strictEqual(sp.length, 3);
  assert.deepStrictEqual(sp[2].f, { 'Completed At': first['Completed At'], 'Completed By': first['Completed By'], Performance: 'Delayed', 'Delay Reason': 'unloading_wait', 'Delay Note': 'περίμενε 3 ώρες' });
  assert.deepStrictEqual(S.violations, []);
  assert.deepStrictEqual([S.base.recSTIDU1.Performance, S.base.recSTIDU1['Delay Reason']], ['Delayed', 'unloading_wait']);
  assert.match(S.toasts.slice(-1)[0], /σφραγίδα του σημείου αναιρέθηκε/);
  // the screen's copy is the base's again (the responsibility then follows from the code, same CASE)
  const f = ctx.OPS._stopsByOrder.recIMD0000000001.find(s => s.id === 'recSTIDU1').fields;
  assert.deepStrictEqual([f.Performance, f['Delay Reason'], f['Delay Note']], ['Delayed', 'unloading_wait', 'περίμενε 3 ώρες']);
});

test('F1: a stop that never held a reason is stamped with the request it always had (no delay labels sent)', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  await ctx._opsDel('recIMD0000000001', 'On Time');
  await ctx._opsStat('recEXL0000000001', 'In Transit');
  const sp = stopPatch(S);
  assert.deepStrictEqual(Object.keys(sp[0].f).sort(), ['Completed At', 'Completed By', 'Performance']);
  assert.deepStrictEqual(Object.keys(sp[1].f).sort(), ['Completed At', 'Completed By']);
  assert.deepStrictEqual(S.violations, []);
});
