// ═══════════════════════════════════════════════
// WEEKLY INTERNATIONAL
// Layout: Export (locked, by del.date) | Assign | Import (draggable)
// ═══════════════════════════════════════════════

const WINTL = {
  week: _wiCurrentWeek(),
  exports: [], imports: [], rows: [],
  trucks:[], trailers:[], drivers:[], partners:[],
  assetsLoaded: false,
  _unmatchedImports: [],
};

function _wiCurrentWeek() {
  const d = new Date(), y = d.getFullYear();
  const jan1 = new Date(y, 0, 1);
  return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
}

function _wiWeekRange(w) {
  const y = new Date().getFullYear();
  const jan1 = new Date(y, 0, 1);
  const base = new Date(jan1.getTime() + (w-1)*7*86400000);
  const day = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - (day===0?6:day-1));
  const sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
  const f = d => d.toLocaleDateString('el-GR',{day:'numeric',month:'short'});
  return `${f(monday)} – ${f(sunday)}`;
}

async function _wiLoadAssets() {
  if (WINTL.assetsLoaded) return;
  const [trucks, trailers, drivers, partners] = await Promise.all([
    atGetAll(TABLES.TRUCKS,   {fields:['License Plate'], filterByFormula:"{Active}=TRUE()"}),
    atGetAll(TABLES.TRAILERS, {fields:['Plate'],         filterByFormula:"{Active}=TRUE()"}),
    atGetAll(TABLES.DRIVERS,  {fields:['Full Name'],     filterByFormula:"{Active}=TRUE()"}),
    atGetAll(TABLES.PARTNERS, {fields:['Company Name']}),
  ]);
  WINTL.trucks   = trucks.map(r=>({id:r.id,  label:r.fields['License Plate']||r.id}));
  WINTL.trailers = trailers.map(r=>({id:r.id, label:r.fields['Plate']||r.id}));
  WINTL.drivers  = drivers.map(r=>({id:r.id,  label:r.fields['Full Name']||r.id}));
  WINTL.partners = partners.map(r=>({id:r.id, label:r.fields['Company Name']||r.id}));
  WINTL.assetsLoaded = true;
}

async function renderWeeklyIntl() {
  if (!checkPerm('planning','view')) return renderAccessDenied();
  setTitle('Weekly International', `Week ${WINTL.week}`);
  setContent(`<div class="loading"><span class="spinner"></span> Loading...</div>`);
  try {
    await _wiLoadAssets();
    const formula = `AND({Type}='International',{ Week Number}=${WINTL.week})`;
    const all = await atGetAll(TABLES.ORDERS, {filterByFormula: formula});
    WINTL.exports = all.filter(r=>r.fields.Direction==='Export').sort((a,b)=>{
      return (a.fields['Delivery DateTime']||'').localeCompare(b.fields['Delivery DateTime']||'');
    });
    WINTL.imports = all.filter(r=>r.fields.Direction==='Import');
    _wiBuildRows();
    _wiRender();
  } catch(e) {
    setContent(`<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`);
  }
}

function _wiBuildRows() {
  const usedImports = new Set();
  WINTL.rows = WINTL.exports.map(exp => {
    const expTrips = exp.fields['TRIPS (Import Order)'] || [];
    let matchedImport = null;
    if (expTrips.length) {
      matchedImport = WINTL.imports.find(imp =>
        (imp.fields['TRIPS (Import Order)']||[]).some(t => expTrips.includes(t))
      ) || null;
    }
    if (matchedImport) usedImports.add(matchedImport.id);
    return { exportId:exp.id, importId:matchedImport?.id||null,
             truckId:'', trailerId:'', driverId:'', partnerId:'', carrierType:'owned' };
  });
  WINTL._unmatchedImports = WINTL.imports.filter(r=>!usedImports.has(r.id));
}

