// node --test tests/wn5-order-body.test.js
// National v5 F4α-T20: the order form's body (modules/wn5_forms.js, WN5Form._body and friends).
// Why: the Worker's replay (decision 44) recognises a resend only when the SAME request_id carries the SAME
// body (md5 of p without request_id, 072 plan_h_replay): a body built from the clock or from the live board
// would turn a lost answer into request_reused, or into a second order. And plan_h_keys refuses every unknown
// key (072:125): the body is exactly the keys of plan_orders_create, numbers as JSON numbers.
// The REAL modules/wn5_forms.js runs in a vm (no DOM is touched at load); the pure seams are called directly.
// The load-is-inert and app.html checks of the file live here too (one file per new module of batch C).
// On plain main: ENOENT … modules/wn5_forms.js (every test ✖).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const FILE = 'modules/wn5_forms.js';
const SRC = fs.readFileSync(path.join(ROOT, FILE), 'utf8');

// Load with recorders: with nothing opened, the file may only define its global.
function load() {
  const acts = [];
  const rec = (w) => () => { acts.push(w); return 0; };
  const win = { addEventListener: rec('window.addEventListener') };
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} }, window: win, Intl, Date, Math, JSON,
    Object, Array, String, Number, Map, Set, Promise, Error, RegExp, Symbol,
    addEventListener: rec('addEventListener'), setTimeout: rec('setTimeout'), setInterval: rec('setInterval'),
    requestAnimationFrame: rec('requestAnimationFrame'), queueMicrotask: rec('queueMicrotask'), fetch: rec('fetch'),
    MutationObserver: function () { acts.push('MutationObserver'); }, ResizeObserver: function () { acts.push('ResizeObserver'); },
    document: { addEventListener: rec('document.addEventListener'), createElement: rec('document.createElement'),
      querySelector: rec('document.querySelector'), getElementById: rec('document.getElementById'),
      body: { appendChild: rec('body.appendChild') }, head: { appendChild: rec('head.appendChild') } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: FILE });
  return { acts, added: Object.keys(win).filter((k) => k !== 'addEventListener'), F: win.WN5Form };
}
const { F } = load();
// Values made in the vm have the vm's Object prototype: compare their JSON, not their identity.
const J = (x) => JSON.parse(JSON.stringify(x));

// A cut of a function's source by name (brace counter), for the static rules.
function grab(name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(SRC);
  if (!m) throw new Error(name + ' not found in ' + FILE);
  let i = SRC.indexOf('{', m.index), d = 0;
  for (let j = i; j < SRC.length; j++) { if (SRC[j] === '{') d++; else if (SRC[j] === '}' && --d === 0) return SRC.slice(m.index, j + 1); }
  throw new Error(name + ' unbalanced');
}

const row = (location_id, day, from, to, pallets, extra) => Object.assign({ location_id, day, from, to, pallets }, extra || {});
const order = (o) => Object.assign({ client_id: 41, price: 310, temperature_c: 4, pallet_exchange: false, reference: '', goods: '', notes: '',
  loads: [row(3, '2026-10-14', '11:00', '12:00', 6)], drops: [row(2, '2026-10-15', '08:00', '10:00', 6)] }, o || {});
const state = (o) => Object.assign({ side: 'KATHODOS', target: null, cycleStops: [], orders: [order()] }, o || {});

test('F4α-T20: wn5_forms.js adds exactly WN5Form and acts zero times at load', () => {
  const r = load();
  assert.deepStrictEqual(r.added, ['WN5Form']);
  assert.deepStrictEqual(r.acts, [], 'acted at load: ' + r.acts.join(', '));
});

