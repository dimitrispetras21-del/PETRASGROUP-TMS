// node --test tests/daily-ramp-v5.test.js   (TZ=Europe/Athens)
// National v5 F5, Ε14 (stream d2): the Daily Ramp Board shows the national loadings / unloadings at the Veroia hub
// from GET /plan/board once day L has happened, read-only, and is today's page before it.
// The REAL modules/daily_ramp.js and the REAL core/plan-config.js run in one vm (as the browser loads them), with the
// REAL WN5L (hub fallback) and TmsWeek; the facade and /plan/* are in-memory stubs. Nothing is sent anywhere.
// RAMP_SRC=<path> runs the same tests against another copy of daily_ramp.js (NO-GO on the previous tip:
//   git show origin/main:modules/daily_ramp.js > /tmp/x.js && RAMP_SRC=/tmp/x.js node --test tests/daily-ramp-v5.test.js
// → every v5 test FAILS there; only «before» and the equality test pass).
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
global.escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
global.getRefClients = () => [];
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'core', 'data-helpers.js'), 'utf8'));
const TmsWeek = require('../core/tms-week.js');
const WN5L = require('../core/wn5-logic.js');
const SRC = fs.readFileSync(process.env.RAMP_SRC || path.join(ROOT, 'modules', 'daily_ramp.js'), 'utf8');
const CFG_SRC = fs.readFileSync(path.join(ROOT, 'core', 'plan-config.js'), 'utf8');

const D = '2026-11-02';            // a Monday of the TMS week that starts Saturday 31/10
const WEEK = '2026-10-31';
const HUB = 77;

const leg = (leg_id, piece_id, act, pallets, kind, client, temperature_c) => ({ leg_id, piece_id, act, pallets, kind, client, temperature_c, order_id: null, nat_order_id: null, reference: 'R' + piece_id, client_id: 1 });
const stop = (stop_id, seq, location_id, location, stop_day, planned_from, legs, executed) =>
  ({ stop_id, seq, side: 'KATHODOS', location_id, location, planned_from, planned_to: planned_from, stop_day, executed: !!executed, has_vehicle: true, has_late: false, dim: false, side_dim: false, cycle_dim: false, local_loading: null, legs });
function board(over) {
  return Object.assign({
    week: WEEK,
    cycles: [
      { rt_id: 1, code: 'RT-1', trip_type: 'OWNED', truck: 'ΑΒΓ-1001', trailer: null, driver: 'Οδηγός Α', partner: null, partner_rate: 100, stops: [
        stop(10, 1, HUB, 'VEROIA CROSS-DOCK', D, '2026-11-02T06:00:00+00:00', [leg(1, 1, 'load', 10, 'vs_import', 'Πελάτης Ε', 2), leg(2, 2, 'load', 4.5, 'national', 'Πελάτης Ν', 4)]),
        stop(11, 2, 501, 'Θεσσαλονίκη', D, '2026-11-02T08:00:00+00:00', [leg(1, 1, 'unload', 10, 'vs_import', 'Πελάτης Ε', 2)]),
        stop(12, 3, 502, 'Λάρισα', D, '2026-11-02T10:00:00+00:00', [leg(2, 2, 'unload', 4.5, 'national', 'Πελάτης Ν', 4)]),
        stop(13, 4, 503, 'Κατερίνη', D, '2026-11-02T12:00:00+00:00', [leg(3, 3, 'load', 6, 'vs_export', 'Πελάτης Χ', 2)]),
        stop(14, 5, HUB, 'VEROIA CROSS-DOCK', D, '2026-11-02T14:00:00+00:00', [leg(3, 3, 'unload', 6, 'vs_export', 'Πελάτης Χ', 2)]),
      ] },
      // a partner cycle at the hub the NEXT day: not on D's ramp
      { rt_id: 2, code: 'RT-2', trip_type: 'PARTNER', truck: null, driver: null, partner: 'Συνεργάτης Β', partner_rate: 200, stops: [
        stop(20, 1, HUB, 'VEROIA CROSS-DOCK', '2026-11-03', '2026-11-03T06:00:00+00:00', [leg(4, 4, 'load', 3, 'vs_import', 'Πελάτης Ζ', 2)]),
        stop(21, 2, 504, 'Βόλος', '2026-11-03', '2026-11-03T09:00:00+00:00', [leg(4, 4, 'unload', 3, 'vs_import', 'Πελάτης Ζ', 2)]),
      ] },
    ],
    hub: [
      { piece_id: 40, kind: 'vs_import', pallets: 8, nat_ready_day: D, nat_due_day: '2026-11-03', inbound_rt_id: null, leave_by: null, client: 'Πελάτης Η', temperature_c: 2 },
      { piece_id: 41, kind: 'national', pallets: 2, nat_ready_day: D, nat_due_day: D, inbound_rt_id: 5, leave_by: null, client: 'Πελάτης Θ' },   // came in on a cycle: stock
      { piece_id: 42, kind: 'vs_import', pallets: 1, nat_ready_day: '2026-11-03', nat_due_day: '2026-11-04', inbound_rt_id: null, client: 'Πελάτης Ι' },
    ],
    waiting: [
      { piece_id: 50, kind: 'vs_export', pallets: 5, nat_from_location_id: 505, nat_to_location_id: HUB, nat_ready_day: '2026-11-01', nat_due_day: D, client: 'Πελάτης Κ', temperature_c: 3 },
      { piece_id: 51, kind: 'national', pallets: 7, nat_from_location_id: 505, nat_to_location_id: 600, nat_ready_day: D, nat_due_day: D, client: 'Πελάτης Λ' },
      { piece_id: 52, kind: 'vs_export', pallets: 9, nat_from_location_id: 505, nat_to_location_id: HUB, nat_ready_day: D, nat_due_day: '2026-11-03', client: 'Πελάτης Μ' },
    ],
    notices: [],
  }, over || {});
}

