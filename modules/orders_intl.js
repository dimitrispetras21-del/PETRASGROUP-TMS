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
  return escapeHtml(s.replace(/^["']+|["']+$/g,'').replace(/\/\s*$/,'').trim() || '—');
}
function _weekNum(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const ws = new Date(jan1); ws.setDate(jan1.getDate() - jan1.getDay());
  return Math.floor((d - ws) / 604800000) + 1;
}

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
    // Pre-resolve all client names — batch fetches in parallel
    const clientIds = [...new Set(records.map(r=>(r.fields['Client']||[])[0]).filter(Boolean))];
    await fhBatchResolveClients(clientIds);
    _renderIntlLayout(c);
    _applyIntlFilters();
  } catch(e) { c.innerHTML = showError(e.message); }
}

function _renderIntlLayout(c) {
  const canEdit = can('orders') === 'full';
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:14px">
      <div>
        <div class="page-title">International Orders</div>
        <div class="page-sub" id="intlSub">${INTL_ORDERS.data.length} orders</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-scan" onclick="openIntlScan()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
          Scan</button>
        ${canEdit ? `<button class="btn btn-new-order" onclick="openIntlCreate()">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
        </svg>
        New Order</button>` : ''}
      </div>
    </div>
    <div class="entity-layout">
      <div class="entity-list-panel">
        <div class="entity-toolbar" style="flex-wrap:wrap;gap:8px">
          <input class="search-input" style="max-width:210px" placeholder="🔍  Client / Location / Goods..."
            oninput="intlSearch(this.value)">
          <select class="filter-select" onchange="intlFilter('Direction',this.value)">
            <option value="">Direction: All</option>
            <option value="Export">↑ Export</option>
            <option value="Import">↓ Import</option>
          </select>
          <select class="filter-select" onchange="intlFilter('Status',this.value)">
            <option value="">Status: All</option>
            <option value="Pending">Pending</option>
            <option value="Assigned">Assigned</option>
            <option value="Active">Active</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <select class="filter-select" onchange="intlFilter('Brand',this.value)">
            <option value="">Brand: All</option>
            <option value="Petras Group">Petras Group</option>
            <option value="DPS">DPS</option>
          </select>
          <select class="filter-select" onchange="intlFilter('_week',this.value)">
            <option value="">Week: All</option>
            ${_buildWeekOpts()}
          </select>
          <select class="filter-select" onchange="intlFilter('_trip',this.value)">
            <option value="">Trip: All</option>
            <option value="unassigned">Unassigned</option>
            <option value="assigned">Assigned</option>
          </select>
          <select class="filter-select" onchange="intlPeriodChange(this.value)">
            <option value="60" ${_intlPeriod==='60'?'selected':''}>Last 60 days</option>
            <option value="180" ${_intlPeriod==='180'?'selected':''}>Last 6 months</option>
            <option value="all" ${_intlPeriod==='all'?'selected':''}>All time</option>
          </select>
          <span class="entity-count" id="intlCount">${INTL_ORDERS.data.length} orders</span>
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

// ─── Sort helpers ────────────────────────────────
const _intlColDefs = [
  { key: 'orderNo',  label: 'Order No',  type: 'text',   get: (f) => f['Order Number']||'' },
  { key: 'week',     label: 'Week',      type: 'number', get: (f) => f[' Week Number']||0 },
  { key: 'dir',      label: 'Dir',       type: 'text',   get: (f) => f['Direction']||'' },
  { key: 'client',   label: 'Client',    type: 'text',   get: (f) => _clientName(f) },
  { key: 'loading',  label: 'Loading',   type: 'text',   get: (f) => _cleanSummary(f['Loading Summary']) },
  { key: 'delivery', label: 'Delivery',  type: 'text',   get: (f) => _cleanSummary(f['Delivery Summary']) },
  { key: 'loadDate', label: 'Load Date', type: 'date',   get: (f) => f['Loading DateTime']||'' },
  { key: 'delDate',  label: 'Del Date',  type: 'date',   get: (f) => f['Delivery DateTime']||'' },
  { key: 'pal',      label: 'PAL',       type: 'number', get: (f) => f['Total Pallets']||f['Loading Pallets 1']||0 },
  { key: 'trip',     label: 'Trip',      type: 'text',   get: (f) => ((f['TRIPS (Export Order)']?.length||0)+(f['TRIPS (Import Order)']?.length||0))>0?'Assigned':'Pending' },
  { key: 'inv',      label: 'INV',       type: 'text',   get: (f) => f['Invoiced']?'1':'0' },
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
    let va = col.get(a.fields), vb = col.get(b.fields);
    if (col.type === 'number') return ((parseFloat(va)||0) - (parseFloat(vb)||0)) * dir;
    if (col.type === 'date') return (va||'').localeCompare(vb||'') * dir;
    return String(va).toLowerCase().localeCompare(String(vb).toLowerCase()) * dir;
  });
}

// ─── Table (Virtual Scroll) ─────────────────────
function _oiRowHtml(r) {
  const f = r.fields;
  const hasTrip = (f['TRIPS (Export Order)']?.length||0)+(f['TRIPS (Import Order)']?.length||0) > 0;
  const dir = f['Direction']||'';
  const dirB = dir==='Export' ? '<span class="badge badge-blue">↑ Export</span>'
             : dir==='Import' ? '<span class="badge badge-green">↓ Import</span>'
             : `<span class="badge badge-grey">${dir||'—'}</span>`;
  const tripB = hasTrip ? '<span class="badge badge-green">Assigned</span>' : '<span class="badge badge-yellow">Pending</span>';
  const hr  = f['High Risk Flag'] ? '<span title="⚠" style="color:var(--danger);margin-right:4px">⚠</span>' : '';
  const grp = f['National Groupage'] ? '<span class="badge badge-blue" style="margin-right:4px;font-size:10px">GRP</span>' : '';
  const sel = r.id === INTL_ORDERS.selectedId ? ' selected' : '';
  return `<tr onclick="selectIntlOrder('${r.id}')" id="irow_${r.id}" class="${sel}" style="height:${_OI_ROW_H}px">
    <td style="white-space:nowrap">${hr}${grp}<strong style="color:var(--text);font-size:12px">${escapeHtml(f['Order Number']||r.id.slice(-6))}</strong></td>
    <td>W${escapeHtml(f[' Week Number']||'—')}</td>
    <td>${dirB}</td>
    <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${_clientName(f)}</td>
    <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis">${_cleanSummary(f['Loading Summary'])}</td>
    <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis">${_cleanSummary(f['Delivery Summary'])}</td>
    <td>${f['Loading DateTime']  ? formatDateShort(f['Loading DateTime'])  : '—'}</td>
    <td>${f['Delivery DateTime'] ? formatDateShort(f['Delivery DateTime']) : '—'}</td>
    <td>${f['Total Pallets']||f['Loading Pallets 1']||'—'}</td>
    <td>${tripB}</td>
    <td onclick="event.stopPropagation();toggleIntlInvoiced('${r.id}',${!!f['Invoiced']})"
      title="${f['Invoiced']?'Mark as Not Invoiced':'Mark as Invoiced'}"
      style="cursor:pointer;text-align:center">
      ${f['Invoiced']
        ? '<span class="badge badge-grey" style="cursor:pointer">✓ INV</span>'
        : '<span style="color:var(--text-dim);font-size:18px;line-height:1">·</span>'}
    </td>
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

function _renderIntlTable(records) {
  const wrap = document.getElementById('intlTable');
  if (!records.length) { wrap.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-dim)">No orders match filters</div>`; return; }
  const sortedRecs = _intlSortRecords(records);
  _oiVS.sortedRecs = sortedRecs;
  _oiVS.lastStart = -1;
  _oiVS.lastEnd = -1;

  const ths = _intlColDefs.map(c => {
    const arrow = _intlSortCol===c.key ? (_intlSortDir===1?' <span style="color:#0284C7">▲</span>':_intlSortDir===2?' <span style="color:#0284C7">▼</span>':'') : '';
    return `<th style="cursor:pointer;user-select:none" onclick="_intlSortToggle('${c.key}')">${c.label}${arrow}</th>`;
  }).join('');

  const totalH = sortedRecs.length * _OI_ROW_H;
  wrap.innerHTML = `
    <div id="oiVScroll" style="height:calc(100vh - 280px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#CBD5E0 transparent">
      <table>
        <thead><tr>${ths}</tr></thead>
      </table>
      <div id="oiTopSpacer" style="height:0"></div>
      <table><tbody></tbody></table>
      <div id="oiBottomSpacer" style="height:${totalH}px"></div>
    </div>
    <div style="padding:8px 16px;color:#94A3B8;font-size:12px;text-align:center">${sortedRecs.length} orders</div>`;

  const scroller = document.getElementById('oiVScroll');
  scroller.addEventListener('scroll', _oiOnScroll, { passive: true });
  _oiVirtualPaint();
}

