// ═══════════════════════════════════════════════════════════════
// DAILY OPS PLAN — v3.1
// Table-based spreadsheet layout — International ORDERS only
// Stacked: Export Load → Export Deliver → Import Load → Import Deliver
// ═══════════════════════════════════════════════════════════════
(function() {
'use strict';

const OPS = {
  date:'today', intl:[], trucks:[], drivers:[], locs:[], clients:[], overdue:[],
  // Filters: search text, direction, status
  filters: { q:'', direction:'', status:'' },
};

const OPS_FIELDS = [
  'Direction','Goods','Temperature °C','Total Pallets','Client',
  'Loading DateTime','Delivery DateTime','Status',
  'ORDER STOPS',
  'Delivery Performance','Ops Notes','Postponed To',
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
  catch(e) { document.getElementById('content').innerHTML = `<div style="color:var(--danger);padding:40px">Σφάλμα φόρτωσης σελίδας</div>`; console.error(e); }
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
  const ovF=`AND(IS_BEFORE({Delivery DateTime},TODAY()),OR({Status}='In Transit',{Status}='Assigned',{Status}='Pending',{Status}=''))`;
  const [intl,ov] = await Promise.all([
    atGetAll(TABLES.ORDERS,{filterByFormula:dayF,fields:OPS_FIELDS},false),
    OPS.date==='today'?atGetAll(TABLES.ORDERS,{filterByFormula:ovF,fields:OPS_FIELDS},false):[],
  ]);
  OPS.intl=intl;
  const ids=new Set(intl.map(r=>r.id));
  OPS.overdue=ov.filter(r=>!ids.has(r.id));

  // Batch fetch ORDER_STOPS for location resolution
  const allRecs = [...intl, ...OPS.overdue];
  const stopIds = allRecs.flatMap(r => r.fields['ORDER STOPS'] || []);
  OPS._stopsByOrder = {};
  if (stopIds.length) {
    try {
      for (let b = 0; b < stopIds.length; b += 90) {
        const batch = stopIds.slice(b, b + 90);
        const ff = `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(',')})`;
        const recs = await atGetAll(TABLES.ORDER_STOPS, { filterByFormula: ff }, false);
        recs.forEach(sr => {
          const pid = (sr.fields[F.STOP_PARENT_ORDER] || [])[0];
          if (pid) { if (!OPS._stopsByOrder[pid]) OPS._stopsByOrder[pid] = []; OPS._stopsByOrder[pid].push(sr); }
        });
      }
    } catch(e) { console.warn('DailyOps ORDER_STOPS fetch:', e); }
  }
}

// Get first location ID from ORDER_STOPS for a given order + stop type
function _opsStopLoc(orderId, stopType) {
  const stops = (OPS._stopsByOrder || {})[orderId];
  if (!stops) return null;
  const filtered = stops.filter(s => s.fields[F.STOP_TYPE] === stopType)
    .sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0));
  return filtered.length ? (filtered[0].fields[F.STOP_LOCATION] || [])[0] || null : null;
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
  // Apply user filters: text search, direction, status
  const q = (OPS.filters?.q||'').trim().toLowerCase();
  const dirFilter = (OPS.filters?.direction||'').toLowerCase();
  const statusFilter = OPS.filters?.status||'';
  for (const r of OPS.intl) {
    const f=r.fields;
    const dir=(f['Direction']||'').trim().toLowerCase();
    const isImp=dir==='import'||dir==='↓ import';

    // Direction filter
    if (dirFilter === 'import' && !isImp) continue;
    if (dirFilter === 'export' && isImp) continue;

    // Status filter (exact match)
    if (statusFilter && (f['Status']||'') !== statusFilter) continue;

    // Text search across client, truck, driver, location summaries
    if (q) {
      const clientName = _C(f) || '';
      const truckName = _T(f) || '';
      const driverName = _D(f) || '';
      const loadLoc = _L(_opsStopLoc(r.id, 'Loading')) || f['Loading Points'] || '';
      const delLoc  = _L(_opsStopLoc(r.id, 'Unloading')) || f['Delivery Points'] || '';
      const haystack = `${clientName} ${truckName} ${driverName} ${loadLoc} ${delLoc}`.toLowerCase();
      if (!haystack.includes(q)) continue;
    }

    const isL=_DM(f['Loading DateTime'],tgt);
    const isD=_DM(f['Delivery DateTime'],tgt);
    if(isImp){if(isL)c.il.push(r);if(isD)c.id.push(r);}
    else     {if(isL)c.el.push(r);if(isD)c.ed.push(r);}
  }
  return c;
}

