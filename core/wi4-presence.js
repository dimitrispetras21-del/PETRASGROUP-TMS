// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL v4 — presence client (global WI4Presence)
// ─────────────────────────────────────────────────────────────────────
// Spec: docs/weekly-intl-redesign/TECH_DESIGN.md §g.4 (+ §e #18, §g.5). Owner: WP7.
//
// Presence is an indication, never a lock, and never claims «κανείς»
// (owner 10/10, option A). Beats start only from WIV2.paint() while
// FEATURES.WI_PRESENCE is true — never at load — because every beat is a
// Worker request on the Free plan's 100k/day budget for the whole app.
// At load this file only defines WI4Presence: no listener, timer, observer
// or fetch (§b step 6, checked by tests/wi4-contract.test.js).
//
// API (WP4 calls start/reattach/stop from WIV2.paint and page changes; WP5
// calls setContext from its openers; both read others/state):
//   start({week?, onPatch?, isActive?, changesSince?}) → boolean   idempotent
//   stop(reason?)                    timers, listeners, observer off; one leave
//   setContext({week, record, part, action})   coalesced into the next beat
//   reattach(resolve?) → boolean     re-observe #wi-popover after every paint
//   others() → [{sub, name, seen_at, weeks, records:[{record, part, action, since, week}]}]
//   state()  → {status, others, changes, lastOk}
//   actionText(action) · tipText(name, rec) · stripText()   copy, from the whitelist
//
// status: 'off' (not started, or the owner's lever / session end: draw
// nothing) · 'pending' (started, no answer yet: draw nothing — no claim
// either way) · 'live' · 'paused' (we do NOT know who else is here) ·
// 'forbidden' (403 for this role).
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

// The SAME six strings as the SQL CHECK (068) and the Worker's
// PRESENCE_ACTIONS. Tooltip text is looked up here, never taken from what
// the server returns, so a stored string can never reach a colleague's screen.
const ACTION_TEXT = Object.freeze({
  view: 'βλέπει τον πίνακα',
  menu: 'έχει ανοιχτό το μενού',
  assign: 'αλλάζει την ανάθεση',
  'date:Loading DateTime': 'αλλάζει την ημερομηνία φόρτωσης',
  'date:Delivery DateTime': 'αλλάζει την ημερομηνία εκφόρτωσης',
  'date:VS CD Date': 'αλλάζει την ημερομηνία Βέροιας',
});
const PARTS = Object.freeze(['truck', 'export', 'import']);
const TAB_RE = /^[a-z0-9]{8,16}$/;
const RECORD_RE = /^rec[A-Za-z0-9]{6,30}$/;
const TAB_KEY = 'tms_wi4_tab';
// The Worker refuses the same (sub, tab) within 2 s (429). Nothing here ever
// sends two beats closer than this, whatever the context does: revision 1's
// 500 ms debounce against that guard produced 429s in normal use (§g.4).
const MIN_GAP_MS = 2500;
const TTL_MAX_MS = 600000;           // the Worker's upper bound for ttl_ms
// A beat that never answers must not hold `inFlight` for ever (every later
// beat would return early and the strip would keep a frozen «ζωντανά").
const BEAT_TIMEOUT_MS = 10000;
// «live» is a claim about NOW: without a fresh answer it turns into «σε παύση»
// by itself — max(20 s, 3 × the wait we last scheduled).
const FRESH_MIN_MS = 20000;
const DEFAULT_CFG = Object.freeze({ active: 5000, idle: 30000, idleAfter: 120000 });
const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel', 'mousemove', 'touchstart'];

const TEXT = Object.freeze({
  here: 'εδώ τώρα',
  live: '↻ ζωντανά',
  paused: 'Ζωντανή εικόνα σε παύση — δεν ξέρουμε ποιος άλλος είναι μέσα · ξαναδοκιμάζει',
  forbidden: 'Η ζωντανή εικόνα δεν είναι διαθέσιμη για τον ρόλο σου',
  // The state WORD each sentence starts from, for a title bar too narrow for
  // the whole sentence (review 11/10: «… · εδώ τώρα · ↻ ζ…» at 1920). The
  // board keeps the word whole and puts the sentence in its title.
  liveWord: 'ζωντανά',
  pausedWord: 'σε παύση',
  forbiddenWord: 'μη διαθέσιμη',
});

