// @ts-check
// ============================================================================
// staging-backend.spec.js, the REAL app in a browser against the NEW backend
// ----------------------------------------------------------------------------
// This is the test the staging validation could not previously make: the actual
// frontend, running in Chromium, reading and writing through the Stage 2
// Cloudflare Worker + Supabase Postgres, NOT Airtable. Every other proof so far
// was at the data/API layer (curl, the backend's own suite). This drives the UI.
//
// SETUP (all generated, nothing hand-maintained, see make-staging-config.sh):
//   config.staging.js  = real config.js with USE_PROXY=true + PROXY_URL -> Worker 2
//   app.staging.html   = real app.html loading config.staging.js
// Serve the repo root over http:
//   tests/e2e/make-staging-config.sh
//   python3 -m http.server 8899 &      (from the repo root)
//   LOCAL_ORIGIN=http://localhost:8899 STAGING_JWT=<token> \
//     npx playwright test tests/e2e/staging-backend.spec.js
//
// CORS, why we DON'T just point the browser at localhost: the Worker's CORS
// allowlist returns Access-Control-Allow-Origin ONLY for the real GitHub Pages
// origin (https://dimitrispetras21-del.github.io). That is correct security, but
// it means a browser served from http://localhost is blocked on every fetch,
// even though curl (which ignores CORS) succeeds. So the test navigates to the
// REAL origin and routes those URLs to the local files: the page believes it is
// on GitHub Pages, so its requests carry the allowed Origin and CORS passes.
// This is also the truest possible test, the app runs under its production
// origin. (Finding surfaced by this very suite: only a real browser catches it.)
//
// AUTH: the app's own login form is currently INCOMPATIBLE with the new backend
// (it POSTs {username, passwordHash}; the backend wants {username, password} and
// bcrypt-verifies in Postgres). That mismatch is a real finding, logged
// separately. To test the DATA flows regardless, we mint a JWT out-of-band
// (STAGING_JWT, from `POST /auth/login {username, password}`) and inject it into
// localStorage exactly where core/api.js reads it (`tms_jwt`), alongside the
// tms_user session the UI guard checks. So this proves the app's READS and
// WRITES against Postgres; it does NOT exercise the login screen (which can't
// pass yet, by design of this finding).
// ============================================================================

const { test, expect } = require('@playwright/test');

const JWT = process.env.STAGING_JWT || '';
// Where the static files are actually served (the local http.server).
const LOCAL_ORIGIN = process.env.LOCAL_ORIGIN || 'http://localhost:8899';
// The origin the Worker's CORS allowlist accepts; the browser must appear to be
// here. The path prefix matters: GitHub Pages serves the repo under /PETRASGROUP-TMS/.
const PROD_ORIGIN = 'https://dimitrispetras21-del.github.io';
const PROD_BASE = `${PROD_ORIGIN}/PETRASGROUP-TMS/`;

// Rewrite a prod-origin app URL to the same file on the local server. Only the
// app's own files are rerouted; requests to the Worker go out for real.
function localFor(prodUrl) {
  const rel = prodUrl.replace(PROD_BASE, '').replace(`${PROD_ORIGIN}/`, '');
  return `${LOCAL_ORIGIN}/${rel}`;
}

// Inject BOTH: the UI session guard (tms_user, checked by auth.js) and the API
// bearer token (tms_jwt, read by core/api.js in proxy mode).
//
// The username MUST be one in the frontend's USERS array ('dimitris'), NOT the
// backend's staging username ('stg_owner'). auth.js's _authRoleTampered()
// forces a logout if the tms_user.username is not in USERS, so an out-of-list
// username silently bounces the app to the login screen (an empty #sidebar).
// This is itself a real finding: the frontend USER list and the backend `users`
// table are two SEPARATE rosters that must be reconciled at cutover. The JWT is
// minted for the backend user and only carries the role; auth.js never inspects
// it, so the two names coexisting is fine for this data-flow test.
async function authAs(page, token) {
  await page.addInitScript((tok) => {
    localStorage.setItem('tms_user', JSON.stringify({
      name: 'Dimitris Petras', role: 'owner', username: 'dimitris',
      loginAt: Date.now(), expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    }));
    localStorage.setItem('tms_jwt', tok);
  }, token);
}

