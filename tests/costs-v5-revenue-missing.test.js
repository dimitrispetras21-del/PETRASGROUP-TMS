// node --test tests/costs-v5-revenue-missing.test.js   (TZ=Europe/Athens)
// F1/F4 (owner 28/10, 080): a v5 cycle that carries a national order with no price yet has a revenue that LACKS that
// order; 080 flags it as ct_v_rt_pnl.v5_revenue_missing (GET /costs/pnl answers select=*). The P&L must never read it
// as complete: net and margin «—» (as a missing cost), a «+ εθνικό έσοδο που λείπει» beside the revenue, the type table and
// the banner say it, the margin analysis leaves it out. The REAL modules/costs.js runs in a vm; the page helpers are stubs.
// NO-GO on main (TMS_ROOT=<git archive origin/main>): the flag is ignored and the card shows a net.
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'core', 'data-helpers.js'), 'utf8'));
global.TmsWeek = require(path.join(ROOT, 'core/tms-week.js'));
const { OrdersStock, OrdersCommon } = require(path.join(ROOT, 'core/orders-common.js'));
const SRC = fs.readFileSync(path.join(ROOT, 'modules', 'costs.js'), 'utf8');

function load() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, OrdersStock, OrdersCommon, getLinkedId, Number, Math, Object, JSON, String,
    PROXY_URL: 'https://w.example', localStorage: { getItem: () => null }, icon: () => '', fmtDate: (d) => String(d || ''),
  };
  ctx.window = ctx;
  vm.runInNewContext(SRC + '\nthis._ct = _ct; this.ctCardNums = ctCardNums; this.ctCostInfo = ctCostInfo; this.ctKindTotals = ctKindTotals; this.ctKind = ctKind;', ctx);
  return ctx;
}
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// a v5 national cycle with its costs entered: revenue 300 (one priced order), costs 200
const RT = (extra) => Object.assign({ id: 288, code: 'RT-T288', scope: 'NATL', trip_type: 'OWNED', truck_id: 5, revenue: 300, revenue_intl: 0, revenue_natl: 300,
  cost_gross: 200, cost_net: 180, profit_worst: 100, margin_worst_pct: 33.3 }, extra || {});

test('F4: a cycle with a national order without price — the card shows no net and says «+ εθνικό έσοδο που λείπει»', () => {
  const ctx = load();
  ctx._ct.linesByRt = { 288: [{ category: 'fuel', net: 180, vat: 20 }] };
  const t = RT({ v5_revenue_missing: true });
  const h = text(ctx.ctCardNums(t, ctx.ctCostInfo(t)));
  assert.ok(h.includes('+ εθνικό έσοδο που λείπει'), h);
  assert.ok(!/100,00|33[.,]3/.test(h), 'a net / margin is shown: ' + h);
  assert.ok(h.includes('€200') || h.includes('200,00'), 'the costs still show: ' + h);
});

test('F4: the same cycle with its price written (flag false) shows its net as before', () => {
  const ctx = load();
  ctx._ct.linesByRt = { 288: [{ category: 'fuel', net: 180, vat: 20 }] };
  const t = RT({ v5_revenue_missing: false });
  const h = text(ctx.ctCardNums(t, ctx.ctCostInfo(t)));
  assert.ok(!h.includes('που λείπει'), h);
  assert.ok(/100/.test(h), 'net shown: ' + h);
});

test('F4: the type totals are not complete while a cycle lacks a price; the count is said', () => {
  const ctx = load();
  ctx._ct.linesByRt = { 288: [{ category: 'fuel', net: 180, vat: 20 }], 289: [{ category: 'fuel', net: 10, vat: 0 }] };
  const tot = ctx.ctKindTotals([RT({ v5_revenue_missing: true }), RT({ id: 289 })]);
  assert.strictEqual(tot.complete, false);
  assert.strictEqual(tot.revMissing, 1);
  const ok = ctx.ctKindTotals([RT({ id: 289 })]);
  assert.strictEqual(ok.complete, true);
});

test('F4: an international cycle whose national order lacks its revenue is «Μικτό», not «Διεθνές»', () => {
  const ctx = load();
  const intl = RT({ scope: 'INTL', revenue_intl: 300, revenue_natl: 0 });
  assert.strictEqual(ctx.ctKind(intl), 'INTL');
  assert.strictEqual(ctx.ctKind(Object.assign(intl, { v5_revenue_missing: true })), 'MIX');
});
