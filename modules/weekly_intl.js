// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL — Clean Architecture v3
//
// STATE MODEL:
//   WINTL.data   → raw Airtable records (source of truth)
//   WINTL.rows   → derived row objects (built from data)
//   WINTL.ui     → transient UI state (open panels, hover, etc.)
//
// ROW MODEL: { id, tripRecId, tripNo, exportIds[], importId,
//              truckId, trailerId, driverId, partnerId,
//              truckPlate, trailerPlate, driverName, partnerName,
//              loadingDate, carrierType, partnerRateExp, partnerRateImp,
//              saved, dirty }
//
// RENDER PIPELINE:
//   renderWeeklyIntl()  → load data → buildRows() → paint()
//   _wiRepaint(rowId)   → update single row (no full re-render)
// ═══════════════════════════════════════════════════════════════════════

/* ─────────────────────────────────────────────
   STATE
───────────────────────────────────────────── */
const WINTL = {
  week: _wiCurrentWeek(),
  data: { exports: [], imports: [], trips: [], trucks: [], trailers: [], drivers: [], partners: [] },
  rows: [],
  shelf: [],   // unmatched imports
  ui:   { openPanel: null, shelfFilter: '', shelfCollapsed: false },
  _seq: 0,     // row ID sequence
  _assetsOk: false,
};

/* ─────────────────────────────────────────────
   STYLES (injected once)
───────────────────────────────────────────── */
(function injectStyles() {
  if (document.getElementById('wi3-styles')) return;
  const s = document.createElement('style');
  s.id = 'wi3-styles';
  s.textContent = `
    /* ── table grid ── */
    .wi-grid { display: grid; grid-template-columns: 44px 1fr 36px 220px 1fr; }

    /* ── row ── */
    .wi-row  { border-top: 1px solid var(--border); transition: background 0.1s; }
    .wi-row:hover .wi-row-inner { background: rgba(0,0,0,0.012); }
    .wi-row-inner { min-height: 38px; }
    .wi-row.saved  { background: rgba(5,150,105,0.035); }
    .wi-row.dirty  { background: rgba(59,130,246,0.04); }

    /* ── cells ── */
    .wi-cell { display: flex; align-items: center; overflow: hidden; }
    .wi-cell-num   { padding: 4px 0; flex-direction: column; justify-content: center;
                     gap: 3px; border-right: 1px solid var(--border); }
    .wi-cell-exp   { padding: 6px 13px; border-right: 1px solid var(--border);
                     align-items: flex-start; flex-direction: column; gap: 2px; }
    .wi-cell-tog   { justify-content: center; cursor: pointer; border-right: 1px solid var(--border);
                     transition: background 0.1s; }
    .wi-cell-tog:hover { background: rgba(0,0,0,0.03); }
    .wi-cell-asgn  { padding: 5px 10px; border-right: 1px solid var(--border);
                     justify-content: center; cursor: pointer; background: var(--bg); }
    .wi-cell-asgn:hover { background: var(--bg-hover); }
    .wi-cell-imp   { padding: 6px 12px; flex-direction: column; gap: 2px;
                     transition: background 0.12s; }

    /* ── assignment badge ── */
    .wi-asgn-plate  { font-size: 11.5px; font-weight: 700; color: var(--text);
                      letter-spacing: 0.4px; line-height: 1; }
    .wi-asgn-driver { font-size: 10px; color: var(--text-dim); line-height: 1; }
    .wi-asgn-partner{ font-size: 11px; font-weight: 600; color: #0B6E4F;
                      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                      max-width: 190px; line-height: 1; }
    .wi-asgn-empty  { font-size: 10px; letter-spacing: 0.5px; color: var(--text-dim); }

    /* ── badges ── */
    .wi-b { display: inline-block; font-size: 8.5px; font-weight: 700; letter-spacing: 1px;
            text-transform: uppercase; padding: 1px 5px; border-radius: 3px; }
    .wi-b-vx { background: rgba(99,102,241,0.1); color: rgba(99,102,241,0.85);
               border: 1px solid rgba(99,102,241,0.18); }
    .wi-b-gr { background: rgba(14,165,233,0.1); color: rgba(14,165,233,0.85);
               border: 1px solid rgba(14,165,233,0.18); }
    .wi-b-ok { background: rgba(5,150,105,0.1); color: rgba(5,150,105,0.85);
               border: 1px solid rgba(5,150,105,0.16); }

    /* ── dot status ── */
    .wi-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

    /* ── chevron toggle ── */
    .wi-chev { font-size: 14px; color: var(--text-dim); display: inline-block;
               transition: transform 0.15s; }
    .wi-chev.open { transform: rotate(90deg); }

    /* ── panel (inline expand) ── */
    .wi-panel { border-top: 1px solid var(--border); background: var(--bg);
                padding: 12px 14px 14px; display: grid;
                grid-template-columns: 44px 1fr; }
    .wi-panel-inner { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
    .wi-panel-label { font-size: 9px; font-weight: 700; letter-spacing: 1px;
                      text-transform: uppercase; color: var(--text-dim); margin-bottom: 4px; }

    /* ── searchable dropdown ── */
    .wi-sd { position: relative; }
    .wi-sd-input { width: 195px; padding: 6px 9px; font-size: 11.5px; border-radius: 6px;
                   border: 1px solid var(--border-mid); background: var(--bg-card);
                   color: var(--text); outline: none; }
    .wi-sd-input:focus { border-color: rgba(11,25,41,0.3); box-shadow: 0 0 0 2px rgba(11,25,41,0.06); }
    .wi-sd-list { display: none; position: fixed; z-index: 9999; min-width: 220px;
                  max-height: 220px; overflow-y: auto; background: var(--bg-card);
                  border: 1px solid var(--border-mid); border-radius: 7px;
                  box-shadow: 0 6px 24px rgba(0,0,0,0.11); }
    .wi-sd-opt  { padding: 7px 11px; font-size: 11.5px; cursor: pointer; color: var(--text); }
    .wi-sd-opt:hover { background: var(--bg-hover); }
    .wi-sd-opt.selected { color: var(--success); }

    /* ── shelf chips ── */
    .wi-chip { background: rgba(217,119,6,0.07); border: 1px solid rgba(217,119,6,0.2);
               border-radius: 7px; padding: 7px 11px; cursor: grab; min-width: 150px;
               max-width: 210px; transition: box-shadow 0.12s, transform 0.1s; }
    .wi-chip:hover { box-shadow: 0 3px 10px rgba(0,0,0,0.09); transform: translateY(-1px); }
    .wi-chip:active { cursor: grabbing; }

    /* ── date separator ── */
    .wi-date-sep { display: grid; grid-template-columns: 44px 1fr 36px 220px 1fr;
                   border-top: 1.5px solid var(--border-mid); background: var(--bg); }
    .wi-date-label { grid-column: 2 / -1; padding: 5px 14px;
                     font-size: 10px; font-weight: 700; letter-spacing: 1.3px;
                     text-transform: uppercase; color: var(--text-mid); }

    /* ── context menu ── */
    #wi-ctx { display: none; position: fixed; z-index: 9999; background: var(--bg-card);
              border: 1px solid var(--border-mid); border-radius: 8px;
              box-shadow: 0 8px 28px rgba(0,0,0,0.12); min-width: 210px; padding: 5px 0; }
    .wi-ctx-item { display: block; width: 100%; padding: 7px 14px; text-align: left;
                   font-size: 12px; cursor: pointer; color: var(--text); background: none;
                   border: none; transition: background 0.1s; }
    .wi-ctx-item:hover  { background: var(--bg-hover); }
    .wi-ctx-item.danger { color: var(--danger); }
    .wi-ctx-sep { height: 1px; background: var(--border); margin: 4px 0; }
    .wi-ctx-head{ padding: 4px 14px 2px; font-size: 9px; font-weight: 700; letter-spacing: 1px;
                  text-transform: uppercase; color: var(--text-dim); }

    /* ── shelf section ── */
    .wi-shelf-hdr { display: flex; align-items: center; gap: 10px; padding: 8px 14px;
                    cursor: pointer; user-select: none; }
    .wi-shelf-hdr:hover { background: rgba(0,0,0,0.02); }

    /* ── drop hover ── */
    .wi-drop-active { background: rgba(217,119,6,0.06) !important; outline: 1.5px dashed rgba(217,119,6,0.4); outline-offset: -2px; }

    /* ── saving spinner ── */
    .wi-saving { opacity: 0.55; pointer-events: none; }
  `;
  document.head.appendChild(s);
})();

