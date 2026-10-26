// 073 / E10 (spec 5): the DKV import matches a v5 cycle (model 2) by the HOUR of the line, inside its window
// start_at..end_at; two cycles it may belong to are a review (none + the candidates), never a silent pick (tech F3).
// Owner answers 24/10 (DECISION_LOG "National v5 F3 - DKV-1..3 and D-1..D-20"):
//   DKV-1 beta  the hour is the STATION's local time: the clock of the line's country (BG = Athens, DE/AT/IT -1 h);
//               a country missing from the map is a review, never a silent Athens hour;
//   DKV-2 alpha two candidates with a v5 cycle among them = review_cycles; rt_pref never decides between cycles;
//               a v5 cycle counts only on its own days date_start..date_end (no +-1 day tolerance).
// Handover P3-3 (072b): the rows come from v_rt_vehicle_windows - one per OWNED segment of a v5 cycle, so one cycle
// can be two rows (two trucks, or one truck twice); ids are de-duplicated in matchRoundTrip and allocateFees.
// Today's round trips (model 1) are matched EXACTLY as before: the first test freezes today's answers (computed
// from import-rules.mjs @ 9f98208d, 23/10) for a table of lines.
// Synthetic data only: fake plates, trucks and ids (public repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRoundTrip, allocateFees, aggregateLines } from '../src/import-rules.mjs';

const RTS = [
  { id: 1, truck_id: 7, status: 'planned', date_start: '2026-10-12', date_end: '2026-10-14' },
  { id: 2, truck_id: 7, status: 'closed', date_start: '2026-10-14', date_end: '2026-10-17' },
  { id: 3, truck_id: 8, status: 'cancelled', date_start: '2026-10-14', date_end: '2026-10-15' },
  { id: 4, truck_id: 8, status: 'planned', date_start: '2026-10-20', date_end: null },
];
const L = [
  { plate: 'XX1', truck_id: 7, service_date: '2026-10-12' },
  { plate: 'XX1', truck_id: 7, service_date: '2026-10-14', time: '10:00' },
  { plate: 'XX1', truck_id: 7, service_date: '2026-10-11' },
  { plate: 'XX1', truck_id: 7, service_date: '2026-10-19' },
  { plate: 'XX1', truck_id: 7, period_from: '2026-10-01', period_to: '2026-10-15' },
  { plate: 'XX2', truck_id: 8, service_date: '2026-10-14' },
  { plate: 'XX2', truck_id: 8, service_date: '2026-10-21', time: '23:00' },
  { plate: null, truck_id: null, service_date: '2026-10-14' },
  { plate: 'ZZ', truck_id: null, service_date: '2026-10-14' },
  { category: 'dkv', plate: 'XX1', truck_id: 7, service_date: '2026-10-14' },
];
const RULES = [{ kind: 'rt_pref', key: 'XX9', value: { rt_id: 2 } }];
const TODAY = [{"match":"sure","rt_id":1,"alternatives":[],"none_reason":null},{"match":"suggest","rt_id":1,"alternatives":[2],"none_reason":null},{"match":"sure","rt_id":1,"alternatives":[],"none_reason":null},{"match":"none","rt_id":null,"alternatives":[],"general":false,"none_reason":"no_rt_on_date"},{"match":"suggest","rt_id":1,"alternatives":[2],"none_reason":null},{"match":"none","rt_id":null,"alternatives":[],"general":false,"none_reason":"no_rt_on_date"},{"match":"sure","rt_id":4,"alternatives":[],"none_reason":null},{"match":"none","rt_id":null,"alternatives":[],"general":true,"none_reason":"no_plate"},{"match":"none","rt_id":null,"alternatives":[],"general":false,"none_reason":"unknown_plate"},{"match":"none","rt_id":null,"alternatives":[],"general":true,"none_reason":"general_fee"}];
const TODAY_PREF = {"match":"suggest","rt_id":2,"alternatives":[1],"none_reason":null};

test('model 1 only: every answer is today\'s, byte for byte (an hour or a country on the line changes nothing)', () => {
  assert.deepEqual(L.map((l) => matchRoundTrip(l, RTS, RULES)), TODAY);
  assert.deepEqual(matchRoundTrip({ plate: 'XX9', truck_id: 7, service_date: '2026-10-14' }, RTS, RULES), TODAY_PREF);
  // DKV-1 beta speaks only when a v5 cycle is a candidate: an unmapped country or an unreadable hour on a line of
  // today's model is today's answer
  const odd = L.map((l) => ({ ...l, country: 'EX', time: '99:99' }));
  assert.deepEqual(odd.map((l) => matchRoundTrip(l, RTS, RULES)), TODAY);
  // the rows of v_rt_vehicle_windows for model 1 carry model 1 and null windows: same answers
  const viewRows = RTS.map((r) => ({ ...r, model: 1, start_at: null, end_at: null }));
  assert.deepEqual(L.map((l) => matchRoundTrip(l, viewRows, RULES)), TODAY);
});

