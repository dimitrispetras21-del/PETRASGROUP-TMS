// ═══════════════════════════════════════════════════════════════════════
// WEEKLY NATIONAL v5 — the board of the new national model (global WN5)
// ─────────────────────────────────────────────────────────────────────
// Plan: docs/superpowers/plans/2026-10-26-f4a-national-v5-screens.md (Tasks T3, T5–T8, T10). Spec:
// docs/superpowers/specs/2026-10-21-national-v5-design.md §3. Figma KO7l2AfucR3HJEDIg1Yptr: board 2011:7745 with
// the owner changes of 25/10 (H1 2120:7738), states Δ12 2069:8579. Behind FEATURES.WN_V5 ('off' until day L).
//
// Unlike Weekly International v4 (a second renderer over WINTL), v5 OWNS its data: one read, GET /plan/board
// ?week=<Saturday>, through planFetch (core/plan-api.js) — never the facade. The week stays ONE: WNATL.week
// (core/ui.js ←/→ and the tabs move it, then renderWeeklyNatl() hands over through its one seam line).
//
// Rules this file keeps (each one a past incident of this project, as in modules/weekly_intl_v2.js):
//   - At load it ONLY defines WN5 (plus reading ?wn5= once): no listener, timer, observer or fetch.
//   - paint() never throws. A failure is STICKY for the session (_broken): the old board is drawn, with one
//     banner, until the next load — every hook then routes to the old board against the old board's DOM.
//   - Unknown ≠ empty: a board that did not arrive shows «—» and the Worker's message, never «καμία φόρτωση» or 0.
//   - The screen computes no rule of the base: dimming, lateness and days come from the board JSON.
//   - No Greek text of the Worker or the DB is copied here (principle 3): their messages are shown as they come.
//   - No role gate (owner 10/10, decision 41): buttons are not hidden, the Worker's 403 speaks.
//   - No hex (static ratchet, unit weekly_natl_v5 = 0): every colour is a class of the wn5 / wi4 blocks of
//     assets/style.css.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// Upper case is TYPED, never CSS text-transform: a transformed «Δευτέρα» keeps its tonos in some browsers.
const DOW_HEAD = Object.freeze(['ΚΥΡΙΑΚΗ', 'ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ']);
const MONTH_GEN = Object.freeze(['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου',
  'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου']);

const _esc = (s) => (typeof escapeHtml === 'function'
  ? escapeHtml(String(s == null ? '' : s))
  : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
function _logErr(e, where) { try { if (typeof logError === 'function') logError(e instanceof Error ? e : new Error(String(e)), where); } catch (_) {} }
function _ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function _lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }

// ── session state (memory only) ──
let _seq = 0;            // load sequence: an older answer never paints over a newer week
let _state = 'loading';  // 'loading' | 'ok' | 'empty' | 'err'
let _sat = null;         // the Saturday on screen
let _board = null;       // the last board that ARRIVED for _sat (kept through a failed re-read: «ό,τι ήρθε μένει»)
let _okAt = null;        // when it arrived (display only)
let _lastErr = null;     // the PlanError (or local error) of the last read
let _closed = null;      // the first writes_closed answer of the session (Ε-6; set by markClosed)
let _installed = false, _bannerShown = false, _warned = false;
const _closedDays = new Set();   // days the USER folded; the board never folds a day itself (owner 12/10)

// ═══ Flag, opt-in (Ε-1: three states like WI_V2) ═══
// ?wn5= is read once at load and dropped from the address, so a copied link does not spread an opt-in.
(function _readOptInParam() {
  try {
    const m = /[?&]wn5=([01])(?:&|$)/.exec(String((typeof location !== 'undefined' && location.search) || ''));
    if (!m) return;
    _lsSet('tms_wn5', m[1]);
    const u = new URL(location.href);
    u.searchParams.delete('wn5');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  } catch (_) { /* no opt-in: the old board, as today */ }
})();