/* ─────────────────────────────────────────────
   WEEK HELPERS
───────────────────────────────────────────── */
function _wiCurrentWeek() {
  const d = new Date(), y = d.getFullYear();
  const jan1 = new Date(y, 0, 1);
  return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
}

function _wiWeekRange(w) {
  const y = new Date().getFullYear();
  const jan1 = new Date(y, 0, 1);
  const base = new Date(jan1.getTime() + (w - 1) * 7 * 86400000);
  const day = base.getDay();
  const mon = new Date(base); mon.setDate(base.getDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const f = d => d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
  return `${f(mon)} – ${f(sun)}`;
}

function _wiFmtDate(s) {
  if (!s) return '—';
  try {
    const p = s.split('T')[0].split('-');
    return `${p[2]}/${p[1]}`;
  } catch { return s; }
}

function _wiFmtFull(s) {
  if (!s) return null;
  try {
    return new Date(s).toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'long' });
  } catch { return s; }
}

function _wiClean(s) {
  return (s || '').replace(/^['"\s/]+/, '').replace(/['"\s/]+$/, '').trim();
}

/* ─────────────────────────────────────────────
   LOAD ASSETS (trucks/trailers/drivers/partners)
   Cached across week navigation
───────────────────────────────────────────── */
async function _wiLoadAssets() {
  if (WINTL._assetsOk) return;
  const [trucks, trailers, drivers, partners] = await Promise.all([
    atGetAll(TABLES.TRUCKS,   { fields: ['License Plate'], filterByFormula: '{Active}=TRUE()' }),
    atGetAll(TABLES.TRAILERS, { fields: ['License Plate'] }),
    atGetAll(TABLES.DRIVERS,  { fields: ['Full Name'],     filterByFormula: '{Active}=TRUE()' }),
    atGetAll(TABLES.PARTNERS, { fields: ['Company Name'] }),
  ]);
  WINTL.data.trucks   = trucks.map(r   => ({ id: r.id, label: r.fields['License Plate'] || r.id }));
  WINTL.data.trailers = trailers.map(r => ({ id: r.id, label: r.fields['License Plate'] || r.id }));
  WINTL.data.drivers  = drivers.map(r  => ({ id: r.id, label: r.fields['Full Name']     || r.id }));
  WINTL.data.partners = partners.map(r => ({ id: r.id, label: r.fields['Company Name']  || r.id }));
  WINTL._assetsOk = true;
}

/* ─────────────────────────────────────────────
   MAIN ENTRY POINT
───────────────────────────────────────────── */
async function renderWeeklyIntl() {
  if (can('planning') === 'none') {
    document.getElementById('content').innerHTML = showAccessDenied();
    return;
  }

  document.getElementById('topbarTitle').textContent = `Weekly International — Week ${WINTL.week}`;
  document.getElementById('content').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;
                height:160px;color:var(--text-dim);font-size:13px">
      <div class="spinner"></div> Loading week ${WINTL.week}…
    </div>`;

  try {
    await _wiLoadAssets();

    const [allOrders, allTrips] = await Promise.all([
      atGetAll(TABLES.ORDERS, {
        filterByFormula: `AND({Type}='International',{Week Number}=${WINTL.week})`,
      }),
      atGetAll(TABLES.TRIPS, {
        filterByFormula: `{Week Number}=${WINTL.week}`,
        fields: ['Export Order', 'Import Order', 'Truck', 'Trailer', 'Driver', 'Partner',
                 'Truck Plate', 'Trailer Plate', 'Driver Name', 'Partner Name',
                 'Export Loading DateTime', 'Week Number', 'TripID',
                 'Is Partner Trip', 'Partner Rate Export', 'Partner Rate Import'],
      }),
    ]);

    WINTL.data.exports = allOrders
      .filter(r => r.fields.Direction === 'Export')
      .sort((a, b) => (a.fields['Loading DateTime'] || '').localeCompare(b.fields['Loading DateTime'] || ''));
    WINTL.data.imports = allOrders.filter(r => r.fields.Direction === 'Import');
    WINTL.data.trips   = allTrips;

    _wiBuildRows();
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

/* ─────────────────────────────────────────────
   BUILD ROWS  (derive from data)
───────────────────────────────────────────── */
function _wiBuildRows() {
  WINTL.rows = [];
  WINTL._seq = 0;
  const usedExp = new Set(), usedImp = new Set();
  const { exports, imports, trips } = WINTL.data;

  // ── Saved rows from TRIPS table ─────────────
  for (const trip of trips) {
    const f           = trip.fields;
    const expIds      = f['Export Order'] || [];
    const impId       = (f['Import Order'] || [])[0] || null;
    const truckId     = (f['Truck']   || [])[0] || '';
    const trailerId   = (f['Trailer'] || [])[0] || '';
    const driverId    = (f['Driver']  || [])[0] || '';
    const partnerId   = (f['Partner'] || [])[0] || '';
    const isPartner   = !!(f['Is Partner Trip'] || partnerId);

    // Lookup fields return arrays
    const truckPlate  = (f['Truck Plate']   || [])[0] || '';
    const trailerPlate= (f['Trailer Plate'] || [])[0] || '';
    const driverName  = (f['Driver Name']   || [])[0] || '';
    const partnerName = (f['Partner Name']  || [])[0] || '';
    const loadingDate = (f['Export Loading DateTime'] || [])[0] || '';

    expIds.forEach(id => usedExp.add(id));
    if (impId) usedImp.add(impId);

    WINTL.rows.push({
      id:             ++WINTL._seq,
      tripRecId:      trip.id,
      tripNo:         f['TripID'] ? String(f['TripID']) : '',
      exportIds:      expIds,
      importId:       impId,
      truckId, trailerId, driverId, partnerId,
      truckPlate, trailerPlate, driverName, partnerName,
      loadingDate,
      carrierType:    isPartner ? 'partner' : 'owned',
      partnerRateExp: f['Partner Rate Export'] ? String(f['Partner Rate Export']) : '',
      partnerRateImp: f['Partner Rate Import'] ? String(f['Partner Rate Import']) : '',
      saved:  true,
      dirty:  false,
    });
  }

  // ── Unsaved rows: 1 row per unassigned export ─
  for (const exp of exports.filter(r => !usedExp.has(r.id))) {
    WINTL.rows.push({
      id:             ++WINTL._seq,
      tripRecId:      null,
      tripNo:         '',
      exportIds:      [exp.id],
      importId:       null,
      truckId: '', trailerId: '', driverId: '', partnerId: '',
      truckPlate: '', trailerPlate: '', driverName: '', partnerName: '',
      loadingDate: exp.fields['Loading DateTime'] || '',
      carrierType: 'owned',
      partnerRateExp: '', partnerRateImp: '',
      saved: false, dirty: false,
    });
  }

  // ── Import shelf: unmatched imports ────────────
  WINTL.shelf = imports.filter(r => !usedImp.has(r.id));
}

/* ─────────────────────────────────────────────
   PAINT — full re-render of content area
───────────────────────────────────────────── */
function _wiPaint() {
  const { rows, shelf, ui, week, data } = WINTL;
  const expN      = data.exports.length;
  const impN      = data.imports.length;
  const onTrip    = rows.filter(r => r.saved).length;
  const pending   = rows.filter(r => !r.saved).length;
  const unmatched = shelf.length;

  document.getElementById('content').innerHTML = `

    <!-- ── PAGE HEADER ─────────────────────── -->
    <div class="page-header" style="margin-bottom:10px">
      <div>
        <div class="page-title">Weekly International</div>
        <div class="page-sub" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:3px">
          <span>Week ${week} · ${_wiWeekRange(week)}</span>
          <span style="color:var(--success)">${expN} exports</span>
          <span style="color:var(--warning)">${impN} imports</span>
          <span style="color:var(--text-dim)">${onTrip} on trip · ${pending} pending</span>
          ${unmatched
            ? `<span style="color:var(--warning)">${unmatched} imports unmatched</span>`
            : `<span style="color:var(--success)">all imports matched ✓</span>`}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost" style="padding:5px 20px" onclick="_wiNavWeek(-1)">← Prev</button>
        <div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:700;min-width:60px;text-align:center">W ${week}</div>
        <button class="btn btn-ghost" style="padding:5px 20px" onclick="_wiNavWeek(1)">Next →</button>
        <button class="btn btn-ghost" onclick="renderWeeklyIntl()" title="Refresh">↺</button>
      </div>
    </div>

    <!-- ── IMPORT SHELF ─────────────────────── -->
    <div style="margin-bottom:10px;background:var(--bg-card);
                border:1px solid rgba(217,119,6,0.22);border-radius:10px;overflow:hidden">

      <div class="wi-shelf-hdr" onclick="_wiToggleShelf()">
        <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;
                     text-transform:uppercase;color:var(--warning)">
          IMPORT SHELF
        </span>
        ${unmatched
          ? `<span style="background:rgba(217,119,6,0.12);color:var(--warning);
                          font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px">${unmatched}</span>`
          : `<span style="font-size:10px;color:var(--success)">all matched ✓</span>`}
        ${unmatched > 4
          ? `<input type="text" placeholder="search…" value="${ui.shelfFilter}"
                    oninput="WINTL.ui.shelfFilter=this.value;_wiPaintShelf()"
                    onclick="event.stopPropagation()"
                    style="margin-left:auto;padding:4px 10px;font-size:11px;border-radius:6px;
                           border:1px solid var(--border-mid);background:var(--bg);
                           color:var(--text);width:160px;outline:none"/>`
          : ''}
        <span style="margin-left:${unmatched > 4 ? '0' : 'auto'};font-size:10px;
                     color:var(--text-dim);transition:transform 0.2s;
                     transform:rotate(${ui.shelfCollapsed ? '-90deg' : '0deg'})">▾</span>
      </div>

      <div id="wi-shelf" style="display:${ui.shelfCollapsed ? 'none' : 'block'};
           padding:${unmatched ? '10px 12px' : '6px 14px'}">
        ${_wiShelfContent()}
      </div>
    </div>

    <!-- ── TRIPS TABLE ──────────────────────── -->
    <div style="border:1px solid var(--border-mid);border-radius:10px;overflow:hidden;
                background:var(--bg-card)">

      <!-- sticky header -->
      <div class="wi-grid" style="background:var(--bg);border-bottom:2px solid var(--border-mid);
                                   position:sticky;top:0;z-index:10">
        <div class="wi-cell wi-cell-num" style="border-right:1px solid var(--border-mid)">
          <span style="font-size:9px;color:var(--text-dim);padding-left:2px">#</span>
        </div>
        <div class="wi-cell" style="padding:8px 13px;border-right:1px solid var(--border-mid)">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.3px;
                       text-transform:uppercase;color:var(--success)">EXPORT</span>
          <span style="font-size:10px;color:var(--text-dim);margin-left:8px">right-click to group</span>
        </div>
        <div style="border-right:1px solid var(--border-mid)"></div>
        <div class="wi-cell" style="padding:8px 10px;border-right:1px solid var(--border-mid);justify-content:center">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.3px;
                       text-transform:uppercase;color:var(--text-dim)">TRUCK / PARTNER</span>
        </div>
        <div class="wi-cell" style="padding:8px 13px">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.3px;
                       text-transform:uppercase;color:var(--warning)">IMPORT</span>
          <span style="font-size:10px;color:var(--text-dim);margin-left:8px">drag from shelf</span>
        </div>
      </div>

      <!-- rows -->
      <div id="wi-rows">
        ${rows.length ? _wiRenderAllRows() : `
          <div class="empty-state" style="padding:60px">
            <p>No international exports for week ${week}</p>
          </div>`}
      </div>
    </div>

    <!-- context menu (shared) -->
    <div id="wi-ctx"></div>
  `;

  // Re-wire drag events (shelf might have been re-rendered)
  window._wiDragging = null;
}

/* ─────────────────────────────────────────────
   SHELF CONTENT  (partial re-render)
───────────────────────────────────────────── */
function _wiShelfContent() {
  const { shelf, ui } = WINTL;
  if (!shelf.length) {
    return `<div style="font-size:12px;color:var(--text-dim)">No unmatched imports this week</div>`;
  }
  const sf = ui.shelfFilter.toLowerCase();
  const visible = sf
    ? shelf.filter(r => {
        const s = (r.fields['Loading Summary'] || '') + (r.fields['Delivery Summary'] || '');
        return s.toLowerCase().includes(sf);
      })
    : shelf;
  return `<div style="display:flex;flex-wrap:wrap;gap:8px">${visible.map(_wiChip).join('')}</div>`;
}

function _wiPaintShelf() {
  const el = document.getElementById('wi-shelf');
  if (el) el.innerHTML = _wiShelfContent();
}

function _wiToggleShelf() {
  WINTL.ui.shelfCollapsed = !WINTL.ui.shelfCollapsed;
  const el = document.getElementById('wi-shelf');
  if (el) el.style.display = WINTL.ui.shelfCollapsed ? 'none' : 'block';
}

function _wiChip(r) {
  const f = r.fields;
  const loading  = _wiClean(f['Loading Summary']  || '—').slice(0, 28);
  const delivery = _wiClean(f['Delivery Summary'] || '—').slice(0, 22);
  const pals     = f['Total Pallets'] || 0;
  const loadDt   = _wiFmtDate(f['Loading DateTime']);
  const delDt    = _wiFmtDate(f['Delivery DateTime']);
  return `
    <div class="wi-chip" draggable="true" data-impid="${r.id}"
         ondragstart="_wiDragStart(event,'${r.id}')">
      <div style="font-size:11px;font-weight:600;color:var(--text);
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${loading}</div>
      <div style="font-size:10px;color:var(--text-dim)">→ ${delivery}</div>
      <div style="font-size:10px;color:var(--text-mid);margin-top:2px">
        ${pals} pal · load ${loadDt} · del ${delDt}
      </div>
    </div>`;
}

/* ─────────────────────────────────────────────
   RENDER ALL ROWS with date separators
───────────────────────────────────────────── */
function _wiRenderAllRows() {
  let html = '', lastDate = null;
  WINTL.rows.forEach((row, i) => {
    const exp = WINTL.data.exports.find(r => r.id === row.exportIds[0]);
    const rawDate = row.loadingDate || exp?.fields['Loading DateTime'] || null;
    const label   = rawDate ? _wiFmtFull(rawDate) : null;

    if (label && label !== lastDate) {
      lastDate = label;
      html += `
        <div class="wi-date-sep" style="${i === 0 ? 'border-top:none' : ''}">
          <div style="border-right:1px solid var(--border)"></div>
          <div class="wi-date-label">${label}</div>
        </div>`;
    }
    html += _wiRowHTML(row, i);
  });
  return html;
}

/* ─────────────────────────────────────────────
   SINGLE ROW HTML
───────────────────────────────────────────── */
function _wiRowHTML(row, i) {
  const { data, ui } = WINTL;
  const exps    = row.exportIds.map(id => data.exports.find(r => r.id === id)).filter(Boolean);
  const imp     = row.importId ? data.imports.find(r => r.id === row.importId) : null;
  const isOpen  = ui.openPanel === row.id;
  const isGroup = exps.length > 1;
  const rowCls  = row.saved ? 'saved' : row.dirty ? 'dirty' : '';

  // Dot color: saved=green, dirty=blue, empty=amber
  const dotColor = row.saved
    ? 'var(--success)'
    : (row.truckId || row.partnerId)
      ? 'rgba(59,130,246,0.8)'
      : 'var(--warning)';

  // ── Export cell ──────────────────────────────
  const expHtml = exps.map(r => {
    const loading  = _wiClean(r.fields['Loading Summary']  || '—');
    const delivery = _wiClean(r.fields['Delivery Summary'] || '—');
    const pals     = r.fields['Total Pallets']  || 0;
    const loadDt   = _wiFmtDate(r.fields['Loading DateTime']);
    const delDt    = _wiFmtDate(r.fields['Delivery DateTime']);
    const veroia   = r.fields['Veroia Switch '] || r.fields['Veroia Switch'];
    return `
      <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:0;line-height:1.5">
        <span style="font-size:11px;font-weight:600;color:var(--text)">${loading}</span>
        <span style="font-size:11px;color:var(--text-dim);margin:0 6px">→</span>
        <span style="font-size:11px;color:var(--text-mid)">${delivery}</span>
        <span style="font-size:10px;color:var(--text-dim);margin-left:8px">${pals} pal</span>
        <span style="font-size:10px;color:var(--text-dim);margin-left:6px">load ${loadDt} · del ${delDt}</span>
        ${veroia ? `<span class="wi-b wi-b-vx" style="margin-left:6px">VEROIA</span>` : ''}
      </div>`;
  }).join('');

  // ── Assignment badge ─────────────────────────
  const plate   = row.truckPlate   || data.trucks.find(t => t.id === row.truckId)?.label   || '';
  const driver  = row.driverName   || data.drivers.find(d => d.id === row.driverId)?.label  || '';
  const partner = row.partnerName  || data.partners.find(p => p.id === row.partnerId)?.label || '';

  let asgnHtml;
  if (row.carrierType === 'partner') {
    asgnHtml = partner
      ? `<div class="wi-asgn-partner">${partner}</div>`
      : `<span class="wi-asgn-empty">— no partner —</span>`;
  } else {
    if (plate) {
      const surname = driver ? driver.trim().split(/\s+/).pop() : '';
      asgnHtml = `
        <div style="text-align:center">
          <div class="wi-asgn-plate">${plate}</div>
          ${surname ? `<div class="wi-asgn-driver">${surname}</div>` : ''}
        </div>`;
    } else {
      asgnHtml = `<span class="wi-asgn-empty">— pending —</span>`;
    }
  }

  // ── Import cell ──────────────────────────────
  const impHtml = imp
    ? `<div draggable="true" data-impid="${imp.id}"
            ondragstart="_wiDragStart(event,'${imp.id}')"
            style="cursor:grab;width:100%">
         <div style="font-size:11px;font-weight:600;color:var(--text)">
           ${_wiClean(imp.fields['Loading Summary'] || '—')}
         </div>
         <div style="font-size:10px;color:var(--text-dim)">
           → ${_wiClean(imp.fields['Delivery Summary'] || '—')} · ${imp.fields['Total Pallets'] || 0} pal
         </div>
         <div style="font-size:10px;color:var(--text-mid)">
           load ${_wiFmtDate(imp.fields['Loading DateTime'])} · del ${_wiFmtDate(imp.fields['Delivery DateTime'])}
         </div>
       </div>`
    : `<span style="font-size:10px;color:var(--border-dark,#cbd5e1);letter-spacing:0.3px">— drop import here —</span>`;

  return `
  <div id="wi-row-${row.id}" class="wi-row ${rowCls}">
    <!-- main row -->
    <div class="wi-grid wi-row-inner" oncontextmenu="_wiCtx(event,${row.id})">

      <!-- # dot -->
      <div class="wi-cell wi-cell-num" style="border-right:1px solid var(--border)">
        <div class="wi-dot" style="background:${dotColor}"></div>
        <span style="font-size:9px;color:var(--text-dim)">${i + 1}</span>
      </div>

      <!-- export -->
      <div class="wi-cell wi-cell-exp" style="cursor:default">
        ${isGroup ? `<div style="margin-bottom:2px"><span class="wi-b wi-b-gr">GROUPAGE ×${exps.length}</span></div>` : ''}
        ${expHtml}
      </div>

      <!-- toggle -->
      <div class="wi-cell wi-cell-tog" style="border-right:1px solid var(--border)"
           onclick="_wiTogglePanel(${row.id})">
        <span class="wi-chev ${isOpen ? 'open' : ''}">›</span>
      </div>

      <!-- assignment -->
      <div class="wi-cell wi-cell-asgn" onclick="_wiTogglePanel(${row.id})">
        ${asgnHtml}
      </div>

      <!-- import drop zone -->
      <div id="wi-imp-${row.id}" class="wi-cell wi-cell-imp"
           ondragover="event.preventDefault();_wiDropHover(${row.id},true)"
           ondragleave="_wiDropHover(${row.id},false)"
           ondrop="_wiDrop(event,${row.id})">
        ${impHtml}
      </div>

    </div>

    <!-- inline assignment panel -->
    ${isOpen ? `<div class="wi-panel"><div></div><div class="wi-panel-inner">${_wiPanelHTML(row)}</div></div>` : ''}
  </div>`;
}

/* ─────────────────────────────────────────────
   ASSIGNMENT PANEL HTML
───────────────────────────────────────────── */
function _wiPanelHTML(row) {
  const isPartner = row.carrierType === 'partner';
  const { trucks, trailers, drivers, partners } = WINTL.data;
  const canFull = can('planning') === 'full';

  // ── carrier type toggle ──────────────────────
  const toggleHtml = `
    <div style="padding-top:2px">
      <div class="wi-panel-label">Type</div>
      <div style="display:flex;gap:0;border:1px solid var(--border-mid);border-radius:6px;overflow:hidden">
        <button onclick="_wiSetCarrier(${row.id},'owned')"
          style="padding:5px 12px;font-size:11px;border:none;cursor:pointer;
                 background:${!isPartner ? 'var(--text)' : 'var(--bg-card)'};
                 color:${!isPartner ? '#fff' : 'var(--text-mid)'}">Owned Fleet</button>
        <button onclick="_wiSetCarrier(${row.id},'partner')"
          style="padding:5px 12px;font-size:11px;border:none;cursor:pointer;
                 background:${isPartner ? 'var(--text)' : 'var(--bg-card)'};
                 color:${isPartner ? '#fff' : 'var(--text-mid)'}">Partner</button>
      </div>
    </div>`;

  // ── owned fleet fields ───────────────────────
  const ownedHtml = !isPartner ? `
    <div>
      <div class="wi-panel-label">Truck</div>
      ${_wiSdrop('tk', row.id, trucks, row.truckId, 'Truck plate…')}
    </div>
    <div>
      <div class="wi-panel-label">Trailer</div>
      ${_wiSdrop('tl', row.id, trailers, row.trailerId, 'Trailer plate…')}
    </div>
    <div>
      <div class="wi-panel-label">Driver</div>
      ${_wiSdrop('dr', row.id, drivers, row.driverId, 'Driver name…')}
    </div>` : '';

  // ── partner fields ───────────────────────────
  const partnerHtml = isPartner ? `
    <div>
      <div class="wi-panel-label">Partner</div>
      ${_wiSdrop('pt', row.id, partners, row.partnerId, 'Partner company…')}
    </div>
    <div>
      <div class="wi-panel-label">Rate Export (€)</div>
      <input type="number" placeholder="0.00" value="${row.partnerRateExp || ''}"
             oninput="_wiField(${row.id},'partnerRateExp',this.value)"
             style="width:105px;padding:6px 9px;font-size:11.5px;border-radius:6px;
                    border:1px solid var(--border-mid);background:var(--bg-card);
                    color:var(--text);outline:none"/>
    </div>
    <div>
      <div class="wi-panel-label">Rate Import (€)</div>
      <input type="number" placeholder="0.00" value="${row.partnerRateImp || ''}"
             oninput="_wiField(${row.id},'partnerRateImp',this.value)"
             style="width:105px;padding:6px 9px;font-size:11.5px;border-radius:6px;
                    border:1px solid var(--border-mid);background:var(--bg-card);
                    color:var(--text);outline:none"/>
    </div>` : '';

  // ── action buttons ───────────────────────────
  const actionsHtml = canFull ? `
    <div style="display:flex;flex-direction:column;gap:5px;padding-top:2px">
      ${row.saved
        ? `<button class="btn btn-primary" style="font-size:11px;padding:5px 16px"
                   onclick="_wiSaveTrip(${row.id})">Update Trip</button>
           <button class="btn btn-ghost" style="font-size:10px;padding:4px 16px;color:var(--danger)"
                   onclick="_wiDeleteTrip(${row.id})">Delete Trip</button>`
        : `<button class="btn btn-primary" style="font-size:11px;padding:5px 16px"
                   onclick="_wiSaveTrip(${row.id})">Create Trip</button>
           <button class="btn btn-ghost" style="font-size:10px;padding:4px 16px"
                   onclick="_wiSaveTrip(${row.id},true)">Export only</button>`
      }
    </div>` : '';

  return toggleHtml + ownedHtml + partnerHtml + actionsHtml;
}

/* ─────────────────────────────────────────────
   SEARCHABLE DROPDOWN
───────────────────────────────────────────── */
function _wiSdrop(prefix, rowId, arr, selectedId, placeholder) {
  const id       = `${prefix}_${rowId}`;
  const selLabel = arr.find(x => x.id === selectedId)?.label || '';
  const opts     = arr.map(x => {
    const lbl = (x.label || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `<div class="wi-sd-opt ${x.id === selectedId ? 'selected' : ''}"
                 data-id="${x.id}" data-lbl="${lbl}">${lbl}</div>`;
  }).join('');

  return `
    <div class="wi-sd" id="wsd-${id}">
      <input type="text" class="wi-sd-input"
             placeholder="${placeholder}"
             value="${selLabel.replace(/"/g, '&quot;')}"
             oninput="_wiSdFilter('${id}',this.value)"
             onfocus="_wiSdOpen('${id}')"
             autocomplete="off"/>
      <input type="hidden" id="wsd-val-${id}" value="${selectedId}"/>
      <div id="wsd-list-${id}" class="wi-sd-list">${opts}</div>
    </div>`;
}

// Event delegation for dropdown option picks
document.addEventListener('click', e => {
  const opt = e.target.closest('.wi-sd-opt');
  if (opt) {
    const list = opt.closest('.wi-sd-list');
    if (!list) return;
    const id    = list.id.replace('wsd-list-', '');
    const recId = opt.dataset.id;
    const label = opt.dataset.lbl || opt.textContent.trim();
    _wiSdPick(id, recId, label);
    e.stopPropagation();
    return;
  }
  if (!e.target.closest('.wi-sd')) {
    document.querySelectorAll('.wi-sd-list').forEach(el => el.style.display = 'none');
  }
});

function _wiSdOpen(id) {
  document.querySelectorAll('.wi-sd-list').forEach(el => {
    if (el.id !== 'wsd-list-' + id) el.style.display = 'none';
  });
  const inp  = document.querySelector(`#wsd-${id} .wi-sd-input`);
  const list = document.getElementById('wsd-list-' + id);
  if (!inp || !list) return;
  const r = inp.getBoundingClientRect();
  Object.assign(list.style, {
    display: 'block',
    left:    `${r.left}px`,
    top:     `${r.bottom + 2}px`,
    width:   `${Math.max(r.width, 220)}px`,
  });
  list.querySelectorAll('.wi-sd-opt').forEach(el => el.style.display = '');
}

