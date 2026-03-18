// ═══════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL — production scale (35-55 exports/week)
// UX: compact rows, sticky header, shelf with search,
//     assignment panel opens inline on row click
// ═══════════════════════════════════════════════════════════════

const WINTL = {
  week: _wiCurrentWeek(),
  exports: [], imports: [],
  rows: [],           // [{id,exportIds[],importId,truckId,trailerId,driverId,partnerId,carrierType,saved,open}]
  importShelf: [],
  trucks:[], trailers:[], drivers:[], partners:[],
  assetsLoaded: false,
  _rc: 0,
  _shelfFilter: '',
  trips: [],
};

// ── Badge / sdrop styles injected once ─────────
(function(){
  if(document.getElementById('wi-styles')) return;
  const s=document.createElement('style');
  s.id='wi-styles';
  s.textContent=`
    .wi-badge{display:inline-block;font-size:8px;font-weight:700;letter-spacing:1px;
      text-transform:uppercase;padding:1px 5px;border-radius:3px;vertical-align:middle}
    .wi-badge-vx{background:rgba(99,102,241,0.1);color:rgba(99,102,241,0.9);border:1px solid rgba(99,102,241,0.2)}
    .wi-badge-gr{background:rgba(59,130,246,0.1);color:rgba(59,130,246,0.9);border:1px solid rgba(59,130,246,0.2)}
    .wi-badge-ok{background:rgba(5,150,105,0.12);color:rgba(5,150,105,0.9);border:1px solid rgba(5,150,105,0.2)}
    .wi-sdrop{position:relative;display:inline-block}
    .wi-sdrop-input:focus{border-color:var(--accent)!important}
    .wi-sdrop-opt:hover{background:var(--bg-hover)}
  `;
  document.head.appendChild(s);
})();


function _wiCurrentWeek() {
  const d=new Date(), y=d.getFullYear();
  return Math.ceil(((d-new Date(y,0,1))/86400000+new Date(y,0,1).getDay()+1)/7);
}
function _wiWeekRange(w) {
  const y=new Date().getFullYear(), jan1=new Date(y,0,1);
  const base=new Date(jan1.getTime()+(w-1)*7*86400000), day=base.getDay();
  const mon=new Date(base); mon.setDate(base.getDate()-(day===0?6:day-1));
  const sun=new Date(mon);  sun.setDate(mon.getDate()+6);
  const f=d=>d.toLocaleDateString('el-GR',{day:'numeric',month:'short'});
  return `${f(mon)} – ${f(sun)}`;
}

async function _wiLoadAssets() {
  if (WINTL.assetsLoaded) return;
  const [trucks,trailers,drivers,partners]=await Promise.all([
    atGetAll(TABLES.TRUCKS,  {fields:['License Plate'],filterByFormula:"{Active}=TRUE()"}),
    atGetAll(TABLES.TRAILERS,{fields:['Plate']}),
    atGetAll(TABLES.DRIVERS, {fields:['Full Name'],     filterByFormula:"{Active}=TRUE()"}),
    atGetAll(TABLES.PARTNERS,{fields:['Company Name']}),
  ]);
  WINTL.trucks   = trucks.map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
  WINTL.trailers = trailers.map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
  WINTL.drivers  = drivers.map(r=>({id:r.id,label:r.fields['Full Name']||r.id}));
  WINTL.partners = partners.map(r=>({id:r.id,label:r.fields['Company Name']||r.id}));
  WINTL.assetsLoaded=true;
}

// ────────────────────────────────────────────────────────────────
async function renderWeeklyIntl() {
  if (can('planning')==='none') { document.getElementById('content').innerHTML = showAccessDenied(); return; }
  document.getElementById('topbarTitle').textContent = `Weekly International — Week ${WINTL.week}`;
  document.getElementById('content').innerHTML = `<div class="loading"><span class="spinner"></span> Loading week ${WINTL.week}…</div>`;
  try {
    await _wiLoadAssets();
    // Fetch ORDERS + TRIPS in parallel
    const [allOrders, allTrips] = await Promise.all([
      atGetAll(TABLES.ORDERS, {filterByFormula:`AND({Type}='International',{ Week Number}=${WINTL.week})`}),
      atGetAll(TABLES.TRIPS,  {filterByFormula:`{Week Number}=${WINTL.week}`,
        fields:['Export Order','Import Order','Truck','Trailer','Driver','Partner',
                'Truck Plate','Trailer Plate','Driver Name','Partner Name',
                'Export Loading DateTime',
                'Week Number','TripID','Is Partner Trip',
                'Partner Rate Export','Partner Rate Import']}),
    ]);
    WINTL.exports = allOrders.filter(r=>r.fields.Direction==='Export')
      .sort((a,b)=>(a.fields['Loading DateTime']||'').localeCompare(b.fields['Loading DateTime']||''));
    WINTL.imports = allOrders.filter(r=>r.fields.Direction==='Import');
    WINTL.trips   = allTrips;
    _wiBuildRows();
    _wiRender();
  } catch(e) {
    document.getElementById('content').innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
  }
}

