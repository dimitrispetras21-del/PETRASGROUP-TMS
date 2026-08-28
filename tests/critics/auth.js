// Shared page setup for every live critic.
//
// Two halves, and both matter:
//   1. A fake session in localStorage so core/auth.js does not bounce us to
//      index.html. Shape copied from tests/e2e/smoke.spec.js (which copies
//      index.html doLogin()).
//   2. HAR replay so the page renders REAL data without a real token. Without
//      this the screens render empty, and an empty screen passes a naive
//      "did it load" check while proving nothing — exactly the failure mode
//      DESIGN.md #7 warns about.

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

  // notFound:'abort' is deliberate: a request the HAR does not cover must FAIL
  // loudly. Falling through to the live backend would make the critics depend
  // on production state and quietly non-deterministic.
  await page.routeFromHAR(HAR, { url: '**/*', notFound: 'abort' });
}

module.exports = { preparePage };
