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

// ─── Copy (UI in Greek) ───────────────────────────────────────────────
const DOW_SHORT = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
// Upper case written as such: CSS upper-casing keeps the Greek tonos in some
// browsers (ΤΡΊΤΗ), the board's day headers never carry it.
const DOW_HEAD = ['ΚΥΡΙΑΚΗ', 'ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ'];
const DOW_ACC = ['την Κυριακή', 'τη Δευτέρα', 'την Τρίτη', 'την Τετάρτη', 'την Πέμπτη', 'την Παρασκευή', 'το Σάββατο'];
const MONTH_GEN = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
// Queue card buttons (§e #2). The ONE dispatcher is WI4Actions._queueAct (the
// «Όλα N ▾» panel uses it too); only 'week' (a W+1 load) is handled here,
// because the panel has no button for a load that is not on this board.
const ACT_LABEL = Object.freeze({
  assign: 'Ανάθεση', newImport: 'Νέα εισαγωγή', pieces: 'Κομμάτια', national: 'Εθνικά →', date: 'Ημερομηνία',
  open: 'Άνοιγμα', lot: 'Παρτίδα', convert: 'Μετατροπή', retry: 'Ξαναδοκίμασε',
});
// Day-header words for the reasons WI4.dayText does not spell (it covers the
// truck count, NO_TRUCK, EMPTY_RETURN and the national legs). Every reason of a
// day is said in its header, so header = queue = rails (§d.3 invariant).
const EXTRA_WORDS = Object.freeze({
  DATE_MISMATCH: 'ασυνέπεια ημερομηνιών', OVER_33: 'πάνω από 33π', SAME_DAY: 'ίδια μέρα',
  LATE: 'καθυστέρηση', PREORDER: 'pre-order χωρίς μετατροπή', SAVE_FAILED: 'δεν αποθηκεύτηκε',
});
// Words of the stock strip's flags — the SAME words _wiShelfInner shows
// (weekly_intl.js _WI_SHELF_FLAG), so the queue and the strip say one thing.
const LOT_WORDS = Object.freeze({ nointake: 'σε κίνηση χωρίς παραλαβή', close: 'κλείσιμο;', aging: '>21 ημ.' });
// Presence tooltip text is looked up from the whitelisted action, never taken
// from a server string (§e #18, §g.1).
const PRES_ACTION = Object.freeze({
  view: 'βλέπει την παραγγελία', menu: 'έχει ανοιχτό το μενού', assign: 'αλλάζει την ανάθεση',
  'date:Loading DateTime': 'αλλάζει την ημερομηνία φόρτωσης',
  'date:Delivery DateTime': 'αλλάζει την ημερομηνία εκφόρτωσης',
  'date:VS CD Date': 'αλλάζει την ημερομηνία Βέροιας',
});
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
let _popObs = null, _presOn = false;
let _scrolledWeek = null;
const _moves = {};           // oid → {oldDay, label, at} (§e #15)

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
function _natState() { const s = _D().data.nlState; return s === 'ok' || s === 'err' ? s : 'loading'; }
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
function _splitName(n) {
  const s = W().split(n || '') || {};
  return { title: s.title || String(n || '—'), place: [s.city, s.cc].filter(Boolean).join(', ') };
}
function _firstTitle(f, kind) { const L0 = _stopsOf(f, kind); return L0.length ? _splitName(L0[0].n).title : (W().clientName(f) || '—'); }
function _lastStop(f, kind) { const L0 = _stopsOf(f, kind); return L0.length ? _splitName(L0[L0.length - 1].n) : { title: '—', place: '' }; }
function _loadLabel(oid) {
  const f = _f(oid);
  if (!Object.keys(f).length) return '—';
  return (W().clientName(f) || _firstTitle(f, 'load')) + ' → ' + (f['Veroia Switch'] && f['Direction'] === 'Import' ? 'Βέροια' : _lastStop(f, 'del').title);
}
function _syncErr(oid) { const s = (_D()._syncLog || {})[oid]; return s && s.state === 'err' ? (s.msg || 'σφάλμα') : null; }
function _isPre(f) { return typeof isPreorder === 'function' && isPreorder(f); }
function _preLevel(f) { return typeof preorderLevel === 'function' ? preorderLevel(f) : 'red'; }
function _carrierOf(oid) {
  // Same reading as _wi2Carrier (weekly_intl.js): partner first, then truck.
  const D = _D().data, nl = D.nlBySrc && D.nlBySrc[oid];
  if (!nl) return null;
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
  const natLegs = vs ? [{ side: isImp ? 'from' : 'to', date: isImp ? delDate : _day(pf['Loading DateTime']), carrier: !!_carrierOf(pid) }] : [];
  const p = _pals(recs.map((r) => r.fields || {}));
  const ret = _lastStop(lastF, 'del');
  return {
    kind: row.legOf ? 'leg' : row.hasSplitLegs ? 'split' : isImp ? 'import' : 'export',
    saved: !!row.saved, partner: !!row.partnerId,
    loadDate, delDate,
    returnDate: delDate, returnPlace: ret.place || ret.title || '', hasReturn: !!row.importId,
    natLegs, natState,
    stockState: (D.data.stock && D.data.stock.status) || null,
    pallets: p.known ? p.n : null,
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
  const g = I.impGroupRowOf(row.importId);
  const base = g || { type: 'import', orderId: row.importId, orderIds: [row.importId] };
  const f = factsOf(Object.assign({}, base, { type: 'import', saved: true, partnerId: row.partnerId, truckId: '', driverId: '', legOf: null, hasSplitLegs: false }));
  f.sameDayClash = null;
  f._matched = true;
  return f;
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
  const pushFacts = (e, row, oid) => { const f = factsOf(row); e.facts.push({ oid, f, row }); if (row.importId && !row.hasSplitLegs) e.facts.push({ oid: row.importId, f: _impFacts(row), row }); };
  const rotaOf = (row, parent, day) => {
    I.legPidsOfRow(row).forEach((pid) => ((D._legs && D._legs[pid]) || []).forEach((lr) => {
      const oid = (lr.orderIds || [])[0] || lr.orderId;
      const e = { t: 'leg', row: lr, parent, day, facts: [{ oid, f: factsOf(lr), row: lr }] };
      day.entries.push(e); entries.push(e);
    }));
  };
  const relaysOf = (row, parent, day) => {
    if (typeof Relay === 'undefined' || !D.relay || D.relay.state !== 'ok') return;   // while loading: closed, as today
    I.relayIdsOfRow(row).forEach((oid) => {
      const o = I.relayOrder(oid);
      (Relay.KINDS || []).forEach((k) => {
        const rec = D.relay.byOrder && D.relay.byOrder[oid] && D.relay.byOrder[oid][k];
        if (!rec) return;
        let s = null; try { s = Relay.summary(rec, o); } catch (err) { _logErr(err, 'wi4: relay summary'); }
        if (!s) return;
        const e = { t: 'relay', x: { rec, oid, o, s }, parent, day, facts: [] };
        day.entries.push(e); entries.push(e);
      });
    });
  };
  const fill = (g, isExtra) => {
    const showImps = g.imps.filter((r) => !r.matchedTo);   // matched imports live inside their export row
    const day = { date: g.date, extra: isExtra, today: g.date === today, entries: [], empty: !g.exps.length && !showImps.length };
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
    day.collapsible = lg.collapsible(fl, today);
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
    if (it.code === 'EMPTY_RETURN') {
      it.text = [r.truckLabel, r.driverLabel].filter(Boolean).join(' · ') || _loadLabel(x.oid);
      it.sub = it.why;
    } else if (it.code === 'NAT_NO_CARRIER') {
      const f = _f(x.oid);
      it.text = it.side === 'to' ? _firstTitle(f, 'load') + ' → Βέροια' : 'Βέροια → ' + _lastStop(f, 'del').title;
      it.sub = 'εθνικό ' + _dayLabel(it.date) + ' · ' + it.why;
    } else {
      it.text = _loadLabel(x.oid);
      it.sub = it.code === 'NO_TRUCK' ? _rel(it.date, today, { past: 'φόρτωση ήταν', now: 'φορτώνει', none: 'χωρίς ημερομηνία φόρτωσης' }) + ' · ' + it.why : it.why;
    }
    if (it.code === 'DATE_MISMATCH') it.field = 'VS CD Date';
    return it;
  };
  entries.forEach((e) => e.facts.forEach((x) => lg.items(x.f, today, { key: x.oid, rowKey: x.oid }).forEach((it) => items.push(decorate(it, x)))));
  // ±1-week imports (rows flagged adj): on this board only when they need a
  // truck today or tomorrow — the rest belong to their own week's queue.
  rows.filter((r) => r.type === 'import' && r.adj && !r.matchedTo && !r.legOf).forEach((r) => {
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
    relayState: D.relay && D.relay.state, stockState: st && st.status })
    .forEach((it) => items.push(Object.assign({}, it, { key: '', rowKey: null, group: 'look', sub: '' })));
  const queue = lg.queue(items, today);
  const loading = natState === 'loading' || (D.relay && D.relay.state === 'loading') || (st && st.status === 'loading') || (_xw && _xw.state === 'loading');
  return { days, entries, queue, xwCount: xw.length, loading: !!loading, today };
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

// Date chip (§c.2, §e #7 d): a done date (✓) is plain grey text; the chip is
// red ONLY when the row has no truck; ≈ = an estimated cross-dock day; a past
// date without ✓ is grey «δεν δηλώθηκε» (status lag ≠ delay, rules sheet).
function _chipHTML(c, today) {
  if (!c) return '';
  const day = c.day || '';
  let cls, txt = day ? _dayLabel(day) : '—', title = c.what;
  if (c.done) { cls = 'done'; txt = '✓ ' + txt; title += ' — ολοκληρώθηκε'; }
  else if (c.noTruck) { cls = 'red'; if (c.est) txt = '≈' + txt; title += ' — χωρίς φορτηγό'; }
  else if (c.est) { cls = 'est'; txt = '≈' + txt; title += ' — εκτίμηση, κλικ για την πραγματική'; }
  else if (!day) { cls = 'past'; title += ' — δεν έχει οριστεί'; }
  else if (day < today) { cls = 'past'; title += ' — πέρασε · δεν δηλώθηκε'; }
  else cls = 'fut';
  const oid = _q(c.oid);
  const click = oid ? ` onclick="event.stopPropagation();WI4Actions.datePanel('${oid}','${c.field}',this)"` : '';
  return `<button type="button" class="wi4-dc ${cls}" title="${_esc(title + (oid ? ' · κλικ: αλλαγή' : ''))}"${click}>${_esc(txt)}</button>`;
}

// Points (§d.1): the data is kept per node, so the layout pass re-renders only
// the points nodes once the column width is measured (never per stop reflow).
function _ptsHTML(side) {
  const k = 'p' + (++_pk);
  const d = { stops: side.stops || [], dateTick: !!side.dateTick, showPal: !!side.showPal };
  _pts.set(k, d);
  const r = L().points(d.stops, _ptsW || 0, { dateTick: d.dateTick });
  return `<div class="wi4-pts${r.hidePlace ? ' wi4-noplace' : ''}" data-pk="${k}">${_ptsInner(r, d)}</div>${side.xfold || ''}`;
}
function _ptsInner(r, d) {
  let h = r.shown.map((s) => _ptHTML(s, d)).join('');
  if (r.more) h += `<button type="button" class="wi4-more" title="${_esc('Όλα τα σημεία:\n' + r.more.title)}" onclick="event.stopPropagation();WIV2._more(this)"><b>+${r.more.count}</b>${r.more.pallets ? `<span>${r.more.pallets}π</span>` : ''}</button>`;
  return h;
}
function _ptHTML(s, d) {
  const oid = _q(s.oid);
  const tick = s.tick ? '<span class="wi4-ok" aria-label="ολοκληρώθηκε">✓</span> ' : '';
  const delay = s.delayH ? ` <span class="wi4-delay">+${_esc(s.delayH)}ω</span>` : '';
  const pal = d.showPal && s.pallets != null ? ` · ${s.pallets}π` : '';
  const placeTxt = (s.place || '') + pal;
  let l2;
  if (s.warn) {
    const w = _q(s.warn.oid);
    l2 = `<span class="wi4-l2 wi4-t-amb" title="${_esc('ασυνέπεια ημερομηνιών · ' + s.warn.text)}"${w ? ` onclick="event.stopPropagation();WI4Actions.datePanel('${w}','VS CD Date',this)" style="cursor:pointer"` : ''}>! ${_esc(s.warn.text)}</span>`;
  } else l2 = `<span class="wi4-l2" title="${_esc(placeTxt)}">${tick}${_esc(placeTxt)}</span>`;
  const l1 = `<span class="wi4-l1" title="${_esc(s.label)}">${_esc(s.label)}${delay}</span>`;
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
  const stops = (L0.length ? L0 : [{ n: I.clientName(f) || '—' }]).map((x, i) => {
    const nm = _splitName(x.n);
    return { n: i + 1, label: nm.title, place: nm.place, pallets: null, done: kind === 'load' ? st.loaded : st.delivered, oid: r && r.id };
  });
  return { stops, dateTick: kind === 'load', showPal: false, xfold: I.moreStops(I.placeStr(f, kind), kind === 'load' ? f._stopsL : f._stopsD, kind) };
}
function _palHTML(fieldsList, oid) {
  const I = W();
  const p = _pals(fieldsList);
  const one = fieldsList.length === 1 ? fieldsList[0] : null;
  let h = '';
  if (one && oid) h += I.lotBadge(one) + I.apBadge(one, oid);
  if (fieldsList.some((f) => f && f['Pallet Exchange'])) h += '<span class="wi4-pe" title="Ανταλλαγή παλετών">PE</span>';
  if (oid && typeof OrderDocs !== 'undefined') { try { const b = OrderDocs.badge(oid, { size: 11 }); if (b) h += `<span class="wi4-att">${b}</span>`; } catch (e) { _logErr(e, 'wi4: docs badge'); } }
  if (!p.known) h += '<span class="wi4-pal wi4-t-g2" title="Οι παλέτες δεν έχουν καταγραφεί">—</span>';
  else h += `<span class="wi4-pal${p.n > 33 ? ' over' : ''}" title="${_esc((p.n > 33 ? 'Πάνω από τη χωρητικότητα (33) · ' : 'Παλέτες · ') + p.n + '/33' + (p.miss ? ' · ' + p.miss + ' χωρίς παλέτες' : ''))}">${p.n}${p.miss ? '+?' : ''}</span>`;
  return h;
}
function _legHTML(s, today) {
  const click = s.click ? ` onclick="event.stopPropagation();${s.click}" style="cursor:pointer"` : '';
  return `<div class="wi4-leg"${click}>` +
    `<div class="wi4-l-date">${_chipHTML(s.chip, today)}${s.ref ? _ell('wi4-ref wi4-ell', s.ref) : ''}</div>` +
    `<div class="wi4-l-from">${_ptsHTML(s.from)}</div>` +
    '<span class="wi4-l-arr" aria-hidden="true">→</span>' +
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
function _impLegHTML(host, imp, today) {
  const I = W(), D = _D();
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
    to = { stops: [{ n: 1, label: 'Βέροια', place: 'μετά εθνικό: ' + _lastStop(f, 'del').title, done: st.delivered, warn, oid: imp.id }], dateTick: false };
  } else to = _sideOf(members, 'del', { dragRowId: dragRow });
  let pal = _palHTML(members.map((r) => r.fields || {}), isGroup ? null : imp.id);
  // Whole matched group to another export (§f): today's grip string.
  if (isGroup && _gtOn() && host.type === 'export' && _q(g.orderId)) {
    pal = `<span draggable="true" class="wi4-t-g2" style="cursor:grab" title="Σύρε ολόκληρη την ομάδα σε άλλη εξαγωγή" onclick="event.stopPropagation()" ondragstart="event.stopPropagation();_wiImpDragStart(event,'${_q(g.orderId)}',true)" ondragend="_wiImpDragEnd()">⋮⋮</span>` + pal;
  }
  return _legHTML({
    chip: { oid: lead.id, field: 'Loading DateTime', day: _day(f['Loading DateTime']), done: st.loaded, noTruck: !host.saved, what: 'Ημερομηνία φόρτωσης εισαγωγής' },
    ref: isGroup ? _plural(members.length, 'load') : (f['Reference'] || ''),
    from, to, pal, click: _q(lead.id) ? `WI_INTERNAL.edit('${_q(lead.id)}')` : '',
  }, today);
}

// National leg cell (§e #12). Never «ΠΡΟΣ ΑΝΑΘΕΣΗ» for an unread leg (§d.2a).
function _natHTML(oid, name, day, today) {
  const st = _natState();
  const dayS = DAY_RE.test(day || '') ? DOW_SHORT[_dow(day)] : '';
  const head = `<span class="wi4-l1" title="${_esc(name + (day ? ' · ' + _dayLabel(day) : ''))}">${_esc(name)}${dayS ? ` <span class="wi4-nat-day">${dayS}</span>` : ''}</span>`;
  let tile;
  if (st !== 'ok') {
    const t = st === 'err' ? 'απέτυχε — δεν σημαίνει ότι δεν έχουν μεταφορέα' : 'δεν φορτώθηκε ακόμη';
    tile = `<span class="wi4-tile unk" title="${t}">—</span>`;
  } else {
    const c = _carrierOf(oid);
    if (c) tile = `<span class="wi4-tile ${c.kind} wi4-ell" title="${_esc((c.kind === 'par' ? 'Εθνικός μεταφορέας — συνεργάτης: ' : 'Εθνικός μεταφορέας — ιδιόκτητο: ') + c.text)}">${_esc(c.text)}</span>`;
    else {
      const k = L().dayDiff(today, day);
      const red = k === null || k <= 1;
      tile = `<span class="wi4-tile un${red ? ' red' : ''}" title="Εθνικό σκέλος χωρίς μεταφορέα — ανατίθεται στο Εβδομαδιαίο Εθνικών">ΠΡΟΣ ΑΝΑΘΕΣΗ</span>`;
    }
  }
  return `<div class="wi4-nat">${head}${tile}</div><span class="wi4-natdot" title="${_esc('Εθνικό σκέλος · ' + name)}"></span>`;
}

// Assignment cell (§e #8): box + print (share-menu contract) + paper plane.
function _asgHTML(row) {
  const I = W(), D = _D().data;
  const oid = (row.orderIds || [])[0] || row.orderId;
  if (row.hasSplitLegs) return '<div class="wi4-asg"><span class="wi4-box split" title="Σπασμένη σε 2 σκέλη — η εκτέλεση ζει στα σκέλη από κάτω">2 σκέλη</span></div>';
  const isImp = row.type === 'import';
  const truck = row.truckLabel || (D.trucks.find((t) => t.id === row.truckId) || {}).label || '';
  const trailer = row.trailerLabel || (D.trailers.find((t) => t.id === row.trailerId) || {}).label || '';
  const driver = row.driverLabel || (D.drivers.find((d) => d.id === row.driverId) || {}).label || '';
  // «—», not «Συνεργάτης», for a partner missing from the cache (owner 4/9):
  // the generic word is not a company name.
  const partner = row.partnerLabel || (D.partners.find((p) => p.id === row.partnerId) || {}).label || (row.partnerId ? '—' : '');
  const open = isImp ? (_q(row.orderId) ? `WI_INTERNAL.openImpPopover(event,'${_q(row.orderId)}',${row.id})` : '') : `WI_INTERNAL.openPopover(event,${row.id})`;
  let cls, inner, title;
  if (row.saved && partner) {
    cls = 'par'; const l2 = [row.partnerPlates, driver].filter(Boolean).join(' · ');
    inner = _ell('wi4-l1', partner) + (l2 ? _ell('wi4-l2', l2) : '');
    title = 'Συνεργάτης: ' + [partner, l2].filter(Boolean).join(' · ') + ' — κλικ: αλλαγή ανάθεσης';
  } else if (row.saved) {
    cls = 'own'; const pl = [truck, trailer].filter(Boolean).join(' · ') || '—';
    inner = `<span class="wi4-l1 wi4-plate" title="${_esc(pl)}">${_esc(pl)}</span>` + (driver ? _ell('wi4-l2', driver) : '');
    title = 'Ιδιόκτητο: ' + [pl, driver].filter(Boolean).join(' · ') + ' — κλικ: αλλαγή ανάθεσης';
  } else {
    cls = 'un'; inner = 'ΠΡΟΣ ΑΝΑΘΕΣΗ'; title = (isImp ? 'Εισαγωγή χωρίς όχημα' : 'Προς ανάθεση') + ' — κλικ για ανάθεση';
  }
  const box = `<button type="button" class="wi4-box ${cls}" title="${_esc(title)}"${open ? ` onclick="event.stopPropagation();${open}"` : ''}>${inner}</button>`;
  // Print keeps .wk3-prt + data-shq (right-click share menu, §a.7).
  let prt = '';
  const group = (row.orderIds || []).length > 1;
  const hasP = !!(row.partnerId || row.partnerLabel);
  const shq = (id, leg) => (typeof printSheetQuery === 'function' && _q(id) ? ` data-shq="${_esc(printSheetQuery(id, leg, hasP))}"` : '');
  if (isImp) {
    prt = group
      ? `<button type="button" class="wk3-prt" title="Εκτύπωση ομάδας εισαγωγής — ${row.orderIds.length} έγγραφα" onclick="event.stopPropagation();WI_INTERNAL.printImpGroup(${row.id})">⎙</button>`
      : (_q(oid) ? `<button type="button" class="wk3-prt" title="Εκτύπωση εντολής εισαγωγής — δεξί κλικ: κοινή χρήση"${shq(oid, 'import')} data-shtitle="Εντολή εισαγωγής — W${_D().week}" onclick="event.stopPropagation();WI_INTERNAL.printImp('${_q(oid)}',${hasP ? 'true' : 'false'})">⎙</button>` : '');
  } else {
    prt = group
      ? `<button type="button" class="wk3-prt" title="Εκτύπωση ομάδας — ${row.orderIds.length} έγγραφα" onclick="event.stopPropagation();WI_INTERNAL.printGroup(${row.id})">⎙</button>`
      : `<button type="button" class="wk3-prt" title="Εκτύπωση εντολής εξαγωγής — δεξί κλικ: κοινή χρήση"${shq(oid, 'export')} data-shtitle="Εντολή εξαγωγής — W${_D().week}" onclick="event.stopPropagation();WI_INTERNAL.print(${row.id},'export')">⎙</button>`;
  }
  const plane = _q(oid) ? `<button type="button" class="wi4-plane" title="Ενέργειες φορτίου" aria-label="Ενέργειες φορτίου" onclick="event.stopPropagation();WI4Actions.openRowMenu(event,'${_q(oid)}')">${PLANE}</button>` : '';
  return `<div class="wi4-asg">${box}${prt}${plane}</div>`;
}
function _idxHTML(oid, no, rowId) {
  return `<div class="wi4-c-idx" data-oid="${_q(oid)}" data-no="${_esc(no)}"><span class="wi4-no">${_esc(no)}</span>${rowId != null ? `<span class="wi-sync" id="wi-sync-${rowId}"></span>` : ''}</div>`;
}

// ═══ Markup: rows (§e #7, #11, #13) ═════════════════════════════════════
function _expRowHTML(e, today) {
  const I = W(), D = _D(), row = e.row;
  const exps = _memberRecs(row);
  if (!exps.length) return '';
  const isGroup = exps.length > 1, pf = exps[0].fields || {}, pid = exps[0].id;
  const st = I.stFlags(pf), vs = !!pf['Veroia Switch'];
  const noTruck = !row.saved;
  let chip, from;
  if (vs && !isGroup) {
    const v = I.vsCd(pf, 'exp') || {};
    chip = { oid: pid, field: 'VS CD Date', day: v.iso, est: v.est, done: st.loaded, noTruck, what: 'Ημερομηνία φόρτωσης από Βέροια' };
    const o = _splitName((_stopsOf(pf, 'load')[0] || {}).n || I.clientName(pf));
    from = { stops: [{ n: 1, label: 'Βέροια', place: 'από ' + [o.title, o.place.split(',')[0]].filter(Boolean).join(', '), done: st.loaded, oid: pid }], dateTick: true };
  } else {
    chip = { oid: pid, field: 'Loading DateTime', day: _day(pf['Loading DateTime']), done: st.loaded, noTruck, what: 'Ημερομηνία φόρτωσης' };
    from = _sideOf(exps, 'load', { dragRowId: isGroup && _gtOn() ? row.id : null });
  }
  const to = _sideOf(exps, 'del', { dragRowId: isGroup && _gtOn() ? row.id : null });
  // (a) a groupage shows «N φορτία» where ΑΝΑΦ. goes.
  const ref = isGroup ? _plural(exps.length, 'load') : (pf['Reference'] || '');
  const leg = _legHTML({ chip, ref, from, to, pal: _palHTML(exps.map((r) => r.fields || {}), isGroup ? null : pid),
    click: isGroup ? `WI_INTERNAL.rota(${row.id})` : (_q(pid) ? `WI_INTERNAL.edit('${_q(pid)}')` : '') }, today);

  // Import side: matched load · empty return · partner only · open slot.
  const imp = row.importId ? D.data.imports.find((r) => r.id === row.importId) : null;
  const hasPartner = !!(row.partnerId || row.partnerLabel);
  let impInner;
  if (imp) impInner = _impLegHTML(row, imp, today);
  else if (row.saved && !hasPartner && !row.importId) impInner = _gapHTML(row, e, today);
  else if (row.saved && hasPartner) impInner = '<span class="wi4-void">Μόνο εξαγωγή · συνεργάτης</span>';
  else impInner = '<span class="wi4-void" title="Σύρε εισαγωγή εδώ για ταίριασμα"></span>';
  // The import cell is the drop target (§f): empty = match, a load = join.
  const impCell = `<div id="wi-ci-${row.id}" class="wi4-c-imp wi4-imp" ondragover="event.preventDefault();this.classList.add('wi4-dh')" ondragleave="this.classList.remove('wi4-dh')" ondrop="event.stopPropagation();_wiDropOnRow(event,${row.id})">${impInner}</div>`;

  const fl = vs && !isGroup ? _natHTML(pid, _firstTitle(pf, 'load') + ' → Βέροια', _day(pf['Loading DateTime']), today) : '';
  const imf = imp ? (imp.fields || {}) : null;
  const fr = imf && imf['Veroia Switch'] ? _natHTML(imp.id, _lastStop(imf, 'del').title, _day(imf['Delivery DateTime']), today) : '';
  const lvl = _levelOf(e.facts, today);
  return `<div id="wi-row-${row.id}" data-row-id="${row.id}" data-oid="${_q(pid)}" data-qi="${e.qi}" class="wi4-row${_rail(lvl)}"${_q(pid) ? ` oncontextmenu="WI4Actions.openRowMenu(event,'${_q(pid)}')"` : ''}>` +
    _idxHTML(pid, e.no, row.id) +
    `<div class="wi4-c-fl">${fl}</div>` +
    `<div class="wi4-c-exp">${leg}</div>` +
    `<div class="wi4-c-asg">${_asgHTML(row)}</div>` +
    impCell +
    `<div class="wi4-c-fr">${fr}</div></div>`;
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
  return `<div class="wi4-gap${r && r.level === 'amber' ? ' amb' : ''}" title="${_esc('Κενό γύρισμα — ιδιόκτητος γύρος χωρίς φορτίο επιστροφής. Σύρε εισαγωγή εδώ ή δημιούργησε νέα.')}">` +
    '<span>Κενό γύρισμα</span>' + (detail ? `<span class="${t} wi4-ell" title="${_esc(detail)}">· ${_esc(detail)}</span>` : '') +
    `<button type="button" class="wi4-gap-act" onclick="event.stopPropagation();WI_INTERNAL.newImport(${row.id})">+ Νέα εισαγωγή</button>` +
    `<span class="wi2-gapstk" data-row="${row.id}">${W().stockGapLink(row)}</span></div>`;
}
function _impRowHTML(e, today) {
  const I = W(), D = _D(), row = e.row;
  const imp = D.data.imports.find((r) => r.id === row.orderId);
  if (!imp) return '';
  const f = imp.fields || {}, oid = imp.id, q = _q(oid);
  const own = row.saved && !row.partnerId;
  const left = `<div class="wi4-noexp"${own ? ' onclick="event.stopPropagation();WI_INTERNAL.jumpFirstPendingExp()" style="cursor:pointer" title="Ιδιόκτητο όχημα χωρίς εξαγωγή — κλικ: η πρώτη εξαγωγή προς ανάθεση"' : ''}><span>Χωρίς εξαγωγή</span><span class="wi4-t-g2">· αυτή την εβδομάδα</span></div>`;
  const fr = f['Veroia Switch'] ? _natHTML(oid, _lastStop(f, 'del').title, _day(f['Delivery DateTime']), today) : '';
  const lvl = _levelOf(e.facts, today);
  // A free import row is a drag source (§f); split legs are not free imports.
  const drag = q && !e.split ? ` draggable="true" ondragstart="event.stopPropagation();_wiImpDragStart(event,'${q}')" ondragend="_wiImpDragEnd()"` : '';
  return `<div id="wi-imp-${q}" data-row-id="${row.id}" data-oid="${q}" data-qi="${e.qi}" class="wi4-row${_rail(lvl)}"${drag}${q ? ` oncontextmenu="WI4Actions.openRowMenu(event,'${q}')"` : ''}>` +
    _idxHTML(oid, e.no, row.id) +
    '<div class="wi4-c-fl"></div>' +
    `<div class="wi4-c-exp">${left}</div>` +
    `<div class="wi4-c-asg">${_asgHTML(row)}</div>` +
    `<div class="wi4-c-imp">${_impLegHTML(row, imp, today)}</div>` +
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
    `<div class="wi4-c-span"><span class="wi4-ell" style="display:block" title="${_esc(txt)}"><span class="wi4-tag">ΣΠΑΣΜΕΝΗ ΣΕ ${legs.length || 2} ΣΚΕΛΗ</span> · ${_esc(txt)}</span></div></div>`;
}
// Rota leg (§e #11): «ΣΚΕΛΟΣ ΡΟΤΑΣ · ίδιο φορτηγό» + «× αποσύνδεση», the leg
// itself in the column of its direction.
function _legRowHTML(e, today) {
  const I = W(), lr = e.row;
  const oid = (lr.orderIds || [])[0] || lr.orderId, q = _q(oid);
  const r = _rec(oid);
  if (!r) return '';
  const f = r.fields || {}, isImp = f['Direction'] === 'Import';
  const st = I.stFlags(f);
  const leg = _legHTML({
    chip: { oid, field: 'Loading DateTime', day: _day(f['Loading DateTime']), done: st.loaded, noTruck: false, what: 'Ημερομηνία φόρτωσης σκέλους' },
    ref: f['Reference'] || '', from: _sideOf([r], 'load'), to: _sideOf([r], 'del'), pal: _palHTML([f], oid),
  }, today);
  // The tag sits in the OTHER column, leaning towards the assignment cell.
  const tag = `<span class="wi4-ell" style="display:block;text-align:${isImp ? 'right' : 'left'}" title="Σκέλος ρότας — το ίδιο φορτηγό"><span class="wi4-tag">ΣΚΕΛΟΣ ΡΟΤΑΣ</span> <span class="wi4-t-g2">· ίδιο φορτηγό</span></span>`;
  const lvl = _levelOf(e.facts, today);
  const unlink = q ? `<button type="button" class="wi4-unlink" title="Ακύρωση προώθησης — αποσύνδεση σκέλους από τη ρότα" onclick="event.stopPropagation();WI_INTERNAL.rotUnlink(event,'${q}')">× αποσύνδεση</button>` : '';
  return `<div class="wi4-subrow${_rail(lvl)}" data-row-id="${lr.id}" data-oid="${q}" data-qi="${e.qi}"${q ? ` onclick="WI_INTERNAL.edit('${q}')" oncontextmenu="WI4Actions.openRowMenu(event,'${q}')"` : ''}>` +
    '<div class="wi4-c-idx"><span class="wi4-legidx">↳</span></div><div class="wi4-c-fl"></div>' +
    `<div class="wi4-c-exp">${isImp ? tag : leg}</div>` +
    `<div class="wi4-c-asg">${unlink}</div>` +
    `<div class="wi4-c-imp">${isImp ? leg : tag}</div><div class="wi4-c-fr"></div></div>`;
}
// Local driver (§e #11): «ΤΟΠΙΚΗ ΦΟΡΤΩΣΗ · Οδηγός · Σάβ 3/10 05:00» in the
// export column, «ΤΟΠΙΚΗ ΠΑΡΑΔΟΣΗ · … · άλλο φορτηγό ΧΥΖ» in the import
// column. Only what differs from the order is added (Relay.diffParts).
function _relayRowHTML(e) {
  const I = W(), D = _D();
  const { rec, oid, s } = e.x;
  const isDel = s.kind === 'relay_delivery';
  const bad = D.relay && D.relay.syncErr && D.relay.syncErr[rec.id];
  const parts = [s.driverName || 'ΠΡΟΣ ΑΝΑΘΕΣΗ', (Relay.fmtDay(s.day) || '') + (s.time ? ' ' + s.time : '')].concat(Relay.diffParts(s) || []);
  if (s.done) parts.push('✓ ' + (isDel ? 'παραδόθηκε' : 'φορτώθηκε'));
  if (s.dayMismatch) parts.push('⚠ μέρα ≠ παραγγελίας');
  if (bad) parts.push('⚠ δεν επιβεβαιώθηκε');
  let tip = '';
  try { tip = I.relayTip(e.x); } catch (err) { _logErr(err, 'wi4: relay tip'); }
  const tag = isDel ? 'ΤΟΠΙΚΗ ΠΑΡΑΔΟΣΗ' : 'ΤΟΠΙΚΗ ΦΟΡΤΩΣΗ';
  const cell = `<span class="wi4-ell" style="display:block" title="${_esc(tip || tag + ' · ' + parts.join(' · '))}"><span class="wi4-tag">${tag}</span> · ${parts.map((p, i) => (i === 0 && !s.driverName ? `<span class="wi4-t-red">${_esc(p)}</span>` : _esc(p))).join(' · ')}</span>`;
  const q = _q(oid), rid = SAFE.test(String(rec.id || '')) ? rec.id : '';
  const acts = q && rid ? ` onclick="WI_INTERNAL.relayOpen('${q}','${rid}')" oncontextmenu="_wiRelayCtx(event,'${rid}','${q}')"` : '';
  return `<div class="wi4-subrow${bad ? ' wi4-r-red' : ''}" data-oid="${q}"${acts}>` +
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
    case 'relay': return _relayRowHTML(e);
  }
  return '';
}

// ═══ Markup: day headers, chrome (§e #1–#6, #20, #21) ═════════════════════
function _dayCountHTML(day) {
  const parts = String(day.text || '').split(' · ');
  const out = [];
  parts.forEach((p, i) => {
    if (i === 0) { out.push(_esc(p)); return; }
    let code = null;
    if (p.includes('χωρίς φορτηγό')) code = 'NO_TRUCK';
    else if (/γύρισμα|γυρίσματα/.test(p)) code = 'EMPTY_RETURN';
    else if (p.includes('χωρίς μεταφορέα')) code = 'NAT_NO_CARRIER';
    const lvl = code ? day.levels[code] : 'amber';
    out.push(`<span class="${lvl === 'red' ? 'wi4-t-red' : 'wi4-t-amb'}">${_esc(p)}</span>`);
  });
  const by = day.counts.byCode || {};
  Object.keys(EXTRA_WORDS).forEach((code) => {
    if (!by[code]) return;
    out.push(`<span class="${day.levels[code] === 'red' ? 'wi4-t-red' : 'wi4-t-amb'}">${by[code]} ${_esc(EXTRA_WORDS[code])}</span>`);
  });
  return '· ' + out.join(' · ');
}
function _dayOpen(day) {
  const ui = _D().ui || {};
  const m = ui.v4Days || {};
  if (Object.prototype.hasOwnProperty.call(m, day.date)) return !!m[day.date];
  return !day.collapsible;
}
function _dayHTML(day, today) {
  const dw = _dow(day.date);
  const name = dw == null ? 'ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ' : DOW_HEAD[dw] + ' ' + _dm(day.date);
  const wk = day.extra && day.date ? W().weekOf(day.date + 'T12:00:00') : null;
  const extra = day.extra ? `<span class="wi4-dayh-c" title="Μεταφέρθηκε σε αυτή την προβολή (Μεταφορά εβδομάδας) — η πραγματική ημέρα είναι εκτός Σαβ–Παρ">μεταφέρθηκε${wk != null ? ' · W' + wk : ''}</span>` : '';
  const q = DAY_RE.test(day.date || '') ? day.date : '';
  if (day.empty) {
    return `<section class="wi4-day${day.today ? ' today' : ''}" data-day="${q}"><div class="wi4-dayh"><span class="wi4-chev" aria-hidden="true">▾</span><span>${name}</span>${day.today ? '<span class="wi4-today">σήμερα</span>' : ''}<span class="wi4-dayh-c">· Καμία κίνηση</span></div></section>`;
  }
  const open = _dayOpen(day);
  const body = day.entries.map((e) => _entryHTML(e, today) + (e.facts[0] && (e.t === 'exp' || e.t === 'imp') ? _msgHTML(e.facts[0].oid) : '')).join('');
  return `<section class="wi4-day${day.today ? ' today' : ''}${open ? '' : ' closed'}" data-day="${q}">` +
    `<div class="wi4-dayh" role="button" tabindex="0" aria-expanded="${open}" onclick="WIV2._dayTog('${q}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();WIV2._dayTog('${q}')}">` +
    `<span class="wi4-chev" aria-hidden="true">▾</span><span>${name}</span>${day.today ? '<span class="wi4-today">σήμερα</span>' : ''}${extra}` +
    `<span class="wi4-dayh-c" data-dc="${q}">${_dayCountHTML(day)}</span></div>` +
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
  if (errs) return `<span class="wi4-upd err" id="wi4-upd" role="status">${errs} ${errs === 1 ? 'αλλαγή δεν αποθηκεύτηκε' : 'αλλαγές δεν αποθηκεύτηκαν'}</span>`;
  const ch = _presState().changes;
  if (ch && (+ch.n > 0 || +ch.auto_n > 0)) {
    const words = [];
    if (+ch.n > 0) words.push(`${+ch.n} ${+ch.n === 1 ? 'αλλαγή' : 'αλλαγές'}${ch.last_by ? ' από ' + ch.last_by : ''}`);
    if (+ch.auto_n > 0) words.push(`${+ch.auto_n} ${+ch.auto_n === 1 ? 'αυτόματη ενημέρωση' : 'αυτόματες ενημερώσεις'}`);
    return `<button type="button" class="wi4-upd chg" id="wi4-upd" onclick="WI_INTERNAL.renderWeeklyIntl()" title="Άλλαξαν παραγγελίες της εβδομάδας από τότε που φόρτωσε η σελίδα — κλικ: ανανέωση">${_esc(words.join(' · '))} · Ανανέωση</button>`;
  }
  const at = D._loadedAt instanceof Date ? D._loadedAt : null;
  if (!at) return '<span class="wi4-upd" id="wi4-upd"></span>';
  const s = Math.max(0, Math.round((Date.now() - at.getTime()) / 1000));
  const ago = s < 60 ? 'μόλις τώρα' : s < 3600 ? `πριν ${Math.round(s / 60)}΄` : `πριν ${Math.round(s / 3600)}ω`;
  const hm = at.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `<span class="wi4-upd" id="wi4-upd" title="Ενημερώθηκε στις ${_esc(hm)}">Ενημερώθηκε ${ago}</span>`;
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
      else if (_xw.state === 'ok' && m.xwCount) badge = `<span class="wi4-tab-b" title="${m.xwCount} φορτία της W${w} φορτώνουν ως αύριο">${m.xwCount}</span>`;
    }
    h += `<button type="button" class="wi4-tab${w === wk ? ' on' : ''}" onclick="${go(w)}" title="${_esc(I.weekRange(w) || '')}">W${w}${w === cur ? ' <span class="wi4-t-blue" aria-label="τρέχουσα">•</span>' : ''}${badge}</button>`;
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
  if (typeof window !== 'undefined' && window.TMS_EXPECT_LIVE === false) h += '<div class="wi4-qp-h wi4-t-amb" role="note">ο έλεγχος «το άλλαξε άλλος» δεν είναι ενεργός ακόμη</div>';
  return h;
}
function _barHTML(m) {
  const I = W(), D = _D();
  const preN = (D.rows || []).filter((r) => !r.adj && !r.legOf).reduce((n, r) => n + ((r.orderIds && r.orderIds.length ? r.orderIds : [r.orderId]).concat(r.importId ? [r.importId] : [])).filter((id) => _isPre(_f(id))).length, 0);
  const scan = (typeof OrdersCommon !== 'undefined' && OrdersCommon.scanButton) ? OrdersCommon.scanButton('WI_INTERNAL.scan()', 'Σάρωση', 'Νέα διεθνής παραγγελία από σάρωση εγγράφου — χωρίς έξοδο από το εβδομαδιαίο') : '';
  const neu = (typeof OrdersCommon !== 'undefined' && OrdersCommon.newOrderButton) ? OrdersCommon.newOrderButton('WI_INTERNAL.newOrder()', '+ Νέα παραγγελία', 'Νέα διεθνής παραγγελία — χωρίς έξοδο από το εβδομαδιαίο') : '';
  return '<div class="wi4-bar">' +
    `<span class="wi4-title">Εβδομαδιαίο Διεθνών</span><span class="wi4-range">${_esc(_range(D.week))}</span>${_updHTML()}` +
    _presHTML() +
    `<nav class="wi4-tabs" id="wi4-tabs" aria-label="Εβδομάδες">${_tabsHTML(m)}</nav>` +
    '<div class="wk-more"><button type="button" class="wi4-btn wk-more-t" onclick="wkMoreToggle(event)" aria-haspopup="true" aria-expanded="false">Προβολή ▾</button>' +
    `<div class="wk-more-m" role="menu" id="wi4-view" hidden>${_viewMenuHTML()}</div></div>` +
    `<button type="button" class="wi4-btn" onclick="WI_INTERNAL.preorder()" title="Φορτίο που ανακοινώθηκε — λεπτομέρειες αργότερα">Pre-order${preN ? ` <span class="wi4-cnt">${preN}</span>` : ''}</button>` +
    scan + neu + '</div>';
}
function _qwrapHTML(m) {
  const q = m.queue, n = q.length;
  const red = q.filter((x) => x.level === 'red').length, amb = n - red;
  const unk = q.some((x) => x.code === 'SOURCE_UNKNOWN' || x.code === 'NAT_UNKNOWN');
  let h = `<div class="wi4-q-hd">ΕΠΟΜΕΝΑ · ${unk ? '≥' : ''}${n}<span class="wi4-q-n">${_esc(_plural(red, 'urgent'))} · ${amb} προσοχή${m.loading ? ' · φορτώνει…' : ''}</span></div>`;
  if (!n) h += '<div class="wi4-qcard" style="cursor:default"><span class="wi4-l2">Τίποτα επείγον αυτή την εβδομάδα</span></div>';
  q.slice(0, 3).forEach((it, i) => {
    const btn = it.act === 'week' ? `W${it.week} →` : ACT_LABEL[it.act];
    h += `<div class="wi4-qcard ${it.level === 'red' ? 'wi4-r-red' : 'wi4-r-amb'}" role="button" tabindex="0" onclick="WIV2._qGo(${i})" onkeydown="if(event.key==='Enter'){event.preventDefault();WIV2._qGo(${i})}">` +
      (it.date ? `<span class="wi4-dc ${it.code === 'NO_TRUCK' ? 'red' : 'fut'}" style="cursor:inherit">${_esc(_dayLabel(it.date))}</span>` : '') +
      `<div class="wi4-qcard-t">${_ell('wi4-l1', it.text || it.code)}${it.sub ? _ell('wi4-l2', it.sub) : ''}</div>` +
      (btn ? `<button type="button" class="wi4-btn sm" onclick="event.stopPropagation();WIV2._qAct(${i})">${_esc(btn)}</button>` : '') + '</div>';
  });
  if (n > 3) h += `<button type="button" class="wi4-btn wi4-q-all" onclick="event.stopPropagation();WI4Actions.queuePanel()" aria-haspopup="dialog">Όλα ${unk ? '≥' : ''}${n} ▾</button>`;
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
  return `<div class="wi4-shelf"><div id="wi-shelf" class="wi-shelf" role="region" aria-label="Απόθεμα σε αποθήκες">${I.shelfInner(st)}</div></div>`;
}
function _colsHTML(m) {
  const lg = L();
  const met = m.metrics || {};
  return '<div class="wi4-cols" role="row">' +
    '<div class="wi4-c-idx"></div>' +
    '<div class="wi4-c-fl"><span class="wi4-ftog" role="button" tabindex="0" onclick="_wk3FeedTog(\'fl\')" title="Εθνικό σκέλος προς Βέροια — κλικ: άνοιγμα/κλείσιμο στήλης">‹ ΠΡΟΣ ΒΕΡΟΙΑ</span></div>' +
    `<div class="wi4-c-exp"><div class="wi4-leg"><span class="wi4-l-span" style="display:flex;justify-content:space-between"><span>ΕΞΑΓΩΓΗ <span class="wi4-n">· ${_esc(lg.plural(met.expN || 0, 'load'))} · ανά ημέρα εκφόρτωσης</span></span><span>ΠΑΛ.</span></span></div></div>` +
    '<div class="wi4-c-asg">ΑΝΑΘΕΣΗ · ΕΝΤΟΛΗ</div>' +
    `<div class="wi4-c-imp"><div class="wi4-leg"><span class="wi4-l-span" style="display:flex;justify-content:space-between"><span>ΕΙΣΑΓΩΓΗ <span class="wi4-n">· ${_esc(lg.plural(met.impN || 0, 'load'))}</span></span><span>ΠΑΛ.</span></span></div></div>` +
    '<div class="wi4-c-fr" style="text-align:right"><span class="wi4-ftog" role="button" tabindex="0" onclick="_wk3FeedTog(\'fr\')" title="Εθνική διανομή από Βέροια — κλικ: άνοιγμα/κλείσιμο στήλης">ΑΠΟ ΒΕΡΟΙΑ ›</span></div></div>';
}
function _relayBannerHTML() {
  const D = _D();
  if (!(D.relay && D.relay.state === 'err')) return '';
  // Same words as _wiPaint's banner (contract #6/#7, DESIGN.md Α7).
  return `<div class="wi4-banner" role="alert"><span>Οι τοπικές παραδόσεις/φορτώσεις δεν φορτώθηκαν — δεν σημαίνει ότι δεν υπάρχουν (${_esc(D.relay.err || 'σφάλμα ανάγνωσης')}). Οι παραγγελίες δεν επηρεάζονται· το «…με τοπικό οδηγό» μένει κλειστό ώσπου να φορτωθούν.</span><button type="button" class="wi4-link" onclick="WI_INTERNAL.relayReload()">↻ Ξαναδοκίμασε</button></div>`;
}
// Save failure line (§e.14). The old text after the client/route prefix is
// kept verbatim (its «#N» wording is Φ9 debt, §j.8).
function _msgHTML(oid) {
  const s = (_D()._syncLog || {})[oid];
  if (!s || s.state !== 'err' || !_q(oid)) return '';
  const tail = _rereadT ? 'η σειρά θα ξαναδιαβαστεί μόλις κλείσει ό,τι είναι ανοιχτό'
    : _rereadFailed ? 'δεν ξέρουμε τι γράφτηκε — Ανανέωση' : '';
  const text = `Δεν αποθηκεύτηκε — ${_loadLabel(oid)}${s.msg ? ': ' + s.msg : ''}${tail ? ' · ' + tail : ''}`;
  return `<div class="wi4-msg" role="alert" data-msg="${_q(oid)}"><span class="wi4-ell" title="${_esc(text)}">${_esc(text)}</span>` +
    `<button type="button" class="wi4-link" onclick="WIV2._retry('${_q(oid)}')">Ξαναδοκίμασε</button>` +
    (_rereadFailed ? '<button type="button" class="wi4-link" onclick="WI_INTERNAL.renderWeeklyIntl()">Ανανέωση</button>' : '') +
    `<button type="button" class="wi4-link" aria-label="Κλείσιμο" onclick="WIV2._msgClose('${_q(oid)}')">κλείσιμο ×</button></div>`;
}