function _wiSdFilter(id, q) {
  const list = document.getElementById('wsd-list-' + id);
  if (!list || list.style.display === 'none') _wiSdOpen(id);
  const ql = q.toLowerCase();
  list.querySelectorAll('.wi-sd-opt').forEach(el => {
    el.style.display = (el.dataset.lbl || el.textContent).toLowerCase().includes(ql) ? '' : 'none';
  });
}

function _wiSdPick(id, recId, label) {
  const valEl = document.getElementById('wsd-val-' + id);
  if (valEl) valEl.value = recId;
  const inp = document.querySelector(`#wsd-${id} .wi-sd-input`);
  if (inp) inp.value = label;
  const list = document.getElementById('wsd-list-' + id);
  if (list) list.style.display = 'none';
  // Map prefix to row field
  const parts  = id.split('_');
  const prefix = parts[0];
  const rowId  = parseInt(parts[parts.length - 1]);
  const map    = { tk: 'truckId', tl: 'trailerId', dr: 'driverId', pt: 'partnerId' };
  if (map[prefix] && !isNaN(rowId)) {
    _wiField(rowId, map[prefix], recId);
    // Also update display label fields
    const labelMap = { tk: 'truckPlate', tl: 'trailerPlate', dr: 'driverName', pt: 'partnerName' };
    _wiField(rowId, labelMap[prefix], label);
    // Repaint the assignment badge only
    _wiRepaintBadge(rowId);
  }
}

