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

/**
 * Ποια έγγραφα ισχύουν πραγματικά για ΑΥΤΟ το όχημα.
 *
 * Το FRC είναι πιστοποιητικό ψυκτικού θαλάμου (ATP): οι κουρτίνες δεν το
 * εκδίδουν ποτέ, οπότε το κενό πεδίο ΔΕΝ είναι έλλειψη. Μέχρι 6-8-2026 η σελίδα
 * μετρούσε 7 κουρτίνες ως «λείπει έγγραφο» χωρίς λόγο.
 *
 * Το FRC (ATP) απαιτείται για **διεθνείς** μεταφορές ευπαθών. Ένα ψυγείο που
 * κάνει μόνο εθνικές/τοπικές παραδόσεις δεν το χρειάζεται — και ο τύπος του
 * οχήματος ΔΕΝ το εκφράζει αυτό. Γι' αυτό υπάρχει ρητή σήμανση στα Notes:
 * γράφοντας `NO-FRC` σε μια ρυμούλκα, παύει να ζητείται FRC γι' αυτήν.
 * Ο owner το ρυθμίζει μόνος του από το UI, χωρίς deploy.
 * (owner 6-8-2026: P41754 και P55494 είναι εθνικών/τοπικών παραδόσεων)
 *
 * ⚠️ Δεν αρκεί σκέτο `type === 'Reefer'`: το P55494 ήταν καταχωρημένο ως
 * «Ρυμούλκα» ενώ είχε FRC — ένα φίλτρο μόνο βάσει τύπου θα έκρυβε πραγματικό
 * συναγερμό σε άλλο όχημα. Γι' αυτό: αν υπάρχει ημερομηνία, παρακολουθείται.
 *
 * TODO: το σωστό μακροπρόθεσμα είναι πεδίο `requires_frc` (ή «εθνικές/διεθνείς»)
 * στον πίνακα trailers, ώστε να μη στηριζόμαστε σε σήμανση μέσα σε ελεύθερο κείμενο.
 */
function _expiryFieldsFor(f, fields) {
  return fields.filter(ef => {
    if (ef.field !== 'FRC Expiry') return true;
    if (/\bNO-FRC\b/i.test(String(f['Notes'] || ''))) return false;
    if (f[ef.field]) return true;
    return String(f['Trailer Type'] || '').trim().toLowerCase() === 'reefer';
  });
}

const MAINT_HISTORY_FIELDS = [
  'Vehicle Plate','Vehicle Type','Date','Type','Description',
  'Workshop','Cost','Odometer km','Parts','Next Service Date',
  'Next Service km','Invoice Number','Notes','Status',
  // Truck/Trailer are the real link to the vehicle; Vehicle Plate stays as a
  // denormalized column for display and search only. Renaming a plate no longer
  // orphans its history (supersedes the HANDOFF.md dual-update rule).
  'Truck','Trailer',
];

// Maintenance categories — derived from 1,152 real service events (2024-2026).
// Owner-approved 2026-08-05, see docs/data-cleanup/MAINT-HISTORY-ANALYSIS-2026-08-05.md §6.1.
// Values are stable keys stored in maint_history.type; labels are display-only.
// Ordered by cost share, with the two catch-alls last.
const MAINT_TYPES = [
  ['Service',    'Προγραμματισμένο σέρβις'],
  ['Tyres',      'Ελαστικά'],
  ['Brakes',     'Φρένα & ανάρτηση'],
  ['Reefer',     'Ψύξη (θάλαμος)'],
  ['Engine',     'Κινητήρας & μετάδοση'],
  ['Electrical', 'Ηλεκτρικά & φωτισμός'],
  ['Body',       'Αμάξωμα & υπερκατασκευή'],
  ['Inspection', 'Έλεγχοι & συμμόρφωση'],
  ['Accident',   'Ζημιά / ατύχημα'],
  ['Other',      'Λοιπά'],
];
const MAINT_TYPE_LABEL = Object.fromEntries(MAINT_TYPES);

/* ── CSS ─────────────────────────────────────────────────────── */
(function(){
  if (document.getElementById('maint-css')) return;
  const s = document.createElement('style'); s.id = 'maint-css';
  s.textContent = `
/* expiry badges */
.exp-badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; letter-spacing:.3px; }
.exp-overdue { background:#7F1D1D; color:#FEE2E2; }
.exp-critical { background:#991B1B; color:#FEE2E2; }
.exp-warning { background:#92400E; color:var(--warning-soft); }
.exp-upcoming { background:#78350F; color:#FDE68A; }
.exp-ok { background:#065F46; color:#D1FAE5; }
.exp-none { background:#374151; color:var(--text-disabled); }

/* KPI cards — dark navy */
.mk-kpis { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
.mk-kpi { background:var(--panel); border:1px solid var(--panel-border);
  border-radius:10px; padding:14px 18px; flex:1; min-width:100px; }
.mk-kpi-lbl { font-size:12px; font-weight:500; letter-spacing:.3px; color:var(--panel-dim); font-family:'DM Sans',sans-serif; margin-bottom:4px; }
.mk-kpi-val { font-family:'Syne',sans-serif; font-size:22px; font-weight:700; line-height:1; color:var(--panel-text); }

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
.mf-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:calc(var(--z-overlay) + 100); display:flex; align-items:center; justify-content:center; }
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
    // TODO(audit): intentionally loads FULL history, not date-filtered. The module
    // needs every record for correctness: last-service-per-vehicle (recentSvc),
    // next-service-due, and the full records view. A date cutoff would hide a
    // vehicle whose last service predates the window and break those calcs. When
    // this table grows large, the right fix is pagination or a last-N-per-vehicle
    // query, NOT a date filter. (The ceo_dashboard MAINT_HISTORY load IS date-filtered,
    // because there it only feeds period cost aggregates.)
    MAINT.history = await atGetAll(TABLES.MAINT_HISTORY, { fields: MAINT_HISTORY_FIELDS }, false);
  }
}

/* ── HELPERS ──────────────────────────────────────────────────── */
function _daysUntil(dateStr) {
  if (!dateStr) return null;
  // C8 fix: use date-only comparison to avoid timezone off-by-one errors.
  // Previous `Math.ceil((d - new Date()) / 864e5)` mixed a midnight-UTC date
  // with a local `now`, causing expiry dates near midnight to report wrong.
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const nDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((dDate - nDate) / 864e5);
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
  // H9 fix: handle all Airtable linked-record shapes + guard MAINT.workshops null.
  // Input can be: null, undefined, string 'recXXX', [string], [{id}], empty array.
  if (!wsArr) return '—';
  if (!MAINT.workshops || !MAINT.workshops.length) return '—';
  let id;
  if (Array.isArray(wsArr)) {
    if (!wsArr.length) return '—';
    id = typeof wsArr[0] === 'string' ? wsArr[0] : wsArr[0]?.id;
  } else if (typeof wsArr === 'string') {
    id = wsArr;
  } else if (typeof wsArr === 'object') {
    id = wsArr.id;
  }
  if (!id) return '—';
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
      for (const ef of _expiryFieldsFor(f, fields)) {
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
  document.getElementById('content').innerHTML = showLoading('Loading certificates…');
  try {
    await _maintLoad();
    _expiryPaint();
  } catch(e) {
    document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Failed to load maintenance data</div>`;
    console.error(e);
  }
}

// Build per-vehicle rows with all expiry fields as columns
function _expiryVehicleRows(vehicles, expiryFields, vType) {
  return vehicles
    .filter(v => v.fields['Active'])
    .map(v => {
      const f = v.fields;
      const docs = _expiryFieldsFor(f, expiryFields).map(ef => {
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
  if (!doc.date) return `<td class="c" style="color:var(--text-mid);${cursor}" ${editAttr}><span style="font-size:11px">—</span></td>`;
  const d = _daysUntil(doc.date);
  const parts = toLocalDate(doc.date).split('-');
  // With documents 852 days overdue, "17/02" is ambiguous by years. The year is
  // the difference between "renew it this month" and "this vehicle has been
  // illegal since 2024". See docs/design/DEEP_AUDIT_2026-08-04/maint_expiry.md ME-3.
  const dateStr = parts[2]+'/'+parts[1]+'/'+parts[0].slice(2);
  let color, daysStr;
  if (d < 0)        { color = '#EF4444'; daysStr = Math.abs(d) + 'ημ. ληγμένο'; }
  else if (d <= 7)  { color = '#EF4444'; daysStr = d + ' ημ.'; }
  else if (d <= 30) { color = 'var(--panel-warn)'; daysStr = d + ' ημ.'; }
  else if (d <= 90) { color = 'var(--accent)'; daysStr = d + ' ημ.'; }
  else              { color = 'var(--panel-ok)'; daysStr = d + ' ημ.'; }
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
      await atSafePatch(tableId, recId, { [fieldName]: newVal });
      const rec = (vType === 'Truck' ? MAINT.trucks : MAINT.trailers).find(v=>v.id===recId);
      if (rec) rec.fields[fieldName] = newVal;
      _expiryPaint();
    } catch(err) {
      showErrorToast('Save failed: ' + err.message);
      _expiryPaint();
    }
  };
  inp.addEventListener('change', save);
  inp.addEventListener('blur', () => { if (td.contains(inp)) _expiryPaint(); });
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') _expiryPaint(); });
}

// Row-level severity encoding was removed, not just restyled.
//
// It started as a 3px coloured left border (the banned side-stripe), so the
// first attempt converted it to a row tint. Measured against live data that
// failed too: 44 of 64 rows came back red, 4 amber, 16 clean. When 69% of a
// table is alarm-red it reads as "everything is on fire", not "look here
// first" — the encoding stops discriminating exactly when it matters most.
//
// Each cell already carries its own expiry colour and its own «ληγμένο» /
// «N ημ.» label, which is strictly more precise: it says WHICH document and
// HOW overdue, not merely that something in this row is wrong. A vehicle in
// good standing is legible by having no coloured cells at all.
//
// Kept as a no-op so the two call sites stay explicit about the decision
// rather than silently losing an attribute.
function _expRowTint(_worst) {
  return '';
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
      await atSafePatch(tableId, recId, { 'Insurance Partner': newVal });
      if (rec) rec.fields['Insurance Partner'] = newVal;
      _expiryPaint();
    } catch(err) { showErrorToast('Save failed: ' + err.message); _expiryPaint(); }
  };
  inp.addEventListener('blur', save);
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') _expiryPaint(); });
}

let _expiryTab = 'all'; // 'all', 'expired', 'expiring30', 'valid'
// Document type to narrow by ('KTEO'|'KEK'|'FRC'|'Insurance'|''), so the
// Maintenance Dashboard KPIs can land on the exact rows they counted instead
// of dumping the reader on an unfiltered list of 64 vehicles.
// See docs/design/DEEP_AUDIT_2026-08-04/maint_dash.md MD-2 / Π2.
let _expiryDocType = '';
let _expirySearch = '';
/**
 * Open Expiry Alerts pre-filtered. Called from the Maintenance Dashboard KPIs.
 * @param {string} tab - 'all'|'expired'|'expiring30'|'valid'
 * @param {string} [docType] - 'KTEO'|'KEK'|'FRC'|'Insurance'
 */
function _expiryGoto(tab, docType) {
  _expiryTab = tab || 'all';
  _expiryDocType = docType || '';
  _expirySearch = '';
  navigate('maint_expiry');
}

