// ═══════════════════════════════════════════════
// MODULE — NATIONAL ORDERS  v2
// ═══════════════════════════════════════════════
(function() {
'use strict';

const NATL_ORDERS = { data: [], filtered: [], selectedId: null };
const _natlFilters = {};
let _natlSortCol = null;
let _natlSortDir = 0;
let _onPage = 1;
const _onPageSize = 50;
let _natlPeriod = '60'; // '60' | '180' | 'all'

// ─── Virtual Scroll State ─────────────────────
const _onVS = { sortedRecs: [], lastStart: -1, lastEnd: -1, rafId: null };
const _ON_ROW_H = 40;
const _ON_BUFFER = 10;

// ─── Local ref-data caches (self-contained, no dependency on orders_intl) ──
let _locationsMap = {};   // recId → label
let _locationsArr = [];   // [{id,label}]
const _clientsMap  = {};  // recId → name
const _clientCache = {};  // query → [{id,label}]

async function _loadLocations() {
  if (_locationsArr.length) return;
  const locs = await atGet(TABLES.LOCATIONS);
  _locationsArr = locs
    .map(r => ({ id: r.id, label: [r.fields['Name'], r.fields['City'], r.fields['Country']].filter(Boolean).join(', ') }))
    .sort((a,b) => a.label.localeCompare(b.label));
  _locationsArr.forEach(l => { _locationsMap[l.id] = l.label; });
}

async function _searchClients(q) {
  if (!q || q.length < 2) return [];
  const key = q.toLowerCase();
  if (_clientCache[key]) return _clientCache[key];
  const formula = `SEARCH(LOWER("${q.replace(/"/g,'')}"), LOWER({Company Name}))`;
  const recs = await atGet(TABLES.CLIENTS, formula, false);
  const res = recs.map(r => ({ id: r.id, label: r.fields['Company Name'] || '' }))
    .sort((a,b) => a.label.localeCompare(b.label)).slice(0, 30);
  _clientCache[key] = res;
  res.forEach(c => { _clientsMap[c.id] = c.label; });
  return res;
}

// Batch resolve client IDs → names (single OR formula, batched in groups of 10)
async function _batchResolveClients(ids) {
  const unresolvedIds = ids.filter(id => !_clientsMap[id]);
  if (!unresolvedIds.length) return;
  const batches = [];
  for (let i = 0; i < unresolvedIds.length; i += 10) {
    const batch = unresolvedIds.slice(i, i + 10);
    const f = `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(',')})`;
    batches.push(
      atGetAll(TABLES.CLIENTS, { filterByFormula: f, fields: ['Company Name'] }, false).catch(() => [])
    );
  }
  const results = await Promise.all(batches);
  results.flat().forEach(r => { _clientsMap[r.id] = r.fields['Company Name'] || r.id; });
}

// Form helpers for location/client selects
function _locSelect(id, currentId) {
  const label = currentId ? (_locationsMap[currentId]||'') : '';
  return `<div style="position:relative">
    <input class="form-input" id="ls_${id}" autocomplete="off" value="${escapeHtml(label)}"
      placeholder="Search location..."
      oninput="_natlLocDrop('${id}',this.value)"
      onfocus="_natlLocDrop('${id}',this.value)"
      onblur="_hideDrop('ls_${id}_d')">
    <input type="hidden" id="lv_${id}" value="${currentId||''}">
    <div id="ls_${id}_d" class="linked-drop" style="display:none"></div>
  </div>`;
}

function _clientSelect(id, currentId, currentLabel) {
  return `<div style="position:relative">
    <input class="form-input" id="ls_${id}" autocomplete="off" value="${escapeHtml(currentLabel||'')}"
      placeholder="Type 2+ chars to search..."
      oninput="_natlClientDrop('${id}',this.value)"
      onblur="_hideDrop('ls_${id}_d')">
    <input type="hidden" id="lv_${id}" value="${currentId||''}">
    <div id="ls_${id}_d" class="linked-drop" style="display:none"></div>
  </div>`;
}

// Natl-specific client dropdown (uses local _searchClients + _clientsMap)
let _natlClientTimer = null;
function _natlClientDrop(id, q) {
  clearTimeout(_natlClientTimer);
  const d = document.getElementById('ls_'+id+'_d');
  if (q.length < 2) { if(d) d.style.display='none'; return; }
  if (d) { d.style.display='block'; d.innerHTML='<div style="padding:10px 12px;font-size:12px;color:var(--text-dim)">Searching...</div>'; }
  _natlClientTimer = setTimeout(async () => {
    const results = await _searchClients(q);
    _natlShowDrop('ls_'+id+'_d', id, results);
  }, 300);
}

function _natlLocDrop(id, q) {
  const pool = q.trim()
    ? _locationsArr.filter(o=>o.label.toLowerCase().includes(q.toLowerCase())).slice(0,25)
    : _locationsArr.slice(0,25);
  _natlShowDrop('ls_'+id+'_d', id, pool);
}

function _natlShowDrop(dropId, id, items) {
  const d = document.getElementById(dropId); if(!d) return;
  if (!items.length) { d.style.display='none'; return; }
  d.style.display='block';
  d.innerHTML = items.map(o =>
    `<div class="linked-drop-item" onmousedown="_natlPickLinked('${id}','${o.id}',\`${escapeHtml(o.label)}\`)">${escapeHtml(o.label)}</div>`
  ).join('');
}

function _natlPickLinked(id, recId, label) {
  const inp = document.getElementById('ls_'+id);
  const hid = document.getElementById('lv_'+id);
  if(inp) inp.value = label;
  if(hid) hid.value = recId;
  const d = document.getElementById('ls_'+id+'_d');
  if(d) d.style.display='none';
}

// ─── Main ───────────────────────────────────────
async function renderOrdersNatl() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading national orders...');
  try {
    // Date range filter based on period dropdown
    let _natlDateFormula = '';
    if (_natlPeriod !== 'all') {
      const days = _natlPeriod === '180' ? 180 : 60;
      const _natlCutoff = new Date();
      _natlCutoff.setDate(_natlCutoff.getDate() - days);
      const _natlCutoffStr = _natlCutoff.toISOString().split('T')[0];
      _natlDateFormula = `IS_AFTER({Loading DateTime}, '${_natlCutoffStr}')`;
    }
    const [, records] = await Promise.all([
      _loadLocations(),
      atGet(TABLES.NAT_ORDERS, _natlDateFormula || '', false),
    ]);
    records.sort((a,b) => (b.fields['Loading DateTime']||'').localeCompare(a.fields['Loading DateTime']||''));
    NATL_ORDERS.data = records;
    NATL_ORDERS.filtered = records;
    NATL_ORDERS.selectedId = null;
    Object.keys(_natlFilters).forEach(k => delete _natlFilters[k]);
    _onPage = 1;

    // Pre-resolve all client names — batch fetches in parallel (not N+1)
    const _allClientIds = [...new Set(records
      .flatMap(r => r.fields['Client']||[])
      .filter(Boolean))];
    await _batchResolveClients(_allClientIds);

    _renderNatlLayout(c);
    _applyNatlFilters();
  } catch(e) { c.innerHTML = showError(e.message); }
}

function _renderNatlLayout(c) {
  const canEdit = can('orders') === 'full';
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:14px">
      <div>
        <div class="page-title">National Orders</div>
        <div class="page-sub" id="natlSub">${NATL_ORDERS.data.length} orders</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-scan" onclick="openNatlScan ? openNatlScan() : void 0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
          Scan</button>
        ${canEdit ? `<button class="btn btn-new-order" onclick="openNatlCreate()">
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
            oninput="natlSearch(this.value)">
          <select class="filter-select" onchange="natlFilter('Direction',this.value)">
            <option value="">Direction: All</option>
            <option value="North→South">↓ North→South</option>
            <option value="South→North">↑ South→North</option>
          </select>
          <select class="filter-select" onchange="natlFilter('Type',this.value)">
            <option value="">Type: All</option>
            <option value="Independent">Independent</option>
            <option value="Veroia Switch">Veroia Switch</option>
          </select>
          <select class="filter-select" onchange="natlFilter('Status',this.value)">
            <option value="">Status: All</option>
            <option value="Pending">Pending</option>
            <option value="Confirmed">Confirmed</option>
            <option value="In Transit">In Transit</option>
            <option value="Delivered">Delivered</option>
          </select>
          <select class="filter-select" onchange="natlFilter('_trip',this.value)">
            <option value="">Trip: All</option>
            <option value="unassigned">Unassigned</option>
            <option value="assigned">Assigned</option>
          </select>
          <select class="filter-select" onchange="natlFilter('_groupage',this.value)">
            <option value="">Groupage: All</option>
            <option value="1">Groupage only</option>
          </select>
          <select class="filter-select" onchange="natlPeriodChange(this.value)">
            <option value="60" ${_natlPeriod==='60'?'selected':''}>Last 60 days</option>
            <option value="180" ${_natlPeriod==='180'?'selected':''}>Last 6 months</option>
            <option value="all" ${_natlPeriod==='all'?'selected':''}>All time</option>
          </select>
          <span class="entity-count" id="natlCount">${NATL_ORDERS.data.length} orders</span>
        </div>
        <div class="entity-table-wrap" id="natlTable"></div>
      </div>
      <div class="entity-detail-panel hidden" id="natlDetail"></div>
    </div>`;
}

// ─── Sort helpers ────────────────────────────────
const _natlColDefs = [
  { key: 'name',     label: 'Name',      type: 'text',   get: (f) => f['Name']||'' },
  { key: 'dir',      label: 'Dir',       type: 'text',   get: (f) => f['Direction']||'' },
  { key: 'client',   label: 'Client',    type: 'text',   get: (f) => { const id=(f['Client']||[])[0]; return id?(_clientsMap[id]||''):''; } },
  { key: 'pickup',   label: 'Pickup',    type: 'text',   get: (f) => { const id=(f['Pickup Location 1']||f['Pickup Location']||[])[0]; return id?(_locationsMap[id]||''):''; } },
  { key: 'delivery', label: 'Delivery',  type: 'text',   get: (f) => { const id=(f['Delivery Location 1']||f['Delivery Location']||[])[0]; return id?(_locationsMap[id]||''):''; } },
  { key: 'loadDate', label: 'Load Date', type: 'date',   get: (f) => f['Loading DateTime']||'' },
  { key: 'delDate',  label: 'Del Date',  type: 'date',   get: (f) => f['Delivery DateTime']||'' },
  { key: 'pal',      label: 'PAL',       type: 'number', get: (f) => f['Pallets']||0 },
  { key: 'trip',     label: 'Trip',      type: 'text',   get: (f) => ((f['Linked Trip']?.length||0)+(f['NATIONAL TRIPS']?.length||0)+(f['NATIONAL TRIPS 2']?.length||0))>0?'Assigned':'Pending' },
  { key: 'inv',      label: 'INV',       type: 'text',   get: (f) => f['Invoiced']?'1':'0' },
];

function _natlSortToggle(key) {
  if (_natlSortCol === key) {
    _natlSortDir = (_natlSortDir + 1) % 3;
    if (_natlSortDir === 0) _natlSortCol = null;
  } else {
    _natlSortCol = key;
    _natlSortDir = 1;
  }
  _applyNatlFilters();
}

function _natlSortRecords(recs) {
  if (!_natlSortCol || _natlSortDir === 0) return recs;
  const col = _natlColDefs.find(c => c.key === _natlSortCol);
  if (!col) return recs;
  const dir = _natlSortDir === 1 ? 1 : -1;
  return [...recs].sort((a, b) => {
    let va = col.get(a.fields), vb = col.get(b.fields);
    if (col.type === 'number') return ((parseFloat(va)||0) - (parseFloat(vb)||0)) * dir;
    if (col.type === 'date') return (va||'').localeCompare(vb||'') * dir;
    return String(va).toLowerCase().localeCompare(String(vb).toLowerCase()) * dir;
  });
}

// ─── Table (Virtual Scroll) ─────────────────────
function _onRowHtml(r) {
  const f = r.fields;
  const hasTrip = (f['Linked Trip']?.length||0)+(f['NATIONAL TRIPS']?.length||0)+(f['NATIONAL TRIPS 2']?.length||0) > 0;
  const dir = f['Direction']||'';
  const dirB = dir==='South→North'
    ? '<span class="badge badge-blue">↑ S→N</span>'
    : dir==='North→South'
      ? '<span class="badge badge-green">↓ N→S</span>'
      : `<span class="badge badge-grey">${dir||'—'}</span>`;
  const tripB  = hasTrip ? '<span class="badge badge-green">Assigned</span>' : '<span class="badge badge-yellow">Pending</span>';
  const vsB    = f['Type']==='Veroia Switch' ? '<span class="badge badge-yellow" style="margin-right:4px;font-size:10px">VS</span>' : '';
  const grpB   = f['National Groupage'] ? '<span class="badge badge-blue" style="margin-right:4px;font-size:10px">GRP</span>' : '';
  const sel    = r.id === NATL_ORDERS.selectedId ? ' selected' : '';

  const _pickupId = (f['Pickup Location 1']||f['Pickup Location']||[])[0]||'';
  const pickup = _pickupId ? (_locationsMap[_pickupId]||'—') : '—';
  const _delivId = (f['Delivery Location 1']||f['Delivery Location']||[])[0]||'';
  const delivery = _delivId ? (_locationsMap[_delivId]||'—') : '—';
  const _clientId = (f['Client']||[])[0]||'';
  const client = _clientId ? (_clientsMap[_clientId]||'—') : '—';

  return `<tr onclick="selectNatlOrder('${r.id}')" id="nrow_${r.id}" class="${sel}" style="height:${_ON_ROW_H}px">
    <td style="white-space:nowrap">${vsB}${grpB}<strong style="color:var(--text);font-size:12px">${escapeHtml(f['Name']||r.id.slice(-6))}</strong></td>
    <td>${dirB}</td>
    <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(client)}</td>
    <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(pickup)}</td>
    <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(delivery)}</td>
    <td>${f['Loading DateTime']  ? formatDateShort(f['Loading DateTime'])  : '—'}</td>
    <td>${f['Delivery DateTime'] ? formatDateShort(f['Delivery DateTime']) : '—'}</td>
    <td>${f['Pallets']||'—'}</td>
    <td>${tripB}</td>
    <td onclick="event.stopPropagation();toggleNatlInvoiced('${r.id}',${!!f['Invoiced']})"
      title="${f['Invoiced']?'Mark as Not Invoiced':'Mark as Invoiced'}"
      style="cursor:pointer;text-align:center">
      ${f['Invoiced']
        ? '<span class="badge badge-grey" style="cursor:pointer">✓ INV</span>'
        : '<span style="color:var(--text-dim);font-size:18px;line-height:1">·</span>'}
    </td>
  </tr>`;
}

function _onVirtualPaint() {
  const scroller = document.getElementById('onVScroll');
  if (!scroller) return;
  const tbody = scroller.querySelector('tbody');
  const topSp = document.getElementById('onTopSpacer');
  const botSp = document.getElementById('onBottomSpacer');
  if (!tbody || !topSp || !botSp) return;

  const total = _onVS.sortedRecs.length;
  const scrollTop = scroller.scrollTop;
  const visH = scroller.clientHeight;
  const startIdx = Math.max(0, Math.floor(scrollTop / _ON_ROW_H) - _ON_BUFFER);
  const endIdx = Math.min(total, Math.ceil((scrollTop + visH) / _ON_ROW_H) + _ON_BUFFER);

  if (startIdx === _onVS.lastStart && endIdx === _onVS.lastEnd) return;
  _onVS.lastStart = startIdx;
  _onVS.lastEnd = endIdx;

  topSp.style.height = (startIdx * _ON_ROW_H) + 'px';
  botSp.style.height = ((total - endIdx) * _ON_ROW_H) + 'px';

  const html = [];
  for (let i = startIdx; i < endIdx; i++) {
    html.push(_onRowHtml(_onVS.sortedRecs[i]));
  }
  tbody.innerHTML = html.join('');
}

function _onOnScroll() {
  if (_onVS.rafId) return;
  _onVS.rafId = requestAnimationFrame(() => {
    _onVS.rafId = null;
    _onVirtualPaint();
  });
}

function _renderNatlTable(records) {
  const wrap = document.getElementById('natlTable');
  if (!records.length) { wrap.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-dim)">No orders match filters</div>`; return; }

  const sortedRecs = _natlSortRecords(records);
  _onVS.sortedRecs = sortedRecs;
  _onVS.lastStart = -1;
  _onVS.lastEnd = -1;

  const ths = _natlColDefs.map(c => {
    const arrow = _natlSortCol===c.key ? (_natlSortDir===1?' <span style="color:#0284C7">▲</span>':_natlSortDir===2?' <span style="color:#0284C7">▼</span>':'') : '';
    return `<th style="cursor:pointer;user-select:none" onclick="_natlSortToggle('${c.key}')">${c.label}${arrow}</th>`;
  }).join('');

  const totalH = sortedRecs.length * _ON_ROW_H;
  wrap.innerHTML = `
    <div id="onVScroll" style="height:calc(100vh - 280px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#CBD5E0 transparent">
      <table>
        <thead><tr>${ths}</tr></thead>
      </table>
      <div id="onTopSpacer" style="height:0"></div>
      <table><tbody></tbody></table>
      <div id="onBottomSpacer" style="height:${totalH}px"></div>
    </div>
    <div style="padding:8px 16px;color:#94A3B8;font-size:12px;text-align:center">${sortedRecs.length} orders</div>`;

  const scroller = document.getElementById('onVScroll');
  scroller.addEventListener('scroll', _onOnScroll, { passive: true });
  _onVirtualPaint();
}

// ─── Filters ────────────────────────────────────
function natlSearch(q) { _natlFilters._q = q.toLowerCase().trim(); _onPage = 1; _applyNatlFilters(); }
function natlFilter(k,v) { if(!v) delete _natlFilters[k]; else _natlFilters[k]=v; _onPage = 1; _applyNatlFilters(); }
function natlPeriodChange(v) { _natlPeriod = v; _onVS.lastStart = -1; _onVS.lastEnd = -1; renderOrdersNatl(); }

function _applyNatlFilters() {
  let recs = NATL_ORDERS.data;
  if (_natlFilters._q) {
    const q = _natlFilters._q;
    recs = recs.filter(r => {
      const f = r.fields;
      const cId = Array.isArray(f['Client']) ? f['Client'][0] : '';
      const pId = Array.isArray(f['Pickup Location'])  ? f['Pickup Location'][0]  : '';
      const dId = Array.isArray(f['Delivery Location'])? f['Delivery Location'][0]: '';
      return String(f['Name']||'').toLowerCase().includes(q)
        || (_clientsMap[cId]||'').toLowerCase().includes(q)
        || (_locationsMap[pId]||'').toLowerCase().includes(q)
        || (_locationsMap[dId]||'').toLowerCase().includes(q)
        || (f['Goods']||'').toLowerCase().includes(q);
    });
  }
  if (_natlFilters['Direction']) recs = recs.filter(r => r.fields['Direction'] === _natlFilters['Direction']);
  if (_natlFilters['Type'])      recs = recs.filter(r => r.fields['Type']      === _natlFilters['Type']);
  if (_natlFilters['Status'])    recs = recs.filter(r => r.fields['Status']    === _natlFilters['Status']);
  if (_natlFilters['_groupage']) recs = recs.filter(r => r.fields['National Groupage']);
  if (_natlFilters['_trip']==='unassigned') recs = recs.filter(r => {
    const f=r.fields; return !f['Linked Trip']?.length && !f['NATIONAL TRIPS']?.length && !f['NATIONAL TRIPS 2']?.length;
  });
  if (_natlFilters['_trip']==='assigned') recs = recs.filter(r => {
    const f=r.fields; return f['Linked Trip']?.length>0 || f['NATIONAL TRIPS']?.length>0 || f['NATIONAL TRIPS 2']?.length>0;
  });
  NATL_ORDERS.filtered = recs;
  _renderNatlTable(recs);
  const n = recs.length + ' orders';
  document.getElementById('natlCount').textContent = n;
  document.getElementById('natlSub').textContent   = n;
}

// ─── Detail Panel ───────────────────────────────
function selectNatlOrder(recId) {
  NATL_ORDERS.selectedId = recId;
  document.querySelectorAll('#natlTable tbody tr').forEach(tr => tr.classList.remove('selected'));
  const row = document.getElementById('nrow_'+recId); if(row) row.classList.add('selected');
  const rec = NATL_ORDERS.data.find(r => r.id === recId); if(!rec) return;
  const panel = document.getElementById('natlDetail');
  panel.classList.remove('hidden');
  const f = rec.fields;
  const canEdit = can('orders') === 'full';
  const hasTrip = (f['Linked Trip']?.length||0)+(f['NATIONAL TRIPS']?.length||0)+(f['NATIONAL TRIPS 2']?.length||0) > 0;
  const stMap = {Pending:'badge-yellow',Confirmed:'badge-blue','In Transit':'badge-green',Delivered:'badge-grey'};
  const cId = Array.isArray(f['Client']) ? f['Client'][0] : '';
  const pId = Array.isArray(f['Pickup Location'])   ? f['Pickup Location'][0]   : '';
  const dId = Array.isArray(f['Delivery Location'])  ? f['Delivery Location'][0] : '';

  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="detail-title" style="font-size:13px">${escapeHtml(f['Name']||recId.slice(-6))}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px">
          ${escapeHtml(f['Direction']||'')} · ${escapeHtml(f['Type']||'')}
        </div>
      </div>
      <div class="detail-actions">
        ${canEdit?`<div class="btn-icon" title="Edit" onclick="openNatlEdit('${recId}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 2l3 3-9 9H2v-3l9-9z"/></svg>
        </div>
        <div class="btn-icon" title="Delete" onclick="deleteNatlOrder('${recId}')" style="color:#DC2626">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/></svg>
        </div>`:''}
        <div class="btn-icon" onclick="document.getElementById('natlDetail').classList.add('hidden')">✕</div>
      </div>
    </div>
    <div class="detail-body">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        <span class="badge ${stMap[f['Status']]||'badge-grey'}">${escapeHtml(f['Status']||'No Status')}</span>
        ${hasTrip?'<span class="badge badge-green">Trip Assigned</span>':'<span class="badge badge-yellow">No Trip</span>'}
        ${f['National Groupage']?'<span class="badge badge-blue">Groupage</span>':''}
        ${f['Type']==='Veroia Switch'?'<span class="badge badge-yellow">Veroia Switch</span>':''}
        ${f['Invoiced']?'<span class="badge badge-grey">Invoiced</span>':''}
        ${f['Pallet Exchange']?'<span class="badge badge-grey">Pallet Exch.</span>':''}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Order</div>
        ${_dF('Client',      escapeHtml(_clientsMap[cId]||cId||'—'))}
        ${_dF('Direction',   escapeHtml(f['Direction']||'—'))}
        ${_dF('Type',        escapeHtml(f['Type']||'—'))}
        ${_dF('Goods',       escapeHtml(f['Goods']||'—'))}
        ${_dF('Pallets',     escapeHtml(f['Pallets']||'—'))}
        ${_dF('Temperature', f['Temperature °C']!=null?escapeHtml(f['Temperature °C'])+' °C':'—')}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Route</div>
        ${_dF('Pickup',    escapeHtml(_locationsMap[pId]||pId||'—'))}
        ${_dF('Load Date', f['Loading DateTime']  ? formatDate(f['Loading DateTime'])  : '—')}
        ${_dF('Delivery',  escapeHtml(_locationsMap[dId]||dId||'—'))}
        ${_dF('Del Date',  f['Delivery DateTime'] ? formatDate(f['Delivery DateTime']) : '—')}
      </div>
      ${can('costs')!=='none'?`
      <div class="detail-section">
        <div class="detail-section-title">Financial</div>
        ${_dF('Price', f['Price']?'€ '+Number(f['Price']).toLocaleString('el-GR'):'—')}
      </div>`:''}
      ${f['Notes']?`<div class="detail-section"><div class="detail-section-title">Notes</div>
        <div style="font-size:12.5px;color:var(--text-mid);line-height:1.5">${escapeHtml(f['Notes'])}</div></div>`:''}
    </div>`;
}

// ─── Modal ──────────────────────────────────────
function openNatlCreate() { _openNatlModal(null, {}); }
function openNatlEdit(recId) {
  const rec = NATL_ORDERS.data.find(r=>r.id===recId);
  if(rec) _openNatlModal(recId, rec.fields);
}

async function _openNatlModal(recId, f) {
  const isEdit = !!recId;
  const clientId  = Array.isArray(f['Client'])           ? f['Client'][0]           : '';
  const pickupId  = Array.isArray(f['Pickup Location'])  ? f['Pickup Location'][0]  : '';
  const delivId   = Array.isArray(f['Delivery Location'])? f['Delivery Location'][0]: '';
  // Resolve single client name for edit form (batch if not cached)
  if (clientId && !_clientsMap[clientId]) await _batchResolveClients([clientId]);
  const clientLabel = clientId ? (_clientsMap[clientId] || '') : '';
  const opt = (arr, cur) => arr.map(o=>`<option value="${o}" ${f[cur]===o?'selected':''}>${o}</option>`).join('');

  const body = `
    <div class="form-grid">
      <div class="form-field">
        <label class="form-label">Direction *</label>
        <select class="form-select" id="nf_Direction"><option value="">— Select —</option>
          ${opt(['North→South','South→North'],'Direction')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Type</label>
        <select class="form-select" id="nf_Type"><option value="">— Select —</option>
          ${opt(['Independent','Veroia Switch'],'Type')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Client *</label>
        ${_clientSelect('nclient', clientId, clientLabel)}
      </div>
      <div class="form-field">
        <label class="form-label">Price (€)</label>
        <input class="form-input" type="number" id="nf_Price" value="${f['Price']||''}">
      </div>
      <div class="form-field">
        <label class="form-label">Goods</label>
        <input class="form-input" type="text" id="nf_Goods" value="${escapeHtml(f['Goods']||'')}" placeholder="e.g. Fresh Produce">
      </div>
      <div class="form-field">
        <label class="form-label">Pallets</label>
        <input class="form-input" type="number" id="nf_Pallets" value="${f['Pallets']||''}">
      </div>
      <div class="form-field">
        <label class="form-label">Temperature °C</label>
        <input class="form-input" type="number" id="nf_Temp" value="${f['Temperature °C']!=null?f['Temperature °C']:''}">
      </div>
      <div class="form-field" style="padding-top:24px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="nf_PalletExch" ${f['Pallet Exchange']?'checked':''} style="width:15px;height:15px">
          Pallet Exchange</label>
      </div>
    </div>
    <div style="display:flex;gap:24px;margin:16px 0;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="nf_Groupage" ${f['National Groupage']?'checked':''} style="width:15px;height:15px">
        National Groupage</label>
    </div>

    <div style="padding-top:16px;border-top:1px solid var(--border)">
      <div class="detail-section-title" style="margin-bottom:12px">Route</div>
      <div class="form-grid">
        <div class="form-field">
          <label class="form-label">Pickup Location *</label>
          ${_locSelect('npickup', pickupId)}
        </div>
        <div class="form-field">
          <label class="form-label">Loading Date *</label>
          <input class="form-input" type="date" id="nf_LoadDate"
            value="${f['Loading DateTime']?toLocalDate(f['Loading DateTime']):''}">
        </div>
        <div class="form-field">
          <label class="form-label">Delivery Location *</label>
          ${_locSelect('ndelivery', delivId)}
        </div>
        <div class="form-field">
          <label class="form-label">Delivery Date *</label>
          <input class="form-input" type="date" id="nf_DelDate"
            value="${f['Delivery DateTime']?toLocalDate(f['Delivery DateTime']):''}">
        </div>
      </div>
    </div>

    <div style="margin-top:16px">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="nf_Notes" rows="2">${escapeHtml(f['Notes']||'')}</textarea>
    </div>`;

  const footer = `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-success" id="natlBtnSubmit" onclick="submitNatlOrder('${recId||''}')">
      ${isEdit?'Save Changes':'Submit'}
    </button>`;

  document.getElementById('modal').style.maxWidth = '680px';
  openModal(isEdit ? 'Edit National Order' : 'New National Order', body, footer);
}

// ─── Submit ─────────────────────────────────────
async function submitNatlOrder(recId) {
  const btn = document.getElementById('natlBtnSubmit');
  if(btn) { btn.textContent='Saving...'; btn.disabled=true; }

  try {
    const fields = {};
    const sv = id => document.getElementById(id)?.value?.trim()||'';
    const nv = id => { const v=document.getElementById(id)?.value; return v!==''&&v!=null?parseFloat(v):null; };
    const ck = id => !!document.getElementById(id)?.checked;

    if(sv('nf_Direction')) fields['Direction']       = sv('nf_Direction');
    if(sv('nf_Type'))      fields['Type']            = sv('nf_Type');
    if(sv('nf_Goods'))     fields['Goods']           = sv('nf_Goods');
    if(sv('nf_Notes'))     fields['Notes']           = sv('nf_Notes');
    if(sv('nf_LoadDate'))  fields['Loading DateTime']  = sv('nf_LoadDate');
    if(sv('nf_DelDate'))   fields['Delivery DateTime'] = sv('nf_DelDate');

    const price  = nv('nf_Price');   if(price!=null)  fields['Price']          = price;
    const pallets= nv('nf_Pallets'); if(pallets!=null) fields['Pallets']        = pallets;
    const temp   = nv('nf_Temp');    if(temp!=null)    fields['Temperature °C'] = temp;

    fields['Pallet Exchange']  = ck('nf_PalletExch');
    fields['National Groupage']= ck('nf_Groupage');

    const clientId  = document.getElementById('lv_nclient')?.value;
    const pickupId  = document.getElementById('lv_npickup')?.value;
    const delivId   = document.getElementById('lv_ndelivery')?.value;

    if(clientId)  fields['Client']           = [clientId];
    if(pickupId)  fields['Pickup Location']  = [pickupId];
    if(delivId)   fields['Delivery Location']= [delivId];

    // Validation
    if(!fields['Direction'])          { alert('Direction is required'); throw new Error('v'); }
    if(!clientId)                     { alert('Client is required'); throw new Error('v'); }
    if(!pickupId)                     { alert('Pickup Location is required'); throw new Error('v'); }
    if(!delivId)                      { alert('Delivery Location is required'); throw new Error('v'); }
    if(!fields['Loading DateTime'])   { alert('Loading Date is required'); throw new Error('v'); }
    if(!fields['Delivery DateTime'])  { alert('Delivery Date is required'); throw new Error('v'); }

    let savedNatlId = recId;
    if(recId) {
      await atPatch(TABLES.NAT_ORDERS, recId, fields);
    } else {
      // Duplicate check: same client + same loading date
      if (clientId && fields['Loading DateTime']) {
        const dupFilter = `AND(FIND("${clientId}",ARRAYJOIN({Client},","))>0,IS_SAME({Loading DateTime},'${fields['Loading DateTime']}','day'))`;
        const dups = await atGetAll(TABLES.NAT_ORDERS, { filterByFormula: dupFilter, fields:['Name'], maxRecords:1 }, false).catch(()=>[]);
        if (dups.length) {
          if (!confirm('Υπάρχει ήδη order με ίδιο client + ημερομηνία. Δημιουργία duplicate;')) {
            throw new Error('v');
          }
        }
      }
      const created = await atCreate(TABLES.NAT_ORDERS, fields);
      savedNatlId = created.id;
    }

    // ── Sync GROUPAGE LINES ──────────────────────────────────
    // Sync GL: create/update if Groupage ON, delete unassigned if OFF
  if (savedNatlId && fields['National Groupage']) {
      try {
        await _syncGroupageLinesFromNO(savedNatlId, fields);
      } catch(e) { console.warn('GL sync error:', e); }
    } else if (savedNatlId && !fields['National Groupage']) {
      // National Groupage turned OFF → DELETE GL + CL + CL-linked NL
      try {
        const staleGL = await atGetAll(TABLES.GL_LINES, {
          filterByFormula: `FIND("${savedNatlId}",ARRAYJOIN({Linked National Order},","))>0`,
          fields: ['Status']
        }, false);
        // Delete CONS_LOADS linked to these GL lines
        for (const gl of staleGL) {
          try {
            const cls = await atGetAll(TABLES.CONS_LOADS, {
              filterByFormula: `FIND("${gl.id}",ARRAYJOIN({Groupage Lines},","))>0`,
              fields: ['Name']
            }, false);
            for (const cl of cls) {
              // Delete NL records from this CL
              try {
                const nlsFromCL = await atGetAll(TABLES.NAT_LOADS, {
                  filterByFormula: `{Source Record}="${cl.id}"`,
                  fields: ['Name']
                }, false);
                for (const nl of nlsFromCL) await atDelete(TABLES.NAT_LOADS, nl.id);
              } catch(e) { console.warn('NL-CL cleanup:', e); }
              await atDelete(TABLES.CONS_LOADS, cl.id);
            }
          } catch(e) { console.warn('CL cleanup:', e); }
        }
        // Delete GL lines
        for (const r of staleGL) {
          try { await atDelete(TABLES.GL_LINES, r.id); }
          catch(e) { console.warn('GL delete:', e); }
        }
        if (staleGL.length) console.log(`Deleted ${staleGL.length} GL + linked CL/NL`);
        invalidateCache(TABLES.GL_LINES);
        invalidateCache(TABLES.NAT_LOADS);
      } catch(e) { console.warn('GL cleanup error:', e); }
    }
    // ─────────────────────────────────────────────────────────

    // ── Sync NATIONAL LOADS ─────────────────────────────────
    try {
      if (!fields['National Groupage']) {
        // Non-groupage → create/update NL record
        const fullRec = await atGetOne(TABLES.NAT_ORDERS, savedNatlId);
        if (fullRec.fields) await _syncNationalLoad(savedNatlId, fullRec.fields, false);
      } else {
        // Groupage ON → remove NL (CL save will create its own NL)
        await _syncNationalLoad(savedNatlId, {}, true);
      }
    } catch(e) { console.warn('NL sync error:', e); }
    // ─────────────────────────────────────────────────────────

    // Sync Ramp Plan
    try {
      const natlData = await atGetOne(TABLES.NAT_ORDERS, savedNatlId);
      if (natlData.fields) await _syncRampPlan(savedNatlId, natlData.fields, TABLES.NAT_ORDERS);
    } catch(e) { console.error('Ramp sync error:', e); }

    invalidateCache(TABLES.NAT_ORDERS);
    document.getElementById('modal').style.maxWidth = '';
    closeModal();
    toast(recId ? 'Order updated ✓' : 'Order created ✓');
    await renderOrdersNatl();

  } catch(e) {
    if(e.message!=='v') alert('Error: '+e.message);
    if(btn) { btn.textContent=recId?'Save Changes':'Submit'; btn.disabled=false; }
  }
}

// ─── Inline toggle ───────────────────────────────
async function toggleNatlInvoiced(recId, current) {
  const newVal = !current;
  try {
    await atPatch(TABLES.NAT_ORDERS, recId, { 'Invoiced': newVal });
    const rec = NATL_ORDERS.data.find(r => r.id === recId);
    if(rec) rec.fields['Invoiced'] = newVal;
    _applyNatlFilters();
    toast(newVal ? 'Marked as Invoiced' : 'Invoice removed');
  } catch(e) { toast('Error: '+e.message, 'danger'); }
}

// ═══════════════════════════════════════════════
// _syncGroupageLinesFromNO
// For INDEPENDENT National Orders (no parent ORDERS)
// Creates/updates GL lines from NO Pickup Locations
// ═══════════════════════════════════════════════
async function _syncGroupageLinesFromNO(noId, noFields) {
  const _lid = v => (v&&typeof v==='object'&&v.id)?v.id:(typeof v==='string'?v:null);
  const dir  = noFields['Direction']||'';
  const ref  = noFields['Reference']||'';
  const goods= noFields['Goods']||'';
  const temp = noFields['Temperature °C']??null;
  const loadDt = (noFields['Loading DateTime']||'').slice(0,10)||null;
  const delDt  = (noFields['Delivery DateTime']||'').slice(0,10)||null;
  const noDir = dir === 'South→North' ? 'South→North' : 'North→South';

  // Get all pickup locations — support both old 'Pickup Location' and new '1-10' fields
  const pickupLocs = [];
  // New style: Pickup Location 1-10
  for (let i=1; i<=10; i++) {
    const arr = noFields[`Pickup Location ${i}`];
    if (!arr?.length) { if(i>1) break; continue; }
    pickupLocs.push(_lid(arr[0]));
  }
  // Old style: single 'Pickup Location' field
  if (!pickupLocs.length) {
    const arr = noFields['Pickup Location'];
    if (arr?.length) pickupLocs.push(_lid(arr[0]));
  }

  if (!pickupLocs.length) return;

  // Per-stop pallets from Loading Pallets 1-10 fields, fallback to total/count
  const totalPal = noFields['Pallets'] || 0;
  const palPerLoc = {};
  pickupLocs.forEach((locId, i) => {
    const p = noFields[`Loading Pallets ${i+1}`] || noFields['Loading Pallets'] || 0;
    palPerLoc[locId] = p || (pickupLocs.length > 0 ? Math.floor(totalPal / pickupLocs.length) : totalPal);
  });

  const delivArr = noFields['Delivery Location 1'] || noFields['Delivery Location'] || [];
  const delivId  = delivArr.length ? _lid(delivArr[0]) : null;

  // Get existing GL for this NO
  const existing = await atGetAll(TABLES.GL_LINES, {
    filterByFormula: `FIND("${noId}",ARRAYJOIN({Linked National Order},","))>0`,
    fields: ['Loading Location','Status','Pallets']
  }, false);

  const existMap = {};
  existing.forEach(r => {
    const loc = (r.fields['Loading Location']||[])[0];
    if (loc) existMap[loc] = r;
  });

  const toCreate = [];
  const toUpdate = [];

  pickupLocs.forEach((locId, i) => {
    if (!locId) return;
    const pal = palPerLoc[locId] || totalPal;
    const fields = {
      'Reference':             ref,
      'Pallets':               pal,
      'Direction':             noDir,
      'Status':                'Unassigned',
      'Goods':                 goods,
      'Loading Location':      [locId],
      'Linked National Order': [noId],
    };
    if (loadDt) fields['Loading Date']  = loadDt;
    if (delDt)  fields['Delivery Date'] = delDt;
    if (temp !== null) fields['Temperature C'] = temp;
    if (delivId) fields['Delivery Location'] = [delivId];

    if (existMap[locId]) {
      if (existMap[locId].fields.Status !== 'Assigned') {
        toUpdate.push({ id: existMap[locId].id, fields });
      }
      delete existMap[locId];
    } else {
      toCreate.push(fields);
    }
  });

  // Delete stale GL lines (locId no longer in NO)
  for (const [locId, rec] of Object.entries(existMap)) {
    if (rec.fields.Status !== 'Assigned') {
      try { await atDelete(TABLES.GL_LINES, rec.id); }
      catch(e) { console.warn('GL stale delete:', e); }
    }
  }

  // Batch create
  if (toCreate.length) {
    await atCreateBatch(TABLES.GL_LINES, toCreate.map(f => ({ fields: f })));
  }

  // Batch update
  if (toUpdate.length) {
    await atPatchBatch(TABLES.GL_LINES, toUpdate);
  }

  console.log(`_syncGroupageLinesFromNO: ${toCreate.length} created, ${toUpdate.length} updated for NO ${noId}`);
}

// ═══════════════════════════════════════════════
// _syncNationalLoad — Sync non-groupage NO → NATIONAL LOADS
// Creates/updates a unified record for Weekly National consumption
// ═══════════════════════════════════════════════
async function _syncNationalLoad(noId, noFields, isDelete) {
  if (!TABLES.NAT_LOADS) return;

  // Find existing NL record for this NO
  const existing = await atGetAll(TABLES.NAT_LOADS, {
    filterByFormula: `{Source Record}="${noId}"`,
    fields: ['Name']
  }, false);

  if (isDelete) {
    // Delete NL record(s) when NO is deleted or groupage turned ON
    for (const r of existing) {
      try { await atDelete(TABLES.NAT_LOADS, r.id); } catch(e) { console.warn('NL delete err:', e); }
    }
    console.log(`_syncNationalLoad: deleted ${existing.length} NL for NO ${noId}`);
    return;
  }

  // Build direction
  const dir = noFields['Direction'] || '';
  let nlDir = 'ΚΑΘΟΔΟΣ';
  if (dir === 'South→North') nlDir = 'ΑΝΟΔΟΣ';

  // Resolve client name
  let clientName = '';
  try {
    const cArr = noFields['Client'];
    const cId = Array.isArray(cArr) ? (cArr[0]?.id || cArr[0]) : null;
    if (cId) {
      const cRec = await atGetOne(TABLES.CLIENTS, cId);
      clientName = cRec.fields?.['Company Name'] || '';
    }
  } catch(e) { logError(e, 'orders_natl resolve client name'); }

  const _lid = v => {
    if (!v) return null;
    if (Array.isArray(v)) return v.length ? (v[0]?.id || v[0]) : null;
    return typeof v === 'object' ? v.id : v;
  };

  // Build NL fields
  const nlFields = {
    'Name': `${clientName || 'Order'} — ${toLocalDate(noFields['Loading DateTime'])}`,
    'Direction': nlDir,
    'Source Type': 'Direct',
    'Source Record': noId,
    'Source Orders': noId,
    'Client': clientName,
    'Goods': noFields['Goods'] || '',
    'Total Pallets': noFields['Pallets'] || 0,
    'Temperature C': noFields['Temperature °C'] ?? null,
    'Loading DateTime': noFields['Loading DateTime'] || null,
    'Delivery DateTime': noFields['Delivery DateTime'] || null,
    'Reference': noFields['Reference'] || '',
    'Status': 'Pending',
    'Pallet Exchange': !!noFields['Pallet Exchange'],
  };

  // Copy Pickup/Delivery Locations 1-10 (new-style), fallback to old-style
  let hasNewPickup = false, hasNewDeliv = false;
  for (let i = 1; i <= 10; i++) {
    const pId = _lid(noFields[`Pickup Location ${i}`]);
    const dId = _lid(noFields[`Delivery Location ${i}`]);
    if (pId) { nlFields[`Pickup Location ${i}`] = [pId]; hasNewPickup = true; }
    if (dId) { nlFields[`Delivery Location ${i}`] = [dId]; hasNewDeliv = true; }
  }
  // Fallback: old-style single Pickup/Delivery Location → Location 1
  if (!hasNewPickup) {
    const pId = _lid(noFields['Pickup Location']);
    if (pId) nlFields['Pickup Location 1'] = [pId];
  }
  if (!hasNewDeliv) {
    const dId = _lid(noFields['Delivery Location']);
    if (dId) nlFields['Delivery Location 1'] = [dId];
  }

  if (existing.length) {
    // Update existing
    await atPatch(TABLES.NAT_LOADS, existing[0].id, nlFields);
    console.log(`_syncNationalLoad: updated NL ${existing[0].id} for NO ${noId}`);
  } else {
    // Create new
    const created = await atCreate(TABLES.NAT_LOADS, nlFields);
    console.log(`_syncNationalLoad: created NL ${created.id} for NO ${noId}`);
  }
}

// ═══════════════════════════════════════════════
// deleteNatlOrder — Delete a National Order + cleanup NL/GL/CL/Ramp
// ═══════════════════════════════════════════════
async function deleteNatlOrder(recId) {
  if (!confirm('Delete this National Order? This will also remove linked loads and groupage lines.')) return;

  try {
    toast('Deleting order...', 'info');

    // 1. Delete NAT_LOADS (Direct) linked to this NO
    try {
      const nls = await atGetAll(TABLES.NAT_LOADS, {
        filterByFormula: `{Source Record}="${recId}"`,
        fields: ['Name']
      }, false);
      for (const nl of nls) {
        try { await atDelete(TABLES.NAT_LOADS, nl.id); } catch(e) { console.warn('NL delete:', e); }
      }
      if (nls.length) console.log(`Deleted ${nls.length} NAT_LOADS for NO ${recId}`);
    } catch(e) { console.warn('NL cleanup error:', e); }

    // 2. Delete GL lines + linked CL + CL-linked NL
    try {
      const gls = await atGetAll(TABLES.GL_LINES, {
        filterByFormula: `FIND("${recId}",ARRAYJOIN({Linked National Order},","))>0`,
        fields: ['Status']
      }, false);
      for (const gl of gls) {
        // Delete CONS_LOADS linked to this GL
        try {
          const cls = await atGetAll(TABLES.CONS_LOADS, {
            filterByFormula: `FIND("${gl.id}",ARRAYJOIN({Groupage Lines},","))>0`,
            fields: ['Name']
          }, false);
          for (const cl of cls) {
            // Delete NL records from this CL
            try {
              const nlsFromCL = await atGetAll(TABLES.NAT_LOADS, {
                filterByFormula: `{Source Record}="${cl.id}"`,
                fields: ['Name']
              }, false);
              for (const nl of nlsFromCL) await atDelete(TABLES.NAT_LOADS, nl.id);
            } catch(e) { console.warn('NL-CL cleanup:', e); }
            await atDelete(TABLES.CONS_LOADS, cl.id);
          }
        } catch(e) { console.warn('CL cleanup:', e); }
        try { await atDelete(TABLES.GL_LINES, gl.id); } catch(e) { console.warn('GL delete:', e); }
      }
      if (gls.length) console.log(`Deleted ${gls.length} GL + linked CL/NL for NO ${recId}`);
    } catch(e) { console.warn('GL cleanup error:', e); }

    // 3. Delete RAMP records linked to this NO
    try {
      const ramps = await atGetAll(TABLES.RAMP, {
        filterByFormula: `FIND("${recId}",ARRAYJOIN({Source Order},","))>0`,
        fields: ['Name']
      }, false);
      for (const r of ramps) {
        try { await atDelete(TABLES.RAMP, r.id); } catch(e) { console.warn('Ramp delete:', e); }
      }
    } catch(e) { console.warn('Ramp cleanup:', e); }

    // 4. Delete the NAT_ORDER itself
    await atDelete(TABLES.NAT_ORDERS, recId);

    // Invalidate caches
    invalidateCache(TABLES.NAT_ORDERS);
    invalidateCache(TABLES.NAT_LOADS);
    invalidateCache(TABLES.GL_LINES);
    invalidateCache(TABLES.CONS_LOADS);

    toast('Order deleted', 'success');
    await renderOrdersNatl();
  } catch(e) {
    toast('Delete failed: ' + e.message, 'danger');
  }
}

// Expose functions used from onclick/onchange handlers
window.renderOrdersNatl = renderOrdersNatl;
window.openNatlCreate = openNatlCreate;
window.openNatlEdit = openNatlEdit;
window.selectNatlOrder = selectNatlOrder;
window.toggleNatlInvoiced = toggleNatlInvoiced;
window._natlSortToggle = _natlSortToggle;
window._applyNatlFilters = _applyNatlFilters;
window.natlSearch = natlSearch;
window.natlFilter = natlFilter;
window.natlPeriodChange = natlPeriodChange;
window.submitNatlOrder = submitNatlOrder;
window.deleteNatlOrder = deleteNatlOrder;
// Natl-specific form dropdown helpers (self-contained, not shared with orders_intl)
window._natlClientDrop = _natlClientDrop;
window._natlLocDrop = _natlLocDrop;
window._natlShowDrop = _natlShowDrop;
window._natlPickLinked = _natlPickLinked;
// _onPage is mutated from onclick (++/--) so expose as getter/setter
Object.defineProperty(window, '_onPage', {
  get: function() { return _onPage; },
  set: function(v) { _onPage = v; },
  configurable: true
});
})();
