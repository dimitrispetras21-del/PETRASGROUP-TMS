// ═══════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL — production scale (35-55 exports/week)
// UX: compact rows, sticky header, shelf with search,
//     assignment panel opens inline on row click
// ═══════════════════════════════════════════════════════════════

const WINTL = {
  week: _wiCurrentWeek(),
  exports: [], imports: [],
  rows: [],           // [{id,exportIds[],importId,truckId,trailerId,driverId,partnerId,carrierType,saved,open}]
  importShelf: [],
  trucks:[], trailers:[], drivers:[], partners:[],
  assetsLoaded: false,
  _rc: 0,
  _shelfFilter: '',
};

function _wiCurrentWeek() {
  const d=new Date(), y=d.getFullYear();
  return Math.ceil(((d-new Date(y,0,1))/86400000+new Date(y,0,1).getDay()+1)/7);
}
function _wiWeekRange(w) {
  const y=new Date().getFullYear(), jan1=new Date(y,0,1);
  const base=new Date(jan1.getTime()+(w-1)*7*86400000), day=base.getDay();
  const mon=new Date(base); mon.setDate(base.getDate()-(day===0?6:day-1));
  const sun=new Date(mon);  sun.setDate(mon.getDate()+6);
  const f=d=>d.toLocaleDateString('el-GR',{day:'numeric',month:'short'});
  return `${f(mon)} – ${f(sun)}`;
}

async function _wiLoadAssets() {
  if (WINTL.assetsLoaded) return;
  const [trucks,trailers,drivers,partners]=await Promise.all([
    atGetAll(TABLES.TRUCKS,  {fields:['License Plate'],filterByFormula:"{Active}=TRUE()"}),
    atGetAll(TABLES.TRAILERS,{fields:['Plate'],         filterByFormula:"{Active}=TRUE()"}),
    atGetAll(TABLES.DRIVERS, {fields:['Full Name'],     filterByFormula:"{Active}=TRUE()"}),
    atGetAll(TABLES.PARTNERS,{fields:['Company Name']}),
  ]);
  WINTL.trucks   = trucks.map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
  WINTL.trailers = trailers.map(r=>({id:r.id,label:r.fields['Plate']||r.id}));
  WINTL.drivers  = drivers.map(r=>({id:r.id,label:r.fields['Full Name']||r.id}));
  WINTL.partners = partners.map(r=>({id:r.id,label:r.fields['Company Name']||r.id}));
  WINTL.assetsLoaded=true;
}

// ────────────────────────────────────────────────────────────────
async function renderWeeklyIntl() {
  if (!checkPerm('planning','view')) return renderAccessDenied();
  setTitle('Weekly International',`Week ${WINTL.week}`);
  setContent(`<div class="loading"><span class="spinner"></span> Loading week ${WINTL.week}…</div>`);
  try {
    await _wiLoadAssets();
    const formula=`AND({Type}='International',{ Week Number}=${WINTL.week})`;
    const all=await atGetAll(TABLES.ORDERS,{filterByFormula:formula});
    WINTL.exports=all.filter(r=>r.fields.Direction==='Export')
      .sort((a,b)=>(a.fields['Delivery DateTime']||'').localeCompare(b.fields['Delivery DateTime']||''));
    WINTL.imports=all.filter(r=>r.fields.Direction==='Import');
    _wiBuildRows();
    _wiRender();
  } catch(e) {
    setContent(`<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`);
  }
}