// ─── Filters ────────────────────────────────────
function intlSearch(q) { _intlFilters._q = q.toLowerCase().trim(); _oiPage = 1; _applyIntlFilters(); }
function intlFilter(k,v) { if(!v) delete _intlFilters[k]; else _intlFilters[k]=v; _oiPage = 1; _applyIntlFilters(); }
function intlPeriodChange(v) { _intlPeriod = v; _oiVS.lastStart = -1; _oiVS.lastEnd = -1; renderOrdersIntl(); }

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
  if (_intlFilters['_week'])     recs = recs.filter(r => String(r.fields[' Week Number']) === String(_intlFilters['_week']));
  if (_intlFilters['_trip']==='unassigned') recs = recs.filter(r => !r.fields['TRIPS (Export Order)']?.length && !r.fields['TRIPS (Import Order)']?.length);
  if (_intlFilters['_trip']==='assigned')   recs = recs.filter(r => r.fields['TRIPS (Export Order)']?.length>0 || r.fields['TRIPS (Import Order)']?.length>0);
  INTL_ORDERS.filtered = recs;
  _renderIntlTable(recs);
  const n = recs.length + ' orders';
  document.getElementById('intlCount').textContent = n;
  document.getElementById('intlSub').textContent   = n;
}

// ─── Detail Panel ───────────────────────────────
function selectIntlOrder(recId) {
  INTL_ORDERS.selectedId = recId;
  document.querySelectorAll('#intlTable tbody tr').forEach(tr => tr.classList.remove('selected'));
  const row = document.getElementById('irow_'+recId); if (row) row.classList.add('selected');
  const rec = INTL_ORDERS.data.find(r => r.id === recId); if (!rec) return;
  const panel = document.getElementById('intlDetail');
  panel.classList.remove('hidden');
  const f = rec.fields;
  const canEdit = can('orders') === 'full';
  const hasTrip = (f['TRIPS (Export Order)']?.length||0)+(f['TRIPS (Import Order)']?.length||0) > 0;
  const stMap = {Pending:'badge-yellow',Assigned:'badge-blue',Active:'badge-green',Delivered:'badge-grey',Cancelled:'badge-red'};

  const buildStops = (locPfx, palPfx, dtPfx, dt1field) => {
    let html = '';
    for (let i=1;i<=10;i++) {
      const locArr = f[`${locPfx} Location ${i}`];
      const locId  = Array.isArray(locArr) ? locArr[0] : null;
      if (!locId) break;
      const name  = escapeHtml(_fhLocationsMap[locId] || locId.slice(-6));
      const pal   = f[`${palPfx} Pallets ${i}`];
      const dtRaw = i===1 ? f[dt1field] : f[`${dtPfx} DateTime ${i}`];
      const dtStr = dtRaw ? formatDateShort(dtRaw) : '';
      html += _dF(`Stop ${i}`, `${name}${pal?' — '+escapeHtml(pal)+' pal':''}${dtStr?' · '+dtStr:''}`);
    }
    return html || _dF('Location', '—');
  };

  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="detail-title" style="font-size:13px">
          ${f['High Risk Flag']?'<span style="color:var(--danger);margin-right:4px">⚠</span>':''}
          ${escapeHtml(f['Order Number']||recId.slice(-6))}
        </div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px">
          ${escapeHtml(f['Brand']||'')} · ${escapeHtml(f['Direction']||'')} · W${escapeHtml(f[' Week Number']||'—')}
        </div>
      </div>
      <div class="detail-actions">
        ${canEdit?`<div class="btn-icon" title="Edit" onclick="openIntlEdit('${recId}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 2l3 3-9 9H2v-3l9-9z"/></svg>
        </div>`:''}
        <div class="btn-icon" onclick="document.getElementById('intlDetail').classList.add('hidden')">✕</div>
      </div>
    </div>
    <div class="detail-body">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        <span class="badge ${stMap[f['Status']]||'badge-grey'}">${escapeHtml(f['Status']||'No Status')}</span>
        ${hasTrip?'<span class="badge badge-green">Trip Assigned</span>':'<span class="badge badge-yellow">No Trip</span>'}
        ${f['Invoiced']?'<span class="badge badge-grey">Invoiced</span>':''}
        ${f['High Risk Flag']?'<span class="badge badge-red">⚠ High Risk</span>':''}
        ${f['Veroia Switch ']?'<span class="badge badge-yellow">Veroia Switch</span>':''}
        ${f['National Groupage']?'<span class="badge badge-blue">Groupage</span>':''}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Timeline</div>
        <div style="display:flex;align-items:center;gap:0;padding:4px 0">
          ${['Pending','Assigned','In Transit','Delivered','Invoiced'].map((st,i,arr) => {
            const statuses = ['Pending','Assigned','In Transit','Delivered','Invoiced'];
            const currentIdx = statuses.indexOf(f['Status']||'Pending');
            const done = i <= currentIdx;
            const active = i === currentIdx;
            const col = done ? '#0284C7' : '#1E293B';
            return `<div style="display:flex;align-items:center;gap:0">
              <div style="width:${active?'10':'8'}px;height:${active?'10':'8'}px;border-radius:50%;background:${done?col:'transparent'};border:2px solid ${col};flex-shrink:0${active?';box-shadow:0 0 0 3px rgba(2,132,199,0.2)':''}"></div>
              <div style="font-size:9px;color:${done?'#0284C7':'#475569'};font-weight:${active?'700':'400'};margin:0 2px;white-space:nowrap">${st}</div>
              ${i<arr.length-1?`<div style="width:12px;height:2px;background:${i<currentIdx?'#0284C7':'#1E293B'};flex-shrink:0"></div>`:''}
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Order</div>
        ${_dF('Client',       _clientName(f))}
        ${_dF('Reference',    f['Reference']?'('+escapeHtml(f['Reference'])+')':'—')}
        ${_dF('Goods',        escapeHtml(f['Goods']||'—'))}
        ${_dF('Temperature',  f['Temperature °C']!=null?escapeHtml(f['Temperature °C'])+' °C':'—')}
        ${_dF('Reefer Mode',  escapeHtml(f['Refrigerator Mode']||'—'))}
        ${_dF('Pallet Type',  escapeHtml(f['Pallet Type']||'—'))}
        ${_dF('Total Pallets',escapeHtml(f['Total Pallets']||'—'))}
        ${_dF('Gross Weight', f['Gross Weight kg']?escapeHtml(f['Gross Weight kg'])+' kg':'—')}
        ${_dF('Pallet Exch.', f['Pallet Exchange']?'✓ Yes':'No')}
        ${f['Pallet Exchange'] ? `
        <div style="margin:8px 0;padding:8px;background:rgba(2,132,199,0.08);border-radius:6px;border:1px solid rgba(2,132,199,0.15)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-weight:600;font-size:11px;color:var(--accent)">PALLET SHEETS</span>
            <button onclick="openPalletUpload('${recId}')" style="margin-left:auto;background:var(--accent);color:white;border:none;padding:4px 12px;border-radius:4px;font-size:11px;cursor:pointer">
              Upload Sheet
            </button>
          </div>
          <div style="display:flex;gap:12px;font-size:11px">
            <span>Sheet 1: ${f['Pallet Sheet 1 Uploaded']?'<span style="color:var(--success)">✓ Done</span>':'<span style="color:var(--warning)">Pending</span>'}</span>
            ${f['Veroia Switch ']?`<span>Sheet 2: ${f['Pallet Sheet 2 Uploaded']?'<span style="color:var(--success)">✓ Done</span>':'<span style="color:var(--warning)">Pending</span>'}</span>`:'<span style="color:var(--text-dim)">Sheet 2: N/A</span>'}
          </div>
        </div>` : ''}
        ${_dF('Carrier',      escapeHtml(f['Carrier Type']||'—'))}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Loading</div>
        ${buildStops('Loading','Loading','Loading','Loading DateTime')}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Delivery</div>
        ${buildStops('Unloading','Unloading','Unloading','Delivery DateTime')}
      </div>
      ${can('costs')!=='none'?`
      <div class="detail-section">
        <div class="detail-section-title">Financial</div>
        ${_dF('Price',     f['Price']    ?'€ '+Number(f['Price']).toLocaleString('el-GR')    :'—')}
        ${_dF('Net Price', f['Net Price']?'€ '+Number(f['Net Price']).toLocaleString('el-GR') :'—')}
        ${_dF('Invoice Status',escapeHtml(f['Invoice Status']||'—'))}
      </div>`:''}
      ${f['Pallet Exchange'] ? `
      <div class="detail-section">
        <div class="detail-section-title">Pallet Exchange</div>
        <button class="btn btn-scan" onclick="openPalletUpload('${recId}')" style="width:100%;margin-bottom:8px">
          Upload Pallet Sheet
        </button>
        <div style="display:flex;gap:8px">
          ${_chk('Sheet 1', f['Pallet Sheet 1 Uploaded'])}
          ${f['Veroia Switch '] ? _chk('Sheet 2', f['Pallet Sheet 2 Uploaded']) : ''}
        </div>
        <div style="margin-top:6px">
          <a href="#" onclick="event.preventDefault();navigate('pallet_ledger')" style="font-size:11px;color:#0284C7">View Ledger Records →</a>
        </div>
      </div>` : ''}
      ${f['Notes']?`<div class="detail-section"><div class="detail-section-title">Notes</div>
        <div style="font-size:12.5px;color:var(--text-mid);line-height:1.5">${escapeHtml(f['Notes'])}</div></div>`:''}
    </div>`;
}

function _dF(l,v) { return `<div class="detail-field"><span class="detail-field-label">${escapeHtml(l)}</span><span class="detail-field-value">${v}</span></div>`; }
function _chk(l,v) { return `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:${v?'var(--success)':'var(--text-dim)'}">${v?'✅':'⬜'} ${l}</div>`; }

// ─── Linked select widgets (delegates to core/form-helpers.js) ──
function _locSelect(id, currentId) { return fhLocSelect(id, currentId, 'fhLocDrop'); }
function _clientSelect(id, currentId, currentLabel) { return fhClientSelect(id, currentId, currentLabel, 'fhClientDrop'); }

// ─── Stop row HTML ───────────────────────────────
// type: 'l'=loading, 'u'=unloading
// stop 1 datetime field: 'Loading DateTime' / 'Delivery DateTime' (main fields)
// stop 2-10: 'Loading DateTime 2-10' / 'Unloading DateTime 1-10'
function _stopRow(type, i, locId, palVal, dtVal) {
  const label = type==='l' ? 'Loading' : 'Unloading';
  const req   = i===1 ? ' *' : '';
  return `<div id="stoprow_${type}_${i}" style="display:grid;grid-template-columns:1fr 100px 130px;gap:8px;margin-bottom:10px;align-items:end">
    <div>
      <label class="form-label" style="font-size:11px">${label} Location ${i}${req}</label>
      ${_locSelect(type+'_'+i, locId)}
    </div>
    <div>
      <label class="form-label" style="font-size:11px">Pallets${req}</label>
      <input class="form-input" type="number" id="pal_${type}_${i}" value="${palVal||''}" placeholder="0" min="0">
    </div>
    <div>
      <label class="form-label" style="font-size:11px">Date${req}</label>
      <input class="form-input" type="date" id="dt_${type}_${i}" value="${dtVal||''}">
    </div>
  </div>`;
}

// ─── Modal ──────────────────────────────────────
function openIntlCreate() { _openModal(null, {}); }
function openIntlEdit(recId) {
  const rec = INTL_ORDERS.data.find(r=>r.id===recId);
  if (rec) _openModal(recId, rec.fields);
}

async function _openModal(recId, f, _clientLabelOverride) {
  const isEdit = !!recId;
  const clientId = Array.isArray(f['Client']) ? f['Client'][0] : '';
  const clientLabel = _clientLabelOverride || (clientId ? (await _resolveClientName(clientId)) : '');

  // Count filled loading stops
  let cntL = 1, cntU = 1;
  for (let i=2;i<=10;i++) {
    if (Array.isArray(f[`Loading Location ${i}`])&&f[`Loading Location ${i}`][0]) cntL=i;
    if (Array.isArray(f[`Unloading Location ${i}`])&&f[`Unloading Location ${i}`][0]) cntU=i;
  }
  window._sCntL = cntL;
  window._sCntU = cntU;

  const getLocId = (prefix, i) => {
    const arr = f[`${prefix} Location ${i}`];
    return Array.isArray(arr) ? arr[0] : '';
  };
  const getDt = (prefix, mainField, i) => {
    const raw = i===1 ? f[mainField] : f[`${prefix} DateTime ${i}`];
    return raw ? toLocalDate(raw) : '';
  };

  const buildStopRows = (type) => {
    const isL  = type==='l';
    const pfx  = isL ? 'Loading' : 'Unloading';
    const main = isL ? 'Loading DateTime' : 'Delivery DateTime';
    const cnt  = isL ? cntL : cntU;
    let html = '';
    for (let i=1;i<=cnt;i++) {
      html += _stopRow(type, i, getLocId(pfx, i), f[`${pfx} Pallets ${i}`], getDt(pfx, main, i));
    }
    return html;
  };

  const opt = (arr, cur) => arr.map(o=>`<option value="${o}" ${f[cur]===o?'selected':''}>${o}</option>`).join('');

  const body = `
    <div class="form-grid">
      <div class="form-field span-2">
        <label class="form-label">Brand</label>
        <select class="form-select" id="f_Brand"><option value="">— Select —</option>
          ${opt(['Petras Group','DPS'],'Brand')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Type *</label>
        <select class="form-select" id="f_Type"><option value="">— Select —</option>
          ${opt(['International','National'],'Type')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Direction *</label>
        <select class="form-select" id="f_Direction"><option value="">— Select —</option>
          ${opt(['Export','Import'],'Direction')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Client *</label>
        ${_clientSelect('client', clientId, clientLabel)}
      </div>
      <div class="form-field">
        <label class="form-label">Price (€) *</label>
        <input class="form-input" type="number" id="f_Price" value="${f['Price']||''}">
      </div>
      <div class="form-field">
        <label class="form-label">Reference</label>
        <input class="form-input" type="text" id="f_Reference" value="${escapeHtml(f['Reference']||'')}" placeholder="e.g. 3813">
      </div>
      <div class="form-field">
        <label class="form-label">Goods</label>
        <input class="form-input" type="text" id="f_Goods" value="${escapeHtml(f['Goods']||'')}" placeholder="e.g. Fresh Produce">
      </div>
      <div class="form-field">
        <label class="form-label">Gross Weight (kg)</label>
        <input class="form-input" type="number" id="f_GrossWeight" value="${f['Gross Weight kg']||''}">
      </div>
      <div class="form-field">
        <label class="form-label">Temperature °C *</label>
        <input class="form-input" type="number" id="f_Temp" value="${f['Temperature °C']!=null?f['Temperature °C']:''}">
      </div>
      <div class="form-field">
        <label class="form-label">Refrigerator Mode *</label>
        <select class="form-select" id="f_ReeferMode"><option value="">— Select —</option>
          ${opt(['Continuous','Start-Stop','No temp'],'Refrigerator Mode')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Pallet Type *</label>
        <select class="form-select" id="f_PalletType"><option value="">— Select —</option>
          ${opt(['EUR','CHEP','Industrial','Euro'],'Pallet Type')}</select>
      </div>
      <div class="form-field" style="padding-top:24px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="f_PalletExch" ${f['Pallet Exchange']?'checked':''} style="width:15px;height:15px">
          Pallet Exchange</label>
      </div>
    </div>
    <div style="display:flex;gap:24px;margin:16px 0;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="f_HighRisk" ${f['High Risk Flag']?'checked':''} style="width:15px;height:15px">
        ⚠ High Risk</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="f_VeroiaSwitch" ${f['Veroia Switch ']?'checked':''} style="width:15px;height:15px">
        Veroia Switch</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="f_Groupage" ${f['National Groupage']?'checked':''} style="width:15px;height:15px">
        National Groupage</label>
    </div>

    <div style="padding-top:16px;border-top:1px solid var(--border)">
      <div class="detail-section-title" style="margin-bottom:12px">Loading Stops</div>
      <div id="stops_l">${buildStopRows('l')}</div>
      <button type="button" class="btn btn-ghost" id="btn_addL"
        style="font-size:12px;padding:5px 14px" onclick="_addStop('l')"
        ${cntL>=10?'style="display:none"':''}>+ Add Loading Stop</button>
    </div>

    <div style="padding-top:16px;border-top:1px solid var(--border);margin-top:20px">
      <div class="detail-section-title" style="margin-bottom:12px">Delivery Stops</div>
      <div id="stops_u">${buildStopRows('u')}</div>
      <button type="button" class="btn btn-ghost" id="btn_addU"
        style="font-size:12px;padding:5px 14px" onclick="_addStop('u')"
        ${cntU>=10?'style="display:none"':''}>+ Add Delivery Stop</button>
    </div>`;

  const footer = `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-success" id="btnSubmit" onclick="submitIntlOrder('${recId||''}')">
      ${isEdit?'Save Changes':'Submit'}
    </button>`;

  document.getElementById('modal').style.maxWidth = '760px';
  openModal(isEdit ? 'Edit Order' : 'New Order', body, footer);
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

  try {
  const veroiaSwitch = fields[F.VEROIA_SWITCH];
  const direction    = fields['Direction'];
  const isIntl       = fields['Type'] === 'International';

  console.log('_syncVeroiaSwitch called:', {orderId, veroiaSwitch, direction, isIntl});
  if (!isIntl) { console.log('SKIP: not intl'); return; }

  const _lid = v => (v && typeof v === 'object' && v.id) ? v.id : (typeof v === 'string' ? v : null);

  // ── Find existing NAT_LOADS for this ORDERS record (identified by Source Record) ──
  const existingNL = await atGetAll(TABLES.NAT_LOADS, {
    filterByFormula: `{Source Record}="${orderId}"`,
    fields: ['Name','Direction'],
  }, false);
  console.log('existing VS NAT_LOADS:', existingNL.length);

  // ── Legacy NAT_ORDERS cleanup (v1.0 migration) — field may not exist, catch silently ──
  let legacyNO = [];
  try {
    legacyNO = await atGetAll(TABLES.NAT_ORDERS, {
      filterByFormula: `FIND("${orderId}",ARRAYJOIN({Linked Order},","))>0`,
      fields: ['Linked Order'],
    }, false);
  } catch(e) { console.log('Legacy NAT_ORDERS lookup skipped (field not found):', e?.message||e); }

  // ══════════════════════════════════════════════
  // VS OFF → FULL CLEANUP
  // ══════════════════════════════════════════════
  if (!veroiaSwitch) {
    console.log('VS OFF → cleanup');

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
      await atPatch(TABLES.ORDERS, orderId, {'National Order Created': true});
    }
    catch(e) { logError(e, 'intl GRP sync (VS+GRP)'); }
    invalidateCache(TABLES.NAT_LOADS);
    return; // finally block still runs (_syncingOrders.delete)
  }

  // ══════════════════════════════════════════════
  // VS ON + GRP OFF → Create/Update Direct NAT_LOADS
  // ══════════════════════════════════════════════
  console.log('VS ON → sync NAT_LOADS (Direct)');

  // Clean up legacy NAT_ORDERS if any exist (migration path)
  for (const no of legacyNO) {
    try {
      // Delete NL records linked to this NO
      const nlsNO = await atGetAll(TABLES.NAT_LOADS, {filterByFormula:`{Source Record}="${no.id}"`,fields:['Name']},false);
      for (const nl of nlsNO) await atDelete(TABLES.NAT_LOADS, nl.id);
      // Delete the NO itself
      await atDelete(TABLES.NAT_ORDERS, no.id);
      console.log('Cleaned up legacy NO:', no.id);
    } catch(e) { console.warn('Legacy NO cleanup:', e); }
  }

  // Build location arrays
  const pickupLocs = [];
  const delivLocs  = [];

  if (direction === 'Export') {
    // ΑΝΟΔΟΣ: supplier(s) → Veroia
    for (let i = 1; i <= 10; i++) {
      const val = fields['Loading Location '+i];
      if (val && val.length) { const id = _lid(val[0]); if (id) pickupLocs.push(id); }
    }
    delivLocs.push(F.VEROIA_LOC);
  } else {
    // ΚΑΘΟΔΟΣ: Veroia → client(s)
    pickupLocs.push(F.VEROIA_LOC);
    for (let i = 1; i <= 10; i++) {
      const val = fields['Unloading Location '+i];
      if (val && val.length) { const id = _lid(val[0]); if (id) delivLocs.push(id); }
    }
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
    'Total Pallets':     direction === 'Export'
                           ? (fields['Loading Pallets 1'] || fields['Total Pallets'] || 0)
                           : (fields['Unloading Pallets 1'] || fields['Loading Pallets 1'] || fields['Total Pallets'] || 0),
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
    if (upd?.error) alert('NAT_LOADS UPDATE ERROR: ' + JSON.stringify(upd.error));
    else nlId = existingNL[0].id;
    console.log('NAT_LOADS updated:', nlId);
  } else {
    const cre = await atCreate(TABLES.NAT_LOADS, nlFields);
    if (cre?.error) {
      alert('NAT_LOADS CREATE ERROR: ' + JSON.stringify(cre.error) + '\n\nFields: ' + JSON.stringify(nlFields));
    } else {
      nlId = cre.id;
      _createdIds.push({ table: TABLES.NAT_LOADS, id: cre.id });
      await atPatch(TABLES.ORDERS, orderId, {'National Order Created': true});
      console.log('NAT_LOADS created:', nlId);
    }
  }

  // GRP OFF → delete any auto-created NAT_ORDER + its GL + CL + NL
  try { await _deleteGrpForIntl(orderId); }
  catch(e) { console.warn('GL cleanup (grp OFF):', e); }

  invalidateCache(TABLES.NAT_LOADS);

  } catch (err) {
    // Rollback: delete all records created during this sync
    for (const item of _createdIds.reverse()) {
      try { await atDelete(item.table, item.id); } catch(_) {}
    }
    if (typeof showErrorToast === 'function') showErrorToast('VS sync failed and was rolled back', 'error');
    else console.error('VS sync failed and was rolled back:', err);
    throw err;
  } finally {
    _syncingOrders.delete(orderId);
  }
}

// ═══════════════════════════════════════════════════════════════
// _syncGrpFromIntl — auto-create/update NAT_ORDER for intl GRP
// Anchors GL lines to a proper NAT_ORDER (Linked National Order)
// Works for both VS+GRP and non-VS GRP international orders
// ═══════════════════════════════════════════════════════════════
async function _syncGrpFromIntl(orderId, fields) {
  const dir    = fields['Direction'] || 'Export';
  const natDir = dir === 'Export' ? F.DIR_SN : F.DIR_NS;
  const _lid   = v => (v&&typeof v==='object'&&v.id)?v.id:(typeof v==='string'?v:null);

  // Build NAT_ORDER fields from intl order data
  const noFields = {
    'Direction':        natDir,
    'Type':             'Independent',
    'Goods':            fields['Goods'] || '',
    'National Groupage':true,
    'Reference':        fields['Reference'] || '',
  };
  if (fields['Loading DateTime'])   noFields['Loading DateTime']   = (fields['Loading DateTime']).slice(0,10);
  if (fields['Delivery DateTime'])  noFields['Delivery DateTime']  = (fields['Delivery DateTime']).slice(0,10);
  if (fields['Temperature °C'] != null) noFields['Temperature °C'] = fields['Temperature °C'];
  if (fields['Client']?.length)     noFields['Client']             = fields['Client'];

  // Map Loading Locations 1-10 → Pickup Locations 1-10
  for (let i = 1; i <= 10; i++) {
    const ll = fields[`Loading Location ${i}`];
    if (!ll?.length) break;
    noFields[`Pickup Location ${i}`] = ll;
  }
  // Map Unloading Location 1 → Delivery Location 1
  const ul1 = fields['Unloading Location 1'];
  if (ul1?.length) noFields['Delivery Location 1'] = ul1;

  // Find or create NAT_ORDER linked to this intl order
  // NOTE: ARRAYJOIN({Linked Order}) returns display names, NOT record IDs.
  // Fix: fetch candidates by Reference, then check Linked Order in JS.
  let noId = null;
  try {
    const ref = fields['Reference'] || '';
    // Fetch candidates: same Reference + Groupage + Independent (our auto-created type)
    const candidates = await atGetAll(TABLES.NAT_ORDERS, {
      filterByFormula: `AND({National Groupage}=1,{Type}='Independent')`,
      fields: ['Name', 'Linked Order']
    }, false);
    // Find in JS — Linked Order field returns actual record IDs in GET response
    const found = candidates.filter(r => {
      const links = r.fields['Linked Order'] || [];
      return links.some(l => (l?.id || l) === orderId);
    });
    if (found.length) {
      noId = found[0].id;
      await atPatch(TABLES.NAT_ORDERS, noId, noFields);
    } else {
      noFields['Linked Order'] = [orderId];
      const created = await atCreate(TABLES.NAT_ORDERS, noFields);
      noId = created.id;
      invalidateCache(TABLES.NAT_ORDERS);
    }
  } catch(e) { logError(e, '_syncGrpFromIntl: NAT_ORDER find/create'); return; }

  // Sync GL lines using existing function — now with proper NAT_ORDER ID
  await _syncGroupageLines(orderId, noId, fields, null);
  invalidateCache(TABLES.GL_LINES);
}

// ═══════════════════════════════════════════════════════════════
// _deleteGrpForIntl — cleanup when intl GRP is turned OFF
// Deletes auto-created NAT_ORDER + GL + linked CL + linked NL
// ═══════════════════════════════════════════════════════════════
async function _deleteGrpForIntl(orderId) {
  // Fetch all auto-created NAT_ORDERS (Groupage+Independent) then filter by Linked Order in JS
  const candidates = await atGetAll(TABLES.NAT_ORDERS, {
    filterByFormula: `AND({National Groupage}=1,{Type}='Independent')`,
    fields: ['Name','Linked Order']
  }, false);
  const nos = candidates.filter(r => {
    const links = r.fields['Linked Order'] || [];
    return links.some(l => (l?.id || l) === orderId);
  });
  for (const no of nos) {
    // Delete GL lines linked to this NAT_ORDER
    const gls = await atGetAll(TABLES.GL_LINES, {
      filterByFormula: `FIND("${no.id}",ARRAYJOIN({Linked National Order},","))>0`,
      fields: ['Status']
    }, false);
    for (const gl of gls) {
      if (gl.fields.Status !== 'Assigned') {
        try {
          const cls = await atGetAll(TABLES.CONS_LOADS, {
            filterByFormula: `FIND("${gl.id}",ARRAYJOIN({Groupage Lines},","))>0`,
            fields: ['Name']
          }, false);
          for (const cl of cls) {
            try {
              const nls = await atGetAll(TABLES.NAT_LOADS, {filterByFormula:`{Source Record}="${cl.id}"`,fields:['Name']},false);
              for (const nl of nls) await atDelete(TABLES.NAT_LOADS, nl.id);
            } catch(e) { logError(e, '_deleteGrpForIntl: delete NL'); }
            await atDelete(TABLES.CONS_LOADS, cl.id);
          }
        } catch(e) { logError(e, '_deleteGrpForIntl: delete CL'); }
        await atDelete(TABLES.GL_LINES, gl.id);
      }
    }
    // Delete the auto-created NAT_ORDER itself
    try { await atDelete(TABLES.NAT_ORDERS, no.id); } catch(e) { logError(e, '_deleteGrpForIntl: delete NO'); }
  }
  invalidateCache(TABLES.GL_LINES);
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

    // When called from intl order (VS+GRP), noId IS the orderId — a linked field to NAT_ORDERS
    // cannot accept an ORDERS record ID. Use reference-based filtering instead.
    const isIntlSide = (noId === orderId);

    // Get existing GL lines
    const existing = await atGetAll(TABLES.GL_LINES, {
      filterByFormula: isIntlSide
        ? `{Reference}="${ref}"`
        : `FIND("${noId}",ARRAYJOIN({Linked National Order},","))>0`,
      fields: ['Loading Location','Status','Pallets'],
    }, false);

    // National Groupage OFF → DELETE unassigned GL lines
    if (!isGrp) {
      for (const r of existing) {
        if (r.fields.Status !== 'Assigned') {
          try { await atDelete(TABLES.GL_LINES, r.id); }
          catch(e) { console.warn('GL delete:', e); }
        }
      }
      return;
    }

    // Build target stops: NO Pickup Locations + ORDERS pallets
    const nf = natFields || {};
    const targets = [];
    for (let i=1; i<=10; i++) {
      // Use NO Pickup Location N (already mapped from ORDERS Loading Location)
      const puArr = nf[`Pickup Location ${i}`];
      const pal   = orderFields[`Loading Pallets ${i}`] || orderFields[`Unloading Pallets ${i}`];
      if (!puArr?.length) break;
      if (!pal) continue;
      const locId = _lid(puArr[0]);
      if (locId) targets.push({locId, pal: parseInt(pal)||0});
    }
    // Fallback: use ORDERS Loading Locations directly if NO has no Pickup Locs
    if (!targets.length) {
      for (let i=1; i<=10; i++) {
        const locArr = orderFields[`Loading Location ${i}`];
        const pal    = orderFields[`Loading Pallets ${i}`];
        if (!locArr?.length || !pal) break;
        const locId = _lid(locArr[0]);
        if (locId) targets.push({locId, pal: parseInt(pal)||0});
      }
    }
    if (!targets.length) return;

    // Delivery location
    const delLocArr = dir==='Import'
      ? orderFields['Unloading Location 1']
      : null; // Export → Veroia cross-dock
    const delLoc = delLocArr?.length ? _lid(delLocArr[0]) : 'recJucKOhC1zh4IP3';

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
      // Only link to NAT_ORDERS when called from natl side (noId is a NAT_ORDERS record)
      if (!isIntlSide) glFields['Linked National Order'] = [noId];
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
  } catch(e) { console.error('_syncGroupageLines:', e); }
}


async function submitIntlOrder(recId) {
  const btn = document.getElementById('btnSubmit');
  if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

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
      alert('⚠ Αδύνατη υποβολή — οι παρακάτω τοποθεσίες δεν έχουν επιλεγεί από τη λίστα:\n\n' + unmatchedLocs.join('\n') + '\n\nΨάξε και επίλεξε από το dropdown.');
      if (btn) { btn.textContent = recId ? 'Update Order' : 'Submit'; btn.disabled = false; }
      throw new Error('validation');
    }

    // Strings
    const sv = id => document.getElementById(id)?.value?.trim()||'';
    if (sv('f_Brand'))     fields['Brand']             = sv('f_Brand');
    if (sv('f_Type'))      fields['Type']              = sv('f_Type');
    if (sv('f_Direction')) fields['Direction']         = sv('f_Direction');
    if (sv('f_Goods'))     fields['Goods']             = sv('f_Goods');
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
    fields['Veroia Switch ']  = ck('f_VeroiaSwitch');
    fields['National Groupage'] = ck('f_Groupage');

    // Client
    const clientId = document.getElementById('lv_client')?.value;
    if (clientId) fields['Client'] = [clientId];

    // Loading stops 1-10
    for (let i=1;i<=10;i++) {
      const locId = document.getElementById('lv_l_'+i)?.value;
      const pal   = document.getElementById('pal_l_'+i)?.value;
      const dt    = document.getElementById('dt_l_'+i)?.value;
      if (!locId && !pal && !dt) { if(i>1) break; else continue; }
      if (locId) fields[`Loading Location ${i}`] = [locId];
      if (pal)   fields[`Loading Pallets ${i}`]  = parseFloat(pal)||0;
      if (dt) {
        if (i===1) fields['Loading DateTime'] = dt;
        else       fields[`Loading DateTime ${i}`] = dt;
      }
    }

    // Delivery stops 1-10
    let del1dt = null;
    for (let i=1;i<=10;i++) {
      const locId = document.getElementById('lv_u_'+i)?.value;
      const pal   = document.getElementById('pal_u_'+i)?.value;
      const dt    = document.getElementById('dt_u_'+i)?.value;
      if (!locId && !pal && !dt) { if(i>1) break; else continue; }
      if (locId) fields[`Unloading Location ${i}`] = [locId];
      if (pal)   fields[`Unloading Pallets ${i}`]  = parseFloat(pal)||0;
      if (dt) {
        fields[`Unloading DateTime ${i}`] = dt;
        if (i===1) { fields['Delivery DateTime'] = dt; del1dt = dt; }
      }
    }


    // Validate required fields
    const _vErrors = [];
    if (!fields['Direction'])            _vErrors.push('Direction is required');
    if (!clientId)                       _vErrors.push('Client is required');
    if (!fields['Loading Location 1'])   _vErrors.push('Loading Location 1 is required');
    if (!fields['Unloading Location 1']) _vErrors.push('Delivery Location 1 is required');
    if (!fields['Loading DateTime'])     _vErrors.push('Loading Date (Stop 1) is required');
    if (!fields['Delivery DateTime'])    _vErrors.push('Delivery Date (Stop 1) is required');

    // Date cross-validation
    if (fields['Loading DateTime'] && fields['Delivery DateTime']) {
      if (new Date(fields['Delivery DateTime']) < new Date(fields['Loading DateTime'])) {
        _vErrors.push('Delivery date cannot be before loading date');
      }
    }

    if (_vErrors.length) {
      showErrorToast(_vErrors.join(' | '), 'warn', 8000);
      throw new Error('validation');
    }

    // ── Pre-save check: auto-restore CL if GL lines are Assigned ───
    if (recId && fields['National Groupage'] && fields['Veroia Switch ']) {
      try {
        const grpCandidates = await atGetAll(TABLES.NAT_ORDERS, {
          filterByFormula: `AND({National Groupage}=1,{Type}='Independent')`,
          fields: ['Linked Order']
        }, false);
        const myNO = grpCandidates.find(r =>
          (r.fields['Linked Order']||[]).some(l => (l?.id||l) === recId)
        );
        if (myNO) {
          const assignedGLs = await atGetAll(TABLES.GL_LINES, {
            filterByFormula: `AND(FIND("${myNO.id}",ARRAYJOIN({Linked National Order},","))>0,{Status}='Assigned')`,
            fields: ['Status']
          }, false);
          if (assignedGLs.length > 0) {
            const ok = confirm(
              `⚠️ ${assignedGLs.length} GL line(s) ανήκουν ήδη σε Consolidated Load.\n\n` +
              `Αν συνεχίσεις, το Consolidated Load θα γίνει αυτόματα RESTORE\n` +
              `(διαγραφή CL + NAT_LOADS) και τα GL lines θα επιστρέψουν σε Unassigned.\n\n` +
              `Θέλεις να συνεχίσεις;`
            );
            if (!ok) { btn.textContent = 'Save Changes'; btn.disabled = false; return; }

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
                      filterByFormula: `{Source Record}="${cl.id}"`, fields: ['Name']
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
            toast(`Restore ολοκληρώθηκε (${assignedGLs.length} GL → Unassigned)`, 'info');
          }
        }
      } catch(e) { console.warn('Pre-save CL restore:', e); }
    }
    // ────────────────────────────────────────────────────────────

    const result = recId
      ? await atSafePatch(TABLES.ORDERS, recId, fields)
      : await atCreate(TABLES.ORDERS, fields);
    if (result?.conflict) { toast('Record modified by another user — reload and try again','warn'); return; }

    if (result?.error) throw new Error(result.error.message || JSON.stringify(result.error));

    invalidateCache(TABLES.ORDERS);

    // Sync Veroia Switch → NAT_LOADS (direct, no intermediate NAT_ORDERS)
    const savedOrderId = recId || result.id;
    try {
      toast('Syncing VS national load...', 'info');
      const rec = await atGetOne(TABLES.ORDERS, savedOrderId);
      console.log('SYNC: fetched record', savedOrderId, rec.fields?.[F.VEROIA_SWITCH], rec.fields?.['Direction'], rec.fields?.['Type']);
      if (!rec.fields) { toast('SYNC ERROR: no fields', 'warn'); return; }
      await _syncVeroiaSwitch(savedOrderId, rec.fields);
      // RAMP records are created by daily_ramp.js auto-sync (sole source)
      toast('National load synced ✓');
    } catch(e) {
      console.error('VS sync error:', e);
      toast('Sync error: '+e.message, 'warn');
    }

    document.getElementById('modal').style.maxWidth = '';
    closeModal();
    toast(recId ? 'Order updated ✓' : 'Order created ✓');
    await renderOrdersIntl();

  } catch(e) {
    if (e.message !== 'validation') alert('Error saving: ' + e.message);
    if (btn) { btn.textContent = recId ? 'Save Changes' : 'Submit'; btn.disabled = false; }
  }
}