function _wiBuildRows() {
  WINTL.rows=[]; WINTL._rc=0;
  const usedExp=new Set(), usedImp=new Set();
  const trips = WINTL.trips || [];

  // ── Build rows from TRIPS table (source of truth) ──────────────
  trips.forEach(trip=>{
    const f = trip.fields;
    const expIds        = (f['Export Order'] || []);
    const impId         = (f['Import Order'] || [])[0] || null;
    const truckId       = (f['Truck']   || [])[0] || '';
    const trailerId     = (f['Trailer'] || [])[0] || '';
    const driverId      = (f['Driver']  || [])[0] || '';
    const partnerId     = (f['Partner'] || [])[0] || '';
    const isPartner     = !!(f['Is Partner Trip'] || partnerId);
    const partnerRateExp= f['Partner Rate Export'] ? String(f['Partner Rate Export']) : '';
    const partnerRateImp= f['Partner Rate Import'] ? String(f['Partner Rate Import']) : '';
    const tripNo        = f['TripID'] ? String(f['TripID']) : '';
    // Lookup display values (arrays → first element)
    const truckPlate    = (f['Truck Plate']   || [])[0] || '';
    const trailerPlate  = (f['Trailer Plate'] || [])[0] || '';
    const driverName    = (f['Driver Name']   || [])[0] || '';
    const partnerName   = (f['Partner Name']  || [])[0] || '';
    const loadingDate   = (f['Export Loading DateTime'] || [])[0] || '';

    expIds.forEach(id=>usedExp.add(id));
    if (impId) usedImp.add(impId);

    WINTL.rows.push({
      id: ++WINTL._rc,
      tripRecId: trip.id,
      tripNo,
      exportIds: expIds,
      importId:  impId,
      truckId, trailerId, driverId, partnerId,
      truckPlate, trailerPlate, driverName, partnerName,
      loadingDate,
      carrierType: isPartner ? 'partner' : 'owned',
      partnerRateExp, partnerRateImp,
      saved: true,
      open: false,
    });
  });

  // ── Unassigned exports → 1 row each ────────────────────────────
  WINTL.exports.filter(r=>!usedExp.has(r.id)).forEach(r=>{
    WINTL.rows.push({
      id: ++WINTL._rc,
      tripRecId: null, tripNo: '',
      exportIds: [r.id], importId: null,
      truckId:'', trailerId:'', driverId:'', partnerId:'',
      truckPlate:'', trailerPlate:'', driverName:'', partnerName:'',
      loadingDate:'',
      carrierType: 'owned', partnerRateExp:'', partnerRateImp:'',
      saved: false, open: false,
    });
  });

  // ── Unmatched imports → shelf ───────────────────────────────────
  WINTL.importShelf = WINTL.imports.filter(r=>!usedImp.has(r.id));
}