let _tab = null;                     // per browser tab, survives reloads of the tab
let _forbiddenLogged = false;
let _badBodyLogged = false;

const S = {
  running: false,
  stoppedFor: null,                  // 'session' after 401/403/410: no restart until reload
  status: 'off',
  others: [],
  changes: null,
  lastOk: null,
  ctx: { week: null, record: null, part: null, action: 'view' },
  opts: {},
  timer: null, timerAt: 0,
  nextAt: 0,                         // the earliest next beat the last answer allowed (back-off included)
  inFlight: false,
  dirty: false,                      // context changed while a beat was in flight
  lastSentAt: -Infinity,
  beaten: false,                     // at least one beat sent (a leave is worth sending)
  failures: 0,
  retryAfterMs: null,
  serverNextMs: null,
  lastDelay: null,                   // the wait scheduled after the last good answer
  lastInputAt: 0,
  obs: null,
  listeners: [],
};

const _now = () => Date.now();
const _cfg = () => (typeof WI_PRESENCE_MS !== 'undefined' && WI_PRESENCE_MS) || DEFAULT_CFG;
const _logErr = (e, ctx) => { try { if (typeof logError === 'function') logError(e, ctx); else console.error(ctx, e); } catch (_) {} };
const _visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
function _internal() {
  try { return typeof WI_INTERNAL !== 'undefined' && WI_INTERNAL ? WI_INTERNAL : null; } catch (_) { return null; }
}
function _wintl() { const I = _internal(); return I && I.WINTL ? I.WINTL : null; }

function tabId() {
  if (_tab) return _tab;
  try {
    const v = sessionStorage.getItem(TAB_KEY);
    if (v && TAB_RE.test(v)) return (_tab = v);
  } catch (_) { /* storage blocked: an in-memory id for this page is enough */ }
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  try {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    for (const x of b) s += abc[x % 36];
  } catch (_) {
    for (let i = 0; i < 12; i++) s += abc[Math.floor(Math.random() * 36)];
  }
  _tab = s;
  try { sessionStorage.setItem(TAB_KEY, s); } catch (_) {}
  return s;
}

// Whitelist the context before it can travel: an unknown action becomes
// 'view', a malformed record or part becomes null. A value outside the list
// would earn a 400 from the Worker on every beat.
function _cleanCtx(c) {
  const week = Number.isInteger(c && c.week) && c.week >= 1 && c.week <= 53 ? c.week : null;
  const record = c && typeof c.record === 'string' && RECORD_RE.test(c.record) ? c.record : null;
  const part = c && PARTS.includes(c.part) ? c.part : null;
  const action = c && Object.prototype.hasOwnProperty.call(ACTION_TEXT, c.action) ? c.action : 'view';
  return { week, record, part, action };
}

function _isActive() {
  try {
    if (typeof S.opts.isActive === 'function') return !!S.opts.isActive();
    if (typeof currentPage !== 'undefined' && currentPage !== 'weekly_intl') return false;
    return typeof WIV2 !== 'undefined' && typeof WIV2.active === 'function' && WIV2.active() === true;
  } catch (_) { return false; }
}

function _changesSince() {
  try {
    const v = typeof S.opts.changesSince === 'function' ? S.opts.changesSince() : (_wintl() || {})._loadedAt;
    if (v == null || v === '') return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  } catch (_) { return null; }
}

// A beat result redraws only the presence spots (avatar strip, index cells,
// panel note) through WIV2.presencePatch. Never a paint: an open popover,
// menu, date panel, search focus and scroll must survive every beat (§e #18).
function _patch() {
  try {
    if (typeof S.opts.onPatch === 'function') S.opts.onPatch();
    else if (typeof WIV2 !== 'undefined' && typeof WIV2.presencePatch === 'function') WIV2.presencePatch();
  } catch (e) { _logErr(e, 'wi4 presence: patch'); }
}

