// node --test tests/daily-ops-stock.test.js   (TZ=Europe/Athens)
// Stock lots Φ1 on the Ημερήσιο (impact map 4/10 C-01, C-04, C-05). The REAL
// modules/daily_ops.js runs in a vm (the whole IIFE, as the browser loads it)
// with the REAL OrdersStock (core/orders-common.js) and getLinkedId
// (core/data-helpers.js); the facade (atGetAll/atSafePatch) and the page
// helpers are in-memory stubs. Nothing is sent anywhere.
//   C-01 a LOT's delivery row says «→ ΑΠΟΘΗΚΗ», «Παραλαβή αποθήκης», done
//        «Στην αποθήκη ✓», toast «Στην αποθήκη ✓», and is NOT in ΠΑΡΑΔΟΣΕΙΣ x/y
//   C-04 a PIECE's loading row carries «ΑΠ · 5p · παρτίδα #312»
//   C-05 → round 1 C1-02: a LOOSE piece whose loading passed is in the overdue LOADINGS zone
//        (not the deliveries zone), with the K6 hint and no «Φορτώθηκε»; zone rows carry
//        «ΑΠ · Np · παρτίδα #N» (C4-09)
// Round 1: X1 (critic-3 Σ-02) a REFUSED order write after the stop stamp puts the stamp back
// and never says «δεν γράφτηκε τίποτα. Ξαναδοκίμασε»; X2 C1-08 the lot's late button is a late
// INTAKE; C1-11 section header counts like the KPI; X5 (D1) a piece borrows no vehicle from its
// matched export.
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

