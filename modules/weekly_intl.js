// ═══════════════════════════════════════════════
// WEEKLY INTERNATIONAL
// Design: Excel-like table. Exports = rows (auto).
// Imports dragged from shelf into right column.
// Right-click row → groupage / split / remove import.
// ═══════════════════════════════════════════════

const WINTL = {
  week: _wiCurrentWeek(),
  exports: [], imports: [],
  // rows[]: each row is one "slot" — can have 1+ exports (groupage) + 0-1 import
  rows: [],
  // import shelf (unmatched)
  importShelf: [],
  trucks:[], trailers:[], drivers:[], partners:[],
  assetsLoaded: false,
  _rc: 0,
};

function _wiCurrentWeek() {
  const d = new Date(), y = d.getFullYear();
  return Math.ceil(((d - new Date(y,0,1)) / 86400000 + new Date(y,0,1).getDay() + 1) / 7);
}

function _wiWeekRange(w) {
  const y = new Date().getFullYear();
  const jan1 = new Date(y,0,1);
  const base = new Date(jan1.getTime()+(w-1)*7*86400000);
  const day = base.getDay();
  const mon = new Date(base); mon.setDate(base.getDate()-(day===0?6:day-1));
  const sun = new Date(mon);  sun.setDate(mon.getDate()+6);
  const f = d => d.toLocaleDateString('el-GR',{day:'numeric',month:'short'});
  return `${f(mon)} – ${f(sun)}`;
}

async function _wiLoadAssets() {
  if (WINTL.assetsLoaded) return;
  const [trucks,trailers,drivers,partners] = await Promise.all([
    atGetAll(TABLES.TRUCKS,  {fields:['License Plate'],filterByFormula:"{Active}=TRUE()"}),
    atGetAll(TABLES.TRAILERS,{fields:['Plate'],        filterByFormula:"{Active}=TRUE()"}),
    atGetAll(TABLES.DRIVERS, {fields:['Full Name'],    filterByFormula:"{Active}=TRUE()"}),
    atGetAll(TABLES.PARTNERS,{fields:['Company Name']}),
  ]);
  WINTL.trucks   = trucks.map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
  WINTL.trailers = trailers.map(r=>({id:r.id,label:r.fields['Plate']||r.id}));
  WINTL.drivers  = drivers.map(r=>({id:r.id,label:r.fields['Full Name']||r.id}));
  WINTL.partners = partners.map(r=>({id:r.id,label:r.fields['Company Name']||r.id}));
  WINTL.assetsLoaded = true;
}

// ── Main entry ─────────────────────────────────
async function renderWeeklyIntl() {
  if (!checkPerm('planning','view')) return renderAccessDenied();
  setTitle('Weekly International',`Week ${WINTL.week}`);
  setContent(`<div class="loading"><span class="spinner"></span> Loading...</div>`);
  try {
    await _wiLoadAssets();
    const formula = `AND({Type}='International',{ Week Number}=${WINTL.week})`;
    const all = await atGetAll(TABLES.ORDERS,{filterByFormula:formula});
    WINTL.exports = all.filter(r=>r.fields.Direction==='Export')
      .sort((a,b)=>(a.fields['Delivery DateTime']||'').localeCompare(b.fields['Delivery DateTime']||''));
    WINTL.imports = all.filter(r=>r.fields.Direction==='Import');
    _wiBuildRows();
    _wiRender();
  } catch(e) {
    setContent(`<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`);
  }
}

