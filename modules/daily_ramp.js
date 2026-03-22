// ═══════════════════════════════════════════════════════════════
// DAILY RAMP BOARD — v2.1
// Vermion Fresh — Veroia warehouse
// 2-col: Inbound | Outbound + Combined timeline + Stock
// ═══════════════════════════════════════════════════════════════

'use strict';

const RAMP = {
  date: new Date().toISOString().split('T')[0],
  records: [], trucks: [], drivers: [], locs: [], clients: [], stock: [],
};

const RAMP_FIELDS = [
  'Plan Date','Time','Type','Status','Pallets','Goods',
  'Supplier/Client','Notes','Postponed To','Temperature',
  'Order','National Order','Truck','Driver',
  'Is Veroia Switch','Ramp Category','Stock Status',
  'Loading Points','Delivery Points',
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
    const [t,d,l,cl] = await Promise.all([
      atGetAll(TABLES.TRUCKS,{fields:['License Plate'],filterByFormula:'{Active}=TRUE()'},false),
      atGetAll(TABLES.DRIVERS,{fields:['Full Name'],filterByFormula:'{Active}=TRUE()'},false),
      atGetAll(TABLES.LOCATIONS,{fields:['Name','City','Country']},true),
      atGetAll(TABLES.CLIENTS,{fields:['Company Name']},true),
    ]);
    RAMP.trucks=t.map(r=>({id:r.id,lb:r.fields['License Plate']||''}));
    RAMP.drivers=d.map(r=>({id:r.id,lb:r.fields['Full Name']||''}));
    RAMP.locs=l;
    RAMP.clients=cl;
  }

  // Auto-sync: create RAMP records from ORDERS, NAT_ORDERS, CONS_LOADS
  await _rampAutoSync();

  const filter=`IS_SAME({Plan Date},'${RAMP.date}','day')`;
  const recs=await atGetAll(TABLES.RAMP,{filterByFormula:filter,fields:RAMP_FIELDS},false);
  recs.sort((a,b)=>(a.fields['Time']||'ZZ').localeCompare(b.fields['Time']||'ZZ'));
  RAMP.records=recs;

  const stockFilter=`AND({Type}='Παραλαβή',{Status}='✅ Έγινε',OR({Stock Status}='In Stock',{Stock Status}=''))`;
  RAMP.stock=await atGetAll(TABLES.RAMP,{filterByFormula:stockFilter,fields:RAMP_FIELDS},false);
}