// the one legacy line of the day: an international VS cross-dock arrival, as the RAMP facade returns it
const LEGACY = [{ id: 'recRAMP00000001', fields: { 'Plan Date': D, Time: '2026-11-02T04:00:00.000Z', Type: 'Παραλαβή', Status: 'Planned', Pallets: 20, 'Supplier/Client': 'Πελάτης Δ', 'Ramp Category': 'VS Simple', 'Is Veroia Switch': true, Notes: 'STOP:recSTOP0000000001', Order: ['recORD0000000001'] } }];

// opts.config: 'before' (404 no_route) | 'before-null' | 'after' | 'none' (plan-config.js not loaded) | Error
// opts.board: a board object, or an Error to throw. opts.ids: {ok, hub} of PlanIds, or 'none'.
function load(opts) {
  const o = Object.assign({ config: 'after', board: board(), ids: { ok: true, hub: HUB }, src: SRC }, opts || {});
  const S = { calls: [], writes: [], logged: [], content: { innerHTML: '' } };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Promise, Date, Math, JSON, Set, Map, Error, Object, Array, String, Number, Intl,
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0,
    currentPage: 'daily_ramp',
    TmsWeek, WN5L, getLinkedId, getLinkId: v => getLinkedId(v), resolveClientStr, escapeHtml: global.escapeHtml,
    TABLES: { RAMP: 'tblRAMP', ORDER_STOPS: 'tblSTOPS', ORDERS: 'tblO', NAT_LOADS: 'tblNL', NAT_ORDERS: 'tblNO' },
    F: { STOP_DATETIME: 'Stop DateTime', STOP_PARENT_ORDER: 'Parent Order', STOP_PARENT_NL: 'Parent NL', STOP_TYPE: 'Stop Type', STOP_NUMBER: 'Stop Number',
      STOP_LOCATION: 'Location', STOP_PALLETS: 'Pallets', STOP_CLIENT: 'Client', STOP_GOODS: 'Goods', STOP_TEMP: 'Temp', STOP_REF: 'Ref', STOP_NOTES: 'Notes', VEROIA_LOC: 'recJucKOhC1zh4IP3', CL_ANODOS: 'ΑΝΟΔΟΣ' },
    localToday: () => D, localTomorrow: () => '2026-11-03',
    toLocalDate: raw => (raw ? String(raw).slice(0, 10) : ''),
    showLoading: () => '', showEmpty: o2 => '<div class="empty">' + o2.title + '</div>', icon: () => '',
    preloadReferenceData: async () => {}, getRefTrucks: () => [{ id: 'recT', fields: { Active: true, 'License Plate': 'X' } }], getRefDrivers: () => [],
    getRefLocations: () => [], getRefClients: () => [{ id: 'recC', fields: { 'Company Name': 'C' } }],
    getTruckPlate: () => '', getDriverName: () => '',
    can: () => 'full', toast: () => {}, showErrorToast: () => {}, reportError: () => {}, _tmsLog: () => {},
    logError: (e, where) => S.logged.push(where + ' | ' + (e && e.message)),
    atGetAll: async (table) => { S.calls.push('facade ' + table); return table === 'tblRAMP' ? JSON.parse(JSON.stringify(LEGACY)) : []; },
    atCreate: async (t, f) => { S.writes.push(['create', t, f]); return { id: 'recNEW' }; },
    atSafePatch: async (t, id, f) => { S.writes.push(['patch', t, id, f]); return { id, fields: f }; },
    PlanApi: { isDesigned: e => !!e && ['forbidden', 'refused', 'conflict', 'closed'].includes(e.kind) },
    planFetch: async (m, p) => {
      S.calls.push(m + ' ' + p);
      if (p === '/plan/config') {
        if (o.config === 'before') throw Object.assign(new Error('no route'), { status: 404, code: 'no_route', kind: 'not_found' });
        if (o.config instanceof Error) throw o.config;
        return { cutover_day: o.config === 'before-null' ? null : '2026-10-31', opened_at: null, writes_open: o.config !== 'before-null' };
      }
      if (p.startsWith('/plan/board')) { if (o.board instanceof Error) throw o.board; return JSON.parse(JSON.stringify(o.board)); }
      throw new Error('unexpected ' + p);
    },
    document: { getElementById: id => (id === 'content' ? S.content : null), querySelectorAll: () => [], querySelector: () => null, activeElement: null },
  };
  if (o.ids !== 'none') ctx.PlanIds = { load: async () => ({ ok: o.ids.ok }), hub: () => o.ids.hub };
  ctx.window = ctx;
  vm.createContext(ctx);
  if (o.config !== 'none') vm.runInContext(CFG_SRC, ctx);
  vm.runInContext(o.src, ctx);
  return { ctx, S };
}
const section = (html, cls) => { const a = html.indexOf(`ramp-sec-hd ${cls}`); const b = html.indexOf('</table>', a); return a < 0 ? '' : html.slice(a, b); };
const kpi = (html, label) => { const a = html.indexOf(label); return a < 0 ? '' : html.slice(a, html.indexOf('</div></div>', a)); };

