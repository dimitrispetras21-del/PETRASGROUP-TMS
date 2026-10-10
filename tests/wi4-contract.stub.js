// ═══════════════════════════════════════════════════════════════════════
// Weekly International v4 — FROZEN CONTRACT (WP0)
// ─────────────────────────────────────────────────────────────────────
// Spec: docs/weekly-intl-redesign/TECH_DESIGN.md §a.1, §a.4–a.6, §e, §e.9,
// §e.14, §f, §g.3, §g.4.
//
// Why this file exists: tonight's packages are built in parallel by different
// agents, and the seams between them (WI_INTERNAL ← WP2, WIV2 ← WP4,
// WI4Actions ← WP5, core/api.js opts ← WP6) form a cycle — WIV2.conflict calls
// WI4Actions.conflictDialog, WI4Actions.openRowMenu calls WIV2.rowIdOf. Prose
// drifts; a file with a test does not. tests/wi4-contract.test.js checks every
// real module against the names and DECLARED arity below.
//
// Rules:
//   - A signature change is a COORDINATOR commit to this file, never a silent
//     drift inside one package.
//   - "Declared arity" = the number of parameters written in the definition,
//     defaults and rest included (NOT Function.length, which stops at the
//     first default: `_atRetry(fn, retries = 3, opts)` has declared arity 3).
//   - Every function here is a no-op that returns the INERT value of its type,
//     so WP2/WP4/WP5/WP6 unit tests can require() this file and wire it in
//     place of a package that is not built yet.
//   - Values (not functions) are listed in VALUES with their typeof.
//
// Usage from a test:
//   const C = require('./wi4-contract.stub.js');
//   ctx.WI_INTERNAL = C.WI_INTERNAL; ctx.WIV2 = C.WIV2; ...
// ═══════════════════════════════════════════════════════════════════════
'use strict';

// ─── Shared shapes (JSDoc only) ────────────────────────────────────────
/**
 * @typedef {Object} WiRow            A row of WINTL.rows, built by _wiBuildRows
 *   (origin/main 793). `id` is a per-build sequence: an old id can point to a
 *   DIFFERENT row after any rebuild, so async v4 code stores ORDER ids and
 *   re-resolves with WIV2.rowIdOf at click time (§f).
 * @typedef {'Loading DateTime'|'Delivery DateTime'|'VS CD Date'} WiDateField
 * @typedef {Object} WiConflict       What a 409 conflict carries (§g.2/§g.3).
 * @property {string[]} fields        labels that differ, in the caller's labels
 * @property {string|'user'|'auto'|null} by  username only for AUDIT_READERS;
 *   'user' = another user (name hidden); 'auto' = trigger/migration; null = unknown
 * @property {string|null} at         ISO time of the change, or null
 * @property {Object<string,*>} current  server values of the checked labels
 * @typedef {{conflict:true} & WiConflict} WiConflictResult  atSafePatch's return
 *   value on a conflict — the shape the three existing `if(res?.conflict)`
 *   branches of weekly_intl.js already handle.
 * @typedef {Object} WiQueueItem      §d.3
 * @property {string} code            WI4.flags reason code (NO_TRUCK, …)
 * @property {'red'|'amber'} level
 * @property {'stop'|'cost'|'look'} group
 * @property {string|null} date       YYYY-MM-DD
 * @property {number} age
 * @property {string} key             order id (tie-break; never fetch order)
 * @property {string|null} rowKey     order id of the row it scrolls to
 * @property {string} act             the one card action
 */

// ─── WI_INTERNAL (WP2) — §a.6 ──────────────────────────────────────────
// Added once at the END of the IIFE of modules/weekly_intl.js, exactly as
//   window.WI_INTERNAL = Object.freeze({ key: _identifier, … });
// with every entry a DIRECT reference to the identifier in ORIGIN (no
// wrappers, no arrow functions): the contract test reads the arity from the
// identifier's own definition, and a wrapper would hide a signature change.
// v4 never calls an underscore function through window.* (§a.6).

