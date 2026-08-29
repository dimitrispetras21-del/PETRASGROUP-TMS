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

const fs = require('fs');
const { repair } = require('./repair-har');
// Replay the REPAIRED copy, not the raw recording — see repair-har.js. Four
// entries in tms.har never completed (status:-1); replaying them verbatim
// feeds the app a corrupt response for a request that has a real, successful
// duplicate later in the same recording. Task 5, job 2.
const HAR = repair();

// ── Date-agnostic replay for URLs that embed "today" ────────────────────────
// Several requests carry a date computed at runtime: core/ai-chat.js:1319 puts
// localToday() into IS_AFTER({Delivery DateTime},'…'), and the weekly screens
// put week-window bounds into their filters. routeFromHAR matches URLs
// verbatim, so each such entry stops matching the day (or week) after the
// recording: the request aborts, the console logs "Failed to load resource:
// net::ERR_FAILED", and critic #6 reads that as a NEW error on every unit
// whose baseline recorded none. Measured 29/8: nine units red with zero code
// changes, one day after the 28/8 recording — and because the #6 assertion
// runs BEFORE the field comparison, the tier-1 contract gate never executed.
// A suite that goes red on the calendar gets ignored (same argument as the
// #6 ratchet above readErrorBaseline in contract.spec.js).
//
// routeFromHAR cannot fuzzy-match, so date-carrying URLs get their own route,
// registered AFTER routeFromHAR so it wins (Playwright checks routes in
// reverse registration order). It matches HAR entries with every YYYY-MM-DD
// run collapsed, i.e. "the same request, asked on a different day", and
// replays the recorded status/headers/body. Recorded headers matter: the
// backend is cross-origin, and without the recorded Access-Control-Allow-*
// headers the browser would block the fulfilled response. URLs with no date
// are untouched, and a date-carrying URL with no normalized match still
// aborts — unknown requests must keep failing loudly (notFound:'abort').
const HAS_DATE = /\d{4}-\d{2}-\d{2}/;      // non-global: .test() on a /g regex is stateful
const DATE_RE  = /\d{4}-\d{2}-\d{2}/g;     // dates are literal in URLs ([0-9-] is never %-encoded)

let _harByNormUrl = null;
function _harIndex() {
  if (_harByNormUrl) return _harByNormUrl;
  _harByNormUrl = new Map();
  for (const e of JSON.parse(fs.readFileSync(HAR, 'utf8')).log.entries) {
    if (!HAS_DATE.test(e.request.url)) continue;
    const key = e.request.method + ' ' + e.request.url.replace(DATE_RE, 'D');
    if (!_harByNormUrl.has(key)) _harByNormUrl.set(key, []);
    _harByNormUrl.get(key).push(e);
  }
  return _harByNormUrl;
}

async function _installDateAgnosticReplay(page) {
  const idx = _harIndex();
  await page.route(u => HAS_DATE.test(u.href), route => {
    const req = route.request();
    const key = req.method() + ' ' + req.url().replace(DATE_RE, 'D');
    const candidates = idx.get(key) || [];
    // An exact URL match must win over any fuzzy candidate — otherwise a
    // same-day run could be served a DIFFERENT recorded week than the one it
    // asked for. Failing that, take the most recently-dated recording: for
    // week windows it is the closest stand-in for "the current week".
    let entry = candidates.find(e => e.request.url === req.url());
    if (!entry && candidates.length) {
      entry = candidates.reduce((a, b) =>
        (a.request.url.match(DATE_RE) || []).join() >= (b.request.url.match(DATE_RE) || []).join() ? a : b);
    }
    if (!entry) return route.abort();
    const c = entry.response.content || {};
    const headers = {};
    for (const h of entry.response.headers || []) {
      const n = h.name.toLowerCase();
      // Recorded lengths/encodings describe the wire form of the ORIGINAL
      // response; the body below is already decoded, so replaying them would
      // describe a body we are not sending.
      if (n === 'content-encoding' || n === 'content-length' || n === 'transfer-encoding') continue;
      headers[n] = h.value;
    }
    return route.fulfill({
      status: entry.response.status,
      headers,
      body: c.text ? (c.encoding === 'base64' ? Buffer.from(c.text, 'base64') : c.text) : '',
    });
  });
}

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
  // Replay ONLY backend data calls. Static assets (js/css/html) must load live.
  //
  // This was '**/*' and it made the suite die on every deploy: app.html carries a
  // ?v=TIMESTAMP cache-bust on all 41 asset URLs, so one `bump-versions.sh` makes
  // every recorded URL unmatchable, notFound:'abort' kills the assets, no page
  // renders, and nine contracts fail at once looking like a mass regression. The
  // oracle broke exactly when it was needed — right after a release.
  //
  // Data still comes from the frozen recording, so the checks stay deterministic;
  // the code under test is now genuinely the deployed code rather than a replay.
  await page.routeFromHAR(HAR, {
    url: '**/petras-tms-backend-staging.petrasgroup.workers.dev/**',
    notFound: 'abort',
  });

  // Registered AFTER routeFromHAR ON PURPOSE — later routes win, so the
  // date-carrying URLs reach this layer instead of the verbatim matcher.
  await _installDateAgnosticReplay(page);
}

// Navigate to a given screen. NOT a plain page.goto(url) — see the bridge
// comment above for why. baseURL must be the page's own origin (the cookie
// is scoped to it).
async function gotoPage(page, route, baseURL) {
  await page.context().addCookies([{ name: 'critic_page', value: route, url: baseURL }]);
  await page.goto('app.html');
}

module.exports = { preparePage, gotoPage };