function _clearTimer() { if (S.timer) { clearTimeout(S.timer); S.timer = null; S.timerAt = 0; } }
function _schedule(ms) {
  const at = _now() + Math.max(0, ms);
  if (S.timer && S.timerAt <= at) return;     // an earlier beat is already due
  _clearTimer();
  S.timerAt = at;
  S.timer = setTimeout(_beat, Math.max(0, ms));
}
// The earliest moment the next beat may leave: never closer than MIN_GAP_MS.
const _gapLeft = () => Math.max(0, S.lastSentAt + MIN_GAP_MS - _now());

function _delay(lastStatus) {
  const W = typeof WI4 !== 'undefined' ? WI4 : null;
  const args = {
    visible: _visible(), lastInputAgoMs: _now() - S.lastInputAt, failures: S.failures,
    lastStatus, retryAfterMs: S.retryAfterMs, serverNextMs: S.serverNextMs, cfg: _cfg(),
  };
  if (W && typeof W.beatDelay === 'function') return W.beatDelay(args);
  return null; // without the pacing rules nothing is sent (born closed)
}

function _sessionStop(status) {
  S.stoppedFor = 'session';
  S.status = status;
  S.others = [];
  S.changes = null;
  _teardown();
}

// `changes` counts what the server saw since changes_since, but the server
// clamps that window to 15 minutes (068): a change counted at one beat can
// fall out of the next. The count therefore only grows until the board
// re-reads (a new changes_since), so the button never vanishes with nothing
// refreshed.
function _latchChanges(prev, next, since) {
  const same = !!prev && prev._since === since;
  if (!next) return same ? prev : null;
  const n = Math.max(+next.n || 0, same ? +prev.n || 0 : 0);
  const auto = Math.max(+next.auto_n || 0, same ? +prev.auto_n || 0 : 0);
  const newer = +next.n > 0 || !same;
  return { n, auto_n: auto, last_by: newer ? next.last_by || null : prev.last_by, last_at: newer ? next.last_at || null : prev.last_at, _since: since };
}

// Every answer lands here. Unknown is never drawn as empty: a failure clears
// the list and says «σε παύση»; only a 2xx carrying an `others` array is live.
function _handle(status, body, since) {
  const ok = status >= 200 && status < 300;
  if (status === 410 || (body && body.stop === true)) { _sessionStop('off'); return 'stop'; }
  if (status === 401) {
    // The 8-hour JWT ended. Exactly once: the session stop below means no
    // further beat (and no restart) can ever earn a second 401 on this page,
    // so there is never a «σε παύση» loop of doomed beats.
    _sessionStop('off');
    try { if (typeof tmsSessionExpired === 'function') tmsSessionExpired('presence'); } catch (_) {}
    return 'stop';
  }
  if (status === 403) {
    _sessionStop('forbidden');
    if (!_forbiddenLogged) { _forbiddenLogged = true; _logErr(new Error('presence 403 for this role'), 'wi4 presence: forbidden'); }
    return 'stop';
  }
  if (status === 429) {
    // Our own pacing, not an outage: keep what we know, wait what the Worker asked.
    S.retryAfterMs = body && Number(body.retry_after_ms) > 0 ? Number(body.retry_after_ms) : null;
    return 429;
  }
  S.retryAfterMs = null;
  if (ok && body && Array.isArray(body.others)) {
    S.status = 'live';
    S.others = _dedupe(body.others);
    S.changes = _latchChanges(S.changes, body.changes && typeof body.changes === 'object' ? body.changes : null, since == null ? null : since);
    S.lastOk = _now();
    S.failures = 0;
    S.serverNextMs = Number(body.next_ms) > 0 ? Number(body.next_ms) : null;
    return 200;
  }
  S.failures++;
  S.status = 'paused';
  S.others = [];
  if (status === 404) return 404;
  if (status === 0 || status >= 500 || ok) return 0; // a 2xx without the list is not «nobody»
  // 400/422: our body was refused and will not fix itself. Log once and back
  // off as slowly as for an absent endpoint, still «σε παύση».
  if (!_badBodyLogged) { _badBodyLogged = true; _logErr(new Error('presence ' + status + ' ' + String((body && body.error) || '').slice(0, 120)), 'wi4 presence: refused'); }
  return 404;
}

