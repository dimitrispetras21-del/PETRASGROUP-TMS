// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL — v12
// ─────────────────────────────────────────────────────────────────────
// ORDERS-only. No TRIPS.
//
// Fields read from ORDERS:
//   Direction, Type, " Week Number", Loading DateTime, Delivery DateTime,
//   Loading Summary, Delivery Summary, Total Pallets, Veroia Switch ,
//   Truck[], Trailer[], Driver[], Partner[], Is Partner Trip,
//   Partner Truck Plates, Matched Import ID
//
// Fields written on assignment save:
//   Truck, Trailer, Driver, Partner, Is Partner Trip, Partner Truck Plates
//
// Fields written on import drop (auto-save, independent):
//   Matched Import ID  (stores import order record ID as text)
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const WINTL = {
  week:      _wiCurrentWeek(),
  data:      { exports:[], imports:[], trucks:[], trailers:[], drivers:[], partners:[] },
  rows:      [],
  shelf:     [],
  ui:        { openRow:null, shelfFilter:'', shelfCollapsed:false },
  _seq:      0,
};

/* ── CSS ──────────────────────────────────────────────────────────── */
(function(){
  if(document.getElementById('wi12')) return;
  const s=document.createElement('style'); s.id='wi12';
  s.textContent=`
.wi-wrap { border:1px solid var(--border-mid); border-radius:10px; overflow:hidden; background:var(--bg-card); }
.wi-head {
  display:grid; grid-template-columns:48px 1fr 220px 1fr;
  background:var(--bg); border-bottom:2px solid var(--border-mid);
  position:sticky; top:0; z-index:20;
}
.wi-hc { padding:8px 13px; font-size:9.5px; font-weight:700; letter-spacing:1.3px;
  text-transform:uppercase; color:var(--text-dim); border-right:1px solid var(--border); }
.wi-hc:last-child { border-right:none; }

/* date separator */
.wi-dsep { display:flex; align-items:center; gap:10px; padding:0 13px; height:28px;
  background:var(--navy-mid); border-top:1px solid rgba(255,255,255,0.04); }
.wi-dsep:first-child { border-top:none; }
.wi-dsep-lbl  { font-size:9px; color:rgba(196,207,219,0.45); text-transform:uppercase; letter-spacing:.8px; }
.wi-dsep-date { font-family:'Syne',sans-serif; font-size:10px; font-weight:700;
  letter-spacing:1.4px; text-transform:uppercase; color:var(--silver); }
.wi-dsep-n { font-size:9px; color:var(--silver-dim); }

/* row */
.wi-row { border-top:1px solid var(--border); display:flex; flex-direction:column; position:relative; }
.wi-row::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; }
.wi-row.s-ok::before      { background:var(--success); }
.wi-row.s-partner::before { background:rgba(59,130,246,0.65); }
.wi-row.s-pending::before { background:rgba(217,119,6,0.4); }
.wi-row.s-ok      { background:rgba(5,150,105,0.025); }
.wi-row.s-partner { background:rgba(59,130,246,0.022); }
.wi-row:hover .wi-compact { background:rgba(0,0,0,0.009); }

.wi-compact {
  display:grid; grid-template-columns:48px 1fr 220px 1fr;
  min-height:42px; align-items:stretch; cursor:pointer;
}
.wi-cn { display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:4px; padding:4px 0; border-right:1px solid var(--border); }
.wi-dot { width:6px; height:6px; border-radius:50%; }
.wi-num { font-size:9px; color:var(--text-dim); }

.wi-ce { padding:6px 13px; border-right:1px solid var(--border);
  display:flex; flex-direction:column; gap:2px; justify-content:center; overflow:hidden; }
.wi-route { font-size:11.5px; font-weight:700; color:var(--text);
  display:flex; align-items:center; gap:0; min-width:0; }
.wi-route .from { font-weight:700; color:var(--text);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  min-width:0; flex-shrink:1; }
.wi-route .sep  { color:var(--text-dim); margin:0 5px; font-weight:300; flex-shrink:0; }
.wi-route .dest { font-weight:700; color:var(--text);
  white-space:nowrap; flex-shrink:0; }
.wi-sub { font-size:10px; font-weight:600; color:var(--text-mid); display:flex; align-items:center; gap:7px; }
.wi-sub-div { width:1px; height:9px; background:var(--border-mid); }
.wi-vx { display:inline-block; font-size:7.5px; font-weight:800; letter-spacing:1px;
  text-transform:uppercase; padding:1px 5px; border-radius:3px; vertical-align:middle; margin-left:4px;
  background:rgba(99,102,241,0.1); color:rgba(99,102,241,0.85); border:1px solid rgba(99,102,241,0.2); }
.wi-gr { display:inline-block; font-size:7.5px; font-weight:800; letter-spacing:1px;
  text-transform:uppercase; padding:1px 5px; border-radius:3px; vertical-align:middle; margin-left:4px;
  background:rgba(14,165,233,0.1); color:rgba(14,165,233,0.85); border:1px solid rgba(14,165,233,0.18); }

/* assignment col */
.wi-ca { padding:6px 10px; border-right:1px solid var(--border);
  background:var(--bg); display:flex; align-items:center; justify-content:center; }
.wi-pill { display:flex; flex-direction:column; align-items:center;
  padding:4px 11px; border-radius:14px; max-width:200px; overflow:hidden; gap:1px; }
.wi-pill-ok { background:rgba(5,150,105,0.08); border:1px solid rgba(5,150,105,0.2); }
.wi-pill-bp { background:rgba(59,130,246,0.08); border:1px solid rgba(59,130,246,0.2); }
.wi-pill-un { background:rgba(217,119,6,0.07); border:1px solid rgba(217,119,6,0.2); }
.wi-pill-ok .pt { color:rgba(5,150,105,0.95); }
.wi-pill-bp .pt { color:rgba(59,130,246,0.9); }
.wi-pill-un .pt { color:rgba(217,119,6,0.85); }
.pt { font-size:10.5px; font-weight:700; white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; max-width:192px; }
.ps { font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  max-width:192px; opacity:.75; color:var(--text-mid); }

/* import col */
.wi-ci { padding:6px 13px; display:flex; align-items:center; transition:background .1s; }
.wi-ci.dh { background:rgba(217,119,6,0.04); }
.wi-ci-data { display:flex; flex-direction:column; gap:1px; width:100%; overflow:hidden; }
.wi-ci-n { font-size:11px; font-weight:600; color:var(--text);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wi-ci-s { font-size:10px; color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wi-ci-e { font-size:10px; color:var(--border-dark); }
.wi-ci-save { font-size:9px; color:var(--success); margin-top:1px; }

/* PANEL */
.wi-panel { border-top:1px solid var(--border); background:var(--bg);
  padding:10px 14px 12px 13px; display:flex; flex-direction:column; gap:10px; }
.wi-panel-fields { display:flex; flex-wrap:wrap; gap:6px; align-items:flex-end; }
.wi-pf { display:flex; flex-direction:column; gap:3px; }
.wi-plbl { font-size:8.5px; font-weight:700; letter-spacing:1px;
  text-transform:uppercase; color:var(--text-dim); }
.wi-div { width:1px; height:34px; background:var(--border-mid); align-self:flex-end; margin:0 3px; }

/* dropdown */
.wi-sd { position:relative; }
.wi-sdi { width:156px; padding:6px 9px; font-size:11px; border-radius:5px;
  border:1px solid var(--border-mid); background:var(--bg-card); color:var(--text); outline:none; }
.wi-sdi:focus { border-color:rgba(11,25,41,0.3); box-shadow:0 0 0 2px rgba(11,25,41,0.06); }
.wi-sdl { display:none; position:fixed; z-index:9999; min-width:185px; max-height:220px;
  overflow-y:auto; background:var(--bg-card); border:1px solid var(--border-mid);
  border-radius:6px; box-shadow:0 6px 24px rgba(0,0,0,0.12); }
.wi-sdo { padding:6px 10px; font-size:11px; cursor:pointer; color:var(--text);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wi-sdo:hover { background:var(--bg-hover); }

.wi-ti { width:156px; padding:6px 9px; font-size:11px; border-radius:5px;
  border:1px solid var(--border-mid); background:var(--bg-card); color:var(--text); outline:none; }
.wi-ti:focus { border-color:rgba(11,25,41,0.3); }

/* buttons */
.wi-btn { padding:6px 20px; font-size:11px; font-weight:600; border:none; border-radius:5px;
  cursor:pointer; background:var(--text); color:#fff; transition:opacity .1s; white-space:nowrap; }
.wi-btn:hover { opacity:.85; }
.wi-btn:disabled { opacity:.4; cursor:default; }
.wi-btn-d { padding:5px 13px; font-size:10.5px; border:1px solid rgba(220,38,38,0.22);
  border-radius:5px; cursor:pointer; background:none; color:var(--danger); }
.wi-btn-d:hover { background:var(--danger-bg); }

/* import drop zone in panel */
.wi-piz { min-height:50px; border:1.5px dashed var(--border-mid); border-radius:7px;
  padding:7px 12px; display:flex; align-items:center; transition:background .1s, border-color .1s; }
.wi-piz.dh { background:rgba(217,119,6,0.05); border-color:rgba(217,119,6,0.35); }
.wi-ichip { width:100%; padding:6px 26px 6px 10px; position:relative;
  background:rgba(217,119,6,0.07); border:1px solid rgba(217,119,6,0.2);
  border-radius:6px; cursor:grab; display:flex; flex-direction:column; gap:2px; }
.wi-ichip:active { cursor:grabbing; }
.wi-irm { position:absolute; top:7px; right:8px; font-size:11px;
  cursor:pointer; color:var(--text-dim); opacity:.5; }
.wi-irm:hover { opacity:1; color:var(--danger); }
.wi-inone { font-size:10px; color:var(--border-dark); }

/* shelf */
.wi-shelf { background:var(--bg-card); border:1px solid rgba(217,119,6,0.2);
  border-radius:10px; overflow:hidden; margin-bottom:12px; }
.wi-shelf-hdr { display:flex; align-items:center; gap:8px; padding:8px 14px;
  cursor:pointer; user-select:none; }
.wi-shelf-hdr:hover { background:var(--bg-hover); }
.wi-shelf-ttl { font-size:10px; font-weight:700; letter-spacing:1.5px;
  text-transform:uppercase; color:var(--warning); }
.wi-shelf-n { background:rgba(217,119,6,0.1); color:var(--warning);
  font-size:9.5px; font-weight:700; padding:1px 8px; border-radius:10px; }
.wi-chips { display:flex; flex-wrap:wrap; gap:8px; padding:10px 14px 12px; }
.wi-chip { padding:7px 11px; border-radius:8px; cursor:grab; min-width:138px; max-width:205px;
  background:rgba(217,119,6,0.06); border:1px solid rgba(217,119,6,0.18);
  transition:box-shadow .12s, transform .1s; }
.wi-chip:hover { box-shadow:0 3px 10px rgba(0,0,0,0.08); transform:translateY(-1px); }
.wi-chip:active { cursor:grabbing; }
.wi-chip-n { font-size:11px; font-weight:700; color:var(--text);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wi-chip-d { font-size:10px; color:var(--text-dim); margin-top:1px; }
.wi-chip-m { font-size:9.5px; color:var(--text-dim); margin-top:1px; }

/* ctx menu */
#wi-ctx { display:none; position:fixed; z-index:9999; background:var(--bg-card);
  border:1px solid var(--border-mid); border-radius:8px;
  box-shadow:0 8px 28px rgba(0,0,0,0.12); min-width:210px; padding:5px 0; }
.wi-ctx-i { display:block; width:100%; padding:7px 14px; text-align:left; font-size:12px;
  cursor:pointer; color:var(--text); background:none; border:none; transition:background .07s; }
.wi-ctx-i:hover { background:var(--bg-hover); }
.wi-ctx-i.d { color:var(--danger); }
.wi-ctx-sep { height:1px; background:var(--border); margin:4px 0; }
.wi-ctx-h { padding:4px 14px 2px; font-size:9px; font-weight:700;
  letter-spacing:1px; text-transform:uppercase; color:var(--text-dim); }
`;
  document.head.appendChild(s);
})();

