// ═══════════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL — v8  FINAL REBUILD
// ───────────────────────────────────────────────────────────────────────────
//
// ARCHITECTURE
// ────────────
//  Data layer   : WINTL.data  — raw AT records (source of truth, never mutated)
//  State layer  : WINTL.rows  — derived trip rows (mutable working state)
//                 WINTL.shelf — unmatched import orders
//  UI layer     : WINTL.ui   — openRow, shelfFilter, shelfCollapsed
//
// ROW MODEL
// ─────────
//  Each row = 1 round trip (1..N exports + 0..1 import)
//  Saved rows   → have tripRecId, data from TRIPS table
//  Unsaved rows → no tripRecId, created from unassigned ORDERS
//
// DATA FETCHING (fixes blank-export bug)
// ───────────────────────────────────────
//  1. Fetch all ORDERS where Type=International AND Week=N
//  2. Fetch all TRIPS where Week=N
//  3. After building rows from trips, collect any exportIds not found in
//     data.exports and fetch those orders individually (cross-week edge case)
//
// LAYOUT (5 columns)
// ───────────────────
//  48px  | 1fr  | 40px | 200px  | 1fr
//   #    | EXP  |  ›   | ASGN   | IMP
//
// INTERACTIONS
// ─────────────
//  Click › column    → expand/collapse inline assignment panel
//  Drag shelf chip   → drop on IMP cell or panel drop zone
//  Right-click EXP   → context menu (group, split, delete)
//  Create/Update btn → write to TRIPS table
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

/* ─────────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────────── */
const WINTL = {
  week:      _wiCurrentWeek(),
  data: {
    exports:  [],   // ORDERS Direction=Export
    imports:  [],   // ORDERS Direction=Import
    trips:    [],   // TRIPS
    trucks:   [],   // { id, label }
    trailers: [],   // { id, label }
    drivers:  [],   // { id, label }
    partners: [],   // { id, label }
  },
  rows:  [],  // [ RowModel ]
  shelf: [],  // unmatched ORDERS Direction=Import
  ui: {
    openRow:       null,
    shelfFilter:   '',
    shelfCollapsed:false,
  },
  _seq:      0,
  _assetsOk: false,
};

/*
 * RowModel {
 *   id            : number   (local sequence, UI key)
 *   tripRecId     : string|null
 *   tripNo        : string
 *   exportIds     : string[]  (ORDERS record IDs)
 *   importId      : string|null
 *   truckId       : string
 *   trailerId     : string
 *   driverId      : string
 *   partnerId     : string
 *   truckPlate    : string  (display label)
 *   trailerPlate  : string
 *   driverName    : string
 *   partnerName   : string
 *   loadingDate   : string  (ISO)
 *   carrierType   : 'owned'|'partner'
 *   partnerRateExp: string
 *   partnerRateImp: string
 *   saved         : boolean
 * }
 */

