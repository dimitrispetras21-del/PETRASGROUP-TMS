// ═══════════════════════════════════════════════════════════════════════
// WEEKLY NATIONAL v4 — pure logic (global WN4)
// ─────────────────────────────────────────────────────────────────────
// Spec: docs/weekly-natl-redesign/PLAN.md (rev 6) §3.5, §4.3, §2.4, §6.1.
// Owner: WP4. Only this file and tests/wn4-logic.test.js belong to WP4.
//
// Facts → flags, in the national board's words. Plain functions on plain
// objects: no DOM, no WNATL, no fetch, no Date.now() (today and now are
// arguments), so the row rail, the day header and the queue read ONE rule
// each (principle 3) and node --test proves them without a browser. The same
// file loads as a browser global and as a node module, like core/wi4-logic.js.
//
// At load it only defines WN4: no listener, timer, observer or fetch.
//
// What it reuses instead of copying (PLAN §4.3 «μεταφέρεται, δεν αντιγράφεται»):
//   core/vs-dates.js  — cdOf, vsNatDates, vsHubBad, day (the one Veroia rule)
//   core/wi4-logic.js — dayDiff, dayLabel, queue, keyAction (engine)
//   core/orders-common.js — deliveredByDate (the computed «delivered»)
// They are looked up when a function runs, never at load, so the script order
// in app.html (WP0) only has to put those three before the first paint.
//
// Dates: every `today` / day argument is a LOCAL calendar day 'YYYY-MM-DD'.
// Datetimes from the facade are turned into the local day with VsDates.day,
// never sliced (a UTC ISO string sliced gives the wrong day near midnight).
//
// Not here, on purpose:
//   - no rule closes a day (owner 12/10: days are always open; WI4.collapsible
//     was deleted for the same reason). openDay() only picks where to scroll.
//   - INTL_NO_TRUCK is not a flag (PLAN §2.4, decisions-10): intlInfo() gives
//     it to the menu and the «Καρτέλα διεθνούς» as information, no level.
//   - NAT_NO_CARRIER / NAT_MISSING wait for the owner (Ε5, PLAN §2.5).
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const freeze = Object.freeze;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (d) => DAY_RE.test(String(d || ''));

// ─── dependencies, resolved at call time ──────────────────────────────
// A missing dependency is a coding error (wrong script order): loud, never a
// silent «no flags».
function dep(globalName, file, pick) {
  /* global WI4, VsDates, OrdersCommon */
  const g = globalName === 'WI4' ? (typeof WI4 !== 'undefined' ? WI4 : undefined)
    : globalName === 'VsDates' ? (typeof VsDates !== 'undefined' ? VsDates : undefined)
    : (typeof OrdersCommon !== 'undefined' ? OrdersCommon : undefined);
  if (g) return g;
  if (typeof require === 'function') { const m = require(file); return pick ? m[pick] : m; }
  throw new Error('WN4: ' + globalName + ' is not loaded (' + file + ')');
}
const W = () => dep('WI4', './wi4-logic.js');
const V = () => dep('VsDates', './vs-dates.js');
const OC = () => dep('OrdersCommon', './orders-common.js', 'OrdersCommon');

const day = (raw) => V().day(raw);
const dayLabel = (d) => W().dayLabel(d);

// The facade gives a link as ['recX'] (CLAUDE.md «Σύνταξη προς το facade»);
// an object {id} is tolerated so a browser-built record reads the same.
function linkId(v) {
  const x = Array.isArray(v) ? v[0] : v;
  if (x && typeof x === 'object') return String(x.id || '');
  return x ? String(x) : '';
}

// ORDER_STOPS labels — the F.STOP_* values of config.js (checked by
// tests/wn4-logic.test.js, so a rename there fails here, not on the board).
const STOP = freeze({ TYPE: 'Stop Type', LOCATION: 'Location', DATETIME: 'DateTime', NUMBER: 'Stop Number' });

// National load direction words: arrows on NATIONAL LOADS (config.js
// F.CL_KATHODOS / F.CL_ANODOS). The Greek words belong to CONSOLIDATED LOADS.
const NAT_DOWN = 'North→South'; // ΚΑΘΟΔΟΣ
const NAT_UP = 'South→North';   // ΑΝΟΔΟΣ

// ─── PLAN §2.4 datapath-6: the direction of the INTERNATIONAL order ────
/**
 * vsNatDates / vsHubBad judge with dir === 'Export' (ORDERS vocabulary).
 * Without this, every ΑΝΟΔΟΣ would be computed as an import and «Βέροια πριν
 * τη φόρτωση» could never show. The international order's own Direction wins
 * (it is what the sync reads); only when it is absent or unknown does the
 * national arrow decide. Anything else → null: unknown, never a guess
 * (principle 5) — callers must not feed null to vsNatDates, which would read
 * it as Import.
 * @param {Object} nl - NATIONAL LOADS fields
 * @param {Object|null} intl - ORDERS fields (null = not read)
 * @returns {'Export'|'Import'|null}
 */
function dirOf(nl, intl) {
  const d = intl && intl['Direction'];
  if (d === 'Export' || d === 'Import') return d;
  const n = nl && nl['Direction'];
  if (n === NAT_UP) return 'Export';
  if (n === NAT_DOWN) return 'Import';
  return null;
}