// Update filter and re-draw — bound to onclick/oninput in toolbar
function _opsSetFilter(field, val) {
  if (!OPS.filters) OPS.filters = {};
  OPS.filters[field] = val;
  _opsDraw();
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
  const nDel=all.filter(r=>(r.fields['Status']||'')==='Delivered').length;
  const nLoad=all.filter(r=>(r.fields['Status']||'')==='In Transit').length;
  const nPend=total-nDel-nLoad;
  const chkF=['Docs Ready','Temp OK','CMR Photo Received','Client Notified','Driver Notified'];
  let tC=0,dC=0;all.forEach(r=>chkF.forEach(f=>{if(r.fields[f]!==undefined){tC++;if(r.fields[f])dC++;}}));

  // Per-direction completion
  const loadsAll = [...cats.el, ...cats.il];
  const delsAll  = [...cats.ed, ...cats.id];
  const loadsDone = loadsAll.filter(r=>['In Transit','Delivered'].includes(r.fields['Status']||'')).length;
  const delsDone  = delsAll.filter(r=>(r.fields['Status']||'')==='Delivered').length;
  const expAll = [...cats.el, ...cats.ed];
  const impAll = [...cats.il, ...cats.id];
  const expDone = expAll.filter(r=>(r.fields['Status']||'')==='Delivered').length;
  const impDone = impAll.filter(r=>(r.fields['Status']||'')==='Delivered').length;
  const overallPct = total ? Math.round(nDel/total*100) : 0;

  // ═══ COMMAND CENTER — computed action recommendations ═══
  const now = new Date();
  const nowH = now.getHours() + now.getMinutes()/60;
  const actions = [];
  if (isToday && total) {
    const _i = n => (typeof icon === 'function') ? icon(n, 14) : '';
    // Overdue unhandled
    if (OPS.overdue.length) actions.push({icon:_i('alert_circle'), sev:'crit', text:`${OPS.overdue.length} overdue deliveries awaiting confirmation`, scrollTo:'ovL'});

    // Loadings without truck/driver assigned
    const noAssign = loadsAll.filter(r => !_T(r.fields) || !_D(r.fields)).filter(r=>(r.fields['Status']||'')!=='Delivered' && (r.fields['Status']||'')!=='In Transit');
    if (noAssign.length) actions.push({icon:_i('user'), sev:'warn', text:`${noAssign.length} loading${noAssign.length>1?'s':''} without truck/driver assigned`});

    // Loadings without Docs Ready (pending status)
    const missingDocs = loadsAll.filter(r => !r.fields['Docs Ready'] && (r.fields['Status']||'')==='');
    if (missingDocs.length) actions.push({icon:_i('file_text'), sev:'warn', text:`${missingDocs.length} pending loading${missingDocs.length>1?'s':''} without Docs Ready`});

    // Deliveries in transit without CMR
    const missingCMR = delsAll.filter(r => (r.fields['Status']||'')==='In Transit' && !r.fields['CMR Photo Received']);
    if (missingCMR.length) actions.push({icon:_i('camera'), sev:'warn', text:`${missingCMR.length} in-transit deliver${missingCMR.length>1?'ies':'y'} without CMR photo`});

    // Deliveries in transit without ETA
    const missingETA = delsAll.filter(r => (r.fields['Status']||'')==='In Transit' && !r.fields['ETA']);
    if (missingETA.length) actions.push({icon:_i('clock'), sev:'warn', text:`${missingETA.length} in-transit deliver${missingETA.length>1?'ies':'y'} without ETA`});

    // Pending deliveries that are still not delivered after noon
    if (nowH > 14 && nPend > 0) {
      const pendDels = delsAll.filter(r => (r.fields['Status']||'')!=='Delivered').length;
      if (pendDels > 0) actions.push({icon:_i('clock'), sev:'warn', text:`Afternoon — ${pendDels} delivery${pendDels>1?'ies':''} still not confirmed`});
    }

    // All good
    if (!actions.length && total > 0) {
      if (nDel === total) actions.push({icon:_i('party'), sev:'ok', text:'All orders delivered — day complete!'});
      else if (loadsDone === loadsAll.length && delsDone < delsAll.length) actions.push({icon:_i('check_circle'), sev:'ok', text:'All loadings done — waiting on deliveries'});
      else actions.push({icon:_i('check'), sev:'ok', text:'No pending actions — all under control'});
    }
  }

  // Overdue
  let ovH='';
  if(isToday&&OPS.overdue.length){
    ovH=`<div class="ops-alert">
      <button type="button" class="ops-alert-hdr" aria-expanded="false" aria-controls="ovL"
        style="width:100%;background:none;border:0;font:inherit;color:inherit;cursor:pointer;text-align:left"
        onclick="_opsToggleOverdue(this)">
        <div class="ops-alert-txt">⚠ ${OPS.overdue.length} παραγγελίες με εκκρεμή παράδοση</div>
        <div class="ops-alert-tog">▼ Εμφάνιση</div>
      </button>
      <div class="ops-alert-list" id="ovL">${OPS.overdue.map(r=>{const f=r.fields;
        return `<div class="ops-alert-row">
          <span class="ops-alert-info">${_L(_opsStopLoc(r.id,'Loading'))||'—'} → ${_L(_opsStopLoc(r.id,'Unloading'))||'—'}<span class="ops-alert-dt">${toLocalDate(f['Delivery DateTime'])}</span></span>
          <!-- ΠΡΟΣΟΧΗ: το δεύτερο όρισμα είναι ΥΠΟΧΡΕΩΤΙΚΟ εδώ. Η υπογραφή είναι
               _opsOvAct(id, perf='Delayed'), οπότε η κλήση χωρίς αυτό κατέγραφε
               ΚΑΘΥΣΤΕΡΗΣΗ ενώ το κουμπί έλεγε «Παραδόθηκε». Βλ. commit. -->
          <button class="ops-alert-btn ok" onclick="event.stopPropagation();_opsOvAct('${r.id}','On Time')">Παραδόθηκε</button>
          <button class="ops-alert-btn no" onclick="event.stopPropagation();_opsOvAct('${r.id}','Delayed')">Καθυστέρησε</button>
        </div>`;}).join('')}</div></div>`;
  }

  // Command Center HTML
  const sevColor = s => s==='crit'?'#DC2626':s==='warn'?'#D97706':s==='ok'?'#059669':'#0284C7';
  const sevBg = s => s==='crit'?'#FEE2E2':s==='warn'?'#FEF3C7':s==='ok'?'#D1FAE5':'#DBEAFE';
  const cmdCenterH = (isToday && total) ? `
    <div style="background:linear-gradient(135deg,#0B1929,#1E3A8A);color:#fff;padding:16px 20px;border-radius:10px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:14px">
          <!-- Circular completion ring -->
          <div style="position:relative;width:64px;height:64px">
            <svg width="64" height="64" viewBox="0 0 64 64" style="transform:rotate(-90deg)">
              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="6"/>
              <circle cx="32" cy="32" r="28" fill="none" stroke="#10B981" stroke-width="6"
                stroke-dasharray="${2*Math.PI*28}" stroke-dashoffset="${2*Math.PI*28*(1-overallPct/100)}" stroke-linecap="round"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Syne',sans-serif">
              <div style="font-size:18px;font-weight:700;line-height:1">${overallPct}%</div>
              <div style="font-size:9px;opacity:0.7;letter-spacing:0.5px">DONE</div>
            </div>
          </div>
          <div>
            <div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:700;letter-spacing:1px">COMMAND CENTER</div>
            <div style="font-size:12px;opacity:0.7;margin-top:2px">${nDel}/${total} παραδόθηκαν · ${nLoad} σε μεταφορά · ${nPend} σε αναμονή</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="display:flex;gap:16px;font-size:11px">
            <div><div style="opacity:0.6;font-size:9px;letter-spacing:0.5px">ΕΞΑΓΩΓΗ</div><div style="font-weight:700;font-size:14px">${expAll.length?Math.round(expDone/expAll.length*100):0}%</div></div>
            <div><div style="opacity:0.6;font-size:9px;letter-spacing:0.5px">ΕΙΣΑΓΩΓΗ</div><div style="font-weight:700;font-size:14px">${impAll.length?Math.round(impDone/impAll.length*100):0}%</div></div>
            <div><div style="opacity:0.6;font-size:9px;letter-spacing:0.5px">ΛΙΣΤΑ ΕΛΕΓΧΟΥ</div><div style="font-weight:700;font-size:14px">${tC?Math.round(dC/tC*100):0}%</div></div>
          </div>
        </div>
      </div>
      ${actions.length ? `<div style="display:flex;flex-direction:column;gap:6px">
        ${actions.map(a => `<div style="background:${sevBg(a.sev)};color:${sevColor(a.sev)};padding:8px 12px;border-radius:6px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:10px${a.scrollTo?';cursor:pointer':''}" ${a.scrollTo?`onclick="document.getElementById('${a.scrollTo}').style.display='flex';window.scrollTo({top:document.getElementById('${a.scrollTo}').offsetTop-80,behavior:'smooth'})"`:''}>
          <span style="font-size:16px">${a.icon}</span><span>${a.text}</span>
        </div>`).join('')}
      </div>` : ''}
    </div>` : '';

  const _opsI = (n, s) => (typeof icon === 'function') ? icon(n, s || 14) : '';
  document.getElementById('content').innerHTML=`
    <div class="page-header" style="margin-bottom:var(--space-4)">
      <div><div class="page-title">${_opsI('list_checks', 22)} Daily Ops Plan</div>
        <div class="page-sub">${fD(tgt)} · ${total} orders${isToday && OPS.overdue.length ? ` · <span style="color:#DC2626;font-weight:600">${OPS.overdue.length} overdue</span>` : ''}</div></div>
      <div style="display:flex;gap:var(--space-2);align-items:center">
        <button class="btn btn-primary btn-sm" onclick="_opsPrint()">${_opsI('file_text')} Print</button>
        <button class="btn btn-secondary btn-sm" onclick="renderDailyOps()">${_opsI('refresh')} Ανανέωση</button>
      </div>
    </div>
    <div class="ops-toolbar" style="flex-wrap:wrap;gap:8px;align-items:center">
      <button class="ops-day-btn ${isToday?'active':''}" onclick="OPS.date='today';renderDailyOps()">ΣΗΜΕΡΑ</button>
      <button class="ops-day-btn ${!isToday?'active':''}" onclick="OPS.date='tomorrow';renderDailyOps()">ΑΥΡΙΟ</button>
      <input type="text" class="filter-select" placeholder="Αναζήτηση πελάτη / φορτηγού / οδηγού / τοποθεσίας…"
        value="${OPS.filters?.q||''}"
        oninput="_opsSetFilter('q', this.value)"
        style="flex:1;min-width:200px;padding:0 12px;height:36px;border-radius:6px;border:1px solid var(--border);font-size:13px">
      <select class="filter-select" onchange="_opsSetFilter('direction', this.value)" style="height:36px">
        <option value="">Όλες οι κατευθύνσεις</option>
        <option value="export" ${OPS.filters?.direction==='export'?'selected':''}>Εξαγωγή</option>
        <option value="import" ${OPS.filters?.direction==='import'?'selected':''}>Εισαγωγή</option>
      </select>
      <select class="filter-select" onchange="_opsSetFilter('status', this.value)" style="height:36px">
        <option value="">Όλες οι καταστάσεις</option>
        <option value="Pending"    ${OPS.filters?.status==='Pending'?'selected':''}>Σε αναμονή</option>
        <option value="Assigned"   ${OPS.filters?.status==='Assigned'?'selected':''}>Ανατεθειμένο</option>
        <option value="In Transit" ${OPS.filters?.status==='In Transit'?'selected':''}>Σε μεταφορά</option>
        <option value="Delivered"  ${OPS.filters?.status==='Delivered'?'selected':''}>Παραδόθηκε</option>
      </select>
      ${(OPS.filters?.q||OPS.filters?.direction||OPS.filters?.status) ? `
        <button class="btn btn-ghost btn-sm" onclick="OPS.filters={q:'',direction:'',status:''};renderDailyOps()" style="height:36px">Καθαρισμός</button>
      ` : ''}
    </div>
    ${cmdCenterH}
    <div class="ops-kpis">
      <div class="ops-kpi"><div class="ops-kpi-label">Σε αναμονή</div>
        <div class="ops-kpi-row"><span class="ops-kpi-val" style="color:#F1F5F9">${total?nPend:'—'}</span></div></div>
      <div class="ops-kpi"><div class="ops-kpi-label">Φορτώσεις</div>
        <div class="ops-kpi-row"><span class="ops-kpi-val" style="color:#0284C7">${loadsAll.length?loadsDone:'—'}</span><span class="ops-kpi-sub">${loadsAll.length?'/ '+loadsAll.length:''}</span></div>
        <div class="ops-kpi-bar"><div class="ops-kpi-fill" style="width:${loadsAll.length?Math.round(loadsDone/loadsAll.length*100):0}%;background:#0284C7"></div></div></div>
      <div class="ops-kpi"><div class="ops-kpi-label">Παραδόσεις</div>
        <div class="ops-kpi-row"><span class="ops-kpi-val" style="color:var(--success)">${delsAll.length?delsDone:'—'}</span><span class="ops-kpi-sub">${delsAll.length?'/ '+delsAll.length:''}</span></div>
        <div class="ops-kpi-bar"><div class="ops-kpi-fill" style="width:${delsAll.length?Math.round(delsDone/delsAll.length*100):0}%;background:var(--success)"></div></div></div>
      <div class="ops-kpi"><div class="ops-kpi-label">Λίστα ελέγχου</div>
        <div class="ops-kpi-row"><span class="ops-kpi-val" style="color:var(--success)">${tC?dC:'—'}</span><span class="ops-kpi-sub">${tC?'/ '+tC:''}</span></div>
        <div class="ops-kpi-bar"><div class="ops-kpi-fill" style="width:${tC?Math.round(dC/tC*100):0}%;background:var(--success)"></div></div></div>
    </div>
    ${ovH}
    <div class="ops-sections">
      ${_opsUnifiedSection(cats, isToday)}
    </div>`;
}


