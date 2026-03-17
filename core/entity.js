// ═══════════════════════════════════════════════
// CORE — ENTITY ENGINE
// Generic CRUD renderer for master data tables
// ═══════════════════════════════════════════════

// ── Entity Config Registry ───────────────────────
const ENTITY_CONFIG = {

  clients: {
    tableId: TABLES.CLIENTS,
    label: 'Clients',
    labelSingle: 'Client',
    perm: 'clients',
    searchFields: ['Company Name', 'City', 'Contact Person', 'VAT Number'],
    filters: [
      { field: 'Country', label: 'Country', type: 'dynamic' },
      { field: 'Active',  label: 'Status', type: 'bool', options: [
        { val: '', label: 'All' },
        { val: 'true',  label: 'Active' },
        { val: 'false', label: 'Inactive' },
      ]},
    ],
    columns: [
      { field: 'Company Name',  label: 'Company',  primary: true },
      { field: 'Country',       label: 'Country' },
      { field: 'City',          label: 'City' },
      { field: 'Contact Person',label: 'Contact' },
      { field: 'Phone',         label: 'Phone' },
      { field: 'Active',        label: 'Status', type: 'active' },
    ],
    formFields: [
      { section: 'Details', fields: [
        { f: 'Company Name', label: 'Company Name', req: true },
        { f: 'VAT Number',   label: 'VAT No.' },
        { f: 'Country',      label: 'Country' },
        { f: 'City',         label: 'City' },
        { f: 'Adress',       label: 'Address' },
      ]},
      { section: 'Contact', fields: [
        { f: 'Contact Person',      label: 'Contact Person' },
        { f: 'Phone',               label: 'Phone' },
        { f: 'Email',               label: 'Email', type: 'email' },
        { f: 'Payment Terms Days',  label: 'Payment Terms (days)', type: 'number' },
      ]},
    ],
    detailSections: [
      { title: 'Company Details', fields: ['Company Name','VAT Number','Country','City','Adress'] },
      { title: 'Contact',         fields: ['Contact Person','Phone','Email'] },
      { title: 'Commercial',      fields: ['Payment Terms Days','Pallet Balance'] },
    ],
  },

  partners: {
    tableId: TABLES.PARTNERS,
    label: 'Partners',
    labelSingle: 'Partner',
    perm: 'clients',
    searchFields: ['Company Name', 'Contact Person', 'VAT Number'],
    filters: [
      { field: 'Country', label: 'Country', type: 'dynamic' },
      { field: 'Active',  label: 'Status', type: 'bool', options: [
        { val: '', label: 'All' },
        { val: 'true',  label: 'Active' },
        { val: 'false', label: 'Inactive' },
      ]},
    ],
    columns: [
      { field: 'Company Name',  label: 'Company',  primary: true },
      { field: 'Country',       label: 'Country' },
      { field: 'Contact Person',label: 'Contact' },
      { field: 'Phone',         label: 'Phone' },
      { field: 'Email',         label: 'Email' },
      { field: 'Active',        label: 'Status', type: 'active' },
    ],
    formFields: [
      { section: 'Details', fields: [
        { f: 'Company Name', label: 'Company Name', req: true },
        { f: 'VAT Number',   label: 'VAT No.' },
        { f: 'Country',      label: 'Country' },
        { f: 'Adress',       label: 'Address' },
      ]},
      { section: 'Contact', fields: [
        { f: 'Contact Person', label: 'Contact Person' },
        { f: 'Phone',          label: 'Phone' },
        { f: 'Email',          label: 'Email', type: 'email' },
      ]},
    ],
    detailSections: [
      { title: 'Company Details', fields: ['Company Name','VAT Number','Country','Adress'] },
      { title: 'Contact',         fields: ['Contact Person','Phone','Email'] },
      { title: 'Statistics',      fields: ['Pallet Balance'] },
    ],
  },

  drivers: {
    tableId: TABLES.DRIVERS,
    label: 'Drivers',
    labelSingle: 'Driver',
    perm: 'drivers',
    searchFields: ['Full Name', 'License Number'],
    filters: [
      { field: 'Type', label: 'Type', type: 'select', options: [
        { val: '', label: 'All' },
        { val: 'Internal', label: 'Internal' },
        { val: 'External', label: 'External' },
      ]},
      { field: 'Active', label: 'Status', type: 'bool', options: [
        { val: '', label: 'All' },
        { val: 'true',  label: 'Active' },
        { val: 'false', label: 'Inactive' },
      ]},
    ],
    columns: [
      { field: 'Full Name',      label: 'Full Name', primary: true },
      { field: 'Phone',          label: 'Phone' },
      { field: 'Type',           label: 'Type' },
      { field: 'License Expiry', label: 'Licence Expiry', type: 'expiry' },
      { field: 'Active',         label: 'Status', type: 'active' },
    ],
    formFields: [
      { section: 'Details', fields: [
        { f: 'Full Name',   label: 'Full Name', req: true },
        { f: 'Phone',       label: 'Phone' },
        { f: 'Type',        label: 'Type', type: 'select', options: ['Internal','External'] },
        { f: 'Salary Base', label: 'Base Salary', type: 'number' },
      ]},
      { section: 'Driving Licence', fields: [
        { f: 'License Number', label: 'License No.' },
        { f: 'License Expiry', label: 'Licence Expiry', type: 'date' },
      ]},
    ],
    detailSections: [
      { title: 'Details',         fields: ['Full Name','Phone','Type','Salary Base'] },
      { title: 'Driving Licence', fields: ['License Number','License Expiry'] },
    ],
  },

  trucks: {
    tableId: TABLES.TRUCKS,
    label: 'Trucks',
    labelSingle: 'Truck',
    perm: 'maintenance',
    searchFields: ['License Plate', 'Brand', 'Model', 'Insurance Partner'],
    filters: [
      { field: 'Brand',  label: 'Brand',  type: 'dynamic' },
      { field: 'Active', label: 'Status', type: 'bool', options: [
        { val: '', label: 'All' },
        { val: 'true',  label: 'Active' },
        { val: 'false', label: 'Inactive' },
      ]},
    ],
    columns: [
      { field: 'License Plate',       label: 'Plate', primary: true },
      { field: 'Brand',               label: 'Brand' },
      { field: 'Model',               label: 'Model' },
      { field: 'Year',                label: 'Year' },
      { field: 'Next Maintenance Date', label: 'Next Service', type: 'expiry' },
      { field: 'Active',              label: 'Status', type: 'active' },
    ],
    formFields: [
      { section: 'Identity', fields: [
        { f: 'License Plate', label: 'License Plate', req: true },
        { f: 'Brand',         label: 'Brand' },
        { f: 'Model',         label: 'Model' },
        { f: 'Year',          label: 'Year', type: 'number' },
        { f: 'Fuel Type',     label: 'Fuel Type', type: 'select', options: ['Diesel','LNG','CNG','HVO'] },
        { f: 'Euro Standard', label: 'Euro',      type: 'select', options: ['Euro 3','Euro 4','Euro 5','Euro 6'] },
      ]},
      { section: 'Technical', fields: [
        { f: 'Fuel Tank Truck Lt',      label: 'Tank Capacity (lt)',  type: 'number' },
        { f: 'Horsepower HP',           label: 'Horsepower (HP)',     type: 'number' },
        { f: 'Gross Vehicle Weight kg', label: 'GVW (kg)',            type: 'number' },
      ]},
      { section: 'Certificates & Service', fields: [
        { f: 'KTEO Expiry',           label: 'KTEO Expiry',        type: 'date' },
        { f: 'Insurance Expiry',      label: 'Insurance Expiry',   type: 'date' },
        { f: 'Insurance Partner',     label: 'Insurer' },
        { f: 'Tachograph Expiry',     label: 'Tachograph Expiry',  type: 'date' },
        { f: 'ADR Expiry',            label: 'ADR Expiry',         type: 'date' },
        { f: 'KEK Expiry',            label: 'KEK Expiry',         type: 'date' },
        { f: 'Next Maintenance Date', label: 'Next Service',       type: 'date' },
        { f: 'Notes',                 label: 'Notes',              type: 'textarea' },
      ]},
    ],
    detailSections: [
      { title: 'Identity',     fields: ['License Plate','Brand','Model','Year','Fuel Type','Euro Standard'] },
      { title: 'Technical',    fields: ['Fuel Tank Truck Lt','Horsepower HP','Gross Vehicle Weight kg','Payload Capacity kg'] },
      { title: 'Certificates', fields: ['KTEO Expiry','Insurance Expiry','Insurance Partner','Tachograph Expiry','ADR Expiry','KEK Expiry'] },
      { title: 'Maintenance',  fields: ['Next Maintenance Date','Notes'] },
    ],
  },

  trailers: {
    tableId: TABLES.TRAILERS,
    label: 'Trailers',
    labelSingle: 'Trailer',
    perm: 'maintenance',
    searchFields: ['License Plate', 'Brand', 'Model', 'Refrigeration Brand'],
    filters: [
      { field: 'Trailer Type', label: 'Type',   type: 'dynamic' },
      { field: 'Active',       label: 'Status', type: 'bool', options: [
        { val: '', label: 'All' },
        { val: 'true',  label: 'Active' },
        { val: 'false', label: 'Inactive' },
      ]},
    ],
    columns: [
      { field: 'License Plate',  label: 'Plate',  primary: true },
      { field: 'Brand',          label: 'Brand' },
      { field: 'Trailer Type',   label: 'Type' },
      { field: 'Pallet Capacity',label: 'Pallets' },
      { field: 'ATP Expiry',     label: 'ATP Expiry', type: 'expiry' },
      { field: 'Active',         label: 'Status', type: 'active' },
    ],
    formFields: [
      { section: 'Identity', fields: [
        { f: 'License Plate', label: 'License Plate', req: true },
        { f: 'Brand',         label: 'Brand' },
        { f: 'Model',         label: 'Model' },
        { f: 'Year',          label: 'Year',          type: 'number' },
        { f: 'Trailer Type',  label: 'Type',          type: 'select', options: ['Reefer','Curtainsider','Box','Flatbed','Tanker'] },
        { f: 'Pallet Capacity', label: 'Pallet Capacity', type: 'number' },
      ]},
      { section: 'Refrigeration', fields: [
        { f: 'Refrigeration Brand',        label: 'Reefer Brand' },
        { f: 'Refrigeration Model',        label: 'Reefer Model' },
        { f: 'Temp Range Min °C',          label: 'Min Temp (°C)', type: 'number' },
        { f: 'Temp Range Max °C',          label: 'Max Temp (°C)', type: 'number' },
        { f: 'Fuel Tank Refrigeration Lt', label: 'Reefer Tank (lt)', type: 'number' },
      ]},
      { section: 'Certificates', fields: [
        { f: 'ATP Expiry',            label: 'ATP Expiry',       type: 'date' },
        { f: 'KTEO Expiry',           label: 'KTEO Expiry',      type: 'date' },
        { f: 'Insurance Expiry',      label: 'Insurance Expiry', type: 'date' },
        { f: 'FRC Expiry',            label: 'FRC Expiry',       type: 'date' },
        { f: 'Next Maintenance Date', label: 'Next Service',     type: 'date' },
        { f: 'Notes',                 label: 'Notes',            type: 'textarea' },
      ]},
    ],
    detailSections: [
      { title: 'Identity',       fields: ['License Plate','Brand','Model','Year','Trailer Type','Pallet Capacity'] },
      { title: 'Refrigeration',  fields: ['Refrigeration Brand','Refrigeration Model','Temp Range Min °C','Temp Range Max °C','Fuel Tank Refrigeration Lt'] },
      { title: 'Certificates',   fields: ['ATP Expiry','KTEO Expiry','Insurance Expiry','FRC Expiry','Next Maintenance Date'] },
    ],
  },

};

