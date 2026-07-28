// ============================================================================
// post-c2-walk.spec.js — Phase 4 step 4: walk the sidebar on the LIVE app
// ----------------------------------------------------------------------------
// Runs against the real production site AFTER the C2 cutover, so no origin
// tricks and no config rewriting: the served app is already in proxy mode.
// Logs in through the real form, then clicks every visible sidebar item and
// asserts the two invariants that define a healthy post-C2 system:
//   1. ZERO requests to api.airtable.com (the frozen-reference rule),
//   2. no Worker API response >= 500 while pages render (4xx like a role 403
//      can be legitimate; 5xx never is).
// Read-only by design: navigation only, no form submissions, no writes.
// Credentials via env (PW_TMS_USER / PW_TMS_PASS), never hardcoded.
// ============================================================================

const { test, expect } = require('@playwright/test');

const USER = process.env.PW_TMS_USER || '';
const PASS = process.env.PW_TMS_PASS || '';

test.describe('post-C2 live sidebar walk', () => {
  test.skip(!USER || !PASS, 'PW_TMS_USER / PW_TMS_PASS not set');
  test.use({ serviceWorkers: 'block' });
  test.setTimeout(180 * 1000);

  test('login + every sidebar page renders on the new backend, zero Airtable traffic', async ({ page }) => {
    const airtableCalls = [];
    const serverErrors = [];
    page.on('request', (r) => {
      if (r.url().includes('api.airtable.com')) airtableCalls.push(r.url());
    });
    page.on('response', (r) => {
      // 5xx = backend broken. 422 = a filter the translator rejected, which is
      // how Weekly International died live on 2026-07-28 while this walk was
      // "green": it only asserted no-5xx, so unsupported-filter pages rendered
      // an error toast the walk never saw. 401/403 stay allowed (role denials
      // are legitimate); 422 on a data fetch never is.
      if (r.url().includes('workers.dev') && (r.status() >= 500 || r.status() === 422)) {
        serverErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
      }
    });

    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.fill('#username', USER);
    await page.fill('#password', PASS);
    await page.click('.btn-login');
    await expect(page).toHaveURL(/app\.html/, { timeout: 20000 });
    await expect(page.locator('#sidebar')).toBeVisible({ timeout: 20000 });
    // Nav items render asynchronously after boot (renderNav runs post-load);
    // an immediate count() races it and sees zero.
    await page.waitForSelector('.nav-item', { timeout: 30000 });

    // Expand any collapsed nav sections so every item is clickable.
    const sections = page.locator('.nav-section.collapsed-section');
    const sc = await sections.count();
    for (let i = 0; i < sc; i++) await sections.nth(i).click().catch(() => {});

    const items = page.locator('.nav-item');
    const n = await items.count();
    expect(n, 'sidebar rendered no nav items').toBeGreaterThan(10);

    const visited = [];
    for (let i = 0; i < n; i++) {
      const item = items.nth(i);
      if (!(await item.isVisible().catch(() => false))) continue;
      const label = (await item.locator('.nav-label').textContent().catch(() => '')) || `item ${i}`;
      await item.click().catch(() => {});
      // Let the module mount + its data requests fire.
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      visited.push(label.trim());
    }

    console.log(`WALKED ${visited.length}/${n} nav items: ${visited.join(' · ')}`);
    expect(airtableCalls, `AIRTABLE WAS CONTACTED (frozen-reference violation):\n${airtableCalls.join('\n')}`).toHaveLength(0);
    expect(serverErrors, `Worker 5xx during walk:\n${serverErrors.join('\n')}`).toHaveLength(0);
    expect(visited.length).toBeGreaterThan(10);
  });
});