function _wiBuildRows() {
  // Build rows from existing trips first, then add remaining exports 1-per-row
  WINTL.rows = [];
  WINTL._rc = 0;
  const usedExp = new Set(), usedImp = new Set();

  // Existing trips → one row per trip
  const tripMap = {};
  [...WINTL.exports,...WINTL.imports].forEach(r=>{
    (r.fields['TRIPS (Import Order)']||[]).forEach(tid=>{
      if(!tripMap[tid]) tripMap[tid]={exp:[],imp:[]};
      r.fields.Direction==='Export' ? tripMap[tid].exp.push(r.id) : tripMap[tid].imp.push(r.id);
    });
  });
  Object.values(tripMap).forEach(t=>{
    t.exp.forEach(id=>usedExp.add(id));
    t.imp.forEach(id=>usedImp.add(id));
    WINTL.rows.push({id:++WINTL._rc, exportIds:t.exp, importId:t.imp[0]||null,
      truckId:'',trailerId:'',driverId:'',partnerId:'',carrierType:'owned',saved:true});
  });

  // Remaining exports → 1 row each
  WINTL.exports.filter(r=>!usedExp.has(r.id)).forEach(r=>{
    WINTL.rows.push({id:++WINTL._rc, exportIds:[r.id], importId:null,
      truckId:'',trailerId:'',driverId:'',partnerId:'',carrierType:'owned',saved:false});
  });

  WINTL.importShelf = WINTL.imports.filter(r=>!usedImp.has(r.id));
}

// ── Render ─────────────────────────────────────
function _wiRender() {
  const shelfHtml = WINTL.importShelf.length ? `
    <div style="margin-bottom:14px;background:var(--bg-card);border:1px solid rgba(217,119,6,0.2);border-radius:10px;padding:10px 14px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(217,119,6,0.8);margin-bottom:8px">
        ↓ Import Shelf — ${WINTL.importShelf.length} unmatched · drag into table →
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:7px">
        ${WINTL.importShelf.map(r=>_wiShelfChip(r)).join('')}
      </div>
    </div>` : '';

  // Summary stats
  const assigned = WINTL.rows.filter(r=>r.saved).length;
  const pending  = WINTL.rows.filter(r=>!r.saved).length;
  const expTotal = WINTL.exports.length, impTotal = WINTL.imports.length;

  setContent(`
    <div class="page-header" style="margin-bottom:14px">
      <div>
        <div class="page-title">Weekly International</div>
        <div class="page-sub">
          Week ${WINTL.week} · ${_wiWeekRange(WINTL.week)}
          &nbsp;·&nbsp; <span style="color:var(--success)">↑${expTotal} exports</span>
          &nbsp;·&nbsp; <span style="color:rgba(217,119,6,0.8)">↓${impTotal} imports</span>
          &nbsp;·&nbsp; ${assigned} on trip · ${pending} pending
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost" onclick="renderWeeklyIntl()">↺ Refresh</button>
      </div>
    </div>

    <!-- Week nav -->
    <div style="display:flex;align-items:center;justify-content:center;gap:24px;margin-bottom:16px">
      <button class="btn btn-ghost" style="padding:6px 20px" onclick="_wiNavWeek(-1)">← Prev</button>
      <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--text)">Week ${WINTL.week}</div>
      <button class="btn btn-ghost" style="padding:6px 20px" onclick="_wiNavWeek(1)">Next →</button>
    </div>

    ${shelfHtml}

    <!-- Main table -->
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <!-- Header -->
      <div style="display:grid;grid-template-columns:1fr 190px 1fr;background:var(--bg);border-bottom:2px solid var(--border)">
        <div style="padding:10px 16px;border-right:1px solid var(--border)">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--success)">↑ Export (${expTotal})</span>
          <span style="font-size:10px;color:var(--text-dim);margin-left:8px">sorted by delivery · right-click to group</span>
        </div>
        <div style="padding:10px 16px;border-right:1px solid var(--border);text-align:center">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim)">Assignment</span>
        </div>
        <div style="padding:10px 16px">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(217,119,6,0.8)">↓ Import (${impTotal})</span>
          <span style="font-size:10px;color:var(--text-dim);margin-left:8px">drag from shelf ↑</span>
        </div>
      </div>

      ${WINTL.rows.length ? WINTL.rows.map((row,i)=>_wiTableRow(row,i)).join('') :
        `<div class="empty-state" style="padding:60px"><div class="icon">📋</div><p>No export orders this week</p></div>`}
    </div>

    <!-- Context menu (hidden) -->
    <div id="wi_ctx" style="display:none;position:fixed;z-index:9999;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);min-width:180px;overflow:hidden"></div>
  `);

  // Close context menu on outside click
  document.addEventListener('click', _wiCloseCtx, {once:true});
  window._wiDragging = null;
}