function _wiRender() {
  const E = WINTL.exports;
  const I = WINTL._unmatchedImports;

  setContent(`
    <div class="page-header" style="margin-bottom:16px">
      <div>
        <div class="page-title">Weekly International</div>
        <div class="page-sub">Week ${WINTL.week} · ${_wiWeekRange(WINTL.week)} · ${E.length} exports · ${WINTL.imports.length} imports</div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" onclick="renderWeeklyIntl()">↺ Refresh</button>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:center;gap:24px;margin-bottom:20px">
      <button class="btn btn-ghost" style="padding:6px 20px" onclick="_wiNavWeek(-1)">← Prev</button>
      <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700">Week ${WINTL.week}</div>
      <button class="btn btn-ghost" style="padding:6px 20px" onclick="_wiNavWeek(1)">Next →</button>
    </div>

    <!-- Import drag pool -->
    ${I.length ? `
    <div style="margin-bottom:16px;background:var(--bg-card);border:1px solid rgba(217,119,6,0.2);border-radius:10px;padding:12px 16px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--warning);margin-bottom:10px">
        ↓ Import Pool — ${I.length} unmatched · drag to match
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${I.map(r=>_wiImportMini(r)).join('')}
      </div>
    </div>` : `
    <div style="margin-bottom:16px;padding:8px 14px;background:var(--success-bg);border:1px solid rgba(5,150,105,0.2);border-radius:8px;font-size:12px;color:var(--success)">
      ✓ All imports matched
    </div>`}

    <!-- Matrix table -->
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg-card)">
      <!-- Header -->
      <div style="display:grid;grid-template-columns:1fr 200px 1fr;background:var(--bg)">
        <div style="padding:10px 16px;border-right:1px solid var(--border)">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--success)">↑ Export (${E.length})</span>
          <span style="font-size:10px;color:var(--text-dim);margin-left:6px">sorted by delivery · locked</span>
        </div>
        <div style="padding:10px 16px;border-right:1px solid var(--border);text-align:center">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim)">Assignment</span>
        </div>
        <div style="padding:10px 16px">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--warning)">↓ Import</span>
          <span style="font-size:10px;color:var(--text-dim);margin-left:6px">drop here to match</span>
        </div>
      </div>

      ${WINTL.rows.length ? WINTL.rows.map((row,i) => _wiMatrixRow(row,i)).join('') :
        `<div class="empty-state" style="padding:60px"><div class="icon">📋</div><p>No export orders this week</p></div>`}
    </div>
  `);

  window._wiDragging = null;
}

function _wiMatrixRow(row, i) {
  const exp = WINTL.exports.find(r=>r.id===row.exportId);
  const imp = row.importId ? WINTL.imports.find(r=>r.id===row.importId) : null;
  const hasTrip = (exp?.fields['TRIPS (Import Order)']||[]).length > 0;

  return `
  <div style="display:grid;grid-template-columns:1fr 200px 1fr;border-top:1px solid var(--border)">
    <!-- Export (locked) -->
    <div style="padding:12px 16px;border-right:1px solid var(--border);background:${hasTrip?'var(--success-bg)':''}">
      ${_wiExportCard(exp)}
    </div>
    <!-- Assignment -->
    <div style="padding:10px 12px;border-right:1px solid var(--border);background:var(--bg)">
      ${_wiAssignPanel(row, i)}
    </div>
    <!-- Import drop zone -->
    <div id="wi_drop_${i}" style="padding:12px 16px;min-height:90px;transition:background 0.15s"
         ondragover="event.preventDefault();_wiDropHover(${i},true)"
         ondragleave="_wiDropHover(${i},false)"
         ondrop="_wiDrop(event,${i})">
      ${imp ? _wiImportCard(imp, i) :
        `<div style="height:100%;min-height:70px;display:flex;align-items:center;justify-content:center;
                     border:2px dashed var(--border);border-radius:8px;color:var(--text-dim);font-size:12px">
          ↓ Drop import
         </div>`}
    </div>
  </div>`;
}