// Two v5 cycles of truck 9 on Wednesday 14/10: A Tue 06:00 -> Wed 06:00, B Wed 14:00 -> Thu 20:00 (Athens, UTC+3).
const A = { id: 21, truck_id: 9, status: 'planned', model: 2, date_start: '2026-10-13', date_end: '2026-10-14',
  start_at: '2026-10-13T03:00:00+00:00', end_at: '2026-10-14T03:00:00+00:00' };
const B = { id: 22, truck_id: 9, status: 'planned', model: 2, date_start: '2026-10-14', date_end: '2026-10-15',
  start_at: '2026-10-14T11:00:00+00:00', end_at: '2026-10-15T17:00:00+00:00' };
// a station in Greece unless said otherwise (Athens clock)
const fuel = (time, date = '2026-10-14', country = 'GR') =>
  ({ plate: 'XX3', truck_id: 9, service_date: date, country, ...(time ? { time } : {}) });
const review = (ids) => ({ match: 'none', rt_id: null, alternatives: ids, general: false, none_reason: 'review_cycles' });
const sure = (id) => ({ match: 'sure', rt_id: id, alternatives: [], none_reason: null });

test('tech F3: Wednesday 06:00 end, 14:00 start, fuel at 10:00 -> review with both, never a pick', () => {
  assert.deepEqual(matchRoundTrip(fuel('10:00'), [A, B], []), review([21, 22]));
});

test('an hour inside one window is that cycle (the end is open: 06:00 is the next one\'s, not A\'s)', () => {
  assert.deepEqual(matchRoundTrip(fuel('05:59'), [A, B], []), sure(21));
  assert.deepEqual(matchRoundTrip(fuel('15:30'), [A, B], []), sure(22));
  assert.equal(matchRoundTrip(fuel('06:00'), [A, B], []).none_reason, 'review_cycles');
});

test('no hour: two cycles that day are a review; rt_pref of the plate never decides between cycles', () => {
  const r = matchRoundTrip(fuel(null), [A, B], [{ kind: 'rt_pref', key: 'XX3', value: { rt_id: 22 } }]);
  assert.deepEqual(r, review([21, 22]));
});

test('one v5 cycle: sure without an hour, review with an hour outside its window', () => {
  assert.deepEqual(matchRoundTrip(fuel(null), [B], []), sure(22));
  assert.deepEqual(matchRoundTrip(fuel('09:00'), [B], []), review([22]));
});

test('a v5 cycle and a trip of today\'s model the same day: review, even with the hour inside the cycle', () => {
  const V1 = { id: 30, truck_id: 9, status: 'planned', date_start: '2026-10-14', date_end: '2026-10-16' };
  assert.deepEqual(matchRoundTrip(fuel('15:00'), [B, V1], []).alternatives.sort(), [22, 30]);
  assert.equal(matchRoundTrip(fuel('15:00'), [B, V1], []).none_reason, 'review_cycles');
  assert.equal(matchRoundTrip(fuel(null), [B, V1], []).none_reason, 'review_cycles');
});

test('the zone\'s clock, not an offset: on 25/10/2026 (summer time ends) the window 03:00-04:00 holds 03:30, not 04:30', () => {
  const C = { id: 40, truck_id: 9, status: 'planned', model: 2, date_start: '2026-10-25', date_end: '2026-10-25',
    start_at: '2026-10-25T00:00:00+00:00', end_at: '2026-10-25T02:00:00+00:00' };   // 03:00 summer -> 04:00 winter
  assert.equal(matchRoundTrip(fuel('03:30', '2026-10-25'), [C], []).match, 'sure');
  assert.equal(matchRoundTrip(fuel('04:30', '2026-10-25'), [C], []).match, 'none');
});

test('a cancelled cycle is never a candidate', () => {
  assert.equal(matchRoundTrip(fuel('15:00'), [{ ...B, status: 'cancelled' }], []).none_reason, 'no_rt_on_date');
});

