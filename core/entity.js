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
    history: { type: 'client' },
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
    history: { type: 'partner' },
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
      { field: 'Full Name',      label: 'Driver', primary: true },
      { field: 'Phone',          label: 'Phone' },
      { field: 'Type',           label: 'Type' },
      { field: 'Salary Base',    label: 'Salary' },
      { field: 'License Number', label: 'License No.' },
      { field: 'License Expiry', label: 'License Expiry', type: 'expiry' },
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
      { field: '_compliance', label: 'Compliance', type: 'select', options: [
        { val: '', label: 'All' },
        { val: 'expired',  label: 'Has Expired' },
        { val: 'expiring', label: 'Expiring <30d' },
        { val: 'ok',       label: 'All OK' },
      ]},
    ],
    columns: [
      { field: 'License Plate',       label: 'Plate', primary: true },
      { field: 'Brand',               label: 'Brand' },
      { field: 'Model',               label: 'Model' },
      { field: 'Year',                label: 'Year', type: 'number' },
      { field: 'Euro Standard',       label: 'Euro' },
      { field: 'Fuel Tank Truck Lt',  label: 'Tank Lt', type: 'number' },
      { field: 'Gross Vehicle Weight kg', label: 'GVW kg', type: 'number' },
      { field: '_compliance', label: 'Docs', type: 'compliance', fields: [
        { field: 'KTEO Expiry',     label: 'KT' },
        { field: 'KEK Expiry',      label: 'KK' },
        { field: 'Insurance Expiry', label: 'INS' },
      ]},
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
        { f: 'Insurance Partner',       label: 'Insurer' },
        { f: 'Notes',                   label: 'Notes',              type: 'textarea' },
      ]},
    ],
    detailSections: [
      { title: 'Identity',     fields: ['License Plate','Brand','Model','Year','Fuel Type','Euro Standard'] },
      { title: 'Technical',    fields: ['Fuel Tank Truck Lt','Horsepower HP','Gross Vehicle Weight kg','Payload Capacity kg','Insurance Partner'] },
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
      { field: '_compliance', label: 'Compliance', type: 'select', options: [
        { val: '', label: 'All' },
        { val: 'expired',  label: 'Has Expired' },
        { val: 'expiring', label: 'Expiring <30d' },
        { val: 'ok',       label: 'All OK' },
      ]},
    ],
    columns: [
      { field: 'License Plate',           label: 'Plate',  primary: true },
      { field: 'Brand',                   label: 'Brand' },
      { field: 'Model',                   label: 'Model' },
      { field: 'Year',                    label: 'Year', type: 'number' },
      { field: 'Trailer Type',            label: 'Type' },
      { field: 'Refrigeration Brand',     label: 'Reefer' },
      { field: '_tempRange',              label: 'Temp °C', type: 'temp_range' },
      { field: 'Pallet Capacity',         label: 'Pal', type: 'number' },
      { field: '_compliance', label: 'Docs', type: 'compliance', fields: [
        { field: 'KTEO Expiry',     label: 'KT' },
        { field: 'FRC Expiry',      label: 'FRC' },
        { field: 'Insurance Expiry', label: 'INS' },
      ]},
      { field: 'Active',                  label: 'Status', type: 'active' },
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
        { f: 'Notes',                      label: 'Notes',            type: 'textarea' },
      ]},
    ],
    detailSections: [
      { title: 'Identity',       fields: ['License Plate','Brand','Model','Year','Trailer Type','Pallet Capacity'] },
      { title: 'Refrigeration',  fields: ['Refrigeration Brand','Refrigeration Model','Temp Range Min °C','Temp Range Max °C','Fuel Tank Refrigeration Lt'] },
    ],
  },

  workshops: {
    tableId: TABLES.WORKSHOPS,
    label: 'Workshops',
    labelSingle: 'Workshop',
    perm: 'maintenance',
    searchFields: ['Name', 'City', 'Contact Person', 'Specialty'],
    filters: [
      { field: 'Specialty', label: 'Specialty', type: 'dynamic' },
      { field: 'Active',    label: 'Status',    type: 'bool', options: [
        { val: '', label: 'All' },
        { val: 'true',  label: 'Active' },
        { val: 'false', label: 'Inactive' },
      ]},
    ],
    columns: [
      { field: 'Name',           label: 'Name',      primary: true },
      { field: 'City',           label: 'City', type: 'city' },
      { field: 'Specialty',      label: 'Specialty' },
      { field: 'Phone',          label: 'Phone' },
      { field: '_serviceCount',  label: 'Services', type: 'number' },
      { field: '_totalSpend',    label: 'Spend',    type: 'currency' },
      { field: '_lastUsed',      label: 'Last Used', type: 'date_rel' },
      { field: 'Active',         label: 'Status', type: 'active' },
    ],
    formFields: [
      { section: 'Details', fields: [
        { f: 'Name',           label: 'Workshop Name', req: true },
        { f: 'Specialty',      label: 'Specialty', type: 'select', options: ['General','Reefer','Tyres','Electrical','Body','Hydraulic'] },
        { f: 'Phone',          label: 'Phone' },
        { f: 'Email',          label: 'Email' },
        { f: 'Contact Person', label: 'Contact Person' },
      ]},
      { section: 'Location', fields: [
        // H15 TODO: verify actual Airtable field name for WORKSHOPS table.
        // PARTNERS + CLIENTS use 'Adress' (typo, single 'd'). If WORKSHOPS
        // follows same convention, change to 'Adress'. Currently assumed
        // to use correctly-spelled 'Address' — verify in Airtable schema.
        { f: 'Address',        label: 'Address' },
        { f: 'City',           label: 'City' },
      ]},
      { section: 'Notes', fields: [
        { f: 'Notes',          label: 'Notes', type: 'textarea' },
      ]},
    ],
    detailSections: [
      { title: 'Details',  fields: ['Name','Specialty','Phone','Email','Contact Person'] },
      { title: 'Location', fields: ['Address','City'] },
    ],
  },

};

