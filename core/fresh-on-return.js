// ═══════════════════════════════════════════════════════════════════════
// CORE — EVERY USER SEES THE SAME DATA WITHOUT A REFRESH (T188, ValueDriven 26/11/2026)
// ─────────────────────────────────────────────────────────────────────
// The owner (call 9/11): another user does not see a new or changed order until they refresh. Measured 26/11 on a
// local copy of this main: an open page never reads again (no timer, no focus handler, no push), so a colleague's
// change stayed hidden until a menu click, an own save or F5; a renamed client stayed hidden even after F5
// (localStorage tiers in core/api.js, and a name map that only ever added names).
// What this file does, and only this:
//   - while the tab is visible it asks the Worker every 30 s whether SOMEONE ELSE changed a table the current page
//     shows (POST /changes, one small request: table names and counts, never data). If so, the page is drawn again
//     once the user has been idle (no click, key, wheel or mouse move) for 20 s, 2 min on the two heavy pages (Orders,
//     Weekly Διεθνών: a draw there resets their own scroller), and at most every 2 min; until then the top bar says
//     «N αλλαγές · ↻»;
//   - the tab was hidden for at least 30 s and the page is over 60 s old → it is drawn again on the return;
//   - a draw drops the out-of-date cached reads first (core/api.js cacheDropForReturn) and draws the page as a menu
//     click draws it (navigate); the national v5 board through its own «Ανανέωση» (WN5.reload), so week and scroll
//     stay; at most every 10 min (or when someone changed a reference table) the reference lists are read first
//     (core/api.js refDataRefresh), so renamed or new names show too;
//   - never over work in progress: a form, dialog or typed field (core/sw-update.js tmsFormBusy, the rule of the
//     new-version reload), nor a search or filter the user set on the pages whose draw resets them (core/entity.js).
//     It waits and draws when they are gone (a DOM check every 5 s, no request); never offline (the `online` event);
//   - one small «Ενημερώθηκε 10:42 · ↻» in the top bar; ↻ reads now. Pages with their own clock hide it, unless
//     changes are waiting.
// Only `visibilitychange`, on purpose: window `focus` fires before the click that brings the window back, so a draw
// there swallowed the click and a file chooser's `change` (code review 26/11). No request while the tab is hidden.
// The owner's lever: CHANGES_OFF = "1" on the Worker (410) stops every tab asking, with no Pages deploy. Deploy order:
// the Worker first (a front end without the route only stops asking, with a console line).
// What it does NOT do: two people saving the same order is still last-write-wins (the «_expect» check covers the
// weekly boards only).
// At load it only defines globals: no listener, timer or DOM until app.html calls tmsFreshWatch.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const AWAY_MIN_MS = 30 * 1000;          // a glance at another tab and back does not re-read the page
const PAGE_MIN_AGE_MS = 60 * 1000;      // nor does a page drawn a minute ago (on a return)
const REF_MIN_AGE_MS = 10 * 60 * 1000;  // the six reference lists are ~40 requests (measured 26/11): not every draw
const WAIT_RECHECK_MS = 5000;
const POLL_MS = 30 * 1000;              // POST /changes while visible: ~960 requests per user per 8-h day (one URL,
                                        // so the CORS preflight is cached by its Max-Age, not sent per ask)
const ASK_TIMEOUT_MS = 8000;            // a hung ask must not hold every draw (presence does the same)
const SLEEP_GAP_MS = 5 * 30 * 1000;     // no ask for this long while visible (a laptop asleep): treat it as a return
const POLL_RETRY_MS = 2 * 60 * 1000;    // after a failed ask
const IDLE_MS = 20 * 1000;              // a change is drawn only once the user has not touched the page for this long
const IDLE_HEAVY_MS = 2 * 60 * 1000;    // on the pages whose draw resets their own scroller, and the reading pages
                                        // that every order change reaches (Expenses, Payroll, Pallets)
