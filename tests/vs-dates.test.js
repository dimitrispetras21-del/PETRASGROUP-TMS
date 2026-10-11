// tests/vs-dates.test.js — run: node --test tests/vs-dates.test.js
// core/vs-dates.js (Weekly National v4 plan §3.4, §6.1, WP-A): the ONE Veroia
// day rule that the VS sync, the international form and the national board
// read. Zero dependencies. Days are Athens days, as in the browser.
'use strict';
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const V = require('../core/vs-dates.js');
const WI4 = require('../core/wi4-logic.js');

// The 63 live VS loads (Direct national load of a live VS order), SELECT
// 11/10 night — days only, no ids or names (the repo is public):
// [direction, order loading, order delivery, cross_dock_date, national loading, national delivery].
const LIVE_63 = [
  ['E', '2026-08-08', '2026-08-12', '2026-08-09', '2026-08-08', '2026-08-09'], ['E', '2026-08-08', '2026-08-12', '2026-08-09', '2026-08-08', '2026-08-09'],
  ['E', '2026-08-10', '2026-08-14', '2026-08-11', '2026-08-10', '2026-08-11'], ['E', '2026-08-11', '2026-08-14', '2026-08-12', '2026-08-11', '2026-08-12'],
  ['I', '2026-08-11', '2026-08-14', '2026-08-12', '2026-08-12', '2026-08-13'], ['I', '2026-08-12', '2026-08-15', '2026-08-14', '2026-08-14', '2026-08-15'],
  ['E', '2026-08-14', '2026-08-17', '2026-08-15', '2026-08-14', '2026-08-15'], ['I', '2026-08-14', '2026-08-17', '2026-08-16', '2026-08-16', '2026-08-17'],
  ['I', '2026-08-14', '2026-08-17', '2026-08-16', '2026-08-16', '2026-08-17'], ['I', '2026-08-14', '2026-08-17', '2026-08-16', '2026-08-16', '2026-08-17'],
  ['I', '2026-08-15', '2026-08-17', '2026-08-16', '2026-08-16', '2026-08-17'], ['I', '2026-08-17', '2026-08-20', '2026-08-19', '2026-08-19', '2026-08-20'],
  ['I', '2026-08-17', '2026-08-24', '2026-08-23', '2026-08-23', '2026-08-24'], ['I', '2026-08-18', '2026-08-20', '2026-08-18', '2026-08-18', '2026-08-19'],
  ['I', '2026-08-21', '2026-08-24', '2026-08-23', '2026-08-23', '2026-08-24'], ['I', '2026-08-21', '2026-08-24', '2026-08-23', '2026-08-23', '2026-08-24'],
  ['E', '2026-08-21', '2026-08-26', '2026-08-22', '2026-08-21', '2026-08-22'], ['I', '2026-08-24', '2026-08-31', '2026-08-30', '2026-08-30', '2026-08-31'],
  ['I', '2026-08-28', '2026-08-31', '2026-08-30', '2026-08-30', '2026-08-31'], ['E', '2026-08-30', '2026-09-03', '2026-08-31', '2026-08-30', '2026-08-31'],
  ['I', '2026-09-01', '2026-09-03', '2026-09-02', '2026-09-02', '2026-09-03'], ['I', '2026-09-02', '2026-09-07', '2026-09-06', '2026-09-06', '2026-09-07'],
  ['I', '2026-09-03', '2026-09-09', '2026-09-08', '2026-09-08', '2026-09-09'], ['I', '2026-09-03', '2026-09-10', '2026-09-09', '2026-09-09', '2026-09-10'],
  ['I', '2026-09-04', '2026-09-07', '2026-09-06', '2026-09-06', '2026-09-07'], ['I', '2026-09-04', '2026-09-11', '2026-09-10', '2026-09-10', '2026-09-11'],
  ['I', '2026-09-05', '2026-09-11', '2026-09-10', '2026-09-10', '2026-09-11'], ['I', '2026-09-07', '2026-09-11', '2026-09-10', '2026-09-10', '2026-09-11'],
  ['I', '2026-09-07', '2026-09-14', '2026-09-13', '2026-09-13', '2026-09-14'], ['I', '2026-09-08', '2026-09-10', '2026-09-09', '2026-09-09', '2026-09-10'],
  ['E', '2026-09-09', '2026-09-14', '2026-09-10', '2026-09-09', '2026-09-10'], ['I', '2026-09-11', '2026-09-14', '2026-09-13', '2026-09-13', '2026-09-14'],
  ['I', '2026-09-11', '2026-09-17', '2026-09-17', '2026-09-16', '2026-09-17'], ['I', '2026-09-14', '2026-09-18', '2026-09-17', '2026-09-17', '2026-09-18'],
  ['I', '2026-09-14', '2026-09-16', '2026-09-15', '2026-09-15', '2026-09-16'], ['E', '2026-09-14', '2026-09-16', '2026-09-15', '2026-09-14', '2026-09-15'],
  ['I', '2026-09-15', '2026-09-17', '2026-09-16', '2026-09-16', '2026-09-17'], ['I', '2026-09-15', '2026-09-18', '2026-09-18', '2026-09-17', '2026-09-18'],
  ['I', '2026-09-15', '2026-09-18', '2026-09-17', '2026-09-17', '2026-09-18'], ['I', '2026-09-18', '2026-09-21', '2026-09-20', '2026-09-20', '2026-09-21'],
  ['E', '2026-09-18', '2026-09-21', '2026-09-19', '2026-09-18', '2026-09-19'], ['E', '2026-09-21', '2026-09-24', '2026-09-22', '2026-09-21', '2026-09-22'],
  ['I', '2026-09-22', '2026-09-24', '2026-09-23', '2026-09-23', '2026-09-24'], ['E', '2026-09-22', '2026-09-25', '2026-09-23', '2026-09-22', '2026-09-23'],
  ['I', '2026-09-25', '2026-09-28', '2026-09-27', '2026-09-27', '2026-09-28'], ['I', '2026-09-26', '2026-10-01', '2026-10-01', '2026-09-30', '2026-10-01'],
  ['I', '2026-09-29', '2026-10-01', '2026-09-30', '2026-09-30', '2026-10-01'], ['I', '2026-09-29', '2026-10-02', '2026-10-02', '2026-10-01', '2026-10-02'],
  ['E', '2026-09-30', '2026-10-06', '2026-10-01', '2026-09-30', '2026-10-01'], ['I', '2026-09-30', '2026-10-03', '2026-10-03', '2026-10-02', '2026-10-03'],
  ['I', '2026-10-02', '2026-10-05', '2026-10-04', '2026-10-04', '2026-10-05'], ['I', '2026-10-02', '2026-10-05', '2026-10-04', '2026-10-04', '2026-10-05'],
  ['E', '2026-10-05', '2026-10-08', '2026-10-06', '2026-10-05', '2026-10-06'], ['I', '2026-10-07', '2026-10-12', '2026-10-11', '2026-10-11', '2026-10-12'],
  ['I', '2026-10-08', '2026-10-12', '2026-10-14', '2026-10-11', '2026-10-12'], ['I', '2026-10-08', '2026-10-12', '2026-10-11', '2026-10-11', '2026-10-12'],
  ['I', '2026-10-08', '2026-10-11', '2026-10-11', '2026-10-10', '2026-10-11'], ['I', '2026-10-09', '2026-10-12', '2026-10-11', '2026-10-11', '2026-10-12'],
  ['I', '2026-10-10', '2026-10-12', '2026-10-11', '2026-10-11', '2026-10-12'], ['I', '2026-10-16', '2026-10-20', '2026-10-19', '2026-10-19', '2026-10-20'],
  ['I', '2026-10-16', '2026-10-20', '2026-10-19', '2026-10-19', '2026-10-20'], ['I', '2026-10-16', '2026-10-20', '2026-10-19', '2026-10-19', '2026-10-20'],
  ['I', '2026-10-16', '2026-10-20', '2026-10-19', '2026-10-19', '2026-10-20'],
];
const DIR = { E: 'Export', I: 'Import' };
// The national load's Veroia end: an import leaves Veroia, an export arrives there.
const rowHub = (v) => (v[0] === 'E' ? v[5] : v[4]);
const add = (d, n) => V.addDays(d, n);

