// tests/pnl-paper.test.js — run: node --test tests/pnl-paper.test.js
// The two P&L papers (modules/pnl_paper.js, owner 3/11/2026, Figma 2542:7735 / 2537:7735) on invented data in the
// shape of GET /costs/pnl-paper (the repo is public: no real names). The module runs in a vm context together with
// the two files print_pnl.html loads before it (core/countries.js, modules/costs.js), as on the page:
//   - the trip paper: every category on its own row, tolls per country (MK = «Σκόπια»), the Veroia Switch charge on
//     its own row, «λείπει» where ct_v_rt_complete says so, result / margin «—» when anything is missing;
//   - the week paper: the columns, the week sums, «Λείπει σε», «Μόνο τα πλήρη»;
//   - the refusals: rows that do not add up to ct_v_rt_pnl (revenue, cost_net, cost_vat), a trip without its
//     «complete» row, a cut week → no paper, the reason named by truck and day;
//   - no code on paper («RT-»), no «0,00» for a missing amount.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console: { log() {}, warn() {}, error() {} }, Intl, Date, Math, Number, String, Object, Array, Set, Map, JSON, RegExp };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['core/countries.js', 'modules/costs.js', 'modules/pnl_paper.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const P = (name) => vm.runInContext(name, ctx);
const pnlTripModel = P('pnlTripModel'), pnlTripHtml = P('pnlTripHtml'), pnlWeekModel = P('pnlWeekModel'), pnlWeekHtml = P('pnlWeekHtml');

const LK = {
  trucks: [{ id: 1, license_plate: 'ΑΒΓ1001' }, { id: 2, license_plate: 'ΑΒΓ1002' }],
  drivers: [{ id: 11, full_name: 'Δοκιμαστής Γιώργος' }, { id: 12, full_name: 'Παράδειγμα Νίκος' }],
  partners: [{ id: 21, company_name: 'Συνεργάτης Δοκιμής ΑΕ' }]
};
const trip = (o) => ({ trip_type: 'OWNED', truck_id: 1, driver_id: 11, partner_id: null, date_start: '2026-10-17', date_end: '2026-10-22', status: 'closed',
  revenue: 0, cost_net: 0, cost_vat: 0, profit_worst: 0, margin_worst_pct: null, ...o });