// Today's day window, the overdue deliveries and the overdue loadings — each
// facade query answers with its own fixture list (the filter itself is the
// Worker's job; what is under test is what the screen does with the answer).
function fixtures() {
  const lot = { id: 'recLOT0000000312', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': dayOff(-1), 'Delivery DateTime': TODAY, Status: 'Assigned', Partner: ['recPRT1'], 'Is Partner Trip': true, 'Total Pallets': 33, 'Pallet Exchange': true, 'Own Stock Lot': 'recSTOCKLOT1' } };
  const imp = { id: 'recIMP0000000001', fields: { Direction: 'Import', Client: ['recCLIB'], 'Loading DateTime': dayOff(-2), 'Delivery DateTime': TODAY, Status: 'Assigned', Truck: ['recTRK1'], 'Total Pallets': 20 } };
  const piece = { id: 'recPC10000000001', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': TODAY, 'Delivery DateTime': dayOff(2), Status: 'Assigned', Truck: ['recTRK1'], 'Group ID': 'GI-X|recIMP0000000002', 'Total Pallets': 5, 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312, 'Stock Lot Source': 'intl' } };
  // back in stock: no truck, no group, Pending, the dates of the truck it left
  const loose1 = { id: 'recPC20000000002', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': dayOff(-3), 'Delivery DateTime': dayOff(-2), Status: 'Pending', 'Total Pallets': 4, 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312 } };
  const loose2 = { id: 'recPC30000000003', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': dayOff(-2), 'Delivery DateTime': dayOff(1), Status: 'Pending', 'Total Pallets': 6, 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312 } };
  // an ordinary order that did not load — must stay in the zone
  const old = { id: 'recOLD0000000001', fields: { Direction: 'Export', Client: ['recCLIB'], 'Loading DateTime': dayOff(-2), 'Delivery DateTime': dayOff(1), Status: 'Pending', 'Total Pallets': 12 } };
  // a piece ON a truck that did not load — not loose, stays
  const onTruck = { id: 'recPC40000000004', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': dayOff(-2), 'Delivery DateTime': dayOff(1), Status: 'Assigned', Truck: ['recTRK1'], 'Total Pallets': 3, 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312 } };
  return { day: [lot, imp, piece], ov: [loose1], ovL: [loose1, loose2, old, onTruck] };
}

function load(extra = {}) {
  const fx = fixtures();
  if (extra.day) fx.day.push(...extra.day);
  // extra.stops: ORDER STOPS records (their order must list them in 'ORDER STOPS');
  // extra.exps: exports answering the pair-inherit query; S.refuse(table, id, fields) → an Error to throw.
  const stops = extra.stops || [], exps = extra.exps || [];
  const S = { calls: [], patches: [], toasts: [], content: { innerHTML: '' }, refuse: null };
  const clone = a => a.map(r => ({ id: r.id, fields: JSON.parse(JSON.stringify(r.fields)) }));
  const names = { recCLIA: 'Πελάτης Α', recCLIB: 'Πελάτης Β', recTRK1: 'ΑΒΓ-1234', recPRT1: 'Συνεργάτης Α' };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    OrdersStock: extra.OrdersStock || OrdersStock, getLinkedId, escapeHtml: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    TABLES: { ORDERS: 'tblO', ORDER_STOPS: 'tblS' }, F: { STOP_PARENT_ORDER: 'Parent Order', STOP_TYPE: 'Stop Type', STOP_NUMBER: 'Stop Number', STOP_LOCATION: 'Location' },
    FEATURES: {}, localToday: () => TODAY, localTomorrow: () => dayOff(1), _plus: (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return ymd(x); },
    toLocalDate: raw => { if (!raw) return ''; const d = new Date(String(raw).length === 10 ? raw + 'T12:00:00' : raw); return isNaN(d) ? '' : ymd(d); },
    showLoading: () => '', preloadReferenceData: async () => {}, getRefTrucks: () => [], getRefDrivers: () => [], getRefLocations: () => [], getRefClients: () => [], getRefTrailers: () => [],
    getLocationName: id => (id ? 'Τοποθεσία ' + id : ''), getClientName: id => names[id] || '', getTruckPlate: id => names[id] || '', getDriverName: () => '', getPartnerName: id => names[id] || '',
    isPreorder: () => false, preorderCounterHtml: () => '', preorderChipHtml: () => '', preorderCountryText: () => '', preorderLevel: () => '',
    can: () => 'full', confirmAction: async () => true, fmtDate: d => d,
    toast: (m, t) => S.toasts.push(m),
    atSafePatch: async (t, id, f) => { S.patches.push({ t, id, f }); const e = S.refuse && S.refuse(t, id, f); if (e) throw e; return { id, fields: f }; },
    paSyncStatus: async () => null,
    atGetAll: async (table, opts) => {
      const fm = (opts && opts.filterByFormula) || '';
      S.calls.push({ table, fm, fields: (opts && opts.fields) || null });
      if (table === 'tblS') return clone(stops.filter(s => fm.includes(`"${s.id}"`)));
      if (table !== 'tblO') return [];
      if (fm.startsWith('OR(IS_SAME(')) return clone(fx.day);
      if (fm.startsWith('AND(IS_BEFORE({Delivery DateTime}')) return clone(fx.ov);
      if (fm.startsWith('AND(IS_BEFORE({Loading DateTime}')) return clone(fx.ovL);
      if (fm.includes('{Matched Import ID}=')) return clone(exps.filter(e => fm.includes(`'${e.fields['Matched Import ID']}'`)));
      return [];
    },
    document: { getElementById: id => (id === 'content' ? S.content : null), querySelectorAll: () => [], querySelector: () => null, removeEventListener() {} },
  };
  ctx.window = ctx;
  vm.runInNewContext(SRC, ctx);
  return { ctx, S };
}
const rowOf = (html, id) => { const m = html.match(new RegExp(`<tr id="r_${id}"[\\s\\S]*?</tr>`)); return m ? m[0] : ''; };
const zrowOf = (html, id) => { const m = html.match(new RegExp(`<div class="do-zrow[^"]*" id="r_${id}"[\\s\\S]*?</div>`)); return m ? m[0] : ''; };

test('OPS_FIELDS asks for the stock labels (else the predicates are silently false)', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  const day = S.calls.find(c => c.fm.startsWith('OR(IS_SAME('));
  for (const l of ['Own Stock Lot', 'Stock Lot', 'Stock Lot Order No', 'Stock Lot Source', 'Group ID', 'Truck', 'Partner', 'Status'])
    assert.ok(day.fields.includes(l), 'missing ' + l);
});

test('C1-02: a loose piece whose loading passed is in the LOADINGS zone (not deliveries), with the K6 hint and no «Φορτώθηκε»', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  const html = S.content.innerHTML;
  assert.deepStrictEqual(ctx.OPS.overdue.map(r => r.id), [], 'a loose piece is listed once — in the loadings zone');
  assert.deepStrictEqual(ctx.OPS.overdueLoads.map(r => r.id).sort(), ['recOLD0000000001', 'recPC20000000002', 'recPC30000000003', 'recPC40000000004']);
  for (const id of ['recPC20000000002', 'recPC30000000003']) {
    const z = zrowOf(html, id);
    assert.ok(z, id + ' is not drawn — the late piece no screen shows (C1-02)');
    assert.ok(!/Φορτώθηκε|Παραδόθηκε/.test(z), z);
    assert.ok(/χωρίς φορτηγό — από το ΑΠΟΘΕΜΑ του Εβδομαδιαίου/.test(z), z);
  }
  assert.match(html, /4 εκκρεμείς φορτώσεις από προηγούμενες ημέρες/);
  assert.ok(/Φορτώθηκε/.test(zrowOf(html, 'recOLD0000000001')), 'an ordinary late loading keeps its button');
  assert.ok(/Φορτώθηκε/.test(zrowOf(html, 'recPC40000000004')), 'a piece ON a truck keeps its button');
});

test('C4-09: overdue loadings zone rows keep «ΑΠ · Np · παρτίδα #N»; an ordinary row says nothing of it', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  const html = S.content.innerHTML;
  assert.ok(/<span class="do-sl">ΑΠ · 3p · παρτίδα #312<\/span>/.test(zrowOf(html, 'recPC40000000004')), zrowOf(html, 'recPC40000000004'));
  assert.ok(/ΑΠ · 4p · παρτίδα #312/.test(zrowOf(html, 'recPC20000000002')));
  assert.ok(!/παρτίδα/.test(zrowOf(html, 'recOLD0000000001')));
});

test('C-01: the lot intake row — «→ ΑΠΟΘΗΚΗ», «Παραλαβή αποθήκης», not in ΠΑΡΑΔΟΣΕΙΣ x/y', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  const html = S.content.innerHTML;
  const lot = rowOf(html, 'recLOT0000000312'), imp = rowOf(html, 'recIMP0000000001');
  assert.ok(/→ ΑΠΟΘΗΚΗ/.test(lot), lot);
  assert.ok(/>Παραλαβή αποθήκης</.test(lot) && !/>Παραδόθηκε</.test(lot), lot);
  assert.ok(/>Παραδόθηκε</.test(imp) && !/ΑΠΟΘΗΚΗ|Παραλαβή αποθήκης/.test(imp), imp);
  // ΠΑΡΑΔΟΣΕΙΣ counts the client delivery only: 0 / 1, not 0 / 2
  assert.match(html, /ΠΑΡΑΔΟΣΕΙΣ<\/div>\s*<div class="do-kpi-v">0 <small>\/ 1 δηλωμένη<\/small>/);
});

test('C-01: declared lot reads «Στην αποθήκη ✓», the toast says so too, an ordinary delivery is unchanged', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  await ctx._opsDel('recLOT0000000312', 'On Time');
  assert.deepStrictEqual(S.patches[0].f['Status'], 'Delivered');            // the same write: Delivered = intake
  assert.strictEqual(S.toasts.slice(-1)[0], 'Στην αποθήκη ✓');
  assert.ok(/Στην αποθήκη ✓/.test(rowOf(S.content.innerHTML, 'recLOT0000000312')));
  await ctx._opsDel('recIMP0000000001', 'On Time');
  assert.strictEqual(S.toasts.slice(-1)[0], 'Παραδόθηκε ✓');
  assert.ok(/Παραδόθηκε ✓/.test(rowOf(S.content.innerHTML, 'recIMP0000000001')));
});

test('C-01: a lot in the overdue deliveries zone carries the tag and the intake button', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  const lot = fixtures().day[0];
  ctx.OPS.overdue = [{ id: lot.id, fields: Object.assign({}, lot.fields, { 'Delivery DateTime': dayOff(-1) }) }];
  ctx._opsSetFilter('q', '');
  const z = zrowOf(S.content.innerHTML, lot.id);
  assert.ok(/→ ΑΠΟΘΗΚΗ/.test(z) && /Παραλαβή αποθήκης/.test(S.content.innerHTML), z);
});

