// ═══════════════════════════════════════════════
// MODULE — NATIONAL ORDERS
// ═══════════════════════════════════════════════

const NATL_ORDERS = { data: [], filtered: [], selectedId: null };
const _natlFilters = {};

async function renderOrdersNatl() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading national orders...');
  try {
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
          <input class="search-input" style="max-width:210px" placeholder="🔍  Order / Client / Location..." oninput="natlSearch(this.value)">
          <select class="filter-select" onchange="natlFilter('Direction',this.value)">
            <option value="">Direction: All</option>
            <option value="North to South">↓ North → South</option>
            <option value="South to North">↑ South → North</option>
          </select>
          <select class="filter-select" onchange="natlFilter('Type',this.value)">
            <option value="">Type: All</option>
            <option value="Independent">Independent</option>
            <option value="Veroia Switch">Veroia Switch</option>
          </select>
          <select class="filter-select" onchange="natlFilter('Status',this.value)">
            <option value="">Status: All</option>
            <option value="Pending">Pending</option>
            <option value="Assigned">Assigned</option>
            <option value="Active">Active</option>
            <option value="Delivered">Delivered</option>
          </select>
          <select class="filter-select" onchange="natlFilter('_trip',this.value)">
            <option value="">Trip: All</option>
            <option value="unassigned">Unassigned</option>
            <option value="assigned">Assigned</option>
          </select>
          <select class="filter-select" onchange="natlFilter('_groupage',this.value)">
            <option value="">Groupage: All</option>
            <option value="1">Groupage Only</option>
          </select>
          <span class="entity-count" id="natlCount">${NATL_ORDERS.data.length} orders</span>
        </div>
        <div class="entity-table-wrap" id="natlTable"></div>
      </div>
      <div class="entity-detail-panel hidden" id="natlDetail"></div>
    </div>`;
}

function _renderNatlTable(records) {
  const wrap = document.getElementById('natlTable');
  if (!records.length) { wrap.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-dim)">No orders match filters</div>`; return; }
  const rows = records.slice(0,300).map(r => {
    const f = r.fields;
    const hasTrip = (f['Linked Trip']?.length||0)+(f['NATIONAL TRIPS']?.length||0)+(f['NATIONAL TRIPS 2']?.length||0) > 0;
    const dir = f['Direction']||'';
    const dirB = dir.includes('North to South') ? '<span class="badge badge-blue">↓ N→S</span>'
               : dir.includes('South to North') ? '<span class="badge badge-green">↑ S→N</span>'
               : '<span class="badge badge-grey">—</span>';
    const typeB = f['Type']==='Veroia Switch' ? '<span class="badge badge-yellow" title="Veroia Switch">VS</span>' : '';
    const groupB = f['National Groupage'] ? '<span class="badge badge-blue" title="Groupage">GRP</span>' : '';
    const tripB = hasTrip ? '<span class="badge badge-green">Assigned</span>' : '<span class="badge badge-yellow">Pending</span>';
    const sel = r.id === NATL_ORDERS.selectedId ? ' selected' : '';
    const pickup  = fv(f['Pickup Location'])  || '—';
    const delivery = fv(f['Delivery Location']) || '—';
    return `<tr onclick="selectNatlOrder('${r.id}')" id="nrow_${r.id}" class="${sel}">
      <td><strong style="color:var(--text)">${f['Name']||r.id.slice(-6)}</strong></td>
      <td>${dirB}</td>
      <td style="display:flex;gap:4px;align-items:center">${typeB}${groupB}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis">${fv(f['Client'])||'—'}</td>
      <td style="max-width:110px;overflow:hidden;text-overflow:ellipsis">${pickup}</td>
      <td style="max-width:110px;overflow:hidden;text-overflow:ellipsis">${delivery}</td>
      <td>${f['Loading DateTime'] ? formatDateShort(f['Loading DateTime']) : '—'}</td>
      <td>${f['Delivery DateTime'] ? formatDateShort(f['Delivery DateTime']) : '—'}</td>
      <td>${f['Pallets']||'—'}</td>
      <td>${tripB}</td>
      <td>${f['Invoiced']?'<span class="badge badge-grey">INV</span>':''}</td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<table><thead><tr>
    <th>Name</th><th>Direction</th><th>Type</th><th>Client</th>
    <th>Pickup</th><th>Delivery</th><th>Load Date</th><th>Del Date</th>
    <th>PAL</th><th>Trip</th><th></th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function natlSearch(q) { _natlFilters._q = q.toLowerCase().trim(); _applyNatlFilters(); }
function natlFilter(k,v) { if(!v) delete _natlFilters[k]; else _natlFilters[k]=v; _applyNatlFilters(); }

function _applyNatlFilters() {
  let recs = NATL_ORDERS.data;
  if (_natlFilters._q) {
    const q = _natlFilters._q;
    recs = recs.filter(r => {
      const f = r.fields;
      return String(f['Name']||'').toLowerCase().includes(q)
        || (fv(f['Client'])||'').toLowerCase().includes(q)
        || (fv(f['Pickup Location'])||'').toLowerCase().includes(q)
        || (fv(f['Delivery Location'])||'').toLowerCase().includes(q)
        || (f['Goods']||'').toLowerCase().includes(q);
    });
  }
  if (_natlFilters['Direction']) recs = recs.filter(r => (r.fields['Direction']||'').includes(_natlFilters['Direction'].split(' ')[0]));
  if (_natlFilters['Type'])      recs = recs.filter(r => r.fields['Type']   === _natlFilters['Type']);
  if (_natlFilters['Status'])    recs = recs.filter(r => r.fields['Status'] === _natlFilters['Status']);
  if (_natlFilters['_groupage']) recs = recs.filter(r => r.fields['National Groupage']);
  if (_natlFilters['_trip'] === 'unassigned') recs = recs.filter(r => {
    const f=r.fields; return !f['Linked Trip']?.length && !f['NATIONAL TRIPS']?.length && !f['NATIONAL TRIPS 2']?.length;
  });
  if (_natlFilters['_trip'] === 'assigned') recs = recs.filter(r => {
    const f=r.fields; return f['Linked Trip']?.length>0 || f['NATIONAL TRIPS']?.length>0 || f['NATIONAL TRIPS 2']?.length>0;
  });
  NATL_ORDERS.filtered = recs;
  _renderNatlTable(recs);
  const n = recs.length + ' orders';
  document.getElementById('natlCount').textContent = n;
  document.getElementById('natlSub').textContent   = n;
}

function selectNatlOrder(recId) {
  NATL_ORDERS.selectedId = recId;
  document.querySelectorAll('#natlTable tbody tr').forEach(tr => tr.classList.remove('selected'));
  const row = document.getElementById('nrow_'+recId);
  if (row) row.classList.add('selected');
  const rec = NATL_ORDERS.data.find(r => r.id === recId);
  if (!rec) return;
  const panel = document.getElementById('natlDetail');
  panel.classList.remove('hidden');
  const f = rec.fields;
  const canEdit = can('orders') === 'full';
  const hasTrip = (f['Linked Trip']?.length||0)+(f['NATIONAL TRIPS']?.length||0)+(f['NATIONAL TRIPS 2']?.length||0) > 0;
  const stMap = {Pending:'badge-yellow',Assigned:'badge-blue',Active:'badge-green',Delivered:'badge-grey'};
  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="detail-title">${f['Name']||recId.slice(-6)}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px">${f['Direction']||''} · ${f['Type']||''}</div>
      </div>
      <div class="detail-actions">
        ${canEdit?`<div class="btn-icon" onclick="openNatlEdit('${recId}')"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 2l3 3-9 9H2v-3l9-9z"/></svg></div>`:''}
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
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Order</div>
        ${_dF('Client',      fv(f['Client'])||'—')}
        ${_dF('Direction',   f['Direction']||'—')}
        ${_dF('Type',        f['Type']||'—')}
        ${_dF('Goods',       f['Goods']||'—')}
        ${_dF('Pallets',     f['Pallets']||'—')}
        ${_dF('Temperature', f['Temperature °C']!=null?f['Temperature °C']+' °C':'—')}
        ${_dF('Pallet Exch.',f['Pallet Exchange']?'✓ Yes':'No')}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Route</div>
        ${_dF('Pickup',   fv(f['Pickup Location'])||'—')}
        ${_dF('Load Date',f['Loading DateTime'] ? formatDate(f['Loading DateTime']) : '—')}
        ${_dF('Delivery', fv(f['Delivery Location'])||'—')}
        ${_dF('Del Date', f['Delivery DateTime'] ? formatDate(f['Delivery DateTime']) : '—')}
      </div>
      ${can('costs')!=='none'?`
      <div class="detail-section">
        <div class="detail-section-title">Financial</div>
        ${_dF('Price', f['Price']?'€ '+Number(f['Price']).toLocaleString('el-GR'):'—')}
      </div>`:''}
      ${f['Notes']?`<div class="detail-section"><div class="detail-section-title">Notes</div><div style="font-size:12.5px;color:var(--text-mid);line-height:1.5">${f['Notes']}</div></div>`:''}
    </div>`;
}

function openNatlCreate() { _buildNatlModal(null,{}); }
function openNatlEdit(recId) { const rec = NATL_ORDERS.data.find(r=>r.id===recId); if(rec) _buildNatlModal(recId,rec.fields); }

function _buildNatlModal(recId, f) {
  const isEdit = !!recId;
  const sel = (opts,cur) => opts.map(o=>`<option value="${o}" ${f[cur]===o?'selected':''}>${o}</option>`).join('');
  const body = `
    <div class="form-grid">
      <div class="form-field"><label class="form-label">Direction *</label>
        <select class="form-select" id="no_Direction"><option value="">— Select —</option>
          <option value="North to South" ${f['Direction']==='North to South'?'selected':''}>↓ North → South</option>
          <option value="South to North" ${f['Direction']==='South to North'?'selected':''}>↑ South → North</option>
        </select></div>
      <div class="form-field"><label class="form-label">Type</label>
        <select class="form-select" id="no_Type"><option value="">— Select —</option>
          ${sel(['Independent','Veroia Switch'],'Type')}</select></div>
      <div class="form-field"><label class="form-label">Status</label>
        <select class="form-select" id="no_Status">${sel(['Pending','Assigned','Active','Delivered'],'Status')}</select></div>
      <div class="form-field"><label class="form-label">Goods</label>
        <input class="form-input" type="text" id="no_Goods" value="${f['Goods']||''}" placeholder="e.g. Fresh Produce"></div>
      <div class="form-field"><label class="form-label">Pallets</label>
        <input class="form-input" type="number" id="no_Pallets" value="${f['Pallets']||''}"></div>
      <div class="form-field"><label class="form-label">Temperature °C</label>
        <input class="form-input" type="number" id="no_Temperature" value="${f['Temperature °C']!=null?f['Temperature °C']:''}"></div>
      <div class="form-field"><label class="form-label">Loading Date</label>
        <input class="form-input" type="date" id="no_Loading_DateTime" value="${f['Loading DateTime']?f['Loading DateTime'].split('T')[0]:''}"></div>
      <div class="form-field"><label class="form-label">Delivery Date</label>
        <input class="form-input" type="date" id="no_Delivery_DateTime" value="${f['Delivery DateTime']?f['Delivery DateTime'].split('T')[0]:''}"></div>
      <div class="form-field"><label class="form-label">Price (€)</label>
        <input class="form-input" type="number" id="no_Price" value="${f['Price']||''}"></div>
      <div class="form-field"><label class="form-label"></label></div>
      <div class="form-field span-2"><label class="form-label">Notes</label>
        <textarea class="form-textarea" id="no_Notes" rows="2">${f['Notes']||''}</textarea></div>
    </div>
    <div style="display:flex;gap:20px;margin-top:14px">
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="no_Pallet_Exchange" ${f['Pallet Exchange']?'checked':''}> Pallet Exchange</label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="no_National_Groupage" ${f['National Groupage']?'checked':''}> Groupage</label>
    </div>`;
  const footer = `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-success" onclick="saveNatlOrder('${recId||''}')">${isEdit?'Save Changes':'Create Order'}</button>`;
  openModal(isEdit ? 'Edit National Order' : 'New National Order', body, footer);
}

async function saveNatlOrder(recId) {
  const fields = {};
  const strF = {no_Direction:'Direction',no_Type:'Type',no_Status:'Status',no_Goods:'Goods',no_Notes:'Notes'};
  for(const[id,f] of Object.entries(strF)){const el=document.getElementById(id);if(el?.value?.trim())fields[f]=el.value.trim();}
  const dateF = {no_Loading_DateTime:'Loading DateTime',no_Delivery_DateTime:'Delivery DateTime'};
  for(const[id,f] of Object.entries(dateF)){const el=document.getElementById(id);if(el?.value)fields[f]=el.value;}
  const numF = {no_Pallets:'Pallets',no_Temperature:'Temperature °C',no_Price:'Price'};
  for(const[id,f] of Object.entries(numF)){const el=document.getElementById(id);if(el?.value!=='')fields[f]=parseFloat(el.value);}
  const chkF = {no_Pallet_Exchange:'Pallet Exchange',no_National_Groupage:'National Groupage'};
  for(const[id,f] of Object.entries(chkF)){const el=document.getElementById(id);if(el)fields[f]=el.checked;}
  if(!fields['Direction']){alert('Direction is required');return;}
  const btn = event.target; btn.textContent='Saving...'; btn.disabled=true;
  try {
    if(recId) await atPatch(TABLES.NAT_ORDERS, recId, fields);
    else await atCreate(TABLES.NAT_ORDERS, fields);
    invalidateCache(TABLES.NAT_ORDERS);
    closeModal();
    toast(recId?'Order updated':'Order created');
    await renderOrdersNatl();
  } catch(e){btn.textContent='Save';btn.disabled=false;alert('Error: '+e.message);}
}
