// node --test tests/wn5-road.test.js
// National v5 «Αλλαγή στον δρόμο» (owner 2/11, piece 5): modules/wn5_road.js — the body of POST /plan/transfer (099's
// keys only), what keeps «Συνέχεια ›» off, the window of the point, and the 072b body of a whole-vehicle change.
// Why: a key 099 does not know is refused (plan_h_keys), a load that stays whole on A must not be sent (it would be
// «stay» on a whole load: bad_input), and a 098-only reason sent to 072b is refused (seg_reason_list).
// The REAL module runs in a vm; on plain main: ENOENT … modules/wn5_road.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const FILE = 'modules/wn5_road.js';
const SRC = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const LAB = require(path.join(ROOT, 'core/wn5-labels.js'));
const J = (x) => JSON.parse(JSON.stringify(x));
function load(features) {
  const acts = [];
  const rec = (w) => () => { acts.push(w); return 0; };
  const win = { addEventListener: rec('window.addEventListener') };
  const ctx = { console: { log() {}, warn() {}, error() {} }, window: win, Intl, Date, Math, JSON, Object, Array, String, Number, Map, Set, Promise, Error, RegExp, Symbol,
    setTimeout: rec('setTimeout'), fetch: rec('fetch'), addEventListener: rec('addEventListener'),
    document: { createElement: rec('document.createElement'), body: { appendChild: rec('body.appendChild') } }, WN5Lab: LAB };
  if (features) ctx.FEATURES = features;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: FILE });
  return { acts, added: Object.keys(win).filter((k) => k !== 'addEventListener'), R: win.WN5Road };
}
const { R } = load();
const iso = (d, h) => d + 'T' + h + ':00+03:00';
const leg = (piece_id, act, pallets, o) => Object.assign({ piece_id, act, pallets, kind: 'national', order_id: null, reference: null }, o);
const stop = (stop_id, seq, side, location_id, legs) => ({ stop_id, seq, side, location_id, planned_from: iso('2026-10-13', '06:00'), planned_to: iso('2026-10-13', '08:00'), legs });
const CYC = { rt_id: 101, stops: [
  stop(1, 1, 'ANODOS', 3, [leg(11, 'load', 12, { kind: 'vs_export', order_id: 2041, reference: 'VS-T041' }), leg(12, 'load', 18)]),
  stop(2, 2, 'ANODOS', 2, [leg(13, 'load', 4)]),
  stop(3, 3, 'ANODOS', 1, [leg(11, 'unload', 12), leg(13, 'unload', 4)]),
  stop(4, 4, 'ANODOS', 5, [leg(12, 'unload', 18)]),
  stop(5, 5, 'KATHODOS', 1, [leg(21, 'load', 9)]),
  stop(6, 6, 'KATHODOS', 2, [leg(21, 'unload', 9)])] };
const ST = (rows, o) => Object.assign({ rt_id: 101, side: 'ANODOS', point: { text: 'Λαμία, πάρκινγκ' }, win: [iso('2026-10-13', '14:30'), iso('2026-10-13', '14:31')],
  reason: 'vehicle_breakdown', note: '', acceptAll: false, rows }, o);
const row = (piece_id, total, part, go, rest) => ({ piece_id, total, part, go, rest: rest || 'wait', bad: false });
const DST = { 'rt:102': { target: { rt_id: 102, side: 'ANODOS' }, stops: [{ ref: 'n1', location_id: 1, side: 'ANODOS', planned_from: 'a', planned_to: 'b' }] },
  'tk:13': { target: { new_rt: { trip_type: 'OWNED', truck_id: 13 }, side: 'ANODOS' }, stops: [] } };

test('wn5_road.js adds exactly WN5Road and acts zero times at load', () => {
  const r = load();
  assert.deepStrictEqual(r.added, ['WN5Road']);
  assert.deepStrictEqual(r.acts, []);
});

test('the flag: off (absent or false) = WN5Road.on() false; only FEATURES.WN_ROAD === true opens', () => {
  assert.strictEqual(load().R.on(), false);
  assert.strictEqual(load({ WN_ROAD: false }).R.on(), false);
  assert.strictEqual(load({ WN_ROAD: 'on' }).R.on(), false);
  assert.strictEqual(load({ WN_ROAD: true }).R.on(), true);
});

test('loadsOf: the loads A carries on a side, in loading order, with their drop (hub = Veroia)', () => {
  const a = R.loadsOf(CYC, 'ANODOS', 1);
  assert.deepStrictEqual(J(a.map((x) => [x.piece_id, x.drop.stop_id, x.toHub])), [[11, 3, true], [12, 4, false], [13, 3, true]]);
  assert.deepStrictEqual(J(R.loadsOf(CYC, 'KATHODOS', 1).map((x) => x.piece_id)), [21]);
  assert.strictEqual(a[0].kind, 'vs_export');
});

