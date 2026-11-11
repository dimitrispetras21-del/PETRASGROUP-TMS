// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL v4 — pure logic (global WI4)
// ─────────────────────────────────────────────────────────────────────
// Spec: docs/weekly-intl-redesign/TECH_DESIGN.md §b, §d. Owner: WP1.
//
// Plain functions on plain objects: no DOM, no WINTL, no Date.now() (today
// and now are arguments), so the row rail, the day header and the queue read
// ONE rule each (principle 3) and node --test can prove them without a
// browser. The same file loads as a browser global and as a node module.
//
// At load it only defines WI4 — no listener, timer, observer or fetch (§b
// step 6, checked by tests/wi4-contract.test.js).
//
// Dates: every date argument is a LOCAL calendar day 'YYYY-MM-DD' (what
// toLocalDate() returns). A datetime is never sliced here: slicing a UTC ISO
// string gives the wrong day near midnight in Athens. Anything that is not
// 'YYYY-MM-DD' counts as «no date», and no date is never «plenty of time»
// (same rule as preorderLevel in modules/preorder.js).
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const freeze = Object.freeze;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Whole days from `a` to `b` (b − a), or null when either is not a day.
// Date.UTC on both sides: no DST hour can turn 1 day into 0.96.
function dayDiff(a, b) {
  if (!DAY_RE.test(String(a || '')) || !DAY_RE.test(String(b || ''))) return null;
  const u = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((u(b) - u(a)) / 86400000);
}

const GR_DOW = freeze(['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ']);
// «Τρί 6/10» — the board's own day format (rules sheet: no year, no zero pad).
function dayLabel(d) {
  if (!DAY_RE.test(String(d || ''))) return '';
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)));
  return `${GR_DOW[t.getUTCDay()]} ${t.getUTCDate()}/${t.getUTCMonth() + 1}`;
}

// The order of the rows inside one day of the board, on two ORDERS `fields`:
// Veroia Switch last, then `field` — 'Delivery DateTime' for exports, 'Loading
// DateTime' for import-only rows. ONE rule: «Παραγγελίες › Εβδομάδα» reads it
// too, so Ειρήνη compares the two lists row by row (owner 2/11/2026). There is
// no client key (owner 2/11, «Όχι, μένει ως έχει»): the old one read 'Client
// Name' / 'Client Summary', which the Worker's ORDERS map never returns, so it
// was always empty — removed, the board's order byte-identical before / after.
function dayRowOrder(fa, fb, field) {
  const a = fa || {}, b = fb || {};
  return ((a['Veroia Switch'] ? 1 : 0) - (b['Veroia Switch'] ? 1 : 0))
    || String(a[field] || '').localeCompare(String(b[field] || ''));
}

// ─── Board rows and their numbers: ONE source (owner 2/11/2026, «Α: μία κοινή πηγή») ───
// The Weekly International builds its rows (weekly_intl.js _wiBuildRows) and numbers them
// (weekly_intl_v2.js _compute) through the functions below, and «Παραγγελίες › Εβδομάδα» runs
// the SAME functions on its own read, so a load carries the same number on both screens
// («το 1 να αντιστοιχεί στο 1 του weekly»; the pallets weekly view will read it too). Moved
// here from those two files without a change of behaviour: same rows, same order, same numbers.
// Records in, plain objects out; a datetime's day comes from the caller's dayOf (toLocalDate,
// the LOCAL day), the week is ws / we 'YYYY-MM-DD'.
// getLinkedId (core/data-helpers.js), the rule the board used: a link array's first id, or the string itself.
const _linkId = (v) => { if (!v) return null; if (Array.isArray(v)) return (v[0] && v[0].id) || v[0] || null; return typeof v === 'string' ? v : null; };
const _addDay = (d, n) => {
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};

// The datetime a board row is filed by (owner 3/11/2026, «στην ημέρα του νωριτέρου»): an export by
// its EARLIEST delivery (its loading when it has none), an import by its EARLIEST loading. The
// order's own field is not that: the form writes stop 1's (orders_intl.js), and stops may be dated
// out of number order (#618: stop 2 a day before stop 1). The stops' dates come from the page's
// read of ORDER STOPS (f._stopsD / f._stopsL, [{dt}]); without them it is the field, as before.
// A tie keeps the field. type = the row's type, 'export' | 'import'; dayOf = the caller's LOCAL day
// (a datetime near midnight is another day in UTC); left out, the text's date.
function _earliestDt(f, type, dayOf) {
  const day = dayOf || ((v) => String(v || '').slice(0, 10));
  const exp = type === 'export';
  let best = (exp ? f['Delivery DateTime'] : f['Loading DateTime']) || '';
  ((exp ? f._stopsD : f._stopsL) || []).forEach((s) => {
    const d = s && s.dt ? String(s.dt) : '';
    if (d && (!best || day(d) < day(best))) best = d;
  });
  return best;
}
function rowDt(f0, type, dayOf) {
  const f = f0 || {};
  return _earliestDt(f, type, dayOf) || (type === 'export' ? f['Loading DateTime'] || '' : '');
}

// The board's two reads reach 8 days around its week (Cross-week, dispatcher 19/5; B2, owner 6/9):
// the from / to its IS_AFTER / IS_BEFORE carry. wsDate = the week's Saturday as a LOCAL Date at
// midnight (Date arithmetic as the load always did it, so a DST week ends where it always ended).
function readWindow(wsDate, dayOf) {
  const we = new Date(wsDate); we.setDate(wsDate.getDate() + 6);
  return { from: dayOf(new Date(wsDate.getTime() - 8 * 86400000)), to: dayOf(new Date(we.getTime() + 8 * 86400000)) };
}

// The week's exports in board order (the load's own cut, B2 owner 6/9): a Plan Week Start decides
// alone, in either direction; else the delivery day (rowDt: the earliest; the loading day when there
// is none) must fall in ws–we. Then by that datetime as text; equal ones keep the read order (the
// Worker reads by id).
function weekExports(recs, ws, we, dayOf) {
  const eff = (f) => rowDt(f, 'export', dayOf);
  return (recs || []).filter((r) => {
    const f = r.fields || {};
    const pws = dayOf(f['Plan Week Start'] || '');
    if (pws) return pws === ws;
    const d = dayOf(eff(f));
    return d >= ws && d <= we;
  }).sort((a, b) => eff(a.fields || {}).localeCompare(eff(b.fields || {})));
}

// An import group's order (A1, owner 6/9): the Group ID suffix (stop order), then Loading
// DateTime, then id — never the read order, which flipped the group's lead between renders.
function giSortRecs(recs) {
  const gid = String((recs.find((r) => r && r.fields && r.fields['Group ID']) || {}).fields?.['Group ID'] || '');
  const seq = (gid.split('|')[1] || '').split(',').filter(Boolean);
  const pos = (id) => { const k = seq.indexOf(id); return k < 0 ? 99 : k; };
  return [...recs].sort((a, b) => pos(a.id) - pos(b.id)
    || String(a.fields?.['Loading DateTime'] || '').localeCompare(String(b.fields?.['Loading DateTime'] || ''))
    || String(a.id).localeCompare(String(b.id)));
}