/** Origin identifier in modules/weekly_intl.js for every WI_INTERNAL key. */
const WI_INTERNAL_ORIGIN = Object.freeze({
  // State and data
  WINTL: 'WINTL', renderWeeklyIntl: 'renderWeeklyIntl', buildRows: '_wiBuildRows',
  boardImpRows: '_wiBoardImpRows', pendingExps: '_wiPendingExps',
  jumpFirstPendingExp: '_wiJumpFirstPendingExp', gaps: '_wk3Gaps',
  paintMetrics: '_wiPaintMetrics', crossWeekIncoming: '_wiCrossWeekIncoming',
  moreStops: '_wk3MoreStops', css: '_WI2_CSS',
  // Reading helpers
  currentWeek: '_wiCurrentWeek', weekStart: '_wiWeekStart', weekRange: '_wiWeekRange',
  fmt: '_wiFmt', raw: '_wiRaw', clean: '_wiClean', stFlags: '_wk3StFlags', vsCd: '_wk3VsCd',
  arr: '_wk3Arr', locs: '_wk3Locs', split: '_wi2Split', flatLocName: '_wiFlatLocName',
  placeStr: '_wiPlaceStr', clientName: '_wiClientName', grpOrder: '_wiGrpOrder',
  giSortRecs: '_wiGiSortRecs', sameDayConflict: '_wiSameDayConflict', busy: '_wk3Busy',
  weekOf: '_wiWeekOf', relayIdsOfRow: '_wiRelayIdsOfRow', legPidsOfRow: '_wiLegPidsOfRow',
  impIdsOf: '_wiImpIdsOf', relayById: '_wiRelayById', relayTip: '_wiRelayTip',
  relayOrder: '_wiRelayOrder', impGroupRowOf: '_wiImpGroupRowOf', recOf: '_wiRecOf',
  isPiece: '_wiIsPiece', isLot: '_wiIsLot', lotHeld: '_wiLotHeld', stockOn: '_wiStockOn',
  stockSkip: '_wiStockSkip', shelved: '_wiShelved', loose: '_wiLoose', pieceIn: '_wiPieceIn',
  lotState: '_wiLotState', shelfLots: '_wiShelfLots', looseLate: '_wiLooseLate',
  shelfHas: '_wiShelfHas', apBadge: '_wiApBadge', lotBadge: '_wiLotBadge', apTip: '_wiApTip',
  stockGapLink: '_wiStockGapLink',
  // Assignment and dates
  openPopover: '_wiOpenPopover', openImpPopover: '_wiOpenImpPopover',
  closePopover: '_wiClosePopover', saveFromPopover: '_wiSaveFromPopover', clear: '_wiClear',
  dateWrite: '_wiDateWrite', pickDate: '_wk3PickDate',
  // Drag and drop
  dropOnRow: '_wiDropOnRow', dropImport: '_wiDropImport', impDragStart: '_wiImpDragStart',
  impDragEnd: '_wiImpDragEnd', dragImpId: '_wiDragImpId', segDragStart: '_wiSegDragStart',
  segDragOver: '_wiSegDragOver', segDrop: '_wiSegDrop', segDragEnd: '_wiSegDragEnd',
  // Matching and groups
  saveImportMatch: '_wiSaveImportMatch', unmatch: '_wiUnmatch', unmatchRow: '_wiUnmatchRow',
  newImport: '_wiNewImport', impJoin: '_wiImpJoin', cancelGroupMember: '_wiCancelGroupMember',
  toggleGroup: '_wiToggleGroup', rota: '_wiRota', rotUnlink: '_wiRotUnlink',
  // Order form
  edit: '_wk3Edit',
  // Print and export
  print: '_wiPrint', printImp: '_wiPrintImp', printGroup: '_wiPrintGroup',
  printImpGroup: '_wiPrintImpGroup', menuPrint: '_wiMenuPrint', printWeek: '_wiPrintWeek',
  exportCSV: '_wiExportCSV', fullscreen: '_wiFullscreen',
  // Relays
  relayOpen: '_wiRelayOpen', relayGrpToggle: '_wiRelayGrpToggle', relayReload: '_wiRelayReload',
  // Stock
  stockLoad: '_wiStockLoad', stockPrime: '_wiStockPrime', stockLotsOpen: '_wiStockLotsOpen',
  stockLotOpen: '_wiStockLotOpen', stockLooseOpen: '_wiStockLooseOpen',
  stockOpenPiece: '_wiStockOpenPiece', shelfInner: '_wiShelfInner', shelfFit: '_wiShelfFit',
  shelfWheel: '_wiShelfWheel',
  // Creation
  newOrder: '_wiNewOrder', scan: '_wiScan', preorder: '_wiPreorder',
  // Menus
  ctxClose: '_wiCtxClose', ctxShow: '_wiCtxShow', leaveFs: '_wiLeaveFs', anchorFor: '_wiAnchorFor',
  blockReadOnly: '_wiBlockReadOnly',
  // Menu item builders (new, §a.5): the item-building half of each old opener
  ctxItems: '_wiCtxItems', impCtxItems: '_wiImpCtxItems', segCtxItems: '_wiSegCtxItems',
  preCtxItems: '_wiPreCtxItems', lotCtxItems: '_wiLotCtxItems', legCtxItems: '_wiLegCtxItems',
  relayCtxItems: '_wiRelayCtxItems', splitHeaderCtxItems: '_wiSplitHeaderCtxItems',
  // Sync state
  sync: '_wiSync', expectOpt: '_wiExpectOpt',
});

