// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL — v5
//
// COMPACT by default. Click row → inline panel opens.
//
// DEFAULT ROW (1 line, ~36px):
//  ● 1  ΚΥΡΙΑΖΗΣ → Kaufland SK  · 📅 18/03→22/03 · 📦 33 pal · 🌡 4°C  [VEROIA]  │ ΙΑΒ 1099 / Reppas │ Artima AE → Sofia · 20 pal
//
// EXPANDED ROW (click anywhere on row):
//  ── same export info ────────────────────────────────────────────────────────
//  [□ Partner]  [Truck ▼]  [Trailer ▼]  [Driver ▼]  [🔗 Create]
//  ── import drop zone (same row, now taller) ─────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

const WINTL = {
  week:      _wiCurrentWeek(),
  data:      { exports:[], imports:[], trips:[], trucks:[], trailers:[], drivers:[], partners:[] },
  rows:      [],
  shelf:     [],
  ui:        { openRow: null, shelfFilter:'', shelfCollapsed:false },
  _seq:      0,
  _assetsOk: false,
};

/* ── STYLES ─────────────────────────────────────────────────────── */
(function(){
  if(document.getElementById('wi5-css')) return;
  const s=document.createElement('style'); s.id='wi5-css';
  s.textContent=`
  /* grid columns: #(36px) | export(flex) | assign-badge(180px) | import(280px) */
  .wi-grid { display:grid; grid-template-columns:36px 1fr 180px 280px; }

  /* compact row */
  .wi-row { border-top:1px solid var(--border); cursor:pointer; }
  .wi-row:hover .wi-compact { background:rgba(0,0,0,0.012); }
  .wi-compact { display:grid; grid-template-columns:36px 1fr 180px 280px;
                min-height:36px; align-items:center; }
  .wi-row.is-saved   > .wi-compact { background:rgba(5,150,105,0.03); }
  .wi-row.is-partner > .wi-compact { background:rgba(59,130,246,0.025); }

  /* cells */
  .wi-cn  { display:flex;flex-direction:column;align-items:center;justify-content:center;
            padding:4px 0;border-right:1px solid var(--border);gap:3px;height:100%; }
  .wi-ce  { padding:6px 12px;border-right:1px solid var(--border);
            display:flex;flex-direction:column;gap:2px;overflow:hidden; }
  .wi-ca  { padding:5px 10px;border-right:1px solid var(--border);
            display:flex;align-items:center;justify-content:center;
            background:var(--bg); }
  .wi-ci  { padding:6px 11px;display:flex;align-items:center; }

  /* export text */
  .wi-route  { font-size:11.5px;font-weight:600;color:var(--text);
               white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
  .wi-route .dim { color:var(--text-dim);font-weight:400; }
  .wi-route .arr { color:var(--text-dim);margin:0 5px; }
  .wi-meta   { display:flex;gap:8px;flex-wrap:wrap; }
  .wi-meta span { font-size:10.5px;color:var(--text-dim); }

  /* badges */
  .wi-b { display:inline-block;font-size:8px;font-weight:700;letter-spacing:1px;
          text-transform:uppercase;padding:1px 5px;border-radius:3px;margin-left:4px; }
  .wi-b-vx { background:rgba(99,102,241,0.1);color:rgba(99,102,241,0.85);
              border:1px solid rgba(99,102,241,0.18); }
  .wi-b-gr { background:rgba(14,165,233,0.1);color:rgba(14,165,233,0.85);
              border:1px solid rgba(14,165,233,0.18); }

  /* dot */
  .wi-dot { width:6px;height:6px;border-radius:50%;flex-shrink:0; }

  /* assignment badge (compact) */
  .wi-asgn-plate  { font-size:11px;font-weight:700;color:var(--text);
                    letter-spacing:0.3px;line-height:1.3; }
  .wi-asgn-driver { font-size:10px;color:var(--text-dim);line-height:1.2; }
  .wi-asgn-partner{ font-size:10.5px;font-weight:600;color:#0B6E4F;
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px; }
  .wi-asgn-empty  { font-size:10px;color:var(--border-dark,#ccc);letter-spacing:0.3px; }
  .wi-asgn-trip   { font-size:9px;color:var(--text-dim);font-weight:500;letter-spacing:0.3px; }

  /* import compact */
  .wi-imp-compact { font-size:10.5px;color:var(--text-mid);
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
  .wi-imp-empty-c { font-size:10px;color:var(--border-dark,#ccc);letter-spacing:0.3px; }

  /* ── EXPANDED PANEL ── */
  .wi-panel {
    grid-column: 1 / -1;
    border-top:1px solid var(--border);
    background:var(--bg);
    padding:10px 14px 12px 48px;
    display:flex; flex-direction:column; gap:10px;
  }

  /* panel: import drop zone */
  .wi-panel-imp {
    min-height:60px; border:1.5px dashed var(--border-mid); border-radius:7px;
    padding:8px 12px; display:flex; align-items:center;
    transition:background 0.1s, border-color 0.1s;
  }
  .wi-panel-imp.drop-hover {
    background:rgba(217,119,6,0.06); border-color:rgba(217,119,6,0.4);
  }

  /* import chip in panel */
  .wi-imp-chip {
    width:100%; background:rgba(217,119,6,0.07);
    border:1px solid rgba(217,119,6,0.2); border-radius:6px;
    padding:6px 10px; position:relative; cursor:grab;
    display:flex; flex-direction:column; gap:2px;
  }
  .wi-imp-chip:active { cursor:grabbing; }
  .wi-imp-rm { position:absolute;top:5px;right:8px;font-size:11px;
               cursor:pointer;color:var(--text-dim);opacity:0.6; }
  .wi-imp-rm:hover { opacity:1;color:var(--danger); }

  /* panel controls row */
  .wi-controls { display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end; }
  .wi-ctrl-lbl { font-size:9px;font-weight:700;letter-spacing:1px;
                 text-transform:uppercase;color:var(--text-dim);margin-bottom:3px; }

  /* partner toggle */
  .wi-ptoggle { display:flex;align-items:center;gap:5px;font-size:11px;
                color:var(--text-mid);cursor:pointer;user-select:none; }
  .wi-ptoggle input { cursor:pointer;accent-color:var(--text); }

  /* searchable dropdown */
  .wi-sd { position:relative; }
  .wi-sd-inp { width:180px;padding:5px 8px;font-size:11px;border-radius:5px;
               border:1px solid var(--border-mid);background:var(--bg-card);
               color:var(--text);outline:none; }
  .wi-sd-inp:focus { border-color:rgba(11,25,41,0.3);
                     box-shadow:0 0 0 2px rgba(11,25,41,0.06); }
  .wi-sd-list { display:none;position:fixed;z-index:9999;min-width:200px;
                max-height:200px;overflow-y:auto;background:var(--bg-card);
                border:1px solid var(--border-mid);border-radius:6px;
                box-shadow:0 6px 24px rgba(0,0,0,0.12); }
  .wi-sd-opt  { padding:6px 10px;font-size:11px;cursor:pointer;color:var(--text); }
  .wi-sd-opt:hover { background:var(--bg-hover); }

  /* rate inputs */
  .wi-rate { width:90px;padding:5px 8px;font-size:11px;border-radius:5px;
             border:1px solid var(--border-mid);background:var(--bg-card);
             color:var(--text);outline:none; }

  /* action buttons */
  .wi-btn-save { padding:6px 18px;font-size:11px;font-weight:600;
                 border:none;border-radius:5px;cursor:pointer;
                 background:var(--text);color:#fff;transition:opacity 0.1s; }
  .wi-btn-save:hover { opacity:0.85; }
  .wi-btn-save:disabled { opacity:0.45;cursor:default; }
  .wi-btn-del { padding:5px 14px;font-size:10.5px;border:1px solid rgba(220,38,38,0.25);
                border-radius:5px;cursor:pointer;background:none;
                color:var(--danger);transition:background 0.1s; }
  .wi-btn-del:hover { background:var(--danger-bg); }

  /* date separator */
  .wi-date-sep { padding:5px 48px;background:var(--bg);
                 border-top:1.5px solid var(--border-mid);
                 font-size:10px;font-weight:700;letter-spacing:1.3px;
                 text-transform:uppercase;color:var(--text-mid); }
  .wi-date-sep:first-child { border-top:none; }

  /* table header */
  .wi-th { display:grid;grid-template-columns:36px 1fr 180px 280px;
           background:var(--bg);border-bottom:2px solid var(--border-mid);
           position:sticky;top:0;z-index:10; }
  .wi-th-c { padding:8px 12px;font-size:10px;font-weight:700;
             letter-spacing:1.2px;text-transform:uppercase; }

  /* shelf */
  .wi-chip { background:rgba(217,119,6,0.07);border:1px solid rgba(217,119,6,0.2);
             border-radius:7px;padding:7px 11px;cursor:grab;
             min-width:130px;max-width:190px;
             transition:box-shadow 0.12s,transform 0.1s; }
  .wi-chip:hover { box-shadow:0 3px 10px rgba(0,0,0,0.09);transform:translateY(-1px); }

  /* context menu */
  #wi-ctx { display:none;position:fixed;z-index:9999;background:var(--bg-card);
            border:1px solid var(--border-mid);border-radius:8px;
            box-shadow:0 8px 28px rgba(0,0,0,0.12);min-width:210px;padding:5px 0; }
  .wi-ci2 { display:block;width:100%;padding:7px 14px;text-align:left;
            font-size:12px;cursor:pointer;color:var(--text);
            background:none;border:none;transition:background 0.1s; }
  .wi-ci2:hover { background:var(--bg-hover); }
  .wi-ci2.d { color:var(--danger); }
  .wi-csep { height:1px;background:var(--border);margin:4px 0; }
  .wi-ch   { padding:4px 14px 2px;font-size:9px;font-weight:700;
             letter-spacing:1px;text-transform:uppercase;color:var(--text-dim); }
  `;
  document.head.appendChild(s);
})();

