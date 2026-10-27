// ═══════════════════════════════════════════════════════════════════════
// WEEKLY NATIONAL v5 — the board of the new national model (global WN5)
// ─────────────────────────────────────────────────────────────────────
// Plan: docs/superpowers/plans/2026-10-26-f4a-national-v5-screens.md (Tasks T3, T5–T8, T10). Spec:
// docs/superpowers/specs/2026-10-21-national-v5-design.md §3. Figma KO7l2AfucR3HJEDIg1Yptr: board 2011:7745 with
// the owner changes of 25/10 (H1 2120:7738), menu 2011:8858, states Δ12 2069:8579. Behind FEATURES.WN_V5.
//
// Unlike Weekly International v4 (a second renderer over WINTL), v5 OWNS its data: one read, GET /plan/board
// ?week=<Saturday>, through planFetch (core/plan-api.js) — never the facade. The rows come from WN5L.model
// (core/wn5-logic.js): this file draws, it decides nothing the base decides. The week stays ONE: WNATL.week
// (core/ui.js ←/→ and the tabs move it, then renderWeeklyNatl() hands over through its one seam line).
//
// Rules this file keeps (each one a past incident of this project, as in modules/weekly_intl_v2.js):
//   - At load it ONLY defines WN5 (plus reading ?wn5= once): no listener, timer, observer or fetch.
//   - paint() never throws. A failure is STICKY for the session (_broken): the old board is drawn, with one
//     banner, until the next load — every hook then routes to the old board against the old board's DOM.
//   - Unknown ≠ empty: a board that did not arrive shows «—» and the Worker's message, never «καμία φόρτωση» or 0.
//   - The screen computes no rule of the base: dimming, lateness and days come from the board JSON (WN5L copies).
//   - No time in the ΑΝΑΘΕΣΗ column, the Veroia loading time under «Βέροια» in ΦΟΡΤΩΣΗ (owner 25/10).
//   - No Greek text of the Worker or the DB is copied here (principle 3): their messages are shown as they come.
//   - No role gate (owner 10/10, decision 41): buttons are not hidden, the Worker's 403 speaks.
//   - Rows are found by rt_id / piece_id at the moment of a click, never by a DOM index.
//   - Cells hold spans and buttons only (no nested div): tests/wn5-board-html.test.js reads the HTML by cell.
//   - No hex (static ratchet, unit weekly_natl_v5 = 0): every colour is a class of the wn5 / wi4 blocks of
//     assets/style.css.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const L = () => (typeof WN5L !== 'undefined' ? WN5L : null);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[1-9]\d{0,14}$/;
const MONTH_GEN = Object.freeze(['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου',
  'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου']);
// Two stops per point column at 1920 (Figma 2011:7745: two ~178px stops), the rest behind «+N». At ≤1600 (1440 with
// the sidebar) a point column is ~240px: two stops side by side wrapped every name and doubled the row height, so it
// shows ONE whole stop + «+N» (fidelity T5 r1). Decided at paint (the same query as the wn5 CSS block); a resize
// across 1600 repaints once (_install), so a hidden stop never hides behind a CSS rule the rigs cannot see.
const NARROW_MQ = '(max-width:1600px)';
function _visPts() {
  try { return typeof window.matchMedia === 'function' && window.matchMedia(NARROW_MQ).matches ? 1 : 2; } catch (_) { return 2; }
}
// Inline SVG with currentColor: core/icons.js has no plane, and a colour literal here would break the ratchet.
const PLANE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';
const CHEV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

const _esc = (s) => (typeof escapeHtml === 'function'
  ? escapeHtml(String(s == null ? '' : s))
  : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
const _id = (x) => (ID_RE.test(String(x)) ? String(x) : '');   // safe to embed in an inline handler
function _logErr(e, where) { try { if (typeof logError === 'function') logError(e instanceof Error ? e : new Error(String(e)), where); } catch (_) {} }
function _ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function _lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }

// ── session state (memory only) ──
let _seq = 0;            // load sequence: an older answer never paints over a newer week
let _state = 'loading';  // 'loading' | 'ok' | 'empty' | 'err'
let _sat = null;         // the Saturday on screen
let _board = null;       // the last board that ARRIVED for _sat (kept through a failed re-read: «ό,τι ήρθε μένει»)
let _m = null;           // WN5L.model(_board) of the last paint
let _okAt = null;        // when the board arrived (display only)
let _lastErr = null;     // the PlanError (or local error) of the last read
let _closed = null;      // the first writes_closed answer of the session (Ε-6; set by markClosed)
let _qAll = false;       // «Όλα N ▾» of the ΕΠΟΜΕΝΑ band
let _qRaw = '';          // the search text, memory only; cleared when the week changes (Ε-25)
let _sIdx = 0;           // the match Enter is on («1/2»)
const _qi = new Map();   // row key → search text of the last paint (fhSearchBlob: the fields of a row kept apart)
let _noteBusy = false;   // «Σημείωσα ✓» in flight: one press at a time
let _noteErr = null;     // the answer that stopped the last «Σημείωσα ✓» (shown in the strip until the week changes)
let _installed = false, _bannerShown = false, _warned = false;
const _closedDays = new Set();   // days the USER folded; the board never folds a day itself (owner 12/10)
const _errLogged = new Set();    // shape lines already logged (one row per distinct line per session)

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
function _onWeekChange() { _closedDays.clear(); _qAll = false; _qRaw = ''; _sIdx = 0; _noteErr = null; }