function _wiExportCard(r) {
  if (!r) return '';
  const f = r.fields;
  const veroia = f['Veroia Switch '];
  const loadDt   = _wiFmt(f['Loading DateTime']);
  const delDt    = _wiFmt(f['Delivery DateTime']);
  const loading  = _wiClean(f['Loading Summary']  || '—');
  const delivery = _wiClean(f['Delivery Summary'] || '—');
  const pals     = f['Total Pallets'] || 0;
  const hasTrip  = (f['TRIPS (Import Order)']||[]).length > 0;

  return `
    <div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap">
      <span style="font-size:11px">🔒</span>
      ${hasTrip ? `<span class="badge badge-green" style="font-size:10px">On Trip</span>` : `<span class="badge badge-yellow" style="font-size:10px">Pending</span>`}
      ${veroia ? `<span class="badge badge-grey" style="font-size:10px">🔄 Veroia</span>` : ''}
    </div>
    <div style="font-size:13px;font-weight:600;color:var(--text);line-height:1.3;margin-bottom:3px">${loading}</div>
    <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">→ ${delivery}</div>
    <div style="font-size:11px;color:var(--text-mid);display:flex;gap:10px">
      <span>📅 ${loadDt}→${delDt}</span><span>📦 ${pals} pal</span>
    </div>`;
}

function _wiImportCard(r, rowIdx) {
  const f = r.fields;
  const loading  = _wiClean(f['Loading Summary']  || '—');
  const delivery = _wiClean(f['Delivery Summary'] || '—');
  const pals     = f['Total Pallets'] || 0;
  const loadDt   = _wiFmt(f['Loading DateTime']);
  const delDt    = _wiFmt(f['Delivery DateTime']);

  return `
    <div draggable="true" data-impid="${r.id}" ondragstart="_wiDragStart(event,'${r.id}')"
         style="background:rgba(217,119,6,0.06);border:1px solid rgba(217,119,6,0.2);border-radius:8px;padding:10px;cursor:grab">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span class="badge badge-yellow" style="font-size:10px">Matched ✓</span>
        <button onclick="_wiUnmatch(${rowIdx})" style="background:none;border:none;font-size:11px;color:var(--text-dim);cursor:pointer;padding:2px 4px">✕</button>
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--text)">${loading}</div>
      <div style="font-size:11px;color:var(--text-dim)">→ ${delivery}</div>
      <div style="font-size:11px;color:var(--text-mid);margin-top:4px">📅 ${loadDt}→${delDt} · 📦 ${pals} pal</div>
    </div>`;
}

function _wiImportMini(r) {
  const f = r.fields;
  const loading  = _wiClean(f['Loading Summary'] ||'—').substring(0,28);
  const delivery = _wiClean(f['Delivery Summary']||'—').substring(0,22);
  const pals     = f['Total Pallets'] || 0;
  const delDt    = _wiFmt(f['Delivery DateTime']);

  return `
    <div draggable="true" data-impid="${r.id}" ondragstart="_wiDragStart(event,'${r.id}')"
         style="background:rgba(217,119,6,0.06);border:1px solid rgba(217,119,6,0.25);
                border-radius:8px;padding:8px 10px;cursor:grab;min-width:160px;max-width:220px">
      <div style="font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${loading}</div>
      <div style="font-size:10px;color:var(--text-dim)">→ ${delivery}</div>
      <div style="font-size:10px;color:var(--text-mid);margin-top:2px">${delDt} · ${pals} pal</div>
    </div>`;
}

function _wiAssignPanel(row, i) {
  const sel = (arr, val, placeholder, field) =>
    `<select class="form-select" style="font-size:11px;padding:5px 8px;margin-bottom:5px;width:100%"
       onchange="_wiRowChange(${i},'${field}',this.value)">
      <option value="">${placeholder}</option>
      ${arr.map(x=>`<option value="${x.id}" ${x.id===val?'selected':''}>${x.label}</option>`).join('')}
    </select>`;

  const isPartner = row.carrierType === 'partner';

  return `
    <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;margin-bottom:6px;color:var(--text-mid)">
      <input type="checkbox" ${isPartner?'checked':''} onchange="_wiRowCarrier(${i},this.checked)"> Partner trip
    </label>
    ${!isPartner ? `
      ${sel(WINTL.trucks,   row.truckId,   'Truck',   'truckId')}
      ${sel(WINTL.trailers, row.trailerId, 'Trailer', 'trailerId')}
      ${sel(WINTL.drivers,  row.driverId,  'Driver',  'driverId')}
    ` : `
      ${sel(WINTL.partners, row.partnerId, 'Partner', 'partnerId')}
    `}
    ${checkPerm('planning','full') ? `
    <button class="btn btn-primary" style="width:100%;font-size:11px;padding:5px;margin-top:2px"
            onclick="_wiCreateTrip(${i})">🔗 Create Trip</button>` : ''}`;
}

