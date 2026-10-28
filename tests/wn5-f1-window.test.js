// node --test tests/wn5-f1-window.test.js
// F1 (owner 28/10, real-user test of National v5): the window of a point is OPTIONAL in the order form. The dispatcher's
// weekly sheet often has no hour when the order is entered; today's form refused the save («γράψε παράθυρο από – έως»)
// and the owner typed 00:00–23:59 by hand on every point. The schema keeps a window on every national point
// (071 shipments_shape / shipments_win, rt_stops_win: the base invents no hour), so an empty window is the whole of the
// point's day, 00:00–23:59 — the value the Δ1 quick fix (#160) gives a window-less stop — and every reader names it
// «όλη η ημέρα», never an hour someone agreed (principle 1).
// The REAL modules (wn5_forms.js, weekly_natl_v5.js, wn5_sheet.js) run in a vm.
// NO-GO on plain main (TMS_ROOT=<git archive origin/main>): _rowWin is missing, the empty window is refused, the board
// and the sheet print «00:00–23:59».
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const J = (x) => JSON.parse(JSON.stringify(x));

function forms() {
  const win = { addEventListener() {} };
  const ctx = { console: { log() {}, info() {}, warn() {}, error() {}, debug() {} }, window: win, Intl, Date, Math, JSON,
    Object, Array, String, Number, Map, Set, Promise, Error, RegExp, Symbol,
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null } };
  vm.createContext(ctx);
  vm.runInContext(src('core/wi4-logic.js'), ctx, { filename: 'core/wi4-logic.js' });
  ctx.WI4 = win.WI4;
  vm.runInContext(src('modules/wn5_forms.js'), ctx, { filename: 'modules/wn5_forms.js' });
  return { ctx, win, F: win.WN5Form };
}
const { win: FW, F } = forms();

const row = (location_id, day, from, to, pallets, extra) => Object.assign({ location_id, day, from, to, pallets }, extra || {});
const order = (o) => Object.assign({ client_id: 41, price: 310, temperature_c: 4, pallet_exchange: false, reference: '', goods: '', notes: '',
  loads: [row(3, '2026-10-14', '00:00', '23:59', 6)], drops: [row(2, '2026-10-15', '00:00', '23:59', 6)] }, o || {});
const state = (o) => Object.assign({ side: 'KATHODOS', target: null, cycleStops: [], orders: [order()] }, o || {});

test('F1: an empty window is the whole day of its point; one end alone is never guessed', () => {
  assert.strictEqual(typeof F._rowWin, 'function', 'WN5Form._rowWin missing (plain main: the empty window is refused)');
  assert.deepStrictEqual(J(F._rowWin(false, '', '')), { from: '00:00', to: '23:59', allDay: true });
  assert.deepStrictEqual(J(F._rowWin(false, '08:00', '10:00')), { from: '08:00', to: '10:00', allDay: false });
  assert.deepStrictEqual(J(F._rowWin(false, '00:00', '23:59')), { from: '00:00', to: '23:59', allDay: true }, 'typed whole day reads the same');
  // one end only stays as typed: _check names it
  assert.deepStrictEqual(J(F._rowWin(false, '08:00', '')), { from: '08:00', to: '', allDay: false });
  assert.deepStrictEqual(J(F._rowWin(false, '', '10:00')), { from: '', to: '10:00', allDay: false });
  // an arrival «ως» at Veroia (ANODOS): empty = by the end of its day
  assert.deepStrictEqual(J(F._rowWin(true, '', '')), { from: '23:59', to: '23:59', allDay: true });
  assert.deepStrictEqual(J(F._rowWin(true, '', '22:00')), { from: '22:00', to: '22:00', allDay: false });
});

test('F1: the whole-day order passes _check and the body carries 00:00–23:59 at the Athens offset of the day', () => {
  assert.deepStrictEqual(J(F._check(state())), []);
  const b = J(F._body(state()));
  assert.deepStrictEqual(b.orders[0].shipments, [{ origin_location_id: 3, dest_location_id: 2, pallets: 6,
    load_from: '2026-10-14T00:00:00+03:00', load_to: '2026-10-14T23:59:00+03:00',
    deliver_from: '2026-10-15T00:00:00+03:00', deliver_to: '2026-10-15T23:59:00+03:00' }]);
  // across the end of summer time (25/10/2026): each end keeps its own offset
  const w = J(F._body(state({ orders: [order({ loads: [row(3, '2026-10-25', '00:00', '23:59', 6)], drops: [row(2, '2026-10-26', '00:00', '23:59', 6)] })] })));
  const s = w.orders[0].shipments[0];
  assert.strictEqual(s.load_from, '2026-10-25T00:00:00+03:00');
  assert.strictEqual(s.load_to, '2026-10-25T23:59:00+02:00');
  assert.strictEqual(s.deliver_from, '2026-10-26T00:00:00+02:00');
});

test('F1: one end only is refused by name — «ΗΗ:ΛΛ και στα δύο άκρα, ή κανένα (όλη η ημέρα)»', () => {
  const lines = J(F._check(state({ orders: [order({ loads: [row(3, '2026-10-14', '08:00', '', 6)] })] })));
  assert.ok(lines.some((l) => l.includes('φόρτωση 1: παράθυρο: ΗΗ:ΛΛ και στα δύο άκρα, ή κανένα (όλη η ημέρα)')), lines.join(' / '));
});

