// tests/wi4-logic.test.js — run: node --test tests/wi4-logic.test.js
// TECH_DESIGN §b (v2Decide) and §d (points, flags, day header, queue,
// keyboard, conflict data, presence pacing, menu sections). Zero dependencies.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const WI4 = require('../core/wi4-logic.js');

const T = '2026-10-06'; // a Tuesday
const add = (d, n) => { const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)); return t.toISOString().slice(0, 10); };
const codes = (r) => r.reasons.map((x) => x.code);
const reasonOf = (r, code) => r.reasons.find((x) => x.code === code);

// ─── load: node and browser ────────────────────────────────────────────
test('loads as a node module and as a browser global (only window.WI4)', () => {
  assert.strictEqual(typeof WI4.flags, 'function');
  assert.ok(Object.isFrozen(WI4));
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const before = new Set(Object.keys(ctx));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/wi4-logic.js'), 'utf8'), ctx, { filename: 'core/wi4-logic.js' });
  assert.deepStrictEqual(Object.keys(ctx).filter((k) => !before.has(k)), ['WI4']);
  assert.strictEqual(typeof ctx.WI4.queue, 'function');
  assert.strictEqual(ctx.WI4.__wi4Placeholder, undefined, 'the WP0 placeholder marker must be gone');
});

// ─── §b v2Decide ───────────────────────────────────────────────────────
test('v2Decide: the nine cases of §b', () => {
  const d = (flag, extra) => WI4.v2Decide(Object.assign({ flag, pilot: ['pilotuser'], user: 'someone' }, extra));
  assert.strictEqual(d('off', { optIn: '1' }), 'old');
  assert.strictEqual(d('off', { user: 'pilotuser' }), 'old');
  assert.strictEqual(d(true, { optIn: '1' }), 'old');
  assert.strictEqual(d('pilot', { optIn: '1' }), 'v4');
  assert.strictEqual(d('pilot', {}), 'old');
  assert.strictEqual(d('pilot', { user: 'pilotuser' }), 'v4');
  assert.strictEqual(d('pilot', { user: 'pilotuser', optIn: '0' }), 'old');
  assert.strictEqual(d('on', { optIn: '0' }), 'old');
  assert.strictEqual(d('on', {}), 'v4');
});

test('v2Decide / normFlag: anything unknown is \'off\' (principle 5)', () => {
  for (const bad of [undefined, null, true, false, 'On', 'pilott', 1, {}]) {
    assert.strictEqual(WI4.normFlag(bad), 'off', String(bad));
    assert.strictEqual(WI4.v2Decide({ flag: bad, optIn: '1', pilot: ['u'], user: 'u' }), 'old');
  }
  assert.strictEqual(WI4.normFlag('pilot'), 'pilot');
  assert.strictEqual(WI4.normFlag('on'), 'on');
  assert.strictEqual(WI4.v2Decide(), 'old');
  // An empty user never matches a pilot list that contains ''.
  assert.strictEqual(WI4.v2Decide({ flag: 'pilot', pilot: [''], user: '' }), 'old');
});

// ─── §d.1 points ───────────────────────────────────────────────────────
const stops = (n) => Array.from({ length: n }, (_, i) => ({ n: i + 1, label: 'Πελάτης ' + (i + 1), place: 'Τόπος ' + (i + 1), pallets: i + 1, done: false }));

test('points: 1, 2, 3 stops at 207px all show; a single stop has no badge', () => {
  const one = WI4.points(stops(1), 207);
  assert.strictEqual(one.shown.length, 1);
  assert.strictEqual(one.shown[0].badge, null);
  assert.strictEqual(one.more, null);
  const two = WI4.points(stops(2), 207);
  assert.deepStrictEqual(two.shown.map((s) => s.badge), [1, 2]);
  const three = WI4.points(stops(3), 207);
  assert.strictEqual(three.shown.length, 3);
  assert.strictEqual(three.more, null);
});

test('points: 4 stops — all from 248px; below it the largest k that fits WITH the chip', () => {
  assert.strictEqual(WI4.points(stops(4), 248).shown.length, 4);
  // With the opts of §d.1 (min 56, gap 8, chip 34) 3 points + «+1» need
  // 3·56 + 3·8 + 34 = 226px. So at 207px and at 200px the rule shows 2 + «+2».
  // The §d.1 prose estimated «3 + +1» there; the arithmetic of its own rule
  // (and Figma 1097:2895, five stops at 207px = 2 + «+3») says 2. Reported.
  for (const w of [207, 200]) {
    const r = WI4.points(stops(4), w);
    assert.strictEqual(r.shown.length, 2, `at ${w}px`);
    assert.deepStrictEqual({ count: r.more.count, pallets: r.more.pallets }, { count: 2, pallets: 3 + 4 });
  }
  const r226 = WI4.points(stops(4), 226);
  assert.strictEqual(r226.shown.length, 3);
  assert.strictEqual(r226.more.count, 1);
  assert.strictEqual(r226.more.pallets, 4);
});