const resolved = (v) => Promise.resolve(v);

const WI_INTERNAL = {
  // ── State and data ──
  /** The board state object (origin 33). Not a function. */
  WINTL: { week: 0, data: { exports: [], imports: [], trucks: [], trailers: [], drivers: [], partners: [] }, rows: [], ui: {}, filter: '', filterStatus: '' },
  /** Full load + build + paint (origin 616). @returns {Promise<void>} */
  renderWeeklyIntl() { return resolved(undefined); },
  /** Rebuilds WINTL.rows; resets row ids. NEVER called by v4 code (§f). */
  buildRows() {},
  /** @returns {WiRow[]} import rows drawn on the board (origin 1079) */
  boardImpRows() { return []; },
  /** @returns {WiRow[]} (origin 1058) */
  pendingExps() { return []; },
  jumpFirstPendingExp() {},
  /** @returns {Array} (origin 1038) */
  gaps() { return []; },
  /** NEW (§a.5): the top of _wiPaint, same reportPageMetrics side effect.
   *  @returns {{expRows:WiRow[], impRows:WiRow[], impPlan:*, metrics:Object}} */
  paintMetrics() { return { expRows: [], impRows: [], impPlan: null, metrics: {} }; },
  /** NEW (§a.5): the T4 W+1 fetch. ok:false = W+1 unknown (a queue item, §e #2).
   *  @param {number} week @returns {Promise<{recs:Array, ok:boolean}>} */
  crossWeekIncoming(week) { return resolved({ recs: [], ok: true }); },
  /** Full stop list popup, today's «+N» (origin 1946). */
  moreStops(str, arr, kind) {},
  /** _WI2_CSS (origin 212). Not a function. */
  css: '',

  // ── Reading helpers (logic, no v1 markup) ──
  currentWeek() { return 0; },
  weekStart(w) { return null; },
  weekRange(w) { return ''; },
  fmt(s) { return ''; },
  raw(s) { return ''; },
  clean(s) { return ''; },
  stFlags(f) { return {}; },
  vsCd(f, dir) { return null; },
  arr(str, arr) { return []; },
  locs(str) { return []; },
  split(str) { return []; },
  flatLocName(linkVal) { return ''; },
  placeStr(f, kind) { return ''; },
  clientName(f) { return ''; },
  grpOrder(exps, fallbackField) { return []; },
  giSortRecs(recs) { return []; },
  /** @returns {string|null} the existing same-day clash sentence */
  sameDayConflict(row) { return null; },
  busy() { return {}; },
  weekOf(dt) { return null; },
  relayIdsOfRow(row) { return []; },
  legPidsOfRow(row) { return []; },
  impIdsOf(importId) { return []; },
  relayById(oid, relayId) { return null; },
  relayTip(x) { return ''; },
  relayOrder(oid) { return []; },
  impGroupRowOf(oid) { return null; },
  recOf(id) { return null; },
  isPiece(f) { return false; },
  isLot(f) { return false; },
  lotHeld(row) { return false; },
  stockOn() { return false; },
  stockSkip(row) { return false; },
  shelved(row) { return false; },
  loose(f) { return false; },
  pieceIn(ids) { return false; },
  lotState(l, today) { return null; },
  shelfLots(st) { return []; },
  looseLate(p, today) { return false; },
  shelfHas(st) { return false; },
  apBadge(f, oid) { return ''; },
  lotBadge(f) { return ''; },
  apTip(f) { return ''; },
  stockGapLink(row) { return ''; },

  // ── Assignment and dates (called, never copied) ──
  /** Reads e.currentTarget.getBoundingClientRect(): from a key or a queue card
   *  pass {currentTarget: assignBoxEl, stopPropagation(){}, preventDefault(){}} (§d.4). */
  openPopover(e, rowId) {},
  openImpPopover(e, impId, rowId) {},
  closePopover() {},
  saveFromPopover(rowId) { return resolved(undefined); },
  clear(rowId) { return resolved(undefined); },
  /** NEW (§a.5): the inp.onchange body of _wk3PickDate. Same atSafePatch +
   *  invalidateCache + syncOrderDownstream as today; carries _expect only when
   *  v4 is active (via expectOpt).
   *  @param {string} orderId @param {WiDateField} field @param {string|null} curIso
   *  @param {string} ymd YYYY-MM-DD @param {string} [hhmm] HH:MM (none for VS CD Date)
   *  @returns {Promise<{ok:boolean, rec?:Object, conflict?:WiConflictResult}>} */
  dateWrite(orderId, field, curIso, ymd, hhmm) { return resolved({ ok: false }); },
  pickDate(ev, orderId, field, curIso) {},

  // ── Drag and drop (§f) ──
  dropOnRow(e, rowId) { return resolved(undefined); },
  dropImport(e, rowId) { return resolved(undefined); },
  impDragStart(e, impId, allowMatched) {},
  impDragEnd() {},
  /** @returns {string} the import id carried in dataTransfer, or '' */
  dragImpId(e) { return ''; },
  segDragStart(e, rowId, orderId) {},
  segDragOver(e, rowId, orderId) {},
  segDrop(e, rowId, orderId) { return resolved(undefined); },
  segDragEnd(e) {},

  // ── Matching and groups ──
  saveImportMatch(rowId, impId) { return resolved(undefined); },
  unmatch(impId) { return resolved(undefined); },
  unmatchRow(rowId) { return resolved(undefined); },
  newImport(rowId) {},
  impJoin(loadOid, expOid, xOid, palOk) { return resolved(undefined); },
  cancelGroupMember(rowId, orderId, isImportSide, ask) { return resolved(undefined); },
  toggleGroup(rowId) {},
  rota(rowId) {},
  rotUnlink(e, legOid, skipConfirm) { return resolved(undefined); },

  // ── Order form ──
  /** Opens the order form — the name click, the O key and «Άνοιγμα παραγγελίας». */
  edit(orderId) {},

  // ── Print and export ──
  print(rowId, leg) {},
  printImp(impId, hasPartner) {},
  printGroup(rowId) {},
  printImpGroup(rowId) {},
  menuPrint(rowId, isImp) {},
  printWeek() {},
  exportCSV() {},
  fullscreen() {},

  // ── Relays ──
  relayOpen(oid, relayId) {},
  relayGrpToggle(gk) {},
  relayReload() { return resolved(undefined); },

  // ── Stock ──
  stockLoad() {},
  stockPrime() {},
  stockLotsOpen(anchor) { return resolved(undefined); },
  stockLotOpen(anchor, lotRec) { return resolved(undefined); },
  stockLooseOpen(anchor) { return resolved(undefined); },
  stockOpenPiece(id) {},
  /** @returns {string} the strip HTML for <div id="wi-shelf"> */
  shelfInner(st) { return ''; },
  shelfFit() {},
  shelfWheel(e, el) {},

  // ── Creation ──
  newOrder() {},
  scan() {},
  preorder() {},

  // ── Menus ──
  ctxClose() {},
  /** Places and shows #wi-ctx with the given HTML (origin 7058). */
  ctxShow(e, html, h) {},
  leaveFs(e) { return resolved(undefined); },
  anchorFor(rowId) { return null; },
  /** Today's read-only gate. v4 calls it exactly where the old opener does,
   *  and nowhere else (no new role gates). @returns {boolean} true = blocked */
  blockReadOnly() { return false; },

  // ── Menu item builders (NEW, §a.5) — HTML strings of .wi-ctx-i buttons,
  //    the same HTML the old openers show ──
  ctxItems(row) { return ''; },
  impCtxItems(row, matchedExportRowId) { return ''; },
  segCtxItems(rowId, orderId, isImp) { return ''; },
  preCtxItems(row) { return ''; },
  lotCtxItems(row, isImp) { return ''; },
  legCtxItems(legOid) { return ''; },
  relayCtxItems(relayId, oid) { return ''; },
  splitHeaderCtxItems(row) { return ''; },

  // ── Sync state ──
  /** id = 'wi-sync-'+rowId; state 'pend'|'ok'|'err'|'' (origin 2293). */
  sync(id, state, msg) {},
  /** NEW (§a.5/§g.4): the opts argument of the first PATCH of a decision write.
   *  undefined when v4 is inactive, when the record is not in WINTL.data, or
   *  when no label is checked — then the request is byte-identical to today.
   *  Reads WINTL.data (server truth), never the optimistic row.* fields.
   *  @param {string} orderId @param {string[]} fields labels
   *  @returns {{expect:Object<string,*>}|undefined} */
  expectOpt(orderId, fields) { return undefined; },
};