// ─── words ─────────────────────────────────────────────────────────────
// TODO(audit): copy waits for the approved design (Ε5). The line-2 texts are
// PLAN §3.5 verbatim; the short words (rail / queue card «Nπ · λόγος») are
// the plan's own phrases cut to 2–4 words.
const TEXT = freeze({
  NO_TRUCK: 'χωρίς φορτηγό',
  NO_LOCAL_DRIVER: 'χρειάζεται τοπικό',      // the old board's chip (weekly_natl.js _wnRowHTML)
  EMPTY_RETURN: 'κενό γύρισμα',
  NO_RATE: 'χωρίς κόμιστρο',
  HUB_NOT_FOLLOWED: 'το εθνικό δεν ακολούθησε',
  HUB_STOP_NOT_FOLLOWED: 'η στάση Βέροιας δεν ακολούθησε',
  DATE_MISMATCH_DOWN: 'Βέροια μετά την παράδοση',
  DATE_MISMATCH_UP: 'Βέροια πριν τη φόρτωση',
  INTL_NOT_VS: 'το διεθνές δεν είναι πια VS',
  INTL_GONE: 'το διεθνές δεν βρέθηκε',
  PAIR_SPLIT: 'μισό ζευγάρι',
  INTL_UNKNOWN: 'διεθνές: δεν φορτώθηκε',
  HUB_STOP_UNKNOWN: 'στάση Βέροιας: δεν φορτώθηκε',
  NO_HUB_DAY: 'διεθνές: χωρίς ημέρα Βέροιας',
  DIR_UNKNOWN: 'κατεύθυνση: άγνωστη',
  INTL_NO_TRUCK: 'το διεθνές δεν έχει φορτηγό',
});

// The one button a queue card offers; WN4Actions (WP6) switches on these
// SAME names. Never a write by itself.
// TODO(audit): the names are not in the WP0 contract (PLAN §5.1 WP0 (γ));
// WP6 must use exactly these or the card does nothing.
const ACT = freeze({
  NO_TRUCK: 'assign', NO_LOCAL_DRIVER: 'local', EMPTY_RETURN: 'newSn', NO_RATE: 'assign',
  HUB_NOT_FOLLOWED: 'retry', HUB_STOP_NOT_FOLLOWED: 'retry', DATE_MISMATCH: 'date',
  INTL_NOT_VS: 'retry', PAIR_SPLIT: 'assign', SOURCE_UNKNOWN: 'reload',
});

// Queue groups (WI4's three: what stops a load, what costs, what wants a look).
const GROUP = freeze({
  NO_TRUCK: 'stop', NO_LOCAL_DRIVER: 'stop', HUB_NOT_FOLLOWED: 'stop', HUB_STOP_NOT_FOLLOWED: 'stop',
  INTL_NOT_VS: 'stop', PAIR_SPLIT: 'stop',
  EMPTY_RETURN: 'cost', NO_RATE: 'cost',
  DATE_MISMATCH: 'look', SOURCE_UNKNOWN: 'look',
});

const RANK = freeze({ red: 2, amber: 1 });
const worst = (reasons) => reasons.reduce((w, r) => ((RANK[r.level] || 0) > (RANK[w] || 0) ? r.level : w), null);
const reason = (code, level, text, date, extra) => Object.assign({
  code, level, text, act: ACT[code] || 'open', group: GROUP[code] || 'look', date: isDay(date) ? date : null,
}, extra || {});

// Red when the day is today+1 or earlier (past included); no date = red too.
// CALENDAR days (owner 11/10: Saturday and Sunday count — 32% load then).
const nearLevel = (d, today) => { const k = W().dayDiff(today, d); return k === null || k <= 1 ? 'red' : 'amber'; };
const earliest = (a, b) => (isDay(a) && isDay(b) ? (a < b ? a : b) : isDay(a) ? a : isDay(b) ? b : null);

// ─── one leg's own facts ──────────────────────────────────────────────
function vehicleOf(nl) {
  const f = nl || {};
  return { truck: linkId(f['Truck']), driver: linkId(f['Driver']), partner: linkId(f['Partner']) };
}
const savedOf = (nl) => { const v = vehicleOf(nl); return !!(v.truck || v.partner); };
const statusOf = (nl) => String((nl && nl['Status']) || '');
const isDirect = (nl) => !!nl && nl['Source Type'] === 'Direct';
const cancelled = (nl) => statusOf(nl) === 'Cancelled';

/**
 * The row's day: the ΚΑΘΟΔΟΣ loading, or the ΑΝΟΔΟΣ's when it is alone
 * (PLAN §4.3). Delivery only if the loading is missing, as _wnRowKey does
 * (modules/weekly_natl.js:882).
 * TODO(audit): second copy of _wnRowKey's rule; WP5 should take one of the two
 * (WN_INTERNAL._wnRowKey is in the WP0 contract).
 */
function rowDay(nl) {
  const f = nl || {};
  return day(f['Loading DateTime']) || day(f['Delivery DateTime']) || null;
}

/**
 * The trip's rate: one per trip, on the ΚΑΘΟΔΟΣ; an ΑΝΟΔΟΣ rate only as the
 * fallback (owner 4/10 §8.5). Same rule as _wnPairRate (weekly_natl.js:2414).
 * TODO(audit): second copy of _wnPairRate; one of the two should go in WP2/WP5.
 */
function pairRate(desc, asc) {
  const r = (f) => { const v = f && f['Partner Rate']; return v === null || v === undefined || v === '' || Number(v) === 0 ? '' : String(v); };
  return r(desc) || r(asc);
}