// ────────────────────────────────────────────────────────────────
function _wiRender() {
  const R=WINTL.rows, IS=WINTL.importShelf;
  const expN=WINTL.exports.length, impN=WINTL.imports.length;
  const onTrip=R.filter(r=>r.saved).length, pending=R.filter(r=>!r.saved).length;
  const unmatched=IS.length;

  // shelf filter
  const sf=(WINTL._shelfFilter||'').toLowerCase();
  const shelfVisible=sf ? IS.filter(r=>{
    const s=r.fields['Loading Summary']||''+r.fields['Delivery Summary']||'';
    return s.toLowerCase().includes(sf);
  }) : IS;

  document.getElementById('content').innerHTML = `
    <!-- ── HEADER ── -->
    <div class="page-header" style="margin-bottom:12px">
      <div>
        <div class="page-title">Weekly International</div>
        <div class="page-sub" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:3px">
          <span>Week ${WINTL.week} · ${_wiWeekRange(WINTL.week)}</span>
          <span style="color:var(--success)">${expN} exp</span>
          <span style="color:rgba(217,119,6,0.9)">${impN} imp</span>
          <span style="color:var(--text-dim)">${onTrip} on trip · ${pending} pending</span>
          ${unmatched?`<span style="color:rgba(217,119,6,0.9)">${unmatched} imports unmatched</span>`:'<span style="color:var(--success)">all imports matched ✓</span>'}
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="renderWeeklyIntl()">↺ Refresh</button>
      </div>
    </div>

    <!-- ── WEEK NAV ── -->
    <div style="display:flex;align-items:center;justify-content:center;gap:20px;margin-bottom:14px">
      <button class="btn btn-ghost" style="padding:5px 18px" onclick="_wiNavWeek(-1)">← Prev</button>
      <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700">Week ${WINTL.week}</div>
      <button class="btn btn-ghost" style="padding:5px 18px" onclick="_wiNavWeek(1)">Next →</button>
    </div>

    <!-- ── IMPORT SHELF ── -->
    <div style="margin-bottom:12px;background:var(--bg-card);border:1px solid rgba(217,119,6,0.2);border-radius:10px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid rgba(217,119,6,0.1)">
        <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(217,119,6,0.85)">
          IMPORT SHELF ${IS.length?`(${IS.length})`:'— all matched ✓'}
        </span>
        ${IS.length>5?`
        <input type="text" placeholder="search imports…" value="${WINTL._shelfFilter}"
               oninput="WINTL._shelfFilter=this.value;_wiRenderShelf()"
               style="margin-left:auto;padding:4px 10px;font-size:11px;border-radius:6px;
                      border:1px solid var(--border);background:var(--bg);color:var(--text);
                      width:160px;outline:none"/>` :''}
      </div>
      <div id="wi_shelf" style="padding:${IS.length?'10px 12px':'6px 14px'};min-height:${IS.length?'52px':'0'}">
        ${IS.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:7px">${shelfVisible.map(r=>_wiShelfChip(r)).join('')}</div>`
          : `<div style="font-size:12px;color:var(--text-dim);padding:3px 0">No unmatched imports this week</div>`}
      </div>
    </div>

    <!-- ── MAIN TABLE ── -->
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">

      <!-- sticky header -->
      <div style="display:grid;grid-template-columns:36px 1fr 24px 200px 1fr;
                  background:var(--bg);border-bottom:2px solid var(--border);
                  position:sticky;top:0;z-index:10">
        <div style="padding:9px 0 9px 12px;border-right:1px solid var(--border);font-size:10px;color:var(--text-dim)">#</div>
        <div style="padding:9px 14px;border-right:1px solid var(--border)">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:var(--success)">EXPORT</span>
          <span style="font-size:10px;color:var(--text-dim);margin-left:8px">right-click to group</span>
        </div>
        <div style="border-right:1px solid var(--border)"></div>
        <div style="padding:9px 10px;border-right:1px solid var(--border);text-align:center">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:var(--text-dim)">Assignment</span>
        </div>
        <div style="padding:9px 14px">
          <span style="font-size:10px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:rgba(217,119,6,0.85)">IMPORT</span>
          <span style="font-size:10px;color:var(--text-dim);margin-left:8px">drag from shelf</span>
        </div>
      </div>

      ${R.length ? _wiRenderRows(R) : `<div class="empty-state" style="padding:60px"><p>No exports this week</p></div>`}
    </div>

    <!-- context menu -->
    <div id="wi_ctx" style="display:none;position:fixed;z-index:9999"></div>
  `;

  window._wiDragging=null;
}

// Partial re-render for shelf only (typing in search)
function _wiRenderShelf() {
  const sf=(WINTL._shelfFilter||'').toLowerCase();
  const IS=WINTL.importShelf;
  const vis=sf?IS.filter(r=>{
    const s=(r.fields['Loading Summary']||'')+(r.fields['Delivery Summary']||'');
    return s.toLowerCase().includes(sf);
  }):IS;
  const el=document.getElementById('wi_shelf');
  if (!el) return;
  el.innerHTML=IS.length
    ?`<div style="display:flex;flex-wrap:wrap;gap:7px">${vis.map(r=>_wiShelfChip(r)).join('')}</div>`
    :`<div style="font-size:12px;color:var(--text-dim);padding:3px 0">No unmatched imports</div>`;
}

// ────────────────────────────────────────────────────────────────
// TABLE ROW
// ────────────────────────────────────────────────────────────────
function _wiRow(row, i) {
  const exps=row.exportIds.map(id=>WINTL.exports.find(r=>r.id===id)).filter(Boolean);
  const imp=row.importId?WINTL.imports.find(r=>r.id===row.importId):null;
  const isGroupage=exps.length>1;
  const isSaved=row.saved;
  const isAssigned=!isSaved&&(row.truckId||row.partnerId);

  // Status dot
  const dotColor=isSaved?'var(--success)':isAssigned?'var(--accent)':'var(--warning)';

  // Row background: saved=light green, assigned=light blue, empty=default
  const rowBg=isSaved?'background:rgba(5,150,105,0.06)'
             :isAssigned?'background:rgba(59,130,246,0.04)':'';

  // ── Export cell content ──────────────────────────
  const expSummary=exps.map(r=>{
    const loading  = _wiClean(r.fields['Loading Summary']||'—');
    const delivery = _wiClean(r.fields['Delivery Summary']||'—');
    const pals     = r.fields['Total Pallets']||0;
    const loadDt   = _wiFmt(r.fields['Loading DateTime']);
    const veroia   = r.fields['Veroia Switch '];
    // badges
    const badges=[
      veroia  ? `<span class="wi-badge wi-badge-vx">VEROIA</span>`:'' ,
      isGroupage&&exps.length>1 ? '' : '',  // groupage shown at row level
    ].filter(Boolean).join('');
    return `<div style="padding:${isGroupage?'2px 0':'0'};display:flex;align-items:baseline;flex-wrap:wrap;gap:0">
      <span style="font-size:11px;font-weight:600;color:var(--text)">${loading}</span>
      <span style="font-size:11px;color:var(--text-dim);margin:0 5px">→</span>
      <span style="font-size:11px;color:var(--text-dim)">${delivery}</span>
      <span style="font-size:10px;color:var(--text-mid);margin-left:8px">${pals} pal</span>
      <span style="font-size:10px;color:var(--text-mid);margin-left:6px">load. ${loadDt}</span>
      ${veroia?`<span class="wi-badge wi-badge-vx" style="margin-left:6px">VEROIA</span>`:''}
    </div>`;
  }).join('');

  // Row-level badges
  const rowBadges=[
    isGroupage?`<span class="wi-badge wi-badge-gr">GROUPAGE ×${exps.length}</span>`:'',
  ].filter(Boolean).join('');

  // ── Assignment badge (compact) ──────────────────
  const _partnerLabel = row.partnerId ? WINTL.partners.find(p=>p.id===row.partnerId)?.label?.substring(0,16)||'Partner' : null;
  const _truckLabel   = row.truckId   ? WINTL.trucks.find(t=>t.id===row.truckId)?.label||'—' : null;
  const assignBadge=isSaved
    ?`<span class="wi-badge wi-badge-ok">TRIP ${row.tripNo||''}</span>`
    :(row.partnerId
      ?`<div style="text-align:center;line-height:1.3">
          <div style="font-size:10px;font-weight:600;color:var(--accent)">${_partnerLabel}</div>
          ${row.partnerCost?`<div style="font-size:9px;color:var(--text-mid)">€${Number(row.partnerCost).toLocaleString('el-GR')}</div>`:''}
        </div>`
      :(row.truckId
        ?`<span style="font-size:10px;color:var(--text-mid)">${_truckLabel}</span>`
        :`<span style="font-size:10px;color:var(--warning);letter-spacing:0.3px">UNASSIGNED</span>`));

  // ── Import cell ──────────────────────────────────
  const hasImp=!!imp;
  const impBg=hasImp?'background:rgba(217,119,6,0.04)':'background:rgba(0,0,0,0.015)';
  const impContent=hasImp?`
    <div draggable="true" data-impid="${imp.id}" ondragstart="_wiDragImport(event,'${imp.id}')"
         style="cursor:grab">
      <div style="font-size:11px;font-weight:600;color:var(--text)">${_wiClean(imp.fields['Loading Summary']||'—')}</div>
      <div style="font-size:10px;color:var(--text-dim)">→ ${_wiClean(imp.fields['Delivery Summary']||'—')} · ${imp.fields['Total Pallets']||0} pal</div>
      <div style="font-size:10px;color:var(--text-mid)">load. ${_wiFmt(imp.fields['Loading DateTime'])} · del. ${_wiFmt(imp.fields['Delivery DateTime'])}</div>
    </div>`
    :`<span style="font-size:10px;color:var(--border-dark,#cbd5e1);letter-spacing:0.5px">— empty —</span>`;

  const expandedPanel=row.open?_wiAssignPanel(row):'';

  return `
  <div id="wi_row_${row.id}" style="${rowBg};border-top:1px solid var(--border)">
    <div style="display:grid;grid-template-columns:36px 1fr 24px 200px 1fr;min-height:34px;cursor:context-menu"
         oncontextmenu="_wiCtxMenu(event,${row.id})">

      <!-- # + dot -->
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  padding:5px 0;border-right:1px solid var(--border);gap:3px">
        <div style="width:7px;height:7px;border-radius:50%;background:${dotColor};flex-shrink:0"></div>
        <span style="font-size:9px;color:var(--text-dim)">${i+1}</span>
      </div>

      <!-- Export -->
      <div style="padding:6px 12px;border-right:1px solid var(--border);display:flex;align-items:center">
        <div style="flex:1">
          ${rowBadges?`<div style="margin-bottom:3px">${rowBadges}</div>`:''}
          ${expSummary}
        </div>
      </div>

      <!-- Toggle -->
      <div style="display:flex;align-items:center;justify-content:center;border-right:1px solid var(--border);cursor:pointer"
           onclick="_wiToggleRow(${row.id})">
        <span style="font-size:13px;color:var(--text-dim);display:inline-block;
                     transform:rotate(${row.open?'90deg':'0deg'});transition:transform 0.15s">›</span>
      </div>

      <!-- Assignment -->
      <div style="padding:5px 10px;border-right:1px solid var(--border);background:var(--bg);
                  display:flex;align-items:center;justify-content:center;cursor:pointer"
           onclick="_wiToggleRow(${row.id})">
        ${assignBadge}
      </div>

      <!-- Import drop zone -->
      <div id="wi_imp_${row.id}" style="padding:6px 12px;transition:background 0.12s;${impBg};
           display:flex;align-items:center"
           ondragover="event.preventDefault();_wiImpHover(${row.id},true)"
           ondragleave="_wiImpHover(${row.id},false)"
           ondrop="_wiDropImport(event,${row.id})">
        ${impContent}
      </div>
    </div>

    ${row.open?`
    <div style="border-top:1px solid var(--border);background:var(--bg);padding:10px 12px 12px;
                display:grid;grid-template-columns:36px 1fr">
      <div></div><div class="wi-panel">${expandedPanel}</div>
    </div>`:''}
  </div>`;
}


// ── Assignment Panel (inline expanded) ─────────
function _wiAssignPanel(row) {
  const isPartner = row.carrierType === 'partner';
  // Searchable dropdown builder
  const sdrop = (id, arr, val, ph) => {
    const selLabel = arr.find(x=>x.id===val)?.label || '';
    const opts = arr.map(x=>{
      const lbl = (x.label||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');
      return `<div class="wi-sdrop-opt" data-id="${x.id}" data-lbl="${lbl}"
        style="padding:6px 10px;font-size:11px;cursor:pointer;color:var(--text)">${lbl}</div>`;
    }).join('');
    return `
      <div class="wi-sdrop" id="wsd_${id}" data-field-id="${id}">
        <input type="text" class="wi-sdrop-input" placeholder="${ph}"
               value="${selLabel.replace(/"/g,'&quot;')}"
               oninput="_wiSDropFilter('${id}',this.value)"
               onfocus="_wiSDropOpen('${id}')"
               autocomplete="off"
               style="width:190px;padding:5px 8px;font-size:11px;border-radius:6px;
                      border:1px solid var(--border);background:var(--bg);color:var(--text);outline:none"/>
        <input type="hidden" id="wsd_val_${id}" value="${val}"/>
        <div id="wsd_list_${id}" class="wi-sdrop-list" style="display:none;position:fixed;z-index:9999;
             width:220px;max-height:200px;overflow-y:auto;background:var(--bg-card);
             border:1px solid var(--border);border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.15)">
          ${opts}
        </div>
      </div>`;
  };

  const carrierSection = !isPartner ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      <div>
        <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
                    color:var(--text-dim);margin-bottom:3px">Truck</div>
        ${sdrop('tk_'+row.id, WINTL.trucks,   row.truckId,   'Truck plate')}
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
                    color:var(--text-dim);margin-bottom:3px">Trailer</div>
        ${sdrop('tl_'+row.id, WINTL.trailers, row.trailerId, 'Trailer plate')}
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
                    color:var(--text-dim);margin-bottom:3px">Driver</div>
        ${sdrop('dr_'+row.id, WINTL.drivers,  row.driverId,  'Driver name')}
      </div>
    </div>` : `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      <div>
        <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
                    color:var(--text-dim);margin-bottom:3px">Partner</div>
        ${sdrop('pt_'+row.id, WINTL.partners, row.partnerId, 'Partner name')}
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
                    color:var(--text-dim);margin-bottom:3px">Rate Export (€)</div>
        <input type="number" placeholder="0.00" value="${row.partnerRateExp||''}"
               oninput="_wiRowField(${row.id},'partnerRateExp',this.value)"
               style="width:100px;padding:5px 8px;font-size:11px;border-radius:6px;
                      border:1px solid var(--border);background:var(--bg);color:var(--text);outline:none"/>
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
                    color:var(--text-dim);margin-bottom:3px">Rate Import (€)</div>
        <input type="number" placeholder="0.00" value="${row.partnerRateImp||''}"
               oninput="_wiRowField(${row.id},'partnerRateImp',this.value)"
               style="width:100px;padding:5px 8px;font-size:11px;border-radius:6px;
                      border:1px solid var(--border);background:var(--bg);color:var(--text);outline:none"/>
      </div>
    </div>`;

  return `
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start">
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;
                    color:var(--text-mid);padding-top:18px">
        <input type="checkbox" ${isPartner?'checked':''} onchange="_wiRowCarrier(${row.id},this.checked)">
        Partner trip
      </label>
      ${carrierSection}
      ${can('planning')==='full'?`
      <div style="display:flex;flex-direction:column;gap:4px;padding-top:18px">
        <button class="btn btn-primary" style="font-size:11px;padding:5px 16px"
                onclick="_wiCreateTrip(${row.id})">Create Trip</button>
        <button class="btn btn-ghost" style="font-size:10px;padding:4px 16px"
                onclick="_wiCreateTrip(${row.id},true)">Export only</button>
      </div>`:''}
    </div>`;
}