// ── State ────────────────────────────────────────
const _entityState = {};
// Sort state per entity: { col: null|index, dir: 0|1|2 }
const _entitySort = {};

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

  const _i = n => (typeof icon === 'function') ? icon(n, 16) : '';
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:var(--space-4)">
      <div>
        <div class="page-title">${cfg.label}</div>
        <div class="page-sub" id="${entityKey}_sub">${records.length} records</div>
      </div>
      ${canEdit ? `
      <button class="btn btn-primary btn-sm" onclick="openEntityCreate('${entityKey}')">
        ${_i('plus')}
        New ${cfg.labelSingle}
      </button>` : ''}
    </div>

    ${(entityKey === 'partners' || entityKey === 'clients' || entityKey === 'workshops') ? `<div id="${entityKey}_stats_strip" style="margin-bottom:var(--space-4)"></div>` : ''}

    <div class="entity-layout">
      <div class="entity-list-panel">
        <div class="entity-toolbar-v2">
          <div class="entity-search-wrap">
            ${_i('search')}
            <input class="entity-search-input" placeholder="Search..."
              oninput="entitySearch('${entityKey}', this.value)" id="${entityKey}_search">
          </div>
          ${cfg.filters.map(fi => {
            if (fi.type === 'bool' || fi.type === 'select') {
              return `<select class="svc-filter" onchange="entityFilter('${entityKey}','${fi.field}',this.value,'${fi.type||''}')">
                ${fi.options.map(o => `<option value="${o.val}">${fi.label}: ${o.label}</option>`).join('')}
              </select>`;
            } else if (fi.type === 'dynamic') {
              const opts = dynamicOpts[fi.field] || [];
              return `<select class="svc-filter" onchange="entityFilter('${entityKey}','${fi.field}',this.value,'')">
                <option value="">${fi.label}: All</option>
                ${opts.map(o => `<option value="${o}">${o}</option>`).join('')}
              </select>`;
            }
            return '';
          }).join('')}
          <span class="entity-count-chip" id="${entityKey}_count">${records.length}</span>
        </div>
        <div class="entity-table-wrap" id="${entityKey}_table">
          ${buildEntityTable(entityKey, records)}
        </div>
      </div>
      <div class="entity-detail-panel hidden" id="${entityKey}_detail"></div>
    </div>`;

  if (entityKey === 'partners')  _renderPartnersStatsStrip(records);
  if (entityKey === 'clients')   _renderClientsStatsStrip(records);
  if (entityKey === 'workshops') _renderWorkshopsStatsStrip(records);
}

// ── Workshops stats strip ─────────────────────────
async function _renderWorkshopsStatsStrip(workshops) {
  const el = document.getElementById('workshops_stats_strip');
  if (!el) return;
  try {
    const history = await atGetAll(TABLES.MAINT_HISTORY, { fields: ['Workshop','Cost','Total Cost','Date'] }, true).catch(() => []);
    const activeWs = workshops.filter(w => w.fields['Active']).length;
    const totalSpend = history.reduce((s, r) => s + (parseFloat(r.fields['Cost']) || parseFloat(r.fields['Total Cost']) || 0), 0);
    const yyyymm = new Date().toISOString().slice(0, 7);
    const monthSpend = history
      .filter(r => (r.fields['Date'] || '').startsWith(yyyymm))
      .reduce((s, r) => s + (parseFloat(r.fields['Cost']) || parseFloat(r.fields['Total Cost']) || 0), 0);

    // Top workshop by total spend
    const byWs = {};
    for (const r of history) {
      const wid = (r.fields['Workshop'] || [])[0];
      if (!wid) continue;
      const cost = parseFloat(r.fields['Cost']) || parseFloat(r.fields['Total Cost']) || 0;
      byWs[wid] = (byWs[wid] || 0) + cost;
    }
    const wsNameById = {};
    for (const w of workshops) wsNameById[w.id] = w.fields['Name'] || '—';
    const top3 = Object.entries(byWs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([wid, total]) => ({ name: wsNameById[wid] || 'Unknown', total }));

    // Enrich workshop records with service count + total spend for column display
    const serviceCountByWs = {};
    const lastUsedByWs = {};
    for (const r of history) {
      const wid = (r.fields['Workshop'] || [])[0];
      if (!wid) continue;
      serviceCountByWs[wid] = (serviceCountByWs[wid] || 0) + 1;
      const d = r.fields['Date'];
      if (d && (!lastUsedByWs[wid] || d > lastUsedByWs[wid])) lastUsedByWs[wid] = d;
    }
    // Attach enrichment to in-memory records so column rendering can use them
    for (const w of workshops) {
      w.fields['_serviceCount'] = serviceCountByWs[w.id] || 0;
      w.fields['_totalSpend'] = byWs[w.id] || 0;
      w.fields['_lastUsed'] = lastUsedByWs[w.id] || '';
    }
    // Re-render table to show enriched columns
    const tableEl = document.getElementById('workshops_table');
    if (tableEl) tableEl.innerHTML = buildEntityTable('workshops', workshops);

    const card = (label, val, color) => `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px 14px;min-width:140px">
        <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;font-weight:600">${label}</div>
        <div style="font-size:22px;font-weight:700;color:${color || 'var(--text)'};margin-top:4px;font-variant-numeric:tabular-nums">${val}</div>
      </div>`;
    const topHTML = top3.length
      ? `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px 14px;flex:1;min-width:260px">
          <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:6px">Top 3 Workshops (All Time)</div>
          ${top3.map((p, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px">
              <span style="color:var(--text)"><strong style="color:var(--accent)">#${i+1}</strong> ${escapeHtml(p.name)}</span>
              <span style="color:var(--text);font-weight:700;font-variant-numeric:tabular-nums">€${Math.round(p.total).toLocaleString()}</span>
            </div>`).join('')}
        </div>`
      : '';

    el.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${card('Active Workshops', activeWs)}
        ${card('Services (All Time)', history.length.toLocaleString(), 'var(--accent)')}
        ${card('Total Spend', '€' + Math.round(totalSpend).toLocaleString(), 'var(--text)')}
        ${card('This Month', '€' + Math.round(monthSpend).toLocaleString(), monthSpend > 0 ? 'var(--warning)' : 'var(--text-dim)')}
        ${topHTML}
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:11px">Stats error: ${e.message}</div>`;
  }
}

// ── Partners top stats strip ──────────────────────
async function _renderPartnersStatsStrip(partners) {
  const el = document.getElementById('partners_stats_strip');
  if (!el) return;
  try {
    const allPA = await atGetAll(TABLES.PARTNER_ASSIGN, {
      fields: [F.PA_PARTNER, F.PA_STATUS, F.PA_RATE, F.PA_ASSIGN_DATE],
    }, false);

    const activePartners = partners.filter(p => p.fields['Active']).length;
    const activeAssign   = allPA.filter(r => ['Assigned','In Transit'].includes(r.fields[F.PA_STATUS]||'')).length;

    // This-month spend
    const now = new Date();
    const yyyymm = now.toISOString().slice(0,7);
    const monthSpend = allPA
      .filter(r => (r.fields[F.PA_ASSIGN_DATE]||'').startsWith(yyyymm))
      .reduce((s,r)=>s+(parseFloat(r.fields[F.PA_RATE])||0), 0);

    // Top 3 partners by total rate
    const byPartner = {};
    for (const r of allPA) {
      const pid = (r.fields[F.PA_PARTNER]||[])[0];
      if (!pid) continue;
      byPartner[pid] = (byPartner[pid] || 0) + (parseFloat(r.fields[F.PA_RATE])||0);
    }
    const pNameById = {};
    for (const p of partners) pNameById[p.id] = p.fields['Company Name'] || '—';
    const top3 = Object.entries(byPartner)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,3)
      .map(([pid,total]) => ({ name: pNameById[pid]||'Unknown', total }));

    const card = (label, val, color) => `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px 14px;min-width:140px">
        <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;font-weight:600">${label}</div>
        <div style="font-size:22px;font-weight:700;color:${color||'var(--text)'};margin-top:4px">${val}</div>
      </div>`;

    const topHTML = top3.length
      ? `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px 14px;flex:1;min-width:260px">
          <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:6px">Top 3 Partners (All Time)</div>
          ${top3.map((p,i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px">
              <span style="color:var(--text)"><strong style="color:var(--accent)">#${i+1}</strong> ${p.name}</span>
              <span style="color:var(--text);font-weight:700">€${Math.round(p.total).toLocaleString()}</span>
            </div>`).join('')}
        </div>`
      : '';

    el.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${card('Active Partners', activePartners)}
        ${card('Active Assignments', activeAssign, activeAssign>0?'var(--accent)':'var(--text-dim)')}
        ${card('This Month', '€'+Math.round(monthSpend).toLocaleString(), 'var(--success)')}
        ${topHTML}
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:11px">Stats error: ${e.message}</div>`;
  }
}