// ─── WIV2 (WP4) — modules/weekly_intl_v2.js ────────────────────────────
// Defined as window.WIV2 inside an IIFE. Not frozen: _broken is written.
const WIV2 = {
  /** Sticky fallback (§a.4): set true once paint() fails; active() is then
   *  false until reload, so every hook routes to v1 against v1 DOM. */
  _broken: false,
  /** True only when the §b decision is v4 AND _broken !== true AND
   *  currentPage === 'weekly_intl'. Never throws. @returns {boolean} */
  active() { return false; },
  /** Builds #content.innerHTML from WINTL (+ one layout pass), re-attaches the
   *  #wi-popover observer and attaches v4 listeners (WI4Actions.attach).
   *  NEVER throws: on failure sets _broken, shows the banner once, sends one
   *  logError and returns false so _wiPaint paints the old board.
   *  @returns {boolean} false = failed */
  paint() { return false; },
  /** Repaint one row in place (hook in _wiRepaintRow). @param {number} rowId */
  repaintRow(rowId) {},
  /** Repaint the stock strip (hook in _wiShelfPaint). */
  shelfPaint() {},
  /** Hook in _wiSync (§e.14): ONLY records and redraws the title-bar counter
   *  and the 24px message line of that order. Never _wiBuildRows, never
   *  replaces a WINTL.data record, never a full paint.
   *  @param {string|null} oid @param {'pend'|'ok'|'err'|''} state @param {string} [msg] */
  onSync(oid, state, msg) {},
  /** Hook at the end of _wk3FeedTog. @param {'fl'|'fr'} side */
  feedTog(side) {},
  /** Hook in the three `if(res?.conflict)` branches (§a.4), in this order:
   *  _wiSync(ctx.slot,'') → closePopover → await renderWeeklyIntl() →
   *  WI4Actions.conflictDialog(res, ctx); on 'reopen' reopens the popover for
   *  ctx.orderId on fresh truth.
   *  @param {WiConflictResult} res
   *  @param {{slot:string, orderId:string, kind:'match'|'assign'}} ctx
   *  @returns {Promise<void>} */
  conflict(res, ctx) { return resolved(undefined); },
  /** Mast switch markup (§b): '' unless the flag allows a switch. Inserted
   *  inline in _wiPaint's mast, so '' must add no whitespace. @returns {string} */
  switchHTML() { return ''; },
  /** Re-resolves the CURRENT row id of an order at click time (§f).
   *  @param {string} orderId @returns {number|null} */
  rowIdOf(orderId) { return null; },
  /** Presence beat result → avatar strip, index cells (data-oid) and the note
   *  in an open panel only. NEVER paint() (§e #18). */
  presencePatch() {},
  /** Before a v4 date save's renderWeeklyIntl(): remember where the row was,
   *  for the 10 s «↓ Πήγε στην …» trace (§e #15).
   *  @param {string} oid @param {string} oldDay YYYY-MM-DD @param {string} label */
  noteMove(oid, oldDay, label) {},
  /** Impure facts of a row for WI4.flags (§d.2). @param {WiRow} row @returns {Object} */
  factsOf(row) { return {}; },
  /** Search 1/N (§e #16): dims non-matching rows; '' clears. Stored in WINTL.filter.
   *  @param {string} q @returns {{count:number, index:number}} */
  search(q) { return { count: 0, index: 0 }; },
  // ── WP4 ↔ WP5 seam (§e #3, #17): the queue panel and the keyboard live in
  //    WP5 but the rows, the queue and the search box are drawn by WP4. ──
  /** The ordered queue the band shows (WI4.queue output, §d.3) — the «Όλα N ▾»
   *  panel and Q read the SAME list. @returns {WiQueueItem[]} */
  queueItems() { return []; },
  /** Order ids of the drawn rows in visual order, for ↑/↓. @returns {string[]} */
  rowOrder() { return []; },
  /** Scroll to the order's row, highlight it and keep WINTL.ui.v4Focus = orderId.
   *  @param {string} orderId @returns {boolean} false = not on this board */
  focusRow(orderId) { return false; },
  /** Focus the search box (the / key). */
  searchFocus() {},
};

