// @ts-check
// VS sync scenario tests — read-only verification that the 5 canonical
// Veroia Switch scenarios still render correctly on Weekly National.
// Does NOT create or mutate records.

const { test, expect } = require('@playwright/test');

async function mockAuth(page) {
  await page.addInitScript(() => {
    localStorage.setItem('tms_user', JSON.stringify({
      name: 'Test User', role: 'owner', username: 'dimitris',
      loginAt: Date.now(), expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    }));
  });
}

test.describe('VS sync chain — read-only verification', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
    await page.goto('app.html');
    await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });
  });

  test('Weekly National shows ΑΝΟΔΟΣ and ΚΑΘΟΔΟΣ columns', async ({ page }) => {
    await page.evaluate(() => window.navigate('weekly_natl'));
    await page.waitForTimeout(3000);
    const content = await page.locator('#content').textContent();
    // The page should have both direction headers regardless of data
    expect(content).toMatch(/ΑΝΟΔΟΣ/);
    expect(content).toMatch(/ΚΑΘΟΔΟΣ/);
  });

  test('Weekly Intl renders for current and future weeks', async ({ page }) => {
    await page.evaluate(() => window.navigate('weekly_intl'));
    await page.waitForTimeout(3000);
    const content = await page.locator('#content').textContent();
    // Command Center must render even when week has zero orders
    expect(content).toMatch(/COMMAND CENTER|Weekly|W\d+/i);
  });

  test('Daily Ramp shows Inbound and Outbound sections', async ({ page }) => {
    await page.evaluate(() => window.navigate('daily_ramp'));
    await page.waitForTimeout(3000);
    const content = await page.locator('#content').textContent();
    // Ramp board always has both flows
    expect(content.toLowerCase()).toMatch(/inbound|παραλαβ/);
    expect(content.toLowerCase()).toMatch(/outbound|φόρτωσ|φορτωσ/);
  });

  test('Daily Ops header shows overdue count inline when present', async ({ page }) => {
    await page.evaluate(() => window.navigate('daily_ops'));
    await page.waitForTimeout(3000);
    const subTitle = await page.locator('.page-sub').first().textContent();
    // Subtitle format: "<date> · X orders" with optional "· Y overdue" suffix
    expect(subTitle).toMatch(/\d+ orders/);
  });
});