/* ── UTILS ─────────────────────────────────────────────────────────── */
function _wiCurrentWeek(){
  const d=new Date(),y=d.getFullYear(),j=new Date(y,0,1);
  return Math.ceil(((d-j)/86400000+j.getDay()+1)/7);
}
function _wiWeekRange(w){
  const y=new Date().getFullYear(),j=new Date(y,0,1);
  const b=new Date(j.getTime()+(w-1)*7*86400000),day=b.getDay();
  const m=new Date(b); m.setDate(b.getDate()-(day===0?6:day-1));
  const s=new Date(m); s.setDate(m.getDate()+6);
  const f=d=>d.toLocaleDateString('el-GR',{day:'numeric',month:'short'});
  return `${f(m)} – ${f(s)}`;
}
function _wiFmt(s){
  if(!s) return '—';
  try{const p=s.split('T')[0].split('-');return`${p[2]}/${p[1]}`;}catch{return s;}
}
function _wiFmtFull(s){
  if(!s) return null;
  try{return new Date(s).toLocaleDateString('el-GR',{weekday:'long',day:'numeric',month:'long'});}
  catch{return s;}
}
function _wiClean(s){return(s||'').replace(/^['"\s/]+/,'').replace(/['"\s/]+$/,'').trim();}
function _wiFv(v){return Array.isArray(v)?v[0]||'':v||'';}

/* ── LOAD ASSETS ───────────────────────────────────────────────────── */
async function _wiLoadAssets(){
  const [t,tl,d,p]=await Promise.all([
    atGetAll(TABLES.TRUCKS,  {fields:['License Plate'],filterByFormula:'{Active}=TRUE()'},false),
    atGetAll(TABLES.TRAILERS,{fields:['License Plate']},false),
    atGetAll(TABLES.DRIVERS, {fields:['Full Name'],    filterByFormula:'{Active}=TRUE()'},false),
    atGetAll(TABLES.PARTNERS,{fields:['Company Name']},false),
  ]);
  WINTL.data.trucks   = t.map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
  WINTL.data.trailers = tl.map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
  WINTL.data.drivers  = d.map(r=>({id:r.id,label:r.fields['Full Name']||r.id}));
  WINTL.data.partners = p.map(r=>({id:r.id,label:r.fields['Company Name']||r.id}));
}

/* ── MAIN ENTRY ────────────────────────────────────────────────────── */
async function renderWeeklyIntl(){
  if(can('planning')==='none'){document.getElementById('content').innerHTML=showAccessDenied();return;}
  document.getElementById('topbarTitle').textContent=`Weekly International — Week ${WINTL.week}`;
  document.getElementById('content').innerHTML=`
    <div style="display:flex;align-items:center;justify-content:center;
                gap:10px;height:160px;color:var(--text-dim);font-size:13px">
      <div class="spinner"></div> Loading week ${WINTL.week}…
    </div>`;
  try{
    await _wiLoadAssets();
    const allOrders = await atGetAll(TABLES.ORDERS,{
      filterByFormula:`AND({Type}='International',{ Week Number}=${WINTL.week})`,
    },false);

    WINTL.data.exports = allOrders
      .filter(r=>r.fields.Direction==='Export')
      .sort((a,b)=>(
        (a.fields['Delivery DateTime']||a.fields['Loading DateTime']||'')
        .localeCompare(b.fields['Delivery DateTime']||b.fields['Loading DateTime']||'')
      ));
    WINTL.data.imports = allOrders.filter(r=>r.fields.Direction==='Import');

    _wiBuildRows();
    _wiPaint();
  }catch(err){
    document.getElementById('content').innerHTML=`
      <div class="empty-state">
        <p style="color:var(--danger);font-size:13px">${err.message}</p>
        <button class="btn btn-ghost" onclick="renderWeeklyIntl()" style="margin-top:12px">Retry</button>
      </div>`;
  }
}

/* ── BUILD ROWS ────────────────────────────────────────────────────── */
function _wiBuildRows(){
  WINTL.rows=[];WINTL._seq=0;
  const {exports,imports}=WINTL.data;

  // Map import ID → import record for fast lookup
  const impById={};
  imports.forEach(r=>impById[r.id]=r);

  // Build shelf: imports not matched
  const matchedImports=new Set(
    exports.map(r=>r.fields['Matched Import ID']).filter(Boolean)
  );

  WINTL.shelf=imports.filter(r=>!matchedImports.has(r.id));

  for(const exp of exports){
    const f=exp.fields;
    const truckId  =(f['Truck']  ||[])[0]||'';
    const trailerId=(f['Trailer']||[])[0]||'';
    const driverId =(f['Driver'] ||[])[0]||'';
    const partnerId=(f['Partner']||[])[0]||'';
    const importId =f['Matched Import ID']||null;

    WINTL.rows.push({
      id:          ++WINTL._seq,
      orderId:     exp.id,          // single export ORDER record ID
      orderIds:    [exp.id],        // array for groupage
      importId,
      truckId, trailerId, driverId, partnerId,
      truckLabel:  WINTL.data.trucks.find(t=>t.id===truckId)?.label||'',
      trailerLabel:WINTL.data.trailers.find(t=>t.id===trailerId)?.label||'',
      driverLabel: WINTL.data.drivers.find(d=>d.id===driverId)?.label||'',
      partnerLabel:WINTL.data.partners.find(p=>p.id===partnerId)?.label||'',
      partnerPlates:f['Partner Truck Plates']||'',
      saved:!!(truckId||partnerId),
    });
  }
}

/* ── PAINT ─────────────────────────────────────────────────────────── */
function _wiPaint(){
  const {rows,shelf,week,data,ui}=WINTL;
  const expN=data.exports.length, impN=data.imports.length;
  const assigned=rows.filter(r=>r.saved).length;
  const pending=rows.filter(r=>!r.saved).length;
  const unmatched=shelf.length;

  document.getElementById('content').innerHTML=`
    <div class="page-header" style="margin-bottom:12px">
      <div>
        <div class="page-title">Weekly International</div>
        <div class="page-sub" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:4px;font-size:12px">
          <span>Week ${week} · ${_wiWeekRange(week)}</span>
          <span style="color:var(--success)">${expN} exports</span>
          <span style="color:var(--warning)">${impN} imports</span>
          <span style="color:var(--text-dim)">${assigned} assigned · ${pending} pending</span>
          ${unmatched
            ?`<span style="color:var(--warning);font-weight:600">${unmatched} imports unmatched</span>`
            :`<span style="color:var(--success)">all imports matched</span>`}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost" style="padding:5px 18px" onclick="_wiNavWeek(-1)">Prev</button>
        <span style="font-family:'Syne',sans-serif;font-size:14px;font-weight:700;
                     min-width:62px;text-align:center">W ${week}</span>
        <button class="btn btn-ghost" style="padding:5px 18px" onclick="_wiNavWeek(1)">Next</button>
        <button class="btn btn-ghost" style="padding:5px 10px" onclick="renderWeeklyIntl()">Refresh</button>
      </div>
    </div>

    ${unmatched?_wiShelfHTML():''}

    <div class="wi-wrap">
      <div class="wi-head">
        <div class="wi-hc" style="text-align:center">#</div>
        <div class="wi-hc" style="color:var(--success)">
          Export (${expN})
          <span style="font-weight:400;text-transform:none;letter-spacing:0;
                       font-size:9px;color:var(--text-dim);margin-left:6px">right-click to group</span>
        </div>
        <div class="wi-hc" style="text-align:center">Assignment</div>
        <div class="wi-hc" style="color:var(--warning)">
          Import (${impN})
          <span style="font-weight:400;text-transform:none;letter-spacing:0;
                       font-size:9px;color:var(--text-dim);margin-left:6px">drag from shelf</span>
        </div>
      </div>
      <div id="wi-rows">
        ${rows.length?_wiAllRowsHTML():`
          <div class="empty-state" style="padding:60px">
            <p>No international exports for week ${week}</p>
          </div>`}
      </div>
    </div>
    <div id="wi-ctx"></div>`;
  window._wiDragging=null;
}

/* ── SHELF ─────────────────────────────────────────────────────────── */
function _wiShelfHTML(){
  const {shelf,ui}=WINTL;
  const sf=ui.shelfFilter.toLowerCase();
  const vis=sf?shelf.filter(r=>
    ((r.fields['Loading Summary']||'')+(r.fields['Delivery Summary']||''))
    .toLowerCase().includes(sf)):shelf;
  return `
  <div class="wi-shelf">
    <div class="wi-shelf-hdr" onclick="_wiToggleShelf()">
      <span class="wi-shelf-ttl">Import Shelf</span>
      <span class="wi-shelf-n">${shelf.length}</span>
      ${shelf.length>5?`<input type="text" placeholder="search…" value="${ui.shelfFilter}"
        oninput="WINTL.ui.shelfFilter=this.value;_wiRepaintShelf()"
        onclick="event.stopPropagation()"
        style="padding:4px 8px;font-size:11px;border-radius:5px;
               border:1px solid var(--border-mid);background:var(--bg);
               color:var(--text);width:140px;outline:none"/>`:''}
      <span style="margin-left:auto;font-size:11px;color:var(--text-dim)">
        ${ui.shelfCollapsed?'▸':'▾'}
      </span>
    </div>
    <div id="wi-shelf-body" style="display:${ui.shelfCollapsed?'none':'block'}">
      <div class="wi-chips" id="wi-chips-inner">
        ${vis.map(_wiChipHTML).join('')}
      </div>
    </div>
  </div>`;
}
function _wiChipHTML(r){
  const f=r.fields;
  const name=_wiClean(f['Loading Summary']||'—').slice(0,26);
  const dest=_wiClean(f['Delivery Summary']||'—').slice(0,24);
  const pals=f['Total Pallets']||0;
  const del=_wiFmt(f['Delivery DateTime']);
  return `<div class="wi-chip" draggable="true" ondragstart="_wiDragStart(event,'${r.id}')">
    <div class="wi-chip-n">${name}</div>
    <div class="wi-chip-d">${dest}</div>
    <div class="wi-chip-m">${del} · ${pals} pal</div>
  </div>`;
}
function _wiToggleShelf(){
  WINTL.ui.shelfCollapsed=!WINTL.ui.shelfCollapsed;
  const el=document.getElementById('wi-shelf-body');
  if(el) el.style.display=WINTL.ui.shelfCollapsed?'none':'block';
}
function _wiRepaintShelf(){
  const el=document.querySelector('.wi-shelf');
  if(el) el.outerHTML=_wiShelfHTML();
}

/* ── ALL ROWS ──────────────────────────────────────────────────────── */
function _wiAllRowsHTML(){
  let html='',lastDate=null;
  const dc={};
  WINTL.rows.forEach(row=>{
    const lbl=_wiDelDate(row);
    if(lbl) dc[lbl]=(dc[lbl]||0)+1;
  });
  WINTL.rows.forEach((row,i)=>{
    const lbl=_wiDelDate(row);
    if(lbl&&lbl!==lastDate){
      lastDate=lbl;
      html+=`<div class="wi-dsep">
        <span class="wi-dsep-lbl">Delivery</span>
        <span class="wi-dsep-date">${lbl}</span>
        <span class="wi-dsep-n">${dc[lbl]} order${dc[lbl]!==1?'s':''}</span>
      </div>`;
    }
    html+=_wiRowHTML(row,i);
  });
  return html;
}

function _wiDelDate(row){
  const exp=WINTL.data.exports.find(r=>r.id===row.orderIds[0]);
  const raw=exp?.fields['Delivery DateTime']||exp?.fields['Loading DateTime']||null;
  return raw?_wiFmtFull(raw):null;
}

/* ── ROW HTML ──────────────────────────────────────────────────────── */
function _wiRowHTML(row,i){
  const {data,ui}=WINTL;
  const exps   =row.orderIds.map(id=>data.exports.find(r=>r.id===id)).filter(Boolean);
  const imp    =row.importId?data.imports.find(r=>r.id===row.importId):null;
  const isOpen =ui.openRow===row.id;
  const isGroup=exps.length>1;
  const primary=exps[0];

  // Status
  const hasPartner=!!(row.partnerLabel||data.partners.find(p=>p.id===row.partnerId)?.label);
  let sCls,dotColor;
  if(row.saved){
    sCls    =hasPartner?'s-partner':'s-ok';
    dotColor=hasPartner?'rgba(59,130,246,0.7)':'var(--success)';
  } else {
    sCls='s-pending'; dotColor='rgba(217,119,6,0.75)';
  }

  const fromStr=primary?_wiClean(primary.fields['Loading Summary']||'—'):'—';
  const toStr  =primary?_wiClean(primary.fields['Delivery Summary']||'—'):'—';
  const pals   =isGroup?exps.reduce((s,r)=>s+(r.fields['Total Pallets']||0),0):
                        (primary?.fields['Total Pallets']||0);
  const veroia =primary?.fields['Veroia Switch ']||primary?.fields['Veroia Switch'];
  const loadDt =_wiFmt(primary?.fields['Loading DateTime']);
  const delDt  =_wiFmt(primary?.fields['Delivery DateTime']);

  // Assignment pill
  const truck  =row.truckLabel  ||data.trucks.find(t=>t.id===row.truckId)?.label||'';
  const trailer=row.trailerLabel||data.trailers.find(t=>t.id===row.trailerId)?.label||'';
  const driver =row.driverLabel ||data.drivers.find(d=>d.id===row.driverId)?.label||'';
  const partner=row.partnerLabel||data.partners.find(p=>p.id===row.partnerId)?.label||'';
  const surname=driver?driver.trim().split(/\s+/).pop():'';

  let pill;
  if(row.saved){
    if(partner){
      pill=`<div class="wi-pill wi-pill-bp">
        <span class="pt">${partner.slice(0,22)}${partner.length>22?'…':''}</span>
        ${row.partnerPlates?`<span class="ps">${row.partnerPlates}</span>`:''}
      </div>`;
    } else {
      const parts=[truck,trailer,surname].filter(Boolean).join(' · ');
      pill=`<div class="wi-pill wi-pill-ok">
        <span class="pt">${parts||'—'}</span>
      </div>`;
    }
  } else {
    pill=`<div class="wi-pill wi-pill-un"><span class="pt">Unassigned</span></div>`;
  }

  // Import preview — saved state shown
  const impPrev=imp
    ?`<div class="wi-ci-data">
        <span class="wi-ci-n">${_wiClean(imp.fields['Delivery Summary']||'—').slice(0,38)}</span>
        <span class="wi-ci-s">${_wiClean(imp.fields['Loading Summary']||'—').slice(0,32)} · ${imp.fields['Total Pallets']||0} pal</span>
        <span class="wi-ci-s">del ${_wiFmt(imp.fields['Delivery DateTime'])}</span>
        <span class="wi-ci-save">✓ saved</span>
      </div>`
    :`<span class="wi-ci-e">drag import here</span>`;

  return `
  <div id="wi-row-${row.id}" class="wi-row ${sCls}">
    <div class="wi-compact" onclick="_wiToggle(${row.id})">
      <div class="wi-cn">
        <div class="wi-dot" style="background:${dotColor}"></div>
        <span class="wi-num">${i+1}</span>
      </div>
      <div class="wi-ce" oncontextmenu="_wiCtx(event,${row.id},event)">
        <div class="wi-route">
          <span class="from">${fromStr}</span>
          <span class="sep">→</span>
          <span class="dest">${toStr}</span>
          ${isGroup?`<span class="wi-gr">Group ${exps.length}</span>`:''}
          ${veroia?`<span class="wi-vx">Veroia</span>`:''}
        </div>
        <div class="wi-sub">
          ${loadDt!=='—'?`<span>${loadDt} → ${delDt}</span>`:''}
          ${loadDt!=='—'&&pals?`<span class="wi-sub-div"></span>`:''}
          ${pals?`<span>${pals} pal</span>`:''}
        </div>
      </div>
      <div class="wi-ca" onclick="event.stopPropagation()">${pill}</div>
      <div class="wi-ci" id="wi-ci-${row.id}"
           onclick="event.stopPropagation()"
           ondragover="event.preventDefault();document.getElementById('wi-ci-${row.id}').classList.add('dh')"
           ondragleave="document.getElementById('wi-ci-${row.id}').classList.remove('dh')"
           ondrop="event.stopPropagation();_wiDropOnRow(event,${row.id})">
        ${impPrev}
      </div>
    </div>
    ${isOpen?_wiPanelHTML(row):''}
  </div>`;
}

/* ── PANEL HTML ────────────────────────────────────────────────────── */
function _wiPanelHTML(row){
  const {trucks,trailers,drivers,partners}=WINTL.data;
  const canFull=can('planning')==='full';
  const imp=row.importId?WINTL.data.imports.find(r=>r.id===row.importId):null;

  return `
  <div class="wi-panel" onclick="event.stopPropagation()">

    <!-- Assignment fields -->
    <div class="wi-panel-fields">
      <div class="wi-pf">
        <span class="wi-plbl">Truck</span>
        ${_wiSdrop('tk',row.id,trucks,row.truckId,row.truckLabel||'Plate…')}
      </div>
      <div class="wi-pf">
        <span class="wi-plbl">Trailer</span>
        ${_wiSdrop('tl',row.id,trailers,row.trailerId,row.trailerLabel||'Plate…')}
      </div>
      <div class="wi-pf">
        <span class="wi-plbl">Driver</span>
        ${_wiSdrop('dr',row.id,drivers,row.driverId,row.driverLabel||'Name…')}
      </div>
      <div class="wi-div"></div>
      <div class="wi-pf">
        <span class="wi-plbl">Partner</span>
        ${_wiSdrop('pt',row.id,partners,row.partnerId,row.partnerLabel||'Company…')}
      </div>
      <div class="wi-pf">
        <span class="wi-plbl">Partner Plates</span>
        <input class="wi-ti" type="text" placeholder="e.g. ΙΑΒ 1099"
               value="${(row.partnerPlates||'').replace(/"/g,'&quot;')}"
               id="wi-pp-${row.id}"
               oninput="_wiField(${row.id},'partnerPlates',this.value)"
               onclick="event.stopPropagation()"/>
      </div>
      ${canFull?`
      <div class="wi-pf" style="flex-direction:row;gap:6px;align-self:flex-end">
        <button class="wi-btn" id="wi-btn-${row.id}"
                onclick="event.stopPropagation();_wiSave(${row.id})">
          ${row.saved?'Update':'Save'}
        </button>
        ${row.saved?`<button class="wi-btn-d"
                onclick="event.stopPropagation();_wiClear(${row.id})">Clear</button>`:''}
      </div>`:''}
    </div>

    <!-- Import drop zone (independent from assignment) -->
    <div>
      <div class="wi-plbl" style="margin-bottom:4px">Matched Import</div>
      <div id="wi-piz-${row.id}" class="wi-piz"
           ondragover="event.preventDefault();document.getElementById('wi-piz-${row.id}').classList.add('dh')"
           ondragleave="document.getElementById('wi-piz-${row.id}').classList.remove('dh')"
           ondrop="event.stopPropagation();_wiDropOnPanel(event,${row.id})">
        ${imp
          ?`<div class="wi-ichip" draggable="true" ondragstart="_wiDragStart(event,'${imp.id}')">
              <span class="wi-irm" onclick="event.stopPropagation();_wiRemoveImport(${row.id})">×</span>
              <div style="font-size:11px;font-weight:700;color:var(--text)">
                ${_wiClean(imp.fields['Loading Summary']||'—')}
              </div>
              <div style="font-size:10.5px;color:var(--text-dim)">
                → ${_wiClean(imp.fields['Delivery Summary']||'—')} · ${imp.fields['Total Pallets']||0} pal
              </div>
              <div style="font-size:10px;color:var(--text-mid);margin-top:1px">
                ${_wiFmt(imp.fields['Loading DateTime'])} → ${_wiFmt(imp.fields['Delivery DateTime'])}
              </div>
            </div>`
          :`<span class="wi-inone">drop import here</span>`}
      </div>
    </div>
  </div>`;
}

/* ── DROPDOWN ──────────────────────────────────────────────────────── */
function _wiSdrop(px,rowId,arr,selId,ph){
  const uid=`${px}_${rowId}`;
  const sel=arr.find(x=>x.id===selId)?.label||'';
  const opts=arr.map(x=>{
    const l=(x.label||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    return `<div class="wi-sdo" data-id="${x.id}" data-lbl="${l}">${l}</div>`;
  }).join('');
  return `<div class="wi-sd" id="wsd-${uid}" onclick="event.stopPropagation()">
    <input type="text" class="wi-sdi" placeholder="${ph}"
           value="${sel.replace(/"/g,'&quot;')}"
           oninput="_wiSdF('${uid}',this.value)"
           onfocus="_wiSdO('${uid}')"
           autocomplete="off"/>
    <input type="hidden" id="wsd-v-${uid}" value="${selId||''}"/>
    <div id="wsd-l-${uid}" class="wi-sdl">${opts}</div>
  </div>`;
}

// Global click handler for dropdown options
document.addEventListener('click',e=>{
  const o=e.target.closest('.wi-sdo');
  if(o){
    const l=o.closest('.wi-sdl');if(!l) return;
    _wiSdP(l.id.replace('wsd-l-',''),o.dataset.id,o.dataset.lbl||o.textContent.trim());
    e.stopPropagation();return;
  }
  if(!e.target.closest('.wi-sd'))
    document.querySelectorAll('.wi-sdl').forEach(el=>el.style.display='none');
});

function _wiSdO(uid){
  document.querySelectorAll('.wi-sdl').forEach(el=>{
    if(el.id!=='wsd-l-'+uid) el.style.display='none';
  });
  const inp=document.querySelector(`#wsd-${uid} .wi-sdi`);
  const lst=document.getElementById('wsd-l-'+uid);
  if(!inp||!lst) return;
  const r=inp.getBoundingClientRect();
  Object.assign(lst.style,{
    display:'block',
    left:`${r.left}px`,
    top:`${r.bottom+2}px`,
    width:`${Math.max(r.width,190)}px`,
  });
  lst.querySelectorAll('.wi-sdo').forEach(el=>el.style.display='');
}
function _wiSdF(uid,q){
  const lst=document.getElementById('wsd-l-'+uid);
  if(!lst||lst.style.display==='none') _wiSdO(uid);
  const ql=q.toLowerCase();
  lst.querySelectorAll('.wi-sdo').forEach(el=>{
    el.style.display=(el.dataset.lbl||el.textContent).toLowerCase().includes(ql)?'':'none';
  });
}
function _wiSdP(uid,recId,label){
  const v=document.getElementById('wsd-v-'+uid);if(v) v.value=recId;
  const i=document.querySelector(`#wsd-${uid} .wi-sdi`);if(i) i.value=label;
  const l=document.getElementById('wsd-l-'+uid);if(l) l.style.display='none';
  const parts=uid.split('_'),px=parts[0],rowId=parseInt(parts[parts.length-1]);
  const fm={tk:'truckId',   tl:'trailerId',   dr:'driverId',   pt:'partnerId'};
  const lm={tk:'truckLabel',tl:'trailerLabel',dr:'driverLabel',pt:'partnerLabel'};
  if(fm[px]&&!isNaN(rowId)){
    _wiField(rowId,fm[px],recId);
    _wiField(rowId,lm[px],label);
  }
}