// ─── WI4Actions (WP5) — modules/wi4_actions.js ─────────────────────────
const WI4Actions = {
  /** Per-load menu inside the existing #wi-ctx (§e.9): rowIdOf → blockReadOnly
   *  where _wiCtx calls it → item builders → moved <button> nodes → dedupe by
   *  onclick → sections by handler → «Άνοιγμα παραγγελίας» first per load.
   *  @param {Event} e @param {string} orderId @returns {Promise<void>} */
  openRowMenu(e, orderId) { return resolved(undefined); },
  /** Date panel (§e #10) with the field switch Φόρτωση · Εκφόρτωση · Βέροια.
   *  Stores orderId, field and the curIso read from WINTL.data at open; saves
   *  through WI_INTERNAL.dateWrite. While open, a capture-phase window keydown
   *  listener owns ←/→/Esc (§d.4) and is removed on close.
   *  @param {string} orderId @param {WiDateField} field @param {Element} anchorEl */
  datePanel(orderId, field, anchorEl) {},
  /** «Ποια κρατάμε;» (§g.4). Pure UI: returns the choice, the caller acts.
   *  Closing in any way (Esc, ×, outside click) = 'keep'. Every value through
   *  escapeHtml; the name only when conflict.by is a username.
   *  @param {WiConflict} conflict
   *  @param {{orderId:string, kind:'date'|'assign'|'match', mine?:Object<string,*>}} ctx
   *  @returns {Promise<'keep'|'mine'|'reopen'>} 'mine' only for kind 'date',
   *    'reopen' only for 'assign'/'match' */
  conflictDialog(conflict, ctx) { return resolved('keep'); },
  /** «Όλα N ▾» panel (§e #3) over WIV2.queueItems(): ΤΩΡΑ / ΠΡΟΣΟΧΗ, Q = next, Esc closes. */
  queuePanel() {},
  /** Runs one WI4.keyAction result with the same openers as clicks (§e #17).
   *  @param {string} action e.g. 'rowNext', 'menu', 'assign', 'date', 'help' */
  run(action) {},
  /** Idempotent: installs the v4 document listeners (keyboard), each guarded by
   *  `if(!WIV2.active()||!document.querySelector('#content .wi4')) return;`.
   *  Called by WIV2.paint(), NEVER at load (§b step 6). */
  attach() {},
  /** True while a v4 overlay is open: date panel, queue panel, conflict dialog
   *  or the «?» sheet — for the §e.14 re-read debounce and the keyboard state.
   *  @returns {boolean} */
  isOpen() { return false; },
};