test('loads as a node module and as a browser global (only window.VsDates, nothing runs)', () => {
  assert.ok(Object.isFrozen(V));
  for (const k of ['cdOf', 'vsNatDates', 'vsHubBad', 'vsCdOnSave', 'vsNatDropOrder']) assert.strictEqual(typeof V[k], 'function', k);
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const before = new Set(Object.keys(ctx));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/vs-dates.js'), 'utf8'), ctx, { filename: 'core/vs-dates.js' });
  assert.deepStrictEqual(Object.keys(ctx).filter((k) => !before.has(k)), ['VsDates']);
});

test('signatures frozen by the WP0 contract: arity of each function', () => {
  assert.strictEqual(V.cdOf.length, 1);
  assert.strictEqual(V.vsNatDates.length, 4);
  assert.strictEqual(V.vsHubBad.length, 4);
  assert.strictEqual(V.vsCdOnSave.length, 2);
  assert.strictEqual(V.vsNatDropOrder.length, 2);
});

// ─── cdOf: the one way to read the Veroia day from an ORDERS record ──────
test('cdOf: «VS CD Date» only (as the Worker answers a GET) → that day', () => {
  assert.strictEqual(V.cdOf({ 'VS CD Date': '2026-10-13' }), '2026-10-13');
});
test('cdOf: «Cross-dock Date» only (a browser-built object, e.g. the form\'s fields) → that day', () => {
  assert.strictEqual(V.cdOf({ 'Cross-dock Date': '2026-10-13T12:00:00.000Z' }), '2026-10-13');
});
test('cdOf: neither / empty / null / no record → null (never a guessed day)', () => {
  assert.strictEqual(V.cdOf({}), null);
  assert.strictEqual(V.cdOf({ 'VS CD Date': '' }), null);
  assert.strictEqual(V.cdOf({ 'VS CD Date': null, 'Cross-dock Date': null }), null);
  assert.strictEqual(V.cdOf(null), null);
  assert.strictEqual(V.cdOf(undefined), null);
});
test('cdOf: «VS CD Date» wins over a stale «Cross-dock Date» on the same object', () => {
  assert.strictEqual(V.cdOf({ 'VS CD Date': '2026-10-13', 'Cross-dock Date': '2026-10-11' }), '2026-10-13');
});
test('a datetime becomes its ATHENS day, never a sliced UTC string', () => {
  assert.strictEqual(V.day('2026-10-12T22:30:00.000Z'), '2026-10-13');
  assert.strictEqual(V.day('2026-10-13T12:00:00.000Z'), '2026-10-13');
  assert.strictEqual(V.day('not a date'), null);
});