// ─── PLAN §3.5: the Veroia stop of a VS national load ─────────────────
/**
 * The Veroia stop(s) of one national load, chosen in the browser (PLAN §4.4γ):
 * place = F.VEROIA_LOC; Loading on a ΚΑΘΟΔΟΣ (Import: it leaves Veroia),
 * Unloading on an ΑΝΟΔΟΣ (Export: it reaches Veroia) — the stops
 * _syncVeroiaSwitch writes (modules/orders_intl.js, pickupLocs / delivLocs).
 * @param {Array<Object>} stops - ORDER_STOPS fields of THIS national load
 * @param {'Export'|'Import'} dir - direction of the international order (dirOf)
 * @param {string} veroiaLoc - F.VEROIA_LOC
 * @returns {Array<string|null>} the local day of each Veroia stop, by Stop Number
 */
function hubStopDays(stops, dir, veroiaLoc) {
  const type = dir === 'Export' ? 'Unloading' : 'Loading';
  return (Array.isArray(stops) ? stops : [])
    .map((s) => (s && s.fields) || s || {})
    .filter((s) => s[STOP.TYPE] === type && linkId(s[STOP.LOCATION]) === veroiaLoc)
    .sort((a, b) => (Number(a[STOP.NUMBER]) || 0) - (Number(b[STOP.NUMBER]) || 0))
    .map((s) => day(s[STOP.DATETIME]));
}

/**
 * Line 2 of a VS node — only on an error (PLAN §3.5). Computed from the data,
 * so it survives a reload, also when ONLY the stop failed (no new column,
 * principle 2).
 *
 * leg = {nl, intl, intlState, hubStops, hubState, veroiaLoc}
 *   nl        NATIONAL LOADS fields of the leg
 *   intl      ORDERS fields of its international order (PLAN §4.4α), or null
 *   intlState 'ok' | 'err' (read failed) | 'missing' (no link, or the read
 *             answered without the record). Absent + intl given = 'ok'.
 *   hubStops  ORDER_STOPS of this load (PLAN §4.4γ), or null
 *   hubState  'ok' | 'err'. Absent + hubStops given = 'ok'.
 *   veroiaLoc F.VEROIA_LOC (falls back to the global F when there is one)
 *
 * → null (nothing to say: «καμία ένδειξη διεθνές στη Βέροια», owner 21:10) |
 *   {code, tone:'red'|'amber'|'grey', text, acts:[…], hr, hs, f, dir, bad}
 *   plus `all`: every code that holds, so the rail and the queue count what
 *   line 2 shows first and the rest (one source).
 *
 * Only Source Type === 'Direct' (not groupage, not a national order): any
 * other load would turn red falsely. Table order decides what line 2 shows.
 */
function hubLine(leg) {
  const L = leg || {};
  const nl = L.nl;
  if (!isDirect(nl)) return null;
  const intlState = L.intlState || (L.intl ? 'ok' : 'err');
  if (intlState === 'err' || (intlState === 'ok' && !L.intl)) {
    return { code: 'INTL_UNKNOWN', tone: 'grey', text: TEXT.INTL_UNKNOWN, acts: [], all: ['INTL_UNKNOWN'] };
  }
  // PLAN §2.4 datapath-5: an orphan national (the order is no longer VS, or
  // went groupage, and the delete failed) would get a truck, a trip and a
  // payroll line. VS only with === true: an absent field is NOT VS (trap 2).
  if (intlState === 'missing') {
    return { code: 'INTL_NOT_VS', tone: 'red', text: TEXT.INTL_GONE + ' — το εθνικό έμεινε', acts: ['retry'], all: ['INTL_NOT_VS'] };
  }
  const intl = L.intl;
  if (intl['Veroia Switch'] !== true || intl['National Groupage'] === true) {
    return { code: 'INTL_NOT_VS', tone: 'red', text: TEXT.INTL_NOT_VS + ' — το εθνικό έμεινε', acts: ['retry'], all: ['INTL_NOT_VS'] };
  }
  const dir = dirOf(nl, intl);
  if (!dir) return { code: 'DIR_UNKNOWN', tone: 'grey', text: TEXT.DIR_UNKNOWN, acts: [], all: ['DIR_UNKNOWN'] };
  const Vd = V();
  const f = Vd.vsNatDates(dir, intl['Loading DateTime'], intl['Delivery DateTime'], Vd.cdOf(intl)).hub;
  if (!f) return { code: 'NO_HUB_DAY', tone: 'grey', text: TEXT.NO_HUB_DAY, acts: [], all: ['NO_HUB_DAY'], dir };
  // hr: the Veroia end of the national LINE (ΚΑΘΟΔΟΣ loads there, ΑΝΟΔΟΣ
  // delivers there) — what Weekly National, trips and payroll read (034).
  const hr = dir === 'Export' ? day(nl['Delivery DateTime']) : day(nl['Loading DateTime']);
  const all = [];
  const out = { dir, f, hr, hs: null, bad: false };
  if (hr !== f) all.push('HUB_NOT_FOLLOWED');
  // hs: the national load's Veroia STOP — what the Ramp reads and what
  // ramp_follows_stop hangs on. Every Veroia stop must be on f.
  const loc = L.veroiaLoc || ((typeof F !== 'undefined' && F && F.VEROIA_LOC) || '');
  const hubState = L.hubState || (Array.isArray(L.hubStops) ? 'ok' : 'err');
  let hsUnknown = false;
  if (hubState !== 'ok' || !Array.isArray(L.hubStops) || !loc) hsUnknown = true;
  else {
    const days = hubStopDays(L.hubStops, dir, loc);
    out.hs = days.find((d) => d !== f) || (days.length ? days[0] : null);
    // TODO(audit): a read that worked but found NO Veroia stop is treated as
    // «did not follow» (the sync writes one on every VS load, 63/63 on 11/10);
    // PLAN §3.5 has no row for it.
    // «hr = f αλλά hs ≠ f» (§3.5): when the line itself did not follow, the
    // stop is part of the same retry and is not a second item.
    if (hr === f && (!days.length || days.some((d) => d !== f))) all.push('HUB_STOP_NOT_FOLLOWED');
    out.hsMissing = !days.length;
  }
  if (Vd.vsHubBad(dir, intl['Loading DateTime'], intl['Delivery DateTime'], f)) { all.push('DATE_MISMATCH'); out.bad = true; }
  if (hsUnknown && hr === f) all.push('HUB_STOP_UNKNOWN');
  if (!all.length) return null;
  const L2 = (a, b) => `${a}: ${b}`;
  const code = all[0];
  if (code === 'HUB_NOT_FOLLOWED') {
    return Object.assign(out, { code, tone: 'red', all, acts: ['retry', 'revert'],
      text: L2(TEXT.HUB_NOT_FOLLOWED, `διεθνές ${dayLabel(f)} · εθνικό ${dayLabel(hr) || '—'}`) });
  }
  if (code === 'HUB_STOP_NOT_FOLLOWED') {
    // Only the stop stayed behind: «Επαναφορά» would rewrite the order to the
    // day it already has, so only «Ξαναδοκίμασε» (PLAN §3.5).
    return Object.assign(out, { code, tone: 'red', all, acts: ['retry'],
      text: out.hsMissing ? TEXT.HUB_STOP_NOT_FOLLOWED + ': λείπει — η Ράμπα δεν τη δείχνει'
        : L2(TEXT.HUB_STOP_NOT_FOLLOWED, `${dayLabel(out.hs) || '—'} — η Ράμπα τη δείχνει εκεί`) });
  }
  if (code === 'DATE_MISMATCH') {
    const text = dir === 'Export'
      ? `Βέροια ${dayLabel(f)} · φόρτωση ${dayLabel(day(intl['Loading DateTime']))}`
      : `φορτώνει ${dayLabel(f)} · παράδοση ${dayLabel(day(intl['Delivery DateTime']))}`;
    // The colour is decided by flags() with today (amber; red today–tomorrow).
    return Object.assign(out, { code, tone: 'amber', all, acts: ['date'], text });
  }
  return Object.assign(out, { code, tone: 'grey', all, acts: [], text: TEXT.HUB_STOP_UNKNOWN });
}