const HEAVY = { orders: true, weekly_intl: true, expenses: true, payroll: true, pallet_ledger: true };
const QUEUE_HOLD_MS = 60 * 1000;        // after the network returns, the offline writes get this long to go out
const CHANGE_DRAW_MIN_MS = 2 * 60 * 1000;   // and at most this often (each draw is 4 to 20 requests, measured 26/11)
const MORE_MAX = 5;                     // `more` pages read back to back before waiting for the next tick
// pages that already print their own «Ενημερώθηκε» (the boards, the ramp's 2-min refresh): one clock per screen
const OWN_LABEL = { weekly_intl: true, weekly_natl: true, daily_ramp: true };
// pages whose draw resets their search and filters (core/entity.js renderEntity, modules/locations.js): only there
// does a search or filter the user set hold the draw. Orders keeps its filters across a draw (S.filters), so a
// filter there must not turn the refresh off for the day (review 26/11).
const HOLD_ON_FILTER = { clients: true, partners: true, workshops: true, trucks: true, trailers: true, drivers: true, locations: true };
// Which audit_log tables each page shows: a change elsewhere does not redraw it. A page missing here is never drawn
// on a change (it still is on a return). Table names are the Postgres ones (audit_log.table_name), measured 26/11
// over 7 days of the production log; a new table a page starts showing has to be added here.
// Only a PERSON's rows count (the Worker skips trigger and system rows, or a user's own save would redraw his page), so
// a page fed by triggers (round trips, payroll lines, pallet feed) lists the tables people write that start them.
// The Daily Ramp is left out: it refreshes itself every 2 min and has its own edit cool-down (modules/daily_ramp.js).
const ORDERS_T = ['orders', 'order_stops', 'partner_assignments', 'national_orders', 'order_documents', 'ct_round_trips', 'ct_rt_legs', 'ramp', 'stock_lots'];
const V5_T = ['shipments', 'shipment_pieces', 'piece_legs', 'rt_stops', 'rt_vehicle_segments', 'plan_request', 'plan_notices'];
const TRIP_T = ORDERS_T.concat(V5_T, ['dl_entries', 'ct_cost_lines']);
const PAGE_TABLES = {
  dashboard: ORDERS_T, orders: ORDERS_T, weekly_intl: ORDERS_T, daily_ops: ORDERS_T.concat(V5_T),
  weekly_natl: ORDERS_T.concat(V5_T),
  clients: ['clients'], partners: ['partners'], locations: ['locations'], trucks: ['trucks'], trailers: ['trailers'],
  drivers: ['drivers'], workshops: ['workshops'],
  pallet_ledger: ORDERS_T.concat(V5_T, ['pl_movements']), payroll: TRIP_T, expenses: TRIP_T,
  maint_req: ['maint_req', 'maint_history'], maint_svc: ['maint_history', 'maint_req'], maint_dash: ['maint_req', 'maint_history'],
};
// names the boards and pickers print come from these: a change there re-reads the reference lists on the next draw
const REF_T = { clients: true, partners: true, locations: true, trucks: true, trailers: true, drivers: true };

let _drawnAt = 0;            // when the current page was last drawn (navigate, or a refresh here)
let _hiddenAt = 0;           // when the tab was last hidden
let _refAt = Date.now();     // the page load read the reference lists (preload + its one revalidate)
let _running = false;
let _pending = false;        // a return or a change found work in progress, no network or a busy user: draw later
let _pendingT = null;
let _pendingN = 0;           // other people's changes to this page's tables, not drawn yet
let _changeDrawAt = 0;       // the last draw a change caused
let _actAt = 0;              // the user's last pointer, key or wheel on the page
let _watching = false;
let _cursor = null;          // audit_log id the Worker last answered up to (null = not asked yet)
let _pollT = null;
let _polling = false;        // false after 410 / 403 / 404: this tab stops asking for the session
let _authDead = null;
let _onlineAt = 0;           // when the network last came back
let _cacheDirty = false;     // someone changed something: the next draw drops the cached reads first        // the token a 401 answered: asking waits until the user logs in again (core/relogin.js)
let _lastAskAt = 0;
let _pollFailLogged = false;
const _touched = new Set(); // search and filter fields the user typed into or picked on this page (trusted events)

function _page() { return typeof currentPage !== 'undefined' ? currentPage : ''; }
function _now() { return Date.now(); }