/* ─────────────────────────────────────────────
   ROW STATE MUTATIONS
───────────────────────────────────────────── */
function _wiField(rowId, field, val) {
  const row = WINTL.rows.find(r => r.id === rowId);
  if (row) { row[field] = val; row.dirty = !row.saved; }
}

function _wiSetCarrier(rowId, type) {
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row) return;
  row.carrierType = type;
  row.dirty = !row.saved;
  _wiRepaintPanel(rowId);
  _wiRepaintBadge(rowId);
}

/* ─────────────────────────────────────────────
   PARTIAL REPAINTS (avoid full re-render)
───────────────────────────────────────────── */
function _wiRepaintRow(rowId) {
  const el  = document.getElementById('wi-row-' + rowId);
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!el || !row) { _wiPaint(); return; }
  const idx = WINTL.rows.findIndex(r => r.id === rowId);
  el.outerHTML = _wiRowHTML(row, idx);
}

function _wiRepaintPanel(rowId) {
  const panelEl = document.querySelector(`#wi-row-${rowId} .wi-panel-inner`);
  const row = WINTL.rows.find(r => r.id === rowId);
  if (panelEl && row) panelEl.innerHTML = _wiPanelHTML(row);
  else _wiRepaintRow(rowId);
}

function _wiRepaintBadge(rowId) {
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row) return;
  const cell = document.querySelector(`#wi-row-${rowId} .wi-cell-asgn`);
  if (!cell) return;
  const plate   = row.truckPlate   || WINTL.data.trucks.find(t => t.id === row.truckId)?.label   || '';
  const driver  = row.driverName   || WINTL.data.drivers.find(d => d.id === row.driverId)?.label  || '';
  const partner = row.partnerName  || WINTL.data.partners.find(p => p.id === row.partnerId)?.label || '';
  if (row.carrierType === 'partner') {
    cell.innerHTML = partner
      ? `<div class="wi-asgn-partner">${partner}</div>`
      : `<span class="wi-asgn-empty">— no partner —</span>`;
  } else if (plate) {
    const surname = driver ? driver.trim().split(/\s+/).pop() : '';
    cell.innerHTML = `
      <div style="text-align:center">
        <div class="wi-asgn-plate">${plate}</div>
        ${surname ? `<div class="wi-asgn-driver">${surname}</div>` : ''}
      </div>`;
  } else {
    cell.innerHTML = `<span class="wi-asgn-empty">— pending —</span>`;
  }
}