test('points: 5 and 9 stops — first 3 + «+(n−3)», shrunk when 3 + chip do not fit', () => {
  const five = WI4.points(stops(5), 226);
  assert.strictEqual(five.shown.length, 3);
  assert.strictEqual(five.more.count, 2);
  assert.strictEqual(five.more.pallets, 4 + 5);
  const nine = WI4.points(stops(9), 400);
  assert.strictEqual(nine.shown.length, 3, 'never more than 3 for 5+ stops, even with room');
  assert.strictEqual(nine.more.count, 6);
  assert.strictEqual(nine.more.pallets, 4 + 5 + 6 + 7 + 8 + 9);
  const fig = WI4.points(stops(5), 207);  // Figma 1097:2895: «1 · 2 · +3»
  assert.strictEqual(fig.shown.length, 2);
  assert.strictEqual(fig.more.count, 3);
  assert.match(fig.more.title, /Πελάτης 3 · Τόπος 3\nΠελάτης 4 · Τόπος 4\nΠελάτης 5 · Τόπος 5/);
  // Never zero points: at least the first stop, even in a tiny column.
  const tiny = WI4.points(stops(9), 60);
  assert.strictEqual(tiny.shown.length, 1);
  assert.strictEqual(tiny.more.count, 8);
});

test('points: places hide when a point keeps less than badge + 46px', () => {
  // 3 stops at 186px: all fit (184), each point gets (186−16)/3 = 56.7px,
  // 56.7 − 12 < 46 → the place hides, the label keeps the width.
  const tight = WI4.points(stops(3), 186);
  assert.strictEqual(tight.shown.length, 3);
  assert.strictEqual(tight.hidePlace, true);
  // 4 stops at 170px: 2 + «+2», each point (170 − 8 − 8 − 34)/2 = 60px → room
  // for the place (60 − 12 = 48 ≥ 46). The §d.1 case list expected hidden
  // places here; under its own rule they show. Reported with the 3+«+1» case.
  const r170 = WI4.points(stops(4), 170);
  assert.strictEqual(r170.shown.length, 2);
  assert.strictEqual(r170.hidePlace, false);
  assert.strictEqual(WI4.points(stops(2), 207).hidePlace, false);
});

test('points: no double tick on a single loading with a date tick; ticks on two done stops; delay kept', () => {
  const single = [{ n: 1, label: 'Α', place: 'Χ', pallets: 33, done: true }];
  assert.strictEqual(WI4.points(single, 207, { dateTick: true }).shown[0].tick, false);
  assert.strictEqual(WI4.points(single, 207, { dateTick: false }).shown[0].tick, true);
  const two = [{ n: 1, label: 'Α', done: true }, { n: 2, label: 'Β', done: true }];
  assert.deepStrictEqual(WI4.points(two, 207, { dateTick: true }).shown.map((s) => s.tick), [true, true]);
  const delayed = [{ n: 1, label: 'Α', done: false, delayH: 4 }, { n: 2, label: 'Β', done: false }];
  assert.strictEqual(WI4.points(delayed, 207).shown[0].delayH, 4);
});

test('points: an unmeasured width never shrinks on a guess', () => {
  assert.strictEqual(WI4.points(stops(4), 0).shown.length, 4);
  assert.strictEqual(WI4.points(stops(4), NaN).hidePlace, false);
  assert.strictEqual(WI4.points(stops(7), undefined).shown.length, 3);
  assert.deepStrictEqual(WI4.points([], 207), { shown: [], more: null, hidePlace: false });
});

// ─── §d.2 flags ────────────────────────────────────────────────────────
const exp = (o) => Object.assign({ kind: 'export', saved: true, partner: false, hasReturn: true, natState: 'ok', natLegs: [], pallets: 20 }, o);
const OFFS = [-1, 0, 1, 2, 3, 6];

test('NO_TRUCK: red up to tomorrow (past included), amber beyond — never silent', () => {
  const want = { '-1': 'red', 0: 'red', 1: 'red', 2: 'amber', 3: 'amber', 6: 'amber' };
  for (const k of OFFS) {
    const r = WI4.flags(exp({ saved: false, loadDate: add(T, k) }), T);
    assert.strictEqual(reasonOf(r, 'NO_TRUCK').level, want[k], `today${k >= 0 ? '+' : ''}${k}`);
    assert.strictEqual(reasonOf(r, 'NO_TRUCK').text, 'χωρίς φορτηγό');
    assert.strictEqual(reasonOf(r, 'NO_TRUCK').act, 'assign');
  }
  assert.strictEqual(reasonOf(WI4.flags(exp({ saved: false }), T), 'NO_TRUCK').level, 'red', 'no loading date = red');
  // An own import without a truck is a truck row too.
  assert.ok(codes(WI4.flags({ kind: 'import', saved: false, partner: false, loadDate: add(T, 6) }, T)).includes('NO_TRUCK'));
  // A partner is an assignment; sub-rows never carry one.
  assert.ok(!codes(WI4.flags(exp({ saved: false, partner: true, loadDate: T }), T)).includes('NO_TRUCK'));
  for (const kind of ['leg', 'split', 'relay']) assert.ok(!codes(WI4.flags({ kind, saved: false, loadDate: T }, T)).includes('NO_TRUCK'), kind);
});

test('NO_TRUCK on an executing row with no truck still flags', () => {
  const r = WI4.flags(exp({ saved: false, executing: true, loadDate: add(T, -2) }), T);
  assert.strictEqual(r.level, 'red');
  assert.ok(codes(r).includes('NO_TRUCK'));
});