// ── Searchable dropdown helpers ─────────────────
// Use event delegation — no inline onclick on options (avoids quote escaping issues)
document.addEventListener('click', function(e) {
  // Option pick
  const opt = e.target.closest('.wi-sdrop-opt');
  if (opt) {
    const list = opt.closest('.wi-sdrop-list');
    if (!list) return;
    const id = list.id.replace('wsd_list_','');
    const recId = opt.dataset.id;
    const label = opt.dataset.lbl || opt.textContent.trim();
    _wiSDropPick(id, recId, label);
    e.stopPropagation();
    return;
  }
  // Click outside — close all dropdowns
  if (!e.target.closest('.wi-sdrop')) {
    document.querySelectorAll('.wi-sdrop-list').forEach(el=>el.style.display='none');
  }
});

function _wiSDropOpen(id) {
  document.querySelectorAll('.wi-sdrop-list').forEach(el=>{
    if(el.id !== 'wsd_list_'+id) el.style.display='none';
  });
  const inp = document.querySelector('#wsd_'+id+' .wi-sdrop-input');
  const list = document.getElementById('wsd_list_'+id);
  if(!inp||!list) return;
  const rect = inp.getBoundingClientRect();
  list.style.cssText = `display:block;position:fixed;z-index:9999;
    left:${rect.left}px;top:${rect.bottom+2}px;
    width:${Math.max(rect.width,220)}px;max-height:200px;overflow-y:auto;
    background:var(--bg-card);border:1px solid var(--border);
    border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.15)`;
  list.querySelectorAll('.wi-sdrop-opt').forEach(el=>el.style.display='');
}
function _wiSDropFilter(id, q) {
  const list=document.getElementById('wsd_list_'+id);
  if(!list||list.style.display==='none') _wiSDropOpen(id);
  const ql=q.toLowerCase();
  list.querySelectorAll('.wi-sdrop-opt').forEach(el=>{
    el.style.display=(el.dataset.lbl||el.textContent).toLowerCase().includes(ql)?'':'none';
  });
}
function _wiSDropPick(id, recId, label) {
  const valEl=document.getElementById('wsd_val_'+id);
  if(valEl) valEl.value=recId;
  const inp=document.querySelector('#wsd_'+id+' .wi-sdrop-input');
  if(inp) inp.value=label;
  const list=document.getElementById('wsd_list_'+id);
  if(list) list.style.display='none';
  const parts=id.split('_');
  const prefix=parts[0];
  const rowId=parseInt(parts[parts.length-1]);
  const fieldMap={tk:'truckId',tl:'trailerId',dr:'driverId',pt:'partnerId'};
  const field=fieldMap[prefix];
  if(field&&!isNaN(rowId)) _wiRowField(rowId, field, recId);
}