function _flagRaw() { return typeof FEATURES !== 'undefined' && FEATURES ? FEATURES.WN_V5 : undefined; }
function _user() { try { return (typeof user !== 'undefined' && user && user.username) || ''; } catch (_) { return ''; } }
function _pilot() { try { return typeof WN_V5_USERS !== 'undefined' && Array.isArray(WN_V5_USERS) ? WN_V5_USERS : []; } catch (_) { return []; } }
function _decide() {
  const lg = typeof WI4 !== 'undefined' ? WI4 : null;
  if (!lg) return 'old';
  const raw = _flagRaw();
  // Unknown = closed (principle 5); one warning names the bad value.
  if (!_warned && lg.normFlag(raw) !== raw) { _warned = true; try { console.warn('[weekly natl v5] FEATURES.WN_V5 =', raw, "→ read as 'off'"); } catch (_) {} }
  // The same three-state rule as Weekly International (core/wi4-logic.js v2Decide): 'off' wins over every opt-in.
  return lg.v2Decide({ flag: raw, pilot: _pilot(), user: _user(), optIn: _ls('tms_wn5') }) === 'v4' ? 'v5' : 'old';
}
function active() {
  try {
    if (WN5._broken === true) return false;
    if (typeof currentPage === 'undefined' || currentPage !== 'weekly_natl') return false;
    return _decide() === 'v5';
  } catch (_) { return false; }
}
function _switch(v) {
  _lsSet('tms_wn5', v === '1' ? '1' : '0');
  if (v !== '1') _cleanup();
  if (typeof window.renderWeeklyNatl === 'function') window.renderWeeklyNatl();
}

// ═══ Week ═══
// /plan/board wants the Saturday of the TMS week (Sat–Fri, core/tms-week.js); the Worker refuses anything else.
function weekParam(week, year) {
  if (typeof TmsWeek === 'undefined') throw new Error('TmsWeek missing (core/tms-week.js)');
  return TmsWeek.startOfDate(TmsWeek.start(Number(week), year));
}
function _week(n) {
  const v = Number(n);
  if (!Number.isInteger(v) || !window.WNATL) return;
  window.WNATL.week = v;
  window.renderWeeklyNatl();
}
function _onWeekChange() { _closedDays.clear(); }

// ═══ Load ═══
async function render() {
  const seq = ++_seq;
  let week;
  try { week = weekParam(window.WNATL.week); } catch (e) { _fail(e); return _fallback(); }
  if (week !== _sat) { _board = null; _okAt = null; _onWeekChange(); }
  _sat = week; _state = 'loading'; _lastErr = null;
  if (!_board && !paint()) return _fallback();
  let board = null, err = null;
  try { board = await planFetch('GET', '/plan/board?week=' + week); } catch (e) { err = e; }
  if (seq !== _seq || !active()) return;               // a newer render, or another page, owns the screen now
  if (err && err._sessionGone) return;                  // the login page is on its way; nothing to draw
  if (!err && (!board || typeof board !== 'object' || board.week !== week)) {
    err = { kind: 'client', message: 'Η απάντηση του πίνακα ήταν για άλλη εβδομάδα (' + String(board && board.week) + ') — ενημέρωσε τον Δημήτρη' };
    _logErr(new Error(err.message), 'weekly natl v5: board week');
  }
  if (err) { _state = 'err'; _lastErr = err; }
  else { _board = board; _okAt = new Date(); _state = _isEmpty(board) ? 'empty' : 'ok'; }
  if (!paint()) return _fallback();
}
// Empty = the three lists that make rows came back empty (a malformed list is not «empty»: paint refuses it).
function _isEmpty(b) {
  const n = (k) => (Array.isArray(b[k]) ? b[k].length : 1);
  return n('cycles') === 0 && n('waiting') === 0 && n('hub') === 0;
}
// reason names the caller (a write, the user's «Ανανέωση», a reuse check) for the trace; the read is the same.
async function reload(reason) {
  void reason;
  await render();
  return _state === 'ok' || _state === 'empty' ? _model() : null;
}
// request_reused (F2 note 1): the first send WAS saved but no ids came back — read the board again and find it.
// pred receives the WHOLE re-read board JSON ({week, cycles, waiting, hub, notices}) and returns the found
// object or null: the callers (T17, T19, T20, T23, T25) know where their record lives; findAfterReuse((b) => b)
// is the one way to get a fresh board snapshot when a form, sheet or card opens.
async function findAfterReuse(pred) {
  await reload('reuse');
  if (!_board || _state === 'err' || typeof pred !== 'function') return null;
  return pred(_board) || null;
}
function snapshot() {
  return { state: _state, week: _sat, rows: document.querySelectorAll('#content .wn5 .wn5-row').length,
    writesClosed: !!_closed, lastErr: _lastErr ? String(_lastErr.message) : null };
}
function markClosed(err) { _closed = { message: err && err.message ? String(err.message) : '' }; }
function _fallback() {
  try { if (typeof window.renderWeeklyNatl === 'function') return window.renderWeeklyNatl(); }
  catch (e) { _logErr(e, 'weekly natl v5: fallback to the old board'); }
}

