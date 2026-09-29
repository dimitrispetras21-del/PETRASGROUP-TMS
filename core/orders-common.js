// core/orders-common.js — what the views of the one «Παραγγελίες» page share.
//
// Owner 28/9/2026: International and National orders become ONE page with
// four views (Κατάλογος · Προς τιμολόγηση · Εβδομάδα · Χωρίς τιμή) and a scope
// (Όλες · Διεθνείς · Εθνικές). Figma round 6 (file KO7l2AfucR3HJEDIg1Yptr,
// y45000). Every rule that more than one view needs lives here ONCE — a second
// copy of «which week is this order in» or «is it delivered» is exactly how two
// screens end up printing different totals for the same week (principle 3).
//
// No IIFE on purpose: the modules reach this through the global, exactly like
// they reach OrdersList, TABLES or atGet.

const OrdersCommon = {
  // ── Dates (local calendar, 'YYYY-MM-DD') ─────────────────────────────────
  ymd(raw) { return typeof toLocalDate === 'function' ? toLocalDate(raw) : String(raw || '').slice(0, 10); },
  addDays(ymd, n) {
    const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },
  daysBetween(fromYmd, toYmd) {
    if (!fromYmd || !toYmd) return null;
    return Math.round((new Date(toYmd + 'T12:00:00') - new Date(fromYmd + 'T12:00:00')) / 86400000);
  },
  today() { return typeof localToday === 'function' ? localToday() : new Date().toISOString().slice(0, 10); },
  dm(raw) { const y = OrdersCommon.ymd(raw); return y ? (+y.slice(8, 10)) + '/' + (+y.slice(5, 7)) : '—'; },

  // ── The week (owner 28/9: «η εβδομάδα ακολουθεί το weekly») ─────────────
  // A week runs Saturday → Friday (owner 10/8 for the international board,
  // 28/9 for the national one). An order belongs to the week in which the
  // WEEKLY shows it — not to its RT's start and not to its ISO week:
  //   international export → Delivery date (Loading when Delivery is empty),
  //                          weekly_intl.js narrows exports exactly so;
  //   international import → Loading date (weekly_intl.js fetches imports so);
  //   national             → Loading date (weekly_natl.js fetches NAT_LOADS so).
  // «Προς τιμολόγηση» and «Εβδομάδα» both use THIS function, so the same week
  // prints the same total on both (the R5 designs disagreed by one order
  // because one counted by delivery and the other by RT start).
  // The Saturday itself comes from core/tms-week.js — the ONE week function the
  // two Weekly boards call too (coordinator 28/9: no third copy).
  weekStartOfYmd(ymd) { return ymd ? TmsWeek.startOfDate(ymd) : ''; },
  weekDateOf(rec) {
    const f = rec.fields || {};
    if (rec._type === 'natl') return OrdersCommon.ymd(f['Loading DateTime'] || f['Delivery DateTime']);
    // weekly_intl.js B2 (owner 6/9): an explicit «Plan Week Start» (a Saturday)
    // wins over the dates on the board — _wiImpShift writes it on IMPORTS moved
    // to another week (2 live rows 29/9, €6.000 that would otherwise sit one
    // week apart here and on the board); exports honour it the same way.
    if (f['Plan Week Start']) return OrdersCommon.ymd(f['Plan Week Start']);
    if (f['Direction'] === 'Import') return OrdersCommon.ymd(f['Loading DateTime'] || f['Delivery DateTime']);
    return OrdersCommon.ymd(f['Delivery DateTime'] || f['Loading DateTime']);
  },
  weekStartOf(rec) { return OrdersCommon.weekStartOfYmd(OrdersCommon.weekDateOf(rec)); },
  // «19 – 25/9» · «26/9 – 2/10» — date ranges, never W-numbers (the team
  // counts weeks by dates; three week-number conventions live in the app).
  weekLabel(startYmd) {
    if (!startYmd) return '—';
    const end = OrdersCommon.addDays(startYmd, 6);
    const d1 = +startYmd.slice(8, 10), m1 = +startYmd.slice(5, 7);
    const d2 = +end.slice(8, 10), m2 = +end.slice(5, 7);
    return m1 === m2 ? `${d1} – ${d2}/${m2}` : `${d1}/${m1} – ${d2}/${m2}`;
  },

  // ── Money ────────────────────────────────────────────────────────────────
  // Only «Price». null = never entered (NOT 0): an unpriced order is shown and
  // counted as such, never summed as zero (the «άγραφο φαίνεται ξοφλημένο» lesson).
  price(f) { const v = parseFloat((f || {})['Price']); return Number.isFinite(v) ? v : null; },
  // «Has a price» = price > 0 — the SAME rule as the Worker (invoiceMarkError)
  // and migration 043; a 0 € order would pass a null check and then 422.
  hasPrice(f) { const v = OrdersCommon.price(f); return v !== null && v > 0; },
  eur(v) {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
    return new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
  },
  eurSym(v) { const s = OrdersCommon.eur(v); return s === '—' ? s : s + ' €'; },

  // ── Invoicing state (moved here from invoicing.js, rules unchanged) ──────
  isInvoiced(f) { f = f || {}; return f['Status'] === 'Invoiced' || !!f['Invoiced']; },
  // National orders never get Status='Delivered' written (only daily_ops does,
  // on ORDERS): «delivered» is COMPUTED for them — delivery date passed and not
  // cancelled (owner decision, invoicing.js Φ0/Α7). Owner 28/9: a national order
  // that never reached the Weekly (no NAT_LOAD) still counts once its date passed.
  isDelivered(rec) {
    const f = rec.fields || {};
    if (rec._type !== 'natl') return f['Status'] === 'Delivered';
    return OrdersCommon.deliveredByDate(f['Status'], f['Delivery DateTime']);
  },
  // The national rule itself — also called by weekly_natl.js _wnIsDelivered
  // (NAT_LOADS rows carry their own status), so the board and this page can
  // never disagree about «παραδόθηκε» (it was a declared copy until 28/9).
  deliveredByDate(status, deliveryDt) {
    if (status === 'Delivered') return true;
    if (status === 'Cancelled') return false;
    const t = new Date(deliveryDt || '').getTime();
    return !isNaN(t) && t < Date.now();
  },
  daysSinceDelivery(rec) {
    const d = OrdersCommon.ymd((rec.fields || {})['Delivery DateTime']);
    return d ? OrdersCommon.daysBetween(d, OrdersCommon.today()) : null;
  },

  // ── Order number ─────────────────────────────────────────────────────────
  // «#1229» international, «Ε-427» national: the two tables' row ids overlap, so
  // the prefix is the only thing that tells two «427»s apart on one list.
  // 'Order No' on NATIONAL ORDERS needs the view national_orders_with_derived +
  // the Worker mapping (DRAFT, owner deploy). Until then it is absent and the
  // cell says «—» — never the record id (IN-2: a fake-looking number is worse
  // than an admitted gap).
  numLabel(rec) {
    const n = (rec.fields || {})['Order No'];
    if (!n) return '—';
    return (rec._type === 'natl' ? 'Ε-' : '#') + n;
  },

  // ── Places (owner 28/9: «κεντρικό την ονομασία, με γκρι από κάτω την πόλη,
  // χώρα») ──────────────────────────────────────────────────────────────────
  // From the flat link fields both forms write (intl: Loading/Unloading
  // Location N, written from the stops by submitIntlOrder; natl: Pickup/Delivery
  // Location N). Needs the reference locations (preloadReferenceData).
  // Location lookup of its own: the reference preload is ONE Promise.all over
  // six tables, so a failure in any of them (trucks, say) leaves the locations
  // empty and every place cell would print «—» with nothing saying why. The
  // page calls ensureLocations() before a view renders; when it fails,
  // locationsFailed makes the page SAY so (principle 1).
  _locs: null,
  locationsFailed: false,
  async ensureLocations() {
    const ref = typeof getRefLocations === 'function' ? getRefLocations() : [];
    if (ref && ref.length) { OrdersCommon._locs = new Map(ref.map(r => [r.id, r])); OrdersCommon.locationsFailed = false; return; }
    if (OrdersCommon._locs && OrdersCommon._locs.size) return;
    try {
      const recs = await refLocationsFetch();           // the one shared LOCATIONS read (api.js)
      OrdersCommon._locs = new Map(recs.map(r => [r.id, r]));
      OrdersCommon.locationsFailed = false;
    } catch (e) {
      console.warn('orders common: locations', e);
      OrdersCommon.locationsFailed = true;
    }
  },
  _locMeta(id) {
    if (!id) return null;
    const l = OrdersCommon._locs ? OrdersCommon._locs.get(id)
      : (typeof getRefLocations === 'function' ? getRefLocations() : []).find(r => r.id === id);
    if (!l) return { name: '', city: '', cc: '' };
    const raw = l.fields['Country'] || '';
    const cc = (typeof countryCode === 'function' && countryCode(raw)) || String(raw).trim();
    return { name: String(l.fields['Name'] || ''), city: String(l.fields['City'] || ''), cc };
  },
  _linkIds(f, base, max) {
    const out = [];
    for (let i = 1; i <= (max || 10); i++) {
      const v = f[base + ' ' + i]; const id = Array.isArray(v) ? v[0] : (typeof v === 'string' ? v : null);
      if (id) out.push(id);
    }
    return out;
  },
  // → { name, sub, date, count } for 'load' | 'del'
  placeOf(rec, which) {
    const f = rec.fields || {};
    const natl = rec._type === 'natl';
    let ids;
    if (which === 'load') ids = OrdersCommon._linkIds(f, natl ? 'Pickup Location' : 'Loading Location');
    else {
      ids = OrdersCommon._linkIds(f, natl ? 'Delivery Location' : 'Unloading Location');
    }
    const date = which === 'load' ? f['Loading DateTime'] : f['Delivery DateTime'];
    if (!ids.length) return { name: '', sub: '', date, count: 0 };
    const m = OrdersCommon._locMeta(ids[0]) || {};
    const subParts = [[m.city, m.cc].filter(Boolean).join(' ')];
    if (ids.length > 1) subParts.push('+' + (ids.length - 1));
    return { name: m.name || m.city || '', sub: subParts.filter(Boolean).join(' · '), date, count: ids.length };
  },
  // One cell: name on top, «City CC» grey below, date right on the grey line.
  placeCell(p, opts) {
    const o = opts || {};
    const esc = s => escapeHtml(String(s == null ? '' : s));
    if (!p || (!p.name && !p.sub)) return '<span class="oc-miss">—</span>';
    const date = o.noDate ? '' : `<span class="oc-pdate">${OrdersCommon.dm(p.date)}</span>`;
    return `<span class="oc-pname" title="${esc(p.name)}">${esc(p.name || p.sub)}</span>`
         + `<span class="oc-psub"><span class="oc-pcity" title="${esc(p.sub)}">${esc(p.name ? p.sub : '')}</span>${date}</span>`;
  },

  // ── The invoiced cell (owner 28/9: «να γράφει τον αρ. ΤΠΥ με πράσινο και τικ»)
  // Two pre-043 rows are invoiced without a number (grandfathered, never
  // backfilled) — they say so instead of inventing one.
  invCell(f) {
    f = f || {};
    if (!OrdersCommon.isInvoiced(f)) return '<span class="oc-noinv">—</span>';
    const n = String(f['Invoice Number'] || '').trim();
    const d = f['Invoice Date'] ? ' · ' + OrdersCommon.dm(f['Invoice Date']) : '';
    return n
      ? `<span class="oc-inv" title="Τιμολογήθηκε · ΤΠΥ ${escapeHtml(n)}${d}">✓ ΤΠΥ ${escapeHtml(n)}</span>`
      : '<span class="oc-inv" title="Τιμολογήθηκε πριν γίνει υποχρεωτικός ο αριθμός ΤΠΥ">✓ χωρίς αριθμό</span>';
  },

  // ── Assignment (ΑΝΑΘΕΣΗ) — ONE cell for the Κατάλογος and «Χωρίς τιμή»
  // (owner 29/9: «στο χωρίς τιμή δεν υπάρχει η πινακίδα/ανάθεση»). Plate on
  // top, driver grey below; a partner by name with its plates below.
  // A NATIONAL order never carries its own vehicle (0 of 11 have one, measured
  // 29/9): its assignment lives on its national load — `opts.load` — which the
  // Weekly National assigns. `opts.missingLoad` = no load at all («εκτός»).
  assignOf(rec, opts) {
    const o = opts || {};
    const f = rec.fields || {};
    const esc = s => escapeHtml(String(s == null ? '' : s));
    const two = (a, b, key, text) => ({ key, text,
      html: `<span class="oc-a1" title="${esc(a)}">${esc(a)}</span><span class="oc-a2" title="${esc(b)}">${esc(b)}</span>` });
    const vehicle = x => {
      const pid = (x['Partner'] || [])[0];
      if (pid) {
        const pr = (typeof getRefPartners === 'function' ? getRefPartners() : []).find(p => p.id === pid);
        // A partner missing from the (cached) partner list still IS a partner:
        // «—» on top would read as «nobody», so the word stands in for the name.
        const name = pr?.fields?.['Company Name'] || 'συνεργάτης';
        const plates = String(x['Partner Truck Plates'] || '').trim() || (pr ? 'συνεργάτης' : '');
        return two(name, plates, 'partner', [name, plates].filter(Boolean).join(' · '));
      }
      const tid = (x['Truck'] || [])[0], did = (x['Driver'] || [])[0];
      if (!tid && !did) return null;
      const t = tid ? (typeof getRefTrucks === 'function' ? getRefTrucks() : []).find(v => v.id === tid) : null;
      const d = did ? (typeof getRefDrivers === 'function' ? getRefDrivers() : []).find(v => v.id === did) : null;
      const plate = t?.fields?.['License Plate'] || '—';
      const drv = String(d?.fields?.['Full Name'] || '').trim();
      return two(plate, drv, 'own', [plate, drv].filter(Boolean).join(' · '));
    };
    const open = title => ({ key: 'pa', text: 'προς ανάθεση',
      html: `<span class="oc-adot hollow"></span><span class="oc-adim"${title ? ` title="${esc(title)}"` : ''}>— προς ανάθεση</span>` });
    if (rec._type === 'natl') {
      if (f['National Groupage']) return { key: 'grp', text: 'μέσω ομαδοποίησης', html: '<span class="oc-adot hollow"></span>μέσω ομαδοπ.' };
      if (o.missingLoad) {
        const send = o.canSend ? ` <button type="button" class="oc-alink" onclick="event.stopPropagation();_natlSendToWeekly('${rec.id}')" title="Δημιουργεί το φορτίο που λείπει — μετά εμφανίζεται στο Εβδομαδιαίο Εθνικών">Στείλε →</button>` : '';
        return { key: 'out', text: 'εκτός Εβδομαδιαίου', html: `<span class="oc-adot danger"></span><span class="oc-ared">εκτός</span>${send}` };
      }
      const v = o.load ? vehicle(o.load.fields || {}) : null;
      return v || open(o.load ? 'Στο Εβδομαδιαίο Εθνικών, χωρίς όχημα' : '');
    }
    const v = vehicle(f);
    if (v) return v;
    const st = f['Status'] || 'Pending';
    if (st === 'Delivered' || st === 'Cancelled' || st === 'Invoiced') return { key: 'none', text: '', html: '<span class="oc-adim">—</span>' };
    return open('');
  },

  // National loads of the given national orders: Map orderId → load record
  // (Source National Order, Truck, Driver, Partner, Partner Truck Plates).
  // Batches of 90 — one OR() over every candidate blew past the formula limit
  // (22/9). Shared by orders_natl.js (the «εκτός» check) and OrdersData, so
  // «is it on the board / who drives it» is asked one way only.
  async natLoadsFor(natlRecs) {
    const out = new Map();
    const cand = (natlRecs || []).filter(r => !(r.fields || {})['National Groupage']);
    for (const part of OrdersList.chunk(cand, 90)) {
      const ff = `OR(${part.map(r => `FIND("${r.id}",ARRAYJOIN({Source National Order},","))>0`).join(',')})`;
      const nls = await atGetAll(TABLES.NAT_LOADS, { filterByFormula: ff, fields: ['Source National Order', 'Truck', 'Driver', 'Partner', 'Partner Truck Plates'] }, false);
      nls.forEach(n => { const id = getLinkedId(n.fields['Source National Order']); if (id && !out.has(id)) out.set(id, n); });
    }
    return out;
  },

  // Tokens only (DESIGN.md #1). Injected once.
  ensureStyles() {
    if (document.getElementById('ocStyles')) return;
    const st = document.createElement('style'); st.id = 'ocStyles';
    st.textContent = `
.oc-pname{display:block;font-weight:600;color:var(--text);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;line-height:1.25}
.oc-psub{display:flex;gap:8px;justify-content:space-between;font-size:11.5px;color:var(--text-mid);line-height:1.25}
.oc-pcity{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0}
.oc-pdate{flex-shrink:0;font-variant-numeric:tabular-nums}
.oc-miss,.oc-noinv{color:var(--text-dim)}
.oc-inv{color:var(--ok, #067647);font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.oc-a1{display:block;font-weight:500;color:var(--text);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;line-height:1.3}
.oc-a2{display:block;font-size:11.5px;color:var(--text-mid);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;line-height:1.3}
.oc-adot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:6px;vertical-align:middle;background:var(--text-mid)}
.oc-adot.danger{background:var(--danger)}.oc-adot.hollow{background:transparent;border:1.5px solid var(--text-mid)}
.oc-adim{color:var(--text-dim)}.oc-ared{color:var(--danger);font-weight:500}
.oc-alink{border:none;background:none;color:var(--accent);font-weight:600;font-size:12.5px;cursor:pointer;padding:0 4px}`;
    document.head.appendChild(st);
  },
};