/* ─────────────────────────────────────────────────────────────
   CSS INJECTION
───────────────────────────────────────────────────────────── */
(function injectCSS() {
  if (document.getElementById('wi8')) return;
  const el = document.createElement('style');
  el.id = 'wi8';
  el.textContent = `
/* ── wrapper ─────────────────────────────────────── */
.wi-wrap {
  border: 1px solid var(--border-mid);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-card);
}

/* ── sticky header ───────────────────────────────── */
.wi-head {
  display: grid;
  grid-template-columns: 48px 1fr 40px 200px 1fr;
  background: var(--bg);
  border-bottom: 2px solid var(--border-mid);
  position: sticky;
  top: 0;
  z-index: 20;
}
.wi-hc {
  padding: 9px 14px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--text-dim);
  border-right: 1px solid var(--border);
}
.wi-hc:last-child { border-right: none; }

/* ── date separator ──────────────────────────────── */
.wi-ds {
  padding: 5px 14px;
  background: var(--bg);
  border-top: 1.5px solid var(--border-mid);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.3px;
  text-transform: uppercase;
  color: var(--text-mid);
  display: flex;
  align-items: center;
  gap: 10px;
}
.wi-ds:first-child { border-top: none; }
.wi-ds-n { font-size: 9px; font-weight: 400; color: var(--text-dim); }

/* ── row ─────────────────────────────────────────── */
.wi-row {
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  position: relative;
}
.wi-row.hi .wi-compact { background: rgba(5,150,105,0.05) !important; }

/* left-border status strip */
.wi-row::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: transparent;
  transition: background 0.15s;
}
.wi-row.saved::before   { background: var(--success); }
.wi-row.partner::before { background: rgba(59,130,246,0.6); }
.wi-row.unsaved::before { background: var(--warning); }

/* ── compact bar (5 cols) ────────────────────────── */
.wi-compact {
  display: grid;
  grid-template-columns: 48px 1fr 40px 200px 1fr;
  min-height: 50px;
  align-items: stretch;
  transition: background 0.07s;
}
.wi-row:hover .wi-compact { background: rgba(0,0,0,0.008); }

/* col: number + dot */
.wi-cn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-right: 1px solid var(--border);
  padding: 4px 0;
}
.wi-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.wi-num { font-size: 9px; color: var(--text-dim); }

/* col: export */
.wi-ce {
  padding: 8px 14px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 3px;
  justify-content: center;
  overflow: hidden;
}
.wi-route {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}
.wi-route .sep  { color: var(--text-dim); margin: 0 6px; font-weight: 300; }
.wi-route .dest { color: var(--text-mid); font-weight: 400; }
.wi-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.wi-mi   { font-size: 10.5px; color: var(--text-dim); }
.wi-b {
  display: inline-block;
  font-size: 7.5px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 3px;
  vertical-align: middle;
}
.wi-b-vx {
  background: rgba(99,102,241,0.1);
  color: rgba(99,102,241,0.85);
  border: 1px solid rgba(99,102,241,0.18);
}
.wi-b-gr {
  background: rgba(14,165,233,0.1);
  color: rgba(14,165,233,0.85);
  border: 1px solid rgba(14,165,233,0.18);
}

/* col: chevron toggle */
.wi-chev {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-right: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 14px;
  user-select: none;
  transition: color 0.12s, background 0.1s;
}
.wi-chev:hover { color: var(--text); background: rgba(0,0,0,0.04); }
.wi-chev.open  { color: var(--text); transform: rotate(90deg); }

/* col: assignment badge */
.wi-ca {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-right: 1px solid var(--border);
  background: var(--bg);
}

/* pills */
.wi-pill {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  border-radius: 20px;
  padding: 5px 14px;
  max-width: 186px;
  overflow: hidden;
}
.wi-pill-ok {
  background: var(--success-bg);
  border: 1px solid rgba(5,150,105,0.22);
  color: rgba(5,150,105,0.95);
}
.wi-pill-partner {
  background: rgba(59,130,246,0.08);
  border: 1px solid rgba(59,130,246,0.22);
  color: rgba(59,130,246,0.9);
}
.wi-pill-empty {
  background: var(--warning-bg);
  border: 1px solid rgba(217,119,6,0.22);
  color: rgba(217,119,6,0.9);
}
.wi-pill-top {
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}
.wi-pill-sub { font-size: 9.5px; opacity: 0.72; letter-spacing: 0.2px; }

/* col: import */
.wi-ci {
  padding: 8px 14px;
  display: flex;
  align-items: center;
  transition: background 0.1s;
}
.wi-ci.dh { background: rgba(217,119,6,0.05); }
.wi-ci-data {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  overflow: hidden;
}
.wi-ci-name {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wi-ci-dest {
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wi-ci-meta { font-size: 10px; color: var(--text-dim); }
.wi-ci-empty {
  font-size: 10.5px;
  color: var(--border-dark);
  font-style: italic;
  letter-spacing: 0.2px;
}

/* ── EXPAND PANEL ─────────────────────────────────── */
.wi-panel {
  grid-column: 1 / -1;
  border-top: 1px solid var(--border);
  background: var(--bg);
  padding: 12px 16px 14px 62px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.wi-pcols {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
}
.wi-pfield { display: flex; flex-direction: column; gap: 3px; }
.wi-plbl {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.wi-ptoggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-mid);
  cursor: pointer;
  user-select: none;
  padding-bottom: 2px;
}
.wi-ptoggle input { cursor: pointer; accent-color: var(--text); }

/* searchable dropdown */
.wi-sd { position: relative; }
.wi-sdi {
  width: 176px;
  padding: 6px 9px;
  font-size: 11px;
  border-radius: 5px;
  border: 1px solid var(--border-mid);
  background: var(--bg-card);
  color: var(--text);
  outline: none;
}
.wi-sdi:focus {
  border-color: rgba(11,25,41,0.3);
  box-shadow: 0 0 0 2px rgba(11,25,41,0.06);
}
.wi-sdl {
  display: none;
  position: fixed;
  z-index: 9999;
  min-width: 195px;
  max-height: 200px;
  overflow-y: auto;
  background: var(--bg-card);
  border: 1px solid var(--border-mid);
  border-radius: 6px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.12);
}
.wi-sdo {
  padding: 6px 11px;
  font-size: 11px;
  cursor: pointer;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wi-sdo:hover { background: var(--bg-hover); }

/* rate */
.wi-rate {
  width: 88px;
  padding: 6px 9px;
  font-size: 11px;
  border-radius: 5px;
  border: 1px solid var(--border-mid);
  background: var(--bg-card);
  color: var(--text);
  outline: none;
}
.wi-rate:focus { border-color: rgba(11,25,41,0.3); }

/* import drop zone */
.wi-piz {
  min-height: 58px;
  border: 1.5px dashed var(--border-mid);
  border-radius: 7px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  transition: background 0.1s, border-color 0.1s;
}
.wi-piz.dh {
  background: rgba(217,119,6,0.06);
  border-color: rgba(217,119,6,0.4);
}
.wi-imp-chip {
  width: 100%;
  background: rgba(217,119,6,0.07);
  border: 1px solid rgba(217,119,6,0.2);
  border-radius: 6px;
  padding: 7px 30px 7px 11px;
  position: relative;
  cursor: grab;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wi-imp-chip:active { cursor: grabbing; }
.wi-imp-rm {
  position: absolute;
  top: 7px;
  right: 9px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-dim);
  opacity: 0.5;
  line-height: 1;
}
.wi-imp-rm:hover { opacity: 1; color: var(--danger); }
.wi-imp-empty {
  font-size: 11px;
  color: var(--border-dark);
  font-style: italic;
}

/* action buttons */
.wi-btn {
  padding: 7px 20px;
  font-size: 11px;
  font-weight: 600;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  background: var(--text);
  color: #fff;
  transition: opacity 0.1s;
  white-space: nowrap;
}
.wi-btn:hover { opacity: 0.85; }
.wi-btn:disabled { opacity: 0.4; cursor: default; }
.wi-btn-ghost {
  padding: 6px 16px;
  font-size: 10.5px;
  border: 1px solid var(--border-mid);
  border-radius: 5px;
  cursor: pointer;
  background: none;
  color: var(--text-mid);
  white-space: nowrap;
}
.wi-btn-ghost:hover { background: var(--bg-hover); }
.wi-btn-del {
  padding: 6px 16px;
  font-size: 10.5px;
  border: 1px solid rgba(220,38,38,0.25);
  border-radius: 5px;
  cursor: pointer;
  background: none;
  color: var(--danger);
}
.wi-btn-del:hover { background: var(--danger-bg); }

/* ── IMPORT SHELF ─────────────────────────────────── */
.wi-shelf-wrap {
  background: var(--bg-card);
  border: 1px solid rgba(217,119,6,0.22);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 12px;
}
.wi-shelf-hdr {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
  user-select: none;
}
.wi-shelf-hdr:hover { background: var(--bg-hover); }
.wi-shelf-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--warning);
}
.wi-shelf-badge {
  background: rgba(217,119,6,0.12);
  color: var(--warning);
  font-size: 10px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 10px;
}
.wi-shelf-body { padding: 10px 14px 12px; }
.wi-shelf-chips { display: flex; flex-wrap: wrap; gap: 10px; }
.wi-chip {
  background: rgba(217,119,6,0.07);
  border: 1px solid rgba(217,119,6,0.2);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: grab;
  min-width: 148px;
  max-width: 210px;
  transition: box-shadow 0.12s, transform 0.1s;
}
.wi-chip:hover {
  box-shadow: 0 3px 10px rgba(0,0,0,0.09);
  transform: translateY(-1px);
}
.wi-chip:active { cursor: grabbing; }
.wi-chip-name {
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wi-chip-dest  { font-size: 10.5px; color: var(--text-dim); margin-top: 1px; }
.wi-chip-meta  { font-size: 10px; color: var(--text-dim); margin-top: 2px; }

/* ── CONTEXT MENU ─────────────────────────────────── */
#wi-ctx {
  display: none;
  position: fixed;
  z-index: 9999;
  background: var(--bg-card);
  border: 1px solid var(--border-mid);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.12);
  min-width: 210px;
  padding: 5px 0;
}
.wi-ctx-btn {
  display: block;
  width: 100%;
  padding: 7px 14px;
  text-align: left;
  font-size: 12px;
  cursor: pointer;
  color: var(--text);
  background: none;
  border: none;
  transition: background 0.08s;
}
.wi-ctx-btn:hover { background: var(--bg-hover); }
.wi-ctx-btn.danger { color: var(--danger); }
.wi-ctx-sep { height: 1px; background: var(--border); margin: 4px 0; }
.wi-ctx-hdr {
  padding: 4px 14px 2px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-dim);
}
`;
  document.head.appendChild(el);
})();

