// ═══════════════════════════════════════════════
// CORE — SESSION STREAK (per tab: page loads that ended without a session)
// ═══════════════════════════════════════════════
// Loaded right after config.js and BEFORE core/auth.js (app.html), because
// auth.js is where most of these page loads end. When it turns a page away at
// load it assigns location.href while the page is still parsing, and the
// browser then stops parsing that page: no script after auth.js ever runs on
// it (measured 7/10 in Chromium: core/api.js and core/utils.js were
// downloaded and never executed; the round-2 hand-off «auth.js sets a flag,
// api.js counts, utils.js writes» was dead code in every real browser). So
// such a page is counted, judged and reported HERE, synchronously, by auth.js
// before that assignment. core/api.js calls the same functions at a page's
// first 401 — one copy for both (principle 3).
//
// Per TAB, not per page: logError caps every page at 20 posts (utils.js
// MAX_APP_ERROR_POSTS), so the 5/10 storm (2010 rows) was ≥101 page loads —
// one row per page would still have been ~1300 rows. sessionStorage survives
// the reloads of one tab and dies with it. Every page load that ends without a
// session (turned away at load by auth.js, or at its first 401) adds 1; the
// first 2xx of a page that HAS a session ends the streak (tmsStreakEnd), so a
// later expiry in the same tab starts at 1 again and is reported again. No
// time window: with one (it was 10 min) a loop slower than 50 loads per window
// never reached 50 and stayed silent for ever (principle 1).
//
// The «session: …» rows (B-34 and B-34b exclude only the first kind, by prefix):
//   expired → login (user X; …)          the routine end of an 8 h login: a
//        page's first 401 after its login's own expiry — once per streak;
//   rejected before expiry → login (user X; … exp in N min …)   a 401 while
//        this browser still holds the login as valid for > 5 min (a clock
//        behind, a token the Worker refuses): NOT routine, so it never hides
//        under the routine prefix — once per streak;
//   login rejected at load — unknown username | role mismatch (user X; …)
//        auth.js's tamper guard turned the page away: a user missing from
//        config.js USERS is bounced at every login (CLAUDE.md) — once per streak;
//   redirect loop — N loads in M s (user X, reason R; …)   every 50th load of a
//        streak, whatever its reasons. A plain expiry or «no login» at load is
//        silent alone: every morning's first page is one.
// Each row carries what the 5/10 rows lacked: whose login, how the page was
// reached (navigation type, referrer), the browser in short and the page's hash.

const _TMS_STREAK_KEY = 'tms_session_expired';
const _TMS_TAB_USER_KEY = 'tms_session_tab_user';
const _TMS_LOOP_EVERY = 50;
const _TMS_LOUD_AT_LOAD = ['unknown username', 'role mismatch'];
let _tmsStreakMem = null;   // the record for this page alone, when sessionStorage throws

function _tmsStreakGet() {
  try {
    const r = JSON.parse(sessionStorage.getItem(_TMS_STREAK_KEY) || 'null');
    return r && typeof r === 'object' ? r : null;
  } catch (_) { return _tmsStreakMem; }
}

function _tmsStreakPut(rec) {
  _tmsStreakMem = rec;
  try { sessionStorage.setItem(_TMS_STREAK_KEY, JSON.stringify(rec)); } catch (_) {}
}

// Counts this page in the tab's streak and returns the rows it must write
// (without the «session: » prefix — logError and tmsStreakPost add it), at
// most two. The caller sends them at once: nothing waits for a later page.
// info = { reason: 'no login' | 'expired' | 'unknown username' | 'role mismatch' | '401',
//          user, exp, where, note }
function tmsStreakNote(info) {
  const now = Date.now();
  const rec = _tmsStreakGet() || {};
  rec.n = (rec.n | 0) + 1;
  rec.since = rec.since || now;
  const seen = rec.seen || (rec.seen = {});
  const told = rec.told || (rec.told = []);
  const rows = [];
  const reason = info.reason || 'no login';
  seen[reason] = (seen[reason] | 0) + 1;
  if (info.user) rec.user = String(info.user).slice(0, 40);
  const who = `user ${rec.user || '?'}`;
  const exp = Number(info.exp) || 0;
  const expMin = exp ? Math.round((exp - now) / 60000) : null;   // > 0: still valid by this browser's clock
  const tail = (expMin === null ? '' : expMin > 0 ? `; exp in ${expMin} min` : `; exp ${-expMin} min ago`) + _tmsSessionDiag();
  if (reason === '401') {
    const kind = expMin !== null && expMin > 5 ? 'rejected before expiry' : 'expired';
    if (!told.includes(kind)) {
      told.push(kind);
      rows.push(`${kind} → login (${who}${info.note ? '; ' + info.note : ''}; first 401: ${String(info.where || '?').slice(0, 120)}${tail})`);
    }
  }
  if (_TMS_LOUD_AT_LOAD.includes(reason) && !told.includes(reason)) {
    told.push(reason);
    rows.push(`login rejected at load — ${reason} (${who}${tail})`);
  }
  if (rec.n % _TMS_LOOP_EVERY === 0) {
    const mix = Object.keys(seen).map((k) => `${k} ×${seen[k]}`).join(', ');
    const why = reason === '401' ? `401 at ${String(info.where || '?').slice(0, 60)}` : reason;
    rows.push(`redirect loop — ${rec.n} loads in ${Math.max(0, Math.round((now - rec.since) / 1000))} s (${who}, reason ${why}; ${mix}${tail})`);
  }
  _tmsStreakPut(rec);
  return rows;
}