// ─── vsNatDates: the cross-dock as it is, ±1 only when empty ─────────────
test('live 63: before the repair, exactly the 7 «double moved» cross-docks disagree with their national load', () => {
  assert.strictEqual(LIVE_63.length, 63);
  const off = LIVE_63.filter((v) => v[3] !== rowHub(v));
  assert.strictEqual(off.length, 7, 'the 7 of §3.2 (069_hub_day_once_repair fixes them)');
  // All 7 are imports whose cross-dock sits on or after the delivery — what
  // the old sync silently replaced with delivery−1.
  assert.ok(off.every((v) => v[0] === 'I' && v[3] >= v[2]));
});
test('live 63: after the repair (cross-dock = the day the load already shows), the Veroia day = cross-dock for 63/63', () => {
  // Only the Veroia end is the rule's: the customer end of an executed load
  // can differ from today's order (an August import delivered a day early).
  for (const v of LIVE_63) {
    const cd = rowHub(v);   // what 069_hub_day_once_repair writes on the 7, unchanged on the 56
    const got = V.vsNatDates(DIR[v[0]], v[1] + 'T08:00:00+03:00', v[2] + 'T08:00:00+03:00', cd);
    assert.strictEqual(got.hub, cd, JSON.stringify(v));
    assert.strictEqual(v[0] === 'E' ? got.natDel : got.natLoad, rowHub(v), JSON.stringify(v));
  }
});
test('live 63: the estimate (±1) only when the cross-dock is empty', () => {
  for (const v of LIVE_63) {
    const got = V.vsNatDates(DIR[v[0]], v[1], v[2], null);
    if (v[0] === 'E') assert.deepStrictEqual(got, { natLoad: v[1], natDel: add(v[1], 1), hub: add(v[1], 1) });
    else assert.deepStrictEqual(got, { natLoad: add(v[2], -1), natDel: v[2], hub: add(v[2], -1) });
  }
});
test('a cross-dock on/after the delivery is KEPT (no silent estimate): import leaves Veroia on it', () => {
  assert.deepStrictEqual(V.vsNatDates('Import', '2026-10-08', '2026-10-12', '2026-10-12'), { natLoad: '2026-10-12', natDel: '2026-10-12', hub: '2026-10-12' });
  assert.deepStrictEqual(V.vsNatDates('Import', '2026-10-08', '2026-10-12', '2026-10-14'), { natLoad: '2026-10-14', natDel: '2026-10-12', hub: '2026-10-14' });
});
test('a cross-dock on/before the loading is KEPT: export arrives at Veroia on it', () => {
  assert.deepStrictEqual(V.vsNatDates('Export', '2026-10-05', '2026-10-08', '2026-10-05'), { natLoad: '2026-10-05', natDel: '2026-10-05', hub: '2026-10-05' });
});
test('a 2-day distance (the assignment bug case) stays 2 days', () => {
  assert.strictEqual(V.vsNatDates('Import', '2026-10-05', '2026-10-09', '2026-10-07').natLoad, '2026-10-07');
  assert.strictEqual(V.vsNatDates('Export', '2026-10-05', '2026-10-09', '2026-10-07').natDel, '2026-10-07');
});
test('no dates → no invented day', () => {
  assert.deepStrictEqual(V.vsNatDates('Import', null, null, null), { natLoad: null, natDel: null, hub: null });
  assert.deepStrictEqual(V.vsNatDates('Export', null, null, null), { natLoad: null, natDel: null, hub: null });
});

