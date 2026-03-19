// ═══════════════════════════════════════════════
// MODULE — INTERNATIONAL ORDERS  v4
// ═══════════════════════════════════════════════

const INTL_ORDERS = { data: [], filtered: [], selectedId: null };
const _intlFilters = {};
let _locationsMap = {};   // recId → label
let _locationsArr = [];   // [{id,label}]
const _clientsMap  = {};  // recId → name (populated on search)
const _clientCache = {};  // query → [{id,label}]

// ─── Ref data ──────────────────────────────────
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

async function _resolveClientName(recId) {
  if (!recId) return '';
  if (_clientsMap[recId]) return _clientsMap[recId];
  try {
    const res = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${TABLES.CLIENTS}/${recId}`,
      { headers: { 'Authorization': 'Bearer ' + AT_TOKEN } });
    const d = await res.json();
    const name = d.fields?.['Company Name'] || '';
    _clientsMap[recId] = name;
    return name;
  } catch(e) { return ''; }
}

function _clientName(f) {
  const id = Array.isArray(f['Client']) ? f['Client'][0] : null;
  return id ? (_clientsMap[id] || id.slice(-6)) : '—';
}
function _cleanSummary(s) {
  if (!s) return '—';
  return s.replace(/^["']+|["']+$/g,'').replace(/\/\s*$/,'').trim() || '—';
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
    await _loadLocations();
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
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost" style="display:flex;align-items:center;gap:6px" onclick="openIntlScan()">
          <span>📄</span> Scan Order
        </button>
        ${canEdit ? `<button class="btn btn-success" onclick="openIntlCreate()">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
        </svg> New Order</button>` : ''}
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

// ─── Table ──────────────────────────────────────
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
    const hr  = f['High Risk Flag'] ? '<span title="⚠" style="color:var(--danger);margin-right:4px">⚠</span>' : '';
    const grp = f['National Groupage'] ? '<span class="badge badge-blue" style="margin-right:4px;font-size:10px">GRP</span>' : '';
    const sel = r.id === INTL_ORDERS.selectedId ? ' selected' : '';
    return `<tr onclick="selectIntlOrder('${r.id}')" id="irow_${r.id}" class="${sel}">
      <td style="white-space:nowrap">${hr}${grp}<strong style="color:var(--text);font-size:12px">${f['Order Number']||r.id.slice(-6)}</strong></td>
      <td>W${f['Week Number']||'—'}</td>
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
  }).join('');
  wrap.innerHTML = `<table><thead><tr>
    <th>Order No</th><th>Week</th><th>Dir</th><th>Client</th>
    <th>Loading</th><th>Delivery</th><th>Load Date</th><th>Del Date</th>
    <th>PAL</th><th>Trip</th><th>INV</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

// ─── Filters ────────────────────────────────────
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
      const name  = _locationsMap[locId] || locId.slice(-6);
      const pal   = f[`${palPfx} Pallets ${i}`];
      const dtRaw = i===1 ? f[dt1field] : f[`${dtPfx} DateTime ${i}`];
      const dtStr = dtRaw ? formatDateShort(dtRaw) : '';
      html += _dF(`Stop ${i}`, `${name}${pal?' — '+pal+' pal':''}${dtStr?' · '+dtStr:''}`);
    }
    return html || _dF('Location', '—');
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
        ${_dF('Temperature',  f['Temperature °C']!=null?f['Temperature °C']+' °C':'—')}
        ${_dF('Reefer Mode',  f['Refrigerator Mode']||'—')}
        ${_dF('Pallet Type',  f['Pallet Type']||'—')}
        ${_dF('Total Pallets',f['Total Pallets']||'—')}
        ${_dF('Gross Weight', f['Gross Weight kg']?f['Gross Weight kg']+' kg':'—')}
        ${_dF('Pallet Exch.', f['Pallet Exchange']?'✓ Yes':'No')}
        ${_dF('Carrier',      f['Carrier Type']||'—')}
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

function _dF(l,v) { return `<div class="detail-field"><span class="detail-field-label">${l}</span><span class="detail-field-value">${v}</span></div>`; }
function _chk(l,v) { return `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:${v?'var(--success)':'var(--text-dim)'}">${v?'✅':'⬜'} ${l}</div>`; }

// ─── Linked select widgets ───────────────────────
function _locSelect(id, currentId) {
  const label = currentId ? (_locationsMap[currentId]||'') : '';
  return `<div style="position:relative">
    <input class="form-input" id="ls_${id}" autocomplete="off" value="${label}"
      placeholder="Search location..."
      oninput="_locDrop('${id}',this.value)"
      onfocus="_locDrop('${id}',this.value)"
      onblur="_hideDrop('ls_${id}_d')">
    <input type="hidden" id="lv_${id}" value="${currentId||''}">
    <div id="ls_${id}_d" class="linked-drop" style="display:none"></div>
  </div>`;
}

function _clientSelect(id, currentId, currentLabel) {
  return `<div style="position:relative">
    <input class="form-input" id="ls_${id}" autocomplete="off" value="${currentLabel||''}"
      placeholder="Type 2+ chars to search..."
      oninput="_clientDrop('${id}',this.value)"
      onblur="_hideDrop('ls_${id}_d')">
    <input type="hidden" id="lv_${id}" value="${currentId||''}">
    <div id="ls_${id}_d" class="linked-drop" style="display:none"></div>
  </div>`;
}

