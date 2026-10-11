// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL v4 — board renderer (global WIV2)
// ─────────────────────────────────────────────────────────────────────
// Spec: docs/weekly-intl-redesign/TECH_DESIGN.md §a, §b, §d.2a, §e (rows 1–8,
// 11–16, 18, 20–22), §e.14, §f. Owner: WP4. Visual target: Figma
// KO7l2AfucR3HJEDIg1Yptr, board «ΕΚΔΟΧΗ 9/10» 1097:2254, sheets 14–16.
// Frozen signatures: tests/wi4-contract.stub.js (a change there is a
// coordinator commit, never a silent drift).
//
// v4 is a SECOND RENDERER of the same state, not a second module (§a.1):
// loading, row building and every write stay in modules/weekly_intl.js and are
// reached only through window.WINTL and window.WI_INTERNAL. Nothing is copied:
// every button calls an existing opener or write. The pure rules (points,
// flags, queue, plurals, flag decision) live in core/wi4-logic.js (WI4); the
// per-load menu, date panel, conflict dialog, keyboard and «Όλα N ▾» panel in
// modules/wi4_actions.js (WI4Actions). This file draws and keeps the seams.
//
// Rules this file keeps, each one a past incident of this project:
//   - At load it ONLY defines WIV2 (plus reading ?wi4= once, §b): no listener,
//     timer, observer or fetch (§b step 6). Everything starts in paint().
//   - paint() never throws. A failure is STICKY (§a.4): _broken = true for the
//     session, so every hook routes to v1 against v1 DOM, never to v4 against
//     a board it did not draw.
//   - onSync() never rebuilds rows (§e.14): WINTL row ids are a per-build
//     sequence and old functions may still be running with a live row.
//   - Async UI stores ORDER ids and re-resolves the row with rowIdOf() at the
//     moment of the click (§f).
//   - Unknown ≠ empty (§d.2a): an unread source is «—» with a title and one
//     queue item, never «ΠΡΟΣ ΑΝΑΘΕΣΗ», 0 or blank.
//   - Every document listener starts with the v4 guard (§a.4).
//   - No hex here (static ratchet, unit weekly_intl_v2 = 0): every colour is a
//     .wi4-* class of the wi4 block in assets/style.css (WP3).
//   - No role gate is added: the read-only gate stays inside the old openers.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const W = () => window.WI_INTERNAL;
const L = () => (typeof WI4 !== 'undefined' ? WI4 : null);
const A = () => (typeof WI4Actions !== 'undefined' ? WI4Actions : null);
const REC = /^rec[A-Za-z0-9]+$/;
const SAFE = /^[A-Za-z0-9_-]+$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_TRACE = 10000;

const _esc = (s) => (typeof escapeHtml === 'function'
  ? escapeHtml(String(s == null ? '' : s))
  : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
const _ico = (n, s) => (typeof icon === 'function' ? icon(n, s || 14) : '');
function _logErr(e, where) { try { if (typeof logError === 'function') logError(e instanceof Error ? e : new Error(String(e)), where); } catch (_) {} }
function _ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function _lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }
const _q = (oid) => (REC.test(String(oid || '')) ? String(oid) : '');   // safe to embed in an inline handler

// Paper plane (per-load menu). Inline SVG with currentColor: core/icons.js has
// no plane, and a colour literal here would break the ratchet.
const PLANE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';
// Print (the share-menu contract, §a.7): an icon like the plane — the «⎙»
// glyph in the icon grey would be TEXT at 2.6:1.
const PRINTER = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>';
// The leg arrow, as a thin icon (Figma) — not a «→» glyph: a text glyph in
// the icon grey is TEXT at 2.6:1, and the rules allow that grey for icons only.
const ARROW = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
// The presence strip names this many people; the rest are counted («+N»).
const PRES_MAX = 6;
// The stock strip's chips in this board's pallet letter (_wiShelfInner opt).
const SHELF_OPT = Object.freeze({ unit: 'π' });
// §e.14 re-read after a failed save: a pending new-import match holds it at
// most this long; after this many 1.5 s polls of «something is open» the
// line stops promising «θα ξαναδιαβαστεί» and says we do not know (~1 min).
const REREAD_PM_MS = 120000;
const REREAD_POLLS = 40;
// A write whose answer never came (no 'ok'/'err' after its ⟳) holds the
// re-read at most this long, then it is dropped and logged: a lost answer
// must not block the re-read for the session (P1 review 11/10).
const PEND_MAX_MS = 120000;

// ─── Copy (UI in Greek) ───────────────────────────────────────────────
const DOW_SHORT = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
// Upper case written as such: CSS upper-casing keeps the Greek tonos in some
// browsers (ΤΡΊΤΗ), the board's day headers never carry it.
const DOW_HEAD = ['ΚΥΡΙΑΚΗ', 'ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ'];
const DOW_ACC = ['την Κυριακή', 'τη Δευτέρα', 'την Τρίτη', 'την Τετάρτη', 'την Πέμπτη', 'την Παρασκευή', 'το Σάββατο'];
const MONTH_GEN = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
// Queue card buttons (§e #2): the labels and the ONE dispatcher live in
// WI4Actions (_ACT_LABEL, _queueAct), which the «Όλα N ▾» panel uses too —
// one copy, so a card and the panel never name or do the same item twice.
const _actLabel = (it) => { const a = A(); return a && typeof a._actLabel === 'function' ? a._actLabel(it) : ''; };
// Day-header words for the reasons WI4.dayText does not spell (it covers the
// truck count, NO_TRUCK, EMPTY_RETURN and the national legs). Every reason of a
// day is said in its header, so header = queue = rails (§d.3 invariant).
const EXTRA_WORDS = Object.freeze({
  DATE_MISMATCH: 'ασυνέπεια ημερομηνιών', OVER_33: 'πάνω από 33π', SAME_DAY: 'ίδια μέρα',
  LATE: 'καθυστέρηση', PREORDER: 'pre-order χωρίς μετατροπή', SAVE_FAILED: 'δεν αποθηκεύτηκε',
  RELAY_NO_DRIVER: 'τοπική χωρίς οδηγό', MATCH_UNREAD: 'εισαγωγή εκτός προβολής',
  PALLETS_UNKNOWN: 'παλέτες χωρίς καταγραφή', NAT_MISSING: 'εθνικό φορτίο δεν βρέθηκε',
});
// Header words that agree with their number (WI4.PLURAL), the rest are fixed.
const EXTRA_PLURAL = Object.freeze({ RELAY_NO_DRIVER: 'relayNoDriver', NAT_MISSING: 'natMissing' });
// Words of a failed match's GHOST line (_ghostHTML): a reason in the short
// form the rows use; any other reason says its WI4.flags text.
const GHOST_WORDS = Object.freeze({ NO_TRUCK: 'χωρίς φορτηγό', NAT_NO_CARRIER: 'σκέλος χωρίς μεταφορέα', OVER_33: 'πάνω από 33π', LATE: 'καθυστέρηση' });
// Words of the stock strip's flags — the SAME words _wiShelfInner shows
// (weekly_intl.js _WI_SHELF_FLAG), so the queue and the strip say one thing.
const LOT_WORDS = Object.freeze({ nointake: 'σε κίνηση χωρίς παραλαβή', close: 'κλείσιμο;', aging: '>21 ημ.' });
const STATUS_OPTS = [['', 'Όλες'], ['pending', 'Χωρίς ανάθεση'], ['assigned', 'Ανατεθειμένα'], ['unmatched', 'Εισαγωγές χωρίς ταίριασμα']];

// ─── Session state (closure-private) ──────────────────────────────────
let _pk = 0;                 // points-node key counter
const _pts = new Map();      // pk → {stops, dateTick, showPal}
let _ptsW = null;            // last measured width of one points column
let _m = null;               // last computed model
let _queue = [];             // ordered queue items the band and the panel read
let _qi = [];                // search index: [{row, blob}] by data-qi
let _sMatches = [], _sIdx = 0;
let _qRaw = '';              // the search box text as typed (WINTL.filter is lower-cased)
let _xw = null;              // W+1 read: {key, state:'loading'|'ok'|'err', recs}
let _installed = false, _bannerShown = false, _warned = false;
let _resizeT = null, _tickT = null, _rereadT = null, _rereadFailed = false;
let _scrolledWeek = null;
let _srcErrSeen = false;     // a late source (relays, national, stock) failed since the last clean paint
let _auto = null;            // auto-collapse of the week: {week, frozen, closed:{date:true}}
const _missLogged = new Set();   // rows logged once as «no record» (a repaint must not spam app_errors)
const _moves = {};           // oid → {oldDay, label, at} (§e #15)
// The late-source states the DRAWN board shows (national legs, local relays),
// taken by every full paint. Between paints the counts, the queue and the
// rails read THESE, not the live WINTL: a source that landed while a popover
// was open is drawn by the deferred paint (_lateLanded), and until then no
// header may count what no row shows (rules: «λωρίδα, λέξη, κεφαλίδα,
// μετρητής = ίδιο επίπεδο»).
let _vw = { nat: 'loading', relay: 'loading' };
let _lateT = null;           // deferred repaint of a late source (_lateLanded)
// Full loads that LANDED: renderWeeklyIntl sets a NEW WINTL._loadedAt object
// on each, so identity tells a re-read from a repaint — never a clock (a
// failure and a re-read in the same second, or a frozen test clock).
let _loadSeq = 0, _loadedSeen = null;