/* ─────────────────────────────────────────────
   TOGGLE PANEL
───────────────────────────────────────────── */
function _wiTogglePanel(rowId) {
  const wasOpen = WINTL.ui.openPanel === rowId;
  WINTL.ui.openPanel = wasOpen ? null : rowId;
  // Repaint previous (close) + current (open/close)
  if (!wasOpen && WINTL.ui.openPanel !== null) {
    WINTL.rows.forEach(r => {
      if (r.id !== rowId) {
        const existing = document.querySelector(`#wi-row-${r.id} .wi-panel`);
        if (existing) _wiRepaintRow(r.id);
      }
    });
  }
  _wiRepaintRow(rowId);
}

/* ─────────────────────────────────────────────
   DRAG & DROP
───────────────────────────────────────────── */
window._wiDragging = null;

function _wiDragStart(e, impId) {
  window._wiDragging = impId;
  e.dataTransfer.effectAllowed = 'move';
}

function _wiDropHover(rowId, on) {
  const el = document.getElementById('wi-imp-' + rowId);
  if (el) el.classList.toggle('wi-drop-active', on);
}

function _wiDrop(e, rowId) {
  e.preventDefault();
  _wiDropHover(rowId, false);
  const impId = window._wiDragging;
  if (!impId) return;
  window._wiDragging = null;

  // Remove from shelf + any current row
  WINTL.shelf = WINTL.shelf.filter(r => r.id !== impId);
  WINTL.rows.forEach(r => { if (r.importId === impId) r.importId = null; });

  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row) return;

  // If row already has import → return it to shelf
  if (row.importId) {
    const old = WINTL.data.imports.find(r => r.id === row.importId);
    if (old && !WINTL.shelf.find(r => r.id === old.id)) WINTL.shelf.push(old);
  }

  row.importId = impId;
  row.dirty = !row.saved;
  _wiPaintShelf();
  _wiRepaintRow(rowId);
}