// ── Clients top stats strip ───────────────────────
async function _renderClientsStatsStrip(clients) {
  const el = document.getElementById('clients_stats_strip');
  if (!el) return;
  try {
    const [intl, natl] = await Promise.all([
      atGetAll(TABLES.ORDERS,     { fields: ['Client','Status','Price','Loading DateTime'] }, false),
      atGetAll(TABLES.NAT_ORDERS, { fields: ['Client','Status','Price','Loading DateTime'] }, false),
    ]);
    const all = [...intl, ...natl];

    const activeClients = clients.filter(c => c.fields['Active']).length;
    const activeOrders  = all.filter(r => !['Delivered','Invoiced','Cancelled'].includes(r.fields['Status']||'')).length;

    const yyyymm = new Date().toISOString().slice(0,7);
    const monthRev = all
      .filter(r => (r.fields['Loading DateTime']||'').startsWith(yyyymm))
      .reduce((s,r)=>s+(parseFloat(r.fields['Price'])||0), 0);

    // Top 3 clients by total revenue (all time)
    const byClient = {};
    for (const r of all) {
      const cid = (r.fields['Client']||[])[0];
      if (!cid) continue;
      byClient[cid] = (byClient[cid] || 0) + (parseFloat(r.fields['Price'])||0);
    }
    const cNameById = {};
    for (const c of clients) cNameById[c.id] = c.fields['Company Name'] || '—';
    const top3 = Object.entries(byClient)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,3)
      .map(([cid,total]) => ({ name: cNameById[cid]||'Unknown', total }));

    const card = (label, val, color) => `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px 14px;min-width:140px">
        <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;font-weight:600">${label}</div>
        <div style="font-size:22px;font-weight:700;color:${color||'var(--text)'};margin-top:4px">${val}</div>
      </div>`;

    const topHTML = top3.length
      ? `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px 14px;flex:1;min-width:260px">
          <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:6px">Top 3 Clients (All Time)</div>
          ${top3.map((p,i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px">
              <span style="color:var(--text)"><strong style="color:var(--accent)">#${i+1}</strong> ${p.name}</span>
              <span style="color:var(--text);font-weight:700">€${Math.round(p.total).toLocaleString()}</span>
            </div>`).join('')}
        </div>`
      : '';

    el.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${card('Active Clients', activeClients)}
        ${card('Active Orders', activeOrders, activeOrders>0?'var(--accent)':'var(--text-dim)')}
        ${card('This Month', '€'+Math.round(monthRev).toLocaleString(), 'var(--success)')}
        ${topHTML}
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:11px">Stats error: ${e.message}</div>`;
  }
}