// ── Table row ──────────────────────────────────
function _wiTableRow(row, i) {
  const exports = row.exportIds.map(id=>WINTL.exports.find(r=>r.id===id)).filter(Boolean);
  const imp = row.importId ? WINTL.imports.find(r=>r.id===row.importId) : null;
  const isGroupage = exports.length > 1;
  const hasTrip = row.saved;
  const bgRow = hasTrip ? 'background:rgba(5,150,105,0.02)' : '';

  const isPartner = row.carrierType === 'partner';
  const sel = (arr,val,ph,field) =>
    `<select class="form-select" style="font-size:11px;padding:4px 6px;margin-bottom:3px;width:100%"
       onchange="_wiRowField(${row.id},'${field}',this.value)">
      <option value="">${ph}</option>
      ${arr.map(x=>`<option value="${x.id}" ${x.id===val?'selected':''}>${x.label}</option>`).join('')}
    </select>`;

  return `
  <div id="wi_row_${row.id}" style="display:grid;grid-template-columns:1fr 190px 1fr;border-top:1px solid var(--border);${bgRow}"
       oncontextmenu="_wiCtxMenu(event,${row.id})">

    <!-- EXPORT cell -->
    <div style="padding:10px 14px;border-right:1px solid var(--border);cursor:context-menu">
      ${isGroupage ? `<div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--accent);margin-bottom:5px">🔗 GROUPAGE (${exports.length})</div>` : ''}
      ${exports.map(r=>_wiExportLine(r)).join('')}
      ${hasTrip ? `<span class="badge badge-green" style="font-size:10px;margin-top:4px">On Trip</span>` : ''}
    </div>

    <!-- ASSIGNMENT cell -->
    <div style="padding:8px 10px;border-right:1px solid var(--border);background:var(--bg)">
      <label style="display:flex;align-items:center;gap:4px;font-size:10px;cursor:pointer;margin-bottom:5px;color:var(--text-dim)">
        <input type="checkbox" ${isPartner?'checked':''} onchange="_wiRowCarrier(${row.id},this.checked)"> Partner
      </label>
      ${!isPartner ? `
        ${sel(WINTL.trucks,  row.truckId,  'Truck',   'truckId')}
        ${sel(WINTL.trailers,row.trailerId,'Trailer', 'trailerId')}
        ${sel(WINTL.drivers, row.driverId, 'Driver',  'driverId')}
      ` : `
        ${sel(WINTL.partners,row.partnerId,'Partner', 'partnerId')}
      `}
      ${checkPerm('planning','full') ? `
      <button class="btn btn-primary" style="width:100%;font-size:10px;padding:4px;margin-top:3px"
              onclick="_wiCreateTrip(${row.id})">🔗 Create Trip</button>` : ''}
    </div>

    <!-- IMPORT cell (drop zone) -->
    <div id="wi_imp_${row.id}" style="padding:10px 14px;min-height:70px;transition:background 0.12s"
         ondragover="event.preventDefault();_wiImpHover(${row.id},true)"
         ondragleave="_wiImpHover(${row.id},false)"
         ondrop="_wiDropImport(event,${row.id})">
      ${imp ? _wiImportLine(imp, row.id) :
        `<div style="height:100%;min-height:52px;display:flex;align-items:center;justify-content:center;
                     border:2px dashed var(--border);border-radius:7px;color:var(--text-dim);font-size:11px">
           drag import here
         </div>`}
    </div>
  </div>`;
}

function _wiExportLine(r) {
  const f = r.fields;
  const loading  = _wiClean(f['Loading Summary'] ||'—');
  const delivery = _wiClean(f['Delivery Summary']||'—');
  const pals  = f['Total Pallets']||0;
  const loadDt = _wiFmt(f['Loading DateTime']);
  const delDt  = _wiFmt(f['Delivery DateTime']);
  const veroia = f['Veroia Switch '];
  const temp   = f['Temperature °C']!=null ? `${f['Temperature °C']}°C` : null;

  return `
    <div style="margin-bottom:${WINTL.exports.length>1?'8px':'0'}">
      <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:600;color:var(--text)">${loading}</span>
        ${veroia ? `<span style="font-size:10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 5px">🔄 Veroia</span>` : ''}
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin:2px 0">→ ${delivery}</div>
      <div style="font-size:11px;color:var(--text-mid);display:flex;gap:8px;flex-wrap:wrap">
        <span>📅 ${loadDt} → ${delDt}</span>
        <span>📦 ${pals} pal</span>
        ${temp ? `<span>🌡 ${temp}</span>` : ''}
      </div>
    </div>`;
}

function _wiImportLine(r, rowId) {
  const f = r.fields;
  const loading  = _wiClean(f['Loading Summary'] ||'—');
  const delivery = _wiClean(f['Delivery Summary']||'—');
  const pals  = f['Total Pallets']||0;
  const loadDt = _wiFmt(f['Loading DateTime']);
  const delDt  = _wiFmt(f['Delivery DateTime']);

  return `
    <div draggable="true" data-impid="${r.id}"
         ondragstart="_wiDragImport(event,'${r.id}')"
         style="background:rgba(217,119,6,0.05);border:1px solid rgba(217,119,6,0.2);
                border-radius:7px;padding:8px 10px;cursor:grab;position:relative"
         onmouseover="this.querySelector('.wi-rm').style.opacity='1'"
         onmouseout="this.querySelector('.wi-rm').style.opacity='0'">
      <button class="wi-rm" onclick="_wiRemoveImport(${rowId})"
              style="position:absolute;top:4px;right:6px;background:none;border:none;
                     font-size:11px;color:var(--text-dim);cursor:pointer;
                     opacity:0;transition:opacity 0.15s;padding:0;line-height:1">✕</button>
      <div style="font-size:12px;font-weight:600;color:var(--text);padding-right:14px">${loading}</div>
      <div style="font-size:11px;color:var(--text-dim)">→ ${delivery}</div>
      <div style="font-size:11px;color:var(--text-mid);margin-top:3px;display:flex;gap:8px">
        <span>📅 ${loadDt}→${delDt}</span><span>📦 ${pals} pal</span>
      </div>
    </div>`;
}

// ── Import shelf chip ──────────────────────────
function _wiShelfChip(r) {
  const f = r.fields;
  const loading  = _wiClean(f['Loading Summary'] ||'—').substring(0,26);
  const delivery = _wiClean(f['Delivery Summary']||'—').substring(0,20);
  const pals = f['Total Pallets']||0;
  const delDt = _wiFmt(f['Delivery DateTime']);

  return `
    <div draggable="true" data-impid="${r.id}"
         ondragstart="_wiDragImport(event,'${r.id}')"
         style="background:rgba(217,119,6,0.06);border:1px solid rgba(217,119,6,0.25);
                border-radius:8px;padding:7px 10px;cursor:grab;min-width:150px;max-width:210px">
      <div style="font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${loading}</div>
      <div style="font-size:10px;color:var(--text-dim)">→ ${delivery}</div>
      <div style="font-size:10px;color:var(--text-mid);margin-top:2px">${delDt} · ${pals} pal</div>
    </div>`;
}

// ── Drag & Drop ────────────────────────────────
function _wiDragImport(e, impId) {
  window._wiDragging = impId;
  e.dataTransfer.effectAllowed = 'move';
}

function _wiImpHover(rowId, on) {
  const el = document.getElementById('wi_imp_'+rowId);
  if (el) el.style.background = on ? 'rgba(217,119,6,0.04)' : '';
}

function _wiDropImport(e, rowId) {
  e.preventDefault();
  _wiImpHover(rowId, false);
  const impId = window._wiDragging;
  if (!impId) return;
  window._wiDragging = null;
  // Remove from any existing row
  WINTL.rows.forEach(r=>{ if(r.importId===impId) r.importId=null; });
  // Remove from shelf
  WINTL.importShelf = WINTL.importShelf.filter(r=>r.id!==impId);
  // Assign
  const row = WINTL.rows.find(r=>r.id===rowId);
  if (row) {
    // If row already has an import, return it to shelf first
    if (row.importId) {
      const old = WINTL.imports.find(r=>r.id===row.importId);
      if (old && !WINTL.importShelf.find(r=>r.id===old.id)) WINTL.importShelf.push(old);
    }
    row.importId = impId;
  }
  _wiRender();
}

function _wiRemoveImport(rowId) {
  const row = WINTL.rows.find(r=>r.id===rowId);
  if (!row || !row.importId) return;
  const old = WINTL.imports.find(r=>r.id===row.importId);
  if (old && !WINTL.importShelf.find(r=>r.id===old.id)) WINTL.importShelf.push(old);
  row.importId = null;
  _wiRender();
}

// ── Right-click context menu ───────────────────
function _wiCtxMenu(e, rowId) {
  e.preventDefault();
  e.stopPropagation();
  const row = WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;

  const isGroupage = row.exportIds.length > 1;
  const otherRows  = WINTL.rows.filter(r=>r.id!==rowId && r.exportIds.length>0);

  const items = [
    otherRows.length ? `<div style="padding:4px 6px 2px;font-size:10px;color:var(--text-dim);font-weight:600;letter-spacing:0.5px">GROUPAGE</div>` : '',
    ...otherRows.map(other => {
      const label = _wiClean(WINTL.exports.find(r=>r.id===other.exportIds[0])?.fields['Delivery Summary']||'Row '+other.id).substring(0,30);
      return `<div class="ctx-item" onclick="_wiMergeRows(${rowId},${other.id})">🔗 Group with: ${label}</div>`;
    }),
    isGroupage ? `<div class="ctx-item" onclick="_wiSplitRow(${rowId})">✂️ Split groupage</div>` : '',
    `<div style="height:1px;background:var(--border);margin:4px 0"></div>`,
    row.importId ? `<div class="ctx-item" onclick="_wiRemoveImport(${rowId})">✕ Remove import</div>` : '',
    `<div class="ctx-item" onclick="_wiViewExport(${rowId})">↗ View export order</div>`,
    row.saved ? '' : `<div class="ctx-item danger" onclick="_wiDeleteRow(${rowId})">🗑 Remove row</div>`,
  ].filter(Boolean).join('');

  const ctx = document.getElementById('wi_ctx');
  ctx.innerHTML = items;
  ctx.style.cssText = `display:block;position:fixed;z-index:9999;left:${Math.min(e.clientX, window.innerWidth-200)}px;top:${Math.min(e.clientY, window.innerHeight-250)}px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);min-width:200px;overflow:hidden;padding:4px 0`;

  // Add styles for ctx items
  ctx.querySelectorAll('.ctx-item').forEach(el=>{
    el.style.cssText='padding:7px 14px;font-size:12px;cursor:pointer;color:var(--text);transition:background 0.1s';
    el.onmouseover=()=>el.style.background='var(--bg-hover)';
    el.onmouseout =()=>el.style.background='';
    if (el.classList.contains('danger')) el.style.color='var(--danger)';
  });

  setTimeout(()=>document.addEventListener('click',_wiCloseCtx,{once:true}),10);
}

function _wiCloseCtx() {
  const ctx = document.getElementById('wi_ctx');
  if (ctx) ctx.style.display='none';
}

// ── Groupage: merge two rows ───────────────────
function _wiMergeRows(rowId, otherRowId) {
  _wiCloseCtx();
  const row   = WINTL.rows.find(r=>r.id===rowId);
  const other = WINTL.rows.find(r=>r.id===otherRowId);
  if (!row||!other) return;

  // Merge exports into rowId
  other.exportIds.forEach(id=>{
    if(!row.exportIds.includes(id)) row.exportIds.push(id);
  });

  // If other has import, return it to shelf (keep only 1 import per row)
  if (other.importId && !row.importId) row.importId = other.importId;
  else if (other.importId) {
    const imp = WINTL.imports.find(r=>r.id===other.importId);
    if (imp && !WINTL.importShelf.find(r=>r.id===imp.id)) WINTL.importShelf.push(imp);
  }

  // Remove other row
  WINTL.rows = WINTL.rows.filter(r=>r.id!==otherRowId);
  _wiRender();
  toast('Rows merged into groupage ✓');
}

// ── Split groupage back to individual rows ─────
function _wiSplitRow(rowId) {
  _wiCloseCtx();
  const row = WINTL.rows.find(r=>r.id===rowId);
  if (!row||row.exportIds.length<=1) return;
  const [first, ...rest] = row.exportIds;
  row.exportIds = [first];
  rest.forEach(expId=>{
    WINTL.rows.push({id:++WINTL._rc, exportIds:[expId], importId:null,
      truckId:'',trailerId:'',driverId:'',partnerId:'',carrierType:'owned',saved:false});
  });
  _wiRender();
  toast('Groupage split ✓');
}

function _wiDeleteRow(rowId) {
  _wiCloseCtx();
  const row = WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;
  if (row.importId) {
    const imp = WINTL.imports.find(r=>r.id===row.importId);
    if (imp && !WINTL.importShelf.find(r=>r.id===imp.id)) WINTL.importShelf.push(imp);
  }
  // Return exports... they should not disappear, but we don't add back to table since they were from DB
  // Just remove the row — on refresh they'll reappear
  WINTL.rows = WINTL.rows.filter(r=>r.id!==rowId);
  _wiRender();
}

function _wiViewExport(rowId) {
  _wiCloseCtx();
  const row = WINTL.rows.find(r=>r.id===rowId);
  if (row?.exportIds?.[0]) {
    navigate('orders_intl');
    setTimeout(()=>{ if(typeof showIntlDetail==='function') showIntlDetail(row.exportIds[0]); },600);
  }
}

// ── Row field changes ──────────────────────────
function _wiRowField(rowId,field,val) {
  const row = WINTL.rows.find(r=>r.id===rowId);
  if (row) row[field]=val;
}
function _wiRowCarrier(rowId,isPartner) {
  const row = WINTL.rows.find(r=>r.id===rowId);
  if (row) { row.carrierType=isPartner?'partner':'owned'; _wiRender(); }
}

// ── Navigation ─────────────────────────────────
function _wiNavWeek(delta) {
  WINTL.week = Math.max(1,Math.min(52,WINTL.week+delta));
  WINTL.assetsLoaded = true;
  renderWeeklyIntl();
}

// ── Create Trip ────────────────────────────────
async function _wiCreateTrip(rowId) {
  const row = WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;
  const isPartner = row.carrierType==='partner';

  if (!row.exportIds.length) { toast('Δεν υπάρχει Export στη γραμμή'); return; }
  if (isPartner && !row.partnerId)  { toast('Επίλεξε Partner'); return; }
  if (!isPartner && (!row.truckId||!row.trailerId||!row.driverId)) {
    toast('Επίλεξε Truck, Trailer και Driver'); return;
  }

  const btn = document.querySelector(`#wi_row_${rowId} .btn-primary`);
  if (btn) { btn.disabled=true; btn.textContent='Creating...'; }

  try {
    const fields = {'Export Order': row.exportIds, 'Week Number': WINTL.week};
    if (row.importId)  fields['Import Order'] = [row.importId];
    if (isPartner) { if(row.partnerId) fields['Partner']=[row.partnerId]; }
    else {
      if(row.truckId)   fields['Truck']  =[row.truckId];
      if(row.trailerId) fields['Trailer']=[row.trailerId];
      if(row.driverId)  fields['Driver'] =[row.driverId];
    }
    await atCreate(TABLES.TRIPS, fields);
    toast('Trip created ✓');
    WINTL.assetsLoaded=true;
    await renderWeeklyIntl();
  } catch(e) {
    alert('Error: '+e.message);
    if(btn){btn.disabled=false;btn.textContent='🔗 Create Trip';}
  }
}

// ── Helpers ────────────────────────────────────
function _wiFmt(s) {
  if (!s) return '—';
  const p=s.split('-'); return `${p[2]}/${p[1]}`;
}
function _wiClean(s) {
  return (s||'').replace(/^['"]+/,'').replace(/\/+$/,'').trim();
}