// ── Toggle row expand ──────────────────────────
function _wiToggleRow(rowId) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;
  row.open=!row.open;
  // Re-render just this row (performance: avoid full re-render)
  const el=document.getElementById('wi_row_'+rowId);
  if (!el) { _wiRender(); return; }
  const idx=WINTL.rows.findIndex(r=>r.id===rowId);
  el.outerHTML=_wiRow(row,idx);
}

// ── Shelf chip ─────────────────────────────────
function _wiShelfChip(r) {
  const f=r.fields;
  const loading=_wiClean(f['Loading Summary']||'—').substring(0,26);
  const delivery=_wiClean(f['Delivery Summary']||'—').substring(0,20);
  const pals=f['Total Pallets']||0;
  const delDt=_wiFmt(f['Delivery DateTime']);
  return `
    <div draggable="true" data-impid="${r.id}"
         ondragstart="_wiDragImport(event,'${r.id}')"
         style="background:rgba(217,119,6,0.06);border:1px solid rgba(217,119,6,0.22);
                border-radius:7px;padding:6px 10px;cursor:grab;min-width:140px;max-width:200px;
                transition:box-shadow 0.15s"
         onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'"
         onmouseout="this.style.boxShadow=''">
      <div style="font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${loading}</div>
      <div style="font-size:10px;color:var(--text-dim)">→ ${delivery}</div>
      <div style="font-size:10px;color:var(--text-mid);margin-top:2px">${pals} pal · del. ${delDt}</div>
    </div>`;
}

