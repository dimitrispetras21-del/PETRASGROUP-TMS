// @ts-check
// Smoke tests — verify the app loads and every page navigates without runtime errors.
// These tests expect a session to exist in localStorage (set by auth fixture) —
// they do NOT attempt an actual login.

const { test, expect } = require('@playwright/test');

// Inject a fake session so auth.js doesn't bounce us to index.html.
// Matches the shape produced by index.html doLogin() — owner role bypasses all perm checks.
async function mockAuth(page) {
  await page.addInitScript(() => {
    const session = {
      name: 'Test User',
      role: 'owner',
      username: 'dimitris',
      loginAt: Date.now(),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    };
    localStorage.setItem('tms_user', JSON.stringify(session));
  });
}

test.describe('TMS smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('app.html loads without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('app.html');
    await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);  // allow async loads to finish

    // Filter out known-benign errors (presence heartbeat 404s if PRESENCE table not present, etc.)
    const critical = errors.filter(e =>
      !e.includes('presence') &&
      !e.includes('favicon') &&
      !e.includes('Sentry')  // Sentry noise when no DSN configured
    );
    expect(critical, 'Critical console errors: ' + critical.join('\n')).toHaveLength(0);
  });

  const pagesToTest = [
    { id: 'dashboard',       expectText: /Dashboard|Control/i },
    { id: 'weekly_intl',     expectText: /Weekly International|COMMAND CENTER/i },
    { id: 'weekly_natl',     expectText: /Weekly National|ΑΝΟΔΟΣ|ΚΑΘΟΔΟΣ/i },
    { id: 'daily_ops',       expectText: /Daily Ops/i },
    { id: 'daily_ramp',      expectText: /Ramp Board/i },
    { id: 'orders_intl',     expectText: /International Orders/i },
    { id: 'orders_natl',     expectText: /National Orders/i },
    { id: 'performance',     expectText: /Performance|Score/i },
    { id: 'locations',       expectText: /Locations/i },
    { id: 'clients',         expectText: /Clients/i },
    { id: 'partners',        expectText: /Partners/i },
    { id: 'drivers',         expectText: /Drivers/i },
    { id: 'trucks',          expectText: /Trucks/i },
    { id: 'trailers',        expectText: /Trailers/i },
  ];

  for (const p of pagesToTest) {
    test(`page "${p.id}" renders without [object Object] or raw IDs`, async ({ page }) => {
      await page.goto('app.html');
      await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });

      // Navigate via the router
      await page.evaluate((id) => window.navigate(id), p.id);
      await page.waitForTimeout(3000);  // allow data fetch + render

      const contentText = await page.locator('#content').textContent();

      // Guard against the bugs we just fixed
      expect(contentText, 'empty-state regression').not.toContain('[object Object]');
      expect(contentText, 'STOP:rec leak regression').not.toMatch(/STOP:rec[A-Za-z0-9]{14,}/);
      expect(contentText, 'bare recXXX leak').not.toMatch(/\brec[A-Za-z0-9]{14,17}\b/);
    });
  }
});