// An own trip: fuel + reefer, tolls in two countries (one is MK), the driver's value and expenses, wear;
// two loads, the export with a Veroia Switch charge. Every number adds up as the database's.
function ownTrip() {
  return {
    trips: [trip({ id: 1, revenue: 5600, cost_net: 1735, cost_vat: 70, profit_worst: 3795, margin_worst_pct: 67.8 })],
    complete: [{ rt_id: 1, trip_type: 'OWNED', status: 'closed', done: true, missing: [], complete: true }],
    cost_cat: [
      { rt_id: 1, category: 'fuel', toll_country: 'BG', lines: 2, net: 600, vat: 0 },
      { rt_id: 1, category: 'reefer_fuel', toll_country: null, lines: 1, net: 100, vat: 0 },
      { rt_id: 1, category: 'tolls', toll_country: 'MK', lines: 2, net: 40, vat: 0 },
      { rt_id: 1, category: 'tolls', toll_country: 'HU', lines: 1, net: 200, vat: 54 },
      { rt_id: 1, category: 'accommodation', toll_country: null, lines: 1, net: 25, vat: 16 }
    ],
    costs: [{ rt_id: 1, lines_net: 1685, vat: 70, wear: 50, dl_trip_value: 650, dl_expenses: 70, partner_planned: 0, partner_invoiced: 0 }],
    rts: [{ id: 1, model: 1 }], partner_cost: [],
    legs: [{ id: 10, rt_id: 1, seq: 1, direction: 'EXPORT', order_id: 100, nat_load_id: null }, { id: 11, rt_id: 1, seq: 2, direction: 'IMPORT', order_id: 101, nat_load_id: null }],
    revenue_legs: [
      { rt_id: 1, source: 'leg', leg_id: 10, order_id: 100, carries_price: true, intl_price: 3200, intl_vs_charge: 100, rev_intl: 3100, rev_natl: 0, missing: false },
      { rt_id: 1, source: 'leg', leg_id: 11, order_id: 101, carries_price: true, intl_price: 2500, intl_vs_charge: 0, rev_intl: 2500, rev_natl: 0, missing: false }
    ],
    orders: [
      { id: 100, direction: 'Export', client_id: 31, loading_datetime: '2026-10-17', delivery_datetime: '2026-10-19', loading_location_1_id: 41, unloading_location_1_id: 42, loading_pallets_1: 30, loading_pallets_2: 3 },
      { id: 101, direction: 'Import', client_id: 32, loading_datetime: '2026-10-20', delivery_datetime: '2026-10-22', loading_location_1_id: 43, unloading_location_1_id: 41, loading_pallets_1: 26 }
    ],
    clients: [{ id: 31, company_name: 'Πελάτης Ένα' }, { id: 32, company_name: 'Πελάτης Δύο' }],
    locations: [{ id: 41, name: 'Αποθήκη', city: 'Βέροια' }, { id: 42, name: 'Κέντρο', city: 'Wien' }, { id: 43, name: 'Αγορά', city: 'Brno' }],
    nat_loads: [], nat_orders: [], truncated: false
  };
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('trip paper: every category on its own row, tolls per country (MK = Σκόπια), driver, wear; totals = the database', () => {
  const m = pnlTripModel(ownTrip(), LK);
  assert.strictEqual(m.ok, true, JSON.stringify(m.refused));
  assert.strictEqual(m.vehicle, 'ΑΒΓ1001 · ιδιόκτητο');
  assert.strictEqual(m.driver, 'Δοκιμαστής Γ.');
  assert.strictEqual(m.status, 'Ολοκληρώθηκε');
  const labels = m.costs.map((c) => c.label);
  for (const l of ['Καύσιμα φορτηγού', 'Καύσιμα θαλάμου', 'Διόδια', 'DKV κάρτα', 'AdBlue', 'Ferry/Τρένα', 'Διαμονή', 'Spedition', 'Πρόστιμα', 'Αναμόρφωση', 'Λοιπά',
    'Οδηγός · αξία δρομολογίου', 'Οδηγός · έξοδα', 'Φθορά οχήματος']) assert.ok(labels.includes(l), l);
  assert.ok(!labels.includes('Πάγια (Tier-2)'), 'fixed_alloc only when a trip carries it');
  const tolls = m.costs.findIndex((c) => c.label === 'Διόδια');
  assert.strictEqual(JSON.stringify(m.costs.slice(tolls + 1, tolls + 3).map((c) => [c.label, c.net])), JSON.stringify([['Ουγγαρία', 200], ['Σκόπια', 40]]));
  const t = text(pnlTripHtml(m));
  assert.match(t, /Σύνολο κοστών 1\.735,00 70,00/);
  assert.match(t, /Σύνολο εσόδων 5\.600,00/);
  assert.match(t, /Αποτέλεσμα 3\.795,00 €/);
  assert.match(t, /Περιθώριο 67,8%/);
  assert.match(t, /Χρέωση Βέροιας \(εσωτερική μεταφορά\) \(100,00\)/, 'the Veroia Switch charge on its own row, as a minus');
  assert.match(t, /Εξαγωγή · Βέροια → Wien Πελάτης Ένα 33 3\.200,00/);
  assert.ok(!/RT-\d/.test(t), 'no code on paper');
});

test('trip paper: what ct_v_rt_complete says is missing reads «λείπει», and result / margin are «—»', () => {
  const d = ownTrip();
  d.complete[0] = { ...d.complete[0], missing: ['driver', 'tolls'], complete: false };
  d.cost_cat = d.cost_cat.filter((c) => c.category !== 'tolls');
  d.costs[0] = { ...d.costs[0], dl_trip_value: null };
  d.trips[0] = { ...d.trips[0], cost_net: 1735 - 240 - 650, cost_vat: 16 };
  const m = pnlTripModel(d, LK);
  assert.strictEqual(m.ok, true, JSON.stringify(m.refused));
  assert.strictEqual(m.complete, false);
  assert.strictEqual(m.costs.find((c) => c.label === 'Διόδια').miss, true);
  assert.strictEqual(m.costs.find((c) => c.label === 'Οδηγός · αξία δρομολογίου').miss, true);
  const t = text(pnlTripHtml(m));
  assert.match(t, /Αποτέλεσμα — Περιθώριο —/);
  assert.match(t, /Λείπει: (αξία οδηγού, διόδια|διόδια, αξία οδηγού)/);
  assert.match(t, /Διόδια — λείπει/);
  assert.match(t, /Οδηγός · αξία δρομολογίου Μισθοδοσία λείπει Οδηγός · έξοδα Μισθοδοσία 70,00 Φθορά οχήματος χιλιόμετρα 50,00 Σύνολο/, 'driver / wear rows: no lines, no VAT column');
});

test('trip paper: a load without a price is «—†», never 0,00; a split order\'s second leg carries none by design (no †)', () => {
  const d = ownTrip();
  d.revenue_legs[1] = { ...d.revenue_legs[1], intl_price: null, rev_intl: 0 };
  d.revenue_legs.push({ rt_id: 1, source: 'leg', leg_id: 12, order_id: 101, carries_price: false, intl_price: null, intl_vs_charge: 0, rev_intl: 0, rev_natl: 0, missing: false });
  d.trips[0] = { ...d.trips[0], revenue: 3100 };
  d.complete[0] = { ...d.complete[0], missing: ['price'], complete: false };
  const m = pnlTripModel(d, LK);
  assert.strictEqual(m.ok, true, JSON.stringify(m.refused));
  const html = pnlTripHtml(m), t = text(html);
  assert.match(t, /Πελάτης Δύο 26 —†/);
  assert.match(t, /β΄ σκέλος · η τιμή στο α΄/);
  assert.match(t, /Σύνολο εσόδων 3\.100,00†/);
  assert.ok(!/>0,00</.test(html));
});

test('trip paper: a partner trip — the partner rate row, a partner\'s fuel / tolls / driver blank (does not apply)', () => {
  const d = {
    trips: [trip({ id: 2, trip_type: 'PARTNER', truck_id: null, driver_id: null, partner_id: 21, revenue: 3000, cost_net: 2100, cost_vat: 0, profit_worst: 900, margin_worst_pct: 30 })],
    complete: [{ rt_id: 2, trip_type: 'PARTNER', status: 'closed', done: true, missing: [], complete: true }],
    cost_cat: [], costs: [{ rt_id: 2, lines_net: 2100, vat: 0, wear: 0, dl_trip_value: null, dl_expenses: null, partner_planned: 2100, partner_invoiced: 0 }],
    rts: [{ id: 2, model: 1 }], partner_cost: [], legs: [], orders: [], clients: [], locations: [],
    revenue_legs: [{ rt_id: 2, source: 'leg', leg_id: 20, order_id: null, nat_load_id: null, carries_price: null, rev_intl: 3000, rev_natl: 0 }]
  };
  const m = pnlTripModel(d, LK);
  assert.strictEqual(m.ok, true, JSON.stringify(m.refused));
  assert.strictEqual(m.vehicle, 'Συνεργάτης Δοκιμής ΑΕ · συνεργάτης');
  const partner = m.costs.find((c) => c.label === 'Κόμιστρο συνεργάτη');
  assert.deepStrictEqual([partner.net, partner.source], [2100, 'ανάθεση']);
  assert.strictEqual(m.costs.find((c) => c.label === 'Καύσιμα φορτηγού').na, true);
  assert.ok(!m.costs.some((c) => /Οδηγός|Φθορά/.test(c.label)));
});

test('trip paper refuses: costs, VAT or loads that do not add up to the database; a trip without its «complete» row', () => {
  let d = ownTrip(); d.trips[0].cost_net = 1735.01;
  let m = pnlTripModel(d, LK);
  assert.strictEqual(m.ok, false);
  assert.match(m.refused.join(' '), /ΑΒΓ1001 · 17\/10: τα κόστη του αθροίζουν 1\.735,00 αντί για 1\.735,01/);
  d = ownTrip(); d.trips[0].cost_vat = 71;
  assert.match(pnlTripModel(d, LK).refused.join(' '), /ο ΦΠΑ του αθροίζει 70,00 αντί για 71,00/);
  d = ownTrip(); d.trips[0].revenue = 5700;
  assert.match(pnlTripModel(d, LK).refused.join(' '), /τα φορτία αθροίζουν 5\.600,00 αντί για 5\.700,00 έσοδα/);
  d = ownTrip(); d.complete = [];
  assert.match(pnlTripModel(d, LK).refused.join(' '), /λείπει ο κανόνας «πλήρες»/);
  d = ownTrip(); d.rts[0].model = 2;   // a v5 trip: the partner cost is the v5 one (here none) — still adds up
  assert.strictEqual(pnlTripModel(d, LK).ok, true);
  assert.strictEqual(pnlTripModel({ trips: [] }, LK).ok, false);
});

function week() {
  const own = ownTrip();
  const partner = {
    trips: [trip({ id: 2, trip_type: 'PARTNER', truck_id: null, driver_id: null, partner_id: 21, date_start: '2026-10-19', date_end: '2026-10-21', revenue: 3000, cost_net: 2100, cost_vat: 0, profit_worst: 900, margin_worst_pct: 30 })],
    complete: [{ rt_id: 2, missing: [], complete: true }],
    costs: [{ rt_id: 2, lines_net: 2100, vat: 0, wear: 0, dl_trip_value: null, dl_expenses: null, partner_planned: 2100, partner_invoiced: 0 }],
    rts: [{ id: 2, model: 1 }]
  };
  const missing = {
    trips: [trip({ id: 3, truck_id: 2, driver_id: 12, date_start: '2026-10-20', date_end: '2026-10-23', revenue: 4000, cost_net: 300, cost_vat: 0, profit_worst: 3700, margin_worst_pct: 92.5 })],
    complete: [{ rt_id: 3, missing: ['fuel', 'driver'], complete: false }],
    cost_cat: [{ rt_id: 3, category: 'tolls', toll_country: 'AT', lines: 1, net: 300, vat: 0 }],
    costs: [{ rt_id: 3, lines_net: 300, vat: 0, wear: 0, dl_trip_value: null, dl_expenses: null, partner_planned: 0, partner_invoiced: 0 }],
    rts: [{ id: 3, model: 1 }]
  };
  const d = clone(own);
  d.revenue_legs = [];
  for (const x of [partner, missing]) for (const k of Object.keys(x)) d[k] = (d[k] || []).concat(x[k]);
  return d;
}

test('week paper: the columns per trip, «λείπει» / blank / «—», the week sums, «Λείπει σε», «Μόνο τα πλήρη»', () => {
  const m = pnlWeekModel(week(), LK);
  assert.strictEqual(m.ok, true, JSON.stringify(m.refused));
  assert.strictEqual(m.rows.length, 3);
  const [a, b, c] = m.rows;
  assert.deepStrictEqual([a.who, a.route, a.fuel, a.tolls, a.driver, a.partner, a.other], ['ΑΒΓ1001 · Δοκιμαστής Γ.', 'Βέροια → Wien', 700, 240, 720, undefined, 75]);
  assert.deepStrictEqual([b.who, b.fuel, b.tolls, b.driver, b.partner], ['Συνεργάτης Δοκιμής ΑΕ · συνεργάτης', undefined, undefined, undefined, 2100]);
  assert.deepStrictEqual([c.fuel, c.tolls, c.driver, c.complete, c.result], ['miss', 300, 'miss', false, null]);
  assert.deepStrictEqual([m.total.revenue, m.total.cost, m.total.fuel, m.total.tolls, m.total.partner], [12600, 4135, 700, 540, 2100]);
  assert.deepStrictEqual([m.missIn.fuel, m.missIn.driver, m.missIn.tolls], [1, 1, 0]);
  assert.deepStrictEqual([m.full.n, m.full.revenue, m.full.result, m.full.margin], [2, 8600, 4695, 54.6]);
  const t = text(pnlWeekHtml(m, '2026-10-17', '2026-10-23'));
  assert.match(t, /Εβδομάδα Σάβ 17\/10 – Παρ 23\/10\/2026/);
  assert.match(t, /Δρομολόγια 3 · πλήρη 2/);
  assert.match(t, /Σύνολο εβδομάδας 12\.600,00 700,00 540,00 720,00 2\.100,00 75,00 4\.135,00 70,00 — —/, 'not every trip complete: the week result is «—»');
  assert.match(t, /Μόνο τα πλήρη · 2 από 3 8\.600,00 3\.835,00 70,00 4\.695,00 54,6%/);
  assert.match(t, /20–23\/10 ΑΒΓ1002 · Παράδειγμα Ν\. — 4\.000,00 λείπει 300,00 λείπει/);
  assert.ok(!/RT-\d/.test(t));
});

test('week paper: a «λείπει» cell shows what IS written under it, so the row still adds up to its ΚΟΣΤΗ', () => {
  const d = week();
  d.costs[2] = { ...d.costs[2], dl_expenses: 70 };
  d.trips[2] = { ...d.trips[2], cost_net: 370 };
  const m = pnlWeekModel(d, LK);
  assert.strictEqual(m.ok, true, JSON.stringify(m.refused));
  assert.strictEqual(m.rows[2].driver, 'miss');
  assert.strictEqual(m.rows[2].missAmt.driver, 70);
  assert.match(text(pnlWeekHtml(m, '2026-10-17', '2026-10-23')), /20–23\/10 ΑΒΓ1002 · Παράδειγμα Ν\. — 4\.000,00 λείπει 300,00 λείπει 70,00/);
});

test('trip paper: the loads in the trip\'s order (seq), whatever order the legs were attached; a nameless leg with money still has a row', () => {
  const d = ownTrip();
  d.legs = [{ id: 10, rt_id: 1, seq: 2, order_id: 100 }, { id: 11, rt_id: 1, seq: 1, order_id: 101 }];
  d.revenue_legs.push({ rt_id: 1, source: 'leg', leg_id: 99, order_id: null, nat_load_id: null, rev_intl: 50, rev_natl: 0 });
  d.trips[0] = { ...d.trips[0], revenue: 5650 };
  const m = pnlTripModel(d, LK);
  assert.strictEqual(m.ok, true, JSON.stringify(m.refused));
  assert.deepStrictEqual(m.rev.filter((r) => !r.sub).map((r) => r.load.split(' ·')[0]).join('|'), 'Εισαγωγή|Εξαγωγή|Φορτίο χωρίς στοιχεία');
});

test('week paper refuses: a cut week, a trip whose costs do not add up (named by truck and day)', () => {
  let d = week(); d.truncated = true;
  assert.match(pnlWeekModel(d, LK).refused.join(' '), /περισσότερα δρομολόγια από όσα διαβάζει το χαρτί/);
  d = week(); d.trips[2].cost_net = 301;
  const m = pnlWeekModel(d, LK);
  assert.strictEqual(m.ok, false);
  assert.match(m.refused.join(' '), /ΑΒΓ1002 · 20\/10: τα κόστη του αθροίζουν 300,00 αντί για 301,00/);
});

test('week paper: an empty week says so; a v5 national trip takes its route from its national order', () => {
  const e = pnlWeekModel({ trips: [], truncated: false }, LK);
  assert.strictEqual(e.ok, true);
  assert.match(text(pnlWeekHtml(e, '2026-10-17', '2026-10-23')), /Κανένα δρομολόγιο με έναρξη αυτή την εβδομάδα/);
  const d = {
    trips: [trip({ id: 5, revenue: 800, cost_net: 0, cost_vat: 0, profit_worst: 800 })],
    complete: [{ rt_id: 5, missing: ['fuel', 'tolls', 'driver'], complete: false }],
    costs: [{ rt_id: 5, lines_net: 0, vat: 0, wear: 0, dl_trip_value: null, dl_expenses: null, partner_planned: 0, partner_invoiced: 0 }],
    rts: [{ id: 5, model: 2 }], v5_lines: [{ rt_id: 5, nat_order_id: 900 }],
    nat_orders: [{ id: 900, pickup_location_1_id: 41, delivery_location_1_id: 44 }],
    locations: [{ id: 41, city: 'Βέροια' }, { id: 44, city: 'Λάρισα' }]
  };
  const m = pnlWeekModel(d, LK);
  assert.strictEqual(m.ok, true, JSON.stringify(m.refused));
  assert.strictEqual(m.rows[0].route, 'Βέροια → Λάρισα');
});