// ─── Inline toggle ───────────────────────────────
async function toggleIntlInvoiced(recId, current) {
  const newVal = !current;
  // Block invoice if PE sheets missing
  if (newVal && !(await _checkPalletSheets(recId))) return;
  try {
    const res = await atSafePatch(TABLES.ORDERS, recId, { 'Invoiced': newVal });
    if (res?.conflict) { toast('Record modified by another user — refresh','warn'); return; }
    // Update local data
    const rec = INTL_ORDERS.data.find(r => r.id === recId);
    if (rec) rec.fields['Invoiced'] = newVal;
    // Re-render table only (no full reload)
    _applyIntlFilters();
    toast(newVal ? 'Marked as Invoiced' : 'Invoice removed');
  } catch(e) { toast('Error: ' + e.message, 'danger'); }
}

// ─── Status Change ─────────────────────────────
async function _intlChangeStatus(recId, newStatus) {
  try {
    const res = await atSafePatch(TABLES.ORDERS, recId, { 'Status': newStatus });
    if (res?.conflict) { toast('Record modified by another user — refresh','warn'); return; }
    const rec = INTL_ORDERS.data.find(r => r.id === recId);
    if (rec) rec.fields['Status'] = newStatus;
    _applyIntlFilters();
    selectIntlOrder(recId);
    toast(`Status → ${newStatus} ✓`);
  } catch(e) { toast('Error: ' + e.message, 'danger'); }
}

