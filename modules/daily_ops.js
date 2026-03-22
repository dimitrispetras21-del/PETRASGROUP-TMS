// ═══════════════════════════════════════════════════════════════
// DAILY OPS PLAN — v3.1
// Table-based spreadsheet layout — International ORDERS only
// Stacked: Export Load → Export Deliver → Import Load → Import Deliver
// ═══════════════════════════════════════════════════════════════

'use strict';

const OPS = { date:'today', intl:[], trucks:[], drivers:[], locs:[], clients:[], overdue:[] };

const OPS_FIELDS = [
  'Direction','Goods','Temperature °C','Total Pallets','Client',
  'Loading DateTime','Delivery DateTime','Status',
  'Loading Location 1','Unloading Location 1',
  'Ops Status','Delivery Performance','Ops Notes','Postponed To',
  'Actual Delivery Date','ETA','CMR Photo Received','Client Notified',
  'Docs Ready','Temp OK','Driver Notified','Advance Paid','Second Card',
  'Truck','Trailer','Driver','Is Partner Trip','Partner',
];

/* ── CSS — follows Petras Group TMS design system ─────────────── */
(function(){
  if (document.getElementById('ops-css')) return;
  const s = document.createElement('style'); s.id = 'ops-css';
  s.textContent = `
/* day toggle */
.ops-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
.ops-day-btn { padding:7px 18px; font-size:11px; font-weight:700; border-radius:7px;
  border:1px solid var(--border-mid); background:var(--bg); color:var(--text-mid);
  cursor:pointer; letter-spacing:.5px; text-transform:uppercase; font-family:'Syne',sans-serif;
  transition:all .15s; }
.ops-day-btn:hover { background:var(--bg-hover); }
.ops-day-btn.active { background:var(--navy-mid); color:#fff; border-color:var(--navy-mid); }

/* KPI cards — matches project .kpi-card style */
.ops-kpis { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
.ops-kpi { background:var(--bg-card); border:1px solid var(--border); border-left:3px solid var(--accent);
  border-radius:10px; padding:14px 18px; flex:1; min-width:130px; }
.ops-kpi-label { font-size:11px; font-weight:500; letter-spacing:.3px;
  color:var(--text-dim); margin-bottom:8px; }
.ops-kpi-row { display:flex; align-items:baseline; gap:5px; }
.ops-kpi-val { font-family:'Syne',sans-serif; font-size:30px; font-weight:700;
  letter-spacing:-1px; line-height:1; }
.ops-kpi-sub { font-size:12px; color:var(--text-dim); }
.ops-kpi-bar { height:3px; background:var(--border); border-radius:2px; margin-top:8px; overflow:hidden; }
.ops-kpi-fill { height:100%; border-radius:2px; transition:width .3s; }

/* overdue alert */
.ops-alert { background:var(--danger-bg); border:1px solid rgba(220,38,38,0.18);
  border-radius:10px; padding:10px 14px; margin-bottom:14px; }
.ops-alert-hdr { display:flex; align-items:center; cursor:pointer; }
.ops-alert-txt { font-size:12px; font-weight:600; color:var(--danger); flex:1; }
.ops-alert-tog { font-size:10px; color:var(--danger); opacity:.5; }
.ops-alert-list { display:none; flex-direction:column; gap:3px; margin-top:8px;
  max-height:200px; overflow-y:auto; }
.ops-alert-row { display:flex; align-items:center; gap:8px; padding:5px 8px;
  border-radius:6px; background:rgba(220,38,38,0.04); font-size:10.5px; }
.ops-alert-info { flex:1; min-width:0; font-weight:600; color:var(--text); }
.ops-alert-dt { font-size:9px; color:var(--text-dim); margin-left:6px; font-weight:400; }
.ops-alert-btn { font-size:9px; font-weight:600; padding:3px 10px; border-radius:6px;
  border:1px solid; background:none; cursor:pointer; transition:all .15s; }
.ops-alert-btn:hover { opacity:.7; }
.ops-alert-btn.ok { color:var(--success); border-color:rgba(5,150,105,0.25); }
.ops-alert-btn.no { color:var(--danger); border-color:rgba(220,38,38,0.25); }

/* section blocks — stacked */
.ops-sections { display:flex; flex-direction:column; gap:16px; }
.ops-sec-hd {
  padding:8px 14px; border-radius:10px 10px 0 0;
  font-family:'Syne',sans-serif; font-size:10px; font-weight:800;
  letter-spacing:1.5px; text-transform:uppercase;
  display:flex; justify-content:space-between; align-items:center;
}
.ops-sec-hd.el { background:#065F46; color:#ECFDF5; }
.ops-sec-hd.ed { background:#1E3A8A; color:#EFF6FF; }
.ops-sec-hd.il { background:#7C3AED; color:#F5F3FF; }
.ops-sec-hd.id { background:#9D174D; color:#FDF2F8; }

/* table — uses global thead/tbody styles from style.css */
.ops-t { width:100%; border-collapse:collapse; background:var(--bg-card);
  border:1px solid var(--border); border-top:none; border-radius:0 0 10px 10px;
  overflow:hidden; }
.ops-t thead th { padding:9px 14px; font-size:10px; font-weight:600;
  letter-spacing:1px; text-transform:uppercase; color:var(--text-dim);
  text-align:left; border-bottom:1px solid var(--border); white-space:nowrap;
  background:#F0F5FA; }
.ops-t thead th.c { text-align:center; }
.ops-t tbody td { padding:10px 14px; font-size:13px; border-bottom:1px solid var(--border);
  vertical-align:middle; }
.ops-t tbody tr:last-child td { border-bottom:none; }
.ops-t tbody tr:hover td { background:var(--bg-hover); }
.ops-t tbody tr.done td { opacity:.4; }
.ops-t .c { text-align:center; }
.ops-t .trn { max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ops-t .trn-s { max-width:120px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ops-t .rn { font-family:'Syne',sans-serif; font-weight:700; color:var(--text-dim); font-size:11px; }
.ops-t input[type=checkbox] { width:15px; height:15px; cursor:pointer; accent-color:var(--success); }
.ops-t select.tinp { padding:4px 6px; font-size:11px; border:1px solid var(--border-mid);
  border-radius:6px; background:var(--bg-card); color:var(--text); outline:none;
  font-family:'DM Sans',sans-serif; cursor:pointer; }
.ops-t select.tinp:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-glow); }
.ops-t input.tinp { padding:4px 8px; font-size:11px; border:1px solid var(--border-mid);
  border-radius:6px; background:var(--bg-card); color:var(--text); outline:none;
  font-family:'DM Sans',sans-serif; width:60px; }
.ops-t input.tinp:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-glow); }

/* action buttons — match project btn style */
.ops-t .abtn { font-size:11px; font-weight:500; letter-spacing:.2px; padding:4px 10px;
  border-radius:6px; border:1px solid var(--border-mid); background:none;
  cursor:pointer; white-space:nowrap; transition:all .15s; }
.ops-t .abtn:hover { background:var(--bg-hover); }
.ops-t .abtn-ld { border-color:rgba(6,182,212,0.3); color:#0891B2; }
.ops-t .abtn-dv { border-color:rgba(5,150,105,0.3); color:var(--success); }
.ops-t .abtn-dy { border-color:rgba(220,38,38,0.3); color:var(--danger); }
.ops-t .abtn-pp { border-color:rgba(217,119,6,0.3); color:var(--warning); }
.ops-empty td { text-align:center; color:var(--text-dim); font-style:italic; padding:20px !important; }
`;
  document.head.appendChild(s);
})();

