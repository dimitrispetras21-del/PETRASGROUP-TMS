// ═══════════════════════════════════════════════════════════════════════
// CORE — FRESH DATA WHEN THE USER COMES BACK TO THE TAB (T188, ValueDriven 26/11/2026)
// ─────────────────────────────────────────────────────────────────────
// The owner (call 9/11): another user does not see a new or changed order until they refresh. Measured 26/11 on a
// local copy of this main: an open page never reads again (no timer, no focus handler, no push), so a colleague's
// change stayed hidden until a menu click, an own save or F5; a renamed client stayed hidden even after F5
// (localStorage tiers in core/api.js, and a name map that only ever added names).
// What this file does, and only this:
//   - the tab was hidden for at least 30 s and the page is over 60 s old → the out-of-date cached reads are dropped
//     (core/api.js cacheDropForReturn) and the page is drawn again as a menu click draws it (navigate); the national
//     v5 board through its own «Ανανέωση» (WN5.reload), so its week and scroll stay;
//   - at most every 10 min the reference lists (clients, partners, places, vehicles, drivers) are read first
//     (core/api.js refDataRefresh), so renamed or new names show too;
//   - never over work in progress: a form, dialog or typed field (core/sw-update.js tmsFormBusy, the rule of the
//     new-version reload), and never over a search or filter the user typed or picked on the page (a redraw clears
//     them on the master-data pages, core/entity.js). It waits, and draws when they are gone (a DOM check every 5 s);
//   - never offline: the old page stays usable, and the draw comes with the `online` event;
//   - one small «Ενημερώθηκε 10:42 · ↻» in the top bar; ↻ reads now. Pages with their own label hide it.
// Only `visibilitychange`, on purpose: window `focus` fires before the click that brings the window back, so a draw
// there swallowed the click and a file chooser's `change` (code review 26/11).
// What it does NOT do: a page nobody leaves does not change by itself, and two people saving the same order is
// still last-write-wins (the «_expect» check covers the weekly boards only). No request while the tab is hidden.
// At load it only defines globals: no listener, timer or DOM until app.html calls tmsFreshWatch.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const AWAY_MIN_MS = 30 * 1000;          // a glance at another tab and back does not re-read the page
const PAGE_MIN_AGE_MS = 60 * 1000;      // nor does a page drawn a minute ago
const REF_MIN_AGE_MS = 10 * 60 * 1000;  // the six reference lists are ~40 requests (measured 26/11): not every return
const WAIT_RECHECK_MS = 5000;
// pages that already print their own «Ενημερώθηκε» (the boards, the ramp's 2-min refresh): one clock per screen
const OWN_LABEL = { weekly_intl: true, weekly_natl: true, daily_ramp: true };
// pages whose draw resets their search and filters (core/entity.js renderEntity, modules/locations.js): only there
// does a search or filter the user set hold the draw. Orders keeps its filters across a draw (S.filters), so a
// filter there must not turn the refresh off for the day (review 26/11).
const HOLD_ON_FILTER = { clients: true, partners: true, workshops: true, trucks: true, trailers: true, drivers: true, locations: true };

let _drawnAt = 0;            // when the current page was last drawn (navigate, or a refresh here)
let _hiddenAt = 0;           // when the tab was last hidden
let _refAt = Date.now();     // the page load read the reference lists (preload + its one revalidate)
let _running = false;
let _pending = false;        // a return found work in progress or no network: draw when that is over
let _pendingT = null;
let _watching = false;
const _touched = new Set(); // search and filter fields the user typed into or picked on this page (trusted events)

function _page() { return typeof currentPage !== 'undefined' ? currentPage : ''; }

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
  b.style.display = (!page || OWN_LABEL[page]) ? 'none' : '';
  if (_running) { b.textContent = 'Ανανέωση…'; b.title = 'Διαβάζει τα τελευταία δεδομένα'; return; }
  if (!_drawnAt) { b.textContent = ''; return; }
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
  _drawnAt = Date.now();
  _touched.clear();
  _pending = false;
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

function _holdReason() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const busy = typeof tmsFormBusy === 'function' ? tmsFormBusy() : null;
  if (busy) return busy;
  return _filtered() ? 'filtered' : null;
}

function _wait() {
  if (_pendingT) return;
  _pendingT = setTimeout(() => {
    _pendingT = null;
    if (!_pending || document.visibilityState !== 'visible') return;   // the next return starts it again
    if (Date.now() - _drawnAt < PAGE_MIN_AGE_MS) { _pending = false; _label(); return; }   // drawn meanwhile
    if (_holdReason()) { _wait(); return; }
    tmsFreshNow('after-wait');
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
  if (_running || !page) return;
  // An explicit click is the user's choice, as the new-version pill (core/sw-update.js); a return is not.
  if (reason !== 'user' && _holdReason()) { _pending = true; _label(); _wait(); return; }
  _pending = false;
  _running = true;
  _label();
  try {
    if (reason === 'user' || Date.now() - _refAt > REF_MIN_AGE_MS) {
      try {
        if (typeof refDataRefresh === 'function') await refDataRefresh();
        _refAt = Date.now();
      } catch (e) {
        // the page is still drawn with the names in memory; the failure is said, not swallowed (αρχή 1)
        if (typeof logError === 'function') logError(e, 'fresh-on-return: reference lists (' + reason + ')');
      }
    }
    if (_page() !== page) return;   // the user moved on meanwhile: that page was just drawn fresh
    if (page === 'weekly_natl' && typeof WN5 !== 'undefined' && WN5.active && WN5.active()) {
      await WN5.reload('return');
      _drawnAt = Date.now();
    } else if (typeof navigate === 'function') {
      if (typeof cacheDropForReturn === 'function') cacheDropForReturn();
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

function _onVisibility() {
  if (document.visibilityState !== 'visible') { _hiddenAt = Date.now(); return; }
  const away = _hiddenAt ? Date.now() - _hiddenAt : 0;
  if (!_pending && (away < AWAY_MIN_MS || Date.now() - _drawnAt < PAGE_MIN_AGE_MS)) return;
  tmsFreshNow('return');
}

function _onOnline() {
  if (_pending && document.visibilityState === 'visible') tmsFreshNow('online');
}

function tmsFreshWatch() {
  if (_watching) return;
  _watching = true;
  document.addEventListener('visibilitychange', _onVisibility);
  window.addEventListener('online', _onOnline);
  document.addEventListener('input', _noteTouched, true);
  document.addEventListener('change', _noteTouched, true);
  // tmsFormBusy remembers typed fields only once this ran; app.html calls it inside its service-worker block, and
  // a second call adds nothing (addEventListener ignores the same listener twice)
  if (typeof tmsSwUpdateWatch === 'function') tmsSwUpdateWatch();
  _label();
}

window.tmsFreshDrawn = tmsFreshDrawn;
window.tmsFreshNow = tmsFreshNow;
window.tmsFreshWatch = tmsFreshWatch;
})();
