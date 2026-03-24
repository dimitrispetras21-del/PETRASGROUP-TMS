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

// PARTNER ASSIGNMENTS table (tblUhgqnmiam5MGNK)
const PA_TABLE = 'tblUhgqnmiam5MGNK';

const WINTL = {
  week:      _wiCurrentWeek(),
  shelf:     [], // kept for compat, not used for display
  data:      { exports:[], imports:[], trucks:[], trailers:[], drivers:[], partners:[] },
  rows:      [],
  ui:        { openRow:null, openGroup:null },
  _seq:      0,
};

/* ── CSS ──────────────────────────────────────────────────────────── */
(function(){
  if(document.getElementById('wi12')) return;
  const s=document.createElement('style'); s.id='wi12';
  s.textContent=`
.wi-wrap { border:1px solid var(--border-mid); border-radius:10px; overflow:hidden; background:var(--bg-card); }
.wi-head {
  display:grid; grid-template-columns:36px 1fr 270px 1fr;
  background:var(--bg); border-bottom:2px solid var(--border-mid);
  position:sticky; top:0; z-index:20;
  box-shadow:0 1px 0 var(--border-mid);
}
.wi-hc { padding:8px 13px; font-size:9.5px; font-weight:700; letter-spacing:1.3px;
  text-transform:uppercase; color:var(--text-dim); border-right:1px solid var(--border); }
.wi-hc:last-child { border-right:none; }

/* date separator */
.wi-dsep { display:flex; align-items:center; gap:10px; padding:0 13px; height:24px;
  background:#172C45; border-top:1px solid rgba(255,255,255,0.04); height:24px; }
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
  display:grid; grid-template-columns:36px 1fr 270px 1fr;
  min-height:36px; align-items:stretch; cursor:pointer;
}
.wi-cn { display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:3px; padding:3px 0; border-right:1px solid var(--border); min-width:0; }
.wi-dot { width:6px; height:6px; border-radius:50%; }
.wi-num { font-size:9px; color:var(--text-dim); }

.wi-ce { padding:4px 12px; border-right:1px solid var(--border);
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
/* ── order badges — solid bg, white text ── */
.wi-badge {
  display:inline-flex; align-items:center; gap:3px;
  font-size:7.5px; font-weight:800; letter-spacing:.9px;
  text-transform:uppercase; padding:2px 6px; border-radius:3px;
  vertical-align:middle; margin-left:4px; flex-shrink:0;
  white-space:nowrap; color:#fff; border:none;
}
.wi-b-risk   { background:#DC2626; }
.wi-b-pe     { background:#059669; }
.wi-b-pe-ok  { background:#059669; }
.wi-b-grpg   { background:#0EA5E9; }
.wi-b-veroia { background:#0B1929; }
.wi-b-docs   { background:#059669; }
.wi-b-done   { background:#059669; }
.wi-b-nodocs { background:#D97706; }
.wi-b-group  { background:#0EA5E9; }
.wi-vx { display:inline-block; font-size:7.5px; font-weight:800; letter-spacing:1px;
  text-transform:uppercase; padding:1px 5px; border-radius:3px; vertical-align:middle; margin-left:4px;
  background:rgba(11,25,41,0.1); color:#0B1929; border:1px solid rgba(11,25,41,0.28); }
.wi-gr { display:inline-block; font-size:7.5px; font-weight:800; letter-spacing:1px;
  text-transform:uppercase; padding:1px 5px; border-radius:3px; vertical-align:middle; margin-left:4px;
  background:rgba(14,165,233,0.1); color:rgba(14,165,233,0.85); border:1px solid rgba(14,165,233,0.18); }

/* assignment col */
.wi-ca { padding:6px 10px; border-right:1px solid var(--border);
  background:var(--bg); display:flex; align-items:center; justify-content:center; }

/* assignment wrapper with flanking print buttons */
.wi-ca-wrap {
  border-right:1px solid var(--border);
  background:var(--bg);
  display:flex; align-items:stretch;
  overflow:hidden;
}
.wi-ca-wrap:hover { background:rgba(0,0,0,0.012); }

/* side print buttons */
.wi-side-btn {
  flex-shrink:0; width:30px;
  border:none;
  border-radius:0;
  background:transparent;
  cursor:pointer; color:var(--text-dim);
  font-size:11px;
  display:flex; align-items:center; justify-content:center;
  transition:background .12s, color .12s, opacity .12s;
  opacity:0;
}
.wi-side-btn:first-child { border-right:1px solid var(--border); }
.wi-side-btn:last-child  { border-left:1px solid var(--border); }
.wi-row:hover .wi-side-btn { opacity:1; }
.wi-side-btn:hover { background:rgba(11,25,41,0.07); color:var(--navy); }
/* ── ASSIGNMENT PILLS v3 — left accent bar ── */
.wi-pill {
  display:flex; flex-direction:column; align-items:stretch;
  width:240px; min-width:240px;
  border-radius:3px; overflow:hidden;
  transition:opacity .12s; cursor:pointer;
  background:none; border:none; padding:0; gap:0;
}
.wi-pill:hover { opacity:.8; }

/* ── COMPACT CARD ── */
.wi-card {
  display:flex; flex-direction:column; gap:1px;
  padding:6px 10px 6px 12px;
  border-radius:3px;
  border-left: 2px solid transparent;
  min-height:38px; justify-content:center;
}
.wi-card-top {
  font-size:11px; font-weight:700; letter-spacing:.3px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  line-height:1.3;
}
.wi-card-bot {
  font-size:9.5px; font-weight:500; letter-spacing:.2px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  line-height:1.3; opacity:.6;
}

/* OWNED — green */
.wi-card-ok {
  background: #0C2D5C;
  border-left-color: #38BDF8;
}
.wi-card-ok .wi-card-top { color: #E0F2FE; font-weight:800; }
.wi-card-ok .wi-card-bot { color: rgba(224,242,254,0.85); font-weight:700; font-size:10px; }

.wi-card-bp {
  background: #065F46;
  border-left-color: #34D399;
}
.wi-card-bp .wi-card-top { color: #ECFDF5; font-weight:800; }
.wi-card-bp .wi-card-bot { color: rgba(236,253,245,0.9); font-weight:700; font-size:10px; }

.wi-card-un {
  background: #7F1D1D;
  border-left-color: #FCA5A5;
  padding-top:8px; padding-bottom:8px;
}
.wi-card-un .wi-card-top {
  color: #FEE2E2;
  font-weight:700; font-size:10.5px; letter-spacing:.3px;
}

/* legacy compat */
.pt { font-size:11px; font-weight:700; white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; max-width:200px; }
.ps { font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  max-width:200px; }
.ps { font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  max-width:200px; }
.ps { font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  max-width:200px; }

/* import col */
.wi-ci { padding:4px 12px; display:flex; align-items:center; transition:background .1s; overflow:hidden; }
.wi-ci.dh { background:rgba(217,119,6,0.04); }
.wi-ci-data { display:flex; flex-direction:column; gap:1px; width:100%; overflow:hidden; }
.wi-ci-n { font-size:11px; font-weight:700; color:var(--text);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wi-ci-from { font-size:11px; font-weight:700; color:var(--text);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  flex-shrink:1; min-width:0; }
.wi-ci-sep  { font-size:11px; color:var(--text-dim); margin:0 5px; flex-shrink:0; }
.wi-ci-dest { font-size:11px; font-weight:700; color:var(--text);
  white-space:nowrap; flex-shrink:0; }
.wi-ci-s { font-size:10px; font-weight:600; color:var(--text-mid);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wi-ci-e { font-size:10px; color:var(--text-dim); font-style:italic; letter-spacing:0.2px; }
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
.wi-sdi { width:162px; padding:6px 9px; font-size:11px; border-radius:5px;
  border:1px solid var(--border-mid); background:var(--bg-card); color:var(--text); outline:none; }
.wi-sdi:focus { border-color:rgba(11,25,41,0.3); box-shadow:0 0 0 2px rgba(11,25,41,0.06); }
.wi-sdl { display:none; position:fixed; z-index:9999; min-width:185px; max-height:220px;
  overflow-y:auto; background:var(--bg-card); border:1px solid var(--border-mid);
  border-radius:6px; box-shadow:0 6px 24px rgba(0,0,0,0.12); }
.wi-sdo { padding:6px 10px; font-size:11px; cursor:pointer; color:var(--text);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wi-sdo:hover { background:var(--bg-hover); }

.wi-ti { width:148px; padding:6px 9px; font-size:11px; border-radius:5px;
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


/* ── ASSIGNMENT POPOVER ── */
#wi-popover {
  display:none; position:fixed; z-index:9999;
  background:var(--bg-card); border:1px solid var(--border-mid);
  border-radius:10px;
  box-shadow:0 8px 32px rgba(0,0,0,0.18),0 2px 8px rgba(0,0,0,0.1);
  width:430px; padding:0; overflow:hidden;
}
.wi-pop-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:10px 14px 9px; background:var(--navy-mid);
  border-bottom:1px solid rgba(255,255,255,0.06);
}
.wi-pop-title { font-family:'Syne',sans-serif; font-size:11px; font-weight:700;
  letter-spacing:0.8px; text-transform:uppercase; color:var(--silver); }
.wi-pop-subtitle { font-size:10px; color:var(--silver-dim); margin-top:1px; }
.wi-pop-close { background:none; border:none; cursor:pointer; color:var(--silver-dim);
  font-size:18px; line-height:1; padding:2px 4px; border-radius:4px; }
.wi-pop-close:hover { color:var(--silver); background:rgba(255,255,255,0.08); }
.wi-pop-body { padding:12px 14px 0; display:flex; flex-direction:column; gap:10px; }
.wi-pop-section-lbl { font-size:8px; font-weight:700; letter-spacing:1.2px;
  text-transform:uppercase; color:var(--text-dim);
  padding-bottom:5px; border-bottom:1px solid var(--border); margin-bottom:2px; }
.wi-pop-row { display:flex; gap:6px; align-items:flex-end; flex-wrap:wrap; }
.wi-pop-field { display:flex; flex-direction:column; gap:3px; }
.wi-pop-lbl { font-size:8px; font-weight:700; letter-spacing:1px;
  text-transform:uppercase; color:var(--text-dim); }
.wi-pop-inp { width:120px; padding:7px 9px; font-size:11px; border-radius:6px;
  border:1px solid var(--border-mid); background:var(--bg);
  color:var(--text); outline:none; transition:border-color .15s,box-shadow .15s; }
.wi-pop-inp:focus { border-color:rgba(11,25,41,0.4);
  box-shadow:0 0 0 3px rgba(11,25,41,0.08); background:var(--bg-card); }
.wi-pop-inp-wide { width:185px; }
.wi-pop-divider { display:flex; align-items:center; gap:8px; font-size:9px;
  color:var(--text-dim); letter-spacing:.5px; text-transform:uppercase; margin:2px 0; }
.wi-pop-divider::before,.wi-pop-divider::after { content:''; flex:1; height:1px; background:var(--border); }
.wi-pop-footer { display:flex; gap:8px; justify-content:flex-end;
  padding:10px 14px 12px; border-top:1px solid var(--border);
  background:var(--bg); margin-top:12px; }
.wi-pop-save { display:inline-flex; align-items:center; gap:6px;
  padding:8px 24px; font-size:11.5px; font-weight:700; border:none;
  border-radius:6px; cursor:pointer; background:var(--navy-mid); color:#fff;
  transition:background .15s; box-shadow:0 1px 4px rgba(0,0,0,0.15); }
.wi-pop-save:hover { background:var(--navy); }
.wi-pop-save:disabled { opacity:.45; cursor:default; }
.wi-pop-cancel { padding:7px 16px; font-size:11px; border:1px solid var(--border-mid);
  border-radius:6px; cursor:pointer; background:none; color:var(--text-mid); }
.wi-pop-cancel:hover { background:var(--bg-hover); }
/* ── IMPORT ROWS ── */
.wi-imp-row {
  display:flex; align-items:center; gap:8px;
  padding:5px 12px 5px 46px;
  border-top:1px solid rgba(14,165,233,0.1);
  background:rgba(14,165,233,0.025);
  cursor:grab; transition:background .1s;
  min-height:34px;
  width:100%;
  box-sizing:border-box;
}
.wi-imp-row:active { cursor:grabbing; }
.wi-imp-row:hover  { background:rgba(14,165,233,0.06); }
.wi-imp-matched    { background:rgba(5,150,105,0.025); }
.wi-imp-matched:hover { background:rgba(5,150,105,0.05); }
.wi-imp-matched.dh { background:rgba(5,150,105,0.08); }
.wi-imp-row.dh     { outline:2px dashed rgba(14,165,233,0.6); }
.wi-imp-arrow {
  font-size:12px; color:rgba(14,165,233,0.45);
  flex-shrink:0; line-height:1; margin-right:2px;
}
.wi-imp-content { flex:1; min-width:0; overflow:hidden; }
.wi-imp-actions { display:flex; align-items:center; gap:4px; flex-shrink:0; }

/* group accordion */
.wi-group-detail {
  background:#F8FAFC;
  border-top:1px solid var(--border);
  padding:6px 12px 8px 48px;
}
.wi-group-item {
  display:flex; align-items:center; gap:8px;
  padding:4px 0;
  border-bottom:1px solid var(--border);
  font-size:10.5px;
}
.wi-group-item:last-child { border-bottom:none; }
.wi-group-num {
  font-size:8.5px; font-weight:700; color:var(--text-dim);
  min-width:16px; text-align:right;
}
.wi-group-route { flex:1; min-width:0; overflow:hidden; }
.wi-group-from { font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wi-group-meta { font-size:9.5px; color:var(--text-dim); white-space:nowrap; margin-top:1px; }
.wi-group-pals { font-size:9.5px; color:var(--text-dim); white-space:nowrap; }

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
  try{
    // Full Greek date, capitalize first letter
    const d=new Date(s);
    const str=d.toLocaleDateString('el-GR',{weekday:'long',day:'numeric',month:'long'});
    return str.charAt(0).toUpperCase()+str.slice(1);
  }catch{return s;}
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
let _wiLoadId = 0;
async function renderWeeklyIntl(){
  WINTL._seq = 0;
  const loadId = ++_wiLoadId;
  if(can('planning')==='none'){document.getElementById('content').innerHTML=showAccessDenied();return;}
  document.getElementById('topbarTitle').textContent=`Weekly International — Week ${WINTL.week}`;
  document.getElementById('content').innerHTML=`
    <div style="display:flex;align-items:center;justify-content:center;
                gap:10px;height:160px;color:var(--text-dim);font-size:13px">
      <div class="spinner"></div> Loading week ${WINTL.week}…
    </div>`;
  try{
    // All fetches in parallel (assets + orders)
    const [t,tl,d,p,allOrders] = await Promise.all([
      atGetAll(TABLES.TRUCKS,  {fields:['License Plate'],filterByFormula:'{Active}=TRUE()'},false),
      atGetAll(TABLES.TRAILERS,{fields:['License Plate']},false),
      atGetAll(TABLES.DRIVERS, {fields:['Full Name'],    filterByFormula:'{Active}=TRUE()'},false),
      atGetAll(TABLES.PARTNERS,{fields:['Company Name']},false),
      atGetAll(TABLES.ORDERS,  {filterByFormula:`AND({Type}='International',{ Week Number}=${WINTL.week})`},false),
    ]);
    if (loadId !== _wiLoadId) return;
    WINTL.data.trucks   = t.map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
    WINTL.data.trailers = tl.map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
    WINTL.data.drivers  = d.map(r=>({id:r.id,label:r.fields['Full Name']||r.id}));
    WINTL.data.partners = p.map(r=>({id:r.id,label:r.fields['Company Name']||r.id}));

    WINTL.data.exports = allOrders
      .filter(r=>r.fields.Direction==='Export')
      .sort((a,b)=>(
        (a.fields['Delivery DateTime']||a.fields['Loading DateTime']||'')
        .localeCompare(b.fields['Delivery DateTime']||b.fields['Loading DateTime']||'')
      ));
    WINTL.data.imports = allOrders.filter(r=>r.fields.Direction==='Import');

    if (loadId !== _wiLoadId) return;
    _wiBuildRows();
    _wiPaint();
  }catch(err){
    if (loadId !== _wiLoadId) return;
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


  for(const exp of exports){
    const f=exp.fields;
    const truckId  =(f['Truck']  ||[])[0]||'';
    const trailerId=(f['Trailer']||[])[0]||'';
    const driverId =(f['Driver'] ||[])[0]||'';
    const partnerId=(f['Partner']||[])[0]||'';
    const importId =f['Matched Import ID']||null;

    WINTL.rows.push({
      id:          ++WINTL._seq,
      type:        'export',
      orderId:     exp.id,
      orderIds:    [exp.id],
      importId,
      truckId, trailerId, driverId, partnerId,
      truckLabel:  WINTL.data.trucks.find(t=>t.id===truckId)?.label||'',
      trailerLabel:WINTL.data.trailers.find(t=>t.id===trailerId)?.label||'',
      driverLabel: WINTL.data.drivers.find(d=>d.id===driverId)?.label||'',
      partnerLabel:WINTL.data.partners.find(p=>p.id===partnerId)?.label||'',
      partnerPlates:f['Partner Truck Plates']||'',
      partnerRate:  f['Partner Rate']?String(f['Partner Rate']):'',
      partnerRateImp:'',
      saved:!!(truckId||partnerId),
    });
  }

  // ── IMPORT ROWS — sorted by loading date, always draggable ──
  const importsSorted=[...imports].sort((a,b)=>(
    (a.fields['Loading DateTime']||'').localeCompare(b.fields['Loading DateTime']||'')
  ));

  // Build matchedMap: importOrderId → exportOrderId
  const matchedMap={};
  exports.forEach(r=>{ const mid=r.fields['Matched Import ID']; if(mid) matchedMap[mid]=r.id; });

  for(const imp of importsSorted){
    const f=imp.fields;
    const truckId  =(f['Truck']  ||[])[0]||'';
    const partnerId=(f['Partner']||[])[0]||'';
    const impTrailerId=(f['Trailer']||[])[0]||'';
    const impDriverId =(f['Driver'] ||[])[0]||'';
    WINTL.rows.push({
      id:          ++WINTL._seq,
      type:        'import',
      orderId:     imp.id,
      orderIds:    [imp.id],
      importId:    null,
      matchedTo:   matchedMap[imp.id]||null,
      truckId,   trailerId:impTrailerId, driverId:impDriverId, partnerId,
      truckLabel:  WINTL.data.trucks.find(t=>t.id===truckId)?.label||'',
      trailerLabel:WINTL.data.trailers.find(t=>t.id===impTrailerId)?.label||'',
      driverLabel: WINTL.data.drivers.find(d=>d.id===impDriverId)?.label||'',
      partnerLabel:WINTL.data.partners.find(p=>p.id===partnerId)?.label||'',
      partnerPlates:f['Partner Truck Plates']||'',
      partnerRate:  f['Partner Rate']?String(f['Partner Rate']):'',
      partnerRateImp:'',
      saved:!!(truckId||partnerId),
    });
  }
}

/* ── PAINT ─────────────────────────────────────────────────────────── */

/* ── WEEK SIDEBAR (INTL) ──────────────────────────────── */
function _wiWeekSidebarItems(currentWeek) {
  const year = new Date().getFullYear();
  let html = '';
  for (let w = currentWeek - 8; w <= currentWeek + 12; w++) {
    if (w < 1 || w > 52) continue;
    const isActive = w === currentWeek;
    const jan4 = new Date(year, 0, 4);
    const mon  = new Date(jan4); mon.setDate(jan4.getDate() - jan4.getDay() + 1);
    const wS   = new Date(mon); wS.setDate(mon.getDate() + (w - 1) * 7);
    const wE   = new Date(wS);  wE.setDate(wS.getDate() + 6);
    const fmt  = d => String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
    const bg   = isActive ? 'var(--accent,#0EA5E9)' : 'var(--navy-mid,#0B1929)';
    const col  = isActive ? '#fff' : 'rgba(196,207,219,.7)';
    const fw   = isActive ? '700' : '500';
    html += `<div onclick="WINTL.week=${w};renderWeeklyIntl()" style="
      flex-shrink:0;padding:6px 14px;cursor:pointer;border-radius:8px;
      background:${bg};color:${col};
      font-family:'Syne',sans-serif;font-size:12px;font-weight:${fw};
      transition:background .12s;white-space:nowrap;text-align:center;
      border:1px solid ${isActive ? 'transparent' : 'rgba(196,207,219,.12)'};
    " onmouseover="this.style.background='${isActive?'var(--accent,#0EA5E9)':'rgba(14,165,233,.15)'}'"
       onmouseout="this.style.background='${bg}'">
      <div>W${w}</div>
      <div style="font-size:9px;opacity:.7;font-family:'DM Sans',sans-serif;margin-top:1px">${fmt(wS)}–${fmt(wE)}</div>
    </div>`;
  }
  return html;
}

function _wiPaint(){
  const {rows,week,data,ui}=WINTL;
  const expRows=rows.filter(r=>r.type==='export');
  const impRows=rows.filter(r=>r.type==='import');
  const expN=data.exports.length, impN=data.imports.length;
  const assigned=expRows.filter(r=>r.saved).length;
  const pending=expRows.filter(r=>!r.saved).length;
  const matched=impRows.filter(r=>r.matchedTo).length;
  const unmatched=impRows.filter(r=>!r.matchedTo).length;

  document.getElementById('content').innerHTML=`
    <div style="display:block;width:100%">
    <!-- Horizontal week bar -->
    <div id="wi-week-bar" style="
      display:flex;flex-direction:row;gap:4px;align-items:center;
      overflow-x:auto;padding:0 0 12px 0;
      scrollbar-width:thin;width:100%;
    ">
      ${_wiWeekSidebarItems(week)}
    </div>
    <div style="display:block;width:100%">
    <div class="page-header" style="margin-bottom:12px">
      <div>
        <div class="page-title">Weekly International</div>
        <div class="page-sub" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:4px;font-size:12px">
          <span>Week ${week} · ${_wiWeekRange(week)}</span>
          <span style="color:var(--success)">${expN} exports</span>
          <span style="color:var(--warning)">${impN} imports</span>
          <span style="color:var(--success)">${assigned} assigned</span>
          <span style="color:#E05252">· ${pending} pending</span>
          <span style="color:var(--text-dim)">${matched} matched · ${unmatched} free</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost" style="padding:5px 10px" onclick="renderWeeklyIntl()">Refresh</button>
      </div>
    </div>

    <div class="wi-wrap" style="overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 180px);">
      <div class="wi-head" style="background:#B8C4D0">
        <div class="wi-hc" style="text-align:center;color:#091828;border-right:1px solid rgba(9,24,40,0.12)">#</div>
        <div class="wi-hc" style="text-align:center;color:#091828;font-weight:800;letter-spacing:1.8px;border-right:1px solid rgba(9,24,40,0.12);display:flex;align-items:center;justify-content:center;gap:8px">
          ↑ EXPORT
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;background:#091828;color:#B8C4D0;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0">${expN}</span>
          <span style="font-weight:400;font-size:8px;opacity:0.45;letter-spacing:0.5px;text-transform:none">right-click to group</span>
        </div>
        <div class="wi-hc" style="text-align:center;color:#091828;opacity:0.5;letter-spacing:1.8px;border-right:1px solid rgba(9,24,40,0.12)">
          ASSIGNMENT
        </div>
        <div class="wi-hc" style="text-align:center;color:#091828;font-weight:800;letter-spacing:1.8px;display:flex;align-items:center;justify-content:center;gap:8px">
          ↓ IMPORT
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;background:#091828;color:#B8C4D0;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0">${impN}</span>
          <span style="font-weight:400;font-size:8px;opacity:0.45;letter-spacing:0.5px;text-transform:none">drag to match</span>
        </div>
      </div>
      <div id="wi-rows">
        ${rows.length?_wiAllRowsHTML():`
          <div class="empty-state" style="padding:60px">
            <p>No international exports for week ${week}</p>
          </div>`}
      </div>
    </div>
    <div id="wi-ctx"></div>
    <div id="wi-popover"></div>
    </div><!-- /main -->
    </div><!-- /block wrapper -->
  `;
  window._wiDragging=null;
}



/* ── ALL ROWS ──────────────────────────────────────────────────────── */
function _wiAllRowsHTML(){
  const expRows=WINTL.rows.filter(r=>r.type==='export');
  const impRows=WINTL.rows.filter(r=>r.type==='import');
  let html='',idx=0;

  // Build date groups — key = date label string
  // exports: keyed by delivery date
  // imports: keyed by loading date (same format)
  const groups={}; // label → {date, exps:[], imps:[]}

  expRows.forEach(row=>{
    const lbl=_wiDelDate(row)||'—';
    if(!groups[lbl]) groups[lbl]={lbl,exps:[],imps:[]};
    groups[lbl].exps.push(row);
  });

  impRows.forEach(row=>{
    const imp=WINTL.data.imports.find(r=>r.id===row.orderId);
    const raw=imp?.fields['Loading DateTime']||null;
    const lbl=raw?_wiFmtFull(raw):'—';
    if(!groups[lbl]) groups[lbl]={lbl,exps:[],imps:[]};
    groups[lbl].imps.push(row);
  });

  // Sort group keys by actual date value
  const sorted=Object.values(groups).sort((a,b)=>{
    const ra=WINTL.data.exports.find(r=>r.id===(a.exps[0]?.orderIds[0]))||
             WINTL.data.imports.find(r=>r.id===a.imps[0]?.orderId);
    const rb=WINTL.data.exports.find(r=>r.id===(b.exps[0]?.orderIds[0]))||
             WINTL.data.imports.find(r=>r.id===b.imps[0]?.orderId);
    const da=ra?.fields['Delivery DateTime']||ra?.fields['Loading DateTime']||'';
    const db=rb?.fields['Delivery DateTime']||rb?.fields['Loading DateTime']||'';
    return da.localeCompare(db);
  });

  sorted.forEach(grp=>{
    const expCount=grp.exps.length;
    const impCount=grp.imps.length;

    // Separator — same dark navy style as before
    html+=`<div class="wi-dsep">
      <span class="wi-dsep-lbl">Date</span>
      <span class="wi-dsep-date">${grp.lbl}</span>
      ${expCount?`<span class="wi-dsep-n" style="color:rgba(196,207,219,0.55)">${expCount} exp</span>`:''}
      ${impCount?`<span class="wi-dsep-n" style="color:rgba(14,165,233,0.7);margin-left:2px">${impCount} imp</span>`:''}
    </div>`;

    // Export rows
    grp.exps.forEach(row=>{ html+=_wiRowHTML(row,idx++); });

    // Only unmatched imports shown as rows
    grp.imps.filter(r=>!r.matchedTo).forEach(row=>{ html+=_wiImpRowHTML(row); });
  });

  return html;
}


/* ── IMPORT ROW ──────────────────────────────────────────────────── */
function _wiImpRowHTML(row){
  const {data}=WINTL;
  const imp=data.imports.find(r=>r.id===row.orderId);
  if(!imp) return '';
  const f=imp.fields;
  const fromStr=_wiClean(f['Loading Summary']||'—');
  const toStr  =_wiClean(f['Delivery Summary']||'—');
  const pals   =f['Total Pallets']||0;
  const loadDt =_wiFmt(f['Loading DateTime']);
  const delDt  =_wiFmt(f['Delivery DateTime']);
  const isMatched=!!row.matchedTo;

  // Find which export it's matched to
  let matchedExp=null;
  if(row.matchedTo){
    const mRow=WINTL.rows.find(r=>r.type==='export'&&r.orderIds.includes(row.matchedTo));
    if(mRow){
      const mExp=data.exports.find(r=>r.id===mRow.orderIds[0]);
      matchedExp=mExp?_wiClean(mExp.fields['Delivery Summary']||'').slice(0,24):'';
    }
  }

  const matchBadge2=isMatched
    ?`<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;
                   background:rgba(14,165,233,0.1);color:rgba(14,165,233,0.9);
                   border:1px solid rgba(14,165,233,0.25)">${matchedExp||'matched'}</span>`
    :`<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;
                   background:var(--bg);color:var(--text-dim);
                   border:1px solid var(--border-mid)">unmatched</span>`;
  const matchBadge=isMatched
    ?`<span style="font-size:8.5px;font-weight:700;padding:2px 7px;border-radius:3px;
                   background:rgba(5,150,105,0.1);color:var(--success);
                   border:1px solid rgba(5,150,105,0.2);white-space:nowrap;flex-shrink:0">
        ✓ ${matchedExp||'matched'}
      </span>`
    :`<span style="font-size:8.5px;font-weight:700;padding:2px 7px;border-radius:3px;
                   background:rgba(14,165,233,0.1);color:rgba(14,165,233,0.9);
                   border:1px solid rgba(14,165,233,0.25);flex-shrink:0">
        unmatched
      </span>`;

  // Import row — full 4-col grid, always draggable, has assignment + match cell
  const impTruck   =row.truckLabel   ||WINTL.data.trucks.find(t=>t.id===row.truckId)?.label||'';
  const impTrailer =row.trailerLabel ||WINTL.data.trailers.find(t=>t.id===row.trailerId)?.label||'';
  const impPartner =row.partnerLabel ||WINTL.data.partners.find(p=>p.id===row.partnerId)?.label||'';
  const impSurname =row.driverLabel  ?row.driverLabel.trim().split(/\s+/)[0]:'';
  let impPill;
  if(row.saved){
    if(impPartner){
      impPill=`<div class="wi-pill">
        <div class="wi-card wi-card-bp">
          <div class="wi-card-top">${impPartner.slice(0,26)}${impPartner.length>26?'…':''}</div>
          ${row.partnerPlates?`<div class="wi-card-bot">${row.partnerPlates}</div>`:''}
        </div>
      </div>`;
    } else {
      const impTruckLine=[impTruck,impTrailer].filter(Boolean).join(' · ');
      impPill=`<div class="wi-pill"><div class="wi-card wi-card-ok">
        <div class="wi-card-top">${impTruckLine||'—'}</div>
        ${impSurname?`<div class="wi-card-bot">${row.driverLabel||''}</div>`:''}
      </div></div>`;
    }
  } else {
    impPill=`<div class="wi-pill"><div class="wi-card wi-card-un"><div class="wi-card-top">— Unassigned</div></div></div>`;
  }

  const matchCell=isMatched
    ?`<div class="wi-ci-data">
        <div style="display:flex;align-items:center;gap:0;min-width:0">
          <span class="wi-ci-from" style="color:var(--text);font-weight:700">${fromStr}</span>
          <span class="wi-ci-sep">→</span>
          <span class="wi-ci-dest" style="color:var(--text-mid)">${toStr}</span>
          ${_wiBadges(f)}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="wi-ci-s">${loadDt} → ${delDt} · ${pals} pal</span>
          <span class="wi-ci-save">✓ matched → ${matchedExp||''}</span>
        </div>
      </div>`
    :`<div class="wi-ci-data">
        <div style="display:flex;align-items:center;gap:0;min-width:0">
          <span class="wi-ci-from" style="color:var(--text);font-weight:700">${fromStr}</span>
          <span class="wi-ci-sep">→</span>
          <span class="wi-ci-dest" style="color:var(--text-mid)">${toStr}</span>
          ${_wiBadges(f)}
        </div>
        <span class="wi-ci-s">${loadDt} → ${delDt} · ${pals} pal</span>
      </div>`;

  return `<div id="wi-imp-${imp.id}"
    class="wi-row"
    style="background:rgba(14,165,233,0.022);border-top:1px solid rgba(14,165,233,0.1)"
    draggable="true"
    ondragstart="event.stopPropagation();_wiImpDragStart(event,'${imp.id}')">
    <div class="wi-compact" ondragstart="event.stopPropagation();_wiImpDragStart(event,'${imp.id}')">
      <div class="wi-cn" style="cursor:grab">
        <div class="wi-dot" style="background:rgba(14,165,233,0.5)"></div>
        <span style="font-size:7px;color:rgba(14,165,233,0.55);font-weight:800;letter-spacing:.5px">IMP</span>
      </div>
      <div class="wi-ce" style="cursor:grab;background:#172C45;border-right:none"></div>
      <div class="wi-ca-wrap" onclick="event.stopPropagation();_wiOpenImpPopover(event,'${imp.id}',${row.id})">
        <button class="wi-side-btn" title="Print Import"
                onclick="event.stopPropagation();_wiPrintImp('${imp.id}')">🖨</button>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:4px 6px;cursor:pointer">
          ${impPill}
        </div>
        ${isMatched
          ?`<button class="wi-side-btn" title="Remove match"
                onclick="event.stopPropagation();_wiUnmatch('${imp.id}')">✕</button>`
          :`<div style="width:30px;flex-shrink:0"></div>`}
      </div>
      <div class="wi-ci" style="cursor:grab;background:rgba(14,165,233,0.03)">
        ${matchCell}
      </div>
    </div>
  </div>`;
}

function _wiDelDate(row){
  const exp=WINTL.data.exports.find(r=>r.id===row.orderIds[0]);
  const raw=exp?.fields['Delivery DateTime']||exp?.fields['Loading DateTime']||null;
  return raw?_wiFmtFull(raw):null;
}

/* ── ROW HTML ──────────────────────────────────────────────────────── */
function _wiBadges(f){
  const b=[];
  if(f['High Risk Flag'])   b.push('<span class="wi-badge wi-b-risk">! Risk</span>');
  if(f['Pallet Exchange'])  b.push('<span class="wi-badge wi-b-pe">PE</span>');
  if(f['National Groupage'])b.push('<span class="wi-badge wi-b-grpg">GRP</span>');
  const veroia=f['Veroia Switch ']||f['Veroia Switch'];
  if(veroia)                b.push('<span class="wi-badge wi-b-veroia">Veroia</span>');

  return b.join('');
}

function _wiRowHTML(row,i){
  const {data,ui}=WINTL;
  const exps   =row.orderIds.map(id=>data.exports.find(r=>r.id===id)).filter(Boolean);
  const imp    =row.importId?data.imports.find(r=>r.id===row.importId):null;
  const isOpen =ui.openRow===row.id;
  const isGroup=exps.length>1;
  const primary=exps[0];

  // Status based on operational state
  const hasPartner=!!(row.partnerLabel||data.partners.find(p=>p.id===row.partnerId)?.label);
  const delDateRaw=primary?.fields['Delivery DateTime']||null;
  const isOverdue=delDateRaw && new Date(delDateRaw.split('T')[0]) < new Date(new Date().toISOString().split('T')[0]);
  let sCls,dotColor;
  if(isOverdue){
    // Red — overdue delivery
    sCls='s-overdue'; dotColor='rgba(220,38,38,0.85)';
  } else if(hasPartner){
    // Blue — partner trip
    sCls='s-partner'; dotColor='rgba(59,130,246,0.75)';
  } else if(row.saved && !row.importId){
    // Orange — owned fleet assigned, no import
    sCls='s-noimport'; dotColor='rgba(217,119,6,0.8)';
  } else {
    // Green — on time (assigned + import, or unassigned future)
    sCls='s-ok'; dotColor='var(--success)';
  }

  const fromStr=primary?_wiClean(primary.fields['Loading Summary']||'—'):'—';
  const toStr  =primary?_wiClean(primary.fields['Delivery Summary']||'—'):'—';
  const pals   =isGroup?exps.reduce((s,r)=>s+(r.fields['Total Pallets']||0),0):
                        (primary?.fields['Total Pallets']||0);
  const loadDt =_wiFmt(primary?.fields['Loading DateTime']);
  const delDt  =_wiFmt(primary?.fields['Delivery DateTime']);
  const ref    =primary?.fields['Reference']||'';

  // Assignment pill
  const truck  =row.truckLabel  ||data.trucks.find(t=>t.id===row.truckId)?.label||'';
  const trailer=row.trailerLabel||data.trailers.find(t=>t.id===row.trailerId)?.label||'';
  const driver =row.driverLabel ||data.drivers.find(d=>d.id===row.driverId)?.label||'';
  const partner=row.partnerLabel||data.partners.find(p=>p.id===row.partnerId)?.label||'';
  const surname=driver?driver.trim().split(/\s+/)[0]:'';

  let pill;
  if(row.saved){
    if(partner){
      pill=`<div class="wi-pill">
        <div class="wi-card wi-card-bp">
          <div class="wi-card-top">${partner.slice(0,26)}${partner.length>26?'…':''}</div>
          ${row.partnerPlates?`<div class="wi-card-bot">${row.partnerPlates}</div>`:''}
        </div>
      </div>`;
    } else {
      const truckLine=[truck,trailer].filter(Boolean).join(' · ');
      pill=`<div class="wi-pill"><div class="wi-card wi-card-ok">
        <div class="wi-card-top">${truckLine||'—'}</div>
        ${surname?`<div class="wi-card-bot">${row.driverLabel||''}</div>`:''}
      </div></div>`;
    }
  } else {
    if(isOverdue){
      pill=`<div class="wi-pill">
        <div class="wi-card wi-card-un">
          <div class="wi-card-top">— Unassigned</div>
        </div>
      </div>`;
    } else {
      pill=`<div class="wi-pill"><div class="wi-card wi-card-un"><div class="wi-card-top">— Unassigned</div></div></div>`;
    }
  }

  // Import preview — saved state shown
  const impPrev=imp
    ?`<div class="wi-ci-data">
        <div style="display:flex;align-items:center;gap:0;min-width:0">
          <span class="wi-ci-from">${_wiClean(imp.fields['Loading Summary']||'—')}</span>
          <span class="wi-ci-sep">→</span>
          <span class="wi-ci-dest">${_wiClean(imp.fields['Delivery Summary']||'—')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:1px">
          <span class="wi-ci-s">${imp.fields['Total Pallets']||0} pal</span>
          ${_wiBadges(imp.fields)}
        </div>
        <span style="font-size:9px;color:rgba(14,165,233,0.7);font-weight:600">↩ matched</span>
      </div>`
    :`<div style="width:100%;height:100%;display:flex;align-items:center;
  background:#172C45;margin:-6px -12px;padding:6px 12px;min-height:46px;">
  <span style="font-size:10px;color:rgba(196,207,219,0.35);font-style:italic;letter-spacing:0.3px;">drag import here</span>
</div>`;

  return `
  <div id="wi-row-${row.id}" class="wi-row ${sCls}">
    <div class="wi-compact" onclick="_wiToggle(${row.id})">
      <div class="wi-cn">
        <div class="wi-dot" style="background:${dotColor}"></div>
        <span class="wi-num">${i+1}</span>
      </div>
      <div class="wi-ce" oncontextmenu="_wiCtx(event,${row.id},event)" style="position:relative">
        <div class="wi-route">
          <span class="from">${fromStr}</span>
          <span class="sep">→</span>
          <span class="dest">${toStr}</span>
          ${isGroup?`<span class="wi-gr" onclick="event.stopPropagation();_wiToggleGroup(${row.id})" style="cursor:pointer">×${exps.length} ▾</span>`:''}
        </div>
        <div class="wi-sub">
          ${loadDt!=='—'?`<span>${loadDt} → ${delDt}</span>`:''}
          ${loadDt!=='—'&&pals?`<span class="wi-sub-div"></span>`:''}
          ${pals?`<span>${pals} pal</span>`:''}
          ${ref?`<span class="wi-sub-div"></span><span style="color:var(--text-dim);font-style:italic">ref: ${ref}</span>`:''}
          ${_wiBadges(primary?.fields||{})}
        </div>
        <button class="wi-side-btn" title="Print Export" style="position:absolute;top:2px;right:2px;padding:2px 4px;font-size:10px;border:none;border-radius:4px"
                onclick="event.stopPropagation();_wiPrint(${row.id},'export')">🖨</button>
      </div>
      <div class="wi-ca-wrap">
        <div style="flex:1;display:flex;align-items:center;justify-content:center;
                    padding:4px 6px;cursor:pointer;min-width:0"
             onclick="event.stopPropagation();_wiOpenPopover(event,${row.id})">
          ${pill}
        </div>
      </div>
      <div class="wi-ci" id="wi-ci-${row.id}"
           onclick="event.stopPropagation()"
           ondragover="event.preventDefault();document.getElementById('wi-ci-${row.id}').classList.add('dh')"
           ondragleave="document.getElementById('wi-ci-${row.id}').classList.remove('dh')"
           ondrop="event.stopPropagation();_wiDropOnRow(event,${row.id})"
           style="position:relative">
        ${impPrev}
        ${row.importId ? `<button class="wi-side-btn" title="Print Import" style="position:absolute;top:2px;left:2px;padding:2px 4px;font-size:10px;border:none;border-radius:4px"
                onclick="event.stopPropagation();_wiPrint(${row.id},'import')">🖨</button>` : ''}
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

  const savedTruck  = row.truckLabel  ||trucks.find(t=>t.id===row.truckId)?.label  ||'';
  const savedTrailer= row.trailerLabel||trailers.find(t=>t.id===row.trailerId)?.label||'';
  const savedDriver = row.driverLabel ||drivers.find(d=>d.id===row.driverId)?.label  ||'';
  const savedPartner= row.partnerLabel||partners.find(p=>p.id===row.partnerId)?.label||'';

  return `
  <div class="wi-panel" onclick="event.stopPropagation()">

    <div class="wi-panel-top">
      <!-- OWNED FLEET -->
      <div style="display:flex;flex-direction:column;gap:2px">
        <div class="wi-section-lbl">Owned Fleet</div>
        <div style="display:flex;gap:6px;align-items:flex-end">
          <div class="wi-pf">
            <span class="wi-plbl">Truck</span>
            ${_wiSdrop('tk',row.id,trucks,row.truckId,savedTruck||'Plate…')}
          </div>
          <div class="wi-pf">
            <span class="wi-plbl">Trailer</span>
            ${_wiSdrop('tl',row.id,trailers,row.trailerId,savedTrailer||'Plate…')}
          </div>
          <div class="wi-pf">
            <span class="wi-plbl">Driver</span>
            ${_wiSdrop('dr',row.id,drivers,row.driverId,savedDriver||'Name…')}
          </div>
        </div>
      </div>

      <div class="wi-div" style="height:52px"></div>

      <!-- PARTNER -->
      <div style="display:flex;flex-direction:column;gap:2px">
        <div class="wi-section-lbl">Partner</div>
        <div style="display:flex;gap:6px;align-items:flex-end">
          <div class="wi-pf">
            <span class="wi-plbl">Company</span>
            ${_wiSdrop('pt',row.id,partners,row.partnerId,savedPartner||'Company…')}
          </div>
          <div class="wi-pf">
            <span class="wi-plbl">Truck Plates</span>
            <input class="wi-ti" type="text" placeholder="e.g. ΙΑΒ 1099"
                   value="${(row.partnerPlates||'').replace(/"/g,'&quot;')}"
                   id="wi-pp-${row.id}"
                   oninput="_wiField(${row.id},'partnerPlates',this.value)"
                   onclick="event.stopPropagation()"/>
          </div>
          <div class="wi-pf">
            <span class="wi-plbl">Export Rate €</span>
            <input class="wi-ti" type="number" step="0.01" placeholder="0.00"
                   style="width:80px"
                   value="${row.partnerRate||''}"
                   id="wi-pr-exp-${row.id}"
                   oninput="_wiField(${row.id},'partnerRate',this.value)"
                   onclick="event.stopPropagation()"/>
          </div>
          <div class="wi-pf" ${!row.importId?'style="opacity:0.4;pointer-events:none" title="No import matched"':''}>
            <span class="wi-plbl">Import Rate €</span>
            <input class="wi-ti" type="number" step="0.01" placeholder="0.00"
                   style="width:80px"
                   value="${row.partnerRateImp||''}"
                   id="wi-pr-imp-${row.id}"
                   oninput="_wiField(${row.id},'partnerRateImp',this.value)"
                   onclick="event.stopPropagation()"/>
          </div>
        </div>
      </div>

      <div class="wi-div" style="height:52px"></div>

      <!-- ACTIONS -->
      ${canFull?`
      <div style="display:flex;flex-direction:column;gap:6px;align-self:flex-end">
        <button class="wi-save-btn" id="wi-btn-${row.id}"
                onclick="event.stopPropagation();_wiSave(${row.id})">
          <div class="wi-spin"></div>
          ${row.saved?'Update Assignment':'Save Assignment'}
        </button>
        ${row.saved?`<button class="wi-clear-btn"
                onclick="event.stopPropagation();_wiClear(${row.id})">
                Clear</button>`:''}
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
              <div style="display:flex;align-items:center;gap:0;min-width:0;overflow:hidden;flex-wrap:wrap">
                <span style="font-size:11px;font-weight:700;color:var(--text);
                             white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                             flex-shrink:1;min-width:0">${_wiClean(imp.fields['Loading Summary']||'—')}</span>
                <span style="font-size:11px;color:var(--text-dim);margin:0 5px;flex-shrink:0">→</span>
                <span style="font-size:11px;font-weight:700;color:var(--text);
                             white-space:nowrap;flex-shrink:0">${_wiClean(imp.fields['Delivery Summary']||'—')}</span>
                ${_wiBadges(imp.fields)}
              </div>
              <div style="font-size:10px;color:var(--text-dim);margin-top:1px">
                ${_wiFmt(imp.fields['Loading DateTime'])} → ${_wiFmt(imp.fields['Delivery DateTime'])} · ${imp.fields['Total Pallets']||0} pal
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
  // Popover handles assignment — no-op
}
function _wiRepaintRow(rowId){
  const el=document.getElementById('wi-row-'+rowId);
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!el||!row){_wiPaint();return;}
  el.outerHTML=_wiRowHTML(row,WINTL.rows.findIndex(r=>r.id===rowId));
}

/* ── DRAG & DROP ───────────────────────────────────────────────────── */
window._wiDragging=null;

// Drag from import ROWS (new — replaces shelf drag)
function _wiImpDragStart(e,impId){
  // Block drag if import is already matched to an export
  const imp=WINTL.rows.find(r=>r.type==='import'&&r.orderId===impId);
  if(imp&&imp.matchedTo){
    e.preventDefault();
    toast('Unassign this import first','warn');
    return;
  }
  window._wiDragging=impId;
  e.dataTransfer.effectAllowed='move';
  e.currentTarget.style.opacity='0.5';
  setTimeout(()=>{ if(e.currentTarget) e.currentTarget.style.opacity=''; },0);
}

// Legacy compat (shelf chips no longer exist but keep for safety)
function _wiDragStart(e,impId){
  window._wiDragging=impId;
  e.dataTransfer.effectAllowed='move';
}

// Unmatch an import
async function _wiUnmatch(impId){
  // Find export row that has this import
  const expRow=WINTL.rows.find(r=>r.type==='export'&&r.importId===impId);
  if(!expRow) return;
  await _wiRemoveImport(expRow.id);
}

// Print import
function _wiPrintImp(impId){
  const base='https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/print.html';
  window.open(`${base}?orderId=${impId}&leg=import`,'_blank');
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

  // Optimistic UI update
  const oldImp=row.importId;
  row.importId=impId;

  // Clear previous match on any other export row
  WINTL.rows.forEach(r=>{
    if(r.type==='export'&&r.id!==rowId&&r.importId===impId) r.importId=null;
  });

  // Update import row matchedTo
  WINTL.rows.forEach(r=>{
    if(r.type==='import'){
      if(r.orderId===impId) r.matchedTo=row.orderId;
      else if(r.matchedTo===row.orderId&&oldImp&&r.orderId!==oldImp) r.matchedTo=null;
    }
  });

  _wiPaint();

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
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!row){ toast('Row not found','warn'); return; }
  if(!row.importId){ toast('No import linked','warn'); return; }
  const impId=row.importId;
  row.importId=null;

  // Update import row UI
  const impRow=WINTL.rows.find(r=>r.type==='import'&&r.orderId===impId);
  if(impRow) impRow.matchedTo=null;

  _wiPaint();

  // Clear from ORDERS (patch export order)
  let ok=true;
  for(const orderId of row.orderIds){
    try{
      const res=await atPatch(TABLES.ORDERS,orderId,{'Matched Import ID':''});
      if(res?.error){ ok=false; throw new Error(res.error.message||res.error.type); }
    }catch(err){
      toast('Error: '+err.message.slice(0,60),'warn');
      ok=false;
    }
  }
  if(ok){
    // Invalidate cache so next load is fresh
    if(typeof atClearCache==='function') atClearCache(TABLES.ORDERS);
    toast('Import removed ✓');
  }
}

/* ── SAVE ASSIGNMENT ───────────────────────────────────────────────── */
/* ── POPOVER ─────────────────────────────────────────────────── */
function _wiOpenPopover(e,rowId){
  e.stopPropagation();
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const {trucks,trailers,drivers,partners}=WINTL.data;
  const primaryExp=WINTL.data.exports.find(r=>r.id===row.orderIds[0]);
  const fromStr=_wiClean(primaryExp?.fields['Loading Summary']||'').slice(0,28);
  const toStr  =_wiClean(primaryExp?.fields['Delivery Summary']||'').slice(0,28);

  const mkDrop=(px,arr,selId,ph,wide)=>{
    const uid=`${px}_p_${rowId}`;
    const sel=arr.find(x=>x.id===selId)?.label||'';
    const opts=arr.map(x=>{
      const l=(x.label||'').replace(/"/g,'&quot;');
      return `<div class="wi-sdo" data-id="${x.id}" data-lbl="${l}">${l}</div>`;
    }).join('');
    return `<div class="wi-sd" id="wsd-${uid}">
      <input type="text" class="wi-pop-inp${wide?' wi-pop-inp-wide':''} wi-sdi"
             placeholder="${ph}" value="${sel.replace(/"/g,'&quot;')}"
             oninput="_wiSdF('${uid}',this.value)" onfocus="_wiSdO('${uid}')" autocomplete="off"/>
      <input type="hidden" id="wsd-v-${uid}" value="${selId||''}"/>
      <div id="wsd-l-${uid}" class="wi-sdl">${opts}</div>
    </div>`;
  };

  const pop=document.getElementById('wi-popover');
  pop.innerHTML=`
    <div class="wi-pop-header">
      <div>
        <div class="wi-pop-title">Assign Trip</div>
        <div class="wi-pop-subtitle">${fromStr} → ${toStr}</div>
      </div>
      <button class="wi-pop-close" onclick="_wiClosePopover()">×</button>
    </div>
    <div class="wi-pop-body">
      <div>
        <div class="wi-pop-section-lbl">Owned Fleet</div>
        <div class="wi-pop-row">
          <div class="wi-pop-field"><span class="wi-pop-lbl">Truck</span>${mkDrop('tk',trucks,row.truckId,'Plate…',false)}</div>
          <div class="wi-pop-field"><span class="wi-pop-lbl">Trailer</span>${mkDrop('tl',trailers,row.trailerId,'Plate…',false)}</div>
          <div class="wi-pop-field"><span class="wi-pop-lbl">Driver</span>${mkDrop('dr',drivers,row.driverId,'Name…',false)}</div>
        </div>
      </div>
      <div class="wi-pop-divider">or partner</div>
      <div>
        <div class="wi-pop-section-lbl">Partner</div>
        <div class="wi-pop-row">
          <div class="wi-pop-field"><span class="wi-pop-lbl">Company</span>${mkDrop('pt',partners,row.partnerId,'Company…',true)}</div>
          <div class="wi-pop-field">
            <span class="wi-pop-lbl">Plates</span>
            <input class="wi-pop-inp wi-pop-inp-wide" type="text"
                   placeholder="e.g. ΙΑΒ 1099" id="wi-pop-pp-${rowId}"
                   value="${(row.partnerPlates||'').replace(/"/g,'&quot;')}"/>
          </div>
          <div class="wi-pop-field">
            <span class="wi-pop-lbl">Export Rate €</span>
            <input class="wi-pop-inp" type="number" step="0.01" placeholder="0.00"
                   id="wi-pop-rate-exp-${rowId}" style="width:90px"
                   value="${row.partnerRate||''}"/>
          </div>
          <div class="wi-pop-field" ${!row.importId?'style="opacity:0.4;pointer-events:none" title="No import matched"':''}>
            <span class="wi-pop-lbl">Import Rate €</span>
            <input class="wi-pop-inp" type="number" step="0.01" placeholder="0.00"
                   id="wi-pop-rate-imp-${rowId}" style="width:90px"
                   value="${row.partnerRateImp||''}"/>
          </div>
        </div>
      </div>
    </div>
    <div class="wi-pop-footer">
      ${row.saved?`<button class="wi-pop-cancel" onclick="event.stopPropagation();_wiClear(${rowId}).then(()=>_wiClosePopover())">Clear</button>`:''}
      <button class="wi-pop-cancel" onclick="_wiClosePopover()">Cancel</button>
      <button class="wi-pop-save" id="wi-pop-btn-${rowId}"
              onclick="event.stopPropagation();_wiSaveFromPopover(${rowId})">
        <div id="wi-pop-spin-${rowId}" style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;display:none;animation:wi-spin .6s linear infinite"></div>
        ${row.saved?'Update':'Save Assignment'}
      </button>
    </div>`;

  const rect=e.currentTarget.getBoundingClientRect();
  const popW=430, popH=300;
  let left=rect.left-10;
  let top=rect.bottom+6;
  if(left+popW>window.innerWidth-12) left=window.innerWidth-popW-12;
  if(top+popH>window.innerHeight-12) top=rect.top-popH-6;
  if(top<10) top=10;
  Object.assign(pop.style,{display:'block',left:`${Math.max(10,left)}px`,top:`${top}px`});
  pop.dataset.rowId=String(rowId);
  setTimeout(()=>document.addEventListener('click',_wiPopoverOutside,{capture:true}),10);
}

function _wiPopoverOutside(e){
  const pop=document.getElementById('wi-popover');
  if(pop&&!pop.contains(e.target)&&!e.target.closest('.wi-ca')){
    _wiClosePopover();
  }
}
function _wiClosePopover(){
  const pop=document.getElementById('wi-popover');
  if(pop) pop.style.display='none';
  document.removeEventListener('click',_wiPopoverOutside,{capture:true});
}

async function _wiSaveFromPopover(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!row){return;}
  const syncPop=(p,f,l)=>{
    const uid=`${p}_p_${rowId}`;
    const val=document.getElementById(`wsd-v-${uid}`)?.value||'';
    const lbl=document.querySelector(`#wsd-${uid} .wi-sdi`)?.value||'';
    console.log('syncPop',uid,'val=',val,'lbl=',lbl);
    if(val){row[f]=val;row[l]=lbl;}
  };
  syncPop('tk','truckId','truckLabel');
  syncPop('tl','trailerId','trailerLabel');
  syncPop('dr','driverId','driverLabel');
  syncPop('pt','partnerId','partnerLabel');

  const ppEl=document.getElementById(`wi-pop-pp-${rowId}`);
  if(ppEl) row.partnerPlates=ppEl.value;
  const rateExpEl=document.getElementById(`wi-pop-rate-exp-${rowId}`);
  if(rateExpEl) row.partnerRate=rateExpEl.value;
  const rateImpEl=document.getElementById(`wi-pop-rate-imp-${rowId}`);
  if(rateImpEl) row.partnerRateImp=rateImpEl.value;
  const isPartner=!!row.partnerId;
  if(!isPartner&&!row.truckId){toast('Select Truck or Partner','warn');return;}
  if(isPartner&&!row.partnerRate){toast('Export Rate is required for Partner','warn');return;}
  if(isPartner&&row.importId&&!row.partnerRateImp){toast('Import Rate is required for Partner','warn');return;}
  const btn=document.getElementById(`wi-pop-btn-${rowId}`);
  const spin=document.getElementById(`wi-pop-spin-${rowId}`);
  if(btn){btn.disabled=true;if(spin)spin.style.display='block';}
  const fields=isPartner
    ?{'Partner':[row.partnerId],'Is Partner Trip':true,
      'Partner Truck Plates':row.partnerPlates||'','Status':'Assigned',
      'Truck':[],'Trailer':[],'Driver':[]}
    :{'Truck':[row.truckId],'Trailer':row.trailerId?[row.trailerId]:[],'Driver':row.driverId?[row.driverId]:[],'Is Partner Trip':false,'Status':'Assigned','Partner':[],'Partner Truck Plates':''};
  // Save to export orders (with export rate)
  const expFields={...fields};
  if(isPartner) expFields['Partner Rate']=row.partnerRate?parseFloat(row.partnerRate):null;

  // Save to import order (with import rate) if matched
  const impFields={...fields};
  if(isPartner) impFields['Partner Rate']=row.partnerRateImp?parseFloat(row.partnerRateImp):null;

  const errors=[];
  for(const orderId of row.orderIds){
    try{
      const res=await atPatch(TABLES.ORDERS,orderId,expFields);
      if(res?.error) throw new Error(res.error.message||res.error.type||JSON.stringify(res.error));
    }catch(err){errors.push(err.message);}
  }
  if(row.importId && !row.orderIds.includes(row.importId)){
    try{
      const res=await atPatch(TABLES.ORDERS,row.importId,impFields);
      if(res?.error) throw new Error(res.error.message||res.error.type||JSON.stringify(res.error));
    }catch(err){errors.push(err.message);}
  }
  if(errors.length){
    if(btn){btn.disabled=false;if(spin)spin.style.display='none';}
    const msg='SAVE ERROR: '+errors[0];
    console.error(msg);
    alert(msg);
    return;
  }
  _wiClosePopover();

  // Create PARTNER ASSIGNMENT record (only for export rows)
  if(isPartner && row.type==='export'){
    try{ await _wiCreatePartnerAssignments(row, fields); }
    catch(e){ console.warn('PA create error:',e.message); }
  }

  toast(row.saved?'Updated':'Saved');

  // Sync Veroia Switch → NATIONAL ORDERS
  try {
    for (const oid of row.orderIds) {
      const recs = await atGetAll(TABLES.ORDERS, {
        filterByFormula: 'RECORD_ID()="'+oid+'"',
        fields: ['Direction','Type','Veroia Switch ','National Order Created',
          'Client','Goods','Total Pallets','Temperature °C','Pallet Exchange',
          'National Groupage','Loading DateTime','Delivery DateTime',
          'Loading Location 1','Loading Location 2','Loading Location 3',
          'Loading Location 4','Loading Location 5','Loading Location 6',
          'Loading Location 7','Loading Location 8','Loading Location 9','Loading Location 10',
          'Unloading Location 1','Unloading Location 2','Unloading Location 3',
          'Unloading Location 4','Unloading Location 5','Unloading Location 6',
          'Unloading Location 7','Unloading Location 8','Unloading Location 9','Unloading Location 10',
        ],
      }, false);
      if (recs.length > 0 && typeof _syncNationalOrder === 'function')
        await _syncNationalOrder(oid, recs[0].fields);
    }
  } catch(e) { console.warn('Natl sync (weekly):', e.message); }

  await renderWeeklyIntl();
}