/* ─────────────────────────────────────────────────────────────
   WEEK UTILS
───────────────────────────────────────────────────────────── */
function _wiCurrentWeek() {
  const d = new Date(), y = d.getFullYear(), j = new Date(y, 0, 1);
  return Math.ceil(((d - j) / 86400000 + j.getDay() + 1) / 7);
}
function _wiWeekRange(w) {
  const y = new Date().getFullYear(), j = new Date(y, 0, 1);
  const base = new Date(j.getTime() + (w - 1) * 7 * 86400000);
  const day = base.getDay();
  const mon = new Date(base); mon.setDate(base.getDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const f = d => d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
  return `${f(mon)} – ${f(sun)}`;
}
function _wiFmt(s) {
  if (!s) return '—';
  try { const p = s.split('T')[0].split('-'); return `${p[2]}/${p[1]}`; }
  catch { return s; }
}
function _wiFmtFull(s) {
  if (!s) return null;
  try { return new Date(s).toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'long' }); }
  catch { return s; }
}
function _wiClean(s) {
  return (s || '').replace(/^['"\s/]+/, '').replace(/['"\s/]+$/, '').trim();
}
function _wiFv(v) {
  // First value from Airtable lookup array or direct value
  if (Array.isArray(v)) return v[0] || '';
  return v || '';
}

/* ─────────────────────────────────────────────────────────────
   LOAD ASSETS (trucks / trailers / drivers / partners)
───────────────────────────────────────────────────────────── */
async function _wiLoadAssets() {
  if (WINTL._assetsOk) return;
  const [t, tl, d, p] = await Promise.all([
    atGetAll(TABLES.TRUCKS,   { fields: ['License Plate'], filterByFormula: '{Active}=TRUE()' }),
    atGetAll(TABLES.TRAILERS, { fields: ['License Plate'] }),
    atGetAll(TABLES.DRIVERS,  { fields: ['Full Name'],     filterByFormula: '{Active}=TRUE()' }),
    atGetAll(TABLES.PARTNERS, { fields: ['Company Name'] }),
  ]);
  WINTL.data.trucks   = t.map(r  => ({ id: r.id, label: r.fields['License Plate'] || r.id }));
  WINTL.data.trailers = tl.map(r => ({ id: r.id, label: r.fields['License Plate'] || r.id }));
  WINTL.data.drivers  = d.map(r  => ({ id: r.id, label: r.fields['Full Name']     || r.id }));
  WINTL.data.partners = p.map(r  => ({ id: r.id, label: r.fields['Company Name']  || r.id }));
  WINTL._assetsOk = true;
}

/* ─────────────────────────────────────────────────────────────
   MAIN ENTRY
───────────────────────────────────────────────────────────── */
async function renderWeeklyIntl() {
  if (can('planning') === 'none') {
    document.getElementById('content').innerHTML = showAccessDenied();
    return;
  }

  document.getElementById('topbarTitle').textContent = `Weekly International — Week ${WINTL.week}`;
  document.getElementById('content').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;
                gap:10px;height:160px;color:var(--text-dim);font-size:13px">
      <div class="spinner"></div> Loading week ${WINTL.week}…
    </div>`;

  try {
    await _wiLoadAssets();

    // ── 1. Fetch orders + trips in parallel ──────────────
    const [allOrders, allTrips] = await Promise.all([
      atGetAll(TABLES.ORDERS, {
        filterByFormula: `AND({Type}='International',{Week Number}=${WINTL.week})`,
      }),
      atGetAll(TABLES.TRIPS, {
        filterByFormula: `{Week Number}=${WINTL.week}`,
        fields: [
          'Export Order', 'Import Order',
          'Truck', 'Trailer', 'Driver', 'Partner',
          'Truck Plate', 'Trailer Plate', 'Driver Name', 'Partner Name',
          'Export Loading DateTime',
          'Week Number', 'TripID',
          'Is Partner Trip', 'Partner Rate Export', 'Partner Rate Import',
        ],
      }),
    ]);

    WINTL.data.exports = allOrders.filter(r => r.fields.Direction === 'Export')
      .sort((a, b) => (a.fields['Loading DateTime'] || '').localeCompare(b.fields['Loading DateTime'] || ''));
    WINTL.data.imports = allOrders.filter(r => r.fields.Direction === 'Import');
    WINTL.data.trips   = allTrips;

    // ── 2. Build rows + detect missing exports ───────────
    _wiBuildRows();

    // ── 3. Fetch any export orders not in this week's pull
    //       (edge case: trip created against order from adj week)
    await _wiFetchMissingExports();

    _wiPaint();

  } catch (err) {
    document.getElementById('content').innerHTML = `
      <div class="empty-state">
        <div class="icon">⚠️</div>
        <p style="color:var(--danger)">${err.message}</p>
        <button class="btn btn-ghost" onclick="renderWeeklyIntl()" style="margin-top:12px">↺ Retry</button>
      </div>`;
  }
}

/* ─────────────────────────────────────────────────────────────
   BUILD ROWS
───────────────────────────────────────────────────────────── */
function _wiBuildRows() {
  WINTL.rows = [];
  WINTL._seq = 0;
  const usedExp = new Set();
  const usedImp = new Set();
  const { exports, imports, trips } = WINTL.data;

  // ── rows from saved TRIPS ────────────────────────────
  for (const trip of trips) {
    const f = trip.fields;
    const expIds  = f['Export Order'] || [];
    const impId   = (f['Import Order'] || [])[0] || null;
    expIds.forEach(id => usedExp.add(id));
    if (impId) usedImp.add(impId);

    const isPartner = !!(f['Is Partner Trip'] || (f['Partner'] || []).length);

    WINTL.rows.push({
      id:           ++WINTL._seq,
      tripRecId:    trip.id,
      tripNo:       f['TripID'] ? String(f['TripID']) : '',
      exportIds:    expIds,
      importId:     impId,
      truckId:      _wiFv(f['Truck']),
      trailerId:    _wiFv(f['Trailer']),
      driverId:     _wiFv(f['Driver']),
      partnerId:    _wiFv(f['Partner']),
      truckPlate:   _wiFv(f['Truck Plate']),
      trailerPlate: _wiFv(f['Trailer Plate']),
      driverName:   _wiFv(f['Driver Name']),
      partnerName:  _wiFv(f['Partner Name']),
      loadingDate:  _wiFv(f['Export Loading DateTime']),
      carrierType:  isPartner ? 'partner' : 'owned',
      partnerRateExp: f['Partner Rate Export'] ? String(f['Partner Rate Export']) : '',
      partnerRateImp: f['Partner Rate Import'] ? String(f['Partner Rate Import']) : '',
      saved: true,
    });
  }

  // ── rows from unassigned ORDERS ──────────────────────
  for (const exp of exports.filter(r => !usedExp.has(r.id))) {
    WINTL.rows.push({
      id:           ++WINTL._seq,
      tripRecId:    null,
      tripNo:       '',
      exportIds:    [exp.id],
      importId:     null,
      truckId:      '',
      trailerId:    '',
      driverId:     '',
      partnerId:    '',
      truckPlate:   '',
      trailerPlate: '',
      driverName:   '',
      partnerName:  '',
      loadingDate:  exp.fields['Loading DateTime'] || '',
      carrierType:  'owned',
      partnerRateExp: '',
      partnerRateImp: '',
      saved: false,
    });
  }

  WINTL.shelf = imports.filter(r => !usedImp.has(r.id));
}

/* ─────────────────────────────────────────────────────────────
   FETCH MISSING EXPORT ORDERS
   (saved trips may reference orders from a different week)
───────────────────────────────────────────────────────────── */
async function _wiFetchMissingExports() {
  const known = new Set(WINTL.data.exports.map(r => r.id));
  const missing = [];
  for (const row of WINTL.rows) {
    for (const id of row.exportIds) {
      if (!known.has(id)) missing.push(id);
    }
  }
  if (!missing.length) return;

  // Fetch in batches of 10 via OR formula
  const batches = [];
  for (let i = 0; i < missing.length; i += 8) batches.push(missing.slice(i, i + 8));

  for (const batch of batches) {
    const formula = `OR(${batch.map(id => `RECORD_ID()='${id}'`).join(',')})`;
    try {
      const records = await atGetAll(TABLES.ORDERS, { filterByFormula: formula });
      records.forEach(r => {
        if (!known.has(r.id)) {
          WINTL.data.exports.push(r);
          known.add(r.id);
        }
      });
    } catch (_) { /* silent — we'll show partial data */ }
  }
}

/* ─────────────────────────────────────────────────────────────
   PAINT — FULL RENDER
───────────────────────────────────────────────────────────── */
function _wiPaint() {
  const { rows, shelf, week, data, ui } = WINTL;
  const expN      = data.exports.length;
  const impN      = data.imports.length;
  const onTrip    = rows.filter(r => r.saved).length;
  const pending   = rows.filter(r => !r.saved).length;
  const unmatched = shelf.length;

  document.getElementById('content').innerHTML = `

    <!-- PAGE HEADER -->
    <div class="page-header" style="margin-bottom:12px">
      <div>
        <div class="page-title">Weekly International</div>
        <div class="page-sub" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:4px;font-size:12px">
          <span>Week ${week} · ${_wiWeekRange(week)}</span>
          <span style="color:var(--success)">↑ ${expN} exports</span>
          <span style="color:var(--warning)">↓ ${impN} imports</span>
          <span style="color:var(--text-dim)">${onTrip} on trip · ${pending} pending</span>
          ${unmatched
            ? `<span style="color:var(--warning);font-weight:600">${unmatched} imports unmatched</span>`
            : `<span style="color:var(--success)">all imports matched ✓</span>`}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost" style="padding:5px 18px" onclick="_wiNavWeek(-1)">← Prev</button>
        <span style="font-family:'Syne',sans-serif;font-size:14px;font-weight:700;
                     min-width:62px;text-align:center">Week ${week}</span>
        <button class="btn btn-ghost" style="padding:5px 18px" onclick="_wiNavWeek(1)">Next →</button>
        <button class="btn btn-ghost" style="padding:5px 10px" onclick="renderWeeklyIntl()" title="Refresh">↺</button>
      </div>
    </div>

    <!-- IMPORT SHELF -->
    ${unmatched ? _wiShelfWrapHTML() : ''}

    <!-- TRIPS TABLE -->
    <div class="wi-wrap">
      <div class="wi-head">
        <div class="wi-hc" style="text-align:center">#</div>
        <div class="wi-hc" style="color:var(--success)">
          ↑ Export (${expN})
          <span style="font-size:9px;font-weight:400;text-transform:none;
                       letter-spacing:0;color:var(--text-dim);margin-left:8px">right-click to group</span>
        </div>
        <div class="wi-hc" style="text-align:center;padding:0"></div>
        <div class="wi-hc" style="text-align:center">Assignment</div>
        <div class="wi-hc" style="color:var(--warning)">
          ↓ Import
          <span style="font-size:9px;font-weight:400;text-transform:none;
                       letter-spacing:0;color:var(--text-dim);margin-left:8px">drag from shelf</span>
        </div>
      </div>

      <div id="wi-rows">
        ${rows.length ? _wiAllRowsHTML() : `
          <div class="empty-state" style="padding:60px">
            <p>No international exports for week ${week}</p>
          </div>`}
      </div>
    </div>

    <div id="wi-ctx"></div>
  `;

  window._wiDragging = null;
}

/* ─────────────────────────────────────────────────────────────
   SHELF
───────────────────────────────────────────────────────────── */
function _wiShelfWrapHTML() {
  const { ui, shelf } = WINTL;
  return `
  <div class="wi-shelf-wrap">
    <div class="wi-shelf-hdr" onclick="_wiToggleShelf()">
      <span class="wi-shelf-title">↓ Import Shelf</span>
      <span class="wi-shelf-badge">${shelf.length}</span>
      ${shelf.length > 5 ? `
      <input type="text" placeholder="search…" value="${ui.shelfFilter}"
             oninput="WINTL.ui.shelfFilter=this.value;_wiPaintShelf()"
             onclick="event.stopPropagation()"
             style="padding:4px 9px;font-size:11px;border-radius:5px;
                    border:1px solid var(--border-mid);background:var(--bg);
                    color:var(--text);width:150px;outline:none"/>` : ''}
      <span style="margin-left:auto;font-size:12px;color:var(--text-dim)">
        ${ui.shelfCollapsed ? '▸' : '▾'}
      </span>
    </div>
    <div id="wi-shelf" style="display:${ui.shelfCollapsed ? 'none' : 'block'}">
      <div class="wi-shelf-body">
        ${_wiShelfHTML()}
      </div>
    </div>
  </div>`;
}

function _wiShelfHTML() {
  const { shelf, ui } = WINTL;
  if (!shelf.length) return `<div style="font-size:12px;color:var(--text-dim)">No unmatched imports</div>`;
  const sf  = ui.shelfFilter.toLowerCase();
  const vis = sf
    ? shelf.filter(r => ((r.fields['Loading Summary'] || '') + (r.fields['Delivery Summary'] || '')).toLowerCase().includes(sf))
    : shelf;
  return `<div class="wi-shelf-chips">${vis.map(_wiChipHTML).join('')}</div>`;
}

function _wiChipHTML(r) {
  const f     = r.fields;
  const name  = _wiClean(f['Loading Summary']  || '—').slice(0, 26);
  const dest  = _wiClean(f['Delivery Summary'] || '—').slice(0, 24);
  const pals  = f['Total Pallets'] || 0;
  const del   = _wiFmt(f['Delivery DateTime']);
  return `
  <div class="wi-chip" draggable="true" data-impid="${r.id}"
       ondragstart="_wiDragStart(event,'${r.id}')">
    <div class="wi-chip-name">${name}</div>
    <div class="wi-chip-dest">→ ${dest}</div>
    <div class="wi-chip-meta">${del} · ${pals} pal</div>
  </div>`;
}

function _wiToggleShelf() {
  WINTL.ui.shelfCollapsed = !WINTL.ui.shelfCollapsed;
  const el = document.getElementById('wi-shelf');
  if (el) el.style.display = WINTL.ui.shelfCollapsed ? 'none' : 'block';
}
function _wiPaintShelf() {
  const el = document.getElementById('wi-shelf');
  if (el) el.querySelector('.wi-shelf-body').innerHTML = _wiShelfHTML();
}

/* ─────────────────────────────────────────────────────────────
   ALL ROWS + DATE SEPARATORS
───────────────────────────────────────────────────────────── */
function _wiAllRowsHTML() {
  let html = '', lastDate = null;

  // Count orders per date for separator label
  const dateCounts = {};
  WINTL.rows.forEach(row => {
    const label = _wiRowDateLabel(row);
    if (label) dateCounts[label] = (dateCounts[label] || 0) + 1;
  });

  WINTL.rows.forEach((row, i) => {
    const label = _wiRowDateLabel(row);
    if (label && label !== lastDate) {
      lastDate = label;
      html += `<div class="wi-ds">
        ${label}
        <span class="wi-ds-n">${dateCounts[label]} order${dateCounts[label] !== 1 ? 's' : ''}</span>
      </div>`;
    }
    html += _wiRowHTML(row, i);
  });
  return html;
}

function _wiRowDateLabel(row) {
  const rawDate = row.loadingDate
    || WINTL.data.exports.find(r => r.id === row.exportIds[0])?.fields['Loading DateTime']
    || null;
  return rawDate ? _wiFmtFull(rawDate) : null;
}

/* ─────────────────────────────────────────────────────────────
   SINGLE ROW HTML
───────────────────────────────────────────────────────────── */
function _wiRowHTML(row, i) {
  const { data, ui } = WINTL;
  const exps    = row.exportIds.map(id => data.exports.find(r => r.id === id)).filter(Boolean);
  const imp     = row.importId ? data.imports.find(r => r.id === row.importId) : null;
  const isOpen  = ui.openRow === row.id;
  const isGroup = exps.length > 1;
  const primary = exps[0];

  // row status class + dot color
  let rowCls, dotColor;
  if (row.saved) {
    rowCls   = row.carrierType === 'partner' ? 'saved partner' : 'saved';
    dotColor = row.carrierType === 'partner' ? 'rgba(59,130,246,0.75)' : 'var(--success)';
  } else {
    rowCls   = 'unsaved';
    dotColor = 'rgba(217,119,6,0.8)';
  }

  /* ── EXPORT ── */
  const fromStr = primary ? _wiClean(primary.fields['Loading Summary']  || '—') : '—';
  const toStr   = primary ? _wiClean(primary.fields['Delivery Summary'] || '—') : '—';
  const pals    = isGroup
    ? exps.reduce((s, r) => s + (r.fields['Total Pallets'] || 0), 0)
    : (primary?.fields['Total Pallets'] || 0);
  const temp    = primary?.fields['Temperature °C'] || primary?.fields['Temperature'] || '';
  const veroia  = primary?.fields['Veroia Switch '] || primary?.fields['Veroia Switch'];
  const loadDt  = _wiFmt(primary?.fields['Loading DateTime']);

  const exportCell = `
    <div class="wi-ce" oncontextmenu="_wiCtx(event,${row.id})">
      <div class="wi-route">
        <b>${fromStr}</b><span class="sep">→</span><span class="dest">${toStr}</span>
        ${isGroup  ? `<span class="wi-b wi-b-gr">GROUPAGE ×${exps.length}</span>` : ''}
        ${veroia   ? `<span class="wi-b wi-b-vx">VEROIA</span>` : ''}
      </div>
      <div class="wi-meta">
        ${pals    ? `<span class="wi-mi">📦 ${pals}</span>` : ''}
        ${temp    ? `<span class="wi-mi">🌡 ${temp}°C</span>` : ''}
        ${loadDt !== '—' ? `<span class="wi-mi">${loadDt}</span>` : ''}
      </div>
    </div>`;

  /* ── ASSIGNMENT BADGE ── */
  const plate   = row.truckPlate   || data.trucks.find(t => t.id === row.truckId)?.label   || '';
  const driver  = row.driverName   || data.drivers.find(d => d.id === row.driverId)?.label  || '';
  const partner = row.partnerName  || data.partners.find(p => p.id === row.partnerId)?.label || '';
  const surname = driver ? driver.trim().split(/\s+/).pop() : '';

  let badge;
  if (row.saved) {
    if (row.carrierType === 'partner') {
      badge = `<div class="wi-pill wi-pill-partner" title="${partner}">
        <span class="wi-pill-top">🤝 ${partner.slice(0, 22)}${partner.length > 22 ? '…' : ''}</span>
        ${row.tripNo ? `<span class="wi-pill-sub">#${row.tripNo}</span>` : ''}
      </div>`;
    } else {
      badge = `<div class="wi-pill wi-pill-ok">
        <span class="wi-pill-top">${plate || '—'}</span>
        <span class="wi-pill-sub">${surname ? surname + ' ' : ''}${row.tripNo ? '· #' + row.tripNo : ''}</span>
      </div>`;
    }
  } else {
    badge = `<div class="wi-pill wi-pill-empty">
      <span class="wi-pill-top">Unassigned</span>
    </div>`;
  }

  /* ── IMPORT (compact preview) ── */
  const impPreview = imp
    ? `<div class="wi-ci-data">
        <span class="wi-ci-name">${_wiClean(imp.fields['Delivery Summary'] || '—').slice(0, 40)}</span>
        <span class="wi-ci-dest">→ ${_wiClean(imp.fields['Loading Summary'] || '—').slice(0, 32)}</span>
        <span class="wi-ci-meta">📦 ${imp.fields['Total Pallets'] || 0} · del ${_wiFmt(imp.fields['Delivery DateTime'])}</span>
      </div>`
    : `<span class="wi-ci-empty">drag import here</span>`;

  return `
  <div id="wi-row-${row.id}" class="wi-row ${rowCls}">
    <div class="wi-compact">
      <div class="wi-cn">
        <div class="wi-dot" style="background:${dotColor}"></div>
        <span class="wi-num">${i + 1}</span>
      </div>
      ${exportCell}
      <div class="wi-chev${isOpen ? ' open' : ''}" onclick="_wiToggle(${row.id})">›</div>
      <div class="wi-ca">${badge}</div>
      <div class="wi-ci" id="wi-ci-${row.id}"
           ondragover="event.preventDefault();document.getElementById('wi-ci-${row.id}').classList.add('dh')"
           ondragleave="document.getElementById('wi-ci-${row.id}').classList.remove('dh')"
           ondrop="_wiDropCompact(event,${row.id})">
        ${impPreview}
      </div>
    </div>
    ${isOpen ? _wiPanelHTML(row) : ''}
  </div>`;
}

/* ─────────────────────────────────────────────────────────────
   INLINE PANEL
───────────────────────────────────────────────────────────── */
function _wiPanelHTML(row) {
  const { trucks, trailers, drivers, partners } = WINTL.data;
  const isPartner = row.carrierType === 'partner';
  const canFull   = can('planning') === 'full';
  const imp = row.importId ? WINTL.data.imports.find(r => r.id === row.importId) : null;

  const toggle = `
    <div class="wi-pfield" style="justify-content:flex-end">
      <label class="wi-ptoggle" onclick="event.stopPropagation()">
        <input type="checkbox" ${isPartner ? 'checked' : ''}
               onchange="_wiSetCarrier(${row.id},this.checked?'partner':'owned')"/>
        Partner trip
      </label>
    </div>`;

  let fields = '';
  if (!isPartner) {
    fields = `
      <div class="wi-pfield" onclick="event.stopPropagation()">
        <span class="wi-plbl">Truck</span>
        ${_wiSdrop('tk', row.id, trucks,   row.truckId,   row.truckPlate   || 'Plate…')}
      </div>
      <div class="wi-pfield" onclick="event.stopPropagation()">
        <span class="wi-plbl">Trailer</span>
        ${_wiSdrop('tl', row.id, trailers, row.trailerId, row.trailerPlate || 'Plate…')}
      </div>
      <div class="wi-pfield" onclick="event.stopPropagation()">
        <span class="wi-plbl">Driver</span>
        ${_wiSdrop('dr', row.id, drivers,  row.driverId,  row.driverName   || 'Name…')}
      </div>`;
  } else {
    fields = `
      <div class="wi-pfield" onclick="event.stopPropagation()">
        <span class="wi-plbl">Partner</span>
        ${_wiSdrop('pt', row.id, partners, row.partnerId, row.partnerName  || 'Company…')}
      </div>
      <div class="wi-pfield" onclick="event.stopPropagation()">
        <span class="wi-plbl">Rate Exp €</span>
        <input class="wi-rate" type="number" placeholder="0.00" value="${row.partnerRateExp || ''}"
               oninput="_wiField(${row.id},'partnerRateExp',this.value)"
               onclick="event.stopPropagation()"/>
      </div>
      <div class="wi-pfield" onclick="event.stopPropagation()">
        <span class="wi-plbl">Rate Imp €</span>
        <input class="wi-rate" type="number" placeholder="0.00" value="${row.partnerRateImp || ''}"
               oninput="_wiField(${row.id},'partnerRateImp',this.value)"
               onclick="event.stopPropagation()"/>
      </div>`;
  }

  const actions = canFull ? `
    <div class="wi-pfield" style="justify-content:flex-end;gap:5px;flex-direction:row"
         onclick="event.stopPropagation()">
      ${row.saved
        ? `<button class="wi-btn" id="wi-btn-${row.id}"
                   onclick="event.stopPropagation();_wiSaveTrip(${row.id})">Update Trip</button>
           <button class="wi-btn-del" onclick="event.stopPropagation();_wiDeleteTrip(${row.id})">Delete</button>`
        : `<button class="wi-btn" id="wi-btn-${row.id}"
                   onclick="event.stopPropagation();_wiSaveTrip(${row.id})">🔗 Create Trip</button>
           <button class="wi-btn-ghost" onclick="event.stopPropagation();_wiSaveTrip(${row.id},true)">Export only</button>`}
    </div>` : '';

  const impZone = `
    <div>
      <div class="wi-plbl" style="margin-bottom:5px">Import — drag from shelf or drop here</div>
      <div id="wi-piz-${row.id}" class="wi-piz"
           ondragover="event.preventDefault();document.getElementById('wi-piz-${row.id}').classList.add('dh')"
           ondragleave="document.getElementById('wi-piz-${row.id}').classList.remove('dh')"
           ondrop="event.stopPropagation();_wiDrop(event,${row.id})">
        ${imp
          ? `<div class="wi-imp-chip" draggable="true" data-impid="${imp.id}"
                  ondragstart="_wiDragStart(event,'${imp.id}')">
              <span class="wi-imp-rm" onclick="event.stopPropagation();_wiRemoveImport(${row.id})">✕</span>
              <div style="font-size:11.5px;font-weight:700;color:var(--text)">
                ${_wiClean(imp.fields['Loading Summary'] || '—')}
              </div>
              <div style="font-size:10.5px;color:var(--text-dim)">
                → ${_wiClean(imp.fields['Delivery Summary'] || '—')} · 📦 ${imp.fields['Total Pallets'] || 0} pal
              </div>
              <div style="font-size:10px;color:var(--text-mid);margin-top:2px">
                📅 ${_wiFmt(imp.fields['Loading DateTime'])} → ${_wiFmt(imp.fields['Delivery DateTime'])}
              </div>
            </div>`
          : `<span class="wi-imp-empty">drop import here</span>`}
      </div>
    </div>`;

  return `
    <div class="wi-panel" onclick="event.stopPropagation()">
      <div class="wi-pcols">${toggle}${fields}${actions}</div>
      ${impZone}
    </div>`;
}

/* ─────────────────────────────────────────────────────────────
   SEARCHABLE DROPDOWN
───────────────────────────────────────────────────────────── */
function _wiSdrop(prefix, rowId, arr, selectedId, placeholder) {
  const uid      = `${prefix}_${rowId}`;
  const selLabel = arr.find(x => x.id === selectedId)?.label || '';
  const opts     = arr.map(x => {
    const lbl = (x.label || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `<div class="wi-sdo" data-id="${x.id}" data-lbl="${lbl}">${lbl}</div>`;
  }).join('');
  return `
    <div class="wi-sd" id="wsd-${uid}">
      <input type="text" class="wi-sdi" placeholder="${placeholder}"
             value="${selLabel.replace(/"/g, '&quot;')}"
             oninput="_wiSdFilter('${uid}',this.value)"
             onfocus="_wiSdOpen('${uid}')"
             autocomplete="off"/>
      <input type="hidden" id="wsd-v-${uid}" value="${selectedId || ''}"/>
      <div id="wsd-l-${uid}" class="wi-sdl">${opts}</div>
    </div>`;
}

// ── Dropdown event delegation ──────────────────────────────
document.addEventListener('click', e => {
  const opt = e.target.closest('.wi-sdo');
  if (opt) {
    const list = opt.closest('.wi-sdl');
    if (!list) return;
    const uid = list.id.replace('wsd-l-', '');
    _wiSdPick(uid, opt.dataset.id, opt.dataset.lbl || opt.textContent.trim());
    e.stopPropagation();
    return;
  }
  if (!e.target.closest('.wi-sd'))
    document.querySelectorAll('.wi-sdl').forEach(el => el.style.display = 'none');
});

function _wiSdOpen(uid) {
  document.querySelectorAll('.wi-sdl').forEach(el => {
    if (el.id !== 'wsd-l-' + uid) el.style.display = 'none';
  });
  const inp  = document.querySelector(`#wsd-${uid} .wi-sdi`);
  const list = document.getElementById('wsd-l-' + uid);
  if (!inp || !list) return;
  const r = inp.getBoundingClientRect();
  Object.assign(list.style, {
    display: 'block',
    left: `${r.left}px`,
    top:  `${r.bottom + 2}px`,
    width:`${Math.max(r.width, 200)}px`,
  });
  list.querySelectorAll('.wi-sdo').forEach(el => el.style.display = '');
}