// ── Drag & Drop ────────────────────────────────
function _wiDragStart(e, impId) {
  window._wiDragging = impId;
  e.dataTransfer.effectAllowed = 'move';
}

function _wiDropHover(rowIdx, on) {
  const el = document.getElementById('wi_drop_'+rowIdx);
  if (el) el.style.background = on ? 'rgba(217,119,6,0.05)' : '';
}

function _wiDrop(e, rowIdx) {
  e.preventDefault();
  _wiDropHover(rowIdx, false);
  const impId = window._wiDragging;
  if (!impId) return;
  window._wiDragging = null;
  // Remove from any existing row
  WINTL.rows.forEach(r=>{ if(r.importId===impId) r.importId=null; });
  WINTL.rows[rowIdx].importId = impId;
  WINTL._unmatchedImports = WINTL._unmatchedImports.filter(r=>r.id!==impId);
  _wiRender();
}

function _wiUnmatch(rowIdx) {
  const impId = WINTL.rows[rowIdx].importId;
  if (!impId) return;
  WINTL.rows[rowIdx].importId = null;
  const imp = WINTL.imports.find(r=>r.id===impId);
  if (imp && !WINTL._unmatchedImports.find(r=>r.id===impId))
    WINTL._unmatchedImports.push(imp);
  _wiRender();
}

// ── Row changes ────────────────────────────────
function _wiRowChange(rowIdx, field, val) {
  WINTL.rows[rowIdx][field] = val;
}

function _wiRowCarrier(rowIdx, isPartner) {
  WINTL.rows[rowIdx].carrierType = isPartner ? 'partner' : 'owned';
  _wiRender();
}

// ── Navigation ─────────────────────────────────
function _wiNavWeek(delta) {
  WINTL.week = Math.max(1, Math.min(52, WINTL.week + delta));
  WINTL.assetsLoaded = true;
  renderWeeklyIntl();
}

// ── Create Trip ────────────────────────────────
async function _wiCreateTrip(rowIdx) {
  const row = WINTL.rows[rowIdx];
  const isPartner = row.carrierType === 'partner';

  if (isPartner && !row.partnerId) { toast('Επίλεξε Partner'); return; }
  if (!isPartner && (!row.truckId||!row.trailerId||!row.driverId)) {
    toast('Επίλεξε Truck, Trailer και Driver'); return;
  }

  const btns = document.querySelectorAll(`[onclick="_wiCreateTrip(${rowIdx})"]`);
  btns.forEach(b=>{b.disabled=true;b.textContent='Creating...';});

  try {
    const fields = {
      'Export Order': [row.exportId],
      'Week Number':   WINTL.week,
    };
    if (row.importId)  fields['Import Order'] = [row.importId];
    if (isPartner) { if (row.partnerId) fields['Partner'] = [row.partnerId]; }
    else {
      if (row.truckId)   fields['Truck']   = [row.truckId];
      if (row.trailerId) fields['Trailer'] = [row.trailerId];
      if (row.driverId)  fields['Driver']  = [row.driverId];
    }
    await atCreate(TABLES.TRIPS, fields);
    toast('Trip created ✓');
    WINTL.assetsLoaded = true;
    await renderWeeklyIntl();
  } catch(e) {
    alert('Error: '+e.message);
    btns.forEach(b=>{b.disabled=false;b.textContent='🔗 Create Trip';});
  }
}

// ── Helpers ────────────────────────────────────
function _wiFmt(s) {
  if (!s) return '—';
  const p = s.split('-');
  return `${p[2]}/${p[1]}`;
}

function _wiClean(s) {
  return (s||'').replace(/^['"]+/,'').replace(/\/+$/,'').trim();
}