// ── Drag & Drop ────────────────────────────────
function _wiDragImport(e,impId) {
  window._wiDragging=impId;
  e.dataTransfer.effectAllowed='move';
}
function _wiImpHover(rowId,on) {
  const el=document.getElementById('wi_imp_'+rowId);
  if (el) el.style.background=on?'rgba(217,119,6,0.05)':'';
}
function _wiDropImport(e,rowId) {
  e.preventDefault();
  _wiImpHover(rowId,false);
  const impId=window._wiDragging;
  if (!impId) return;
  window._wiDragging=null;
  // remove from shelf and any other row
  WINTL.importShelf=WINTL.importShelf.filter(r=>r.id!==impId);
  WINTL.rows.forEach(r=>{ if(r.importId===impId) r.importId=null; });
  // swap if this row already has import
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;
  if (row.importId) {
    const old=WINTL.imports.find(r=>r.id===row.importId);
    if (old && !WINTL.importShelf.find(r=>r.id===old.id)) WINTL.importShelf.push(old);
  }
  row.importId=impId;
  _wiRender();
}

// ── Right-click context menu ───────────────────
function _wiCtxMenu(e,rowId) {
  e.preventDefault(); e.stopPropagation();
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;
  const isGroupage=row.exportIds.length>1;
  const others=WINTL.rows.filter(r=>r.id!==rowId&&r.exportIds.length>0&&!r.saved);

  const menuItems=[
    // Groupage section
    others.length?`<div style="padding:5px 12px 3px;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim)">GROUPAGE</div>`:'',
    ...others.slice(0,8).map(other=>{
      const exp=WINTL.exports.find(r=>r.id===other.exportIds[0]);
      const label=_wiClean(exp?.fields['Delivery Summary']||'Row '+other.id).substring(0,28);
      return ctxItem(`🔗 Group with: ${label}`,`_wiMergeRows(${rowId},${other.id})`);
    }),
    isGroupage?ctxItem('✂️ Split groupage',`_wiSplitRow(${rowId})`):'' ,
    // Divider
    `<div style="height:1px;background:var(--border);margin:4px 0"></div>`,
    // Import
    row.importId?ctxItem('✕ Remove import',`_wiRemoveImport(${rowId})`):'' ,
    // View
    ctxItem('↗ View export order',`_wiViewExport(${rowId})`),
    // Delete (only unsaved)
    !row.saved?`<div style="height:1px;background:var(--border);margin:4px 0"></div>`:'',
    !row.saved?ctxItem('🗑 Remove row',`_wiDeleteRow(${rowId})`,true):'',
  ].filter(Boolean).join('');

  const ctx=document.getElementById('wi_ctx');
  ctx.innerHTML=menuItems;
  ctx.style.cssText=`display:block;position:fixed;z-index:9999;
    left:${Math.min(e.clientX,window.innerWidth-210)}px;
    top:${Math.min(e.clientY,window.innerHeight-260)}px;
    background:var(--bg-card);border:1px solid var(--border);
    border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);
    min-width:210px;overflow:hidden;padding:5px 0`;

  ctx.querySelectorAll('.ctx-item').forEach(el=>{
    el.style.cssText='padding:7px 14px;font-size:12px;cursor:pointer;color:var(--text);transition:background 0.1s;display:block;width:100%;text-align:left;background:none;border:none';
    el.onmouseover=()=>el.style.background='var(--bg-hover)';
    el.onmouseout =()=>el.style.background='';
    if(el.dataset.danger) el.style.color='var(--danger)';
  });
  setTimeout(()=>document.addEventListener('click',_wiCloseCtx,{once:true}),10);
}
function ctxItem(label,action,danger=false) {
  return `<button class="ctx-item" ${danger?'data-danger="1"':''} onclick="${action};_wiCloseCtx()">${label}</button>`;
}
function _wiCloseCtx() {
  const ctx=document.getElementById('wi_ctx');
  if (ctx) ctx.style.display='none';
}