test('windowOf: «όλη η ημέρα» = 00:00–23:59; a time = one minute from it; none = null', () => {
  assert.deepStrictEqual(J(R.windowOf('2026-10-13', true, '', iso)), [iso('2026-10-13', '00:00'), iso('2026-10-13', '23:59')]);
  assert.deepStrictEqual(J(R.windowOf('2026-10-13', false, '14:30', iso)), [iso('2026-10-13', '14:30'), iso('2026-10-13', '14:31')]);
  assert.deepStrictEqual(J(R.windowOf('2026-10-13', false, '09:59', iso)), [iso('2026-10-13', '09:59'), iso('2026-10-13', '10:00')]);
  assert.deepStrictEqual(J(R.windowOf('2026-10-13', false, '23:59', iso)), [iso('2026-10-13', '23:58'), iso('2026-10-13', '23:59')]);
  assert.strictEqual(R.windowOf('2026-10-13', false, '', iso), null);
  assert.strictEqual(R.windowOf('', true, '', iso), null);
});

test('bodyOf: 099 keys only; a load that stays whole is not sent; each truck once, by first mention', () => {
  const b = J(R.bodyOf(ST([row(11, 12, 12, 'rt:102'), row(12, 18, 18, 'keep'), row(13, 4, 4, 'rt:102')]), DST));
  assert.deepStrictEqual(Object.keys(b).sort(), ['loads', 'planned_from', 'planned_to', 'point', 'reason', 'rt_id', 'side', 'trucks']);
  assert.deepStrictEqual(b.point, { text: 'Λαμία, πάρκινγκ' });
  assert.deepStrictEqual(b.loads, [{ piece_id: 11, go: 0 }, { piece_id: 13, go: 0 }]);
  assert.strictEqual(b.trucks.length, 1);
  assert.deepStrictEqual(b.trucks[0].target, { rt_id: 102, side: 'ANODOS' });
  assert.strictEqual(b.trucks[0].stops[0].location_id, 1);
});

test('bodyOf: a catalogue place; a split sends pallets + go + rest; «μένει» of a split = stay; wait; a new truck has no empty stops', () => {
  const b = J(R.bodyOf(ST([row(12, 18, 10, 'tk:13', 'wait'), row(13, 4, 3, 'keep', 'rt:102')], { point: { location_id: 4, label: 'LARISA' }, note: 'γερανός' }), DST));
  assert.deepStrictEqual(b.point, { location_id: 4 });
  assert.strictEqual(b.note, 'γερανός');
  assert.deepStrictEqual(b.loads, [{ piece_id: 12, pallets: 10, go: 0, rest: 'wait' }, { piece_id: 13, pallets: 3, go: 'stay', rest: 1 }]);
  assert.deepStrictEqual(b.trucks.map((t) => (t.target.new_rt ? 'new' : t.target.rt_id)), ['new', 102]);
  assert.ok(!('stops' in b.trucks[0]), 'no empty stops key');
});

test('bodyOf: the explicit yes to a busy truck = accept_busy on the body AND inside every truck target (099 / 086)', () => {
  const b = J(R.bodyOf(ST([row(11, 12, 12, 'rt:102')], { acceptAll: true }), DST));
  assert.strictEqual(b.accept_busy, true);
  assert.strictEqual(b.trucks[0].target.accept_busy, true);
  const c = J(R.bodyOf(ST([row(11, 12, 12, 'rt:102')]), DST));
  assert.ok(!('accept_busy' in c) && !('accept_busy' in c.trucks[0].target));
});

test('lacks: the one «Λείπει» list — point, time, reason, pallets, nothing leaving', () => {
  assert.deepStrictEqual(J(R.lacks(ST([row(11, 12, 12, 'rt:102')]))), []);
  assert.deepStrictEqual(J(R.lacks(ST([row(11, 12, 12, 'keep')], { point: null, win: null, reason: '' }))), ['σημείο', 'ημέρα και ώρα', 'λόγος', 'φορτηγό για ένα φορτίο τουλάχιστον']);
  assert.deepStrictEqual(J(R.lacks(ST([Object.assign(row(11, 12, 12, 'rt:102'), { bad: true })]))), ['παλέτες', 'φορτηγό για ένα φορτίο τουλάχιστον']);
  assert.deepStrictEqual(J(R.lacks(ST([row(11, 12, 5, 'keep', 'keep')]))), ['φορτηγό για ένα φορτίο τουλάχιστον'], 'a split whose both parts stay moves nothing');
  assert.deepStrictEqual(J(R.lacks(ST([row(11, 12, 5, 'keep', 'wait')]))), [], 'the rest waits there: something leaves A');
});

test('handoverBody: 072b keys; a 098-only reason goes as the reason note, never as reason; same driver by default', () => {
  const st = ST([], { reason: 'meeting', note: 'στο πάρκινγκ' });
  const b = J(R.handoverBody(st, 13, 'same', false));
  assert.deepStrictEqual(b, { at: st.win[0], place_note: 'Λαμία, πάρκινγκ', reason_note: 'Συνάντηση · στο πάρκινγκ', vehicle: { trip_type: 'OWNED', truck_id: 13 }, same_driver: true });
  const c = J(R.handoverBody(ST([], { point: { location_id: 4, label: 'LARISA' } }), 13, 33, true));
  assert.deepStrictEqual(c, { at: st.win[0], place_note: 'LARISA', reason: 'vehicle_breakdown', vehicle: { trip_type: 'OWNED', truck_id: 13, driver_id: 33 }, accept_busy: true });
});