test('EMPTY_RETURN: nothing while R > today+2, amber R−2…R, red after R', () => {
  const want = { '-1': null, 0: 'amber', 1: 'amber', 2: 'amber', 3: null, 6: null }; // keyed by R − today, negated below
  for (const k of [-1, 0, 1, 2, 3, 6]) {
    // R = today + k: today − R = −k.
    const r = WI4.flags(exp({ hasReturn: false, returnDate: add(T, k), returnPlace: 'Τόπος, CZ' }), T);
    const er = reasonOf(r, 'EMPTY_RETURN');
    const expected = k < 0 ? 'red' : want[k];
    assert.strictEqual(er ? er.level : null, expected, `R = today${k >= 0 ? '+' : ''}${k}`);
  }
  const past = reasonOf(WI4.flags(exp({ hasReturn: false, returnDate: add(T, -3), returnPlace: 'Τόπος, CZ' }), T), 'EMPTY_RETURN');
  assert.strictEqual(past.text, 'κενό γύρισμα · από Σάβ 3/10 · Τόπος, CZ');
  assert.strictEqual(past.age, 3);
  assert.strictEqual(past.act, 'newImport');
  assert.strictEqual(reasonOf(WI4.flags(exp({ hasReturn: false }), T), 'EMPTY_RETURN').level, 'amber', 'no R = amber');
});

test('EMPTY_RETURN: a partner row never gets it; an import never gets it', () => {
  for (const k of OFFS) assert.ok(!codes(WI4.flags(exp({ partner: true, saved: false, hasReturn: false, returnDate: add(T, k), loadDate: add(T, 9) }), T)).includes('EMPTY_RETURN'));
  assert.ok(!codes(WI4.flags({ kind: 'import', saved: true, hasReturn: false, returnDate: add(T, -2) }, T)).includes('EMPTY_RETURN'));
});

test('NAT_NO_CARRIER: red up to tomorrow, amber beyond, only when national legs were read', () => {
  const want = { '-1': 'red', 0: 'red', 1: 'red', 2: 'amber', 3: 'amber', 6: 'amber' };
  for (const k of OFFS) {
    const r = WI4.flags(exp({ natLegs: [{ side: 'to', date: add(T, k), carrier: false }] }), T);
    assert.strictEqual(reasonOf(r, 'NAT_NO_CARRIER').level, want[k]);
    assert.strictEqual(reasonOf(r, 'NAT_NO_CARRIER').side, 'to');
  }
  const two = WI4.flags(exp({ natLegs: [{ side: 'to', date: T, carrier: false }, { side: 'from', date: add(T, 4), carrier: false }, { side: 'from', date: T, carrier: true }] }), T);
  assert.strictEqual(two.reasons.filter((x) => x.code === 'NAT_NO_CARRIER').length, 2, 'one reason per leg, a leg with carrier none');
  for (const st of ['loading', 'err', undefined]) {
    const r = WI4.flags(exp({ natState: st, natLegs: [{ side: 'to', date: T, carrier: false }] }), T);
    assert.ok(!codes(r).includes('NAT_NO_CARRIER'), `natState ${st}: an unread leg is not «χωρίς μεταφορέα»`);
  }
});

test('sourceReasons: \'err\' → exactly one NAT_UNKNOWN; one SOURCE_UNKNOWN per failed source', () => {
  const nat = WI4.sourceReasons({ natState: 'err' });
  assert.deepStrictEqual(nat.map((r) => r.code), ['NAT_UNKNOWN']);
  assert.strictEqual(nat[0].level, 'amber');
  assert.strictEqual(nat[0].text, 'Τα εθνικά σκέλη δεν φορτώθηκαν — δεν σημαίνει ότι δεν έχουν μεταφορέα');
  assert.deepStrictEqual(WI4.sourceReasons({ natState: 'loading' }), []);
  const all = WI4.sourceReasons({ natState: 'ok', crossWeekOk: false, relayState: 'err', stockState: 'failed' });
  assert.deepStrictEqual(all.map((r) => [r.code, r.source]), [['SOURCE_UNKNOWN', 'crossWeek'], ['SOURCE_UNKNOWN', 'relay'], ['SOURCE_UNKNOWN', 'stock']]);
  assert.strictEqual(all[0].text, 'Δεν φορτώθηκε: φορτώσεις W+1 — δεν σημαίνει ότι δεν υπάρχουν');
  assert.ok(all.every((r) => r.act === 'retry'));
  assert.deepStrictEqual(WI4.sourceReasons({ crossWeekOk: true, relayState: 'ok', stockState: 'ok' }), []);
});

test('the amber reasons: DATE_MISMATCH, OVER_33 (33 allowed), SAME_DAY, LATE', () => {
  assert.ok(codes(WI4.flags({ kind: 'import', saved: true, vsCdDate: add(T, 2), natDelDate: add(T, 1) }, T)).includes('DATE_MISMATCH'));
  assert.ok(!codes(WI4.flags({ kind: 'import', saved: true, vsCdDate: add(T, 1), natDelDate: add(T, 1) }, T)).includes('DATE_MISMATCH'));
  assert.ok(codes(WI4.flags(exp({ vsCdDate: T, natLoadDate: add(T, 1) }), T)).includes('DATE_MISMATCH'));
  assert.ok(!codes(WI4.flags(exp({ vsCdDate: add(T, 1), natLoadDate: T }), T)).includes('DATE_MISMATCH'));
  assert.ok(!codes(WI4.flags(exp({ pallets: 33 }), T)).includes('OVER_33'));
  assert.strictEqual(reasonOf(WI4.flags(exp({ pallets: 34 }), T), 'OVER_33').text, 'πάνω από 33π');
  const sd = reasonOf(WI4.flags(exp({ sameDayClash: 'Ίδιο φορτηγό σε δύο φορτώσεις την ίδια μέρα' }), T), 'SAME_DAY');
  assert.strictEqual(sd.text, 'Ίδιο φορτηγό σε δύο φορτώσεις την ίδια μέρα');
  assert.strictEqual(reasonOf(WI4.flags(exp({ late: true }), T), 'LATE').level, 'amber');
  for (const c of ['DATE_MISMATCH', 'OVER_33', 'SAME_DAY', 'LATE']) assert.strictEqual(WI4.GROUP[c] || 'look', 'look');
});

