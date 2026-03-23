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
  { field: 'Insurance Expiry',   label: 'Insurance' },
  { field: 'Tachograph Expiry',  label: 'Tachograph' },
  { field: 'ADR Expiry',         label: 'ADR' },
  { field: 'KEK Expiry',         label: 'KEK' },
];
const TRAILER_EXPIRY_FIELDS = [
  { field: 'ATP Expiry',         label: 'ATP' },
  { field: 'KTEO Expiry',        label: 'KTEO' },
  { field: 'Insurance Expiry',   label: 'Insurance' },
  { field: 'FRC Expiry',         label: 'FRC' },
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

/* KPI cards */
.mk-kpis { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
.mk-kpi { background:var(--bg-card); border:1px solid var(--border); border-left:3px solid var(--accent);
  border-radius:10px; padding:14px 18px; flex:1; min-width:100px; }
.mk-kpi-lbl { font-size:10px; font-weight:600; letter-spacing:.5px; color:var(--text-dim); text-transform:uppercase; margin-bottom:6px; }
.mk-kpi-val { font-family:'Syne',sans-serif; font-size:28px; font-weight:700; line-height:1; }

/* tables */
.mt { width:100%; border-collapse:collapse; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
.mt thead th { padding:9px 10px; font-size:10px; font-weight:600; letter-spacing:.8px; text-transform:uppercase;
  color:var(--text-dim); text-align:left; border-bottom:1px solid var(--border); background:#F0F5FA; white-space:nowrap; }
.mt tbody td { padding:10px 10px; font-size:13px; border-bottom:1px solid var(--border); vertical-align:middle; }
.mt tbody tr:last-child td { border-bottom:none; }
.mt tbody tr:hover td { background:var(--bg-hover); cursor:pointer; }
.mt .rn { font-family:'Syne',sans-serif; font-weight:700; color:var(--text-dim); font-size:11px; }
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
function _expiryVehicleRows(vehicles, expiryFields) {
  return vehicles
    .filter(v => v.fields['Active'])
    .map(v => {
      const f = v.fields;
      const docs = expiryFields.map(ef => {
        const d = f[ef.field] || null;
        return { label: ef.label, date: d, days: _daysUntil(d) };
      });
      // Worst (soonest) expiry for sorting
      const worst = docs.reduce((min, d) => {
        if (d.days === null) return min;
        return (min === null || d.days < min) ? d.days : min;
      }, null);
      return { plate: f['License Plate']||'?', brand: f['Brand']||'', model: f['Model']||'', insurer: f['Insurance Partner']||'', docs, worst };
    })
    .sort((a, b) => {
      if (a.worst === null && b.worst === null) return 0;
      if (a.worst === null) return 1;
      if (b.worst === null) return -1;
      return a.worst - b.worst;
    });
}

// Cell with color-coded date
function _expCell(doc) {
  if (!doc.date) return '<td class="c" style="color:var(--text-dim)">—</td>';
  const d = _daysUntil(doc.date);
  const dateStr = doc.date.substring(5); // MM-DD
  let bg = '', color = '';
  if (d < 0)        { bg = '#7F1D1D'; color = '#FEE2E2'; }
  else if (d <= 7)  { bg = '#991B1B'; color = '#FEE2E2'; }
  else if (d <= 30) { bg = '#92400E'; color = '#FEF3C7'; }
  else if (d <= 60) { bg = '#78350F'; color = '#FDE68A'; }
  else              { bg = ''; color = ''; }
  const style = bg ? `background:${bg};color:${color};font-weight:700;border-radius:4px;padding:4px 8px` : '';
  return `<td class="c"><span style="${style}">${dateStr}</span><div style="font-size:9px;color:${d<0?'#FCA5A5':d<=30?'#D97706':'var(--text-dim)'};margin-top:1px">${d}d</div></td>`;
}

let _expiryTab = 'all'; // 'all', 'expired', 'expiring30', 'valid'
function _expiryPaint() {
  const truckRows = _expiryVehicleRows(MAINT.trucks, TRUCK_EXPIRY_FIELDS);
  const trailerRows = _expiryVehicleRows(MAINT.trailers, TRAILER_EXPIRY_FIELDS);

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
      <div class="mk-kpi" style="border-left-color:#991B1B"><div class="mk-kpi-lbl">Expired Trucks</div>
        <div class="mk-kpi-val" style="color:#991B1B">${expiredTrucks}</div></div>
      <div class="mk-kpi" style="border-left-color:#D97706"><div class="mk-kpi-lbl">Expiring ≤30d</div>
        <div class="mk-kpi-val" style="color:#D97706">${expiring30Trucks + expiring30Trailers}</div></div>
      <div class="mk-kpi" style="border-left-color:#059669"><div class="mk-kpi-lbl">Valid Trucks</div>
        <div class="mk-kpi-val" style="color:#059669">${validTrucks}</div></div>
      <div class="mk-kpi" style="border-left-color:#991B1B"><div class="mk-kpi-lbl">Expired Trailers</div>
        <div class="mk-kpi-val" style="color:#991B1B">${expiredTrailers}</div></div>
      <div class="mk-kpi" style="border-left-color:#059669"><div class="mk-kpi-lbl">Valid Trailers</div>
        <div class="mk-kpi-val" style="color:#059669">${validTrailers}</div></div>
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
        <th>#</th><th>Plate</th><th>Brand</th>
        ${TRUCK_EXPIRY_FIELDS.map(ef => `<th class="c">${ef.label}</th>`).join('')}
        <th>Insurer</th>
      </tr></thead>
      <tbody>${fTrucks.length ? fTrucks.map((r, i) => `<tr>
        <td class="rn">${i+1}</td>
        <td style="font-weight:700">${r.plate}</td>
        <td>${r.brand}</td>
        ${r.docs.map(d => _expCell(d)).join('')}
        <td style="font-size:11px">${r.insurer}</td>
      </tr>`).join('') : `<tr><td colspan="${4 + TRUCK_EXPIRY_FIELDS.length}" style="text-align:center;color:var(--text-dim);padding:20px">No trucks in this category</td></tr>`}</tbody>
    </table>

    <!-- TRAILERS SECTION -->
    <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:800;letter-spacing:1px;margin-bottom:8px;color:#7C3AED">
      TRAILERS <span style="font-weight:500;font-size:11px;color:var(--text-dim)">${fTrailers.length} vehicles</span>
    </div>
    <table class="mt">
      <thead><tr>
        <th>#</th><th>Plate</th><th>Brand</th>
        ${TRAILER_EXPIRY_FIELDS.map(ef => `<th class="c">${ef.label}</th>`).join('')}
      </tr></thead>
      <tbody>${fTrailers.length ? fTrailers.map((r, i) => `<tr>
        <td class="rn">${i+1}</td>
        <td style="font-weight:700">${r.plate}</td>
        <td>${r.brand}</td>
        ${r.docs.map(d => _expCell(d)).join('')}
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

function _svcPaint() {
  const records = [...MAINT.history].sort((a, b) => (b.fields['Date']||'').localeCompare(a.fields['Date']||''));

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:12px">
      <div><div class="page-title">Service Records</div>
        <div class="page-sub">${records.length} records</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="_svcOpenForm()">+ New Record</button>
        <button class="btn btn-ghost" onclick="MAINT.history=[];renderServiceRecords()">Refresh</button>
      </div>
    </div>

    <table class="mt">
      <thead><tr>
        <th>#</th><th>Date</th><th>Plate</th><th>Type</th><th>Workshop</th><th>Description</th><th class="r">Cost €</th><th>Odometer</th><th>Status</th>
      </tr></thead>
      <tbody>${records.length ? records.map((r, i) => {
        const f = r.fields;
        const statusCls = f['Status']==='Completed'?'exp-ok':f['Status']==='Scheduled'?'exp-upcoming':'exp-warning';
        return `<tr onclick="_svcOpenForm('${r.id}')">
          <td class="rn">${i+1}</td>
          <td>${_fmtDate(f['Date'])}</td>
          <td style="font-weight:700">${f['Vehicle Plate']||'—'}</td>
          <td>${f['Type']||'—'}</td>
          <td>${_wsName(f['Workshop'])}</td>
          <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(f['Description']||'').substring(0,60)}</td>
          <td class="r">${_fmtCost(f['Cost'])}</td>
          <td>${f['Odometer km']?f['Odometer km'].toLocaleString()+' km':'—'}</td>
          <td><span class="exp-badge ${statusCls}">${f['Status']||'—'}</span></td>
        </tr>`;
      }).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:30px">No service records yet</td></tr>'}</tbody>
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
      <div class="mf-modal">
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
              <input type="date" id="mf-date" value="${f['Date']||new Date().toISOString().split('T')[0]}">
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
// PAGE 5: DASHBOARD (placeholder with basic KPIs)
// ═════════════════════════════════════════════════════════════════
async function renderMaintDash() {
  document.getElementById('topbarTitle').textContent = 'Maintenance Dashboard';
  document.getElementById('content').innerHTML = showLoading('Loading dashboard…');
  try {
    await _maintLoad(true);
    const activeTrucks = MAINT.trucks.filter(t => t.fields['Active']).length;
    const activeTrailers = MAINT.trailers.filter(t => t.fields['Active']).length;
    const allRows = _expiryBuildRows();
    const overdue = allRows.filter(r => r.days !== null && r.days < 0).length;
    const critical = allRows.filter(r => r.days !== null && r.days >= 0 && r.days <= 7).length;
    const recentSvc = [...MAINT.history].sort((a,b) => (b.fields['Date']||'').localeCompare(a.fields['Date']||'')).slice(0, 8);

    document.getElementById('content').innerHTML = `
      <div class="page-header" style="margin-bottom:12px">
        <div><div class="page-title">Maintenance Dashboard</div>
          <div class="page-sub">Fleet health overview</div></div>
        <button class="btn btn-ghost" onclick="MAINT._loaded=false;MAINT.history=[];renderMaintDash()">Refresh</button>
      </div>

      <div class="mk-kpis">
        <div class="mk-kpi"><div class="mk-kpi-lbl">Active Trucks</div>
          <div class="mk-kpi-val" style="color:var(--accent)">${activeTrucks}</div></div>
        <div class="mk-kpi"><div class="mk-kpi-lbl">Active Trailers</div>
          <div class="mk-kpi-val" style="color:var(--accent)">${activeTrailers}</div></div>
        <div class="mk-kpi" style="border-left-color:#991B1B"><div class="mk-kpi-lbl">Overdue Docs</div>
          <div class="mk-kpi-val" style="color:#991B1B">${overdue}</div></div>
        <div class="mk-kpi" style="border-left-color:#DC2626"><div class="mk-kpi-lbl">Critical ≤7d</div>
          <div class="mk-kpi-val" style="color:#DC2626">${critical}</div></div>
        <div class="mk-kpi"><div class="mk-kpi-lbl">Workshops</div>
          <div class="mk-kpi-val">${MAINT.workshops.filter(w=>w.fields['Active']).length}</div></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:12px;font-weight:700;margin-bottom:8px;letter-spacing:.5px">EXPIRING SOON</div>
          <table class="mt"><thead><tr><th>Plate</th><th>Document</th><th>Status</th></tr></thead>
          <tbody>${allRows.filter(r=>r.days!==null&&r.days<=30).slice(0,10).map(r => `<tr>
            <td style="font-weight:700">${r.plate}</td><td>${r.docType}</td><td>${_expBadge(r.days)}</td>
          </tr>`).join('')||'<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:20px">All clear!</td></tr>'}</tbody></table>
        </div>
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:12px;font-weight:700;margin-bottom:8px;letter-spacing:.5px">RECENT SERVICE</div>
          <table class="mt"><thead><tr><th>Date</th><th>Plate</th><th>Type</th><th class="r">Cost</th></tr></thead>
          <tbody>${recentSvc.map(r => {const f=r.fields; return `<tr>
            <td>${_fmtDate(f['Date'])}</td><td style="font-weight:700">${f['Vehicle Plate']||'—'}</td>
            <td>${f['Type']||'—'}</td><td class="r">${_fmtCost(f['Cost'])}</td>
          </tr>`;}).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:20px">No records yet</td></tr>'}</tbody></table>
        </div>
      </div>`;
  } catch(e) {
    document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Error: ${e.message}</div>`;
    console.error(e);
  }
}