// ─── vsHubBad ≡ DATE_MISMATCH of the Weekly International v4 ─────────────
const mismatch = (dir, loading, delivery, cd) => {
  const imp = dir === 'Import';
  const r = WI4.flags({ kind: imp ? 'import' : 'export', saved: true, hasReturn: true,
    vsCdDate: cd || '', natDelDate: imp ? delivery : '', natLoadDate: imp ? '' : loading }, '2026-10-06');
  return r.reasons.some((x) => x.code === 'DATE_MISMATCH');
};
test('vsHubBad = DATE_MISMATCH on the live 63 (raw and repaired cross-docks)', () => {
  let bad = 0;
  for (const v of LIVE_63) for (const cd of [v[3], rowHub(v)]) {
    const a = V.vsHubBad(DIR[v[0]], v[1], v[2], cd);
    assert.strictEqual(a, mismatch(DIR[v[0]], v[1], v[2], cd), JSON.stringify([v, cd]));
    if (a) bad++;
  }
  assert.ok(bad > 0, 'the live data holds at least one «does not hold» day (nl 131: 14/10 after a 12/10 delivery)');
});
test('vsHubBad = DATE_MISMATCH on a ±3-day grid around both ends, both directions', () => {
  for (const dir of ['Import', 'Export']) for (let k = -3; k <= 3; k++) {
    const ld = '2026-10-05', dl = '2026-10-08';
    const cd = add(dir === 'Import' ? dl : ld, k);
    assert.strictEqual(V.vsHubBad(dir, ld, dl, cd), mismatch(dir, ld, dl, cd), dir + ' ' + k);
  }
});
test('vsHubBad: the same day is fine; one day past is bad; unknown is not bad', () => {
  assert.strictEqual(V.vsHubBad('Import', '2026-10-05', '2026-10-08', '2026-10-08'), false);
  assert.strictEqual(V.vsHubBad('Import', '2026-10-05', '2026-10-08', '2026-10-09'), true);
  assert.strictEqual(V.vsHubBad('Export', '2026-10-05', '2026-10-08', '2026-10-05'), false);
  assert.strictEqual(V.vsHubBad('Export', '2026-10-05', '2026-10-08', '2026-10-04'), true);
  assert.strictEqual(V.vsHubBad('Import', null, null, '2026-10-09'), false);
  assert.strictEqual(V.vsHubBad('Import', '2026-10-05', '2026-10-08', null), false);
});

