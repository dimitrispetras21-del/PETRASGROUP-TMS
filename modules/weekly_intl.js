// ═══════════════════════════════════════════════
// WEEKLY INTERNATIONAL
// Layout: Export Pool | Trip Rows | Import Pool
// Each trip row: N exports + assignment + N imports
// ═══════════════════════════════════════════════

const WINTL = {
  week: _wiCurrentWeek(),
  exports: [], imports: [],
  // Pool = unassigned
  exportPool: [], importPool: [],
  // Trip rows built by dispatcher
  tripRows: [], // [{id, exportIds:[], importIds:[], truckId, trailerId, driverId, partnerId, carrierType}]
  trucks:[], trailers:[], drivers:[], partners:[],
  assetsLoaded: false,
  _rowCounter: 0,
};

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
  const monday = new Date(base);
  monday.setDate(base.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const f = d => d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
  return `${f(monday)} – ${f(sunday)}`;
}

async function _wiLoadAssets() {
  if (WINTL.assetsLoaded) return;
  const [trucks, trailers, drivers, partners] = await Promise.all([
    atGetAll(TABLES.TRUCKS,   { fields: ['License Plate'], filterByFormula: "{Active}=TRUE()" }),
    atGetAll(TABLES.TRAILERS, { fields: ['Plate'],          filterByFormula: "{Active}=TRUE()" }),
    atGetAll(TABLES.DRIVERS,  { fields: ['Full Name'],      filterByFormula: "{Active}=TRUE()" }),
    atGetAll(TABLES.PARTNERS, { fields: ['Company Name'] }),
  ]);
  WINTL.trucks   = trucks.map(r => ({ id: r.id, label: r.fields['License Plate'] || r.id }));
  WINTL.trailers = trailers.map(r => ({ id: r.id, label: r.fields['Plate'] || r.id }));
  WINTL.drivers  = drivers.map(r => ({ id: r.id, label: r.fields['Full Name'] || r.id }));
  WINTL.partners = partners.map(r => ({ id: r.id, label: r.fields['Company Name'] || r.id }));
  WINTL.assetsLoaded = true;
}

// ── Main entry ─────────────────────────────────
async function renderWeeklyIntl() {
  if (!checkPerm('planning', 'view')) return renderAccessDenied();
  setTitle('Weekly International', `Week ${WINTL.week}`);
  setContent(`<div class="loading"><span class="spinner"></span> Loading...</div>`);
  try {
    await _wiLoadAssets();
    const formula = `AND({Type}='International',{ Week Number}=${WINTL.week})`;
    const all = await atGetAll(TABLES.ORDERS, { filterByFormula: formula });
    WINTL.exports = all.filter(r => r.fields.Direction === 'Export').sort((a, b) =>
      (a.fields['Delivery DateTime'] || '').localeCompare(b.fields['Delivery DateTime'] || ''));
    WINTL.imports = all.filter(r => r.fields.Direction === 'Import');
    _wiBuildInitialRows();
    _wiRender();
  } catch (e) {
    setContent(`<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`);
  }
}

// Build initial state: existing trips → trip rows, rest → pools
function _wiBuildInitialRows() {
  WINTL.tripRows = [];
  WINTL._rowCounter = 0;
  const usedExports = new Set();
  const usedImports = new Set();

  // Find all unique trip IDs across orders
  const tripMap = {}; // tripId → {exports:[], imports:[]}
  [...WINTL.exports, ...WINTL.imports].forEach(r => {
    (r.fields['TRIPS (Import Order)'] || []).forEach(tripId => {
      if (!tripMap[tripId]) tripMap[tripId] = { exports: [], imports: [] };
      if (r.fields.Direction === 'Export') tripMap[tripId].exports.push(r.id);
      else tripMap[tripId].imports.push(r.id);
    });
  });

  // Build one trip row per existing trip
  Object.entries(tripMap).forEach(([, v]) => {
    v.exports.forEach(id => usedExports.add(id));
    v.imports.forEach(id => usedImports.add(id));
    WINTL.tripRows.push({
      id: ++WINTL._rowCounter,
      exportIds: v.exports,
      importIds: v.imports,
      truckId: '', trailerId: '', driverId: '', partnerId: '', carrierType: 'owned',
      saved: true,
    });
  });

  WINTL.exportPool = WINTL.exports.filter(r => !usedExports.has(r.id));
  WINTL.importPool = WINTL.imports.filter(r => !usedImports.has(r.id));
}