// ── State ────────────────────────────────────────
const _entityState = {};

// ── Main Renderer ─────────────────────────────────
async function renderEntity(entityKey) {
  const cfg = ENTITY_CONFIG[entityKey];
  if (!cfg) return renderComingSoon(entityKey);

  const c = document.getElementById('content');
  c.innerHTML = showLoading(`Loading ${cfg.label}...`);

  const records = await atGet(cfg.tableId);

  _entityState[entityKey] = { records, filtered: records, selected: null, q: '', filters: {} };

  // Build dynamic filter options
  const dynamicOpts = {};
  for (const fi of cfg.filters) {
    if (fi.type === 'dynamic') {
      dynamicOpts[fi.field] = [...new Set(records.map(r => r.fields[fi.field]).filter(Boolean))].sort();
    }
  }

  const canEdit = can(cfg.perm) === 'full';

  c.innerHTML = `
    <div class="page-header" style="margin-bottom:16px">
      <div>
        <div class="page-title">${cfg.label}</div>
        <div class="page-sub" id="${entityKey}_sub">${records.length} records</div>
      </div>
      ${canEdit ? `
      <button class="btn btn-success" onclick="openEntityCreate('${entityKey}')">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
        </svg>
        New ${cfg.labelSingle}
      </button>` : ''}
    </div>

    <div class="entity-layout">
      <div class="entity-list-panel">
        <div class="entity-toolbar">
          <input class="search-input" style="max-width:240px" placeholder="🔍  Search..."
            oninput="entitySearch('${entityKey}', this.value)" id="${entityKey}_search">
          ${cfg.filters.map(fi => {
            if (fi.type === 'bool' || fi.type === 'select') {
              return `<select class="filter-select" onchange="entityFilter('${entityKey}','${fi.field}',this.value,'${fi.type||''}')">
                ${fi.options.map(o => `<option value="${o.val}">${fi.label}: ${o.label}</option>`).join('')}
              </select>`;
            } else if (fi.type === 'dynamic') {
              const opts = dynamicOpts[fi.field] || [];
              return `<select class="filter-select" onchange="entityFilter('${entityKey}','${fi.field}',this.value,'')">
                <option value="">${fi.label}: All</option>
                ${opts.map(o => `<option value="${o}">${o}</option>`).join('')}
              </select>`;
            }
            return '';
          }).join('')}
          <span class="entity-count" id="${entityKey}_count">${records.length} records</span>
        </div>
        <div class="entity-table-wrap" id="${entityKey}_table">
          ${buildEntityTable(entityKey, records)}
        </div>
      </div>
      <div class="entity-detail-panel hidden" id="${entityKey}_detail"></div>
    </div>`;
}