// ─── Small date helpers ───────────────────────────────────────────────
function _today() {
  if (typeof localToday === 'function') return localToday();
  return typeof toLocalDate === 'function' ? toLocalDate(new Date()) : new Date().toISOString().slice(0, 10);
}
// A datetime → its LOCAL day (never a slice of a UTC string near midnight).
function _day(iso) { if (!iso) return ''; try { return (typeof toLocalDate === 'function' ? toLocalDate(iso) : String(iso).slice(0, 10)) || ''; } catch (_) { return ''; } }
const _dateOnly = (v) => (v ? String(v).slice(0, 10) : '');
function _utc(d) { return new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))); }
function _addDays(d, n) { if (!DAY_RE.test(d || '')) return ''; const t = _utc(d); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
const _dow = (d) => (DAY_RE.test(d || '') ? _utc(d).getUTCDay() : null);
const _dm = (d) => (DAY_RE.test(d || '') ? `${+d.slice(8, 10)}/${+d.slice(5, 7)}` : '');
function _dayLabel(d) { const lg = L(); return lg ? lg.dayLabel(d) : (DAY_RE.test(d || '') ? DOW_SHORT[_dow(d)] + ' ' + _dm(d) : ''); }
function _plural(n, key) { const lg = L(); try { return lg ? lg.plural(n, key) : String(n); } catch (_) { return String(n); } }
function _rel(d, today, verbs) {
  const k = (L() && DAY_RE.test(d || '')) ? L().dayDiff(today, d) : null;
  if (k === null) return verbs.none;
  if (k === -1) return verbs.past + ' χθες';
  if (k < 0) return verbs.past + ' ' + _dayLabel(d);
  if (k === 0) return verbs.now + ' σήμερα';
  if (k === 1) return verbs.now + ' αύριο';
  return verbs.now + ' ' + _dayLabel(d);
}

// ─── Data access (read only, through WI_INTERNAL) ─────────────────────
const _D = () => W().WINTL;
function _rec(oid) { return oid ? W().recOf(oid) : null; }
function _f(oid) { const r = _rec(oid); return (r && r.fields) || {}; }
function _natLive() { const s = _D().data.nlState; return s === 'ok' || s === 'err' ? s : 'loading'; }
function _relayLive() { const r = _D().relay; return (r && r.state) || 'loading'; }
// The drawn board's states (_vw): see its declaration.
function _natState() { return _vw.nat; }
function _relayState() { return _vw.relay; }
function _root() { return document.querySelector('#content .wi4'); }
function _live() { return WIV2.active() && !!_root(); }
function _gtOn() { return typeof FEATURES !== 'undefined' && !!FEATURES.GROUP_TILES; }
function _pals(fieldsList) {
  let n = 0, known = 0;
  for (const f of fieldsList) {
    if (f && 'Total Pallets' in f && f['Total Pallets'] !== '' && f['Total Pallets'] != null) { n += +f['Total Pallets'] || 0; known++; }
  }
  return { n, known, miss: fieldsList.length - known };
}
// One end of an order as points: [{n, dt}] from the stops the board injected
// (_wiInjectStopSummaries), else the summary/first location — the old board's
// own chain (placeStr + arr), never a second parser.
// `n` is the RAW stop text where one exists — as _wi2Loc does through `_i` —
// because _wk3Arr keeps only «title, CC» and line 2 needs the city too.
function _stopsOf(f, kind) {
  const I = W();
  const str = I.placeStr(f, kind), arr = kind === 'load' ? f._stopsL : f._stopsD;
  const L0 = I.arr(str, arr) || [];
  return L0.map((x) => {
    const src = Array.isArray(arr) && arr.length ? arr[x._i] : null;
    const raw = src ? (typeof src === 'string' ? src : src.n) : (L0.length === 1 ? I.raw(str) : x.n);
    return { n: raw || x.n, dt: x.dt, _i: x._i };
  });
}
// A stop name → {title, city, cc, place}. Two producers write stop names
// (_wi2Split's own comment): the Summary «Τίτλος, CC, Πόλη», which _wi2Split
// reads, and the LOCATIONS label «Όνομα, Πόλη, Χώρα» (core/form-helpers.js),
// whose country is a GREEK name from Intl («Ελλάδα», «Γερμανία») that
// _WK3CC's English keys never match — so on the real board line 2 was empty
// for every stop (fixture = production format, measured 11/10). When
// _wi2Split finds neither city nor CC, the last part is read with
// countryCode() (accent- and language-blind, core/countries.js).
// place = line 2 by the rules sheet (958:747): «χώρα μόνο εκτός GR» — «Veria»,
// «Berlin, DE».
function _splitName(n) {
  const s = W().split(n || '') || {};
  let title = s.title || String(n || '—'), city = s.city || '', cc = s.cc || '';
  if (!city && !cc && typeof countryCode === 'function') {
    const parts = String(n || '').split(',').map((x) => x.trim()).filter(Boolean);
    const c = parts.length >= 2 ? countryCode(parts[parts.length - 1]) : null;
    if (c) { cc = c; if (parts.length >= 3) city = parts[parts.length - 2]; title = parts.slice(0, Math.max(1, parts.length - (parts.length >= 3 ? 2 : 1))).join(', '); }
  }
  // Points and menus draw «City CC» (Figma line 2: «Kecskemét HU 6π», menu
  // «Beta Market, City RS»); the empty-return words keep «City, CC» (board:
  // «Κενό γύρισμα · από Τρί 6/10 · Veverská Bítýška, CZ») — placeC.
  const cc2 = cc && cc !== 'GR' ? cc : '';
  const place = [city, cc2].filter(Boolean).join(' ');
  const placeC = [city, cc2].filter(Boolean).join(', ');
  return { title, city, cc, place, placeC };
}
function _firstTitle(f, kind) { const L0 = _stopsOf(f, kind); return L0.length ? _splitName(L0[0].n).title : (W().clientName(f) || '—'); }
function _lastStop(f, kind) { const L0 = _stopsOf(f, kind); return L0.length ? _splitName(L0[L0.length - 1].n) : { title: '—', place: '' }; }
function _loadLabel(oid) {
  const f = _f(oid);
  if (!Object.keys(f).length) return '—';
  return (W().clientName(f) || _firstTitle(f, 'load')) + ' → ' + (f['Veroia Switch'] && f['Direction'] === 'Import' ? 'Βέροια' : _lastStop(f, 'del').title);
}
// One order's two ends in the words of its row: {client, from, to, pallets}
// with from/to = _splitName of the first loading and the last delivery
// point, Βέροια where the international truck meets the national leg. The
// per-load menu and the date panel name a load with THESE words (WI4Actions
// reads them through WIV2._ends) — never the v1 placeStr dump of every stop
// with its country spelled out (review 11/10: an 820px menu).
function _ends(oid) {
  const f = _f(oid);
  if (!Object.keys(f).length) return null;
  const I = W(), L0 = _stopsOf(f, 'load'), D0 = _stopsOf(f, 'del');
  const client = I.clientName(f) || '';
  const vsImp = !!f['Veroia Switch'] && f['Direction'] === 'Import', vsExp = !!f['Veroia Switch'] && f['Direction'] !== 'Import';
  const from = L0.length ? _splitName(L0[0].n) : { title: client || '—', city: '', cc: '', place: '' };
  const to = D0.length ? _splitName(D0[D0.length - 1].n) : { title: '—', city: '', cc: '', place: '' };
  const p = _pals([f]);
  return { client, from, to, vsExp, vsImp, pallets: p.known ? p.n : null };
}
function _syncErr(oid) { const s = (_D()._syncLog || {})[oid]; return s && s.state === 'err' ? (s.msg || 'σφάλμα') : null; }
// The row whose primary order is `oid` (the key of WINTL._syncLog).
const row0 = (oid) => ((_D() && _D().rows) || []).find((x) => ((x.orderIds || [])[0] || x.orderId) === oid) || null;
// The export's match as the TABLE holds it (WINTL.data, written only by a
// confirmed write), not as the optimistic row says it. undefined = the record
// is not on this board.
function _srvMatch(row) {
  const pid = (row.orderIds || [])[0] || row.orderId;
  const rec = (_D().data.exports || []).find((r) => r.id === pid);
  return rec ? ((rec.fields || {})['Matched Import ID'] || null) : undefined;
}
// A failed match/unmatch whose re-read has not landed: the row still SHOWS the
// optimistic link (§e.14: onSync never rebuilds rows), but the counts, the
// queue and the rail must follow the table — «a clean row is never shown»
// (review 11/10: Tuesday lost its «1 κενό γύρισμα», Wednesday its «1 χωρίς
// φορτηγό», while the table still had both).
function _unconfirmed(row) {
  if (!row || row.type !== 'export') return false;
  const pid = (row.orderIds || [])[0] || row.orderId;
  const s = (_D()._syncLog || {})[pid];
  if (!s || s.state !== 'err') return false;
  const srv = _srvMatch(row);
  return srv !== undefined && srv !== (row.importId || null);
}
function _isPre(f) { return typeof isPreorder === 'function' && isPreorder(f); }
function _preLevel(f) { return typeof preorderLevel === 'function' ? preorderLevel(f) : 'red'; }
function _carrierOf(oid) {
  // Same reading as _wi2Carrier (weekly_intl.js): partner first, then truck.
  const D = _D().data, nl = D.nlBySrc && D.nlBySrc[oid];
  // The read ANSWERED and holds no national load for this VS order (the
  // chain never created it, or failed): not «a load without a carrier» —
  // there is nothing to assign on Weekly National (review 11/10, NAT_MISSING).
  if (!nl) return _natState() === 'ok' ? { kind: 'missing' } : null;
  const f = nl.fields || {}, pid = (f['Partner'] || [])[0], tid = (f['Truck'] || [])[0], did = (f['Driver'] || [])[0];
  if (pid || f['Is Partner Trip']) return { kind: 'par', text: [(D.partners.find((x) => x.id === pid) || {}).label || '—', f['Partner Truck Plates'] || ''].filter(Boolean).join(' · ') };
  if (tid) return { kind: 'own', text: [(D.trucks.find((x) => x.id === tid) || {}).label || '—', did ? ((D.drivers.find((x) => x.id === did) || {}).label || '') : ''].filter(Boolean).join(' · ') };
  return null;
}

// ═══ §b Flag, opt-in, identity ═══════════════════════════════════════════
// Read ?wi4= once at load and drop it from the address, so a copied link does
// not spread an opt-in. Storage that throws counts as no opt-in.
(function _readOptInParam() {
  try {
    const m = /[?&]wi4=([01])(?:&|$)/.exec(String((typeof location !== 'undefined' && location.search) || ''));
    if (!m) return;
    _lsSet('tms_wi4', m[1]);
    const u = new URL(location.href);
    u.searchParams.delete('wi4');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  } catch (_) { /* no opt-in: the old board, as today */ }
})();

function _flagRaw() { return typeof FEATURES !== 'undefined' && FEATURES ? FEATURES.WI_V2 : undefined; }
function _user() { try { return (typeof user !== 'undefined' && user && user.username) || ''; } catch (_) { return ''; } }
function _pilot() { try { return typeof WI_V2_USERS !== 'undefined' && Array.isArray(WI_V2_USERS) ? WI_V2_USERS : []; } catch (_) { return []; } }
function _decide() {
  const lg = L();
  if (!lg) return 'old';
  const raw = _flagRaw();
  // Unknown = closed (principle 5); one warning names the bad value.
  if (!_warned && lg.normFlag(raw) !== raw) { _warned = true; try { console.warn('[weekly intl v4] FEATURES.WI_V2 =', raw, '→ read as \'off\''); } catch (_) {} }
  return lg.v2Decide({ flag: raw, pilot: _pilot(), user: _user(), optIn: _ls('tms_wi4') });
}

function active() {
  try {
    if (WIV2._broken === true) return false;
    if (typeof currentPage === 'undefined' || currentPage !== 'weekly_intl') return false;
    return _decide() === 'v4';
  } catch (_) { return false; }
}

// v1 mast switch: «Νέα προβολή» only when the flag is 'pilot'/'on' AND the user
// opted out once or is a pilot user. '' adds no whitespace to the v1 HTML (it
// sits inline at a token boundary, §a.4).
function switchHTML() {
  try {
    const lg = L();
    if (!lg || WIV2._broken) return '';
    const f = lg.normFlag(_flagRaw());
    if (f !== 'pilot' && f !== 'on') return '';
    if (!(_ls('tms_wi4') === '0' || (_user() && _pilot().includes(_user())))) return '';
    return '<button type="button" class="wi4-btn sm" onclick="WIV2._switch(\'1\')" title="Η νέα προβολή του εβδομαδιαίου (δοκιμαστική)">Νέα προβολή</button>';
  } catch (_) { return ''; }
}
function _switch(v) {
  _lsSet('tms_wi4', v === '1' ? '1' : '0');
  if (v !== '1') _cleanup();
  W().renderWeeklyIntl();
}

// ═══ Facts for WI4.flags (§d.2) ═════════════════════════════════════════
function _memberRecs(row) {
  const I = W(), D = _D().data;
  const ids = (row.orderIds && row.orderIds.length) ? row.orderIds : [row.orderId];
  const cache = row.type === 'import' ? D.imports : D.exports;
  const recs = ids.map((id) => cache.find((r) => r.id === id) || I.recOf(id)).filter(Boolean);
  return recs.length > 1 ? I.grpOrder(recs, row.type === 'import' ? 'Loading DateTime' : 'Delivery DateTime') : recs;
}

/** Impure facts of a board row for WI4.flags (§d.2). Rota legs share their
 *  truck (kind 'leg'), a split parent executes nowhere (kind 'split'). */
function factsOf(row) {
  const I = W(), D = _D();
  if (!row) return {};
  const recs = _memberRecs(row);
  const pf = (recs[0] && recs[0].fields) || {};
  const lastF = (recs[recs.length - 1] && recs[recs.length - 1].fields) || pf;
  const isImp = row.type === 'import';
  const st = I.stFlags(pf);
  const vs = !!pf['Veroia Switch'];
  // A row without a national leg has nothing unread: 'ok', so an unread
  // NATIONAL LOADS never keeps such a day open or says «unknown» about it.
  const natState = vs ? _natState() : 'ok';
  let loadDate = _day(pf['Loading DateTime']);
  // A VS export's truck loads at Βέροια: «how near» is the cross-dock day.
  if (!isImp && vs) { const v = I.vsCd(pf, 'exp'); if (v && v.iso) loadDate = v.iso; }
  const delDate = _day(lastF['Delivery DateTime']);
  const pid = recs[0] ? recs[0].id : row.orderId;
  const car = vs ? _carrierOf(pid) : null;
  const natLegs = vs ? [{ side: isImp ? 'from' : 'to', date: isImp ? delDate : _day(pf['Loading DateTime']),
    carrier: !!car && car.kind !== 'missing', missing: !!car && car.kind === 'missing' }] : [];
  const p = _pals(recs.map((r) => r.fields || {}));
  const ret = _lastStop(lastF, 'del');
  // A failed match/unmatch counts what the table holds (§e.14, _unconfirmed).
  const hasReturn = _unconfirmed(row) ? !!_srvMatch(row) : !!row.importId;
  return {
    kind: row.legOf ? 'leg' : row.hasSplitLegs ? 'split' : isImp ? 'import' : 'export',
    saved: !!row.saved, partner: !!row.partnerId,
    loadDate, delDate,
    returnDate: delDate, returnPlace: ret.placeC || ret.title || '', hasReturn,
    natLegs, natState,
    stockState: (D.data.stock && D.data.stock.status) || null,
    pallets: p.known ? p.n : null,
    // Members without a pallet figure: the cell says «N+?» and, near 33, the
    // flag says so (WI4.flags PALLETS_UNKNOWN) — never «fine» on a gap.
    palletsUnknown: p.known ? p.miss : 0,
    vsCdDate: vs ? _dateOnly(pf['VS CD Date']) : '',
    natDelDate: isImp ? delDate : '', natLoadDate: !isImp ? _day(pf['Loading DateTime']) : '',
    sameDayClash: (row.truckId || row.driverId) ? I.sameDayConflict(row) : null,
    late: !!st.late,
    preorder: recs.length <= 1 && _isPre(pf) ? { level: _preLevel(pf) } : null,
    syncErr: _syncErr(pid),
    executing: !!(st.loaded && !st.delivered),
  };
}
// The matched import of an export row has its own reasons (late, pallets, a
// VS date mismatch, its national leg). It shares the export's truck, so it is
// `saved:true` (no second NO_TRUCK) and it is never counted as a truck.
function _impFacts(row) {
  const I = W();
  // The matched import was not read with this week (loads outside ±8 days,
  // or cancelled): unknown ≠ empty (§d.2a). One amber look that opens it,
  // and its day never folds — never the blank facts of a missing record.
  if (!I.recOf(row.importId)) return { kind: 'import', saved: true, partner: !!row.partnerId, hasReturn: true, natLegs: [], natState: 'ok', matchUnread: true, _matched: true, unread: true };
  const g = I.impGroupRowOf(row.importId);
  const base = g || { type: 'import', orderId: row.importId, orderIds: [row.importId] };
  const f = factsOf(Object.assign({}, base, { type: 'import', saved: true, partnerId: row.partnerId, truckId: '', driverId: '', legOf: null, hasSplitLegs: false }));
  f.sameDayClash = null;
  f._matched = true;
  return f;
}
// The facts an export/import row contributes: its own, plus its matched
// import's — unless that match is a failed, unconfirmed write: then the import
// still counts where the table has it (a ghost, see _compute).
function _rowFacts(row, oid) {
  const out = [{ oid, f: factsOf(row), row }];
  if (row.importId && !row.hasSplitLegs && !_unconfirmed(row)) out.push({ oid: row.importId, f: _impFacts(row), row });
  return out;
}

// ═══ Model: days, entries, facts, queue (§d.3, §e #2, #6) ═════════════════
function _compute() {
  const I = W(), D = _D(), lg = L(), today = _today();
  const rows = D.rows || [];
  const fOf = (r) => ((D.data.exports.find((x) => x.id === (r.orderIds || [])[0]) || D.data.imports.find((x) => x.id === r.orderId)) || {}).fields || {};
  // Grouping = today's _wiAllRowsHTML rules: exports by DELIVERY day, imports
  // by LOADING day, Σαβ–Παρ seeded, «μεταφέρθηκε» sections after Friday.
  const expRows = rows.filter((r) => r.type === 'export' && !r.legOf && !r.splitLegOf);
  const impRows = rows.filter((r) => r.type === 'import' && !r.legOf && !r.adj && !r.splitLegOf && !I.shelved(r));
  const groups = {}, extra = {};
  if (D._range) { let d = D._range.ws; for (let i = 0; i < 7; i++) { groups[d] = { date: d, exps: [], imps: [] }; d = _addDays(d, 1); } }
  expRows.forEach((r) => { const k = _day(fOf(r)['Delivery DateTime'] || fOf(r)['Loading DateTime']); const b = r.outOfWindow ? extra : groups; (b[k] = b[k] || { date: k, exps: [], imps: [] }).exps.push(r); });
  impRows.forEach((r) => { const k = _day(fOf(r)['Loading DateTime']); const b = r.outOfWindow ? extra : groups; (b[k] = b[k] || { date: k, exps: [], imps: [] }).imps.push(r); });
  const byDate = (a, b) => (a.date || '~').localeCompare(b.date || '~');
  const cKey = (f) => String(f['Client Name'] || f['Client Summary'] || '').toUpperCase();
  const sorter = (field) => (a, b) => { const fa = fOf(a), fb = fOf(b);
    return cKey(fa).localeCompare(cKey(fb), 'el') || ((fa['Veroia Switch'] ? 1 : 0) - (fb['Veroia Switch'] ? 1 : 0)) || String(fa[field] || '').localeCompare(String(fb[field] || '')); };

  const days = [];
  const entries = [];
  let no = 0;
  D._rowNo = {};
  const pushFacts = (e, row, oid) => { _rowFacts(row, oid).forEach((x) => e.facts.push(x)); };
  // Ghosts (§e.14, _unconfirmed): an import drawn under an export by a match
  // that FAILED is still a free import in the table — it keeps counting in its
  // own loading day (NO_TRUCK, a truck of that day) and in the queue until the
  // re-read lands, and it is DRAWN there as a 24px line naming those reasons
  // (_ghostHTML); the export's import cell says «δεν αποθηκεύτηκε».
  const ghosts = {};
  rows.filter((r) => r.type === 'export' && r.importId && !r.hasSplitLegs && _unconfirmed(r)).forEach((r) => {
    const ir = rows.find((x) => x.type === 'import' && (x.orderIds || [x.orderId]).includes(r.importId));
    if (!ir || ir.adj || I.shelved(ir)) return;
    const k = _day(fOf(ir)['Loading DateTime']);
    (ghosts[k] = ghosts[k] || []).push(ir);
  });
  const rotaOf = (row, parent, day) => {
    I.legPidsOfRow(row).forEach((pid) => ((D._legs && D._legs[pid]) || []).forEach((lr) => {
      const oid = (lr.orderIds || [])[0] || lr.orderId;
      const e = { t: 'leg', row: lr, parent, day, facts: [{ oid, f: factsOf(lr), row: lr }] };
      day.entries.push(e); entries.push(e);
    }));
  };
  // A relay that cannot be read (Relay.summary threw or gave nothing, or the
  // Relay module itself is missing while relays loaded) is an UNKNOWN, never
  // «nothing»: its sub-row says «δεν διαβάστηκε», the queue gets the relays'
  // SOURCE_UNKNOWN item and no day folds as «all fine» over it (§d.2a).
  let relayBroken = false;
  const relaysOf = (row, parent, day) => {
    if (!D.relay || _relayState() !== 'ok') return;   // while loading: closed, as today
    const ids = I.relayIdsOfRow(row);
    if (typeof Relay === 'undefined') {
      if (ids.some((oid) => D.relay.byOrder && D.relay.byOrder[oid] && Object.keys(D.relay.byOrder[oid]).length)) relayBroken = true;
      return;
    }
    ids.forEach((oid) => {
      const o = I.relayOrder(oid);
      (Relay.KINDS || []).forEach((k) => {
        const rec = D.relay.byOrder && D.relay.byOrder[oid] && D.relay.byOrder[oid][k];
        if (!rec) return;
        let s = null; try { s = Relay.summary(rec, o); } catch (err) { _logErr(err, 'wi4: relay summary'); }
        if (!s) {
          relayBroken = true;
          const e = { t: 'relay', x: { rec, oid, o, s: { kind: k, day: '', unread: true } }, parent, day, facts: [] };
          day.entries.push(e); entries.push(e);
          return;
        }
        // A relay drawn «ΠΡΟΣ ΑΝΑΘΕΣΗ» or «⚠ δεν επιβεβαιώθηκε» is work: it has
        // facts like any row, so it reaches the rail, the day header, the queue
        // and the collapse rule — keyed by its own record (relayId), because it
        // shares its order id with the row it hangs under.
        const bad = !!(D.relay.syncErr && D.relay.syncErr[rec.id]);
        const f = { kind: 'relay', relayNoDriver: !s.driverName && !s.done, syncErr: bad ? 'δεν επιβεβαιώθηκε' : null,
          loadDate: DAY_RE.test(s.day || '') ? s.day : '', relayKind: s.kind };
        const e = { t: 'relay', x: { rec, oid, o, s }, parent, day, facts: [{ oid, relayId: rec.id, f, row: parent }] };
        day.entries.push(e); entries.push(e);
      });
    });
  };
  const fill = (g, isExtra) => {
    const showImps = g.imps.filter((r) => !r.matchedTo);   // matched imports live inside their export row
    const ghostRows = ghosts[g.date] || [];
    // A day whose only load is a ghost is not «Καμία κίνηση»: the table has a load there.
    const day = { date: g.date, extra: isExtra, today: g.date === today, entries: [], empty: !g.exps.length && !showImps.length && !ghostRows.length };
    if (isExtra && day.empty) return;
    g.exps.sort(isExtra ? (a, b) => String(fOf(a)['Delivery DateTime'] || '').localeCompare(String(fOf(b)['Delivery DateTime'] || '')) : sorter('Delivery DateTime'));
    showImps.sort(isExtra ? (a, b) => String(fOf(a)['Loading DateTime'] || '').localeCompare(String(fOf(b)['Loading DateTime'] || '')) : sorter('Loading DateTime'));
    // Numbering is continuous per week, exports and import-only rows together
    // (§e numbering); WINTL._rowNo is kept so any old reader stays right.
    const add = (row, t) => {
      const oid = (row.orderIds || [])[0] || row.orderId;
      no++; D._rowNo[oid] = String(no);
      if (row.hasSplitLegs) {
        const e = { t: 'split', row, no, day, facts: [] };
        day.entries.push(e); entries.push(e);
        const pid = oid;
        ((D._splitLegs && D._splitLegs[pid]) || []).slice().sort((a, b) => (a.splitLegNo || 0) - (b.splitLegNo || 0)).forEach((lr) => {
          const le = { t: lr.type === 'import' ? 'imp' : 'exp', row: lr, no: '↳' + (lr.splitLegNo || ''), split: true, parent: row, day, facts: [] };
          pushFacts(le, lr, (lr.orderIds || [])[0] || lr.orderId);
          day.entries.push(le); entries.push(le);
        });
      } else {
        const e = { t, row, no, day, facts: [] };
        pushFacts(e, row, oid);
        day.entries.push(e); entries.push(e);
        rotaOf(row, row, day);
      }
      relaysOf(row, row, day);
    };
    g.exps.forEach((r) => add(r, 'exp'));
    showImps.forEach((r) => add(r, 'imp'));
    ghostRows.forEach((ir) => {
      const e = { t: 'ghost', row: ir, day, facts: [{ oid: ir.orderId, f: factsOf(Object.assign({}, ir, { matchedTo: null })), row: ir }] };
      day.entries.push(e); entries.push(e);
    });
    days.push(day);
  };
  Object.values(groups).sort(byDate).forEach((g) => fill(g, false));
  Object.values(extra).sort(byDate).forEach((g) => fill(g, true));

  // Day counts, collapse rule, header words (§d.3).
  const natState = _natState();
  for (const day of days) {
    const fl = [];
    day.entries.forEach((e) => e.facts.forEach((x) => fl.push(x.f)));
    day.facts = fl;
    const c = lg.dayCounts(fl, today);
    c.trucks = fl.filter((f) => (f.kind === 'export' || f.kind === 'import') && !f._matched).length;
    day.counts = c;
    day.levels = {};
    // Worst level per code: the header word takes the colour of its worst case.
    fl.forEach((f) => lg.flags(f, today).reasons.forEach((r) => { if (r.level === 'red' || !day.levels[r.code]) day.levels[r.code] = r.level; }));
    // «εθνικά σκέλη: δεν φορτώθηκαν» only on a day that HAS national legs:
    // elsewhere it would announce an unknown that does not exist.
    day.text = lg.dayText(c, { natState: fl.some((f) => f.natLegs && f.natLegs.length) ? natState : 'ok' });
    // Never «all fine» on an unknown: a day without a date, or any day while
    // the local relays did not load (a driverless relay could hide in it).
    day.collapsible = lg.collapsible(fl, today) && DAY_RE.test(day.date || '') && _relayState() !== 'err' && !relayBroken;
    // For tests and tools: the reason codes this header counts, and how many.
    // The board rig checks that each one is NAMED on exactly that many rows
    // (rules: «λωρίδα, λέξη, κεφαλίδα, μετρητής = ίδιο επίπεδο»).
    day.codes = Object.entries(c.byCode || {}).map(([k, n]) => k + ':' + n).sort().join(',');
  }

  // Queue (§e #2): every row and sub-row, the matched imports, stock, the W+1
  // loads of today–tomorrow, the ±1-week imports not drawn here, and one item
  // per source that did not load. A failed source is never a smaller number.
  const items = [];
  const decorate = (it, x) => {
    const r = x.row;
    it.rowKey = x.oid || null;
    it.key = x.oid || '';
    it.why = it.text;
    if (x.relayId) {
      // Items of a local relay: they open that relay (its own menu has edit
      // and delete), and belong to its sub-row, not to the row above it.
      it.relayId = x.relayId;
      it.text = _loadLabel(x.oid);
      it.sub = (x.f.relayKind === 'relay_delivery' ? 'τοπική παράδοση' : 'τοπική φόρτωση') +
        (it.code === 'RELAY_NO_DRIVER' ? ' χωρίς οδηγό' : ' · ' + it.why) + (it.date ? ' · ' + _dayLabel(it.date) : '');
      return it;
    }
    if (it.code === 'EMPTY_RETURN') {
      it.text = [r.truckLabel, r.driverLabel].filter(Boolean).join(' · ') || _loadLabel(x.oid);
      it.sub = it.why;
    } else if (it.code === 'NAT_NO_CARRIER' || it.code === 'NAT_MISSING') {
      const f = _f(x.oid);
      it.text = it.side === 'to' ? _firstTitle(f, 'load') + ' → Βέροια' : 'Βέροια → ' + _lastStop(f, 'del').title;
      it.sub = 'εθνικό ' + _dayLabel(it.date) + ' · ' + it.why;
    } else {
      it.text = _loadLabel(x.oid);
      // The band's card leaves «χωρίς φορτηγό» out (sheet 15: «10π · φόρτωση
      // ήταν χθες»): its red chip and «Ανάθεση» button say it; the «Όλα»
      // panel keeps the whole sentence (subCard vs sub).
      if (it.code === 'NO_TRUCK') it.subCard = _rel(it.date, today, { past: 'φόρτωση ήταν', now: 'φορτώνει', none: 'χωρίς ημερομηνία φόρτωσης' });
      it.sub = it.code === 'NO_TRUCK' ? it.subCard + ' · ' + it.why : it.why;
      // «ίδια μέρα · TST-1014 · Τετ 7/10» in the words of every other card,
      // never the old sentence with its «(10-07)»: that stays in the title.
      if (it.code === 'SAME_DAY') {
        const who = /^Το φορτηγό/.test(it.why) ? r.truckLabel : /^Ο οδηγός/.test(it.why) ? r.driverLabel : '';
        it.sub = ['ίδια μέρα', who || '', _dayLabel(it.date)].filter(Boolean).join(' · ');
        it.tip = it.why;
      }
    }
    // Pallets on the card (sheet 15: «Alpha Dairy → Beta… 10π · φόρτωση ήταν χθες»).
    if (x.f && Number.isFinite(Number(x.f.pallets)) && x.f.pallets != null && !x.relayId) it.pal = Number(x.f.pallets);
    if (it.code === 'DATE_MISMATCH') it.field = 'VS CD Date';
    return it;
  };
  entries.forEach((e) => e.facts.forEach((x) => lg.items(x.f, today, { key: x.oid, rowKey: x.oid }).forEach((it) => items.push(decorate(it, x)))));
  // ±1-week imports (rows flagged adj): on this board only when they need a
  // truck today or tomorrow — the rest belong to their own week's queue. One
  // whose match FAILED is still free in the table (its export is
  // _unconfirmed): it keeps its item — the optimistic matchedTo dropped it
  // until the re-read (review 11/10).
  const freeAdj = (r) => !r.matchedTo || rows.some((x) => x.type === 'export' && x.importId && (r.orderIds || [r.orderId]).includes(x.importId) && _unconfirmed(x));
  rows.filter((r) => r.type === 'import' && r.adj && !r.legOf && freeAdj(r)).forEach((r) => {
    const x = { oid: r.orderId, f: factsOf(r), row: r };
    lg.items(x.f, today, { key: x.oid }).filter((it) => it.code === 'NO_TRUCK' && it.level === 'red').forEach((it) => {
      const d = decorate(it, x); d.rowKey = null; d.sub = 'W' + (r.adjW || '?') + ' · ' + d.sub; items.push(d);
    });
  });
  const st = D.data.stock;
  if (st && st.status === 'ok') {
    (st.lots || []).forEach((l) => {
      const c = I.lotState(l, today) || { key: 'ok' };
      if (c.key === 'ok') return;
      const lf = l.fields || {};
      items.push({ code: 'STOCK_LOT', level: 'amber', group: 'look', date: null, key: l.id, rowKey: null, lotId: l.id, act: 'lot',
        text: (lf['Warehouse Name'] || '—') + ' · ' + (lf['Client Name'] || '—'), sub: LOT_WORDS[c.key] || c.key });
    });
    (st.loose || []).filter((p) => I.looseLate(p, today)).forEach((p) => {
      const pf = p.fields || {};
      items.push({ code: 'STOCK_LATE', level: 'red', group: 'cost', date: _day(pf['Delivery DateTime']) || null, key: p.id, rowKey: null, act: 'pieces',
        text: 'Απόθεμα · ' + (I.clientName(pf) || '—'), sub: 'κομμάτι με παράδοση που πέρασε' });
    });
  }
  const xw = _xwItems(today);
  xw.forEach((it) => items.push(it));
  lg.sourceReasons({ natState, crossWeekOk: _xw ? (_xw.state === 'err' ? false : _xw.state === 'ok' ? true : undefined) : undefined,
    relayState: relayBroken ? 'err' : _relayState(), stockState: st && st.status })
    .forEach((it) => items.push(Object.assign({}, it, { key: '', rowKey: null, group: 'look', sub: '' })));
  const queue = lg.queue(items, today);
  const loading = natState === 'loading' || _relayState() === 'loading' || (st && st.status === 'loading') || (_xw && _xw.state === 'loading');
  // Column-header counts = the rows the board NUMBERS: a split order is one
  // row (its legs are ↳1/↳2), where the shared metric counts parent + legs
  // (3). reportPageMetrics keeps the old numbers (identity, §a.5).
  const expDrawn = rows.filter((r) => r.type === 'export' && !r.legOf && !r.splitLegOf).length;
  const impDrawn = (typeof I.boardImpRows === 'function' ? I.boardImpRows() : impRows).filter((r) => !r.splitLegOf).length;
  return { days, entries, queue, xwCount: xw.length, loading: !!loading, today, expDrawn, impDrawn };
}
function _xwItems(today) {
  if (!_xw || _xw.state !== 'ok') return [];
  const D = _D(), wk = D.week + 1, lim = _addDays(today, 1);
  return (_xw.recs || []).filter((r) => { const d = _day(r.fields && r.fields['Loading DateTime']); return d && d <= lim; }).map((r) => {
    const d = _day(r.fields['Loading DateTime']);
    let name = '';
    try { name = (typeof _fhLocationsMap !== 'undefined' && typeof getLinkedId === 'function') ? (_fhLocationsMap[getLinkedId(r.fields['Loading Location 1'])] || '') : ''; } catch (_) {}
    return { code: 'XWEEK', level: 'amber', group: 'stop', date: d, key: r.id, rowKey: null, act: 'week', week: wk,
      text: (_splitName(name).title || 'Φορτίο') + ' · πλάνο W' + wk, sub: _rel(d, today, { past: 'φόρτωση ήταν', now: 'φορτώνει', none: '' }) + ' · η ανάθεση είναι στη W' + wk };
  });
}

// ═══ Markup: pieces ═════════════════════════════════════════════════════
// Every text node that can overflow carries its full text in `title` (the
// board rig's overflow scan fails otherwise, §h.4).
function _ell(cls, text, extra) { return `<span class="${cls}" title="${_esc(text)}"${extra || ''}>${_esc(text)}</span>`; }
function _levelOf(facts, today) {
  const lg = L(); let lvl = null;
  for (const x of facts) { const l = lg.flags(x.f, today).level; if (l === 'red') return 'red'; if (l === 'amber') lvl = 'amber'; }
  return lvl;
}
const _rail = (lvl) => (lvl === 'red' ? ' wi4-r-red' : lvl === 'amber' ? ' wi4-r-amb' : '');
// The reasons of ONE fact by code, from WI4.flags — the same rule as the
// rail, the day header and the queue. Every reason a header counts is also
// NAMED on its row (P1 review 11/10: «1 καθυστέρηση» in the header, no row
// saying which load; «PRE» and «καθυστέρηση» of today's board were gone).
// Each word carries data-r="CODE", so the board rig can prove «counted in the
// header = named on exactly that many rows» (rules: λωρίδα, λέξη, κεφαλίδα,
// μετρητής = ίδιο επίπεδο).
function _rsOf(f, today) {
  const out = {};
  if (f) L().flags(f, today).reasons.forEach((r) => { if (!out[r.code]) out[r.code] = r; });
  return out;
}
const _rsAt = (e, oid, today) => { const x = (e.facts || []).find((y) => y.oid === oid); return _rsOf(x && x.f, today); };
// Every reason of a row in one line, for the title of its index cell.
function _whyOf(facts, today) {
  const t = [];
  (facts || []).forEach((x) => L().flags(x.f, today).reasons.forEach((r) => { if (!t.includes(r.text)) t.push(r.text); }));
  return t.join(' · ');
}

// Date chip colour — ONE rule for the rows and the queue cards (§c.2, §e #7 d;
// board 1097:2254 + sheet 15, review 11/10): blue = TODAY only; a future day
// is a neutral grey chip; red ONLY for a day that has PASSED with no truck.
// The rules sentence «Κόκκινη ημερομηνία ΜΟΝΟ όταν δεν υπάρχει φορτηγό» is a
// necessary condition: the frames draw today and tomorrow without a truck
// blue and grey — the rail, the «ΠΡΟΣ ΑΝΑΘΕΣΗ» box and the queue say «no
// truck». A done date (✓) is plain grey text; ≈ = an estimated cross-dock
// day; a past date without ✓ is grey «δεν δηλώθηκε» (status lag ≠ delay).
function _chipCls(c, today) {
  const day = c.day || '';
  if (c.done) return 'done';
  if (DAY_RE.test(day) && day === today) return 'today';
  if (c.noTruck && DAY_RE.test(day) && day < today) return 'red';
  if (c.est) return 'est';
  if (!day || day < today) return 'past';
  return 'next';
}
function _chipHTML(c, today) {
  if (!c) return '';
  const day = c.day || '';
  const cls = _chipCls(c, today);
  let txt = day ? _dayLabel(day) : '—', title = c.what, tick = '';
  // ✓ = the board's ONE done mark, the 10px icon (PLAN Φ1), with a visible
  // gap before the day («✓ Σάβ 3/10»): the «✓» glyph fell back to a font that
  // glued it to the day (review 11/10).
  if (cls === 'done') { tick = `<span class="wi4-ok" role="img" aria-label="ολοκληρώθηκε">${_ico('check', 10)}</span>`; title += ' — ολοκληρώθηκε'; }
  else {
    if (c.est) { txt = '≈' + txt; title += ' — εκτίμηση, κλικ για την πραγματική'; }
    if (cls === 'today') title += ' — σήμερα';
    else if (cls === 'red') title += ' — πέρασε χωρίς φορτηγό';
    else if (cls === 'past') title += day ? ' — πέρασε · δεν δηλώθηκε' : ' — δεν έχει οριστεί';
    if (c.noTruck && cls !== 'red') title += ' — χωρίς φορτηγό';
  }
  const oid = _q(c.oid);
  const click = oid ? ` onclick="event.stopPropagation();WI4Actions.datePanel('${oid}','${c.field}',this)"` : '';
  return `<button type="button" class="wi4-dc ${cls}" title="${_esc(title + (oid ? ' · κλικ: αλλαγή' : ''))}"${click}>${tick}${_esc(txt)}</button>`;
}

// Points (§d.1): the data is kept per node, so the layout pass re-renders only
// the points nodes once the column width is measured (never per stop reflow).
function _ptsHTML(side) {
  const k = 'p' + (++_pk);
  // A groupage side (its points are member tiles, drag sources and targets)
  // draws its own «+N» fold with the SAME tiles: a member hidden behind «+N»
  // must stay draggable — today's fold (_wk3MoreStops) is plain text.
  const group = (side.stops || []).some((s) => s && s.drag);
  // pre/late: the leg's PREORDER / LATE reason. They ride on the first /
  // last SHOWN point, so a point folded behind «+N» never hides the word.
  const d = { stops: side.stops || [], dateTick: !!side.dateTick, showPal: !!side.showPal, group, pre: side.pre || null, late: side.late || null };
  _pts.set(k, d);
  const r = L().points(d.stops, _ptsW || 0, { dateTick: d.dateTick });
  return `<div class="wi4-pts${r.hidePlace ? ' wi4-noplace' : ''}" data-pk="${k}">${_ptsInner(r, d)}</div>${group ? '' : (side.xfold || '')}`;
}
function _ptsInner(r, d) {
  const last = r.shown.length - 1;
  let h = r.shown.map((s, i) => _ptHTML(Object.assign({}, s, { pre: i === 0 ? d.pre : null, late: i === last ? d.late : null }), d)).join('');
  if (r.more) {
    h += `<button type="button" class="wi4-more" title="${_esc('Όλα τα σημεία:\n' + r.more.title)}" onclick="event.stopPropagation();WIV2._more(this)"><b>+${r.more.count}</b>${r.more.pallets ? `<span>${r.more.pallets}π</span>` : ''}</button>`;
    if (d.group) h += `<div class="wk3-xfold wi4-fold">${r.more.hidden.map((s) => _ptHTML(Object.assign({}, s, { badge: s.n, tick: !!s.done }), d)).join('')}</div>`;
  }
  return h;
}
function _ptHTML(s, d) {
  const oid = _q(s.oid);
  // ✓ is a meaningful graphic (aria-label), not text in the icon grey.
  const tick = s.tick ? `<span class="wi4-ok" role="img" aria-label="ολοκληρώθηκε">${_ico('check', 11)}</span>` : '';
  const delay = s.delayH ? ` <span class="wi4-delay">+${_esc(s.delayH)}ω</span>` : '';
  // Line 2 is a flex row (review 11/10): the PLACE is cut, the pallets never
  // are — «Kecskemét HU 6π» (Figma), where one ellipsized string cut «· 6π»
  // first («Milan, IT…»). A place hidden for width (.wi4-noplace) still
  // leaves the pallets.
  const palN = d.showPal && s.pallets != null ? s.pallets + 'π' : '';
  const place = s.place || '';
  // With no place the ✓ goes before the name, never alone on an empty line 2.
  const tickL1 = tick && !place && !palN && !s.warn;
  let l2;
  if (s.warn) {
    const w = _q(s.warn.oid);
    // A flex row (Figma 1097:2975): alert icon, then the words and the two
    // dates. The dates are what make it a mismatch, so they never give way;
    // the words are cut first (at 1440 one ellipsized string kept «φτάνει»
    // and cut «παράδοση 8/10» to the tooltip). Split on the dates, so the
    // export's «Βέροια … · εθνικό φορτώνει …» variant is drawn the same way.
    // Joined by spaces: not drawn between flex items (the gap is), but kept
    // in the text a screen reader or a copy reads («φτάνει 9/10», not «φτάνει9/10»).
    const parts = String(s.warn.text).split(/(\d{1,2}\/\d{1,2})/).map((t) => t.trim()).filter(Boolean)
      .map((t) => (/^\d{1,2}\/\d{1,2}$/.test(t) ? `<span class="wi4-l2w-d">${_esc(t)}</span>` : `<span class="wi4-ell">${_esc(t)}</span>`)).join(' ');
    // A warning that is not one of the leg's DATE_MISMATCH reasons is drawn
    // without the marker (data-r is only what the header counts).
    l2 = `<span class="wi4-l2 wi4-l2w wi4-t-amb" title="${_esc(s.warn.text + ' — ασυνέπεια ημερομηνιών')}"${s.warn.r ? ' data-r="DATE_MISMATCH"' : ''}${w ? ` onclick="event.stopPropagation();WI4Actions.datePanel('${w}','VS CD Date',this)" style="cursor:pointer"` : ''}>${_ico('alert_circle', 11)}${parts}</span>`;
  } else if (place || palN) {
    const full = [place, palN].filter(Boolean).join(' ');
    l2 = `<span class="wi4-l2 wi4-l2f${palN ? ' wi4-l2p' : ''}" title="${_esc(full)}">${tick}${place ? `<span class="wi4-ell wi4-pt-pl">${_esc(place)}</span>` : ''}${palN ? `<span class="wi4-pt-pal">${_esc(palN)}</span>` : ''}</span>`;
  } else l2 = '';
  // A word beside the name (PRE before it; +Nω / καθυστέρηση after it): line 1
  // turns into a flex row so the NAME is cut, never the word.
  const pre = s.pre ? `<span class="wi4-flag" data-r="PREORDER" title="${_esc(s.pre)}">PRE</span>` : '';
  const late = s.late ? `<span class="wi4-flag amb" data-r="LATE" title="${_esc(s.late)}">καθυστέρηση</span>` : '';
  // «→ ΑΠΟΘΗΚΗ» (s.lot, from _sideOf) rides beside the delivery name like
  // «καθυστέρηση»: in the 72px pallets track it spilled into the delivery
  // column (Figma 1097:2254 keeps that track for PE, attachment and figure).
  const lot = s.lot || '';
  const l1 = pre || late || delay || lot
    ? `<span class="wi4-l1 wi4-l1f">${pre}<span class="wi4-ell" title="${_esc(s.label)}">${tickL1 ? tick : ''}${_esc(s.label)}</span>${delay}${late}${lot}</span>`
    : `<span class="wi4-l1" title="${_esc(s.label)}">${tickL1 ? tick : ''}${_esc(s.label)}</span>`;
  const click = oid ? ` onclick="event.stopPropagation();WI_INTERNAL.edit('${oid}')"` : '';
  // Group member tiles: today's drag strings verbatim (§f), rowId = the
  // GROUP's own row id. Without preventDefault in ondragover the drop never
  // fires. No `wk3-seg` class: it is a global layout rule (§a.7).
  const rid = s.drag && Number.isInteger(s.drag.rowId) ? s.drag.rowId : null;
  const drag = rid != null && oid ? ` data-order-id="${oid}" draggable="true" ondragstart="event.stopPropagation();_wiSegDragStart(event,${rid},'${oid}')" ondragover="event.preventDefault();event.stopPropagation();_wiSegDragOver(event,${rid},'${oid}')" ondragleave="event.stopPropagation();this.classList.remove('dragover')" ondrop="event.stopPropagation();_wiSegDrop(event,${rid},'${oid}')" ondragend="event.stopPropagation();_wiSegDragEnd(event)"` : '';
  if (s.badge == null) return `<div class="wi4-pt" style="display:block"${click}${drag}>${l1}${l2}</div>`;
  return `<div class="wi4-pt"${click}${drag}><span class="wi4-pt-n">${_esc(s.badge)}</span>${l1}${l2}</div>`;
}
// Stops of one end: a single order's points, or one point per MEMBER of a
// groupage (the old board's rule: ① = 1st member, never a city parsed out of
// the first member's summary).
function _sideOf(recs, kind, opt) {
  const o = opt || {};
  const I = W();
  if (recs.length > 1) {
    const stops = recs.map((r, i) => {
      const f = r.fields || {};
      const L0 = _stopsOf(f, kind);
      const nm = L0.length ? _splitName(L0[kind === 'load' ? 0 : L0.length - 1].n) : { title: I.clientName(f) || '—', place: '' };
      const st = I.stFlags(f);
      const p = _pals([f]);
      return { n: i + 1, label: nm.title, place: nm.place, pallets: p.known ? p.n : null, done: kind === 'load' ? st.loaded : st.delivered,
        oid: r.id, drag: o.dragRowId != null ? { rowId: o.dragRowId } : null };
    });
    const arr = recs.map((r) => ({ n: stops[recs.indexOf(r)].label, dt: (r.fields || {})[kind === 'load' ? 'Loading DateTime' : 'Delivery DateTime'] }));
    return { stops, dateTick: kind === 'load', showPal: true, xfold: I.moreStops(arr.map((x) => x.n).join(', '), arr, kind) };
  }
  const r = recs[0], f = (r && r.fields) || {};
  const st = I.stFlags(f);
  const L0 = _stopsOf(f, kind);
  // A lot's badge goes on its FIRST delivery point (Unloading Location 1 is
  // the warehouse it names), which «+N» never folds away. Single orders only,
  // as before (_palHTML drew it only for one order with an id).
  const lot = kind === 'del' && r && r.id ? I.lotBadge(f) : '';
  const stops = (L0.length ? L0 : [{ n: I.clientName(f) || '—' }]).map((x, i) => {
    const nm = _splitName(x.n);
    return { n: i + 1, label: nm.title, place: nm.place, pallets: null, done: kind === 'load' ? st.loaded : st.delivered, oid: r && r.id, lot: i === 0 ? lot : '' };
  });
  return { stops, dateTick: kind === 'load', showPal: false, xfold: I.moreStops(I.placeStr(f, kind), kind === 'load' ? f._stopsL : f._stopsD, kind) };
}
function _palHTML(fieldsList, oid) {
  const I = W();
  const p = _pals(fieldsList);
  const one = fieldsList.length === 1 ? fieldsList[0] : null;
  let h = '';
  // The lot badge is drawn on the delivery point (_sideOf → _ptHTML); «ΑΠ»
  // stays here: _wiStockTipsRefresh finds .wi-b-ap[data-oid] inside #wi-rows.
  if (one && oid) h += I.apBadge(one, oid);
  if (fieldsList.some((f) => f && f['Pallet Exchange'])) h += '<span class="wi4-pe" title="Ανταλλαγή παλετών">PE</span>';
  // 12px paperclip (Figma 1097:2880).
  if (oid && typeof OrderDocs !== 'undefined') { try { const b = OrderDocs.badge(oid, { size: 12 }); if (b) h += `<span class="wi4-att">${b}</span>`; } catch (e) { _logErr(e, 'wi4: docs badge'); } }
  if (!p.known) h += '<span class="wi4-pal wi4-t-g2" title="Οι παλέτες δεν έχουν καταγραφεί">—</span>';
  else {
    // The SAME thresholds as WI4.flags OVER_33 / PALLETS_UNKNOWN (one source of
    // the numbers: _pals over the same members as factsOf).
    const r = p.n > 33 ? ' data-r="OVER_33"' : p.miss && p.n >= 28 ? ' data-r="PALLETS_UNKNOWN"' : '';
    // Over 33: an amber «!» before the number (Figma «ⓘ34»), so the warning is
    // a shape AND a colour — red/amber read 1.2:1 for red-green colour-blind
    // readers (§c.2), and colour alone was the only signal (review 11/10).
    const ic = p.n > 33 ? `<span class="wi4-pal-ic" aria-hidden="true">${_ico('alert_circle', 11)}</span>` : '';
    h += `<span class="wi4-pal${p.n > 33 ? ' over' : p.miss && p.n >= 28 ? ' unk' : ''}"${r} title="${_esc((p.n > 33 ? 'Πάνω από τη χωρητικότητα (33) · ' : 'Παλέτες · ') + p.n + '/33' + (p.miss ? ' · ' + p.miss + ' χωρίς παλέτες' : ''))}">${ic}${p.n}${p.miss ? '+?' : ''}</span>`;
  }
  return h;
}
function _legHTML(s, today) {
  const click = s.click ? ` onclick="event.stopPropagation();${s.click}" style="cursor:pointer"` : '';
  // The leg's own reasons, named where they apply (s.rs = _rsOf of its fact):
  // «PRE» before the first loading point, «καθυστέρηση» after the last
  // delivery point — v1 showed both on the row, v4 had lost them.
  const rs = s.rs || {};
  if (rs.PREORDER) s.from = Object.assign({}, s.from, { pre: 'Pre-order χωρίς μετατροπή — λεπτομέρειες αργότερα' });
  if (rs.LATE) s.to = Object.assign({}, s.to, { late: 'Καθυστέρηση παράδοσης' });
  return `<div class="wi4-leg"${click}>` +
    `<div class="wi4-l-date">${_chipHTML(s.chip, today)}${s.ref ? _ell('wi4-ref wi4-ell', s.ref) : ''}</div>` +
    `<div class="wi4-l-from">${_ptsHTML(s.from)}</div>` +
    `<span class="wi4-l-arr" aria-hidden="true">${ARROW}</span>` +
    `<div class="wi4-l-to">${_ptsHTML(s.to)}</div>` +
    `<div class="wi4-l-pal">${s.pal || ''}</div></div>`;
}

// VS import arrival vs its national delivery (§e #7 c): the only date allowed
// outside the chip.
function _vsWarn(f, oid) {
  const vs = _dateOnly(f['VS CD Date']), del = _day(f['Delivery DateTime']);
  return vs && del && vs > del ? { text: `φτάνει ${_dm(vs)} · παράδοση ${_dm(del)}`, oid } : null;
}

// One import load (matched in an export row, or an import-only row's own).
// rs = the reasons of the import's own fact (_rsOf).
function _impLegHTML(host, imp, today, rs) {
  const I = W(), D = _D();
  rs = rs || {};
  const g = I.impGroupRowOf(imp.id);
  const members = g && (g.orderIds || []).length > 1 ? I.grpOrder(g.orderIds.map((id) => D.data.imports.find((r) => r.id === id)).filter(Boolean), 'Loading DateTime') : [imp];
  const lead = members[0] || imp, f = lead.fields || {};
  const st = I.stFlags(f);
  const isGroup = members.length > 1;
  const dragRow = isGroup && _gtOn() && g ? g.id : null;
  const from = _sideOf(members, 'load', { dragRowId: dragRow });
  let to;
  if (!isGroup && f['Veroia Switch']) {
    const warn = _vsWarn(f, imp.id);
    if (warn && rs.DATE_MISMATCH) warn.r = true;
    // The lot badge moved out of the pallets track to the delivery point
    // (_sideOf); a VS import's delivery point is this one.
    to = { stops: [{ n: 1, label: 'Βέροια', place: 'μετά εθνικό: ' + _lastStop(f, 'del').title, done: st.delivered, warn, oid: imp.id, lot: I.lotBadge(f) }], dateTick: false };
  } else to = _sideOf(members, 'del', { dragRowId: dragRow });
  let pal = _palHTML(members.map((r) => r.fields || {}), isGroup ? null : imp.id);
  // Whole matched group to another export (§f): today's grip string.
  if (isGroup && _gtOn() && host.type === 'export' && _q(g.orderId)) {
    pal = `<span draggable="true" class="wi4-t-g2" style="cursor:grab" title="Σύρε ολόκληρη την ομάδα σε άλλη εξαγωγή" onclick="event.stopPropagation()" ondragstart="event.stopPropagation();_wiImpDragStart(event,'${_q(g.orderId)}',true)" ondragend="_wiImpDragEnd()">⋮⋮</span>` + pal;
  }
  return _legHTML({
    chip: { oid: lead.id, field: 'Loading DateTime', day: _day(f['Loading DateTime']), done: st.loaded, noTruck: !host.saved, what: 'Ημερομηνία φόρτωσης εισαγωγής' },
    ref: isGroup ? _plural(members.length, 'load') : (f['Reference'] || ''),
    from, to, pal, rs, click: _q(lead.id) ? `WI_INTERNAL.edit('${_q(lead.id)}')` : '',
  }, today);
}

// National leg cell (§e #12). Never «ΠΡΟΣ ΑΝΑΘΕΣΗ» for an unread leg (§d.2a).
function _natHTML(oid, name, day, today) {
  const st = _natState();
  const dayS = DAY_RE.test(day || '') ? DOW_SHORT[_dow(day)] : '';
  // The day sits OUTSIDE the cut name (Figma: name left, «Τετ» right): inside
  // it, a long client name ate the day («Omicron Dairy → Βέρο…»).
  const head = `<div class="wi4-nat-h">${_ell('wi4-l1', name)}${dayS ? `<span class="wi4-nat-day" title="${_esc(_dayLabel(day))}">${dayS}</span>` : ''}</div>`;
  // The collapsed column's dot carries the tile's state, words and reason
  // (dot = cls / words / r): a same blue dot for every leg said «a leg
  // exists» for one with no carrier. Only the VISIBLE one of tile and dot
  // shows, so a reason is named once, open or collapsed.
  let tile, dot;
  if (st !== 'ok') {
    const t = st === 'err' ? 'απέτυχε — δεν σημαίνει ότι δεν έχουν μεταφορέα' : 'δεν φορτώθηκε ακόμη';
    tile = `<span class="wi4-tile unk" title="${t}">—</span>`;
    dot = { cls: 'unk', words: t, r: '' };
  } else {
    const c = _carrierOf(oid);
    if (c && c.kind === 'missing') {
      // No NATIONAL LOADS row for this VS order: there is nothing to assign —
      // the order is opened (saving it re-runs the Veroia Switch chain).
      const k = L().dayDiff(today, day);
      const red = k === null || k <= 1;
      const q = _q(oid);
      tile = `<span class="wi4-tile un${red ? ' red' : ''}" data-r="NAT_MISSING" title="Δεν υπάρχει εθνικό φορτίο για αυτή την παραγγελία — άνοιξέ την και αποθήκευσε, ώστε να δημιουργηθεί ξανά"${q ? ` onclick="event.stopPropagation();WI_INTERNAL.edit('${q}')" style="cursor:pointer"` : ''}>δεν υπάρχει εθνικό</span>`;
      dot = { cls: 'un' + (red ? ' red' : ''), words: 'δεν υπάρχει εθνικό', r: 'NAT_MISSING' };
    } else if (c) {
      tile = `<span class="wi4-tile ${c.kind} wi4-ell" title="${_esc((c.kind === 'par' ? 'Εθνικός μεταφορέας — συνεργάτης: ' : 'Εθνικός μεταφορέας — ιδιόκτητο: ') + c.text)}">${_esc(c.text)}</span>`;
      dot = { cls: '', words: c.text, r: '' };
    } else {
      const k = L().dayDiff(today, day);
      const red = k === null || k <= 1;
      tile = `<span class="wi4-tile un${red ? ' red' : ''}" data-r="NAT_NO_CARRIER" title="Εθνικό σκέλος χωρίς μεταφορέα — ανατίθεται στο Εβδομαδιαίο Εθνικών">ΠΡΟΣ ΑΝΑΘΕΣΗ</span>`;
      dot = { cls: 'un' + (red ? ' red' : ''), words: 'ΠΡΟΣ ΑΝΑΘΕΣΗ', r: 'NAT_NO_CARRIER' };
    }
  }
  return `<div class="wi4-nat">${head}${tile}</div><span class="wi4-natdot${dot.cls ? ' ' + dot.cls : ''}"${dot.r ? ` data-r="${dot.r}"` : ''} title="${_esc('Εθνικό σκέλος · ' + name + ' · ' + dot.words)}"></span>`;
}

// Assignment cell (§e #8): box + print (share-menu contract) + paper plane.
// rs = the reasons of the row's own fact (_rsOf): NO_TRUCK and SAME_DAY are
// named HERE, on the assignment they are about.
// A vehicle or person SET on the row but missing from the cache (the lists
// hold Active records only) is «—» with a title, never nothing: «plate» alone
// read as «no driver» (unknown ≠ empty, §d.2a).
function _asgHTML(row, rs) {
  const I = W(), D = _D().data;
  rs = rs || {};
  const oid = (row.orderIds || [])[0] || row.orderId;
  if (row.hasSplitLegs) return '<div class="wi4-asg"><span class="wi4-box split" title="Σπασμένη σε 2 σκέλη — η εκτέλεση ζει στα σκέλη από κάτω">2 σκέλη</span></div>';
  const isImp = row.type === 'import';
  const truck = row.truckLabel || (D.trucks.find((t) => t.id === row.truckId) || {}).label || (row.truckId ? '—' : '');
  const trailer = row.trailerLabel || (D.trailers.find((t) => t.id === row.trailerId) || {}).label || (row.trailerId ? '—' : '');
  const driver = row.driverLabel || (D.drivers.find((d) => d.id === row.driverId) || {}).label || (row.driverId ? '—' : '');
  const offList = [row.truckId && truck === '—' ? 'φορτηγό' : '', row.trailerId && trailer === '—' ? 'ρυμούλκα' : '', row.driverId && driver === '—' ? 'οδηγός' : ''].filter(Boolean);
  const offNote = offList.length ? ' · «—» = ' + offList.join(', ') + ' εκτός λίστας ενεργών' : '';
  // «—», not «Συνεργάτης», for a partner missing from the cache (owner 4/9):
  // the generic word is not a company name.
  const partner = row.partnerLabel || (D.partners.find((p) => p.id === row.partnerId) || {}).label || (row.partnerId ? '—' : '');
  const open = isImp ? (_q(row.orderId) ? `WI_INTERNAL.openImpPopover(event,'${_q(row.orderId)}',${row.id})` : '') : `WI_INTERNAL.openPopover(event,${row.id})`;
  // «ίδια μέρα» opens line 2 (the name after it is cut first, never the word);
  // the old sentence with plate and day is its title.
  const sd = rs.SAME_DAY ? `<span class="wi4-flag amb" data-r="SAME_DAY" title="${_esc(rs.SAME_DAY.text)}">ίδια μέρα</span>` : '';
  const l2HTML = (txt) => (sd ? `<span class="wi4-l2 wi4-l1f">${sd}${txt ? `<span class="wi4-ell" title="${_esc(txt)}">${_esc(txt)}</span>` : ''}</span>` : (txt ? _ell('wi4-l2', txt) : ''));
  let cls, inner, title, r = '';
  if (row.saved && partner) {
    cls = 'par'; const l2 = [row.partnerPlates, driver].filter(Boolean).join(' · ');
    inner = _ell('wi4-l1', partner) + l2HTML(l2);
    title = 'Συνεργάτης: ' + [partner, l2].filter(Boolean).join(' · ') + ' — κλικ: αλλαγή ανάθεσης';
  } else if (row.saved) {
    cls = 'own'; const pl = [truck, trailer].filter(Boolean).join(' · ') || '—';
    inner = `<span class="wi4-l1 wi4-plate" title="${_esc(pl)}">${_esc(pl)}</span>` + l2HTML(driver);
    title = 'Ιδιόκτητο: ' + [pl, driver].filter(Boolean).join(' · ') + offNote + ' — κλικ: αλλαγή ανάθεσης';
  } else {
    cls = 'un'; inner = 'ΠΡΟΣ ΑΝΑΘΕΣΗ'; title = (isImp ? 'Εισαγωγή χωρίς όχημα' : 'Προς ανάθεση') + ' — κλικ για ανάθεση';
    if (rs.NO_TRUCK) r = ' data-r="NO_TRUCK"';
  }
  const box = `<button type="button" class="wi4-box ${cls}"${r} title="${_esc(title)}"${open ? ` onclick="event.stopPropagation();${open}"` : ''}>${inner}</button>`;
  // Print keeps .wk3-prt + data-shq (right-click / long-press share menu,
  // §a.7) and is DRAWN again (review 11/10, P2): on row hover, in its own slot
  // right of the paper plane, never on the box. Roles with planning:'view'
  // print by mouse only here — the per-load menu sits behind
  // _wiBlockReadOnly, exactly as v1's row menu does.
  let prt = '';
  const group = (row.orderIds || []).length > 1;
  const hasP = !!(row.partnerId || row.partnerLabel);
  const shq = (id, leg) => (typeof printSheetQuery === 'function' && _q(id) ? ` data-shq="${_esc(printSheetQuery(id, leg, hasP))}"` : '');
  const pb = (title, attrs, click) => `<button type="button" class="wk3-prt wi4-prt" title="${_esc(title)}" aria-label="${_esc(title)}"${attrs} onclick="event.stopPropagation();${click}">${PRINTER}</button>`;
  if (isImp) {
    prt = group
      ? pb(`Εκτύπωση ομάδας εισαγωγής — ${row.orderIds.length} έγγραφα`, '', `WI_INTERNAL.printImpGroup(${row.id})`)
      : (_q(oid) ? pb('Εκτύπωση εντολής εισαγωγής — δεξί κλικ: κοινή χρήση', `${shq(oid, 'import')} data-shtitle="Εντολή εισαγωγής — W${_D().week}"`, `WI_INTERNAL.printImp('${_q(oid)}',${hasP ? 'true' : 'false'})`) : '');
  } else {
    prt = group
      ? pb(`Εκτύπωση ομάδας — ${row.orderIds.length} έγγραφα`, '', `WI_INTERNAL.printGroup(${row.id})`)
      : pb('Εκτύπωση εντολής εξαγωγής — δεξί κλικ: κοινή χρήση', `${shq(oid, 'export')} data-shtitle="Εντολή εξαγωγής — W${_D().week}"`, `WI_INTERNAL.print(${row.id},'export')`);
  }
  const plane = _q(oid) ? `<button type="button" class="wi4-plane" title="Ενέργειες φορτίου" aria-label="Ενέργειες φορτίου" onclick="event.stopPropagation();WI4Actions.openRowMenu(event,'${_q(oid)}')">${PLANE}</button>` : '';
  return `<div class="wi4-asg">${box}${plane}${prt}</div>`;
}
// why = every reason of the row in one line (_whyOf): the rail is a colour
// and a shape, the title of the number beside it says what they mean.
// presencePatch borrows that title for «who has it open» and gives it back
// (data-why).
function _idxHTML(oid, no, rowId, why) {
  const w = why ? ` title="${_esc(why)}" data-why="${_esc(why)}"` : '';
  return `<div class="wi4-c-idx" data-oid="${_q(oid)}" data-no="${_esc(no)}"><span class="wi4-no"${w}>${_esc(no)}</span>${rowId != null ? `<span class="wi-sync" id="wi-sync-${rowId}"></span>` : ''}</div>`;
}

// ═══ Markup: rows (§e #7, #11, #13) ═════════════════════════════════════
// A row whose record is not in WINTL.data is never silently left out: its
// facts were already counted (the queue points at it), so the board shows a
// line that says so, and app_errors gets it once per session (principle 1).
function _missingHTML(e, oid, sub) {
  const key = String((e.row && e.row.id) || '') + '/' + oid;
  if (!_missLogged.has(key)) { _missLogged.add(key); _logErr(new Error('wi4: row ' + key + ' has no record in WINTL.data'), 'wi4: row skipped'); }
  const rid = e.row && Number.isInteger(e.row.id) ? e.row.id : null;
  return `<div class="${sub ? 'wi4-subrow' : 'wi4-row'}"${rid != null && !sub ? ` data-row-id="${rid}"` : ''} data-oid="${_q(oid)}" data-qi="${e.qi}">` +
    (sub ? '<div class="wi4-c-idx"><span class="wi4-legidx">↳</span></div>' : _idxHTML(oid, e.no, rid)) +
    '<div class="wi4-c-span wi4-t-g2">— η παραγγελία δεν φορτώθηκε · <button type="button" class="wi4-link" onclick="WI_INTERNAL.renderWeeklyIntl()">Ανανέωση</button></div></div>';
}
function _expRowHTML(e, today) {
  const I = W(), D = _D(), row = e.row;
  const exps = _memberRecs(row);
  if (!exps.length) return _missingHTML(e, (row.orderIds || [])[0] || row.orderId);
  const isGroup = exps.length > 1, pf = exps[0].fields || {}, pid = exps[0].id;
  const st = I.stFlags(pf), vs = !!pf['Veroia Switch'];
  const noTruck = !row.saved;
  const rsE = _rsOf(e.facts[0] && e.facts[0].f, today);   // facts[0] = the row's own (_rowFacts)
  let chip, from;
  if (vs && !isGroup) {
    const v = I.vsCd(pf, 'exp') || {};
    chip = { oid: pid, field: 'VS CD Date', day: v.iso, est: v.est, done: st.loaded, noTruck, what: 'Ημερομηνία φόρτωσης από Βέροια' };
    const o = _splitName((_stopsOf(pf, 'load')[0] || {}).n || I.clientName(pf));
    // The mirror of the VS import's «φτάνει …» (DATE_MISMATCH): the truck
    // loads at Βέροια before the national leg has even left. Named on the
    // Βέροια point, the one place where the two days meet.
    const vsDay = _dateOnly(pf['VS CD Date']), natDay = _day(pf['Loading DateTime']);
    const warn = rsE.DATE_MISMATCH && vsDay && natDay ? { text: `Βέροια ${_dm(vsDay)} · εθνικό φορτώνει ${_dm(natDay)}`, oid: pid, r: true } : null;
    from = { stops: [{ n: 1, label: 'Βέροια', place: 'από ' + [o.title, o.city].filter(Boolean).join(', '), done: st.loaded, warn, oid: pid }], dateTick: true };
  } else {
    chip = { oid: pid, field: 'Loading DateTime', day: _day(pf['Loading DateTime']), done: st.loaded, noTruck, what: 'Ημερομηνία φόρτωσης' };
    from = _sideOf(exps, 'load', { dragRowId: isGroup && _gtOn() ? row.id : null });
  }
  const to = _sideOf(exps, 'del', { dragRowId: isGroup && _gtOn() ? row.id : null });
  // (a) a groupage shows «N φορτία» where ΑΝΑΦ. goes.
  const ref = isGroup ? _plural(exps.length, 'load') : (pf['Reference'] || '');
  const leg = _legHTML({ chip, ref, from, to, rs: rsE, pal: _palHTML(exps.map((r) => r.fields || {}), isGroup ? null : pid),
    click: isGroup ? `WI_INTERNAL.rota(${row.id})` : (_q(pid) ? `WI_INTERNAL.edit('${_q(pid)}')` : '') }, today);

  // Import side: not saved · matched load · not read · empty return · partner only · open slot.
  const imp = row.importId ? D.data.imports.find((r) => r.id === row.importId) : null;
  const hasPartner = !!(row.partnerId || row.partnerLabel);
  let impInner;
  // A match (or an unmatch) that FAILED: the row keeps its optimistic state
  // (§e.14: never rebuilt), but this cell says what the TABLE holds — the
  // board no longer counts one thing and draws another (review 11/10, P2).
  if (_unconfirmed(row)) impInner = _notSavedHTML(row, rsE);
  else if (imp) impInner = _impLegHTML(row, imp, today, _rsAt(e, row.importId, today));
  else if (row.importId && !imp) {
    // Matched to an import this week's read does not hold (it loads outside
    // ±8 days, or it was cancelled): unknown ≠ empty (§d.2a) — never the open
    // «σύρε εισαγωγή εδώ» slot it used to look like.
    const ri = _q(row.importId);
    impInner = `<span class="wi4-void wi4-t-amb wi4-ell" data-r="MATCH_UNREAD" title="Η ταιριασμένη εισαγωγή δεν φορτώθηκε σε αυτή την εβδομάδα — φορτώνει εκτός ±8 ημερών ή ακυρώθηκε">εισαγωγή εκτός προβολής${ri ? ` · <button type="button" class="wi4-link" onclick="event.stopPropagation();WI_INTERNAL.edit('${ri}')">άνοιγμα</button>` : ''}</span>`;
  }
  else if (row.saved && !hasPartner && !row.importId) impInner = _gapHTML(row, e, today);
  else if (row.saved && hasPartner) impInner = '<span class="wi4-void">Μόνο εξαγωγή · συνεργάτης</span>';
  else impInner = '<span class="wi4-void" title="Σύρε εισαγωγή εδώ για ταίριασμα"></span>';
  // The import cell is the drop target (§f): empty = match, a load = join.
  const impCell = `<div id="wi-ci-${row.id}" class="wi4-c-imp wi4-imp" ondragover="event.preventDefault();this.classList.add('wi4-dh')" ondragleave="this.classList.remove('wi4-dh')" ondrop="event.stopPropagation();_wiDropOnRow(event,${row.id})">${impInner}</div>`;

  const fl = vs && !isGroup ? _natHTML(pid, _firstTitle(pf, 'load') + ' → Βέροια', _day(pf['Loading DateTime']), today) : '';
  // The matched import's national leg belongs to the import: not drawn here
  // while the match is unconfirmed (it is counted with the ghost, not here).
  const imf = imp && !_unconfirmed(row) ? (imp.fields || {}) : null;
  const fr = imf && imf['Veroia Switch'] ? _natHTML(imp.id, _lastStop(imf, 'del').title, _day(imf['Delivery DateTime']), today) : '';
  const lvl = _levelOf(e.facts, today);
  return `<div id="wi-row-${row.id}" data-row-id="${row.id}" data-oid="${_q(pid)}" data-qi="${e.qi}" class="wi4-row${_rail(lvl)}"${_q(pid) ? ` oncontextmenu="WI4Actions.openRowMenu(event,'${_q(pid)}')"` : ''}>` +
    _idxHTML(pid, e.no, row.id, _whyOf(e.facts, today)) +
    `<div class="wi4-c-fl">${fl}</div>` +
    `<div class="wi4-c-exp">${leg}</div>` +
    `<div class="wi4-c-asg">${_asgHTML(row, rsE)}</div>` +
    impCell +
    `<div class="wi4-c-fr">${fr}</div></div>`;
}
// The import cell of a row whose match/unmatch FAILED (_unconfirmed): what the
// table holds, in words — «δεν αποθηκεύτηκε — η REF-I004 είναι ακόμη
// ελεύθερη» — with data-r for the reason the header counts there (an own
// truck with no import in the table = EMPTY_RETURN). Dashed, like an open
// slot: it is still the drop target (§f).
function _impRef(id) {
  const f = _f(id);
  return f['Reference'] ? String(f['Reference']) : (W().clientName(f) || 'η εισαγωγή');
}
function _notSavedHTML(row, rs) {
  const srv = _srvMatch(row);
  let txt;
  if (row.importId) txt = `δεν αποθηκεύτηκε — η ${_impRef(row.importId)} είναι ακόμη ελεύθερη` + (srv ? ` · μένει η ${_impRef(srv)}` : '');
  else txt = srv ? `δεν αποθηκεύτηκε — η ${_impRef(srv)} μένει ταιριασμένη εδώ` : 'δεν αποθηκεύτηκε';
  const er = (rs || {}).EMPTY_RETURN;
  const r = er ? ` data-r="EMPTY_RETURN"` : '';
  const why = er ? ' · ' + er.text : '';
  return `<span class="wi4-ns${er && er.level === 'red' ? ' wi4-t-red' : er ? ' wi4-t-amb' : ' wi4-t-g2'}"${r} title="${_esc('Η αλλαγή δεν αποθηκεύτηκε — το κελί δείχνει ό,τι είναι γραμμένο στη βάση' + why)}">${_ico('alert_circle', 11)}<span class="wi4-ell">${_esc(txt)}</span></span>`;
}
// The GHOST of a failed match (_compute ghosts): the import is still free in
// the table, in its own loading day — counted there, so it is drawn there too:
// a 24px line that names each reason the day header counts for it (data-r),
// and a click that goes to the export the match was meant for.
function _ghostHTML(e, today) {
  const ir = e.row, q = _q(ir.orderId);
  const rs = _rsOf(e.facts[0] && e.facts[0].f, today);
  const words = Object.values(rs).map((r) => `<span class="${r.level === 'red' ? 'wi4-t-red' : 'wi4-t-amb'}" data-r="${_esc(r.code)}">${_esc(GHOST_WORDS[r.code] || r.text)}</span>`);
  const exp = ((_D().rows) || []).find((r) => r.type === 'export' && r.importId && (ir.orderIds || [ir.orderId]).includes(r.importId) && _unconfirmed(r));
  const expOid = exp ? ((exp.orderIds || [])[0] || exp.orderId) : '';
  const head = [_impRef(ir.orderId), W().clientName(_f(ir.orderId)) || ''].filter(Boolean).join(' · ');
  const tail = 'η ένωση' + (expOid ? ' με ' + _loadLabel(expOid) : '') + ' δεν αποθηκεύτηκε';
  const go = _q(expOid) ? ` onclick="event.stopPropagation();WIV2.focusRow('${_q(expOid)}')"` : '';
  // In the IMPORT column, where the import would be drawn.
  return `<div class="wi4-ghost" data-oid="${q}" role="note" title="${_esc(head + ' — ' + tail + (expOid ? ' · κλικ: η εξαγωγή' : ''))}"${go}>` +
    `<div class="wi4-c-idx">${_ico('alert_circle', 11)}</div>` +
    `<div class="wi4-c-imp wi4-ghost-t"><span class="wi4-ell" title="${_esc(head)}">${_esc(head)} —</span>${words.join('<span class="wi4-t-g2">·</span>')}<span class="wi4-ell wi4-t-g2" title="${_esc(tail)}">· ${_esc(tail)}</span></div></div>`;
}
// «Κενό γύρισμα · από Τρί 6/10 · Τόπος, CZ» + «+ Νέα εισαγωγή» (§e #13). The
// colour is the EMPTY_RETURN level of WI4.flags — the same rule as the rail.
function _gapHTML(row, e, today) {
  const x = e.facts[0];
  const r = x ? L().flags(x.f, today).reasons.find((y) => y.code === 'EMPTY_RETURN') : null;
  const t = r ? (r.level === 'red' ? 'wi4-t-red' : 'wi4-t-amb') : 'wi4-t-g2';
  const from = x && x.f.returnDate ? ' · από ' + (x.f.returnDate === today ? 'σήμερα' : _dayLabel(x.f.returnDate)) : '';
  const place = x && x.f.returnPlace ? ' · ' + x.f.returnPlace : '';
  const detail = (from + place).replace(/^ · /, '');
  return `<div class="wi4-gap${r && r.level === 'amber' ? ' amb' : ''}"${r ? ' data-r="EMPTY_RETURN"' : ''} title="${_esc('Κενό γύρισμα — ιδιόκτητος γύρος χωρίς φορτίο επιστροφής. Σύρε εισαγωγή εδώ ή δημιούργησε νέα.')}">` +
    // The title holds the visible words: cut on a narrow screen (1440), the
    // whole line is still readable (overflow scan, fix round 3).
    '<span>Κενό γύρισμα</span>' + (detail ? `<span class="${t} wi4-ell" title="${_esc('Κενό γύρισμα · ' + detail)}">· ${_esc(detail)}</span>` : '') +
    // The plus is the 12px icon, not a typed «+ » (Figma 1097:2685).
    `<button type="button" class="wi4-gap-act" onclick="event.stopPropagation();WI_INTERNAL.newImport(${row.id})">${_ico('plus', 12)}Νέα εισαγωγή</button>` +
    `<span class="wi2-gapstk" data-row="${row.id}">${W().stockGapLink(row)}</span></div>`;
}
function _impRowHTML(e, today) {
  const I = W(), D = _D(), row = e.row;
  const imp = D.data.imports.find((r) => r.id === row.orderId);
  if (!imp) return _missingHTML(e, row.orderId);
  const f = imp.fields || {}, oid = imp.id, q = _q(oid);
  const own = row.saved && !row.partnerId;
  const left = `<div class="wi4-noexp"${own ? ' onclick="event.stopPropagation();WI_INTERNAL.jumpFirstPendingExp()" style="cursor:pointer" title="Ιδιόκτητο όχημα χωρίς εξαγωγή — κλικ: η πρώτη εξαγωγή προς ανάθεση"' : ''}><span>Χωρίς εξαγωγή</span><span class="wi4-t-g2">· αυτή την εβδομάδα</span></div>`;
  const fr = f['Veroia Switch'] ? _natHTML(oid, _lastStop(f, 'del').title, _day(f['Delivery DateTime']), today) : '';
  const lvl = _levelOf(e.facts, today);
  const rs = _rsOf(e.facts[0] && e.facts[0].f, today);   // facts[0] = the row's own (_rowFacts)
  // A free import row is a drag source (§f); split legs are not free imports.
  const drag = q && !e.split ? ` draggable="true" ondragstart="event.stopPropagation();_wiImpDragStart(event,'${q}')" ondragend="_wiImpDragEnd()"` : '';
  return `<div id="wi-imp-${q}" data-row-id="${row.id}" data-oid="${q}" data-qi="${e.qi}" class="wi4-row${_rail(lvl)}"${drag}${q ? ` oncontextmenu="WI4Actions.openRowMenu(event,'${q}')"` : ''}>` +
    _idxHTML(oid, e.no, row.id, _whyOf(e.facts, today)) +
    '<div class="wi4-c-fl"></div>' +
    `<div class="wi4-c-exp">${left}</div>` +
    `<div class="wi4-c-asg">${_asgHTML(row, rs)}</div>` +
    `<div class="wi4-c-imp">${_impLegHTML(row, imp, today, rs)}</div>` +
    `<div class="wi4-c-fr">${fr}</div></div>`;
}
// Split frame header (§e #11): «ΣΠΑΣΜΕΝΗ ΣΕ 2 ΣΚΕΛΗ · Α → Γ · 30π · αλλαγή
// φορτηγού στο σημείο Χ». The legs follow as full rows numbered ↳1/↳2.
function _splitHTML(e) {
  const I = W(), D = _D(), row = e.row;
  const pid = (row.orderIds || [])[0] || row.orderId, q = _q(pid);
  const f = _f(pid);
  const legs = ((D._splitLegs && D._splitLegs[pid]) || []).slice().sort((a, b) => (a.splitLegNo || 0) - (b.splitLegNo || 0));
  const leg1 = legs.find((l) => l.splitLegNo === 1) || legs[0];
  const hand = leg1 ? _lastStop(_f((leg1.orderIds || [])[0] || leg1.orderId), 'del').title : '';
  const p = _pals([f]);
  const txt = [(I.clientName(f) || '—') + ' → ' + _lastStop(f, 'del').title, p.known ? p.n + 'π' : '', hand && hand !== '—' ? 'αλλαγή φορτηγού στο σημείο ' + hand : ''].filter(Boolean).join(' · ');
  return `<div class="wi4-splithd" data-row-id="${row.id}" data-oid="${q}"${q ? ` onclick="WI_INTERNAL.edit('${q}')" oncontextmenu="WI4Actions.openRowMenu(event,'${q}')"` : ''} title="Σπασμένη σε ${legs.length || 2} σκέλη — κλικ: αρχική παραγγελία · δεξί κλικ: μενού">` +
    _idxHTML(pid, e.no, null) +
    `<div class="wi4-c-span"><span class="wi4-ell" style="display:block" title="${_esc('ΣΠΑΣΜΕΝΗ ΣΕ ' + (legs.length || 2) + ' ΣΚΕΛΗ · ' + txt)}"><span class="wi4-tag">ΣΠΑΣΜΕΝΗ ΣΕ ${legs.length || 2} ΣΚΕΛΗ</span> · ${_esc(txt)}</span></div></div>`;
}
// Rota leg (§e #11): «ΣΚΕΛΟΣ ΡΟΤΑΣ · ίδιο φορτηγό» + «× αποσύνδεση», the leg
// itself in the column of its direction.
function _legRowHTML(e, today) {
  const I = W(), lr = e.row;
  const oid = (lr.orderIds || [])[0] || lr.orderId, q = _q(oid);
  const r = _rec(oid);
  if (!r) return _missingHTML(e, oid, true);
  const f = r.fields || {}, isImp = f['Direction'] === 'Import';
  const st = I.stFlags(f);
  const rs = _rsOf(e.facts[0] && e.facts[0].f, today);
  const leg = _legHTML({
    chip: { oid, field: 'Loading DateTime', day: _day(f['Loading DateTime']), done: st.loaded, noTruck: false, what: 'Ημερομηνία φόρτωσης σκέλους' },
    ref: f['Reference'] || '', from: _sideOf([r], 'load'), to: _sideOf([r], 'del'), pal: _palHTML([f], oid), rs,
  }, today);
  // The tag sits in the OTHER column, leaning towards the assignment cell.
  const tag = `<span class="wi4-ell" style="display:block;text-align:${isImp ? 'right' : 'left'}" title="ΣΚΕΛΟΣ ΡΟΤΑΣ · ίδιο φορτηγό — σκέλος ρότας, το ίδιο φορτηγό"><span class="wi4-tag">ΣΚΕΛΟΣ ΡΟΤΑΣ</span> <span class="wi4-t-g2">· ίδιο φορτηγό</span></span>`;
  const lvl = _levelOf(e.facts, today);
  const unlink = q ? `<button type="button" class="wi4-unlink" title="Ακύρωση προώθησης — αποσύνδεση σκέλους από τη ρότα" onclick="event.stopPropagation();WI_INTERNAL.rotUnlink(event,'${q}')">× αποσύνδεση</button>` : '';
  // A leg rides its RT's truck: a same-day clash is said here, by the unlink.
  const sd = rs.SAME_DAY ? `<span class="wi4-flag amb" data-r="SAME_DAY" title="${_esc(rs.SAME_DAY.text)}">ίδια μέρα</span>` : '';
  // A VS leg has a national leg like any VS row: drawn in its column, so a
  // missing carrier the header counts is also named here.
  const nat = f['Veroia Switch'] ? (isImp ? _natHTML(oid, _lastStop(f, 'del').title, _day(f['Delivery DateTime']), today)
    : _natHTML(oid, _firstTitle(f, 'load') + ' → Βέροια', _day(f['Loading DateTime']), today)) : '';
  const why = _whyOf(e.facts, today);
  return `<div class="wi4-subrow${_rail(lvl)}" data-row-id="${lr.id}" data-oid="${q}" data-qi="${e.qi}"${q ? ` onclick="WI_INTERNAL.edit('${q}')" oncontextmenu="WI4Actions.openRowMenu(event,'${q}')"` : ''}>` +
    `<div class="wi4-c-idx"><span class="wi4-legidx"${why ? ` title="${_esc(why)}"` : ''}>↳</span></div><div class="wi4-c-fl">${isImp ? '' : nat}</div>` +
    `<div class="wi4-c-exp">${isImp ? tag : leg}</div>` +
    `<div class="wi4-c-asg"><div class="wi4-asg">${sd}${unlink}</div></div>` +
    `<div class="wi4-c-imp">${isImp ? leg : tag}</div><div class="wi4-c-fr">${isImp ? nat : ''}</div></div>`;
}
// Local driver (§e #11): «ΤΟΠΙΚΗ ΦΟΡΤΩΣΗ · Οδηγός · Σάβ 3/10 05:00» in the
// export column, «ΤΟΠΙΚΗ ΠΑΡΑΔΟΣΗ · … · άλλο φορτηγό ΧΥΖ» in the import
// column. Only what differs from the order is added (Relay.diffParts).
function _relayRowHTML(e, today) {
  const I = W(), D = _D();
  const { rec, oid, s } = e.x;
  const isDel = s.kind === 'relay_delivery';
  const tag = isDel ? 'ΤΟΠΙΚΗ ΠΑΡΑΔΟΣΗ' : 'ΤΟΠΙΚΗ ΦΟΡΤΩΣΗ';
  const q = _q(oid), rid = SAFE.test(String(rec.id || '')) ? rec.id : '';
  if (s.unread) {
    // Relay.summary could not read it (see relaysOf): said, never left out.
    const cell = `<span class="wi4-ell wi4-t-amb" style="display:block" title="${_esc(tag + ' · δεν διαβάστηκε — η τοπική κίνηση δεν διαβάστηκε · κλικ: άνοιγμα')}"><span class="wi4-tag">${tag}</span> · δεν διαβάστηκε</span>`;
    const acts = q && rid ? ` onclick="WI_INTERNAL.relayOpen('${q}','${rid}')"` : '';
    return `<div class="wi4-subrow" data-oid="${q}"${rid ? ` data-relay="${rid}"` : ''}${acts}>` +
      '<div class="wi4-c-idx"><span class="wi4-legidx">↳</span></div><div class="wi4-c-fl"></div>' +
      `<div class="wi4-c-exp">${isDel ? '' : cell}</div><div class="wi4-c-asg"></div>` +
      `<div class="wi4-c-imp">${isDel ? cell : ''}</div><div class="wi4-c-fr"></div></div>`;
  }
  const bad = D.relay && D.relay.syncErr && D.relay.syncErr[rec.id];
  const rs = _rsOf(e.facts[0] && e.facts[0].f, today);
  // «Σάβ 3/10 05:00»: the board's ONE day format (WI4.dayLabel), never
  // Relay.fmtDay's «Σάβ 03/10» beside a chip that says «Σάβ 3/10».
  const parts = [s.driverName || 'ΠΡΟΣ ΑΝΑΘΕΣΗ', (_dayLabel(s.day) || '') + (s.time ? ' ' + s.time : '')].concat(Relay.diffParts(s) || []);
  if (s.done) parts.push('✓ ' + (isDel ? 'παραδόθηκε' : 'φορτώθηκε'));
  if (s.dayMismatch) parts.push('⚠ μέρα ≠ παραγγελίας');
  if (bad) parts.push('⚠ δεν επιβεβαιώθηκε');
  let tip = '';
  try { tip = I.relayTip(e.x); } catch (err) { _logErr(err, 'wi4: relay tip'); }
  const word = (p, i) => {
    if (i === 0 && !s.driverName) return `<span class="wi4-t-red"${rs.RELAY_NO_DRIVER ? ' data-r="RELAY_NO_DRIVER"' : ''}>${_esc(p)}</span>`;
    if (bad && p === '⚠ δεν επιβεβαιώθηκε') return `<span${rs.SAVE_FAILED ? ' data-r="SAVE_FAILED"' : ''}>${_esc(p)}</span>`;
    return _esc(p);
  };
  // The visible words first, the old board's tip after them: a cell cut on
  // a narrow screen keeps its whole text in the title (overflow scan).
  const cell = `<span class="wi4-ell" style="display:block" title="${_esc(tag + ' · ' + parts.join(' · ') + (tip ? ' — ' + tip : ''))}"><span class="wi4-tag">${tag}</span> · ${parts.map(word).join(' · ')}</span>`;
  const acts = q && rid ? ` onclick="WI_INTERNAL.relayOpen('${q}','${rid}')" oncontextmenu="_wiRelayCtx(event,'${rid}','${q}')"` : '';
  // Its rail is its own facts (WI4.flags), the same rule as the day header
  // and the queue item it raises.
  return `<div class="wi4-subrow${_rail(_levelOf(e.facts, today))}" data-oid="${q}"${rid ? ` data-relay="${rid}"` : ''}${acts}>` +
    '<div class="wi4-c-idx"><span class="wi4-legidx">↳</span></div><div class="wi4-c-fl"></div>' +
    `<div class="wi4-c-exp">${isDel ? '' : cell}</div><div class="wi4-c-asg"></div>` +
    `<div class="wi4-c-imp">${isDel ? cell : ''}</div><div class="wi4-c-fr"></div></div>`;
}
function _entryHTML(e, today) {
  switch (e.t) {
    case 'exp': return _expRowHTML(e, today);
    case 'imp': return _impRowHTML(e, today);
    case 'split': return _splitHTML(e);
    case 'leg': return _legRowHTML(e, today);
    case 'relay': return _relayRowHTML(e, today);
    // A failed match's import, still free in the table: drawn in its own day
    // (review 11/10 — counted there but never drawn, the day lied).
    case 'ghost': return _ghostHTML(e, today);
  }
  return '';
}

// ═══ Markup: day headers, chrome (§e #1–#6, #20, #21) ═════════════════════
// Owner 11/10 (decision 1): a day header is its name and date only. The
// reasons already live on the rows' rails, in the ΕΠΟΜΕΝΑ band and in the
// cells; the header no longer repeats them. What is left is ONE marker, shown
// by CSS only on a CLOSED day (.wi4-day:not(.closed) .wi4-dayh-c), so a
// folded day never hides work silently. A day never folds by itself while it
// has a reason (WI4.collapsible needs none, _dayHeld keeps writes and focus
// open, a queue card reopens its day), so in practice the marker shows on a
// day the USER closed. Its label is the header's former words (WI4.dayText +
// EXTRA_WORDS): hover and screen readers still say what is inside, and the
// rig still checks «header = queue = rails» against it. Shape as well as
// colour (§c.2, colour-blind rule): red = filled, amber = ring, grey ring =
// only the national legs are unread or loading (unknown, not a warning).
function _dayCountHTML(day) {
  const by = day.counts.byCode || {};
  const words = [String(day.text || '')];
  Object.keys(EXTRA_WORDS).forEach((code) => {
    if (!by[code]) return;
    words.push(EXTRA_PLURAL[code] ? _plural(by[code], EXTRA_PLURAL[code]) : by[code] + ' ' + EXTRA_WORDS[code]);
  });
  const codes = Object.keys(by).filter((c) => by[c]);
  const natUnread = /εθνικά σκέλη:/.test(day.text || '');
  if (!codes.length && !natUnread) return '';
  const lvl = codes.some((c) => day.levels[c] === 'red') ? 'red' : codes.length ? 'amb' : 'unk';
  const label = _esc(words.filter(Boolean).join(' · '));
  return `<span class="wi4-dayh-dot ${lvl}" role="img" aria-label="${label}" title="${label}"></span>`;
}
// Day open state (§e #6). A user toggle wins (WINTL.ui.v4Days). Otherwise a
// day with anything to do is open, and a «collapsible» day follows the
// week's auto decision: while the week's sources are still landing it tracks
// WI4.collapsible; once they have all answered the closed set is FROZEN. From
// then on a day can only open by itself (it gained a reason), never close.
// Why (11/10): the optimistic paint of a match made Tuesday «collapsible»
// and folded away the row the user had just dropped on — with its ⟳ and, when
// the write then failed, its «Δεν αποθηκεύτηκε» line.
function _autoSettle(days) {
  const D = _D();
  if (_auto && _auto.week !== D.week) _auto = null;
  if (!_auto) _auto = { week: D.week, frozen: false, closed: {} };
  if (_auto.frozen) return;
  _auto.closed = {};
  days.forEach((d) => { if (d.collapsible && DAY_RE.test(d.date || '')) _auto.closed[d.date] = true; });
  if (_natState() !== 'loading' && _relayState() !== 'loading') _auto.frozen = true;
}
// A write in flight or failed, or the keyboard focus, keeps its day open.
function _dayHeld(day) {
  const D = _D(), log = D._syncLog || {}, foc = D.ui && D.ui.v4Focus;
  return day.entries.some((e) => (e.facts || []).some((x) => {
    const s = log[x.oid];
    return x.oid === foc || (s && (s.state === 'pend' || s.state === 'err'));
  }));
}
function _dayOpen(day) {
  const ui = _D().ui || {};
  const m = ui.v4Days || {};
  if (Object.prototype.hasOwnProperty.call(m, day.date)) return !!m[day.date];
  if (!day.collapsible || _dayHeld(day)) return true;
  return !(_auto && _auto.week === _D().week && _auto.closed[day.date]);
}
function _dayHTML(day, today) {
  const dw = _dow(day.date);
  // Figma 1097:2642: the day name is a Syne caps label, the date DM Sans.
  const name = dw == null ? 'ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ' : `${DOW_HEAD[dw]} <span class="wi4-dayd">${_dm(day.date)}</span>`;
  const wk = day.extra && day.date ? W().weekOf(day.date + 'T12:00:00') : null;
  // Owner 11/10: name + date only, so the moved-in section's «μεταφέρθηκε ·
  // W42» moves into the title of its name; the date, after Friday, already
  // shows it lies outside Σαβ–Παρ.
  const tip = day.extra ? ` title="μεταφέρθηκε${wk != null ? ' · W' + wk : ''}: εμφανίζεται σε αυτή την προβολή (Μεταφορά εβδομάδας) — η πραγματική ημέρα είναι εκτός Σαβ–Παρ"` : '';
  const q = DAY_RE.test(day.date || '') ? day.date : '';
  // The chevron is an icon (aria-hidden), never a «▾» glyph in the icon grey.
  const chev = `<span class="wi4-chev" aria-hidden="true">${_ico('chevron_down', 14)}</span>`;
  // «ΠΑΡΑΣΚΕΥΗ 9/10 · σήμερα» (Figma 1097:3590): dot and word in today's
  // blue. The dot was grey to match the counts after it; they are gone.
  const todayW = day.today ? '<span class="wi4-today">· σήμερα</span>' : '';
  if (day.empty) {
    // Owner 11/10: no «Καμία κίνηση», and no chevron — there is nothing to
    // open. A 14px spacer keeps the name in line with the other days.
    return `<section class="wi4-day empty${day.today ? ' today' : ''}" data-day="${q}"><div class="wi4-dayh"><span class="wi4-dayh-sp" aria-hidden="true"></span><span class="wi4-dayn">${name}</span>${todayW}</div></section>`;
  }
  const open = _dayOpen(day);
  // A failed write's line goes under the row it belongs to, once per order
  // whose write failed (the export, its matched import, a rota leg).
  const msgs = (e) => (e.t === 'exp' || e.t === 'imp' || e.t === 'leg' ? [...new Set((e.facts || []).map((x) => x.oid))].map(_msgHTML).join('') : '');
  const body = day.entries.map((e) => _entryHTML(e, today) + msgs(e)).join('');
  return `<section class="wi4-day${day.today ? ' today' : ''}${open ? '' : ' closed'}" data-day="${q}">` +
    `<div class="wi4-dayh" role="button" tabindex="0" aria-expanded="${open}" onclick="WIV2._dayTog('${q}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();WIV2._dayTog('${q}')}">` +
    `${chev}<span class="wi4-dayn"${tip}>${name}</span>${todayW}` +
    `<span class="wi4-dayh-c" data-dc="${q}" data-codes="${_esc(day.codes || '')}">${_dayCountHTML(day)}</span></div>` +
    `<div class="wi4-day-body">${body}</div></section>`;
}
function _range(week) {
  const I = W();
  const ws = I.weekStart(week);
  if (!(ws instanceof Date) || isNaN(ws)) return I.weekRange(week) || '';
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  return ws.getMonth() === we.getMonth()
    ? `${ws.getDate()}–${we.getDate()} ${MONTH_GEN[we.getMonth()]}`
    : `${ws.getDate()} ${MONTH_GEN[ws.getMonth()]} – ${we.getDate()} ${MONTH_GEN[we.getMonth()]}`;
}
function _updHTML() {
  const D = _D();
  const errs = Object.values(D._syncLog || {}).filter((s) => s && s.state === 'err').length;
  // Icons as sheet 14 #9 draws them: alert for a failure, refresh beside «Ενημερώθηκε».
  if (errs) return `<span class="wi4-upd err" id="wi4-upd" role="status">${_ico('alert_circle', 12)}${errs} ${errs === 1 ? 'αλλαγή δεν αποθηκεύτηκε' : 'αλλαγές δεν αποθηκεύτηκαν'}</span>`;
  const ch = _presState().changes;
  if (ch && (+ch.n > 0 || +ch.auto_n > 0)) {
    const words = [];
    if (+ch.n > 0) words.push(`${+ch.n} ${+ch.n === 1 ? 'αλλαγή' : 'αλλαγές'}${ch.last_by ? ' από ' + ch.last_by : ''}`);
    if (+ch.auto_n > 0) words.push(`${+ch.auto_n} ${+ch.auto_n === 1 ? 'αυτόματη ενημέρωση' : 'αυτόματες ενημερώσεις'}`);
    // The server counts every International order (not only this week's)
    // and looks back at most 15΄ per beat (068); the client never lowers the
    // count until a re-read. The tooltip claims exactly that much. On a
    // narrow bar (1440) «από Χ» and the automatic count give way (the whole
    // is the title): «↻ 3 αλλαγές · Ανανέωση» is never clipped (11/10).
    const head = +ch.n > 0 ? `${+ch.n} ${+ch.n === 1 ? 'αλλαγή' : 'αλλαγές'}` : `${+ch.auto_n} ${+ch.auto_n === 1 ? 'αυτόματη ενημέρωση' : 'αυτόματες ενημερώσεις'}`;
    const tail = words.join(' · ').slice(head.length).trim();   // the flex gap is the space
    return `<button type="button" class="wi4-upd chg" id="wi4-upd" onclick="WI_INTERNAL.renderWeeklyIntl()" title="${_esc(words.join(' · '))} — άλλαξαν διεθνείς παραγγελίες από τότε που φόρτωσε η σελίδα · κλικ: ανανέωση">${_ico('refresh', 12)}<span>${_esc(head)}</span>${tail ? `<span class="wi4-upd-l">${_esc(tail)}</span>` : ''}<span>· Ανανέωση</span></button>`;
  }
  const at = D._loadedAt instanceof Date ? D._loadedAt : null;
  if (!at) return '<span class="wi4-upd" id="wi4-upd"></span>';
  const s = Math.max(0, Math.round((Date.now() - at.getTime()) / 1000));
  const ago = s < 60 ? 'μόλις τώρα' : s < 3600 ? `πριν ${Math.round(s / 60)}΄` : `πριν ${Math.round(s / 3600)}ω`;
  const hm = at.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false });
  // Presence live: ONE sync token, «↻ ζωντανά» (sheet 16 A) — the load time
  // stays in the title. Beside «↻ Ενημερώθηκε μόλις τώρα» it said the same
  // thing twice and pushed the names out of the bar (review 11/10).
  if (_presState().status === 'live') return `<span class="wi4-upd live" id="wi4-upd" title="Ζωντανή εικόνα · ο πίνακας φορτώθηκε στις ${_esc(hm)}">${_ico('refresh', 12)}ζωντανά</span>`;
  // «Ενημερώθηκε» gives way before «πριν 2΄» when the bar is narrow (1440).
  return `<span class="wi4-upd" id="wi4-upd" title="Ενημερώθηκε στις ${_esc(hm)}">${_ico('refresh', 12)}<span class="wi4-upd-l">Ενημερώθηκε</span><span>${ago}</span></span>`;
}
function _tabsHTML(m) {
  const I = W(), D = _D(), wk = D.week, cur = I.currentWeek();
  const go = (w) => `WI_INTERNAL.WINTL.week=${Math.min(53, Math.max(1, w))};WI_INTERNAL.renderWeeklyIntl()`;
  let h = `<button type="button" class="wi4-tab" onclick="${go(wk - 1)}" title="Προηγούμενη εβδομάδα" aria-label="Προηγούμενη εβδομάδα">‹</button>`;
  for (let w = wk - 3; w <= wk + 3; w++) {
    if (w < 1 || w > 53) continue;
    let badge = '';
    // W+1 badge = the queue's next-week items, the SAME number (§e #1).
    if (w === wk + 1 && wk === cur && _xw) {
      if (_xw.state === 'err') badge = '<span class="wi4-tab-b" title="Οι φορτώσεις της W+1 δεν φορτώθηκαν — δεν σημαίνει ότι δεν υπάρχουν">—</span>';
      // In flight: «…», never no badge — no badge read as zero (review 11/10).
      else if (_xw.state === 'loading') badge = '<span class="wi4-tab-b ld" title="Οι φορτώσεις της W+1 φορτώνουν">…</span>';
      else if (_xw.state === 'ok' && m.xwCount) badge = `<span class="wi4-tab-b" title="${m.xwCount} φορτία της W${w} φορτώνουν ως αύριο">${m.xwCount}</span>`;
    }
    // data-d: the distance from the week on screen — a narrow bar (1440) drops
    // W−3 and W+3 (‹ › still step), so the actions never cover the tabs.
    h += `<button type="button" class="wi4-tab${w === wk ? ' on' : ''}" data-d="${w - wk}" onclick="${go(w)}" title="${_esc(I.weekRange(w) || '')}">W${w}${w === cur ? ' <span class="wi4-t-blue" aria-label="τρέχουσα">•</span>' : ''}${badge}</button>`;
  }
  h += `<button type="button" class="wi4-tab" onclick="${go(wk + 1)}" title="Επόμενη εβδομάδα" aria-label="Επόμενη εβδομάδα">›</button>`;
  // «Σήμερα» is not on the Figma tabs; kept because it is today's button.
  if (wk !== cur) h += `<button type="button" class="wi4-tab wi4-t-blue" onclick="${go(cur)}">Σήμερα</button>`;
  return h;
}
function _viewMenuHTML() {
  const D = _D(), fs = D.filterStatus || '';
  const fl = _ls('tms_wk3_fl') !== '0', fr = _ls('tms_wk3_fr') !== '0';
  let h = '<button type="button" role="menuitem" onclick="WI_INTERNAL.printWeek()">Εκτύπωση εβδομάδας</button>' +
    '<button type="button" role="menuitem" onclick="WI_INTERNAL.exportCSV()">CSV</button>' +
    '<button type="button" role="menuitem" onclick="WI_INTERNAL.renderWeeklyIntl()">Ανανέωση</button>' +
    '<button type="button" role="menuitem" onclick="WI_INTERNAL.fullscreen()" title="Μόνο ο πίνακας · Esc για έξοδο">Πλήρης οθόνη</button>' +
    '<div class="wi4-qp-h">Κατάσταση</div>';
  STATUS_OPTS.forEach(([v, t]) => { h += `<button type="button" role="menuitemradio" aria-checked="${fs === v}" onclick="WIV2._status('${v}')">${fs === v ? '✓ ' : ''}${t}</button>`; });
  h += '<div class="wi4-qp-h">Εθνικές στήλες</div>' +
    `<button type="button" role="menuitemcheckbox" aria-checked="${fl}" onclick="_wk3FeedTog('fl')">${fl ? '✓ ' : ''}ΠΡΟΣ ΒΕΡΟΙΑ</button>` +
    `<button type="button" role="menuitemcheckbox" aria-checked="${fr}" onclick="_wk3FeedTog('fr')">${fr ? '✓ ' : ''}ΑΠΟ ΒΕΡΟΙΑ</button>` +
    '<button type="button" role="menuitem" onclick="WIV2._switch(\'0\')">Παλιά προβολή</button>';
  // A Worker that ignores the conflict check is said, never assumed (§g.3).
  // A sentence, not a section header: never upper-cased (CSS caps would also
  // keep the Greek tonos in some browsers).
  // Unknown = closed (principle 5): before the first save nobody has
  // confirmed the check, so the menu never stays silent as if it had.
  const live = typeof window !== 'undefined' ? window.TMS_EXPECT_LIVE : undefined;
  if (live !== true) h += `<div class="wi4-view-note wi4-t-amb" role="note">${live === false ? 'ο έλεγχος «το άλλαξε άλλος» δεν είναι ενεργός ακόμη' : 'ο έλεγχος «το άλλαξε άλλος» δεν έχει επιβεβαιωθεί ακόμη'}</div>`;
  return h;
}
function _barHTML(m) {
  const I = W(), D = _D();
  // The SAME count as today's board (_wiPaint's preFields): the export rows
  // and the board's import rows of _wiPaintMetrics, each order once. A matched
  // import is its own import row — adding the export's importId as well
  // counted it twice, so the two boards disagreed (review 11/10).
  const met = m.metrics || {};
  const preN = [].concat(met.expRows || [], met.impRows || []).reduce((n, r) => n + (r.orderIds || [r.orderId]).filter((id) => _isPre(_f(id))).length, 0);
  const scan = (typeof OrdersCommon !== 'undefined' && OrdersCommon.scanButton) ? OrdersCommon.scanButton('WI_INTERNAL.scan()', 'Σάρωση', 'Νέα διεθνής παραγγελία από σάρωση εγγράφου — χωρίς έξοδο από το εβδομαδιαίο') : '';
  const neu = (typeof OrdersCommon !== 'undefined' && OrdersCommon.newOrderButton) ? OrdersCommon.newOrderButton('WI_INTERNAL.newOrder()', '+ Νέα παραγγελία', 'Νέα διεθνής παραγγελία — χωρίς έξοδο από το εβδομαδιαίο') : '';
  // Three tracks: title group · week tabs · actions. The tabs sit in their
  // own centre track, so a presence strip that appears or goes with a beat
  // can never move the main navigation under the cursor (review 11/10: the
  // tabs jumped ~105px when «Χρήστης Β · εδώ τώρα» arrived).
  // Left group order (sheet 16 A): title · range · presence · sync token. The
  // range gives way first, then names; the state words and the sync token
  // never (CSS priorities, review 11/10).
  const range = _range(D.week);
  return '<div class="wi4-bar">' +
    `<div class="wi4-bar-l"><span class="wi4-title">Εβδομαδιαίο Διεθνών</span><span class="wi4-range" title="${_esc(range)}">${_esc(range)}</span>` +
    _presHTML() + _updHTML() + '</div>' +
    `<nav class="wi4-tabs" id="wi4-tabs" aria-label="Εβδομάδες">${_tabsHTML(m)}</nav>` +
    '<div class="wi4-bar-r"><div class="wk-more"><button type="button" class="wi4-btn wk-more-t" onclick="wkMoreToggle(event)" aria-haspopup="true" aria-expanded="false">Προβολή ▾</button>' +
    `<div class="wk-more-m" role="menu" id="wi4-view" hidden>${_viewMenuHTML()}</div></div>` +
    `<button type="button" class="wi4-btn" onclick="WI_INTERNAL.preorder()" title="Φορτίο που ανακοινώθηκε — λεπτομέρειες αργότερα">Pre-order${preN ? ` <span class="wi4-cnt">${preN}</span>` : ''}</button>` +
    scan + neu + '</div></div>';
}
function _qwrapHTML(m) {
  const q = m.queue, n = q.length;
  const red = q.filter((x) => x.level === 'red').length, amb = n - red;
  const unk = q.some((x) => x.code === 'SOURCE_UNKNOWN' || x.code === 'NAT_UNKNOWN');
  // A source still in flight is not «nothing»: the number is a lower bound
  // («≥») and an empty list says it is still loading (§d.2a).
  const atLeast = unk || m.loading ? '≥' : '';
  let h = `<div class="wi4-q-hd">ΕΠΟΜΕΝΑ · ${atLeast}${n}<span class="wi4-q-n">${_esc(_plural(red, 'urgent'))} · ${amb} προσοχή${m.loading ? ' · φορτώνει…' : ''}</span></div>`;
  if (!n) h += `<div class="wi4-qcard" style="cursor:default"><span class="wi4-l2">${m.loading ? 'Φορτώνει — η λίστα δεν είναι πλήρης ακόμη' : 'Τίποτα επείγον αυτή την εβδομάδα'}</span></div>`;
  q.slice(0, 3).forEach((it, i) => {
    const btn = _actLabel(it);
    // One line (sheet 15): «Alpha Dairy → Beta…  10π · φόρτωση ήταν χθες
    // [Ανάθεση]» — the NAME gives way, the reason stays whole, and «χωρίς
    // φορτηγό» is left to the red chip and the button (subCard).
    const sub = [it.pal != null ? it.pal + 'π' : '', it.subCard || it.sub || ''].filter(Boolean).join(' · ');
    const full = [it.pal != null ? it.pal + 'π' : '', it.sub || ''].filter(Boolean).join(' · ');
    // The chip follows the rows' ONE rule (_chipCls): blue today, grey ahead,
    // red only for a day that passed without a truck.
    const cls = it.date ? _chipCls({ day: it.date, noTruck: it.code === 'NO_TRUCK' }, m.today || _today()) : '';
    h += `<div class="wi4-qcard ${it.level === 'red' ? 'wi4-r-red' : 'wi4-r-amb'}" role="button" tabindex="0" onclick="WIV2._qGo(${i})" onkeydown="if(event.key==='Enter'){event.preventDefault();WIV2._qGo(${i})}">` +
      (it.date ? `<span class="wi4-dc ${cls}" style="cursor:inherit">${_esc(_dayLabel(it.date))}</span>` : '') +
      `<div class="wi4-qcard-t">${_ell('wi4-l1', it.text || it.code)}${sub ? `<span class="wi4-l2" title="${_esc(full + (it.tip ? ' — ' + it.tip : ''))}">${_esc(sub)}</span>` : ''}</div>` +
      (btn ? `<button type="button" class="wi4-btn sm" onclick="event.stopPropagation();WIV2._qAct(${i})">${_esc(btn)}</button>` : '') + '</div>';
  });
  // A link, not a fourth button (sheet 15: blue text «Όλα 17 ▾»).
  if (n > 3) h += `<button type="button" class="wi4-link wi4-q-all" onclick="event.stopPropagation();WI4Actions.queuePanel()" aria-haspopup="dialog">Όλα ${atLeast}${n} ▾</button>`;
  return h;
}
function _qbandHTML(m) {
  return '<div class="wi4-q" role="region" aria-label="Επόμενες ενέργειες">' +
    `<label class="wi4-search">${_ico('search', 14)}<input id="wi4-search" type="text" autocomplete="off" placeholder="Αναζήτηση" value="${_esc(_qRaw)}" oninput="WIV2.search(this.value)" onkeydown="WIV2._searchKey(event)" aria-label="Αναζήτηση πελάτη, τόπου, πινακίδας, οδηγού, ΑΝΑΦ."><span class="wi4-search-n" id="wi4-search-n"></span><span class="wi4-key">/</span></label>` +
    `<div id="wi4-qwrap" style="display:contents">${_qwrapHTML(m)}</div></div>`;
}
function _shelfWrapHTML() {
  const I = W(), st = _D().data.stock;
  if (!st || !I.shelfHas(st)) return '';
  // «18/24π» like every other pallet figure on this board (rules: «παλέτες
  // πάντα 33π»); today's board keeps its «p» (the option is v4's).
  return `<div class="wi4-shelf"><div id="wi-shelf" class="wi-shelf" role="region" aria-label="Απόθεμα σε αποθήκες">${I.shelfInner(st, SHELF_OPT)}</div></div>`;
}
function _colsHTML(m) {
  const lg = L();
  // The rows the board numbers (_compute expDrawn/impDrawn), not the shared
  // metric that counts a split parent AND its legs.
  const met = { expN: m.expDrawn != null ? m.expDrawn : (m.metrics || {}).expN, impN: m.impDrawn != null ? m.impDrawn : (m.metrics || {}).impN };
  // The toggles stay in the header when their column is collapsed (as a
  // chevron, the label kept for screen readers): the way back is where the
  // column was, never only inside «Προβολή ▾» (rules: «ανοιγοκλείνουν με κλικ
  // στην κεφαλίδα»).
  const tog = (side, text, title) => `<span class="wi4-ftog" role="button" tabindex="0" aria-label="${_esc(title)}" onclick="_wk3FeedTog('${side}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_wk3FeedTog('${side}')}" title="${_esc(title)}"><span class="wi4-ftog-t">${text}</span></span>`;
  return '<div class="wi4-cols" role="row">' +
    '<div class="wi4-c-idx"></div>' +
    `<div class="wi4-c-fl">${tog('fl', '◂ ΠΡΟΣ ΒΕΡΟΙΑ', 'Εθνικό σκέλος προς Βέροια — κλικ: άνοιγμα/κλείσιμο στήλης ΠΡΟΣ ΒΕΡΟΙΑ')}</div>` +
    `<div class="wi4-c-exp"><div class="wi4-leg"><span class="wi4-l-span" style="display:flex;justify-content:space-between"><span>ΕΞΑΓΩΓΗ <span class="wi4-n">· ${_esc(lg.plural(met.expN || 0, 'load'))} · ανά ημέρα εκφόρτωσης</span></span><span>ΠΑΛ.</span></span></div></div>` +
    '<div class="wi4-c-asg">ΑΝΑΘΕΣΗ · ΕΝΤΟΛΗ</div>' +
    `<div class="wi4-c-imp"><div class="wi4-leg"><span class="wi4-l-span" style="display:flex;justify-content:space-between"><span>ΕΙΣΑΓΩΓΗ <span class="wi4-n">· ${_esc(lg.plural(met.impN || 0, 'load'))}</span></span><span>ΠΑΛ.</span></span></div></div>` +
    // Aligned by CSS (.wi4-cols .wi4-c-fr: left, on its tiles' edge, Figma
    // 1097:2445), never inline: an inline text-align beat the collapsed rule.
    `<div class="wi4-c-fr">${tog('fr', 'ΑΠΟ ΒΕΡΟΙΑ ▸', 'Εθνική διανομή από Βέροια — κλικ: άνοιγμα/κλείσιμο στήλης ΑΠΟ ΒΕΡΟΙΑ')}</div></div>`;
}
function _relayBannerHTML() {
  const D = _D();
  if (!(D.relay && _relayState() === 'err')) return '';
  // Same words as _wiPaint's banner (contract #6/#7, DESIGN.md Α7).
  return `<div class="wi4-banner" role="alert"><span>Οι τοπικές παραδόσεις/φορτώσεις δεν φορτώθηκαν — δεν σημαίνει ότι δεν υπάρχουν (${_esc(D.relay.err || 'σφάλμα ανάγνωσης')}). Οι παραγγελίες δεν επηρεάζονται· το «…με τοπικό οδηγό» μένει κλειστό ώσπου να φορτωθούν.</span><button type="button" class="wi4-link" onclick="WI_INTERNAL.relayReload()">↻ Ξαναδοκίμασε</button></div>`;
}
// Save failure line (§e.14). The old text after the client/route prefix is
// kept verbatim (its «#N» wording is Φ9 debt, §j.8).
// ONE short line (sheet 14 #5): «Δεν αποθηκεύτηκε — <τι> έμεινε όπως ήταν ·
// Ξαναδοκίμασε · κλείσιμο ×», red text on white, no band. What stayed as it
// was is named from the TABLE: a failed match says which import is still
// free (and without a truck, when it is). The old message and the re-read
// note go to the title. «δεν ξέρουμε τι γράφτηκε» stays visible: it is the
// truth the user must act on. A line closed with × while the re-read is
// pending or failed is only HIDDEN (s.hidden): the ⚠, the counter and the
// queue item stay (review 11/10).
// «έμεινε όπως ήταν» is said ONLY when the TABLE shows nothing was written
// (review 11/10, P2): a group save can land on 1 of 3 orders, and a timed-out
// PATCH may have reached the server. Before the re-read: «δεν ξέρουμε ακόμη
// τι γράφτηκε»; after it, an assignment compares each order the save tried
// (s.attempt, from the old function through _noteAttempt) with WINTL.data.
const _lnk = (v) => (Array.isArray(v) ? v[0] : v) || '';
function _msgText(oid) {
  const D = _D(), row = (D.rows || []).find((x) => ((x.orderIds || [])[0] || x.orderId) === oid);
  const s = (D._syncLog || {})[oid] || {};
  if (row && _unconfirmed(row) && row.importId) {
    const f = _f(row.importId), ir = (D.rows || []).find((x) => x.type === 'import' && (x.orderIds || [x.orderId]).includes(row.importId));
    const who = f['Reference'] ? 'η εισαγωγή ' + f['Reference'] : 'η εισαγωγή ' + (W().clientName(f) || '');
    return 'Δεν αποθηκεύτηκε — ' + who + (ir && !ir.saved ? ' μένει χωρίς φορτηγό' : ' έμεινε χωρίς ταίριασμα');
  }
  const msg = String(s.msg || '');
  // Has the table been read since this failure? (s.seq: the loads that had
  // landed when it failed, stamped by onSync.)
  const reread = s.seq != null && _loadSeq > s.seq;
  const a = s.attempt;
  if (a && a.ids && a.ids.length) {
    const Y = a.ids.length;
    if (!reread) return (a.offline ? 'Χωρίς σύνδεση — η ανάθεση μπήκε σε αναμονή, δεν είναι ακόμη στη βάση'
      : `Δεν αποθηκεύτηκε — η ανάθεση απέτυχε σε ${a.failed} από ${Y}`) + ' · δεν ξέρουμε ακόμη τι γράφτηκε';
    let X = 0, unread = 0;
    a.ids.forEach((id) => {
      const r = _rec(id);
      if (!r || !r.fields) { unread++; return; }
      if (a.partner ? _lnk(r.fields['Partner']) === a.partner : (!!a.truck && _lnk(r.fields['Truck']) === a.truck)) X++;
    });
    const un = unread ? ` · ${unread} δεν διαβάστηκαν` : '';
    if (!X && !unread) return 'Δεν αποθηκεύτηκε — η ανάθεση έμεινε όπως ήταν';
    if (X === Y) return 'Η ανάθεση γράφτηκε, αλλά η απάντηση χάθηκε — έλεγξε';
    return `Δεν αποθηκεύτηκε πλήρως — η ανάθεση γράφτηκε σε ${X} από ${Y}${un} · έλεγξε`;
  }
  if (/^Χωρίς σύνδεση/.test(msg)) return msg + (reread ? ' · η σειρά δείχνει ό,τι είναι τώρα γραμμένο' : '');
  const what = /ανάθεση/i.test(msg) ? 'η ανάθεση' : /ταίριασμα/i.test(msg) ? 'το ταίριασμα' : _loadLabel(oid);
  return 'Δεν αποθηκεύτηκε — ' + what + (reread ? ' · η σειρά δείχνει ό,τι είναι γραμμένο' : ' · δεν ξέρουμε ακόμη τι γράφτηκε');
}
function _msgHTML(oid) {
  const s = (_D()._syncLog || {})[oid];
  if (!s || s.state !== 'err' || !_q(oid) || s.hidden) return '';
  const tail = _rereadT ? 'η σειρά θα ξαναδιαβαστεί μόλις κλείσει ό,τι είναι ανοιχτό'
    : _rereadFailed ? 'δεν ξέρουμε τι γράφτηκε' : '';
  const base = _msgText(oid);
  const text = base + (_rereadFailed && !/δεν ξέρουμε/.test(base) ? ' · ' + tail : '');
  const tip = [_loadLabel(oid), s.msg || '', tail].filter(Boolean).join(' · ');
  return `<div class="wi4-msg" role="alert" data-msg="${_q(oid)}">${_ico('alert_circle', 12)}<span class="wi4-ell" title="${_esc(text + ' — ' + tip)}">${_esc(text)}</span>` +
    `<button type="button" class="wi4-link" onclick="WIV2._retry('${_q(oid)}')">Ξαναδοκίμασε</button>` +
    (_rereadFailed ? '<button type="button" class="wi4-link" onclick="WI_INTERNAL.renderWeeklyIntl()">Ανανέωση</button>' : '') +
    `<button type="button" class="wi4-link wi4-msg-x" aria-label="Κλείσιμο" onclick="WIV2._msgClose('${_q(oid)}')">· κλείσιμο ×</button></div>`;
}