// ═══ Load ═══
// No reportPageMetrics under v5 (F4α T10): the metrics audit (modules/metrics_audit.js) compares the OLD board's
// numbers (weekNumberDefault, kathodos / anodos …) under the page key weekly_natl; a v5 report under the same key
// would be a different count with the same name. Until Φ4β defines v5 metrics the audit says «δεν άνοιξε» — honest.
async function render() {
  const seq = ++_seq;
  let week;
  try { week = weekParam(window.WNATL.week); } catch (e) { _fail(e); return _fallback(); }
  if (week !== _sat) { _board = null; _m = null; _okAt = null; _onWeekChange(); }
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
// Empty = the three lists that make rows came back empty (a malformed list is not «empty»: WN5L.model refuses it).
function _isEmpty(b) {
  const n = (k) => (Array.isArray(b[k]) ? b[k].length : 1);
  return n('cycles') === 0 && n('waiting') === 0 && n('hub') === 0;
}
// reason names the caller (a write, the user's «Ανανέωση», a reuse check) for the trace; the read is the same.
async function reload(reason) {
  void reason;
  await render();
  return _state === 'ok' || _state === 'empty' ? _m : null;
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
// The last board JSON and the model painted from it, for wn5_actions.js / wn5_veroia.js: the ids an action
// needs (location_id, stop_id) live only in the JSON. Read-only by contract: a dialog snapshots what it shows.
function state() { return { board: _board, model: _m }; }
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
  const lg = L();
  if (!lg) throw new Error('WN5L missing (core/wn5-logic.js)');
  // A board that cannot be drawn (WN5L.ShapeError) throws here: the old board, loudly — never half a v5 board.
  // The 072 board names no hub stop: the catalogue's hub id (PlanIds.hub(), T12) when it is loaded, else WN5L reads
  // it from base facts (Ε-27). A hub[] row is at Veroia either way (071 at_hub). Neither → WN5L.HUB_UNKNOWN in
  // m.errors, which _shapeHTML shows and _logShape logs once (Ε-44): never Veroia as an ordinary stop in silence.
  const hubId = typeof PlanIds !== 'undefined' && typeof PlanIds.hub === 'function' ? PlanIds.hub() : null;
  _m = _board ? lg.model(_board, hubId != null ? { today: _today(), hubId } : { today: _today() }) : null;
  _closeMenu();
  content.innerHTML = _rootHTML();
  // the one listener of the board's actions lives on this root and dies with it at the next paint
  if (typeof WN5Act !== 'undefined') WN5Act.bind(document.querySelector('#content > .wn5'));
  _noteStrip();
  document.body.classList.add('wn5-on');
  _install();
  _logShape(_m);
  _buildIndex(_m);
  _applySearch(false);
  _fitUpd();
}
// Figma H1 «↻ Ενημερώθηκε …»: the word shows whenever it fits and goes first when it does not — before the bar's
// overflow cuts the time. Measured, not a breakpoint: the range («26 Σεπτεμβρίου – 2 Οκτωβρίου») and the sidebar
// (open or folded) change the room at the same window width.
function _fitUpd() {
  try {
    const bl = document.querySelector('#content .wn5 .wn5-bar .wi4-bar-l');
    if (!bl) return;
    // Measured with the range whole (.wn5-fit): outside the measure the range may shrink, which would hide the need.
    bl.classList.add('wn5-fit');
    bl.classList.remove('wn5-upd-short');
    if (bl.scrollWidth > bl.clientWidth + 1) bl.classList.add('wn5-upd-short');
    bl.classList.remove('wn5-fit');
  } catch (_) { /* the word stays; the range gives way by its ellipsis */ }
}
function _today() { return typeof localToday === 'function' ? localToday() : ''; }
// The day words come from ONE place (core/wi4-logic.js dayLabel): «Τρί 13/10» / «Τρί».
const _dl = (d) => (d && typeof WI4 !== 'undefined' ? WI4.dayLabel(d) : d || '—');
const _dow = (d) => _dl(d).split(' ')[0];
const _pal = (n) => String(n == null ? '—' : n).replace('.', ',') + 'π';
function _chipCls(day, today) { return !day || !today ? 'next' : day === today ? 'today' : day < today ? 'past' : 'next'; }
function _rowOf(rtId) {
  if (!_m) return null;
  const id = Number(rtId);
  for (const d of _m.days) for (const r of d.rows) if (r.rtId === id) return r;
  return null;
}
function _cycleOf(rtId) { return _board ? _board.cycles.find((c) => c.rt_id === Number(rtId)) || null : null; }

// ═══ Root, bar, states ═══
function _rootHTML() {
  // While loading, or when the read failed with nothing before it, the days come from an empty board of the week:
  // the counters say «…» / «—» (known = false), never «καμία φόρτωση» or 0 (Δ12 πλακ. 2–3).
  const m = _m || L().model({ week: _sat, cycles: [], waiting: [], hub: [], notices: [] }, { today: _today() });
  const known = !!_m;
  return `<div class="wi4 wn5" data-week="${_esc(_sat)}" data-state="${_esc(_state)}">`
    + _barHTML() + _errHTML() + (known ? _shapeHTML(m) : '') + _boardHTML(m, known) + '</div>';
}
function _barHTML() {
  const w = Number(window.WNATL && window.WNATL.week);
  // «Ενημερώθηκε» is a word that gives way when the bar has no room for it (_fitUpd); the time stays. The time, not
  // «μόλις τώρα» (Figma): no timer refreshes the words, and «μόλις τώρα» would still say so an hour later.
  const upd = _state === 'loading' ? _esc('Διαβάζει…') : _okAt ? `<span class="wn5-upd-w">Ενημερώθηκε </span>${_hhmm(_okAt)}` : '—';
  return '<div class="wi4-bar wn5-bar"><div class="wi4-bar-l"><span class="wi4-title">Εβδομαδιαίο Εθνικών</span>'
    + `<span class="wi4-range" title="${_esc(_rangeText(_sat))}">${_esc(_rangeText(_sat))}</span>`
    + `<button type="button" class="wn5-upd" data-act="reload" title="Ανανέωση" onclick="WN5.reload('user')"><span class="wn5-ico-re" aria-hidden="true">↻</span> ${upd}</button></div>`
    + `<nav class="wi4-tabs" aria-label="Εβδομάδες">${_tabsHTML(w)}</nav>`
    // Figma 7745 / H1 right group: «Προβολή ▾» · «Σάρωση» · «+ Νέα παραγγελία». «Προβολή ▾» and «Σάρωση» wait for
    // Φ4β (Ε-42, Ε-38): the scan creates an order of the OLD model, which this board never shows (principle 1).
    // «+ Νέα παραγγελία» comes with the v5 form (T20): never a button that opens nothing, never the old form here.
    + '<div class="wi4-bar-r">'
    + (typeof WN5Form !== 'undefined' && typeof OrdersCommon !== 'undefined' && OrdersCommon.newOrderButton
      ? OrdersCommon.newOrderButton('WN5Form.openOrder({})', '+ Νέα παραγγελία', 'Νέα εθνική παραγγελία v5 — χωρίς έξοδο από το εβδομαδιαίο') : '')
    + '<button type="button" class="wi4-btn sm" title="Το παλιό Εβδομαδιαίο Εθνικών" onclick="WN5._switch(\'0\')">Παλιά προβολή</button></div></div>';
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
    + '<button type="button" class="wi4-link wn5-strip-act" data-act="reload" onclick="WN5.reload(\'user\')">Ανανέωση <span class="wn5-ico-re" aria-hidden="true">↻</span></button></div>';
}
// A part of the board WN5L could not place (a stop with an unknown side, two hubs): said on screen and logged once
// per distinct line — never dropped in silence (principle 1).
function _shapeHTML(m) {
  if (!m.errors.length) return '';
  return `<div class="wn5-strip" data-kind="client" role="alert"><b>ΔΕΔΟΜΕΝΑ ΠΟΥ ΔΕΝ ΣΧΕΔΙΑΣΤΗΚΑΝ</b><span>${_esc(m.errors.join(' · '))}</span></div>`;
}
function _logShape(m) {
  if (!m) return;
  for (const line of m.errors) {
    if (_errLogged.has(line)) continue;
    _errLogged.add(line);
    _logErr(new Error(line), 'weekly natl v5: board shape');
  }
}

// ═══ Board body ═══
function _boardHTML(m, known) {
  const no = { n: 0 };
  const cycles = m.days.flatMap((d) => d.rows).filter((r) => r.kind === 'cycle');
  return _qbandHTML(m, known)
    // Δ12 2069:10269 (fidelity T7 r1): the no-match words are a strip of their own under the band, not text inside it.
    + '<div id="wn5-snone" class="wn5-snone" role="status" hidden></div>'
    + (known ? _noticesHTML(m) : '')
    + (known && typeof WN5Hub !== 'undefined' && typeof WN5Hub.shelfHTML === 'function' ? WN5Hub.shelfHTML(m) : '')
    // Δ12 (empty / loading / error frames): no column heads over a board with no row — they head nothing.
    + (m.days.some((d) => d.rows.length) ? _colsHTML(cycles, known) : '')
    + `<div id="wn5-rows">${m.days.map((d) => _dayHTML(d, m, known, no)).join('')}</div>`;
}
function _qbandHTML(m, known) {
  const search = _searchHTML(known);
  if (!known) return `<div class="wi4-q wn5-q">${search}<div class="wi4-q-hd"><span>ΕΠΟΜΕΝΑ · ${_state === 'loading' ? '…' : '—'}</span></div></div>`;
  const q = m.queue;
  if (!q.length) return `<div class="wi4-q wn5-q">${search}<div class="wi4-q-hd"><span>ΕΠΟΜΕΝΑ · <span class="wn5-lc">κανένα</span></span></div></div>`;
  // Three cards at 1920 (Figma 2011:7745 / H1). At ≤1600 three cards of ~350px cut the client and its «+N» away
  // (fidelity T5 r2), so two show and «Όλα 3 ▾» — Figma's own link at the end of the band — opens the rest. The same
  // query and the same one repaint on crossing 1600 as the stops (_visPts).
  const max = _visPts() === 1 ? 2 : 3;
  const shown = _qAll ? q : q.slice(0, max);
  const more = q.length > max ? `<button type="button" class="wi4-link wi4-q-all" onclick="WN5._qMore()">${_qAll ? 'Λιγότερα ▴' : `Όλα ${q.length} ▾`}</button>` : '';
  return `<div class="wi4-q wn5-q">${search}<div class="wi4-q-hd"><span>ΕΠΟΜΕΝΑ · ${q.length}</span><span class="wi4-q-n">${_esc(_qSub(q, m.today))}</span></div>`
    + `<div class="wn5-qcards">${shown.map((it) => _qcardHTML(it, m)).join('')}</div>${more}</div>`;
}
// «2 VS από Δευ · 1 Παρ» (Figma 2011:7745): how many of the queue fall on each day; «VS» once, on the first.
function _qSub(q, today) {
  const by = new Map();
  for (const it of q) by.set(it.day, (by.get(it.day) || 0) + 1);
  // «από» on the first day (Figma 2011:7745 «2 VS από Δευ · 1 Παρ»), never before «σήμερα».
  return [...by.entries()].map(([d, n], i) => `${n}${i ? '' : ' VS'} ${d && d === today ? 'σήμερα' : (i ? '' : 'από ') + _dow(d)}`).join(' · ');
}
// «VS-118 → Rentis +2» (Figma 2011:7745): the first destination and how many more, so the 28px card is never cut
// mid-name; the whole line stays in title. The board of 072 names a hub VS's clients, not its places (Ε-26), so the
// client stands where Figma has the place, and the reason stands where Figma has «φτάνει 14:00» (no arrival on the
// board) — never an invented place or hour.
function _qcardHTML(it, m) {
  const today = m.today;
  const why = it.reason === 'late' ? 'καθυστερεί' : 'χωρίς φορτηγό';
  let row = null;
  for (const d of m.days) for (const r of d.rows) if (!row && r.kind === 'unassigned' && r.pieceIds[0] === it.pieceId) row = r;
  const cl = row ? row.clients : [];
  // Three spans (fidelity T5 r2): at 1440 the card is ~350px and the client is what gives way — the code and «+N»
  // stay whole, so «+2» is never cut away with the name (the whole line is in title).
  const short = `<span class="wn5-qc-k">${_esc(it.code || '—')} →</span><span class="wn5-qc-cl">${_esc(cl[0] || '—')}</span>`
    + (cl.length > 1 ? `<span class="wn5-qc-n">+${cl.length - 1}</span>` : '');
  return `<div class="wi4-qcard wi4-r-red wn5-qcard" data-piece="${_id(it.pieceId)}">`
    + `<span class="wi4-dc ${_chipCls(it.day, today)}">${_esc(_dl(it.day))}</span>`
    + `<span class="wi4-qcard-t"><span class="wi4-l1 wn5-qc-l1" title="${_esc(it.title)}">${short}</span><span class="wi4-l2">${_esc(_pal(it.pallets))} · ${why}</span></span>`
    + '<button type="button" class="wi4-btn sm" data-act="assign">Ανάθεση</button></div>';
}
function _qMore() {
  _qAll = !_qAll;
  const q = document.querySelector('#content .wn5 .wn5-q');
  if (q && _m) q.outerHTML = _qbandHTML(_m, true);
}
// Column heads of Figma H1 2120:7738: «ΑΝΑΘΕΣΗ» alone (owner 25/10), no Veroia-time column anywhere.
function _colsHTML(cycles, known) {
  const kn = cycles.filter((r) => r.kath).length;
  const an = cycles.filter((r) => r.anod && !r.anod.gap).length;
  const cnt = (n) => (known ? ` · ${n} ${n === 1 ? 'κύκλος' : 'κύκλοι'}` : '');
  return '<div class="wn5-cols" role="row">'
    + '<span class="wn5-c-idx"></span><span class="wn5-c-kd">ΚΑΘΟΔΟΣ</span><span class="wn5-c-kfl">ΦΟΡΤΩΣΗ</span>'
    + `<span class="wn5-c-kto">ΠΑΡΑΔΟΣΗ<span class="wn5-h-sub">${cnt(kn)}${known ? '<span class="wn5-h-long"> · ανά ημέρα φόρτωσης Βέροιας</span>' : ''}</span></span>`
    + '<span class="wn5-c-kpal">ΠΑΛ.</span><span class="wn5-c-asg wn5-h-asg">ΑΝΑΘΕΣΗ</span>'
    + `<span class="wn5-c-ad">ΑΝΟΔΟΣ</span><span class="wn5-c-afl">ΦΟΡΤΩΣΗ<span class="wn5-h-sub">${cnt(an)}</span></span>`
    + '<span class="wn5-c-ato">ΠΡΟΣ</span><span class="wn5-c-apal">ΠΑΛ.</span></div>';
}
function _dayHTML(d, m, known, no) {
  const today = d.date === m.today;
  const empty = known && d.empty;
  const fold = known && !empty;
  const closed = fold && _closedDays.has(d.date);
  // Δ12 πλακ. 2: while the week is read, today's day shows two grey bars — shape only, no number, no row (the rigs and
  // snapshot() count .wn5-row; a bar is never one).
  const skel = !known && _state === 'loading' && today;
  // Δ12 πλακ. 1: in a week with no load at all every day shows a «›» (folded, nothing inside); in a week with loads
  // an empty day has none (Figma H1 «ΤΡΙΤΗ 13/10 · σήμερα · καμία φόρτωση»). Not a button: there is nothing to open.
  const allEmpty = empty && m.days.every((x) => x.empty);
  const [name, date] = d.head.split(' ');
  const tail = (today ? '<span class="wi4-today"> · σήμερα</span>' : '')
    + (!known ? `<span class="wn5-dayx"> · ${_state === 'loading' ? '…' : '—'}</span>` : empty ? '<span class="wn5-dayx"> · καμία φόρτωση</span>' : '');
  const head = `<div class="wi4-dayh wn5-dayh"${fold ? ` role="button" tabindex="0" aria-expanded="${!closed}" onclick="WN5._dayTog('${d.date}')"` : ''}>`
    + (fold || skel || allEmpty ? `<span class="wi4-chev">${CHEV}</span>` : '<span class="wi4-dayh-sp"></span>')
    + `<span class="wi4-dayn">${_esc(name)} <span class="wi4-dayd">${_esc(date)}</span></span>${tail}</div>`;
  const body = fold ? `<div class="wi4-day-body">${d.rows.map((r) => _rowHTML(r, m, no)).join('')}</div>`
    : skel ? `<div class="wi4-day-body wn5-skel-b" aria-hidden="true">${'<div class="wn5-skel"><span></span><span></span><span></span><span></span><span></span><span></span></div>'.repeat(2)}</div>` : '';
  return `<section class="wi4-day wn5-day${today ? ' today' : ''}${empty ? ' empty' : ''}${closed ? ' closed' : ''}" data-date="${d.date}">${head}${body}</section>`;
}
// Days are folded only by the user's click (owner 12/10), and stay as the user left them until the week changes.
function _dayTog(date) {
  if (!DAY_RE.test(String(date || ''))) return;
  const sec = document.querySelector(`#content .wn5 .wn5-day[data-date="${date}"]`);
  if (!sec || sec.classList.contains('empty')) return;
  if (_closedDays.has(date)) _closedDays.delete(date); else _closedDays.add(date);
  const closed = _closedDays.has(date);
  sec.classList.toggle('closed', closed);
  const h = sec.querySelector('.wn5-dayh');
  if (h) h.setAttribute('aria-expanded', String(!closed));
}

// ═══ Rows ═══
// Executed = 40% by DAY (owner 21–22/10, Figma 2035:7735 / rule 2036:7735): the class follows ONLY the base's flags
// (WN5L copies v_rt_stop_state.dim / side_dim / cycle_dim) — the screen never compares a date. On top of the base's
// own rule (never without a vehicle, never when late) the screen keeps the owner's «ποτέ σβηστό ό,τι θέλει δουλειά»
// as a guard: a load waiting for a vehicle, a cycle without one, and a late stop are never dimmed, even if a flag
// said so (a corrupt answer must not hide work).
function _dimOk(r) { return r.kind === 'cycle' && r.rail !== 'red'; }
const _dc = (on) => (on ? ' wn5-dim' : '');
// A window the board did not send (hub[] of 072, Ε-26) is «—», never «null–null» and never a guess (as T5).
const _win = (f, t) => (f && t ? `${_esc(f)}–${_esc(t)}` : '—');
// The «ΠΡΟΣ ΑΝΑΘΕΣΗ» line of a missing destination (as T5): a row that needs work, so it never dims.
function _missHTML(r) {
  return `<div class="wn5-sub wn5-miss" data-qi="${_esc(r.key)}" data-key="miss:${_esc(r.key)}"><span class="wn5-c-idx"></span><span class="wn5-sub-t">${_esc(r.miss)}</span></div>`;
}
function _rowHTML(r, m, no) {
  const n = r.kind === 'cycle' ? ++no.n : null;
  const ok = _dimOk(r);
  const rail = r.rail === 'red' ? ' wi4-r-red' : r.late ? ' wi4-r-amb' : '';
  const ids = r.rtId != null ? ` data-rt="${_id(r.rtId)}"` : ` data-piece="${_id(r.pieceIds[0])}"`;
  let h = `<div class="wn5-row${rail}${_dc(ok && r.rowDim)}" data-key="${_esc(r.key)}" data-qi="${_esc(r.key)}"${ids}>`
    + `<div class="wn5-c-idx"><span class="wi4-no">${n == null ? '' : n}</span>`
    + (r.rtId != null ? `<button type="button" class="wi4-plane" title="Ενέργειες σειράς" aria-haspopup="menu" onclick="WN5.rowMenu(event, ${_id(r.rtId)})">${PLANE}</button>` : '')
    + '</div>'
    + _kathHTML(r, m, ok)
    + `<div class="wn5-asg">${r.tiles.map((t) => _boxHTML(t)).join('')}</div>`
    + _anodHTML(r, m, ok)
    + '</div>';
  for (const lm of r.local) h += _localHTML(r, lm, ok);
  if (r.miss) h += _missHTML(r);
  return h;
}
function _kathHTML(r, m, ok) {
  const s = r.kath;
  // «Χωρίς κάθοδο»: the dashed slot ends where ΠΑΛ. begins, and the «+» stays in the side's ΠΑΛ. cell, outside the box,
  // where every row has it (Figma 2011:10217)
  if (!s) return r.kind === 'cycle' ? `<div class="wn5-kspan wn5-gspan"><span class="wn5-gapbox">Χωρίς κάθοδο</span></div><div class="wn5-kpal wn5-gpal">${_plusHTML(r, 'KATHODOS')}</div>` : '<div class="wn5-kspan"><span class="wn5-none">—</span></div>';
  // The head of the side (its day, «Βέροια», the Veroia window) dims with the day of its loading stop.
  const hd = _dc(ok && s.headDim);
  const toDay = s.toDay && s.toDay !== s.day ? `<span class="wn5-dc2${hd}">→ ${_esc(_dl(s.toDay))}</span>` : '';
  // A VS waiting for a vehicle names its reference under the day (Figma H1 «Δευ 12/10 / VS-118», «VS-121 αργό»):
  // the queue card and the row then read as the same load.
  const ref = r.kind === 'unassigned' && r.vs && r.refs.length ? `<span class="wn5-dc2">${_esc(r.refs[0])}${r.late ? ' αργό' : ''}</span>` : '';
  return `<div class="wn5-kd">${_chipHTML(r, 'KATHODOS', `wi4-dc ${_chipCls(s.day, m.today)}${hd}`, _dl(s.day))}${toDay}${ref}</div>`
    + `<div class="wn5-fl">${_flHTML(s, ok, hd)}</div>`
    + `<div class="wn5-kto">${_ptsHTML(s.to, ok)}</div>`
    + `<div class="wn5-kpal">${_palHTML(s)}${_plusHTML(r, 'KATHODOS')}</div>`;
}
function _anodHTML(r, m, ok) {
  const s = r.anod;
  if (!s) return '<div class="wn5-aspan"><span class="wn5-none">—</span></div>';
  // «Κενό γύρισμα» is a free return to fill (a dashed slot); a partner cycle's «Μόνο κάθοδος · συνεργάτης» is a fact,
  // plain grey text (Figma H1 / 7745). The words are WN5L's; the screen only picks the look by the vehicle.
  if (s.gap) {
    const par = r.tiles.length > 0 && r.tiles.every((t) => t.type === 'par');
    // Figma H1: in the dashed slot «Κενό γύρισμα» reads darker than what follows it (look only: WN5L's text is split
    // at its first « · », nothing is added or dropped).
    const cut = par ? -1 : s.gap.text.indexOf(' · ');
    // One inner run: the slot is a flex box, and a bare « · …» beside the span would be its own item and lose its space.
    const txt = cut > 0 ? `<span><span class="wn5-gaph">${_esc(s.gap.text.slice(0, cut))}</span>${_esc(s.gap.text.slice(cut))}</span>` : _esc(s.gap.text);
    // a partner's «Μόνο κάθοδος» is a fact, not a slot (plain text), yet its ΑΝΟΔΟΣ still has the side's «+» in ΠΑΛ., as
    // every side of a cycle row (Figma 2011:10299 row 4); the «+» sits outside the dashed box (2011:10217)
    return `<div class="wn5-aspan wn5-gspan"><span class="${par ? 'wn5-gaptxt' : 'wn5-gapbox'}">${txt}</span></div><div class="wn5-apal wn5-gpal">${_plusHTML(r, 'ANODOS')}</div>`;
  }
  const n = s.from.length;
  const hd = _dc(ok && s.headDim);
  const end = r.end ? `<span class="wn5-end${_dc(ok && r.end.dim)}"><span class="wi4-l1">Βέροια<span class="wn5-endx"> · τέλος κύκλου</span></span><span class="wi4-l2">ως ${_esc(_dow(L().athensDay(r.end.by)))} ${_esc(L().athensTime(r.end.by))}</span></span>` : '';
  return `<div class="wn5-ad">${_chipHTML(r, 'ANODOS', `wi4-dc ${_chipCls(s.day, m.today)}${hd}`, _dl(s.day))}<span class="wn5-dc2${hd}">${n} ${n === 1 ? 'φορτίο' : 'φορτία'}</span></div>`
    + `<div class="wn5-afl">${_ptsHTML(s.from, ok)}</div>`
    + `<div class="wn5-ato">${_ptsHTML(s.to, ok)}${end}</div>`
    + `<div class="wn5-apal">${_palHTML(s)}${_plusHTML(r, 'ANODOS')}</div>`;
}
// ΦΟΡΤΩΣΗ of ΚΑΘΟΔΟΣ: «Βέροια» and its window stay together (owner 25/10); a loading the cycle makes BEFORE Veroia
// (WN5L vBefore, by the base's stop order) comes first, numbered with Veroia among the cell's loadings (Figma H1
// row 5 «1 Thessaloniki»); the ones after it follow. Veroia itself carries no number box: its word is its mark.
// This narrow cell names the place only, as Figma does: the clients of the side are in ΠΑΡΑΔΟΣΗ.
function _flHTML(s, ok, hd) {
  if (!s.veroia) return _ptsHTML(s.from, ok, null, true);
  const vh = `<span class="wn5-vh${hd}">Βέροια</span><span class="wn5-vtime${hd}">${_win(s.veroia.from, s.veroia.to)}</span>`;
  const k = Math.min(s.vBefore || 0, s.from.length);
  return _ptsHTML(s.from.slice(0, k), ok, 1, true) + vh + _ptsHTML(s.from.slice(k), ok, k + 2, true);
}
// start (a number) = number the points from it, boxes always shown (a cell that also has «Βέροια»); else WN5L's n and
// no box on a lone point (wi4 rule 6). placeOnly: the place without its client (ΦΟΡΤΩΣΗ of ΚΑΘΟΔΟΣ).
function _ptsHTML(pts, ok, start, placeOnly) {
  if (!pts.length) return '';
  const num = start == null ? (p) => (pts.length === 1 ? null : p.n) : (p, i) => start + i;
  const vis = _visPts();
  // «Ποτέ σβηστό ό,τι θέλει δουλειά» (rule 2036:7735): a late stop is never folded into «+N» while a slot holds an
  // on-time one — at ≤1600 (one slot) RT-T104's late 2nd stop would otherwise vanish into a grey «+1». The late ones
  // take the slots first; the shown and the folded keep the base's order and their own numbers.
  const idx = pts.map((p, i) => i);
  const shown = new Set([...idx.filter((i) => pts[i].late), ...idx.filter((i) => !pts[i].late)].slice(0, vis));
  const rest = idx.filter((i) => !shown.has(i));
  // More late stops than slots: the chip itself carries the amber, so a hidden late stop is still seen.
  const restLate = rest.some((i) => pts[i].late);
  const more = rest.length
    ? `<span class="wi4-more${restLate ? ' wn5-late' : ''}" title="${_esc(rest.map((i) => `${num(pts[i], i) || pts[i].n}. ${_ptName(pts[i])} · ${pts[i].from && pts[i].to ? pts[i].from + '–' + pts[i].to : '—'} · ${_pal(pts[i].pallets)}`).join('\n'))}"><b>+${rest.length}</b></span>`
    : '';
  return `<span class="wi4-pts wn5-pts">${idx.filter((i) => shown.has(i)).map((i) => _ptHTML(pts[i], num(pts[i], i), ok, placeOnly)).join('')}${more}</span>`;
}
// Who, then where (Figma H1 «Omega Market · Rentis»): the client in bold, the place in grey. Two runs that break
// between them, the «·» staying on the first line («ΠΕΛΑΤΗΣ Δ ·» / «Aspropyrgos»), never inside a name that fits. A waiting load's point
// IS its client (the board names no place for it, Ε-26): drawn once, never «ΠΕΛΑΤΗΣ Β · ΠΕΛΑΤΗΣ Β».
function _ptWho(p) {
  const cl = Array.isArray(p.clients) ? p.clients : [];
  return cl.length && !(cl.length === 1 && cl[0] === p.name) ? cl.join(', ') : null;
}
function _ptName(p) { const who = _ptWho(p); return who ? `${who} · ${p.name}` : p.name; }
// Each point with its own day: a delivery of Tuesday stays bold until Tuesday ends, even if its hour passed.
function _ptHTML(p, n, ok, placeOnly) {
  const who = placeOnly ? null : _ptWho(p);
  return `<span class="wi4-pt wn5-pt${p.late ? ' wn5-late' : ''}${_dc(ok && p.dim && !p.late)}" data-stop="${_id(p.stopId)}">`
    + (n == null ? '' : `<span class="wi4-pt-n">${n}</span>`)
    + `<span class="wi4-l1">${who ? `<span class="wn5-who">${_esc(who)}<span class="wn5-city">&nbsp;·</span></span> <span class="wn5-city">${_esc(p.name)}</span>` : _esc(p.name)}</span>`
    + `<span class="wi4-l2${p.late ? ' wi4-t-amb' : ''}">${_win(p.from, p.to)} · ${_esc(_pal(p.pallets))}</span></span>`;
}
// The day chip of a side. On a cycle row it is a button: T16, it opens the date panel Δ4 of its side
// (Figma 2011:8858 / 2053:7837). The classes stay those of T5/T6 (dim, «σήμερα»); other rows keep a plain chip.
function _chipHTML(r, side, cls, label) {
  if (r.kind !== 'cycle' || r.rtId == null) return `<span class="${cls}">${_esc(label)}</span>`;
  return `<button type="button" class="${cls}" data-act="date" data-side="${side === 'ANODOS' ? 'ANODOS' : 'KATHODOS'}" title="Αλλαγή ημερομηνίας">${_esc(label)}</button>`;
}
// T13: «+» on hover of the side (Figma 2011:10022); data-side is the API's ASCII side, the label is Greek. Only on a
// cycle row (an unassigned row has no cycle to add to), also on an empty side so a first load can go in.
function _plusHTML(r, side) {
  if (r.kind !== 'cycle' || r.rtId == null) return '';
  return `<button type="button" class="wn5-plus" data-act="plus" data-side="${side === 'ANODOS' ? 'ANODOS' : 'KATHODOS'}" aria-label="Πρόσθεσε στην ${side === 'ANODOS' ? 'ΑΝΟΔΟ' : 'ΚΑΘΟΔΟ'}" title="Πρόσθεσε">+</button>`;
}
function _palHTML(s) {
  return `<span class="wi4-pal${s.over ? ' over' : ''}"${s.over ? ` title="υπέρβαση ${_esc(_pal(s.over))}"` : ''}>${_esc(String(s.pallets).replace('.', ','))}</span>`;
}
function _boxHTML(t) {
  // «ΠΡΟΣ ΑΝΑΘΕΣΗ» opens the assignment window (wired by the actions file, Task T12).
  if (t.type === 'un') return '<button type="button" class="wi4-box un" data-act="assign"><span class="wi4-l1">ΠΡΟΣ ΑΝΑΘΕΣΗ</span></button>';
  // The tile is 28px high: a long name is cut by the wi4 rule with a visible «…» and stays whole in title.
  return `<span class="wi4-box ${t.type}"><span class="wi4-l1${t.type === 'own' ? ' wi4-plate' : ''}" title="${_esc(t.line1)}">${_esc(t.line1)}</span>`
    + `<span class="wi4-l2${t.missing ? ' wn5-missing' : ''}" title="${_esc(t.line2)}">${_esc(t.line2)}</span></span>`;
}
// «↳ Φόρτωση με τοπικό» under its row (Figma 2011:7745 row 3): who, when, for which stop. It dims with the stop it
// serves (the base's flag of that stop): the board carries no flag of its own for a local move.
function _localHTML(r, lm, ok) {
  const time = [lm.time_from, lm.time_to].filter(Boolean).map((t) => String(t).slice(0, 5)).join('–');
  return `<div class="wn5-sub${_dc(ok && lm.dim)}" data-qi="${_esc(r.key)}" data-key="local:${_id(lm.local_move_id)}" data-stop="${_id(lm.stopId)}">`
    + '<span class="wn5-c-idx"></span>'
    + `<span class="wn5-sub-t">↳ <b>Φόρτωση με τοπικό</b> · ${_esc(lm.driver || 'χωρίς οδηγό')} · ${_esc(_dl(lm.move_date))}${time ? ' ' + _esc(time) : ''}`
    + (lm.pickup
      // a pickup (Figma 2011:8305): what is loaded there → Βέροια, then the delivery it is for (none named when the
      // leg unloads at Veroia or off this cycle — never the pickup's own place after «για»)
      ? ` · ${_esc(lm.pickup.who ? `${lm.pickup.who}, ${lm.pickup.place}` : lm.pickup.place)} → Βέροια · ${_esc(_pal(lm.pickup.pallets))}`
        + (lm.forStops && lm.forStops.length ? ` · για ${lm.forStops.map((f) => `${_esc(f.name)}${f.n ? ` (στάση ${f.n})` : ''}`).join(', ')}` : '')
      : `${lm.stopName ? ` · για ${_esc(lm.stopName)}${lm.stopN ? ` (στάση ${lm.stopN})` : ''}` : ''}`)
    // T17: the cancel of THIS loading (no request_id); the id is the board's local_move_id
    + `<button type="button" class="wi4-link wn5-sub-x" data-act="local-cancel" data-lm="${_id(lm.local_move_id)}">Ακύρωση</button></span></div>`;
}
// ═══ end of rows ═══

// ═══ ✈ row menu (Figma 2011:8858) ═══
// Each Task appends its line to WN5.MENU_ITEMS; `order` keeps the Figma order whatever the order of the Tasks:
// 10 Άνοιγμα παραγγελιών · 20 Ανάθεση · 30 Νέα παραγγελία · 40 Φόρτωση με τοπικό · 50 Σπάσιμο · 60 Εκτύπωση ·
// 70 Αντιγραφή πινακίδων · 90 Καθαρισμός (danger, after a separator).
function rowMenu(ev, rtId) {
  try { if (ev && ev.stopPropagation) ev.stopPropagation(); } catch (_) {}
  _closeMenu();
  if (!active() || !ID_RE.test(String(rtId))) return;
  const row = _rowOf(rtId);
  if (!row) return;
  const items = WN5.MENU_ITEMS.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const el = document.createElement('div');
  el.id = 'wn5-menu';
  el.className = 'wn5-menu';
  el.setAttribute('role', 'menu');               // core/ui.js: ←/→ never change the week under an open menu
  el.setAttribute('data-wn5-overlay', 'menu');
  el.innerHTML = `<div class="wn5-m-hd"><span class="wi4-l1">${_esc(_menuTitle(row))}</span><span class="wi4-l2">${_esc(_menuSub(row))}</span></div>`
    + items.map((it) => (it.danger ? '<div class="wn5-m-sep" role="separator"></div>' : '') + _menuItemHTML(it, rtId)).join('');
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-item]');
    if (!b) return;
    const id = b.getAttribute('data-item');
    if (b.getAttribute('aria-haspopup') === 'menu') { _subToggle(el, id); return; }   // a «›» line opens its submenu
    const it = _menuFind(items, id);
    _closeMenu();
    if (it && typeof it.run === 'function') { try { it.run(Number(rtId), e); } catch (err) { _logErr(err, 'weekly natl v5: menu ' + it.id); } }
  });
  // → opens the submenu of a «›» line, ← closes it and goes back to its line (Figma 2011:8858). Stopped here, so the
  // week never moves under an open menu (core/ui.js also checks role=menu).
  el.addEventListener('keydown', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('[data-item]') : null;
    if (!b) return;
    if (e.key === 'ArrowRight' && b.getAttribute('aria-haspopup') === 'menu') { e.preventDefault(); e.stopPropagation(); _subToggle(el, b.getAttribute('data-item'), true); }
    else if (e.key === 'ArrowLeft' && b.closest('[data-sub]')) {
      e.preventDefault(); e.stopPropagation();
      const id = b.closest('[data-sub]').getAttribute('data-sub');
      _subToggle(el, id, false);
      const pb = el.querySelector(`[data-item="${id}"]`);
      if (pb) pb.focus();
    }
  });
  // Figma 2011:8858: the menu opens to the right of the ✈, its top on the row's top.
  const btn = ev && ev.currentTarget && ev.currentTarget.getBoundingClientRect ? ev.currentTarget : null;
  const a = btn ? btn.getBoundingClientRect() : { right: 120, top: 120 };
  const rowEl = btn && btn.closest ? btn.closest('.wn5-row') : null;
  const top = rowEl ? rowEl.getBoundingClientRect().top : a.top;
  el.style.left = Math.max(8, Math.min(a.right + 4, window.innerWidth - el.offsetWidth - 8)) + 'px';
  el.style.top = Math.max(8, Math.min(top, window.innerHeight - el.offsetHeight - 8)) + 'px';
  const first = el.querySelector('[role="menuitem"]');
  if (first) first.focus();
}
// One line per Figma item (2011:8858, 8 lines under the head): a line with `children` is «label ›» and its submenu (role=menu,
// hidden until opened), so the same label is never drawn twice; `count` is the number on the right.
function _menuItemHTML(it, rtId) {
  let n = null;
  if (typeof it.count === 'function') { try { n = it.count(rtId); } catch (err) { _logErr(err, 'weekly natl v5: menu count ' + it.id); } }
  const kids = Array.isArray(it.children) && it.children.length > 0;
  const tail = (it.sub ? `<span class="wi4-l2">${_esc(it.sub)}</span>` : '') + (Number.isFinite(n) ? `<span class="wn5-m-n">${n}</span>` : '')
    + (kids ? '<span class="wn5-m-ar" aria-hidden="true">›</span>' : '');
  let h = `<button type="button" role="menuitem" class="wn5-m-i${it.danger ? ' danger' : ''}" data-item="${_esc(it.id)}"${kids ? ' aria-haspopup="menu" aria-expanded="false"' : ''}>`
    + `<span class="wi4-l1">${_esc(it.label)}</span>${tail}</button>`;
  if (kids) {
    h += `<div class="wn5-m-sub" role="menu" data-sub="${_esc(it.id)}" hidden>`
      + it.children.map((c) => `<button type="button" role="menuitem" class="wn5-m-i" data-item="${_esc(c.id)}"><span class="wi4-l1">${_esc(c.label)}</span></button>`).join('')
      + '</div>';
  }
  return h;
}
function _menuFind(items, id) {
  for (const it of items) {
    if (it.id === id) return it;
    for (const c of it.children || []) if (c.id === id) return c;
  }
  return null;
}
// Open (true) / close (false) / toggle one submenu; any other open one closes. The flyout sits beside its line.
function _subToggle(menu, id, open) {
  const sub = menu.querySelector(`[data-sub="${id}"]`);
  const btn = menu.querySelector(`[data-item="${id}"]`);
  if (!sub || !btn) return;
  const on = open === undefined ? sub.hidden : open;
  for (const o of menu.querySelectorAll('[data-sub]')) {
    if (o === sub) continue;
    o.hidden = true;
    const ob = menu.querySelector(`[data-item="${o.getAttribute('data-sub')}"]`);
    if (ob) ob.setAttribute('aria-expanded', 'false');
  }
  sub.hidden = !on;
  btn.setAttribute('aria-expanded', String(on));
  if (on) {
    sub.style.top = btn.offsetTop + 'px';
    const f = sub.querySelector('[role="menuitem"]');
    if (f) f.focus();
  }
}
// The labels of the ✈ menu of a row, in order, «›» lines with their children — what the rigs hold to Figma.
function _menuItems(rtId) {
  return WN5.MENU_ITEMS.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((it) => ({ id: it.id, label: it.label, children: (it.children || []).map((c) => c.label) }));
}
function _menuTitle(row) {
  const c = _cycleOf(row.rtId);
  const who = (c && (c.truck || c.partner)) || (c && c.code) || '';
  return who + (row.cycleNo ? ` · κύκλος ${row.cycleNo.m > 1 ? `${row.cycleNo.n}/${row.cycleNo.m}` : '1'}` : '');
}
function _menuSub(row) {
  const s = row.kath || row.anod;
  if (!s || !s.day) return '';
  return _dl(s.day) + (row.kath && row.kath.veroia ? ` · Βέροια ${row.kath.veroia.from}–${row.kath.veroia.to}` : '');
}
function _closeMenu() { const m = document.getElementById('wn5-menu'); if (m) m.remove(); }
// Ε-22: only the cycle's truck and trailer — nothing of the hub, nothing of a VS (Veroia is never shown to a
// client). A partner's cycle has no plates on the board: copyPlates says so instead of copying nothing.
function copyPlatesOf(rtId) {
  const c = _cycleOf(rtId);
  const text = c && typeof platesText === 'function' ? platesText(c.truck, c.trailer, null) : '';
  return typeof copyPlates === 'function' ? copyPlates(text) : false;
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
  // The window or the sidebar changed #content's width: «Ενημερώθηκε» is measured again (_fitUpd).
  if (content && typeof ResizeObserver === 'function') new ResizeObserver(() => { if (active()) _fitUpd(); }).observe(content);
  // A click outside the open ✈ menu closes it (capture: before any other handler acts on the click).
  document.addEventListener('click', (e) => {
    if (!document.getElementById('wn5-menu')) return;
    if (e.target && e.target.closest && e.target.closest('#wn5-menu, .wi4-plane')) return;
    _closeMenu();
  }, true);
  document.addEventListener('keydown', _onKey, true);
  // One stop or two per point column (_visPts) is chosen at paint: crossing 1600px repaints from the board on hand.
  try {
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_MQ) : null;
    if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', () => { if (active() && _board && document.querySelector('#content .wn5')) paint(); });
  } catch (_) { /* the layout stays as painted: wrapped, never cut */ }
}
function _onKey(e) {
  if (!active() || !document.querySelector('#content .wn5')) return;
  if (e.key === 'Escape' && document.getElementById('wn5-menu')) { _closeMenu(); e.preventDefault(); e.stopPropagation(); return; }
  // «/» focuses the search, as on the Weekly International — never while typing in a field.
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey
      && !(e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]'))) {
    e.preventDefault();
    searchFocus();
  }
}
function _cleanup() {
  try { if (typeof WN5Act !== 'undefined') WN5Act.closeAll(); } catch (_) {}   // no dialog survives the page it belongs to
  try { document.body.classList.remove('wn5-on'); } catch (_) {}
  // Every body-level overlay of v5 carries data-wn5-overlay: one rule removes them all when the board leaves.
  try { document.querySelectorAll('body > [data-wn5-overlay]').forEach((el) => el.remove()); } catch (_) {}
}