function buildEntityTable(entityKey, records) {
  const cfg = ENTITY_CONFIG[entityKey];
  const cols = cfg.columns;
  return `<table>
    <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}<th></th></tr></thead>
    <tbody>
      ${records.length === 0
        ? `<tr><td colspan="${cols.length+1}" style="text-align:center;padding:40px;color:var(--text-dim)">No records found</td></tr>`
        : records.slice(0, 200).map(r => buildEntityRow(entityKey, r, cols)).join('')
      }
    </tbody>
  </table>`;
}

function buildEntityRow(entityKey, r, cols) {
  const f = r.fields;
  const cells = cols.map(col => {
    const val = f[col.field];
    if (col.type === 'active') {
      return `<td><span class="badge ${val ? 'badge-green' : 'badge-grey'}">${val ? 'Active' : 'Inactive'}</span></td>`;
    }
    if (col.type === 'expiry' && val) {
      return `<td>${expiryLabel(val)}</td>`;
    }
    if (col.primary) return `<td><strong style="color:var(--text)">${val || '—'}</strong></td>`;
    return `<td>${val != null && val !== '' ? val : '—'}</td>`;
  }).join('');

  return `<tr onclick="selectEntity('${entityKey}','${r.id}')" id="row_${r.id}">${cells}
    <td style="width:32px">
      <div class="btn-icon" onclick="event.stopPropagation();openEntityEdit('${entityKey}','${r.id}')">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M11 2l3 3-9 9H2v-3l9-9z"/>
        </svg>
      </div>
    </td>
  </tr>`;
}