// The board's rows of one week, structure only (the screen adds its labels): one row per export,
// then per import (by loading datetime); rows sharing a Group ID collapse into their lead (exports:
// the first; imports: giSortRecs); an import named by an export's Matched Import ID is matched to it;
// orders with a Rotation ID are rota legs; with FEATURES.ORDER_SPLIT, an order with a Parent Order
// is that parent's split leg. id = the row's creation number (the board's row id; ids of collapsed
// members stay used). → { rows, legs: {rot: [rows]}, splitLegs: {parent: [rows]}, created }
function boardRows(exports, imports, o) {
  const opt = o || {}, ws = opt.ws || null, we = opt.we || null, dayOf = opt.dayOf;
  let seq = 0;
  const rows = [];
  const impById = {};
  (imports || []).forEach((r) => { impById[r.id] = r; });
  for (const exp of exports || []) {
    const f = exp.fields || {};
    const pws = dayOf(f['Plan Week Start'] || '');
    const eff = dayOf(rowDt(f, 'export', dayOf));
    const outOfWindow = !!(pws && ws && pws === ws && eff && (eff < ws || eff > we));
    rows.push({ id: ++seq, type: 'export', orderId: exp.id, orderIds: [exp.id], importId: f['Matched Import ID'] || null, outOfWindow });
  }
  {
    const byGid = {};
    rows.forEach((r) => {
      if (r.type !== 'export') return;
      const gid = ((exports || []).find((e) => e.id === r.orderId) || {}).fields?.['Group ID'];
      if (gid) (byGid[gid] = byGid[gid] || []).push(r);
    });
    // Π1 (Wave 3): export rows sharing a Group ID collapse back into one row after every reload.
    // The lead takes the match of ANY member when it has none (owner 8/11/2026, order 643): the match
    // may sit on a member only (GRP-Gl7rxx4W: three exports, Matched Import ID on the third). The
    // import is then «matched» (matchedTo below) and left out of the free imports, so with the lead's
    // own match alone it was drawn nowhere. The mirror of A1 on the import side below.
    Object.values(byGid).forEach((list) => {
      if (list.length < 2) return;
      const [lead, ...rest] = list;
      rest.forEach((r) => { r.orderIds.forEach((id) => { if (!lead.orderIds.includes(id)) lead.orderIds.push(id); }); if (!lead.importId && r.importId) lead.importId = r.importId; });
      const gone = new Set(rest);
      for (let i = rows.length - 1; i >= 0; i--) if (gone.has(rows[i])) rows.splice(i, 1);
    });
  }
  const matchedMap = {};
  (exports || []).forEach((r) => { const mid = (r.fields || {})['Matched Import ID']; if (mid) matchedMap[mid] = r.id; });
  const importsSorted = [...(imports || [])].sort((a, b) => rowDt(a.fields, 'import', dayOf).localeCompare(rowDt(b.fields, 'import', dayOf)));
  for (const imp of importsSorted) {
    const f = imp.fields || {};
    const ld = dayOf(rowDt(f, 'import', dayOf));
    const pws = dayOf(f['Plan Week Start'] || '');
    const inRange = !!(ws && ld && ld >= ws && ld <= we);
    const adj = pws && ws ? pws !== ws : !inRange;
    const outOfWindow = !!(pws && ws && pws === ws && !inRange);
    rows.push({ id: ++seq, type: 'import', orderId: imp.id, orderIds: [imp.id], importId: null, matchedTo: matchedMap[imp.id] || null, adj, outOfWindow });
  }
  {
    const byGid = {};
    rows.forEach((r) => {
      if (r.type !== 'import') return;
      const gid = impById[r.orderId]?.fields?.['Group ID'];
      if (gid) (byGid[gid] = byGid[gid] || []).push(r);
    });
    // A1 (owner 6/9): import groups collapse too — a second grouped import row once stayed alone and a truck
    // assigned on the lead never reached it. The export may point at ANY member (the lead of an earlier render, or
    // one the stop order has since moved): the group is matched if any member is, else the board shows it free
    // while the export still carries it.
    Object.values(byGid).forEach((list) => {
      if (list.length < 2) return;
      const ordered = giSortRecs(list.map((r) => impById[r.orderId] || { id: r.orderId, fields: {} })).map((rec) => list.find((r) => r.orderId === rec.id));
      const [lead, ...rest] = ordered;
      rest.forEach((r) => { r.orderIds.forEach((id) => { if (!lead.orderIds.includes(id)) lead.orderIds.push(id); }); if (!lead.matchedTo && r.matchedTo) lead.matchedTo = r.matchedTo; });
      const gone = new Set(rest);
      for (let i = rows.length - 1; i >= 0; i--) if (gone.has(rows[i])) rows.splice(i, 1);
    });
  }
  const recOf = (r) => { const id = (r.orderIds && r.orderIds[0]) || r.orderId; return (exports || []).find((x) => x.id === id) || (imports || []).find((x) => x.id === id); };
  // Rota (owner 10/8): orders with a Rotation ID are forwarding legs — no row of their own, they hang under their
  // parent («⤷»), yet stay in rows so driver / vehicle availability and returns count from the LAST leg.
  const legs = {};
  rows.forEach((r) => {
    const rot = recOf(r)?.fields?.['Rotation ID'];
    if (rot) { r.legOf = rot; (legs[rot] = legs[rot] || []).push(r); }
  });
  Object.values(legs).forEach((a) => a.sort((x, y) => String(recOf(x)?.fields?.['Loading DateTime'] || '').localeCompare(String(recOf(y)?.fields?.['Loading DateTime'] || ''))));
  // A rota leg in ANOTHER week than its parent (owner 8/11/2026, #644 Thu 5/11 → leg #677 Sat 7/11): it hung
  // under a parent this board does not draw, and the parent's week does not read it, so it was drawn on
  // neither. Now, when no drawn row of this week carries its parent, it stands in its own day as a leg row
  // of its own (crossLeg = the parent's id: no number, «↳», like every leg), and the parent's week says
  // «συνέχεια» (contLegs below). A leg in its parent's week stays exactly as before. Imports of another
  // week (adj) keep today's place.
  const impIdsOf = (oid) => { const ir = rows.find((x) => x.type === 'import' && (x.orderId === oid || (x.orderIds || []).includes(oid))); return ir ? ir.orderIds : [oid]; };
  const carriedBy = (r) => { const ids = new Set([...(r.orderIds || []), r.orderId]); if (r.importId) impIdsOf(r.importId).forEach((id) => ids.add(id)); return ids; };
  const carried = new Set();
  rows.forEach((r) => { if (!r.legOf && !r.adj) carriedBy(r).forEach((id) => carried.add(id)); });
  Object.keys(legs).forEach((rot) => {
    if (carried.has(rot)) return;
    legs[rot] = legs[rot].filter((r) => { if (r.adj) return true; delete r.legOf; r.crossLeg = rot; return false; });
    if (!legs[rot].length) delete legs[rot];
  });
  // The parent's side: legs read with the board's window but dated in another week (opt.away = those records,
  // never on this board) are named under the row that carries their parent: [{ id, dt }] by date.
  const onBoard = new Set([...(exports || []), ...(imports || [])].map((x) => x.id));
  const away = (opt.away || []).filter((a) => a && !onBoard.has(a.id) && (a.fields || {})['Rotation ID']);
  if (away.length) {
    rows.forEach((r) => {
      if (r.legOf || r.adj || r.crossLeg) return;
      const ids = carriedBy(r);
      const cont = away.filter((a) => ids.has(a.fields['Rotation ID']))
        .map((a) => ({ id: a.id, dt: rowDt(a.fields, a.fields.Direction === 'Import' ? 'import' : 'export', dayOf) }))
        .sort((x, y) => String(x.dt).localeCompare(String(y.dt)));
      if (cont.length) r.contLegs = cont;
    });
  }
  // Split (owner 6/9, FEATURES.ORDER_SPLIT): a leg renders nested under its parent's row, because the dispatcher
  // reads «this order» as ONE line though it moves in two trucks. Depth is one (migration 018 CHECK).
  const splitLegs = {};
  if (opt.split) {
    rows.forEach((r) => {
      if (r.orderIds && r.orderIds.length > 1) return;   // groupage: split not offered on groups
      const rec = recOf(r);
      const parentId = rec && _linkId(rec.fields?.['Parent Order']);
      if (!parentId) return;
      r.splitLegOf = parentId;
      r.splitLegNo = rec.fields['Leg No'] || null;
      (splitLegs[parentId] = splitLegs[parentId] || []).push(r);
    });
    Object.values(splitLegs).forEach((a) => a.sort((x, y) => (x.splitLegNo || 0) - (y.splitLegNo || 0)));
    rows.forEach((r) => { const pid = (r.orderIds && r.orderIds[0]) || r.orderId; if (splitLegs[pid]) r.hasSplitLegs = true; });
  }
  return { rows, legs, splitLegs, created: seq };
}

// An import row standing on the stock shelf instead of a day (Φ1): unmatched, alone, and its
// order a loose piece. The board asks it only while it shows the shelf (stock on, not warehouse).
// fieldsOf(row) → its order's fields; asked only after the cheap tests.
function shelvedRow(row, fieldsOf, isLoose) {
  if (!row || row.type !== 'import' || row.matchedTo || (row.orderIds || []).length > 1) return false;
  const f = fieldsOf(row);
  return !!f && !!isLoose(f);
}

