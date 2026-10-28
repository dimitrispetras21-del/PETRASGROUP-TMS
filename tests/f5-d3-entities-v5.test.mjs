// node --test tests/f5-d3-entities-v5.test.mjs
// National v5 F5, stream (d3), Ε12 + Ε13: the master-data cards and Locations read the v5 half after day L
// (plan docs/superpowers/plans/2026-10-28-f5-national-v5-cutover.md §10 d3; read spec: GET /plan/activity and
// the 072b segments). The REAL core/entity.js and modules/locations.js run in a vm with the network
// stubbed. Every «before» case is held byte for byte to the origin/main copy of the same file (flag off = today).
// NO-GO: on origin/main the v5 cases fail (the readers do not exist there).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// The baseline = what production runs today. D3_BASE_REF lets the NO-GO run point both sides at the old tip.
const BASE_REF = process.env.D3_BASE_REF || 'origin/main';
const BASE = (f) => execFileSync('git', ['show', `${BASE_REF}:${f}`], { cwd: ROOT, encoding: 'utf8' });

// ── Fixture (ids only: public repo) ────────────────────────────────────────
const TODAY = new Date();
const YM = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}`;
const LOOKUPS = {
  locations: [{ id: 11, legacy_id: 'recLoc1', name: 'Loc 1' }, { id: 12, legacy_id: 'recLoc2', name: 'Loc 2' }],
  clients: [{ id: 21, legacy_id: 'recCl1', company_name: 'Client 21' }],
  trucks: [{ id: 3, legacy_id: 'recTr3', license_plate: 'TRK-3' }, { id: 4, legacy_id: 'recTr4', license_plate: 'TRK-4' }],
  trailers: [{ id: 5, legacy_id: 'recTl5', license_plate: 'TRL-5' }],
  drivers: [{ id: 7, legacy_id: 'recDr7', full_name: 'Driver 7' }],
  partners: [{ id: 31, legacy_id: 'recPa31', company_name: 'Partner 31' }, { id: 32, legacy_id: 'recPa32', company_name: 'Partner 32' }],
};
const PA = [
  { id: 'recPA1', fields: { Partner: ['recPa31'], Status: 'Delivered', 'Partner Rate': 100, 'Assignment Date': '2026-09-01T08:00:00', Order: ['recO1'] } },
  { id: 'recPA2', fields: { Partner: ['recPa32'], Status: 'Assigned', 'Partner Rate': 50, 'Assignment Date': `${YM}-02` } },
];
const ACT_PARTNERS = { cycles: [
  { rt_id: 901, code: 'RT-901', status: 'planned', ended: false, start_at: `${YM}-03T06:00:00Z`, partner_id: 32,
    segs: [{ from_at: `${YM}-03T06:00:00Z`, to_at: `${YM}-03T18:00:00Z`, trip_type: 'PARTNER', first: true, partner_id: 32, partner_rate: 400 }] },
  { rt_id: 902, code: 'RT-902', status: 'cancelled', ended: false, start_at: `${YM}-04T06:00:00Z`, partner_id: 31,
    segs: [{ from_at: `${YM}-04T06:00:00Z`, to_at: `${YM}-04T18:00:00Z`, trip_type: 'PARTNER', first: true, partner_id: 31, partner_rate: 999 }] },
], truncated: false };
const NAT_ORDERS = [
  { id: 'recNOold', fields: { Client: ['recCl1'], Status: 'Pending', Price: 10, 'Loading DateTime': '2026-09-02', 'Order No': 1 } },
  { id: 'recNOv5a', fields: { Client: ['recCl1'], Price: 20, 'Loading DateTime': `${YM}-05`, 'Order No': 2 } },
  { id: 'recNOv5b', fields: { Client: ['recCl1'], Price: 30, 'Loading DateTime': `${YM}-06`, 'Order No': 3 } },
];
const RT_LIST = { records: [{ id: 801, model: 1, status: 'closed', date_start: '2026-09-10', date_end: '2026-09-12', driver_id: 7, truck_id: 3, route_text: 'A → B' }] };
const ACT_DRIVER = { cycles: [
  { rt_id: 801, code: 'RT-801', status: 'planned', ended: true, start_at: '2026-09-10T06:00:00Z', segs: [] },   // already in /costs/rt
  { rt_id: 903, code: 'RT-903', status: 'planned', ended: true, start_at: '2026-10-20T06:00:00Z', end_at: '2026-10-22T18:00:00Z', route_text: 'Hub → X',
    segs: [{ from_at: '2026-10-21T06:00:00Z', to_at: '2026-10-22T18:00:00Z', trip_type: 'OWNED', first: false, truck_id: 4, driver_id: 7 }] },
], truncated: false };
const ACT_LOC = {
  stops: [
    { stop_id: 1, rt_id: 904, code: 'RT-904', side: 'KATHODOS', planned_from: '2026-11-02T07:00:00Z', planned_to: '2026-11-02T09:00:00Z', executed: false, rt_status: 'planned',
      carrier: { trip_type: 'OWNED', truck_id: 3, partner_id: null },
      loads: [{ act: 'drop', shipment_id: 61, kind: 'national', nat_order_id: 2, reference: 'REF-A', client_id: 21, pallets: 6 }] },
    { stop_id: 2, rt_id: 905, code: 'RT-905', side: 'ANODOS', planned_from: '2026-11-03T07:00:00Z', planned_to: '2026-11-03T09:00:00Z', executed: false, rt_status: 'cancelled',
      carrier: { trip_type: 'OWNED', truck_id: 3 }, loads: [{ act: 'pickup', shipment_id: 62, kind: 'national', reference: 'REF-X', client_id: 21, pallets: 2 }] },
  ],
  shipments: [
    { shipment_id: 61, nat_order_id: 2, reference: 'REF-A', client_id: 21, pallets: 6, end: 'dest', day: '2026-11-02' },
    { shipment_id: 63, nat_order_id: 3, reference: 'REF-B', client_id: 21, pallets: 4, end: 'origin', day: '2026-11-04' },
  ],
  truncated: false,
};
const ACT_LOC_ALL = { sides: [{ location_id: 12, kathodos: 0, anodos: 2 }] };
const OLD_STOPS = [{ id: 'recS1', fields: { Location: ['recLoc1'], 'Parent Order': ['recO1'], 'Stop Type': 'Loading', DateTime: '2026-09-01T08:00:00', Pallets: 10 } }];

// ── Sandbox ────────────────────────────────────────────────────────────────
function el(id) {
  return { id, innerHTML: '', className: '', classList: { add() {}, remove() {} },
    insertAdjacentHTML(_p, h) { this.innerHTML += h; }, append() {}, addEventListener() {} };
}
// planConfig: 'before' | 'after' | 'unknown' | 'none' (no PlanConfig: today's app.html)
// plan: { [routePrefix]: body | {status, code} }
function sandbox({ files, planConfig, plan = {} }) {
  const els = new Map();
  const getEl = (id) => { if (!els.has(id)) els.set(id, el(id)); return els.get(id); };
  const calls = [], logged = [], toasts = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    document: { getElementById: getEl, createElement: () => el(''), body: { append() {} }, querySelector: () => null, querySelectorAll: () => [] },
    window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    TABLES: { PARTNER_ASSIGN: 'tblPA', ORDERS: 'tblO', NAT_ORDERS: 'tblNO', ORDER_STOPS: 'tblOS', NAT_LOADS: 'tblNL', LOCATIONS: 'tblL' },
    F: { PA_PARTNER: 'Partner', PA_ORDER: 'Order', PA_ASSIGN_DATE: 'Assignment Date', PA_STATUS: 'Status', PA_RATE: 'Partner Rate' },
    __calls: calls, __logged: logged, __toasts: toasts, __plan: plan,
  };
  vm.createContext(ctx);
  for (const [f, src] of files) vm.runInContext(src, ctx, { filename: f });
  vm.runInContext(`
    toLocalDate = ${SRC('core/utils.js').match(/function toLocalDate\(raw\) \{[\s\S]*?\n\}/)[0]};
    fmtDateDM = (d) => { if (!d) return '—'; const p = d.substring(0, 10).split('-'); return p[2] + '/' + p[1]; };
    getLinkedId = (v) => !v ? null : Array.isArray(v) ? (v[0] && v[0].id) || v[0] || null : typeof v === 'string' ? v : null;
    getRefClients = () => []; getRefTrucks = () => [];
    getLocationName = (id) => id ? 'Place ' + id : '';
    countryName = (v) => v;
    can = () => 'full';
    toast = (m) => { __toasts.push(m); };
    logError = (e, c) => { __logged.push(c + ': ' + (e && e.message)); };
    rtLegBlockHtml = () => '<legs>';
    atGetAll = async (t) => ({ tblPA: ${JSON.stringify(PA)}, tblO: [], tblNO: ${JSON.stringify(NAT_ORDERS)},
      tblOS: ${JSON.stringify(OLD_STOPS)} })[t] || [];
    atGet = async (t) => t === 'tblO' ? [{ id: 'recO1', fields: { Direction: 'Export', Reference: 'O1' } }] : [];
    paListByPartner = async (rec) => ${JSON.stringify(PA)}.filter(r => r.fields.Partner[0] === rec);
    ctFetch = async (p) => {
      __calls.push(p);
      if (p === '/costs/lookups') return ${JSON.stringify({ drivers: LOOKUPS.drivers, trucks: LOOKUPS.trucks, trailers: LOOKUPS.trailers })};
      if (p.startsWith('/costs/rt')) return ${JSON.stringify(RT_LIST)};
      throw new Error('unexpected ' + p);
    };
    fetch = async () => ({ ok: false, json: async () => ({}) });   // /pallets/gate: not part of these cases
    PROXY_URL = '';
    PlanApi = { isDesigned: (e) => !!e && e.kind === 'forbidden' };
    class PlanError extends Error { constructor(f) { super(f.message); Object.assign(this, f); this.name = 'PlanError'; } }
    planFetch = async (m, p) => {
      __calls.push(p);
      const key = Object.keys(__plan).find(k => p.startsWith(k));
      const v = key === undefined ? { status: 404, code: 'no_route' } : __plan[key];
      if (v && v.status) throw new PlanError({ message: v.code, status: v.status, code: v.code, kind: v.status === 404 ? 'client' : 'failed' });
      return JSON.parse(JSON.stringify(v));
    };
    PlanIds = (() => {
      let data = null;
      const LISTS = { location: 'locations', client: 'clients', truck: 'trucks', trailer: 'trailers', driver: 'drivers', partner: 'partners' };
      const LABEL = { location: x => x.name, client: x => x.company_name, truck: x => x.license_plate, trailer: x => x.license_plate, driver: x => x.full_name, partner: x => x.company_name };
      return {
        async load() { try { data = await planFetch('GET', '/plan/lookups'); return { ok: true }; } catch (e) { return { ok: false, err: e }; } },
        id(k, rec) { const h = data[LISTS[k]].find(x => x.legacy_id === rec); if (!h) throw new PlanError({ message: 'missing', code: 'ids_missing' }); return h.id; },
        list(k) { return data[LISTS[k]].map(x => ({ id: x.id, legacy_id: x.legacy_id, label: LABEL[k](x) })); },
      };
    })();
  `, ctx);
  if (planConfig !== 'none') {
    vm.runInContext(`PlanConfig = { load: async () => { __calls.push('/plan/config'); return { state: ${JSON.stringify(planConfig)} }; } };`, ctx);
  }
  return { ctx, calls, logged, toasts, els, html: (id) => (els.get(id) || {}).innerHTML, run: (c) => vm.runInContext(c, ctx) };
}
const NEW_E = () => [['core/entity.js', SRC('core/entity.js')]];
const OLD_E = () => [['core/entity.js', BASE('core/entity.js')]];
const NEW_L = () => [['core/entity.js', SRC('core/entity.js')], ['modules/locations.js', SRC('modules/locations.js')]];
const OLD_L = () => [['core/entity.js', BASE('core/entity.js')], ['modules/locations.js', BASE('modules/locations.js')]];
const PLAN_ALL = {
  '/plan/lookups': LOOKUPS,
  '/plan/activity?partner_id=32': { cycles: [ACT_PARTNERS.cycles[0]], truncated: false },
  '/plan/activity?driver_id=7': ACT_DRIVER,
  '/plan/activity?location_id=all': ACT_LOC_ALL,
  '/plan/activity?location_id=11': ACT_LOC,
};
// the failing prefix first: the stub answers with the first key the path starts with
const FAIL = (route) => Object.assign({ [route]: { status: 500, code: 'plan_failed' } }, PLAN_ALL, { [route]: { status: 500, code: 'plan_failed' } });

// Each screen as the app calls it; returns the html the user sees.
const SCREENS = {
  // the client card is not changed (a v5 national order already carries client, places, price): held to today
  clientCard: async (s) => { await s.run(`_loadEntityCardActivity('clients', { id: 'recCl1', fields: {} })`); return s.html('ec_recCl1_act') + '|' + s.html('ec_recCl1_recent'); },
  partnerCard: async (s) => { await s.run(`_loadEntityCardActivity('partners', { id: 'recPa32', fields: {} })`); return s.html('ec_recPa32_act') + '|' + s.html('ec_recPa32_recent'); },
  driverCard: async (s) => { await s.run(`_loadEntityCardRT('drivers', { id: 'recDr7', fields: {} })`); return s.html('ec_recDr7_rt') + '|' + s.html('ec_recDr7_agg'); },
  locCard: async (s) => {
    await s.run(`LOC.records = [{ id: 'recLoc1', fields: { Name: 'Loc 1', City: 'X', Country: 'GR' } }]; _locOpenCard('recLoc1')`);
    return s.html('loccPanel');
  },
  moveIdx: async (s) => {
    await s.run(`_locBuildMoveIdx()`);
    return s.run(`JSON.stringify(LOC.moveIdx ? [...LOC.moveIdx].map(([k, v]) => [k, [...v].sort()]) : null)`) + '|' + s.toasts.join(';');
  },
};
const FILES = { clientCard: [NEW_E, OLD_E], partnerCard: [NEW_E, OLD_E], driverCard: [NEW_E, OLD_E], locCard: [NEW_L, OLD_L], moveIdx: [NEW_L, OLD_L] };

// ── Flag off = today ───────────────────────────────────────────────────────
for (const name of Object.keys(SCREENS)) {
  test(`${name}: PlanConfig 'before' → the same html as ${BASE_REF}, and no /plan call but /plan/config`, async () => {
    const [nf, of] = FILES[name];
    const a = sandbox({ files: nf(), planConfig: 'before', plan: PLAN_ALL });
    const b = sandbox({ files: of(), planConfig: 'before', plan: PLAN_ALL });
    assert.strictEqual(await SCREENS[name](a), await SCREENS[name](b));
    assert.deepStrictEqual(a.calls.filter(c => c.startsWith('/plan/') && c !== '/plan/config'), []);
    assert.deepStrictEqual(a.logged, b.logged);
  });
  test(`${name}: no PlanConfig (today's app.html) + Worker without the routes (404 no_route) → the same html, nothing logged`, async () => {
    const [nf, of] = FILES[name];
    const a = sandbox({ files: nf(), planConfig: 'none', plan: {} });
    const b = sandbox({ files: of(), planConfig: 'none', plan: {} });
    assert.strictEqual(await SCREENS[name](a), await SCREENS[name](b));
    assert.deepStrictEqual(a.logged, b.logged);
  });
}

