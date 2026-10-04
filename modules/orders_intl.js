// ═══════════════════════════════════════════════
// MODULE — INTERNATIONAL ORDERS  v4
// ═══════════════════════════════════════════════
(function() {
'use strict';

const INTL_ORDERS = { data: [], selectedId: null };
let _intlPeriod = '60'; // '60' | '180' | 'all'

// ─── Ref data: delegates to shared form-helpers.js ──
const _loadLocations = fhLoadLocations;
const _searchClients = fhSearchClients;
const _resolveClientName = fhResolveClientName;

function _clientName(f) {
  return fhClientName(f['Client']);
}
function _cleanSummary(s) {
  if (!s) return '—';
  // Airtable formula wraps location names in quotes and joins with /
  // Strip all quotes, clean up slashes, trim
  return escapeHtml(s.replace(/["']+/g,'').replace(/\s*\/\s*/g, ' / ').replace(/\s*\/\s*$/, '').trim() || '—');
}
// Get total pallets from ORDER_STOPS loading stops
function _stopsTotalPallets(orderId) {
  const stops = (window._intlStopsByOrder || {})[orderId];
  if (!stops || !stops.length) return 0;
  return stops.filter(s => s.fields[F.STOP_TYPE] === 'Loading')
    .reduce((sum, s) => sum + (s.fields[F.STOP_PALLETS] || 0), 0);
}

// ─── Alignment pass (παρτίδα 3, Figma w4-orders-interaction-spec 208:724) ──
// Owner 30/8: the layout STAYS; only colour, typography, card, motion.
// Everything below is display-only. DB values (Export/Pending/…) are never
// rewritten: filters, sorting, CSV and writes keep reading the raw field.
const _oiLocMeta = {};   // locId → {name, city, country} for the card's stop lines
// Partial loads speak (DESIGN #7): each secondary fetch that fails adds one
// line above the table saying what is missing and what that does NOT mean.
const _oiLoadWarns = [];
const _OI_WARN_REF   = 'Τα στοιχεία στόλου και συνεργατών δεν φορτώθηκαν — η στήλη ΑΝΑΘΕΣΗ δείχνει «—». Δεν σημαίνει ότι δεν έχει γίνει ανάθεση. Ξαναδοκίμασε με Ανανέωση.';
const _OI_WARN_LOC   = 'Οι τοποθεσίες δεν φορτώθηκαν — λείπει η πόλη/χώρα κάτω από τα ονόματα. Δεν σημαίνει ότι δεν έχουν καταχωρηθεί. Ξαναδοκίμασε με Ανανέωση.';
const _OI_STATUS = {
  'Pending':    { gr: 'Σε αναμονή',   dot: 'pending' },
  'Assigned':   { gr: 'Ανατεθειμένη', dot: 'assigned' },
  'In Transit': { gr: 'Σε μεταφορά',  dot: 'transit' },
  'Delivered':  { gr: 'Παραδόθηκε',   dot: 'delivered' },
  'Invoiced':   { gr: 'Τιμολογήθηκε', dot: 'invoiced' },
  'Cancelled':  { gr: 'Ακυρώθηκε',    dot: 'cancelled' },
};
const _OI_DIR_W  = { Export: 'Εξαγωγή',   Import: 'Εισαγωγή' };
const _OI_REEFER = { 'Continuous': 'Συνεχής', 'Start-Stop': 'Start-Stop', 'No temp': 'Χωρίς ψύξη' };
function _oiDate(d) { return d ? new Date(d).toLocaleDateString('el-GR', { day: 'numeric', month: 'numeric' }) : '—'; }
// Unknown ≠ zero (DESIGN.md #3): null/'' → «—»; a real number, 0 included, prints.
function _oiMoney(v) { return (v === null || v === undefined || v === '') ? '—' : '€ ' + Number(v).toLocaleString('el-GR'); }
function _oiStops(orderId, type) {
  const stops = (window._intlStopsByOrder || {})[orderId];
  if (!stops || !stops.length) return [];
  return stops.filter(s => s.fields[F.STOP_TYPE] === type)
    .sort((a, b) => (a.fields[F.STOP_NUMBER] || 0) - (b.fields[F.STOP_NUMBER] || 0));
}
function _oiLocOf(stop) {
  const arr = stop.fields[F.STOP_LOCATION];
  const id = Array.isArray(arr) ? arr[0] : null;
  const m = id ? _oiLocMeta[id] : null;
  return { id, name: m?.name || (id ? (_fhLocationsMap[id] || id.slice(-6)) : '?'), city: m?.city || '', country: m?.country || '' };
}
function _oiCloseCard() {
  const p = document.getElementById('intlDetail'); if (!p) return;
  // The floating read-only card (Weekly Εθνικών → VS load) is created on
  // demand; removing it leaves the Weekly page with no hidden panel behind.
  // The static panel of the Διεθνείς Παραγγελίες page only hides (as before).
  if (p.classList.contains('oi-ro-float')) p.remove(); else p.classList.add('hidden');
}

// Module-scoped styles, tokens only (DESIGN.md #1) — same pattern as the
// locations card. style.css is the integrator's file, not this unit's.
function _oiEnsureStyles() {
  if (document.getElementById('oiStyles')) return;
  const st = document.createElement('style'); st.id = 'oiStyles'; st.textContent = _oiCss();
  document.head.appendChild(st);
}
function _oiCss() { return `
.oi-num{font-variant-numeric:tabular-nums}
.oi-layout .entity-detail-panel{width:480px;flex-shrink:0;display:flex;flex-direction:column;background:var(--surface-card);border-left:1px solid var(--border);position:relative;z-index:var(--z-raised);box-shadow:var(--shadow-panel);transition:none;overflow-y:auto;overflow-x:hidden}
.oi-layout .entity-detail-panel.hidden{display:none;width:0;border-left:none;box-shadow:none}
.oi-layout .entity-detail-panel:not(.hidden){animation:oi-slide var(--duration-fast) var(--ease-out)}
@keyframes oi-slide{from{transform:translateX(100%)}to{transform:none}}
.oi-card-head{background:var(--surface-dark);color:var(--text-on-dark);padding:16px 24px;flex-shrink:0}
.oi-card-title{display:flex;align-items:flex-start;gap:8px;font-family:'Syne',sans-serif;font-weight:700;font-size:18px;line-height:24px;letter-spacing:1px;text-transform:uppercase}
.oi-card-title span{flex:1;overflow-wrap:anywhere}
.oi-close{background:none;border:0;color:var(--text-dim);font-size:18px;line-height:18px;cursor:pointer;padding:0 4px;font-family:inherit}
.oi-close:hover{color:var(--text-on-dark)}
.oi-card-sub{font-size:12px;color:var(--text-dim);margin-top:4px}
.oi-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.oi-chip{display:inline-block;padding:0 8px;line-height:20px;border-radius:9999px;border:1px solid var(--border-dark);font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-on-dark)}
/* On navy the semantic tokens are too dark to read as text (--warn 2.3:1,
   --danger 2.5:1), so warn borrows its own light background as ink and the
   two red states are filled tiles with light text. No on-dark semantic token
   exists yet — noted for the owner. */
.oi-chip-warn{color:var(--warn-bg);border-color:var(--warn-bg)}
.oi-chip-bad{background:var(--danger);border-color:var(--danger)}
.oi-chip-unassigned{background:var(--unassigned);border-color:var(--unassigned)}
.oi-sect{padding:12px 24px;border-top:1px solid var(--border)}
.oi-sect:first-of-type{border-top:none}
.oi-sect-alt{background:var(--surface-sunken)}
.oi-sect-t{font-family:'Syne',sans-serif;font-weight:700;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--text-mid);margin-bottom:4px}
.oi-kv{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:4px 0;font-size:13px}
.oi-kv .k{color:var(--text-mid);font-size:12px;flex-shrink:0}
.oi-kv .v{font-weight:600;text-align:right;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.oi-kv .v.miss{font-weight:400;color:var(--text-dim)}
.oi-kv .v.warn{color:var(--warn)}
.oi-stop{display:flex;align-items:baseline;gap:8px;padding:4px 0;font-size:13px}
.oi-stop .d{color:var(--text-mid);font-size:12px;min-width:32px}
.oi-stype{display:inline-block;border:1px solid var(--border);border-radius:6px;padding:0 8px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-mid);white-space:nowrap}
.oi-stop .n{flex:1;font-weight:600;overflow-wrap:anywhere}
.oi-stop .q{font-weight:700;white-space:nowrap}
.oi-note{font-size:12px;color:var(--warn);line-height:1.4}
.oi-text{font-size:12px;color:var(--text-mid);line-height:1.5;white-space:pre-wrap}
.oi-links{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:4px}
.oi-link{background:none;border:0;padding:0;font:inherit;font-size:12px;font-weight:500;color:var(--accent-text);cursor:pointer}
.oi-link:hover{text-decoration:underline}
.oi-link-danger{color:var(--danger)}
.oi-sep{color:var(--text-dim)}
.oi-balance{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.oi-balance:empty{display:none}
.oi-bal{display:inline-block;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:500;border:1px solid var(--border)}
.oi-bal-bad{border-color:var(--danger);color:var(--danger)}
.oi-bal-warn{background:var(--warn-bg);border-color:var(--warn-border);color:var(--warn)}
/* Δ6: NOT scoped to .oi-layout — these live in the modal, which is a sibling
   of #content, not a descendant of the list layout. */
.oi-req-msg{color:var(--danger);font-size:11px;line-height:1.3;margin-top:4px}
.oi-req-bad{border-color:var(--danger)}
/* Scan / duplicate banners in the modal — same three voices as the list strips. */
.oi-banner{padding:8px 12px;border-radius:6px;margin-bottom:8px;font-size:12px;font-weight:600;border:1px solid var(--border);background:var(--surface-sunken);color:var(--text)}
.oi-banner-warn{background:var(--warn-bg);border-color:var(--warn-border);color:var(--warn)}
.oi-banner-bad{border-color:var(--danger);color:var(--danger)}
.oi-banner a{color:inherit;text-decoration:underline;font-weight:700}
.oi-banner small{display:block;font-weight:400;font-size:11px;margin-top:4px}
/* Stock lots (057): the lot box of the form and the locked fields of a piece. */
.oi-locked{background:var(--surface-sunken);color:var(--text-mid);cursor:not-allowed}
div.oi-locked{display:flex;align-items:center;font-size:13px}
.oi-lot{margin:0 0 16px;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-sunken)}
.oi-lot-ck{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer}
.oi-lot-ck input{width:15px;height:15px;margin:0}
.oi-lot-wh{max-width:420px}
.oi-lot-hint{font-size:11px;line-height:1.3;color:var(--text-mid);margin-top:4px}
.oi-lot-hint.bad{color:var(--danger)}
.oi-lot-off{margin-top:8px;font-size:12px;line-height:1.4;color:var(--warn)}
`; }

// ─── Main ───────────────────────────────────────
// Since 28/9/2026 (owner: one «Παραγγελίες» page) the LIST is drawn by
// modules/orders_catalog.js for both types. This module keeps what is really
// international: the data load (orders; names in the background; stops per
// card), the card, the form, the scan and every cascade. The catalog calls
// loadOrdersIntlData(); the card opens in the catalog's own layout.
async function _intlLoad() {
  _oiLoadWarns.length = 0;
    // Date range filter based on period dropdown
    const _intlDateFormula = OrdersList.periodFormula(_intlPeriod);
    // Perf 29/9 (owner «ok για κατάλογο»): the list paints on the orders
    // alone. Names (clients, places, fleet) arrive in the background
    // (INTL_ORDERS.namesReady → the catalog repaints once, showing «…» until
    // then, never «—» or a record id); the stops load when a card opens.
    // Before, the first row waited on the whole reference preload (20 pages of
    // CLIENTS, 12 of LOCATIONS on a cold cache), a second full LOCATIONS read,
    // every order's stops in sequential batches, and the client-name batches.
    const [records] = await Promise.all([
      atGet(TABLES.ORDERS, _intlDateFormula || '', false),
      // Scan round 3: paperclip badge index. Never rejects (core/order-docs.js
      // logs its own warning and returns an empty index) — one request in
      // parallel with ORDERS, so the rows read an already-settled index.
      (typeof OrderDocs !== 'undefined' ? OrderDocs.preloadIndex() : Promise.resolve()),
    ]);
    records.sort((a,b) => (b.fields['Loading DateTime']||'').localeCompare(a.fields['Loading DateTime']||''));
    // Wave 3 (owner 6/9, FEATURES.ORDER_SPLIT): a leg is the parent's own
    // execution detail, not a second customer order — the list shows the
    // parent once (chip «2 σκέλη» in the catalog row), legs stay reachable only via
    // the base ORDERS table. No fields[] restriction on this fetch, so
    // 'Parent Order' is already present when it exists — pure client-side
    // filter, no request-shape change on the off-path.
    INTL_ORDERS.legParents = null;
    let _oiVisible = records;
    if (typeof FEATURES !== 'undefined' && FEATURES.ORDER_SPLIT) {
      const legParents = new Set();
      records.forEach(r => { const p = getLinkedId(r.fields['Parent Order']); if (p) legParents.add(p); });
      INTL_ORDERS.legParents = legParents;
      _oiVisible = records.filter(r => !getLinkedId(r.fields['Parent Order']));
    }
    INTL_ORDERS.data = _oiVisible;
    INTL_ORDERS.selectedId = null;
    // Stops belong to the card now (_oiLoadCardStops): a fresh list forgets
    // the old ones so a reopened card reads them again.
    window._intlStopsByOrder = {};
    window._intlStopsFailed = {};
    INTL_ORDERS.namesReady = _intlLoadNames(records);
  return INTL_ORDERS.data;
}

// The names the rows show: fleet/partners/locations (ΑΝΑΘΕΣΗ, ΦΟΡΤΩΣΗ,
// ΠΑΡΑΔΟΣΗ read the reference preload), the location labels of the form and
// card, and the client names. Resolves to the warnings to show — never rejects:
// a failed part is SAID above the list (what is missing · what it does not mean).
async function _intlLoadNames(records) {
  const warns = [];
  if (typeof preloadReferenceData === 'function') {
    try { await preloadReferenceData(); }
    catch (e) { console.warn('orders_intl: ref data', e); warns.push(_OI_WARN_REF); }
  }
  try { await _loadLocations(); } catch (e) { console.warn('orders_intl: locations', e); warns.push(_OI_WARN_LOC); }
  const clientIds = [...new Set(records.map(r=>(r.fields['Client']||[])[0]).filter(Boolean))];
  try { await fhBatchResolveClients(clientIds); } catch (e) { console.warn('orders_intl: client names', e); }
  return warns;
}

// City/country of every location for the card's stop lines — the same single
// LOCATIONS read the reference preload makes (fhLocationRecords). Once.
async function _oiLoadLocMeta() {
  if (Object.keys(_oiLocMeta).length) return;
  (await fhLocationRecords()).forEach(l => {
    // One list everywhere (owner 5/9): resolve to the Greek name once here
    // so every reader of _oiLocMeta (the card's stop lines) gets it
    // for free, whatever spelling/code the location record still stores.
    const rawCountry = l.fields['Country'] || '';
    _oiLocMeta[l.id] = { name: l.fields['Name'] || '', city: l.fields['City'] || '',
      country: rawCountry && typeof countryName === 'function' ? countryName(rawCountry) : rawCountry };
  });
}

// The card's stops, read when the card opens (perf 29/9 — the list used to
// read every order's stops before its first row). One request: the order
// record already carries its stop ids. Repaints the card if it is still the
// one open; a failure is said IN the card, never shown as «no stops».
async function _oiLoadCardStops(rec) {
  const recId = rec.id;
  const ids = rec.fields['ORDER STOPS'] || [];
  try {
    const [recs] = await Promise.all([
      ids.length ? atGetAll(TABLES.ORDER_STOPS, { filterByFormula: `OR(${ids.map(id => `RECORD_ID()="${id}"`).join(',')})` }, false) : [],
      _oiLoadLocMeta().catch(e => console.warn('orders_intl: location meta', e)),
    ]);
    window._intlStopsByOrder[recId] = recs.filter(sr => getLinkedId(sr.fields[F.STOP_PARENT_ORDER]) === recId);
    delete window._intlStopsFailed[recId];
  } catch (e) {
    console.warn('orders_intl: card stops', e);
    window._intlStopsFailed[recId] = true;
  }
  if (INTL_ORDERS.selectedId !== recId) return;
  const panel = document.getElementById('intlDetail');
  if (!panel || panel.classList.contains('hidden')) return;
  const top = panel.scrollTop;
  panel.innerHTML = _oiCardHtml(rec);
  panel.scrollTop = top;
}

// Loader for the catalog: period = '60' | '180' | 'all' (same select as before).
async function loadOrdersIntlData(period) {
  if (period) _intlPeriod = period;
  await _intlLoad();
  _oiEnsureStyles();
  return { records: INTL_ORDERS.data, warns: _oiLoadWarns.slice(), legParents: INTL_ORDERS.legParents, namesReady: INTL_ORDERS.namesReady };
}

// Kept for its callers (form submit, delete, pre-order, scan, retry buttons):
// «redraw the international list» now means «redraw the Orders page» — or open
// it on the international scope when the user is elsewhere (as before: a save
// from another page used to land on this list).
function renderOrdersIntl() {
  if (typeof currentPage !== 'undefined' && currentPage === 'orders' && typeof OrdersHub !== 'undefined') return OrdersHub.refresh();
  return Promise.resolve(navigate('orders_intl'));
}

// After an in-place change to ONE order (pallet sheets): update that
// row on the Orders page and keep the card open — never repaint the old list
// container, which no longer exists (it would throw after the write succeeded).
function _intlRepaintOne(rec) {
  if (typeof OrdersCatalog !== 'undefined' && rec) OrdersCatalog.updateRecord('intl', rec);
}

// ─── Detail Panel (card, Figma 204:1395 · pattern w2-location-card 230:821) ──
function selectIntlOrder(recId) {
  INTL_ORDERS.selectedId = recId;
  document.querySelectorAll('#intlTable tbody tr').forEach(tr => tr.classList.remove('selected'));
  const row = document.getElementById('irow_'+recId); if (row) row.classList.add('selected');
  const rec = INTL_ORDERS.data.find(r => r.id === recId); if (!rec) return;
  const panel = document.getElementById('intlDetail');
  // Opening is the one animation of this screen (spec §1). A click on another
  // row while open only swaps content — the class does not change, so the
  // slide does not replay. Closed = display:none AND width 0 (the 482px lesson).
  panel.classList.remove('hidden');
  panel.innerHTML = _oiCardHtml(rec);
  panel.scrollTop = 0;
  if (!window._intlStopsByOrder || !window._intlStopsByOrder[recId]) {
    window._intlStopsByOrder = window._intlStopsByOrder || {}; window._intlStopsFailed = window._intlStopsFailed || {};
    _oiLoadCardStops(rec);
  }
}

function _oiCardHtml(rec, opts) {
  const f = rec.fields, recId = rec.id;
  // readOnly (Weekly Εθνικών → VS load, owner 14/9): forced no-edit even for
  // a role with full 'orders' access — only the Weekly Διεθνών edits a VS
  // order, so the floating card here never offers actions.
  const readOnly = !!(opts && opts.readOnly);
  const canEdit = !readOnly && can('orders') === 'full';
  // Δ2 (list, 3/9) applied to the card too (5/9): 'Order Number' never reaches
  // the browser, so the title printed six characters of the row id («QD3VYG»)
  // as if they were an order number. The Reference is the number the team
  // uses; without one the title is the client alone (the card body already
  // says «Reference — δεν έχει καταχωρηθεί»).
  const orderNo = escapeHtml(String(f['Reference'] || '').replace(/["']+/g, '').trim());
  // 'Order No' (7/9/2026): the Worker's new read-only field (Postgres row id)
  // shown next to the Reference — the comment above still stands for the
  // legacy 'Order Number', which remains derived and never reaches the browser.
  const orderNoNum = f['Order No'] ? `#${escapeHtml(String(f['Order No']))}` : '';
  const st = f['Status'] || 'Pending';
  // G-27 (impact map 4/10): a lot is «Delivered» when the WAREHOUSE received
  // it — «Παραδόθηκε» would read as delivered to the client. Same word as the
  // catalog and «Προς τιμολόγηση».
  // Round 1 O5 (critic-2 E2-04): once invoiced, a lot reads «Τιμολογήθηκε» —
  // «Στην αποθήκη» next to «✓ ΤΠΥ» said the goods never left.
  const isLot = typeof OrdersStock !== 'undefined' && OrdersStock.isLot(f);
  const stGr = isLot && OrdersCommon.isInvoiced(f) ? 'Τιμολογήθηκε'
    : isLot && st === 'Delivered' ? 'Στην αποθήκη' : ((_OI_STATUS[st] || {}).gr || st);
  // «Χωρίς ανάθεση» = no own truck AND no partner (owner 2/9). A partner load
  // IS assigned. Shown for every status: 15/89 delivered orders belong to
  // nobody and that gap must stay visible (DECISION_LOG 30/8).
  const pid = (f['Partner']||[])[0], tid = (f['Truck']||[])[0], did = (f['Driver']||[])[0];
  const unassigned = !tid && !pid;
  const pe = !!f['Pallet Exchange'], vs = !!f['Veroia Switch'];
  const chips = [
    `<span class="oi-chip">${escapeHtml(stGr)}</span>`,
    isPreorder(f) ? preorderChipHtml(f) : '',
    isLot ? '<span class="oi-chip">Παρτίδα → αποθήκη</span>' : '',
    pe ? '<span class="oi-chip">Ανταλλαγή παλετών</span>' : '',
    vs ? '<span class="oi-chip">Veroia Switch</span>' : '',
    f['National Groupage'] ? '<span class="oi-chip">Ομαδοποίηση</span>' : '',
    unassigned ? '<span class="oi-chip oi-chip-unassigned">Προς ανάθεση</span>' : '',
    f['High Risk Flag'] ? '<span class="oi-chip oi-chip-bad">Υψηλό ρίσκο</span>' : '',
  ].filter(Boolean).join('');
  const miss = '— δεν έχει καταχωρηθεί';
  const kv = (k, v, cls) => `<div class="oi-kv"><span class="k">${k}</span><span class="v${cls ? ' ' + cls : ''}">${v}</span></div>`;
  const kvm = (k, v, cls) => kv(k, v || miss, v ? (cls || '') : 'miss');
  const temp = f['Temperature °C'] != null ? escapeHtml(f['Temperature °C']) + ' °C' : '';
  const reefer = _OI_REEFER[f['Refrigerator Mode']] || f['Refrigerator Mode'] || '';
  const pal = _stopsTotalPallets(recId) || f['Total Pallets'];
  const gw = f['Gross Weight kg'];
  const hasPrice = f['Price'] !== null && f['Price'] !== undefined && f['Price'] !== '';
  let peV = 'Όχι', peCls = '';
  if (pe) {
    const pend = [];
    if (!f['Pallet Sheet 1 Uploaded']) pend.push('Δελτίο 1');
    if (vs && !f['Pallet Sheet 2 Uploaded']) pend.push('Δελτίο 2');
    peV = pend.length ? `Ναι — ${pend.join(' & ')} εκκρεμεί` : 'Ναι — δελτία καταχωρημένα';
    peCls = pend.length ? 'warn' : '';
  }
  const stopRow = (s, label) => {
    const l = _oiLocOf(s);
    const p = s.fields[F.STOP_PALLETS];
    return `<div class="oi-stop"><span class="d oi-num">${_oiDate(s.fields[F.STOP_DATETIME])}</span><span class="oi-stype">${label}</span><span class="n">${escapeHtml([l.name, l.city].filter(Boolean).join(', '))}</span><span class="q oi-num">${p ? escapeHtml(String(p)) + ' παλ.' : '—'}</span></div>`;
  };
  let route = _oiStops(recId, 'Loading').map(s => stopRow(s, 'Φόρτωση')).join('')
            + _oiStops(recId, 'Unloading').map(s => stopRow(s, 'Παράδοση')).join('');
  const stopsKnown = window._intlStopsByOrder && window._intlStopsByOrder[recId];
  if (!route && !readOnly && !stopsKnown) {
    // The card opened before its stops arrived (_oiLoadCardStops repaints),
    // or they failed — said here, not shown as an order without stops.
    route = (window._intlStopsFailed && window._intlStopsFailed[recId])
      ? `<div class="oi-stop"><span class="n">Οι στάσεις δεν φορτώθηκαν — δεν σημαίνει ότι δεν υπάρχουν. Κλείσε και ξαναάνοιξε την καρτέλα.</span></div>`
      : `<div class="oi-stop"><span class="n" style="color:var(--text-mid)">Φόρτωση στάσεων…</span></div>`;
  }
  if (!route) {
    // Pre-normalisation record: no ORDER_STOPS, only the legacy summary strings.
    route = `<div class="oi-stop"><span class="oi-stype">Φόρτωση</span><span class="n">${_cleanSummary(f['Loading Summary'])}</span></div>
             <div class="oi-stop"><span class="oi-stype">Παράδοση</span><span class="n">${_cleanSummary(f['Delivery Summary'])}</span></div>`;
  }
  let assign = '';
  if (pid) {
    const pr = (typeof getRefPartners==='function'?getRefPartners():[]).find(x=>x.id===pid);
    assign = kv('Συνεργάτης', escapeHtml(pr?.fields?.['Company Name'] || '—'))
           + (f['Partner Truck Plates'] ? kv('Πινακίδες', escapeHtml(f['Partner Truck Plates'])) : '');
  } else if (!unassigned) {
    const t = tid ? (typeof getRefTrucks==='function'?getRefTrucks():[]).find(x=>x.id===tid) : null;
    const d = did ? (typeof getRefDrivers==='function'?getRefDrivers():[]).find(x=>x.id===did) : null;
    assign = (t ? kv('Φορτηγό', escapeHtml(t.fields?.['License Plate']||'')) : '')
           + (d ? kv('Οδηγός', escapeHtml(d.fields?.['Full Name']||'')) : '');
  }
  const assignBody = unassigned ? '<div class="oi-note">Προς ανάθεση — η ανάθεση γίνεται στο Εβδομαδιαίο Διεθνών</div>' : assign;
  // Pre-order (owner 22/9): opening the order form on it IS the conversion —
  // the same button, named for what it does; the small form edits day/notes.
  const pre = isPreorder(f);
  const actions = canEdit ? [
    `<button type="button" class="oi-link" data-oi-act="edit" onclick="openIntlEdit('${recId}')">${pre ? 'Μετατροπή σε παραγγελία' : 'Επεξεργασία'}</button>`,
    pre ? `<button type="button" class="oi-link" data-oi-act="pre-edit" onclick="editPreorder('${recId}')">Επεξεργασία pre-order</button>` : '',
    _oiIsPiece(f) ? '' : `<button type="button" class="oi-link" data-oi-act="dup" onclick="duplicateIntlOrder('${recId}')">Διπλασιασμός</button>`,
    `<button type="button" class="oi-link oi-link-danger" data-oi-act="delete" title="Διαγραφή με cascade — NL/GL/CL/Ramp/Παλέτες" onclick="deleteIntlOrder('${recId}')">Διαγραφή</button>`,
  ].filter(Boolean).join('<span class="oi-sep">·</span>') : '';

  return `
    <div class="oi-card-head">
      <div class="oi-card-title"><span>${orderNo ? orderNo + ' · ' : ''}${_clientName(f)}</span><button type="button" class="oi-close" title="Κλείσιμο (Esc)" onclick="_oiCloseCard()">×</button></div>
      ${readOnly ? '<div class="oi-ro-note">Veroia Switch · μόνο ανάγνωση — επεξεργασία από το Weekly Διεθνών</div>' : ''}
      <div class="oi-card-sub">${escapeHtml(_OI_DIR_W[f['Direction']] || f['Direction'] || '—')} · W${escapeHtml(f['Week Number']||'—')} · ${escapeHtml(f['Brand']||'—')}</div>
      ${f['Reference'] ? `<div class="oi-card-sub">Ref (${escapeHtml(f['Reference'])})${orderNoNum ? ' · ' + orderNoNum : ''}</div>` : (orderNoNum ? `<div class="oi-card-sub">${orderNoNum}</div>` : '')}
      <div class="oi-chips">${chips}</div>
    </div>
    <div class="oi-sect"><div class="oi-sect-t">Στοιχεία</div>
      ${f['Reference'] ? '' : kvm('Reference', '')}
      ${kvm('Εμπόρευμα', f['Goods'] ? escapeHtml(f['Goods']) : '')}
      ${kvm('Θερμοκρασία', [temp, escapeHtml(reefer)].filter(Boolean).join(' · '))}
      ${kvm('Παλέτες', pal ? [escapeHtml(String(pal)), escapeHtml(f['Pallet Type']||'')].filter(Boolean).join(' · ') : '')}
      ${kvm('Μικτό βάρος', gw ? escapeHtml(Number(gw).toLocaleString('el-GR')) + ' kg' : '')}
      ${kv('Ανταλλαγή παλετών', peV, peCls)}
      ${f['Carrier Type'] ? kv('Μεταφορέας', escapeHtml(f['Carrier Type'])) : ''}
      ${_oiIsPiece(f) ? kv('Τιμή', 'στην παρτίδα ' + escapeHtml(OrdersStock.lotNumLabel(f)), 'miss') : kvm('Τιμή', hasPrice ? _oiMoney(f['Price']) : '')}
      ${_oiIsPiece(f)
        // O5 (critic-2 E2-05): a piece is never invoiced on its own — «Όχι»
        // stayed «Όχι» for ever, even after the lot's ΤΠΥ.
        ? kv('Τιμολογήθηκε', 'με την παρτίδα ' + escapeHtml(OrdersStock.lotNumLabel(f)), 'miss')
        : kv('Τιμολογήθηκε', f['Invoiced']
        ? ['Ναι', f['Invoice Number'] ? 'ΤΠΥ ' + escapeHtml(f['Invoice Number']) : '', f['Invoice Date'] ? new Date(f['Invoice Date']).toLocaleDateString('el-GR') : ''].filter(Boolean).join(' · ')
        : 'Όχι')}
    </div>
    <div class="oi-sect oi-sect-alt"><div class="oi-sect-t">Διαδρομή</div>${route}</div>
    ${pe ? `<div class="oi-sect"><div class="oi-sect-t">Δελτία παλετών</div>
      ${kv('Δελτίο 1', f['Pallet Sheet 1 Uploaded'] ? 'καταχωρημένο' : 'εκκρεμεί', f['Pallet Sheet 1 Uploaded'] ? '' : 'warn')}
      ${vs ? kv('Δελτίο 2 (cross-dock)', f['Pallet Sheet 2 Uploaded'] ? 'καταχωρημένο' : 'εκκρεμεί', f['Pallet Sheet 2 Uploaded'] ? '' : 'warn') : ''}
      <div class="oi-links"><button type="button" class="oi-link" onclick="navigate('pallet_ledger')">Ισοζύγιο παλετών →</button></div>
    </div>` : ''}
    <div class="oi-sect"><div class="oi-sect-t">Ανάθεση</div>${assignBody}
      <div class="oi-links"><button type="button" class="oi-link" onclick="navigate('weekly_intl')">άνοιγμα στο Εβδομαδιαίο Διεθνών →</button></div>
    </div>
    ${f['Notes'] ? `<div class="oi-sect oi-sect-alt"><div class="oi-sect-t">Σημειώσεις</div><div class="oi-text">${escapeHtml(f['Notes'])}</div></div>` : ''}
    <div class="oi-sect"><div class="oi-sect-t">Έγγραφα</div><div class="oi-links">${typeof OrderDocs !== 'undefined' ? OrderDocs.sectionHtml(recId, { canEdit }) : ''}</div></div>
    ${actions ? `<div class="oi-sect"><div class="oi-sect-t">Ενέργειες</div><div class="oi-links">${actions}</div></div>` : ''}`;
}

// Weekly Εθνικών → VS load: show the international order WITHOUT actions.
// Only the Weekly Διεθνών edits a VS order (owner 14/9). The Weekly page has
// no #intlDetail, so the card floats (fixed, right) — same markup, same CSS.
async function openIntlReadOnlyCard(recId) {
  let rec = INTL_ORDERS.data.find(r => r.id === recId);
  if (!rec) { try { rec = await atGetOne(TABLES.ORDERS, recId); } catch (e) { return; } } // atGetOne toasts + logs (403/404 heard)
  // The card's helpers assume the Διεθνείς Παραγγελίες page ran first: its
  // <style>, the form-helpers client map, the locations map and the
  // stops-by-order cache. On the Weekly page none of that exists — seen live
  // 14/9: unstyled card, title = id slice («pVxYar»), «Φόρτωση —». Load them
  // here; every failure degrades to what the card showed before, not silence.
  _oiEnsureStyles();
  const clientId = Array.isArray(rec.fields['Client']) ? rec.fields['Client'][0] : null;
  try { await Promise.all([fhLoadLocations(), clientId ? fhBatchResolveClients([clientId]) : null]); }
  catch (e) { console.warn('read-only card refs:', e.message); }
  try {
    window._intlStopsByOrder = window._intlStopsByOrder || {};
    if (!window._intlStopsByOrder[recId]) window._intlStopsByOrder[recId] = await stopsLoad(recId, F.STOP_PARENT_ORDER);
  } catch (e) { console.warn('read-only card stops:', e.message); }
  let panel = document.getElementById('intlDetail');
  if (!panel) {
    panel = document.createElement('div'); panel.id = 'intlDetail'; panel.className = 'entity-detail-panel oi-ro-float hidden'; document.body.appendChild(panel);
    // The router has no navigation hook: a floating card left open would ride
    // over the next page and clash with the Διεθνείς Παραγγελίες panel of the
    // same id (seen live 14/9). The first repaint of #content removes it.
    const main = document.getElementById('content');
    if (main) { const obs = new MutationObserver(() => { obs.disconnect(); panel.remove(); }); obs.observe(main, { childList: true }); }
  }
  panel.innerHTML = _oiCardHtml(rec, { readOnly: true });
  panel.classList.remove('hidden'); panel.scrollTop = 0;
}

// ─── Linked select widgets (delegates to core/form-helpers.js) ──
function _locSelect(id, currentId) { return fhLocSelect(id, currentId, 'fhLocDrop'); }
function _clientSelect(id, currentId, currentLabel) { return fhClientSelect(id, currentId, currentLabel, 'fhClientDrop'); }

// ─── Stop row HTML ───────────────────────────────
// type: 'l'=loading, 'u'=unloading
// stop 1 datetime field: 'Loading DateTime' / 'Delivery DateTime' (main fields)
// stop 2-10: 'Loading DateTime 2-10' / 'Unloading DateTime 1-10'
function _stopRow(type, i, locId, palVal, dtVal) {
  const req   = i===1 ? ' *' : '';
  // ✕ μόνο στα i>1 (owner 12/8): το πρώτο σημείο είναι υποχρεωτικό — αν δεν
  // το θες, αλλάζεις την τιμή του, δεν το σβήνεις. Ο spacer κρατά τη στοίχιση.
  const rm = i > 1
    ? `<button type="button" title="Αφαίρεση στάσης" onclick="_removeStop('${type}',${i})"
        style="height:38px;border:none;background:none;color:var(--text-mid);font-size:18px;cursor:pointer;padding:0">×</button>`
    : '<div></div>';
  return `<div id="stoprow_${type}_${i}" style="display:grid;grid-template-columns:1fr 100px 130px 24px;gap:8px;margin-bottom:8px;align-items:end">
    <div>
      <label class="form-label" style="font-size:11px">Τοποθεσία ${i}${req}</label>
      ${_locSelect(type+'_'+i, locId)}
    </div>
    <div>
      <label class="form-label" style="font-size:11px">Παλέτες${req}</label>
      <input class="form-input" type="number" id="pal_${type}_${i}" value="${palVal||''}" placeholder="0" min="0">
    </div>
    <div>
      <label class="form-label" style="font-size:11px">Ημερομηνία${req}</label>
      <input class="form-input" type="date" id="dt_${type}_${i}" value="${dtVal||''}">
    </div>
    ${rm}
  </div>`;
}

// ─── Modal ──────────────────────────────────────
// ─── Δ6 (3/9) · the starred fields that nothing enforced ────────────────────
// The form marks Τιμή, Θερμοκρασία, Λειτουργία ψυκτικού and Τύπο παλέτας with
// «*», but _vErrors only ever checked six OTHER fields — so the star was
// decoration. Measured: 15 of 110 orders carry no price at all.
//
// This does NOT hard-block. Two reasons, both operational: a price is often
// genuinely unknown at entry time (that is WHY 15 rows are empty), and a form
// that refuses to save at 06:00 stops the day's work — the same argument that
// keeps DELETE narrow and everything else wide (owner 23/8). So: first save
// paints the gaps in red, next to the field, and refuses once; pressing
// «Αποθήκευση» again saves exactly what the old code would have saved. Nothing
// about the request body changes. Turning this into a hard block is a one-line
// change and an owner decision, not ours.
const _OI_REQ_SOFT = [
  { id: 'f_Price',      label: 'Τιμή (€)' },
  // «Χωρίς ψύξη» is a legitimate answer that leaves the temperature empty on
  // purpose — demanding a number there would invent data.
  { id: 'f_Temp',       label: 'Θερμοκρασία °C', skip: () => document.getElementById('f_ReeferMode')?.value === 'No temp' },
  { id: 'f_ReeferMode', label: 'Λειτουργία ψυκτικού' },
  { id: 'f_PalletType', label: 'Τύπος παλέτας' },
];
let _oiReqAck = '';   // the exact set of gaps the user has already been shown

function _oiCheckSoftRequired() {
  document.querySelectorAll('#modal .oi-req-msg').forEach(n => n.remove());
  document.querySelectorAll('#modal .oi-req-bad').forEach(n => n.classList.remove('oi-req-bad'));
  const missing = [];
  for (const r of _OI_REQ_SOFT) {
    const el = document.getElementById(r.id);
    if (!el || (r.skip && r.skip())) continue;
    if (String(el.value == null ? '' : el.value).trim() !== '') continue;
    missing.push(r.label);
    el.classList.add('oi-req-bad');
    const msg = document.createElement('div');
    msg.className = 'oi-req-msg';
    msg.textContent = 'Υποχρεωτικό — δεν συμπληρώθηκε';
    el.insertAdjacentElement('afterend', msg);
  }
  const key = missing.join('|');
  if (!missing.length) { _oiReqAck = ''; return null; }
  if (_oiReqAck === key) return null;   // already shown, already re-submitted
  _oiReqAck = key;
  document.querySelector('#modal .oi-req-bad')?.scrollIntoView({ block: 'center' });
  return missing;
}

function openIntlCreate() { _openModal(null, {}); }
function openIntlEdit(recId) {
  const rec = INTL_ORDERS.data.find(r=>r.id===recId);
  if (rec) _openModal(recId, rec.fields);
}

// Feedback dispatcher (19/5): επαναλαμβανόμενες φορτώσεις ίδιου πελάτη
// (LABIDINO Δευ/Τετ/Παρ) → νέα φόρμα προσυμπληρωμένη από υπάρχον order.
// Καθαρίζονται τα ανά-δρομολόγιο πεδία (αναθέσεις, αριθμοί, status).
async function duplicateIntlOrder(recId) {
  let f = INTL_ORDERS.data.find(r=>r.id===recId)?.fields;
  if (!f && window.WINTL) {
    const w = (WINTL.data.exports||[]).find(r=>r.id===recId) || (WINTL.data.imports||[]).find(r=>r.id===recId);
    f = w && w.fields;
  }
  if (!f) { toast('Δεν βρέθηκε η παραγγελία', 'warn'); return; }
  // 057: a copy of a PIECE would be an ordinary import from the warehouse —
  // no «Stock Lot» (the submit builds fields from the form), so it draws
  // pallets the stock never sees, asks for a price and is invoiced a second
  // time next to its lot. A new piece starts where the stock is counted.
  if (_oiIsPiece(f)) { toast('Νέο κομμάτι: από τη λωρίδα ΑΠΟΘΕΜΑ του Weekly Διεθνών (δεξί κλικ στο φορτηγό → «+ Κομμάτι από απόθεμα…»)', 'warn'); return; }
  // The stock labels never travel: a copy of a lot is a new order that becomes
  // a lot only by its own «Παρτίδα» tick.
  const skip = new Set(['Order Number','Week Number','ORDER STOPS','Status','Truck','Trailer','Driver',
    'Partner','Is Partner Trip','Partner Rate','Partner Truck Plates','Matched Import ID',
    'NATIONAL ORDERS','Group ID','Created','Last Modified',
    'Stock Lot','Own Stock Lot','Stock Lot Order No','Stock Lot Source']);
  const copy = {};
  for (const k of Object.keys(f)) if (!skip.has(k)) copy[k] = f[k];
  let stopsPre = null;
  try {
    const st = await stopsLoad(recId, F.STOP_PARENT_ORDER);
    if (st.length) stopsPre = st.map(s => ({ fields: { ...s.fields } }));
  } catch(e) {}
  closeModal();
  await _openModal(null, copy, null, stopsPre);
  // G-13 (impact map 4/10): the stock labels never travel, so the copy of a
  // lot is an ordinary order to the warehouse — invoiced as such at intake if
  // nobody ticks «Παρτίδα». Said once, where the form is open.
  if (typeof OrdersStock !== 'undefined' && OrdersStock.isLot(f)) {
    showErrorToast('Το αντίγραφο ΔΕΝ είναι παρτίδα — τσέκαρε «Παρτίδα» αν πρέπει', 'warn', 10000);
  }
}

async function _openModal(recId, f, _clientLabelOverride, _scanPrefill, _piece) {
  INTL_ORDERS._createdId = null; // a fresh modal never inherits a previous attempt's order
  INTL_ORDERS._markPending = null; // nor a lot mark that failed in another one
  // Bug 11/8: από το Weekly η φόρμα άνοιγε ΠΡΙΝ φορτωθούν οι τοποθεσίες
  // (το init της σελίδας Orders δεν έχει τρέξει) → η αναζήτηση έδειχνε κενά.
  try { await fhLoadLocations(); } catch(e) { console.warn('locations preload:', e.message); }
  const isEdit = !!recId;
  // Pre-order (owner 22/9): editing one IS converting it — one door, the
  // normal form with its six required fields; the save clears 'Ops Status'
  // on the same id (submitIntlOrder). Set per opened modal, never inherited.
  INTL_ORDERS._preConvert = (isEdit && isPreorder(f)) ? recId : null;
  INTL_ORDERS._preConvertCountry = !!(INTL_ORDERS._preConvert && f['Destination Country']);
  // Stock lots (057): piece / lot context of THIS modal (never inherited).
  const SK = INTL_ORDERS._stock = await _oiStockCtx(recId, f, _piece);
  const _isPiece = SK.mode === 'pieceNew' || SK.mode === 'pieceEdit';
  if (SK.mode === 'pieceNew') {
    // The lot decides client, direction and the one loading stop (= the
    // warehouse); the scan-prefill path draws that stop like any other.
    const g = SK.lot.fields || {};
    // PR-06: goods / temperature / reefer / pallet type of the lot's source.
    const cargo = await _oiLotCargo(SK);
    f = Object.assign({}, f, cargo || {}, { Client: [g['Client Rec']], Direction: 'Import' });
    _clientLabelOverride = g['Client Name'] || _clientLabelOverride;
    const ld = SK.presets.loadingDate || '', dd = SK.presets.deliveryDate || '';
    _scanPrefill = { loadStops: [{ fields: { [F.STOP_LOCATION]: [g['Warehouse Rec']], [F.STOP_PALLETS]: '', [F.STOP_DATETIME]: ld } }] };
    if (dd) _scanPrefill.unloadStops = [{ fields: { [F.STOP_DATETIME]: dd } }];
  }
  const clientId = Array.isArray(f['Client']) ? f['Client'][0] : '';
  const clientLabel = _clientLabelOverride || (clientId ? (await _resolveClientName(clientId)) : '');

  // ── Try loading ORDER_STOPS (new normalized data) ──
  let _orderStops = [];
  INTL_ORDERS._stopsFail = null;
  if (isEdit) {
    try { _orderStops = await stopsLoad(recId, F.STOP_PARENT_ORDER); }
    catch(e) { INTL_ORDERS._stopsFail = recId; console.warn('stopsLoad:', e); }
  }
  let _loadStops = _orderStops.filter(s => s.fields[F.STOP_TYPE]==='Loading').sort((a,b) => (a.fields[F.STOP_NUMBER]||0)-(b.fields[F.STOP_NUMBER]||0));
  let _unloadStops = _orderStops.filter(s => s.fields[F.STOP_TYPE]==='Unloading').sort((a,b) => (a.fields[F.STOP_NUMBER]||0)-(b.fields[F.STOP_NUMBER]||0));

  // Scan prefill: if creating a new order from a scan, use the scan-derived stops
  // (synthesized into the same shape as ORDER_STOPS records).
  if (!isEdit && _scanPrefill) {
    if (_scanPrefill.loadStops?.length)   _loadStops   = _scanPrefill.loadStops;
    if (_scanPrefill.unloadStops?.length) _unloadStops = _scanPrefill.unloadStops;
  }

  // Count filled stops from ORDER_STOPS
  let cntL = Math.max(1, _loadStops.length);
  let cntU = Math.max(1, _unloadStops.length);
  window._sCntL = cntL;
  window._sCntU = cntU;

  const buildStopRows = (type) => {
    const isL  = type==='l';
    const stopsOfType = isL ? _loadStops : _unloadStops;

    let html = '';
    if (stopsOfType.length) {
      for (let i = 0; i < stopsOfType.length; i++) {
        const sf = stopsOfType[i].fields;
        const locArr = sf[F.STOP_LOCATION];
        const locId = Array.isArray(locArr) ? locArr[0] : '';
        const dt = sf[F.STOP_DATETIME] ? toLocalDate(sf[F.STOP_DATETIME]) : '';
        html += _stopRow(type, i + 1, locId, sf[F.STOP_PALLETS], dt);
      }
    } else {
      // New order or no stops — single empty row
      html += _stopRow(type, 1, '', '', '');
    }
    return html;
  };

  // Value/label ΧΩΡΙΣΤΑ (παγίδα Φ1): το value είναι ΤΙΜΗ ΒΑΣΗΣ και δεν μεταφράζεται ποτέ.
  const opt = (arr, cur) => arr.map(o=>{const v=Array.isArray(o)?o[0]:o, l=Array.isArray(o)?o[1]:o; return `<option value="${v}" ${f[cur]===v?'selected':''}>${l}</option>`;}).join('');

  let body = `
    <div class="form-grid cols-3">
      <!-- Owner 11/8: Brand/Type αφαιρέθηκαν — δεδομένα Petras Group / International -->
      <!-- Figma 165:676: πρώτη γραμμή σε 3 στήλες (Κατεύθυνση/Πελάτης/Τιμή) -->
      <div class="form-field">
        <label class="form-label">Κατεύθυνση *</label>
        <select class="form-select" id="f_Direction"${_isPiece ? ' disabled title="Κομμάτι από απόθεμα = εισαγωγή από την αποθήκη"' : ''}><option value="">— Επιλογή —</option>
          ${opt([['Export','Εξαγωγή'],['Import','Εισαγωγή']],'Direction')}</select>
      </div>
      <div class="form-field" onfocusout="_oiWhWarn()">
        <label class="form-label">Πελάτης *</label>
        ${_clientSelect('client', clientId, clientLabel)}
      </div>
      ${_isPiece ? `<div class="form-field">
        <label class="form-label">Τιμή (€)</label>
        <div class="form-input oi-locked" title="Τιμολογείται η παρτίδα — το κομμάτι δεν έχει δική του τιμή">στην παρτίδα ${escapeHtml(_oiPieceLotLabel(SK, f))}</div>
      </div>` : `<div class="form-field">
        <label class="form-label">Τιμή (€) *</label>
        <input class="form-input" type="number" id="f_Price" value="${f['Price']||''}">
      </div>`}
    </div>
    <div class="form-grid">
      <div class="form-field">
        <label class="form-label">Reference</label>
        <input class="form-input" type="text" id="f_Reference" value="${escapeHtml(f['Reference']||'')}" placeholder="π.χ. 3813">
      </div>
      <div class="form-field">
        <label class="form-label">Εμπόρευμα</label>
        <input class="form-input" type="text" id="f_Goods" value="${escapeHtml(f['Goods']||'')}" placeholder="π.χ. Φρέσκα λαχανικά">
      </div>
      <div class="form-field">
        <label class="form-label">Μικτό βάρος (kg)</label>
        <input class="form-input" type="number" id="f_GrossWeight" value="${f['Gross Weight kg']||''}">
      </div>
      <div class="form-field">
        <label class="form-label">Θερμοκρασία °C *</label>
        <input class="form-input" type="number" id="f_Temp" value="${f['Temperature °C']!=null?f['Temperature °C']:''}">
      </div>
      <div class="form-field">
        <label class="form-label">Λειτουργία ψυκτικού *</label>
        <select class="form-select" id="f_ReeferMode"><option value="">— Επιλογή —</option>
          ${opt([['Continuous','Συνεχής (Continuous)'],['Start-Stop','Start-Stop'],['No temp','Χωρίς ψύξη']],'Refrigerator Mode')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Τύπος παλέτας *</label>
        <!-- 'Euro' removed (coordinator 15/9, Παντελής: «EUR και Euro — ποιο
             είναι για ευρωπαλέτες;»): one value, 'EUR' (148 rows vs 1 'Euro',
             fixed by the owner's SQL). An order still holding 'Euro' shows
             «— Επιλογή —» here and the save skips the field — nothing erased. -->
        <select class="form-select" id="f_PalletType" onchange="peSyncPalletType('f',this.value)"><option value="">— Επιλογή —</option>
          ${opt(['EUR','CHEP','Industrial'],'Pallet Type')}</select>
      </div>
      ${_isPiece ? `<div class="form-field">
        <label class="form-label">Ανταλλαγή παλετών (PE)</label>
        <div class="form-input oi-locked" title="Η ανταλλαγή παλετών μετρά μία φορά, στη φόρτωση της παρτίδας από τον πελάτη">όχι — μετρά στη φόρτωση της παρτίδας</div>
      </div>` : peChoiceHtml('f', f, isEdit)}
    </div>
    <div style="display:flex;gap:24px;margin:16px 0;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="f_HighRisk" ${f['High Risk Flag']?'checked':''} style="width:15px;height:15px">
        ⚠ Υψηλό ρίσκο</label>
      <label id="oiVsLbl" style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="f_VeroiaSwitch" ${f['Veroia Switch']?'checked':''} style="width:15px;height:15px">
        Veroia Switch</label>
      ${_oiLotTickHtml(SK)}
      <!-- Hidden, not removed (4/10, before the first national dispatcher): ticked
           on a Veroia Switch order it deleted the national leg with its truck and
           queued it where nobody works, under «συγχρονίστηκε ✓» (0/253 use it).
           The input stays so the save keeps the stored value — removing it would
           write false and run the «groupage OFF» cleanup on every edit. -->
      <label style="display:none">
        <input type="checkbox" id="f_Groupage" ${f['National Groupage']?'checked':''}>
        National Groupage</label>
    </div>

    ${_oiLotSectionHtml(SK)}
    <div style="padding-top:16px;border-top:1px solid var(--border)">
      <div class="detail-section-title" style="margin-bottom:12px">Στάσεις φόρτωσης</div>
      <div id="stops_l" oninput="_oiLotPallets();_oiBalanceUpdate();_oiWhWarn()" onfocusout="_oiWhWarn()">${buildStopRows('l')}</div>
      <button type="button" class="btn btn-ghost" id="btn_addL"
        style="font-size:12px;padding:4px 12px" onclick="_addStop('l')"
        ${cntL>=10?'style="display:none"':''}>+ Προσθήκη στάσης φόρτωσης</button>
    </div>

    <div style="padding-top:16px;border-top:1px solid var(--border);margin-top:24px">
      <div class="detail-section-title" style="margin-bottom:12px">Στάσεις παράδοσης</div>
      <div id="stops_u" oninput="_oiBalanceUpdate()">${buildStopRows('u')}</div>
      <button type="button" class="btn btn-ghost" id="btn_addU"
        style="font-size:12px;padding:4px 12px" onclick="_addStop('u')"
        ${cntU>=10?'style="display:none"':''}>+ Προσθήκη στάσης παράδοσης</button>
      <div id="oiBalance" class="oi-balance"></div>
    </div>

    <div style="padding-top:16px;border-top:1px solid var(--border);margin-top:24px">
      <div class="form-field span-2">
        <label class="form-label">Σημειώσεις</label>
        <textarea class="form-textarea" id="f_Notes" rows="3" placeholder="Ειδικές οδηγίες, απαιτήσεις ρυμούλκας, επαφές…" style="width:100%;resize:vertical;min-height:60px">${escapeHtml(f['Notes']||'')}</textarea>
      </div>
    </div>`;

  // G-29: «Παράλειψη →» belongs to the scan queue's own forms — a piece form
  // opened from the Weekly in the middle of a queue would otherwise skip a scan.
  const footer = `
    ${isEdit&&SK.mode!=='pieceEdit'?`<button class="btn btn-ghost" title="Νέα παραγγελία με ίδια στοιχεία — αλλάζεις μόνο ημερομηνίες (π.χ. LABIDINO Δευ/Τετ/Παρ)" onclick="duplicateIntlOrder('${recId}')">Διπλασιασμός</button>`:''}
    ${(!isEdit&&SK.mode!=='pieceNew'&&window._scanQueue&&window._scanQueue.length)?`<button class="btn btn-ghost" title="Προσπέρασε αυτό το σκαν χωρίς αποθήκευση" onclick="closeModal();_scanQueueNext()">Παράλειψη → (${window._scanQueue.length} ακόμη)</button>`:''}
    <button class="btn btn-ghost" onclick="closeModal()">Άκυρο</button>
    <button class="btn btn-success" id="btnSubmit" onclick="submitIntlOrder('${recId||''}')">Αποθήκευση</button>`;

  document.getElementById('modal').style.maxWidth = '760px';
  _oiEnsureStyles();  // the form opens from the Weekly too, before this page has rendered
  _oiReqAck = '';     // Δ6: each opened form earns its own acknowledgement
  if (INTL_ORDERS._stopsFail === recId && recId) {
    body = `<div class="oi-banner oi-banner-bad" style="margin-bottom:12px">
      ⚠ Οι στάσεις της παραγγελίας ΔΕΝ φορτώθηκαν. Τα σημεία φόρτωσης και παράδοσης παρακάτω είναι κενά επειδή απέτυχε η ανάγνωση — <u>όχι επειδή δεν υπάρχουν</u>.
      Η αποθήκευση είναι κλειδωμένη ώστε να μη σβηστούν. Κλείσε, κάνε Ανανέωση και ξαναδοκίμασε.
    </div>` + body;
  }
  if (INTL_ORDERS._preConvert) body = preorderConvertBand(f) + body;
  body = _oiStockBandHtml(SK, f) + body;
  const _title = SK.mode === 'pieceNew' ? _oiPieceTitle(SK)
    : SK.mode === 'pieceEdit' ? 'Επεξεργασία κομματιού από απόθεμα'
    : INTL_ORDERS._preConvert ? 'Μετατροπή pre-order σε παραγγελία' : isEdit ? 'Επεξεργασία παραγγελίας' : 'Νέα διεθνής παραγγελία';
  openModal(_title, body, footer);
  peSyncPalletType('f', document.getElementById('f_PalletType')?.value || '');
  // A pre-order has no ORDER STOPS, so stop 1 opened with an empty date and the
  // day already agreed with the client would have to be typed again.
  if (INTL_ORDERS._preConvert && f['Loading DateTime']) {
    const dl = document.getElementById('dt_l_1');
    if (dl && !dl.value) dl.value = toLocalDate(f['Loading DateTime']);
  }
  _oiStockAfterOpen(SK);
  _oiBalanceUpdate();
}

// Display-only pallet balance (Figma 165:676). Mirrors the existing
// non-blocking warning at submit; it blocks nothing and writes nothing —
// gating «Αποθήκευση» on it is NOT approved (ΑΝΟΙΧΤΟ, παρτίδα 3). 33 = the
// truck capacity the scan preview already checks against.
function _oiBalanceUpdate() {
  const el = document.getElementById('oiBalance'); if (!el) return;
  const sum = t => Array.from({ length: 10 }, (_, i) => parseFloat(document.getElementById(`pal_${t}_${i+1}`)?.value) || 0).reduce((a, b) => a + b, 0);
  const L = sum('l'), U = sum('u');
  const parts = [];
  if (L > 0 && U > 0 && L !== U) parts.push(`<span class="oi-bal oi-bal-bad">Ισοζύγιο: φόρτωση ${L} ≠ παράδοση ${U} — ${L > U ? 'λείπουν' : 'περισσεύουν'} ${Math.abs(L - U)} παλέτες</span>`);
  if (L > 0) parts.push(`<span class="oi-bal ${L > 33 ? 'oi-bal-bad' : 'oi-bal-warn'}">Γέμισμα φορτηγού ${L}/33</span>`);
  el.innerHTML = parts.join('');
}

function _addStop(type) {
  const cntKey = type==='l' ? '_sCntL' : '_sCntU';
  const curr   = window[cntKey]||1;
  if (curr >= 10) return;
  const next = curr + 1;
  window[cntKey] = next;
  const wrap = document.getElementById('stops_'+type);
  const div  = document.createElement('div');
  div.innerHTML = _stopRow(type, next, '', '', '');
  wrap.appendChild(div.firstElementChild);
  if (next >= 10) document.getElementById('btn_add'+(type==='l'?'L':'U')).style.display='none';
  _oiBalanceUpdate();
}

// Owner 12/8: «αν κατά λάθος προσθέσω ένα έξτρα, δεν υπάρχει επιλογή να το
// ακυρώσω». Ο μετρητής _sCnt ΔΕΝ μειώνεται: οι δείκτες είναι μοναδικοί ανά
// φόρμα, αλλιώς νέο add θα ξαναχρησιμοποιούσε δείκτη σβησμένης γραμμής και
// θα μάζευε ορφανές τιμές. Το submit προσπερνά τα κενά και επαναριθμεί.
function _removeStop(type, i) {
  document.getElementById(`stoprow_${type}_${i}`)?.remove();
  const btn = document.getElementById('btn_add'+(type==='l'?'L':'U'));
  if (btn) btn.style.display = '';
  _oiBalanceUpdate();
}

// ═══════════════════════════════════════════════════════════════════════════
// Stock lots (migration 057, owner 3–4/10/2026 — plan stock-lots-v5 §5.4)
// A LOT = an order whose one destination is a warehouse, marked by a STOCK
// LOTS row (second write, after the order save). A PIECE = an ordinary import
// FROM that warehouse, linked by «Stock Lot», with no price and no PE. Every
// rule lives in the base (stock_guard_* + CHECKs) and comes back as a Greek
// 422; what follows only mirrors it so the form does not invite a refusal.
// ═══════════════════════════════════════════════════════════════════════════
// A stock piece? (the card and «Διπλασιασμός» run before any modal context)
function _oiIsPiece(f) { return typeof OrdersStock !== 'undefined' && OrdersStock.isPiece(f); }
// The stock context of one opened modal:
//   mode     'none' | 'pieceNew' (openIntlPieceCreate) | 'pieceEdit' | 'lotEdit'
//   lot      the STOCK LOTS record (null when not read — failed says so)
//   section  show the «Παρτίδα» checkbox (switch on + a role that may mark)
//   wasLot   the order is already a lot · frozen: its intake was Delivered
//   src*     what the base judges when the order is MARKED (G-14 mirror)
//   partner  the order's partner when the form opened (OWNER-Q2 note)
async function _oiStockCtx(recId, f, piece) {
  f = f || {};
  const sk = { mode: 'none', lot: null, lotRec: null, failed: false, presets: {}, section: false, wasLot: false, frozen: false, ownPallets: 0,
    srcInvoiced: !!f['Invoiced'], srcLeg: !!getLinkedId(f['Parent Order']), partner: getLinkedId(f['Partner']) || '' };
  if (typeof OrdersStock === 'undefined') return sk;
  if (piece && !recId) {
    Object.assign(sk, { mode: 'pieceNew', lot: piece.lot, lotRec: piece.lot.id, presets: piece.presets || {} });
    return sk;
  }
  if (recId && OrdersStock.isPiece(f)) {
    Object.assign(sk, { mode: 'pieceEdit', lotRec: OrdersStock.lotRecOfPiece(f), ownPallets: Number(f['Total Pallets']) || 0 });
  } else if (recId && OrdersStock.isLot(f)) {
    // Screen mirror of lot_frozen: the lot's pallets lock when its intake is
    // Delivered (old.status = 'Delivered' in the guard) — only «Κλείσιμο
    // υπολοίπου» lowers them after that.
    // The warehouse IS the order's destination 1 (never stored twice).
    Object.assign(sk, { mode: 'lotEdit', wasLot: true, lotRec: OrdersStock.lotRecOfLot(f), frozen: f['Status'] === 'Delivered', whRec: getLinkedId(f['Unloading Location 1']) || '' });
  }
  if (sk.lotRec) {
    const res = OrdersStock._rec(sk.lotRec) ? await OrdersStock.loadLots(`RECORD_ID()='${sk.lotRec}'`) : { ok: false };
    if (res.ok && res.lots && res.lots[0]) sk.lot = res.lots[0]; else sk.failed = true;
  }
  // G-10: the «Παρτίδα» box exists only on an ordinary order and on a lot —
  // never on a piece (new or edited): ticked there it would save the piece INTO
  // a warehouse and the mark would be refused (lot_is_piece).
  // OWNER-Q5 default (4/10, impact map G-30): the tick is offered on a new
  // order and on one not yet Delivered — an order already delivered into a
  // warehouse is not marked after the fact. An existing lot keeps its box.
  sk.section = OrdersStock.on() && OrdersStock.canWrite()
    && (sk.mode === 'lotEdit' || (sk.mode === 'none' && (!recId || f['Status'] !== 'Delivered')));
  return sk;
}
function _oiPieceLotLabel(SK, f) {
  return SK.mode === 'pieceNew' ? OrdersStock.lotLabel(SK.lot) : OrdersStock.lotNumLabel(f);
}
function _oiPieceTitle(SK) {
  const g = (SK.lot && SK.lot.fields) || {};
  return `Κομμάτι από απόθεμα · ${g['Warehouse Name'] || 'αποθήκη'} · διαθέσιμα ${Number(g['Remaining Pallets']) || 0}p`;
}
function _oiStockBandHtml(SK, f) {
  if (!SK) return '';
  // PR-17: filled by _oiWhWarn when loading stop 1 is a partner warehouse.
  const whWarn = '<div id="oiWhWarn" class="oi-banner oi-banner-warn" role="status" style="display:none;margin-bottom:12px"></div>';
  if (SK.mode === 'none') return whWarn;
  const g = (SK.lot && SK.lot.fields) || {}, n = v => Number(v) || 0, e = escapeHtml;
  const warn = '<div id="oiPieceWarn" class="oi-banner oi-banner-warn" role="status" style="display:none;margin-bottom:12px"></div>';
  if (SK.mode === 'lotEdit') {
    if (!SK.lot) return '<div class="oi-banner oi-banner-bad" style="margin-bottom:12px">Η παρτίδα αυτής της παραγγελίας δεν διαβάστηκε — το υπόλοιπο δεν φαίνεται. Οι κανόνες της ισχύουν στη βάση· ξαναδοκίμασε με Ανανέωση.</div>' + whWarn;
    return _oiLotBandHtml(SK) + whWarn;
  }
  if (SK.mode === 'pieceEdit') {
    const tail = SK.lot ? ` · διαθέσιμα ${n(g['Remaining Pallets'])}p στην αποθήκη` : SK.failed ? ' — η παρτίδα δεν διαβάστηκε· το όριο παλετών το ελέγχει η βάση' : '';
    return `<div class="oi-banner" style="margin-bottom:12px">Κομμάτι της παρτίδας ${e(OrdersStock.lotNumLabel(f))}${e(tail)}</div>` + warn;
  }
  // pieceNew: the lot's cargo could not be read → the fields start empty, and
  // the form says why (PR-06) instead of looking like a lot without goods.
  const cargo = SK.cargoFailed
    ? `<div class="oi-banner oi-banner-warn" id="oiCargoNote" role="status" style="margin-bottom:12px">Τα στοιχεία φορτίου της παρτίδας δεν διαβάστηκαν (${e(SK.cargoFailed)}) — συμπλήρωσε εμπόρευμα, θερμοκρασία, λειτουργία ψυκτικού και τύπο παλέτας.</div>`
    : '';
  return cargo + warn;
}
// The lot band of an existing lot. A closed lot shows its close (round 1 O2)
// and, for owner/dispatcher while not invoiced, «Άνοιγμα ξανά» (O1, critic-1
// C1-04 / critic-2 E2-01) — the way back that used to need SQL.
function _oiLotBandHtml(SK) {
  const g = (SK.lot && SK.lot.fields) || {}, n = v => Number(v) || 0, e = escapeHtml;
  const closed = OrdersStock.closedLine(SK.lot);
  const reopen = closed && OrdersStock.reopenable(SK.lot)
    ? ` <button type="button" class="btn btn-ghost btn-sm" id="oiLotReopen" onclick="_oiLotReopen()">Άνοιγμα ξανά</button>` : '';
  return `<div class="oi-banner" id="oiLotBand" style="margin-bottom:12px">Παρτίδα ${e(OrdersStock.lotLabel(SK.lot))} · υπόλοιπο ${n(g['Remaining Pallets'])}/${n(g['Stock Pallets'])}p · ${n(g['Pieces'])} κομμάτια (${n(g['Pieces Delivered'])} παραδόθηκαν)${closed ? `<small id="oiLotClosed">${e(closed)}${reopen}</small>` : ''}${SK.frozen ? '<small>Οι παλέτες κλείδωσαν με την παραλαβή στην αποθήκη — μείωση μόνο με «Κλείσιμο υπολοίπου».</small>' : ''}</div>`;
}
// The read-back decides (OrdersStock.reopenLot); the band is repainted from
// the lot record the base returned. No confirm: reversible by closing again,
// and a confirmAction would draw over the form being edited.
async function _oiLotReopen() {
  const SK = INTL_ORDERS._stock;
  if (!SK || !SK.lot || !OrdersStock.reopenable(SK.lot)) return;
  const b = document.getElementById('oiLotReopen'); if (b) { b.disabled = true; b.textContent = 'Άνοιγμα…'; }
  const res = await OrdersStock.reopenLot(SK.lot.id);
  if (!res.ok) {
    // D2 (round 1): a refusal of the base is already on screen (core/api.js).
    showErrorToast(res.shown ? 'Η παρτίδα ΔΕΝ άνοιξε — μένει κλειστή' : 'Η παρτίδα ΔΕΝ άνοιξε: ' + res.error, res.shown ? 'warn' : 'error', 10000);
    if (b) { b.disabled = false; b.textContent = 'Άνοιγμα ξανά'; }
    return;
  }
  SK.lot = res.lot;
  const band = document.getElementById('oiLotBand');
  if (band) band.outerHTML = _oiLotBandHtml(SK);
  if (typeof OrdersData !== 'undefined') OrdersData.invalidate();
  toast('Η παρτίδα ' + escapeHtml(OrdersStock.lotLabel(res.lot)) + ' άνοιξε ξανά — περιμένει κομμάτια');
}
// Round 1 O6 (critic-5 S5-03): the lot is ONE checkbox in the flags row, next
// to «⚠ Υψηλό ρίσκο» and «Veroia Switch» — the grey box with three nouns sat
// on every new international order for a rare case. The warehouse select
// opens only when ticked (#oiLotBox below).
function _oiLotTickHtml(SK) {
  if (!SK || !SK.section) return '';
  return `<label class="oi-lot-ck" title="Παρτίδα σε αποθήκη συνεργάτη — απόθεμα που βγαίνει σε κομμάτια"><input type="checkbox" id="f_StockLot" ${SK.wasLot ? 'checked' : ''} onchange="_oiLotToggle()"> Παρτίδα</label>`;
}
function _oiLotSectionHtml(SK) {
  if (!SK || !SK.section) return '';
  return `<div class="oi-lot" id="oiLotBox"${SK.wasLot ? '' : ' style="display:none"'}>
      <div id="oiLotWh" class="oi-lot-wh"${SK.wasLot ? '' : ' style="display:none"'}>
        <label class="form-label" for="f_StockWh">Αποθήκη *</label>
        <select class="form-select" id="f_StockWh" onchange="_oiLotApply()"><option value="">Φόρτωση αποθηκών…</option></select>
        <div class="oi-lot-hint" id="oiLotHint">Η παρτίδα έχει έναν προορισμό: την αποθήκη</div>
      </div>
      <div id="oiLotOff" class="oi-lot-off" style="display:none">Με την «Αποθήκευση» η παραγγελία παύει να είναι παρτίδα. Η βάση το αρνείται αν έχουν ήδη βγει κομμάτια ή αν τιμολογήθηκε.</div>
    </div>`;
}

// Lock a linked picker (client / location): read-only and no dropdown. The
// handlers are kept on the element so a lot that is unticked gets them back.
function _oiLockLink(id, title) {
  const s = document.getElementById('ls_' + id);
  if (!s) return;
  if (!s._oiH) s._oiH = { oninput: s.oninput, onfocus: s.onfocus, title: s.title };
  s.readOnly = true; s.oninput = null; s.onfocus = null; s.title = title; s.classList.add('oi-locked');
}
function _oiUnlockLink(id) {
  const s = document.getElementById('ls_' + id);
  if (!s || !s._oiH) return;
  s.readOnly = false; s.oninput = s._oiH.oninput; s.onfocus = s._oiH.onfocus; s.title = s._oiH.title;
  s.classList.remove('oi-locked'); delete s._oiH;
}

function _oiStockAfterOpen(SK) {
  if (!SK) return;
  if (SK.mode === 'pieceNew' || SK.mode === 'pieceEdit') {
    _oiLockLink('client', 'Ο πελάτης του κομματιού είναι ο πελάτης της παρτίδας');
    // The one loading stop is the warehouse. A piece whose stops are empty
    // gets it from the lot; an empty stop is never locked (it could not be
    // filled, and the save requires it).
    const wh = SK.lot && SK.lot.fields['Warehouse Rec'];
    const lv = document.getElementById('lv_l_1'), ls = document.getElementById('ls_l_1');
    if (lv && !lv.value && wh) fhPickLinked('l_1', wh, _fhLocationsMap[wh] || SK.lot.fields['Warehouse Name'] || '');
    else if (ls && lv && lv.value && !ls.value && SK.lot) ls.value = SK.lot.fields['Warehouse Name'] || '';
    if (lv && lv.value) _oiLockLink('l_1', 'Το κομμάτι φορτώνει μόνο από την αποθήκη της παρτίδας');
    document.getElementById('btn_addL')?.remove();
    // Mirror only: the base decides (over_draw, with the live remainder —
    // another dispatcher may have drawn since this form opened).
    const pal = document.getElementById('pal_l_1');
    if (pal && SK.lot) {
      pal.max = String((Number(SK.lot.fields['Remaining Pallets']) || 0) + (SK.mode === 'pieceEdit' ? SK.ownPallets : 0));
      pal.title = 'Διαθέσιμα στην αποθήκη: ' + pal.max;
    }
    const dt = document.getElementById('dt_l_1');
    if (dt) {
      if (SK.mode === 'pieceNew' && SK.presets.lockLoadingDate) { dt.readOnly = true; dt.title = 'Η ημέρα φόρτωσης του φορτηγού'; }
      dt.addEventListener('change', _oiPieceWarn);
    }
    _oiPieceWarn();
  }
  if (SK.frozen) {
    for (let i = 1; i <= 10; i++) {
      const el = document.getElementById('pal_l_' + i);
      if (el) { el.readOnly = true; el.title = 'Οι παλέτες κλείδωσαν με την παραλαβή — μείωση μόνο με Κλείσιμο υπολοίπου'; }
    }
    // A new or removed loading stop changes the pallets just the same.
    document.getElementById('btn_addL')?.remove();
    document.querySelectorAll('#stops_l button[title="Αφαίρεση στάσης"]').forEach(b => b.remove());
  }
  // G-31: the warehouse list is read when it is needed — an existing lot shows
  // its warehouse at once; an ordinary order reads it on the first tick.
  if (SK.section && SK.wasLot) _oiLoadWarehouses((SK.lot && SK.lot.fields['Warehouse Rec']) || SK.whRec || document.getElementById('lv_u_1')?.value || '');
  // OWNER-Q1: an existing lot opens without Veroia Switch.
  if (SK.mode === 'lotEdit') _oiLotVs(true);
  _oiWhWarn();
}

// PR-06 (impact map 4/10): a piece carries the goods of its lot. The driver
// sheet prints °C, reefer mode, goods and pallet type from the PIECE, so a
// piece form that starts empty can send a reefer load out with no temperature
// on paper. One read of the lot's source order (its «Order» link); a failure
// leaves the fields empty and says so on the form (SK.cargoFailed) — never a
// silent blank. Pre-filled only: the dispatcher may change any of them.
async function _oiLotCargo(SK) {
  const src = getLinkedId(SK.lot.fields['Order']);
  if (!src) { SK.cargoFailed = 'η παρτίδα δεν δείχνει σε παραγγελία'; return null; }
  try {
    const rec = await atGetOne(TABLES.ORDERS, src);
    const sf = (rec && rec.fields) || {}, out = {};
    // Absent = empty on the source (facade trap #2), not a failure.
    for (const k of ['Goods', 'Temperature °C', 'Refrigerator Mode', 'Pallet Type']) if (sf[k] != null && sf[k] !== '') out[k] = sf[k];
    return out;
  } catch (e) {
    SK.cargoFailed = OrdersStock._msg(e);
    return null;
  }
}

// G-31 (impact map 4/10): the Partner-Warehouse list is read on first need —
// the «Παρτίδα» tick (the PR-17 warning reads the open lots since round 1
// O6) — and kept for ten minutes, not read on every form open. A failure is not cached: the next
// need asks again. → { recs } or { recs: null, error }.
let _oiPwCache = null;
function _oiPartnerWarehouses() {
  if (_oiPwCache && Date.now() - _oiPwCache.at < 600000) return _oiPwCache.p;
  const p = atGetAll(TABLES.LOCATIONS, { filterByFormula: "{Type}='Partner Warehouse'", fields: ['Name', 'City', 'Country', 'Type'] })
    .then(recs => ({ recs }), e => { console.error('orders intl: warehouses', e); _oiPwCache = null; return { recs: null, error: e }; });
  _oiPwCache = { at: Date.now(), p };
  return p;
}

// The OPEN lots (Complete = 0), read on first need and kept two minutes —
// the PR-17 warning asks on every loading-stop / client change. A failure is
// not cached (the next need asks again) and shows no warning: the warning is
// a hint, the base still refuses a priced order drawn from nothing.
let _oiOpenLotsCache = null;
function _oiOpenLots() {
  if (_oiOpenLotsCache && Date.now() - _oiOpenLotsCache.at < 120000) return _oiOpenLotsCache.p;
  const p = OrdersStock.loadOpen().then(r => { if (!r.ok) _oiOpenLotsCache = null; return r; });
  _oiOpenLotsCache = { at: Date.now(), p };
  return p;
}
// PR-17 / G-15 (impact map 4/10): an ordinary import typed or scanned «from
// the warehouse» is a priced order — invoiced next to its lot, while the
// warehouse stock never sees its pallets. Non-blocking: a warehouse can also
// be an ordinary pickup. Only with the switch on (before go-live the ΑΠΟΘΕΜΑ
// it points to does not exist) and never on a piece form, which loads there
// by definition.
// Round 1 O6 (critic-5 S5-03): only when an OPEN lot of THIS client sits at
// that warehouse — the 20-word bar showed on every ordinary pickup at any
// warehouse. ≤ 12 words. No client chosen yet → nothing to compare, no bar.
async function _oiWhWarn() {
  const el = document.getElementById('oiWhWarn'), SK = INTL_ORDERS._stock;
  if (!el || !SK || SK.mode === 'pieceNew' || SK.mode === 'pieceEdit' || typeof OrdersStock === 'undefined' || !OrdersStock.on()) return;
  const loc = document.getElementById('lv_l_1')?.value || '';
  const cli = document.getElementById('lv_client')?.value || '';
  if (!loc || !cli) { el.style.display = 'none'; return; }
  const res = await _oiOpenLots();
  // The modal closed, or the stop / client changed, while the lots were on their way.
  if (!el.isConnected || (document.getElementById('lv_l_1')?.value || '') !== loc || (document.getElementById('lv_client')?.value || '') !== cli) return;
  const hit = !!(res.ok && res.lots.some(l => l.fields['Client Rec'] === cli && l.fields['Warehouse Rec'] === loc));
  el.textContent = hit ? 'Υπάρχει παρτίδα αυτού του πελάτη εδώ — κομμάτι; από το ΑΠΟΘΕΜΑ' : '';
  el.style.display = hit ? '' : 'none';
}

// OWNER-Q1 default (4/10, impact map PR-09/G-23): no Veroia Switch on a lot.
// A lot ends in a warehouse abroad; a VS leg would print «deliver to Veroia»
// on the partner sheet and create a national load for goods that never come
// to Greece. Hidden and unticked while «Παρτίδα» is ticked and on a lot edit;
// unticking the lot gives back what was there. Pieces keep VS (a real import
// via Veroia). The submit forces it false too (_vs in submitIntlOrder).
function _oiLotVs(lot) {
  const cb = document.getElementById('f_VeroiaSwitch'), lbl = document.getElementById('oiVsLbl');
  if (!cb || !lbl) return;
  if (lot) {
    if (cb._oiPrev === undefined) cb._oiPrev = cb.checked;
    cb.checked = false; lbl.style.display = 'none';
  } else {
    if (cb._oiPrev !== undefined) { cb.checked = cb._oiPrev; delete cb._oiPrev; }
    lbl.style.display = '';
  }
}

// G-14: the legs of an existing order (no_split counts a PARENT as well as a
// leg). → { ok, n } or { ok:false, error } — a failed read is said, never 0.
async function _oiLegsOf(recId) {
  if (!OrdersStock._rec(recId)) return { ok: false, error: 'μη έγκυρη παραγγελία' };
  try {
    const recs = await atGetAll(TABLES.ORDERS, { filterByFormula: `FIND("${recId}",ARRAYJOIN({Parent Order},","))>0` }, false);
    return { ok: true, n: recs.length };
  } catch (e) { return { ok: false, error: OrdersStock._msg(e) }; }
}

// Non-blocking (contract §5.4): a piece may be planned before the warehouse
// intake is marked, but the dispatcher is told.
function _oiPieceWarn() {
  const SK = INTL_ORDERS._stock, el = document.getElementById('oiPieceWarn');
  if (!el || !SK || !SK.lot) return;
  const g = SK.lot.fields || {};
  const recv = g['Received On'] ? toLocalDate(g['Received On']) : '';
  const ld = document.getElementById('dt_l_1')?.value || '';
  let msg = '';
  // Round 1 O7 (critic-1 C1-10): one sentence, one fact — «δεν παραλήφθηκε …
  // — παραλήφθηκε» read as a contradiction at 06:00. What it means: the
  // loading day is before the warehouse intake.
  const dm = ymd => ymd.slice(8, 10) + '/' + ymd.slice(5, 7);
  if (g['Intake Delivered'] !== true) msg = 'Η παρτίδα δεν έχει παραληφθεί ακόμη στην αποθήκη.';
  else if (recv && ld && ld < recv) msg = `Φόρτωση ${dm(ld)} πριν από την παραλαβή στην αποθήκη (${dm(recv)}) — έλεγξε την ημέρα.`;
  el.textContent = msg;
  el.style.display = msg ? '' : 'none';
}

// Φ1 (Ε2): the screen offers partner warehouses ABROAD only; the base accepts
// every warehouse kind from day one — later phases open only this list.
async function _oiLoadWarehouses(currentId) {
  const sel = document.getElementById('f_StockWh');
  if (!sel) return;
  sel.dataset.loaded = '1';       // one read per form, however often it is ticked
  const recs = (await _oiPartnerWarehouses()).recs;
  if (!sel.isConnected) return;   // the modal closed meanwhile
  const opts = [];
  for (const r of recs || []) {
    const cc = typeof countryCode === 'function' ? countryCode(r.fields['Country']) : null;
    if (!cc || cc === 'GR') continue;
    opts.push({ id: r.id, label: [r.fields['Name'], [r.fields['City'], cc].filter(Boolean).join(' ')].filter(Boolean).join(' · ') });
  }
  opts.sort((a, b) => a.label.localeCompare(b.label));
  // An existing lot keeps its warehouse in the list even when Φ1 would not offer it.
  if (currentId && !opts.some(o => o.id === currentId)) opts.unshift({ id: currentId, label: _fhLocationsMap[currentId] || 'τρέχουσα αποθήκη' });
  sel.innerHTML = `<option value="">${recs ? '— Επιλογή αποθήκης —' : '— η λίστα δεν φορτώθηκε —'}</option>`
    + opts.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`).join('');
  sel.value = currentId || '';
  const hint = document.getElementById('oiLotHint');
  if (hint && !recs) { hint.textContent = 'Η λίστα αποθηκών δεν φορτώθηκε — κλείσε και ξανάνοιξε τη φόρμα. Δεν σημαίνει ότι δεν υπάρχουν αποθήκες.'; hint.classList.add('bad'); }
  else if (hint && !opts.length) hint.textContent = 'Καμία αποθήκη συνεργάτη στο εξωτερικό (τοποθεσία τύπου «Partner Warehouse»).';
  _oiLotApply();
}

function _oiLotToggle() {
  const on = !!document.getElementById('f_StockLot')?.checked;
  const wasLot = !!(INTL_ORDERS._stock && INTL_ORDERS._stock.wasLot);
  const wrap = document.getElementById('oiLotBox'); if (wrap) wrap.style.display = on || wasLot ? '' : 'none';
  const box = document.getElementById('oiLotWh'); if (box) box.style.display = on ? '' : 'none';
  const off = document.getElementById('oiLotOff');
  if (off) off.style.display = !on && wasLot ? '' : 'none';
  _oiLotVs(on);
  const sel = document.getElementById('f_StockWh');
  if (on && sel && !sel.dataset.loaded) _oiLoadWarehouses('');   // G-31: first tick reads the list
  if (on) _oiLotApply(); else _oiLotRelease();
}
// One destination = the warehouse (lot_multi_dest / warehouse_rule in the
// base); its pallets = everything loaded. Nothing is touched until a
// warehouse is chosen, so an accidental tick loses no stop.
function _oiLotApply() {
  if (!document.getElementById('f_StockLot')?.checked) return;
  const sel = document.getElementById('f_StockWh');
  const wh = sel ? sel.value : '';
  if (!wh) return;
  for (let i = 2; i <= 10; i++) document.getElementById('stoprow_u_' + i)?.remove();
  const add = document.getElementById('btn_addU'); if (add) add.style.display = 'none';
  _oiUnlockLink('u_1');
  fhPickLinked('u_1', wh, _fhLocationsMap[wh] || (sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : ''));
  _oiLockLink('u_1', 'Ο προορισμός της παρτίδας είναι η αποθήκη — αλλάζει από την επιλογή «Αποθήκη»');
  const pu = document.getElementById('pal_u_1'); if (pu) { pu.readOnly = true; pu.title = 'Όσες φορτώθηκαν'; pu.classList.add('oi-locked'); }
  _oiLotPallets();
  _oiBalanceUpdate();
}
function _oiLotRelease() {
  _oiUnlockLink('u_1');
  const add = document.getElementById('btn_addU'); if (add) add.style.display = '';
  const pu = document.getElementById('pal_u_1'); if (pu) { pu.readOnly = false; pu.title = ''; pu.classList.remove('oi-locked'); }
  _oiBalanceUpdate();
}
function _oiLotPallets() {
  if (!document.getElementById('f_StockLot')?.checked || !document.getElementById('f_StockWh')?.value) return;
  const pu = document.getElementById('pal_u_1'); if (!pu) return;
  const sum = Array.from({ length: 10 }, (_, i) => parseFloat(document.getElementById(`pal_l_${i + 1}`)?.value) || 0).reduce((a, b) => a + b, 0);
  pu.value = sum ? String(sum) : '';
}

// Second write of a lot (the STOCK LOTS row needs the saved order). On a
// refusal the order IS saved: red message, modal kept open, and the next
// «Αποθήκευση» retries only the mark (submitIntlOrder → _markPending).
async function _oiMarkLot(orderId, ctx) {
  const res = await OrdersStock.markLot(orderId);
  if (res.ok) {
    INTL_ORDERS._markPending = null; INTL_ORDERS._markPendingCtx = null;
    // OWNER-Q2 default (4/10, impact map G-25): a lot on our own truck is
    // allowed, but Ε1 splits the lot's NET (price − partner cost) over the
    // pieces — without a partner there is no intake cost to split from, so the
    // intake trip keeps the whole price. Said, not refused.
    if (ctx && !ctx.partner) showErrorToast('Χωρίς συνεργάτη αποθήκης: δεν γίνεται επιμερισμός εσόδου στα κομμάτια', 'warn', 10000);
    return true;
  }
  INTL_ORDERS._markPending = orderId; INTL_ORDERS._markPendingCtx = ctx;
  const formOpen = !!document.getElementById('f_StockLot');
  // «Ξανά» re-sends ONLY the mark, never the form's edits: a refusal fixed in
  // the form (e.g. 0 pallets) needs the order saved again first — say how.
  // The DB's own reason is already on screen when res.shown (round-1 K3, D2):
  // this line says only what happened and what to do, not the reason twice.
  // No «(ο λόγος παραπάνω)»: the toasts stack upwards, so the reason sat BELOW.
  showErrorToast('Η παραγγελία αποθηκεύτηκε, αλλά ΔΕΝ έγινε παρτίδα' + (res.shown ? '' : ': ' + res.error)
    + (formOpen ? ' — «Ξανά» ξαναστέλνει μόνο τη σήμανση· αν πρέπει να αλλάξεις κάτι στη φόρμα: Άκυρο → άνοιξε ξανά την παραγγελία.'
                : ' — άνοιξε την παραγγελία, τσέκαρε «Παρτίδα» και πάτησε Αποθήκευση.'), 'error', 12000);
  const b = document.getElementById('btnSubmit');
  if (b) { b.textContent = 'Ξανά: σήμανση παρτίδας'; b.disabled = false; }
  return false;
}

// New piece from a lot (Weekly «+ Κομμάτι από απόθεμα…», the shelf panel).
// lot = STOCK LOTS record; presets = {groupId?, truck?, trailer?, driver?,
// status?, loadingDate?, deliveryDate?, lockLoadingDate?, context?}. The
// payload is the normal form + OrdersStock.pieceFields — never a price.
async function openIntlPieceCreate(lot, presets) {
  if (!lot || !lot.id || !lot.fields || typeof OrdersStock === 'undefined') { toast('Η παρτίδα δεν βρέθηκε — ανανέωσε τη σελίδα', 'warn'); return; }
  return _openModal(null, {}, null, null, { lot, presets: presets || {} });
}

// ─── Submit ─────────────────────────────────────

// ═══════════════════════════════════════════════════════
// Veroia Switch → sync directly to NAT_LOADS (v2)
// Called after every ORDERS create/update
// VS ON  → create/update NAT_LOADS (Source Type='VS')
// VS OFF → delete NAT_LOADS (VS) + GL + CL + RAMP cascade
// ═══════════════════════════════════════════════════════

// Date helpers for VS date calculations
function _vsToLocalDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function _vsAddDays(dateStr, days) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// Semaphore: prevent concurrent VS syncs on the same order
const _syncingOrders = new Set();

async function _syncVeroiaSwitch(orderId, fields) {
  if (_syncingOrders.has(orderId)) {
    if (typeof showErrorToast === 'function') showErrorToast('Sync already in progress for this order', 'warn');
    else console.warn('VS sync already in progress for', orderId);
    return;
  }
  _syncingOrders.add(orderId);

  // Track created records for rollback on failure
  const _createdIds = []; // { table, id }

  // Suppress undo tracking for internal cascade operations
  if (typeof _atSuppressUndo !== 'undefined') _atSuppressUndo = true;

  try {
  const veroiaSwitch = fields[F.VEROIA_SWITCH];
  const direction    = fields['Direction'];
  const isIntl       = fields['Type'] === 'International';

  _tmsLog('_syncVeroiaSwitch called:', {orderId, veroiaSwitch, direction, isIntl});
  if (!isIntl) { _tmsLog('SKIP: not intl'); return; }

  const _lid = v => (v && typeof v === 'object' && v.id) ? v.id : (typeof v === 'string' ? v : null);

  // ── Find existing NAT_LOADS for this ORDERS record (identified by Source Record) ──
  const existingNL = await atGetAll(TABLES.NAT_LOADS, {
    filterByFormula: `{Source Record}="${orderId}"`,
    fields: ['Name','Direction'],
  }, false);
  _tmsLog('existing VS NAT_LOADS:', existingNL.length);

  // ── Legacy NAT_ORDERS cleanup (v1.0 migration) — field may not exist, catch silently ──
  let legacyNO = [];
  try {
    legacyNO = await atGetAll(TABLES.NAT_ORDERS, {
      filterByFormula: `FIND("${orderId}",ARRAYJOIN({Linked Order},","))>0`,
      fields: ['Linked Order'],
    }, false);
  } catch(e) { _tmsLog('Legacy NAT_ORDERS lookup skipped (field not found):', e?.message||e); }

  // ══════════════════════════════════════════════
  // VS OFF → FULL CLEANUP
  // ══════════════════════════════════════════════
  if (!veroiaSwitch) {
    _tmsLog('VS OFF → cleanup');

    // 1. Delete NAT_LOADS linked to this order
    for (const nl of existingNL) {
      try { await atDelete(TABLES.NAT_LOADS, nl.id); }
      catch(e) { console.warn('NL VS delete:', e); }
    }

    // 2. Delete GL + NAT_ORDER + CL + NL created by _syncGrpFromIntl
    // _deleteGrpForIntl handles the full cascade correctly (finds NAT_ORDER via JS filter)
    try { await _deleteGrpForIntl(orderId); }
    catch(e) { console.warn('GRP cleanup on VS OFF:', e); showErrorToast('Οι γραμμές groupage δεν ελευθερώθηκαν — δεν σβήστηκε τίποτα. Έλεγξε το Weekly National.', 'warn', 9000); }

    // 3. Delete RAMP records linked to the INTL ORDER
    try {
      const intlRamps = await atGetAll(TABLES.RAMP, {
        filterByFormula: `FIND("${orderId}",ARRAYJOIN({Order},","))>0`,
        fields: ['Plan Date']
      }, false);
      for (const rp of intlRamps) await atDelete(TABLES.RAMP, rp.id);
    } catch(e) { console.warn('RAMP intl cleanup:', e); }

    // 4. Reset flag on parent order
    await atPatch(TABLES.ORDERS, orderId, {'National Order Created': false});
    invalidateCache(TABLES.NAT_ORDERS);
    invalidateCache(TABLES.GL_LINES);
    invalidateCache(TABLES.NAT_LOADS);
    return;
  }

  const ngroupage = !!fields['National Groupage'];

  // ══════════════════════════════════════════════
  // VS ON + GRP ON → GL lines only, no Direct NL
  // NAT_LOADS will be created by Pick Ups (Groupage type)
  // ══════════════════════════════════════════════
  if (ngroupage) {
    // If GRP was previously OFF, a Direct NL may exist — delete it
    for (const nl of existingNL) {
      try { await atDelete(TABLES.NAT_LOADS, nl.id); }
      catch(e) { console.warn('NL Direct cleanup (switched to GRP ON):', e); }
    }
    // Sync GL lines anchored to auto-created NAT_ORDER
    try {
      await _syncGrpFromIntl(orderId, fields);
      // Flag only set on SUCCESS: _syncGroupageLines now rethrows on failure
      // (it used to swallow, so this line ran even when GL sync had failed).
      await atPatch(TABLES.ORDERS, orderId, {'National Order Created': true});
    }
    catch(e) {
      // Surface to the user (was gated-log only, invisible in prod) and mark
      // the parent NOT created so the state is truthful and prompts a re-save.
      // Retry is safe: _syncGroupageLines adopts existing GLs by location
      // (existMap), so a partial create heals on the next save.
      if (typeof reportError === 'function') reportError('Ο συγχρονισμός groupage απέτυχε, αποθήκευσε ξανά την παραγγελία', e, 'warn');
      logError(e, 'intl GRP sync (VS+GRP)');
      try { await atPatch(TABLES.ORDERS, orderId, {'National Order Created': false}); }
      catch(e2) { logError(e2, 'intl GRP sync: reset National Order Created'); }
    }
    invalidateCache(TABLES.NAT_LOADS);
    return; // finally block still runs (_syncingOrders.delete)
  }

  // ══════════════════════════════════════════════
  // VS ON + GRP OFF → Create/Update Direct NAT_LOADS
  // ══════════════════════════════════════════════
  _tmsLog('VS ON → sync NAT_LOADS (Direct)');

  // Clean up legacy NAT_ORDERS if any exist (migration path)
  for (const no of legacyNO) {
    try {
      // Delete NL records linked to this NO
      const nlsNO = await atGetAll(TABLES.NAT_LOADS, {filterByFormula:`{Source Record}="${no.id}"`,fields:['Name']},false);
      for (const nl of nlsNO) await atDelete(TABLES.NAT_LOADS, nl.id);
      // Delete the NO itself
      await atDelete(TABLES.NAT_ORDERS, no.id);
      _tmsLog('Cleaned up legacy NO:', no.id);
    } catch(e) { console.warn('Legacy NO cleanup:', e); }
  }

  // Build location arrays from ORDER_STOPS (sole source of truth)
  const pickupLocs = [];
  const delivLocs  = [];

  const _vsStops = await stopsLoad(orderId, F.STOP_PARENT_ORDER);
  // C13 fix: guard against null/empty stops — VS sync would create NAT_LOADS
  // with empty location arrays, producing unusable records downstream.
  if (!Array.isArray(_vsStops) || _vsStops.length === 0) {
    if (typeof toast === 'function') toast('Ο συγχρονισμός VS παραλείφθηκε — δεν βρέθηκαν στάσεις για την παραγγελία', 'error');
    if (typeof logError === 'function') logError(new Error(`VS sync: no stops for order ${orderId}`), 'orders_intl._syncVSDirect');
    return;
  }
  if (direction === 'Export') {
    // ΑΝΟΔΟΣ: supplier(s) → Veroia
    _vsStops.filter(s => s.fields[F.STOP_TYPE] === 'Loading')
      .sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0))
      .forEach(s => { const loc = (s.fields[F.STOP_LOCATION]||[])[0]; if (loc) pickupLocs.push(loc); });
    delivLocs.push(F.VEROIA_LOC);
  } else {
    // ΚΑΘΟΔΟΣ: Veroia → client(s)
    pickupLocs.push(F.VEROIA_LOC);
    _vsStops.filter(s => s.fields[F.STOP_TYPE] === 'Unloading')
      .sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0))
      .forEach(s => { const loc = (s.fields[F.STOP_LOCATION]||[])[0]; if (loc) delivLocs.push(loc); });
  }

  // Calculate National leg dates
  // Export (ΑΝΟΔΟΣ): natLoad = intlLoad, natDel = intlLoad + 1
  // Import (ΚΑΘΟΔΟΣ): natLoad = intlDel - 1, natDel = intlDel
  // 9/9 (owner: «Λάβδας / ΑΒ-Αντζουλάτος-Foodlink, ημερομηνίες λάθος»): the
  // Cross-Dock day is ONE column, `cross_dock_date` (locked decision 23/8;
  // label «Cross-dock Date», and «VS CD Date» once the Worker maps it as a
  // synonym). The +1/−1 estimate is the FALLBACK, not the rule — using it here
  // while the board showed the real column produced two different Cross-Dock
  // days for the same load. A cross-dock that no longer fits the order's dates
  // (e.g. delivery moved before it) is stale and the estimate wins.
  let natLoadDt = null, natDelDt = null;
  const _cd = _vsToLocalDate(fields['Cross-dock Date'] || fields['VS CD Date'] || '');
  if (direction === 'Export') {
    const localLoad = _vsToLocalDate(fields['Loading DateTime']);
    natLoadDt = localLoad;
    natDelDt  = (_cd && _cd > localLoad) ? _cd : _vsAddDays(localLoad, 1);
  } else {
    const localDel = _vsToLocalDate(fields['Delivery DateTime']);
    natDelDt  = localDel;
    natLoadDt = (_cd && _cd < localDel) ? _cd : _vsAddDays(localDel, -1);
  }

  // Resolve client name for the Name field
  let clientName = '';
  try {
    const cArr = fields['Client'];
    const cId = Array.isArray(cArr) ? _lid(cArr[0]) : null;
    if (cId) clientName = _fhClientsMap[cId] || (await _resolveClientName(cId)) || '';
  } catch(e) { logError(e, 'orders_intl resolve client name for VS'); }

  // Build NAT_LOADS fields
  const nlDirection = direction === 'Export' ? F.CL_ANODOS : F.CL_KATHODOS;
  const nlFields = {
    'Name':              `${clientName || 'VS Order'} — ${natLoadDt || ''}`,
    'Direction':         nlDirection,
    'Source Type':       'Direct',
    'Source Record':     orderId,
    'Source Orders':     orderId,
    'Client':            clientName,
    'Goods':             fields['Goods'] || '',
    'Temperature C':     fields['Temperature °C'] ?? null,
    'Total Pallets':     _vsStops.filter(s => s.fields[F.STOP_TYPE] === 'Loading')
                           .reduce((sum, s) => sum + (s.fields[F.STOP_PALLETS] || 0), 0)
                           || fields['Total Pallets'] || 0,
    'Pallet Exchange':   !!fields['Pallet Exchange'],
    'Reference':         fields['Reference'] || '',
    'Loading DateTime':  natLoadDt ? natLoadDt + 'T12:00:00.000Z' : null,
    'Delivery DateTime': natDelDt ? natDelDt + 'T12:00:00.000Z' : null,
    'Status':            'Pending',
  };

  // Pickup locations 1-N
  pickupLocs.forEach((id, i) => {
    nlFields['Pickup Location '+(i+1)] = [id];
  });
  // Delivery locations 1-N
  delivLocs.forEach((id, i) => {
    nlFields['Delivery Location '+(i+1)] = [id];
  });

  // Duplicate prevention: update if exists, create if not
  let nlId = null;
  if (existingNL.length > 0) {
    // Don't overwrite Status if it was changed by dispatcher
    delete nlFields['Status'];
    const upd = await atPatch(TABLES.NAT_LOADS, existingNL[0].id, nlFields);
    if (upd?.error) reportError('Σφάλμα ενημέρωσης NAT_LOADS — δοκιμάστε ξανά', upd.error);
    else nlId = existingNL[0].id;
    _tmsLog('NAT_LOADS updated:', nlId);
  } else {
    const cre = await atCreate(TABLES.NAT_LOADS, nlFields);
    if (cre?.error) {
      reportError('Σφάλμα δημιουργίας NAT_LOADS — δοκιμάστε ξανά', { error: cre.error, fields: nlFields });
    } else {
      nlId = cre.id;
      _createdIds.push({ table: TABLES.NAT_LOADS, id: cre.id });
      await atPatch(TABLES.ORDERS, orderId, {'National Order Created': true});
      _tmsLog('NAT_LOADS created:', nlId);
    }
  }

  // Write ORDER_STOPS for the NAT_LOADS record (national leg stops)
  if (nlId) {
    const _nlStops = [];
    const _totalPal = _vsStops.filter(s => s.fields[F.STOP_TYPE] === 'Loading')
      .reduce((sum, s) => sum + (s.fields[F.STOP_PALLETS] || 0), 0);
    const _loadDtISO = natLoadDt ? natLoadDt + 'T12:00:00.000Z' : null;
    const _delDtISO  = natDelDt  ? natDelDt  + 'T12:00:00.000Z' : null;
    const _clientId = Array.isArray(fields['Client']) ? (_lid(fields['Client'][0])) : null;
    const _goods = fields['Goods'] || null;
    const _temp  = fields['Temperature °C'] ?? null;
    const _ref   = fields['Reference'] || null;

    pickupLocs.forEach((locId, i) => {
      // Distribute pallets from INTL stops if available, else equal split
      let pals = _totalPal;
      if (direction === 'Export' && _vsStops.length) {
        const loadStop = _vsStops.filter(s => s.fields[F.STOP_TYPE] === 'Loading')[i];
        if (loadStop) pals = loadStop.fields[F.STOP_PALLETS] || 0;
      }
      _nlStops.push({ stopNumber: i+1, stopType: 'Loading', locationId: locId,
        pallets: pals, dateTime: _loadDtISO, clientId: _clientId, goods: _goods, temp: _temp, ref: _ref });
    });
    // 9/9: a multi-drop import keeps each drop's own day on the national leg
    // (ΑΒ 14/9, Αντζουλάτος 15/9…) — but only while the stops agree with the
    // order (first drop = the order's delivery day). After a board/Daily Ops
    // date change the stops can lag the order (migration 028 makes them follow);
    // until then every drop takes the order's day rather than a stale one.
    const _unl = _vsStops.filter(s => s.fields[F.STOP_TYPE] === 'Unloading')
      .sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0));
    const _stopsAgree = direction === 'Import' && _unl.length
      && _vsToLocalDate(_unl[0].fields[F.STOP_DATETIME] || '') === natDelDt;
    delivLocs.forEach((locId, i) => {
      let pals = _totalPal, dt = _delDtISO;
      if (direction === 'Import' && _vsStops.length) {
        const unloadStop = _unl[i];
        if (unloadStop) pals = unloadStop.fields[F.STOP_PALLETS] || 0;
        if (_stopsAgree && unloadStop && unloadStop.fields[F.STOP_DATETIME])
          dt = _vsToLocalDate(unloadStop.fields[F.STOP_DATETIME]) + 'T12:00:00.000Z';
      }
      _nlStops.push({ stopNumber: i+1, stopType: 'Unloading', locationId: locId,
        pallets: pals, dateTime: dt, clientId: _clientId, goods: _goods, temp: _temp, ref: _ref });
    });
    if (_nlStops.length) {
      try { await stopsSave(nlId, _nlStops, F.STOP_PARENT_NL); }
      catch(e) { console.warn('NL ORDER_STOPS write error:', e); }
    }
  }

  // GRP OFF → delete any auto-created NAT_ORDER + its GL + CL + NL
  try { await _deleteGrpForIntl(orderId); }
  catch(e) { console.warn('GL cleanup (grp OFF):', e); showErrorToast('Οι γραμμές groupage δεν ελευθερώθηκαν — δεν σβήστηκε τίποτα. Έλεγξε το Weekly National.', 'warn', 9000); }

  invalidateCache(TABLES.NAT_LOADS);

  } catch (err) {
    // Rollback: delete all records created during this sync.
    // Track orphaned records so user is informed if cleanup partially fails.
    const rollbackFailed = [];
    for (const item of _createdIds.reverse()) {
      try {
        await atDelete(item.table, item.id);
      } catch(e) {
        rollbackFailed.push({ table: item.table, id: item.id, err: e && e.message });
        console.error('[orders_intl] Rollback delete failed:', item.table, item.id, e && e.message);
      }
    }
    if (rollbackFailed.length && typeof logError === 'function') {
      logError(new Error(`VS rollback left ${rollbackFailed.length} orphan record(s): ${JSON.stringify(rollbackFailed)}`), 'vs_rollback_orphan');
    }
    const msg = rollbackFailed.length
      ? `VS sync failed; rollback left ${rollbackFailed.length} orphan(s) — check Error Log`
      : 'VS sync failed and was rolled back';
    if (typeof showErrorToast === 'function') showErrorToast(msg, 'error');
    else console.error(msg, err);
    throw err;
  } finally {
    _syncingOrders.delete(orderId);
    if (typeof _atSuppressUndo !== 'undefined') _atSuppressUndo = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// _syncGrpFromIntl — sync GL lines for intl GRP orders
// Sets Linked International Order directly — no phantom NAT_ORDER
// ═══════════════════════════════════════════════════════════════
async function _syncGrpFromIntl(orderId, fields) {
  // noId=null signals intl side: GL lines get Linked International Order = [orderId]
  await _syncGroupageLines(orderId, null, fields, null);
  invalidateCache(TABLES.GL_LINES);
}

// ═══════════════════════════════════════════════════════════════
// _deleteGrpForIntl — cleanup when intl GRP is turned OFF
// Finds GL lines via Linked International Order (JS filter); unassigns them and
// deletes a CL + NL only when no other order's line is left on it
// ═══════════════════════════════════════════════════════════════
async function _deleteGrpForIntl(orderId) {
  // Fetch all GL lines — filter in JS by Linked International Order
  // (ARRAYJOIN on linked fields returns display names not IDs, so JS filter required)
  const allGLs = await atGetAll(TABLES.GL_LINES, {
    fields: ['Status', 'Linked International Order', 'Linked Consolidated Load']
  }, false);
  const gls = allGLs.filter(r => {
    const links = r.fields['Linked International Order'] || [];
    return links.some(l => (l?.id || l) === orderId);
  });
  // Assigned lines are left alone here (unchanged behaviour). An Unassigned
  // line still carries its old CL FK (nothing clears it), and that truck may
  // now carry other customers — so the truck goes only if it would be empty
  // (audit A4, 3/10; the one shared check lives in core/order-sync.js).
  const toRelease = gls.filter(gl => gl.fields.Status !== 'Assigned');
  try { await releaseGroupageTrucks(toRelease, '_deleteGrpForIntl ' + orderId); }
  catch(e) {
    logError(e, '_deleteGrpForIntl: release trucks — nothing deleted');
    if (typeof showErrorToast === 'function') showErrorToast('Το φορτηγό groupage δεν ελέγχθηκε — δεν σβήστηκε τίποτα. Έλεγξε το Weekly National.', 'warn', 9000);
  }
  for (const gl of toRelease) {
    // Business rule: GL records are NEVER deleted — set to Unassigned instead.
    try { await atPatch(TABLES.GL_LINES, gl.id, { Status: 'Unassigned' }); }
    catch(e) { if (typeof logError === 'function') logError(e, '_deleteGrpForIntl: GL→Unassigned'); }
  }
  invalidateCache(TABLES.GL_LINES);
  invalidateCache(TABLES.CONS_LOADS);  // C6: missing cache invalidation
  invalidateCache(TABLES.NAT_LOADS);   // C6: missing cache invalidation
  invalidateCache(TABLES.NAT_ORDERS);
}

// ═══════════════════════════════════════════════════════════════
// _syncGroupageLines — 1 GL record per loading stop
// ═══════════════════════════════════════════════════════════════
async function _syncGroupageLines(orderId, noId, orderFields, natFields) {
  try {
    const isGrp = !!orderFields['National Groupage'];
    const dir   = orderFields['Direction']||'';
    const ref   = orderFields['Reference']||'';
    const goods = orderFields['Goods']||'';
    const temp  = orderFields['Temperature °C']??null;
    const loadDt= (orderFields['Loading DateTime']||'').slice(0,10)||null;
    const delDt = (orderFields['Delivery DateTime']||'').slice(0,10)||null;
    const direction = dir==='Export'?F.DIR_SN:F.DIR_NS;
    const _lid = v => (v&&typeof v==='object'&&v.id)?v.id:(typeof v==='string'?v:null);

    // noId === null → called from intl order: GL lines get Linked International Order
    // noId === <NAT_ORDERS id> → called from natl side: GL lines get Linked National Order
    const isIntlSide = (noId === null);

    // Get existing GL lines
    let existing;
    if (isIntlSide) {
      // Fetch ALL intl-linked GL lines, then JS-filter for this orderId
      // Cannot use ARRAYJOIN filter (returns display names not IDs, not record IDs)
      // Must NOT filter by Reference — Reference can change on order edit → causes duplicates
      const allIntlGLs = await atGetAll(TABLES.GL_LINES, {
        filterByFormula: `COUNTA({Linked International Order})>0`,
        fields: ['Loading Location','Status','Pallets','Linked International Order'],
      }, false);
      existing = allIntlGLs.filter(r => {
        const links = r.fields['Linked International Order'] || [];
        return links.some(l => (l?.id || l) === orderId);
      });
    } else {
      existing = await atGetAll(TABLES.GL_LINES, {
        filterByFormula: `FIND("${noId}",ARRAYJOIN({Linked National Order},","))>0`,
        fields: ['Loading Location','Status','Pallets'],
      }, false);
    }

    // National Groupage OFF → mark unassigned GL lines as 'Unassigned' (NEVER delete).
    // Business rule: GL records are NEVER deleted — only Status flipped.
    // Previous code incorrectly deleted, losing historical pallet/temp data.
    if (!isGrp) {
      for (const r of existing) {
        if (r.fields.Status !== 'Assigned') {
          try { await atPatch(TABLES.GL_LINES, r.id, { Status: 'Unassigned' }); }
          catch(e) { if (typeof logError === 'function') logError(e, 'GL patch Unassigned'); }
        }
      }
      invalidateCache(TABLES.GL_LINES);
      return;
    }

    // Build target stops from ORDER_STOPS (sole source of truth)
    const nf = natFields || {};
    const targets = [];
    // Try NAT_ORDERS Pickup Locations first (natl side)
    for (let i=1; i<=10; i++) {
      const puArr = nf[`Pickup Location ${i}`];
      const pal   = nf[`Loading Pallets ${i}`] || nf['Pallets'];
      if (!puArr?.length) break;
      const locId = _lid(puArr[0]);
      if (locId) targets.push({locId, pal: parseInt(pal)||0});
    }
    // Fallback: read from ORDER_STOPS (INTL side — flat fields no longer written)
    let _glStops = null;
    if (!targets.length && isIntlSide) {
      try {
        _glStops = await stopsLoad(orderId, F.STOP_PARENT_ORDER);
        const loadStops = _glStops.filter(s => s.fields[F.STOP_TYPE] === 'Loading')
          .sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0));
        loadStops.forEach(s => {
          const loc = (s.fields[F.STOP_LOCATION]||[])[0];
          if (loc) targets.push({locId: loc, pal: s.fields[F.STOP_PALLETS]||0});
        });
      } catch(e) { console.warn('GL sync: ORDER_STOPS load failed', e); }
    }
    if (!targets.length) return;

    // Delivery location from ORDER_STOPS (for Import) or Veroia (for Export)
    let delLoc = F.VEROIA_LOC; // default for Export
    if (dir === 'Import') {
      if (isIntlSide) {
        try {
          if (!_glStops) _glStops = await stopsLoad(orderId, F.STOP_PARENT_ORDER);
          const unloadStops = _glStops.filter(s => s.fields[F.STOP_TYPE] === 'Unloading')
            .sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0));
          if (unloadStops.length) delLoc = (unloadStops[0].fields[F.STOP_LOCATION]||[])[0] || F.VEROIA_LOC;
        } catch(e) { /* keep default */ }
      } else {
        const delLocArr = nf['Delivery Location 1'];
        if (delLocArr?.length) delLoc = _lid(delLocArr[0]) || F.VEROIA_LOC;
      }
    }

    // locId → existing GL record id
    const existMap = {};
    existing.forEach(r => {
      const loc = (r.fields['Loading Location']||[])[0];
      if (loc) existMap[loc] = {id: r.id, status: r.fields.Status||'Unassigned'};
    });

    const keptIds = new Set();
    for (let i=0; i<targets.length; i++) {
      const {locId, pal} = targets[i];
      const glFields = {
        'Name':             `Stop ${i+1} (${ref||'—'})`,
        'Reference':        ref,
        'Pallets':          pal,
        'Direction':        direction,
        'Goods':            goods,
        'Loading Location': [locId],
      };
      // Set the appropriate link field based on order type
      if (isIntlSide) glFields['Linked International Order'] = [orderId];
      else glFields['Linked National Order'] = [noId];
      if (loadDt)    glFields['Loading Date']    = loadDt;
      if (delDt)     glFields['Delivery Date']   = delDt;
      if (temp!=null) glFields['Temperature C']  = temp;
      if (delLoc)    glFields['Delivery Location'] = [delLoc];

      if (existMap[locId]) {
        // Preserve Status if already Assigned
        if (existMap[locId].status !== 'Assigned') glFields['Status'] = 'Unassigned';
        await atPatch(TABLES.GL_LINES, existMap[locId].id, glFields);
        keptIds.add(existMap[locId].id);
      } else {
        glFields['Status'] = 'Unassigned';
        const res = await atCreate(TABLES.GL_LINES, glFields);
        if (res?.id) keptIds.add(res.id);
      }
    }

    // Removed stops (location no longer in order) → mark Unassigned (NEVER delete)
    for (const r of existing) {
      if (!keptIds.has(r.id) && r.fields.Status !== 'Assigned') {
        await atPatch(TABLES.GL_LINES, r.id, {Status:'Unassigned', Pallets:0});
      }
    }
  } catch(e) {
    // Rethrow so the caller can act on the failure. This catch used to swallow
    // (log + toast, no rethrow), which meant the GRP-ON path in _syncVeroiaSwitch
    // could not tell success from failure and set 'National Order Created': true
    // on the parent order even when GL sync had failed, planner then shows a
    // "synced" order with missing/partial GL lines. User messaging is now owned
    // by the caller (single live call site: _syncGrpFromIntl).
    // NOTE: deliberately NO delete-based rollback here. GL records are NEVER
    // deleted (see CLAUDE.md sync-chain rules), and a partial create is benign:
    // leftover GLs sit at Status='Unassigned' and the next save adopts them via
    // existMap (idempotent retry).
    console.error('_syncGroupageLines:', e);
    if (typeof logError === 'function') logError(e, '_syncGroupageLines');
    throw e;
  }
}


async function submitIntlOrder(recId) {
  const btn = document.getElementById('btnSubmit');
  if (btn) { btn.textContent = 'Αποθήκευση…'; btn.disabled = true; }
  // 14/9: the ORDER row is written before its stops. When the stops failed, the
  // modal stayed open with recId=null and every retry created ANOTHER order
  // (335/336/337/338 in 3 minutes, dispatcher 14/9). The id of the order this
  // modal already created is remembered until the modal closes.
  if (!recId && INTL_ORDERS._createdId) recId = INTL_ORDERS._createdId;
  let _written = false;   // the ORDERS write itself went through (D2 context below)
  // The lot was unmarked (its own write, before the order save): a save that
  // fails after it must not read «δεν αποθηκεύτηκε τίποτα» — the lot is gone.
  let _unmarked = false;

  try {
    // 057: the order was saved but its lot mark was refused — this press
    // retries ONLY the mark; saving the order again would re-run every cascade.
    // Unticked meanwhile → no mark: this press is an ordinary save again.
    if (INTL_ORDERS._markPending && !document.getElementById('f_StockLot')?.checked) INTL_ORDERS._markPending = null;
    if (recId && INTL_ORDERS._markPending === recId) {
      const _ctx = INTL_ORDERS._markPendingCtx || { recId, savedOrderId: recId, fields: {}, wasPre: false };
      if (!(await _oiMarkLot(recId, _ctx))) return;
      await _oiFinishSave(_ctx);
      return;
    }

    // Οι στάσεις δεν φορτώθηκαν: αποθήκευση θα έγραφε κενά τα «Loading/Delivery
    // Location N» και θα έσβηνε τις υπαρκτές στάσεις. Σταματάμε ΠΡΙΝ το write.
    if (recId && INTL_ORDERS._stopsFail === recId) {
      toast('Οι στάσεις δεν φορτώθηκαν — η αποθήκευση θα τις έσβηνε. Κάνε Ανανέωση και ξαναδοκίμασε.', 'warn');
      const _b = document.getElementById('btnSubmit');
      if (_b) { _b.textContent = 'Αποθήκευση'; _b.disabled = false; }
      return;
    }

    let fields = {};
    const _SK = INTL_ORDERS._stock || { mode: 'none' };
    // Kept on the form's stock state, not only here: a second Save after a
    // refused one no longer unmarks (wasLot=false), yet the lot is still gone.
    if (_SK.unmarked) _unmarked = true;
    const _lotBox = document.getElementById('f_StockLot');
    const _lotWanted = !!(_lotBox && _lotBox.checked);

    // Validate: no unmatched location text (text input filled but hidden recId empty)
    const unmatchedLocs = [];
    for (let i=1;i<=10;i++) {
      const txt = document.getElementById('ls_l_'+i)?.value?.trim();
      const id  = document.getElementById('lv_l_'+i)?.value?.trim();
      if (txt && !id) unmatchedLocs.push(`Loading Location ${i}: "${txt}"`);
      const txt2 = document.getElementById('ls_u_'+i)?.value?.trim();
      const id2  = document.getElementById('lv_u_'+i)?.value?.trim();
      if (txt2 && !id2) unmatchedLocs.push(`Delivery Location ${i}: "${txt2}"`);
    }
    if (unmatchedLocs.length) {
      // OI-5: app modal αντί για native alert — ίδιο κείμενο, ίδια ροή.
      await confirmAction('Οι παρακάτω τοποθεσίες δεν έχουν επιλεγεί από τη λίστα:\n\n' + unmatchedLocs.join('\n') + '\n\nΨάξε και επίλεξε από το dropdown.', { title: 'Αδύνατη υποβολή', confirmLabel: 'ΟΚ' });
      if (btn) { btn.textContent = 'Αποθήκευση'; btn.disabled = false; }
      throw new Error('validation');
    }

    // Strings
    const sv = id => document.getElementById(id)?.value?.trim()||'';
    // Brand/Type σταθερά (owner 11/8) — μόνο σε δημιουργία, τα edit δεν πειράζονται
    if (!recId) { fields['Brand'] = 'Petras Group'; fields['Type'] = 'International'; }
    if (sv('f_Direction')) fields['Direction']         = sv('f_Direction');
    if (sv('f_Goods'))     fields['Goods']             = sv('f_Goods');
    if (sv('f_Notes'))     fields['Notes']             = sv('f_Notes');
    if (sv('f_PalletType'))fields['Pallet Type']       = sv('f_PalletType');
    if (sv('f_ReeferMode'))fields['Refrigerator Mode'] = sv('f_ReeferMode');
    if (sv('f_Reference')) fields['Reference']         = sv('f_Reference');

    // Numbers
    const nv = id => { const v=document.getElementById(id)?.value; return v!==''&&v!=null?parseFloat(v):null; };
    const price = nv('f_Price');     if (price!=null)  fields['Price']          = price;
    const temp  = nv('f_Temp');      if (temp!=null)   fields['Temperature °C'] = temp;
    const gw    = nv('f_GrossWeight');if (gw!=null)    fields['Gross Weight kg']= gw;

    // Checkboxes
    const ck = id => !!document.getElementById(id)?.checked;
    // PE is ΝΑΙ/ΟΧΙ, not a checkbox (owner 27/9, see core/form-helpers.js):
    // null = unanswered → blocks a new order below; on an edit it is left out
    // of the PATCH so a legacy NULL is not turned into a «No» nobody chose.
    const _pe = peRead('f');
    if (_pe !== null) fields['Pallet Exchange'] = _pe;
    fields['High Risk Flag']  = ck('f_HighRisk');
    // OWNER-Q1 default (4/10): never a VS leg on a lot (see _oiLotVs) — forced
    // here too, so a stale checkbox cannot add the cross-dock stop below.
    const _vs = ck('f_VeroiaSwitch') && !_lotWanted;
    fields['Veroia Switch']  = _vs;
    fields['National Groupage'] = ck('f_Groupage');

    // Client
    const clientId = document.getElementById('lv_client')?.value;
    if (clientId) fields['Client'] = [clientId];

    // ── Collect stops from form (ORDER_STOPS is the sole write target) ──
    // Order-level fields inherited by every stop
    const _stopRef   = sv('f_Reference');
    const _stopGoods = sv('f_Goods');
    const _stopTemp  = sv('f_Temp');

    // Όλα τα 1..10 ελέγχονται και επαναριθμούνται (owner 12/8): η αφαίρεση
    // ενδιάμεσης γραμμής (✕) αφήνει κενό δείκτη — ένα break εδώ θα ΕΧΑΝΕ
    // σιωπηλά όλα τα σημεία μετά το κενό.
    const _formStops = [];
    let _seqL = 0;
    for (let i = 1; i <= 10; i++) {
      const locId = document.getElementById('lv_l_'+i)?.value;
      const pal   = document.getElementById('pal_l_'+i)?.value;
      const dt    = document.getElementById('dt_l_'+i)?.value;
      if (locId) _formStops.push({ stopNumber: ++_seqL, stopType: 'Loading', locationId: locId, pallets: parseFloat(pal) || 0, dateTime: dt || null, clientId: clientId || null, ref: _stopRef || null, goods: _stopGoods || null, temp: _stopTemp ? parseFloat(_stopTemp) : null });
    }
    let _seqU = 0;
    for (let i = 1; i <= 10; i++) {
      const locId = document.getElementById('lv_u_'+i)?.value;
      const pal   = document.getElementById('pal_u_'+i)?.value;
      const dt    = document.getElementById('dt_u_'+i)?.value;
      if (locId) _formStops.push({ stopNumber: ++_seqU, stopType: 'Unloading', locationId: locId, pallets: parseFloat(pal) || 0, dateTime: dt || null, clientId: clientId || null, ref: _stopRef || null, goods: _stopGoods || null, temp: _stopTemp ? parseFloat(_stopTemp) : null });
    }

    // Auto-create Cross-dock stop for Veroia Switch orders
    if (_vs) {
      const _cdPal = _formStops.filter(s => s.stopType === 'Loading').reduce((sum, s) => sum + (s.pallets || 0), 0);
      // Cross-dock Date rule: Export = Loading +1 day, Import = Delivery -1 day
      let _cdDate = null;
      const _dir = fields['Direction'];
      if (_dir === 'Export') {
        const ld = _formStops.find(s => s.stopType === 'Loading' && s.dateTime);
        if (ld) _cdDate = _vsAddDays(_vsToLocalDate(ld.dateTime), 1);
      } else {
        const ud = _formStops.find(s => s.stopType === 'Unloading' && s.dateTime);
        if (ud) _cdDate = _vsAddDays(_vsToLocalDate(ud.dateTime), -1);
      }
      const _cdDt = _cdDate ? _cdDate + 'T12:00:00.000Z' : null;
      fields['Cross-dock Date'] = _cdDt;
      _formStops.push({ stopNumber: 1, stopType: 'Cross-dock', locationId: F.VEROIA_LOC, pallets: _cdPal, dateTime: _cdDt, clientId: clientId || null, ref: _stopRef || null, goods: _stopGoods || null, temp: _stopTemp ? parseFloat(_stopTemp) : null });
    } else {
      fields['Cross-dock Date'] = null;
    }

    // Derive order-level summary fields from stops (needed for filters, sorting, weekly views)
    const _firstLoad = _formStops.find(s => s.stopType === 'Loading');
    const _firstUnload = _formStops.find(s => s.stopType === 'Unloading');
    if (_firstLoad?.dateTime) fields['Loading DateTime'] = _firstLoad.dateTime;
    if (_firstUnload?.dateTime) fields['Delivery DateTime'] = _firstUnload.dateTime;
    // Total Pallets is a computed field in Airtable — do not write to it

    // Write flat Location fields so Airtable formulas (Loading Summary, Order Number) work
    const _loadStops = _formStops.filter(s => s.stopType === 'Loading').sort((a,b) => a.stopNumber - b.stopNumber);
    const _unloadStops = _formStops.filter(s => s.stopType === 'Unloading').sort((a,b) => a.stopNumber - b.stopNumber);
    for (let i = 0; i < 10; i++) {
      const ls = _loadStops[i];
      // Άδειασμα linked θέσης = ΚΕΝΟΣ ΠΙΝΑΚΑΣ, όχι null — ο Worker μεταφράζει
      // το [] σε NULL (ίδιο pattern με natl). Με null το PATCH έσκαγε 422 όταν
      // αφαιρούνταν stop από υπάρχουσα παραγγελία (owner 12/8, «εμφανίστηκε error»).
      fields[`Loading Location ${i+1}`]   = ls?.locationId ? [ls.locationId] : [];
      fields[`Loading Pallets ${i+1}`]    = ls?.pallets || null;
      const us = _unloadStops[i];
      fields[`Unloading Location ${i+1}`] = us?.locationId ? [us.locationId] : [];
      fields[`Unloading Pallets ${i+1}`]  = us?.pallets || null;
    }

    // Validate required fields
    const _vErrors = [];
    if (!fields['Direction'])            _vErrors.push('Direction is required');
    if (!clientId)                       _vErrors.push('Client is required');
    if (!_firstLoad?.locationId)         _vErrors.push('Loading Location 1 is required');
    if (!_firstUnload?.locationId)       _vErrors.push('Delivery Location 1 is required');
    if (!fields['Loading DateTime'])     _vErrors.push('Loading Date (Stop 1) is required');
    if (!fields['Delivery DateTime'])    _vErrors.push('Delivery Date (Stop 1) is required');
    // A piece never asks PE (Ε5: counted once, at the lot's loading) — pieceFields sends false.
    if (_pe === null && !recId && _SK.mode !== 'pieceNew') _vErrors.push(peMarkMissing('f'));
    if (_lotWanted) {
      const _wh = document.getElementById('f_StockWh')?.value || '';
      if (!_wh) _vErrors.push('Διάλεξε την αποθήκη της παρτίδας');
      else if (_unloadStops.length !== 1 || _unloadStops[0].locationId !== _wh) _vErrors.push('Η παρτίδα έχει έναν προορισμό: την αποθήκη');
      // G-14 (impact map 4/10): the mark is the SECOND write — a refusal there
      // leaves an ordinary order to the warehouse, invoiced at full price on
      // intake with no stock behind it. So the base's mark refusals are
      // mirrored here, before anything is saved (057 stock_guard_lots:
      // lot_empty, lot_invoiced, no_split; the base still decides).
      if (!_SK.wasLot) {
        const _lotPals = _loadStops.reduce((a, st) => a + (st.pallets || 0), 0);
        if (_lotPals <= 0) _vErrors.push('Παρτίδα χωρίς παλέτες — συμπλήρωσε τις παλέτες φόρτωσης');
        if (_SK.srcInvoiced) _vErrors.push('Τιμολογημένη παραγγελία δεν γίνεται παρτίδα');
        if (_SK.srcLeg) _vErrors.push('Σκέλος παραγγελίας δεν γίνεται παρτίδα');
      }
    }
    // no_split also refuses the PARENT of legs: one read, only for an existing
    // order being marked now, only when nothing else is wrong already.
    if (_lotWanted && !_SK.wasLot && recId && !_SK.srcLeg && !_vErrors.length) {
      const _legs = await _oiLegsOf(recId);
      if (!_legs.ok) _vErrors.push('Ο έλεγχος σκελών δεν έγινε (' + _legs.error + ') — δεν αποθηκεύτηκε τίποτα· ξαναδοκίμασε');
      else if (_legs.n) _vErrors.push('Παραγγελία με σκέλη δεν γίνεται παρτίδα');
    }

    // Date cross-validation
    if (fields['Loading DateTime'] && fields['Delivery DateTime']) {
      if (new Date(fields['Delivery DateTime']) < new Date(fields['Loading DateTime'])) {
        _vErrors.push('Delivery date cannot be before loading date');
      }
    }
    // Crash-test fix: reject negative pallet counts on any stop
    for (let i = 1; i <= 10; i++) {
      const lPal = parseFloat(document.getElementById('pal_l_'+i)?.value);
      const uPal = parseFloat(document.getElementById('pal_u_'+i)?.value);
      if (Number.isFinite(lPal) && lPal < 0) { _vErrors.push(`Loading ${i}: pallets cannot be negative`); break; }
      if (Number.isFinite(uPal) && uPal < 0) { _vErrors.push(`Delivery ${i}: pallets cannot be negative`); break; }
    }

    if (_vErrors.length) {
      showErrorToast(_vErrors.join(' | '), 'warn', 8000);
      throw new Error('validation');
    }

    // Δ6: the starred-but-unenforced fields. Warns once, in place; a second
    // press of the same button saves. Nothing here touches `fields`.
    const _softMissing = _oiCheckSoftRequired();
    if (_softMissing) {
      showErrorToast(
        `Λείπουν υποχρεωτικά: ${_softMissing.join(', ')}. Πάτησε ξανά «Αποθήκευση» για να καταχωρηθεί χωρίς αυτά.`,
        'warn', 9000);
      throw new Error('validation');
    }

    // ── Pallets mismatch warning (non-blocking) ──
    const _loadPals = Array.from({length:10}, (_,i)=>parseFloat(document.getElementById('pal_l_'+(i+1))?.value)||0).reduce((a,b)=>a+b,0);
    const _unloadPals = Array.from({length:10}, (_,i)=>parseFloat(document.getElementById('pal_u_'+(i+1))?.value)||0).reduce((a,b)=>a+b,0);
    if (_loadPals > 0 && _unloadPals > 0 && _loadPals !== _unloadPals) {
      toast(`⚠️ Loading pallets (${_loadPals}) ≠ Unloading pallets (${_unloadPals})`, 'warn', 5000);
    }

    // ── Pre-save check: auto-restore CL if GL lines are Assigned ───
    if (recId && fields['National Groupage'] && fields['Veroia Switch']) {
      try {
        // Find GL lines linked to this intl order via Linked International Order (JS filter)
        const allGLs = await atGetAll(TABLES.GL_LINES, {
          fields: ['Status', 'Linked International Order', 'Linked Consolidated Load']
        }, false);
        const assignedGLs = allGLs.filter(r => {
          const links = r.fields['Linked International Order'] || [];
          return links.some(l => (l?.id||l) === recId) && r.fields.Status === 'Assigned';
        });
        if (assignedGLs.length > 0) {
            const ok = await confirmAction(
              `Η παραγγελία αυτή έχει ήδη ενταχθεί σε groupage φορτίο.\n\n` +
              `Αν αποθηκεύσεις αλλαγές, η παραγγελία θα βγει από το φορτίο\n` +
              `ώστε να ξαναμπεί με τα νέα δεδομένα. Το φορτηγό μένει\n` +
              `αν έχει κι άλλους πελάτες.\n\n` +
              `Θέλεις να συνεχίσεις;`,
              { title: 'Groupage φορτίο', confirmLabel: 'Συνέχεια', danger: true }
            );
            if (!ok) { btn.textContent = 'Αποθήκευση'; btn.disabled = false; return; }

            // Release this order's lines; the truck (CL + NL) goes only if no
            // other order's line is left on it — this ran on EVERY save of an
            // assigned order and dissolved everyone's truck (audit A4 review, 3/10).
            toast('Αυτόματη επαναφορά ενοποιημένων φορτίων…', 'info');
            await releaseGroupageTrucks(assignedGLs, 'intl pre-save restore ' + recId);
            for (const gl of assignedGLs) {
              await atPatch(TABLES.GL_LINES, gl.id, { 'Status': 'Unassigned' });
            }
            invalidateCache(TABLES.CONS_LOADS);
            invalidateCache(TABLES.NAT_LOADS);
            invalidateCache(TABLES.GL_LINES);
            toast('Η παραγγελία βγήκε από το φορτίο — συνεχίζει η αποθήκευση...', 'info');
          }
      } catch(e) { console.warn('Pre-save CL restore:', e); showErrorToast('Ο έλεγχος του φορτίου groupage απέτυχε — δεν σβήστηκε τίποτα. Έλεγξε το Weekly National.', 'warn', 9000); }
    }
    // ────────────────────────────────────────────────────────────

    // Duplicate guard — only on CREATE (not edit) AND only if Reference is set.
    // Asks the user to confirm before saving a duplicate.
    if (!recId && fields['Reference'] && typeof findDuplicateOrders === 'function') {
      const dupes = await findDuplicateOrders(fields['Reference'], TABLES.ORDERS);
      if (dupes.length) {
        const list = dupes.map(d => {
          const f = d.fields;
          return `• ${f['Order Number'] || d.id.slice(-6)} — ${(f['Loading DateTime']||'').substring(0,10) || 'no date'}`;
        }).join('\n');
        const ok = await confirmAction(
          `Πιθανό duplicate\n\n` +
          `Υπάρχουν ${dupes.length} παραγγελίες με Reference "${fields['Reference']}":\n\n` +
          `${list}\n\n` +
          `Συνέχεια αποθήκευσης ως νέα παραγγελία;`,
          { title: 'Πιθανό duplicate', confirmLabel: 'Αποθήκευση ως νέα' }
        );
        if (!ok) {
          if (btn) { btn.textContent = 'Αποθήκευση'; btn.disabled = false; }
          return;
        }
      }
    }

    // Φύλακας #5 (owner 10/8): νέο order με Reference που υπάρχει ήδη →
    // soft confirm, όχι σιωπηλό διπλό. Μόνο σε δημιουργία, όχι σε edit.
    if (!recId && fields['Reference']) {
      try {
        const esc = String(fields['Reference']).replace(/'/g, "\\'");
        const dups = await atGetAll(TABLES.ORDERS, { filterByFormula: `{Reference}='${esc}'` }, false);
        if (dups && dups.length) {
          const ok2 = await confirmAction(
            `Υπάρχει ήδη order με Reference «${fields['Reference']}» (${(() => { const d = String(dups[0].fields?.['Loading DateTime'] || '').slice(0, 10); return d ? 'φορτώνει ' + d.split('-').reverse().join('/') : 'χωρίς ημερομηνία φόρτωσης'; })()}). Σίγουρα να δημιουργηθεί δεύτερο;`,
            { title: 'Πιθανό διπλό', confirmLabel: 'Δημιουργία ούτως ή άλλως', danger: true });
          if (!ok2) { if (btn) { btn.textContent = 'Αποθήκευση'; btn.disabled = false; } return; }
        }
      } catch (e) {}
    }
    // Πρώτη κατάσταση του λεξιλογίου (DESIGN.md ΜΕΡΟΣ Ε) στη δημιουργία ΜΟΝΟ:
    // στην επεξεργασία το Status ανήκει στο popover ανάθεσης, δεν το ξαναγράφει
    // η φόρμα.
    if (!recId && !fields['Status']) fields['Status'] = 'Pending';
    // Pre-order conversion: the six required fields passed above, so the row
    // stops being provisional here — same id, no new order. The country goes
    // too: the delivery location now carries its own (DRAFT 052 CHECK ties
    // dest_country to 'Provisional'). Sent only when the row has one, so a
    // conversion never names a column the base may not have yet.
    const _wasPre = !!recId && INTL_ORDERS._preConvert === recId;
    if (_wasPre) {
      fields['Ops Status'] = null;
      if (INTL_ORDERS._preConvertCountry) fields['Destination Country'] = null;
    }

    // 057: a new piece = the form + the lot's locks (never Price, never PE).
    if (_SK.mode === 'pieceNew') fields = OrdersStock.pieceFields(_SK.lot, _SK.presets, fields);
    // Unticked on a lot: the lot goes BEFORE the order save — while it is a
    // lot the base refuses a destination that is not a warehouse. Native
    // confirm on purpose: confirmAction draws in this same #modal and would
    // wipe the form being saved.
    if (_SK.wasLot && _lotBox && !_lotWanted) {
      if (!confirm('Η παραγγελία θα πάψει να είναι παρτίδα σε αποθήκη. Συνέχεια;')) {
        if (btn) { btn.textContent = 'Αποθήκευση'; btn.disabled = false; }
        return;
      }
      const _un = await OrdersStock.unmarkLot(_SK.lotRec);
      if (!_un.ok) {
        // D2 (round 1): the base's reason is already on screen when shown.
        showErrorToast('Η παραγγελία ΠΑΡΑΜΕΝΕΙ παρτίδα — δεν αποθηκεύτηκε τίποτα' + (_un.shown ? '' : ': ' + _un.error), _un.shown ? 'warn' : 'error', 12000);
        if (btn) { btn.textContent = 'Αποθήκευση'; btn.disabled = false; }
        return;
      }
      _SK.wasLot = false;   // a retry of this save must not unmark twice
      _SK.unmarked = _unmarked = true;
    }

    const result = recId
      ? await atSafePatch(TABLES.ORDERS, recId, fields)
      : await atCreate(TABLES.ORDERS, fields);
    _written = true;
    if (result?.conflict) {
      if (_unmarked) showErrorToast('Η παρτίδα καταργήθηκε, η παραγγελία ΔΕΝ αποθηκεύτηκε — άλλαξε από άλλον χρήστη: κάνε Ανανέωση και ξανακάνε την αλλαγή', 'warn', 12000);
      else toast('Η εγγραφή άλλαξε από άλλον χρήστη — κάνε Ανανέωση και ξαναδοκίμασε','warn');
      return;
    }

    if (result?.error) throw new Error(result.error.message || JSON.stringify(result.error));
    // G-32 (impact map 4/10): a new piece is a piece only if its link landed.
    // A Worker without the «Stock Lot» label answers 200 and drops it (facade
    // trap #1) — the order would be an ordinary priced import from the
    // warehouse. The row the Worker returned decides (αρχή 2), loudly.
    const _pieceLost = _SK.mode === 'pieceNew' && !result?._offline && getLinkedId(result?.fields?.['Stock Lot']) !== _SK.lotRec;
    if (_pieceLost) {
      showErrorToast('Η παραγγελία αποθηκεύτηκε ΧΩΡΙΣ σύνδεση με την παρτίδα — ΔΕΝ είναι κομμάτι και δεν μπήκε στο φορτηγό. Ενημέρωσε τον διαχειριστή πριν τη χρησιμοποιήσεις.', 'error', 15000);
      if (typeof logError === 'function') logError(new Error('piece saved without its Stock Lot link (lot ' + _SK.lotRec + ')'), 'submitIntlOrder piece ' + (recId || result?.id));
    }
    // Αρχή 2: the row the Worker returned decides, not the toast below.
    if (_wasPre && !result?._offline && result?.fields?.['Ops Status']) {
      showErrorToast('Η παραγγελία αποθηκεύτηκε αλλά ΕΜΕΙΝΕ pre-order (η σήμανση δεν καθάρισε). Ενημέρωσε τον διαχειριστή.', 'error', 12000);
      if (typeof logError === 'function') logError(new Error('Ops Status not cleared'), 'preorder convert ' + recId);
    }
    if (!recId && result?.id) INTL_ORDERS._createdId = result.id;

    invalidateCache(TABLES.ORDERS);

    // Scan round 3: the review UI stashes the scanned file on window._scanPendingDoc
    // when it opened THIS form; only fires on the create path (order_documents
    // needs a real order id). Fire-and-forget — a failed upload never blocks the
    // save flow above, it shows its own persistent warning (core/order-docs.js).
    if (!recId && result?.id && typeof OrderDocs !== 'undefined' && window._scanPendingDoc) {
      OrderDocs.handleOrderSaved(result.id);
    }

    // ── Active learning: persist scan correction (Phase 3) ──
    // If this submission was prefilled from a scan, save the user-corrected
    // values as a few-shot example for future scans of the same doc type.
    try {
      if (window._scanResult && typeof scanSaveCorrection === 'function') {
        const r = window._scanResult;
        const corrected = {
          client_name: fields['Client'] ? '(matched)' : (r.data?.client_name || ''),
          client_id: (fields['Client']||[])[0] || null,
          goods: fields['Goods'] || '',
          pallets: fields['Total Pallets'] ?? r.data?.pallets ?? null,
          temperature_c: fields['Temperature °C'] ?? null,
          direction: fields['Direction'] || '',
          loading_stops: (r.data?.loading_stops || []).map(s => ({
            location_name: s.location_name || s._locLabel || '',
            location_id: s._locId || s.location_id || null,
            city: s.city, country: s.country, date: s.date, pallets: s.pallets,
          })),
          delivery_stops: (r.data?.delivery_stops || []).map(s => ({
            location_name: s.location_name || s._locLabel || '',
            location_id: s._locId || s.location_id || null,
            city: s.city, country: s.country, date: s.date, pallets: s.pallets,
          })),
        };
        scanSaveCorrection(
          r.data?._docType || 'UNKNOWN',
          window._scanUploadedFile?.name || '',
          r.data,
          corrected,
          (fields['Client']||[])[0] || null
        );
        delete window._scanResult;  // one-shot
      }
    } catch (e) { console.warn('[scan] save correction skipped:', e.message); }

    // Sync Veroia Switch → NAT_LOADS (direct, no intermediate NAT_ORDERS)
    const savedOrderId = recId || result.id;

    // ── Save ORDER_STOPS (primary write for stop data) ──
    if (_formStops.length) {
      await stopsSave(savedOrderId, _formStops, F.STOP_PARENT_ORDER);
    }

    // Παλέτες Φ2: εκκρεμείς LOADING ανά στάση (idempotent, μη-μπλοκάρον)
    if (typeof plOnOrderSaved === 'function') await plOnOrderSaved(savedOrderId, 'intl');
    if (typeof rtOnOrderSaved === 'function') await rtOnOrderSaved(savedOrderId);

    let _savedRec = null;   // the order as the base holds it after the save (OWNER-Q2 note)
    try {
      toast('Συγχρονισμός εθνικού φορτίου VS…', 'info');
      const rec = _savedRec = await atGetOne(TABLES.ORDERS, savedOrderId);
      _tmsLog('SYNC: fetched record', savedOrderId, rec.fields?.[F.VEROIA_SWITCH], rec.fields?.['Direction'], rec.fields?.['Type']);
      if (!rec.fields) { toast('Ο συγχρονισμός απέτυχε — η παραγγελία επέστρεψε χωρίς πεδία', 'warn'); return; }
      await _syncVeroiaSwitch(savedOrderId, rec.fields);
      // Central sync — RAMP trigger + PL cleanup (if PE=OFF) + cache invalidation
      if (typeof syncOrderDownstream === 'function') {
        syncOrderDownstream(savedOrderId, { source: 'intl', skipVS: true, skipGRP: true })
          .catch(e => console.warn('[intl save sync]', e));
      }
      toast('Το εθνικό φορτίο συγχρονίστηκε ✓');
    } catch(e) {
      console.error('VS sync error:', e);
      reportError('Ο συγχρονισμός εθνικού φορτίου απέτυχε', e, 'warn');
    }

    // madeLot: G-26 (a new lot is never auto-matched to an export's empty
    // import box). partner: OWNER-Q2 note after the mark — from the saved row,
    // else from the form's opening state.
    const _finish = { recId: recId || null, savedOrderId, fields, wasPre: _wasPre, madeLot: _lotWanted && !_SK.wasLot,
      partner: (_savedRec && getLinkedId(_savedRec.fields && _savedRec.fields['Partner'])) || _SK.partner || '' };
    // 057: mark the lot (second write). A refusal keeps the modal open.
    if (_lotWanted && !_SK.wasLot) {
      if (!(await _oiMarkLot(savedOrderId, _finish))) return;
    }
    // 057: the Weekly joins the new piece to its truck (Group ID, match). The
    // piece is saved whatever happens there — a failure is said, not undone.
    if (_SK.mode === 'pieceNew' && !_pieceLost && typeof window._wiOnPieceSaved === 'function') {
      try { await window._wiOnPieceSaved(savedOrderId, fields, _SK.presets.context); }
      catch (e) { reportError('Το κομμάτι αποθηκεύτηκε, αλλά η ένταξή του στο φορτηγό δεν ολοκληρώθηκε — δες το Weekly', e); }
    }
    await _oiFinishSave(_finish);

  } catch(e) {
    // 'validation' is the sentinel thrown after a blocking validation alert (line ~1259);
    // that path already messaged the user, so don't double-report.
    // D2 (round 1, critic-1 C1-06 / critic-5 S5-06): a 4xx refusal (over_draw,
    // a Worker validation, a 403) is already on screen from core/api.js — a
    // generic red «Σφάλμα αποθήκευσης» under it read as a system fault. Only
    // the context: what was (not) written; the reason stays the api's.
    if (e && e._noRetry && e.message !== 'validation') {
      showErrorToast(_written ? 'Η παραγγελία αποθηκεύτηκε, αλλά ένα επόμενο βήμα δεν έγινε — ξαναδοκίμασε την Αποθήκευση'
        : _unmarked ? _OI_UNMARKED_NOT_SAVED
        : 'Δεν αποθηκεύτηκε τίποτα — η φόρμα μένει ανοιχτή', 'warn', 8000);
    } else if (e.message !== 'validation') {
      reportError('Σφάλμα αποθήκευσης παραγγελίας', e);
      if (_unmarked && !_written) showErrorToast(_OI_UNMARKED_NOT_SAVED, 'warn', 12000);
    }
    if (btn) { btn.textContent = 'Αποθήκευση'; btn.disabled = false; }
  }
}

const _OI_UNMARKED_NOT_SAVED = 'Η παρτίδα καταργήθηκε, η παραγγελία ΔΕΝ αποθηκεύτηκε — ξαναπάτα Αποθήκευση';

// The end of a successful save — moved out of submitIntlOrder unchanged so
// the «retry only the lot mark» path (057) ends exactly the same way.
async function _oiFinishSave(ctx) {
  const recId = ctx.recId, savedOrderId = ctx.savedOrderId, fields = ctx.fields || {}, _wasPre = !!ctx.wasPre;
  // Weekly International: εισαγωγή που ξεκίνησε από κενό κουτί ταιριάζεται
  // αμέσως με το export που την άνοιξε (owner 3/9). Πριν το closeModal, ώστε
  // το repaint από κάτω να δει ήδη γραμμένο το ταίριασμα.
  if (!recId && typeof window._wiConsumePendingMatch === 'function') {
    // G-26 (impact map 4/10): a lot goes INTO a warehouse on its own carrier —
    // it is never the matched import of our export's truck. The pending box is
    // dropped (not kept for the next import saved within 30 minutes).
    if (ctx.madeLot) window._wiPendingMatch = null;
    else {
      try { await window._wiConsumePendingMatch(savedOrderId, fields); }
      catch (e) { console.warn('[wi pending match]', e); }
    }
  }

  document.getElementById('modal').style.maxWidth = '';
  closeModal();
  INTL_ORDERS._createdId = null;
  toast(_wasPre ? 'Το pre-order έγινε παραγγελία ✓' : recId ? 'Order updated ✓' : 'Order created ✓');
  // Weekly v3: το modal ανοίγει και από το Weekly International — το repaint
  // πρέπει να σεβαστεί τη σελίδα που είναι ανοιχτή, όχι να τη hijack-άρει.
  if (typeof currentPage!=='undefined' && currentPage==='weekly_intl' && typeof renderWeeklyIntl==='function') { renderWeeklyIntl(); }
  else if (typeof currentPage!=='undefined' && currentPage==='weekly_natl' && typeof renderWeeklyNatl==='function') { renderWeeklyNatl(); }
  // Daily Ops opens this form for a pre-order conversion (27/9).
  else if (typeof currentPage!=='undefined' && currentPage==='daily_ops' && typeof renderDailyOps==='function') { renderDailyOps(); }
  else await renderOrdersIntl();
  // Batch scan: Save → αμέσως η επόμενη φόρμα της ουράς
  if (window._scanQueue && (window._scanQueue.length || window._scanQueueTotal > 1)) { setTimeout(() => _scanQueueNext(), 250); }
}

// ─── Pallet Sheet Upload ───────────────
// SW-2: this module used to carry a SECOND openPalletUpload/closePalletUpload
// pair (an iframe overlay to the petras-assign standalone). Both were dead:
// modules/pallet_upload.js loads later in app.html and its top-level function
// declarations rebind the globals, so the in-app modal always won. The pair
// survived only through script order — reordering app.html would have swapped
// implementations silently. Removed 2026-08-07 (verified live: the button on a
// real order opens the in-app modal, zero errors).
// 7/9/2026: the order card no longer offers «Δελτίο παλετών →» at all. The
// OCR modal writes to the dead pallet_ledger_* tables (0 rows ever) and the
// «Pallet Sheet N Uploaded» flags it sets are 0/138 in production; the
// invoicing gate reads pl_v_order_gate (confirmed LOADING movements in the
// Ισοζύγιο). One door for sheets — the one that counts. The card keeps the
// «Ισοζύγιο παλετών →» link. pallet_upload.js stays loaded until the OCR is
// re-pointed at pl_movements (TMS map, critical finding).

// ═══════════════════════════════════════════════
// SCAN ORDER — AI Pre-fill
// ═══════════════════════════════════════════════

function openIntlScan() {
  // Reset (bug 10/8): τα _scanFiles κρατούσαν τα αρχεία της ΠΡΟΗΓΟΥΜΕΝΗΣ
  // χρήσης — το κουμπί «σκάναρε» τα παλιά ή τίποτα. Κάθε άνοιγμα = καθαρό.
  window._scanFiles = []; window._scanUploadedFile = null;
  window._scanQueue = []; window._scanQueueTotal = 0; window._scanQueueDone = 0;
  if (typeof scanSyncTrainingFromServer === 'function') scanSyncTrainingFromServer();
  document.getElementById('modal').style.maxWidth = '520px';
  openModal('New Order from Scan', `
    <div style="text-align:center;padding:4px 0 20px">
      <div style="font-size:12px;color:var(--text-dim);margin-top:4px">
        Upload image or PDF — AI εξάγει τα στοιχεία και προσυμπληρώνει τη φόρμα
      </div>
    </div>

    <div id="scanDrop"
      style="border:2px dashed var(--border-dark);border-radius:6px;padding:32px 16px;
             text-align:center;cursor:pointer;background:var(--surface-page);transition:border-color 0.15s"
      onclick="document.getElementById('scanFile').click()"
      ondragover="event.preventDefault();document.getElementById('scanDrop').style.borderColor='var(--accent)'"
      ondragleave="document.getElementById('scanDrop').style.borderColor='var(--border-dark)'"
      ondrop="_scanDrop(event)">
      <div style="font-size:30px;margin-bottom:8px;opacity:0.35">📎</div>
      <div style="font-size:13px;font-weight:500;color:var(--text-mid)">Σύρε αρχεία εδώ ή κάνε κλικ για μεταφόρτωση</div>
      <div style="font-size:12px;color:var(--text-mid);margin-top:4px">JPG · PNG · PDF — έως 10MB · έως 10 αρχεία μαζί (π.χ. 10 παραγγελίες Lidl)</div>
      <button type="button" class="btn btn-ghost btn-sm" style="margin-top:12px"
        onclick="event.stopPropagation();document.getElementById('scanCamera').click()">
        📷 &nbsp;Λήψη με κάμερα
      </button>
    </div>
    <input type="file" id="scanFile" accept="image/*,application/pdf${typeof scanEngineV2On === 'function' && scanEngineV2On() ? ',.doc,application/msword,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ''}" multiple style="display:none"
      onchange="_scanHandleFiles(this.files)">
    <input type="file" id="scanCamera" accept="image/*" capture="environment" style="display:none"
      onchange="_scanHandleFile(this.files[0])">

    <div id="scanStatus" style="display:none;margin-top:16px"></div>`,

  `<button class="btn btn-ghost" onclick="closeModal()">Άκυρο</button>
   <button class="btn btn-success" id="btnScanGo" onclick="_scanExtract()" disabled>
     🤖 &nbsp;Εξαγωγή στοιχείων & συμπλήρωση φόρμας
   </button>`);
}

function _scanDrop(e) {
  e.preventDefault();
  document.getElementById('scanDrop').style.borderColor = 'var(--border-dark)';
  _scanHandleFiles(e.dataTransfer.files);
}

async function _scanHandleFile(file) {
  if (!file) return;

  // Pre-flight validation
  const MAX_SIZE = 10 * 1024 * 1024;  // 10MB
  if (file.size > MAX_SIZE) {
    toast(`Το αρχείο είναι πολύ μεγάλο (${(file.size/1024/1024).toFixed(1)}MB) — όριο 10MB`, 'error');
    return;
  }
  // Engine v2 (scan round 2/4) also reads Word .doc / .docx — DPS sends those.
  const v2 = typeof scanEngineV2On === 'function' && scanEngineV2On();
  const okType = v2 ? scanV2Accepts(file) : (file.type.startsWith('image/') || file.type === 'application/pdf');
  if (!okType) {
    toast(v2 ? 'Δεκτά μόνο JPG / PNG / PDF / Word (.doc, .docx)' : 'Δεκτά μόνο JPG / PNG / PDF', 'error');
    return;
  }

  window._scanUploadedFile = file;
  window._scanFiles = [...(window._scanFiles||[]), file].slice(0, 10);
  const btn = document.getElementById('btnScanGo');
  if (btn) btn.disabled = false;

  const drop = document.getElementById('scanDrop');
  if (drop) drop.innerHTML = `
    <div style="font-size:24px;margin-bottom:8px">✅</div>
    <div style="font-size:13px;font-weight:500;color:var(--ok)">${escapeHtml(file.name)}</div>
    <div style="font-size:12px;color:var(--text-mid);margin-top:4px">${(file.size/1024).toFixed(0)} KB — κλικ για αλλαγή</div>`;

  // Show preview — image inline, PDF first page via pdf.js
  const st = document.getElementById('scanStatus');
  if (!st) return;
  st.style.display = 'block';
  st.innerHTML = `<div class="scan-preview-doc"><span style="color:var(--text-mid);font-size:12px">Φόρτωση προεπισκόπησης…</span></div>`;
  try {
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      st.innerHTML = `<div class="scan-preview-doc"><img src="${url}" alt="preview"></div>`;
    } else if (file.type === 'application/pdf' && typeof scanRenderPDFPreview === 'function') {
      const dataUrl = await scanRenderPDFPreview(file);
      st.innerHTML = dataUrl
        ? `<div class="scan-preview-doc"><img src="${dataUrl}" alt="PDF page 1"></div>`
        : `<div class="scan-preview-info">📄 PDF · ${escapeHtml(file.name)}<span class="scan-preview-meta">preview unavailable</span></div>`;
    } else {
      st.innerHTML = `<div class="scan-preview-info">📄 ${escapeHtml(file.name)}</div>`;  // .doc/.docx (v2): no preview
    }
  } catch(e) {
    console.warn('[scan] preview failed:', e.message);
    st.innerHTML = `<div class="scan-preview-info">📄 ${escapeHtml(file.name)}</div>`;
  }
}

async function _scanExtractCore(file) {
  if (!file) return null;
  const st  = document.getElementById('scanStatus');
  const btn = document.getElementById('btnScanGo');
  const setStatus = (icon, text, kind = 'info') => {
    if (!st) return;
    const bg = kind === 'error' ? 'var(--surface-card)' : 'var(--surface-sunken)';
    const color = kind === 'error' ? 'var(--danger)' : 'var(--text-mid)';
    const border = kind === 'error' ? 'var(--danger)' : 'var(--border)';
    st.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:12px;background:${bg};border-radius:6px;border:1px solid ${border};font-size:13px;color:${color}">${icon}${text}</div>`;
  };
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block"></span> &nbsp;Ανάλυση…'; }
  setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>', 'Προετοιμασία αρχείου…');

  try {
    // Engine v2 behind a per-browser switch until the owner approves it
    // (core/scan-engine-v2.js): one structured-output call, text layer first,
    // matching in code over all clients/locations.
    if (typeof scanEngineV2On === 'function' && scanEngineV2On()) {
      setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>', 'AI αναλύει το έγγραφο (v2)…');
      return await scanV2Extract(file);
    }
    // 1. Preprocess (auto-rotate + resize for images, pass-through for PDF)
    const pre = await scanPreprocessFile(file);
    if (pre.wasPreprocessed) {
      // Fires on every scan; route through the gated logger so it stays out of
      // the production console (visible only when TMS_DEBUG is on). The other
      // console.log calls in the codebase are low-frequency lifecycle logs or
      // the gated logger itself, so this is the only per-operation offender.
      _tmsLog('[scan] preprocessed: original=' + (file.size/1024).toFixed(0) + 'KB → ' + (pre.blob.size/1024).toFixed(0) + 'KB');
    }

    // 2. Document type detection (Haiku, fast + cheap)
    setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>', 'Αναγνώριση τύπου εγγράφου…');
    const docType = await scanDetectDocType(pre.base64, pre.mediaType);

    // 3. Tiered model selection: Opus για complex docs, Sonnet για simple
    const model = scanModelForType(docType);
    const modelLabel = scanModelLabel(model);

    // 4. Extraction with type-specialised prompt + few-shot examples + tool use
    setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>',
      `AI αναλύει ${docType.toLowerCase().replace('_',' ')} με ${modelLabel}…`);
    const cb = pre.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: pre.mediaType, data: pre.base64 } }
      : { type: 'image',    source: { type: 'base64', media_type: pre.mediaType, data: pre.base64 } };

    // Build system prompt with type-specialised rules + reference data injection (Phase 2.3)
    const refData = scanGetReferenceData(50, 80);
    const refBlock = scanBuildReferenceBlock(refData);
    const sysPrompt = _intlBuildSystemPrompt(docType) + refBlock + `

You have access to two tools:
- search_clients(query)        → look up canonical client name + id
- search_locations(query, city, country) → look up canonical location name + id

USE THESE TOOLS for every client and every loading/delivery stop.
Set client_id and location_id fields in the JSON output when tools return a confident match (>0.85).`;

    const messages = [];

    // Template memory (#2, owner 10/8): μάντεψε τον αποστολέα από το όνομα
    // αρχείου (π.χ. «lidl_order_4711.pdf») — τα διορθωμένα παραδείγματα του
    // ΙΔΙΟΥ πελάτη μπαίνουν πρώτα στο few-shot (το store το υποστήριζε ήδη).
    let hintClientId = null;
    try {
      const fn = (file.name || '').toLowerCase();
      const cl = (typeof getRefClients === 'function' ? getRefClients() : []) || [];
      const hit = cl.find(c => {
        const n = (c.fields?.['Company Name'] || '').toLowerCase();
        return n.split(/[^a-zα-ωά-ώ0-9]+/i).filter(w => w.length >= 4).some(w => fn.includes(w));
      });
      if (hit) hintClientId = hit.id;
    } catch (e) {}
    const examples = scanGetTrainingExamples(docType, 3, hintClientId);
    examples.forEach(ex => {
      messages.push({ role: 'user', content: [{ type: 'text', text: 'Extract:' }] });
      messages.push({ role: 'assistant', content: [{ type: 'text', text: JSON.stringify(ex.corrected) }] });
    });

    // Actual document — explicit JSON-only instruction prevents conversational preamble
    messages.push({ role: 'user', content: [cb, { type: 'text', text:
      'Extract all order data from this document. Use search_clients and search_locations tools to find canonical refs.\n\n' +
      'CRITICAL: When you have all the data, your FINAL message must contain ONLY the JSON object.\n' +
      '- No "Here\'s the data" or "Now I have..." preamble\n' +
      '- No markdown code fences\n' +
      '- No commentary after the JSON\n' +
      '- Start with `{` and end with `}` — nothing else.'
    }] });

    // Tool-use extraction loop (Phase 4) — falls back to plain call on errors
    let data;
    try {
      data = await scanExtractWithTools({
        model,
        max_tokens: SCAN_MAX_TOKENS,
        system: sysPrompt,
        messages,
        // Progress callback — surfaces tool-call activity to the UI so the
        // wait feels purposeful instead of silent.
        onProgress: (stage, detail) => {
          if (stage === 'tools') {
            setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>', detail);
          }
        },
      });
    } catch (toolErr) {
      console.warn('[scan] tool-use loop failed, falling back to plain extraction:', toolErr.message);
      data = await scanCallAnthropic({
        model,
        max_tokens: SCAN_MAX_TOKENS,
        system: sysPrompt,
        messages,
      });
    }

    // Extract JSON robustly — handles tool-use preamble like "Now I have..."
    const raw = data.content.find(c => c.type === 'text')?.text || '{}';
    const parsed = (typeof scanExtractJSON === 'function')
      ? scanExtractJSON(raw)
      : JSON.parse(raw.replace(/```json|```/g, '').trim());
    parsed._docType = docType;  // remember for save-correction later
    parsed._model = model;      // which model handled this scan
    parsed._modelLabel = modelLabel;

    // Ποιοτική πύλη (owner 10/8): «κάναμε πιο γρήγορο και χάλασε η ακρίβεια» —
    // το tiering έστελνε σύνθετα έγγραφα σε Sonnet όταν ο ταξινομητής έπεφτε
    // έξω. Αν λείπουν βασικά πεδία και ΔΕΝ έτρεξε ήδη Opus: μία αυτόματη
    // επανάληψη με το κορυφαίο μοντέλο, κρατάμε το καλύτερο αποτέλεσμα.
    if (model !== SCAN_MODEL_OPUS && _scanWeak(parsed)) {
      setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>',
        'Χαμηλή πληρότητα από το γρήγορο μοντέλο — επανάληψη με Opus (high accuracy)…');
      try {
        let d2;
        try {
          d2 = await scanExtractWithTools({ model: SCAN_MODEL_OPUS, max_tokens: SCAN_MAX_TOKENS,
            system: sysPrompt, messages,
            onProgress: (st2, det) => { if (st2 === 'tools') setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>', det); } });
        } catch (e2) {
          d2 = await scanCallAnthropic({ model: SCAN_MODEL_OPUS, max_tokens: SCAN_MAX_TOKENS, system: sysPrompt, messages });
        }
        const raw2 = d2.content.find(c => c.type === 'text')?.text || '{}';
        const p2 = (typeof scanExtractJSON === 'function')
          ? scanExtractJSON(raw2)
          : JSON.parse(raw2.replace(/```json|```/g, '').trim());
        if (_scanScore(p2) > _scanScore(parsed)) {
          p2._docType = docType; p2._model = SCAN_MODEL_OPUS;
          p2._modelLabel = 'Opus (auto-escalated)'; p2._escalated = true;
          return p2;
        }
      } catch (e3) { console.warn('[scan] escalation failed:', e3.message); }
    }
    return parsed;

  } catch (e) {
    setStatus('❌ ', e.message || 'Extraction failed', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '🤖 &nbsp;Extract & Fill Form'; }
    if (typeof logError === 'function') logError(e, 'intl_scan_extract');
    return null;
  }
}

// Πληρότητα εξαγωγής: πελάτης, φόρτωση, παράδοση, φορτίο — 0..4.
function _scanScore(d) {
  if (!d) return 0; let sc = 0;
  if (d.client_id || d.client_name) sc++;
  if ((d.loading_stops && d.loading_stops.length) || d.loading_city || d.loading_date) sc++;
  if ((d.delivery_stops && d.delivery_stops.length) || (d.unloading_stops && d.unloading_stops.length) || d.delivery_city || d.delivery_date) sc++;
  if (d.pallets || d.goods || d.reference) sc++;
  return sc;
}
function _scanWeak(d) { return _scanScore(d) < 3; }

// ═══ BATCH SCAN (owner 10/8): «η Lidl στέλνει 10 orders» — πολλαπλά αρχεία,
// διαδοχικό σκανάρισμα, μετά φόρμα-φόρμα: Save → ανοίγει το επόμενο. ═══
function _scanHandleFiles(fileList) {
  const files = [...(fileList || [])].filter(f => {
    if (f.size > 10*1024*1024) { toast(`${f.name}: >10MB — παραλείπεται`, 'warn'); return false; }
    const ok = (typeof scanEngineV2On === 'function' && scanEngineV2On())
      ? scanV2Accepts(f)
      : (f.type.startsWith('image/') || f.type === 'application/pdf');
    if (!ok) toast(`${f.name}: μη υποστηριζόμενος τύπος`, 'warn');
    return ok;
  }).slice(0, 10);
  if (!files.length) return;
  // Bug 10/8: «πρόσθετα 1-1 και το αντικαθιστούσε» — τώρα ΣΩΡΕΥΟΝΤΑΙ
  const prev = window._scanFiles || [];
  const seen = new Set(prev.map(f => f.name + ':' + f.size));
  const merged = [...prev, ...files.filter(f => !seen.has(f.name + ':' + f.size))].slice(0, 10);
  window._scanFiles = merged;
  window._scanUploadedFile = merged[0]; // συμβατότητα με single ροή
  const fi = document.getElementById('scanFile'); if (fi) fi.value = ''; // ξαναδιάλεξε και ίδιο αρχείο
  const btn = document.getElementById('btnScanGo');
  if (btn) { btn.disabled = false;
    btn.innerHTML = merged.length > 1 ? `🤖 &nbsp;Σκανάρισμα ${merged.length} αρχείων` : '🤖 &nbsp;Extract & Fill Form'; }
  const drop = document.getElementById('scanDrop');
  if (drop) drop.innerHTML = `<div style="font-size:26px;margin-bottom:6px">📄${files.length>1?'📄':''}</div>
    <div style="font-size:13px;font-weight:600">${merged.length===1?merged[0].name:merged.length+' αρχεία επιλεγμένα'}</div>
    <div style="font-size:11px;color:var(--text-dim);margin-top:3px">${merged.map(f=>f.name).slice(0,4).join(' · ')}${merged.length>4?' · …':''}</div>`;
}

async function _scanExtract() {
  const files = (window._scanFiles && window._scanFiles.length)
    ? window._scanFiles
    : (window._scanUploadedFile ? [window._scanUploadedFile] : []);
  if (!files.length) return;
  if (files.length === 1) {
    const parsed = await _scanExtractCore(files[0]);
    // Carried through _scanResult/_scanQueue to _scanOpen (round 3): the
    // side-by-side review needs the ORIGINAL file, not just the AI's reading
    // of it — nothing upstream of this point keeps a reference otherwise.
    if (parsed) parsed._scanFile = files[0];
    if (parsed) await _scanPreview(parsed);
    return;
  }
  // BATCH: σειριακό σκανάρισμα — το _scanPreview κάνει το matching και
  // αφήνει το αποτέλεσμα στο window._scanResult, το μαζεύουμε στην ουρά.
  window._scanQueue = []; window._scanQueueTotal = files.length; window._scanQueueDone = 0;
  const st = document.getElementById('scanStatus');
  for (let i = 0; i < files.length; i++) {
    if (st) { st.style.display='block';
      st.insertAdjacentHTML('afterbegin', `<div style="font-size:12px;font-weight:700;color: var(--accent-text);margin-bottom:6px">Αρχείο ${i+1}/${files.length}: ${files[i].name}</div>`); }
    try {
      window._scanResult = null;
      const parsed = await _scanExtractCore(files[i]);
      if (parsed) parsed._scanFile = files[i];   // see single-file branch above
      if (parsed) { await _scanPreview(parsed);
        if (window._scanResult) window._scanQueue.push({ ...window._scanResult, _fileName: files[i].name }); }
    } catch(e) { console.warn('[batch scan]', files[i].name, e.message); }
  }
  const n = window._scanQueue.length;
  if (!n) { toast('Κανένα αρχείο δεν σκαναρίστηκε επιτυχώς', 'error'); return; }
  if (st) st.insertAdjacentHTML('afterbegin',
    `<div class="oi-banner">
      ✓ Έτοιμα ${n}/${files.length} — οι φόρμες θα ανοίξουν μία-μία· Αποθήκευση → επόμενη.
      <button class="btn btn-success btn-sm" style="margin-left:8px" onclick="_scanQueueNext()">Άνοιγμα 1ης φόρμας →</button>
    </div>`);
  const btn = document.getElementById('btnScanGo'); if (btn) btn.style.display='none';
}

async function _scanQueueNext() {
  const q = window._scanQueue || [];
  if (!q.length) {
    if (window._scanQueueTotal > 1) toast(`Ολοκληρώθηκαν και τα ${window._scanQueueDone}/${window._scanQueueTotal} σκαν ✓`, 'success');
    window._scanQueueTotal = 0; window._scanQueueDone = 0;
    return;
  }
  const item = q.shift();
  window._scanQueueDone = (window._scanQueueDone || 0) + 1;
  // Το save-correction (submitIntlOrder) διαβάζει window._scanResult — μετά το
  // batch loop αυτό κρατούσε το ΤΕΛΕΥΤΑΙΟ αρχείο, οπότε οι διορθώσεις της
  // φόρμας i ζευγάρωναν με τα raw δεδομένα του αρχείου Ν και δηλητηρίαζαν το
  // κοινό training store (owner 12/8). Δείχνει πάντα το ΤΡΕΧΟΝ item.
  window._scanResult = { matched: item.matched, data: item.data };
  await _scanOpen(item.matched, item.data);
  setTimeout(() => {
    const t = document.getElementById('modalTitle');
    if (t && window._scanQueueTotal > 1)
      t.textContent += ` — Σκαν ${window._scanQueueDone}/${window._scanQueueTotal}${item._fileName ? ' · ' + item._fileName : ''}`;
  }, 80);
}

// ─── System prompt builder — adapts to document type ──────────────
function _intlBuildSystemPrompt(docType) {
  const baseSchema = `You are a logistics document parser for Petras Group (Greek transport company, EU operations).
Return ONLY valid JSON — no markdown, no explanation.

Output schema:
{
  "client_name": "company that issued the order",
  "client_id":   "Airtable rec id from search_clients tool, or null",
  "reference":   "transport / order / reference number (e.g. '6100080385', 'PO-3813', 'ZTM-001'). Look for: 'Transport number:', 'Order #:', 'Reference:', 'PO:', 'Reference No.', 'Auftragsnr.', 'Αρ. Παραγγελίας'. Return the numeric or alphanumeric value only (no labels). null if not found.",
  "goods": "comma-separated product descriptions (deduplicated)",
  "gross_weight_kg": number or null,
  "pallets": total pallet count across all loading stops,
  "temperature_c": number or null,
  "direction": "Export | Import",
  "price_eur": number or null,
  "confidence": "HIGH | MEDIUM | LOW",
  "field_confidence": {
    "client_name": 0.0-1.0,
    "reference": 0.0-1.0,
    "pallets": 0.0-1.0,
    "loading_stops": 0.0-1.0,
    "delivery_stops": 0.0-1.0,
    "dates": 0.0-1.0
  },
  "notes": "special instructions, trailer requirements",
  "loading_stops": [{
    "location_name": "supplier/warehouse name",
    "location_id":   "Airtable rec id from search_locations tool, or null",
    "city": "city in Latin script",
    "city_gr": "city in Greek if Greek",
    "country": "country",
    "date": "YYYY-MM-DD",
    "pallets": number
  }],
  "delivery_stops": [{
    "location_name": "consignee name",
    "location_id":   "Airtable rec id from search_locations tool, or null",
    "city": "city in Latin",
    "city_gr": "Greek if applicable",
    "country": "country",
    "date": "YYYY-MM-DD",
    "pallets": null
  }]
}

GLOBAL RULES:
- direction: if ALL loading addresses are in Greece → Export. If loading abroad → Import.
- Greek cities common: Ασπρόπυργος, Θεσσαλονίκη, Ναύπακτος, Ναύπλιο, Αγρίνιο, Βέλο, Κατερίνη, Πάτρα, Ηράκλειο
- field_confidence: 1.0 = read clearly, 0.7 = readable but ambiguous, 0.4 = barely legible
- Sum stop pallets must equal total pallets — if mismatch, lower confidence`;

  const typeSpecific = {
    CARRIER_ORDER: `\n\nDOCUMENT TYPE: Carrier Order (e.g. OGL Food Trade, Fruitservice GmbH).
- Each numbered table row group = one stop
- "Supplier" column = location_name for loading stops
- PAL column = sum per supplier group → loading_stop.pallets
- Unloading rows (↓ marker) = delivery_stops
- client_name = company name at top of document`,

    CMR: `\n\nDOCUMENT TYPE: CMR Waybill (international standard).
- Field 1 (Sender) = first loading_stop
- Field 2 (Consignee) = first delivery_stop
- Field 3 (Place of Delivery) = delivery city
- Field 4 (Place of Taking) = loading city
- Field 5 (Document attached) often references PO numbers
- Field 11 (Statistical Number) often = goods code
- Field 22 = sender signature, Field 23 = carrier, Field 24 = consignee
- Multiple senders/consignees may be listed`,

    DELIVERY_NOTE: `\n\nDOCUMENT TYPE: Greek Δελτίο Αποστολής.
- "Αποστολέας" = sender (loading_stop)
- "Παραλήπτης" = consignee (delivery_stop)
- "Είδος" / "Περιγραφή" = goods
- "Τεμάχια" or "Παλέτες" = pallets
- direction is most likely Export (Greek-issued)`,

    UNKNOWN: `\n\nDOCUMENT TYPE: Unknown — extract best-effort. Set confidence: LOW.`,
  };

  return baseSchema + (typeSpecific[docType] || typeSpecific.UNKNOWN);
}

async function _scanPreview(data) {
  const st  = document.getElementById('scanStatus');
  const btn = document.getElementById('btnScanGo');
  if (btn) { btn.disabled=false; btn.innerHTML='🤖 &nbsp;Extract & Fill Form'; }

  // Try to match client — prefer AI-supplied client_id (from tool use), then fuzzy fallback
  let clientId = '', clientLabel = '';
  if (data.client_id && typeof getRefClients === 'function') {
    const rec = (getRefClients() || []).find(c => c.id === data.client_id);
    if (rec) { clientId = rec.id; clientLabel = rec.fields?.['Company Name'] || ''; }
  }
  // v2 already matched over ALL clients in code; its "no match" means "not
  // sure" — a weaker fuzzy guess on top would prefill a wrong client silently.
  if (!clientId && data.client_name && data._engine !== 'v2') {
    // Fuzzy fallback (handles model not using tool, or unknown names)
    if (typeof scanFuzzyMatch === 'function' && typeof getRefClients === 'function') {
      const list = (getRefClients() || []).map(c => ({ id: c.id, label: c.fields?.['Company Name'] || '' })).filter(c => c.label);
      const best = scanFuzzyMatch(data.client_name, list, { threshold: 0.6, limit: 1 })[0];
      if (best) { clientId = best.id; clientLabel = best.label; }
    } else {
      const r = await _searchClients(data.client_name);
      if (r.length) { clientId = r[0].id; clientLabel = r[0].label; }
    }
  }

  // Match loading stops — prefer AI-supplied location_id, then fuzzy fallback
  const loadStops = (data.loading_stops||[]);
  if (!loadStops.length && data.loading_city) loadStops.push({location_name:'',city:data.loading_city,country:data.loading_country||'',date:data.loading_date,pallets:data.pallets});
  const _locMatch = s => {
    if (s.location_id) {
      const direct = _fhLocationsArr.find(l => l.id === s.location_id);
      if (direct) return direct;
    }
    if (data._engine === 'v2') return null;  // same reason as the client above
    // Try fuzzy first if available
    if (typeof scanFuzzyMatch === 'function') {
      const composite = [s.location_name, s.city_gr, s.city, s.country].filter(Boolean).join(' ');
      const best = scanFuzzyMatch(composite, _fhLocationsArr, { threshold: 0.55, limit: 1 })[0];
      if (best) return _fhLocationsArr.find(l => l.id === best.id);
    }
    const nm = (s.location_name||'').toLowerCase();
    const ct = (s.city||'').toLowerCase();
    const cg = (s.city_gr||'').toLowerCase();
    // Try: full name, first word of name, Greek city, Latin city
    return _fhLocationsArr.find(l=>nm && l.label.toLowerCase().includes(nm))
        || _fhLocationsArr.find(l=>nm && l.label.toLowerCase().includes(nm.split(/[\s-]+/)[0]))
        || _fhLocationsArr.find(l=>cg && l.label.toLowerCase().includes(cg))
        || _fhLocationsArr.find(l=>ct && l.label.toLowerCase().includes(ct));
  };
  for (const s of loadStops) {
    const m = _locMatch(s);
    s._locId = m?m.id:''; s._locLabel = m?m.label:(s.location_name||s.city_gr||s.city||'');
  }
  // Match delivery stops
  const delStops = (data.delivery_stops||[]);
  if (!delStops.length && data.delivery_city) delStops.push({location_name:'',city:data.delivery_city,city_gr:'',country:data.delivery_country||'',date:data.delivery_date,pallets:null});
  for (const s of delStops) {
    const m = _locMatch(s);
    s._locId = m?m.id:''; s._locLabel = m?m.label:(s.location_name||s.city_gr||s.city||'');
  }
  const loadLocId = loadStops[0]?._locId||'';
  const loadLocLabel = loadStops[0]?._locLabel||'';
  const delLocId = delStops[0]?._locId||'';
  const delLocLabel = delStops[0]?._locLabel||'';

  const conf = data.confidence||'LOW';
  const confC = conf==='HIGH'?'var(--ok)':conf==='MEDIUM'?'var(--warn)':'var(--danger)';

  const row = (label, val, matched) => val ? `
    <div class="detail-field">
      <span class="detail-field-label">${label}</span>
      <span class="detail-field-value" style="display:flex;align-items:center;gap:6px">
        ${val}
        <span style="font-size:11px;font-weight:600;color:${matched?'var(--ok)':'var(--warn)'};letter-spacing:0.5px">
          ${matched?'✓':'⚠'}
        </span>
      </span>
    </div>` : '';

  st.style.display='block';
  st.innerHTML = `
    <div style="background:var(--surface-sunken);border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:4px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap">
        <span class="detail-section-title" style="margin:0">AI Extraction
          ${data._docType && data._docType !== 'UNKNOWN' ? `<span class="scan-doc-type-badge">${data._docType.replace('_',' ')}</span>` : ''}
        </span>
        <span style="display:flex;align-items:center;gap:8px">
          ${data._modelLabel ? `<span style="font-size:11px;color:var(--text-mid)">${escapeHtml(data._modelLabel)}</span>` : ''}
          <span style="font-size:11px;font-weight:600;letter-spacing:1px;color:${confC}">${conf}</span>
        </span>
      </div>
      ${row('Client',   escapeHtml(clientLabel||data.client_name), !!clientId)}
      ${data.reference ? row('Reference', escapeHtml(String(data.reference)), true) : ''}
      ${/* s.country is whatever spelling the AI extracted from the document; countryName()
            returns it unchanged when unrecognised (K3), so this only ever improves the
            fallback line and never masks a real extraction miss. */''}
      ${loadStops.map((s,i)=>row('Loading '+(loadStops.length>1?i+1:''), escapeHtml(s._locLabel||s.city+(s.country?', '+(typeof countryName==='function'?countryName(s.country):s.country):'')), !!s._locId)).join('')}
      ${delStops.map((s,i)=>row('Delivery '+(delStops.length>1?i+1:''), escapeHtml(s._locLabel||s.city+(s.country?', '+(typeof countryName==='function'?countryName(s.country):s.country):'')), !!s._locId)).join('')}
      ${row('Load Date',  escapeHtml(data.loading_date),  true)}
      ${row('Del Date',   escapeHtml(data.delivery_date),  true)}
      ${row('Goods',      escapeHtml(data.goods),          true)}
      ${row('Weight',     data.gross_weight_kg?escapeHtml(data.gross_weight_kg)+' kg':null, true)}
      ${row('Pallets',    data.pallets?escapeHtml(String(data.pallets)):null, true)}
      ${row('Temp',       data.temperature_c!=null?escapeHtml(data.temperature_c)+' °C':null, true)}
      ${row('Direction',  escapeHtml(data.direction), true)}
      ${data.notes?`<div style="margin-top:8px;font-size:11px;color:var(--text-dim);font-style:italic">ℹ ${escapeHtml(data.notes)}</div>`:''}
    </div>
    <div style="font-size:11px;color:var(--text-dim);text-align:center;padding-top:4px">
      ⚠ = δεν βρέθηκε match · επιλογή χειροκίνητα στη φόρμα
    </div>`;

  // Store result globally — avoids JSON encoding issues in onclick
  // Λογικοί έλεγχοι (#5): ημερομηνίες/παλέτες/θερμοκρασία πριν το preview.
  try {
    const warns = [];
    const _ld = data.loading_date ? new Date(data.loading_date) : null;
    const _dd = data.delivery_date ? new Date(data.delivery_date) : null;
    if (_ld && _dd && !isNaN(_ld) && !isNaN(_dd) && _dd < _ld) warns.push('Η παράδοση είναι ΠΡΙΝ τη φόρτωση — έλεγξε τις ημερομηνίες');
    if (data.pallets && data.pallets > 33) warns.push(`Παλέτες ${data.pallets} > 33 (χωρητικότητα φορτηγού)`);
    if (data.temperature_c != null && (data.temperature_c < -30 || data.temperature_c > 30)) warns.push(`Θερμοκρασία ${data.temperature_c}°C εκτός λογικού εύρους`);
    // v2 stop dates live on the stops (the top-level dates above are v1-only).
    if (data._engine === 'v2') {
      const lds = (data.loading_stops || []).map(s => s.date).filter(Boolean).sort();
      const dds = (data.delivery_stops || []).map(s => s.date).filter(Boolean).sort();
      if (lds.length && dds.length && dds[0] < lds[lds.length - 1]) warns.push('Η παράδοση είναι ΠΡΙΝ τη φόρτωση — έλεγξε τις ημερομηνίες');
      (data._v2?.warnings || []).forEach(w => warns.push(escapeHtml(w)));
    }
    if (warns.length && st) st.insertAdjacentHTML('afterbegin', warns.map(w =>
      `<div class="oi-banner oi-banner-warn">⚠ ${w}</div>`).join(''));
  } catch (e) {}
  // Φύλακας διπλοεγγραφών (#5, owner 10/8): ίδιο Reference ήδη στο σύστημα;
  try {
    if (data.reference) {
      const esc = String(data.reference).replace(/'/g, "\\'");
      const dups = await atGetAll(TABLES.ORDERS, { filterByFormula: `{Reference}='${esc}'` }, false);
      if (dups && dups.length) {
        data._dupRef = dups[0].id;
        if (st) st.insertAdjacentHTML('afterbegin',
          `<div class="oi-banner oi-banner-bad">⚠ Υπάρχει ήδη παραγγελία με Reference «${escapeHtml(String(data.reference))}» — πιθανό διπλό, έλεγξε πριν την αποθήκευση.</div>`);
        toast(`⚠ Το Reference «${data.reference}» υπάρχει ήδη — πιθανό διπλό`, 'warn');
      }
    }
  } catch (e) {}
  window._scanResult = { matched: {clientId,clientLabel,loadLocId,loadLocLabel,delLocId,delLocLabel,loadStops,delStops}, data };

  // Update footer
  document.getElementById('modalFooter').innerHTML = `
    <button class="btn btn-ghost" onclick="closeModal()">Άκυρο</button>
    <button class="btn btn-ghost" onclick="openIntlScan()">↩ Νέα σάρωση</button>
    <button class="btn btn-success" onclick="_scanOpenStored()">Άνοιγμα φόρμας →</button>`;

  // Duplicate detection — fire-and-forget. If we find an existing order with
  // the same Reference, prepend a warning banner with link to open it.
  if (data.reference && typeof findDuplicateOrders === 'function') {
    findDuplicateOrders(data.reference, TABLES.ORDERS).then(dupes => {
      if (!dupes.length) return;
      const dupListHtml = dupes.map(d => {
        const f = d.fields;
        const loadDate = (f['Loading DateTime']||'').substring(0,10);
        // Δ2: 'Order Number' never reaches the browser; the Reference is the
        // number the team knows the order by.
        const orderNo = f['Reference'] || '—';
        return `<li style="margin:4px 0">
          <a href="#" onclick="event.preventDefault();closeModal();OrdersHub.openOrder('intl','${d.id}')">Παραγγελία ${escapeHtml(String(orderNo))}</a>
          <span style="font-size:11px"> · ${loadDate||'χωρίς ημερομηνία'} · ${escapeHtml(_clientName(f)||'—')}</span>
        </li>`;
      }).join('');
      st.insertAdjacentHTML('afterbegin', `
        <div class="oi-banner oi-banner-warn">
          <div style="font-size:13px">⚠ Πιθανό διπλό</div>
          <small>Βρέθηκε ήδη παραγγελία με Reference <strong>${escapeHtml(String(data.reference))}</strong>:</small>
          <ul style="margin:4px 0 0 16px;padding:0;font-size:12px;font-weight:400">${dupListHtml}</ul>
        </div>`);
    });
  }
}

async function _scanOpenStored() {
  const r = window._scanResult;
  if (r) await _scanOpen(r.matched, r.data);
}

async function _scanOpen(matched, data) {
  const f = {};
  if (matched.clientId) f['Client'] = [matched.clientId];
  if (data.reference)   f['Reference'] = String(data.reference);
  if (data.goods)       f['Goods']  = data.goods;
  if (data.notes)       f['Notes']  = String(data.notes);
  if (data.gross_weight_kg) f['Gross Weight kg'] = data.gross_weight_kg;
  if (data.temperature_c!=null) { f['Temperature °C'] = data.temperature_c; f['Refrigerator Mode'] = 'Continuous'; }
  if (data.direction)   f['Direction'] = data.direction;
  if (data.price_eur)   f['Price'] = data.price_eur;
  if (data.pallet_type) f['Pallet Type'] = data.pallet_type;   // only v2 extracts it (EUR/CHEP/Industrial)
  // Default Type for international orders (if AI didn't say otherwise)
  if (!f['Type']) f['Type'] = 'International';

  // Build synthetic stops in ORDER_STOPS shape so the form's stop renderer
  // picks them up via the new _scanPrefill path in _openModal.
  const ls = matched.loadStops || [];
  const ds = matched.delStops || [];
  const loadStops = ls.map((s, i) => ({
    fields: {
      [F.STOP_NUMBER]:   i + 1,
      [F.STOP_TYPE]:     'Loading',
      [F.STOP_LOCATION]: s._locId ? [s._locId] : null,
      [F.STOP_PALLETS]:  s.pallets != null ? s.pallets : 0,
      [F.STOP_DATETIME]: s.date || data.loading_date || '',
    },
  }));
  const unloadStops = ds.map((s, i) => {
    // For deliveries, sum up loading pallets if no per-stop pallets specified
    const totalLoadingPallets = ls.reduce((sum, x) => sum + (x.pallets || 0), 0) || data.pallets || 0;
    return {
      fields: {
        [F.STOP_NUMBER]:   i + 1,
        [F.STOP_TYPE]:     'Unloading',
        [F.STOP_LOCATION]: s._locId ? [s._locId] : null,
        [F.STOP_PALLETS]:  s.pallets != null ? s.pallets : (ds.length === 1 ? totalLoadingPallets : 0),
        [F.STOP_DATETIME]: s.date || data.delivery_date || '',
      },
    };
  });

  // Date fallbacks for legacy form fields (in case scan returned no stops)
  if (!ls.length && data.loading_date)  f['Loading DateTime']  = data.loading_date;
  if (!ds.length && data.delivery_date) f['Delivery DateTime'] = data.delivery_date;

  // Register matched locations + client in maps so autocomplete shows the label
  [...ls, ...ds].forEach(s => { if (s._locId && s._locLabel) _fhLocationsMap[s._locId] = s._locLabel; });
  if (matched.clientId && matched.clientLabel) _fhClientsMap[matched.clientId] = matched.clientLabel;

  closeModal();
  // Pass scan-derived stops via 4th arg so _openModal can render them
  await _openModal(null, f, matched.clientLabel, { loadStops, unloadStops });

  // Owner 28/9: the side-by-side review UI (round 3) is gone — the scan opens
  // the plain form, same as before round 3. Only the ORIGINAL file survives,
  // so it can still be uploaded after save (core/order-docs.js,
  // handleOrderSaved). Cleared in closeModal() if the form is closed/
  // cancelled without saving, so a stale scan's file never attaches to a
  // later, unrelated (e.g. hand-typed) order.
  if (data._scanFile) window._scanPendingDoc = { file: data._scanFile, source: 'scan' };
}

// Owner 28/9: orders have ONLY «Διαγραφή» — the soft «Ακύρωση» (Status
// 'Cancelled') was removed here, in orders_natl and on the pre-order. A
// cancelled row stayed on Weekly/Daily as a live order (order 394), and the
// team deleted anyway (24 deleted vs 1 cancelled). Legacy 'Cancelled' rows
// still render with their label (_OI_STATUS). docs/DECISION_LOG.md 28/9.
// ═══════════════════════════════════════════════════════════════
// DELETE — hard cascade. Removes the ORDER record + ALL linked
// downstream records (NL, GL, CL, RAMP, PALLET_LEDGER, ORDER_STOPS).
// The only way an order leaves (owner 28/9 — no more «Ακύρωση»).
// opts.rerender: the page to repaint afterwards (the pre-order delete on
// Weekly/Daily passes its own); default = the orders list.
// ═══════════════════════════════════════════════════════════════
// Round 1 O9 (critic-1 C1-07): a piece or a lot says what it is before it
// goes — the generic warning (NAT_LOADS, RAMP, «ΔΕΝ ΑΝΑΙΡΕΙΤΑΙ») scared the
// dispatcher off a 4-pallet loose piece and named none of what happens: its
// pallets go back to the lot. The record comes from what is on screen (the
// list, the Weekly, its shelf), else one read; unknown → the generic text.
async function _oiDeleteConfirmText(recId) {
  let f = (INTL_ORDERS.data || []).find(r => r.id === recId)?.fields;
  const W = window.WINTL && WINTL.data;
  if (!f && W) f = [...(W.exports || []), ...(W.imports || []), ...((W.stock && W.stock.loose) || [])].find(r => r && r.id === recId)?.fields;
  if (!f && typeof OrdersStock !== 'undefined' && OrdersStock._rec(recId)) {
    try { f = (await atGetOne(TABLES.ORDERS, recId))?.fields; } catch (e) { f = null; }
  }
  const generic = '🛑 ΔΙΑΓΡΑΦΗ International Order;\n\nΑυτό θα σβήσει ΚΑΙ:\n• Τα linked NAT_LOADS\n• GROUPAGE LINES + CONS_LOADS\n• RAMP records\n• PALLET LEDGER entries\n• ORDER_STOPS\n\nΗ ΕΝΕΡΓΕΙΑ ΔΕΝ ΑΝΑΙΡΕΙΤΑΙ.\n\nΕίσαι σίγουρος;';
  if (!f || typeof OrdersStock === 'undefined') return generic;
  const num = f['Order No'] ? '#' + f['Order No'] : (f['Reference'] || '');
  const pal = Number(f['Total Pallets']) || 0;
  if (OrdersStock.isPiece(f)) return `Διαγραφή κομματιού ${num} — οι ${pal}p γυρίζουν στην παρτίδα ${OrdersStock.lotNumLabel(f)}.\n\nΣυνέχεια;`;
  if (OrdersStock.isLot(f)) return `Διαγραφή παρτίδας ${num} (${pal}p) — το απόθεμα φεύγει μαζί της. Η βάση την αρνείται αν έχουν βγει κομμάτια ή αν τιμολογήθηκε.\n\nΣυνέχεια;`;
  return generic;
}
async function deleteIntlOrder(recId, opts) {
  if (!confirm(await _oiDeleteConfirmText(recId))) return;

  try {
    toast('Διαγραφή παραγγελίας...', 'info');
    let _delFail = 0;

    // 0. The ORDER itself goes FIRST (13/9 dispatcher audit, same as
    // deleteNatlOrder): a dispatcher may delete only split legs, so the old
    // order-last flow removed every child (loads, stops, ramp, PA) and then got
    // 403 on the order — a live «zombie» with nothing under it. A refused delete
    // now stops here, before anything is touched, and says why. The child
    // lookups below still resolve the legacy id (resolveLegacyToIds does not
    // filter deleted rows), so the cascade is unchanged.
    try {
      if (typeof atSoftDelete === 'function') await atSoftDelete(TABLES.ORDERS, recId);
      else await atDelete(TABLES.ORDERS, recId);
    } catch(e) {
      const m = String(e && e.message || e);
      // DL-03 + AU-07 (impact map 4/10): a refusal the Worker DESIGNED — a 422
      // such as STOCK_RULE «Το κομμάτι είναι σε φορτηγό — …» — is the reason
      // the user needs, and _atRetry has already logged it once ('_atRetry
      // 422'). The generic text hid it and the second logError doubled every
      // refusal in app_errors. core/api.js throws such answers (400/403/422)
      // with _noRetry and the Worker's own message — it does not carry
      // error.type — so _noRetry is the marker: shown as is, logged once.
      const designed = !!(e && e._noRetry);
      // _atRetry has ALREADY put the Worker's Greek answer on screen (a rule's
      // «no», e._rule, or another 4xx): repeating it as a second toast was the
      // same sentence twice (round-1 K1). Only the 403 gets its own pointer;
      // a designed refusal gets only the context (round 1b, D2): what did
      // not happen — the reason is the line above it.
      if (/403|forbidden|δικαίωμα/i.test(m)) toast('Χωρίς δικαίωμα διαγραφής παραγγελίας — ζήτα από τον owner', 'danger');
      else if (designed) toast('Η διαγραφή δεν έγινε — δεν άλλαξε τίποτα', 'warn');
      else toast('Η διαγραφή απέτυχε — δεν άλλαξε τίποτα', 'danger');
      if (!designed && typeof logError === 'function') logError(e, 'deleteIntlOrder (order first) ' + recId);
      return;
    }

    // 1. Delete NAT_LOADS (Direct VS) linked to this ORDER
    try {
      // No fields[] constraint — atDelete only needs IDs which Airtable always returns.
      // Specifying a field name that may not exist (Name) caused 422 errors on cascade.
      const nls = await atGetAll(TABLES.NAT_LOADS, {
        filterByFormula: `{Source Record}="${recId}"`,
      }, false);
      for (const nl of nls) {
        try { await atDelete(TABLES.NAT_LOADS, nl.id); } catch(e) { _delFail++; console.warn('NL delete:', e); }
      }
      if (nls.length) _tmsLog(`Deleted ${nls.length} NAT_LOADS for ORDER ${recId}`);
    } catch(e) { _delFail++; console.warn('NL cleanup error:', e); }

    // 2. Delete GL lines + linked CL + CL-linked NL (cascade through groupage)
    try {
      const gls = await atGetAll(TABLES.GL_LINES, {
        filterByFormula: `FIND("${recId}",ARRAYJOIN({Linked International Order},","))>0`,
        fields: ['Status']
      }, false);
      for (const gl of gls) {
        try {
          const cls = await atGetAll(TABLES.CONS_LOADS, {
            filterByFormula: `FIND("${gl.id}",ARRAYJOIN({Groupage Lines},","))>0`,
          }, false);
          for (const cl of cls) {
            // 13/9: a groupage truck (CL + its national load) is shared by N
            // orders — it survives while any line NOT belonging to this order
            // is still Assigned on it (same guard as deleteNatlOrder).
            let others = [];
            try { others = await clOtherAssignedLines(cl.id, gls.map(x => x.id)); } // core/order-sync.js — the one copy (A4)
            catch(e) { _delFail++; console.warn('CL share check:', e); continue; }
            if (others.length) continue;
            try {
              const nlsFromCL = await atGetAll(TABLES.NAT_LOADS, {
                filterByFormula: `FIND("${cl.id}",ARRAYJOIN({Source Consolidated Load},","))>0` /* 13/9: groupage loads link via the CL FK, never Source Record */,
              }, false);
              for (const nl of nlsFromCL) { try { await atDelete(TABLES.NAT_LOADS, nl.id); } catch(e) { _delFail++; } }
            } catch(e) { _delFail++; console.warn('NL-CL cleanup:', e); }
            try { await atDelete(TABLES.CONS_LOADS, cl.id); } catch(e) { _delFail++; console.warn('CL delete:', e); }
          }
        } catch(e) { _delFail++; console.warn('CL cleanup:', e); }
        try { await atSafePatch(TABLES.GL_LINES, gl.id, { Status: 'Unassigned' }); } catch(e) { _delFail++; console.warn('GL unassign:', e); } // never-delete rule (13/9): the DB refuses DELETE anyway
      }
      if (gls.length) _tmsLog(`Deleted ${gls.length} GL + linked CL/NL for ORDER ${recId}`);
    } catch(e) { _delFail++; console.warn('GL cleanup error:', e); }

    // 3. Delete RAMP records linked to this ORDER
    try {
      const ramps = await atGetAll(TABLES.RAMP, {
        filterByFormula: `FIND("${recId}",ARRAYJOIN({Order},","))>0`,
      }, false);
      for (const r of ramps) {
        try { await atDelete(TABLES.RAMP, r.id); } catch(e) { _delFail++; console.warn('Ramp delete:', e); }
      }
      if (ramps.length) _tmsLog(`Deleted ${ramps.length} RAMP records for ORDER ${recId}`);
    } catch(e) { _delFail++; console.warn('Ramp cleanup:', e); }

    // Παλέτες Φ2: pending φεύγουν, confirmed μένουν (ιστορικό)
    if (typeof rtOnOrderDeleted === 'function') await rtOnOrderDeleted(recId);
    if (typeof plOnOrderDeleted === 'function') await plOnOrderDeleted(recId, 'intl');

    // 5. ORDER_STOPS: the database removes them in the SAME transaction as the
    // order — every ORDERS DELETE goes through delete_order_cascade (Worker
    // handleOrderCascadeDelete); measured 29/9: order 400's 3 stops carry the
    // order's own deleted_at. The front used to reload the stops here via
    // stopsLoad → atGetOne(the order it had just deleted) → «Record not found»
    // toast + app_errors after a SUCCESSFUL delete (owner 08:59, Παντελής 09:41).

    // 5b. Delete PARTNER_ASSIGN records linked to this ORDER
    try {
      const pas = await atGetAll(TABLES.PARTNER_ASSIGN, {
        filterByFormula: `FIND("${recId}",ARRAYJOIN({${F.PA_ORDER}},","))>0`,
      }, false);
      for (const pa of pas) {
        try { await atDelete(TABLES.PARTNER_ASSIGN, pa.id); } catch(e) { _delFail++; console.warn('PA delete:', e); }
      }
      if (pas.length) _tmsLog(`Deleted ${pas.length} PARTNER_ASSIGN for ORDER ${recId}`);
    } catch(e) { _delFail++; console.warn('PA cleanup:', e); }

    // 6. (the ORDER itself was soft-deleted in step 0)
    invalidateCache(TABLES.ORDERS);
    invalidateCache(TABLES.NAT_LOADS);
    invalidateCache(TABLES.GL_LINES);
    invalidateCache(TABLES.CONS_LOADS);
    invalidateCache(TABLES.RAMP);

    toast(_delFail ? `Order deleted (${_delFail} linked records failed — δες error log)` : 'Order deleted', _delFail ? 'warn' : 'success');
    if (_delFail && typeof logError === 'function') logError(new Error(`Cascade delete: ${_delFail} sub-deletes failed`), 'deleteIntlOrder ' + recId);
    document.getElementById('intlDetail')?.classList.add('hidden');
    await ((opts && opts.rerender) || renderOrdersIntl)();
  } catch(e) {
    // Clean user message; raw error to the persistent log, not the toast.
    reportError('Η διαγραφή απέτυχε — δοκιμάστε ξανά');
    if (typeof logError === 'function') logError(e, 'deleteIntlOrder ' + recId);
  }
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP ORPHAN GROUPAGE LINES — finds GL records whose linked
// parent order no longer exists, plus their linked CL + NL +
// PALLET LEDGER + RAMP records, and deletes the lot.
//
// Use this when you've manually deleted orders in Airtable (bypassing
// the TMS cascade) and now see ghost lines in National Pick Ups.
//
// Run from console: cleanupOrphanGL()
// ═══════════════════════════════════════════════════════════════
async function cleanupOrphanGL() {
  toast('Σαρώνω τα GROUPAGE LINES…', 'info');
  let allGL, allIntl, allNatl;
  try {
    [allGL, allIntl, allNatl] = await Promise.all([
      atGetAll(TABLES.GL_LINES, {}, false),
      atGetAll(TABLES.ORDERS, { fields: ['Direction'] }, false),
      atGetAll(TABLES.NAT_ORDERS, { fields: ['Direction'] }, false),
    ]);
  } catch(e) {
    reportError('Η σάρωση GROUPAGE LINES απέτυχε', e);
    return;
  }

  const validIds = new Set([...allIntl.map(r => r.id), ...allNatl.map(r => r.id)]);

  // Find GL records whose every parent link points to a non-existent order
  const orphans = allGL.filter(gl => {
    const intlLinks = gl.fields['Linked International Order'] || [];
    const natlLinks = gl.fields['Linked National Order'] || [];
    const allLinks = [...intlLinks, ...natlLinks];
    if (!allLinks.length) return true;  // GL with no parent at all → orphan
    return !allLinks.some(id => validIds.has(id));  // none of the parents exist
  });

  if (!orphans.length) {
    toast('Δεν βρέθηκαν orphans — όλα καθαρά', 'success');
    return;
  }

  const ok = confirm(
    `Βρέθηκαν ${orphans.length} orphan GROUPAGE LINES (parent order δεν υπάρχει).\n\n` +
    `Θα διαγραφούν αυτά + τα linked CONS_LOADS + NAT_LOADS που εξαρτώνται.\n\n` +
    `Συνέχεια;`
  );
  if (!ok) return;

  let _delFail = 0;

  for (const gl of orphans) {
    try {
      // Cascade through groupage: GL → CL → NL
      try {
        const cls = await atGetAll(TABLES.CONS_LOADS, {
          filterByFormula: `FIND("${gl.id}",ARRAYJOIN({Groupage Lines},","))>0`,
        }, false);
        for (const cl of cls) {
          try {
            const nlsFromCL = await atGetAll(TABLES.NAT_LOADS, {
              filterByFormula: `FIND("${cl.id}",ARRAYJOIN({Source Consolidated Load},","))>0` /* 13/9: groupage loads link via the CL FK, never Source Record */,
            }, false);
            for (const nl of nlsFromCL) {
              try { await atDelete(TABLES.NAT_LOADS, nl.id); } catch(e) { _delFail++; }
            }
          } catch(e) { _delFail++; }
          try { await atDelete(TABLES.CONS_LOADS, cl.id); } catch(e) { _delFail++; }
        }
      } catch(e) { _delFail++; }
      // Delete the GL itself
      try { await atSafePatch(TABLES.GL_LINES, gl.id, { Status: 'Unassigned' }); } catch(e) { _delFail++; console.warn('orphan GL unassign:', e); }
    } catch(e) { _delFail++; }
  }

  invalidateCache(TABLES.GL_LINES);
  invalidateCache(TABLES.CONS_LOADS);
  invalidateCache(TABLES.NAT_LOADS);

  const msg = _delFail
    ? `Καθαρίστηκαν ${orphans.length - _delFail} orphans (${_delFail} failed — δες error log)`
    : `Καθαρίστηκαν ${orphans.length} orphan GROUPAGE LINES + linked records`;
  toast(msg, _delFail ? 'warn' : 'success');
  if (_delFail && typeof logError === 'function') {
    logError(new Error(`cleanupOrphanGL: ${_delFail} sub-deletes failed`), 'cleanupOrphanGL');
  }
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP ORPHANS (full sweep) — finds + deletes records whose
// parent order/load no longer exists. Covers:
//   • GROUPAGE_LINES + linked CONS_LOADS + NAT_LOADS
//   • PARTNER_ASSIGN
//   • RAMP records
//   • NAT_LOADS (Direct VS) with no Source Record
//
// Run from console: cleanupOrphans()
// ═══════════════════════════════════════════════════════════════
async function cleanupOrphans() {
  toast('Σαρώνω ολόκληρη τη βάση…', 'info');
  let allGL, allPA, allRamp, allDirNL, allIntl, allNatl, allNL;
  try {
    [allGL, allPA, allRamp, allNL, allIntl, allNatl] = await Promise.all([
      atGetAll(TABLES.GL_LINES, {}, false),
      atGetAll(TABLES.PARTNER_ASSIGN, {}, false),
      atGetAll(TABLES.RAMP, {}, false),
      atGetAll(TABLES.NAT_LOADS, {}, false),
      atGetAll(TABLES.ORDERS, { fields: ['Direction'] }, false),
      atGetAll(TABLES.NAT_ORDERS, { fields: ['Direction'] }, false),
    ]);
  } catch(e) {
    reportError('Η σάρωση απέτυχε', e);
    return;
  }

  const validOrderIds = new Set([...allIntl.map(r => r.id), ...allNatl.map(r => r.id)]);
  const validNLIds = new Set(allNL.map(r => r.id));

  // Orphan GL: no parent order link OR all linked orders have been deleted
  const orphGL = allGL.filter(gl => {
    const links = [...(gl.fields['Linked International Order'] || []), ...(gl.fields['Linked National Order'] || [])];
    if (!links.length) return true;
    return !links.some(id => validOrderIds.has(id));
  });

  // Orphan PA: linked Order field set but record gone (skip if linked via Nat Load with valid NL)
  const orphPA = allPA.filter(pa => {
    const orderLinks = pa.fields[F.PA_ORDER] || [];
    const nlLinks = pa.fields[F.PA_NAT_LOAD] || [];
    if (!orderLinks.length && !nlLinks.length) return true;
    const orderOk = orderLinks.some(id => validOrderIds.has(id));
    const nlOk = nlLinks.some(id => validNLIds.has(id));
    return !orderOk && !nlOk;
  });

  // Orphan RAMP: linked Order or National Order set but record gone
  const orphRamp = allRamp.filter(r => {
    const ordLinks = [...(r.fields['Order'] || []), ...(r.fields['National Order'] || [])];
    if (!ordLinks.length) return false;  // standalone manual ramp entries are valid, not orphans
    return !ordLinks.some(id => validOrderIds.has(id));
  });

  // Orphan NAT_LOADS (Direct VS) — Source Record points to deleted ORDER
  const orphDirNL = allNL.filter(nl => {
    const src = nl.fields['Source Record'];
    if (!src) return false;  // groupage NLs don't have Source Record, skip
    return !validOrderIds.has(src);
  });

  const total = orphGL.length + orphPA.length + orphRamp.length + orphDirNL.length;
  if (!total) {
    toast('Δεν βρέθηκαν orphans — όλα καθαρά', 'success');
    return;
  }

  const breakdown =
    `• ${orphGL.length} GROUPAGE LINES (+ linked CL/NL)\n` +
    `• ${orphPA.length} PARTNER ASSIGNMENTS\n` +
    `• ${orphRamp.length} RAMP records\n` +
    `• ${orphDirNL.length} NAT_LOADS (Direct VS)`;

  if (!confirm(`Βρέθηκαν ${total} orphan records:\n\n${breakdown}\n\nΣυνέχεια διαγραφής;`)) return;

  let _delFail = 0;

  // Delete GL chain
  for (const gl of orphGL) {
    try {
      const cls = await atGetAll(TABLES.CONS_LOADS, {
        filterByFormula: `FIND("${gl.id}",ARRAYJOIN({Groupage Lines},","))>0`,
      }, false);
      for (const cl of cls) {
        const clNLs = await atGetAll(TABLES.NAT_LOADS, { filterByFormula: `FIND("${cl.id}",ARRAYJOIN({Source Consolidated Load},","))>0` /* 13/9: groupage loads link via the CL FK, never Source Record */ }, false);
        for (const nl of clNLs) { try { await atDelete(TABLES.NAT_LOADS, nl.id); } catch(e) { _delFail++; } }
        try { await atDelete(TABLES.CONS_LOADS, cl.id); } catch(e) { _delFail++; }
      }
      try { await atSafePatch(TABLES.GL_LINES, gl.id, { Status: 'Unassigned' }); } catch(e) { _delFail++; }
    } catch(e) { _delFail++; }
  }

  // Delete PAs
  for (const pa of orphPA) {
    try { await atDelete(TABLES.PARTNER_ASSIGN, pa.id); } catch(e) { _delFail++; }
  }

  // Delete RAMP
  for (const r of orphRamp) {
    try { await atDelete(TABLES.RAMP, r.id); } catch(e) { _delFail++; }
  }

  // Delete Direct VS NLs
  for (const nl of orphDirNL) {
    try { await atDelete(TABLES.NAT_LOADS, nl.id); } catch(e) { _delFail++; }
  }

  invalidateCache(TABLES.GL_LINES);
  invalidateCache(TABLES.CONS_LOADS);
  invalidateCache(TABLES.NAT_LOADS);
  invalidateCache(TABLES.PARTNER_ASSIGN);
  invalidateCache(TABLES.RAMP);

  const msg = _delFail
    ? `Καθαρίστηκαν ${total - _delFail} orphans (${_delFail} failed)`
    : `Καθαρίστηκαν ${total} orphan records επιτυχώς`;
  toast(msg, _delFail ? 'warn' : 'success');
  if (_delFail && typeof logError === 'function') {
    logError(new Error(`cleanupOrphans: ${_delFail} sub-deletes failed`), 'cleanupOrphans');
  }
}

// Expose functions used from onclick/onchange/oninput/onblur handlers
// SW-6: the in-app pallet modal (modules/pallet_upload.js) saves sheet flags
// on the order, but the detail panel kept showing stale data — the dead
// iframe-close that used to refresh never ran. Single public hook: refetch
// one order into the store and repaint. Called by closePalletUpload().
async function _intlRefreshOrder(orderId) {
  try {
    const fresh = await atGetOne(TABLES.ORDERS, orderId);
    if (fresh && fresh.fields) {
      const idx = INTL_ORDERS.data.findIndex(r => r.id === orderId);
      if (idx >= 0) INTL_ORDERS.data[idx] = fresh;
      _intlRepaintOne(fresh);
    }
    invalidateCache(TABLES.ORDERS);
    if (INTL_ORDERS.selectedId === orderId) selectIntlOrder(orderId);
  } catch (e) { logError(e, 'orders_intl refresh after pallet save'); }
}
window._intlRefreshOrder = _intlRefreshOrder;

window.deleteIntlOrder = deleteIntlOrder;
window.cleanupOrphanGL = cleanupOrphanGL;
window.cleanupOrphans = cleanupOrphans;
window.renderOrdersIntl = renderOrdersIntl;
window.loadOrdersIntlData = loadOrdersIntlData;
window.openIntlScan = openIntlScan;
window.openIntlCreate = openIntlCreate;
window.openIntlEdit = openIntlEdit;
// Weekly v3: άνοιγμα φόρμας με fields από τον καλούντα (το weekly έχει δικά του records)
window.openIntlEditWith = (recId, fields) => _openModal(recId, fields||{});
window.openIntlPieceCreate = openIntlPieceCreate;
window._oiLotToggle = _oiLotToggle;
window._oiLotApply = _oiLotApply;
window._oiLotPallets = _oiLotPallets;
window._oiWhWarn = _oiWhWarn;   // PR-17: inline handlers of the loading stops
window._oiLotReopen = _oiLotReopen;   // O1: «Άνοιγμα ξανά» in the lot band
window.duplicateIntlOrder = duplicateIntlOrder;
window.selectIntlOrder = selectIntlOrder;
window._oiCloseCard = _oiCloseCard;
window.openIntlReadOnlyCard = openIntlReadOnlyCard;
window._oiBalanceUpdate = _oiBalanceUpdate;
window.submitIntlOrder = submitIntlOrder;
window._addStop = _addStop;
window._removeStop = _removeStop;
window._scanExtract = _scanExtract;
window._scanOpenStored = _scanOpenStored;
window._scanHandleFiles = _scanHandleFiles;
window._scanQueueNext = _scanQueueNext;
window._scanDrop = _scanDrop;
window._scanHandleFile = _scanHandleFile;
// Form dropdown handlers now in core/form-helpers.js (fhLocDrop, fhClientDrop, etc.)
// Legacy aliases for backward compat with any inline HTML that still uses old names
window._locDrop = fhLocDrop;
window._clientDrop = fhClientDrop;
window._hideDrop = fhHideDrop;
window._showDrop = fhShowDrop;
window._pickLinked = fhPickLinked;
// 9/9 (owner: «άλλαξα ημερομηνία σε Veroia Switch, το Weekly National δεν
// ενημερώθηκε»): core/order-sync.js runs the VS chain through the GLOBAL
// `_syncVeroiaSwitch`, but this function lived only inside this IIFE — so the
// chain's `typeof !== 'function'` guard returned silently on EVERY date change
// from the Weekly board / Daily Ops (proof: Worker log 12:53, PATCH orders/318
// followed by no NAT_LOADS request at all). Only the order form, which calls
// it directly, ever synced.
window._syncVeroiaSwitch = _syncVeroiaSwitch;
})();
