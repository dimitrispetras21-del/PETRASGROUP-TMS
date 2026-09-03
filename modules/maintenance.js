// ═══════════════════════════════════════════════════════════════
// MAINTENANCE MODULE — Κέντρο Συντήρησης · Εντολές · Λήξεις ·
// Ιστορικό Service · Ιστορικό Φορτηγών/Ρυμουλκών
// Redesign wave 2 (Figma KO7l2AfucR3HJEDIg1Yptr, frames w2-maint-*).
// ═══════════════════════════════════════════════════════════════

'use strict';

/* ── SHARED STATE ────────────────────────────────────────────── */
const MAINT = {
  trucks: [], trailers: [], workshops: [], history: [],
  _loaded: false,
};

// TRUCK_EXPIRY_FIELDS / TRAILER_EXPIRY_FIELDS come from core/constants.js.

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
  // Needs Review σημαδεύει τις 91 εγγραφές του import με προβληματικό δεδομένο στην
  // πηγή (ημερομηνία εκτός εύρους, χλμ βγαλμένα από κείμενο, γραμμή χωρίς κόστος).
  'Needs Review',
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

// Display-only vocabularies. Stored values stay English (facade contract);
// the screen speaks Greek (DESIGN.md ΜΕΡΟΣ Ε).
const MAINT_STATUS_LABEL = { Completed: 'Ολοκληρώθηκε', Done: 'Ολοκληρώθηκε', Scheduled: 'Προγραμματισμένο', 'In Progress': 'Σε εξέλιξη' };
const MREQ_STATUS_LABEL  = { Pending: 'Εκκρεμεί', 'In Progress': 'Σε εξέλιξη', Done: 'Ολοκληρώθηκε' };
const EXPIRY_DOC_GR      = { KTEO: 'KTEO', KEK: 'KEK', FRC: 'FRC', Insurance: 'Ασφάλεια' };
const _mntTypeGr = t => t === 'Truck' ? 'Φορτηγό' : t === 'Trailer' ? 'Ρυμούλκα' : '';