test('PREORDER follows preorderLevel; SAVE_FAILED is red', () => {
  assert.strictEqual(reasonOf(WI4.flags(exp({ preorder: { level: 'red' } }), T), 'PREORDER').level, 'red');
  assert.strictEqual(reasonOf(WI4.flags(exp({ preorder: { level: 'amber' } }), T), 'PREORDER').level, 'amber');
  assert.ok(!codes(WI4.flags(exp({ preorder: { level: 'normal' } }), T)).includes('PREORDER'));
  const sf = reasonOf(WI4.flags(exp({ syncErr: 'Save failed' }), T), 'SAVE_FAILED');
  assert.strictEqual(sf.level, 'red');
  assert.strictEqual(sf.text, 'δεν αποθηκεύτηκε');
});

test('two reasons → the worst wins; a clean row has level null', () => {
  const r = WI4.flags(exp({ pallets: 34, saved: false, loadDate: T }), T);
  assert.deepStrictEqual(codes(r).sort(), ['NO_TRUCK', 'OVER_33']);
  assert.strictEqual(r.level, 'red');
  const a = WI4.flags(exp({ pallets: 34, late: true }), T);
  assert.strictEqual(a.level, 'amber');
  assert.deepStrictEqual(WI4.flags(exp({}), T), { level: null, reasons: [] });
});

// ─── §d.3 plurals, day header ──────────────────────────────────────────
test('plural: n=1 and n=2 for every key', () => {
  const want = {
    truck: ['1 φορτηγό', '2 φορτηγά'], load: ['1 φορτίο', '2 φορτία'],
    emptyReturn: ['1 κενό γύρισμα', '2 κενά γυρίσματα'],
    natNoCarrier: ['1 σκέλος χωρίς μεταφορέα', '2 σκέλη χωρίς μεταφορέα'],
    pending: ['1 εκκρεμές', '2 εκκρεμή'], urgent: ['1 επείγον', '2 επείγοντα'], day: ['1 ημέρα', '2 ημέρες'],
  };
  assert.deepStrictEqual(Object.keys(WI4.PLURAL).sort(), Object.keys(want).sort());
  for (const [k, [one, two]] of Object.entries(want)) {
    assert.strictEqual(WI4.plural(1, k), one);
    assert.strictEqual(WI4.plural(2, k), two);
  }
  assert.throws(() => WI4.plural(2, 'nope'), /unknown key/);
});

test('dayCounts + dayText: both parenthesis forms and the national legs', () => {
  // Figma: «4 φορτηγά · 2 κενά γυρίσματα (1 από σήμερα)».
  const day = [
    exp({ hasReturn: false, returnDate: T }),
    exp({ hasReturn: false, returnDate: add(T, -3) }),
    exp({}), { kind: 'import', saved: true, partner: false, natState: 'ok' },
    { kind: 'relay', saved: true, natState: 'ok' },
  ];
  const c = WI4.dayCounts(day, T);
  assert.deepStrictEqual(c, { trucks: 4, byCode: { EMPTY_RETURN: 2 }, todayEmpty: 1, emptyOldest: 3 });
  assert.strictEqual(WI4.dayText(c), '4 φορτηγά · 2 κενά γυρίσματα (1 από σήμερα)');
  // «(N ημέρες)» with the oldest gap when none starts today.
  const c2 = WI4.dayCounts([exp({ hasReturn: false, returnDate: add(T, -3) }), exp({ natLegs: [{ side: 'to', date: T, carrier: false }] })], T);
  assert.strictEqual(WI4.dayText(c2), '2 φορτηγά · 1 κενό γύρισμα (3 ημέρες) · 1 σκέλος χωρίς μεταφορέα');
  const c3 = WI4.dayCounts([exp({ hasReturn: false, returnDate: add(T, -1) })], T);
  assert.strictEqual(WI4.dayText(c3), '1 φορτηγό · 1 κενό γύρισμα (1 ημέρα)');
  // No parenthesis when every gap is still ahead.
  assert.strictEqual(WI4.dayText(WI4.dayCounts([exp({ hasReturn: false, returnDate: add(T, 2) })], T)), '1 φορτηγό · 1 κενό γύρισμα');
  // NO_TRUCK is counted in words, never dropped from the header.
  assert.strictEqual(WI4.dayText(WI4.dayCounts([exp({ saved: false, loadDate: T })], T)), '1 φορτηγό · 1 χωρίς φορτηγό');
  // Unread legs: words instead of a count (never 0, never a number).
  assert.strictEqual(WI4.dayText(c2, { natState: 'err' }), '2 φορτηγά · 1 κενό γύρισμα (3 ημέρες) · εθνικά σκέλη: δεν φορτώθηκαν');
  assert.strictEqual(WI4.dayText({ trucks: 0, byCode: {} }), '0 φορτηγά');
});

// ─── §d.3 queue — 10 scenarios (PLAN Φ3) ───────────────────────────────
const it = (code, level, date, key, extra) => Object.assign({ code, level, date, key, group: WI4.GROUP[code] || 'look' }, extra || {});
const order = (list) => WI4.queue(list, T).map((x) => `${x.code}:${x.key}`);

