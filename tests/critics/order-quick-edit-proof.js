// Proof rig — the accountant's «Διόρθωση» on an order card (owner 20/10/2026,
// core/order-quick-edit.js). Recorded backend (HAR) for the reads; every write
// is captured and answered here, so nothing reaches the real Worker.
// The proof is the PATCH BODY (one call, only the changed field), never a toast.
//
// Run from the MAIN repo root (node_modules + .har live there):
//   PW_BASE_URL=http://127.0.0.1:8788/ node tests/critics/order-quick-edit-proof.js
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const T = { ORDERS: 'tblgHlNmLBH3JTdIM', NAT_ORDERS: 'tblGHCCsTMqAy4KR2' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

async function newPage(browser, role) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1600, height: 960 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page._patches = []; page._errors = [];
  page.on('pageerror', e => page._errors.push(String(e)));
  await preparePage(page, role);
  await page.addInitScript(r => localStorage.setItem('tms_orders_hub_demo_' + r, JSON.stringify({ scope: 'all', view: 'catalog' })), role);
  await page.route(`**/${HOST}/**`, async route => {
    const req = route.request();
    if (['PATCH', 'POST', 'DELETE'].includes(req.method())) {
      const u = decodeURIComponent(req.url());
      const body = req.postDataJSON() || {};
      page._patches.push({ method: req.method(), url: u, body });
      const id = (u.match(/rec[A-Za-z0-9]{14}/) || [''])[0];
      return json(route, { id, fields: body.fields || {} });
    }
    return route.fallback();
  });
  return page;
}

async function cardFlow(page, type) {
  const row = page.locator(`#ocTable tbody tr[onclick*="${type}"]`).first();
  if (!(await row.count())) { ok(false, `${type}: a row to open`); return; }
  await row.click();
  const btn = type === 'intl' ? page.locator('[data-oi-act="quick-edit"]') : page.locator('.on-head-edit', { hasText: 'Διόρθωση' });
  await btn.first().waitFor({ timeout: 15000 }).catch(() => {});
  ok(await btn.count() === 1, `${type}: card offers «Διόρθωση»`);
  ok(await page.locator('[data-oi-act="edit"], [data-oi-act="delete"], [data-oi-act="dup"]').count() === 0
    && await page.locator('.on-head-edit', { hasText: 'Επεξεργασία' }).count() === 0, `${type}: no full form, no delete, no duplicate`);
  if (!(await btn.count())) return;
  await btn.first().click();
  const opened = await page.waitForSelector('#oqe-Price', { timeout: 8000 }).then(() => true, () => false);
  ok(opened, `${type}: «Διόρθωση» opens the form` + (opened ? '' : ' — errors ' + JSON.stringify(page._errors.slice(-3))));
  if (!opened) return;
  ok(await page.locator('#oqe-Price, #oqe-Reference, #oqe-Loading-DateTime, #oqe-Delivery-DateTime, #oqe-Notes').count() === 5, `${type}: the five fields`);
  const before = page._patches.length;
  await page.fill('#oqe-Price', '4321');
  await page.click('#oqe-save');
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'), null, { timeout: 8000 }).catch(() => {});
  const mine = page._patches.slice(before);
  const table = type === 'intl' ? T.ORDERS : T.NAT_ORDERS;
  ok(mine.length === 1 && mine[0].method === 'PATCH' && mine[0].url.includes(table), `${type}: exactly one PATCH, on ${type === 'intl' ? 'ORDERS' : 'NATIONAL ORDERS'} — ` + JSON.stringify(mine.map(p => p.method + ' ' + p.url.split('/').slice(-2).join('/'))));
  ok(mine[0] && JSON.stringify(mine[0].body.fields) === JSON.stringify({ Price: 4321 }), `${type}: body = only the changed field {Price: 4321} — ` + JSON.stringify(mine[0] && mine[0].body));
}

(async () => {
  const browser = await chromium.launch();
  console.log('\n[accountant] Κατάλογος → κάρτα → Διόρθωση');
  const page = await newPage(browser, 'accountant');
  await gotoPage(page, 'orders', BASE);
  await page.waitForSelector('#ocTable tbody tr[onclick]', { timeout: 120000 });
  await cardFlow(page, 'intl');
  await page.keyboard.press('Escape');
  await cardFlow(page, 'natl');
  ok(page._errors.length === 0, 'accountant: no page errors ' + JSON.stringify(page._errors.slice(0, 3)));

  console.log('\n[dispatcher] the full form stays, no «Διόρθωση»');
  const d = await newPage(browser, 'dispatcher');
  await gotoPage(d, 'orders', BASE);
  await d.waitForSelector('#ocTable tbody tr[onclick]', { timeout: 120000 });
  await d.locator('#ocTable tbody tr[onclick]').first().click();
  await d.waitForTimeout(1500);
  ok(await d.locator('[data-oi-act="quick-edit"]').count() === 0 && await d.locator('.on-head-edit', { hasText: 'Διόρθωση' }).count() === 0, 'dispatcher: no «Διόρθωση»');
  await browser.close();
  console.log(`\n${pass}/${pass + fail} assertions`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ΚΑΤΑΡΡΕΥΣΗ', e); process.exit(1); });
