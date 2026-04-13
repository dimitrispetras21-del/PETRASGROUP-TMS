// ═══════════════════════════════════════════════════════════════
// DAILY RAMP BOARD — v2.1
// Vermion Fresh — Veroia warehouse
// 2-col: Inbound | Outbound + Combined timeline + Stock
// ═══════════════════════════════════════════════════════════════
(function() {
'use strict';

const RAMP = {
  date: localToday(),
  records: [], trucks: [], drivers: [], locs: [], clients: [], stock: [],
};

const RAMP_FIELDS = [
  'Plan Date','Time','Type','Status','Pallets','Goods',
  'Supplier/Client','Notes','Postponed To','Temperature',
  'Order','National Order','Truck','Driver',
  'Is Veroia Switch','Ramp Category','Stock Status',
  'Loading Points','Delivery Points',
  'Stop Client 1','Stop Client 2','Stop Client 3','Stop Client 4','Stop Client 5',
  'Stop Location 1','Stop Location 2','Stop Location 3','Stop Location 4','Stop Location 5',
  'Stop Pallets 1','Stop Pallets 2','Stop Pallets 3','Stop Pallets 4','Stop Pallets 5',
  'Stop Temp 1','Stop Temp 2','Stop Temp 3','Stop Temp 4','Stop Temp 5',
  'Stop Ref 1','Stop Ref 2','Stop Ref 3','Stop Ref 4','Stop Ref 5',
];

/* ── CSS moved to assets/style.css ── */

/* ── ENTRY ────────────────────────────────────────────────────── */
let _rampAutoRefresh = null;

async function renderDailyRamp() {
  document.getElementById('topbarTitle').textContent = 'Daily Ramp Board';
  document.getElementById('content').innerHTML = showLoading('Φόρτωση ράμπας…');
  try { await _rampLoad(); _rampDraw(); }
  catch(e) { document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Σφάλμα: ${e.message}</div>`; console.error(e); }
  // Auto-refresh every 2 minutes while on this page
  clearInterval(_rampAutoRefresh);
  _rampAutoRefresh = setInterval(async () => {
    if (currentPage !== 'daily_ramp') { clearInterval(_rampAutoRefresh); return; }
    try { await _rampLoad(); _rampDraw(); } catch(e) { console.warn('Ramp auto-refresh failed:', e); }
  }, 120000);
}

async function _rampLoad() {
  if (!RAMP.trucks.length || !RAMP.clients.length) {
    await preloadReferenceData();
    RAMP.trucks=getRefTrucks().filter(r=>r.fields['Active']).map(r=>({id:r.id,lb:r.fields['License Plate']||''}));
    RAMP.drivers=getRefDrivers().filter(r=>r.fields['Active']).map(r=>({id:r.id,lb:r.fields['Full Name']||''}));
    RAMP.locs=getRefLocations();
    RAMP.clients=getRefClients();
  }

  // Auto-sync: create RAMP records from ORDERS, NAT_ORDERS, CONS_LOADS
  await _rampAutoSync();

  // Single combined query: today's ramp + stock + postponed (split client-side)
  // Reduces 3 parallel API calls → 1 call
  const combinedFilter = `OR(IS_SAME({Plan Date},'${RAMP.date}','day'),AND({Type}='Παραλαβή',{Status}='✅ Έγινε',OR({Stock Status}='In Stock',{Stock Status}='')),{Postponed To}!=BLANK())`;
  const allRamp = await atGetAll(TABLES.RAMP,{filterByFormula:combinedFilter,fields:RAMP_FIELDS},false);

  // Split results client-side
  const recs = allRamp.filter(r => toLocalDate(r.fields['Plan Date']) === RAMP.date);
  const stock = allRamp.filter(r => r.fields['Type']==='Παραλαβή' && (r.fields['Status']==='✅ Έγινε') && (r.fields['Stock Status']==='In Stock' || !r.fields['Stock Status']));
  const postponed = allRamp.filter(r => r.fields['Postponed To'] && toLocalDate(r.fields['Postponed To']) === RAMP.date);

  recs.sort((a,b)=>(a.fields['Time']||'ZZ').localeCompare(b.fields['Time']||'ZZ'));
  RAMP.records=recs;
  RAMP.stock=stock;
  RAMP.postponed=postponed;
}

/* ── AUTO-SYNC: Create RAMP records from source tables ────────── */
async function _rampAutoSync() {
  const date = RAMP.date;
  const nextDay = toLocalDate(new Date(new Date(date+'T12:00:00').getTime()+864e5));
  const prevDay = toLocalDate(new Date(new Date(date+'T12:00:00').getTime()-864e5));

  // Single query: today's RAMP + all postponed (for dedup) — reduces 2 calls → 1
  const dedupFields = ['Order','National Order','Type','Ramp Category','Supplier/Client','Status','Notes','Time','Plan Date','Postponed To','Pallets'];
  const allExistingRaw = await atGetAll(TABLES.RAMP, {
    filterByFormula: `OR(IS_SAME({Plan Date},'${date}','day'),{Postponed To}!=BLANK())`,
    fields: dedupFields,
  }, false);
  const existing = allExistingRaw.filter(r => toLocalDate(r.fields['Plan Date']) === date);
  const allExisting = allExistingRaw;
  // Primary key: Order/NatOrder + Type + Category
  const existingKeys = new Set(allExisting.map(r => {
    const oid = getLinkId(r.fields['Order']) || '';
    const nid = getLinkId(r.fields['National Order']) || '';
    const src = oid || nid || r.id;
    return `${src}_${r.fields['Type']}_${r.fields['Ramp Category']||''}`;
  }));
  // Secondary dedup key: Client + Type + Pallets (catches records without Order link)
  const existingClientKeys = new Set(allExisting.map(r => {
    const client = r.fields['Supplier/Client'] || '';
    return `${client}_${r.fields['Type']}_${parseInt(r.fields['Pallets'])||0}`;
  }));
  // Extract CL record IDs from existing VS+G ramp records (stored as CL:recXXX in Notes)
  const existingCLIds = new Set(existing
    .filter(e => e.fields['Ramp Category']==='VS + Groupage')
    .map(e => { const m=(e.fields['Notes']||'').match(/^CL:(rec[a-zA-Z0-9]+)/); return m?m[1]:''; })
    .filter(Boolean));

  const toCreate = [];

  // Helper: check both primary key AND client-based dedup
  function _shouldCreate(primaryKey, rec) {
    if (existingKeys.has(primaryKey)) return false;
    // Secondary dedup: client + type + pallets
    const f = rec.fields || rec;
    const client = f['Client Name'] || f['Supplier/Client'] || f['Client'] || '';
    const type = primaryKey.split('_')[1] || '';
    const pals = f['Total Pallets'] || f['Pallets'] || '';
    const clientKey = `${client}_${type}_${pals}`;
    if (existingClientKeys.has(clientKey)) return false;
    // Add to both sets to prevent within-batch duplicates
    existingKeys.add(primaryKey);
    existingClientKeys.add(clientKey);
    return true;
  }

  // ── 1. ORDERS (International) ──────────────────────────────
  // VF Export: Loading Date = today → Outbound
  // VF Import: Delivery Date = today → Inbound
  // VS Export: Loading Date = yesterday (today = Loading+1) → Outbound
  // VS Import: Delivery Date = tomorrow (today = Delivery-1) → Inbound

  // Single combined ORDERS query — reduces 4 parallel calls → 1 call
  // Fetches all orders that touch today's ramp (VF or VS, export or import)
  const intlCombinedFilter = `OR(AND(NOT({Veroia Switch }),{Direction}='Export',IS_SAME({Loading DateTime},'${date}','day')),AND(NOT({Veroia Switch }),{Direction}='Import',IS_SAME({Delivery DateTime},'${date}','day')),AND({Veroia Switch },{Direction}='Export',IS_SAME({Loading DateTime},'${prevDay}','day')),AND({Veroia Switch },{Direction}='Import',IS_SAME({Delivery DateTime},'${nextDay}','day')))`;

  const intlFields = ['Direction','Veroia Switch','Loading DateTime','Delivery DateTime',
    'Goods','Temperature °C','Total Pallets','Client','Truck','Trailer','Driver',
    'Loading Location 1','Loading Location 2','Loading Location 3',
    'Unloading Location 1','Unloading Location 2','Unloading Location 3',
    'ORDER STOPS'];

  const allIntl = await atGetAll(TABLES.ORDERS, {filterByFormula:intlCombinedFilter, fields:intlFields}, false).catch(()=>[]);

  // Batch-fetch ORDER_STOPS for all fetched orders (via reverse-link IDs)
  const allStopIds = allIntl.flatMap(r => r.fields['ORDER STOPS'] || []);
  let allStopsMap = {};
  if (allStopIds.length) {
    try {
      const stopFilter = `OR(${allStopIds.slice(0, 100).map(id => `RECORD_ID()="${id}"`).join(',')})`;
      const allStops = await atGetAll(TABLES.ORDER_STOPS, { filterByFormula: stopFilter }, false);
      // Group by parent order ID
      for (const s of allStops) {
        const parentId = (s.fields[F.STOP_PARENT_ORDER] || [])[0];
        if (!parentId) continue;
        if (!allStopsMap[parentId]) allStopsMap[parentId] = [];
        allStopsMap[parentId].push(s);
      }
    } catch(e) { console.warn('Ramp: ORDER_STOPS batch fetch failed:', e); }
  }
  // Attach stops to order records for _rampBuildRecord
  allIntl.forEach(r => { r._stops = allStopsMap[r.id] || []; });

  // Split results client-side into the 4 categories
  const vfExp = allIntl.filter(r => !r.fields['Veroia Switch'] && r.fields['Direction']==='Export');
  const vfImp = allIntl.filter(r => !r.fields['Veroia Switch'] && r.fields['Direction']==='Import');
  const vsExp = allIntl.filter(r => r.fields['Veroia Switch']  && r.fields['Direction']==='Export');
  const vsImp = allIntl.filter(r => r.fields['Veroia Switch']  && r.fields['Direction']==='Import');

  // VF Export → Outbound
  vfExp.forEach(r => {
    const key = `${r.id}_Φόρτωση_Vermion Fresh`;
    if (!_shouldCreate(key, r)) return;
    toCreate.push(_rampBuildRecord(r, 'Φόρτωση', 'Vermion Fresh', date, false));
  });

  // VF Import → Inbound
  vfImp.forEach(r => {
    const key = `${r.id}_Παραλαβή_Vermion Fresh`;
    if (!_shouldCreate(key, r)) return;
    toCreate.push(_rampBuildRecord(r, 'Παραλαβή', 'Vermion Fresh', date, false));
  });

  // VS Export → Outbound (date = loading+1)
  vsExp.forEach(r => {
    const key = `${r.id}_Φόρτωση_VS Simple`;
    if (!_shouldCreate(key, r)) return;
    toCreate.push(_rampBuildRecord(r, 'Φόρτωση', 'VS Simple', date, true));
  });

  // VS Import → Inbound (date = delivery-1)
  vsImp.forEach(r => {
    const key = `${r.id}_Παραλαβή_VS Simple`;
    if (!_shouldCreate(key, r)) return;
    toCreate.push(_rampBuildRecord(r, 'Παραλαβή', 'VS Simple', date, true));
  });

  // ── 2+3. NATIONAL LOADS + CONS_LOADS in parallel ──────────────
  const natFilter = `AND(
    {Source Type}='Direct',
    OR(IS_SAME({Loading DateTime},'${date}','day'),IS_SAME({Delivery DateTime},'${date}','day'))
  )`;
  const natFields = ['Direction','Loading DateTime','Delivery DateTime',
    'Goods','Temperature C','Total Pallets','Client','Truck','Driver',
    'Pickup Location 1','Pickup Location 2','Pickup Location 3',
    'Delivery Location 1','Delivery Location 2','Delivery Location 3',
    'Source Type'];
  const clFilter = `IS_SAME({Loading DateTime},'${date}','day')`;
  const clFields = ['Loading DateTime','Goods','Temperature C','Total Pallets','Client',
    'Truck','Trailer','Driver','Name','Groupage ID','Source Orders',
    'Pallets 1','Pallets 2','Pallets 3','Pallets 4','Pallets 5',
    'Pallets 6','Pallets 7','Pallets 8','Pallets 9','Pallets 10',
    'Loading Location 1','Loading Location 2','Loading Location 3','Loading Location 4','Loading Location 5',
    'Delivery Location 1','Delivery Location 2','Delivery Location 3'];

  const [natOrders, consLoads] = await Promise.all([
    atGetAll(TABLES.NAT_LOADS, {filterByFormula:natFilter, fields:natFields}, false).catch(()=>[]),
    atGetAll(TABLES.CONS_LOADS, {filterByFormula:clFilter, fields:clFields}, false).catch(()=>[]),
  ]);

  natOrders.forEach(r => {
    const f = r.fields;
    const isLoading = f['Loading DateTime'] && toLocalDate(f['Loading DateTime']) === date;
    const type = isLoading ? 'Παραλαβή' : 'Φόρτωση';
    const key = `${r.id}_${type}_`;
    if (!_shouldCreate(key, r)) return;

    const rec = {
      'Plan Date': date,
      'Type': type,
      'Status': 'Προγραμματισμένο',
      'Goods': f['Goods'] || '',
      'Pallets': f['Total Pallets'] || 0,
      'Supplier/Client': f['Client'] || '—',
    };
    if (f['Temperature C']) rec['Temperature'] = String(f['Temperature C']);
    if (f['Truck']?.length) rec['Truck'] = [f['Truck'][0]?.id || f['Truck'][0]];
    if (f['Driver']?.length) rec['Driver'] = [f['Driver'][0]?.id || f['Driver'][0]];
    rec['Loading Points'] = _rampResolveStops(f, 'Pickup Location', 3);
    rec['Delivery Points'] = _rampResolveStops(f, 'Delivery Location', 3);
    toCreate.push(rec);
  });

  // ── 3. CONS_LOADS → Inbound (VS + Groupage) — already fetched above ──

  // Deduplicate VS+G records by CL record ID (stored in Notes as CL:recXXX)
  // Also keep string-based fallback for legacy records without CL: prefix
  const existingVSG = existing.filter(e=>e.fields['Ramp Category']==='VS + Groupage');
  const existingVSGClients = new Set(existingVSG.map(e=>e.fields['Supplier/Client']||'').filter(Boolean));

  // Pre-fetch ALL source order IDs from all CLs in one batch
  const allSrcIds = new Set();
  consLoads.forEach(r => {
    (r.fields['Source Orders']||[]).forEach(o => { const id = o?.id||o; if(id) allSrcIds.add(id); });
  });
  const srcOrderMap = {};
  if (allSrcIds.size) {
    const srcFilter = `OR(${[...allSrcIds].map(id=>`RECORD_ID()="${id}"`).join(',')})`;
    const srcRecs = await atGetAll(TABLES.NAT_ORDERS, {
      filterByFormula: srcFilter,
      fields: ['Client','Pickup Location 1','Pallets','Temperature °C','Reference']
    }, false).catch(()=>[]);
    srcRecs.forEach(r => { srcOrderMap[r.id] = r; });
  }

  for (const r of consLoads) {
    const f = r.fields;
    const clName = f['Name']||'';
    // Build supplier string first for dedup check
    const srcIds = (f['Source Orders']||[]).map(o=>o?.id||o).filter(Boolean);
    let supplierLines = [];
    srcIds.forEach((sid, i) => {
      const srcRec = srcOrderMap[sid];
      if (!srcRec) return;
      const sf = srcRec.fields||{};
      const clientId = Array.isArray(sf['Client']) ? sf['Client'][0] : sf['Client'];
      const clientRec = clientId ? RAMP.clients.find(c=>c.id===clientId) : null;
      const clientName = clientRec ? (clientRec.fields['Company Name']||clientId) : (clientId||'—');
      // Use CL's Loading Location N (per-stop) instead of source NO's Pickup Location 1
      const clLocArr = f[`Loading Location ${i+1}`];
      const locId = clLocArr?.length ? (clLocArr[0]?.id||clLocArr[0]) : null;
      const locRec = locId ? RAMP.locs.find(l=>l.id===locId) : null;
      const locName = locRec ? (locRec.fields['Name']||locRec.fields['City']||'') : '';
      const pal = f[`Pallets ${i+1}`] || sf['Pallets'] || 0;
      const temp = sf['Temperature °C'] != null ? sf['Temperature °C']+'°C' : '';
      const ref = sf['Reference'] || '';
      supplierLines.push({client:clientName, location:locName, pallets:pal, temp:temp, ref:ref});
    });
    const supplierStr = supplierLines.map(s=>s.client).filter(Boolean).join(' / ') || clName;
    // Dedup by CL record ID (reliable) + string fallback for legacy records
    if (existingCLIds.has(r.id)) continue;
    if (existingVSGClients.has(supplierStr)) continue;

    const rec = {
      'Plan Date': date,
      'Type': 'Παραλαβή',
      'Status': 'Προγραμματισμένο',
      'Ramp Category': 'VS + Groupage',
      'Is Veroia Switch': true,
      'Goods': f['Goods'] || '',
      'Pallets': f['Total Pallets'] || 0,
      'Supplier/Client': supplierStr || clName,
      'Notes': `CL:${r.id}`,
    };
    // Write per-stop structured fields (up to 5)
    supplierLines.slice(0, 5).forEach((s, idx) => {
      const n = idx + 1;
      rec[`Stop Client ${n}`]   = s.client || '';
      rec[`Stop Location ${n}`] = s.location || '';
      rec[`Stop Pallets ${n}`]  = s.pallets || 0;
      rec[`Stop Temp ${n}`]     = s.temp || '';
      rec[`Stop Ref ${n}`]      = s.ref || '';
    });
    if (f['Temperature C']) rec['Temperature'] = String(f['Temperature C']);
    if (f['Truck']?.length) rec['Truck'] = [f['Truck'][0]?.id || f['Truck'][0]];
    if (f['Driver']?.length) rec['Driver'] = [f['Driver'][0]?.id || f['Driver'][0]];
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
  const validNatIds = new Set(natOrders.map(r=>r.id));  // now from NAT_LOADS
  const validCLIds = new Set(consLoads.map(r=>r.id));

  // NOTE: No orphan cleanup — records are preserved once created.
  // Users manage records via Done/Postpone buttons.
  // Only skip creating duplicates (via existingKeys check above).

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

  // Resolve locations — try ORDER_STOPS first, then flat fields, then Summary
  const stops = orderRec._stops || [];
  if (stops.length) {
    rec['Loading Points'] = _rampResolveFromStops(stops, 'Loading');
    rec['Delivery Points'] = _rampResolveFromStops(stops, 'Unloading');
  } else {
    rec['Loading Points'] = _rampResolveStops(f, 'Loading Location', 5) || (f['Loading Summary']||'').split(',')[0].trim();
    rec['Delivery Points'] = _rampResolveStops(f, 'Unloading Location', 5) || (f['Delivery Summary']||'').split(',')[0].trim();
  }
  return rec;
}

/** Resolve location names from ORDER_STOPS records */
function _rampResolveFromStops(stops, stopType) {
  return stops
    .filter(s => s.fields[F.STOP_TYPE] === stopType)
    .sort((a, b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0))
    .map(s => {
      const locArr = s.fields[F.STOP_LOCATION];
      const id = Array.isArray(locArr) ? locArr[0] : null;
      if (!id) return '';
      const loc = RAMP.locs.find(r => r.id === id);
      return loc ? (loc.fields['Name'] || loc.fields['City'] || '') : '';
    })
    .filter(Boolean).join(' / ') || '';
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

/* ── HELPERS (using shared data-helpers.js) ───────────────────── */
const _rTruck=f=>getTruckPlate(getLinkedId(f['Truck']))||'';
const _rDriver=f=>getDriverName(getLinkedId(f['Driver']))||'';
const _rResolveClientStr=str=>resolveClientStr(str);
function _rCat(f){
  const c=f['Ramp Category']||'',vs=f['Is Veroia Switch'];
  if(c==='Vermion Fresh')return'<span class="vs-badge vf">VF</span>';
  if(c==='VS + Groupage')return'<span class="vs-badge vsg">VS+G</span>';
  if(c==='VS Simple'||vs)return'<span class="vs-badge vs">VS</span>';
  return '';
}

/* ── DRAW ─────────────────────────────────────────────────────── */
function _rampDraw() {
  const today=localToday();
  const tmrw=localTomorrow();
  const fD=d=>{try{const p=d.split('-');return`${p[2]}/${p[1]}/${p[0]}`;}catch{return d;}};

  const inb=RAMP.records.filter(r=>r.fields['Type']==='Παραλαβή');
  const out=RAMP.records.filter(r=>r.fields['Type']==='Φόρτωση');
  const inPal=inb.reduce((s,r)=>s+(r.fields['Pallets']||0),0);
  const outPal=out.reduce((s,r)=>s+(r.fields['Pallets']||0),0);
  const net=inPal-outPal;
  const total=RAMP.records.length;
  const done=RAMP.records.filter(r=>r.fields['Status']==='Ολοκληρώθηκε'||r.fields['Status']==='Done').length;
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
        <button class="btn btn-ghost" onclick="_rampPrint()">Print</button>
        <button class="btn btn-ghost" onclick="renderDailyRamp()">Refresh</button>
      </div>
    </div>
    <div class="ramp-toolbar">
      <button class="ramp-day-btn ${RAMP.date===today?'active':''}" onclick="_rampSD('${today}')">Today</button>
      <button class="ramp-day-btn ${RAMP.date===tmrw?'active':''}" onclick="_rampSD('${tmrw}')">Tomorrow</button>
      <input type="date" class="ramp-date-inp" value="${RAMP.date}" onchange="_rampSD(this.value)">
    </div>
    <div class="ramp-kpis">
      <div class="ramp-kpi"><div class="ramp-kpi-lbl">Inbound Today</div>
        <div><span class="ramp-kpi-val" style="color:#059669">+${inPal}</span><span class="ramp-kpi-sub">pal</span></div></div>
      <div class="ramp-kpi"><div class="ramp-kpi-lbl">Outbound Today</div>
        <div><span class="ramp-kpi-val" style="color:#0EA5E9">-${outPal}</span><span class="ramp-kpi-sub">pal</span></div></div>
      <div class="ramp-kpi"><div class="ramp-kpi-lbl">Net Today</div>
        <div><span class="ramp-kpi-val" style="color:${net>=0?'#059669':'#EF4444'}">${net>=0?'+':''}${net}</span><span class="ramp-kpi-sub">pal</span></div></div>
      <div class="ramp-kpi"><div class="ramp-kpi-lbl">Stock Total</div>
        <div><span class="ramp-kpi-val" style="color:#D97706">${stockPal}</span><span class="ramp-kpi-sub">pal</span></div></div>
      <div class="ramp-kpi"><div class="ramp-kpi-lbl">Progress</div>
        <div><span class="ramp-kpi-val" style="color:${total?Math.round(done/total*100)>=80?'#10B981':'#0284C7':'#F1F5F9'}">${total?Math.round(done/total*100):0}%</span><span class="ramp-kpi-sub">${done}/${total}</span></div></div>
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

    ${(RAMP.postponed||[]).length?`<div style="margin-top:16px">
      <div class="ramp-sec-hd" style="background:#92400E"><span>⏩ Postponed from today</span><span style="opacity:.5">${RAMP.postponed.length}</span></div>
      <table class="ramp-t"><thead><tr>
        <th>#</th><th>Type</th><th>Client</th><th>Goods</th><th>Temp</th><th>Pallets</th><th>Moved to</th><th>Actions</th>
      </tr></thead><tbody>${RAMP.postponed.map((r,i)=>{
        const f=r.fields;
        const isIn=f['Type']==='Παραλαβή';
        const movedTo=f['Plan Date']?f['Plan Date'].substring(5).replace('-','/'):'—';
        return`<tr style="background:#FEF3C7;opacity:.8">
          <td class="rn">${i+1}</td>
          <td>${isIn?'<span style="color:#059669">↓ IN</span>':'<span style="color:#0EA5E9">↑ OUT</span>'}</td>
          <td>${_rResolveClientStr(f['Supplier/Client']||'—')}</td>
          <td>${escapeHtml((f['Goods']||'').substring(0,25))}</td>
          <td>${escapeHtml(f['Temperature']||'')}</td>
          <td>${escapeHtml(f['Pallets']||'')}</td>
          <td>${movedTo}</td>
          <td><button class="btn btn-primary" style="padding:3px 8px;font-size:10px" onclick="if(confirm('Restore to today?'))_rampRestore('${r.id}')">Restore</button></td>
        </tr>`;}).join('')}</tbody></table>
    </div>`:''}

    <div style="margin-top:16px">
      <div class="ramp-sec-hd stock"><span>📦 Stock — In Warehouse</span><span style="opacity:.5">${stockPal} pal</span></div>
      <table class="ramp-t"><thead><tr><th>#</th><th>Client</th><th>Pallets</th><th>Received</th><th>Days</th></tr></thead>
      <tbody>${Object.keys(sbc).length?Object.keys(sbc).sort().map((cl,i)=>{
        const d=sbc[cl],dates=d.items.map(r=>r.fields['Plan Date']).filter(Boolean).sort(),
          oldest=dates[0]||'',days=oldest?Math.floor((Date.now()-new Date(oldest).getTime())/864e5):0,
          dc=days<=1?'fresh':days<=3?'aging':'old';
        return`<tr><td class="rn">${i+1}</td><td class="stock-client">${escapeHtml(cl)}</td><td>${d.pal}</td><td>${oldest?oldest.substring(5):''}</td><td class="stock-days ${dc}">${days}d</td></tr>`;
      }).join(''):'<tr class="ramp-empty"><td colspan="5">Warehouse empty</td></tr>'}</tbody></table>
    </div>`;
}

/* ── TABLE ROW ────────────────────────────────────────────────── */
function _rRow(rec,num,tOpts) {
  const f=rec.fields,id=rec.id;
  const status=f['Status']||'';
  const isDone=status==='✅ Έγινε';
  const rawTime=f['Time']||'';
  const time=rawTime.includes('T')?rawTime.split('T')[1]?.substring(0,5)||'':rawTime;
  const client=f['Supplier/Client']||'—';
  const goods=escapeHtml((f['Goods']||'').substring(0,35));
  const temp=escapeHtml(f['Temperature']||f['Temperature °C']||'');
  const pal=escapeHtml(f['Pallets']||'');
  const truck=escapeHtml(_rTruck(f));
  const isIn=f['Type']==='Παραλαβή';

  const timeSel=`<select class="tinp" onchange="_rampSvTime('${id}',this.value)"><option value="">--:--</option>${tOpts.map(t=>`<option value="${t}"${time===t?' selected':''}>${t}</option>`).join('')}</select>`;
  const acts=isDone?'<span style="color:var(--success);font-size:11px">✓ Done</span>'
    :`<button class="btn btn-success" style="padding:4px 12px;font-size:11px" onclick="if(confirm('Mark as ${isIn?'Done':'Loaded'}?'))_rampDone('${id}','${isIn}')">${isIn?'Done':'Loaded'}</button> <button class="btn btn-ghost" style="padding:4px 12px;font-size:11px" onclick="if(confirm('Postpone?'))_rampPostpone('${id}')">Postpone</button>`;

  // CL sub-rows: parse Notes for supplier breakdown
  const notes = f['Notes']||'';
  const isVSG = (f['Ramp Category']||'')==='VS + Groupage';
  const clientDisplay = _rResolveClientStr(isVSG && client.includes(' | ')
    ? client.split(' | ').slice(1).join(' / ')
    : client);

  // Sub-rows for VS+G consolidated loads — read from structured Stop fields
  let subHtml = '';
  if (isVSG) {
    const stops = [];
    for (let si = 1; si <= 5; si++) {
      const sc = f[`Stop Client ${si}`];
      if (!sc) break;
      stops.push({
        client: sc,
        loc: f[`Stop Location ${si}`] || '',
        pal: f[`Stop Pallets ${si}`] || 0,
        temp: f[`Stop Temp ${si}`] || '',
        ref: f[`Stop Ref ${si}`] || '',
      });
    }
    // Fallback: parse Notes for legacy records without Stop fields
    if (!stops.length && notes) {
      notes.split('\n').filter(l => l && !l.startsWith('CL:')).forEach(line => {
        const p = line.split(' | ');
        stops.push({ client: p[0]?.trim()||'', loc: p[1]?.trim()||'', pal: p[2]||'', temp: p[3]||'', ref: p[4]||'' });
      });
    }
    subHtml = stops.map(s => `<tr class="sub-row">
      <td></td><td></td>
      <td style="padding-left:18px">↳ ${escapeHtml(s.client)}</td>
      <td>${escapeHtml(s.loc)}</td>
      <td>${escapeHtml(s.ref)}</td>
      <td>${escapeHtml(s.temp)}</td>
      <td>${typeof s.pal==='number' ? s.pal+' pal' : escapeHtml(s.pal)}</td>
      <td></td><td></td></tr>`).join('');
  }

  const locField = escapeHtml(isIn ? (f['Loading Points']||'') : (f['Delivery Points']||''));

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

  const tlLoc = escapeHtml(isIn ? (f['Loading Points']||'') : (f['Delivery Points']||''));
  return`<tr class="${isDone?'done':''}">
    <td>${f['Time']?.includes('T')?f['Time'].split('T')[1]?.substring(0,5):(f['Time']||'—')}</td><td>${typeBadge}</td>
    <td class="trn">${_rResolveClientStr(f['Supplier/Client']||'—')}</td>
    <td class="trn">${tlLoc||'—'}</td>
    <td class="trn">${escapeHtml((f['Goods']||'').substring(0,35))}</td>
    <td>${escapeHtml(f['Temperature']||f['Temperature °C']?((f['Temperature']||f['Temperature °C'])+'°C'):'')}</td>
    <td>${escapeHtml(f['Pallets']||'')}</td>
    <td>${escapeHtml(_rTruck(f)||'—')}</td><td>${escapeHtml(_rDriver(f)||'—')}</td>
    <td>${statusTxt}</td></tr>`;
}

/* ── ACTIONS ──────────────────────────────────────────────────── */
function _rampSD(d){RAMP.date=d;renderDailyRamp();}
async function _rampSvF(id,fld,v){try{await atSafePatch(TABLES.RAMP,id,{[fld]:v||null});const r=RAMP.records.find(x=>x.id===id);if(r)r.fields[fld]=v;if(fld==='Time')_rampRender();toast(v?'✓':'—');}catch(e){toast('Error','danger');}}
async function _rampSvTime(id,v){
  // Save time as plain "HH:MM" string — NOT ISO datetime
  try{await atSafePatch(TABLES.RAMP,id,{'Time': v || null});
    const r=RAMP.records.find(x=>x.id===id);if(r)r.fields['Time']=v||'';
    // Re-sort and re-draw
    RAMP.records.sort((a,b)=>(a.fields['Time']||'ZZ').localeCompare(b.fields['Time']||'ZZ'));
    _rampDraw();
  }catch(e){toast('Error','danger');}
}

async function _rampDone(id,isIn){
  const fields={'Status':'✅ Έγινε'};
  if(isIn==='true') fields['Stock Status']='In Stock';
  try{await atSafePatch(TABLES.RAMP,id,fields);invalidateCache(TABLES.RAMP);toast('Done ✓');renderDailyRamp();}catch(e){toast('Error','danger');}
}

async function _rampRestore(id){
  try{await atSafePatch(TABLES.RAMP,id,{'Plan Date':RAMP.date,'Postponed To':null});
    invalidateCache(TABLES.RAMP);toast('Restored ✓');renderDailyRamp();}catch(e){toast('Error','danger');}
}
async function _rampPostpone(id){
  const tmrw=toLocalDate(new Date(new Date(RAMP.date+'T12:00:00').getTime()+864e5));
  try{await atSafePatch(TABLES.RAMP,id,{'Plan Date':tmrw,'Postponed To':RAMP.date});
    invalidateCache(TABLES.RAMP);toast('Postponed → '+tmrw);renderDailyRamp();}catch(e){toast('Error','danger');}
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

function _rampPrint() {
  const content = document.getElementById('content').innerHTML;
  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Daily Ramp Board — Vermion Fresh</title>
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family:'DM Sans',sans-serif; padding:20px; color:#0F172A; font-size:12px; }
      .page-title { font-family:'Syne',sans-serif; font-size:18px; font-weight:700; }
      .page-sub { font-size:11px; color:#475569; margin-bottom:12px; }
      .ramp-kpis { display:flex; gap:10px; margin-bottom:14px; }
      .ramp-kpi { border:1px solid #ddd; border-left:3px solid #0EA5E9; border-radius:6px; padding:10px 14px; flex:1; }
      .ramp-kpi-lbl { font-size:9px; font-weight:600; color:#9CA3AF; text-transform:uppercase; letter-spacing:1px; }
      .ramp-kpi-val { font-family:'Syne',sans-serif; font-size:22px; font-weight:700; }
      .ramp-kpi-sub { font-size:10px; color:#9CA3AF; }
      .ramp-pair { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px; }
      .ramp-sec-hd { background:#0B1929; color:#C4CFDB; padding:6px 12px; border-radius:6px 6px 0 0;
        font-family:'Syne',sans-serif; font-size:9px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase;
        display:flex; justify-content:space-between; }
      .ramp-sec-hd.inbound { border-left:3px solid #059669; }
      .ramp-sec-hd.outbound { border-left:3px solid #0EA5E9; }
      .ramp-sec-hd.timeline { border-left:3px solid #6B7280; }
      .ramp-sec-hd.stock { border-left:3px solid #D97706; }
      table { width:100%; border-collapse:collapse; border:1px solid #ddd; border-top:none; }
      thead th { padding:6px 8px; font-size:8px; font-weight:600; letter-spacing:.8px; text-transform:uppercase;
        color:#9CA3AF; background:#F0F5FA; border-bottom:1px solid #ddd; text-align:left; }
      tbody td { padding:6px 8px; font-size:11px; border-bottom:1px solid #eee; }
      .sub-row td { font-size:10px; color:#475569; background:#FAFBFC; }
      .rn { font-family:'Syne',sans-serif; font-weight:700; color:#9CA3AF; }
      .btn, select.tinp, .ramp-toolbar, .ramp-day-btn, .ramp-date-inp { display:none !important; }
      .tl-type { font-size:7px; font-weight:800; padding:1px 4px; border-radius:2px; color:#fff; }
      .tl-type.in { background:#059669; } .tl-type.out { background:#0EA5E9; }
      .vs-badge { font-size:7px; font-weight:800; padding:1px 4px; border-radius:2px; border:1px solid; }
      .vs-badge.vf { color:#059669; border-color:#059669; } .vs-badge.vs { color:#0EA5E9; border-color:#0EA5E9; }
      .vs-badge.vsg { color:#7C3AED; border-color:#7C3AED; }
      .stock-days.fresh { color:#059669; } .stock-days.aging { color:#D97706; } .stock-days.old { color:#DC2626; }
      @media print { body { padding:10px; } }
    </style></head><body>${content}</body></html>`);
  win.document.close();
  setTimeout(()=>win.print(), 500);
}

// Expose functions used from onclick/onchange handlers
window.renderDailyRamp = renderDailyRamp;
window._rampAddNew = _rampAddNew;
window._rampPrint = _rampPrint;
window._rampSD = _rampSD;
window._rampRestore = _rampRestore;
window._rampDone = _rampDone;
window._rampPostpone = _rampPostpone;
window._rampSaveNew = _rampSaveNew;
window._rampSvF = _rampSvF;
window._rampSvTime = _rampSvTime;
})();