function _hhmm(t) {
  const d = new Date(t);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function _el() {
  let b = document.getElementById('tmsFresh');
  if (b) return b;
  const anchor = document.getElementById('topbarBreadcrumb') || document.getElementById('topbarTitle');
  if (!anchor || !anchor.parentNode) return null;
  b = document.createElement('button');
  b.type = 'button';
  b.id = 'tmsFresh';
  b.className = 'tms-fresh';
  b.style.cssText = 'margin-left:12px;border:0;background:none;padding:2px 6px;border-radius:var(--radius);'
    + 'color:var(--text-dim);font:inherit;font-size:var(--text-xs, 12px);cursor:pointer;white-space:nowrap';
  b.addEventListener('click', () => tmsFreshNow('user'));
  anchor.parentNode.insertBefore(b, anchor.nextSibling);
  return b;
}

function _label() {
  const b = _el();
  if (!b) return;
  const page = _page();
  // a page with its own clock hides this one, but never hides changes that are waiting
  b.style.display = (!page || (OWN_LABEL[page] && !_pendingN)) ? 'none' : '';
  b.style.color = _pendingN ? 'var(--accent, var(--text))' : 'var(--text-dim)';
  if (_running) { b.textContent = 'Ανανέωση…'; b.title = 'Διαβάζει τα τελευταία δεδομένα'; return; }
  if (!_drawnAt) { b.textContent = ''; return; }
  if (_pendingN) {
    b.textContent = (_pendingN === 1 ? '1 αλλαγή' : _pendingN + ' αλλαγές') + ' · ↻';
    b.title = 'Άλλος χρήστης άλλαξε δεδομένα αυτής της σελίδας· θα ανανεωθεί μόλις σταματήσεις · πάτησε για ανανέωση τώρα';
    return;
  }
  if (_pending) {
    b.textContent = 'Δεδομένα από ' + _hhmm(_drawnAt) + ' · ↻';
    b.title = 'Θα ανανεωθούν μόλις τελειώσεις με τη φόρμα ή την αναζήτηση · πάτησε για ανανέωση τώρα';
    return;
  }
  b.textContent = 'Ενημερώθηκε ' + _hhmm(_drawnAt) + ' · ↻';
  b.title = 'Ανανέωση τώρα';
}

// Called by navigate() (core/router.js) every time a page is drawn. A draw answers any wait.
function tmsFreshDrawn() {
  // navigate() calls this before the page reads: after anyone's change, those reads go to the database, not to a
  // copy from before it (the cursor has moved past it, so no later ask reports it again)
  if (_cacheDirty) { _cacheDirty = false; if (typeof cacheDropForReturn === 'function') cacheDropForReturn(); }
  _drawnAt = _now();
  _touched.clear();
  _pending = false;
  _pendingN = 0;
  if (_pendingT) { clearTimeout(_pendingT); _pendingT = null; }
  _label();
}

// A search or filter the user typed or picked on the page and still holds. tmsFormBusy leaves these out on purpose
// (a search box is not unsaved work for a version reload), but a redraw here would clear them (core/entity.js resets
// its state). Only fields the user changed count: a select drawn with no `selected` option reads as changed against
// its defaults, and a script-set value too, so comparing with the defaults held most pages for ever (review 26/11).
function _noteTouched(e) {
  const t = e.target;
  if (!e.isTrusted || !t || !t.closest || !t.closest('#content')) return;
  if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') _touched.add(t);
}
function _filtered() {
  if (!HOLD_ON_FILTER[_page()]) return false;
  for (const el of _touched) {
    if (!el.isConnected) { _touched.delete(el); continue; }
    if (el.tagName === 'SELECT' ? el.selectedIndex > 0 : (el.type !== 'checkbox' && el.type !== 'radio' && el.value !== '')) return true;
  }
  return false;
}
function _noteAct(e) { if (!e || e.isTrusted !== false) _actAt = _now(); }

// Writes made offline go out when the network returns (core/api.js _flushOfflineQueue, on the same `online` event):
// a draw before they land would show the page without them, and /changes never reports one's own writes. Held for
// 60 s after the network returns at most: an item the flush could not send stays in the queue, and must not switch
// the refresh off for the rest of the day (review 26/11).
function _queueWaiting() {
  if (_now() - _onlineAt > QUEUE_HOLD_MS) return false;
  try { const q = localStorage.getItem('tms_offline_queue'); return !!q && q !== '[]'; } catch (_) { return false; }
}

function _holdReason() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (_queueWaiting()) return 'queue';
  const busy = typeof tmsFormBusy === 'function' ? tmsFormBusy() : null;
  if (busy) return busy;
  return _filtered() ? 'filtered' : null;
}