test('queue 1: red before amber', () => {
  assert.deepStrictEqual(order([it('NO_TRUCK', 'amber', add(T, 3), 'a'), it('LATE', 'red', add(T, 5), 'b')]), ['LATE:b', 'NO_TRUCK:a']);
});
test('queue 2: inside a level, stop → cost → look', () => {
  assert.deepStrictEqual(order([it('OVER_33', 'amber', T, 'a'), it('EMPTY_RETURN', 'amber', T, 'b', { age: 0 }), it('NAT_NO_CARRIER', 'amber', add(T, 4), 'c')]),
    ['NAT_NO_CARRIER:c', 'EMPTY_RETURN:b', 'OVER_33:a']);
});
test('queue 3: stop — nearest loading first', () => {
  assert.deepStrictEqual(order([it('NO_TRUCK', 'red', add(T, 1), 'a'), it('SAVE_FAILED', 'red', T, 'z'), it('NO_TRUCK', 'red', add(T, -1), 'b')]),
    ['NO_TRUCK:b', 'SAVE_FAILED:z', 'NO_TRUCK:a']);
});
test('queue 4: cost — oldest gap first', () => {
  assert.deepStrictEqual(order([it('EMPTY_RETURN', 'red', add(T, -1), 'a', { age: 1 }), it('EMPTY_RETURN', 'red', add(T, -4), 'b', { age: 4 }), it('STOCK_LATE', 'red', add(T, -2), 'c')]),
    ['EMPTY_RETURN:b', 'STOCK_LATE:c', 'EMPTY_RETURN:a']);
});
test('queue 5: look — by date', () => {
  assert.deepStrictEqual(order([it('LATE', 'amber', add(T, 2), 'a'), it('SAME_DAY', 'amber', T, 'b'), it('OVER_33', 'amber', add(T, 1), 'c')]),
    ['SAME_DAY:b', 'OVER_33:c', 'LATE:a']);
});
test('queue 6: ties break by key (order id), never by fetch order', () => {
  const a = [it('NO_TRUCK', 'red', T, 'recB'), it('NO_TRUCK', 'red', T, 'recA'), it('NO_TRUCK', 'red', T, 'recC')];
  const want = ['NO_TRUCK:recA', 'NO_TRUCK:recB', 'NO_TRUCK:recC'];
  assert.deepStrictEqual(order(a), want);
  assert.deepStrictEqual(order(a.slice().reverse()), want);
});
test('queue 7: a stop item without a date comes first (unknown ≠ plenty of time)', () => {
  assert.deepStrictEqual(order([it('NO_TRUCK', 'red', T, 'a'), it('NO_TRUCK', 'red', null, 'b')]), ['NO_TRUCK:b', 'NO_TRUCK:a']);
});
test('queue 8: items without a level are dropped', () => {
  assert.deepStrictEqual(order([it('LATE', null, T, 'a'), it('LATE', 'amber', T, 'b'), null]), ['LATE:b']);
});
test('queue 9: an unknown code is «look»; an explicit group wins; unknown sources sit with the looks', () => {
  const src = WI4.sourceReasons({ natState: 'err', crossWeekOk: false }).map((r, i) => Object.assign({}, r, { key: 'src' + i }));
  assert.deepStrictEqual(order([it('NEXT_WEEK', 'amber', T, 'n', { group: undefined }), it('STOCK_LOOSE', 'amber', T, 'm', { group: 'cost' }), ...src, it('NO_TRUCK', 'amber', add(T, 5), 'x')]),
    ['NO_TRUCK:x', 'STOCK_LOOSE:m', 'NAT_UNKNOWN:src0', 'SOURCE_UNKNOWN:src1', 'NEXT_WEEK:n']);
});
test('queue 10: a full board — fixed order whatever the input order, input untouched', () => {
  const board = [
    it('OVER_33', 'amber', add(T, 2), 'r5'), it('EMPTY_RETURN', 'amber', add(T, 1), 'r4', { age: 0 }),
    it('NO_TRUCK', 'red', add(T, 1), 'r2'), it('PREORDER', 'red', T, 'r9'),
    it('EMPTY_RETURN', 'red', add(T, -2), 'r3', { age: 2 }), it('NO_TRUCK', 'amber', add(T, 4), 'r6'),
    it('NAT_NO_CARRIER', 'red', T, 'r1'), it('LATE', 'amber', T, 'r7'),
  ];
  const want = ['NAT_NO_CARRIER:r1', 'NO_TRUCK:r2', 'EMPTY_RETURN:r3', 'PREORDER:r9', 'NO_TRUCK:r6', 'EMPTY_RETURN:r4', 'LATE:r7', 'OVER_33:r5'];
  const snapshot = JSON.stringify(board);
  assert.deepStrictEqual(order(board), want);
  assert.deepStrictEqual(order(board.slice().reverse()), want);
  assert.deepStrictEqual(order([...board.slice(3), ...board.slice(0, 3)]), want);
  assert.strictEqual(JSON.stringify(board), snapshot, 'queue must not mutate its input');
});

test('items: one queue item per reason, keyed by order id; a day\'s counts equal its items', () => {
  const day = [
    { f: exp({ saved: false, loadDate: T, pallets: 34 }), key: 'recA1234567', rowKey: 1 },
    { f: exp({ hasReturn: false, returnDate: add(T, -1) }), key: 'recB1234567', rowKey: 2 },
    { f: exp({ natLegs: [{ side: 'from', date: add(T, 3), carrier: false }] }), key: 'recC1234567', rowKey: 3 },
  ];
  const all = day.flatMap((d) => WI4.items(d.f, T, { key: d.key, rowKey: d.rowKey }));
  const c = WI4.dayCounts(day.map((d) => d.f), T);
  const total = Object.values(c.byCode).reduce((s, n) => s + n, 0);
  assert.strictEqual(all.length, total, 'day header totals = queue items of the day');
  assert.ok(all.every((x) => x.key && x.group));
  assert.deepStrictEqual(WI4.items(day[0].f, T, { key: 'recA1234567', rowKey: 1 }).map((x) => [x.code, x.group, x.key, x.rowKey]),
    [['NO_TRUCK', 'stop', 'recA1234567', 1], ['OVER_33', 'look', 'recA1234567', 1]]);
});