function _hideDrop(dropId) {
  setTimeout(() => { const d=document.getElementById(dropId); if(d) d.style.display='none'; }, 200);
}

function _locDrop(id, q) {
  const pool = q.trim()
    ? _locationsArr.filter(o=>o.label.toLowerCase().includes(q.toLowerCase())).slice(0,25)
    : _locationsArr.slice(0,25);
  _showDrop('ls_'+id+'_d', id, pool);
}

let _clientTimer = null;
function _clientDrop(id, q) {
  clearTimeout(_clientTimer);
  const d = document.getElementById('ls_'+id+'_d');
  if (q.length < 2) { if(d) d.style.display='none'; return; }
  if (d) { d.style.display='block'; d.innerHTML='<div style="padding:10px 12px;font-size:12px;color:var(--text-dim)">Searching...</div>'; }
  _clientTimer = setTimeout(async () => {
    const results = await _searchClients(q);
    _showDrop('ls_'+id+'_d', id, results);
  }, 300);
}

function _showDrop(dropId, id, items) {
  const d = document.getElementById(dropId); if(!d) return;
  if (!items.length) { d.style.display='none'; return; }
  d.style.display = 'block';
  d.innerHTML = items.map(o =>
    `<div onmousedown="_pickLinked('${id}','${o.id}','${o.label.replace(/'/g,"\\'")}')"
      class="linked-drop-item">${o.label}</div>`
  ).join('');
}

function _pickLinked(id, recId, label) {
  const s = document.getElementById('ls_'+id); if(s) s.value = label;
  const v = document.getElementById('lv_'+id); if(v) v.value = recId;
  const d = document.getElementById('ls_'+id+'_d'); if(d) d.style.display='none';
}

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
    return raw ? raw.split('T')[0] : '';
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
        <label class="form-label">Goods</label>
        <input class="form-input" type="text" id="f_Goods" value="${f['Goods']||''}" placeholder="e.g. Fresh Produce">
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

    // Week number from first delivery date
    if (del1dt) fields['Week Number'] = _weekNum(del1dt);

    // Validate required
    if (!fields['Direction'])            { alert('Direction is required'); throw new Error('validation'); }
    if (!clientId)                       { alert('Client is required'); throw new Error('validation'); }
    if (!fields['Loading Location 1'])   { alert('Loading Location 1 is required'); throw new Error('validation'); }
    if (!fields['Unloading Location 1']) { alert('Delivery Location 1 is required'); throw new Error('validation'); }
    if (!fields['Loading DateTime'])     { alert('Loading Date (Stop 1) is required'); throw new Error('validation'); }
    if (!fields['Delivery DateTime'])    { alert('Delivery Date (Stop 1) is required'); throw new Error('validation'); }

    const result = recId
      ? await atPatch(TABLES.ORDERS, recId, fields)
      : await atCreate(TABLES.ORDERS, fields);

    if (result?.error) throw new Error(result.error.message || JSON.stringify(result.error));

    invalidateCache(TABLES.ORDERS);
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
  try {
    await atPatch(TABLES.ORDERS, recId, { 'Invoiced': newVal });
    // Update local data
    const rec = INTL_ORDERS.data.find(r => r.id === recId);
    if (rec) rec.fields['Invoiced'] = newVal;
    // Re-render table only (no full reload)
    _applyIntlFilters();
    toast(newVal ? 'Marked as Invoiced' : 'Invoice removed');
  } catch(e) { toast('Error: ' + e.message, 'danger'); }
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
    <div style="font-size:13px;font-weight:500;color:var(--success)">${file.name}</div>
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
    return _locationsArr.find(l=>nm && l.label.toLowerCase().includes(nm))
        || _locationsArr.find(l=>nm && l.label.toLowerCase().includes(nm.split(/[\s-]+/)[0]))
        || _locationsArr.find(l=>cg && l.label.toLowerCase().includes(cg))
        || _locationsArr.find(l=>ct && l.label.toLowerCase().includes(ct));
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
      ${row('Client',   clientLabel||data.client_name, !!clientId)}
      ${loadStops.map((s,i)=>row('Loading '+(loadStops.length>1?i+1:''), s._locLabel||s.city+(s.country?', '+s.country:''), !!s._locId)).join('')}
      ${delStops.map((s,i)=>row('Delivery '+(delStops.length>1?i+1:''), s._locLabel||s.city+(s.country?', '+s.country:''), !!s._locId)).join('')}
      ${row('Load Date',  data.loading_date,  true)}
      ${row('Del Date',   data.delivery_date,  true)}
      ${row('Goods',      data.goods,          true)}
      ${row('Weight',     data.gross_weight_kg?data.gross_weight_kg+' kg':null, true)}
      ${row('Pallets',    data.pallets?String(data.pallets):null, true)}
      ${row('Temp',       data.temperature_c!=null?data.temperature_c+' °C':null, true)}
      ${row('Direction',  data.direction, true)}
      ${data.notes?`<div style="margin-top:8px;font-size:11px;color:var(--text-dim);font-style:italic">ℹ ${data.notes}</div>`:''}
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
  [...ls2,...ds2].forEach(s=>{ if(s._locId && s._locLabel) _locationsMap[s._locId]=s._locLabel; });
  if (matched.clientId && matched.clientLabel) _clientsMap[matched.clientId] = matched.clientLabel;
  closeModal();
  await _openModal(null, f, matched.clientLabel);
}