// ─── core/api.js opts shapes (WP6) — §g.3 ──────────────────────────────
// Top-level functions of core/api.js. Without opts every request stays
// byte-identical to today; other pages never pass opts.
const API = {
  /** opts.expect → body {fields, typecast:true, _expect}. On a 409 whose JSON
   *  has error.type==='conflict': throws Error('conflict') with
   *  e.conflict = WiConflict and e._noRetry = true; no toast; one logError.
   *  The offline queue drops _expect (a later replay would compare stale).
   *  @param {string} tableId @param {string} recId @param {Object} fields
   *  @param {{expect?:Object<string,*>}} [opts] @returns {Promise<Object>} */
  atPatch(tableId, recId, fields, opts) { return resolved({}); },
  /** With opts.expect: skips the dormant version check and calls
   *  atPatch(…, opts); a conflict becomes the RETURN value WiConflictResult.
   *  @param {string} tableId @param {string} recId @param {Object} fields
   *  @param {{expect?:Object<string,*>}} [opts]
   *  @returns {Promise<Object|WiConflictResult>} */
  atSafePatch(tableId, recId, fields, opts) { return resolved({}); },
  /** opts.conflict === true → a 409 returns immediately: no retry, no toast.
   *  Without it a 409 behaves as today.
   *  @param {Function} fn @param {number} [retries] @param {{conflict?:boolean}} [opts] */
  _atRetry(fn, retries, opts) { return resolved(undefined); },
};