// The earliest of some datetimes by local day (a tie of days: the earlier text), '' when none. With ws, a member
// of another week is left out while one of THIS week exists: a group whose member loads in the previous week (the
// imports are read ±8 days) stays on this week's day, never on a day section outside Σαβ–Παρ (code review 11/11).
function _minInWeek(dts, dayOf, ws) {
  let c = (dts || []).filter(Boolean);
  if (ws) { const we = _addDay(ws, 6), inW = c.filter((v) => { const d = dayOf(v); return d >= ws && d <= we; }); if (inW.length) c = inW; }
  return c.reduce((m, v) => (!m || dayOf(v) < dayOf(m) || (dayOf(v) === dayOf(m) && String(v) < String(m)) ? v : m), '');
}
// The day a group is filed by (owner 11/11/2026): the earliest rowDt of its orders' fields (fs), this week's first.
// The board's day sections (boardNumbers) and its date ticks (weekly_intl_v2 _rowDayOf) read the same rule.
function groupDt(fs, type, dayOf, ws) {
  return _minInWeek((fs || []).filter(Boolean).map((f) => rowDt(f, type, dayOf)), dayOf, ws);
}

// The board's days and its numbers (§e numbering): exports by DELIVERY day (loading day without
// one), import-only rows by LOADING day; the week's seven days first (seeded from ws), then the
// «μεταφέρθηκε» days (outOfWindow) after Friday; inside a day the exports, then the import-only
// rows, each by dayRowOrder (the «μεταφέρθηκε» days by their datetime alone). Numbers run 1, 2, 3 …
// over the whole week in that order. Left out, as on the board: rota and split legs (they hang
// under their row), imports of another week (adj), imports drawn inside their export (matchedTo),
// shelved imports; a leg of another week's parent (crossLeg) stands in its own day, in `legs`,
// without a number. o = { ws, dayOf, fOf(row) → the row's first order's fields, fsOf(row) → every order's fields
// (a group's day = groupDt, its members' earliest; left out, the lead's), shelved(row) }.
// → { days: [{ date, extra, exps, imps, legs }], no: Map(row → n) }
function boardNumbers(rows, o) {
  const opt = o || {}, fOf = opt.fOf, dayOf = opt.dayOf, shelved = opt.shelved || (() => false);
  // A group (orderIds > 1) is filed by the EARLIEST of its orders, not by its lead's (owner 11/11/2026, W47: two
  // grouped exports delivering Sun and Tue sat on Tuesday): groupDt. opt.fsOf(row) → the fields of every order of
  // the row; left out, the lead alone, as before. The lead's Veroia Switch still orders the day.
  // A «μεταφέρθηκε» row (outOfWindow, decided by the lead in boardRows) keeps its lead's real day: an in-week member
  // would open a second section dated inside the week after Friday (code review 11/11).
  const fsOf = (r) => (r.outOfWindow || !opt.fsOf ? [fOf(r)] : opt.fsOf(r));
  const minOf = (r, pick) => _minInWeek((fsOf(r) || []).filter(Boolean).map(pick), dayOf, opt.ws);
  const fileDt = (r, type) => groupDt(fsOf(r), type, dayOf, opt.ws);
  const expRows = (rows || []).filter((r) => r.type === 'export' && !r.legOf && !r.splitLegOf && !r.crossLeg);
  const impRows = (rows || []).filter((r) => r.type === 'import' && !r.legOf && !r.adj && !r.splitLegOf && !r.crossLeg && !shelved(r));
  const legRows = (rows || []).filter((r) => r.crossLeg && !r.adj);   // a leg of another week's parent: its own day, no number
  const groups = {}, extra = {};
  const slot = (b, k) => (b[k] = b[k] || { date: k, exps: [], imps: [], legs: [] });
  if (opt.ws) { let d = opt.ws; for (let i = 0; i < 7; i++) { slot(groups, d); d = _addDay(d, 1); } }
  expRows.forEach((r) => { const k = dayOf(fileDt(r, 'export')); slot(r.outOfWindow ? extra : groups, k).exps.push(r); });
  impRows.forEach((r) => { const k = dayOf(fileDt(r, 'import')); slot(r.outOfWindow ? extra : groups, k).imps.push(r); });
  legRows.forEach((r) => { const k = dayOf(rowDt(fOf(r), r.type, dayOf)); slot(r.outOfWindow ? extra : groups, k).legs.push(r); });
  const byDate = (a, b) => (a.date || '~').localeCompare(b.date || '~');
  // Inside a day, by the earliest stop of the field's end in place of the field (no loading fallback:
  // an export without a delivery keeps its old place), keyed once per row.
  const keys = new Map();
  const keyed = (r, field) => {
    if (!keys.has(r)) { const f = fOf(r), t = field === 'Delivery DateTime' ? 'export' : 'import'; keys.set(r, { 'Veroia Switch': f['Veroia Switch'], [field]: minOf(r, (x) => _earliestDt(x, t, dayOf)) }); }
    return keys.get(r);
  };
  const byText = (field) => (a, b) => String(keyed(a, field)[field] || '').localeCompare(String(keyed(b, field)[field] || ''));
  const byRule = (field) => (a, b) => dayRowOrder(keyed(a, field), keyed(b, field), field);
  const days = [], no = new Map();
  let n = 0;
  const take = (g, isExtra) => {
    const imps = g.imps.filter((r) => !r.matchedTo);   // a matched import lives inside its export row
    g.exps.sort(isExtra ? byText('Delivery DateTime') : byRule('Delivery DateTime'));
    imps.sort(isExtra ? byText('Loading DateTime') : byRule('Loading DateTime'));
    g.exps.forEach((r) => no.set(r, ++n));
    imps.forEach((r) => no.set(r, ++n));
    const legs = g.legs.slice().sort((a, b) => String(rowDt(fOf(a), a.type, dayOf)).localeCompare(String(rowDt(fOf(b), b.type, dayOf))));
    days.push({ date: g.date, extra: isExtra, exps: g.exps, imps, legs });
  };
  Object.values(groups).sort(byDate).forEach((g) => take(g, false));
  Object.values(extra).sort(byDate).forEach((g) => take(g, true));
  return { days, no };
}

// The Weekly International's number of every order of a week, from ANY page's own read of
// ORDERS (owner 2/11/2026: «Παραγγελίες › Εβδομάδα» shows it, the pallets weekly view will):
// the board's own rules above on those records, cut as the board reads them — the two reads
// ±8 days around the week (readWindow; the Worker's IS_AFTER / IS_BEFORE = strictly after
// `from` 00:00 UTC, strictly before `to` 00:00 UTC, with the database in UTC), cancelled
// orders too (the board's reads keep them), in the Worker's read order (by id: a group's lead
// depends on it). Not a second count. o = { recs (international ORDERS records), wsDate (the
// Saturday, a LOCAL Date at midnight), dayOf (toLocalDate), split (FEATURES.ORDER_SPLIT),
// shelf (the board shows its stock shelf: stock on, not the warehouse role), isLoose
// (WI_INTERNAL.loose) }. → Map(order rec id → n); an order missing from it is on no numbered
// line of that week's board («—» on screen).
// weekBoard: the same, keeping the board's rows (built) and its read (byId) — «Εβδομάδα» finds the board line of an
// order with it, to show that line's assignment document (owner 2/11, «μόνο το έγγραφο της ανάθεσης να δω»).
function weekNumbers(o) {
  const b = weekBoard(o);
  return numberOf(b.built, b.no);
}
function weekBoard(o) {
  const dayOf = o.dayOf, wsD = o.wsDate;
  const weD = new Date(wsD); weD.setDate(wsD.getDate() + 6);
  const ws = dayOf(wsD), we = dayOf(weD), win = readWindow(wsD, dayOf);
  const lo = Date.parse(win.from + 'T00:00:00Z'), hi = Date.parse(win.to + 'T00:00:00Z');
  const inWin = (v) => { const t = Date.parse(v || ''); return !Number.isNaN(t) && t > lo && t < hi; };
  const f = (r) => r.fields || {};
  // the Postgres id ('Order ID', else the view's 'Order No'): the Worker reads by it
  const pg = (r) => { const v = f(r)['Order ID'] != null && f(r)['Order ID'] !== '' ? f(r)['Order ID'] : f(r)['Order No']; const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : Infinity; };
  const recs = (o.recs || []).filter((r) => f(r).Type === 'International').sort((a, b) => pg(a) - pg(b));
  const exps = weekExports(recs.filter((r) => f(r).Direction === 'Export' && (inWin(f(r)['Delivery DateTime']) || inWin(f(r)['Loading DateTime']))), ws, we, dayOf);
  const imps = recs.filter((r) => f(r).Direction === 'Import' && inWin(f(r)['Loading DateTime']));
  const built = boardRows(exps, imps, { ws, we, dayOf, split: !!o.split });
  const byId = new Map([...exps, ...imps].map((r) => [r.id, r]));
  const fOf = (row) => f(byId.get((row.orderIds && row.orderIds[0]) || row.orderId) || {});
  const fsOf = (row) => (row.orderIds || [row.orderId]).map((id) => f(byId.get(id) || {}));
  const nb = boardNumbers(built.rows, { ws, dayOf, fOf, fsOf,
    shelved: (row) => !!o.shelf && shelvedRow(row, (r) => (byId.get(r.orderId) || {}).fields, o.isLoose) });
  return { built, no: nb.no, byId };
}

