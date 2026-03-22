// ═══════════════════════════════════════════════════════════════
// DAILY OPS PLAN — v1.0
// Dispatcher's daily command center
// 4+4 layout: Export (Load/Deliver) + Import (Load/Deliver) × Today/Tomorrow
// ═══════════════════════════════════════════════════════════════

'use strict';

const OPS = {
  date:     'today',   // 'today' | 'tomorrow'
  intl:     [],        // international orders
  natl:     [],        // national orders
  trucks:   [],
  drivers:  [],
  locs:     [],
  overdue:  [],        // orders past delivery date without Delivered status
};

// ── fields we need from each table ──
const OPS_FIELDS_INTL = [
  'Direction','Goods','Temperature °C','Total Pallets','Client',
  'Loading DateTime','Delivery DateTime','Status',
  'Loading Location 1','Unloading Location 1',
  'Ops Status','Delivery Performance','Ops Notes','Postponed To',
  'Actual Delivery Date','ETA','CMR Photo Received','Client Notified',
  'Docs Ready','Temp OK','Driver Notified','Advance Paid','Second Card',
  'Truck','Trailer','Driver','Is Partner Trip','Partner',
];

const OPS_FIELDS_NATL = [
  'Direction','Goods','Temperature °C','Pallets','Client',
  'Loading DateTime','Delivery DateTime','Status',
  'Pickup Location 1','Delivery Location 1',
  'Ops Status','Delivery Performance','Ops Notes','Postponed To',
  'Actual Delivery Date','ETA','CMR Photo Received','Client Notified',
  'Docs Ready','Temp OK','Driver Notified','Advance Paid','Second Card',
  'Truck','Trailer','Driver','Is Partner Trip','Partner',
];

