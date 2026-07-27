// @ts-check
// ============================================================================
// staging-login.spec.js, the REAL login screen against the new backend
// ----------------------------------------------------------------------------
// The companion to staging-backend.spec.js. That one injected a JWT to test the
// data flows because login was broken; this one exercises the ACTUAL login form
// (index.html doLogin) end to end against the Stage 2 Worker, now that the login
// contract is fixed (fix/proxy-login-contract: send plaintext, read data.user,
// derive expiry from the JWT).
//
// It runs the UNMODIFIED index.html and app.html, no generated app.staging.html.
// The only swap is config.js -> a USE_PROXY=true + PROXY_URL=Worker 2 config,
// done at the network layer (page.route), so what runs is exactly production.
//
// CORS: the Worker allowlists only the GitHub Pages origin, so the browser must
// appear to be there. We navigate under the prod origin and fulfil the app's own
// files from the local server; Worker requests go out for real with the allowed
// Origin. (Same technique + reason as staging-backend.spec.js.)
//
// Requires: a backend user whose username is ALSO in the frontend USERS array
// (e.g. 'dimitris'), because auth.js logs out any username not in USERS (finding
// F-E3). Pass its staging credentials via STG_LOGIN_USER / STG_LOGIN_PASS.
// ============================================================================

const { test, expect } = require('@playwright/test');

const LOGIN_USER = process.env.STG_LOGIN_USER || '';
const LOGIN_PASS = process.env.STG_LOGIN_PASS || '';
const LOCAL_ORIGIN = process.env.LOCAL_ORIGIN || 'http://localhost:8899';
const BACKEND = 'https://petras-tms-backend-staging.petrasgroup.workers.dev';
const PROD_ORIGIN = 'https://dimitrispetras21-del.github.io';
const PROD_BASE = `${PROD_ORIGIN}/PETRASGROUP-TMS/`;

// Flip USE_PROXY=false -> true and repoint PROXY_URL at the Stage 2 Worker,
// wherever they are declared. NOTE (finding F-E4): USE_PROXY lives in TWO
// places, config.js AND inline in index.html (the login page does not load
// config.js, it has its own copy, commented "must match config.js"). So the
// transform must run on BOTH the config file and the index.html body, or the
// login page silently stays in direct mode. This is a real cutover gotcha:
// both copies must be flipped together.
function proxify(src) {
  return src
    .replace(/const USE_PROXY\s*=\s*false;/g, 'const USE_PROXY  = true;')
    .replace(/const PROXY_URL\s*=\s*'[^']*';/g, `const PROXY_URL  = '${BACKEND}';`);
}

test.describe('real login screen vs the Stage 2 backend', () => {
  test.skip(!LOGIN_USER || !LOGIN_PASS,
    'STG_LOGIN_USER / STG_LOGIN_PASS not set (a backend user that is also in the frontend USERS array)');

  // sw.js aborts module scripts when served from a throwaway http server; block it.
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    // Fulfil the app's own files from the local server, under the prod origin.
    // config.js is transformed to proxy mode on the way through; everything else
    // is served verbatim. The app HTML is the UNMODIFIED index.html / app.html.
    await page.route(`${PROD_ORIGIN}/**`, async (route) => {
      const url = route.request().url();
      const rel = url.replace(PROD_BASE, '').replace(`${PROD_ORIGIN}/`, '');
      const res = await fetch(`${LOCAL_ORIGIN}/${rel}`);
      const type = res.headers.get('content-type') || 'text/html';
      let body = Buffer.from(await res.arrayBuffer());
      // Rewrite USE_PROXY/PROXY_URL in BOTH config.js and index.html (see F-E4).
      if (/^config\.js(\?|$)/.test(rel) || /^index\.html(\?|$)/.test(rel) || rel === '') {
        body = Buffer.from(proxify(body.toString('utf8')), 'utf8');
      }
      await route.fulfill({ status: res.status, headers: { 'content-type': type }, body });
    });
    await page.route(/fonts\.g(oogleapis|static)\.com/, (r) => r.abort());
  });

  test('logging in through the form reaches the app on the new backend', async ({ page }) => {
    let loginToBackend = false;
    page.on('request', (req) => {
      if (req.url() === `${BACKEND}/auth/login`) loginToBackend = true;
    });

    await page.goto(`${PROD_BASE}index.html`, { waitUntil: 'domcontentloaded' });

    // Fill and submit the REAL login form.
    await page.fill('#username', LOGIN_USER);
    await page.fill('#password', LOGIN_PASS);
    await page.click('.btn-login');

    // A successful login navigates to app.html and the shell renders. If the
    // login contract were still wrong, the app would bounce back to index.html
    // (auth guard) and #sidebar would never appear.
    await expect(page).toHaveURL(/app\.html/, { timeout: 15000 });
    await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });

    // The login went to the Worker, and a JWT + session are now stored.
    expect(loginToBackend, 'login did not POST to the Worker /auth/login').toBe(true);
    const stored = await page.evaluate(() => ({
      jwt: !!localStorage.getItem('tms_jwt'),
      user: JSON.parse(localStorage.getItem('tms_user') || 'null'),
    }));
    expect(stored.jwt, 'no JWT stored after login').toBe(true);
    expect(stored.user, 'no session stored after login').toBeTruthy();
    // The session profile came from data.user (the contract fix), not undefined.
    expect(stored.user.role).toBeTruthy();
    expect(stored.user.username).toBe(LOGIN_USER.toLowerCase());
    // Expiry was derived from the JWT (a real future timestamp), not undefined.
    expect(typeof stored.user.expiresAt).toBe('number');
    expect(stored.user.expiresAt).toBeGreaterThan(Date.now());
  });

  test('a wrong password is rejected and stays on the login screen', async ({ page }) => {
    await page.goto(`${PROD_BASE}index.html`, { waitUntil: 'domcontentloaded' });
    await page.fill('#username', LOGIN_USER);
    await page.fill('#password', 'definitely-not-the-password');
    await page.click('.btn-login');

    // The error message shows and we do NOT navigate away.
    await expect(page.locator('#errMsg')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/index\.html/);
    const jwt = await page.evaluate(() => localStorage.getItem('tms_jwt'));
    expect(jwt, 'a JWT was stored despite a wrong password').toBeFalsy();
  });
});