// order id → the number of the board row that carries it: the row's orders (a group), its matched
// import (and that import's group), the rota legs under it, a split's legs. An order on no
// numbered row (another week's import, a shelved piece, a leg whose row is not numbered) is absent:
// the caller says «—», never a guess. built = boardRows(...), no = boardNumbers(...).no
function numberOf(built, no) {
  const out = new Map();
  const impRowOf = (oid) => built.rows.find((r) => r.type === 'import' && (r.orderId === oid || (r.orderIds || []).includes(oid))) || null;
  for (const [row, n] of no) {
    const ids = new Set([...(row.orderIds || []), row.orderId]);
    if (row.importId) { const ir = impRowOf(row.importId); (ir ? ir.orderIds : [row.importId]).forEach((id) => ids.add(id)); }
    [...ids].forEach((pid) => (built.legs[pid] || []).forEach((lr) => (lr.orderIds || [lr.orderId]).forEach((id) => ids.add(id))));
    const pid = (row.orderIds && row.orderIds[0]) || row.orderId;
    (built.splitLegs[pid] || []).forEach((lr) => (lr.orderIds || [lr.orderId]).forEach((id) => ids.add(id)));
    ids.forEach((id) => { if (id && !out.has(id)) out.set(id, n); });
  }
  return out;
}

// Principle 1 (owner 8/11/2026, order 643): every order the board loaded for its week is DRAWN
// somewhere — a numbered row, a group member, a matched import inside its export, a rota or split
// leg under its row (numberOf), a leg of another week's parent in its own day, or a free import on
// the stock shelf. An order on none of them is
// returned, so the board says so in one strip instead of losing it in silence. Imports of another
// week (adj) are left out: their own week's board draws them. built = boardRows(...),
// no = boardNumbers(...).no, o = { shelved(row) } as given to boardNumbers.
// → [order rec id], in row order; [] when everything is drawn.
function unseenOrders(built, no, o) {
  const shelved = (o && o.shelved) || (() => false);
  const rows = (built && built.rows) || [];
  const seen = numberOf(built, no);
  const shelf = new Map();   // drawn without a number: free imports on the shelf, legs of another week's parent
  rows.forEach((r) => { if (!r.adj && (r.crossLeg || (r.type === 'import' && !r.matchedTo && !r.legOf && !r.splitLegOf && shelved(r)))) shelf.set(r, 0); });
  if (shelf.size) numberOf(built, shelf).forEach((_, id) => seen.set(id, 0));
  const out = [];
  rows.forEach((r) => {
    if (r.adj) return;
    (r.orderIds || [r.orderId]).forEach((id) => { if (id && !seen.has(id) && !out.includes(id)) out.push(id); });
  });
  return out;
}

// ─── §b Flag decision ──────────────────────────────────────────────────
// Three states. Anything else — a typo, `true`, undefined, a stale cached
// config.js without the key — reads as 'off' (principle 5: unknown = closed).
// The caller compares normFlag(x) with x to send its one console.warn: this
// file never logs, so the rule stays testable.
function normFlag(flag) {
  return flag === 'pilot' || flag === 'on' ? flag : 'off';
}

/** → 'v4' | 'old'. 'off' overrides every opt-in, so the owner never has to
 *  ask each user to visit ?wi4=0 to stop the pilot. */
function v2Decide({ flag, pilot, user, optIn } = {}) {
  const f = normFlag(flag);
  if (f === 'off') return 'old';
  if (optIn === '0') return 'old';
  if (f === 'on') return 'v4';
  const list = Array.isArray(pilot) ? pilot : [];
  return optIn === '1' || (user != null && user !== '' && list.includes(user)) ? 'v4' : 'old';
}

// ─── §d.1 Points ───────────────────────────────────────────────────────
const POINTS_DEFAULTS = freeze({ min: 56, gap: 8, badge: 12, chip: 34, placeMin: 46, dateTick: false });

/**
 * Day breaks, ONE rule for both boards (owner 2/11: «Τρίτη 2 σημεία και 1
 * Τετάρτη»; the Weekly National v5 reads it too, «Ναι, και στα Εθνικά»):
 * days = each point's day (YYYY-MM-DD or empty) in drawing order, day0 = the
 * day the cell's header already states. → for each point its day where it
 * differs from the point before it (the last one with a day; day0 for the
 * first), else null. An empty day neither breaks nor resets.
 */
function dayBreaks(days, day0) {
  let prev = day0 || '';
  return (Array.isArray(days) ? days : []).map((d0) => {
    const d = d0 || '';
    const b = d && prev && d !== prev ? d : null;
    if (d) prev = d;
    return b;
  });
}

/**
 * stops = [{n, label, place, pallets, done, delayH}] in stop order;
 * widthPx = one points column, measured once per paint.
 * → {shown:[stop + {badge, tick}], more:{count, pallets, hidden, title}|null, hidePlace}
 *
 * Fit rule (rules 1–2), with the opts as given:
 *   all n (n ≤ 4):      n·min + (n−1)·gap            ≤ width
 *   k + «+N» chip:      k·min + (k−1)·gap + gap + chip ≤ width
 * With the defaults this is the board's own drawing: at 207px a groupage of
 * five shows 2 points + «+3» (Figma 1097:2895). It also means a 4-stop column
 * at 200–207px shows 2 + «+2», not the «3 + +1» the §d.1 prose estimated
 * (3 points + chip need 226px). Reported to the coordinator, not bent here.
 *
 * Day breaks (owner 2/11): a stop may carry `day` (YYYY-MM-DD). A stop whose
 * day differs from the stop before it (the last one with a day; for the first
 * stop, opts.day0 = the day the row sits on) gets brk = its day, else null; the renderer draws the divider INSIDE that point (no width of
 * its own: a 40px divider pushed #616's third point behind «+1» at 1920, the
 * one point the owner asked to see), so the fit rule is unchanged. Any
 * different day counts, an EARLIER one too (#618: stop 2 a day before stop 1;
 * the points come sorted by date, _wk3Arr, owner 10/8, so its Monday point is
 * first on a row that sits on Tuesday and day0 names it). A new day
 * behind «+N» is told by the chip: more.brk = {day, edge}, edge = the FIRST
 * hidden stop starts it (the divider line then stands on the chip), else it
 * starts inside the fold (the chip names the day without the line, which would
 * claim every hidden stop is that day).
 */