// ── before L: today's page ─────────────────────────────────────────────────────────────────────
test('before L (404 no_route): no /plan/board, no v5 line, no strip, nothing written', async () => {
  const { ctx, S } = load({ config: 'before' });
  await ctx.renderDailyRamp();
  const html = S.content.innerHTML;
  assert.deepStrictEqual(S.calls.filter(c => c.includes('/plan/')), ['GET /plan/config']);
  assert.ok(!/v5/.test(html), 'no v5 word on the page');
  assert.ok(html.includes('Πελάτης Δ'), 'the legacy line is there');
  assert.deepStrictEqual(S.writes, []);
  assert.deepStrictEqual(S.logged, []);
});

test('before L (cutover_day null): same — the base says no L', async () => {
  const { ctx, S } = load({ config: 'before-null' });
  await ctx.renderDailyRamp();
  assert.deepStrictEqual(S.calls.filter(c => c.includes('/plan/')), ['GET /plan/config']);
  assert.ok(!/v5/.test(S.content.innerHTML));
});

test('before L the page is byte-for-byte the page of origin/main (flag off = today)', async (t) => {
  let main;
  try { main = execSync('git show origin/main:modules/daily_ramp.js', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (_) { return t.skip('origin/main not reachable'); }
  const a = load({ config: 'before' }), b = load({ config: 'before', src: main });
  await a.ctx.renderDailyRamp(); await b.ctx.renderDailyRamp();
  assert.strictEqual(a.S.content.innerHTML, b.S.content.innerHTML);
  assert.deepStrictEqual(a.S.calls.filter(c => c.startsWith('facade')), b.S.calls.filter(c => c.startsWith('facade')));
});

// ── after L ────────────────────────────────────────────────────────────────────────────────────
test('after L: hub lines of the day in ΕΙΣΕΡΧΟΜΕΝΑ / ΕΞΕΡΧΟΜΕΝΑ, one board read, nothing written to RAMP', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyRamp();
  const html = S.content.innerHTML;
  assert.deepStrictEqual(S.calls.filter(c => c.includes('/plan/')), ['GET /plan/config', 'GET /plan/board?week=' + WEEK]);
  assert.deepStrictEqual(S.writes, [], 'a v5 line is never a RAMP row');
  assert.deepStrictEqual(S.logged, []);
  const inb = section(html, 'inbound'), out = section(html, 'outbound');
  // in: legacy 20 + cycle unload at the hub from Κατερίνη 6 + export piece with no truck 5
  assert.ok(inb.includes('Πελάτης Δ') && inb.includes('Πελάτης Χ') && inb.includes('Πελάτης Κ'), inb);
  assert.ok(inb.includes('Κατερίνη'), 'the unload line says where it loaded');
  assert.strictEqual((inb.match(/<tr class/g) || []).length, 3);
  // out: the cycle loading at the hub (two pieces, two destinations) + the import piece with no truck
  assert.ok(out.includes('Πελάτης Ε / Πελάτης Ν') && out.includes('Θεσσαλονίκη / Λάρισα') && out.includes('>14.5<'), out);
  assert.ok(out.includes('Πελάτης Η') && out.includes('>8<'));
  assert.strictEqual((out.match(/<tr class/g) || []).length, 2);
  // never on D: the next day's partner cycle, the stock piece, tomorrow's pieces, a national that does not touch Veroia
  for (const n of ['Πελάτης Ζ', 'Πελάτης Θ', 'Πελάτης Ι', 'Πελάτης Λ', 'Πελάτης Μ', 'Συνεργάτης Β']) assert.ok(!html.includes(n), n);
  assert.match(kpi(html, 'Εισερχόμενα σήμερα'), />\+31</);
  assert.match(kpi(html, 'Εξερχόμενα σήμερα'), />-22.5</);
});

test('after L: a v5 line is read-only — no time picker, no Φορτώθηκε / Αναβολή, says where it changes', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyRamp();
  const out = section(S.content.innerHTML, 'outbound');
  assert.ok(!/_rampDone|_rampPostpone|_rampSvTime/.test(out), 'no write control on v5 lines');
  assert.ok(out.includes('<span>08:00</span>'), 'the stop window start, Athens time (06:00Z, UTC+2 after 25/10)');
  assert.ok(out.includes('v5 · Εβδομαδιαίο Εθνικών') && out.includes('v5 · προς ανάθεση'));
  assert.ok(out.includes('ΑΒΓ-1001'), 'the cycle truck by name');
  const inb = section(S.content.innerHTML, 'inbound');
  assert.ok(/_rampDone\('recRAMP00000001'/.test(inb), 'the legacy line keeps its buttons');
  const tl = section(S.content.innerHTML, 'timeline');
  assert.ok(tl.includes('Οδηγός Α') && tl.includes('Προς ανάθεση (v5)') && tl.includes('Προγραμματισμένο (v5)'));
});

test('after L: an executed hub stop (v5 rule: its day passed) shows ✓ Εκτελέστηκε (v5) and counts in Πρόοδος', async () => {
  const b = board(); b.cycles[0].stops[0].executed = true;
  const { ctx, S } = load({ board: b });
  await ctx.renderDailyRamp();
  const html = S.content.innerHTML;
  assert.ok(section(html, 'outbound').includes('✓ Εκτελέστηκε (v5)'));
  assert.match(kpi(html, 'Πρόοδος'), /1\/5/);
});

test('after L: a partner cycle shows the partner in the truck column', async () => {
  const b = board(); b.cycles[1].stops[0].stop_day = D;
  const { ctx, S } = load({ board: b });
  await ctx.renderDailyRamp();
  assert.ok(section(S.content.innerHTML, 'outbound').includes('Συνεργάτης Β'));
});

test('after L: names from the base are escaped', async () => {
  const b = board(); b.hub[0].client = '<img src=x onerror=alert(1)>&Co';
  const { ctx, S } = load({ board: b });
  await ctx.renderDailyRamp();
  assert.ok(!S.content.innerHTML.includes('<img src=x'));
  assert.ok(S.content.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;&amp;Co'));
});

test('after L: without the catalogue the hub comes from the board\'s own VS (WN5L.hubFromBoard) — same lines', async () => {
  const a = load(), b = load({ ids: { ok: false, hub: null } });
  await a.ctx.renderDailyRamp(); await b.ctx.renderDailyRamp();
  assert.strictEqual(section(b.S.content.innerHTML, 'outbound'), section(a.S.content.innerHTML, 'outbound'));
  assert.strictEqual(section(b.S.content.innerHTML, 'inbound'), section(a.S.content.innerHTML, 'inbound'));
});

// ── failures are heard ─────────────────────────────────────────────────────────────────────────
test('after L, board read fails: red strip with Ξαναδοκίμασε, legacy lines stay, no v5 line, never «καμία κίνηση» silently', async () => {
  const { ctx, S } = load({ board: Object.assign(new Error('500'), { kind: 'server' }) });
  await ctx.renderDailyRamp();
  const html = S.content.innerHTML;
  assert.ok(html.includes('Οι εθνικές κινήσεις v5 δεν διαβάστηκαν') && html.includes('Ξαναδοκίμασε'));
  assert.ok(html.includes('Πελάτης Δ'));
  assert.ok(!html.includes('Πελάτης Ε'));
});

test('after L, a board of another week / wrong shape: red strip, logged once even across refreshes', async () => {
  const { ctx, S } = load({ board: board({ week: '2026-10-24' }) });
  await ctx.renderDailyRamp(); await ctx.renderDailyRamp();
  assert.ok(S.content.innerHTML.includes('Οι εθνικές κινήσεις v5 δεν διαβάστηκαν'));
  assert.strictEqual(S.logged.filter(l => l.startsWith('daily_ramp v5: board shape')).length, 1);
});

test('after L, hub unknown (no catalogue, no VS in the week) with hub stops: red strip, logged — never a silent empty ramp', async () => {
  const b = board(); b.cycles = [b.cycles[0]]; for (const s of b.cycles[0].stops) for (const l of s.legs) l.kind = 'national';
  b.waiting = b.waiting.map(w => Object.assign(w, { kind: 'national' })); b.hub = [];
  const { ctx, S } = load({ board: b, ids: { ok: false, hub: null } });
  await ctx.renderDailyRamp();
  assert.ok(S.content.innerHTML.includes('Οι εθνικές κινήσεις v5 δεν διαβάστηκαν'));
  assert.ok(S.logged.some(l => l.startsWith('daily_ramp v5: hub')));
});

test('unknown (plan-config.js not loaded): reads the board, shows the lines AND the amber strip, logs once', async () => {
  const { ctx, S } = load({ config: 'none' });
  await ctx.renderDailyRamp(); await ctx.renderDailyRamp();
  const html = S.content.innerHTML;
  assert.ok(html.includes('Η κατάσταση μετάβασης εθνικών (v5) δεν διαβάστηκε'));
  assert.ok(section(html, 'outbound').includes('Πελάτης Η'));
  assert.strictEqual(S.logged.filter(l => l.startsWith('daily_ramp v5: PlanConfig')).length, 1);
});

test('unknown (/plan/config 500): never silently «before» — reads the board, amber strip', async () => {
  const { ctx, S } = load({ config: Object.assign(new Error('500'), { status: 500, kind: 'server' }) });
  await ctx.renderDailyRamp();
  assert.ok(S.calls.includes('GET /plan/board?week=' + WEEK));
  assert.ok(S.content.innerHTML.includes('Η κατάσταση μετάβασης εθνικών (v5) δεν διαβάστηκε'));
});

test('unknown before L in reality (board empty): amber strip only, no v5 line, no hub error', async () => {
  const { ctx, S } = load({ config: 'none', board: board({ cycles: [], waiting: [], hub: [] }), ids: { ok: false, hub: null } });
  await ctx.renderDailyRamp();
  const html = S.content.innerHTML;
  assert.ok(!html.includes('Οι εθνικές κινήσεις v5 δεν διαβάστηκαν'));
  assert.ok(!/v5 ·/.test(html));
});

test('CSV export carries the v5 lines with truck and driver names', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyRamp();
  let blobText = '';
  ctx.Blob = function (parts) { blobText = parts.join(''); };
  ctx.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  ctx.document.createElement = () => ({ click() {} });
  ctx.csvSafeCell = c => c;
  ctx._rampExportCSV();
  assert.ok(blobText.includes('"ΑΒΓ-1001"') && blobText.includes('"Οδηγός Α"') && blobText.includes('Θεσσαλονίκη / Λάρισα'), blobText);
});