test('F1: a stop the form creates on a cycle from a whole-day point spans 00:00–23:59 (071 rt_stops_win: to > from)', () => {
  const b = J(F._body(state({ target: { rt_id: 101, side: 'KATHODOS' } })));
  assert.deepStrictEqual(b.stops, [
    { ref: 's1', location_id: 3, side: 'KATHODOS', planned_from: '2026-10-14T00:00:00+03:00', planned_to: '2026-10-14T23:59:00+03:00' },
    { ref: 's2', location_id: 2, side: 'KATHODOS', planned_from: '2026-10-15T00:00:00+03:00', planned_to: '2026-10-15T23:59:00+03:00' }]);
});

test('F1: the forms name a whole-day window «όλη η ημέρα», never «00:00–23:59»', () => {
  assert.strictEqual(F._win('2026-10-14T00:00:00+03:00', '2026-10-14T23:59:00+03:00'), 'Τετ 14/10 όλη η ημέρα');
  assert.strictEqual(F._win('2026-10-14T08:00:00+03:00', '2026-10-14T10:00:00+03:00'), 'Τετ 14/10 08:00–10:00');
});

test('F1: the create form\'s window headers have no «*» and say what an empty window is', () => {
  const s = src('modules/wn5_forms.js');
  assert.ok(s.includes("'Παράθυρο από – έως · κενό: όλη η ημέρα'") && s.includes("'Άφιξη ως · κενό: όλη η ημέρα'"));
  // the create form only: the leg form's read-only rows keep their Figma heads (nothing is typed there)
  assert.ok(!/<span data-wh>Παράθυρο από – έως \*<\/span>/.test(s) && !/\? 'Άφιξη ως \*' : 'Παράθυρο από – έως \*'/.test(s), 'a window header still says «*»');
  assert.ok(!/Παράθυρο φόρτωσης Βέροιας \*|Άφιξη Βέροιας ως \*/.test(s), 'the Veroia window of the head still says «*»');
});

// ── the board ────────────────────────────────────────────────────────────────────────────────────────────────
function board() {
  const store = new Map();
  const ctx = { console: { log() {}, warn() {}, error() {} }, location: { search: '', href: 'https://x/app.html' }, history: { state: null, replaceState() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['core/wi4-logic.js', 'core/wn5-logic.js', 'modules/weekly_natl_v5.js']) vm.runInContext(src(f), ctx, { filename: f });
  return ctx;
}
test('F1: the board names a whole-day point «όλη η ημέρα» (row and title), an hour stays an hour', () => {
  const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/wn5-week.json'), 'utf8'));
  const w = FIX.waiting.find((x) => x.piece_id === 4105);
  Object.assign(w, { load_from: '2026-10-14T00:00:00+03:00', load_to: '2026-10-14T23:59:00+03:00' });
  const c = board();
  const h = c.WN5._html(c.WN5L.model(FIX, { today: '2026-10-13' }));
  const chunk = h.split('<div class="wn5-row').find((s) => s.includes('data-piece="4105"')) || '';
  assert.ok(chunk, 'the waiting row of piece 4105 is drawn');
  assert.ok(chunk.includes('όλη η ημέρα'), 'the whole-day point does not say «όλη η ημέρα»');
  assert.ok(!chunk.includes('00:00–23:59'), 'the whole-day point prints 00:00–23:59');
  assert.ok(chunk.includes('14:00–16:00'), 'the delivery hour of the same order is still its hour');
});

// ── the driver sheet ─────────────────────────────────────────────────────────────────────────────────────────
test('F1: the driver sheet reads «όλη η ημέρα» for a whole-day stop', () => {
  const win = { addEventListener() {} };
  const ctx = { console: { log() {}, warn() {}, error() {} }, window: win, Intl, Date, Math, JSON, Object, Array, String, Number, Map, Set, Promise, Error, RegExp, Symbol,
    document: { addEventListener() {}, createElement() {}, querySelector() {}, body: { appendChild() {} } } };
  vm.createContext(ctx);
  vm.runInContext(src('core/wi4-logic.js'), ctx); ctx.WI4 = win.WI4;
  vm.runInContext(src('modules/wn5_forms.js'), ctx); ctx.WN5Form = win.WN5Form;
  vm.runInContext(src('core/wn5-labels.js'), ctx); ctx.WN5Lab = win.WN5Lab;
  vm.runInContext(src('modules/wn5_sheet.js'), ctx);
  const L = (leg_id, piece_id, act) => ({ leg_id, piece_id, act, pallets: 6, kind: 'national', order_id: null, nat_order_id: 1, reference: 'N-T1', client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', temperature_c: 2 });
  const ST = (stop_id, seq, location_id, from, to, legs) => ({ stop_id, seq, side: 'KATHODOS', location_id, location: 'LOC ' + location_id, planned_from: from, planned_to: to, stop_day: from.slice(0, 10), legs });
  const CYC = { rt_id: 101, code: 'RT-T101', trip_type: 'OWNED', truck: 'TST-2104', trailer: null, driver: 'Driver Test 01', partner: null,
    stops: [ST(1, 1, 3, '2026-10-14T00:00:00+03:00', '2026-10-14T23:59:00+03:00', [L(1, 11, 'load')]),
      ST(2, 2, 2, '2026-10-15T08:00:00+03:00', '2026-10-15T10:00:00+03:00', [L(1, 11, 'unload')])] };
  const stops = J(win.WN5Sheet.lines(CYC, { hubId: 1, byId: {} }, 'ALL')).filter((l) => l.t === 'stop');
  assert.strictEqual(stops[0].window, 'Τετ όλη η ημέρα');
  assert.strictEqual(stops[1].window, 'Πέμ 08:00–10:00');
});
