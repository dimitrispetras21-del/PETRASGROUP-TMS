// node --test tests/wn5-relax-order-form.test.js
// Owner 2/11, relaxed rules group 5 (the national order form): «loose rules now, strict later».
//   1. A night window (22:00–06:00) is accepted as ending the NEXT day, as the assignment form Δ1 reads it — the form
//      refused it with «το «έως» πρέπει να είναι μετά το «από»». 071 shipments_win / rt_stops_win only ask that the end
//      is not before the start, which a next-day end is.
//   2. An order saved without a price (080) says so on the Weekly: a small amber «λείπει τιμή» on its point, so nothing
//      is forgotten. An ABSENT price key is «the board did not say» and never «missing» (facade trap 2 / 074); a VS
//      sends price: null by design and is never marked. No «λείπει ώρα» (owner 2/11): «όλη η ημέρα» is the normal case.
// The REAL modules run in a vm. NO-GO on plain main (TMS_ROOT=<git archive origin/main>): _toDay is missing, the night
// window is refused, the board has no mark.
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
  vm.runInContext(src('core/wn5-logic.js'), ctx, { filename: 'core/wn5-logic.js' });
  ctx.WN5L = win.WN5L;
  vm.runInContext(src('modules/wn5_forms.js'), ctx, { filename: 'modules/wn5_forms.js' });
  return win.WN5Form;
}
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
const F = forms();
const row = (location_id, day, from, to, pallets, extra) => Object.assign({ location_id, day, from, to, pallets }, extra || {});
const order = (o) => Object.assign({ client_id: 41, price: 310, temperature_c: 4, pallet_exchange: false, reference: '', goods: '', notes: '',
  loads: [row(3, '2026-11-03', '22:00', '06:00', 6)], drops: [row(2, '2026-11-04', '08:00', '10:00', 6)] }, o || {});
const state = (o) => Object.assign({ side: 'KATHODOS', target: null, cycleStops: [], orders: [order()] }, o || {});

// ── 1. the night window ──────────────────────────────────────────────────────────────────────────────────────
test('night: _toDay — an «έως» before the «από» ends the next day; otherwise the same day', () => {
  assert.strictEqual(F._toDay('2026-11-03', '22:00', '06:00'), '2026-11-04');
  assert.strictEqual(F._toDay('2026-10-31', '23:00', '01:30'), '2026-11-01', 'across a month end');
  assert.strictEqual(F._toDay('2026-12-31', '20:00', '04:00'), '2027-01-01', 'across a year end');
  assert.strictEqual(F._toDay('2026-11-03', '08:00', '10:00'), '2026-11-03');
  assert.strictEqual(F._toDay('2026-11-03', '08:00', '08:00'), '2026-11-03', 'the same hour is that instant, never 24 h');
  assert.strictEqual(F._toDay('2026-11-03', '', ''), '2026-11-03', 'no hour: nothing moves');
});

test('night: the form no longer refuses 22:00–06:00 (nor 08:00–08:00); its old line is gone from the source', () => {
  assert.deepStrictEqual(J(F._check(state())), []);
  assert.deepStrictEqual(J(F._check(state({ orders: [order({ loads: [row(3, '2026-11-03', '08:00', '08:00', 6)] })] }))), []);
  assert.ok(!src('modules/wn5_forms.js').includes('πρέπει να είναι μετά το'), 'the «έως before από» refusal is still in the form');
});

test('night: the body ends the window the next day (Athens offset of THAT day); a day window is unchanged', () => {
  const sh = J(F._body(state())).orders[0].shipments[0];
  assert.strictEqual(sh.load_from, '2026-11-03T22:00:00+02:00');
  assert.strictEqual(sh.load_to, '2026-11-04T06:00:00+02:00');
  assert.strictEqual(sh.deliver_from, '2026-11-04T08:00:00+02:00');
  assert.strictEqual(sh.deliver_to, '2026-11-04T10:00:00+02:00');
  // 071 shipments_win: load_from <= load_to, deliver_from <= deliver_to, load_from <= deliver_to
  assert.ok(Date.parse(sh.load_from) <= Date.parse(sh.load_to) && Date.parse(sh.load_from) <= Date.parse(sh.deliver_to));
  const d = J(F._body(state({ orders: [order({ drops: [row(2, '2026-11-04', '21:00', '05:00', 6)] })] }))).orders[0].shipments[0];
  assert.strictEqual(d.deliver_to, '2026-11-05T05:00:00+02:00');
});