/* ── STATE ─────────────────────────────────────────────────────────── */
function _wiField(rowId,field,val){
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(row) row[field]=val;
}
function _wiToggle(rowId){
  const prev=WINTL.ui.openRow;
  WINTL.ui.openRow=prev===rowId?null:rowId;
  if(prev&&prev!==rowId) _wiRepaintRow(prev);
  _wiRepaintRow(rowId);
}
function _wiRepaintRow(rowId){
  const el=document.getElementById('wi-row-'+rowId);
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!el||!row){_wiPaint();return;}
  el.outerHTML=_wiRowHTML(row,WINTL.rows.findIndex(r=>r.id===rowId));
}

/* ── DRAG & DROP ───────────────────────────────────────────────────── */
window._wiDragging=null;
function _wiDragStart(e,impId){
  window._wiDragging=impId;
  e.dataTransfer.effectAllowed='move';
}

// Drop on compact row import cell → auto-save
async function _wiDropOnRow(e,rowId){
  e.preventDefault();
  document.getElementById('wi-ci-'+rowId)?.classList.remove('dh');
  const impId=window._wiDragging;if(!impId) return;
  window._wiDragging=null;
  await _wiSaveImportMatch(rowId,impId);
}

// Drop on panel drop zone → auto-save
async function _wiDropOnPanel(e,rowId){
  e.preventDefault();
  document.getElementById('wi-piz-'+rowId)?.classList.remove('dh');
  const impId=window._wiDragging;if(!impId) return;
  window._wiDragging=null;
  await _wiSaveImportMatch(rowId,impId);
}