// ═══ Presence (§e #18) — an indication, never a lock, never «κανείς» ═══════
function _presEnabled() {
  return typeof FEATURES !== 'undefined' && FEATURES && FEATURES.WI_PRESENCE === true && typeof WI4Presence !== 'undefined';
}
// Status, list and texts come from WI4Presence alone (state(), stripText(),
// tipText()): the board keeps no second copy of the rules or the words, so
// the strip says what the unit-tested client says — 'pending' (no answer
// yet) and 'off' draw nothing, never «↻ ζωντανά» before a successful beat.
function _presState() {
  if (!_presEnabled()) return { status: 'off', others: [], changes: null };
  try {
    const s = typeof WI4Presence.state === 'function' ? (WI4Presence.state() || {}) : {};
    return { status: s.status || 'off', others: Array.isArray(s.others) ? s.others : [], changes: s.changes || null };
  } catch (e) { _logErr(e, 'wi4: presence state'); return { status: 'off', others: [], changes: null }; }
}
const _pName = (p) => String((p && (p.name || p.user_name || p.user)) || 'άλλος χρήστης');
// The strip (§e #18) from WI4Presence.parts(): the client's own words and
// rules, so 'pending'/'off' draw nothing and «κανείς» is never said. Review
// 11/10: with ONE colleague the strip was cut to «Χρήστης Β · εδώ τώρα · ↻ ζ…»
// at 1920, and the paused/forbidden sentences — the «unknown ≠ empty»
// warnings — would shrink to a few letters. Now the STATE WORD is a fixed
// token that always shows («εδώ τώρα», «σε παύση», «μη διαθέσιμη»), names and
// the rest of a sentence give way first, and the whole sentence is the
// title. The live «↻ ζωντανά» is the sync token beside it (_updHTML).
function _presHTML() {
  let p = null;
  try { if (_presEnabled() && typeof WI4Presence.parts === 'function') p = WI4Presence.parts(PRES_MAX) || null; }
  catch (e) { _logErr(e, 'wi4: presence parts'); }
  if (!p || (p.status !== 'live' && p.status !== 'paused' && p.status !== 'forbidden')) return '<div class="wi4-pres" id="wi4-pres"></div>';
  if (p.status !== 'live') {
    // «σε παύση — <the rest of the client's sentence>»: the word stays, the
    // rest is cut first. Unknown ≠ empty: the sentence says WHY.
    const head = p.status === 'paused' ? 'Ζωντανή εικόνα σε παύση' : 'Η ζωντανή εικόνα δεν είναι διαθέσιμη';
    const rest = String(p.full || '').replace(head, '').replace(/^\s*—\s*/, '').trim();
    const t = ` title="${_esc(p.full)}"`;   // on each piece: the strip itself is display:contents
    return `<div class="wi4-pres ${p.status}" id="wi4-pres">` +
      `<span class="wi4-pres-ic" aria-hidden="true"${t}>${_ico(p.status === 'paused' ? 'pause_circle' : 'alert_circle', 12)}</span>` +
      // «ζωντανή εικόνα» gives way on a narrow bar (1440), the word never.
      `<span class="wi4-pres-w" role="status"${t}><span class="wi4-pres-wl">ζωντανή εικόνα </span><b>${_esc(p.word)}</b></span>` +
      (rest ? `<span class="wi4-pres-r"${t}>— ${_esc(rest)}</span>` : '') + '</div>';
  }
  const ps = _presState();
  const shown = ps.others.slice(0, PRES_MAX), more = ps.others.slice(PRES_MAX);
  const av = shown.map((o) => `<span class="wi4-av" title="${_esc(_pName(o))}">${_esc(_pName(o).trim().charAt(0).toUpperCase())}</span>`).join('') +
    (more.length ? `<span class="wi4-av more" title="${_esc(more.map(_pName).join(', '))}">+${more.length}</span>` : '');
  // One colleague: «Χρήστης Β · εδώ τώρα», the NAME gives way first. Two or
  // more: the avatars carry the initials and every name is in the title
  // («Π Ε · εδώ τώρα»), never a list cut mid-name.
  const names = (p.names || []).join(', ') + (p.more ? ' +' + p.more : '');
  const t = ` title="${_esc(p.full)}"`;
  const who = ps.others.length === 1
    ? `<span class="wi4-pres-n"${t}>${_esc(names)}</span><span class="wi4-pres-w"${t}>· ${_esc(p.here)}</span>`
    : `<span class="wi4-pres-w"${t}>${_esc(p.here)}</span>`;
  return `<div class="wi4-pres" id="wi4-pres">${av}${who}</div>`;
}
// Called by every paint: start() is idempotent — it takes the CURRENT week
// and re-observes the new #wi-popover (every full paint re-creates it). No
// «already started» flag here: one went stale when presence stopped itself
// (a tab left the page) and silenced it for the session, and it kept the
// first week for every later beat (11/10).
function _presStart() {
  if (!_presEnabled()) return;
  try { if (typeof WI4Presence.start === 'function') WI4Presence.start({ week: _D().week, onPatch: () => WIV2.presencePatch() }); }
  catch (e) { _logErr(e, 'wi4: presence start'); }
}
function _presStop() {
  try { if (typeof WI4Presence !== 'undefined' && typeof WI4Presence.stop === 'function') WI4Presence.stop('page'); } catch (e) { _logErr(e, 'wi4: presence stop'); }
}

