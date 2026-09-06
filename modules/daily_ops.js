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
];

/* ── ENTRY ────────────────────────────────────────────────────── */
async function renderDailyOps() {
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
  const today=localToday();
  const tmrw=localTomorrow();
  const tgt=OPS.date==='tomorrow'?tmrw:OPS.date==='today'?today:OPS.date; // DO-7: δέχεται και ISO ημερομηνία
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
  OPS.overdue=ov.filter(r=>!ids.has(r.id));
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

  // Κληρονομιά ανάθεσης ζεύγους (owner 13/8): σε ταιριασμένα ζεύγη η ανάθεση
  // γράφεται ΜΟΝΟ στο export (Matched Import ID) — τα imports εμφανίζονταν
  // «κενά» εδώ ενώ το Weekly τα έδειχνε ανατεθειμένα. Γεμίζουμε Truck/Driver/
  // Trailer/Partner ΜΟΝΟ στη μνήμη για την προβολή· ΔΕΝ γράφεται στη βάση.
  try{
    const bareImps=[...intl,...OPS.overdue,...OPS.overdueLoads].filter(r=>{
      const f=r.fields;
      return f['Direction']==='Import' && !(f['Truck']||[]).length && !(f['Partner']||[]).length && !(f['Driver']||[]).length;
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

function _opsCats() {
  const today=localToday();
  const tmrw=localTomorrow();
  const tgt=OPS.date==='tomorrow'?tmrw:OPS.date==='today'?today:OPS.date; // DO-7: δέχεται και ISO ημερομηνία
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
  .do-t{width:100%;border-collapse:collapse;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius)}
  .do-t th{padding:0 8px;height:32px;text-align:left;font-size:var(--text-xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-mid);background:var(--surface-sunken);white-space:nowrap}
  .do-t td{padding:0 8px;height:40px;border-top:1px solid var(--border);white-space:nowrap;vertical-align:middle;font-size:var(--text-body)}
  .do-t td.do-wrap{white-space:normal}
  .do-t tr.do-done td{color:var(--text-dim)}
  .do-t tr.do-hover:hover td,.do-t tr.do-open td{background:var(--surface-sunken)}
  .do-num{color:var(--text-dim);width:24px}
  .do-main{font-weight:600;line-height:1.15}
  .do-sl{display:block;font-size:var(--text-xs);color:var(--text-dim);font-weight:400;letter-spacing:.02em}
  /* Assignment: colour AND word (DESIGN.md E). Text on the tag is the card
     white — --text-on-dark on --ok measures 4.1:1, white 5.1:1. */
  .do-tag{display:inline-block;height:16px;line-height:16px;padding:0 8px;border-radius:var(--radius-full);font-size:var(--text-xs);font-weight:700;letter-spacing:.04em;color:var(--surface-card);vertical-align:1px;margin-right:4px}
  .do-tag.own{background:var(--surface-dark)}
  .do-tag.prt{background:var(--ok)}
  .do-tag.none{background:var(--unassigned)}
  .do-st{width:170px;white-space:nowrap}
  .do-st-wait{color:var(--text);font-weight:700}
  .do-st-done{color:var(--ok);font-weight:600}
  .do-st-moved{color:var(--warn);font-weight:400;font-size:var(--text-xs)}
  .do-acts{width:252px}
  .do-slots{display:flex;align-items:center;gap:4px}
  /* min-width, όχι width: το «Αλλαγή ημέρας» είναι φαρδύτερο από 104px και
     θα ξεχείλιζε πάνω στη διπλανή θυρίδα. Ίδιο σχήμα σε όλες τις γραμμές
     της ενότητας ⇒ η στήλη διαβάζεται κάθετα. */
  .do-slot{min-width:104px;display:flex;justify-content:center}
  .do-btn{height:28px;padding:0 12px;border-radius:var(--radius);border:1px solid var(--surface-dark);background:var(--surface-dark);color:var(--surface-card);font-family:inherit;font-size:var(--text-xs);font-weight:600;cursor:pointer;white-space:nowrap}
  .do-btn:hover{background:var(--accent);border-color:var(--accent)}
  .do-late-btn{height:28px;padding:0 8px;border:0;background:none;color:var(--danger);font-family:inherit;font-size:var(--text-xs);font-weight:600;cursor:pointer;white-space:nowrap}
  .do-late-btn:hover{text-decoration:underline}
  .do-ghost{height:28px;padding:0 8px;border:0;background:none;color:var(--text-mid);font-family:inherit;font-size:var(--text-xs);font-weight:600;cursor:pointer;white-space:nowrap}
  .do-ghost:hover{text-decoration:underline;color:var(--text)}
  .do-tinp{height:28px;padding:0 4px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-card);font-family:inherit;font-size:var(--text-xs);color:var(--text)}
  /* Outline only: the amber fill/border tokens would be two colours that
     appear nowhere else on this screen (measured 4/9: 13 vs 12 before). */
  .do-pill{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:var(--radius-full);border:1px solid var(--warn);background:var(--surface-card);font-size:var(--text-xs);font-weight:600;cursor:pointer;color:var(--warn);white-space:nowrap}
  .do-pill.full{color:var(--text-mid);background:var(--surface-card);border-color:var(--border)}
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
  .do-pop{position:absolute;z-index:var(--z-float,50);width:360px;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md);padding:12px 16px;text-align:left;white-space:normal}
  .do-pop h4{font-family:inherit;font-size:var(--text-base);font-weight:700;margin:0 0 4px}
  .do-pop .do-psub{font-size:var(--text-xs);color:var(--text-dim);margin-bottom:8px}
  .do-pop .do-opts{display:flex;gap:8px;margin-bottom:8px}
  .do-pop .do-opt{flex:1;border:1px solid var(--border);border-radius:var(--radius);padding:4px 8px;background:var(--surface-card);cursor:pointer;font-family:inherit;text-align:left}
  .do-pop .do-opt:hover{border-color:var(--border-dark)}
  .do-pop .do-opt b{display:block;font-size:var(--text-sm);color:var(--text)}
  .do-pop .do-opt span{font-size:var(--text-xs);color:var(--text-dim)}
  .do-pop .do-opt.on{background:var(--surface-dark);border-color:var(--surface-dark)} .do-pop .do-opt.on b,.do-pop .do-opt.on span{color:var(--text-on-dark)}
  .do-pop .do-opt input{width:100%;border:0;background:none;font-family:inherit;font-size:var(--text-xs);color:var(--text);padding:0}
  .do-pop label{display:flex;align-items:flex-start;gap:8px;font-size:var(--text-sm);color:var(--text);margin-bottom:8px;cursor:pointer}
  .do-pop label small{display:block;font-size:var(--text-xs);color:var(--text-dim)}
  .do-pop .do-pfoot{display:flex;align-items:center;gap:8px;font-size:var(--text-xs);color:var(--text-dim)}
  .do-pop .do-pfoot .sp{flex:1}
</style>`;

/* ── DRAW ─────────────────────────────────────────────────────── */
function _opsDraw() {
  const today=localToday();
  const tmrw=localTomorrow();
  const isToday=OPS.date==='today';
  const tgt=OPS.date==='tomorrow'?tmrw:isToday?today:OPS.date;
  const fD=d=>{try{const dt=new Date(d);
    const ds=['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
    const ms=['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
    return `${ds[dt.getDay()]} ${dt.getDate()} ${ms[dt.getMonth()]}`;} catch{return d;}};

  const cats=_opsCats();
  const all=[...cats.el,...cats.ed,...cats.il,...cats.id];
  const total=all.length;

  // Per-direction completion — κάθε αναλογία x/y, ποτέ σκέτο ποσοστό.
  const loadsAll = [...cats.el, ...cats.il];
  const delsAll  = [...cats.ed, ...cats.id];
  const loadsDone = loadsAll.filter(r=>['In Transit','Delivered'].includes(r.fields['Status']||'')).length;
  const delsDone  = delsAll.filter(r=>(r.fields['Status']||'')==='Delivered').length;
  const pendN=isToday?OPS.overdue.length+OPS.overdueLoads.length:0;

  const kpi=(lbl,done,n,ok)=>`<div class="do-kpi${ok?' ok':''}"><div class="do-kpi-l">${lbl}</div>
    <div class="do-kpi-v">${n?`${done} <small>/ ${n} ${n===1?'δηλωμένη':'δηλωμένες'}</small>`:'<small>καμία σήμερα</small>'}</div>
    <div class="do-kpi-bar"><div class="do-kpi-fill" style="width:${n?Math.round(done/n*100):0}%"></div></div></div>`;

  // Ζώνες εκκρεμών από προηγούμενες ημέρες — παραδόσεις ΚΑΙ φορτώσεις (2/9)
  const route=r=>`${escapeHtml(_L(_opsStopLoc(r.id,'Loading'))||'—')} → ${escapeHtml(_L(_opsStopLoc(r.id,'Unloading'))||'—')}`;
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
      return `<div class="do-zrow" id="r_${r.id}"><span class="do-cl">${escapeHtml(_C(f))}</span><span class="do-rt">${route(r)}</span>
        <span class="do-late">παράδοση ${_DMY(f['Delivery DateTime'])} · ${_agoTxt(n)}</span>
        ${_opsSlots(r,'ovd')}</div>${OPS._expanded?.has(r.id)?_opsSubRows(r,'Unloading',true):''}`;}):'';
  const ovLH=isToday?zone('ovLoad',OPS.overdueLoads,
    `${OPS.overdueLoads.length} ${OPS.overdueLoads.length===1?'εκκρεμής φόρτωση':'εκκρεμείς φορτώσεις'} από προηγούμενες ημέρες`,
    'δεν φορτώθηκε και δεν μετατέθηκε',
    r=>{const f=r.fields, n=_daysAgo(f['Loading DateTime']);
      return `<div class="do-zrow" id="r_${r.id}"><span class="do-cl">${escapeHtml(_C(f))}</span><span class="do-rt">${route(r)}${_T(f)?' · '+escapeHtml(_T(f)):''}${_D(f)?' · '+escapeHtml(_D(f)):''}</span>
        <span class="do-late">φόρτωση ${_DMY(f['Loading DateTime'])} · ${_agoTxt(n)}</span>
        ${_opsSlots(r,'ovl')}</div>${OPS._expanded?.has(r.id)?_opsSubRows(r,'Loading',true):''}`;}):'';
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
      <span class="do-sub">${fD(tgt)} · ${total} ${total===1?'παραγγελία':'παραγγελίες'} ${isToday?'σήμερα':OPS.date==='tomorrow'?'αύριο':''}${pendN?` · <b>${pendN} ${pendN===1?'εκκρεμής':'εκκρεμείς'}</b>`:''}</span>
      <div class="do-seg">
        <button class="${isToday?'on':''}" onclick="OPS.date='today';renderDailyOps()">Σήμερα</button>
        <button class="${OPS.date==='tomorrow'?'on':''}" onclick="OPS.date='tomorrow';renderDailyOps()">Αύριο</button>
        <input type="date" value="${tgt}" title="Άλλη ημερομηνία"
          onchange="OPS.date=this.value===localToday()?'today':this.value===localTomorrow()?'tomorrow':this.value;renderDailyOps()">
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
    ${ovH}${ovLH}${ovLErr}
    <div class="ops-sections" style="gap:0">
      ${_opsSec('el','ΦΟΡΤΩΣΕΙΣ ΕΞΑΓΩΓΗΣ',cats.el,isToday,'Καμία παραγγελία εξαγωγής για φόρτωση',1)}
      ${_opsSec('ed','ΠΑΡΑΔΟΣΕΙΣ ΕΞΑΓΩΓΗΣ',cats.ed,isToday,'Καμία παραγγελία εξαγωγής για παράδοση',1+cats.el.length)}
      ${_opsSec('il','ΦΟΡΤΩΣΕΙΣ ΕΙΣΑΓΩΓΗΣ',cats.il,isToday,'Καμία παραγγελία εισαγωγής για φόρτωση',1+cats.el.length+cats.ed.length)}
      ${_opsSec('id','ΠΑΡΑΔΟΣΕΙΣ ΕΙΣΑΓΩΓΗΣ',cats.id,isToday,'Καμία παραγγελία εισαγωγής για παράδοση',1+cats.el.length+cats.ed.length+cats.il.length)}
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

// `start`: η αρίθμηση συνεχίζεται από ενότητα σε ενότητα. Με `i+1` σε κάθε
// ενότητα η οθόνη είχε τέσσερα «#1» και κανείς δεν μπορούσε να πει «το 7»
// στο τηλέφωνο — ο αριθμός δεν ταυτοποιούσε τίποτα (3/9).
function _opsSec(type,label,items,isToday,emptyTxt,start) {
  const isL=type==='el'||type==='il', isExp=type==='el'||type==='ed';
  const isTmrw=OPS.date==='tomorrow';
  const when=isToday?'σήμερα':isTmrw?'αύριο':'';
  // Στήλες ανά ενότητα (Figma 169:699): ΘΕΡΜ./ΕΓΓΡΑΦΑ/ΦΩΤΟ CMR/ΕΝΗΜΕΡΩΣΗ
  // ΠΕΛΑΤΗ/2Η ΚΑΡΤΑ αφαιρέθηκαν (owner 2/9)· ΚΑΤΑΣΤΑΣΗ = νέα στήλη λέξης.
  // ΦΟΡΤΗΓΟ + ΟΔΗΓΟΣ became one ΑΝΑΘΕΣΗ column (owner 4/9, DESIGN.md E): the
  // dispatcher reads WHO carries the load — «ΙΔ.» plate + driver, «ΣΥΝ.» +
  // partner name, or «ΠΡΟΣ ΑΝΑΘΕΣΗ». Two columns showed «—» and «χωρίς
  // οδηγό» for the same fact, and an own-fleet plate carried no marker at all.
  const mid = isL&&isExp ? '<th>ΦΟΡΤΩΣΗ</th><th>ΑΝΑΘΕΣΗ</th><th>ΠΑΛ.</th><th>ΠΡΟΚ. €</th>'
            : isL       ? '<th>ΦΟΡΤΩΣΗ</th><th>ΑΝΑΘΕΣΗ</th><th>ΩΡΑ</th>'
                        : '<th>ΠΑΡΑΔΟΣΗ</th><th>ΑΝΑΘΕΣΗ</th><th>ΕΚΤ. ΑΦΙΞΗ</th>';
  const cols=`<th>#</th><th>ΠΕΛΑΤΗΣ</th>${mid}<th>ΚΑΤΑΣΤΑΣΗ</th><th style="text-align:right">ΕΝΕΡΓΕΙΕΣ</th>`;
  const done=items.filter(r=>isL?['In Transit','Delivered'].includes(r.fields['Status']||''):(r.fields['Status']||'')==='Delivered').length;
  const head=`<div class="do-sec-h">${label}<span>${items.length?`${items.length} · ${done} ${done===1?'δηλωμένη':'δηλωμένες'}`:`— καμία ${when}`}</span></div>`;
  if(!items.length) return `<div class="do-sec">${head}<div class="do-empty">${emptyTxt} ${when}</div></div>`;
  return `<div class="do-sec">${head}
    <div style="overflow-x:auto"><table class="do-t"><thead><tr>${cols}</tr></thead><tbody>${items.map((r,i)=>_opsRow(r,start+i,type,isToday)).join('')}</tbody></table></div>
  </div>`;
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
function _opsStatusWord(f, multiPill, isL) {
  const st=f['Status']||'';
  const done=isL ? (st==='In Transit'||st==='Delivered') : st==='Delivered';
  if(done) return `<span class="do-st-done">${isL?'Φορτώθηκε':'Παραδόθηκε'} ✓</span>`;
  // «μετατέθηκε»: το Postponed To κρατά τη ΝΕΑ ημέρα — η γραμμή είναι ενεργή
  // εκείνη τη μέρα, με τα κουμπιά της. Μένει ως δευτερεύουσα σημείωση, όχι ως
  // τρίτη κατάσταση. Το «από 30/8» ΔΕΝ δείχνεται: θέλει write-once
  // original_loading_date ή audit_log — κανένα εγκεκριμένο (ΑΝΟΙΧΤΟ).
  const moved=f['Postponed To']?' <span class="do-st-moved">μετατέθηκε</span>':'';
  return `<span class="do-st-wait">Εκκρεμεί</span>${moved}${multiPill?' '+multiPill:''}`;
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
  // Η δήλωση γράφει ΣΗΜΕΡΙΝΗ ημερομηνία (`Actual Delivery Date`=localToday())
  // και «On Time». Σε άλλη μέρα αυτό είναι ψέμα στη βάση για γεγονός που δεν
  // έγινε. Ο παλιός κώδικας το φύλαγε με isToday· στο κύμα 3 ο φρουρός έγινε
  // `!isTmrw` και τα κουμπιά εμφανίστηκαν σε ΚΑΘΕ ημερομηνία. Επαναφορά 3/9.
  const isToday=OPS.date==='today';
  const done=st==='Delivered'||(isL&&st==='In Transit');
  if(done) return '';
  const slots=[];
  if(isToday){
    if(isL){
      // Multi: το κουμπί της σύνοψης ΔΕΝ δηλώνει — ανοίγει τα σημεία (owner 26/8)
      slots.push(multi?`<button class="do-btn" onclick="event.stopPropagation();_opsToggleStops('${id}')">Φορτώθηκε</button>`
                      :`<button class="do-btn" onclick="confirmAction('Φορτώθηκε;').then(ok=>{if(ok)_opsStat('${id}','In Transit')})">Φορτώθηκε</button>`);
    } else {
      const okFn=isOv?`_opsOvAct('${id}','On Time')`:`_opsDel('${id}','On Time')`;
      const lateFn=isOv?`_opsOvAct('${id}','Delayed')`:`_opsDel('${id}','Delayed')`;
      slots.push(multi?`<button class="do-btn" onclick="event.stopPropagation();_opsToggleStops('${id}')">Παραδόθηκε</button>`
                      :`<button class="do-btn" onclick="confirmAction('Παραδόθηκε;').then(ok=>{if(ok)${okFn}})">Παραδόθηκε</button>`);
      slots.push(multi?`<button class="do-late-btn" onclick="event.stopPropagation();_opsToggleStops('${id}')">Καθυστέρησε</button>`
                      :`<button class="do-late-btn" onclick="confirmAction('Καθυστέρησε;').then(ok=>{if(ok)${lateFn}})">Καθυστέρησε</button>`);
    }
  }
  slots.push(`<button class="do-ghost" onclick="_opsChangeDay(event,'${id}','${isL?'load':'deliver'}')">Αλλαγή ημέρας</button>`);
  return `<div class="do-slots">${slots.map(s=>`<span class="do-slot">${s}</span>`).join('')}</div>`;
}

function _opsRow(rec,num,type,isToday) {
  const f=rec.fields, id=rec.id;
  const client=_C(f), sub=_CSub(f);
  const loadL=_L(_opsStopLoc(id,'Loading'));
  const delivL=_L(_opsStopLoc(id,'Unloading'));
  const truck=_T(f), driver=_D(f), partner=_P(f);
  // Missing is not zero and not blank (DESIGN.md #3): a dash.
  const pal=f['Total Pallets']!=null&&f['Total Pallets']!==''?f['Total Pallets']:'—';
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

  const cl=`<td class="do-wrap"><span class="do-main">${escapeHtml(client)}</span>${sub?`<span class="do-sl">${sub}</span>`:''}</td>`;
  // Χωρίς ώρα δεν αποδίδεται ΤΙΠΟΤΑ — όπως ήδη κάνει η υπογραμμή πελάτη.
  // Οι στήλες loading_datetime/delivery_datetime είναι `date` στη βάση, άρα
  // το `_HM` γυρίζει πάντα κενό: το «—» κρεμόταν κάτω από ΚΑΘΕ τοποθεσία σε
  // κάθε γραμμή και διαβαζόταν ως «η ώρα είναι άγνωστη» ενώ ώρα δεν υπάρχει
  // καν ως έννοια (κανόνας #3: «—» σημαίνει άγνωστο).
  const locCell=(name,dt)=>{const hm=_HM(dt);
    return `<td class="do-wrap"><span class="do-main">${escapeHtml(name||'—')}</span>${hm?`<span class="do-sl">${hm}</span>`:''}</td>`;};
  // Assignment cell — colour AND word (DESIGN.md E, owner 4/9). «ΠΡΟΣ
  // ΑΝΑΘΕΣΗ», not «χωρίς οδηγό»: the empty cell means the dispatcher owes an
  // action, not that a driver is missing. Partner trips name the company —
  // the generic word «συνεργάτης» told the phone caller nothing.
  const asgCell=_opsAsgCell(f, truck, driver, partner);
  const pill=_opsStopsBadge(id,_stype);
  const stCell=`<td class="do-st">${_opsStatusWord(f,pill,isL)}</td>`;
  const actCell=`<td class="do-acts">${_opsSlots(rec,type)}</td>`;

  let mid='';
  if(isL&&isExp) mid=`${locCell(loadL,f['Loading DateTime'])}${asgCell}<td>${pal}</td><td>${!partner?amtInp('Advance Paid',f['Advance Paid']):''}</td>`;
  else if(isL)   mid=`${locCell(loadL,f['Loading DateTime'])}${asgCell}<td>${timeSelect('ETA',f['ETA'])}</td>`;
  else           mid=`${locCell(delivL,f['Delivery DateTime'])}${asgCell}<td>${timeSelect('ETA',f['ETA'])}</td>`;

  // Multi: κλικ στη γραμμή (όχι σε κουμπί/πεδίο) ανοίγει τα σημεία· οι
  // υπο-γραμμές ακολουθούν το tr ώστε να ζουν στο ίδιο tbody. Η ανοιχτή
  // γραμμή κρατά το φόντο επιλογής (.do-open) όσο είναι ανοιχτή.
  const _trClick=_multi?` onclick="if(!event.target.closest('button,input,select,a'))_opsToggleStops('${id}')"`:'';
  return `<tr id="r_${id}" class="do-hover${isDone?' do-done':''}${_expanded?' do-open':''}" style="${_multi?'cursor:pointer':''}"${_trClick}><td class="do-num">${num}</td>${cl}${mid}${stCell}${actCell}</tr>`+(_expanded?_opsSubRows(rec,_stype):'');
}

// Own fleet = a plate or a driver on a non-partner trip. A plate without a
// driver is still «ΙΔ.» — the truck is ours, the driver line just stays empty.
// «Partner Truck Plates» is NOT requested in OPS_FIELDS (the request must stay
// byte-identical to the 28/8 recording), so the partner line shows only the
// company; when the pair-inherit above brought plates in memory, they appear.
function _opsAsgCell(f, truck, driver, partner) {
  const sub=s=>s?`<span class="do-sl">${s}</span>`:'';
  if(partner){
    const name=getPartnerName(getLinkedId(f['Partner']))||'—';
    const plates=escapeHtml(String(f['Partner Truck Plates']||''));
    return `<td class="do-asg do-wrap"><span class="do-main"><span class="do-tag prt">ΣΥΝ.</span>${name}</span>${sub([plates,escapeHtml(driver)].filter(Boolean).join(' · '))}</td>`;
  }
  if(truck||driver){
    return `<td class="do-asg do-wrap"><span class="do-main"><span class="do-tag own">ΙΔ.</span>${escapeHtml(truck)||'—'}</span>${sub(escapeHtml(driver))}</td>`;
  }
  return `<td class="do-asg do-wrap"><span class="do-main"><span class="do-tag none">ΠΡΟΣ ΑΝΑΘΕΣΗ</span></span></td>`;
}

/* ── ACTIONS ──────────────────────────────────────────────────── */
async function _opsSvF(id,fld,v){try{await atSafePatch(TABLES.ORDERS,id,{[fld]:v||null});const r=OPS.intl.find(x=>x.id===id);if(r)r.fields[fld]=v;}catch(e){toast('Η αποθήκευση απέτυχε — δεν γράφτηκε τίποτα. Ξαναδοκίμασε.','danger');}}
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
async function _opsMarkStop(stop, perf){
  const patch={'Completed At': new Date().toISOString(), 'Completed By': _opsUser()};
  if(perf) patch['Performance']=perf;
  await atSafePatch(TABLES.ORDER_STOPS, stop.id, patch);
  Object.assign(stop.fields, patch);
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
    const loc=_L((f[F.STOP_LOCATION]||[])[0])||f['Stop Label']||'—';
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
        <span class="do-sloc">${escapeHtml(String(loc))}</span>
        <span style="color:var(--text-dim);font-variant-numeric:tabular-nums">${dt}</span>
        <span style="color:var(--text-dim);width:40px">${pal}</span>
        ${right}
      </div>`;
    return asDiv?`<div class="do-sub do-zsub">${inner}</div>`:`<tr class="do-sub"><td colspan="20">${inner}</td></tr>`;
  }).join('');
}
// Δήλωση ΕΝΟΣ σημείου — ανεξάρτητη: αν έμειναν άλλα, η παραγγελία δεν
// αγγίζεται καθόλου· όταν δηλωθεί το τελευταίο, τρέχει η κανονική ροή
// με το aggregate (καμία Delayed ⇒ On Time).
async function _opsMarkStopUI(orderId, stopId, perf){
  const stop=((OPS._stopsByOrder||{})[orderId]||[]).find(s=>s.id===stopId);
  if(!stop) return;
  try{ await _opsMarkStop(stop, perf); }
  catch(e){ toast('Σφάλμα δήλωσης σημείου: '+e.message,'danger'); if(typeof logError==='function') logError(e,'daily-ops: stop mark'); return; }
  const stype=stop.fields[F.STOP_TYPE];
  const all=_opsStopsOf(orderId, stype);
  const n=all.filter(x=>x.fields['Performance']).length;
  if(n===all.length && all.length){
    OPS._expanded && OPS._expanded.delete(orderId);
    const agg=all.some(x=>x.fields['Performance']==='Delayed')?'Delayed':'On Time';
    if(stype==='Unloading'){
      return OPS.overdue.some(r=>r.id===orderId) ? _opsOvActFinal(orderId,agg) : _opsDelFinal(orderId,agg);
    }
    return _opsStatFinal(orderId,'In Transit');
  }
  toast(`${n}/${all.length} — η παραγγελία μένει ως έχει μέχρι να δηλωθούν όλα`);
  _opsDraw();
}
async function _opsStat(id,st){
  if(st==='In Transit'){
    const loads=_opsStopsOf(id,'Loading');
    if(loads.length>1 && loads.some(x=>!x.fields['Performance'])){ _opsToggleStops(id); return; }
    // Μία φόρτωση: το κλικ σφραγίζει και τη στάση — ροή αμετάβλητη.
    if(loads.length===1) _opsMarkStop(loads[0], null).catch(e=>{ if(typeof logError==='function') logError(e,'daily-ops: single load stamp'); });
  }
  return _opsStatFinal(id,st);
}
// Βρες την εγγραφή σε όποια λίστα ζει (ημέρα ή εκκρεμείς φορτώσεις).
function _opsFind(id){ return OPS.intl.find(x=>x.id===id)||OPS.overdueLoads.find(x=>x.id===id)||OPS.overdue.find(x=>x.id===id); }
async function _opsStatFinal(id,st){try{
  const r0=_opsFind(id);
  const patch={'Status':st};
  // VS: το «Σε μεταφορά» σφραγίζει την πραγματική ημέρα αναχώρησης από CD
  if(st==='In Transit'&&r0?.fields['Veroia Switch']&&r0?.fields['Direction']==='Export'&&!r0?.fields['VS CD Date']){
    patch['VS CD Date']=localToday();
  }
  // Η αναβολή τελειώνει μόλις το φορτίο κινηθεί — αλλιώς το σήμα επιβιώνει για πάντα,
  // γιατί ΚΑΝΕΙΣ δεν καθάριζε ποτέ το πεδίο. Η πληροφορία ΔΕΝ χάνεται: κάθε PATCH
  // γράφεται με before/after στο audit_log, άρα το «πότε και από ποιον» μένει εκεί.
  if(r0?.fields['Postponed To']) patch['Postponed To']=null;
  await atSafePatch(TABLES.ORDERS,id,patch);
  if(r0){r0.fields['Status']=st;if(patch['VS CD Date'])r0.fields['VS CD Date']=patch['VS CD Date'];if('Postponed To' in patch)r0.fields['Postponed To']=null;}
  // Η εκκρεμής φόρτωση που φορτώθηκε φεύγει από τη ζώνη — δεν είναι πια εκκρεμής.
  OPS.overdueLoads=OPS.overdueLoads.filter(r=>r.id!==id);
  // Mirror Status on any linked PARTNER ASSIGNMENT
  try { await paSyncStatus({ parentType:'order', parentId:id, status:st }); }
  catch(e) { console.warn('PA status sync:', e.message); }
  toast((st==='In Transit'?'Φορτώθηκε':st)+' ✓');_opsDraw();}catch(e){toast('Η αποθήκευση απέτυχε — δεν γράφτηκε τίποτα. Ξαναδοκίμασε.','danger');}}
async function _opsDel(id,perf){
  const dels=_opsStopsOf(id,'Unloading');
  // Multi: το κουμπί της σύνοψης ΔΕΝ δηλώνει — ανοίγει τα σημεία (owner 26/8).
  if(dels.length>1){ if(!OPS._expanded?.has(id)) _opsToggleStops(id); return; }
  if(dels.length===1){ try{ await _opsMarkStop(dels[0], perf); }catch(e){ if(typeof logError==='function') logError(e,'daily-ops: single delivery stamp'); } }
  return _opsDelFinal(id,perf);
}
async function _opsDelFinal(id,perf){const d=localToday();
  // Ίδιος λόγος με το _opsStat: παραδομένη παραγγελία δεν είναι «αναβεβλημένη».
  const _r0=OPS.intl.find(x=>x.id===id);
  const _p={'Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d};
  if(_r0?.fields['Postponed To']) _p['Postponed To']=null;
  try{await atSafePatch(TABLES.ORDERS,id,_p);
  if (typeof plOnDelivered === 'function') plOnDelivered(id);
  const r=OPS.intl.find(x=>x.id===id);if(r){r.fields['Status']='Delivered';r.fields['Delivery Performance']=perf;if('Postponed To' in _p)r.fields['Postponed To']=null;}
  try { await paSyncStatus({ parentType:'order', parentId:id, status:'Delivered' }); }
  catch(e) { console.warn('PA status sync:', e.message); }
  toast(perf==='On Time'?'Παραδόθηκε ✓':'Καθυστέρησε — καταχωρήθηκε',perf==='Delayed'?'danger':'success');_opsDraw();}catch(e){toast('Η αποθήκευση απέτυχε — δεν γράφτηκε τίποτα. Ξαναδοκίμασε.','danger');}}

/* ── «Αλλαγή ημέρας» popover ───────────────────────────────────────────
   Η αναβολή ΕΙΝΑΙ αλλαγή ημερομηνίας στην παραγγελία — μία πηγή (αρχή 3).
   Popover στη γραμμή, προεπιλογή «Αύριο», Enter = ό,τι έκανε το σημερινό +1
   (owner 2/9). Το ρητό checkbox αντικαθιστά την τυφλή μετακίνηση της
   παράδοσης που έκανε ο παλιός κώδικας. */
function _opsCloseFloat(){ document.querySelectorAll('.do-pop').forEach(e=>e.remove()); document.removeEventListener('keydown',_opsPopKey); }
function _opsPopKey(e){ if(e.key==='Escape') _opsCloseFloat(); if(e.key==='Enter'&&document.querySelector('.do-pop')){ e.preventDefault(); _opsChangeDayGo(); } }
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
  ev.stopPropagation(); const rb=_opsRect(ev); _opsCloseFloat();
  const r=_opsFind(id); if(!r) return;
  const f=r.fields;
  const base=kind==='load'?f['Loading DateTime']:f['Delivery DateTime'];
  if(!base){ toast('Η παραγγελία δεν έχει ημερομηνία '+(kind==='load'?'φόρτωσης':'παράδοσης'),'danger'); return; }
  // Βάση των επιλογών = ΣΗΜΕΡΑ, όχι η παλιά ημέρα της γραμμής (3/9): στη ζώνη
  // εκκρεμών η παλιά ημέρα είναι ήδη περασμένη, οπότε το «Αύριο» μετέθετε στο
  // ΠΑΡΕΛΘΟΝ και η γραμμή ξαναγύριζε εκκρεμής. Το `base` μένει ως το «τώρα …»
  // και ως αφετηρία του delta που μετακινεί μαζί την παράδοση.
  const _tdy=localToday();
  const tmrw=_plus(_tdy,1), mon=_nextMonday(_tdy);
  const stype=kind==='load'?'Loading':'Unloading';
  const loc=_L(_opsStopLoc(id,stype))||'';
  const hasDel=kind==='load'&&!!f['Delivery DateTime'];
  OPS._pop={id,kind,base,choice:tmrw,moveDel:hasDel};
  const p=document.createElement('div'); p.className='do-pop';
  p.innerHTML=`<h4>Αλλαγή ημέρας ${kind==='load'?'φόρτωσης':'παράδοσης'}</h4>
    <div class="do-psub">${escapeHtml(_C(f))}${loc?' · '+escapeHtml(loc):''}${f['Total Pallets']?' · '+f['Total Pallets']+'p':''} · τώρα ${_DMY(base)}</div>
    <div class="do-opts">
      <button class="do-opt on" data-v="${tmrw}" onclick="_opsPopPick(this)"><b>Αύριο</b><span>${_dowShort(tmrw)} ${_DMY(tmrw)}</span></button>
      <button class="do-opt" data-v="${mon}" onclick="_opsPopPick(this)"><b>Δευτέρα</b><span>${_DMY(mon)}</span></button>
      <button class="do-opt" data-v="" onclick="_opsPopPick(this)"><b>Άλλη…</b><input type="date" min="${localToday()}" onclick="event.stopPropagation()" onchange="_opsPopOther(this)"></button>
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
  if (typeof syncOrderDownstream === 'function') {
    syncOrderDownstream(p.id, { source: 'intl', changedFields: Object.keys(patch), skipPA: true })
      .catch(e => console.warn('[ops change-day sync]', e));
  }
  toast('Μετατέθηκε → '+_DMYFull(p.choice));OPS._pop=null;renderDailyOps();}catch(e){toast('Η αποθήκευση απέτυχε — δεν γράφτηκε τίποτα. Ξαναδοκίμασε.','danger');}
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
  if(dels.length===1){ try{ await _opsMarkStop(dels[0], perf); }catch(e){ if(typeof logError==='function') logError(e,'daily-ops: overdue stamp'); } }
  return _opsOvActFinal(id,perf);
}
async function _opsOvActFinal(id,perf='Delayed'){const d=localToday();
  // Ίδιο καθάρισμα με το _opsDel — η καθυστερημένη κλείνει κι αυτή τον κύκλο.
  const _ov=OPS.overdue.find(x=>x.id===id);
  const _p={'Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d};
  if(_ov?.fields['Postponed To']) _p['Postponed To']=null;
  try{await atSafePatch(TABLES.ORDERS,id,_p);
  if (typeof plOnDelivered === 'function') plOnDelivered(id);
  // Central sync — propagate status to partner assignments
  if (typeof syncOrderDownstream === 'function') {
    syncOrderDownstream(id, { source: 'intl', changedFields: ['Status'], skipVS: true, skipGRP: true, skipRamp: true })
      .catch(e => console.warn('[ops overdue sync]', e));
  }
  OPS.overdue=OPS.overdue.filter(r=>r.id!==id);toast(perf==='Delayed'?'Σημειώθηκε ως καθυστερημένη':'Σημειώθηκε ως παραδοθείσα');_opsDraw();}catch(e){toast('Η αποθήκευση απέτυχε — δεν γράφτηκε τίποτα. Ξαναδοκίμασε.','danger');}}

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
window._opsMarkStopUI = _opsMarkStopUI;
window._opsChangeDay = _opsChangeDay; window._opsChangeDayGo = _opsChangeDayGo;
window._opsPopPick = _opsPopPick; window._opsPopOther = _opsPopOther; window._opsPopHint = _opsPopHint; window._opsCloseFloat = _opsCloseFloat;
})();
