// ═══════════════════════════════════════════════════════════════════════════
// VIEW — «Προς τιμολόγηση» of the one «Παραγγελίες» page (modules/orders_hub.js)
//
// Owner 28/9/2026: invoicing is a VIEW inside Orders, not a page. Figma round 6
// frame 805:1011 (list + the approved invoicing card), card states r3-F.
// Replaces the screen of modules/invoicing.js and keeps its proven rules:
// the ERP number (ΤΠΥ) is typed every time, never pre-filled, never in bulk;
// no invoice without a price (> 0, same rule as Worker invoiceMarkError and
// migration 043); the pallet-slip gate (/pallets/gate) blocks; only the owner
// may override that gate, and the override is recorded BEFORE the write.
//
// Data: OrdersData.loadInvoicingSet() — the SAME records and the SAME states as
// the page counters, so a tab badge can never disagree with this list.
// Week: OrdersCommon.weekStartOf() — the week in which the WEEKLY shows the
// order (export by delivery, import by loading, national by loading).
//
// Pure logic (grouping, week strip, totals, default week, duplicate-ΤΠΥ check,
// CSV rows) is exported for tests/orders-invoicing-view.test.js; everything
// that touches the DOM or the network stays inside the IIFE below it.
// ═══════════════════════════════════════════════════════════════════════════
const OrdersInvoicingView = (() => {
  'use strict';

  // ── Pure logic ──────────────────────────────────────────────────────────
  const DIR_WORD = { 'Export': 'Εξαγωγή', 'Import': 'Εισαγωγή', 'North→South': 'Κάθοδος', 'South→North': 'Άνοδος' };
  const dirWord = f => DIR_WORD[(f || {})['Direction']] || '';
  const linkId = v => (Array.isArray(v) ? v[0] : (typeof v === 'string' ? v : null)) || null;
  const normTpy = s => String(s == null ? '' : s).trim().toLowerCase();
  // Search ignores case AND accents: Greek is typed without τόνος more often
  // than with it («γαλακτοκομικη» must find «Γαλακτοκομική»).
  const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // One row object per record, computed ONCE per data change: state, week and
  // the search haystack would otherwise be recomputed for every tab/keystroke.
  // clientName(id) → raw (un-escaped) company name.
  function annotate(set, clientName) {
    const OC = OrdersCommon;
    return OrdersData.all(set).map(rec => {
      const f = rec.fields || {};
      const st = OrdersData.stateOf(set, rec);
      const clientId = linkId(f['Client']);
      const client = (clientId && clientName(clientId)) || '—';
      const load = OC.placeOf(rec, 'load'), del = OC.placeOf(rec, 'del');
      const num = OC.numLabel(rec);
      const deliv = OC.ymd(f['Delivery DateTime']);
      const done = lotDone(set, rec);
      return {
        rec, id: rec.id, type: rec._type, f,
        state: st.key, reason: st.reason || '', lot: st.lot || null,
        week: OC.weekStartOf(rec) || '',
        price: OC.price(f),
        clientId, client,
        deliv,
        // E-05: a lot's age counts from «Completed On», none while incomplete.
        days: OrdersData.ageOf(set, rec),
        num, ref: String(f['Reference'] || ''),
        load, del,
        erp: erpDelivery(rec, del, deliv),
        lotDone: done,
        // Round 1 O3 (critic-2 E2-03, critic-5 S5-05, critic-4 C4-04): ONE
        // date per lot — its last delivery (or the close, when no piece was
        // ever delivered). The card header, the KPI «Παλαιότερη εκκρεμής»,
        // the sort, the age and the invoice-date check (a gate) read it. Since
        // OWNER-Q9 (4/10) it is NOT printed on the ERP papers: those carry
        // the order's own delivery (erpDelivery). Every other order: its
        // delivery, as before.
        when: done ? done.date : deliv,
        search: [client, num, f['Reference'], load.name, load.sub, del.name, del.sub, f['Invoice Number']]
          .filter(Boolean).map(fold).join(' '),
      };
    });
  }
  // Why a stock lot (057) is not invoiceable yet — from its STOCK LOTS record
  // (absent counts are 0 on the facade). null lot = the lots were not read:
  // said as such, never as «0 στην αποθήκη».
  // A piece returned to stock has no truck: it is waiting, not moving (E-07,
  // impact map 4/10) — «σε κίνηση» counts only the pieces that ride a truck.
  // Round 1 O4 (critic-5 S5-04): only the non-zero terms — «0 σε κίνηση ·
  // 0 χωρίς φορτηγό» was read three times on one card for nothing.
  function stockText(lot) {
    if (!lot) return 'η κατάσταση της παρτίδας δεν διαβάστηκε';
    const g = lot.fields || {}, n = v => Number(v) || 0;
    const loose = n(g['Pieces Without Truck']);
    const moving = Math.max(0, n(g['Pieces']) - n(g['Pieces Delivered']) - loose);
    const parts = [n(g['Remaining Pallets']) ? n(g['Remaining Pallets']) + 'p στην αποθήκη' : '',
      moving ? moving + ' σε κίνηση' : '', loose ? loose + ' χωρίς φορτηγό' : ''].filter(Boolean);
    return 'περιμένει κομμάτια' + (parts.length ? ': ' + parts.join(' · ') : '');
  }
  // «Παράδοση» and «Παλέτες» on the ERP sheet, the print and «Αντιγραφή
  // όλων» — one place, so the three papers cannot disagree.
  // OWNER-Q9 answered 4/10 (ERP = original order only): «η Ειρήνη καταχωρεί
  // και τιμολογεί το αρχικό order», however many trucks carried it on. A LOT
  // is therefore printed EXACTLY like any order: its own destination (the
  // warehouse), its own delivery date, its own pallets. The OWNER-Q6 default
  // («N παραδόσεις» + the last piece's date) and the round-1 O2 pallets
  // («31 + 2 χαμένες») are gone from the papers; the pieces and the close
  // stay on the card (ΕΛΕΓΧΟΙ), and the lot still waits for its pieces
  // before it can be invoiced (gate, owner «α» 3/10 — OrdersData.stateOf).
  function erpDelivery(rec, del, deliv) {
    const f = rec.fields || {};
    const own = rec._type === 'intl' ? f['Total Pallets'] : f['Pallets'];
    return { place: [del.name, del.sub].filter(Boolean).join(' · '), date: deliv || '', pallets: own == null || own === '' ? '' : String(own) };
  }
  // A lot's ONE date (round 1 O3; critic-2 C2-03): «Completed On» — the day
  // the lot became invoiceable, which the age already counts from — else its
  // last piece (still waiting), else its close. The last piece alone split
  // from the age when the remainder was closed days later, and let an invoice
  // dated between the two pass the date check. null for any other order; date
  // '' when the lot record was not read. Read by the card header, the age, the
  // sort and the invoice-date gate — never printed on the ERP papers (OWNER-Q9).
  function lotDone(set, rec) {
    const f = rec.fields || {};
    if (!(rec._type === 'intl' && typeof OrdersStock !== 'undefined' && OrdersStock.isLot(f))) return null;
    const lot = set && set.stock ? set.stock.get(OrdersStock.lotRecOfLot(f)) : null;
    if (!lot) return { date: '' };
    const g = lot.fields || {}, d = g['Completed On'] || g['Last Piece Delivered'] || g['Closed At'];
    return { date: d ? OrdersCommon.ymd(d) : '' };
  }
  // Only what this view is about: delivered orders (and the invoiced ones).
  // Not-yet-delivered and cancelled never belong to «Παραδομένες».
  const inView = it => it.state === 'ready' || it.state === 'blocked' || it.state === 'invoiced';
  const isOpen = it => it.state === 'ready' || it.state === 'blocked';
  function scopeFilter(items, scope) {
    return items.filter(it => inView(it) && (scope === 'all' || !scope || it.type === scope));
  }

  // week start → { ready, blocked, invoiced, total }
  function weekStats(items) {
    const m = new Map();
    for (const it of items) {
      if (!it.week) continue;
      let s = m.get(it.week);
      if (!s) { s = { ready: 0, blocked: 0, invoiced: 0, total: 0 }; m.set(it.week, s); }
      s.total++;
      if (it.state === 'ready') s.ready++; else if (it.state === 'blocked') s.blocked++; else if (it.state === 'invoiced') s.invoiced++;
    }
    return m;
  }
  // The most recent week (start ≤ today) that has something to cut, else the
  // current week — the accountant opens on work, not on an empty week.
  function defaultWeek(items, todayYmd) {
    const cur = OrdersCommon.weekStartOfYmd(todayYmd);
    let best = '';
    for (const it of items) if (it.state === 'ready' && it.week && it.week <= todayYmd && it.week > best) best = it.week;
    return best || cur;
  }
  // n consecutive week starts ending at endWeek (oldest first).
  function stripWeeks(endWeek, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(OrdersCommon.addDays(endWeek, -7 * i));
    return out;
  }
  // The grey word under each week of the strip.
  function weekWord(stat, start, selected, currentWeek) {
    const s = stat || { ready: 0, blocked: 0, invoiced: 0, total: 0 };
    const open = s.ready + s.blocked;
    if (selected && s.ready) return s.ready + ' προς κοπή';
    if (start >= currentWeek) return 'σε εξέλιξη';
    if (open) return open + (open === 1 ? ' ανοιχτή' : ' ανοιχτές');
    if (s.invoiced) return 'κλειστή';
    return '—';
  }
  // sel = a week start, or 'open' = every open order of every week (including
  // the ones with no date at all — they have no week, but they are owed).
  function baseList(items, sel) {
    if (sel === 'open') return items.filter(isOpen);
    return items.filter(it => it.week === sel);
  }
  function tabCounts(list) {
    const c = { ready: 0, blocked: 0, invoiced: 0, all: list.length };
    for (const it of list) if (c[it.state] !== undefined) c[it.state]++;
    return c;
  }
  const tabFilter = (list, tab) => (tab === 'all' ? list : list.filter(it => it.state === tab));
  function searchFilter(list, q) {
    const s = fold(String(q || '').trim());
    return s ? list.filter(it => it.search.includes(s)) : list;
  }
  // Groups by client; groups with open work first, oldest pending first
  // (what is owed longest is cut first), then the fully invoiced ones by name.
  // Rows inside a group: oldest delivery first.
  function groupByClient(list) {
    const m = new Map();
    for (const it of list) {
      const k = it.clientId || '—';
      let g = m.get(k);
      if (!g) { g = { clientId: it.clientId, client: it.client, items: [], sum: 0, unpriced: 0, oldest: -1 }; m.set(k, g); }
      g.items.push(it);
      if (it.price !== null) g.sum += it.price; else g.unpriced++;
      if (isOpen(it) && it.days !== null && it.days > g.oldest) g.oldest = it.days;
      if (isOpen(it) && it.days === null && g.oldest < 0) g.oldest = 0;
    }
    const groups = [...m.values()];
    for (const g of groups) g.items.sort((a, b) => (a.when || '9').localeCompare(b.when || '9') || a.num.localeCompare(b.num));
    groups.sort((a, b) => (b.oldest - a.oldest) || a.client.localeCompare(b.client, 'el'));
    return groups;
  }
  // KPI band of the selected week (or of «all open»). Unpriced orders are
  // never summed as 0: they are blocked, so they are not in «Προς κοπή» at all.
  function kpis(list) {
    const k = { ready: 0, readySum: 0, intl: 0, intlSum: 0, natl: 0, natlSum: 0, invoiced: 0, invSum: 0, blocked: 0, oldestDays: null, oldestDate: '' };
    for (const it of list) {
      if (it.state === 'ready') {
        k.ready++; k.readySum += it.price || 0;
        if (it.type === 'intl') { k.intl++; k.intlSum += it.price || 0; } else { k.natl++; k.natlSum += it.price || 0; }
      } else if (it.state === 'invoiced') { k.invoiced++; if (it.price !== null) k.invSum += it.price; }
      else if (it.state === 'blocked') k.blocked++;
      if (isOpen(it) && it.days !== null && (k.oldestDays === null || it.days > k.oldestDays)) { k.oldestDays = it.days; k.oldestDate = it.when; }
    }
    return k;
  }
  // Is this ΤΠΥ already on another invoiced order of the loaded set? Same
  // client = normal (one ERP invoice often covers several orders); another
  // client = almost certainly a typo, so the write asks first.
  function dupCheck(items, number, self) {
    const n = normTpy(number);
    const out = { same: [], other: [] };
    if (!n) return out;
    for (const it of items) {
      if (it.id === self.id || it.state !== 'invoiced') continue;
      if (normTpy(it.f['Invoice Number']) !== n) continue;
      (it.clientId && it.clientId === self.clientId ? out.same : out.other).push(it);
    }
    return out;
  }
  // After an invoice: the next ready order of the SAME client (the ERP invoice
  // is usually still open on her screen), else the next ready order below.
  function nextReady(groups, doneId, clientId) {
    const flat = groups.flatMap(g => g.items);
    const same = flat.find(it => it.state === 'ready' && it.id !== doneId && it.clientId && it.clientId === clientId);
    if (same) return same;
    const gi = groups.findIndex(g => g.items.some(it => it.id === doneId));
    const after = groups.slice(gi + 1).flatMap(g => g.items).find(it => it.state === 'ready');
    return after || flat.find(it => it.state === 'ready' && it.id !== doneId) || null;
  }
  // Date rules of the ERP invoice: after today = error (an invoice cannot be
  // issued tomorrow); before the delivery = warning only (it happens, rarely).
  // A lot's date is its completion, not a delivery (C2-03): the words say so.
  function dateCheck(dateYmd, todayYmd, delivYmd, isLot) {
    if (!dateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return { error: 'συμπλήρωσε ημερομηνία' };
    if (dateYmd > todayYmd) return { error: 'μετά τη σημερινή (' + OrdersCommon.dm(todayYmd) + ')' };
    if (delivYmd && dateYmd < delivYmd) return { warn: (isLot ? 'πριν την ολοκλήρωση της παρτίδας (' : 'πριν την παράδοση (') + OrdersCommon.dm(delivYmd) + ') — σίγουρα;' };
    return {};
  }
  // The three fields — nothing else (no Status: «Invoiced» is a checkbox, not a
  // lifecycle status, owner 23/8 locked; migration 014 CHECK would refuse it).
  const invoiceFields = (n, d) => ({ 'Invoiced': true, 'Invoice Number': n, 'Invoice Date': d });
  // Invoiced off and the ERP number/date cleared — migration 043 only guards
  // the transition TO true, the Worker lets this through.
  const undoFields = () => ({ 'Invoiced': false, 'Invoice Number': null, 'Invoice Date': null });

  // ERP address in one line: «Via Emilia 12, 41121 Modena, IT».
  function addressLine(c) {
    if (!c) return '';
    return [c['Adress'], c['City'], c['Country']].map(v => String(v == null ? '' : v).trim()).filter(Boolean).join(', ');
  }
  // The «Φύλλο ERP»: what she types into the ERP, in the order of the list.
  // Amount with a dot decimal and no thousands separator — a number for the
  // spreadsheet, not a formatted string; blank (not 0) when never entered.
  // C2-04: the last column «Κατάσταση», the words of the print (stateWord) —
  // since OWNER-Q9 a lot waiting for its pieces looks like any order on this
  // sheet, so the state is the one thing that says «not yet». Last, so no
  // column moves for whoever reads the file by position.
  function csvRows(groups, clientInfo) {
    const rows = [['ΑΡ.', 'Αναφορά', 'Πελάτης', 'ΑΦΜ', 'Διεύθυνση', 'Φόρτωση', 'Παράδοση', 'Ημ. παράδοσης', 'Παλέτες', 'Ποσό', 'ΤΠΥ', 'Ημ. ΤΠΥ', 'Κατάσταση']];
    for (const g of groups) for (const it of g.items) {
      const c = (it.clientId && clientInfo(it.clientId)) || null;
      rows.push([
        it.num, it.ref, it.client,
        c && c['VAT Number'] ? String(c['VAT Number']) : '',
        addressLine(c),
        [it.load.name, it.load.sub].filter(Boolean).join(' · '),
        it.erp.place,
        it.erp.date,
        it.erp.pallets,
        it.price === null ? '' : it.price.toFixed(2),
        OrdersCommon.isInvoiced(it.f) ? String(it.f['Invoice Number'] || '') : '',
        OrdersCommon.isInvoiced(it.f) ? OrdersCommon.ymd(it.f['Invoice Date']) : '',
        stateWord(it),
      ]);
    }
    return rows;
  }
  // The metrics audit (modules/metrics_audit.js, «invoicing_tabs») compares
  // these keys across the page; same semantics as invoicing.js: overdue is an
  // AGE (> 30 days, not invoiced) cutting across ready and blocked.
  function metricsOf(items) {
    const m = { total: items.length, ready: 0, overdue: 0, blocked: 0, invoiced: 0 };
    for (const it of items) {
      if (it.state === 'ready') m.ready++;
      else if (it.state === 'blocked') m.blocked++;
      else if (it.state === 'invoiced') m.invoiced++;
      if (isOpen(it) && it.days !== null && it.days > 30) m.overdue++;
    }
    return m;
  }

  // One state word per row — the ERP print and the ERP CSV (C2-04) say the same.
  function stateWord(it) {
    return it.state === 'invoiced' ? 'ΤΠΥ ' + (it.f['Invoice Number'] || '—')
      : it.state === 'blocked' ? (it.reason === 'price' ? 'χωρίς τιμή' : it.reason === 'stock' ? 'περιμένει κομμάτια' : 'λείπει δελτίο')
      : 'προς κοπή';
  }
  // Why a lot is not allocated: one reason per status the base can return
  // (stock_v_lot_money.allocation_status); an unknown one is shown as it is,
  // never dressed up as another reason. 'no_charge' (round 2 #1, owner 4/10)
  // replaced 'no_intake_cost': no partner rate AND no «Χρέωση αποθήκης».
  // 'no_partner_rate' (round 3, SQL S1): an assignment WITHOUT a rate.
  function allocWhy(st) {
    return { no_price: 'χωρίς τιμή', no_charge: 'χωρίς χρέωση αποθήκης', no_partner_rate: 'λείπει το κόμιστρο συνεργάτη', no_pallets: 'χωρίς παλέτες' }[st] || String(st || '—');
  }

  const pure = { annotate, scopeFilter, weekStats, defaultWeek, stripWeeks, weekWord, baseList, tabCounts, tabFilter,
    searchFilter, groupByClient, kpis, dupCheck, nextReady, dateCheck, invoiceFields, undoFields, addressLine, csvRows,
    metricsOf, dirWord, stockText, erpDelivery, lotDone, allocWhy, stateWord };
  if (typeof document === 'undefined') return { pure };

  // ── State ───────────────────────────────────────────────────────────────
  const S = {
    ctx: null, set: null, all: [], items: [],
    sel: '', stripEnd: '', tab: 'ready', q: '',
    selId: null, closed: false,
    busy: false, formErr: '', edit: null, override: null,
    draft: null,            // {id, num, d} kept across a refused write so she does not retype
    clientInfo: new Map(), clientsFailed: false,
    undo: null,
    reopenErr: null,        // {id, msg} — «Άνοιγμα ξανά» refused, said under the close line
    pieces: new Map(),      // lot rec → {status:'loading'|'ok'|'failed', pieces}
    alloc: new Map(),       // lot rec → {status, lot, pieces} (owner only)
  };
  const esc = s => escapeHtml(String(s == null ? '' : s));
  const OC = () => OrdersCommon;
  const canWrite = () => typeof can === 'function' && can('costs') === 'full';
  const isOwner = () => typeof ROLE !== 'undefined' && ROLE === 'owner';
  const today = () => OrdersCommon.today();
  const tableOf = it => (it.type === 'intl' ? TABLES.ORDERS : TABLES.NAT_ORDERS);
  const itemById = id => S.all.find(it => it.id === id) || null;
  const info = id => S.clientInfo.get(id) || null;

  // ── Client ERP data ────────────────────────────────────────────────────
  // The shared reference cache loads ONLY 'Company Name' for clients
  // (core/api.js _REF_FIELDS.clients — widening it breaks the HAR replay of
  // every critic, see the comment there). Reading ΑΦΜ/address from it would
  // print «δεν έχει καταχωρηθεί» for data that IS in the base (facade trap
  // #2: a field not asked for is absent, and absent reads as empty). So this
  // view asks for the ERP fields itself, for the clients of the loaded set.
  const CLIENT_FIELDS = ['Company Name', 'VAT Number', 'Adress', 'City', 'Country', 'Payment Terms Days', 'Email'];
  async function loadClientInfo(set) {
    // Same 60 s horizon as the order set: a ΑΦΜ corrected in «Πελάτες» must
    // show here on the next visit, not after a page reload.
    if (Date.now() - (S.clientAt || 0) > 60000) { S.clientInfo.clear(); S.clientAt = Date.now(); }
    const ids = [...new Set(OrdersData.all(set).map(r => linkId(r.fields['Client'])).filter(Boolean))]
      .filter(id => !S.clientInfo.has(id));
    if (!ids.length) return;
    try {
      const batches = OrdersList.chunk(ids, 40).map(b => atGetAll(TABLES.CLIENTS, {
        filterByFormula: `OR(${b.map(id => `RECORD_ID()="${id}"`).join(',')})`, fields: CLIENT_FIELDS,
      }, false));
      (await Promise.all(batches)).flat().forEach(r => S.clientInfo.set(r.id, r.fields || {}));
      S.clientsFailed = false;
    } catch (e) {
      // Heard, not silent: the card says «δεν φόρτωσαν», never «δεν έχει καταχωρηθεί».
      console.error('orders invoicing: client ERP data', e);
      S.clientsFailed = true;
    }
  }
  function clientName(id) {
    const c = S.clientInfo.get(id);
    if (c && c['Company Name']) return String(c['Company Name']);
    const r = (typeof getRefClients === 'function' ? getRefClients() : []).find(x => x.id === id);
    if (r && r.fields['Company Name']) return String(r.fields['Company Name']);
    if (typeof _fhClientsMap !== 'undefined' && _fhClientsMap[id]) return String(_fhClientsMap[id]);
    return '';
  }

  // ── Render entry (hub contract) ─────────────────────────────────────────
  async function render(ctx) {
    S.ctx = ctx;
    ensureStyles();
    ctx.setSub('Παραδομένες ανά πελάτη · εβδομάδα όπως στο Weekly (εξαγωγή κατά παράδοση, εισαγωγή κατά φόρτωση)');
    ctx.setActions(
      '<button type="button" class="btn btn-secondary btn-sm" onclick="OrdersInvoicingView.exportCsv()">Φύλλο ERP (CSV)</button>'
      + '<button type="button" class="btn btn-secondary btn-sm" onclick="OrdersInvoicingView.print()">Εκτύπωση</button>');
    const set = await OrdersData.loadInvoicingSet();
    if (!ctx.isCurrent()) return;
    S.pieces.clear(); S.alloc.clear();
    await loadClientInfo(set);
    if (!ctx.isCurrent()) return;
    S.set = set;
    rebuild();
    if (typeof reportPageMetrics === 'function') reportPageMetrics('invoicing', metricsOf(S.all.filter(inView)));
    const cur = OC().weekStartOfYmd(today());
    if (!S.sel) S.sel = defaultWeek(S.items, today());
    // The strip ends at the current week (the Figma layout: selected week
    // fourth, «σε εξέλιξη» last) unless that would push the selection out.
    if (!S.stripEnd) S.stripEnd = cur;
    if (S.sel !== 'open' && (S.sel > S.stripEnd || S.sel < OC().addDays(S.stripEnd, -28))) {
      const after = OC().addDays(S.sel, 7);
      S.stripEnd = after > cur ? (S.sel > cur ? S.sel : cur) : after;
    }
    paint();
  }
  function rebuild() {
    S.all = annotate(S.set, clientName);
    S.items = scopeFilter(S.all, S.ctx ? S.ctx.scope : 'all');
  }

  // ── Derived view of the current state ───────────────────────────────────
  function view() {
    const base = baseList(S.items, S.sel);
    const counts = tabCounts(base);
    const list = searchFilter(tabFilter(base, S.tab), S.q);
    const groups = groupByClient(list);
    return { base, counts, list, groups, k: kpis(base) };
  }

  // ── Paint ───────────────────────────────────────────────────────────────
  function paint() {
    const ctx = S.ctx;
    if (!ctx || !ctx.isCurrent()) return;
    const banners = [];
    if (S.set.natlFailed) banners.push('Οι εθνικές παραγγελίες δεν φόρτωσαν — η λίστα είναι ελλιπής. Δεν σημαίνει ότι δεν υπάρχουν εθνικές προς τιμολόγηση· ξαναδοκίμασε.');
    if (S.set.gateFailed) banners.push('Ο έλεγχος δελτίων παλετών δεν φόρτωσε — ισχύει ο παλιός έλεγχος ανά παραγγελία (δελτία 1 και 2).');
    if (S.clientsFailed) banners.push('Τα στοιχεία ERP των πελατών (ΑΦΜ, διεύθυνση, όροι) δεν φόρτωσαν — δεν σημαίνει ότι λείπουν.');
    if (S.set.stockFailed) banners.push('Η κατάσταση των παρτίδων αποθήκης δεν φόρτωσε — κάθε παρτίδα εμφανίζεται μπλοκαρισμένη. Δεν σημαίνει ότι περιμένει κομμάτια· ξαναδοκίμασε.');
    ctx.body.innerHTML = `
      <div class="oiv">
        ${banners.map(b => `<div class="oiv-banner" role="alert">${esc(b)}</div>`).join('')}
        <div class="oiv-strip" id="oivStrip"></div>
        <div class="oiv-main">
          <div class="oiv-left">
            <div class="oiv-kpis" id="oivKpis"></div>
            <div class="oiv-bar">
              <div class="oiv-seg" id="oivTabs" role="tablist"></div>
              <label class="oiv-search"><input id="oivQ" type="search" autocomplete="off" placeholder="Πελάτης, αριθμός, τόπος, ΤΠΥ" value="${esc(S.q)}" oninput="OrdersInvoicingView.search(this.value)"></label>
            </div>
            <div class="oiv-tablewrap">
              <table class="oiv-t">
                <colgroup><col style="width:64px"><col style="width:124px"><col><col><col style="width:48px"><col style="width:96px"><col style="width:148px"></colgroup>
                <thead><tr><th>ΑΡ.</th><th>ΑΝΑΦΟΡΑ</th><th>ΦΟΡΤΩΣΗ</th><th>ΠΑΡΑΔΟΣΗ</th><th class="r">ΠΑΛ.</th><th class="r">ΤΙΜΗ €</th><th>ΚΑΤΑΣΤΑΣΗ</th></tr></thead>
                <tbody id="oivBody"></tbody>
              </table>
            </div>
            <div class="oiv-foot" id="oivFoot"></div>
          </div>
          <aside class="oiv-card" id="oivCard" aria-live="polite"></aside>
        </div>
      </div>`;
    paintParts();
  }
  // Everything below the search box — the box itself keeps focus while typing.
  // focus:false when the search box is being typed in — auto-selecting the
  // first row must not steal the caret into the ΤΠΥ box.
  function paintParts(opts) {
    const v = view();
    if (S.selId && !v.list.some(it => it.id === S.selId)) S.selId = null;
    if (!S.selId && !S.closed) {
      const first = v.groups.flatMap(g => g.items);
      S.selId = (first.find(it => it.state === 'ready') || first[0] || {}).id || null;
    }
    paintStrip();
    paintKpis(v);
    paintTabs(v);
    paintTable(v);
    paintCard(!(opts && opts.focus === false));
  }

  function paintStrip() {
    const el = document.getElementById('oivStrip'); if (!el) return;
    const stats = weekStats(S.items);
    const cur = OC().weekStartOfYmd(today());
    let openAll = 0; for (const it of S.items) if (isOpen(it)) openAll++;
    const weeks = stripWeeks(S.stripEnd, 5).map(w => {
      const on = S.sel === w;
      return `<button type="button" class="oiv-wk${on ? ' on' : ''}" aria-pressed="${on}" onclick="OrdersInvoicingView.pickWeek('${w}')">
        <span class="oiv-wk-l">${esc(OC().weekLabel(w))}</span><span class="oiv-wk-s">${esc(weekWord(stats.get(w), w, on, cur))}</span></button>`;
    }).join('');
    const atEnd = S.stripEnd >= cur;
    el.innerHTML = `<button type="button" class="oiv-arr" aria-label="Προηγούμενες εβδομάδες" onclick="OrdersInvoicingView.shift(-1)">‹</button>
      <div class="oiv-wks">${weeks}</div>
      <button type="button" class="oiv-allopen${S.sel === 'open' ? ' on' : ''}" aria-pressed="${S.sel === 'open'}" onclick="OrdersInvoicingView.pickWeek('open')">Όλες οι ανοιχτές · <b>${openAll}</b></button>
      <button type="button" class="oiv-arr" aria-label="Επόμενες εβδομάδες" ${atEnd ? 'disabled' : ''} onclick="OrdersInvoicingView.shift(1)">›</button>`;
  }

  function paintKpis(v) {
    const el = document.getElementById('oivKpis'); if (!el) return;
    const k = v.k, eur = OC().eurSym, scope = S.ctx.scope;
    const cell = (label, val, sub, cls) => `<div class="oiv-kpi${cls ? ' ' + cls : ''}"><div class="oiv-kpi-l">${label}</div><div class="oiv-kpi-v"><span class="n">${val}</span>${sub ? `<span class="s">${sub}</span>` : ''}</div></div>`;
    const cells = [cell('Προς κοπή', eur(k.readySum), k.ready + (k.ready === 1 ? ' παραγγελία' : ' παραγγελίες'), 'hero')];
    if (scope !== 'natl') cells.push(cell('Διεθνείς', eur(k.intlSum), String(k.intl)));
    if (scope !== 'intl') cells.push(cell('Εθνικές', eur(k.natlSum), String(k.natl)));
    cells.push(cell('Τιμολογημένες', eur(k.invSum), String(k.invoiced)));
    cells.push(cell('Παλαιότερη εκκρεμής', k.oldestDays === null ? '—' : k.oldestDays + (k.oldestDays === 1 ? ' ημέρα' : ' ημέρες'), k.oldestDate ? OC().dm(k.oldestDate) : ''));
    el.innerHTML = cells.join('');
  }

  function paintTabs(v) {
    const el = document.getElementById('oivTabs'); if (!el) return;
    const T = [['ready', 'Προς κοπή'], ['blocked', 'Μπλοκαρισμένες'], ['invoiced', 'Τιμολογημένες'], ['all', 'Όλες']];
    el.innerHTML = T.map(([key, label]) => `<button type="button" role="tab" class="oiv-seg-b${S.tab === key ? ' on' : ''}" data-tab="${key}" aria-selected="${S.tab === key}" onclick="OrdersInvoicingView.setTab('${key}')">${label} · <span class="c">${v.counts[key]}</span></button>`).join('');
  }

  function statusCell(it) {
    if (it.state === 'invoiced') return OC().invCell(it.f);
    if (it.state === 'blocked') {
      // O4 (critic-2 E2-10): a lot waiting for its pieces is normal work in
      // progress nobody can act on here — neutral, not the red of «τιμή →
      // owner» / «δελτίο → Αλεξία». A false red teaches to ignore red.
      if (it.reason === 'stock') return `<span class="oiv-st wait" title="${esc(stockText(it.lot))}"><i class="oiv-dot wait"></i>περιμένει κομμάτια</span>`;
      return it.reason === 'price'
        ? '<span class="oiv-st bad"><i class="oiv-dot fill"></i>τιμή → owner</span>'
        : '<span class="oiv-st bad"><i class="oiv-dot fill"></i>δελτίο → Αλεξία</span>';
    }
    const d = it.days === null ? '' : ' · ' + it.days + ' ημ.';
    return `<span class="oiv-st"><i class="oiv-dot"></i>προς κοπή${d}</span>`;
  }

  function paintTable(v) {
    const body = document.getElementById('oivBody'); if (!body) return;
    const eur = OC().eur;
    if (!v.list.length) {
      const msg = S.q ? 'Καμία παραγγελία για «' + S.q + '»'
        : S.sel === 'open' ? 'Καμία ανοιχτή παραγγελία — όλες οι παραδομένες έχουν τιμολογηθεί'
        : ({ ready: 'Τίποτα προς κοπή σε αυτή την εβδομάδα', blocked: 'Καμία μπλοκαρισμένη σε αυτή την εβδομάδα', invoiced: 'Καμία τιμολογημένη σε αυτή την εβδομάδα' })[S.tab] || 'Καμία παραδομένη παραγγελία σε αυτή την εβδομάδα';
      body.innerHTML = `<tr class="oiv-empty"><td colspan="7">${esc(msg)}</td></tr>`;
    } else {
      body.innerHTML = v.groups.map(g => {
        const c = g.clientId ? info(g.clientId) : null;
        const meta = [];
        if (c && c['VAT Number']) meta.push('ΑΦΜ ' + esc(c['VAT Number']));
        if (c && c['Payment Terms Days'] != null && c['Payment Terms Days'] !== '') meta.push('όροι ' + esc(c['Payment Terms Days']) + ' ημ.');
        // An unpriced order is never a 0,00 € in the sum — it is said apart.
        const priced = g.items.length - g.unpriced;
        const sum = (priced ? eur(g.sum) + ' €' : '') + (g.unpriced ? ` <span class="oiv-bad">${priced ? '+ ' : ''}${g.unpriced} χωρίς τιμή</span>` : '');
        const head = `<tr class="oiv-g"><td colspan="5"><b>${esc(g.client)}</b>${meta.length ? `<span class="oiv-gm">${meta.join(' · ')}</span>` : ''}</td><td colspan="2" class="r"><b>${g.items.length} · ${sum}</b></td></tr>`;
        return head + g.items.map(it => {
          const pal = it.type === 'intl' ? it.f['Total Pallets'] : it.f['Pallets'];
          const on = it.id === S.selId;
          return `<tr class="oiv-r${on ? ' on' : ''}" data-id="${esc(it.id)}" onclick="OrdersInvoicingView.select('${esc(it.id)}')">
            <td class="num">${esc(it.num)}</td>
            <td><span class="oc-pname">${esc(it.ref || '—')}</span><span class="oiv-sub">${isLotIt(it) ? '<span class="oiv-tag">→ ΑΠΟΘΗΚΗ</span>' : ''}${esc(dirWord(it.f))}</span></td>
            <td>${OC().placeCell(it.load)}</td>
            <td>${OC().placeCell(it.del)}</td>
            <td class="r num">${pal == null || pal === '' ? '<span class="oiv-muted">—</span>' : esc(pal)}</td>
            <td class="r num">${it.price === null ? '<span class="oiv-muted">—</span>' : eur(it.price)}</td>
            <td>${statusCell(it)}</td></tr>`;
        }).join('');
      }).join('');
    }
    const foot = document.getElementById('oivFoot'); if (!foot) return;
    let ready = 0, sum = 0;
    for (const it of v.list) { if (it.state === 'ready') ready++; if (it.price !== null) sum += it.price; }
    const hint = canWrite() && ready ? ' · Enter καταχωρεί και ανοίγει την επόμενη' : '';
    const lead = S.tab === 'ready' ? ready + ' προς κοπή' : v.list.length + (v.list.length === 1 ? ' παραγγελία' : ' παραγγελίες');
    foot.innerHTML = `<span>${lead} · ${v.groups.length} ${v.groups.length === 1 ? 'πελάτης' : 'πελάτες'}${hint}</span><span class="oiv-total">Σύνολο <b>${OC().eurSym(sum)}</b></span>`;
  }

  // ── Stock lots (057) in the card ────────────────────────────────────────
  // A lot is ONE invoice for every piece: the card lists the pieces (what she
  // copies into the ERP) and, for the owner only, the revenue split per RT.
  // Both are read on demand for the selected lot and repaint only their own
  // section; a failed read says so in red — never an empty list.
  const isLotIt = it => it.type === 'intl' && typeof OrdersStock !== 'undefined' && OrdersStock.isLot(it.f);
  const lotRecOf = it => OrdersStock.lotRecOfLot(it.f);

  const lotOf = it => (S.set && S.set.stock ? S.set.stock.get(lotRecOf(it)) : null) || null;
  // The lot's line(s) in ΕΛΕΓΧΟΙ — the ONE place its block reason is said
  // (O4, critic-5 S5-04: the header and the action block only point here).
  // Waiting is neutral («–»), a failed read stays red. A closed lot shows the
  // close where she works (O2, critic-2 E2-02): pallets, reason, date — and,
  // for owner/dispatcher while not invoiced, «Άνοιγμα ξανά» (O1).
  function lotCheck(it) {
    if (!isLotIt(it)) return '';
    const lot = lotOf(it);
    if (it.state === 'invoiced') return lot && lot.fields['Closed At'] ? `<div class="oiv-ck na"><i>–</i><span>${esc(OrdersStock.closedLine(lot))}</span></div>` : '';
    if (S.set.stockFailed || !lot) return `<div class="oiv-ck bad"><i>✗</i><span>Παρτίδα · ${esc(stockText(null))}</span></div>`;
    const g = lot.fields, n = v => Number(v) || 0;
    if (g['Complete'] !== true) return `<div class="oiv-ck na"><i>–</i><span>Παρτίδα · ${esc(stockText(lot))}</span></div>`;
    if (!g['Closed At']) return '<div class="oiv-ck ok"><i>✓</i><span>Παρτίδα · όλα τα κομμάτια παραδόθηκαν</span></div>';
    const reopen = OrdersStock.reopenable(lot)
      ? ` <button type="button" class="oiv-link" data-oiv="reopen" onclick="OrdersInvoicingView.reopenLot('${esc(it.id)}')">Άνοιγμα ξανά</button>` : '';
    // The reopen's own failure stays under its line: a dispatcher has no
    // invoice form on this card, so S.formErr would never be painted.
    const rerr = S.reopenErr && S.reopenErr.id === it.id ? `<div class="oiv-err" role="alert">${esc(S.reopenErr.msg)}</div>` : '';
    return `<div class="oiv-ck ok"><i>✓</i><span>Παρτίδα · ${n(g['Delivered Pallets'])}/${n(g['Stock Pallets'])}p παραδόθηκαν</span></div>`
      + `<div class="oiv-ck na oiv-closed"><i>–</i><span>${esc(OrdersStock.closedLine(lot))}${reopen}</span></div>` + rerr;
  }

  function piecesSection(it) {
    const st = S.pieces.get(lotRecOf(it));
    let body, n = '';
    if (!st || st.status === 'loading') body = '<div class="oiv-muted">Φόρτωση κομματιών…</div>';
    else if (st.status === 'failed') body = '<div class="oiv-bad" role="alert">Τα κομμάτια δεν φορτώθηκαν — δεν σημαίνει ότι δεν υπάρχουν. Ξαναδοκίμασε.</div>';
    else if (!st.pieces.length) body = '<div class="oiv-muted">Κανένα κομμάτι ακόμη</div>';
    else {
      n = ' · ' + st.pieces.length;
      const dm = OC().dm;
      body = st.pieces.map(p => {
        const pf = p.fields || {};
        const del = OC().placeOf(p, 'del');
        const where = [del.name, del.sub].filter(Boolean).join(' · ') || '—';
        const pal = pf['Total Pallets'];
        const clip = typeof OrderDocs !== 'undefined' && OrderDocs.badge ? OrderDocs.badge(p.id) : '';
        return `<div class="oiv-pc"><div class="oiv-pc1"><b>${esc(OC().numLabel(p))}</b><span>${esc(pf['Reference'] || '—')}</span>${clip}<span class="oiv-pc-r">${pal == null || pal === '' ? '—' : esc(pal)}p · ${esc(OrdersStock.statusWord(pf['Status']))}</span></div>
          <div class="oiv-pc2"><span title="${esc(where)}">${esc(where)}</span><span>${pf['Delivery DateTime'] ? esc(dm(pf['Delivery DateTime'])) : '—'}</span></div></div>`;
      }).join('');
    }
    return `<section id="oivPieces"><div class="oiv-sh"><span>Κομμάτια${n}</span></div>${body}</section>`;
  }
  async function ensurePieces(it) {
    const rec = lotRecOf(it);
    if (S.pieces.has(rec)) return;
    S.pieces.set(rec, { status: 'loading' });
    const [res] = await Promise.all([
      OrdersStock.loadPieces(rec),
      typeof OrderDocs !== 'undefined' && OrderDocs.preloadIndex ? OrderDocs.preloadIndex().catch(() => null) : null,
    ]);
    const pieces = res.ok ? res.pieces.slice().sort((a, b) => String(a.fields['Delivery DateTime'] || '9').localeCompare(String(b.fields['Delivery DateTime'] || '9'))) : null;
    S.pieces.set(rec, res.ok ? { status: 'ok', pieces } : { status: 'failed' });
    const sec = document.getElementById('oivPieces');
    if (sec && S.selId === it.id) sec.outerHTML = piecesSection(it);
  }

  // Owner only (P&L, Ε1): built for no other role — and the Worker 403s them.
  function allocSection(it) {
    if (!isOwner()) return '';
    const st = S.alloc.get(lotRecOf(it));
    const eurSym = OC().eurSym;
    let body;
    if (!st || st.status === 'loading') body = '<div class="oiv-muted">Φόρτωση…</div>';
    else if (st.status === 'failed') body = '<div class="oiv-bad" role="alert">Ο επιμερισμός δεν διαβάστηκε</div>';
    else {
      const m = st.lot, num = v => (v == null || v === '' ? null : Number(v));
      if (m.allocation_status !== 'ok') {
        body = `<div class="oiv-warn">Ο επιμερισμός εκκρεμεί: ${esc(allocWhy(m.allocation_status))}</div>`;
      } else {
        const pp = num(m.per_pallet);
        const per = pp === null ? '—' : new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(pp) + ' €';
        const rows = st.pieces.map(p => kv(esc((p.piece_kind === 'natl' ? 'Ε-' : '#') + p.piece_id) + ' · ' + esc(num(p.pallets)) + 'p', eurSym(num(p.amount)))).join('');
        const rem = num(m.remaining_pallets) || 0, off = num(m.written_off_pallets) || 0;
        // Round 2 #1 (owner 4/10): charge = partner rate + «Χρέωση αποθήκης»
        // (each euro entered once); net = price − charge. «—» = none entered.
        // One name per amount (R2, S5-01) on every owner screen; the total
        // only when it adds two parts (S5-06) — else it repeats its one part.
        const both = num(m.partner_cost) !== null && num(m.warehouse_charge) !== null;
        body = kv('Τιμή πελάτη', eurSym(num(m.price))) + kv('Κόμιστρο συνεργάτη', eurSym(num(m.partner_cost)))
          + kv('Χρέωση αποθήκης', eurSym(num(m.warehouse_charge))) + (both ? kv('Σύνολο χρεώσεων', eurSym(num(m.charge_total))) : '')
          + kv('Καθαρό', `<b>${eurSym(num(m.net))}</b>`) + kv('€ / παλέτα', per) + rows
          + (!m.closed_at && rem > 0 ? kv('Σε απόθεμα ' + esc(rem) + 'p', eurSym(num(m.in_stock_amount))) : '')
          + (m.closed_at ? kv('<span class="oiv-bad">Χαμένο υπόλοιπο ' + esc(off) + 'p</span>', `<span class="oiv-bad">${eurSym(num(m.written_off_amount))}</span>`) : '');
      }
    }
    return `<section id="oivAlloc"><div class="oiv-sh"><span>Επιμερισμός (μόνο owner)</span></div>${body}</section>`;
  }
  async function ensureAlloc(it) {
    const rec = lotRecOf(it);
    if (S.alloc.has(rec) || !/^rec[A-Za-z0-9]{1,32}$/.test(rec || '')) return;
    S.alloc.set(rec, { status: 'loading' });
    let st;
    try {
      const r = await plFetch('/costs/stock-lots?lot=' + encodeURIComponent(rec));
      const lot = (r.lots || []).find(x => x.lot_rec === rec);
      st = lot ? { status: 'ok', lot, pieces: (r.pieces || []).filter(x => x.lot_rec === rec).sort((a, b) => (a.seq || 0) - (b.seq || 0)) } : { status: 'failed' };
    } catch (e) {
      console.error('orders invoicing: /costs/stock-lots', e);
      st = { status: 'failed' };
    }
    S.alloc.set(rec, st);
    const sec = document.getElementById('oivAlloc');
    if (sec && S.selId === it.id) sec.outerHTML = allocSection(it);
  }

  // After a close: the lot's completeness changed in the base — re-read the
  // set (states, counters) instead of patching it locally.
  function closeRemainder(id) {
    const it = itemById(id);
    if (!it || !it.lot || !OrdersStock.canClose()) return;
    OrdersStock.openCloseModal(it.lot, async () => {
      OrdersData.invalidate();
      if (typeof OrdersHub !== 'undefined') OrdersHub.refreshBadges();
      if (S.ctx && S.ctx.isCurrent()) await render(S.ctx);
    });
  }

  // O1 (critic-2 E2-01): «Άνοιγμα ξανά» of a closed, not invoiced lot. The
  // base accepts it until the invoice (reopen_invoiced); the read-back
  // decides. Then the set is re-read: the lot is blocked again.
  async function reopenLot(id) {
    const it = itemById(id), lot = it && lotOf(it);
    if (!it || !lot || S.busy || it.state === 'invoiced' || !OrdersStock.reopenable(lot)) return;
    const label = OrdersStock.lotLabel(lot), off = Number(lot.fields['Written Off Pallets']) || 0;
    if (!(await confirmAction(`Άνοιγμα ξανά της παρτίδας ${label};\nΟι ${off} παλέτες γυρίζουν στο υπόλοιπο· η παρτίδα περιμένει ξανά κομμάτια και δεν τιμολογείται μέχρι να ολοκληρωθεί.`,
      { title: 'Άνοιγμα ξανά', confirmLabel: 'Άνοιγμα ξανά' }))) return;
    S.busy = true; S.reopenErr = null;
    const res = await OrdersStock.reopenLot(lot.id);
    S.busy = false;
    if (!res.ok) {
      // D2: a refusal of the base is already on screen (core/api.js).
      S.reopenErr = { id: it.id, msg: res.shown ? 'Δεν άνοιξε — η παρτίδα μένει κλειστή.' : 'Δεν άνοιξε: ' + res.error };
      if (S.ctx && S.ctx.isCurrent()) paintCard();
      return;
    }
    toast('Η παρτίδα ' + escapeHtml(label) + ' άνοιξε ξανά — περιμένει κομμάτια');
    OrdersData.invalidate();
    if (typeof OrdersHub !== 'undefined') OrdersHub.refreshBadges();
    if (S.ctx && S.ctx.isCurrent()) await render(S.ctx);
  }

  // ── The card ────────────────────────────────────────────────────────────
  const MISSING = '<span class="oiv-muted">— δεν έχει καταχωρηθεί</span>';
  const kv = (label, val) => `<div class="oiv-kv"><span>${label}</span><span>${val}</span></div>`;

  function paintCard(focus) {
    const el = document.getElementById('oivCard'); if (!el) return;
    const it = S.selId ? itemById(S.selId) : null;
    const main = el.parentElement;
    if (!it) { el.innerHTML = ''; el.hidden = true; if (main) main.classList.remove('with-card'); return; }
    el.hidden = false; if (main) main.classList.add('with-card');
    const f = it.f, dm = OC().dm, eurSym = OC().eurSym;
    const delivered = it.state !== 'pending' && !!it.deliv;
    const ready = it.state === 'ready';
    let status;
    // A lot is never «Παραδόθηκε» on its intake date (plan §8, critic-4
    // C4-04). C2-02: a lot still waiting for pieces says so — whatever ELSE
    // blocks it (an unpriced lot used to read «Τελευταίο κομμάτι —»); a
    // complete one carries its one date (C2-03) under «Ολοκληρώθηκε».
    const lotRec = isLotIt(it) ? lotOf(it) : null, lg = (lotRec && lotRec.fields) || {};
    const lotWaiting = isLotIt(it) && lg['Complete'] !== true;
    const nPieces = Number(lg['Pieces']) || 0;
    const waitWord = 'Περιμένει κομμάτια' + (nPieces ? ' ' + (Number(lg['Pieces Delivered']) || 0) + '/' + nPieces : '');
    const doneWord = isLotIt(it) ? 'Ολοκληρώθηκε' : 'Παραδόθηκε';
    if (it.state === 'invoiced') status = `<span><i class="oiv-dot ok"></i>Τιμολογήθηκε ${f['Invoice Date'] ? dm(f['Invoice Date']) : ''}</span><span><i class="oiv-dot hollow"></i>${f['Invoice Number'] ? 'ΤΠΥ ' + esc(f['Invoice Number']) : 'χωρίς αριθμό'}</span>`;
    else if (lotWaiting) status = `<span><i class="oiv-dot ok"></i>Στην αποθήκη ${dm(it.deliv)}</span><span><i class="oiv-dot hollow"></i>${waitWord}</span>`
      + (it.reason === 'price' ? '<span><i class="oiv-dot bad"></i>χωρίς τιμή → owner</span>' : '');
    else if (it.state === 'blocked') status = `<span><i class="oiv-dot ok"></i>${isLotIt(it) ? doneWord + ' ' + dm(it.when) : 'Παραδόθηκε ' + dm(it.deliv)}</span><span><i class="oiv-dot bad"></i>${it.reason === 'price' ? 'χωρίς τιμή → owner' : 'δελτίο → Αλεξία'}</span>`;
    else status = `<span><i class="oiv-dot ok"></i>${doneWord} ${dm(it.when)}</span><span><i class="oiv-dot hollow"></i>προς κοπή${it.days !== null ? ' · ' + it.days + (it.days === 1 ? ' ημέρα' : ' ημέρες') : ''}</span>`;

    // ΣΤΟΙΧΕΙΑ ΓΙΑ ΤΟ ERP
    const c = it.clientId ? info(it.clientId) : null;
    const val = v => (v == null || String(v).trim() === '' ? (S.clientsFailed ? '<span class="oiv-muted">— δεν φόρτωσε</span>' : MISSING) : esc(v));
    const terms = c && c['Payment Terms Days'] != null && c['Payment Terms Days'] !== '' ? c['Payment Terms Days'] + ' ημέρες' : '';
    const erp = kv('Επωνυμία', val(c ? c['Company Name'] || it.client : it.client))
      + kv('ΑΦΜ', val(c && c['VAT Number'])) + kv('Διεύθυνση', val(addressLine(c))) + kv('Όροι πληρωμής', val(terms));

    // ΠΑΡΑΓΓΕΛΙΑ
    const place = p => (p.name || p.sub) ? `<span class="oiv-pl"><b>${esc(p.name || p.sub)}</b>${p.name && p.sub ? `<span>${esc(p.sub)}</span>` : ''}</span>` : '<span class="oiv-muted">—</span>';
    const pal = it.type === 'intl' ? f['Total Pallets'] : f['Pallets'];
    const order = kv('Αναφορά πελάτη', esc(it.ref || '—'))
      + kv('Φόρτωση ' + (it.load.date ? dm(it.load.date) : ''), place(it.load))
      + kv('Παράδοση ' + (it.del.date ? dm(it.del.date) : ''), place(it.del))
      + kv('Παλέτες', `${pal == null || pal === '' ? '—' : esc(pal)} · ${f['Pallet Exchange'] ? 'με ανταλλαγή' : 'χωρίς ανταλλαγή'}`)
      + kv('Ποσό', it.price === null ? '<span class="oiv-bad">χωρίς τιμή</span>' : `<span class="oiv-amt">${eurSym(it.price)}</span>`);

    // ΕΛΕΓΧΟΙ
    const ck = (ok, text) => `<div class="oiv-ck ${ok === true ? 'ok' : ok === false ? 'bad' : 'na'}"><i>${ok === true ? '✓' : ok === false ? '✗' : '–'}</i><span>${text}</span></div>`;
    let sheets;
    if (it.type !== 'intl') sheets = ck(null, 'Δελτία παλετών · δεν ελέγχονται στις εθνικές');
    else if (!f['Pallet Exchange']) sheets = ck(true, 'Δελτία παλετών · δεν απαιτούνται');
    else if (OrdersData.sheetsOk(S.set, it.rec)) sheets = ck(true, 'Δελτία παλετών · ανέβηκαν');
    else {
      const g = S.set.gate[it.id];
      const miss = g ? ` σε ${(g.loading_stops || 0) - (g.covered_stops || 0)} από ${g.loading_stops || 0} φορτώσεις` : '';
      sheets = ck(false, `Δελτίο παλετών λείπει${miss} → Αλεξία`);
    }
    const checks = ck(delivered, delivered ? (isLotIt(it) ? 'Παραλήφθηκε στην αποθήκη ' : 'Παραδόθηκε ') + dm(it.deliv) : 'Δεν έχει παραδοθεί')
      + ck(OC().hasPrice(f), OC().hasPrice(f) ? 'Τιμή ' + eurSym(it.price) : 'Χωρίς τιμή → την καταχωρεί ο owner')
      + lotCheck(it)
      + sheets;

    el.innerHTML = `
      <div class="oiv-ch">
        <div class="oiv-ch-top"><span class="oiv-ch-t">${it.num === '—' ? '' : esc(it.num) + ' · '}${esc(it.ref || '—')}</span>
          <button type="button" class="oiv-x" aria-label="Κλείσιμο" onclick="OrdersInvoicingView.close()">×</button></div>
        <div class="oiv-ch-s">${esc(it.client)}${dirWord(f) ? ' · ' + esc(dirWord(f)) : ''}</div>
        <div class="oiv-ch-st">${status}</div>
      </div>
      <div class="oiv-cb">
        <section><div class="oiv-sh"><span>Στοιχεία για το ERP</span><button type="button" class="oiv-link" onclick="OrdersInvoicingView.copyErp()">Αντιγραφή όλων</button></div>${erp}</section>
        <section><div class="oiv-sh"><span>Παραγγελία</span><button type="button" class="oiv-link" onclick="OrdersHub.openOrder('${it.type}','${esc(it.id)}')">Άνοιγμα →</button></div>${order}</section>
        <section><div class="oiv-sh"><span>Έλεγχοι</span></div>${checks}</section>
        ${isLotIt(it) ? piecesSection(it) + allocSection(it) : ''}
        ${actionBlock(it, ready)}
      </div>`;
    if (isLotIt(it)) { ensurePieces(it); if (isOwner()) ensureAlloc(it); }
    const inp = document.getElementById('oivNum');
    if (inp && !S.busy) { formInput(); if (focus !== false) inp.focus(); }
    // A refusal must be SEEN: the card body scrolls, so bring the message up.
    const errEl = el.querySelector('.oiv-err');
    if (errEl) errEl.scrollIntoView({ block: 'nearest' });
  }

  function actionBlock(it, ready) {
    const f = it.f, dm = OC().dm;
    const err = S.formErr ? `<div class="oiv-err" role="alert">${esc(S.formErr)}</div>` : '';
    if (ready && canWrite()) {
      const dr = S.draft && S.draft.id === it.id ? S.draft : null;
      const v = view();
      const nx = nextReady(v.groups, it.id, it.clientId);
      return `<section class="oiv-form"><div class="oiv-sh"><span>Καταχώριση τιμολογίου ERP</span></div>
        <div class="oiv-fr">
          <label>Αριθμός (ΤΠΥ)<input id="oivNum" autocomplete="off" value="${esc(dr ? dr.num : '')}" oninput="OrdersInvoicingView.formInput()" onkeydown="OrdersInvoicingView.formKey(event)"></label>
          <label>Ημερομηνία<input id="oivDate" type="date" value="${esc(dr ? dr.d : today())}" max="${today()}" oninput="OrdersInvoicingView.formInput()" onkeydown="OrdersInvoicingView.formKey(event)"></label>
        </div>
        <div class="oiv-hint" id="oivHint"></div>
        ${err}
        <button type="button" id="oivSave" class="oiv-primary" disabled onclick="OrdersInvoicingView.submit()">Καταχώριση <kbd>Enter</kbd></button>
        ${nx ? `<div class="oiv-next"><span>Επόμενη</span><span>${esc(nx.num)} · ${esc(nx.ref || '—')} · ${OC().eurSym(nx.price)}</span></div>` : ''}
      </section>`;
    }
    if (it.state === 'invoiced') {
      const w = canWrite();
      const editing = w && S.edit === it.id;
      return `<section><div class="oiv-sh"><span>Τιμολόγιο ERP</span>${w && !editing ? '<button type="button" class="oiv-link" onclick="OrdersInvoicingView.startEdit()">Διόρθωση ΤΠΥ</button>' : ''}</div>
        ${kv('Αριθμός (ΤΠΥ)', f['Invoice Number'] ? esc(f['Invoice Number']) : '<span class="oiv-muted">χωρίς αριθμό (πριν γίνει υποχρεωτικός)</span>')}
        ${kv('Ημερομηνία', f['Invoice Date'] ? esc(dm(f['Invoice Date'])) : '—')}
        ${kv('Ποσό', OC().eurSym(it.price))}
        ${editing ? `<div class="oiv-edit"><div class="oiv-fr">
            <label>Νέος αριθμός (ΤΠΥ)<input id="oivEditNum" autocomplete="off" value="${esc(f['Invoice Number'] || '')}" onkeydown="if(event.key==='Enter')OrdersInvoicingView.saveEdit()"></label>
            <label>Ημερομηνία<input id="oivEditDate" type="date" max="${today()}" value="${esc(OC().ymd(f['Invoice Date']) || today())}"></label></div>
            ${err}
            <div class="oiv-btns"><button type="button" class="btn btn-ghost btn-sm" onclick="OrdersInvoicingView.cancelEdit()">Άκυρο</button><button type="button" class="oiv-primary sm" onclick="OrdersInvoicingView.saveEdit()">Διόρθωση</button></div></div>` : ''}
        ${w && !editing ? `${err}<button type="button" class="oiv-danger-link" onclick="OrdersInvoicingView.undoInvoice('${esc(it.id)}', true)">Αναίρεση τιμολόγησης</button><div class="oiv-muted small">επαναφέρει «προς κοπή» · ο αριθμός και η ημερομηνία σβήνουν · το τιμολόγιο στο ERP δεν ακυρώνεται από εδώ</div>` : ''}
      </section>`;
    }
    if (it.state === 'blocked') {
      let who;
      if (it.reason === 'price') who = 'Χωρίς τιμή — την καταχωρεί ο owner. Χωρίς τιμή δεν καταχωρείται τιμολόγιο.';
      else if (it.reason === 'stock') {
        // Ε3: whoever is working closes a remainder that will never leave;
        // the base refuses while a piece or the intake is not delivered.
        // closable(), not the chip: a received lot with no piece drawn must be
        // closable too, or its one invoice can never be issued.
        const canCl = it.lot && OrdersStock.canClose() && OrdersStock.closable(it.lot);
        const btn = canCl ? `<button type="button" class="oiv-warn-btn" onclick="OrdersInvoicingView.closeRemainder('${esc(it.id)}')">Κλείσιμο υπολοίπου…</button>` : '';
        // O4: the reason lives in ΕΛΕΓΧΟΙ; here only the rule, neutral.
        return `<section><div class="oiv-muted small" role="note">Τιμολογείται μία φορά, μετά το τελευταίο κομμάτι.</div>${btn}</section>`;
      } else {
        const g = S.set.gate[it.id];
        who = (g ? `Λείπει δελτίο παλετών σε ${(g.loading_stops || 0) - (g.covered_stops || 0)} από ${g.loading_stops || 0} φορτώσεις` : 'Λείπει δελτίο παλετών')
          + ' — το ανεβάζει η Αλεξία. Μέχρι τότε δεν τιμολογείται.';
      }
      let ov = '';
      // Owner-only gate override (docs/PALLETS_ARCHITECTURE.md §4.1), for the
      // sheets gate ONLY — a missing price is never overridable (043 refuses it).
      if (it.reason === 'sheets' && isOwner() && canWrite() && OC().hasPrice(f)) {
        ov = S.override === it.id
          ? `<div class="oiv-edit"><label class="oiv-full">Αιτιολογία παράκαμψης (υποχρεωτική)<textarea id="oivOvReason" rows="2"></textarea></label>
              <div class="oiv-fr"><label>Αριθμός (ΤΠΥ)<input id="oivOvNum" autocomplete="off"></label><label>Ημερομηνία<input id="oivOvDate" type="date" max="${today()}" value="${today()}"></label></div>
              ${err}
              <div class="oiv-btns"><button type="button" class="btn btn-ghost btn-sm" onclick="OrdersInvoicingView.cancelEdit()">Άκυρο</button><button type="button" class="oiv-primary sm" onclick="OrdersInvoicingView.submitOverride()">Καταχώριση με παράκαμψη</button></div></div>`
          : `<button type="button" class="oiv-warn-btn" onclick="OrdersInvoicingView.startOverride()">Τιμολόγηση με παράκαμψη (owner)</button>`;
      }
      return `<section><div class="oiv-block" role="note">${esc(who)}</div>${ov}</section>`;
    }
    return '';
  }

  // Live hints under the form — no repaint, so the caret stays where it is.
  function formInput() {
    const it = itemById(S.selId); const btn = document.getElementById('oivSave');
    const numEl = document.getElementById('oivNum'), dateEl = document.getElementById('oivDate'), hint = document.getElementById('oivHint');
    if (!it || !btn || !numEl || !dateEl || !hint) return;
    const n = numEl.value.trim();
    const dc = dateCheck(dateEl.value, today(), it.when, isLotIt(it));
    const dup = dupCheck(S.all, n, it);
    const lines = [];
    if (dc.error) lines.push(`<span class="oiv-bad">Ημερομηνία ${esc(dc.error)}</span>`);
    else if (dc.warn) lines.push(`<span class="oiv-warn">Ημερομηνία ${esc(dc.warn)}</span>`);
    else lines.push('<span class="oiv-muted">σήμερα ή παλαιότερη</span>');
    if (dup.other.length) lines.push(`<span class="oiv-warn">Ο ΤΠΥ ${esc(n)} υπάρχει ήδη στην ${esc(dup.other[0].num)} άλλου πελάτη (${esc(dup.other[0].client)})</span>`);
    else if (dup.same.length) lines.push(`<span class="oiv-muted">Ο ίδιος ΤΠΥ καλύπτει ήδη ${dup.same.map(x => esc(x.num)).join(', ')} του ίδιου πελάτη — ένα τιμολόγιο για πολλές παραγγελίες</span>`);
    dateEl.classList.toggle('bad', !!dc.error);
    hint.innerHTML = lines.join('<br>');
    btn.disabled = S.busy || !n || !!dc.error;
  }
  function formKey(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }

  // ── Writes ──────────────────────────────────────────────────────────────
  // After ANY write: the shared set is stale for the counters and the other
  // views (invalidate + refreshBadges re-reads it); THIS view repaints from
  // the record it just changed, so the next order is on screen at once.
  function afterWrite() {
    OrdersData.invalidate();
    if (typeof OrdersHub !== 'undefined') OrdersHub.refreshBadges();
    rebuild();
  }

  async function submit() {
    if (S.busy || !canWrite()) return;
    const it = itemById(S.selId);
    if (!it || it.state !== 'ready') return;
    const n = (document.getElementById('oivNum') || {}).value; const num = String(n || '').trim();
    const d = (document.getElementById('oivDate') || {}).value || '';
    if (!num) { S.formErr = 'Συμπλήρωσε τον αριθμό ΤΠΥ του ERP'; paintCard(); return; }
    const dc = dateCheck(d, today(), it.when, isLotIt(it));
    if (dc.error) { formInput(); return; }
    const dup = dupCheck(S.all, num, it);
    if (dup.other.length) {
      const o = dup.other[0];
      const ok = await confirmAction(`Ο ΤΠΥ ${num} υπάρχει ήδη στην ${o.num} άλλου πελάτη (${o.client}).\nΈνα τιμολόγιο ERP δεν αφορά δύο πελάτες — έλεγξε τον αριθμό. Καταχώριση παρ' όλα αυτά;`,
        { title: 'Ο ΤΠΥ υπάρχει ήδη', confirmLabel: 'Καταχώριση', danger: true });
      if (!ok) { const el = document.getElementById('oivNum'); if (el) el.focus(); return; }
    }
    await writeInvoice(it, num, d, false);
  }

  async function writeInvoice(it, num, d, viaOverride) {
    S.busy = true; S.formErr = '';
    const btn = document.getElementById('oivSave'); if (btn) { btn.disabled = true; btn.textContent = 'Καταχώριση…'; }
    const fields = invoiceFields(num, d);
    try {
      await atPatch(tableOf(it), it.id, fields);
    } catch (e) {
      // The Worker/043 refusal (422, Greek text) or a 403 — shown in the card
      // where she is looking; core/api.js has already raised the red toast.
      // Never a green toast on a failed write.
      S.busy = false; S.formErr = (e && e.message) || 'Η καταχώριση απέτυχε';
      S.draft = { id: it.id, num, d };
      if (S.ctx.isCurrent()) paintCard();
      return false;
    }
    S.busy = false; S.draft = null;
    Object.assign(it.rec.fields, fields);
    afterWrite();
    S.override = null;
    const v = view();
    const nx = nextReady(v.groups, it.id, it.clientId);
    S.selId = nx ? nx.id : it.id; S.closed = false;
    if (S.ctx.isCurrent()) paintParts();
    if (S.ctx.isCurrent()) showUndo(it, num, d, viaOverride);
    return true;
  }

  async function undoInvoice(id, ask) {
    if (!canWrite() || S.busy) return;
    const it = itemById(id); if (!it) return;
    const num = it.f['Invoice Number'] || '—';
    if (ask && !(await confirmAction(`Αναίρεση τιμολόγησης της ${it.num} (ΤΠΥ ${num});\nΗ παραγγελία ξαναγίνεται «προς κοπή», ο αριθμός και η ημερομηνία σβήνουν. Το τιμολόγιο στο ERP ΔΕΝ ακυρώνεται από εδώ.`,
      { title: 'Αναίρεση τιμολόγησης', confirmLabel: 'Αναίρεση', danger: true }))) return;
    S.busy = true; S.formErr = '';
    try {
      await atPatch(tableOf(it), it.id, undoFields());
    } catch (e) {
      S.busy = false; S.formErr = (e && e.message) || 'Η αναίρεση απέτυχε';
      if (S.selId === it.id && S.ctx.isCurrent()) paintCard();
      return;
    }
    S.busy = false;
    it.rec.fields['Invoiced'] = false;
    delete it.rec.fields['Invoice Number'];
    delete it.rec.fields['Invoice Date'];
    hideUndo();
    afterWrite();
    S.selId = it.id; S.closed = false;
    if (S.tab === 'invoiced') S.tab = 'ready';
    if (S.ctx.isCurrent()) paintParts();
    toast(`Η τιμολόγηση ${escapeHtml(it.num)} (ΤΠΥ ${escapeHtml(num)}) αναιρέθηκε — είναι ξανά προς κοπή`, 'warn');
  }

  function startEdit() { S.edit = S.selId; S.formErr = ''; paintCard(); const el = document.getElementById('oivEditNum'); if (el) { el.focus(); el.select(); } }
  function cancelEdit() { S.edit = null; S.override = null; S.formErr = ''; paintCard(); }
  async function saveEdit() {
    const it = itemById(S.edit); if (!it || S.busy || !canWrite()) return;
    const num = (document.getElementById('oivEditNum').value || '').trim();
    const d = document.getElementById('oivEditDate').value || '';
    if (!num) { S.formErr = 'Συμπλήρωσε τον αριθμό ΤΠΥ του ERP'; paintCard(); return; }
    const dc = dateCheck(d, today(), it.when, isLotIt(it));
    if (dc.error) { S.formErr = 'Ημερομηνία ' + dc.error; paintCard(); return; }
    const old = it.f['Invoice Number'] || '—';
    if (!(await confirmAction(`Η παραγγελία ${it.num} είναι ήδη τιμολογημένη.\nΟ αριθμός ${old} θα αντικατασταθεί από ${num}.`, { title: 'Διόρθωση ΤΠΥ', confirmLabel: 'Διόρθωση' }))) return;
    const dup = dupCheck(S.all, num, it);
    if (dup.other.length && !(await confirmAction(`Ο ΤΠΥ ${num} υπάρχει ήδη στην ${dup.other[0].num} άλλου πελάτη (${dup.other[0].client}). Διόρθωση παρ' όλα αυτά;`, { title: 'Ο ΤΠΥ υπάρχει ήδη', confirmLabel: 'Διόρθωση', danger: true }))) return;
    S.busy = true;
    const fields = { 'Invoice Number': num, 'Invoice Date': d };
    try { await atPatch(tableOf(it), it.id, fields); }
    catch (e) { S.busy = false; S.formErr = (e && e.message) || 'Η διόρθωση απέτυχε'; if (S.ctx.isCurrent()) paintCard(); return; }
    S.busy = false; S.edit = null; S.formErr = '';
    Object.assign(it.rec.fields, fields);
    afterWrite();
    if (S.ctx.isCurrent()) paintParts();
    toast(`Ο ΤΠΥ της ${escapeHtml(it.num)} διορθώθηκε σε ${escapeHtml(num)}`);
  }

  function startOverride() { if (!isOwner() || !canWrite()) return; S.override = S.selId; S.formErr = ''; paintCard(); const el = document.getElementById('oivOvReason'); if (el) el.focus(); }
  // Same shape as invoicing.js _invOverrideInvoice: the override is recorded
  // BEFORE the invoice write and is not undone if the write fails — it is an
  // audit entry («who skipped the check and why»), not a lock. Recording an
  // unused override is harmless; invoicing without a recorded reason is not.
  async function submitOverride() {
    const it = itemById(S.override); if (!it || S.busy || !isOwner() || !canWrite()) return;
    const reason = (document.getElementById('oivOvReason').value || '').trim();
    const num = (document.getElementById('oivOvNum').value || '').trim();
    const d = document.getElementById('oivOvDate').value || '';
    if (!reason) { S.formErr = 'Η παράκαμψη χρειάζεται αιτιολογία'; paintCard(); return; }
    if (!num) { S.formErr = 'Συμπλήρωσε τον αριθμό ΤΠΥ του ERP'; paintCard(); return; }
    const dc = dateCheck(d, today(), it.when, isLotIt(it));
    if (dc.error) { S.formErr = 'Ημερομηνία ' + dc.error; paintCard(); return; }
    if (!OC().hasPrice(it.f)) { S.formErr = 'Χωρίς τιμή δεν καταχωρείται τιμολόγιο'; paintCard(); return; }
    // Same duplicate rule as the normal path, asked BEFORE the override is
    // recorded — a cancelled confirm must leave no audit entry behind.
    const dup = dupCheck(S.all, num, it);
    if (dup.other.length && !(await confirmAction(`Ο ΤΠΥ ${num} υπάρχει ήδη στην ${dup.other[0].num} άλλου πελάτη (${dup.other[0].client}). Καταχώριση παρ' όλα αυτά;`, { title: 'Ο ΤΠΥ υπάρχει ήδη', confirmLabel: 'Καταχώριση', danger: true }))) return;
    S.busy = true;
    try { await plFetch('/pallets/override', { method: 'POST', body: { order_rec: it.id, reason } }); }
    catch (e) { S.busy = false; S.formErr = 'Η παράκαμψη δεν καταγράφηκε — δεν έγινε καταχώριση. ' + ((e && e.message) || ''); if (S.ctx.isCurrent()) paintCard(); return; }
    S.busy = false;
    await writeInvoice(it, num, d, true);
  }

  // ── Undo bar (toast with an action — core toast() has none) ────────────
  function showUndo(it, num, d, viaOverride) {
    hideUndo();
    const bar = document.createElement('div');
    bar.id = 'oivUndo'; bar.className = 'oiv-undo'; bar.setAttribute('role', 'status');
    let left = 10;
    bar.innerHTML = `<div><div class="t">Καταχωρήθηκε ΤΠΥ ${esc(num)}${viaOverride ? ' · με παράκαμψη' : ''}</div><div class="s">${esc(it.num)} · ${esc(it.client)} · ${esc(OC().dm(d))}</div></div>
      ${canWrite() ? `<button type="button" onclick="OrdersInvoicingView.undoInvoice('${esc(it.id)}', false)">Αναίρεση</button>` : ''}<span class="c">${left}″</span>`;
    document.body.appendChild(bar);
    const tick = setInterval(() => {
      left--; const c = bar.querySelector('.c'); if (c) c.textContent = left + '″';
      if (left <= 0) hideUndo();
    }, 1000);
    S.undo = { bar, tick };
  }
  function hideUndo() {
    if (!S.undo) return;
    clearInterval(S.undo.tick); S.undo.bar.remove(); S.undo = null;
  }

  // ── Interactions ────────────────────────────────────────────────────────
  function select(id) { S.selId = id; S.closed = false; S.edit = null; S.override = null; S.formErr = ''; S.draft = null; S.reopenErr = null;
    document.querySelectorAll('#oivBody tr.oiv-r').forEach(tr => tr.classList.toggle('on', tr.dataset.id === id));
    paintCard(); }
  function close() { S.selId = null; S.closed = true; paintCard(); document.querySelectorAll('#oivBody tr.oiv-r.on').forEach(tr => tr.classList.remove('on')); }
  function setTab(t) { S.tab = t; S.selId = null; S.closed = false; S.formErr = ''; paintParts(); }
  function pickWeek(w) { S.sel = w; S.selId = null; S.closed = false; S.formErr = ''; if (w === 'open' && S.tab === 'invoiced') S.tab = 'ready'; paintParts(); }
  function shift(dir) {
    const cur = OC().weekStartOfYmd(today());
    const next = OC().addDays(S.stripEnd, 7 * dir);
    S.stripEnd = next > cur ? cur : next;
    paintStrip();
  }
  let _qT = null;
  function search(q) { S.q = q; clearTimeout(_qT); _qT = setTimeout(() => { S.selId = null; paintParts({ focus: false }); }, 120); }

  async function copyErp() {
    const it = itemById(S.selId); if (!it) return;
    const c = it.clientId ? info(it.clientId) : null;
    const terms = c && c['Payment Terms Days'] != null && c['Payment Terms Days'] !== '' ? c['Payment Terms Days'] + ' ημέρες' : '';
    const rows = [['Επωνυμία', (c && c['Company Name']) || it.client], ['ΑΦΜ', c && c['VAT Number']], ['Διεύθυνση', addressLine(c)],
      ['Όροι πληρωμής', terms], ['Αναφορά πελάτη', it.ref], ['Ποσό', it.price === null ? '' : OC().eur(it.price)]];
    // OWNER-Q9 answered 4/10 (ERP = original order only): a lot copies the
    // same lines as any order — no pieces' deliveries.
    const lines = rows.map(([k, v]) => k + '\t' + (v == null ? '' : String(v))).join('\n');
    try { await navigator.clipboard.writeText(lines); toast('Τα στοιχεία αντιγράφηκαν'); }
    catch (e) { toast('Η αντιγραφή δεν επιτράπηκε από τον browser — επίλεξε και αντέγραψε χειροκίνητα', 'warn'); }
  }

  function _periodLabel() { return S.sel === 'open' ? 'Όλες οι ανοιχτές' : 'Εβδομάδα ' + OC().weekLabel(S.sel); }
  const TAB_LABEL = { ready: 'Προς κοπή', blocked: 'Μπλοκαρισμένες', invoiced: 'Τιμολογημένες', all: 'Όλες' };
  function exportCsv() {
    if (!S.set) return;
    const v = view();
    if (!v.list.length) { toast('Η λίστα είναι άδεια — τίποτα για εξαγωγή', 'warn'); return; }
    const tag = S.sel === 'open' ? 'anoixtes' : S.sel;
    OrdersList.csvDownload(csvRows(v.groups, info), `fyllo-erp_${tag}_${S.tab}.csv`);
  }
  // A4, black on white: the print window has no style.css, so the few token
  // values it needs are copied across (same approach as invoicing.js
  // _invTokenCSS) instead of writing colours here.
  function print() {
    if (!S.set) return;
    const v = view();
    if (!v.list.length) { toast('Η λίστα είναι άδεια — τίποτα για εκτύπωση', 'warn'); return; }
    const cs = getComputedStyle(document.documentElement);
    const tok = ['--text', '--text-mid', '--border', '--surface-card'].map(n => `${n}:${cs.getPropertyValue(n).trim()}`).join(';');
    const eur = OC().eur;
    let total = 0;
    const body = v.groups.map(g => {
      const c = g.clientId ? info(g.clientId) : null;
      const rows = g.items.map(it => {
        if (it.price !== null) total += it.price;
        const st = stateWord(it);
        return `<tr><td>${esc(it.num)}</td><td>${esc(it.ref)}</td><td>${esc([it.load.name, it.load.sub].filter(Boolean).join(' · '))}</td><td>${esc(it.erp.place)}</td><td>${esc(OC().dm(it.erp.date))}</td><td class="r">${esc(it.erp.pallets)}</td><td class="r">${it.price === null ? '—' : eur(it.price)}</td><td>${esc(st)}</td></tr>`;
      }).join('');
      return `<tr class="g"><td colspan="6">${esc(g.client)}${c && c['VAT Number'] ? ' · ΑΦΜ ' + esc(c['VAT Number']) : ''}</td><td class="r">${eur(g.sum)}</td><td>${g.items.length}</td></tr>${rows}`;
    }).join('');
    const now = new Date().toLocaleDateString('el-GR');
    // C4-12: the scope word only when it narrows («Όλες · Όλες» read as a stutter).
    OrdersList.printOpen(`<!DOCTYPE html><html lang="el"><head><meta charset="UTF-8"><title>Προς τιμολόγηση — ${esc(_periodLabel())}</title>
      <style>:root{${tok}}*{box-sizing:border-box}body{font:11px/1.35 Arial,sans-serif;color:var(--text);background:var(--surface-card);margin:0;padding:16px;font-variant-numeric:tabular-nums}
      h1{font-size:16px;margin:0 0 2px}.m{color:var(--text-mid);margin-bottom:10px}table{width:100%;border-collapse:collapse}
      th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.4px;border-bottom:1.5px solid var(--text);padding:4px 6px}
      td{padding:3px 6px;border-bottom:1px solid var(--border);vertical-align:top}.r{text-align:right}tr.g td{font-weight:700;padding-top:8px;border-bottom:1px solid var(--text)}
      tfoot td{font-weight:700;border-top:1.5px solid var(--text);border-bottom:0;padding-top:6px}@page{size:A4 landscape;margin:12mm}</style></head><body>
      <h1>Προς τιμολόγηση — ${esc(_periodLabel())}</h1>
      <div class="m">${esc([TAB_LABEL[S.tab], { intl: 'Διεθνείς', natl: 'Εθνικές' }[S.ctx.scope], v.list.length + ' παραγγελίες', now].filter(Boolean).join(' · '))}</div>
      <table><thead><tr><th>Αρ.</th><th>Αναφορά</th><th>Φόρτωση</th><th>Παράδοση</th><th>Ημ. παρ.</th><th class="r">Παλ.</th><th class="r">Ποσό €</th><th>Κατάσταση</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><td colspan="6">Σύνολο</td><td class="r">${eur(total)}</td><td></td></tr></tfoot></table>
      <script>window.onload=function(){window.print()}<\/script></body></html>`);
  }

  // ── Styles (tokens only, DESIGN.md #1; Syne only for the hero amounts) ──
  // The delivered dot uses --panel-ok-hi, not --panel-ok: assets/style.css
  // swallows --panel-ok (an asterisk-slash inside the comment above that
  // declaration closes the comment early; measured 28/9, computed value empty).
  function ensureStyles() {
    if (document.getElementById('oivStyles')) return;
    const st = document.createElement('style'); st.id = 'oivStyles';
    st.textContent = `
.oiv{font-family:'DM Sans',sans-serif;color:var(--text)}
.oiv-banner{background:var(--warn-bg);border:1px solid var(--warn-border);color:var(--warn);border-radius:6px;padding:8px 12px;font-size:12.5px;margin-bottom:var(--space-2)}
.oiv-strip{display:flex;align-items:stretch;gap:var(--space-1);background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:4px;margin-bottom:var(--space-3)}
.oiv-arr{border:0;background:none;color:var(--text-mid);font-size:18px;width:28px;cursor:pointer;border-radius:6px}
.oiv-arr:disabled{color:var(--text-dim);cursor:default}
.oiv-arr:not(:disabled):hover{background:var(--surface-sunken)}
.oiv-wks{display:flex;flex:1;gap:var(--space-1);min-width:0}
.oiv-wk{flex:1;min-width:0;display:flex;align-items:baseline;justify-content:center;gap:8px;border:0;background:none;padding:7px 8px 6px;border-radius:6px;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
.oiv-wk:hover{background:var(--surface-sunken)}
.oiv-wk-l{font-size:13px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums}
.oiv-wk-s{font-size:11.5px;color:var(--text-mid);overflow:hidden;text-overflow:ellipsis}
.oiv-wk.on{background:var(--accent-light);border-bottom-color:var(--surface-dark)}
.oiv-allopen{border:0;background:none;color:var(--accent-text);font:500 12.5px 'DM Sans',sans-serif;padding:0 10px;cursor:pointer;white-space:nowrap;border-radius:6px}
.oiv-allopen.on{background:var(--accent-light);color:var(--text);font-weight:600}
.oiv-main{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--space-3);align-items:start}
.oiv-main.with-card{grid-template-columns:minmax(0,1fr) 360px}
.oiv-left{min-width:0;display:flex;flex-direction:column;gap:var(--space-2)}
.oiv-kpis{display:flex;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px 0}
.oiv-kpi{flex:1 1 0;padding:0 10px;border-left:1px solid var(--border);min-width:0}
.oiv-kpi.hero{border-left:0;flex:0 0 auto;min-width:max-content;padding:0 16px 0 14px}
.oiv-kpi:last-child{flex:1.3 1 0}
.oiv-kpi-l{font-size:11px;color:var(--text-mid);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.oiv-kpi-v{display:flex;align-items:baseline;gap:6px;margin-top:2px;white-space:nowrap}
.oiv-kpi-v .n{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.oiv-kpi-v .s{font-size:11.5px;color:var(--text-mid);font-variant-numeric:tabular-nums}
.oiv-kpi.hero .n{font-family:'Syne',sans-serif;font-size:21px}
.oiv-bar{display:flex;justify-content:space-between;align-items:center;gap:var(--space-2)}
.oiv-seg{display:inline-flex;background:var(--surface-sunken);border:1px solid var(--border);border-radius:8px;padding:2px}
.oiv-seg-b{border:1px solid transparent;background:transparent;color:var(--text-mid);font:500 12.5px 'DM Sans',sans-serif;padding:5px 14px;border-radius:6px;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums}
.oiv-seg-b.on{background:var(--bg-card);border-color:var(--border-mid);color:var(--text);font-weight:600}
.oiv-search input{width:260px;height:32px;border:1px solid var(--border-mid);border-radius:6px;background:var(--bg-card);padding:0 10px;font:13px 'DM Sans',sans-serif;color:var(--text)}
.oiv-search input:focus{outline:2px solid var(--accent);outline-offset:-1px}
.oiv-tablewrap{background:var(--bg-card);border:1px solid var(--border);border-radius:8px 8px 0 0;overflow:auto;max-height:calc(100vh - 360px);min-height:180px}
.oiv-t{width:100%;table-layout:fixed;border-collapse:collapse;font-size:12.5px}
.oiv-t thead th{position:sticky;top:0;z-index:var(--z-sticky);background:var(--bg-card);text-align:left;font-size:11px;font-weight:600;letter-spacing:.4px;color:var(--text-mid);padding:9px 10px;border-bottom:1px solid var(--border-mid);white-space:nowrap}
.oiv-t td{padding:6px 10px;border-bottom:1px solid var(--border-row);vertical-align:middle;overflow:hidden}
.oiv-t .r{text-align:right}
.oiv-t .num{font-variant-numeric:tabular-nums;white-space:nowrap}
.oiv-t td.num:first-child{font-weight:600}
.oiv-g td{background:var(--bg-row-alt);padding:8px 10px;border-bottom:1px solid var(--border)}
.oiv-g td b{font-weight:600}
.oiv-gm{margin-left:12px;font-size:11.5px;color:var(--text-mid);font-variant-numeric:tabular-nums}
.oiv-g td.r b{font-variant-numeric:tabular-nums}
.oiv-r{cursor:pointer}
.oiv-r:hover td{background:var(--bg-hover)}
.oiv-r.on td{background:var(--accent-light)}
.oiv-r.on td:first-child{box-shadow:inset 3px 0 0 var(--surface-dark)}
.oiv-sub{display:block;font-size:11.5px;color:var(--text-mid);line-height:1.25}
/* C2-07: the lot's quiet tag on the SCREEN list (same as the catalog) — never on the ERP papers (OWNER-Q9). */
.oiv-tag{display:inline-block;margin-right:6px;padding:0 4px;border:1px solid var(--border-mid);border-radius:3px;font-size:9px;font-weight:600;letter-spacing:.3px;color:var(--text-mid);line-height:13px}
.oiv-muted{color:var(--text-dim)}
.oiv-muted.small{font-size:11.5px;margin-top:4px;line-height:1.35}
.oiv-st{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;color:var(--text);font-variant-numeric:tabular-nums}
.oiv-st.bad{color:var(--danger);font-weight:600}
.oiv-st.wait{color:var(--text-mid)}
.oiv-dot{display:inline-block;width:8px;height:8px;border-radius:50%;border:1.5px solid var(--surface-dark);flex-shrink:0}
.oiv-dot.fill,.oiv-dot.bad{background:var(--danger);border-color:var(--danger)}
.oiv-dot.ok{background:var(--panel-ok-hi);border-color:var(--panel-ok-hi)}
.oiv-dot.hollow{border-color:var(--text-on-dark)}
.oiv-dot.wait{border-color:var(--text-mid)}
.oiv-empty td{text-align:center;color:var(--text-mid);padding:36px 12px}
.oiv-foot{display:flex;justify-content:space-between;gap:12px;background:var(--bg-card);border:1px solid var(--border);border-top:0;border-radius:0 0 8px 8px;margin-top:calc(-1 * var(--space-2));padding:10px 12px;font-size:12px;color:var(--text-mid);font-variant-numeric:tabular-nums}
.oiv-total{color:var(--text)}
.oiv-total b{font-weight:700;margin-left:6px}
.oiv-card{background:var(--bg-card);border:1px solid var(--border);border-radius:8px;overflow:hidden;position:sticky;top:var(--space-3);max-height:calc(100vh - 260px);display:flex;flex-direction:column}
.oiv-ch{background:var(--surface-dark);color:var(--text-inverse);padding:14px 16px 12px}
.oiv-ch-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.oiv-ch-t{font-family:'Syne',sans-serif;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}
.oiv-x{border:0;background:none;color:var(--text-on-dark);font-size:18px;cursor:pointer;line-height:1}
.oiv-ch-s{font-size:12.5px;color:var(--text-on-dark);margin-top:3px}
.oiv-ch-st{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--text-on-dark);margin-top:8px}
.oiv-ch-st span{display:inline-flex;align-items:center;gap:6px}
.oiv-cb{overflow:auto;padding:0 16px 14px}
.oiv-cb section{padding:12px 0;border-bottom:1px solid var(--border)}
.oiv-cb section:last-child{border-bottom:0}
.oiv-sh{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--text-mid);margin-bottom:6px}
.oiv-link{border:0;background:none;color:var(--accent-text);font:500 12px 'DM Sans',sans-serif;cursor:pointer;padding:0;text-transform:none;letter-spacing:0}
.oiv-kv{display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-size:12.5px}
.oiv-kv>span:first-child{color:var(--text-mid);white-space:nowrap}
.oiv-kv>span:last-child{text-align:right;font-variant-numeric:tabular-nums;min-width:0}
.oiv-pl{display:flex;flex-direction:column;align-items:flex-end}
.oiv-pl b{font-weight:600}
.oiv-pl span{font-size:11.5px;color:var(--text-mid)}
.oiv-amt{font-family:'Syne',sans-serif;font-size:16px;font-weight:700}
.oiv-ck{display:flex;gap:8px;font-size:12.5px;padding:2px 0}
.oiv-ck i{font-style:normal;width:12px;font-weight:700}
.oiv-ck.ok i{color:var(--ok)}
.oiv-ck.bad i,.oiv-ck.bad span{color:var(--danger)}
.oiv-ck.na i,.oiv-ck.na span{color:var(--text-mid)}
.oiv-closed .oiv-link{margin-left:6px}
.oiv-fr{display:flex;gap:10px}
.oiv-fr label,.oiv-full{flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-mid);min-width:0}
.oiv-full{margin-bottom:8px}
.oiv-fr input,.oiv-full textarea{height:38px;border:1px solid var(--border-mid);border-radius:6px;padding:0 10px;font:14px 'DM Sans',sans-serif;color:var(--text);background:var(--bg-card);font-variant-numeric:tabular-nums;width:100%}
.oiv-full textarea{height:auto;padding:8px 10px;resize:vertical}
.oiv-fr input:focus,.oiv-full textarea:focus{outline:0;border:1.5px solid var(--surface-dark)}
.oiv-fr input.bad{border-color:var(--danger)}
.oiv-hint{font-size:11.5px;line-height:1.45;margin:6px 0 10px;min-height:16px}
.oiv-bad{color:var(--danger)}
.oiv-warn{color:var(--warn)}
.oiv-err{background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger);border-radius:6px;padding:8px 10px;font-size:12.5px;margin-bottom:10px}
.oiv-primary{width:100%;height:40px;border:0;border-radius:6px;background:var(--surface-dark);color:var(--text-inverse);font:600 14px 'DM Sans',sans-serif;cursor:pointer;position:relative}
.oiv-primary.sm{width:auto;height:32px;padding:0 16px;font-size:13px}
.oiv-primary:disabled{background:var(--surface-sunken);color:var(--text-dim);cursor:not-allowed}
.oiv-primary kbd{position:absolute;right:10px;top:50%;transform:translateY(-50%);font:500 10.5px 'DM Sans',sans-serif;border:1px solid var(--border-dark);border-radius:4px;padding:1px 5px;color:var(--text-on-dark)}
.oiv-primary:disabled kbd{border-color:var(--border);color:var(--text-dim)}
.oiv-next{display:flex;justify-content:space-between;font-size:12px;color:var(--text-mid);margin-top:10px;font-variant-numeric:tabular-nums}
.oiv-next span:last-child{color:var(--text)}
.oiv-edit{border:1px solid var(--border-mid);border-radius:8px;padding:12px;margin-top:10px}
.oiv-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
.oiv-danger-link{border:0;background:none;color:var(--danger);font:500 13px 'DM Sans',sans-serif;cursor:pointer;padding:10px 0 0}
.oiv-block{border:1px solid var(--danger);color:var(--danger);border-radius:6px;padding:10px 12px;font-size:12.5px;line-height:1.45}
.oiv-warn-btn{width:100%;margin-top:10px;height:36px;border:1px solid var(--warn-border);background:var(--warn-bg);color:var(--warn);border-radius:6px;font:600 13px 'DM Sans',sans-serif;cursor:pointer}
.oiv-undo{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:var(--z-top);display:flex;align-items:center;gap:18px;background:var(--surface-dark);color:var(--text-inverse);border-radius:8px;padding:12px 16px;font:13px 'DM Sans',sans-serif}
.oiv-undo .t{font-weight:600}
.oiv-undo .s{font-size:11.5px;color:var(--text-on-dark);margin-top:2px}
.oiv-undo button{border:0;background:none;color:var(--panel-accent);font:600 13px 'DM Sans',sans-serif;cursor:pointer}
.oiv-undo .c{font-size:11px;color:var(--panel-dim);font-variant-numeric:tabular-nums}
.oiv-pc{padding:5px 0;border-bottom:1px solid var(--border-row);font-size:12.5px}
.oiv-pc:last-child{border-bottom:0}
.oiv-pc1{display:flex;align-items:baseline;gap:8px;font-variant-numeric:tabular-nums}
.oiv-pc1 b{font-weight:600}
.oiv-pc-r{margin-left:auto;color:var(--text-mid);white-space:nowrap}
.oiv-pc2{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--text-mid);font-variant-numeric:tabular-nums}
.oiv-pc2 span:first-child{min-width:0;overflow-wrap:anywhere}`;
    document.head.appendChild(st);
  }

  const api = { pure, render, select, close, setTab, pickWeek, shift, search, formInput, formKey, submit, undoInvoice,
    startEdit, cancelEdit, saveEdit, startOverride, submitOverride, copyErp, exportCsv, print, closeRemainder, reopenLot };
  return api;
})();

if (typeof window !== 'undefined') {
  window.OrdersInvoicingView = OrdersInvoicingView;
  if (typeof OrdersHub !== 'undefined') {
    OrdersHub.register('invoicing', {
      label: 'Προς τιμολόγηση', order: 2,
      // Not warehouse: it reads orders but has no CLIENTS GET, so the ERP block
      // (ΑΦΜ, address, terms) could only fail — and invoicing is not its job.
      visible: () => typeof can === 'function' && can('orders') !== 'none' && can('clients') !== 'none',
      render: ctx => OrdersInvoicingView.render(ctx),
    });
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = OrdersInvoicingView.pure;
