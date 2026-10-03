// tests/tms-week-sql.test.js — run: TZ=Europe/Athens node --test tests/tms-week-sql.test.js
// ONE week definition everywhere (owner 3/10/2026, decision «Α»): the database's
// tms_week()/tms_week_year() (DRAFT 056) must give, for every day of
// 2026-01-01…2028-12-31, exactly what core/tms-week.js gives — the Weekly boards and
// the Dashboard's {Week Number} may never again disagree (3/10: 26/253 orders did).
//
// The SQL side cannot run here, so it is pinned two ways:
//  1. SQL_MD5 = md5 of the whole calendar «YYYY-MM-DD=week/year,…» computed in
//     Postgres (SELECT only, 3/10) by running the function BODIES of 056 inline;
//  2. BODY_SHA = sha256 of those bodies as they stand in the migration file — edit
//     the SQL and this test fails until the calendar is re-measured (principle 6).
// Year-edge checkpoints are spelled out so a failure says WHICH day.
process.env.TZ = 'Europe/Athens';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const TmsWeek = require('../core/tms-week.js');

const MIGRATION = path.join(__dirname, '..', 'worker', 'migrations', 'drafts', '056_week_number_tmsweek.sql');
const BODY_SHA = '437d60327f1dea6b904059eca2045b5785288bfd7a08b491e062dcadf016de64';
const SQL_MD5 = 'f6c1b55b1bdac11cf28d37bab9ae5fcf';   // 1096 days, 2026-01-01…2028-12-31
// Measured in Postgres with the same bodies (3/10). Note what the definition implies:
// a year whose 1 January is not a Sunday has no W1 (its first Saturday week carries the
// WEEKNUM of a Sunday that is already W2), and 2028 ends in W54.
const SQL_CHECKPOINTS = {
  '2026-01-01': '53/2025', '2026-01-02': '53/2025', '2026-01-03': '2/2026',
  '2026-10-02': '40/2026', '2026-10-03': '41/2026',                     // Fri / Sat
  '2026-12-25': '52/2026', '2026-12-26': '53/2026', '2027-01-01': '53/2026', '2027-01-02': '2/2027',
  '2027-12-24': '52/2027', '2027-12-25': '53/2027', '2027-12-31': '53/2027', '2028-01-01': '2/2028',
  '2028-02-29': '10/2028', '2028-12-23': '53/2028', '2028-12-30': '54/2028', '2028-12-31': '54/2028',
};

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The week-year = the year of the week's Sunday (Saturday + 1), as TmsWeek.start uses it.
function jsWeekYear(d) {
  const [y, m, dd] = TmsWeek.startOfDate(d).split('-').map(Number);
  return new Date(y, m - 1, dd + 1).getFullYear();
}
function jsCalendar() {
  const out = [];
  for (let d = new Date(2026, 0, 1); d <= new Date(2028, 11, 31); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    out.push([ymd(d), `${TmsWeek.numOf(d)}/${jsWeekYear(d)}`]);
  }
  return out;
}

test('056 bodies are the ones the calendar was measured from', () => {
  const s = fs.readFileSync(MIGRATION, 'utf8');
  const b1 = s.match(/\$tmsweek\$([\s\S]*?)\$tmsweek\$/)[1].trim();
  const b2 = s.match(/\$tmsweekyear\$([\s\S]*?)\$tmsweekyear\$/)[1].trim();
  const sha = crypto.createHash('sha256').update(b1 + '\n--\n' + b2).digest('hex');
  assert.strictEqual(sha, BODY_SHA, 'tms_week/tms_week_year changed in 056 — re-measure SQL_MD5 and the checkpoints with SELECT');
});

test('year-edge checkpoints: JS TmsWeek = SQL tms_week/tms_week_year', () => {
  const cal = new Map(jsCalendar());
  for (const [day, want] of Object.entries(SQL_CHECKPOINTS)) assert.strictEqual(cal.get(day), want, day);
});

test('every day 2026-01-01…2028-12-31: JS calendar md5 = SQL calendar md5', () => {
  const cal = jsCalendar();
  assert.strictEqual(cal.length, 1096);
  const md5 = crypto.createHash('md5').update(cal.map(([d, w]) => `${d}=${w}`).join(',')).digest('hex');
  assert.strictEqual(md5, SQL_MD5);
});
