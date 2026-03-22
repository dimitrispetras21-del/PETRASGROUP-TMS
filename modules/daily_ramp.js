// ═══════════════════════════════════════════════════════════════
// DAILY RAMP BOARD — v2.1
// Vermion Fresh — Veroia warehouse
// 2-col: Inbound | Outbound + Combined timeline + Stock
// ═══════════════════════════════════════════════════════════════

'use strict';

const RAMP = {
  date: new Date().toISOString().split('T')[0],
  records: [], trucks: [], drivers: [], locs: [], stock: [],
};

const RAMP_FIELDS = [
  'Plan Date','Time','Type','Status','Pallets','Goods',
  'Supplier/Client','Notes','Postponed To','Temperature',
  'Order','National Order','Truck','Driver',
  'Is Veroia Switch','Ramp Category','Stock Status',
];

/* ── CSS ──────────────────────────────────────────────────────── */
(function(){
  if (document.getElementById('ramp-css')) return;
  const s = document.createElement('style'); s.id = 'ramp-css';
  s.textContent = `
.ramp-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
.ramp-day-btn { padding:7px 14px; font-size:11px; font-weight:700; border-radius:7px;
  border:1px solid var(--border-mid); background:var(--bg); color:var(--text-mid);
  cursor:pointer; font-family:'Syne',sans-serif; transition:all .15s; }
.ramp-day-btn:hover { background:var(--bg-hover); }
.ramp-day-btn.active { background:#0EA5E9; color:#fff; border-color:#0EA5E9;
  box-shadow:0 2px 8px rgba(14,165,233,0.25); }
.ramp-date-inp { padding:6px 10px; font-size:11px; border-radius:7px;
  border:1px solid var(--border-mid); background:var(--bg); color:var(--text); outline:none;
  font-family:'DM Sans',sans-serif; }

/* KPIs */
.ramp-kpis { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
.ramp-kpi { background:var(--bg-card); border:1px solid var(--border); border-left:3px solid #0EA5E9;
  border-radius:10px; padding:14px 18px; flex:1; min-width:110px;
  box-shadow:0 1px 3px rgba(0,0,0,0.04); }
.ramp-kpi-lbl { font-size:11px; font-weight:500; letter-spacing:.3px; color:var(--text-dim); margin-bottom:8px; }
.ramp-kpi-val { font-family:'Syne',sans-serif; font-size:30px; font-weight:700;
  letter-spacing:-1px; line-height:1; }
.ramp-kpi-sub { font-size:12px; color:var(--text-dim); margin-left:4px; }

/* 2-col grid */
.ramp-pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; }
@media(max-width:1000px) { .ramp-pair { grid-template-columns:1fr; } }

/* sections */
.ramp-sec-hd { padding:8px 14px; border-radius:10px 10px 0 0;
  font-family:'Syne',sans-serif; font-size:10px; font-weight:800;
  letter-spacing:1.5px; text-transform:uppercase; background:#0B1929; color:#C4CFDB;
  display:flex; justify-content:space-between; align-items:center; }
.ramp-sec-hd.inbound  { border-left:3px solid #059669; }
.ramp-sec-hd.outbound { border-left:3px solid #0EA5E9; }
.ramp-sec-hd.timeline { border-left:3px solid #6B7280; }
.ramp-sec-hd.stock    { border-left:3px solid #D97706; }

/* table */
.ramp-t { width:100%; border-collapse:collapse; background:var(--bg-card);
  border:1px solid var(--border); border-top:none; border-radius:0 0 10px 10px; overflow:hidden; }
.ramp-t thead th { padding:9px 10px; font-size:10px; font-weight:600;
  letter-spacing:1px; text-transform:uppercase; color:var(--text-dim);
  text-align:left; border-bottom:1px solid var(--border); white-space:nowrap; background:#F0F7FF; }
.ramp-t thead th.c { text-align:center; }
.ramp-t tbody td { padding:8px 10px; font-size:12px; border-bottom:1px solid var(--border); vertical-align:middle; }
.ramp-t tbody tr:last-child td { border-bottom:none; }
.ramp-t tbody tr:hover td { background:var(--bg-hover); }
.ramp-t tbody tr.done td { opacity:.4; }
.ramp-t .c { text-align:center; }
.ramp-t .trn { max-width:130px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ramp-t .rn { font-family:'Syne',sans-serif; font-weight:700; color:var(--text-dim); font-size:11px; }
.ramp-t select.tinp { padding:3px 4px; font-size:10px; border:1px solid var(--border-mid);
  border-radius:5px; background:var(--bg-card); color:var(--text); outline:none;
  font-family:'DM Sans',sans-serif; cursor:pointer; }
.ramp-t .abtn { font-size:10px; font-weight:500; padding:3px 8px;
  border-radius:5px; border:1px solid var(--border-mid); background:none;
  cursor:pointer; white-space:nowrap; transition:all .15s; }
.ramp-t .abtn:hover { background:var(--bg-hover); }
.ramp-t .abtn-ok { border-color:rgba(5,150,105,0.3); color:var(--success); }
.ramp-t .abtn-pp { border-color:rgba(217,119,6,0.3); color:var(--warning); }
.ramp-empty td { text-align:center; color:var(--text-dim); font-style:italic; padding:16px !important; }

/* badges */
.vs-badge { font-size:8px; font-weight:800; letter-spacing:.6px; padding:2px 6px;
  border-radius:3px; text-transform:uppercase; border:1px solid; }
.vs-badge.vf  { color:#059669; border-color:rgba(5,150,105,0.3); background:rgba(5,150,105,0.08); }
.vs-badge.vs  { color:#0EA5E9; border-color:rgba(14,165,233,0.3); background:rgba(14,165,233,0.08); }
.vs-badge.vsg { color:#7C3AED; border-color:rgba(124,58,237,0.3); background:rgba(124,58,237,0.08); }
.tl-type { font-size:8px; font-weight:800; letter-spacing:.5px; padding:2px 6px;
  border-radius:3px; text-transform:uppercase; color:#fff; }
.tl-type.in  { background:#059669; }
.tl-type.out { background:#0EA5E9; }

/* stock */
.stock-client { font-weight:700; font-size:12px; }
.stock-days { font-size:11px; }
.stock-days.fresh { color:var(--success); }
.stock-days.aging { color:var(--warning); }
.stock-days.old   { color:var(--danger); }
`;
  document.head.appendChild(s);
})();