function entitySortToggle(entityKey, colIdx) {
  if (!_entitySort[entityKey]) _entitySort[entityKey] = { col: null, dir: 0 };
  const s = _entitySort[entityKey];
  if (s.col === colIdx) {
    s.dir = (s.dir + 1) % 3;
    if (s.dir === 0) s.col = null;
  } else {
    s.col = colIdx;
    s.dir = 1;
  }
  applyEntityFilters(entityKey);
}

function _entitySortRecords(entityKey, recs) {
  const s = _entitySort[entityKey];
  if (!s || s.col === null || s.dir === 0) return recs;
  const cfg = ENTITY_CONFIG[entityKey];
  const col = cfg.columns[s.col];
  if (!col) return recs;
  const dir = s.dir === 1 ? 1 : -1;
  // H13 fix: explicit handlers for new column types so sorting matches display order
  const isNum = col.type === 'number' || col.type === 'currency'
                || col.field.match(/Year|Salary|Tank|Weight|Capacity|Pallets|Lt|kg|HP/i);
  const isDate = col.type === 'expiry' || col.type === 'date_rel'
                 || col.field.match(/Date|Expiry/i);
  const isCompliance = col.type === 'compliance';
  return [...recs].sort((a, b) => {
    let va = a.fields[col.field], vb = b.fields[col.field];
    if (va == null) va = ''; if (vb == null) vb = '';
    if (isNum) return ((parseFloat(va)||0) - (parseFloat(vb)||0)) * dir;
    if (isDate) {
      // For date_rel and expiry, sort by underlying timestamp (not display string).
      // Fallbacks: empty string → epoch 0 (sorts to oldest in ascending).
      const ta = va ? new Date(va).getTime() : 0;
      const tb = vb ? new Date(vb).getTime() : 0;
      return ((isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb)) * dir;
    }
    if (isCompliance) {
      // Sort by worst expiry status across all doc fields in the compliance column.
      // 0 = expired (worst), 1 = expiring <30d, 2 = ok, 3 = missing.
      const scoreOf = r => {
        let worst = 3;
        (col.fields || []).forEach(fc => {
          const d = r.fields[fc.field];
          if (!d) return;
          const days = Math.ceil((new Date(d) - new Date()) / 86400000);
          const s = days < 0 ? 0 : days < 30 ? 1 : 2;
          if (s < worst) worst = s;
        });
        return worst;
      };
      return (scoreOf(a) - scoreOf(b)) * dir;
    }
    if (col.type === 'active') { va = va ? 'Active' : 'Inactive'; vb = vb ? 'Active' : 'Inactive'; }
    return String(va).toLowerCase().localeCompare(String(vb).toLowerCase()) * dir;
  });
}

