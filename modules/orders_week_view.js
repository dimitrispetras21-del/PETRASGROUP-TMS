// ═══════════════════════════════════════════════════════════════════════════
// VIEW — «Εβδομάδα» of the one «Παραγγελίες» page (modules/orders_hub.js)
//
// Owner 28/9/2026: «να βλέπω συγκεντρωτικά 1 φορά την εβδομάδα πολύ γρήγορα πόσα
// χρήματα έπιασε κάθε RT, συνολικοί τζίροι και αν έχουν όλα τιμολογηθεί».
// Figma round 6, frame 808:1011 (approved).
//
// Locked rules (owner 28/9):
// - The week follows the WEEKLY: OrdersCommon.weekStartOf (export by delivery,
//   import and national by loading, Saturday–Friday). «Προς τιμολόγηση» uses the
//   same function, so one week prints one total on both views.
// - An RT belongs to the week of its EXPORT leg's order (import-only RT → that
//   import's week). A leg whose order sits in ANOTHER week is shown dimmed with
//   that week and is NOT summed here: it is summed in its own week, where the RT
//   appears as a «guest» row. Every order is counted in exactly one week and in
//   exactly one RT row — Σ RT turnover = the week's international turnover.
// - Turnover = customer prices («Price») only. NO costs and NO margins: the
//   accountant sees this view, and /costs/pnl is owner-only (never called here).
// - Unpriced orders are never summed as 0: «εκτός N χωρίς τιμή».
// - VS national legs (nat_load_id) are skipped: the international order carries
//   the price; VS never appears as a national order (owner).
//
// Data: ORDERS + NATIONAL ORDERS over a window that covers the whole week strip
// (one request per table, bucketed client-side), /costs/rt?overlap=1 for the
// RTs (accountant has GET on rt — Worker COSTS_PERMS), and OrdersData's
// invoicing set for the pallet-slip gate (shared with the hub's counters).
// RT legs point at the Postgres order id; ORDERS exposes it read-only as
// «Order ID» (Worker computed "Order ID": "id"; «Order No» is the same id via
// the view's order_no alias — used as a fallback).
// ═══════════════════════════════════════════════════════════════════════════
const OrdersWeekView = (() => {
  'use strict';

  const OC = () => OrdersCommon;   // resolved at call time (node tests set the global)
  const DAY_NAMES = ['ΚΥΡΙΑΚΗ', 'ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ'];
  const STRIP_BACK = 3, STRIP_FWD = 1;   // Figma: three weeks back, one ahead
  const REASON = { price: 'τιμή → owner', sheets: 'δελτίο → Αλεξία' };

  // ══ Pure logic (node-tested in tests/orders-week-view.test.js) ═════════════

  const isSplitLeg = rec => {
    const p = (rec.fields || {})['Parent Order'];
    return Array.isArray(p) ? p.length > 0 : !!p;
  };
  // Postgres id of an ORDERS record, as a string key (RT legs carry it as a number).
  function pgIdOf(rec) {
    const f = rec.fields || {};
    const v = f['Order ID'] != null && f['Order ID'] !== '' ? f['Order ID'] : f['Order No'];
    return v == null || v === '' ? null : String(v);
  }

  // Five Saturdays: the selected week in the 4th slot, like the Figma strip.
  function stripWeeks(sel) {
    const out = [];
    for (let k = -STRIP_BACK; k <= STRIP_FWD; k++) out.push(OC().addDays(sel, 7 * k));
    return out;
  }

  // Money of a set of orders. `stateOf(rec)` → OrdersData.stateOf shape.
  function totals(recs, stateOf) {
    const t = { n: 0, sum: 0, unpriced: 0, invN: 0, invSum: 0, openN: 0, readyN: 0, readySum: 0,
      blockedN: 0, blocked: { price: 0, sheets: 0 }, pendingN: 0, oldest: null };
    for (const r of recs) {
      t.n++;
      const f = r.fields || {};
      const has = OC().hasPrice(f);
      const p = has ? OC().price(f) : 0;
      if (has) t.sum += p; else t.unpriced++;
      const s = stateOf(r);
      if (s.key === 'invoiced') { t.invN++; t.invSum += p; continue; }
      t.openN++;
      if (s.key === 'ready') { t.readyN++; t.readySum += p; }
      else if (s.key === 'blocked') { t.blockedN++; t.blocked[s.reason] = (t.blocked[s.reason] || 0) + 1; }
      else t.pendingN++;
      if (s.key === 'ready' || s.key === 'blocked') {
        const d = OC().daysSinceDelivery(r);
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

  // One invoicing verdict per RT, from the orders it counts this week.
  // Blocked wins over «partly»: a blocker names who has to act.
  function rtInvoicing(recs, stateOf) {
    if (!recs.length) return { kind: 'none' };
    const st = recs.map(stateOf);
    const inv = st.filter(s => s.key === 'invoiced').length;
    if (inv === recs.length) {
      const nums = new Set(recs.map(r => String((r.fields || {})['Invoice Number'] || '').trim()));
      return nums.size === 1 && !nums.has('') ? { kind: 'one', rec: recs[0] } : { kind: 'all' };
    }
    const reasons = [...new Set(st.filter(s => s.key === 'blocked').map(s => s.reason))];
    if (reasons.length) return { kind: 'blocked', reasons };
    if (inv > 0) {
      let open = 0;
      recs.forEach((r, i) => { if (st[i].key !== 'invoiced' && OC().hasPrice(r.fields)) open += OC().price(r.fields); });
      return { kind: 'partial', k: inv, n: recs.length, open };
    }
    if (st.some(s => s.key === 'ready')) return { kind: 'ready' };
    return { kind: 'progress' };
  }

  // The week's model. intl/natl = every fetched, non-cancelled record of the
  // window (tagged _type); rts = /costs/rt records, or null when that read failed.
  function buildWeek({ week, intl, natl, rts }) {
    const O = OC();
    const wk = r => O.weekStartOf(r);
    const weekIntl = intl.filter(r => !isSplitLeg(r) && wk(r) === week);
    const weekNatl = natl.filter(r => wk(r) === week);

    // pg id → record. A split leg resolves to its parent when the parent was
    // fetched: the parent carries price and invoicing (FEATURES.ORDER_SPLIT).
    const byRec = new Map(intl.map(r => [r.id, r]));
    const byPg = new Map();
    for (const r of intl) {
      const pg = pgIdOf(r); if (!pg) continue;
      let target = r;
      if (isSplitLeg(r)) {
        const p = r.fields['Parent Order']; const pid = Array.isArray(p) ? p[0] : p;
        if (byRec.has(pid)) target = byRec.get(pid);
      }
      byPg.set(pg, target);
    }

    const rows = [];
    const claimed = new Map();   // rec id → RT code that counts it
    if (rts) {
      const list = rts.filter(rt => rt.status !== 'cancelled')
        .slice().sort((a, b) => String(a.date_start || '').localeCompare(String(b.date_start || '')) || (a.id - b.id));
      for (const rt of list) {
        const legs = (rt.ct_rt_legs || [])
          .filter(l => !l.nat_load_id && l.order_id != null)   // VS legs: not customer revenue
          .slice().sort((a, b) => (a.seq || 0) - (b.seq || 0))
          .map(l => {
            const rec = byPg.get(String(l.order_id)) || null;
            const dir = String(l.direction || '').toUpperCase().includes('IMP') ? 'import' : 'export';
            const w = rec ? wk(rec) : null;
            return { dir, orderId: l.order_id, rec, week: w, inWeek: !!rec && w === week, counted: false, dupOf: null };
          });
        if (!legs.length) continue;
        const home = legs.find(l => l.dir === 'export' && l.rec) || legs.find(l => l.rec);
        if (!home) continue;                        // none of its orders is in the window
        const homeWeek = wk(home.rec);
        const inWeek = legs.filter(l => l.inWeek);
        if (homeWeek !== week && !inWeek.length) continue;
        const code = rt.code || ('RT-' + rt.id);
        for (const l of inWeek) {
          // A split parent reached through two legs (or two RTs) is counted once.
          if (claimed.has(l.rec.id)) { l.dupOf = claimed.get(l.rec.id); continue; }
          claimed.set(l.rec.id, code); l.counted = true;
        }
        const guest = homeWeek !== week;
        const anchor = guest ? (inWeek.find(l => l.dir === 'export') || inWeek[0]).rec : home.rec;
        rows.push({
          kind: 'rt', rt, code, guest, homeWeek, legs,
          exp: legs.filter(l => l.dir === 'export'), imp: legs.filter(l => l.dir === 'import'),
          // A guest row opens the order it counts HERE, not the other week's export.
          day: O.weekDateOf(anchor), vehicleRec: home.rec, openRec: anchor,
          counted: legs.filter(l => l.counted).map(l => l.rec),
          single: legs.length === 1,
        });
      }
    }
    // Never dropped silently: an international order of the week that no RT
    // counts is listed on its own (or, when the RT read failed, every order is).
    const noRt = weekIntl.filter(r => !claimed.has(r.id)).map(r => ({
      kind: 'order', rec: r, day: O.weekDateOf(r), vehicleRec: r, openRec: r, counted: [r],
    }));
    return { week, weekIntl, weekNatl, rows, noRt, rtFailed: !rts };
  }

  // Groups for the table: by Weekly day (Sat → Fri) or by vehicle key.
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

  // Strip cell status: current/future weeks are «σε εξέλιξη» (not a verdict yet).
  function weekStatus(week, recs, stateOf, today) {
    if (OC().addDays(week, 6) >= today) return { kind: 'progress' };
    if (!recs.length) return { kind: 'empty' };
    const open = recs.filter(r => stateOf(r).key !== 'invoiced').length;
    return open ? { kind: 'open', n: open } : { kind: 'all' };
  }

  const dayLabel = ymd => {
    if (!ymd) return 'ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ';
    const d = new Date(ymd + 'T12:00:00');
    return DAY_NAMES[d.getDay()] + ' ' + OC().dm(ymd);
  };

  // ══ Browser side ═══════════════════════════════════════════════════════════

  const S = { week: null, mode: 'day', ctx: null, model: null };
  const esc = s => escapeHtml(String(s == null ? '' : s));
  const clientRaw = f => { const id = Array.isArray(f['Client']) ? f['Client'][0] : null; return id ? ((typeof _fhClientsMap !== 'undefined' && _fhClientsMap[id]) || '') : ''; };

  function defaultWeek() {
    // The last COMPLETE week: the weekly review is done on a closed week (Figma
    // opens on 19–25/9 while 26/9 – 2/10 is «σε εξέλιξη»).
    return OC().addDays(TmsWeek.startOfDate(OC().today()), -7);
  }

  function vehicleOf(rec) {
    if (!rec) return { key: '~', top: '—', sub: '' };
    const f = rec.fields || {};
    const first = v => (Array.isArray(v) ? v[0] : v) || '';
    const pid = first(f['Partner']), tid = first(f['Truck']), did = first(f['Driver']);
    if (pid) {
      const p = getRefPartners().find(x => x.id === pid);
      const name = (p && p.fields['Company Name']) || '';
      return { key: 'p:' + (name || pid), top: name || 'Συνεργάτης', sub: 'συνεργάτης' };
    }
    if (tid) {
      const t = getRefTrucks().find(x => x.id === tid);
      const d = did ? getRefDrivers().find(x => x.id === did) : null;
      const plate = (t && t.fields['License Plate']) || '';
      return { key: 't:' + (plate || tid), top: plate || '—', sub: (d && d.fields['Full Name']) || '' };
    }
    return { key: '~', top: 'χωρίς ανάθεση', sub: '' };
  }

  // «Veroia GR → Verona IT» from the places the forms write.
  function routeOf(rec) {
    const a = OC().placeOf(rec, 'load'), b = OC().placeOf(rec, 'del');
    const s = p => p.sub || p.name || '—';
    return s(a) + ' → ' + s(b);
  }

  async function load(week, scope) {
    const O = OC();
    const strip = stripWeeks(week);
    const from = O.addDays(strip[0], -8), to = O.addDays(O.addDays(strip[strip.length - 1], 6), 8);
    const within = (lbl) => `AND(IS_AFTER({${lbl}},'${from}'),IS_BEFORE({${lbl}},'${to}'))`;
    const inRange = (lbl) => `IS_AFTER({${lbl}},'${from}'),IS_BEFORE({${lbl}},'${to}')`;
    // Same windows as the Weekly boards: exports by delivery OR loading (the
    // exact cut is client-side, so an export without a delivery date is never
    // lost), imports by loading. One ORDERS request for the whole strip.
    const intlF = `AND({Type}='International',OR(AND({Direction}='Export',${inRange('Delivery DateTime')}),AND({Direction}='Export',${inRange('Loading DateTime')}),AND({Direction}='Import',${inRange('Loading DateTime')})))`;
    const natlF = `OR(${within('Loading DateTime')},${within('Delivery DateTime')})`;
    const ok = r => ({ ok: true, r }), fail = tag => e => { console.error('orders week: ' + tag, e); return { ok: false, r: null, e }; };
    const wantIntl = scope !== 'natl', wantNatl = scope !== 'intl';
    const [, intlRes, natlRes, rtRes, setRes] = await Promise.all([
      typeof preloadReferenceData === 'function' ? preloadReferenceData().catch(e => console.warn('orders week: ref', e)) : null,
      // A failed ORDERS read throws: the hub then says «η ανάγνωση απέτυχε»
      // instead of painting a week of zeros.
      wantIntl ? atGetAll(TABLES.ORDERS, { filterByFormula: intlF }, false) : Promise.resolve([]),
      wantNatl ? atGetAll(TABLES.NAT_ORDERS, { filterByFormula: natlF }, false).then(ok, fail('national')) : Promise.resolve(ok([])),
      wantIntl
        ? (typeof ctFetch === 'function'
          ? ctFetch(`/costs/rt?overlap=1&from=${O.addDays(from, -14)}&to=${O.addDays(to, 14)}`).then(ok, fail('/costs/rt'))
          : Promise.resolve({ ok: false, r: null }))
        : Promise.resolve(ok({ records: [] })),
      OrdersData.loadInvoicingSet().then(ok, fail('invoicing set')),
    ]);
    const live = r => r.fields && r.fields['Status'] !== 'Cancelled';
    const intl = (intlRes || []).filter(live); intl.forEach(r => { r._type = 'intl'; });
    const natl = (natlRes.r || []).filter(live); natl.forEach(r => { r._type = 'natl'; });
    // Without the invoicing set the slip gate is unknown → the per-order sheet
    // flags decide (OrdersData.sheetsOk fallback) and a banner says so.
    const set = setRes.ok ? setRes.r : { gate: {}, gateFailed: true, intl: [], natl: [] };
    return {
      week, strip, intl, natl, natlFailed: !natlRes.ok, rts: rtRes.ok ? (rtRes.r.records || []) : null,
      set, setFailed: !setRes.ok, gateFailed: !!set.gateFailed,
    };
  }

  async function render(ctx) {
    // A ‹ › click can land after the user moved to another view: never paint
    // (or hang handlers) on a frame that is no longer ours.
    if (!ctx.isCurrent()) return;
    S.ctx = ctx;
    if (!(typeof can === 'function' && can('costs') !== 'none')) { ctx.body.innerHTML = ''; return; }
    _ensureStyles(); OC().ensureStyles();
    if (!S.week) S.week = defaultWeek();
    ctx.setSub('Εβδομάδα όπως στο Weekly: εξαγωγή κατά παράδοση, εισαγωγή κατά φόρτωση · τζίρος = τιμές πελάτη (το TRIP PnL αφαιρεί το VS και δείχνει κόστη)');
    ctx.setActions(`<button type="button" class="btn btn-ghost btn-sm" data-owv="print">Εκτύπωση</button><button type="button" class="btn btn-ghost btn-sm" data-owv="csv">CSV</button>`);
    // Nationals have no RT and no vehicle yet — the grouping toggle means nothing there.
    if (ctx.scope !== 'natl') _paintModeToggle(ctx);
    const actions = document.getElementById('ohActions');
    if (actions) actions.onclick = e => { const b = e.target.closest('[data-owv]'); if (!b) return; if (b.dataset.owv === 'print') window.print(); else _csv(); };

    const data = await load(S.week, ctx.scope);
    if (!ctx.isCurrent()) return;
    const ids = new Set();
    const addC = r => { const c = Array.isArray(r.fields['Client']) ? r.fields['Client'][0] : null; if (c) ids.add(c); };
    const weekSet = new Set(stripWeeks(S.week));
    [...data.intl, ...data.natl].filter(r => weekSet.has(OC().weekStartOf(r))).forEach(addC);
    if (ids.size && typeof fhBatchResolveClients === 'function') {
      try { await fhBatchResolveClients([...ids]); } catch (e) { console.warn('orders week: clients', e); }
      if (!ctx.isCurrent()) return;
    }
    S.data = data;
    _paint(ctx);
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
    return rec => {
      if (!memo.has(rec)) memo.set(rec, OrdersData.stateOf(set, rec));
      return memo.get(rec);
    };
  }

  function _paint(ctx) {
    const O = OC(), d = S.data, scope = ctx.scope;
    const stateOf = _stateFn(d.set);
    const m = buildWeek({ week: S.week, intl: d.intl, natl: d.natl, rts: d.rts });
    S.model = m;
    const inScope = r => scope === 'all' || r._type === scope;
    const weekAll = [...m.weekIntl, ...m.weekNatl].filter(inScope);
    const tAll = totals(weekAll, stateOf), tI = totals(m.weekIntl, stateOf), tN = totals(m.weekNatl, stateOf);

    // ── strip ──
    const today = O.today();
    const recsOfWeek = w => [...d.intl.filter(r => !isSplitLeg(r)), ...d.natl].filter(r => inScope(r) && O.weekStartOf(r) === w);
    const prevT = totals(recsOfWeek(O.addDays(S.week, -7)), stateOf);
    const strip = d.strip.map(w => {
      const recs = recsOfWeek(w), t = totals(recs, stateOf), st = weekStatus(w, recs, stateOf, today);
      const stHtml = st.kind === 'progress' ? '<span class="owv-st-dim">σε εξέλιξη</span>'
        : st.kind === 'empty' ? '<span class="owv-st-dim">χωρίς παραγγελίες</span>'
        : st.kind === 'all' ? '<span class="owv-st-ok">✓ όλα</span>'
        : `<span class="owv-st-warn">${st.n} ανοιχτ${st.n === 1 ? 'ό' : 'ά'}</span>`;
      return `<button type="button" class="owv-wk${w === S.week ? ' on' : ''}" data-owvweek="${w}" aria-pressed="${w === S.week}">
        <span class="owv-wk-r">${esc(O.weekLabel(w))}</span>
        <span class="owv-wk-v"><b>${t.sum > 0 ? O.eurSym(t.sum) : '—'}</b>${stHtml}</span></button>`;
    }).join('');

    // ── banners (principle 1: a failed read is heard, never an empty table) ──
    const banners = [];
    if (scope !== 'natl' && m.rtFailed) banners.push('Τα RT δεν φορτώθηκαν — οι παραγγελίες εμφανίζονται χωρίς ομαδοποίηση. Τα ποσά των παραγγελιών ισχύουν.');
    if (scope !== 'intl' && d.natlFailed) banners.push('Οι εθνικές παραγγελίες δεν φορτώθηκαν — τα σύνολα παρακάτω ΔΕΝ τις περιλαμβάνουν. Δεν σημαίνει ότι δεν υπάρχουν.');
    if (d.setFailed || d.gateFailed) banners.push('Ο έλεγχος δελτίων παλετών δεν απάντησε — η κατάσταση «μπλοκαρισμένη» βασίζεται στις σημάνσεις της παραγγελίας.');

    // ── KPI band ──
    // A week still running compared to a closed one reads as a collapse (−92% on
    // a Monday): the % is shown for closed weeks only.
    const pct = O.addDays(S.week, 6) < today ? pctVsPrev(tAll.sum, prevT.sum) : null;
    const heroSub = [pct == null ? '' : (pct >= 0 ? '+' : '−') + Math.abs(pct) + '% από την προηγούμενη', tAll.unpriced ? `εκτός ${tAll.unpriced} χωρίς τιμή` : ''].filter(Boolean).join(' · ');
    const homeRts = m.rows.filter(r => !r.guest).length, guestRts = m.rows.length - homeRts;
    // RTs of this week + those that started in another week and count an order here.
    const rtLabel = m.rtFailed ? 'RT —' : `${homeRts} RT` + (guestRts ? ` +${guestRts} άλλης εβδ.` : '');
    let npAll = null;
    if (!d.setFailed) {
      npAll = 0;
      for (const r of OrdersData.all(d.set)) if (inScope(r)) { const s = OrdersData.stateOf(d.set, r); if (s.key === 'blocked' && s.reason === 'price') npAll++; }
    }
    const invPct = tAll.n ? Math.round(tAll.invN / tAll.n * 100) : 0;
    const kpi = `<div class="owv-kpi">
      <div class="owv-k owv-k-hero"><span class="owv-kl">Τζίρος εβδομάδας</span><b class="owv-hero">${O.eurSym(tAll.sum)}</b><span class="owv-ks">${esc(heroSub)}</span></div>
      ${scope !== 'natl' ? `<div class="owv-k"><span class="owv-kl">Διεθνή · ${rtLabel}</span><b class="owv-kv">${O.eurSym(tI.sum)}</b></div>` : ''}
      ${scope !== 'intl' ? `<div class="owv-k"><span class="owv-kl">Εθνικά · ${m.weekNatl.length}</span><b class="owv-kv">${d.natlFailed ? '—' : O.eurSym(tN.sum)}</b></div>` : ''}
      <div class="owv-k"><span class="owv-kl">Τιμολογημένες · ${O.eurSym(tAll.invSum)}</span>
        <span class="owv-kv2"><b>${tAll.invN} / ${tAll.n}</b> <span class="owv-ks">εκκρεμούν ${tAll.openN}</span></span>
        <span class="owv-prog" aria-hidden="true"><i style="width:${invPct}%"></i></span></div>
      <div class="owv-chips">
        ${tAll.blockedN ? `<span class="owv-chip owv-chip-bad" title="Παραδοτέες που δεν τιμολογούνται: ${esc(_reasonsText(tAll.blocked))}">Μπλοκαρισμένες <b>${tAll.blockedN}</b></span>` : ''}
        ${tAll.unpriced || npAll ? `<button type="button" class="owv-chip owv-chip-bad" data-owvgo="noprice">Χωρίς τιμή <b>${tAll.unpriced}</b>${npAll != null ? ` · όλες ${npAll}` : ''} →</button>` : ''}
      </div></div>`;

    // ── international table ──
    let intlHtml = '';
    if (scope !== 'natl') {
      const allRows = [...m.rows];
      const maxT = Math.max(0, ...allRows.map(r => totals(r.counted, stateOf).sum), ...m.noRt.map(r => totals(r.counted, stateOf).sum));
      const body = [];
      const groupHead = (label, rows, unit) => {
        const t = totals(rows.flatMap(r => r.counted), stateOf);
        const amt = t.sum > 0 ? O.eurSym(t.sum) : '';
        const np = t.unpriced ? (t.sum > 0 ? `${t.unpriced} χωρίς τιμή` : 'χωρίς τιμή') : '';
        return `<tr class="owv-g"><td colspan="6">${esc(label)} <span>${[rows.length + ' ' + unit, amt, np].filter(Boolean).map(esc).join(' · ')}</span></td></tr>`;
      };
      const rtRows = m.rtFailed ? m.noRt : m.rows;
      const unitOf = m.rtFailed ? 'παραγγ.' : 'RT';
      const vehKey = r => vehicleOf(r.vehicleRec).key;
      const groups = groupRows(rtRows, S.mode, vehKey);
      for (const g of groups) {
        const label = S.mode === 'vehicle' ? _vehLabel(g.rows[0].vehicleRec) : dayLabel(g.key);
        body.push(groupHead(label, g.rows, unitOf));
        g.rows.forEach(r => body.push(_rowHtml(r, stateOf, maxT)));
      }
      if (!m.rtFailed && m.noRt.length) {
        body.push(groupHead('ΧΩΡΙΣ RT', m.noRt, m.noRt.length === 1 ? 'παραγγελία' : 'παραγγελίες'));
        m.noRt.slice().sort((a, b) => String(a.day).localeCompare(String(b.day))).forEach(r => body.push(_rowHtml(r, stateOf, maxT)));
      }
      if (!body.length) body.push(`<tr><td colspan="6" class="owv-empty">Καμία διεθνής παραγγελία αυτή την εβδομάδα (${esc(O.weekLabel(S.week))}).</td></tr>`);
      const single = m.rows.filter(r => !r.guest && r.single).length;
      const foot = [`Διεθνή · ${m.rtFailed ? 'τα RT δεν φορτώθηκαν' : rtLabel}`, `${m.weekIntl.length} παραγγελίες`, single ? `${single} με ένα μόνο σκέλος` : ''].filter(Boolean).join(' · ');
      intlHtml = `<div class="owv-card"><table class="owv-t">
        <colgroup><col style="width:96px"><col style="width:140px"><col><col><col style="width:130px"><col style="width:150px"></colgroup>
        <thead><tr><th>RT</th><th>Όχημα · Οδηγός</th><th>Εξαγωγή</th><th>Εισαγωγή</th><th class="num">Τζίρος RT</th><th>Τιμολόγηση</th></tr></thead>
        <tbody>${body.join('')}</tbody>
        <tfoot><tr><td colspan="4">${esc(foot)}</td><td class="num"><b class="owv-tot">${O.eurSym(tI.sum)}</b></td><td class="owv-dim">τιμολογ. ${esc(O.eurSym(tI.invSum))}</td></tr></tfoot>
      </table></div>`;
    }

    // ── nationals ──
    let natlHtml = '';
    if (scope !== 'intl') {
      const head = d.natlFailed
        ? '<span class="owv-bad">δεν φορτώθηκαν</span>'
        : `${m.weekNatl.length} παραγγελίες · ${esc(O.eurSym(tN.sum))}${tN.unpriced ? ' · ' + tN.unpriced + ' χωρίς τιμή' : ''} · δεν ανήκουν ακόμη σε RT`;
      const rows = m.weekNatl.slice().sort((a, b) => String(O.weekDateOf(a)).localeCompare(String(O.weekDateOf(b)))).map(r => {
        const f = r.fields, has = O.hasPrice(f);
        return `<tr class="owv-row" data-owvopen="natl:${esc(r.id)}">
          <td class="owv-no">${esc(O.numLabel(r))}</td><td>${esc(f['Reference'] || '—')}</td><td class="owv-cl">${esc(clientRaw(f) || '—')}</td>
          <td class="owv-dim">${esc(routeOf(r))}</td><td class="owv-dim num">${esc(O.dm(O.weekDateOf(r)))}</td>
          <td class="num">${has ? '<b>' + O.eur(O.price(f)) + '</b>' : '<span class="owv-bad">χωρίς τιμή</span>'}</td>
          <td>${_stateCell(r, stateOf)}</td></tr>`;
      }).join('') || `<tr><td colspan="7" class="owv-empty">${d.natlFailed ? 'Η ανάγνωση των εθνικών απέτυχε — ξαναδοκίμασε.' : 'Καμία εθνική παραγγελία αυτή την εβδομάδα.'}</td></tr>`;
      natlHtml = `<div class="owv-card"><div class="owv-nh">ΕΘΝΙΚΕΣ ΤΗΣ ΕΒΔΟΜΑΔΑΣ <span>${head}</span></div>
        <table class="owv-t owv-tn"><colgroup><col style="width:80px"><col style="width:130px"><col><col><col style="width:70px"><col style="width:120px"><col style="width:150px"></colgroup>
        <tbody>${rows}</tbody></table></div>`;
    }

    // ── bottom summary ──
    const parts = [];
    if (tAll.readyN) parts.push(`${tAll.readyN} προς κοπή (${O.eurSym(tAll.readySum)})`);
    if (tAll.blockedN) parts.push(`${tAll.blockedN} μπλοκαρισμένες: ${_reasonsText(tAll.blocked)}`);
    if (tAll.pendingN) parts.push(`${tAll.pendingN} σε εξέλιξη`);
    const sum = `<div class="owv-sum"><span><b>Εκκρεμούν ${tAll.openN}</b>${parts.length ? ' <span class="owv-dim">εκ των οποίων ' + esc(parts.join(' · ')) + '</span>' : ''}</span>
      <span class="owv-dim">${tAll.oldest != null ? 'παλαιότερη εκκρεμής ' + tAll.oldest + (tAll.oldest === 1 ? ' ημέρα' : ' ημέρες') : ''}</span></div>`;

    ctx.body.innerHTML = `<div class="owv">
      ${banners.map(b => `<div class="owv-banner" role="alert">${esc(b)}</div>`).join('')}
      <div class="owv-strip"><button type="button" class="owv-arr" data-owvshift="-1" aria-label="Προηγούμενη εβδομάδα">‹</button>${strip}<button type="button" class="owv-arr" data-owvshift="1" aria-label="Επόμενη εβδομάδα">›</button></div>
      ${kpi}${intlHtml}${natlHtml}${sum}</div>`;
    ctx.body.onclick = _onClick;
  }

  function _reasonsText(b) {
    return [b.sheets ? `${REASON.sheets} (${b.sheets})` : '', b.price ? `${REASON.price} (${b.price})` : ''].filter(Boolean).join(', ');
  }
  function _vehLabel(rec) { const v = vehicleOf(rec); return v.top + (v.sub ? ' · ' + v.sub : ''); }

  function _stateCell(rec, stateOf) {
    const s = stateOf(rec);
    if (s.key === 'invoiced') return OC().invCell(rec.fields);
    if (s.key === 'blocked') return `<span class="owv-s owv-s-bad"><i></i>${esc(REASON[s.reason] || s.reason)}</span>`;
    if (s.key === 'ready') return '<span class="owv-s"><i class="o"></i>προς κοπή</span>';
    return '<span class="owv-s owv-s-dim"><i class="o"></i>σε εξέλιξη</span>';
  }

  function _legHtml(l, row, stateOf, verdict) {
    const O = OC();
    if (!l.rec) return `<div class="owv-leg owv-leg-off"><div class="owv-l1">#${esc(l.orderId)} <span class="owv-dim">εκτός εύρους φόρτωσης</span></div></div>`;
    const f = l.rec.fields, has = O.hasPrice(f), s = stateOf(l.rec);
    let amt;
    if (!l.inWeek) amt = `<span class="owv-dim">${has ? O.eur(O.price(f)) : '—'}</span>`;
    else if (l.dupOf) amt = `<span class="owv-dim">στο ${esc(l.dupOf)}</span>`;
    else if (!has) amt = '<span class="owv-bad">χωρίς τιμή</span>';
    else if (s.key === 'invoiced') {
      const n = String(f['Invoice Number'] || '').trim();
      // With one number for the whole RT the number sits in ΤΙΜΟΛΟΓΗΣΗ; on a
      // mixed RT it is shown on the leg itself so the two legs can be told apart.
      amt = `<span class="owv-ok">✓ ${verdict.kind !== 'one' && n ? 'ΤΠΥ ' + esc(n) + ' · ' : ''}${O.eur(O.price(f))}</span>`;
    } else amt = O.eur(O.price(f));
    const other = !l.inWeek ? `<div class="owv-l2 owv-dim">εβδ. ${esc(O.weekLabel(l.week))} — μετρά εκεί</div>` : '';
    return `<div class="owv-leg${l.inWeek ? '' : ' owv-leg-off'}" data-owvopen="intl:${esc(l.rec.id)}">
      <div class="owv-l1"><span class="owv-no">${esc(O.numLabel(l.rec))}</span> <b>${esc(clientRaw(f) || '—')}</b></div>
      <div class="owv-l2"><span class="owv-rt">${esc(routeOf(l.rec))}</span><span class="owv-amt">${amt}</span></div>${other}</div>`;
  }

  function _rowHtml(r, stateOf, maxT) {
    const O = OC();
    const t = totals(r.counted, stateOf);
    const v = vehicleOf(r.vehicleRec);
    const verdict = rtInvoicing(r.counted, stateOf);
    let exp, imp, rtCell;
    if (r.kind === 'rt') {
      exp = r.exp.length ? r.exp.map(l => _legHtml(l, r, stateOf, verdict)).join('') : '<span class="owv-dim">—</span>';
      imp = r.imp.length ? r.imp.map(l => _legHtml(l, r, stateOf, verdict)).join('') : '<span class="owv-dim">—</span>';
      rtCell = `<b>${esc(r.code)}</b>${r.guest ? `<div class="owv-dim owv-sm">από ${esc(O.weekLabel(r.homeWeek))}</div>` : ''}`;
    } else {
      const leg = { dir: r.rec.fields['Direction'] === 'Import' ? 'import' : 'export', orderId: '', rec: r.rec, week: O.weekStartOf(r.rec), inWeek: true, counted: true, dupOf: null };
      const cell = _legHtml(leg, r, stateOf, verdict);
      exp = leg.dir === 'export' ? cell : '<span class="owv-dim">—</span>';
      imp = leg.dir === 'import' ? cell : '<span class="owv-dim">—</span>';
      rtCell = '<span class="owv-dim">—</span>';
    }
    const w = maxT > 0 ? Math.round(t.sum / maxT * 100) : 0;
    const turn = t.sum > 0 ? `<b class="owv-tamt">${O.eur(t.sum)}</b><span class="owv-bar"><i style="width:${w}%"></i></span>`
      : `<span class="owv-dim">—</span>`;
    const openRec = r.openRec;
    return `<tr class="owv-row" data-owvopen="intl:${esc(openRec.id)}">
      <td>${rtCell}</td>
      <td><div class="owv-veh">${esc(v.top)}</div><div class="owv-dim owv-sm">${esc(v.sub)}</div></td>
      <td>${exp}</td><td>${imp}</td>
      <td class="num">${turn}</td>
      <td>${_verdictHtml(verdict)}</td></tr>`;
  }

  function _verdictHtml(v) {
    const O = OC();
    switch (v.kind) {
      case 'one': return O.invCell(v.rec.fields);
      case 'all': return '<span class="oc-inv">✓ όλα</span>';
      case 'blocked': return `<span class="owv-s owv-s-bad"><i></i>${esc(v.reasons.map(x => REASON[x] || x).join(', '))}</span>`;
      case 'partial': return `<span class="owv-s"><i class="o"></i>${v.k} / ${v.n}${v.open > 0 ? ' · ' + O.eur(v.open) : ''}</span>`;
      case 'ready': return '<span class="owv-s"><i class="o"></i>προς κοπή</span>';
      case 'progress': return '<span class="owv-s owv-s-dim"><i class="o"></i>σε εξέλιξη</span>';
      default: return '<span class="owv-dim">—</span>';
    }
  }

  function _onClick(e) {
    const shift = e.target.closest('[data-owvshift]');
    if (shift) { S.week = OC().addDays(S.week, 7 * Number(shift.dataset.owvshift)); return _rerender(); }
    const wk = e.target.closest('[data-owvweek]');
    // Re-read, not repaint: the loaded window is centred on the old week, so the
    // new week's «previous week» (for the %) may sit outside it.
    if (wk) { if (wk.dataset.owvweek !== S.week) { S.week = wk.dataset.owvweek; _rerender(); } return; }
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

  function _csv() {
    const m = S.model; if (!m) return;
    const O = OC(), scope = S.ctx ? S.ctx.scope : 'all';
    const stateOf = _stateFn(S.data.set);
    const stLabel = r => { const s = stateOf(r); return s.key === 'invoiced' ? 'τιμολογήθηκε' : s.key === 'blocked' ? 'μπλοκαρισμένη: ' + (REASON[s.reason] || s.reason) : s.key === 'ready' ? 'προς κοπή' : 'σε εξέλιξη'; };
    const line = (rt, r) => {
      const f = r.fields, v = vehicleOf(r);
      return [O.weekLabel(m.week), O.ymd(O.weekDateOf(r)), rt, r._type === 'natl' ? 'Εθνική' : (f['Direction'] === 'Import' ? 'Εισαγωγή' : 'Εξαγωγή'),
        O.numLabel(r), f['Reference'] || '', clientRaw(f), routeOf(r), v.top, v.sub,
        O.hasPrice(f) ? String(O.price(f)).replace('.', ',') : '', stLabel(r), String(f['Invoice Number'] || '')];
    };
    const rows = [['Εβδομάδα', 'Ημέρα Weekly', 'RT', 'Τύπος', 'Αρ.', 'Reference', 'Πελάτης', 'Διαδρομή', 'Όχημα', 'Οδηγός / συνεργάτης', 'Τιμή', 'Τιμολόγηση', 'ΤΠΥ']];
    if (scope !== 'natl') {
      m.rows.forEach(r => r.counted.forEach(rec => rows.push(line(r.code, rec))));
      m.noRt.forEach(r => rows.push(line('', r.rec)));
    }
    if (scope !== 'intl') m.weekNatl.forEach(r => rows.push(line('', r)));
    if (rows.length === 1) { toast('Καμία παραγγελία για εξαγωγή αυτή την εβδομάδα', 'error'); return; }
    OrdersList.csvDownload(rows, `orders_week_${m.week}.csv`);
  }

  // Tokens only (DESIGN.md #1). Syne only for the hero amount.
  function _ensureStyles() {
    if (document.getElementById('owvStyles')) return;
    const st = document.createElement('style'); st.id = 'owvStyles';
    st.textContent = `
.owv{display:flex;flex-direction:column;gap:var(--space-3);font-variant-numeric:tabular-nums}
.owv-banner{padding:8px 12px;border:1px solid var(--border-error);background:var(--danger-bg);color:var(--danger);border-radius:8px;font-size:12.5px}
.owv-strip{display:flex;align-items:stretch;gap:var(--space-2);background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:8px}
.owv-arr{flex:0 0 28px;border:1px solid var(--border-mid);background:var(--bg-card);border-radius:6px;color:var(--text-mid);cursor:pointer;font-size:15px}
.owv-wk{flex:1;min-width:0;text-align:left;border:none;background:transparent;border-radius:6px 6px 0 0;padding:6px 10px 8px;cursor:pointer;display:flex;flex-direction:column;gap:2px;font:inherit;color:var(--text)}
.owv-wk:hover{background:var(--surface-sunken)}
.owv-wk.on{background:var(--surface-sunken);box-shadow:inset 0 -3px 0 var(--surface-dark)}
.owv-wk-r{font-size:12.5px;font-weight:600}
.owv-wk-v{display:flex;flex-wrap:wrap;column-gap:8px;align-items:baseline;font-size:12px;white-space:nowrap}
.owv-wk-v b{font-weight:600}
.owv-st-ok{color:var(--ok)}.owv-st-warn{color:var(--warn)}.owv-st-dim{color:var(--text-dim)}
.owv-kpi{display:flex;align-items:center;gap:var(--space-5);background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px 16px;flex-wrap:wrap}
.owv-k{display:flex;flex-direction:column;gap:2px;padding-right:var(--space-5);border-right:1px solid var(--border)}
.owv-k:last-of-type{border-right:none}
.owv-kl{font-size:11.5px;color:var(--text-mid)}
.owv-hero{font-family:'Syne',sans-serif;font-size:24px;font-weight:700;color:var(--text);line-height:1.15}
.owv-kv{font-size:17px;font-weight:700;color:var(--text)}
.owv-kv2{font-size:15px;color:var(--text)}
.owv-ks{font-size:11.5px;color:var(--text-mid)}
.owv-prog{display:block;width:140px;height:4px;background:var(--surface-sunken);border-radius:2px;overflow:hidden;margin-top:3px}
.owv-prog i{display:block;height:100%;background:var(--ok)}
.owv-chips{margin-left:auto;display:flex;gap:var(--space-2)}
.owv-chip{font:500 12.5px 'DM Sans',sans-serif;padding:6px 12px;border-radius:6px;border:1px solid var(--border-error);background:var(--danger-bg);color:var(--danger);white-space:nowrap}
.owv-chip b{margin-left:4px}
button.owv-chip{cursor:pointer}
/* Below ~1300px the two leg columns would overlap their amounts: the table keeps
   its width and scrolls inside its card, the page never scrolls sideways. */
.owv-card{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;overflow-x:auto}
.owv-t{min-width:1000px}.owv-tn{min-width:860px}
.owv-t{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12.5px;color:var(--text)}
.owv-t th{font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-mid);text-align:left;padding:8px 10px;border-bottom:1px solid var(--border-mid)}
.owv-t td{padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:top}
.owv-t .num{text-align:right}
.owv-g td{background:var(--surface-sunken);font-size:11px;font-weight:700;letter-spacing:.04em;color:var(--text);padding:5px 10px}
.owv-g td span{font-weight:500;letter-spacing:0;color:var(--text-mid);margin-left:6px}
.owv-row{cursor:pointer}
.owv-row:hover td{background:var(--surface-sunken)}
.owv-veh{font-weight:600}
.owv-sm{font-size:11px}
.owv-leg{display:flex;flex-direction:column;gap:1px;min-width:0}
.owv-leg+.owv-leg{margin-top:6px}
.owv-leg-off{opacity:.62}
.owv-l1{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.owv-l1 b{font-weight:600}
.owv-l2{display:flex;justify-content:space-between;gap:8px;font-size:11.5px}
.owv-rt{color:var(--text-mid);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0}
.owv-amt{flex-shrink:0;white-space:nowrap}
.owv-no{color:var(--text-mid);font-weight:500}
.owv-tamt{display:block;font-size:14px;font-weight:700}
.owv-bar{display:block;height:3px;margin:5px 0 0 auto;width:100%;background:var(--surface-sunken);border-radius:2px;overflow:hidden}
.owv-bar i{display:block;height:100%;margin-left:auto;background:var(--text-dim)}
.owv-ok{color:var(--ok);font-weight:600}
.owv-bad{color:var(--danger);font-weight:500}
.owv-dim{color:var(--text-mid)}
.owv-s{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.owv-s i{width:7px;height:7px;border-radius:50%;background:var(--danger);flex-shrink:0}
.owv-s i.o{background:transparent;border:1.5px solid var(--text-mid);width:6px;height:6px}
.owv-s-bad{color:var(--danger)}
.owv-s-dim{color:var(--text-mid)}
.owv-t tfoot td{border-top:2px solid var(--border-mid);border-bottom:none;font-weight:600;padding:10px}
.owv-tot{font-family:inherit;font-size:15px}
.owv-empty{color:var(--text-mid);text-align:center;padding:18px}
.owv-nh{font-size:11px;font-weight:700;letter-spacing:.04em;padding:9px 10px;border-bottom:1px solid var(--border-mid)}
.owv-nh span{font-weight:500;letter-spacing:0;color:var(--text-mid);margin-left:6px}
.owv-tn td{vertical-align:middle}
.owv-cl{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.owv-sum{display:flex;justify-content:space-between;gap:var(--space-3);background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:10px 16px;font-size:12.5px;color:var(--text)}
@media (max-width: 900px){.owv-strip{overflow-x:auto}.owv-wk{min-width:120px}.owv-chips{margin-left:0}}
@media print{.owv-strip{display:none}}`;
    document.head.appendChild(st);
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

  return { render, buildWeek, totals, rtInvoicing, pctVsPrev, stripWeeks, groupRows, weekStatus, pgIdOf, dayLabel };
})();

if (typeof window !== 'undefined') window.OrdersWeekView = OrdersWeekView;
if (typeof module !== 'undefined' && module.exports) module.exports = OrdersWeekView;
