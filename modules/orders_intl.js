// ═══════════════════════════════════════════════
// MODULE — INTERNATIONAL ORDERS
// ═══════════════════════════════════════════════

const INTL_ORDERS = { data: [], filtered: [], selectedId: null };
const _intlFilters = {};
let _clientsMap   = {};
let _locationsMap = {};
let _locationsArr = [];

// ── Reference data ────────────────────────────────
async function _loadRefData() {
  if (_locationsArr.length) return; // already loaded
  // Locations: manageable size, load all upfront
  const locs = await atGet(TABLES.LOCATIONS);
  _locationsArr = locs
    .map(r => ({ id: r.id, label: [r.fields['Name'], r.fields['City'], r.fields['Country']].filter(Boolean).join(', ') }))
    .sort((a,b) => a.label.localeCompare(b.label));
  _locationsArr.forEach(l => { _locationsMap[l.id] = l.label; });
}

// Clients: 4700+ records — search via API on-demand, cache results
const _clientSearchCache = {};
async function _searchClients(q) {
  if (!q || q.length < 2) return [];
  const key = q.toLowerCase();
  if (_clientSearchCache[key]) return _clientSearchCache[key];
  const formula = `SEARCH(LOWER("${q.replace(/"/g,'')}"), LOWER({Company Name}))`;
  const records = await atGet(TABLES.CLIENTS, formula, false);
  const results = records
    .map(r => ({ id: r.id, label: r.fields['Company Name'] || '' }))
    .sort((a,b) => a.label.localeCompare(b.label))
    .slice(0, 30);
  _clientSearchCache[key] = results;
  // Also populate clientsMap for display
  results.forEach(c => { _clientsMap[c.id] = c.label; });
  return results;
}