/* ── CSS ──────────────────────────────────────────────────────── */
(function(){
  if (document.getElementById('ops-css')) return;
  const s = document.createElement('style'); s.id = 'ops-css';
  s.textContent = `
/* toolbar */
.ops-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:16px; flex-wrap:wrap; }
.ops-day-btn { padding:7px 18px; font-size:11px; font-weight:700; border-radius:5px;
  border:1px solid var(--border-mid); background:var(--bg); color:var(--text-mid);
  cursor:pointer; letter-spacing:.5px; text-transform:uppercase; }
.ops-day-btn.active { background:var(--navy-mid); color:#fff; border-color:var(--navy-mid); }

/* overdue banner */
.ops-overdue { background:rgba(220,38,38,0.08); border:1px solid rgba(220,38,38,0.25);
  border-radius:8px; padding:10px 14px; margin-bottom:16px; display:flex; align-items:center;
  gap:10px; flex-wrap:wrap; }
.ops-overdue-text { font-size:12px; font-weight:600; color:#DC2626; flex:1; }
.ops-overdue-items { display:flex; gap:6px; flex-wrap:wrap; }
.ops-overdue-item { font-size:10px; background:rgba(220,38,38,0.1); color:#DC2626;
  padding:4px 10px; border-radius:4px; font-weight:600; }
.ops-overdue-btns { display:flex; gap:4px; }
.ops-overdue-btn { font-size:9px; font-weight:700; padding:3px 8px; border-radius:4px;
  border:1px solid rgba(220,38,38,0.3); background:none; cursor:pointer; }
.ops-overdue-btn.delivered { color:#059669; border-color:rgba(5,150,105,0.3); }
.ops-overdue-btn.delayed   { color:#DC2626; border-color:rgba(220,38,38,0.3); }

/* grid: 4 columns */
.ops-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:12px; }
@media(max-width:1200px) { .ops-grid { grid-template-columns:1fr 1fr; } }
@media(max-width:700px)  { .ops-grid { grid-template-columns:1fr; } }

/* section column */
.ops-section { display:flex; flex-direction:column; gap:0; min-width:0; }
.ops-section-head {
  display:flex; align-items:center; justify-content:space-between;
  padding:8px 12px; border-radius:8px 8px 0 0;
  font-size:10px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase;
}
.ops-section-head.exp-load  { background:#065F46; color:#ECFDF5; }
.ops-section-head.exp-deliv { background:#1E3A8A; color:#EFF6FF; }
.ops-section-head.imp-load  { background:#7C3AED; color:#F5F3FF; }
.ops-section-head.imp-deliv { background:#9D174D; color:#FDF2F8; }

.ops-section-body { border:1px solid var(--border-mid); border-top:none;
  border-radius:0 0 8px 8px; background:var(--bg-card); min-height:60px; }

/* order card */
.ops-card { padding:10px 12px; border-bottom:1px solid var(--border);
  transition:background .1s; }
.ops-card:last-child { border-bottom:none; }
.ops-card:hover { background:var(--bg-hover); }
.ops-card.done { opacity:.5; }

.ops-card-route { font-size:11px; font-weight:700; color:var(--text);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px; }
.ops-card-meta { font-size:10px; color:var(--text-mid); margin-bottom:2px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ops-card-badges { display:flex; gap:4px; flex-wrap:wrap; margin:4px 0; }
.ops-badge { font-size:8px; font-weight:700; letter-spacing:.6px; padding:2px 6px;
  border-radius:3px; text-transform:uppercase; }
.ob-pal   { background:rgba(59,130,246,0.12); color:#60A5FA; }
.ob-temp  { background:rgba(14,165,233,0.12); color:#38BDF8; }
.ob-truck { background:rgba(107,114,128,0.12); color:#9CA3AF; }
.ob-exp   { background:rgba(5,150,105,0.12);  color:#34D399; }
.ob-imp   { background:rgba(124,58,237,0.12); color:#A78BFA; }
.ob-partner { background:rgba(217,119,6,0.12); color:#F59E0B; }
.ob-status  { background:rgba(184,196,208,0.1); color:var(--text-dim); }

/* checklist */
.ops-checklist { display:flex; flex-direction:column; gap:3px; margin:6px 0 4px; }
.ops-check { display:flex; align-items:center; gap:6px; font-size:10px; color:var(--text-mid); cursor:pointer; }
.ops-check input[type=checkbox] { margin:0; cursor:pointer; accent-color:#059669; }
.ops-check.checked { color:#059669; text-decoration:line-through; opacity:.7; }
.ops-check-input { display:flex; align-items:center; gap:4px; }
.ops-check-inp { padding:3px 6px; font-size:10px; border:1px solid var(--border-mid);
  border-radius:4px; background:var(--bg); color:var(--text); width:55px; outline:none; }
.ops-check-amt { width:70px; }

/* actions */
.ops-actions { display:flex; gap:4px; margin-top:6px; flex-wrap:wrap; }
.ops-btn { font-size:9px; font-weight:700; letter-spacing:.5px; padding:4px 10px;
  border-radius:4px; border:1px solid var(--border-mid); background:none;
  cursor:pointer; white-space:nowrap; }
.ops-btn:hover { background:var(--bg-hover); }
.ops-btn.loaded   { border-color:rgba(6,182,212,0.4); color:#22D3EE; }
.ops-btn.delivered { border-color:rgba(5,150,105,0.4); color:#34D399; }
.ops-btn.delayed   { border-color:rgba(220,38,38,0.4); color:#F87171; }
.ops-btn.postpone  { border-color:rgba(217,119,6,0.4); color:#FBBF24; }
.ops-btn.notes     { border-color:rgba(107,114,128,0.3); color:var(--text-dim); }

/* notes inline */
.ops-notes-row { margin-top:4px; }
.ops-notes-inp { width:100%; font-size:10px; padding:4px 8px; border:1px solid var(--border-mid);
  border-radius:4px; background:var(--bg); color:var(--text); outline:none; resize:none; }

/* empty */
.ops-empty { padding:20px; text-align:center; color:var(--text-dim); font-size:11px; font-style:italic; }
`;
  document.head.appendChild(s);
})();

