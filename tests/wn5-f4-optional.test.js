// node --test tests/wn5-f4-optional.test.js
// F1/F4 (owner 28/10, with SQL 080): price and pallets are OPTIONAL in the National v5 order form. An empty price goes
// as null (stored NULL, «λείπει», never 0); empty pallets go as null (stored NULL on the shipment and its one piece).
// Every v5 reader keeps a missing value VISIBLE as missing: «;π» for unknown pallets, «12+;» for a sum with unknowns,
// «τιμή λείπει» — never 0 and never «OK» (principle 1). The REAL modules run in a vm.
// NO-GO on plain main (TMS_ROOT=<git archive origin/main>): the form refuses both, the model turns null into 0.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const J = (x) => JSON.parse(JSON.stringify(x));

function pageCtx(files) {
  const win = { addEventListener() {} };
  const store = new Map();
  const ctx = { console: { log() {}, info() {}, warn() {}, error() {}, debug() {} }, window: win, Intl, Date, Math, JSON, Object, Array, String, Number,
    Map, Set, Promise, Error, RegExp, Symbol, location: { search: '', href: 'https://x/app.html' }, history: { state: null, replaceState() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: { addEventListener() {}, createElement() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, body: { appendChild() {} } } };
  vm.createContext(ctx);
  for (const f of files) {
    vm.runInContext(src(f), ctx, { filename: f });
    for (const k of ['WI4', 'WN5L', 'WN5Form', 'WN5Lab', 'WN5Sheet', 'WN5']) if (win[k] && !ctx[k]) ctx[k] = win[k];
  }
  return ctx;
}
const F = pageCtx(['core/wi4-logic.js', 'core/wn5-logic.js', 'modules/wn5_forms.js']).WN5Form;
const row = (location_id, day, from, to, pallets, extra) => Object.assign({ location_id, day, from, to, pallets }, extra || {});
const order = (o) => Object.assign({ client_id: 41, price: 310, temperature_c: 4, pallet_exchange: false, reference: '', goods: '', notes: '',
  loads: [row(3, '2026-10-14', '08:00', '10:00', 6)], drops: [row(2, '2026-10-15', '08:00', '10:00', 6)] }, o || {});
const state = (o) => Object.assign({ side: 'KATHODOS', target: null, cycleStops: [], orders: [order()] }, o || {});

test('F4: no price → no form line, the body sends price null (never 0)', () => {
  const st = state({ orders: [order({ price: null })] });
  assert.deepStrictEqual(J(F._check(st)), []);
  assert.strictEqual(J(F._body(st)).orders[0].price, null);
});

test('F1: no pallets on both rows → no form line, the shipment goes with pallets null', () => {
  const st = state({ orders: [order({ loads: [row(3, '2026-10-14', '08:00', '10:00', null)], drops: [row(2, '2026-10-15', '08:00', '10:00', null)] })] });
  assert.deepStrictEqual(J(F._check(st)), []);
  assert.strictEqual(J(F._body(st)).orders[0].shipments[0].pallets, null);
});

test('F1: 1×1 — the pallets written on either row are the shipment\'s; both written and different is still refused', () => {
  const st = state({ orders: [order({ loads: [row(3, '2026-10-14', '08:00', '10:00', null)], drops: [row(2, '2026-10-15', '08:00', '10:00', 7)] })] });
  assert.deepStrictEqual(J(F._check(st)), []);
  assert.strictEqual(J(F._body(st)).orders[0].shipments[0].pallets, 7);
  const bad = state({ orders: [order({ drops: [row(2, '2026-10-15', '08:00', '10:00', 5)] })] });
  assert.ok(J(F._check(bad)).some((l) => /παλέτες φόρτωσης δεν ισούνται/.test(l)));
});

test('F1: N×1 with an empty load and the one delivery written — which number is meant is asked, never guessed', () => {
  const st = state({ orders: [order({ loads: [row(3, '2026-10-14', '08:00', '10:00', 4), row(5, '2026-10-14', '09:00', '10:00', null)],
    drops: [row(2, '2026-10-15', '08:00', '10:00', 10)] })] });
  assert.ok(J(F._check(st)).some((l) => l.includes('παλέτες: γράψε τες σε κάθε φόρτωση, ή άφησε κενή και τη μία παράδοση')), J(F._check(st)).join(' / '));
  const ok = state({ orders: [order({ loads: [row(3, '2026-10-14', '08:00', '10:00', 4), row(5, '2026-10-14', '09:00', '10:00', null)],
    drops: [row(2, '2026-10-15', '08:00', '10:00', null)] })] });
  assert.deepStrictEqual(J(F._check(ok)), []);
  assert.deepStrictEqual(J(F._body(ok)).orders[0].shipments.map((s) => s.pallets), [4, null]);
});

test('F1/F4: a written price or pallets is still checked — 0, negative, two decimals', () => {
  assert.ok(J(F._check(state({ orders: [order({ price: 0 })] }))).some((l) => l.includes('Τιμή € (χωρίς ΦΠΑ): αριθμός πάνω από 0, ή κενό (λείπει)')));
  const p = J(F._check(state({ orders: [order({ loads: [row(3, '2026-10-14', '08:00', '10:00', 0)] })] })));
  assert.ok(p.some((l) => l.includes('παλέτες: αριθμός πάνω από 0 (ένα δεκαδικό), ή κενό (άγνωστες)')), p.join(' / '));
});

// ── the board: model and HTML ────────────────────────────────────────────────────────────────────────────────
const FIX = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/wn5-week.json'), 'utf8'));
test('F1: the board model keeps unknown pallets null and counts them; palText says «;» / «12+;»', () => {
  const c = pageCtx(['core/wi4-logic.js', 'core/wn5-logic.js', 'modules/weekly_natl_v5.js']);
  const L = c.WN5L;
  assert.strictEqual(L.palText(null, 0), ';');
  assert.strictEqual(L.palText(12, 1), '12+;');
  assert.strictEqual(L.palText(6.5, 0), '6,5');
  const b = FIX();
  const w = b.waiting.find((x) => x.piece_id === 4105);
  w.pallets = null; w.price = null;
  const m = L.model(b, { today: '2026-10-13' });
  const r = m.days.flatMap((d) => d.rows).find((x) => (x.pieceIds || []).includes(4105));
  const side = r.kath || r.anod;
  const pts = side.from.concat(side.to).filter((p) => p.pallets === null || p.palUnknown);
  assert.ok(pts.length >= 1, 'a point keeps the unknown');
  // code review xhigh r3/r4: every point holding an unknown COUNTS it (palUnknown ≥ 1), never only through pallets null
  assert.ok(pts.every((p) => p.palUnknown >= 1), JSON.stringify(pts.map((p) => [p.pallets, p.palUnknown])));
  assert.ok(side.palUnknown >= 1, 'the side counts it');
  // capacity of a cycle side with one unknown leg
  const cyc = b.cycles[0];
  const kath = cyc.stops.filter((s) => s.side === 'KATHODOS');
  const loadLeg = kath.flatMap((s) => s.legs).find((l) => l.act === 'load');
  const before = L.capacity(kath).pallets;
  loadLeg.pallets = null;
  const cap = L.capacity(kath);
  assert.strictEqual(cap.unknown, 1);
  assert.ok(cap.pallets < before, 'the known sum only, the unknown not as a number');
  // HTML: the row says «;π», never «0π»
  const h = c.WN5._html(m);
  const chunk = h.split('<div class="wn5-row').find((s) => s.includes('data-piece="4105"')) || '';
  assert.ok(chunk.includes(';π'), 'the waiting row says «;π»');
  assert.ok(!/>0π|· 0π/.test(chunk), 'a 0π on the row');
});

test('F1: the driver sheet reads «;» for a stop of unknown pallets', () => {
  const c = pageCtx(['core/wi4-logic.js', 'core/wn5-logic.js', 'modules/wn5_forms.js', 'core/wn5-labels.js', 'modules/wn5_sheet.js']);
  const L = (leg_id, piece_id, act, pallets) => ({ leg_id, piece_id, act, pallets, kind: 'national', order_id: null, nat_order_id: 1, reference: 'N-T1', client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', temperature_c: 2 });
  const ST = (stop_id, seq, loc, f, t, legs) => ({ stop_id, seq, side: 'KATHODOS', location_id: loc, location: 'LOC ' + loc, planned_from: f, planned_to: t, stop_day: f.slice(0, 10), legs });
  const CYC = { rt_id: 101, code: 'RT-T101', trip_type: 'OWNED', truck: 'TST-2104', trailer: null, driver: 'Driver Test 01', partner: null,
    stops: [ST(1, 1, 3, '2026-10-14T08:00:00+03:00', '2026-10-14T10:00:00+03:00', [L(1, 11, 'load', null), L(2, 12, 'load', 6)]),
      ST(2, 2, 2, '2026-10-15T08:00:00+03:00', '2026-10-15T10:00:00+03:00', [L(1, 11, 'unload', null), L(2, 12, 'unload', 6)])] };
  const ls = c.WN5Sheet.lines(CYC, { hubId: 1, byId: {} }, 'ALL');
  const txt = c.WN5Sheet.text(ls, { week: 'W42', cycleNo: '1/1', issued: 'x' });
  assert.ok(txt.includes('6+;π'), txt);
  assert.ok(!/\b6π/.test(txt.replace('6+;π', '')), 'a sum that hides the unknown: ' + txt);
});
