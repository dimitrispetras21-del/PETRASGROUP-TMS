// ═══════════════════════════════════════════════════════════════
// DAILY RAMP BOARD — v2.0
// Vermion Fresh warehouse — Veroia
// Table layout: Παραλαβές | Φορτώσεις | Stock (αφόρτωτα)
// Categories: Vermion Fresh, VS Simple, VS + Groupage
// ═══════════════════════════════════════════════════════════════

'use strict';

const RAMP = {
  date: new Date().toISOString().split('T')[0],
  records: [], trucks: [], drivers: [], locs: [],
  stock: [],  // inbound Done records not yet loaded out
};

const RAMP_FIELDS = [
  'Plan Date','Time','Type','Status','Pallets','Goods',
  'Supplier/Client','Notes','Postponed To',
  'Order','National Order','Truck','Driver',
  'Temp Checked','Pallets Counted','Goods Staged','Temp Set',
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

/* sections */
.ramp-sections { display:flex; flex-direction:column; gap:16px; }
.ramp-sec-hd { padding:8px 14px; border-radius:10px 10px 0 0;
  font-family:'Syne',sans-serif; font-size:10px; font-weight:800;
  letter-spacing:1.5px; text-transform:uppercase; background:#0B1929; color:#C4CFDB;
  display:flex; justify-content:space-between; align-items:center; }
.ramp-sec-hd.inbound  { border-left:3px solid #059669; }
.ramp-sec-hd.outbound { border-left:3px solid #0EA5E9; }
.ramp-sec-hd.stock    { border-left:3px solid #D97706; }

/* table */
.ramp-t { width:100%; border-collapse:collapse; background:var(--bg-card);
  border:1px solid var(--border); border-top:none; border-radius:0 0 10px 10px; overflow:hidden; }
.ramp-t thead th { padding:9px 14px; font-size:10px; font-weight:600;
  letter-spacing:1px; text-transform:uppercase; color:var(--text-dim);
  text-align:left; border-bottom:1px solid var(--border); white-space:nowrap; background:#F0F7FF; }
.ramp-t thead th.c { text-align:center; }
.ramp-t tbody td { padding:10px 14px; font-size:13px; border-bottom:1px solid var(--border); vertical-align:middle; }
.ramp-t tbody tr:last-child td { border-bottom:none; }
.ramp-t tbody tr:hover td { background:var(--bg-hover); }
.ramp-t tbody tr.done td { opacity:.4; }
.ramp-t .c { text-align:center; }
.ramp-t .trn { max-width:160px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ramp-t .rn { font-family:'Syne',sans-serif; font-weight:700; color:var(--text-dim); font-size:11px; }
.ramp-t input[type=checkbox] { width:15px; height:15px; cursor:pointer; accent-color:var(--success); }
.ramp-t select.tinp { padding:4px 6px; font-size:11px; border:1px solid var(--border-mid);
  border-radius:6px; background:var(--bg-card); color:var(--text); outline:none;
  font-family:'DM Sans',sans-serif; cursor:pointer; }
.ramp-t select.tinp:focus { border-color:#0EA5E9; box-shadow:0 0 0 3px rgba(14,165,233,0.20); }
.ramp-t .abtn { font-size:11px; font-weight:500; letter-spacing:.2px; padding:4px 10px;
  border-radius:6px; border:1px solid var(--border-mid); background:none;
  cursor:pointer; white-space:nowrap; transition:all .15s; }
.ramp-t .abtn:hover { background:var(--bg-hover); }
.ramp-t .abtn-ok { border-color:rgba(5,150,105,0.3); color:var(--success); }
.ramp-t .abtn-pp { border-color:rgba(217,119,6,0.3); color:var(--warning); }
.ramp-t .abtn-add { border-color:rgba(14,165,233,0.3); color:#0EA5E9; }
.ramp-empty td { text-align:center; color:var(--text-dim); font-style:italic; padding:20px !important; }

/* VS badge */
.vs-badge { font-size:8px; font-weight:800; letter-spacing:.6px; padding:2px 6px;
  border-radius:3px; text-transform:uppercase; border:1px solid; }
.vs-badge.vf  { color:#059669; border-color:rgba(5,150,105,0.3); background:rgba(5,150,105,0.08); }
.vs-badge.vs  { color:#0EA5E9; border-color:rgba(14,165,233,0.3); background:rgba(14,165,233,0.08); }
.vs-badge.vsg { color:#7C3AED; border-color:rgba(124,58,237,0.3); background:rgba(124,58,237,0.08); }

/* stock client rows */
.stock-client { font-weight:700; font-size:12px; color:var(--text); }
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

/* ── LOAD ─────────────────────────────────────────────────────── */
async function _rampLoad() {
  // Assets
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

  // Day records
  const filter=`IS_SAME({Plan Date},'${RAMP.date}','day')`;
  const recs = await atGetAll(TABLES.RAMP, {filterByFormula:filter, fields:RAMP_FIELDS}, false);
  recs.sort((a,b)=>(a.fields['Time']||'ZZ').localeCompare(b.fields['Time']||'ZZ'));
  RAMP.records = recs;

  // Stock: inbound Done records NOT loaded out (all time)
  const stockFilter = `AND({Type}='Παραλαβή',{Status}='✅ Έγινε',OR({Stock Status}='In Stock',{Stock Status}=''))`;
  RAMP.stock = await atGetAll(TABLES.RAMP, {filterByFormula:stockFilter, fields:RAMP_FIELDS}, false);
}

/* ── HELPERS ──────────────────────────────────────────────────── */
const _rL=a=>{if(!a||!a.length)return null;return a[0]?.id||a[0]||null;};
const _rTruck=f=>{const id=_rL(f['Truck']);return id?RAMP.trucks.find(t=>t.id===id)?.lb||'—':'';};
const _rDriver=f=>{const id=_rL(f['Driver']);return id?RAMP.drivers.find(d=>d.id===id)?.lb||'—':'';};

function _rCatBadge(f) {
  const cat = f['Ramp Category']||'';
  const vs = f['Is Veroia Switch'];
  if (cat==='Vermion Fresh') return '<span class="vs-badge vf">VF</span>';
  if (cat==='VS + Groupage'||vs) return '<span class="vs-badge vsg">VS+G</span>';
  if (cat==='VS Simple') return '<span class="vs-badge vs">VS</span>';
  if (vs) return '<span class="vs-badge vs">VS</span>';
  return '';
}

/* ── DRAW ─────────────────────────────────────────────────────── */
function _rampDraw() {
  const today=new Date().toISOString().split('T')[0];
  const tmrw=new Date(Date.now()+864e5).toISOString().split('T')[0];
  const fD=d=>{try{const p=d.split('-');return `${p[2]}/${p[1]}/${p[0]}`;}catch{return d;}};

  const inbound = RAMP.records.filter(r=>r.fields['Type']==='Παραλαβή');
  const outbound = RAMP.records.filter(r=>r.fields['Type']==='Φόρτωση');

  const inPal = inbound.reduce((s,r)=>s+(r.fields['Pallets']||0),0);
  const outPal = outbound.reduce((s,r)=>s+(r.fields['Pallets']||0),0);
  const netPal = inPal - outPal;
  const stockPal = RAMP.stock.reduce((s,r)=>s+(r.fields['Pallets']||0),0);

  // Stock breakdown by client
  const stockByClient = {};
  RAMP.stock.forEach(r=>{
    const cl = r.fields['Supplier/Client']||'Unknown';
    if(!stockByClient[cl]) stockByClient[cl]={pallets:0,items:[]};
    stockByClient[cl].pallets += (r.fields['Pallets']||0);
    stockByClient[cl].items.push(r);
  });

  // Time select helper
  const timeOpts = (()=>{const h=[];for(let i=0;i<24;i++)for(let m=0;m<60;m+=30){const t=String(i).padStart(2,'0')+':'+String(m).padStart(2,'0');h.push(t);}return h;})();

  document.getElementById('content').innerHTML = `
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
      <button class="ramp-day-btn ${RAMP.date===today?'active':''}" onclick="_rampSetDate('${today}')">Today</button>
      <button class="ramp-day-btn ${RAMP.date===tmrw?'active':''}" onclick="_rampSetDate('${tmrw}')">Tomorrow</button>
      <input type="date" class="ramp-date-inp" value="${RAMP.date}" onchange="_rampSetDate(this.value)">
    </div>

    <div class="ramp-kpis">
      <div class="ramp-kpi" style="border-left-color:#059669"><div class="ramp-kpi-lbl">Inbound Today</div>
        <div><span class="ramp-kpi-val" style="color:#059669">+${inPal}</span><span class="ramp-kpi-sub">pal</span></div></div>
      <div class="ramp-kpi" style="border-left-color:#0EA5E9"><div class="ramp-kpi-lbl">Outbound Today</div>
        <div><span class="ramp-kpi-val" style="color:#0EA5E9">-${outPal}</span><span class="ramp-kpi-sub">pal</span></div></div>
      <div class="ramp-kpi" style="border-left-color:${netPal>=0?'var(--success)':'var(--danger)'}"><div class="ramp-kpi-lbl">Net Today</div>
        <div><span class="ramp-kpi-val" style="color:${netPal>=0?'var(--success)':'var(--danger)'}">${netPal>=0?'+':''}${netPal}</span><span class="ramp-kpi-sub">pal</span></div></div>
      <div class="ramp-kpi" style="border-left-color:#D97706"><div class="ramp-kpi-lbl">Stock Total</div>
        <div><span class="ramp-kpi-val" style="color:#D97706">${stockPal}</span><span class="ramp-kpi-sub">pal</span></div></div>
    </div>

    <div class="ramp-sections">
      ${_rampSec('inbound','↓ Inbound — Παραλαβές',inbound,timeOpts)}
      ${_rampSec('outbound','↑ Outbound — Φορτώσεις',outbound,timeOpts)}
      ${_rampStockSec(stockByClient,stockPal)}
    </div>
  `;
}

/* ── SECTION TABLE ────────────────────────────────────────────── */
function _rampSec(type,label,items,timeOpts) {
  const isIn = type==='inbound';
  const cols = isIn
    ? '<th>#</th><th>Time</th><th>Client</th><th>Goods</th><th>Truck</th><th>Driver</th><th>Pallets</th><th class="c">Temp</th><th class="c">Counted</th><th>Category</th><th>Actions</th>'
    : '<th>#</th><th>Time</th><th>Client</th><th>Goods</th><th>Truck</th><th>Driver</th><th>Pallets</th><th class="c">Staged</th><th class="c">Temp</th><th>Category</th><th>Actions</th>';

  const rows = items.length
    ? items.map((r,i)=>_rampRow(r,i+1,type,timeOpts)).join('')
    : '<tr class="ramp-empty"><td colspan="20">No records</td></tr>';

  return `<div>
    <div class="ramp-sec-hd ${type}"><span>${label}</span><span style="opacity:.5">${items.length}</span></div>
    <table class="ramp-t"><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

/* ── ROW ──────────────────────────────────────────────────────── */
function _rampRow(rec,num,type,timeOpts) {
  const f=rec.fields, id=rec.id, isIn=type==='inbound';
  const status=f['Status']||'Προγραμματισμένο';
  const isDone=status==='✅ Έγινε';
  const truck=_rTruck(f), driver=_rDriver(f);
  const pal=f['Pallets']||'';
  const client=f['Supplier/Client']||'—';
  const goods=(f['Goods']||'').substring(0,40);
  const time=f['Time']||'';

  const chk=(fld,v)=>`<input type="checkbox" ${v?'checked':''} onchange="_rampTog('${id}','${fld}',this.checked)">`;
  const timeSel=`<select class="tinp" onchange="_rampSvF('${id}','Time',this.value)"><option value="">--:--</option>${timeOpts.map(t=>`<option value="${t}"${time===t?' selected':''}>${t}</option>`).join('')}</select>`;

  let checks='';
  if(isIn) {
    checks=`<td class="c">${chk('Temp Checked',f['Temp Checked'])}</td><td class="c">${chk('Pallets Counted',f['Pallets Counted'])}</td>`;
  } else {
    checks=`<td class="c">${chk('Goods Staged',f['Goods Staged'])}</td><td class="c">${chk('Temp Set',f['Temp Set'])}</td>`;
  }

  const actLabel = isIn ? 'Done' : 'Loaded';
  const acts = isDone ? '' : `<button class="abtn abtn-ok" onclick="_rampDone('${id}','${isIn}')">${actLabel}</button> <button class="abtn abtn-pp" onclick="_rampPostpone('${id}')">Postponed</button>`;

  return `<tr class="${isDone?'done':''}">
    <td class="rn">${num}</td>
    <td>${timeSel}</td>
    <td class="trn" title="${client}">${client}</td>
    <td class="trn" title="${goods}">${goods}</td>
    <td>${truck||'—'}</td><td>${driver||'—'}</td>
    <td>${pal}</td>
    ${checks}
    <td>${_rCatBadge(f)}</td>
    <td>${acts}</td>
  </tr>`;
}

/* ── STOCK SECTION ────────────────────────────────────────────── */
function _rampStockSec(byClient,totalPal) {
  const clients = Object.keys(byClient).sort();
  const rows = clients.length ? clients.map((cl,i) => {
    const data = byClient[cl];
    // Oldest item date
    const dates = data.items.map(r=>r.fields['Plan Date']).filter(Boolean).sort();
    const oldest = dates[0]||'';
    const daysInStock = oldest ? Math.floor((Date.now()-new Date(oldest).getTime())/864e5) : 0;
    const daysCls = daysInStock<=1?'fresh':daysInStock<=3?'aging':'old';

    return `<tr>
      <td class="rn">${i+1}</td>
      <td class="stock-client">${cl}</td>
      <td>${data.pallets}</td>
      <td>${oldest?oldest.substring(5):''}</td>
      <td class="stock-days ${daysCls}">${daysInStock}d</td>
    </tr>`;
  }).join('') : '<tr class="ramp-empty"><td colspan="5">No stock — warehouse empty</td></tr>';

  return `<div>
    <div class="ramp-sec-hd stock"><span>📦 Stock — In Warehouse</span><span style="opacity:.5">${totalPal} pal</span></div>
    <table class="ramp-t"><thead><tr>
      <th>#</th><th>Client</th><th>Pallets</th><th>Received</th><th>Days</th>
    </tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

/* ── ACTIONS ──────────────────────────────────────────────────── */
function _rampSetDate(d) { RAMP.date=d; renderDailyRamp(); }

async function _rampTog(id,fld,v) {
  try { await atPatch(TABLES.RAMP,id,{[fld]:v}); const r=RAMP.records.find(x=>x.id===id);
    if(r)r.fields[fld]=v; toast(v?'✓':'—'); } catch(e){toast('Error','danger');}
}
async function _rampSvF(id,fld,v) {
  try { await atPatch(TABLES.RAMP,id,{[fld]:v||null}); const r=RAMP.records.find(x=>x.id===id);
    if(r)r.fields[fld]=v; } catch(e){toast('Error','danger');}
}
async function _rampDone(id,isIn) {
  const fields = {'Status':'✅ Έγινε'};
  if(isIn==='true') fields['Stock Status']='In Stock';
  try { await atPatch(TABLES.RAMP,id,fields); invalidateCache(TABLES.RAMP);
    toast('Done ✓'); renderDailyRamp(); } catch(e){toast('Error','danger');}
}
async function _rampPostpone(id) {
  const tmrw=new Date(Date.now()+864e5).toISOString().split('T')[0];
  try { await atPatch(TABLES.RAMP,id,{'Status':'⏩ Postponed','Postponed To':tmrw});
    invalidateCache(TABLES.RAMP); toast('Postponed → tomorrow'); renderDailyRamp();
  } catch(e){toast('Error','danger');}
}

function _rampAddNew(type) {
  const truckOpts=RAMP.trucks.map(t=>`<option value="${t.id}">${t.lb}</option>`).join('');
  const driverOpts=RAMP.drivers.map(d=>`<option value="${d.id}">${d.lb}</option>`).join('');
  const catOpts=['Vermion Fresh','VS Simple','VS + Groupage','Other'].map(c=>`<option value="${c}">${c}</option>`).join('');

  openModal(`New ${type==='Παραλαβή'?'Inbound':'Outbound'}`, `
    <div class="form-grid">
      <div class="form-field"><label class="form-label">Time</label>
        <input class="form-input" id="nr_time" type="text" placeholder="08:00" style="max-width:100px"></div>
      <div class="form-field"><label class="form-label">Category</label>
        <select class="form-select" id="nr_cat">${catOpts}</select></div>
      <div class="form-field"><label class="form-label">Truck</label>
        <select class="form-select" id="nr_truck"><option value="">—</option>${truckOpts}</select></div>
      <div class="form-field"><label class="form-label">Driver</label>
        <select class="form-select" id="nr_driver"><option value="">—</option>${driverOpts}</select></div>
      <div class="form-field"><label class="form-label">Pallets</label>
        <input class="form-input" id="nr_pal" type="number" min="0"></div>
      <div class="form-field"><label class="form-label">Client</label>
        <input class="form-input" id="nr_client" type="text"></div>
      <div class="form-field span-2"><label class="form-label">Goods</label>
        <input class="form-input" id="nr_goods" type="text" placeholder="e.g. Fresh produce"></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="_rampSaveNew('${type}')">Save</button>`
  );
}

async function _rampSaveNew(type) {
  const fields = {
    'Plan Date': RAMP.date,
    'Type': type,
    'Status': 'Προγραμματισμένο',
  };
  const time=document.getElementById('nr_time')?.value.trim();
  const cat=document.getElementById('nr_cat')?.value;
  const truckId=document.getElementById('nr_truck')?.value;
  const driverId=document.getElementById('nr_driver')?.value;
  const pal=document.getElementById('nr_pal')?.value;
  const client=document.getElementById('nr_client')?.value.trim();
  const goods=document.getElementById('nr_goods')?.value.trim();

  if(time)    fields['Time']=time;
  if(cat)     fields['Ramp Category']=cat;
  if(pal)     fields['Pallets']=parseFloat(pal);
  if(goods)   fields['Goods']=goods;
  if(client)  fields['Supplier/Client']=client;
  if(truckId) fields['Truck']=[truckId];
  if(driverId)fields['Driver']=[driverId];
  if(cat&&cat.includes('VS')) fields['Is Veroia Switch']=true;

  try {
    const res=await atCreate(TABLES.RAMP,fields);
    if(res?.error) throw new Error(res.error.message);
    invalidateCache(TABLES.RAMP);
    closeModal(); toast('Added ✓'); renderDailyRamp();
  } catch(e){toast('Error: '+e.message,'danger');}
}
