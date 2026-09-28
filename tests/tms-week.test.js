// tests/tms-week.test.js — run: TZ=Europe/Athens node --test tests/tms-week.test.js
// The DST cases below are Athens-specific (EEST→EET on Sun 25/10/2026), so
// the zone is pinned here too in case the runner forgets the TZ variable.
process.env.TZ = 'Europe/Athens';

const { test } = require('node:test');
const assert = require('node:assert');
const TmsWeek = require('../core/tms-week.js');

const at = (y, m, d, hh = 12, mm = 0) => new Date(y, m - 1, d, hh, mm);
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The pre-28/9 weekly_intl formulas, kept here only as the reference the new
// module must reproduce (except on Fridays, where they were wrong).
function oldWiWeekNumOf(d) { const y = d.getFullYear(), j = new Date(y, 0, 1); return Math.ceil(((d - j) / 86400000 + j.getDay() + 1) / 7); }
function oldWiWeekStart(w, y) {
  const jan1 = new Date(y, 0, 1);
  const firstSun = new Date(jan1); firstSun.setDate(jan1.getDate() - jan1.getDay());
  const ws = new Date(firstSun); ws.setDate(firstSun.getDate() + (w - 1) * 7 - 1);
  return ws;
}

test('Friday belongs to the week that started the Saturday BEFORE it, at any time of day (the bug of 28/9)', () => {
  const sat = TmsWeek.numOf(at(2026, 9, 12));
  assert.strictEqual(sat, 38);
  for (const [hh, mm] of [[0, 30], [1, 30], [12, 0], [23, 59]]) {
    const fri = at(2026, 9, 18, hh, mm);
    assert.strictEqual(TmsWeek.numOf(fri), 38, `Fri 18/9 ${hh}:${mm}`);
    assert.strictEqual(TmsWeek.startOfDate(fri), '2026-09-12', `Fri 18/9 ${hh}:${mm}`);
  }
});

test('Saturday 00:00 opens the next week', () => {
  assert.strictEqual(TmsWeek.numOf(at(2026, 9, 19, 0, 0)), 39);
  assert.strictEqual(TmsWeek.startOfDate(at(2026, 9, 19, 0, 0)), '2026-09-19');
});

test('around the DST change (Sun 25/10/2026) Fridays stay in their own week', () => {
  for (const [hh, mm] of [[0, 30], [1, 30], [23, 59]]) {
    assert.strictEqual(TmsWeek.numOf(at(2026, 10, 23, hh, mm)), 43, `Fri 23/10 ${hh}:${mm}`);
    assert.strictEqual(TmsWeek.startOfDate(at(2026, 10, 23, hh, mm)), '2026-10-17');
    assert.strictEqual(TmsWeek.numOf(at(2026, 10, 30, hh, mm)), 44, `Fri 30/10 ${hh}:${mm}`);
    assert.strictEqual(TmsWeek.startOfDate(at(2026, 10, 30, hh, mm)), '2026-10-24');
  }
  assert.strictEqual(TmsWeek.numOf(at(2026, 10, 25, 2, 30)), 44);
  assert.strictEqual(TmsWeek.startOfDate(at(2026, 10, 25, 2, 30)), '2026-10-24');
});

test('New Year does not split a week: 31/12/2026 and 1/1/2027 share W53 starting Sat 26/12/2026', () => {
  for (const d of [at(2026, 12, 31, 0, 30), at(2026, 12, 31, 23, 59), at(2027, 1, 1, 0, 30), at(2027, 1, 1, 12, 0), at(2027, 1, 1, 23, 59)]) {
    assert.strictEqual(TmsWeek.numOf(d), 53, d.toString());
    assert.strictEqual(TmsWeek.startOfDate(d), '2026-12-26', d.toString());
  }
  assert.strictEqual(ymd(TmsWeek.start(53, 2026)), '2026-12-26');
});

test('Sat 2/1/2027 starts a new week (W2 of 2027 — W1 2027 is the same week as W53 2026)', () => {
  const d = at(2027, 1, 2, 0, 0);
  assert.strictEqual(TmsWeek.startOfDate(d), '2027-01-02');
  assert.strictEqual(TmsWeek.numOf(d), 2);
  assert.strictEqual(ymd(TmsWeek.start(2, 2027)), '2027-01-02');
  assert.strictEqual(ymd(TmsWeek.start(1, 2027)), '2026-12-26');
});

test('input forms: Date, local YYYY-MM-DD, ISO datetime; junk → null', () => {
  assert.strictEqual(TmsWeek.startOfDate('2026-09-19'), '2026-09-19');   // NOT read as UTC
  assert.strictEqual(TmsWeek.numOf('2026-09-18'), 38);
  // ISO timestamps are judged by the LOCAL calendar day, like the board's day panels.
  assert.strictEqual(TmsWeek.numOf('2026-09-18T20:30:00.000Z'), 38);    // Fri 18/9 23:30 Athens
  assert.strictEqual(TmsWeek.numOf('2026-09-18T21:30:00.000Z'), 39);    // Sat 19/9 00:30 Athens
  assert.strictEqual(TmsWeek.numOf(null), null);
  assert.strictEqual(TmsWeek.numOf(''), null);
  assert.strictEqual(TmsWeek.numOf('not a date'), null);
  assert.strictEqual(TmsWeek.startOfDate(undefined), null);
});

test('every instant of 2026 falls inside start(numOf) … start(numOf)+6', () => {
  for (let i = 0; i < 365; i++) for (const hh of [0, 1, 12, 23]) {
    const d = new Date(2026, 0, 1 + i, hh, 30);
    const w = TmsWeek.numOf(d);
    const sat = TmsWeek.startOfDate(d);
    const sun = new Date(Number(sat.slice(0, 4)), Number(sat.slice(5, 7)) - 1, Number(sat.slice(8)) + 1);
    assert.strictEqual(ymd(TmsWeek.start(w, sun.getFullYear())), sat, d.toString());
  }
});

test('same as the old weekly_intl formula on every non-Friday of 2026 (noon), and same week starts', () => {
  // Thu 1/1/2026 is the one intended difference besides Fridays: its week
  // (Sat 27/12/2025 – Fri 2/1/2026) keeps the number of its Sunday 28/12/2025,
  // W53, instead of the old formula's W1 — the week is not split at New Year.
  assert.strictEqual(TmsWeek.numOf(at(2026, 1, 1)), 53);
  assert.strictEqual(oldWiWeekNumOf(at(2026, 1, 2)), 1);
  for (let i = 1; i < 364; i++) {
    const d = new Date(2026, 0, 1 + i, 12, 0);
    if (d.getDay() === 5) continue;
    assert.strictEqual(TmsWeek.numOf(d), oldWiWeekNumOf(new Date(d.getTime() + 86400000)), d.toString());
  }
  for (let w = 1; w <= 53; w++) assert.strictEqual(ymd(TmsWeek.start(w, 2026)), ymd(oldWiWeekStart(w, 2026)), `W${w}`);
});

test('rangeLabel keeps the _wiWeekRange format', () => {
  const ws = oldWiWeekStart(39, 2026), we = new Date(ws); we.setDate(ws.getDate() + 6);
  const f = d => d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
  assert.strictEqual(TmsWeek.rangeLabel(39, 2026), `${f(ws)} – ${f(we)}`);
});

test('current() is numOf(today)', () => {
  assert.strictEqual(TmsWeek.current(), TmsWeek.numOf(new Date()));
});