function points(stops, widthPx, opts) {
  const o = Object.assign({}, POINTS_DEFAULTS, opts || {});
  const list = Array.isArray(stops) ? stops : [];
  const n = list.length;
  if (!n) return { shown: [], more: null, hidePlace: false };
  const width = Number(widthPx);
  // Unmeasured width (column not in the DOM yet): never shrink on a guess,
  // fall back to the plain rule — ≤4 all, 5+ first 3 — and let the next paint
  // measure.
  const measured = Number.isFinite(width) && width > 0;
  const brk = dayBreaks(list.map((s) => s && s.day), o.day0);
  const allFit = (k) => k * o.min + (k - 1) * o.gap <= width;
  const chipFit = (k) => k * o.min + k * o.gap + o.chip <= width;
  let k;
  if (n <= 4) {
    if (!measured || allFit(n)) k = n;
    else { k = n - 1; while (k > 1 && !chipFit(k)) k--; }
  } else {
    k = 3;
    if (measured) while (k > 1 && !chipFit(k)) k--;
  }
  // At least one point always shows: a column of only «+N» would hide the
  // one thing the dispatcher reads first.
  k = Math.max(1, k);
  const hidden = list.slice(k);
  const more = hidden.length ? {
    count: hidden.length,
    pallets: hidden.reduce((s, x) => s + (Number(x && x.pallets) || 0), 0),
    hidden,
    title: hidden.map((x) => [x && x.label, x && x.place].filter(Boolean).join(' · ')).join('\n'),
    brk: (() => { const i = brk.slice(k).findIndex(Boolean); return i < 0 ? null : { day: brk[k + i], edge: i === 0 }; })(),
  } : null;
  let hidePlace = false;
  if (measured) {
    const perPoint = (width - (k - 1) * o.gap - (more ? o.gap + o.chip : 0)) / k;
    hidePlace = perPoint - o.badge < o.placeMin;
  }
  const single = n === 1;
  const shown = list.slice(0, k).map((s, i) => Object.assign({}, s, {
    // Rule 6: a single stop has no number badge (name and place as today).
    badge: single ? null : (s && s.n != null ? s.n : i + 1),
    // Rule 5: one stop + a date chip that already carries the ✓ → no second ✓.
    tick: !!(s && s.done) && !(single && o.dateTick),
    brk: brk[i],
  }));
  return { shown, more, hidePlace };
}

// ─── §d.2 Flags ────────────────────────────────────────────────────────
// Words: today's vocabulary (rules sheet 958:747). One table, read by the row
// rail, the day header and the queue.
// No national code (owner 11/10 21:20, overrides Figma sheet 15 1117:2676 and
// rule 985:1114): a leg without carrier, a missing national load or an unread
// national read is Weekly National's work, and DATE_MISMATCH is obsolete under
// the one synchronized VS date. Removed HERE, at the one source, so the queue,
// its count, the closed-day marker and the rails all drop them together; the
// ΠΡΟΣ/ΑΠΟ ΒΕΡΟΙΑ tiles still show the national state, as information.
const TEXT = freeze({
  NO_TRUCK: 'χωρίς φορτηγό',
  EMPTY_RETURN: 'κενό γύρισμα',
  OVER_33: 'πάνω από 33π',
  LATE: 'καθυστέρηση',
  PREORDER: 'pre-order χωρίς μετατροπή',
  SAVE_FAILED: 'δεν αποθηκεύτηκε',
  RELAY_NO_DRIVER: 'τοπική χωρίς οδηγό',
  // An export whose matched import was not read with this week (outside the
  // ±8-day window, or cancelled): unknown ≠ empty (§d.2a), never an open slot.
  MATCH_UNREAD: 'εισαγωγή εκτός προβολής',
  // A load near capacity with members whose pallets were never written: «28»
  // may be 35 (review 11/10) — a look, not a verdict.
  PALLETS_UNKNOWN: 'παλέτες χωρίς καταγραφή',
});

// The one button a queue card offers (§e #2); WI4Actions._queueAct maps it to
// the existing opener — one name per action, the SAME names it switches on
// (a 'loose' here once matched no case there). Never a write by itself.
const ACT = freeze({
  NO_TRUCK: 'assign', EMPTY_RETURN: 'newImport', SOURCE_UNKNOWN: 'retry',
  OVER_33: 'open', SAME_DAY: 'open', LATE: 'open', PREORDER: 'convert',
  SAVE_FAILED: 'retry', STOCK_LATE: 'pieces', STOCK_LOOSE: 'pieces', STOCK_LOT: 'lot',
  RELAY_NO_DRIVER: 'relay', MATCH_UNREAD: 'open', PALLETS_UNKNOWN: 'open',
});

const RANK = freeze({ red: 2, amber: 1 });
const worst = (reasons) => reasons.reduce((w, r) => ((RANK[r.level] || 0) > (RANK[w] || 0) ? r.level : w), null);
const reason = (code, level, text, date, extra) =>
  Object.assign({ code, level, text, act: ACT[code] || 'open', date: DAY_RE.test(String(date || '')) ? date : null }, extra || {});

// red when the day is today+1 or earlier (past included); no date = red too.
const nearLevel = (d, today) => { const k = dayDiff(today, d); return k === null || k <= 1 ? 'red' : 'amber'; };

/**
 * facts (built impurely by WIV2.factsOf):
 *   {kind:'export'|'import'|'leg'|'split'|'relay', saved, partner, loadDate,
 *    delDate, returnDate, returnPlace?, hasReturn,
 *    stockState, pallets, palletsUnknown?,
 *    sameDayClash:string|null, late, preorder:{level}|null, syncErr, executing,
 *    matchUnread?}
 * → {level:'red'|'amber'|null, reasons:[{code, level, text, act, date}]}
 *
 * No national fact is read (owner 11/10 21:20, see TEXT): a national leg —
 * with or without carrier, missing, unread — and a VS date pair never raise
 * a reason on Weekly Intl.
 *
 * SOURCE_UNKNOWN is board-level (one per failed source), never per row: see
 * sourceReasons().
 */
function flags(facts, today) {
  const f = facts || {};
  const out = [];
  const truckRow = f.kind === 'export' || f.kind === 'import';

  // NO_TRUCK — never silent (§d.2): red today–tomorrow, amber beyond, never
  // nothing. Only full rows carry an assignment: a rota leg shares its truck,
  // a split header's legs are full rows of their own, a relay is a local
  // driver. A leg in its OWN week (xweek, owner 8/11/2026) has no parent row on that board to share a
  // truck with: its missing truck is said there, or it is said nowhere.
  if ((truckRow || (f.kind === 'leg' && f.xweek)) && !f.saved && !f.partner) out.push(reason('NO_TRUCK', nearLevel(f.loadDate, today), TEXT.NO_TRUCK, f.loadDate));

  // EMPTY_RETURN — own truck, export, no import. Rules sheet: nothing while
  // R > today+2, amber from R−2 to R, red after R. No R = amber: we know the
  // truck comes back empty, not since when. A partner never gets it (the
  // cell says «Μόνο εξαγωγή · συνεργάτης», a fact, not a flag).
  if (f.kind === 'export' && f.saved && !f.partner && !f.hasReturn) {
    const k = dayDiff(f.returnDate, today); // today − R
    const level = k === null ? 'amber' : k > 0 ? 'red' : k >= -2 ? 'amber' : null;
    if (level) {
      const from = dayLabel(f.returnDate);
      const text = [TEXT.EMPTY_RETURN, from ? 'από ' + from : '', f.returnPlace || ''].filter(Boolean).join(' · ');
      out.push(reason('EMPTY_RETURN', level, text, f.returnDate, { age: k === null ? null : Math.max(0, k) }));
    }
  }

  // 33 pallets is allowed (decision 9/10); only more is a flag. `pallets`
  // sums the members that HAVE a figure, so a load over 33 with one member
  // unwritten is still OVER_33; near 33 with a gap it is a look, never «fine».
  if (Number(f.pallets) > 33) out.push(reason('OVER_33', 'amber', TEXT.OVER_33, f.loadDate));
  else if (Number(f.palletsUnknown) > 0 && Number(f.pallets) >= 28) out.push(reason('PALLETS_UNKNOWN', 'amber', TEXT.PALLETS_UNKNOWN, f.loadDate));
  if (f.matchUnread) out.push(reason('MATCH_UNREAD', 'amber', TEXT.MATCH_UNREAD, f.loadDate));
  if (f.sameDayClash) out.push(reason('SAME_DAY', 'amber', String(f.sameDayClash), f.loadDate));
  if (f.late) out.push(reason('LATE', 'amber', TEXT.LATE, f.delDate));
  // A local relay (live since 6/10) drawn «ΠΡΟΣ ΑΝΑΘΕΣΗ»: the same shape as
  // NO_TRUCK — red today–tomorrow, amber beyond, never silent — or a day of
  // assigned trucks would read «nothing to do» with a driverless relay in it.
  if (f.kind === 'relay' && f.relayNoDriver) out.push(reason('RELAY_NO_DRIVER', nearLevel(f.loadDate, today), TEXT.RELAY_NO_DRIVER, f.loadDate));
  const pl = f.preorder && f.preorder.level;
  if (pl === 'red' || pl === 'amber') out.push(reason('PREORDER', pl, TEXT.PREORDER, f.loadDate));
  if (f.syncErr) out.push(reason('SAVE_FAILED', 'red', TEXT.SAVE_FAILED, f.loadDate, { detail: String(f.syncErr) }));

  return { level: worst(out), reasons: out };
}