function _wiSdFilter(uid, q) {
  const list = document.getElementById('wsd-l-' + uid);
  if (!list || list.style.display === 'none') _wiSdOpen(uid);
  const ql = q.toLowerCase();
  list.querySelectorAll('.wi-sdo').forEach(el => {
    el.style.display = (el.dataset.lbl || el.textContent).toLowerCase().includes(ql) ? '' : 'none';
  });
}

function _wiSdPick(uid, recId, label) {
  const v   = document.getElementById('wsd-v-' + uid);
  const inp = document.querySelector(`#wsd-${uid} .wi-sdi`);
  const lst = document.getElementById('wsd-l-' + uid);
  if (v)   v.value   = recId;
  if (inp) inp.value = label;
  if (lst) lst.style.display = 'none';

  const parts  = uid.split('_');
  const prefix = parts[0];
  const rowId  = parseInt(parts[parts.length - 1]);
  const fm = { tk: 'truckId', tl: 'trailerId', dr: 'driverId', pt: 'partnerId' };
  const lm = { tk: 'truckPlate', tl: 'trailerPlate', dr: 'driverName', pt: 'partnerName' };
  if (fm[prefix] && !isNaN(rowId)) {
    _wiField(rowId, fm[prefix], recId);
    _wiField(rowId, lm[prefix], label);
  }
}