/* ── ENTRY POINT ──────────────────────────────────────────────── */
async function renderDailyOps() {
  document.getElementById('topbarTitle').textContent = 'Daily Ops Plan';
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Φόρτωση λειτουργικού πλάνου…');

  try {
    await _opsLoadAssets();
    await _opsLoadOrders();
    _opsPaint();
  } catch(e) {
    c.innerHTML = `<div style="color:var(--danger);padding:40px">Σφάλμα: ${e.message}</div>`;
    console.error('renderDailyOps:', e);
  }
}

/* ── LOAD ASSETS ──────────────────────────────────────────────── */
async function _opsLoadAssets() {
  if (OPS.trucks.length && OPS.locs.length) return;
  const [t, d, l] = await Promise.all([
    atGetAll(TABLES.TRUCKS,    { fields:['License Plate'], filterByFormula:'{Active}=TRUE()' }, false),
    atGetAll(TABLES.DRIVERS,   { fields:['Full Name'],     filterByFormula:'{Active}=TRUE()' }, false),
    atGetAll(TABLES.LOCATIONS, { fields:['Name','City','Country'] }, true),
  ]);
  OPS.trucks  = t.map(r => ({ id:r.id, label:r.fields['License Plate']||r.id }));
  OPS.drivers = d.map(r => ({ id:r.id, label:r.fields['Full Name']||r.id }));
  OPS.locs    = l;
}

/* ── LOAD ORDERS ──────────────────────────────────────────────── */
async function _opsLoadOrders() {
  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now()+86400000).toISOString().split('T')[0];
  const target   = OPS.date === 'tomorrow' ? tomorrow : today;

  // Fetch orders where Loading or Delivery date matches target
  // Also fetch overdue (delivery date < today, status NOT Delivered/Client Notified)
  const loadFilter = `OR(IS_SAME({Loading DateTime},'${target}','day'),IS_SAME({Delivery DateTime},'${target}','day'))`;
  const overdueFilter = `AND(IS_BEFORE({Delivery DateTime},TODAY()),OR({Ops Status}='In Transit',{Ops Status}='Loaded',{Ops Status}='Assigned',{Ops Status}='Pending',{Ops Status}=''))`;

  const [intl, natl, overdueIntl, overdueNatl] = await Promise.all([
    atGetAll(TABLES.ORDERS,     { filterByFormula: loadFilter, fields: OPS_FIELDS_INTL }, false),
    atGetAll(TABLES.NAT_ORDERS, { filterByFormula: loadFilter, fields: OPS_FIELDS_NATL }, false),
    OPS.date === 'today' ? atGetAll(TABLES.ORDERS,     { filterByFormula: overdueFilter, fields: OPS_FIELDS_INTL }, false) : Promise.resolve([]),
    OPS.date === 'today' ? atGetAll(TABLES.NAT_ORDERS, { filterByFormula: overdueFilter, fields: OPS_FIELDS_NATL }, false) : Promise.resolve([]),
  ]);

  OPS.intl = intl;
  OPS.natl = natl;
  OPS.overdue = [...overdueIntl.map(r => ({...r, _table:'intl'})), ...overdueNatl.map(r => ({...r, _table:'natl'}))];

  // Remove overdue items that are already in today's list
  const todayIds = new Set([...intl.map(r=>r.id), ...natl.map(r=>r.id)]);
  OPS.overdue = OPS.overdue.filter(r => !todayIds.has(r.id));
}

/* ── HELPERS ──────────────────────────────────────────────────── */
function _opsLocName(locId) {
  if (!locId) return '—';
  const loc = OPS.locs.find(r => r.id === locId);
  return loc ? (loc.fields['Name']||loc.fields['City']||'—') : '—';
}

function _opsResolveLinked(arr) {
  if (!arr || !arr.length) return null;
  return arr[0]?.id || arr[0] || null;
}

function _opsTruckLabel(f) {
  const tid = _opsResolveLinked(f['Truck']);
  return tid ? (OPS.trucks.find(t=>t.id===tid)?.label || '—') : null;
}