/* ── WEEK UTILS ──────────────────────────────────────────────────── */
function _wiCurrentWeek(){
  const d=new Date(),y=d.getFullYear(),j=new Date(y,0,1);
  return Math.ceil(((d-j)/86400000+j.getDay()+1)/7);
}
function _wiWeekRange(w){
  const y=new Date().getFullYear(),j=new Date(y,0,1);
  const base=new Date(j.getTime()+(w-1)*7*86400000),day=base.getDay();
  const mon=new Date(base); mon.setDate(base.getDate()-(day===0?6:day-1));
  const sun=new Date(mon); sun.setDate(mon.getDate()+6);
  const f=d=>d.toLocaleDateString('el-GR',{day:'numeric',month:'short'});
  return `${f(mon)} – ${f(sun)}`;
}
function _wiFmt(s){ if(!s)return'—';try{const p=s.split('T')[0].split('-');return`${p[2]}/${p[1]}`;}catch{return s;} }
function _wiFmtFull(s){ if(!s)return null;try{return new Date(s).toLocaleDateString('el-GR',{weekday:'short',day:'numeric',month:'long'});}catch{return s;} }
function _wiClean(s){ return(s||'').replace(/^['"\s/]+/,'').replace(/['"\s/]+$/,'').trim(); }

/* ── LOAD ASSETS ─────────────────────────────────────────────────── */
async function _wiLoadAssets(){
  if(WINTL._assetsOk) return;
  const [t,tl,d,p]=await Promise.all([
    atGetAll(TABLES.TRUCKS,  {fields:['License Plate'],filterByFormula:'{Active}=TRUE()'}),
    atGetAll(TABLES.TRAILERS,{fields:['License Plate']}),
    atGetAll(TABLES.DRIVERS, {fields:['Full Name'],    filterByFormula:'{Active}=TRUE()'}),
    atGetAll(TABLES.PARTNERS,{fields:['Company Name']}),
  ]);
  WINTL.data.trucks   = t.map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
  WINTL.data.trailers = tl.map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
  WINTL.data.drivers  = d.map(r=>({id:r.id,label:r.fields['Full Name']||r.id}));
  WINTL.data.partners = p.map(r=>({id:r.id,label:r.fields['Company Name']||r.id}));
  WINTL._assetsOk=true;
}

/* ── MAIN ENTRY ──────────────────────────────────────────────────── */
async function renderWeeklyIntl(){
  if(can('planning')==='none'){document.getElementById('content').innerHTML=showAccessDenied();return;}
  document.getElementById('topbarTitle').textContent=`Weekly International — Week ${WINTL.week}`;
  document.getElementById('content').innerHTML=`
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;height:140px;
                color:var(--text-dim);font-size:13px">
      <div class="spinner"></div> Loading week ${WINTL.week}…
    </div>`;
  try{
    await _wiLoadAssets();
    const [allOrders,allTrips]=await Promise.all([
      atGetAll(TABLES.ORDERS,{filterByFormula:`AND({Type}='International',{Week Number}=${WINTL.week})`}),
      atGetAll(TABLES.TRIPS,{
        filterByFormula:`{Week Number}=${WINTL.week}`,
        fields:['Export Order','Import Order','Truck','Trailer','Driver','Partner',
                'Truck Plate','Trailer Plate','Driver Name','Partner Name',
                'Export Loading DateTime','Week Number','TripID',
                'Is Partner Trip','Partner Rate Export','Partner Rate Import'],
      }),
    ]);
    WINTL.data.exports=allOrders.filter(r=>r.fields.Direction==='Export')
      .sort((a,b)=>(a.fields['Loading DateTime']||'').localeCompare(b.fields['Loading DateTime']||''));
    WINTL.data.imports=allOrders.filter(r=>r.fields.Direction==='Import');
    WINTL.data.trips=allTrips;
    _wiBuildRows();
    _wiPaint();
  }catch(err){
    document.getElementById('content').innerHTML=`
      <div class="empty-state">
        <div class="icon">⚠️</div><p style="color:var(--danger)">${err.message}</p>
        <button class="btn btn-ghost" onclick="renderWeeklyIntl()" style="margin-top:12px">↺ Retry</button>
      </div>`;
  }
}

/* ── BUILD ROWS ──────────────────────────────────────────────────── */
function _wiBuildRows(){
  WINTL.rows=[];WINTL._seq=0;
  const usedExp=new Set(),usedImp=new Set();
  const {exports,imports,trips}=WINTL.data;

  for(const trip of trips){
    const f=trip.fields;
    const expIds=(f['Export Order']||[]);
    const impId=(f['Import Order']||[])[0]||null;
    expIds.forEach(id=>usedExp.add(id));
    if(impId) usedImp.add(impId);
    WINTL.rows.push({
      id:++WINTL._seq, tripRecId:trip.id,
      tripNo:f['TripID']?String(f['TripID']):'',
      exportIds:expIds, importId:impId,
      truckId:(f['Truck']||[])[0]||'',
      trailerId:(f['Trailer']||[])[0]||'',
      driverId:(f['Driver']||[])[0]||'',
      partnerId:(f['Partner']||[])[0]||'',
      truckPlate:(f['Truck Plate']||[])[0]||'',
      trailerPlate:(f['Trailer Plate']||[])[0]||'',
      driverName:(f['Driver Name']||[])[0]||'',
      partnerName:(f['Partner Name']||[])[0]||'',
      loadingDate:(f['Export Loading DateTime']||[])[0]||'',
      carrierType:!!(f['Is Partner Trip']||(f['Partner']||[]).length)?'partner':'owned',
      partnerRateExp:f['Partner Rate Export']?String(f['Partner Rate Export']):'',
      partnerRateImp:f['Partner Rate Import']?String(f['Partner Rate Import']):'',
      saved:true,
    });
  }
  for(const exp of exports.filter(r=>!usedExp.has(r.id))){
    WINTL.rows.push({
      id:++WINTL._seq, tripRecId:null, tripNo:'',
      exportIds:[exp.id], importId:null,
      truckId:'',trailerId:'',driverId:'',partnerId:'',
      truckPlate:'',trailerPlate:'',driverName:'',partnerName:'',
      loadingDate:exp.fields['Loading DateTime']||'',
      carrierType:'owned', partnerRateExp:'',partnerRateImp:'',
      saved:false,
    });
  }
  WINTL.shelf=imports.filter(r=>!usedImp.has(r.id));
}

/* ── PAINT ───────────────────────────────────────────────────────── */
function _wiPaint(){
  const {rows,shelf,week,data}=WINTL;
  const expN=data.exports.length, impN=data.imports.length;
  const onTrip=rows.filter(r=>r.saved).length;
  const pending=rows.filter(r=>!r.saved).length;
  const unmatched=shelf.length;

  document.getElementById('content').innerHTML=`
    <!-- HEADER -->
    <div class="page-header" style="margin-bottom:10px">
      <div>
        <div class="page-title">Weekly International</div>
        <div class="page-sub" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:3px">
          <span>Week ${week} · ${_wiWeekRange(week)}</span>
          <span style="color:var(--success)">${expN} exp</span>
          <span style="color:var(--warning)">${impN} imp</span>
          <span style="color:var(--text-dim)">${onTrip} on trip · ${pending} pending</span>
          ${unmatched
            ?`<span style="color:var(--warning)">${unmatched} imports unmatched</span>`
            :`<span style="color:var(--success)">all imports matched ✓</span>`}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost" style="padding:5px 20px" onclick="_wiNavWeek(-1)">← Prev</button>
        <div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:700;min-width:56px;text-align:center">W ${week}</div>
        <button class="btn btn-ghost" style="padding:5px 20px" onclick="_wiNavWeek(1)">Next →</button>
        <button class="btn btn-ghost" onclick="renderWeeklyIntl()" title="Refresh">↺</button>
      </div>
    </div>

    <!-- IMPORT SHELF — only if unmatched -->
    ${unmatched?`
    <div style="margin-bottom:10px;background:var(--bg-card);
                border:1px solid rgba(217,119,6,0.22);border-radius:10px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:7px 13px;
                  cursor:pointer;user-select:none" onclick="_wiToggleShelf()">
        <span style="font-size:10px;font-weight:700;letter-spacing:1.4px;
                     text-transform:uppercase;color:var(--warning)">IMPORT SHELF</span>
        <span style="background:rgba(217,119,6,0.12);color:var(--warning);
                     font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px">${unmatched}</span>
        ${unmatched>5?`
        <input type="text" placeholder="search…" value="${WINTL.ui.shelfFilter}"
               oninput="WINTL.ui.shelfFilter=this.value;_wiPaintShelf()"
               onclick="event.stopPropagation()"
               style="padding:3px 8px;font-size:11px;border-radius:5px;
                      border:1px solid var(--border-mid);background:var(--bg);
                      color:var(--text);width:140px;outline:none"/>`:''}
        <span style="margin-left:auto;font-size:11px;color:var(--text-dim)">
          ${WINTL.ui.shelfCollapsed?'▸':'▾'}
        </span>
      </div>
      <div id="wi-shelf" style="display:${WINTL.ui.shelfCollapsed?'none':'block'};
                                 padding:9px 12px">
        ${_wiShelfHTML()}
      </div>
    </div>` : ''}

    <!-- TABLE -->
    <div style="border:1px solid var(--border-mid);border-radius:10px;overflow:hidden;
                background:var(--bg-card)">
      <div class="wi-th">
        <div class="wi-th-c" style="border-right:1px solid var(--border-mid);
             color:var(--text-dim);font-size:9px">#</div>
        <div class="wi-th-c" style="border-right:1px solid var(--border-mid);color:var(--success)">
          ↑ Export (${expN})
          <span style="font-size:9px;font-weight:400;text-transform:none;letter-spacing:0;
                       color:var(--text-dim);margin-left:6px">right-click to group</span>
        </div>
        <div class="wi-th-c" style="border-right:1px solid var(--border-mid);
             color:var(--text-dim);text-align:center">Assignment</div>
        <div class="wi-th-c" style="color:var(--warning)">
          ↓ Import
          <span style="font-size:9px;font-weight:400;text-transform:none;letter-spacing:0;
                       color:var(--text-dim);margin-left:6px">drag from shelf</span>
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
  window._wiDragging=null;
}

/* ── SHELF ───────────────────────────────────────────────────────── */
function _wiShelfHTML(){
  const {shelf,ui}=WINTL;
  if(!shelf.length) return `<div style="font-size:12px;color:var(--text-dim)">No unmatched imports</div>`;
  const sf=ui.shelfFilter.toLowerCase();
  const vis=sf?shelf.filter(r=>{
    return((r.fields['Loading Summary']||'')+(r.fields['Delivery Summary']||'')).toLowerCase().includes(sf);
  }):shelf;
  return `<div style="display:flex;flex-wrap:wrap;gap:8px">${vis.map(_wiChip).join('')}</div>`;
}
function _wiPaintShelf(){ const el=document.getElementById('wi-shelf');if(el)el.innerHTML=_wiShelfHTML(); }
function _wiToggleShelf(){
  WINTL.ui.shelfCollapsed=!WINTL.ui.shelfCollapsed;
  const el=document.getElementById('wi-shelf');
  if(el) el.style.display=WINTL.ui.shelfCollapsed?'none':'block';
}
function _wiChip(r){
  const f=r.fields;
  const from=_wiClean(f['Loading Summary']||'—').slice(0,24);
  const to  =_wiClean(f['Delivery Summary']||'—').slice(0,20);
  const pals=f['Total Pallets']||0;
  return `
    <div class="wi-chip" draggable="true" data-impid="${r.id}"
         ondragstart="_wiDragStart(event,'${r.id}')">
      <div style="font-size:11px;font-weight:600;color:var(--text);
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis">[${from}]</div>
      <div style="font-size:10px;color:var(--text-dim)">→ ${to}</div>
      <div style="font-size:10px;color:var(--text-mid);margin-top:1px">
        ${pals} pal · del ${_wiFmt(f['Delivery DateTime'])}
      </div>
    </div>`;
}

/* ── ALL ROWS + DATE SEPARATORS ──────────────────────────────────── */
function _wiAllRowsHTML(){
  let html='', lastDate=null;
  WINTL.rows.forEach((row,i)=>{
    const exp=WINTL.data.exports.find(r=>r.id===row.exportIds[0]);
    const rawDate=row.loadingDate||exp?.fields['Loading DateTime']||null;
    const label=rawDate?_wiFmtFull(rawDate):null;
    if(label&&label!==lastDate){ lastDate=label; html+=`<div class="wi-date-sep">${label}</div>`; }
    html+=_wiRowHTML(row,i);
  });
  return html;
}

/* ── SINGLE ROW ──────────────────────────────────────────────────── */
function _wiRowHTML(row,i){
  const {data,ui}=WINTL;
  const exps=row.exportIds.map(id=>data.exports.find(r=>r.id===id)).filter(Boolean);
  const imp=row.importId?data.imports.find(r=>r.id===row.importId):null;
  const isOpen=ui.openRow===row.id;
  const isGroup=exps.length>1;
  const primary=exps[0];

  const dotColor=row.saved?'var(--success)'
    :(row.truckId||row.partnerId)?'rgba(59,130,246,0.8)':'var(--warning)';
  const rowCls=row.saved?'is-saved':row.carrierType==='partner'?'is-partner':'';

  /* ── compact export ── */
  const fromStr=_wiClean(primary?.fields['Loading Summary']||'—');
  const toStr  =_wiClean(primary?.fields['Delivery Summary']||'—');
  const pals   =isGroup?exps.reduce((s,r)=>s+(r.fields['Total Pallets']||0),0):(primary?.fields['Total Pallets']||0);
  const temp   =primary?.fields['Temperature °C']||primary?.fields['Temperature']||'';
  const veroia =primary?.fields['Veroia Switch ']||primary?.fields['Veroia Switch'];
  const loadDt =_wiFmt(primary?.fields['Loading DateTime']);
  const delDt  =_wiFmt(primary?.fields['Delivery DateTime']);

  /* ── compact assignment badge ── */
  const plate  =row.truckPlate  ||data.trucks.find(t=>t.id===row.truckId)?.label||'';
  const driver =row.driverName  ||data.drivers.find(d=>d.id===row.driverId)?.label||'';
  const partner=row.partnerName ||data.partners.find(p=>p.id===row.partnerId)?.label||'';
  let asgnBadge;
  if(row.carrierType==='partner'){
    asgnBadge=partner
      ?`<div style="text-align:center"><div class="wi-asgn-partner">${partner}</div>
         ${row.tripNo?`<div class="wi-asgn-trip">#${row.tripNo}</div>`:''}</div>`
      :`<span class="wi-asgn-empty">— pending —</span>`;
  } else {
    asgnBadge=plate
      ?`<div style="text-align:center">
          <div class="wi-asgn-plate">${plate}</div>
          ${driver?`<div class="wi-asgn-driver">${driver.trim().split(/\s+/).pop()}</div>`:''}
          ${row.tripNo?`<div class="wi-asgn-trip">#${row.tripNo}</div>`:''}
        </div>`
      :`<span class="wi-asgn-empty">— click to assign —</span>`;
  }

  /* ── compact import ── */
  const impCompact=imp
    ?`<span class="wi-imp-compact">
        ${_wiClean(imp.fields['Delivery Summary']||'—')} · ${imp.fields['Total Pallets']||0} pal
      </span>`
    :`<span class="wi-imp-empty-c">— empty —</span>`;

  /* ── expanded panel (if open) ── */
  const panelHTML=isOpen?_wiPanelHTML(row):'';

  return `
  <div id="wi-row-${row.id}" class="wi-row ${rowCls}">
    <!-- compact click row -->
    <div class="wi-compact" oncontextmenu="_wiCtx(event,${row.id})"
         onclick="_wiToggle(${row.id})">
      <!-- # -->
      <div class="wi-cn">
        <div class="wi-dot" style="background:${dotColor}"></div>
        <span style="font-size:9px;color:var(--text-dim)">${i+1}</span>
      </div>
      <!-- export -->
      <div class="wi-ce" style="cursor:pointer">
        <div class="wi-route">
          <b>${fromStr}</b>
          <span class="arr">→</span>
          <span class="dim">${toStr}</span>
          ${isGroup?`<span class="wi-b wi-b-gr">GROUPAGE ×${exps.length}</span>`:''}
          ${veroia?`<span class="wi-b wi-b-vx">VEROIA</span>`:''}
        </div>
        <div class="wi-meta">
          <span>📅 ${loadDt}→${delDt}</span>
          <span>📦 ${pals} pal</span>
          ${temp?`<span>🌡 ${temp}°C</span>`:''}
        </div>
      </div>
      <!-- assignment badge -->
      <div class="wi-ca">${asgnBadge}</div>
      <!-- import compact preview -->
      <div class="wi-ci"
           ondragover="event.preventDefault();event.stopPropagation()"
           ondrop="event.stopPropagation();_wiDropCompact(event,${row.id})">
        ${impCompact}
      </div>
    </div>
    ${panelHTML}
  </div>`;
}

/* ── PANEL (expanded) ────────────────────────────────────────────── */
function _wiPanelHTML(row){
  const {trucks,trailers,drivers,partners}=WINTL.data;
  const isPartner=row.carrierType==='partner';
  const canFull=can('planning')==='full';
  const imp=row.importId?WINTL.data.imports.find(r=>r.id===row.importId):null;

  /* carrier toggle */
  const toggle=`
    <label class="wi-ptoggle" onclick="event.stopPropagation()">
      <input type="checkbox" ${isPartner?'checked':''}
             onchange="_wiSetCarrier(${row.id},this.checked?'partner':'owned')"/>
      Partner trip
    </label>`;

  /* fields */
  let fields='';
  if(!isPartner){
    fields=`
      <div onclick="event.stopPropagation()">
        <div class="wi-ctrl-lbl">Truck</div>
        ${_wiSdrop('tk',row.id,trucks,row.truckId,row.truckPlate||'Truck plate…')}
      </div>
      <div onclick="event.stopPropagation()">
        <div class="wi-ctrl-lbl">Trailer</div>
        ${_wiSdrop('tl',row.id,trailers,row.trailerId,row.trailerPlate||'Trailer plate…')}
      </div>
      <div onclick="event.stopPropagation()">
        <div class="wi-ctrl-lbl">Driver</div>
        ${_wiSdrop('dr',row.id,drivers,row.driverId,row.driverName||'Driver…')}
      </div>`;
  } else {
    fields=`
      <div onclick="event.stopPropagation()">
        <div class="wi-ctrl-lbl">Partner</div>
        ${_wiSdrop('pt',row.id,partners,row.partnerId,row.partnerName||'Partner…')}
      </div>
      <div onclick="event.stopPropagation()">
        <div class="wi-ctrl-lbl">Exp €</div>
        <input class="wi-rate" type="number" placeholder="0.00" value="${row.partnerRateExp||''}"
               oninput="_wiField(${row.id},'partnerRateExp',this.value)"
               onclick="event.stopPropagation()"/>
      </div>
      <div onclick="event.stopPropagation()">
        <div class="wi-ctrl-lbl">Imp €</div>
        <input class="wi-rate" type="number" placeholder="0.00" value="${row.partnerRateImp||''}"
               oninput="_wiField(${row.id},'partnerRateImp',this.value)"
               onclick="event.stopPropagation()"/>
      </div>`;
  }

  /* actions */
  const actions=canFull?(row.saved
    ?`<div onclick="event.stopPropagation()" style="display:flex;flex-direction:column;gap:4px">
        <button class="wi-btn-save" id="wi-btn-${row.id}" onclick="event.stopPropagation();_wiSaveTrip(${row.id})">Update</button>
        <button class="wi-btn-del"  onclick="event.stopPropagation();_wiDeleteTrip(${row.id})">Delete</button>
      </div>`
    :`<div onclick="event.stopPropagation()" style="display:flex;flex-direction:column;gap:4px">
        <button class="wi-btn-save" id="wi-btn-${row.id}" onclick="event.stopPropagation();_wiSaveTrip(${row.id})">🔗 Create Trip</button>
        <button class="wi-btn-save" style="background:var(--text-dim);font-size:10px"
                onclick="event.stopPropagation();_wiSaveTrip(${row.id},true)">Export only</button>
      </div>`)
    :'';

  /* import drop zone */
  const impZone=`
    <div>
      <div class="wi-ctrl-lbl" style="margin-bottom:4px">Import — drag from shelf or drop here</div>
      <div id="wi-impz-${row.id}" class="wi-panel-imp"
           ondragover="event.preventDefault();document.getElementById('wi-impz-${row.id}').classList.add('drop-hover')"
           ondragleave="document.getElementById('wi-impz-${row.id}').classList.remove('drop-hover')"
           ondrop="event.stopPropagation();_wiDrop(event,${row.id})">
        ${imp?`
          <div class="wi-imp-chip" draggable="true" data-impid="${imp.id}"
               ondragstart="_wiDragStart(event,'${imp.id}')">
            <span class="wi-imp-rm" onclick="event.stopPropagation();_wiRemoveImport(${row.id})">✕</span>
            <div style="font-size:11px;font-weight:600;color:var(--text);padding-right:18px">
              ${_wiClean(imp.fields['Loading Summary']||'—')}
            </div>
            <div style="font-size:10px;color:var(--text-dim)">
              → ${_wiClean(imp.fields['Delivery Summary']||'—')} · 📦 ${imp.fields['Total Pallets']||0} pal
            </div>
            <div style="font-size:10px;color:var(--text-mid);margin-top:2px">
              📅 ${_wiFmt(imp.fields['Loading DateTime'])}→${_wiFmt(imp.fields['Delivery DateTime'])}
            </div>
          </div>`
          :`<span style="font-size:11px;color:var(--border-dark,#ccc)">— drop import here —</span>`}
      </div>
    </div>`;

  return `
    <div class="wi-panel" onclick="event.stopPropagation()">
      <div class="wi-controls">
        ${toggle}
        ${fields}
        ${actions}
      </div>
      ${impZone}
    </div>`;
}

/* ── SEARCHABLE DROPDOWN ─────────────────────────────────────────── */
function _wiSdrop(prefix,rowId,arr,selectedId,placeholder){
  const id=`${prefix}_${rowId}`;
  const selLabel=arr.find(x=>x.id===selectedId)?.label||'';
  const opts=arr.map(x=>{
    const lbl=(x.label||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    return `<div class="wi-sd-opt" data-id="${x.id}" data-lbl="${lbl}">${lbl}</div>`;
  }).join('');
  return `
    <div class="wi-sd" id="wsd-${id}">
      <input type="text" class="wi-sd-inp" placeholder="${placeholder}"
             value="${selLabel.replace(/"/g,'&quot;')}"
             oninput="_wiSdFilter('${id}',this.value)"
             onfocus="_wiSdOpen('${id}')"
             autocomplete="off"/>
      <input type="hidden" id="wsd-val-${id}" value="${selectedId||''}"/>
      <div id="wsd-list-${id}" class="wi-sd-list">${opts}</div>
    </div>`;
}
document.addEventListener('click',e=>{
  const opt=e.target.closest('.wi-sd-opt');
  if(opt){
    const list=opt.closest('.wi-sd-list');if(!list)return;
    const id=list.id.replace('wsd-list-','');
    _wiSdPick(id,opt.dataset.id,opt.dataset.lbl||opt.textContent.trim());
    e.stopPropagation();return;
  }
  if(!e.target.closest('.wi-sd'))
    document.querySelectorAll('.wi-sd-list').forEach(el=>el.style.display='none');
});
function _wiSdOpen(id){
  document.querySelectorAll('.wi-sd-list').forEach(el=>{if(el.id!=='wsd-list-'+id) el.style.display='none';});
  const inp=document.querySelector(`#wsd-${id} .wi-sd-inp`);
  const list=document.getElementById('wsd-list-'+id);
  if(!inp||!list) return;
  const r=inp.getBoundingClientRect();
  Object.assign(list.style,{display:'block',left:`${r.left}px`,
    top:`${r.bottom+2}px`,width:`${Math.max(r.width,200)}px`});
  list.querySelectorAll('.wi-sd-opt').forEach(el=>el.style.display='');
}
function _wiSdFilter(id,q){
  const list=document.getElementById('wsd-list-'+id);
  if(!list||list.style.display==='none') _wiSdOpen(id);
  const ql=q.toLowerCase();
  list.querySelectorAll('.wi-sd-opt').forEach(el=>{
    el.style.display=(el.dataset.lbl||el.textContent).toLowerCase().includes(ql)?'':'none';
  });
}
function _wiSdPick(id,recId,label){
  const v=document.getElementById('wsd-val-'+id);if(v) v.value=recId;
  const inp=document.querySelector(`#wsd-${id} .wi-sd-inp`);if(inp) inp.value=label;
  const list=document.getElementById('wsd-list-'+id);if(list) list.style.display='none';
  const parts=id.split('_'),prefix=parts[0],rowId=parseInt(parts[parts.length-1]);
  const fm={tk:'truckId',tl:'trailerId',dr:'driverId',pt:'partnerId'};
  const lm={tk:'truckPlate',tl:'trailerPlate',dr:'driverName',pt:'partnerName'};
  if(fm[prefix]&&!isNaN(rowId)){_wiField(rowId,fm[prefix],recId);_wiField(rowId,lm[prefix],label);}
}

/* ── STATE ───────────────────────────────────────────────────────── */
function _wiField(rowId,field,val){
  const row=WINTL.rows.find(r=>r.id===rowId); if(row) row[field]=val;
}
function _wiSetCarrier(rowId,type){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  row.carrierType=type; _wiRepaintRow(rowId);
}
function _wiToggle(rowId){
  WINTL.ui.openRow=WINTL.ui.openRow===rowId?null:rowId;
  _wiRepaintRow(rowId);
  // Close any other open row
  WINTL.rows.filter(r=>r.id!==rowId).forEach(r=>{
    const el=document.querySelector(`#wi-row-${r.id} .wi-panel`);
    if(el) _wiRepaintRow(r.id);
  });
}
function _wiRepaintRow(rowId){
  const el=document.getElementById('wi-row-'+rowId);
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!el||!row){_wiPaint();return;}
  const idx=WINTL.rows.findIndex(r=>r.id===rowId);
  el.outerHTML=_wiRowHTML(row,idx);
}