// ═══ Search (Pantelis/owner 21/10, Figma 2036:7752) ═══
// ONE rule with the Weekly boards: fhSearchNorm / fhSearchBlob of core/form-helpers.js. Rows that do not match fade
// to .35, matches are raised — nothing is hidden while something matches; with no match at all the table hides until
// «Καθάρισμα ×» (Δ12 tile 6, Ε-29). Day heads, the notices strip, the ΕΠΟΜΕΝΑ band and the Veroia line
// carry no data-qi and never fade; a «↳» sub-row carries its row's key and goes with it.
const SEARCH_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
function _searchHTML(known) {
  return `<label class="wi4-search wn5-search">${SEARCH_ICON}<input id="wn5-search" type="text" placeholder="Αναζήτηση" autocomplete="off" aria-label="Αναζήτηση στον πίνακα"`
    + `${known ? '' : ' disabled'} value="${_esc(_qRaw)}" oninput="WN5.search(this.value)" onkeydown="WN5._searchKey(event)">`
    + '<span id="wn5-search-n" class="wi4-search-n"><span class="wi4-key">/</span></span></label>';
}
function _buildIndex(m) {
  _qi.clear();
  if (!m || typeof fhSearchBlob !== 'function') return;
  for (const d of m.days) for (const r of d.rows) _qi.set(r.key, fhSearchBlob(L().searchParts(r)));
}
function _applySearch(scroll) {
  const root = document.querySelector('#content .wn5');
  if (!root) return;
  const nq = _qRaw && typeof fhSearchNorm === 'function' ? fhSearchNorm(_qRaw) : '';
  const hits = [];
  root.querySelectorAll('[data-qi]').forEach((el) => {
    const hit = !!nq && (_qi.get(el.getAttribute('data-qi')) || '').includes(nq);
    el.classList.toggle('wi4-dim', !!nq && !hit);
    el.classList.toggle('wi4-sm', hit);
    if (hit && el.classList.contains('wn5-row')) hits.push(el);
  });
  if (_sIdx >= hits.length) _sIdx = 0;
  const n = document.getElementById('wn5-search-n');
  // Figma 2036:7902: «1/2» in the same key cap as «/». No match keeps the «/» cap (Δ12 2069:10409, never «0/0» and
  // never «—», which Δ12 keeps for an unknown count); the strip below says it in words.
  if (n) n.innerHTML = `<span class="wi4-key">${hits.length ? `${_sIdx + 1}/${hits.length}` : '/'}</span>`;
  const none = document.getElementById('wn5-snone');
  const empty = !!nq && !hits.length;
  // Δ12 tile 6 (approved 22/10, Ε-29): with no match the table hides until «Καθάρισμα ×»; the line says why. A
  // query with matches never hides anything (faded at .35 only).
  const rowsEl = document.getElementById('wn5-rows');
  if (rowsEl) rowsEl.hidden = empty;
  // the column heads go with the table (2069:10269: nothing under the strip)
  const cols = root.querySelector('.wn5-cols');
  if (cols) cols.hidden = empty;
  if (none) {
    none.hidden = !empty;
    none.innerHTML = empty
      ? `<b>ΑΝΑΖΗΤΗΣΗ</b><span class="wn5-snone-t"> · Κανένα αποτέλεσμα για «${_esc(_qRaw)}» στη W${_esc(String(window.WNATL && window.WNATL.week))}</span> <button type="button" class="wi4-link" onclick="WN5.search('')">Καθάρισμα ×</button>`
      : '';
  }
  if (scroll && hits[_sIdx]) hits[_sIdx].scrollIntoView({ block: 'center' });
}
function search(q) {
  _qRaw = String(q == null ? '' : q);
  _sIdx = 0;
  const inp = document.getElementById('wn5-search');
  if (inp && inp.value !== _qRaw) inp.value = _qRaw;
  _applySearch(true);
}
function searchFocus() {
  const inp = document.getElementById('wn5-search');
  if (inp && !inp.disabled) { inp.focus(); inp.select(); }
}
function _searchKey(ev) {
  if (!ev) return;
  if (ev.key === 'Enter') {
    ev.preventDefault();
    const n = document.querySelectorAll('#content .wn5 .wn5-row.wi4-sm').length;
    if (!n) return;
    _sIdx = (_sIdx + 1) % n;
    _applySearch(true);
  } else if (ev.key === 'Escape') {
    // stop here: core/ui.js would otherwise take the same Esc for the modal
    ev.preventDefault();
    ev.stopPropagation();
    search('');
    if (ev.target && ev.target.blur) ev.target.blur();
  }
}