function buildEntityTable(entityKey, records) {
  const cfg = ENTITY_CONFIG[entityKey];
  const cols = cfg.columns;
  const s = _entitySort[entityKey] || { col: null, dir: 0 };
  const sortedRecs = _entitySortRecords(entityKey, records);
  const ths = cols.map((c, i) => {
    const arrow = s.col===i ? (s.dir===1?' <span style="color:var(--accent)">▲</span>':s.dir===2?' <span style="color:var(--accent)">▼</span>':'') : '';
    return `<th style="cursor:pointer;user-select:none" onclick="entitySortToggle('${entityKey}',${i})">${c.label}${arrow}</th>`;
  }).join('');
  return `<table>
    <thead><tr>${ths}<th></th></tr></thead>
    <tbody>
      ${sortedRecs.length === 0
        ? `<tr><td colspan="${cols.length+1}" style="padding:0">${typeof showEmpty === 'function' ? showEmpty({
            illustration: entityKey === 'trucks' ? 'truck' : entityKey === 'trailers' ? 'truck' : 'inbox',
            title: `No ${cfg.label.toLowerCase()} found`,
            description: `Try adjusting filters or create a new ${cfg.labelSingle.toLowerCase()}`,
          }) : '<div style="text-align:center;padding:40px;color:var(--text-dim)">No records found</div>'}</td></tr>`
        : sortedRecs.slice(0, 200).map(r => buildEntityRow(entityKey, r, cols)).join('')
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
    if (col.type === 'compliance') {
      // Show KT/KK/INS or KT/FRC/INS mini-blocks based on multiple expiry fields
      const blocks = (col.fields || []).map(fc => {
        const d = f[fc.field];
        if (!d) return `<span class="md-comp-block none">${fc.label}</span>`;
        const days = Math.ceil((new Date(d) - new Date()) / 86400000);
        const cls = days < 0 ? 'expired' : days < 30 ? 'warn' : 'ok';
        return `<span class="md-comp-block ${cls}" title="${fc.label} · ${d}${days < 0 ? ' (expired ' + Math.abs(days) + 'd ago)' : ' (' + days + 'd left)'}">${fc.label}</span>`;
      }).join('');
      return `<td style="white-space:nowrap"><div style="display:inline-flex;gap:3px">${blocks}</div></td>`;
    }
    if (col.type === 'temp_range') {
      // Display min/max temp range compactly
      const min = f['Temp Range Min °C'];
      const max = f['Temp Range Max °C'];
      if (min == null && max == null) return '<td style="color:var(--text-dim)">—</td>';
      return `<td style="white-space:nowrap;font-family:'DM Sans',monospace;font-size:11px;color:var(--text-mid)">${min != null ? min : '?'}°/${max != null ? max : '?'}°</td>`;
    }
    if (col.type === 'city') {
      // City with map pin icon prefix
      if (!val) return '<td style="color:var(--text-dim)">—</td>';
      const pin = (typeof icon === 'function') ? icon('map_pin', 12) : '';
      return `<td><span style="display:inline-flex;align-items:center;gap:4px;color:var(--text-mid)">${pin}${val}</span></td>`;
    }
    if (col.type === 'currency') {
      if (val == null || val === 0) return '<td style="color:var(--text-dim);font-variant-numeric:tabular-nums">€0</td>';
      return `<td style="font-variant-numeric:tabular-nums;font-weight:600">€${Math.round(val).toLocaleString()}</td>`;
    }
    if (col.type === 'date_rel') {
      if (!val) return '<td style="color:var(--text-dim);font-size:11px">Never</td>';
      const days = Math.floor((Date.now() - new Date(val).getTime()) / 86400000);
      const label = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 30 ? `${days}d ago` : days < 365 ? `${Math.round(days/30)}mo ago` : `${Math.round(days/365)}y ago`;
      const color = days < 30 ? 'var(--success)' : days < 90 ? 'var(--text-mid)' : 'var(--text-dim)';
      return `<td style="color:${color};font-size:11px;white-space:nowrap" title="${val}">${label}</td>`;
    }
    if (col.type === 'number' && val != null) {
      return `<td style="font-variant-numeric:tabular-nums;text-align:right">${val}</td>`;
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
    if (field === '_compliance') {
      // Compliance filter: check expiry dates from the compliance column config
      const complianceCol = cfg.columns.find(c => c.type === 'compliance');
      if (!complianceCol) continue;
      recs = recs.filter(r => {
        const statuses = complianceCol.fields.map(fc => {
          const d = r.fields[fc.field];
          if (!d) return 'none';
          const days = Math.ceil((new Date(d) - new Date()) / 86400000);
          return days < 0 ? 'expired' : days < 30 ? 'expiring' : 'ok';
        });
        if (val === 'expired')  return statuses.includes('expired');
        if (val === 'expiring') return statuses.includes('expiring') && !statuses.includes('expired');
        if (val === 'ok')       return statuses.every(s => s === 'ok' || s === 'none');
        return true;
      });
    } else if (type === 'bool') {
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
      ${cfg.history ? `<div class="detail-section">
        <div class="detail-section-title">${cfg.history.type==='partner'?'Assignments & Performance':cfg.history.type==='client'?'Orders & Performance':'Order History'}</div>
        <div id="entity_history_${recId}" style="font-size:11px;color:var(--text-dim)">Loading...</div>
      </div>` : ''}
    </div>`;

  // Load order history async
  if (cfg.history) _loadEntityHistory(cfg.history.type, recId, title);
}

