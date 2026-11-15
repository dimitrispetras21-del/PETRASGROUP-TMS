// node --test tests/wi-year-turn.test.js
// C26 / Γ10 (audit 15/11/2026): the turn of the year on the weekly boards.
// Sat 26/12/2026 – Fri 1/1/2027 is W53; the next week is W2 of 2027 (2027 has
// no W1 in the Saturday-start numbering). Before the fix the international
// tabs and chevrons clamped to 1…53, so during W53 the next week could not be
// opened with the mouse, ← → opened a «W54», after 2/1 December could not be
// reached, and a page left open over New Year read W53 of the NEW year.
// The national v5 tabs shared it (labels W54, clamp at W1).
// Each case runs the REAL functions, extracted verbatim from the modules, with
// a fixed «now». UNIT ONLY: nothing leaves the process.
// WI_SRC / WN5_SRC=<path> run the same cases against another copy.
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const TW = fs.readFileSync(path.join(ROOT, 'core/tms-week.js'), 'utf8');
const WI = fs.readFileSync(process.env.WI_SRC || path.join(ROOT, 'modules/weekly_intl.js'), 'utf8');
const WN5 = fs.readFileSync(process.env.WN5_SRC || path.join(ROOT, 'modules/weekly_natl_v5.js'), 'utf8');
const fnIn = (src, name, optional) => {
  // a one-line function first (its body ends on its own line), else up to the first «}» in column 0
  const m = src.match(new RegExp('\\nfunction ' + name + '\\([^)]*\\) ?\\{[^\\n]*\\}\\n'))
    || src.match(new RegExp('(?:async )?function ' + name + '\\([^)]*\\) ?\\{[\\s\\S]*?\\n\\}\\n'));
  if (!m && !optional) throw new Error(name + ' not found');
  return m ? m[0] : '';
};

function ctxAt(y, m, d) {
  const NOW = new Date(y, m - 1, d, 10, 0).getTime();
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(NOW); }
    static now() { return NOW; }
  }
  const ctx = { Date: FakeDate, Math, Number, String, console };
  vm.createContext(ctx);
  vm.runInContext(TW.replace("if (typeof module !== 'undefined') module.exports = TmsWeek;", '') + '\nthis.TmsWeek = TmsWeek;', ctx);
  return ctx;
}

function intl(y, m, d, week, year) {
  const ctx = ctxAt(y, m, d);
  const names = ['_wiCurrentWeek', '_wiWeekStart', '_wiWeekRange', '_wiWeekLabel', '_wiTodayIdx', '_wiNormWeek', '_wk3Tabs'];
  const src = names.map(n => fnIn(WI, n, true)).join('\n');
  // the board as the page opens it: its week, and (after the fix) its year
  vm.runInContext(src + '\nthis.WINTL = { week: ' + (week == null ? '_wiCurrentWeek()' : week) + ', year: ' + (year == null ? 'TmsWeek.yearOf(new Date())' : year) + ' };'
    + '\nObject.assign(this, {' + names.filter(n => fnIn(WI, n, true)).join(',') + '});', ctx);
  // what renderWeeklyIntl does first with the plain number a click set
  ctx.render = () => { if (typeof ctx._wiNormWeek === 'function') ctx._wiNormWeek(); };
  return ctx;
}
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tabs = html => [...html.matchAll(/onclick="WINTL\.week=(-?\d+);renderWeeklyIntl\(\)"[^>]*>(W\d+)/g)].map(x => ({ set: +x[1], label: x[2] }));

test('TmsWeek.norm / indexIn: W53 + 1 is W2 of 2027, W1 of 2027 is W53 of 2026', () => {
  const T = require('../core/tms-week.js');
  assert.deepStrictEqual(T.norm(54, 2026), { week: 2, year: 2027 });
  assert.deepStrictEqual(T.norm(1, 2027), { week: 53, year: 2026 });
  assert.deepStrictEqual(T.norm(0, 2027), { week: 52, year: 2026 });
  assert.deepStrictEqual(T.norm(47, 2026), { week: 47, year: 2026 });
  assert.strictEqual(T.indexIn(new Date(2027, 0, 5), 2026), 54);
  assert.strictEqual(T.indexIn(new Date(2026, 11, 20), 2027), 0);
  assert.strictEqual(T.yearOf(new Date(2027, 0, 1)), 2026);
});