// ═══ Presence (§e #18) — an indication, never a lock, never «κανείς» ═══════
function _presEnabled() {
  return typeof FEATURES !== 'undefined' && FEATURES && FEATURES.WI_PRESENCE === true && typeof WI4Presence !== 'undefined' && !WI4Presence.__wi4Placeholder;
}
function _presState() {
  if (!_presEnabled()) return { status: 'off', others: [], changes: null };
  try {
    const s = typeof WI4Presence.state === 'function' ? (WI4Presence.state() || {}) : {};
    const o = typeof WI4Presence.others === 'function' ? (WI4Presence.others() || []) : (s.others || []);
    return { status: s.status || 'off', others: Array.isArray(o) ? o.slice(0, 6) : [], changes: s.changes || null };
  } catch (e) { _logErr(e, 'wi4: presence state'); return { status: 'off', others: [], changes: null }; }
}
const _pName = (p) => String((p && (p.name || p.user_name || p.user)) || 'άλλος χρήστης');
function _presHTML() {
  const ps = _presState();
  if (ps.status === 'off') return '<div class="wi4-pres" id="wi4-pres"></div>';
  if (ps.status === 'forbidden') return '<div class="wi4-pres" id="wi4-pres"><span class="wi4-pres-t">Η ζωντανή εικόνα δεν είναι διαθέσιμη για τον ρόλο σου</span></div>';
  if (ps.status === 'paused') return '<div class="wi4-pres paused" id="wi4-pres"><span class="wi4-pres-t">Ζωντανή εικόνα σε παύση — δεν ξέρουμε ποιος άλλος είναι μέσα · ξαναδοκιμάζει</span></div>';
  const names = ps.others.map(_pName);
  const av = ps.others.map((p) => `<span class="wi4-av" title="${_esc(_pName(p))}">${_esc(_pName(p).trim().charAt(0).toUpperCase())}</span>`).join('');
  const t = (names.length ? names.join(', ') + ' · εδώ τώρα · ' : '') + '↻ ζωντανά';
  return `<div class="wi4-pres" id="wi4-pres">${av}<span class="wi4-pres-t" title="${_esc(t)}">${_esc(t)}</span></div>`;
}
function _presStart() {
  if (!_presEnabled() || _presOn) return;
  try { if (typeof WI4Presence.start === 'function') { WI4Presence.start({ week: _D().week, onChange: () => WIV2.presencePatch() }); _presOn = true; } }
  catch (e) { _logErr(e, 'wi4: presence start'); }
}
function _presStop() {
  if (!_presOn) return;
  _presOn = false;
  try { if (typeof WI4Presence !== 'undefined' && typeof WI4Presence.stop === 'function') WI4Presence.stop(); } catch (e) { _logErr(e, 'wi4: presence stop'); }
}
function _presCtx(record, action) {
  if (!_presEnabled() || typeof WI4Presence.setContext !== 'function') return;
  try {
    const f = _f(record);
    WI4Presence.setContext({ week: _D().week, record: _q(record) || null, part: record ? (f['Direction'] === 'Import' ? 'import' : 'export') : null, action: action || 'view' });
  } catch (e) { _logErr(e, 'wi4: presence context'); }
}
// #wi-popover lives inside #content and is re-created by every full paint, so
// the observer is re-attached at the end of every paint (disconnected first).
function _popWatch() {
  if (_popObs) { _popObs.disconnect(); _popObs = null; }
  if (!_presEnabled()) return;
  const pop = document.getElementById('wi-popover');
  if (!pop) return;
  let was = false;
  _popObs = new MutationObserver(() => {
    const open = pop.style.display === 'block';
    if (open === was) return;
    was = open;
    if (!open) { _presCtx(null, 'view'); return; }
    const m = /_p_(\d+)/.exec(pop.innerHTML || '');
    const row = m ? (_D().rows || []).find((r) => r.id === +m[1]) : null;
    _presCtx(row ? ((row.orderIds || [])[0] || row.orderId) : null, 'assign');
  });
  _popObs.observe(pop, { attributes: true, attributeFilter: ['style'], childList: true });
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
  _xwPrime();
  _pts.clear();
  const m = _compute();
  m.metrics = met;
  _m = m; _queue = m.queue;
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
  content.innerHTML = `<div class="wi4${fl}${fr}" data-week="${D.week}"><style>${I.css}</style>` +
    _barHTML(m) + _relayBannerHTML() + _qbandHTML(m) + _shelfWrapHTML() + _colsHTML(m) +
    `<div id="wi-rows">${rowsHTML}</div>` +
    '<div id="wi-ctx"></div><div id="wi-popover"></div><div id="wi-panel" class="wi-panel"></div></div>';
  window._wiDragging = null;   // as _wiPaint: a repaint ends any drag
  document.body.classList.add('wi4-on');
  _install();
  _layout(false);
  _afterRows();
  try { I.shelfFit(); } catch (_) {}
  _popWatch();
  _presStart();
  const a = A(); if (a && typeof a.attach === 'function') a.attach();
  // First paint of a week: open where the work is (the first day with a red
  // reason, else today) — once, so a repaint never moves the user.
  if (_scrolledWeek !== D.week) {
    _scrolledWeek = D.week;
    const target = lg.openDay(m.days.map((d) => ({ date: d.date, facts: d.facts || [] })), today);
    const sec = target && document.querySelector('#content .wi4 .wi4-day[data-day="' + target + '"]');
    if (sec && sec.scrollIntoView) { try { sec.scrollIntoView({ block: 'start' }); } catch (_) {} }
  }
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
  window.addEventListener('resize', () => {
    if (!_live()) return;
    clearTimeout(_resizeT);
    _resizeT = setTimeout(() => { if (!_live()) return; _layout(true); try { W().shelfFit(); } catch (_) {} }, 150);
  });
  // «Ενημερώθηκε πριν N΄» stays true, and leaving the page drops the v4 body
  // class and the presence beats (the router has no leave hook).
  _tickT = setInterval(() => {
    if (!_live()) { _cleanup(); return; }
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
function _cleanup() {
  try { document.body.classList.remove('wi4-on'); } catch (_) {}
  _presStop();
  if (_popObs) { _popObs.disconnect(); _popObs = null; }
}

// ═══ W+1 read (§e #1/#2, §d.2a) ═════════════════════════════════════════
function _xwPrime() {
  const I = W(), D = _D();
  if (D.week !== I.currentWeek()) { _xw = null; return; }
  const key = D.week + '|' + (D._loadedAt instanceof Date ? D._loadedAt.getTime() : '');
  if (_xw && _xw.key === key) return;
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
    if (el) el.innerHTML = _dayCountHTML(d);
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
    e.facts = [];
    const oid = (row.orderIds || [])[0] || row.orderId;
    e.facts.push({ oid, f: factsOf(row), row });
    if (row.importId) e.facts.push({ oid: row.importId, f: _impFacts(row), row });
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
    else if (wrap) { const box = wrap.querySelector('#wi-shelf'); if (box) box.innerHTML = I.shelfInner(st); }
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
  _refresh();
}
/** §e.14: ONLY records and redraws — never _wiBuildRows, never a WINTL.data
 *  write, never a full paint. The re-read waits for the action to settle. */
function onSync(oid, state, msg) {
  if (!_live() || !oid) return;
  try {
    const old = document.querySelector('#content .wi4 [data-msg="' + _q(oid) + '"]');
    if (state === 'err') {
      _scheduleReread();
      const html = _msgHTML(oid);
      if (old) old.outerHTML = html;
      else { const el = _rowEl(oid); if (el && html) el.insertAdjacentHTML('afterend', html); }
    } else if (old && state !== 'pend') old.remove();
    const u = document.getElementById('wi4-upd'); if (u) u.outerHTML = _updHTML();
  } catch (e) { _logErr(e, 'wi4: onSync'); }
}
function _canReread() {
  const D = _D();
  if (Object.values(D._syncLog || {}).some((s) => s && s.state === 'pend')) return false;
  const shown = (id) => { const el = document.getElementById(id); return !!(el && el.style.display === 'block'); };
  if (shown('wi-popover') || shown('wi-panel') || shown('wi-ctx')) return false;
  const a = A(); if (a && typeof a.isOpen === 'function' && a.isOpen()) return false;
  const mo = document.getElementById('modalOverlay');
  if ((mo && mo.classList.contains('open')) || document.querySelector('.mf-overlay')) return false;
  if (window._wiPendingMatch) return false;
  return typeof currentPage !== 'undefined' && currentPage === 'weekly_intl';
}
function _scheduleReread() {
  if (_rereadT) return;
  const tick = () => {
    _rereadT = null;
    if (!WIV2.active()) return;            // another page: never overwrite its #content
    if (!_canReread()) { _rereadT = setTimeout(tick, 1500); return; }
    const D = _D(), before = D._loadedAt;
    Promise.resolve(W().renderWeeklyIntl()).then(() => {
      // renderWeeklyIntl swallows its own errors (error card): an unchanged
      // _loadedAt means the re-read did not land, so the line must say we do
      // not know what was written — a clean row is never shown.
      _rereadFailed = D._loadedAt === before;
      if (_rereadFailed && _live()) Object.keys(D._syncLog || {}).forEach((o) => onSync(o, (D._syncLog[o] || {}).state, (D._syncLog[o] || {}).msg));
    }).catch((e) => { _rereadFailed = true; _logErr(e, 'wi4: re-read after a failed save'); });
  };
  _rereadT = setTimeout(tick, 1500);
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
  if (D._syncLog) delete D._syncLog[oid];
  const el = document.querySelector('#content .wi4 [data-msg="' + _q(oid) + '"]');
  if (el) el.remove();
  const r = (D.rows || []).find((x) => ((x.orderIds || [])[0] || x.orderId) === oid);
  const s = r && document.getElementById('wi-sync-' + r.id);
  if (s) { s.className = 'wi-sync'; s.textContent = ''; s.title = ''; }
  const u = document.getElementById('wi4-upd'); if (u) u.outerHTML = _updHTML();
}
function feedTog(side) {
  const root = _root(); if (!root || !_live()) return;
  const off = _ls('tms_wk3_' + side) === '0';
  root.classList.toggle(side === 'fl' ? 'wi4-fl-off' : 'wi4-fr-off', off);
  const m = document.getElementById('wi4-view'); if (m) m.innerHTML = _viewMenuHTML();
  _layout(true);
}
/** The three `if(res?.conflict)` branches (§a.4), in this order: the slot
 *  leaves ⟳, the popover closes, the screen goes back to server truth, and
 *  only then «Ποια κρατάμε;». Closing the dialog = keep what is on screen. */
async function conflict(res, ctx) {
  const c = ctx || {};
  const I = W();
  try { if (c.slot) I.sync(c.slot, ''); } catch (e) { _logErr(e, 'wi4 conflict: slot'); }
  try { I.closePopover(); } catch (e) { _logErr(e, 'wi4 conflict: popover'); }
  try { await I.renderWeeklyIntl(); } catch (e) { _logErr(e, 'wi4 conflict: re-read'); }
  const a = A();
  if (!a || typeof a.conflictDialog !== 'function') {
    if (typeof toast === 'function') toast('Η εγγραφή άλλαξε από άλλον χρήστη — δείχνουμε την τρέχουσα', 'warn');
    return;
  }
  const choice = await a.conflictDialog(res || {}, { orderId: c.orderId, kind: c.kind === 'match' ? 'match' : 'assign' });
  if (choice !== 'reopen' || !_live()) return;
  // Reopen on the fresh truth, the row resolved by ORDER id now (§f).
  const id = rowIdOf(c.orderId);
  const row = id == null ? null : (_D().rows || []).find((r) => r.id === id);
  const el = row ? _rowEl(c.orderId) : null;
  const box = el && (el.querySelector('.wi4-asg .wi4-box') || el);
  if (!row || !box) { if (typeof toast === 'function') toast('Η σειρά δεν βρίσκεται πια στον πίνακα — ανανέωσε', 'warn'); return; }
  const ev = { currentTarget: box, target: box, stopPropagation() {}, preventDefault() {} };
  if (row.type === 'import') I.openImpPopover(ev, row.orderId, row.id); else I.openPopover(ev, row.id);
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
      if (!hit) { if (no.dataset.p) { no.textContent = cell.dataset.no || ''; delete no.dataset.p; no.removeAttribute('title'); } return; }
      const at = hit.since ? new Date(hit.since) : null;
      const hm = at && !isNaN(at) ? at.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      no.innerHTML = `<span class="wi4-av sm">${_esc(hit.name.trim().charAt(0).toUpperCase())}</span>`;
      no.title = [hit.name, PRES_ACTION[hit.action] || PRES_ACTION.view, hm ? 'από ' + hm : ''].filter(Boolean).join(' · ');
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
  if (it.act === 'week') { _D().week = it.week; W().renderWeeklyIntl(); return; }
  const a = A(); if (a && typeof a._queueAct === 'function') a._queueAct(it);
}

const WIV2 = {
  _broken: false,
  active, paint, repaintRow, shelfPaint, onSync, feedTog, conflict, switchHTML,
  rowIdOf, presencePatch, noteMove, factsOf, search, queueItems, rowOrder, focusRow, searchFocus,
  // Inline-handler seams (not part of the frozen contract).
  _switch, _dayTog, _more, _qGo, _qAct, _searchKey, _status, _retry, _msgClose,
};
window.WIV2 = WIV2;
})();