/* ── DRAG & DROP ─────────────────────────────────────────────────── */
window._wiDragging=null;
function _wiDragStart(e,impId){window._wiDragging=impId;e.dataTransfer.effectAllowed='move';}
function _wiDrop(e,rowId){
  e.preventDefault();
  document.getElementById('wi-impz-'+rowId)?.classList.remove('drop-hover');
  const impId=window._wiDragging;if(!impId) return;
  window._wiDragging=null;
  _wiAssignImport(rowId,impId);
  _wiPaintShelf();_wiRepaintRow(rowId);
}
function _wiDropCompact(e,rowId){
  // Drop on compact row — open panel & assign
  const impId=window._wiDragging;if(!impId) return;
  window._wiDragging=null;
  WINTL.ui.openRow=rowId;
  _wiAssignImport(rowId,impId);
  _wiPaintShelf();_wiRepaintRow(rowId);
}
function _wiAssignImport(rowId,impId){
  WINTL.shelf=WINTL.shelf.filter(r=>r.id!==impId);
  WINTL.rows.forEach(r=>{if(r.importId===impId) r.importId=null;});
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  if(row.importId){
    const old=WINTL.data.imports.find(r=>r.id===row.importId);
    if(old&&!WINTL.shelf.find(r=>r.id===old.id)) WINTL.shelf.push(old);
  }
  row.importId=impId;
}
function _wiRemoveImport(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row||!row.importId) return;
  const imp=WINTL.data.imports.find(r=>r.id===row.importId);
  if(imp&&!WINTL.shelf.find(r=>r.id===imp.id)) WINTL.shelf.push(imp);
  row.importId=null;
  _wiPaintShelf();_wiRepaintRow(rowId);
}