/* ─────────────────────────────────────────────
   CONTEXT MENU
───────────────────────────────────────────── */
function _wiCtx(e, rowId) {
  e.preventDefault(); e.stopPropagation();
  const row   = WINTL.rows.find(r => r.id === rowId);
  if (!row) return;
  const isGroup = row.exportIds.length > 1;
  const others  = WINTL.rows.filter(r => r.id !== rowId && !r.saved);

  const item = (label, fn, danger = false) =>
    `<button class="wi-ctx-item ${danger ? 'danger' : ''}" onclick="${fn};_wiCtxClose()">${label}</button>`;
  const sep  = () => `<div class="wi-ctx-sep"></div>`;
  const head = (t) => `<div class="wi-ctx-head">${t}</div>`;

  let html = '';

  if (others.length) {
    html += head('GROUPAGE');
    others.slice(0, 6).forEach(other => {
      const exp = WINTL.data.exports.find(r => r.id === other.exportIds[0]);
      const lbl = _wiClean(exp?.fields['Delivery Summary'] || `Row ${other.id}`).slice(0, 30);
      html += item(`🔗 Group with: ${lbl}`, `_wiMerge(${rowId},${other.id})`);
    });
  }
  if (isGroup) html += item('✂️ Split groupage', `_wiSplit(${rowId})`);

  html += sep();
  if (row.importId) html += item('✕ Remove import', `_wiRemoveImport(${rowId})`);
  html += item('↗ View export order', `_wiViewExport(${rowId})`);

  if (!row.saved) {
    html += sep();
    html += item('🗑 Remove row', `_wiDeleteRow(${rowId})`, true);
  }

  const ctx = document.getElementById('wi-ctx');
  ctx.innerHTML = html;
  Object.assign(ctx.style, {
    display: 'block',
    left:    `${Math.min(e.clientX, window.innerWidth - 220)}px`,
    top:     `${Math.min(e.clientY, window.innerHeight - 280)}px`,
  });
  setTimeout(() => document.addEventListener('click', _wiCtxClose, { once: true }), 10);
}

