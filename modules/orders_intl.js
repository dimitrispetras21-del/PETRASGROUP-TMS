// ═══════════════════════════════════════════════
// MODULE — INTERNATIONAL ORDERS  v4
// ═══════════════════════════════════════════════
(function() {
'use strict';

const INTL_ORDERS = { data: [], filtered: [], selectedId: null };
const _intlFilters = {};
let _intlSortCol = null;   // current sort column key
let _intlSortDir = 0;      // 0=none, 1=asc, 2=desc
let _oiPage = 1;
const _oiPageSize = 50;
let _intlPeriod = '60'; // '60' | '180' | 'all'

// ─── Virtual Scroll State ─────────────────────
const _oiVS = { allRows: [], sortedRecs: [], lastStart: -1, lastEnd: -1, rafId: null };
const _OI_ROW_H = 40; // row height in px
const _OI_BUFFER = 10; // buffer rows above/below
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
// Resolve location names from ORDER_STOPS for a given order + stop type
function _stopsLocationSummary(orderId, stopType) {
  const stops = (window._intlStopsByOrder || {})[orderId];
  if (!stops || !stops.length) return null;
  const filtered = stops.filter(s => s.fields[F.STOP_TYPE] === stopType)
    .sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0));
  if (!filtered.length) return null;
  return filtered.map(s => {
    const locArr = s.fields[F.STOP_LOCATION];
    const locId = Array.isArray(locArr) ? locArr[0] : null;
    return locId ? (_fhLocationsMap[locId] || locId.slice(-6)) : '?';
  }).join(', ');
}
// Get total pallets from ORDER_STOPS loading stops
function _stopsTotalPallets(orderId) {
  const stops = (window._intlStopsByOrder || {})[orderId];
  if (!stops || !stops.length) return 0;
  return stops.filter(s => s.fields[F.STOP_TYPE] === 'Loading')
    .reduce((sum, s) => sum + (s.fields[F.STOP_PALLETS] || 0), 0);
}
function _weekNum(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const ws = new Date(jan1); ws.setDate(jan1.getDate() - jan1.getDay());
  return Math.floor((d - ws) / 604800000) + 1;
}

// ─── Alignment pass (παρτίδα 3, Figma w4-orders-interaction-spec 208:724) ──
// Owner 30/8: the layout STAYS; only colour, typography, card, motion.
// Everything below is display-only. DB values (Export/Pending/…) are never
// rewritten: filters, sorting, CSV and writes keep reading the raw field.
const _oiLocMeta = {};   // locId → {name, city, country} for the two-line cells
// A failed «Invoiced» write stays visible IN the cell until a write succeeds.
// A toast alone let the checkbox read as success while 0/89 rows were written
// (accountant → 403, ten days of production). Spec §2.
const _oiInvErr  = {};   // recId → error text
const _OI_STATUS = {
  'Pending':    { gr: 'Σε αναμονή',   dot: 'pending' },
  'Assigned':   { gr: 'Ανατεθειμένη', dot: 'assigned' },
  'In Transit': { gr: 'Σε μεταφορά',  dot: 'transit' },
  'Delivered':  { gr: 'Παραδόθηκε',   dot: 'delivered' },
  'Invoiced':   { gr: 'Τιμολογήθηκε', dot: 'invoiced' },
  'Cancelled':  { gr: 'Ακυρώθηκε',    dot: 'cancelled' },
};
const _OI_DIR    = { Export: '↑ Εξαγωγή', Import: '↓ Εισαγωγή' };
const _OI_DIR_W  = { Export: 'Εξαγωγή',   Import: 'Εισαγωγή' };
const _OI_REEFER = { 'Continuous': 'Συνεχής', 'Start-Stop': 'Start-Stop', 'No temp': 'Χωρίς ψύξη' };
// Status = 6px dot + word in --text-mid (spec §6): the colour lives only in
// the dot, the word carries the meaning (DESIGN.md #2).
function _oiStatusHtml(st) {
  const s = _OI_STATUS[st] || { gr: st || '—', dot: 'unknown' };
  return `<span class="oi-dot oi-dot-${s.dot}"></span><span class="oi-st">${escapeHtml(s.gr)}</span>`;
}
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
// Two-line cell (spec §5): names on line 1 — wraps, never ellipsis — and the
// first stop's city/country on line 2. Pre-normalisation orders have no
// ORDER_STOPS; they fall back to the legacy summary string, one line.
function _oiLocCell(r, type, summaryKey) {
  const stops = _oiStops(r.id, type);
  if (!stops.length) {
    const s = _cleanSummary(r.fields[summaryKey]);
    return `<span class="oi-name" title="${s}">${s}</span>`;
  }
  const locs = stops.map(_oiLocOf);
  // First stop by name; the others as «+N» on line 2 — the full list sits in
  // the title and in the card. Joining every name overflowed the two lines
  // the row allows (measured 3/9: 2-stop cells were the ones being cut).
  const names = locs[0].name;
  const all = locs.map(l => l.name).join(', ');
  const sub = [[locs[0].city, locs[0].country].filter(Boolean).join(', ')];
  if (locs.length > 1) sub.push(`+${locs.length - 1}`);
  // The cross-dock leg sits on the Greek side: loading for exports, delivery for imports.
  const cdSide = r.fields['Direction'] === 'Import' ? 'Unloading' : 'Loading';
  if (r.fields['Veroia Switch'] && type === cdSide) sub.push('μέσω CD');
  const subTxt = sub.filter(Boolean).join(' · ');
  return `<span class="oi-name" title="${escapeHtml(all)}">${escapeHtml(names)}</span>`
       + (subTxt ? `<span class="oi-sub" title="${escapeHtml(subTxt)}">${escapeHtml(subTxt)}</span>` : '');
}
function _oiAssignCell(f) {
  const pid = (f['Partner'] || [])[0];
  if (pid) {
    const pr = (typeof getRefPartners === 'function' ? getRefPartners() : []).find(x => x.id === pid);
    const name = pr?.fields?.['Company Name'] || 'Συνεργάτης';
    const sub = [f['Partner Truck Plates'] || '', 'συνεργάτης'].filter(Boolean).join(' · ');
    return `<span class="oi-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span><span class="oi-sub">${escapeHtml(sub)}</span>`;
  }
  const tid = (f['Truck'] || [])[0], did = (f['Driver'] || [])[0];
  if (!tid && !did) return '<span class="oi-miss">—</span>';
  const t = tid ? (typeof getRefTrucks === 'function' ? getRefTrucks() : []).find(x => x.id === tid) : null;
  const d = did ? (typeof getRefDrivers === 'function' ? getRefDrivers() : []).find(x => x.id === did) : null;
  const plate = t?.fields?.['License Plate'] || '';
  const driver = (d?.fields?.['Full Name'] || '').trim();
  return `<span class="oi-name">${escapeHtml(plate || driver || '—')}</span>`
       + (plate && driver ? `<span class="oi-sub" title="${escapeHtml(driver)}">${escapeHtml(driver)}</span>` : '');
}
// Signals sit next to the order number — no separate flags column (spec §6).
// VS keeps its colour (semantic, same navy as the Weekly VS badge); the rest
// are quiet.
function _oiFlags(f) {
  const out = [];
  if (f['Veroia Switch'])     out.push('<span class="oi-flag oi-flag-vs" title="Veroia Switch">VS</span>');
  if (f['National Groupage']) out.push('<span class="oi-flag" title="National Groupage">GRP</span>');
  if (f['Pallet Exchange'])   out.push('<span class="oi-flag" title="Ανταλλαγή παλετών">PE</span>');
  if (f['High Risk Flag'])    out.push('<span class="oi-flag oi-flag-hr" title="Υψηλό ρίσκο">⚠</span>');
  return out.join('');
}
function _oiInvCell(r) {
  const on = !!r.fields['Invoiced'], err = _oiInvErr[r.id];
  const inner = err ? `<span class="oi-inv-err" title="${escapeHtml(err)}">⚠</span>`
              : on  ? '<span class="oi-chk on" title="Τιμολογήθηκε — κλικ για αναίρεση">✓</span>'
                    : '<span class="oi-chk" title="Σήμανση ως τιμολογημένη"></span>';
  return `<td class="oi-inv" onclick="event.stopPropagation();toggleIntlInvoiced('${r.id}',${on})">${inner}</td>`;
}
function _oiPeriodLabel() {
  return _intlPeriod === '60' ? 'τελευταίες 60 ημέρες' : _intlPeriod === '180' ? 'τελευταίοι 6 μήνες' : 'όλες οι ημερομηνίες';
}
function _oiCloseCard() { document.getElementById('intlDetail')?.classList.add('hidden'); }