// ─── Invoice Block — check PE sheets ─────────
async function _checkPalletSheets(recId) {
  const rec = INTL_ORDERS.data.find(r => r.id === recId);
  if (!rec) return true;
  const f = rec.fields;
  if (!f['Pallet Exchange']) return true; // no PE, allow invoice
  if (!f['Pallet Sheet 1 Uploaded']) {
    toast('Pallet Sheet 1 missing — upload before invoicing', 'danger');
    return false;
  }
  if (f['Veroia Switch '] && !f['Pallet Sheet 2 Uploaded']) {
    toast('Pallet Sheet 2 (Crossdock) missing — upload before invoicing', 'danger');
    return false;
  }
  return true;
}

// ─── Pallet Sheet Upload Overlay ───────────────
function openPalletUpload(orderId) {
  // Create full-screen iframe overlay
  let overlay = document.getElementById('palletUploadOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'palletUploadOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `
      <div style="position:relative;width:95vw;max-width:900px;height:90vh;background:var(--sidebar-bg);border-radius:12px;overflow:hidden">
        <button onclick="closePalletUpload()" style="position:absolute;top:8px;right:12px;z-index:10;background:rgba(255,255,255,0.15);border:none;color:white;font-size:20px;cursor:pointer;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center">✕</button>
        <iframe id="palletUploadFrame" style="width:100%;height:100%;border:none;border-radius:12px" src=""></iframe>
      </div>`;
    document.body.appendChild(overlay);
  }
  const iframe = document.getElementById('palletUploadFrame');
  iframe.src = `https://dimitrispetras21-del.github.io/petras-assign/pallet_upload_v2.html?id=${orderId}`;
  overlay.style.display = 'flex';
  // Listen for save messages
  window._palletMsgHandler = async function(e) {
    if (e.data?.type === 'pallet-saved') {
      toast('Pallet sheet saved ✓');
      // Refresh the specific order from Airtable to get updated sheet flags
      try {
        const freshRec = await atGetOne(TABLES.ORDERS, e.data.orderId || orderId);
        if (freshRec.fields) {
          // Update in-memory data
          const idx = INTL_ORDERS.data.findIndex(r => r.id === (e.data.orderId || orderId));
          if (idx >= 0) INTL_ORDERS.data[idx] = freshRec;
        }
      } catch(err) { console.warn('Refresh order err:', err); }
      invalidateCache(TABLES.ORDERS);
      _applyIntlFilters();
      // Re-select to update detail panel
      selectIntlOrder(e.data.orderId || orderId);
    }
  };
  window.addEventListener('message', window._palletMsgHandler);
}
async function closePalletUpload() {
  const overlay = document.getElementById('palletUploadOverlay');
  if (overlay) overlay.style.display = 'none';
  const orderId = INTL_ORDERS.selectedId;
  document.getElementById('palletUploadFrame').src = '';
  if (window._palletMsgHandler) {
    window.removeEventListener('message', window._palletMsgHandler);
    delete window._palletMsgHandler;
  }
  // Always refresh order on close (in case sheets were uploaded)
  if (orderId) {
    try {
      const freshRec = await atGetOne(TABLES.ORDERS, orderId);
      if (freshRec.fields) {
        const idx = INTL_ORDERS.data.findIndex(r => r.id === orderId);
        if (idx >= 0) INTL_ORDERS.data[idx] = freshRec;
      }
    } catch(err) { logError(err, 'orders_intl refresh after pallet close'); }
    _applyIntlFilters();
    selectIntlOrder(orderId);
  }
}