/* ── ENTRY ────────────────────────────────────────────────────── */
async function renderDailyOps() {
  document.getElementById('topbarTitle').textContent = 'Daily Ops Plan';
  document.getElementById('content').innerHTML = showLoading('Φόρτωση…');
  try { await _opsLoad(); _opsDraw(); }
  catch(e) { document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Σφάλμα: ${e.message}</div>`; console.error(e); }
}

async function _opsLoad() {
  if (!OPS.trucks.length) {
    const [t,d,l,cl] = await Promise.all([
      atGetAll(TABLES.TRUCKS,{fields:['License Plate'],filterByFormula:'{Active}=TRUE()'},false),
      atGetAll(TABLES.DRIVERS,{fields:['Full Name'],filterByFormula:'{Active}=TRUE()'},false),
      atGetAll(TABLES.LOCATIONS,{fields:['Name','City','Country']},true),
      atGetAll(TABLES.CLIENTS,{fields:['Company Name']},true),
    ]);
    OPS.trucks=t.map(r=>({id:r.id,lb:r.fields['License Plate']||''}));
    OPS.drivers=d.map(r=>({id:r.id,lb:r.fields['Full Name']||''}));
    OPS.locs=l; OPS.clients=cl;
  }
  const today=new Date().toISOString().split('T')[0];
  const tmrw=new Date(Date.now()+864e5).toISOString().split('T')[0];
  const tgt=OPS.date==='tomorrow'?tmrw:today;
  const dayF=`OR(IS_SAME({Loading DateTime},'${tgt}','day'),IS_SAME({Delivery DateTime},'${tgt}','day'))`;
  const ovF=`AND(IS_BEFORE({Delivery DateTime},TODAY()),OR({Ops Status}='In Transit',{Ops Status}='Loaded',{Ops Status}='Assigned',{Ops Status}='Pending',{Ops Status}=''))`;
  const [intl,ov] = await Promise.all([
    atGetAll(TABLES.ORDERS,{filterByFormula:dayF,fields:OPS_FIELDS},false),
    OPS.date==='today'?atGetAll(TABLES.ORDERS,{filterByFormula:ovF,fields:OPS_FIELDS},false):[],
  ]);
  OPS.intl=intl;
  const ids=new Set(intl.map(r=>r.id));
  OPS.overdue=ov.filter(r=>!ids.has(r.id));
}

/* ── HELPERS ──────────────────────────────────────────────────── */
const _L=id=>{if(!id)return'—';const l=OPS.locs.find(r=>r.id===id);return l?(l.fields['Name']||l.fields['City']||'—'):'—';};
const _C=f=>{const raw=f['Client'];const id=Array.isArray(raw)?raw[0]:raw;if(!id)return'—';const c=OPS.clients.find(r=>r.id===id);return c?(c.fields['Company Name']||'—'):String(id).substring(0,12);};
const _K=a=>a?.length?(a[0]?.id||a[0]||null):null;
const _T=f=>{const id=_K(f['Truck']);return id?OPS.trucks.find(t=>t.id===id)?.lb||'—':'';}
const _D=f=>{const id=_K(f['Driver']);return id?OPS.drivers.find(d=>d.id===id)?.lb||'—':'';}
const _DM=(dt,d)=>dt?dt.substring(0,10)===d:false;
const _P=f=>f['Is Partner Trip']===true||f['Is Partner Trip']==='Yes';

function _opsCats() {
  const today=new Date().toISOString().split('T')[0];
  const tmrw=new Date(Date.now()+864e5).toISOString().split('T')[0];
  const tgt=OPS.date==='tomorrow'?tmrw:today;
  const c={el:[],ed:[],il:[],id:[]};
  for (const r of OPS.intl) {
    const dir=(r.fields['Direction']||'').trim().toLowerCase();
    const isImp=dir==='import'||dir==='↓ import';
    const isL=_DM(r.fields['Loading DateTime'],tgt);
    const isD=_DM(r.fields['Delivery DateTime'],tgt);
    if(isImp){if(isL)c.il.push(r);if(isD)c.id.push(r);}
    else     {if(isL)c.el.push(r);if(isD)c.ed.push(r);}
  }
  return c;
}

/* ── DRAW ─────────────────────────────────────────────────────── */
function _opsDraw() {
  const today=new Date().toISOString().split('T')[0];
  const tmrw=new Date(Date.now()+864e5).toISOString().split('T')[0];
  const isToday=OPS.date==='today';
  const tgt=isToday?today:tmrw;
  const fD=d=>{try{const dt=new Date(d);
    const ds=['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
    const ms=['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
    return `${ds[dt.getDay()]} ${dt.getDate()} ${ms[dt.getMonth()]}`;} catch{return d;}};

  const cats=_opsCats();
  const all=[...cats.el,...cats.ed,...cats.il,...cats.id];
  const total=all.length;
  const nDel=all.filter(r=>['Delivered','Client Notified'].includes(r.fields['Ops Status']||'')).length;
  const nLoad=all.filter(r=>r.fields['Ops Status']==='Loaded').length;
  const nPend=total-nDel-nLoad;
  const chkF=['Docs Ready','Temp OK','CMR Photo Received','Client Notified','Driver Notified'];
  let tC=0,dC=0;all.forEach(r=>chkF.forEach(f=>{if(r.fields[f]!==undefined){tC++;if(r.fields[f])dC++;}}));

  // Overdue
  let ovH='';
  if(isToday&&OPS.overdue.length){
    ovH=`<div class="ops-alert">
      <div class="ops-alert-hdr" onclick="const l=document.getElementById('ovL');l.style.display=l.style.display==='flex'?'none':'flex';this.querySelector('.ops-alert-tog').textContent=l.style.display==='flex'?'▲ Hide':'▼ Show'">
        <div class="ops-alert-txt">⚠ ${OPS.overdue.length} orders with pending delivery</div>
        <div class="ops-alert-tog">▼ Show</div>
      </div>
      <div class="ops-alert-list" id="ovL">${OPS.overdue.map(r=>{const f=r.fields;
        return `<div class="ops-alert-row">
          <span class="ops-alert-info">${_L(_K(f['Loading Location 1']))} → ${_L(_K(f['Unloading Location 1']))}<span class="ops-alert-dt">${(f['Delivery DateTime']||'').substring(0,10)}</span></span>
          <button class="ops-alert-btn ok" onclick="event.stopPropagation();_opsOvAct('${r.id}')">Delivered</button>
          <button class="ops-alert-btn no" onclick="event.stopPropagation();_opsOvAct('${r.id}','Delayed')">Delayed</button>
        </div>`;}).join('')}</div></div>`;
  }

  document.getElementById('content').innerHTML=`
    <div class="page-header" style="margin-bottom:12px">
      <div><div class="page-title">Daily Ops Plan</div>
        <div class="page-sub">${fD(tgt)} · ${total} orders</div></div>
      <button class="btn btn-ghost" onclick="renderDailyOps()">Refresh</button>
    </div>
    <div class="ops-toolbar">
      <button class="ops-day-btn ${isToday?'active':''}" onclick="OPS.date='today';renderDailyOps()">Today</button>
      <button class="ops-day-btn ${!isToday?'active':''}" onclick="OPS.date='tomorrow';renderDailyOps()">Tomorrow</button>
    </div>
    <div class="ops-kpis">
      <div class="ops-kpi"><div class="ops-kpi-label">Pending</div>
        <div class="ops-kpi-row"><span class="ops-kpi-val" style="color:var(--text)">${nPend}</span></div></div>
      <div class="ops-kpi"><div class="ops-kpi-label">Loaded</div>
        <div class="ops-kpi-row"><span class="ops-kpi-val" style="color:#0891B2">${nLoad}</span></div></div>
      <div class="ops-kpi" style="border-left-color:var(--success)"><div class="ops-kpi-label">Delivered</div>
        <div class="ops-kpi-row"><span class="ops-kpi-val" style="color:var(--success)">${nDel}</span><span class="ops-kpi-sub">/ ${total}</span></div>
        <div class="ops-kpi-bar"><div class="ops-kpi-fill" style="width:${total?Math.round(nDel/total*100):0}%;background:var(--success)"></div></div></div>
      <div class="ops-kpi"><div class="ops-kpi-label">Checklist</div>
        <div class="ops-kpi-row"><span class="ops-kpi-val" style="color:var(--success)">${dC}</span><span class="ops-kpi-sub">/ ${tC}</span></div>
        <div class="ops-kpi-bar"><div class="ops-kpi-fill" style="width:${tC?Math.round(dC/tC*100):0}%;background:var(--success)"></div></div></div>
    </div>
    ${ovH}
    <div class="ops-sections">
      ${_opsSec('el','↑ Export Loadings',cats.el,isToday)}
      ${_opsSec('ed','↓ Export Deliveries',cats.ed,isToday)}
      ${_opsSec('il','↑ Import Loadings',cats.il,isToday)}
      ${_opsSec('id','↓ Import Deliveries',cats.id,isToday)}
    </div>`;
}

/* ── SECTION ──────────────────────────────────────────────────── */
function _opsSec(type,label,items,isToday) {
  const isL=type==='el'||type==='il', isExp=type==='el'||type==='ed';
  let cols='';
  if(isToday && isL && isExp)
    cols='<th>#</th><th>Client</th><th>Loading</th><th>Truck</th><th>Driver</th><th class="c">Temp</th><th>Pallets</th><th class="c">Docs</th><th>Advance €</th><th class="c">2nd Card</th><th>Actions</th>';
  else if(isToday && isL && !isExp)
    cols='<th>#</th><th>Client</th><th>Loading</th><th>Truck</th><th>Driver</th><th class="c">CMR Photo</th><th class="c">Temp</th><th>Time</th><th>Actions</th>';
  else if(isToday && !isL)
    cols='<th>#</th><th>Client</th><th>Delivery</th><th>Truck</th><th>Driver</th><th>ETA</th><th class="c">CMR Photo</th><th class="c">Client Update</th><th>Actions</th>';
  else if(!isToday && isL && isExp)
    cols='<th>#</th><th>Client</th><th>Loading</th><th>Truck</th><th>Driver</th><th class="c">Driver Notified</th>';
  else if(!isToday && isL && !isExp)
    cols='<th>#</th><th>Client</th><th>Loading</th><th>Truck</th><th>Driver</th><th class="c">Driver Notified</th><th>Time</th>';
  else
    cols='<th>#</th><th>Client</th><th>Delivery</th><th>Truck</th><th>Driver</th><th>ETA</th>';

  const rows=items.length
    ? items.map((r,i)=>_opsRow(r,i+1,type,isToday)).join('')
    : '<tr class="ops-empty"><td colspan="20">No orders</td></tr>';

  return `<div>
    <div class="ops-sec-hd ${type}"><span>${label}</span><span style="opacity:.5">${items.length}</span></div>
    <table class="ops-t"><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

/* ── ROW ──────────────────────────────────────────────────────── */
function _opsRow(rec,num,type,isToday) {
  const f=rec.fields, id=rec.id;
  const client=_C(f);
  const loadL=_L(_K(f['Loading Location 1']));
  const delivL=_L(_K(f['Unloading Location 1']));
  const truck=_T(f), driver=_D(f), partner=_P(f);
  const pal=f['Total Pallets']||'';
  const ops=f['Ops Status']||'';
  const isDone=ops==='Delivered'||ops==='Client Notified';
  const isL=type==='el'||type==='il', isExp=type==='el'||type==='ed';

  const chk=(fld,v)=>`<input type="checkbox" ${v?'checked':''} onchange="_opsTog('${id}','${fld}',this.checked)">`;
  const timeSelect=(fld,v)=>{
    const hrs=[];for(let h=0;h<24;h++)for(let m=0;m<60;m+=30){const t=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');hrs.push(t);}
    return `<select class="tinp" onchange="_opsSvF('${id}','${fld}',this.value)"><option value="">--:--</option>${hrs.map(t=>`<option value="${t}"${v===t?' selected':''}>${t}</option>`).join('')}</select>`;
  };
  const amtInp=(fld,v)=>`<input class="tinp" type="number" step="1" value="${v||''}" placeholder="0" style="width:60px" onblur="_opsSvF('${id}','${fld}',parseFloat(this.value)||null)">`;

  let cells='';
  if(isToday && isL && isExp) {
    cells=`<td class="rn">${num}</td>
      <td class="trn" title="${client}">${client}</td>
      <td class="trn" title="${loadL}">${loadL}</td>
      <td class="trn-s">${truck||'—'}</td><td class="trn-s">${driver||'—'}</td>
      <td class="c">${chk('Temp OK',f['Temp OK'])}</td>
      <td>${pal}</td>
      <td class="c">${chk('Docs Ready',f['Docs Ready'])}</td>
      <td>${!partner?amtInp('Advance Paid',f['Advance Paid']):''}</td>
      <td class="c">${!partner?chk('Second Card',f['Second Card']):''}</td>
      <td><button class="abtn abtn-ld" onclick="_opsStat('${id}','Loaded')">Loaded</button> <button class="abtn abtn-pp" onclick="_opsPost('${id}')">Postponed</button></td>`;
  } else if(isToday && isL && !isExp) {
    cells=`<td class="rn">${num}</td>
      <td class="trn" title="${client}">${client}</td>
      <td class="trn" title="${loadL}">${loadL}</td>
      <td class="trn-s">${truck||'—'}</td><td class="trn-s">${driver||'—'}</td>
      <td class="c">${chk('CMR Photo Received',f['CMR Photo Received'])}</td>
      <td class="c">${chk('Temp OK',f['Temp OK'])}</td>
      <td>${timeSelect('ETA',f['ETA'])}</td>
      <td><button class="abtn abtn-ld" onclick="_opsStat('${id}','Loaded')">Loaded</button> <button class="abtn abtn-pp" onclick="_opsPost('${id}')">Postponed</button></td>`;
  } else if(isToday && !isL) {
    cells=`<td class="rn">${num}</td>
      <td class="trn" title="${client}">${client}</td>
      <td class="trn" title="${delivL}">${delivL}</td>
      <td class="trn-s">${truck||'—'}</td><td class="trn-s">${driver||'—'}</td>
      <td>${timeSelect('ETA',f['ETA'])}</td>
      <td class="c">${chk('CMR Photo Received',f['CMR Photo Received'])}</td>
      <td class="c">${chk('Client Notified',f['Client Notified'])}</td>
      <td><button class="abtn abtn-dv" onclick="_opsDel('${id}','On Time')">Delivered</button> <button class="abtn abtn-dy" onclick="_opsDel('${id}','Delayed')">Delayed</button> <button class="abtn abtn-pp" onclick="_opsPost('${id}')">Postponed</button></td>`;
  } else if(!isToday && isL && isExp) {
    cells=`<td class="rn">${num}</td>
      <td class="trn" title="${client}">${client}</td>
      <td class="trn" title="${loadL}">${loadL}</td>
      <td class="trn-s">${truck||'—'}</td><td class="trn-s">${driver||'—'}</td>
      <td class="c">${chk('Driver Notified',f['Driver Notified'])}</td>`;
  } else if(!isToday && isL && !isExp) {
    cells=`<td class="rn">${num}</td>
      <td class="trn" title="${client}">${client}</td>
      <td class="trn" title="${loadL}">${loadL}</td>
      <td class="trn-s">${truck||'—'}</td><td class="trn-s">${driver||'—'}</td>
      <td class="c">${chk('Driver Notified',f['Driver Notified'])}</td>
      <td>${timeSelect('ETA',f['ETA'])}</td>`;
  } else {
    cells=`<td class="rn">${num}</td>
      <td class="trn" title="${client}">${client}</td>
      <td class="trn" title="${delivL}">${delivL}</td>
      <td class="trn-s">${truck||'—'}</td><td class="trn-s">${driver||'—'}</td>
      <td>${timeSelect('ETA',f['ETA'])}</td>`;
  }
  return `<tr class="${isDone?'done':''}">${cells}</tr>`;
}

/* ── ACTIONS ──────────────────────────────────────────────────── */
async function _opsTog(id,fld,v){try{await atPatch(TABLES.ORDERS,id,{[fld]:v});const r=OPS.intl.find(x=>x.id===id);if(r)r.fields[fld]=v;toast(v?'✓':'—');}catch(e){toast('Error','danger');}}
async function _opsSvF(id,fld,v){try{await atPatch(TABLES.ORDERS,id,{[fld]:v||null});const r=OPS.intl.find(x=>x.id===id);if(r)r.fields[fld]=v;}catch(e){toast('Error','danger');}}
async function _opsStat(id,st){try{await atPatch(TABLES.ORDERS,id,{'Ops Status':st});const r=OPS.intl.find(x=>x.id===id);if(r)r.fields['Ops Status']=st;toast(st+' ✓');_opsDraw();}catch(e){toast('Error','danger');}}
async function _opsDel(id,perf){const d=new Date().toISOString().split('T')[0];
  try{await atPatch(TABLES.ORDERS,id,{'Ops Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d});
  const r=OPS.intl.find(x=>x.id===id);if(r){r.fields['Ops Status']='Delivered';r.fields['Delivery Performance']=perf;}
  toast(perf==='On Time'?'✓ Delivered':'✗ Delayed',perf==='Delayed'?'danger':'success');_opsDraw();}catch(e){toast('Error','danger');}}
async function _opsPost(id){const nd=prompt('New delivery date (YYYY-MM-DD):');if(!nd||!/\d{4}-\d{2}-\d{2}/.test(nd))return;
  try{await atPatch(TABLES.ORDERS,id,{'Ops Status':'Postponed','Postponed To':nd});
  const r=OPS.intl.find(x=>x.id===id);if(r)r.fields['Ops Status']='Postponed';
  toast('Postponed → '+nd);_opsDraw();}catch(e){toast('Error','danger');}}
async function _opsOvAct(id,perf='Delayed'){const d=new Date().toISOString().split('T')[0];
  try{await atPatch(TABLES.ORDERS,id,{'Ops Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d});
  OPS.overdue=OPS.overdue.filter(r=>r.id!==id);toast('✓');_opsDraw();}catch(e){toast('Error','danger');}}