// ── Render ─────────────────────────────────────
function _wiRender() {
  const EP = WINTL.exportPool;
  const IP = WINTL.importPool;
  const TR = WINTL.tripRows;

  setContent(`
    <!-- Header -->
    <div class="page-header" style="margin-bottom:14px">
      <div>
        <div class="page-title">Weekly International</div>
        <div class="page-sub">Week ${WINTL.week} · ${_wiWeekRange(WINTL.week)} · ${WINTL.exports.length} exports · ${WINTL.imports.length} imports · ${TR.length} trip rows</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="renderWeeklyIntl()">↺ Refresh</button>
        ${checkPerm('planning', 'full') ? `<button class="btn btn-primary" onclick="_wiAddRow()">+ New Trip Row</button>` : ''}
      </div>
    </div>

    <!-- Week nav -->
    <div style="display:flex;align-items:center;justify-content:center;gap:24px;margin-bottom:18px">
      <button class="btn btn-ghost" style="padding:6px 20px" onclick="_wiNavWeek(-1)">← Prev</button>
      <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700">Week ${WINTL.week}</div>
      <button class="btn btn-ghost" style="padding:6px 20px" onclick="_wiNavWeek(1)">Next →</button>
    </div>

    <!-- 3-column layout -->
    <div style="display:grid;grid-template-columns:240px 1fr 240px;gap:14px;align-items:start">

      <!-- LEFT: Export Pool -->
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--success);margin-bottom:8px;padding:0 2px">
          ↑ Exports (${EP.length} unassigned)
        </div>
        <div id="wi_exp_pool" style="min-height:80px"
             ondragover="event.preventDefault()"
             ondrop="_wiDropToPool(event,'export')">
          ${EP.length ? EP.map(r => _wiOrderChip(r, 'export')).join('') :
            `<div style="padding:16px;text-align:center;font-size:12px;color:var(--text-dim);border:2px dashed var(--border);border-radius:8px">All exports assigned ✓</div>`}
        </div>
      </div>

      <!-- CENTER: Trip Rows -->
      <div>
        ${TR.length ? TR.map(row => _wiTripRow(row)).join('') :
          `<div style="padding:40px;text-align:center;color:var(--text-dim);font-size:13px;border:2px dashed var(--border);border-radius:10px">
            Click <strong>+ New Trip Row</strong> to start planning
          </div>`}
      </div>

      <!-- RIGHT: Import Pool -->
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--warning);margin-bottom:8px;padding:0 2px">
          ↓ Imports (${IP.length} unassigned)
        </div>
        <div id="wi_imp_pool" style="min-height:80px"
             ondragover="event.preventDefault()"
             ondrop="_wiDropToPool(event,'import')">
          ${IP.length ? IP.map(r => _wiOrderChip(r, 'import')).join('') :
            `<div style="padding:16px;text-align:center;font-size:12px;color:var(--text-dim);border:2px dashed var(--border);border-radius:8px">All imports assigned ✓</div>`}
        </div>
      </div>
    </div>
  `);

  window._wiDragging = null;
}