// One avatar per person (the server already groups by sub; a second guard
// costs nothing). Records keep only whitelisted actions.
function _dedupe(list) {
  const by = new Map();
  for (const p of list) {
    if (!p || typeof p !== 'object' || !p.sub) continue;
    const recs = (Array.isArray(p.records) ? p.records : [])
      .filter((r) => r && Object.prototype.hasOwnProperty.call(ACTION_TEXT, r.action))
      .map((r) => ({ record: r.record || null, part: r.part || null, action: r.action, since: r.since || null, week: r.week == null ? null : r.week }));
    const prev = by.get(p.sub);
    if (prev) { prev.records.push(...recs); continue; }
    by.set(p.sub, { sub: String(p.sub), name: String(p.name || p.sub), seen_at: p.seen_at || null,
      weeks: Array.isArray(p.weeks) ? p.weeks.slice() : [], records: recs });
  }
  return [...by.values()];
}

async function _beat() {
  S.timer = null; S.timerAt = 0;
  if (!S.running) return;
  if (!_isActive()) { stop('inactive'); return; }
  if (!_visible()) return;                    // resumes on visibilitychange
  if (S.inFlight) { S.dirty = true; return; }
  const gap = _gapLeft();
  if (gap > 0) { _schedule(gap); return; }

  const next = _delay(200);
  if (next == null || next === 'stop') return;
  const ctx = S.ctx;
  const week = ctx.week != null ? ctx.week : _cleanCtx({ week: (_wintl() || {}).week }).week;
  const body = {
    board: 'weekly_intl', week, tab: tabId(),
    record: ctx.record, part: ctx.part, action: ctx.action,
    // The server keeps a row visible until its own TTL: 1.5 × the wait before
    // the next beat, so an idle tab (30 s) never blinks out between beats.
    ttl_ms: Math.min(TTL_MAX_MS, Math.round(1.5 * next)),
    changes_since: _changesSince(),
  };
  S.inFlight = true; S.dirty = false; S.lastSentAt = _now(); S.beaten = true;
  let status = 0, json = null, tmo = null;
  try {
    // Plain fetch, never _enqueue/_atRetry: a beat must not queue behind
    // writes, retry, or toast. An answer that never comes is aborted and
    // counted as a network failure (status 0 → «σε παύση»).
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    if (ac) tmo = setTimeout(() => { try { ac.abort(); } catch (_) {} }, BEAT_TIMEOUT_MS);
    const init = { method: 'POST', headers: _headers(), body: JSON.stringify(body) };
    if (ac) init.signal = ac.signal;
    const res = await fetch(PROXY_URL + '/presence', init);
    status = res.status;
    try { json = await res.json(); } catch (_) { json = null; }
  } catch (_) { status = 0; }
  finally { if (tmo) clearTimeout(tmo); }
  S.inFlight = false;
  if (!S.running) return;                     // stopped while in flight: drop the answer
  const kind = _handle(status, json, body.changes_since);
  _patch();
  if (kind === 'stop' || !S.running) return;
  let wait = _delay(kind);
  if (wait == null || wait === 'stop') return;
  if (kind === 200) S.lastDelay = wait;
  // A context change during the flight goes out at the next allowed moment,
  // but never earlier than a 429 asked, and never while the endpoint is down.
  if (S.dirty && kind === 200) wait = Math.min(wait, _gapLeft());
  const nextMs = Math.max(wait, _gapLeft());
  // Remembered across a hidden spell: hiding the tab clears the timer, and
  // without this the back-off was lost on every alt-tab (review 11/10).
  S.nextAt = _now() + nextMs;
  _schedule(nextMs);
}

function _headers() {
  const h = { 'Content-Type': 'application/json' };
  try { const jwt = localStorage.getItem('tms_jwt'); if (jwt) h.Authorization = 'Bearer ' + jwt; } catch (_) {}
  return h;
}

function _leave() {
  if (!S.beaten || S.stoppedFor === 'session') return;
  try {
    fetch(PROXY_URL + '/presence', { method: 'POST', keepalive: true, headers: _headers(),
      body: JSON.stringify({ board: 'weekly_intl', tab: tabId(), leave: true }) }).catch(() => {});
  } catch (_) {}
}

function _on(target, type, fn, opt) { target.addEventListener(type, fn, opt); S.listeners.push([target, type, fn, opt]); }
function _teardown() {
  S.running = false;
  _clearTimer();
  for (const [t, type, fn, opt] of S.listeners) { try { t.removeEventListener(type, fn, opt); } catch (_) {} }
  S.listeners = [];
  if (S.obs) { try { S.obs.disconnect(); } catch (_) {} S.obs = null; }
}