// Load a single client by ID (for edit mode display)
async function _resolveClient(recId) {
  if (_clientsMap[recId]) return _clientsMap[recId];
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AT_BASE}/${TABLES.CLIENTS}/${recId}`,
      { headers: { 'Authorization': 'Bearer ' + AT_TOKEN } }
    );
    const d = await res.json();
    const name = d.fields?.['Company Name'] || recId.slice(-6);
    _clientsMap[recId] = name;
    return name;
  } catch(e) { return recId.slice(-6); }
}

function _clientName(f) {
  const id = Array.isArray(f['Client']) ? f['Client'][0] : null;
  return id ? (_clientsMap[id] || id.slice(-6)) : '—';
}
function _cleanSummary(s) {
  if (!s) return '—';
  return s.replace(/^["']+|["']+$/g,'').replace(/\/\s*$/,'').trim() || '—';
}
function _airtableWeekNum(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekStart = new Date(jan1);
  weekStart.setDate(jan1.getDate() - jan1.getDay());
  return Math.floor((d - weekStart) / 604800000) + 1;
}

// ── Main render ───────────────────────────────────
async function renderOrdersIntl() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading orders...');
  try {
    await _loadRefData();
    const records = await atGet(TABLES.ORDERS, '', false);
    records.sort((a,b) => (b.fields['Loading DateTime']||'').localeCompare(a.fields['Loading DateTime']||''));
    INTL_ORDERS.data = records;
    INTL_ORDERS.filtered = records;
    INTL_ORDERS.selectedId = null;
    Object.keys(_intlFilters).forEach(k => delete _intlFilters[k]);
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
      ${canEdit ? `<button class="btn btn-success" onclick="openIntlCreate()">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
        </svg> New Order</button>` : ''}
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
    if (w<1) continue;
    s += `<option value="${w}" ${w===wn?'selected':''}>${w===wn?'→ ':''} W${w}</option>`;
  }
  return s;
}

// ── Table ─────────────────────────────────────────
function _renderIntlTable(records) {
  const wrap = document.getElementById('intlTable');
  if (!records.length) { wrap.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-dim)">No orders match filters</div>`; return; }
  const rows = records.slice(0,300).map(r => {
    const f = r.fields;
    const hasTrip = (f['TRIPS (Export Order)']?.length||0)+(f['TRIPS (Import Order)']?.length||0) > 0;
    const dir = f['Direction']||'';
    const dirB = dir==='Export' ? '<span class="badge badge-blue">↑ Export</span>'
               : dir==='Import' ? '<span class="badge badge-green">↓ Import</span>'
               : `<span class="badge badge-grey">${dir||'—'}</span>`;
    const tripB = hasTrip ? '<span class="badge badge-green">Assigned</span>' : '<span class="badge badge-yellow">Pending</span>';
    const hr  = f['High Risk Flag'] ? '<span title="High Risk" style="color:var(--danger);margin-right:4px">⚠</span>' : '';
    const grp = f['National Groupage'] ? '<span class="badge badge-blue" title="Groupage" style="margin-right:4px">GRP</span>' : '';
    const sel = r.id === INTL_ORDERS.selectedId ? ' selected' : '';
    return `<tr onclick="selectIntlOrder('${r.id}')" id="irow_${r.id}" class="${sel}">
      <td style="white-space:nowrap">${hr}${grp}<strong style="color:var(--text);font-size:12px">${f['Order Number']||r.id.slice(-6)}</strong></td>
      <td>W${f['Week Number']||'—'}</td>
      <td>${dirB}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${_clientName(f)}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis">${_cleanSummary(f['Loading Summary'])}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis">${_cleanSummary(f['Delivery Summary'])}</td>
      <td>${f['Loading DateTime'] ? formatDateShort(f['Loading DateTime']) : '—'}</td>
      <td>${f['Delivery DateTime'] ? formatDateShort(f['Delivery DateTime']) : '—'}</td>
      <td>${f['Total Pallets']||f['Loading Pallets 1']||'—'}</td>
      <td>${tripB}</td>
      <td>${f['Invoiced']?'<span class="badge badge-grey">INV</span>':''}</td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<table><thead><tr>
    <th>Order No</th><th>Week</th><th>Direction</th><th>Client</th>
    <th>Loading</th><th>Delivery</th><th>Load Date</th><th>Del Date</th>
    <th>PAL</th><th>Trip</th><th></th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

// ── Filters ───────────────────────────────────────
function intlSearch(q) { _intlFilters._q = q.toLowerCase().trim(); _applyIntlFilters(); }
function intlFilter(k,v) { if(!v) delete _intlFilters[k]; else _intlFilters[k]=v; _applyIntlFilters(); }

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
  if (_intlFilters['_trip']==='unassigned') recs = recs.filter(r => !r.fields['TRIPS (Export Order)']?.length && !r.fields['TRIPS (Import Order)']?.length);
  if (_intlFilters['_trip']==='assigned')   recs = recs.filter(r => r.fields['TRIPS (Export Order)']?.length>0 || r.fields['TRIPS (Import Order)']?.length>0);
  INTL_ORDERS.filtered = recs;
  _renderIntlTable(recs);
  const n = recs.length + ' orders';
  document.getElementById('intlCount').textContent = n;
  document.getElementById('intlSub').textContent   = n;
}

// ── Detail Panel ──────────────────────────────────
function selectIntlOrder(recId) {
  INTL_ORDERS.selectedId = recId;
  document.querySelectorAll('#intlTable tbody tr').forEach(tr => tr.classList.remove('selected'));
  const row = document.getElementById('irow_'+recId);
  if (row) row.classList.add('selected');
  const rec = INTL_ORDERS.data.find(r => r.id === recId);
  if (!rec) return;
  const panel = document.getElementById('intlDetail');
  panel.classList.remove('hidden');
  const f = rec.fields;
  const canEdit = can('orders') === 'full';
  const hasTrip = (f['TRIPS (Export Order)']?.length||0)+(f['TRIPS (Import Order)']?.length||0) > 0;
  const stMap = {Pending:'badge-yellow',Assigned:'badge-blue',Active:'badge-green',Delivered:'badge-grey',Cancelled:'badge-red'};

  const buildStopLines = (locPrefix, palPrefix, dtPrefix, dtField1) => {
    let html = '';
    for (let i=1;i<=10;i++) {
      const locKey = i===1 ? `${locPrefix} Location 1` : `${locPrefix} Location ${i}`;
      const locArr = f[locKey];
      const locId  = Array.isArray(locArr) ? locArr[0] : null;
      if (!locId) break;
      const name   = _locationsMap[locId] || locId.slice(-6);
      const pal    = f[`${palPrefix} Pallets ${i}`] || '';
      const dt     = i===1 ? f[dtField1] : f[`${dtPrefix} DateTime ${i}`];
      const dtStr  = dt ? formatDateShort(dt) : '';
      html += _dF(`Stop ${i}`, `${name}${pal?' — '+pal+' pal':''}${dtStr?' · '+dtStr:''}`);
    }
    return html || _dF('Location', _cleanSummary(f['Loading Summary']||f['Delivery Summary']));
  };

  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="detail-title" style="font-size:13px">
          ${f['High Risk Flag']?'<span style="color:var(--danger);margin-right:4px">⚠</span>':''}
          ${f['Order Number']||recId.slice(-6)}
        </div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px">
          ${f['Brand']||''} · ${f['Direction']||''} · W${f['Week Number']||'—'}
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
        <span class="badge ${stMap[f['Status']]||'badge-grey'}">${f['Status']||'No Status'}</span>
        ${hasTrip?'<span class="badge badge-green">Trip Assigned</span>':'<span class="badge badge-yellow">No Trip</span>'}
        ${f['Invoiced']?'<span class="badge badge-grey">Invoiced</span>':''}
        ${f['High Risk Flag']?'<span class="badge badge-red">⚠ High Risk</span>':''}
        ${f['Veroia Switch ']?'<span class="badge badge-yellow">Veroia Switch</span>':''}
        ${f['National Groupage']?'<span class="badge badge-blue">Groupage</span>':''}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Order</div>
        ${_dF('Client',       _clientName(f))}
        ${_dF('Goods',        f['Goods']||'—')}
        ${_dF('Temperature',  f['Temperature °C']!=null ? f['Temperature °C']+' °C' : '—')}
        ${_dF('Reefer Mode',  f['Refrigerator Mode']||'—')}
        ${_dF('Pallet Type',  f['Pallet Type']||'—')}
        ${_dF('Total Pallets',f['Total Pallets']||'—')}
        ${_dF('Gross Weight', f['Gross Weight kg'] ? f['Gross Weight kg']+' kg' : '—')}
        ${_dF('Pallet Exch.', f['Pallet Exchange']?'✓ Yes':'No')}
        ${_dF('Carrier',      f['Carrier Type']||'—')}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Loading</div>
        ${buildStopLines('Loading','Loading','Loading','Loading DateTime')}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Delivery</div>
        ${buildStopLines('Unloading','Unloading','Unloading','Delivery DateTime')}
      </div>
      ${can('costs')!=='none'?`
      <div class="detail-section">
        <div class="detail-section-title">Financial</div>
        ${_dF('Price',         f['Price']     ? '€ '+Number(f['Price']).toLocaleString('el-GR')     : '—')}
        ${_dF('Net Price',     f['Net Price'] ? '€ '+Number(f['Net Price']).toLocaleString('el-GR') : '—')}
        ${_dF('Invoice Status',f['Invoice Status']||'—')}
      </div>`:''}
      <div class="detail-section">
        <div class="detail-section-title">Checklist</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
          ${_chk('Docs Ready',      f['Docs Ready'])}
          ${_chk('Temp Check',      f['Temp Check'])}
          ${_chk('Pallet Sheet',    f['Pallet Sheet 1 Uploaded'])}
          ${_chk('SMS to Driver',   f['SMS to Driver'])}
          ${_chk('Money Confirmed', f['Money Confirmed'])}
          ${_chk('Client Updated',  f['Client Updated'])}
          ${_chk('Done',            f['DONE'])}
          ${_chk('Invoiced',        f['Invoiced'])}
        </div>
      </div>
      ${f['Notes']?`<div class="detail-section"><div class="detail-section-title">Notes</div>
        <div style="font-size:12.5px;color:var(--text-mid);line-height:1.5">${f['Notes']}</div></div>`:''}
    </div>`;
}

function _dF(l,v){return `<div class="detail-field"><span class="detail-field-label">${l}</span><span class="detail-field-value">${v}</span></div>`;}
function _chk(l,v){return `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:${v?'var(--success)':'var(--text-dim)'}">${v?'✅':'⬜'} ${l}</div>`;}

// ── Linked select widget ──────────────────────────
function _makeLinkedSelect(id, currentId, placeholder) {
  const current = currentId ? (_locationsMap[currentId]||currentId.slice(-6)) : '';
  return `<div style="position:relative">
    <input class="form-input" id="${id}_s" autocomplete="off"
      value="${current}" placeholder="${placeholder}"
      oninput="_filterLinkedOpts('${id}',this.value,'loc')"
      onfocus="_filterLinkedOpts('${id}',this.value,'loc')"
      onblur="_hideDropdown('${id}')">
    <input type="hidden" id="${id}_v" value="${currentId||''}">
    <div id="${id}_d" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:300;
      background:var(--bg);border:1px solid var(--border-dark);border-radius:6px;
      max-height:180px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,0.15)"></div>
  </div>`;
}

function _makeClientSelect(id, currentId, currentLabel) {
  const display = currentLabel || (currentId ? (_clientsMap[currentId]||'') : '');
  return `<div style="position:relative">
    <input class="form-input" id="${id}_s" autocomplete="off"
      value="${display}" placeholder="Type to search clients..."
      oninput="_clientSearchDebounced('${id}',this.value)"
      onblur="_hideDropdown('${id}')">
    <input type="hidden" id="${id}_v" value="${currentId||''}">
    <div id="${id}_d" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:300;
      background:var(--bg);border:1px solid var(--border-dark);border-radius:6px;
      max-height:180px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,0.15)"></div>
  </div>`;
}

let _clientSearchTimer = null;
function _clientSearchDebounced(id, q) {
  clearTimeout(_clientSearchTimer);
  const drop = document.getElementById(id+'_d');
  if (q.length < 2) { if(drop) drop.style.display='none'; return; }
  if (drop) { drop.style.display='block'; drop.innerHTML='<div style="padding:10px 12px;font-size:12px;color:var(--text-dim)">Searching...</div>'; }
  _clientSearchTimer = setTimeout(async () => {
    const results = await _searchClients(q);
    if (!drop) return;
    if (!results.length) { drop.innerHTML='<div style="padding:10px 12px;font-size:12px;color:var(--text-dim)">No results</div>'; return; }
    drop.style.display = 'block';
    drop.innerHTML = results.map(o =>
      `<div onmousedown="_pickLinked('${id}','${o.id}','${o.label.replace(/'/g,"\'")}',this)"
        style="padding:8px 12px;font-size:12.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
        onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">${o.label}</div>`
    ).join('');
  }, 300);
}

function _hideDropdown(id) {
  setTimeout(() => { const d=document.getElementById(id+'_d'); if(d) d.style.display='none'; }, 200);
}

function _filterLinkedOpts(id, q, type) {
  const pool = _locationsArr; // locations only
  const filtered = q.trim()
    ? pool.filter(o=>o.label.toLowerCase().includes(q.toLowerCase())).slice(0,25)
    : pool.slice(0,25);
  const drop = document.getElementById(id+'_d');
  if (!drop) return;
  if (!filtered.length) { drop.style.display='none'; return; }
  drop.style.display='block';
  drop.innerHTML = filtered.map(o =>
    `<div onmousedown="_pickLinked('${id}','${o.id}','${o.label.replace(/'/g,"\\'")}',this)"
      style="padding:8px 12px;font-size:12.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
      onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">${o.label}</div>`
  ).join('');
}

function _pickLinked(id, recId, label) {
  const s=document.getElementById(id+'_s'); if(s) s.value=label;
  const v=document.getElementById(id+'_v'); if(v) v.value=recId;
  const d=document.getElementById(id+'_d'); if(d) d.style.display='none';
}

// ── Build one stop row ────────────────────────────
function _stopRowHTML(type, i, locId, palVal, dtVal) {
  // type: 'l' (loading) or 'u' (unloading)
  const label = type==='l' ? 'Loading' : 'Unloading';
  const req   = i===1 ? ' *' : '';
  // For stop 1: DateTime field = Loading DateTime / Delivery DateTime (existing)
  // For stop 2-10: Loading DateTime 2-10 / Unloading DateTime 1-10
  return `<div class="intl-stop-row" id="stop_${type}_${i}" style="display:grid;grid-template-columns:1fr 160px 120px;gap:8px;align-items:end;margin-bottom:10px">
    <div>
      <label class="form-label" style="font-size:11px">${label} Location ${i}${req}</label>
      ${_makeLinkedSelect(`io_${type}loc_${i}`, locId, 'Search location...')}
    </div>
    <div>
      <label class="form-label" style="font-size:11px">Pallets${req}</label>
      <input class="form-input" type="number" id="io_${type}pal_${i}"
        value="${palVal||''}" placeholder="0" min="0">
    </div>
    <div>
      <label class="form-label" style="font-size:11px">Date${req}</label>
      <input class="form-input" type="date" id="io_${type}dt_${i}"
        value="${dtVal||''}">
    </div>
  </div>`;
}

// ── Modal ─────────────────────────────────────────
function openIntlCreate() { _buildIntlModal(null,{}); }
function openIntlEdit(recId) {
  const rec = INTL_ORDERS.data.find(r=>r.id===recId);
  if(rec) _buildIntlModal(recId, rec.fields);
}

function _buildIntlModal(recId, f) {
  const isEdit = !!recId;
  const opt = (arr, cur) => arr.map(o=>`<option value="${o}" ${f[cur]===o?'selected':''}>${o}</option>`).join('');

  const clientId = Array.isArray(f['Client']) ? f['Client'][0] : '';
  // Pre-resolve client name for edit mode
  if (clientId && !_clientsMap[clientId]) { _resolveClient(clientId); }
  const clientLabel = clientId ? (_clientsMap[clientId] || '') : '';

  // Count existing loading stops
  let initL=1, initU=1;
  for(let i=2;i<=10;i++) { if(Array.isArray(f[`Loading Location ${i}`])&&f[`Loading Location ${i}`][0]) initL=i; }
  for(let i=2;i<=10;i++) { if(Array.isArray(f[`Unloading Location ${i}`])&&f[`Unloading Location ${i}`][0]) initU=i; }
  window._stopCntL = initL;
  window._stopCntU = initU;

  // Build initial stop rows
  const buildStops = (type) => {
    const isL = type==='l';
    const cnt  = isL ? initL : initU;
    let html = '';
    for(let i=1;i<=cnt;i++){
      const locKey = `${isL?'Loading':'Unloading'} Location ${i}`;
      const palKey = `${isL?'Loading':'Unloading'} Pallets ${i}`;
      // DateTime: stop 1 → Loading DateTime / Delivery DateTime; stop 2+ → Loading DateTime i / Unloading DateTime i
      const dtKey  = i===1
        ? (isL ? 'Loading DateTime' : 'Delivery DateTime')
        : `${isL?'Loading':'Unloading'} DateTime ${i}`;
      const locId  = Array.isArray(f[locKey]) ? f[locKey][0] : '';
      html += _stopRowHTML(type, i, locId, f[palKey], f[dtKey]?.split('T')[0]);
    }
    return html;
  };

  const body = `
    <div class="form-grid">
      <div class="form-field span-2">
        <label class="form-label">Brand</label>
        <select class="form-select" id="io_Brand"><option value="">— Select —</option>
          ${opt(['Petras Group','DPS'],'Brand')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Type *</label>
        <select class="form-select" id="io_Type"><option value="">— Select —</option>
          ${opt(['International','National'],'Type')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Direction *</label>
        <select class="form-select" id="io_Direction"><option value="">— Select —</option>
          ${opt(['Export','Import'],'Direction')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Client *</label>
        ${_makeClientSelect('io_client', clientId, clientLabel)}
      </div>
      <div class="form-field">
        <label class="form-label">Price *</label>
        <input class="form-input" type="number" id="io_Price" value="${f['Price']||''}" placeholder="0.00">
      </div>
      <div class="form-field">
        <label class="form-label">Goods</label>
        <input class="form-input" type="text" id="io_Goods" value="${f['Goods']||''}" placeholder="e.g. Fresh Produce">
      </div>
      <div class="form-field">
        <label class="form-label">Gross Weight kg</label>
        <input class="form-input" type="number" id="io_Gross_Weight_kg" value="${f['Gross Weight kg']||''}">
      </div>
      <div class="form-field">
        <label class="form-label">Temperature °C *</label>
        <input class="form-input" type="number" id="io_Temperature" value="${f['Temperature °C']!=null?f['Temperature °C']:''}">
      </div>
      <div class="form-field">
        <label class="form-label">Refrigerator Mode *</label>
        <select class="form-select" id="io_Refrigerator_Mode"><option value="">— Select —</option>
          ${opt(['Continuous','Start-Stop','No temp'],'Refrigerator Mode')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Pallet Type *</label>
        <select class="form-select" id="io_Pallet_Type"><option value="">— Select —</option>
          ${opt(['EUR','CHEP','Industrial','Euro'],'Pallet Type')}</select>
      </div>
      <div class="form-field" style="padding-top:22px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="io_Pallet_Exchange" ${f['Pallet Exchange']?'checked':''} style="width:15px;height:15px">
          Pallet Exchange</label>
      </div>
    </div>

    <div style="display:flex;gap:24px;margin:14px 0 20px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="io_High_Risk_Flag" ${f['High Risk Flag']?'checked':''} style="width:15px;height:15px">
        High Risk Flag</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="io_Veroia_Switch" ${f['Veroia Switch ']?'checked':''} style="width:15px;height:15px">
        Veroia Switch</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="io_National_Groupage" ${f['National Groupage']?'checked':''} style="width:15px;height:15px">
        National Groupage</label>
    </div>

    <!-- LOADING -->
    <div style="padding-top:16px;border-top:1px solid var(--border);margin-bottom:4px">
      <div class="detail-section-title" style="margin-bottom:12px">Loading</div>
      <div id="intl_stops_l">${buildStops('l')}</div>
      <button type="button" class="btn btn-ghost" id="btn_add_l"
        style="font-size:12px;padding:5px 14px;margin-top:4px"
        onclick="_addStop('l')" ${initL>=10?'style="display:none"':''}>
        + Add Loading Stop
      </button>
    </div>

    <!-- DELIVERY -->
    <div style="padding-top:16px;border-top:1px solid var(--border);margin:16px 0 4px">
      <div class="detail-section-title" style="margin-bottom:12px">Delivery</div>
      <div id="intl_stops_u">${buildStops('u')}</div>
      <button type="button" class="btn btn-ghost" id="btn_add_u"
        style="font-size:12px;padding:5px 14px;margin-top:4px"
        onclick="_addStop('u')" ${initU>=10?'style="display:none"':''}>
        + Add Delivery Stop
      </button>
    </div>`;

  const footer = `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-success" onclick="saveIntlOrder('${recId||''}')">
      ${isEdit?'Save Changes':'Submit'}
    </button>`;

  document.getElementById('modal').style.maxWidth = '760px';
  openModal(isEdit ? 'Edit Order' : 'New Order', body, footer);
}

function _addStop(type) {
  const cntKey = type==='l' ? '_stopCntL' : '_stopCntU';
  const current = window[cntKey] || 1;
  if (current >= 10) return;
  const next = current + 1;
  window[cntKey] = next;
  const container = document.getElementById(`intl_stops_${type}`);
  const div = document.createElement('div');
  div.innerHTML = _stopRowHTML(type, next, '', '', '');
  container.appendChild(div.firstElementChild);
  if (next >= 10) document.getElementById(`btn_add_${type}`).style.display = 'none';
}

// ── Save ──────────────────────────────────────────
async function saveIntlOrder(recId) {
  const fields = {};

  const strF = {io_Brand:'Brand',io_Type:'Type',io_Direction:'Direction',
    io_Goods:'Goods',io_Pallet_Type:'Pallet Type',io_Refrigerator_Mode:'Refrigerator Mode'};
  for(const[id,f] of Object.entries(strF)){
    const el=document.getElementById(id); if(el?.value?.trim()) fields[f]=el.value.trim();
  }
  const numF = {io_Price:'Price',io_Temperature:'Temperature °C',io_Gross_Weight_kg:'Gross Weight kg'};
  for(const[id,f] of Object.entries(numF)){
    const el=document.getElementById(id);
    if(el?.value!==''&&el?.value!==undefined) fields[f]=parseFloat(el.value);
  }
  const chkF = {io_Pallet_Exchange:'Pallet Exchange',io_High_Risk_Flag:'High Risk Flag',
    io_Veroia_Switch:'Veroia Switch ',io_National_Groupage:'National Groupage'};
  for(const[id,f] of Object.entries(chkF)){
    const el=document.getElementById(id); if(el) fields[f]=el.checked;
  }

  // Client
  const clientVal = document.getElementById('io_client_v')?.value;
  if (clientVal) fields['Client'] = [clientVal];

  // Loading stops 1-10
  for(let i=1;i<=10;i++){
    const locEl = document.getElementById(`io_lloc_${i}_v`);
    const palEl = document.getElementById(`io_lpal_${i}`);
    const dtEl  = document.getElementById(`io_ldt_${i}`);
    if (!locEl && !palEl) break;
    if (locEl?.value) fields[`Loading Location ${i}`] = [locEl.value];
    if (palEl?.value!=='') fields[`Loading Pallets ${i}`] = parseFloat(palEl.value)||0;
    // DateTime: stop 1 → Loading DateTime; stop 2+ → Loading DateTime i
    const dtField = i===1 ? 'Loading DateTime' : `Loading DateTime ${i}`;
    if (dtEl?.value) fields[dtField] = dtEl.value;
  }

  // Delivery DateTime for Week Number (use stop 1 delivery date)
  const del1dt = document.getElementById('io_udt_1')?.value;
  if (del1dt) {
    fields['Delivery DateTime'] = del1dt;
    fields['Week Number'] = _airtableWeekNum(del1dt);
  }

  // Unloading stops 1-10
  for(let i=1;i<=10;i++){
    const locEl = document.getElementById(`io_uloc_${i}_v`);
    const palEl = document.getElementById(`io_upal_${i}`);
    const dtEl  = document.getElementById(`io_udt_${i}`);
    if (!locEl && !palEl) break;
    if (locEl?.value) fields[`Unloading Location ${i}`] = [locEl.value];
    if (palEl?.value!=='') fields[`Unloading Pallets ${i}`] = parseFloat(palEl.value)||0;
    // DateTime: stop 1 → handled above as Delivery DateTime; stop 2+ → Unloading DateTime i
    if (i > 1 && dtEl?.value) fields[`Unloading DateTime ${i}`] = dtEl.value;
    if (i === 1 && dtEl?.value) fields[`Unloading DateTime 1`] = dtEl.value;
  }

  // Validation
  if (!fields['Direction'])            { alert('Direction is required'); return; }
  if (!fields['Client'])               { alert('Client is required'); return; }
  if (!fields['Loading Location 1'])   { alert('Loading Location 1 is required'); return; }
  if (!fields['Unloading Location 1']) { alert('Delivery Location 1 is required'); return; }
  if (!fields['Loading DateTime'])     { alert('Loading Date (Stop 1) is required'); return; }
  if (!fields['Delivery DateTime'])    { alert('Delivery Date (Stop 1) is required'); return; }

  const btn = event.target; btn.textContent='Saving...'; btn.disabled=true;
  try {
    if(recId) await atPatch(TABLES.ORDERS, recId, fields);
    else      await atCreate(TABLES.ORDERS, fields);
    invalidateCache(TABLES.ORDERS);
    document.getElementById('modal').style.maxWidth = '';
    closeModal();
    toast(recId?'Order updated':'Order created');
    await renderOrdersIntl();
  } catch(e){ btn.textContent='Save'; btn.disabled=false; alert('Error: '+e.message); }
}