test('night: a night window across the DST change keeps each end\'s own offset (Sat 24/10 22:00 → Sun 25/10 06:00)', () => {
  const sh = J(F._body(state({ orders: [order({ loads: [row(3, '2026-10-24', '22:00', '06:00', 6)], drops: [row(2, '2026-10-25', '08:00', '10:00', 6)] })] }))).orders[0].shipments[0];
  assert.strictEqual(sh.load_from, '2026-10-24T22:00:00+03:00');
  assert.strictEqual(sh.load_to, '2026-10-25T06:00:00+02:00');
});

test('same hour (code review xhigh): 08:00–08:00 is sent as that minute, as a stop (F64) — never a zero-length window', () => {
  const sh = J(F._body(state({ orders: [order({ loads: [row(3, '2026-11-03', '08:00', '08:00', 6)] })] }))).orders[0].shipments[0];
  assert.deepStrictEqual([sh.load_from, sh.load_to], ['2026-11-03T08:00:00+02:00', '2026-11-03T08:01:00+02:00']);
  const z = J(F._body(state({ orders: [order({ loads: [row(3, '2026-11-03', '23:59', '23:59', 6)] })] }))).orders[0].shipments[0];
  assert.deepStrictEqual([z.load_from, z.load_to], ['2026-11-03T23:58:00+02:00', '2026-11-03T23:59:00+02:00']);
  // an arrival «ως» keeps its one instant (from = to), the deadline the Veroia readers name by its end
  const u = J(F._body(state({ side: 'ANODOS', orders: [order({ loads: [row(3, '2026-11-03', '10:00', '12:00', 6)], drops: [row(1, '2026-11-03', '22:00', '22:00', 6, { until: true })] })] }))).orders[0].shipments[0];
  assert.deepStrictEqual([u.deliver_from, u.deliver_to], ['2026-11-03T22:00:00+02:00', '2026-11-03T22:00:00+02:00']);
});

test('delivery before loading (code review xhigh): the create form names the row, as the edit form', () => {
  const lines = J(F._check(state({ orders: [order({ loads: [row(3, '2026-11-03', '22:00', '06:00', 6)], drops: [row(2, '2026-11-03', '08:00', '10:00', 6)] })] })));
  assert.deepStrictEqual(lines, ['παράδοση 1: η παράδοση πριν από τη φόρτωση 1']);
  assert.deepStrictEqual(J(F._check(state())), [], 'the delivery the next morning after a night loading is fine');
});

test('F66 with a night loading (code review xhigh): the new Veroia stop opens when the loading ENDS (next morning), never before it starts', () => {
  const st = state({ side: 'ANODOS', target: { rt_id: 9, side: 'ANODOS' },
    orders: [order({ loads: [row(3, '2026-11-03', '22:00', '06:00', 6)], drops: [row(1, '2026-11-04', '10:00', '10:00', 6, { until: true })] })] });
  const hub = J(F._body(st)).stops.find((s) => s.location_id === 1);
  assert.deepStrictEqual([hub.planned_from, hub.planned_to], ['2026-11-04T06:00:00+02:00', '2026-11-04T10:00:00+02:00']);
  const st2 = state({ side: 'ANODOS', target: { rt_id: 9, side: 'ANODOS' },
    orders: [order({ loads: [row(3, '2026-11-03', '22:00', '06:00', 6)], drops: [row(1, '2026-11-03', '23:30', '23:30', 6, { until: true })] })] });
  const hub2 = J(F._body(st2)).stops.find((s) => s.location_id === 1);
  assert.strictEqual(hub2.planned_from, '2026-11-03T00:00:00+02:00', 'a loading that ends the next day is not «that day\'s» end');
});

test('night: a new truck stop of the «+» spans the night (071 rt_stops_win: planned_to > planned_from)', () => {
  const b = J(F._body(state({ target: { rt_id: 9, side: 'KATHODOS' } })));
  const s1 = b.stops.find((s) => s.location_id === 3);
  assert.deepStrictEqual([s1.planned_from, s1.planned_to], ['2026-11-03T22:00:00+02:00', '2026-11-04T06:00:00+02:00']);
  assert.ok(Date.parse(s1.planned_to) > Date.parse(s1.planned_from));
});

test('night: the edit form holds a night window (one day field + _toDay) and still locks a window of more than a night', () => {
  const s = src('modules/wn5_forms.js');
  assert.ok(/const span = \(a, b\) => a\.day !== b\.day && b\.day !== _toDay\(a\.day, a\.hm, b\.hm\);/.test(s), 'the two-days lock does not know a night window');
  assert.ok(s.includes("if (w.from !== w.to) return [_iso(day, w.from), _iso(_toDay(day, w.from, w.to), w.to)];")
    && s.includes("ends(g('lday'), lw, o && o.load_from, o && o.load_to)") && s.includes("ends(g('dday'), dw, o && o.deliver_from, o && o.deliver_to)"),
    'the edit form reads a night window back on one day');
});