const _onInput = () => { S.lastInputAt = _now(); };
function _onVisibility() {
  if (!S.running) return;
  if (!_visible()) { _clearTimer(); return; }
  // A live tab resumes with an immediate beat. A tab in back-off (404/5xx/
  // network, or a 429 that asked to wait) keeps the wait it was given:
  // dispatchers switch tabs dozens of times an hour, and an outage is the
  // worst moment to add load to the Free plan's shared 100k/day.
  const backoff = (S.status === 'paused' || S.failures > 0 || S.retryAfterMs) ? Math.max(0, (S.nextAt || 0) - _now()) : 0;
  _schedule(Math.max(_gapLeft(), backoff));
}
const _onPageHide = () => _leave();

/**
 * Starts beating for the v4 board. Idempotent. Returns false when presence
 * is closed (FEATURES.WI_PRESENCE not true), when the session already ended
 * it (401/403/410 — until reload), or when the page has no Worker URL.
 */
function start(opts) {
  if (typeof FEATURES === 'undefined' || !FEATURES || FEATURES.WI_PRESENCE !== true) return false;
  if (S.stoppedFor === 'session') return false;
  if (typeof PROXY_URL === 'undefined' || !PROXY_URL) { console.warn('wi4 presence: no PROXY_URL'); return false; }
  const o = opts || {};
  S.opts = { onPatch: o.onPatch, isActive: o.isActive, changesSince: o.changesSince };
  if (o.week != null) S.ctx = _cleanCtx(Object.assign({}, S.ctx, { week: o.week }));
  if (S.running) { reattach(); return true; }
  S.running = true;
  if (S.status === 'off') S.status = 'pending';
  S.lastInputAt = _now();
  for (const ev of INPUT_EVENTS) _on(document, ev, _onInput, { capture: true, passive: true });
  _on(document, 'visibilitychange', _onVisibility);
  _on(window, 'pagehide', _onPageHide);
  reattach();
  _schedule(_gapLeft());
  return true;
}

/** Stops beating (page change, v4 inactive). One leave so colleagues see us go. */
function stop(reason) {
  if (!S.running) return;
  _leave();
  _teardown();
  if (S.stoppedFor !== 'session') { S.status = 'off'; S.others = []; S.changes = null; }
}

/**
 * The v4 openers say what this tab has open. A change goes out with the next
 * allowed beat (coalesced, never an extra request inside MIN_GAP_MS), and
 * only while live or pending: a failing endpoint keeps its back-off.
 */
function setContext(c) {
  const next = _cleanCtx(Object.assign({}, S.ctx, c || {}));
  const same = next.week === S.ctx.week && next.record === S.ctx.record && next.part === S.ctx.part && next.action === S.ctx.action;
  S.ctx = next;
  if (same || !S.running) return;
  if (S.inFlight) { S.dirty = true; return; }
  if (S.status === 'live' || S.status === 'pending') _schedule(_gapLeft());
}

// Default popover reader: _wiOpenPopover sets data-row-id and display:block;
// the order is the one the popover itself reads (orderIds[0] || orderId).
function _popoverCtx(pop) {
  if (!pop || pop.style.display === 'none' || !pop.dataset || !pop.dataset.rowId) return null;
  const W = _wintl();
  const id = Number(pop.dataset.rowId);
  const row = W && Array.isArray(W.rows) ? W.rows.find((r) => r.id === id) : null;
  const record = row ? ((row.orderIds && row.orderIds[0]) || row.orderId) : null;
  return record ? { record, part: 'truck' } : null;
}

/**
 * Re-observes #wi-popover. The popover lives inside #content and every full
 * paint re-creates it, so WIV2.paint() calls this at its end (disconnect
 * first, then observe the new node). The old popover code stays untouched.
 * resolve(pop) → {record, part} | null overrides the default reader.
 */