// ─── §d.3 collapsible, openDay ─────────────────────────────────────────
test('collapsible: only a fully clean day', () => {
  assert.strictEqual(WI4.collapsible([exp({}), exp({ partner: true, saved: false, hasReturn: false }), { kind: 'import', saved: true, natState: 'ok' }], T), true);
  assert.strictEqual(WI4.collapsible([exp({}), exp({ saved: false, loadDate: add(T, 5) })], T), false, 'NO_TRUCK');
  assert.strictEqual(WI4.collapsible([exp({ hasReturn: false, returnDate: add(T, 5) })], T), false, 'no return, even before the flag shows');
  assert.strictEqual(WI4.collapsible([exp({ late: true })], T), false, 'any reason');
  assert.strictEqual(WI4.collapsible([exp({ natState: 'loading' })], T), false, 'unread legs keep the day open');
  assert.strictEqual(WI4.collapsible([], T), false, 'an empty day is «Καμία κίνηση», not collapsed');
});

test('openDay: the first day holding a red reason, else today', () => {
  const days = [
    { date: add(T, 2), facts: [exp({ saved: false, loadDate: add(T, 1) })] },
    { date: add(T, -1), facts: [exp({ pallets: 40 })] },
    { date: add(T, 1), facts: [exp({ syncErr: 'x' })] },
  ];
  assert.strictEqual(WI4.openDay(days, T), add(T, 1));
  assert.strictEqual(WI4.openDay([{ date: add(T, -1), facts: [exp({ late: true })] }], T), T);
  assert.strictEqual(WI4.openDay([], T), T);
});

// ─── §d.4 keyboard ─────────────────────────────────────────────────────
const ST = { menuOpen: false, panelOpen: false, popoverOpen: false, dialogOpen: false, datePanelOpen: false, modalOpen: false, paletteOpen: false, onPage: true, rootPresent: true, hasFocusRow: true };
const ka = (ev, st) => WI4.keyAction(Object.assign({ shift: false, ctrl: false, meta: false, alt: false, targetTag: 'DIV', editable: false }, ev), Object.assign({}, ST, st));

test('keyAction: each key by code, Latin or Greek layout alike', () => {
  const map = [
    ['ArrowUp', 'ArrowUp', 'ArrowUp', 'rowPrev'], ['ArrowDown', 'ArrowDown', 'ArrowDown', 'rowNext'],
    ['Enter', 'Enter', 'Enter', 'menu'], ['KeyA', 'a', 'α', 'assign'], ['KeyD', 'd', 'δ', 'date'],
    ['KeyP', 'p', 'π', 'print'], ['KeyN', 'n', 'ν', 'newImport'], ['KeyO', 'o', 'ο', 'open'],
    ['KeyQ', 'q', ';', 'queueNext'], ['Slash', '/', '/', 'search'], ['Escape', 'Escape', 'Escape', 'escape'],
  ];
  for (const [code, latin, greek, action] of map) {
    assert.strictEqual(ka({ code, key: latin }), action, `${code} latin`);
    assert.strictEqual(ka({ code, key: greek }), action, `${code} greek`);
  }
  assert.strictEqual(ka({ code: 'Slash', key: '?', shift: true }), 'help');
  assert.strictEqual(ka({ code: 'KeyA', key: 'A', shift: true }), null, 'shift only for «?»');
});

test('keyAction: never acts in fields, with modifiers, under overlays, off-page or on the v1 fallback', () => {
  const k = { code: 'KeyA', key: 'a' };
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) assert.strictEqual(ka(Object.assign({ targetTag: tag }, k)), null, tag);
  assert.strictEqual(ka(Object.assign({ editable: true }, k)), null, 'contenteditable');
  for (const m of ['ctrl', 'meta', 'alt']) assert.strictEqual(ka(Object.assign({ [m]: true }, k)), null, m);
  for (const s of ['menuOpen', 'panelOpen', 'popoverOpen', 'dialogOpen', 'datePanelOpen', 'modalOpen', 'paletteOpen']) {
    assert.strictEqual(ka(k, { [s]: true }), null, s);
    assert.strictEqual(ka({ code: 'Escape', key: 'Escape' }, { [s]: true }), null, `${s}: Esc belongs to the overlay`);
  }
  assert.strictEqual(ka(k, { onPage: false }), null, 'off-page');
  assert.strictEqual(ka(k, { rootPresent: false }), null, 'root absent (v1 fallback)');
  assert.strictEqual(ka(k, { hasFocusRow: false }), null, 'a row action needs a focus row');
  assert.strictEqual(ka({ code: 'ArrowDown', key: 'ArrowDown' }, { hasFocusRow: false }), 'rowNext', '↓ picks the first row');
});

test('keyAction: the part switch is not bound — ←/→, E, I, [ ] return null', () => {
  for (const [code, key] of [['ArrowLeft', 'ArrowLeft'], ['ArrowRight', 'ArrowRight'], ['KeyE', 'e'], ['KeyI', 'i'], ['BracketLeft', '['], ['BracketRight', ']'], ['KeyZ', 'z'], ['Delete', 'Delete'], ['Backspace', 'Backspace']]) {
    assert.strictEqual(ka({ code, key }), null, code);
  }
});