// Module-scoped styles, tokens only (DESIGN.md #1) — same pattern as the
// locations card. style.css is the integrator's file, not this unit's.
function _oiEnsureStyles() {
  if (document.getElementById('oiStyles')) return;
  const st = document.createElement('style'); st.id = 'oiStyles'; st.textContent = _oiCss();
  document.head.appendChild(st);
}
function _oiCss() { return `
.oi-layout .entity-table-wrap thead th{background:var(--surface-sunken);font-size:var(--text-2xs);font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-mid);padding:0 8px;height:30px;line-height:12px;white-space:normal;border-bottom:1px solid var(--silver-light);overflow:hidden;vertical-align:middle}
.oi-layout .entity-table-wrap tbody td{height:40px;padding:0 8px;font-size:var(--text-sm);line-height:13px;color:var(--text);border-bottom:1px solid var(--silver-light);white-space:normal;overflow:hidden;text-overflow:clip;max-width:none;vertical-align:middle}
.oi-layout .entity-table-wrap tbody tr{transition:none;cursor:pointer}
.oi-layout .entity-table-wrap tbody tr:hover td{background:var(--surface-sunken)}
.oi-layout .entity-table-wrap tbody tr.selected td{background:var(--accent-light)}
.oi-layout td strong{font-weight:700}
.oi-name{display:block;max-height:26px;overflow:hidden;overflow-wrap:anywhere}
.oi-name:only-child{max-height:39px}
.oi-sub{display:block;font-size:var(--text-2xs);line-height:12px;color:var(--text-dim);white-space:nowrap;overflow:hidden}
.oi-dim{color:var(--text-mid);font-size:var(--text-xs)}
.oi-num{font-variant-numeric:tabular-nums}
.oi-med{font-weight:500}
.oi-miss{color:var(--text-dim)}
.oi-layout .entity-table-wrap tbody td.oi-nowrap{white-space:nowrap}
.oi-flag{display:inline-block;margin-left:4px;padding:1px 4px;border-radius:3px;font-size:8px;line-height:10px;font-weight:700;vertical-align:1px;color:var(--navy-mid);background:var(--silver-light)}
.oi-flag-vs{background:var(--navy-mid);color:var(--text-inverse)}
.oi-flag-hr{background:var(--danger-bg);color:var(--danger-strong)}
.oi-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:6px;vertical-align:1px;background:var(--text-dim)}
.oi-dot-pending{background:var(--warning)}
.oi-dot-assigned{background:var(--accent)}
.oi-dot-transit{background:var(--navy-mid)}
.oi-dot-delivered{background:var(--success)}
.oi-dot-invoiced{background:var(--text-dim)}
.oi-dot-cancelled{background:var(--danger-strong)}
.oi-st{color:var(--text-mid);font-size:var(--text-xs)}
.oi-inv{cursor:pointer;text-align:center}
.oi-chk{display:inline-block;width:14px;height:14px;border:1.5px solid var(--border-dark);border-radius:4px;background:var(--bg-card);vertical-align:middle;line-height:11px;font-size:11px;font-weight:700;color:var(--text-mid)}
.oi-chk.on{border-color:var(--text-mid)}
.oi-inv-err{color:var(--danger-strong);font-weight:700;font-size:13px}
.oi-layout .entity-detail-panel{width:480px;flex-shrink:0;display:flex;flex-direction:column;background:var(--bg-card);border-left:1px solid var(--silver-light);position:relative;z-index:var(--z-raised);box-shadow:var(--shadow-panel);transition:none;overflow-y:auto;overflow-x:hidden}
.oi-layout .entity-detail-panel.hidden{display:none;width:0;border-left:none;box-shadow:none}
.oi-layout .entity-detail-panel:not(.hidden){animation:oi-slide var(--duration-fast) var(--ease-out)}
@keyframes oi-slide{from{transform:translateX(100%)}to{transform:none}}
.oi-card-head{background:var(--navy-mid);color:var(--text-inverse);padding:20px 22px 16px;flex-shrink:0}
.oi-card-title{display:flex;align-items:flex-start;gap:10px;font-family:'Syne',sans-serif;font-weight:700;font-size:17px;line-height:20px;letter-spacing:1px;text-transform:uppercase}
.oi-card-title span{flex:1;overflow-wrap:anywhere}
.oi-close{background:none;border:0;color:var(--panel-dim);font-size:18px;line-height:18px;cursor:pointer;padding:0 2px;font-family:inherit}
.oi-close:hover{color:var(--panel-text)}
.oi-card-sub{font-size:11.5px;color:var(--panel-dim);margin-top:4px}
.oi-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.oi-chip{display:inline-block;padding:3px 9px;border-radius:var(--radius-full);border:1px solid var(--panel-border);font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--panel-text)}
.oi-chip-warn{color:var(--panel-warn)}
.oi-chip-bad{color:var(--panel-bad)}
.oi-sect{padding:14px 22px 12px;border-top:1px solid var(--silver-light)}
.oi-sect:first-of-type{border-top:none}
.oi-sect-alt{background:var(--surface-sunken)}
.oi-sect-t{font-family:'Syne',sans-serif;font-weight:700;font-size:10.5px;letter-spacing:1.4px;text-transform:uppercase;color:var(--text-mid);margin-bottom:6px}
.oi-kv{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:4px 0;font-size:var(--text-sm)}
.oi-kv .k{color:var(--text-dim);font-size:11.5px;flex-shrink:0}
.oi-kv .v{font-weight:600;text-align:right;overflow-wrap:anywhere}
.oi-kv .v.miss{font-weight:400;color:var(--text-dim)}
.oi-kv .v.warn{color:var(--warning)}
.oi-stop{display:flex;align-items:baseline;gap:8px;padding:4px 0;font-size:var(--text-sm)}
.oi-stop .d{color:var(--text-mid);font-size:11.5px;min-width:30px}
.oi-stype{display:inline-block;border:1px solid var(--silver-light);border-radius:3px;padding:1px 6px;font-size:8.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text-mid);white-space:nowrap}
.oi-stop .n{flex:1;font-weight:600;overflow-wrap:anywhere}
.oi-stop .q{font-weight:700;white-space:nowrap}
.oi-note{font-size:11.5px;color:var(--warning);line-height:1.4}
.oi-text{font-size:11.5px;color:var(--text-mid);line-height:1.5;white-space:pre-wrap}
.oi-links{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:6px}
.oi-link{background:none;border:0;padding:0;font:inherit;font-size:11.5px;font-weight:500;color:var(--accent-text);cursor:pointer}
.oi-link:hover{text-decoration:underline}
.oi-link-danger{color:var(--danger-strong)}
.oi-sep{color:var(--text-dim)}
.oi-balance{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
.oi-balance:empty{display:none}
.oi-bal{display:inline-block;padding:5px 10px;border-radius:var(--radius);font-size:11.5px;font-weight:500;border:1px solid var(--border-mid)}
.oi-bal-bad{background:var(--danger-bg);border-color:var(--danger-strong);color:var(--danger-strong)}
.oi-bal-warn{background:var(--warning-soft);border-color:var(--warning-soft);color:var(--warning)}
`; }

// ─── Main ───────────────────────────────────────
async function renderOrdersIntl() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading orders...');
  try {
    // Date range filter based on period dropdown
    let _intlDateFormula = '';
    if (_intlPeriod !== 'all') {
      const days = _intlPeriod === '180' ? 180 : 60;
      const _intlCutoff = new Date();
      _intlCutoff.setDate(_intlCutoff.getDate() - days);
      const _intlCutoffStr = _intlCutoff.toISOString().split('T')[0];
      _intlDateFormula = `IS_AFTER({Loading DateTime}, '${_intlCutoffStr}')`;
    }
    const [, records] = await Promise.all([
      _loadLocations(),
      atGet(TABLES.ORDERS, _intlDateFormula || '', false),
    ]);
    records.sort((a,b) => (b.fields['Loading DateTime']||'').localeCompare(a.fields['Loading DateTime']||''));
    INTL_ORDERS.data = records;
    INTL_ORDERS.filtered = records;
    INTL_ORDERS.selectedId = null;
    Object.keys(_intlFilters).forEach(k => delete _intlFilters[k]);
    _oiPage = 1;
    // Apply dashboard nav filter if coming from KPI click
    if (window._dashNav) {
      if (window._dashNav.dir) _intlFilters.direction = window._dashNav.dir;
      if (window._dashNav.trip) _intlFilters.trip = window._dashNav.trip;
      window._dashNav = null;
    }
    // Batch fetch ORDER_STOPS for all orders (for list + detail display)
    const allStopIds = records.flatMap(r => r.fields['ORDER STOPS'] || []);
    window._intlStopsByOrder = {};
    if (allStopIds.length) {
      try {
        // Fetch in batches of 90 (OR formula limit)
        const stopRecs = [];
        for (let b = 0; b < allStopIds.length; b += 90) {
          const batch = allStopIds.slice(b, b + 90);
          const f = `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(',')})`;
          const recs = await atGetAll(TABLES.ORDER_STOPS, { filterByFormula: f }, false);
          stopRecs.push(...recs);
        }
        stopRecs.forEach(sr => {
          const parentArr = sr.fields[F.STOP_PARENT_ORDER];
          const parentId = Array.isArray(parentArr) ? parentArr[0] : null;
          if (parentId) {
            if (!window._intlStopsByOrder[parentId]) window._intlStopsByOrder[parentId] = [];
            window._intlStopsByOrder[parentId].push(sr);
          }
        });
      } catch(e) { console.warn('Batch ORDER_STOPS fetch:', e); }
    }
    // Inject Loading/Delivery Summary from ORDER_STOPS for orders missing them
    await _loadLocations();
    // City/country for the two-line cells. Same cached GET the form helpers
    // use (no new endpoint); the helpers keep only the joined label.
    try {
      (await atGet(TABLES.LOCATIONS)).forEach(l => {
        _oiLocMeta[l.id] = { name: l.fields['Name'] || '', city: l.fields['City'] || '', country: l.fields['Country'] || '' };
      });
    } catch(e) { console.warn('orders_intl: location meta', e); }
    records.forEach(r => {
      const loadSummary = _stopsLocationSummary(r.id, 'Loading');
      const delSummary = _stopsLocationSummary(r.id, 'Unloading');
      if (loadSummary && !r.fields['Loading Summary']) r.fields['Loading Summary'] = loadSummary;
      if (delSummary && !r.fields['Delivery Summary']) r.fields['Delivery Summary'] = delSummary;
    });
    // Pre-resolve all client names — batch fetches in parallel
    const clientIds = [...new Set(records.map(r=>(r.fields['Client']||[])[0]).filter(Boolean))];
    await fhBatchResolveClients(clientIds);
    _oiEnsureStyles();
    _renderIntlLayout(c);
    _applyIntlFilters();
  } catch(e) {
    c.innerHTML = showError('Failed to load international orders');
    if (typeof logError === 'function') logError(e, 'renderOrdersIntl load');
  }
}