/* ── ONE TABLE, FOUR KINDS OF ROW ──────────────────────────────────────
   The page used to render four tables with near-identical headers: Export
   Loadings, Export Deliveries, Import Loadings, Import Deliveries. 40+ header
   cells for what a dispatcher reads as one question — "what happens today, in
   what order". Now one table sorted by time, with the kind as a badge.

   The four tables had DIFFERENT columns, so this is a SUPERSET with empty
   cells, never a lowest common denominator: nothing that was visible before is
   gone. Pallets and the advance payment only ever applied to export loadings,
   so those cells stay blank on the other three kinds — blank means "does not
   apply here", which is exactly what four separate tables were expressing.

   DO-3: the five checkbox columns (Docs Ready, Temp OK, CMR, Client Notified,
   Driver Notified) collapse into ONE «ΕΛΕΓΧΟΙ» cell. They stay real
   checkboxes — a read-only "3/5" would have silently removed the ability to
   tick them off, which is most of what this page is for.
   See docs/design/DEEP_AUDIT_2026-08-04/daily_ops.md DO-2 / DO-3. */
const _OPS_KIND = {
  el: { badge: '↑ΕΞΦ', title: 'Φόρτωση εξαγωγής',  color: 'var(--accent)'  },
  ed: { badge: '↓ΕΞΠ', title: 'Παράδοση εξαγωγής', color: 'var(--success)' },
  il: { badge: '↑ΕΙΦ', title: 'Φόρτωση εισαγωγής',  color: 'var(--warning)' },
  id: { badge: '↓ΕΙΠ', title: 'Παράδοση εισαγωγής', color: 'var(--text-mid)' },
};