function _wiCtxClose() {
  const el = document.getElementById('wi-ctx');
  if (el) el.style.display = 'none';
}

/* ─────────────────────────────────────────────
   GROUPAGE
───────────────────────────────────────────── */
function _wiMerge(rowId, otherId) {
  const row = WINTL.rows.find(r => r.id === rowId);
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
  const exp0 = WINTL.data.exports.find(r => r.id === first);
  row.loadingDate = exp0?.fields['Loading DateTime'] || '';
  rest.forEach(expId => {
    const expR = WINTL.data.exports.find(r => r.id === expId);
    WINTL.rows.push({
      id: ++WINTL._seq, tripRecId: null, tripNo: '',
      exportIds: [expId], importId: null,
      truckId: '', trailerId: '', driverId: '', partnerId: '',
      truckPlate: '', trailerPlate: '', driverName: '', partnerName: '',
      loadingDate: expR?.fields['Loading DateTime'] || '',
      carrierType: 'owned', partnerRateExp: '', partnerRateImp: '',
      saved: false, dirty: false,
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

function _wiRemoveImport(rowId) {
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row || !row.importId) return;
  const imp = WINTL.data.imports.find(r => r.id === row.importId);
  if (imp && !WINTL.shelf.find(r => r.id === imp.id)) WINTL.shelf.push(imp);
  row.importId = null;
  _wiPaintShelf();
  _wiRepaintRow(rowId);
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

/* ─────────────────────────────────────────────
   SAVE / CREATE TRIP
───────────────────────────────────────────── */
async function _wiSaveTrip(rowId, exportOnly = false) {
  // Sync any dropdown hidden values into row before saving
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row) return;

  // Sync searchable dropdowns
  const syncDropdown = (prefix, field, labelField) => {
    const id  = `${prefix}_${rowId}`;
    const val = document.getElementById(`wsd-val-${id}`)?.value;
    const lbl = document.querySelector(`#wsd-${id} .wi-sd-input`)?.value;
    if (val) { row[field] = val; row[labelField] = lbl || ''; }
  };
  syncDropdown('tk', 'truckId',   'truckPlate');
  syncDropdown('tl', 'trailerId', 'trailerPlate');
  syncDropdown('dr', 'driverId',  'driverName');
  syncDropdown('pt', 'partnerId', 'partnerName');

  // Validation
  if (!row.exportIds.length) { toast('No export order on this row', 'warn'); return; }
  const isPartner = row.carrierType === 'partner';
  if (isPartner && !row.partnerId) { toast('Select a partner first', 'warn'); return; }

  const rowEl = document.getElementById('wi-row-' + rowId);
  if (rowEl) rowEl.classList.add('wi-saving');

  try {
    const fields = {
      'Export Order': row.exportIds,
      'Week Number':  WINTL.week,
    };
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
      // UPDATE existing trip
      await atPatch(TABLES.TRIPS, row.tripRecId, fields);
      toast('Trip updated ✓');
    } else {
      // CREATE new trip
      await atCreate(TABLES.TRIPS, fields);
      toast(exportOnly ? 'Export-only trip created ✓' : 'Trip created ✓');
    }

    WINTL.ui.openPanel = null;
    WINTL._assetsOk = true;
    await renderWeeklyIntl();
  } catch (err) {
    if (rowEl) rowEl.classList.remove('wi-saving');
    alert('Save failed: ' + err.message);
  }
}

async function _wiDeleteTrip(rowId) {
  const row = WINTL.rows.find(r => r.id === rowId);
  if (!row?.tripRecId) return;
  if (!confirm('Delete this trip? This cannot be undone.')) return;
  try {
    await atDelete(TABLES.TRIPS, row.tripRecId);
    toast('Trip deleted');
    WINTL._assetsOk = true;
    await renderWeeklyIntl();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

/* ─────────────────────────────────────────────
   NAVIGATION
───────────────────────────────────────────── */
function _wiNavWeek(delta) {
  WINTL.week = Math.max(1, Math.min(53, WINTL.week + delta));
  WINTL.ui.openPanel = null;
  WINTL._assetsOk = true;
  renderWeeklyIntl();
}
