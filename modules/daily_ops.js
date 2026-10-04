// ═══════════════════════════════════════════════════════════════
// DAILY OPS PLAN — v4 (redesign κύμα 3, Figma w3-daily-ops 169:699, 2/9/2026)
// Table-based layout — International ORDERS only
// Stacked: Export Load → Export Deliver → Import Load → Import Deliver
// Οι ΤΕΣΣΕΡΙΣ ενότητες μένουν ως έχουν (κλείδωμα owner — η ενοποίηση του
// audit απορρίφθηκε). Tokens μόνο (DESIGN.md #1), ονόματα χωρίς κοπή (#6).
// ═══════════════════════════════════════════════════════════════
(function() {
'use strict';

const OPS = {
  date:'today', intl:[], trucks:[], drivers:[], locs:[], clients:[], overdue:[], overdueLoads:[],
  // Filters: search text, direction, status
  filters: { q:'', direction:'', status:'' },
  loadedAt: null,
};

// Η λίστα πεδίων μένει ΙΔΙΑ με πριν: τα checkboxes (Docs Ready/Temp OK/CMR/
// Client Notified/Driver Notified/Second Card) αφαιρέθηκαν από την ΟΘΟΝΗ
// (owner 2/9 — μέτρηση 0–5/107 συμπληρωμένα), όχι από το αίτημα — η αλλαγή
// είναι στην απόδοση, το αίτημα προς το facade δεν χρειάζεται να αλλάξει.
const OPS_FIELDS = [
  'Direction','Goods','Temperature °C','Total Pallets','Client',
  'Loading DateTime','Delivery DateTime','Status',
  'ORDER STOPS',
  'Delivery Performance','Ops Notes','Postponed To',
  'Actual Delivery Date','ETA','CMR Photo Received','Client Notified',
  'Veroia Switch','VS CD Date',
  'Docs Ready','Temp OK','Driver Notified','Advance Paid','Second Card',
  'Truck','Trailer','Driver','Is Partner Trip','Partner',
  // 'Group ID' (Παντελής 15/9, Figma 647:1011): export loadings of the same
  // groupage collapse into one row. Same truck is the fallback key.
  'Group ID',
  // Pre-order (owner 22/9). Without 'Ops Status' a pre-order is NULL = absent
  // (facade trap 2) and would read as an ordinary «ΠΡΟΣ ΑΝΑΘΕΣΗ» row; 'Notes'
  // is its only description, 'Destination Country' its only place (owner 28/9:
  // the country must show). Safe to ask for since 052 ran and Worker 1692d0da
  // maps it (27/9) — before that, this read would have failed the page.
  'Ops Status','Notes','Destination Country',
  // Stock lots Φ1 (impact map 4/10 C-01/C-04/C-05): 'Own Stock Lot' marks a
  // LOT (its delivery is the warehouse intake, not the client's), 'Stock Lot'
  // a PIECE, 'Stock Lot Order No'/'Source' its lot's «#N». Safe before the
  // stock Worker: the live facade (deploy/worker-0310 handleFacadeGet) drops
  // an unknown READ label from the select and logs it as kind='read' — 200 OK,
  // the predicates stay false, the screen is today's. Only kind='write' rings
  // the auditor (B-33).
  'Own Stock Lot','Stock Lot','Stock Lot Order No','Stock Lot Source',
];

/* ── ENTRY ────────────────────────────────────────────────────── */
// Read-only gate for planning:view roles (13/9, Thodoris go-live audit): Daily
// Ops showed «Φορτώθηκε/Παραδόθηκε/Αλλαγή ημέρας» to management while the
// Worker refuses its order_stops stamps (403) — the button is for dispatchers.
function _opsBlockReadOnly(){
  if(typeof can!=='function' || can('planning')==='full') return false;
  toast('Μόνο ανάγνωση για τον ρόλο σου','warn');
  return true;
}

async function renderDailyOps() {
  _opsNormDate();
  document.getElementById('content').innerHTML = showLoading('Φόρτωση…');
  try { await _opsLoad(); _opsDraw(); }
  // Failure ≠ empty (DESIGN.md #7): say what happened, what it does NOT mean,
  // and what to do — a bare «Σφάλμα» read as «no orders today» at 05:30.
  catch(e) { document.getElementById('content').innerHTML = `${_OPS_STYLE}<div class="do-page"><div class="do-err"><span>Το Ημερήσιο Πλάνο δεν φορτώθηκε — δεν σημαίνει ότι δεν υπάρχουν παραγγελίες σήμερα.</span><button class="do-btn" onclick="renderDailyOps()">Ξαναδοκίμασε</button></div></div>`; console.error(e); }
}

async function _opsLoad() {
  if (!OPS.trucks.length) {
    await preloadReferenceData();
    OPS.trucks=getRefTrucks().filter(r=>r.fields['Active']).map(r=>({id:r.id,lb:r.fields['License Plate']||''}));
    OPS.drivers=getRefDrivers().filter(r=>r.fields['Active']).map(r=>({id:r.id,lb:r.fields['Full Name']||''}));
    OPS.locs=getRefLocations(); OPS.clients=getRefClients();
  }
  // Scan round 3: paperclip index — own ~2min cache, never rejects.
  if (typeof OrderDocs !== 'undefined') await OrderDocs.preloadIndex();
  const tgt=_opsTgt();
  // VS (owner 10/8): το διεθνές σκέλος εμφανίζεται τη μέρα του Cross-Dock
  // (VS CD Date, αλλιώς Loading+1) — φέρε και τα χθεσινά-Loading VS.
  const prev=toLocalDate(new Date(new Date(tgt).getTime()-86400000));
  const dayF=`OR(IS_SAME({Loading DateTime},'${tgt}','day'),IS_SAME({Delivery DateTime},'${tgt}','day'),IS_SAME({VS CD Date},'${tgt}','day'),AND({Veroia Switch}=1,IS_SAME({Loading DateTime},'${prev}','day')))`;
  const dayFOld=`OR(IS_SAME({Loading DateTime},'${tgt}','day'),IS_SAME({Delivery DateTime},'${tgt}','day'))`;
  const ovF=`AND(IS_BEFORE({Delivery DateTime},TODAY()),OR({Status}='In Transit',{Status}='Assigned',{Status}='Pending',{Status}=''))`;
  // Εκκρεμείς ΦΟΡΤΩΣΕΙΣ από προηγούμενες ημέρες (2/9): συμμετρικό με τις
  // παραδόσεις. Ως τώρα ο κώδικας κοιτούσε μόνο Delivery DateTime — μια
  // φόρτωση που δεν έγινε και δεν μετατέθηκε χανόταν σιωπηλά (αρχή 1).
  // «Δεν φορτώθηκε» = Status όχι In Transit/Delivered — καμία άλλη υπόθεση.
  const ovLF=`AND(IS_BEFORE({Loading DateTime},TODAY()),OR({Status}='Assigned',{Status}='Pending',{Status}=''))`;
  let intl, ov;
  try{
    [intl,ov] = await Promise.all([
      atGetAll(TABLES.ORDERS,{filterByFormula:dayF,fields:OPS_FIELDS},false),
      OPS.date==='today'?atGetAll(TABLES.ORDERS,{filterByFormula:ovF,fields:OPS_FIELDS},false):[],
    ]);
  }catch(e){
    // Πριν το worker deploy του VS CD Date το νέο φίλτρο μπορεί να απορριφθεί —
    // πέφτουμε στο παλιό, η σελίδα δεν σπάει ποτέ.
    console.warn('[ops] VS dayF fallback:', e.message);
    [intl,ov] = await Promise.all([
      atGetAll(TABLES.ORDERS,{filterByFormula:dayFOld,fields:OPS_FIELDS},false),
      OPS.date==='today'?atGetAll(TABLES.ORDERS,{filterByFormula:ovF,fields:OPS_FIELDS},false):[],
    ]);
  }
  // Η νέα κλήση ζει ΧΩΡΙΣΤΑ: αν αποτύχει, η ημέρα αποδίδεται κανονικά και η
  // ζώνη λέει ρητά ότι δεν φορτώθηκε (αρχή 1) — δεν ρίχνει ολόκληρη τη σελίδα.
  let ovL=[]; OPS.overdueLoadsErr=false;
  if(OPS.date==='today'){
    try{ ovL=await atGetAll(TABLES.ORDERS,{filterByFormula:ovLF,fields:OPS_FIELDS},false); }
    catch(e){ console.warn('[ops] overdue loadings fetch failed:', e.message); OPS.overdueLoadsErr=true; }
  }
  OPS.intl=intl;
  const ids=new Set(intl.map(r=>r.id));
  // Stock lots Φ1: a LOOSE piece (back in stock, no truck and no partner —
  // decision D1, OrdersStock.isLoose) keeps the dates of the truck it left.
  // Round 0 (C-05) took it out of BOTH zones because they offered
  // «Φορτώθηκε»/«Παραδόθηκε» on it — which made it the one late item no screen
  // showed (critic-1 C1-02, round 1). It now stays in the LOADINGS zone (what
  // it waits for is a truck and a load) with the K6 hint instead of a button
  // (_opsSlots), and is kept out of the deliveries zone so it is listed once.
  const _opsNotLoose=r=>!OrdersStock.isLoose(r.fields);
  OPS.overdue=ov.filter(r=>!ids.has(r.id)&&_opsNotLoose(r));
  const ovIds=new Set(OPS.overdue.map(r=>r.id));
  // ΔΕΝ αφαιρούνται όσες είναι ήδη στη μέρα (3/9): ακριβώς αυτές είναι το
  // ζητούμενο — φόρτωση 30/8 αδήλωτη ΚΑΙ παράδοση σήμερα. Με το παλιό
  // `!ids.has(r.id)` η ζώνη έβγαινε μονίμως άδεια και η αντίφαση έμενε
  // αόρατη (αρχή 1). Η ίδια παραγγελία φαίνεται και στη ζώνη και στην
  // ενότητά της — όπως ήδη φαίνεται σε ΦΟΡΤΩΣΕΙΣ και ΠΑΡΑΔΟΣΕΙΣ όταν κάνει
  // και τα δύο την ίδια μέρα: η οθόνη ομαδοποιεί κατά ΔΟΥΛΕΙΑ, όχι κατά
  // εγγραφή. Το `!ovIds` μένει: μία εκκρεμότητα, μία ζώνη.
  OPS.overdueLoads=ovL.filter(r=>!ovIds.has(r.id));
  OPS.loadedAt=new Date();

  // Wave 3 (owner 6/9, FEATURES.ORDER_SPLIT): a split PARENT keeps its
  // ORIGINAL Loading/Delivery DateTime (only the legs move the hand-over
  // date), so it can still land in today's day-window even though it is not
  // itself executing anymore — «σκέλη κινούνται, ο γονέας όχι». A parent has
  // no own 'Parent Order', so a plain field check can't tell it apart from a
  // never-split order; the only way to know is to ask which ids are SOMEONE
  // ELSE's Parent Order — one extra filtered query, entirely new and gated by
  // the flag, so the off-path fetch above is untouched.
  OPS.legParents = new Set();
  if (typeof FEATURES !== 'undefined' && FEATURES.ORDER_SPLIT) {
    const candidateIds=[...intl,...OPS.overdue,...OPS.overdueLoads].filter(r=>!getLinkedId(r.fields['Parent Order'])).map(r=>r.id);
    if(candidateIds.length){
      try{
        const legsF=`OR(${candidateIds.map(id=>`FIND("${id}",ARRAYJOIN({Parent Order},","))>0`).join(',')})`;
        const legs=await atGetAll(TABLES.ORDERS,{filterByFormula:legsF,fields:['Parent Order']},false);
        legs.forEach(l=>{ const p=getLinkedId(l.fields['Parent Order']); if(p) OPS.legParents.add(p); });
      }catch(e){ console.warn('[ops] split-leg parent lookup:', e.message); }
    }
    intl=intl.filter(r=>!OPS.legParents.has(r.id));
    OPS.overdue=OPS.overdue.filter(r=>!OPS.legParents.has(r.id));
    OPS.overdueLoads=OPS.overdueLoads.filter(r=>!OPS.legParents.has(r.id));
  }
  OPS.intl=intl;

  // Κληρονομιά ανάθεσης ζεύγους (owner 13/8): σε ταιριασμένα ζεύγη η ανάθεση
  // γράφεται ΜΟΝΟ στο export (Matched Import ID) — τα imports εμφανίζονταν
  // «κενά» εδώ ενώ το Weekly τα έδειχνε ανατεθειμένα. Γεμίζουμε Truck/Driver/
  // Trailer/Partner ΜΟΝΟ στη μνήμη για την προβολή· ΔΕΝ γράφεται στη βάση.
  try{
    const bareImps=[...intl,...OPS.overdue,...OPS.overdueLoads].filter(r=>{
      const f=r.fields;
      // D1 (round 1): a piece is on a truck only by its OWN Truck/Partner — the
      // DB (piece_no_truck) and the Weekly judge it so. Borrowing the matched
      // export's vehicle would draw a loose piece as assigned, with a
      // «Φορτώθηκε» the base refuses.
      return f['Direction']==='Import' && !OrdersStock.isPiece(f) && !(f['Truck']||[]).length && !(f['Partner']||[]).length && !(f['Driver']||[]).length;
    });
    if(bareImps.length){
      const ff=`OR(${bareImps.map(r=>`{Matched Import ID}='${r.id}'`).join(',')})`;
      const exps=await atGetAll(TABLES.ORDERS,{filterByFormula:ff,fields:['Matched Import ID','Truck','Trailer','Driver','Partner','Is Partner Trip','Partner Truck Plates']},false);
      const byImp={}; exps.forEach(e=>{ byImp[String(e.fields['Matched Import ID'])]=e.fields; });
      bareImps.forEach(r=>{
        const ef=byImp[r.id]; if(!ef) return;
        ['Truck','Trailer','Driver','Partner','Is Partner Trip','Partner Truck Plates'].forEach(k=>{
          if(ef[k]!=null && r.fields[k]==null) r.fields[k]=ef[k];
        });
      });
    }
  }catch(e){ console.warn('[ops] pair-assignment inherit:', e.message); }

  // Batch fetch ORDER_STOPS for location resolution
  const allRecs = [...intl, ...OPS.overdue, ...OPS.overdueLoads];
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

  // Local relays (migration 060, owner 4/10 «οκ προχωρα με τις τοπικες
  // παραδοσεις»): the local driver who delivers or loads in place of the
  // international one. A SEPARATE request, never a label in OPS_FIELDS — that
  // request must stay byte-identical to the 28/8 recording (see _opsAsgCell).
  // Its failure must not take the day down either: the page renders, a zone
  // says the relays did not load, and ΑΝΑΘΕΣΗ shows only the international
  // driver — never a silent «no relay» (principle 1).
  OPS.relays = {}; OPS.relaysErr = false;
  const relayIds = [...new Set(allRecs.map(r => r.id))];
  if (relayIds.length) {
    try { OPS.relays = await _opsLoadRelays(relayIds); }
    catch(e) { console.warn('[ops] local relays fetch failed:', e.message); OPS.relaysErr = true; }
  }
}

// orderId → { relay_delivery, relay_loading }, through the ONE relay reader
// Weekly International uses (core/relay.js, principle 3): the same FIND on
// {Parent Order}, the same throw on a response without «Move Kind» (the zone
// then says «not loaded» instead of guessing which rows are relays), the same
// drop of Cancelled relays and of Weekly National's plain local moves. A
// second copy here had already drifted (batch size, duplicate handling).
async function _opsLoadRelays(ids) {
  if (!window.Relay || typeof Relay.loadForOrders !== 'function') throw new Error('core/relay.js not loaded');
  return Relay.index(await Relay.loadForOrders(ids));
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
// No getTrailerPlate in data-helpers (only trucks/drivers); same shape here.
const _TR=f=>{ const id=getLinkedId(f['Trailer']); if(!id) return ''; const t=getRefTrailers().find(r=>r.id===id); return t?escapeHtml(t.fields['License Plate']||''):''; };
// «CB5871TT / P59498» as the Weekly shows it (Παντελής 15/9: «δεν φαίνεται ο
// θάλαμος»). 'Trailer' was already fetched and pair-inherited, never drawn.
const _TT=f=>[_T(f),_TR(f)].filter(Boolean).join(' / ');
const _D=f=>getDriverName(getLinkedId(f['Driver']))||'';
const _DM=(dt,d)=>dt?toLocalDate(dt)===d:false;
const _P=f=>f['Is Partner Trip']===true||f['Is Partner Trip']==='Yes';
// Υπογραμμή πελάτη «ΒΕΡΟΙΑ · GR» (Figma) — από το cache αναφοράς, όσο
// υπάρχουν City/Country στην εγγραφή· αλλιώς τίποτα (όχι «—»).
const _CSub=f=>{
  const id=getLinkedId(f['Client']);
  const c=id?(OPS.clients||[]).find(x=>x.id===id):null;
  if(!c) return '';
  const cf=c.fields||{};
  // One list everywhere (owner 5/9): show the Greek name even where the client
  // record still stores an old spelling/code.
  const country=cf['Country']?(typeof countryName==='function'?countryName(cf['Country']):cf['Country']):'';
  return [cf['City'],country].filter(Boolean).map(s=>escapeHtml(String(s)).toUpperCase()).join(' · ');
};
// «06:30» από ISO datetime — μόνο αν υπάρχει πραγματική ώρα (00:00 = ημέρα).
const _HM=dt=>{ if(!dt||!/T\d\d:\d\d/.test(String(dt))) return ''; try{ const d=new Date(dt); const h=d.getHours(),m=d.getMinutes(); if(!h&&!m) return ''; return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'); }catch(_){ return ''; } };
const _DMY=d=>{ if(!d) return ''; const p=String(d).slice(0,10).split('-'); return p.length===3?`${+p[2]}/${+p[1]}`:d; };
const _DMYFull=d=>{ if(!d) return ''; const p=String(d).slice(0,10).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:d; };
const _daysAgo=d=>{ try{ const a=new Date(toLocalDate(d)+'T12:00:00'), b=new Date(localToday()+'T12:00:00'); return Math.round((b-a)/864e5); }catch(_){ return null; } };
const _agoTxt=n=>n==null?'':n===1?'πριν 1 ημέρα':`πριν ${n} ημέρες`;
// One resolver for OPS.date (Παντελής 15/9, «Χθες»): 'today' | 'tomorrow' |
// 'yesterday' | ISO. Until now the same ternary lived in _opsLoad, _opsCats
// and _opsDraw — a third keyword would have had to be added three times.
const _opsTgt=()=>OPS.date==='today'?localToday():OPS.date==='tomorrow'?localTomorrow():OPS.date==='yesterday'?_plus(localToday(),-1):OPS.date;
// Owner 16/9: the «declare only today» rule is CANCELLED. Weekend loads and
// deliveries are declared on Monday, so every past day accepts declarations.
// Only the future stays closed — nothing has happened there yet. Each write
// stamps the VIEWED day (not today), otherwise a Monday click would claim a
// Saturday delivery happened on Monday.
const _opsIsFuture=()=>_opsTgt()>localToday();
// ISO timestamp for «now» on the viewed day: today = real now; a past day =
// that date with the current wall-clock time (the minute is not a fact we
// have, the day is).
const _opsNowOnTgt=()=>{ const t=_opsTgt(); if(t===localToday()) return new Date().toISOString(); return new Date(t+'T'+new Date().toTimeString().slice(0,8)).toISOString(); };
// The date input hands over an ISO string; fold it back to the keyword so the
// segmented control lights the right button and the day words stay correct.
const _opsNormDate=()=>{ const d=OPS.date; if(d===localToday()) OPS.date='today'; else if(d===localTomorrow()) OPS.date='tomorrow'; else if(d===_plus(localToday(),-1)) OPS.date='yesterday'; };
const _opsDayWord=()=>OPS.date==='today'?'σήμερα':OPS.date==='tomorrow'?'αύριο':OPS.date==='yesterday'?'χθες':'';

function _opsCats() {
  const tgt=_opsTgt();
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

    // VS export: effective ημέρα φόρτωσης = μέρα Cross-Dock (VS CD Date ή +1)
    const _effL=(ff)=>{
      if(ff['Veroia Switch']&&ff['Direction']==='Export'){
        if(ff['VS CD Date']) return String(ff['VS CD Date']);
        const l=ff['Loading DateTime'];
        if(l){ try{ return toLocalDate(new Date(new Date(l).getTime()+86400000)); }catch(e){} }
      }
      return ff['Loading DateTime'];
    };
    const isL=_DM(_effL(f),tgt);
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

// Screen CSS — tokens only (DESIGN.md B). Sizes come from the six-step type
// scale (C), spacing from 4/8/12/16/24/32 (D), radius 6px / 9999px only.
// The accent is reserved for the primary action's hover and the focus ring;
// every other blue that used to be here (links, KPI numbers, stop numbers,
// «Αλλαγή ημέρας») was decoration and now reads in text greys (B: «Αν το
// accent εμφανίζεται πάνω από δύο φορές σε μια οθόνη, κάτι πάει στραβά»).
// The old .ops-kpi/.ops-alert rules in style.css are no longer used here;
// style.css is not touched (file outside this unit).
const _OPS_STYLE=`<style>
  .do-page{font-size:var(--text-sm);color:var(--text);font-variant-numeric:tabular-nums}
  .do-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  .do-h1{font-family:Syne;font-size:28px;font-weight:700;margin:0;line-height:1.15}
  .do-sub{font-size:var(--text-xs);color:var(--text-dim)}
  .do-sub b{color:var(--danger);font-weight:600}
  .do-seg{display:flex;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--surface-card)}
  .do-seg:hover{border-color:var(--border-dark)}
  .do-seg button,.do-seg input{border:0;background:none;height:32px;padding:0 12px;font-family:inherit;font-size:var(--text-sm);color:var(--text-mid);cursor:pointer}
  .do-seg button:hover{background:var(--surface-sunken);color:var(--text)}
  .do-seg button.on{background:var(--surface-dark);color:var(--text-on-dark);font-weight:600}
  .do-seg input{width:112px;font-size:var(--text-xs);color:var(--text-mid)}
  .do-sel{height:32px;padding:0 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-card);font-family:inherit;font-size:var(--text-sm);color:var(--text-mid)}
  .do-q{height:32px;padding:0 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-card);font-family:inherit;font-size:var(--text-sm);color:var(--text);min-width:200px;flex:1}
  .do-q::placeholder{color:var(--text-dim)}
  .do-sel:hover,.do-q:hover,.do-tinp:hover{border-color:var(--border-dark)}
  /* Six states (D2): hover above, selected = .on / .do-open, disabled and
     focus below, empty = .do-empty, error = .do-err. */
  .do-page button:focus-visible,.do-page input:focus-visible,.do-page select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .do-page button:disabled,.do-page select:disabled,.do-page input:disabled{color:var(--text-dim);background:var(--surface-sunken);border-color:var(--border);cursor:not-allowed}
  .do-right{margin-left:auto;display:flex;align-items:center;gap:8px}
  .do-link{background:none;border:0;color:var(--text-mid);font-weight:600;font-size:var(--text-body);cursor:pointer;font-family:inherit;padding:4px 8px}
  .do-link:hover{color:var(--text);text-decoration:underline}
  .do-kpis{display:flex;gap:0;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-card);margin-bottom:12px}
  .do-kpi{flex:1;padding:8px 16px}
  .do-kpi+.do-kpi{border-left:1px solid var(--border)}
  .do-kpi-l{font-size:var(--text-xs);font-weight:700;letter-spacing:.06em;color:var(--text-mid)}
  .do-kpi-v{font-size:18px;font-weight:700;color:var(--text);margin-top:4px}
  .do-kpi-v small{font-size:var(--text-xs);font-weight:400;color:var(--text-dim)}
  .do-kpi-bar{height:4px;background:var(--border);border-radius:var(--radius-full);margin-top:4px;overflow:hidden}
  .do-kpi-fill{height:100%;background:var(--surface-dark)}
  .do-kpi.ok .do-kpi-v{color:var(--ok)} .do-kpi.ok .do-kpi-fill{background:var(--ok)}
  /* Overdue = expired (B: --danger «ληγμένο»), not «attention» — the day has
     already passed, so it is not the amber of a gap. */
  .do-zone{border:1px solid var(--danger);border-radius:var(--radius);background:var(--surface-card);margin-bottom:12px}
  .do-zone-h{display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:var(--text-sm);font-weight:600;color:var(--danger);cursor:pointer;user-select:none;background:none;border:0;width:100%;text-align:left;font-family:inherit}
  .do-zone-h i{width:8px;height:8px;background:var(--danger);display:inline-block;border-radius:var(--radius-full)}
  .do-zone-h .do-note{margin-left:auto;font-weight:400;color:var(--text-dim);font-size:var(--text-xs)}
  .do-zone-h .do-tog{font-weight:400;color:var(--text-dim);font-size:var(--text-xs);margin-left:12px}
  .do-zrow{display:flex;align-items:center;gap:12px;padding:0 12px;height:40px;border-top:1px solid var(--border);font-size:var(--text-body)}
  .do-zrow .do-cl{font-weight:600;min-width:180px}
  .do-zrow .do-rt{color:var(--text-mid);flex:1;min-width:0}
  .do-zrow .do-late{color:var(--danger);font-weight:600;white-space:nowrap}
  .do-sec{margin-top:12px}
  .do-sec-h{display:flex;align-items:baseline;gap:8px;padding:0 0 4px;font-size:var(--text-xs);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-mid)}
  .do-sec-h span{font-weight:400;letter-spacing:0;text-transform:none;color:var(--text-dim);font-size:var(--text-xs)}
  /* One grid for all four sections (Παντελής 15/9): fixed layout + the same
     <colgroup> in every table, so ΦΟΡΤΩΣΗ/ΠΑΡΑΔΟΣΗ, ΑΝΑΘΕΣΗ, ΠΑΛ., ΠΡΟΚ.,
     ΚΑΤΑΣΤΑΣΗ and ΕΝΕΡΓΕΙΕΣ sit on one vertical. With auto layout the
     deliveries' three action slots (~320px) and the loadings' two (~212px)
     pushed every column of each table to a different x. min-width keeps the
     two fluid columns readable on a laptop; the wrapper already scrolls. */
  .do-t{width:100%;min-width:1040px;table-layout:fixed;border-collapse:collapse;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius)}
  .do-t th{padding:0 8px;height:32px;text-align:left;font-size:var(--text-xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-mid);background:var(--surface-sunken);white-space:nowrap}
  .do-t td{padding:0 8px;height:40px;border-top:1px solid var(--border);white-space:nowrap;vertical-align:middle;font-size:var(--text-body)}
  .do-t td.do-wrap{white-space:normal}
  .do-t tr.do-done td{color:var(--text-dim)}
  .do-t tr.do-hover:hover td,.do-t tr.do-open td{background:var(--surface-sunken)}
  .do-num{color:var(--text-dim);width:24px}
  .do-main{font-weight:600;line-height:1.15}
  .do-sl{display:block;font-size:var(--text-xs);color:var(--text-dim);font-weight:400;letter-spacing:.02em}
  /* Assignment: colour AND word (DESIGN.md E). Text on the tag is the card
     white — --text-on-dark on --ok measures 4.1:1, white 5.1:1.
     Own fleet carries NO tag (Παντελής 22/9, owner): a plate + driver already
     says «ours» — the word «ΙΔ.» added nothing. Partner keeps the word AND the
     design-system partner green (--chip-partner, the Weekly's carrier chip),
     on the tag and on the company name, so the row reads as «another colour»
     at a glance rather than by a 16px pill. */
  .do-tag{display:inline-block;height:16px;line-height:16px;padding:0 8px;border-radius:var(--radius-full);font-size:var(--text-xs);font-weight:700;letter-spacing:.04em;color:var(--surface-card);vertical-align:1px;margin-right:4px}
  .do-tag.prt{background:var(--chip-partner)}
  .do-asg.prt .do-main{color:var(--chip-partner)}
  .do-tag.none{background:var(--unassigned)}
  .do-tag.lot{background:var(--surface-dark)}
  /* 060 local relay: its own word AND colour (DESIGN.md E) — ink, not the
     partner green or the unassigned red. Clickable only for planning:full. */
  .do-tag.loc{background:var(--surface-dark)}
  .do-rl[role=button]{cursor:pointer}
  .do-rl[role=button]:hover{text-decoration:underline}
  .do-rl[role=button]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  /* td.do-st, not .do-st: «.do-t td{nowrap}» outranks a bare class, so the
     status never wrapped and «Εκκρεμεί · μετατέθηκε · 0/3 παραδόθηκαν» ran
     over «Αλλαγή ημέρας» (seen live 16/9 view, 15/9). */
  .do-t td.do-st{white-space:normal}
  .do-st-wait{color:var(--text);font-weight:700}
  .do-st-done{color:var(--ok);font-weight:600}
  .do-st-moved{color:var(--warn);font-weight:400;font-size:var(--text-xs)}
  /* Owner 15/9 (via coordinator): the buttons sit on the table's right
     edge, the same in every section — the eye finds them in one place. */
  .do-slots{display:flex;align-items:center;justify-content:flex-end;gap:4px}
  .do-t td.do-acts{text-align:right}
  /* Stamp under the status word: «από Παντελής · 07:12» from the stop's
     Completed By/At (owner 15/9). Nothing when there is no stamp — not «—». */
  .do-t td.do-st .do-sl{margin-top:2px}
  /* min-width, όχι width: το «Αλλαγή ημέρας» είναι φαρδύτερο από 104px και
     θα ξεχείλιζε πάνω στη διπλανή θυρίδα. Ίδιο σχήμα σε όλες τις γραμμές
     της ενότητας ⇒ η στήλη διαβάζεται κάθετα. */
  .do-slot{min-width:104px;display:flex;justify-content:center}
  .do-btn{height:28px;padding:0 12px;border-radius:var(--radius);border:1px solid var(--surface-dark);background:var(--surface-dark);color:var(--surface-card);font-family:inherit;font-size:var(--text-xs);font-weight:600;cursor:pointer;white-space:nowrap}
  .do-btn:hover{background:var(--accent);border-color:var(--accent)}
  .do-late-btn{height:28px;padding:0 8px;border:0;background:none;color:var(--danger);font-family:inherit;font-size:var(--text-xs);font-weight:600;cursor:pointer;white-space:nowrap}
  .do-late-btn:hover{text-decoration:underline}
  /* A lot's «Παραλαβή (καθυστέρηση)» (C1-08) is wider than its 104px slot: in
     one line it ran over «Παραλαβή αποθήκης» and «Αλλαγή ημέρας» (rig 4/10).
     Two lines inside the slot keep the three actions on one vertical. */
  .do-late-btn.do-2l{white-space:normal;height:auto;min-height:28px;max-width:104px;line-height:1.15;padding:2px 8px}
  .do-ghost{height:28px;padding:0 8px;border:0;background:none;color:var(--text-mid);font-family:inherit;font-size:var(--text-xs);font-weight:600;cursor:pointer;white-space:nowrap}
  .do-ghost:hover{text-decoration:underline;color:var(--text)}
  .do-tinp{height:28px;padding:0 4px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-card);font-family:inherit;font-size:var(--text-xs);color:var(--text)}
  /* Outline only: the amber fill/border tokens would be two colours that
     appear nowhere else on this screen (measured 4/9: 13 vs 12 before). */
  .do-pill{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:var(--radius-full);border:1px solid var(--warn);background:var(--surface-card);font-size:var(--text-xs);font-weight:600;cursor:pointer;color:var(--warn);white-space:nowrap}
  .do-pill.full{color:var(--text-mid);background:var(--surface-card);border-color:var(--border)}
  /* Members of a collapsed export group (Figma 647:1011): indented client,
     dashed top like the stop sub-rows, otherwise a normal row with its own
     buttons. */
  .do-t tr.do-gm td{border-top:1px dashed var(--border)}
  .do-t tr.do-gm td:nth-child(2){padding-left:40px}
  .do-sub td{background:var(--surface-page);height:36px;border-top:1px dashed var(--border)}
  .do-sub .do-srow{display:flex;align-items:center;gap:12px;padding-left:32px;font-size:var(--text-sm)}
  .do-zsub{background:var(--surface-page);min-height:36px;display:flex;align-items:center;border-top:1px dashed var(--border);padding:0 12px}
  .do-sub .do-srow .do-sn{font-weight:700;width:16px;color:var(--text-mid)}
  .do-sub .do-srow .do-sloc{flex:1;min-width:0;white-space:normal}
  .do-empty{padding:8px 12px;border:1px dashed var(--border);border-radius:var(--radius);color:var(--text-dim);font-size:var(--text-sm);background:var(--surface-card)}
  .do-err{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 12px;border:1px solid var(--danger);border-radius:var(--radius);color:var(--danger);font-size:var(--text-sm);background:var(--surface-card);margin-bottom:12px}
  .do-foot{margin-top:16px;font-size:var(--text-xs);color:var(--text-dim);text-align:right}
  /* Popover «Αλλαγή ημέρας» — στη γραμμή, Enter = Αύριο. Floats above the
     page, so it is the one element here allowed a shadow (D). */
  /* 440px (was 360) since 27/9: a fourth option «Μεθαύριο» — at 360 the
     date input inside «Άλλη…» shrank below its readable width. */
  .do-pop{position:absolute;z-index:var(--z-float,50);width:440px;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md);padding:12px 16px;text-align:left;white-space:normal}
  .do-pop h4{font-family:inherit;font-size:var(--text-base);font-weight:700;margin:0 0 4px}
  .do-pop .do-psub{font-size:var(--text-xs);color:var(--text-dim);margin-bottom:8px}
  .do-pop .do-opts{display:flex;gap:8px;margin-bottom:8px}
  .do-pop .do-opt{flex:1;border:1px solid var(--border);border-radius:var(--radius);padding:4px 8px;background:var(--surface-card);cursor:pointer;font-family:inherit;text-align:left}
  .do-pop .do-opt:hover{border-color:var(--border-dark)}
  .do-pop .do-opt:last-child{flex:1.3}
  .do-pop .do-opt b{display:block;font-size:var(--text-sm);color:var(--text)}
  .do-pop .do-opt span{font-size:var(--text-xs);color:var(--text-dim)}
  .do-pop .do-opt.on{background:var(--surface-dark);border-color:var(--surface-dark)} .do-pop .do-opt.on b,.do-pop .do-opt.on span{color:var(--text-on-dark)}
  .do-pop .do-opt input{width:100%;border:0;background:none;font-family:inherit;font-size:var(--text-xs);color:var(--text);padding:0}
  .do-pop label{display:flex;align-items:flex-start;gap:8px;font-size:var(--text-sm);color:var(--text);margin-bottom:8px;cursor:pointer}
  .do-pop label small{display:block;font-size:var(--text-xs);color:var(--text-dim)}
  .do-pop .do-pfoot{display:flex;align-items:center;gap:8px;font-size:var(--text-xs);color:var(--text-dim)}
  .do-pop .do-pfoot .sp{flex:1}
</style>`;
// Stock lots Φ1 (impact map 4/10 C-01): a LOT's delivery is the WAREHOUSE
// intake — Delivered means «in the warehouse», not «the client has it». The
// same «→ ΑΠΟΘΗΚΗ» word as the Weekly lot badge, so the 06:00 reader never
// takes the intake for a client delivery; the button and the done word say
// it too (_opsSlots / _opsStatusWord).
const _OPS_LOT_TAG='<span class="do-tag lot">→ ΑΠΟΘΗΚΗ</span>';
// A PIECE loads at the warehouse — the call there must say how many pallets of
// WHICH lot to release (C-04). One helper for the day table AND the overdue
// loadings zone (critic-4 C4-09: the late warehouse pickup is exactly the row
// where the call is made, and it dropped the line).
const _opsPieceSub=f=>{
  if(!OrdersStock.isPiece(f)) return '';
  const p=f['Total Pallets']!=null&&f['Total Pallets']!==''?f['Total Pallets']+'p':'';
  return ['ΑΠ',p,'παρτίδα '+escapeHtml(OrdersStock.lotNumLabel(f))].filter(Boolean).join(' · ');
};

/* ── DRAW ─────────────────────────────────────────────────────── */
function _opsDraw() {
  const isToday=OPS.date==='today';
  const tgt=_opsTgt();
  const fD=d=>{try{const dt=new Date(d);
    const ds=['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
    const ms=['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
    return `${ds[dt.getDay()]} ${dt.getDate()} ${ms[dt.getMonth()]}`;} catch{return d;}};

  const cats=_opsCats();
  const all=[...cats.el,...cats.ed,...cats.il,...cats.id];
  const total=all.length;

  // Per-direction completion — κάθε αναλογία x/y, ποτέ σκέτο ποσοστό.
  // Pre-orders are not declarable (no points) — outside «x / y δηλωμένες» (22/9).
  const loadsAll = [...cats.el, ...cats.il].filter(r=>!isPreorder(r.fields));
  // A lot's «delivery» is the warehouse intake (C-01): not a client delivery,
  // so outside the ΠΑΡΑΔΟΣΕΙΣ ratio — its row still shows and is declared.
  const delsAll  = [...cats.ed, ...cats.id].filter(r=>!isPreorder(r.fields)&&!OrdersStock.isLot(r.fields));
  const loadsDone = loadsAll.filter(r=>['In Transit','Delivered'].includes(r.fields['Status']||'')).length;
  const delsDone  = delsAll.filter(r=>(r.fields['Status']||'')==='Delivered').length;
  const pendN=isToday?OPS.overdue.length+OPS.overdueLoads.length:0;

  const kpi=(lbl,done,n,ok)=>`<div class="do-kpi${ok?' ok':''}"><div class="do-kpi-l">${lbl}</div>
    <div class="do-kpi-v">${n?`${done} <small>/ ${n} ${n===1?'δηλωμένη':'δηλωμένες'}</small>`:'<small>καμία σήμερα</small>'}</div>
    <div class="do-kpi-bar"><div class="do-kpi-fill" style="width:${n?Math.round(done/n*100):0}%"></div></div></div>`;

  // Ζώνες εκκρεμών από προηγούμενες ημέρες — παραδόσεις ΚΑΙ φορτώσεις (2/9)
  // _L/_C/_D come back escaped from data-helpers (getLocationName & co) — a
  // second escapeHtml printed «&amp;» on screen (seen live 15/9: «K. & N.
  // EFTHYMIADIS», «FRESH TRADE & TRANSPORTS»). Only raw fields get escaped here.
  const route=r=>`${_L(_opsStopLoc(r.id,'Loading'))||'—'} → ${_L(_opsStopLoc(r.id,'Unloading'))||'—'}`;
  // w11 θέμα 8 (Παντελής/owner 21/9): WHO carries the load — plates + driver —
  // on the overdue DELIVERIES exactly as on the overdue LOADINGS (2/9 wrote
  // it only there), both in bold parentheses so the eye finds it at once.
  const _opsWho=f=>{ const who=[_TT(f),_D(f)].filter(Boolean).join(' · '); return who?` <b class="do-who">(${who})</b>`:''; };
  const zone=(key,rows,title,note,rowHtml)=>{
    if(!rows.length) return '';
    const open=OPS._zoneOpen?.[key]!==false;
    return `<div class="do-zone">
      <button type="button" class="do-zone-h" aria-expanded="${open?'true':'false'}" aria-controls="${key}" onclick="_opsToggleZone('${key}')"><i></i>${title}${note?`<span class="do-note">${note}</span>`:''}<span class="do-tog">${open?'▲ Απόκρυψη':'▼ Εμφάνιση'}</span></button>
      <div id="${key}" style="display:${open?'block':'none'}">${rows.map(rowHtml).join('')}</div></div>`;
  };
  const ovH=isToday?zone('ovL',OPS.overdue,
    `${OPS.overdue.length} ${OPS.overdue.length===1?'εκκρεμής παράδοση':'εκκρεμείς παραδόσεις'} από προηγούμενες ημέρες`,'',
    r=>{const f=r.fields, n=_daysAgo(f['Delivery DateTime']);
      return `<div class="do-zrow" id="r_${r.id}"><span class="do-cl">${_C(f)}</span><span class="do-rt">${OrdersStock.isLot(f)?_OPS_LOT_TAG:''}${route(r)}${_opsWho(f)}${_opsRelayInline(r,'ovd')}</span>
        <span class="do-late">παράδοση ${_DMY(f['Delivery DateTime'])} · ${_agoTxt(n)}</span>
        ${_opsSlots(r,'ovd')}</div>${OPS._expanded?.has(r.id)?_opsSubRows(r,'Unloading',true):''}`;}):'';
  const ovLH=isToday?zone('ovLoad',OPS.overdueLoads,
    `${OPS.overdueLoads.length} ${OPS.overdueLoads.length===1?'εκκρεμής φόρτωση':'εκκρεμείς φορτώσεις'} από προηγούμενες ημέρες`,
    'δεν φορτώθηκε και δεν μετατέθηκε',
    r=>{const f=r.fields, n=_daysAgo(f['Loading DateTime']);
      const pre=isPreorder(f), ps=_opsPieceSub(f);
      return `<div class="do-zrow${pre?' do-pre':''}" id="r_${r.id}"><span class="do-cl">${_C(f)}${pre?' '+preorderChipHtml(f):''}</span><span class="do-rt">${pre?escapeHtml(preorderCountryText(f)||'—'):route(r)}${_opsWho(f)}${ps?`<span class="do-sl">${ps}</span>`:''}${_opsRelayInline(r,'ovl')}</span>
        <span class="do-late">φόρτωση ${_DMY(f['Loading DateTime'])} · ${_agoTxt(n)}</span>
        ${_opsSlots(r,'ovl')}</div>${OPS._expanded?.has(r.id)?_opsSubRows(r,'Loading',true):''}`;}):'';
  // 060: relays live in their own request — a failure is said, never read as «no local driver».
  const relErr=OPS.relaysErr?`<div class="do-err"><span>Οι τοπικές παραδόσεις/φορτώσεις δεν φορτώθηκαν — δεν σημαίνει ότι δεν υπάρχουν. Η στήλη ΑΝΑΘΕΣΗ δείχνει μόνο τον διεθνή οδηγό.</span><button class="do-btn" onclick="renderDailyOps()">Ξαναδοκίμασε</button></div>`:'';
  const ovLErr=isToday&&OPS.overdueLoadsErr?`<div class="do-err"><span>Η ζώνη εκκρεμών φορτώσεων δεν φορτώθηκε — δεν σημαίνει ότι δεν υπάρχουν εκκρεμείς φορτώσεις. Οι υπόλοιπες ενότητες είναι ενημερωμένες.</span><button class="do-btn" onclick="renderDailyOps()">Ξαναδοκίμασε</button></div>`:'';

  // Quick filters with nothing behind them are disabled (D2): a choice that
  // can only produce an empty table is not a choice. Counted on the day's
  // records BEFORE the user's own filters, so the options never disable each
  // other away.
  const nDir={export:0,import:0}, nSt={};
  for(const r of OPS.intl){ const f=r.fields; const d=(f['Direction']||'').trim().toLowerCase(); nDir[(d==='import'||d==='↓ import')?'import':'export']++; const s=f['Status']||''; nSt[s]=(nSt[s]||0)+1; }
  const opt=(v,lbl,cur,n)=>`<option value="${v}"${cur===v?' selected':''}${n?'':' disabled'}>${lbl}</option>`;

  const upd=OPS.loadedAt?String(OPS.loadedAt.getHours()).padStart(2,'0')+':'+String(OPS.loadedAt.getMinutes()).padStart(2,'0'):'';
  document.getElementById('content').innerHTML=`${_OPS_STYLE}
    <div class="do-page">
    <div class="do-top">
      <h1 class="do-h1">Ημερήσιο Πλάνο</h1>
      <span class="do-sub">${fD(tgt)} · ${total} ${total===1?'παραγγελία':'παραγγελίες'} ${_opsDayWord()}${pendN?` · <b>${pendN} ${pendN===1?'εκκρεμής':'εκκρεμείς'}</b>`:''}</span>
      ${preorderCounterHtml([...new Map([...all,...(isToday?OPS.overdueLoads:[])].map(r=>[r.id,r.fields])).values()],"preorderJump('.do-page .do-pre')")}
      <div class="do-seg">
        <button class="${OPS.date==='yesterday'?'on':''}" onclick="OPS.date='yesterday';renderDailyOps()">Χθες</button>
        <button class="${isToday?'on':''}" onclick="OPS.date='today';renderDailyOps()">Σήμερα</button>
        <button class="${OPS.date==='tomorrow'?'on':''}" onclick="OPS.date='tomorrow';renderDailyOps()">Αύριο</button>
        <input type="date" value="${tgt}" title="Άλλη ημερομηνία"
          onchange="OPS.date=this.value;renderDailyOps()">
      </div>
      <select class="do-sel" onchange="_opsSetFilter('direction', this.value)">
        <option value="">Κατεύθυνση: Όλες</option>
        ${opt('export','Εξαγωγή',OPS.filters?.direction,nDir.export)}
        ${opt('import','Εισαγωγή',OPS.filters?.direction,nDir.import)}
      </select>
      <select class="do-sel" onchange="_opsSetFilter('status', this.value)">
        <option value="">Κατάσταση: Όλες</option>
        ${opt('Pending','Σε αναμονή',OPS.filters?.status,nSt['Pending'])}
        ${opt('Assigned','Ανατεθειμένο',OPS.filters?.status,nSt['Assigned'])}
        ${opt('In Transit','Σε μεταφορά',OPS.filters?.status,nSt['In Transit'])}
        ${opt('Delivered','Παραδόθηκε',OPS.filters?.status,nSt['Delivered'])}
      </select>
      <input type="text" class="do-q" placeholder="Αναζήτηση…" value="${escapeHtml(OPS.filters?.q||'')}" oninput="_opsSetFilter('q', this.value)">
      ${(OPS.filters?.q||OPS.filters?.direction||OPS.filters?.status) ? `<button class="do-link" onclick="OPS.filters={q:'',direction:'',status:''};renderDailyOps()">Καθαρισμός</button>` : ''}
      <div class="do-right">
        <button class="btn btn-secondary btn-sm" onclick="_opsPrint()">Εκτύπωση</button>
        <button class="do-link" onclick="renderDailyOps()">Ανανέωση</button>
      </div>
    </div>
    <div class="do-kpis">${kpi('ΦΟΡΤΩΣΕΙΣ',loadsDone,loadsAll.length,false)}${kpi('ΠΑΡΑΔΟΣΕΙΣ',delsDone,delsAll.length,true)}</div>
    ${ovH}${ovLH}${ovLErr}${relErr}
    <div class="ops-sections" style="gap:0">
      ${_opsSec('el','ΦΟΡΤΩΣΕΙΣ ΕΞΑΓΩΓΗΣ',cats.el,isToday,'Καμία παραγγελία εξαγωγής για φόρτωση',1)}
      ${_opsSec('ed','ΠΑΡΑΔΟΣΕΙΣ ΕΞΑΓΩΓΗΣ',cats.ed,isToday,'Καμία παραγγελία εξαγωγής για παράδοση',1)}
      ${_opsSec('il','ΦΟΡΤΩΣΕΙΣ ΕΙΣΑΓΩΓΗΣ',cats.il,isToday,'Καμία παραγγελία εισαγωγής για φόρτωση',1)}
      ${_opsSec('id','ΠΑΡΑΔΟΣΕΙΣ ΕΙΣΑΓΩΓΗΣ',cats.id,isToday,'Καμία παραγγελία εισαγωγής για παράδοση',1)}
    </div>
    <div class="do-foot">ORDERS · φίλτρο ημέρας ${_DMYFull(tgt)} · ${OPS.intl.length} ${OPS.intl.length===1?'εγγραφή':'εγγραφές'}${pendN?` + ${pendN} ${pendN===1?'εκκρεμής':'εκκρεμείς'}`:''}${upd?` · ενημερώθηκε ${upd}`:''}</div>
    </div>`;
}

/* ── FOUR SECTIONS ─────────────────────────────────────────────────────
   Restored on the owner's instruction: Export Loadings, Export Deliveries,
   Import Loadings, Import Deliveries, each with only the columns that apply to
   it. The DEEP_AUDIT_2026-08-04 DO-2/DO-3 rewrite folded these into one
   time-sorted table with a «ΕΛΕΓΧΟΙ» cell; the dispatchers read the day by
   section, not by clock, so the sections are back. Locked again 2/9. */

function _opsToggleZone(key) {
  const l = document.getElementById(key);
  if (!l) return;
  OPS._zoneOpen = OPS._zoneOpen || {};
  const willOpen = l.style.display === 'none';
  OPS._zoneOpen[key] = willOpen;
  l.style.display = willOpen ? 'block' : 'none';
  const btn = l.previousElementSibling;
  if (btn) { btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false'); const t = btn.querySelector('.do-tog'); if (t) t.textContent = willOpen ? '▲ Απόκρυψη' : '▼ Εμφάνιση'; }
}

// `start`: numbering restarts at 1 in EVERY section (owner 27/9, on dispatcher
// Παντελής's request). 3/9 had made it run on across sections so «το 7» named
// a single row on the phone; the dispatchers asked for the opposite — exports
// 1–5 followed by imports 7–10 did not match how they read the day, section
// by section. A row is now named by section + number. Callers pass 1; the
// parameter stays because the grouped export rows count from it.
function _opsSec(type,label,items,isToday,emptyTxt,start) {
  const isL=type==='el'||type==='il', isExp=type==='el'||type==='ed';
  const when=_opsDayWord();
  // Στήλες ανά ενότητα (Figma 169:699): ΘΕΡΜ./ΕΓΓΡΑΦΑ/ΦΩΤΟ CMR/ΕΝΗΜΕΡΩΣΗ
  // ΠΕΛΑΤΗ/2Η ΚΑΡΤΑ αφαιρέθηκαν (owner 2/9)· ΚΑΤΑΣΤΑΣΗ = νέα στήλη λέξης.
  // ΦΟΡΤΗΓΟ + ΟΔΗΓΟΣ became one ΑΝΑΘΕΣΗ column (owner 4/9, DESIGN.md E): the
  // dispatcher reads WHO carries the load — plate + driver (own fleet, no
  // tag since 22/9), green «ΣΥΝ.» + partner name, or «ΠΡΟΣ ΑΝΑΘΕΣΗ». Two
  // columns showed «—» and «χωρίς οδηγό» for the same fact.
  // Same 8 columns in every section (Παντελής 15/9): where a section has one
  // field instead of ΠΑΛ.+ΠΡΟΚ. it spans the two, so nothing shifts.
  const mid = isL&&isExp ? '<th>ΦΟΡΤΩΣΗ</th><th>ΑΝΑΘΕΣΗ</th><th>ΠΑΛ.</th><th>ΠΡΟΚ. €</th>'
            : isL       ? '<th>ΦΟΡΤΩΣΗ</th><th>ΑΝΑΘΕΣΗ</th><th colspan="2">ΩΡΑ</th>'
                        : '<th>ΠΑΡΑΔΟΣΗ</th><th>ΑΝΑΘΕΣΗ</th><th colspan="2">ΕΚΤ. ΑΦΙΞΗ</th>';
  const cols=`<th>#</th><th>ΠΕΛΑΤΗΣ</th>${mid}<th>ΚΑΤΑΣΤΑΣΗ</th><th style="text-align:right">ΕΝΕΡΓΕΙΕΣ</th>`;
  const colg='<colgroup><col style="width:32px"><col><col><col style="width:200px"><col style="width:56px"><col style="width:80px"><col style="width:206px"><col style="width:320px"></colgroup>';
  // A lot's delivery is its warehouse intake (C-01): the KPI ΠΑΡΑΔΟΣΕΙΣ leaves
  // it out, so the section header counts the same way and names the intake
  // apart (critic-1 C1-11) — «2 · 1 δηλωμένη» under a KPI «0 / 1» read as two
  // different facts about the same row.
  const isLotRow=r=>!isL&&OrdersStock.isLot(r.fields);
  const lotN=items.filter(isLotRow).length;
  const done=items.filter(r=>!isLotRow(r)&&(isL?['In Transit','Delivered'].includes(r.fields['Status']||''):(r.fields['Status']||'')==='Delivered')).length;
  const preN=items.filter(r=>isPreorder(r.fields)).length;
  const n=items.length-preN-lotN;
  const cnt=[(n||!lotN)&&`${n} · ${done} ${done===1?'δηλωμένη':'δηλωμένες'}`, preN&&`${preN} pre-order`,
    lotN&&`${lotN} ${lotN===1?'παραλαβή':'παραλαβές'} αποθήκης`].filter(Boolean).join(' · ');
  const head=`<div class="do-sec-h">${label}<span>${items.length?cnt:`— καμία ${when}`}</span></div>`;
  if(!items.length) return `<div class="do-sec">${head}<div class="do-empty">${emptyTxt} ${when}</div></div>`;
  return `<div class="do-sec">${head}
    <div style="overflow-x:auto"><table class="do-t">${colg}<thead><tr>${cols}</tr></thead><tbody>${isL&&isExp?_opsGroupedRows(items,start,type,isToday):items.map((r,i)=>_opsRow(r,start+i,type,isToday)).join('')}</tbody></table></div>
  </div>`;
}

/* ── ΙΔΙΑ ΕΞΑΓΩΓΗ = ΜΙΑ ΓΡΑΜΜΗ (Παντελής 15/9, Figma 647:1011, owner) ────
   Export loadings that ride the same truck — same Group ID, else the same
   Truck on the day — collapse into one summary row that opens into the
   member rows, exactly like a multi-stop order opens into its stops: the
   same OPS._expanded set, key 'g:<key>', the same _opsToggleStops. The
   summary never declares (owner 26/8 for multi-stop): «Φορτώθηκε» on it just
   opens the group; each member keeps its own buttons and its own number, so
   «το 7» on the phone still means one order. A lone order is drawn as
   before — nothing changes for the 1-order case. Members are drawn adjacent
   so their numbers stay contiguous («2–4»). */
function _opsGroupKey(f){
  const gid=f['Group ID']?String(f['Group ID']).split('|')[0]:'';
  if(gid) return 'G'+gid.replace(/[^A-Za-z0-9_-]/g,'');
  const tk=getLinkedId(f['Truck']);
  return tk?'T'+String(tk).replace(/[^A-Za-z0-9_-]/g,''):'';
}
function _opsGroupedRows(items,start,type,isToday){
  const byKey={};
  items.forEach(r=>{ const k=_opsGroupKey(r.fields); if(k) (byKey[k]=byKey[k]||[]).push(r); });
  const emitted=new Set(); const parts=[]; let n=start;
  for(const r of items){
    if(emitted.has(r.id)) continue;
    const k=_opsGroupKey(r.fields);
    const g=k&&byKey[k].length>1?byKey[k]:null;
    if(!g){ parts.push(_opsRow(r,n++,type,isToday)); continue; }
    const open=!!(OPS._expanded&&OPS._expanded.has('g:'+k));
    parts.push(_opsGroupRow(k,g,n,n+g.length-1,isToday,open));
    g.forEach(m=>{ emitted.add(m.id); if(open) parts.push(_opsRow(m,n,type,isToday,'do-gm')); n++; });
  }
  return parts.join('');
}
function _opsGroupRow(key,g,from,to,isToday,open){
  const id='g:'+key, f0=g[0].fields;
  const clients=[...new Set(g.map(m=>_C(m.fields)).filter(Boolean))].map(s=>String(s).toUpperCase()).join(' · ');
  // Owner 15/9 (via coordinator): less noise on the summary — more than two
  // distinct loading points read as a count, the names live in the members.
  const locList=[...new Set(g.map(m=>_L(_opsStopLoc(m.id,'Loading'))).filter(Boolean))];
  const locs=locList.length>2?`${locList.length} σημεία`:locList.join(' · ');
  // Sum only what is a number; no numbers at all = «—», never 0 (DESIGN.md #3).
  const nums=g.map(m=>m.fields['Total Pallets']).filter(v=>v!=null&&v!=='').map(Number).filter(v=>!isNaN(v));
  const pal=nums.length?nums.reduce((a,b)=>a+b,0):'—';
  const done=g.filter(m=>['In Transit','Delivered'].includes(m.fields['Status']||'')).length;
  const all=done===g.length;
  const gStamp=_opsStamp(g.flatMap(m=>_opsStopsOf(m.id,'Loading')),_opsTgt());
  const by=gStamp?`<span class="do-sl">${gStamp}</span>`:'';
  const st=(all?`<span class="do-st-done">Φορτώθηκαν ✓</span>`
    :`<span class="do-pill" onclick="event.stopPropagation();_opsToggleStops('${id}')" title="Κλικ: οι φορτώσεις μία-μία — δηλώνεις όποια έγινε, οι άλλες περιμένουν">${done}/${g.length} φορτώθηκαν ${open?'▾':'▸'}</span>`)+by;
  // ΠΡΟΚ. € and «Αλλαγή ημέρας» belong to one order each — not on the summary.
  const act=!_opsIsFuture()&&!all?`<div class="do-slots"><span class="do-slot"><button class="do-btn" onclick="event.stopPropagation();_opsToggleStops('${id}')">Φορτώθηκε</button></span></div>`:'';
  return `<tr id="r_${id}" class="do-hover do-grp${open?' do-open':''}" style="cursor:pointer" onclick="if(!event.target.closest('button,input,select,a'))_opsToggleStops('${id}')"><td class="do-num">${from}–${to}</td><td class="do-wrap"><span class="do-main">${g.length} φορτώσεις</span><span class="do-sl">${clients}</span></td><td class="do-wrap"><span class="do-main">${locs||'—'}</span></td>${_opsGroupRelayCell(g)||_opsAsgCell(f0,_TT(f0),_D(f0),_P(f0))}<td>${pal}</td><td>—</td><td class="do-st">${st}</td><td class="do-acts">${act}</td></tr>`;
}

/* ── ROW ──────────────────────────────────────────────────────── */
// Η κατάσταση είναι ΜΟΝΟ η λέξη (owner 3/9, DECISION_LOG 2/9 επιλογή 2): το
// frame δείχνει «Σε μεταφορά · 06:32 · Παντελής», αλλά ώρα/όνομα δεν υπάρχουν
// στη βάση (loaded_at απορρίφθηκε) και το audit_log ΔΕΝ διαβάζεται ως
// παράκαμψη. Συνειδητή απόκλιση από το frame.
// Η λέξη μιλά τη γλώσσα της ΕΝΟΤΗΤΑΣ, δύο καταστάσεις μόνο (3/9): ως τώρα το
// ίδιο «Σε μεταφορά», στο ίδιο μπλε, σήμαινε ΕΓΙΝΕ στις ΦΟΡΤΩΣΕΙΣ και ΔΕΝ
// ΕΓΙΝΕ στις ΠΑΡΑΔΟΣΕΙΣ — και μέσα στις Φορτώσεις συνυπήρχε με το «Παραδόθηκε
// ✓» εννοώντας κι εκείνο «τελείωσε». Το λεξιλόγιο της ΒΑΣΗΣ (Pending/Assigned/
// In Transit/Delivered) ΔΕΝ αγγίζεται — αλλάζει μόνο η λέξη στην οθόνη.
// Το εκκρεμές είναι το εντονότερο της στήλης: είναι η δουλειά που μένει.
function _opsStatusWord(f, multiPill, isL, stamp, rel) {
  const st=f['Status']||'';
  const done=isL ? (st==='In Transit'||st==='Delivered') : st==='Delivered';
  const by=stamp?`<span class="do-sl">${stamp}</span>`:'';
  // 060: the order's status says it happened, the relay says by whom.
  const loc=rel?getDriverName(getLinkedId(rel.fields['Driver'])):'';
  if(done) return `<span class="do-st-done">${isL?'Φορτώθηκε':OrdersStock.isLot(f)?'Στην αποθήκη':'Παραδόθηκε'}${loc?' από τοπικό '+loc:''} ✓</span>${by}`;
  // «μετατέθηκε»: το Postponed To κρατά τη ΝΕΑ ημέρα — η γραμμή είναι ενεργή
  // εκείνη τη μέρα, με τα κουμπιά της. Μένει ως δευτερεύουσα σημείωση, όχι ως
  // τρίτη κατάσταση. Το «από 30/8» ΔΕΝ δείχνεται: θέλει write-once
  // original_loading_date ή audit_log — κανένα εγκεκριμένο (ΑΝΟΙΧΤΟ).
  const moved=f['Postponed To']?' <span class="do-st-moved">μετατέθηκε</span>':'';
  return `<span class="do-st-wait">Εκκρεμεί</span>${moved}${multiPill?' '+multiPill:''}${by}`;
}
// Latest stamp among the given stops: «από <Completed By> · HH:MM». Completed
// By holds the header name (_opsUser writes tms_user.name), so it is shown as
// stored. A stamp from another day than the one on screen carries its date,
// so a Tuesday «07:12» is never mistaken for Monday's.
function _opsStamp(stops, dayIso){
  const done=stops.filter(s=>s.fields['Completed At']).sort((a,b)=>String(b.fields['Completed At']).localeCompare(String(a.fields['Completed At'])));
  if(!done.length) return '';
  const f=done[0].fields, at=f['Completed At'];
  let when=_HM(at); try{ if(toLocalDate(at)!==dayIso) when=_DMY(toLocalDate(at))+(when?' '+when:''); }catch(_){}
  const who=escapeHtml(String(f['Completed By']||''));
  return `${who?'από '+who:''}${who&&when?' · ':''}${when}`;
}

// ΕΝΕΡΓΕΙΕΣ: κύριο κουμπί, «Καθυστέρησε» στις παραδόσεις, «Αλλαγή ημέρας»
// ΟΡΑΤΗ. Κάθε θυρίδα που αποδίδεται είναι γεμάτη — μέσα στην ενότητα όλες οι
// ανοιχτές γραμμές έχουν το ίδιο σχήμα, άρα η στήλη διαβάζεται κάθετα.
//
// Το «⋯» έφυγε (3/9): έκρυβε ΕΝΑ στοιχείο, την ίδια «Αλλαγή ημέρας» που στις
// ζώνες ήταν ήδη ορατός σύνδεσμος, και η κενή μεσαία θυρίδα σε 25/32 γραμμές
// των ΦΟΡΤΩΣΕΩΝ άφηνε 104px κενού ανάμεσα στο κουμπί και σε αυτό.
// ctx: el/ed/il/id/ovd/ovl.
function _opsSlots(rec, ctx) {
  const f=rec.fields, id=rec.id;
  const st=f['Status']||'';
  const isL=ctx==='el'||ctx==='il'||ctx==='ovl';
  const isOv=ctx==='ovd'||ctx==='ovl';
  const stype=isL?'Loading':'Unloading';
  const multi=_opsStopsOf(id,stype).length>1;
  // 3/9: buttons only on «today», because the declaration wrote today's date
  // and on any other day that was a lie in the database. 16/9 (owner): the
  // rule is cancelled — retroactive declarations are the norm (weekend work
  // entered on Monday). The date lie is removed at the source instead: every
  // writer stamps the viewed day (_opsTgt / _opsNowOnTgt). Only a future day
  // has no buttons.
  // Pre-order (owner 22/9): «Φορτώθηκε» on a load without a point would be a
  // lie in the base — the only action is to complete it. Any role that may
  // act here (planning:full) may convert; the form enforces the six fields.
  if(isPreorder(f)) return `<div class="do-slots"><span class="do-slot"><button class="do-btn" onclick="event.stopPropagation();_opsConvert('${id}')">Μετατροπή</button></span></div>`;
  // A stock piece with no truck (round-1 K6): today's loading is real work, so
  // the row stays — but «Φορτώθηκε» would claim a load nobody made (the base
  // refuses it, piece_no_truck). Its truck is chosen from the ΑΠΟΘΕΜΑ strip of
  // the Weekly («+ Κομμάτι από απόθεμα…»), which is where the row points.
  if(OrdersStock.isLoose(f)) return `<div class="do-slots"><span class="do-slot do-sub">χωρίς φορτηγό — από το ΑΠΟΘΕΜΑ του Εβδομαδιαίου</span></div>`;
  const done=st==='Delivered'||(isL&&st==='In Transit');
  if(done) return '';
  const slots=[];
  // 060: the button stays one short word (three slots share 320px); the
  // local driver's name rides in its tooltip and in the confirm question.
  const _rel=_opsRelay(id,ctx), _rn=_rel?getDriverName(getLinkedId(_rel.fields['Driver'])):'';
  const tip=_rn?` title="${isL?'Φορτώθηκε':'Παραδόθηκε'} από τοπικό ${_rn}"`:'';
  if(!_opsIsFuture()){
    if(isL){
      // Multi: το κουμπί της σύνοψης ΔΕΝ δηλώνει — ανοίγει τα σημεία (owner 26/8)
      slots.push(multi?`<button class="do-btn" onclick="event.stopPropagation();_opsToggleStops('${id}')">Φορτώθηκε</button>`
                      :`<button class="do-btn"${tip} onclick="confirmAction(_opsAsk('${id}','${ctx}','Φορτώθηκε')).then(ok=>{if(ok)_opsStat('${id}','In Transit')})">Φορτώθηκε</button>`);
    } else {
      const okFn=isOv?`_opsOvAct('${id}','On Time')`:`_opsDel('${id}','On Time')`;
      const lateFn=isOv?`_opsOvAct('${id}','Delayed')`:`_opsDel('${id}','Delayed')`;
      // C-01: the same write (Delivered = intake), named for what it is. The
      // late button too (critic-1 C1-08): on a lot «Καθυστέρησε» read at 06:00
      // as «the partner is late» — one click then WROTE the intake (Delivered,
      // pallets locked, pieces drawable) for stock that had not arrived.
      const lot=OrdersStock.isLot(f);
      const okW=lot?'Παραλαβή αποθήκης':'Παραδόθηκε';
      const lateW=lot?'Παραλαβή (καθυστέρηση)':'Καθυστέρησε';
      const lateQ=lot?'Παραλήφθηκε στην αποθήκη με καθυστέρηση;':'Καθυστέρησε;';
      // 060: the confirm question names the local driver when a relay exists.
      slots.push(multi?`<button class="do-btn" onclick="event.stopPropagation();_opsToggleStops('${id}')">${okW}</button>`
                      :`<button class="do-btn"${tip} onclick="confirmAction(_opsAsk('${id}','${ctx}','${okW}')).then(ok=>{if(ok)${okFn}})">${okW}</button>`);
      const lateC=lot?'do-late-btn do-2l':'do-late-btn';
      slots.push(multi?`<button class="${lateC}" onclick="event.stopPropagation();_opsToggleStops('${id}')">${lateW}</button>`
                      :`<button class="${lateC}" onclick="confirmAction('${lateQ}').then(ok=>{if(ok)${lateFn}})">${lateW}</button>`);
    }
  }
  slots.push(`<button class="do-ghost" onclick="_opsChangeDay(event,'${id}','${isL?'load':'deliver'}')">Αλλαγή ημέρας</button>`);
  return `<div class="do-slots">${slots.map(s=>`<span class="do-slot">${s}</span>`).join('')}</div>`;
}

function _opsRow(rec,num,type,isToday,cls) {
  const f=rec.fields, id=rec.id;
  const client=_C(f), sub=_CSub(f);
  const pre=isPreorder(f);
  // Pre-order (owner 28/9): no points — the place cell names the foreign
  // country (export → destination, import → loading), and the pallets are
  // unknown, not 0 (the view sums empty stops to 0).
  const preCC=pre?(escapeHtml(preorderCountryText(f))||'—'):'';
  const loadL=pre?preCC:_L(_opsStopLoc(id,'Loading'));
  const delivL=pre?preCC:_L(_opsStopLoc(id,'Unloading'));
  const truck=_TT(f), driver=_D(f), partner=_P(f);
  // Missing is not zero and not blank (DESIGN.md #3): a dash.
  const pal=!pre&&f['Total Pallets']!=null&&f['Total Pallets']!==''?f['Total Pallets']:'—';
  const st=f['Status']||'';
  const isDone=st==='Delivered';
  const isL=type==='el'||type==='il', isExp=type==='el'||type==='ed';
  const _stype=isL?'Loading':'Unloading';
  const _mStops=_opsStopsOf(id,_stype);
  const _multi=_mStops.length>1;
  const _expanded=_multi && OPS._expanded && OPS._expanded.has(id);

  const timeSelect=(fld,v)=>{
    const hrs=[];for(let h=0;h<24;h++)for(let m=0;m<60;m+=30){const t=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');hrs.push(t);}
    return `<select class="do-tinp" onchange="_opsSvF('${id}','${fld}',this.value)"><option value="">--:--</option>${hrs.map(t=>`<option value="${t}"${v===t?' selected':''}>${t}</option>`).join('')}</select>`;
  };
  const amtInp=(fld,v)=>`<input class="do-tinp" type="number" step="1" value="${v||''}" placeholder="—" style="width:64px" onblur="_opsSvF('${id}','${fld}',parseFloat(this.value)||null)">`;

  // Scan round 3: paperclip badge — every row here is an international ORDERS
  // record (module docstring: "International ORDERS only"), so the plain
  // record id is always the right key for OrderDocs.
  const docBadge=typeof OrderDocs!=='undefined'?OrderDocs.badge(id,{size:12}):'';
  const cl=`<td class="do-wrap"><span class="do-main">${client}${docBadge}</span>${sub?`<span class="do-sl">${sub}</span>`:''}</td>`;
  // Χωρίς ώρα δεν αποδίδεται ΤΙΠΟΤΑ — όπως ήδη κάνει η υπογραμμή πελάτη.
  // Οι στήλες loading_datetime/delivery_datetime είναι `date` στη βάση, άρα
  // το `_HM` γυρίζει πάντα κενό: το «—» κρεμόταν κάτω από ΚΑΘΕ τοποθεσία σε
  // κάθε γραμμή και διαβαζόταν ως «η ώρα είναι άγνωστη» ενώ ώρα δεν υπάρχει
  // καν ως έννοια (κανόνας #3: «—» σημαίνει άγνωστο).
  const locCell=(name,dt,sub)=>{const hm=_HM(dt);
    return `<td class="do-wrap"><span class="do-main">${name||'—'}</span>${hm?`<span class="do-sl">${hm}</span>`:''}${sub?`<span class="do-sl">${sub}</span>`:''}</td>`;};
  // Stock lots Φ1 (impact map 4/10 C-04): «ΑΠ · 5p · παρτίδα #312».
  const pieceSub=_opsPieceSub(f);
  const lotTag=!isL&&OrdersStock.isLot(f)?_OPS_LOT_TAG:'';
  // Assignment cell — colour AND word (DESIGN.md E, owner 4/9). «ΠΡΟΣ
  // ΑΝΑΘΕΣΗ», not «χωρίς οδηγό»: the empty cell means the dispatcher owes an
  // action, not that a driver is missing. Partner trips name the company —
  // the generic word «συνεργάτης» told the phone caller nothing.
  // A relay (060) puts the LOCAL driver first; no relay = the cell as before.
  const asgCell=_opsRelayCell(rec, type) || _opsAsgCell(f, truck, driver, partner);
  const pill=_opsStopsBadge(id,_stype);
  const stCell=pre
    ? `<td class="do-st">${preorderChipHtml(f)}${f['Notes']?`<span class="do-sl">${escapeHtml(String(f['Notes']))}</span>`:''}</td>`
    : `<td class="do-st">${_opsStatusWord(f,pill,isL,_opsStamp(_mStops,_opsTgt()),_opsRelay(id,type))}</td>`;
  const actCell=`<td class="do-acts">${_opsSlots(rec,type)}</td>`;

  let mid='';
  if(isL&&isExp) mid=`${locCell(loadL,f['Loading DateTime'],pieceSub)}${asgCell}<td>${pal}</td><td>${!partner?amtInp('Advance Paid',f['Advance Paid']):''}</td>`;
  else if(isL)   mid=`${locCell(loadL,f['Loading DateTime'],pieceSub)}${asgCell}<td colspan="2">${timeSelect('ETA',f['ETA'])}</td>`;
  else           mid=`${locCell(lotTag+(delivL||'—'),f['Delivery DateTime'])}${asgCell}<td colspan="2">${timeSelect('ETA',f['ETA'])}</td>`;

  // Multi: κλικ στη γραμμή (όχι σε κουμπί/πεδίο) ανοίγει τα σημεία· οι
  // υπο-γραμμές ακολουθούν το tr ώστε να ζουν στο ίδιο tbody. Η ανοιχτή
  // γραμμή κρατά το φόντο επιλογής (.do-open) όσο είναι ανοιχτή.
  const _trClick=_multi?` onclick="if(!event.target.closest('button,input,select,a'))_opsToggleStops('${id}')"`:'';
  return `<tr id="r_${id}" class="do-hover${cls?' '+cls:''}${isDone?' do-done':''}${_expanded?' do-open':''}${pre?' do-pre pre-'+preorderLevel(f):''}" style="${_multi?'cursor:pointer':''}"${_trClick}><td class="do-num">${num}</td>${cl}${mid}${stCell}${actCell}</tr>`+(_expanded?_opsSubRows(rec,_stype):'');
}

// Own fleet = a plate or a driver on a non-partner trip. A plate without a
// driver is still own fleet — the truck is ours, the driver line just stays
// empty. No «ΙΔ.» tag (Παντελής 22/9): own is the default, the plate says it.
// «Partner Truck Plates» is NOT requested in OPS_FIELDS (the request must stay
// byte-identical to the 28/8 recording), so the partner line shows only the
// company; when the pair-inherit above brought plates in memory, they appear.
function _opsAsgCell(f, truck, driver, partner) {
  const sub=s=>s?`<span class="do-sl">${s}</span>`:'';
  if(partner){
    const name=getPartnerName(getLinkedId(f['Partner']))||'—';
    const plates=escapeHtml(String(f['Partner Truck Plates']||''));
    return `<td class="do-asg do-wrap prt"><span class="do-main"><span class="do-tag prt">ΣΥΝ.</span>${name}</span>${sub([plates,driver].filter(Boolean).join(' · '))}</td>`;
  }
  if(truck||driver){
    // `truck` is already «plate / trailer», escaped by the ref helpers.
    return `<td class="do-asg do-wrap"><span class="do-main">${truck||'—'}</span>${sub(driver)}</td>`;
  }
  return `<td class="do-asg do-wrap"><span class="do-main"><span class="do-tag none">ΠΡΟΣ ΑΝΑΘΕΣΗ</span></span></td>`;
}

/* ── ΤΟΠΙΚΟΣ ΟΔΗΓΟΣ (060, owner 4/10) ─────────────────────────────────
   The order keeps the international driver, truck and RT; the relay only
   says who does the last (import delivery) or first (export loading) leg
   near Veroia. So ΑΝΑΘΕΣΗ leads with the LOCAL driver and keeps the
   international one underneath (plan §3, «Στο Ημερήσιο φαίνεται ο τοπικός,
   με τον διεθνή από κάτω»). A relay exists only on an import delivery or an
   export loading — the base refuses any other pairing. «Done» is never the
   relay's: the ✓ stays the order's own status write. */
const _opsRelayKind=ctx=>(ctx==='el'||ctx==='ovl')?'relay_loading':(ctx==='id'||ctx==='ovd')?'relay_delivery':null;
function _opsRelayAny(orderId, kind){ return ((OPS.relays||{})[orderId]||{})[kind]||null; }
function _opsRelay(id, ctx){ const k=_opsRelayKind(ctx); return k?_opsRelayAny(id, k):null; }
// Who may open the panel = who may act on this page (planning:full), the same
// gate as every other button here. warehouse/management/accountant see the
// relay as text only.
const _opsCanRelay=()=>typeof can!=='function'||can('planning')==='full';
// Raw (unescaped) local driver name — for confirmAction, which escapes itself.
function _opsRelayDriverRaw(rel){ const id=getLinkedId(rel&&rel.fields['Driver']); const d=id?getRefDrivers().find(r=>r.id===id):null; return d?String(d.fields['Full Name']||''):''; }
// «ίδιο CB1284KE · ρυμ. P59498» over «διεθν. Οδηγός» — two lines, so the
// 200px column never breaks a name in half. No Truck on the relay = the
// local drives the order's own tractor (owner Q1 4/10: «παίζει και τα 2»); a
// Truck = his own tractor with a trailer swap. The trailer is the relay's own
// (the base requires it once a local driver is set), which is how a
// drop-and-hook shows here while the RT keeps one trailer.
function _opsRelaySub(rel, f){
  const rf=rel.fields;
  const other=getLinkedId(rf['Truck']);
  const truck=other?'άλλο '+(getTruckPlate(other)||'—'):(_T(f)?'ίδιο '+_T(f):'ίδιο φορτηγό');
  const tid=getLinkedId(rf['Trailer']); const t=tid?getRefTrailers().find(r=>r.id===tid):null;
  const trl=t?escapeHtml(t.fields['License Plate']||''):'';
  const intl=_P(f)?('συν. '+(getPartnerName(getLinkedId(f['Partner']))||'—')):(_D(f)?'διεθν. '+_D(f):'');
  return `<span class="do-sl">${[truck, trl?'ρυμ. '+trl:''].filter(Boolean).join(' · ')}</span>${intl?`<span class="do-sl">${intl}</span>`:''}`;
}
// The clickable part (planning:full only). A span, not a <button>: the print
// view hides every button, and the relay must stay on paper (_opsPrint).
function _opsRelayClick(orderId, kind){
  if(!_opsCanRelay()) return '';
  const go=`_opsOpenRelay('${orderId}','${kind}')`;
  return ` role="button" tabindex="0" title="Άνοιγμα ${kind==='relay_delivery'?'τοπικής παράδοσης':'τοπικής φόρτωσης'}" onclick="event.stopPropagation();${go}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();${go}}"`;
}
function _opsRelayMain(rel, orderId){
  const drv=getDriverName(getLinkedId(rel.fields['Driver']));
  const hm=rel.fields['Time From']?escapeHtml(String(rel.fields['Time From'])):'';
  // Red word when the relay is declared but nobody is on it yet — the same
  // fact the auditor's B-63 reports the day before.
  const body=drv?`<span class="do-tag loc">ΤΟΠ.</span>${drv}${hm?' · '+hm:''}`:`<span class="do-tag none">ΤΟΠ. ΠΡΟΣ ΑΝΑΘΕΣΗ</span>${hm?' · '+hm:''}`;
  return `<span class="do-main do-rl"${_opsRelayClick(orderId, rel.fields['Move Kind'])}>${body}</span>`;
}
// null when the row has no relay — the caller then draws _opsAsgCell as before.
function _opsRelayCell(rec, ctx){
  const rel=_opsRelay(rec.id, ctx); if(!rel) return null;
  return `<td class="do-asg do-wrap">${_opsRelayMain(rel, rec.id)}${_opsRelaySub(rel, rec.fields)}</td>`;
}
// Collapsed export group: «ΤΟΠ. 2/3 · Papis» = 2 of the 3 loadings have a
// local driver on them. Not clickable — the members below carry their own
// cells (one relay per order; one click for the whole group is Φ2).
function _opsGroupRelayCell(g){
  const rels=g.map(m=>_opsRelay(m.id,'el')).filter(Boolean);
  if(!rels.length) return null;
  const withDrv=rels.filter(r=>getLinkedId(r.fields['Driver']));
  const names=[...new Set(withDrv.map(r=>getDriverName(getLinkedId(r.fields['Driver']))).filter(Boolean))];
  const who=names.length>2?`${names.length} οδηγοί`:names.join(' · ');
  const open=rels.length-withDrv.length;
  const f0=g[0].fields;
  const sub=s=>s?`<span class="do-sl">${s}</span>`:'';
  return `<td class="do-asg do-wrap"><span class="do-main"><span class="do-tag loc">ΤΟΠ.</span>${withDrv.length}/${g.length}${who?' · '+who:''}${open?` <span class="do-tag none">${open} ΠΡΟΣ ΑΝΑΘΕΣΗ</span>`:''}</span>${sub(_TT(f0))}${sub(_D(f0)?'διεθν. '+_D(f0):'')}</td>`;
}
// Overdue zones are flex rows without an ΑΝΑΘΕΣΗ column: one inline piece.
function _opsRelayInline(rec, ctx){
  const rel=_opsRelay(rec.id, ctx); if(!rel) return '';
  return ` ${_opsRelayMain(rel, rec.id)}`;
}
// «Παραδόθηκε από τοπικό Papis;» — computed at click time from the loaded
// relay, so a name never travels inside an onclick string.
function _opsAsk(id, ctx, word){
  const rel=_opsRelay(id, ctx); const n=rel?_opsRelayDriverRaw(rel):'';
  return n?`${word} από τοπικό ${n};`:`${word};`;
}
// The relay panel belongs to Weekly International's builder (core/relay.js:
// the form, the 060 rules said before the click, the save with read-back).
// Daily Ops only opens it — never a second form (principle 3): Relay.openPanel
// hosted in the app's own modal (Daily Ops has no side panel of its own), kind
// = the base's move_kind. Relay.openPanel is the one contract between the two
// screens; no window-level wrapper, so there is no second door to drift.
// Without it (an older cached build) → say so instead of a dead click
// (principle 1). Awaited, so a failure while opening reaches the catch.
async function _opsOpenRelay(orderId, kind){
  if(_opsBlockReadOnly()) return;
  _opsCloseFloat();
  try{
    if(!(window.Relay && typeof window.Relay.openPanel==='function' && typeof openModal==='function')){
      toast('Το πάνελ τοπικού οδηγού δεν είναι διαθέσιμο εδώ — άνοιξέ το από το Weekly Διεθνών (δεξί κλικ στην παραγγελία)','warn');
      return;
    }
    const order=_opsFind(orderId); if(!order) return;
    await window.Relay.openPanel({ order, kind, existing:_opsRelayAny(orderId, kind),
      // The panel's context line is built from Reference/Loading Summary, which
      // OPS_FIELDS does not read (that request stays byte-identical, see
      // _opsAsgCell) — here it would say «— → —», so the client names the order.
      host:{ open:(title, ctx, body, footer)=>openModal(title, `<div class="do-sub">${_C(order.fields)||ctx}</div>${body}`, footer), close:()=>closeModal() },
      // ok=false: written, but the read-back found labels that did not land
      // (facade trap 1) — said, then the day is re-read either way.
      onDone:r=>{ if(r&&r.ok===false) toast('Η τοπική κίνηση γράφτηκε, αλλά ΔΕΝ επιβεβαιώθηκαν: '+(r.problems||[]).join(', '),'warn'); renderDailyOps(); } });
  }catch(e){ if(typeof logError==='function') logError(e,'daily-ops: open relay panel'); toast('Το πάνελ τοπικού οδηγού δεν άνοιξε: '+(e&&e.message||e),'danger'); }
}

/* ── ACTIONS ──────────────────────────────────────────────────── */
async function _opsSvF(id,fld,v){ if(_opsBlockReadOnly()) return; try{await atSafePatch(TABLES.ORDERS,id,{[fld]:v||null});const r=OPS.intl.find(x=>x.id===id);if(r)r.fields[fld]=v;}catch(e){toast('Η αποθήκευση απέτυχε — δεν γράφτηκε τίποτα. Ξαναδοκίμασε.','danger');}}
// ── Επίδοση ΑΝΑ ΣΤΑΣΗ (owner 26/8, v2: αναπτυσσόμενες υπο-γραμμές) ──────
// Τα σημεία ΔΕΝ παραδίδονται μαζί — το ένα σήμερα, το άλλο αύριο. Άρα:
// καμία υποχρέωση ταυτόχρονης απόφασης (το παράθυρο-picker αφαιρέθηκε,
// αρχή 8): η αναλογία x/y φαίνεται ΠΑΝΤΑ στη γραμμή, κλικ ανοίγει μία
// υπο-γραμμή ανά σημείο με ΔΙΚΑ της κουμπιά, κάθε δήλωση ανεξάρτητη.
// Μία στάση = το σημερινό ένα κλικ, καμία ανάπτυξη (το 81% ανέγγιχτο).
function _opsStopsOf(orderId, type){
  return ((OPS._stopsByOrder||{})[orderId]||[])
    .filter(s=>s.fields[F.STOP_TYPE]===type)
    .sort((a,b)=>(a.fields[F.STOP_NUMBER]||0)-(b.fields[F.STOP_NUMBER]||0));
}
function _opsUser(){ try{ return JSON.parse(localStorage.getItem('tms_user')||'{}').name||'unknown'; }catch(_){ return 'unknown'; } }
// The one word the dispatcher needs: «δικαίωμα» for a 403 (the facade's
// message never says it), otherwise the short HTTP/text reason.
function _opsErrWord(e){ const m=String(e&&e.message||e||''); return /403|forbidden|permission/i.test(m)?'χωρίς δικαίωμα':m.slice(0,40)||'σφάλμα'; }
// Returns {stop, prev}: what the stop held before THIS click, so a refused
// order write can put it back (_opsWriteOrder).
async function _opsMarkStop(stop, perf){
  if(_opsBlockReadOnly()) return null;
  const patch={'Completed At': _opsNowOnTgt(), 'Completed By': _opsUser()};
  if(perf) patch['Performance']=perf;
  const prev={}; Object.keys(patch).forEach(k=>{ prev[k]=stop.fields[k]==null?null:stop.fields[k]; });
  await atSafePatch(TABLES.ORDER_STOPS, stop.id, patch);
  Object.assign(stop.fields, patch);
  return {stop, prev};
}
// Σ-02 (critic-3, round 1 X1): the stop stamp is written BEFORE the order (11/9:
// no stamp, no Delivered). When the order write is then REFUSED — a 4xx, the
// server wrote nothing (e._noRetry; e.g. 422 piece_no_truck) — THIS click's
// stamp is put back, so the row is pending again with its button, and the
// message says what really happened. Never «Ξαναδοκίμασε» there: a rule refuses
// the same way every time, and core/api.js already showed its reason (decision
// D2: context only here). Before, the stamp stayed, the toast said «δεν
// γράφτηκε τίποτα», and a multi-stop order showed every point «✓» with no
// button left — never declarable again from this screen.
// A network/5xx failure has an unknown outcome (the order may be written), so
// the stamp stays — un-stamping could leave a Delivered order without its
// stamp, the half-write of 11/9 — and the message says to refresh first.
async function _opsWriteOrder(id, patch, stamped){
  try{ await atSafePatch(TABLES.ORDERS,id,patch); return true; }
  catch(e){
    const refused=!!(e&&e._noRetry);
    let msg, type='danger';
    if(refused&&stamped){
      try{
        await atSafePatch(TABLES.ORDER_STOPS, stamped.stop.id, stamped.prev);
        for(const [k,v] of Object.entries(stamped.prev)){ if(v==null) delete stamped.stop.fields[k]; else stamped.stop.fields[k]=v; }
        msg='Δεν δηλώθηκε — η σφραγίδα του σημείου αναιρέθηκε· η γραμμή μένει εκκρεμής'; type='warn';
      }catch(e2){
        if(typeof logError==='function') logError(e2,'daily-ops: stamp rollback '+id);
        msg='Δεν δηλώθηκε, αλλά η σφραγίδα του σημείου ΕΜΕΙΝΕ γραμμένη (η αναίρεσή της απέτυχε) — ενημέρωσε τον διαχειριστή';
      }
    } else if(refused){ msg='Δεν δηλώθηκε — δεν γράφτηκε τίποτα'; type='warn'; }
    else if(stamped) msg='Η σφραγίδα γράφτηκε, η παραγγελία ΔΕΝ επιβεβαιώθηκε (σύνδεση) — Ανανέωση πριν ξαναδοκιμάσεις';
    else msg='Η αποθήκευση απέτυχε — δεν γράφτηκε τίποτα. Ξαναδοκίμασε.';
    toast(msg,type);
    _opsDraw();
    return false;
  }
}
// R2-4 (critic-1 round 2): the top-bar Undo of «Παραλαβή αποθήκης» put the
// order back and left its pending intake movement (core/pallet-feed.js) in
// the accountant's queue. Right after the order write, THIS order's Revert is
// re-armed to take that movement with it (plOnLotIntakeUndone: pending only; a
// confirmed one is said, never deleted). Only the order's own Revert: when a
// later write of the same click takes the button (the partner assignment's
// status mirror), the order stays Delivered and so does its movement — the
// two never part. type 'create' is the one branch of core/api.js
// undoLastAction that runs a caller's own undo (the national order chain uses
// it the same way, §4 #9), so the button reads «Undo:» instead of «Revert:».
function _opsArmIntakeUndo(id,t0,fields){
  if(!OrdersStock.isLot(fields)||typeof getUndoAction!=='function'||typeof _undoSet!=='function') return;
  const a=getUndoAction();
  if(!a||a.type!=='patch'||a.tableId!==TABLES.ORDERS||a.recId!==id||a.ts<t0) return;
  const {tableId,recId,prevFields,label}=a;
  _undoSet({type:'create',tableId,recId,label,undo:async()=>{
    await atPatch(tableId,recId,prevFields);   // the order first: a refused revert leaves the movement with it
    toast(`Reverted ${label||'edit'}`,'success');
    if(typeof plOnLotIntakeUndone==='function') await plOnLotIntakeUndone(recId);
    return true;
  }});
}
// Η αναλογία φαίνεται ΠΑΝΤΑ (0/2, 1/2, 2/2) — ο χρήστης δεν πατά τίποτα
// για να δει τι απομένει (η αόρατη αλλαγή ήταν το λάθος του picker).
function _opsStopsBadge(id, stype){
  const st=_opsStopsOf(id, stype);
  if(st.length<2) return '';
  const n=st.filter(x=>x.fields['Performance']).length;
  const full=n===st.length;
  const w=stype==='Unloading'?'παραδόθηκαν':'φορτώθηκαν';
  const caret=(OPS._expanded&&OPS._expanded.has(id))?'▾':'▸';
  return `<span class="do-pill${full?' full':''}" onclick="event.stopPropagation();_opsToggleStops('${id}')" title="${full?'Όλα τα σημεία δηλωμένα':'Κλικ: τα σημεία ένα-ένα — δηλώνεις όποιο έγινε, τα άλλα περιμένουν'}">${n}/${st.length} ${w} ${caret}</span>`;
}
function _opsToggleStops(id){
  OPS._expanded = OPS._expanded || new Set();
  if(OPS._expanded.has(id)) OPS._expanded.delete(id); else OPS._expanded.add(id);
  _opsDraw();
}
// Υπο-γραμμές: μία ανά σημείο, με σειρά, στοιχεία και ΔΙΚΑ της κουμπιά στις
// ίδιες 3 θυρίδες. Δηλωμένη = δείχνει τι δηλώθηκε (ποιος/πότε) και ΔΕΝ
// ξαναρωτά. Οι τοποθεσίες ΑΝΑΔΙΠΛΩΝΟΝΤΑΙ — ποτέ ellipsis (κανόνας 6).
// asDiv: the overdue zones are flex <div class="do-zrow"> rows, not table rows.
// Until 6/9 the zones never drew the sub-rows at all, so on a multi-stop
// overdue order «Παραδόθηκε»/«Φορτώθηκε» only toggled OPS._expanded and nothing
// visible happened (owner 6/9: 2 deliveries + 1 loading «δεν αποκρίνονται»).
function _opsSubRows(rec, stype, asDiv){
  const id=rec.id;
  const isDel=stype==='Unloading';
  return _opsStopsOf(id, stype).map((s,i)=>{
    const f=s.fields;
    // _L is already escaped; the raw 'Stop Label' fallback is escaped here.
    const loc=_L((f[F.STOP_LOCATION]||[])[0])||escapeHtml(String(f['Stop Label']||'—'));
    const dt=f['DateTime']?fmtDate(f['DateTime']):'—';
    const pal=f['Pallets']!=null?f['Pallets']+'p':'';
    const perf=f['Performance'];
    const okLbl=isDel?'Παραδόθηκε':'Φορτώθηκε';
    const right=perf
      ? `<span class="do-slots"><span style="font-weight:600;color:${perf==='Delayed'?'var(--danger)':'var(--ok)'}">${perf==='Delayed'?'Καθυστέρησε':'Στην ώρα'} ✓</span>
         <span class="do-sl" style="margin:0 0 0 8px;font-size:var(--text-xs)">${escapeHtml(f['Completed By']||'')}${f['Completed At']?' · '+fmtDate(f['Completed At']):''}</span></span>`
      : `<span class="do-slots"><span class="do-slot"><button class="do-btn" onclick="event.stopPropagation();confirmAction('${okLbl} σημείο ${i+1};').then(ok=>{if(ok)_opsMarkStopUI('${id}','${s.id}','On Time')})">${okLbl}</button></span>
         <span class="do-slot">${isDel?`<button class="do-late-btn" onclick="event.stopPropagation();confirmAction('Καθυστέρησε σημείο ${i+1};').then(ok=>{if(ok)_opsMarkStopUI('${id}','${s.id}','Delayed')})">Καθυστέρησε</button>`:''}</span>
         </span>`;
    const inner=`<div class="do-srow">
        <span class="do-sn">${'①②③④⑤⑥⑦⑧⑨'[i]||(i+1)}</span>
        <span class="do-sloc">${loc}</span>
        <span style="color:var(--text-dim);font-variant-numeric:tabular-nums">${dt}</span>
        <span style="color:var(--text-dim);width:40px">${pal}</span>
        ${right}
      </div>`;
    // colspan = the 8 columns of the colgroup, not 20: with table-layout:fixed
    // a colspan beyond the declared columns ADDS phantom columns and every
    // real column collapses (seen 15/9 in the rig: open a multi-stop row and
    // ΠΕΛΑΤΗΣ/ΦΟΡΤΩΣΗ/ΑΝΑΘΕΣΗ piled onto each other).
    return asDiv?`<div class="do-sub do-zsub">${inner}</div>`:`<tr class="do-sub"><td colspan="8">${inner}</td></tr>`;
  }).join('');
}
// Δήλωση ΕΝΟΣ σημείου — ανεξάρτητη: αν έμειναν άλλα, η παραγγελία δεν
// αγγίζεται καθόλου· όταν δηλωθεί το τελευταίο, τρέχει η κανονική ροή
// με το aggregate (καμία Delayed ⇒ On Time).
async function _opsMarkStopUI(orderId, stopId, perf){
  if(_opsBlockReadOnly()) return;
  _opsCloseFloat(); // 9/9: a live «Αλλαγή ημέρας» popover must never outlive the click that starts another action
  const stop=((OPS._stopsByOrder||{})[orderId]||[]).find(s=>s.id===stopId);
  if(!stop) return;
  let m;
  try{ m=await _opsMarkStop(stop, perf); }
  catch(e){ toast('Σφάλμα δήλωσης σημείου: '+e.message,'danger'); if(typeof logError==='function') logError(e,'daily-ops: stop mark'); return; }
  const stype=stop.fields[F.STOP_TYPE];
  const all=_opsStopsOf(orderId, stype);
  const n=all.filter(x=>x.fields['Performance']).length;
  if(n===all.length && all.length){
    OPS._expanded && OPS._expanded.delete(orderId);
    const agg=all.some(x=>x.fields['Performance']==='Delayed')?'Delayed':'On Time';
    if(stype==='Unloading'){
      return OPS.overdue.some(r=>r.id===orderId) ? _opsOvActFinal(orderId,agg,m) : _opsDelFinal(orderId,agg,m);
    }
    return _opsStatFinal(orderId,'In Transit',m);
  }
  toast(`${n}/${all.length} — η παραγγελία μένει ως έχει μέχρι να δηλωθούν όλα`);
  _opsDraw();
}
async function _opsStat(id,st){
  if(_opsBlockReadOnly()) return;
  _opsCloseFloat(); // 9/9: a live «Αλλαγή ημέρας» popover must never outlive the click that starts another action
  let m=null;
  if(st==='In Transit'){
    const loads=_opsStopsOf(id,'Loading');
    if(loads.length>1 && loads.some(x=>!x.fields['Performance'])){ _opsToggleStops(id); return; }
    // Μία φόρτωση: το κλικ σφραγίζει και τη στάση. Αν η σφραγίδα δεν γραφτεί,
    // ΔΕΝ γράφεται ούτε η παραγγελία (Cursor audit 11/9: ο accountant έπαιρνε
    // 403 στη στάση και η παραγγελία γινόταν In Transit/Delivered χωρίς τικ —
    // μισή εγγραφή που καμία οθόνη δεν εξηγεί· αρχή 1).
    if(loads.length===1){
      try{ m=await _opsMarkStop(loads[0], null); }
      catch(e){ if(typeof logError==='function') logError(e,'daily-ops: single load stamp'); toast('Η σφραγίδα φόρτωσης ΔΕΝ γράφτηκε ('+_opsErrWord(e)+') — η παραγγελία έμεινε ως έχει','danger'); return; }
    }
  }
  return _opsStatFinal(id,st,m);
}
// Βρες την εγγραφή σε όποια λίστα ζει (ημέρα ή εκκρεμείς φορτώσεις).
function _opsConvert(id){ if(_opsBlockReadOnly()) return; convertPreorder(id); }
function _opsFind(id){ return OPS.intl.find(x=>x.id===id)||OPS.overdueLoads.find(x=>x.id===id)||OPS.overdue.find(x=>x.id===id); }
async function _opsStatFinal(id,st,stamped){ if(_opsBlockReadOnly()) return; try{
  const r0=_opsFind(id);
  const patch={'Status':st};
  // VS: το «Σε μεταφορά» σφραγίζει την πραγματική ημέρα αναχώρησης από CD
  if(st==='In Transit'&&r0?.fields['Veroia Switch']&&r0?.fields['Direction']==='Export'&&!r0?.fields['VS CD Date']){
    patch['VS CD Date']=_opsTgt();
  }
  // Η αναβολή τελειώνει μόλις το φορτίο κινηθεί — αλλιώς το σήμα επιβιώνει για πάντα,
  // γιατί ΚΑΝΕΙΣ δεν καθάριζε ποτέ το πεδίο. Η πληροφορία ΔΕΝ χάνεται: κάθε PATCH
  // γράφεται με before/after στο audit_log, άρα το «πότε και από ποιον» μένει εκεί.
  if(r0?.fields['Postponed To']) patch['Postponed To']=null;
  if(!(await _opsWriteOrder(id,patch,stamped))) return;
  if(r0){r0.fields['Status']=st;if(patch['VS CD Date'])r0.fields['VS CD Date']=patch['VS CD Date'];if('Postponed To' in patch)r0.fields['Postponed To']=null;}
  // Η εκκρεμής φόρτωση που φορτώθηκε φεύγει από τη ζώνη — δεν είναι πια εκκρεμής.
  OPS.overdueLoads=OPS.overdueLoads.filter(r=>r.id!==id);
  // Mirror Status on any linked PARTNER ASSIGNMENT
  try { await paSyncStatus({ parentType:'order', parentId:id, status:st }); }
  catch(e) { if(typeof logError==='function') logError(e,'daily-ops: PA status sync '+id); toast('Η κατάσταση γράφτηκε, αλλά η ανάθεση συνεργάτη ΔΕΝ ενημερώθηκε','warn'); }
  toast((st==='In Transit'?'Φορτώθηκε':st)+' ✓');_opsDraw();}catch(e){toast('Η αποθήκευση απέτυχε — δεν γράφτηκε τίποτα. Ξαναδοκίμασε.','danger');}}
async function _opsDel(id,perf){
  if(_opsBlockReadOnly()) return;
  _opsCloseFloat(); // 9/9: a live «Αλλαγή ημέρας» popover must never outlive the click that starts another action
  const dels=_opsStopsOf(id,'Unloading');
  // Multi: το κουμπί της σύνοψης ΔΕΝ δηλώνει — ανοίγει τα σημεία (owner 26/8).
  if(dels.length>1){ if(!OPS._expanded?.has(id)) _opsToggleStops(id); return; }
  // Same rule as _opsStat: no stamp, no Delivered (audit 11/9: 282/302/308).
  let m=null;
  if(dels.length===1){ try{ m=await _opsMarkStop(dels[0], perf); }catch(e){ if(typeof logError==='function') logError(e,'daily-ops: single delivery stamp'); toast('Η σφραγίδα παράδοσης ΔΕΝ γράφτηκε ('+_opsErrWord(e)+') — η παραγγελία έμεινε ως έχει','danger'); return; } }
  return _opsDelFinal(id,perf,m);
}
async function _opsDelFinal(id,perf,stamped){ if(_opsBlockReadOnly()) return; const d=_opsTgt();
  // Ίδιος λόγος με το _opsStat: παραδομένη παραγγελία δεν είναι «αναβεβλημένη».
  const _r0=OPS.intl.find(x=>x.id===id);
  const _p={'Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d};
  if(_r0?.fields['Postponed To']) _p['Postponed To']=null;
  const t0=Date.now();
  try{if(!(await _opsWriteOrder(id,_p,stamped))) return;
  if (typeof plOnDelivered === 'function') plOnDelivered(id);
  _opsArmIntakeUndo(id,t0,_r0?.fields);
  const r=OPS.intl.find(x=>x.id===id);if(r){r.fields['Status']='Delivered';r.fields['Delivery Performance']=perf;if('Postponed To' in _p)r.fields['Postponed To']=null;}
  try { await paSyncStatus({ parentType:'order', parentId:id, status:'Delivered' }); }
  catch(e) { if(typeof logError==='function') logError(e,'daily-ops: PA status sync '+id); toast('Η κατάσταση γράφτηκε, αλλά η ανάθεση συνεργάτη ΔΕΝ ενημερώθηκε','warn'); }
  // C1-08: a lot's late button records a late INTAKE — the toast says so, not «Καθυστέρησε».
  const _lot=OrdersStock.isLot(_r0?.fields);
  toast(perf==='On Time'?(_lot?'Στην αποθήκη ✓':'Παραδόθηκε ✓'):_lot?'Στην αποθήκη ✓ — με καθυστέρηση':'Καθυστέρησε — καταχωρήθηκε',perf==='Delayed'?(_lot?'warn':'danger'):'success');_opsDraw();}catch(e){toast('Η αποθήκευση απέτυχε — δεν γράφτηκε τίποτα. Ξαναδοκίμασε.','danger');}}

/* ── «Αλλαγή ημέρας» popover ───────────────────────────────────────────
   Η αναβολή ΕΙΝΑΙ αλλαγή ημερομηνίας στην παραγγελία — μία πηγή (αρχή 3).
   Popover στη γραμμή, προεπιλογή «Αύριο», Enter = ό,τι έκανε το σημερινό +1
   (owner 2/9). Το ρητό checkbox αντικαθιστά την τυφλή μετακίνηση της
   παράδοσης που έκανε ο παλιός κώδικας. */
function _opsCloseFloat(){ document.querySelectorAll('.do-pop').forEach(e=>e.remove()); document.removeEventListener('keydown',_opsPopKey); }
// 9/9 (dispatcher: «πάτησα Παραδόθηκε δύο φορές, έμεινε εκκρεμής»): this Enter
// handler was page-wide, so an Enter meant for the «Παραδόθηκε;» confirm dialog
// ran «Αλλαγή ημέρας → Αύριο» on the popover's order instead — two real orders
// were postponed a day and never marked delivered (audit 9/9 09:22, 10:01).
// Enter now counts only when it is typed INSIDE the popover; Escape still closes.
function _opsPopKey(e){
  if(e.key==='Escape'){ _opsCloseFloat(); return; }
  if(e.key!=='Enter') return;
  const pop=document.querySelector('.do-pop'); if(!pop) return;
  if(!pop.contains(e.target)) return;
  e.preventDefault(); _opsChangeDayGo();
}
// Το rect του κουμπιού διαβάζεται ΠΡΙΝ κλείσει το προηγούμενο popover: αν
// κλείσει πρώτο, το στοιχείο αποσπάται από το DOM, το rect του γίνεται 0/0
// και το popover βγαίνει στο -360px (μετρήθηκε στο rig 3/9).
function _opsRect(ev){ const b=ev.currentTarget||ev.target; return b.getBoundingClientRect(); }
function _opsAnchor(rb, el){
  const host=document.getElementById('content'); const hb=host.getBoundingClientRect();
  host.style.position=host.style.position||'relative';
  el.style.top=(rb.bottom-hb.top+host.scrollTop+6)+'px';
  el.style.right=Math.max(8,hb.right-rb.right)+'px';
  host.appendChild(el);
}
const _plus=(iso,days)=>toLocalDate(new Date(new Date(toLocalDate(iso)+'T12:00:00').getTime()+days*864e5));
const _nextMonday=(iso)=>{ const d=new Date(toLocalDate(iso)+'T12:00:00'); const add=((8-d.getDay())%7)||7; return toLocalDate(new Date(d.getTime()+add*864e5)); };
const _dowShort=iso=>['Κυρ','Δευ','Τρι','Τετ','Πεμ','Παρ','Σαβ'][new Date(iso+'T12:00:00').getDay()];
function _opsChangeDay(ev, id, kind){
  if(_opsBlockReadOnly()) return;
  ev.stopPropagation(); const rb=_opsRect(ev); _opsCloseFloat();
  const r=_opsFind(id); if(!r) return;
  const f=r.fields;
  const base=kind==='load'?f['Loading DateTime']:f['Delivery DateTime'];
  if(!base){ toast('Η παραγγελία δεν έχει ημερομηνία '+(kind==='load'?'φόρτωσης':'παράδοσης'),'danger'); return; }
  // Βάση των επιλογών = ΣΗΜΕΡΑ, όχι η παλιά ημέρα της γραμμής (3/9): στη ζώνη
  // εκκρεμών η παλιά ημέρα είναι ήδη περασμένη, οπότε το «Αύριο» μετέθετε στο
  // ΠΑΡΕΛΘΟΝ και η γραμμή ξαναγύριζε εκκρεμής. Το `base` μένει ως το «τώρα …»
  // και ως αφετηρία του delta που μετακινεί μαζί την παράδοση.
  // «Μεθαύριο» (27/9, dispatcher Παντελής): after «Αύριο» the only quick pick
  // was Monday, so a two-day postponement mid-week needed the date picker.
  // «Δευτέρα» is shown only when it is a date NOT already offered: on Saturday
  // Μεθαύριο is Monday, on Sunday Αύριο is Monday. The relative button stays
  // (its label carries «Δευ»), so the popover never offers two buttons that
  // write the same date.
  const _tdy=localToday();
  const tmrw=_plus(_tdy,1), day2=_plus(_tdy,2), mon=_nextMonday(_tdy);
  const stype=kind==='load'?'Loading':'Unloading';
  const loc=_L(_opsStopLoc(id,stype))||'';
  const hasDel=kind==='load'&&!!f['Delivery DateTime'];
  OPS._pop={id,kind,base,choice:tmrw,moveDel:hasDel};
  const p=document.createElement('div'); p.className='do-pop';
  p.innerHTML=`<h4>Αλλαγή ημέρας ${kind==='load'?'φόρτωσης':'παράδοσης'}</h4>
    <div class="do-psub">${_C(f)}${loc?' · '+loc:''}${f['Total Pallets']?' · '+f['Total Pallets']+'p':''} · τώρα ${_DMY(base)}</div>
    <div class="do-opts">
      <button class="do-opt on" data-v="${tmrw}" onclick="_opsPopPick(this)"><b>Αύριο</b><span>${_dowShort(tmrw)} ${_DMY(tmrw)}</span></button>
      <button class="do-opt" data-v="${day2}" onclick="_opsPopPick(this)"><b>Μεθαύριο</b><span>${_dowShort(day2)} ${_DMY(day2)}</span></button>
      ${mon!==tmrw&&mon!==day2?`<button class="do-opt" data-v="${mon}" onclick="_opsPopPick(this)"><b>Δευτέρα</b><span>${_DMY(mon)}</span></button>`:''}
      <button class="do-opt" data-v="" onclick="_opsPopPick(this)"><b>Άλλη…</b><input type="date" onclick="event.stopPropagation()" onchange="_opsPopOther(this)"></button>
    </div>
    ${hasDel?`<label><input type="checkbox" checked onchange="OPS._pop.moveDel=this.checked;_opsPopHint()"><span>Μετακίνηση και της παράδοσης<small id="doPopHint"></small></span></label>`:''}
    <div class="do-pfoot"><span>Γράφεται στην παραγγελία · ιστορικό στο audit log</span><span class="sp"></span>
      <button class="do-ghost" onclick="_opsCloseFloat()">Άκυρο</button>
      <button class="do-btn" onclick="_opsChangeDayGo()">Αλλαγή ↵</button></div>`;
  _opsAnchor(rb,p);
  _opsPopHint();
  document.addEventListener('keydown',_opsPopKey);
  setTimeout(()=>document.addEventListener('click',function h(e){ if(!p.contains(e.target)) _opsCloseFloat(); else document.addEventListener('click',h,{once:true}); },{once:true}),0);
}
function _opsPopPick(btn){
  document.querySelectorAll('.do-pop .do-opt').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  const v=btn.getAttribute('data-v');
  if(v) OPS._pop.choice=v; else { const i=btn.querySelector('input'); OPS._pop.choice=i&&i.value?i.value:null; if(i) i.focus(); }
  _opsPopHint();
}
function _opsPopOther(inp){ OPS._pop.choice=inp.value||null; _opsPopHint(); }
function _opsPopHint(){
  const h=document.getElementById('doPopHint'); if(!h||!OPS._pop) return;
  const r=_opsFind(OPS._pop.id); const del=r&&r.fields['Delivery DateTime'];
  if(!del||!OPS._pop.choice||!OPS._pop.moveDel){ h.textContent=del?'η παράδοση μένει '+_dowShort(toLocalDate(del))+' '+_DMY(del):''; return; }
  const delta=Math.round((new Date(OPS._pop.choice+'T12:00:00')-new Date(toLocalDate(OPS._pop.base)+'T12:00:00'))/864e5);
  const nd=_plus(del,delta);
  h.textContent=`${_dowShort(toLocalDate(del))} ${_DMY(del)} → ${_dowShort(nd)} ${_DMY(nd)} (ίδια απόσταση)`;
}
async function _opsChangeDayGo(){
  if(_opsBlockReadOnly()) return;
  const p=OPS._pop; if(!p) return;
  if(!p.choice){ toast('Διάλεξε ημερομηνία','danger'); return; }
  const r=_opsFind(p.id); if(!r) return;
  const f=r.fields;
  const patch={};
  const delta=Math.round((new Date(p.choice+'T12:00:00')-new Date(toLocalDate(p.base)+'T12:00:00'))/864e5);
  if(p.kind==='load'){
    patch['Loading DateTime']=p.choice;
    if(p.moveDel&&f['Delivery DateTime']) patch['Delivery DateTime']=_plus(f['Delivery DateTime'],delta);
  } else {
    patch['Delivery DateTime']=p.choice;
  }
  // «Postponed To» ΣΥΝΕΧΙΖΕΙ να γράφεται με τη ΝΕΑ ημέρα, όπως ως τώρα: το
  // διαβάζουν Weekly/φίλτρα και το σήμα «Μετατέθηκε». Το μοντέλο «μία πηγή =
  // η ημερομηνία» θέλει original_loading_date/audit_log — ΑΝΟΙΧΤΟ (owner).
  patch['Postponed To']=patch['Loading DateTime']||patch['Delivery DateTime'];
  _opsCloseFloat();
  try{await atSafePatch(TABLES.ORDERS,p.id,patch);
  invalidateCache(TABLES.ORDERS);
  // Central sync — dates changed, propagate to NAT_LOADS, GL, RAMP
  // Awaited (audit 13/9): fire-and-forget let «Μετατέθηκε ✓» show while a stage
  // of the chain (load/ramp/GL) failed with only console.warn as witness.
  let syncNote='';
  if (typeof syncOrderDownstream === 'function') {
    try{ const sr=await syncOrderDownstream(p.id, { source: 'intl', changedFields: Object.keys(patch), skipPA: true });
      if(sr&&!sr.ok) syncNote=' — ΔΕΝ ενημερώθηκαν: '+(sr.failed||[]).join(', '); }
    catch(e){ if(typeof logError==='function') logError(e,'ops change-day sync '+p.id); syncNote=' — η αλυσίδα (φορτίο/ράμπα) ΔΕΝ ενημερώθηκε'; }
  }
  toast('Μετατέθηκε → '+_DMYFull(p.choice)+syncNote, syncNote?'warn':'success');OPS._pop=null;renderDailyOps();}catch(e){toast('Η αποθήκευση απέτυχε — δεν γράφτηκε τίποτα. Ξαναδοκίμασε.','danger');}
}

function _opsPrint() {
  const content = document.querySelector('.ops-sections');
  if (!content) return;
  const win = window.open('','_blank','width=1100,height=800');
  // Το παράθυρο εκτύπωσης δεν φορτώνει το style.css — ασπρόμαυρο, χωρίς χρώματα.
  win.document.write(`<html><head><title>Ημερήσιο Πλάνο</title>
    <style>
      body{font-family:'DM Sans',sans-serif;padding:16px;font-size:12px;font-variant-numeric:tabular-nums}
      h1{font-family:'Syne',sans-serif;font-size:18px;margin-bottom:4px}
      .sub{opacity:.6;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{padding:4px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.8px;text-align:left;border-bottom:2px solid;font-weight:600}
      td{padding:4px 8px;border-bottom:1px solid;font-size:12px}
      .do-sec-h{font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-top:12px}
      .do-sl{display:block;font-size:11px;opacity:.6}
      /* On paper the tag has no colour — the word alone must carry it (DESIGN.md #2). */
      .do-tag{font-weight:700;margin-right:4px}
      .do-acts,.do-slots,button,input,select{display:none}
      /* Paper has no actions: drop the ΕΝΕΡΓΕΙΕΣ column and the screen's
         fixed col widths, so ΠΕΛΑΤΗΣ/ΦΟΡΤΩΣΗ get the page (15/9: they were
         squeezed to one word per line by the 320px reserved for buttons). */
      th:last-child{display:none} col{width:auto!important}
      .do-sec-h span{margin-left:8px}
      .do-pill{border:0;padding:0;background:none}
      @media print{body{padding:8px}table{page-break-inside:auto}}
    </style></head><body>
    <h1>Ημερήσιο Πλάνο</h1>
    <div class="sub">${document.querySelector('.do-sub')?.textContent||''}</div>
    ${content.innerHTML}
  </body></html>`);
  win.document.close();
  setTimeout(()=>{win.print();},400);
}

async function _opsOvAct(id,perf='Delayed'){
  const dels=_opsStopsOf(id,'Unloading');
  if(dels.length>1){ if(!OPS._expanded?.has(id)) _opsToggleStops(id); return; }
  let m=null;
  if(dels.length===1){ try{ m=await _opsMarkStop(dels[0], perf); }catch(e){ if(typeof logError==='function') logError(e,'daily-ops: overdue stamp'); toast('Η σφραγίδα παράδοσης ΔΕΝ γράφτηκε ('+_opsErrWord(e)+') — η παραγγελία έμεινε ως έχει','danger'); return; } }
  return _opsOvActFinal(id,perf,m);
}
async function _opsOvActFinal(id,perf='Delayed',stamped=null){ if(_opsBlockReadOnly()) return; const d=localToday();
  // Ίδιο καθάρισμα με το _opsDel — η καθυστερημένη κλείνει κι αυτή τον κύκλο.
  const _ov=OPS.overdue.find(x=>x.id===id);
  const _p={'Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d};
  if(_ov?.fields['Postponed To']) _p['Postponed To']=null;
  const t0=Date.now();
  try{if(!(await _opsWriteOrder(id,_p,stamped))) return;
  if (typeof plOnDelivered === 'function') plOnDelivered(id);
  _opsArmIntakeUndo(id,t0,_ov?.fields);
  // Central sync — propagate status to partner assignments
  if (typeof syncOrderDownstream === 'function') {
    syncOrderDownstream(id, { source: 'intl', changedFields: ['Status'], skipVS: true, skipGRP: true, skipRamp: true })
      .catch(e => console.warn('[ops overdue sync]', e));
  }
  OPS.overdue=OPS.overdue.filter(r=>r.id!==id);const _lot=OrdersStock.isLot(_ov?.fields);toast(_lot?(perf==='Delayed'?'Σημειώθηκε: στην αποθήκη με καθυστέρηση':'Σημειώθηκε: στην αποθήκη'):perf==='Delayed'?'Σημειώθηκε ως καθυστερημένη':'Σημειώθηκε ως παραδοθείσα');_opsDraw();}catch(e){toast('Η αποθήκευση απέτυχε — δεν γράφτηκε τίποτα. Ξαναδοκίμασε.','danger');}}

// Expose functions used from onclick/onchange handlers
window.renderDailyOps = renderDailyOps;
window.OPS = OPS;
window._opsPrint = _opsPrint;
window._opsSvF = _opsSvF;
window._opsStat = _opsStat;
window._opsDel = _opsDel;
window._opsOvAct = _opsOvAct;
window._opsSetFilter = _opsSetFilter;
window._opsToggleZone = _opsToggleZone;
window._opsToggleStops = _opsToggleStops;
window._opsConvert = _opsConvert;
window._opsOpenRelay = _opsOpenRelay; window._opsAsk = _opsAsk;
window._opsMarkStopUI = _opsMarkStopUI;
window._opsChangeDay = _opsChangeDay; window._opsChangeDayGo = _opsChangeDayGo;
window._opsPopPick = _opsPopPick; window._opsPopOther = _opsPopOther; window._opsPopHint = _opsPopHint; window._opsCloseFloat = _opsCloseFloat;
})();