// ── Search / Filter ───────────────────────────────
function entitySearch(entityKey, q) {
  _entityState[entityKey].q = q.toLowerCase();
  applyEntityFilters(entityKey);
}

function entityFilter(entityKey, field, val, type) {
  const st = _entityState[entityKey];
  if (!val) { delete st.filters[field]; }
  else       { st.filters[field] = { val, type }; }
  applyEntityFilters(entityKey);
}

function applyEntityFilters(entityKey) {
  const cfg = ENTITY_CONFIG[entityKey];
  const st  = _entityState[entityKey];
  let recs  = st.records;

  if (st.q) {
    recs = recs.filter(r => cfg.searchFields.some(sf =>
      String(r.fields[sf] || '').toLowerCase().includes(st.q)
    ));
  }
  for (const [field, { val, type }] of Object.entries(st.filters)) {
    if (type === 'bool') {
      const boolVal = val === 'true';
      recs = recs.filter(r => !!r.fields[field] === boolVal);
    } else {
      recs = recs.filter(r => String(r.fields[field] || '') === val);
    }
  }

  st.filtered = recs;
  document.getElementById(entityKey + '_table').innerHTML = buildEntityTable(entityKey, recs);
  document.getElementById(entityKey + '_count').textContent = recs.length + ' records';
}