// ═══ Notices strip (Figma 2011:7745 «ΕΙΔΟΠΟΙΗΣΕΙΣ») ═══
// The text of a notice is the DB's (072 plan_h_notice writes it in Greek, decision 25): shown as it is, the screen
// writes no text per kind (principle 3). «Σημείωσα ✓» marks every notice on screen read — one POST per notice, body
// {}, sent once per press (planFetch never re-sends), stopping at the first «no». Until day L the Worker answers 409
// writes_closed: its message is shown, the notices stay, and the button stays off for the session (Ε-6).
function _noticesHTML(m) {
  if (!m || !m.notices.length) return '';
  const off = _noteBusy || !!_closed;
  return `<div id="wn5-notices" class="wn5-notes" role="status"><b class="wn5-notes-h">ΕΙΔΟΠΟΙΗΣΕΙΣ<span class="wn5-notes-n"> · ${m.notices.length}</span></b>`
    + `<span class="wn5-notes-l">${m.notices.map((x) => `<span class="wn5-note" data-id="${_id(x.id)}"> · ${_esc(x.message)}</span>${_noteBy(x)}`).join('')}</span>`
    + `<button type="button" id="wn5-note-read" class="wi4-link"${off ? ' disabled' : ''}${_closed ? ` title="${_esc(_closed.message)}"` : ''} onclick="WN5._noteRead()">Σημείωσα ✓</button></div>`;
}
// «(Π.Κ. 08:12)» after each text (Figma 2011:7745): who wrote it and when, from the notice row itself (created_by,
// created_at). Beside the text, never inside it: the text stays the DB's, as it is.
function _noteBy(x) {
  const who = x.created_by ? (typeof userDisplayName === 'function' ? userDisplayName(x.created_by) : x.created_by) : '';
  const at = x.created_at ? L().athensTime(x.created_at) : '';
  const t = [who, at].filter(Boolean).join(' ');
  return t ? `<span class="wn5-note-by"> (${_esc(t)})</span>` : '';
}
function _paintNotices() {
  const el = document.getElementById('wn5-notices');
  if (el && _m) el.outerHTML = _noticesHTML(_m);
  _noteStrip();
}
// One strip mechanism for every /plan answer (T11): the answer that stopped «Σημείωσα ✓» goes through
// WN5Act.strip (the 409 writes_closed of the button is the Ε-6 preview, a 422 a refusal, the Worker's words as they
// are). Drawn again after every paint of the strip — the answer stays until the week changes — in its T8 place,
// just before the button.
function _noteStrip() {
  const host = document.getElementById('wn5-notices');
  if (!host || !_noteErr || typeof WN5Act === 'undefined') return;
  const el = WN5Act.strip(host, _noteErr);
  const btn = document.getElementById('wn5-note-read');
  if (el && btn && btn.parentNode === host) host.insertBefore(el, btn);
}
async function _noteRead() {
  if (_noteBusy || _closed || !active() || !_m) return;
  const ids = _m.notices.map((x) => x.id).filter((id) => ID_RE.test(String(id)));
  if (!ids.length) return;
  _noteBusy = true;
  _noteErr = null;
  _paintNotices();
  let again = false;
  for (const id of ids) {
    try {
      await planFetch('POST', `/plan/notices/${id}/read`, { body: {} });
      again = true;
    } catch (e) {
      if (e && e._sessionGone) { _noteBusy = false; return; }
      _noteErr = e;
      if (e && e.kind === 'closed') markClosed(e);
      // notice_gone: someone else marked it first — the board is read again, so the strip says what is left
      if (e && e.code === 'notice_gone') again = true;
      break;
    }
  }
  _noteBusy = false;
  if (again) await reload('notices'); else _paintNotices();
}