// Auto-save import match directly to ORDERS record
async function _wiSaveImportMatch(rowId,impId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;

  // Optimistic UI update first
  const oldImp=row.importId;
  row.importId=impId;
  // Remove from shelf
  WINTL.shelf=WINTL.shelf.filter(r=>r.id!==impId);
  // Return old import to shelf if it was set
  if(oldImp&&oldImp!==impId){
    const old=WINTL.data.imports.find(r=>r.id===oldImp);
    if(old&&!WINTL.shelf.find(r=>r.id===old.id)) WINTL.shelf.push(old);
  }
  // Also remove from any other row
  WINTL.rows.forEach(r=>{if(r.id!==rowId&&r.importId===impId) r.importId=null;});

  _wiRepaintShelf();
  _wiRepaintRow(rowId);

  // Save to ALL export orders in group
  for(const orderId of row.orderIds){
    try{
      const res=await atPatch(TABLES.ORDERS,orderId,{'Matched Import ID':impId});
      if(res?.error) throw new Error(res.error.message||res.error.type);
    }catch(err){
      console.error('Import match save failed:',err.message);
      toast('Import save failed: '+err.message.slice(0,50),'warn');
    }
  }
}

async function _wiRemoveImport(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row||!row.importId) return;
  const imp=WINTL.data.imports.find(r=>r.id===row.importId);
  if(imp&&!WINTL.shelf.find(r=>r.id===imp.id)) WINTL.shelf.push(imp);
  row.importId=null;

  _wiRepaintShelf();
  _wiRepaintRow(rowId);

  // Clear from ORDERS
  for(const orderId of row.orderIds){
    try{
      const res=await atPatch(TABLES.ORDERS,orderId,{'Matched Import ID':''});
      if(res?.error) throw new Error(res.error.message||res.error.type);
    }catch(err){
      toast('Clear failed: '+err.message.slice(0,50),'warn');
    }
  }
}

