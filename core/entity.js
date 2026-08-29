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
    searchHint: 'Αναζήτηση: εταιρεία, πόλη, επαφή, ΑΦΜ…',
    filters: [
      { field: 'Country', label: 'Χώρα', type: 'dynamic' },
      { field: 'Active',  label: 'Κατάσταση', type: 'bool', options: [
        { val: '', label: 'Όλα' },
        { val: 'true',  label: 'Ενεργός' },
        { val: 'false', label: 'Ανενεργός' },
      ]},
    ],
    columns: [
      { field: 'Company Name',  label: 'Εταιρεία',  primary: true },
      { field: 'Country',       label: 'Χώρα' },
      { field: 'City',          label: 'Πόλη' },
      { field: 'Contact Person',label: 'Επαφή' },
      { field: 'Phone',         label: 'Τηλέφωνο' },
      { field: 'Active',        label: 'Κατάσταση', type: 'active' },
    ],
    formFields: [
      { section: 'Details', fields: [
        { f: 'Company Name', label: 'Επωνυμία', req: true },
        { f: 'VAT Number',   label: 'ΑΦΜ' },
        { f: 'Country',      label: 'Χώρα' },
        { f: 'City',         label: 'Πόλη' },
        { f: 'Adress',       label: 'Διεύθυνση' },
      ]},
      { section: 'Contact', fields: [
        { f: 'Contact Person',      label: 'Υπεύθυνος επαφής' },
        { f: 'Phone',               label: 'Τηλέφωνο' },
        { f: 'Email',               label: 'Email', type: 'email' },
        { f: 'Payment Terms Days',  label: 'Όροι πληρωμής (ημέρες)', type: 'number' },
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
    searchHint: 'Αναζήτηση: εταιρεία, επαφή, ΑΦΜ…',
    filters: [
      { field: 'Country', label: 'Χώρα', type: 'dynamic' },
      { field: 'Active',  label: 'Κατάσταση', type: 'bool', options: [
        { val: '', label: 'Όλα' },
        { val: 'true',  label: 'Ενεργός' },
        { val: 'false', label: 'Ανενεργός' },
      ]},
    ],
    columns: [
      { field: 'Company Name',  label: 'Εταιρεία',  primary: true },
      { field: 'Country',       label: 'Χώρα' },
      { field: 'Contact Person',label: 'Επαφή' },
      { field: 'Phone',         label: 'Τηλέφωνο' },
      { field: 'Email',         label: 'Email' },
      { field: 'Active',        label: 'Κατάσταση', type: 'active' },
    ],
    formFields: [
      { section: 'Details', fields: [
        { f: 'Company Name', label: 'Επωνυμία', req: true },
        { f: 'VAT Number',   label: 'ΑΦΜ' },
        { f: 'Country',      label: 'Χώρα' },
        { f: 'Adress',       label: 'Διεύθυνση' },
      ]},
      { section: 'Contact', fields: [
        { f: 'Contact Person', label: 'Υπεύθυνος επαφής' },
        { f: 'Phone',          label: 'Τηλέφωνο' },
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
    searchHint: 'Αναζήτηση: όνομα, αρ. διπλώματος…',
    filters: [
      { field: 'Type', label: 'Τύπος', type: 'select', options: [
        { val: '', label: 'Όλα' },
        { val: 'Internal', label: 'Εσωτερικός' },
        { val: 'External', label: 'Εξωτερικός' },
      ]},
      { field: 'Active', label: 'Κατάσταση', type: 'bool', options: [
        { val: '', label: 'Όλα' },
        { val: 'true',  label: 'Ενεργός' },
        { val: 'false', label: 'Ανενεργός' },
      ]},
    ],
    columns: [
      { field: 'Full Name',      label: 'Οδηγός', primary: true },
      { field: 'Phone',          label: 'Τηλέφωνο' },
      { field: 'Type',           label: 'Τύπος' },
      { field: 'Salary Base',    label: 'Μισθός', perm: 'full' },   // DV-3: μισθοδοσία — μόνο με δικαίωμα εγγραφής
      { field: 'License Number', label: 'Αρ. διπλώματος' },
      { field: 'License Expiry', label: 'Δίπλωμα έως', type: 'expiry' },
      { field: 'Active',         label: 'Κατάσταση', type: 'active' },
    ],
    formFields: [
      { section: 'Details', fields: [
        { f: 'Full Name',   label: 'Ονοματεπώνυμο', req: true },
        { f: 'Phone',       label: 'Τηλέφωνο' },
        { f: 'Type',        label: 'Τύπος', type: 'select', options: ['Internal','External'] },
        { f: 'Salary Base', label: 'Βασικός μισθός', type: 'number' },
      ]},
      { section: 'Driving Licence', fields: [
        { f: 'License Number', label: 'Αρ. διπλώματος' },
        { f: 'License Expiry', label: 'Δίπλωμα έως', type: 'date' },
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
    searchFields: ['License Plate', 'VIN', 'Brand', 'Model', 'Insurance Partner'],
    searchHint: 'Αναζήτηση: πινακίδα, VIN, μάρκα…',
    filters: [
      { field: 'Brand',  label: 'Μάρκα',  type: 'dynamic' },
      { field: 'Active', label: 'Κατάσταση', type: 'bool', options: [
        { val: '', label: 'Όλα' },
        { val: 'true',  label: 'Ενεργός' },
        { val: 'false', label: 'Ανενεργός' },
      ]},
      { field: '_compliance', label: 'Έγγραφα', type: 'select', options: [
        { val: '', label: 'Όλα' },
        { val: 'expired',  label: 'Με ληγμένο' },
        { val: 'expiring', label: 'Λήγει <30 ημ.' },
        { val: 'ok',       label: 'Όλα εντάξει' },
      ]},
    ],
    columns: [
      { field: 'License Plate',       label: 'Πινακίδα', primary: true },
      { field: 'Brand',               label: 'Μάρκα' },
      { field: 'Model',               label: 'Μοντέλο' },
      { field: 'Year',                label: 'Έτος', type: 'number' },
      { field: 'Euro Standard',       label: 'Euro' },
      { field: 'Tare Weight kg',      label: 'Απόβαρο', type: 'number', unit: 'kg' },
      { field: 'VIN',                 label: 'VIN' },
      { field: 'Active',              label: 'Κατάσταση', type: 'active' },
    ],
    formFields: [
      { section: 'Ταυτότητα', fields: [
        { f: 'License Plate', label: 'Πινακίδα', req: true },
        { f: 'VIN',           label: 'Αριθμός πλαισίου (VIN)' },
        { f: 'Brand',         label: 'Μάρκα' },
        { f: 'Model',         label: 'Μοντέλο' },
        { f: 'Year',          label: 'Έτος (1η ταξινόμηση)', type: 'number' },
        { f: 'Euro Standard', label: 'Euro', type: 'select', options: ['Euro 3','Euro 4','Euro 5','Euro 6'] },
        { f: 'Tare Weight kg', label: 'Απόβαρο', type: 'number', unit: 'kg' },
      ]},
      { section: 'Έγγραφα', fields: [
        { f: 'KTEO Expiry',       label: 'ΚΤΕΟ έως',     type: 'date' },
        { f: 'KEK Expiry',        label: 'ΚΕΚ έως',      type: 'date' },
        { f: 'Insurance Expiry',  label: 'Ασφάλεια έως', type: 'date' },
        { f: 'Insurance Partner', label: 'Ασφαλιστής' },
        { f: 'Notes',             label: 'Σημειώσεις',   type: 'textarea' },
      ]},
    ],
    detailSections: [
      { title: 'Ταυτότητα', fields: ['License Plate','VIN','Brand','Model','Year','Euro Standard','Tare Weight kg'] },
      { title: 'Έγγραφα',   fields: ['KTEO Expiry','KEK Expiry','Insurance Expiry','Insurance Partner','Notes'] },
    ],
  },

  trailers: {
    tableId: TABLES.TRAILERS,
    label: 'Trailers',
    labelSingle: 'Trailer',
    perm: 'maintenance',
    searchFields: ['License Plate', 'VIN', 'Brand', 'Model', 'Trailer Type'],
    searchHint: 'Αναζήτηση: πινακίδα, VIN, τύπος…',
    filters: [
      { field: 'Trailer Type', label: 'Τύπος',   type: 'dynamic' },
      { field: 'Active',       label: 'Κατάσταση', type: 'bool', options: [
        { val: '', label: 'Όλα' },
        { val: 'true',  label: 'Ενεργός' },
        { val: 'false', label: 'Ανενεργός' },
      ]},
      { field: '_compliance', label: 'Έγγραφα', type: 'select', options: [
        { val: '', label: 'Όλα' },
        { val: 'expired',  label: 'Με ληγμένο' },
        { val: 'expiring', label: 'Λήγει <30 ημ.' },
        { val: 'ok',       label: 'Όλα εντάξει' },
      ]},
    ],
    columns: [
      { field: 'License Plate',           label: 'Πινακίδα',  primary: true },
      { field: 'Brand',                   label: 'Μάρκα' },
      { field: 'Model',                   label: 'Μοντέλο' },
      { field: 'Year',                    label: 'Έτος', type: 'number' },
      { field: 'Trailer Type',            label: 'Τύπος' },
      { field: 'VIN',                     label: 'VIN' },
      { field: 'Tare Weight kg',          label: 'Απόβαρο', type: 'number', unit: 'kg' },
      { field: 'Active',                  label: 'Κατάσταση', type: 'active' },
    ],
    formFields: [
      { section: 'Ταυτότητα', fields: [
        { f: 'License Plate', label: 'Πινακίδα', req: true },
        { f: 'VIN',           label: 'Αριθμός πλαισίου (VIN)' },
        { f: 'Brand',         label: 'Μάρκα' },
        { f: 'Model',         label: 'Μοντέλο' },
        { f: 'Year',          label: 'Έτος (1η ταξινόμηση)', type: 'number' },
        { f: 'Trailer Type',  label: 'Τύπος', type: 'select', options: ['Reefer','Curtainsider','Box','Flatbed','Tanker','Ρυμούλκα'] },
        { f: 'Tare Weight kg', label: 'Απόβαρο', type: 'number', unit: 'kg' },
      ]},
      { section: 'Έγγραφα', fields: [
        { f: 'KTEO Expiry',      label: 'ΚΤΕΟ έως',     type: 'date' },
        { f: 'FRC Expiry',       label: 'ATP/FRC έως',  type: 'date' },
        { f: 'Insurance Expiry', label: 'Ασφάλεια έως', type: 'date' },
        { f: 'Notes',            label: 'Σημειώσεις',   type: 'textarea' },
      ]},
    ],
    detailSections: [
      { title: 'Ταυτότητα', fields: ['License Plate','VIN','Brand','Model','Year','Trailer Type','Tare Weight kg'] },
      { title: 'Έγγραφα',   fields: ['KTEO Expiry','FRC Expiry','Insurance Expiry','Notes'] },
    ],
  },

  workshops: {
    tableId: TABLES.WORKSHOPS,
    label: 'Workshops',
    labelSingle: 'Workshop',
    perm: 'maintenance',
    // Aliases/Notes είναι αναζητήσιμα επίτηδες: το import της 6-8-2026 έγραψε εκεί τις
    // 107 παλιές γραφές του Excel («ΣΑΡΑΚΑΚΗ», «SOULIS»…), οπότε αναζήτηση με το όνομα
    // που θυμάται ο χρήστης βρίσκει το συνεργείο ακόμη κι αν καταχωρήθηκε αλλιώς.
    searchFields: ['Name', 'City', 'Contact Person', 'Specialty', 'Aliases', 'Notes', 'Phone', 'VAT Number'],
    searchHint: 'Αναζήτηση: όνομα, παλιά γραφή, πόλη, ειδικότητα, ΑΦΜ, τηλέφωνο…',
    filters: [
      { field: 'Specialty', label: 'Ειδικότητα', type: 'dynamic' },
      { field: 'Country',   label: 'Χώρα',       type: 'dynamic' },
      { field: 'City',      label: 'Πόλη',       type: 'dynamic' },
      { field: 'Active',    label: 'Κατάσταση',    type: 'bool', options: [
        { val: '', label: 'Όλα' },
        { val: 'true',  label: 'Ενεργός' },
        { val: 'false', label: 'Ανενεργός' },
      ]},
    ],
    columns: [
      { field: 'Name',           label: 'Όνομα',      primary: true },
      { field: 'City',           label: 'Πόλη', type: 'city' },
      { field: 'Specialty',      label: 'Ειδικότητα' },
      { field: 'Phone',          label: 'Τηλέφωνο' },
      { field: '_serviceCount',  label: 'Εργασίες', type: 'number' },
      { field: '_totalSpend',    label: 'Δαπάνη',    type: 'currency' },
      { field: '_lastUsed',      label: 'Τελευταία χρήση', type: 'date_rel' },
      { field: 'Active',         label: 'Κατάσταση', type: 'active' },
    ],
    formFields: [
      { section: 'Details', fields: [
        { f: 'Name',           label: 'Επωνυμία', req: true },
        // Ίδιες ακριβώς τιμές με όσες έγραψε το import — αλλιώς κάθε επεξεργασία
        // συνεργείου θα δημιουργούσε νέα, παράλληλη ειδικότητα και το φίλτρο θα
        // γέμιζε διπλές κατηγορίες (αγγλικές από τη φόρμα, ελληνικές από τα δεδομένα).
        { f: 'Specialty',      label: 'Ειδικότητα', type: 'select', options: ['Σέρβις','Ελαστικά','Φρένα/ανάρτηση','Ψύξη','Κινητήρας','Ηλεκτρικά','Αμάξωμα','Πέταλο/κοτσαδούρα','Έλεγχοι'] },
        { f: 'Phone',          label: 'Τηλέφωνο' },
        { f: 'Email',          label: 'Email' },
        { f: 'Contact Person', label: 'Υπεύθυνος επαφής' },
      ]},
      { section: 'Location', fields: [
        // PARTNERS + CLIENTS use 'Adress' (typo, single 'd'). WORKSHOPS is
        // assumed to use correctly-spelled 'Address' per current Airtable schema.
        // If a 422 'Unknown field name: Address' appears for WORKSHOPS, change here.
        { f: 'Address',        label: 'Διεύθυνση' },
        { f: 'City',           label: 'Πόλη' },
      ]},
      { section: 'Notes', fields: [
        { f: 'Notes',          label: 'Σημειώσεις', type: 'textarea' },
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
  c.innerHTML = showLoading();

  const records = await atGet(cfg.tableId);

  _entityState[entityKey] = { records, filtered: records, selected: null, q: '', filters: {} };

  // Report the row count for every master-data page in one place. This is where
  // "36 trucks" comes from, while the Dashboard and Maintenance both say 27 —
  // they count only Active. Nothing on screen says so, which is why the audit
  // read it as a third fleet total. Reporting both numbers lets the audit state
  // the reason instead of flagging a fault.
  // See docs/design/DEEP_AUDIT_2026-08-04/trucks.md TR-3.
  if (typeof reportPageMetrics === 'function') {
    const hasActive = records.some(r => 'Active' in (r.fields || {}));
    reportPageMetrics(entityKey, Object.assign(
      { total: records.length },
      hasActive ? { active: records.filter(r => r.fields['Active']).length } : {}
    ));
  }

  // Build dynamic filter options
  const dynamicOpts = {};
  for (const fi of cfg.filters) {
    if (fi.type === 'dynamic') {
      // CL-1/PA-1: το φίλτρο χώρας πρόσφερε GR · GREECE · ΕΛΛΑΔΑ ως τρεις
      // ΞΕΧΩΡΙΣΤΕΣ επιλογές, οπότε όποιος διάλεγε «GR» έχανε σιωπηλά τους
      // άλλους δύο. Οι επιλογές ομαδοποιούνται πλέον στην κανονική μορφή· η
      // τιμή της εγγραφής μένει ανέγγιχτη.
      const _isCountry = /country|χωρα|χώρα/i.test(fi.field) || /country/i.test(fi.label || '');
      dynamicOpts[fi.field] = [...new Set(records
        .map(r => _isCountry && typeof normalizeCountry === 'function'
          ? normalizeCountry(r.fields[fi.field]) : r.fields[fi.field])
        .filter(Boolean))].sort();
      if (_isCountry) dynamicOpts['__norm__' + fi.field] = true;
    }
  }

  const canEdit = can(cfg.perm) === 'full';

  const _i = n => (typeof icon === 'function') ? icon(n, 16) : '';
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:var(--space-4)">
      <div>
        <div class="page-title">${cfg.label}</div>
        <div class="page-sub" id="${entityKey}_sub">${records.length} ${records.length===1?'εγγραφή':'εγγραφές'}</div>
      </div>
      ${canEdit ? `
      <button class="btn btn-primary btn-sm" onclick="openEntityCreate('${entityKey}')">
        ${_i('plus')}
        Νέα εγγραφή
      </button>` : ''}
    </div>

    ${(entityKey === 'partners' || entityKey === 'clients' || entityKey === 'workshops' || entityKey === 'drivers' || entityKey === 'trucks' || entityKey === 'trailers') ? `<div id="${entityKey}_stats_strip" style="margin-bottom:var(--space-4)"></div>` : ''}

    <div class="entity-layout">
      <div class="entity-list-panel">
        <div class="entity-toolbar-v2">
          <div class="entity-search-wrap">
            ${_i('search')}
            <input class="entity-search-input" placeholder="${cfg.searchHint || 'Αναζήτηση…'}"
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
                <option value="">${fi.label}: Όλα</option>
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
  // DV-5/TR-5/TL-5: ο στόλος είχε μηδέν KPI ενώ Clients/Partners είχαν τρία.
  if (entityKey === 'drivers' || entityKey === 'trucks' || entityKey === 'trailers')
    _renderFleetStatsStrip(entityKey, records);
}

// ── Fleet stats strips (DV-5, TR-5, TL-5) ─────────────────
// Purely from the records already fetched for the table — no extra requests.
// «Λήξεις» counts vehicles/drivers with at least one EXPIRED document, and
// «<30 ημ.» those whose nearest expiry lands inside the next month.
function _renderFleetStatsStrip(entityKey, records) {
  const el = document.getElementById(entityKey + '_stats_strip');
  if (!el) return;
  const EXP = entityKey === 'drivers' ? ['License Expiry']
            : entityKey === 'trucks'  ? ['KTEO Expiry','KEK Expiry','Insurance Expiry']
            : ['KTEO Expiry','FRC Expiry','Insurance Expiry'];
  const now = Date.now();
  let expired = 0, soon = 0;
  for (const r of records) {
    const days = EXP.map(f => r.fields[f]).filter(Boolean)
      .map(v => Math.floor((new Date(v).getTime() - now) / 86400000));
    if (!days.length) continue;
    if (days.some(d => d < 0)) expired++;
    else if (days.some(d => d <= 30)) soon++;
  }
  const active = records.filter(r => r.fields['Active']).length;
  const card = (label, val, color) => {
    const valColor = (!color || color === 'var(--text)') ? 'var(--text-inverse)' : color;
    return `<div class="tms-stat-card" style="min-width:140px;flex:0 0 auto">
      <div class="tms-stat-label">${label}</div>
      <div class="tms-stat-value" style="color:${valColor};font-variant-numeric:tabular-nums">${val}</div>
    </div>`;
  };
  el.innerHTML = `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:var(--space-4)">
    ${card('Σύνολο', records.length)}
    ${card(entityKey === 'drivers' ? 'Ενεργοί' : 'Ενεργά', active, active ? 'var(--panel-ok)' : 'var(--panel-dim)')}
    ${card(entityKey === 'drivers' ? 'Ληγμένο δίπλωμα' : 'Με ληγμένο έγγραφο', expired, expired ? 'var(--panel-bad-hi)' : 'var(--panel-ok)')}
    ${card('Λήγει <30 ημ.', soon, soon ? 'var(--panel-warn)' : 'var(--panel-dim)')}
  </div>`;
}

// ── Workshops stats strip ─────────────────────────
async function _renderWorkshopsStatsStrip(workshops) {
  const el = document.getElementById('workshops_stats_strip');
  if (!el) return;
  try {
    // C1 fix: removed 'Total Cost' from fields[] — it's not in MAINT_HISTORY schema (422 error).
    // Code below still reads r.fields['Total Cost'] as a safety fallback in case it's added later.
    // safeFetch: this feeds the workshops stats strip, which totals SPEND. A
    // swallowed error rendered "€0 total, €0 this month" for every workshop,
    // which is a plausible figure and therefore believable, rather than an
    // obvious failure. Same shape as the pallet balance fixed in an earlier
    // batch: a money number must not report an unknown as a zero.
    const history = await safeFetch(
      () => atGetAll(TABLES.MAINT_HISTORY, { fields: ['Workshop','Cost','Date'] }, true),
      'workshops: maintenance history'
    );
    if (didFail(history)) {
      el.innerHTML = '<div style="padding:8px 0;color:var(--warning);font-size:12px">⚠ Τα στοιχεία συντήρησης δεν φόρτωσαν, τα σύνολα δεν εμφανίζονται.</div>';
      return;
    }
    const activeWs = workshops.filter(w => w.fields['Active']).length;
    const totalSpend = history.reduce((s, r) => s + (parseFloat(r.fields['Cost']) || parseFloat(r.fields['Total Cost']) || 0), 0);
    // CL-3: toISOString() is UTC — before 02:00/03:00 local on the 1st of the
    // month it still returns LAST month, so «THIS MONTH» went silently wrong.
    // toLocalDate() (utils) formats in local time; slice keeps YYYY-MM.
    const yyyymm = toLocalDate(new Date()).slice(0, 7);
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

    // Use unified .tms-stat-card (dark navy). Map black text-color to white so values stay readable.
    const card = (label, val, color) => {
      const valColor = (!color || color === 'var(--text)') ? 'var(--text-inverse)' : color;
      return `<div class="tms-stat-card" style="min-width:140px;flex:0 0 auto">
        <div class="tms-stat-label">${label}</div>
        <div class="tms-stat-value" style="color:${valColor};font-variant-numeric:tabular-nums">${val}</div>
      </div>`;
    };
    const topHTML = top3.length
      ? `<div class="tms-stat-card" style="flex:1;min-width:260px">
          <div class="tms-stat-label" style="margin-bottom:6px">Top 3 Συνεργεία (σύνολο)</div>
          ${top3.map((p, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px">
              <span style="color:rgba(255,255,255,0.85)"><strong style="color:var(--panel-accent)">#${i+1}</strong> ${escapeHtml(p.name)}</span>
              <span style="color:var(--text-inverse);font-weight:700;font-variant-numeric:tabular-nums">€${Math.round(p.total).toLocaleString()}</span>
            </div>`).join('')}
        </div>`
      : '';

    el.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${card('Ενεργά Συνεργεία', activeWs)}
        ${card('Εργασίες (σύνολο)', history.length.toLocaleString(), 'var(--accent)')}
        ${card('Συνολική Δαπάνη', '€' + Math.round(totalSpend).toLocaleString(), 'var(--text)')}
        ${card('Τρέχων Μήνας', '€' + Math.round(monthSpend).toLocaleString(), monthSpend > 0 ? 'var(--warning)' : 'var(--text-dim)')}
        ${topHTML}
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:11px">Stats unavailable</div>`;
    if (typeof logError === 'function') logError(e, 'entity stats widget');
  }
}

// ── Partners top stats strip ──────────────────────
async function _renderPartnersStatsStrip(partners) {
  const el = document.getElementById('partners_stats_strip');
  if (!el) return;
  try {
    const allPA = await atGetAll(TABLES.PARTNER_ASSIGN, {
      // Margin Percent / Client Revenue: διαβάζονται στα :1179 και :1210-1211 αλλά
      // δεν ζητιούνταν — άρα μέσο περιθώριο και έσοδα έβγαιναν μόνιμα 0 (audit 25/8).
      fields: [F.PA_PARTNER, F.PA_STATUS, F.PA_RATE, F.PA_ASSIGN_DATE,
               'Margin Percent', 'Client Revenue'],
    }, false);

    const activePartners = partners.filter(p => p.fields['Active']).length;
    const activeAssign   = allPA.filter(r => ['Assigned','In Transit'].includes(r.fields[F.PA_STATUS]||'')).length;

    // This-month spend
    const now = new Date();
    const yyyymm = toLocalDate(now).slice(0, 7); // CL-3: local month, not UTC
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

    const card = (label, val, color) => {
      const valColor = (!color || color === 'var(--text)') ? 'var(--text-inverse)' : color;
      return `<div class="tms-stat-card" style="min-width:140px;flex:0 0 auto">
        <div class="tms-stat-label">${label}</div>
        <div class="tms-stat-value" style="color:${valColor}">${val}</div>
      </div>`;
    };

    const topHTML = top3.length
      ? `<div class="tms-stat-card" style="flex:1;min-width:260px">
          <div class="tms-stat-label" style="margin-bottom:6px">Top 3 Συνεργάτες (All Time)</div>
          ${top3.map((p,i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px">
              <span style="color:rgba(255,255,255,0.85)"><strong style="color:var(--panel-accent)">#${i+1}</strong> ${p.name}</span>
              <span style="color:var(--text-inverse);font-weight:700">€${Math.round(p.total).toLocaleString()}</span>
            </div>`).join('')}
        </div>`
      : '';

    el.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${card('Ενεργοί Συνεργάτες', activePartners)}
        ${card('Ενεργές Αναθέσεις', activeAssign, activeAssign>0?'var(--accent)':'var(--text-dim)')}
        ${card('Τρέχων Μήνας', '€'+Math.round(monthSpend).toLocaleString(), 'var(--success)')}
        ${topHTML}
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:11px">Stats unavailable</div>`;
    if (typeof logError === 'function') logError(e, 'entity stats widget');
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

    const yyyymm = toLocalDate(new Date()).slice(0, 7); // CL-3: local month, not UTC
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

    const card = (label, val, color) => {
      const valColor = (!color || color === 'var(--text)') ? 'var(--text-inverse)' : color;
      return `<div class="tms-stat-card" style="min-width:140px;flex:0 0 auto">
        <div class="tms-stat-label">${label}</div>
        <div class="tms-stat-value" style="color:${valColor}">${val}</div>
      </div>`;
    };

    const topHTML = top3.length
      ? `<div class="tms-stat-card" style="flex:1;min-width:260px">
          <div class="tms-stat-label" style="margin-bottom:6px">Top 3 Πελάτες (All Time)</div>
          ${top3.map((p,i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px">
              <span style="color:rgba(255,255,255,0.85)"><strong style="color:var(--panel-accent)">#${i+1}</strong> ${p.name}</span>
              <span style="color:var(--text-inverse);font-weight:700">€${Math.round(p.total).toLocaleString()}</span>
            </div>`).join('')}
        </div>`
      : '';

    el.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${card('Ενεργοί Πελάτες', activeClients)}
        ${card('Ανοιχτές Παραγγελίες', activeOrders, activeOrders>0?'var(--accent)':'var(--text-dim)')}
        ${card('Τρέχων Μήνας', '€'+Math.round(monthRev).toLocaleString(), 'var(--success)')}
        ${topHTML}
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:11px">Stats unavailable</div>`;
    if (typeof logError === 'function') logError(e, 'entity stats widget');
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
  if (!s || s.col === null || s.dir === 0) {
    // DV-4: with no user sort, drivers came back in DB order and the first
    // screen was mostly Inactive people. Active first; DB order within each
    // group (sort() is stable). Only when the user hasn't chosen a column —
    // an explicit sort must keep meaning exactly what they clicked.
    if (entityKey === 'drivers') {
      // The column is LABELLED «Status» but the field is the boolean 'Active'
      // — the first version compared fields['Status'], which doesn't exist,
      // so nothing sorted. Caught live on the dispatcher check (7/8).
      return [...recs].sort((a, b) => (b.fields['Active'] ? 1 : 0) - (a.fields['Active'] ? 1 : 0));
    }
    return recs;
  }
  const cfg = ENTITY_CONFIG[entityKey];
  // ΠΡΕΠΕΙ να είναι η ΙΔΙΑ λίστα με αυτήν που παρήγαγε τις κεφαλίδες: ο δείκτης
  // ταξινόμησης έρχεται από τη θέση στη ΦΙΛΤΡΑΡΙΣΜΕΝΗ λίστα, οπότε αν εδώ
  // διαβαζόταν η πλήρης cfg.columns, μια κρυμμένη στήλη θα μετατόπιζε τους
  // δείκτες και θα ταξινομούσε ΑΛΛΗ στήλη από αυτήν που πάτησε ο χρήστης.
  const col = _entityVisibleCols(cfg)[s.col];
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

/**
 * Empty state for the entity tables, distinguishing two situations the old
 * copy collapsed into one.
 *
 * It used to always say "Try adjusting filters or create a new X". On Workshops
 * — 0 records in the database, no filter active — that sent the user off to
 * fiddle with filters that were not the cause, and hid the real message: the
 * table is empty, and 66 work orders have nowhere to be assigned. An empty
 * result after filtering and an empty table are different problems with
 * different next steps.
 *
 * One change, six pages (clients, partners, workshops, trucks, trailers,
 * drivers). See docs/design/DEEP_AUDIT_2026-08-04/workshops.md WS-2.
 *
 * @param {string} entityKey
 * @param {Object} cfg - ENTITY_CONFIG entry
 * @returns {string} HTML
 */
function _entityEmptyState(entityKey, cfg) {
  const st = _entityState[entityKey] || {};
  const totalUnfiltered = (st.records || []).length;
  const isFiltered = totalUnfiltered > 0;
  const illustration = (entityKey === 'trucks' || entityKey === 'trailers') ? 'truck'
    : isFiltered ? 'search' : 'inbox';

  if (typeof showEmpty !== 'function') {
    return `<div style="text-align:center;padding:40px;color:var(--text-dim)">${
      isFiltered ? 'Καμία εγγραφή με αυτά τα φίλτρα' : 'Δεν υπάρχει καμία εγγραφή ακόμη'}</div>`;
  }

  if (isFiltered) {
    return showEmpty({
      illustration,
      title: 'Καμία εγγραφή με αυτά τα φίλτρα',
      description: `Υπάρχουν ${totalUnfiltered} συνολικά — δοκίμασε να καθαρίσεις την αναζήτηση ή τα φίλτρα.`,
      action: { label: 'Καθαρισμός φίλτρων', onClick: `clearEntityFilters('${entityKey}')` },
    });
  }
  return showEmpty({
    illustration,
    title: 'Δεν υπάρχει καμία εγγραφή ακόμη',
    description: 'Ο πίνακας είναι κενός — δεν φταίνε τα φίλτρα.',
    action: { label: `+ ${cfg.labelSingle}`, onClick: `openEntityCreate('${entityKey}')` },
  });
}

/**
 * Reset search + filters for an entity page. Re-renders through renderEntity so
 * the visible controls are rebuilt from state (line 326 resets q and filters);
 * resetting state alone would leave the inputs showing values that no longer
 * apply. atGet is cached, so this does not necessarily hit the network.
 * Called from the filtered empty state — see _entityEmptyState above.
 * @param {string} entityKey
 */
function clearEntityFilters(entityKey) {
  renderEntity(entityKey);
}

/**
 * Οι στήλες που επιτρέπεται να δει ο τρέχων ρόλος.
 * Μια στήλη με perm:'full' κρύβεται όταν το δικαίωμα του τμήματος είναι μόνο
 * ανάγνωση — DV-3: ο dispatcher (drivers:'view') έβλεπε τον ΜΙΣΘΟ κάθε οδηγού.
 * CLIENT-SIDE ΜΟΝΟ: το πεδίο εξακολουθεί να επιστρέφεται από το backend.
 * @param {Object} cfg - ENTITY_CONFIG entry
 * @returns {Array} ορατές στήλες
 */
// DV-7: display-only τηλέφωνο — τα δεδομένα μένουν όπως γράφτηκαν.
// «+30 693 683 0209» και «6936862513» εμφανίζονται ομοιόμορφα: +30 693 686 2513.
function _fmtPhone(v) {
  if (!v) return v;
  const d = String(v).replace(/[^\d+]/g, '');
  const ten = d.startsWith('+30') ? d.slice(3) : d.startsWith('0030') ? d.slice(4) : d.startsWith('30') && d.length === 12 ? d.slice(2) : d;
  if (/^\d{10}$/.test(ten)) return '+30 ' + ten.slice(0,3) + ' ' + ten.slice(3,6) + ' ' + ten.slice(6);
  return String(v);
}

function _entityVisibleCols(cfg) {
  return cfg.columns.filter(c => !c.perm || can(cfg.perm) === c.perm);
}

function buildEntityTable(entityKey, records) {
  const cfg = ENTITY_CONFIG[entityKey];
  // TR-2/TL-3: δύο πινακίδες που κανονικοποιούνται στην ΙΔΙΑ τιμή είναι σχεδόν
  // σίγουρα η ίδια εγγραφή δύο φορές — ΙΑΒ 1099 και IAB1099. Σημαίνονται ώστε
  // να τις δει άνθρωπος. ΔΕΝ ενώνονται και ΔΕΝ γράφεται τίποτα: η πινακίδα
  // είναι κλειδί σύνδεσης, και μια αυτόματη συγχώνευση θα έσπαγε linked records.
  const _plateField = (cfg.columns.find(c => /plate|πινακ/i.test(c.field || '')) || {}).field;
  const _dupPlates = new Set();
  if (_plateField && typeof normalizePlate === 'function') {
    const seen = new Map();
    records.forEach(r => {
      const n = normalizePlate(r.fields[_plateField]);
      if (!n) return;
      if (seen.has(n)) _dupPlates.add(n); else seen.set(n, r.id);
    });
  }
  // DV-3: ο dispatcher έχει drivers:'view' και έβλεπε τη στήλη ΜΙΣΘΟΣ όλων των
  // οδηγών. Οι στήλες με perm:'full' κρύβονται όταν το δικαίωμα είναι μόνο
  // ανάγνωση. CLIENT-SIDE ΜΟΝΟ — δεν αντικαθιστά server RBAC, το πεδίο
  // εξακολουθεί να έρχεται στην απόκριση.
  const cols = _entityVisibleCols(cfg);
  const s = _entitySort[entityKey] || { col: null, dir: 0 };
  const sortedRecs = _entitySortRecords(entityKey, records);
  const ths = cols.map((c, i) => {
    const arrow = s.col===i ? (s.dir===1?' <span style="color: var(--accent-text)">▲</span>':s.dir===2?' <span style="color: var(--accent-text)">▼</span>':'') : '';
    // Sorting was mouse-only; aria-sort also tells a screen reader the state.
    const ariaSort = s.col===i ? (s.dir===1?'ascending':s.dir===2?'descending':'none') : 'none';
    // Numeric cells render right-aligned (see the 'number' branch in the cell
    // renderer); the header did not, so every numeric column read as misaligned —
    // header hugging the left edge, values far right. Match the cell alignment.
    const alignRight = c.type === 'number' || c.type === 'currency';
    return `<th style="cursor:pointer;user-select:none${alignRight?';text-align:right':''}" aria-sort="${ariaSort}" tabindex="0" role="button"
      onclick="entitySortToggle('${entityKey}',${i})"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();entitySortToggle('${entityKey}',${i})}">${c.label}${arrow}</th>`;
  }).join('');
  // Render cap: 500 rows max to keep DOM responsive. Previously was a silent 200 cap
  // which hid entries in growing tables (clients/partners > 200). Now we render up to
  // 500 and show a visible footer warning if more exist, so users know to use search.
  const RENDER_CAP = 500;
  const truncated = sortedRecs.length > RENDER_CAP;
  const rowsToRender = truncated ? sortedRecs.slice(0, RENDER_CAP) : sortedRecs;
  return `<table>
    <thead><tr>${ths}<th></th></tr></thead>
    <tbody>
      ${sortedRecs.length === 0
        ? `<tr><td colspan="${cols.length+1}" style="padding:0">${_entityEmptyState(entityKey, cfg)}</td></tr>`
        : rowsToRender.map(r => buildEntityRow(entityKey, r, cols, _plateField, _dupPlates)).join('')
      }
      ${truncated ? `<tr><td colspan="${cols.length+1}" style="padding:10px 14px;background:var(--row-empty-bg);color:var(--row-empty-text);font-size:12px;text-align:center">⚠ Showing first ${RENDER_CAP} of ${sortedRecs.length} — use search/filter to narrow results</td></tr>` : ''}
    </tbody>
  </table>`;
}

/**
 * @param {string} [plateField] - όνομα πεδίου πινακίδας, από buildEntityTable
 * @param {Set<string>} [dupPlates] - κανονικοποιημένες πινακίδες που εμφανίζονται >1 φορά
 *   ΠΡΕΠΕΙ να περνιούνται ως ορίσματα: υπολογίζονται μία φορά ανά πίνακα στη
 *   buildEntityTable, που είναι ΑΛΛΗ εμβέλεια από αυτήν εδώ.
 */
function buildEntityRow(entityKey, r, cols, plateField, dupPlates) {
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
    // Empty numerics used to fall through to the generic (left-aligned) cell below,
    // so a column mixed right-aligned digits with left-aligned em-dashes and read as
    // broken. Keep the whole numeric column on one axis, filled or not.
    if (col.type === 'number') {
      // Η μονάδα (π.χ. kg) μπαίνει δίπλα στον αριθμό, σε πιο σβηστό χρώμα ώστε
      // η στήλη να διαβάζεται ως αριθμοί και όχι ως κείμενο (owner 6-8-2026).
      const unit = col.unit && val != null && val !== ''
        ? ` <span style="color:var(--text-dim);font-size:11px">${col.unit}</span>` : '';
      const shown = val != null && val !== '' ? val : '—';
      return `<td style="font-variant-numeric:tabular-nums;text-align:right">${shown}${unit}</td>`;
    }
    if (col.primary) {
      const dup = plateField && col.field === plateField && typeof normalizePlate === 'function'
        && dupPlates && dupPlates.has(normalizePlate(val));
      return `<td><strong style="color:var(--text)">${val || '—'}</strong>${dup
        ? ' <span title="Υπάρχει άλλη εγγραφή με οπτικά ίδια πινακίδα — ελληνικά/λατινικά ομόγλυφα ή κενό" style="font-size:10px;font-weight:700;color:var(--warning);white-space:nowrap">⚠ διπλότυπο;</span>'
        : ''}</td>`;
    }
    if (col.field === 'Phone' && val) return `<td style="font-variant-numeric:tabular-nums;white-space:nowrap">${_fmtPhone(val)}</td>`;
    return `<td>${val != null && val !== '' ? val : '—'}</td>`;
  }).join('');

  // The whole row selects a record, so it must be reachable without a mouse.
  // role+tabindex rather than a <button> wrapper because a <tr> cannot contain
  // one without breaking the table. One change, six master-data pages.
  // See docs/design/DEEP_AUDIT_2026-08-04/clients.md CL-4 / trucks.md TR-6.
  return `<tr onclick="selectEntity('${entityKey}','${r.id}')" id="row_${r.id}"
    tabindex="0" role="button" aria-label="Άνοιγμα εγγραφής"
    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectEntity('${entityKey}','${r.id}')}">${cells}
    <td style="width:32px">
      <button type="button" class="btn-icon" aria-label="Επεξεργασία" onclick="event.stopPropagation();openEntityEdit('${entityKey}','${r.id}')">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M11 2l3 3-9 9H2v-3l9-9z"/>
        </svg>
      </button>
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
    // TR-2/TL-3: οι πινακίδες έχουν ανάμεικτα ελληνικά/λατινικά ομόγλυφα
    // (ΙΑΖ8302 με ελληνικό γιώτα δίπλα σε IAZ7245 με λατινικό I) και άλλοτε
    // με κενό, άλλοτε χωρίς. Είναι οπτικά ταυτόσημα και δεν βρίσκονταν ΠΟΤΕ
    // μεταξύ τους. Η αναζήτηση δοκιμάζει και την κανονική μορφή· η αρχική
    // αναζήτηση υποστρώματος παραμένει, ώστε να μη χαθεί κανένα αποτέλεσμα.
    const qPlate = (typeof normalizePlate === 'function') ? normalizePlate(st.q) : '';
    recs = recs.filter(r => cfg.searchFields.some(sf => {
      const raw = String(r.fields[sf] || '');
      if (raw.toLowerCase().includes(st.q)) return true;
      return !!qPlate && typeof normalizePlate === 'function'
        && normalizePlate(raw).includes(qPlate);
    }));
  }
  for (const [field, { val, type }] of Object.entries(st.filters)) {
    // Το ταίριασμα γίνεται στην ίδια κανονική μορφή που παρήγαγε την επιλογή,
    // αλλιώς «GR» δεν θα έβρισκε ποτέ τις εγγραφές που λένε «ΕΛΛΑΔΑ».
    if (/country|χωρα|χώρα/i.test(field) && typeof normalizeCountry === 'function') {
      recs = recs.filter(r => normalizeCountry(r.fields[field]) === normalizeCountry(val));
      continue;
    }
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
  document.getElementById(entityKey + '_count').textContent = recs.length + (recs.length===1?' εγγραφή':' εγγραφές');
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
        ${(entityKey === 'trucks' || entityKey === 'trailers') ? `<button type="button" class="btn btn-ghost btn-sm" title="Ιστορικό service αυτού του οχήματος" onclick="_openVehicleHistory('${entityKey}','${(f['License Plate']||'').replace(/'/g,"\\'")}')">Ιστορικό ›</button>` : ''}
        ${canEdit ? `<button type="button" class="btn-icon" title="Edit" onclick="openEntityEdit('${entityKey}','${recId}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M11 2l3 3-9 9H2v-3l9-9z"/>
          </svg>
        </button>
        <button class="active-toggle ${f['Active'] ? 'on' : 'off'}" onclick="toggleActive('${entityKey}','${recId}',${!f['Active']})">
          ${f['Active'] ? '● Active' : '○ Inactive'}
        </button>` : ''}
        <button type="button" class="btn-icon" onclick="document.getElementById('${entityKey}_detail').classList.add('hidden')">✕</button>
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
            // PA-5: the raw DB field name leaked to the UI — «Adress» (the
            // PARTNERS/CLIENTS typo) was shown verbatim. The form already
            // defines a display label per field; reuse it here. The DB field
            // name itself must NOT change — records and filters depend on it.
            const fdef = (cfg.formFields || []).flatMap(s2 => s2.fields).find(x => x.f === field);
            const lbl = fdef?.label || field;
            if (fdef?.unit) displayVal = `${displayVal} ${fdef.unit}`;
            return `<div class="detail-field">
              <span class="detail-field-label">${lbl}</span>
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
        atGetAll(TABLES.ORDERS,     { filterByFormula: filter, fields: ['Direction','Loading Location 1','Unloading Location 1','Status','Total Pallets','Loading DateTime','Price','Delivery Performance'] }, false),
        atGetAll(TABLES.NAT_ORDERS, { filterByFormula: filter, fields: ['Direction','Pickup Location 1','Delivery Location 1','Status','Pallets','Loading DateTime','Price','Delivery Performance'] }, false),
      ]);
      orders = [
        ...intl.map(r => ({ type:'INTL', dir:r.fields['Direction']||'—', route:orderRoute(r.fields, 20)||'—', status:r.fields['Status']||'—', pals:r.fields['Total Pallets']||0, date:(r.fields['Loading DateTime']||'').substring(0,10), price:parseFloat(r.fields['Price'])||0, perf:r.fields['Delivery Performance']||'' })),
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
    el.innerHTML = `<div style="color:var(--danger);font-size:11px">Failed to load orders list</div>`;
    if (typeof logError === 'function') logError(e, 'entity orders table');
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
      ${card('Σύνολο', total)}
      ${card('Ενεργά', active, active>0?'var(--accent)':'var(--text-dim)')}
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
      ${card('Σύνολο', total)}
      ${card('Ενεργά', active, active>0?'var(--accent)':'var(--text-dim)')}
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
    reportError('Σφάλμα αποθήκευσης εγγραφής', e);
  }
}