test('C-04: the piece loading row says «ΑΠ · 5p · παρτίδα #312»; an ordinary loading row says nothing of it', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  assert.ok(/<span class="do-sl">ΑΠ · 5p · παρτίδα #312<\/span>/.test(rowOf(S.content.innerHTML, 'recPC10000000001')));
  assert.ok(!/παρτίδα/.test(rowOf(S.content.innerHTML, 'recIMP0000000001')));
});

test('round-1 K6: a loose piece loading TODAY stays visible but offers no «Φορτώθηκε» — it points to the Weekly ΑΠΟΘΕΜΑ', async () => {
  const looseToday = { id: 'recPC50000000005', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': TODAY, 'Delivery DateTime': dayOff(2), Status: 'Pending', 'Total Pallets': 2, 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312 } };
  const { ctx, S } = load({ day: [looseToday] });
  await ctx.renderDailyOps();
  const row = rowOf(S.content.innerHTML, 'recPC50000000005');
  assert.ok(row, 'the row is gone — today\'s work must stay visible');
  assert.ok(!/Φορτώθηκε/.test(row), 'a truckless piece offers «Φορτώθηκε»');
  assert.ok(/χωρίς φορτηγό — από το ΑΠΟΘΕΜΑ του Εβδομαδιαίου/.test(row));
  assert.ok(/Φορτώθηκε/.test(rowOf(S.content.innerHTML, 'recPC10000000001')) || /Φορτώθηκε ✓/.test(rowOf(S.content.innerHTML, 'recPC10000000001')), 'a piece ON a truck keeps its action');
});

// ── Round 1 ──────────────────────────────────────────────────────────────────
const rowText = (html, id) => rowOf(html, id);
const refusal = () => Object.assign(new Error('Η παρτίδα είναι τιμολογημένη — η κατάσταση του κομματιού δεν αλλάζει'), { _noRetry: true, _rule: 'lot_invoiced' });
const pc6 = () => ({ id: 'recPC60000000006', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': TODAY, 'Delivery DateTime': dayOff(2), Status: 'Assigned', Truck: ['recTRK1'], 'Total Pallets': 2, 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312, 'ORDER STOPS': ['recSTP6L00000001'] } });
const st6 = () => ({ id: 'recSTP6L00000001', fields: { 'Parent Order': ['recPC60000000006'], 'Stop Type': 'Loading', 'Stop Number': 1, Location: ['recLOCWH'] } });

test('X1 (Σ-02): a REFUSED «Φορτώθηκε» puts the stop stamp back and says what happened — no «Ξαναδοκίμασε»', async () => {
  const { ctx, S } = load({ day: [pc6()], stops: [st6()] });
  S.refuse = t => (t === 'tblO' ? refusal() : null);
  await ctx.renderDailyOps();
  await ctx._opsStat('recPC60000000006', 'In Transit');
  assert.deepStrictEqual(S.patches.map(p => p.t + ':' + p.id), ['tblS:recSTP6L00000001', 'tblO:recPC60000000006', 'tblS:recSTP6L00000001']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(S.patches[2].f)), { 'Completed At': null, 'Completed By': null }, 'the rollback writes back what the stop held');
  assert.strictEqual(S.toasts.slice(-1)[0], 'Δεν δηλώθηκε — η σφραγίδα του σημείου αναιρέθηκε· η γραμμή μένει εκκρεμής');
  assert.ok(!S.toasts.some(t => /Ξαναδοκίμασε|δεν γράφτηκε τίποτα/.test(t)), S.toasts.join(' / '));
  assert.ok(!('Completed At' in ctx.OPS._stopsByOrder.recPC60000000006[0].fields));
  const row = rowText(S.content.innerHTML, 'recPC60000000006');
  assert.ok(/>Φορτώθηκε</.test(row) && !/Φορτώθηκε ✓/.test(row), 'the row is pending again, with its button: ' + row);
});

test('X1 (Σ-02): multi-stop — the LAST point stamped, the order refused: only that point is put back, its button returns', async () => {
  const pc7 = { id: 'recPC70000000007', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': dayOff(-1), 'Delivery DateTime': TODAY, Status: 'In Transit', Truck: ['recTRK1'], 'Total Pallets': 6, 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312, 'ORDER STOPS': ['recSTP7U00000001', 'recSTP7U00000002'] } };
  const st = n => ({ id: 'recSTP7U0000000' + n, fields: { 'Parent Order': ['recPC70000000007'], 'Stop Type': 'Unloading', 'Stop Number': n, Location: ['recLOC' + n] } });
  const { ctx, S } = load({ day: [pc7], stops: [st(1), st(2)] });
  S.refuse = t => (t === 'tblO' ? refusal() : null);
  await ctx.renderDailyOps();
  await ctx._opsMarkStopUI('recPC70000000007', 'recSTP7U00000001', 'On Time');
  await ctx._opsMarkStopUI('recPC70000000007', 'recSTP7U00000002', 'On Time');
  const [a, b] = ctx.OPS._stopsByOrder.recPC70000000007.slice().sort((x, y) => x.fields['Stop Number'] - y.fields['Stop Number']);
  assert.strictEqual(a.fields.Performance, 'On Time', 'an earlier, real declaration stays');
  assert.ok(!('Performance' in b.fields) && !('Completed At' in b.fields), JSON.stringify(b.fields));
  assert.ok(/1\/2 παραδόθηκαν/.test(rowText(S.content.innerHTML, 'recPC70000000007')), rowText(S.content.innerHTML, 'recPC70000000007'));
  assert.strictEqual(S.toasts.slice(-1)[0], 'Δεν δηλώθηκε — η σφραγίδα του σημείου αναιρέθηκε· η γραμμή μένει εκκρεμής');
});

test('X1: a network failure (unknown outcome) keeps the stamp and says to refresh first', async () => {
  const { ctx, S } = load({ day: [pc6()], stops: [st6()] });
  S.refuse = t => (t === 'tblO' ? new TypeError('Failed to fetch') : null);
  await ctx.renderDailyOps();
  await ctx._opsStat('recPC60000000006', 'In Transit');
  assert.deepStrictEqual(S.patches.map(p => p.t), ['tblS', 'tblO'], 'no rollback: the order may have been written');
  assert.ok('Completed At' in ctx.OPS._stopsByOrder.recPC60000000006[0].fields);
  assert.strictEqual(S.toasts.slice(-1)[0], 'Η σφραγίδα γράφτηκε, η παραγγελία ΔΕΝ επιβεβαιώθηκε (σύνδεση) — Ανανέωση πριν ξαναδοκιμάσεις');
});

test('X1: the rollback itself failing is said loudly — the stamp stayed', async () => {
  const { ctx, S } = load({ day: [pc6()], stops: [st6()] });
  S.refuse = (t, _id, f) => (t === 'tblO' ? refusal() : f['Completed At'] === null ? new TypeError('Failed to fetch') : null);
  await ctx.renderDailyOps();
  await ctx._opsStat('recPC60000000006', 'In Transit');
  assert.match(S.toasts.slice(-1)[0], /σφραγίδα του σημείου ΕΜΕΙΝΕ γραμμένη/);
});

test('C1-08: on a lot the late button is a late INTAKE — «Παραλαβή (καθυστέρηση)», its confirm and its toast say so', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  const lot = rowText(S.content.innerHTML, 'recLOT0000000312');
  assert.ok(/>Παραλαβή \(καθυστέρηση\)</.test(lot) && !/>Καθυστέρησε</.test(lot), lot);
  assert.ok(lot.includes("confirmAction('Παραλήφθηκε στην αποθήκη με καθυστέρηση;')"), lot);
  assert.ok(/>Καθυστέρησε</.test(rowText(S.content.innerHTML, 'recIMP0000000001')), 'an ordinary delivery keeps «Καθυστέρησε»');
  await ctx._opsDel('recLOT0000000312', 'Delayed');
  assert.strictEqual(S.patches.find(p => p.t === 'tblO').f['Delivery Performance'], 'Delayed');   // same write
  assert.strictEqual(S.toasts.slice(-1)[0], 'Στην αποθήκη ✓ — με καθυστέρηση');
});

test('C1-11: the import deliveries header counts like the KPI and names the intake apart', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  const head = () => (S.content.innerHTML.match(/ΠΑΡΑΔΟΣΕΙΣ ΕΙΣΑΓΩΓΗΣ<span>([^<]*)<\/span>/) || [])[1];
  assert.strictEqual(head(), '1 · 0 δηλωμένες · 1 παραλαβή αποθήκης');
  await ctx._opsDel('recLOT0000000312', 'On Time');
  assert.strictEqual(head(), '1 · 0 δηλωμένες · 1 παραλαβή αποθήκης', 'the intake is not a declared client delivery');
  assert.match(S.content.innerHTML, /ΠΑΡΑΔΟΣΕΙΣ<\/div>\s*<div class="do-kpi-v">0 <small>\/ 1 δηλωμένη/);
});

test('X5 (D1): a piece matched by an export borrows no vehicle — loose, the K6 hint; an ordinary import still inherits', async () => {
  const pcM = { id: 'recPC80000000008', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': TODAY, 'Delivery DateTime': dayOff(2), Status: 'Pending', 'Total Pallets': 3, 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312 } };
  const impB = { id: 'recIMP9000000009', fields: { Direction: 'Import', Client: ['recCLIB'], 'Loading DateTime': TODAY, 'Delivery DateTime': dayOff(2), Status: 'Assigned', 'Total Pallets': 9 } };
  const exps = [{ id: 'recEXP8', fields: { 'Matched Import ID': 'recPC80000000008', Truck: ['recTRK1'] } }, { id: 'recEXP9', fields: { 'Matched Import ID': 'recIMP9000000009', Truck: ['recTRK1'] } }];
  const { ctx, S } = load({ day: [pcM, impB], exps });
  await ctx.renderDailyOps();
  const pr = rowText(S.content.innerHTML, 'recPC80000000008');
  assert.ok(!/Φορτώθηκε/.test(pr) && /χωρίς φορτηγό — από το ΑΠΟΘΕΜΑ/.test(pr), pr);
  assert.ok(!/ΑΒΓ-1234/.test(pr), 'the piece is drawn with its export\'s truck');
  assert.ok(/ΑΒΓ-1234/.test(rowText(S.content.innerHTML, 'recIMP9000000009')), 'pair-inherit for an ordinary import is unchanged');
});

test('D1 (round-1 isLoose: Group ID does not count): a truckless piece with a stale Group ID is loose here too', async () => {
  const D1 = Object.assign(Object.create(OrdersStock), { isLoose: f => OrdersStock.isPiece(f) && !getLinkedId(f['Truck']) && !getLinkedId(f['Partner']) && f['Status'] !== 'Delivered' });
  const stale = { id: 'recPCA000000000A', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': dayOff(-2), 'Delivery DateTime': dayOff(1), Status: 'Pending', 'Group ID': 'GI-OLD|recIMPX', 'Total Pallets': 4, 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312 } };
  const { ctx, S } = load({ OrdersStock: D1 });
  ctx.atGetAll = (orig => async (t, o) => { const r = await orig(t, o); return t === 'tblO' && o.filterByFormula.startsWith('AND(IS_BEFORE({Loading DateTime}') ? r.concat([JSON.parse(JSON.stringify(stale))]) : r; })(ctx.atGetAll);
  await ctx.renderDailyOps();
  const z = zrowOf(S.content.innerHTML, 'recPCA000000000A');
  assert.ok(z && !/Φορτώθηκε/.test(z) && /χωρίς φορτηγό — από το ΑΠΟΘΕΜΑ/.test(z), z);
});