// ═══════════════════════════════════════════════
// SCAN ORDER — AI Pre-fill
// ═══════════════════════════════════════════════

function openIntlScan() {
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
      <div style="font-size:12px;color:var(--text-dim);margin-top:4px">JPG · PNG · PDF — max 10MB</div>
    </div>
    <input type="file" id="scanFile" accept="image/*,application/pdf" style="display:none"
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
  _scanHandleFile(e.dataTransfer.files[0]);
}

function _scanHandleFile(file) {
  if (!file) return;
  window._scanUploadedFile = file;
  const btn = document.getElementById('btnScanGo');
  if (btn) btn.disabled = false;

  const drop = document.getElementById('scanDrop');
  if (drop) drop.innerHTML = `
    <div style="font-size:24px;margin-bottom:6px">✅</div>
    <div style="font-size:13px;font-weight:500;color:var(--success)">${escapeHtml(file.name)}</div>
    <div style="font-size:12px;color:var(--text-dim);margin-top:3px">${(file.size/1024).toFixed(0)} KB — κλικ για αλλαγή</div>`;

  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => {
      const st = document.getElementById('scanStatus');
      if (st) {
        st.style.display = 'block';
        st.innerHTML = `<img src="${e.target.result}"
          style="max-width:100%;max-height:180px;border-radius:8px;
                 border:1px solid var(--border);display:block;margin:0 auto">`;
      }
    };
    reader.readAsDataURL(file);
  }
}