// A change-caused draw also waits for the user to stop for a moment, and comes at most every 2 min.
function _changeHold() {
  if (_now() - _actAt < (HEAVY[_page()] ? IDLE_HEAVY_MS : IDLE_MS)) return 'active';
  if (_now() - _changeDrawAt < CHANGE_DRAW_MIN_MS) return 'recent';
  return null;
}

function _wait() {
  if (_pendingT) return;
  _pendingT = setTimeout(() => {
    _pendingT = null;
    if (!_pending || document.visibilityState !== 'visible') return;   // the next return starts it again
    if (!_pendingN && _now() - _drawnAt < PAGE_MIN_AGE_MS) { _pending = false; _label(); return; }   // drawn meanwhile
    if (_holdReason() || (_pendingN && _changeHold())) { _wait(); return; }
    tmsFreshNow(_pendingN ? 'changes' : 'after-wait');
  }, WAIT_RECHECK_MS);
}

// The page's own scroll, put back once the new rows are there (navigate redraws from the top). Best effort, for the
// two scrollers every page shares; a board with its own inner scroller starts at the top. It gives up at the user's
// first wheel, touch or key, once the loaded page stops growing short of the old position, or after 6 s.
function _keepScroll() {
  const c = document.getElementById('content');
  const se = document.scrollingElement;
  const at = { c: c ? c.scrollTop : 0, w: se ? se.scrollTop : 0 };
  if (!at.c && !at.w) return;
  let tries = 0, lastH = -1, firstH = -1, stop = false;
  const quit = () => { stop = true; };
  const evs = ['wheel', 'touchmove', 'keydown', 'mousedown'];
  evs.forEach(ev => window.addEventListener(ev, quit, { once: true, passive: true }));
  const end = () => evs.forEach(ev => window.removeEventListener(ev, quit));
  const put = () => {
    if (stop) { end(); return; }
    const c2 = document.getElementById('content');
    if (c2 && at.c) c2.scrollTop = at.c;
    if (se && at.w) se.scrollTop = at.w;
    const done = (!at.c || (c2 && Math.abs(c2.scrollTop - at.c) < 2)) && (!at.w || Math.abs(se.scrollTop - at.w) < 2);
    const h = (c2 ? c2.scrollHeight : 0) + (se ? se.scrollHeight : 0);
    if (firstH < 0) firstH = h;
    const grew = h !== lastH;
    lastH = h;
    // «stopped growing» counts only once the rows have arrived (the height moved past the loading skeleton's);
    // before that a still height is the skeleton, and a slow read must not end the restore
    if (done || (h !== firstH && !grew && tries > 2) || ++tries >= 24) { end(); return; }
    setTimeout(put, 250);
  };
  setTimeout(put, 250);
}