// ─── vsCdOnSave: the form keeps an existing Veroia day ──────────────────
const NEXT_IMP = { vs: true, dir: 'Import', loading: '2026-10-05', delivery: '2026-10-09' };
const NEXT_EXP = { vs: true, dir: 'Export', loading: '2026-10-05', delivery: '2026-10-09' };
test('vsCdOnSave: a new order → the estimate (import delivery−1, export loading+1)', () => {
  assert.deepStrictEqual(V.vsCdOnSave(null, NEXT_IMP), { send: true, cd: '2026-10-08' });
  assert.deepStrictEqual(V.vsCdOnSave(null, NEXT_EXP), { send: true, cd: '2026-10-06' });
});
test('vsCdOnSave: VS just switched on → the estimate', () => {
  assert.deepStrictEqual(V.vsCdOnSave({ 'Veroia Switch': false, Direction: 'Import' }, NEXT_IMP), { send: true, cd: '2026-10-08' });
  assert.deepStrictEqual(V.vsCdOnSave({ Direction: 'Import' }, NEXT_IMP), { send: true, cd: '2026-10-08' });
});
test('vsCdOnSave: an existing VS order with an EMPTY cross-dock → the estimate', () => {
  assert.deepStrictEqual(V.vsCdOnSave({ 'Veroia Switch': true, Direction: 'Import' }, NEXT_IMP), { send: true, cd: '2026-10-08' });
});
test('vsCdOnSave: a direction change → the estimate of the new side', () => {
  assert.deepStrictEqual(V.vsCdOnSave({ 'Veroia Switch': true, Direction: 'Import', 'VS CD Date': '2026-10-07' }, NEXT_EXP), { send: true, cd: '2026-10-06' });
});
test('vsCdOnSave: an existing VS order with a cross-dock → NOT sent (the base moves it by Δ, once)', () => {
  assert.deepStrictEqual(V.vsCdOnSave({ 'Veroia Switch': true, Direction: 'Import', 'VS CD Date': '2026-10-07' }, NEXT_IMP), { send: false, cd: '2026-10-07' });
});
test('vsCdOnSave: a record with ONLY «VS CD Date» (what the Worker returns) does not count as empty', () => {
  const prev = { 'Veroia Switch': true, Direction: 'Export', 'VS CD Date': '2026-10-07' };
  assert.ok(!('Cross-dock Date' in prev));
  assert.strictEqual(V.vsCdOnSave(prev, NEXT_EXP).send, false);
});
test('vsCdOnSave: VS off → send an empty cross-dock, as today', () => {
  assert.deepStrictEqual(V.vsCdOnSave({ 'Veroia Switch': true, Direction: 'Import', 'VS CD Date': '2026-10-07' }, { vs: false, dir: 'Import' }), { send: true, cd: null });
});
test('vsCdOnSave: no date to estimate from → an empty cross-dock (never a guessed one)', () => {
  assert.deepStrictEqual(V.vsCdOnSave(null, { vs: true, dir: 'Import', loading: null, delivery: null }), { send: true, cd: null });
});

// ─── vsNatDropOrder: the national drop order, by place ──────────────────
const reorder = (intl, nat) => V.vsNatDropOrder(intl, nat).map((i) => intl[i]);
test('vsNatDropOrder: same order → same', () => {
  assert.deepStrictEqual(V.vsNatDropOrder(['A', 'B', 'C'], ['A', 'B', 'C']), [0, 1, 2]);
});
test('vsNatDropOrder: no national load yet (no stops) → the international order', () => {
  assert.deepStrictEqual(V.vsNatDropOrder(['A', 'B', 'C'], []), [0, 1, 2]);
  assert.deepStrictEqual(V.vsNatDropOrder(['A', 'B'], undefined), [0, 1]);
});
test('vsNatDropOrder: the national dispatcher\'s order is kept', () => {
  assert.deepStrictEqual(reorder(['A', 'B', 'C'], ['C', 'A', 'B']), ['C', 'A', 'B']);
});
test('vsNatDropOrder: a place the international order added goes last', () => {
  assert.deepStrictEqual(reorder(['A', 'B', 'C', 'D'], ['C', 'A', 'B']), ['C', 'A', 'B', 'D']);
  assert.deepStrictEqual(reorder(['D', 'A', 'B', 'C'], ['C', 'A', 'B']), ['C', 'A', 'B', 'D']);
});
test('vsNatDropOrder: a place the international order removed goes away', () => {
  assert.deepStrictEqual(reorder(['A', 'C'], ['C', 'B', 'A']), ['C', 'A']);
});
test('vsNatDropOrder: the same place twice pairs in order of appearance', () => {
  assert.deepStrictEqual(V.vsNatDropOrder(['A', 'B', 'A'], ['A', 'A', 'B']), [0, 2, 1]);
  assert.deepStrictEqual(V.vsNatDropOrder(['A', 'B', 'A'], ['B', 'A']), [1, 0, 2]);
});
test('vsNatDropOrder: pallets and day of each drop come from the international stop of the SAME place', () => {
  const intl = [{ loc: 'A', pal: 10, day: '2026-10-08' }, { loc: 'B', pal: 4, day: '2026-10-09' }, { loc: 'C', pal: 7, day: '2026-10-09' }];
  const order = V.vsNatDropOrder(intl.map((s) => s.loc), ['B', 'C', 'A']);
  assert.deepStrictEqual(order.map((i) => intl[i]), [intl[1], intl[2], intl[0]]);
  assert.deepStrictEqual(order.map((i) => [intl[i].loc, intl[i].pal, intl[i].day]), [['B', 4, '2026-10-09'], ['C', 7, '2026-10-09'], ['A', 10, '2026-10-08']]);
});