// ─── PLAN §2.4: «Διεθνές χωρίς φορτηγό» — information, never a flag ────
/** → {noTruck, text} for the load menu and the «Καρτέλα διεθνούς»; no level,
 *  so it can never reach a rail, a day header or the queue. An unread order
 *  says nothing here (its line 2 says «δεν φορτώθηκε»). */
function intlInfo(intl, intlState) {
  const ok = (intlState || (intl ? 'ok' : 'err')) === 'ok' && !!intl;
  if (!ok) return { noTruck: false, text: '' };
  const none = !linkId(intl['Truck']) && !linkId(intl['Partner']);
  return { noTruck: none, text: none ? TEXT.INTL_NO_TRUCK : '' };
}

// ─── PLAN §2.4: when the D panel only reads — a STATUS rule, not a role ──
/**
 * One place for the menu, the panel, the «?» sheet and the D key. Judged on
 * a FRESH read just before the write (PLAN §5.2 D, step −1β), never on the
 * paint: the Ramp may have set In Transit, 030 Delivered, or the accountant
 * invoiced in between.
 *
 * Locked (read only) when:
 *   national In Transit, Delivered (written, or computed by date — the
 *   board's _wnIsDelivered = OrdersCommon.deliveredByDate) or Cancelled;
 *   international Delivered, Cancelled or invoiced.
 * Why: the chain rewrites dates for every status and 034 moves the trip and
 * the payroll; a click on a past day would move an executed trip. 028 says the
 * same (execution beats planning). Open: Ε8 — until the owner answers, this
 * stays locked; the change to «one confirm» is one line here.
 *
 * The reason is a dated FACT, never «Παραδομένο» (owner 4/10 α).
 *
 * @param {Object} nl - NATIONAL LOADS fields (fresh)
 * @param {Object|null} intl - ORDERS fields (fresh); null = not read
 * @returns {{ok:boolean, mode:'edit'|'read'|'form'|'off', why:string, code:string|null}}
 *   mode 'form' = a national-order load: «Ημερομηνία…» opens openNatlEdit;
 *   mode 'off'  = groupage: shown disabled with the reason (PLAN §5.3).
 */