test('KEYMAP: the «?» list equals the keys keyAction answers; hints come from it', () => {
  const answered = WI4.KEYMAP.filter((k) => ka({ code: k.code, key: 'x', shift: k.shift }) === k.action);
  assert.strictEqual(answered.length, WI4.KEYMAP.length);
  assert.deepStrictEqual(WI4.KEYMAP.map((k) => k.keys), ['↑', '↓', 'Enter', 'A', 'D', 'P', 'N', 'O', 'Q', '/', '?', 'Esc']);
  assert.ok(WI4.KEYMAP.every((k) => k.label && typeof k.label === 'string'));
  assert.strictEqual(WI4.keyHint('assign'), 'A');
  assert.strictEqual(WI4.keyHint('print'), 'P');
  assert.strictEqual(WI4.keyHint('open'), 'O');
  assert.strictEqual(WI4.keyHint('undo'), '');
  assert.ok(Object.isFrozen(WI4.KEYMAP) && Object.isFrozen(WI4.KEYMAP[0]));
});

// ─── §d.5 conflict data ────────────────────────────────────────────────
test('sameValue runs the shared vectors file (the Worker runs the same one)', () => {
  const vectors = JSON.parse(fs.readFileSync(path.join(ROOT, 'worker/test/fixtures/expect-vectors.json'), 'utf8'));
  assert.ok(vectors.length >= 20);
  for (const v of vectors) {
    assert.strictEqual(WI4.sameValue(v.a, v.b, v.label), v.same, `${v.label}: ${JSON.stringify(v.a)} vs ${JSON.stringify(v.b)}${v.note ? ' — ' + v.note : ''}`);
    assert.strictEqual(WI4.sameValue(v.b, v.a, v.label), v.same, `symmetric: ${v.label}`);
  }
});

test('CONFLICT_LABELS: the ten labels of §d.5', () => {
  assert.deepStrictEqual([...WI4.CONFLICT_LABELS], ['Truck', 'Trailer', 'Driver', 'Partner', 'Partner Truck Plates',
    'Is Partner Trip', 'Matched Import ID', 'Loading DateTime', 'Delivery DateTime', 'VS CD Date']);
  for (const l of WI4.CONFLICT_LABELS) assert.ok(WI4.LABELS_GR[l], `Greek word for ${l}`);
});

test('buildExpect: only checked labels present; absent = null (never dropped by JSON); undefined when nothing to check', () => {
  const rec = { id: 'recA1234567', fields: { Truck: ['recT1234567'], 'Loading DateTime': '2026-10-08T06:00:00.000Z', Notes: 'x' } };
  assert.deepStrictEqual(WI4.buildExpect(['Truck', 'Driver', 'Notes'], rec), { Truck: ['recT1234567'], Driver: null });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(WI4.buildExpect(['Driver'], rec))), { Driver: null }, 'survives JSON');
  assert.deepStrictEqual(WI4.buildExpect({ 'Loading DateTime': '2026-10-09T06:00' }, rec), { 'Loading DateTime': '2026-10-08T06:00:00.000Z' });
  assert.strictEqual(WI4.buildExpect(['Notes'], rec), undefined);
  assert.strictEqual(WI4.buildExpect([], rec), undefined);
  assert.strictEqual(WI4.buildExpect(['Truck'], undefined), undefined, 'record missing (group member of another week)');
  assert.strictEqual(WI4.buildExpect(['Truck'], {}), undefined);
});

test('describeConflict: who, when, theirs vs mine — never a guessed name', () => {
  const base = { fields: ['Loading DateTime'], at: '2026-10-06T06:00:00Z', now: Date.parse('2026-10-06T06:00:05Z'),
    expected: { 'Loading DateTime': 'Πέμ 8/10' }, current: { 'Loading DateTime': 'Παρ 9/10' }, mine: { 'Loading DateTime': 'Σάβ 10/10' } };
  const named = WI4.describeConflict(Object.assign({ by: 'Χρήστης Α' }, base));
  assert.strictEqual(named.text, 'Χρήστης Α την άλλαξε πριν 5″: Πέμ 8/10 → Παρ 9/10 · Η δική σου επιλογή: Σάβ 10/10. Ποια κρατάμε;');
  assert.deepStrictEqual(named.lines[0], { label: 'Loading DateTime', name: 'ημερομηνία φόρτωσης', before: 'Πέμ 8/10', theirs: 'Παρ 9/10', mine: 'Σάβ 10/10' });
  assert.match(WI4.describeConflict(Object.assign({ by: 'user' }, base)).lead, /^Άλλος χρήστης την άλλαξε πριν 5″$/);
  assert.match(WI4.describeConflict(Object.assign({ by: 'auto' }, base)).lead, /^Άλλαξε από αυτόματη ενημέρωση/);
  assert.strictEqual(WI4.describeConflict(Object.assign({ by: null }, base)).lead, 'Άλλαξε από τότε που την άνοιξες');
  const multi = WI4.describeConflict({ fields: ['Truck', 'Driver'], by: 'user', current: { Truck: ['recX1234567'] }, mine: {}, expected: {} });
  assert.strictEqual(multi.lines.length, 2);
  assert.match(multi.text, /φορτηγό: κενό → recX1234567 · Η δική σου επιλογή: κενό · οδηγός: κενό → κενό/);
  const fmt = WI4.describeConflict(Object.assign({ by: 'user' }, base), null, (l, v) => `[${v}]`);
  assert.strictEqual(fmt.lines[0].theirs, '[Παρ 9/10]');
  const later = WI4.describeConflict(Object.assign({}, base, { by: 'user', now: Date.parse('2026-10-06T08:10:00Z') }));
  assert.match(later.lead, /πριν 2ω$/);
});