function _opsDriverLabel(f) {
  const did = _opsResolveLinked(f['Driver']);
  return did ? (OPS.drivers.find(d=>d.id===did)?.label || '—') : null;
}

function _opsLoadLoc(f, isNatl) {
  const key = isNatl ? 'Pickup Location 1' : 'Loading Location 1';
  const id = _opsResolveLinked(f[key]);
  return _opsLocName(id);
}

function _opsDelivLoc(f, isNatl) {
  const key = isNatl ? 'Delivery Location 1' : 'Unloading Location 1';
  const id = _opsResolveLinked(f[key]);
  return _opsLocName(id);
}

function _opsIsPartner(f) {
  return f['Is Partner Trip'] === true || f['Is Partner Trip'] === 'Yes';
}

function _opsDateMatch(dtField, targetDate) {
  if (!dtField) return false;
  return dtField.substring(0,10) === targetDate;
}

/* ── CATEGORIZE ORDERS ───────────────────────────────────────── */
function _opsCategorize() {
  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now()+86400000).toISOString().split('T')[0];
  const target   = OPS.date === 'tomorrow' ? tomorrow : today;

  const cats = { expLoad:[], expDeliv:[], impLoad:[], impDeliv:[] };

  const allOrders = [
    ...OPS.intl.map(r => ({...r, _isNatl:false})),
    ...OPS.natl.map(r => ({...r, _isNatl:true})),
  ];

  for (const rec of allOrders) {
    const f = rec.fields;
    const dir = (f['Direction']||'').toLowerCase();
    const isExport = dir.includes('export') || dir.includes('s→n') || dir.includes('south') || dir === '↑ s→n';
    const isImport = dir.includes('import') || dir.includes('n→s') || dir.includes('north') || dir === '↓ n→s';
    const isLoading  = _opsDateMatch(f['Loading DateTime'], target);
    const isDelivery = _opsDateMatch(f['Delivery DateTime'], target);

    if (isExport || (!isImport && !isExport)) {
      if (isLoading)  cats.expLoad.push(rec);
      if (isDelivery) cats.expDeliv.push(rec);
    }
    if (isImport) {
      if (isLoading)  cats.impLoad.push(rec);
      if (isDelivery) cats.impDeliv.push(rec);
    }
  }

  return cats;
}