function _renderIntlLayout(c) {
  const canEdit = can('orders') === 'full';
  const _i = n => (typeof icon === 'function') ? icon(n, 14) : '';
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:var(--space-4)">
      <div>
        <div class="page-title">Διεθνείς Παραγγελίες</div>
        <div class="page-sub" id="intlSub">${INTL_ORDERS.data.length} παραγγελίες · ${_oiPeriodLabel()}</div>
      </div>
      <div style="display:flex;gap:var(--space-2);align-items:center">
        <button class="btn btn-secondary btn-sm" onclick="openIntlScan()">${_i('camera')} Scan</button>
        ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="openIntlCreate()">+ Νέα παραγγελία</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="_intlExportCSV()">${_i('download')} CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="_intlPrint()">${_i('file_text')} Εκτύπωση</button>
      </div>
    </div>
    <div class="entity-layout oi-layout">
      <div class="entity-list-panel">
        <div class="entity-toolbar-v2">
          <div class="entity-search-wrap">
            ${_i('search')}
            <input class="entity-search-input" placeholder="Αναζήτηση πελάτη / τοποθεσίας / εμπορεύματος…"
              oninput="intlSearch(this.value)">
          </div>
          <select class="svc-filter" onchange="intlFilter('Direction',this.value)">
            <option value="">Κατεύθυνση: Όλες</option>
            <option value="Export">↑ Εξαγωγή</option>
            <option value="Import">↓ Εισαγωγή</option>
          </select>
          <select class="svc-filter" onchange="intlFilter('_status',this.value)">
            <option value="">Κατάσταση: Όλες</option>
            <option value="Pending">Σε αναμονή</option>
            <option value="Assigned">Ανατεθειμένη</option>
            <option value="In Transit">Σε μεταφορά</option>
            <option value="Delivered">Παραδόθηκε</option>
            <option value="Invoiced">Τιμολογήθηκε</option>
            <option value="Cancelled">Ακυρώθηκε</option>
          </select>
          <select class="svc-filter" onchange="intlFilter('Brand',this.value)">
            <option value="">Μάρκα: Όλες</option>
            <option value="Petras Group">Petras Group</option>
            <option value="DPS">DPS</option>
          </select>
          <select class="svc-filter" onchange="intlFilter('_week',this.value)">
            <option value="">Εβδομάδα: Όλες</option>
            ${_buildWeekOpts()}
          </select>
          <select class="svc-filter" onchange="intlPeriodChange(this.value)">
            <option value="60" ${_intlPeriod==='60'?'selected':''}>Τελευταίες 60 ημέρες</option>
            <option value="180" ${_intlPeriod==='180'?'selected':''}>Τελευταίοι 6 μήνες</option>
            <option value="all" ${_intlPeriod==='all'?'selected':''}>Όλα</option>
          </select>
          <span class="entity-count-chip" id="intlCount">${INTL_ORDERS.data.length}</span>
        </div>
        <div class="entity-table-wrap" id="intlTable"></div>
      </div>
      <div class="entity-detail-panel hidden" id="intlDetail"></div>
    </div>`;
}

function _buildWeekOpts() {
  const wn = currentWeekNumber(); let s = '';
  for (let w = wn-3; w <= wn+8; w++) {
    if (w < 1) continue;
    s += `<option value="${w}" ${w===wn?'selected':''}>${w===wn?'→ ':''} W${w}</option>`;
  }
  return s;
}

// Ανάθεση για τη λίστα (owner 12/8, για τιμολόγηση): συνεργάτης με πινακίδες
// ή δικές μας πινακίδες + οδηγός. Ονόματα από το REF_DATA (preloaded).
function _oiAssign(f){
  const pid=(f['Partner']||[])[0];
  if(pid){
    const pr=(typeof getRefPartners==='function'?getRefPartners():[]).find(x=>x.id===pid);
    return [pr?.fields?.['Company Name']||'Partner', f['Partner Truck Plates']||''].filter(Boolean).join(' \u00b7 ');
  }
  const tid=(f['Truck']||[])[0], did=(f['Driver']||[])[0];
  if(!tid&&!did) return '';
  const t=tid?(typeof getRefTrucks==='function'?getRefTrucks():[]).find(x=>x.id===tid):null;
  const d=did?(typeof getRefDrivers==='function'?getRefDrivers():[]).find(x=>x.id===did):null;
  return [t?.fields?.['License Plate']||'', (d?.fields?.['Full Name']||'').trim().split(/\s+/)[0]].filter(Boolean).join(' \u00b7 ');
}

// ─── Sort helpers ────────────────────────────────
// Widths sum to 1129px: measured 3/9 in the rig at 1920×1080 the list gets
// 1618px with the card closed and 1138px with the 480px card open. Anything
// wider than 1138 pushes the last column out of view (the 29/8 lesson).
// table-layout:fixed scales them up proportionally when the card is closed.
const _intlColDefs = [
  { key: 'orderNo',  label: 'ΑΡ. ΠΑΡ.',       type: 'text',   w: 104, get: (f) => f['Order Number']||'' },
  { key: 'week',     label: 'ΕΒΔ.',           type: 'number', w: 44,  get: (f) => f['Week Number']||0 },
  { key: 'dir',      label: 'ΚΑΤΕΥΘ.',        type: 'text',   w: 84,  get: (f) => f['Direction']||'' },
  { key: 'client',   label: 'ΠΕΛΑΤΗΣ',        type: 'text',   w: 130, get: (f) => _clientName(f) },
  { key: 'loading',  label: 'ΦΟΡΤΩΣΗ',        type: 'text',   w: 137, get: (f, r) => _stopsLocationSummary(r?.id,'Loading') || _cleanSummary(f['Loading Summary']) },
  { key: 'delivery', label: 'ΠΑΡΑΔΟΣΗ',       type: 'text',   w: 137, get: (f, r) => _stopsLocationSummary(r?.id,'Unloading') || _cleanSummary(f['Delivery Summary']) },
  { key: 'loadDate', label: 'ΗΜ. ΦΟΡΤΩΣΗΣ',   type: 'date',   w: 72,  get: (f) => f['Loading DateTime']||'' },
  { key: 'delDate',  label: 'ΗΜ. ΠΑΡΑΔΟΣΗΣ',  type: 'date',   w: 72,  get: (f) => f['Delivery DateTime']||'' },
  { key: 'pal',      label: 'ΠΑΛ.',           type: 'number', w: 40,  get: (f, r) => _stopsTotalPallets(r?.id) || f['Total Pallets'] || 0 },
  { key: 'assign',   label: 'ΑΝΑΘΕΣΗ',        type: 'text',   w: 106, get: (f) => _oiAssign(f) },
  { key: 'price',    label: 'ΤΙΜΗ €',         type: 'number', w: 64,  get: (f) => f['Price']||0 },
  { key: 'status',   label: 'ΚΑΤΑΣΤΑΣΗ',      type: 'text',   w: 99,  get: (f) => f['Status']||'Pending' },
  { key: 'inv',      label: 'ΤΙΜ.',           type: 'text',   w: 40,  get: (f) => f['Invoiced']?'1':'0' },
];

function _intlSortToggle(key) {
  if (_intlSortCol === key) {
    _intlSortDir = (_intlSortDir + 1) % 3;
    if (_intlSortDir === 0) _intlSortCol = null;
  } else {
    _intlSortCol = key;
    _intlSortDir = 1;
  }
  _applyIntlFilters();
}

function _intlSortRecords(recs) {
  if (!_intlSortCol || _intlSortDir === 0) return recs;
  const col = _intlColDefs.find(c => c.key === _intlSortCol);
  if (!col) return recs;
  const dir = _intlSortDir === 1 ? 1 : -1;
  return [...recs].sort((a, b) => {
    let va = col.get(a.fields, a), vb = col.get(b.fields, b);
    if (col.type === 'number') return ((parseFloat(va)||0) - (parseFloat(vb)||0)) * dir;
    if (col.type === 'date') return (va||'').localeCompare(vb||'') * dir;
    return String(va).toLowerCase().localeCompare(String(vb).toLowerCase()) * dir;
  });
}

// ─── Table (Virtual Scroll) ─────────────────────
// Column widths come from the shared <colgroup> (both the thead table and the
// virtual-scroll tbody table carry it), so cells carry no inline widths and
// nothing is clipped with ellipsis (DESIGN.md #6).
function _oiRowHtml(r) {
  const f = r.fields;
  const sel = r.id === INTL_ORDERS.selectedId ? ' selected' : '';
  const orderNo = escapeHtml((f['Order Number']||r.id.slice(-6)).replace(/["']+/g,''));
  const pal = _stopsTotalPallets(r.id) || f['Total Pallets'];
  const client = _clientName(f);
  return `<tr onclick="selectIntlOrder('${r.id}')" id="irow_${r.id}" class="oi-row${sel}" style="height:${_OI_ROW_H}px">
    <td><strong>${orderNo}</strong>${_oiFlags(f)}</td>
    <td class="oi-dim oi-num">W${escapeHtml(f['Week Number']||'—')}</td>
    <td class="oi-dim oi-nowrap">${escapeHtml(_OI_DIR[f['Direction']] || f['Direction'] || '—')}</td>
    <td><span class="oi-name" title="${client}">${client}</span></td>
    <td>${_oiLocCell(r, 'Loading', 'Loading Summary')}</td>
    <td>${_oiLocCell(r, 'Unloading', 'Delivery Summary')}</td>
    <td class="oi-num">${_oiDate(f['Loading DateTime'])}</td>
    <td class="oi-num">${_oiDate(f['Delivery DateTime'])}</td>
    <td class="oi-num oi-med">${pal ? escapeHtml(String(pal)) : '—'}</td>
    <td>${_oiAssignCell(f)}</td>
    <td class="oi-num oi-med">${_oiMoney(f['Price'])}</td>
    <td class="oi-nowrap">${_oiStatusHtml(f['Status']||'Pending')}</td>
    ${_oiInvCell(r)}
  </tr>`;
}

function _oiVirtualPaint() {
  const scroller = document.getElementById('oiVScroll');
  if (!scroller) return;
  const tbody = scroller.querySelector('tbody');
  const topSp = document.getElementById('oiTopSpacer');
  const botSp = document.getElementById('oiBottomSpacer');
  if (!tbody || !topSp || !botSp) return;

  const total = _oiVS.sortedRecs.length;
  const scrollTop = scroller.scrollTop;
  const visH = scroller.clientHeight;
  const startIdx = Math.max(0, Math.floor(scrollTop / _OI_ROW_H) - _OI_BUFFER);
  const endIdx = Math.min(total, Math.ceil((scrollTop + visH) / _OI_ROW_H) + _OI_BUFFER);

  // Skip if range unchanged
  if (startIdx === _oiVS.lastStart && endIdx === _oiVS.lastEnd) return;
  _oiVS.lastStart = startIdx;
  _oiVS.lastEnd = endIdx;

  topSp.style.height = (startIdx * _OI_ROW_H) + 'px';
  botSp.style.height = ((total - endIdx) * _OI_ROW_H) + 'px';

  const html = [];
  for (let i = startIdx; i < endIdx; i++) {
    html.push(_oiRowHtml(_oiVS.sortedRecs[i]));
  }
  tbody.innerHTML = html.join('');
}

function _oiOnScroll() {
  if (_oiVS.rafId) return;
  _oiVS.rafId = requestAnimationFrame(() => {
    _oiVS.rafId = null;
    _oiVirtualPaint();
  });
}

// OI-6: one source of truth for «which filters are narrowing the list» —
// shared by the empty state (OI-4) and the always-visible strip above the
// table, so the two can never disagree.
function _intlActiveFilters() {
  const active = [];
  if (_intlFilters['_q'])       active.push(`αναζήτηση «${escapeHtml(_intlFilters['_q'])}»`);
  if (_intlFilters['Direction'])active.push(`κατεύθυνση ${_intlFilters['Direction'] === 'Export' ? 'Εξαγωγή' : 'Εισαγωγή'}`);
  if (_intlFilters['_status'])  active.push(`κατάσταση ${escapeHtml((_OI_STATUS[_intlFilters['_status']] || {}).gr || _intlFilters['_status'])}`);
  if (_intlFilters['Status'])   active.push(`κατάσταση ${escapeHtml(_intlFilters['Status'])}`);
  if (_intlFilters['Brand'])    active.push(`μάρκα ${escapeHtml(_intlFilters['Brand'])}`);
  if (_intlFilters['_week'])    active.push(`εβδομάδα ${escapeHtml(String(_intlFilters['_week']))}`);
  if (_intlPeriod === '60')     active.push('τελευταίες 60 ημέρες');
  else if (_intlPeriod === '180') active.push('τελευταίοι 6 μήνες');
  return active;
}

function _renderIntlTable(records) {
  const wrap = document.getElementById('intlTable');
  const activeF = _intlActiveFilters();
  if (!records.length) {
    // OI-4: the empty state names the filters hiding the data (list built once
    // in _intlActiveFilters — see OI-6).
    const active = activeF;
    const hasFilters = active.length > 0;
    wrap.innerHTML = (typeof showEmpty === 'function') ? showEmpty({
      illustration: 'order',
      title: hasFilters ? 'Καμία παραγγελία με αυτά τα φίλτρα' : 'Καμία διεθνής παραγγελία',
      description: hasFilters
        ? `Ενεργά: ${active.join(' · ')}. Από ${INTL_ORDERS.data.length} συνολικά.`
        : 'Μόλις καταχωρηθεί η πρώτη παραγγελία, θα εμφανιστεί εδώ.',
      action: hasFilters
        ? { label: 'Καθαρισμός φίλτρων', onClick: '_intlClearFilters()' }
        : { label: '+ Νέα παραγγελία', onClick: 'openIntlCreate()' },
    }) : `<div style="text-align:center;padding:48px;color:var(--text-dim)">Καμία παραγγελία με αυτά τα φίλτρα</div>`;
    return;
  }
  const sortedRecs = _intlSortRecords(records);
  _oiVS.sortedRecs = sortedRecs;
  _oiVS.lastStart = -1;
  _oiVS.lastEnd = -1;

  const ths = _intlColDefs.map(c => {
    const arrow = _intlSortCol===c.key ? (_intlSortDir===1?' <span style="color: var(--accent-text)">▲</span>':_intlSortDir===2?' <span style="color: var(--accent-text)">▼</span>':'') : '';
    const click = c.nosort ? '' : ` onclick="_intlSortToggle('${c.key}')"`;
    const cursor = c.nosort ? 'default' : 'pointer';
    return `<th style="cursor:${cursor};user-select:none"${click}>${c.label}${arrow}</th>`;
  }).join('');
  const colgroup = `<colgroup>${_intlColDefs.map(c => `<col style="width:${c.w}px">`).join('')}</colgroup>`;

  const totalH = sortedRecs.length * _OI_ROW_H;
  // OI-6: with results SHOWING, active filters were invisible — the page could
  // land on «0 orders» (or 21 of 124) with nothing saying why. Slim strip
  // above the table names them and offers the existing clear action.
  const filterStrip = activeF.length ? `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 16px;font-size:11px;color:var(--text-dim);border-bottom:1px solid var(--border)">
      <span style="font-weight:600">Φίλτρα:</span> ${activeF.join(' · ')}
      <button type="button" onclick="_intlClearFilters()" style="margin-left:auto;background:none;border:1px solid var(--border-mid);border-radius:6px;padding:2px 10px;font-size:11px;color:var(--text-mid);cursor:pointer">Καθαρισμός</button>
    </div>` : '';
  wrap.innerHTML = `${filterStrip}`+`
    <div id="oiVScroll" style="height:calc(100vh - 280px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--border-dark) transparent">
      <table style="table-layout:fixed;width:100%">${colgroup}
        <thead><tr>${ths}</tr></thead>
      </table>
      <div id="oiTopSpacer" style="height:0"></div>
      <table style="table-layout:fixed;width:100%">${colgroup}<tbody></tbody></table>
      <div id="oiBottomSpacer" style="height:${totalH}px"></div>
    </div>
    <div style="padding:8px 16px;color:var(--text-dim);font-size:12px;text-align:center">${sortedRecs.length} παραγγελίες</div>`;

  const scroller = document.getElementById('oiVScroll');
  scroller.addEventListener('scroll', _oiOnScroll, { passive: true });
  _oiVirtualPaint();
}

// ─── Filters ────────────────────────────────────
function intlSearch(q) { _intlFilters._q = q.toLowerCase().trim(); _oiPage = 1; _applyIntlFilters(); }
function intlFilter(k,v) { if(!v) delete _intlFilters[k]; else _intlFilters[k]=v; _oiPage = 1; _applyIntlFilters(); }
function intlPeriodChange(v) { _intlPeriod = v; _oiVS.lastStart = -1; _oiVS.lastEnd = -1; renderOrdersIntl(); }

/** Καθαρίζει κάθε φίλτρο της λίστας και επαναφέρει το χρονικό εύρος. OI-4. */
function _intlClearFilters() {
  Object.keys(_intlFilters).forEach(k => delete _intlFilters[k]);
  _oiPage = 1;
  // Widening the period needs a REFETCH, not a re-filter: _applyIntlFilters()
  // only narrows INTL_ORDERS.data, which was fetched for the old window. And a
  // full re-render rebuilds the toolbar, so every <select> returns to its
  // default — the first version poked .entity-toolbar-v2 selects that are not
  // in that container, so the dropdowns kept showing filters no longer applied.
  // Both caught by the live check on 5/8.
  intlPeriodChange('all');
}

function _applyIntlFilters() {
  let recs = INTL_ORDERS.data;
  if (_intlFilters._q) {
    const q = _intlFilters._q;
    recs = recs.filter(r => {
      const f = r.fields;
      return _clientName(f).toLowerCase().includes(q)
        || String(f['Order Number']||'').toLowerCase().includes(q)
        || _cleanSummary(f['Loading Summary']).toLowerCase().includes(q)
        || _cleanSummary(f['Delivery Summary']).toLowerCase().includes(q)
        || (f['Goods']||'').toLowerCase().includes(q);
    });
  }
  if (_intlFilters['Direction']) recs = recs.filter(r => r.fields['Direction'] === _intlFilters['Direction']);
  if (_intlFilters['Status'])    recs = recs.filter(r => r.fields['Status']    === _intlFilters['Status']);
  if (_intlFilters['Brand'])     recs = recs.filter(r => r.fields['Brand']     === _intlFilters['Brand']);
  if (_intlFilters['_week'])     recs = recs.filter(r => String(r.fields['Week Number']) === String(_intlFilters['_week']));
  if (_intlFilters['_status']) {
    const sv = _intlFilters['_status'];
    recs = recs.filter(r => (r.fields['Status']||'Pending') === sv);
  }
  INTL_ORDERS.filtered = recs;
  _renderIntlTable(recs);
  const n = recs.length + (recs.length===1?' παραγγελία':' παραγγελίες');
  document.getElementById('intlCount').textContent = n;
  document.getElementById('intlSub').textContent   = `${n} · ${_oiPeriodLabel()}`;

  // The week the filter is actually querying. This is the figure that silently
  // pulled the wrong week before Wave 1 unified it on isoWeekNumber(): the
  // header said one week and the query used another, with nothing on screen to
  // show the mismatch. Reported so the audit keeps watching it.
  if (typeof reportPageMetrics === 'function') reportPageMetrics('orders_intl', {
    weekNumberDefault: typeof currentWeekNumber === 'function' ? currentWeekNumber() : -1,
    weekFilter: _intlFilters['_week'] ? Number(_intlFilters['_week']) : -1,
    total: INTL_ORDERS.data.length,
    shown: recs.length,
  });
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
}

function _oiCardHtml(rec) {
  const f = rec.fields, recId = rec.id;
  const canEdit = can('orders') === 'full';
  const orderNo = escapeHtml((f['Order Number']||recId.slice(-6)).replace(/["']+/g,''));
  const st = f['Status'] || 'Pending';
  const stGr = (_OI_STATUS[st] || {}).gr || st;
  // «Χωρίς ανάθεση» = no own truck AND no partner (owner 2/9). A partner load
  // IS assigned. Shown for every status: 15/89 delivered orders belong to
  // nobody and that gap must stay visible (DECISION_LOG 30/8).
  const pid = (f['Partner']||[])[0], tid = (f['Truck']||[])[0], did = (f['Driver']||[])[0];
  const unassigned = !tid && !pid;
  const pe = !!f['Pallet Exchange'], vs = !!f['Veroia Switch'];
  const chips = [
    `<span class="oi-chip">${escapeHtml(stGr)}</span>`,
    pe ? '<span class="oi-chip">Ανταλλαγή παλετών</span>' : '',
    vs ? '<span class="oi-chip">Veroia Switch</span>' : '',
    f['National Groupage'] ? '<span class="oi-chip">Groupage</span>' : '',
    unassigned ? '<span class="oi-chip oi-chip-warn">Χωρίς ανάθεση</span>' : '',
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
    return `<div class="oi-stop"><span class="d oi-num">${_oiDate(s.fields[F.STOP_DATETIME])}</span><span class="oi-stype">${label}</span><span class="n">${escapeHtml([l.name, l.city].filter(Boolean).join(', '))}</span><span class="q oi-num">${p ? escapeHtml(String(p)) + ' pal' : '—'}</span></div>`;
  };
  let route = _oiStops(recId, 'Loading').map(s => stopRow(s, 'Φόρτωση')).join('')
            + _oiStops(recId, 'Unloading').map(s => stopRow(s, 'Παράδοση')).join('');
  if (!route) {
    // Pre-normalisation record: no ORDER_STOPS, only the legacy summary strings.
    route = `<div class="oi-stop"><span class="oi-stype">Φόρτωση</span><span class="n">${_cleanSummary(f['Loading Summary'])}</span></div>
             <div class="oi-stop"><span class="oi-stype">Παράδοση</span><span class="n">${_cleanSummary(f['Delivery Summary'])}</span></div>`;
  }
  let assign = '';
  if (pid) {
    const pr = (typeof getRefPartners==='function'?getRefPartners():[]).find(x=>x.id===pid);
    assign = kv('Συνεργάτης', escapeHtml(pr?.fields?.['Company Name'] || 'Συνεργάτης'))
           + (f['Partner Truck Plates'] ? kv('Πινακίδες', escapeHtml(f['Partner Truck Plates'])) : '');
  } else if (!unassigned) {
    const t = tid ? (typeof getRefTrucks==='function'?getRefTrucks():[]).find(x=>x.id===tid) : null;
    const d = did ? (typeof getRefDrivers==='function'?getRefDrivers():[]).find(x=>x.id===did) : null;
    assign = (t ? kv('Φορτηγό', escapeHtml(t.fields?.['License Plate']||'')) : '')
           + (d ? kv('Οδηγός', escapeHtml(d.fields?.['Full Name']||'')) : '');
  }
  const assignBody = unassigned ? '<div class="oi-note">Χωρίς ανάθεση — η ανάθεση γίνεται στο Weekly International</div>' : assign;
  const canCancel = canEdit && !['Cancelled','Delivered','Invoiced'].includes(st);
  const actions = canEdit ? [
    `<button type="button" class="oi-link" data-oi-act="edit" onclick="openIntlEdit('${recId}')">Επεξεργασία</button>`,
    `<button type="button" class="oi-link" data-oi-act="dup" onclick="duplicateIntlOrder('${recId}')">Διπλασιασμός</button>`,
    canCancel ? `<button type="button" class="oi-link" data-oi-act="cancel" title="Σήμανση ως ακυρωμένη — η εγγραφή μένει" onclick="cancelIntlOrder('${recId}')">Ακύρωση</button>` : '',
    `<button type="button" class="oi-link oi-link-danger" data-oi-act="delete" title="Διαγραφή με cascade — NL/GL/CL/Ramp/Παλέτες" onclick="deleteIntlOrder('${recId}')">Διαγραφή</button>`,
  ].filter(Boolean).join('<span class="oi-sep">·</span>') : '';

  return `
    <div class="oi-card-head">
      <div class="oi-card-title"><span>${orderNo} · ${_clientName(f)}</span><button type="button" class="oi-close" title="Κλείσιμο (Esc)" onclick="_oiCloseCard()">×</button></div>
      <div class="oi-card-sub">${escapeHtml(_OI_DIR_W[f['Direction']] || f['Direction'] || '—')} · W${escapeHtml(f['Week Number']||'—')} · ${escapeHtml(f['Brand']||'—')}</div>
      ${f['Reference'] ? `<div class="oi-card-sub">Ref (${escapeHtml(f['Reference'])})</div>` : ''}
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
      ${kvm('Τιμή', hasPrice ? _oiMoney(f['Price']) : '')}
      ${f['Invoice Status'] ? kv('Κατάσταση τιμολόγησης', escapeHtml(f['Invoice Status'])) : ''}
      ${kv('Τιμολογήθηκε', f['Invoiced'] ? 'Ναι' : 'Όχι')}
    </div>
    <div class="oi-sect oi-sect-alt"><div class="oi-sect-t">Διαδρομή</div>${route}</div>
    ${pe ? `<div class="oi-sect"><div class="oi-sect-t">Δελτία παλετών</div>
      ${kv('Δελτίο 1', f['Pallet Sheet 1 Uploaded'] ? 'καταχωρημένο' : 'εκκρεμεί', f['Pallet Sheet 1 Uploaded'] ? '' : 'warn')}
      ${vs ? kv('Δελτίο 2 (cross-dock)', f['Pallet Sheet 2 Uploaded'] ? 'καταχωρημένο' : 'εκκρεμεί', f['Pallet Sheet 2 Uploaded'] ? '' : 'warn') : ''}
      <div class="oi-links"><button type="button" class="oi-link" onclick="openPalletUpload('${recId}')">Δελτίο παλετών →</button><button type="button" class="oi-link" onclick="navigate('pallet_ledger')">Ισοζύγιο παλετών →</button></div>
    </div>` : ''}
    <div class="oi-sect"><div class="oi-sect-t">Ανάθεση</div>${assignBody}
      <div class="oi-links"><button type="button" class="oi-link" onclick="navigate('weekly_intl')">άνοιγμα στο Weekly International →</button></div>
    </div>
    ${f['Notes'] ? `<div class="oi-sect oi-sect-alt"><div class="oi-sect-t">Σημειώσεις</div><div class="oi-text">${escapeHtml(f['Notes'])}</div></div>` : ''}
    ${actions ? `<div class="oi-sect"><div class="oi-sect-t">Ενέργειες</div><div class="oi-links">${actions}</div></div>` : ''}`;
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
        style="height:38px;border:none;background:none;color:var(--text-dim);font-size:17px;cursor:pointer;padding:0">×</button>`
    : '<div></div>';
  return `<div id="stoprow_${type}_${i}" style="display:grid;grid-template-columns:1fr 100px 130px 24px;gap:8px;margin-bottom:10px;align-items:end">
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
  const skip = new Set(['Order Number','Week Number','ORDER STOPS','Status','Truck','Trailer','Driver',
    'Partner','Is Partner Trip','Partner Rate','Partner Truck Plates','Matched Import ID',
    'NATIONAL ORDERS','Group ID','Created','Last Modified']);
  const copy = {};
  for (const k of Object.keys(f)) if (!skip.has(k)) copy[k] = f[k];
  let stopsPre = null;
  try {
    const st = await stopsLoad(recId, F.STOP_PARENT_ORDER);
    if (st.length) stopsPre = st.map(s => ({ fields: { ...s.fields } }));
  } catch(e) {}
  closeModal();
  await _openModal(null, copy, null, stopsPre);
}

async function _openModal(recId, f, _clientLabelOverride, _scanPrefill) {
  // Bug 11/8: από το Weekly η φόρμα άνοιγε ΠΡΙΝ φορτωθούν οι τοποθεσίες
  // (το init της σελίδας Orders δεν έχει τρέξει) → η αναζήτηση έδειχνε κενά.
  try { await fhLoadLocations(); } catch(e) { console.warn('locations preload:', e.message); }
  const isEdit = !!recId;
  const clientId = Array.isArray(f['Client']) ? f['Client'][0] : '';
  const clientLabel = _clientLabelOverride || (clientId ? (await _resolveClientName(clientId)) : '');

  // ── Try loading ORDER_STOPS (new normalized data) ──
  let _orderStops = [];
  if (isEdit) {
    try { _orderStops = await stopsLoad(recId, F.STOP_PARENT_ORDER); } catch(e) { console.warn('stopsLoad:', e); }
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

  const body = `
    <div class="form-grid">
      <!-- Owner 11/8: Brand/Type αφαιρέθηκαν — δεδομένα Petras Group / International -->
      <div class="form-field">
        <label class="form-label">Κατεύθυνση *</label>
        <select class="form-select" id="f_Direction"><option value="">— Επιλογή —</option>
          ${opt([['Export','Εξαγωγή'],['Import','Εισαγωγή']],'Direction')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Πελάτης *</label>
        ${_clientSelect('client', clientId, clientLabel)}
      </div>
      <div class="form-field">
        <label class="form-label">Τιμή (€) *</label>
        <input class="form-input" type="number" id="f_Price" value="${f['Price']||''}">
      </div>
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
        <select class="form-select" id="f_PalletType"><option value="">— Επιλογή —</option>
          ${opt(['EUR','CHEP','Industrial','Euro'],'Pallet Type')}</select>
      </div>
      <div class="form-field" style="padding-top:24px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="f_PalletExch" ${f['Pallet Exchange']?'checked':''} style="width:15px;height:15px">
          Ανταλλαγή παλετών (PE)</label>
      </div>
    </div>
    <div style="display:flex;gap:24px;margin:16px 0;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="f_HighRisk" ${f['High Risk Flag']?'checked':''} style="width:15px;height:15px">
        ⚠ Υψηλό ρίσκο</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="f_VeroiaSwitch" ${f['Veroia Switch']?'checked':''} style="width:15px;height:15px">
        Veroia Switch</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="f_Groupage" ${f['National Groupage']?'checked':''} style="width:15px;height:15px">
        National Groupage</label>
    </div>

    <div style="padding-top:16px;border-top:1px solid var(--border)">
      <div class="detail-section-title" style="margin-bottom:12px">Στάσεις φόρτωσης</div>
      <div id="stops_l" oninput="_oiBalanceUpdate()">${buildStopRows('l')}</div>
      <button type="button" class="btn btn-ghost" id="btn_addL"
        style="font-size:12px;padding:5px 14px" onclick="_addStop('l')"
        ${cntL>=10?'style="display:none"':''}>+ Προσθήκη στάσης φόρτωσης</button>
    </div>

    <div style="padding-top:16px;border-top:1px solid var(--border);margin-top:20px">
      <div class="detail-section-title" style="margin-bottom:12px">Στάσεις παράδοσης</div>
      <div id="stops_u" oninput="_oiBalanceUpdate()">${buildStopRows('u')}</div>
      <button type="button" class="btn btn-ghost" id="btn_addU"
        style="font-size:12px;padding:5px 14px" onclick="_addStop('u')"
        ${cntU>=10?'style="display:none"':''}>+ Προσθήκη στάσης παράδοσης</button>
      <div id="oiBalance" class="oi-balance"></div>
    </div>

    <div style="padding-top:16px;border-top:1px solid var(--border);margin-top:20px">
      <div class="form-field span-2">
        <label class="form-label">Σημειώσεις</label>
        <textarea class="form-textarea" id="f_Notes" rows="3" placeholder="Ειδικές οδηγίες, απαιτήσεις ρυμούλκας, επαφές…" style="width:100%;resize:vertical;min-height:60px">${escapeHtml(f['Notes']||'')}</textarea>
      </div>
    </div>`;

  const footer = `
    ${isEdit?`<button class="btn btn-ghost" title="Νέα παραγγελία με ίδια στοιχεία — αλλάζεις μόνο ημερομηνίες (π.χ. LABIDINO Δευ/Τετ/Παρ)" onclick="duplicateIntlOrder('${recId}')">Διπλασιασμός</button>`:''}
    ${(!isEdit&&window._scanQueue&&window._scanQueue.length)?`<button class="btn btn-ghost" title="Προσπέρασε αυτό το σκαν χωρίς αποθήκευση" onclick="closeModal();_scanQueueNext()">Παράλειψη → (${window._scanQueue.length} ακόμη)</button>`:''}
    <button class="btn btn-ghost" onclick="closeModal()">Άκυρο</button>
    <button class="btn btn-success" id="btnSubmit" onclick="submitIntlOrder('${recId||''}')">Αποθήκευση</button>`;

  document.getElementById('modal').style.maxWidth = '760px';
  _oiEnsureStyles();  // the form opens from the Weekly too, before this page has rendered
  openModal(isEdit ? 'Επεξεργασία παραγγελίας' : 'Νέα διεθνής παραγγελία', body, footer);
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
    catch(e) { console.warn('GRP cleanup on VS OFF:', e); }

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
    if (typeof toast === 'function') toast('VS sync skipped — no ORDER_STOPS found', 'error');
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
  let natLoadDt = null, natDelDt = null;
  if (direction === 'Export') {
    const localLoad = _vsToLocalDate(fields['Loading DateTime']);
    natLoadDt = localLoad;
    natDelDt  = _vsAddDays(localLoad, 1);
  } else {
    const localDel = _vsToLocalDate(fields['Delivery DateTime']);
    natDelDt  = localDel;
    natLoadDt = _vsAddDays(localDel, -1);
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
    delivLocs.forEach((locId, i) => {
      let pals = _totalPal;
      if (direction === 'Import' && _vsStops.length) {
        const unloadStop = _vsStops.filter(s => s.fields[F.STOP_TYPE] === 'Unloading')[i];
        if (unloadStop) pals = unloadStop.fields[F.STOP_PALLETS] || 0;
      }
      _nlStops.push({ stopNumber: i+1, stopType: 'Unloading', locationId: locId,
        pallets: pals, dateTime: _delDtISO, clientId: _clientId, goods: _goods, temp: _temp, ref: _ref });
    });
    if (_nlStops.length) {
      try { await stopsSave(nlId, _nlStops, F.STOP_PARENT_NL); }
      catch(e) { console.warn('NL ORDER_STOPS write error:', e); }
    }
  }

  // GRP OFF → delete any auto-created NAT_ORDER + its GL + CL + NL
  try { await _deleteGrpForIntl(orderId); }
  catch(e) { console.warn('GL cleanup (grp OFF):', e); }

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
// Finds GL lines via Linked International Order (JS filter), deletes GL + CL + NL
// ═══════════════════════════════════════════════════════════════
async function _deleteGrpForIntl(orderId) {
  // Fetch all GL lines — filter in JS by Linked International Order
  // (ARRAYJOIN on linked fields returns display names not IDs, so JS filter required)
  const allGLs = await atGetAll(TABLES.GL_LINES, {
    fields: ['Status', 'Linked International Order']
  }, false);
  const gls = allGLs.filter(r => {
    const links = r.fields['Linked International Order'] || [];
    return links.some(l => (l?.id || l) === orderId);
  });
  for (const gl of gls) {
    if (gl.fields.Status !== 'Assigned') {
      try {
        const cls = await atGetAll(TABLES.CONS_LOADS, {
          filterByFormula: `FIND("${gl.id}",ARRAYJOIN({Groupage Lines},","))>0`,
        }, false);
        for (const cl of cls) {
          try {
            const nls = await atGetAll(TABLES.NAT_LOADS, {filterByFormula:`{Source Record}="${cl.id}"`},false);
            for (const nl of nls) await atDelete(TABLES.NAT_LOADS, nl.id);
          } catch(e) { logError(e, '_deleteGrpForIntl: delete NL'); }
          await atDelete(TABLES.CONS_LOADS, cl.id);
        }
      } catch(e) { logError(e, '_deleteGrpForIntl: delete CL'); }
      // Business rule: GL records are NEVER deleted — set to Unassigned instead.
      try { await atPatch(TABLES.GL_LINES, gl.id, { Status: 'Unassigned' }); }
      catch(e) { if (typeof logError === 'function') logError(e, '_deleteGrpForIntl: GL→Unassigned'); }
    }
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

  try {
    const fields = {};

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
    fields['Pallet Exchange'] = ck('f_PalletExch');
    fields['High Risk Flag']  = ck('f_HighRisk');
    fields['Veroia Switch']  = ck('f_VeroiaSwitch');
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
    if (ck('f_VeroiaSwitch')) {
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
          fields: ['Status', 'Linked International Order']
        }, false);
        const assignedGLs = allGLs.filter(r => {
          const links = r.fields['Linked International Order'] || [];
          return links.some(l => (l?.id||l) === recId) && r.fields.Status === 'Assigned';
        });
        if (assignedGLs.length > 0) {
            const ok = await confirmAction(
              `Η παραγγελία αυτή έχει ήδη ενταχθεί σε groupage φορτίο.\n\n` +
              `Αν αποθηκεύσεις αλλαγές, το φορτίο θα διαλυθεί αυτόματα\n` +
              `ώστε να ξαναφτιαχτεί με τα νέα δεδομένα.\n\n` +
              `Θέλεις να συνεχίσεις;`,
              { title: 'Groupage φορτίο', confirmLabel: 'Συνέχεια', danger: true }
            );
            if (!ok) { btn.textContent = 'Αποθήκευση'; btn.disabled = false; return; }

            // Auto-restore: delete CL + NL, set GL → Unassigned
            toast('Auto-restore CL...', 'info');
            for (const gl of assignedGLs) {
              try {
                const cls = await atGetAll(TABLES.CONS_LOADS, {
                  filterByFormula: `FIND("${gl.id}",ARRAYJOIN({Groupage Lines},","))>0`,
                  fields: ['Name']
                }, false);
                for (const cl of cls) {
                  try {
                    const nls = await atGetAll(TABLES.NAT_LOADS, {
                      filterByFormula: `{Source Record}="${cl.id}"`,
                    }, false);
                    for (const nl of nls) await atDelete(TABLES.NAT_LOADS, nl.id);
                  } catch(e) { console.warn('auto-restore NL delete:', e); }
                  await atDelete(TABLES.CONS_LOADS, cl.id);
                }
              } catch(e) { console.warn('auto-restore CL delete:', e); }
              await atPatch(TABLES.GL_LINES, gl.id, { 'Status': 'Unassigned' });
            }
            invalidateCache(TABLES.CONS_LOADS);
            invalidateCache(TABLES.NAT_LOADS);
            invalidateCache(TABLES.GL_LINES);
            toast('Το φορτίο διαλύθηκε — συνεχίζει η αποθήκευση...', 'info');
          }
      } catch(e) { console.warn('Pre-save CL restore:', e); }
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
    const result = recId
      ? await atSafePatch(TABLES.ORDERS, recId, fields)
      : await atCreate(TABLES.ORDERS, fields);
    if (result?.conflict) { toast('Record modified by another user — reload and try again','warn'); return; }

    if (result?.error) throw new Error(result.error.message || JSON.stringify(result.error));

    invalidateCache(TABLES.ORDERS);

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

    try {
      toast('Syncing VS national load...', 'info');
      const rec = await atGetOne(TABLES.ORDERS, savedOrderId);
      _tmsLog('SYNC: fetched record', savedOrderId, rec.fields?.[F.VEROIA_SWITCH], rec.fields?.['Direction'], rec.fields?.['Type']);
      if (!rec.fields) { toast('SYNC ERROR: no fields', 'warn'); return; }
      await _syncVeroiaSwitch(savedOrderId, rec.fields);
      // Central sync — RAMP trigger + PL cleanup (if PE=OFF) + cache invalidation
      if (typeof syncOrderDownstream === 'function') {
        syncOrderDownstream(savedOrderId, { source: 'intl', skipVS: true, skipGRP: true })
          .catch(e => console.warn('[intl save sync]', e));
      }
      toast('National load synced ✓');
    } catch(e) {
      console.error('VS sync error:', e);
      reportError('Ο συγχρονισμός εθνικού φορτίου απέτυχε', e, 'warn');
    }

    document.getElementById('modal').style.maxWidth = '';
    closeModal();
    toast(recId ? 'Order updated ✓' : 'Order created ✓');
    // Weekly v3: το modal ανοίγει και από το Weekly International — το repaint
    // πρέπει να σεβαστεί τη σελίδα που είναι ανοιχτή, όχι να τη hijack-άρει.
    if (typeof currentPage!=='undefined' && currentPage==='weekly_intl' && typeof renderWeeklyIntl==='function') { renderWeeklyIntl(); }
    else if (typeof currentPage!=='undefined' && currentPage==='weekly_natl' && typeof renderWeeklyNatl==='function') { renderWeeklyNatl(); }
    else await renderOrdersIntl();
    // Batch scan: Save → αμέσως η επόμενη φόρμα της ουράς
    if (window._scanQueue && (window._scanQueue.length || window._scanQueueTotal > 1)) { setTimeout(() => _scanQueueNext(), 250); }

  } catch(e) {
    // 'validation' is the sentinel thrown after a blocking validation alert (line ~1259);
    // that path already messaged the user, so don't double-report.
    if (e.message !== 'validation') reportError('Σφάλμα αποθήκευσης παραγγελίας', e);
    if (btn) { btn.textContent = 'Αποθήκευση'; btn.disabled = false; }
  }
}

// ─── Inline toggle ───────────────────────────────
async function toggleIntlInvoiced(recId, current) {
  const newVal = !current;
  // Block invoice if PE sheets missing
  if (newVal && !(await _checkPalletSheets(recId))) return;
  try {
    const res = await atSafePatch(TABLES.ORDERS, recId, { 'Invoiced': newVal });
    if (res?.conflict) { toast('Η εγγραφή άλλαξε από άλλον χρήστη — ανανέωσε', 'warn'); return; }
    if (res?.error) throw new Error(res.error.message || JSON.stringify(res.error));
    delete _oiInvErr[recId];
    // Update local data
    const rec = INTL_ORDERS.data.find(r => r.id === recId);
    if (rec) rec.fields['Invoiced'] = newVal;
    // Central sync (Invoiced flag affects NAT_LOADS mirror status)
    if (typeof syncOrderDownstream === 'function') {
      syncOrderDownstream(recId, { source: 'intl', changedFields: ['Invoiced'], skipVS: true, skipGRP: true, skipRamp: true, skipPA: true })
        .catch(e => console.warn('[intl invoice sync]', e));
    }
    // Re-render table only (no full reload); the open card must follow too
    _applyIntlFilters();
    if (INTL_ORDERS.selectedId === recId) selectIntlOrder(recId);
    toast(newVal ? 'Σημειώθηκε ως τιμολογημένη' : 'Αφαιρέθηκε η τιμολόγηση');
  } catch(e) {
    // The failure stays IN the cell (spec §2), not only in a toast: the
    // accountant gets 403 on orders and «Invoiced» read as success for ten
    // days with 0/89 rows written. Cleared only by a write that succeeds.
    _oiInvErr[recId] = 'Δεν γράφτηκε: ' + (e && e.message ? e.message : 'σφάλμα');
    _applyIntlFilters();
    reportError('Η τιμολόγηση ΔΕΝ γράφτηκε — η ένδειξη ⚠ μένει στη γραμμή', e);
  }
}

// ─── Status Change ─────────────────────────────
async function _intlChangeStatus(recId, newStatus) {
  try {
    const res = await atSafePatch(TABLES.ORDERS, recId, { 'Status': newStatus });
    if (res?.conflict) { toast('Record modified by another user — refresh','warn'); return; }
    // Central sync — propagates status to partner assignments + downstream
    if (typeof syncOrderDownstream === 'function') {
      syncOrderDownstream(recId, { source: 'intl', changedFields: ['Status'], skipVS: true, skipGRP: true, skipRamp: true })
        .catch(e => console.warn('[intl status sync]', e));
    }
    const rec = INTL_ORDERS.data.find(r => r.id === recId);
    if (rec) rec.fields['Status'] = newStatus;
    _applyIntlFilters();
    selectIntlOrder(recId);
    toast(`Status → ${newStatus} ✓`);
  } catch(e) { reportError('Σφάλμα αλλαγής status', e); }
}

// ─── Invoice Block — check PE sheets ─────────
async function _checkPalletSheets(recId) {
  const rec = INTL_ORDERS.data.find(r => r.id === recId);
  if (!rec) return true;
  const f = rec.fields;
  if (!f['Pallet Exchange']) return true; // no PE, allow invoice
  if (!f['Pallet Sheet 1 Uploaded']) {
    toast('Λείπει το Δελτίο 1 — καταχώρησέ το πριν την τιμολόγηση', 'danger');
    return false;
  }
  if (f['Veroia Switch'] && !f['Pallet Sheet 2 Uploaded']) {
    toast('Λείπει το Δελτίο 2 (cross-dock) — καταχώρησέ το πριν την τιμολόγηση', 'danger');
    return false;
  }
  return true;
}

// ─── Pallet Sheet Upload ───────────────
// SW-2: this module used to carry a SECOND openPalletUpload/closePalletUpload
// pair (an iframe overlay to the petras-assign standalone). Both were dead:
// modules/pallet_upload.js loads later in app.html and its top-level function
// declarations rebind the globals, so the in-app modal always won. The pair
// survived only through script order — reordering app.html would have swapped
// implementations silently. Removed 2026-08-07 (verified live: the button on a
// real order opens the in-app modal, zero errors). The buttons below keep
// calling the global openPalletUpload(recId), now with a single owner.
// Known gap carried over: after the in-app modal saves, the order detail is
// not refreshed — the dead close() used to do that but never ran. See SW-6.

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
      style="border:2px dashed var(--border-dark);border-radius:8px;padding:36px 20px;
             text-align:center;cursor:pointer;background:var(--bg);transition:border-color 0.15s"
      onclick="document.getElementById('scanFile').click()"
      ondragover="event.preventDefault();document.getElementById('scanDrop').style.borderColor='var(--accent)'"
      ondragleave="document.getElementById('scanDrop').style.borderColor='var(--border-dark)'"
      ondrop="_scanDrop(event)">
      <div style="font-size:30px;margin-bottom:8px;opacity:0.35">📎</div>
      <div style="font-size:13px;font-weight:500;color:var(--text-mid)">Drag & drop ή κλικ για upload</div>
      <div style="font-size:12px;color:var(--text-dim);margin-top:4px">JPG · PNG · PDF — max 10MB · έως 10 αρχεία μαζί (π.χ. 10 orders Lidl)</div>
      <button type="button" class="btn btn-ghost btn-sm" style="margin-top:12px"
        onclick="event.stopPropagation();document.getElementById('scanCamera').click()">
        📷 &nbsp;Λήψη με κάμερα
      </button>
    </div>
    <input type="file" id="scanFile" accept="image/*,application/pdf" multiple style="display:none"
      onchange="_scanHandleFiles(this.files)">
    <input type="file" id="scanCamera" accept="image/*" capture="environment" style="display:none"
      onchange="_scanHandleFile(this.files[0])">

    <div id="scanStatus" style="display:none;margin-top:14px"></div>`,

  `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
   <button class="btn btn-success" id="btnScanGo" onclick="_scanExtract()" disabled>
     🤖 &nbsp;Extract & Fill Form
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
    toast(`File too large (${(file.size/1024/1024).toFixed(1)}MB) — max 10MB`, 'error');
    return;
  }
  const okType = file.type.startsWith('image/') || file.type === 'application/pdf';
  if (!okType) {
    toast('Only JPG / PNG / PDF supported', 'error');
    return;
  }

  window._scanUploadedFile = file;
  window._scanFiles = [...(window._scanFiles||[]), file].slice(0, 10);
  const btn = document.getElementById('btnScanGo');
  if (btn) btn.disabled = false;

  const drop = document.getElementById('scanDrop');
  if (drop) drop.innerHTML = `
    <div style="font-size:24px;margin-bottom:6px">✅</div>
    <div style="font-size:13px;font-weight:500;color:var(--success)">${escapeHtml(file.name)}</div>
    <div style="font-size:12px;color:var(--text-dim);margin-top:3px">${(file.size/1024).toFixed(0)} KB — κλικ για αλλαγή</div>`;

  // Show preview — image inline, PDF first page via pdf.js
  const st = document.getElementById('scanStatus');
  if (!st) return;
  st.style.display = 'block';
  st.innerHTML = `<div class="scan-preview-doc"><span style="color:var(--text-dim);font-size:12px">Loading preview…</span></div>`;
  try {
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      st.innerHTML = `<div class="scan-preview-doc"><img src="${url}" alt="preview"></div>`;
    } else if (file.type === 'application/pdf' && typeof scanRenderPDFPreview === 'function') {
      const dataUrl = await scanRenderPDFPreview(file);
      st.innerHTML = dataUrl
        ? `<div class="scan-preview-doc"><img src="${dataUrl}" alt="PDF page 1"></div>`
        : `<div class="scan-preview-info">📄 PDF · ${escapeHtml(file.name)}<span class="scan-preview-meta">preview unavailable</span></div>`;
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
    const bg = kind === 'error' ? 'var(--danger-bg)' : 'var(--bg)';
    const color = kind === 'error' ? 'var(--danger)' : 'var(--text-mid)';
    const border = kind === 'error' ? 'rgba(220,38,38,0.2)' : 'var(--border)';
    st.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:${bg};border-radius:8px;border:1px solid ${border};font-size:13px;color:${color}">${icon}${text}</div>`;
  };
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block"></span> &nbsp;Analyzing...'; }
  setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>', 'Προετοιμασία αρχείου…');

  try {
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
    const ok = f.type.startsWith('image/') || f.type === 'application/pdf';
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
      if (parsed) { await _scanPreview(parsed);
        if (window._scanResult) window._scanQueue.push({ ...window._scanResult, _fileName: files[i].name }); }
    } catch(e) { console.warn('[batch scan]', files[i].name, e.message); }
  }
  const n = window._scanQueue.length;
  if (!n) { toast('Κανένα αρχείο δεν σκαναρίστηκε επιτυχώς', 'error'); return; }
  if (st) st.insertAdjacentHTML('afterbegin',
    `<div style="padding:10px 12px;background:var(--accent-light,#E0F2FE);border-radius:8px;margin-bottom:8px;font-size:13px;font-weight:600">
      ✓ Έτοιμα ${n}/${files.length} — οι φόρμες θα ανοίξουν μία-μία· Save → επόμενη.
      <button class="btn btn-success btn-sm" style="margin-left:10px" onclick="_scanQueueNext()">Άνοιγμα 1ης φόρμας →</button>
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
  if (!clientId && data.client_name) {
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
  const confC = conf==='HIGH'?'var(--success)':conf==='MEDIUM'?'var(--warning)':'var(--danger)';

  const row = (label, val, matched) => val ? `
    <div class="detail-field">
      <span class="detail-field-label">${label}</span>
      <span class="detail-field-value" style="display:flex;align-items:center;gap:6px">
        ${val}
        <span style="font-size:10px;font-weight:600;color:${matched?'var(--success)':'var(--warning)'};letter-spacing:0.5px">
          ${matched?'✓':'⚠'}
        </span>
      </span>
    </div>` : '';

  st.style.display='block';
  st.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:4px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap">
        <span class="detail-section-title" style="margin:0">AI Extraction
          ${data._docType && data._docType !== 'UNKNOWN' ? `<span class="scan-doc-type-badge">${data._docType.replace('_',' ')}</span>` : ''}
        </span>
        <span style="display:flex;align-items:center;gap:8px">
          ${data._modelLabel ? `<span style="font-size:10px;color:var(--text-dim)">${escapeHtml(data._modelLabel)}</span>` : ''}
          <span style="font-size:11px;font-weight:600;letter-spacing:1px;color:${confC}">${conf}</span>
        </span>
      </div>
      ${row('Client',   escapeHtml(clientLabel||data.client_name), !!clientId)}
      ${data.reference ? row('Reference', escapeHtml(String(data.reference)), true) : ''}
      ${loadStops.map((s,i)=>row('Loading '+(loadStops.length>1?i+1:''), escapeHtml(s._locLabel||s.city+(s.country?', '+s.country:'')), !!s._locId)).join('')}
      ${delStops.map((s,i)=>row('Delivery '+(delStops.length>1?i+1:''), escapeHtml(s._locLabel||s.city+(s.country?', '+s.country:'')), !!s._locId)).join('')}
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
    if (warns.length && st) st.insertAdjacentHTML('afterbegin', warns.map(w =>
      `<div style="padding:8px 12px;background:#FFFCF5;border:1px solid #EAD9B0;border-radius:8px;margin-bottom:6px;font-size:12.5px;color:#B45309;font-weight:600">⚠ ${w}</div>`).join(''));
  } catch (e) {}
  // Φύλακας διπλοεγγραφών (#5, owner 10/8): ίδιο Reference ήδη στο σύστημα;
  try {
    if (data.reference) {
      const esc = String(data.reference).replace(/'/g, "\\'");
      const dups = await atGetAll(TABLES.ORDERS, { filterByFormula: `{Reference}='${esc}'` }, false);
      if (dups && dups.length) {
        data._dupRef = dups[0].id;
        if (st) st.insertAdjacentHTML('afterbegin',
          `<div style="padding:9px 12px;background:#FEF3F2;border:1px solid rgba(220,38,38,.35);border-radius:8px;margin-bottom:8px;font-size:12.5px;color:#B42318;font-weight:600">⚠ Υπάρχει ήδη order με Reference «${String(data.reference)}» — πιθανό διπλό, έλεγξε πριν την αποθήκευση.</div>`);
        toast(`⚠ Το Reference «${data.reference}» υπάρχει ήδη — πιθανό διπλό`, 'warn');
      }
    }
  } catch (e) {}
  window._scanResult = { matched: {clientId,clientLabel,loadLocId,loadLocLabel,delLocId,delLocLabel,loadStops,delStops}, data };

  // Update footer
  document.getElementById('modalFooter').innerHTML = `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-ghost" onclick="openIntlScan()">↩ Rescan</button>
    <button class="btn btn-success" onclick="_scanOpenStored()">Open Form →</button>`;

  // Duplicate detection — fire-and-forget. If we find an existing order with
  // the same Reference, prepend a warning banner with link to open it.
  if (data.reference && typeof findDuplicateOrders === 'function') {
    findDuplicateOrders(data.reference, TABLES.ORDERS).then(dupes => {
      if (!dupes.length) return;
      const dupListHtml = dupes.map(d => {
        const f = d.fields;
        const loadDate = (f['Loading DateTime']||'').substring(0,10);
        const orderNo = f['Order Number'] || d.id.slice(-6);
        return `<li style="margin:4px 0">
          <a href="#" onclick="event.preventDefault();closeModal();renderOrdersIntl().then(()=>setTimeout(()=>selectIntlOrder('${d.id}'),300))"
             style="color:#92400E;text-decoration:underline;font-weight:600">Order ${escapeHtml(String(orderNo))}</a>
          <span style="color:#78350F;font-size:11px"> · ${loadDate||'no date'} · ${escapeHtml(_clientName(f)||'—')}</span>
        </li>`;
      }).join('');
      st.insertAdjacentHTML('afterbegin', `
        <div style="background:var(--warning-soft);border:1px solid #FBBF24;padding:10px 14px;border-radius:8px;margin-bottom:10px">
          <div style="font-weight:700;color:#92400E;font-size:13px">⚠ Πιθανό duplicate</div>
          <div style="font-size:12px;color:#78350F;margin-top:4px">Βρέθηκε ήδη παραγγελία με Reference <strong>${escapeHtml(String(data.reference))}</strong>:</div>
          <ul style="margin:6px 0 0 18px;padding:0;font-size:12px">${dupListHtml}</ul>
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
}