function _wiBuildRows() {
  WINTL.rows=[]; WINTL._rc=0;
  const usedExp=new Set(), usedImp=new Set();
  // existing trips
  const tripMap={};
  [...WINTL.exports,...WINTL.imports].forEach(r=>{
    (r.fields['TRIPS (Import Order)']||[]).forEach(tid=>{
      if(!tripMap[tid]) tripMap[tid]={exp:[],imp:[]};
      r.fields.Direction==='Export'?tripMap[tid].exp.push(r.id):tripMap[tid].imp.push(r.id);
    });
  });
  Object.values(tripMap).forEach(t=>{
    t.exp.forEach(id=>usedExp.add(id));
    t.imp.forEach(id=>usedImp.add(id));
    WINTL.rows.push({id:++WINTL._rc,exportIds:t.exp,importId:t.imp[0]||null,
      truckId:'',trailerId:'',driverId:'',partnerId:'',carrierType:'owned',saved:true,open:false});
  });
  // remaining exports → 1 row each
  WINTL.exports.filter(r=>!usedExp.has(r.id)).forEach(r=>{
    WINTL.rows.push({id:++WINTL._rc,exportIds:[r.id],importId:null,
      truckId:'',trailerId:'',driverId:'',partnerId:'',carrierType:'owned',saved:false,open:false});
  });
  WINTL.importShelf=WINTL.imports.filter(r=>!usedImp.has(r.id));
}