async function _wiCreatePartnerAssignments(row, fields){
  // Build list of all orders (export + import) with their rates
  const assignments = [];

  // Export orders
  for(const orderId of row.orderIds){
    assignments.push({
      orderId,
      partnerId: row.partnerId,
      rate: row.partnerRate ? parseFloat(row.partnerRate) : null,
    });
  }
  // Import order
  if(row.importId && !row.orderIds.includes(row.importId)){
    assignments.push({
      orderId: row.importId,
      partnerId: row.partnerId,
      rate: row.partnerRateImp ? parseFloat(row.partnerRateImp) : null,
    });
  }

  const today = new Date().toISOString().split('T')[0];

  for(const asgn of assignments){
    try{
      // Check if a PARTNER ASSIGNMENT already exists for this order
      const existing = await atGetAll(PA_TABLE, {
        filterByFormula: `FIND('${asgn.orderId}', ARRAYJOIN({Order}, ','))`,
        fields: ['Order'],
      }, false);

      const paFields = {
        'Partner':         [asgn.partnerId],
        'Order':           [asgn.orderId],
        'Assignment Date': today,
        'Status':          'Pending',
      };
      if(asgn.rate) paFields['Partner Rate'] = asgn.rate;

      if(existing.length > 0){
        // Update existing
        await atPatch(PA_TABLE, existing[0].id, paFields);
      } else {
        // Create new
        await atCreate(PA_TABLE, paFields);
      }
    }catch(err){
      console.error('PARTNER ASSIGNMENT create/update failed:', err.message);
    }
  }
}