// ── Order Chip (pool items, draggable) ─────────
function _wiOrderChip(r, dir) {
  const f = r.fields;
  const loading  = _wiClean(f['Loading Summary']  || '—').substring(0, 26);
  const delivery = _wiClean(f['Delivery Summary'] || '—').substring(0, 22);
  const pals  = f['Total Pallets'] || 0;
  const delDt = _wiFmt(f['Delivery DateTime']);
  const veroia = f['Veroia Switch '];
  const accent = dir === 'export' ? 'var(--success)' : 'rgba(217,119,6,0.8)';
  const bg     = dir === 'export' ? 'rgba(5,150,105,0.05)' : 'rgba(217,119,6,0.05)';
  const border = dir === 'export' ? 'rgba(5,150,105,0.2)'  : 'rgba(217,119,6,0.2)';

  return `
    <div draggable="true" data-orderid="${r.id}" data-dir="${dir}"
         ondragstart="_wiDragStart(event,'${r.id}','${dir}')"
         style="background:${bg};border:1px solid ${border};border-radius:8px;
                padding:8px 10px;margin-bottom:8px;cursor:grab;
                transition:opacity 0.15s,box-shadow 0.15s"
         onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'"
         onmouseout="this.style.boxShadow=''">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px;margin-bottom:3px">
        <div style="font-size:11px;font-weight:600;color:var(--text);line-height:1.3">${loading}</div>
        ${veroia ? `<span style="font-size:9px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 4px;white-space:nowrap;flex-shrink:0">🔄</span>` : ''}
      </div>
      <div style="font-size:10px;color:var(--text-dim)">→ ${delivery}</div>
      <div style="font-size:10px;color:var(--text-mid);margin-top:3px;display:flex;gap:8px">
        <span>${delDt}</span><span>📦 ${pals} pal</span>
      </div>
    </div>`;
}

// ── Trip Row ───────────────────────────────────
function _wiTripRow(row) {
  const expCards = row.exportIds.map(id => {
    const r = WINTL.exports.find(x => x.id === id);
    return r ? _wiInRowChip(r, 'export', row.id) : '';
  }).join('');
  const impCards = row.importIds.map(id => {
    const r = WINTL.imports.find(x => x.id === id);
    return r ? _wiInRowChip(r, 'import', row.id) : '';
  }).join('');

  const tripCount = row.exportIds.length + row.importIds.length;
  const totalPalExp = row.exportIds.reduce((s,id)=>{
    const r=WINTL.exports.find(x=>x.id===id); return s+(r?.fields['Total Pallets']||0);},0);
  const totalPalImp = row.importIds.reduce((s,id)=>{
    const r=WINTL.imports.find(x=>x.id===id); return s+(r?.fields['Total Pallets']||0);},0);

  const isPartner = row.carrierType === 'partner';
  const sel = (arr, val, placeholder, field) =>
    `<select class="form-select" style="font-size:11px;padding:5px 7px;margin-bottom:4px;width:100%"
       onchange="_wiRowField(${row.id},'${field}',this.value)">
      <option value="">${placeholder}</option>
      ${arr.map(x=>`<option value="${x.id}" ${x.id===val?'selected':''}>${x.label}</option>`).join('')}
    </select>`;

  return `
  <div id="wi_row_${row.id}" style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;margin-bottom:12px;overflow:hidden">
    <!-- Row header -->
    <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--bg);border-bottom:1px solid var(--border)">
      <span style="font-size:11px;font-weight:600;color:var(--text-dim)">Trip Row ${row.id}</span>
      ${row.saved ? `<span class="badge badge-green" style="font-size:10px">On Trip</span>` : ''}
      <span style="font-size:11px;color:var(--text-dim);margin-left:4px">
        ${row.exportIds.length} exp · ${row.importIds.length} imp · ${totalPalExp}↑/${totalPalImp}↓ pal
      </span>
      <button onclick="_wiDeleteRow(${row.id})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;margin-left:auto;font-size:12px;padding:2px 6px" title="Remove row">✕</button>
    </div>

    <!-- 3 columns inside row -->
    <div style="display:grid;grid-template-columns:1fr 180px 1fr;min-height:80px">

      <!-- Export drop zone -->
      <div id="wi_row_${row.id}_exp"
           style="padding:10px;border-right:1px solid var(--border)"
           ondragover="event.preventDefault();_wiZoneHover('wi_row_${row.id}_exp',true,'export')"
           ondragleave="_wiZoneHover('wi_row_${row.id}_exp',false,'export')"
           ondrop="_wiDropToRow(event,${row.id},'export')">
        <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--success);margin-bottom:6px">↑ Export</div>
        ${expCards}
        <div style="font-size:10px;color:var(--text-dim);border:1.5px dashed rgba(5,150,105,0.2);border-radius:6px;padding:6px;text-align:center;margin-top:${row.exportIds.length?'6px':'0'}">+ drop export</div>
      </div>

      <!-- Assignment -->
      <div style="padding:10px;border-right:1px solid var(--border);background:var(--bg)">
        <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px">Assignment</div>
        <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;margin-bottom:6px;color:var(--text-mid)">
          <input type="checkbox" ${isPartner?'checked':''} onchange="_wiRowCarrier(${row.id},this.checked)"> Partner
        </label>
        ${!isPartner ? `
          ${sel(WINTL.trucks,   row.truckId,   'Truck',   'truckId')}
          ${sel(WINTL.trailers, row.trailerId, 'Trailer', 'trailerId')}
          ${sel(WINTL.drivers,  row.driverId,  'Driver',  'driverId')}
        ` : `
          ${sel(WINTL.partners, row.partnerId, 'Partner', 'partnerId')}
        `}
        ${checkPerm('planning', 'full') ? `
        <button class="btn btn-primary" style="width:100%;font-size:11px;padding:5px;margin-top:4px"
                onclick="_wiCreateTrip(${row.id})">🔗 Create Trip</button>
        <button class="btn btn-ghost" style="width:100%;font-size:10px;padding:4px;margin-top:3px"
                onclick="_wiCreateTripExportOnly(${row.id})">Export only →</button>` : ''}
      </div>

      <!-- Import drop zone -->
      <div id="wi_row_${row.id}_imp"
           style="padding:10px"
           ondragover="event.preventDefault();_wiZoneHover('wi_row_${row.id}_imp',true,'import')"
           ondragleave="_wiZoneHover('wi_row_${row.id}_imp',false,'import')"
           ondrop="_wiDropToRow(event,${row.id},'import')">
        <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(217,119,6,0.8);margin-bottom:6px">↓ Import</div>
        ${impCards}
        <div style="font-size:10px;color:var(--text-dim);border:1.5px dashed rgba(217,119,6,0.2);border-radius:6px;padding:6px;text-align:center;margin-top:${row.importIds.length?'6px':'0'}">+ drop import</div>
      </div>
    </div>
  </div>`;
}