// ── After day L: the v5 half is read and counted ───────────────────────────
test('Ε13 client card after L: a v5 national order (client, places, price, no Status) already counts — no /plan call, same html as today', async () => {
  const a = sandbox({ files: NEW_E(), planConfig: 'after', plan: PLAN_ALL });
  const b = sandbox({ files: OLD_E(), planConfig: 'after', plan: PLAN_ALL });
  const h = await SCREENS.clientCard(a);
  assert.strictEqual(h, await SCREENS.clientCard(b));
  assert.match(h, /ecard-usage-num">3<\/span><span class="ecard-usage-lbl">παραγγελίες/);
  assert.match(h, /€60<\/span><span class="ecard-usage-lbl">τζίρος/);
  assert.deepStrictEqual(a.calls.filter(c => c.startsWith('/plan/')), []);
});
test('Ε12 partner card after L: the v5 cycle is a «NAT» row (RT code in the title only) and counts', async () => {
  const s = sandbox({ files: NEW_E(), planConfig: 'after', plan: PLAN_ALL });
  const h = await SCREENS.partnerCard(s);
  assert.match(h, /ecard-usage-num">2<\/span><span class="ecard-usage-lbl">αναθέσεις/);
  assert.match(h, /ecard-usage-num">2<\/span><span class="ecard-usage-lbl">ενεργές/);
  assert.match(h, /€450<\/span><span class="ecard-usage-lbl">τζίρος/);
  assert.match(h, /<div class="ecard-row" title="RT-901">\s*<span class="ecard-row-code">NAT/);
  assert.doesNotMatch(h.replace(/title="[^"]*"/g, ''), /RT-901/);
});
test('072b driver card after L: a cycle joined by a handover is listed; a v5 cycle that ended reads «ολοκληρωμένο»', async () => {
  const s = sandbox({ files: NEW_E(), planConfig: 'after', plan: PLAN_ALL });
  const h = await SCREENS.driverCard(s);
  assert.match(h, /title="RT-903"[\s\S]*ολοκληρωμένο[\s\S]*Hub → X[\s\S]*title="RT-801"/);   // newest first
  assert.match(h, /TRK-4<\/span>\s*<span class="ecard-agg-n">1 round trip/);
  assert.strictEqual((h.match(/title="RT-801"/g) || []).length, 1, 'a cycle /costs/rt already has is not doubled');
});
test('072b driver card: the segments read fails → today\'s list stays, plus a visible line', async () => {
  const s = sandbox({ files: NEW_E(), planConfig: 'after', plan: FAIL('/plan/activity?driver_id=') });
  const h = await SCREENS.driverCard(s);
  assert.match(h, /title="RT-801"/);
  assert.match(h, /ecard-fail v5-warn/);
});
test('Ε12 partner card after L with the route missing (404) = a fault, said on screen; today\'s rows stay', async () => {
  const p = Object.assign({}, PLAN_ALL); delete p['/plan/activity?partner_id=32'];
  const s = sandbox({ files: NEW_E(), planConfig: 'after', plan: p });
  const h = await SCREENS.partnerCard(s);
  assert.match(h, /ecard-fail v5-warn" role="alert">⚠ Τα εθνικά v5 δεν διαβάστηκαν/);
  assert.match(h, /ecard-usage-num">1<\/span><span class="ecard-usage-lbl">ανάθεση/);
});
test('Ε13 location card after L: v5 stops and a shipment still to assign join the history; cancelled cycle out; chips', async () => {
  const s = sandbox({ files: NEW_L(), planConfig: 'after', plan: PLAN_ALL });
  const h = await SCREENS.locCard(s);
  assert.match(h, /Ιστορικό <span class="n">· 3 κινήσεις/);           // 1 old + 1 v5 stop + 1 shipment to assign
  assert.match(h, /ΚΑΘΟΔΟΣ 1×/);
  assert.doesNotMatch(h, /ΑΝΟΔΟΣ/);                                   // the cancelled cycle's stop
  assert.match(h, /04\/11\/26[\s\S]*ΦΟΡΤΩΣΗ[\s\S]*Client 21[\s\S]*4 pal[\s\S]*REF-B · — προς ανάθεση/);
  assert.match(h, /title="RT-904"[\s\S]*02\/11\/26[\s\S]*ΠΑΡΑΔΟΣΗ[\s\S]*6 pal[\s\S]*REF-A · TRK-3/);
  assert.strictEqual((h.match(/REF-A/g) || []).length, 1, 'a shipment shown at its stop is not shown again as «to assign»');
  assert.ok(h.indexOf('04/11/26') < h.indexOf('02/11/26') && h.indexOf('02/11/26') < h.indexOf('01/09/26'), 'newest first');
});
test('Ε13 location card: v5 read fails → never «Καμία κίνηση», an alert with a retry', async () => {
  const s = sandbox({ files: NEW_L(), planConfig: 'after', plan: FAIL('/plan/activity?location_id=11') });
  const h = await SCREENS.locCard(s);
  assert.match(h, /locc-note" role="alert">⚠ Τα εθνικά v5 δεν διαβάστηκαν/);
  assert.match(h, /1 κίνηση/);
  const s2 = sandbox({ files: NEW_L(), planConfig: 'unknown', plan: FAIL('/plan/activity?location_id=11') });
  await s2.run(`atGetAll = async () => []`);
  const h2 = await SCREENS.locCard(s2);
  assert.doesNotMatch(h2, /Καμία κίνηση/);
  assert.match(h2, /Κατάσταση μετάβασης άγνωστη/);
});
test('Ε13 move filter after L: a place with v5 stops only is found under ΑΝΟΔΟΣ', async () => {
  const s = sandbox({ files: NEW_L(), planConfig: 'after', plan: PLAN_ALL });
  const out = await SCREENS.moveIdx(s);
  assert.match(out, /\["recLoc2",\["ΑΝΟΔΟΣ"\]\]/);
});
test('Ε13 move filter: v5 read fails → the filter is cleared and said, never a filter that silently drops places', async () => {
  const s = sandbox({ files: NEW_L(), planConfig: 'after', plan: FAIL('/plan/activity?location_id=all') });
  const out = await SCREENS.moveIdx(s);
  assert.match(out, /^null\|Δεν φορτώθηκε ο δείκτης/);
});

// ── Review fixes (code review high, 28/10) ─────────────────────────────────
test('a record newer than the session catalogue (ids_missing) → «ανανέωσε τη σελίδα», not a retry that cannot help; logged once', async () => {
  const lk = JSON.parse(JSON.stringify(LOOKUPS)); lk.locations = lk.locations.filter(x => x.legacy_id !== 'recLoc1');
  const s = sandbox({ files: NEW_L(), planConfig: 'after', plan: Object.assign({}, PLAN_ALL, { '/plan/lookups': lk }) });
  const h = await SCREENS.locCard(s);
  assert.match(h, /νεότερη από τον κατάλογο της σελίδας — ανανέωσε τη σελίδα/);
  assert.strictEqual(s.logged.filter(x => /_locOpenCard v5/.test(x)).length, 1);
});
test('driver card: the segments read fails → the «Με ποια φορτηγά» bars say it too', async () => {
  const s = sandbox({ files: NEW_E(), planConfig: 'after', plan: FAIL('/plan/activity?driver_id=') });
  await SCREENS.driverCard(s);
  assert.match(s.html('ec_recDr7_agg'), /ecard-fail v5-warn/);
});
test('move filter: a listed place missing from the catalogue (catalogue behind) → the filter is cleared and said', async () => {
  const p = Object.assign({}, PLAN_ALL, { '/plan/activity?location_id=all': { sides: [{ location_id: 99, kathodos: 1, anodos: 0 }] } });
  const s = sandbox({ files: NEW_L(), planConfig: 'after', plan: p });
  await s.run(`LOC.records = [{ id: 'recLoc1', fields: {} }, { id: 'recLocNew', fields: {} }]`);
  assert.match(await SCREENS.moveIdx(s), /^null\|Δεν φορτώθηκε ο δείκτης/);
});
test('move filter: a v5 place not on the list (soft-deleted) is skipped — the filter keeps working', async () => {
  const p = Object.assign({}, PLAN_ALL, { '/plan/activity?location_id=all': { sides: [{ location_id: 99, kathodos: 1, anodos: 0 }, { location_id: 12, kathodos: 0, anodos: 1 }] } });
  const s = sandbox({ files: NEW_L(), planConfig: 'after', plan: p });
  await s.run(`LOC.records = [{ id: 'recLoc1', fields: {} }, { id: 'recLoc2', fields: {} }]`);
  assert.match(await SCREENS.moveIdx(s), /\["recLoc2",\["ΑΝΟΔΟΣ"\]\]/);
});
test('a broken PlanConfig (throws) = unknown: today\'s half still renders', async () => {
  const s = sandbox({ files: NEW_E(), planConfig: 'after', plan: PLAN_ALL });
  await s.run(`PlanConfig = { load: async () => { throw new Error('boom'); } }`);
  const h = await SCREENS.driverCard(s);
  assert.match(h, /title="RT-801"/);
  assert.match(h, /title="RT-903"/);
});