/* ─────────────────────────────────────────────────────────────
   STATE MUTATIONS
───────────────────────────────────────────────────────────── */
function _wiField(rowId, field, val) {
  const row = WINTL.rows.find(r => r.id === rowId);
  if (row) row[field] = val;
}

function _wiSetCarrier(rowId, type) {
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row) return;
  row.carrierType = type;
  _wiRepaintRow(rowId);
}

function _wiToggle(rowId) {
  // Close any previously open panel, then open new one (accordion)
  const prev = WINTL.ui.openRow;
  WINTL.ui.openRow = prev === rowId ? null : rowId;
  if (prev && prev !== rowId) _wiRepaintRow(prev);
  _wiRepaintRow(rowId);
}

function _wiRepaintRow(rowId) {
  const el  = document.getElementById('wi-row-' + rowId);
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!el || !row) { _wiPaint(); return; }
  const idx = WINTL.rows.findIndex(r => r.id === rowId);
  el.outerHTML = _wiRowHTML(row, idx);
}

/* ─────────────────────────────────────────────────────────────
   DRAG & DROP
───────────────────────────────────────────────────────────── */
window._wiDragging = null;

function _wiDragStart(e, impId) {
  window._wiDragging = impId;
  e.dataTransfer.effectAllowed = 'move';
}