// ---- DKV-1 beta: the station's clock ----
test('DKV-1 beta: BG reads like Athens; DE / AT / IT read one hour behind (the same instant)', () => {
  assert.deepEqual(matchRoundTrip(fuel('05:59', '2026-10-14', 'BG'), [A, B], []), sure(21));
  // 13:30 in Germany = 14:30 in Athens: inside B; the same 13:30 on a Greek station is between the two cycles
  assert.deepEqual(matchRoundTrip(fuel('13:30', '2026-10-14', 'DE'), [A, B], []), sure(22));
  assert.deepEqual(matchRoundTrip(fuel('13:30', '2026-10-14', 'GR'), [A, B], []), review([21, 22]));
  // 05:30 in Austria / Italy = 06:30 in Athens: A has ended; on a Greek station 05:30 is still A
  assert.deepEqual(matchRoundTrip(fuel('05:30', '2026-10-14', 'AT'), [A, B], []), review([21, 22]));
  assert.deepEqual(matchRoundTrip(fuel('05:30', '2026-10-14', 'IT'), [A, B], []), review([21, 22]));
  assert.deepEqual(matchRoundTrip(fuel('05:30', '2026-10-14', 'GR'), [A, B], []), sure(21));
});

test('DKV-1 beta: a country missing from the map is a review, never a silent Athens hour (principle 1)', () => {
  for (const country of [null, undefined, '', 'EX', 'ZZZ', 'gr']) {
    // on the Athens clock 05:59 would be A for sure - the line still goes to the accountant
    // (country set on the line itself: a default parameter would turn undefined into 'GR')
    assert.deepEqual(matchRoundTrip({ ...fuel('05:59'), country }, [A, B], []), review([21, 22]), String(country));
    assert.deepEqual(matchRoundTrip({ ...fuel('15:30'), country }, [B], []), review([22]), String(country));
  }
  // without an hour the country is not read: the day decides, as for any line
  assert.deepEqual(matchRoundTrip(fuel(null, '2026-10-14', 'EX'), [B], []), sure(22));
});

// ---- DKV-2 alpha + the cycle's exact days ----
test('DKV-2: a v5 cycle has exact days - a line on the day before or after it is a review with the cycle, not sure', () => {
  assert.deepEqual(matchRoundTrip(fuel(null, '2026-10-13'), [B], []), review([22]));   // inside today's +-1 only
  assert.deepEqual(matchRoundTrip(fuel(null, '2026-10-16'), [B], []), review([22]));
  assert.deepEqual(matchRoundTrip(fuel(null, '2026-10-15'), [B], []), sure(22));
  assert.equal(matchRoundTrip(fuel(null, '2026-10-17'), [B], []).none_reason, 'no_rt_on_date');   // as today: 2 days off
  const per = (from, to) => ({ plate: 'XX3', truck_id: 9, country: 'GR', period_from: from, period_to: to });
  assert.deepEqual(matchRoundTrip(per('2026-10-14', '2026-10-15'), [B], []), sure(22));
  assert.deepEqual(matchRoundTrip(per('2026-10-01', '2026-10-15'), [B], []), review([22]));
});

// ---- cross-cutting: nothing unreadable is read as a fact ----
test('an unreadable hour or window is a review, never a pick (no NaN, no infinite timestamp)', () => {
  for (const time of ['24:00', '10:60', '7', '10:7x', 'NaN:00', ' 10:00']) {
    assert.deepEqual(matchRoundTrip(fuel(time), [B], []), review([22]), time);
  }
  // a date that is not a calendar day: the hour cannot be placed on it
  for (const d of ['2026-10-14T99', '2026-02-30']) {
    const cyc = { ...B, date_start: '2026-02-01', date_end: '2026-10-30' };
    assert.deepEqual(matchRoundTrip({ ...fuel('15:30'), service_date: d }, [cyc], []), review([22]), d);
  }
  for (const bad of ['infinity', '-infinity', 'garbage', null]) {
    assert.deepEqual(matchRoundTrip(fuel('15:30'), [{ ...B, end_at: bad }], []), review([22]), String(bad));
    assert.deepEqual(matchRoundTrip(fuel('15:30'), [{ ...B, start_at: bad }], []), review([22]), String(bad));
  }
});

// ---- P3-3: one row per OWNED segment (v_rt_vehicle_windows of 072b) ----
// Cycle 23 hands over at Wednesday 14:00 (Athens): truck 9 until then, truck 10 after.
const S1 = { id: 23, truck_id: 9, status: 'planned', model: 2, date_start: '2026-10-13', date_end: '2026-10-14',
  start_at: '2026-10-13T03:00:00+00:00', end_at: '2026-10-14T11:00:00+00:00' };
const S2 = { id: 23, truck_id: 10, status: 'planned', model: 2, date_start: '2026-10-14', date_end: '2026-10-15',
  start_at: '2026-10-14T11:00:00+00:00', end_at: '2026-10-15T17:00:00+00:00' };

