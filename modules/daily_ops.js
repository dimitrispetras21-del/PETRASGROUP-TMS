// ═══════════════════════════════════════════════════════════════
// DAILY OPS PLAN — v3.1
// Table-based spreadsheet layout — International ORDERS only
// Stacked: Export Load → Export Deliver → Import Load → Import Deliver
// ═══════════════════════════════════════════════════════════════
(function() {
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

/* ── CSS moved to assets/style.css ── */

/* ── ENTRY ────────────────────────────────────────────────────── */
async function renderDailyOps() {
  document.getElementById('topbarTitle').textContent = 'Daily Ops Plan';
  document.getElementById('content').innerHTML = showLoading('Φόρτωση…');
  try { await _opsLoad(); _opsDraw(); }
  catch(e) { document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Σφάλμα: ${e.message}</div>`; console.error(e); }
}

async function _opsLoad() {
  if (!OPS.trucks.length) {
    await preloadReferenceData();
    OPS.trucks=getRefTrucks().filter(r=>r.fields['Active']).map(r=>({id:r.id,lb:r.fields['License Plate']||''}));
    OPS.drivers=getRefDrivers().filter(r=>r.fields['Active']).map(r=>({id:r.id,lb:r.fields['Full Name']||''}));
    OPS.locs=getRefLocations(); OPS.clients=getRefClients();
  }
  const today=localToday();
  const tmrw=localTomorrow();
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

/* ── HELPERS (using shared data-helpers.js) ───────────────────── */
const _L=id=>getLocationName(id);
const _C=f=>{const raw=f['Client'];const id=Array.isArray(raw)?raw[0]:raw;return getClientName(id);};
const _T=f=>getTruckPlate(getLinkedId(f['Truck']))||'';
const _D=f=>getDriverName(getLinkedId(f['Driver']))||'';
const _DM=(dt,d)=>dt?toLocalDate(dt)===d:false;
const _P=f=>f['Is Partner Trip']===true||f['Is Partner Trip']==='Yes';

function _opsCats() {
  const today=localToday();
  const tmrw=localTomorrow();
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
  const today=localToday();
  const tmrw=localTomorrow();
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
  const nLoad=all.filter(r=>r.fields['Ops Status']==='In Transit'||r.fields['Ops Status']==='Loaded').length;
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
          <span class="ops-alert-info">${_L(_K(f['Loading Location 1']))} → ${_L(_K(f['Unloading Location 1']))}<span class="ops-alert-dt">${toLocalDate(f['Delivery DateTime'])}</span></span>
          <button class="ops-alert-btn ok" onclick="event.stopPropagation();_opsOvAct('${r.id}')">Delivered</button>
          <button class="ops-alert-btn no" onclick="event.stopPropagation();_opsOvAct('${r.id}','Delayed')">Delayed</button>
        </div>`;}).join('')}</div></div>`;
  }

  document.getElementById('content').innerHTML=`
    <div class="page-header" style="margin-bottom:12px">
      <div><div class="page-title">Daily Ops Plan</div>
        <div class="page-sub">${fD(tgt)} · ${total} orders</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="_opsPrint()">Print</button>
        <button class="btn btn-ghost" onclick="renderDailyOps()">Refresh</button>
      </div>
    </div>
    <div class="ops-toolbar">
      <button class="ops-day-btn ${isToday?'active':''}" onclick="OPS.date='today';renderDailyOps()">Today</button>
      <button class="ops-day-btn ${!isToday?'active':''}" onclick="OPS.date='tomorrow';renderDailyOps()">Tomorrow</button>
    </div>
    <div class="ops-kpis">
      <div class="ops-kpi"><div class="ops-kpi-label">Pending</div>
        <div class="ops-kpi-row"><span class="ops-kpi-val" style="color:#F1F5F9">${total?nPend:'—'}</span></div></div>
      <div class="ops-kpi"><div class="ops-kpi-label">Loaded</div>
        <div class="ops-kpi-row"><span class="ops-kpi-val" style="color:#0284C7">${total?nLoad:'—'}</span></div></div>
      <div class="ops-kpi"><div class="ops-kpi-label">Delivered</div>
        <div class="ops-kpi-row"><span class="ops-kpi-val" style="color:var(--success)">${total?nDel:'—'}</span><span class="ops-kpi-sub">${total?'/ '+total:''}</span></div>
        <div class="ops-kpi-bar"><div class="ops-kpi-fill" style="width:${total?Math.round(nDel/total*100):0}%;background:var(--success)"></div></div></div>
      <div class="ops-kpi"><div class="ops-kpi-label">Checklist</div>
        <div class="ops-kpi-row"><span class="ops-kpi-val" style="color:var(--success)">${tC?dC:'—'}</span><span class="ops-kpi-sub">${tC?'/ '+tC:''}</span></div>
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
  const isLoaded=ops==='Loaded'||ops==='In Transit';
  const isInTransit=ops==='In Transit';
  const isPostponed=ops==='Postponed';
  const isL=type==='el'||type==='il', isExp=type==='el'||type==='ed';

  // Status badge for completed states
  const statusBadge = isLoaded ? '<span style="background:#065F46;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600">LOADED ✓</span>'
    : isInTransit ? '<span style="background:#1E40AF;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600">IN TRANSIT</span>'
    : isPostponed ? '<span style="background:#92400E;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600">POSTPONED</span>'
    : isDone ? '<span style="background:#065F46;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600">DELIVERED ✓</span>'
    : null;

  const chk=(fld,v)=>`<input type="checkbox" ${v?'checked':''} onchange="_opsTog('${id}','${fld}',this.checked)">`;
  const timeSelect=(fld,v)=>{
    const hrs=[];for(let h=0;h<24;h++)for(let m=0;m<60;m+=30){const t=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');hrs.push(t);}
    return `<select class="tinp" onchange="_opsSvF('${id}','${fld}',this.value)"><option value="">--:--</option>${hrs.map(t=>`<option value="${t}"${v===t?' selected':''}>${t}</option>`).join('')}</select>`;
  };
  const amtInp=(fld,v)=>`<input class="tinp" type="number" step="1" value="${v||''}" placeholder="0" style="width:60px" onblur="_opsSvF('${id}','${fld}',parseFloat(this.value)||null)">`;

  // Action buttons with confirmation
  const _btn = (cls, label, action) => `<button class="btn ${cls}" style="padding:4px 12px;font-size:11px" onclick="if(confirm('${label}?'))${action}">${label}</button>`;
  const loadBtn = _btn('btn-primary','Loaded',`_opsStat('${id}','In Transit')`);
  const postBtn = _btn('btn-ghost','Postponed',`_opsPost('${id}')`);
  const delBtn = _btn('btn-success','Delivered',`_opsDel('${id}','On Time')`);
  const delayBtn = _btn('btn-danger','Delayed',`_opsDel('${id}','Delayed')`);

  let cells='';
  if(isToday && isL && isExp) {
    const actionCol = statusBadge
      ? `<td>${statusBadge}</td>`
      : `<td>${loadBtn} ${postBtn}</td>`;
    cells=`<td class="rn">${num}</td>
      <td class="trn" title="${client}">${client}</td>
      <td class="trn" title="${loadL}">${loadL}</td>
      <td class="trn-s">${truck||'—'}</td><td class="trn-s">${driver||'—'}</td>
      <td class="c">${chk('Temp OK',f['Temp OK'])}</td>
      <td>${pal}</td>
      <td class="c">${chk('Docs Ready',f['Docs Ready'])}</td>
      <td>${!partner?amtInp('Advance Paid',f['Advance Paid']):''}</td>
      <td class="c">${!partner?chk('Second Card',f['Second Card']):''}</td>
      ${actionCol}`;
  } else if(isToday && isL && !isExp) {
    const actionCol = statusBadge
      ? `<td>${statusBadge}</td>`
      : `<td>${loadBtn} ${postBtn}</td>`;
    cells=`<td class="rn">${num}</td>
      <td class="trn" title="${client}">${client}</td>
      <td class="trn" title="${loadL}">${loadL}</td>
      <td class="trn-s">${truck||'—'}</td><td class="trn-s">${driver||'—'}</td>
      <td class="c">${chk('CMR Photo Received',f['CMR Photo Received'])}</td>
      <td class="c">${chk('Temp OK',f['Temp OK'])}</td>
      <td>${timeSelect('ETA',f['ETA'])}</td>
      ${actionCol}`;
  } else if(isToday && !isL) {
    const actionCol = statusBadge
      ? `<td>${statusBadge}</td>`
      : `<td>${delBtn} ${delayBtn} ${postBtn}</td>`;
    cells=`<td class="rn">${num}</td>
      <td class="trn" title="${client}">${client}</td>
      <td class="trn" title="${delivL}">${delivL}</td>
      <td class="trn-s">${truck||'—'}</td><td class="trn-s">${driver||'—'}</td>
      <td>${timeSelect('ETA',f['ETA'])}</td>
      <td class="c">${chk('CMR Photo Received',f['CMR Photo Received'])}</td>
      <td class="c">${chk('Client Notified',f['Client Notified'])}</td>
      ${actionCol}`;
  } else if(!isToday && isL && isExp) {
    cells=`<td class="rn">${num}</td>
      <td class="trn" title="${client}">${client}</td>
      <td class="trn" title="${loadL}">${loadL}</td>
      <td class="trn-s">${truck||'—'}</td><td class="trn-s">${driver||'—'}</td>
      <td class="c">${chk('Driver Notified',f['Driver Notified'])}</td>
      <td>${postBtn}</td>`;
  } else if(!isToday && isL && !isExp) {
    cells=`<td class="rn">${num}</td>
      <td class="trn" title="${client}">${client}</td>
      <td class="trn" title="${loadL}">${loadL}</td>
      <td class="trn-s">${truck||'—'}</td><td class="trn-s">${driver||'—'}</td>
      <td class="c">${chk('Driver Notified',f['Driver Notified'])}</td>
      <td>${timeSelect('ETA',f['ETA'])}</td>
      <td>${postBtn}</td>`;
  } else {
    cells=`<td class="rn">${num}</td>
      <td class="trn" title="${client}">${client}</td>
      <td class="trn" title="${delivL}">${delivL}</td>
      <td class="trn-s">${truck||'—'}</td><td class="trn-s">${driver||'—'}</td>
      <td>${timeSelect('ETA',f['ETA'])}</td>
      <td>${postBtn}</td>`;
  }
  return `<tr class="${isDone?'done':isLoaded?'loaded':isInTransit?'transit':''}" style="${isLoaded?'background:#F0FDF4':isInTransit?'background:#EFF6FF':isDone?'opacity:.5':''}">${cells}</tr>`;
}

/* ── ACTIONS ──────────────────────────────────────────────────── */
async function _opsTog(id,fld,v){
  try{
    await atSafePatch(TABLES.ORDERS,id,{[fld]:v});
    const r=OPS.intl.find(x=>x.id===id);
    if(r) r.fields[fld]=v;
    toast(v?'✓':'—');

    // Auto-status transitions based on checklist completion
    if(v && r) {
      const f=r.fields;
      const status=f['Ops Status']||'';
      const loadChecks=['Docs Ready','Temp OK','Driver Notified'];
      const delChecks=['CMR Photo Received','Client Notified'];

      // All loading checks done + status is Assigned/Pending → suggest "Loaded"
      if(loadChecks.includes(fld) && (status==='Assigned'||status==='Pending'||status==='')) {
        const allLoaded=loadChecks.every(c=>f[c]);
        if(allLoaded && confirm('Ολα τα loading checks ✓ — Αλλαγή σε "Loaded";')) {
          await _opsStat(id,'Loaded');
          return;
        }
      }

      // All delivery checks done + status is In Transit → suggest "Delivered"
      if(delChecks.includes(fld) && status==='In Transit') {
        const allDel=delChecks.every(c=>f[c]);
        if(allDel && confirm('Ολα τα delivery checks ✓ — Αλλαγή σε "Delivered (On Time)";')) {
          await _opsDel(id,'On Time');
          return;
        }
      }
    }
    _opsDraw();
  }catch(e){toast('Error','danger');}
}
async function _opsSvF(id,fld,v){try{await atSafePatch(TABLES.ORDERS,id,{[fld]:v||null});const r=OPS.intl.find(x=>x.id===id);if(r)r.fields[fld]=v;}catch(e){toast('Error','danger');}}
async function _opsStat(id,st){try{await atSafePatch(TABLES.ORDERS,id,{'Ops Status':st});const r=OPS.intl.find(x=>x.id===id);if(r)r.fields['Ops Status']=st;toast(st+' ✓');_opsDraw();}catch(e){toast('Error','danger');}}
async function _opsDel(id,perf){const d=localToday();
  try{await atSafePatch(TABLES.ORDERS,id,{'Ops Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d});
  const r=OPS.intl.find(x=>x.id===id);if(r){r.fields['Ops Status']='Delivered';r.fields['Delivery Performance']=perf;}
  toast(perf==='On Time'?'✓ Delivered':'✗ Delayed',perf==='Delayed'?'danger':'success');_opsDraw();}catch(e){toast('Error','danger');}}
async function _opsPost(id){
  // Auto-postpone to next day
  const r=OPS.intl.find(x=>x.id===id);if(!r)return;
  const f=r.fields;
  const loadDt=toLocalDate(f['Loading DateTime']);
  const delDt=toLocalDate(f['Delivery DateTime']);
  const nextLoad=loadDt?toLocalDate(new Date(new Date(loadDt+'T12:00:00').getTime()+864e5)):'';
  const nextDel=delDt?toLocalDate(new Date(new Date(delDt+'T12:00:00').getTime()+864e5)):'';
  const patch={'Ops Status':'Postponed','Postponed To':nextLoad||nextDel};
  if(nextLoad) patch['Loading DateTime']=nextLoad;
  if(nextDel) patch['Delivery DateTime']=nextDel;
  try{await atSafePatch(TABLES.ORDERS,id,patch);
  invalidateCache(TABLES.ORDERS);
  toast('Postponed → '+(nextLoad||nextDel));renderDailyOps();}catch(e){toast('Error','danger');}}
function _opsPrint() {
  const content = document.querySelector('.ops-sections');
  if (!content) return;
  const win = window.open('','_blank','width=1100,height=800');
  win.document.write(`<html><head><title>Daily Ops Plan</title>
    <style>
      body{font-family:'DM Sans',sans-serif;padding:20px;color:#1E293B;font-size:12px}
      h1{font-family:'Syne',sans-serif;font-size:18px;margin-bottom:4px}
      .sub{color:#64748B;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;margin-bottom:18px}
      th{background:#F0F5FA;padding:7px 10px;font-size:9px;text-transform:uppercase;
        letter-spacing:.8px;text-align:left;border-bottom:2px solid #E2E8F0;font-weight:600}
      td{padding:6px 10px;border-bottom:1px solid #E2E8F0;font-size:11px}
      .sec{background:#0B1929;color:#C4CFDB;padding:6px 12px;font-size:9px;
        font-weight:800;letter-spacing:1.5px;text-transform:uppercase;border-radius:6px 6px 0 0;
        border-left:3px solid #0284C7;margin-top:12px}
      .ops-toolbar,.btn,.ops-alert,.ops-kpis{display:none!important}
      input,select,button{display:none}
      @media print{body{padding:10px}table{page-break-inside:auto}}
    </style></head><body>
    <h1>Daily Ops Plan</h1>
    <div class="sub">${document.querySelector('.page-sub')?.textContent||''}</div>
    ${content.innerHTML}
  </body></html>`);
  win.document.close();
  setTimeout(()=>{win.print();},400);
}

async function _opsOvAct(id,perf='Delayed'){const d=localToday();
  try{await atSafePatch(TABLES.ORDERS,id,{'Ops Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d});
  OPS.overdue=OPS.overdue.filter(r=>r.id!==id);toast('✓');_opsDraw();}catch(e){toast('Error','danger');}}

// Expose functions used from onclick/onchange handlers
window.renderDailyOps = renderDailyOps;
window.OPS = OPS;
window._opsPrint = _opsPrint;
window._opsTog = _opsTog;
window._opsSvF = _opsSvF;
window._opsStat = _opsStat;
window._opsDel = _opsDel;
window._opsPost = _opsPost;
window._opsOvAct = _opsOvAct;
})();