function _wiDrop(e, rowId) {
  e.preventDefault();
  document.getElementById('wi-piz-' + rowId)?.classList.remove('dh');
  const impId = window._wiDragging;
  if (!impId) return;
  window._wiDragging = null;
  _wiAssignImport(rowId, impId);
  _wiPaintShelf();
  _wiRepaintRow(rowId);
}

function _wiDropCompact(e, rowId) {
  e.preventDefault();
  document.getElementById('wi-ci-' + rowId)?.classList.remove('dh');
  const impId = window._wiDragging;
  if (!impId) return;
  window._wiDragging = null;
  WINTL.ui.openRow = rowId;   // open panel so user can see the import
  _wiAssignImport(rowId, impId);
  _wiPaintShelf();
  _wiRepaintRow(rowId);
}

function _wiAssignImport(rowId, impId) {
  // Remove from shelf
  WINTL.shelf = WINTL.shelf.filter(r => r.id !== impId);
  // Unassign from any other row
  WINTL.rows.forEach(r => { if (r.importId === impId) r.importId = null; });
  // Assign to target row
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row) return;
  if (row.importId) {
    // Return displaced import to shelf
    const old = WINTL.data.imports.find(r => r.id === row.importId);
    if (old && !WINTL.shelf.find(r => r.id === old.id)) WINTL.shelf.push(old);
  }
  row.importId = impId;
}