/* ── CONTEXT MENU ────────────────────────────────────────────────── */
function _wiCtx(e,rowId){
  e.preventDefault();e.stopPropagation();
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const isGroup=row.exportIds.length>1;
  const others=WINTL.rows.filter(r=>r.id!==rowId&&!r.saved);
  const item=(lbl,fn,d=false)=>
    `<button class="wi-ci2 ${d?'d':''}" onclick="${fn};_wiCtxClose()">${lbl}</button>`;
  let html='';
  if(others.length){
    html+=`<div class="wi-ch">GROUPAGE</div>`;
    others.slice(0,6).forEach(o=>{
      const exp=WINTL.data.exports.find(r=>r.id===o.exportIds[0]);
      const lbl=_wiClean(exp?.fields['Delivery Summary']||`Row ${o.id}`).slice(0,28);
      html+=item(`🔗 Group with: ${lbl}`,`_wiMerge(${rowId},${o.id})`);
    });
    html+=`<div class="wi-csep"></div>`;
  }
  if(isGroup) html+=item('✂️ Split groupage',`_wiSplit(${rowId})`);
  if(row.importId) html+=item('✕ Remove import',`_wiRemoveImport(${rowId})`);
  html+=item('↗ View export order',`_wiViewExport(${rowId})`);
  if(!row.saved){html+=`<div class="wi-csep"></div>`;html+=item('🗑 Remove row',`_wiDeleteRow(${rowId})`,true);}
  const ctx=document.getElementById('wi-ctx');
  ctx.innerHTML=html;
  Object.assign(ctx.style,{display:'block',
    left:`${Math.min(e.clientX,window.innerWidth-220)}px`,
    top:`${Math.min(e.clientY,window.innerHeight-260)}px`});
  setTimeout(()=>document.addEventListener('click',_wiCtxClose,{once:true}),10);
}
function _wiCtxClose(){const el=document.getElementById('wi-ctx');if(el)el.style.display='none';}