async function _wiSave(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;

  // Sync dropdowns — only overwrite if user has made a selection (non-empty)
  const sync=(p,f,l)=>{
    const uid=`${p}_${rowId}`;
    const val=document.getElementById(`wsd-v-${uid}`)?.value||'';
    const lbl=document.querySelector(`#wsd-${uid} .wi-sdi`)?.value||'';
    if(val) { row[f]=val; row[l]=lbl; }
    else if(lbl===''&&row[f]) { /* keep existing */ }
  };
  sync('tk','truckId','truckLabel');
  sync('tl','trailerId','trailerLabel');
  sync('dr','driverId','driverLabel');
  sync('pt','partnerId','partnerLabel');

  // Read partner plates + rates from inputs
  const ppInput=document.getElementById(`wi-pp-${rowId}`);
  if(ppInput) row.partnerPlates=ppInput.value;
  const prExpInput=document.getElementById(`wi-pr-exp-${rowId}`);
  if(prExpInput) row.partnerRate=prExpInput.value;
  const prImpInput=document.getElementById(`wi-pr-imp-${rowId}`);
  if(prImpInput) row.partnerRateImp=prImpInput.value;

  const isPartner=!!row.partnerId;
  if(!isPartner&&!row.truckId){toast('Select Truck or Partner','warn');return;}
  if(isPartner&&!row.partnerRate){toast('Partner Rate is required','warn');return;}
  if(isPartner&&row.importId&&!row.partnerRateImp){toast('Import Rate is required','warn');return;}

  const btn=document.getElementById('wi-btn-'+rowId);
  if(btn){btn.disabled=true;btn.classList.add('saving');
    btn.querySelector('.wi-spin').style.display='block';}

  const fields=isPartner
    ?{ 'Partner'            :[row.partnerId],
       'Is Partner Trip'    :true,
       'Partner Truck Plates':row.partnerPlates||'',
       'Partner Rate'       :row.partnerRate?parseFloat(row.partnerRate):null,
       'Status'             :'Assigned',
       'Truck':[],'Trailer':[],'Driver':[] }
    :{ 'Truck'              :[row.truckId],
       'Trailer'            :row.trailerId?[row.trailerId]:[],
       'Driver'             :row.driverId?[row.driverId]:[],
       'Is Partner Trip'    :false,
       'Status'             :'Assigned',
       'Partner':[],'Partner Truck Plates':'' };

  const errors=[];
  for(const orderId of row.orderIds){
    try{
      const res=await atPatch(TABLES.ORDERS,orderId,fields);
      if(res?.error) throw new Error(res.error.message||res.error.type||JSON.stringify(res.error));
    }catch(err){ errors.push(err.message); }
  }

  if(errors.length){
    if(btn){btn.disabled=false;btn.classList.remove('saving');}
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
  const allOrderIds=[...row.orderIds];
  if(row.importId && !allOrderIds.includes(row.importId)) allOrderIds.push(row.importId);
  const errors=[];
  for(const orderId of allOrderIds){
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
function _wiPrint(rowId, leg){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const orderId = leg==='export' ? row.orderIds[0] : (row.importId||row.orderIds[0]);
  const base = 'https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/print.html';
  window.open(`${base}?orderId=${orderId}&leg=${leg}`,'_blank');
}

function _wiToggleGroup(rowId){
  WINTL.ui.openGroup = WINTL.ui.openGroup===rowId ? null : rowId;
  _wiRepaintRow(rowId);
}

function _wiOpenImpPopover(e, impId, rowId){
  // Import row uses same popover — row IS the import row, orderId = import order
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!row){console.error('Import row not found:',rowId);return;}
  _wiOpenPopover(e, rowId);
}

function _wiNavWeek(delta){
  WINTL.week=Math.max(1,Math.min(53,WINTL.week+delta));
  WINTL.ui.openRow=null;
  renderWeeklyIntl();
}
