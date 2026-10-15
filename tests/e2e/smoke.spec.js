// @ts-check
// Smoke tests — verify the app loads and every page navigates without runtime errors.
//
// AUTH: these tests perform a REAL login against the Worker backend.
//
// Why not a mocked localStorage session (what this file did until 2026-08-10):
// before the C2 cutover, auth was client-side only, so writing a session object
// into localStorage was enough to walk the app. Since the cutover every data call
// carries a JWT the Worker issues at login and validates server-side. A synthetic
// session therefore passes auth.js's own check but earns a 401 on every fetch, the
// app bounces to index.html, and `page.evaluate(window.navigate)` dies with
// "Execution context was destroyed". That failure mode looks exactly like a broken
// app: 10 of 15 tests failed against a production deploy that was in fact healthy.
// Do NOT reintroduce a fake session — a green run would then prove nothing.
//
// Credentials come from the environment, never from the repo:
//   PW_TMS_USER=<account> PW_TMS_PASS=<password> npx playwright test tests/e2e/smoke.spec.js
// Use a real, active account with an owner or management role. The demo_* accounts
// are active=false since 9/2026, and a disabled account fails exactly like a wrong
// password. Run it against the local copy (PW_BASE_URL) before production.
//
// Tests run against the live GitHub Pages deploy by default (playwright.config.js);
// override with PW_BASE_URL. They are READ-ONLY: they navigate and assert on
// rendered text, and never create, edit or delete a record.

const { test, expect } = require('@playwright/test');

const USER = process.env.PW_TMS_USER;
const PASS = process.env.PW_TMS_PASS;

// Some pages are slow by design on the current backend: daily_ops ships a filter
// the deployed Worker does not know yet ({VS CD Date}), so it 422s, retries 3x and
// only then falls back — about 7-10s before first paint. Poll for a settled render
// instead of a flat timeout, or the assertion reads the skeleton and reports a bug
// that is really just impatience.
const RENDER_TIMEOUT_MS = 30000;

async function login(page) {
  await page.goto('index.html');
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.click('button.btn-login');
  // app.html is a separate document, so this is a real navigation.
  await page.waitForURL(/app\.html/, { timeout: 20000 });
  await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });
}

/** Navigate via the router and wait until #content stops showing a loading skeleton. */
async function gotoPage(page, id) {
  await page.evaluate((pageId) => window.navigate(pageId), id);
  await expect
    .poll(async () => {
      const text = await page.locator('#content').textContent();
      // "Φόρτωση…" with almost no other content = still rendering.
      return text.length > 400 || !/Φόρτωση/.test(text);
    }, { timeout: RENDER_TIMEOUT_MS, message: `page "${id}" never finished rendering` })
    .toBe(true);
  return page.locator('#content').textContent();
}

test.describe('TMS smoke tests', () => {
  test.skip(!USER || !PASS,
    'Set PW_TMS_USER and PW_TMS_PASS (see ops repo .env TMS_PW_*) — these tests need a real login.');

  test('login succeeds and app.html loads without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));

    await login(page);
    await page.waitForTimeout(2000);  // allow async loads to finish

    const critical = errors.filter(e =>
      !e.includes('presence') &&
      !e.includes('favicon') &&
      // Case-insensitive: SRI-block errors cite the lowercase sentry-cdn URL,
      // which the old 'Sentry' check missed. CDN/SDK state is not app code.
      !/sentry/i.test(e) &&
      // TODO(audit): remove once the Worker deploy adds {VS CD Date}. daily_ops
      // filters on a field the deployed facade rejects; the module catches the
      // 422 and falls back, so the page is correct, only slow. Tracked in
      // .ai-notes/2026-08-10-client-work-review-and-call-prep.md
      !/422/.test(e)
    );
    expect(critical, 'Critical console errors: ' + critical.join('\n')).toHaveLength(0);
  });

  const pagesToTest = [
    'dashboard', 'weekly_intl', 'weekly_natl', 'daily_ops', 'daily_ramp',
    'orders_intl', 'orders_natl', 'performance', 'invoicing', 'locations',
    'clients', 'partners', 'drivers', 'trucks', 'trailers', 'ceo_dashboard',
    // The sidebar since 8/2026 (vd 16/10): maintenance, workshops, money, history.
    'maint_dash', 'maint_req', 'maint_expiry', 'maint_svc', 'workshops',
    'payroll', 'expenses', 'pallet_ledger', 'notifications', 'audit_trail',
  ];

  for (const id of pagesToTest) {
    test(`page "${id}" renders without [object Object] or raw IDs`, async ({ page }) => {
      await login(page);
      const contentText = await gotoPage(page, id);

      // Guard against the bugs we fixed: empty states stringifying an object,
      // and Airtable record ids leaking into user-facing text.
      expect(contentText, 'empty-state regression').not.toContain('[object Object]');
      expect(contentText, 'STOP:rec leak regression').not.toMatch(/STOP:rec[A-Za-z0-9]{14,}/);
      expect(contentText, 'bare recXXX leak').not.toMatch(/\brec[A-Za-z0-9]{14,17}\b/);
    });
  }
});