test.describe('app vs the Stage 2 backend (Postgres, not Airtable)', () => {
  test.skip(!JWT, 'STAGING_JWT not set — mint one via POST /auth/login and pass it in');

  // Run serially: all three tests drive the SAME staging Worker + Supabase with
  // the same JWT, and each loads the full app (many paginated fetches). Parallel
  // execution makes them contend on the free-tier backend and flake; the wall-
  // clock cost of serial is small and the signal is reliable.
  test.describe.configure({ mode: 'serial' });

  // The app's Service Worker (sw.js) aggressively caches and, served from a
  // throwaway http.server, ABORTS the module scripts, leaving a blank page
  // (gotcha #8, SW cache-bust). Block it at the context level so the test loads
  // live files. Only this suite needs it, so it is scoped here, not global.
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    // Serve the app UNDER its production origin so the Worker's CORS allowlist
    // accepts it: intercept the GitHub Pages host and fulfil from the local
    // server. Requests to the Worker (a different host) are left untouched and
    // go out for real, carrying the now-allowed Origin.
    await page.route(`${PROD_ORIGIN}/**`, async (route) => {
      const res = await fetch(localFor(route.request().url()));
      const body = Buffer.from(await res.arrayBuffer());
      route.fulfill({
        status: res.status,
        headers: { 'content-type': res.headers.get('content-type') || 'text/html' },
        body,
      });
    });
    // Abort the Google Fonts requests, which otherwise hang and stall the load.
    await page.route(/fonts\.g(oogleapis|static)\.com/, (r) => r.abort());
    await authAs(page, JWT);
  });

  test('the app loads against the new backend without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`${PROD_BASE}app.staging.html`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2500); // let the initial data loads settle

    // Ignore noise that is not about the backend contract: presence heartbeat,
    // favicon, Sentry, blocked fonts, and generic asset load failures (a 404 on
    // an icon or the SW under the route-fulfilled origin does not affect whether
    // the app talks correctly to the new backend, which the next tests assert
    // directly).
    //
    // ALSO EXPECTED on staging: 'Table not available on this backend' for the
    // sync-chain tables (ORDERS/NAT_LOADS/...). The staging DATABASE has them,
    // but the deployed WORKER is still main's code, which does not serve them
    // yet (they are gated behind PR #16). The app preloads some of these, so the
    // error is the CORRECT gated state, not a regression. This filter is the
    // one line to delete once PR #16 deploys, at which point their absence
    // becomes a real failure worth catching.
    //
    // A CORS or auth error against the Worker would match none of these and
    // still fail the test.
    const critical = errors.filter((e) =>
      !/presence/i.test(e)
      && !/favicon/i.test(e)
      && !/sentry/i.test(e)
      && !/fonts\.g/i.test(e)
      && !/Failed to load resource/i.test(e)
      && !/Table not available on this backend/i.test(e)
      && !/_atFetch/i.test(e));
    expect(critical, `unexpected console errors:\n${critical.join('\n')}`).toEqual([]);
  });

  test('requests actually go to the Worker, and return Airtable-shaped data', async ({ page }) => {
    /** @type {string[]} */
    const backendHits = [];
    let airtableHit = false;

    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('petras-tms-backend-staging')) backendHits.push(u);
      if (u.includes('api.airtable.com')) airtableHit = true;
    });

    // Capture a MIGRATED table's response specifically. Matching any /v0/ is
    // flaky: the app also preloads sync-chain tables (ORDERS, ...) which are not
    // deployed on the staging Worker yet and return a 200 {error} body, so a
    // generic matcher can resolve on one of those and see no `records`. CLIENTS
    // (tblFWKAQVUzAM8mCE, 1,921 rows imported) is migrated and always answers.
    const firstData = page.waitForResponse(
      (r) => r.url().includes('petras-tms-backend-staging')
        && r.url().includes('tblFWKAQVUzAM8mCE'),
      { timeout: 20000 },
    );

    await page.goto(`${PROD_BASE}app.staging.html`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });

    const res = await firstData;
    const body = await res.json();

    // The whole point of the facade: records look exactly like Airtable's.
    expect(Array.isArray(body.records), `expected records, got: ${JSON.stringify(body).slice(0, 120)}`).toBe(true);
    expect(body.records.length).toBeGreaterThan(0);
    expect(body.records[0].id).toMatch(/^rec[A-Za-z0-9]{14}$/);
    expect(body.records[0].fields).toBeTruthy();

    expect(backendHits.length, 'no requests reached the Worker').toBeGreaterThan(0);
    expect(airtableHit, 'the app hit Airtable directly — it is NOT on the new backend').toBe(false);
  });

  test('a reference page renders real Postgres data in the grid', async ({ page }) => {
    await page.goto(`${PROD_BASE}app.staging.html`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });
    // Navigate the way a user does, via the app's own router.
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.navigate && window.navigate('clients'));

    // CLIENTS is 1,921 rows fetched in ~20 paginated calls from the Worker, so
    // the grid genuinely takes ~10-15s to populate. Wait for the loading state
    // to clear AND real rows to appear, rather than a fixed sleep. The data all
    // comes from Postgres (asserted by the request-tracking test above).
    await expect
      .poll(async () => page.locator('tr').count(), { timeout: 25000, intervals: [1000] })
      .toBeGreaterThan(50);

    await expect(page.locator('body')).not.toContainText('Loading Clients', { timeout: 5000 });
  });
});