// ── In-row chip (draggable back to pool) ───────
function _wiInRowChip(r, dir, rowId) {
  const f = r.fields;
  const loading  = _wiClean(f['Loading Summary']  || '—').substring(0, 22);
  const delivery = _wiClean(f['Delivery Summary'] || '—').substring(0, 18);
  const pals  = f['Total Pallets'] || 0;
  const bg     = dir === 'export' ? 'rgba(5,150,105,0.07)' : 'rgba(217,119,6,0.07)';
  const border = dir === 'export' ? 'rgba(5,150,105,0.2)'  : 'rgba(217,119,6,0.2)';

  return `
    <div draggable="true" data-orderid="${r.id}" data-dir="${dir}"
         ondragstart="_wiDragStart(event,'${r.id}','${dir}')"
         style="background:${bg};border:1px solid ${border};border-radius:6px;
                padding:6px 8px;margin-bottom:4px;cursor:grab;position:relative"
         onmouseover="this.querySelector('.wi-remove').style.opacity='1'"
         onmouseout="this.querySelector('.wi-remove').style.opacity='0'">
      <button class="wi-remove" onclick="_wiRemoveFromRow(${rowId},'${r.id}','${dir}')"
              style="position:absolute;top:3px;right:4px;background:none;border:none;
                     font-size:10px;color:var(--text-dim);cursor:pointer;opacity:0;transition:opacity 0.15s;padding:0">✕</button>
      <div style="font-size:11px;font-weight:600;color:var(--text);padding-right:12px">${loading}</div>
      <div style="font-size:10px;color:var(--text-dim)">→ ${delivery} · ${pals} pal</div>
    </div>`;
}