// The tab works again (core/api.js: the first 2xx of a page with a session).
function tmsStreakEnd() {
  _tmsStreakMem = null;
  try { sessionStorage.removeItem(_TMS_STREAK_KEY); } catch (_) {}
}

// Whose page this tab holds, copied when a page passes auth.js. Another tab
// that ends the session (its own first 401, a logout) removes the shared
// login from localStorage, and this tab's later 401 used to be written as
// «user ?» (review 6/10 P3). Only the name: the expiry of a login that is
// already gone says nothing about this tab's 401.
function tmsStreakRememberUser(username) {
  try { if (username) sessionStorage.setItem(_TMS_TAB_USER_KEY, String(username).slice(0, 40)); } catch (_) {}
}

function tmsStreakTabUser() {
  try { return sessionStorage.getItem(_TMS_TAB_USER_KEY) || null; } catch (_) { return null; }
}

// The row of a page auth.js turns away, posted at once: utils.js's logError /
// _postAppError never exist on such a page (see the header). Same three
// guards as _postAppError, so a rig on 127.0.0.1 never writes into the
// production log. keepalive lets the POST outlive the page. A «simple»
// request (text/plain, no Authorization): the Worker reads the body with
// request.json() whatever its type, and a simple request needs no CORS
// preflight — one round trip less that would have to finish after the page
// has started to leave. The row names the user itself (app_errors.actor stays
// empty, as for every tokenless report).
function tmsStreakPost(m) {
  try {
    if (typeof USE_PROXY === 'undefined' || !USE_PROXY) return;
    if (typeof PROXY_URL !== 'string' || !PROXY_URL) return;
    try { if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return; } catch (_) {}
    fetch(PROXY_URL + '/app-errors', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        message: ('session: ' + m).slice(0, 2000),
        page: (function () { try { return location.href; } catch (_) { return undefined; } })(),
        user_agent: (function () { try { return navigator.userAgent; } catch (_) { return undefined; } })(),
      }),
    }).catch(function () { /* reporting must never cascade */ });
  } catch (_) { /* reporting must never cascade */ }
}

// «; nav reload; from index.html; Win Chrome 149; #daily_ramp»: how this page
// was reached and where it was — a reload, a forward from the login page and
// a restored tab loop for different reasons, and the 5/10 rows could not tell
// them apart. Never throws.
function _tmsSessionDiag() {
  const out = [];
  try { const nav = performance.getEntriesByType('navigation')[0]; if (nav && nav.type) out.push('nav ' + nav.type); } catch (_) {}
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    out.push('from ' + (!r ? 'none' : r.origin === location.origin ? (r.pathname.split('/').pop() || '/') : 'another site'));
  } catch (_) {}
  out.push(_tmsUaShort());
  try { out.push(location.hash || 'no hash'); } catch (_) {}
  return '; ' + out.join('; ');
}

// «Win Chrome 149». The full user agent is in app_errors.user_agent; this is
// for the message, which is what the auditor and the owner read.
function _tmsUaShort() {
  try {
    const ua = String(navigator.userAgent || '');
    const os = /Windows NT/.test(ua) ? 'Win' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
      : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'other OS';
    // Edge and Opera say «Chrome/» too, and Chrome says «Safari/»: the order of this list is the test
    const b = [['Edge', /Edg\/(\d+)/], ['Opera', /OPR\/(\d+)/], ['Firefox', /Firefox\/(\d+)/], ['Chrome', /(?:Chrome|CriOS)\/(\d+)/], ['Safari', /Version\/(\d+)/]]
      .find(([, re]) => re.test(ua));
    return b ? `${os} ${b[0]} ${ua.match(b[1])[1]}` : `${os} other browser`;
  } catch (_) { return 'no UA'; }
}