function _intlExportCSV() {
  const recs = INTL_ORDERS.filtered;
  if (!recs.length) { toast('No records to export', 'error'); return; }
  const rows = [['Order No','Week','Direction','Client','Loading','Delivery','Load Date','Del Date','Pallets','Goods','Status','Invoiced','Price']];
  recs.forEach(r => { const f = r.fields; rows.push([
    f['Order Number']||'', f['Week Number']||'', f['Direction']||'', _clientName(f),
    _cleanSummary(f['Loading Summary']), _cleanSummary(f['Delivery Summary']),
    f['Loading DateTime']||'', f['Delivery DateTime']||'', f['Total Pallets']||0,
    f['Goods']||'', f['Status']||'Pending', f['Invoiced']?'Yes':'No', f['Price']||0,
  ]); });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `orders_intl_${localToday()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  toast('CSV exported');
}

// Print-friendly view of the currently filtered orders.
// Opens a new tab with a clean A4 layout — user can save as PDF via browser print dialog.
function _intlPrint() {
  const recs = INTL_ORDERS.filtered || [];
  if (!recs.length) { toast('No records to print', 'error'); return; }
  const today = localToday();
  const rowsHTML = recs.map(r => {
    const f = r.fields;
    const dirCls = (f['Direction']||'').toLowerCase() === 'export' ? 'dir-exp' : 'dir-imp';
    const status = f['Status'] || 'Pending';
    const stCls = ['Delivered','Invoiced'].includes(status) ? 'st-ok'
                : status === 'In Transit' ? 'st-mid'
                : status === 'Cancelled' ? 'st-bad' : 'st-pending';
    return `<tr>
      <td>${f['Order Number']||''}</td>
      <td>${f['Week Number']||''}</td>
      <td><span class="dir ${dirCls}">${f['Direction']||''}</span></td>
      <td>${escapeHtml(_clientName(f)||'')}</td>
      <td>${escapeHtml(_cleanSummary(f['Loading Summary']))}</td>
      <td>${escapeHtml(_cleanSummary(f['Delivery Summary']))}</td>
      <td>${(f['Loading DateTime']||'').substring(0,10)}</td>
      <td>${(f['Delivery DateTime']||'').substring(0,10)}</td>
      <td class="r">${f['Total Pallets']||0}</td>
      <td><span class="st ${stCls}">${status}</span></td>
      <td class="r">${f['Price'] ? '€'+Number(f['Price']).toLocaleString() : '—'}</td>
    </tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html><head>
    <title>International Orders — ${today}</title>
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'DM Sans',sans-serif;color:#0F172A;padding:20px;font-size:11px}
      h1{font-family:'Syne',sans-serif;font-size:22px;color:var(--navy-mid);margin-bottom:4px}
      .sub{color:#64748B;font-size:11px;margin-bottom:18px}
      table{width:100%;border-collapse:collapse;font-size:10px}
      thead th{background:var(--navy-mid);color:#fff;padding:8px 6px;text-align:left;font-weight:700;text-transform:uppercase;font-size:9px;letter-spacing:.4px}
      tbody td{padding:6px;border-bottom:1px solid #E2E8F0}
      .r{text-align:right}
      .dir{padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700}
      .dir-exp{background:#DBEAFE;color:#1E40AF}
      .dir-imp{background:var(--warning-soft);color:#92400E}
      .st{padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600}
      .st-ok{background:#D1FAE5;color:#064E3B}
      .st-mid{background:#DBEAFE;color:#1E40AF}
      .st-bad{background:#FEE2E2;color:#7F1D1D}
      .st-pending{background:#F1F5F9;color:#475569}
      .footer{margin-top:14px;font-size:9px;color:#64748B;display:flex;justify-content:space-between}
      @media print { body { padding: 0 } @page { size: A4 landscape; margin: 1cm } }
    </style>
  </head><body>
    <h1>International Orders</h1>
    <div class="sub">${recs.length} orders · ${today} · Petras Group TMS</div>
    <table>
      <thead><tr>
        <th>Order#</th><th>Week</th><th>Direction</th><th>Client</th>
        <th>Loading</th><th>Delivery</th><th>Load Date</th><th>Del Date</th>
        <th class="r">Pallets</th><th>Status</th><th class="r">Price</th>
      </tr></thead>
      <tbody>${rowsHTML}</tbody>
    </table>
    <div class="footer">
      <span>Printed ${new Date().toLocaleString('el-GR')}</span>
      <span>Petras Group · Cold Chain Logistics</span>
    </div>
    <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blocked — allow pop-ups for this site', 'warn'); return; }
  w.document.write(html);
  w.document.close();
}

// ═══════════════════════════════════════════════════════════════
// CANCEL — soft cancellation. Sets Status='Cancelled', leaves all
// linked records intact (so audit trail / pallet ledger / reports
// remain visible). Use this for client-cancelled orders.
// ═══════════════════════════════════════════════════════════════
async function cancelIntlOrder(recId) {
  if (!(await confirmAction('Ακύρωση αυτής της παραγγελίας;\n\nΘα μαρκαριστεί ως Cancelled αλλά τα linked records (NL/GL/CL/Ramp/Pallet Ledger) παραμένουν.\n\nΓια ολική διαγραφή χρησιμοποίησε το Delete.', { title: 'Ακύρωση παραγγελίας', confirmLabel: 'Ακύρωσέ την', danger: true }))) return;
  try {
    await atPatch(TABLES.ORDERS, recId, { 'Status': 'Cancelled' });
    invalidateCache(TABLES.ORDERS);
    // Propagate Cancelled status to downstream NL records (so Weekly Natl etc reflect it)
    try {
      if (typeof syncOrderDownstream === 'function') {
        await syncOrderDownstream(recId, { source: 'intl', changedFields: ['Status'] });
      }
    } catch(e) { console.warn('Cancel: downstream sync warning:', e.message); }
    toast('Παραγγελία ακυρώθηκε', 'success');
    document.getElementById('intlDetail')?.classList.add('hidden');
    await renderOrdersIntl();
  } catch(e) {
    // User sees a clean message; full error goes to the persistent error log
    // (with call-site + recId context), not dumped raw into the toast.
    reportError('Η ακύρωση απέτυχε — δοκιμάστε ξανά');
    if (typeof logError === 'function') logError(e, 'cancelIntlOrder ' + recId);
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE — hard cascade. Removes the ORDER record + ALL linked
// downstream records (NL, GL, CL, RAMP, PALLET_LEDGER, ORDER_STOPS).
// Use sparingly — for true mistakes / duplicates only.
// ═══════════════════════════════════════════════════════════════
async function deleteIntlOrder(recId) {
  if (!confirm('🛑 ΔΙΑΓΡΑΦΗ International Order;\n\nΑυτό θα σβήσει ΚΑΙ:\n• Τα linked NAT_LOADS\n• GROUPAGE LINES + CONS_LOADS\n• RAMP records\n• PALLET LEDGER entries\n• ORDER_STOPS\n\nΗ ΕΝΕΡΓΕΙΑ ΔΕΝ ΑΝΑΙΡΕΙΤΑΙ.\n\nΕίσαι σίγουρος;')) return;

  try {
    toast('Διαγραφή παραγγελίας...', 'info');
    let _delFail = 0;

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
            try {
              const nlsFromCL = await atGetAll(TABLES.NAT_LOADS, {
                filterByFormula: `{Source Record}="${cl.id}"`,
              }, false);
              for (const nl of nlsFromCL) { try { await atDelete(TABLES.NAT_LOADS, nl.id); } catch(e) { _delFail++; } }
            } catch(e) { _delFail++; console.warn('NL-CL cleanup:', e); }
            try { await atDelete(TABLES.CONS_LOADS, cl.id); } catch(e) { _delFail++; console.warn('CL delete:', e); }
          }
        } catch(e) { _delFail++; console.warn('CL cleanup:', e); }
        try { await atDelete(TABLES.GL_LINES, gl.id); } catch(e) { _delFail++; console.warn('GL delete:', e); }
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

    // 5. Delete ORDER_STOPS linked to this ORDER
    try {
      const intlStops = await stopsLoad(recId, F.STOP_PARENT_ORDER);
      for (const s of intlStops) {
        try { await atDelete(TABLES.ORDER_STOPS, s.id); } catch(e) { _delFail++; console.warn('Stop delete:', e); }
      }
      if (intlStops.length) _tmsLog(`Deleted ${intlStops.length} ORDER_STOPS for ORDER ${recId}`);
    } catch(e) { _delFail++; console.warn('ORDER_STOPS cleanup:', e); }

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

    // 6. Delete the ORDER itself (soft-delete to trash if available, else hard)
    if (typeof atSoftDelete === 'function') {
      await atSoftDelete(TABLES.ORDERS, recId);
    } else {
      await atDelete(TABLES.ORDERS, recId);
    }

    invalidateCache(TABLES.ORDERS);
    invalidateCache(TABLES.NAT_LOADS);
    invalidateCache(TABLES.GL_LINES);
    invalidateCache(TABLES.CONS_LOADS);
    invalidateCache(TABLES.RAMP);

    toast(_delFail ? `Order deleted (${_delFail} linked records failed — δες error log)` : 'Order deleted', _delFail ? 'warn' : 'success');
    if (_delFail && typeof logError === 'function') logError(new Error(`Cascade delete: ${_delFail} sub-deletes failed`), 'deleteIntlOrder ' + recId);
    document.getElementById('intlDetail')?.classList.add('hidden');
    await renderOrdersIntl();
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
              filterByFormula: `{Source Record}="${cl.id}"`,
            }, false);
            for (const nl of nlsFromCL) {
              try { await atDelete(TABLES.NAT_LOADS, nl.id); } catch(e) { _delFail++; }
            }
          } catch(e) { _delFail++; }
          try { await atDelete(TABLES.CONS_LOADS, cl.id); } catch(e) { _delFail++; }
        }
      } catch(e) { _delFail++; }
      // Delete the GL itself
      try { await atDelete(TABLES.GL_LINES, gl.id); } catch(e) { _delFail++; console.warn('orphan GL delete:', e); }
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
        const clNLs = await atGetAll(TABLES.NAT_LOADS, { filterByFormula: `{Source Record}="${cl.id}"` }, false);
        for (const nl of clNLs) { try { await atDelete(TABLES.NAT_LOADS, nl.id); } catch(e) { _delFail++; } }
        try { await atDelete(TABLES.CONS_LOADS, cl.id); } catch(e) { _delFail++; }
      }
      try { await atDelete(TABLES.GL_LINES, gl.id); } catch(e) { _delFail++; }
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
    }
    invalidateCache(TABLES.ORDERS);
    _applyIntlFilters();
    if (INTL_ORDERS.selectedId === orderId) selectIntlOrder(orderId);
  } catch (e) { logError(e, 'orders_intl refresh after pallet save'); }
}
window._intlRefreshOrder = _intlRefreshOrder;

window.cancelIntlOrder = cancelIntlOrder;
window.deleteIntlOrder = deleteIntlOrder;
window.cleanupOrphanGL = cleanupOrphanGL;
window.cleanupOrphans = cleanupOrphans;
window.renderOrdersIntl = renderOrdersIntl;
window._intlClearFilters = _intlClearFilters;   // OI-4 — πρέπει να είναι ΜΕΣΑ στο IIFE
window.openIntlScan = openIntlScan;
window.openIntlCreate = openIntlCreate;
window.openIntlEdit = openIntlEdit;
// Weekly v3: άνοιγμα φόρμας με fields από τον καλούντα (το weekly έχει δικά του records)
window.openIntlEditWith = (recId, fields) => _openModal(recId, fields||{});
window.duplicateIntlOrder = duplicateIntlOrder;
window.selectIntlOrder = selectIntlOrder;
window._oiCloseCard = _oiCloseCard;
window._oiBalanceUpdate = _oiBalanceUpdate;
window.toggleIntlInvoiced = toggleIntlInvoiced;
window._intlSortToggle = _intlSortToggle;
window._applyIntlFilters = _applyIntlFilters;
window.intlSearch = intlSearch;
window.intlFilter = intlFilter;
window.intlPeriodChange = intlPeriodChange;
window._intlExportCSV = _intlExportCSV;
window._intlPrint = _intlPrint;
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
// _oiPage is mutated from onclick (++/--) so expose as getter/setter
Object.defineProperty(window, '_oiPage', {
  get: function() { return _oiPage; },
  set: function(v) { _oiPage = v; },
  configurable: true
});
})();