// ── 2. the amber marks on the board ──────────────────────────────────────────────────────────────────────────
const FIX = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/wn5-week.json'), 'utf8'));
const rowChunk = (h, attr) => h.split('<div class="wn5-row').find((s) => s.includes(attr)) || '';
const count = (s, w) => s.split(w).length - 1;

test('marks: a waiting national order with price null says «λείπει τιμή» once; its whole-day delivery stays «όλη η ημέρα», no «λείπει ώρα»', () => {
  const fx = FIX();
  const w = fx.waiting.find((x) => x.piece_id === 4105);
  Object.assign(w, { price: null, deliver_from: '2026-10-14T00:00:00+03:00', deliver_to: '2026-10-14T23:59:00+03:00' });
  const c = board();
  const chunk = rowChunk(c.WN5._html(c.WN5L.model(fx, { today: '2026-10-13' })), 'data-piece="4105"');
  assert.ok(chunk, 'the waiting row of piece 4105 is drawn');
  assert.strictEqual(count(chunk, '<span class="wn5-noprice">λείπει τιμή</span>'), 1, chunk);
  assert.ok(!chunk.includes('λείπει ώρα'), 'owner 2/11: the whole day is the normal case, never «λείπει ώρα»');
  assert.ok(chunk.includes('όλη η ημέρα'), 'the whole-day point still reads «όλη η ημέρα»');
  assert.ok(/title="[^"]*λείπει τιμή/.test(chunk), 'a point\'s title names the missing price');
});

test('marks: an ABSENT price key, a written price and an hour are never marked (absent ≠ missing)', () => {
  const fx = FIX();
  const w = fx.waiting.find((x) => x.piece_id === 4105);
  delete w.price;
  const c = board();
  const h = c.WN5._html(c.WN5L.model(fx, { today: '2026-10-13' }));
  assert.ok(!rowChunk(h, 'data-piece="4105"').includes('wn5-noprice'));
  const fx2 = FIX();   // price 450, hours 08:00–10:00 / 14:00–16:00
  const c2 = board();
  assert.ok(!c2.WN5._html(c2.WN5L.model(fx2, { today: '2026-10-13' })).includes('wn5-noprice'), 'the fixture week (prices and hours) shows a mark');
});

test('marks: a cycle — one «λείπει τιμή» per national order (load + unload legs), never for a VS leg with price null', () => {
  const fx = FIX();
  const c101 = fx.cycles.find((c) => c.stops.some((s) => s.stop_id === 1001));
  for (const s of c101.stops) for (const l of s.legs || []) l.price = l.nat_order_id === 3001 ? null : l.nat_order_id != null ? 100 : null;
  const c = board();
  const chunk = rowChunk(c.WN5._html(c.WN5L.model(fx, { today: '2026-10-13' })), `data-rt="${c101.rt_id}"`);
  assert.ok(chunk, 'the cycle row is drawn');
  const onClientPoint = c101.stops.some((s) => Number(s.location_id) !== 1 && (s.legs || []).some((l) => l.nat_order_id === 3001));
  assert.ok(onClientPoint, 'fixture: order 3001 has a client point on cycle ' + c101.rt_id);
  assert.strictEqual(count(chunk, 'λείπει τιμή</span>'), 1, chunk);
  // the VS leg (order_id 2001) has price null and is never marked: only order 3001 was
  for (const s of c101.stops) for (const l of s.legs || []) if (l.nat_order_id === 3001) l.price = 100;
  const c2 = board();
  assert.ok(!rowChunk(c2.WN5._html(c2.WN5L.model(fx, { today: '2026-10-13' })), `data-rt="${c101.rt_id}"`).includes('λείπει τιμή'), 'a VS price null was marked');
});

test('marks: a folded point without its price turns the «+N» chip amber (wn5-gap), as a late one', () => {
  const s = src('modules/weekly_natl_v5.js');
  assert.ok(/const restGap = rest\.some\(\(i\) => pts\[i\]\.noPrice\);/.test(s) && s.includes("${restGap ? ' wn5-gap' : ''}"));
  assert.ok(/\.wi4-more\.wn5-gap b \{ color:var\(--wi4-amber-ink\); \}/.test(src('assets/style.css')));
});