async function tmsFreshNow(reason) {
  const page = _page();
  if (!page) return;
  // a change found while a draw runs may be newer than what that draw reads: look again once it is over
  if (_running) { if (reason === 'changes') { _pending = true; _label(); _wait(); } return; }
  // An explicit click is the user's choice, as the new-version pill (core/sw-update.js); a return or a change is not.
  if (reason !== 'user' && (_holdReason() || (reason === 'changes' && _changeHold()))) { _pending = true; _label(); _wait(); return; }
  _pending = false;
  _running = true;
  if (reason === 'changes') _changeDrawAt = _now();
  _label();
  try {
    if (reason === 'user' || _now() - _refAt > REF_MIN_AGE_MS) {
      try {
        if (typeof refDataRefresh === 'function') await refDataRefresh();
        _refAt = _now();
      } catch (e) {
        // the page is still drawn with the names in memory; the failure is said, not swallowed (αρχή 1)
        if (typeof logError === 'function') logError(e, 'fresh-on-return: reference lists (' + reason + ')');
      }
    }
    if (_page() !== page) return;   // the user moved on meanwhile: that page was just drawn fresh
    // where the log is BEFORE the page reads: a change after this point is reported by the next ask, so nothing
    // slips between the draw and the cursor (one at worst is drawn twice)
    await _baseline();
    if (_page() !== page) return;
    if (page === 'weekly_natl' && typeof WN5 !== 'undefined' && WN5.active && WN5.active()) {
      // changes counted while the board reloads may be newer than its read: only those before it are answered
      const before = _pendingN;
      await WN5.reload('return');
      const after = Math.max(0, _pendingN - before);
      tmsFreshDrawn();
      if (after) { _pendingN = after; _pending = true; _label(); _wait(); }
    } else if (typeof navigate === 'function') {
      if (typeof cacheDropForReturn === 'function') cacheDropForReturn();
      _cacheDirty = false;   // just dropped: navigate's tmsFreshDrawn need not drop again
      _keepScroll();
      navigate(page);   // calls tmsFreshDrawn
    }
  } catch (e) {
    if (typeof logError === 'function') logError(e, 'fresh-on-return: draw ' + page + ' (' + reason + ')');
  } finally {
    _running = false;
    _label();
  }
}

// ── POST /changes: someone else changed a table this page shows ──
function _schedulePoll(ms) {
  if (_pollT) clearTimeout(_pollT);
  _pollT = setTimeout(_poll, ms);
}
function _stopPolling(why, log) {
  _polling = false;
  if (_pollT) { clearTimeout(_pollT); _pollT = null; }
  if (log && typeof logError === 'function') logError(new Error('changes: ' + why), 'fresh-on-return: polling stopped');
}
function _jwt() { try { return localStorage.getItem('tms_jwt'); } catch (_) { return null; } }

async function _ask(since) {
  const jwt = _jwt();
  if (!jwt || typeof PROXY_URL === 'undefined') return { status: -1, body: null };
  if (_authDead && jwt === _authDead) { _lastAskAt = _now(); return { status: -1, body: null }; }   // still the expired token: wait for the login (and no «slept» redraw)
  _authDead = null;
  _lastAskAt = _now();
  let status = 0, body = null, tmo = null;
  try {
    // Plain fetch, never the app's queue or retry: a check must not wait behind writes or raise a toast. An answer
    // that never comes is aborted and counts as a network failure (status 0 → retry).
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    if (ac) tmo = setTimeout(() => { try { ac.abort(); } catch (_) {} }, ASK_TIMEOUT_MS);
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt }, body: JSON.stringify({ since }) };
    if (ac) init.signal = ac.signal;
    const res = await fetch(PROXY_URL + '/changes', init);
    status = res.status;
    try { body = await res.json(); } catch (_) { body = null; }
  } catch (_) { status = 0; }
  finally { if (tmo) clearTimeout(tmo); }
  if (status === 401) _authDead = jwt;
  return { status, body };
}

// The answer's verdict: 'stop' (this tab stops asking), 'retry' (unknown, keep the page), or 'ok'.
function _verdict(status, body) {
  if (status === 410) { _stopPolling('switched off by the owner (410)', false); return 'stop'; }
  if (status === 401) return 'retry';   // the session ended: the app's own reads open the login; asking resumes with the new token
  if (status === 403) { _stopPolling('route answered 403', true); return 'stop'; }
  // 404: the Worker without the route (deploy order: Worker first). Said in the console only, or every page load of
  // every user would write an app_errors row until the Worker is deployed.
  if (status === 404) { _stopPolling('route answered 404', false); try { console.warn('[fresh] POST /changes 404: Worker without the route'); } catch (_) {} return 'stop'; }
  if (status !== 200 || !body || !Number.isFinite(Number(body.latest)) || !body.tables || typeof body.tables !== 'object') {
    // unknown is not «nothing changed»: keep the page, say it once, ask again later
    if (status !== -1 && status !== 401 && !_pollFailLogged && typeof logError === 'function') { _pollFailLogged = true; logError(new Error('changes: answer ' + status), 'fresh-on-return: changes read failed'); }
    return 'retry';
  }
  return 'ok';
}

