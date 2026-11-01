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
// The short month of a range that has no room for the long one (whole-frame r2, 2120:7829): «26 Σεπ – 2 Οκτ».
const MONTH_SHORT = Object.freeze(['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']);
// Two stops per point column at 1920 (Figma 2011:7745: two ~178px stops), the rest behind «+N». At ≤1600 (1440 with
// the sidebar) a point column is ~240px: two stops side by side wrapped every name and doubled the row height, so it
// shows ONE whole stop + «+N» (fidelity T5 r1). Decided at paint (the same query as the wn5 CSS block); a resize
// across 1600 repaints once (_install), so a hidden stop never hides behind a CSS rule the rigs cannot see.
const NARROW_MQ = '(max-width:1600px)';
function _visPts() {
  try { return typeof window.matchMedia === 'function' && window.matchMedia(NARROW_MQ).matches ? 1 : 2; } catch (_) { return 2; }
}
// Inline SVG with currentColor: core/icons.js has no plane, and a colour literal here would break the ratchet.
// Figma 2011:9279 «αντιγραφή πινακίδων»: the 13px copy glyph (two squares), stroke 1.08 at that size.
const COPY = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const PLANE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';
// Figma 2011:10090 «icon/plus»: 11px, stroke 1.1 at that size, in the «+» box's colour (whole-frame r3, not a text glyph).
const PLUS = '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 2.29v6.42M2.29 5.5h6.42"/></svg>';
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
let _idsErr = null;      // GET /plan/lookups failed: place names cannot be read (live fix 1, 28/10) — shown, never «—» in silence
let _idsOk = false;      // the catalogue is loaded: only then are ids named (a pending one is not «unknown id»)
let _idsFailAt = 0;      // when it last failed: asked again after 60 s or on the user's ↻, never on every reload
let _idsForce = false;   // the user's ↻ (reload('user')) asks again at once
let _stale = null;       // a save landed but the board read after it failed: {at} — the rows show the state BEFORE it (F11)
// 092 (F45): the international's Veroia day of each VS at a hub stop of the board (GET /plan/vs-state cross_dock_date),
// so a truck at Veroia on another day than the VS is marked on its row (coordinator 1/11: never two numbers in silence)
let _vsDays = new Map();  // order_id → { cd, first } ('YYYY-MM-DD' | null); key absent = not read, or the base is before 092
let _hubVs = new Map();   // rt_stop id → { day, orders: [order_id] } of the VS legs there (from the last board)
let _vsRead = 'ok';       // the read of those days: 'loading' | 'ok' | 'err' (the leg form says why a field is missing)
let _vsPending = null;    // that read in flight (settles, never rejects): the leg form waits for it (vsDaysSettled)
// The reload reasons of a write that the base has CONFIRMED (a 200): if the read after one fails, the screen must not
// look as if the save did not happen (live F11, 28/10: a 503 after «Ανάθεση» left «ΠΡΟΣ ΑΝΑΘΕΣΗ» on screen and invited
// a second assignment). Every caller of WN5.reload after a confirmed write uses one of these.
const SAVE_RELOADS = Object.freeze(['save', 'handover', 'order-saved', 'segment-removed']);
let _closed = null;      // the first writes_closed answer of the session (Ε-6; set by markClosed)
let _qAll = false;       // «Όλα N ▾» of the ΕΠΟΜΕΝΑ band
let _qRaw = '';          // the search text, memory only; cleared when the week changes (Ε-25)
let _sIdx = 0;           // the match Enter is on («1/2»)
const _qi = new Map();   // row key → search text of the last paint (fhSearchBlob: the fields of a row kept apart)
let _noteBusy = false;   // «Σημείωσα ✓» in flight: one press at a time
let _noteErr = null;     // the answer that stopped the last «Σημείωσα ✓» (shown in the strip until the week changes)
let _notesOpen = false;  // the notices of the other orders unfolded under the strip (owner 31/10); closed on a week change
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
// ═══ Day L (F5 FE-2, owner Q-10): «Παλιά προβολή» only for weeks before L ═══
// The old board is history from day L: the base refuses its INSERTs (plan:legacy_frozen) and the Worker its edits
// except the owner's. So a «Παλιά προβολή» choice (tms_wn5 = '0') holds only for a week whose Saturday is before
// the base's cutover_day; a week from L on is v5 for everyone the flag opens it to. The day comes from the base
// (core/plan-config.js), never from a date in this file (principle 3). Until PlanConfig answers 'after' — 'before',
// 'unknown', a Worker without the route, the file not loaded — the choice holds as today: the old board is a READ
// path, its writes are refused below the screen, and an unknown day never traps a user in one view. An 'unknown'
// answer is said on the v5 bar («Η ημέρα μετάβασης δεν διαβάστηκε»), never silent (principle 1).
let _cfg = null, _cfgAt = 0, _cfgBusy = false, _cfgForce = false;
// At most one ask a minute, whatever the state. F25 (live 28/10): an 'after' is asked too — its DAY can move (079:
// 31/10 → 24/10) and a tab opened before kept the old day until a full reload. WHEN an 'after' is old enough to be
// read again is PlanConfig's rule (AFTER_RECHECK_MS, one source); the board asks {recheck: true} and waits for that
// answer, at once ({recheck: 'now'}) on the user's ↻. A moved day repaints the page and says so; a recheck that fails
// keeps the day read before and the bar says at once that it was not read again (principle 1: never silently stale).
const CFG_RETRY_MS = 60 * 1000;
function _dm(day) { return Number(day.slice(8)) + '/' + Number(day.slice(5, 7)); }   // '2026-10-31' → «31/10»
function _afterL(sat) { return !!_cfg && _cfg.state === 'after' && !!_cfg.cutoverDay && typeof sat === 'string' && sat >= _cfg.cutoverDay; }
function _recheckNoteHTML() {
  const on = !!(_cfg && _cfg.state === 'after' && _cfg.recheckErr && _cfg.cutoverDay);
  return `<span class="wi4-range" data-old-view="recheck"${on ? ` title="${_esc(String(_cfg.recheckErr.message || ''))}"` : ' hidden'}>`
    + (on ? `Η ημέρα μετάβασης δεν ξαναδιαβάστηκε · ισχύει η ${_esc(_dm(_cfg.cutoverDay))}` : '') + '</span>';
}
// The note follows every answer in place — on and off — without repainting the board under a click
function _recheckNote() {
  try {
    const el = document.querySelector('.wn5-bar [data-old-view="recheck"]');
    if (!el) return;
    // compared by what is seen (shown, words), not by markup: the browser writes «hidden» back as hidden=""
    const box = document.createElement('div');
    box.innerHTML = _recheckNoteHTML();
    const nu = box.firstElementChild;
    if (el.hidden === nu.hidden && el.textContent === nu.textContent) return;
    el.replaceWith(nu); _fitUpd(); _topFit();
  } catch (_) {}
}
function _cfgKick() {
  if (_cfgBusy || typeof PlanConfig === 'undefined') return;
  const after = !!_cfg && _cfg.state === 'after';
  if (!_cfgForce && Date.now() - _cfgAt < CFG_RETRY_MS) return;
  const force = _cfgForce;
  _cfgForce = false;
  _cfgBusy = true;
  // ↻: day L read again at once, whatever is kept ('now' for an 'after', fresh for the rest). Otherwise the board waits
  // for PlanConfig's re-read of an aged 'after' ({recheck: true}); other screens get the kept one at once.
  PlanConfig.load(force ? { recheck: 'now', fresh: true } : after ? { recheck: true } : undefined).then((r) => {
    const was = _cfg && _cfg.state;
    const wasDay = _cfg && _cfg.cutoverDay;
    _cfg = r; _cfgAt = Date.now();
    // Paint again only when the answer changes what THIS week shows: it became 'after' and the week is ≥ L (a stored
    // old view gives way to v5, the bar loses its button), or it became 'unknown' on the v5 board (the bar says so),
    // or day L itself moved (F25: the bar, the old-view choice and the «before L» line all read it).
    // A week before L keeps what it painted: no second load of the old board.
    let sat = null;
    try { sat = weekParam(window.WNATL.week); } catch (_) { /* no week: nothing to repaint */ }
    const now = r && r.state;
    const moved = was === 'after' && now === 'after' && wasDay !== r.cutoverDay;
    const page = typeof currentPage !== 'undefined' && currentPage === 'weekly_natl' && typeof window.renderWeeklyNatl === 'function';
    if (page) _recheckNote();
    // a failed (or recovered) recheck alone repaints nothing but its bar line (_recheckNote): a repaint in the middle of
    // a click would replace the row, close a menu
    if (!page || !(moved
      || (now !== was && sat && ((now === 'after' && _afterL(sat)) || (now === 'unknown' && _sat === sat && _decide() === 'v5'))))) return;
    // F22 (live 28/10): the v5 board of this week already on screen only needs its bar again — a repaint from the board
    // in hand, not a second GET /plan/board (every open read the board twice ~40 ms apart, on a base that was timing
    // out). A render in flight paints the new bar itself when its board lands. The «moved» toast is said only here,
    // on the page repainted now. A throw lands in the log and the old board, never in an unhandled rejection.
    try {
      if (moved && typeof toast === 'function') toast(`Η ημέρα μετάβασης εθνικών άλλαξε: ${_dm(wasDay)} → ${_dm(r.cutoverDay)} — η προβολή ενημερώθηκε`, 'warn');
      if (_sat === sat && !WN5._broken && document.querySelector('#content > .wn5') && (_decide() === 'v5' || _afterL(sat))) { if (!paint()) _fallback(); }
      else window.renderWeeklyNatl();
    } catch (e) { _logErr(e, 'weekly natl v5: repaint after day L'); _fallback(); }
  }, () => { _cfgAt = Date.now(); }).finally(() => {   // load() never rejects; belt and braces
    _cfgBusy = false;
    // a ↻ pressed while this ask ran is served now, not by whatever calls active() next (a click it would repaint under)
    if (_cfgForce) _cfgKick();
  });
}
// The old-view choice is set aside for a week ≥ L: v5 is what the flag would show without the choice.
function _oldViewBlocked() {
  if (_ls('tms_wn5') !== '0') return false;
  const lg = typeof WI4 !== 'undefined' ? WI4 : null;
  if (!lg || lg.v2Decide({ flag: _flagRaw(), pilot: _pilot(), user: _user(), optIn: null }) !== 'v4') return false;
  _cfgKick();
  let sat = null;
  try { sat = weekParam(window.WNATL.week); } catch (_) { return false; }
  return _afterL(sat);
}
function active() {
  try {
    if (WN5._broken === true) return false;
    if (typeof currentPage === 'undefined' || currentPage !== 'weekly_natl') return false;
    if (_decide() === 'v5') { _cfgKick(); return true; }
    return _oldViewBlocked();
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
function _onWeekChange() { _closedDays.clear(); _qAll = false; _qRaw = ''; _sIdx = 0; _noteErr = null; _stale = null; _notesOpen = false; }

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
  // The board names places by id only (074a nat_from / nat_to): their names come from the ONE catalogue of /plan
  // (PlanIds, GET /plan/lookups), read beside the board — once per session when it succeeds, asked again at the next
  // open when it failed (decision 44: no automatic retry). Live 28/10: without it every place read «—».
  // A failure is not re-asked on every render (each save reloads the board): one try per 60 s, or the user's ↻ —
  // else one dead route would write an app_errors row per act (decision 44: no automatic retry).
  const retry = !_idsOk && (_idsForce || !_idsFailAt || Date.now() - _idsFailAt > 60000);
  _idsForce = false;
  let idsDone = _idsOk || !retry;
  const ids = !retry ? Promise.resolve(null)
    : (typeof PlanIds !== 'undefined' && typeof PlanIds.load === 'function' ? PlanIds.load() : Promise.resolve({ ok: false, err: { message: 'core/plan-ids.js missing' } }))
      .catch((e) => ({ ok: false, err: e }))
      .then((r) => {
        idsDone = true;
        _idsOk = !!(r && r.ok);
        _idsErr = _idsOk ? null : ((r && r.err) || { message: 'άγνωστο σφάλμα' });
        _idsFailAt = _idsOk ? 0 : Date.now();
        return r;
      });
  try { board = await planFetch('GET', '/plan/board?week=' + week); } catch (e) { err = e; }
  // The board does not wait long for its names: up to 1.5 s, then it paints («—» for a moment, no strip) and paints
  // again when the catalogue lands (only if this render still owns the screen).
  if (!idsDone) await Promise.race([ids, new Promise((r) => setTimeout(r, 1500))]);
  if (!idsDone) ids.then(() => { if (seq === _seq && active() && _board) paint(); });
  if (seq !== _seq || !active()) return;               // a newer render, or another page, owns the screen now
  if (err && err._sessionGone) return;                  // the login page is on its way; nothing to draw
  if (!err && (!board || typeof board !== 'object' || board.week !== week)) {
    err = { kind: 'client', message: 'Η απάντηση του πίνακα ήταν για άλλη εβδομάδα (' + String(board && board.week) + ') — ενημέρωσε τον Δημήτρη' };
    _logErr(new Error(err.message), 'weekly natl v5: board week');
  }
  if (err) { _state = 'err'; _lastErr = err; }
  else { _board = board; _okAt = new Date(); _state = _isEmpty(board) ? 'empty' : 'ok'; _stale = null; _vsDayKick(board, seq); }
  if (!paint()) return _fallback();
}
// 092: the VS legs of the board's stops, and the international's Veroia day of those VS, read beside the board
// (one GET, at most 500 ids: plan_vs_state's limit). It never holds the board back and never repaints it: the marks
// are filled in place (_vsMarkFill), so a menu or popover opened meanwhile stays (code review xhigh). The days of the
// last board are dropped at once (_vsRead 'loading'): a failed read leaves no old day standing beside a new board.
// Before 092 the answer has no cross_dock_date: no mark, as today.
function _vsDayKick(board, seq) {
  const idx = new Map();
  // a malformed board is WN5L.model's to refuse (the old board and its banner): nothing here may throw first
  const arr = (x) => (Array.isArray(x) ? x : []);
  for (const c of arr(board.cycles)) {
    // every stop with a VS leg; the mark is drawn only beside the stops the model calls Veroia (kath.veroia, end:
    // WN5L's hub rule), so no second hub test lives here
    for (const s of arr(c && c.stops)) {
      const ids = arr(s && s.legs).filter((l) => l && /^vs_/.test(String(l.kind || '')) && l.order_id != null).map((l) => Number(l.order_id));
      if (ids.length) idx.set(Number(s.stop_id), { day: s.stop_day || null, orders: [...new Set(ids)] });
    }
  }
  _hubVs = idx;
  _vsDays = new Map();
  const ids = [...new Set([...idx.values()].flatMap((h) => h.orders))].slice(0, 500);
  if (!ids.length || typeof planFetch !== 'function') { _vsRead = 'ok'; _vsPending = null; return; }
  _vsRead = 'loading';
  _vsPending = planFetch('GET', '/plan/vs-state?order_ids=' + ids.join(',')).then((ans) => {
    if (seq !== _seq || !active()) return;
    const m = new Map();
    const day = (x) => (x ? String(x).slice(0, 10) : null);
    for (const id of ids) {
      const v = ans && ans[String(id)];
      if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'cross_dock_date')) m.set(id, { cd: day(v.cross_dock_date), first: day(v.first_hub_day) });
    }
    _vsDays = m;
    _vsRead = 'ok';
    _vsMarkFill();
  }).catch((e) => {
    if (seq !== _seq) return;
    _vsRead = 'err';
    // logged once: planFetch logs a PlanError that is not a designed answer itself; a designed one and a fault of
    // this code are logged here (principle 1: the marks that are off are never off in silence)
    const pe = typeof PlanError === 'function' && e instanceof PlanError;
    const designed = pe && typeof PlanApi !== 'undefined' && PlanApi.isDesigned(e);
    if (!(e && e._sessionGone) && (!pe || designed)) _logErr(e, 'weekly natl v5: /plan/vs-state (Veroia day marks)');
  });
}
// The mark beside a hub stop whose VS the international has at Veroia on another day («VS Κυρ 1/11»); the whole
// sentence is in the title. Only at the truck that carries the VS's FIRST Veroia day (v_vs_state first_hub_day, the
// day plan_h_vs_follow reads): a stock piece loaded at Veroia days later is there on purpose, never a mismatch.
// Nothing when the days agree, or when the day was not read.
function _vsMarkText(stopId) {
  const h = _hubVs.get(Number(stopId));
  if (!h) return null;
  const days = [...new Set(h.orders.map((o) => _vsDays.get(o)).filter((v) => v && v.cd && v.first && v.cd !== v.first && v.first === h.day)
    .map((v) => v.cd))].sort();
  return days.length ? days.map(_dl).join(', ') : null;
}
function _vsDayMark(stopId) {
  if (stopId == null || !_hubVs.has(Number(stopId))) return '';
  const id = _id(stopId);
  const txt = _vsMarkText(stopId);
  const h = _hubVs.get(Number(stopId));
  return txt ? `<span class="wn5-vsday" data-vsmark="${id}" title="${_esc('Η διεθνής έχει Βέροια ' + txt + ' · το φορτηγό ' + _dl(h.day))}">VS ${_esc(txt)}</span>`
    : `<span class="wn5-vsday" data-vsmark="${id}" hidden></span>`;
}
function _vsMarkFill() {
  for (const el of document.querySelectorAll('#content .wn5 [data-vsmark]')) {
    const txt = _vsMarkText(el.dataset.vsmark);
    const h = _hubVs.get(Number(el.dataset.vsmark));
    el.hidden = !txt;
    el.textContent = txt ? 'VS ' + txt : '';
    if (txt) el.title = 'Η διεθνής έχει Βέροια ' + txt + ' · το φορτηγό ' + _dl(h && h.day); else el.removeAttribute('title');
  }
}
// The international's Veroia day of a VS as the board read it (the leg form's «Ημέρα Βέροιας»): {cd, first} (cd =
// orders.cross_dock_date, first = the first Veroia day of its trucks), null = the base answered without it (before
// 092), undefined = not read; vsDayRead() says why ('loading' | 'ok' | 'err')
function vsDayOf(orderId) { const k = Number(orderId); return _vsDays.has(k) ? _vsDays.get(k) : (_vsRead === 'ok' ? null : undefined); }
function vsDayRead() { return _vsRead; }
// The leg form re-reads the board when it opens (findAfterReuse), which starts a new read of the days: it waits for it,
// so its «Ημέρα Βέροιας» is never the day of before a save
function vsDaysSettled() { return _vsPending || Promise.resolve(); }
// Empty = the three lists that make rows came back empty (a malformed list is not «empty»: WN5L.model refuses it).
function _isEmpty(b) {
  const n = (k) => (Array.isArray(b[k]) ? b[k].length : 1);
  return n('cycles') === 0 && n('waiting') === 0 && n('hub') === 0;
}
// reason names the caller (a write, the user's «Ανανέωση», a reuse check) for the trace; the read is the same.
async function reload(reason) {
  // the user's ↻ also asks the catalogue and day L again, at once — day L beside the board read, not after it
  if (reason === 'user') { _idsForce = true; _cfgForce = true; _cfgKick(); }
  await render();
  const ok = _state === 'ok' || _state === 'empty';
  // a confirmed save whose read failed: the strip says the save happened and the rows are old (F11, principle 1)
  if (!ok && SAVE_RELOADS.includes(reason) && _state === 'err' && active()) { _stale = { at: new Date() }; paint(); }
  return ok ? _m : null;
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
  const mo = { today: _today() };
  if (hubId != null) mo.hubId = hubId;
  if (_idsOk && typeof PlanIds !== 'undefined' && typeof PlanIds.place === 'function') mo.place = (id) => PlanIds.place(id);
  _m = _board ? lg.model(_board, mo) : null;
  _closeMenu();
  content.innerHTML = _rootHTML();
  // the one listener of the board's actions lives on this root and dies with it at the next paint
  if (typeof WN5Act !== 'undefined') WN5Act.bind(document.querySelector('#content > .wn5'));
  _noteStrip();
  document.body.classList.add('wn5-on');
  _topMount();
  _install();
  _logShape(_m);
  _buildIndex(_m);
  _legMark();   // F22: a leg read in flight keeps its mark on the repainted row
  _applySearch(false);
  _fitUpd();
  _fitAfterFonts();
}
// Figma H1 «↻ Ενημερώθηκε …»: the word shows whenever it fits and goes first when it does not — before the bar's
// overflow cuts the time. Measured, not a breakpoint: the range («26 Σεπτεμβρίου – 2 Οκτωβρίου») and the sidebar
// (open or folded) change the room at the same window width.
function _fitUpd() {
  try {
    const b = _bar(), bl = b && b.querySelector('.wi4-bar-l');
    if (!bl) return;
    // Measured with the range whole (.wn5-fit): outside the measure the range may shrink, which would hide the need.
    bl.classList.add('wn5-fit');
    bl.classList.remove('wn5-upd-short', 'wn5-rg-short');
    if (bl.scrollWidth > bl.clientWidth + 1) bl.classList.add('wn5-upd-short');
    // whole-frame r2 (2120:7829): the range is drawn whole. A range across two months that still has no room once the
    // word has gone takes the short months («26 Σεπ – 2 Οκτ»); the long form stays in its title.
    if (bl.scrollWidth > bl.clientWidth + 1) bl.classList.add('wn5-rg-short');
    bl.classList.remove('wn5-fit');
  } catch (_) { /* the word stays; the range gives way by its ellipsis */ }
}
// The measure at paint ran with whatever font was there: the web fonts (and their Greek subsets, fetched only when
// Greek text appears) swap in later and widen the bar's words without changing #content's size, so the
// ResizeObserver never fires and the range got the ellipsis while «Ενημερώθηκε» stayed. Measured again when they land.
function _fitAfterFonts() {
  try { if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (active()) _fitUpd(); }); } catch (_) {}
}
function _today() { return typeof localToday === 'function' ? localToday() : ''; }
// The day words come from ONE place (core/wi4-logic.js dayLabel): «Τρί 13/10» / «Τρί».
const _dl = (d) => (d && typeof WI4 !== 'undefined' ? WI4.dayLabel(d) : d || '—');
const _dow = (d) => _dl(d).split(' ')[0];
// F1/F4 (owner 28/10, 080): pallets not known yet read «;π», a sum with unknown pieces «12+;π» (WN5L.palText: one
// text for every v5 screen), never 0π
const _pal = (n, unknown) => WN5L.palText(n, unknown) + 'π';
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
  return `<div class="wi4 wn5" data-week="${_esc(_sat)}" data-state="${_esc(_state)}"${_stale && _state === 'err' ? ' data-stale="1"' : ''}>`
    + _barHTML() + _errHTML() + (known ? _idsHTML() + _shapeHTML(m) : '') + _boardHTML(m, known) + '</div>';
}
function _barHTML() {
  const w = Number(window.WNATL && window.WNATL.week);
  // «Ενημερώθηκε» is a word that gives way when the bar has no room for it (_fitUpd); the time stays. The time, not
  // «μόλις τώρα» (Figma): no timer refreshes the words, and «μόλις τώρα» would still say so an hour later.
  const upd = _state === 'loading' ? _esc('Διαβάζει…') : _okAt ? `<span class="wn5-upd-w">Ενημερώθηκε </span>${_hhmm(_okAt)}` : '—';
  return '<div class="wi4-bar wn5-bar"><div class="wi4-bar-l"><span class="wi4-title">Εβδομαδιαίο Εθνικών</span>'
    + `<span class="wi4-range" title="${_esc(_rangeText(_sat))}"><span class="wn5-rg-l">${_esc(_rangeText(_sat))}</span><span class="wn5-rg-s">${_esc(_rangeText(_sat, true))}</span></span>`
    + `<button type="button" class="wn5-upd" data-act="reload" title="Ανανέωση" onclick="WN5.reload('user')"><span class="wn5-ico-re" aria-hidden="true">↻</span> ${upd}</button></div>`
    + `<nav class="wi4-tabs" aria-label="Εβδομάδες">${_tabsHTML(w)}</nav>`
    // Figma 7745 / H1 right group: «Προβολή ▾» · «Σάρωση» · «+ Νέα παραγγελία». «Προβολή ▾» and «Σάρωση» wait for
    // Φ4β (Ε-42, Ε-38): the scan creates an order of the OLD model, which this board never shows (principle 1).
    // «+ Νέα παραγγελία» comes with the v5 form (T20): never a button that opens nothing, never the old form here.
    + '<div class="wi4-bar-r">'
    // F25: day L was read before and could not be read again — the board says which day it still uses
    + _recheckNoteHTML()
    + (typeof WN5Form !== 'undefined' && typeof OrdersCommon !== 'undefined' && OrdersCommon.newOrderButton
      ? OrdersCommon.newOrderButton('WN5Form.openOrder({})', '+ Νέα παραγγελία', 'Νέα εθνική παραγγελία v5 — χωρίς έξοδο από το εβδομαδιαίο') : '')
    // Q-10: the old view only for a week before day L; from L on it is not offered, and a stored choice says why
    + (_afterL(_sat)
      ? (_ls('tms_wn5') === '0' ? `<span class="wi4-range" data-old-view="closed">Η παλιά προβολή υπάρχει μόνο για εβδομάδες πριν από ${_esc(_dm(_cfg.cutoverDay))}</span>` : '')
      : (_cfg && _cfg.state === 'unknown' ? '<span class="wi4-range" data-old-view="unknown">Η ημέρα μετάβασης δεν διαβάστηκε</span>' : '')
        // a week before L lives in the old model: an (almost) empty v5 week must not read as «nothing planned»
        + (_cfg && _cfg.state === 'after' && _cfg.cutoverDay && typeof _sat === 'string' && _sat < _cfg.cutoverDay
          ? `<span class="wi4-range" data-old-view="before">Εβδομάδα πριν από ${_esc(_dm(_cfg.cutoverDay))}: τα εθνικά της είναι στην παλιά προβολή</span>` : '')
        + '<button type="button" class="wi4-btn sm" title="Το παλιό Εβδομαδιαίο Εθνικών" onclick="WN5._switch(\'0\')">Παλιά προβολή</button>')
    + '</div></div>';
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
// «10–16 Οκτωβρίου», or «26 Σεπτεμβρίου – 2 Οκτωβρίου» across a month; short: «10–16 Οκτ», «26 Σεπ – 2 Οκτ».
function _rangeText(sat, short) {
  if (!DAY_RE.test(String(sat || ''))) return '';
  const [y, m, d] = sat.split('-').map(Number);
  const a = new Date(Date.UTC(y, m - 1, d)), b = new Date(Date.UTC(y, m - 1, d + 6));
  const M = short ? MONTH_SHORT : MONTH_GEN;
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${M[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${M[a.getUTCMonth()]} – ${b.getUTCDate()} ${M[b.getUTCMonth()]}`;
}
function _hhmm(d) { return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
// Δ12 πλακ. 3: the Worker's message as it came, what it does NOT mean, and the one way on — a press, never a timer.
function _errHTML() {
  if (_state !== 'err' || !_lastErr) return '';
  // F11: the save is done, only the read after it failed — never «ΣΦΑΛΜΑ» alone, which reads as «not saved»
  if (_stale) {
    return `<div class="wn5-strip" data-kind="stale" data-stale="1" role="alert"><b>ΑΠΟΘΗΚΕΥΤΗΚΕ · Ο ΠΙΝΑΚΑΣ ΔΕΝ ΑΝΑΝΕΩΘΗΚΕ</b>`
      + `<span>Η αλλαγή γράφτηκε (${_hhmm(_stale.at)}), αλλά η ανάγνωση μετά απέτυχε: ${_esc(_lastErr.message)}</span>`
      + '<span class="wn5-strip-sub">Οι σειρές δείχνουν την κατάσταση ΠΡΙΝ από την αλλαγή — μην την ξανακάνεις· πάτα Ανανέωση</span>'
      + '<button type="button" class="wi4-link wn5-strip-act" data-act="reload" onclick="WN5.reload(\'user\')">Ανανέωση <span class="wn5-ico-re" aria-hidden="true">↻</span></button></div>';
  }
  const last = _okAt ? ` · Τελευταία πλήρης ${_hhmm(_okAt)}` : '';
  return `<div class="wn5-strip" data-kind="${_esc(_lastErr.kind || 'failed')}" role="alert"><b>ΣΦΑΛΜΑ</b><span>${_esc(_lastErr.message)}</span>`
    + `<span class="wn5-strip-sub">${_board ? 'Ό,τι ήρθε πριν μένει στην οθόνη' : 'Η εβδομάδα δεν διαβάστηκε — δεν σημαίνει ότι είναι άδεια'}${last}</span>`
    + '<button type="button" class="wi4-link wn5-strip-act" data-act="reload" onclick="WN5.reload(\'user\')">Ανανέωση <span class="wn5-ico-re" aria-hidden="true">↻</span></button></div>';
}
// The catalogue of places did not load: the rows still paint, their places read «—», and this strip says why (the
// Worker's message as it came). planFetch / PlanIds already logged what is not a designed answer.
function _idsHTML() {
  if (!_idsErr) return '';
  return `<div class="wn5-strip" data-kind="client" data-ids="failed" role="alert"><b>ΟΝΟΜΑΤΑ ΤΟΠΩΝ</b><span>Οι κατάλογοι τόπων δεν φορτώθηκαν — οι τόποι δείχνουν «—»: ${_esc(_idsErr.message || '')}</span>`
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
  return _qbandHTML(m, known)
    // Δ12 2069:10269 (fidelity T7 r1): the no-match words are a strip of their own under the band, not text inside it.
    + '<div id="wn5-snone" class="wn5-snone" role="status" hidden></div>'
    + (known ? _noticesHTML(m) : '')
    + (known && typeof WN5Hub !== 'undefined' && typeof WN5Hub.shelfHTML === 'function' ? WN5Hub.shelfHTML(m) : '')
    // Δ12 (empty / loading / error frames): no column heads over a board with no row — they head nothing.
    + (m.days.some((d) => d.rows.length) ? _colsHTML() : '')
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
  // A card is one VS order (the base assigns an order whole), its pieces are the board's points.
  const nVs = String(q.length);
  const more = q.length > max ? `<button type="button" class="wi4-link wi4-q-all" onclick="WN5._qMore()">${_qAll ? 'Λιγότερα ▴' : `Όλες οι ${q.length} ▾`}</button>` : '';
  // Owner 31/10 (no «κομμάτι» on the board): the count is the VS orders, as the cards; their pieces are on the rows.
  return `<div class="wi4-q wn5-q">${search}<div class="wi4-q-hd"><span>ΕΠΟΜΕΝΑ · ${nVs}</span><span class="wi4-q-n">${_esc(_qSub(q, m.today))}</span></div>`
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
// mid-name; the whole line stays in title (with the client). The places come from the catalogue (live fix 1, 28/10)
// and the client is off the board (owner 28/10, as the rows): a ΚΑΘΟΔΟΣ VS names where it goes, an ΑΝΟΔΟΣ one where it
// loads («←»). The reason stands where Figma has «φτάνει 14:00» (no arrival on the board) — never an invented hour.
function _qcardHTML(it, m) {
  const today = m.today;
  const why = it.reason === 'late' ? 'καθυστερεί' : 'χωρίς φορτηγό';
  let row = null;
  for (const d of m.days) for (const r of d.rows) if (!row && r.kind === 'unassigned' && r.pieceIds[0] === it.pieceId) row = r;
  const anod = !!(row && !row.kath && row.anod);
  const pts = row ? (anod ? row.anod.from : (row.kath ? row.kath.to : [])) : [];
  const pl = [...new Set(pts.map((p) => p.name))];
  // Three spans (fidelity T5 r2): at 1440 the card is ~350px and the place is what gives way — the code and «+N»
  // stay whole, so «+2» is never cut away with the name (the whole line is in title).
  // a VS without a reference starts at its arrow (Figma audit B-11): a «—» before it read as a missing place
  const short = `<span class="wn5-qc-k">${it.code ? _esc(it.code) + ' ' : ''}${anod ? '←' : '→'}</span><span class="wn5-qc-cl">${_esc(pl[0] || '—')}</span>`
    + (pl.length > 1 ? `<span class="wn5-qc-n">+${pl.length - 1}</span>` : '');
  return `<div class="wi4-qcard wi4-r-red wn5-qcard" data-piece="${_id(it.pieceId)}">`
    + `<span class="wi4-dc ${_chipCls(it.day, today)}">${_esc(_dl(it.day))}</span>`
    + `<span class="wi4-qcard-t"><span class="wi4-l1 wn5-qc-l1" title="${_esc(it.title)}">${short}</span><span class="wi4-l2">${_esc(_pal(it.pallets, it.palUnknown))} · ${why}</span></span>`
    + '<button type="button" class="wi4-btn sm" data-act="assign">Ανάθεση</button></div>';
}
function _qMore() {
  _qAll = !_qAll;
  const q = document.querySelector('#content .wn5 .wn5-q');
  if (q && _m) q.outerHTML = _qbandHTML(_m, true);
}
// Column heads of Figma H1 2120:7738: «ΑΝΑΘΕΣΗ» alone (owner 25/10), no Veroia-time column anywhere.
function _colsHTML() {
  // Owner 31/10: the column names only — no «N κύκλοι» counts, no «ανά ημέρα φόρτωσης Βέροιας» note (a professional
  // board does not count «cycles»; the rows are what is counted).
  return '<div class="wn5-cols" role="row">'
    + '<span class="wn5-c-idx"></span><span class="wn5-c-kd">ΚΑΘΟΔΟΣ</span><span class="wn5-c-kfl">ΦΟΡΤΩΣΗ</span>'
    + '<span class="wn5-c-kto">ΠΑΡΑΔΟΣΗ</span>'
    + '<span class="wn5-c-kpal">ΠΑΛ.</span><span class="wn5-c-asg wn5-h-asg">ΑΝΑΘΕΣΗ</span>'
    + '<span class="wn5-c-ad">ΑΝΟΔΟΣ</span><span class="wn5-c-afl">ΦΟΡΤΩΣΗ</span>'
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
  // Days are ALWAYS open (owner 12/10, Weekly National too): an empty day draws no chevron in ANY week — Δ12 πλακ. 1's
  // «›» on every day of an empty week read as «folded» (live W44, 28/10), while an empty day of a week with loads had
  // none (Figma H1 «ΤΡΙΤΗ 13/10 · σήμερα · καμία φόρτωση»). Nothing to open, so nothing that looks closed.
  const [name, date] = d.head.split(' ');
  // A day the user folded says what it hides (owner 28/10, live: one click on a day head folded it and its rows
  // looked deleted). Drawn on every foldable day, shown by CSS only while it is closed (.wn5-day.closed); a click on
  // it is a click on the head, which opens the day again.
  // every line the fold hides: a row, its «⇄» line and its «↳ Φόρτωση με τοπικό» lines (as _rowHTML draws them)
  const n = d.rows.reduce((a, r) => a + 1 + (r.handovers && r.handovers.length ? 1 : 0) + (Array.isArray(r.local) ? r.local.length : 0), 0);
  const tail = (today ? '<span class="wi4-today"> · σήμερα</span>' : '')
    + (!known ? `<span class="wn5-dayx"> · ${_state === 'loading' ? '…' : '—'}</span>` : empty ? '<span class="wn5-dayx"> · καμία φόρτωση</span>' : '')
    + (fold ? `<span class="wn5-dayhid">▸ ${n} ${n === 1 ? 'γραμμή κρυμμένη' : 'γραμμές κρυμμένες'} · άνοιγμα</span>` : '');
  const head = `<div class="wi4-dayh wn5-dayh"${fold ? ` role="button" tabindex="0" aria-expanded="${!closed}" onclick="WN5._dayTog('${d.date}')"` : ''}>`
    + (fold || skel ? `<span class="wi4-chev">${CHEV}</span>` : '<span class="wi4-dayh-sp"></span>')
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
// F1 (owner 28/10): a point entered without a window is its whole day; the model says so (allDay, WN5L.allDay: one
// rule) and the board names it «όλη η ημέρα», never an hour someone agreed. F64: one minute is «στις 08:00», the day's
// last minute «ως 23:59» — WN5L.winText, the rule the driver sheet reads too.
const _winTxt = (f, t, all) => WN5L.winText(f, t, all) || '—';
const _win = (f, t, all) => _esc(_winTxt(f, t, all));
function _rowHTML(r, m, no) {
  const n = r.kind === 'cycle' ? ++no.n : null;
  const ok = _dimOk(r);
  const rail = r.rail === 'red' ? ' wi4-r-red' : r.late ? ' wi4-r-amb' : '';
  const ids = r.rtId != null ? ` data-rt="${_id(r.rtId)}"` : ` data-piece="${_id(r.pieceIds[0])}"`;
  // F32: a ΠΡΟΣ ΑΝΑΘΕΣΗ row is dragged onto a cycle row (wn5_actions.js WN5Act.bind: the drop opens that cycle's «+»)
  const drag = r.rtId == null && r.kind === 'unassigned' ? ' draggable="true"' : '';
  let h = `<div class="wn5-row${rail}${_dc(ok && r.rowDim)}" data-key="${_esc(r.key)}" data-qi="${_esc(r.key)}"${ids}${drag}>`
    + `<div class="wn5-c-idx"><span class="wi4-no">${n == null ? '' : n}</span>`
    + (r.rtId != null ? `<button type="button" class="wi4-plane" title="Ενέργειες σειράς" aria-haspopup="menu" onclick="WN5.rowMenu(event, ${_id(r.rtId)})">${PLANE}</button>`
      // a national order waiting for a vehicle (waiting[] or hub[]): the same order card as a cycle's «Άνοιγμα
      // παραγγελιών» (Επεξεργασία, Διαγραφή) — without it an order could not be fixed or deleted before it was on a
      // truck (live F6, 28/10). A VS is the international's order: it changes in the Weekly International.
      : r.kind === 'unassigned' && r.group ? orderCardBtn(r.group.nat_order_id) : '')
    + '</div>'
    + _kathHTML(r, m, ok)
    + `<div class="wn5-asg">${r.segSource === 'segments' && r.tiles.length > 1 ? _tilesHTML(r) : r.tiles.map((t) => _boxHTML(t, r)).join('')}${_cpyHTML(r)}</div>`
    + _anodHTML(r, m, ok)
    + '</div>';
  h += _handRowHTML(r, ok);
  for (const lm of r.local) h += _localHTML(r, lm, ok);
  return h;
}
function _kathHTML(r, m, ok) {
  const s = r.kath;
  // «Χωρίς κάθοδο»: the dashed slot ends where ΠΑΛ. begins, and the «+» stays in the side's ΠΑΛ. cell, outside the box,
  // where every row has it (Figma 2011:10217)
  // A load waiting for its ΑΝΟΔΟΣ only (a vs_export to Veroia): the empty ΚΑΘΟΔΟΣ is the dashed «Χωρίς κάθοδο» of
  // RT-T106/T107 (Figma H1), and «ΠΡΟΣ ΑΝΑΘΕΣΗ» names its side (owner 28/10, live fix 3: beside a bare «—» the shared
  // ΑΝΑΘΕΣΗ column read as the ΚΑΘΟΔΟΣ's own). No «+» here: a waiting row is not a cycle with a free side.
  if (!s) return r.kind === 'cycle' ? `<div class="wn5-kspan wn5-gspan"><span class="wn5-gapbox">Χωρίς κάθοδο</span></div><div class="wn5-kpal wn5-gpal">${_plusHTML(r, 'KATHODOS')}</div>`
    : r.anod ? '<div class="wn5-kspan"><span class="wn5-gapbox">Χωρίς κάθοδο</span></div>' : '<div class="wn5-kspan"><span class="wn5-none">—</span></div>';
  // The head of the side (its day, «Βέροια», the Veroia window) dims with the day of its loading stop.
  const hd = _dc(ok && s.headDim);
  const toDay = s.toDay && s.toDay !== s.day ? `<span class="wn5-dc2${hd}">→ ${_esc(_dl(s.toDay))}</span>` : '';
  // A VS waiting for a vehicle names its reference under the day (Figma H1 «Δευ 12/10 / VS-118», «VS-121 αργό»):
  // the queue card and the row then read as the same load.
  // The reference is the VS order's own text and can be a long list («1001, 1002, 1003, …», live W44): it ends in «…»
  // inside its 70px cell (CSS .wn5-kref) and is whole in the title; it ran across ΦΟΡΤΩΣΗ and ΠΑΡΑΔΟΣΗ before (31/10).
  // «αργό» is outside the cut part: a warning is never what the «…» hides.
  const ref = r.kind === 'unassigned' && r.vs && r.refs.length ? `<span class="wn5-dc2 wn5-kref" title="${_esc(r.refs[0])}"><span class="wn5-kref-t">${_esc(r.refs[0])}</span>${r.late ? ' αργό' : ''}</span>` : '';
  return `<div class="wn5-kd">${_chipHTML(r, 'KATHODOS', `wi4-dc ${_chipCls(s.day, m.today)}${hd}`, _dl(s.day))}${toDay}${ref}</div>`
    + `<div class="wn5-fl"${_legAttr(r, 'KATHODOS')}>${_flHTML(s, ok, hd)}</div>`
    + `<div class="wn5-kto${_hx(r, s, null)}"${_legAttr(r, 'KATHODOS')}>${_hxHTML(r, s, null)}${_ptsHTML(s.to, ok)}</div>`
    + `<div class="wn5-kpal"${_legAttr(r, 'KATHODOS')}>${_palHTML(s)}${_plusHTML(r, 'KATHODOS')}${_prtHTML(r, 'KATHODOS')}</div>`;
}
function _anodHTML(r, m, ok) {
  const s = r.anod;
  // the mirror of «Χωρίς κάθοδο» for a load waiting for its ΚΑΘΟΔΟΣ only (owner 28/10, live fix 3)
  if (!s) return r.kind === 'unassigned' && r.kath ? '<div class="wn5-aspan"><span class="wn5-gapbox">Χωρίς άνοδο</span></div>' : '<div class="wn5-aspan"><span class="wn5-none">—</span></div>';
  // «Κενό γύρισμα» is a free return to fill (a dashed slot); a partner cycle's «Μόνο κάθοδος · συνεργάτης» is a fact,
  // plain grey text (Figma H1 / 7745). The words are WN5L's; the screen only picks the look by the vehicle.
  if (s.gap) {
    const par = r.tiles.length > 0 && r.tiles.every((t) => t.type === 'par');
    // Figma H1: in the dashed slot «Κενό γύρισμα» reads darker than what follows it (look only: WN5L's text is split
    // at its first « · », nothing is added or dropped).
    const cut = par ? -1 : s.gap.text.indexOf(' · ');
    // One inner run: the slot is a flex box, and a bare « · …» beside the span would be its own item and lose its space.
    // The inner run is a .wi4-ell that the wn5 block lets WRAP at every width (DESIGN.md #6, whole-frame fix round 1:
    // r4 cut it at ≤1600); the whole text is also in title.
    const ell = `class="wi4-ell" title="${_esc(s.gap.text)}"`;
    const txt = cut > 0 ? `<span ${ell}><span class="wn5-gaph">${_esc(s.gap.text.slice(0, cut))}</span>${_esc(s.gap.text.slice(cut))}</span>` : par ? _esc(s.gap.text) : `<span ${ell}>${_esc(s.gap.text)}</span>`;
    // a partner's «Μόνο κάθοδος» is a fact, not a slot (plain text), yet its ΑΝΟΔΟΣ still has the side's «+» in ΠΑΛ., as
    // every side of a cycle row (Figma 2011:10299 row 4); the «+» sits outside the dashed box (2011:10217)
    return `<div class="wn5-aspan wn5-gspan"><span class="${par ? 'wn5-gaptxt' : 'wn5-gapbox'}">${txt}</span></div><div class="wn5-apal wn5-gpal">${_plusHTML(r, 'ANODOS')}</div>`;
  }
  const hd = _dc(ok && s.headDim);
  const end = r.end ? `<span class="wn5-end${_dc(ok && r.end.dim)}"${_segAttr(r.end.segLabel)} title="${_esc(`Βέροια · ως ${_dow(L().athensDay(r.end.by))} ${L().athensTime(r.end.by)}`)}"><span class="wi4-l1">Βέροια</span><span class="wi4-l2">ως ${_esc(_dow(L().athensDay(r.end.by)))} ${_esc(L().athensTime(r.end.by))}</span>${_vsDayMark(r.end.stopId)}</span>` : '';
  return `<div class="wn5-ad">${_prtHTML(r, 'ANODOS')}${_chipHTML(r, 'ANODOS', `wi4-dc ${_chipCls(s.day, m.today)}${hd}`, _dl(s.day))}</div>`
    + `<div class="wn5-afl"${_legAttr(r, 'ANODOS')}>${_ptsHTML(s.from, ok)}</div>`
    + `<div class="wn5-ato${_hx(r, s, r.end)}"${_legAttr(r, 'ANODOS')}>${_hxHTML(r, s, r.end)}${_ptsHTML(s.to, ok)}${end}</div>`
    + `<div class="wn5-apal"${_legAttr(r, 'ANODOS')}>${_palHTML(s)}${_plusHTML(r, 'ANODOS')}</div>`;
}
// ΦΟΡΤΩΣΗ of ΚΑΘΟΔΟΣ: «Βέροια» and its window stay together (owner 25/10); a loading the cycle makes BEFORE Veroia
// (WN5L vBefore, by the base's stop order) comes first, numbered with Veroia among the cell's loadings (Figma H1
// row 5 «1 Thessaloniki»); the ones after it follow. Veroia itself carries no number box: its word is its mark.
// Like every point (owner 28/10): place + city; the clients are in the order card and the titles.
// The number sits INSIDE the place line here (inl): the two flow as one run, so a place that does not fit beside its
// number goes whole to the next line, and that run is the box cut at two lines (long names, owner 28/10).
function _flHTML(s, ok, hd) {
  if (!s.veroia) return _ptsHTML(s.from, ok, null, true);
  const vh = `<span class="wn5-vh${hd}">Βέροια</span><span class="wn5-vtime${hd}"${_segAttr(s.veroia.segLabel)}>${_win(s.veroia.from, s.veroia.to, s.veroia.allDay)}</span>${_vsDayMark(s.veroia.stopId)}`;
  const k = Math.min(s.vBefore || 0, s.from.length);
  return _ptsHTML(s.from.slice(0, k), ok, 1, true) + vh + _ptsHTML(s.from.slice(k), ok, k + 2, true);
}
// start (a number) = number the points from it, boxes always shown (a cell that also has «Βέροια»); else WN5L's n and
// no box on a lone point (wi4 rule 6). Every point is place + city (owner 28/10), so no cell is «place only» any more.
function _ptsHTML(pts, ok, start, inl) {
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
    ? `<span class="wi4-more${restLate ? ' wn5-late' : ''}" title="${_esc(rest.map((i) => `${num(pts[i], i) || pts[i].n}. ${_ptFull(pts[i])}`).join('\n'))}"><b>+${rest.length}</b></span>`
    : '';
  return `<span class="wi4-pts wn5-pts">${idx.filter((i) => shown.has(i)).map((i) => _ptHTML(pts[i], num(pts[i], i), ok, inl)).join('')}${more}</span>`;
}
// Who, then where (Figma H1 «Omega Market · Rentis»): the client in bold, the place in grey. Two runs that break
// between them, the «·» staying on the first line («ΠΕΛΑΤΗΣ Δ ·» / «Aspropyrgos»), never inside a name that fits. A waiting load's point
// IS its client (the board names no place for it, Ε-26): drawn once, never «ΠΕΛΑΤΗΣ Β · ΠΕΛΑΤΗΣ Β».
function _ptWho(p) {
  const cl = Array.isArray(p.clients) ? p.clients : [];
  return cl.length && !(cl.length === 1 && cl[0] === p.name) ? cl.join(', ') : null;
}
// The temperatures of the point's loads (WN5L temps: known ones only), «+4 °C», «+2 / +4 °C» (the driver sheet's form,
// modules/wn5_sheet.js _temp). None known = nothing drawn: the line never says «0 °C» for a missing value.
function _tempTxt(p) {
  const ts = Array.isArray(p && p.temps) ? p.temps : [];
  return ts.length ? ts.map((t) => (t > 0 ? '+' : '') + String(t).replace('.', ',')).join(' / ') + ' °C' : '';
}
// Each point with its own day: a delivery of Tuesday stays bold until Tuesday ends, even if its hour passed.
// The point's city: the catalogue's (PlanIds, GET /plan/lookups) for its place id; '' while the catalogue is not in.
function _ptCity(p) {
  if (p && p.city) return String(p.city);
  if (!p || p.locId == null || typeof PlanIds === 'undefined' || typeof PlanIds.place !== 'function') return '';
  try { const x = PlanIds.place(p.locId); return x && x.city ? String(x.city) : ''; } catch (_) { return ''; }
}
// Owner 28/10 (over Figma's «who, then where»): a point reads as on the Weekly International — the PLACE in bold on
// line 1 (.wi4-l1), its city under it on line 2 (.wi4-l2) with the window, pallets and temperature. The client is
// not on the row (a long company name filled four lines and the place got lost; the national dispatcher plans by
// place): it is in the order card and in this title.
// The whole stop in one line, place first as on the row, the client last: the point's title and the «+N» list.
// B-12: the deadline of an ΑΝΟΔΟΣ ending at Veroia — the window's END (its own day: a window can cross midnight), else
// the base's due day; never an hour the base did not give
const _hubBy = (p) => (p.to && (p.toDay || p.day) ? `${_dow(p.toDay || p.day)} ${p.to}` : p.due ? _dl(p.due) : '—');
function _ptFull(p) {
  if (p.hub) return `Βέροια · ως ${_hubBy(p)} · ${_pal(p.pallets, p.palUnknown)}`;   // the same words in title and «+N»
  const city = _ptCity(p), who = _ptWho(p);
  return `${p.name}${city ? ', ' + city : ''} · ${_winTxt(p.from, p.to, p.allDay)} · ${_pal(p.pallets, p.palUnknown)}${_tempTxt(p) ? ' · ' + _tempTxt(p) : ''}${who ? ' · ' + who : ''}`;
}
function _ptHTML(p, n, ok, inl) {
  // Figma audit B-12 (H1): a load waiting for its ΑΝΟΔΟΣ that ends at Veroia reads as a cycle's end (r.end): «Βέροια
  // · τέλος κύκλου», then its deadline; no city «Veroia» under «Βέροια». The deadline is the window's end when the
  // board has one, else the base's due DAY (nat_due_day) — no hour is invented for it.
  if (p.hub) {
    const by = _hubBy(p);
    return `<span class="wi4-pt wn5-pt wn5-end${p.late ? ' wn5-late' : ''}" data-stop="${_id(p.stopId)}" title="${_esc(_ptFull(p))}">`
      + `<span class="wi4-l1">Βέροια</span><span class="wi4-l2">ως ${_esc(by)}</span></span>`;
  }
  const city = _ptCity(p);
  const full = _ptFull(p);
  return `<span class="wi4-pt wn5-pt${p.late ? ' wn5-late' : ''}${_dc(ok && p.dim && !p.late)}" data-stop="${_id(p.stopId)}"${_segAttr(p.segLabel)} title="${_esc(full)}">`
    + (n == null ? `<span class="wi4-l1">${_esc(p.name)}</span>`
      : inl ? `<span class="wi4-l1"><span class="wi4-pt-n">${n}</span> ${_esc(p.name)}</span>`
        : `<span class="wi4-pt-n">${n}</span><span class="wi4-l1">${_esc(p.name)}</span>`)
    + `<span class="wi4-l2${p.late ? ' wi4-t-amb' : ''}">${city ? `<span class="wn5-pcity">${_esc(city)}</span> · ` : ''}${_win(p.from, p.to, p.allDay)} · ${_esc(_pal(p.pallets, p.palUnknown))}${_tempTxt(p) ? `<span class="wn5-temp"> · ${_esc(_tempTxt(p))}</span>` : ''}</span></span>`;
}
// The day chip of a side. On a cycle row it is a button: T16, it opens the date panel Δ4 of its side
// (Figma 2011:8858 / 2053:7837). The classes stay those of T5/T6 (dim, «σήμερα»); other rows keep a plain chip.
function _chipHTML(r, side, cls, label) {
  if (r.kind !== 'cycle' || r.rtId == null) return `<span class="${cls}">${_esc(label)}</span>`;
  return `<button type="button" class="${cls}" data-act="date" data-side="${side === 'ANODOS' ? 'ANODOS' : 'KATHODOS'}" title="Αλλαγή ημερομηνίας">${_esc(label)}</button>`;
}
// T21: a click on a side of a cycle opens its leg form (Figma 2011:9294, Δ7 2069:7746). One attribute for both sides,
// on the side's place and pallet cells; not on the day cell, whose chip is the Δ4 button. Only on a cycle row (the
// ΠΡΟΣ ΑΝΑΘΕΣΗ rows keep data-act="assign") and never on an empty side («Χωρίς κάθοδο», «Κενό γύρισμα»: no leg).
function _legAttr(r, side) {
  if (r.kind !== 'cycle' || r.rtId == null) return '';
  const sd = side === 'ANODOS' ? 'ANODOS' : 'KATHODOS';
  return ` data-leg="${sd}" onclick="WN5._leg(event, ${_id(r.rtId)}, '${sd}')"`;
}
// A click on a control inside the side (the «+», a later print button) is that control's own: ignored here, so the
// controls need no stopPropagation and a «+» never opens the leg form too.
// F22 (live 28/10): the leg form reads the whole board again before it opens (decision 31). On a heavy week that read
// took seconds or hit the base's timeout, the screen showed nothing meanwhile, every impatient click started one more
// read, and a failed read ended in the form's «Ο κύκλος δεν βρέθηκε στην εβδομάδα που φαίνεται» — it read as a week
// stuck on the old one, «until a reload» (the reload opens the lighter current week). So: the clicked row says at once
// that it is reading (.wn5-leg-busy, aria-busy), one leg read at a time (a click while one runs is that same read),
// and a read that failed is said as what it is, with the way on (↻). The week state itself was right all along.
let _legBusy = null;   // {rt, timer} of the leg read running: keyed by cycle (a repaint replaces the row, not the cycle)
// The busy mark is (re)drawn by cycle, so a paint during the read (its own board re-read) keeps it on the new row
function _legMark() {
  for (const r of document.querySelectorAll('#content .wn5-row.wn5-leg-busy')) { r.classList.remove('wn5-leg-busy'); r.removeAttribute('aria-busy'); }
  const r = _legBusy && document.querySelector(`#content .wn5-row[data-rt="${_legBusy.rt}"]`);
  if (r) { r.classList.add('wn5-leg-busy'); r.setAttribute('aria-busy', 'true'); }
}
function _leg(ev, rtId, side) {
  const t = ev && ev.target;
  if (t && t.closest && t.closest('button, a, input, select, [data-act]')) return;
  if (!active() || !ID_RE.test(String(rtId)) || typeof WN5Form === 'undefined' || typeof WN5Form.openLeg !== 'function') return;
  if (_legBusy) {
    // the same side of the same cycle already shows its read; any other click is told why it waits, never a silent nothing
    const sd = side === 'ANODOS' ? 'ANODOS' : 'KATHODOS';
    if ((_legBusy.rt !== Number(rtId) || _legBusy.side !== sd) && typeof toast === 'function') toast('Ανοίγει ήδη μια άλλη γραμμή — δοκίμασε ξανά μόλις ανοίξει', 'info');   // owner 31/10: no «σκέλος» on the board
    return;
  }
  // one token per click: only its own end (or its own 90 s guard) releases it. A read that never settles must not lock
  // every leg for the session: the form's reads (board, catalogue, places) each give up at 30 s, the lock at 90 s.
  const lock = { rt: Number(rtId), side: side === 'ANODOS' ? 'ANODOS' : 'KATHODOS', timer: null };
  const free = () => { if (_legBusy === lock) { _legBusy = null; _legMark(); } clearTimeout(lock.timer); };
  lock.timer = setTimeout(free, 90000);
  _legBusy = lock;
  _legMark();
  Promise.resolve(WN5Form.openLeg(Number(rtId), side === 'ANODOS' ? 'ANODOS' : 'KATHODOS'))
    .then((ok) => {
      if (ok !== false || _state !== 'err' || !_lastErr || !active() || typeof toast !== 'function') return;
      // one #toast (core/ui.js): this replaces at once the form's «Ο κύκλος δεν βρέθηκε …», which a failed read is not
      toast(`Δεν άνοιξε: ο πίνακας δεν ξαναδιαβάστηκε (${_esc(String(_lastErr.message || ''))}) — τίποτα δεν χάθηκε· πάτα Ανανέωση`, 'danger');
    })
    .catch((e) => _logErr(e, 'weekly natl v5: leg form'))
    .finally(free);
}
// T13: «+» on hover of the side (Figma 2011:10022); data-side is the API's ASCII side, the label is Greek. Only on a
// cycle row (an unassigned row has no cycle to add to), also on an empty side so a first load can go in.
function _plusHTML(r, side) {
  if (r.kind !== 'cycle' || r.rtId == null) return '';
  return `<button type="button" class="wn5-plus" data-act="plus" data-side="${side === 'ANODOS' ? 'ANODOS' : 'KATHODOS'}" aria-label="Πρόσθεσε στην ${side === 'ANODOS' ? 'ΑΝΟΔΟ' : 'ΚΑΘΟΔΟ'}" title="Πρόσθεσε">${PLUS}</button>`;
}
// whole-frame r2 (Figma 2011:9279 / 9282): copy the plates from the assignment box on row hover — the Weekly
// International .wi4-cpy shortcut, beside the ✈ line it repeats. The same copyPlatesOf (Ε-22: the cycle's truck and
// trailer only, the clipboard only, nothing written). No button where there is nothing to copy (a partner's cycle,
// a cycle without a vehicle): never a control that only says «no plates».
function _cpyHTML(r) {
  if (r.kind !== 'cycle' || r.rtId == null) return '';
  const pl = _platesOf(r.rtId);
  if (!pl) return '';
  return `<button type="button" class="wn5-cpy" title="Αντιγραφή πινακίδων: ${_esc(pl)}" aria-label="Αντιγραφή πινακίδων ${_esc(pl)}" onclick="WN5._cpy(event, ${_id(r.rtId)})">${COPY}</button>`;
}
// ✈ of a waiting national order (live F6, 28/10): its card, the one T18 built for a cycle's orders.
// One button for the ΠΡΟΣ ΑΝΑΘΕΣΗ row and the Veroia panel (live F23, 28/10: an order sent back to Veroia had no way
// to its card), so the two cannot drift apart. '' without a national order id: a VS is the international's order.
function orderCardBtn(natOrderId) {
  const id = _id(natOrderId);
  return id ? `<button type="button" class="wi4-plane" title="Καρτέλα παραγγελίας" data-act="ocard" onclick="WN5._orderCard(event, ${id})">${PLANE}</button>` : '';
}
function _orderCard(ev, natOrderId) {
  try { if (ev && ev.stopPropagation) ev.stopPropagation(); } catch (_) {}
  if (!active() || !ID_RE.test(String(natOrderId)) || typeof WN5Act === 'undefined') return;
  WN5Act.orderCard(Number(natOrderId));
}
// «Αντιγράφηκε» over the glyph (2011:9282) only when the clipboard took the text: a refusal is copyPlates' own box.
function _cpy(ev, rtId) {
  try { if (ev && ev.stopPropagation) ev.stopPropagation(); } catch (_) {}
  const b = ev && ev.currentTarget;
  if (!active() || !ID_RE.test(String(rtId))) return;
  Promise.resolve(copyPlatesOf(rtId)).then((ok) => {
    if (ok !== true || !b || !b.isConnected) return;
    const old = b.querySelector('.wn5-cpy-tip');
    if (old) old.remove();
    const tip = document.createElement('span');
    tip.className = 'wn5-cpy-tip';
    tip.setAttribute('role', 'status');
    tip.textContent = 'Αντιγράφηκε';
    b.appendChild(tip);
    setTimeout(() => tip.remove(), 1500);
  }).catch((e) => _logErr(e, 'weekly natl v5: copy plates'));
}
// T23: the printer on hover of a side with stops (Figma 2011:9284 ΚΑΘΟΔΟΣ / 2011:9288 ΑΝΟΔΟΣ): the driver sheet of that
// side + its WhatsApp text. In the gap beside the side (CSS), so it moves nothing; never on an empty side (no stop to
// print) nor on an unassigned row (no cycle). icon() is absent in the node tests of _html: the button stays, empty.
function _prtHTML(r, side) {
  if (r.kind !== 'cycle' || r.rtId == null) return '';
  const sd = side === 'ANODOS' ? 'ANODOS' : 'KATHODOS';
  const svg = typeof icon === 'function' ? icon('printer', 12, '', 2) : '';
  return `<button type="button" class="wn5-prt" data-act="sheet" data-side="${sd}" title="Φύλλο οδηγού · ${sd === 'KATHODOS' ? 'Κάθοδος' : 'Άνοδος'}" aria-label="Φύλλο οδηγού" onclick="event.stopPropagation();WN5Sheet.print(${_id(r.rtId)}, '${sd}')">${svg}</button>`;
}
function _palHTML(s) {
  // F1/F4: a side with pieces of unknown pallets reads «12+;», titled how many — the x/33 is a floor, never «OK»
  const unk = s.palUnknown || 0;
  const title = [s.over ? `υπέρβαση ${_pal(s.over)}` : '', unk ? `παλέτες άγνωστες σε ${unk} ${unk === 1 ? 'φορτίο' : 'φορτία'}` : ''].filter(Boolean).join(' · ');
  return `<span class="wi4-pal${s.over ? ' over' : ''}${unk ? ' unk' : ''}"${title ? ` title="${_esc(title)}"` : ''}>${_esc(WN5L.palText(s.pallets, unk))}</span>`;
}
// 072b tiles (Figma H1 2120:7738, H3 2123:7735, Ε5 2140:7810): one tile per segment, side by side, no «/». The
// ΑΡΧΙΚΟ keeps a straight 3px line at the column's edge; every next tile has a slanted left side in its colour (CSS).
// The words are WN5L's tiles (one source with the model, T4 _tile: plate + driver, or partner + rate / «κόμιστρο
// λείπει», Ε-13 / decision 41). No time, no trailer, no «κύκλος n/m» on a tile — the ↳ row, the card and the sheet
// say those. A click on a tile opens the cycle card (H6, T25); until that file exists the click does nothing.
const SEG_GR = Object.freeze({ initial: 'ΑΡΧΙΚΟ', intermediate: 'ΕΝΔΙΑΜΕΣΟ', final: 'ΤΕΛΙΚΟ' });
const SEG_LABELS = Object.keys(SEG_GR);
const _segAttr = (l) => (SEG_LABELS.includes(l) ? ` data-seg-label="${l}"` : '');
function _tilesHTML(r) {
  const tile = (t) => {
    const lab = SEG_LABELS.includes(t.label) ? t.label : '';
    const gr = SEG_GR[lab] || '';
    return `<button type="button" class="wn5-tile ${t.type}" data-seg="${_id(t.segmentId)}" data-label="${lab}" title="${_esc([gr, t.line1, t.line2].filter(Boolean).join(' · '))}"`
      + ` onclick="event.stopPropagation();if(window.WN5Hand)WN5Hand.cycleCard(${_id(r.rtId)})"><span class="wn5-tl-bg" aria-hidden="true"></span>`
      + `<span class="wn5-tl-1"><span class="wn5-tl-l">${gr}</span><span class="wn5-tl-p">${_esc(t.line1)}</span></span>`
      + `<span class="wn5-tl-d${t.missing ? ' wn5-missing' : ''}">${_esc(t.line2)}</span></button>`;
  };
  return `<div class="wn5-tiles n${r.tiles.length}">${r.tiles.map(tile).join('')}</div>`;
}
// A reason the map does not know is said («άλλος λόγος · <code>») and logged (principle 1), never a silent blank.
// Logged once per code per page load: every repaint calls this, and a log row per repaint would bury the one signal.
const _segReasonLogged = new Set();
function _segReason(code) {
  const lr = WN5Lab.reasonLine(code);
  if (lr.unknown && !_segReasonLogged.has(String(code))) {
    _segReasonLogged.add(String(code));
    _logErr(new Error('wn5: unknown handover reason ' + code), 'WN5 tiles');
  }
  return lr.text;
}
// ⇄ in place of the → of the side where the next segment starts (Figma 2138:7745): one per side, even for two changes
// (H3 2139:7735). Only on a side whose arrow is drawn (its ΠΑΡΑΔΟΣΗ / ΠΡΟΣ cell has something).
function _hxOn(r, s, end) {
  if (!r.handovers || !r.handovers.length || !s) return false;
  if (!s.to.length && !end) return false;
  const ids = [...s.from, ...s.to].map((p) => p.stopId).concat(s.veroia ? [s.veroia.stopId] : [], end ? [end.stopId] : []);
  return r.handovers.some((x) => ids.includes(x.afterStopId));
}
const _hx = (r, s, end) => (_hxOn(r, s, end) ? ' wn5-hx' : '');
function _hxHTML(r, s, end) {
  if (!_hxOn(r, s, end)) return '';
  return `<span class="wn5-hand-x" title="Αλλαγή οχήματος" onclick="event.stopPropagation();if(window.WN5Hand)WN5Hand.cycleCard(${_id(r.rtId)})">⇄</span>`;
}
// ↳ «⇄ <point> · <day time> · <reason>» under the cycle (Figma H1 2138:7747; two changes = two entries by time, H3
// 2139:7737). The point is the dispatcher's own place_note, the time the segment's start: both the base's.
function _handRowHTML(r, ok) {
  if (!r.handovers || !r.handovers.length) return '';
  const items = r.handovers.slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map((x) => {
    const when = x.at ? `${_dow(L().athensDay(x.at))} ${L().athensTime(x.at)}` : '—';
    return `<span class="wn5-hand-i">⇄ ${_esc(x.place_note || '—')} · ${_esc(when)}</span><span class="wn5-hand-s">·</span><span class="wn5-hand-i">${_esc(_segReason(x.reason))}</span>`;
  }).join('<span class="wn5-hand-gap"></span>');
  return `<div class="wn5-sub wn5-hand${_dc(ok && r.rowDim)}" data-qi="${_esc(r.key)}" data-key="hand:${_id(r.rtId)}" data-rt="${_id(r.rtId)}">`
    + `<span class="wn5-c-idx"><span class="wn5-hand-ar">↳</span></span><span class="wn5-hand-sp"></span>${items}</div>`;
}
function _boxHTML(t, r) {
  // «ΠΡΟΣ ΑΝΑΘΕΣΗ» opens the assignment window (wired by the actions file, Task T12). A waiting row of one side names
  // the side it assigns, «ΑΝΟΔΟΣ →» / «← ΚΑΘΟΔΟΣ» (owner 28/10, live fix 3): the ΑΝΑΘΕΣΗ column is shared (H1 grid).
  if (t.type === 'un') {
    const one = r && r.kind === 'unassigned' ? (r.anod && !r.kath ? 'ΑΝΟΔΟΣ →' : r.kath && !r.anod ? '← ΚΑΘΟΔΟΣ' : '') : '';
    const side = one ? `<span class="wi4-l2 wn5-un-side">${one}</span>` : '';
    return `<button type="button" class="wi4-box un${side ? ' wn5-un-a' : ''}" data-act="assign"><span class="wi4-l1">ΠΡΟΣ ΑΝΑΘΕΣΗ</span>${side}</button>`;
  }
  // The tile is 28px high: a long name is cut by the wi4 rule with a visible «…» and stays whole in title.
  return `<span class="wi4-box ${t.type}"><span class="wi4-l1${t.type === 'own' ? ' wi4-plate' : ''}" title="${_esc(t.line1)}">${_esc(t.line1)}</span>`
    + `<span class="wi4-l2${t.missing ? ' wn5-missing' : ''}" title="${_esc(t.line2)}">${_esc(t.line2)}</span></span>`;
}
// «↳ Φόρτωση με τοπικό» under its row (Figma 2011:7745 row 3): who, when, for which stop. It dims with the stop it
// serves (the base's flag of that stop): the board carries no flag of its own for a local move.
function _localHTML(r, lm, ok) {
  const time = [lm.time_from, lm.time_to].filter(Boolean).map((t) => String(t).slice(0, 5)).join('–');
  return `<div class="wn5-sub${_dc(ok && lm.dim)}" data-qi="${_esc(r.key)}" data-key="local:${_id(lm.local_move_id)}" data-stop="${_id(lm.stopId)}">`
    // «↳» in the 48px index column, as the ⇄ sub-row's (.wn5-hand-ar, Figma 2011:7745 / H1): the text then starts at the
    // ΚΑΘΟΔΟΣ chip column. The space between the two cells is no grid item; it keeps «↳ Φόρτωση» in the row's text.
    + '<span class="wn5-c-idx"><span class="wn5-hand-ar">↳</span></span> '
    + `<span class="wn5-sub-t"><b>Φόρτωση με τοπικό</b> · ${_esc(lm.driver || 'χωρίς οδηγό')} · ${_esc(_dl(lm.move_date))}${time ? ' ' + _esc(time) : ''}`
    + (lm.pickup
      // a pickup (Figma 2011:8305): what is loaded there → Βέροια, then the delivery it is for (none named when the
      // leg unloads at Veroia or off this cycle — never the pickup's own place after «για»)
      ? ` · ${_esc(lm.pickup.who ? `${lm.pickup.who}, ${lm.pickup.place}` : lm.pickup.place)} → Βέροια · ${_esc(_pal(lm.pickup.pallets, lm.pickup.palUnknown))}`
        + (lm.forStops && lm.forStops.length ? ` · για ${lm.forStops.map((f) => `${_esc(f.name)}${f.n ? ` (στάση ${f.n})` : ''}`).join(', ')}` : '')
      : `${lm.stopName ? ` · για ${_esc(lm.stopName)}${lm.stopN ? ` (στάση ${lm.stopN})` : ''}` : ''}`)
    // T17: the cancel of THIS loading (no request_id); the id is the board's local_move_id
    + `<button type="button" class="wi4-link wn5-sub-x" data-act="local-cancel" data-lm="${_id(lm.local_move_id)}">Ακύρωση</button></span></div>`;
}
// ═══ end of rows ═══

// ═══ ✈ row menu (Figma 2011:8858) ═══
// Each Task appends its line to WN5.MENU_ITEMS; `order` keeps the Figma order whatever the order of the Tasks:
// 10 Άνοιγμα παραγγελιών · 20 Ανάθεση · 30 Νέα παραγγελία · 40 Φόρτωση με τοπικό · 50 Σπάσιμο · 60 Εκτύπωση ·
// 70 Αντιγραφή πινακίδων · 80 Αλλαγή οχήματος… · 90 Καθαρισμός (danger, after a separator).
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
  // plates · driver, or the partner (owner 31/10: no RT code, no «κύκλος n/m» on the board)
  return (c && ([c.truck, c.driver].filter(Boolean).join(' · ') || c.partner)) || '—';
}
function _menuSub(row) {
  const s = row.kath || row.anod;
  if (!s || !s.day) return '';
  return _dl(s.day) + (row.kath && row.kath.veroia ? ` · Βέροια ${_winTxt(row.kath.veroia.from, row.kath.veroia.to, row.kath.veroia.allDay)}` : '');
}
function _closeMenu() { const m = document.getElementById('wn5-menu'); if (m) m.remove(); }
// Ε-22: only the cycle's truck and trailer — nothing of the hub, nothing of a VS (Veroia is never shown to a
// client). A partner's cycle has no plates on the board: copyPlates says so instead of copying nothing.
function _platesOf(rtId) {
  const c = _cycleOf(rtId);
  return c && typeof platesText === 'function' ? platesText(c.truck, c.trailer, null) : '';
}
function copyPlatesOf(rtId) {
  const text = _platesOf(rtId);
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
  // ...and when a web font lands after the paint (the swap widens the words, not #content: _fitAfterFonts).
  try { if (document.fonts && typeof document.fonts.addEventListener === 'function') document.fonts.addEventListener('loadingdone', () => { if (active() && document.querySelector('#content .wn5')) _fitUpd(); }); } catch (_) {}
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
// ═══ ONE top bar (Figma 2120:7825 «Top bar 60px», as on 2011:7745) ═══
// The frame draws title, range, ↻, week tabs, actions, bell and avatar in ONE 60px bar; the app's own bar stacked over
// the board's repeated the title and cost ~56px of a 900px screen (whole-frame r3). This is the Weekly International
// v4 mechanism (modules/weekly_intl_v2.js _topMount, owner 11/10), mirrored here because WIV2's functions are private
// and its page-leave observer removes #wi4-top / wi4-top-on whenever WIV2 is not active — i.e. at every v5 paint. So
// v5 has its own slot (#wn5-top, class "wi4 wn5" so every `.wi4 …` / `.wn5 …` rule still reaches the bar) and its own
// body class (wn5-top-on, assets/style.css wn5 block). The bar is painted with the board, then moved; _cleanup (page
// left, «Παλιά προβολή», a failed paint → old board) takes it out and the app's own title and Sign out come back.
function _bar() { return document.querySelector('#wn5-top > .wn5-bar') || document.querySelector('#content > .wn5 > .wn5-bar'); }
function _topMount() {
  const tb = document.querySelector('.main > .topbar');
  const bar = document.querySelector('#content > .wn5 > .wn5-bar');
  if (!tb || !bar) return;   // no app top bar (a bare page): the bar stays on the board, as before
  let slot = document.getElementById('wn5-top');
  if (!slot) {
    slot = document.createElement('div');
    slot.id = 'wn5-top';
    slot.className = 'wi4 wn5 wn5-top';
    tb.insertBefore(slot, tb.querySelector('.topbar-right'));
  }
  slot.replaceChildren(bar);
  document.body.classList.add('wn5-top-on');
  _umenuMount();
  // measured after wn5-top-on: that class hides the name, the role and Sign out, which changes .topbar-right's width
  _topFit();
  _topWatch();
}
// The frame centres the week tabs between the title's left edge and the avatar's right edge (2120:7826 and 2120:7861
// are both 663 wide, the bell and the avatar INSIDE the right one). Here they are the app's .topbar-right, outside the
// bar's grid: the slot reaches under it by its width + the top bar's gap (--wn5-tr) and the actions step back by as
// much (CSS), so the two side tracks are equal again. The variable lives on the slot and leaves with it.
function _topFit() {
  const slot = document.getElementById('wn5-top');
  const tb = slot && slot.parentElement, tr = tb && tb.querySelector('.topbar-right');
  if (!tr) return;
  const w = tr.getBoundingClientRect().width + (parseFloat(getComputedStyle(tb).columnGap) || 0);
  slot.style.setProperty('--wn5-tr', w + 'px');
}
// ONE observer on the app's top bar and its right end (the undo button appears there without the bar changing size).
let _topRO = null;
function _topWatch() {
  const tb = !_topRO && typeof ResizeObserver === 'function' && document.querySelector('.main > .topbar');
  if (!tb) return;
  _topRO = new ResizeObserver(() => { if (document.getElementById('wn5-top')) { _topFit(); _fitUpd(); } });
  _topRO.observe(tb);
  const tr = tb.querySelector('.topbar-right');
  if (tr) _topRO.observe(tr);
}
function _topUnmount() {
  const slot = document.getElementById('wn5-top');
  if (slot) slot.remove();
  try { document.body.classList.remove('wn5-top-on'); } catch (_) {}
  _umenuUnmount();
}
// Name, role and Sign out behind the avatar (the frame ends the bar with the avatar «Δ» alone), as WIV2 does: built
// from what the app wrote in the chip, so it never disagrees with it. Never a bar without a way to sign out.
let _umenu = null;
function _umenuTog(ev) {
  if (!_umenu) return;
  if (ev && ev.target && _umenu.contains(ev.target)) return;
  if (ev) ev.stopPropagation();
  const open = _umenu.hidden;
  _umenu.hidden = !open;
  if (_umenu.parentElement) _umenu.parentElement.setAttribute('aria-expanded', String(open));
  if (open) document.addEventListener('click', _umenuClose, { once: true });
}
function _umenuClose() {
  if (!_umenu) return;
  _umenu.hidden = true;
  if (_umenu.parentElement) _umenu.parentElement.setAttribute('aria-expanded', 'false');
}
// Esc, Enter and Space stop here; inside the menu the button keeps its own Enter/Space. The open menu owns ↓/↑/Home/End.
function _umenuKey(ev) {
  if (!_umenu) return;
  const chip = _umenu.parentElement;
  if (!_umenu.hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) {
    const its = [..._umenu.querySelectorAll('[role="menuitem"]')];
    if (!its.length) return;
    ev.preventDefault(); ev.stopPropagation();
    const i = its.indexOf(document.activeElement), last = its.length - 1;
    const k = ev.key === 'Home' ? 0 : ev.key === 'End' ? last
      : ev.key === 'ArrowDown' ? (i < 0 || i === last ? 0 : i + 1) : (i <= 0 ? last : i - 1);
    its[k].focus();
    return;
  }
  if (ev.key !== 'Escape' && ev.key !== 'Enter' && ev.key !== ' ') return;
  ev.stopPropagation();
  if (ev.key === 'Escape') { ev.preventDefault(); _umenuClose(); if (chip) chip.focus(); return; }
  if (_umenu.contains(ev.target)) return;
  ev.preventDefault(); _umenuTog(ev);
  if (!_umenu.hidden) { const f = _umenu.querySelector('[role="menuitem"]'); if (f) f.focus(); }
}
function _umenuOut(ev) {
  if (!_umenu || _umenu.hidden) return;
  const chip = _umenu.parentElement;
  if (ev.relatedTarget && chip && !chip.contains(ev.relatedTarget)) _umenuClose();
}
// The chip's button attributes, set on every mount AND once more after the current task: leaving the Weekly
// International for v5, WIV2's page-leave MutationObserver runs its _umenuUnmount in the microtasks AFTER v5's paint
// mounted this menu and strips them unconditionally — and a cached week paints only once, so a later paint cannot be
// relied on. Without this the chip stayed unfocusable and «Αποσύνδεση» mouse-only (whole-frame fix round 1).
function _umenuReapply() { if (_umenu && _umenu.isConnected && _umenu.parentElement) _umenuChip(_umenu.parentElement); }
function _umenuChip(chip) {
  const name = (document.getElementById('userName') || {}).textContent || '';
  chip.setAttribute('role', 'button');
  chip.setAttribute('tabindex', '0');
  chip.setAttribute('aria-haspopup', 'true');
  chip.setAttribute('aria-expanded', String(!!_umenu && !_umenu.hidden));
  chip.title = name ? name + ' — Αποσύνδεση' : 'Αποσύνδεση';
}
function _umenuMount() {
  const chip = document.querySelector('.topbar .user-chip');
  if (!chip) return;
  setTimeout(_umenuReapply, 0);   // after the observers of this task (WIV2's page-leave) have run
  if (_umenu) { _umenuReapply(); return; }
  const name = (document.getElementById('userName') || {}).textContent || '';
  const role = (document.getElementById('roleBadge') || {}).textContent || '';
  const m = document.createElement('div');
  m.className = 'wi4-umenu wn5-umenu';
  m.hidden = true;
  m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="wi4-umenu-h">${_esc(name)}${role ? ` <span>· ${_esc(role)}</span>` : ''}</div>`
    + '<button type="button" role="menuitem" onclick="logout()">Αποσύνδεση</button>';
  chip.appendChild(m);
  chip.addEventListener('click', _umenuTog);
  chip.addEventListener('keydown', _umenuKey);
  chip.addEventListener('focusout', _umenuOut);
  _umenu = m;
  _umenuChip(chip);
}
function _umenuUnmount() {
  if (!_umenu) return;
  const chip = _umenu.parentElement;
  _umenu.remove();
  _umenu = null;
  document.removeEventListener('click', _umenuClose);
  if (!chip) return;
  chip.removeEventListener('click', _umenuTog);
  chip.removeEventListener('keydown', _umenuKey);
  chip.removeEventListener('focusout', _umenuOut);
  // Leaving v5 for the Weekly International: its paint may have put ITS menu on the chip before this observer ran —
  // the chip's button attributes are then its, not ours to take away.
  if (chip.querySelector('.wi4-umenu')) return;
  ['role', 'tabindex', 'aria-haspopup', 'aria-expanded', 'title'].forEach((a) => chip.removeAttribute(a));
}
function _cleanup() {
  try { if (typeof WN5Act !== 'undefined') WN5Act.closeAll(); } catch (_) {}   // no dialog survives the page it belongs to
  try { document.body.classList.remove('wn5-on'); } catch (_) {}
  try { _topUnmount(); } catch (e) { _logErr(e, 'weekly natl v5: top bar unmount'); }
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

// ═══ Notices strip ═══
// «Σημείωσα» marks notices read — one POST per notice, body {}, sent once per press (planFetch never re-sends),
// stopping at the first «no». A 409 writes_closed: its message is shown, the notices stay, the buttons stay off (Ε-6).
// Notices (owner 31/10, over Figma 2011:7745's amber line): a quiet white strip as the ΒΕΡΟΙΑ one, ONE line however
// many come. Grouped by order (one line per VS / national order, or per truck when a notice names only its cycle):
// «VS 2130 · νέος προορισμός: …», the order a link to its row. The newest group is on the line; the others are counted
// in «+N ακόμη ▾» and unfold under it — a notice is never hidden without its number on screen. «Σημείωσα» per group
// and «Σημείωσα όλες ✓».
// The words: the base's message reads «… της VS 2130: τα κομμάτια …», «… (trigger:plan_bridge_sync) …» — codes and
// the terms the owner does not want on the board. A kind this screen knows gets a short line of its own (the value the
// message carries, e.g. the new destination, is kept); a kind it does not know shows the base's message as it is,
// less the «(trigger:…)» tag, never nothing.
const NOTE_TXT = Object.freeze({
  vs_day_moved: 'ημέρα Βέροιας άλλαξε · ξανά προς ανάθεση',
  vs_day_moved_kept: 'ημέρα άλλαξε · έμεινε στο φορτηγό του · έλεγξε ώρες',
  vs_withdrawn: 'βγήκε από τα εθνικά',
  vs_changed_after_execution: 'άλλαξε μετά την εκτέλεση · έλεγξε το φορτηγό',
  legacy_nl_replaced: 'πέρασε στον νέο πίνακα · ανάθεσέ την ξανά',
});
const _noteClean = (t) => String(t || '').replace(/\s*\(trigger:[^)]*\)/gi, '').trim();
function _noteText(x) {
  if (x.kind === 'vs_place_changed') {
    const t = String(x.message || ''), i = t.lastIndexOf(' → ');
    return 'νέος προορισμός' + (i >= 0 ? ': ' + t.slice(i + 3).trim() : '');
  }
  return NOTE_TXT[x.kind] || _noteClean(x.message) || '—';
}
// What the board knows of each order: its reference and its pieces (cycles' legs, waiting, hub) — read from the
// board in hand, so a link goes to a row of THIS week or is not drawn.
function _noteIndex() {
  const ix = new Map();
  const put = (k, ref, pc) => { if (!k) return; const e = ix.get(k) || { ref: null, pieces: new Set() }; if (!e.ref && ref) e.ref = String(ref); if (pc != null) e.pieces.add(Number(pc)); ix.set(k, e); };
  const key = (o) => (o.order_id != null ? 'o' + o.order_id : o.nat_order_id != null ? 'n' + o.nat_order_id : null);
  const b = _board || {};
  for (const c of b.cycles || []) for (const st of c.stops || []) for (const l of st.legs || []) put(key(l), l.reference, l.piece_id);
  for (const w of [...(b.waiting || []), ...(b.hub || [])]) put(key(w), w.reference, w.piece_id);
  return ix;
}
function _noteGroups(m) {
  const ix = _noteIndex();
  const rows = m.days.flatMap((d) => d.rows);
  const byPiece = new Map();
  for (const r of rows) for (const pc of r.pieceIds || []) if (!byPiece.has(Number(pc))) byPiece.set(Number(pc), r.key);
  const groups = new Map();
  for (const x of m.notices) {
    const ok = x.order_id != null ? 'o' + x.order_id : x.nat_order_id != null ? 'n' + x.nat_order_id : null;
    const gk = ok || (x.rt_id != null ? 'r' + x.rt_id : 'i' + x.id);
    let g = groups.get(gk);
    if (!g) {
      const e = ok ? ix.get(ok) : null;
      // the order's reference from the board, else the «VS <ref>» the base wrote in the message; a cycle is its truck
      const m1 = !e || !e.ref ? /\bVS ([^:(]+?)(?::|\s\(|\sβγήκε|\sάλλαξε|\sπέρασε|$)/.exec(String(x.message || '')) : null;
      const ref = (e && e.ref) || (m1 && m1[1].trim()) || null;
      const c = !ok && x.rt_id != null ? _cycleOf(x.rt_id) : null;
      // «VS 2130»; a reference that already says it («VS-118») is not prefixed twice
      const name = ok ? (ref && /^VS[-\s]/i.test(ref) ? ref : `${x.order_id != null ? 'VS' : 'Εθνική'}${ref ? ' ' + ref : ''}`)
        : c ? ([c.truck, c.driver].filter(Boolean).join(' · ') || c.partner || 'Δρομολόγιο') : '';
      let rowKey = null;
      if (x.rt_id != null && rows.some((r) => r.key === 'rt:' + x.rt_id)) rowKey = 'rt:' + x.rt_id;
      else if (e) for (const pc of e.pieces) if (byPiece.has(pc)) { rowKey = byPiece.get(pc); break; }
      g = { key: gk, name, rowKey, items: [] };
      groups.set(gk, g);
    }
    g.items.push(x);
  }
  return [...groups.values()];
}
function _noteAt(x) {
  if (!x.created_at) return '';
  const who = x.created_by && !/^trigger:/i.test(x.created_by) ? (typeof userDisplayName === 'function' ? userDisplayName(x.created_by) : x.created_by) : '';
  return [_dow(L().athensDay(x.created_at)) + ' ' + L().athensTime(x.created_at), who].filter(Boolean).join(' · ');
}
function _noteLineHTML(g, off, own) {
  const texts = [...new Set(g.items.map(_noteText))];
  const ids = g.items.map((x) => _id(x.id)).join(',');
  const at = _noteAt(g.items[0]);
  const full = [g.name, ...texts, at].filter(Boolean).join(' · ');
  const who = !g.name ? '' : g.rowKey
    ? `<button type="button" class="wi4-link wn5-note-who" title="Στη γραμμή" onclick="WN5.focusRow('${_esc(g.rowKey)}')">${_esc(g.name)}</button>`
    : `<b class="wn5-note-who" title="Δεν είναι γραμμή αυτής της εβδομάδας">${_esc(g.name)}</b>`;
  return `<span class="wn5-note" data-id="${_id(g.items[0].id)}" data-ids="${ids}" title="${_esc(full)}">${who}`
    // \u00a0: a flex item drops a leading space, and «VS 2130· νέος» read as one word
    + `<span class="wn5-note-t">${g.name ? '\u00a0· ' : ''}${_esc(texts.join(' · '))}</span>${at ? `<span class="wn5-note-by">\u00a0· ${_esc(at)}</span>` : ''}`
    + (own ? `<button type="button" class="wi4-link wn5-note-ok"${off ? ' disabled' : ''} onclick="WN5._noteRead('${_esc(g.key)}')">Σημείωσα</button>` : '')
    + '</span>';
}
function _noticesHTML(m) {
  if (!m || !m.notices.length) return '';
  const off = _noteBusy || !!_closed;
  const gs = _noteGroups(m);
  const more = gs.length - 1;
  return `<div id="wn5-notices" class="wn5-notes" role="status"><b class="wn5-notes-h">ΕΙΔΟΠΟΙΗΣΕΙΣ<span class="wn5-notes-n"> · ${m.notices.length}</span></b>`
    + `<span class="wn5-notes-l">${_noteLineHTML(gs[0], off, more > 0)}</span>`
    + (more ? `<button type="button" class="wi4-link wn5-notes-more" aria-expanded="${_notesOpen}" onclick="WN5._notesTog()">${_notesOpen ? 'λιγότερες ▴' : `+${more} ακόμη ▾`}</button>` : '')
    + `<button type="button" id="wn5-note-read" class="wi4-link"${off ? ' disabled' : ''}${_closed ? ` title="${_esc(_closed.message)}"` : ''} onclick="WN5._noteRead()">${more ? 'Σημείωσα όλες ✓' : 'Σημείωσα ✓'}</button>`
    + (more ? `<div class="wn5-notes-rest"${_notesOpen ? '' : ' hidden'}>${gs.slice(1).map((g) => _noteLineHTML(g, off, true)).join('')}</div>` : '')
    + '</div>';
}
function _notesTog() { _notesOpen = !_notesOpen; _paintNotices(); }
// A row found again and shown (F50, owner 31/10; a notice's link too): its day opened if the user folded it, scrolled
// into view, marked as the row in hand (.wn5-focus, until the next paint) and flashed once — the Weekly International's
// focusRow. false = no such row on this board (nothing scrolls).
function focusRow(key) {
  const sel = `#content .wn5 .wn5-row[data-key="${String(key).replace(/["\\]/g, '')}"]`;
  let el = document.querySelector(sel);
  const day = el && el.closest('.wn5-day.closed');
  if (day) { _dayTog(day.dataset.date); el = document.querySelector(sel); }
  if (!el) return false;
  for (const x of document.querySelectorAll('#content .wn5 .wn5-row.wn5-focus')) x.classList.remove('wn5-focus');
  el.classList.add('wn5-focus', 'wn5-flash');
  try { el.scrollIntoView({ block: 'nearest' }); } catch (_) {}
  setTimeout(() => { if (el.isConnected) el.classList.remove('wn5-flash'); }, 1500);
  return true;
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
async function _noteRead(group) {
  if (_noteBusy || _closed || !active() || !_m) return;
  // one group (its «Σημείωσα») or all of them (the strip's button)
  const g = group ? _noteGroups(_m).find((x) => x.key === group) : null;
  if (group && !g) return;
  const ids = (g ? g.items : _m.notices).map((x) => x.id).filter((id) => ID_RE.test(String(id)));
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
  _notesTog,
  focusRow,
  _leg,
  _cpy,
  _orderCard,
  orderCardBtn,
  MENU_ITEMS: [
    // T18: the orders of the cycle with their number (Figma 2011:8858 «Άνοιγμα παραγγελιών 4»); delete lives in the
    // order card only (owner 19/10)
    { id: 'orders', order: 10, label: 'Άνοιγμα παραγγελιών', count: (rtId) => WN5Act.cycleOrderCount(rtId), run: (rtId) => WN5Act.cycleOrders(rtId) },
    // T12: the same Δ1 window as the red box and ΕΠΟΜΕΝΑ; on a cycle it changes the vehicle (PATCH /plan/rt/:id)
    { id: 'assign', order: 20, label: 'Ανάθεση / αλλαγή φορτηγού ή συνεργάτη', run: (rtId) => WN5Act.assign(null, { entry: 'menu', rtId }) },
    // T20: the same short form as the «+» of a leg (S-45): target = this cycle's side, day/Veroia from the cycle
    { id: 'new-order', order: 30, label: 'Νέα παραγγελία σε αυτό το δρομολόγιο', children: [
      { id: 'new-order-k', label: 'Κάθοδος', run: (rtId) => WN5Form.openOrder({ side: 'KATHODOS', rtId }) },
      { id: 'new-order-a', label: 'Άνοδος', run: (rtId) => WN5Form.openOrder({ side: 'ANODOS', rtId }) }] },
    // T17: the stop is chosen inside the window (its day is the stop's day, 072:2283)
    { id: 'local', order: 40, label: 'Φόρτωση με τοπικό', sub: 'οδηγός · ημέρα · στάση ›', run: (rtId) => WN5Act.local(null, rtId) },
    // T14: the KATHODOS deliveries go back to Veroia for splitting (S-69, Figma 2011:8858 note)
    { id: 'split-hub', order: 50, label: 'Σπάσιμο παραγγελιών', sub: '→ Βέροια', run: (rtId) => WN5Act.move({ rt_id: rtId, side: 'KATHODOS' }, { direct: 'wait' }) },
    // T23: one click = the A4 to print + the same as a WhatsApp text in the clipboard (Figma 2011:10998).
    // ONE «Εκτύπωση / WhatsApp ›» line with the submenu of Figma 2011:8858: «Κάθοδος · Άνοδος · Όλο το δρομολόγιο».
    { id: 'sheet', order: 60, label: 'Εκτύπωση / WhatsApp', children: [
      { id: 'sheet-k', label: 'Κάθοδος', run: (rtId) => WN5Sheet.print(rtId, 'KATHODOS') },
      { id: 'sheet-a', label: 'Άνοδος', run: (rtId) => WN5Sheet.print(rtId, 'ANODOS') },
      { id: 'sheet-all', label: 'Όλο το δρομολόγιο', run: (rtId) => WN5Sheet.print(rtId, 'ALL') }] },
    { id: 'plates', order: 70, label: 'Αντιγραφή πινακίδων', run: (rtId) => copyPlatesOf(rtId) },
    // owner 31/10 (B-13 = α, Figma 2396:7831): the way into the vehicle change (H2) for every cycle, also one never changed
    { id: 'handover', order: 80, label: 'Αλλαγή οχήματος…', sub: '›', run: (rtId) => WN5Hand.entry(rtId) },
    // T15: last and red (Figma 2011:8858); owner + dispatcher on the Worker, but visible to all (Δ12 tile 8)
    { id: 'clear', order: 90, label: 'Καθαρισμός ανάθεσης', sub: 'κάθοδος + άνοδος', danger: true, run: (rtId) => WN5Act.clear(rtId) },
  ],
  // The board HTML of a model, for tests/wn5-board-html.test.js (pure: model in, string out).
  _html: (m) => _boardHTML(m, true),
  _menuItems,
  vsDayOf,
  vsDayRead,
  vsDaysSettled,
  _dayTog,
  _qMore,
  _week,
  _switch,
};
window.WN5 = WN5;
})();