// ── Groupage ───────────────────────────────────
function _wiMergeRows(rowId,otherId) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  const other=WINTL.rows.find(r=>r.id===otherId);
  if (!row||!other) return;
  other.exportIds.forEach(id=>{ if(!row.exportIds.includes(id)) row.exportIds.push(id); });
  if (!row.importId && other.importId) row.importId=other.importId;
  else if (other.importId && row.importId!==other.importId) {
    const imp=WINTL.imports.find(r=>r.id===other.importId);
    if (imp&&!WINTL.importShelf.find(r=>r.id===imp.id)) WINTL.importShelf.push(imp);
  }
  WINTL.rows=WINTL.rows.filter(r=>r.id!==otherId);
  _wiRender(); toast('Grouped ✓');
}
function _wiSplitRow(rowId) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row||row.exportIds.length<=1) return;
  const [first,...rest]=row.exportIds;
  row.exportIds=[first];
  rest.forEach(expId=>WINTL.rows.push({id:++WINTL._rc,exportIds:[expId],importId:null,
    truckId:'',trailerId:'',driverId:'',partnerId:'',carrierType:'owned',partnerRateExp:'',partnerRateImp:'',saved:false,open:false}));
  _wiRender(); toast('Split ✓');
}
function _wiDeleteRow(rowId) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;
  if (row.importId) {
    const imp=WINTL.imports.find(r=>r.id===row.importId);
    if (imp&&!WINTL.importShelf.find(r=>r.id===imp.id)) WINTL.importShelf.push(imp);
  }
  WINTL.rows=WINTL.rows.filter(r=>r.id!==rowId);
  _wiRender();
}
function _wiRemoveImport(rowId) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row||!row.importId) return;
  const imp=WINTL.imports.find(r=>r.id===row.importId);
  if (imp&&!WINTL.importShelf.find(r=>r.id===imp.id)) WINTL.importShelf.push(imp);
  row.importId=null; _wiRender();
}
function _wiViewExport(rowId) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (row?.exportIds?.[0]) {
    navigate('orders_intl');
    setTimeout(()=>{ if(typeof showIntlDetail==='function') showIntlDetail(row.exportIds[0]); },600);
  }
}