/* ── AUTO-SYNC: Create RAMP records from source tables ────────── */
async function _rampAutoSync() {
  const date = RAMP.date;
  const nextDay = new Date(new Date(date).getTime()+864e5).toISOString().split('T')[0];
  const prevDay = new Date(new Date(date).getTime()-864e5).toISOString().split('T')[0];

  // Get existing RAMP records for this date to avoid duplicates
  const existing = await atGetAll(TABLES.RAMP, {
    filterByFormula: `IS_SAME({Plan Date},'${date}','day')`,
    fields: ['Order','National Order','Type','Ramp Category','Supplier/Client','Status'],
  }, false);
  const existingKeys = new Set(existing.map(r => {
    const oid = (r.fields['Order']||[])[0]?.id || (r.fields['Order']||[])[0] || '';
    const nid = (r.fields['National Order']||[])[0]?.id || (r.fields['National Order']||[])[0] || '';
    return `${oid||nid}_${r.fields['Type']}_${r.fields['Ramp Category']||''}`;
  }));

  const toCreate = [];

  // ── 1. ORDERS (International) ──────────────────────────────
  // VF Export: Loading Date = today → Outbound
  // VF Import: Delivery Date = today → Inbound
  // VS Export: Loading Date = yesterday (today = Loading+1) → Outbound
  // VS Import: Delivery Date = tomorrow (today = Delivery-1) → Inbound

  const intlFilters = [
    // VF Export: non-VS, Export, Loading = today
    `AND(NOT({Veroia Switch}),{Direction}='Export',IS_SAME({Loading DateTime},'${date}','day'))`,
    // VF Import: non-VS, Import, Delivery = today
    `AND(NOT({Veroia Switch}),{Direction}='Import',IS_SAME({Delivery DateTime},'${date}','day'))`,
    // VS Export: VS=true, Export, Loading = yesterday (ramp date = loading+1)
    `AND({Veroia Switch},    {Direction}='Export',IS_SAME({Loading DateTime},'${prevDay}','day'))`,
    // VS Import: VS=true, Import, Delivery = tomorrow (ramp date = delivery-1)
    `AND({Veroia Switch},    {Direction}='Import',IS_SAME({Delivery DateTime},'${nextDay}','day'))`,
  ];

  const intlFields = ['Direction','Veroia Switch','Loading DateTime','Delivery DateTime',
    'Goods','Temperature °C','Total Pallets','Client','Truck','Trailer','Driver',
    'Loading Location 1','Loading Location 2','Loading Location 3',
    'Unloading Location 1','Unloading Location 2','Unloading Location 3'];

  const intlResults = await Promise.all(
    intlFilters.map(f => atGetAll(TABLES.ORDERS, {filterByFormula:f, fields:intlFields}, false).catch(()=>[]))
  );

  const [vfExp, vfImp, vsExp, vsImp] = intlResults;

  // VF Export → Outbound
  vfExp.forEach(r => {
    const key = `${r.id}_Φόρτωση_Vermion Fresh`;
    if (existingKeys.has(key)) return;
    toCreate.push(_rampBuildRecord(r, 'Φόρτωση', 'Vermion Fresh', date, false));
  });

  // VF Import → Inbound
  vfImp.forEach(r => {
    const key = `${r.id}_Παραλαβή_Vermion Fresh`;
    if (existingKeys.has(key)) return;
    toCreate.push(_rampBuildRecord(r, 'Παραλαβή', 'Vermion Fresh', date, false));
  });

  // VS Export → Outbound (date = loading+1)
  vsExp.forEach(r => {
    const key = `${r.id}_Φόρτωση_VS Simple`;
    if (existingKeys.has(key)) return;
    toCreate.push(_rampBuildRecord(r, 'Φόρτωση', 'VS Simple', date, true));
  });

  // VS Import → Inbound (date = delivery-1)
  vsImp.forEach(r => {
    const key = `${r.id}_Παραλαβή_VS Simple`;
    if (existingKeys.has(key)) return;
    toCreate.push(_rampBuildRecord(r, 'Παραλαβή', 'VS Simple', date, true));
  });

  // ── 2. NAT_ORDERS (National) — exclude VS + National Groupage ──
  const natFilter = `AND(
    NOT(AND({Type}='Veroia Switch',{National Groupage})),
    OR(IS_SAME({Loading DateTime},'${date}','day'),IS_SAME({Delivery DateTime},'${date}','day'))
  )`;
  const natFields = ['Direction','Type','Loading DateTime','Delivery DateTime',
    'Goods','Temperature °C','Pallets','Client','Truck','Driver',
    'Pickup Location 1','Pickup Location 2','Pickup Location 3',
    'Delivery Location 1','Delivery Location 2','Delivery Location 3',
    'National Groupage'];

  const natOrders = await atGetAll(TABLES.NAT_ORDERS, {filterByFormula:natFilter, fields:natFields}, false).catch(()=>[]);

  natOrders.forEach(r => {
    const f = r.fields;
    const isLoading = f['Loading DateTime'] && f['Loading DateTime'].substring(0,10) === date;
    const isDelivery = f['Delivery DateTime'] && f['Delivery DateTime'].substring(0,10) === date;
    const type = isLoading ? 'Παραλαβή' : 'Φόρτωση'; // national pickup = inbound to Veroia
    const key = `${r.id}_${type}_`;
    if (existingKeys.has(key)) return;

    const rec = {
      'Plan Date': date,
      'Type': type,
      'Status': 'Προγραμματισμένο',
      'National Order': [r.id],
      'Goods': f['Goods'] || '',
      'Pallets': f['Pallets'] || 0,
      'Supplier/Client': Array.isArray(f['Client']) ? (f['Client'][0]||'') : (f['Client']||''),
    };
    if (f['Temperature °C']) rec['Temperature'] = String(f['Temperature °C']);
    if (f['Truck']?.length) rec['Truck'] = [f['Truck'][0]?.id || f['Truck'][0]];
    if (f['Driver']?.length) rec['Driver'] = [f['Driver'][0]?.id || f['Driver'][0]];
    rec['Loading Points'] = _rampResolveStops(f, 'Pickup Location', 3);
    rec['Delivery Points'] = _rampResolveStops(f, 'Delivery Location', 3);
    toCreate.push(rec);
  });

  // ── 3. CONS_LOADS → Inbound (VS + Groupage) ──────────────
  const clFilter = `IS_SAME({Loading DateTime},'${date}','day')`;
  const clFields = ['Loading DateTime','Goods','Temperature C','Total Pallets','Client',
    'Truck','Trailer','Driver','Name','Groupage ID','Source Orders',
    'Pallets 1','Pallets 2','Pallets 3','Pallets 4','Pallets 5',
    'Pallets 6','Pallets 7','Pallets 8','Pallets 9','Pallets 10',
    'Loading Location 1','Loading Location 2','Loading Location 3','Loading Location 4','Loading Location 5',
    'Delivery Location 1','Delivery Location 2','Delivery Location 3'];

  const consLoads = await atGetAll(TABLES.CONS_LOADS, {filterByFormula:clFilter, fields:clFields}, false).catch(()=>[]);

  // Deduplicate by CL Name — check if ANY existing VS+G record contains this CL Name
  const existingVSG = existing.filter(e=>e.fields['Ramp Category']==='VS + Groupage');

  for (const r of consLoads) {
    const f = r.fields;
    const clName = f['Name']||'';
    // Check if any existing record already references this CL (by name anywhere in Supplier/Client or Notes)
    const alreadyExists = existingVSG.some(e => {
      const sc = e.fields['Supplier/Client']||'';
      return sc.includes(clName) || sc === clName;
    });
    if (alreadyExists) continue;

    // Fetch source order details for supplier breakdown
    const srcIds = (f['Source Orders']||[]).map(o=>o?.id||o).filter(Boolean);
    let supplierLines = [];
    if (srcIds.length) {
      const srcOrders = await Promise.all(srcIds.map(async (sid,i) => {
        try {
          const res = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${TABLES.NAT_ORDERS}/${sid}`,
            {headers:{'Authorization':'Bearer '+AT_TOKEN}});
          const d = await res.json();
          const sf = d.fields||{};
          // Resolve client name
          const clientId = Array.isArray(sf['Client']) ? sf['Client'][0] : sf['Client'];
          const clientRec = clientId ? RAMP.clients.find(c=>c.id===clientId) : null;
          const clientName = clientRec ? (clientRec.fields['Company Name']||clientId) : (clientId||'—');
          // Resolve pickup location
          const locId = Array.isArray(sf['Pickup Location 1']) ? (sf['Pickup Location 1'][0]?.id||sf['Pickup Location 1'][0]) : null;
          const locRec = locId ? RAMP.locs.find(l=>l.id===locId) : null;
          const locName = locRec ? (locRec.fields['Name']||locRec.fields['City']||'') : '';
          const pal = f[`Pallets ${i+1}`] || sf['Pallets'] || 0;
          const ref = sf['Reference'] || '';
          return {client:clientName, location:locName, pallets:pal, ref:ref};
        } catch { return null; }
      }));
      supplierLines = srcOrders.filter(Boolean);
    }

    // Build supplier/client as "Name1 / Name2 / ..."
    const clientNames = supplierLines.map(s=>s.client).filter(Boolean);
    const supplierStr = clientNames.length ? clientNames.join(' / ') : clName;

    // Build notes with breakdown: "Client | Location | PAL | REF" per line
    const notesLines = supplierLines.map(s => `${s.client} | ${s.location} | ${s.pallets} pal | ref: ${s.ref}`);
    const notesStr = notesLines.join('\n');

    const rec = {
      'Plan Date': date,
      'Type': 'Παραλαβή',
      'Status': 'Προγραμματισμένο',
      'Ramp Category': 'VS + Groupage',
      'Is Veroia Switch': true,
      'Goods': f['Goods'] || '',
      'Pallets': f['Total Pallets'] || 0,
      'Supplier/Client': clName + ' | ' + supplierStr,
      'Notes': notesStr,
    };
    if (f['Temperature C']) rec['Temperature'] = String(f['Temperature C']);
    if (f['Truck']?.length) rec['Truck'] = [f['Truck'][0]?.id || f['Truck'][0]];
    if (f['Driver']?.length) rec['Driver'] = [f['Driver'][0]?.id || f['Driver'][0]];
    // Resolve CL locations
    rec['Loading Points'] = _rampResolveStops(f, 'Loading Location', 10);
    rec['Delivery Points'] = _rampResolveStops(f, 'Delivery Location', 10);
    toCreate.push(rec);
  }

  // ── Cleanup: remove orphan RAMP records ──────────────────
  // Collect all valid source IDs from what we just fetched
  const validOrderIds = new Set([
    ...vfExp.map(r=>r.id), ...vfImp.map(r=>r.id),
    ...vsExp.map(r=>r.id), ...vsImp.map(r=>r.id),
  ]);
  const validNatIds = new Set(natOrders.map(r=>r.id));
  const validCLNames = new Set(consLoads.map(r=>r.fields['Name']||''));

  const toDelete = [];
  for (const ramp of existing) {
    const rf = ramp.fields;
    const status = rf['Status']||'';
    // Don't delete manually created or already done records
    if (status === '✅ Έγινε') continue;

    const orderId = (rf['Order']||[])[0]?.id || (rf['Order']||[])[0] || '';
    const natId = (rf['National Order']||[])[0]?.id || (rf['National Order']||[])[0] || '';
    const cat = rf['Ramp Category']||'';

    if (orderId && !validOrderIds.has(orderId)) {
      // Source international order no longer matches this date
      toDelete.push(ramp.id);
    } else if (natId && !validNatIds.has(natId)) {
      // Source national order no longer matches this date
      toDelete.push(ramp.id);
    } else if (cat === 'VS + Groupage' && !orderId && !natId) {
      // CL record — check if CL still exists for this date
      const clName = (rf['Supplier/Client']||'').split(' | ')[0];
      if (clName && !validCLNames.has(clName)) {
        toDelete.push(ramp.id);
      }
    }
  }

  if (toDelete.length) {
    for (const id of toDelete) {
      await atDelete(TABLES.RAMP, id).catch(e => console.error('Ramp cleanup error:', e));
    }
    console.log(`Ramp cleanup: removed ${toDelete.length} orphan records`);
  }

  // ── Create all new RAMP records ──────────────────────────
  if (toCreate.length) {
    for (let i = 0; i < toCreate.length; i += 10) {
      const batch = toCreate.slice(i, i + 10);
      await Promise.all(batch.map(fields => atCreate(TABLES.RAMP, fields).catch(e => console.error('Ramp sync error:', e))));
    }
    console.log(`Ramp auto-sync: created ${toCreate.length} records`);
  }
}

/* ── BUILD RAMP RECORD from ORDERS ────────────────────────────── */
function _rampBuildRecord(orderRec, type, category, date, isVS) {
  const f = orderRec.fields;
  const rec = {
    'Plan Date': date,
    'Type': type,
    'Status': 'Προγραμματισμένο',
    'Ramp Category': category,
    'Is Veroia Switch': isVS,
    'Order': [orderRec.id],
    'Goods': f['Goods'] || '',
    'Pallets': f['Total Pallets'] || 0,
    'Supplier/Client': Array.isArray(f['Client']) ? (f['Client'][0]||'') : (f['Client']||''),
  };
  if (f['Temperature °C']) rec['Temperature'] = String(f['Temperature °C']);
  if (f['Truck']?.length) rec['Truck'] = [f['Truck'][0]?.id || f['Truck'][0]];
  if (f['Driver']?.length) rec['Driver'] = [f['Driver'][0]?.id || f['Driver'][0]];
  // Resolve locations
  rec['Loading Points'] = _rampResolveStops(f, 'Loading Location', 5);
  rec['Delivery Points'] = _rampResolveStops(f, 'Unloading Location', 5);
  return rec;
}

function _rampResolveStops(f, prefix, max) {
  const names = [];
  for (let i=1; i<=max; i++) {
    const key = `${prefix} ${i}`;
    const arr = f[key];
    const id = Array.isArray(arr) ? (arr[0]?.id||arr[0]) : null;
    if (id) {
      const loc = RAMP.locs.find(r=>r.id===id);
      if (loc) names.push(loc.fields['Name']||loc.fields['City']||'');
    }
  }
  return names.filter(Boolean).join(' / ') || '';
}

/* ── HELPERS ──────────────────────────────────────────────────── */
const _rK=a=>a?.length?(a[0]?.id||a[0]||null):null;
const _rTruck=f=>{const id=_rK(f['Truck']);return id?RAMP.trucks.find(t=>t.id===id)?.lb||'':'';};
const _rDriver=f=>{const id=_rK(f['Driver']);return id?RAMP.drivers.find(d=>d.id===id)?.lb||'':'';};
function _rClient(val) {
  if (!val) return '—';
  // If it's already a resolved name (not a record ID), return as-is
  if (typeof val === 'string' && !val.startsWith('rec')) return val;
  // If it's a record ID, try to resolve
  const id = typeof val === 'string' ? val : (Array.isArray(val) ? val[0] : val);
  if (!id || typeof id !== 'string') return String(val||'—');
  const c = RAMP.clients.find(r=>r.id===id);
  return c ? (c.fields['Company Name']||'—') : String(id).substring(0,15);
}
function _rResolveClientStr(str) {
  if (!str) return '—';
  // Handle "Name | supplier1 / supplier2" format or "recXXX / recYYY"
  return str.split(/\s*[/|]\s*/).map(s => _rClient(s.trim())).join(' / ');
}
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
          <th>#</th><th>Time</th><th>Client</th><th>Loading Location</th><th>Goods</th><th>Temp</th><th>Pallets</th><th>Truck</th><th>Actions</th>
        </tr></thead><tbody>${inb.length?inb.map((r,i)=>_rRow(r,i+1,tOpts)).join(''):'<tr class="ramp-empty"><td colspan="9">No inbound</td></tr>'}</tbody></table>
      </div>
      <div>
        <div class="ramp-sec-hd outbound"><span>↑ Outbound</span><span style="opacity:.5">${out.length}</span></div>
        <table class="ramp-t"><thead><tr>
          <th>#</th><th>Time</th><th>Client</th><th>Delivery Location</th><th>Goods</th><th>Temp</th><th>Pallets</th><th>Truck</th><th>Actions</th>
        </tr></thead><tbody>${out.length?out.map((r,i)=>_rRow(r,i+1,tOpts)).join(''):'<tr class="ramp-empty"><td colspan="9">No outbound</td></tr>'}</tbody></table>
      </div>
    </div>

    <div class="ramp-sec-hd timeline"><span>🕐 Timeline — All Operations</span><span style="opacity:.5">${allSorted.length}</span></div>
    <table class="ramp-t"><thead><tr>
      <th>Time</th><th>Type</th><th>Client</th><th>Location</th><th>Goods</th><th>Temp</th><th>Pallets</th><th>Truck</th><th>Driver</th><th>Status</th>
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

  const timeSel=`<select class="tinp" onchange="_rampSvTime('${id}',this.value)"><option value="">--:--</option>${tOpts.map(t=>`<option value="${t}"${time===t?' selected':''}>${t}</option>`).join('')}</select>`;
  const acts=isDone?'<span style="color:var(--success);font-size:10px">✓ Done</span>'
    :`<button class="abtn abtn-ok" onclick="_rampDone('${id}','${isIn}')">${isIn?'Done':'Loaded'}</button> <button class="abtn abtn-pp" onclick="_rampPostpone('${id}')">Postpone</button>`;

  // CL sub-rows: parse Notes for supplier breakdown
  const notes = f['Notes']||'';
  const isVSG = (f['Ramp Category']||'')==='VS + Groupage';
  const clientDisplay = _rResolveClientStr(isVSG && client.includes(' | ')
    ? client.split(' | ').slice(1).join(' / ')
    : client);

  // Sub-rows for VS+G consolidated loads
  let subHtml = '';
  if (isVSG && notes) {
    const lines = notes.split('\n').filter(Boolean);
    subHtml = lines.map(line => {
      const parts = line.split(' | ');
      const sup = parts[0]?.trim()||'';
      const loc = parts[1]?.trim()||'';
      const palInfo = parts[2]||'';
      const refInfo = parts[3]||'';
      return `<tr style="background:rgba(124,58,237,0.04);font-size:11px;color:var(--text-mid)">
        <td></td><td></td>
        <td style="padding-left:20px">↳ ${sup}</td>
        <td>${loc}</td>
        <td></td><td></td>
        <td>${palInfo}</td>
        <td style="font-size:10px">${refInfo}</td>
        <td></td></tr>`;
    }).join('');
  }

  const locField = isIn ? (f['Loading Points']||'') : (f['Delivery Points']||'');

  return`<tr class="${isDone?'done':''}">
    <td class="rn">${num}</td><td>${timeSel}</td>
    <td class="trn" title="${clientDisplay}">${clientDisplay}</td>
    <td class="trn" title="${locField}">${locField||'—'}</td>
    <td class="trn" title="${goods}">${goods}</td>
    <td>${temp?temp+'°C':''}</td><td>${pal}</td>
    <td>${truck||'—'}</td><td>${acts}</td></tr>${subHtml}`;
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

  const tlLoc = isIn ? (f['Loading Points']||'') : (f['Delivery Points']||'');
  return`<tr class="${isDone?'done':''}">
    <td>${f['Time']||'—'}</td><td>${typeBadge}</td>
    <td class="trn">${_rResolveClientStr(f['Supplier/Client']||'—')}</td>
    <td class="trn">${tlLoc||'—'}</td>
    <td class="trn">${(f['Goods']||'').substring(0,35)}</td>
    <td>${f['Temperature']||f['Temperature °C']?((f['Temperature']||f['Temperature °C'])+'°C'):''}</td>
    <td>${f['Pallets']||''}</td>
    <td>${_rTruck(f)||'—'}</td><td>${_rDriver(f)||'—'}</td>
    <td>${statusTxt}</td></tr>`;
}

/* ── ACTIONS ──────────────────────────────────────────────────── */
function _rampSD(d){RAMP.date=d;renderDailyRamp();}
async function _rampSvF(id,fld,v){try{await atPatch(TABLES.RAMP,id,{[fld]:v||null});const r=RAMP.records.find(x=>x.id===id);if(r)r.fields[fld]=v;}catch(e){toast('Error','danger');}}
async function _rampSvTime(id,v){
  try{await atPatch(TABLES.RAMP,id,{'Time':v||null});
    const r=RAMP.records.find(x=>x.id===id);if(r)r.fields['Time']=v;
    // Re-sort and re-draw
    RAMP.records.sort((a,b)=>(a.fields['Time']||'ZZ').localeCompare(b.fields['Time']||'ZZ'));
    _rampDraw();
  }catch(e){toast('Error','danger');}
}

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