// ═══ paint() (§a.4, §e) ═════════════════════════════════════════════════
function paint() {
  try {
    _paint();
    return true;
  } catch (e) {
    _fail(e);
    return false;
  }
}
function _fail(e) {
  WIV2._broken = true;   // sticky for the session (§a.4)
  try { _cleanup(); } catch (_) {}
  _logErr(e, 'weekly intl v4: paint failed — old board until reload');
  try { console.error('[weekly intl v4] paint failed:', e); } catch (_) {}
  if (_bannerShown) return;
  _bannerShown = true;
  // The old board repaints #content several times after a load (national
  // carriers, relays, stock), so the banner sits just ABOVE #content, once,
  // and leaves with the page (the router has no leave hook: a slow poll that
  // ends with the banner).
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
      if (typeof currentPage !== 'undefined' && currentPage !== 'weekly_intl') { b.remove(); return; }
      setTimeout(gone, 3000);
    };
    setTimeout(gone, 3000);
  } catch (_) { /* the old board is on screen either way */ }
}
function _paint() {
  const I = W(), D = _D(), lg = L();
  if (!I || !lg) throw new Error('WI_INTERNAL / WI4 missing');
  const content = document.getElementById('content');
  if (!content) throw new Error('#content missing');
  // The same metrics and busy map as the old board (one computation, §a.5).
  const met = I.paintMetrics();
  D.ui = D.ui || {};
  D.ui.v4Days = D.ui.v4Days || {};
  // The late-source states this paint draws (_vw): from here to the next
  // paint, counts, queue and rails read these — never a source no row shows.
  _vw = { nat: _natLive(), relay: _relayLive() };
  if (D._loadedAt !== _loadedSeen) { _loadedSeen = D._loadedAt; _loadSeq++; }
  if (_lateT) { clearTimeout(_lateT); _lateT = null; }   // this paint is the deferred one
  _xwPrime();
  _pts.clear();
  const m = _compute();
  m.metrics = met;
  _m = m; _queue = m.queue;
  _autoSettle(m.days);
  const today = m.today;
  _qi = [];
  m.entries.forEach((e) => { e.qi = _qi.length; _qi.push({ row: e.row || (e.parent || null), blob: _blobOf(e) }); });
  const fl = _ls('tms_wk3_fl') === '0' ? ' wi4-fl-off' : '';
  const fr = _ls('tms_wk3_fr') === '0' ? ' wi4-fr-off' : '';
  const rowsHTML = (D.rows || []).length
    ? m.days.map((d) => _dayHTML(d, today)).join('')
    : `<div class="wi4-dayempty">Άδειο φύλλο — W${D.week} · Καμία διεθνής παραγγελία ακόμη. Οι νέες εμφανίζονται εδώ μόλις καταχωρηθούν.</div>`;
  // _WI2_CSS once, like _wiPaint: its global part styles the reused popover
  // and panels; its .wk3.wi2-scoped part does not reach v4 (§c.3).
  // The reused menu, popover and panel sit OUTSIDE the v4 root (still in
  // #content, the §a.7 contract): inside it they inherited v4's 12px type and
  // ink, and the old popover/panels changed size with no design (11/10).
  content.innerHTML = `<div class="wi4${fl}${fr}" data-week="${D.week}"><style>${I.css}</style>` +
    _barHTML(m) + _relayBannerHTML() + _qbandHTML(m) + _shelfWrapHTML() + _colsHTML(m) +
    `<div id="wi-rows">${rowsHTML}</div></div>` +
    '<div id="wi-ctx"></div><div id="wi-popover"></div><div id="wi-panel" class="wi-panel"></div>';
  window._wiDragging = null;   // as _wiPaint: a repaint ends any drag
  document.body.classList.add('wi4-on');
  _topMount();
  _install();
  _tick();
  _layout(false);
  _afterRows();
  try { I.shelfFit(); } catch (_) {}
  _retryToasts();
  _presStart();
  const a = A(); if (a && typeof a.attach === 'function') a.attach();
  // Measured again once the browser has laid the board out (the column can
  // still be settling — the sidebar collapsing after the first paint drew a
  // 3-member groupage as 2 + «+1», 11/10); a width that did not change costs
  // nothing (_layout compares).
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { if (_live()) _layout(false); });
  // First paint of a week: open where the work is (the first day with a red
  // reason, else today) — once, so a repaint never moves the user.
  if (_scrolledWeek !== D.week) {
    _scrolledWeek = D.week;
    _openWhereWork(m, today);
  }
}
// A late source that failed and was then read again («↻ Ξαναδοκίμασε»): the
// generic retry toasts of the failed read («Σφάλμα server/σύνδεσης —
// δοκιμάστε ξανά») would still sit beside a board that now HAS the data —
// the screen contradicting itself (review 11/10). Only those go.
function _retryToasts() {
  const D = _D(), st = D.data.stock;
  const errNow = (D.relay && D.relay.state === 'err') || D.data.nlState === 'err' || (st && st.status === 'failed');
  if (errNow) { _srcErrSeen = true; return; }
  if (!_srcErrSeen) return;
  _srcErrSeen = false;
  try {
    const box = document.getElementById('tms-toast-container');
    // «Τα δεδομένα δεν φορτώθηκαν» too: _atFetch's toast of the same failed
    // read stayed beside the board after «↻ Ξαναδοκίμασε» (review 11/10).
    if (box) [...box.children].forEach((t) => { if (/^(Σφάλμα (server|σύνδεσης) — δοκιμάστε ξανά|Τα δεδομένα δεν φορτώθηκαν)$/.test(String(t.textContent || '').trim())) t.remove(); });
  } catch (_) { /* a toast left behind is cosmetic */ }
}
// Rules «Άνοιγμα» (958:747): the first day with red at the top of the BOARD,
// and the today–tomorrow loads of other weeks «ζουν στη ζώνη πάνω από τον
// πίνακα» — so the title bar and the ΕΠΟΜΕΝΑ band must be in view. The first
// day card already IS the top of the board, and a day already on the first
// screen needs no scroll: both open at the top. Only a day below the fold is
// scrolled to, landing under the sticky column header (scroll-margin-top).
// Before (review 11/10) a red Saturday — the first card — scrolled 166px and
// hid the bar, the week tabs and the 7-item queue made for the dispatcher.
function _openWhereWork(m, today) {
  const root = _root(); if (!root) return;
  const target = L().openDay(m.days.map((d) => ({ date: d.date, facts: d.facts || [] })), today);
  const sec = target && root.querySelector('#wi-rows .wi4-day[data-day="' + target + '"]');
  const first = root.querySelector('#wi-rows .wi4-day');
  const sc = _scroller();
  const doc = sc === document.scrollingElement || sc === document.documentElement;
  try { sc.scrollTop = 0; } catch (_) {}
  if (!sec || sec === first || !sec.scrollIntoView) return;
  const y = sec.getBoundingClientRect().top - (doc ? 0 : sc.getBoundingClientRect().top);
  const viewH = doc ? window.innerHeight : sc.clientHeight;
  if (y > viewH - 200) { try { sec.scrollIntoView({ block: 'start' }); } catch (_) {} }
}
// After any rows markup lands: ⚠ slots from the session log, search dim,
// keyboard focus, moved-row traces, presence.
function _afterRows() {
  const D = _D(), root = _root();
  if (!root) return;
  Object.entries(D._syncLog || {}).forEach(([oid, s]) => {
    if (!s || s.state !== 'err') return;
    const r = (D.rows || []).find((x) => ((x.orderIds || [])[0] || x.orderId) === oid);
    const el = r && document.getElementById('wi-sync-' + r.id);
    if (el) { el.className = 'wi-sync wi-sync--err'; el.textContent = '⚠'; el.title = s.msg || ''; }
  });
  _applyDim();
  const f = D.ui && D.ui.v4Focus;
  if (f) { const el = _rowEl(f); if (el) el.classList.add('wi4-focus'); }
  _traces();
  WIV2.presencePatch();
}
function _blobOf(e) {
  const I = W();
  const r = e.row || e.parent;
  if (!r) return '';
  const ids = [].concat(r.orderIds || [r.orderId]);
  if (r.importId) I.impIdsOf(r.importId).forEach((id) => ids.push(id));
  if (e.x) ids.push(e.x.oid);
  const parts = [r.truckLabel, r.trailerLabel, r.driverLabel, r.partnerLabel, r.partnerPlates];
  ids.forEach((id) => {
    const f = _f(id);
    parts.push(I.clientName(f), f['Loading Summary'], f['Delivery Summary'], f['Reference'], I.placeStr(f, 'load'), I.placeStr(f, 'del'));
  });
  if (e.x && e.x.s) parts.push(e.x.s.driverName, e.x.s.tractor);
  return parts.filter(Boolean).join(' ').toLowerCase();
}