// Time used for ordering: the ETA the team set, else the planned datetime.
function _opsSortTime(rec, type) {
  const f = rec.fields;
  if (f['ETA']) return String(f['ETA']).slice(0,5);
  const src = (type === 'el' || type === 'il') ? f['Loading DateTime'] : f['Delivery DateTime'];
  if (src && String(src).includes('T')) return String(src).split('T')[1].slice(0,5);
  return 'ZZ';   // no time yet -> sorts last, never dropped
}

/** DO-8: το toggle ήταν inline χειραγώγηση DOM μέσα σε <div onclick> — μη
 *  προσβάσιμο και με την κατάσταση να ζει στο style attribute. */
function _opsToggleOverdue(btn) {
  const l = document.getElementById('ovL');
  if (!l) return;
  const willOpen = l.style.display !== 'flex';
  l.style.display = willOpen ? 'flex' : 'none';
  btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  const tog = btn.querySelector('.ops-alert-tog');
  if (tog) tog.textContent = willOpen ? '▲ Απόκρυψη' : '▼ Εμφάνιση';
}

function _opsUnifiedSection(cats, isToday) {
  const _opsI = (n,s) => (typeof icon === 'function') ? icon(n, s||14) : '';
  const rows = ['el','ed','il','id']
    .flatMap(k => cats[k].map(rec => ({ rec, kind: k, t: _opsSortTime(rec, k) })))
    .sort((a,b) => a.t.localeCompare(b.t));

  const head = isToday
    ? '<th>#</th><th class="c">ΤΥΠΟΣ</th><th>ΩΡΑ</th><th>ΠΕΛΑΤΗΣ</th><th>ΤΟΠΟΣ</th><th>ΦΟΡΤΗΓΟ</th><th>ΟΔΗΓΟΣ</th><th class="c">ΠΑΛΕΤΕΣ</th><th class="c">ΕΛΕΓΧΟΙ</th><th class="c">ΠΡΟΚΑΤΑΒΟΛΗ €</th><th>ΕΝΕΡΓΕΙΕΣ</th>'
    : '<th>#</th><th class="c">ΤΥΠΟΣ</th><th>ΩΡΑ</th><th>ΠΕΛΑΤΗΣ</th><th>ΤΟΠΟΣ</th><th>ΦΟΡΤΗΓΟ</th><th>ΟΔΗΓΟΣ</th><th class="c">ΕΛΕΓΧΟΙ</th><th>ΕΝΕΡΓΕΙΕΣ</th>';
  const cols = isToday ? 11 : 9;

  const body = rows.length
    ? rows.map((r,i) => _opsUnifiedRow(r.rec, i+1, r.kind, isToday, r.t)).join('')
    : `<tr><td colspan="${cols}" style="padding:0">${typeof showEmpty === 'function' ? showEmpty({
        illustration: 'truck',
        title: isToday ? 'Καμία κίνηση σήμερα' : 'Καμία κίνηση αύριο',
        description: 'Οι φορτώσεις και οι παραδόσεις της ημέρας θα εμφανίζονται εδώ, ταξινομημένες κατά ώρα.',
      }) : '<div style="text-align:center;padding:40px;color:var(--text-dim)">Καμία παραγγελία</div>'}</td></tr>`;

  // Same wrapper the four sections used (.ops-sec-hd + .ops-t). The horizontal
  // scroll is inline because 11 columns are wider than the old 9 — no new class,
  // no new token.
  return `<div>
    <div class="ops-sec-hd el"><span>${_opsI('list_checks',14)} ΚΙΝΗΣΕΙΣ ΤΗΣ ΗΜΕΡΑΣ</span><span style="opacity:.5">${rows.length}</span></div>
    <div style="overflow-x:auto"><table class="ops-t"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
  </div>`;
}

