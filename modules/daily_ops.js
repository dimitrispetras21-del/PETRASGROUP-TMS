// ═══════════════════════════════════════════════════════════════
// DAILY OPS PLAN — v3.0
// Table-based spreadsheet layout matching PDF template
// Export (Load|Deliver) on top, Import (Load|Deliver) below
// International ORDERS only
// ═══════════════════════════════════════════════════════════════

'use strict';

const OPS = { date:'today', intl:[], trucks:[], drivers:[], locs:[], overdue:[] };

const OPS_FIELDS = [
  'Direction','Goods','Temperature °C','Total Pallets','Client',
  'Loading DateTime','Delivery DateTime','Status',
  'Loading Location 1','Unloading Location 1',
  'Ops Status','Delivery Performance','Ops Notes','Postponed To',
  'Actual Delivery Date','ETA','CMR Photo Received','Client Notified',
  'Docs Ready','Temp OK','Driver Notified','Advance Paid','Second Card',
  'Truck','Trailer','Driver','Is Partner Trip','Partner',
];

/* ── CSS ──────────────────────────────────────────────────────── */
(function(){
  if (document.getElementById('ops-css')) return;
  const s = document.createElement('style'); s.id = 'ops-css';
  s.textContent = `
.ops-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
.ops-day-btn { padding:7px 18px; font-size:11px; font-weight:700; border-radius:5px;
  border:1px solid var(--border-mid); background:var(--bg); color:var(--text-mid);
  cursor:pointer; letter-spacing:.5px; text-transform:uppercase; font-family:'Syne',sans-serif; }
.ops-day-btn.active { background:var(--navy-mid); color:#fff; border-color:var(--navy-mid); }

/* progress */
.ops-prog { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
.ops-pc { background:var(--bg-card); border:1px solid var(--border); border-left:3px solid var(--accent);
  border-radius:8px; padding:12px 16px; flex:1; min-width:120px; }
.ops-pc-lbl { font-size:9px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase;
  color:var(--text-dim); margin-bottom:4px; font-family:'Syne',sans-serif; }
.ops-pc-row { display:flex; align-items:baseline; gap:4px; }
.ops-pc-val { font-family:'Syne',sans-serif; font-size:22px; font-weight:700; letter-spacing:-0.5px; }
.ops-pc-sub { font-size:11px; color:var(--text-dim); }
.ops-pc-bar { height:3px; background:var(--border); border-radius:2px; margin-top:6px; overflow:hidden; }
.ops-pc-fill { height:100%; border-radius:2px; transition:width .3s; }

/* overdue */
.ops-ov { background:rgba(220,38,38,0.06); border:1px solid rgba(220,38,38,0.18);
  border-radius:8px; padding:8px 12px; margin-bottom:14px; }
.ops-ov-hdr { display:flex; align-items:center; cursor:pointer; }
.ops-ov-txt { font-size:11px; font-weight:600; color:#DC2626; flex:1; }
.ops-ov-tog { font-size:9px; color:#DC2626; opacity:.5; }
.ops-ov-list { display:none; flex-direction:column; gap:3px; margin-top:6px; max-height:180px; overflow-y:auto; }
.ops-ov-row { display:flex; align-items:center; gap:6px; padding:4px 6px; border-radius:3px;
  background:rgba(220,38,38,0.04); font-size:9.5px; }
.ops-ov-info { flex:1; min-width:0; font-weight:600; }
.ops-ov-dt { font-size:8px; color:var(--text-dim); margin-left:4px; }
.ops-ovb { font-size:8px; font-weight:700; padding:2px 7px; border-radius:3px;
  border:1px solid; background:none; cursor:pointer; }
.ops-ovb.d { color:#059669; border-color:rgba(5,150,105,0.3); }
.ops-ovb.l { color:#DC2626; border-color:rgba(220,38,38,0.3); }

/* 2-col section grid */
.ops-pair { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:18px; }
@media(max-width:1000px) { .ops-pair { grid-template-columns:1fr; } }

/* section */
.ops-sec { min-width:0; }
.ops-sec-title {
  padding:7px 12px; border-radius:8px 8px 0 0;
  font-size:9px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase;
  font-family:'Syne',sans-serif; display:flex; justify-content:space-between; align-items:center;
}
.ops-sec-title.el { background:#065F46; color:#ECFDF5; }
.ops-sec-title.ed { background:#1E3A8A; color:#EFF6FF; }
.ops-sec-title.il { background:#7C3AED; color:#F5F3FF; }
.ops-sec-title.id { background:#9D174D; color:#FDF2F8; }

/* table */
.ops-tbl { width:100%; border-collapse:collapse; border:1px solid var(--border-mid);
  border-top:none; border-radius:0 0 8px 8px; overflow:hidden; background:var(--bg-card);
  font-size:11px; font-family:'DM Sans',sans-serif; }
.ops-tbl th { background:#F0F5FA; font-size:8.5px; font-weight:700; letter-spacing:.8px;
  text-transform:uppercase; color:var(--text-dim); padding:6px 6px; text-align:left;
  border-bottom:1px solid var(--border-mid); white-space:nowrap; }
.ops-tbl td { padding:5px 6px; border-bottom:1px solid var(--border); vertical-align:middle; }
.ops-tbl tr:last-child td { border-bottom:none; }
.ops-tbl tr:hover td { background:var(--bg-hover); }
.ops-tbl tr.done td { opacity:.45; }
.ops-tbl .c { text-align:center; }
.ops-tbl .trunc { max-width:100px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ops-tbl .trunc-sm { max-width:70px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ops-tbl input[type=checkbox] { margin:0; cursor:pointer; accent-color:#059669; }
.ops-tbl .inp { padding:2px 4px; font-size:10px; border:1px solid var(--border-mid);
  border-radius:3px; background:var(--bg); color:var(--text); width:42px; outline:none;
  font-family:'DM Sans',sans-serif; text-align:center; }
.ops-tbl .inp-amt { width:52px; }
.ops-tbl .ab { font-size:7.5px; font-weight:800; letter-spacing:.3px; padding:3px 6px;
  border-radius:3px; border:1px solid; background:none; cursor:pointer; white-space:nowrap; }
.ops-tbl .ab:hover { opacity:.8; }
.ops-tbl .ab-ld { border-color:rgba(6,182,212,0.3); color:#06B6D4; }
.ops-tbl .ab-dv { border-color:rgba(5,150,105,0.3); color:#059669; }
.ops-tbl .ab-dy { border-color:rgba(220,38,38,0.3); color:#DC2626; }
.ops-tbl .ab-pp { border-color:rgba(217,119,6,0.3); color:#D97706; }
.ops-tbl .rn { font-family:'Syne',sans-serif; font-weight:700; color:var(--text-dim); font-size:10px; }
.ops-empty-row td { text-align:center; color:var(--text-dim); font-style:italic; padding:14px; }
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
  // Assets
  if (!OPS.trucks.length) {
    const [t,d,l] = await Promise.all([
      atGetAll(TABLES.TRUCKS,{fields:['License Plate'],filterByFormula:'{Active}=TRUE()'},false),
      atGetAll(TABLES.DRIVERS,{fields:['Full Name'],filterByFormula:'{Active}=TRUE()'},false),
      atGetAll(TABLES.LOCATIONS,{fields:['Name','City','Country']},true),
    ]);
    OPS.trucks=t.map(r=>({id:r.id,lb:r.fields['License Plate']||''}));
    OPS.drivers=d.map(r=>({id:r.id,lb:r.fields['Full Name']||''}));
    OPS.locs=l;
  }
  // Orders
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
    const isImp = dir==='import' || dir==='↓ import';
    const isL=_DM(r.fields['Loading DateTime'],tgt);
    const isD=_DM(r.fields['Delivery DateTime'],tgt);
    if(isImp) { if(isL)c.il.push(r); if(isD)c.id.push(r); }
    else      { if(isL)c.el.push(r); if(isD)c.ed.push(r); }
  }
  return c;
}

/* ── DRAW ─────────────────────────────────────────────────────── */
function _opsDraw() {
  const today=new Date().toISOString().split('T')[0];
  const tmrw=new Date(Date.now()+864e5).toISOString().split('T')[0];
  const isToday=OPS.date==='today';
  const tgt=isToday?today:tmrw;
  const fD=d=>{try{const dt=new Date(d);const ds=['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
    const ms=['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
    return `${ds[dt.getDay()]} ${dt.getDate()} ${ms[dt.getMonth()]}`;} catch{return d;}};

  const cats=_opsCats();
  const all=[...cats.el,...cats.ed,...cats.il,...cats.id];
  const total=all.length;
  const nDel=all.filter(r=>['Delivered','Client Notified'].includes(r.fields['Ops Status']||'')).length;
  const nLoad=all.filter(r=>r.fields['Ops Status']==='Loaded').length;
  const nPend=total-nDel-nLoad;
  const chkF=['Docs Ready','Temp OK','CMR Photo Received','Client Notified','Driver Notified'];
  let tC=0,dC=0; all.forEach(r=>chkF.forEach(f=>{if(r.fields[f]!==undefined){tC++;if(r.fields[f])dC++;}}));

  // Overdue
  let ovH='';
  if(isToday&&OPS.overdue.length){
    ovH=`<div class="ops-ov">
      <div class="ops-ov-hdr" onclick="const l=document.getElementById('ovL');l.style.display=l.style.display==='flex'?'none':'flex';this.querySelector('.ops-ov-tog').textContent=l.style.display==='flex'?'▲':'▼'">
        <div class="ops-ov-txt">⚠ ${OPS.overdue.length} orders με εκκρεμή παράδοση</div>
        <div class="ops-ov-tog">▼</div>
      </div>
      <div class="ops-ov-list" id="ovL">${OPS.overdue.map(r=>{
        const f=r.fields;
        return `<div class="ops-ov-row">
          <span class="ops-ov-info">${_L(_K(f['Loading Location 1']))} → ${_L(_K(f['Unloading Location 1']))}<span class="ops-ov-dt">${(f['Delivery DateTime']||'').substring(0,10)}</span></span>
          <button class="ops-ovb d" onclick="event.stopPropagation();_opsOvAct('${r.id}')">✓ Del</button>
          <button class="ops-ovb l" onclick="event.stopPropagation();_opsOvAct('${r.id}','Delayed')">✗ Late</button>
        </div>`;
      }).join('')}</div></div>`;
  }

  document.getElementById('content').innerHTML=`
    <div class="page-header" style="margin-bottom:10px">
      <div><div class="page-title">Daily Ops Plan</div>
        <div class="page-sub">${fD(tgt)} · ${total} orders</div></div>
      <button class="btn btn-ghost" onclick="renderDailyOps()">Refresh</button>
    </div>
    <div class="ops-toolbar">
      <button class="ops-day-btn ${isToday?'active':''}" onclick="OPS.date='today';renderDailyOps()">Σήμερα</button>
      <button class="ops-day-btn ${!isToday?'active':''}" onclick="OPS.date='tomorrow';renderDailyOps()">Αύριο</button>
    </div>
    <div class="ops-prog">
      <div class="ops-pc"><div class="ops-pc-lbl">Εκκρεμή</div><div class="ops-pc-row"><span class="ops-pc-val" style="color:var(--text)">${nPend}</span></div></div>
      <div class="ops-pc"><div class="ops-pc-lbl">Loaded</div><div class="ops-pc-row"><span class="ops-pc-val" style="color:#06B6D4">${nLoad}</span></div></div>
      <div class="ops-pc" style="border-left-color:#059669"><div class="ops-pc-lbl">Delivered</div><div class="ops-pc-row"><span class="ops-pc-val" style="color:#059669">${nDel}</span><span class="ops-pc-sub">/ ${total}</span></div>
        <div class="ops-pc-bar"><div class="ops-pc-fill" style="width:${total?Math.round(nDel/total*100):0}%;background:#059669"></div></div></div>
      <div class="ops-pc"><div class="ops-pc-lbl">Checklist</div><div class="ops-pc-row"><span class="ops-pc-val" style="color:#059669">${dC}</span><span class="ops-pc-sub">/ ${tC}</span></div>
        <div class="ops-pc-bar"><div class="ops-pc-fill" style="width:${tC?Math.round(dC/tC*100):0}%;background:#059669"></div></div></div>
    </div>
    ${ovH}
    <div class="ops-pair">
      ${_opsSec('el','↑ EXP Φορτώσεις',cats.el,isToday)}
      ${_opsSec('ed','↓ EXP Παραδόσεις',cats.ed,isToday)}
    </div>
    <div class="ops-pair">
      ${_opsSec('il','↑ IMP Φορτώσεις',cats.il,isToday)}
      ${_opsSec('id','↓ IMP Παραδόσεις',cats.id,isToday)}
    </div>`;
}

/* ── SECTION TABLE ────────────────────────────────────────────── */
function _opsSec(type,label,items,isToday) {
  const isL=type==='el'||type==='il';
  const isExp=type==='el'||type==='ed';

  let cols='';
  if(isToday && isL && isExp) {
    cols='<th>#</th><th>Client</th><th>Loading</th><th>Truck</th><th>Driver</th><th class="c">Temp</th><th>Pal</th><th class="c">Docs</th><th>€</th><th class="c">2η K</th><th></th>';
  } else if(isToday && isL && !isExp) {
    cols='<th>#</th><th>Client</th><th>Loading</th><th>Truck</th><th>Driver</th><th class="c">CMR</th><th class="c">Temp</th><th>Ώρα</th><th></th>';
  } else if(isToday && !isL) {
    cols='<th>#</th><th>Client</th><th>Delivery</th><th>Truck</th><th>Driver</th><th>ETA</th><th class="c">CMR</th><th class="c">Πελ.</th><th></th>';
  } else if(!isToday && isL && isExp) {
    cols='<th>#</th><th>Client</th><th>Loading</th><th>Truck</th><th>Driver</th><th class="c">Ενημ.</th>';
  } else if(!isToday && isL && !isExp) {
    cols='<th>#</th><th>Client</th><th>Loading</th><th>Truck</th><th>Driver</th><th class="c">Ενημ.</th><th>Ώρα</th>';
  } else {
    cols='<th>#</th><th>Client</th><th>Delivery</th><th>Truck</th><th>Driver</th><th>ETA</th>';
  }

  const rows = items.length
    ? items.map((r,i)=>_opsRow(r,i+1,type,isToday)).join('')
    : '<tr class="ops-empty-row"><td colspan="20">Κενό</td></tr>';

  return `<div class="ops-sec">
    <div class="ops-sec-title ${type}"><span>${label}</span><span style="opacity:.5">${items.length}</span></div>
    <table class="ops-tbl"><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

/* ── TABLE ROW ────────────────────────────────────────────────── */
function _opsRow(rec,num,type,isToday) {
  const f=rec.fields, tbl=TABLES.ORDERS;
  const loadL=_L(_K(f['Loading Location 1']));
  const delivL=_L(_K(f['Unloading Location 1']));
  const truck=_T(f), driver=_D(f), partner=_P(f);
  const pal=f['Total Pallets']||'';
  const clientRaw=f['Client'];
  const client=Array.isArray(clientRaw)?(clientRaw[0]||'—'):(clientRaw||'—');
  const ops=f['Ops Status']||'';
  const isDone=ops==='Delivered'||ops==='Client Notified';
  const isL=type==='el'||type==='il';
  const isExp=type==='el'||type==='ed';

  const chk=(fld,v)=>`<input type="checkbox" ${v?'checked':''} onchange="_opsTog('${rec.id}','${fld}',this.checked)">`;
  const inp=(fld,v,w)=>`<input class="inp" style="width:${w||42}px" value="${v||''}" placeholder="--:--" onblur="_opsSvF('${rec.id}','${fld}',this.value)">`;
  const amt=(fld,v)=>`<input class="inp inp-amt" type="number" step="1" value="${v||''}" placeholder="0" onblur="_opsSvF('${rec.id}','${fld}',parseFloat(this.value)||null)">`;

  let cells='';
  if(isToday && isL && isExp) {
    cells=`<td class="rn">${num}</td>
      <td class="trunc" title="${client}">${client}</td>
      <td class="trunc" title="${loadL}">${loadL}</td>
      <td class="trunc-sm">${truck||'—'}</td><td class="trunc-sm">${driver||'—'}</td>
      <td class="c">${chk('Temp OK',f['Temp OK'])}</td>
      <td>${pal}</td>
      <td class="c">${chk('Docs Ready',f['Docs Ready'])}</td>
      <td>${!partner?amt('Advance Paid',f['Advance Paid']):''}</td>
      <td class="c">${!partner?chk('Second Card',f['Second Card']):''}</td>
      <td><button class="ab ab-ld" onclick="_opsStat('${rec.id}','Loaded')">Loaded</button> <button class="ab ab-pp" onclick="_opsPost('${rec.id}')">⏩</button></td>`;
  } else if(isToday && isL && !isExp) {
    cells=`<td class="rn">${num}</td>
      <td class="trunc" title="${client}">${client}</td>
      <td class="trunc" title="${loadL}">${loadL}</td>
      <td class="trunc-sm">${truck||'—'}</td><td class="trunc-sm">${driver||'—'}</td>
      <td class="c">${chk('CMR Photo Received',f['CMR Photo Received'])}</td>
      <td class="c">${chk('Temp OK',f['Temp OK'])}</td>
      <td>${inp('ETA',f['ETA'])}</td>
      <td><button class="ab ab-ld" onclick="_opsStat('${rec.id}','Loaded')">Loaded</button> <button class="ab ab-pp" onclick="_opsPost('${rec.id}')">⏩</button></td>`;
  } else if(isToday && !isL) {
    cells=`<td class="rn">${num}</td>
      <td class="trunc" title="${client}">${client}</td>
      <td class="trunc" title="${delivL}">${delivL}</td>
      <td class="trunc-sm">${truck||'—'}</td><td class="trunc-sm">${driver||'—'}</td>
      <td>${inp('ETA',f['ETA'])}</td>
      <td class="c">${chk('CMR Photo Received',f['CMR Photo Received'])}</td>
      <td class="c">${chk('Client Notified',f['Client Notified'])}</td>
      <td><button class="ab ab-dv" onclick="_opsDel('${rec.id}','On Time')">✓</button> <button class="ab ab-dy" onclick="_opsDel('${rec.id}','Delayed')">✗</button> <button class="ab ab-pp" onclick="_opsPost('${rec.id}')">⏩</button></td>`;
  } else if(!isToday && isL && isExp) {
    cells=`<td class="rn">${num}</td>
      <td class="trunc" title="${client}">${client}</td>
      <td class="trunc" title="${loadL}">${loadL}</td>
      <td class="trunc-sm">${truck||'—'}</td><td class="trunc-sm">${driver||'—'}</td>
      <td class="c">${chk('Driver Notified',f['Driver Notified'])}</td>`;
  } else if(!isToday && isL && !isExp) {
    cells=`<td class="rn">${num}</td>
      <td class="trunc" title="${client}">${client}</td>
      <td class="trunc" title="${loadL}">${loadL}</td>
      <td class="trunc-sm">${truck||'—'}</td><td class="trunc-sm">${driver||'—'}</td>
      <td class="c">${chk('Driver Notified',f['Driver Notified'])}</td>
      <td>${inp('ETA',f['ETA'])}</td>`;
  } else {
    cells=`<td class="rn">${num}</td>
      <td class="trunc" title="${client}">${client}</td>
      <td class="trunc" title="${delivL}">${delivL}</td>
      <td class="trunc-sm">${truck||'—'}</td><td class="trunc-sm">${driver||'—'}</td>
      <td>${inp('ETA',f['ETA'])}</td>`;
  }

  return `<tr class="${isDone?'done':''}">${cells}</tr>`;
}

/* ── ACTIONS ──────────────────────────────────────────────────── */
async function _opsTog(id,fld,v) {
  try{await atPatch(TABLES.ORDERS,id,{[fld]:v});const r=OPS.intl.find(x=>x.id===id);if(r)r.fields[fld]=v;toast(v?'✓':'—');}catch(e){toast('Σφάλμα','danger');}
}
async function _opsSvF(id,fld,v) {
  try{await atPatch(TABLES.ORDERS,id,{[fld]:v||null});const r=OPS.intl.find(x=>x.id===id);if(r)r.fields[fld]=v;}catch(e){toast('Σφάλμα','danger');}
}
async function _opsStat(id,st) {
  try{await atPatch(TABLES.ORDERS,id,{'Ops Status':st});const r=OPS.intl.find(x=>x.id===id);if(r)r.fields['Ops Status']=st;toast(st+' ✓');_opsDraw();}catch(e){toast('Σφάλμα','danger');}
}
async function _opsDel(id,perf) {
  const d=new Date().toISOString().split('T')[0];
  try{await atPatch(TABLES.ORDERS,id,{'Ops Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d});
    const r=OPS.intl.find(x=>x.id===id);if(r){r.fields['Ops Status']='Delivered';r.fields['Delivery Performance']=perf;}
    toast(perf==='On Time'?'✓ Delivered':'✗ Delayed',perf==='Delayed'?'danger':'success');_opsDraw();}catch(e){toast('Σφάλμα','danger');}
}
async function _opsPost(id) {
  const nd=prompt('Νέα ημερομηνία (YYYY-MM-DD):');
  if(!nd||!/\d{4}-\d{2}-\d{2}/.test(nd))return;
  try{await atPatch(TABLES.ORDERS,id,{'Ops Status':'Postponed','Postponed To':nd});
    const r=OPS.intl.find(x=>x.id===id);if(r){r.fields['Ops Status']='Postponed';}
    toast('⏩ '+nd);_opsDraw();}catch(e){toast('Σφάλμα','danger');}
}
async function _opsOvAct(id,perf='Delayed') {
  const d=new Date().toISOString().split('T')[0];
  try{await atPatch(TABLES.ORDERS,id,{'Ops Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d});
    OPS.overdue=OPS.overdue.filter(r=>r.id!==id);toast('✓');_opsDraw();}catch(e){toast('Σφάλμα','danger');}
}
