// ═══════════════════════════════════════════════════════════════════════════
// VIEW — «Εβδομάδα» of the one «Παραγγελίες» page (modules/orders_hub.js)
//
// Owner 28/9/2026: «να βλέπω συγκεντρωτικά 1 φορά την εβδομάδα πολύ γρήγορα πόσα
// χρήματα έπιασε κάθε RT, συνολικοί τζίροι και αν έχουν όλα τιμολογηθεί».
// v4 (owner 13/10, Figma 1514:8013 — 1518:8013 at 1440, 1518:9099 at 1920,
// states sheet 1519:8013 §01–§12; DECISION_LOG «Παραγγελίες › Εβδομάδα v4»):
// one row = one RT in the mirrored form of Weekly v4
//   RT | ΕΞΑΓΩΓΗ διαδρομή · πελάτης · ΤΠΥ · ποσό ‖ ΑΝΑΘΕΣΗ · Σ RT ‖ ΕΙΣΑΓΩΓΗ (mirror)
// nationals in their own section in the same form (ΚΑΘΟΔΟΣ ‖ ΑΝΑΘΕΣΗ ‖ ΑΝΟΔΟΣ),
// and the money only once, in «Κατάσταση εβδομάδας» (an accounting statement,
// no hero number on top).
//
// Locked rules:
// - The week follows the WEEKLY: OrdersCommon.weekStartOf (export by delivery,
//   import and national by loading, Saturday–Friday). «Προς τιμολόγηση» buckets
//   with the same function and prints, per week, «Προς κοπή» (readySum) and
//   «Τιμολογημένες» (invSum): for one week those equal this view's «προς κοπή»
//   and «Τιμολογημένα» — except (a) national orders of Type «Veroia Switch»,
//   which this view excludes and that one does not (0 such rows, 13/10), and
//   (b) up to ~60 s while OrdersData's cached set lags a save. Since B0 (owner
//   21/10/2026: every order is invoiced from its registration) both hold every
//   non-cancelled order, so there is no «σε εξέλιξη» state any more: an order
//   on the road with a price is «προς κοπή» here and there alike.
// - An RT belongs to the week of its EXPORT leg's order (import-only RT → that
//   import's week). A leg whose order sits in ANOTHER week is shown grey with
//   «εβδ. d/m» and is NOT summed here: it is summed in its own week, where the RT
//   appears as a «guest» row. Every order is counted in exactly one week and in
//   exactly one row — Σ rows = the week's turnover.
// - Turnover = customer prices («Price»), NET, never VAT (owner 13/10). NO costs
//   and NO margins: the accountant sees this view, /costs/pnl is never called.
// - 0 € = no price (OrdersCommon.hasPrice, owner 13/10 (α)): «—», never 0,00,
//   never summed; the Σ that leaves one out carries «†».
// - Old national orders of Type «Veroia Switch» are shown but never invoiced
//   here (the international order carries the price — VS is never a national
//   sale): isVsNational() keeps them out of every total and count.
// - Invoicing words come from OrdersData.stateOf through totals()/rtInvoicing()
//   only — the next invoicing decision changes those, not the cells.
//
// Data: ORDERS + NATIONAL ORDERS over a window that covers the whole week strip
// (one request per table, bucketed client-side), /costs/rt?overlap=1 for the
// RTs (accountant has GET on rt — Worker COSTS_PERMS), OrdersData's invoicing
// set for the pallet-slip gate, and NATIONAL LOADS of the week's national
// orders + their «Matched Load» partners for the ΚΑΘΟΔΟΣ ↔ ΑΝΟΔΟΣ pair (owner
// 13/10: Matched Load, as Weekly National pairs — national RTs only exist from
// 5/10 and 034 builds them from matched_load anyway).
// RT legs point at the Postgres order id. The live ORDERS map exposes it twice,
// read-only: «Order ID» (computed → id) and «Order No» (the view's order_no
// alias, migration 019 — the Worker's own note says a label mapped to «id»
// once came back null, 7/9). pgIdOf reads «Order ID» and falls back to
// «Order No», so either one arriving is enough.
// Every failed read is a visible strip (§10), never an empty table or a 0.
// ═══════════════════════════════════════════════════════════════════════════
const OrdersWeekView = (() => {
  'use strict';

  const OC = () => OrdersCommon;   // resolved at call time (node tests set the global)
  const DAY_UP = ['ΚΥΡΙΑΚΗ', 'ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ'];
  const DAY_FULL = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
  const DOW_SHORT = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
  const MONTHS_GEN = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
  const STRIP_BACK = 3, STRIP_FWD = 1;   // Figma: three weeks back, one ahead
  // §06: who unblocks — the verdict under the assignment and the summary line.
  // The price is the ONE block OrdersData.stateOf returns: the pallet slip has
  // not blocked since 20/10, a lot's pieces not since B0 (21/10).
  const REASON = { price: 'τιμή → owner/λογιστήριο' };
  const REASON_TPY = { price: 'τιμή' };

  // ══ Pure logic (node-tested in tests/orders-week-view.test.js) ═════════════

  const isSplitLeg = rec => {
    const p = (rec.fields || {})['Parent Order'];
    return Array.isArray(p) ? p.length > 0 : !!p;
  };
  // A stock piece (057) has no price: its lot carries the price and the one
  // invoice. This view reads its OWN ORDERS window (not OrdersData's set, where
  // pieces never enter), so it drops them itself — counted as an order they
  // would print «χωρίς τιμή» and lower every total. Its RT still shows the leg,
  // marked «στην παρτίδα #n». Data-based (not behind FEATURES.STOCK_LOTS).
  const isPiece = rec => typeof OrdersStock !== 'undefined' && OrdersStock.isPiece(rec.fields || {});
  // Decision 3 (owner 13/10): an old national order of Type «Veroia Switch» is a
  // leg of an international sale, never an invoice of its own. THE one test —
  // every total, count and cell asks this, so the rule cannot drift (0 such rows
  // measured 13/10; kept because nothing in the base forbids a new one).
  const isVsNational = rec => rec._type === 'natl' && (rec.fields || {})['Type'] === 'Veroia Switch';
  // Postgres id of an ORDERS record, as a string key (RT legs carry it as a number).
  function pgIdOf(rec) {
    const f = rec.fields || {};
    const v = f['Order ID'] != null && f['Order ID'] !== '' ? f['Order ID'] : f['Order No'];
    return v == null || v === '' ? null : String(v);
  }
  // The date the order would have WITHOUT a «Plan Week Start» move — through
  // OrdersCommon.weekDateOf itself, so the direction rule stays in one place.
  function naturalDateOf(rec) {
    const f = rec.fields || {};
    if (!f['Plan Week Start']) return OC().weekDateOf(rec);
    return OC().weekDateOf(Object.assign({}, rec, { fields: Object.assign({}, f, { 'Plan Week Start': null }) }));
  }
  // §09: moved by hand into this week (the import shift writes Plan Week Start).
  const isMovedInto = (rec, week) => !!(rec && (rec.fields || {})['Plan Week Start'])
    && OC().weekStartOfYmd(naturalDateOf(rec)) !== week;

  // The ORDERS window of the strip. Same windows as the Weekly boards: exports
  // by delivery OR loading (the exact cut is client-side, so an export without a
  // delivery date is never lost), imports by loading — plus any order whose
  // «Plan Week Start» falls in the window: an order moved INTO a week (§09) can
  // have dates far from it and would otherwise never be read.
  function ordersFormula(from, to) {
    const inRange = lbl => `IS_AFTER({${lbl}},'${from}'),IS_BEFORE({${lbl}},'${to}')`;
    return `AND({Type}='International',OR(AND({Direction}='Export',${inRange('Delivery DateTime')}),AND({Direction}='Export',${inRange('Loading DateTime')}),AND({Direction}='Import',${inRange('Loading DateTime')}),AND(${inRange('Plan Week Start')})))`;
  }

  // Five Saturdays: the selected week in the 4th slot, like the Figma strip.
  function stripWeeks(sel) {
    const out = [];
    for (let k = -STRIP_BACK; k <= STRIP_FWD; k++) out.push(OC().addDays(sel, 7 * k));
    return out;
  }

  // Money of a set of orders. `stateOf(rec)` → OrdersData.stateOf shape.
  // Reconciles by construction: sum (priced) = invSum + openSum.
  function totals(recs, stateOf) {
    const t = { n: 0, sum: 0, unpriced: 0, unpricedRecs: [], invN: 0, invSum: 0, openN: 0, openSum: 0,
      readyN: 0, readySum: 0,
      blockedN: 0, blocked: { price: 0 }, blockedSum: { price: 0 }, oldest: null };
    for (const r of recs) {
      if (isVsNational(r)) continue;
      t.n++;
      const f = r.fields || {};
      const has = OC().hasPrice(f);
      const p = has ? OC().price(f) : 0;
      if (has) t.sum += p; else { t.unpriced++; t.unpricedRecs.push(r); }
      const s = stateOf(r);
      if (s.key === 'invoiced') { t.invN++; t.invSum += p; continue; }
      t.openN++; t.openSum += p;
      if (s.key === 'ready') { t.readyN++; t.readySum += p; }
      else if (s.key === 'blocked') {
        t.blockedN++;
        t.blocked[s.reason] = (t.blocked[s.reason] || 0) + 1;
        t.blockedSum[s.reason] = (t.blockedSum[s.reason] || 0) + p;
      }
      if (s.key === 'ready' || s.key === 'blocked') {
        // The same age as «Προς τιμολόγηση»: OrdersData.ageOf (only a delivered
        // order has one, B0 review #2) — carried by the page's state function,
        // asked directly by a bare one, so the two can never disagree.
        const d = stateOf.ageOf ? stateOf.ageOf(r) : OrdersData.ageOf(null, r);
        if (d != null && (t.oldest == null || d > t.oldest)) t.oldest = d;
      }
    }
    return t;
  }

  // % vs the previous week — only when the previous week had a turnover
  // (a +∞% or a «−100%» on an empty week is noise, not news).
  function pctVsPrev(cur, prev) {
    if (!(prev > 0)) return null;
    return Math.round((cur - prev) / prev * 100);
  }

  // One invoicing verdict per RT (or national pair), from the orders it counts
  // this week. Priority = §06: 1 a block (the price — the one block since B0)
  // · 2 all invoiced · 3 k ≥ 1 of n · 4 k = 0 → «προς κοπή». The old rank «k = 0
  // and something not delivered → σε εξέλιξη» (13/10) is gone with B0 (owner
  // 21/10/2026): an order is invoiced from its registration, so an RT whose
  // import is still on the road is already the accountant's to cut.
  function rtInvoicing(recs, stateOf) {
    recs = recs.filter(r => !isVsNational(r));
    if (!recs.length) return { kind: 'none' };
    const st = recs.map(stateOf);
    const reasons = [...new Set(st.filter(s => s.key === 'blocked').map(s => s.reason))];
    if (reasons.length) return { kind: 'blocked', reasons };
    const inv = st.filter(s => s.key === 'invoiced').length;
    if (inv === recs.length) {
      const nums = new Set(recs.map(r => String((r.fields || {})['Invoice Number'] || '').trim()));
      return nums.size === 1 && !nums.has('') ? { kind: 'one', rec: recs[0] } : { kind: 'all' };
    }
    if (inv > 0) {
      let open = 0;
      recs.forEach((r, i) => { if (st[i].key !== 'invoiced' && OC().hasPrice(r.fields)) open += OC().price(r.fields); });
      return { kind: 'partial', k: inv, n: recs.length, open };
    }
    return { kind: 'ready' };
  }
  // The line under the assignment (§06 column 2). Counts ORDERS — «1 από 2
  // παραγγ.», never «1/2», which reads as a date (owner 13/10). Ranks 2, 4, 5 are
  // hidden for one order: its own ΤΠΥ cell already says the same.
  function verdictText(v, n) {
    switch (v.kind) {
      case 'blocked': return REASON[v.reasons[0]] || v.reasons[0];
      case 'one': case 'all': return n > 1 ? 'τιμολογημένο' : '';
      case 'partial': return `${v.k} από ${v.n} παραγγ.` + (v.open > 0 ? ' · ατιμολόγητα ' + OC().eur(v.open) : '');
      case 'ready': return n > 1 ? 'προς κοπή' : '';
      default: return '';
    }
  }
  // §06 column 1: the ΤΠΥ cell of ONE order. cls: ok (green ✓) · bad (red dot)
  // · dim (grey) · '' (ink — «προς κοπή» is the accountant's queue).
  function tpyOf(rec, state) {
    if (isVsNational(rec)) return { cls: 'dim', text: 'δεν τιμολογείται', title: 'Παλιά εθνική τύπου Veroia Switch — την τιμή τη φέρει η διεθνής παραγγελία' };
    switch (state.key) {
      case 'invoiced': {
        const nr = String((rec.fields || {})['Invoice Number'] || '').trim();
        return nr ? { cls: 'ok', text: '✓ ' + nr, title: 'Τιμολογήθηκε · ΤΠΥ ' + nr }
          : { cls: 'dim', text: 'τιμολογήθηκε', title: 'Τιμολογήθηκε πριν γίνει υποχρεωτικός ο αριθμός ΤΠΥ' };
      }
      case 'cancelled': return { cls: 'dim', text: '— ακυρ.', title: 'Ακυρωμένη' };
      case 'ready': return { cls: '', text: 'προς κοπή', title: 'Έχει τιμή, χωρίς ΤΠΥ — τιμολογείται από την καταχώρηση' };
      default: return { cls: 'bad', text: REASON_TPY[state.reason] || state.reason, title: REASON[state.reason] || '' };   // 'blocked'
    }
  }
  // «εβδ. 26/9»: the Saturday of the week where an amount is counted.
  const weekMark = w => w ? 'εβδ. ' + OC().dm(w) : '';

  // The week's model. intl/natl = every fetched, non-cancelled record of the
  // window (tagged _type); rts = /costs/rt records, or null when that read failed.
  // `cancelled` = cancelled international orders of the window (never counted):
  // an RT leg or a split parent that points at one says «ακυρωμένη» instead of
  // the false «εκτός εύρους» / «αρχική εκτός ανάγνωσης».
  function buildWeek({ week, intl, natl, rts, cancelled }) {
    const O = OC();
    const wk = r => O.weekStartOf(r);
    const weekIntl = intl.filter(r => !isSplitLeg(r) && !isPiece(r) && wk(r) === week);
    const weekNatl = natl.filter(r => wk(r) === week);

    // pg id → record. A split leg resolves to its parent when the parent was
    // fetched: the parent carries price and invoicing (FEATURES.ORDER_SPLIT).
    // ownOf keeps the leg itself: its own date decides the RT's week (the
    // truck carries the leg; the parent is counted in the parent's week).
    const dead = new Map((cancelled || []).map(r => [r.id, r]));
    const byRec = new Map(intl.map(r => [r.id, r]));
    const byPg = new Map(), ownOf = new Map(), deadPg = new Map();
    for (const r of cancelled || []) { const pg = pgIdOf(r); if (pg) deadPg.set(pg, r); }
    for (const r of intl) {
      const pg = pgIdOf(r); if (!pg) continue;
      let target = r;
      if (isSplitLeg(r)) {
        const p = r.fields['Parent Order']; const pid = Array.isArray(p) ? p[0] : p;
        if (byRec.has(pid)) target = byRec.get(pid);
        else if (dead.has(pid)) { deadPg.set(pg, dead.get(pid)); continue; }
      }
      byPg.set(pg, target); ownOf.set(pg, r);
    }

    const rows = [];
    const claimed = new Map();   // rec id → RT code that counts it
    if (rts) {
      const list = rts.filter(rt => rt.status !== 'cancelled')
        .slice().sort((a, b) => String(a.date_start || '').localeCompare(String(b.date_start || '')) || (a.id - b.id));
      for (const rt of list) {
        const all = (rt.ct_rt_legs || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
        // National legs (nat_load_id — VS or a national load on the same truck)
        // carry no customer price here: the international or national order
        // does. They only tell that the return is not empty (§03).
        const natLegs = all.filter(l => l.nat_load_id && l.order_id == null)
          .map(l => ({ dir: /ANOD/i.test(String(l.direction || '')) ? 'up' : 'down' }));
        const legs = all.filter(l => !l.nat_load_id && l.order_id != null)
          .map(l => {
            const pg = String(l.order_id);
            const dir = String(l.direction || '').toUpperCase().includes('IMP') ? 'import' : 'export';
            if (!byPg.has(pg) && deadPg.has(pg)) {
              const rec = deadPg.get(pg);
              return { dir, orderId: l.order_id, rec, week: wk(rec), inWeek: false, counted: false, dupOf: null, piece: false, parentMissing: false, cancelled: true };
            }
            const rec = byPg.get(pg) || null;
            const w = rec ? wk(rec) : null;
            // Parent of a split leg not read (parentsFailed): the leg itself has
            // no price — never counted as «χωρίς τιμή», said as what it is.
            const parentMissing = !!rec && isSplitLeg(rec);
            return { dir, orderId: l.order_id, rec, own: ownOf.get(pg) || rec, week: w, inWeek: !!rec && w === week, counted: false, dupOf: null,
              piece: !!rec && isPiece(rec), parentMissing, cancelled: false };
          });
        if (!legs.length) continue;
        const live = l => l.rec && !l.cancelled;
        const home = legs.find(l => l.dir === 'export' && live(l)) || legs.find(live);
        if (!home) continue;                        // none of its live orders is in the window
        const homeWeek = wk(home.own);
        const inWeek = legs.filter(l => l.inWeek && !l.piece && !l.parentMissing);
        if (homeWeek !== week && !inWeek.length) continue;
        const code = rt.code || ('RT-' + rt.id);
        for (const l of inWeek) {
          // A split parent reached through two legs (or two RTs) is counted once.
          if (claimed.has(l.rec.id)) { l.dupOf = claimed.get(l.rec.id); continue; }
          claimed.set(l.rec.id, code); l.counted = true;
        }
        const guest = homeWeek !== week;
        const anchor = guest ? (inWeek.find(l => l.dir === 'export') || inWeek[0]).rec : home.rec;
        const moved = isMovedInto(anchor, week);
        rows.push({
          kind: 'rt', rt, code, guest, homeWeek, legs, natLegs, moved,
          exp: legs.filter(l => l.dir === 'export'), imp: legs.filter(l => l.dir === 'import'),
          // A guest row opens the order it counts HERE, not the other week's export.
          day: moved ? naturalDateOf(anchor) : O.weekDateOf(guest ? anchor : home.own), vehicleRec: home.rec, openRec: anchor,
          counted: legs.filter(l => l.counted).map(l => l.rec),
          single: legs.length === 1,
        });
      }
    }
    // Never dropped silently: an international order of the week that no RT
    // counts is listed on its own (or, when the RT read failed, every order is).
    const noRt = weekIntl.filter(r => !claimed.has(r.id)).map(r => {
      const dir = (r.fields || {})['Direction'] === 'Import' ? 'import' : 'export';
      const leg = { dir, orderId: pgIdOf(r), rec: r, week, inWeek: true, counted: true, dupOf: null, piece: false, parentMissing: false };
      return { kind: 'order', rec: r, legs: [leg], natLegs: [], exp: dir === 'export' ? [leg] : [], imp: dir === 'import' ? [leg] : [],
        day: O.weekDateOf(r), vehicleRec: r, openRec: r, counted: [r], moved: false };
    });
    return { week, weekIntl, weekNatl, rows, noRt, rtFailed: !rts };
  }

  // §01/§11: day sections Saturday → Friday, ALWAYS seven (an empty day says
  // «καμία κίνηση» — owner 13/10, for this page), then «ΜΕΤΑΦΕΡΘΗΚΕ» (§09).
  // `other` = a row whose day is outside the week (no date): never dropped.
  function daySections(week, rows) {
    const O = OC();
    const days = []; for (let i = 0; i < 7; i++) days.push(O.addDays(week, i));
    const by = new Map(days.map(d => [d, []]));
    const moved = [], other = [];
    for (const r of rows) {
      if (r.moved) moved.push(r);
      else if (by.has(r.day)) by.get(r.day).push(r);
      else other.push(r);
    }
    // Guests last in their day: the day's own RTs first, in code order.
    const ord = (a, b) => (a.guest ? 1 : 0) - (b.guest ? 1 : 0) || String(a.code || '').localeCompare(String(b.code || ''), 'el', { numeric: true });
    return {
      days: days.map(d => ({ day: d, rows: by.get(d).sort(ord) })),
      moved: moved.sort((a, b) => String(a.day || '').localeCompare(String(b.day || '')) || ord(a, b)),
      other,
    };
  }

  // Groups for «Ανά όχημα»: by vehicle key, each sorted by Weekly day.
  function groupRows(rows, mode, keyOf) {
    const m = new Map();
    for (const r of rows) {
      const k = mode === 'vehicle' ? keyOf(r) : (r.day || '');
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    const byDay = (a, b) => String(a.day || '').localeCompare(String(b.day || ''));
    return [...m.entries()].map(([key, list]) => ({ key, rows: list.sort(byDay) }))
      .sort((a, b) => String(a.key).localeCompare(String(b.key), 'el'));
  }

  // The strip cell's word, from the week's totals. Never «ανοιχτά» (for an
  // accountant that means invoiced and unpaid).
  function weekStatus(t) {
    if (!t.n) return { kind: 'empty', text: 'χωρίς παραγγελίες' };
    if (!t.openN) return { kind: 'all', text: 'όλα τιμολογημένα' };
    if (t.readyN) return { kind: 'ready', n: t.readyN, text: t.readyN + ' προς κοπή' };
    return { kind: 'blocked', n: t.blockedN, text: t.blockedN + ' μπλοκ' };   // open = ready or blocked (B0)
  }

  // National ΚΑΘΟΔΟΣ ↔ ΑΝΟΔΟΣ pairs (decision 2, owner 13/10): national order →
  // its NATIONAL LOAD (Source National Order) → «Matched Load» (read on either
  // side: Weekly National writes both, a one-sided pair still pairs) → the other
  // load → its national order. A Veroia-Switch partner load is only text — its
  // price is on the international order (§08). Pure: in → rows.
  //   natl: national orders of the window · loads: NATIONAL LOADS read (null =
  //   the read failed) · intl: international orders of the window (VS number).
  // Row: { day, kat, ano, assign, counted } — a side is
  //   { kind:'order', rec, inWeek, week } | { kind:'vs', dir, intlRec }
  //   | { kind:'grp', dir } | { kind:'unread', dir } | null (no such side).
  function pairNationals({ week, natl, loads, intl }) {
    const O = OC();
    const wk = r => O.weekStartOf(r);
    const link = v => (Array.isArray(v) ? v[0] : v) || null;
    const isUp = r => String((r.fields || {})['Direction'] || '') === 'South→North';
    const failed = loads == null;
    const byId = new Map((natl || []).map(r => [r.id, r]));
    const intlById = new Map((intl || []).map(r => [r.id, r]));
    const loadById = new Map(), loadOfOrder = new Map(), pairOf = new Map();
    for (const l of loads || []) {
      loadById.set(l.id, l);
      const so = link(l.fields['Source National Order']);
      if (so && !loadOfOrder.has(so)) loadOfOrder.set(so, l);
    }
    // Two-sided matches first, one-sided only between loads still free: a stale
    // «Matched Load» left on a third load (lB → lA while lA ↔ lC) must not steal
    // lA depending on which order happens to be read first.
    const mOf = l => l.fields['Matched Load'] || null;
    for (const l of loads || []) {
      const m = mOf(l), o = m ? loadById.get(m) : null;
      if (o && mOf(o) === l.id && !pairOf.has(l.id) && !pairOf.has(m)) { pairOf.set(l.id, m); pairOf.set(m, l.id); }
    }
    for (const l of loads || []) {
      const m = mOf(l);
      if (!m || pairOf.has(l.id) || pairOf.has(m)) continue;
      pairOf.set(l.id, m); pairOf.set(m, l.id);
    }
    const weekRecs = (natl || []).filter(r => wk(r) === week)
      .sort((a, b) => String(O.weekDateOf(a)).localeCompare(String(O.weekDateOf(b))) || String(a.id).localeCompare(String(b.id)));
    const used = new Set(), rows = [];
    for (const r of weekRecs) {
      if (used.has(r.id)) continue;
      used.add(r.id);
      const own = { kind: 'order', rec: r, inWeek: true, week };
      // F5 Ε3: a v5 order (natV5Attach) has no load and no Direction. Its pair
      // is its cycle, drawn on the v5 board — here one row of its own, on the
      // side its first cycle carries it (else the hub's side: to Veroia =
      // ΑΝΟΔΟΣ), the vehicle from the cycle. Never «εκτός φορτίου».
      if (r._v5 && typeof r._v5 === 'object') {
        const c0 = (r._v5.carriers || [])[0];
        const up = (c0 ? c0.side : r._v5.hub_side) === 'ANODOS';
        rows.push({ kind: 'natl', day: O.weekDateOf(r), kat: up ? null : own, ano: up ? own : null,
          assign: { kind: 'v5', state: r._v5 }, loadsFailed: false, openRec: r, counted: [r] });
        continue;
      }
      const load = loadOfOrder.get(r.id) || null;
      let other = null;
      const pid = load ? pairOf.get(load.id) : null;
      if (pid) {
        const pl = loadById.get(pid);
        const dir = r => (String((r.fields || {})['Direction'] || '') === 'South→North' ? 'up' : 'down');
        if (!pl) other = { kind: 'unread', dir: isUp(r) ? 'down' : 'up' };
        else if (pl.fields['Source Type'] === 'Direct' || link(pl.fields['Source Order'])) {
          other = { kind: 'vs', dir: dir(pl), intlRec: intlById.get(link(pl.fields['Source Order'])) || null };
        } else if (pl.fields['Source Type'] === 'Groupage') other = { kind: 'grp', dir: dir(pl) };
        else {
          const po = byId.get(link(pl.fields['Source National Order']));
          if (po && !used.has(po.id)) { used.add(po.id); other = { kind: 'order', rec: po, inWeek: wk(po) === week, week: wk(po) }; }
          // Already on another row (should not happen with the pairing above —
          // said as what it is, never as «εκτός εύρους»).
          else if (po) other = { kind: 'claimed', dir: dir(pl), rec: po };
          else other = { kind: 'unread', dir: dir(pl) };
        }
      }
      const ownUp = isUp(r);
      const kat = ownUp ? other : own, ano = ownUp ? own : other;
      const katRec = kat && kat.kind === 'order' ? kat.rec : null;
      const aLoad = (katRec && loadOfOrder.get(katRec.id)) || load;
      const anchor = kat && kat.kind === 'order' && kat.inWeek ? kat.rec : r;
      let assign;
      if (failed) assign = { kind: 'failed' };
      else if (aLoad) assign = { kind: 'load', load: aLoad };
      // The v5 read failed and this order has no load: it may be v5 — unknown, never «εκτός».
      else if (anchor._v5 === 'err' && !(anchor.fields || {})['National Groupage']) assign = { kind: 'failed' };
      else if ((anchor.fields || {})['National Groupage']) assign = { kind: 'grp' };
      else assign = { kind: 'out' };
      rows.push({
        kind: 'natl', day: O.weekDateOf(anchor), kat, ano, assign, loadsFailed: failed, openRec: anchor,
        counted: [kat, ano].filter(s => s && s.kind === 'order' && s.inWeek).map(s => s.rec),
      });
    }
    return rows;
  }

  // §12 #06 truncation, word-safe: the route is cut first and only after the
  // destination's FIRST word — «Rotterdam NL → Amsterdam…», never «→ A…».
  // head never shrinks, tail takes the ellipsis.
  function routeSplit(from, to) {
    const t = String(to || '').trim();
    const i = t.indexOf(' ');
    const first = i < 0 ? t : t.slice(0, i);
    return { head: String(from || '—') + ' → ' + (first || '—'), tail: i < 0 ? '' : t.slice(i) };
  }
  // «Kraków PL» — the country only outside Greece (§12 #06).
  function placeText(meta) {
    if (!meta) return '';
    const word = meta.city || meta.name || '';
    const cc = meta.cc && meta.cc !== 'GR' ? meta.cc : '';
    return [word, cc].filter(Boolean).join(' ');
  }

  const dayLabel = ymd => {
    if (!ymd) return 'ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ';
    const d = new Date(ymd + 'T12:00:00');
    return DAY_UP[d.getDay()] + ' ' + OC().dm(ymd);
  };
  const dayFull = ymd => { const d = new Date(ymd + 'T12:00:00'); return DAY_FULL[d.getDay()] + ' ' + OC().dm(ymd); };
  // «Πέμ 8/10» — the Weekly v4 format (WI4.dayLabel), with its own fallback.
  const dayShort = ymd => {
    if (!ymd) return '';
    if (typeof WI4 !== 'undefined' && WI4.dayLabel) return WI4.dayLabel(ymd);
    const d = new Date(ymd + 'T12:00:00');
    return DOW_SHORT[d.getDay()] + ' ' + OC().dm(ymd);
  };
  // «3 – 9 Οκτωβρίου» · «26 Σεπτεμβρίου – 2 Οκτωβρίου» (page subtitle).
  function weekTitle(w) {
    const e = OC().addDays(w, 6);
    const d1 = +w.slice(8, 10), m1 = +w.slice(5, 7), d2 = +e.slice(8, 10), m2 = +e.slice(5, 7);
    return m1 === m2 ? `${d1} – ${d2} ${MONTHS_GEN[m2 - 1]}` : `${d1} ${MONTHS_GEN[m1 - 1]} – ${d2} ${MONTHS_GEN[m2 - 1]}`;
  }

  // ══ Browser side ═══════════════════════════════════════════════════════════

  const S = { week: null, mode: 'day', ctx: null, model: null, force: false };
  const esc = s => escapeHtml(String(s == null ? '' : s));
  const clientRaw = f => { const id = Array.isArray(f['Client']) ? f['Client'][0] : null; return id ? ((typeof _fhClientsMap !== 'undefined' && _fhClientsMap[id]) || '') : ''; };

  function defaultWeek() {
    // The last COMPLETE week: the weekly review is done on a closed week (Figma
    // opens on 19–25/9 while 26/9 – 2/10 is «σε εξέλιξη»).
    return OC().addDays(TmsWeek.startOfDate(OC().today()), -7);
  }

  // §07 — plate in DM Mono ink, driver or partner grey; nothing coloured: no
  // assignment state blocks invoicing. Works on an ORDER or a NATIONAL LOAD
  // (same four labels on both).
  function vehicleOf(rec) {
    if (!rec) return { key: '~', kind: 'none', plate: '', who: '', text: 'Προς ανάθεση' };
    const f = rec.fields || {};
    const first = v => (Array.isArray(v) ? v[0] : v) || '';
    const pid = first(f['Partner']), tid = first(f['Truck']), did = first(f['Driver']);
    if (pid) {
      const p = getRefPartners().find(x => x.id === pid);
      // A partner missing from the cached list still IS a partner.
      const name = (p && p.fields['Company Name']) || 'συνεργάτης';
      const plates = String(f['Partner Truck Plates'] || '').trim();
      return { key: 'p:' + name, kind: 'partner', plate: plates, who: name, text: [plates, name].filter(Boolean).join(' · ') };
    }
    if (tid || did) {
      const t = tid ? getRefTrucks().find(x => x.id === tid) : null;
      const d = did ? getRefDrivers().find(x => x.id === did) : null;
      const plate = (t && t.fields['License Plate']) || '—';
      const who = String((d && d.fields['Full Name']) || '').trim();
      return { key: 't:' + plate, kind: 'own', plate, who, text: [plate, who].filter(Boolean).join(' · ') };
    }
    const st = f['Status'];
    // A delivered/invoiced order with no vehicle written is history, not work.
    if (st === 'Delivered' || st === 'Invoiced') return { key: '~', kind: 'none', plate: '', who: '', text: '—' };
    return { key: '~', kind: 'none', plate: '', who: '', text: 'Προς ανάθεση' };
  }

  // The vehicle of a v5 national order: its first cycle's (GET /plan/nat-state,
  // names resolved by the base), «+N» when a split at Veroia puts it on more.
  function vehicleOfV5(st) {
    const cs = (st && st.carriers) || [];
    const c = cs.find(x => x.kind !== 'none');
    if (!c) return st && st.executed ? { key: '~', kind: 'none', plate: '', who: '', text: '—' } : { key: '~', kind: 'none', plate: '', who: '', text: 'Προς ανάθεση' };
    const more = cs.length > 1 ? ' +' + (cs.length - 1) : '';
    if (c.kind === 'partner') {
      const name = (c.partner || 'συνεργάτης') + more;
      return { key: 'p:' + name, kind: 'partner', plate: '', who: name, text: name };
    }
    const plate = c.truck || '—', who = String(c.driver || '').trim() + more;
    return { key: 't:' + plate, kind: 'own', plate, who, text: [plate, who].filter(Boolean).join(' · ') };
  }

  // Ends of an order as the frame draws them: first loading and first delivery,
  // «+N» for the other points of that end («Edessa → Kraków PL +1»); `last` =
  // the final delivery, where an empty truck turns back («Κενό γύρισμα»).
  function endsOf(rec) {
    const O = OC(), f = rec.fields || {}, natl = rec._type === 'natl';
    const ids = (base) => O._linkIds(f, base);
    const L = ids(natl ? 'Pickup Location' : 'Loading Location'), D = ids(natl ? 'Delivery Location' : 'Unloading Location');
    const name = id => placeText(id ? O._locMeta(id) : null);
    return { from: name(L[0]), to: name(D[0]), last: name(D[D.length - 1]), nFrom: Math.max(0, L.length - 1), nTo: Math.max(0, D.length - 1),
      load: O.ymd(f['Loading DateTime']), del: O.ymd(f['Delivery DateTime']) };
  }

  async function load(week, scope, force) {
    const O = OC();
    const strip = stripWeeks(week);
    const from = O.addDays(strip[0], -8), to = O.addDays(O.addDays(strip[strip.length - 1], 6), 8);
    const within = (lbl) => `AND(IS_AFTER({${lbl}},'${from}'),IS_BEFORE({${lbl}},'${to}'))`;
    const intlF = ordersFormula(from, to);
    const natlF = `OR(${within('Loading DateTime')},${within('Delivery DateTime')})`;
    const ok = r => ({ ok: true, r }), fail = tag => e => { console.error('orders week: ' + tag, e); return { ok: false, r: null, e }; };
    const wantIntl = scope !== 'natl', wantNatl = scope !== 'intl';
    const [refRes, intlRes, natlRes, rtRes, setRes] = await Promise.all([
      // Vehicles, drivers, partners: without them ΑΝΑΘΕΣΗ would print «—» or a
      // bare «συνεργάτης» with nothing saying why — a strip says it (§10).
      typeof preloadReferenceData === 'function' ? preloadReferenceData().then(ok, fail('reference data')) : Promise.resolve(ok(null)),
      // A failed ORDERS read throws: the hub then says «η ανάγνωση απέτυχε»
      // instead of painting a week of zeros.
      wantIntl ? atGetAll(TABLES.ORDERS, { filterByFormula: intlF }, false) : Promise.resolve([]),
      wantNatl ? atGetAll(TABLES.NAT_ORDERS, { filterByFormula: natlF }, false).then(ok, fail('national')) : Promise.resolve(ok([])),
      wantIntl
        ? (typeof ctFetch === 'function'
          // Only the SELECTED week's rows use RTs (the strip sums orders), and the
          // Worker caps overlap=1 at 500 newest-first — a wider window would push
          // the oldest RTs out silently and their orders into «ΧΩΡΙΣ RT».
          ? ctFetch(`/costs/rt?overlap=1&from=${O.addDays(week, -14)}&to=${O.addDays(week, 20)}`).then(ok, fail('/costs/rt'))
          : Promise.resolve({ ok: false, r: null }))
        : Promise.resolve(ok({ records: [] })),
      OrdersData.loadInvoicingSet(!!force).then(ok, fail('invoicing set')),
    ]);
    const live = r => r.fields && r.fields['Status'] !== 'Cancelled';
    const intl = (intlRes || []).filter(live);
    const cancelled = (intlRes || []).filter(r => r.fields && !live(r));
    // A split leg carries no price — its parent does. When the leg's dates are
    // in the window but the parent's are not, the parent is read by id, or the
    // RT would show a priced order as «χωρίς τιμή» (code review 28/9).
    let parentsFailed = false;
    const have = new Set(intl.map(r => r.id));
    const missing = [...new Set(intl.filter(isSplitLeg).map(r => { const p = r.fields['Parent Order']; return Array.isArray(p) ? p[0] : p; }))]
      .filter(id => id && !have.has(id));
    for (let i = 0; i < missing.length; i += 20) {
      const f = `OR(${missing.slice(i, i + 20).map(id => `RECORD_ID()="${id}"`).join(',')})`;
      try {
        (await atGetAll(TABLES.ORDERS, { filterByFormula: f }, false)).forEach(r => {
          if (have.has(r.id)) return;
          have.add(r.id);
          (live(r) ? intl : cancelled).push(r);
        });
      } catch (e) { console.error('orders week: split parents', e); parentsFailed = true; }
    }
    intl.forEach(r => { r._type = 'intl'; });
    cancelled.forEach(r => { r._type = 'intl'; });
    const natl = (natlRes.r || []).filter(live); natl.forEach(r => { r._type = 'natl'; });
    // Without the invoicing set the slip gate is unknown → the per-order sheet
    // flags decide (OrdersData.sheetsOk fallback) and a strip says so.
    const set = setRes.ok ? setRes.r : { gate: {}, gateFailed: true, intl: [], natl: [] };
    // F5 Ε3/Ε5: the v5 state of the window's national orders, beside their loads (before L: no request).
    const [loadsRes, v5Res] = await Promise.all([
      natlRes.ok && wantNatl ? _natLoads(natl.filter(r => O.weekStartOf(r) === week)) : Promise.resolve({ ok: true, loads: [] }),
      natlRes.ok && wantNatl ? OrdersCommon.natV5Attach(natl) : Promise.resolve({ failed: false }),
    ]);
    return {
      week, strip, intl, cancelled, natl, natlFailed: !natlRes.ok, rts: rtRes.ok ? (rtRes.r.records || []) : null,
      rtCapped: rtRes.ok && (rtRes.r.records || []).length >= 500,
      set, setFailed: !setRes.ok, gateFailed: !!set.gateFailed, parentsFailed, refFailed: !refRes.ok,
      natLoads: loadsRes.ok ? loadsRes.loads : null, v5Failed: v5Res.failed,
    };
  }

  // NATIONAL LOADS of the week's national orders + the loads paired with them
  // (by id, and any load whose «Matched Load» names ours — a pair written on one
  // side only still pairs). Labels verified on the live Worker map (13/10).
  // Status: vehicleOf reads it (a delivered load without a vehicle is «—»,
  // not «Προς ανάθεση»).
  const NL_FIELDS = ['Source National Order', 'Source Order', 'Source Type', 'Matched Load', 'Direction',
    'Truck', 'Driver', 'Partner', 'Partner Truck Plates', 'Status'];
  async function _natLoads(weekNatl) {
    const isRec = id => typeof id === 'string' && /^rec[A-Za-z0-9]{1,32}$/.test(id);
    try {
      // The orders' own loads through the ONE shared query (principle 3).
      const loads = [...(await OrdersCommon.natLoadsFor(weekNatl, NL_FIELDS)).values()];
      const have = new Set(loads.map(l => l.id));
      const terms = [];
      loads.forEach(l => {
        const m = l.fields['Matched Load'];
        if (isRec(m) && !have.has(m)) terms.push(`RECORD_ID()='${m}'`);
        terms.push(`{Matched Load}='${l.id}'`);
      });
      for (const part of OrdersList.chunk([...new Set(terms)], 40)) {
        (await atGetAll(TABLES.NAT_LOADS, { filterByFormula: `OR(${part.join(',')})`, fields: NL_FIELDS }, false))
          .forEach(l => { if (!have.has(l.id)) { have.add(l.id); loads.push(l); } });
      }
      return { ok: true, loads };
    } catch (e) {
      console.error('orders week: national loads', e);
      return { ok: false, loads: null };
    }
  }

  async function render(ctx) {
    // A ‹ › click can land after the user moved to another view: never paint
    // (or hang handlers) on a frame that is no longer ours.
    if (!ctx.isCurrent()) return;
    S.ctx = ctx;
    if (!(typeof can === 'function' && can('costs') !== 'none')) { ctx.body.innerHTML = ''; return; }
    OC().ensureStyles();
    if (!S.week) S.week = defaultWeek();
    ctx.setSub(weekTitle(S.week));
    ctx.setActions(`<button type="button" class="btn btn-ghost btn-sm" data-owv="print">Εκτύπωση</button><button type="button" class="btn btn-ghost btn-sm" data-owv="csv">CSV</button>`);
    // Nationals have no RT: the grouping toggle means nothing on their own.
    if (ctx.scope !== 'natl') _paintModeToggle(ctx);
    const actions = document.getElementById('ohActions');
    if (actions) actions.onclick = e => { const b = e.target.closest('[data-owv]'); if (!b) return; if (b.dataset.owv === 'print') window.print(); else _csv(); };

    const force = S.force; S.force = false;
    const data = await load(S.week, ctx.scope, force);
    if (!ctx.isCurrent()) return;
    const ids = new Set();
    const addC = r => { const c = Array.isArray(r.fields['Client']) ? r.fields['Client'][0] : null; if (c) ids.add(c); };
    const weekSet = new Set(stripWeeks(S.week));
    [...data.intl, ...data.natl].filter(r => weekSet.has(OC().weekStartOf(r))).forEach(addC);
    data.clientsFailed = false;
    if (ids.size && typeof fhBatchResolveClients === 'function') {
      try { await fhBatchResolveClients([...ids]); }
      catch (e) { console.warn('orders week: clients', e); data.clientsFailed = true; }
      if (!ctx.isCurrent()) return;
    }
    S.data = data;
    _paint(ctx);
    OC().whenDocs(() => { if (ctx.isCurrent()) _paint(ctx); });
  }

  function _paintModeToggle(ctx) {
    ctx.setTabsExtra(`<div class="oh-seg" role="group" aria-label="Ομαδοποίηση">
      <button type="button" class="oh-seg-b${S.mode === 'day' ? ' on' : ''}" aria-pressed="${S.mode === 'day'}" data-owvmode="day">Ανά ημέρα</button>
      <button type="button" class="oh-seg-b${S.mode === 'vehicle' ? ' on' : ''}" aria-pressed="${S.mode === 'vehicle'}" data-owvmode="vehicle">Ανά όχημα</button></div>`);
    const ex = document.getElementById('ohTabsExtra');
    if (ex) ex.onclick = e => {
      const b = e.target.closest('[data-owvmode]'); if (!b || b.dataset.owvmode === S.mode) return;
      S.mode = b.dataset.owvmode; _paintModeToggle(ctx); if (S.data) _paint(ctx);
    };
  }

  function _stateFn(set) {
    const memo = new Map();
    const fn = rec => {
      if (!memo.has(rec)) memo.set(rec, OrdersData.stateOf(set, rec));
      return memo.get(rec);
    };
    // «παλαιότερη εκκρεμής» with the same age rule as «Προς τιμολόγηση» (E-05).
    fn.ageOf = rec => OrdersData.ageOf(set, rec);
    return fn;
  }

  // §10 — one white strip per failed read: what did not load · what that
  // means for the numbers · retry. Red dot = the totals may be incomplete.
  function _fails(d, m, scope, undatedN) {
    const out = [];
    const add = (head, body, link) => out.push({ head, body, link });
    if (scope !== 'natl' && d.rtCapped) add('Τα δρομολόγια έφτασαν το όριο ανάγνωσης (500).', 'Κάποια παλαιότερα μπορεί να λείπουν — οι παραγγελίες τους φαίνονται στο «ΧΩΡΙΣ RT», με σωστά ποσά.');
    if (scope !== 'natl' && m.rtFailed) add('Δεν διαβάστηκαν τα δρομολόγια (RT).', 'Κάθε διεθνής φαίνεται στο «ΧΩΡΙΣ RT» με το ποσό της· τα σύνολα μένουν σωστά.');
    if (scope !== 'intl' && d.natlFailed) add('Δεν διαβάστηκαν οι εθνικές.', 'Η ενότητα Εθνικές γράφει «—», όχι 0· ο τζίρος δείχνει μόνο τα διεθνή, με σήμανση «χωρίς εθνικά».');
    if (scope !== 'intl' && !d.natlFailed && d.v5Failed) add('Δεν διαβάστηκε η κατάσταση των εθνικών v5.', 'Η ανάθεση εθνικών χωρίς φορτίο γράφει «—», όχι «εκτός φορτίου»· το «παραδόθηκε» τους ακολουθεί την ημερομηνία παράδοσης.');
    if (scope !== 'intl' && !d.natlFailed && d.natLoads == null) add('Δεν διαβάστηκαν τα φορτία εθνικών.', 'Η ανάθεση εθνικών γράφει «—», όχι «εκτός φορτίου»· το ζευγάρι κάθοδος–άνοδος δεν σχεδιάζεται.');
    if (d.setFailed || d.gateFailed) add('Δεν απάντησε ο έλεγχος δελτίων.', 'Ισχύουν οι σημάνσεις δελτίων της ίδιας της παραγγελίας.');
    if (scope !== 'natl' && d.parentsFailed) add('Δεν διαβάστηκαν οι αρχικές των σπασμένων.', 'Τα σκέλη τους γράφουν «αρχική εκτός ανάγνωσης» και δεν αθροίζονται.');
    if (d.set && d.set.stockFailed) add('Δεν διαβάστηκαν οι παρτίδες.', 'Τα κομμάτια δεν αθροίζονται· η παρτίδα φαίνεται μπλοκαρισμένη χωρίς έλεγχο.');
    if (d.refFailed) add('Δεν διαβάστηκαν οχήματα, οδηγοί και συνεργάτες.', 'Η ΑΝΑΘΕΣΗ μπορεί να γράφει «—» ή σκέτο «συνεργάτης»· τα ποσά δεν επηρεάζονται.');
    if (d.clientsFailed) add('Δεν διαβάστηκαν τα ονόματα πελατών.', 'Η στήλη ΠΕΛΑΤΗΣ γράφει «—» όπου λείπει όνομα· τα ποσά δεν επηρεάζονται.');
    const html = out.map(x => `<div class="ow4-fail" role="alert"><span class="ow4-dot"></span><b>${esc(x.head)}</b> <span>${esc(x.body)}</span><button type="button" class="ow4-link" data-owvretry="1">Ξαναδοκιμή</button></div>`);
    if (undatedN) {
      // Grey dot: a fact, not a failure — such an order belongs to no week.
      html.push(`<div class="ow4-fail ow4-info"><span class="ow4-dot"></span><b>${undatedN} ${undatedN === 1 ? 'παραγγελία' : 'παραγγελίες'} χωρίς ημερομηνία δεν ${undatedN === 1 ? 'ανήκει' : 'ανήκουν'} σε εβδομάδα.</b> <span>Τη${undatedN === 1 ? '' : 'ς'} βρίσκεις στην «Προς τιμολόγηση» → όλες οι ατιμολόγητες.</span><button type="button" class="ow4-link" data-owvgo="invoicing">Προς τιμολόγηση →</button></div>`);
    }
    return html.join('');
  }

  function _paint(ctx) {
    const O = OC(), d = S.data, scope = ctx.scope;
    const stateOf = _stateFn(d.set);
    const m = buildWeek({ week: S.week, intl: d.intl, natl: d.natl, rts: d.rts, cancelled: d.cancelled });
    const natRows = scope !== 'intl' && !d.natlFailed
      ? pairNationals({ week: S.week, natl: d.natl, loads: d.natLoads, intl: d.intl }) : [];
    S.model = m; S.natRows = natRows;
    const inScope = r => scope === 'all' || r._type === scope;
    const showI = scope !== 'natl', showN = scope !== 'intl';
    const tI = totals(showI ? m.weekIntl : [], stateOf);
    const tN = totals(showN && !d.natlFailed ? m.weekNatl : [], stateOf);
    const tAll = totals([...(showI ? m.weekIntl : []), ...(showN ? m.weekNatl : [])], stateOf);

    // ── week strip ──
    const today = O.today();
    const recsOfWeek = w => [...d.intl.filter(r => !isSplitLeg(r) && !isPiece(r)), ...d.natl].filter(r => inScope(r) && O.weekStartOf(r) === w);
    const prevT = totals(recsOfWeek(O.addDays(S.week, -7)), stateOf);
    const strip = d.strip.map(w => {
      const t = totals(recsOfWeek(w), stateOf), st = weekStatus(t);
      return `<button type="button" class="ow4-wk${w === S.week ? ' on' : ''}" data-owvweek="${w}" aria-pressed="${w === S.week}">
        <span class="ow4-wk-r">${esc(O.weekLabel(w))}</span>
        <span class="ow4-wk-v">${esc([t.n ? (t.sum > 0 ? O.eurSym(t.sum) : '—') : '', st.text, showN && d.natlFailed ? 'χωρίς εθνικά' : ''].filter(Boolean).join(' · '))}</span></button>`;
    }).join('');

    // An order with no date is in no week — said, never lost (§10, grey).
    let undated = 0;
    if (!d.setFailed) for (const r of OrdersData.all(d.set)) if (inScope(r) && !O.weekDateOf(r) && stateOf(r).key !== 'invoiced' && !isVsNational(r)) undated++;

    // ── summary line (owner α: the invoicing words as the code computes them) ──
    const natGap = showN && d.natlFailed ? ' · χωρίς εθνικά' : '';
    const pp = [];
    if (tAll.readyN) pp.push(`<span>${tAll.readyN} προς κοπή <span class="ow4-num">${O.eur(tAll.readySum)}</span></span>`);
    if (tAll.blocked.price) pp.push(`<span><span class="ow4-dot"></span>${esc(tAll.blocked.price + ' χωρίς τιμή → owner')}</span>`);
    // §11: an empty week has nothing to chase — no line at all.
    const sumLine = !tAll.n ? '' : `<div class="ow4-sum">
      <span class="ow4-sum-h">Ατιμολόγητες ${tAll.openN}${tAll.openSum > 0 ? ` · <span class="ow4-num">${O.eurSym(tAll.openSum)}</span>` : ''}${esc(natGap)}</span>
      ${pp.join('')}
      <span class="ow4-sum-r">${tAll.oldest != null ? `<span class="ow4-g">παλαιότερη εκκρεμής ${tAll.oldest} ${tAll.oldest === 1 ? 'ημέρα' : 'ημέρες'}</span>` : ''}
        <button type="button" class="ow4-link" data-owvgo="invoicing">Προς τιμολόγηση →</button></span></div>`;

    // ── footnote marks ──
    const star = [], dag = [];
    const markOf = row => {
      let s = false, g = false;
      for (const l of row.legs || []) if (l.rec && !l.inWeek && !l.piece && !l.parentMissing && !l.cancelled && O.hasPrice(l.rec.fields)) s = true;
      for (const r of row.counted) if (!isVsNational(r) && !O.hasPrice(r.fields)) g = true;
      return { s, g };
    };

    // ── international board ──
    let intlHtml = '';
    if (showI) {
      const body = [];
      const rowsAll = m.rtFailed ? [] : m.rows;
      for (const r of rowsAll) for (const l of r.legs) if (l.rec && !l.inWeek && !l.piece && !l.parentMissing && !l.cancelled && O.hasPrice(l.rec.fields)) star.push({ who: r.code, amt: O.price(l.rec.fields), w: l.week, sec: 'Διεθνή' });
      const rowH = r => _rtRowHtml(r, stateOf, markOf(r), m.rtFailed);
      if (m.rtFailed) {
        // §10: without RTs every order stands alone, so the days would all lie
        // «καμία κίνηση» — only the ΧΩΡΙΣ RT list is drawn.
        body.push(_secHead('ΧΩΡΙΣ RT', m.noRt.length + ' παραγγ.'));
        m.noRt.slice().sort((a, b) => String(a.day).localeCompare(String(b.day))).forEach(r => body.push(rowH(r)));
      } else if (S.mode === 'vehicle') {
        for (const g of groupRows(m.rows, 'vehicle', r => vehicleOf(r.vehicleRec).key)) {
          // A partner groups by company (its plates differ per trip), so the head
          // names the company only — never the first trip's plates for all.
          const gv = vehicleOf(g.rows[0].vehicleRec);
          body.push(_secHead(gv.kind === 'partner' ? gv.who : gv.text, g.rows.length + ' RT'));
          g.rows.forEach(r => body.push(rowH(r)));
        }
      } else {
        const sec = daySections(S.week, m.rows);
        for (const dd of sec.days) {
          if (!dd.rows.length) { body.push(`<div class="ow4-day ow4-day-0">${esc(dayFull(dd.day))} · καμία κίνηση</div>`); continue; }
          body.push(`<div class="ow4-day">${esc(dayLabel(dd.day))}</div>`);
          dd.rows.forEach(r => body.push(rowH(r)));
        }
        if (sec.moved.length) { body.push('<div class="ow4-day">ΜΕΤΑΦΕΡΘΗΚΕ ΣΕ ΑΥΤΗ ΤΗΝ ΕΒΔΟΜΑΔΑ</div>'); sec.moved.forEach(r => body.push(rowH(r))); }
        if (sec.other.length) { body.push('<div class="ow4-day">ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ</div>'); sec.other.forEach(r => body.push(rowH(r))); }
      }
      if (!m.rtFailed && m.noRt.length) {
        body.push('<div class="ow4-day">ΧΩΡΙΣ RT</div>');
        m.noRt.slice().sort((a, b) => String(a.day).localeCompare(String(b.day))).forEach(r => body.push(rowH(r)));
      }
      const nExp = m.weekIntl.filter(r => r.fields['Direction'] !== 'Import').length, nImp = m.weekIntl.length - nExp;
      const home = m.rows.filter(r => !r.guest).length;
      const guestW = [...new Set(m.rows.filter(r => r.guest).map(r => O.dm(r.homeWeek)))];
      const guestN = m.rows.length - home;
      const meta = [`${m.weekIntl.length} ${m.weekIntl.length === 1 ? 'παραγγελία' : 'παραγγελίες'}`,
        m.rtFailed ? 'δρομολόγια —' : `${home} ${home === 1 ? 'δρομολόγιο' : 'δρομολόγια'}${guestN ? ` + ${guestN} από ${guestW.join(', ')}` : ''}`].join(' · ');
      intlHtml = `<section class="ow4-sec"><h3 class="ow4-h">Διεθνείς <span>${esc(meta)}</span></h3>
        <div class="ow4-card">${_headHtml('intl', nExp, nImp)}${body.join('')}</div></section>`;
    }

    // ── national board (§08) ──
    let natlHtml = '';
    if (showN) {
      let inner;
      if (d.natlFailed) inner = '<div class="ow4-day ow4-day-0">Οι εθνικές δεν διαβάστηκαν — «—», όχι μηδέν.</div>';
      else if (!natRows.length) inner = '<div class="ow4-day ow4-day-0">Καμία εθνική παραγγελία αυτή την εβδομάδα.</div>';
      else {
        for (const r of natRows) for (const s of [r.kat, r.ano]) if (s && s.kind === 'order' && !s.inWeek && O.hasPrice(s.rec.fields) && !isVsNational(s.rec)) star.push({ who: O.numLabel(s.rec), amt: O.price(s.rec.fields), w: s.week, sec: 'Εθνικά' });
        inner = natRows.map(r => _natRowHtml(r, stateOf)).join('');
      }
      const nKat = m.weekNatl.filter(r => r.fields['Direction'] !== 'South→North').length, nAno = m.weekNatl.length - nKat;
      const meta = d.natlFailed ? '—' : `${m.weekNatl.length} ${m.weekNatl.length === 1 ? 'παραγγελία' : 'παραγγελίες'}`;
      natlHtml = `<section class="ow4-sec"><h3 class="ow4-h">Εθνικές <span>${esc(meta)}</span></h3>
        <div class="ow4-card">${_headHtml('natl', d.natlFailed ? null : nKat, d.natlFailed ? null : nAno)}${inner}</div></section>`;
    }

    // ── Κατάσταση εβδομάδας ──
    for (const r of tAll.unpricedRecs) dag.push(r);
    const pct = O.addDays(S.week, 6) < today && !(showN && d.natlFailed) ? pctVsPrev(tAll.sum, prevT.sum) : null;
    const sub = [`${dayShort(S.week)} – ${dayShort(O.addDays(S.week, 6))}`,
      pct == null ? '' : `τζίρος ${pct >= 0 ? '+' : '−'}${Math.abs(pct)}% σε σχέση με ${O.weekLabel(O.addDays(S.week, -7))}`,
      tAll.n ? `τιμολογημένες ${tAll.invN} από ${tAll.n}` : '',
      'καθαρά ποσά, χωρίς ΦΠΑ'].filter(Boolean).join(' · ');
    const starIn = sec => star.some(x => x.sec === sec);
    const dagIn = type => tAll.unpricedRecs.some(r => r._type === type);
    const marks = (s, g) => (s || g) ? `<sup class="ow4-mk">${s ? '*' : ''}${g ? '†' : ''}</sup>` : '';
    const money = (t, failed) => failed || !t.n ? ['—', '—', '—'] : [O.eur(t.sum), O.eur(t.invSum), O.eur(t.openSum)];
    const stRows = [];
    if (showI) { const v = money(tI, false); stRows.push(`<tr><th>Διεθνή</th><td>${v[0]}${tI.n ? marks(starIn('Διεθνή'), dagIn('intl')) : ''}</td><td>${v[1]}</td><td>${v[2]}</td></tr>`); }
    if (showN) { const v = money(tN, d.natlFailed); stRows.push(`<tr><th>Εθνικά</th><td>${v[0]}${tN.n && !d.natlFailed ? marks(starIn('Εθνικά'), dagIn('natl')) : ''}</td><td>${v[1]}</td><td>${v[2]}</td></tr>`); }
    const vt = money(tAll, false);
    const stHtml = `<section class="ow4-state"><h3 class="ow4-h">Κατάσταση εβδομάδας <span>${esc(sub)}</span></h3>
      <table class="ow4-st"><colgroup><col class="ow4-st-c0"><col class="ow4-st-c1"><col><col></colgroup><thead><tr><th></th><th>ΤΖΙΡΟΣ €</th><th>ΤΙΜΟΛΟΓΗΜΕΝΑ €</th><th>ΑΤΙΜΟΛΟΓΗΤΑ €</th></tr></thead>
      <tbody>${stRows.join('')}</tbody>
      <tfoot><tr><th>Σύνολο εβδομάδας${esc(natGap)}</th><td>${vt[0]}${tAll.n ? marks(star.length > 0, tAll.unpriced > 0) : ''}</td><td>${vt[1]}</td><td>${vt[2]}</td></tr></tfoot></table>
      ${tAll.n || (showN && d.natlFailed) ? '' : '<p class="ow4-note">Καμία παραγγελία με ημερομηνία σε αυτή την εβδομάδα.</p>'}
      ${_footnotes(star, dag)}</section>`;

    ctx.body.innerHTML = `<div class="ow4">
      ${_fails(d, m, scope, undated)}
      <div class="ow4-strip"><button type="button" class="ow4-arr" data-owvshift="-1" aria-label="Προηγούμενη εβδομάδα">‹</button>${strip}<button type="button" class="ow4-arr" data-owvshift="1" aria-label="Επόμενη εβδομάδα">›</button></div>
      ${sumLine}${intlHtml}${natlHtml}${stHtml}</div>`;
    ctx.body.onclick = _onClick;
    _fitAll(ctx.body);
    _watchFit(ctx.body);
  }

  // ── Fitting (§12 #06 / #09; owner rule: never less than one whole word) ──
  // Each order line is fitted on its own, after paint and on every width
  // change: the route takes what the client does not need (the route is cut
  // first), but never less than «from → first word of the destination» (+N
  // boxes whole); the client never less than its first word + «…». Rows keep
  // the shared column split when everything fits, so the columns line up. When
  // even the floors do not fit (open sidebar on a narrow screen) the card
  // scrolls sideways instead of cutting a word. CSS alone cannot do this: the
  // floors are per row, the tracks are per row grid.
  let _cv = null;
  const _fontOf = el => { const cs = getComputedStyle(el); return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; };
  const _tw = (font, txt) => { if (!_cv) _cv = document.createElement('canvas').getContext('2d'); _cv.font = font; return _cv.measureText(txt).width; };
  // As many whole words of `full` as fit in `avail` px, «…» when some are left.
  function _fitWords(el, full, avail) {
    const font = _fontOf(el), words = String(full || '').split(' ').filter(Boolean), ell = _tw(font, '…');
    if (_tw(font, words.join(' ')) <= avail) { el.textContent = words.join(' '); return false; }
    let acc = '';
    for (const w of words) { const c = acc ? acc + ' ' + w : w; if (_tw(font, c) + ell <= avail) acc = c; else break; }
    el.textContent = acc ? acc + '…' : (ell <= avail ? '…' : '');
    return true;
  }
  function _fitSide(card, side) {
    const subs = [...card.querySelectorAll(`.ow4-row:not(.ow4-hd) .ow4-${side} .ow4-sub:not(.ow4-none)`)];
    if (!subs.length) return 0;
    const s0 = subs[0], cs = getComputedStyle(s0), kids = s0.children;
    const gap = parseFloat(cs.columnGap) || 0;
    const inner = s0.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const fixed = side === 'l' ? kids[2].offsetWidth + kids[3].offsetWidth : kids[0].offsetWidth + kids[1].offsetWidth;
    const A = inner - fixed - 3 * gap;                       // route + client + their gap
    const R = Math.floor((A - gap) * (side === 'l' ? 1 / 2.1 : 0.9 / 2.05));   // the shared split (header)
    let need = 0;
    for (const sub of subs) {
      const route = sub.querySelector('.ow4-route'), cl1 = sub.querySelector('.ow4-cl1'), cl2 = sub.querySelector('.ow4-cl2');
      if (!route || !cl1) continue;
      const tailEl = route.querySelector('.ow4-rt'), tail = route.dataset.tail || '';
      let fixedR = 0;
      for (const ch of route.children) if (ch !== tailEl) fixedR += ch.getBoundingClientRect().width + (parseFloat(getComputedStyle(ch).marginLeft) || 0);
      const tcs = getComputedStyle(tailEl), tf = _fontOf(tailEl), mL = parseFloat(tcs.marginLeft) || 0;
      const full = Math.ceil(fixedR + (tail ? mL + _tw(tf, tail) : 0)) + 1;
      const floor = Math.ceil(fixedR + (tail ? mL + _tw(tf, '…') : 0)) + 1;
      const cf = _fontOf(cl1), c = Math.ceil(_tw(cf, cl1.textContent)) + 1;
      const first = t => String(t || '').trim().split(/\s+/)[0] || '';
      const cFloor = Math.ceil(Math.max(_tw(cf, first(cl1.textContent) + '…'), cl2 ? _tw(_fontOf(cl2), first(cl2.textContent) + '…') : 0)) + 1;
      let w;
      if (full + gap + c <= A) w = Math.min(Math.max(R, full), A - gap - c);
      else w = Math.max(floor, A - gap - c);
      if (A - gap - w < cFloor) need = Math.max(need, w + gap + cFloor - A);
      sub.style.setProperty('--ow4-rw', Math.floor(w) + 'px');
      const cut = tail ? _fitWords(tailEl, tail, w - fixedR - mL - 1) : false;
      // For the reader and the critics' rig: was the route shortened?
      // 'floor' = the route is already down to its whole-word floor and the
      // client is still cut: rule (a) outranks (b), nothing more can give.
      route.dataset.cut = cut ? 'tail' : (A - gap - w < c && w <= floor ? 'floor' : '');
    }
    return need;
  }
  function _fitCard(card) {
    card.classList.remove('ow4-scroll');
    card.style.removeProperty('--ow4-minw');
    card.style.removeProperty('--ow4-gap');
    const fit = () => Math.max(_fitSide(card, 'l'), _fitSide(card, 'r'));
    // §12 #09: 20px gaps at 1440, down to 12px only when a whole word needs it.
    if (fit() <= 0) return;
    card.style.setProperty('--ow4-gap', '12px');
    for (let pass = 0; pass < 3; pass++) {
      const need = fit();
      if (need <= 0) return;
      card.classList.add('ow4-scroll');
      const cur = parseFloat(card.style.getPropertyValue('--ow4-minw')) || card.clientWidth;
      // Once it scrolls anyway, scroll to the 1440 frame's width (1240) at
      // least, so the clients get their room too — not just the floors.
      card.style.setProperty('--ow4-minw', Math.ceil(Math.max(cur + 2 * need + 4, pass === 0 ? 1240 : 0)) + 'px');
    }
  }
  // The verdict line keeps the Σ on its own line: whole words, «…», title.
  function _fitVerdicts(root) {
    root.querySelectorAll('.ow4-vd').forEach(el => {
      el.textContent = el.dataset.full || '';
      if (el.scrollWidth > el.clientWidth + 1) _fitWords(el, el.dataset.full, el.clientWidth - 1);
    });
  }
  // «Κατάσταση εβδομάδας»: ΤΖΙΡΟΣ ends where Σ RT ends (design), the other two
  // share the rest. Only when the board does not scroll sideways.
  function _alignState(root) {
    const st = root.querySelector('.ow4-st'), c0 = root.querySelector('.ow4-st-c0'), c1 = root.querySelector('.ow4-st-c1');
    const card = root.querySelector('.ow4-card'), sig = card && card.querySelector('.ow4-hd .ow4-asg');
    if (!st || !c0 || !c1) return;
    if (!sig || card.classList.contains('ow4-scroll')) { c0.style.width = ''; c1.style.width = ''; return; }
    const td = st.querySelector('tbody td, tfoot td');
    const pad = td ? parseFloat(getComputedStyle(td).paddingRight) || 0 : 0;
    const sigR = sig.getBoundingClientRect().right - (parseFloat(getComputedStyle(sig).paddingRight) || 0);
    const left = st.getBoundingClientRect().left, W1 = 170;
    c1.style.width = W1 + 'px';
    c0.style.width = Math.max(120, Math.round(sigR + pad - left - W1)) + 'px';
  }
  function _fitAll(root) {
    if (!root || typeof document === 'undefined') return;
    root.querySelectorAll('.ow4-card').forEach(_fitCard);
    _fitVerdicts(root);
    _alignState(root);
  }
  // Re-fit on every width change of the board — a sidebar toggle changes it
  // without a window resize — and once the web fonts have arrived (metrics
  // measured on the fallback font are 2–3px off).
  function _watchFit(root) {
    if (S.ro) S.ro.disconnect();
    const run = () => { if (S.ctx && S.ctx.isCurrent()) _fitAll(S.ctx.body); };
    if (typeof ResizeObserver !== 'undefined') {
      let raf = 0, lastW = -1;
      S.ro = new ResizeObserver(ents => {
        const w = Math.round(ents[0].contentRect.width);
        if (w === lastW) return;
        lastW = w; cancelAnimationFrame(raf); raf = requestAnimationFrame(run);
      });
      const el = root.querySelector('.ow4');
      if (el) S.ro.observe(el);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
  }

  function _footnotes(star, dag) {
    const O = OC(), out = [];
    const cap = (list, n) => list.length > n ? list.slice(0, n).join(' · ') + ` · και ${list.length - n} ακόμη` : list.join(' · ');
    if (star.length) {
      const secs = [...new Set(star.map(x => x.sec))].map(s => 'στα ' + s).join(', ');
      out.push(`<p>* Στα Σ με «*», ${esc(secs)} και στο Σύνολο: χωρίς τα γκρι ποσά, που μετρούν σε άλλη εβδομάδα — ${esc(cap(star.map(x => `${x.who} ${O.eur(x.amt)} ${weekMark(x.w)}`), 12))}.</p>`);
    }
    if (dag.length) {
      const secs = [...new Set(dag.map(r => r._type === 'natl' ? 'στα Εθνικά' : 'στα Διεθνή'))].join(', ');
      const what = dag.length === 1 ? 'την 1 παραγγελία χωρίς τιμή' : `τις ${dag.length} παραγγελίες χωρίς τιμή`;
      out.push(`<p>† Στα Σ με «†», ${esc(secs)} και στο Σύνολο: χωρίς ${what} — ${esc(cap(dag.map(r => O.numLabel(r) + (r._type === 'natl' ? ' (εθνική)' : ' (διεθνής)')), 12))}.</p>`);
    }
    return out.length ? `<div class="ow4-foot">${out.join('')}</div>` : '';
  }

  // Two-line sticky column header (§01). `kind` intl | natl.
  function _headHtml(kind, nL, nR) {
    const intl = kind === 'intl';
    const cnt = n => n == null ? '' : ` <span>${n}</span>`;
    return `<div class="ow4-row ow4-hd${intl ? '' : ' ow4-nat'}">
      <div class="ow4-c-rt"><i></i><b>${intl ? 'RT' : 'ΗΜΕΡΑ'}</b></div>
      <div class="ow4-side ow4-l"><i>${intl ? 'ΕΞΑΓΩΓΗ' : 'ΚΑΘΟΔΟΣ'}${cnt(nL)}</i><div class="ow4-sub"><b>ΔΙΑΔΡΟΜΗ</b><b>ΠΕΛΑΤΗΣ</b><b>ΤΠΥ</b><b class="ow4-n">ΠΟΣΟ €</b></div></div>
      <div class="ow4-asg"><i>ΑΝΑΘΕΣΗ</i><div class="ow4-asg-h"><b>ΟΧΗΜΑ</b><b class="ow4-n">${intl ? 'Σ RT €' : 'Σ €'}</b></div></div>
      <div class="ow4-side ow4-r"><i>${intl ? 'ΕΙΣΑΓΩΓΗ' : 'ΑΝΟΔΟΣ'}${cnt(nR)}</i><div class="ow4-sub"><b class="ow4-n">ΠΟΣΟ €</b><b>ΤΠΥ</b><b>ΠΕΛΑΤΗΣ</b><b>ΔΙΑΔΡΟΜΗ</b></div></div></div>`;
  }
  const _secHead = (label, meta) => `<div class="ow4-day">${esc(label)} <span>${esc(meta)}</span></div>`;

  // One order inside a side (§01/§02): route · client · ΤΠΥ · amount (mirrored
  // on the import side). `l` = a leg { rec, inWeek, week, piece, dupOf, … }.
  function _legCells(l, side, stateOf, natlAnchorDay) {
    const O = OC();
    const cells = { route: '', client: '', tpy: '', amt: '' };
    if (!l.rec) {
      cells.amt = `<span class="ow4-d" title="Η παραγγελία δεν είναι στο εύρος που διαβάστηκε">#${esc(l.orderId)} εκτός εύρους</span>`;
    } else {
      const f = l.rec.fields || {}, e = endsOf(l.rec);
      const split = routeSplit(e.from || '—', e.to || '—');
      const nBox = n => n > 0 ? `<span class="ow4-pn">+${n}</span>` : '';
      const fromHtml = esc(e.from || '—') + nBox(e.nFrom);
      const headRest = esc(split.head.slice((e.from || '—').length));
      const full = `${e.from || '—'}${e.nFrom ? ' +' + e.nFrom : ''} → ${e.to || '—'}${e.nTo ? ' +' + e.nTo : ''}`;
      // The national ΚΑΘΟΔΟΣ that sets the row's day shows only «→ delivery».
      const dates = natlAnchorDay ? `<span class="ow4-ar">→</span> ${esc(dayShort(e.del))}`
        : `${esc(dayShort(e.load) || '—')} <span class="ow4-ar">→</span> ${esc(dayShort(e.del) || '—')}`;
      // data-tail: the words after the destination's first one — _fitRow shows
      // as many WHOLE words of it as fit, never a partial word or code.
      cells.route = `<div class="ow4-l1 ow4-route" title="${esc(full)}" data-tail="${esc(split.tail.trim())}"><span class="ow4-rh">${fromHtml}${headRest.replace('→', '<span class="ow4-ar">→</span>')}</span><span class="ow4-rt">${esc(split.tail.trim())}</span>${nBox(e.nTo)}</div><div class="ow4-l2 ow4-ell">${dates}</div>`;
      const cl = clientRaw(f) || '—';
      const refs = [O.numLabel(l.rec), f['Reference'], f['Veroia Switch'] ? 'VS' : ''].filter(Boolean).join(' · ');
      cells.client = `<div class="ow4-l1 ow4-ell ow4-cl1" title="${esc(cl)}">${esc(cl)}</div><div class="ow4-l2 ow4-ell ow4-cl2" title="${esc(refs)}">${O.docClip(l.rec, l.rec && l.rec._type)}${esc(refs)}</div>`;
      const has = O.hasPrice(f), st = stateOf(l.rec), tp = tpyOf(l.rec, st);
      cells.tpy = `<span class="ow4-tpy${tp.cls ? ' ' + tp.cls : ''}" title="${esc(tp.title)}">${tp.cls === 'bad' ? '<span class="ow4-dot"></span>' : ''}${esc(tp.text)}</span>`;
      if (l.cancelled) cells.amt = '<span class="ow4-d" title="Ακυρωμένη — δεν αθροίζεται">ακυρωμένη</span>';
      else if (l.piece) cells.amt = `<span class="ow4-d" title="Τιμολογείται η παρτίδα">στην παρτίδα ${esc(OrdersStock.lotNumLabel(f))}</span>`;
      else if (l.parentMissing) cells.amt = '<span class="ow4-d" title="Η αρχική παραγγελία του σκέλους δεν διαβάστηκε">αρχική εκτός ανάγνωσης</span>';
      else if (l.dupOf) cells.amt = `<span class="ow4-d" title="Σκέλος σπασμένης — μετρά μία φορά">στο ${esc(l.dupOf)}</span>`;
      else if (isVsNational(l.rec)) cells.amt = `<span class="ow4-d">${has ? O.eur(O.price(f)) : '—'}</span>`;
      else if (!l.inWeek) cells.amt = `<span class="ow4-off-amt">${has ? O.eur(O.price(f)) : '—'}</span><span class="ow4-l2">${esc(weekMark(l.week))}</span>`;
      else cells.amt = has ? O.eur(O.price(f)) : '<span class="ow4-d" title="Χωρίς τιμή — δεν αθροίζεται">—</span>';
    }
    const off = l.rec && (!l.inWeek || l.piece || l.dupOf || l.parentMissing || l.cancelled) ? ' ow4-off' : '';
    const open = l.rec ? ` data-owvopen="${l.rec._type === 'natl' ? 'natl' : 'intl'}:${esc(l.rec.id)}"` : '';
    const c = [`<div class="ow4-c">${cells.route}</div>`, `<div class="ow4-c">${cells.client}</div>`, `<div class="ow4-c">${cells.tpy}</div>`, `<div class="ow4-c ow4-n">${cells.amt}</div>`];
    return `<div class="ow4-sub${off}"${open}>${(side === 'l' ? c : c.reverse()).join('')}</div>`;
  }
  const _emptySide = text => `<div class="ow4-sub ow4-none"><div class="ow4-c">${text}</div></div>`;

  function _assignHtml(v, verdict, sumHtml, extra) {
    let top;
    if (v.kind === 'own' || (v.kind === 'partner' && v.plate)) top = `<span class="ow4-plate">${esc(v.plate)}</span> <span class="ow4-who ow4-ell" title="${esc(v.who)}">${esc(v.who)}</span>`;
    else if (v.kind === 'partner') top = `<span class="ow4-who ow4-ell" title="${esc(v.who)}">${esc(v.who)}</span>`;
    else top = `<span class="${v.text === '—' ? 'ow4-d' : 'ow4-asg-pa'}">${esc(v.text)}</span>`;
    return `<div class="ow4-asg"><div class="ow4-l1 ow4-veh">${extra || top}</div>
      <div class="ow4-asg-b"><span class="ow4-vd" title="${esc(verdict)}" data-full="${esc(verdict)}">${esc(verdict)}</span><span class="ow4-sig">${sumHtml}</span></div></div>`;
  }
  function _sumHtml(recs, mk) {
    // Only the turnover (sum, unpriced) is read here: the state is not needed.
    const O = OC(), t = totals(recs, () => ({}));
    const marks = mk && (mk.s || mk.g) ? `<sup class="ow4-mk">${mk.s ? '*' : ''}${mk.g ? '†' : ''}</sup>` : '';
    return (t.sum > 0 ? O.eur(t.sum) : '—') + marks;
  }

  function _rtRowHtml(r, stateOf, mk, rtFailed) {
    const O = OC();
    const v = vehicleOf(r.vehicleRec);
    const verdict = rtInvoicing(r.counted, stateOf);
    const n = r.counted.filter(x => !isVsNational(x)).length;
    // RTs not read: whether the other side exists is unknown — «—», never «Χωρίς».
    const unknown = _emptySide('<span class="ow4-d" title="Τα δρομολόγια δεν διαβάστηκαν">—</span>');
    const exp = r.exp.length ? r.exp.map(l => _legCells(l, 'l', stateOf)).join('') : rtFailed ? unknown : _emptySide('<span class="ow4-g">Χωρίς εξαγωγή</span>');
    let imp;
    if (r.imp.length) imp = r.imp.map(l => _legCells(l, 'r', stateOf)).join('');
    else if (rtFailed) imp = unknown;
    else if (r.natLegs && r.natLegs.length) {
      // §03: a national load on the way back is a return, not an empty truck;
      // its price counts with the nationals (or the VS international order).
      imp = _emptySide(`<span class="ow4-g">${r.natLegs.some(x => x.dir === 'up') ? 'Άνοδος εθνικών' : 'Κάθοδος εθνικών'}</span>`);
    } else if (r.kind === 'rt' && v.kind === 'own' && r.exp.length) {
      // Weekly v4's words: own truck, export, nothing back = «Κενό γύρισμα».
      const last = r.exp[r.exp.length - 1].rec;
      const e = last ? endsOf(last) : null;
      const detail = e ? [e.del ? 'από ' + dayShort(e.del) : '', e.last].filter(Boolean).join(' · ') : '';
      imp = _emptySide(`<span class="ow4-g">Κενό γύρισμα</span>${detail ? ` <span class="ow4-d">· ${esc(detail)}</span>` : ''}`);
    } else imp = _emptySide('<span class="ow4-g">Χωρίς εισαγωγή</span>');
    const isRt = r.kind === 'rt';
    const tag = !isRt ? (rtFailed ? '' : 'χωρίς RT') : r.guest ? 'από ' + O.dm(r.homeWeek) : r.moved ? 'μεταφορά' : v.kind === 'partner' ? 'συνεργάτης'
      : r.exp.length > 1 || r.imp.length > 1 ? 'groupage' : '';
    const blk = verdict.kind === 'blocked';   // the price: the one block since B0
    return `<div class="ow4-row${blk ? ' ow4-blk' : ''}" data-owvopen="intl:${esc(r.openRec.id)}">
      <div class="ow4-c-rt"><div class="ow4-l1">${isRt ? esc(r.code) : '<span class="ow4-d">—</span>'}</div>${tag ? `<div class="ow4-l2">${esc(tag)}</div>` : ''}</div>
      <div class="ow4-side ow4-l">${exp}</div>
      ${_assignHtml(v, verdictText(verdict, n), _sumHtml(r.counted, mk))}
      <div class="ow4-side ow4-r">${imp}</div></div>`;
  }

  function _natRowHtml(r, stateOf) {
    const O = OC();
    const side = (s, which) => {
      const up = which === 'r';
      if (!s) return _emptySide(r.loadsFailed ? '<span class="ow4-d">—</span>' : `<span class="ow4-g">${up ? 'Χωρίς άνοδο' : 'Χωρίς κάθοδο'}</span>`);
      const word = s.dir === 'up' ? 'Άνοδος' : 'Κάθοδος';
      if (s.kind === 'vs') return _emptySide(`<span class="ow4-g" title="Την τιμή τη φέρει η διεθνής παραγγελία — δεν αθροίζεται εδώ">${word} VS${s.intlRec ? ' · ' + esc(O.numLabel(s.intlRec)) : ''}</span>`);
      if (s.kind === 'grp') return _emptySide(`<span class="ow4-g">${word} · μέσω ομαδοποίησης</span>`);
      if (s.kind === 'claimed') return _emptySide(`<span class="ow4-g">${word} · ${esc(O.numLabel(s.rec))} σε άλλη γραμμή</span>`);
      if (s.kind === 'unread') return _emptySide(`<span class="ow4-d" title="Το ζευγάρι υπάρχει αλλά η παραγγελία του δεν διαβάστηκε">${word} · εκτός εύρους</span>`);
      const leg = { rec: s.rec, inWeek: s.inWeek, week: s.week, piece: false, dupOf: null, parentMissing: false };
      return _legCells(leg, which, stateOf, which === 'l' && s.inWeek);
    };
    let v, extra = '';
    if (r.assign.kind === 'load') v = vehicleOf(r.assign.load);
    else if (r.assign.kind === 'v5') v = vehicleOfV5(r.assign.state);
    else {
      v = { kind: 'none', plate: '', who: '', text: '' };
      extra = r.assign.kind === 'grp' ? '<span class="ow4-asg-none">μέσω ομαδοποίησης</span>'
        : r.assign.kind === 'out' ? '<span class="ow4-asg-none" title="Εθνική που δεν μπήκε σε φορτίο">εκτός φορτίου</span>'
        : `<span class="ow4-d" title="${r.openRec && r.openRec._v5 === 'err' ? 'Η κατάσταση των εθνικών v5 δεν διαβάστηκε' : 'Τα φορτία εθνικών δεν διαβάστηκαν'}">—</span>`;
    }
    const verdict = rtInvoicing(r.counted, stateOf);
    const n = r.counted.filter(x => !isVsNational(x)).length;
    const mk = { s: [r.kat, r.ano].some(s => s && s.kind === 'order' && !s.inWeek && O.hasPrice(s.rec.fields)),
      g: r.counted.some(x => !isVsNational(x) && !O.hasPrice(x.fields)) };
    const blk = verdict.kind === 'blocked';   // the price: the one block since B0
    return `<div class="ow4-row ow4-nat${blk ? ' ow4-blk' : ''}" data-owvopen="natl:${esc(r.openRec.id)}">
      <div class="ow4-c-rt"><div class="ow4-l1">${esc(dayShort(r.day) || '—')}</div>${v.kind === 'partner' ? '<div class="ow4-l2">συνεργάτης</div>' : ''}</div>
      <div class="ow4-side ow4-l">${side(r.kat, 'l')}</div>
      ${_assignHtml(v, verdictText(verdict, n), _sumHtml(r.counted, mk), extra)}
      <div class="ow4-side ow4-r">${side(r.ano, 'r')}</div></div>`;
  }

  function _onClick(e) {
    const shift = e.target.closest('[data-owvshift]');
    if (shift) { S.week = OC().addDays(S.week, 7 * Number(shift.dataset.owvshift)); return _rerender(); }
    const wk = e.target.closest('[data-owvweek]');
    // Re-read, not repaint: the loaded window is centred on the old week, so the
    // new week's «previous week» (for the %) may sit outside it.
    if (wk) { if (wk.dataset.owvweek !== S.week) { S.week = wk.dataset.owvweek; _rerender(); } return; }
    if (e.target.closest('[data-owvretry]')) { S.force = true; return _rerender(); }
    const go = e.target.closest('[data-owvgo]');
    if (go) return OrdersHub.setView(go.dataset.owvgo);
    const open = e.target.closest('[data-owvopen]');
    if (open) {
      const [type, id] = open.dataset.owvopen.split(':');
      OrdersHub.openOrder(type, id);
    }
  }

  // New strip window → new read; the header (tabs, scope) stays.
  function _rerender() {
    const ctx = S.ctx; if (!ctx || !ctx.isCurrent()) return;
    ctx.body.innerHTML = typeof showLoading === 'function' ? showLoading('Φόρτωση εβδομάδας…') : '';
    render(ctx).catch(err => {
      if (!ctx.isCurrent()) return;
      ctx.body.innerHTML = typeof showError === 'function'
        ? showError('Η εβδομάδα δεν φορτώθηκε. Δεν σημαίνει ότι λείπουν δεδομένα — η ανάγνωση απέτυχε. Ξαναδοκίμασε.')
        : 'Σφάλμα φόρτωσης';
      if (typeof logError === 'function') logError(err, 'orders week');
    });
  }

  // CSV: one line per order shown, NET amounts (owner 13/10), with «Μετρά εδώ»
  // (§04): a grey leg of another week is listed but counted in its own week.
  function _csv() {
    const m = S.model; if (!m) return;
    const O = OC(), scope = S.ctx ? S.ctx.scope : 'all';
    const stateOf = _stateFn(S.data.set);
    const stLabel = r => { if (isVsNational(r)) return 'δεν τιμολογείται'; const s = stateOf(r); return s.key === 'invoiced' ? 'τιμολογήθηκε' : s.key === 'blocked' ? 'μπλοκαρισμένη: ' + (REASON[s.reason] || s.reason) : s.key === 'ready' ? (s.noSheets ? 'προς κοπή · λείπει δελτίο' : 'προς κοπή') : 'ακυρωμένη'; };
    const line = (rt, r, vrec, counts) => {
      const f = r.fields, v = vehicleOf(vrec), e = endsOf(r);
      return [O.weekLabel(m.week), O.ymd(O.weekDateOf(r)), rt, r._type === 'natl' ? (f['Direction'] === 'South→North' ? 'Άνοδος' : 'Κάθοδος') : (f['Direction'] === 'Import' ? 'Εισαγωγή' : 'Εξαγωγή'),
        O.numLabel(r), f['Reference'] || '', clientRaw(f), `${e.from} → ${e.to}`, v.plate || v.text, v.who,
        O.hasPrice(f) ? String(O.price(f)).replace('.', ',') : '', counts ? 'ναι' : 'όχι', stLabel(r), String(f['Invoice Number'] || '')];
    };
    const rows = [['Εβδομάδα', 'Ημέρα Weekly', 'RT', 'Τύπος', 'Αρ.', 'Reference', 'Πελάτης', 'Διαδρομή', 'Όχημα', 'Οδηγός / συνεργάτης', 'Ποσό € (καθαρό)', 'Μετρά εδώ', 'Τιμολόγηση', 'ΤΠΥ']];
    if (scope !== 'natl') {
      m.rows.forEach(r => r.legs.forEach(l => { if (l.rec) rows.push(line(r.code, l.rec, r.vehicleRec, l.counted)); }));
      m.noRt.forEach(r => rows.push(line('', r.rec, r.rec, true)));
    }
    if (scope !== 'intl') (S.natRows || []).forEach(r => [r.kat, r.ano].forEach(s => {
      if (s && s.kind === 'order') rows.push(line('', s.rec, r.assign.kind === 'load' ? r.assign.load : null, s.inWeek && !isVsNational(s.rec)));
    }));
    if (rows.length === 1) { toast('Καμία παραγγελία για εξαγωγή αυτή την εβδομάδα', 'error'); return; }
    OrdersList.csvDownload(rows, `orders_week_${m.week}.csv`);
  }

  if (typeof OrdersHub !== 'undefined') {
    OrdersHub.register('week', {
      label: 'Εβδομάδα', order: 3,
      // Owner, accountant, management — never the dispatcher: «Client Revenue»
      // is hidden from dispatchers by an owner decision (23/8).
      visible: () => typeof can === 'function' && can('costs') !== 'none',
      render,
    });
  }

  return { render, buildWeek, totals, rtInvoicing, verdictText, tpyOf, pctVsPrev, stripWeeks, groupRows, daySections,
    weekStatus, pairNationals, routeSplit, ordersFormula, placeText, isVsNational, naturalDateOf, pgIdOf, dayLabel, weekTitle };
})();

if (typeof window !== 'undefined') window.OrdersWeekView = OrdersWeekView;
if (typeof module !== 'undefined' && module.exports) module.exports = OrdersWeekView;