// ── Order History for Clients & Partners ─────────
async function _loadEntityHistory(type, recId, name) {
  const el = document.getElementById('entity_history_' + recId);
  if (!el) return;
  try {
    let orders = [];
    if (type === 'client') {
      // Client linked in ORDERS + NAT_ORDERS tables
      const filter = `FIND("${recId}", ARRAYJOIN({Client}, ","))>0`;
      const [intl, natl] = await Promise.all([
        atGetAll(TABLES.ORDERS,     { filterByFormula: filter, fields: ['Direction','Loading Summary','Delivery Summary','Status','Total Pallets','Loading DateTime','Price','Delivery Performance'] }, false),
        atGetAll(TABLES.NAT_ORDERS, { filterByFormula: filter, fields: ['Direction','Pickup Location 1','Delivery Location 1','Status','Pallets','Loading DateTime','Price','Delivery Performance'] }, false),
      ]);
      orders = [
        ...intl.map(r => ({ type:'INTL', dir:r.fields['Direction']||'—', route:`${(r.fields['Loading Summary']||'').slice(0,20)} → ${(r.fields['Delivery Summary']||'').slice(0,20)}`, status:r.fields['Status']||'—', pals:r.fields['Total Pallets']||0, date:(r.fields['Loading DateTime']||'').substring(0,10), price:parseFloat(r.fields['Price'])||0, perf:r.fields['Delivery Performance']||'' })),
        ...natl.map(r => ({ type:'NATL', dir:r.fields['Direction']||'—', route:`${getLocationName(getLinkedId(r.fields['Pickup Location 1']))||'—'} → ${getLocationName(getLinkedId(r.fields['Delivery Location 1']))||'—'}`, status:r.fields['Status']||'—', pals:r.fields['Pallets']||0, date:toLocalDate(r.fields['Loading DateTime']), price:parseFloat(r.fields['Price'])||0, perf:r.fields['Delivery Performance']||'' })),
      ];
      _renderClientOrders(el, orders);
      return;
    } else if (type === 'partner') {
      // Partner assignments via PARTNER_ASSIGN table (unified INTL + NAT)
      const paRecs = await paListByPartner(recId);
      _renderPartnerAssignments(el, paRecs);
      return;
    }
    orders.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    if (!orders.length) {
      el.innerHTML = '<div style="color:var(--text-dim);padding:8px 0;font-size:11px">No orders found</div>';
      return;
    }
    el.innerHTML = `
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">${orders.length} orders</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Date</th>
          <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Type</th>
          <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Route</th>
          <th style="text-align:center;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Pal</th>
          <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Status</th>
        </tr></thead>
        <tbody>${orders.slice(0,30).map(o => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:4px 6px;color:var(--text-mid)">${o.date||'—'}</td>
          <td style="padding:4px 6px"><span style="font-size:9px;font-weight:700;color:${o.type==='INTL'?'var(--accent)':'var(--success)'}">${o.type}</span></td>
          <td style="padding:4px 6px;color:var(--text);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.route}</td>
          <td style="padding:4px 6px;text-align:center;color:var(--text-mid)">${o.pals}</td>
          <td style="padding:4px 6px"><span class="badge ${o.status==='Delivered'?'badge-green':o.status==='Invoiced'?'badge-blue':o.status==='Assigned'?'badge-yellow':'badge-grey'}" style="font-size:9px">${o.status}</span></td>
        </tr>`).join('')}${orders.length>30?`<tr><td colspan="5" style="padding:6px;text-align:center;color:var(--text-dim)">+${orders.length-30} more</td></tr>`:''}</tbody>
      </table>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:11px">Error: ${e.message}</div>`;
  }
}