// ── Drag & Drop ────────────────────────────────
function _wiDragStart(e, orderId, dir) {
  window._wiDragging = { orderId, dir };
  e.dataTransfer.effectAllowed = 'move';
}

function _wiZoneHover(elId, on, dir) {
  const el = document.getElementById(elId);
  if (!el) return;
  const bg = dir === 'export' ? 'rgba(5,150,105,0.04)' : 'rgba(217,119,6,0.04)';
  el.style.background = on ? bg : '';
}

function _wiDropToRow(e, rowId, dir) {
  e.preventDefault();
  _wiZoneHover(`wi_row_${rowId}_${dir==='export'?'exp':'imp'}`, false, dir);
  const drag = window._wiDragging;
  if (!drag) return;
  if (drag.dir !== dir) { toast(`Drop only ${dir}s here`); return; }
  window._wiDragging = null;
  _wiMoveOrderToRow(drag.orderId, dir, rowId);
}

function _wiDropToPool(e, dir) {
  e.preventDefault();
  const drag = window._wiDragging;
  if (!drag || drag.dir !== dir) return;
  window._wiDragging = null;
  _wiReturnOrderToPool(drag.orderId, dir);
}

function _wiMoveOrderToRow(orderId, dir, rowId) {
  // Remove from all pools and rows first
  WINTL.exportPool = WINTL.exportPool.filter(r => r.id !== orderId);
  WINTL.importPool = WINTL.importPool.filter(r => r.id !== orderId);
  WINTL.tripRows.forEach(row => {
    row.exportIds = row.exportIds.filter(id => id !== orderId);
    row.importIds = row.importIds.filter(id => id !== orderId);
  });
  // Add to target row
  const row = WINTL.tripRows.find(r => r.id === rowId);
  if (!row) return;
  if (dir === 'export' && !row.exportIds.includes(orderId)) row.exportIds.push(orderId);
  if (dir === 'import' && !row.importIds.includes(orderId)) row.importIds.push(orderId);
  _wiRender();
}

function _wiReturnOrderToPool(orderId, dir) {
  // Remove from all rows
  WINTL.tripRows.forEach(row => {
    row.exportIds = row.exportIds.filter(id => id !== orderId);
    row.importIds = row.importIds.filter(id => id !== orderId);
  });
  // Add back to pool if not already there
  if (dir === 'export') {
    if (!WINTL.exportPool.find(r => r.id === orderId)) {
      const o = WINTL.exports.find(r => r.id === orderId);
      if (o) WINTL.exportPool.push(o);
    }
  } else {
    if (!WINTL.importPool.find(r => r.id === orderId)) {
      const o = WINTL.imports.find(r => r.id === orderId);
      if (o) WINTL.importPool.push(o);
    }
  }
  _wiRender();
}

function _wiRemoveFromRow(rowId, orderId, dir) {
  _wiReturnOrderToPool(orderId, dir);
}