// ─── §d.5 beatDelay ────────────────────────────────────────────────────
const CFG = { active: 5000, idle: 30000, idleAfter: 120000 };
const bd = (o) => WI4.beatDelay(Object.assign({ visible: true, lastInputAgoMs: 1000, failures: 0, lastStatus: 200, cfg: CFG }, o));

test('beatDelay: active 5 s, idle 30 s, server next_ms wins when larger, never below 2.5 s', () => {
  assert.strictEqual(bd({}), 5000);
  assert.strictEqual(bd({ lastInputAgoMs: 120000 }), 30000);
  assert.strictEqual(bd({ serverNextMs: 10000 }), 10000);
  assert.strictEqual(bd({ serverNextMs: 1000 }), 5000);
  assert.strictEqual(bd({ cfg: { active: 100, idle: 200, idleAfter: 120000 } }), 2500, 'floor 2.5 s');
  assert.strictEqual(bd({ visible: false }), null, 'hidden → stop for now');
});

test('beatDelay: 401 / 403 / 410 / stop:true → stop for the session', () => {
  for (const s of [401, 403, 410]) assert.strictEqual(bd({ lastStatus: s, failures: 1 }), 'stop', String(s));
  assert.strictEqual(bd({ stop: true }), 'stop');
});

test('beatDelay: 404 back-off 60 s ×2 cap 600 s; 5xx/network 15 s ×2 cap 120 s', () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map((n) => bd({ lastStatus: 404, failures: n })), [60000, 120000, 240000, 480000, 600000, 600000]);
  assert.deepStrictEqual([1, 2, 3, 4, 5].map((n) => bd({ lastStatus: 503, failures: n })), [15000, 30000, 60000, 120000, 120000]);
  assert.strictEqual(bd({ lastStatus: 0, failures: 1 }), 15000, 'network error');
  assert.strictEqual(bd({ lastStatus: 500 }), 15000, 'failures missing counts as 1');
});

test('beatDelay: 429 waits retry_after_ms (or 5 s), never below 2.5 s', () => {
  assert.strictEqual(bd({ lastStatus: 429, retryAfterMs: 2500 }), 2500);
  assert.strictEqual(bd({ lastStatus: 429, retryAfterMs: 8000 }), 8000);
  assert.strictEqual(bd({ lastStatus: 429 }), 5000);
  assert.strictEqual(bd({ lastStatus: 429, retryAfterMs: 100 }), 2500);
});

// ─── §e.9 menu sections and icons ──────────────────────────────────────
test('menuSection: truck / import / export by handler name', () => {
  assert.strictEqual(WI4.menuSection('_wiPanelAssign'), 'truck');
  assert.strictEqual(WI4.menuSection('_wiPanelAssign(12,true,\'recA1234567\');_wiCtxClose()'), 'truck', 'truck wins on an import row');
  assert.strictEqual(WI4.menuSection('_wiClear(3);_wiCtxClose()'), 'truck');
  assert.strictEqual(WI4.menuSection('_wiStockPanel(3)'), 'truck', 'stock piece → truck');
  assert.strictEqual(WI4.menuSection('_wiUnmatchRow(3)'), 'import');
  assert.strictEqual(WI4.menuSection('_wiUnmatch'), 'import');
  assert.strictEqual(WI4.menuSection('_wiPanelJoinLoad(4)'), 'import');
  assert.strictEqual(WI4.menuSection('_wiMenuPrint(12,true);_wiCtxClose()'), 'import');
  assert.strictEqual(WI4.menuSection('_wiMenuPrint(12,false);_wiCtxClose()'), 'export');
  assert.strictEqual(WI4.menuSection('_wiPanelGroupBuild(12,true)'), 'import');
  assert.strictEqual(WI4.menuSection('_wiPanelGroupBuild(12,false)'), 'export');
  assert.strictEqual(WI4.menuSection('_wiPanelRota(5)'), 'export');
  assert.strictEqual(WI4.menuSection('_wiPanelRota(5)', 'imp'), 'import', 'from _wiImpCtxItems');
  assert.strictEqual(WI4.menuSection('_wk3Edit(\'recA1234567\')'), 'export');
  assert.strictEqual(WI4.menuSection(''), 'export');
});

test('MENU_ICON: every icon exists in core/icons.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'core/icons.js'), 'utf8');
  for (const [fn, ic] of Object.entries(WI4.MENU_ICON)) {
    assert.match(src, new RegExp(`^\\s+${ic}:`, 'm'), `${fn} → ${ic} not in ICONS_LIB`);
  }
  for (const fn of ['_wiPanelAssign', '_wiMenuPrint', '_wk3Edit']) assert.ok(WI4.MENU_ICON[fn], fn);
});

test('dayLabel / dayDiff: local days only, no DST drift', () => {
  assert.strictEqual(WI4.dayLabel('2026-10-06'), 'Τρί 6/10');
  assert.strictEqual(WI4.dayLabel('2026-10-03'), 'Σάβ 3/10');
  assert.strictEqual(WI4.dayLabel('2026-10-06T06:00:00Z'), '', 'a datetime is not a day');
  assert.strictEqual(WI4.dayDiff('2026-10-24', '2026-10-26'), 2, 'across the 25/10 DST change');
  assert.strictEqual(WI4.dayDiff('x', '2026-10-26'), null);
});