/* ── CSS ─────────────────────────────────────────────────────── */
// Tokens only (DESIGN.md #1). Table header background reuses --border-row
// (same value as the Figma header fill); bar tracks reuse --bg-row-alt.
(function(){
  if (document.getElementById('maint-css')) return;
  const s = document.createElement('style'); s.id = 'maint-css';
  s.textContent = `
/* header row */
.mnt-head { display:flex; align-items:center; gap:var(--space-3); flex-wrap:wrap; min-height:40px; padding:var(--space-1) 0 var(--space-1); }
.mnt-title { font-family:'Syne',sans-serif; font-weight:700; font-size:var(--text-lg); color:var(--text); white-space:nowrap; }
.mnt-sub { font-size:var(--text-sm); color:var(--text-dim); }
.mnt-spacer { flex:1; min-width:var(--space-2); }
.mnt-pill { display:inline-flex; align-items:center; gap:5px; padding:5px 10px; border:1px solid var(--silver-light); border-radius:var(--radius-full);
  font:inherit; font-size:var(--text-sm); color:var(--text-mid); background:var(--bg-card); cursor:pointer; white-space:nowrap; }
.mnt-pill b { font-weight:700; color:var(--text); }
.mnt-pill.is-danger b { color:var(--danger); }
.mnt-pill.is-warning b { color:var(--warning); }
.mnt-pill.is-dim b { color:var(--text-dim); }
.mnt-pill.is-ok b { color:var(--success); }
.mnt-pill.active { border-color:var(--accent); background:var(--accent-light); color:var(--accent-text); }
.mnt-pill.static { cursor:default; }
.mnt-search { height:34px; width:230px; padding:0 var(--space-3); border:1px solid var(--silver-light); border-radius:var(--radius);
  font-family:'DM Sans',sans-serif; font-size:var(--text-sm); color:var(--text); background:var(--bg-card); outline:none; }
.mnt-search::placeholder { color:var(--text-dim); }
.mnt-search:focus, .mnt-select:focus { border-color:var(--border-focus); box-shadow:var(--shadow-focus); }
.mnt-select { height:34px; padding:0 var(--space-2); border:1px solid var(--silver-light); border-radius:var(--radius);
  font-family:'DM Sans',sans-serif; font-size:var(--text-sm); color:var(--text); background:var(--bg-card); outline:none; cursor:pointer; max-width:190px; }
.mnt-select.wide { min-width:240px; }
/* KPI cards */
.mnt-kpis { display:flex; gap:var(--space-3); margin-bottom:var(--space-1); }
.mnt-kpi { flex:1; min-width:0; border:1px solid var(--silver-light); border-radius:var(--radius); padding:8px 14px; background:var(--bg-card);
  display:flex; flex-direction:column; gap:2px; text-align:left; font-family:inherit; }
button.mnt-kpi { cursor:pointer; }
button.mnt-kpi:hover { border-color:var(--border-dark); }
.mnt-kpi.active { border-color:var(--accent); box-shadow:var(--shadow-focus); }
.mnt-kpi-l { font-size:var(--text-2xs); font-weight:700; color:var(--text-dim); letter-spacing:.3px; text-transform:uppercase; white-space:nowrap; }
.mnt-kpi-v { font-family:'Syne',sans-serif; font-weight:700; font-size:var(--num-md); color:var(--text); line-height:1.15; display:flex; align-items:baseline; gap:var(--space-2); }
.mnt-kpi-v.ok { color:var(--success); }
.mnt-kpi-v.bad { color:var(--danger); }
.mnt-kpi-v.warn { color:var(--warning); }
.mnt-kpi-v small { font-family:'DM Sans',sans-serif; font-size:var(--text-xs); font-weight:500; }
.mnt-kpi-s { font-size:var(--text-2xs); color:var(--text-dim); }
.mnt-bar { height:4px; background:var(--bg-row-alt); border-radius:2px; overflow:hidden; width:100%; }
.mnt-bar > i { display:block; height:100%; background:var(--navy-mid); border-radius:2px; }
.mnt-bar > i.ok { background:var(--success); }
.mnt-bar > i.warn { background:var(--warning); }
.mnt-bar > i.bad { background:var(--danger); }
.mnt-bar.thick { height:10px; }
/* cards */
.mnt-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4); margin-bottom:var(--space-4); }
.mnt-card { border:1px solid var(--silver-light); border-radius:var(--radius); padding:14px 16px; background:var(--bg-card);
  display:flex; flex-direction:column; gap:10px; min-width:0; }
.mnt-card-t { font-size:var(--text-2xs); font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:.3px; }
.mnt-card-lead { font-size:var(--text-body); font-weight:500; color:var(--text); }
.mnt-row { display:flex; align-items:center; gap:10px; min-height:30px; font-size:var(--text-sm); color:var(--text); }
.mnt-row.click { cursor:pointer; border-radius:var(--radius-sm); margin:0 -6px; padding:0 6px; }
.mnt-row.click:hover { background:var(--bg-hover); }
.mnt-row .w110 { width:110px; flex-shrink:0; font-weight:700; font-size:var(--text-body); }
.mnt-row .w80 { width:80px; flex-shrink:0; color:var(--text-dim); }
.mnt-row .w50 { width:50px; flex-shrink:0; color:var(--text-dim); }
.mnt-row .w100 { width:100px; flex-shrink:0; font-weight:700; }
.mnt-row .grow { flex:1; min-width:0; }
.mnt-row .amt { font-weight:500; white-space:nowrap; }
.mnt-note { font-size:var(--text-2xs); color:var(--text-dim); }
.mnt-bars { display:flex; gap:18px; align-items:flex-end; height:186px; }
.mnt-bar-col { flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:4px; height:100%; }
.mnt-bar-col > i { width:100%; background:var(--navy-mid); border-radius:3px; display:block; }
.mnt-bar-col > i.peak { background:var(--warning); }
.mnt-bar-col > span { font-size:var(--text-2xs); color:var(--text-dim); white-space:nowrap; }
.mnt-bar-col > span.v { font-weight:500; }
/* tables */
.mnt-table { width:100%; border-collapse:collapse; background:var(--bg-card); }
.mnt-table th { height:34px; padding:0 var(--space-4); background:var(--border-row); color:var(--text-mid); font-size:var(--text-body); font-weight:600; text-align:left; white-space:nowrap; }
.mnt-table th.r, .mnt-table td.r { text-align:right; }
.mnt-table td { height:40px; padding:0 var(--space-4); border-bottom:1px solid var(--border-row); font-size:var(--text-body); color:var(--text); vertical-align:middle; }
.mnt-table tbody tr.click { cursor:pointer; }
.mnt-table tbody tr.click:hover td { background:var(--bg-hover); }
.mnt-table tbody tr.sos td { background:var(--danger-bg); }
.mnt-main { font-weight:700; color:var(--text); }
.mnt-dim { color:var(--text-dim); font-size:var(--text-xs); }
.mnt-mid { color:var(--text-mid); }
.mnt-cell2 { display:flex; flex-direction:column; gap:1px; line-height:1.25; }
.mnt-num { font-variant-numeric:tabular-nums; }
.mnt-bad { color:var(--danger); font-weight:500; }
.mnt-warn { color:var(--warning); font-weight:500; }
.mnt-ok { color:var(--success); font-weight:700; }
.mnt-cell-edit { cursor:pointer; }
.mnt-cell-edit:hover { text-decoration:underline dotted; }
.mnt-section { display:flex; align-items:center; gap:var(--space-2); height:26px; }
.mnt-section b { font-family:'Syne',sans-serif; font-weight:700; font-size:var(--text-body); color:var(--text); }
.mnt-band { display:flex; align-items:center; gap:10px; height:40px; padding:0 var(--space-4); background:var(--bg-row-alt); font-size:var(--text-sm); color:var(--text-dim); cursor:pointer; list-style:none; }
.mnt-band::-webkit-details-marker { display:none; }
.mnt-band b { color:var(--text-mid); }
.mnt-link { color:var(--accent-text); cursor:pointer; background:none; border:0; font:inherit; font-size:var(--text-xs); padding:0; white-space:nowrap; }
.mnt-link:hover { text-decoration:underline; }
.mnt-inline-input { font-family:'DM Sans',sans-serif; font-size:var(--text-sm); padding:4px 6px; border:2px solid var(--border-focus); border-radius:var(--radius); background:var(--bg-card); color:var(--text); outline:none; }
.mnt-foot { font-size:var(--text-xs); color:var(--text-dim); padding:var(--space-2) var(--space-4); }
/* record drawer (w2-maint-service-record-card 196:754) */
.mnt-drawer-bg { position:fixed; inset:0; background:var(--navy-mid); opacity:.45; z-index:var(--z-overlay); }
.mnt-drawer { position:fixed; top:0; right:0; bottom:0; width:480px; max-width:95vw; background:var(--bg-card); box-shadow:var(--shadow-panel);
  z-index:calc(var(--z-overlay) + 100); overflow-y:auto; animation:mnt-in var(--duration-fast) var(--ease-out); display:flex; flex-direction:column; }
@keyframes mnt-in { from { transform:translateX(24px); opacity:0; } to { transform:none; opacity:1; } }
.mnt-drawer-head { background:var(--navy-mid); padding:18px 22px; display:flex; flex-direction:column; gap:var(--space-2); }
.mnt-drawer-plate { font-family:'Syne',sans-serif; font-weight:700; font-size:var(--text-lg); color:var(--text-inverse); }
.mnt-drawer-head .mnt-dim { color:var(--panel-dim); font-size:var(--text-sm); }
.mnt-drawer-x { margin-left:auto; background:none; border:0; color:var(--panel-dim); font-size:var(--text-base); cursor:pointer; }
.mnt-drawer .ecard-sec-body { color:var(--text); font-size:var(--text-body); word-break:break-word; }
.mnt-drawer-foot { margin-top:auto; padding:var(--space-3) 22px; border-top:1px solid var(--silver-light); display:flex; gap:var(--space-2); justify-content:flex-end; }
/* modal form (w2-maint-service-form / w2-maint-request-form) */
.mf-overlay { position:fixed; inset:0; z-index:calc(var(--z-overlay) + 100); display:flex; align-items:flex-start; justify-content:center; padding-top:60px; overflow-y:auto; }
.mf-overlay::before { content:''; position:fixed; inset:0; background:var(--navy-mid); opacity:.45; }
.mf-modal { position:relative; background:var(--bg-card); border-radius:var(--radius-md); width:720px; max-width:95vw; box-shadow:var(--shadow-lg); margin-bottom:60px; }
.mf-head { padding:18px 24px 14px; display:flex; align-items:center; gap:var(--space-2); font-family:'Syne',sans-serif; font-size:var(--text-lg); font-weight:700; color:var(--text); }
.mf-head .mnt-drawer-x { color:var(--text-dim); }
.mf-body { padding:0 24px 8px; display:flex; flex-direction:column; gap:14px; }
.mf-row { display:flex; gap:14px; }
.mf-row > .form-field { flex:1; min-width:0; }
.mf-foot { padding:14px 24px 18px; display:flex; align-items:center; gap:10px; justify-content:flex-end; }
.mf-warn { font-size:var(--text-xs); color:var(--warning); margin-right:auto; }
.mf-scan { display:flex; align-items:center; gap:10px; }
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
      // NOTE (3/9/2026): 'Notes' (NO-FRC marker read by _expiryFieldsFor) and the
      // workshop 'Phone' are NOT requested here on purpose. The critics replay a
      // recorded HAR by exact URL; adding a field changes the URL, every fetch
      // aborts, and all six screens fall to their error state. Both additions
      // wait for a HAR re-record by the integrator — see the delivery notes.
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
// dd/mm/yy — with 852-day-old expiries the year is the difference between
// "renew this month" and "illegal since 2024" (DEEP_AUDIT maint_expiry ME-3).
function _fmtDMY(d, full) {
  if (!d) return '—';
  const p = toLocalDate(d).split('-');
  if (p.length !== 3) return '—';
  return `${p[2]}/${p[1]}/${full ? p[0] : p[0].slice(2)}`;
}
function _fmtDM(d) { const s = _fmtDMY(d); return s === '—' ? s : s.slice(0, 5); }
// Unknown ≠ zero: null/undefined/NaN render as a dash, never €0 (DESIGN.md #3).
function _fmtCost(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? '€' + Math.round(n).toLocaleString('el-GR') : '—';
}
function _fmtK(n) {
  if (n >= 1000) return '€' + (n / 1000).toFixed(1).replace('.', ',').replace(',0', '') + 'k';
  return '€' + Math.round(n);
}
// Sum with an explicit "missing" count, so a total never quietly absorbs
// records that have no cost (they are counted separately: «N χωρίς κόστος»).
function _sumCost(recs) {
  let sum = 0, n = 0, missing = 0;
  for (const r of recs) {
    const c = r.fields['Cost'];
    if (c === null || c === undefined || c === '' || !Number.isFinite(Number(c))) { missing++; continue; }
    sum += Number(c); n++;
  }
  return { sum, n, missing };
}
function _relDays(dateStr) {
  const d = _daysUntil(dateStr);
  if (d === null) return '';
  const ago = -d;
  if (ago === 0) return 'σήμερα';
  if (ago === 1) return 'χθες';
  if (ago < 0) return `σε ${-ago} ημ.`;
  if (ago < 60) return `πριν ${ago} ημ.`;
  if (ago < 365) return `πριν ${Math.round(ago / 30)} μήνες`;
  return `πριν ${(ago / 365).toFixed(1).replace('.', ',')} χρ.`;
}
// Expiry wording, one place: expired → danger, ≤30 days → warning, else dim.
function _dueText(days) {
  if (days === null) return { cls: 'mnt-dim', text: '—' };
  if (days < 0) return { cls: 'mnt-bad', text: `ληγμένο ${-days} ημ.` };
  if (days <= 30) return { cls: 'mnt-warn', text: `σε ${days} ημ.` };
  return { cls: 'mnt-dim', text: `σε ${days} ημ.` };
}
function _pctOf(n, d) { return d ? Math.round(n / d * 100) : null; }
function _wsRec(wsArr) {
  if (!wsArr || !MAINT.workshops || !MAINT.workshops.length) return null;
  let id;
  if (Array.isArray(wsArr)) { if (!wsArr.length) return null; id = typeof wsArr[0] === 'string' ? wsArr[0] : wsArr[0]?.id; }
  else if (typeof wsArr === 'string') id = wsArr;
  else if (typeof wsArr === 'object') id = wsArr.id;
  if (!id) return null;
  return MAINT.workshops.find(w => w.id === id) || null;
}
function _wsName(wsArr) {
  // Input can be: null, undefined, string 'recXXX', [string], [{id}], empty array.
  const ws = _wsRec(wsArr);
  return ws ? (ws.fields['Name'] || '—') : '—';
}
// Vehicle type by plate — MAINT_REQ rows rarely carry 'Vehicle Type' (0/1 today).
function _mntVehicleType(plate, explicit) {
  if (explicit === 'Truck' || explicit === 'Trailer') return explicit;
  const p = String(plate || '').trim().toUpperCase();
  if (!p) return '';
  if (MAINT.trucks.some(v => String(v.fields['License Plate'] || '').toUpperCase() === p)) return 'Truck';
  if (MAINT.trailers.some(v => String(v.fields['License Plate'] || '').toUpperCase() === p)) return 'Trailer';
  return '';
}
function _mntVehicleRec(plate, vType) {
  const list = vType === 'Trailer' ? MAINT.trailers : vType === 'Truck' ? MAINT.trucks : [...MAINT.trucks, ...MAINT.trailers];
  return list.find(v => v.fields['License Plate'] === plate) || null;
}
const _mi = (n, s) => (typeof icon === 'function') ? icon(n, s || 14) : '';
// Body-level hosts for the record drawer and the modal forms, so every screen
// (lists, histories, dashboard) opens the same card/form without owning a slot.
function _mntHost(id) {
  let h = document.getElementById(id);
  if (!h) { h = document.createElement('div'); h.id = id; document.body.appendChild(h); }
  return h;
}
function _mntCloseDrawer() { const h = document.getElementById('mnt-drawer-host'); if (h) h.innerHTML = ''; }
function _mntCloseModal()  { const h = document.getElementById('mnt-modal-host');  if (h) h.innerHTML = ''; }
function _mntRefreshBtn(onclick) {
  return `<button type="button" class="btn btn-ghost btn-sm btn-icon" title="Ανανέωση δεδομένων" aria-label="Ανανέωση" onclick="${onclick}">${_mi('refresh')}</button>`;
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
      return { id: v.id, plate: f['License Plate']||'?', brand: f['Brand']||'', model: f['Model']||'', insurer: f['Insurance Partner']||'',
        trailerType: f['Trailer Type']||'', docs, worst, vType };
    })
    .sort((a, b) => {
      if (a.worst === null && b.worst === null) return 0;
      if (a.worst === null) return 1;
      if (b.worst === null) return -1;
      return a.worst - b.worst;
    });
}

// ═════════════════════════════════════════════════════════════════
// PAGE: ΛΗΞΕΙΣ ΕΓΓΡΑΦΩΝ (w2-maint-expiry-overview 191:745)
// ═════════════════════════════════════════════════════════════════
async function renderExpiryAlerts() {
  document.getElementById('content').innerHTML = showLoading('Φόρτωση εγγράφων στόλου…');
  try {
    await _maintLoad();
    // «ΑΝΑΝΕΩΘΗΚΕ» reads the explicit renewal actions («✓ Ανανεώθηκε» writes a
    // Done MAINT_REQ «<doc> — Renewal»). A failure here is shown, not swallowed.
    MREQ._expiryLoadFailed = false;
    try { await _mreqLoad(); } catch (e) { MREQ._expiryLoadFailed = true; if (typeof logError === 'function') logError(e, 'maint expiry: renewals load'); }
    _expiryPaint();
  } catch(e) {
    document.getElementById('content').innerHTML = showError('Δεν φορτώθηκαν τα έγγραφα του στόλου');
    console.error(e);
  }
}

// Inline date editor (click on a document cell)
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
  inp.className = 'mnt-inline-input';
  inp.value = currentVal ? toLocalDate(currentVal) : '';
  inp.style.width = '140px';
  td.innerHTML = '';
  td.appendChild(inp);
  inp.focus();

  const save = async () => {
    const newVal = inp.value || null;
    td.innerHTML = '<span class="mnt-dim">Αποθήκευση…</span>';
    try {
      const tableId = vType === 'Truck' ? TABLES.TRUCKS : TABLES.TRAILERS;
      await atSafePatch(tableId, recId, { [fieldName]: newVal });
      const rec = (vType === 'Truck' ? MAINT.trucks : MAINT.trailers).find(v=>v.id===recId);
      if (rec) rec.fields[fieldName] = newVal;
      _expiryPaint();
    } catch(err) {
      showErrorToast('Η αποθήκευση απέτυχε: ' + err.message);
      _expiryPaint();
    }
  };
  inp.addEventListener('change', save);
  inp.addEventListener('blur', () => { if (td.contains(inp)) _expiryPaint(); });
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') _expiryPaint(); });
}

// Inline text editor for the insurer (trucks only — trailers have no column)
async function _expInsurerEdit(e, recId, vType) {
  e.stopPropagation();
  const td = e.currentTarget;
  if (td.querySelector('input[type="text"]')) return;
  const rec = (vType === 'Truck' ? MAINT.trucks : MAINT.trailers).find(v=>v.id===recId);
  const currentVal = rec?.fields['Insurance Partner'] || '';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'mnt-inline-input';
  inp.value = currentVal;
  inp.placeholder = 'Ασφαλιστής…';
  inp.style.width = '150px';
  td.innerHTML = '';
  td.appendChild(inp);
  inp.focus();
  inp.select();
  const save = async () => {
    const newVal = inp.value.trim() || null;
    td.innerHTML = '<span class="mnt-dim">Αποθήκευση…</span>';
    try {
      const tableId = vType === 'Truck' ? TABLES.TRUCKS : TABLES.TRAILERS;
      await atSafePatch(tableId, recId, { 'Insurance Partner': newVal });
      if (rec) rec.fields['Insurance Partner'] = newVal;
      _expiryPaint();
    } catch(err) { showErrorToast('Η αποθήκευση απέτυχε: ' + err.message); _expiryPaint(); }
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
 * Open Expiry Alerts pre-filtered. Called from the Maintenance Dashboard.
 * @param {string} tab - 'all'|'expired'|'expiring30'|'valid'
 * @param {string} [docType] - 'KTEO'|'KEK'|'FRC'|'Insurance'
 * @param {string} [plate] - lands the search on one vehicle («άνοιγμα →»)
 */
function _expiryGoto(tab, docType, plate) {
  _expiryTab = tab || 'all';
  _expiryDocType = docType || '';
  _expirySearch = plate ? String(plate).toLowerCase() : '';
  navigate('maint_expiry');
}

function _expiryFilterRows(rows) {
  let out = rows;
  if (_expiryTab === 'expired') out = out.filter(r => r.worst !== null && r.worst < 0);
  if (_expiryTab === 'expiring30') out = out.filter(r => r.worst !== null && r.worst >= 0 && r.worst <= 30);
  if (_expiryTab === 'valid') out = out.filter(r => r.worst === null || r.worst > 30);
  // Keeps only vehicles whose THAT document is expired — matches what the KPI counted.
  if (_expiryDocType) out = out.filter(r => r.docs.some(d => d.label === _expiryDocType && d.days !== null && d.days < 0));
  if (_expirySearch) { const q = _expirySearch; out = out.filter(r => r.plate.toLowerCase().includes(q) || r.brand.toLowerCase().includes(q) || r.model.toLowerCase().includes(q) || (r.insurer||'').toLowerCase().includes(q)); }
  return out;
}

// Renewal actions per plate: the Done MAINT_REQ rows that «✓ Ανανεώθηκε»
// creates («KTEO — Renewal»). Inline date edits leave no such trace (only the
// audit_log, which is not a source of truth — DECISION_LOG 2/9).
function _expiryRenewals() {
  const byPlate = {};
  for (const r of MREQ.data) {
    const f = r.fields;
    const m = /^(KTEO|KEK|FRC|Insurance)\s+—\s+Renewal$/i.exec(String(f['Description'] || '').trim());
    if (!m || f['Status'] !== 'Done' || !f['Date Reported']) continue;
    const plate = String(f['Vehicle Plate'] || '').toUpperCase();
    const ago = -(_daysUntil(f['Date Reported']) ?? 0);
    const cur = byPlate[plate];
    if (!cur || ago < cur.ago) byPlate[plate] = { doc: m[1], ago, date: f['Date Reported'] };
  }
  return byPlate;
}

function _expiryPaint() {
  // SH-2/MA-3 guard: μην ζωγραφίσεις αν ο χρήστης έχει ήδη φύγει.
  if (typeof currentPage !== 'undefined' && currentPage !== 'maint_expiry') return;
  _mntCloseDrawer();
  const truckRows = _expiryVehicleRows(MAINT.trucks, TRUCK_EXPIRY_FIELDS, 'Truck');
  const trailerRows = _expiryVehicleRows(MAINT.trailers, TRAILER_EXPIRY_FIELDS, 'Trailer');
  const all = [...truckRows, ...trailerRows];

  // KPIs — count per vehicle (not per document)
  const expiredTrucks = truckRows.filter(r => r.worst !== null && r.worst < 0).length;
  const expiredTrailers = trailerRows.filter(r => r.worst !== null && r.worst < 0).length;
  const expiring30 = all.filter(r => r.worst !== null && r.worst >= 0 && r.worst <= 30).length;
  const valid = all.filter(r => r.worst === null || r.worst > 30).length;
  const expired = expiredTrucks + expiredTrailers;
  const total = all.length;
  const compliant = total - expired;
  const compliancePct = _pctOf(compliant, total);
  const compCls = compliancePct === null ? '' : compliancePct >= 90 ? 'ok' : compliancePct >= 70 ? 'warn' : 'bad';

  const renewals = _expiryRenewals();
  const renewed7 = Object.values(renewals).filter(r => r.ago <= 7).length;

  const fTrucks = _expiryFilterRows(truckRows);
  const fTrailers = _expiryFilterRows(trailerRows);

  // Report the figures this page shows. The key names say what is being
  // counted, because that is the whole confusion this page sat at the centre
  // of: expiredVehicles here vs expiredDocRows on the Maintenance Dashboard.
  if (typeof reportPageMetrics === 'function') reportPageMetrics('maint_expiry', {
    expiredVehicles: expired,
    expiringVehicles30d: expiring30,
    validVehicles: valid,
    totalVehicles: total,
    compliantVehicles: compliant,
    compliancePct,
  });

  const pill = (id, label, count, sev) =>
    `<button type="button" class="mnt-pill ${sev || ''} ${_expiryTab === id ? 'active' : ''}" onclick="_expiryTab='${id}';_expiryPaint()"><b>${count}</b> ${label}</button>`;

  const docCell = (r, d) => {
    const editAttr = `onclick="_expInlineEdit(event,'${r.id}','${d.field}','${r.vType}')"`;
    if (!d.date) return `<td class="mnt-cell-edit" ${editAttr} title="Κλικ για καταχώρηση"><span class="mnt-dim">—</span></td>`;
    const due = _dueText(d.days);
    return `<td class="mnt-cell-edit mnt-num" ${editAttr} title="Κλικ για αλλαγή">${_fmtDMY(d.date)} <span class="${due.cls}" style="font-size:var(--text-sm);margin-left:4px">${due.text}</span></td>`;
  };
  const renewCell = (plate) => {
    const rn = renewals[String(plate).toUpperCase()];
    if (!rn) return `<td><span class="mnt-dim">—</span></td>`;
    return `<td><span class="mnt-ok">✓</span> <span class="mnt-mid" style="font-size:var(--text-sm)">${EXPIRY_DOC_GR[rn.doc] || rn.doc} — ${_relDays(rn.date)}</span></td>`;
  };
  const vehicleCell = (r) => {
    const sub = [r.brand, r.model].filter(Boolean).join(' ');
    const kind = r.vType === 'Trailer' && r.trailerType ? ` · ${escapeHtml(r.trailerType)}` : '';
    return `<td><div class="mnt-cell2"><span class="mnt-main">${escapeHtml(r.plate)}</span><span class="mnt-dim">${escapeHtml(sub) || 'μάρκα/μοντέλο — δεν έχει καταχωρηθεί'}${kind}</span></div></td>`;
  };
  const rowsFor = (rows, fields, vType) => rows.map(r => {
    const cells = fields.map(ef => {
      const d = r.docs.find(x => x.field === ef.field);
      if (!d) return `<td><span class="mnt-dim" style="font-size:var(--text-sm)">δεν απαιτείται</span></td>`;
      return docCell(r, d);
    }).join('');
    const insurer = vType === 'Truck'
      ? `<td class="mnt-cell-edit mnt-mid" onclick="_expInsurerEdit(event,'${r.id}','Truck')" title="Κλικ για αλλαγή">${r.insurer ? escapeHtml(r.insurer) : '<span class="mnt-dim">—</span>'}</td>`
      : `<td><span class="mnt-dim">—</span></td>`;
    return `<tr>${vehicleCell(r)}${cells}${insurer}${renewCell(r.plate)}</tr>`;
  }).join('');
  const emptyRow = (cols, msg) => `<tr><td colspan="${cols}" style="height:auto;padding:0">${showEmpty({ illustration: 'truck', title: msg, description: 'Άλλαξε φίλτρο ή αναζήτηση για να δεις οχήματα.' })}</td></tr>`;

  const truckHead = TRUCK_EXPIRY_FIELDS.map(ef => `<th>${ef.label === 'Insurance' ? 'ΑΣΦΑΛΕΙΑ' : ef.label}</th>`).join('');
  const trailerHead = TRAILER_EXPIRY_FIELDS.map(ef => `<th>${ef.label === 'Insurance' ? 'ΑΣΦΑΛΕΙΑ' : ef.label}</th>`).join('');

  document.getElementById('content').innerHTML = `
    <div class="mnt-head">
      <span class="mnt-title">Λήξεις Εγγράφων</span>
      <span class="mnt-sub">${total} ενεργά οχήματα</span>
      ${pill('all', 'όλα', total)}
      ${pill('expired', 'ληγμένα', expired, 'is-danger')}
      ${pill('expiring30', 'λήγουν ≤30 ημ.', expiring30, 'is-warning')}
      ${pill('valid', 'σε ισχύ', valid, 'is-ok')}
      ${_expiryDocType ? `<button type="button" class="mnt-pill active" onclick="_expiryDocType='';_expiryPaint()" title="Καθαρισμός φίλτρου εγγράφου">μόνο ${escapeHtml(EXPIRY_DOC_GR[_expiryDocType] || _expiryDocType)} ✕</button>` : ''}
      <span class="mnt-spacer"></span>
      <input class="mnt-search" id="exp-q" placeholder="Αναζήτηση πινακίδας ή μάρκας…" value="${escapeHtml(_expirySearch)}" oninput="_expirySearchFn(this.value)">
      <button type="button" class="btn btn-ghost btn-sm" onclick="_expiryExportCSV()">Εξαγωγή CSV</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="_expiryPrint()">Εκτύπωση</button>
      ${_mntRefreshBtn("MAINT._loaded=false;MREQ._loaded=false;renderExpiryAlerts()")}
    </div>

    <div class="mnt-kpis">
      <button type="button" class="mnt-kpi ${_expiryTab === 'all' && !_expiryDocType ? 'active' : ''}" onclick="_expiryTab='all';_expiryDocType='';_expiryPaint()">
        <span class="mnt-kpi-l">Συμμόρφωση στόλου</span>
        <span class="mnt-kpi-v ${compCls}" style="font-size:var(--text-xl)">${compliancePct === null ? '—' : compliancePct + '%'}</span>
        <span class="mnt-bar"><i class="${compCls}" style="width:${compliancePct || 0}%"></i></span>
        <span class="mnt-kpi-s">${compliant}/${total} οχήματα χωρίς ληγμένο έγγραφο</span>
      </button>
      <button type="button" class="mnt-kpi ${_expiryTab === 'expired' ? 'active' : ''}" onclick="_expiryTab='expired';_expiryPaint()">
        <span class="mnt-kpi-l">Οχήματα με ληγμένο</span>
        <span class="mnt-kpi-v ${expired ? 'bad' : 'ok'}" style="font-size:var(--text-xl)">${expired}</span>
        <span class="mnt-kpi-s">${expiredTrucks} ${expiredTrucks === 1 ? 'φορτηγό' : 'φορτηγά'} · ${expiredTrailers} ${expiredTrailers === 1 ? 'ρυμούλκα' : 'ρυμούλκες'}${expired ? ' — άμεση ανανέωση' : ''}</span>
      </button>
      <button type="button" class="mnt-kpi ${_expiryTab === 'expiring30' ? 'active' : ''}" onclick="_expiryTab='expiring30';_expiryPaint()">
        <span class="mnt-kpi-l">Λήγουν ≤30 ημ.</span>
        <span class="mnt-kpi-v ${expiring30 ? 'warn' : 'ok'}" style="font-size:var(--text-xl)">${expiring30}</span>
        <span class="mnt-kpi-s">${expiring30 ? 'χρειάζονται προγραμματισμό' : 'τίποτα δεν λήγει μέσα σε 30 ημέρες'}</span>
      </button>
      <div class="mnt-kpi">
        <span class="mnt-kpi-l">Ανανεώθηκαν — 7 ημ.</span>
        <span class="mnt-kpi-v ${renewed7 ? 'ok' : ''}" style="font-size:var(--text-xl)">${MREQ._expiryLoadFailed ? '—' : renewed7}</span>
        <span class="mnt-kpi-s">${MREQ._expiryLoadFailed ? 'το ιστορικό ενεργειών δεν φορτώθηκε' : 'από το ιστορικό ενεργειών («✓ Ανανεώθηκε»)'}</span>
      </div>
    </div>

    <div class="mnt-section"><b>ΦΟΡΤΗΓΑ</b><span class="mnt-sub">${fTrucks.length}${fTrucks.length !== truckRows.length ? ` από ${truckRows.length}` : ''} ενεργά</span></div>
    <table class="mnt-table" id="exp-tbl-trucks">
      <thead><tr><th style="width:18%">ΟΧΗΜΑ</th>${truckHead}<th>ΑΣΦΑΛΙΣΤΗΣ</th><th>ΑΝΑΝΕΩΘΗΚΕ</th></tr></thead>
      <tbody>${fTrucks.length ? rowsFor(fTrucks, TRUCK_EXPIRY_FIELDS, 'Truck') : emptyRow(3 + TRUCK_EXPIRY_FIELDS.length, 'Κανένα φορτηγό σε αυτή την κατηγορία')}</tbody>
    </table>

    <div class="mnt-section" style="margin-top:var(--space-4)"><b>ΡΥΜΟΥΛΚΕΣ</b><span class="mnt-sub">${fTrailers.length}${fTrailers.length !== trailerRows.length ? ` από ${trailerRows.length}` : ''} ενεργές</span></div>
    <table class="mnt-table" id="exp-tbl-trailers">
      <thead><tr><th style="width:18%">ΟΧΗΜΑ</th>${trailerHead}<th>ΑΣΦΑΛΙΣΤΗΣ</th><th>ΑΝΑΝΕΩΘΗΚΕ</th></tr></thead>
      <tbody>${fTrailers.length ? rowsFor(fTrailers, TRAILER_EXPIRY_FIELDS, 'Trailer') : emptyRow(3 + TRAILER_EXPIRY_FIELDS.length, 'Καμία ρυμούλκα σε αυτή την κατηγορία')}</tbody>
    </table>
    <div class="mnt-foot">Ασφαλιστής ρυμουλκών: δεν υπάρχει στήλη στον πίνακα trailers — δεν καταχωρείται ακόμη. · Κλικ σε ημερομηνία ή ασφαλιστή για επεξεργασία.</div>`;

  // ΧΩΡΙΣΤΑ ανά πίνακα, ΠΟΤΕ μαζί: φορτηγά και ρυμούλκες έχουν ίδιο πλήθος
  // στηλών, αλλά ο ΑΣΦΑΛΙΣΤΗΣ είναι γεμάτος στα φορτηγά και κενός στις
  // ρυμούλκες. Κοινή κρίση θα κρατούσε ζωντανές 37 παύλες.
  collapseEmptyColumns('exp-tbl-trucks', 'maint:expiry:trucks');
  collapseEmptyColumns('exp-tbl-trailers', 'maint:expiry:trailers');
}

function _expirySearchFn(v) {
  _expirySearch = v.toLowerCase().trim();
  _expiryPaint();
  const el = document.getElementById('exp-q');
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

function _expiryExportCSV() {
  const truckRows = _expiryVehicleRows(MAINT.trucks, TRUCK_EXPIRY_FIELDS, 'Truck');
  const trailerRows = _expiryVehicleRows(MAINT.trailers, TRAILER_EXPIRY_FIELDS, 'Trailer');
  // Apply same shared filter (tab + search)
  const all = [..._expiryFilterRows(truckRows), ..._expiryFilterRows(trailerRows)];
  if (!all.length) { toast('Δεν υπάρχουν δεδομένα για εξαγωγή', 'error'); return; }
  const rows = [['Τύπος','Πινακίδα','Μάρκα','Μοντέλο','KTEO λήξη','KTEO ημέρες','KEK/FRC λήξη','KEK/FRC ημέρες','Ασφάλεια λήξη','Ασφάλεια ημέρες','Ασφαλιστής']];
  all.forEach(r => {
    const d = r.docs;
    const kt = d.find(x => x.label === 'KTEO'), kf = d.find(x => x.label === 'KEK' || x.label === 'FRC'), ins = d.find(x => x.label === 'Insurance');
    rows.push([_mntTypeGr(r.vType), r.plate, r.brand, r.model,
      kt?.date||'', kt?.days??'', kf?.date||'', kf?.days??'', ins?.date||'', ins?.days??'', r.insurer]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `fleet_expiry_${localToday()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  toast('Το CSV εξήχθη');
}

// Print through the app's own stylesheet (tokens), not a copied colour list.
function _expiryPrint() {
  const content = document.getElementById('content').innerHTML;
  const css = document.getElementById('maint-css')?.textContent || '';
  const base = document.baseURI.replace(/[^/]*$/, '');
  const win = window.open('', '_blank');
  if (!win) { toast('Ο browser μπλόκαρε το παράθυρο εκτύπωσης', 'error'); return; }
  win.document.write(`<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><title>Λήξεις Εγγράφων — Petras Group</title>
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${base}assets/style.css">
    <style>${css}
      body { padding:20px; background:var(--bg-card); color:var(--text); font-family:'DM Sans',sans-serif; }
      button, input, .mnt-foot { display:none !important; }
      .mnt-kpi { display:flex; }
      @media print { body { padding:10px; } }
    </style></head><body>${content}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 900);
}

// ═════════════════════════════════════════════════════════════════
// PAGE: ΙΣΤΟΡΙΚΟ SERVICE (w2-maint-service-overview 156:577)
// ═════════════════════════════════════════════════════════════════
let _svcFilters = { vehicle: '', type: '', status: '', year: '', workshop: '', review: '', q: '' };

async function renderServiceRecords() {
  document.getElementById('content').innerHTML = showLoading('Φόρτωση ιστορικού service…');
  try {
    await _maintLoad(true);
    _svcPaint();
  } catch(e) {
    document.getElementById('content').innerHTML = showError('Δεν φορτώθηκε το ιστορικό service');
    console.error(e);
  }
}

function _svcSetFilter(k, v) {
  _svcFilters[k] = v;
  _svcPaint();
  // Το _svcPaint ξαναγράφει ΟΛΟ το #content, οπότε το πεδίο αναζήτησης χάνει την
  // εστίαση σε κάθε πλήκτρο. Την επαναφέρουμε με τον δρομέα στο τέλος, αλλιώς η
  // αναζήτηση είναι απλώς αδύνατη.
  if (k === 'q') {
    const el = document.getElementById('svc-q');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }
}

function _svcClearFilters() {
  Object.keys(_svcFilters).forEach(k => _svcFilters[k] = '');
  _svcPaint();
}

function _svcSortedHistory() {
  return [...MAINT.history].sort((a, b) => (b.fields['Date']||'').localeCompare(a.fields['Date']||''));
}

// One table row for a service record — shared by Ιστορικό Service and the
// per-vehicle histories (showVehicle toggles the ΟΧΗΜΑ/ΚΑΤΗΓΟΡΙΑ column).
function _svcRowHtml(r, showVehicle) {
  const f = r.fields;
  const cat = MAINT_TYPE_LABEL[f['Type']] || f['Type'] || '';
  const status = MAINT_STATUS_LABEL[f['Status']] || f['Status'] || '—';
  const review = f['Needs Review'] ? `<span class="mnt-warn" style="font-size:var(--text-xs)">θέλει έλεγχο</span>` : '';
  const first = showVehicle
    ? `<td><div class="mnt-cell2"><span class="mnt-main">${escapeHtml(f['Vehicle Plate'] || '—')}</span><span class="mnt-dim">${_mntTypeGr(f['Vehicle Type']) || '—'}</span></div></td>
       <td><div class="mnt-cell2"><span>${escapeHtml(f['Description'] || '—')}</span>${cat ? `<span class="mnt-dim">${escapeHtml(cat)}</span>` : ''}</div></td>`
    : `<td class="mnt-mid" style="font-size:var(--text-sm)">${escapeHtml(cat || '—')}</td>
       <td>${escapeHtml(f['Description'] || '—')}</td>`;
  return `<tr class="click" onclick="_svcOpenCard('${r.id}')">
    <td class="mnt-num">${_fmtDMY(f['Date'])}</td>
    ${first}
    <td class="mnt-mid">${escapeHtml(_wsName(f['Workshop']))}</td>
    <td class="mnt-mid" style="font-size:var(--text-sm)">${f['Parts'] ? escapeHtml(f['Parts']) : '<span class="mnt-dim">—</span>'}</td>
    <td class="r mnt-num" style="font-weight:500">${_fmtCost(f['Cost'])}</td>
    <td class="r mnt-num mnt-mid">${f['Odometer km'] ? Number(f['Odometer km']).toLocaleString('el-GR') : '<span class="mnt-dim">—</span>'}</td>
    <td><div class="mnt-cell2"><span class="mnt-mid" style="font-size:var(--text-sm)">${escapeHtml(status)}</span>${review}</div></td>
  </tr>`;
}

function _svcPaint() {
  // SH-2/MA-3 guard: μην ζωγραφίσεις αν ο χρήστης έχει ήδη φύγει.
  if (typeof currentPage !== 'undefined' && currentPage !== 'maint_svc') return;
  _mntCloseDrawer();
  let records = _svcSortedHistory();

  // Apply filters
  if (_svcFilters.vehicle) records = records.filter(r => r.fields['Vehicle Plate'] === _svcFilters.vehicle);
  if (_svcFilters.type)    records = records.filter(r => r.fields['Type'] === _svcFilters.type);
  if (_svcFilters.status)  records = records.filter(r => r.fields['Status'] === _svcFilters.status);
  if (_svcFilters.year)    records = records.filter(r => (r.fields['Date']||'').startsWith(_svcFilters.year));
  if (_svcFilters.workshop) records = records.filter(r => _wsName(r.fields['Workshop']) === _svcFilters.workshop);
  if (_svcFilters.review)  records = records.filter(r => _svcFilters.review === 'yes' ? !!r.fields['Needs Review'] : !r.fields['Needs Review']);
  if (_svcFilters.q) {
    // Ένα πεδίο που ψάχνει παντού: με 1.091 εγγραφές το «θυμάμαι τι έγινε αλλά όχι πότε»
    // είναι η συνηθισμένη περίπτωση, και τα dropdown δεν το καλύπτουν.
    const q = _svcFilters.q.toLowerCase();
    records = records.filter(r => {
      const f = r.fields;
      return [f['Vehicle Plate'], f['Description'], f['Parts'], f['Invoice Number'],
              f['Notes'], _wsName(f['Workshop']), MAINT_TYPE_LABEL[f['Type']] || f['Type']]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
  }

  const allRecs = MAINT.history;
  const types = [...new Set(allRecs.map(r => r.fields['Type']).filter(Boolean))].sort();
  const vehicles = [...new Set(allRecs.map(r => r.fields['Vehicle Plate']).filter(Boolean))].sort();
  const statuses = [...new Set(allRecs.map(r => r.fields['Status']).filter(Boolean))].sort();
  const years = [...new Set(allRecs.map(r => (r.fields['Date']||'').slice(0,4)).filter(Boolean))].sort().reverse();
  const workshops = [...new Set(allRecs.map(r => _wsName(r.fields['Workshop'])).filter(n => n && n !== '—'))].sort();
  const reviewCount = allRecs.filter(r => r.fields['Needs Review']).length;
  const anyFilter = Object.values(_svcFilters).some(Boolean);

  const sel = (key, label, allLabel, opts) => `<select class="mnt-select" title="${label}" onchange="_svcSetFilter('${key}',this.value)">
      <option value="">${label}: ${allLabel}</option>
      ${opts.map(([v, l]) => `<option value="${escapeHtml(v)}" ${_svcFilters[key] === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
    </select>`;

  document.getElementById('content').innerHTML = `
    <div class="mnt-head">
      <span class="mnt-title">Ιστορικό Service</span>
      <span class="mnt-sub">${allRecs.length.toLocaleString('el-GR')} εργασίες${anyFilter ? ` · εμφανίζονται ${records.length.toLocaleString('el-GR')}` : ''}</span>
      ${sel('vehicle', 'Όχημα', 'Όλα', vehicles.map(v => [v, v]))}
      ${sel('type', 'Τύπος', 'Όλοι', types.map(t => [t, MAINT_TYPE_LABEL[t] || t]))}
      ${sel('workshop', 'Συνεργείο', 'Όλα', workshops.map(w => [w, w]))}
      ${sel('year', 'Έτος', 'Όλα', years.map(y => [y, y]))}
      ${sel('status', 'Κατάσταση', 'Όλες', statuses.map(s => [s, MAINT_STATUS_LABEL[s] || s]))}
      <button type="button" class="mnt-pill is-warning ${_svcFilters.review === 'yes' ? 'active' : ''}" title="Εγγραφές με προβληματικό δεδομένο στην πηγή" onclick="_svcSetFilter('review', _svcFilters.review === 'yes' ? '' : 'yes')"><b>${reviewCount}</b> θέλουν έλεγχο</button>
      ${anyFilter ? `<button type="button" class="mnt-link" onclick="_svcClearFilters()">καθαρισμός ✕</button>` : ''}
      <span class="mnt-spacer"></span>
      <input id="svc-q" class="mnt-search" style="width:200px" placeholder="Αναζήτηση…" title="Περιγραφή, ανταλλακτικό, τιμολόγιο, συνεργείο, πινακίδα"
             value="${escapeHtml(_svcFilters.q||'')}" oninput="_svcSetFilter('q',this.value)">
      <button type="button" class="btn btn-ghost btn-sm" onclick="_svcOpenForm(null, {scan:true})">Scan τιμολογίου</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="_svcOpenForm()">Νέα εγγραφή</button>
      ${_mntRefreshBtn("MAINT.history=[];renderServiceRecords()")}
    </div>

    <table class="mnt-table" id="svc-tbl">
      <thead><tr>
        <th style="width:100px">ΗΜ/ΝΙΑ</th><th style="width:150px">ΟΧΗΜΑ</th><th>ΕΡΓΑΣΙΑ</th><th style="width:200px">ΣΥΝΕΡΓΕΙΟ</th>
        <th style="width:130px">ΑΡ. ΑΝΤ/ΚΟΥ</th><th class="r" style="width:110px">ΚΟΣΤΟΣ</th><th class="r" style="width:120px">ΟΔΟΜΕΤΡΟ</th><th style="width:140px">ΚΑΤΑΣΤΑΣΗ</th>
      </tr></thead>
      <tbody>${records.length ? records.map(r => _svcRowHtml(r, true)).join('') : `<tr><td colspan="8" style="height:auto;padding:0">${showEmpty({
            illustration: 'order',
            title: anyFilter ? 'Καμία εργασία με αυτά τα φίλτρα' : 'Καμία καταγραφή συντήρησης ακόμη',
            description: anyFilter ? 'Άλλαξε ή καθάρισε τα φίλτρα.' : 'Εδώ καταγράφονται συντηρήσεις, επισκευές και έλεγχοι των οχημάτων του στόλου.',
            action: anyFilter ? { label: 'Καθαρισμός φίλτρων', onClick: '_svcClearFilters()' } : { label: 'Νέα εγγραφή', onClick: '_svcOpenForm()' }
          })}</td></tr>`}</tbody>
    </table>`;

  // ΑΡ. ΑΝΤ/ΚΟΥ και ΟΔΟΜΕΤΡΟ ΔΕΝ κρύβονται εδώ, και είναι σκόπιμο: έχουν 62 και
  // 76 πραγματικές τιμές αντίστοιχα στις 1.095 (Supabase 3/9). Ο κανόνας κόβει
  // μόνο στο 100%. Θα κρυφτούν μόνοι τους όταν ένα φίλτρο αφήσει ορατές μόνο
  // γραμμές χωρίς τιμή — εκεί όντως δεν λένε τίποτα.
  collapseEmptyColumns('svc-tbl', 'maint:svc');
}

// ── Record card (w2-maint-service-record-card 196:754) ──────────
function _svcOpenCard(id) {
  const rec = MAINT.history.find(r => r.id === id);
  if (!rec) { toast('Η εγγραφή δεν βρέθηκε', 'error'); return; }
  const f = rec.fields;
  const ws = _wsRec(f['Workshop']);
  const cat = MAINT_TYPE_LABEL[f['Type']] || f['Type'] || '';
  const status = MAINT_STATUS_LABEL[f['Status']] || f['Status'] || '—';
  const next = f['Next Service km'] ? `στα ${Number(f['Next Service km']).toLocaleString('el-GR')} χλμ`
             : f['Next Service Date'] ? _fmtDMY(f['Next Service Date'], true) : null;
  const spec = (label, val) => `<div class="ecard-spec"><span class="ecard-spec-label" style="min-width:150px">${label}</span><span class="ecard-spec-val${val ? '' : ' dim'}">${val || '—'}</span></div>`;
  const wsContact = ws ? [ws.fields['City'], ws.fields['Phone']].filter(Boolean).join(' · ') : '';
  _mntHost('mnt-drawer-host').innerHTML = `
    <div class="mnt-drawer-bg" onclick="_mntCloseDrawer()"></div>
    <div class="mnt-drawer" role="dialog" aria-modal="true" aria-label="Εγγραφή service ${escapeHtml(f['Vehicle Plate'] || '')}">
      <div class="mnt-drawer-head">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="mnt-drawer-plate">${escapeHtml(f['Vehicle Plate'] || '—')}</span>
          <span class="mnt-dim">${escapeHtml(cat)}${f['Vehicle Type'] ? ' · ' + _mntTypeGr(f['Vehicle Type']) : ''}</span>
          <button type="button" class="mnt-drawer-x" onclick="_mntCloseDrawer()" aria-label="Κλείσιμο">✕</button>
        </div>
        <span class="mnt-dim">${_fmtDMY(f['Date'], true)} · ${escapeHtml(status)}${f['Needs Review'] ? ' · θέλει έλεγχο' : ''}</span>
      </div>
      <div class="ecard-sec"><div class="ecard-sec-title">Εργασία</div><div class="ecard-sec-body">${escapeHtml(f['Description'] || '') || '<span class="mnt-dim">δεν έχει καταχωρηθεί</span>'}</div></div>
      <div class="ecard-sec"><div class="ecard-sec-title">Στοιχεία</div>
        ${spec('Κόστος', _fmtCost(f['Cost']) === '—' ? '' : _fmtCost(f['Cost']))}
        ${spec('Οδόμετρο', f['Odometer km'] ? Number(f['Odometer km']).toLocaleString('el-GR') + ' χλμ' : '')}
        ${spec('Αρ. τιμολογίου', escapeHtml(f['Invoice Number'] || ''))}
        ${spec('Επόμενο σέρβις', next ? escapeHtml(next) : '')}
      </div>
      <div class="ecard-sec"><div class="ecard-sec-title">Ανταλλακτικά</div><div class="ecard-sec-body">${escapeHtml(f['Parts'] || '') || '<span class="mnt-dim">—</span>'}</div></div>
      <div class="ecard-sec"><div class="ecard-sec-title">Συνεργείο</div>
        <div style="display:flex;align-items:center;gap:8px"><span style="font-weight:500;color:var(--text)">${ws ? escapeHtml(ws.fields['Name'] || '—') : '<span class="mnt-dim">δεν έχει καταχωρηθεί</span>'}</span>
          ${ws ? `<span class="mnt-spacer"></span><button type="button" class="mnt-link" onclick="_mntOpenWorkshop('${ws.id}')">καρτέλα →</button>` : ''}</div>
        ${ws ? `<div class="mnt-dim" style="margin-top:4px">${wsContact ? escapeHtml(wsContact) : 'πόλη/τηλέφωνο — δεν έχουν καταχωρηθεί'}</div>` : ''}
      </div>
      <div class="ecard-sec" style="border-bottom:none"><div class="ecard-sec-title">Σημειώσεις</div><div class="ecard-sec-body mnt-mid">${escapeHtml(f['Notes'] || '') || '<span class="mnt-dim">—</span>'}</div></div>
      <div class="mnt-drawer-foot">
        <button type="button" class="btn btn-ghost btn-sm" style="margin-right:auto;color:var(--danger)" onclick="_svcDelete('${rec.id}')">Διαγραφή</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="_mntCloseDrawer()">Κλείσιμο</button>
        <button type="button" class="btn btn-primary btn-sm" onclick="_mntCloseDrawer();_svcOpenForm('${rec.id}')">Επεξεργασία</button>
      </div>
    </div>`;
}

// «καρτέλα →»: the Workshops screen has no deep link, so navigate and select
// once its list has rendered (bounded wait — gives up silently after 4s).
function _mntOpenWorkshop(wsId) {
  _mntCloseDrawer();
  navigate('workshops');
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    const ready = document.getElementById('workshops_table') && typeof selectEntity === 'function'
      && typeof _entityState !== 'undefined' && _entityState.workshops?.records?.length;
    if (ready) { clearInterval(t); selectEntity('workshops', wsId); }
    else if (tries > 20) clearInterval(t);
  }, 200);
}

// ── Form (w2-maint-service-form 165:679) ─────────────────────────
function _svcOpenForm(editId, opts) {
  const rec = editId ? MAINT.history.find(r => r.id === editId) : null;
  const f = rec ? rec.fields : {};

  const allVehicles = [
    ...MAINT.trucks.map(t => ({ plate: t.fields['License Plate']||'', type: 'Truck' })),
    ...MAINT.trailers.map(t => ({ plate: t.fields['License Plate']||'', type: 'Trailer' })),
  ].filter(v => v.plate).sort((a,b) => a.plate.localeCompare(b.plate));

  const wsOpts = MAINT.workshops
    .filter(w => w.fields['Active'])
    .map(w => `<option value="${w.id}"${(f['Workshop']||[])[0]===w.id?' selected':''}>${escapeHtml(w.fields['Name']||'?')}</option>`)
    .join('');

  const vPlate = f['Vehicle Plate'] || '';
  const field = (label, inner, extra) => `<div class="form-field"><label class="form-label">${label}</label>${inner}${extra || ''}</div>`;

  _mntHost('mnt-modal-host').innerHTML = `
    <div class="mf-overlay" onclick="if(event.target===this)_mntCloseModal()">
      <div class="mf-modal" role="dialog" aria-modal="true">
        <div class="mf-head"><span>${editId ? 'Επεξεργασία Service' : 'Νέο Service'}</span>
          <button type="button" class="mnt-drawer-x" onclick="_mntCloseModal()" aria-label="Κλείσιμο">✕</button></div>
        <div class="mf-body">
          <div class="mf-scan">
            <input type="file" id="mf-scanfile" accept="image/*,application/pdf" style="display:none" onchange="_svcScanInvoice(this)">
            <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('mf-scanfile').click()">Σκανάρισμα τιμολογίου (AI)</button>
            <span id="mf-scanstatus" class="mnt-dim">συμπληρώνει μόνο τα κενά πεδία — ο χρήστης ελέγχει πριν την αποθήκευση</span>
          </div>
          <div class="mf-row">
            ${field('Όχημα *', `<select class="form-select" id="mf-vehicle">
                <option value="">Επιλογή οχήματος…</option>
                ${allVehicles.map(v => `<option value="${escapeHtml(v.plate)}|${v.type}"${vPlate===v.plate?' selected':''}>${escapeHtml(v.plate)} (${_mntTypeGr(v.type)})</option>`).join('')}
              </select>`, '<div class="ef-err" id="mf-err-vehicle"></div>')}
            ${field('Ημερομηνία', `<input class="form-input" type="date" id="mf-date" value="${f['Date']?toLocalDate(f['Date']):localToday()}">`)}
          </div>
          <div class="mf-row">
            ${field('Τύπος', `<select class="form-select" id="mf-type">${MAINT_TYPES.map(([v,l]) => `<option value="${v}"${f['Type']===v?' selected':''}>${l}</option>`).join('')}</select>`)}
            ${field('Συνεργείο', `<select class="form-select" id="mf-workshop"><option value="">—</option>${wsOpts}</select>`)}
          </div>
          ${field('Περιγραφή', `<textarea class="form-textarea" id="mf-desc" rows="2">${escapeHtml(f['Description']||'')}</textarea>`)}
          <div class="mf-row">
            ${field('Κόστος €', `<input class="form-input" type="number" id="mf-cost" step="0.01" value="${f['Cost'] ?? ''}">`, '<div class="ef-err" id="mf-err-cost"></div>')}
            ${field('Χιλιόμετρα (οδόμετρο)', `<input class="form-input" type="number" id="mf-odo" value="${f['Odometer km'] ?? ''}">`, '<div class="ef-err" id="mf-err-odo"></div>')}
            ${field('Αρ. Τιμολογίου', `<input class="form-input" type="text" id="mf-inv" value="${escapeHtml(f['Invoice Number']||'')}">`)}
          </div>
          ${field('Ανταλλακτικά', `<textarea class="form-textarea" id="mf-parts" rows="2">${escapeHtml(f['Parts']||'')}</textarea>`)}
          <div class="mf-row">
            ${field('Επόμενο Service (ημ/νία)', `<input class="form-input" type="date" id="mf-nextdate" value="${f['Next Service Date']?toLocalDate(f['Next Service Date']):''}">`)}
            ${field('Επόμενο Service (km)', `<input class="form-input" type="number" id="mf-nextkm" value="${f['Next Service km'] ?? ''}">`)}
            ${field('Κατάσταση', `<select class="form-select" id="mf-status">
                ${[['Completed','Ολοκληρώθηκε'],['Scheduled','Προγραμματισμένο'],['In Progress','Σε εξέλιξη']].map(([v,l]) => `<option value="${v}"${(f['Status']||'Completed')===v?' selected':''}>${l}</option>`).join('')}
              </select>`)}
          </div>
          ${field('Σημειώσεις', `<textarea class="form-textarea" id="mf-notes" rows="2">${escapeHtml(f['Notes']||'')}</textarea>`)}
        </div>
        <div class="mf-foot">
          ${editId ? `<button type="button" class="btn btn-ghost btn-sm" style="margin-right:auto;color:var(--danger)" onclick="_svcDelete('${editId}')">Διαγραφή</button>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" onclick="_mntCloseModal()">Άκυρο</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="_svcSave('${editId||''}')">Αποθήκευση</button>
        </div>
      </div>
    </div>`;
  if (opts && opts.scan) document.getElementById('mf-scanfile')?.click();
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
  const setErr = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg || ''; };
  setErr('mf-err-vehicle'); setErr('mf-err-cost'); setErr('mf-err-odo');
  const vSel = document.getElementById('mf-vehicle').value;
  const [plate, vType] = vSel ? vSel.split('|') : ['',''];
  if (!plate) { setErr('mf-err-vehicle', 'Επιλέξτε όχημα'); return; }

  // Completed records must carry Cost + Odometer km — they feed the per-km
  // wear-rate calibration (TRIP_COSTS_SPEC §10.2 item 10)
  const stVal   = document.getElementById('mf-status').value;
  const costRaw = document.getElementById('mf-cost').value.trim();
  const odoRaw  = document.getElementById('mf-odo').value.trim();
  if (stVal === 'Completed' && (costRaw === '' || odoRaw === '')) {
    if (costRaw === '') setErr('mf-err-cost', 'Απαιτείται για ολοκληρωμένο service');
    if (odoRaw === '')  setErr('mf-err-odo', 'Απαιτείται για ολοκληρωμένο service');
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
    setErr('mf-err-vehicle', `Το όχημα ${plate} δεν βρέθηκε στον στόλο`);
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
    _mntCloseModal();
    MAINT.history = [];
    _mntRepaintCurrent();
  } catch(e) {
    reportError('Η αποθήκευση απέτυχε', e);
  }
}

async function _svcDelete(id) {
  if (!(await confirmAction('Διαγραφή αυτής της εγγραφής service;', { danger: true, confirmLabel: 'Διαγραφή' }))) return;
  try {
    await atSoftDelete(TABLES.MAINT_HISTORY, id);
    toast('Η εγγραφή διαγράφηκε');
    _mntCloseModal(); _mntCloseDrawer();
    MAINT.history = [];
    _mntRepaintCurrent();
  } catch(e) { reportError('Η διαγραφή απέτυχε', e); }
}

// After a write, redraw whichever maintenance screen is open (the form can be
// opened from four of them).
function _mntRepaintCurrent() {
  const p = (typeof currentPage !== 'undefined') ? currentPage : 'maint_svc';
  if (p === 'maint_trucks') return _renderHistory('trucks');
  if (p === 'maint_trailers') return _renderHistory('trailers');
  if (p === 'maint_dash') return renderMaintDash();
  return renderServiceRecords();
}

// ═════════════════════════════════════════════════════════════════
// PAGES: ΙΣΤΟΡΙΚΟ ΦΟΡΤΗΓΩΝ / ΡΥΜΟΥΛΚΩΝ (173:824 / 173:1492)
// ═════════════════════════════════════════════════════════════════
let _historyVehicle = { trucks: '', trailers: '' };

// MT-2/ML-4: είσοδος από το detail του οχήματος (Trucks/Trailers) στο
// ιστορικό ΤΟΥ, προεπιλεγμένο — η σελίδα ιστορικού παύει να είναι
// «σελίδα-για-ένα-dropdown»: φτάνεις με το όχημα ήδη διαλεγμένο.
function _openVehicleHistory(entityKey, plate) {
  const vType = entityKey === 'trucks' ? 'trucks' : 'trailers';
  if (plate) _historyVehicle[vType] = plate;
  navigate(vType === 'trucks' ? 'maint_trucks' : 'maint_trailers');
}
window._openVehicleHistory = _openVehicleHistory;

async function renderTrucksHistory()   { await _renderHistory('trucks'); }
async function renderTrailersHistory() { await _renderHistory('trailers'); }

async function _renderHistory(vType) {
  document.getElementById('content').innerHTML = showLoading('Φόρτωση ιστορικού…');
  try {
    await _maintLoad(true);
    _historyPaint(vType);
  } catch(e) {
    document.getElementById('content').innerHTML = showError('Δεν φορτώθηκε το ιστορικό συντήρησης');
    console.error(e);
  }
}

// History UI state per vType
const _historyFilter = { trucks: {}, trailers: {} };

function _historySetFilter(vType, k, v) {
  _historyFilter[vType][k] = v;
  _historyPaint(vType);
  if (k === 'q') { const el = document.getElementById('hist-q'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
}

function _historyPaint(vType) {
  const page = vType === 'trucks' ? 'maint_trucks' : 'maint_trailers';
  // SH-2/MA-3 guard: η σελίδα ιστορικού γράφει μετά από αργό fetch.
  if (typeof currentPage !== 'undefined' && currentPage !== page) return;
  _mntCloseDrawer();
  const vehicles = vType === 'trucks' ? MAINT.trucks : MAINT.trailers;
  const vTypeLabel = vType === 'trucks' ? 'Truck' : 'Trailer';   // DB value in 'Vehicle Type'
  const vTypeGr    = vType === 'trucks' ? 'φορτηγό' : 'ρυμούλκα'; // display only
  // No auto-selection. The first active plate used to be selected silently, so
  // the page opened on CB0138HO with a full title and an empty history — and
  // an empty history for the wrong vehicle reads exactly like an empty history
  // for the right one. Nothing is selected until someone selects it.
  // See docs/design/DEEP_AUDIT_2026-08-04/maint_trucks.md MT-4 / Π3 and Figma 173:1492.
  const selected = _historyVehicle[vType];
  const state = _historyFilter[vType];

  const vehicleOpts = vehicles
    .filter(v => v.fields['Active'])
    .sort((a,b) => (a.fields['License Plate']||'').localeCompare(b.fields['License Plate']||''))
    .map(v => {
      const p = v.fields['License Plate']||'?';
      return `<option value="${escapeHtml(p)}"${selected===p?' selected':''}>${escapeHtml(p)} — ${escapeHtml([v.fields['Brand'], v.fields['Model']].filter(Boolean).join(' '))}</option>`;
    }).join('');

  // All records for selected vehicle (for stats)
  const allRecs = selected
    ? MAINT.history
        .filter(r => r.fields['Vehicle Plate'] === selected && r.fields['Vehicle Type'] === vTypeLabel)
        .sort((a, b) => (b.fields['Date']||'').localeCompare(a.fields['Date']||''))
    : [];

  const years = [...new Set(allRecs.map(r => (r.fields['Date']||'').slice(0, 4)).filter(Boolean))].sort().reverse();
  const types = [...new Set(allRecs.map(r => r.fields['Type']).filter(Boolean))].sort();

  let records = allRecs;
  if (state.year)  records = records.filter(r => (r.fields['Date']||'').startsWith(state.year));
  if (state.type)  records = records.filter(r => r.fields['Type'] === state.type);
  if (state.q) {
    const q = state.q.toLowerCase();
    records = records.filter(r => {
      const f = r.fields;
      return [f['Description'], f['Type'], MAINT_TYPE_LABEL[f['Type']], f['Parts'], f['Invoice Number'], f['Notes'], _wsName(f['Workshop'])]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
  }

  const year = new Date().getFullYear();
  const ytd = allRecs.filter(r => (r.fields['Date']||'').startsWith(String(year)));
  const prev = allRecs.filter(r => (r.fields['Date']||'').startsWith(String(year - 1)));
  const ytdCost = _sumCost(ytd), prevCost = _sumCost(prev);
  const delta = (prevCost.sum > 0 && ytdCost.n) ? Math.round((ytdCost.sum - prevCost.sum) / prevCost.sum * 100) : null;
  const avg = ytdCost.n ? ytdCost.sum / ytdCost.n : null;
  const last = allRecs[0] || null;
  const firstYear = allRecs.length ? (allRecs[allRecs.length - 1].fields['Date'] || '').slice(0, 4) : '';
  const nextSvc = last ? (last.fields['Next Service km'] ? `επόμενο στα ${Number(last.fields['Next Service km']).toLocaleString('el-GR')} χλμ`
                        : last.fields['Next Service Date'] ? `επόμενο ${_fmtDMY(last.fields['Next Service Date'])}` : 'επόμενο σέρβις — δεν έχει καταχωρηθεί') : '';

  // Category breakdown (current year) and top workshops (all years)
  const byType = {};
  ytd.forEach(r => { const t = r.fields['Type'] || 'Other'; byType[t] = byType[t] || { count: 0, cost: 0 }; byType[t].count++; byType[t].cost += Number(r.fields['Cost']) || 0; });
  const typeEntries = Object.entries(byType).sort((a, b) => b[1].cost - a[1].cost).slice(0, 5);
  const maxTypeCost = typeEntries.length ? typeEntries[0][1].cost : 0;
  const byWs = {};
  allRecs.forEach(r => { const n = _wsName(r.fields['Workshop']); if (!n || n === '—') return; byWs[n] = (byWs[n] || 0) + (Number(r.fields['Cost']) || 0); });
  const topWs = Object.entries(byWs).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const vRec = selected ? vehicles.find(v => v.fields['License Plate'] === selected) : null;
  const canNew = !!selected;

  document.getElementById('content').innerHTML = `
    <div class="mnt-head">
      <span class="mnt-title">${vType === 'trucks' ? 'Ιστορικό Φορτηγών' : 'Ιστορικό Ρυμουλκών'}</span>
      <select class="mnt-select wide" title="Όχημα" onchange="_historyVehicle['${vType}']=this.value;_historyFilter['${vType}']={};_historyPaint('${vType}')">
        <option value="">Επίλεξε ${vTypeGr}…</option>
        ${vehicleOpts}
      </select>
      ${selected ? `
        <select class="mnt-select" title="Έτος" onchange="_historySetFilter('${vType}','year',this.value)">
          <option value="">Έτος: Όλα</option>
          ${years.map(y => `<option value="${y}"${state.year===y?' selected':''}>${y}</option>`).join('')}
        </select>
        <select class="mnt-select" title="Κατηγορία" onchange="_historySetFilter('${vType}','type',this.value)">
          <option value="">Κατηγορία: Όλες</option>
          ${types.map(t => `<option value="${escapeHtml(t)}"${state.type===t?' selected':''}>${escapeHtml(MAINT_TYPE_LABEL[t] || t)}</option>`).join('')}
        </select>
        <span class="mnt-pill static"><b>${records.length}</b> ${records.length === 1 ? 'εργασία' : 'εργασίες'}${records.length !== allRecs.length ? ` από ${allRecs.length}` : ''}</span>
      ` : ''}
      <span class="mnt-spacer"></span>
      ${selected ? `<input id="hist-q" class="mnt-search" style="width:180px" placeholder="Αναζήτηση εργασίας…" value="${escapeHtml(state.q || '')}" oninput="_historySetFilter('${vType}','q',this.value)">` : ''}
      <button type="button" class="btn btn-ghost btn-sm" onclick="_historyExport('${vType}')" ${canNew ? '' : 'disabled title="Επίλεξε πρώτα όχημα"'}>Εξαγωγή CSV</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="_svcOpenFormForVehicle('${vType}')" ${canNew ? '' : 'disabled title="Επίλεξε πρώτα όχημα"'}>Νέα εγγραφή</button>
      ${_mntRefreshBtn(`MAINT.history=[];_renderHistory('${vType}')`)}
    </div>

    ${!selected ? `
      <div style="max-width:420px;margin:120px auto 0">${showEmpty({
        illustration: 'truck',
        title: vType === 'trucks' ? 'Κανένα φορτηγό επιλεγμένο' : 'Καμία ρυμούλκα επιλεγμένη',
        description: `Επίλεξε ${vTypeGr} από τη λίστα πάνω για να δεις το ιστορικό ${vType === 'trucks' ? 'του' : 'της'}.`,
      })}</div>
      <p class="mnt-note" style="text-align:center;max-width:560px;margin:var(--space-3) auto 0">Τίποτα δεν προεπιλέγεται — κενό ιστορικό λάθος οχήματος μοιάζει με κενό ιστορικό του σωστού. Από την καρτέλα οχήματος φτάνεις εδώ με το όχημα ήδη διαλεγμένο.</p>
    ` : `
      <div class="mnt-kpis">
        <div class="mnt-kpi">
          <span class="mnt-kpi-l">Δαπάνη ${year}</span>
          <span class="mnt-kpi-v" style="font-size:var(--text-xl)">${ytdCost.n ? _fmtCost(ytdCost.sum) : '—'}${delta !== null ? `<small class="${delta > 0 ? 'mnt-warn' : 'mnt-ok'}">${delta > 0 ? '+' : ''}${delta}% vs ${year - 1}</small>` : ''}</span>
          <span class="mnt-kpi-s">${prevCost.n ? `${year - 1}: ${_fmtCost(prevCost.sum)}` : `${year - 1}: καμία εργασία`}${ytdCost.missing ? ` · ${ytdCost.missing} χωρίς κόστος` : ''}</span>
        </div>
        <div class="mnt-kpi">
          <span class="mnt-kpi-l">Εργασίες ${year}</span>
          <span class="mnt-kpi-v" style="font-size:var(--text-xl)">${ytd.length}</span>
          <span class="mnt-kpi-s">${allRecs.length} συνολικά${firstYear ? ` από το ${firstYear}` : ''}</span>
        </div>
        <div class="mnt-kpi">
          <span class="mnt-kpi-l">Μ.Ο. ανά εργασία</span>
          <span class="mnt-kpi-v" style="font-size:var(--text-xl)">${avg === null ? '—' : _fmtCost(avg)}</span>
          <span class="mnt-kpi-s">${avg === null ? `καμία εργασία με κόστος το ${year}` : `μέσος όρος ${year} (${ytdCost.n} με κόστος)`}</span>
        </div>
        <div class="mnt-kpi">
          <span class="mnt-kpi-l">Τελευταίο σέρβις</span>
          <span class="mnt-kpi-v" style="font-size:var(--text-xl)">${last ? _fmtDMY(last.fields['Date']) : '—'}</span>
          <span class="mnt-kpi-s">${last ? `${_relDays(last.fields['Date'])} · ${nextSvc}` : 'καμία εργασία καταχωρημένη'}</span>
        </div>
      </div>

      <div class="mnt-grid2">
        <div class="mnt-card">
          <span class="mnt-card-t">Ανάλυση ανά κατηγορία — ${year}</span>
          ${typeEntries.length ? typeEntries.map(([t, s]) => `
            <div class="mnt-row" style="min-height:22px;font-size:var(--text-xs)">
              <span style="width:180px;flex-shrink:0">${escapeHtml(MAINT_TYPE_LABEL[t] || t)}</span>
              <span class="mnt-bar thick grow"><i style="width:${maxTypeCost ? Math.round(s.cost / maxTypeCost * 100) : 0}%"></i></span>
              <span class="mnt-dim mnt-num" style="width:32px;text-align:right">${s.count}×</span>
              <span class="mnt-num" style="width:70px;text-align:right;font-weight:700">${_fmtCost(s.cost)}</span>
            </div>`).join('') : `<span class="mnt-dim">Καμία εργασία το ${year}</span>`}
        </div>
        <div class="mnt-card">
          <span class="mnt-card-t">Top συνεργεία — όλα τα έτη</span>
          ${topWs.length ? topWs.map(([n, c], i) => `
            <div class="mnt-row" style="min-height:22px;font-size:var(--text-xs)">
              <span class="mnt-dim" style="width:24px;font-weight:700">#${i + 1}</span>
              <span class="grow">${escapeHtml(n)}</span>
              <span class="mnt-num" style="font-weight:700">${_fmtCost(c)}</span>
            </div>`).join('') : `<span class="mnt-dim">Κανένα συνεργείο καταχωρημένο</span>`}
        </div>
      </div>

      <table class="mnt-table" id="hist-tbl">
        <thead><tr>
          <th style="width:110px">ΗΜ/ΝΙΑ</th><th style="width:200px">ΚΑΤΗΓΟΡΙΑ</th><th>ΕΡΓΑΣΙΑ</th><th style="width:220px">ΣΥΝΕΡΓΕΙΟ</th>
          <th style="width:130px">ΑΡ. ΑΝΤ/ΚΟΥ</th><th class="r" style="width:120px">ΚΟΣΤΟΣ</th><th class="r" style="width:130px">ΟΔΟΜΕΤΡΟ</th><th style="width:140px">ΚΑΤΑΣΤΑΣΗ</th>
        </tr></thead>
        <tbody>${records.length ? records.map(r => _svcRowHtml(r, false)).join('') : `<tr><td colspan="8" style="height:auto;padding:0">${showEmpty({
          illustration: 'order',
          title: allRecs.length ? 'Καμία εργασία με αυτά τα φίλτρα' : `Καμία εργασία για ${escapeHtml(selected)}`,
          description: allRecs.length ? 'Άλλαξε έτος, κατηγορία ή αναζήτηση.' : `Δεν έχει καταχωρηθεί ιστορικό για αυτ${vType === 'trucks' ? 'ό το φορτηγό' : 'ή τη ρυμούλκα'}${vRec ? '' : ' (δεν βρέθηκε στον ενεργό στόλο)'}.`,
          action: allRecs.length ? null : { label: 'Νέα εγγραφή', onClick: `_svcOpenFormForVehicle('${vType}')` },
        })}</td></tr>`}</tbody>
      </table>
    `}`;

  // Ένα όχημα τη φορά: εδώ οι στήλες αδειάζουν πολύ πιο εύκολα από ό,τι στο
  // συνολικό Ιστορικό — γι' αυτό ο κανόνας κρίνει τις ΟΡΑΤΕΣ γραμμές και όχι
  // τον πίνακα ολόκληρο. Χωριστό κλειδί ανά τύπο οχήματος.
  collapseEmptyColumns('hist-tbl', 'maint:hist:' + vType);
}

// Export history to CSV
function _historyExport(vType) {
  const selected = _historyVehicle[vType];
  if (!selected) { if (typeof toast === 'function') toast('Επίλεξε πρώτα όχημα', 'error'); return; }
  const vTypeLabel = vType === 'trucks' ? 'Truck' : 'Trailer';
  const recs = MAINT.history
    .filter(r => r.fields['Vehicle Plate'] === selected && r.fields['Vehicle Type'] === vTypeLabel)
    .sort((a, b) => (b.fields['Date']||'').localeCompare(a.fields['Date']||''));
  if (!recs.length) { if (typeof toast === 'function') toast('Δεν υπάρχουν εγγραφές για εξαγωγή'); return; }
  const rows = [['Ημερομηνία','Κατηγορία','Συνεργείο','Εργασία','Ανταλλακτικά','Κόστος','Οδόμετρο km','Κατάσταση']];
  recs.forEach(r => {
    const f = r.fields;
    rows.push([
      f['Date']||'', MAINT_TYPE_LABEL[f['Type']] || f['Type'] || '', _wsName(f['Workshop']),
      f['Description']||'', f['Parts']||'', f['Cost'] ?? '', f['Odometer km'] ?? '', MAINT_STATUS_LABEL[f['Status']] || f['Status'] || ''
    ]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${vType}-history-${selected.replace(/\s+/g,'_')}-${localToday()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  if (typeof toast === 'function') toast('Το CSV εξήχθη');
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
    const sel = document.getElementById('mf-vehicle');
    if (sel) sel.value = `${selected}|${vTypeLabel}`;
  }
}

// ═════════════════════════════════════════════════════════════════
// PAGE: ΚΕΝΤΡΟ ΣΥΝΤΗΡΗΣΗΣ (w2-maint-dashboard 193:823)
// ═════════════════════════════════════════════════════════════════
let _maintDashRefreshTimer = null;
const _MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

async function renderMaintDash() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Φόρτωση κέντρου συντήρησης…');
  try {
    await _maintLoad(true);
    _maintDashPaint();
    // Auto-refresh every 5 minutes while the page stays open
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
    c.innerHTML = showError('Δεν φορτώθηκαν τα δεδομένα συντήρησης');
  }
}

function _maintDashPaint() {
  const c = document.getElementById('content');
  const now = new Date();
  const year = now.getFullYear();

  const activeTrucks = MAINT.trucks.filter(t => t.fields['Active']);
  const activeTrailers = MAINT.trailers.filter(t => t.fields['Active']);
  const totalFleet = activeTrucks.length + activeTrailers.length;

  const allExpRows = _expiryBuildRows();
  const expiredRows = allExpRows.filter(r => r.days !== null && r.days < 0);
  const expiring30Rows = allExpRows.filter(r => r.days !== null && r.days >= 0 && r.days <= 30);
  const kteoExpired = expiredRows.filter(r => r.docType === 'KTEO').length;
  const kekExpired = expiredRows.filter(r => r.docType === 'KEK').length;
  const insExpired = expiredRows.filter(r => r.docType === 'Insurance').length;
  const frcExpired = expiredRows.filter(r => r.docType === 'FRC').length;

  // Per-vehicle rows (worst document first) — the same table maint_expiry shows.
  const vehicleRows = [..._expiryVehicleRows(MAINT.trucks, TRUCK_EXPIRY_FIELDS, 'Truck'), ..._expiryVehicleRows(MAINT.trailers, TRAILER_EXPIRY_FIELDS, 'Trailer')]
    .sort((a, b) => (a.worst === null ? 1 : b.worst === null ? -1 : a.worst - b.worst));
  const expiredVehicles = vehicleRows.filter(r => r.worst !== null && r.worst < 0).length;
  const compliancePct = _pctOf(totalFleet - expiredVehicles, totalFleet);
  const compCls = compliancePct === null ? '' : compliancePct >= 90 ? 'ok' : compliancePct >= 70 ? 'warn' : 'bad';
  const worst6 = vehicleRows.filter(r => r.worst !== null).slice(0, 6);

  // Year spend / damages
  const yearRecs = MAINT.history.filter(r => (r.fields['Date'] || '').startsWith(String(year)));
  const yearCost = _sumCost(yearRecs);
  const monthsElapsed = now.getMonth() + 1;
  const accidents = yearRecs.filter(r => r.fields['Type'] === 'Accident');
  const accCost = _sumCost(accidents);

  // Last 6 months
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: _MONTHS_GR[d.getMonth()], recs: [] });
  }
  for (const r of MAINT.history) {
    const m = months.find(x => (r.fields['Date'] || '').startsWith(x.key));
    if (m) m.recs.push(r);
  }
  months.forEach(m => { m.cost = _sumCost(m.recs); });
  const sixSum = months.reduce((s, m) => s + m.cost.sum, 0);
  const sixN = months.reduce((s, m) => s + m.cost.n, 0);
  const sixMissing = months.reduce((s, m) => s + m.cost.missing, 0);
  const maxMonth = Math.max(...months.map(m => m.cost.sum), 0);
  const peak = maxMonth > 0 ? months.find(m => m.cost.sum === maxMonth) : null;
  let peakNote = '';
  if (peak) {
    const top = [...peak.recs].filter(r => Number.isFinite(Number(r.fields['Cost']))).sort((a, b) => Number(b.fields['Cost']) - Number(a.fields['Cost']))[0];
    if (top) {
      const share = _pctOf(Number(top.fields['Cost']), peak.cost.sum);
      peakNote = `${peak.label}: ${escapeHtml(top.fields['Description'] || MAINT_TYPE_LABEL[top.fields['Type']] || 'εργασία')} ${escapeHtml(top.fields['Vehicle Plate'] || '')} (${_fmtCost(top.fields['Cost'])}) — το ${share}% του μήνα (${_fmtCost(peak.cost.sum)})`;
    }
  }

  // Recent 5 and category top 5
  const recent = _svcSortedHistory().slice(0, 5);
  const byType = {};
  yearRecs.forEach(r => { const t = r.fields['Type'] || 'Other'; byType[t] = (byType[t] || 0) + (Number(r.fields['Cost']) || 0); });
  const cats = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCat = cats.length ? cats[0][1] : 0;

  // Report the figures this page shows. expiredDocRows is the DOCUMENT count
  // (one row per expired certificate) — deliberately a different key from
  // maint_expiry's expiredVehicles, so the audit compares like with like and
  // can state why the two legitimately differ.
  if (typeof reportPageMetrics === 'function') reportPageMetrics('maint_dash', {
    expiredDocRows: expiredRows.length,
    kteoExpired, kekExpired, frcExpired, insExpired,
    expiredVehicles,
    totalFleet,
    activeTrucks: activeTrucks.length,
    activeTrailers: activeTrailers.length,
    compliantVehicles: totalFleet - expiredVehicles,
    compliancePct,
  });

  // SH-2/MA-3: the fetches above take seconds. If the user has navigated
  // away meanwhile, writing here would paint THIS page under ANOTHER page's
  // title — reproduced live 8/8 (topbar «Drivers», content «Επισκόπηση
  // Στόλου»). currentPage is the router's source of truth.
  if (typeof currentPage !== 'undefined' && currentPage !== 'maint_dash') return;
  _mntCloseDrawer();

  const hhmm = now.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });

  c.innerHTML = `
    <div class="mnt-head">
      <span class="mnt-title">Κέντρο Συντήρησης</span>
      <span class="mnt-sub">στόλος &amp; έγγραφα σε μία ματιά</span>
      <span class="mnt-spacer"></span>
      <span class="mnt-sub" style="font-size:var(--text-xs)">Ενημερώθηκε ${hhmm} · ανανέωση κάθε 5'</span>
      ${_mntRefreshBtn("MAINT._loaded=false;MAINT.history=[];renderMaintDash()")}
    </div>

    <div class="mnt-kpis">
      <button type="button" class="mnt-kpi" onclick="_expiryGoto('all')">
        <span class="mnt-kpi-l">Σύνολο στόλου</span>
        <span class="mnt-kpi-v">${totalFleet}</span>
        <span class="mnt-kpi-s">ενεργά · ${activeTrucks.length} φορτηγά, ${activeTrailers.length} ρυμ. · ${MAINT.trucks.length + MAINT.trailers.length} σύνολο</span>
      </button>
      <button type="button" class="mnt-kpi" onclick="_expiryGoto('all')">
        <span class="mnt-kpi-l">Συμμόρφωση</span>
        <span class="mnt-kpi-v ${compCls}">${compliancePct === null ? '—' : compliancePct + '%'}</span>
        <span class="mnt-kpi-s">${totalFleet - expiredVehicles}/${totalFleet} χωρίς ληγμένο έγγραφο</span>
      </button>
      <button type="button" class="mnt-kpi" onclick="_expiryGoto('expired')">
        <span class="mnt-kpi-l">Ληγμένα έγγραφα</span>
        <span class="mnt-kpi-v ${expiredRows.length ? 'bad' : 'ok'}">${expiredRows.length}</span>
        <span class="mnt-kpi-s">${expiredRows.length ? `σε ${expiredVehicles} ${expiredVehicles === 1 ? 'όχημα' : 'οχήματα'} — άνοιγμα στις Λήξεις` : 'κανένα ληγμένο έγγραφο'}</span>
      </button>
      <button type="button" class="mnt-kpi" onclick="_expiryGoto('expiring30')">
        <span class="mnt-kpi-l">Λήγουν ≤30 ημ.</span>
        <span class="mnt-kpi-v ${expiring30Rows.length ? 'warn' : 'ok'}">${expiring30Rows.length}</span>
        <span class="mnt-kpi-s">${expiring30Rows.length ? 'έγγραφα — προγραμματισμός' : 'τίποτα δεν λήγει μέσα σε 30 ημέρες'}</span>
      </button>
      <div class="mnt-kpi">
        <span class="mnt-kpi-l">Ζημιές ${year}</span>
        <span class="mnt-kpi-v">${accidents.length}</span>
        <span class="mnt-kpi-s">${accidents.length
          ? `${accCost.n ? _fmtCost(accCost.sum) : '—'}${yearCost.sum > 0 && accCost.n ? ` = ${_pctOf(accCost.sum, yearCost.sum)}% της δαπάνης έτους (${_fmtCost(yearCost.sum)})` : ''}${accCost.missing ? ` · ${accCost.missing} χωρίς κόστος` : ''}`
          : 'καμία καταχωρημένη ζημιά / ατύχημα'}</span>
      </div>
      <div class="mnt-kpi">
        <span class="mnt-kpi-l">Δαπάνη ${year}</span>
        <span class="mnt-kpi-v">${yearCost.n ? _fmtCost(yearCost.sum) : '—'}</span>
        <span class="mnt-kpi-s">${yearCost.n ? `μ.ό. ${_fmtCost(yearCost.sum / monthsElapsed)} / μήνα (${monthsElapsed} μήνες)` : `καμία εργασία με κόστος το ${year}`}${yearCost.missing ? ` · ${yearCost.missing} χωρίς κόστος` : ''}</span>
      </div>
    </div>

    <div class="mnt-grid2">
      <div class="mnt-card">
        <span class="mnt-card-t">Μηνιαία δαπάνη συντήρησης — 6 μήνες</span>
        <span class="mnt-card-lead">${sixN ? `${_fmtCost(sixSum)} σύνολο · μ.ό. ${_fmtCost(sixSum / 6)}/μήνα` : 'καμία εργασία με κόστος τους τελευταίους 6 μήνες'}${sixMissing ? ` <span class="mnt-dim">· ${sixMissing} χωρίς κόστος</span>` : ''}</span>
        <div class="mnt-bars">
          ${months.map(m => `<div class="mnt-bar-col">
            <span class="v">${m.cost.n ? _fmtK(m.cost.sum) : '—'}</span>
            <i class="${peak && m.key === peak.key ? 'peak' : ''}" style="height:${maxMonth ? Math.max(2, Math.round(m.cost.sum / maxMonth * 135)) : 2}px"></i>
            <span>${m.label}</span>
          </div>`).join('')}
        </div>
        ${peakNote ? `<span class="mnt-note">${peakNote}</span>` : ''}
      </div>

      <div class="mnt-card">
        <span class="mnt-card-t">Λήξεις ανά όχημα — τα ${worst6.length} χειρότερα</span>
        ${worst6.length ? worst6.map(r => {
          const d = r.docs.filter(x => x.days !== null).sort((a, b) => a.days - b.days)[0];
          const due = _dueText(d.days);
          return `<div class="mnt-row click" style="height:32px" onclick="_expiryGoto(${d.days < 0 ? "'expired'" : "'all'"}, '', '${escapeHtml(r.plate)}')">
            <span class="w110">${escapeHtml(r.plate)}</span>
            <span class="w80">${EXPIRY_DOC_GR[d.label] || d.label}</span>
            <span class="${due.cls}" style="font-weight:700">${due.text}</span>
            <span class="grow"></span>
            <span class="mnt-link">άνοιγμα →</span>
          </div>`;
        }).join('') : `<span class="mnt-dim">Κανένα έγγραφο με ημερομηνία λήξης καταχωρημένη</span>`}
      </div>

      <div class="mnt-card">
        <span class="mnt-card-t">Πρόσφατα service</span>
        ${recent.length ? recent.map(r => { const f = r.fields; return `<div class="mnt-row click" onclick="_svcOpenCard('${r.id}')">
            <span class="w50 mnt-num">${_fmtDM(f['Date'])}</span>
            <span class="w100">${escapeHtml(f['Vehicle Plate'] || '—')}</span>
            <span class="grow">${escapeHtml(f['Description'] || MAINT_TYPE_LABEL[f['Type']] || '—')}</span>
            <span class="amt mnt-num">${_fmtCost(f['Cost'])}</span>
          </div>`; }).join('') : `<span class="mnt-dim">Καμία καταγραφή συντήρησης ακόμη</span>`}
        <button type="button" class="mnt-link" style="align-self:flex-start" onclick="navigate('maint_svc')">όλο το ιστορικό →</button>
      </div>

      <div class="mnt-card">
        <span class="mnt-card-t">Δαπάνη έτους ανά κατηγορία — top ${cats.length || 5}</span>
        ${cats.length ? cats.map(([t, cost]) => `<div style="display:flex;flex-direction:column;gap:4px;min-height:32px;justify-content:center">
            <div class="mnt-row" style="min-height:0"><span class="grow">${escapeHtml(MAINT_TYPE_LABEL[t] || t)}</span><span class="amt mnt-num">${_fmtCost(cost)}</span></div>
            <span class="mnt-bar"><i style="width:${maxCat ? Math.round(cost / maxCat * 100) : 0}%"></i></span>
          </div>`).join('') : `<span class="mnt-dim">Καμία εργασία το ${year}</span>`}
      </div>
    </div>`;
}

// ═════════════════════════════════════════════════════════════════
// PAGE: ΕΝΤΟΛΕΣ ΕΡΓΑΣΙΑΣ (w2-maint-requests-overview 158:585)
// ═════════════════════════════════════════════════════════════════
const MREQ = { data: [], _loaded: false, _expiryLoadFailed: false };
let _mreqTab = 'active';   // 'active' | 'sos' | 'urgent' | 'done' | 'all'
let _mreqSearch = '';

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
  document.getElementById('content').innerHTML = showLoading('Φόρτωση εντολών εργασίας…');
  try {
    await _mreqLoad();
    if (!MAINT._loaded) await _maintLoad();
    _mreqPaint();
  } catch(e) {
    document.getElementById('content').innerHTML = showError('Δεν φορτώθηκαν οι εντολές εργασίας');
    if (typeof logError === 'function') logError(e, 'maintenance requests load');
  }
}

// H8 fix: normalize Greek priority strings (NFC) to handle Unicode variants
const _normP = s => (s||'').normalize('NFC').trim();
function _mreqPrioHtml(p) {
  const n = _normP(p);
  if (n === 'SOS') return '<span class="mnt-bad" style="font-size:var(--text-sm);font-weight:700">SOS</span>';
  if (n === 'Άμεσα') return '<span class="mnt-warn" style="font-size:var(--text-sm);font-weight:700">ΆΜΕΣΑ</span>';
  return '<span class="mnt-mid" style="font-size:var(--text-sm);font-weight:700">ΚΑΝΟΝΙΚΟ</span>';
}

// Build auto-generated expiry work orders (≤14 days)
function _mreqExpiryAlerts() {
  const alerts = [];
  const check = (vehicles, fields, vType) => {
    for (const v of vehicles) {
      const f = v.fields;
      if (!f['Active']) continue;
      const plate = f['License Plate'] || '';
      for (const ef of _expiryFieldsFor(f, fields)) {
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
            desc: `${ef.label} ${days < 0 ? 'ληγμένο' : 'λήγει'} — ${Math.abs(days)} ημ. ${days < 0 ? 'πριν' : 'ακόμη'}`,
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

function _mreqSetSearch(v) {
  _mreqSearch = v.toLowerCase().trim();
  _mreqPaint();
  const el = document.getElementById('mreq-q');
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

function _mreqPaint() {
  // SH-2/MA-3 guard: μην ζωγραφίσεις αν ο χρήστης έχει ήδη φύγει.
  if (typeof currentPage !== 'undefined' && currentPage !== 'maint_req') return;
  _mntCloseDrawer();
  // H7 note: missing priority defaults to 'Κανονικό' (2) which is correct for sort
  const po = { 'SOS': 0, 'Άμεσα': 1, 'Κανονικό': 2 };
  const all = [...MREQ.data].sort((a,b) => {
    const pa = po[_normP(a.fields['Priority'])] ?? 2;
    const pb = po[_normP(b.fields['Priority'])] ?? 2;
    if (pa !== pb) return pa - pb;
    return (b.fields['Date Reported']||'').localeCompare(a.fields['Date Reported']||'');
  });

  const active = all.filter(r => r.fields['Status'] !== 'Done');
  const done = all.filter(r => r.fields['Status'] === 'Done');
  const sosList = active.filter(r => _normP(r.fields['Priority']) === 'SOS');
  const urgentList = active.filter(r => _normP(r.fields['Priority']) === 'Άμεσα');
  let filtered = _mreqTab === 'active' ? active : _mreqTab === 'done' ? done : _mreqTab === 'sos' ? sosList : _mreqTab === 'urgent' ? urgentList : all;
  if (_mreqSearch) {
    const q = _mreqSearch;
    filtered = filtered.filter(r => [r.fields['Vehicle Plate'], r.fields['Description'], r.fields['Notes'], r.fields['Workshop']]
      .some(v => String(v || '').toLowerCase().includes(q)));
  }
  const expiryAlerts = _mreqTab !== 'done' ? _mreqExpiryAlerts() : [];

  const pill = (id, label, count, sev) =>
    `<button type="button" class="mnt-pill ${sev || ''} ${_mreqTab === id ? 'active' : ''}" onclick="_mreqTab='${id}';_mreqPaint()"><b>${count}</b> ${label}</button>`;

  const rows = filtered.map(r => {
    const f = r.fields;
    const vt = _mntVehicleType(f['Vehicle Plate'], f['Vehicle Type']);
    const isSos = _normP(f['Priority']) === 'SOS' && f['Status'] !== 'Done';
    const status = MREQ_STATUS_LABEL[f['Status']] || f['Status'] || '—';
    return `<tr class="click ${isSos ? 'sos' : ''}" onclick="_mreqOpenForm('${r.id}')">
      <td>${_mreqPrioHtml(f['Priority'])}</td>
      <td><div class="mnt-cell2"><span class="mnt-main">${escapeHtml(f['Vehicle Plate'] || '—')}</span><span class="mnt-dim">${_mntTypeGr(vt) || 'εκτός ενεργού στόλου'}</span></div></td>
      <td><div class="mnt-cell2"><span>${escapeHtml(f['Description'] || '—')}</span>${f['Notes'] ? `<span class="mnt-dim">${escapeHtml(f['Notes'])}</span>` : ''}</div></td>
      <td class="mnt-mid">${f['Workshop'] ? escapeHtml(f['Workshop']) : '<span class="mnt-dim" style="font-size:var(--text-sm)">δεν έχει οριστεί</span>'}</td>
      <td class="mnt-mid mnt-num">${_fmtDMY(f['Date Reported'])}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;align-items:center;gap:var(--space-2)">
          <span style="font-weight:${f['Status'] === 'In Progress' ? 500 : 400}">${escapeHtml(status)}</span>
          ${f['Status'] !== 'Done' ? `<button type="button" class="btn btn-ghost btn-sm" title="Σήμανση ως ολοκληρωμένη" onclick="_mreqQuickStatus('${r.id}','Done')">✓ Ολοκληρώθηκε</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('content').innerHTML = `
    <div class="mnt-head">
      <span class="mnt-title">Εντολές Εργασίας</span>
      ${pill('active', 'ενεργές', active.length)}
      ${pill('sos', 'SOS', sosList.length, 'is-danger')}
      ${pill('urgent', 'άμεσα', urgentList.length, 'is-warning')}
      ${pill('done', 'ολοκληρωμένες', done.length, 'is-dim')}
      ${pill('all', 'όλες', all.length, 'is-dim')}
      <span class="mnt-spacer"></span>
      <input id="mreq-q" class="mnt-search" style="width:200px" placeholder="Αναζήτηση πινακίδας…" value="${escapeHtml(_mreqSearch)}" oninput="_mreqSetSearch(this.value)">
      <button type="button" class="btn btn-ghost btn-sm" onclick="navigate('maint_svc')" title="MS-2">Ιστορικό Service</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="_mreqOpenForm()">Νέα εντολή</button>
      ${_mntRefreshBtn("MREQ._loaded=false;renderMaintRequests()")}
    </div>

    <table class="mnt-table">
      <thead><tr>
        <th style="width:150px">ΠΡΟΤΕΡΑΙΟΤΗΤΑ</th><th style="width:170px">ΟΧΗΜΑ</th><th>ΠΕΡΙΓΡΑΦΗ</th><th style="width:200px">ΣΥΝΕΡΓΕΙΟ</th><th style="width:150px">ΑΝΑΦΕΡΘΗΚΕ</th><th style="width:250px">ΚΑΤΑΣΤΑΣΗ</th>
      </tr></thead>
      <tbody>${filtered.length ? rows : `<tr><td colspan="6" style="height:auto;padding:0">${showEmpty({
            illustration: 'truck',
            title: _mreqSearch ? 'Καμία εντολή για αυτή την αναζήτηση' : _mreqTab === 'done' ? 'Καμία ολοκληρωμένη εντολή ακόμη' : 'Καμία ενεργή εντολή εργασίας',
            description: _mreqSearch ? 'Δοκίμασε άλλη πινακίδα ή λέξη.' : _mreqTab === 'done' ? 'Οι ολοκληρωμένες συντηρήσεις θα εμφανίζονται εδώ.' : 'Δημιούργησε εντολή, ή δες τις λήξεις εγγράφων παρακάτω.',
            action: (_mreqTab !== 'done' && !_mreqSearch) ? { label: 'Νέα εντολή', onClick: '_mreqOpenForm()' } : null
          })}</td></tr>`}</tbody>
    </table>

    <!-- Αυτόματα από λήξεις. Συμπτυγμένα, όριο 10. Δεν είναι εντολές εργασίας —
         είναι η ίδια πληροφορία με τις Λήξεις Εγγράφων. Έδιναν 3.913px ύψος
         για 1 πραγματική εντολή, και 64 κουμπιά «Done» που έκλειναν κάτι που
         δεν άνοιξε ποτέ κανείς. maint_req.md MR-1/MR-3/MR-4/MR-6. -->
    ${expiryAlerts.length ? `<details>
      <summary class="mnt-band">
        <span>▸</span>
        <b>ΑΠΟ ΛΗΞΕΙΣ ΕΓΓΡΑΦΩΝ (${expiryAlerts.length})</b>
        <span>Δεν είναι εντολές εργασίας — προέρχονται από τα έγγραφα του στόλου</span>
        <span class="mnt-spacer"></span>
        <button type="button" class="mnt-link" style="font-size:var(--text-sm);font-weight:500" onclick="event.preventDefault();event.stopPropagation();_expiryGoto('expired')">Άνοιγμα στις Λήξεις Εγγράφων →</button>
      </summary>
      <table class="mnt-table">
        <thead><tr>
          <th style="width:170px">ΟΧΗΜΑ</th><th>ΕΓΓΡΑΦΟ</th><th style="width:140px">ΚΑΤΑΣΤΑΣΗ</th><th style="width:130px">ΗΜ. ΛΗΞΗΣ</th><th style="width:250px">ΕΝΕΡΓΕΙΕΣ</th>
        </tr></thead>
        <tbody>${expiryAlerts.slice(0, 10).map(ea => `<tr>
          <td><div class="mnt-cell2"><span class="mnt-main">${escapeHtml(ea.plate)}</span><span class="mnt-dim">${_mntTypeGr(ea.vType)}</span></div></td>
          <td>${EXPIRY_DOC_GR[ea.doc] || ea.doc} — <span class="${ea.days < 0 ? 'mnt-bad' : 'mnt-warn'}">${ea.days < 0 ? `ληγμένο ${Math.abs(ea.days)} ημ.` : `λήγει σε ${ea.days} ημ.`}</span></td>
          <td class="${ea.days < 0 ? 'mnt-bad' : 'mnt-warn'}" style="font-size:var(--text-sm)">${ea.days < 0 ? 'ΛΗΓΜΕΝΟ' : 'ΛΗΓΕΙ'}</td>
          <td class="mnt-num mnt-mid">${_fmtDMY(ea.date)}</td>
          <td><button type="button" class="btn btn-ghost btn-sm" title="Καταγράφει ολοκληρωμένη εντολή ανανέωσης" onclick="_mreqDismissExpiry('${ea.plate.replace(/'/g,"\\'")}','${ea.doc}','${ea.desc.replace(/'/g,"\\'")}')">✓ Ανανεώθηκε</button></td>
        </tr>`).join('')}</tbody>
      </table>
      ${expiryAlerts.length > 10 ? `<button type="button" class="mnt-link" style="display:block;width:100%;text-align:center;padding:10px 0" onclick="_expiryGoto('expired')">Δες και τα άλλα ${expiryAlerts.length - 10} στις Λήξεις Εγγράφων →</button>` : ''}
    </details>` : ''}`;
}

async function _mreqDismissExpiry(plate, docType, desc) {
  try {
    const fields = {
      'Vehicle Plate': plate,
      'Vehicle Type': _mntVehicleType(plate) || null,
      // Stable marker, read back by _expiryRenewals() («ΑΝΑΝΕΩΘΗΚΕ» column).
      'Description': docType + ' — Renewal',
      'Priority': 'SOS',
      'Status': 'Done',
      'Date Reported': localToday(),
      'Notes': desc,
    };
    const created = await atCreate(TABLES.MAINT_REQ, fields);
    MREQ.data.push(created);
    toast('Καταγράφηκε η ανανέωση ✓');
    _mreqPaint();
  } catch(e) { reportError('Σφάλμα δημιουργίας αιτήματος συντήρησης', e); }
}

async function _mreqQuickStatus(recId, newStatus) {
  try {
    await atSafePatch(TABLES.MAINT_REQ, recId, { Status: newStatus });
    const rec = MREQ.data.find(r => r.id === recId);
    if (rec) rec.fields['Status'] = newStatus;
    _mreqPaint();
  } catch(e) { reportError('Η αλλαγή κατάστασης απέτυχε', e); }
}

// ── Form (w2-maint-request-form 165:769) ─────────────────────────
function _mreqOpenForm(editId) {
  const rec = editId ? MREQ.data.find(r => r.id === editId) : null;
  const f = rec ? rec.fields : {};

  const allVehicles = [
    ...MAINT.trucks.filter(t=>t.fields['Active']).map(t => ({ plate: t.fields['License Plate']||'', type: 'Truck' })),
    ...MAINT.trailers.filter(t=>t.fields['Active']).map(t => ({ plate: t.fields['License Plate']||'', type: 'Trailer' })),
  ].filter(v => v.plate).sort((a, b) => a.plate.localeCompare(b.plate));
  const known = allVehicles.some(v => v.plate === f['Vehicle Plate']);
  const custom = !!(f['Vehicle Plate'] && !known);

  const field = (label, inner, extra) => `<div class="form-field"><label class="form-label">${label}</label>${inner}${extra || ''}</div>`;
  const prioLabel = { 'SOS': 'SOS', 'Άμεσα': 'Άμεσα', 'Κανονικό': 'Κανονικό' };

  _mntHost('mnt-modal-host').innerHTML = `
  <div class="mf-overlay" onclick="if(event.target===this)_mntCloseModal()">
    <div class="mf-modal" role="dialog" aria-modal="true">
      <div class="mf-head"><span>${editId ? 'Επεξεργασία Εντολής Εργασίας' : 'Νέα Εντολή Εργασίας'}</span>
        <button type="button" class="mnt-drawer-x" onclick="_mntCloseModal()" aria-label="Κλείσιμο">✕</button></div>
      <div class="mf-body">
        <div class="mf-row">
          ${field('Όχημα *', `<select class="form-select" id="mreq-plate" onchange="document.getElementById('mreq-plate-custom-wrap').style.display=this.value==='__custom'?'':'none'">
              <option value="">— Επιλογή —</option>
              ${allVehicles.map(v => `<option value="${escapeHtml(v.plate)}"${f['Vehicle Plate']===v.plate?' selected':''}>${escapeHtml(v.plate)} (${_mntTypeGr(v.type)})</option>`).join('')}
              <option value="__custom"${custom ? ' selected' : ''}>Άλλο όχημα (πληκτρολόγηση)</option>
            </select>`, `<div id="mreq-plate-custom-wrap" style="${custom ? '' : 'display:none'};margin-top:6px"><input class="form-input" id="mreq-plate-custom" value="${escapeHtml(custom ? f['Vehicle Plate'] : '')}" placeholder="π.χ. CB1286KE"></div><div class="ef-err" id="mreq-err-plate"></div>`)}
          ${field('Ημ. αναφοράς', `<input class="form-input" type="date" id="mreq-date" value="${f['Date Reported']?toLocalDate(f['Date Reported']):localToday()}">`)}
        </div>
        <div class="mf-row">
          ${field('Προτεραιότητα', `<select class="form-select" id="mreq-prio">${MREQ_PRIORITIES.map(p => `<option value="${p}"${_normP(f['Priority'])===p?' selected':''}>${prioLabel[p]}</option>`).join('')}</select>`)}
          ${field('Κατάσταση', `<select class="form-select" id="mreq-status">${MREQ_STATUSES.map(s => `<option value="${s}"${(f['Status']||'Pending')===s?' selected':''}>${MREQ_STATUS_LABEL[s]}</option>`).join('')}</select>`)}
        </div>
        ${field('Περιγραφή *', `<textarea class="form-textarea" id="mreq-desc" rows="2">${escapeHtml(f['Description']||'')}</textarea>`, '<div class="ef-err" id="mreq-err-desc"></div>')}
        <div class="mf-row">
          ${field('Συνεργείο', `<select class="form-select" id="mreq-workshop">
              <option value="">— Επιλογή —</option>
              ${MAINT.workshops.filter(w=>w.fields['Active']).map(w =>
                `<option value="${escapeHtml(w.fields['Name']||'')}"${f['Workshop']===w.fields['Name']?' selected':''}>${escapeHtml(w.fields['Name']||'?')}${w.fields['City']?' — '+escapeHtml(w.fields['City']):''}</option>`
              ).join('')}
              <option value="__other"${f['Workshop']&&!MAINT.workshops.find(w=>w.fields['Name']===f['Workshop'])?' selected':''}>Άλλο</option>
            </select>`)}
          ${field('Εκτ. Κόστος €', `<input class="form-input" type="number" id="mreq-cost" step="0.01" value="" placeholder="—" disabled>`,
            // The column estimated_cost exists; the Worker map does not carry it, so
            // a typed value would be dropped with a 200 OK (CLAUDE.md, facade trap #1).
            // Disabled + written reason + omitted from the payload, like contact_person
            // in wave 1 — never an input whose value quietly vanishes.
            '<div class="ef-hint">Δεν αποθηκεύεται ακόμη — εκκρεμεί ο χάρτης του Worker</div>')}
        </div>
        ${field('Σημειώσεις', `<textarea class="form-textarea" id="mreq-notes" rows="2">${escapeHtml(f['Notes']||'')}</textarea>`)}
      </div>
      <div class="mf-foot">
        <span class="mf-warn">Το Εκτ. Κόστος δεν αποθηκεύεται ακόμη — η στήλη υπάρχει, λείπει ο χάρτης του Worker</span>
        ${editId?`<button type="button" class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="_mreqDelete('${editId}')">Διαγραφή</button>`:''}
        <button type="button" class="btn btn-ghost btn-sm" onclick="_mntCloseModal()">Άκυρο</button>
        <button type="button" class="btn btn-primary btn-sm" onclick="_mreqSave('${editId||''}')">Αποθήκευση</button>
      </div>
    </div>
  </div>`;
}

async function _mreqSave(editId) {
  const setErr = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg || ''; };
  setErr('mreq-err-plate'); setErr('mreq-err-desc');
  const sel = document.getElementById('mreq-plate');
  const plate = sel.value === '__custom' || !sel.value
    ? document.getElementById('mreq-plate-custom').value.trim()
    : sel.value;
  if (!plate) { setErr('mreq-err-plate', 'Απαιτείται όχημα'); return; }
  const desc = document.getElementById('mreq-desc').value.trim();
  if (!desc) { setErr('mreq-err-desc', 'Απαιτείται περιγραφή'); return; }

  const wsVal = document.getElementById('mreq-workshop').value;
  const fields = {
    'Vehicle Plate': plate,
    'Vehicle Type': _mntVehicleType(plate) || null,
    'Description': desc,
    // H7 fix: ensure Priority always has a value — default 'Κανονικό'
    'Priority': document.getElementById('mreq-prio').value || 'Κανονικό',
    'Status': document.getElementById('mreq-status').value,
    'Date Reported': document.getElementById('mreq-date').value || null,
    'Workshop': wsVal === '__other' ? null : (wsVal || null),
    'Notes': document.getElementById('mreq-notes').value.trim() || null,
  };
  // 'Estimated Cost' is deliberately NOT sent — see the form field comment.

  try {
    if (editId) {
      await atSafePatch(TABLES.MAINT_REQ, editId, fields);
      const rec = MREQ.data.find(r => r.id === editId);
      if (rec) Object.assign(rec.fields, fields);
      toast('Η εντολή ενημερώθηκε ✓');
    } else {
      const created = await atCreate(TABLES.MAINT_REQ, fields);
      MREQ.data.push(created);
      toast('Η εντολή δημιουργήθηκε ✓');
    }
    _mntCloseModal();
    _mreqPaint();
  } catch(e) { reportError('Αποτυχία αποθήκευσης αιτήματος συντήρησης', e); }
}

async function _mreqDelete(recId) {
  if (!(await confirmAction('Διαγραφή αυτής της εντολής εργασίας;', { danger: true, confirmLabel: 'Διαγραφή' }))) return;
  try {
    await atSoftDelete(TABLES.MAINT_REQ, recId);
    MREQ.data = MREQ.data.filter(r => r.id !== recId);
    _mntCloseModal();
    _mreqPaint();
  } catch(e) { reportError('Αποτυχία διαγραφής αιτήματος συντήρησης', e); }
}