/** Non-function members and their typeof. */
const VALUES = Object.freeze({
  WI_INTERNAL: Object.freeze({ WINTL: 'object', css: 'string' }),
  WIV2: Object.freeze({ _broken: 'boolean' }),
  WI4Actions: Object.freeze({}),
  API: Object.freeze({}),
});

/** Where each part lives and who builds it. */
const META = Object.freeze({
  WI_INTERNAL: Object.freeze({ owner: 'WP2', file: 'modules/weekly_intl.js', global: 'WI_INTERNAL' }),
  WIV2: Object.freeze({ owner: 'WP4', file: 'modules/weekly_intl_v2.js', global: 'WIV2' }),
  WI4Actions: Object.freeze({ owner: 'WP5', file: 'modules/wi4_actions.js', global: 'WI4Actions' }),
  API: Object.freeze({ owner: 'WP6', file: 'core/api.js', global: null }),
});

/** The four new files, in app.html load order, with the one global each defines (§a.1). */
const NEW_FILES = Object.freeze([
  Object.freeze({ file: 'core/wi4-logic.js', global: 'WI4', after: 'core/relay.js', owner: 'WP1' }),
  Object.freeze({ file: 'core/wi4-presence.js', global: 'WI4Presence', after: 'core/wi4-logic.js', owner: 'WP7' }),
  Object.freeze({ file: 'modules/weekly_intl_v2.js', global: 'WIV2', after: 'modules/weekly_intl.js', owner: 'WP4' }),
  Object.freeze({ file: 'modules/wi4_actions.js', global: 'WI4Actions', after: 'modules/weekly_intl_v2.js', owner: 'WP5' }),
]);

module.exports = { WI_INTERNAL, WI_INTERNAL_ORIGIN, WIV2, WI4Actions, API, VALUES, META, NEW_FILES };