function reattach(resolve) {
  if (S.obs) { try { S.obs.disconnect(); } catch (_) {} S.obs = null; }
  if (!S.running || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return false;
  const pop = document.getElementById('wi-popover');
  if (!pop) return false;
  const read = typeof resolve === 'function' ? resolve : _popoverCtx;
  S.obs = new MutationObserver(() => {
    let hit = null;
    try { hit = read(pop); } catch (e) { _logErr(e, 'wi4 presence: popover'); }
    if (hit && hit.record) setContext({ record: hit.record, part: hit.part || 'truck', action: 'assign' });
    else if (S.ctx.action === 'assign') setContext({ record: null, part: null, action: 'view' });
  });
  S.obs.observe(pop, { attributes: true, attributeFilter: ['style', 'data-row-id'] });
  return true;
}

// What we can claim NOW: a 'live' list older than its freshness window (a run
// of 429s, a hidden tab coming back, a stalled answer) is reported as
// 'paused' — never the frozen faces of a minute ago.
function _status() {
  if (S.status !== 'live') return S.status;
  const win = Math.max(FRESH_MIN_MS, 3 * (S.lastDelay || DEFAULT_CFG.active));
  return S.lastOk != null && _now() - S.lastOk <= win ? 'live' : 'paused';
}
function others() { return _status() === 'live' ? S.others.map((p) => Object.assign({}, p, { records: p.records.slice() })) : []; }
function state() {
  const c = S.changes ? { n: S.changes.n, auto_n: S.changes.auto_n, last_by: S.changes.last_by, last_at: S.changes.last_at } : null;
  return { status: _status(), others: others(), changes: c, lastOk: S.lastOk };
}
function actionText(action) { return Object.prototype.hasOwnProperty.call(ACTION_TEXT, action) ? ACTION_TEXT[action] : ''; }

/** «Χρήστης Α · αλλάζει την ημερομηνία φόρτωσης · από 08:41» (plain text: escape before HTML). */
function tipText(name, rec) {
  const parts = [String(name || 'άλλος χρήστης')];
  const t = rec && actionText(rec.action);
  if (t) parts.push(t);
  const d = rec && rec.since ? new Date(rec.since) : null;
  if (d && Number.isFinite(d.getTime())) parts.push('από ' + d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false }));
  return parts.join(' · ');
}

/**
 * Title-bar text (plain text: escape before HTML). '' means draw nothing:
 * off, pending, or nobody else seen while live — and «κανείς» is never said,
 * because a beat that saw nobody cannot prove the board is empty.
 */
function stripText(max) {
  const st = _status();
  if (st === 'paused') return TEXT.paused;
  if (st === 'forbidden') return TEXT.forbidden;
  if (st !== 'live') return '';
  const names = S.others.map((p) => p.name);
  // More people than the strip shows: the count is said, never dropped.
  const cap = Number.isInteger(max) && max > 0 ? max : names.length;
  const shown = names.slice(0, cap).join(', ') + (names.length > cap ? ' +' + (names.length - cap) : '');
  return names.length ? shown + ' · ' + TEXT.here + ' · ' + TEXT.live : TEXT.live;
}

/**
 * The strip in PARTS (plain text: escape before HTML), so the title bar can
 * keep the state word whole and let names give way first (review 11/10):
 * {status, word, full, names, more, here}. `full` is stripText's sentence
 * (the title), `word` the part that must always show. null = draw nothing —
 * off, pending, or live with nobody else seen («κανείς» is never said).
 */
function parts(max) {
  const st = _status();
  if (st === 'paused') return { status: st, word: TEXT.pausedWord, full: TEXT.paused, names: [], more: 0, here: '' };
  if (st === 'forbidden') return { status: st, word: TEXT.forbiddenWord, full: TEXT.forbidden, names: [], more: 0, here: '' };
  if (st !== 'live' || !S.others.length) return null;
  const all = S.others.map((p) => p.name);
  const cap = Number.isInteger(max) && max > 0 ? max : all.length;
  return { status: st, word: TEXT.liveWord, full: stripText(max), names: all.slice(0, cap), more: Math.max(0, all.length - cap), here: TEXT.here };
}

window.WI4Presence = Object.freeze({
  start, stop, setContext, reattach, others, state, actionText, tipText, stripText, parts, tabId,
  ACTIONS: Object.freeze(Object.keys(ACTION_TEXT)), MIN_GAP_MS,
});
})();