function _wiRemoveImport(rowId) {
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row || !row.importId) return;
  const imp = WINTL.data.imports.find(r => r.id === row.importId);
  if (imp && !WINTL.shelf.find(r => r.id === imp.id)) WINTL.shelf.push(imp);
  row.importId = null;
  _wiPaintShelf();
  _wiRepaintRow(rowId);
}

/* ─────────────────────────────────────────────────────────────
   CONTEXT MENU
───────────────────────────────────────────────────────────── */
function _wiCtx(e, rowId) {
  e.preventDefault();
  e.stopPropagation();
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row) return;

  const isGroup = row.exportIds.length > 1;
  const others  = WINTL.rows.filter(r => r.id !== rowId && !r.saved);
  const btn = (l, fn, d = false) =>
    `<button class="wi-ctx-btn${d ? ' danger' : ''}" onclick="${fn};_wiCtxClose()">${l}</button>`;

  let html = '';

  if (others.length) {
    html += `<div class="wi-ctx-hdr">Groupage</div>`;
    others.slice(0, 6).forEach(o => {
      const exp = WINTL.data.exports.find(r => r.id === o.exportIds[0]);
      const lbl = _wiClean(exp?.fields['Delivery Summary'] || `Row ${o.id}`).slice(0, 28);
      html += btn(`🔗 Group with: ${lbl}`, `_wiMerge(${rowId},${o.id})`);
    });
    html += `<div class="wi-ctx-sep"></div>`;
  }

  if (isGroup) html += btn('✂️ Split groupage', `_wiSplit(${rowId})`);
  if (row.importId) html += btn('✕ Remove import', `_wiRemoveImport(${rowId})`);
  html += btn('↗ View export order', `_wiViewExport(${rowId})`);

  if (!row.saved) {
    html += `<div class="wi-ctx-sep"></div>`;
    html += btn('🗑 Remove row', `_wiDeleteRow(${rowId})`, true);
  }

  const ctx = document.getElementById('wi-ctx');
  ctx.innerHTML = html;
  Object.assign(ctx.style, {
    display: 'block',
    left: `${Math.min(e.clientX, window.innerWidth  - 220)}px`,
    top:  `${Math.min(e.clientY, window.innerHeight - 260)}px`,
  });
  setTimeout(() => document.addEventListener('click', _wiCtxClose, { once: true }), 10);
}
function _wiCtxClose() {
  const el = document.getElementById('wi-ctx');
  if (el) el.style.display = 'none';
}