// ── Partner: render PA metrics cards + assignment history ─────────
function _renderPartnerAssignments(el, paRecs) {
  // Metrics
  const total     = paRecs.length;
  const active    = paRecs.filter(r => ['Assigned','In Transit'].includes(r.fields[F.PA_STATUS]||'')).length;
  const completed = paRecs.filter(r => r.fields[F.PA_STATUS]==='Delivered').length;
  const totalSpent= paRecs.filter(r => r.fields[F.PA_STATUS]==='Delivered')
                          .reduce((s,r)=>s+(parseFloat(r.fields[F.PA_RATE])||0),0);
  const avgRate   = total ? paRecs.reduce((s,r)=>s+(parseFloat(r.fields[F.PA_RATE])||0),0)/total : 0;
  const marginVals= paRecs.map(r=>parseFloat(r.fields['Margin Percent'])).filter(n=>!isNaN(n));
  const avgMargin = marginVals.length ? marginVals.reduce((s,v)=>s+v,0)/marginVals.length : 0;

  const card = (label,val,color) => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:8px">
      <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px">${label}</div>
      <div style="font-size:15px;font-weight:700;color:${color||'var(--text)'};margin-top:2px">${val}</div>
    </div>`;

  const metricsHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px">
      ${card('Total', total)}
      ${card('Active', active, active>0?'var(--accent)':'var(--text-dim)')}
      ${card('Completed', completed, 'var(--success)')}
      ${card('Total Spent', '€'+Math.round(totalSpent).toLocaleString())}
      ${card('Avg Rate', '€'+Math.round(avgRate).toLocaleString())}
      ${card('Avg Margin', avgMargin.toFixed(1)+'%', avgMargin>=20?'var(--success)':avgMargin>=10?'var(--warning)':avgMargin>0?'var(--danger)':'var(--text-dim)')}
    </div>`;

  if (!paRecs.length) {
    el.innerHTML = metricsHTML + '<div style="color:var(--text-dim);padding:8px 0;font-size:11px">No assignments yet</div>';
    return;
  }

  // Sort by assignment date desc
  paRecs.sort((a,b)=>(b.fields[F.PA_ASSIGN_DATE]||'').localeCompare(a.fields[F.PA_ASSIGN_DATE]||''));

  const rowsHTML = paRecs.slice(0,30).map(r => {
    const f      = r.fields;
    const date   = (f[F.PA_ASSIGN_DATE]||'').substring(0,10);
    const rate   = parseFloat(f[F.PA_RATE])||0;
    const rev    = parseFloat(f['Client Revenue'])||0;
    const margin = parseFloat(f['Margin Percent']);
    const status = f[F.PA_STATUS]||'—';
    const isOrder= Array.isArray(f[F.PA_ORDER]) && f[F.PA_ORDER].length;
    const kind   = isOrder ? 'INTL' : 'NAT';
    const kindColor = isOrder ? 'var(--accent)' : 'var(--success)';
    const marginTxt = isNaN(margin) ? '—' : margin.toFixed(1)+'%';
    const marginColor = isNaN(margin) ? 'var(--text-dim)' : margin>=20?'var(--success)':margin>=10?'var(--warning)':'var(--danger)';
    const badgeCls = status==='Delivered'?'badge-green':status==='In Transit'?'badge-blue':status==='Assigned'?'badge-yellow':'badge-grey';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:4px 6px;color:var(--text-mid)">${date||'—'}</td>
      <td style="padding:4px 6px"><span style="font-size:9px;font-weight:700;color:${kindColor}">${kind}</span></td>
      <td style="padding:4px 6px;text-align:right;color:var(--text);font-weight:600">€${rate.toFixed(0)}</td>
      <td style="padding:4px 6px;text-align:right;color:var(--text-mid)">€${rev.toFixed(0)}</td>
      <td style="padding:4px 6px;text-align:right;color:${marginColor};font-weight:600">${marginTxt}</td>
      <td style="padding:4px 6px"><span class="badge ${badgeCls}" style="font-size:9px">${status}</span></td>
    </tr>`;
  }).join('');

  el.innerHTML = metricsHTML + `
    <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">${paRecs.length} assignments</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Date</th>
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Type</th>
        <th style="text-align:right;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Rate</th>
        <th style="text-align:right;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Revenue</th>
        <th style="text-align:right;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Margin</th>
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Status</th>
      </tr></thead>
      <tbody>${rowsHTML}${paRecs.length>30?`<tr><td colspan="6" style="padding:6px;text-align:center;color:var(--text-dim)">+${paRecs.length-30} more</td></tr>`:''}</tbody>
    </table>`;
}

// ── Client: render metrics cards + order history ─────────
function _renderClientOrders(el, orders) {
  // Metrics
  const total     = orders.length;
  const active    = orders.filter(o => !['Delivered','Invoiced','Cancelled'].includes(o.status)).length;
  const delivered = orders.filter(o => ['Delivered','Invoiced'].includes(o.status));
  const revenue   = delivered.reduce((s,o)=>s+(o.price||0), 0);
  const avgValue  = delivered.length ? revenue/delivered.length : 0;
  const perfVals  = orders.filter(o => o.perf === 'On Time' || o.perf === 'Delayed');
  const onTime    = perfVals.filter(o => o.perf === 'On Time').length;
  const onTimePct = perfVals.length ? (onTime / perfVals.length * 100) : 0;

  const card = (label,val,color) => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:8px">
      <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px">${label}</div>
      <div style="font-size:15px;font-weight:700;color:${color||'var(--text)'};margin-top:2px">${val}</div>
    </div>`;

  const metricsHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px">
      ${card('Total', total)}
      ${card('Active', active, active>0?'var(--accent)':'var(--text-dim)')}
      ${card('Delivered', delivered.length, 'var(--success)')}
      ${card('Revenue', '€'+Math.round(revenue).toLocaleString())}
      ${card('Avg Value', '€'+Math.round(avgValue).toLocaleString())}
      ${card('On-Time', perfVals.length ? onTimePct.toFixed(0)+'%' : '—',
        !perfVals.length ? 'var(--text-dim)' : onTimePct>=90?'var(--success)':onTimePct>=75?'var(--warning)':'var(--danger)')}
    </div>`;

  if (!orders.length) {
    el.innerHTML = metricsHTML + '<div style="color:var(--text-dim);padding:8px 0;font-size:11px">No orders yet</div>';
    return;
  }

  // Sort by date desc
  orders.sort((a,b) => (b.date||'').localeCompare(a.date||''));

  const rowsHTML = orders.slice(0,30).map(o => {
    const kindColor = o.type==='INTL' ? 'var(--accent)' : 'var(--success)';
    const badgeCls  = o.status==='Delivered'?'badge-green':o.status==='Invoiced'?'badge-blue':o.status==='Assigned'?'badge-yellow':o.status==='In Transit'?'badge-blue':'badge-grey';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:4px 6px;color:var(--text-mid)">${o.date||'—'}</td>
      <td style="padding:4px 6px"><span style="font-size:9px;font-weight:700;color:${kindColor}">${o.type}</span></td>
      <td style="padding:4px 6px;color:var(--text);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.route}</td>
      <td style="padding:4px 6px;text-align:center;color:var(--text-mid)">${o.pals}</td>
      <td style="padding:4px 6px;text-align:right;color:var(--text);font-weight:600">${o.price?'€'+Math.round(o.price):'—'}</td>
      <td style="padding:4px 6px"><span class="badge ${badgeCls}" style="font-size:9px">${o.status}</span></td>
    </tr>`;
  }).join('');

  el.innerHTML = metricsHTML + `
    <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">${orders.length} orders</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Date</th>
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Type</th>
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Route</th>
        <th style="text-align:center;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Pal</th>
        <th style="text-align:right;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Price</th>
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Status</th>
      </tr></thead>
      <tbody>${rowsHTML}${orders.length>30?`<tr><td colspan="6" style="padding:6px;text-align:center;color:var(--text-dim)">+${orders.length-30} more</td></tr>`:''}</tbody>
    </table>`;
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
