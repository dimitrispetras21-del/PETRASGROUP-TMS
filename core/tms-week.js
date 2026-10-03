// ═══════════════════════════════════════════════════════════════════════
// TmsWeek — the ONE planning-week definition of the weekly boards.
//
// Why this file exists (28/9/2026):
// - Owner decision 28/9/2026: the national board uses the same Saturday–
//   Friday week as the international board (owner 10/8). Two copies of the
//   formula would drift apart again (principle 3), so both boards call this.
// - The previous formula counted the time of day into the day count, so
//   ceil() pushed every Friday after ~01:00 into the NEXT week: on Fridays the
//   boards opened next week as «current» and Friday deliveries were flagged as
//   another week. Everything here works on CALENDAR dates (time ignored).
//
// Numbering: a Saturday–Friday week carries the old Sunday-start Airtable
// WEEKNUM of its Sunday (Saturday + 1 day), counted in THAT Sunday's year.
// So the week Sat 26/12/2026 – Fri 1/1/2027 stays W53 on every one of its
// days instead of breaking into W53 + W1 at New Year.
//
// The ONE week of the whole app since 3/10/2026 (owner «Α»): currentWeekNumber
// (Dashboard, Performance, AI chat, notifications) and metrics._weekOf call it,
// and the database's week_number is the same function in SQL (migration 056,
// tms_week(); compared day by day in tests/tms-week-sql.test.js).
// ═══════════════════════════════════════════════════════════════════════

var TmsWeek = {
  // Date | 'YYYY-MM-DD' | ISO datetime → local calendar day (00:00), or null.
  // A bare 'YYYY-MM-DD' is read as a LOCAL date: new Date('2026-09-19') is UTC
  // midnight, which is still the 18th in any timezone west of UTC.
  _day(d) {
    if (d == null || d === '') return null;
    let x;
    if (d instanceof Date) x = d;
    else if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, dd] = d.split('-').map(Number);
      x = new Date(y, m - 1, dd);
    } else x = new Date(d);
    if (isNaN(x.getTime())) return null;
    return new Date(x.getFullYear(), x.getMonth(), x.getDate());
  },
  // Saturday (local 00:00) of the week containing d. Calendar steps via the
  // Date constructor, never ±24h, so a DST-change day cannot skip a date.
  _sat(d) {
    const c = TmsWeek._day(d);
    if (!c) return null;
    return new Date(c.getFullYear(), c.getMonth(), c.getDate() - (c.getDay() + 1) % 7);
  },
  _ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  // 'YYYY-MM-DD' of the Saturday that starts d's week, or null.
  startOfDate(d) {
    const s = TmsWeek._sat(d);
    return s ? TmsWeek._ymd(s) : null;
  },

  // Week number of d, or null. Integer day count (Math.round absorbs the
  // one-hour DST offset between 1 January and a summer date).
  numOf(d) {
    const s = TmsWeek._sat(d);
    if (!s) return null;
    const sun = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1);
    const jan1 = new Date(sun.getFullYear(), 0, 1);
    const doy = Math.round((sun - jan1) / 86400000);
    return Math.ceil((doy + jan1.getDay() + 1) / 7);
  },

  current() {
    return TmsWeek.numOf(new Date());
  },

  // Saturday (Date, local 00:00) of week w. `year` defaults to the week-year
  // of TODAY (the year of this week's Sunday), not the calendar year: on
  // Fri 1/1/2027 current() is 53 and start(53) must be Sat 26/12/2026.
  // For every other day this equals the former _wiWeekStart(w).
  start(w, year) {
    if (year == null) {
      const s = TmsWeek._sat(new Date());
      year = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1).getFullYear();
    }
    const jan1 = new Date(year, 0, 1);
    return new Date(year, 0, 1 - jan1.getDay() + (w - 1) * 7 - 1);
  },

  // «19 Σεπ – 25 Σεπ» — same format as the former _wiWeekRange.
  rangeLabel(w, year) {
    const ws = TmsWeek.start(w, year);
    const we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6);
    const f = d => d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
    return `${f(ws)} – ${f(we)}`;
  },
};

if (typeof module !== 'undefined') module.exports = TmsWeek;