// Points layout pass (§e): measured ONCE per paint from a points column;
// only the points nodes are re-rendered when the width changed.
function _layout(force) {
  const root = _root(); if (!root) return;
  const probe = root.querySelector('#wi-rows .wi4-day:not(.closed) .wi4-row .wi4-l-from');
  const w = probe ? probe.clientWidth : 0;
  if (!w) return;
  if (!force && w === _ptsW) return;
  _ptsW = w;
  root.querySelectorAll('.wi4-pts[data-pk]').forEach(_fillPts);
}
function _fillPts(el) {
  const d = _pts.get(el.dataset.pk);
  if (!d) return;
  const r = L().points(d.stops, _ptsW || 0, { dateTick: d.dateTick });
  el.innerHTML = _ptsInner(r, d);
  el.classList.toggle('wi4-noplace', !!r.hidePlace);
}

// ═══ Session listeners: installed once by the first paint (§a.4, §f) ═══════
function _install() {
  if (_installed) return;
  _installed = true;
  // Hover classes the old drag handlers never clear on v4 markup (they clear
  // only .wk3-* classes): capture phase, because the drop/dragend handlers
  // of tiles and cells stop propagation.
  const clear = () => {
    if (!_live()) return;
    document.querySelectorAll('#content .wi4 .wi4-dh, #content .wi4 .dragover, #content .wi4 .dragging').forEach((el) => el.classList.remove('wi4-dh', 'dragover', 'dragging'));
  };
  document.addEventListener('dragend', clear, true);
  document.addEventListener('drop', clear, true);
  // Edge auto-scroll while an import or a tile is dragged.
  document.addEventListener('dragover', (ev) => {
    if (!_live() || !(window._wiDragging || window._wiSegDrag)) return;
    const sc = _scroller();
    if (!sc) return;
    const top = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
    const bot = sc === document.scrollingElement ? window.innerHeight : sc.getBoundingClientRect().bottom;
    if (ev.clientY < top + 60) sc.scrollTop -= 14;
    else if (ev.clientY > bot - 60) sc.scrollTop += 14;
  }, true);
  const relayout = () => {
    if (!_live()) return;
    clearTimeout(_resizeT);
    _resizeT = setTimeout(() => { if (!_live()) return; _layout(false); try { W().shelfFit(); } catch (_) {} }, 120);
  };
  window.addEventListener('resize', relayout);
  const host = document.getElementById('content');
  // The board's width changes without a window resize too (the sidebar
  // collapsing or expanding, a scrollbar appearing): #content is watched,
  // so the points always follow the column they are drawn in.
  if (host && typeof ResizeObserver === 'function') new ResizeObserver(relayout).observe(host);
  // Leaving the page (the router has no leave hook): every page renders into
  // #content, so its first change while v4 is no longer active ends v4's
  // session state — the body class, the presence beats, the v4 overlays —
  // at once, not at the next 30-second tick. A re-read of this board (a
  // spinner in #content) keeps v4 active and changes nothing.
  if (host && typeof MutationObserver === 'function') new MutationObserver(() => { if (!WIV2.active()) _cleanup(); else if (!_root()) _topUnmount(); }).observe(host, { childList: true });
}
// «Ενημερώθηκε πριν N΄» stays true; the tick is also the backstop of the
// page-leave rule above. It tests WIV2.active(), as the observer does — not
// _live(): during a re-read #content holds the old module's spinner (no .wi4)
// while v4 is still active, and a tick landing there ended presence, closed
// the v4 overlays and forgot the user's open/closed days (review 11/10).
// Started by every paint, stopped by _cleanup: no timer runs on other pages.
function _tick() {
  if (_tickT) return;
  _tickT = setInterval(() => {
    if (!WIV2.active()) { _cleanup(); return; }
    if (!_root()) { _topUnmount(); return; }
    const u = document.getElementById('wi4-upd');
    if (u && !u.classList.contains('err') && !u.classList.contains('chg')) u.outerHTML = _updHTML();
  }, 30000);
}
function _scroller() {
  let el = _root();
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}
// ONE top bar (Figma 1097:2283; owner 11/10, live parity). The bar is painted
// with the board — one render, its ids unique — and then moved into the app's
// top bar, inside its own `.wi4` wrapper so every `.wi4 …` rule still reaches
// it. The bar is looked up by id and the board by `#content .wi4`, so neither
// notices the move; _cleanup (page left, «Παλιά προβολή», a failed paint)
// takes it out and the app's own title comes back.
function _topMount() {
  const tb = document.querySelector('.main > .topbar');
  const bar = document.querySelector('#content .wi4 > .wi4-bar');
  if (!tb || !bar) return;
  let slot = document.getElementById('wi4-top');
  if (!slot) {
    slot = document.createElement('div');
    slot.id = 'wi4-top';
    slot.className = 'wi4 wi4-top';
    tb.insertBefore(slot, tb.querySelector('.topbar-right'));
  }
  slot.replaceChildren(bar);
  document.body.classList.add('wi4-top-on');
  _umenuMount();
}
// Also while v4 stays active but #content holds no board — a re-read's
// spinner, the load-error card: a bar still saying «Ενημερώθηκε μόλις τώρα»
// over a week that did not load would be a lie (principle 1, review 11/10).
// The app's own title and Sign out show until the next paint mounts it again.
function _topUnmount() {
  const slot = document.getElementById('wi4-top');
  if (slot) slot.remove();
  try { document.body.classList.remove('wi4-top-on'); } catch (_) {}
  _umenuUnmount();
}
// Name, role and Sign out behind the avatar (Figma ends the bar with the
// avatar alone). Built from what the app wrote in the chip, so it never
// disagrees with it.
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
// Esc, Enter and Space stop here (on the board Esc clears the search, Enter
// opens a row); every other key goes on, so «/», the arrows and ⌘K still work
// with the chip focused. Inside the menu the button keeps its own Enter/Space —
// handled on the chip they cancelled «Αποσύνδεση» from the keyboard (review 11/10).
function _umenuKey(ev) {
  if (!_umenu || (ev.key !== 'Escape' && ev.key !== 'Enter' && ev.key !== ' ')) return;
  ev.stopPropagation();
  const chip = _umenu.parentElement;
  if (ev.key === 'Escape') { ev.preventDefault(); _umenuClose(); if (chip) chip.focus(); return; }
  if (_umenu.contains(ev.target)) return;
  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); _umenuTog(ev); }
}
function _umenuMount() {
  const chip = document.querySelector('.topbar .user-chip');
  if (!chip || _umenu) return;
  const name = (document.getElementById('userName') || {}).textContent || '';
  const role = (document.getElementById('roleBadge') || {}).textContent || '';
  const m = document.createElement('div');
  m.className = 'wi4-umenu';
  m.hidden = true;
  m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="wi4-umenu-h">${_esc(name)}${role ? ` <span>· ${_esc(role)}</span>` : ''}</div>` +
    '<button type="button" role="menuitem" onclick="logout()">Αποσύνδεση</button>';
  chip.appendChild(m);
  chip.setAttribute('role', 'button');
  chip.setAttribute('tabindex', '0');
  chip.setAttribute('aria-haspopup', 'true');
  chip.setAttribute('aria-expanded', 'false');
  chip.title = name ? name + ' — Αποσύνδεση' : 'Αποσύνδεση';
  chip.addEventListener('click', _umenuTog);
  chip.addEventListener('keydown', _umenuKey);
  _umenu = m;
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
  ['role', 'tabindex', 'aria-haspopup', 'aria-expanded', 'title'].forEach((a) => chip.removeAttribute(a));
}

function _cleanup() {
  try { document.body.classList.remove('wi4-on'); } catch (_) {}
  try { _topUnmount(); } catch (e) { _logErr(e, 'wi4: top bar unmount'); }
  if (_tickT) { clearInterval(_tickT); _tickT = null; }
  if (_lateT) { clearTimeout(_lateT); _lateT = null; }
  _presStop();
  // The date panel, «Όλα» panel, «?» sheet and conflict dialog live on <body>:
  // they must not stay on top of the next page.
  const a = A(); if (a && typeof a._closeAll === 'function') { try { a._closeAll(); } catch (e) { _logErr(e, 'wi4: close overlays'); } }
  _auto = null;   // coming back decides the week's collapse afresh
}

// ═══ W+1 read (§e #1/#2, §d.2a) ═════════════════════════════════════════
function _xwPrime() {
  const I = W(), D = _D();
  if (D.week !== I.currentWeek()) { _xw = null; return; }
  const key = D.week + '|' + (D._loadedAt instanceof Date ? D._loadedAt.getTime() : '');
  if (_xw && _xw.key === key) return;
  // The W+1 of a year's last week is W1 of the NEXT year, and a {Week Number}
  // filter carries no year: that read cannot be made, so it is «unknown»
  // (one queue item, «—» on the tab), never a confident zero.
  try {
    const ws = I.weekStart(D.week + 1);
    if (typeof TmsWeek !== 'undefined' && ws instanceof Date && !isNaN(ws) && TmsWeek.numOf(ws) !== D.week + 1) { _xw = { key, state: 'err', recs: [] }; return; }
  } catch (_) { /* the read below decides */ }
  const st = { key, state: 'loading', recs: [] };
  _xw = st;
  Promise.resolve(I.crossWeekIncoming(D.week)).then((res) => {
    if (_xw !== st) return;
    st.state = res && res.ok ? 'ok' : 'err';
    st.recs = (res && res.recs) || [];
    if (_live()) _refresh();
  }).catch((e) => { if (_xw !== st) return; st.state = 'err'; _logErr(e, 'wi4: cross-week'); if (_live()) _refresh(); });
}

// Recompute counts and queue without touching rows: title bar, tab badge,
// queue band and day-header words. A source landing never repaints the board.
function _refresh() {
  const root = _root(); if (!root) return;
  const m = _compute();
  m.metrics = _m ? _m.metrics : {};
  _m = Object.assign(_m || {}, { queue: m.queue, xwCount: m.xwCount, loading: m.loading, days: m.days });
  _queue = m.queue;
  const u = document.getElementById('wi4-upd'); if (u) u.outerHTML = _updHTML();
  const t = document.getElementById('wi4-tabs'); if (t) t.innerHTML = _tabsHTML(m);
  const q = document.getElementById('wi4-qwrap'); if (q) q.innerHTML = _qwrapHTML(m);
  m.days.forEach((d) => {
    if (!DAY_RE.test(d.date || '')) return;
    const el = root.querySelector('[data-dc="' + d.date + '"]');
    if (el) { el.innerHTML = _dayCountHTML(d); el.setAttribute('data-codes', d.codes || ''); }
  });
}

// ═══ Search 1/N (§e #16) and the status filter ═════════════════════════════
function _statusOk(row) {
  const fs = _D().filterStatus || '';
  if (!fs || !row) return true;
  if (fs === 'pending') return !row.saved;
  if (fs === 'assigned') return !!row.saved;
  if (fs === 'unmatched') return row.type === 'import' && !row.matchedTo && !W().stockSkip(row);
  return true;
}
function _applyDim() {
  const root = _root(); if (!root) return { count: 0, index: 0 };
  const q = _D().filter || '';
  const seen = new Set();
  _sMatches = [];
  root.querySelectorAll('#wi-rows [data-qi]').forEach((el) => {
    const x = _qi[+el.dataset.qi];
    const okQ = !q || (x && x.blob.includes(q));
    const ok = okQ && _statusOk(x && x.row);
    el.classList.toggle('wi4-dim', !ok);
    if (q && ok && el.classList.contains('wi4-row')) {
      const oid = el.dataset.oid;
      if (oid && !seen.has(oid)) { seen.add(oid); _sMatches.push(oid); }
    }
  });
  if (_sIdx >= _sMatches.length) _sIdx = 0;
  const n = document.getElementById('wi4-search-n');
  if (n) n.textContent = q ? (_sMatches.length ? `${_sIdx + 1}/${_sMatches.length}` : '0') : '';
  return { count: _sMatches.length, index: _sMatches.length ? _sIdx + 1 : 0 };
}
function search(q) {
  _qRaw = String(q == null ? '' : q);
  // WINTL.filter is the stored query of the old board too, so it survives
  // repaints; v4 dims rows instead of hiding them (_wiApplyFilter is never
  // called here).
  _D().filter = _qRaw.toLowerCase().trim();
  _sIdx = 0;
  const r = _applyDim();
  if (r.count) { const el = _rowEl(_sMatches[0]); if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest' }); } catch (_) {} } }
  return r;
}
function _searchKey(ev) {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    if (!_sMatches.length) return;
    _sIdx = (_sIdx + 1) % _sMatches.length;
    focusRow(_sMatches[_sIdx]);
    _applyDim();
  } else if (ev.key === 'Escape') {
    ev.preventDefault();
    ev.stopPropagation();
    const inp = ev.target;
    if (inp) inp.value = '';
    search('');
    if (inp && inp.blur) inp.blur();
  }
}
function searchFocus() {
  const inp = document.getElementById('wi4-search');
  if (inp) { inp.focus(); if (inp.select) inp.select(); }
}
function _status(v) {
  _D().filterStatus = STATUS_OPTS.some((o) => o[0] === v) ? v : '';
  _applyDim();
  const m = document.getElementById('wi4-view'); if (m) m.innerHTML = _viewMenuHTML();
}

// ═══ Rows by order id (§f) ═════════════════════════════════════════════════
/** The CURRENT row id of an order, at click time. A matched import resolves
 *  to the export row it is drawn in (its own import row is not on the board). */
function rowIdOf(orderId) {
  const rows = (_D() && _D().rows) || [];
  if (!orderId) return null;
  const has = (r) => r.orderId === orderId || (r.orderIds || []).includes(orderId);
  let r = rows.find((x) => has(x) && !(x.type === 'import' && x.matchedTo));
  if (r) return r.id;
  r = rows.find((x) => x.type === 'export' && x.importId && W().impIdsOf(x.importId).includes(orderId));
  if (r) return r.id;
  r = rows.find(has);
  return r ? r.id : null;
}
function _rowEl(oid) {
  const root = _root(); if (!root || !_q(oid)) return null;
  const id = rowIdOf(oid);
  return (id != null && root.querySelector('#wi-rows [data-row-id="' + id + '"]')) || document.getElementById('wi-imp-' + oid) ||
    root.querySelector('#wi-rows [data-oid="' + oid + '"]');
}
function rowOrder() {
  const root = _root(); if (!root) return [];
  const out = [];
  root.querySelectorAll('#wi-rows .wi4-day:not(.closed) .wi4-row[data-oid]').forEach((el) => { const o = el.dataset.oid; if (o && !out.includes(o)) out.push(o); });
  return out;
}
function focusRow(orderId) {
  const root = _root(); if (!root) return false;
  const el = _rowEl(orderId);
  if (!el) return false;
  const sec = el.closest('.wi4-day');
  if (sec && sec.classList.contains('closed')) {
    sec.classList.remove('closed');
    const d = sec.dataset.day; if (d) _D().ui.v4Days[d] = true;
    _layout(true);
  }
  root.querySelectorAll('.wi4-focus').forEach((x) => x.classList.remove('wi4-focus'));
  el.classList.add('wi4-focus');
  _D().ui = _D().ui || {};
  _D().ui.v4Focus = orderId;
  if (el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest' }); } catch (_) {} }
  el.classList.add('wi4-hl');
  setTimeout(() => { if (el.isConnected) el.classList.remove('wi4-hl'); }, 1500);
  return true;
}
function queueItems() { return _queue.slice(); }

// ═══ Hooks from weekly_intl.js (§a.4) ═══════════════════════════════════════
function repaintRow(rowId) {
  if (!_live()) return;
  try {
    const e = _m && _m.entries.find((x) => x.row && x.row.id === rowId && (x.t === 'exp' || x.t === 'imp'));
    const row = (_D().rows || []).find((r) => r.id === rowId);
    const root = _root();
    const el = root && root.querySelector('#wi-rows [data-row-id="' + rowId + '"]');
    if (!e || !row || !el) { if (paint() === false) W().renderWeeklyIntl(); return; }
    e.row = row;
    // The SAME facts rule as the full paint (_rowFacts): a failed match keeps
    // counting where the table has it.
    e.facts = _rowFacts(row, (row.orderIds || [])[0] || row.orderId);
    _qi[e.qi] = { row, blob: _blobOf(e) };
    const tmp = document.createElement('div');
    tmp.innerHTML = _entryHTML(e, _today());
    const fresh = tmp.firstElementChild;
    if (!fresh) return;
    el.replaceWith(fresh);
    fresh.querySelectorAll('.wi4-pts[data-pk]').forEach(_fillPts);
    _afterRows();
    _refresh();
  } catch (err) {
    _logErr(err, 'wi4: repaintRow');
    if (paint() === false) W().renderWeeklyIntl();
  }
}
function shelfPaint() {
  if (!_live()) return;
  const I = W(), root = _root(), st = _D().data.stock;
  try {
    let wrap = root.querySelector('.wi4-shelf');
    if (!st || !I.shelfHas(st)) { if (wrap) wrap.remove(); }
    else if (wrap) { const box = wrap.querySelector('#wi-shelf'); if (box) box.innerHTML = I.shelfInner(st, SHELF_OPT); }
    else {
      const q = root.querySelector('.wi4-q');
      if (q) { q.insertAdjacentHTML('afterend', _shelfWrapHTML()); }
    }
    I.shelfFit();
    // What the old _wiShelfPaint refreshes after the strip: the stock link in
    // every empty-return box and the «ΑΠ» tooltips.
    root.querySelectorAll('#wi-rows .wi2-gapstk[data-row]').forEach((el) => { el.innerHTML = I.stockGapLink((_D().rows || []).find((r) => r.id === +el.dataset.row)); });
    root.querySelectorAll('#wi-rows .wi-b-ap[data-oid]').forEach((el) => { const r = I.recOf(el.dataset.oid); if (r) el.title = I.apTip(r.fields); });
  } catch (e) { _logErr(e, 'wi4: shelfPaint'); }
  _retryToasts();
  _refresh();
}
/** §e.14: ONLY records and redraws — never _wiBuildRows, never a WINTL.data
 *  write, never a full paint. The re-read waits for the action to settle. */
function onSync(oid, state, msg) {
  if (!_live() || !oid) return;
  try {
    const old = document.querySelector('#content .wi4 [data-msg="' + _q(oid) + '"]');
    if (state === 'err') {
      const ent = (_D()._syncLog || {})[oid];
      if (ent && ent.seq == null) ent.seq = _loadSeq;   // the line words compare it after a re-read (_msgText)
      _scheduleReread();
      const html = _msgHTML(oid);
      if (old) old.outerHTML = html;
      else { const el = _rowEl(oid); if (el && html) el.insertAdjacentHTML('afterend', html); }
    } else if (old && state !== 'pend') old.remove();
    const u = document.getElementById('wi4-upd'); if (u) u.outerHTML = _updHTML();
    // The counts, the queue and the row's rail follow the TABLE at once — a
    // failed match must not keep the optimistic «all fine» until the re-read
    // (review 11/10). Still no rebuild: the rail is a class on the drawn row,
    // the rest is _refresh() (title bar, queue band, day headers). A failed
    // MATCH also changes what two days show (the import cell, the ghost line):
    // those day sections are redrawn from the same rows (_redrawDays).
    if (state === 'err') { if (!_redrawDays(oid)) _railOf(oid); _refresh(); }
  } catch (e) { _logErr(e, 'wi4: onSync'); }
}
// A failed match/unmatch (_unconfirmed): the export's day (its import cell
// says «δεν αποθηκεύτηκε») and the import's own loading day (the ghost line)
// are redrawn from a fresh model of the SAME rows — no _wiBuildRows, no
// WINTL.data write, no other day touched, and the overlays (outside #wi-rows:
// a popover open on another row, a menu, a panel) stay as they are (§e.14).
// Review 11/10: Tuesday still counted «1 κενό γύρισμα» for a row that drew
// the import, and Wednesday «1 χωρίς φορτηγό» for a load drawn nowhere.
// → true when it redrew (the rails came with it).
function _redrawDays(oid) {
  const root = _root(), r = row0(oid);
  if (!root || !r || !_unconfirmed(r)) return false;
  const m = _compute(), today = m.today;
  const mine = (d) => d.entries.some((e) => e.row === r || (e.t === 'ghost' && r.importId && (e.row.orderIds || [e.row.orderId]).includes(r.importId)));
  let n = 0;
  m.days.forEach((d) => {
    if (!DAY_RE.test(d.date || '') || !mine(d)) return;
    const old = root.querySelector('#wi-rows .wi4-day[data-day="' + d.date + '"]');
    if (!old) return;
    d.entries.forEach((e) => { e.qi = _qi.length; _qi.push({ row: e.row || e.parent || null, blob: _blobOf(e) }); });
    const tmp = document.createElement('div');
    tmp.innerHTML = _dayHTML(d, today);
    const fresh = tmp.firstElementChild;
    if (!fresh) return;
    old.replaceWith(fresh);
    fresh.querySelectorAll('.wi4-pts[data-pk]').forEach(_fillPts);
    n++;
  });
  if (n) _afterRows();
  return n > 0;
}
// The assignment save says what it ATTEMPTED (its orders and truck/partner):
// after the re-read, the failure line compares that with the table (P2,
// 11/10). Called by the old function right after its _wiSync('err').
function _noteAttempt(oid, info) {
  try {
    const s = (_D()._syncLog || {})[oid];
    if (!s || !info) return;
    s.attempt = { ids: (info.ids || []).filter((x) => REC.test(String(x || ''))), truck: info.truck || '', partner: info.partner || '',
      failed: Number(info.failed) || 0, offline: !!info.offline };
    if (!_live() || s.state !== 'err') return;
    const old = document.querySelector('#content .wi4 [data-msg="' + _q(oid) + '"]');
    if (old) old.outerHTML = _msgHTML(oid);
  } catch (e) { _logErr(e, 'wi4: note attempt'); }
}
// A late source landed (national carriers, local relays — the old module's
// hook, §a.4). v4 repaints: at once, or once no popover, panel or menu is
// open. The full paint replaces #content, and a national read answering a few
// seconds after load closed the popover a dispatcher was typing a partner
// rate in (review 11/10). Until then the board keeps the states it drew (_vw)
// — rows, headers and queue agree. Still loading (no v4 board in #content):
// that load's first paint reads the state itself.
function _overlayOpen() {
  const shown = (id) => { const el = document.getElementById(id); return !!(el && el.style.display === 'block'); };
  return shown('wi-popover') || shown('wi-panel') || shown('wi-ctx');
}
function _lateLanded() {
  try {
    if (!_live()) return;
    if (!_overlayOpen()) { if (paint() === false) W().renderWeeklyIntl(); return; }
    if (_lateT) return;
    const tick = () => {
      _lateT = null;
      if (!_live()) return;
      if (!_overlayOpen()) { if (paint() === false) W().renderWeeklyIntl(); return; }
      _lateT = setTimeout(tick, 1000);
    };
    _lateT = setTimeout(tick, 1000);
  } catch (e) { _logErr(e, 'wi4: late source'); }
}
function _railOf(oid) {
  const r = row0(oid), el = r && _rowEl(oid);
  if (!el || !el.classList || !el.classList.contains('wi4-row')) return;
  const lvl = _levelOf(_rowFacts(r, oid), _today());
  el.classList.toggle('wi4-r-red', lvl === 'red');
  el.classList.toggle('wi4-r-amb', lvl === 'amber');
}
function _canReread() {
  const D = _D();
  // A ⟳ older than PEND_MAX_MS is a lost answer, not a write in flight: it
  // no longer holds the re-read (it is dropped when the re-read starts).
  if (Object.values(D._syncLog || {}).some((s) => s && s.state === 'pend' && Date.now() - (Number(s.at) || 0) < PEND_MAX_MS)) return false;
  if (_overlayOpen()) return false;
  const a = A(); if (a && typeof a.isOpen === 'function' && a.isOpen()) return false;
  const mo = document.getElementById('modalOverlay');
  if ((mo && mo.classList.contains('open')) || document.querySelector('.mf-overlay')) return false;
  // An open order form is caught above. A pending «+ Νέα εισαγωγή» match
  // whose form was CANCELLED stays set with nothing open (only a create
  // clears it), and blocked every re-read for the session (review 11/10):
  // it holds the re-read for 2 minutes at most.
  const pm = window._wiPendingMatch;
  if (pm && Date.now() - (Number(pm.at) || 0) < REREAD_PM_MS) return false;
  return typeof currentPage !== 'undefined' && currentPage === 'weekly_intl';
}
function _scheduleReread() {
  if (_rereadT) return;
  let polls = 0;
  const tick = () => {
    _rereadT = null;
    if (!WIV2.active()) return;            // another page: never overwrite its #content
    if (!_canReread()) {
      // A minute of «something is open» is long enough to stop promising
      // «θα ξαναδιαβαστεί»: the line says we do not know, and offers
      // Ανανέωση. It keeps polling, so the re-read still happens.
      if (++polls === REREAD_POLLS && !_rereadFailed) { _rereadFailed = true; _redrawMsgs(); }
      _rereadT = setTimeout(tick, 1500);
      return;
    }
    const D = _D(), before = D._loadedAt;
    // A write that never answered (P1 review 11/10: its result used to land on
    // another row) is dropped — said once in app_errors, never a ⟳ for ever.
    Object.keys(D._syncLog || {}).forEach((o) => {
      const s = D._syncLog[o];
      if (s && s.state === 'pend' && Date.now() - (Number(s.at) || 0) >= PEND_MAX_MS) { delete D._syncLog[o]; _logErr(new Error('wi4: no answer for the write on ' + o), 'wi4: stale pending write dropped'); }
    });
    Promise.resolve(W().renderWeeklyIntl()).then(() => {
      // renderWeeklyIntl swallows its own errors (error card): an unchanged
      // _loadedAt means the re-read did not land, so the line must say we do
      // not know what was written — a clean row is never shown.
      _rereadFailed = D._loadedAt === before;
      if (_rereadFailed) { _redrawMsgs(); return; }
      // The table is on screen now: lines the user closed while it was not
      // («hidden») can finally go, with their ⚠ and counter.
      const gone = Object.keys(D._syncLog || {}).filter((o) => D._syncLog[o] && D._syncLog[o].hidden);
      if (gone.length && _live()) { gone.forEach(_dropLog); _refresh(); }
    }).catch((e) => { _rereadFailed = true; _logErr(e, 'wi4: re-read after a failed save'); _redrawMsgs(); });
  };
  _rereadT = setTimeout(tick, 1500);
}
function _redrawMsgs() {
  const D = _D();
  if (_live()) Object.keys(D._syncLog || {}).forEach((o) => onSync(o, (D._syncLog[o] || {}).state, (D._syncLog[o] || {}).msg));
}
// «Ξαναδοκίμασε» reopens the action UI for that order — never a blind replay
// of a write. _wiSync does not say which action failed, so it opens the
// per-load menu, which holds every action of the load.
function _retry(oid) {
  if (!_live() || !_q(oid)) return;
  const el = _rowEl(oid);
  const anchor = (el && el.querySelector('.wi4-plane')) || el;
  const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 200, bottom: 200 };
  const a = A();
  if (a) a.openRowMenu({ currentTarget: anchor, target: anchor, clientX: Math.round(r.left), clientY: Math.round(r.bottom), preventDefault() {}, stopPropagation() {} }, oid);
}
function _msgClose(oid) {
  const D = _D();
  const el = document.querySelector('#content .wi4 [data-msg="' + _q(oid) + '"]');
  if (el) el.remove();
  // While the re-read is pending, or after it failed, the row may still show
  // what was NOT written: × hides the line only — the ⚠, the counter and the
  // queue item stay until the table has been read again (review 11/10).
  const s = D._syncLog && D._syncLog[oid];
  if (s && (_rereadT || _rereadFailed || (row0(oid) && _unconfirmed(row0(oid))))) { s.hidden = true; return; }
  _dropLog(oid);
  _refresh();
}
// The user closed the line and the table is (now) on screen: the entry goes,
// with its ⚠ slot and the title-bar counter.
function _dropLog(oid) {
  const D = _D();
  if (D._syncLog) delete D._syncLog[oid];
  const r = row0(oid);
  const slot = r && document.getElementById('wi-sync-' + r.id);
  if (slot) { slot.className = 'wi-sync'; slot.textContent = ''; slot.title = ''; }
  const u = document.getElementById('wi4-upd'); if (u) u.outerHTML = _updHTML();
}
function feedTog(side) {
  // Hooks never throw into the old function that called them (§a.4).
  try {
    const root = _root(); if (!root || !_live()) return;
    const off = _ls('tms_wk3_' + side) === '0';
    root.classList.toggle(side === 'fl' ? 'wi4-fl-off' : 'wi4-fr-off', off);
    const m = document.getElementById('wi4-view'); if (m) m.innerHTML = _viewMenuHTML();
    _layout(true);
  } catch (e) { _logErr(e, 'wi4: feedTog'); }
}
/** The three `if(res?.conflict)` branches (§a.4), in this order: the slot
 *  leaves ⟳, the popover closes, the screen goes back to server truth, and
 *  only then «Ποια κρατάμε;». Closing the dialog = keep what is on screen. */
async function conflict(res, ctx) {
  const c = ctx || {};
  const I = W();
  // The slot's ORDER (P1): the row id may have moved since the write began.
  try { if (c.slot) I.sync(c.slot, '', '', c.slotOid || undefined); } catch (e) { _logErr(e, 'wi4 conflict: slot'); }
  try { I.closePopover(); } catch (e) { _logErr(e, 'wi4 conflict: popover'); }
  // renderWeeklyIntl swallows its own failure (error card): an unchanged
  // _loadedAt means the screen is NOT the server's truth, and the dialog says
  // so instead of asking «keep what you see».
  // What the user saw — the _expect that was sent — is read from WINTL.data
  // BEFORE the re-read replaces it: the dialog says «it was X, now it is Y».
  let expected = null;
  try {
    const d = _D().data, rec = (d.exports || []).find((r) => r.id === c.orderId) || (d.imports || []).find((r) => r.id === c.orderId);
    if (rec && res && Array.isArray(res.fields)) expected = L().buildExpect(res.fields, rec) || null;
  } catch (e) { _logErr(e, 'wi4 conflict: expected'); }
  const before = _D()._loadedAt;
  try { await I.renderWeeklyIntl(); } catch (e) { _logErr(e, 'wi4 conflict: re-read'); }
  const stale = _D()._loadedAt === before;
  const a = A();
  if (!a || typeof a.conflictDialog !== 'function') {
    if (typeof toast === 'function') toast('Η εγγραφή άλλαξε από άλλον χρήστη — δείχνουμε την τρέχουσα', 'warn');
    return;
  }
  // The old write function returns once the question is ON SCREEN: it must
  // never stay pending while the user thinks (a caller that awaited it hung
  // until a click, 11/10). The answer is handled here, keyed by ORDER id.
  a.conflictDialog(res || {}, { orderId: c.orderId, kind: c.kind === 'match' ? 'match' : 'assign', mine: c.mine || null, expected, stale })
    .then((choice) => {
      if (choice === 'refresh') { I.renderWeeklyIntl(); return; }
      if (choice !== 'reopen' || !_live()) return;
      // Reopen on the fresh truth, the row resolved by ORDER id now (§f).
      const id = rowIdOf(c.orderId);
      const row = id == null ? null : (_D().rows || []).find((r) => r.id === id);
      const el = row ? _rowEl(c.orderId) : null;
      const box = el && (el.querySelector('.wi4-asg .wi4-box') || el);
      if (!row || !box) { if (typeof toast === 'function') toast('Η σειρά δεν βρίσκεται πια στον πίνακα — ανανέωσε', 'warn'); return; }
      const ev = { currentTarget: box, target: box, stopPropagation() {}, preventDefault() {} };
      if (row.type === 'import') I.openImpPopover(ev, row.orderId, row.id); else I.openPopover(ev, row.id);
    })
    .catch((e) => _logErr(e, 'wi4 conflict: dialog'));
}
function presencePatch() {
  const root = _root(); if (!root || !_live()) return;
  try {
    const p = document.getElementById('wi4-pres'); if (p) p.outerHTML = _presHTML();
    const u = document.getElementById('wi4-upd'); if (u && !u.classList.contains('err')) u.outerHTML = _updHTML();
    const ps = _presState();
    const by = {};
    ps.others.forEach((o) => {
      const recs = Array.isArray(o.records) ? o.records : [o];
      recs.forEach((r) => { if (r && _q(r.record) && !by[r.record]) by[r.record] = { name: _pName(o), action: r.action, since: r.since }; });
    });
    // The initial replaces the row number for a row someone has open (§e #18).
    root.querySelectorAll('#wi-rows .wi4-c-idx[data-oid]').forEach((cell) => {
      const no = cell.querySelector('.wi4-no'); if (!no) return;
      const hit = by[cell.dataset.oid];
      if (!hit) {
        // The number and its reasons title come back (data-why, _idxHTML).
        if (no.dataset.p) { no.textContent = cell.dataset.no || ''; delete no.dataset.p; if (no.dataset.why) no.title = no.dataset.why; else no.removeAttribute('title'); }
        return;
      }
      no.innerHTML = `<span class="wi4-av sm">${_esc(hit.name.trim().charAt(0).toUpperCase())}</span>`;
      // Tooltip words from the client's whitelist (one source with the strip).
      no.title = typeof WI4Presence.tipText === 'function' ? WI4Presence.tipText(hit.name, { action: hit.action, since: hit.since }) : hit.name;
      no.dataset.p = '1';
    });
    const a = A(); if (a && typeof a._refreshPresence === 'function') a._refreshPresence();
  } catch (e) { _logErr(e, 'wi4: presencePatch'); }
}
function noteMove(oid, oldDay, label) {
  if (!_q(oid) || !DAY_RE.test(oldDay || '')) return;
  _moves[oid] = { oldDay, label: String(label || ''), at: Date.now() };
}
// «↓ Πήγε στην Πέμπτη 8/10 — …» at the old position for 10 s (§e #15).
function _traces() {
  const root = _root(); if (!root) return;
  const now = Date.now();
  Object.keys(_moves).forEach((oid) => {
    const mv = _moves[oid];
    const left = MS_TRACE - (now - mv.at);
    if (left <= 0) { delete _moves[oid]; return; }
    const el = _rowEl(oid);
    const sec = el && el.closest('.wi4-day');
    const newDay = sec ? sec.dataset.day : '';
    if (!newDay || newDay === mv.oldDay) { delete _moves[oid]; return; }
    const old = root.querySelector('#wi-rows .wi4-day[data-day="' + mv.oldDay + '"]');
    if (!old) return;
    const host = old.querySelector('.wi4-day-body') || old;
    const dw = _dow(newDay);
    const t = `${newDay > mv.oldDay ? '↓' : '↑'} Πήγε ${dw == null ? 'σε άλλη μέρα' : 'σ' + DOW_ACC[dw] + ' ' + _dm(newDay)} — ${mv.label}`;
    const div = document.createElement('div');
    div.className = 'wi4-trace';
    div.setAttribute('role', 'status');
    div.title = t + ' · κλικ: πήγαινε στη σειρά';
    div.textContent = t;
    div.addEventListener('click', () => focusRow(oid));
    host.appendChild(div);
    setTimeout(() => { if (div.isConnected) div.remove(); delete _moves[oid]; }, left);
  });
}

// ═══ Small UI handlers (underscore = not part of the frozen contract) ═══════
function _dayTog(date) {
  const root = _root(); if (!root || !DAY_RE.test(date || '')) return;
  const sec = root.querySelector('.wi4-day[data-day="' + date + '"]');
  if (!sec || !sec.querySelector('.wi4-day-body')) return;
  const open = sec.classList.contains('closed');
  sec.classList.toggle('closed', !open);
  const h = sec.querySelector('.wi4-dayh'); if (h) h.setAttribute('aria-expanded', String(open));
  _D().ui.v4Days[date] = open;
  if (open) _layout(true);
}
function _more(btn) {
  const cell = btn && btn.closest('.wi4-l-from, .wi4-l-to');
  const fold = cell && cell.querySelector('.wk3-xfold');
  if (!fold) return;
  const open = !fold.classList.contains('open');
  document.querySelectorAll('#content .wi4 .wk3-xfold.open').forEach((f) => f.classList.remove('open'));
  fold.classList.toggle('open', open);
}
function _qGo(i) {
  const it = _queue[i]; if (!it) return;
  if (it.rowKey && focusRow(it.rowKey)) return;
  _qAct(i);
}
function _qAct(i) {
  const it = _queue[i]; if (!it) return;
  const a = A(); if (a && typeof a._queueAct === 'function') a._queueAct(it);
}

const WIV2 = {
  _broken: false,
  active, paint, repaintRow, shelfPaint, onSync, feedTog, conflict, switchHTML,
  rowIdOf, presencePatch, noteMove, factsOf, search, queueItems, rowOrder, focusRow, searchFocus,
  // Inline-handler seams (not part of the frozen contract).
  _switch, _dayTog, _more, _qGo, _qAct, _searchKey, _status, _retry, _msgClose,
  // For the «Όλα N ▾» panel: a source still loading makes its count «≥N».
  _queueLoading: () => !!(_m && _m.loading),
  // For WI4Actions (menu sub-lines, date panel): a load named in its row's words.
  _ends,
  // Old-module seams (§a.4, fix round 3): a late source landed; an assignment
  // save's attempt, for the failure line. The menu's pallet figure (_pals).
  _lateLanded, _noteAttempt, _pals,
};
window.WIV2 = WIV2;
})();