/* ── ENTRY ────────────────────────────────────────────────────── */
async function renderDailyRamp() {
  document.getElementById('topbarTitle').textContent = 'Daily Ramp Board';
  document.getElementById('content').innerHTML = showLoading('Φόρτωση ράμπας…');
  try { await _rampLoad(); _rampDraw(); }
  catch(e) { document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Σφάλμα: ${e.message}</div>`; console.error(e); }
}

async function _rampLoad() {
  if (!RAMP.trucks.length) {
    const [t,d,l] = await Promise.all([
      atGetAll(TABLES.TRUCKS,{fields:['License Plate'],filterByFormula:'{Active}=TRUE()'},false),
      atGetAll(TABLES.DRIVERS,{fields:['Full Name'],filterByFormula:'{Active}=TRUE()'},false),
      atGetAll(TABLES.LOCATIONS,{fields:['Name','City','Country']},true),
    ]);
    RAMP.trucks=t.map(r=>({id:r.id,lb:r.fields['License Plate']||''}));
    RAMP.drivers=d.map(r=>({id:r.id,lb:r.fields['Full Name']||''}));
    RAMP.locs=l;
  }
  const filter=`IS_SAME({Plan Date},'${RAMP.date}','day')`;
  const recs=await atGetAll(TABLES.RAMP,{filterByFormula:filter,fields:RAMP_FIELDS},false);
  recs.sort((a,b)=>(a.fields['Time']||'ZZ').localeCompare(b.fields['Time']||'ZZ'));
  RAMP.records=recs;

  const stockFilter=`AND({Type}='Παραλαβή',{Status}='✅ Έγινε',OR({Stock Status}='In Stock',{Stock Status}=''))`;
  RAMP.stock=await atGetAll(TABLES.RAMP,{filterByFormula:stockFilter,fields:RAMP_FIELDS},false);
}

/* ── HELPERS ──────────────────────────────────────────────────── */
const _rK=a=>a?.length?(a[0]?.id||a[0]||null):null;
const _rTruck=f=>{const id=_rK(f['Truck']);return id?RAMP.trucks.find(t=>t.id===id)?.lb||'':'';};
const _rDriver=f=>{const id=_rK(f['Driver']);return id?RAMP.drivers.find(d=>d.id===id)?.lb||'':'';};
function _rCat(f){
  const c=f['Ramp Category']||'',vs=f['Is Veroia Switch'];
  if(c==='Vermion Fresh')return'<span class="vs-badge vf">VF</span>';
  if(c==='VS + Groupage')return'<span class="vs-badge vsg">VS+G</span>';
  if(c==='VS Simple'||vs)return'<span class="vs-badge vs">VS</span>';
  return '';
}

/* ── DRAW ─────────────────────────────────────────────────────── */
function _rampDraw() {
  const today=new Date().toISOString().split('T')[0];
  const tmrw=new Date(Date.now()+864e5).toISOString().split('T')[0];
  const fD=d=>{try{const p=d.split('-');return`${p[2]}/${p[1]}/${p[0]}`;}catch{return d;}};

  const inb=RAMP.records.filter(r=>r.fields['Type']==='Παραλαβή');
  const out=RAMP.records.filter(r=>r.fields['Type']==='Φόρτωση');
  const inPal=inb.reduce((s,r)=>s+(r.fields['Pallets']||0),0);
  const outPal=out.reduce((s,r)=>s+(r.fields['Pallets']||0),0);
  const net=inPal-outPal;
  const stockPal=RAMP.stock.reduce((s,r)=>s+(r.fields['Pallets']||0),0);

  // Stock by client
  const sbc={};
  RAMP.stock.forEach(r=>{const cl=r.fields['Supplier/Client']||'Unknown';
    if(!sbc[cl])sbc[cl]={pal:0,items:[]};sbc[cl].pal+=(r.fields['Pallets']||0);sbc[cl].items.push(r);});

  // Time options
  const tOpts=(()=>{const h=[];for(let i=0;i<24;i++)for(let m=0;m<60;m+=30){const t=String(i).padStart(2,'0')+':'+String(m).padStart(2,'0');h.push(t);}return h;})();

  // Combined timeline (all records sorted by time)
  const allSorted=[...RAMP.records].sort((a,b)=>(a.fields['Time']||'ZZ').localeCompare(b.fields['Time']||'ZZ'));

  document.getElementById('content').innerHTML=`
    <div class="page-header" style="margin-bottom:12px">
      <div><div class="page-title">Daily Ramp Board</div>
        <div class="page-sub">Vermion Fresh · ${fD(RAMP.date)}</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="_rampAddNew('Παραλαβή')">+ Inbound</button>
        <button class="btn btn-ghost" onclick="_rampAddNew('Φόρτωση')">+ Outbound</button>
        <button class="btn btn-ghost" onclick="renderDailyRamp()">Refresh</button>
      </div>
    </div>
    <div class="ramp-toolbar">
      <button class="ramp-day-btn ${RAMP.date===today?'active':''}" onclick="_rampSD('${today}')">Today</button>
      <button class="ramp-day-btn ${RAMP.date===tmrw?'active':''}" onclick="_rampSD('${tmrw}')">Tomorrow</button>
      <input type="date" class="ramp-date-inp" value="${RAMP.date}" onchange="_rampSD(this.value)">
    </div>
    <div class="ramp-kpis">
      <div class="ramp-kpi" style="border-left-color:#059669"><div class="ramp-kpi-lbl">Inbound Today</div>
        <div><span class="ramp-kpi-val" style="color:#059669">+${inPal}</span><span class="ramp-kpi-sub">pal</span></div></div>
      <div class="ramp-kpi" style="border-left-color:#0EA5E9"><div class="ramp-kpi-lbl">Outbound Today</div>
        <div><span class="ramp-kpi-val" style="color:#0EA5E9">-${outPal}</span><span class="ramp-kpi-sub">pal</span></div></div>
      <div class="ramp-kpi" style="border-left-color:${net>=0?'var(--success)':'var(--danger)'}"><div class="ramp-kpi-lbl">Net Today</div>
        <div><span class="ramp-kpi-val" style="color:${net>=0?'var(--success)':'var(--danger)'}">${net>=0?'+':''}${net}</span><span class="ramp-kpi-sub">pal</span></div></div>
      <div class="ramp-kpi" style="border-left-color:#D97706"><div class="ramp-kpi-lbl">Stock Total</div>
        <div><span class="ramp-kpi-val" style="color:#D97706">${stockPal}</span><span class="ramp-kpi-sub">pal</span></div></div>
    </div>

    <div class="ramp-pair">
      <div>
        <div class="ramp-sec-hd inbound"><span>↓ Inbound</span><span style="opacity:.5">${inb.length}</span></div>
        <table class="ramp-t"><thead><tr>
          <th>#</th><th>Time</th><th>Client</th><th>Goods</th><th>Temp</th><th>Pallets</th><th>Truck</th><th>Cat</th><th>Actions</th>
        </tr></thead><tbody>${inb.length?inb.map((r,i)=>_rRow(r,i+1,tOpts)).join(''):'<tr class="ramp-empty"><td colspan="9">No inbound</td></tr>'}</tbody></table>
      </div>
      <div>
        <div class="ramp-sec-hd outbound"><span>↑ Outbound</span><span style="opacity:.5">${out.length}</span></div>
        <table class="ramp-t"><thead><tr>
          <th>#</th><th>Time</th><th>Client</th><th>Goods</th><th>Temp</th><th>Pallets</th><th>Truck</th><th>Cat</th><th>Actions</th>
        </tr></thead><tbody>${out.length?out.map((r,i)=>_rRow(r,i+1,tOpts)).join(''):'<tr class="ramp-empty"><td colspan="9">No outbound</td></tr>'}</tbody></table>
      </div>
    </div>

    <div class="ramp-sec-hd timeline"><span>🕐 Timeline — All Operations</span><span style="opacity:.5">${allSorted.length}</span></div>
    <table class="ramp-t"><thead><tr>
      <th>Time</th><th>Type</th><th>Client</th><th>Goods</th><th>Temp</th><th>Pallets</th><th>Truck</th><th>Driver</th><th>Cat</th><th>Status</th>
    </tr></thead><tbody>${allSorted.length?allSorted.map(r=>_rTlRow(r)).join(''):'<tr class="ramp-empty"><td colspan="10">No operations today</td></tr>'}</tbody></table>

    <div style="margin-top:16px">
      <div class="ramp-sec-hd stock"><span>📦 Stock — In Warehouse</span><span style="opacity:.5">${stockPal} pal</span></div>
      <table class="ramp-t"><thead><tr><th>#</th><th>Client</th><th>Pallets</th><th>Received</th><th>Days</th></tr></thead>
      <tbody>${Object.keys(sbc).length?Object.keys(sbc).sort().map((cl,i)=>{
        const d=sbc[cl],dates=d.items.map(r=>r.fields['Plan Date']).filter(Boolean).sort(),
          oldest=dates[0]||'',days=oldest?Math.floor((Date.now()-new Date(oldest).getTime())/864e5):0,
          dc=days<=1?'fresh':days<=3?'aging':'old';
        return`<tr><td class="rn">${i+1}</td><td class="stock-client">${cl}</td><td>${d.pal}</td><td>${oldest?oldest.substring(5):''}</td><td class="stock-days ${dc}">${days}d</td></tr>`;
      }).join(''):'<tr class="ramp-empty"><td colspan="5">Warehouse empty</td></tr>'}</tbody></table>
    </div>`;
}

/* ── TABLE ROW ────────────────────────────────────────────────── */
function _rRow(rec,num,tOpts) {
  const f=rec.fields,id=rec.id;
  const status=f['Status']||'';
  const isDone=status==='✅ Έγινε';
  const time=f['Time']||'';
  const client=f['Supplier/Client']||'—';
  const goods=(f['Goods']||'').substring(0,35);
  const temp=f['Temperature']||f['Temperature °C']||'';
  const pal=f['Pallets']||'';
  const truck=_rTruck(f);
  const isIn=f['Type']==='Παραλαβή';

  const timeSel=`<select class="tinp" onchange="_rampSvF('${id}','Time',this.value)"><option value="">--:--</option>${tOpts.map(t=>`<option value="${t}"${time===t?' selected':''}>${t}</option>`).join('')}</select>`;
  const acts=isDone?'<span style="color:var(--success);font-size:10px">✓ Done</span>'
    :`<button class="abtn abtn-ok" onclick="_rampDone('${id}','${isIn}')">${isIn?'Done':'Loaded'}</button> <button class="abtn abtn-pp" onclick="_rampPostpone('${id}')">Postpone</button>`;

  return`<tr class="${isDone?'done':''}">
    <td class="rn">${num}</td><td>${timeSel}</td>
    <td class="trn" title="${client}">${client}</td>
    <td class="trn" title="${goods}">${goods}</td>
    <td>${temp?temp+'°C':''}</td><td>${pal}</td>
    <td>${truck||'—'}</td><td>${_rCat(f)}</td><td>${acts}</td></tr>`;
}

/* ── TIMELINE ROW ─────────────────────────────────────────────── */
function _rTlRow(rec) {
  const f=rec.fields;
  const status=f['Status']||'Planned';
  const isDone=status==='✅ Έγινε';
  const isIn=f['Type']==='Παραλαβή';
  const typeBadge=isIn?'<span class="tl-type in">IN</span>':'<span class="tl-type out">OUT</span>';
  const statusTxt=isDone?'<span style="color:var(--success)">✓ Done</span>'
    :status==='⏩ Postponed'?'<span style="color:var(--warning)">Postponed</span>'
    :'<span style="color:var(--text-dim)">Planned</span>';

  return`<tr class="${isDone?'done':''}">
    <td>${f['Time']||'—'}</td><td>${typeBadge}</td>
    <td class="trn">${f['Supplier/Client']||'—'}</td>
    <td class="trn">${(f['Goods']||'').substring(0,35)}</td>
    <td>${f['Temperature']||f['Temperature °C']?((f['Temperature']||f['Temperature °C'])+'°C'):''}</td>
    <td>${f['Pallets']||''}</td>
    <td>${_rTruck(f)||'—'}</td><td>${_rDriver(f)||'—'}</td>
    <td>${_rCat(f)}</td><td>${statusTxt}</td></tr>`;
}

/* ── ACTIONS ──────────────────────────────────────────────────── */
function _rampSD(d){RAMP.date=d;renderDailyRamp();}
async function _rampSvF(id,fld,v){try{await atPatch(TABLES.RAMP,id,{[fld]:v||null});const r=RAMP.records.find(x=>x.id===id);if(r)r.fields[fld]=v;}catch(e){toast('Error','danger');}}

async function _rampDone(id,isIn){
  const fields={'Status':'✅ Έγινε'};
  if(isIn==='true') fields['Stock Status']='In Stock';
  try{await atPatch(TABLES.RAMP,id,fields);invalidateCache(TABLES.RAMP);toast('Done ✓');renderDailyRamp();}catch(e){toast('Error','danger');}
}

async function _rampPostpone(id){
  const tmrw=new Date(Date.now()+864e5).toISOString().split('T')[0];
  try{await atPatch(TABLES.RAMP,id,{'Status':'⏩ Postponed','Plan Date':tmrw,'Postponed To':tmrw});
    invalidateCache(TABLES.RAMP);toast('Postponed → tomorrow');renderDailyRamp();}catch(e){toast('Error','danger');}
}

function _rampAddNew(type){
  const trOpts=RAMP.trucks.map(t=>`<option value="${t.id}">${t.lb}</option>`).join('');
  const drOpts=RAMP.drivers.map(d=>`<option value="${d.id}">${d.lb}</option>`).join('');
  const catOpts=['Vermion Fresh','VS Simple','VS + Groupage','Other'].map(c=>`<option value="${c}">${c}</option>`).join('');

  openModal(`New ${type==='Παραλαβή'?'Inbound':'Outbound'}`,`
    <div class="form-grid">
      <div class="form-field"><label class="form-label">Time</label>
        <input class="form-input" id="nr_time" type="text" placeholder="08:00" style="max-width:100px"></div>
      <div class="form-field"><label class="form-label">Category</label>
        <select class="form-select" id="nr_cat">${catOpts}</select></div>
      <div class="form-field"><label class="form-label">Client</label>
        <input class="form-input" id="nr_client" type="text"></div>
      <div class="form-field"><label class="form-label">Goods</label>
        <input class="form-input" id="nr_goods" type="text"></div>
      <div class="form-field"><label class="form-label">Temperature °C</label>
        <input class="form-input" id="nr_temp" type="text" placeholder="e.g. 2"></div>
      <div class="form-field"><label class="form-label">Pallets</label>
        <input class="form-input" id="nr_pal" type="number" min="0"></div>
      <div class="form-field"><label class="form-label">Truck</label>
        <select class="form-select" id="nr_truck"><option value="">—</option>${trOpts}</select></div>
      <div class="form-field"><label class="form-label">Driver</label>
        <select class="form-select" id="nr_driver"><option value="">—</option>${drOpts}</select></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="_rampSaveNew('${type}')">Save</button>`);
}

async function _rampSaveNew(type){
  const fields={'Plan Date':RAMP.date,'Type':type,'Status':'Προγραμματισμένο'};
  const v=id=>document.getElementById(id)?.value?.trim();
  if(v('nr_time'))    fields['Time']=v('nr_time');
  if(v('nr_cat'))     fields['Ramp Category']=v('nr_cat');
  if(v('nr_client'))  fields['Supplier/Client']=v('nr_client');
  if(v('nr_goods'))   fields['Goods']=v('nr_goods');
  if(v('nr_temp'))    fields['Temperature']=v('nr_temp');
  if(v('nr_pal'))     fields['Pallets']=parseFloat(v('nr_pal'));
  if(v('nr_truck'))   fields['Truck']=[v('nr_truck')];
  if(v('nr_driver'))  fields['Driver']=[v('nr_driver')];
  if(v('nr_cat')&&v('nr_cat').includes('VS')) fields['Is Veroia Switch']=true;

  try{const res=await atCreate(TABLES.RAMP,fields);
    if(res?.error)throw new Error(res.error.message);
    invalidateCache(TABLES.RAMP);closeModal();toast('Added ✓');renderDailyRamp();
  }catch(e){toast('Error: '+e.message,'danger');}
}