/**
 * Board-level reasons for sources that did not load (§d.2a «Άγνωστο ≠ άδειο»).
 * src = {crossWeekOk, relayState, stockState}. One reason per failed source:
 * a failed read is never a smaller number, it is an item that says so. The
 * national read is not one of them (owner 11/10 21:20): its failure is said on
 * the national tiles («—», titled «απέτυχε …»), never as Weekly Intl work.
 */
const SOURCE_NAMES = freeze({ crossWeek: 'φορτώσεις W+1', relay: 'τοπικές παραδόσεις/φορτώσεις', stock: 'απόθεμα' });
function sourceReasons(src) {
  const s = src || {};
  const out = [];
  const unk = (source) => out.push(reason('SOURCE_UNKNOWN', 'amber',
    `Δεν φορτώθηκε: ${SOURCE_NAMES[source]} — δεν σημαίνει ότι δεν υπάρχουν`, null, { source }));
  if (s.crossWeekOk === false) unk('crossWeek');
  if (s.relayState === 'err') unk('relay');
  if (s.stockState === 'failed') unk('stock');
  return out;
}

// ─── §d.3 Day header, plurals, queue ───────────────────────────────────
// Decided copy, round 11. [singular, plural].
const PLURAL = freeze({
  truck: freeze(['φορτηγό', 'φορτηγά']),
  load: freeze(['φορτίο', 'φορτία']),
  emptyReturn: freeze(['κενό γύρισμα', 'κενά γυρίσματα']),
  pending: freeze(['εκκρεμές', 'εκκρεμή']),
  urgent: freeze(['επείγον', 'επείγοντα']),
  day: freeze(['ημέρα', 'ημέρες']),
  relayNoDriver: freeze(['τοπική χωρίς οδηγό', 'τοπικές χωρίς οδηγό']),
});
function plural(n, key) {
  const w = PLURAL[key];
  // A missing key is a coding error: loud here, never a blank on the board.
  if (!w) throw new Error('WI4.plural: unknown key ' + key);
  return `${n} ${Number(n) === 1 ? w[0] : w[1]}`;
}

/**
 * rowsFacts = every facts object of ONE day: rows, sub-rows and split legs
 * all count, so the totals equal the queue (round 11).
 * → {trucks, byCode:{CODE:n}, todayEmpty, emptyOldest}
 *   trucks      = full rows (export / import-only) of the day;
 *   todayEmpty  = empty returns that start today;
 *   emptyOldest = the oldest empty-return gap in days (0 = none past).
 */
function dayCounts(rowsFacts, today) {
  const byCode = {};
  let trucks = 0, todayEmpty = 0, emptyOldest = 0;
  for (const f of rowsFacts || []) {
    if (f && (f.kind === 'export' || f.kind === 'import')) trucks++;
    for (const r of flags(f, today).reasons) {
      byCode[r.code] = (byCode[r.code] || 0) + 1;
      if (r.code === 'EMPTY_RETURN') {
        if (r.date && r.date === today) todayEmpty++;
        if (r.age != null && r.age > emptyOldest) emptyOldest = r.age;
      }
    }
  }
  return { trucks, byCode, todayEmpty, emptyOldest };
}

/** «4 φορτηγά · 1 χωρίς φορτηγό · 2 κενά γυρίσματα (1 από σήμερα)». No
 *  national words (owner 11/10 21:20): national legs are Weekly National's. */
function dayText(counts) {
  const c = counts || {};
  const by = c.byCode || {};
  const parts = [plural(c.trucks || 0, 'truck')];
  if (by.NO_TRUCK) parts.push(`${by.NO_TRUCK} ${TEXT.NO_TRUCK}`);
  if (by.EMPTY_RETURN) {
    // «(N από σήμερα)» when some start today, else «(N ημέρες)» with the
    // oldest gap; no parenthesis when every gap is still ahead.
    const paren = c.todayEmpty ? ` (${c.todayEmpty} από σήμερα)` : c.emptyOldest > 0 ? ` (${plural(c.emptyOldest, 'day')})` : '';
    parts.push(plural(by.EMPTY_RETURN, 'emptyReturn') + paren);
  }
  return parts.join(' · ');
}

// Queue groups: what stops a load, what costs, what wants a look. Any code
// not listed is 'look'; an item may carry its own `group`.
const GROUP = freeze({
  NO_TRUCK: 'stop', SAVE_FAILED: 'stop', RELAY_NO_DRIVER: 'stop',
  EMPTY_RETURN: 'cost', STOCK_LATE: 'cost',
});
const GROUP_ORDER = freeze({ stop: 0, cost: 1, look: 2 });

/** The queue items of one facts object, keyed by order id (`key`) and the
 *  row it is drawn in (`rowKey`), so a card resolves its row at click time. */
function items(facts, today, ids) {
  const k = ids || {};
  return flags(facts, today).reasons.map((r) => queueItem(r, k.key, k.rowKey));
}
function queueItem(r, key, rowKey) {
  return Object.assign({}, r, { group: r.group || GROUP[r.code] || 'look', key: key == null ? '' : String(key), rowKey: rowKey == null ? null : rowKey });
}

/**
 * → a NEW array, ordered: red before amber; inside a level stop → cost → look;
 *   stop by nearest date, cost by oldest gap (age desc, then date), look by
 *   date. No date sorts first (unknown is never «plenty of time»). Ties break
 *   by key (order id), never by fetch order. Items with no level are dropped.
 */
function queue(list, today) {
  const t = (d) => (DAY_RE.test(String(d || '')) ? d : '');
  const age = (x) => (x.age != null ? x.age : (() => { const k = dayDiff(x.date, today); return k === null ? Infinity : k; })());
  return (list || []).filter((x) => x && RANK[x.level]).map((x) => Object.assign({}, x, { group: x.group || GROUP[x.code] || 'look' }))
    .sort((a, b) => {
      if (RANK[a.level] !== RANK[b.level]) return RANK[b.level] - RANK[a.level];
      const ga = GROUP_ORDER[a.group] ?? 2, gb = GROUP_ORDER[b.group] ?? 2;
      if (ga !== gb) return ga - gb;
      if (a.group === 'cost') { const d = age(b) - age(a); if (d) return d > 0 ? 1 : -1; }
      const da = t(a.date), db = t(b.date);
      if (da !== db) return da < db ? -1 : 1;
      const ka = String(a.key || ''), kb = String(b.key || '');
      if (ka !== kb) return ka < kb ? -1 : 1;
      return String(a.code) < String(b.code) ? -1 : String(a.code) > String(b.code) ? 1 : 0;
    });
}

/** days = [{date, facts:[…]}] → the first day (by date) holding a red reason,
 *  else today. It only picks where the board scrolls to: no rule closes a
 *  day any more — every day is open until the user closes it (owner 12/10;
 *  the rules sheet's «Σύμπτυξη ημέρας», WI4.collapsible, is gone). */
function openDay(days, today) {
  const sorted = (days || []).filter((d) => d && DAY_RE.test(String(d.date || ''))).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const hit = sorted.find((d) => (d.facts || []).some((f) => flags(f, today).level === 'red'));
  return hit ? hit.date : today;
}