function _opsUnifiedRow(rec, num, kind, isToday, tSort) {
  const f = rec.fields, id = rec.id;
  const isL = kind === 'el' || kind === 'il';
  const isExp = kind === 'el' || kind === 'ed';
  const k = _OPS_KIND[kind];
  const client = _C(f);
  const place = isL ? _L(_opsStopLoc(id,'Loading')) : _L(_opsStopLoc(id,'Unloading'));
  const truck = _T(f), driver = _D(f), partner = _P(f);
  const st = f['Status'] || '';
  const isDone = st === 'Delivered', isInTransit = st === 'In Transit';
  const isPostponed = !!f['Postponed To'] && !isDone && !isInTransit;

  const chk = (fld, lbl) => `<label title="${lbl}" style="display:inline-flex;align-items:center;gap:2px;font-size:10px;color:var(--text-dim)">
    <input type="checkbox" ${f[fld]?'checked':''} onchange="_opsTog('${id}','${fld}',this.checked)">${lbl}</label>`;

  // Only the checks that apply to this kind of row — same set the four tables showed.
  const checks = [];
  if (isToday && isL && isExp) { checks.push(['Temp OK','ΘΕΡΜ'], ['Docs Ready','ΕΓΓΡ']); if(!partner) checks.push(['Second Card','2Η']); }
  else if (isToday && isL)     { checks.push(['CMR Photo Received','CMR'], ['Temp OK','ΘΕΡΜ']); }
  else if (isToday)            { checks.push(['CMR Photo Received','CMR'], ['Client Notified','ΠΕΛ']); }
  else                         { checks.push(['Driver Notified','ΟΔΗΓ']); }
  const doneN = checks.filter(([fld]) => f[fld]).length;

  const timeSelect = (fld,v) => {
    const hrs=[];for(let h=0;h<24;h++)for(let m=0;m<60;m+=30){const t=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');hrs.push(t);}
    return `<select class="tinp" onchange="_opsSvF('${id}','${fld}',this.value)"><option value="">--:--</option>${hrs.map(t=>`<option value="${t}"${v===t?' selected':''}>${t}</option>`).join('')}</select>`;
  };
  const amtInp = (fld,v) => `<input class="tinp" type="number" step="1" value="${v||''}" placeholder="0" style="width:60px" onblur="_opsSvF('${id}','${fld}',parseFloat(this.value)||null)">`;
  const _btn = (cls,label,action) => `<button class="btn ${cls}" style="padding:4px 10px;font-size:11px" onclick="confirmAction('${label};').then(ok=>{if(ok)${action}})">${label}</button>`;

  const statusBadge = isInTransit ? '<span style="background:#1E40AF;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600">ΣΕ ΜΕΤΑΦΟΡΑ</span>'
    : isPostponed ? '<span style="background:#92400E;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600">ΑΝΑΒΛΗΘΗΚΕ</span>'
    : isDone ? '<span style="background:#065F46;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600">ΠΑΡΑΔΟΘΗΚΕ ✓</span>' : null;

  let actions;
  if (statusBadge) actions = statusBadge;
  else if (!isToday) actions = _btn('btn-ghost','Αναβολή',`_opsPost('${id}')`);
  else if (isL) actions = _btn('btn-primary','Σε μεταφορά',`_opsStat('${id}','In Transit')`) + ' ' + _btn('btn-ghost','Αναβολή',`_opsPost('${id}')`);
  else actions = _btn('btn-success','Παραδόθηκε',`_opsDel('${id}','On Time')`) + ' ' + _btn('btn-danger','Καθυστέρησε',`_opsDel('${id}','Delayed')`);

  // ΩΡΑ: editable ETA where the old tables had one, otherwise the planned time.
  const hasEta = (isToday && (!isL || !isExp)) || (!isToday && isL && !isExp) || (!isToday && !isL);
  const timeCell = hasEta ? timeSelect('ETA', f['ETA']) : `<span style="color:var(--text-dim)">${tSort==='ZZ'?'—':tSort}</span>`;

  const palCell = (isToday && isL && isExp) ? (f['Total Pallets']||'') : '';
  const advCell = (isToday && isL && isExp && !partner) ? amtInp('Advance Paid', f['Advance Paid']) : '';

  return `<tr class="${isDone?'done':isInTransit?'transit':''}" style="${isInTransit?'background:#EFF6FF':isDone?'opacity:.5':''}">
    <td class="rn">${num}</td>
    <td class="c"><span title="${k.title}" style="color:${k.color};font-weight:700;font-size:10px;letter-spacing:.5px">${k.badge}</span></td>
    <td>${timeCell}</td>
    <td class="trn" title="${client}">${client}</td>
    <td class="trn" title="${place}">${place||'—'}</td>
    <td class="trn-s">${truck||'—'}</td>
    <td class="trn-s">${driver||'—'}</td>
    ${isToday?`<td class="c">${palCell}</td>`:''}
    <td class="c" style="white-space:nowrap"><span style="font-size:10px;color:var(--text-dim);margin-right:4px">${doneN}/${checks.length}</span>${checks.map(([fld,lbl])=>chk(fld,lbl)).join(' ')}</td>
    ${isToday?`<td class="c">${advCell}</td>`:''}
    <td style="white-space:nowrap">${actions}</td>
  </tr>`;
}


/* ── ACTIONS ──────────────────────────────────────────────────── */
// Crash-test fix: per-checkbox debounce lock to prevent out-of-order writes
// when user rapid-clicks (e.g., 5 toggles in 1 sec). Without this, parallel
// atPatch calls could resolve in wrong order, leaving UI state desynced from DB.
const _opsTogLock = new Map();
async function _opsTog(id,fld,v){
  const lockKey = `${id}:${fld}`;
  if (_opsTogLock.get(lockKey)) {
    // Already a write in flight — queue the latest value, coalesce
    _opsTogLock.set(lockKey, { queued: v });
    return;
  }
  _opsTogLock.set(lockKey, true);
  try{
    await atSafePatch(TABLES.ORDERS,id,{[fld]:v});
    const r=OPS.intl.find(x=>x.id===id);
    if(r) r.fields[fld]=v;
    toast(v?'✓':'—');

    // Auto-status transitions based on checklist completion
    if(v && r) {
      const f=r.fields;
      const status=f['Status']||'';
      const loadChecks=['Docs Ready','Temp OK','Driver Notified'];
      const delChecks=['CMR Photo Received','Client Notified'];

      // All loading checks done + status is Assigned/Pending → suggest "In Transit"
      if(loadChecks.includes(fld) && (status==='Assigned'||status==='Pending'||status==='')) {
        const allLoaded=loadChecks.every(c=>f[c]);
        if(allLoaded && await confirmAction('Ολα τα loading checks ✓ — Αλλαγή σε "In Transit";', { confirmLabel: 'Αλλαγή' })) {
          await _opsStat(id,'In Transit');
          return;
        }
      }

      // All delivery checks done + status is In Transit → suggest "Delivered"
      if(delChecks.includes(fld) && status==='In Transit') {
        const allDel=delChecks.every(c=>f[c]);
        if(allDel && await confirmAction('Ολα τα delivery checks ✓ — Αλλαγή σε "Delivered (On Time)";', { confirmLabel: 'Αλλαγή' })) {
          await _opsDel(id,'On Time');
          return;
        }
      }
    }
    _opsDraw();
  }catch(e){toast('Error','danger');}
  finally {
    // Drain any queued value that arrived during the write
    const entry = _opsTogLock.get(lockKey);
    _opsTogLock.delete(lockKey);
    if (entry && typeof entry === 'object' && 'queued' in entry && entry.queued !== v) {
      // Re-run with the latest queued value
      _opsTog(id, fld, entry.queued);
    }
  }
}
async function _opsSvF(id,fld,v){try{await atSafePatch(TABLES.ORDERS,id,{[fld]:v||null});const r=OPS.intl.find(x=>x.id===id);if(r)r.fields[fld]=v;}catch(e){toast('Error','danger');}}
// Single Status field — unified lifecycle (Pending/Assigned/In Transit/Delivered/Invoiced/Cancelled)
async function _opsStat(id,st){try{
  await atSafePatch(TABLES.ORDERS,id,{'Status':st});
  const r=OPS.intl.find(x=>x.id===id);if(r)r.fields['Status']=st;
  // Mirror Status on any linked PARTNER ASSIGNMENT
  try { await paSyncStatus({ parentType:'order', parentId:id, status:st }); }
  catch(e) { console.warn('PA status sync:', e.message); }
  toast(st+' ✓');_opsDraw();}catch(e){toast('Error','danger');}}
async function _opsDel(id,perf){const d=localToday();
  try{await atSafePatch(TABLES.ORDERS,id,{'Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d});
  const r=OPS.intl.find(x=>x.id===id);if(r){r.fields['Status']='Delivered';r.fields['Delivery Performance']=perf;}
  try { await paSyncStatus({ parentType:'order', parentId:id, status:'Delivered' }); }
  catch(e) { console.warn('PA status sync:', e.message); }
  toast(perf==='On Time'?'✓ Delivered':'✗ Delayed',perf==='Delayed'?'danger':'success');_opsDraw();}catch(e){toast('Error','danger');}}
async function _opsPost(id){
  // Auto-postpone to next day (Status stays as-is; Postponed To carries the flag)
  const r=OPS.intl.find(x=>x.id===id);if(!r)return;
  const f=r.fields;
  const loadDt=toLocalDate(f['Loading DateTime']);
  const delDt=toLocalDate(f['Delivery DateTime']);
  const nextLoad=loadDt?toLocalDate(new Date(new Date(loadDt+'T12:00:00').getTime()+864e5)):'';
  const nextDel=delDt?toLocalDate(new Date(new Date(delDt+'T12:00:00').getTime()+864e5)):'';
  const patch={'Postponed To':nextLoad||nextDel};
  if(nextLoad) patch['Loading DateTime']=nextLoad;
  if(nextDel) patch['Delivery DateTime']=nextDel;
  try{await atSafePatch(TABLES.ORDERS,id,patch);
  invalidateCache(TABLES.ORDERS);
  // Central sync — dates changed, propagate to NAT_LOADS, GL, RAMP
  if (typeof syncOrderDownstream === 'function') {
    syncOrderDownstream(id, { source: 'intl', changedFields: ['Loading DateTime','Delivery DateTime','Postponed To'], skipPA: true })
      .catch(e => console.warn('[ops postpone sync]', e));
  }
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
  try{await atSafePatch(TABLES.ORDERS,id,{'Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d});
  // Central sync — propagate status to partner assignments
  if (typeof syncOrderDownstream === 'function') {
    syncOrderDownstream(id, { source: 'intl', changedFields: ['Status'], skipVS: true, skipGRP: true, skipRamp: true })
      .catch(e => console.warn('[ops overdue sync]', e));
  }
  OPS.overdue=OPS.overdue.filter(r=>r.id!==id);toast(perf==='Delayed'?'Σημειώθηκε ως καθυστερημένη':'Σημειώθηκε ως παραδοθείσα');_opsDraw();}catch(e){toast('Error','danger');}}

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
window._opsSetFilter = _opsSetFilter;
})();
window._opsToggleOverdue = _opsToggleOverdue;
