// Shared page setup for every live critic.
//
// Three halves, and all three matter:
//   1. A fake session in localStorage so core/auth.js does not bounce us to
//      index.html. Shape copied from tests/e2e/smoke.spec.js (which copies
//      index.html doLogin()).
//   2. HAR replay so the page renders REAL data without a real token. Without
//      this the screens render empty, and an empty screen passes a naive
//      "did it load" check while proving nothing — exactly the failure mode
//      DESIGN.md #7 warns about.
//   3. A cookie->localStorage bridge (see gotoPage below) so a critic can
//      actually choose which screen renders.

const path = require('path');
const HAR = path.resolve('.har/tms.har');

async function preparePage(page, role = 'owner') {
  await page.addInitScript(r => {
    localStorage.setItem('tms_user', JSON.stringify({
      // username must exist in config.js USERS with a matching role, or
      // core/auth.js:24-30 (_authRoleTampered) wipes the session and bounces
      // to index.html. Found via probe: a made-up username ('critic') causes
      // an infinite app.html<->index.html redirect loop that burns through
      // the HAR's recorded entries and leaves the page stuck on "Loading...".
      // demo_<role> is the roster's own fixture account for each role.
      name: 'Critic', role: r, username: 'demo_' + r,
      loginAt: Date.now(), expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    }));
  }, role);

  // Bridge: app.html's bootstrap is `navigate(localStorage.getItem('tms_page')
  // || 'dashboard')` — it never reads location.hash or a ?page= query string
  // (confirmed by grep: no `hashchange` listener and no `location.hash` read
  // anywhere in core/ or app.html; the "?page=" mentioned in router.js
  // comments is aspirational, not implemented). So the only way to land on a
  // given screen is to have 'tms_page' already set in localStorage BEFORE
  // this init script's document loads. We can't call page.evaluate() before
  // the first navigation (no document yet to run it in), and a query string
  // on the goto URL would change the request the HAR must match. A cookie
  // set via context.addCookies() works before any navigation and doesn't
  // touch the URL, so it survives HAR replay untouched — see gotoPage.
  await page.addInitScript(() => {
    const m = document.cookie.match(/critic_page=([^;]+)/);
    if (m) localStorage.setItem('tms_page', decodeURIComponent(m[1]));
  });

  // notFound:'abort' is deliberate: a request the HAR does not cover must FAIL
  // loudly. Falling through to the live backend would make the critics depend
  // on production state and quietly non-deterministic.
  await page.routeFromHAR(HAR, { url: '**/*', notFound: 'abort' });
}

// Navigate to a given screen. NOT a plain page.goto(url) — see the bridge
// comment above for why. baseURL must be the page's own origin (the cookie
// is scoped to it).
async function gotoPage(page, route, baseURL) {
  await page.context().addCookies([{ name: 'critic_page', value: route, url: baseURL }]);
  await page.goto('app.html');
}

module.exports = { preparePage, gotoPage };