// ═══ paint() ═══
function paint() {
  try { _paint(); return true; } catch (e) { _fail(e); return false; }
}
function _fail(e) {
  WN5._broken = true;   // sticky for the session
  try { _cleanup(); } catch (_) {}
  _logErr(e, 'weekly natl v5: paint failed — old board until reload');
  try { console.error('[weekly natl v5] paint failed:', e); } catch (_) {}
  if (_bannerShown) return;
  _bannerShown = true;
  // The old board repaints #content after its load, so the banner sits just ABOVE #content, once, and leaves with
  // the page (the router has no leave hook).
  try {
    const content = document.getElementById('content');
    if (!content || !content.parentNode) return;
    const b = document.createElement('div');
    b.className = 'wi4-banner';
    b.setAttribute('role', 'alert');
    b.textContent = 'Η νέα προβολή απέτυχε — δείχνουμε την παλιά μέχρι την επόμενη φόρτωση';
    content.parentNode.insertBefore(b, content);
    const gone = () => {
      if (!b.isConnected) return;
      if (typeof currentPage !== 'undefined' && currentPage !== 'weekly_natl') { b.remove(); return; }
      setTimeout(gone, 3000);
    };
    setTimeout(gone, 3000);
  } catch (_) { /* the old board is on screen either way */ }
}
function _paint() {
  const content = document.getElementById('content');
  if (!content) throw new Error('#content missing');
  if (_board) _checkShape(_board);
  content.innerHTML = _rootHTML();
  document.body.classList.add('wn5-on');
  _install();
}

// ═══ Model and body (T3: the week's days only; T5 draws the rows from WN5L.model) ═══
// A list that is not a list cannot be drawn: a loud paint failure (old board + banner), never a silent skip.
function _checkShape(b) {
  for (const k of ['cycles', 'waiting', 'hub', 'notices']) if (!Array.isArray(b[k])) throw new Error('plan_board shape: ' + k + ' is not a list');
}
function _model() {
  const [y, mo, d] = _sat.split('-').map(Number);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const t = new Date(Date.UTC(y, mo - 1, d + i));
    days.push({ date: t.toISOString().slice(0, 10), head: `${DOW_HEAD[t.getUTCDay()]} ${t.getUTCDate()}/${t.getUTCMonth() + 1}`, rows: [], empty: true });
  }
  return { week: _sat, days, queue: [] };
}
function _today() { return typeof localToday === 'function' ? localToday() : ''; }
function _rootHTML() {
  const m = _model();
  const known = _state === 'ok' || _state === 'empty' || (_state === 'err' && !!_board);
  return `<div class="wi4 wn5" data-week="${_esc(_sat)}" data-state="${_esc(_state)}">`
    + _barHTML() + _errHTML() + _qbandHTML(m, known)
    + `<div id="wn5-rows">${m.days.map((d) => _dayHTML(d, known)).join('')}</div></div>`;
}
function _qbandHTML(m, known) {
  const n = !known ? (_state === 'loading' ? '…' : '—') : m.queue.length ? String(m.queue.length) : '<span class="wn5-lc">κανένα</span>';
  return `<div class="wi4-q wn5-q"><div class="wi4-q-hd"><span>ΕΠΟΜΕΝΑ · ${n}</span></div></div>`;
}
function _dayHTML(d, known) {
  const today = d.date === _today();
  const empty = known && d.empty;
  const [name, date] = d.head.split(' ');
  const tail = (today ? '<span class="wi4-today"> · σήμερα</span>' : '')
    + (!known ? `<span class="wn5-dayx"> · ${_state === 'loading' ? '…' : '—'}</span>` : empty ? '<span class="wn5-dayx"> · καμία φόρτωση</span>' : '');
  return `<section class="wi4-day wn5-day${today ? ' today' : ''}${empty ? ' empty' : ''}" data-date="${d.date}">`
    + `<div class="wi4-dayh wn5-dayh"><span class="wi4-dayh-sp"></span><span class="wi4-dayn">${_esc(name)} <span class="wi4-dayd">${_esc(date)}</span></span>${tail}</div></section>`;
}
// ═══ end of model and body ═══