/* ── GROUPAGE ────────────────────────────────────────────────────── */
function _wiMerge(rowId,otherId){
  const row=WINTL.rows.find(r=>r.id===rowId),other=WINTL.rows.find(r=>r.id===otherId);
  if(!row||!other)return;
  other.exportIds.forEach(id=>{if(!row.exportIds.includes(id))row.exportIds.push(id);});
  if(!row.importId&&other.importId)row.importId=other.importId;
  else if(other.importId&&row.importId!==other.importId){
    const imp=WINTL.data.imports.find(r=>r.id===other.importId);
    if(imp&&!WINTL.shelf.find(r=>r.id===imp.id))WINTL.shelf.push(imp);
  }
  WINTL.rows=WINTL.rows.filter(r=>r.id!==otherId);
  _wiPaint();toast('Grouped ✓');
}
function _wiSplit(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row||row.exportIds.length<=1)return;
  const [first,...rest]=row.exportIds;row.exportIds=[first];
  rest.forEach(expId=>{
    const exp=WINTL.data.exports.find(r=>r.id===expId);
    WINTL.rows.push({id:++WINTL._seq,tripRecId:null,tripNo:'',exportIds:[expId],importId:null,
      truckId:'',trailerId:'',driverId:'',partnerId:'',
      truckPlate:'',trailerPlate:'',driverName:'',partnerName:'',
      loadingDate:exp?.fields['Loading DateTime']||'',
      carrierType:'owned',partnerRateExp:'',partnerRateImp:'',saved:false});
  });
  _wiPaint();toast('Split ✓');
}
function _wiDeleteRow(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row)return;
  if(row.importId){
    const imp=WINTL.data.imports.find(r=>r.id===row.importId);
    if(imp&&!WINTL.shelf.find(r=>r.id===imp.id))WINTL.shelf.push(imp);
  }
  WINTL.rows=WINTL.rows.filter(r=>r.id!==rowId);_wiPaint();
}
function _wiViewExport(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(row?.exportIds?.[0]){navigate('orders_intl');
    setTimeout(()=>{if(typeof showIntlDetail==='function')showIntlDetail(row.exportIds[0]);},500);}
}