// ────────────────────────────────────────────────────────────────
function _wiRender() {
  const R=WINTL.rows, IS=WINTL.importShelf;
  const expN=WINTL.exports.length, impN=WINTL.imports.length;
  const onTrip=R.filter(r=>r.saved).length, pending=R.filter(r=>!r.saved).length;
  const unmatched=IS.length;

  // shelf filter
  const sf=(WINTL._shelfFilter||'').toLowerCase();
  const shelfVisible=sf ? IS.filter(r=>{
    const s=r.fields['Loading Summary']||''+r.fields['Delivery Summary']||'';
    return s.toLowerCase().includes(sf);
  }) : IS;

  setContent(`
    <!-- ── HEADER ── -->
    <div class="page-header" style="margin-bottom:12px">
      <div>
        <div class="page-title">Weekly International</div>
        <div class="page-sub" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:3px">
          <span>Week ${WINTL.week} · ${_wiWeekRange(WINTL.week)}</span>
          <span style="color:var(--success)">↑ ${expN} exports</span>
          <span style="color:rgba(217,119,6,0.9)">↓ ${impN} imports</span>
          <span style="color:var(--text-dim)">${onTrip} on trip · ${pending} pending</span>
          ${unmatched?`<span style="color:rgba(217,119,6,0.9)">${unmatched} imports unmatched</span>`:'<span style="color:var(--success)">all imports matched ✓</span>'}
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="renderWeeklyIntl()">↺ Refresh</button>
      </div>
    </div>

    <!-- ── WEEK NAV ── -->
    <div style="display:flex;align-items:center;justify-content:center;gap:20px;margin-bottom:14px">
      <button class="btn btn-ghost" style="padding:5px 18px" onclick="_wiNavWeek(-1)">← Prev</button>
      <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700">Week ${WINTL.week}</div>
      <button class="btn btn-ghost" style="padding:5px 18px" onclick="_wiNavWeek(1)">Next →</button>
    </div>

    <!-- ── IMPORT SHELF ── -->
    <div style="margin-bottom:12px;background:var(--bg-card);border:1px solid rgba(217,119,6,0.2);border-radius:10px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid rgba(217,119,6,0.1)">
        <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(217,119,6,0.85)">
          ↓ Import Shelf ${IS.length?`(${IS.length})`:'— all matched ✓'}
        </span>
        ${IS.length>5?`
        <input type="text" placeholder="search imports…" value="${WINTL._shelfFilter}"
               oninput="WINTL._shelfFilter=this.value;_wiRenderShelf()"
               style="margin-left:auto;padding:4px 10px;font-size:11px;border-radius:6px;
                      border:1px solid var(--border);background:var(--bg);color:var(--text);
                      width:160px;outline:none"/>` :''}
      </div>
      <div id="wi_shelf" style="padding:${IS.length?'10px 12px':'6px 14px'};min-height:${IS.length?'52px':'0'}">
        ${IS.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:7px">${shelfVisible.map(r=>_wiShelfChip(r)).join('')}</div>`
          : `<div style="font-size:12px;color:var(--text-dim);padding:3px 0">No unmatched imports this week</div>`}
      </div>
    </div>

    <!-- ── MAIN TABLE ── -->
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">

      <!-- sticky header -->
      <div style="display:grid;grid-template-columns:36px 1fr 24px 200px 1fr;
                  background:var(--bg);border-bottom:2px solid var(--border);
                  position:sticky;top:0;z-index:10">
        <div style="padding:9px 0 9px 12px;border-right:1px solid var(--border);font-size:10px;color:var(--text-dim)">#</div>
        <div style="padding:9px 14px;border-right:1px solid var(--border)">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:var(--success)">↑ EXPORT</span>
          <span style="font-size:10px;color:var(--text-dim);margin-left:8px">right-click → groupage</span>
        </div>
        <div style="border-right:1px solid var(--border)"></div>
        <div style="padding:9px 10px;border-right:1px solid var(--border);text-align:center">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:var(--text-dim)">Assignment</span>
        </div>
        <div style="padding:9px 14px">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:rgba(217,119,6,0.85)">↓ IMPORT</span>
          <span style="font-size:10px;color:var(--text-dim);margin-left:8px">drag from shelf</span>
        </div>
      </div>

      ${R.length
        ? R.map((row,i)=>_wiRow(row,i)).join('')
        : `<div class="empty-state" style="padding:60px"><div class="icon">📋</div><p>No exports this week</p></div>`}
    </div>

    <!-- context menu -->
    <div id="wi_ctx" style="display:none;position:fixed;z-index:9999"></div>
  `);

  window._wiDragging=null;
}

// Partial re-render for shelf only (typing in search)
function _wiRenderShelf() {
  const sf=(WINTL._shelfFilter||'').toLowerCase();
  const IS=WINTL.importShelf;
  const vis=sf?IS.filter(r=>{
    const s=(r.fields['Loading Summary']||'')+(r.fields['Delivery Summary']||'');
    return s.toLowerCase().includes(sf);
  }):IS;
  const el=document.getElementById('wi_shelf');
  if (!el) return;
  el.innerHTML=IS.length
    ?`<div style="display:flex;flex-wrap:wrap;gap:7px">${vis.map(r=>_wiShelfChip(r)).join('')}</div>`
    :`<div style="font-size:12px;color:var(--text-dim);padding:3px 0">No unmatched imports</div>`;
}

// ────────────────────────────────────────────────────────────────
// TABLE ROW — compact overview, click to expand assignment
// ────────────────────────────────────────────────────────────────
function _wiRow(row, i) {
  const exps=row.exportIds.map(id=>WINTL.exports.find(r=>r.id===id)).filter(Boolean);
  const imp=row.importId?WINTL.imports.find(r=>r.id===row.importId):null;
  const isGroupage=exps.length>1;
  const isSaved=row.saved;

  // Status dot
  const dot=isSaved
    ?'background:var(--success);'
    :(row.truckId||row.partnerId)?'background:var(--accent);':'background:var(--warning);';

  // Row background
  const rowBg=isSaved?'background:rgba(5,150,105,0.02)':'';

  // Compact export summary (1 line)
  const expSummary=exps.map(r=>{
    const loading=_wiClean(r.fields['Loading Summary']||'—');
    const delivery=_wiClean(r.fields['Delivery Summary']||'—');
    const pals=r.fields['Total Pallets']||0;
    const delDt=_wiFmt(r.fields['Delivery DateTime']);
    const veroia=r.fields['Veroia Switch '];
    const temp=r.fields['Temperature °C']!=null?` · ${r.fields['Temperature °C']}°C`:'';
    return `<div style="padding:${isGroupage?'3px 0':'0'}">
      <span style="font-size:12px;font-weight:600;color:var(--text)">${loading}</span>
      ${veroia?`<span style="font-size:9px;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:1px 4px;margin-left:4px">🔄</span>`:''}
      <span style="font-size:11px;color:var(--text-dim);margin-left:6px">→ ${delivery}</span>
      <span style="font-size:11px;color:var(--text-mid);margin-left:8px">📦${pals}${temp} · ${delDt}</span>
    </div>`;
  }).join('');

  // Assignment badge (compact — shown in row)
  const assignBadge=isSaved
    ?`<span class="badge badge-green" style="font-size:10px">Trip ✓</span>`
    :(row.truckId
      ?`<span style="font-size:11px;color:var(--text-dim)">${WINTL.trucks.find(t=>t.id===row.truckId)?.label||'—'}</span>`
      :(row.partnerId
        ?`<span style="font-size:11px;color:var(--accent)">${WINTL.partners.find(p=>p.id===row.partnerId)?.label||'—'}</span>`
        :`<span style="font-size:11px;color:var(--warning)">Unassigned</span>`));

  // Import compact summary
  const impSummary=imp?`
    <div draggable="true" data-impid="${imp.id}" ondragstart="_wiDragImport(event,'${imp.id}')"
         style="cursor:grab">
      <div style="font-size:12px;font-weight:600;color:var(--text)">${_wiClean(imp.fields['Loading Summary']||'—')}</div>
      <div style="font-size:11px;color:var(--text-dim)">→ ${_wiClean(imp.fields['Delivery Summary']||'—')} · 📦${imp.fields['Total Pallets']||0} · ${_wiFmt(imp.fields['Delivery DateTime'])}</div>
    </div>`:
    `<div style="font-size:11px;color:var(--text-dim);font-style:italic">drag import here</div>`;

  // Expanded assignment panel (only if row.open)
  const expandedPanel=row.open?_wiAssignPanel(row):'';

  return `
  <div id="wi_row_${row.id}" style="${rowBg};border-top:1px solid var(--border)">

    <!-- COMPACT ROW -->
    <div style="display:grid;grid-template-columns:36px 1fr 24px 200px 1fr;min-height:44px;cursor:context-menu"
         oncontextmenu="_wiCtxMenu(event,${row.id})">

      <!-- # + status dot -->
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  padding:8px 0;border-right:1px solid var(--border);gap:4px">
        <div style="width:8px;height:8px;border-radius:50%;${dot}flex-shrink:0"></div>
        <span style="font-size:9px;color:var(--text-dim)">${i+1}</span>
      </div>

      <!-- Export cell -->
      <div style="padding:8px 14px;border-right:1px solid var(--border);display:flex;align-items:center">
        <div style="flex:1">
          ${isGroupage?`<span style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--accent);margin-bottom:3px;display:block">🔗 GROUPAGE ×${exps.length}</span>`:''}
          ${expSummary}
        </div>
      </div>

      <!-- Toggle expand -->
      <div style="display:flex;align-items:center;justify-content:center;border-right:1px solid var(--border);cursor:pointer"
           onclick="_wiToggleRow(${row.id})" title="${row.open?'Collapse':'Assign'}">
        <span style="font-size:14px;color:var(--text-dim);transition:transform 0.2s;display:inline-block;transform:rotate(${row.open?'90deg':'0deg'})">›</span>
      </div>

      <!-- Assignment cell (compact badge) -->
      <div style="padding:8px 10px;border-right:1px solid var(--border);background:var(--bg);
                  display:flex;align-items:center;justify-content:center;cursor:pointer"
           onclick="_wiToggleRow(${row.id})">
        ${assignBadge}
      </div>

      <!-- Import cell (drop zone) -->
      <div id="wi_imp_${row.id}" style="padding:8px 14px;transition:background 0.12s"
           ondragover="event.preventDefault();_wiImpHover(${row.id},true)"
           ondragleave="_wiImpHover(${row.id},false)"
           ondrop="_wiDropImport(event,${row.id})">
        ${impSummary}
      </div>
    </div>

    <!-- EXPANDED ASSIGNMENT PANEL -->
    ${row.open?`
    <div style="border-top:1px solid var(--border);background:var(--bg);padding:12px 14px 14px;
                display:grid;grid-template-columns:36px 1fr;gap:0">
      <div></div>
      <div>${expandedPanel}</div>
    </div>` : ''}

  </div>`;
}

// ── Assignment Panel (inline expanded) ─────────
function _wiAssignPanel(row) {
  const isPartner=row.carrierType==='partner';
  const sel=(arr,val,ph,field)=>
    `<select class="form-select" style="font-size:11px;padding:5px 8px;width:180px"
       onchange="_wiRowField(${row.id},'${field}',this.value)">
      <option value="">${ph}</option>
      ${arr.map(x=>`<option value="${x.id}" ${x.id===val?'selected':''}>${x.label}</option>`).join('')}
    </select>`;

  return `
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;color:var(--text-mid);align-self:center">
        <input type="checkbox" ${isPartner?'checked':''} onchange="_wiRowCarrier(${row.id},this.checked)"> Partner trip
      </label>
      ${!isPartner?`
        <div style="display:flex;flex-direction:column;gap:4px">
          ${sel(WINTL.trucks,  row.truckId,  'Select Truck',   'truckId')}
          ${sel(WINTL.trailers,row.trailerId,'Select Trailer', 'trailerId')}
          ${sel(WINTL.drivers, row.driverId, 'Select Driver',  'driverId')}
        </div>
      `:`
        <div>${sel(WINTL.partners,row.partnerId,'Select Partner','partnerId')}</div>
      `}
      ${checkPerm('planning','full')?`
      <div style="display:flex;flex-direction:column;gap:4px">
        <button class="btn btn-primary" style="font-size:11px;padding:5px 14px;white-space:nowrap"
                onclick="_wiCreateTrip(${row.id})">🔗 Create Trip</button>
        <button class="btn btn-ghost"   style="font-size:10px;padding:4px 14px;white-space:nowrap"
                onclick="_wiCreateTrip(${row.id},true)">Export only →</button>
      </div>`:''}
    </div>`;
}

// ── Toggle row expand ──────────────────────────
function _wiToggleRow(rowId) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;
  row.open=!row.open;
  // Re-render just this row (performance: avoid full re-render)
  const el=document.getElementById('wi_row_'+rowId);
  if (!el) { _wiRender(); return; }
  const idx=WINTL.rows.findIndex(r=>r.id===rowId);
  el.outerHTML=_wiRow(row,idx);
}

// ── Shelf chip ─────────────────────────────────
function _wiShelfChip(r) {
  const f=r.fields;
  const loading=_wiClean(f['Loading Summary']||'—').substring(0,26);
  const delivery=_wiClean(f['Delivery Summary']||'—').substring(0,20);
  const pals=f['Total Pallets']||0;
  const delDt=_wiFmt(f['Delivery DateTime']);
  return `
    <div draggable="true" data-impid="${r.id}"
         ondragstart="_wiDragImport(event,'${r.id}')"
         style="background:rgba(217,119,6,0.06);border:1px solid rgba(217,119,6,0.22);
                border-radius:7px;padding:6px 10px;cursor:grab;min-width:140px;max-width:200px;
                transition:box-shadow 0.15s"
         onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'"
         onmouseout="this.style.boxShadow=''">
      <div style="font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${loading}</div>
      <div style="font-size:10px;color:var(--text-dim)">→ ${delivery}</div>
      <div style="font-size:10px;color:var(--text-mid);margin-top:2px">${delDt} · ${pals} pal</div>
    </div>`;
}

// ── Drag & Drop ────────────────────────────────
function _wiDragImport(e,impId) {
  window._wiDragging=impId;
  e.dataTransfer.effectAllowed='move';
}
function _wiImpHover(rowId,on) {
  const el=document.getElementById('wi_imp_'+rowId);
  if (el) el.style.background=on?'rgba(217,119,6,0.05)':'';
}
function _wiDropImport(e,rowId) {
  e.preventDefault();
  _wiImpHover(rowId,false);
  const impId=window._wiDragging;
  if (!impId) return;
  window._wiDragging=null;
  // remove from shelf and any other row
  WINTL.importShelf=WINTL.importShelf.filter(r=>r.id!==impId);
  WINTL.rows.forEach(r=>{ if(r.importId===impId) r.importId=null; });
  // swap if this row already has import
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;
  if (row.importId) {
    const old=WINTL.imports.find(r=>r.id===row.importId);
    if (old && !WINTL.importShelf.find(r=>r.id===old.id)) WINTL.importShelf.push(old);
  }
  row.importId=impId;
  _wiRender();
}

// ── Right-click context menu ───────────────────
function _wiCtxMenu(e,rowId) {
  e.preventDefault(); e.stopPropagation();
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;
  const isGroupage=row.exportIds.length>1;
  const others=WINTL.rows.filter(r=>r.id!==rowId&&r.exportIds.length>0&&!r.saved);

  const menuItems=[
    // Groupage section
    others.length?`<div style="padding:5px 12px 3px;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim)">GROUPAGE</div>`:'',
    ...others.slice(0,8).map(other=>{
      const exp=WINTL.exports.find(r=>r.id===other.exportIds[0]);
      const label=_wiClean(exp?.fields['Delivery Summary']||'Row '+other.id).substring(0,28);
      return ctxItem(`🔗 Group with: ${label}`,`_wiMergeRows(${rowId},${other.id})`);
    }),
    isGroupage?ctxItem('✂️ Split groupage',`_wiSplitRow(${rowId})`):'' ,
    // Divider
    `<div style="height:1px;background:var(--border);margin:4px 0"></div>`,
    // Import
    row.importId?ctxItem('✕ Remove import',`_wiRemoveImport(${rowId})`):'' ,
    // View
    ctxItem('↗ View export order',`_wiViewExport(${rowId})`),
    // Delete (only unsaved)
    !row.saved?`<div style="height:1px;background:var(--border);margin:4px 0"></div>`:'',
    !row.saved?ctxItem('🗑 Remove row',`_wiDeleteRow(${rowId})`,true):'',
  ].filter(Boolean).join('');

  const ctx=document.getElementById('wi_ctx');
  ctx.innerHTML=menuItems;
  ctx.style.cssText=`display:block;position:fixed;z-index:9999;
    left:${Math.min(e.clientX,window.innerWidth-210)}px;
    top:${Math.min(e.clientY,window.innerHeight-260)}px;
    background:var(--bg-card);border:1px solid var(--border);
    border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);
    min-width:210px;overflow:hidden;padding:5px 0`;

  ctx.querySelectorAll('.ctx-item').forEach(el=>{
    el.style.cssText='padding:7px 14px;font-size:12px;cursor:pointer;color:var(--text);transition:background 0.1s;display:block;width:100%;text-align:left;background:none;border:none';
    el.onmouseover=()=>el.style.background='var(--bg-hover)';
    el.onmouseout =()=>el.style.background='';
    if(el.dataset.danger) el.style.color='var(--danger)';
  });
  setTimeout(()=>document.addEventListener('click',_wiCloseCtx,{once:true}),10);
}
function ctxItem(label,action,danger=false) {
  return `<button class="ctx-item" ${danger?'data-danger="1"':''} onclick="${action};_wiCloseCtx()">${label}</button>`;
}
function _wiCloseCtx() {
  const ctx=document.getElementById('wi_ctx');
  if (ctx) ctx.style.display='none';
}

// ── Groupage ───────────────────────────────────
function _wiMergeRows(rowId,otherId) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  const other=WINTL.rows.find(r=>r.id===otherId);
  if (!row||!other) return;
  other.exportIds.forEach(id=>{ if(!row.exportIds.includes(id)) row.exportIds.push(id); });
  if (!row.importId && other.importId) row.importId=other.importId;
  else if (other.importId && row.importId!==other.importId) {
    const imp=WINTL.imports.find(r=>r.id===other.importId);
    if (imp&&!WINTL.importShelf.find(r=>r.id===imp.id)) WINTL.importShelf.push(imp);
  }
  WINTL.rows=WINTL.rows.filter(r=>r.id!==otherId);
  _wiRender(); toast('Grouped ✓');
}
function _wiSplitRow(rowId) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row||row.exportIds.length<=1) return;
  const [first,...rest]=row.exportIds;
  row.exportIds=[first];
  rest.forEach(expId=>WINTL.rows.push({id:++WINTL._rc,exportIds:[expId],importId:null,
    truckId:'',trailerId:'',driverId:'',partnerId:'',carrierType:'owned',saved:false,open:false}));
  _wiRender(); toast('Split ✓');
}
function _wiDeleteRow(rowId) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;
  if (row.importId) {
    const imp=WINTL.imports.find(r=>r.id===row.importId);
    if (imp&&!WINTL.importShelf.find(r=>r.id===imp.id)) WINTL.importShelf.push(imp);
  }
  WINTL.rows=WINTL.rows.filter(r=>r.id!==rowId);
  _wiRender();
}
function _wiRemoveImport(rowId) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row||!row.importId) return;
  const imp=WINTL.imports.find(r=>r.id===row.importId);
  if (imp&&!WINTL.importShelf.find(r=>r.id===imp.id)) WINTL.importShelf.push(imp);
  row.importId=null; _wiRender();
}
function _wiViewExport(rowId) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (row?.exportIds?.[0]) {
    navigate('orders_intl');
    setTimeout(()=>{ if(typeof showIntlDetail==='function') showIntlDetail(row.exportIds[0]); },600);
  }
}

// ── Row fields ─────────────────────────────────
function _wiRowField(rowId,field,val) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (row) row[field]=val;
}
function _wiRowCarrier(rowId,isPartner) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (row) { row.carrierType=isPartner?'partner':'owned'; _wiToggleRow(rowId); _wiToggleRow(rowId); }
}

// ── Navigation ─────────────────────────────────
function _wiNavWeek(delta) {
  WINTL.week=Math.max(1,Math.min(52,WINTL.week+delta));
  WINTL.assetsLoaded=true; renderWeeklyIntl();
}

// ── Create Trip ────────────────────────────────
async function _wiCreateTrip(rowId,exportOnly=false) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;
  const isPartner=row.carrierType==='partner';
  if (!row.exportIds.length) { toast('Δεν υπάρχει Export'); return; }
  if (isPartner&&!row.partnerId)   { toast('Επίλεξε Partner'); return; }
  if (!isPartner&&(!row.truckId||!row.trailerId||!row.driverId)) { toast('Επίλεξε Truck, Trailer, Driver'); return; }

  const btn=event?.target;
  if (btn) { btn.disabled=true; btn.textContent='Creating…'; }
  try {
    const fields={'Export Order':row.exportIds,'Week Number':WINTL.week};
    if (!exportOnly&&row.importId) fields['Import Order']=[row.importId];
    if (isPartner) { if(row.partnerId) fields['Partner']=[row.partnerId]; }
    else {
      if(row.truckId)   fields['Truck']  =[row.truckId];
      if(row.trailerId) fields['Trailer']=[row.trailerId];
      if(row.driverId)  fields['Driver'] =[row.driverId];
    }
    await atCreate(TABLES.TRIPS,fields);
    toast(exportOnly?'Export-only trip created ✓':'Trip created ✓');
    WINTL.assetsLoaded=true; await renderWeeklyIntl();
  } catch(e) {
    alert('Error: '+e.message);
    if(btn){btn.disabled=false;btn.textContent='🔗 Create Trip';}
  }
}

// ── Helpers ────────────────────────────────────
function _wiFmt(s){if(!s)return'—';const p=s.split('-');return`${p[2]}/${p[1]}`;}
function _wiClean(s){return(s||'').replace(/^['"]+/,'').replace(/\/+$/,'').trim();}