function _barHTML() {
  const w = Number(window.WNATL && window.WNATL.week);
  const upd = _state === 'loading' ? 'Διαβάζει…' : _okAt ? 'Ενημερώθηκε ' + _hhmm(_okAt) : '—';
  return '<div class="wi4-bar wn5-bar"><div class="wi4-bar-l"><span class="wi4-title">Εβδομαδιαίο Εθνικών</span>'
    + `<span class="wi4-range">${_esc(_rangeText(_sat))}</span>`
    + `<button type="button" class="wn5-upd" data-act="reload" title="Ανανέωση" onclick="WN5.reload('user')">↻ ${_esc(upd)}</button></div>`
    + `<nav class="wi4-tabs" aria-label="Εβδομάδες">${_tabsHTML(w)}</nav>`
    + '<div class="wi4-bar-r"><button type="button" class="wi4-btn sm" title="Το παλιό Εβδομαδιαίο Εθνικών" onclick="WN5._switch(\'0\')">Παλιά προβολή</button></div></div>';
}
function _tabsHTML(w) {
  if (!Number.isInteger(w)) return '';
  const cur = typeof TmsWeek !== 'undefined' ? TmsWeek.current() : null;
  let h = `<button type="button" class="wi4-tab" aria-label="Προηγούμενη εβδομάδα" onclick="WN5._week(${w - 1})">‹</button>`;
  for (let d = -3; d <= 3; d++) {
    const n = w + d;
    h += `<button type="button" class="wi4-tab${d === 0 ? ' on' : ''}" data-w="${n}" onclick="WN5._week(${n})">W${n}${n === cur ? '<span class="wi4-tab-cur" aria-hidden="true"></span>' : ''}</button>`;
  }
  h += `<button type="button" class="wi4-tab" aria-label="Επόμενη εβδομάδα" onclick="WN5._week(${w + 1})">›</button>`;
  if (cur && cur !== w) h += `<button type="button" class="wi4-tab" onclick="WN5._week(${cur})">Σήμερα</button>`;
  return h;
}
// «10–16 Οκτωβρίου», or «26 Σεπτεμβρίου – 2 Οκτωβρίου» across a month.
function _rangeText(sat) {
  if (!DAY_RE.test(String(sat || ''))) return '';
  const [y, m, d] = sat.split('-').map(Number);
  const a = new Date(Date.UTC(y, m - 1, d)), b = new Date(Date.UTC(y, m - 1, d + 6));
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONTH_GEN[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${MONTH_GEN[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTH_GEN[b.getUTCMonth()]}`;
}
function _hhmm(d) { return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
// Δ12 πλακ. 3: the Worker's message as it came, what it does NOT mean, and the one way on — a press, never a timer.
function _errHTML() {
  if (_state !== 'err' || !_lastErr) return '';
  const last = _okAt ? ` · Τελευταία πλήρης ${_hhmm(_okAt)}` : '';
  return `<div class="wn5-strip" data-kind="${_esc(_lastErr.kind || 'failed')}" role="alert"><b>ΣΦΑΛΜΑ</b><span>${_esc(_lastErr.message)}</span>`
    + `<span class="wn5-strip-sub">${_board ? 'Ό,τι ήρθε πριν μένει στην οθόνη' : 'Η εβδομάδα δεν διαβάστηκε — δεν σημαίνει ότι είναι άδεια'}${last}</span>`
    + '<button type="button" class="wi4-btn sm" data-act="reload" onclick="WN5.reload(\'user\')">Ανανέωση ↻</button></div>';
}

// ═══ Session hooks (installed once, at the first paint; every one starts with the v5 guard) ═══
function _install() {
  if (_installed) return;
  _installed = true;
  const content = document.getElementById('content');
  // The router has no leave hook (as for v4): a page change replaces #content's children.
  if (content && typeof MutationObserver === 'function') {
    new MutationObserver(() => { if (!content.querySelector('.wn5')) _cleanup(); }).observe(content, { childList: true });
  }
}
function _cleanup() {
  try { document.body.classList.remove('wn5-on'); } catch (_) {}
  // Every body-level overlay of v5 carries data-wn5-overlay: one rule removes them all when the board leaves.
  try { document.querySelectorAll('body > [data-wn5-overlay]').forEach((el) => el.remove()); } catch (_) {}
}

const WN5 = {
  _broken: false,
  active,
  render,
  paint,
  reload,
  findAfterReuse,
  snapshot,
  markClosed,
  weekParam,
  MENU_ITEMS: [],
  _week,
  _switch,
};
window.WN5 = WN5;
})();