/* ── SAVE ASSIGNMENT ───────────────────────────────────────────────── */
async function _wiSave(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;

  // Sync dropdowns
  const sync=(p,f,l)=>{
    const uid=`${p}_${rowId}`;
    const val=document.getElementById(`wsd-v-${uid}`)?.value;
    const lbl=document.querySelector(`#wsd-${uid} .wi-sdi`)?.value;
    if(val!==undefined&&val!==null){row[f]=val;row[l]=lbl||'';}
  };
  sync('tk','truckId','truckLabel');
  sync('tl','trailerId','trailerLabel');
  sync('dr','driverId','driverLabel');
  sync('pt','partnerId','partnerLabel');

  // Read partner plates from input
  const ppInput=document.getElementById(`wi-pp-${rowId}`);
  if(ppInput) row.partnerPlates=ppInput.value;

  const isPartner=!!row.partnerId;
  if(!isPartner&&!row.truckId){toast('Select Truck or Partner','warn');return;}

  const btn=document.getElementById('wi-btn-'+rowId);
  if(btn){btn.disabled=true;btn.textContent='Saving…';}

  const fields=isPartner
    ?{ 'Partner'            :[row.partnerId],
       'Is Partner Trip'    :true,
       'Partner Truck Plates':row.partnerPlates||'',
       'Truck':[],'Trailer':[],'Driver':[] }
    :{ 'Truck'              :[row.truckId],
       'Trailer'            :row.trailerId?[row.trailerId]:[],
       'Driver'             :row.driverId?[row.driverId]:[],
       'Is Partner Trip'    :false,
       'Partner':[],'Partner Truck Plates':'' };

  const errors=[];
  for(const orderId of row.orderIds){
    try{
      const res=await atPatch(TABLES.ORDERS,orderId,fields);
      if(res?.error) throw new Error(res.error.message||res.error.type||JSON.stringify(res.error));
    }catch(err){ errors.push(err.message); }
  }

  if(errors.length){
    if(btn){btn.disabled=false;btn.textContent=row.saved?'Update':'Save';}
    toast('Error: '+errors[0].slice(0,60),'warn');
    return;
  }

  toast(row.saved?'Updated':'Assignment saved');
  WINTL.ui.openRow=null;
  await renderWeeklyIntl();
}

