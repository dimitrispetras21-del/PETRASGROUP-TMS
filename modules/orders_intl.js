// ═══════════════════════════════════════════════
// MODULE — INTERNATIONAL ORDERS
// ═══════════════════════════════════════════════

const INTL_ORDERS = { data: [], filtered: [], selectedId: null };
const _intlFilters = {};

async function renderOrdersIntl() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading orders...');
  try {
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
          <input class="search-input" style="max-width:210px" placeholder="🔍  Order / Client / Location..." oninput="intlSearch(this.value)">
          <select class="filter-select" onchange="intlFilter('Direction',this.value)">
            <option value="">Direction: All</option>
            <option value="Export">Export ↑</option>
            <option value="Import">Import ↓</option>
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
            <option value="DPS Logistics">DPS Logistics</option>
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
  for (let w = wn-2; w <= wn+8; w++) {
    if (w<1) continue;
    s += `<option value="${w}" ${w===wn?'selected':''}>${w===wn?'→ ':''} W${w}</option>`;
  }
  return s;
}

function _renderIntlTable(records) {
  const wrap = document.getElementById('intlTable');
  if (!records.length) { wrap.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-dim)">No orders match filters</div>`; return; }
  const rows = records.slice(0,300).map(r => {
    const f = r.fields;
    const hasTrip = (f['TRIPS (Export Order)']?.length||0)+(f['TRIPS (Import Order)']?.length||0) > 0;
    const dir = f['Direction']||'';
    const dirB = dir==='Export' ? '<span class="badge badge-blue">↑ Export</span>'
               : dir==='Import' ? '<span class="badge badge-green">↓ Import</span>'
               : '<span class="badge badge-grey">—</span>';
    const tripB = hasTrip ? '<span class="badge badge-green">Assigned</span>' : '<span class="badge badge-yellow">Pending</span>';
    const hr = f['High Risk Flag'] ? '<span title="High Risk" style="color:var(--danger);margin-right:4px">⚠</span>' : '';
    const sel = r.id === INTL_ORDERS.selectedId ? ' selected' : '';
    return `<tr onclick="selectIntlOrder('${r.id}')" id="irow_${r.id}" class="${sel}">
      <td style="white-space:nowrap">${hr}<strong style="color:var(--text)">${f['Order Number']||r.id.slice(-6)}</strong></td>
      <td>W${f['Week Number']||'—'}</td>
      <td>${dirB}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${fv(f['Client'])||'—'}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${fv(f['Loading Location 1'])||'—'}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${fv(f['Unloading Location 1'])||'—'}</td>
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

function intlSearch(q) { _intlFilters._q = q.toLowerCase().trim(); _applyIntlFilters(); }
function intlFilter(k,v) { if(!v) delete _intlFilters[k]; else _intlFilters[k]=v; _applyIntlFilters(); }

function _applyIntlFilters() {
  let recs = INTL_ORDERS.data;
  if (_intlFilters._q) {
    const q = _intlFilters._q;
    recs = recs.filter(r => {
      const f = r.fields;
      return String(f['Order Number']||'').toLowerCase().includes(q)
        || (fv(f['Client'])||'').toLowerCase().includes(q)
        || (fv(f['Loading Location 1'])||'').toLowerCase().includes(q)
        || (fv(f['Unloading Location 1'])||'').toLowerCase().includes(q)
        || (f['Goods']||'').toLowerCase().includes(q);
    });
  }
  if (_intlFilters['Direction']) recs = recs.filter(r => r.fields['Direction'] === _intlFilters['Direction']);
  if (_intlFilters['Status'])    recs = recs.filter(r => r.fields['Status']    === _intlFilters['Status']);
  if (_intlFilters['Brand'])     recs = recs.filter(r => r.fields['Brand']     === _intlFilters['Brand']);
  if (_intlFilters['_week'])     recs = recs.filter(r => String(r.fields['Week Number']) === String(_intlFilters['_week']));
  if (_intlFilters['_trip'] === 'unassigned') recs = recs.filter(r => !r.fields['TRIPS (Export Order)']?.length && !r.fields['TRIPS (Import Order)']?.length);
  if (_intlFilters['_trip'] === 'assigned')   recs = recs.filter(r => r.fields['TRIPS (Export Order)']?.length > 0 || r.fields['TRIPS (Import Order)']?.length > 0);
  INTL_ORDERS.filtered = recs;
  _renderIntlTable(recs);
  const n = recs.length + ' orders';
  document.getElementById('intlCount').textContent = n;
  document.getElementById('intlSub').textContent   = n;
}

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

  let stops = '';
  for (let i=1;i<=5;i++) {
    const loc = fv(f[`Loading Location ${i}`]);
    const pal = f[`Loading Pallets ${i}`];
    if (!loc) break;
    stops += _dF(`Stop ${i}`, `${loc}${pal?' — '+pal+' pal':''}`);
  }
  let dstops = '';
  for (let i=1;i<=5;i++) {
    const loc = fv(f[`Unloading Location ${i}`]);
    const pal = f[`Unloading Pallets ${i}`];
    if (!loc) break;
    dstops += _dF(`Stop ${i}`, `${loc}${pal?' — '+pal+' pal':''}`);
  }

  const stMap = {Pending:'badge-yellow',Assigned:'badge-blue',Active:'badge-green',Delivered:'badge-grey',Cancelled:'badge-red'};

  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="detail-title">${f['High Risk Flag']?'<span style="color:var(--danger);margin-right:4px">⚠</span>':''}${f['Order Number']||recId.slice(-6)}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px">${f['Brand']||''} · ${f['Direction']||''} · W${f['Week Number']||'—'}</div>
      </div>
      <div class="detail-actions">
        ${canEdit?`<div class="btn-icon" onclick="openIntlEdit('${recId}')"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 2l3 3-9 9H2v-3l9-9z"/></svg></div>`:''}
        <div class="btn-icon" onclick="document.getElementById('intlDetail').classList.add('hidden')">✕</div>
      </div>
    </div>
    <div class="detail-body">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        <span class="badge ${stMap[f['Status']]||'badge-grey'}">${f['Status']||'No Status'}</span>
        ${hasTrip?'<span class="badge badge-green">Trip Assigned</span>':'<span class="badge badge-yellow">No Trip</span>'}
        ${f['Invoiced']?'<span class="badge badge-grey">Invoiced</span>':''}
        ${f['High Risk Flag']?'<span class="badge badge-red">⚠ High Risk</span>':''}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Order</div>
        ${_dF('Client',      fv(f['Client'])||'—')}
        ${_dF('Goods',       f['Goods']||'—')}
        ${_dF('Pallet Type', f['Pallet Type']||'—')}
        ${_dF('Total Pallets',f['Total Pallets']||'—')}
        ${_dF('Gross Weight',f['Gross Weight kg']?f['Gross Weight kg']+' kg':'—')}
        ${_dF('Temperature', f['Temperature °C']!=null?f['Temperature °C']+' °C':'—')}
        ${_dF('Reefer Mode', f['Refrigerator Mode']||'—')}
        ${_dF('Pallet Exch.',f['Pallet Exchange']?'✓ Yes':'No')}
        ${_dF('Carrier',     f['Carrier Type']||'—')}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Loading</div>
        ${_dF('Date', f['Loading DateTime'] ? formatDate(f['Loading DateTime']) : '—')}
        ${stops||_dF('Location','—')}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Delivery</div>
        ${_dF('Date', f['Delivery DateTime'] ? formatDate(f['Delivery DateTime']) : '—')}
        ${dstops||_dF('Location','—')}
      </div>
      ${can('costs')!=='none'?`
      <div class="detail-section">
        <div class="detail-section-title">Financial</div>
        ${_dF('Price',    f['Price']?'€ '+Number(f['Price']).toLocaleString('el-GR'):'—')}
        ${_dF('Net Price',f['Net Price']?'€ '+Number(f['Net Price']).toLocaleString('el-GR'):'—')}
        ${_dF('Invoice Status',f['Invoice Status']||'—')}
      </div>`:''}
      <div class="detail-section">
        <div class="detail-section-title">Checklist</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
          ${_chk('Docs Ready',f['Docs Ready'])} ${_chk('Temp Check',f['Temp Check'])}
          ${_chk('Pallet Sheet',f['Pallet Sheet 1 Uploaded'])} ${_chk('SMS Driver',f['SMS to Driver'])}
          ${_chk('Money ✓',f['Money Confirmed'])} ${_chk('Client Updated',f['Client Updated'])}
          ${_chk('Done',f['DONE'])} ${_chk('Invoiced',f['Invoiced'])}
        </div>
      </div>
      ${f['Notes']?`<div class="detail-section"><div class="detail-section-title">Notes</div><div style="font-size:12.5px;color:var(--text-mid);line-height:1.5">${f['Notes']}</div></div>`:''}
    </div>`;
}

function _dF(l,v) { return `<div class="detail-field"><span class="detail-field-label">${l}</span><span class="detail-field-value">${v}</span></div>`; }
function _chk(l,v) { return `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:${v?'var(--success)':'var(--text-dim)'}">${v?'✅':'⬜'} ${l}</div>`; }

function openIntlCreate() { _buildIntlModal(null,{}); }
function openIntlEdit(recId) { const rec = INTL_ORDERS.data.find(r=>r.id===recId); if(rec) _buildIntlModal(recId,rec.fields); }

function _buildIntlModal(recId, f) {
  const isEdit = !!recId;
  const sel = (opts,cur) => opts.map(o=>`<option value="${o}" ${f[cur]===o?'selected':''}>${o}</option>`).join('');
  const body = `
    <div class="form-grid">
      <div class="form-field"><label class="form-label">Brand *</label>
        <select class="form-select" id="io_Brand"><option value="">— Select —</option>${sel(['Petras Group','DPS Logistics'],'Brand')}</select></div>
      <div class="form-field"><label class="form-label">Direction *</label>
        <select class="form-select" id="io_Direction"><option value="">— Select —</option>${sel(['Export','Import'],'Direction')}</select></div>
      <div class="form-field"><label class="form-label">Status</label>
        <select class="form-select" id="io_Status">${sel(['Pending','Assigned','Active','Delivered','Cancelled'],'Status')}</select></div>
      <div class="form-field"><label class="form-label">Carrier Type</label>
        <select class="form-select" id="io_Carrier_Type"><option value="">— Select —</option>${sel(['Owned Fleet','Partner'],'Carrier Type')}</select></div>
      <div class="form-field"><label class="form-label">Loading Date</label>
        <input class="form-input" type="date" id="io_Loading_DateTime" value="${f['Loading DateTime']?f['Loading DateTime'].split('T')[0]:''}"></div>
      <div class="form-field"><label class="form-label">Delivery Date</label>
        <input class="form-input" type="date" id="io_Delivery_DateTime" value="${f['Delivery DateTime']?f['Delivery DateTime'].split('T')[0]:''}"></div>
      <div class="form-field"><label class="form-label">Week No</label>
        <input class="form-input" type="number" id="io_Week_Number" value="${f['Week Number']||''}" placeholder="${currentWeekNumber()}"></div>
      <div class="form-field"><label class="form-label">Goods</label>
        <input class="form-input" type="text" id="io_Goods" value="${f['Goods']||''}" placeholder="e.g. Fresh Produce"></div>
      <div class="form-field"><label class="form-label">Temperature °C</label>
        <input class="form-input" type="number" id="io_Temperature" value="${f['Temperature °C']!=null?f['Temperature °C']:''}"></div>
      <div class="form-field"><label class="form-label">Pallet Type</label>
        <select class="form-select" id="io_Pallet_Type"><option value="">— Select —</option>${sel(['EUR Pallet','Half Pallet','Industrial','Other'],'Pallet Type')}</select></div>
      <div class="form-field"><label class="form-label">Loading Pallets</label>
        <input class="form-input" type="number" id="io_Loading_Pallets_1" value="${f['Loading Pallets 1']||''}"></div>
      <div class="form-field"><label class="form-label">Price (€)</label>
        <input class="form-input" type="number" id="io_Price" value="${f['Price']||''}"></div>
      <div class="form-field span-2"><label class="form-label">Notes</label>
        <textarea class="form-textarea" id="io_Notes" rows="2">${f['Notes']||''}</textarea></div>
    </div>
    <div style="display:flex;gap:20px;margin-top:14px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="io_Pallet_Exchange" ${f['Pallet Exchange']?'checked':''}> Pallet Exchange</label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="io_High_Risk_Flag" ${f['High Risk Flag']?'checked':''}> High Risk</label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="io_Docs_Ready" ${f['Docs Ready']?'checked':''}> Docs Ready</label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="io_Veroia_Switch" ${f['Veroia Switch ']?'checked':''}> Veroia Switch</label>
    </div>`;
  const footer = `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-success" onclick="saveIntlOrder('${recId||''}')">${isEdit?'Save Changes':'Create Order'}</button>`;
  openModal(isEdit ? 'Edit Order' : 'New International Order', body, footer);
}

async function saveIntlOrder(recId) {
  const fields = {};
  const strFields = {io_Brand:'Brand',io_Direction:'Direction',io_Status:'Status',io_Carrier_Type:'Carrier Type',io_Goods:'Goods',io_Pallet_Type:'Pallet Type',io_Notes:'Notes'};
  for(const[id,f] of Object.entries(strFields)){const el=document.getElementById(id);if(el?.value?.trim())fields[f]=el.value.trim();}
  const dateFields = {io_Loading_DateTime:'Loading DateTime',io_Delivery_DateTime:'Delivery DateTime'};
  for(const[id,f] of Object.entries(dateFields)){const el=document.getElementById(id);if(el?.value)fields[f]=el.value;}
  const numFields = {io_Week_Number:'Week Number',io_Loading_Pallets_1:'Loading Pallets 1',io_Price:'Price',io_Temperature:'Temperature °C'};
  for(const[id,f] of Object.entries(numFields)){const el=document.getElementById(id);if(el?.value!=='')fields[f]=parseFloat(el.value);}
  const chkFields = {io_Pallet_Exchange:'Pallet Exchange',io_High_Risk_Flag:'High Risk Flag',io_Docs_Ready:'Docs Ready',io_Veroia_Switch:'Veroia Switch '};
  for(const[id,f] of Object.entries(chkFields)){const el=document.getElementById(id);if(el)fields[f]=el.checked;}
  if(!fields['Direction']){alert('Direction is required');return;}
  const btn = event.target; btn.textContent='Saving...'; btn.disabled=true;
  try {
    if(recId) await atPatch(TABLES.ORDERS, recId, fields);
    else await atCreate(TABLES.ORDERS, fields);
    invalidateCache(TABLES.ORDERS);
    closeModal();
    toast(recId?'Order updated':'Order created');
    await renderOrdersIntl();
  } catch(e){btn.textContent='Save';btn.disabled=false;alert('Error: '+e.message);}
}
