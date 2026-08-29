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

// ── Backend replay: exact match → date-agnostic match → loud abort ──────────
// Replaces routeFromHAR for the Worker host. Two reasons it cannot be the
// stock matcher:
//
// 1. Dates in URLs. core/ai-chat.js:1319 puts localToday() into
//    IS_AFTER({Delivery DateTime},'…'), and the weekly screens put week-window
//    bounds into their filters. routeFromHAR matches URLs verbatim, so those
//    entries stop matching the day (or week) after the recording: the request
//    aborts, the console logs "Failed to load resource: net::ERR_FAILED", and
//    critic #6 reads that as a NEW error on every unit whose baseline recorded
//    none. Measured 29/8: nine units red with zero code changes, one day after
//    the 28/8 recording — and because the #6 assertion runs BEFORE the field
//    comparison, the tier-1 contract gate never executed. A suite that goes
//    red on the calendar gets ignored (same argument as the #6 ratchet above
//    readErrorBaseline in contract.spec.js).
//
// 2. CORS against a local origin. The recorded responses carry
//    Access-Control-Allow-Origin: https://dimitrispetras21-del.github.io.
//    Replayed verbatim to a page served from 127.0.0.1 (PW_BASE_URL, the
//    plan's own instruction for verifying LOCAL changes) the browser blocks
//    every backend response — measured 29/8: the app never rendered locally.
//    The replay therefore echoes the requesting page's Origin instead.
//
// Matching stays strict-first: an exact URL match wins over any fuzzy
// candidate, so a same-day run can never be served a different recorded week
// than the one it asked for. A request with no match still aborts — unknown
// requests must keep failing loudly (the old notFound:'abort' semantics).
const DATE_RE = /\d{4}-\d{2}-\d{2}/g;   // dates are literal in URLs ([0-9-] is never %-encoded)
const BACKEND_HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';

// The recording holds DUPLICATE entries for the same request, some with the
// response body missing (0 bytes) — e.g. local_moves has both empty and
// 47-byte 404s. Serving the empty twin makes res.json() throw a SyntaxError
// the live app never produced (measured 29/8: a phantom NEW console error on
// weekly_natl). An entry with a body therefore always beats an empty one.
const _bodyLen = e => (((e.response || {}).content || {}).text || '').length;

let _harIdx = null;
function _harIndex() {
  if (_harIdx) return _harIdx;
  const exact = new Map();   // "METHOD url"      → best entry (body beats empty)
  const fuzzy = new Map();   // "METHOD normUrl"  → [entries]
  for (const e of JSON.parse(fs.readFileSync(HAR, 'utf8')).log.entries) {
    if (!e.request.url.includes(BACKEND_HOST)) continue;
    const kExact = e.request.method + ' ' + e.request.url;
    if (!exact.has(kExact) || (_bodyLen(exact.get(kExact)) === 0 && _bodyLen(e) > 0)) {
      exact.set(kExact, e);
    }
    const kFuzzy = e.request.method + ' ' + e.request.url.replace(DATE_RE, 'D');
    if (!fuzzy.has(kFuzzy)) fuzzy.set(kFuzzy, []);
    fuzzy.get(kFuzzy).push(e);
  }
  _harIdx = { exact, fuzzy };
  return _harIdx;
}

async function _installBackendReplay(page) {
  const { exact, fuzzy } = _harIndex();
  await page.route(`**/${BACKEND_HOST}/**`, route => {
    const req = route.request();
    let entry = exact.get(req.method() + ' ' + req.url());
    if (!entry) {
      const candidates = fuzzy.get(req.method() + ' ' + req.url().replace(DATE_RE, 'D')) || [];
      // Most recently-dated recording: for week windows it is the closest
      // stand-in for "the current week".
      entry = candidates.length ? candidates.reduce((a, b) => {
        const ab = _bodyLen(a) > 0, bb = _bodyLen(b) > 0;
        if (ab !== bb) return ab ? a : b;   // a body always beats an empty twin
        return (a.request.url.match(DATE_RE) || []).join() >= (b.request.url.match(DATE_RE) || []).join() ? a : b;
      }) : null;
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
    // Reason 2 above. Echoing (not '*') keeps allow-credentials responses valid.
    const origin = req.headers()['origin'];
    if (origin && headers['access-control-allow-origin']) {
      headers['access-control-allow-origin'] = origin;
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

  // Replay ONLY backend data calls, and abort what the recording does not
  // cover — falling through to the live backend would make the critics depend
  // on production state and quietly non-deterministic.
  //
  // Static assets (js/css/html) load LIVE on purpose. The scope was '**/*'
  // once and it made the suite die on every deploy: app.html carries a
  // ?v=TIMESTAMP cache-bust on all 41 asset URLs, so one `bump-versions.sh`
  // made every recorded URL unmatchable and no page rendered. Loading them
  // live means the code under test is genuinely the code at PW_BASE_URL —
  // deployed Pages by default, the local working tree when overridden.
  //
  // Not routeFromHAR: see _installBackendReplay for the two reasons
  // (date-carrying URLs, CORS against a local origin).
  await _installBackendReplay(page);
}

// Navigate to a given screen. NOT a plain page.goto(url) — see the bridge
// comment above for why. baseURL must be the page's own origin (the cookie
// is scoped to it).
async function gotoPage(page, route, baseURL) {
  await page.context().addCookies([{ name: 'critic_page', value: route, url: baseURL }]);
  await page.goto('app.html');
}

module.exports = { preparePage, gotoPage };