async function _wiClear(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  if(!confirm('Clear assignment?')) return;
  const errors=[];
  for(const orderId of row.orderIds){
    try{
      const res=await atPatch(TABLES.ORDERS,orderId,{
        'Truck':[],'Trailer':[],'Driver':[],'Partner':[],
        'Is Partner Trip':false,'Partner Truck Plates':'',
      });
      if(res?.error) throw new Error(res.error.message||res.error.type);
    }catch(err){ errors.push(err.message); }
  }
  if(errors.length){toast('Clear failed: '+errors[0].slice(0,50),'warn');return;}
  toast('Assignment cleared');
  WINTL.ui.openRow=null;
  await renderWeeklyIntl();
}

/* ── CONTEXT MENU ──────────────────────────────────────────────────── */
function _wiCtx(e,rowId){
  e.preventDefault();e.stopPropagation();
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const isGroup=row.orderIds.length>1;
  const others=WINTL.rows.filter(r=>r.id!==rowId&&!r.saved);
  const btn=(l,fn,d=false)=>
    `<button class="wi-ctx-i${d?' d':''}" onclick="${fn};_wiCtxClose()">${l}</button>`;
  let html='';
  if(others.length){
    html+=`<div class="wi-ctx-h">Groupage</div>`;
    others.slice(0,6).forEach(o=>{
      const exp=WINTL.data.exports.find(r=>r.id===o.orderIds[0]);
      const lbl=_wiClean(exp?.fields['Delivery Summary']||`Row ${o.id}`).slice(0,28);
      html+=btn(`Group with: ${lbl}`,`_wiMerge(${rowId},${o.id})`);
    });
    html+=`<div class="wi-ctx-sep"></div>`;
  }
  if(isGroup) html+=btn('Split groupage',`_wiSplit(${rowId})`);
  if(row.importId) html+=btn('Remove import',`_wiRemoveImport(${rowId})`);
  if(row.saved) html+=btn('Clear assignment',`_wiClear(${rowId})`);
  const ctx=document.getElementById('wi-ctx');
  ctx.innerHTML=html;
  Object.assign(ctx.style,{display:'block',
    left:`${Math.min(e.clientX,window.innerWidth-220)}px`,
    top:`${Math.min(e.clientY,window.innerHeight-260)}px`});
  setTimeout(()=>document.addEventListener('click',_wiCtxClose,{once:true}),10);
}
function _wiCtxClose(){const el=document.getElementById('wi-ctx');if(el) el.style.display='none';}