// ── Row management ─────────────────────────────
function _wiAddRow() {
  WINTL.tripRows.push({
    id: ++WINTL._rowCounter,
    exportIds: [], importIds: [],
    truckId: '', trailerId: '', driverId: '', partnerId: '',
    carrierType: 'owned', saved: false,
  });
  _wiRender();
  // Scroll to bottom
  setTimeout(() => {
    const el = document.getElementById(`wi_row_${WINTL._rowCounter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

function _wiDeleteRow(rowId) {
  const row = WINTL.tripRows.find(r => r.id === rowId);
  if (!row) return;
  // Return orders to pools
  row.exportIds.forEach(id => {
    if (!WINTL.exportPool.find(r => r.id === id)) {
      const o = WINTL.exports.find(r => r.id === id);
      if (o) WINTL.exportPool.push(o);
    }
  });
  row.importIds.forEach(id => {
    if (!WINTL.importPool.find(r => r.id === id)) {
      const o = WINTL.imports.find(r => r.id === id);
      if (o) WINTL.importPool.push(o);
    }
  });
  WINTL.tripRows = WINTL.tripRows.filter(r => r.id !== rowId);
  _wiRender();
}

function _wiRowField(rowId, field, val) {
  const row = WINTL.tripRows.find(r => r.id === rowId);
  if (row) row[field] = val;
}

function _wiRowCarrier(rowId, isPartner) {
  const row = WINTL.tripRows.find(r => r.id === rowId);
  if (row) row.carrierType = isPartner ? 'partner' : 'owned';
  _wiRender();
}

// ── Navigation ─────────────────────────────────
function _wiNavWeek(delta) {
  WINTL.week = Math.max(1, Math.min(52, WINTL.week + delta));
  WINTL.assetsLoaded = true;
  renderWeeklyIntl();
}

// ── Create Trip ────────────────────────────────
async function _wiCreateTrip(rowId) {
  const row = WINTL.tripRows.find(r => r.id === rowId);
  if (!row) return;
  const isPartner = row.carrierType === 'partner';

  if (!row.exportIds.length) { toast('Πρόσθεσε τουλάχιστον 1 Export'); return; }
  if (isPartner && !row.partnerId) { toast('Επίλεξε Partner'); return; }
  if (!isPartner && (!row.truckId || !row.trailerId || !row.driverId)) {
    toast('Επίλεξε Truck, Trailer και Driver'); return;
  }

  const btn = document.querySelector(`#wi_row_${rowId} .btn-primary`);
  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

  try {
    // One TRIPS record per export (standard) — with all imports linked
    // OR one record for the whole row if groupage
    const fields = {
      'Export Order': row.exportIds,    // linked records array
      'Week Number':  WINTL.week,
    };
    if (row.importIds.length) fields['Import Order'] = row.importIds;
    if (isPartner) {
      if (row.partnerId) fields['Partner'] = [row.partnerId];
    } else {
      if (row.truckId)   fields['Truck']   = [row.truckId];
      if (row.trailerId) fields['Trailer'] = [row.trailerId];
      if (row.driverId)  fields['Driver']  = [row.driverId];
    }
    await atCreate(TABLES.TRIPS, fields);
    toast('Trip created ✓');
    WINTL.assetsLoaded = true;
    await renderWeeklyIntl();
  } catch (e) {
    alert('Error: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '🔗 Create Trip'; }
  }
}

async function _wiCreateTripExportOnly(rowId) {
  const row = WINTL.tripRows.find(r => r.id === rowId);
  if (!row) return;
  const isPartner = row.carrierType === 'partner';

  if (!row.exportIds.length) { toast('Πρόσθεσε τουλάχιστον 1 Export'); return; }
  if (isPartner && !row.partnerId) { toast('Επίλεξε Partner'); return; }
  if (!isPartner && (!row.truckId || !row.trailerId || !row.driverId)) {
    toast('Επίλεξε Truck, Trailer και Driver'); return;
  }

  try {
    const fields = {
      'Export Order': row.exportIds,
      'Week Number':  WINTL.week,
    };
    if (isPartner) {
      if (row.partnerId) fields['Partner'] = [row.partnerId];
    } else {
      if (row.truckId)   fields['Truck']   = [row.truckId];
      if (row.trailerId) fields['Trailer'] = [row.trailerId];
      if (row.driverId)  fields['Driver']  = [row.driverId];
    }
    await atCreate(TABLES.TRIPS, fields);
    toast('Export-only trip created ✓');
    WINTL.assetsLoaded = true;
    await renderWeeklyIntl();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

// ── Helpers ────────────────────────────────────
function _wiFmt(s) {
  if (!s) return '—';
  const p = s.split('-');
  return `${p[2]}/${p[1]}`;
}

function _wiClean(s) {
  return (s || '').replace(/^['"]+/, '').replace(/\/+$/, '').trim();
}
