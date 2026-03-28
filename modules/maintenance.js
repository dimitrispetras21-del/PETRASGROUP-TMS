// ═══════════════════════════════════════════════════════════════
// MAINTENANCE MODULE — Expiry Alerts, Service Records, History
// ═══════════════════════════════════════════════════════════════

'use strict';

/* ── SHARED STATE ────────────────────────────────────────────── */
const MAINT = {
  trucks: [], trailers: [], workshops: [], history: [],
  _loaded: false,
};

const TRUCK_EXPIRY_FIELDS = [
  { field: 'KTEO Expiry',        label: 'KTEO' },
  { field: 'KEK Expiry',         label: 'KEK' },
  { field: 'Insurance Expiry',   label: 'Insurance' },
];
const TRAILER_EXPIRY_FIELDS = [
  { field: 'KTEO Expiry',        label: 'KTEO' },
  { field: 'FRC Expiry',         label: 'FRC' },
  { field: 'Insurance Expiry',   label: 'Insurance' },
];

const MAINT_HISTORY_FIELDS = [
  'Vehicle Plate','Vehicle Type','Date','Type','Description',
  'Workshop','Cost','Odometer km','Parts','Next Service Date',
  'Next Service km','Invoice Number','Notes','Status',
];

/* ── CSS ─────────────────────────────────────────────────────── */
(function(){
  if (document.getElementById('maint-css')) return;
  const s = document.createElement('style'); s.id = 'maint-css';
  s.textContent = `
/* expiry badges */
.exp-badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; letter-spacing:.3px; }
.exp-overdue { background:#7F1D1D; color:#FEE2E2; }
.exp-critical { background:#991B1B; color:#FEE2E2; }
.exp-warning { background:#92400E; color:#FEF3C7; }
.exp-upcoming { background:#78350F; color:#FDE68A; }
.exp-ok { background:#065F46; color:#D1FAE5; }
.exp-none { background:#374151; color:#9CA3AF; }

/* KPI cards — dark navy */
.mk-kpis { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
.mk-kpi { background:#0F172A; border:1px solid #1E293B;
  border-radius:10px; padding:14px 18px; flex:1; min-width:100px; }
.mk-kpi-lbl { font-size:12px; font-weight:500; letter-spacing:.3px; color:#94A3B8; font-family:'DM Sans',sans-serif; margin-bottom:4px; }
.mk-kpi-val { font-family:'Syne',sans-serif; font-size:22px; font-weight:700; line-height:1; color:#F1F5F9; }

/* tables */
.mt { width:100%; border-collapse:collapse; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
.mt thead th { padding:7px 10px; font-size:10px; font-weight:600; letter-spacing:.8px; text-transform:uppercase;
  color:var(--text-dim); text-align:left; border-bottom:1px solid var(--border); background:#F0F5FA; white-space:nowrap; }
.mt tbody td { padding:7px 10px; font-size:12px; border-bottom:1px solid var(--border); vertical-align:middle; }
.mt tbody tr:last-child td { border-bottom:none; }
.mt tbody tr:hover td { background:var(--bg-hover); cursor:pointer; }
.mt .rn { font-family:'Syne',sans-serif; font-weight:700; color:var(--text-dim); font-size:10px; }
.mt .c { text-align:center; }
.mt .r { text-align:right; }

/* vehicle card */
.mv-card { background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:16px 20px;
  display:flex; gap:20px; align-items:center; margin-bottom:16px; }
.mv-plate { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; letter-spacing:1px; }
.mv-info { font-size:12px; color:var(--text-dim); }

/* form */
.mf-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9998; display:flex; align-items:center; justify-content:center; }
.mf-modal { background:var(--bg-card); border-radius:12px; padding:0; width:560px; max-height:85vh; overflow-y:auto;
  box-shadow:0 20px 60px rgba(0,0,0,0.3); }
.mf-head { padding:16px 20px; border-bottom:1px solid var(--border); font-family:'Syne',sans-serif; font-size:14px; font-weight:700;
  display:flex; justify-content:space-between; align-items:center; }
.mf-body { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
.mf-row { display:flex; gap:10px; }
.mf-field { display:flex; flex-direction:column; gap:3px; flex:1; }
.mf-field label { font-size:10px; font-weight:600; letter-spacing:.5px; color:var(--text-dim); text-transform:uppercase; }
.mf-field input, .mf-field select, .mf-field textarea { padding:8px 10px; font-size:12px; border:1px solid var(--border-mid);
  border-radius:6px; background:var(--bg); color:var(--text); outline:none; font-family:'DM Sans',sans-serif; }
.mf-field input:focus, .mf-field select:focus, .mf-field textarea:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(2,132,199,0.15); }
.mf-foot { padding:12px 20px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px; }
`;
  document.head.appendChild(s);
})();

/* ── LOAD SHARED DATA ────────────────────────────────────────── */
async function _maintLoad(forceHistory = false) {
  if (!MAINT._loaded) {
    const [trucks, trailers, ws] = await Promise.all([
      atGetAll(TABLES.TRUCKS, { fields: ['License Plate','Brand','Model','Year','Active',
        'KTEO Expiry','Insurance Expiry','Tachograph Expiry','ADR Expiry','KEK Expiry',
        'Insurance Partner','Next Maintenance Date'] }, true),
      atGetAll(TABLES.TRAILERS, { fields: ['License Plate','Brand','Model','Year','Trailer Type','Active',
        'ATP Expiry','KTEO Expiry','Insurance Expiry','FRC Expiry',
        'Pallet Capacity','Next Maintenance Date'] }, true),
      atGetAll(TABLES.WORKSHOPS, { fields: ['Name','City','Specialty','Active'] }, true),
    ]);
    MAINT.trucks = trucks;
    MAINT.trailers = trailers;
    MAINT.workshops = ws;
    MAINT._loaded = true;
  }
  if (forceHistory || !MAINT.history.length) {
    MAINT.history = await atGetAll(TABLES.MAINT_HISTORY, { fields: MAINT_HISTORY_FIELDS }, false);
  }
}

/* ── HELPERS ──────────────────────────────────────────────────── */
function _daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Math.ceil((d - new Date()) / 864e5);
}
function _expBadge(days) {
  if (days === null) return '<span class="exp-badge exp-none">N/A</span>';
  if (days < 0)  return `<span class="exp-badge exp-overdue">${days}d OVERDUE</span>`;
  if (days <= 7) return `<span class="exp-badge exp-critical">${days}d</span>`;
  if (days <= 30) return `<span class="exp-badge exp-warning">${days}d</span>`;
  if (days <= 60) return `<span class="exp-badge exp-upcoming">${days}d</span>`;
  return `<span class="exp-badge exp-ok">${days}d</span>`;
}
function _fmtDate(d) { return d ? d.substring(0, 10) : '—'; }
function _fmtCost(v) { return v != null ? '€' + Number(v).toLocaleString('el-GR', {minimumFractionDigits:0}) : '—'; }
function _wsName(wsArr) {
  if (!wsArr?.length) return '—';
  const id = wsArr[0]?.id || wsArr[0];
  const ws = MAINT.workshops.find(w => w.id === id);
  return ws ? (ws.fields['Name'] || '—') : '—';
}

// Flat list of all expiry rows (used by Dashboard)
function _expiryBuildRows() {
  const rows = [];
  const addVehicles = (vehicles, fields, vType) => {
    for (const v of vehicles) {
      const f = v.fields;
      if (!f['Active']) continue;
      for (const ef of fields) {
        const d = f[ef.field] || null;
        rows.push({ plate: f['License Plate']||'?', vType, docType: ef.label, date: d, days: _daysUntil(d), brand: f['Brand']||'' });
      }
    }
  };
  addVehicles(MAINT.trucks, TRUCK_EXPIRY_FIELDS, 'Truck');
  addVehicles(MAINT.trailers, TRAILER_EXPIRY_FIELDS, 'Trailer');
  rows.sort((a, b) => {
    if (a.days === null && b.days === null) return 0;
    if (a.days === null) return 1;
    if (b.days === null) return -1;
    return a.days - b.days;
  });
  return rows;
}