// ── Detail Panel ──────────────────────────────────
function selectEntity(entityKey, recId) {
  const cfg = ENTITY_CONFIG[entityKey];
  const st  = _entityState[entityKey];
  const rec = st.records.find(r => r.id === recId);
  if (!rec) return;

  document.querySelectorAll(`#${entityKey}_table tbody tr`).forEach(tr => tr.classList.remove('selected'));
  const row = document.getElementById('row_' + recId);
  if (row) row.classList.add('selected');

  const panel = document.getElementById(entityKey + '_detail');
  panel.classList.remove('hidden');

  const f = rec.fields;
  const primaryField = cfg.columns.find(c => c.primary)?.field || Object.keys(f)[0];
  const title = f[primaryField] || recId.slice(-6);
  const canEdit = can(cfg.perm) === 'full';

  panel.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">${title}</div>
      <div class="detail-actions">
        ${canEdit ? `<div class="btn-icon" title="Edit" onclick="openEntityEdit('${entityKey}','${recId}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M11 2l3 3-9 9H2v-3l9-9z"/>
          </svg>
        </div>
        <button class="active-toggle ${f['Active'] ? 'on' : 'off'}" onclick="toggleActive('${entityKey}','${recId}',${!f['Active']})">
          ${f['Active'] ? '● Active' : '○ Inactive'}
        </button>` : ''}
        <div class="btn-icon" onclick="document.getElementById('${entityKey}_detail').classList.add('hidden')">✕</div>
      </div>
    </div>
    <div class="detail-body">
      ${cfg.detailSections.map(sec => `
        <div class="detail-section">
          <div class="detail-section-title">${sec.title}</div>
          ${sec.fields.map(field => {
            let val = f[field];
            if (val == null || val === '') return '';
            let displayVal = val;
            if (typeof val === 'boolean') displayVal = val ? 'Yes' : 'No';
            if (field.includes('Expiry') || field.includes('Date')) displayVal = expiryLabel(val);
            return `<div class="detail-field">
              <span class="detail-field-label">${field}</span>
              <span class="detail-field-value">${displayVal}</span>
            </div>`;
          }).join('')}
        </div>
      `).join('')}
    </div>`;
}

async function toggleActive(entityKey, recId, newVal) {
  await atPatch(ENTITY_CONFIG[entityKey].tableId, recId, { 'Active': newVal });
  invalidateCache(ENTITY_CONFIG[entityKey].tableId);
  await renderEntity(entityKey);
  toast(newVal ? 'Marked as Active' : 'Marked as Inactive');
}

// ── Create / Edit Modal ───────────────────────────
function openEntityCreate(entityKey) {
  buildEntityModal(entityKey, null, {});
}

function openEntityEdit(entityKey, recId) {
  const st  = _entityState[entityKey];
  const rec = st.records.find(r => r.id === recId);
  if (!rec) return;
  buildEntityModal(entityKey, recId, rec.fields);
}

function buildEntityModal(entityKey, recId, fields) {
  const cfg    = ENTITY_CONFIG[entityKey];
  const isEdit = !!recId;
  let bodyHTML = '<div class="form-grid cols-1" style="gap:0">';

  for (const sec of cfg.formFields) {
    bodyHTML += `<div style="margin-bottom:4px;margin-top:16px"><div class="detail-section-title">${sec.title}</div></div>`;
    bodyHTML += '<div class="form-grid">';
    for (const field of sec.fields) {
      const val = fields[field.f] ?? '';
      let input = '';
      if (field.type === 'textarea') {
        input = `<textarea class="form-textarea" id="ef_${field.f.replace(/\s/g,'_')}" rows="3">${val}</textarea>`;
      } else if (field.type === 'select') {
        const opts = Array.isArray(field.options)
          ? field.options.map(o => typeof o === 'string'
              ? `<option value="${o}" ${val===o?'selected':''}>${o}</option>`
              : `<option value="${o.val}" ${val===o.val?'selected':''}>${o.label}</option>`).join('')
          : '';
        input = `<select class="form-select" id="ef_${field.f.replace(/\s/g,'_')}">
          <option value="">— Select —</option>${opts}</select>`;
      } else if (field.type === 'date') {
        input = `<input class="form-input" type="date" id="ef_${field.f.replace(/\s/g,'_')}" value="${val?val.split('T')[0]:''}">`;
      } else if (field.type === 'number') {
        input = `<input class="form-input" type="number" id="ef_${field.f.replace(/\s/g,'_')}" value="${val}" placeholder="0">`;
      } else if (field.type === 'email') {
        input = `<input class="form-input" type="email" id="ef_${field.f.replace(/\s/g,'_')}" value="${val}" placeholder="email@example.com">`;
      } else {
        input = `<input class="form-input" type="text" id="ef_${field.f.replace(/\s/g,'_')}" value="${val}" placeholder="${field.label}${field.req?' *':''}">`;
      }
      bodyHTML += `<div class="form-field ${field.type==='textarea'?'span-2':''}">
        <label class="form-label">${field.label}${field.req?' *':''}</label>
        ${input}
      </div>`;
    }
    bodyHTML += '</div>';
  }
  bodyHTML += '</div>';

  const footerHTML = `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-success" onclick="saveEntityRecord('${entityKey}','${recId||''}')">
      ${isEdit ? 'Save Changes' : 'Create'}
    </button>`;

  openModal(`${isEdit ? 'Edit' : 'New'} ${cfg.labelSingle}`, bodyHTML, footerHTML);
}

async function saveEntityRecord(entityKey, recId) {
  const cfg    = ENTITY_CONFIG[entityKey];
  const fields = {};

  for (const sec of cfg.formFields) {
    for (const field of sec.fields) {
      const id = 'ef_' + field.f.replace(/\s/g, '_');
      const el = document.getElementById(id);
      if (!el) continue;
      let val = el.value.trim();
      if (!val) continue;
      if (field.type === 'number') val = parseFloat(val);
      fields[field.f] = val;
    }
  }

  const reqField = cfg.formFields.flatMap(s => s.fields).find(f => f.req);
  if (reqField && !fields[reqField.f]) {
    alert(`Field "${reqField.label}" is required`);
    return;
  }

  const btn = document.activeElement;
  if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

  try {
    if (recId) {
      await atPatch(cfg.tableId, recId, fields);
    } else {
      await atCreate(cfg.tableId, fields);
    }
    invalidateCache(cfg.tableId);
    closeModal();
    toast(recId ? 'Record updated' : 'Record created');
    await renderEntity(entityKey);
  } catch(e) {
    if (btn) { btn.textContent = 'Save'; btn.disabled = false; }
    alert('Error: ' + e.message);
  }
}
