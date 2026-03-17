// ═══════════════════════════════════════════════
// MODULE — INTERNATIONAL ORDERS
// ═══════════════════════════════════════════════

const INTL_ORDERS = { data: [], filtered: [], selectedId: null };
const _intlFilters = {};
let _clientsMap  = {}; // recId → name
let _locationsMap = {}; // recId → label
let _locationsArr = []; // [{id, label}] for dropdown

// ── Reference data loaders ────────────────────────
async function _loadRefData() {
  if (Object.keys(_clientsMap).length && _locationsArr.length) return;
  const [clients, locs] = await Promise.all([
    atGet(TABLES.CLIENTS),
    atGet(TABLES.LOCATIONS),
  ]);
  clients.forEach(r => {
    _clientsMap[r.id] = r.fields['Company Name'] || r.id.slice(-6);
  });
  _locationsArr = locs.map(r => ({
    id: r.id,
    label: [r.fields['Name'], r.fields['City'], r.fields['Country']].filter(Boolean).join(', '),
  })).sort((a,b) => a.label.localeCompare(b.label));
  _locationsArr.forEach(l => { _locationsMap[l.id] = l.label; });
}

function _clientName(f) {
  const id = Array.isArray(f['Client']) ? f['Client'][0] : null;
  return id ? (_clientsMap[id] || id.slice(-6)) : '—';
}
function _cleanSummary(s) {
  if (!s) return '—';
  return s.replace(/^["']+|["']+$/g,'').replace(/\/\s*$/,'').trim() || '—';
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

// ── Table renderer ────────────────────────────────
function _renderIntlTable(records) {
  const wrap = document.getElementById('intlTable');
  if (!records.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-dim)">No orders match filters</div>`;
    return;
  }
  const rows = records.slice(0,300).map(r => {
    const f = r.fields;
    const hasTrip = (f['TRIPS (Export Order)']?.length||0)+(f['TRIPS (Import Order)']?.length||0) > 0;
    const dir = f['Direction']||'';
    const dirB = dir==='Export' ? '<span class="badge badge-blue">↑ Export</span>'
               : dir==='Import' ? '<span class="badge badge-green">↓ Import</span>'
               : `<span class="badge badge-grey">${dir||'—'}</span>`;
    const tripB = hasTrip
      ? '<span class="badge badge-green">Assigned</span>'
      : '<span class="badge badge-yellow">Pending</span>';
    const hr  = f['High Risk Flag'] ? '<span title="High Risk" style="color:var(--danger);margin-right:4px">⚠</span>' : '';
    const sel = r.id === INTL_ORDERS.selectedId ? ' selected' : '';
    return `<tr onclick="selectIntlOrder('${r.id}')" id="irow_${r.id}" class="${sel}">
      <td style="white-space:nowrap">${hr}<strong style="color:var(--text);font-size:12px">${f['Order Number']||r.id.slice(-6)}</strong></td>
      <td>W${f['Week Number']||'—'}</td>
      <td>${dirB}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${_clientName(f)}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis">${_cleanSummary(f['Loading Summary'])}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis">${_cleanSummary(f['Delivery Summary'])}</td>
      <td>${f['Loading DateTime']  ? formatDateShort(f['Loading DateTime'])  : '—'}</td>
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

// ── Search & Filter ───────────────────────────────
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
  if (_intlFilters['_trip']==='unassigned') recs = recs.filter(r =>
    !r.fields['TRIPS (Export Order)']?.length && !r.fields['TRIPS (Import Order)']?.length);
  if (_intlFilters['_trip']==='assigned') recs = recs.filter(r =>
    r.fields['TRIPS (Export Order)']?.length>0 || r.fields['TRIPS (Import Order)']?.length>0);
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

  // Build stop lines using resolved location names
  const buildStops = (prefix) => {
    let html = '';
    for (let i=1;i<=5;i++) {
      const locArr = f[`${prefix} Location ${i}`];
      const locId  = Array.isArray(locArr) ? locArr[0] : null;
      const pal    = f[`${prefix} Pallets ${i}`];
      if (!locId) break;
      const name = _locationsMap[locId] || _cleanSummary(f[`${prefix} Summary`]) || locId.slice(-6);
      html += _dF(`Stop ${i}`, `${name}${pal ? ' — '+pal+' pal' : ''}`);
    }
    return html || _dF('Location', _cleanSummary(f[`${prefix.includes('Load')?'Loading':'Delivery'} Summary`]));
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
        ${_dF('Type',         f['Type']||'—')}
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
        ${_dF('Date', f['Loading DateTime'] ? formatDate(f['Loading DateTime']) : '—')}
        ${buildStops('Loading')}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Delivery</div>
        ${_dF('Date', f['Delivery DateTime'] ? formatDate(f['Delivery DateTime']) : '—')}
        ${buildStops('Unloading')}
      </div>
      ${can('costs')!=='none'?`
      <div class="detail-section">
        <div class="detail-section-title">Financial</div>
        ${_dF('Price',          f['Price']     ? '€ '+Number(f['Price']).toLocaleString('el-GR')     : '—')}
        ${_dF('Net Price',      f['Net Price'] ? '€ '+Number(f['Net Price']).toLocaleString('el-GR') : '—')}
        ${_dF('Invoice Status', f['Invoice Status']||'—')}
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
      ${f['Notes']?`<div class="detail-section">
        <div class="detail-section-title">Notes</div>
        <div style="font-size:12.5px;color:var(--text-mid);line-height:1.5">${f['Notes']}</div>
      </div>`:''}
    </div>`;
}

function _dF(l,v){return `<div class="detail-field"><span class="detail-field-label">${l}</span><span class="detail-field-value">${v}</span></div>`;}
function _chk(l,v){return `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:${v?'var(--success)':'var(--text-dim)'}">${v?'✅':'⬜'} ${l}</div>`;}

// ── Linked record select helpers ──────────────────
function _makeLinkedSelect(id, currentId, options, placeholder) {
  // options = [{id, label}]
  const current = currentId ? (options.find(o=>o.id===currentId)||null) : null;
  return `<div class="linked-select-wrap" style="position:relative">
    <input class="form-input" id="${id}_search" autocomplete="off"
      value="${current?current.label:''}"
      placeholder="${placeholder}"
      oninput="_filterLinkedOpts('${id}',this.value)"
      onfocus="_showLinkedOpts('${id}')"
      onblur="_hideLinkedOpts('${id}')">
    <input type="hidden" id="${id}_val" value="${currentId||''}">
    <div id="${id}_opts" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:200;
      background:#fff;border:1px solid var(--border-dark);border-radius:6px;max-height:200px;
      overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,0.1)">
    </div>
  </div>`;
}

function _showLinkedOpts(id) {
  const search = document.getElementById(id+'_search');
  _filterLinkedOpts(id, search ? search.value : '');
}

function _hideLinkedOpts(id) {
  setTimeout(() => {
    const el = document.getElementById(id+'_opts');
    if (el) el.style.display = 'none';
  }, 200);
}

function _filterLinkedOpts(id, q) {
  const opts = id.startsWith('io_loc') ? _locationsArr
             : id.startsWith('io_client') ? Object.entries(_clientsMap).map(([id,label])=>({id,label}))
             : [];
  const filtered = q.trim()
    ? opts.filter(o => o.label.toLowerCase().includes(q.toLowerCase())).slice(0,20)
    : opts.slice(0,20);
  const container = document.getElementById(id+'_opts');
  if (!container) return;
  if (!filtered.length) { container.style.display='none'; return; }
  container.style.display = 'block';
  container.innerHTML = filtered.map(o =>
    `<div onmousedown="_selectLinkedOpt('${id}','${o.id}',this)"
      style="padding:8px 12px;font-size:13px;cursor:pointer;transition:background 0.1s"
      onmouseover="this.style.background='var(--bg-hover)'"
      onmouseout="this.style.background=''">${o.label}</div>`
  ).join('');
}

function _selectLinkedOpt(id, recId, el) {
  document.getElementById(id+'_search').value = el.textContent;
  document.getElementById(id+'_val').value    = recId;
  document.getElementById(id+'_opts').style.display = 'none';
}

// ── New Order Modal ───────────────────────────────
function openIntlCreate() { _buildIntlModal(null,{}); }
function openIntlEdit(recId) {
  const rec = INTL_ORDERS.data.find(r=>r.id===recId);
  if(rec) _buildIntlModal(recId, rec.fields);
}

function _buildIntlModal(recId, f) {
  const isEdit = !!recId;
  const opt = (arr, cur) => arr.map(o=>`<option value="${o}" ${f[cur]===o?'selected':''}>${o}</option>`).join('');

  // Current linked values
  const clientId = Array.isArray(f['Client']) ? f['Client'][0] : '';
  const locIds   = (i) => {
    const arr = f[`Loading Location ${i}`];
    return Array.isArray(arr) ? arr[0] : '';
  };
  const ulocIds  = (i) => {
    const arr = f[`Unloading Location ${i}`];
    return Array.isArray(arr) ? arr[0] : '';
  };

  // Build initial stop rows — only show rows that have data, always min 1
  const buildStopRows = (prefix, locFn, palFn, idPrefix) => {
    // Find how many stops have data
    let filled = 0;
    for(let i=1;i<=5;i++) { if(locFn(i)||palFn(i)) filled=i; }
    const show = Math.max(1, filled); // always show at least 1
    let rows = '';
    for(let i=1;i<=show;i++){
      rows += `<div class="form-grid" id="${idPrefix}_row_${i}" style="margin-bottom:0">
        <div class="form-field">
          <label class="form-label">${prefix} Location ${i}${i===1?' *':''}</label>
          ${_makeLinkedSelect(idPrefix+'_l'+i, locFn(i), _locationsArr, 'Search location...')}
        </div>
        <div class="form-field">
          <label class="form-label">${prefix} Pallets ${i}${i===1?' *':''}</label>
          <input class="form-input" type="number" id="${idPrefix}_pal_${i}"
            value="${palFn(i)||''}" placeholder="0">
        </div>
      </div>`;
    }
    return rows;
  };

  // Track how many stops are visible
  window._intlLoadStops = Math.max(1, (() => { let n=0; for(let i=1;i<=5;i++) if(locIds(i)||f[`Loading Pallets ${i}`]) n=i; return n; })());
  window._intlDelStops  = Math.max(1, (() => { let n=0; for(let i=1;i<=5;i++) if(ulocIds(i)||f[`Unloading Pallets ${i}`]) n=i; return n; })());

  const loadRows = buildStopRows('Loading',   locIds,  (i)=>f[`Loading Pallets ${i}`],   'io_loc_l');
  const delRows  = buildStopRows('Unloading', ulocIds, (i)=>f[`Unloading Pallets ${i}`], 'io_loc_u');

  const body = `
    <div class="form-grid">

      <!-- Row 1: Brand -->
      <div class="form-field span-2">
        <label class="form-label">Brand</label>
        <select class="form-select" id="io_Brand">
          <option value="">— Select —</option>
          ${opt(['Petras Group','DPS'],'Brand')}
        </select>
      </div>

      <!-- Row 2: Type + Direction -->
      <div class="form-field">
        <label class="form-label">Type *</label>
        <select class="form-select" id="io_Type">
          <option value="">— Select —</option>
          ${opt(['International','National'],'Type')}
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">Direction *</label>
        <select class="form-select" id="io_Direction">
          <option value="">— Select —</option>
          ${opt(['Export','Import'],'Direction')}
        </select>
      </div>

      <!-- Row 3: Client + Price -->
      <div class="form-field">
        <label class="form-label">Client *</label>
        ${_makeLinkedSelect('io_client', clientId,
          Object.entries(_clientsMap).map(([id,label])=>({id,label})).sort((a,b)=>a.label.localeCompare(b.label)),
          'Search client...')}
      </div>
      <div class="form-field">
        <label class="form-label">Price *</label>
        <input class="form-input" type="number" id="io_Price"
          value="${f['Price']||''}" placeholder="0.00">
      </div>

      <!-- Row 4: Goods + Gross Weight -->
      <div class="form-field">
        <label class="form-label">Goods</label>
        <input class="form-input" type="text" id="io_Goods"
          value="${f['Goods']||''}" placeholder="e.g. Fresh Produce">
      </div>
      <div class="form-field">
        <label class="form-label">Gross Weight kg</label>
        <input class="form-input" type="number" id="io_Gross_Weight_kg"
          value="${f['Gross Weight kg']||''}">
      </div>

      <!-- Row 5: Temperature + Refrigerator Mode -->
      <div class="form-field">
        <label class="form-label">Temperature °C *</label>
        <input class="form-input" type="number" id="io_Temperature"
          value="${f['Temperature °C']!=null?f['Temperature °C']:''}">
      </div>
      <div class="form-field">
        <label class="form-label">Refrigerator Mode *</label>
        <select class="form-select" id="io_Refrigerator_Mode">
          <option value="">— Select —</option>
          ${opt(['Continuous','Start-Stop','No temp'],'Refrigerator Mode')}
        </select>
      </div>

      <!-- Row 6: Pallet Type + Pallet Exchange -->
      <div class="form-field">
        <label class="form-label">Pallet Type *</label>
        <select class="form-select" id="io_Pallet_Type">
          <option value="">— Select —</option>
          ${opt(['EUR','CHEP','Industrial','Euro'],'Pallet Type')}
        </select>
      </div>
      <div class="form-field" style="justify-content:flex-end;padding-top:22px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="io_Pallet_Exchange"
            ${f['Pallet Exchange']?'checked':''} style="width:15px;height:15px">
          Pallet Exchange
        </label>
      </div>

      <!-- High Risk -->
      <div class="form-field span-2">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="io_High_Risk_Flag"
            ${f['High Risk Flag']?'checked':''} style="width:15px;height:15px">
          High Risk Flag
        </label>
      </div>

    </div>

    <!-- ── Loading Section ── -->
    <div style="margin:20px 0 10px;padding-top:16px;border-top:1px solid var(--border)">
      <div class="detail-section-title" style="margin-bottom:12px">Loading</div>
      <div class="form-grid" style="margin-bottom:12px">
        <div class="form-field span-2">
          <label class="form-label">Loading Date *</label>
          <input class="form-input" type="date" id="io_Loading_DateTime"
            value="${f['Loading DateTime']?f['Loading DateTime'].split('T')[0]:''}">
        </div>
      </div>
      <div id="intl_load_stops">${loadRows}</div>
      <button type="button" class="btn btn-ghost" style="margin-top:8px;font-size:12px;padding:5px 12px"
        onclick="_addIntlStop('load')" id="intl_add_load">
        + Add Loading Stop
      </button>
    </div>

    <!-- ── Veroia Switch ── -->
    <div style="margin:4px 0 16px">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="io_Veroia_Switch"
          ${f['Veroia Switch ']?'checked':''} style="width:15px;height:15px">
        Veroia Switch
      </label>
    </div>

    <!-- ── Delivery Section ── -->
    <div style="margin:0 0 10px;padding-top:16px;border-top:1px solid var(--border)">
      <div class="detail-section-title" style="margin-bottom:12px">Delivery</div>
      <div class="form-grid" style="margin-bottom:12px">
        <div class="form-field span-2">
          <label class="form-label">Delivery Date *</label>
          <input class="form-input" type="date" id="io_Delivery_DateTime"
            value="${f['Delivery DateTime']?f['Delivery DateTime'].split('T')[0]:''}">
        </div>
      </div>
      <div id="intl_del_stops">${delRows}</div>
      <button type="button" class="btn btn-ghost" style="margin-top:8px;font-size:12px;padding:5px 12px"
        onclick="_addIntlStop('del')" id="intl_add_del">
        + Add Delivery Stop
      </button>
    </div>`;

  const footer = `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-success" onclick="saveIntlOrder('${recId||''}')">
      ${isEdit?'Save Changes':'Submit'}
    </button>`;

  // Wide modal for this form
  document.getElementById('modal').style.width = '700px';
  openModal(isEdit ? 'Edit Order' : 'New Order', body, footer);
}

// ── Save ──────────────────────────────────────────
async function saveIntlOrder(recId) {
  const fields = {};

  // Strings
  const strF = {
    io_Brand:'Brand', io_Type:'Type', io_Direction:'Direction',
    io_Goods:'Goods', io_Pallet_Type:'Pallet Type',
    io_Refrigerator_Mode:'Refrigerator Mode',
  };
  for(const[id,f] of Object.entries(strF)){
    const el=document.getElementById(id); if(el?.value?.trim()) fields[f]=el.value.trim();
  }

  // Dates
  // Auto-calculate Week Number — matches WEEKNUM({Delivery DateTime}, "Sunday")
  const deliveryEl = document.getElementById('io_Delivery_DateTime');
  if (deliveryEl?.value) {
    fields['Week Number'] = _airtableWeekNum(deliveryEl.value);
  }
  const dateF = {io_Loading_DateTime:'Loading DateTime', io_Delivery_DateTime:'Delivery DateTime'};
  for(const[id,f] of Object.entries(dateF)){
    const el=document.getElementById(id); if(el?.value) fields[f]=el.value;
  }

  // Numbers
  const numF = {io_Price:'Price', io_Temperature:'Temperature °C', io_Gross_Weight_kg:'Gross Weight kg'};
  for(const[id,f] of Object.entries(numF)){
    const el=document.getElementById(id);
    if(el?.value!==''&&el?.value!==undefined&&el?.value!==null) fields[f]=parseFloat(el.value);
  }

  // Checkboxes
  const chkF = {
    io_Pallet_Exchange:'Pallet Exchange', io_High_Risk_Flag:'High Risk Flag',
    io_Veroia_Switch:'Veroia Switch ',
  };
  for(const[id,f] of Object.entries(chkF)){
    const el=document.getElementById(id); if(el) fields[f]=el.checked;
  }

  // Linked: Client
  const clientVal = document.getElementById('io_client_val')?.value;
  if (clientVal) fields['Client'] = [clientVal];

  // Linked: Loading Locations + Pallets
  for(let i=1;i<=5;i++){
    const locVal = document.getElementById(`io_loc_l${i}_val`)?.value;
    const palEl  = document.getElementById(`io_lpal_${i}`);
    if(locVal)                       fields[`Loading Location ${i}`] = [locVal];
    if(palEl?.value!=='')            fields[`Loading Pallets ${i}`]  = parseFloat(palEl.value)||0;
  }

  // Linked: Unloading Locations + Pallets
  for(let i=1;i<=5;i++){
    const locVal = document.getElementById(`io_loc_u${i}_val`)?.value;
    const palEl  = document.getElementById(`io_upal_${i}`);
    if(locVal)                       fields[`Unloading Location ${i}`] = [locVal];
    if(palEl?.value!=='')            fields[`Unloading Pallets ${i}`]  = parseFloat(palEl.value)||0;
  }

  // Validation
  if(!fields['Direction']){ alert('Direction is required'); return; }
  if(!fields['Client']){ alert('Client is required'); return; }
  if(!fields['Loading Location 1']){ alert('Loading Location 1 is required'); return; }
  if(!fields['Unloading Location 1']){ alert('Delivery Location 1 is required'); return; }
  if(!fields['Loading DateTime']){ alert('Loading Date is required'); return; }
  if(!fields['Delivery DateTime']){ alert('Delivery Date is required'); return; }

  const btn=event.target; btn.textContent='Saving...'; btn.disabled=true;
  try {
    if(recId) await atPatch(TABLES.ORDERS, recId, fields);
    else      await atCreate(TABLES.ORDERS, fields);
    invalidateCache(TABLES.ORDERS);
    document.getElementById('modal').style.width = '';
    closeModal();
    toast(recId?'Order updated':'Order created');
    await renderOrdersIntl();
  } catch(e){
    btn.textContent='Save'; btn.disabled=false;
    alert('Error: '+e.message);
  }
}

// ── Dynamic stop add ──────────────────────────────
function _addIntlStop(type) {
  const isLoad = type === 'load';
  const countKey = isLoad ? '_intlLoadStops' : '_intlDelStops';
  const containerId = isLoad ? 'intl_load_stops' : 'intl_del_stops';
  const btnId = isLoad ? 'intl_add_load' : 'intl_add_del';
  const idPrefix = isLoad ? 'io_loc_l' : 'io_loc_u';
  const palPrefix = isLoad ? 'io_lpal_' : 'io_upal_';
  const label = isLoad ? 'Loading' : 'Unloading';

  const current = window[countKey] || 1;
  if (current >= 5) {
    document.getElementById(btnId).style.display = 'none';
    return;
  }

  const next = current + 1;
  window[countKey] = next;

  const container = document.getElementById(containerId);
  const div = document.createElement('div');
  div.className = 'form-grid';
  div.id = `${idPrefix}_row_${next}`;
  div.style.marginBottom = '0';
  div.innerHTML = `
    <div class="form-field">
      <label class="form-label">${label} Location ${next}</label>
      ${_makeLinkedSelect(idPrefix+next, '', _locationsArr, 'Search location...')}
    </div>
    <div class="form-field">
      <label class="form-label">${label} Pallets ${next}</label>
      <input class="form-input" type="number" id="${palPrefix}${next}" placeholder="0">
    </div>`;
  container.appendChild(div);

  // Hide button if at max
  if (next >= 5) document.getElementById(btnId).style.display = 'none';
}

function _airtableWeekNum(dateStr) {
  // Exact match for WEEKNUM({date}, "Sunday") used in Airtable
  const d = new Date(dateStr + 'T12:00:00');
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekStart = new Date(jan1);
  weekStart.setDate(jan1.getDate() - jan1.getDay()); // back to Sunday
  return Math.floor((d - weekStart) / 604800000) + 1;
}