// ═══ Exports ═══
const WN5 = {
  _broken: false,
  active,
  render,
  paint,
  reload,
  findAfterReuse,
  snapshot,
  state,
  markClosed,
  weekParam,
  rowMenu,
  copyPlates: copyPlatesOf,
  search,
  searchFocus,
  _searchKey,
  _noteRead,
  MENU_ITEMS: [
    // T18: the orders of the cycle with their number (Figma 2011:8858 «Άνοιγμα παραγγελιών 4»); delete lives in the
    // order card only (owner 19/10)
    { id: 'orders', order: 10, label: 'Άνοιγμα παραγγελιών', count: (rtId) => WN5Act.cycleOrderCount(rtId), run: (rtId) => WN5Act.cycleOrders(rtId) },
    // T12: the same Δ1 window as the red box and ΕΠΟΜΕΝΑ; on a cycle it changes the vehicle (PATCH /plan/rt/:id)
    { id: 'assign', order: 20, label: 'Ανάθεση / αλλαγή φορτηγού ή συνεργάτη', run: (rtId) => WN5Act.assign(null, { entry: 'menu', rtId }) },
    // T20: the same short form as the «+» of a leg (S-45): target = this cycle's side, day/Veroia from the cycle
    { id: 'new-order', order: 30, label: 'Νέα παραγγελία σε αυτό το σκέλος', children: [
      { id: 'new-order-k', label: 'Κάθοδος', run: (rtId) => WN5Form.openOrder({ side: 'KATHODOS', rtId }) },
      { id: 'new-order-a', label: 'Άνοδος', run: (rtId) => WN5Form.openOrder({ side: 'ANODOS', rtId }) }] },
    // T17: the stop is chosen inside the window (its day is the stop's day, 072:2283)
    { id: 'local', order: 40, label: 'Φόρτωση με τοπικό', sub: 'οδηγός · ημέρα · στάση ›', run: (rtId) => WN5Act.local(null, rtId) },
    // T14: the KATHODOS deliveries go back to Veroia for splitting (S-69, Figma 2011:8858 note)
    { id: 'split-hub', order: 50, label: 'Σπάσιμο παραγγελιών', sub: '→ Βέροια', run: (rtId) => WN5Act.move({ rt_id: rtId, side: 'KATHODOS' }, { direct: 'wait' }) },
    { id: 'plates', order: 70, label: 'Αντιγραφή πινακίδων', run: (rtId) => copyPlatesOf(rtId) },
    // T15: last and red (Figma 2011:8858); owner + dispatcher on the Worker, but visible to all (Δ12 tile 8)
    { id: 'clear', order: 90, label: 'Καθαρισμός ανάθεσης', sub: 'κάθοδος + άνοδος', danger: true, run: (rtId) => WN5Act.clear(rtId) },
  ],
  // The board HTML of a model, for tests/wn5-board-html.test.js (pure: model in, string out).
  _html: (m) => _boardHTML(m, true),
  _menuItems,
  _dayTog,
  _qMore,
  _week,
  _switch,
};
window.WN5 = WN5;
})();