/* ── SAVE / DELETE ───────────────────────────────────────────────── */
async function _wiSaveTrip(rowId,exportOnly=false){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row)return;
  const sync=(prefix,fld,lbl)=>{
    const id=`${prefix}_${rowId}`;
    const val=document.getElementById(`wsd-val-${id}`)?.value;
    const label=document.querySelector(`#wsd-${id} .wi-sd-inp`)?.value;
    if(val){row[fld]=val;row[lbl]=label||'';}
  };
  sync('tk','truckId','truckPlate');sync('tl','trailerId','trailerPlate');
  sync('dr','driverId','driverName');sync('pt','partnerId','partnerName');
  if(!row.exportIds.length){toast('No export order','warn');return;}
  const isPartner=row.carrierType==='partner';
  if(isPartner&&!row.partnerId){toast('Select a partner first','warn');return;}
  const btn=document.getElementById('wi-btn-'+rowId);
  if(btn){btn.disabled=true;btn.textContent='Saving…';}
  try{
    const fields={'Export Order':row.exportIds,'Week Number':WINTL.week};
    if(!exportOnly&&row.importId) fields['Import Order']=[row.importId];
    if(isPartner){
      if(row.partnerId)       fields['Partner']=[row.partnerId];
      if(row.partnerRateExp)  fields['Partner Rate Export']=parseFloat(row.partnerRateExp)||0;
      if(row.partnerRateImp)  fields['Partner Rate Import']=parseFloat(row.partnerRateImp)||0;
      fields['Is Partner Trip']=true;
    }else{
      if(row.truckId)   fields['Truck']=[row.truckId];
      if(row.trailerId) fields['Trailer']=[row.trailerId];
      if(row.driverId)  fields['Driver']=[row.driverId];
    }
    if(row.saved&&row.tripRecId) await atPatch(TABLES.TRIPS,row.tripRecId,fields);
    else await atCreate(TABLES.TRIPS,fields);
    toast(row.saved?'Trip updated ✓':'Trip created ✓');
    WINTL.ui.openRow=null;WINTL._assetsOk=true;await renderWeeklyIntl();
  }catch(err){
    if(btn){btn.disabled=false;btn.textContent=row.saved?'Update':'🔗 Create Trip';}
    alert('Save failed: '+err.message);
  }
}
async function _wiDeleteTrip(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row?.tripRecId)return;
  if(!confirm('Delete this trip?'))return;
  try{
    await atDelete(TABLES.TRIPS,row.tripRecId);toast('Trip deleted');
    WINTL.ui.openRow=null;WINTL._assetsOk=true;await renderWeeklyIntl();
  }catch(err){alert('Delete failed: '+err.message);}
}

/* ── NAVIGATION ──────────────────────────────────────────────────── */
function _wiNavWeek(delta){
  WINTL.week=Math.max(1,Math.min(53,WINTL.week+delta));
  WINTL.ui.openRow=null;WINTL._assetsOk=true;renderWeeklyIntl();
}