// ── Row fields ─────────────────────────────────
function _wiRowField(rowId,field,val) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (row) row[field]=val;
}
function _wiRowCarrier(rowId,isPartner) {
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;
  row.carrierType=isPartner?'partner':'owned';
  // Re-render only the panel section, not the whole row
  const panelEl=document.querySelector('#wi_row_'+rowId+' .wi-panel');
  if (panelEl) panelEl.innerHTML=_wiAssignPanel(row);
}

// ── Navigation ─────────────────────────────────
function _wiNavWeek(delta) {
  WINTL.week=Math.max(1,Math.min(52,WINTL.week+delta));
  WINTL.assetsLoaded=true; renderWeeklyIntl();
}

// ── Create Trip ────────────────────────────────
async function _wiCreateTrip(rowId,exportOnly=false) {
  // Sync any searchable dropdown values into row state before saving
  const row0=WINTL.rows.find(r=>r.id===rowId);
  if (row0) {
    const sync=(prefix,field)=>{
      const el=document.getElementById('wsd_val_'+prefix+'_'+rowId);
      if(el&&el.value) row0[field]=el.value;
    };
    sync('tk','truckId'); sync('tl','trailerId'); sync('dr','driverId'); sync('pt','partnerId');
    const costEls=document.querySelectorAll('#wi_row_'+rowId+' input[type=number]');
    if(costEls[0]&&costEls[0].value) row0.partnerRateExp=costEls[0].value;
    if(costEls[1]&&costEls[1].value) row0.partnerRateImp=costEls[1].value;
  }
  const row=WINTL.rows.find(r=>r.id===rowId);
  if (!row) return;
  const isPartner=row.carrierType==='partner';
  if (!row.exportIds.length) { toast('Δεν υπάρχει Export'); return; }
  if (isPartner&&!row.partnerId) { toast('Επίλεξε Partner'); return; }
  // Partial save allowed — no strict truck/trailer/driver check

  const btn=event?.target;
  if (btn) { btn.disabled=true; btn.textContent='Creating…'; }
  try {
    const fields={
      'Export Order': row.exportIds,
      'Week Number':  WINTL.week,
    };
    if (!exportOnly && row.importId) fields['Import Order'] = [row.importId];
    if (isPartner) {
      if (row.partnerId)    fields['Partner']            = [row.partnerId];
      if (row.partnerRateExp) fields['Partner Rate Export'] = parseFloat(row.partnerRateExp)||0;
      if (row.partnerRateImp) fields['Partner Rate Import'] = parseFloat(row.partnerRateImp)||0;
      fields['Is Partner Trip'] = true;
    } else {
      if (row.truckId)    fields['Truck']   = [row.truckId];
      if (row.trailerId)  fields['Trailer'] = [row.trailerId];
      if (row.driverId)   fields['Driver']  = [row.driverId];
    }
    await atCreate(TABLES.TRIPS, fields);
    toast(exportOnly?'Export-only trip created ✓':'Trip created ✓');
    WINTL.assetsLoaded=true; await renderWeeklyIntl();
  } catch(e) {
    alert('Error: '+e.message);
    if(btn){btn.disabled=false;btn.textContent='🔗 Create Trip';}
  }
}

// ── Helpers ────────────────────────────────────
function _wiFmt(s){if(!s)return'—';const p=s.split('-');return`${p[2]}/${p[1]}`;}
function _wiClean(s){return(s||'').replace(/^['"]+/,'').replace(/\/+$/,'').trim();}

// ── Render rows with date separator bars ────────
function _wiRenderRows(rows) {
  let lastDate = null;
  let html = '';
  rows.forEach((row, i) => {
    // Get delivery date from first export
    const exp = WINTL.exports.find(r => r.id === row.exportIds[0]);
    // For saved trips use the lookup date; for unsaved use order field
    const delDate = row.loadingDate
                 || exp?.fields['Loading DateTime']
                 || exp?.fields['Delivery DateTime']
                 || null;
    const delDateFmt = delDate ? _wiFullDate(delDate) : null;

    // Date separator bar
    if (delDateFmt && delDateFmt !== lastDate) {
      lastDate = delDateFmt;
      html += `
        <div style="display:grid;grid-template-columns:36px 1fr 24px 200px 1fr;background:var(--bg);
                    border-top:${i===0?'none':'2px solid var(--border-dark, #d1d5db)'}">
          <div style="border-right:1px solid var(--border)"></div>
          <div colspan="4" style="padding:5px 14px;grid-column:2/-1;
               border-bottom:1px solid var(--border)">
            <span style="font-size:10px;font-weight:700;letter-spacing:1.2px;
                         text-transform:uppercase;color:var(--text-mid)">${delDateFmt}</span>
          </div>
        </div>`;
    }
    html += _wiRow(row, i);
  });
  return html;
}

function _wiFullDate(s) {
  if (!s) return null;
  try {
    return new Date(s).toLocaleDateString('el-GR', {weekday:'short', day:'numeric', month:'long'});
  } catch { return s; }
}