/* ─────────────────────────────────────────────────────────────
   GROUPAGE
───────────────────────────────────────────────────────────── */
function _wiMerge(rowId, otherId) {
  const row   = WINTL.rows.find(r => r.id === rowId);
  const other = WINTL.rows.find(r => r.id === otherId);
  if (!row || !other) return;
  other.exportIds.forEach(id => { if (!row.exportIds.includes(id)) row.exportIds.push(id); });
  if (!row.importId && other.importId) row.importId = other.importId;
  else if (other.importId && row.importId !== other.importId) {
    const imp = WINTL.data.imports.find(r => r.id === other.importId);
    if (imp && !WINTL.shelf.find(r => r.id === imp.id)) WINTL.shelf.push(imp);
  }
  WINTL.rows = WINTL.rows.filter(r => r.id !== otherId);
  _wiPaint();
  toast('Grouped ✓');
}

function _wiSplit(rowId) {
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row || row.exportIds.length <= 1) return;
  const [first, ...rest] = row.exportIds;
  row.exportIds = [first];
  rest.forEach(expId => {
    const exp = WINTL.data.exports.find(r => r.id === expId);
    WINTL.rows.push({
      id: ++WINTL._seq, tripRecId: null, tripNo: '',
      exportIds: [expId], importId: null,
      truckId: '', trailerId: '', driverId: '', partnerId: '',
      truckPlate: '', trailerPlate: '', driverName: '', partnerName: '',
      loadingDate: exp?.fields['Loading DateTime'] || '',
      carrierType: 'owned', partnerRateExp: '', partnerRateImp: '',
      saved: false,
    });
  });
  _wiPaint();
  toast('Split ✓');
}

function _wiDeleteRow(rowId) {
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row) return;
  if (row.importId) {
    const imp = WINTL.data.imports.find(r => r.id === row.importId);
    if (imp && !WINTL.shelf.find(r => r.id === imp.id)) WINTL.shelf.push(imp);
  }
  WINTL.rows = WINTL.rows.filter(r => r.id !== rowId);
  _wiPaint();
}

function _wiViewExport(rowId) {
  const row = WINTL.rows.find(r => r.id === rowId);
  if (row?.exportIds?.[0]) {
    navigate('orders_intl');
    setTimeout(() => {
      if (typeof showIntlDetail === 'function') showIntlDetail(row.exportIds[0]);
    }, 500);
  }
}

/* ─────────────────────────────────────────────────────────────
   SAVE / DELETE
───────────────────────────────────────────────────────────── */
async function _wiSaveTrip(rowId, exportOnly = false) {
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row) return;

  // Sync dropdown values into row state
  const syncDrop = (prefix, fld, lbl) => {
    const uid = `${prefix}_${rowId}`;
    const val = document.getElementById(`wsd-v-${uid}`)?.value;
    const lab = document.querySelector(`#wsd-${uid} .wi-sdi`)?.value;
    if (val) { row[fld] = val; row[lbl] = lab || ''; }
  };
  syncDrop('tk', 'truckId',   'truckPlate');
  syncDrop('tl', 'trailerId', 'trailerPlate');
  syncDrop('dr', 'driverId',  'driverName');
  syncDrop('pt', 'partnerId', 'partnerName');

  if (!row.exportIds.length) { toast('No export order', 'warn'); return; }
  const isPartner = row.carrierType === 'partner';
  if (isPartner && !row.partnerId) { toast('Select a partner first', 'warn'); return; }

  const btn = document.getElementById('wi-btn-' + rowId);
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const fields = { 'Export Order': row.exportIds, 'Week Number': WINTL.week };
    if (!exportOnly && row.importId) fields['Import Order'] = [row.importId];

    if (isPartner) {
      if (row.partnerId)      fields['Partner']             = [row.partnerId];
      if (row.partnerRateExp) fields['Partner Rate Export'] = parseFloat(row.partnerRateExp) || 0;
      if (row.partnerRateImp) fields['Partner Rate Import'] = parseFloat(row.partnerRateImp) || 0;
      fields['Is Partner Trip'] = true;
    } else {
      if (row.truckId)   fields['Truck']   = [row.truckId];
      if (row.trailerId) fields['Trailer'] = [row.trailerId];
      if (row.driverId)  fields['Driver']  = [row.driverId];
    }

    if (row.saved && row.tripRecId) {
      await atPatch(TABLES.TRIPS, row.tripRecId, fields);
    } else {
      await atCreate(TABLES.TRIPS, fields);
    }

    toast(row.saved ? 'Trip updated ✓' : 'Trip created ✓');
    WINTL.ui.openRow  = null;
    WINTL._assetsOk   = true;
    await renderWeeklyIntl();

  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = row.saved ? 'Update Trip' : '🔗 Create Trip'; }
    alert('Save failed: ' + err.message);
  }
}

async function _wiDeleteTrip(rowId) {
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row?.tripRecId) return;
  if (!confirm('Delete this trip record?')) return;
  try {
    await atDelete(TABLES.TRIPS, row.tripRecId);
    toast('Trip deleted');
    WINTL.ui.openRow = null;
    WINTL._assetsOk  = true;
    await renderWeeklyIntl();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

/* ─────────────────────────────────────────────────────────────
   WEEK NAVIGATION
───────────────────────────────────────────────────────────── */
function _wiNavWeek(delta) {
  WINTL.week = Math.max(1, Math.min(53, WINTL.week + delta));
  WINTL.ui.openRow = null;
  WINTL._assetsOk  = true;
  renderWeeklyIntl();
}