function dateEditable(nl, intl) {
  const f = nl || {};
  const st = statusOf(f);
  const src = f['Source Type'];
  if (src === 'Groupage') return { ok: false, mode: 'off', code: 'GROUPAGE', why: 'groupage: η ημερομηνία ζει σε 3 πίνακες χωρίς αλυσίδα — αλλάζει από την παραγγελία' };
  if (src !== 'Direct') return { ok: false, mode: 'form', code: 'NATL_ORDER', why: 'εθνική παραγγελία: η ημερομηνία αλλάζει από τη φόρμα της' };
  if (st === 'Cancelled') return { ok: false, mode: 'read', code: 'NL_CANCELLED', why: 'το εθνικό ακυρώθηκε' };
  if (!intl) return { ok: false, mode: 'read', code: 'INTL_UNREAD', why: TEXT.INTL_UNKNOWN };
  const ist = String(intl['Status'] || '');
  if (ist === 'Cancelled') return { ok: false, mode: 'read', code: 'INTL_CANCELLED', why: 'το διεθνές ακυρώθηκε' };
  if (intl['Invoiced'] === true) return { ok: false, mode: 'read', code: 'INTL_INVOICED', why: 'το διεθνές τιμολογήθηκε' };
  const nlDel = day(f['Delivery DateTime']);
  const dated = (s, d) => (d ? `${s} (${dayLabel(d)})` : s);
  // Computed delivered first: it names the date a dispatcher can check.
  if (OC().deliveredByDate(st, f['Delivery DateTime'])) return { ok: false, mode: 'read', code: 'NL_PAST', why: dated('η παράδοση πέρασε', nlDel) };
  // A written Delivered before its date: 030 copies it from the international
  // order (VS only). Said as what happened, not as «delivered».
  if (st === 'Delivered') return { ok: false, mode: 'read', code: 'NL_EXECUTED', why: 'το εθνικό γράφτηκε εκτελεσμένο από το διεθνές' };
  if (st === 'In Transit') return { ok: false, mode: 'read', code: 'NL_LOADED', why: dated('το εθνικό φορτώθηκε', day(f['Loading DateTime'])) };
  if (ist === 'Delivered') {
    const iDel = day(intl['Delivery DateTime']);
    return { ok: false, mode: 'read', code: 'INTL_EXECUTED', why: dated('το διεθνές εκτελέστηκε', iDel) };
  }
  return { ok: true, mode: 'edit', code: null, why: '' };
}

// ─── PLAN §4.3 / §2.4 flags ────────────────────────────────────────────
/**
 * facts (built impurely by the renderer, WP5) — raw records, so the rules
 * live HERE and not in the renderer:
 *   {kind:'trip'|'lone',
 *    desc: Leg|null,   trip: the ΚΑΘΟΔΟΣ (required)
 *    asc:  Leg|null,   trip: its matched ΑΝΟΔΟΣ or null; lone: the ΑΝΟΔΟΣ
 *    returnPlace?: string — where the empty truck stands (label, for the text)}
 *   Leg = {nl, intl?, intlState?, hubStops?, hubState?, veroiaLoc?,
 *          needsLocal?: boolean | 'YYYY-MM-DD' (the local move's day)}
 * today = 'YYYY-MM-DD'.
 * → {level:'red'|'amber'|null, reasons:[{code, level, text, act, group, date, side?}],
 *    lines:{desc, asc} (hubLine of each VS leg, for line 2)}
 */