function _expiryFilterRows(rows) {
  let out = rows;
  if (_expiryTab === 'expired') out = out.filter(r => r.worst !== null && r.worst < 0);
  if (_expiryTab === 'expiring30') out = out.filter(r => r.worst !== null && r.worst >= 0 && r.worst <= 30);
  if (_expiryTab === 'valid') out = out.filter(r => r.worst === null || r.worst > 30);
  // Keeps only vehicles whose THAT document is expired — matches what the KPI counted.
  if (_expiryDocType) out = out.filter(r => r.docs.some(d => d.label === _expiryDocType && d.days !== null && d.days < 0));
  if (_expirySearch) { const q = _expirySearch; out = out.filter(r => r.plate.toLowerCase().includes(q) || r.brand.toLowerCase().includes(q) || (r.insurer||'').toLowerCase().includes(q)); }
  return out;
}
function _expiryPaint() {
  // SH-2/MA-3 guard: μην ζωγραφίσεις αν ο χρήστης έχει ήδη φύγει.
  if (typeof currentPage !== 'undefined' && currentPage !== 'maint_expiry') return;
  const truckRows = _expiryVehicleRows(MAINT.trucks, TRUCK_EXPIRY_FIELDS, 'Truck');
  const trailerRows = _expiryVehicleRows(MAINT.trailers, TRAILER_EXPIRY_FIELDS, 'Trailer');

  // KPIs — count per vehicle (not per document)
  const expiredTrucks = truckRows.filter(r => r.worst !== null && r.worst < 0).length;
  const expiring30Trucks = truckRows.filter(r => r.worst !== null && r.worst >= 0 && r.worst <= 30).length;
  const validTrucks = truckRows.filter(r => r.worst === null || r.worst > 30).length;
  const expiredTrailers = trailerRows.filter(r => r.worst !== null && r.worst < 0).length;
  const expiring30Trailers = trailerRows.filter(r => r.worst !== null && r.worst >= 0 && r.worst <= 30).length;
  const validTrailers = trailerRows.filter(r => r.worst === null || r.worst > 30).length;

  // Filter by tab + search (shared function)
  const fTrucks = _expiryFilterRows(truckRows);
  const fTrailers = _expiryFilterRows(trailerRows);

  const tabBtn = (id, label, count, sev) => {
    const active = _expiryTab === id;
    const sevColor = sev === 'danger' ? 'var(--danger)' : sev === 'warning' ? 'var(--warning)' : sev === 'success' ? 'var(--success)' : 'var(--text-mid)';
    return `<button class="exp-tab ${active?'active':''}" onclick="_expiryTab='${id}';_expiryPaint()">
      <span>${label}</span>
      <span class="exp-tab-count" style="${active?'':'color:'+sevColor}">${count}</span>
    </button>`;
  };

  const _i = n => (typeof icon === 'function') ? icon(n, 18) : '';
  const compliancePct = (expiredTrucks + expiredTrailers) === 0 ? 100
    : Math.round(((truckRows.length + trailerRows.length - expiredTrucks - expiredTrailers) / Math.max(1, (truckRows.length + trailerRows.length))) * 100);
  const complianceColor = compliancePct >= 90 ? 'var(--panel-ok)' : compliancePct >= 70 ? 'var(--panel-warn)' : '#EF4444';

  // Report the figures this page shows. The key names say what is being
  // counted, because that is the whole confusion this page sat at the centre
  // of: expiredVehicles here vs expiredDocRows on the Maintenance Dashboard.
  if (typeof reportPageMetrics === 'function') reportPageMetrics('maint_expiry', {
    expiredVehicles: expiredTrucks + expiredTrailers,
    expiringVehicles30d: expiring30Trucks + expiring30Trailers,
    validVehicles: validTrucks + validTrailers,
    totalVehicles: truckRows.length + trailerRows.length,
    compliantVehicles: truckRows.length + trailerRows.length - expiredTrucks - expiredTrailers,
    compliancePct,
  });

  // Command Center for expiry status
  const actions = [];
  if (expiredTrucks + expiredTrailers > 0) actions.push({
    icon: (typeof icon === 'function') ? icon('alert_circle', 14) : '',
    // These are VEHICLES with at least one expired document, not documents.
    // Calling them "documents" is why this page said 45 while the Maintenance
    // Dashboard said 57 (which really is the document count) and the main
    // Dashboard said 37 — three numbers for what read as one thing.
    // See docs/design/DEEP_AUDIT_2026-08-04/maint_expiry.md ME-1.
    sev: 'crit', text: `${expiredTrucks + expiredTrailers} οχήματα με ληγμένο έγγραφο — άμεση ανανέωση`
  });
  if (expiring30Trucks + expiring30Trailers > 0) actions.push({
    icon: (typeof icon === 'function') ? icon('clock', 14) : '',
    sev: 'warn', text: `${expiring30Trucks + expiring30Trailers} λήγουν εντός 30 ημερών`
  });
  if (!actions.length) actions.push({
    icon: (typeof icon === 'function') ? icon('check_circle', 14) : '',
    sev: 'ok', text: 'Όλα τα έγγραφα του στόλου σε ισχύ'
  });

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:var(--space-4)">
      <div>
        <div class="page-title">Λήξεις Εγγράφων</div>
        <div class="page-sub">Επισκόπηση συμμόρφωσης εγγράφων στόλου</div>
      </div>
      <div style="display:flex;gap:var(--space-2)">
        <button class="btn btn-ghost btn-sm" onclick="_expiryExportCSV()">${_i('file_text')} Εξαγωγή CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="_expiryPrint()">${_i('file_text')} Εκτύπωση</button>
        <button class="btn btn-ghost btn-sm" onclick="MAINT._loaded=false;renderExpiryAlerts()">${_i('refresh')} Ανανέωση</button>
      </div>
    </div>

    <!-- Command Center banner -->
    ${(typeof buildCommandCenterHTML === 'function') ? buildCommandCenterHTML({
      title: 'ΣΥΜΜΟΡΦΩΣΗ ΣΤΟΛΟΥ',
      pct: compliancePct,
      actions,
      widgets: [],
    }) : ''}

    <!-- KPI Cards v2 — with icons + subtle status bars -->
    <div class="exp-kpis">
      <div class="exp-kpi exp-kpi-danger">
        <div class="exp-kpi-ico">${_i('alert_circle')}</div>
        <div class="exp-kpi-body">
          <div class="exp-kpi-lbl">Οχήματα με ληγμένο</div>
          <div class="exp-kpi-val">${expiredTrucks + expiredTrailers}</div>
          <div class="exp-kpi-sub">${expiredTrucks} φορτηγά · ${expiredTrailers} ρυμούλκες</div>
        </div>
      </div>
      <div class="exp-kpi exp-kpi-warning">
        <div class="exp-kpi-ico">${_i('clock')}</div>
        <div class="exp-kpi-body">
          <div class="exp-kpi-lbl">Λήγουν ≤30 ημ.</div>
          <div class="exp-kpi-val">${expiring30Trucks + expiring30Trailers}</div>
          <div class="exp-kpi-sub">Χρειάζονται προγραμματισμό</div>
        </div>
      </div>
      <div class="exp-kpi exp-kpi-success">
        <div class="exp-kpi-ico">${_i('check_circle')}</div>
        <div class="exp-kpi-body">
          <div class="exp-kpi-lbl">Σε ισχύ</div>
          <div class="exp-kpi-val">${validTrucks + validTrailers}</div>
          <div class="exp-kpi-sub">${validTrucks} φορτηγά · ${validTrailers} ρυμούλκες</div>
        </div>
      </div>
      <div class="exp-kpi exp-kpi-compliance">
        <div class="exp-kpi-ico">${_i('target')}</div>
        <div class="exp-kpi-body">
          <div class="exp-kpi-lbl">Συμμόρφωση</div>
          <div class="exp-kpi-val" style="color:${complianceColor}">${compliancePct}%</div>
          <div class="exp-kpi-bar"><div class="exp-kpi-bar-fill" style="width:${compliancePct}%;background:${complianceColor}"></div></div>
          <!-- The fraction was missing, so "30%" sat next to a "Valid 13" card
               and the two looked contradictory: compliance counts the 6
               expiring-soon vehicles as still compliant, the Valid card does
               not. Showing the numerator makes the difference visible instead
               of leaving the user to guess which number to trust.
               See docs/design/DEEP_AUDIT_2026-08-04/maint_expiry.md ME-2. -->
          <div class="exp-kpi-sub">${truckRows.length + trailerRows.length - expiredTrucks - expiredTrailers}/${truckRows.length + trailerRows.length} χωρίς ληγμένο έγγραφο</div>
        </div>
      </div>
    </div>

    <!-- Tabs v2 -->
    <div class="exp-tab-bar">
      <div class="exp-tab-group">
        ${tabBtn('all', 'Όλα', truckRows.length + trailerRows.length)}
        ${tabBtn('expired', 'Ληγμένα', expiredTrucks + expiredTrailers, 'danger')}
        ${tabBtn('expiring30', 'Λήγουν ≤30 ημ.', expiring30Trucks + expiring30Trailers, 'warning')}
        ${tabBtn('valid', 'Σε ισχύ', validTrucks + validTrailers, 'success')}
      </div>
      ${_expiryDocType ? `<button type="button" class="btn btn-ghost btn-sm" onclick="_expiryDocType='';_expiryPaint()"
        style="background:var(--accent-light);color:var(--accent);font-weight:700">
        Μόνο ${escapeHtml(_expiryDocType)} · καθαρισμός ✕</button>` : ''}
      <div class="exp-search-wrap">
        ${_i('search')}
        <input class="exp-search-input" placeholder="Αναζήτηση πινακίδας ή μάρκας…" value="${_expirySearch}" oninput="_expirySearchFn(this.value)">
      </div>
    </div>

    <!-- TRUCKS SECTION -->
    <div class="exp-section">
      <div class="exp-section-hdr">
        <div class="exp-section-badge" style="background:var(--accent-light);color:var(--accent)">${_i('truck')}</div>
        <div>
          <div class="exp-section-title">Φορτηγά</div>
          <div class="exp-section-sub">${fTrucks.length} από ${truckRows.length}</div>
        </div>
      </div>
      <div class="exp-table-wrap">
        <table class="mt">
          <thead><tr>
            <th style="width:30px">#</th><th>ΠΙΝΑΚΙΔΑ</th><th>ΜΑΡΚΑ</th>
            ${TRUCK_EXPIRY_FIELDS.map(ef => `<th class="c">${ef.label}</th>`).join('')}
            <th>ΑΣΦΑΛΙΣΤΗΣ</th>
          </tr></thead>
          <tbody>${fTrucks.length ? fTrucks.map((r, i) => `<tr style="${_expRowTint(r.worst)}">
            <td class="rn">${i+1}</td>
            <td style="font-weight:700;font-size:var(--text-sm)">${r.plate}</td>
            <td style="font-size:var(--text-xs);color:var(--text-mid)">${r.brand}</td>
            ${r.docs.map(d => _expCell(d, r.id, d.field, 'Truck')).join('')}
            <td style="font-size:var(--text-xs);color:var(--text-mid);cursor:pointer" onclick="_expInsurerEdit(event,'${r.id}','Truck')">${r.insurer || '<span style=&quot;color:var(--text-dim)&quot;>—</span>'}</td>
          </tr>`).join('') : `<tr><td colspan="${4 + TRUCK_EXPIRY_FIELDS.length}" style="text-align:center;color:var(--text-dim);padding:var(--space-6)">Κανένα φορτηγό σε αυτή την κατηγορία</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <!-- TRAILERS SECTION -->
    <div class="exp-section">
      <div class="exp-section-hdr">
        <div class="exp-section-badge" style="background:rgba(124,58,237,0.12);color:#7C3AED">${_i('package')}</div>
        <div>
          <div class="exp-section-title">Ρυμούλκες</div>
          <div class="exp-section-sub">${fTrailers.length} από ${trailerRows.length}</div>
        </div>
      </div>
      <div class="exp-table-wrap">
        <table class="mt">
          <thead><tr>
            <th style="width:30px">#</th><th>ΠΙΝΑΚΙΔΑ</th><th>ΜΑΡΚΑ</th>
            ${TRAILER_EXPIRY_FIELDS.map(ef => `<th class="c">${ef.label}</th>`).join('')}
          </tr></thead>
          <tbody>${fTrailers.length ? fTrailers.map((r, i) => `<tr style="${_expRowTint(r.worst)}">
            <td class="rn">${i+1}</td>
            <td style="font-weight:700;font-size:var(--text-sm)">${r.plate}</td>
            <td style="font-size:var(--text-xs);color:var(--text-mid)">${r.brand}</td>
            ${r.docs.map(d => _expCell(d, r.id, d.field, 'Trailer')).join('')}
          </tr>`).join('') : `<tr><td colspan="${3 + TRAILER_EXPIRY_FIELDS.length}" style="text-align:center;color:var(--text-dim);padding:var(--space-6)">Καμία ρυμούλκα σε αυτή την κατηγορία</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

function _expirySearchFn(v) { _expirySearch = v.toLowerCase().trim(); _expiryPaint(); }

function _expiryExportCSV() {
  const truckRows = _expiryVehicleRows(MAINT.trucks, TRUCK_EXPIRY_FIELDS, 'Truck');
  const trailerRows = _expiryVehicleRows(MAINT.trailers, TRAILER_EXPIRY_FIELDS, 'Trailer');
  // Apply same shared filter (tab + search)
  const all = [..._expiryFilterRows(truckRows).map(r => ({...r, vType:'Truck'})), ..._expiryFilterRows(trailerRows).map(r => ({...r, vType:'Trailer'}))];
  if (!all.length) { toast('No data to export', 'error'); return; }
  const rows = [['Type','Plate','Brand','Model','KTEO Expiry','KTEO Days','KEK/FRC Expiry','KEK/FRC Days','Insurance Expiry','Insurance Days','Insurer']];
  all.forEach(r => {
    const d = r.docs;
    rows.push([r.vType, r.plate, r.brand, r.model,
      d[0]?.date||'', d[0]?.days??'', d[1]?.date||'', d[1]?.days??'', d[2]?.date||'', d[2]?.days??'', r.insurer]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `fleet_expiry_${localToday()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  toast('CSV exported');
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
  document.getElementById('content').innerHTML = showLoading('Loading service records…');
  try {
    await _maintLoad(true);
    _svcPaint();
  } catch(e) {
    document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Failed to load maintenance data</div>`;
    console.error(e);
  }
}

function _svcSetFilter(k, v) { _svcFilters[k] = v; _svcPaint(); }

function _svcPaint() {
  // SH-2/MA-3 guard: μην ζωγραφίσεις αν ο χρήστης έχει ήδη φύγει.
  if (typeof currentPage !== 'undefined' && currentPage !== 'maint_svc') return;
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

  const _i = n => (typeof icon === 'function') ? icon(n, 18) : '';
  const currentYear = new Date().getFullYear();

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:var(--space-4)">
      <div>
        <div class="page-title">Service Records</div>
        <div class="page-sub">${MAINT.history.length} total · showing ${records.length}</div>
      </div>
      <div style="display:flex;gap:var(--space-2)">
        <button class="btn btn-primary btn-sm" onclick="_svcOpenForm()">${_i('plus')} Νέα Εγγραφή</button>
        <button class="btn btn-ghost btn-sm" onclick="MAINT.history=[];renderServiceRecords()">${_i('refresh')} Refresh</button>
      </div>
    </div>

    <!-- KPI Cards v2 -->
    <div class="exp-kpis">
      <div class="exp-kpi" style="color:var(--accent)">
        <div class="exp-kpi-ico">${_i('trending_up')}</div>
        <div class="exp-kpi-body">
          <div class="exp-kpi-lbl">Cost YTD</div>
          <div class="exp-kpi-val">${_fmtCost(costYTD)}</div>
          <div class="exp-kpi-sub">${currentYear} total</div>
        </div>
      </div>
      <div class="exp-kpi" style="color:var(--text-mid)">
        <div class="exp-kpi-ico">${_i('clipboard')}</div>
        <div class="exp-kpi-body">
          <div class="exp-kpi-lbl">Services YTD</div>
          <div class="exp-kpi-val">${svcCount}</div>
          <div class="exp-kpi-sub">records</div>
        </div>
      </div>
      <div class="exp-kpi exp-kpi-warning">
        <div class="exp-kpi-ico">${_i('target')}</div>
        <div class="exp-kpi-body">
          <div class="exp-kpi-lbl">Avg Cost</div>
          <div class="exp-kpi-val">${_fmtCost(avgCost)}</div>
          <div class="exp-kpi-sub">per service</div>
        </div>
      </div>
    </div>

    <!-- Filter bar -->
    <div class="exp-tab-bar">
      <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
        <select class="svc-filter" onchange="_svcSetFilter('vehicle',this.value)">
          <option value="">Όχημα: Όλα</option>
          ${vehicles.map(v => `<option value="${v}" ${_svcFilters.vehicle===v?'selected':''}>${v}</option>`).join('')}
        </select>
        <select class="svc-filter" onchange="_svcSetFilter('type',this.value)">
          <option value="">Τύπος: Όλοι</option>
          ${types.map(t => `<option value="${t}" ${_svcFilters.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
        <select class="svc-filter" onchange="_svcSetFilter('status',this.value)">
          <option value="">Κατάσταση: Όλες</option>
          ${statuses.map(s => `<option value="${s}" ${_svcFilters.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Records table -->
    <div class="exp-section">
      <div class="exp-section-hdr">
        <div class="exp-section-badge" style="background:var(--accent-light);color:var(--accent)">${_i('clipboard')}</div>
        <div>
          <div class="exp-section-title">Όλες οι Εργασίες</div>
          <div class="exp-section-sub">${records.length} records in view</div>
        </div>
      </div>
      <div class="exp-table-wrap">
        <table class="mt">
          <thead><tr>
            <th style="width:30px">#</th><th>Date</th><th>Plate</th><th>Type</th><th>Workshop</th><th>Description</th><th class="r">Cost €</th><th>Odometer</th><th>Status</th>
          </tr></thead>
          <tbody>${records.length ? records.map((r, i) => {
            const f = r.fields;
            const statusCls = f['Status']==='Completed'||f['Status']==='Done'?'exp-ok':f['Status']==='Scheduled'?'exp-upcoming':'exp-warning';
            return `<tr onclick="_svcOpenForm('${r.id}')">
              <td class="rn">${i+1}</td>
              <td style="font-size:var(--text-sm)">${_fmtDate(f['Date'])}</td>
              <td style="font-weight:700;font-size:var(--text-sm)">${f['Vehicle Plate']||'—'}</td>
              <td style="font-size:var(--text-sm)">${f['Type']||'—'}</td>
              <td style="font-size:var(--text-xs);color:var(--text-mid)">${_wsName(f['Workshop'])}</td>
              <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:var(--text-xs)">${(f['Description']||'').substring(0,80)}</td>
              <td class="r" style="font-size:var(--text-sm);font-variant-numeric:tabular-nums">${_fmtCost(f['Cost'])}</td>
              <td style="font-size:var(--text-xs);font-variant-numeric:tabular-nums">${f['Odometer km']?f['Odometer km'].toLocaleString()+' km':'—'}</td>
              <td><span class="exp-badge ${statusCls}" style="font-size:9px">${f['Status']||'—'}</span></td>
            </tr>`;
          }).join('') : `<tr><td colspan="9" style="padding:0">${typeof showEmpty === 'function' ? showEmpty({
            illustration: 'order',
            title: 'Καμία καταγραφή συντήρησης ακόμη',
            description: 'Εδώ καταγράφονται συντηρήσεις, επισκευές και έλεγχοι των οχημάτων του στόλου.',
            action: { label: 'Νέα καταγραφή', onClick: '_svcOpenForm()' }
          }) : '<div style="text-align:center;padding:40px;color:var(--text-dim)">Καμία καταγραφή συντήρησης</div>'}</td></tr>`}</tbody>
        </table>
      </div>
    </div>
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
        <div class="mf-head"><span>${editId ? 'Επεξεργασία' : 'Νέο'} Service</span>
          <button class="btn btn-ghost" style="padding:4px 8px" onclick="this.closest('.mf-overlay').remove()">✕</button></div>
        <div class="mf-body">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <input type="file" id="mf-scanfile" accept="image/*,application/pdf" style="display:none" onchange="_svcScanInvoice(this)">
            <button class="btn btn-scan" type="button" onclick="document.getElementById('mf-scanfile').click()">📄 Σκανάρισμα τιμολογίου (AI)</button>
            <span id="mf-scanstatus" style="font-size:12px;color:var(--text-dim)"></span>
          </div>
          <div class="mf-row">
            <div class="mf-field"><label>Όχημα</label>
              <select id="mf-vehicle" onchange="_svcVehicleChange(this)">
                <option value="">Επιλογή οχήματος…</option>
                ${allVehicles.map(v => `<option value="${v.plate}|${v.type}"${vPlate===v.plate?' selected':''}>${v.plate} (${v.type==='Truck'?'Φορτηγό':'Τρέιλερ'})</option>`).join('')}
              </select>
            </div>
            <div class="mf-field"><label>Ημερομηνία</label>
              <input type="date" id="mf-date" value="${f['Date']?toLocalDate(f['Date']):localToday()}">
            </div>
          </div>
          <div class="mf-row">
            <div class="mf-field"><label>Τύπος</label>
              <select id="mf-type">
                ${MAINT_TYPES.map(([v,l]) => `<option value="${v}"${f['Type']===v?' selected':''}>${l}</option>`).join('')}
              </select>
            </div>
            <div class="mf-field"><label>Συνεργείο</label>
              <select id="mf-workshop"><option value="">—</option>${wsOpts}</select>
            </div>
          </div>
          <div class="mf-field"><label>Περιγραφή</label>
            <textarea id="mf-desc" rows="2">${f['Description']||''}</textarea>
          </div>
          <div class="mf-row">
            <div class="mf-field"><label>Κόστος €</label>
              <input type="number" id="mf-cost" step="0.01" value="${f['Cost']||''}">
            </div>
            <div class="mf-field"><label>Χιλιόμετρα (οδόμετρο)</label>
              <input type="number" id="mf-odo" value="${f['Odometer km']||''}">
            </div>
            <div class="mf-field"><label>Αρ. Τιμολογίου</label>
              <input type="text" id="mf-inv" value="${f['Invoice Number']||''}">
            </div>
          </div>
          <div class="mf-field"><label>Ανταλλακτικά</label>
            <textarea id="mf-parts" rows="2">${f['Parts']||''}</textarea>
          </div>
          <div class="mf-row">
            <div class="mf-field"><label>Επόμενο Service (ημ/νία)</label>
              <input type="date" id="mf-nextdate" value="${f['Next Service Date']||''}">
            </div>
            <div class="mf-field"><label>Επόμενο Service (km)</label>
              <input type="number" id="mf-nextkm" value="${f['Next Service km']||''}">
            </div>
            <div class="mf-field"><label>Κατάσταση</label>
              <select id="mf-status">
                ${[['Completed','Ολοκληρώθηκε'],['Scheduled','Προγραμματισμένο'],['In Progress','Σε εξέλιξη']].map(([v,l]) => `<option value="${v}"${f['Status']===v?' selected':''}>${l}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="mf-field"><label>Σημειώσεις</label>
            <textarea id="mf-notes" rows="2">${f['Notes']||''}</textarea>
          </div>
        </div>
        <div class="mf-foot">
          ${editId ? `<button class="btn btn-ghost" style="margin-right:auto;color:var(--danger)" onclick="_svcDelete('${editId}')">Διαγραφή</button>` : ''}
          <button class="btn btn-ghost" onclick="this.closest('.mf-overlay').remove()">Άκυρο</button>
          <button class="btn btn-new-order" onclick="_svcSave('${editId||''}')">Αποθήκευση</button>
        </div>
      </div>
    </div>`;
}

function _svcVehicleChange(sel) {
  // Auto-fill vehicle type from selection
}

/* ── AI invoice scan → prefill form (verify-before-commit: user reviews, then saves) ── */
async function _svcScanInvoice(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const st = document.getElementById('mf-scanstatus');
  st.textContent = '⏳ Ανάγνωση τιμολογίου…';
  try {
    const pre = await scanPreprocessFile(file);
    const src = { type: 'base64', media_type: pre.mediaType, data: pre.base64 };
    const block = pre.mediaType === 'application/pdf'
      ? { type: 'document', source: src }
      : { type: 'image', source: src };
    const data = await scanCallAnthropic({
      model: SCAN_MODEL_SONNET,
      max_tokens: 1000,
      system: 'You extract data from vehicle service/workshop invoices (Greek or English). Return ONLY JSON: {"date":"YYYY-MM-DD"|null,"cost":number|null,"invoice_number":string|null,"plate":string|null,"odometer_km":number|null,"description":string|null,"parts":string|null,"workshop_name":string|null}. cost = total invoice amount including VAT. plate = vehicle license plate if printed on the invoice. Greek dates DD/MM/YYYY convert to YYYY-MM-DD. description = short summary of the work performed. Unknown fields = null.',
      messages: [{ role: 'user', content: [block, { type: 'text', text: 'Extract the service invoice data as JSON.' }] }],
    });
    const raw = data.content.find(c => c.type === 'text')?.text || '{}';
    const j = (typeof scanExtractJSON === 'function')
      ? scanExtractJSON(raw)
      : JSON.parse(raw.replace(/```json|```/g, '').trim());

    // Fill only fields the user hasn't typed yet
    const setIfEmpty = (id, val) => {
      const el = document.getElementById(id);
      if (el && val != null && val !== '' && !el.value) el.value = val;
    };
    setIfEmpty('mf-date', j.date);
    setIfEmpty('mf-cost', j.cost);
    setIfEmpty('mf-inv', j.invoice_number);
    setIfEmpty('mf-odo', j.odometer_km);
    setIfEmpty('mf-desc', j.description);
    setIfEmpty('mf-parts', j.parts);
    if (j.plate) {
      const norm = s => String(s).replace(/[\s\-]/g, '').toUpperCase();
      const sel = document.getElementById('mf-vehicle');
      if (sel && !sel.value) {
        const hit = [...sel.options].find(o => o.value && norm(o.value.split('|')[0]) === norm(j.plate));
        if (hit) sel.value = hit.value;
      }
    }
    if (j.workshop_name) {
      const ws = document.getElementById('mf-workshop');
      if (ws && !ws.value) {
        const q = String(j.workshop_name).toLowerCase().trim();
        const hit = [...ws.options].find(o => o.value &&
          (o.text.toLowerCase().includes(q) || q.includes(o.text.toLowerCase())));
        if (hit) ws.value = hit.value;
      }
    }
    st.textContent = '✓ Συμπληρώθηκε — ελέγξτε τα πεδία πριν την αποθήκευση';
  } catch (e) {
    st.textContent = '❌ Αποτυχία ανάγνωσης — συμπληρώστε χειροκίνητα';
    if (typeof logError === 'function') logError(e, 'maint_invoice_scan');
  }
}

async function _svcSave(editId) {
  const vSel = document.getElementById('mf-vehicle').value;
  const [plate, vType] = vSel ? vSel.split('|') : ['',''];
  if (!plate) { toast('Επιλέξτε όχημα', 'danger'); return; }

  // Completed records must carry Cost + Odometer km — they feed the per-km
  // wear-rate calibration (TRIP_COSTS_SPEC §10.2 item 10)
  const stVal   = document.getElementById('mf-status').value;
  const costRaw = document.getElementById('mf-cost').value.trim();
  const odoRaw  = document.getElementById('mf-odo').value.trim();
  if (stVal === 'Completed' && (costRaw === '' || odoRaw === '')) {
    toast('Για Ολοκληρωμένο service απαιτούνται Κόστος και Χιλιόμετρα', 'danger');
    return;
  }

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

  // Link to the vehicle record itself. Vehicle Plate above is kept for display and
  // search, but it is no longer what ties the record to a truck or trailer.
  const vList = (vType === 'Truck' ? MAINT.trucks : MAINT.trailers) || [];
  const vRec  = vList.find(v => v.fields['License Plate'] === plate);
  if (!vRec) {
    toast(`Το όχημα ${plate} δεν βρέθηκε στον στόλο`, 'danger');
    return;
  }
  fields[vType === 'Truck' ? 'Truck' : 'Trailer'] = [vRec.id];

  try {
    if (editId) {
      await atSafePatch(TABLES.MAINT_HISTORY, editId, fields);
      toast('Η εγγραφή ενημερώθηκε ✓');
    } else {
      await atCreate(TABLES.MAINT_HISTORY, fields);
      toast('Η εγγραφή δημιουργήθηκε ✓');
    }
    document.querySelector('.mf-overlay')?.remove();
    MAINT.history = [];
    renderServiceRecords();
  } catch(e) {
    reportError('Save failed', e);
  }
}

async function _svcDelete(id) {
  if (!(await confirmAction('Διαγραφή αυτής της εγγραφής service;', { danger: true, confirmLabel: 'Διαγραφή' }))) return;
  try {
    await atSoftDelete(TABLES.MAINT_HISTORY, id);
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
  const title = vType === 'trucks' ? 'Ιστορικό Φορτηγών' : 'Ιστορικό Ρυμουλκών';
  document.getElementById('content').innerHTML = showLoading('Loading history…');
  try {
    await _maintLoad(true);
    _historyPaint(vType);
  } catch(e) {
    document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Failed to load maintenance data</div>`;
    console.error(e);
  }
}

// History UI state per vType
const _historyFilter = { trucks: {}, trailers: {} };

function _historyPaint(vType) {
  const vehicles = vType === 'trucks' ? MAINT.trucks : MAINT.trailers;
  const vTypeLabel = vType === 'trucks' ? 'Truck' : 'Trailer';   // DB value in 'Vehicle Type'
  const vTypeGr    = vType === 'trucks' ? 'φορτηγό' : 'ρυμούλκα'; // display only
  // No auto-selection. The first active plate used to be selected silently, so
  // the page opened on CB0138HO with a full title and an empty history — and
  // an empty history for the wrong vehicle reads exactly like an empty history
  // for the right one. Nothing is selected until someone selects it.
  // See docs/design/DEEP_AUDIT_2026-08-04/maint_trucks.md MT-4 / Π3.
  const selected = _historyVehicle[vType];
  const state = _historyFilter[vType];

  const vehicleOpts = vehicles
    .filter(v => v.fields['Active'])
    .sort((a,b) => (a.fields['License Plate']||'').localeCompare(b.fields['License Plate']||''))
    .map(v => {
      const p = v.fields['License Plate']||'?';
      return `<option value="${p}"${selected===p?' selected':''}>${p} — ${v.fields['Brand']||''} ${v.fields['Model']||''}</option>`;
    }).join('');

  // All records for selected vehicle (for stats)
  const allRecs = selected
    ? MAINT.history
        .filter(r => r.fields['Vehicle Plate'] === selected && r.fields['Vehicle Type'] === vTypeLabel)
        .sort((a, b) => (b.fields['Date']||'').localeCompare(a.fields['Date']||''))
    : [];

  // Available years + types for filters
  const years = [...new Set(allRecs.map(r => (r.fields['Date']||'').slice(0, 4)).filter(Boolean))].sort().reverse();
  const types = [...new Set(allRecs.map(r => r.fields['Type']).filter(Boolean))].sort();

  // Apply filters
  let records = allRecs;
  if (state.year)  records = records.filter(r => (r.fields['Date']||'').startsWith(state.year));
  if (state.type)  records = records.filter(r => r.fields['Type'] === state.type);
  if (state.q) {
    const q = state.q.toLowerCase();
    records = records.filter(r => {
      const f = r.fields;
      return String(f['Description']||'').toLowerCase().includes(q)
          || String(f['Type']||'').toLowerCase().includes(q)
          || _wsName(f['Workshop']).toLowerCase().includes(q);
    });
  }

  // Stats (based on filtered set)
  const year = new Date().getFullYear();
  const ytdRecs = allRecs.filter(r => (r.fields['Date']||'').startsWith(String(year)));
  const prevYearRecs = allRecs.filter(r => (r.fields['Date']||'').startsWith(String(year - 1)));
  const totalCostYTD = ytdRecs.reduce((s, r) => s + (parseFloat(r.fields['Cost'])||0), 0);
  const totalCostPrev = prevYearRecs.reduce((s, r) => s + (parseFloat(r.fields['Cost'])||0), 0);
  const avgCost = ytdRecs.length ? totalCostYTD / ytdRecs.length : 0;
  const lastService = allRecs[0]?.fields['Date'] || '—';

  // Monthly cost for last 12 months (for sparkline)
  const now = new Date();
  const monthlyBuckets = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthlyBuckets[d.toISOString().slice(0, 7)] = 0;
  }
  allRecs.forEach(r => {
    const mKey = (r.fields['Date']||'').slice(0, 7);
    if (mKey in monthlyBuckets) {
      monthlyBuckets[mKey] += parseFloat(r.fields['Cost'])||0;
    }
  });
  const monthlyValues = Object.values(monthlyBuckets);

  // Type breakdown
  const byType = {};
  ytdRecs.forEach(r => {
    const t = r.fields['Type'] || 'Other';
    if (!byType[t]) byType[t] = { count: 0, cost: 0 };
    byType[t].count++;
    byType[t].cost += parseFloat(r.fields['Cost'])||0;
  });
  const typeEntries = Object.entries(byType).sort((a, b) => b[1].cost - a[1].cost);
  const maxTypeCost = typeEntries.length ? typeEntries[0][1].cost : 0;

  // Top workshops (by cost)
  const byWs = {};
  allRecs.forEach(r => {
    const wsName = _wsName(r.fields['Workshop']);
    if (!wsName || wsName === '—') return;
    if (!byWs[wsName]) byWs[wsName] = 0;
    byWs[wsName] += parseFloat(r.fields['Cost'])||0;
  });
  const topWs = Object.entries(byWs).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxWsCost = topWs.length ? topWs[0][1] : 0;

  // MoM delta for cost
  const costDelta = totalCostPrev > 0
    ? Math.round(((totalCostYTD - totalCostPrev) / totalCostPrev) * 100)
    : null;

  // Vehicle info
  const vRec = selected ? vehicles.find(v => v.fields['License Plate'] === selected) : null;
  const vf = vRec?.fields || {};

  const _i = (n, s) => (typeof icon === 'function') ? icon(n, s || 14) : '';

  // SH-2/MA-3 guard: η σελίδα ιστορικού γράφει μετά από αργό fetch.
  if (typeof currentPage !== 'undefined' && currentPage !== (vType === 'trucks' ? 'maint_trucks' : 'maint_trailers')) return;
  document.getElementById('content').innerHTML = `
    <div class="dash-wrap">
      <div class="dash-header">
        <div>
          <div class="dash-greeting">${_i(vType === 'trucks' ? 'truck' : 'truck', 22)} ${vType === 'trucks' ? 'Trucks' : 'Trailers'} History</div>
          <div class="dash-date">Εγγραφές service & συντήρησης ανά όχημα${selected && vRec ? ` · ${vf['License Plate']||''} — ${vf['Brand']||''} ${vf['Model']||''}` : ''}</div>
        </div>
        <div style="display:flex;gap:var(--space-2);align-items:center">
          <button class="btn btn-primary btn-sm" onclick="_svcOpenFormForVehicle('${vType}')">${_i('plus')} Νέα Εγγραφή</button>
          <button class="btn btn-ghost btn-sm" onclick="_historyExport('${vType}')">${_i('file_text')} Export CSV</button>
          <button class="btn btn-secondary btn-sm" onclick="MAINT.history=[];_renderHistory('${vType}')">${_i('refresh')} Refresh</button>
        </div>
      </div>

      <!-- Vehicle + Filter toolbar -->
      <div class="entity-toolbar-v2" style="margin-bottom:var(--space-4)">
        <select class="svc-filter" style="min-width:280px" onchange="_historyVehicle['${vType}']=this.value;_historyFilter['${vType}']={};_historyPaint('${vType}')">
          <option value="">Επίλεξε ${vTypeGr}…</option>
          ${vehicleOpts}
        </select>
        ${selected ? `
          <div class="entity-search-wrap" style="min-width:200px">
            ${_i('search')}
            <input class="entity-search-input" placeholder="Search description / type / workshop…" value="${escapeHtml(state.q || '')}"
              oninput="_historyFilter['${vType}'].q=this.value;_historyPaint('${vType}')">
          </div>
          <select class="svc-filter" onchange="_historyFilter['${vType}'].year=this.value;_historyPaint('${vType}')">
            <option value="">Year: All</option>
            ${years.map(y => `<option value="${y}"${state.year===y?' selected':''}>${y}</option>`).join('')}
          </select>
          <select class="svc-filter" onchange="_historyFilter['${vType}'].type=this.value;_historyPaint('${vType}')">
            <option value="">Type: All</option>
            ${types.map(t => `<option value="${escapeHtml(t)}"${state.type===t?' selected':''}>${escapeHtml(t)}</option>`).join('')}
          </select>
          <span class="entity-count-chip">${records.length}</span>
        ` : ''}
      </div>

      ${!selected ? `
        <div class="dash-card">
          <div class="dash-card-body">
            <div class="dash-empty" style="padding:var(--space-12) var(--space-4)">
              ${_i('truck', 32)}
              <div>Επίλεξε ${vTypeGr} για να δεις το ιστορικό του</div>
            </div>
          </div>
        </div>` : `

      <!-- KPI Bar (4 stats) -->
      <div class="dash-kpi-bar" style="grid-template-columns:repeat(4,1fr)">
        <div class="dash-kpi">
          <div class="dash-kpi-glow" style="background:linear-gradient(90deg,var(--panel-accent),transparent)"></div>
          <div class="dash-kpi-label">${_i('coins', 11)} Cost YTD</div>
          <div class="dash-kpi-value dash-val-accent">${_fmtCost(totalCostYTD)}${costDelta !== null ? `<span class="ceo-delta ${costDelta > 0 ? 'up-bad' : costDelta < 0 ? 'down' : 'flat'}" style="margin-left:8px">${_i(costDelta > 0 ? 'trending_up' : costDelta < 0 ? 'trending_down' : 'minus', 10)}${costDelta >= 0 ? '+' : ''}${costDelta}%</span>` : ''}</div>
          <div class="dash-kpi-sub">${year} vs ${year-1}${totalCostPrev ? ` (€${Math.round(totalCostPrev).toLocaleString()})` : ''}</div>
        </div>
        <div class="dash-kpi">
          <div class="dash-kpi-glow" style="background:linear-gradient(90deg,var(--panel-ok-hi),transparent)"></div>
          <div class="dash-kpi-label">${_i('list_checks', 11)} Services YTD</div>
          <div class="dash-kpi-value dash-val-success">${ytdRecs.length}</div>
          <div class="dash-kpi-sub">${allRecs.length} total all-time</div>
        </div>
        <div class="dash-kpi">
          <div class="dash-kpi-glow" style="background:linear-gradient(90deg,var(--panel-warn),transparent)"></div>
          <div class="dash-kpi-label">${_i('activity', 11)} Avg Cost</div>
          <div class="dash-kpi-value dash-val-warning">${_fmtCost(avgCost)}</div>
          <div class="dash-kpi-sub">per service YTD</div>
        </div>
        <div class="dash-kpi">
          <div class="dash-kpi-glow" style="background:linear-gradient(90deg,var(--panel-accent),transparent)"></div>
          <div class="dash-kpi-label">${_i('clock', 11)} Last Service</div>
          <div class="dash-kpi-value dash-val-accent" style="font-size:22px">${_fmtDate(lastService)}</div>
          <div class="dash-kpi-sub">${lastService !== '—' ? _elRelTime ? _elRelTime(lastService) : '' : 'no services yet'}</div>
        </div>
      </div>

      <!-- Secondary row: sparkline + type breakdown + top workshops -->
      <div class="dash-grid-main" style="margin-bottom:var(--space-4)">
        <div class="dash-left">
          <div class="dash-card">
            <div class="dash-card-header">
              <div class="dash-card-title">${_i('trending_up', 12)} COST TREND · LAST 12 MONTHS</div>
              <span class="dash-card-meta">monthly</span>
            </div>
            <div class="dash-card-body">
              ${monthlyValues.some(v => v > 0)
                ? `<div style="height:60px">${_mdSpark(monthlyValues, 'var(--panel-accent)', 600)}</div>`
                : `<div class="dash-empty" style="padding:var(--space-6) 0">${_i('activity', 24)}<div>No cost data yet</div></div>`}
            </div>
          </div>
          <div class="dash-card">
            <div class="dash-card-header">
              <div class="dash-card-title">${_i('tool', 12)} SERVICE TYPE BREAKDOWN · ${year}</div>
              <span class="dash-card-meta">${typeEntries.length} types</span>
            </div>
            <div class="dash-card-body">
              ${typeEntries.length ? `<div style="display:flex;flex-direction:column;gap:6px">
                ${typeEntries.slice(0, 6).map(([t, stats]) => `
                  <div style="display:flex;align-items:center;gap:8px;font-size:11px">
                    <span style="width:120px;color:var(--dc-text);font-weight:600">${escapeHtml(t)}</span>
                    <div style="flex:1;height:14px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden">
                      <div style="height:100%;width:${maxTypeCost ? (stats.cost/maxTypeCost*100) : 0}%;background:linear-gradient(90deg,var(--panel-accent),#7DD3FC);border-radius:4px;transition:width 0.6s"></div>
                    </div>
                    <span style="width:36px;text-align:right;color:var(--dc-text-mid);font-variant-numeric:tabular-nums;font-size:11px">${stats.count}×</span>
                    <span style="width:64px;text-align:right;color:var(--dc-text);font-variant-numeric:tabular-nums;font-weight:700">${_fmtCost(stats.cost)}</span>
                  </div>`).join('')}
              </div>` : `<div class="dash-empty" style="padding:var(--space-4) 0">${_i('tool', 24)}<div>No services in ${year}</div></div>`}
            </div>
          </div>
        </div>
        <div class="dash-right">
          <div class="dash-card">
            <div class="dash-card-header">
              <div class="dash-card-title">${_i('award', 12)} TOP WORKSHOPS</div>
              <span class="dash-card-meta">all-time</span>
            </div>
            <div class="dash-card-body">
              ${topWs.length ? topWs.map(([name, cost], i) => `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--dc-card-border);font-size:11px">
                  <span style="width:16px;color:var(--dc-accent);font-weight:700">#${i+1}</span>
                  <span style="flex:1;color:var(--dc-text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                  <span style="color:var(--dc-text);font-weight:700;font-variant-numeric:tabular-nums">${_fmtCost(cost)}</span>
                </div>`).join('') : `<div class="dash-empty" style="padding:var(--space-4) 0">${_i('building', 20)}<div>Κανένα συνεργείο καταχωρημένο</div></div>`}
            </div>
          </div>
        </div>
      </div>

      <!-- Records Table -->
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">${_i('file_text', 12)} SERVICE RECORDS</div>
          <span class="dash-card-meta">${records.length} ${allRecs.length !== records.length ? `of ${allRecs.length}` : ''}</span>
        </div>
        <div class="dash-card-body flush">
          ${records.length ? `<table class="md-fleet-table">
            <thead><tr>
              <th style="width:36px">#</th>
              <th style="width:90px">Date</th>
              <th style="width:120px">Type</th>
              <th>Workshop</th>
              <th>Description</th>
              <th style="text-align:right;width:90px">Cost €</th>
              <th style="text-align:right;width:110px">Odometer</th>
              <th style="width:110px;text-align:center">Status</th>
            </tr></thead>
            <tbody>${records.map((r, i) => {
              const f = r.fields;
              const statusCls = f['Status']==='Completed' ? 'green' : f['Status']==='Scheduled' ? 'amber' : 'red';
              return `<tr onclick="_svcOpenForm('${r.id}')">
                <td style="color:var(--dc-text-dim);font-variant-numeric:tabular-nums">${i+1}</td>
                <td style="color:var(--dc-text-mid);font-variant-numeric:tabular-nums;font-size:11px">${_fmtDate(f['Date'])}</td>
                <td style="font-weight:500">${escapeHtml(f['Type']||'—')}</td>
                <td style="color:var(--dc-text-mid)">${escapeHtml(_wsName(f['Workshop']))}</td>
                <td style="max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dc-text-dim);font-size:11px" title="${escapeHtml(f['Description']||'')}">${escapeHtml((f['Description']||'').substring(0, 100))}</td>
                <td class="mono" style="text-align:right;font-weight:700;color:var(--dc-text)">${_fmtCost(f['Cost'])}</td>
                <td style="text-align:right;color:var(--dc-text-mid);font-variant-numeric:tabular-nums;font-size:11px">${f['Odometer km']?f['Odometer km'].toLocaleString()+' km':'—'}</td>
                <td style="text-align:center"><span class="dash-aging-pill ${statusCls}">${f['Status']||'—'}</span></td>
              </tr>`;
            }).join('')}</tbody>
          </table>` : `<div style="padding:var(--space-6)"><div class="dash-empty">${_i('file_text', 28)}<div>No records${allRecs.length ? ' matching filters' : ' for this vehicle yet'}</div></div></div>`}
        </div>
      </div>
      `}
    </div>
    <div id="mf-container"></div>`;
}

// Export history to CSV
function _historyExport(vType) {
  const selected = _historyVehicle[vType];
  if (!selected) { if (typeof toast === 'function') toast('Select a vehicle first', 'error'); return; }
  const vTypeLabel = vType === 'trucks' ? 'Truck' : 'Trailer';
  const recs = MAINT.history
    .filter(r => r.fields['Vehicle Plate'] === selected && r.fields['Vehicle Type'] === vTypeLabel)
    .sort((a, b) => (b.fields['Date']||'').localeCompare(a.fields['Date']||''));
  if (!recs.length) { if (typeof toast === 'function') toast('No records to export'); return; }
  const rows = [['Date','Type','Workshop','Description','Cost','Odometer km','Status']];
  recs.forEach(r => {
    const f = r.fields;
    rows.push([
      f['Date']||'', f['Type']||'', _wsName(f['Workshop']),
      f['Description']||'', f['Cost']||0, f['Odometer km']||'', f['Status']||''
    ]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${vType}-history-${selected.replace(/\s+/g,'_')}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  if (typeof toast === 'function') toast('CSV exported');
}

// Expose globally
window._expiryGoto = _expiryGoto;   // used by the Maintenance Dashboard KPI buttons
window._historyExport = _historyExport;
window._historyFilter = _historyFilter;

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
  if (days <= 30) return { status: 'expiring', days, color: 'var(--panel-warn)' };
  return { status: 'ok', days, color: 'var(--panel-ok)' };
}

function _maintDaysPill(days, status) {
  if (days === null) return '<span class="dash-aging-pill" style="background:rgba(100,116,139,0.12);color:var(--text-dim)">—</span>';
  const cls = status === 'expired' ? 'red' : status === 'expiring' ? 'amber' : 'green';
  // MD-4: «852d late» — a document two years gone rendered exactly like one
  // ten days gone, and in English. Ancient overdues now escalate in wording
  // (months/years), so the reader sees «2 χρ.» instead of doing division.
  let label;
  if (status !== 'expired') label = days + ' ημ.';
  else if (days >= 365) label = (days/365).toFixed(days >= 730 ? 0 : 1).replace('.', ',') + ' χρ. ληγμένο';
  else if (days >= 60)  label = Math.round(days/30) + ' μήνες ληγμένο';
  else                  label = days + ' ημ. ληγμένο';
  return `<span class="dash-aging-pill ${cls}"${status==='expired'&&days>=60?' style="font-weight:700"':''}>${label}</span>`;
}

function _maintCompBlock(dateStr, label) {
  const s = _maintExpiryStatus(dateStr);
  const lbl = label || '';
  if (s.status === 'unknown') return `<span class="md-comp-block none">${lbl || '—'}</span>`;
  return `<span class="md-comp-block ${s.status === 'expired' ? 'expired' : s.status === 'expiring' ? 'warn' : 'ok'}">${lbl || ''}</span>`;
}

// ── Monthly cost aggregator (replaces "coming soon" placeholder) ──
function _maintMonthlyCost(history) {
  const byMonth = {};
  const now = new Date();
  // Initialize last 6 months (even if 0)
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7); // YYYY-MM
    byMonth[key] = 0;
  }
  history.forEach(r => {
    const dateStr = r.fields['Date'];
    if (!dateStr) return;
    const key = dateStr.slice(0, 7);
    if (!(key in byMonth)) return; // outside our 6-month window
    // Bugfix: old `parseFloat(a || b || 0)` returns NaN if `a` is empty string.
    // Proper fallback chain with separate parseFloat calls:
    // C10 fix: previous `parseFloat(a) || parseFloat(b)` incorrectly fell through to
    // the fallback when the primary field was a legitimate 0. Use isFinite() check.
    const c1 = parseFloat(r.fields['Cost']);
    const c2 = parseFloat(r.fields['Total Cost']);
    const cost = Number.isFinite(c1) ? c1 : (Number.isFinite(c2) ? c2 : 0);
    byMonth[key] += cost;
  });
  return Object.entries(byMonth)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([key, cost]) => ({
      key,
      month: ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'][parseInt(key.slice(5,7))-1],
      cost: Math.round(cost)
    }));
}

// ── Inline sparkline for maintenance ──
function _mdSpark(values, color, width) {
  if (!values || values.length < 2) return '';
  const w = width || 120, h = 32, pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (v - min) / range);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastX = pad + (values.length - 1) * step;
  const lastY = pad + (h - pad * 2) * (1 - (values[values.length - 1] - min) / range);
  const areaPoints = `${pad},${h-pad} ${points} ${lastX.toFixed(1)},${h-pad}`;
  const gradId = 'md' + Math.random().toString(36).slice(2,8);
  return `<svg class="md-cost-spark" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <defs><linearGradient id="${gradId}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${areaPoints}" fill="url(#${gradId})"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="1.8" fill="${color}"/>
  </svg>`;
}

// ── MoM delta pill for maintenance ──
function _mdDelta(curr, prev, lowerIsBetter) {
  if (!prev || prev === 0 || isNaN(prev)) return '';
  const diff = curr - prev;
  const pct = Math.round(diff / prev * 100);
  const _ic = (n, s) => (typeof icon === 'function') ? icon(n, s || 10) : '';
  if (pct === 0) return `<span class="dash-kpi-delta flat">${_ic('minus')}0%</span>`;
  const isUp = pct > 0;
  const cls = lowerIsBetter
    ? (isUp ? 'down' : 'up')  // reversed semantics for "down-bad" class naming
    : (isUp ? 'up' : 'down');
  const iconName = isUp ? 'trending_up' : 'trending_down';
  // Use ceo-delta pattern for consistency (has more variants)
  const finalCls = lowerIsBetter
    ? (isUp ? 'down-bad' : 'down')
    : (isUp ? 'up' : 'down-bad');
  return `<span class="ceo-delta ${finalCls}">${_ic(iconName)}${isUp ? '+' : ''}${pct}%</span>`;
}

async function renderMaintDash() {
  const c = document.getElementById('content');
  c.innerHTML = _maintDashSkeleton();
  const _ic = (n, size) => (typeof icon === 'function') ? icon(n, size || 14) : '';

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
    // FRC (the cold-chain certificate, trailers only — see TRAILER_EXPIRY_FIELDS)
    // had no card, so the three cards summed to 53 while the banner above them
    // said 57. Four expired FRCs were simply invisible on this page — on a
    // cold-chain fleet, the one certificate you cannot be caught without.
    // See docs/design/DEEP_AUDIT_2026-08-04/maint_dash.md MD-1.
    const frcExpired = expiredRows.filter(r => r.docType === 'FRC').length;

    // Compliance: vehicles with no expired docs
    const truckRowsAll = _expiryVehicleRows(MAINT.trucks, TRUCK_EXPIRY_FIELDS, 'Truck');
    const trailerRowsAll = _expiryVehicleRows(MAINT.trailers, TRAILER_EXPIRY_FIELDS, 'Trailer');
    const allVehicleRows = [...truckRowsAll, ...trailerRowsAll];
    const totalExpiredVehicles = allVehicleRows.filter(r => r.worst !== null && r.worst < 0).length;
    const compliancePct = totalFleet ? Math.round((totalFleet - totalExpiredVehicles) / totalFleet * 100) : 100;
    const scoreColor = compliancePct >= 90 ? 'var(--panel-ok-hi)' : compliancePct >= 70 ? 'var(--panel-warn)' : 'var(--panel-bad-hi)';

    // Overdue list
    const overdueList = expiredRows.slice(0, 10);
    // Expiring soon list (within 60 days, not expired)
    const soonList = expiring60Rows.sort((a,b) => a.days - b.days).slice(0, 10);

    // Recent service records
    const recentSvc = [...MAINT.history]
      .sort((a,b) => (b.fields['Date']||'').localeCompare(a.fields['Date']||''))
      .slice(0, 8);

    // Monthly cost breakdown (last 6 months, with MoM delta)
    const monthlyCosts = _maintMonthlyCost(MAINT.history);
    const currentMonth = monthlyCosts[monthlyCosts.length - 1]?.cost || 0;
    const prevMonth = monthlyCosts[monthlyCosts.length - 2]?.cost || 0;
    const maxMonthly = Math.max(...monthlyCosts.map(m => m.cost), 1);

    // Service count trend per month (from same history)
    const serviceCountTrend = (() => {
      const byMonth = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        byMonth[d.toISOString().slice(0, 7)] = 0;
      }
      MAINT.history.forEach(r => {
        const key = (r.fields['Date'] || '').slice(0, 7);
        if (key in byMonth) byMonth[key]++;
      });
      return Object.entries(byMonth).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => v);
    })();
    const currentSvcCount = serviceCountTrend[serviceCountTrend.length - 1] || 0;
    const prevSvcCount = serviceCountTrend[serviceCountTrend.length - 2] || 0;

    // Alert banner
    const totalExpired = expiredRows.length;

    // Report the figures this page shows. expiredDocRows is the DOCUMENT count
    // (one row per expired certificate) — deliberately a different key from
    // maint_expiry's expiredVehicles, so the audit compares like with like and
    // can state why the two legitimately differ.
    if (typeof reportPageMetrics === 'function') reportPageMetrics('maint_dash', {
      expiredDocRows: totalExpired,
      kteoExpired, kekExpired, frcExpired, insExpired,
      expiredVehicles: totalExpiredVehicles,
      totalFleet,
      activeTrucks: activeTrucks.length,
      activeTrailers: activeTrailers.length,
      compliantVehicles: totalFleet - totalExpiredVehicles,
      compliancePct,
    });

    // SH-2/MA-3: the fetches above take seconds. If the user has navigated
    // away meanwhile, writing here would paint THIS page under ANOTHER page's
    // title — reproduced live 8/8 (topbar «Drivers», content «Επισκόπηση
    // Στόλου»). currentPage is the router's source of truth.
    if (typeof currentPage !== 'undefined' && currentPage !== 'maint_dash') return;

    // ═══ RENDER ═══
    c.innerHTML = `
      <div class="dash-wrap">
        <!-- Header -->
        <div class="dash-header">
          <div>
            <div class="dash-greeting">Επισκόπηση Στόλου</div>
            <div class="dash-date">Στόλος Petras Group · ${dateStr}</div>
          </div>
          <div class="dash-live">
            <span class="dash-live-dot"></span>
            LIVE — ανανέωση κάθε 5'
          </div>
        </div>

        <!-- Alert Banner -->
        ${totalExpired > 0 ? `<div class="dash-alert-banner">
          <div class="dash-alert-icon">${_ic('alert_triangle', 16)}</div>
          <div class="dash-alert-text">${totalExpired} ληγμένα έγγραφα χρειάζονται άμεση ενέργεια</div>
        </div>` : ''}

        <!-- KPI Bar (6 cards) -->
        <div class="dash-kpi-bar" style="grid-template-columns:repeat(6,1fr)">
          <button type="button" class="dash-kpi" onclick="_expiryGoto('all')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,var(--accent),transparent)"></div>
            <div class="dash-kpi-label">${_ic('truck', 11)} ΣΥΝΟΛΟ ΣΤΟΛΟΥ</div>
            <div class="dash-kpi-value dash-val-accent">${totalFleet}</div>
            <div class="dash-kpi-sub">${activeTrucks.length} φορτηγά · ${activeTrailers.length} ρυμούλκες</div>
          </button>
          <button type="button" class="dash-kpi" onclick="_expiryGoto('expired','KTEO')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,${kteoExpired?'var(--danger)':'var(--panel-ok)'},transparent)"></div>
            <div class="dash-kpi-label">${_ic('file_check', 11)} ΛΗΓΜΕΝΑ ΚΤΕΟ</div>
            <div class="dash-kpi-value ${kteoExpired ? 'dash-val-danger' : 'dash-val-success'}">${kteoExpired}</div>
            <div class="dash-kpi-sub">φορτηγά + ρυμούλκες</div>
          </button>
          <button type="button" class="dash-kpi" onclick="_expiryGoto('expired','KEK')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,${kekExpired?'var(--danger)':'var(--panel-ok)'},transparent)"></div>
            <div class="dash-kpi-label">${_ic('file_check', 11)} ΛΗΓΜΕΝΑ ΚΕΚ</div>
            <div class="dash-kpi-value ${kekExpired ? 'dash-val-danger' : 'dash-val-success'}">${kekExpired}</div>
            <div class="dash-kpi-sub">μόνο φορτηγά</div>
          </button>
          <button type="button" class="dash-kpi" onclick="_expiryGoto('expired','FRC')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,${frcExpired?'var(--danger)':'var(--panel-ok)'},transparent)"></div>
            <div class="dash-kpi-label">${_ic('droplet', 11)} ΛΗΓΜΕΝΑ FRC</div>
            <div class="dash-kpi-value ${frcExpired ? 'dash-val-danger' : 'dash-val-success'}">${frcExpired}</div>
            <div class="dash-kpi-sub">μόνο ρυμούλκες</div>
          </button>
          <button type="button" class="dash-kpi" onclick="_expiryGoto('expired','Insurance')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,${insExpired?'#D97706':'var(--panel-ok)'},transparent)"></div>
            <div class="dash-kpi-label">${_ic('shield', 11)} ΛΗΓΜΕΝΕΣ ΑΣΦΑΛΕΙΕΣ</div>
            <div class="dash-kpi-value ${insExpired ? 'dash-val-warning' : 'dash-val-success'}">${insExpired}</div>
            <div class="dash-kpi-sub">φορτηγά + ρυμούλκες</div>
          </button>
          <button type="button" class="dash-kpi" onclick="_expiryGoto('expiring30')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,${expiring30Rows.length?'#D97706':'var(--panel-ok)'},transparent)"></div>
            <div class="dash-kpi-label">${_ic('clock', 11)} ΛΗΓΟΥΝ &lt;30 ΗΜ.</div>
            <div class="dash-kpi-value ${expiring30Rows.length ? 'dash-val-warning' : 'dash-val-success'}">${expiring30Rows.length}</div>
            <div class="dash-kpi-sub">όλοι οι τύποι εγγράφων</div>
          </button>
          <button type="button" class="dash-kpi" onclick="_expiryGoto('all')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,${scoreColor},transparent)"></div>
            <div class="dash-kpi-label">${_ic('award', 11)} ΣΥΜΜΟΡΦΩΣΗ ΣΤΟΛΟΥ</div>
            <div class="dash-kpi-value" style="color:${scoreColor}">${compliancePct}%</div>
            <div class="dash-kpi-sub">${totalFleet - totalExpiredVehicles}/${totalFleet} χωρίς ληγμένο</div>
          </button>
        </div>

        <!-- Main Grid -->
        <div class="dash-grid-main">
          <!-- LEFT -->
          <div class="dash-left">

            <!-- Expiry Timeline 2-col -->
            <div class="md-timeline-grid">
              <!-- OVERDUE -->
              <div class="dash-card">
                <div class="dash-card-header">
                  <div class="dash-card-title is-danger">${_ic('alert_triangle', 12)} ΣΕ ΚΑΘΥΣΤΕΡΗΣΗ</div>
                  <span class="dash-card-link" onclick="_expiryGoto('expired')">Λήξεις Εγγράφων ${_ic('chevron_right', 12)}</span>
                </div>
                <div class="dash-card-body">
                  ${overdueList.length ? overdueList.map(r => {
                    const s = _maintExpiryStatus(r.date);
                    const dateDisp = r.date ? r.date.substring(8,10) + '/' + r.date.substring(5,7) + '/' + r.date.substring(2,4) : '—';
                    return `<div class="md-exp-row">
                      <div class="md-exp-plate">${r.plate}</div>
                      <div class="md-exp-doc">${r.docType} · ${r.vType}</div>
                      <div class="md-exp-date">${dateDisp}</div>
                      <div class="md-exp-days">${_maintDaysPill(s.days, s.status)}</div>
                    </div>`;
                  }).join('') : `<div class="dash-empty">${_ic('check_circle', 24)}<div>Κανένα έγγραφο σε καθυστέρηση</div></div>`}
                  ${expiredRows.length > overdueList.length ? `<button type="button" class="dash-card-link" style="display:block;width:100%;text-align:center;padding:8px 0;background:none;border:0;font:inherit;cursor:pointer"
                    onclick="_expiryGoto('expired')">Δες και τα άλλα ${expiredRows.length - overdueList.length} ${_ic('chevron_right', 12)}</button>` : ''}
                </div>
              </div>

              <!-- EXPIRING SOON -->
              <div class="dash-card">
                <div class="dash-card-header">
                  <div class="dash-card-title">${_ic('clock', 12)} ΛΗΓΟΥΝ ΣΥΝΤΟΜΑ</div>
                  <span class="dash-card-meta">εντός 60 ημερών</span>
                </div>
                <div class="dash-card-body">
                  ${soonList.length ? soonList.map(r => {
                    const s = _maintExpiryStatus(r.date);
                    const dateDisp = r.date ? r.date.substring(8,10) + '/' + r.date.substring(5,7) + '/' + r.date.substring(2,4) : '—';
                    return `<div class="md-exp-row">
                      <div class="md-exp-plate">${r.plate}</div>
                      <div class="md-exp-doc">${r.docType} · ${r.vType}</div>
                      <div class="md-exp-date">${dateDisp}</div>
                      <div class="md-exp-days">${_maintDaysPill(s.days, s.status)}</div>
                    </div>`;
                  }).join('') : `<div class="dash-empty">${_ic('check_circle', 24)}<div>Τίποτα δεν λήγει σύντομα</div></div>`}
                  ${expiring60Rows.length > soonList.length ? `<button type="button" class="dash-card-link" style="display:block;width:100%;text-align:center;padding:8px 0;background:none;border:0;font:inherit;cursor:pointer"
                    onclick="_expiryGoto('expiring30')">Δες και τα άλλα ${expiring60Rows.length - soonList.length} ${_ic('chevron_right', 12)}</button>` : ''}
                </div>
              </div>
            </div>

            <!-- Fleet Overview Table -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">${_ic('truck', 12)} FLEET OVERVIEW · TRUCKS</div>
                <span class="dash-card-meta">${activeTrucks.length} active</span>
              </div>
              <div class="dash-card-body flush">
                <table class="md-fleet-table">
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
                      const statusLabel = !worst ? 'N/A' : worst.status === 'expired' ? 'EXPIRED' : worst.status === 'expiring' ? 'WARN' : 'OK';
                      const statusCls = !worst ? 'na' : worst.status === 'expired' ? 'expired' : worst.status === 'expiring' ? 'warn' : 'ok';
                      return `<tr onclick="navigate('maint_expiry')">
                        <td><span class="md-fleet-plate">${f['License Plate'] || '—'}</span></td>
                        <td><span class="md-fleet-dim">${f['Brand'] || '—'}</span></td>
                        <td><span class="md-fleet-dim">${f['Model'] || '—'}</span></td>
                        <td style="text-align:center">${_maintCompBlock(f['KTEO Expiry'])}</td>
                        <td style="text-align:center">${_maintCompBlock(f['KEK Expiry'])}</td>
                        <td style="text-align:center">${_maintCompBlock(f['Insurance Expiry'])}</td>
                        <td style="text-align:center"><span class="md-fleet-status ${statusCls}">${statusLabel}</span></td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Recent Service -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">${_ic('file_text', 12)} RECENT SERVICE</div>
                <span class="dash-card-link" onclick="navigate('maint_svc')">Service History ${_ic('chevron_right', 12)}</span>
              </div>
              <div class="dash-card-body flush">
                ${recentSvc.length ? `<table class="md-svc-table">
                  <thead><tr><th>Date</th><th>Plate</th><th>Type</th><th style="text-align:right">Cost</th></tr></thead>
                  <tbody>
                    ${recentSvc.map(r => { const f = r.fields; return `<tr>
                      <td style="color:var(--dc-text-dim)">${_fmtDate(f['Date'])}</td>
                      <td><span class="md-fleet-plate">${f['Vehicle Plate'] || '—'}</span></td>
                      <td style="color:var(--dc-text-mid)">${f['Type'] || '—'}</td>
                      <td class="mono" style="text-align:right;color:var(--dc-text)">${_fmtCost(f['Cost'])}</td>
                    </tr>`; }).join('')}
                  </tbody>
                </table>` : `<div style="padding:var(--space-4)"><div class="dash-empty">${_ic('file_text', 24)}<div>Καμία καταγραφή συντήρησης ακόμη</div></div></div>`}
              </div>
            </div>

          </div>

          <!-- RIGHT -->
          <div class="dash-right">

            <!-- Fleet Compliance Score Ring -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">${_ic('award', 12)} FLEET COMPLIANCE</div>
                <span class="dash-card-meta">${totalFleet - totalExpiredVehicles}/${totalFleet}</span>
              </div>
              <div class="dash-card-body md-score-wrap">
                <div class="md-score-ring" style="--md-score-color:${scoreColor};--md-score-deg:${Math.round(compliancePct * 3.6)}deg">
                  <div class="md-score-num" style="color:${scoreColor}">${compliancePct}%</div>
                </div>
                <div class="md-score-label">vehicles compliant</div>
              </div>
            </div>

            <!-- Compliance Snapshot (block grid) -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">${_ic('file_check', 12)} COMPLIANCE SNAPSHOT</div>
              </div>
              <div class="dash-card-body" style="padding:var(--space-2) var(--space-4)">
                <div class="md-comp-headers">
                  <span>KT</span><span>KK</span><span>INS</span>
                </div>
                ${activeTrucks.slice(0, 10).map(t => {
                  const f = t.fields;
                  return `<div class="md-comp-row">
                    <div class="md-comp-plate">${f['License Plate'] || '—'}</div>
                    <div class="md-comp-blocks">
                      ${_maintCompBlock(f['KTEO Expiry'], 'KT')}
                      ${_maintCompBlock(f['KEK Expiry'], 'KK')}
                      ${_maintCompBlock(f['Insurance Expiry'], 'INS')}
                    </div>
                  </div>`;
                }).join('')}
                ${activeTrailers.length ? `
                  <div class="md-comp-divider" title="FRC = Cold chain certificate (trailers use FRC instead of KEK)">TRAILERS <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--dc-text-dim);margin-left:6px;font-size:9px">KT · FRC · INS</span></div>
                  ${activeTrailers.slice(0, 5).map(t => {
                    const f = t.fields;
                    return `<div class="md-comp-row">
                      <div class="md-comp-plate">${f['License Plate'] || '—'}</div>
                      <div class="md-comp-blocks">
                        ${_maintCompBlock(f['KTEO Expiry'], 'KT')}
                        ${_maintCompBlock(f['FRC Expiry'], 'FRC')}
                        ${_maintCompBlock(f['Insurance Expiry'], 'INS')}
                      </div>
                    </div>`;
                  }).join('')}` : ''}
              </div>
            </div>

            <!-- Monthly Cost Summary (REAL DATA, replaces placeholder) -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">${_ic('coins', 12)} MONTHLY COST</div>
                <span class="dash-card-meta">last 6 months</span>
              </div>
              <div class="dash-card-body">
                <div class="md-cost-label">Τρέχων μήνας</div>
                <div class="md-cost-big">${_fmtCost(currentMonth)}${_mdDelta(currentMonth, prevMonth, true)}</div>
                <div class="md-cost-sub">${currentSvcCount} service${currentSvcCount !== 1 ? 's' : ''}${prevSvcCount ? ` · ${_mdDelta(currentSvcCount, prevSvcCount, true).replace('<span class="ceo-delta', '<span class="ceo-delta" style="margin-left:4px;padding:0 4px;font-size:9px"')}` : ''}</div>
                <div class="md-cost-spark-wrap">
                  <span class="md-cost-spark-label">6μ trend</span>
                  ${_mdSpark(monthlyCosts.map(m => m.cost), 'var(--panel-accent)', 140)}
                </div>
                <div class="md-cost-breakdown">
                  ${monthlyCosts.map(m => `<div class="md-cost-month-row">
                    <span class="md-cost-month-label">${m.month}</span>
                    <div class="md-cost-month-bar">
                      <div class="md-cost-month-fill" style="width:${maxMonthly ? (m.cost/maxMonthly*100) : 0}%"></div>
                    </div>
                    <span class="md-cost-month-val">${_fmtCost(m.cost)}</span>
                  </div>`).join('')}
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
    c.innerHTML = `<div style="color:var(--danger);padding:40px">Failed to load maintenance data</div>`;
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
  document.getElementById('content').innerHTML = showLoading('Loading work orders…');
  try {
    await _mreqLoad();
    if (!MAINT._loaded) await _maintLoad();
    _mreqPaint();
  } catch(e) {
    document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Failed to load maintenance data</div>`;
    if (typeof logError === 'function') logError(e, 'maintenance requests load');
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
  return '<span class="exp-badge" style="background:#92400E;color:var(--warning-soft)">PENDING</span>';
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
  // SH-2/MA-3 guard: μην ζωγραφίσεις αν ο χρήστης έχει ήδη φύγει.
  if (typeof currentPage !== 'undefined' && currentPage !== 'maint_req') return;
  // H8 fix: normalize Greek priority strings (NFC) to handle Unicode variants
  // H7 note: missing priority defaults to 'Κανονικό' (2) which is correct for sort
  const _normP = s => (s||'').normalize('NFC').trim();
  const all = [...MREQ.data].sort((a,b) => {
    const po = { 'SOS': 0, 'Άμεσα': 1, 'Κανονικό': 2 };
    const pa = po[_normP(a.fields['Priority'])] ?? 2;
    const pb = po[_normP(b.fields['Priority'])] ?? 2;
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

  const tabBtn = (id, label, count, sev) => {
    const act = _mreqTab === id;
    const sevColor = sev === 'danger' ? 'var(--danger)' : sev === 'warning' ? 'var(--warning)' : sev === 'success' ? 'var(--success)' : 'var(--text-mid)';
    return `<button class="exp-tab ${act?'active':''}" onclick="_mreqTab='${id}';_mreqPaint()">
      <span>${label}</span>
      <span class="exp-tab-count" style="${act?'':'color:'+sevColor}">${count}</span>
    </button>`;
  };

  const _i = n => (typeof icon === 'function') ? icon(n, 18) : '';

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:var(--space-4)">
      <div>
        <div class="page-title">Εντολές Εργασίας</div>
        <div class="page-sub">Καθημερινά αιτήματα συντήρησης</div>
      </div>
      <div style="display:flex;gap:var(--space-2)">
        <button class="btn btn-primary btn-sm" onclick="_mreqOpenForm()">${_i('plus')} Νέα εντολή</button>
        <button class="btn btn-ghost btn-sm" onclick="MREQ._loaded=false;renderMaintRequests()">${_i('refresh')} Refresh</button>
      </div>
    </div>

    ${sos ? `<div style="background:var(--danger-bg);border:1px solid rgba(220,38,38,0.3);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);margin-bottom:var(--space-4);display:flex;align-items:center;gap:var(--space-3);animation:slide-up-fade var(--duration-base) var(--ease-out)">
      <div style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--danger);color:#fff;display:inline-flex;align-items:center;justify-content:center">${_i('alert_circle',18)}</div>
      <div style="flex:1">
        <div style="color:var(--danger);font-size:var(--text-sm);font-weight:700">${sos} SOS work order${sos>1?'s':''} — immediate attention required</div>
        <div style="color:var(--text-mid);font-size:var(--text-xs);margin-top:2px">Click a row below to update</div>
      </div>
    </div>` : ''}

    <!-- KPI Cards v2 -->
    <div class="exp-kpis">
      <div class="exp-kpi exp-kpi-danger">
        <div class="exp-kpi-ico">${_i('alert_circle')}</div>
        <div class="exp-kpi-body">
          <div class="exp-kpi-lbl">ΕΠΕΙΓΟΝ</div>
          <div class="exp-kpi-val">${sos}</div>
          <div class="exp-kpi-sub">άμεσα</div>
        </div>
      </div>
      <div class="exp-kpi exp-kpi-warning">
        <div class="exp-kpi-ico">${_i('clock')}</div>
        <div class="exp-kpi-body">
          <div class="exp-kpi-lbl">ΕΚΚΡΕΜΕΙ</div>
          <div class="exp-kpi-val">${pending}</div>
          <div class="exp-kpi-sub">δεν ξεκίνησε</div>
        </div>
      </div>
      <div class="exp-kpi" style="color:var(--accent)">
        <div class="exp-kpi-ico">${_i('refresh')}</div>
        <div class="exp-kpi-body">
          <div class="exp-kpi-lbl">ΣΕ ΕΞΕΛΙΞΗ</div>
          <div class="exp-kpi-val">${inProg}</div>
          <div class="exp-kpi-sub">ενεργές</div>
        </div>
      </div>
      <div class="exp-kpi exp-kpi-success">
        <div class="exp-kpi-ico">${_i('check_circle')}</div>
        <div class="exp-kpi-body">
          <div class="exp-kpi-lbl">ΟΛΟΚΛΗΡΩΜΕΝΕΣ</div>
          <div class="exp-kpi-val">${done.length}</div>
          <div class="exp-kpi-sub">έγιναν</div>
        </div>
      </div>
    </div>

    <div class="exp-tab-bar">
      <div class="exp-tab-group">
        ${tabBtn('active', 'Ενεργές', active.length, 'warning')}
        ${tabBtn('done', 'Ολοκληρωμένες', done.length, 'success')}
        ${tabBtn('all', 'Όλες', all.length)}
      </div>
    </div>

    <!-- ΕΝΟΤΗΤΑ 1: πραγματικές, χειροκίνητες εντολές -->
    <div class="exp-section">
      <div class="exp-section-hdr">
        <div class="exp-section-badge" style="background:var(--accent-light);color:var(--accent)">${_i('checklist')}</div>
        <div>
          <div class="exp-section-title">${_mreqTab === 'active' ? 'ΕΝΤΟΛΕΣ ΕΡΓΑΣΙΑΣ' : _mreqTab === 'done' ? 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΝΤΟΛΕΣ' : 'ΟΛΕΣ ΟΙ ΕΝΤΟΛΕΣ'} (${filtered.length})</div>
          <div class="exp-section-sub">Κάνε κλικ σε γραμμή για ενημέρωση</div>
        </div>
      </div>
      <div class="exp-table-wrap">
        <table class="mt">
          <thead><tr>
            <th>#</th><th>ΠΙΝΑΚΙΔΑ</th><th>ΠΕΡΙΓΡΑΦΗ</th><th class="c">ΠΡΟΤΕΡΑΙΟΤΗΤΑ</th><th class="c">ΚΑΤΑΣΤΑΣΗ</th><th>ΗΜΕΡΟΜΗΝΙΑ</th><th>ΣΥΝΕΡΓΕΙΟ</th><th>ΣΗΜΕΙΩΣΕΙΣ</th><th style="width:100px" class="c">ΕΝΕΡΓΕΙΕΣ</th>
          </tr></thead>
          <tbody>${filtered.length ? filtered.map((r, i) => {
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
            ${f['Status']!=='Done' ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:10px" onclick="_mreqQuickStatus('${r.id}','Done')">✓ Ολοκληρώθηκε</button>` : ''}
          </td>
        </tr>`;
      }).join('') : `<tr><td colspan="9" style="padding:0">${typeof showEmpty === 'function' ? showEmpty({
            illustration: 'truck',
            title: _mreqTab === 'done' ? 'Καμία ολοκληρωμένη εντολή ακόμη' : 'Καμία ενεργή εντολή εργασίας',
            description: _mreqTab === 'done' ? 'Οι ολοκληρωμένες συντηρήσεις θα εμφανίζονται εδώ' : 'Δημιούργησε εντολή, ή δες τις λήξεις εγγράφων παρακάτω',
            action: _mreqTab !== 'done' ? { label: 'Νέα εντολή', onClick: '_mreqOpenForm()' } : null
          }) : '<div style="text-align:center;padding:40px;color:var(--text-dim)">Καμία εντολή εργασίας</div>'}</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <!-- ΕΝΟΤΗΤΑ 2: αυτόματα από λήξεις. Συμπτυγμένη, όριο 10.
         Δεν είναι εντολές εργασίας — είναι η ίδια πληροφορία με το Expiry
         Alerts. Έδιναν 3.913px ύψος για 1 πραγματική εντολή, και 64 κουμπιά
         «Done» που έκλειναν κάτι που δεν άνοιξε ποτέ κανείς.
         maint_req.md MR-1/MR-3/MR-4/MR-6. -->
    ${expiryAlerts.length ? `<details class="exp-section" style="padding:0">
      <summary style="cursor:pointer;list-style:none;padding:var(--space-4);display:flex;align-items:center;gap:var(--space-3)">
        <div class="exp-section-badge" style="background:var(--warning-bg);color:var(--warning)">${_i('alert_triangle')}</div>
        <div style="flex:1">
          <div class="exp-section-title">ΑΠΟ ΛΗΞΕΙΣ ΕΓΓΡΑΦΩΝ (${expiryAlerts.length})</div>
          <div class="exp-section-sub">Δεν είναι εντολές εργασίας — προέρχονται από τα έγγραφα του στόλου</div>
        </div>
        <span class="dash-card-link" onclick="event.preventDefault();event.stopPropagation();_expiryGoto('expired')">Άνοιγμα στις Λήξεις Εγγράφων ${_i('chevron_right')}</span>
      </summary>
      <div class="exp-table-wrap">
        <table class="mt">
          <thead><tr>
            <th style="width:60px"></th><th>ΠΙΝΑΚΙΔΑ</th><th>ΕΓΓΡΑΦΟ</th><th class="c">ΚΑΤΑΣΤΑΣΗ</th><th>ΗΜ. ΛΗΞΗΣ</th><th>ΤΥΠΟΣ</th><th style="width:100px" class="c">ΕΝΕΡΓΕΙΕΣ</th>
          </tr></thead>
          <tbody>${expiryAlerts.slice(0, 10).map(ea => `<tr style="background:rgba(146,64,14,0.06)">
          <td><span class="exp-badge exp-warning" style="font-size:8px;padding:1px 5px">ΑΥΤΟΜ.</span></td>
          <td style="font-weight:700;white-space:nowrap">${ea.plate}</td>
          <td>${ea.doc} — <span style="color:${ea.days<0?'var(--danger)':'#D97706'};font-weight:700">${ea.days<0?Math.abs(ea.days)+' ημ. ληγμένο':'λήγει σε '+ea.days+' ημ.'}</span></td>
          <td class="c">${ea.days<0?'<span class="exp-badge exp-overdue">ΛΗΓΜΕΝΟ</span>':'<span class="exp-badge exp-warning">ΛΗΓΕΙ</span>'}</td>
          <td style="white-space:nowrap;font-size:12px">${ea.date.split('-').reverse().join('/')}</td>
          <td style="font-size:12px">${ea.vType}</td>
          <td class="c" onclick="event.stopPropagation()">
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:10px" onclick="_mreqDismissExpiry('${ea.plate.replace(/'/g,"\\'")}','${ea.doc}','${ea.desc.replace(/'/g,"\\'")}')">✓ Ανανεώθηκε</button>
          </td>
        </tr>`).join('')}</tbody>
        </table>
        ${expiryAlerts.length > 10 ? `<button type="button" class="dash-card-link" style="display:block;width:100%;text-align:center;padding:10px 0;background:none;border:0;font:inherit;cursor:pointer"
          onclick="_expiryGoto('expired')">Δες και τα άλλα ${expiryAlerts.length - 10} στις Λήξεις Εγγράφων ${_i('chevron_right')}</button>` : ''}
      </div>
    </details>` : ''}
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
  } catch(e) { reportError('Σφάλμα δημιουργίας αιτήματος συντήρησης', e); }
}

async function _mreqQuickStatus(recId, newStatus) {
  try {
    await atSafePatch(TABLES.MAINT_REQ, recId, { Status: newStatus });
    const rec = MREQ.data.find(r => r.id === recId);
    if (rec) rec.fields['Status'] = newStatus;
    _mreqPaint();
  } catch(e) { reportError('Status update failed', e); }
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
    // H7 fix: ensure Priority always has a value — default 'Κανονικό'
    'Priority': document.getElementById('mreq-prio').value || 'Κανονικό',
    'Status': document.getElementById('mreq-status').value,
    'Date Reported': document.getElementById('mreq-date').value || null,
    'Workshop': wsVal === '__other' ? null : (wsVal || null),
    'Notes': document.getElementById('mreq-notes').value.trim() || null,
  };
  const costEl = document.getElementById('mreq-cost');
  if (costEl && costEl.value) fields['Estimated Cost'] = parseFloat(costEl.value);

  try {
    if (editId) {
      await atSafePatch(TABLES.MAINT_REQ, editId, fields);
      const rec = MREQ.data.find(r => r.id === editId);
      if (rec) Object.assign(rec.fields, fields);
    } else {
      const created = await atCreate(TABLES.MAINT_REQ, fields);
      MREQ.data.push(created);
    }
    document.getElementById('mreq-form-container').innerHTML = '';
    _mreqPaint();
  } catch(e) { reportError('Αποτυχία αποθήκευσης αιτήματος συντήρησης', e); }
}

async function _mreqDelete(recId) {
  if (!(await confirmAction('Διαγραφή αυτού του work order;', { danger: true, confirmLabel: 'Διαγραφή' }))) return;
  try {
    await atSoftDelete(TABLES.MAINT_REQ, recId);
    MREQ.data = MREQ.data.filter(r => r.id !== recId);
    document.getElementById('mreq-form-container').innerHTML = '';
    _mreqPaint();
  } catch(e) { reportError('Αποτυχία διαγραφής αιτήματος συντήρησης', e); }
}