async function _baseline() {
  if (!_polling) return;
  const { status, body } = await _ask(null);
  if (_verdict(status, body) === 'ok') _cursor = Math.max(_cursor === null ? 0 : _cursor, Number(body.latest));
}

async function _poll(round = 0) {
  _pollT = null;
  if (!_polling || document.visibilityState !== 'visible') return;   // a return asks again
  if (!_page() || (typeof navigator !== 'undefined' && navigator.onLine === false)) { _schedulePoll(POLL_MS); return; }
  // a laptop that slept with the tab visible fires no visibilitychange: a long silence is a return (it moves the
  // cursor and draws), never a page-by-page read of the night's log
  if (_lastAskAt && _now() - _lastAskAt > SLEEP_GAP_MS && _cursor !== null) { _lastAskAt = _now(); _schedulePoll(POLL_MS); tmsFreshNow('return'); return; }
  const sentFrom = _cursor;
  const { status, body } = await _ask(sentFrom);
  if (!_polling) return;
  const v = _verdict(status, body);
  if (v === 'stop') return;
  if (v === 'retry') { _schedulePoll(status === -1 || status === 401 ? POLL_MS : POLL_RETRY_MS); return; }
  const latest = Number(body.latest);
  // a draw moved the cursor while this ask was out: its counts mix rows the draw read with rows after it. Keep the
  // draw's cursor and ask again at once, so rows after it are counted, never skipped (review 26/11)
  if (_cursor !== sentFrom) { _schedulePoll(0); return; }
  _cursor = latest;
  if (sentFrom !== null) {
    const mine = PAGE_TABLES[_page()] || [];
    let n = 0;
    let any = 0;
    for (const [t, k] of Object.entries(body.tables)) {
      if (REF_T[t]) _refAt = 0;   // a renamed client or a new truck: the next draw reads the lists first
      if (mine.includes(t)) n += Number(k) || 0;
      any += Number(k) || 0;
    }
    if (any) _cacheDirty = true;   // the next draw (a menu click included) reads past the cache
    if (n > 0) { _pendingN += n; tmsFreshNow('changes'); }
  }
  if (body.more === true && round < MORE_MAX) { _poll(round + 1); return; }
  _schedulePoll(POLL_MS);
}

function _onVisibility() {
  if (document.visibilityState !== 'visible') {
    _hiddenAt = _now();
    if (_pollT) { clearTimeout(_pollT); _pollT = null; }   // no request while hidden
    return;
  }
  const away = _hiddenAt ? _now() - _hiddenAt : 0;
  if (!_pending && (away < AWAY_MIN_MS || _now() - _drawnAt < PAGE_MIN_AGE_MS)) {
    if (_polling) _schedulePoll(0);   // a short absence: what changed meanwhile is asked at once
    return;
  }
  // a long one: the page is drawn again (it moves the cursor first), and the asking resumes after it
  if (_polling) _schedulePoll(POLL_MS);
  tmsFreshNow('return');
}

function _onOnline() {
  _onlineAt = _now();
  if (_pending && document.visibilityState === 'visible') tmsFreshNow('online');
}

function tmsFreshWatch() {
  if (_watching) return;
  _watching = true;
  document.addEventListener('visibilitychange', _onVisibility);
  window.addEventListener('online', _onOnline);
  document.addEventListener('input', _noteTouched, true);
  document.addEventListener('change', _noteTouched, true);
  // reading counts as being there: a mouse move too (the board's presence counts it the same way)
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'].forEach(ev => document.addEventListener(ev, _noteAct, { capture: true, passive: true }));
  // tmsFormBusy remembers typed fields only once this ran; app.html calls it inside its service-worker block, and
  // a second call adds nothing (addEventListener ignores the same listener twice)
  if (typeof tmsSwUpdateWatch === 'function') tmsSwUpdateWatch();
  _polling = true;
  if (document.visibilityState === 'visible') _schedulePoll(0);
  _label();
}

window.tmsFreshDrawn = tmsFreshDrawn;
window.tmsFreshNow = tmsFreshNow;
window.tmsFreshWatch = tmsFreshWatch;
})();