test('Intl, Wed 30/12/2026 (W53): the tab after W53 exists, says W2 and opens Sat 2/1/2027', () => {
  const c = intl(2026, 12, 30);
  assert.strictEqual(c.WINTL.week, 53);
  const t = tabs(c._wk3Tabs(c.WINTL.week));
  const next = t.find(x => x.set === 54);
  assert.ok(next, 'a tab one week after W53 must be offered: ' + JSON.stringify(t));
  assert.strictEqual(next.label, 'W2');
  assert.ok(!t.some(x => x.label === 'W54' || x.label === 'W1'), 'no W54 / W1 label: ' + JSON.stringify(t));
  c.WINTL.week = 54; c.render();             // the click (or →) and the render
  assert.strictEqual(c.WINTL.week, 2);
  assert.strictEqual(ymd(c._wiWeekStart(c.WINTL.week)), '2027-01-02');
});

test('Intl, Tue 5/1/2027 (W2): ← and the tabs reach December 2026 with their real numbers', () => {
  const c = intl(2027, 1, 5);
  assert.strictEqual(c.WINTL.week, 2);
  const t = tabs(c._wk3Tabs(c.WINTL.week));
  assert.deepStrictEqual(t.filter(x => x.set < 2).map(x => x.label), ['W51', 'W52', 'W53'], JSON.stringify(t));
  c.WINTL.week -= 1; c.render();             // ←
  assert.strictEqual(c.WINTL.week, 53);
  assert.strictEqual(ymd(c._wiWeekStart(c.WINTL.week)), '2026-12-26');
  c.WINTL.week -= 1; c.render();
  assert.strictEqual(ymd(c._wiWeekStart(c.WINTL.week)), '2026-12-19');
});

test('Intl: a page opened on W53 and still open on Sat 2/1/2027 keeps showing 26/12 – 1/1', () => {
  // opened Thu 31/12/2026 → WINTL = W53 of 2026; the clock then passes New Year
  const opened = intl(2026, 12, 31);
  const year = opened.WINTL.year;
  const later = intl(2027, 1, 2, 53, year == null ? 'undefined' : year);
  later.render();
  assert.strictEqual(ymd(later._wiWeekStart(later.WINTL.week)), '2026-12-26');
});

test('National v5, Wed 30/12/2026: the tab after W53 says W2; in January the tabs reach W52/W53', () => {
  const names = ['_wkNo', '_tabsFrom', '_tabsHTML', '_week'];
  const load = (y, m, d) => {
    const c = ctxAt(y, m, d);
    c.window = { WNATL: { week: null }, renderWeeklyNatl() {} };
    vm.runInContext('let _tabFrom = null; const _waitOf = () => 0;\n' + names.map(n => fnIn(WN5, n, true)).join('\n')
      + '\nObject.assign(this, {' + names.filter(n => fnIn(WN5, n, true)).join(',') + ', resetTabs(){ _tabFrom = null; } });', c);
    return c;
  };
  const labels = html => [...html.matchAll(/data-w="(-?\d+)"[^>]*>(W\d+)/g)].map(x => ({ set: +x[1], label: x[2] }));
  const dec = load(2026, 12, 30);
  const t = labels(dec._tabsHTML(54));
  assert.ok(t.some(x => x.set === 54 && x.label === 'W2'), JSON.stringify(t));
  assert.ok(!t.some(x => x.label === 'W54'), JSON.stringify(t));
  const jan = load(2027, 1, 5);
  jan._week(0);                               // ‹ from W1 (= W53): one more week back
  assert.strictEqual(jan.window.WNATL.week, 0, 'the step back from W1 must not be clamped');
  jan.resetTabs();
  const tj = labels(jan._tabsHTML(0));
  assert.ok(tj.some(x => x.set === 0 && x.label === 'W52'), JSON.stringify(tj));
  assert.ok(tj.some(x => x.set === 1 && x.label === 'W53'), JSON.stringify(tj));
});