test('F4α-T20: app.html loads wn5_forms.js once, right after wn5_veroia.js, with ?v=', () => {
  const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  const tags = html.match(/<script src="modules\/wn5_forms\.js\?v=\d+"><\/script>/g) || [];
  assert.strictEqual(tags.length, 1, 'tags: ' + tags.length);
  assert.ok(/modules\/wn5_veroia\.js\?v=\d+"><\/script>\s*<script src="modules\/wn5_forms\.js\?v=\d+"/.test(html), 'not right after wn5_veroia.js');
});

test('F4α-T20: the same state gives the same JSON bytes (a resend is a replay, not a new order)', () => {
  assert.strictEqual(JSON.stringify(F._body(state())), JSON.stringify(F._body(state())));
});

test('F4α-T20: the body is exactly plan_orders_create\'s keys, numbers as JSON numbers, Athens offsets', () => {
  const b = F._body(state());
  assert.deepStrictEqual(J(Object.keys(b)), ['orders']);
  assert.deepStrictEqual(J(b.orders[0]), {
    client_id: 41, price: 310, pallet_exchange: false, direction: 'KATHODOS', temperature_c: 4,
    shipments: [{ origin_location_id: 3, dest_location_id: 2, pallets: 6,
      load_from: '2026-10-14T11:00:00+03:00', load_to: '2026-10-14T12:00:00+03:00',
      deliver_from: '2026-10-15T08:00:00+03:00', deliver_to: '2026-10-15T10:00:00+03:00' }] });
  assert.strictEqual(typeof b.orders[0].shipments[0].pallets, 'number');
});

test('F4α-T20: one decimal at most; 12.5 passes, 12.55 is a form line (decision 20)', () => {
  const ok = state({ orders: [order({ loads: [row(3, '2026-10-14', '11:00', '12:00', 12.5)], drops: [row(2, '2026-10-15', '08:00', '10:00', 12.5)] })] });
  assert.deepStrictEqual(J(F._check(ok)), []);
  const bad = state({ orders: [order({ loads: [row(3, '2026-10-14', '11:00', '12:00', 12.55)], drops: [row(2, '2026-10-15', '08:00', '10:00', 12.55)] })] });
  assert.ok(F._check(bad).some((l) => /ένα δεκαδικό/.test(l)), F._check(bad).join(' / '));
});

test('F4α-T20: 2 loads × 1 delivery → 2 shipments; 1 × 2 → 2; N×M is refused on the screen (Ε-19)', () => {
  const two = order({ loads: [row(3, '2026-10-12', '08:00', '10:00', 6), row(5, '2026-10-12', '10:30', '12:00', 4)], drops: [row(2, '2026-10-13', '06:00', '08:00', 10)] });
  const b = F._body(state({ orders: [two] }));
  assert.deepStrictEqual(J(b.orders[0].shipments).map((s) => [s.origin_location_id, s.dest_location_id, s.pallets]), [[3, 2, 6], [5, 2, 4]]);
  const fan = order({ loads: [row(3, '2026-10-12', '08:00', '10:00', 10)], drops: [row(2, '2026-10-13', '06:00', '08:00', 4), row(4, '2026-10-13', '09:00', '10:00', 6)] });
  assert.deepStrictEqual(J(F._body(state({ orders: [fan] })).orders[0].shipments).map((s) => [s.origin_location_id, s.dest_location_id, s.pallets]), [[3, 2, 4], [3, 4, 6]]);
  const nm = order({ loads: [row(3, '2026-10-12', '08:00', '10:00', 5), row(5, '2026-10-12', '10:00', '11:00', 5)], drops: [row(2, '2026-10-13', '06:00', '08:00', 5), row(4, '2026-10-13', '09:00', '10:00', 5)] });
  assert.ok(F._check(state({ orders: [nm] })).some((l) => /ένα ζεύγος ανά γραμμή/.test(l)));
  assert.throws(() => F._body(state({ orders: [nm] })), /ένα ζεύγος ανά γραμμή/);
});

test('F4α-T20: loaded pallets must equal delivered pallets per order (a form line, nothing sent)', () => {
  const o = order({ drops: [row(2, '2026-10-15', '08:00', '10:00', 5)] });
  assert.ok(F._check(state({ orders: [o] })).some((l) => /παλέτες φόρτωσης/.test(l)));
});

test('F4α-T20: price is required, never a 0 default', () => {
  for (const price of [null, 0, -5, NaN]) {
    const lines = F._check(state({ orders: [order({ price })] }));
    assert.ok(lines.some((l) => l.includes('Τιμή € (χωρίς ΦΠΑ) *')), `price ${price}: ${lines.join(' / ')}`);
  }
  assert.ok(!/price\s*:\s*0\b|price\s*\|\|\s*0/.test(grab('_body')), 'a 0 default for the price in _body');
});

test('F4α-T20: _body, _stops, _pairs and _iso read no clock and no board', () => {
  for (const n of ['_body', '_stops', '_pairs', '_iso']) {
    const src = grab(n);
    assert.ok(!/Date\.now\s*\(/.test(src), n + ' calls Date.now()');
    assert.ok(!/new Date\(\s*\)/.test(src), n + ' calls new Date() without an argument');
    assert.ok(!/\bWN5\.|findAfterReuse|\.board\b|document\./.test(src), n + ' reads the board or the DOM');
  }
});

test('F4α-T20: Athens offsets on both sides of the DST change of 25/10/2026', () => {
  assert.strictEqual(F._iso('2026-10-24', '16:00'), '2026-10-24T16:00:00+03:00');
  assert.strictEqual(F._iso('2026-10-26', '06:00'), '2026-10-26T06:00:00+02:00');
  assert.strictEqual(F._iso('2026-10-24', '25:00'), null);
  assert.deepStrictEqual(J(F._parts('2026-10-26T04:00:00+00:00')), { day: '2026-10-26', hm: '06:00' });
});

test('F4α-T20: with a target, an existing stop of the side is referenced by stop_id, a new place gets one new stop', () => {
  const st = state({
    target: { rt_id: 101, side: 'KATHODOS' },
    cycleStops: [{ stop_id: 1001, location_id: 1, side: 'KATHODOS' }, { stop_id: 1005, location_id: 1, side: 'ANODOS' }],
    orders: [order({ loads: [row(1, '2026-10-12', '16:00', '18:00', 4)], drops: [row(4, '2026-10-13', '10:00', '12:00', 4)] }),
             order({ client_id: 42, loads: [row(1, '2026-10-12', '16:00', '18:00', 2)], drops: [row(4, '2026-10-13', '09:00', '11:00', 2)] })],
  });
  const b = F._body(st);
  assert.deepStrictEqual(J(b.target), { rt_id: 101, side: 'KATHODOS' });
  assert.deepStrictEqual(J(b.stops), [
    { ref: 's1', stop_id: 1001 },
    { ref: 's2', location_id: 4, side: 'KATHODOS', planned_from: '2026-10-13T09:00:00+03:00', planned_to: '2026-10-13T12:00:00+03:00' }]);
  const ids = b.stops.filter((s) => s.stop_id).map((s) => s.stop_id);
  assert.strictEqual(new Set(ids).size, ids.length, 'a stop_id twice');
});

test('F4α-T20: ANODOS arrival at Veroia «ως» → deliver_from = deliver_to; with a target it needs the cycle\'s Veroia stop', () => {
  const o = order({ loads: [row(3, '2026-10-14', '12:00', '14:00', 20)], drops: [row(1, '2026-10-14', '22:00', '22:00', 20, { until: true })] });
  const b = F._body(state({ side: 'ANODOS', orders: [o] }));
  assert.strictEqual(b.orders[0].shipments[0].deliver_from, b.orders[0].shipments[0].deliver_to);
  const noStop = state({ side: 'ANODOS', target: { rt_id: 102, side: 'ANODOS' }, cycleStops: [{ stop_id: 1101, location_id: 2, side: 'ANODOS' }], orders: [o] });
  assert.ok(F._check(noStop).some((l) => /στάση Βέροιας στην ΑΝΟΔΟ/.test(l)), F._check(noStop).join(' / '));
});

test('F4α-T20: request_reused — the board holds the order of the same client, reference and pallets', () => {
  const body = F._body(state({ orders: [order({ reference: 'N-T900' })] }));
  const board = { waiting: [{ piece_id: 1, nat_order_id: 3900, client_id: 41, reference: 'N-T900', pallets: 6 },
                            { piece_id: 2, nat_order_id: 3899, client_id: 41, reference: 'N-T900', pallets: 9 }], hub: [], cycles: [] };
  assert.deepStrictEqual(J(F._findOrders(board, body)), [{ nat_order_id: 3900, reference: 'N-T900' }]);
  assert.strictEqual(F._findOrders({ waiting: [], hub: [], cycles: [] }, body), null);
});

test('F4α-T20: edit sends only what changed; nothing changed = empty body', () => {
  const orig = { nat_order_id: 3101, price: 310, temperature_c: 4, reference: 'N-T101', pallet_exchange: false, goods: '', notes: '',
    ships: [{ shipment_id: 5101, pallets: 8, load_from: '2026-10-12T05:00:00+00:00', load_to: '2026-10-12T07:00:00+00:00', deliver_from: '2026-10-13T05:00:00+00:00', deliver_to: '2026-10-13T07:00:00+00:00' }] };
  const same = { price: 310, temperature_c: 4, reference: 'N-T101', pallet_exchange: false, goods: '', notes: '',
    ships: [{ shipment_id: 5101, pallets: 8, load_from: '2026-10-12T08:00:00+03:00', load_to: '2026-10-12T10:00:00+03:00', deliver_from: '2026-10-13T08:00:00+03:00', deliver_to: '2026-10-13T10:00:00+03:00' }] };
  assert.deepStrictEqual(J(F._patchBody(orig, same)), {});
  const ch = Object.assign({}, same, { price: 330, ships: [Object.assign({}, same.ships[0], { pallets: 7 })] });
  assert.deepStrictEqual(J(F._patchBody(orig, ch)), { set: { price: 330 }, shipments: [{ shipment_id: 5101, pallets: 7 }] });
});

// 075 (live bug 28/10, order #17): the form's Κατεύθυνση reaches the base - on create for every order of the form, and
// on edit only when it changed; never a value the base would refuse (KATHODOS / ANODOS only).
test('075: the side is sent - create carries the form\'s Κατεύθυνση; edit only a change, never an empty one', () => {
  for (const side of ['KATHODOS', 'ANODOS']) {
    const b = F._body(state({ side, orders: [order(), order({ client_id: 42 })] }));
    assert.deepStrictEqual(J(b.orders.map((o) => o.direction)), [side, side]);
  }
  assert.ok(!('direction' in F._body(state({ side: 'NORTH' })).orders[0]), 'an unknown side is not sent');
  const orig = { direction: null, ships: [] };
  assert.deepStrictEqual(J(F._patchBody(orig, { direction: 'ANODOS', ships: [] })), { set: { direction: 'ANODOS' } });
  assert.deepStrictEqual(J(F._patchBody({ direction: 'ANODOS', ships: [] }, { direction: 'ANODOS', ships: [] })), {});
  assert.deepStrictEqual(J(F._patchBody({ direction: 'ANODOS', ships: [] }, { direction: null, ships: [] })), {});
});


// F13 (live test 28/10, coordinator): the edit form opened on an order sends NOTHING when nothing changed, and one
// changed field sends only that field - empty or unset fields (notes, PE, shipments it could not show) are never
// written. The DB-level proof (0 rows written) is the F13 session's rig (a new read, 077).
test('F13: open + save with no change sends no field; one change sends only that field', () => {
  const ship = { shipment_id: 7, pallets: 6, load_from: '2026-10-14T11:00:00+03:00', load_to: '2026-10-14T12:00:00+03:00',
    deliver_from: '2026-10-15T08:00:00+03:00', deliver_to: '2026-10-15T10:00:00+03:00' };
  const orig = { price: 310, reference: 'R1', goods: 'G', notes: 'a note', temperature_c: 4, pallet_exchange: true, direction: 'ANODOS', ships: [ship] };
  const same = { ...orig, ships: [{ ...ship, load_from: '2026-10-14T08:00:00.000Z' }] };   // the same instant in UTC
  assert.deepStrictEqual(J(F._patchBody(orig, same)), {});
  const blank = { price: null, reference: '', goods: '', notes: '', temperature_c: null, pallet_exchange: null, direction: null, ships: [] };
  assert.deepStrictEqual(J(F._patchBody(orig, blank)), {}, 'what the form could not show is never sent as empty');
  assert.deepStrictEqual(J(F._patchBody(orig, { ...same, notes: 'changed' })), { set: { notes: 'changed' } });
  assert.deepStrictEqual(J(F._patchBody(orig, { ...same, ships: [{ ...ship, pallets: 8 }] })), { shipments: [{ shipment_id: 7, pallets: 8 }] });
});