function flags(facts, today) {
  const x = facts || {};
  const out = [];
  const lines = { desc: null, asc: null };
  const lone = x.kind === 'lone';
  const head = lone ? x.asc : x.desc;           // the leg that carries the row's assignment
  const headNl = head && head.nl;
  // A cancelled load owes nothing (no NO_TRUCK on a load nobody will drive).
  // TODO(audit): the plan does not say it; it is how the old board's «ΠΡΟΣ
  // ΑΝΑΘΕΣΗ» should have read — confirm with the coordinator.
  const live = (L) => L && L.nl && !cancelled(L.nl);

  if (live(head)) {
    const loadDay = rowDay(headNl);
    // NO_TRUCK — never silent (§2.1 same grammar as Intl v4): red today–
    // tomorrow, amber beyond, never nothing.
    if (!savedOf(headNl)) out.push(reason('NO_TRUCK', nearLevel(loadDay, today), TEXT.NO_TRUCK, loadDay));
    // NO_RATE — a partner without the trip's rate (mandatory in the popover
    // since day one, so only an older path can leave it empty).
    // TODO(audit): level amber is our reading; the plan names the code only.
    else if (vehicleOf(headNl).partner && !pairRate(lone ? null : x.desc && x.desc.nl, x.asc && x.asc.nl)) {
      out.push(reason('NO_RATE', 'amber', TEXT.NO_RATE, loadDay));
    }
    // EMPTY_RETURN — own truck on a ΚΑΘΟΔΟΣ with no ΑΝΟΔΟΣ. Intl v4's rule
    // (rules sheet): nothing while R > today+2, amber from R−2 to R, red after
    // R; no R = amber. R = the ΚΑΘΟΔΟΣ delivery day (the truck is empty there).
    // A partner never gets it (one way is a fact, «μονή διαδρομή»).
    // TODO(audit): Ε5 proposes red only R..R+2 then grey «Χωρίς καταγεγραμμένη
    // άνοδο» outside the queue (PLAN §2.5; 47 of 51 ΚΑΘΟΔΟΙ never had one).
    if (!lone && savedOf(headNl) && !vehicleOf(headNl).partner && !(x.asc && x.asc.nl)) {
      const R = day(headNl['Delivery DateTime']);
      const k = W().dayDiff(R, today); // today − R
      const level = k === null ? 'amber' : k > 0 ? 'red' : k >= -2 ? 'amber' : null;
      if (level) {
        const from = dayLabel(R);
        const text = [TEXT.EMPTY_RETURN, from ? 'από ' + from : '', x.returnPlace || ''].filter(Boolean).join(' · ');
        out.push(reason('EMPTY_RETURN', level, text, R, { age: k === null ? null : Math.max(0, k) }));
      }
    }
  }

  // PAIR_SPLIT — vehicle, driver or partner of the ΚΑΘΟΔΟΣ ≠ the ΑΝΟΔΟΣ:
  // a half-written pair (second PATCH failed) that a reload would otherwise
  // show as complete, since the row shows only the ΚΑΘΟΔΟΣ vehicle (§2.4).
  // Trailer is not compared: the plan names three (§4.3, §6.1).
  // TODO(audit): level = NO_TRUCK's grammar (red today–tomorrow); the plan
  // gives no level.
  if (!lone && live(x.desc) && live(x.asc)) {
    const a = vehicleOf(x.desc.nl), b = vehicleOf(x.asc.nl);
    const diff = ['truck', 'driver', 'partner'].filter((k) => a[k] !== b[k]);
    if (diff.length) {
      const words = { truck: 'φορτηγό', driver: 'οδηγός', partner: 'συνεργάτης' };
      const d = rowDay(x.desc.nl);
      out.push(reason('PAIR_SPLIT', nearLevel(d, today), `${TEXT.PAIR_SPLIT}: άλλο ${diff.map((k) => words[k]).join(' · ')} στην άνοδο`, d, { diff }));
    }
  }

  // Per leg: the local driver and the VS node.
  for (const side of ['desc', 'asc']) {
    const L = x[side];
    if (!live(L)) continue;
    if (L.needsLocal) {
      const d = isDay(L.needsLocal) ? L.needsLocal : rowDay(L.nl);
      out.push(reason('NO_LOCAL_DRIVER', nearLevel(d, today), TEXT.NO_LOCAL_DRIVER, d, { side }));
    }
    const ln = hubLine(L);
    lines[side] = ln;
    if (!ln) continue;
    for (const code of ln.all) {
      if (code === 'HUB_NOT_FOLLOWED' || code === 'HUB_STOP_NOT_FOLLOWED' || code === 'INTL_NOT_VS') {
        out.push(reason(code, 'red', code === ln.code ? ln.text : TEXT[code], ln.f || rowDay(L.nl), { side }));
      } else if (code === 'DATE_MISMATCH') {
        // Amber, red inside today–tomorrow (§3.5) — by the EARLIEST of the two
        // days involved: a ΚΑΘΟΔΟΣ's customer delivery comes before its late
        // Veroia day, an ΑΝΟΔΟΣ's Veroia day before its late loading.
        const other = ln.dir === 'Export' ? day(L.intl['Loading DateTime']) : day(L.intl['Delivery DateTime']);
        const d = earliest(ln.f, other);
        const k = W().dayDiff(today, d);
        const level = k !== null && k <= 1 ? 'red' : 'amber';
        out.push(reason('DATE_MISMATCH', level, ln.dir === 'Export' ? TEXT.DATE_MISMATCH_UP : TEXT.DATE_MISMATCH_DOWN, d, { side }));
      }
      // grey codes (INTL_UNKNOWN, HUB_STOP_UNKNOWN, DIR_UNKNOWN, NO_HUB_DAY)
      // are line 2 only; the failed READ is one board-level item
      // (sourceReasons), so the queue count is never a smaller number.
    }
  }
  return { level: worst(out), reasons: out, lines };
}

/**
 * Board-level reasons for reads that failed (PLAN §4.4: «η σειρά ή η λίστα το
 * λέει, ποτέ εντάξει»; same shape as WI4.sourceReasons). One per source.
 * src = {intlState, hubState, w1State, localsFailed}
 */
const SOURCE_NAMES = freeze({ intl: 'διεθνή των VS', hub: 'στάσεις Βέροιας', w1: 'φορτώσεις W+1', locals: 'τοπικές κινήσεις' });
function sourceReasons(src) {
  const s = src || {};
  const out = [];
  const unk = (source) => out.push(reason('SOURCE_UNKNOWN', 'amber',
    `Δεν φορτώθηκε: ${SOURCE_NAMES[source]} — δεν σημαίνει ότι δεν υπάρχουν`, null, { source }));
  if (s.intlState === 'err') unk('intl');
  if (s.hubState === 'err') unk('hub');
  if (s.w1State === 'err') unk('w1');
  if (s.localsFailed) unk('locals');
  return out;
}

// ─── day header, plurals, queue ────────────────────────────────────────
// TODO(audit): WI4.plural has no table parameter (core/wi4-logic.js:256), so
// these words cannot ride its engine yet; when WP0/WP1 add one, this goes.
const PLURAL = freeze({
  trip: freeze(['ταξίδι', 'ταξίδια']),
  load: freeze(['φορτίο', 'φορτία']),
  noTruck: freeze(['χωρίς φορτηγό', 'χωρίς φορτηγό']),
  emptyReturn: freeze(['κενό γύρισμα', 'κενά γυρίσματα']),
  pending: freeze(['εκκρεμές', 'εκκρεμή']),
  day: freeze(['ημέρα', 'ημέρες']),
});
function plural(n, key) {
  const w = PLURAL[key];
  if (!w) throw new Error('WN4.plural: unknown key ' + key);
  return `${n} ${Number(n) === 1 ? w[0] : w[1]}`;
}

/** rowsFacts = every facts object of ONE day. → {trips, byCode, level}.
 *  The same flags() the rails and the queue read (one source, §6.1). */
function dayCounts(rowsFacts, today) {
  const byCode = {};
  let trips = 0;
  const reasons = [];
  for (const f of rowsFacts || []) {
    if (!f) continue;
    trips++;
    for (const r of flags(f, today).reasons) { byCode[r.code] = (byCode[r.code] || 0) + 1; reasons.push(r); }
  }
  return { trips, byCode, level: worst(reasons) };
}