/* ── PAINT ────────────────────────────────────────────────────── */
function _opsPaint() {
  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now()+86400000).toISOString().split('T')[0];
  const isToday  = OPS.date === 'today';
  const target   = isToday ? today : tomorrow;

  const fmtDate = d => {
    try {
      const dt = new Date(d);
      const days = ['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
      const months = ['Ιανουαρίου','Φεβρουαρίου','Μαρτίου','Απριλίου','Μαΐου','Ιουνίου',
        'Ιουλίου','Αυγούστου','Σεπτεμβρίου','Οκτωβρίου','Νοεμβρίου','Δεκεμβρίου'];
      return `${days[dt.getDay()]} ${dt.getDate()} ${months[dt.getMonth()]}`;
    } catch { return d; }
  };

  const cats = _opsCategorize();
  const total = cats.expLoad.length + cats.expDeliv.length + cats.impLoad.length + cats.impDeliv.length;

  let overdueHTML = '';
  if (isToday && OPS.overdue.length) {
    overdueHTML = `<div class="ops-overdue">
      <div class="ops-overdue-text">⚠ ${OPS.overdue.length} order${OPS.overdue.length>1?'s':''} με παράδοση που πέρασε χωρίς status update</div>
      <div class="ops-overdue-items">${OPS.overdue.map(r => {
        const f = r.fields;
        const tbl = r._table === 'intl' ? TABLES.ORDERS : TABLES.NAT_ORDERS;
        const cName = Array.isArray(f['Client']) ? (f['Client'][0]||'Order') : (f['Client']||'Order');
        return `<div class="ops-overdue-item">
          ${String(cName).substring(0,20)} · ${(f['Delivery DateTime']||'').substring(0,10)}
          <span class="ops-overdue-btns">
            <button class="ops-overdue-btn delivered" onclick="_opsOverdueAction('${r.id}','${tbl}','Delivered')">✓ Delivered</button>
            <button class="ops-overdue-btn delayed" onclick="_opsOverdueAction('${r.id}','${tbl}','Delayed')">✗ Delayed</button>
          </span>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:14px">
      <div>
        <div class="page-title">Daily Ops Plan</div>
        <div class="page-sub">${fmtDate(target)} · ${total} orders</div>
      </div>
      <button class="btn btn-ghost" onclick="renderDailyOps()">Refresh</button>
    </div>

    <div class="ops-toolbar">
      <button class="ops-day-btn ${isToday?'active':''}" onclick="_opsSetDay('today')">Σήμερα</button>
      <button class="ops-day-btn ${!isToday?'active':''}" onclick="_opsSetDay('tomorrow')">Αύριο</button>
    </div>

    ${overdueHTML}

    <div class="ops-grid">
      <div class="ops-section">
        <div class="ops-section-head exp-load">
          <span>↑ EXP Φορτώσεις</span><span style="opacity:.6">${cats.expLoad.length}</span>
        </div>
        <div class="ops-section-body">
          ${cats.expLoad.length ? cats.expLoad.map(r => _opsCardHTML(r,'exp-load',isToday)).join('') : '<div class="ops-empty">Χωρίς φορτώσεις</div>'}
        </div>
      </div>
      <div class="ops-section">
        <div class="ops-section-head exp-deliv">
          <span>↓ EXP Παραδόσεις</span><span style="opacity:.6">${cats.expDeliv.length}</span>
        </div>
        <div class="ops-section-body">
          ${cats.expDeliv.length ? cats.expDeliv.map(r => _opsCardHTML(r,'exp-deliv',isToday)).join('') : '<div class="ops-empty">Χωρίς παραδόσεις</div>'}
        </div>
      </div>
      <div class="ops-section">
        <div class="ops-section-head imp-load">
          <span>↑ IMP Φορτώσεις</span><span style="opacity:.6">${cats.impLoad.length}</span>
        </div>
        <div class="ops-section-body">
          ${cats.impLoad.length ? cats.impLoad.map(r => _opsCardHTML(r,'imp-load',isToday)).join('') : '<div class="ops-empty">Χωρίς φορτώσεις</div>'}
        </div>
      </div>
      <div class="ops-section">
        <div class="ops-section-head imp-deliv">
          <span>↓ IMP Παραδόσεις</span><span style="opacity:.6">${cats.impDeliv.length}</span>
        </div>
        <div class="ops-section-body">
          ${cats.impDeliv.length ? cats.impDeliv.map(r => _opsCardHTML(r,'imp-deliv',isToday)).join('') : '<div class="ops-empty">Χωρίς παραδόσεις</div>'}
        </div>
      </div>
    </div>
  `;
}

/* ── ORDER CARD HTML ──────────────────────────────────────────── */
function _opsCardHTML(rec, sectionType, isToday) {
  const f = rec.fields;
  const isNatl   = rec._isNatl;
  const tbl      = isNatl ? TABLES.NAT_ORDERS : TABLES.ORDERS;
  const loadLoc  = _opsLoadLoc(f, isNatl);
  const delivLoc = _opsDelivLoc(f, isNatl);
  const truck    = _opsTruckLabel(f);
  const driver   = _opsDriverLabel(f);
  const partner  = _opsIsPartner(f);
  const pallets  = f['Total Pallets'] || f['Pallets'] || '';
  const temp     = f['Temperature °C'] != null ? `${f['Temperature °C']}°C` : '';
  const goods    = (f['Goods']||'').substring(0, 60);
  const clientRaw = f['Client'];
  const client   = Array.isArray(clientRaw) ? (clientRaw[0]||'—') : (clientRaw||'—');
  const opsStatus = f['Ops Status'] || '';
  const isDone   = opsStatus === 'Delivered' || opsStatus === 'Client Notified';
  const isLoad   = sectionType.includes('load');
  const isDeliv  = sectionType.includes('deliv');
  const isExp    = sectionType.includes('exp');
  const isImp    = sectionType.includes('imp');
  const notes    = f['Ops Notes'] || '';

  // Badges
  let badges = '';
  if (pallets) badges += `<span class="ops-badge ob-pal">${pallets} pal</span>`;
  if (temp) badges += `<span class="ops-badge ob-temp">${temp}</span>`;
  if (truck) badges += `<span class="ops-badge ob-truck">${truck}</span>`;
  if (partner) badges += `<span class="ops-badge ob-partner">Partner</span>`;
  if (opsStatus) badges += `<span class="ops-badge ob-status">${opsStatus}</span>`;

  // Checklist
  let checklist = '';

  if (isToday && isLoad && isExp) {
    // ΣΗΜΕΡΑ — EXP ΦΟΡΤΩΣΕΙΣ
    checklist = `
      ${_opsCheckbox(rec.id, tbl, 'Docs Ready', 'Docs/CMR ready', f['Docs Ready'])}
      ${_opsCheckbox(rec.id, tbl, 'Temp OK', 'Θερμοκρασία OK', f['Temp OK'])}
      ${!partner ? _opsAmountField(rec.id, tbl, 'Advance Paid', 'Προκαταβολή €', f['Advance Paid']) : ''}
      ${!partner ? _opsCheckbox(rec.id, tbl, 'Second Card', '2η Κάρτα', f['Second Card']) : ''}
    `;
  } else if (isToday && isDeliv && isExp) {
    // ΣΗΜΕΡΑ — EXP ΠΑΡΑΔΟΣΕΙΣ
    checklist = `
      ${_opsTimeField(rec.id, tbl, 'ETA', f['ETA'])}
      ${_opsCheckbox(rec.id, tbl, 'CMR Photo Received', 'CMR photo received', f['CMR Photo Received'])}
      ${_opsCheckbox(rec.id, tbl, 'Client Notified', 'Πελάτης ενημερωμένος', f['Client Notified'])}
    `;
  } else if (isToday && isLoad && isImp) {
    // ΣΗΜΕΡΑ — IMP ΦΟΡΤΩΣΕΙΣ
    checklist = `
      ${_opsCheckbox(rec.id, tbl, 'CMR Photo Received', 'CMR photo από οδηγό/partner', f['CMR Photo Received'])}
      ${_opsCheckbox(rec.id, tbl, 'Temp OK', 'Θερμοκρασία OK', f['Temp OK'])}
      ${_opsTimeField(rec.id, tbl, 'ETA', f['ETA'])}
    `;
  } else if (isToday && isDeliv && isImp) {
    // ΣΗΜΕΡΑ — IMP ΠΑΡΑΔΟΣΕΙΣ
    checklist = `
      ${_opsTimeField(rec.id, tbl, 'ETA', f['ETA'])}
      ${_opsCheckbox(rec.id, tbl, 'CMR Photo Received', 'CMR photo received', f['CMR Photo Received'])}
      ${_opsCheckbox(rec.id, tbl, 'Client Notified', 'Πελάτης ενημερωμένος', f['Client Notified'])}
    `;
  } else if (!isToday && isLoad && isExp) {
    // ΑΥΡΙΟ — EXP ΦΟΡΤΩΣΕΙΣ
    checklist = `
      ${_opsCheckbox(rec.id, tbl, 'Driver Notified', 'Οδηγός/Partner ενημερωμένος', f['Driver Notified'])}
    `;
  } else if (!isToday && isDeliv && isExp) {
    // ΑΥΡΙΟ — EXP ΠΑΡΑΔΟΣΕΙΣ
    checklist = `
      ${_opsTimeField(rec.id, tbl, 'ETA', f['ETA'])}
    `;
  } else if (!isToday && isLoad && isImp) {
    // ΑΥΡΙΟ — IMP ΦΟΡΤΩΣΕΙΣ
    checklist = `
      ${_opsCheckbox(rec.id, tbl, 'Driver Notified', 'Οδηγός/Partner ενημερωμένος', f['Driver Notified'])}
      ${_opsTimeField(rec.id, tbl, 'ETA', f['ETA'])}
    `;
  } else if (!isToday && isDeliv && isImp) {
    // ΑΥΡΙΟ — IMP ΠΑΡΑΔΟΣΕΙΣ
    checklist = `
      ${_opsTimeField(rec.id, tbl, 'ETA', f['ETA'])}
    `;
  }

  // Action buttons
  let actions = '';
  if (isToday && isLoad) {
    actions = `
      <button class="ops-btn loaded" onclick="_opsSetStatus('${rec.id}','${tbl}','Loaded')">✓ Loaded</button>
      <button class="ops-btn postpone" onclick="_opsPostpone('${rec.id}','${tbl}')">⏩ Postpone</button>
    `;
  } else if (isToday && isDeliv) {
    actions = `
      <button class="ops-btn delivered" onclick="_opsSetDelivered('${rec.id}','${tbl}','On Time')">✓ Delivered</button>
      <button class="ops-btn delayed" onclick="_opsSetDelivered('${rec.id}','${tbl}','Delayed')">✗ Delayed</button>
      <button class="ops-btn postpone" onclick="_opsPostpone('${rec.id}','${tbl}')">⏩ Postpone</button>
    `;
  }

  // Notes button
  actions += ` <button class="ops-btn notes" onclick="_opsToggleNotes('${rec.id}')">📝</button>`;

  return `<div class="ops-card${isDone?' done':''}" id="ops_${rec.id}">
    <div class="ops-card-route">${loadLoc} → ${delivLoc}</div>
    <div class="ops-card-meta">${client} · ${goods}</div>
    <div class="ops-card-badges">${badges}</div>
    <div class="ops-checklist">${checklist}</div>
    <div class="ops-actions">${actions}</div>
    <div class="ops-notes-row" id="opsnotes_${rec.id}" style="display:${notes?'block':'none'}">
      <textarea class="ops-notes-inp" rows="2" placeholder="Σημειώσεις…"
        onblur="_opsSaveNotes('${rec.id}','${tbl}',this.value)">${notes}</textarea>
    </div>
  </div>`;
}

/* ── CHECKLIST COMPONENTS ─────────────────────────────────────── */
function _opsCheckbox(recId, tbl, field, label, value) {
  const checked = value ? 'checked' : '';
  const cls = value ? 'ops-check checked' : 'ops-check';
  return `<label class="${cls}">
    <input type="checkbox" ${checked} onchange="_opsToggleCheck('${recId}','${tbl}','${field}',this.checked)">
    ${label}
  </label>`;
}

function _opsTimeField(recId, tbl, field, value) {
  return `<div class="ops-check-input">
    <span style="font-size:10px;color:var(--text-dim);font-weight:600">${field}:</span>
    <input class="ops-check-inp" type="text" placeholder="--:--" value="${value||''}"
      onblur="_opsSaveField('${recId}','${tbl}','${field}',this.value)">
  </div>`;
}

function _opsAmountField(recId, tbl, field, label, value) {
  return `<div class="ops-check-input">
    <input type="checkbox" ${value?'checked':''} onchange="_opsToggleAdvance('${recId}','${tbl}',this.checked,this.parentElement.querySelector('.ops-check-amt'))">
    <span style="font-size:10px;color:var(--text-dim)">${label}</span>
    <input class="ops-check-inp ops-check-amt" type="number" step="0.01" placeholder="0.00"
      value="${value||''}" onblur="_opsSaveField('${recId}','${tbl}','${field}',parseFloat(this.value)||null)">
  </div>`;
}

/* ── ACTIONS ──────────────────────────────────────────────────── */
function _opsSetDay(day) {
  OPS.date = day;
  renderDailyOps();
}

async function _opsToggleCheck(recId, tbl, field, checked) {
  try {
    await atPatch(tbl, recId, { [field]: checked });
    // Update local
    const rec = _opsFindRec(recId);
    if (rec) rec.fields[field] = checked;
    toast(checked ? '✓' : '—');
  } catch(e) { toast('Σφάλμα: '+e.message, 'danger'); }
}

async function _opsSaveField(recId, tbl, field, value) {
  try {
    await atPatch(tbl, recId, { [field]: value || null });
    const rec = _opsFindRec(recId);
    if (rec) rec.fields[field] = value;
  } catch(e) { toast('Σφάλμα: '+e.message, 'danger'); }
}

async function _opsToggleAdvance(recId, tbl, checked, amtInput) {
  if (!checked) {
    await _opsSaveField(recId, tbl, 'Advance Paid', null);
    if (amtInput) amtInput.value = '';
  }
}

async function _opsSetStatus(recId, tbl, status) {
  try {
    await atPatch(tbl, recId, { 'Ops Status': status });
    const rec = _opsFindRec(recId);
    if (rec) rec.fields['Ops Status'] = status;
    toast(`${status} ✓`);
    _opsPaint();
  } catch(e) { toast('Σφάλμα: '+e.message, 'danger'); }
}

async function _opsSetDelivered(recId, tbl, performance) {
  const today = new Date().toISOString().split('T')[0];
  try {
    await atPatch(tbl, recId, {
      'Ops Status': 'Delivered',
      'Delivery Performance': performance,
      'Actual Delivery Date': today,
    });
    const rec = _opsFindRec(recId);
    if (rec) {
      rec.fields['Ops Status'] = 'Delivered';
      rec.fields['Delivery Performance'] = performance;
      rec.fields['Actual Delivery Date'] = today;
    }
    toast(performance === 'On Time' ? '✓ Delivered on time' : '✗ Delivered (delayed)', performance === 'Delayed' ? 'danger' : 'success');
    _opsPaint();
  } catch(e) { toast('Σφάλμα: '+e.message, 'danger'); }
}

async function _opsPostpone(recId, tbl) {
  const newDate = prompt('Νέα ημερομηνία παράδοσης (YYYY-MM-DD):');
  if (!newDate || !/\d{4}-\d{2}-\d{2}/.test(newDate)) return;
  try {
    await atPatch(tbl, recId, {
      'Ops Status': 'Postponed',
      'Postponed To': newDate,
    });
    const rec = _opsFindRec(recId);
    if (rec) {
      rec.fields['Ops Status'] = 'Postponed';
      rec.fields['Postponed To'] = newDate;
    }
    toast('⏩ Postponed → ' + newDate);
    _opsPaint();
  } catch(e) { toast('Σφάλμα: '+e.message, 'danger'); }
}

async function _opsOverdueAction(recId, tbl, action) {
  const today = new Date().toISOString().split('T')[0];
  const perf = action === 'Delivered' ? 'Delayed' : 'Delayed'; // overdue is always delayed
  try {
    await atPatch(tbl, recId, {
      'Ops Status': 'Delivered',
      'Delivery Performance': perf,
      'Actual Delivery Date': today,
    });
    OPS.overdue = OPS.overdue.filter(r => r.id !== recId);
    toast(action === 'Delivered' ? '✓ Marked as delivered (late)' : '✗ Marked as delayed');
    _opsPaint();
  } catch(e) { toast('Σφάλμα: '+e.message, 'danger'); }
}

function _opsToggleNotes(recId) {
  const el = document.getElementById('opsnotes_' + recId);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function _opsSaveNotes(recId, tbl, value) {
  try {
    await atPatch(tbl, recId, { 'Ops Notes': value || null });
    const rec = _opsFindRec(recId);
    if (rec) rec.fields['Ops Notes'] = value;
  } catch(e) { toast('Σφάλμα: '+e.message, 'danger'); }
}

/* ── FIND RECORD IN LOCAL STATE ──────────────────────────────── */
function _opsFindRec(recId) {
  return OPS.intl.find(r=>r.id===recId) || OPS.natl.find(r=>r.id===recId) || OPS.overdue.find(r=>r.id===recId);
}