async function _scanExtract() {
  const file = window._scanUploadedFile;
  if (!file) return;
  const st  = document.getElementById('scanStatus');
  const btn = document.getElementById('btnScanGo');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block"></span> &nbsp;Analyzing...'; }
  st.style.display = 'block';
  st.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--bg);border-radius:8px;border:1px solid var(--border);font-size:13px;color:var(--text-mid)"><span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>AI αναλύει το document...</div>`;

  try {
    const b64 = await new Promise((res,rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result.split(',')[1]);
      r.onerror = () => rej(new Error('File read error'));
      r.readAsDataURL(file);
    });

    const isPDF = file.type === 'application/pdf';
    const cb = isPDF
      ? { type:'document', source:{ type:'base64', media_type:'application/pdf', data:b64 } }
      : { type:'image',    source:{ type:'base64', media_type:file.type, data:b64 } };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key': ANTH_KEY,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body: JSON.stringify({
        model:'claude-opus-4-6',
        max_tokens:1000,
        system:`You are a logistics document parser for an international transport company (Greece ↔ Central/Eastern Europe).
Extract order data from CMR waybills, Carrier Orders, delivery orders, or transport documents.
Return ONLY valid JSON — no markdown, no explanation, no extra text.

Output schema:
{
  "client_name": "company that issued the order (e.g. OGL Food Trade)",
  "goods": "comma-separated list of all product descriptions",
  "gross_weight_kg": total gross weight as number or null,
  "pallets": total pallet count across all loading stops as number,
  "temperature_c": required transport temperature as number or null,
  "direction": "Export if loading in Greece, Import if loading outside Greece",
  "price_eur": freight cost or order price as number or null,
  "confidence": "HIGH or MEDIUM or LOW",
  "notes": "any special instructions, trailer requirements, etc.",
  "loading_stops": [
    {
      "location_name": "the SUPPLIER/WAREHOUSE name as it appears in the document (e.g. IRINOUPOLI SÜD, ANGELAKIS - NAFPAKTOS, LEVENTOGIANNIS - ARGOS)",
      "city": "city name in English/Latin",
      "city_gr": "city name in Greek (e.g. Ασπρόπυργος, Ναύπακτος, Ναύπλιο, Αγρίνιο, Βέλο, Κατερίνη)",
      "country": "country name",
      "date": "YYYY-MM-DD",
      "pallets": number of pallets loaded at this stop
    }
  ],
  "delivery_stops": [
    {
      "location_name": "the COMPANY/WAREHOUSE name as it appears (e.g. LIDL SLOVENIJA D.O.O. K.D.)",
      "city": "city name in English/Latin",
      "city_gr": "city name in Greek if applicable",
      "country": "country name",
      "date": "YYYY-MM-DD",
      "pallets": null
    }
  ]
}

CRITICAL RULES for OGL/Fruitservice Carrier Orders:
- The table has numbered rows. Each section = one stop.
- "Supplier" column contains the warehouse/supplier name — use this as location_name
- PAL column = pallet count per product line — SUM all PAL values per loading stop
- Each distinct Supplier group = one loading_stop object
- Unloading stops (↓) = delivery_stops
- client_name = the company at the top of the document (e.g. "OGL Food Trade Lebensmittelvertrieb GmbH")
- direction: if all loading addresses are in Greece → Export
- goods: list all distinct product descriptions (deduplicated)`,
        messages:[{role:'user', content:[cb, {type:'text',text:'Extract all order data from this transport document.'}]}]
      })
    });

    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    const raw    = d.content.find(c=>c.type==='text')?.text||'{}';
    const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
    await _scanPreview(parsed);

  } catch(e) {
    st.innerHTML = `<div style="padding:12px 14px;background:var(--danger-bg);border:1px solid rgba(220,38,38,0.2);
      border-radius:8px;font-size:13px;color:var(--danger)">❌ ${e.message}</div>`;
    if (btn) { btn.disabled=false; btn.innerHTML='🤖 &nbsp;Extract & Fill Form'; }
  }
}