// ── The data set of «Προς τιμολόγηση» and «Χωρίς τιμή» ──────────────────────
// Both views (and the page's counters) read the SAME records with the SAME
// pallet gate — loaded once per render, deduped while in flight. Same query as
// invoicing.js had: every delivered/invoiced international order, and every
// national order whose delivery date passed (nationals never get «Delivered»).
const OrdersData = {
  _inflight: null,
  _cache: null,           // { at, intl, natl, natlFailed, gate, gateFailed }
  invalidate() { OrdersData._cache = null; },
  // The national orders' loads — who drives them (ΑΝΑΘΕΣΗ of «Χωρίς τιμή»,
  // owner 29/9). Read only by the view that shows it, once per cached set,
  // so the week/invoicing views and the tab badges don't pay for it.
  // Sets set.natLoads (Map, or null = not loaded → the view shows «—», never
  // a guess) and set.natLoadsFailed.
  async loadNatLoads(set) {
    if (!set._natLoadsP) set._natLoadsP = (async () => {
      try { set.natLoads = set.natl.length ? await OrdersCommon.natLoadsFor(set.natl) : new Map(); set.natLoadsFailed = false; }
      catch (e) { console.error('orders data: national loads', e); set.natLoads = null; set.natLoadsFailed = true; set._natLoadsP = null; }
    })();
    return set._natLoadsP;
  },
  async loadInvoicingSet(force) {
    if (!force && OrdersData._cache && Date.now() - OrdersData._cache.at < 60000) return OrdersData._cache;
    if (OrdersData._inflight) return OrdersData._inflight;
    OrdersData._inflight = (async () => {
      const today = OrdersCommon.today();
      const intlF = 'OR({Status}="Delivered",{Status}="Invoiced",{Invoiced}=1)';
      const natlF = `OR({Status}="Delivered",{Status}="Invoiced",{Invoiced}=1,AND(IS_BEFORE({Delivery DateTime},'${today}'),{Status}!="Cancelled"))`;
      if (typeof preloadReferenceData === 'function') { try { await preloadReferenceData(); } catch (e) { console.warn('orders data: ref', e); } }
      const [intl, natlRes] = await Promise.all([
        atGet(TABLES.ORDERS, intlF, false),
        // A failed national read must be HEARD (banner), not an empty list that
        // reads as «nothing to invoice» (invoicing.js natlFailed, principle 1).
        atGet(TABLES.NAT_ORDERS, natlF, false).then(r => ({ ok: true, r }), e => { console.error('orders data: national', e); return { ok: false, r: [] }; }),
      ]);
      intl.forEach(r => { r._type = 'intl'; });
      natlRes.r.forEach(r => { r._type = 'natl'; });
      // Split orders (FEATURES.ORDER_SPLIT): a leg is execution detail — the
      // parent carries price and invoicing, the legs never appear here.
      const intlVis = (typeof FEATURES !== 'undefined' && FEATURES.ORDER_SPLIT)
        ? intl.filter(r => !getLinkedId(r.fields['Parent Order'])) : intl;
      const set = { at: Date.now(), intl: intlVis, natl: natlRes.r, natlFailed: !natlRes.ok, gate: {}, gateFailed: false };
      await OrdersData._loadGate(set);
      const clientIds = [...new Set([...set.intl, ...set.natl].map(r => (r.fields['Client'] || [])[0]).filter(Boolean))];
      if (clientIds.length && typeof fhBatchResolveClients === 'function') { try { await fhBatchResolveClients(clientIds); } catch (e) { console.warn('orders data: clients', e); } }
      OrdersData._cache = set;
      return set;
    })();
    try { return await OrdersData._inflight; } finally { OrdersData._inflight = null; }
  },
  // Pallet-slip gate (docs/PALLETS_ARCHITECTURE.md §4.1): /pallets/gate for the
  // not-yet-invoiced international orders with pallet exchange. On failure the
  // old per-order check applies and the view shows a banner (gateFailed).
  async _loadGate(set) {
    const ids = set.intl.filter(r => r.fields['Pallet Exchange'] && !OrdersCommon.isInvoiced(r.fields)).map(r => r.id);
    if (!ids.length) return;
    try {
      for (let i = 0; i < ids.length; i += 300) {
        const res = await plFetch('/pallets/gate?order_recs=' + ids.slice(i, i + 300).join(','));
        (res.records || []).forEach(g => { set.gate[g.order_rec] = g; });
      }
    } catch (e) {
      console.error('orders data: /pallets/gate', e);
      set.gate = {}; set.gateFailed = true;
    }
  },
  sheetsOk(set, rec) {
    const f = rec.fields;
    if (!f['Pallet Exchange'] || rec._type !== 'intl') return true;
    if (set.gateFailed) return !!(f['Pallet Sheet 1 Uploaded'] && f['Pallet Sheet 2 Uploaded']);
    const g = set.gate[rec.id];
    return !g || g.sheets_ok === true;   // absent = no loading stops = nothing to gate
  },
  // One state per record, one reason per blocked record (with who unblocks it).
  //   'invoiced' · 'ready' · 'blocked' (reason: 'price' → owner, 'sheets' → Αλεξία) · 'pending' (not delivered)
  stateOf(set, rec) {
    const f = rec.fields;
    if (OrdersCommon.isInvoiced(f)) return { key: 'invoiced' };
    if (f['Status'] === 'Cancelled') return { key: 'cancelled' };
    if (!OrdersCommon.isDelivered(rec)) return { key: 'pending' };
    if (!OrdersCommon.hasPrice(f)) return { key: 'blocked', reason: 'price' };
    if (!OrdersData.sheetsOk(set, rec)) return { key: 'blocked', reason: 'sheets' };
    return { key: 'ready' };
  },
  all(set) { return [...set.intl, ...set.natl]; },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { OrdersCommon, OrdersData };
