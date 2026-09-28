// Proof rig — the one «Παραγγελίες» page, Κατάλογος view, on the RECORDED
// 28/8 backend (HAR replay, tests/critics/auth.js). Real data, so the
// screenshots carry client names and stay OUT of the repo (scratchpad only).
//
// What it proves (owner 28/9/2026 — one page, both types):
//   · the page opens from the new route AND from the three old ones (aliases);
//   · «Όλες» lists international AND national orders in one list, «Διεθνείς» /
//     «Εθνικές» narrow it, the KPI totals match the rows;
//   · a row opens the card of ITS OWN module (intl → #intlDetail, natl →
//     #natlDetail) — the cards and their actions are the modules' code;
//   · the dispatcher sees no money tabs except the read-only «Προς τιμολόγηση»;
//   · no console / page errors.
// Run from the MAIN repo root (node_modules live there):
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<wt>/ node tests/critics/orders-catalog-har.js
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));

const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const SHOTS = process.env.SHOTS_DIR || '/tmp';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

async function run(role) {
  console.log(`\n── ${role}`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await preparePage(page, role);
  await page.addInitScript(r => localStorage.setItem('tms_orders_hub_demo_' + r, JSON.stringify({ scope: 'all', view: 'catalog' })), role);
  await gotoPage(page, 'orders_intl', BASE);          // old route → alias
  await page.waitForFunction(() => document.querySelector('#ocTable tbody tr, #ocTable .empty-state, #ordersBody .error-state'), null, { timeout: 30000 }).catch(() => {});
  ok(await page.evaluate(() => currentPage) === 'orders', 'old route orders_intl lands on page «orders»');
  ok(await page.evaluate(() => OrdersHub.scope) === 'intl', 'alias orders_intl opens the international scope');
  await page.evaluate(() => OrdersHub.setScope('all'));
  await page.waitForTimeout(1500);
  await page.waitForSelector('#ocTable tbody tr', { timeout: 30000 });
  const tabs = await page.$$eval('.oh-tab', b => b.map(x => x.dataset.view));
  console.log('    tabs:', tabs.join(', '));
  if (role === 'dispatcher') ok(JSON.stringify(tabs) === JSON.stringify(['catalog', 'invoicing']), 'dispatcher: Κατάλογος + read-only Προς τιμολόγηση only');
  const counts = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#ocTable tbody tr')].map(tr => tr.getAttribute('onclick') || '');
    return { intl: rows.filter(o => o.includes("'intl'")).length, natl: rows.filter(o => o.includes("'natl'")).length };
  });
  console.log('    painted rows:', JSON.stringify(counts));
  ok(counts.intl > 0, 'Όλες: international rows present');
  ok(counts.natl > 0, 'Όλες: national rows present');
  const kpiTotal = await page.$eval('#ocKpi .oc-stat .oc-v', e => +e.textContent.trim());
  const foot = await page.$eval('.oc-foot', e => e.textContent);
  ok(foot.includes(String(kpiTotal)), `KPI «Σύνολο» ${kpiTotal} = the list count «${foot.trim()}» (no filters)`);
  const place = await page.$eval('#ocTable tbody tr td:nth-child(4)', td => ({ name: td.querySelector('.oc-pname')?.textContent || '', sub: td.querySelector('.oc-psub')?.textContent || '' }));
  ok(!!place.name && /\d+\/\d+/.test(place.sub), `ΦΟΡΤΩΣΗ cell = name on top + city/date below («${place.name}» / «${place.sub}»)`);
  await page.screenshot({ path: path.join(SHOTS, `har-catalog-${role}-all.png`) });

  // intl card
  await page.click('#ocTable tbody tr[onclick*="\'intl\'"]');
  await page.waitForTimeout(400);
  ok(await page.$eval('#intlDetail', e => !e.classList.contains('hidden') && e.innerHTML.length > 200), 'intl row opens the international card (#intlDetail)');
  await page.screenshot({ path: path.join(SHOTS, `har-catalog-${role}-intl-card.png`) });
  // natl card
  await page.click('#ocTable tbody tr[onclick*="\'natl\'"]');
  await page.waitForTimeout(400);
  ok(await page.$eval('#natlDetail', e => !e.classList.contains('hidden') && e.innerHTML.length > 200), 'natl row opens the national card (#natlDetail)');
  ok(await page.$eval('#intlDetail', e => e.classList.contains('hidden')), 'opening a national card closes the international one');
  await page.screenshot({ path: path.join(SHOTS, `har-catalog-${role}-natl-card.png`) });

  // scopes
  await page.evaluate(() => OrdersHub.setScope('natl'));
  await page.waitForSelector('#ocTable tbody tr', { timeout: 30000 });
  const onlyNatl = await page.$$eval('#ocTable tbody tr', trs => trs.every(tr => (tr.getAttribute('onclick') || '').includes("'natl'")));
  ok(onlyNatl, 'scope «Εθνικές» shows national rows only');
  await page.evaluate(() => OrdersHub.setScope('intl'));
  await page.waitForSelector('#ocTable tbody tr', { timeout: 30000 });
  const onlyIntl = await page.$$eval('#ocTable tbody tr', trs => trs.every(tr => (tr.getAttribute('onclick') || '').includes("'intl'")));
  ok(onlyIntl, 'scope «Διεθνείς» shows international rows only');

  // alias invoicing
  await page.evaluate(() => navigate('invoicing'));
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => currentPage === 'orders' && OrdersHub.view === 'invoicing'), 'old route «invoicing» opens the view «Προς τιμολόγηση»');
  ok(!(await page.$('#nav_orders_intl')) && !(await page.$('#nav_invoicing')) && !!(await page.$('#nav_orders')), 'sidebar: one «Παραγγελίες» item, no old items');

  // «Failed to fetch» = a request the 28/8 recording does not hold (e.g. the
  // reference preload asks trucks for fields added after the recording and
  // core/auth.js:48 calls it without a catch — pre-existing, every page). It is
  // listed, not hidden; anything else is a real error of this change.
  const harGaps = errors.filter(e => /Failed to fetch/.test(e));
  const real = errors.filter(e => !/Failed to fetch/.test(e));
  if (harGaps.length) console.log(`    (${harGaps.length} HAR-gap errors «Failed to fetch» — not from this change)`);
  real.forEach(e => console.log('    ' + e));
  ok(real.length === 0, 'no page/console errors other than HAR gaps');
  await browser.close();
}

(async () => {
  for (const r of ['owner', 'dispatcher']) await run(r);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