// ─── §d.4 Keyboard ─────────────────────────────────────────────────────
// By e.code, so a Greek layout works (A=Α, D=Δ, P=Π, N=Ν, O=Ο). The «?» sheet
// and the menu hint letters read THIS list, so they show only keys that work.
// Not bound tonight (owner question, PLAN §5.2): ←/→ (week stays in
// core/ui.js:407), [ ], E/I, ⌘Z (no undo exists).
const KEYMAP = freeze([
  freeze({ code: 'ArrowUp', shift: false, action: 'rowPrev', keys: '↑', label: 'προηγούμενη σειρά', needsRow: false }),
  freeze({ code: 'ArrowDown', shift: false, action: 'rowNext', keys: '↓', label: 'επόμενη σειρά', needsRow: false }),
  freeze({ code: 'Enter', shift: false, action: 'menu', keys: 'Enter', label: 'μενού φορτίου', needsRow: true }),
  freeze({ code: 'KeyA', shift: false, action: 'assign', keys: 'A', label: 'ανάθεση', needsRow: true }),
  freeze({ code: 'KeyD', shift: false, action: 'date', keys: 'D', label: 'ημερομηνία', needsRow: true }),
  freeze({ code: 'KeyP', shift: false, action: 'print', keys: 'P', label: 'εκτύπωση / WhatsApp', needsRow: true }),
  freeze({ code: 'KeyN', shift: false, action: 'newImport', keys: 'N', label: 'νέα εισαγωγή (κενό γύρισμα)', needsRow: true }),
  freeze({ code: 'KeyO', shift: false, action: 'open', keys: 'O', label: 'άνοιγμα παραγγελίας', needsRow: true }),
  freeze({ code: 'KeyQ', shift: false, action: 'queueNext', keys: 'Q', label: 'επόμενο της ουράς', needsRow: false }),
  freeze({ code: 'Slash', shift: false, action: 'search', keys: '/', label: 'αναζήτηση', needsRow: false }),
  freeze({ code: 'Slash', shift: true, action: 'help', keys: '?', label: 'όλες οι συντομεύσεις', needsRow: false }),
  freeze({ code: 'Escape', shift: false, action: 'escape', keys: 'Esc', label: 'κλείσιμο / καθάρισμα', needsRow: false }),
]);

/** ev = {code, key, shift, ctrl, meta, alt, targetTag, editable}
 *  st = {menuOpen, panelOpen, popoverOpen, dialogOpen, datePanelOpen,
 *        modalOpen, paletteOpen, onPage, rootPresent, hasFocusRow}
 *  → action string | null. Nothing destructive is ever bound. */