async function _scanPreview(data) {
  const st  = document.getElementById('scanStatus');
  const btn = document.getElementById('btnScanGo');
  if (btn) { btn.disabled=false; btn.innerHTML='🤖 &nbsp;Extract & Fill Form'; }

  // Try to match client
  let clientId='', clientLabel='';
  if (data.client_name) {
    const r = await _searchClients(data.client_name);
    if (r.length) { clientId=r[0].id; clientLabel=r[0].label; }
  }
  // Match loading stops — try location_name first, then city fallback
  const loadStops = (data.loading_stops||[]);
  if (!loadStops.length && data.loading_city) loadStops.push({location_name:'',city:data.loading_city,country:data.loading_country||'',date:data.loading_date,pallets:data.pallets});
  const _locMatch = s => {
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span class="detail-section-title" style="margin:0">AI Extraction</span>
        <span style="font-size:11px;font-weight:600;letter-spacing:1px;color:${confC}">${conf}</span>
      </div>
      ${row('Client',   escapeHtml(clientLabel||data.client_name), !!clientId)}
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
  window._scanResult = { matched: {clientId,clientLabel,loadLocId,loadLocLabel,delLocId,delLocLabel,loadStops,delStops}, data };

  // Update footer
  document.getElementById('modalFooter').innerHTML = `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-ghost" onclick="openIntlScan()">↩ Rescan</button>
    <button class="btn btn-success" onclick="_scanOpenStored()">Open Form →</button>`;
}

async function _scanOpenStored() {
  const r = window._scanResult;
  if (r) await _scanOpen(r.matched, r.data);
}

async function _scanOpen(matched, data) {
  const f = {};
  if (matched.clientId) f['Client'] = [matched.clientId];
  if (data.goods)       f['Goods']  = data.goods;
  if (data.gross_weight_kg) f['Gross Weight kg'] = data.gross_weight_kg;
  if (data.temperature_c!=null) { f['Temperature °C'] = data.temperature_c; f['Refrigerator Mode'] = 'Continuous'; }
  if (data.direction)   f['Direction'] = data.direction;
  if (data.price_eur)   f['Price'] = data.price_eur;

  // Loading stops
  const ls = matched.loadStops || [];
  ls.forEach((s,i) => {
    const n = i+1;
    if (s._locId) f[n===1?'Loading Location 1':`Loading Location ${n}`] = [s._locId];
    if (s.pallets!=null) f[n===1?'Loading Pallets 1':`Loading Pallets ${n}`] = s.pallets;
    if (s.date) f[n===1?'Loading DateTime':`Loading DateTime ${n}`] = s.date;
  });
  // First loading date fallback
  if (!ls.length && data.loading_date) f['Loading DateTime'] = data.loading_date;

  // Delivery stops
  const ds = matched.delStops || [];
  ds.forEach((s,i) => {
    const n = i+1;
    if (s._locId) f[n===1?'Unloading Location 1':`Unloading Location ${n}`] = [s._locId];
    if (s.date) f[n===1?'Delivery DateTime':`Unloading DateTime ${n}`] = s.date;
  });
  if (!ds.length && data.delivery_date) f['Delivery DateTime'] = data.delivery_date;

  // Register matched locations in _locationsMap so _locSelect can show label
  const ls2 = matched.loadStops||[], ds2 = matched.delStops||[];
  [...ls2,...ds2].forEach(s=>{ if(s._locId && s._locLabel) _fhLocationsMap[s._locId]=s._locLabel; });
  if (matched.clientId && matched.clientLabel) _fhClientsMap[matched.clientId] = matched.clientLabel;
  closeModal();
  await _openModal(null, f, matched.clientLabel);
}

// Expose functions used from onclick/onchange/oninput/onblur handlers
window.renderOrdersIntl = renderOrdersIntl;
window.openIntlScan = openIntlScan;
window.openIntlCreate = openIntlCreate;
window.openIntlEdit = openIntlEdit;
window.selectIntlOrder = selectIntlOrder;
window.toggleIntlInvoiced = toggleIntlInvoiced;
window._intlSortToggle = _intlSortToggle;
window._applyIntlFilters = _applyIntlFilters;
window.intlSearch = intlSearch;
window.intlFilter = intlFilter;
window.intlPeriodChange = intlPeriodChange;
window.openPalletUpload = openPalletUpload;
window.closePalletUpload = closePalletUpload;
window.submitIntlOrder = submitIntlOrder;
window._addStop = _addStop;
window._scanExtract = _scanExtract;
window._scanOpenStored = _scanOpenStored;
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