// ═════════════════════════════════════════════════════════════════
// PAGE 1: EXPIRY ALERTS — Airtable-style layout
// ═════════════════════════════════════════════════════════════════
async function renderExpiryAlerts() {
  document.getElementById('topbarTitle').textContent = 'Expiry Alerts';
  document.getElementById('content').innerHTML = showLoading('Loading certificates…');
  try {
    await _maintLoad();
    _expiryPaint();
  } catch(e) {
    document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Error: ${e.message}</div>`;
    console.error(e);
  }
}

// Build per-vehicle rows with all expiry fields as columns
function _expiryVehicleRows(vehicles, expiryFields, vType) {
  return vehicles
    .filter(v => v.fields['Active'])
    .map(v => {
      const f = v.fields;
      const docs = expiryFields.map(ef => {
        const d = f[ef.field] || null;
        return { label: ef.label, field: ef.field, date: d, days: _daysUntil(d) };
      });
      const worst = docs.reduce((min, d) => {
        if (d.days === null) return min;
        return (min === null || d.days < min) ? d.days : min;
      }, null);
      return { id: v.id, plate: f['License Plate']||'?', brand: f['Brand']||'', model: f['Model']||'', insurer: f['Insurance Partner']||'', docs, worst, vType };
    })
    .sort((a, b) => {
      if (a.worst === null && b.worst === null) return 0;
      if (a.worst === null) return 1;
      if (b.worst === null) return -1;
      return a.worst - b.worst;
    });
}

// Cell — compact single-line: "DD/MM · Xd"
function _expCell(doc, recId, fieldName, vType) {
  const editAttr = recId ? `onclick="_expInlineEdit(event,'${recId}','${fieldName}','${vType}')"` : '';
  const cursor = recId ? 'cursor:pointer' : '';
  if (!doc.date) return `<td class="c" style="color:#475569;${cursor}" ${editAttr}><span style="font-size:11px">—</span></td>`;
  const d = _daysUntil(doc.date);
  const parts = toLocalDate(doc.date).split('-');
  const dateStr = parts[2]+'/'+parts[1];
  let color, daysStr;
  if (d < 0)        { color = '#EF4444'; daysStr = Math.abs(d) + 'd overdue'; }
  else if (d <= 7)  { color = '#EF4444'; daysStr = d + 'd'; }
  else if (d <= 30) { color = '#F59E0B'; daysStr = d + 'd'; }
  else if (d <= 90) { color = '#0284C7'; daysStr = d + 'd'; }
  else              { color = '#10B981'; daysStr = d + 'd'; }
  return `<td class="c" style="${cursor}" ${editAttr}>
    <span style="font-size:12px;color:#CBD5E1">${dateStr}</span>
    <span style="font-size:11px;font-weight:600;color:${color};margin-left:4px">${daysStr}</span>
  </td>`;
}

// Inline date editor
async function _expInlineEdit(e, recId, fieldName, vType) {
  e.stopPropagation();
  const td = e.currentTarget;
  if (td.querySelector('input[type="date"]')) return;
  const currentVal = (vType === 'Truck'
    ? MAINT.trucks.find(v=>v.id===recId)
    : MAINT.trailers.find(v=>v.id===recId)
  )?.fields[fieldName] || '';
  const inp = document.createElement('input');
  inp.type = 'date';
  inp.value = currentVal ? toLocalDate(currentVal) : '';
  inp.style.cssText = 'font-size:12px;padding:4px 6px;border:2px solid var(--accent);border-radius:6px;background:var(--bg);color:var(--text);outline:none;width:130px;font-family:"DM Sans",sans-serif';
  td.innerHTML = '';
  td.appendChild(inp);
  inp.focus();

  const save = async () => {
    const newVal = inp.value || null;
    td.innerHTML = '<span style="color:var(--accent);font-size:11px">Saving…</span>';
    try {
      const tableId = vType === 'Truck' ? TABLES.TRUCKS : TABLES.TRAILERS;
      await atPatch(tableId, recId, { [fieldName]: newVal });
      const rec = (vType === 'Truck' ? MAINT.trucks : MAINT.trailers).find(v=>v.id===recId);
      if (rec) rec.fields[fieldName] = newVal;
      _expiryPaint();
    } catch(err) {
      alert('Save failed: ' + err.message);
      _expiryPaint();
    }
  };
  inp.addEventListener('change', save);
  inp.addEventListener('blur', () => { if (td.contains(inp)) _expiryPaint(); });
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') _expiryPaint(); });
}

// Row left-border color based on worst expiry
function _expRowColor(worst) {
  if (worst === null) return 'transparent';
  if (worst < 0)  return '#EF4444';
  if (worst <= 7) return '#EF4444';
  if (worst <= 30) return '#F59E0B';
  if (worst <= 90) return '#0284C7';
  return '#10B981';
}

// Inline text editor for Insurer field
async function _expInsurerEdit(e, recId, vType) {
  e.stopPropagation();
  const td = e.currentTarget;
  if (td.querySelector('input[type="text"]')) return;
  const rec = (vType === 'Truck' ? MAINT.trucks : MAINT.trailers).find(v=>v.id===recId);
  const currentVal = rec?.fields['Insurance Partner'] || '';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = currentVal;
  inp.placeholder = 'Insurer…';
  inp.style.cssText = 'font-size:11px;padding:3px 6px;border:2px solid var(--accent);border-radius:5px;background:var(--bg);color:var(--text);outline:none;width:120px;font-family:"DM Sans",sans-serif';
  td.innerHTML = '';
  td.appendChild(inp);
  inp.focus();
  inp.select();
  const save = async () => {
    const newVal = inp.value.trim() || null;
    td.innerHTML = '<span style="color:var(--accent);font-size:10px">Saving…</span>';
    try {
      const tableId = vType === 'Truck' ? TABLES.TRUCKS : TABLES.TRAILERS;
      await atPatch(tableId, recId, { 'Insurance Partner': newVal });
      if (rec) rec.fields['Insurance Partner'] = newVal;
      _expiryPaint();
    } catch(err) { alert('Save failed: ' + err.message); _expiryPaint(); }
  };
  inp.addEventListener('blur', save);
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') _expiryPaint(); });
}

let _expiryTab = 'all'; // 'all', 'expired', 'expiring30', 'valid'
function _expiryPaint() {
  const truckRows = _expiryVehicleRows(MAINT.trucks, TRUCK_EXPIRY_FIELDS, 'Truck');
  const trailerRows = _expiryVehicleRows(MAINT.trailers, TRAILER_EXPIRY_FIELDS, 'Trailer');

  // KPIs — count per vehicle (not per document)
  const expiredTrucks = truckRows.filter(r => r.worst !== null && r.worst < 0).length;
  const expiring30Trucks = truckRows.filter(r => r.worst !== null && r.worst >= 0 && r.worst <= 30).length;
  const validTrucks = truckRows.filter(r => r.worst === null || r.worst > 30).length;
  const expiredTrailers = trailerRows.filter(r => r.worst !== null && r.worst < 0).length;
  const expiring30Trailers = trailerRows.filter(r => r.worst !== null && r.worst >= 0 && r.worst <= 30).length;
  const validTrailers = trailerRows.filter(r => r.worst === null || r.worst > 30).length;

  // Filter by tab
  const filterRows = (rows) => {
    if (_expiryTab === 'expired') return rows.filter(r => r.worst !== null && r.worst < 0);
    if (_expiryTab === 'expiring30') return rows.filter(r => r.worst !== null && r.worst >= 0 && r.worst <= 30);
    if (_expiryTab === 'valid') return rows.filter(r => r.worst === null || r.worst > 30);
    return rows;
  };
  const fTrucks = filterRows(truckRows);
  const fTrailers = filterRows(trailerRows);

  const tabBtn = (id, label, count) => {
    const active = _expiryTab === id;
    return `<button onclick="_expiryTab='${id}';_expiryPaint()" style="
      padding:7px 16px;font-size:11px;font-weight:${active?'700':'500'};border-radius:8px;border:1px solid ${active?'var(--accent)':'var(--border-mid)'};
      background:${active?'var(--accent)':'var(--bg)'};color:${active?'#fff':'var(--text-mid)'};cursor:pointer;font-family:'Syne',sans-serif;
      transition:all .15s">${label} <span style="font-size:10px;opacity:.7">${count}</span></button>`;
  };

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:12px">
      <div><div class="page-title">Expiry Alerts</div>
        <div class="page-sub">Fleet document expiry overview</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="_expiryPrint()">Print</button>
        <button class="btn btn-ghost" onclick="MAINT._loaded=false;renderExpiryAlerts()">Refresh</button>
      </div>
    </div>

    <div class="mk-kpis">
      <div class="mk-kpi"><div class="mk-kpi-lbl">Expired Trucks</div>
        <div class="mk-kpi-val" style="color:#EF4444">${expiredTrucks}</div></div>
      <div class="mk-kpi"><div class="mk-kpi-lbl">Expiring ≤30d</div>
        <div class="mk-kpi-val" style="color:#F59E0B">${expiring30Trucks + expiring30Trailers}</div></div>
      <div class="mk-kpi"><div class="mk-kpi-lbl">Valid Trucks</div>
        <div class="mk-kpi-val" style="color:#10B981">${validTrucks}</div></div>
      <div class="mk-kpi"><div class="mk-kpi-lbl">Expired Trailers</div>
        <div class="mk-kpi-val" style="color:#EF4444">${expiredTrailers}</div></div>
      <div class="mk-kpi"><div class="mk-kpi-lbl">Valid Trailers</div>
        <div class="mk-kpi-val" style="color:#10B981">${validTrailers}</div></div>
    </div>

    <div style="display:flex;gap:6px;margin-bottom:16px">
      ${tabBtn('all', 'All', truckRows.length + trailerRows.length)}
      ${tabBtn('expired', 'Expired', expiredTrucks + expiredTrailers)}
      ${tabBtn('expiring30', 'Expiring ≤30d', expiring30Trucks + expiring30Trailers)}
      ${tabBtn('valid', 'Valid', validTrucks + validTrailers)}
    </div>

    <!-- TRUCKS SECTION -->
    <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:800;letter-spacing:1px;margin-bottom:8px;color:var(--accent)">
      TRUCKS <span style="font-weight:500;font-size:11px;color:var(--text-dim)">${fTrucks.length} vehicles</span>
    </div>
    <table class="mt" style="margin-bottom:24px">
      <thead><tr>
        <th style="width:30px">#</th><th>Plate</th><th>Brand</th>
        ${TRUCK_EXPIRY_FIELDS.map(ef => `<th class="c">${ef.label}</th>`).join('')}
        <th>Insurer</th>
      </tr></thead>
      <tbody>${fTrucks.length ? fTrucks.map((r, i) => `<tr style="border-left:3px solid ${_expRowColor(r.worst)}">
        <td class="rn">${i+1}</td>
        <td style="font-weight:700;font-size:12px">${r.plate}</td>
        <td style="font-size:11px;color:var(--text-mid)">${r.brand}</td>
        ${r.docs.map(d => _expCell(d, r.id, d.field, 'Truck')).join('')}
        <td style="font-size:11px;color:var(--text-mid);cursor:pointer" onclick="_expInsurerEdit(event,'${r.id}','Truck')">${r.insurer || '<span style=&quot;color:var(--text-dim)&quot;>—</span>'}</td>
      </tr>`).join('') : `<tr><td colspan="${4 + TRUCK_EXPIRY_FIELDS.length}" style="text-align:center;color:var(--text-dim);padding:20px">No trucks in this category</td></tr>`}</tbody>
    </table>

    <!-- TRAILERS SECTION -->
    <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:800;letter-spacing:1px;margin-bottom:8px;color:#7C3AED">
      TRAILERS <span style="font-weight:500;font-size:11px;color:var(--text-dim)">${fTrailers.length} vehicles</span>
    </div>
    <table class="mt">
      <thead><tr>
        <th style="width:30px">#</th><th>Plate</th><th>Brand</th>
        ${TRAILER_EXPIRY_FIELDS.map(ef => `<th class="c">${ef.label}</th>`).join('')}
      </tr></thead>
      <tbody>${fTrailers.length ? fTrailers.map((r, i) => `<tr style="border-left:3px solid ${_expRowColor(r.worst)}">
        <td class="rn">${i+1}</td>
        <td style="font-weight:700;font-size:12px">${r.plate}</td>
        <td style="font-size:11px;color:var(--text-mid)">${r.brand}</td>
        ${r.docs.map(d => _expCell(d, r.id, d.field, 'Trailer')).join('')}
      </tr>`).join('') : `<tr><td colspan="${3 + TRAILER_EXPIRY_FIELDS.length}" style="text-align:center;color:var(--text-dim);padding:20px">No trailers in this category</td></tr>`}</tbody>
    </table>`;
}

function _expiryPrint() {
  const content = document.getElementById('content').innerHTML;
  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Expiry Alerts — Petras Group</title>
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0} body{font-family:'DM Sans',sans-serif;padding:20px;color:#0F172A;font-size:12px}
      .page-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700} .page-sub{font-size:11px;color:#475569;margin-bottom:12px}
      .mk-kpis{display:flex;gap:10px;margin-bottom:14px} .mk-kpi{border:1px solid #ddd;border-left:3px solid #0EA5E9;border-radius:6px;padding:10px 14px;flex:1}
      .mk-kpi-lbl{font-size:9px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px} .mk-kpi-val{font-family:'Syne',sans-serif;font-size:22px;font-weight:700}
      table{width:100%;border-collapse:collapse;border:1px solid #ddd} thead th{padding:6px 8px;font-size:8px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#9CA3AF;background:#F0F5FA;border-bottom:1px solid #ddd;text-align:left}
      tbody td{padding:6px 8px;font-size:11px;border-bottom:1px solid #eee}
      .exp-badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700}
      .exp-overdue{background:#7F1D1D;color:#FEE2E2} .exp-critical{background:#991B1B;color:#FEE2E2} .exp-warning{background:#92400E;color:#FEF3C7}
      .exp-upcoming{background:#78350F;color:#FDE68A} .exp-ok{background:#065F46;color:#D1FAE5} .exp-none{background:#374151;color:#9CA3AF}
      .btn,select{display:none!important} .rn{font-family:'Syne',sans-serif;font-weight:700;color:#9CA3AF}
      @media print{body{padding:10px}}
    </style></head><body>${content}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ═════════════════════════════════════════════════════════════════
// PAGE 2: SERVICE RECORDS
// ═════════════════════════════════════════════════════════════════
let _svcFilters = { vehicle: '', type: '', status: '' };

async function renderServiceRecords() {
  document.getElementById('topbarTitle').textContent = 'Service Records';
  document.getElementById('content').innerHTML = showLoading('Loading service records…');
  try {
    await _maintLoad(true);
    _svcPaint();
  } catch(e) {
    document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Error: ${e.message}</div>`;
    console.error(e);
  }
}