function keyAction(ev, st) {
  const e = ev || {}, s = st || {};
  if (!s.onPage || !s.rootPresent) return null;
  if (e.ctrl || e.meta || e.alt) return null;                  // ⌘K, ⌘Z keep today's meaning
  const tag = String(e.targetTag || '').toUpperCase();
  if (e.editable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return null;
  // Open overlays own their keys (e.g. _wiCtxKeydown gives ↑↓/Esc in #wi-ctx).
  if (s.menuOpen || s.panelOpen || s.popoverOpen || s.dialogOpen || s.datePanelOpen || s.modalOpen || s.paletteOpen) return null;
  const hit = KEYMAP.find((k) => k.code === e.code && k.shift === !!e.shift);
  if (!hit) return null;
  if (hit.needsRow && !s.hasFocusRow) return null;
  return hit.action;
}

/** The key shown next to a menu item / in the «?» sheet ('' when unbound). */
function keyHint(action) {
  const k = KEYMAP.find((x) => x.action === action);
  return k ? k.keys : '';
}

// ─── §d.5 Conflict data ────────────────────────────────────────────────
const CONFLICT_LABELS = freeze(['Truck', 'Trailer', 'Driver', 'Partner', 'Partner Truck Plates',
  'Is Partner Trip', 'Matched Import ID', 'Loading DateTime', 'Delivery DateTime', 'VS CD Date']);
const DATE_LABELS = freeze(['Loading DateTime', 'Delivery DateTime', 'VS CD Date']);
const CHECKBOX_LABELS = freeze(['Is Partner Trip']);
// Strict on purpose: V8's Date.parse accepts '12' and 'AB 1 2', so a looser
// rule would call two different plates equal and hide a real conflict.
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function isoEpoch(s) {
  let v = s;
  // A datetime without a zone is UTC, as Postgres stores it — never browser
  // local time, or Athens and the Worker (UTC) would disagree on one pair.
  if (v.includes('T') && !/(Z|[+-]\d{2}:?\d{2})$/.test(v)) v += 'Z';
  v = v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  return Date.parse(v);
}

/** MUST stay equal to the Worker's expectSame: both run
 *  worker/test/fixtures/expect-vectors.json (one file, principle 3). */
function sameValue(a, b, label) {
  if (CHECKBOX_LABELS.includes(label)) {
    // A nullable boolean that rt_sync coalesces to false: absent ≡ false.
    if (a === false) a = null;
    if (b === false) b = null;
  }
  const empty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
  if (empty(a) && empty(b)) return true;
  if (empty(a) || empty(b)) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    const norm = (v) => (Array.isArray(v) ? v : [v]).map((x) => String(x).trim()).sort().join('\0');
    return norm(a) === norm(b);
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const num = (v) => (typeof v === 'number' ? v : String(v).trim() === '' ? NaN : Number(v));
    const na = num(a), nb = num(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  if (DATE_LABELS.includes(label) && typeof a === 'string' && typeof b === 'string' && ISO_RE.test(a.trim()) && ISO_RE.test(b.trim())) {
    const ea = isoEpoch(a.trim()), eb = isoEpoch(b.trim());
    if (Number.isFinite(ea) && Number.isFinite(eb)) return ea === eb;
  }
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return String(a).trim() === String(b).trim();
}

/** changedFields = labels (array) or a fields object; record = the WINTL.data
 *  record the row was painted from. → {label: value-the-user-saw} | undefined. */
function buildExpect(changedFields, record) {
  if (!record || !record.fields) return undefined;
  const labels = Array.isArray(changedFields) ? changedFields : Object.keys(changedFields || {});
  const out = {};
  let n = 0;
  for (const l of labels) {
    if (!CONFLICT_LABELS.includes(l) || Object.prototype.hasOwnProperty.call(out, l)) continue;
    // The facade omits NULL columns (trap 2), so «absent» means «empty».
    // undefined would vanish in JSON.stringify and turn the check off for
    // that label without a sound; null is sent and compared as empty.
    const v = record.fields[l];
    out[l] = v === undefined ? null : v;
    n++;
  }
  return n ? out : undefined;
}

const LABELS_GR = freeze({
  Truck: 'φορτηγό', Trailer: 'ρυμούλκα', Driver: 'οδηγός', Partner: 'συνεργάτης',
  'Partner Truck Plates': 'πινακίδες συνεργάτη', 'Is Partner Trip': 'μεταφορά συνεργάτη',
  'Matched Import ID': 'εισαγωγή', 'Loading DateTime': 'ημερομηνία φόρτωσης',
  'Delivery DateTime': 'ημερομηνία εκφόρτωσης', 'VS CD Date': 'ημερομηνία Βέροιας',
});

function ago(atIso, nowMs) {
  const at = Date.parse(String(atIso || ''));
  if (!Number.isFinite(at) || !Number.isFinite(nowMs)) return '';
  const s = Math.max(0, Math.round((nowMs - at) / 1000));
  // «πριν 0″» read as a glitch (review 11/10): under a minute is «μόλις τώρα».
  if (s < 60) return 'μόλις τώρα';
  const m = Math.round(s / 60);
  if (m < 60) return `πριν ${m}΄`;
  return `πριν ${Math.round(m / 60)}ω`;
}

/**
 * c = the 409 body's error {fields, by, at, current} plus what the dialog
 *     knows: expected (the _expect sent), mine (the user's new values), now (ms),
 *     me (the signed-in username, so my own earlier write is never «άλλος»).
 * labelsGreek = {label: 'λέξη'} (defaults to LABELS_GR); fmt(label, v)
 *     optional value formatter (names for record ids; dates as «Πέμ 8/10»).
 * → {lead, lines:[{label, name, before, theirs, mine}], text}. PLAIN text:
 *   the caller escapes every value (escapeHtml) before it reaches the DOM.
 * Who: a username only when the Worker sent one (AUDIT_READERS); 'user' →
 * «Άλλος χρήστης», 'auto' → «αυτόματη ενημέρωση», null → no name at all
 * rather than a guess. No article before a name: the board cannot know the
 * gender of «Ο/Η».
 */
function describeConflict(c, labelsGreek, fmt) {
  const x = c || {};
  const names = labelsGreek || LABELS_GR;
  const show = (l, v) => {
    if (typeof fmt === 'function') return fmt(l, v);
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return 'κενό';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'ναι' : 'όχι';
    return String(v);
  };
  const when = ago(x.at, x.now);
  const by = x.by;
  let lead;
  // `me` = the signed-in username. A 409 whose author is me is my own earlier
  // write (a second tab, or a board that did not re-read): never «another
  // user» — that contradicts the dispatcher's own memory of the click.
  const mine = typeof by === 'string' && by && by !== 'user' && by !== 'auto' && x.me && by === x.me;
  if (mine) lead = 'Την άλλαξες εσύ (άλλη καρτέλα ή πριν την ανανέωση)';
  else if (by === 'auto') lead = 'Άλλαξε από αυτόματη ενημέρωση';
  else if (by === 'user') lead = 'Άλλος χρήστης την άλλαξε';
  else if (by) lead = `${by} την άλλαξε`;
  else lead = 'Άλλαξε από τότε που την άνοιξες';
  if (when && by && !mine) lead += ' ' + when;
  const fields = Array.isArray(x.fields) ? x.fields : [];
  const lines = fields.map((l) => ({
    label: l,
    name: names[l] || l,
    before: show(l, x.expected ? x.expected[l] : undefined),
    theirs: show(l, x.current ? x.current[l] : undefined),
    mine: show(l, x.mine ? x.mine[l] : undefined),
  }));
  const body = lines.map((ln) => `${lines.length > 1 ? ln.name + ': ' : ''}${ln.before} → ${ln.theirs} · Η δική σου επιλογή: ${ln.mine}`).join(' · ');
  // `question` is returned on its own so the dialog can put it on its own
  // line (sheet 16 E); `text` stays the one-line form.
  return { lead, lines, body, question: 'Ποια κρατάμε;', text: `${lead}${body ? ': ' + body : ''}. Ποια κρατάμε;` };
}

// ─── §d.5 / §g.4 Presence pacing ───────────────────────────────────────
const BEAT_FLOOR = 2500; // the Worker's per-(sub,tab) guard is 2 s; never below 2.5 s

/**
 * → ms until the next beat | null (stop for now: hidden, resume on visible) |
 *   'stop' (stop for the session).
 * failures = consecutive failures including the last one (≥1 when failing).
 * lastStatus 0 = network error.
 */
function beatDelay({ visible, lastInputAgoMs, failures, lastStatus, retryAfterMs, serverNextMs, stop, cfg } = {}) {
  if (!visible) return null;
  if (stop === true || lastStatus === 401 || lastStatus === 403 || lastStatus === 410) return 'stop';
  const n = Math.max(1, Number(failures) || 1);
  const back = (base, cap) => Math.min(cap, base * Math.pow(2, n - 1));
  if (lastStatus === 404) return back(60000, 600000);                      // endpoint not deployed
  if (lastStatus === 0 || (Number(lastStatus) >= 500 && Number(lastStatus) < 600)) return back(15000, 120000);
  // 429 is our own pacing, not an outage: wait what the Worker asked.
  if (lastStatus === 429) return Math.max(BEAT_FLOOR, Number(retryAfterMs) > 0 ? Number(retryAfterMs) : 5000);
  const c = cfg || {};
  const active = Number.isFinite(Number(lastInputAgoMs)) && Number(lastInputAgoMs) < (Number(c.idleAfter) || 120000);
  const base = active ? (Number(c.active) || 5000) : (Number(c.idle) || 30000);
  return Math.max(BEAT_FLOOR, Number(serverNextMs) || 0, base);
}

// ─── §e.9 Per-load menu: sections and icons ───────────────────────────
const TRUCK_FNS = freeze(['_wiPanelAssign', '_wiClear', '_wiStockPanel']);
const IMPORT_FNS = freeze(['_wiUnmatchRow', '_wiUnmatch', '_wiPanelJoinLoad', '_wiStockReturnLone', '_wiPanelWeekShift']);
// Handlers shared by both builders that tell the side by their 2nd argument
// (`…(rowId,true)` = import), e.g. _wiMenuPrint(12,true), _wiPanelGroupBuild(12,true).
const SIDE_ARG_FNS = freeze(['_wiMenuPrint', '_wiPanelGroupBuild']);

/**
 * fn = a handler name or a full onclick string («_wiMenuPrint(12,true);_wiCtxClose()»).
 * from = 'imp' when the item came from _wiImpCtxItems (optional).
 * → 'truck' | 'import' | 'export'. Truck wins: it is drawn once, on top.
 */
function menuSection(fn, from) {
  const s = String(fn || '').trim();
  const m = s.match(/^([A-Za-z_$][\w$]*)\s*(?:\(([^)]*)\))?/);
  const name = m ? m[1] : s;
  if (TRUCK_FNS.includes(name)) return 'truck';
  if (IMPORT_FNS.includes(name)) return 'import';
  if (SIDE_ARG_FNS.includes(name) && m && m[2] != null && String(m[2]).split(',')[1] && String(m[2]).split(',')[1].trim() === 'true') return 'import';
  if (from === 'imp') return 'import';
  return 'export';
}

// handler name → core/icons.js key. «⤷» in old labels gives way to these.
// Glyphs as Figma's menu 1097:3858 / sheet 14 draws them (parity r1, F5): the
// order opens as a load (package), print is a printer, «Καθαρισμός» an x,
// the stock piece a plus, groupage a package, the rota leg corner-down-right,
// the split leg split, unmatch a link, the local relay users.
const MENU_ICON = freeze({
  _wiPanelAssign: 'truck', _wiClear: 'x', _wiStockPanel: 'plus',
  _wk3Edit: 'package', _wiMenuPrint: 'printer', _wiPrintSplitAll: 'printer',
  _wiUnmatchRow: 'link', _wiUnmatch: 'link', _wiPanelJoinLoad: 'plus',
  _wiPanelGroupBuild: 'package', _wiSplit: 'x', _wiCancelGroupMember: 'x',
  _wiPanelRota: 'corner_down_right', _wiPanelConfirmUnlink: 'x', _wiPanelSplit: 'split',
  _wiRejoinLegs: 'route', _wiPanelHandover: 'map_pin', _wiPanelWeekShift: 'clock',
  _wiRelayOpen: 'users', _wiRelayGrpToggle: 'users', _wiRelayConfirmDel: 'trash',
  _wiStockReturn: 'package', _wiStockReturnLone: 'package', _wiStockLotOfRow: 'package',
  editPreorder: 'edit', deletePreorder: 'trash',
  // Not handlers: the «▸» line of a groupage member (a load = the box icon)
  // and of a local relay; the trailing chevron is drawn by WI4Actions.
  member: 'package', relay: 'user', submenu: 'chevron_right',
});

const WI4 = freeze({
  // §b
  normFlag, v2Decide,
  // §d.1
  POINTS_DEFAULTS, points, dayBreaks,
  // §d.2 / §d.2a
  TEXT, ACT, flags, sourceReasons,
  // §d.3
  PLURAL, plural, dayCounts, dayText, GROUP, items, queue, openDay,
  // §d.4
  KEYMAP, keyAction, keyHint,
  // §d.5
  CONFLICT_LABELS, LABELS_GR, sameValue, buildExpect, describeConflict, beatDelay,
  // §e.9
  menuSection, MENU_ICON,
  // shared helpers
  dayDiff, dayLabel, dayRowOrder, rowDt, groupDt,
  // board rows and numbers (one source with «Παραγγελίες › Εβδομάδα», owner 2/11)
  readWindow, weekExports, giSortRecs, boardRows, shelvedRow, boardNumbers, numberOf, unseenOrders, weekNumbers, weekBoard,
});

if (typeof module !== 'undefined') module.exports = WI4; else window.WI4 = WI4;
})();
