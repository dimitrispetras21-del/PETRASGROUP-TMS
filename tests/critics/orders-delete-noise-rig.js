// Proof rig — a SUCCESSFUL order delete must not end in a red «Failed to load
// record» toast (live check 29/9: owner 08:59 #394, Παντελής 09:41 #400 —
// app_errors «atGetOne(tblgHlNmLBH3JTdIM, rec…): Record not found»).
// Cause: after the soft delete the front reloaded the order's stops through
// stopsLoad → atGetOne(<the order it had just deleted>). The database removes
// the stops itself (delete_order_cascade / national trigger), so the reload
// was dead weight that only produced a false failure.
//
// Recorded 28/8 backend (HAR) + stubs: DELETE → 200; any GET of the deleted
// record afterwards → 404 «Record not found» (what production answers).
// Run from the MAIN repo root:
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<wt>/ node .claude/worktrees/<wt>/tests/critics/orders-delete-noise-rig.js
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

async function run(type) {
  console.log(`\n── delete ${type}`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  page.on('dialog', d => d.accept());                  // the native «ΔΙΑΓΡΑΦΗ;» confirm = the user's click
  await preparePage(page, 'owner');
  await page.addInitScript(() => localStorage.setItem('tms_orders_hub_demo_owner', JSON.stringify({ scope: 'all', view: 'catalog' })));
  let deletedId = null;
  // Registered AFTER the HAR replay → handled first; everything else falls back to the HAR.
  await page.route(`**/${HOST}/**`, async route => {
    const req = route.request(); const u = new URL(req.url());
    const m = u.pathname.match(/\/v0\/[^/]+\/([^/]+)\/(rec[A-Za-z0-9]+)$/);
    if (req.method() === 'DELETE' && m) { deletedId = m[2]; return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: m[2], deleted: true }) }); }
    if (req.method() === 'GET' && m && m[2] === deletedId) return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { type: 'NOT_FOUND', message: 'Record not found' } }) });
    if (req.method() === 'POST' || req.method() === 'PATCH' || req.method() === 'DELETE') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ records: [], ok: true }) });
    return route.fallback();
  });
  await gotoPage(page, 'orders', BASE);
  await page.waitForSelector('#ocTable tbody tr', { timeout: 30000 });
  const id = await page.$eval(`#ocTable tbody tr[onclick*="'${type}'"]`, tr => tr.getAttribute('onclick').match(/'(rec[^']+)'/)[1]);
  const logsBefore = logs.length;
  await page.evaluate(async ({ type, id }) => {
    window.__toasts = [];
    const t0 = window.toast; window.toast = (m, k) => { window.__toasts.push([String(m), k || '']); return t0 && t0(m, k); };
    const e0 = window.showErrorToast; window.showErrorToast = (m, k) => { window.__toasts.push([String(m), k || 'error']); return e0 && e0(m, k); };
    await (type === 'intl' ? deleteIntlOrder(id) : deleteNatlOrder(id));
  }, { type, id });
  await page.waitForTimeout(1200);
  const toasts = await page.evaluate(() => window.__toasts);
  console.log('    toasts:', JSON.stringify(toasts));
  ok(deletedId === id, `the DELETE went out for ${id}`);
  ok(!toasts.some(([m]) => /Failed to load record|Η εγγραφή δεν φορτώθηκε/.test(m)), 'no «Η εγγραφή δεν φορτώθηκε» toast after a successful delete');
  const after = logs.slice(logsBefore).filter(l => /atGetOne\(.*Record not found/.test(l));
  ok(after.length === 0, 'no «atGetOne … Record not found» error logged' + (after.length ? ': ' + after[0].slice(0, 120) : ''));
  await browser.close();
}

(async () => {
  for (const t of ['intl', 'natl']) await run(t);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