function _svcSetFilter(k, v) { _svcFilters[k] = v; _svcPaint(); }

function _svcPaint() {
  let records = [...MAINT.history].sort((a, b) => (b.fields['Date']||'').localeCompare(a.fields['Date']||''));

  // Apply filters
  if (_svcFilters.vehicle) records = records.filter(r => r.fields['Vehicle Plate'] === _svcFilters.vehicle);
  if (_svcFilters.type)    records = records.filter(r => r.fields['Type'] === _svcFilters.type);
  if (_svcFilters.status)  records = records.filter(r => r.fields['Status'] === _svcFilters.status);

  // KPI calculations
  const allRecs = MAINT.history;
  const costYTD = allRecs.filter(r => (r.fields['Date']||'').startsWith('2026') && (r.fields['Status']==='Completed'||r.fields['Status']==='Done'))
    .reduce((s, r) => s + (r.fields['Cost']||0), 0);
  const svcCount = allRecs.filter(r => (r.fields['Date']||'').startsWith('2026')).length;
  const avgCost = svcCount ? costYTD / svcCount : 0;
  const types = [...new Set(allRecs.map(r => r.fields['Type']).filter(Boolean))].sort();
  const vehicles = [...new Set(allRecs.map(r => r.fields['Vehicle Plate']).filter(Boolean))].sort();
  const statuses = [...new Set(allRecs.map(r => r.fields['Status']).filter(Boolean))].sort();

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:12px">
      <div><div class="page-title">Service Records</div>
        <div class="page-sub">${MAINT.history.length} total · showing ${records.length}</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="_svcOpenForm()">+ New Record</button>
        <button class="btn btn-ghost" onclick="MAINT.history=[];renderServiceRecords()">Refresh</button>
      </div>
    </div>

    <div class="mk-kpis" style="margin-bottom:14px">
      <div class="mk-kpi"><div class="mk-kpi-lbl">Cost YTD</div>
        <div class="mk-kpi-val" style="color:#F1F5F9">${_fmtCost(costYTD)}</div>
        <div style="font-size:11px;color:#64748B;margin-top:2px">2026 total</div></div>
      <div class="mk-kpi"><div class="mk-kpi-lbl">Services YTD</div>
        <div class="mk-kpi-val" style="color:#0284C7">${svcCount}</div>
        <div style="font-size:11px;color:#64748B;margin-top:2px">records</div></div>
      <div class="mk-kpi"><div class="mk-kpi-lbl">Avg Cost</div>
        <div class="mk-kpi-val" style="color:#F59E0B">${_fmtCost(avgCost)}</div>
        <div style="font-size:11px;color:#64748B;margin-top:2px">per service</div></div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <select style="padding:6px 10px;font-size:11px;border:1px solid var(--border-mid);border-radius:6px;background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif"
              onchange="_svcSetFilter('vehicle',this.value)">
        <option value="">All Vehicles</option>
        ${vehicles.map(v => `<option value="${v}" ${_svcFilters.vehicle===v?'selected':''}>${v}</option>`).join('')}
      </select>
      <select style="padding:6px 10px;font-size:11px;border:1px solid var(--border-mid);border-radius:6px;background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif"
              onchange="_svcSetFilter('type',this.value)">
        <option value="">All Types</option>
        ${types.map(t => `<option value="${t}" ${_svcFilters.type===t?'selected':''}>${t}</option>`).join('')}
      </select>
      <select style="padding:6px 10px;font-size:11px;border:1px solid var(--border-mid);border-radius:6px;background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif"
              onchange="_svcSetFilter('status',this.value)">
        <option value="">All Statuses</option>
        ${statuses.map(s => `<option value="${s}" ${_svcFilters.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>

    <table class="mt">
      <thead><tr>
        <th style="width:30px">#</th><th>Date</th><th>Plate</th><th>Type</th><th>Workshop</th><th>Description</th><th class="r">Cost €</th><th>Odometer</th><th>Status</th>
      </tr></thead>
      <tbody>${records.length ? records.map((r, i) => {
        const f = r.fields;
        const statusCls = f['Status']==='Completed'||f['Status']==='Done'?'exp-ok':f['Status']==='Scheduled'?'exp-upcoming':'exp-warning';
        return `<tr onclick="_svcOpenForm('${r.id}')">
          <td class="rn">${i+1}</td>
          <td style="font-size:12px">${_fmtDate(f['Date'])}</td>
          <td style="font-weight:700;font-size:12px">${f['Vehicle Plate']||'—'}</td>
          <td style="font-size:12px">${f['Type']||'—'}</td>
          <td style="font-size:11px;color:var(--text-mid)">${_wsName(f['Workshop'])}</td>
          <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px">${(f['Description']||'').substring(0,60)}</td>
          <td class="r" style="font-size:12px">${_fmtCost(f['Cost'])}</td>
          <td style="font-size:11px">${f['Odometer km']?f['Odometer km'].toLocaleString()+' km':'—'}</td>
          <td><span class="exp-badge ${statusCls}" style="font-size:9px">${f['Status']||'—'}</span></td>
        </tr>`;
      }).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:30px">No service records found</td></tr>'}</tbody>
    </table>
    <div id="mf-container"></div>`;
}

function _svcOpenForm(editId) {
  const rec = editId ? MAINT.history.find(r => r.id === editId) : null;
  const f = rec ? rec.fields : {};

  const allVehicles = [
    ...MAINT.trucks.map(t => ({ plate: t.fields['License Plate']||'', type: 'Truck' })),
    ...MAINT.trailers.map(t => ({ plate: t.fields['License Plate']||'', type: 'Trailer' })),
  ].sort((a,b) => a.plate.localeCompare(b.plate));

  const wsOpts = MAINT.workshops
    .filter(w => w.fields['Active'])
    .map(w => `<option value="${w.id}"${(f['Workshop']||[])[0]===w.id?' selected':''}>${w.fields['Name']||'?'}</option>`)
    .join('');

  const vPlate = f['Vehicle Plate'] || '';
  const vType = f['Vehicle Type'] || '';

  document.getElementById('mf-container').innerHTML = `
    <div class="mf-overlay" onclick="if(event.target===this)this.remove()">
      <div class="mf-modal" role="dialog" aria-modal="true">
        <div class="mf-head"><span>${editId ? 'Edit' : 'New'} Service Record</span>
          <button class="btn btn-ghost" style="padding:4px 8px" onclick="this.closest('.mf-overlay').remove()">✕</button></div>
        <div class="mf-body">
          <div class="mf-row">
            <div class="mf-field"><label>Vehicle</label>
              <select id="mf-vehicle" onchange="_svcVehicleChange(this)">
                <option value="">Select vehicle…</option>
                ${allVehicles.map(v => `<option value="${v.plate}|${v.type}"${vPlate===v.plate?' selected':''}>${v.plate} (${v.type})</option>`).join('')}
              </select>
            </div>
            <div class="mf-field"><label>Date</label>
              <input type="date" id="mf-date" value="${f['Date']?toLocalDate(f['Date']):localToday()}">
            </div>
          </div>
          <div class="mf-row">
            <div class="mf-field"><label>Type</label>
              <select id="mf-type">
                ${['Service','Repair','Inspection','Tyre Change','Accident','Other'].map(t => `<option${f['Type']===t?' selected':''}>${t}</option>`).join('')}
              </select>
            </div>
            <div class="mf-field"><label>Workshop</label>
              <select id="mf-workshop"><option value="">—</option>${wsOpts}</select>
            </div>
          </div>
          <div class="mf-field"><label>Description</label>
            <textarea id="mf-desc" rows="2">${f['Description']||''}</textarea>
          </div>
          <div class="mf-row">
            <div class="mf-field"><label>Cost €</label>
              <input type="number" id="mf-cost" step="0.01" value="${f['Cost']||''}">
            </div>
            <div class="mf-field"><label>Odometer km</label>
              <input type="number" id="mf-odo" value="${f['Odometer km']||''}">
            </div>
            <div class="mf-field"><label>Invoice #</label>
              <input type="text" id="mf-inv" value="${f['Invoice Number']||''}">
            </div>
          </div>
          <div class="mf-field"><label>Parts</label>
            <textarea id="mf-parts" rows="2">${f['Parts']||''}</textarea>
          </div>
          <div class="mf-row">
            <div class="mf-field"><label>Next Service Date</label>
              <input type="date" id="mf-nextdate" value="${f['Next Service Date']||''}">
            </div>
            <div class="mf-field"><label>Next Service km</label>
              <input type="number" id="mf-nextkm" value="${f['Next Service km']||''}">
            </div>
            <div class="mf-field"><label>Status</label>
              <select id="mf-status">
                ${['Completed','Scheduled','In Progress'].map(s => `<option${f['Status']===s?' selected':''}>${s}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="mf-field"><label>Notes</label>
            <textarea id="mf-notes" rows="2">${f['Notes']||''}</textarea>
          </div>
        </div>
        <div class="mf-foot">
          ${editId ? `<button class="btn btn-ghost" style="margin-right:auto;color:var(--danger)" onclick="_svcDelete('${editId}')">Delete</button>` : ''}
          <button class="btn btn-ghost" onclick="this.closest('.mf-overlay').remove()">Cancel</button>
          <button class="btn btn-new-order" onclick="_svcSave('${editId||''}')">Save</button>
        </div>
      </div>
    </div>`;
}

function _svcVehicleChange(sel) {
  // Auto-fill vehicle type from selection
}

async function _svcSave(editId) {
  const vSel = document.getElementById('mf-vehicle').value;
  const [plate, vType] = vSel ? vSel.split('|') : ['',''];
  if (!plate) { toast('Select a vehicle', 'danger'); return; }

  const fields = {
    'Vehicle Plate': plate,
    'Vehicle Type': vType,
    'Date': document.getElementById('mf-date').value || null,
    'Type': document.getElementById('mf-type').value,
    'Description': document.getElementById('mf-desc').value || null,
    'Cost': parseFloat(document.getElementById('mf-cost').value) || null,
    'Odometer km': parseInt(document.getElementById('mf-odo').value) || null,
    'Invoice Number': document.getElementById('mf-inv').value || null,
    'Parts': document.getElementById('mf-parts').value || null,
    'Next Service Date': document.getElementById('mf-nextdate').value || null,
    'Next Service km': parseInt(document.getElementById('mf-nextkm').value) || null,
    'Status': document.getElementById('mf-status').value,
    'Notes': document.getElementById('mf-notes').value || null,
  };
  const wsVal = document.getElementById('mf-workshop').value;
  if (wsVal) fields['Workshop'] = [wsVal];

  try {
    if (editId) {
      await atPatch(TABLES.MAINT_HISTORY, editId, fields);
      toast('Record updated ✓');
    } else {
      await atCreate(TABLES.MAINT_HISTORY, fields);
      toast('Record created ✓');
    }
    document.querySelector('.mf-overlay')?.remove();
    MAINT.history = [];
    renderServiceRecords();
  } catch(e) {
    toast('Error: ' + e.message, 'danger');
  }
}

async function _svcDelete(id) {
  if (!confirm('Delete this service record?')) return;
  try {
    await atDelete(TABLES.MAINT_HISTORY, id);
    toast('Deleted');
    document.querySelector('.mf-overlay')?.remove();
    MAINT.history = [];
    renderServiceRecords();
  } catch(e) { toast('Error', 'danger'); }
}

// ═════════════════════════════════════════════════════════════════
// PAGE 3+4: TRUCKS/TRAILERS HISTORY (shared)
// ═════════════════════════════════════════════════════════════════
let _historyVehicle = { trucks: '', trailers: '' };

async function renderTrucksHistory()   { await _renderHistory('trucks'); }
async function renderTrailersHistory() { await _renderHistory('trailers'); }

async function _renderHistory(vType) {
  const title = vType === 'trucks' ? 'Trucks History' : 'Trailers History';
  document.getElementById('topbarTitle').textContent = title;
  document.getElementById('content').innerHTML = showLoading('Loading history…');
  try {
    await _maintLoad(true);
    _historyPaint(vType);
  } catch(e) {
    document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Error: ${e.message}</div>`;
    console.error(e);
  }
}

function _historyPaint(vType) {
  const vehicles = vType === 'trucks' ? MAINT.trucks : MAINT.trailers;
  const vTypeLabel = vType === 'trucks' ? 'Truck' : 'Trailer';
  // Auto-select first active vehicle if nothing selected
  if (!_historyVehicle[vType]) {
    const first = vehicles.filter(v => v.fields['Active']).sort((a,b) => (a.fields['License Plate']||'').localeCompare(b.fields['License Plate']||''))[0];
    if (first) _historyVehicle[vType] = first.fields['License Plate'] || '';
  }
  const selected = _historyVehicle[vType];

  const vehicleOpts = vehicles
    .filter(v => v.fields['Active'])
    .sort((a,b) => (a.fields['License Plate']||'').localeCompare(b.fields['License Plate']||''))
    .map(v => {
      const p = v.fields['License Plate']||'?';
      return `<option value="${p}"${selected===p?' selected':''}>${p} — ${v.fields['Brand']||''} ${v.fields['Model']||''}</option>`;
    }).join('');

  // Filter history for selected vehicle
  const records = selected
    ? MAINT.history
        .filter(r => r.fields['Vehicle Plate'] === selected && r.fields['Vehicle Type'] === vTypeLabel)
        .sort((a, b) => (b.fields['Date']||'').localeCompare(a.fields['Date']||''))
    : [];

  // Stats
  const year = new Date().getFullYear();
  const ytdRecs = records.filter(r => (r.fields['Date']||'').startsWith(String(year)));
  const totalCostYTD = ytdRecs.reduce((s, r) => s + (r.fields['Cost']||0), 0);
  const avgCost = ytdRecs.length ? totalCostYTD / ytdRecs.length : 0;
  const lastService = records[0]?.fields['Date'] || '—';

  // Vehicle info
  const vRec = selected ? vehicles.find(v => v.fields['License Plate'] === selected) : null;
  const vf = vRec?.fields || {};

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:12px">
      <div><div class="page-title">${vType === 'trucks' ? 'Trucks' : 'Trailers'} History</div>
        <div class="page-sub">Service & maintenance records per vehicle</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="_svcOpenFormForVehicle('${vType}')">+ New Record</button>
        <button class="btn btn-ghost" onclick="MAINT.history=[];_renderHistory('${vType}')">Refresh</button>
      </div>
    </div>

    <div style="margin-bottom:14px">
      <select onchange="_historyVehicle['${vType}']=this.value;_historyPaint('${vType}')"
        style="padding:8px 12px;font-size:13px;border-radius:8px;border:1px solid var(--border-mid);background:var(--bg);color:var(--text);min-width:300px">
        <option value="">Select ${vTypeLabel}…</option>
        ${vehicleOpts}
      </select>
    </div>

    ${selected && vRec ? `
    <div class="mv-card">
      <div><div class="mv-plate">${vf['License Plate']||''}</div>
        <div class="mv-info">${vf['Brand']||''} ${vf['Model']||''} · ${vf['Year']||''}</div></div>
      <div style="display:flex;gap:16px;margin-left:auto">
        <div><div class="mk-kpi-lbl">Cost YTD</div><div style="font-weight:700;font-size:16px">${_fmtCost(totalCostYTD)}</div></div>
        <div><div class="mk-kpi-lbl">Services YTD</div><div style="font-weight:700;font-size:16px">${ytdRecs.length}</div></div>
        <div><div class="mk-kpi-lbl">Avg Cost</div><div style="font-weight:700;font-size:16px">${_fmtCost(avgCost)}</div></div>
        <div><div class="mk-kpi-lbl">Last Service</div><div style="font-weight:700;font-size:16px">${_fmtDate(lastService)}</div></div>
      </div>
    </div>` : ''}

    ${selected ? `
    <table class="mt">
      <thead><tr>
        <th>#</th><th>Date</th><th>Type</th><th>Workshop</th><th>Description</th><th class="r">Cost €</th><th>Odometer</th><th>Status</th>
      </tr></thead>
      <tbody>${records.length ? records.map((r, i) => {
        const f = r.fields;
        const statusCls = f['Status']==='Completed'?'exp-ok':f['Status']==='Scheduled'?'exp-upcoming':'exp-warning';
        return `<tr onclick="_svcOpenForm('${r.id}')">
          <td class="rn">${i+1}</td>
          <td>${_fmtDate(f['Date'])}</td>
          <td>${f['Type']||'—'}</td>
          <td>${_wsName(f['Workshop'])}</td>
          <td style="max-width:250px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(f['Description']||'').substring(0,80)}</td>
          <td class="r">${_fmtCost(f['Cost'])}</td>
          <td>${f['Odometer km']?f['Odometer km'].toLocaleString()+' km':'—'}</td>
          <td><span class="exp-badge ${statusCls}">${f['Status']||'—'}</span></td>
        </tr>`;
      }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text-dim);padding:30px">No records for this vehicle</td></tr>'}</tbody>
    </table>` : '<div style="text-align:center;color:var(--text-dim);padding:60px">Select a vehicle to view history</div>'}
    <div id="mf-container"></div>`;
}

function _svcOpenFormForVehicle(vType) {
  const selected = _historyVehicle[vType];
  _svcOpenForm();
  if (selected) {
    const vTypeLabel = vType === 'trucks' ? 'Truck' : 'Trailer';
    setTimeout(() => {
      const sel = document.getElementById('mf-vehicle');
      if (sel) sel.value = `${selected}|${vTypeLabel}`;
    }, 50);
  }
}

// ═════════════════════════════════════════════════════════════════
// PAGE 5: MAINTENANCE DASHBOARD — Bloomberg-style command center
// ═════════════════════════════════════════════════════════════════

let _maintDashRefreshTimer = null;

function _maintDashSkeleton() {
  return `<div style="padding:0;max-width:1600px">
    <style>
      @keyframes maint-sk { 0% { opacity: 0.4; } 50% { opacity: 0.8; } 100% { opacity: 0.4; } }
      .maint-sk-block { background: #0B1120; border: 1px solid rgba(30,41,59,0.5); border-radius: 8px; animation: maint-sk 1.4s ease-in-out infinite; }
    </style>
    <div style="display:flex;justify-content:space-between;margin-bottom:20px">
      <div>
        <div class="maint-sk-block" style="width:240px;height:24px;margin-bottom:6px;border-radius:6px"></div>
        <div class="maint-sk-block" style="width:180px;height:14px;border-radius:4px"></div>
      </div>
      <div class="maint-sk-block" style="width:120px;height:14px;border-radius:4px;align-self:flex-end"></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px">
      ${[1,2,3,4,5,6].map(() => '<div class="maint-sk-block" style="height:82px"></div>').join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 320px;gap:16px">
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="maint-sk-block" style="height:260px"></div>
          <div class="maint-sk-block" style="height:260px"></div>
        </div>
        <div class="maint-sk-block" style="height:300px"></div>
        <div class="maint-sk-block" style="height:200px"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="maint-sk-block" style="height:240px"></div>
        <div class="maint-sk-block" style="height:160px"></div>
      </div>
    </div>
  </div>`;
}

function _maintExpiryStatus(dateStr) {
  if (!dateStr) return { status: 'unknown', days: null, color: '#64748B' };
  const now = new Date();
  const exp = new Date(dateStr);
  const days = Math.floor((exp - now) / 86400000);
  if (days < 0) return { status: 'expired', days: Math.abs(days), color: '#EF4444' };
  if (days <= 30) return { status: 'expiring', days, color: '#F59E0B' };
  return { status: 'ok', days, color: '#10B981' };
}

function _maintDaysPill(days, status) {
  if (days === null) return '<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(100,116,139,0.1);color:#64748B">N/A</span>';
  const bg = status === 'expired' ? 'rgba(239,68,68,0.12)' : status === 'expiring' ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)';
  const color = status === 'expired' ? '#EF4444' : status === 'expiring' ? '#F59E0B' : '#10B981';
  const label = status === 'expired' ? days + 'd overdue' : days + 'd';
  return `<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;background:${bg};color:${color};white-space:nowrap">${label}</span>`;
}

function _maintCompBlock(dateStr) {
  const s = _maintExpiryStatus(dateStr);
  if (s.status === 'unknown') return '<span style="display:inline-block;width:22px;height:14px;border-radius:3px;background:rgba(71,85,105,0.15)"></span>';
  const bg = s.status === 'expired' ? 'rgba(239,68,68,0.2)' : s.status === 'expiring' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)';
  const border = s.status === 'expired' ? '#EF4444' : s.status === 'expiring' ? '#F59E0B' : '#10B981';
  return `<span style="display:inline-block;width:22px;height:14px;border-radius:3px;background:${bg};border:1px solid ${border}"></span>`;
}

async function renderMaintDash() {
  document.getElementById('topbarTitle').textContent = 'Maintenance Dashboard';
  const c = document.getElementById('content');
  c.innerHTML = _maintDashSkeleton();

  try {
    await _maintLoad(true);

    const now = new Date();
    const today = localToday();
    const dateStr = now.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // ═══ CALCULATIONS ═══
    const activeTrucks = MAINT.trucks.filter(t => t.fields['Active']);
    const activeTrailers = MAINT.trailers.filter(t => t.fields['Active']);
    const totalFleet = activeTrucks.length + activeTrailers.length;

    // Build flat expiry rows for all documents
    const allExpRows = _expiryBuildRows();
    const expiredRows = allExpRows.filter(r => r.days !== null && r.days < 0);
    const expiring30Rows = allExpRows.filter(r => r.days !== null && r.days >= 0 && r.days <= 30);
    const expiring60Rows = allExpRows.filter(r => r.days !== null && r.days >= 0 && r.days <= 60);

    // Per-document-type expired counts
    const kteoExpired = expiredRows.filter(r => r.docType === 'KTEO').length;
    const kekExpired = expiredRows.filter(r => r.docType === 'KEK').length;
    const insExpired = expiredRows.filter(r => r.docType === 'Insurance').length;

    // Compliance: vehicles with no expired docs
    const truckRowsAll = _expiryVehicleRows(MAINT.trucks, TRUCK_EXPIRY_FIELDS, 'Truck');
    const trailerRowsAll = _expiryVehicleRows(MAINT.trailers, TRAILER_EXPIRY_FIELDS, 'Trailer');
    const allVehicleRows = [...truckRowsAll, ...trailerRowsAll];
    const totalExpiredVehicles = allVehicleRows.filter(r => r.worst !== null && r.worst < 0).length;
    const compliancePct = totalFleet ? Math.round((totalFleet - totalExpiredVehicles) / totalFleet * 100) : 100;
    const complianceColor = compliancePct >= 90 ? '#10B981' : compliancePct >= 70 ? '#F59E0B' : '#EF4444';

    // Overdue list (all expired docs sorted worst first)
    const overdueList = expiredRows.slice(0, 12);

    // Expiring soon list (within 60 days, not expired)
    const soonList = expiring60Rows.sort((a,b) => a.days - b.days).slice(0, 12);

    // Recent service records
    const recentSvc = [...MAINT.history]
      .sort((a,b) => (b.fields['Date']||'').localeCompare(a.fields['Date']||''))
      .slice(0, 8);

    // Alert banner
    const totalExpired = expiredRows.length;

    // ═══ RENDER ═══
    c.innerHTML = `
      <style>
        /* ── Maintenance Dashboard scoped styles ── */
        .maint-wrap {
          --m-bg: transparent;
          --m-card: #0B1120;
          --m-card-hover: #0F1B2E;
          --m-border: rgba(30,41,59,0.6);
          --m-border-mid: rgba(30,41,59,0.8);
          --m-text: #E2E8F0;
          --m-text-mid: #94A3B8;
          --m-text-dim: #64748B;
          --m-accent: #38BDF8;
          --m-success: #10B981;
          --m-danger: #EF4444;
          --m-warning: #F59E0B;
          padding: 0; max-width: 1600px;
        }

        .maint-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; padding: 0 2px; }
        .maint-greeting { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.3px; }
        .maint-date { font-size: 12px; color: #64748B; margin-top: 2px; font-weight: 400; }
        .maint-live { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #64748B; letter-spacing: 0.5px; text-transform: uppercase; }
        .maint-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--m-success); animation: maint-pulse 2s infinite; }
        @keyframes maint-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

        /* Alert Banner */
        .maint-alert-banner { background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.15); border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
        .maint-alert-icon { width: 28px; height: 28px; border-radius: 50%; background: rgba(239,68,68,0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .maint-alert-text { font-size: 12px; color: #DC2626; font-weight: 500; }

        /* KPI Bar */
        .maint-kpi-bar { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 20px; }
        .maint-kpi { background: var(--m-card); border: 1px solid var(--m-border); border-radius: 8px; padding: 14px 16px; cursor: pointer; transition: all 0.15s ease; position: relative; overflow: hidden; }
        .maint-kpi:hover { border-color: var(--m-border-mid); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
        .maint-kpi-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--m-text-dim); margin-bottom: 6px; }
        .maint-kpi-value { font-family: 'DM Sans', monospace; font-size: 26px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
        .maint-kpi-sub { font-size: 10px; color: var(--m-text-dim); }
        .maint-kpi-glow { position: absolute; top: 0; left: 0; right: 0; height: 2px; opacity: 0.6; }

        /* Section Grid */
        .maint-grid-main { display: grid; grid-template-columns: 1fr 320px; gap: 16px; }
        .maint-left { display: flex; flex-direction: column; gap: 16px; }
        .maint-right { display: flex; flex-direction: column; gap: 12px; }

        /* Cards */
        .maint-card { background: var(--m-card); border: 1px solid var(--m-border); border-radius: 8px; overflow: hidden; }
        .maint-card-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--m-border); }
        .maint-card-title { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--m-text-mid); }
        .maint-card-link { font-size: 10px; color: var(--m-accent); cursor: pointer; text-decoration: none; font-weight: 500; }
        .maint-card-link:hover { color: #7DD3FC; }
        .maint-card-body { padding: 12px 16px; }

        /* Expiry Timeline 2-col */
        .maint-timeline-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        /* Expiry rows inside cards */
        .maint-exp-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--m-border); }
        .maint-exp-row:last-child { border-bottom: none; }
        .maint-exp-plate { font-size: 12px; font-weight: 700; color: var(--m-text); width: 80px; font-family: 'Syne', sans-serif; }
        .maint-exp-doc { font-size: 11px; color: var(--m-text-mid); flex: 1; }
        .maint-exp-date { font-size: 10px; color: var(--m-text-dim); width: 55px; }
        .maint-exp-days { flex-shrink: 0; }

        /* Fleet Overview Table */
        .maint-fleet-table { width: 100%; border-collapse: collapse; }
        .maint-fleet-table th { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--m-text-dim); padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--m-border-mid); }
        .maint-fleet-table td { font-size: 11px; color: var(--m-text); padding: 7px 8px; border-bottom: 1px solid var(--m-border); }
        .maint-fleet-table tbody tr { cursor: pointer; transition: background 0.1s; }
        .maint-fleet-table tbody tr:hover { background: var(--m-card-hover); }

        /* Service table */
        .maint-svc-table { width: 100%; border-collapse: collapse; }
        .maint-svc-table th { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--m-text-dim); padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--m-border-mid); }
        .maint-svc-table td { font-size: 11px; color: var(--m-text); padding: 7px 8px; border-bottom: 1px solid var(--m-border); }

        /* Compliance rows */
        .maint-comp-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
        .maint-comp-plate { font-size: 10px; color: var(--m-text); font-weight: 600; width: 70px; }
        .maint-comp-blocks { display: flex; gap: 3px; }

        /* Empty state */
        .maint-empty { text-align: center; padding: 20px; color: var(--m-text-dim); font-size: 11px; }

        @media (max-width: 1200px) {
          .maint-kpi-bar { grid-template-columns: repeat(3, 1fr); }
          .maint-grid-main { grid-template-columns: 1fr; }
          .maint-timeline-grid { grid-template-columns: 1fr; }
        }
      </style>

      <div class="maint-wrap">
        <!-- Header -->
        <div class="maint-header">
          <div>
            <div class="maint-greeting">Maintenance Dashboard</div>
            <div class="maint-date">Petras Group Fleet -- ${dateStr}</div>
          </div>
          <div class="maint-live">
            <span class="maint-live-dot"></span>
            LIVE -- refresh every 5 min
          </div>
        </div>

        <!-- Alert Banner -->
        ${totalExpired > 0 ? `<div class="maint-alert-banner">
          <div class="maint-alert-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div class="maint-alert-text">${totalExpired} expired document${totalExpired > 1 ? 's' : ''} require${totalExpired === 1 ? 's' : ''} immediate attention</div>
        </div>` : ''}

        <!-- KPI Bar -->
        <div class="maint-kpi-bar">
          <div class="maint-kpi" onclick="navigate('maint_expiry')">
            <div class="maint-kpi-glow" style="background:linear-gradient(90deg,#0284C7,transparent)"></div>
            <div class="maint-kpi-label">Total Fleet</div>
            <div class="maint-kpi-value" style="color:#38BDF8">${totalFleet}</div>
            <div class="maint-kpi-sub">${activeTrucks.length} trucks / ${activeTrailers.length} trailers</div>
          </div>
          <div class="maint-kpi" onclick="navigate('maint_expiry')">
            <div class="maint-kpi-glow" style="background:linear-gradient(90deg,#EF4444,transparent)"></div>
            <div class="maint-kpi-label">KTEO Expired</div>
            <div class="maint-kpi-value" style="color:${kteoExpired ? '#EF4444' : '#10B981'}">${kteoExpired}</div>
            <div class="maint-kpi-sub">trucks + trailers</div>
          </div>
          <div class="maint-kpi" onclick="navigate('maint_expiry')">
            <div class="maint-kpi-glow" style="background:linear-gradient(90deg,#EF4444,transparent)"></div>
            <div class="maint-kpi-label">KEK Expired</div>
            <div class="maint-kpi-value" style="color:${kekExpired ? '#EF4444' : '#10B981'}">${kekExpired}</div>
            <div class="maint-kpi-sub">trucks only</div>
          </div>
          <div class="maint-kpi" onclick="navigate('maint_expiry')">
            <div class="maint-kpi-glow" style="background:linear-gradient(90deg,#F59E0B,transparent)"></div>
            <div class="maint-kpi-label">Insurance Expired</div>
            <div class="maint-kpi-value" style="color:${insExpired ? '#F59E0B' : '#10B981'}">${insExpired}</div>
            <div class="maint-kpi-sub">trucks + trailers</div>
          </div>
          <div class="maint-kpi" onclick="navigate('maint_expiry')">
            <div class="maint-kpi-glow" style="background:linear-gradient(90deg,#F59E0B,transparent)"></div>
            <div class="maint-kpi-label">Expiring &lt;30d</div>
            <div class="maint-kpi-value" style="color:${expiring30Rows.length ? '#F59E0B' : '#10B981'}">${expiring30Rows.length}</div>
            <div class="maint-kpi-sub">all document types</div>
          </div>
          <div class="maint-kpi" onclick="navigate('maint_expiry')">
            <div class="maint-kpi-glow" style="background:linear-gradient(90deg,${complianceColor},transparent)"></div>
            <div class="maint-kpi-label">Fleet Compliance</div>
            <div class="maint-kpi-value" style="color:${complianceColor}">${compliancePct}%</div>
            <div class="maint-kpi-sub">${totalFleet - totalExpiredVehicles}/${totalFleet} compliant</div>
          </div>
        </div>

        <!-- Main Grid -->
        <div class="maint-grid-main">
          <!-- Left Column -->
          <div class="maint-left">

            <!-- Expiry Timeline -->
            <div class="maint-timeline-grid">
              <!-- OVERDUE -->
              <div class="maint-card">
                <div class="maint-card-header">
                  <div class="maint-card-title" style="color:#EF4444">OVERDUE</div>
                  <span class="maint-card-link" onclick="navigate('maint_expiry')">&#8594; Expiry Alerts</span>
                </div>
                <div class="maint-card-body">
                  ${overdueList.length ? overdueList.map(r => {
                    const s = _maintExpiryStatus(r.date);
                    const dateDisp = r.date ? r.date.substring(8,10) + '/' + r.date.substring(5,7) : '--';
                    return `<div class="maint-exp-row">
                      <div class="maint-exp-plate">${r.plate}</div>
                      <div class="maint-exp-doc">${r.docType} (${r.vType})</div>
                      <div class="maint-exp-date">${dateDisp}</div>
                      <div class="maint-exp-days">${_maintDaysPill(s.days, s.status)}</div>
                    </div>`;
                  }).join('') : '<div class="maint-empty">No overdue documents</div>'}
                </div>
              </div>

              <!-- EXPIRING SOON -->
              <div class="maint-card">
                <div class="maint-card-header">
                  <div class="maint-card-title" style="color:#F59E0B">EXPIRING SOON</div>
                  <span style="font-size:10px;color:#64748B">within 60 days</span>
                </div>
                <div class="maint-card-body">
                  ${soonList.length ? soonList.map(r => {
                    const s = _maintExpiryStatus(r.date);
                    const dateDisp = r.date ? r.date.substring(8,10) + '/' + r.date.substring(5,7) : '--';
                    return `<div class="maint-exp-row">
                      <div class="maint-exp-plate">${r.plate}</div>
                      <div class="maint-exp-doc">${r.docType} (${r.vType})</div>
                      <div class="maint-exp-date">${dateDisp}</div>
                      <div class="maint-exp-days">${_maintDaysPill(s.days, s.status)}</div>
                    </div>`;
                  }).join('') : '<div class="maint-empty">No documents expiring soon</div>'}
                </div>
              </div>
            </div>

            <!-- Fleet Overview Table -->
            <div class="maint-card">
              <div class="maint-card-header">
                <div class="maint-card-title">FLEET OVERVIEW -- TRUCKS</div>
                <span style="font-size:10px;color:#64748B">${activeTrucks.length} active</span>
              </div>
              <div class="maint-card-body" style="padding:0">
                <table class="maint-fleet-table">
                  <thead><tr>
                    <th>Plate</th><th>Brand</th><th>Model</th>
                    <th style="text-align:center">KT</th>
                    <th style="text-align:center">KK</th>
                    <th style="text-align:center">INS</th>
                    <th style="text-align:center">Status</th>
                  </tr></thead>
                  <tbody>
                    ${activeTrucks.map(t => {
                      const f = t.fields;
                      const kt = _maintExpiryStatus(f['KTEO Expiry']);
                      const kk = _maintExpiryStatus(f['KEK Expiry']);
                      const ins = _maintExpiryStatus(f['Insurance Expiry']);
                      const worst = [kt, kk, ins].filter(s => s.days !== null).sort((a,b) => {
                        const da = a.status === 'expired' ? -a.days : a.days;
                        const db = b.status === 'expired' ? -b.days : b.days;
                        return da - db;
                      })[0];
                      const statusLabel = !worst ? 'N/A' : worst.status === 'expired' ? 'EXPIRED' : worst.status === 'expiring' ? 'ATTENTION' : 'OK';
                      const statusColor = !worst ? '#64748B' : worst.status === 'expired' ? '#EF4444' : worst.status === 'expiring' ? '#F59E0B' : '#10B981';
                      return `<tr onclick="navigate('maint_expiry')">
                        <td style="font-weight:700">${f['License Plate'] || '--'}</td>
                        <td style="color:#94A3B8">${f['Brand'] || '--'}</td>
                        <td style="color:#94A3B8">${f['Model'] || '--'}</td>
                        <td style="text-align:center">${_maintCompBlock(f['KTEO Expiry'])}</td>
                        <td style="text-align:center">${_maintCompBlock(f['KEK Expiry'])}</td>
                        <td style="text-align:center">${_maintCompBlock(f['Insurance Expiry'])}</td>
                        <td style="text-align:center;font-size:9px;font-weight:700;letter-spacing:0.5px;color:${statusColor}">${statusLabel}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Recent Service -->
            <div class="maint-card">
              <div class="maint-card-header">
                <div class="maint-card-title">RECENT SERVICE</div>
                <span class="maint-card-link" onclick="navigate('maint_svc')">&#8594; Service History</span>
              </div>
              <div class="maint-card-body" style="padding:0">
                ${recentSvc.length ? `<table class="maint-svc-table">
                  <thead><tr><th>Date</th><th>Plate</th><th>Type</th><th style="text-align:right">Cost</th></tr></thead>
                  <tbody>
                    ${recentSvc.map(r => { const f = r.fields; return `<tr>
                      <td style="color:#94A3B8">${_fmtDate(f['Date'])}</td>
                      <td style="font-weight:600">${f['Vehicle Plate'] || '--'}</td>
                      <td style="color:#94A3B8">${f['Type'] || '--'}</td>
                      <td style="text-align:right;font-weight:600;color:#E2E8F0">${_fmtCost(f['Cost'])}</td>
                    </tr>`; }).join('')}
                  </tbody>
                </table>` : '<div class="maint-empty">No service records yet</div>'}
              </div>
            </div>

          </div>

          <!-- Right Panel -->
          <div class="maint-right">

            <!-- Compliance Snapshot -->
            <div class="maint-card">
              <div class="maint-card-header">
                <div class="maint-card-title">COMPLIANCE SNAPSHOT</div>
                <span style="font-size:10px;color:${complianceColor};font-weight:700">${compliancePct}%</span>
              </div>
              <div class="maint-card-body" style="padding:8px 16px">
                <div style="display:flex;gap:12px;margin-bottom:10px;font-size:9px;color:#64748B;padding-left:78px">
                  <span style="width:22px;text-align:center">KT</span>
                  <span style="width:22px;text-align:center">KK</span>
                  <span style="width:22px;text-align:center">INS</span>
                </div>
                ${activeTrucks.slice(0, 12).map(t => {
                  const f = t.fields;
                  return `<div class="maint-comp-row">
                    <div class="maint-comp-plate">${f['License Plate'] || '--'}</div>
                    <div class="maint-comp-blocks">
                      ${_maintCompBlock(f['KTEO Expiry'])}
                      ${_maintCompBlock(f['KEK Expiry'])}
                      ${_maintCompBlock(f['Insurance Expiry'])}
                    </div>
                  </div>`;
                }).join('')}
                ${activeTrailers.length ? `
                  <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(30,41,59,0.6);font-size:9px;font-weight:700;color:#64748B;letter-spacing:0.5px;margin-bottom:6px">TRAILERS</div>
                  ${activeTrailers.slice(0, 6).map(t => {
                    const f = t.fields;
                    return `<div class="maint-comp-row">
                      <div class="maint-comp-plate">${f['License Plate'] || '--'}</div>
                      <div class="maint-comp-blocks">
                        ${_maintCompBlock(f['KTEO Expiry'])}
                        ${_maintCompBlock(f['FRC Expiry'])}
                        ${_maintCompBlock(f['Insurance Expiry'])}
                      </div>
                    </div>`;
                  }).join('')}
                ` : ''}
              </div>
            </div>

            <!-- Monthly Cost Summary (placeholder) -->
            <div class="maint-card">
              <div class="maint-card-header">
                <div class="maint-card-title">MONTHLY COST SUMMARY</div>
              </div>
              <div class="maint-card-body">
                <div class="maint-empty" style="padding:30px 20px">
                  <div style="font-size:12px;color:#94A3B8;margin-bottom:4px">Cost tracking coming soon</div>
                  <div style="font-size:10px;color:#64748B">Service costs will be aggregated here monthly</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;

    // Auto-refresh every 5 minutes
    if (_maintDashRefreshTimer) clearInterval(_maintDashRefreshTimer);
    _maintDashRefreshTimer = setInterval(() => {
      if (typeof currentPage !== 'undefined' && currentPage === 'maint_dash') {
        MAINT._loaded = false;
        MAINT.history = [];
        renderMaintDash();
      } else {
        clearInterval(_maintDashRefreshTimer);
        _maintDashRefreshTimer = null;
      }
    }, 5 * 60 * 1000);

  } catch(e) {
    console.error('Maintenance Dashboard error:', e);
    c.innerHTML = `<div style="color:var(--danger);padding:40px">Error: ${e.message}</div>`;
  }
}

// ═════════════════════════════════════════════════════════════════
// PAGE: MAINTENANCE REQUESTS (Work Orders)
// ═════════════════════════════════════════════════════════════════
const MREQ = { data: [], _loaded: false };
let _mreqTab = 'active';

const MREQ_FIELDS = ['Vehicle Plate','Vehicle Type','Description','Priority','Status','Date Reported','Workshop','Notes'];
const MREQ_PRIORITIES = ['SOS','Άμεσα','Κανονικό'];
const MREQ_STATUSES = ['Pending','In Progress','Done'];

async function _mreqLoad(force) {
  if (!MREQ._loaded || force) {
    MREQ.data = await atGetAll(TABLES.MAINT_REQ, { fields: MREQ_FIELDS }, false);
    MREQ._loaded = true;
  }
}

async function renderMaintRequests() {
  document.getElementById('topbarTitle').textContent = 'Work Orders';
  document.getElementById('content').innerHTML = showLoading('Loading work orders…');
  try {
    await _mreqLoad();
    if (!MAINT._loaded) await _maintLoad();
    _mreqPaint();
  } catch(e) {
    document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Error: ${e.message}</div>`;
  }
}

function _mreqPrioBadge(p) {
  if (p === 'SOS') return '<span class="exp-badge exp-overdue">SOS</span>';
  if (p === 'Άμεσα') return '<span class="exp-badge exp-warning">ΆΜΕΣΑ</span>';
  return '<span class="exp-badge exp-ok">ΚΑΝΟΝΙΚΌ</span>';
}
function _mreqStatusBadge(s) {
  if (s === 'Done') return '<span class="exp-badge exp-ok">DONE</span>';
  if (s === 'In Progress') return '<span class="exp-badge" style="background:#1E40AF;color:#DBEAFE">IN PROGRESS</span>';
  return '<span class="exp-badge" style="background:#92400E;color:#FEF3C7">PENDING</span>';
}

// Build auto-generated expiry work orders (≤14 days)
function _mreqExpiryAlerts() {
  const alerts = [];
  const existingPlates = new Set(MREQ.data.map(r => (r.fields['Vehicle Plate']||'').toUpperCase()));
  const check = (vehicles, fields, vType) => {
    for (const v of vehicles) {
      const f = v.fields;
      if (!f['Active']) continue;
      const plate = f['License Plate'] || '';
      for (const ef of fields) {
        const d = f[ef.field];
        if (!d) continue;
        const days = _daysUntil(d);
        if (days !== null && days <= 14) {
          // Skip if a manual work order already exists for same plate + same doc type keyword
          const hasManual = MREQ.data.some(r =>
            (r.fields['Vehicle Plate']||'').toUpperCase() === plate.toUpperCase() &&
            r.fields['Status'] !== 'Done' &&
            (r.fields['Description']||'').toUpperCase().includes(ef.label.toUpperCase())
          );
          if (hasManual) continue;
          alerts.push({
            plate, vType, doc: ef.label, days, date: toLocalDate(d),
            desc: `${ef.label} ${days < 0 ? 'EXPIRED' : 'expiring'} — ${Math.abs(days)}d ${days < 0 ? 'overdue' : 'left'}`,
          });
        }
      }
    }
  };
  check(MAINT.trucks, TRUCK_EXPIRY_FIELDS, 'Truck');
  check(MAINT.trailers, TRAILER_EXPIRY_FIELDS, 'Trailer');
  alerts.sort((a,b) => a.days - b.days);
  return alerts;
}

function _mreqPaint() {
  const all = [...MREQ.data].sort((a,b) => {
    const po = { SOS: 0, 'Άμεσα': 1, 'Κανονικό': 2 };
    const pa = po[a.fields['Priority']] ?? 2;
    const pb = po[b.fields['Priority']] ?? 2;
    if (pa !== pb) return pa - pb;
    return (b.fields['Date Reported']||'').localeCompare(a.fields['Date Reported']||'');
  });

  const active = all.filter(r => r.fields['Status'] !== 'Done');
  const done = all.filter(r => r.fields['Status'] === 'Done');
  const filtered = _mreqTab === 'active' ? active : _mreqTab === 'done' ? done : all;
  const expiryAlerts = _mreqTab !== 'done' ? _mreqExpiryAlerts() : [];

  const pending = all.filter(r => r.fields['Status'] === 'Pending').length;
  const inProg = all.filter(r => r.fields['Status'] === 'In Progress').length;
  const sos = active.filter(r => r.fields['Priority'] === 'SOS').length;

  const tabBtn = (id, label, count) => {
    const act = _mreqTab === id;
    return `<button onclick="_mreqTab='${id}';_mreqPaint()" style="
      padding:7px 16px;font-size:11px;font-weight:${act?'700':'500'};border-radius:8px;border:1px solid ${act?'var(--accent)':'var(--border-mid)'};
      background:${act?'var(--accent)':'var(--bg)'};color:${act?'#fff':'var(--text-mid)'};cursor:pointer;font-family:'Syne',sans-serif;
      transition:all .15s">${label} <span style="font-size:10px;opacity:.7">${count}</span></button>`;
  };

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:12px">
      <div><div class="page-title">Work Orders</div>
        <div class="page-sub">Daily maintenance work orders</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-new-order" onclick="_mreqOpenForm()">+ New Request</button>
        <button class="btn btn-ghost" onclick="MREQ._loaded=false;renderMaintRequests()">Refresh</button>
      </div>
    </div>

    ${sos ? `<div style="background:#7F1D1D;border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:10px 16px;margin-bottom:12px;display:flex;align-items:center;gap:10px">
      <span style="font-size:18px">&#9888;</span>
      <span style="color:#FEE2E2;font-size:13px;font-weight:600">${sos} SOS work order${sos>1?'s':''} — immediate attention required</span>
    </div>` : ''}

    <div class="mk-kpis">
      <div class="mk-kpi"><div class="mk-kpi-lbl">SOS</div>
        <div class="mk-kpi-val" style="color:#EF4444">${sos}</div></div>
      <div class="mk-kpi"><div class="mk-kpi-lbl">Pending</div>
        <div class="mk-kpi-val" style="color:#F59E0B">${pending}</div></div>
      <div class="mk-kpi"><div class="mk-kpi-lbl">In Progress</div>
        <div class="mk-kpi-val" style="color:#3B82F6">${inProg}</div></div>
      <div class="mk-kpi"><div class="mk-kpi-lbl">Completed</div>
        <div class="mk-kpi-val" style="color:#10B981">${done.length}</div></div>
    </div>

    <div style="display:flex;gap:6px;margin-bottom:16px">
      ${tabBtn('active', 'Active', active.length)}
      ${tabBtn('done', 'Completed', done.length)}
      ${tabBtn('all', 'All', all.length)}
    </div>

    <table class="mt">
      <thead><tr>
        <th>#</th><th>Plate</th><th>Description</th><th class="c">Priority</th><th class="c">Status</th><th>Date</th><th>Workshop</th><th>Notes</th><th style="width:100px" class="c">Actions</th>
      </tr></thead>
      <tbody>${expiryAlerts.length ? expiryAlerts.map((ea, i) => `<tr style="background:rgba(146,64,14,0.06)">
          <td><span class="exp-badge exp-warning" style="font-size:8px;padding:1px 5px">AUTO</span></td>
          <td style="font-weight:700;white-space:nowrap">${ea.plate}</td>
          <td>${ea.doc} — <span style="color:${ea.days<0?'#DC2626':'#D97706'};font-weight:700">${ea.days<0?Math.abs(ea.days)+'d OVERDUE':ea.days+'d left'}</span></td>
          <td class="c">${ea.days<0?'<span class="exp-badge exp-overdue">EXPIRED</span>':'<span class="exp-badge exp-warning">EXPIRING</span>'}</td>
          <td class="c"><span class="exp-badge" style="background:#92400E;color:#FEF3C7">AUTO</span></td>
          <td style="white-space:nowrap;font-size:12px">${ea.date.split('-').reverse().join('/')}</td>
          <td style="font-size:12px">${ea.vType}</td>
          <td style="font-size:11px">Expiry ≤14d</td>
          <td class="c" onclick="event.stopPropagation()">
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:10px" onclick="_mreqDismissExpiry('${ea.plate.replace(/'/g,"\\'")}','${ea.doc}','${ea.desc.replace(/'/g,"\\'")}')">✓ Done</button>
          </td>
        </tr>`).join('') : ''}${expiryAlerts.length && filtered.length ? '<tr><td colspan="9" style="padding:4px;background:var(--border);font-size:0"></td></tr>' : ''}${filtered.length ? filtered.map((r, i) => {
        const f = r.fields;
        return `<tr style="${f['Priority']==='SOS'?'background:rgba(127,29,29,0.06)':''}" onclick="_mreqOpenForm('${r.id}')">
          <td class="rn">${i+1}</td>
          <td style="font-weight:700;white-space:nowrap">${f['Vehicle Plate']||'—'}</td>
          <td style="max-width:250px">${f['Description']||'—'}</td>
          <td class="c">${_mreqPrioBadge(f['Priority'])}</td>
          <td class="c">${_mreqStatusBadge(f['Status'])}</td>
          <td style="white-space:nowrap;font-size:12px">${f['Date Reported']?toLocalDate(f['Date Reported']).split('-').reverse().join('/'):'—'}</td>
          <td style="font-size:12px">${f['Workshop']||'—'}</td>
          <td style="font-size:11px;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f['Notes']||''}</td>
          <td class="c" onclick="event.stopPropagation()">
            ${f['Status']!=='Done' ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:10px" onclick="_mreqQuickStatus('${r.id}','Done')">✓ Done</button>` : ''}
          </td>
        </tr>`;
      }).join('') : (expiryAlerts.length ? '' : '<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:30px">No work orders</td></tr>')}</tbody>
    </table>
    <div id="mreq-form-container"></div>`;
}

async function _mreqDismissExpiry(plate, docType, desc) {
  try {
    const fields = {
      'Vehicle Plate': plate,
      'Description': docType + ' — Renewal',
      'Priority': 'SOS',
      'Status': 'Done',
      'Date Reported': localToday(),
      'Notes': desc,
    };
    const created = await atCreate(TABLES.MAINT_REQ, fields);
    MREQ.data.push(created);
    _mreqPaint();
  } catch(e) { alert('Error: ' + e.message); }
}

async function _mreqQuickStatus(recId, newStatus) {
  try {
    await atPatch(TABLES.MAINT_REQ, recId, { Status: newStatus });
    const rec = MREQ.data.find(r => r.id === recId);
    if (rec) rec.fields['Status'] = newStatus;
    _mreqPaint();
  } catch(e) { alert('Error: ' + e.message); }
}

function _mreqOpenForm(editId) {
  const rec = editId ? MREQ.data.find(r => r.id === editId) : null;
  const f = rec ? rec.fields : {};

  const allPlates = [
    ...MAINT.trucks.filter(t=>t.fields['Active']).map(t => t.fields['License Plate']||''),
    ...MAINT.trailers.filter(t=>t.fields['Active']).map(t => t.fields['License Plate']||''),
  ].filter(Boolean).sort();

  const plateOpts = allPlates.map(p => `<option value="${p}"${f['Vehicle Plate']===p?' selected':''}>${p}</option>`).join('');
  const prioOpts = MREQ_PRIORITIES.map(p => `<option value="${p}"${f['Priority']===p?' selected':''}>${p}</option>`).join('');
  const statusOpts = MREQ_STATUSES.map(s => `<option value="${s}"${f['Status']===s?' selected':''}>${s}</option>`).join('');

  const html = `
  <div class="mf-overlay" onclick="if(event.target===this)document.getElementById('mreq-form-container').innerHTML=''">
    <div class="mf-modal" role="dialog" aria-modal="true">
      <div class="mf-head"><span>${editId?'Edit':'New'} Work Order</span>
        <button onclick="document.getElementById('mreq-form-container').innerHTML=''" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text-dim)">✕</button></div>
      <div class="mf-body">
        <div class="mf-row">
          <div class="mf-field"><label>Vehicle Plate</label>
            <select id="mreq-plate"><option value="">— Select —</option>${plateOpts}
            <option value="__custom">Other (type below)</option></select></div>
          <div class="mf-field"><label>Or type plate</label>
            <input id="mreq-plate-custom" value="${f['Vehicle Plate']||''}" placeholder="e.g. CB1286KE"></div>
        </div>
        <div class="mf-row">
          <div class="mf-field"><label>Priority</label>
            <select id="mreq-prio">${prioOpts}</select></div>
          <div class="mf-field"><label>Status</label>
            <select id="mreq-status">${statusOpts}</select></div>
        </div>
        <div class="mf-field"><label>Description</label>
          <textarea id="mreq-desc" rows="3" style="resize:vertical">${f['Description']||''}</textarea></div>
        <div class="mf-row">
          <div class="mf-field"><label>Date Reported</label>
            <input type="date" id="mreq-date" value="${f['Date Reported']?toLocalDate(f['Date Reported']):localToday()}"></div>
          <div class="mf-field"><label>Workshop</label>
            <select id="mreq-workshop">
              <option value="">— Select —</option>
              ${MAINT.workshops.filter(w=>w.fields['Active']).map(w =>
                `<option value="${w.fields['Name']||''}"${f['Workshop']===w.fields['Name']?' selected':''}>${w.fields['Name']||'?'}${w.fields['City']?' — '+w.fields['City']:''}</option>`
              ).join('')}
              <option value="__other"${f['Workshop']&&!MAINT.workshops.find(w=>w.fields['Name']===f['Workshop'])?' selected':''}>Other</option>
            </select></div>
          <div class="mf-field"><label>Est. Cost €</label>
            <input type="number" id="mreq-cost" step="0.01" value="${f['Estimated Cost']||''}" placeholder="0.00"></div>
        </div>
        <div class="mf-field"><label>Notes</label>
          <textarea id="mreq-notes" rows="2" style="resize:vertical">${f['Notes']||''}</textarea></div>
      </div>
      <div class="mf-foot">
        ${editId?`<button class="btn" style="background:#7F1D1D;color:#FEE2E2;margin-right:auto" onclick="_mreqDelete('${editId}')">Delete</button>`:''}
        <button class="btn btn-ghost" onclick="document.getElementById('mreq-form-container').innerHTML=''">Cancel</button>
        <button class="btn btn-new-order" onclick="_mreqSave('${editId||''}')">Save</button>
      </div>
    </div>
  </div>`;
  document.getElementById('mreq-form-container').innerHTML = html;

  const sel = document.getElementById('mreq-plate');
  if (f['Vehicle Plate'] && !allPlates.includes(f['Vehicle Plate'])) sel.value = '__custom';
}

async function _mreqSave(editId) {
  const sel = document.getElementById('mreq-plate');
  const plate = sel.value === '__custom' || !sel.value
    ? document.getElementById('mreq-plate-custom').value.trim()
    : sel.value;
  if (!plate) { alert('Vehicle Plate is required'); return; }

  const wsVal = document.getElementById('mreq-workshop').value;
  const fields = {
    'Vehicle Plate': plate,
    'Description': document.getElementById('mreq-desc').value.trim(),
    'Priority': document.getElementById('mreq-prio').value,
    'Status': document.getElementById('mreq-status').value,
    'Date Reported': document.getElementById('mreq-date').value || null,
    'Workshop': wsVal === '__other' ? null : (wsVal || null),
    'Notes': document.getElementById('mreq-notes').value.trim() || null,
  };
  const costEl = document.getElementById('mreq-cost');
  if (costEl && costEl.value) fields['Estimated Cost'] = parseFloat(costEl.value);

  try {
    if (editId) {
      await atPatch(TABLES.MAINT_REQ, editId, fields);
      const rec = MREQ.data.find(r => r.id === editId);
      if (rec) Object.assign(rec.fields, fields);
    } else {
      const created = await atCreate(TABLES.MAINT_REQ, fields);
      MREQ.data.push(created);
    }
    document.getElementById('mreq-form-container').innerHTML = '';
    _mreqPaint();
  } catch(e) { alert('Save failed: ' + e.message); }
}

async function _mreqDelete(recId) {
  if (!confirm('Delete this work order?')) return;
  try {
    await atDelete(TABLES.MAINT_REQ, recId);
    MREQ.data = MREQ.data.filter(r => r.id !== recId);
    document.getElementById('mreq-form-container').innerHTML = '';
    _mreqPaint();
  } catch(e) { alert('Delete failed: ' + e.message); }
}
