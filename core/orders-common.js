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
  // The order-creation buttons: ONE markup for the Orders page and both
  // Weekly boards (owner 29/9: «το κουμπί θέλω να είναι όπως στις
  // παραγγελίες· ίδιο κουμπί και στο weekly»). The Weekly used its own
  // 12px/26–34px buttons, so the same .btn-scan stood out as «another» button.
  // `fn` is the handler call as written in onclick (a trusted literal).
  scanButton(fn, label, title) {
    const esc = s => escapeHtml(String(s == null ? '' : s));
    const ic = typeof icon === 'function' ? icon('camera', 14) : '';
    return `<button type="button" class="btn-scan" onclick="${fn}"${title ? ` title="${esc(title)}"` : ''}>${ic} ${esc(label)}</button>`;
  },
  newOrderButton(fn, label, title) {
    const esc = s => escapeHtml(String(s == null ? '' : s));
    return `<button type="button" class="btn-new-order" onclick="${fn}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`;
  },

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

// ── Stock lots (migration 057, owner 3–4/10/2026) ───────────────────────────
// A client leaves N pallets in a warehouse (the LOT = one ordinary order whose
// destination is the warehouse, marked by a row in STOCK LOTS); we carry them
// on in PIECES = ordinary ORDERS linked by «Stock Lot». One invoice for the lot,
// none for a piece. Every rule (no over-draw, a piece has no price, the lot is
// invoiced only when complete, …) lives in the base (057 triggers + CHECKs);
// this object only mirrors them and is the ONE front API both the Orders page
// and the Weekly International use (contract §5.2) — a second copy of «is this
// a piece» is how a piece would end up invoiced on one screen and not another.
//
// Data predicates (isPiece/isLot) read the facade fields and do NOT depend on
// the feature switch: a piece that exists must never show as «χωρίς τιμή»,
// whatever the switch says. on() gates only what the user can START.
const OrdersStock = {
  on() {
    return typeof FEATURES !== 'undefined' && FEATURES.STOCK_LOTS === true
      && !!(typeof TABLES !== 'undefined' && TABLES.STOCK_LOTS);
  },
  isPiece(f) { return !!getLinkedId(f && f['Stock Lot']); },
  // «Own Stock Lot» is the rec of the lot this order is the SOURCE of — a plain
  // string from the view (own.legacy_id), not a link array.
  isLot(f) { return !!(f && f['Own Stock Lot']); },
  lotRecOfPiece(f) { return getLinkedId(f && f['Stock Lot']) || null; },
  lotRecOfLot(f) { return (f && f['Own Stock Lot']) || null; },
  // Same prefix rule as OrdersCommon.numLabel: «#312» international source,
  // «Ε-27» national source (Φ3) — the two tables' ids overlap.
  lotNumLabel(f) {
    const n = f && f['Stock Lot Order No'];
    if (!n) return '—';
    return (f['Stock Lot Source'] === 'natl' ? 'Ε-' : '#') + n;
  },
  lotLabel(lot) {
    const g = (lot && lot.fields) || {};
    if (!g['Lot No']) return '—';
    return (g['Source Kind'] === 'natl' ? 'Ε-' : '#') + g['Lot No'];
  },
  // Mark / unmark a lot, new piece, join, return, delete a loose piece. The
  // Worker RBAC is the lock (stock_lots: dispatcher GET/POST/PATCH/DELETE);
  // this only hides what would 403.
  canWrite() { return typeof ROLE !== 'undefined' && (ROLE === 'owner' || ROLE === 'dispatcher'); },
  // Ε3 (owner 4/10): «Κλείσιμο υπολοίπου» by whoever is working — the auditor
  // reports every close (S-09), so it does not need to be narrow.
  canClose() { return typeof ROLE !== 'undefined' && (ROLE === 'owner' || ROLE === 'dispatcher' || ROLE === 'accountant'); },

  // The shelf/card state of one STOCK LOTS record. NULL columns are ABSENT on
  // the facade (trap #2), so every count reads absent as 0 and every flag as
  // false — never «undefined === undefined».
  //   nointake — pieces move although the warehouse intake is not Delivered
  //   close    — intake in, pieces drawn and all delivered, pallets still left
  //   aging    — in the warehouse more than 21 days
  // «close» needs at least one piece: with none drawn, «all delivered» is
  // vacuous and every freshly received lot would ask to be closed (and could
  // never turn «aging»). Contract §5.2 omits «Pieces > 0» — added on purpose.
  chip(lot, todayYmd) {
    const g = (lot && lot.fields) || {};
    const n = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
    const stock = n(g['Stock Pallets']), remaining = n(g['Remaining Pallets']);
    const pieces = n(g['Pieces']), done = n(g['Pieces Delivered']), loose = n(g['Pieces Without Truck']);
    const intake = g['Intake Delivered'] === true;
    const recv = g['Received On'] ? OrdersCommon.ymd(g['Received On']) : '';
    const days = intake && recv ? OrdersCommon.daysBetween(recv, todayYmd || OrdersCommon.today()) : null;
    let key = 'ok';
    if (!intake && pieces > loose) key = 'nointake';
    else if (intake && pieces > 0 && pieces === done && remaining > 0 && !g['Closed At']) key = 'close';
    else if (intake && days !== null && days > 21) key = 'aging';
    return { key, days, remaining, stock };
  },

  // The payload of a NEW piece: the form's own fields (values) with the lot's
  // locks on top. Never «Price» — the lot is invoiced once (CHECK
  // orders_stock_piece_no_money would refuse it anyway); never PE (Ε5: pallet
  // exchange counts once, at the lot's loading). Status is «Assigned» only
  // when the caller hands a vehicle with it (the Weekly join), else «Pending».
  pieceFields(lot, presets, values) {
    const g = (lot && lot.fields) || {}, p = presets || {};
    const arr = v => (Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []));
    const out = Object.assign({}, values || {});
    delete out['Price'];
    out['Stock Lot'] = [lot.id];
    out['Client'] = [g['Client Rec']];
    out['Direction'] = 'Import';
    out['Type'] = 'International';
    out['Loading Location 1'] = [g['Warehouse Rec']];
    for (let i = 2; i <= 10; i++) out['Loading Location ' + i] = [];
    out['Pallet Exchange'] = false;
    if (p.groupId) out['Group ID'] = p.groupId;
    if ('truck' in p) out['Truck'] = arr(p.truck);
    if ('trailer' in p) out['Trailer'] = arr(p.trailer);
    if ('driver' in p) out['Driver'] = arr(p.driver);
    out['Status'] = p.status === 'Assigned' ? 'Assigned' : 'Pending';
    const ld = (p.lockLoadingDate && p.loadingDate) ? p.loadingDate : (out['Loading DateTime'] || p.loadingDate);
    if (ld) out['Loading DateTime'] = ld;
    const dd = out['Delivery DateTime'] || p.deliveryDate;
    if (dd) out['Delivery DateTime'] = dd;
    return out;
  },

  // ── Reads: never throw, never an empty list on failure (principle 1) ─────
  _msg(e) { return (e && e.message) || String(e || 'άγνωστο σφάλμα'); },
  // A rec goes into a formula string — only the facade's own id shape passes.
  _rec(r) { return typeof r === 'string' && /^rec[A-Za-z0-9]{1,32}$/.test(r); },
  async loadLots(formula) {
    try {
      const lots = await atGetAll(TABLES.STOCK_LOTS, formula ? { filterByFormula: formula } : {}, false);
      return { ok: true, lots };
    } catch (e) {
      console.error('orders stock: lots', e);
      return { ok: false, failed: true, error: OrdersStock._msg(e) };
    }
  },
  loadOpen() { return OrdersStock.loadLots('{Complete}=0'); },
  async _orders(formula, tag) {
    try {
      const pieces = await atGetAll(TABLES.ORDERS, { filterByFormula: formula }, false);
      pieces.forEach(r => { r._type = 'intl'; });
      return { ok: true, failed: false, pieces };
    } catch (e) {
      console.error('orders stock: ' + tag, e);
      return { ok: false, failed: true, pieces: null, error: OrdersStock._msg(e) };
    }
  },
  async loadPieces(lotRec) {
    if (!OrdersStock._rec(lotRec)) return { ok: false, failed: true, pieces: null, error: 'μη έγκυρη παρτίδα' };
    return OrdersStock._orders(`FIND("${lotRec}",ARRAYJOIN({Stock Lot},","))>0`, 'pieces');
  },
  // Pieces waiting for a truck (all weeks): returned to stock, or created
  // before their truck was known.
  loadLoosePieces() {
    return OrdersStock._orders("AND({Stock Lot}!=BLANK(),{Truck}=BLANK(),{Partner}=BLANK(),{Status}!='Delivered')", 'loose pieces');
  },

  // ── Writes: the answer is the read-back, never the toast (principle 2) ──
  async markLot(orderRec) {
    let created;
    try { created = await atCreate(TABLES.STOCK_LOTS, { Order: [orderRec] }); }
    catch (e) { return { ok: false, error: OrdersStock._msg(e) }; }
    if (!created || !OrdersStock._rec(created.id)) return { ok: false, error: 'ο server δεν επέστρεψε την παρτίδα (εκτός σύνδεσης;) — άνοιξε ξανά την παραγγελία για να δεις αν έγινε παρτίδα' };
    try {
      const lot = await atGetOne(TABLES.STOCK_LOTS, created.id);
      if (getLinkedId(lot && lot.fields && lot.fields['Order']) === orderRec) return { ok: true, lot };
      return { ok: false, lot, error: 'η παρτίδα γράφτηκε χωρίς τη σύνδεση με την παραγγελία — ενημέρωσε τον διαχειριστή' };
    } catch (e) {
      return { ok: false, error: 'η σήμανση στάλθηκε αλλά δεν επιβεβαιώθηκε (' + OrdersStock._msg(e) + ') — άνοιξε ξανά την παραγγελία για να δεις αν έγινε παρτίδα' };
    }
  },
  // Facade DELETE = soft delete; the base refuses a lot with pieces or an
  // invoiced one (stock_guard_lots → Greek 422).
  async unmarkLot(lotRec) {
    try { await atDelete(TABLES.STOCK_LOTS, lotRec); return { ok: true }; }
    catch (e) { return { ok: false, error: OrdersStock._msg(e) }; }
  },
  // The base stamps «Closed At» itself (now(), a client value is ignored) and
  // refuses while a piece or the intake is not delivered (close_early).
  async closeLot(lotRec, note) {
    const text = String(note == null ? '' : note).trim();
    if (!text) return { ok: false, error: 'Γράψε αιτιολογία' };
    try { await atPatch(TABLES.STOCK_LOTS, lotRec, { 'Closed Note': text }); }
    catch (e) { return { ok: false, error: OrdersStock._msg(e) }; }
    try {
      const lot = await atGetOne(TABLES.STOCK_LOTS, lotRec);
      const f = (lot && lot.fields) || {};
      if (f['Closed Note'] === text && f['Closed At']) return { ok: true, lot };
      return { ok: false, lot, error: 'το κλείσιμο δεν γράφτηκε — η παρτίδα έμεινε ανοιχτή' };
    } catch (e) {
      return { ok: false, error: 'το κλείσιμο στάλθηκε αλλά δεν επιβεβαιώθηκε (' + OrdersStock._msg(e) + ') — ξαναφόρτωσε τη σελίδα' };
    }
  },

  // «Κλείσιμο υπολοίπου»: pallets only, never money (the dispatcher and the
  // accountant close too, and only the owner sees the lost amount).
  _closing: null,
  openCloseModal(lot, onDone) {
    const g = (lot && lot.fields) || {};
    const left = Number(g['Remaining Pallets']) || 0;
    const esc = s => escapeHtml(String(s == null ? '' : s));
    OrdersStock._closing = { lot, onDone };
    const where = [g['Warehouse Name'], g['Client Name']].filter(Boolean).join(' · ');
    const body = `<div style="font-size:13px;line-height:1.6;color:var(--text)">
        <div style="font-weight:600;margin-bottom:6px">Παρτίδα ${esc(OrdersStock.lotLabel(lot))}${where ? ' · ' + esc(where) : ''}</div>
        <div>Μένουν <b>${left}</b> ${left === 1 ? 'παλέτα' : 'παλέτες'} στην αποθήκη. Γράφονται ως χαμένο υπόλοιπο και η παρτίδα γίνεται έτοιμη για τιμολόγηση.</div>
      </div>
      <label class="form-label" for="osCloseNote" style="margin-top:12px;display:block">Αιτιολογία *</label>
      <textarea class="form-textarea" id="osCloseNote" rows="3" style="width:100%;resize:vertical" placeholder="π.χ. 2 παλέτες χαλασμένες στην αποθήκη" oninput="document.getElementById('osCloseErr').style.display='none'"></textarea>
      <div id="osCloseErr" role="alert" style="display:none;margin-top:8px;color:var(--danger);font-size:12.5px"></div>`;
    const footer = `<button type="button" class="btn btn-ghost" onclick="closeModal()">Άκυρο</button>
      <button type="button" class="btn btn-primary" id="osCloseBtn" onclick="OrdersStock._submitClose()">Κλείσιμο υπολοίπου</button>`;
    openModal('Κλείσιμο υπολοίπου', body, footer);
  },
  async _submitClose() {
    const c = OrdersStock._closing; if (!c) return;
    const note = (document.getElementById('osCloseNote') || {}).value || '';
    const err = document.getElementById('osCloseErr'), btn = document.getElementById('osCloseBtn');
    const show = m => { if (err) { err.textContent = m; err.style.display = ''; } };
    if (!note.trim()) { show('Η αιτιολογία είναι υποχρεωτική'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Κλείσιμο…'; }
    const res = await OrdersStock.closeLot(c.lot.id, note);
    if (!res.ok) {
      // The modal stays open with the reason typed: the Greek refusal of the
      // base (close_early, lot_invoiced…) is said here, where she is looking.
      show('Δεν έκλεισε: ' + res.error);
      if (btn) { btn.disabled = false; btn.textContent = 'Κλείσιμο υπολοίπου'; }
      return;
    }
    OrdersStock._closing = null;
    closeModal();
    if (typeof toast === 'function') toast('Το υπόλοιπο της παρτίδας ' + escapeHtml(OrdersStock.lotLabel(res.lot)) + ' έκλεισε');
    if (typeof c.onDone === 'function') { try { await c.onDone(res.lot); } catch (e) { console.warn('orders stock: close onDone', e); } }
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
      const set = { at: Date.now(), intl: OrdersData.withoutPieces(intlVis), natl: natlRes.r, natlFailed: !natlRes.ok, gate: {}, gateFailed: false };
      await OrdersData._loadGate(set);
      await OrdersData._loadStock(set);
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
  // Stock pieces (057) never enter this set: a piece has no price of its own
  // (the base refuses one) and is invoiced inside its lot, so here it could
  // only ever show as a false «χωρίς τιμή» or a second invoice. This is the
  // ONE place they are dropped — «Προς τιμολόγηση», «Χωρίς τιμή», the hub
  // counters and the week view's states all read this set. Data-based, not
  // behind FEATURES.STOCK_LOTS (a piece that exists is a piece).
  withoutPieces(recs) { return recs.filter(r => !OrdersStock.isPiece(r.fields)); },
  // The lots of the set: their completeness decides whether they may be
  // invoiced. Read only when the set holds a lot. A failed read blocks every
  // lot (stockFailed) and the view says so — never «ready» on a guess.
  async _loadStock(set) {
    set.stock = new Map(); set.stockFailed = false;
    if (!set.intl.some(r => OrdersStock.isLot(r.fields))) return;
    const res = await OrdersStock.loadLots('{Invoiced}=0');
    if (!res.ok) { set.stock = null; set.stockFailed = true; return; }
    res.lots.forEach(l => set.stock.set(l.id, l));
  },
  sheetsOk(set, rec) {
    const f = rec.fields;
    if (!f['Pallet Exchange'] || rec._type !== 'intl') return true;
    if (set.gateFailed) return !!(f['Pallet Sheet 1 Uploaded'] && f['Pallet Sheet 2 Uploaded']);
    const g = set.gate[rec.id];
    return !g || g.sheets_ok === true;   // absent = no loading stops = nothing to gate
  },
  // One state per record, one reason per blocked record (with who unblocks it).
  //   'invoiced' · 'ready' · 'blocked' (reason: 'price' → owner, 'stock' → the
  //   lot's pieces, 'sheets' → Αλεξία) · 'pending' (not delivered)
  // A lot (057) is delivered when the WAREHOUSE received it, but it is invoiced
  // once, only when complete (every piece delivered and nothing left, or the
  // remainder closed) — the same rule stock_guard_orders enforces on
  // «Invoiced»; 'stock' carries the lot record (null = not read) for the text.
  stateOf(set, rec) {
    const f = rec.fields;
    if (OrdersCommon.isInvoiced(f)) return { key: 'invoiced' };
    if (f['Status'] === 'Cancelled') return { key: 'cancelled' };
    if (!OrdersCommon.isDelivered(rec)) return { key: 'pending' };
    if (!OrdersCommon.hasPrice(f)) return { key: 'blocked', reason: 'price' };
    if (OrdersStock.isLot(f)) {
      const lot = (set.stock && set.stock.get(OrdersStock.lotRecOfLot(f))) || null;
      if (set.stockFailed || !lot || lot.fields['Complete'] !== true) return { key: 'blocked', reason: 'stock', lot };
    }
    if (!OrdersData.sheetsOk(set, rec)) return { key: 'blocked', reason: 'sheets' };
    return { key: 'ready' };
  },
  all(set) { return [...set.intl, ...set.natl]; },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { OrdersCommon, OrdersData, OrdersStock };