/* ── GROUPAGE ──────────────────────────────────────────────────────── */
function _wiMerge(rowId,otherId){
  const row=WINTL.rows.find(r=>r.id===rowId),other=WINTL.rows.find(r=>r.id===otherId);
  if(!row||!other) return;
  other.orderIds.forEach(id=>{if(!row.orderIds.includes(id)) row.orderIds.push(id);});
  WINTL.rows=WINTL.rows.filter(r=>r.id!==otherId);
  _wiPaint();toast('Grouped');
}
function _wiSplit(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row||row.orderIds.length<=1) return;
  const [first,...rest]=row.orderIds;row.orderIds=[first];
  rest.forEach(expId=>{
    const exp=WINTL.data.exports.find(r=>r.id===expId);
    WINTL.rows.push({
      id:++WINTL._seq, orderId:expId, orderIds:[expId], importId:null,
      truckId:'',trailerId:'',driverId:'',partnerId:'',
      truckLabel:'',trailerLabel:'',driverLabel:'',partnerLabel:'',
      partnerPlates:'',saved:false,
    });
  });
  _wiPaint();toast('Split');
}

/* ── NAVIGATION ────────────────────────────────────────────────────── */
function _wiNavWeek(delta){
  WINTL.week=Math.max(1,Math.min(53,WINTL.week+delta));
  WINTL.ui.openRow=null;
  renderWeeklyIntl();
}