test('P3-3: a handover - each truck is matched on its own segment\'s window, never on the whole cycle', () => {
  assert.deepEqual(matchRoundTrip(fuel('10:00'), [S1, S2], []), sure(23));                       // truck 9 before
  assert.deepEqual(matchRoundTrip(fuel('15:00'), [S1, S2], []), review([23]));                   // truck 9 after
  assert.deepEqual(matchRoundTrip({ ...fuel('15:00'), truck_id: 10 }, [S1, S2], []), sure(23));  // truck 10 after
  assert.deepEqual(matchRoundTrip({ ...fuel('10:00'), truck_id: 10 }, [S1, S2], []), review([23]));
});

test('P3-3: one truck on two segments of one cycle is ONE candidate (ids de-duplicated)', () => {
  // driver change only at 14:00: two rows, same truck, same cycle
  const T2 = { ...S2, truck_id: 9 };
  assert.deepEqual(matchRoundTrip(fuel(null), [S1, T2], []), sure(23));
  assert.deepEqual(matchRoundTrip(fuel('15:00'), [S1, T2], []), sure(23));
  assert.deepEqual(matchRoundTrip(fuel('10:00'), [S1, T2, B], []), sure(23));   // B starts at 14:00
  assert.deepEqual(matchRoundTrip(fuel(null), [S1, T2, B], []), review([23, 22]));
});

test('P3-3: a fee is spread over a cycle ONCE when the view has two rows for it (the weight is not doubled)', () => {
  const lines = [
    { doc_no: 'D1', seq: 1, plate: 'XX3', truck_id: 9, service_date: '2026-10-14', category: 'fuel', net: 100, rt_id: 23, match: 'sure' },
    { doc_no: 'D1', seq: 2, plate: 'XX4', truck_id: 11, service_date: '2026-10-14', category: 'fuel', net: 100, rt_id: 5, match: 'sure' },
    { doc_no: 'D1', seq: 3, plate: null, truck_id: null, service_date: '2026-10-14', category: 'dkv', net: 10, gross: 12, match: 'none', rt_id: null },
  ];
  const V1 = { id: 5, truck_id: 11, status: 'planned', model: 1, date_start: '2026-10-14', date_end: '2026-10-14', start_at: null, end_at: null };
  const T2 = { ...S2, truck_id: 9 };
  const out = allocateFees(lines, [S1, T2, V1], { period_from: '2026-10-14', period_to: '2026-10-14' });
  const kids = out.lines.filter((l) => l.category === 'dkv');
  assert.deepEqual(kids.map((k) => [k.rt_id, k.net]), [[23, 5], [5, 5]]);
  // without the segments (one row per cycle) the answer is the same
  const once = allocateFees(lines, [S1, V1], { period_from: '2026-10-14', period_to: '2026-10-14' });
  assert.deepEqual(once.lines.filter((l) => l.category === 'dkv').map((k) => [k.rt_id, k.net]), [[23, 5], [5, 5]]);
});

test('P3-3 / Q7-1: a fee on a cycle with two trucks is filed under the FIRST segment\'s truck, in preview and commit (aggregateLines)', () => {
  const fee = { doc_no: 'D1', seq: 3, plate: null, truck_id: null, service_date: '2026-10-14', category: 'dkv', net: 5, gross: 6, rt_id: 23, match: 'sure' };
  const trucks = [{ id: 9, plate: 'XX3' }, { id: 10, plate: 'XX5' }];
  for (const rts of [[S1, S2], [S2, S1]]) {
    const two = aggregateLines([fee], { statementDocNo: 'S1', rts, trucks });
    assert.equal(two.lines[0].truck_id, 9);
    assert.equal(two.lines[0].plate, 'XX3');
    // the commit re-aggregates the preview's line with ct_round_trips rows: the truck it carries is kept
    const commit = aggregateLines(two.lines, { statementDocNo: 'S1', rts: [{ id: 23, truck_id: 9 }] });
    assert.equal(commit.lines[0].truck_id, 9);
    const commitOther = aggregateLines(two.lines, { statementDocNo: 'S1', rts: [{ id: 23, truck_id: null }] });
    assert.equal(commitOther.lines[0].truck_id, 9);
  }
  // two rows whose start cannot be compared: no truck (a review), never whichever came last
  const blind = aggregateLines([fee], { statementDocNo: 'S1', rts: [{ ...S1, start_at: null }, S2], trucks });
  assert.equal(blind.lines[0].truck_id, null);
  // one truck on both rows (or a cycle of today's model): that truck, as today
  const one = aggregateLines([fee], { statementDocNo: 'S1', rts: [S1, { ...S2, truck_id: 9 }], trucks });
  assert.equal(one.lines[0].truck_id, 9);
  assert.equal(one.lines[0].plate, 'XX3');
});
