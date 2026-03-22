// ═══════════════════════════════════════════════
// MODULE — NATIONAL ORDERS  v2
// ═══════════════════════════════════════════════

const NATL_ORDERS = { data: [], filtered: [], selectedId: null };
const _natlFilters = {};

// ─── Main ───────────────────────────────────────
async function renderOrdersNatl() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading national orders...');
  try {
    await _loadLocations(); // shared with orders_intl
    const records = await atGet(TABLES.NAT_ORDERS, '', false);
    records.sort((a,b) => (b.fields['Loading DateTime']||'').localeCompare(a.fields['Loading DateTime']||''));
    NATL_ORDERS.data = records;
    NATL_ORDERS.filtered = records;
    NATL_ORDERS.selectedId = null;
    Object.keys(_natlFilters).forEach(k => delete _natlFilters[k]);
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
      ${canEdit ? `<button class="btn btn-success" onclick="openNatlCreate()">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
        </svg> New Order</button>` : ''}
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
          <span class="entity-count" id="natlCount">${NATL_ORDERS.data.length} orders</span>
        </div>
        <div class="entity-table-wrap" id="natlTable"></div>
      </div>
      <div class="entity-detail-panel hidden" id="natlDetail"></div>
    </div>`;
}

// ─── Table ──────────────────────────────────────
function _renderNatlTable(records) {
  const wrap = document.getElementById('natlTable');
  if (!records.length) { wrap.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-dim)">No orders match filters</div>`; return; }

  const rows = records.slice(0,300).map(r => {
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

    const pickup  = _locationsMap[Array.isArray(f['Pickup Location']) ? f['Pickup Location'][0] : ''] || '—';
    const delivery= _locationsMap[Array.isArray(f['Delivery Location']) ? f['Delivery Location'][0] : ''] || '—';
    const client  = _clientsMap[Array.isArray(f['Client']) ? f['Client'][0] : ''] || '—';

    return `<tr onclick="selectNatlOrder('${r.id}')" id="nrow_${r.id}" class="${sel}">
      <td style="white-space:nowrap">${vsB}${grpB}<strong style="color:var(--text);font-size:12px">${f['Name']||r.id.slice(-6)}</strong></td>
      <td>${dirB}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis">${client}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${pickup}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${delivery}</td>
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
  }).join('');

  wrap.innerHTML = `<table><thead><tr>
    <th>Name</th><th>Dir</th><th>Client</th>
    <th>Pickup</th><th>Delivery</th><th>Load Date</th><th>Del Date</th>
    <th>PAL</th><th>Trip</th><th>INV</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

// ─── Filters ────────────────────────────────────
function natlSearch(q) { _natlFilters._q = q.toLowerCase().trim(); _applyNatlFilters(); }
function natlFilter(k,v) { if(!v) delete _natlFilters[k]; else _natlFilters[k]=v; _applyNatlFilters(); }

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
        <div class="detail-title" style="font-size:13px">${f['Name']||recId.slice(-6)}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px">
          ${f['Direction']||''} · ${f['Type']||''}
        </div>
      </div>
      <div class="detail-actions">
        ${canEdit?`<div class="btn-icon" title="Edit" onclick="openNatlEdit('${recId}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 2l3 3-9 9H2v-3l9-9z"/></svg>
        </div>`:''}
        <div class="btn-icon" onclick="document.getElementById('natlDetail').classList.add('hidden')">✕</div>
      </div>
    </div>
    <div class="detail-body">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        <span class="badge ${stMap[f['Status']]||'badge-grey'}">${f['Status']||'No Status'}</span>
        ${hasTrip?'<span class="badge badge-green">Trip Assigned</span>':'<span class="badge badge-yellow">No Trip</span>'}
        ${f['National Groupage']?'<span class="badge badge-blue">Groupage</span>':''}
        ${f['Type']==='Veroia Switch'?'<span class="badge badge-yellow">Veroia Switch</span>':''}
        ${f['Invoiced']?'<span class="badge badge-grey">Invoiced</span>':''}
        ${f['Pallet Exchange']?'<span class="badge badge-grey">Pallet Exch.</span>':''}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Order</div>
        ${_dF('Client',      _clientsMap[cId]||cId||'—')}
        ${_dF('Direction',   f['Direction']||'—')}
        ${_dF('Type',        f['Type']||'—')}
        ${_dF('Goods',       f['Goods']||'—')}
        ${_dF('Pallets',     f['Pallets']||'—')}
        ${_dF('Temperature', f['Temperature °C']!=null?f['Temperature °C']+' °C':'—')}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Route</div>
        ${_dF('Pickup',    _locationsMap[pId]||pId||'—')}
        ${_dF('Load Date', f['Loading DateTime']  ? formatDate(f['Loading DateTime'])  : '—')}
        ${_dF('Delivery',  _locationsMap[dId]||dId||'—')}
        ${_dF('Del Date',  f['Delivery DateTime'] ? formatDate(f['Delivery DateTime']) : '—')}
      </div>
      ${can('costs')!=='none'?`
      <div class="detail-section">
        <div class="detail-section-title">Financial</div>
        ${_dF('Price', f['Price']?'€ '+Number(f['Price']).toLocaleString('el-GR'):'—')}
      </div>`:''}
      ${f['Notes']?`<div class="detail-section"><div class="detail-section-title">Notes</div>
        <div style="font-size:12.5px;color:var(--text-mid);line-height:1.5">${f['Notes']}</div></div>`:''}
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
  const clientLabel = clientId ? (await _resolveClientName(clientId)) : '';
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
        <input class="form-input" type="text" id="nf_Goods" value="${f['Goods']||''}" placeholder="e.g. Fresh Produce">
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
            value="${f['Loading DateTime']?f['Loading DateTime'].split('T')[0]:''}">
        </div>
        <div class="form-field">
          <label class="form-label">Delivery Location *</label>
          ${_locSelect('ndelivery', delivId)}
        </div>
        <div class="form-field">
          <label class="form-label">Delivery Date *</label>
          <input class="form-input" type="date" id="nf_DelDate"
            value="${f['Delivery DateTime']?f['Delivery DateTime'].split('T')[0]:''}">
        </div>
      </div>
    </div>

    <div style="margin-top:16px">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="nf_Notes" rows="2">${f['Notes']||''}</textarea>
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
      // National Groupage turned OFF → clean up unassigned GL lines
      try {
        const stale = await atGetAll(TABLES.GL_LINES, {
          filterByFormula: `FIND("${savedNatlId}",ARRAYJOIN({Linked National Order},","))>0`,
          fields: ['Status']
        }, false);
        for (const r of stale) {
          if (r.fields.Status !== 'Assigned')
            await atPatch(TABLES.GL_LINES, r.id, {Status:'Unassigned'});
        }
        if (stale.length) console.log(`Deleted ${stale.length} stale GL lines`);
      } catch(e) { console.warn('GL cleanup error:', e); }
    } else if (savedNatlId && !fields['National Groupage']) {
      // National Groupage turned OFF → delete unassigned GL lines
      try {
        const stale = await atGetAll(TABLES.GL_LINES, {
          filterByFormula: `FIND("${savedNatlId}",ARRAYJOIN({Linked National Order},","))>0`,
          fields: ['Status']
        }, false);
        for (const r of stale) {
          if (r.fields.Status !== 'Assigned')
            await atPatch(TABLES.GL_LINES, r.id, {Status:'Unassigned'});
        }
        if (stale.length) toast(`Αφαιρέθηκαν ${stale.length} GL lines`, 'info');
      } catch(e) { console.warn('GL cleanup:', e); }
    }
    // ─────────────────────────────────────────────────────────

    // Sync Ramp Plan
    try {
      const natlRec = await fetch(
        'https://api.airtable.com/v0/'+AT_BASE+'/'+TABLES.NAT_ORDERS+'/'+savedNatlId,
        {headers:{'Authorization':'Bearer '+AT_TOKEN}}
      );
      const natlData = await natlRec.json();
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
  const noDir  = dir.includes('South')||dir==='South→North' ? 'South→North' : 'North→South';

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
    const pal = palPerStop || totalPal;
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
    if (rec.fields.Status !== 'Assigned') await atPatch(TABLES.GL_LINES, rec.id, {Status:'Unassigned', Pallets:0});
  }

  // Batch create
  for (let i=0; i<toCreate.length; i+=10) {
    const batch = toCreate.slice(i,i+10);
    await fetch(`https://api.airtable.com/v0/${AT_BASE}/${TABLES.GL_LINES}`, {
      method: 'POST',
      headers: {'Authorization':'Bearer '+AT_TOKEN,'Content-Type':'application/json'},
      body: JSON.stringify({records: batch.map(f=>({fields:f}))})
    });
  }

  // Batch update
  for (let i=0; i<toUpdate.length; i+=10) {
    const batch = toUpdate.slice(i,i+10);
    await fetch(`https://api.airtable.com/v0/${AT_BASE}/${TABLES.GL_LINES}`, {
      method: 'PATCH',
      headers: {'Authorization':'Bearer '+AT_TOKEN,'Content-Type':'application/json'},
      body: JSON.stringify({records: batch})
    });
  }

  console.log(`_syncGroupageLinesFromNO: ${toCreate.length} created, ${toUpdate.length} updated for NO ${noId}`);
}
