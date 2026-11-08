// Proof rig — P&L list cut (28/10): GET /costs/pnl was one read of «limit 300» with nothing said. The new Worker
// answers { records, truncated, cap, total }; the old one cuts at 300 silently. The page must say a cut on the
// banner (the totals miss the cut RTs) with EITHER Worker live, and say nothing for a whole list. Opens the real
// screen with /costs/* served by facades; synthetic data only.
//
// Run from the MAIN repo root:
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<wt>/ node .claude/worktrees/<wt>/tests/critics/pnl-cut-proof.js
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const SHOTS = process.env.PW_SHOTS || '';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const mkPnl = (id) => ({
  id, code: 'RT-' + id, scope: 'INTL', trip_type: 'OWNED', truck_id: 1, driver_id: null, partner_id: null,
  date_start: '2026-09-28', date_end: null, status: 'closed', total_km: null,
  revenue: 1000, revenue_intl: 1000, revenue_natl: 0, cost_net: 0, cost_gross: 0, cost_vat: 0,
  profit_worst: 1000, margin_worst_pct: 100, dl_trip_value: null, dl_expenses: null, driver_pay_pending: false, driver_pay_missing: false,
});
const list = (n) => Array.from({ length: n }, (_, i) => mkPnl(i + 1));
const LOOKUPS = { trucks: [{ id: 1, license_plate: 'ΤΕΣΤ-1001', active: true }], trailers: [], drivers: [], partners: [] };

async function open(browser, pnlBody, shot) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const S = { errors: [] };
  page.on('pageerror', e => S.errors.push(String(e)));
  await preparePage(page, 'owner');
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, route => {
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith('/costs/pnl')) return json(route, pnlBody);
    if (p.endsWith('/costs/lookups')) return json(route, LOOKUPS);
    if (p.endsWith('/costs/lines')) return json(route, { records: [], next_offset: null });
    return route.request().method() === 'GET' ? json(route, { records: [] }) : json(route, { ok: true });
  });
  await gotoPage(page, 'costs', BASE);
  await page.waitForSelector('.ct-stake .ct-stop .t, .ct-fail', { timeout: 60000 });
  await page.waitForTimeout(400);
  if (SHOTS && shot) await page.screenshot({ path: path.join(SHOTS, shot), clip: { x: 0, y: 0, width: 1440, height: 560 } });
  const cut = await page.$eval('#ctPnlCut', el => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
  const fail = await page.$eval('.ct-fail', el => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
  await ctx.close();
  return { cut, fail, S };
}

(async () => {
  const browser = await chromium.launch();
  console.log('\n── new Worker, whole list (198 of 198)');
  { const r = await open(browser, { records: list(198), truncated: false, cap: 999, total: 198 }, 'pnl-cut-01-whole.png');
    ok(r.cut === null, 'no cut note'); ok(!r.S.errors.length, 'no page errors: ' + r.S.errors.join(' ')); }
  console.log('\n── new Worker, truncated (999 of 1200)');
  { const r = await open(browser, { records: list(999), truncated: true, cap: 999, total: 1200 }, 'pnl-cut-02-truncated.png');
    ok(/Φορτώθηκαν 999 από 1200 δρομολόγια: τα υπόλοιπα λείπουν από τη λίστα ΚΑΙ από τα σύνολα/.test(r.cut || ''), 'banner says: «' + r.cut + '»');
    ok(!r.S.errors.length, 'no page errors'); }
  console.log('\n── new Worker, near the cap (900 of 900)');
  { const r = await open(browser, { records: list(900), truncated: false, cap: 999, total: 900 }, 'pnl-cut-03-near.png');
    ok(/900 δρομολόγια, κοντά στο όριο των 999/.test(r.cut || ''), 'banner says: «' + r.cut + '»'); }
  console.log('\n── old Worker, 300 without «truncated»');
  { const r = await open(browser, { records: list(300) }, 'pnl-cut-04-old-300.png');
    ok(/Φορτώθηκαν 300 δρομολόγια: /.test(r.cut || ''), 'banner says: «' + r.cut + '»'); }
  console.log('\n── old Worker, 198 without «truncated» (today, before the deploy)');
  { const r = await open(browser, { records: list(198) });
    ok(r.cut === null, 'no cut note'); }
  console.log('\n── empty list, count says 198');
  { const r = await open(browser, { records: [], truncated: true, cap: 999, total: 198 }, 'pnl-cut-05-empty-but-not.png');
    ok(/κενό ενώ υπάρχουν 198 δρομολόγια/.test(r.fail || ''), 'error card, not onboarding: «' + r.fail + '»'); }
  await browser.close();
  console.log(`\n${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