/**
 * The 6px dot of a day the USER closed while it has work (PLAN §2.2): red
 * filled / amber ring, the words in title/aria. The header itself stays name +
 * date — no summary. → null when the day has nothing.
 */
function dayMark(counts) {
  const c = counts || {};
  if (!c.level) return null;
  const words = Object.keys(c.byCode || {}).sort().map((code) => `${c.byCode[code]} ${TEXT[code] || (code === 'DATE_MISMATCH' ? 'ημέρα Βέροιας που δεν στέκει' : code)}`);
  return { tone: c.level, words: words.join(' · ') };
}

/** The queue items of one facts object, keyed by load id (`key`) and the row
 *  it is drawn in (`rowKey`), so a card resolves its row at click time. */
function items(facts, today, ids) {
  const k = ids || {};
  return flags(facts, today).reasons.map((r) => Object.assign({}, r, { key: k.key == null ? '' : String(k.key), rowKey: k.rowKey == null ? null : k.rowKey }));
}

/** Ordering = WI4.queue (red → amber; stop → cost → look; dates; key). The
 *  items carry their own `group`, so WI4's intl GROUP map never decides. */
function queue(list, today) { return W().queue(list, today); }

/** days = [{date, facts:[…]}] → the first day holding a red reason, else
 *  today. It only picks where the board SCROLLS: no rule closes a day. */
function openDay(days, today) {
  const sorted = (days || []).filter((d) => d && isDay(d.date)).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const hit = sorted.find((d) => (d.facts || []).some((f) => flags(f, today).level === 'red'));
  return hit ? hit.date : today;
}

/**
 * The W+1 count on the week tab and in the preview (PLAN §4.4δ): a read that
 * failed is «—», never 0 — an unread Sunday or Monday would read «all fine».
 * state = 'loading' | 'ok' | 'err' (as Intl's _xw).
 */
function w1Count(state, n) {
  if (state === 'ok') return { text: String(Number(n) || 0), title: `${Number(n) || 0} της W+1 ως τη Δευτέρα` };
  if (state === 'loading') return { text: '…', title: 'Οι φορτώσεις της W+1 φορτώνουν' };
  return { text: '—', title: 'Οι φορτώσεις της W+1 δεν φορτώθηκαν — δεν σημαίνει ότι δεν υπάρχουν' };
}

// ─── keyboard (PLAN §1: A · P · D · M · N) ─────────────────────────────
// By e.code, so a Greek layout works. P prints the TRIP here (the load on
// Weekly Intl) — the «?» sheet says so (§2.4).
const KEYMAP_NATL = freeze([
  freeze({ code: 'ArrowUp', shift: false, action: 'rowPrev', keys: '↑', label: 'προηγούμενη σειρά', needsRow: false }),
  freeze({ code: 'ArrowDown', shift: false, action: 'rowNext', keys: '↓', label: 'επόμενη σειρά', needsRow: false }),
  freeze({ code: 'Enter', shift: false, action: 'menu', keys: 'Enter', label: 'μενού φορτίου', needsRow: true }),
  freeze({ code: 'KeyA', shift: false, action: 'assign', keys: 'A', label: 'ανάθεση', needsRow: true }),
  freeze({ code: 'KeyD', shift: false, action: 'date', keys: 'D', label: 'ημέρα Βέροιας', needsRow: true }),
  freeze({ code: 'KeyP', shift: false, action: 'print', keys: 'P', label: 'εκτύπωση ταξιδιού / WhatsApp', needsRow: true }),
  freeze({ code: 'KeyM', shift: false, action: 'match', keys: 'M', label: 'ταίριασμα κάθοδος–άνοδος', needsRow: true }),
  freeze({ code: 'KeyN', shift: false, action: 'newSn', keys: 'N', label: 'νέα άνοδος (κενό γύρισμα)', needsRow: true }),
  freeze({ code: 'Slash', shift: false, action: 'search', keys: '/', label: 'αναζήτηση', needsRow: false }),
  freeze({ code: 'Slash', shift: true, action: 'help', keys: '?', label: 'όλες οι συντομεύσεις', needsRow: false }),
  freeze({ code: 'Escape', shift: false, action: 'escape', keys: 'Esc', label: 'κλείσιμο / καθάρισμα', needsRow: false }),
]);

/**
 * The national map on the SHARED engine, WI4.keyAction(ev, st, map) — the
 * map parameter is frozen in the WP0 contract and lands with WP1 (PLAN §4.3).
 * Until then WI4.keyAction takes two arguments and would answer with the
 * INTERNATIONAL map (no M, an O and a Q that do nothing here), so this
 * returns null rather than a wrong action.
 * TODO(audit): drop the arity check once WP1 is on main.
 */
function keyAction(ev, st) {
  const ka = W().keyAction;
  if (typeof ka !== 'function' || ka.length < 3) return null;
  return ka(ev, st, KEYMAP_NATL);
}
function keyHint(action) {
  const k = KEYMAP_NATL.find((x) => x.action === action);
  return k ? k.keys : '';
}

// ─── PLAN §4.4β: the ΑΝΟΔΟΣ assignment picker and the M list ───────────
/**
 * Pure order of the picker: our trucks coming back empty first, then our other
 * trucks, then partners (owner Ε4; the critic's «near ΚΑΘΟΔΟΙ first» was
 * rejected as a default, §2.5). Nothing is ever picked or written here.
 *
 * target = {day, lat?, lng?} — the ΑΝΟΔΟΣ's loading day and first pickup.
 * cands  = [{id, label, kind:'own'|'partner',
 *            lastDrop?: {day, place, lat?, lng?} — where/when it ends (own),
 *            laterLoad?: boolean — any loading after that last delivery,
 *            noGps?: boolean, lastRate?: {rate, day} — partner, on this lane}]
 * → [{id, label, kind, group:'emptyOwn'|'own'|'partner', km, where, priceLine}]
 *
 * «Empty» = own, a last delivery on/before the target day, no loading after
 * it (the rows already read: ORDERS ±1 week + NAT_LOADS). Distance is a
 * STRAIGHT line, said so («~N km σε ευθεία από <τόπο>»), never a road
 * distance. Unknowns are written as unknown; no history = no price line,
 * never «0 €».
 * TODO(audit): inside a group the order (nearest first, unknown last, then
 * label) and the price-line words are ours; the plan gives the group order only.
 */
function returnCandidates(target, cands) {
  const t = target || {};
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const km = (a, b) => {
    const la1 = num(a && a.lat), lo1 = num(a && a.lng), la2 = num(b && b.lat), lo2 = num(b && b.lng);
    if (![la1, lo1, la2, lo2].every(Number.isFinite)) return null;
    const rad = Math.PI / 180, R = 6371;
    const dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  };
  const rows = (Array.isArray(cands) ? cands : []).filter((c) => c && c.id).map((c) => {
    const own = c.kind !== 'partner';
    const ld = c.lastDrop || null;
    const empty = own && !!ld && isDay(ld.day) && isDay(t.day) && ld.day <= t.day && !c.laterLoad;
    const d = empty ? km(ld, t) : null;
    let where = '';
    if (empty) {
      where = d !== null ? `~${d} km σε ευθεία από ${ld.place || '—'}` : (c.noGps ? 'θέση άγνωστη (χωρίς GPS)' : 'θέση άγνωστη');
    }
    const r = !own && c.lastRate && Number(c.lastRate.rate) > 0 ? c.lastRate : null;
    const priceLine = r ? `τελευταίο κόμιστρο ${Number(r.rate)} €${isDay(r.day) ? ' · ' + dayLabel(r.day) : ''}` : null;
    return { id: String(c.id), label: String(c.label || c.id), kind: own ? 'own' : 'partner',
      group: empty ? 'emptyOwn' : own ? 'own' : 'partner', km: d, where, priceLine };
  });
  const G = { emptyOwn: 0, own: 1, partner: 2 };
  return rows.sort((a, b) => {
    if (G[a.group] !== G[b.group]) return G[a.group] - G[b.group];
    if (a.group === 'emptyOwn') {
      const ka = a.km === null ? Infinity : a.km, kb = b.km === null ? Infinity : b.km;
      if (ka !== kb) return ka - kb;
    }
    return a.label.localeCompare(b.label, 'el') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

// ─── PLAN §4.3: the pallets cell's drop order ──────────────────────────
/**
 * The cell holds the pallet figure and its badges («VS»/«GRP», «PE», PLAN §1).
 * When the measured width is too small, whole badges drop in `dropOrder`
 * (never a cut word, §6.2 overflow); the pallet figure NEVER drops (§6.2:
 * «παλέτες ποτέ κομμένες»).
 * chips = [{key, w}] in display order, one key 'pallets'; widthPx measured
 * once per paint; gap px between chips.
 * → {shown:[keys], dropped:[keys], overflow:boolean}
 * TODO(audit): the order itself comes from the approved design (Ε5) — the
 * plan says only that Figma overflows on row 8. With no dropOrder nothing
 * drops and `overflow` says so: no guessed order.
 */
function palletCell(chips, widthPx, dropOrder, gap) {
  const list = (Array.isArray(chips) ? chips : []).filter((c) => c && c.key);
  const g = Number.isFinite(Number(gap)) ? Number(gap) : 4;
  const width = Number(widthPx);
  const fits = (keys) => {
    const ws = list.filter((c) => keys.includes(c.key)).map((c) => Number(c.w) || 0);
    return ws.reduce((s, w) => s + w, 0) + Math.max(0, ws.length - 1) * g <= width;
  };
  let shown = list.map((c) => c.key);
  const dropped = [];
  if (!(Number.isFinite(width) && width > 0)) return { shown, dropped, overflow: false }; // unmeasured: never shrink on a guess
  for (const k of Array.isArray(dropOrder) ? dropOrder : []) {
    if (fits(shown)) break;
    if (k === 'pallets' || !shown.includes(k)) continue;
    shown = shown.filter((s) => s !== k);
    dropped.push(k);
  }
  return { shown, dropped, overflow: !fits(shown) };
}

const WN4 = freeze({
  // §2.4 datapath-6 / §3.5
  dirOf, hubStopDays, hubLine, intlInfo,
  // §2.4 D
  dateEditable,
  // §4.3 flags
  TEXT, ACT, GROUP, flags, sourceReasons, rowDay, pairRate,
  // day header, plurals, queue
  PLURAL, plural, dayCounts, dayMark, items, queue, openDay, w1Count,
  // keyboard
  KEYMAP_NATL, keyAction, keyHint,
  // §4.4β, pallets cell
  returnCandidates, palletCell,
});

if (typeof module !== 'undefined') module.exports = WN4; else window.WN4 = WN4;
})();
