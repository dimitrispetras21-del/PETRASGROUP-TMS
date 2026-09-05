// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL — v12
// ─────────────────────────────────────────────────────────────────────
// ORDERS-only. No TRIPS.
//
// Fields read from ORDERS:
//   Direction, Type, "Week Number", Loading DateTime, Delivery DateTime,
//   Loading Summary, Delivery Summary, Total Pallets, Veroia Switch,
//   Truck[], Trailer[], Driver[], Partner[], Is Partner Trip,
//   Partner Truck Plates, Matched Import ID
//
// Fields written on assignment save:
//   Truck, Trailer, Driver, Partner, Is Partner Trip, Partner Truck Plates
//
// Fields written on import drop (auto-save, independent):
//   Matched Import ID  (stores import order record ID as text)
// ═══════════════════════════════════════════════════════════════════════
(function() {
'use strict';

// PARTNER ASSIGNMENTS table (tblUhgqnmiam5MGNK)
// PA table/fields now live in config.js (TABLES.PARTNER_ASSIGN + F.PA_*)
// PA writes delegated to core/pa-helpers.js

const WINTL = {
  week:      _wiCurrentWeek(),
  shelf:     [], // kept for compat, not used for display
  data:      { exports:[], imports:[], trucks:[], trailers:[], drivers:[], partners:[] },
  rows:      [],
  ui:        { openRow:null, openGroup:null },
  filter:    '',
  filterStatus: '',
  quick:     '',   // v2 band quick filter: ''|pending|gap|own|partner|matched
  _seq:      0,
};

// Search / status select / quick-filter chips — all by hiding rows, no rebuild.
function _wiApplyFilter() {
  const q = (WINTL.filter || '').toLowerCase();
  const fs = WINTL.filterStatus || '';
  const qk = WINTL.quick || '';
  document.querySelectorAll('#wi-rows [data-row-id]').forEach(el => {
    const row = WINTL.rows.find(r => String(r.id) === el.dataset.rowId);
    if (!row) { el.style.display = ''; return; }
    let show = true;
    if (q) {
      const blob = [
        row.truckLabel, row.driverLabel, row.partnerLabel,
        ...(row.orderIds || []).map(oid => {
          const o = WINTL.data.exports.find(r=>r.id===oid) || WINTL.data.imports.find(r=>r.id===oid);
          if (!o) return '';
          const f = o.fields;
          // 'Reference' — there is no 'Order Number' field (CLAUDE.md name traps)
          return [f['Loading Summary'], f['Delivery Summary'], f['Reference']].filter(Boolean).join(' ');
        })
      ].join(' ').toLowerCase();
      if (!blob.includes(q)) show = false;
    }
    if (show && fs) {
      if (fs === 'pending' && row.saved) show = false;
      else if (fs === 'assigned' && !row.saved) show = false;
      else if (fs === 'unmatched' && (row.type !== 'import' || row.matchedTo)) show = false;
    }
    if (show && qk) show = _wi2QuickMatch(row, qk);
    el.style.display = show ? '' : 'none';
  });
  document.querySelectorAll('.wi2-chip').forEach(c => c.classList.toggle('on', (c.dataset.q || '') === qk));
}
// Quick filters of the v2 band. «Χωρίς ανάθεση» = neither own truck nor partner
// (DECISION_LOG 2/9). «Κενά» = own round trip without import — a partner row is
// never a gap (owner 9/8: nothing is expected back from a partner).
function _wi2QuickMatch(row, qk) {
  if (row.legOf) return true;
  switch (qk) {
    case 'pending': return !row.saved;
    case 'gap':     return row.type === 'export' && row.saved && !row.partnerId && !row.importId;
    case 'own':     return row.saved && !row.partnerId;
    case 'partner': return row.saved && !!row.partnerId;
    case 'matched': return row.type === 'export' && !!row.importId;
    default: return true;
  }
}
function _wi2Quick(qk) { WINTL.quick = (WINTL.quick === qk) ? '' : qk; _wiApplyFilter(); }


/* ── CSS moved to assets/style.css ── */
/* ── UTILS ─────────────────────────────────────────────────────────── */
// Owner (10/8, feedback dispatcher): η εβδομάδα προβολής ξεκινά ΣΑΒΒΑΤΟ και
// κλείνει Παρασκευή (εξοικείωση από το Excel). Display-level μόνο: κρατάμε
// την αρίθμηση WEEKNUM, μετατοπίζουμε το όριο μία μέρα νωρίτερα — μια
// ημερομηνία ανήκει στη νέα εβδομάδα Ν αν η (ημερομηνία+1μέρα) ανήκε στην
// παλιά (Κυριακή-start). Τα αποθηκευμένα δεδομένα/VS dates δεν αλλάζουν.
function _wiWeekNumOf(d){
  const y=d.getFullYear(),j=new Date(y,0,1);
  return Math.ceil(((d-j)/86400000+j.getDay()+1)/7);
}
// "Τρέχουσα" (today's) week now reuses the canonical isoWeekNumber() (core/
// utils.js) instead of the Saturday-shifted WEEKNUM formula above —
// weekly_natl.js's equivalent bug (Saturday misplaced a week early) meant the
// two boards' "current week" badges could disagree (design audit 5/9/2026,
// A1). _wiWeekNumOf/_wiWeekOf still bucket ORDER ROWS into week tabs with the
// Saturday-start scheme — untouched, that is a separate, wider concern.
function _wiCurrentWeek(){
  return isoWeekNumber(new Date());
}
// Week start για εβδομάδα w — πλέον ΣΑΒΒΑΤΟ (Κυριακή παλιάς αρίθμησης −1μέρα)
function _wiWeekStart(w){
  const y=new Date().getFullYear(),jan1=new Date(y,0,1);
  const firstSun=new Date(jan1); firstSun.setDate(jan1.getDate()-jan1.getDay());
  const ws=new Date(firstSun); ws.setDate(firstSun.getDate()+(w-1)*7-1); // Σάββατο
  return ws;
}
function _wiWeekRange(w){
  const ws=_wiWeekStart(w);
  const we=new Date(ws); we.setDate(ws.getDate()+6);
  const f=d=>d.toLocaleDateString('el-GR',{day:'numeric',month:'short'});
  return `${f(ws)} – ${f(we)}`;
}
const _WI_WD=['Κυρ','Δευ','Τρί','Τετ','Πέμ','Παρ','Σάβ'];
function _wiFmt(s){
  if(!s) return '—';
  try{const iso=toLocalDate(s);const p=iso.split('-');const d=new Date(iso+'T12:00:00');
    return`${_WI_WD[d.getDay()]} ${p[2]}/${p[1]}`;}catch{return s;}
}
function _wiClean(s){return escapeHtml((s||'').replace(/^['"\s/]+/,'').replace(/['"\s/]+$/,'').trim());}
// ΩΜΗ εκδοχή για ό,τι περνάει σε _wk3LocHTML/_wk3MoreStops — εκείνα κάνουν το
// escape στο render· διπλό escape εμφάνιζε «&quot;» σε ονόματα με εισαγωγικά.
function _wiRaw(s){return (s||'').replace(/^['"\s/]+/,'').replace(/['"\s/]+$/,'').trim();}
function _wiFv(v){return Array.isArray(v)?v[0]||'':v||'';}
// Κ6: a shortened company name always shows that it was shortened. Menus and
// dialogs used bare .slice(0,n) — the reader could not tell «KOLIOS» from
// «KOLIOS GmbH Fleischwaren» cut at the same letter.
function _wiCut(s,n){ s=String(s||''); return s.length>n?s.slice(0,n-1)+'…':s; }

// Batch fetch ORDER_STOPS and inject Loading/Delivery Summary into records missing them
async function _wiInjectStopSummaries(allOrders) {
  const allStopIds = allOrders.flatMap(r => r.fields['ORDER STOPS'] || []);
  if (!allStopIds.length) return;
  try {
    await fhLoadLocations();
    const stopsByOrder = {};
    for (let b = 0; b < allStopIds.length; b += 90) {
      const batch = allStopIds.slice(b, b + 90);
      const f = `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(',')})`;
      const recs = await atGetAll(TABLES.ORDER_STOPS, { filterByFormula: f }, false);
      recs.forEach(sr => {
        const pid = Array.isArray(sr.fields[F.STOP_PARENT_ORDER]) ? sr.fields[F.STOP_PARENT_ORDER][0] : null;
        if (pid) { if (!stopsByOrder[pid]) stopsByOrder[pid] = []; stopsByOrder[pid].push(sr); }
      });
    }
    const _resolveName = (stopType, orderId) => {
      const stops = stopsByOrder[orderId];
      if (!stops) return null;
      const filtered = stops.filter(s => s.fields[F.STOP_TYPE] === stopType)
        .sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0));
      if (!filtered.length) return null;
      return filtered.map(s => {
        const locId = Array.isArray(s.fields[F.STOP_LOCATION]) ? s.fields[F.STOP_LOCATION][0] : null;
        return locId ? (_fhLocationsMap[locId] || locId.slice(-6)) : '?';
      }).join(', ');
    };
    allOrders.forEach(r => {
      // Ακριβή ονόματα σημείων ως arrays — το route τα χρησιμοποιεί ΧΩΡΙΣ
      // parsing του summary string (bug: «η πόλη αντί για τον τίτλο» στα 2α σημεία)
      const stops=stopsByOrder[r.id];
      if(stops){
        const namesOf=t=>stops.filter(s=>s.fields[F.STOP_TYPE]===t)
          .sort((a,b)=>(a.fields[F.STOP_NUMBER]||0)-(b.fields[F.STOP_NUMBER]||0))
          .map(s=>{const lid=Array.isArray(s.fields[F.STOP_LOCATION])?s.fields[F.STOP_LOCATION][0]:null;
            return {n:lid?(_fhLocationsMap[lid]||''):'', dt:s.fields[F.STOP_DATETIME]||''};})
          .filter(x=>x.n);
        const L=namesOf('Loading'), D=namesOf('Unloading');
        if(L.length) r.fields._stopsL=L;
        if(D.length) r.fields._stopsD=D;
      }
      if (!r.fields['Loading Summary']) {
        const ls = _resolveName('Loading', r.id);
        if (ls) r.fields['Loading Summary'] = ls;
      }
      if (!r.fields['Delivery Summary']) {
        const ds = _resolveName('Unloading', r.id);
        if (ds) r.fields['Delivery Summary'] = ds;
      }
    });
  } catch(e) { console.warn('Weekly INTL: ORDER_STOPS summary inject failed', e); }
}

// v2 board (Figma w4-weekly-intl-board-v2 319:873, popover 189:745), scoped
// under .wk3.wi2 so the shared wk3-* rules weekly_natl still uses stay
// untouched. DESIGN.md tokens only (wave 5, 5/9): surfaces/text/border/
// semantic — no hex, no shadow on cards (depth = borders), radii 6/9999,
// spacing 4·8·12·16·24·32, sizes 11·12·13·14·18 (the urgent gap box is the
// one deliberate exception: owner 4/9, it stays byte-identical).
const _WI2_CSS=`
.wk3.wi2{--fL:200px;--fR:200px}
.wk3.wi2.fl-off{--fL:18px}.wk3.wi2.fr-off{--fR:18px}
/* ΑΥΤΟΜΑΤΟ ΜΑΖΕΜΑ ΤΩΝ ΕΘΝΙΚΩΝ ΣΤΗΛΩΝ (owner 3/9). Οι έξι στήλες θέλουν
   ~1200px· σε παράθυρο 1440 μένουν ~1100, οπότε ή ξεχειλίζουν (παραγωγή:
   70px στα 1440, 144px στα 1366) ή στριμώχνονται τόσο που κόβονται τα
   ονόματα. Οι δύο στήλες «προς/από Βέροια» είναι οι λιγότερο κρίσιμες και
   έχουν ήδη χειροκίνητο διακόπτη — εδώ γίνεται αυτόματος. Πάνω από 1500
   επανέρχονται πλήρεις. Τα ◂ ▸ εξακολουθούν να δουλεύουν χειροκίνητα. */
@media (max-width:1800px){.wk3.wi2{--fL:18px;--fR:18px}}
/* Μαζεμένη στήλη = μαζεμένη κεφαλίδα. Το κείμενο «ΠΡΟΣ/ΑΠΟ ΒΕΡΟΙΑ» είναι
   γυμνός κόμβος δίπλα στο βελάκι, οπότε ξεχείλιζε από τα 18px. font-size:0
   στο κελί και κανονικό στο βελάκι: το κείμενο φεύγει, το ◂ ▸ μένει και η
   στήλη παραμένει πατήσιμη. Ίδιο και για τον χειροκίνητο διακόπτη, που το
   είχε ΚΑΙ ΑΥΤΟΣ — απλώς δεν το έβλεπε κανείς. */
@media (max-width:1800px){.wk3.wi2 .wk3-cols .c.fc{font-size:0;overflow:hidden;padding:0;text-align:center}.wk3.wi2 .wk3-cols .c.fc .fc-ch{font-size:11px}}
.wk3.wi2.fl-off .wk3-cols .c.fc:first-child,.wk3.wi2.fr-off .wk3-cols .c.fc:last-child{font-size:0;overflow:hidden}
.wk3.wi2.fl-off .wk3-cols .c.fc:first-child .fc-ch,.wk3.wi2.fr-off .wk3-cols .c.fc:last-child .fc-ch{font-size:11px}
/* ΣΤΟΙΧΙΣΗ (owner 3/9, πάνω στα πραγματικά δεδομένα): κάθε .wk3-row είναι
   ΔΙΚΟ ΤΟΥ πλέγμα, και το minmax(260px,…) έβαζε ελάχιστο που εξαρτάται από
   το περιεχόμενο — άρα κάθε γραμμή υπολόγιζε ΔΙΚΑ ΤΗΣ πλάτη. Οι γραμμές με
   «ΚΕΝΟ ΓΥΡΙΣΜΑ» (κουτί flex:1) έβγαζαν τις στήλες ~170px αριστερότερα από
   τις κανονικές, στον ίδιο πίνακα. minmax(0,…) αφαιρεί το κατώφλι
   περιεχομένου: τα κλάσματα γίνονται καθαρά αναλογικά και κάθε γραμμή —
   και η κεφαλίδα — βγάζει ταυτόσημες στήλες. */
.wk3.wi2 .wk3-cols,.wk3.wi2 .wk3-row{grid-template-columns:36px var(--fL) minmax(0,1.1fr) 240px minmax(0,0.9fr) var(--fR)}
.wi2-mast{display:flex;align-items:center;gap:var(--space-4);margin-bottom:var(--space-3);flex-wrap:wrap}
.wi2-title{font-family:'Syne',sans-serif;font-weight:700;font-size:18px;color:var(--text);display:flex;align-items:center;gap:12px;white-space:nowrap}
.wi2-legend-btn{font:500 11px 'DM Sans',sans-serif;color:var(--text-mid);border:1px solid var(--border);border-radius:var(--radius-full);padding:4px 8px;background:none;cursor:pointer}
.wi2-legend-btn:hover{background:var(--surface-sunken)}
/* min-width:0 + overflow-x lets this strip scroll instead of forcing .wi2-mast
   (and the page) wider at narrow widths like 390px (design audit 5/9/2026, A5,
   same fix as the shared .wk3-tabs in assets/style.css). */
.wi2-tabs{display:flex;gap:4px;background:var(--surface-sunken);border-radius:var(--radius);padding:4px;margin:0 auto;
  min-width:0;overflow-x:auto;scroll-snap-type:x proximity}
.wi2-tabs::-webkit-scrollbar{display:none}
.wi2-tabs .wk3-tab{scroll-snap-align:center}
.wi2-tabs .wk3-step,.wi2-tabs .wk3-tab{border:none;background:none;cursor:pointer;font:500 12px 'DM Sans',sans-serif;color:var(--text-mid);padding:8px 12px;border-radius:var(--radius);line-height:1.3}
.wi2-tabs .wk3-step{padding:8px;font-weight:700;color:var(--text-dim)}
.wi2-tabs .wk3-tab:hover{background:var(--surface-card)}
.wi2-tabs .wk3-tab.on{background:var(--surface-dark);color:var(--text-on-dark);font-weight:700}
.wi2-acts{display:flex;gap:8px;align-items:center}
.wi2-btn{font:500 12px 'DM Sans',sans-serif;color:var(--text-mid);background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);padding:8px 12px;cursor:pointer;white-space:nowrap;line-height:1.3}
.wi2-btn:hover{background:var(--surface-sunken);color:var(--text)}
.wi2-btn.primary{background:var(--accent);border-color:var(--accent);color:var(--surface-card);font-weight:700}
.wi2-btn.primary:hover{background:var(--accent-hover)}
.wi2-lg{background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;margin-bottom:12px;font-size:11px;color:var(--text-mid);display:flex;flex-wrap:wrap;gap:8px 24px}
.wi2-lg b{color:var(--text)}
.wi2-lg[hidden]{display:none}
.wi2-band{display:flex;align-items:center;gap:16px;padding:12px;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:12px;flex-wrap:wrap}
.wi2-urg{display:flex;align-items:center;gap:12px;padding:8px 16px 8px 12px;border:1px solid var(--warn-border);border-radius:var(--radius);background:var(--warn-bg)}
.wi2-urg.zero{border-color:var(--border);background:var(--surface-card)}
.wi2-urg .n{font:700 18px 'Syne',sans-serif;color:var(--surface-card);background:var(--warn);border:none;border-radius:var(--radius);padding:4px 12px;cursor:pointer;line-height:1.2;font-variant-numeric:tabular-nums}
.wi2-urg.zero .n{background:var(--surface-sunken);color:var(--text-dim);cursor:default}
.wi2-urg h4{font:700 12px 'Syne',sans-serif;letter-spacing:1px;color:var(--warn);margin:0}
.wi2-urg.zero h4{color:var(--text-dim)}
.wi2-urg p{font-size:11px;color:var(--text-mid);margin:4px 0 0}
.wi2-quick .k{font:700 11px 'DM Sans',sans-serif;letter-spacing:1px;color:var(--text-dim)}
.wi2-quick .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.wi2-chip{font:500 12px 'DM Sans',sans-serif;color:var(--text-mid);background:var(--surface-sunken);border:1px solid transparent;border-radius:var(--radius);padding:4px 12px;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums}
.wi2-chip:hover{background:var(--border)}
.wi2-chip.on{background:var(--surface-dark);color:var(--text-on-dark);font-weight:700}
/* Δ2 «ανενεργό»: φίλτρο με μηδέν αποτελέσματα δεν πατιέται — ένα κλικ που
   αδειάζει την οθόνη χωρίς λόγο διαβάζεται ως σφάλμα. */
.wi2-chip:disabled,.wi2-chip:disabled:hover{color:var(--text-dim);background:var(--surface-card);border-color:var(--border);cursor:default}
.wi2-week{margin-left:auto;font:500 12px 'DM Sans',sans-serif;color:var(--text-dim);white-space:nowrap;font-variant-numeric:tabular-nums}
/* 340px was an unmeasured guess. Measured with Playwright at 1440×900 against
   a real loaded week (W35, design audit 5/9/2026 A7): topbar 52 + content's
   own 32px top padding + .wi2-mast 89 (12 margin) + .wi2-band 74 (12 gap) +
   .wk3-sub 62 (10 gap) = 343px of real chrome above this sheet. 344 rounds up
   so the sheet never runs 1px past the true chrome. This barely differs from
   the old 340 — it does not by itself reach the ≥20-rows target below; that
   comes from the row min-height cut alongside it. */
.wk3.wi2 .wk3-sheet{background:transparent;border:none;box-shadow:none;border-radius:0;max-height:calc(100vh - 344px);padding-bottom:4px}
.wk3.wi2 .wk3-cols{background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;min-height:30px}
.wk3.wi2 .wk3-cols .c{font:700 11px 'Syne',sans-serif;letter-spacing:1.2px;color:var(--text-mid);padding:0 8px;height:30px;gap:4px}
.wk3.wi2 .wk3-cols .c.fc{color:var(--text-dim)}
.wk3.wi2 .wk3-cols .c .fc-ch{font-size:11px}
.wk3.wi2 .wk3-cols .n{background:none;color:inherit;font:700 11px 'Syne',sans-serif;letter-spacing:1.2px;min-width:0;height:auto;padding:0;font-variant-numeric:tabular-nums}
.wi2-day{background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);padding:4px 12px 8px;margin-bottom:8px}
.wi2-day.today{border-color:var(--accent)}
.wi2-day.empty{padding-bottom:8px}
.wk3.wi2 .wk3-dayh{position:sticky;top:38px;z-index:20;background:var(--surface-card);border:none;padding:8px 4px 4px;gap:12px;align-items:baseline;box-shadow:none}
.wk3.wi2 .wk3-dayh .d{font:700 18px 'Syne',sans-serif;letter-spacing:0;color:var(--text);font-variant-numeric:tabular-nums}
.wk3.wi2 .wk3-dayh.today .d{color:var(--text)}
.wk3.wi2 .wk3-dayh .now{font:700 11px 'DM Sans',sans-serif;letter-spacing:1px;color:var(--surface-card);background:var(--accent);border:none;border-radius:var(--radius-full);padding:0 8px;line-height:16px}
.wi2-none{font-size:11px;color:var(--text-dim);padding:4px 4px 0;font-style:italic}
/* ΥΨΟΣ ΓΡΑΜΜΗΣ ≤ 44px (DESIGN Κ5): γραμμή 1px + κελί 0 + κάρτα 4+1 πάνω/κάτω
   = 12px «σκελετός», οπότε το περιεχόμενο της κάρτας έχει ακριβώς 32px:
   όνομα 16px + σειρά μεταδεδομένων 16px. Κάθε padding εδώ είναι μετρημένο.
   min-height is the FLOOR for the shortest rows, not this ceiling — a 2-line
   card already grows past it to the 44px above regardless of the number
   below, since nothing here clips overflow. 40→36 (design audit 5/9/2026, A7)
   only tightens rows shorter than that floor; verified in Playwright against
   real W35 data that every 2-line row still renders ≥44px, K5 unaffected. */
.wk3.wi2 .wk3-row{min-height:36px;margin-top:4px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-card);align-items:center}
.wk3.wi2 .wk3-row.alt{background:var(--surface-card)}
.wk3.wi2 .wk3-row:hover{background:var(--surface-sunken)}
.wk3.wi2 .wk3-row.wi2-un{border-color:var(--unassigned);border-left-width:3px}
.wk3.wi2 .wk3-row.wi2-gap{border-color:var(--warn);border-left-width:3px}
/* ΣΥΓΚΡΟΥΣΗ ΟΝΟΜΑΤΟΣ (owner 3/9, από screenshot της οθόνης του): η μπάντα
   «ΚΕΝΑ ΓΥΡΙΣΜΑΤΑ» και οι επείγουσες ΓΡΑΜΜΕΣ είχαν την ίδια κλάση
   .wi2-urg. Ο κανόνας της μπάντας ορίζει display:flex και γράφεται μετά
   το style.css, οπότε νικούσε το display:grid της γραμμής: ΜΟΝΟ αυτές οι
   γραμμές έπαυαν να είναι πλέγμα και στοιβάζονταν αριστερά, με έξτρα
   padding και φόντο κάρτας. Η γραμμή πήρε δικό της όνομα. */
.wk3.wi2 .wk3-row.wi2-rowurg{border-color:var(--danger-strong);border-left-width:3px}
.wk3.wi2 .wk3-row.wk3-done{background:var(--success-bg)}
.wk3.wi2 .wk3-legrow{background:var(--surface-page);border-style:dashed;min-height:38px}
.wk3.wi2 .wk3-num{border-right:none;font-size:11px;color:var(--text-dim);justify-content:flex-start;padding-left:8px;gap:4px;flex-wrap:wrap;font-variant-numeric:tabular-nums}
.wk3.wi2 .wk3-num.imp{color:var(--accent-text);font-weight:700}
.wk3.wi2 .wk3-num .wi-sync{display:inline;margin:0;font-size:11px}
.wk3.wi2 .wk3-grpb{font-size:11px;padding:0 4px;border-radius:var(--radius-full)}
.wk3.wi2 .wk3-leg{display:grid;grid-template-columns:minmax(0,var(--sL,1fr)) auto minmax(0,var(--sR,1fr));padding:0 4px;align-items:center;gap:4px;min-height:38px}
.wk3.wi2 .wk3-leg.gap,.wk3.wi2 .wk3-leg.void{background:transparent;justify-content:stretch}
.wk3.wi2 .wk3-leg.bgap,.wk3.wi2 .wk3-leg.grp{background:transparent}
/* ΚΑΡΤΑ ΔΥΟ ΣΕΙΡΩΝ (owner 4/9): το όνομα παίρνει ΟΛΟ το πλάτος σε δική του
   σειρά· ημερομηνία, πόλη, σήματα και παλέτες στη δεύτερη. Πριν, το πλακίδιο
   ημερομηνίας και οι παλέτες έτρωγαν ~110px από το όνομα στην ίδια σειρά. */
.wi2-card{flex:1 1 0;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:0;min-height:34px;padding:4px 8px;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);box-sizing:border-box;transition:border-color var(--duration-fast) var(--ease-out),background var(--duration-fast) var(--ease-out),box-shadow var(--duration-fast) var(--ease-out),transform var(--duration-fast) var(--ease-out)}
.wk3-leg:hover>.wi2-card{border-color:var(--text-dim);transform:translateY(-1px);box-shadow:var(--shadow-lift)}
@media (prefers-reduced-motion:reduce){.wi2-card{transition:none}.wk3-leg:hover>.wi2-card{transform:none}}
.wk3.wi2 .wk3-pill,.wk3.wi2 .wi2-gapbox,.wk3.wi2 .wi2-void,.wk3.wi2 .wi2-date,.wk3.wi2 .wi2-carrier{transition:box-shadow var(--duration-fast) var(--ease-out),transform var(--duration-fast) var(--ease-out),border-color var(--duration-fast) var(--ease-out),background var(--duration-fast) var(--ease-out)}
.wk3.wi2 .wk3-pill:hover,.wk3.wi2 .wi2-gapbox:hover,.wk3.wi2 .wi2-date:hover,.wk3.wi2 .wi2-carrier:hover{transform:translateY(-1px);box-shadow:var(--shadow-lift)}.wk3.wi2 .wk3-feed .wi2-card{flex:0 0 auto;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:6px;min-height:22px;padding:1px 6px}
.wk3.wi2 .wk3-feed .wi2-card>.wi2-name{flex:1 1 auto;width:auto;min-width:0;order:2}
.wk3.wi2 .wk3-feed .wi2-card>.wi2-meta{flex:0 0 auto;order:1}
.wk3.wi2 .wk3-feed .wi2-card .wi2-cb{flex-direction:row;align-items:baseline;gap:6px;min-width:0}
.wk3.wi2 .wk3-feed .wi2-card .wi2-sub{display:none}
.wk3.wi2 .wk3-feed .wi2-card .wi2-name{font-size:12px;line-height:18px}
.wk3.wi2 .wk3-feed .wi2-date.wk3-ld{min-width:0;padding:0 5px;font-size:10.5px;line-height:18px}
.wk3.wi2 .wi2-carrier{font:600 11px 'DM Sans',sans-serif;line-height:16px;padding:1px 8px;border-radius:9999px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;box-sizing:border-box;cursor:default}
.wk3.wi2 .wi2-carrier.own{background:var(--navy-mid);color:var(--text-on-dark)}
.wk3.wi2 .wi2-carrier.par{background:var(--chip-partner);color:var(--text-on-dark)}
.wk3.wi2 .wi2-carrier.un{background:transparent;border:1px dashed var(--unassigned);color:var(--unassigned)}
.wk3.wi2 .wk3-sheet:fullscreen,.wk3.wi2 .wk3-sheet:-webkit-full-screen{background:var(--bg);padding:12px;overflow:auto;width:100%;height:100%}
@media (prefers-reduced-motion:reduce){.wk3.wi2 .wk3-pill,.wk3.wi2 .wi2-gapbox,.wk3.wi2 .wi2-void,.wk3.wi2 .wi2-date,.wk3.wi2 .wi2-carrier{transition:none}.wk3.wi2 .wk3-pill:hover,.wk3.wi2 .wi2-gapbox:hover,.wk3.wi2 .wi2-date:hover,.wk3.wi2 .wi2-carrier:hover{transform:none}}
.wi2-card.ok{background:var(--success-bg);border-color:var(--ok)}
.wi2-card.late{background:var(--danger-bg);border-color:var(--danger)}
.wi2-meta{display:flex;align-items:center;gap:8px;min-width:0;height:16px}
.wi2-right{margin-left:auto;display:inline-flex;align-items:center;gap:4px;flex-shrink:0}
.wi2-right>*{flex-shrink:0}
.wi2-date{flex-shrink:0;font:700 11px 'DM Sans',sans-serif;color:var(--accent-text);background:var(--accent-light);border-radius:var(--radius);padding:0 8px;line-height:16px;cursor:pointer;font-variant-numeric:tabular-nums;margin:0}
/* ΣΤΟΙΧΙΣΗ (owner 3/9): το πλακίδιο έπαιρνε πλάτος από το περιεχόμενο —
   μετρήθηκαν 26,6px («1/9») έως 44px («28/8» με ✓) — και το όνομα του
   πελάτη ξεκινούσε σε έξι διαφορετικά x μέσα στην ίδια στήλη (560..577).
   min-width αντί για width: τα κοντά πλακίδια γεμίζουν ως το κοινό όριο,
   ένα μελλοντικό πιο μακρύ σπρώχνει αντί να κοπεί. */
.wk3.wi2 .wi2-date.wk3-ld{width:auto;min-width:78px;box-sizing:border-box;text-align:left;margin:0;font-size:11px}
.wk3.wi2 .wi2-date.wk3-ld.done::after{font-size:11px}
/* style.css pins these two with !important and hex; same weight, token value */
.wk3.wi2 .wk3-ld.done{color:var(--ok) !important}
.wk3.wi2 .wk3-ld.late{color:var(--warn) !important}
.wi2-date.estd{font-style:italic;border:1px dashed var(--accent-text);background:transparent;line-height:14px}
/* ΚΛΙΜΑΚΩΣΗ ΟΝΟΜΑΤΟΣ (owner 4/9): μία σειρά, 13px. Αν δεν χωρά, η
   _wi2Balance κατεβάζει ΜΟΝΟ αυτό το όνομα ως 10px· αν ούτε έτσι, .clamp
   (δύο σειρές με ορατό «…» + title). Το ellipsis εδώ είναι δίχτυ, όχι
   σχέδιο: ποτέ σιωπηλή κοπή (Κ6), ακόμη και πριν προλάβει η μέτρηση. */
.wi2-name{font-size:13px;line-height:16px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wi2-name>*{margin-right:4px}
.wi2-name.clamp{white-space:normal;overflow-wrap:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.2}
.wk3.wi2.wi2-measure .wi2-name,.wk3.wi2.wi2-measure .wi2-sub{white-space:nowrap;display:block;overflow:visible}
.wi2-sub{font-size:11px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.wi2-nw{white-space:nowrap}
.wi2-ref{font-size:11px;color:var(--text-dim);white-space:nowrap}
.wi2-pal{font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;font-variant-numeric:tabular-nums}
.wi2-pal.hi{color:var(--warn);font-weight:700}.wi2-pal.over{color:var(--danger);font-weight:700}.wi2-pal.na{color:var(--text-dim);cursor:help}
.wi2-flags{display:inline-flex;gap:4px;align-items:center}
.wi2-flags:empty{display:none}
.wk3.wi2 .wi-badge{font-size:11px;padding:0 4px;border-radius:var(--radius);line-height:16px;letter-spacing:.5px;margin:0}
.wk3.wi2 .wi-cross,.wk3.wi2 .wi-exec{font-size:11px;line-height:16px;padding:0 4px;margin:0;border-radius:var(--radius)}
.wk3.wi2 .wk3-vsb{font-size:11px;padding:0 4px;border-radius:var(--radius)}
.wk3.wi2 .wk3-okc{font-size:11px}
.wk3.wi2 .wk3-stopn,.wk3.wi2 .wk3-gmn{width:16px;height:16px;font-size:11px;line-height:16px}
.wi2-arrow{color:var(--text-dim);font-size:12px;flex-shrink:0}
.wi2-late{font-size:11px;font-weight:700;color:var(--danger);white-space:nowrap}
.wi2-gapbox{flex:1;min-height:34px;display:flex;align-items:center;gap:8px;padding:0 8px;border:1px solid var(--warn);border-radius:var(--radius);font:700 10px 'Syne',sans-serif;letter-spacing:.8px;color:var(--warn);cursor:pointer;box-sizing:border-box;background:var(--surface-card)}
.wi2-gapbox.urg{border-color:var(--danger-strong);color:var(--danger-strong)}
.wi2-gapbox small{font:500 11px 'DM Sans',sans-serif;letter-spacing:0}
.wi2-void{flex:1;min-height:34px;border-radius:var(--radius);background:var(--surface-page)}
.wk3.wi2 .wk3-leg>.wi2-gapbox,.wk3.wi2 .wk3-leg>.wi2-void{grid-column:1/-1}
.wi2-void.navy{background:var(--surface-dark)}
.wi2-dash{width:100%;text-align:center;color:var(--text-dim);font-size:12px;cursor:help}
.wk3.wi2 .wk3-feed{background:transparent;padding:0 4px;display:flex;flex-direction:column;justify-content:center;align-items:stretch;gap:3px;height:auto;min-height:38px;white-space:normal;align-self:stretch;font-size:11px}
.wk3.wi2 .wk3-feed.bgap{background:transparent !important}
.wk3.wi2.fl-off .wk3-feed.l,.wk3.wi2.fr-off .wk3-feed.r{background:var(--surface-page)}
.wk3.wi2 .wk3-assign{display:grid;grid-template-columns:20px minmax(0,1fr) 20px;padding:0 4px;gap:4px;align-items:center}
.wk3.wi2 .wk3-assign>.wk3-prt.l{grid-column:1}
.wk3.wi2 .wk3-assign>.wk3-prt.r{grid-column:3}
.wk3.wi2 .wk3-assign>:not(.wk3-prt){grid-column:2;min-width:0}
/* ΑΝΑΘΕΣΗ — χρώμα ΚΑΙ λέξη (DESIGN ΜΕΡΟΣ Ε, owner 4/9): «ΙΔ.» / «ΣΥΝ.» /
   «ΠΡΟΣ ΑΝΑΘΕΣΗ». Δύο σειρές με ορατό «…» και title — όχι αναδίπλωση, γιατί
   μια τρίτη σειρά σπάει το όριο των 44px της γραμμής. */
.wk3.wi2 .wk3-pill{height:auto;min-height:34px;flex-direction:column;align-items:flex-start;justify-content:center;gap:0;padding:4px 12px;font-size:12px;line-height:1.25;border-radius:var(--radius);white-space:nowrap;overflow:hidden;box-sizing:border-box;transform:none;box-shadow:none}
.wk3.wi2 .wk3-row:hover .wk3-pill{transform:none;box-shadow:none}
.wk3.wi2 .wk3-pill .t,.wk3.wi2 .wk3-pill small{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wk3.wi2 .wk3-pill small{font-size:11px;color:var(--text-on-dark);font-variant-numeric:tabular-nums}
.wk3.wi2 .wk3-pill .t{font-variant-numeric:tabular-nums}
.wk3.wi2 .wk3-pill.un{color:var(--unassigned);align-items:center;font-weight:700;letter-spacing:.5px}
.wk3.wi2 .wk3-pill.unimp{align-items:center;font-size:12px}
.wk3.wi2 .wk3-pill.unimp small{color:var(--text-dim);font-weight:500}
.wk3.wi2 .wk3-prt{border:1px solid var(--border);border-radius:var(--radius);padding:4px;font-size:13px;background:var(--surface-card)}
.wk3.wi2 .wk3-stopline{padding-left:0;font-size:11px;line-height:1.5}
.wk3.wi2 .wk3-stopline .wk3-sln{white-space:normal;overflow:visible}
.wk3.wi2 .wk3-sld{font-size:11px}
.wk3.wi2 .wk3-lcol .wk3-stopline.dl{padding-left:0}
.wk3.wi2 .wk3-gm{font-size:11px}
.wi2-legnote{font-size:11px;color:var(--text-dim);white-space:nowrap}
.wi2-unlink{font:500 11px 'DM Sans',sans-serif;color:var(--text-dim);background:none;border:none;cursor:pointer}
.wi2-unlink:hover{color:var(--danger)}
.wk3.wi2 .wk3-empty .big{font-size:18px}
.wi2-foot{display:flex;align-items:center;justify-content:flex-end;gap:24px;padding:4px 16px;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);margin-top:8px;flex-wrap:wrap}
.wi2-foot .sync{font-size:11px;color:var(--text-mid);margin-left:auto;font-variant-numeric:tabular-nums}
.wi2-foot .sync .err{color:var(--danger);font-weight:700}
.wk3.wi2 #wi-popover{width:600px;border-radius:var(--radius);border-color:var(--border)}
.wk3.wi2 .wi-pop-header{background:var(--surface-card);border-bottom:1px solid var(--border);padding:12px 16px 8px;justify-content:flex-start;gap:8px}
.wk3.wi2 .wi-pop-title{color:var(--text);font-size:14px;text-transform:none;letter-spacing:0}
.wk3.wi2 .wi-pop-subtitle{color:var(--text-mid);font-size:12px;margin:0;flex:1;min-width:0}
.wk3.wi2 .wi-pop-close{margin-left:auto;color:var(--text-dim);font-size:13px}
.wk3.wi2 .wi-pop-close:hover{background:var(--surface-sunken);color:var(--text)}
.wk3.wi2 .wi-pop-body{padding:12px 16px 8px;gap:12px}
.wk3.wi2 .wi-pop-section-lbl{font:700 11px 'Syne',sans-serif;letter-spacing:1.2px;color:var(--text-dim);border:none;padding:0;margin:0}
.wk3.wi2 .wi-pop-lbl{text-transform:none;letter-spacing:0;font-size:11px;font-weight:500;color:var(--text-mid)}
.wk3.wi2 .wi-pop-row{flex-wrap:nowrap;gap:12px;align-items:flex-end}
.wk3.wi2 .wi-pop-field{flex:1;min-width:0}
.wk3.wi2 .wi-pop-inp{width:100%;box-sizing:border-box;background:var(--surface-card);border-color:var(--border);height:32px;padding:4px 8px;font-size:12px}
.wk3.wi2 .wi-pop-inp:disabled{background:var(--surface-page)}
.wk3.wi2 .wi-sdo-sub{font-size:11px}
.wi2-pop-note{font-size:11px;color:var(--text-dim);padding-bottom:8px}
.wi2-pop-warn{display:none;gap:8px;align-items:center;background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:var(--radius);padding:8px 12px;margin:8px 16px 0;font-size:11px;font-weight:500;color:var(--warn)}
.wi2-pop-warn.on{display:flex}
.wk3.wi2 .wi-lane-hist{background:var(--surface-sunken);border-radius:var(--radius);padding:8px 12px;margin:8px 16px 0;display:flex;gap:8px 16px;flex-wrap:wrap}
.wk3.wi2 .wi-lane-hist:empty{display:none}
.wk3.wi2 .wi-lane-title,.wk3.wi2 .wi-lane-item{font-size:11px;border-radius:var(--radius)}
.wk3.wi2 .wi-lane-item{background:var(--surface-card);font-variant-numeric:tabular-nums}
.wi2-pop-sec{padding:12px 16px 0}
.wi2-piz{border:1px dashed var(--border-dark);border-radius:var(--radius);padding:8px 12px;text-align:center;font-size:11px;color:var(--text-dim);margin:8px 16px 0}
.wi2-piz.dh{border-color:var(--accent);background:var(--accent-light)}
.wi2-ichip{display:flex;align-items:center;gap:12px;text-align:left;color:var(--text);font-size:11px;font-weight:600}
.wi2-ichip small{font-weight:400;color:var(--text-dim);font-size:11px;font-variant-numeric:tabular-nums}
.wi2-ichip .wk3-unm{margin-left:auto}
.wk3.wi2 .wi-pop-footer{background:var(--surface-card);align-items:center;gap:12px;padding:12px 16px}
.wi2-pop-sync{font-size:11px;color:var(--text-dim);margin-right:auto}
.wk3.wi2 .wi-pop-save{background:var(--accent);padding:8px 16px;font-size:12px;box-shadow:none;border-radius:var(--radius)}
.wk3.wi2 .wi-pop-save:hover{background:var(--accent-hover)}
.wk3.wi2 .wi-pop-cancel{padding:8px 12px;font-size:12px;font-weight:500;border-radius:var(--radius)}
.wi2-spin{width:12px;height:12px;border:2px solid var(--accent-light);border-top-color:var(--surface-card);border-radius:var(--radius-full);animation:wi-spin .6s linear infinite}
.wi-sdo-sub.free{color:var(--ok)}
.wi2-sd-note{padding:4px 12px;font-size:11px;color:var(--text-dim);background:var(--surface-sunken)}
.wk3.wi2 .wi-ctx-h{font-size:11px}
/* ΣΤΕΝΑ ΠΛΑΤΗ: ΤΕΣΣΕΡΙΣ στήλες επίτηδες — το assets/style.css:2790 κάνει
   display:none τις δύο .wk3-feed κάτω από 1360px, άρα μένουν τέσσερα
   ΟΡΑΤΑ κελιά. Δοκίμασα έξι στήλες με τα feeds στα 18px και ήταν ΛΑΘΟΣ:
   τα κρυμμένα κελιά δεν πιάνουν στήλη, οπότε η εξαγωγή έπεφτε στα 18px.
   minmax(0,…) όπως και στο πλήρες πλάτος, για να μην εξαρτώνται τα πλάτη
   από το περιεχόμενο της κάθε γραμμής. */
@media (max-width:1360px){.wk3.wi2 .wk3-cols,.wk3.wi2 .wk3-row{grid-template-columns:36px minmax(0,1.1fr) 200px minmax(0,0.9fr)}}
`;

/* ── LOAD ASSETS ───────────────────────────────────────────────────── */
async function _wiLoadAssets(){
  await preloadReferenceData();
  WINTL.data.trucks   = getRefTrucks().filter(r=>r.fields['Active']).map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
  WINTL.data.trailers = getRefTrailers().map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
  WINTL.data.drivers  = getRefDrivers().filter(r=>r.fields['Active']).map(r=>({id:r.id,label:r.fields['Full Name']||r.id}));
  WINTL.data.partners = getRefPartners().map(r=>({id:r.id,label:r.fields['Company Name']||r.id}));
}

/* ── MAIN ENTRY ────────────────────────────────────────────────────── */
let _wiLoadId = 0;
async function renderWeeklyIntl(){
  WINTL._seq = 0;
  const loadId = ++_wiLoadId;
  if(can('planning')==='none'){document.getElementById('content').innerHTML=showAccessDenied();return;}
  document.getElementById('content').innerHTML=`
    <div style="display:flex;align-items:center;justify-content:center;
                gap:10px;height:160px;color:var(--text-dim);font-size:13px">
      <div class="spinner"></div> Φόρτωση εβδομάδας ${WINTL.week}…
    </div>`;
  try{
    // Exports: filtered by Airtable Week Number (delivery-based)
    // Imports: filtered by Loading DateTime range (loading-based)
    const ws=_wiWeekStart(WINTL.week);
    const we=new Date(ws); we.setDate(ws.getDate()+6);
    const wsFmt=toLocalDate(ws), weFmt=toLocalDate(we);
    WINTL._range={ws:wsFmt,we:weFmt};
    // Cross-week (feedback dispatcher 19/5): φόρτωσε imports ±1 εβδομάδα ώστε
    // export της W να ταιριάζει με import της W±1 — τα γειτονικά αδιάθετα
    // εμφανίζονται σε δική τους ενότητα στο τέλος, ΔΕΝ μετράνε στο tally.
    const impFilter=`AND({Type}='International',{Direction}='Import',IS_AFTER({Loading DateTime},'${toLocalDate(new Date(ws.getTime()-8*86400000))}'),IS_BEFORE({Loading DateTime},'${toLocalDate(new Date(we.getTime()+8*86400000))}'))`;

    let [,,expOrders,impOrders] = await Promise.all([
      preloadReferenceData(),
      Promise.resolve(), // placeholder to keep destructuring aligned
      // Σαβ–Παρ (display): date-range αντί {Week Number} — υπερσύνολο με OR
      // στα δύο dates, ακριβές κόψιμο client-side ώστε να μη χαθεί καμία
      // εγγραφή χωρίς Delivery DateTime.
      atGetAll(TABLES.ORDERS,  {filterByFormula:`AND({Type}='International',{Direction}='Export',OR(AND(IS_AFTER({Delivery DateTime},'${toLocalDate(new Date(ws.getTime()-86400000))}'),IS_BEFORE({Delivery DateTime},'${toLocalDate(new Date(we.getTime()+86400000))}')),AND(IS_AFTER({Loading DateTime},'${toLocalDate(new Date(ws.getTime()-86400000))}'),IS_BEFORE({Loading DateTime},'${toLocalDate(new Date(we.getTime()+86400000))}'))))`},false),
      atGetAll(TABLES.ORDERS,  {filterByFormula:impFilter},false),
    ]);
    if (loadId !== _wiLoadId) return;
    WINTL.data.trucks   = getRefTrucks().filter(r=>r.fields['Active']).map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
    WINTL.data.trailers = getRefTrailers().map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
    WINTL.data.drivers  = getRefDrivers().filter(r=>r.fields['Active']).map(r=>({id:r.id,label:r.fields['Full Name']||r.id}));
    WINTL.data.partners = getRefPartners().map(r=>({id:r.id,label:r.fields['Company Name']||r.id}));

    // ── Inject Loading/Delivery Summary from ORDER_STOPS for new orders ──
    await _wiInjectStopSummaries([...expOrders, ...impOrders]);
    // National carrier for VS legs (owner 4/9): NATIONAL LOADS keyed by Source
    // Order. The NL table has a `links` block, so FIND/ARRAYJOIN is translated
    // (CLAUDE.md). Non-blocking on purpose: a failed read leaves every tile as
    // «ΠΡΟΣ ΑΝΑΘΕΣΗ» plus a console note — never a broken board (αρχή 1 + 7).
    // Deferred on purpose (5/9): the board paints from ORDERS alone and the tiles
    // fill in when NATIONAL LOADS answers. A slow or dead read must never hold the
    // whole Weekly hostage — the kanban critic timed out on the blocking version.
    // `nlMap` identity is the re-render guard: a new week assigns a new map.
    const nlMap = {};
    WINTL.data.nlBySrc = nlMap;
    (async () => {
      const vsIds = ([...expOrders, ...impOrders]).filter(r => r.fields && r.fields['Veroia Switch']).map(r => r.id);
      if (!vsIds.length) return;
      const parts = vsIds.map(id => `FIND("${id}",ARRAYJOIN({Source Order},","))>0`);
      const f = parts.length === 1 ? parts[0] : `OR(${parts.join(',')})`;
      const nl = await safeFetch(() => atGetAll(TABLES.NAT_LOADS, { filterByFormula: f,
        fields: ['Source Order','Truck','Driver','Partner','Partner Truck Plates','Is Partner Trip'] }, false),
        'weekly intl: national carriers', []);
      if (didFail(nl) || WINTL.data.nlBySrc !== nlMap) return;
      nl.forEach(r => { const src = (r.fields['Source Order'] || [])[0]; if (src) nlMap[src] = r; });
      if (Object.keys(nlMap).length) _wiPaint();
    })().catch(e => console.warn('[weekly intl] national carriers:', e));

    // Ακριβές όριο εβδομάδας (Σαβ–Παρ) στην effective ημερομηνία (Delivery ή Loading)
    expOrders = expOrders.filter(r=>{
      const eff=toLocalDate(r.fields['Delivery DateTime']||r.fields['Loading DateTime']||'');
      return eff>=wsFmt && eff<=weFmt;
    });
    WINTL.data.exports = expOrders
      .sort((a,b)=>(
        (a.fields['Delivery DateTime']||a.fields['Loading DateTime']||'')
        .localeCompare(b.fields['Delivery DateTime']||b.fields['Loading DateTime']||'')
      ));
    WINTL.data.imports = impOrders;
    WINTL._loadedAt = new Date(); // footer «Ενημερώθηκε HH:MM»

    if (loadId !== _wiLoadId) return;
    _wiBuildRows();
    _wiPaint();
    // Self-heal (owner 12/8): ανάθεση σε συνεργάτη που γράφτηκε ΜΕΤΑ το γέμισμα
    // της 30' cache των άλλων χρηστών ⇒ άγνωστο id ⇒ έδειχνε «—». Μία ανανέωση
    // PARTNERS χωρίς cache και repaint — μόνο όταν όντως λείπει κάποιο id.
    if (WINTL.rows.some(r=>r.partnerId&&!WINTL.data.partners.find(p=>p.id===r.partnerId)) && !WINTL._pRefreshed){
      WINTL._pRefreshed = true;
      atGetAll(TABLES.PARTNERS,{fields:['Company Name']},false).then(ps=>{
        if(!ps?.length) return;
        WINTL.data.partners = ps.map(r=>({id:r.id,label:r.fields['Company Name']||r.id}));
        _wiPaint();
      }).catch(e=>console.warn('[wi] partners refresh:',e.message));
    }
  }catch(err){
    if (loadId !== _wiLoadId) return;
    // Σφάλμα ≠ κενό (DESIGN Κ7, πρότυπο dashboard): τι δεν φόρτωσε · τι ΔΕΝ
    // σημαίνει · τι να κάνεις. Το ωμό «Failed to fetch» του browser δεν λέει
    // τίποτα σε dispatcher στις 05:30 — μεταφράζεται σε αιτία που καταλαβαίνει.
    const why=/failed to fetch|networkerror|load failed/i.test(err.message||'')
      ?'Χωρίς απάντηση από τον διακομιστή — έλεγξε τη σύνδεση'
      :escapeHtml(err.message||'σφάλμα');
    document.getElementById('content').innerHTML=`
      <div class="empty-state" role="alert" style="display:block;text-align:center;padding:48px 24px">
        <p style="font-size:14px;font-weight:700;color:var(--text);margin:0 0 8px">Το εβδομαδιαίο διεθνών δεν φορτώθηκε</p>
        <p style="color:var(--danger);font-size:13px;margin:0 0 4px">${why} — ORDERS / ORDER_STOPS, εβδομάδα ${WINTL.week}.</p>
        <p style="color:var(--text-mid);font-size:13px;margin:0">Αυτό ΔΕΝ σημαίνει ότι δεν υπάρχουν παραγγελίες αυτή την εβδομάδα.</p>
        <button class="btn btn-ghost" onclick="renderWeeklyIntl()" style="margin-top:12px">Ξαναδοκίμασε</button>
      </div>`;
  }
}

/* ── BUILD ROWS ────────────────────────────────────────────────────── */
function _wiBuildRows(){
  WINTL.rows=[];WINTL._seq=0;
  const {exports,imports}=WINTL.data;

  // Map import ID → import record for fast lookup
  const impById={};
  imports.forEach(r=>impById[r.id]=r);

  for(const exp of exports){
    const f=exp.fields;
    const truckId  =(f['Truck']  ||[])[0]||'';
    const trailerId=(f['Trailer']||[])[0]||'';
    const driverId =(f['Driver'] ||[])[0]||'';
    const partnerId=(f['Partner']||[])[0]||'';
    const importId =f['Matched Import ID']||null;

    WINTL.rows.push({
      id:          ++WINTL._seq,
      type:        'export',
      orderId:     exp.id,
      orderIds:    [exp.id],
      importId,
      truckId, trailerId, driverId, partnerId,
      truckLabel:  WINTL.data.trucks.find(t=>t.id===truckId)?.label||'',
      trailerLabel:WINTL.data.trailers.find(t=>t.id===trailerId)?.label||'',
      driverLabel: WINTL.data.drivers.find(d=>d.id===driverId)?.label||'',
      partnerLabel:WINTL.data.partners.find(p=>p.id===partnerId)?.label||'',
      partnerPlates:f['Partner Truck Plates']||'',
      partnerRate:  f['Partner Rate']?String(f['Partner Rate']):'',
      partnerRateImp:'',
      saved:!!(truckId||partnerId),
    });
  }

  // Π1 (Wave 3): rebuild persisted groups — export rows sharing a non-empty
  // Group ID collapse back into one row after every reload.
  {
    const byGid={};
    WINTL.rows.forEach(r=>{
      if(r.type!=='export') return;
      const gid=exports.find(e=>e.id===r.orderId)?.fields?.['Group ID'];
      if(gid){(byGid[gid]=byGid[gid]||[]).push(r);}
    });
    Object.values(byGid).forEach(list=>{
      if(list.length<2) return;
      const [lead,...rest]=list;
      rest.forEach(r=>{ r.orderIds.forEach(id=>{ if(!lead.orderIds.includes(id)) lead.orderIds.push(id); }); });
      WINTL.rows=WINTL.rows.filter(r=>!rest.includes(r));
    });
  }

  // ── ΡΟΤΑ (owner 10/8): orders με Rotation ID = σκέλη προώθησης — δεν
  // εμφανίζονται ως δικές τους γραμμές, κρέμονται κάτω από τον γονέα («⤷»).
  // Μπαίνουν ΚΑΝΟΝΙΚΑ στο rows[] ώστε διαθεσιμότητα οδηγών/οχημάτων και
  // επιστροφές να μετρούν από το ΤΕΛΕΥΤΑΙΟ σκέλος.
  // (σημείωση: τρέχει στο τέλος του _wiBuildRows — δες κάτω)

  // ── IMPORT ROWS — sorted by loading date, always draggable ──
  const importsSorted=[...imports].sort((a,b)=>(
    (a.fields['Loading DateTime']||'').localeCompare(b.fields['Loading DateTime']||'')
  ));

  // Build matchedMap: importOrderId → exportOrderId
  const matchedMap={};
  exports.forEach(r=>{ const mid=r.fields['Matched Import ID']; if(mid) matchedMap[mid]=r.id; });

  for(const imp of importsSorted){
    const f=imp.fields;
    const truckId  =(f['Truck']  ||[])[0]||'';
    const partnerId=(f['Partner']||[])[0]||'';
    const impTrailerId=(f['Trailer']||[])[0]||'';
    const impDriverId =(f['Driver'] ||[])[0]||'';
    // Cross-week: import εκτός τρέχουσας Σαβ–Παρ = «γειτονικό» — δική του
    // ενότητα στο τέλος, εκτός tally/ομάδων ημερών.
    const _ld=toLocalDate(f['Loading DateTime']||'');
    const _adj=!!(WINTL._range&&_ld&&(_ld<WINTL._range.ws||_ld>WINTL._range.we));
    WINTL.rows.push({
      adj:_adj, adjW:_adj?_wiWeekOf(f['Loading DateTime']):null,
      id:          ++WINTL._seq,
      type:        'import',
      orderId:     imp.id,
      orderIds:    [imp.id],
      importId:    null,
      matchedTo:   matchedMap[imp.id]||null,
      truckId,   trailerId:impTrailerId, driverId:impDriverId, partnerId,
      truckLabel:  WINTL.data.trucks.find(t=>t.id===truckId)?.label||'',
      trailerLabel:WINTL.data.trailers.find(t=>t.id===impTrailerId)?.label||'',
      driverLabel: WINTL.data.drivers.find(d=>d.id===impDriverId)?.label||'',
      partnerLabel:WINTL.data.partners.find(p=>p.id===partnerId)?.label||'',
      partnerPlates:f['Partner Truck Plates']||'',
      partnerRate:  f['Partner Rate']?String(f['Partner Rate']):'',
      partnerRateImp:'',
      saved:!!(truckId||partnerId),
    });
  }

  // Ρότα: σημείωσε τα σκέλη + ομαδοποίησέ τα ανά γονέα, με σειρά φόρτωσης
  WINTL._legs={};
  const _ordOf=r=>WINTL.data.exports.find(x=>x.id===(r.orderIds?.[0]||r.orderId))||WINTL.data.imports.find(x=>x.id===(r.orderIds?.[0]||r.orderId));
  WINTL.rows.forEach(r=>{
    const o=_ordOf(r);
    const rot=o?.fields?.['Rotation ID'];
    if(rot){ r.legOf=rot; (WINTL._legs[rot]=WINTL._legs[rot]||[]).push(r); }
  });
  Object.values(WINTL._legs).forEach(a=>a.sort((x,y)=>
    String(_ordOf(x)?.fields?.['Loading DateTime']||'').localeCompare(String(_ordOf(y)?.fields?.['Loading DateTime']||''))));
}

/* ── PAINT ─────────────────────────────────────────────────────────── */

/* ── WEEK SIDEBAR (INTL) ──────────────────────────────── */
// WI-7: the strip listed 21 weeks (−8..+12) and scrolled horizontally, so the
// current week was rarely where you looked. Now ±3 around the selected week,
// with explicit ‹ › steps and a «Σήμερα» reset — the three moves anyone
// actually makes. See docs/design/DEEP_AUDIT_2026-08-04/weekly_intl.md WI-7.
// BUILD v3 Φάση Α: sheet tabs — το νοητικό μοντέλο του WEEKLY PLAN xlsx
// (καρτέλες φύλλων), εγκεκριμένο πρωτότυπο v3.1. Ίδια λογική week±.
/* Νέα παραγγελία ΧΩΡΙΣ έξοδο από το εβδομαδιαίο (owner 10/08).
   Μετά το κλείσιμο της φόρμας ξαναζωγραφίζουμε: αλλιώς η νέα παραγγελία δεν
   εμφανίζεται και ο χρήστης νομίζει ότι χάθηκε. Ο observer πιάνει και τους δύο
   τρόπους απόκρυψης (style ή class) — αν δεν πυροδοτηθεί, το χειρότερο είναι
   να μην ανανεωθεί, όπως θα γινόταν και χωρίς αυτόν. */
function _wiNewOrder() {
  openIntlCreate();
  const ov = document.getElementById('modalOverlay');
  if (!ov) return;
  const visible = () => ov.style.display !== 'none' && !ov.hidden;
  const obs = new MutationObserver(() => {
    if (!visible()) { obs.disconnect(); renderWeeklyIntl(); }
  });
  obs.observe(ov, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
}

function _wk3Tabs(currentWeek) {
  const today = _wiCurrentWeek();
  const step = d => `<button type="button" class="wk3-step" onclick="WINTL.week=${currentWeek+d};renderWeeklyIntl()" title="${d<0?'Προηγούμενη':'Επόμενη'} εβδομάδα">${d<0?'‹':'›'}</button>`;
  const jump = d => `<button type="button" class="wk3-step" onclick="WINTL.week=${Math.min(53,Math.max(1,currentWeek+d))};renderWeeklyIntl()" title="${d<0?'−4 εβδομάδες':'+4 εβδομάδες'}">${d<0?'«':'»'}</button>`;
  let html = jump(-4)+step(-1);
  for (let w = currentWeek - 3; w <= currentWeek + 3; w++) {
    if (w < 1 || w > 53) continue;
    const wS=_wiWeekStart(w), wE=new Date(wS); wE.setDate(wS.getDate()+6);
    const fmt=d=>String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1);
    html += `<button type="button" class="wk3-tab${w===currentWeek?' on':''}" onclick="WINTL.week=${w};renderWeeklyIntl()" title="${fmt(wS)}–${fmt(wE)}">W${w}${w===today?' (Τρέχουσα)':''}</button>`;
  }
  html += step(1)+jump(4);
  if (currentWeek !== today)
    html += `<button type="button" class="wk3-tab" style="color: var(--accent-text)" onclick="WINTL.week=${today};renderWeeklyIntl()">Σήμερα</button>`;
  return html;
}
// «Τα κενά» (owner): own γύροι χωρίς φορτίο επιστροφής → δείξε τα αδιάθετα
// imports που μπορούν να τα γεμίσουν (highlight + scroll).
function _wk3Gaps(){
  const imps=[...document.querySelectorAll('[id^="wi-imp-"]')];
  imps.forEach(r=>{r.style.transition='background .3s';r.style.background='var(--accent-light)';setTimeout(()=>{r.style.background='';},1800);});
  if(imps[0]) imps[0].scrollIntoView({behavior:'smooth',block:'center'});
}
function _wiJumpFirstUnassigned(){
  const impRow=WINTL.rows.find(r=>r.type==='import'&&!r.saved);
  if(impRow&&typeof _ccJump==='function') _ccJump('wi-imp-'+impRow.orderId);
}

function _wiPaint(){
  const {rows,week,data}=WINTL;
  const expRows=rows.filter(r=>r.type==='export'&&!r.legOf);
  const impRows=rows.filter(r=>r.type==='import'&&!r.adj&&!r.legOf);
  const expN=expRows.length, impN=impRows.length;
  const assigned=expRows.filter(r=>r.saved).length;
  const pending=expRows.filter(r=>!r.saved).length;
  const matched=impRows.filter(r=>r.matchedTo).length;
  const unmatched=impRows.filter(r=>!r.matchedTo).length;
  // Β.3-3 (Wave 1): imports without a vehicle get their OWN counter — the same
  // red used to mean two different things and the header chip disagreed with
  // what the eye counted (VISUAL §Χρώμα).
  const impNoVehicle=impRows.filter(r=>!r.saved).length;
  const total=expRows.length+impRows.length;
  const pct=total?Math.round((assigned+matched)/total*100):0;

  // Report what this planner shows. weekNumber is the week the user is looking
  // at; weekNumberDefault is what _wiCurrentWeek() calls "today" — now the
  // same isoWeekNumber() the Dashboard, Orders and Performance are unified on
  // (design audit 5/9/2026, A1). Still reporting both: the row-bucketing tabs
  // (_wiWeekOf, Saturday-start WEEKNUM) are a separate scheme, so weekNumber
  // and weekNumberDefault can still diverge by the tab's own numbering — the
  // audit keeps watching for that gap.
  if (typeof reportPageMetrics === 'function') reportPageMetrics('weekly_intl', {
    weekNumber: week,
    weekNumberDefault: _wiCurrentWeek(),
    exports: expN,
    imports: impN,
    assigned,
    pending,
    matched,
    unmatched,
    completionPct: pct,
  });

  const _ico = (n, s) => (typeof icon === 'function') ? icon(n, s || 14) : '';
  const _firstExp = (pred) => { const r = expRows.find(pred); return r ? 'wi-row-'+r.id : undefined; };
  const today=(typeof localToday==='function')?localToday():toLocalDate(new Date());
  const _fOf=r=>(data.exports.find(x=>x.id===(r.orderIds?.[0]))||data.imports.find(x=>x.id===r.orderId))?.fields||{};
  // Busy map per paint — the popover availability lines and the free-fleet
  // tile both read it; from rows already in memory, zero fetches.
  WINTL._busy=_wk3Busy();
  // «Τα κενά» (owner): own round trips that will return empty — no import.
  // A partner row is never a gap (owner 9/8), so the denominator is own rows.
  const ownRows=expRows.filter(r=>r.saved&&!r.partnerId);
  const parRows=expRows.filter(r=>r.saved&&r.partnerId);
  const gapRows=ownRows.filter(r=>!r.importId);
  const urgN=gapRows.filter(r=>_wi2Urgent(_fOf(r),today)).length;
  const gaps=gapRows.length;
  const ownAll=[...expRows,...impRows].filter(r=>r.saved&&!r.partnerId).length;
  const parAll=[...expRows,...impRows].filter(r=>r.saved&&r.partnerId).length;
  const matchedExp=expRows.filter(r=>r.importId).length;
  const delivN=[...expRows,...impRows].filter(r=>_wk3StFlags(_fOf(r)).delivered).length;
  const lateN=[...expRows,...impRows].filter(r=>_wk3StFlags(_fOf(r)).late).length;
  const pendAll=pending+impNoVehicle;
  const firstPendingId=_firstExp(r=>!r.saved);
  const jumpPending=firstPendingId?`_ccJump('${firstPendingId}')`:'_wiJumpFirstUnassigned()';
  // «ΕΛΕΥΘΕΡΑ ΣΗΜΕΡΑ» και ο δείκτης φάσης αφαιρέθηκαν 3/9 (owner: λιγότερος
  // θόρυβος, περισσότερες εγγραφές). Έφυγαν ΚΑΙ οι υπολογισμοί τους, όχι μόνο
  // η εμφάνιση: ένας υπολογισμός που δεν διαβάζει κανείς είναι νεκρός κώδικας.
  // Η διαθεσιμότητα στόλου δεν χάθηκε — ζει στο popover ανάθεσης, εκεί που
  // χρειάζεται όταν διαλέγεις φορτηγό.
  const cur=_wiCurrentWeek();
  // Δ2 (DESIGN): φίλτρο με μηδέν = ανενεργό. Το ενεργό μένει πατήσιμο ακόμη
  // και στο μηδέν, αλλιώς δεν ξε-επιλέγεται όταν αδειάσει η κατηγορία.
  const chip=(q,lbl,n)=>{ const on=(WINTL.quick||'')===q; return `<button class="wi2-chip${on?' on':''}" data-q="${q}"${(!n&&!on)?' disabled':''} onclick="_wi2Quick('${q}')">${lbl} (${n})</button>`; };
  document.getElementById('content').innerHTML=`
    <div class="wk3 wi2 ${_wiQuietOn()?'wi-quiet':''}${localStorage.getItem('tms_wk3_fl')==='0'?' fl-off':''}${localStorage.getItem('tms_wk3_fr')==='0'?' fr-off':''}" style="display:block;width:100%">
    <style>${_WI2_CSS}</style>
    <div class="wi2-mast">
      <div class="wi2-title">Πίνακας Σχεδιασμού Αποστολών <button class="wi2-legend-btn" onclick="_wi2Legend()" title="Υπόμνημα χρωμάτων και σημάτων">? υπόμνημα</button></div>
      <nav class="wi2-tabs" aria-label="Εβδομάδες">${_wk3Tabs(week)}</nav>
      <div class="wi2-acts">
        <button class="wi2-btn" onclick="_wiPrintWeek()" title="Εκτύπωση εβδομάδας">Εκτύπωση</button>
        <button class="wi2-btn" onclick="_wiExportCSV()" title="Εξαγωγή CSV">CSV</button>
        <button class="wi2-btn" onclick="renderWeeklyIntl()" title="Ανανέωση">Ανανέωση</button>
        <button class="wi2-btn" id="wi-fs" onclick="_wiFullscreen()" title="Πλήρης οθόνη — μόνο ο πίνακας· Esc για έξοδο">Πλήρης οθόνη</button>
        <button class="wi2-btn primary" onclick="_wiNewOrder()" title="Νέα διεθνής παραγγελία — χωρίς έξοδο από το εβδομαδιαίο">+ Νέα παραγγελία</button>
      </div>
    </div>
    ${_wi2LegendHTML()}
    <!-- KPI band (frame 319:906): replaces the Command Center — same numbers
         (gaps, unmatched, free fleet), once, every fraction with its denominator. -->
    <div class="wi2-band">
      <!-- ΘΟΡΥΒΟΣ ΚΑΤΩ, ΓΡΑΜΜΕΣ ΠΑΝΩ (owner 3/9): «θέλω απλά το badge με το 8 και
           το ΚΕΝΑ ΓΥΡΙΣΜΑΤΑ 8 επείγοντα». Η αναλυτική πρόταση, η φάση της
           εβδομάδας και ολόκληρο το «ΕΛΕΥΘΕΡΑ ΣΗΜΕΡΑ» έφυγαν — ο στόχος είναι
           να χωράνε περισσότερες εγγραφές στην οθόνη. Κανένας αριθμός δεν
           χάθηκε: τα κενά γυρίσματα και τα ασυμφώνητα ζουν στα γρήγορα
           φίλτρα, με τους παρονομαστές τους. Τα σύνολα του υποσέλιδου και τα
           τσιπάκια της κεφαλίδας ημέρας αφαιρέθηκαν 3/9 για τον ίδιο λόγο. -->
      <div class="wi2-urg${gaps?'':' zero'}">
        <button class="n" onclick="_wk3Gaps()" title="Ιδιόκτητοι γύροι χωρίς φορτίο επιστροφής — κλικ: οι αταίριαστες εισαγωγές">${gaps}</button>
        <h4>ΚΕΝΑ ΓΥΡΙΣΜΑΤΑ${urgN?` · ${urgN} ${urgN===1?'ΕΠΕΙΓΟΝ':'ΕΠΕΙΓΟΝΤΑ'}`:''}</h4>
      </div>
      <div class="wi2-quick">
        <div class="k">ΓΡΗΓΟΡΑ ΦΙΛΤΡΑ</div>
        <div class="chips">${chip('','Όλες',total)}${chip('pending','Χωρίς ανάθεση',pendAll)}${chip('gap','Κενά γυρίσματα',gaps)}${chip('own','Ιδιόκτητα',ownAll)}${chip('partner','Συνεργάτες',parAll)}${chip('matched','Ταιριασμένες',matchedExp)}</div>
      </div>
    </div>
    <div class="wk3-sub">
      <div class="entity-search-wrap">
        ${_ico('search')}
        <input id="wi-search" class="entity-search-input" type="text" placeholder="Αναζήτηση πελάτη / φορτηγού / οδηγού / τοποθεσίας…" oninput="WINTL.filter=this.value.toLowerCase().trim();_wiApplyFilter()" value="${WINTL.filter||''}">
      </div>
      <select class="svc-filter" onchange="WINTL.filterStatus=this.value;_wiApplyFilter()">
        <option value="">Κατάσταση: Όλες</option>
        <option value="pending" ${WINTL.filterStatus==='pending'?'selected':''}>Χωρίς ανάθεση</option>
        <option value="assigned" ${WINTL.filterStatus==='assigned'?'selected':''}>Ανατεθειμένα</option>
        <option value="unmatched" ${WINTL.filterStatus==='unmatched'?'selected':''}>Εισαγωγές χωρίς ταίριασμα</option>
      </select>
      ${WINTL.filter||WINTL.filterStatus||WINTL.quick?`<button class="btn btn-ghost btn-sm" onclick="WINTL.filter='';WINTL.filterStatus='';WINTL.quick='';document.getElementById('wi-search').value='';_wiApplyFilter()">${_ico('x', 12)} Καθαρισμός</button>`:''}
      <button class="wi2-btn" onclick="_wiToggleDetails()" title="Πρόσθετες ενδείξεις γραμμής (όρια εβδομάδας, εκτέλεση)">Λεπτομέρειες${_wiQuietOn()?'':' ✓'}</button>
      ${unmatched>0?`<button class="wi2-btn" onclick="_wiAutoMatch()" title="Περιορισμένο: χωρίς συντεταγμένες τοποθεσιών (LO-1) σκοράρει μόνο με ημερομηνίες">${_ico('zap',13)} Αυτόματο ταίριασμα (${unmatched}) — χωρίς συντεταγμένες</button>`:''}
      <span id="wi-crossweek-in"></span>
      <span class="wi2-week">Εβδομάδα ${week} · ${_wiWeekRange(week)} · Σαβ–Παρ</span>
    </div>
    <div class="wk3-wrap">
      <main class="wk3-sheet">
        <div class="wk3-cols">
          <div class="c"></div>
          <div class="c fc" style="cursor:pointer" title="Εθνικό σκέλος προς Βέροια — κλικ: άνοιγμα/κλείσιμο στήλης" onclick="_wk3FeedTog('fl')"><span class="fc-ch">◂</span> ΠΡΟΣ ΒΕΡΟΙΑ</div>
          <div class="c cm" title="Δεξί κλικ σε γραμμή: ομαδοποίηση groupage (βάση: το πρώτο-παραδιδόμενο)">ΕΞΑΓΩΓΗ <span class="n">· ${expN}</span></div>
          <div class="c cm">ΑΝΑΘΕΣΗ</div>
          <div class="c cm" title="Σύρε εισαγωγή σε εξαγωγή για ταίριασμα">ΕΙΣΑΓΩΓΗ <span class="n">· ${impN}</span></div>
          <div class="c fc" style="cursor:pointer" title="Εθνική διανομή από Βέροια — κλικ: άνοιγμα/κλείσιμο στήλης" onclick="_wk3FeedTog('fr')">ΑΠΟ ΒΕΡΟΙΑ <span class="fc-ch">▸</span></div>
        </div>
        <div id="wi-rows">
          ${rows.length?_wiAllRowsHTML():`
            <div class="wk3-empty">
              <div class="big">Άδειο φύλλο — W${week}</div>
              <p>Καμία διεθνής παραγγελία ακόμη. Οι νέες εμφανίζονται εδώ μόλις καταχωρηθούν.</p>
            </div>`}
        </div>
      </main>
    </div>
    <!-- Tally (contract §3): every fraction carries its denominator. -->
    <div class="wi2-foot">
      <span id="wi2-sync" class="sync"></span>
    </div>
    <div id="wi-ctx"></div>
    <div id="wi-popover"></div>
    </div><!-- /block wrapper -->
  `;
  window._wiDragging=null;
  // A5 (design audit 5/9/2026): .wi2-tabs now scrolls instead of overflowing
  // the page at 390px — keep the active tab visible inside that scroll area.
  document.querySelector('.wi2-tabs .wk3-tab.on')?.scrollIntoView({inline:'nearest',block:'nearest'});
  // Re-apply ⚠ from the session log (T3: a failed write stays visible after a
  // repaint) and fill the footer sync line.
  Object.entries(WINTL._syncLog||{}).forEach(([oid,s])=>{
    if(s.state!=='err') return;
    const r=WINTL.rows.find(x=>(x.orderIds?.[0]||x.orderId)===oid);
    const el=r&&document.getElementById('wi-sync-'+r.id);
    if(el){ el.className='wi-sync wi-sync--err'; el.textContent='⚠'; el.title=s.msg; }
  });
  _wi2FootSync();
  if(WINTL.filter||WINTL.filterStatus||WINTL.quick) _wiApplyFilter();
  requestAnimationFrame(_wi2Balance);

  // T4 (Wave 2), the blind half: exports PLANNED in W+1 that LOAD inside this
  // week — invisible here because exports filter by delivery week (PREMORTEM
  // T4: «η φόρτωση χάνεται τη στιγμή που συμβαίνει»). Current week only, one
  // filtered fetch; failure just leaves the chip empty.
  if (week === _wiCurrentWeek()) {
    const ws2=_wiWeekStart(week), we2=new Date(ws2); we2.setDate(ws2.getDate()+6);
    const f2=`AND({Type}='International',{Direction}='Export',{Week Number}=${week+1},IS_AFTER({Loading DateTime},'${toLocalDate(new Date(ws2.getTime()-86400000))}'),IS_BEFORE({Loading DateTime},'${toLocalDate(new Date(we2.getTime()+86400000))}'))`;
    safeFetch(() => atGetAll(TABLES.ORDERS,{filterByFormula:f2,fields:['Loading Summary','Loading DateTime']},false), 'weekly intl: cross-week incoming', [])
    .then(recs => {
      const el=document.getElementById('wi-crossweek-in');
      if(!el||didFail(recs)||!recs.length) return;
      const names=recs.slice(0,3).map(r=>_wiClean(r.fields['Loading Summary']||'')).filter(Boolean).join(' · ');
      el.outerHTML=`<span class="entity-count-chip" style="background:var(--accent-light);color: var(--accent-text);border-color:transparent" title="Πλάνο W${week+1} με φόρτωση ΜΕΣΑ σε αυτή την εβδομάδα — δες τη W${week+1} για ανάθεση. ${names}">↦ ${recs.length} φορτών${recs.length>1?'ουν':'ει'} τώρα · πλάνο W${week+1}</span>`;
    }).catch(e => console.warn('cross-week incoming:', e));
  }
}



/* ── ALL ROWS ──────────────────────────────────────────────────────── */
function _wiAllRowsHTML(){
  const expRows=WINTL.rows.filter(r=>r.type==='export'&&!r.legOf);
  const impRows=WINTL.rows.filter(r=>r.type==='import'&&!r.legOf&&!r.adj);
  const today=(typeof localToday==='function')?localToday():toLocalDate(new Date());
  const _f=r=>(WINTL.data.exports.find(x=>x.id===(r.orderIds?.[0]))||WINTL.data.imports.find(x=>x.id===r.orderId))?.fields||{};

  // Day groups keyed by raw date: exports by DELIVERY day, imports by LOADING
  // day (the two dates that decide what the day «runs»). The seven days of
  // the Σαβ–Παρ window (owner 10/8) are seeded first: an empty day renders
  // «Καμία κίνηση» — information, not absence (contract §6).
  const groups={};
  if(WINTL._range){ let d=WINTL._range.ws; for(let i=0;i<7;i++){ groups[d]={rawDate:d,exps:[],imps:[]}; d=_wk3AddDays(d,1); } }
  expRows.forEach(row=>{
    const raw=toLocalDate(_f(row)['Delivery DateTime']||_f(row)['Loading DateTime']||'');
    (groups[raw]=groups[raw]||{rawDate:raw,exps:[],imps:[]}).exps.push(row);
  });
  impRows.forEach(row=>{
    const raw=toLocalDate(_f(row)['Loading DateTime']||'');
    (groups[raw]=groups[raw]||{rawDate:raw,exps:[],imps:[]}).imps.push(row);
  });
  const sorted=Object.values(groups).sort((a,b)=>(a.rawDate||'~').localeCompare(b.rawDate||'~'));

  WINTL._rowNo={}; // orderId → visible row number («4», «I2») for the footer sync line
  let html='',idx=0,impIdx=0;
  sorted.forEach(grp=>{
    const isToday=grp.rawDate===today;
    let wd='';
    // uppercase Greek drops the tonos (ΔΕΥΤΕΡΑ, not ΔΕΥΤΈΡΑ)
    try{ if(grp.rawDate) wd=new Date(grp.rawDate+'T12:00:00').toLocaleDateString('el-GR',{weekday:'long'}).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }catch{}
    const dm=grp.rawDate?`${+grp.rawDate.slice(8,10)}/${+grp.rawDate.slice(5,7)}`:'';
    const showImps=grp.imps.filter(r=>!r.matchedTo); // matched imports live inside their export row
    // Day counters (frame 368:966): what the day owes, in words
    const gExp=grp.exps.length;
    const empty=!gExp&&!showImps.length;
    html+=`<section class="wi2-day${isToday?' today':''}${empty?' empty':''}" data-day="${grp.rawDate}">
      <div class="wk3-dayh${isToday?' today':''}"><span class="d">${wd||'ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ'}${dm?' '+dm:''}</span>${isToday?'<span class="now">ΣΗΜΕΡΑ</span>':''}</div>`;
    if(empty){ html+=`<div class="wi2-none">Καμία κίνηση — η κενή μέρα είναι πληροφορία, όχι απουσία</div></section>`; return; }

    // Owner (9/8): ταξινόμηση ανά πελάτη και μετά Veroia Switch
    const _cKey=(f)=>String(f?.['Client Name']||f?.['Client Summary']||'').toUpperCase();
    grp.exps.sort((a,b)=>{ const fa=_f(a),fb=_f(b);
      return _cKey(fa).localeCompare(_cKey(fb),'el')
        ||((fa['Veroia Switch']?1:0)-(fb['Veroia Switch']?1:0))
        ||String(fa['Delivery DateTime']||'').localeCompare(String(fb['Delivery DateTime']||'')); });
    showImps.sort((a,b)=>{ const fa=_f(a),fb=_f(b);
      return _cKey(fa).localeCompare(_cKey(fb),'el')
        ||((fa['Veroia Switch']?1:0)-(fb['Veroia Switch']?1:0))
        ||String(fa['Loading DateTime']||'').localeCompare(String(fb['Loading DateTime']||'')); });
    // Export rows (+ σκέλη ρότας του export ΚΑΙ της ταιριασμένης εισαγωγής του)
    grp.exps.forEach(row=>{ WINTL._rowNo[row.orderIds[0]]=String(idx+1); html+=_wiRowHTML(row,idx++);
      const pids=[...(row.orderIds||[])]; if(row.importId) pids.push(row.importId);
      pids.forEach(pid=>{ (WINTL._legs?.[pid]||[]).forEach(lr=>{ html+=_wiLegRowHTML(lr); }); });
    });
    // Unmatched imports numbered I1… (Β.3-4) so «γραμμή I3» means something on
    // the phone between two dispatchers.
    showImps.forEach(row=>{ ++impIdx; WINTL._rowNo[row.orderId]='I'+impIdx; html+=_wiImpRowHTML(row,impIdx);
      (WINTL._legs?.[row.orderId]||[]).forEach(lr=>{ html+=_wiLegRowHTML(lr); });
    });
    html+='</section>';
  });
  // (Owner 10/8: η ενότητα «ΓΕΙΤΟΝΙΚΕΣ ΕΒΔΟΜΑΔΕΣ» αφαιρέθηκε — τη θέση της
  // πήρε το δεξί κλικ → Μεταφορά εβδομάδας. Τα W±1 imports παραμένουν στη
  // μνήμη για matched previews και για τον χάρτη διαθεσιμότητας.)
  return html;
}


/* ── IMPORT ROW ──────────────────────────────────────────────────── */
function _wiImpRowHTML(row,impNo){
  const {data}=WINTL;
  const imp=data.imports.find(r=>r.id===row.orderId);
  if(!imp) return '';
  const f=imp.fields;
  const fromStr=_wiRaw(f['Loading Summary']||f['Client Name']||f['Client Summary']||'—');
  const toStr  =_wiRaw(f['Delivery Summary']||f['Client Name']||f['Client Summary']||'—');
  const stR=_wk3StFlags(f);
  const impVS2=!!f['Veroia Switch'];

  const impTruck   =row.truckLabel   ||data.trucks.find(t=>t.id===row.truckId)?.label||'';
  const impTrailer =row.trailerLabel ||data.trailers.find(t=>t.id===row.trailerId)?.label||'';
  // «—» και όχι «Συνεργάτης» για partner που λείπει από την cache (owner 4/9:
  // η γενική λέξη δεν είναι επωνυμία)· το πρόθεμα ΣΥΝ. λέει ήδη το είδος.
  const impPartner =row.partnerLabel ||data.partners.find(p=>p.id===row.partnerId)?.label||(row.partnerId?'—':'');
  const plates=[impTruck,impTrailer].filter(Boolean).join(' / ');
  let impPill;
  if(row.saved){
    if(impPartner){
      impPill=`<div class="wk3-pill par" title="Συνεργάτης: ${escapeHtml(impPartner)}${row.partnerPlates?' · '+escapeHtml(row.partnerPlates):''}${row.driverLabel?' · '+escapeHtml(row.driverLabel):''} — κλικ: αλλαγή"><span class="t">${escapeHtml(impPartner)}</span><small>${escapeHtml([row.partnerPlates,row.driverLabel].filter(Boolean).join(' · '))||'&nbsp;'}</small></div>`;
    } else {
      impPill=`<div class="wk3-pill own" title="Ιδιόκτητο: ${escapeHtml(plates)}${row.driverLabel?' · '+escapeHtml(row.driverLabel):''} — κλικ: αλλαγή"><span class="t">${escapeHtml(plates||'—')}</span><small>${escapeHtml(row.driverLabel||'')||'&nbsp;'}</small></div>`;
    }
  } else {
    // Β.3-3: import-without-vehicle is NOT the same red as export-without-
    // assignment — dashed border (non-color signal) + explicit prefix.
    impPill=`<div class="wk3-pill unimp" title="Εισαγωγή χωρίς δικό όχημα — κλικ για ανάθεση"><span class="t">ΠΡΟΣ ΑΝΑΘΕΣΗ</span><small>εισαγωγή · χωρίς όχημα</small></div>`;
  }

  // Left (export) cell: own vehicle with no export = empty southbound leg.
  let leftInner, leftCls='';
  if(row.saved&&!impPartner){ leftCls=' gap'; leftInner=`<div class="wi2-gapbox" title="Ιδιόκτητο όχημα χωρίς εξαγωγή — κενό σκέλος καθόδου. Κλικ: πρώτη εξαγωγή προς ανάθεση" onclick="event.stopPropagation();_wiJumpFirstUnassigned()">ΚΕΝΟ EXPORT</div>`; }
  else if(row.saved&&impPartner){ leftCls=' bgap'; leftInner=`<div class="wi2-void navy" title="Ανατεθειμένο σε συνεργάτη — δεν αναμένεται δικό μας σκέλος εξαγωγής"></div>`; }
  else leftInner=`<div class="wi2-void"></div>`;

  const lo=_wi2Loc(fromStr,'Φόρτωση',f._stopsL);
  const lIso=f['Loading DateTime']||'';
  const loadCard=_wi2Card({cls:stR.loaded?'ok':'', date:_wi2Date(imp.id,'Loading DateTime',lIso,lIso?_wk3D(_wiFmt(lIso)):'—',stR.loaded?' done':'','Ημ. φόρτωσης'+(stR.loaded?' — φορτώθηκε ✓':'')), name:lo.name, sub:lo.sub, extra:_wk3MoreStops(fromStr,f._stopsL,'load')});
  const right=`<span class="wi2-flags">${_wiBadges(f)}</span>${_wi2Pal(f)}${f['Reference']?`<span class="wi2-ref" title="Κωδικός αναφοράς">${escapeHtml(String(f['Reference']))}</span>`:''}`;
  let delCard;
  if(impVS2){ const v=_wk3VsCd(f,'imp');
    delCard=_wi2Card({cls:stR.late?'late':stR.delivered?'ok':'', date:_wi2Date(imp.id,'VS CD Date',v.iso,v.iso?_wk3D(_wiFmt(v.iso+'T12:00:00')):'—',(stR.delivered?' done':'')+(stR.late?' late':'')+(v.est?' estd':''),v.est?'Εκτίμηση άφιξης CD (Delivery−1) — κλικ για πραγματική':'Ημ. άφιξης στο Cross-Dock'), name:'<span class="wi2-nw">Cross-Dock <span class="wk3-vsb">VS</span></span>', sub:'Βέροια, GR', right});
  } else {
    const de=_wi2Loc(toStr,'Παράδοση',f._stopsD); const dIso=f['Delivery DateTime']||'';
    delCard=_wi2Card({cls:stR.late?'late':stR.delivered?'ok':'', date:_wi2Date(imp.id,'Delivery DateTime',dIso,dIso?_wk3D(_wiFmt(dIso)):'—',(stR.delivered?' done':'')+(stR.late?' late':''),'Ημ. παράδοσης'+(stR.delivered?' — παραδόθηκε ✓':'')+(stR.late?' — ΚΑΘΥΣΤΕΡΗΣΕ':'')), name:de.name+(stR.late?'<span class="wi2-late" title="Καθυστέρησε (Delivery Performance)">! καθυστέρηση</span>':''), sub:de.sub, extra:_wk3MoreStops(toStr,f._stopsD,'del'), right});
  }
  // Right feed: VS import → national distribution from Veroia (final destination)
  const feedR=impVS2?(()=>{ const de=_wi2Loc(toStr,'Παράδοση',f._stopsD); const dIso=f['Delivery DateTime']||'';
    return _wi2Card({date:_wi2Date(imp.id,'Delivery DateTime',dIso,dIso?_wk3D(_wiFmt(dIso)):'—','','Εθνικό σκέλος: ημ. τελικής διανομής'), name:de.name, sub:de.sub, extra:_wk3MoreStops(toStr,f._stopsD,'del')}); })()
    :`<span class="wi2-dash" title="Χωρίς εθνικό σκέλος — δεν είναι Veroia Switch">—</span>`;

  return `<div id="wi-imp-${imp.id}" data-row-id="${row.id}"
    class="wk3-row impr${!row.saved?' wi2-un':''}${stR.delivered&&!stR.late?' wk3-done':''}"
    draggable="true"
    oncontextmenu="_wiImpCtx(event,${row.id})"
    ondragstart="event.stopPropagation();_wiImpDragStart(event,'${imp.id}')">
    <div class="wk3-num imp" style="cursor:grab" title="Εισαγωγή I${impNo||''} — σύρε πάνω σε εξαγωγή για ταίριασμα">I${impNo||''}${f['Group ID']?`<span class="wk3-grpb" title="Groupage εισαγωγών · ${escapeHtml(String(f['Group ID']).split('|')[0])}">G</span>`:''}<span class="wi-sync" id="wi-sync-${row.id}"></span></div>
    <div class="wk3-feed l" title="Χωρίς εθνικό σκέλος"><span class="wi2-dash">—</span></div>
    <div class="wk3-leg void${leftCls}">${leftInner}</div>
    <div class="wk3-assign" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" role="button" tabindex="0" onclick="event.stopPropagation();_wiOpenImpPopover(event,'${imp.id}',${row.id})">
      ${impPill}
      <button class="wk3-prt r" title="Εκτύπωση εντολής (import) — δεξί κλικ: κοινή χρήση" data-shq="${printSheetQuery(imp.id,'import',!!row.partnerId)}" data-shtitle="Εντολή εισαγωγής — W${WINTL.week}" onclick="event.stopPropagation();_wiPrintImp('${imp.id}',${row.partnerId?'true':'false'})">⎙<sup>I</sup></button>
    </div>
    <div class="wk3-leg imp" style="cursor:pointer" title="Κλικ: άνοιγμα φόρμας παραγγελίας — σύρε για ταίριασμα" onclick="event.stopPropagation();_wk3Edit('${imp.id}')">${loadCard}<span class="wi2-arrow">→</span>${delCard}</div>
    <div class="wk3-feed r" title="${impVS2?'Εθνική διανομή από Βέροια — τελικός προορισμός. Ο μεταφορέας συμπληρώνεται στο Weekly National.':'Χωρίς εθνικό σκέλος'}">${feedR}${(typeof impVS2!=="undefined"?impVS2:(imp&&impVS))?_wi2Carrier(imp.id):''}</div>
  </div>`;
}

// Γραμμή σκέλους ρότας: «⤷ φόρτωση → παράδοση», κλικ = φόρμα, «⨯ αποσύνδεση».
// Assignment δεν έχει — κληρονομεί του γονέα.
function _wiLegRowHTML(legRow){
  const o=WINTL.data.exports.find(x=>x.id===(legRow.orderIds?.[0]||legRow.orderId))||WINTL.data.imports.find(x=>x.id===(legRow.orderIds?.[0]||legRow.orderId));
  if(!o) return '';
  const f=o.fields||{};
  const ld=_wiFmt(f['Loading DateTime']), dd=_wiFmt(f['Delivery DateTime']);
  const dir=(f['Direction']==='Import')?'import':'export';
  const lo=_wi2Loc(f['Loading Summary']||f['Client Name']||'—','Φόρτωση',f._stopsL);
  const de=_wi2Loc(f['Delivery Summary']||'—','Παράδοση',f._stopsD);
  const cards=`${_wi2Card({date:`<span class="wi2-date">${ld!=='—'?_wk3D(ld):'—'}</span>`,name:lo.name,sub:lo.sub})}<span class="wi2-arrow">→</span>${_wi2Card({date:dd!=='—'?`<span class="wi2-date">${_wk3D(dd)}</span>`:'',name:de.name,sub:de.sub,right:`<span class="wi2-legnote">σκέλος ρότας · ίδιο φορτηγό</span>${f['Reference']?`<span class="wi2-ref">${escapeHtml(String(f['Reference']))}</span>`:''}${_wi2Pal(f)}<button class="wk3-prt" title="Εκτύπωση σκέλους — δεξί κλικ: κοινή χρήση" data-shq="${printSheetQuery(o.id,dir,!!(f['Partner']||[]).length)}" data-shtitle="Εντολή — W${WINTL.week}" onclick="event.stopPropagation();printOrderSheet('${o.id}','${dir}',${(f['Partner']||[]).length?'true':'false'})">⎙</button>`})}`;
  // Σωστή στήλη ανά κατεύθυνση (owner 12/8): σκέλος εξαγωγής στη στήλη
  // διαδρομής (3/4), σκέλος εισαγωγής στη στήλη εισαγωγών (5/6).
  const legCell=`<div class="wk3-leg" style="grid-column:${dir==='import'?'5/6':'3/4'};cursor:pointer" onclick="event.stopPropagation();_wk3Edit('${o.id}')">${cards}</div>`;
  const unlink=`<div class="wk3-assign"><button class="wi2-unlink" title="Ακύρωση προώθησης — αποσύνδεση σκέλους από τη ρότα" onclick="_wiRotUnlink(event,'${o.id}')">⨯ αποσύνδεση</button></div>`;
  return `<div class="wk3-row wk3-legrow" data-row-id="${legRow.id}" title="Σκέλος ρότας (άλλος πελάτης) — κλικ: φόρμα · δεξί κλικ: αποσύνδεση"
      oncontextmenu="_wiRotUnlink(event,'${o.id}')">
    <div class="wk3-num" style="color: var(--accent-text);font-weight:800">⤷</div>
    <div class="wk3-feed l"></div>
    ${dir==='import'?`<div class="wk3-leg" style="grid-column:3/4"></div>${unlink}${legCell}`:`${legCell}${unlink}<div class="wk3-leg imp"></div>`}
    <div class="wk3-feed r"></div>
  </div>`;
}


/* ── ROW HTML ──────────────────────────────────────────────────────── */
function _wiBadges(f){
  const b=[];
  if(f['High Risk Flag'])   b.push('<span class="wi-badge wi-b-risk" title="Υψηλό ρίσκο">!</span>');
  if(f['Pallet Exchange'])  b.push('<span class="wi-badge wi-b-pe">PE</span>');
  if(f['National Groupage'])b.push('<span class="wi-badge wi-b-grpg">GRP</span>');
  const veroia=f['Veroia Switch'];
  if(veroia)                b.push('<span class="wi-badge wi-b-veroia">Veroia</span>');

  return b.join('');
}

/* ── QUIET VIEW + DRIVERS PANEL (owner, 8/8 βράδυ) ─────────────────── */
// «Ήσυχη προβολή» default: the per-row chips of Waves 1-2 read as clutter next
// to the team's sparse Excel — they now hide behind a «Λεπτομέρειες» toggle.
// Silent nets stay always-on: sync ⚠ on failure, phase badge, ΣΗΜΕΡΑ, popover
// history, group print. Shared key with weekly_natl (twin behaviour).
function _wiQuietOn(){ return localStorage.getItem('tms_weekly_details')!=='1'; }
function _wiToggleDetails(){ localStorage.setItem('tms_weekly_details', _wiQuietOn()?'1':'0'); renderWeeklyIntl(); }
// Excel sidebar «οδηγός → μέρα επιστροφής» (cols 33-36 of WEEKLY PLAN),
// computed from this week's assignments — no new data entry.
/* ── BUILD v3 Φάση Β — διαθεσιμότητα κατά τον κανόνα ημερών του owner:
   «επιστροφή ημέρα Χ → αναχώρηση Χ+2» (⚡Χ+1 = κατ' εξαίρεση μειωμένη,
   ΠΟΤΕ default). Όλα από τα ήδη φορτωμένα rows — μηδέν νέα fetches. ── */
function _wk3Busy(){
  const byDriver={}, byTruck={};
  WINTL.rows.forEach(r=>{
    const exp=WINTL.data.exports.find(x=>x.id===r.orderIds?.[0]);
    const imp=r.importId?WINTL.data.imports.find(x=>x.id===r.importId):(r.type==='import'?WINTL.data.imports.find(x=>x.id===r.orderId):null);
    const legF=(imp&&imp.fields)||(exp&&exp.fields); if(!legF) return;
    const end=toLocalDate(legF['Delivery DateTime']||legF['Loading DateTime']||''); if(!end) return;
    const place=_wiClean(legF['Delivery Summary']||'').split(',')[0].slice(0,16);
    const upd=(map,id)=>{ if(!id) return; const c=map[id]; if(!c||end>c.end) map[id]={end,place}; };
    upd(byDriver,r.driverId); upd(byTruck,r.truckId);
  });
  return {byDriver,byTruck};
}
// Owner (9/8): στο grid μόνο ΤΙΤΛΟΣ τοποθεσίας + κωδικός χώρας (DE/AT/HU/GR),
// όχι πόλη. Σύμβαση Summary: «Τίτλος[, νομική μορφή], CC, Πόλη…» → κόβουμε
// στο πρώτο διγράμματο-κεφαλαίο token (ή γνωστό όνομα χώρας).
const _WK3CC={'GREECE':'GR','ΕΛΛΑΔΑ':'GR','GERMANY':'DE','DEUTSCHLAND':'DE','AUSTRIA':'AT','OSTERREICH':'AT','HUNGARY':'HU','FRANCE':'FR','ITALY':'IT','ITALIA':'IT','NETHERLANDS':'NL','HOLLAND':'NL','CZECH REPUBLIC':'CZ','CZECHIA':'CZ','POLAND':'PL','SLOVAKIA':'SK','SLOVENIA':'SI','SPAIN':'ES','BELGIUM':'BE','ROMANIA':'RO','BULGARIA':'BG','CROATIA':'HR','SERBIA':'RS','SWITZERLAND':'CH','DENMARK':'DK','SWEDEN':'SE','UNITED KINGDOM':'GB'};
// Πολλαπλά σημεία (owner 9/8): το Summary μπορεί να έχει 2+ τοποθεσίες
// «Τίτλος, CC, Πόλη, Τίτλος2, CC2, Πόλη2…» — σπάμε σε τμήματα: κάθε τμήμα
// κλείνει στο CC και το αμέσως επόμενο token (πόλη) πετιέται.
function _wk3Locs(str){
  // ΩΜΟ trim (όχι _wiClean/escape): οι καταναλωτές κάνουν escapeHtml στο render —
  // το διπλό escape εμφάνιζε «&quot;» σε τίτλους με εισαγωγικά (W34 #12).
  const s=_wiRaw(str||''); if(!s||s==='—') return [];
  const parts=s.split(',').map(t=>t.trim()).filter(Boolean);
  const segs=[]; let cur=[];
  for(const p of parts){
    const up=p.toUpperCase();
    const cc=/^[A-Z]{2}$/.test(p)?p:(_WK3CC[up]||null);
    if(cc&&cur.length){ segs.push(cur[0]+', '+cc); cur=[]; }
    else if(!cc) cur.push(p);
  }
  // Ουρά χωρίς χώρα: σε single-location είναι ο τίτλος· αν υπάρχουν ήδη
  // τμήματα είναι σκόρπια πόλη — πετιέται.
  if(cur.length&&!segs.length) segs.push(cur[0]);
  return segs;
}
function _wk3Loc(str){ const L=_wk3Locs(str); return L.length?L[0]:_wiRaw(str||''); }
// Route κείμενο: 1ο σημείο + διακριτικό ×N με αριθμημένη λίστα στο tooltip
// Πολλαπλά σημεία (owner 10/8): «όλες οι πληροφορίες να αναγράφονται» — το
// 1ο σημείο μένει στη γραμμή, τα υπόλοιπα ΔΙΠΛΩΝΟΥΝ από κάτω με τη δική
// τους ημερομηνία (τονισμένη όταν διαφέρει από του 1ου).
function _wk3Arr(str,arr){
  let L;
  if(Array.isArray(arr)&&arr.length)
    L=arr.map(x=>typeof x==='string'?{n:_wk3Loc(x),dt:''}:{n:_wk3Loc(x.n),dt:x.dt||''});
  else L=_wk3Locs(str).map(n=>({n,dt:''}));
  // Σωστή χρονολογική σειρά σημείων (owner 10/8) — stable sort κατά ημερομηνία
  return L.map((x,i)=>({...x,_i:i}))
    .sort((a,b)=>(String(a.dt||'').localeCompare(String(b.dt||'')))||(a._i-b._i));
}
// Ίδιας-μέρας σημεία (owner 10/8): ΔΙΠΛΑ-ΔΙΠΛΑ στη γραμμή· από κάτω μόνο
// όσα πέφτουν άλλη μέρα. Στα 3+ ίδιας μέρας: συντομογραφίες + κλικ που
// ξεδιπλώνει σειρά με τα πλήρη ονόματα.
function _wk3SideCalc(str,arr){
  const L=_wk3Arr(str,arr);
  const d0=L.length&&L[0].dt?toLocalDate(L[0].dt):'';
  const same=[],diff=[];
  L.forEach(x=>{ const dd=x.dt?toLocalDate(x.dt):''; (dd&&d0&&dd!==d0?diff:same).push(x); });
  return {L,same,diff};
}
function _wk3LocHTML(str,label,arr){
  const kind=label==='Φόρτωση'?'load':'del';
  const {L,same}=_wk3SideCalc(str,arr);
  if(!L.length) return (_wiClean(str||'—'));
  const circ=i=>`<span class="wk3-stopn${kind==='load'?' ln':''}">${i+1}</span>`;
  if(L.length===1) return escapeHtml(L[0].n);
  if(same.length===1) return `${circ(0)}${escapeHtml(same[0].n)}`;
  // Έως 3 σημεία με πλήρη ονόματα (owner 12/8: «δύσκολο να διαβάσει ποια είναι
  // τα σημεία») — η γραμμή απλώνει ως τις παλέτες· αν πάλι δεν χωρά και κοπεί
  // με «…», το hover δείχνει την πλήρη αριθμημένη λίστα. Συντομογραφία μόνο 4+.
  if(same.length<=3){
    const tip3=escapeHtml(same.map((x,i)=>`${i+1}. ${x.n}`).join('\n'));
    return `<span title="${tip3}">${same.map((x,i)=>`${circ(i)}${escapeHtml(x.n)}`).join(' ')}</span>`;
  }
  const tip=escapeHtml(same.map((x,i)=>`${i+1}. ${x.n}`).join('\n'));
  const ab=same.map((x,i)=>`${circ(i)}${escapeHtml(x.n.split(',')[0].slice(0,5))}…`).join(' ');
  return `<span class="wk3-abbr" title="${same.length} σημεία — κλικ για πλήρη ονόματα&#10;${tip}" onclick="event.stopPropagation();const c=this.closest('.wk3-lcol')||this.closest('.wk3-fcol');const f=c&&c.querySelector('.wk3-xfold');if(f)f.classList.toggle('open')">${ab}</span>`;
}
function _wk3MoreStops(str,arr,kind){
  const {L,same,diff}=_wk3SideCalc(str,arr);
  if(L.length<2) return '';
  const arrow=kind==='del'?'<span class="wk3-sep" style="margin:0 2px 0 0">→</span>':'';
  const circ=i=>`<span class="wk3-stopn${kind==='load'?' ln':''}">${i+1}</span>`;
  let html='';
  // Αναδιπλωμένη σειρά πλήρων ονομάτων για τα 3+ ίδιας μέρας (ανοίγει με κλικ)
  if(same.length>=3){
    html+=`<div class="wk3-xfold">${same.map((x,i)=>
      `<div class="wk3-stopline${kind==='del'?' dl':''}">${arrow}${circ(i)}<span class="wk3-sln">${escapeHtml(x.n)}</span></div>`).join('')}</div>`;
  }
  // Διαφορετικής μέρας: πάντα δική τους γραμμή με την ημερομηνία τους
  html+=diff.map((st,i)=>{
    const dtxt=st.dt?_wk3D(_wiFmt(st.dt)):'';
    return `<div class="wk3-stopline${kind==='del'?' dl':''}">${arrow}${circ(same.length+i)}${dtxt?`<b class="wk3-sld diff" title="Διαφορετική ημέρα από το 1ο σημείο">${dtxt}</b>`:''}<span class="wk3-sln">${escapeHtml(st.n)}</span></div>`;
  }).join('');
  return html;
}
function _wk3Edit(orderId){
  if(!orderId) return;
  const rec=WINTL.data.exports.find(r=>r.id===orderId)||WINTL.data.imports.find(r=>r.id===orderId);
  if(rec&&typeof openIntlEditWith==='function') openIntlEditWith(orderId, rec.fields);
}
// Πρόοδος φορτίου (demo εγκεκριμένο 10/8, χωρίς τελείες): πράσινη ημ/νία ✓
// όταν το βήμα ολοκληρωθεί, πορτοκαλί «!» όταν καθυστέρησε.
// Υβριδική ημερομηνία VS (owner 10/8): πραγματική = 'VS CD Date', αλλιώς
// εκτίμηση Loading+1 (export) / Delivery−1 (import), εμφανώς «≈».
function _wk3VsCd(f,dir){
  const real=f?.['VS CD Date'];
  if(real) return {iso:String(real).slice(0,10),est:false};
  const base=dir==='imp'?f?.['Delivery DateTime']:f?.['Loading DateTime'];
  if(!base) return {iso:'',est:true};
  try{ return {iso:toLocalDate(new Date(new Date(base).getTime()+(dir==='imp'?-1:1)*86400000)),est:true}; }
  catch(e){ return {iso:'',est:true}; }
}
// Όλες οι ημερομηνίες του Weekly κλικαμπλ (owner 10/8): κλικ → calendar →
// PATCH στο order. Datetime πεδία κρατούν την ώρα τους· το VS CD Date είναι
// σκέτη ημερομηνία.
function _wk3PickDate(ev,orderId,field,curIso){
  ev.stopPropagation(); ev.preventDefault();
  if(!orderId) return;
  const inp=document.createElement('input'); inp.type='date';
  inp.value=String(curIso||'').slice(0,10);
  Object.assign(inp.style,{position:'fixed',left:Math.min(ev.clientX,window.innerWidth-180)+'px',top:(ev.clientY+8)+'px',zIndex:9999,opacity:0.01,width:'2px',height:'2px'});
  document.body.appendChild(inp);
  let doneFlag=false;
  inp.onchange=async ()=>{
    if(doneFlag) return; doneFlag=true;
    const nd=inp.value; inp.remove(); if(!nd) return;
    try{
      let val=nd;
      if(field!=='VS CD Date'){
        const o=curIso?new Date(curIso):new Date(nd+'T08:00:00');
        const [y,m,d]=nd.split('-');
        o.setFullYear(+y,+m-1,+d);
        val=o.toISOString();
      }
      const res=await atSafePatch(TABLES.ORDERS,orderId,{[field]:val});
      if(res?.error) throw new Error(res.error.message||res.error.type);
      toast('Ημερομηνία ενημερώθηκε ✓');
      renderWeeklyIntl();
    }catch(e){ reportError('Η αλλαγή ημερομηνίας απέτυχε',e); }
  };
  inp.onblur=()=>setTimeout(()=>{ if(!doneFlag) inp.remove(); },300);
  inp.focus();
  try{ inp.showPicker(); }catch(e){}
}
function _wk3StFlags(f){
  const st=f?.['Status']||'';
  return { loaded:['In Transit','Delivered','Invoiced'].includes(st),
           delivered:['Delivered','Invoiced'].includes(st),
           late:f?.['Delivery Performance']==='Delayed' };
}
function _wk3D(s){return String(s);}   // zero-padding kept on purpose: equal-width chips
function _wk3AddDays(iso,days){ const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+days); return toLocalDate(d); }

/* ── v2 cell cards (board 319:873) ─────────────────────────────────── */
// Summary convention «Τίτλος[, νομική μορφή], CC, Πόλη…» → title / city / CC.
// The v2 card has two lines, so the city the one-line grid dropped (owner 9/8)
// gets the second line — as the frame draws it («KOLIOS GmbH» / «Aichach, DE»).
function _wi2Split(str){
  const parts=_wiRaw(str||'').split(',').map(t=>t.trim()).filter(Boolean);
  let cc='',city='',title=parts[0]||'';
  // ΔΥΟ ΠΑΡΑΓΩΓΟΙ, ΔΥΟ ΣΕΙΡΕΣ (owner 3/9 — «χάνεται η πόλη»):
  //  · το Summary της βάσης γράφει «Τίτλος, CC, Πόλη»
  //  · η ετικέτα του core/form-helpers.js:22 γράφει «Όνομα, Πόλη, Χώρα»
  // Ο παλιός κώδικας κοίταζε ΜΟΝΟ μετά τον κωδικό χώρας, οπότε στη δεύτερη
  // σειρά η πόλη πεταγόταν σιωπηλά: η φόρτωση έδειχνε σκέτο «GR» ενώ η
  // παράδοση έδειχνε «Πόλη, CC».
  // ΑΥΣΤΗΡΩΣ ΠΡΟΣΘΕΤΙΚΟ: η παλιά διαδρομή μένει byte-ίδια· κοιτάμε πριν τον
  // κωδικό ΜΟΝΟ αν η παλιά δεν βρήκε πόλη. Μετρήθηκε 3/9: χωρίς αυτό, μία
  // γραμμή παράδοσης έχανε το «Slovenia» που έδειχνε πριν.
  for(let i=1;i<parts.length;i++){
    const c=/^[A-Z]{2}$/.test(parts[i])?parts[i]:(_WK3CC[parts[i].toUpperCase()]||null);
    if(c){
      cc=c;
      if(parts[i+1]&&!/^[A-Z]{2}$/.test(parts[i+1])) city=parts[i+1];
      else if(i>1&&parts[i-1]&&!/^[A-Z]{2}$/.test(parts[i-1])) city=parts[i-1];
      break;
    }
  }
  return {title,city,cc};
}
// Name line + sub line for one end of a leg. Multi-stop (①②…) keeps the
// existing folding helpers as they are; only the single-stop case gets a city.
function _wi2Loc(str,label,arr){
  const L=_wk3Arr(str,arr);
  if(L.length>1) return {name:_wk3LocHTML(str,label,arr),sub:''};
  const raw=(Array.isArray(arr)&&arr.length)?(typeof arr[0]==='string'?arr[0]:arr[0].n):str;
  const s=_wi2Split(raw);
  return {name:escapeHtml(s.title||'—'),sub:escapeHtml([s.city,s.cc].filter(Boolean).join(', '))};
}
// Δύο σειρές (owner 4/9): όνομα μόνο του σε όλο το πλάτος· από κάτω
// ημερομηνία · πόλη · σήματα/παλέτες. Το «extra» (πολλαπλά σημεία, μέλη
// ομάδας) διπλώνει κάτω από τη δεύτερη σειρά, όπως και πριν.
function _wi2Card(o){
  const meta=(o.date||'')+(o.sub?`<span class="wi2-sub" title="${o.sub}">${o.sub}</span>`:'')+(o.right?`<span class="wi2-right">${o.right}</span>`:'');
  return `<div class="wi2-card${o.cls?' '+o.cls:''}"${o.title?` title="${o.title}"`:''}><div class="wi2-name">${o.name}</div>${meta?`<div class="wi2-meta">${meta}</div>`:''}${o.extra||''}</div>`;
}
// Το μοίρασμα φόρτωσης↔παράδοσης ακολουθεί το περιεχόμενο (owner 3/9).
// Ένας λόγος για ΟΛΗ τη στήλη, όχι ανά γραμμή: αλλιώς το βέλος χοροπηδά και
// χάνεται η κάθετη στοίχιση που ζητήθηκε στο ίδιο μήνυμα. Κριτήριο = η πιο
// απαιτητική κάρτα κάθε πλευράς, γιατί όλες μοιράζονται την ίδια γεωμετρία:
// αν μία δεν χωράει, η στήλη είναι στενή. Όρια 35-65% ώστε μια ακραία
// ονομασία να μη μηδενίζει την απέναντι πλευρά.
function _wi2Balance(){
  const sheet=document.querySelector('.wk3.wi2'); if(!sheet) return;
  const names=[...document.querySelectorAll('#wi-rows .wi2-name')];
  // Reset last pass first: a name that shrank for a narrow column must be
  // measured again at 13px after a resize widened it.
  names.forEach(e=>{ e.classList.remove('clamp'); e.style.fontSize=''; });
  const legs=[...document.querySelectorAll('#wi-rows .wk3-leg')].filter(l=>l.offsetParent&&l.children.length>=3);
  if(legs.length){
    sheet.classList.add('wi2-measure');            // nowrap: διαβάζουμε το φυσικό πλάτος
    const need=c=>{
      const n=c.querySelector(':scope>.wi2-name'); let t=n?n.scrollWidth:0;
      const m=c.querySelector(':scope>.wi2-meta');
      if(m){ let w=0; [...m.children].forEach(e=>{ w+=e.offsetWidth+8; }); t=Math.max(t,w); }
      return t+16;
    };
    let L=0,R=0;
    legs.forEach(l=>{ L=Math.max(L,need(l.children[0])); R=Math.max(R,need(l.children[2])); });
    sheet.classList.remove('wi2-measure');
    if(L+R){
      const r=Math.min(.65,Math.max(.35,L/(L+R)));
      sheet.style.setProperty('--sL',r.toFixed(3)+'fr');
      sheet.style.setProperty('--sR',(1-r).toFixed(3)+'fr');
    }
  }
  // ΚΛΙΜΑΚΩΣΗ ΑΝΑ ΟΝΟΜΑ (owner 4/9): 13px σε όλο το πλάτος → 12 → 11 → 10,
  // μετρημένο με scrollWidth ΜΟΝΟ για το όνομα που δεν χωρά. Αν ούτε στα 10px
  // χωρά: δύο σειρές με ορατό «…» και το πλήρες κείμενο σε title — τίποτα
  // δεν κόβεται σιωπηλά (Κ6). Οι μαζεμένες εθνικές στήλες (18px) εξαιρούνται:
  // εκεί δεν χωρά τίποτα και η μέτρηση θα «μίκραινε» κάθε όνομα άσκοπα.
  let cut=0;
  const fits=e=>e.scrollWidth<=e.clientWidth+1;
  names.forEach(e=>{
    if(e.clientWidth<40) return;
    if(!fits(e)){
      for(const px of [12,11,10]){ e.style.fontSize=px+'px'; if(fits(e)) break; }
      if(!fits(e)){ e.classList.add('clamp'); e.title=e.innerText.trim(); cut++; return; }
    }
    if(e.title) e.removeAttribute('title');
  });
  WINTL._clamped=cut;
}
let _wi2BalTimer=null;
window.addEventListener('resize',()=>{ clearTimeout(_wi2BalTimer); _wi2BalTimer=setTimeout(_wi2Balance,150); });
// Carrier tile for a national leg (owner 4/9): what Weekly National assigned.
// Same vocabulary as the assignment pill — navy own (plates · driver), green
// partner (name · plates), dashed «ΠΡΟΣ ΑΝΑΘΕΣΗ» when nothing is assigned yet.
// Full text lives in title; the tile truncates honestly.
function _wi2Carrier(oid){
  const nl=WINTL.data.nlBySrc&&WINTL.data.nlBySrc[oid]; const d=WINTL.data;
  const un=`<div class="wi2-carrier un" title="Εθνικό σκέλος χωρίς μεταφορέα — ανατίθεται στο Weekly National">ΠΡΟΣ ΑΝΑΘΕΣΗ</div>`;
  if(!nl) return un;
  const f=nl.fields||{}; const pid=(f['Partner']||[])[0], tid=(f['Truck']||[])[0], did=(f['Driver']||[])[0];
  if(pid||f['Is Partner Trip']){
    const t=[d.partners.find(x=>x.id===pid)?.label||'—', f['Partner Truck Plates']||''].filter(Boolean).join(' · ');
    return `<div class="wi2-carrier par" title="Εθνικός μεταφορέας — συνεργάτης: ${escapeHtml(t)}">${escapeHtml(t)}</div>`;
  }
  if(tid){
    const t=[d.trucks.find(x=>x.id===tid)?.label||'—', did?(d.drivers.find(x=>x.id===did)?.label||''):''].filter(Boolean).join(' · ');
    return `<div class="wi2-carrier own" title="Εθνικός μεταφορέας — ιδιόκτητο: ${escapeHtml(t)}">${escapeHtml(t)}</div>`;
  }
  return un;
}
// Clickable date chip → calendar → PATCH (existing _wk3PickDate, all dates stay editable — owner 10/8)
function _wi2Date(oid,field,iso,txt,cls,title){
  return `<span class="wi2-date wk3-ld${cls||''}" title="${title||''} — κλικ για αλλαγή" onclick="_wk3PickDate(event,'${oid}','${field}','${iso||''}')">${txt||'—'}</span>`;
}
// Contract §8: unknown ≠ 0. A Total Pallets the facade never returned (NULL
// disappears from fields) renders «—», never «0p». Fill colour x/33:
// normal <30 · orange ≥30 · red >33.
function _wi2PalCls(n){ return n>33?' over':n>=30?' hi':''; }
function _wi2Pal(f){
  if(!f||!('Total Pallets' in f)||f['Total Pallets']===''||f['Total Pallets']==null)
    return `<span class="wi2-pal na" title="Οι παλέτες δεν έχουν καταγραφεί">—</span>`;
  const n=+f['Total Pallets'];
  return `<span class="wi2-pal${_wi2PalCls(n)}" title="${n>33?'Πάνω από τη χωρητικότητα (33)':n>=30?'Κοντά στη χωρητικότητα (33)':'Παλέτες'} · ${n}/33">${n} p</span>`;
}
// Group: partial sums are declared («2 στάσεις χωρίς παλέτες»), not hidden.
function _wi2PalGroup(exps){
  const known=exps.filter(e=>('Total Pallets' in e.fields)&&e.fields['Total Pallets']!==''&&e.fields['Total Pallets']!=null);
  const miss=exps.length-known.length;
  if(!known.length) return `<span class="wi2-pal na" title="Οι παλέτες δεν έχουν καταγραφεί σε κανένα μέλος">—</span>`;
  const n=known.reduce((s,e)=>s+(+e.fields['Total Pallets']),0);
  return `<span class="wi2-pal${_wi2PalCls(n)}" title="Σύνολο ομάδας · ${n}/33${miss?` · ${miss} ${miss===1?'στάση':'στάσεις'} χωρίς παλέτες`:''}">${n} p${miss?'<span class="na">+?</span>':''}</span>`;
}
// «ΕΠΕΙΓΟΝ» gap (frame: «2 με παράδοση εντός 48h»): own round trip without
// import whose delivery falls within two days — or already passed.
function _wi2Urgent(f,today){
  const d=toLocalDate(f?.['Delivery DateTime']||''); if(!d) return false;
  return d<=_wk3AddDays(today,2);
}
function _wi2When(f,today){
  const d=toLocalDate(f?.['Delivery DateTime']||'');
  if(d===today) return 'σήμερα';
  if(d===_wk3AddDays(today,1)) return 'αύριο';
  if(d<today) return 'πέρασε ('+_wk3D(_wiFmt(d+'T12:00:00'))+')';
  return 'σε 2 ημέρες';
}
function _wi2Legend(){ const el=document.getElementById('wi2-legend'); if(el) el.hidden=!el.hidden; }
function _wi2LegendHTML(){
  return `<div id="wi2-legend" class="wi2-lg" hidden>
    <span><b>Ανάθεση:</b> navy = δικός στόλος (πινακίδες · οδηγός) · πράσινο = συνεργάτης (επωνυμία · πινακίδες) · κόκκινο διακεκομμένο «ΠΡΟΣ ΑΝΑΘΕΣΗ» = εκκρεμεί ανάθεση · γκρι διακεκομμένο «ΠΡΟΣ ΑΝΑΘΕΣΗ · εισαγωγή» = εισαγωγή χωρίς δικό όχημα</span>
    <span><b>Εισαγωγή:</b> ΚΕΝΟ ΓΥΡΙΣΜΑ = δικός γύρος χωρίς φορτίο επιστροφής (κόκκινο = επείγον, παράδοση εντός 48h) · navy κελί = συνεργάτης, δεν αναμένεται σκέλος · ανοιχτό κελί = σύρε εισαγωγή εδώ</span>
    <span><b>Σήματα:</b> VS = Veroia Switch · PE = ανταλλαγή παλετών · ! = υψηλό ρίσκο / καθυστέρηση · ①② = σειρά στάσεων · ↤/↦ = φόρτωση σε άλλη εβδομάδα · ⚠ φόρτωση χωρίς ανάθεση (μόνο τρέχουσα)</span>
    <span><b>Sync:</b> ⟳ γράφεται · ✓ γράφτηκε · ⚠ ΔΕΝ γράφτηκε (μένει ορατό)</span>
    <span><b>Παλέτες:</b> — = δεν καταγράφηκαν · πορτοκαλί ≥30 · κόκκινο >33 (χωρητικότητα 33)</span>
    <span><b>Σκέλη Βέροιας:</b> — = δεν υπάρχει εθνικό σκέλος · κάρτα = Veroia Switch (ο μεταφορέας συμπληρώνεται στο Weekly National)</span>
    <span><b>Οδηγοί:</b> επιστροφή Χ → επόμενη αναχώρηση Χ+2 (⚡Χ+1 μόνο κατ' εξαίρεση)</span>
  </div>`;
}
// Footer sync tally: «Ενημερώθηκε 07:42 · 20/21 γραμμές γραμμένες · 1 δεν
// γράφτηκε (γραμμή 4)» — from the per-order session log kept by _wiSync.
function _wi2FootSync(){
  const el=document.getElementById('wi2-sync'); if(!el) return;
  const at=WINTL._loadedAt?WINTL._loadedAt.toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit',hour12:false}):'—';
  const log=WINTL._syncLog||{};
  const all=Object.entries(log);
  const ok=all.filter(([,s])=>s.state==='ok').length;
  const pend=all.filter(([,s])=>s.state==='pend').length;
  const errs=all.filter(([,s])=>s.state==='err');
  let t=`Ενημερώθηκε ${at}`;
  if(all.length){
    t+=` · ${ok}/${all.length} γραμμές γραμμένες`;
    if(pend) t+=` · ${pend} γράφεται…`;
    if(errs.length){
      const nos=errs.map(([oid])=>WINTL._rowNo?.[oid]).filter(Boolean);
      t+=` · <span class="err">${errs.length} δεν ${errs.length===1?'γράφτηκε':'γράφτηκαν'}${nos.length?` (γραμμή ${nos.join(', ')})`:''}</span>`;
    }
  }
  el.innerHTML=t;
}


/* ── WAVE 2 HELPERS (T3/T4/T5/T1 — PREMORTEM) ─────────────────────── */
// T5: execution flags, CURRENT week only. A load whose time passed with no
// assignment (or stuck on Assigned) turns visible in the morning — the
// partner no-show stops hiding until the afternoon.
function _wiExecChip(f, saved){
  if(WINTL.week!==_wiCurrentWeek()||!f) return '';
  const ld=f['Loading DateTime']; if(!ld) return '';
  if(new Date(ld)>new Date()) return '';
  const st=f['Status']||'';
  if(!saved) return '<span class="wi-exec wi-exec--late" title="Η ώρα φόρτωσης πέρασε χωρίς ανάθεση">⚠ φόρτωση χωρίς ανάθεση</span>';
  if(st==='Assigned') return '<span class="wi-exec wi-exec--stale" title="Η ώρα φόρτωσης πέρασε και η κατάσταση μένει Assigned — έλεγξε αν ξεκίνησε">⏱ πέρασε η φόρτωση · χωρίς εξέλιξη</span>';
  return '';
}
// T4: exports live in their DELIVERY week — flag the ones loading in another
// week, because in that week's view this line does NOT exist.
function _wiWeekOf(dt){ if(!dt) return null; try{return _wiWeekNumOf(new Date(new Date(dt).getTime()+86400000));}catch{return null;} }
function _wiCrossChip(f){
  const lw=_wiWeekOf(f?.['Loading DateTime']);
  if(lw==null||lw===WINTL.week) return '';
  return `<span class="wi-cross" title="Η φόρτωση πέφτει στη W${lw} — στην προβολή της W${lw} αυτή η γραμμή δεν εμφανίζεται (φίλτρο ανά εβδομάδα ΠΑΡΑΔΟΣΗΣ)">↤ φορτώνει W${lw}</span>`;
}
// T3: per-row sync state — what you see has (or has not) reached the server.
// Logged per ORDER id (row ids are renumbered on every rebuild) so the footer
// can count written/failed rows and a repaint re-applies the ⚠: a failed write
// must never disappear behind a refresh («μένει ορατό», contract §7).
function _wiSync(id, state, msg){
  const rowId=parseInt(String(id).replace('wi-sync-',''),10);
  const row=WINTL.rows.find(r=>r.id===rowId);
  const oid=row?(row.orderIds?.[0]||row.orderId):null;
  if(oid){
    WINTL._syncLog=WINTL._syncLog||{};
    if(state) WINTL._syncLog[oid]={state,msg:msg||'',at:Date.now()}; else delete WINTL._syncLog[oid];
    _wi2FootSync();
  }
  const el=document.getElementById(id); if(!el) return;
  el.className='wi-sync'+(state?' wi-sync--'+state:'');
  el.textContent=state==='pend'?'⟳':state==='ok'?'✓':state==='err'?'⚠':'';
  el.title=msg||'';
  if(state==='ok') setTimeout(()=>{ if(el.textContent==='✓'){el.textContent='';el.className='wi-sync';} },4000);
}
// T1: same-day double-booking guard. Reuse across DIFFERENT days is normal
// fleet work (W21 had legit ×2) — only a same-day clash asks for a confirm.
function _wiSameDayConflict(row){
  const myO=WINTL.data.exports.find(x=>x.id===row.orderIds?.[0])||WINTL.data.imports.find(x=>x.id===row.orderId);
  const myD=toLocalDate(myO?.fields['Loading DateTime']||''); if(!myD) return null;
  for(const r of WINTL.rows){ if(r.id===row.id) continue;
    if(!r.truckId&&!r.driverId) continue;
    const o=WINTL.data.exports.find(x=>x.id===r.orderIds?.[0])||WINTL.data.imports.find(x=>x.id===r.orderId);
    if(toLocalDate(o?.fields['Loading DateTime']||'')!==myD) continue;
    if(row.truckId&&r.truckId===row.truckId) return `Το φορτηγό ${row.truckLabel||''} έχει ήδη φόρτωση την ίδια μέρα (${myD.slice(5)}).`;
    if(row.driverId&&r.driverId===row.driverId) return `Ο οδηγός ${row.driverLabel||''} έχει ήδη φόρτωση την ίδια μέρα (${myD.slice(5)}).`;
  }
  return null;
}

// GRP σειρά παράδοσης (owner 12/8): ζει ΜΕΣΑ στο Group ID ως «GRP-xxx|recA,recB»
// ώστε να μη χρειαστεί νέα στήλη/worker deploy — το collapse δουλεύει με απλή
// ισότητα του string, άρα το κοινό suffix δεν το σπάει. Χωρίς suffix, η σειρά
// πέφτει σε ημερομηνία παράδοσης.
function _wiGrpOrder(exps){
  if(exps.length<2) return exps;
  const gid=String(exps.find(e=>e.fields['Group ID'])?.fields['Group ID']||'');
  const seq=(gid.split('|')[1]||'').split(',').filter(Boolean);
  if(seq.length){
    const pos=id=>{const k=seq.indexOf(id);return k<0?99:k;};
    return [...exps].sort((a,b)=>pos(a.id)-pos(b.id));
  }
  return [...exps].sort((a,b)=>String(a.fields['Delivery DateTime']||'').localeCompare(String(b.fields['Delivery DateTime']||'')));
}

function _wiRowHTML(row,i){
  const {data,ui}=WINTL;
  const exps   =_wiGrpOrder(row.orderIds.map(id=>data.exports.find(r=>r.id===id)).filter(Boolean));
  const imp    =row.importId?data.imports.find(r=>r.id===row.importId):null;
  const isGroup=exps.length>1;
  const primary=exps[0];
  const pf=primary?.fields||{};
  const pid=primary?.id||'';
  const today=(typeof localToday==='function')?localToday():toLocalDate(new Date());
  const hasPartner=!!(row.partnerId||row.partnerLabel);

  const fromStr=primary?_wiRaw(pf['Loading Summary']||pf['Client Name']||pf['Client Summary']||'—'):'—';
  const toStr  =primary?_wiRaw(pf['Delivery Summary']||pf['Client Name']||pf['Client Summary']||'—'):'—';
  // GRP (owner 12/8): η γραμμή δείχνει ΕΝΑ σημείο ανά ΜΕΛΟΣ (①=1ο μέλος κ.ο.κ.),
  // όχι το comma-parsing του summary του πρώτου — αυτό εμφάνιζε την πόλη του
  // San Lucar ως ψεύτικο «② προορισμό». Συνθετικά arrays {n,dt} ώστε τα ①②,
  // η συντομογραφία 3+ και το ίδια-μέρα-δίπλα να δουλέψουν με την υπάρχουσα λογική.
  // Fallback ΧΩΡΙΣ escapeHtml — το _wk3LocHTML κάνει το δικό του escape.
  const _gm1=(e,key,sumKey)=>({ n:(e.fields[key]?.[0]?.n)||String(e.fields[sumKey]||e.fields['Client Name']||'—').split(',').slice(0,2).join(',').replace(/^['"\s/]+/,'').replace(/['"\s/]+$/,'').trim(),
    dt:e.fields[sumKey==='Loading Summary'?'Loading DateTime':'Delivery DateTime'] });
  const gL=isGroup?exps.map(e=>_gm1(e,'_stopsL','Loading Summary')):null;
  const gD=isGroup?exps.map(e=>_gm1(e,'_stopsD','Delivery Summary')):null;
  const gLs=gL?gL.map(x=>x.n).join(', '):'';
  const gDs=gD?gD.map(x=>x.n).join(', '):'';
  const refs=isGroup?exps.map(e=>e.fields['Reference']).filter(Boolean).join(' · '):(pf['Reference']||'');

  // Assignment pill — v2: two lines (driver / plates · company / plates). The
  // text never goes away (contract §5: colour-blind users read the text).
  const truck  =row.truckLabel  ||data.trucks.find(t=>t.id===row.truckId)?.label||'';
  const trailer=row.trailerLabel||data.trailers.find(t=>t.id===row.trailerId)?.label||'';
  const driver =row.driverLabel ||data.drivers.find(d=>d.id===row.driverId)?.label||'';
  // Fallback «Συνεργάτης» (owner 12/8): νέος partner που δεν είναι ακόμη στην
  // 30' cache των άλλων χρηστών εμφανιζόταν ως navy «—» αντί για πράσινο pill.
  // «—» αντί για «Συνεργάτης» όταν ο partner λείπει από την cache: η γενική
  // λέξη δεν είναι επωνυμία (owner 4/9)· το πρόθεμα ΣΥΝ. λέει ήδη το είδος.
  const partner=row.partnerLabel||data.partners.find(p=>p.id===row.partnerId)?.label||(row.partnerId?'—':'');
  const plates=[truck,trailer].filter(Boolean).join(' / ');
  let pill;
  // Χρώμα ΚΑΙ λέξη (DESIGN ΜΕΡΟΣ Ε, owner 4/9): «ΙΔ.» + πινακίδα + οδηγός,
  // «ΣΥΝ.» + επωνυμία. Το πλήρες κείμενο ζει στο title — το πλακίδιο κόβει
  // με ορατό «…», ποτέ σιωπηλά.
  if(row.saved){
    if(partner){
      pill=`<div class="wk3-pill par" title="Συνεργάτης: ${escapeHtml(partner)}${row.partnerPlates?' · '+escapeHtml(row.partnerPlates):''}${driver?' · '+escapeHtml(driver):''} — κλικ: αλλαγή ανάθεσης"><span class="t">${escapeHtml(partner)}</span><small>${escapeHtml([row.partnerPlates,driver].filter(Boolean).join(' · '))||'&nbsp;'}</small></div>`;
    } else {
      pill=`<div class="wk3-pill own" title="Ιδιόκτητο: ${escapeHtml(plates)}${driver?' · '+escapeHtml(driver):''} — κλικ: αλλαγή ανάθεσης"><span class="t">${escapeHtml(plates||'—')}</span><small>${escapeHtml(driver||'')||'&nbsp;'}</small></div>`;
    }
  } else {
    // «ΠΡΟΣ ΑΝΑΘΕΣΗ», όχι κενό (owner 4/9 αντικαθιστά το «χρώμα, όχι λόγια»
    // του 12/8): εκκρεμότητα με όνομα, που ζητά κλικ — και διαβάζεται χωρίς
    // το κόκκινο.
    pill=`<div class="wk3-pill un" title="Προς ανάθεση — κλικ για ανάθεση"><span class="t">ΠΡΟΣ ΑΝΑΘΕΣΗ</span></div>`;
  }

  const stF=_wk3StFlags(pf);
  const stI=_wk3StFlags(imp?.fields);
  const vsExp=!!pf['Veroia Switch'];
  const impVS=!!imp?.fields['Veroia Switch'];
  const loadIso=pf['Loading DateTime']||'';

  // Export: loading card → delivery card. VS export loads from the Cross-Dock
  // (hybrid date: real 'VS CD Date' or estimate Loading+1, shown «≈»-styled).
  let loadCard;
  if(vsExp){ const v=_wk3VsCd(pf,'exp');
    loadCard=_wi2Card({cls:stF.loaded?'ok':'', date:_wi2Date(pid,'VS CD Date',v.iso,v.iso?_wk3D(_wiFmt(v.iso+'T12:00:00')):'—',(stF.loaded?' done':'')+(v.est?' estd':''),v.est?'Εκτίμηση (Loading+1) — κλικ για πραγματική ημερομηνία CD':'Ημ. φόρτωσης από Cross-Dock'), name:'<span class="wi2-nw">Cross-Dock <span class="wk3-vsb">VS</span></span>', sub:'Βέροια, GR'});
  } else {
    const lo=_wi2Loc(isGroup?gLs:fromStr,'Φόρτωση',isGroup?gL:pf._stopsL);
    loadCard=_wi2Card({cls:stF.loaded?'ok':'', date:_wi2Date(pid,'Loading DateTime',loadIso,loadIso?_wk3D(_wiFmt(loadIso)):'—',stF.loaded?' done':'','Ημερομηνία φόρτωσης'+(stF.loaded?' — φορτώθηκε ✓':'')), name:lo.name, sub:lo.sub, extra:_wk3MoreStops(isGroup?gLs:fromStr,isGroup?gL:pf._stopsL,'load')});
  }
  const de=_wi2Loc(isGroup?gDs:toStr,'Παράδοση',isGroup?gD:pf._stopsD);
  const members=(isGroup&&ui.openGroup===row.id)?exps.map((m,k)=>{const mf=m.fields;
    const ml=mf['Loading DateTime']?`<b class="wk3-ld">${_wk3D(_wiFmt(mf['Loading DateTime']))}</b> `:'';
    const md=mf['Delivery DateTime']?`<b class="wk3-ld">${_wk3D(_wiFmt(mf['Delivery DateTime']))}</b> `:'';
    return `<div class="wk3-stopline wk3-gm" title="Κλικ: φόρμα παραγγελίας" onclick="event.stopPropagation();_wk3Edit('${m.id}')"><span class="wk3-gmn">${k+1}</span><span class="wk3-gmc">${ml}${(_wiClean(mf['Loading Summary']||mf['Client Name']||'—'))}</span><span class="wk3-sep">→</span><span class="wk3-gmc">${md}${(_wiClean(mf['Delivery Summary']||'—'))}</span><span class="wk3-gmp">${_wi2Pal(mf)}</span></div>`;}).join(''):'';
  const delCard=_wi2Card({cls:stF.late?'late':stF.delivered?'ok':'',
    name:de.name+(stF.late?'<span class="wi2-late" title="Καθυστέρησε (Delivery Performance = Delayed)">! καθυστέρηση</span>':stF.delivered?'<span class="wk3-okc" title="Παραδόθηκε">✓</span>':''),
    sub:de.sub, extra:_wk3MoreStops(isGroup?gDs:toStr,isGroup?gD:pf._stopsD,'del')+members,
    right:`${refs?`<span class="wi2-ref" title="Κωδικός αναφοράς">${escapeHtml(String(refs))}</span>`:''}${_wiCrossChip(pf)}${_wiExecChip(pf,row.saved)}<span class="wi2-flags">${_wiBadges(pf)}</span>${isGroup?_wi2PalGroup(exps):_wi2Pal(pf)}`});

  // Import side: matched preview · «ΚΕΝΟ ΓΥΡΙΣΜΑ» (own, no import) · navy
  // (partner — nothing expected back, owner 9/8) · open drop target.
  // gap = ΔΕΝ έχει δηλωθεί import (row.importId) — όχι «δεν βρέθηκε το record
  // στη φετινή εβδομάδα» (matched import άλλης εβδομάδας ≠ κενό γυρισμού)
  const gapCell=row.saved&&!hasPartner&&!row.importId;
  const parCell=row.saved&&hasPartner&&!row.importId;
  const urg=gapCell&&_wi2Urgent(pf,today);
  let impInner;
  if(imp){
    const f2=imp.fields;
    const il=_wi2Loc(f2['Loading Summary']||f2['Client Name']||f2['Client Summary']||'—','Φόρτωση',f2._stopsL);
    const ilIso=f2['Loading DateTime']||'';
    const iload=_wi2Card({cls:stI.loaded?'ok':'', date:_wi2Date(imp.id,'Loading DateTime',ilIso,ilIso?_wk3D(_wiFmt(ilIso)):'—',stI.loaded?' done':'','Ημ. φόρτωσης εισαγωγής'+(stI.loaded?' — φορτώθηκε ✓':'')), name:il.name, sub:il.sub, extra:_wk3MoreStops(f2['Loading Summary']||'',f2._stopsL,'load')});
    // ΙΔΙΑ ΘΕΣΗ ΜΕ ΤΗΝ ΕΞΑΓΩΓΗ (owner 3/9): οι παλέτες και τα σήματα έμπαιναν
    // εδώ στη ΔΕΥΤΕΡΗ ΣΕΙΡΑ, κάτω από το όνομα, ενώ στην εξαγωγή μπαίνουν στη
    // δεξιά θυρίδα — δύο ιδιώματα για το ίδιο πράγμα στην ίδια γραμμή. Και
    // επειδή μοιράζονταν τη σειρά με την πόλη, η πόλη στριμωχνόταν πίσω από
    // «PE · 33 p». Τώρα: δεξιά οι παλέτες, η δεύτερη σειρά μένει της πόλης.
    const iright=`<span class="wi2-flags">${_wiBadges(f2)}</span>${_wi2Pal(f2)}<button class="wk3-unm" title="Αφαίρεση ταιριάσματος" onclick="event.stopPropagation();_wiUnmatch('${imp.id}')">×</button>`;
    let idel;
    if(impVS){ const v=_wk3VsCd(f2,'imp');
      // Matched preview is the narrow column: «Cross-Dock VS» on one line, no city (the badge says it)
      idel=_wi2Card({cls:stI.late?'late':stI.delivered?'ok':'', date:_wi2Date(imp.id,'VS CD Date',v.iso,v.iso?_wk3D(_wiFmt(v.iso+'T12:00:00')):'—',(stI.delivered?' done':'')+(stI.late?' late':'')+(v.est?' estd':''),v.est?'Εκτίμηση άφιξης CD (Delivery−1) — κλικ για πραγματική':'Ημ. άφιξης στο Cross-Dock'), name:'<span class="wi2-nw">Cross-Dock <span class="wk3-vsb">VS</span></span>', sub:'', title:'Cross-Dock Βέροια', right:iright});
    } else {
      const id2=_wi2Loc(f2['Delivery Summary']||f2['Client Name']||f2['Client Summary']||'—','Παράδοση',f2._stopsD); const idIso=f2['Delivery DateTime']||'';
      idel=_wi2Card({cls:stI.late?'late':stI.delivered?'ok':'', date:_wi2Date(imp.id,'Delivery DateTime',idIso,idIso?_wk3D(_wiFmt(idIso)):'—',(stI.delivered?' done':'')+(stI.late?' late':''),'Ημ. παράδοσης εισαγωγής'+(stI.delivered?' — παραδόθηκε ✓':'')+(stI.late?' — ΚΑΘΥΣΤΕΡΗΣΕ':'')), name:id2.name+(stI.late?'<span class="wi2-late">! καθυστέρηση</span>':''), sub:id2.sub, extra:_wk3MoreStops(f2['Delivery Summary']||'',f2._stopsD,'del'), right:iright});
    }
    impInner=`${iload}<span class="wi2-arrow">→</span>${idel}`;
  } else if(gapCell){
    impInner=`<div class="wi2-gapbox${urg?' urg':''}" title="Κενό γυρισμού — ιδιόκτητος γύρος χωρίς φορτίο επιστροφής${urg?` · ΕΠΕΙΓΟΝ: παράδοση ${_wi2When(pf,today)}, χωρίς εισαγωγή`:''}. Κλικ: νέα παραγγελία εισαγωγής (ή σύρε υπάρχουσα εισαγωγή εδώ)">ΚΕΝΟ IMPORT${urg?`<small>ΕΠΕΙΓΟΝ</small>`:''}</div>`;
  } else if(parCell){
    impInner=`<div class="wi2-void navy" title="Ανατεθειμένο σε συνεργάτη — δεν αναμένεται δικό μας σκέλος επιστροφής"></div>`;
  } else {
    impInner=`<div class="wi2-void" title="Σύρε εισαγωγή εδώ για ταίριασμα"></div>`;
  }

  // Feeds (owner 9/8): the national legs show the PLACE from now on; the
  // carrier is filled later from Weekly National. Non-VS = «—» (no leg).
  const feedL=vsExp?(()=>{ const lo=_wi2Loc(fromStr,'Φόρτωση',pf._stopsL);
    return _wi2Card({date:_wi2Date(pid,'Loading DateTime',loadIso,loadIso?_wk3D(_wiFmt(loadIso)):'—','','Εθνικό σκέλος: ημ. φόρτωσης από αρχικό πελάτη'), name:lo.name, sub:lo.sub, extra:_wk3MoreStops(fromStr,pf._stopsL,'load')}); })()
    :`<span class="wi2-dash" title="Χωρίς εθνικό σκέλος — δεν είναι Veroia Switch">—</span>`;
  const feedR=(imp&&impVS)?(()=>{ const f2=imp.fields; const de2=_wi2Loc(f2['Delivery Summary']||'—','Παράδοση',f2._stopsD); const dIso=f2['Delivery DateTime']||'';
    return _wi2Card({date:_wi2Date(imp.id,'Delivery DateTime',dIso,dIso?_wk3D(_wiFmt(dIso)):'—','','Εθνικό σκέλος: ημ. τελικής διανομής'), name:de2.name, sub:de2.sub, extra:_wk3MoreStops(f2['Delivery Summary']||'',f2._stopsD,'del')}); })()
    :`<span class="wi2-dash" title="Χωρίς εθνικό σκέλος">—</span>`;

  const rowCls=['wk3-row',!row.saved?'wi2-un':'',urg?'wi2-rowurg':gapCell?'wi2-gap':'',stF.delivered&&!stF.late?'wk3-done':''].filter(Boolean).join(' ');
  return `
  <div id="wi-row-${row.id}" data-row-id="${row.id}" class="${rowCls}">
    <div class="wk3-num">${i+1}${isGroup?`<button class="wk3-grpb" title="Groupage ×${exps.length} — κλικ: μέλη ομάδας (βάση: το πρώτο-παραδιδόμενο)" onclick="event.stopPropagation();_wiToggleGroup(${row.id})">×${exps.length}</button>`:''}<span class="wi-sync" id="wi-sync-${row.id}"></span></div>
    <div class="wk3-feed l" title="${vsExp?'Εθνικό σκέλος προς Βέροια — φόρτωση από τον αρχικό πελάτη. Ο μεταφορέας συμπληρώνεται στο Weekly National.':'Χωρίς εθνικό σκέλος — δεν είναι Veroia Switch'}">${feedL}${vsExp?_wi2Carrier(pid):''}</div>
    <div class="wk3-leg${isGroup?' grp':''}" style="cursor:pointer" title="${isGroup?'Κλικ: καρτέλα ρότας ομάδας · δεξί κλικ: groupage/ρότα':'Κλικ: άνοιγμα φόρμας παραγγελίας · δεξί κλικ: groupage/ρότα'}" oncontextmenu="_wiCtx(event,${row.id})" onclick="event.stopPropagation();${isGroup?`_wiRota(${row.id})`:`_wk3Edit('${pid}')`}">${loadCard}<span class="wi2-arrow">→</span>${delCard}</div>
    <div class="wk3-assign" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" role="button" tabindex="0" onclick="event.stopPropagation();_wiOpenPopover(event,${row.id})">
      ${isGroup
        ?`<button class="wk3-prt l" title="Εκτύπωση ομάδας — ${exps.length} έγγραφα σε ένα πακέτο" onclick="event.stopPropagation();_wiPrintGroup(${row.id})">⎙</button>`
        :`<button class="wk3-prt l" title="Εκτύπωση εντολής (export) — δεξί κλικ: κοινή χρήση" data-shq="${printSheetQuery(row.orderIds[0],'export',!!(row.partnerId||row.partnerLabel))}" data-shtitle="Εντολή εξαγωγής — W${WINTL.week}" onclick="event.stopPropagation();_wiPrint(${row.id},'export')">⎙</button>`}
      ${pill}
      ${row.importId?`<button class="wk3-prt r" title="Εκτύπωση εντολής (import) — δεξί κλικ: κοινή χρήση" data-shq="${printSheetQuery(row.importId,'import',!!(row.partnerId||row.partnerLabel))}" data-shtitle="Εντολή εισαγωγής — W${WINTL.week}" onclick="event.stopPropagation();_wiPrint(${row.id},'import')">⎙<sup>I</sup></button>`:''}
    </div>
    <div class="wk3-leg imp${gapCell?' gap':''}${parCell?' bgap':''}" id="wi-ci-${row.id}"
         ${imp?'style="cursor:pointer"':''}
         onclick="event.stopPropagation();${imp?`_wk3Edit('${row.importId}')`:parCell?``:`_wiNewImport(${row.id})`}"
         ondragover="event.preventDefault();document.getElementById('wi-ci-${row.id}').classList.add('dh')"
         ondragleave="document.getElementById('wi-ci-${row.id}').classList.remove('dh')"
         ondrop="event.stopPropagation();_wiDropOnRow(event,${row.id})">${impInner}</div>
    <div class="wk3-feed r" title="${(imp&&impVS)?'Εθνική διανομή από Βέροια — τελικός προορισμός. Ο μεταφορέας συμπληρώνεται στο Weekly National.':'Χωρίς εθνικό σκέλος'}">${feedR}${(typeof impVS2!=="undefined"?impVS2:(imp&&impVS))?_wi2Carrier(imp.id):''}</div>
  </div>`;
}

/* ── PANEL HTML ────────────────────────────────────────────────────── */

/* ── DROPDOWN ──────────────────────────────────────────────────────── */

// Global click handler for dropdown options
document.addEventListener('click',e=>{
  const o=e.target.closest('.wi-sdo');
  if(o){
    const l=o.closest('.wi-sdl');if(!l) return;
    _wiSdP(l.id.replace('wsd-l-',''),o.dataset.id,o.dataset.lbl||o.textContent.trim());
    e.stopPropagation();return;
  }
  if(!e.target.closest('.wi-sd'))
    document.querySelectorAll('.wi-sdl').forEach(el=>el.style.display='none');
});

function _wiSdO(uid){
  document.querySelectorAll('.wi-sdl').forEach(el=>{
    if(el.id!=='wsd-l-'+uid) el.style.display='none';
  });
  const inp=document.querySelector(`#wsd-${uid} .wi-sdi`);
  const lst=document.getElementById('wsd-l-'+uid);
  if(!inp||!lst) return;
  const r=inp.getBoundingClientRect();
  // Popover lists carry an availability line per option (frame 189:769) —
  // they need room to read it; the row-panel lists keep the input width.
  const wide=uid.includes('_p_');
  const w=Math.min(wide?Math.max(r.width,440):Math.max(r.width,190), window.innerWidth-r.left-12);
  Object.assign(lst.style,{
    display:'block',
    left:`${r.left}px`,
    top:`${r.bottom+2}px`,
    width:`${w}px`,
  });
  lst.querySelectorAll('.wi-sdo').forEach(el=>el.style.display='');
}
function _wiSdF(uid,q){
  const lst=document.getElementById('wsd-l-'+uid);
  if(!lst||lst.style.display==='none') _wiSdO(uid);
  const ql=q.toLowerCase();
  lst.querySelectorAll('.wi-sdo').forEach(el=>{
    el.style.display=(el.dataset.lbl||el.textContent).toLowerCase().includes(ql)?'':'none';
  });
}
function _wiSdP(uid,recId,label){
  const v=document.getElementById('wsd-v-'+uid);if(v) v.value=recId;
  const i=document.querySelector(`#wsd-${uid} .wi-sdi`);if(i) i.value=label;
  const l=document.getElementById('wsd-l-'+uid);if(l) l.style.display='none';
  const parts=uid.split('_'),px=parts[0],rowId=parseInt(parts[parts.length-1]);
  const fm={tk:'truckId',   tl:'trailerId',   dr:'driverId',   pt:'partnerId'};
  const lm={tk:'truckLabel',tl:'trailerLabel',dr:'driverLabel',pt:'partnerLabel'};
  if(fm[px]&&!isNaN(rowId)){
    _wiField(rowId,fm[px],recId);
    _wiField(rowId,lm[px],label);
    if(px==='tk'||px==='dr') _wi2PopWarn(rowId);
  }
}
// Inline same-day warning (frame 189:811): shown the moment a truck/driver is
// picked — the save still asks for the T1 confirm; this only removes the surprise.
function _wi2PopWarn(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);
  const el=document.getElementById('wi2-pop-warn-'+rowId); if(!row||!el) return;
  const c=(row.truckId||row.driverId)?_wiSameDayConflict(row):null;
  el.classList.toggle('on',!!c);
  el.querySelector('span').textContent=c?c+' — η αποθήκευση θα ζητήσει επιβεβαίωση.':'';
}

/* ── STATE ─────────────────────────────────────────────────────────── */
function _wiField(rowId,field,val){
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(row) row[field]=val;
}
function _wiRepaintRow(rowId){
  const el=document.getElementById('wi-row-'+rowId);
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!el||!row){_wiPaint();return;}
  // Keep the visible row number (assigned per day in _wiAllRowsHTML), not the
  // position in WINTL.rows.
  const no=parseInt(WINTL._rowNo?.[row.orderIds[0]],10);
  el.outerHTML=_wiRowHTML(row,isNaN(no)?0:no-1);
  requestAnimationFrame(_wi2Balance); // the fresh row's names need their fit pass too
}

/* ── DRAG & DROP ───────────────────────────────────────────────────── */
window._wiDragging=null;

// Drag from import ROWS (new — replaces shelf drag)
function _wiImpDragStart(e,impId){
  // Block drag if import is already matched to an export
  const imp=WINTL.rows.find(r=>r.type==='import'&&r.orderId===impId);
  if(imp&&imp.matchedTo){
    e.preventDefault();
    toast('Αφαίρεσε πρώτα το ταίριασμα της εισαγωγής','warn');
    return;
  }
  window._wiDragging=impId;
  e.dataTransfer.effectAllowed='move';
  e.currentTarget.style.opacity='0.5';
  setTimeout(()=>{ if(e.currentTarget) e.currentTarget.style.opacity=''; },0);
}

// Legacy compat (shelf chips no longer exist but keep for safety)
function _wiDragStart(e,impId){
  window._wiDragging=impId;
  e.dataTransfer.effectAllowed='move';
}

// Unmatch an import
async function _wiUnmatch(impId){
  // Find export row that has this import
  const expRow=WINTL.rows.find(r=>r.type==='export'&&r.importId===impId);
  if(!expRow) return;
  await _wiRemoveImport(expRow.id);
}

// Κενό κουτί εισαγωγής → νέα παραγγελία εισαγωγής, ήδη δεμένη με το export που
// την άνοιξε (owner 3/9). Δεν γράφεται τίποτα εδώ: κρατάμε ΠΟΙΟ export περιμένει
// και το ταίριασμα εκτελείται μόνο αν η φόρμα όντως δημιουργήσει εγγραφή.
function _wiNewImport(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!row) return;
  if(row.importId){ toast('Η γραμμή έχει ήδη ταιριασμένη εισαγωγή','warn'); return; }
  if(typeof openIntlEditWith!=='function'){ toast('Η φόρμα παραγγελίας δεν είναι διαθέσιμη','warn'); return; }
  window._wiPendingMatch={rowId,at:Date.now()};
  openIntlEditWith(null,{Type:'International',Direction:'Import'});
}

// Καλείται από το orders_intl ΜΟΝΟ μετά από επιτυχή δημιουργία. Τρεις φύλακες,
// γιατί η φόρμα μπορεί να ακυρωθεί και να δημιουργηθεί άσχετη παραγγελία μετά:
// σωστή κατεύθυνση, ίδια σελίδα, και το export να μην έχει προλάβει να ταιριάξει.
async function _wiConsumePendingMatch(newId,fields){
  const p=window._wiPendingMatch; window._wiPendingMatch=null;
  if(!p||!newId) return;
  if((fields||{})['Direction']!=='Import') return;
  if(typeof currentPage!=='undefined'&&currentPage!=='weekly_intl') return;
  if(Date.now()-p.at>30*60*1000) return;
  const row=WINTL.rows.find(r=>r.id===p.rowId);
  if(!row||row.importId) return;
  await _wiSaveImportMatch(p.rowId,newId);
}

// Fullscreen on #content only (owner 4/9): the browser hides sidebar/topbar for
// us, Esc exits natively. No layout of our own to maintain.
function _wiFullscreen(){
  const el=document.querySelector('.wk3.wi2 .wk3-sheet')||document.getElementById('content')||document.documentElement;
  if(document.fullscreenElement){ document.exitFullscreen?.(); return; }
  (el.requestFullscreen||el.webkitRequestFullscreen)?.call(el);
}
document.addEventListener('fullscreenchange',()=>{
  const b=document.getElementById('wi-fs'); if(b) b.textContent=document.fullscreenElement?'Έξοδος':'Πλήρης οθόνη';
  document.body.classList.toggle('wi-fs',!!document.fullscreenElement);
});

// Print import
function _wiPrintImp(impId, hasPartner){
  printOrderSheet(impId, 'import', !!hasPartner);
}

// Drop on compact row import cell → auto-save
async function _wiDropOnRow(e,rowId){
  e.preventDefault();
  document.getElementById('wi-ci-'+rowId)?.classList.remove('dh');
  const impId=window._wiDragging;if(!impId) return;
  window._wiDragging=null;
  await _wiSaveImportMatch(rowId,impId);
}

// Drop on panel drop zone → auto-save
async function _wiDropOnPanel(e,rowId){
  e.preventDefault();
  document.getElementById('wi-piz-'+rowId)?.classList.remove('dh');
  const impId=window._wiDragging;if(!impId) return;
  window._wiDragging=null;
  await _wiSaveImportMatch(rowId,impId);
}

// Auto-save import match directly to ORDERS record
async function _wiSaveImportMatch(rowId,impId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;

  // Lock check: verify import is still unmatched on server
  try {
    const importRec = await atGetOne(TABLES.ORDERS, impId);
    const existingMatch = importRec.fields?.['Matched Export ID'] || importRec.fields?.['Matched Import ID'];
    if (existingMatch) {
      if (typeof showErrorToast === 'function') showErrorToast('Η εισαγωγή ταιριάστηκε ήδη από άλλον χρήστη — ανανέωση…', 'warn');
      else toast('Η εισαγωγή ταιριάστηκε ήδη από άλλον χρήστη — ανανέωση…', 'warn');
      await renderWeeklyIntl();
      return;
    }
  } catch(e) {
    // Best-effort lock check: if it fails we deliberately proceed (the real
    // conflict guard is the optimistic-lock on save). Track it so a pattern of
    // lock-check failures is visible, but do NOT block the match.
    if (typeof logError === 'function') logError(e, '_wiSaveImportMatch: import lock check (proceeding)');
    else console.warn('Import lock check failed, proceeding:', e.message);
  }

  // Lock check: verify export doesn't already have a matched import on server
  try {
    const exportRec = await atGetOne(TABLES.ORDERS, row.orderIds[0]);
    const existingExpMatch = exportRec.fields?.['Matched Import ID'];
    if (existingExpMatch && existingExpMatch !== impId) {
      if (typeof showErrorToast === 'function') showErrorToast('Η εξαγωγή έχει ήδη άλλη ταιριασμένη εισαγωγή — ανανέωση…', 'warn');
      else toast('Η εξαγωγή έχει ήδη άλλη ταιριασμένη εισαγωγή — ανανέωση…', 'warn');
      await renderWeeklyIntl();
      return;
    }
  } catch(e) {
    // Same best-effort policy as the import lock check above: track, don't block.
    if (typeof logError === 'function') logError(e, '_wiSaveImportMatch: export lock check (proceeding)');
    else console.warn('Export lock check failed, proceeding:', e.message);
  }

  // Optimistic UI update
  const oldImp=row.importId;
  row.importId=impId;

  // Clear previous match on any other export row
  WINTL.rows.forEach(r=>{
    if(r.type==='export'&&r.id!==rowId&&r.importId===impId) r.importId=null;
  });

  // Update import row matchedTo
  WINTL.rows.forEach(r=>{
    if(r.type==='import'){
      if(r.orderId===impId) r.matchedTo=row.orderId;
      else if(r.matchedTo===row.orderId&&oldImp&&r.orderId!==oldImp) r.matchedTo=null;
    }
  });

  _wiPaint();

  // T3 (Wave 2): the optimistic paint above shows «matched» BEFORE the server
  // write. The sync slot tells the truth per row: ⟳ writing → ✓ saved / ⚠
  // failed (kept visible — this was PREMORTEM T3: UI said matched, DB didn't).
  _wiSync('wi-sync-'+rowId,'pend','Αποθήκευση ταιριάσματος…');
  let matchFailed=false;

  // Save to ALL export orders in group
  for(const orderId of row.orderIds){
    try{
      const res=await atSafePatch(TABLES.ORDERS,orderId,{'Matched Import ID':impId});
      if(res?.conflict){ toast('Η εγγραφή άλλαξε από άλλον χρήστη — ανανέωση…','warn'); await renderWeeklyIntl(); return; }
      if(res?.error) throw new Error(res.error.message||res.error.type);
      // Central sync — matching link can affect downstream planning
      if (typeof syncOrderDownstream === 'function') {
        syncOrderDownstream(orderId, { source: 'intl', changedFields: ['Matched Import ID'], skipPA: true, skipVS: true, skipGRP: true, skipPL: true })
          .catch(e => console.warn('[wi match sync]', e));
      }
    }catch(err){
      matchFailed=true;
      console.error('Import match save failed:',err.message);
      toast('Το ταίριασμα δεν γράφτηκε: '+err.message.slice(0,50),'warn');
    }
  }
  _wiSync('wi-sync-'+rowId, matchFailed?'err':'ok',
    matchFailed?'Το ταίριασμα ΔΕΝ γράφτηκε στη βάση — ξαναπροσπάθησε ή κάνε Ανανέωση':'Αποθηκεύτηκε');

  // Ταίριασμα σε ΗΔΗ ανατεθειμένο export (owner 13/8): το import αναλαμβάνεται
  // από το ίδιο όχημα — κληρονομεί την ανάθεση στη βάση. Το κόμιστρο import
  // (partner) μπαίνει αργότερα από το popover, δεν εφευρίσκεται εδώ.
  if(!matchFailed && (row.truckId||row.partnerId)){
    const inh=row.partnerId
      ?{ 'Partner':[row.partnerId],'Is Partner Trip':true,
         'Partner Truck Plates':row.partnerPlates||'',
         'Status':'Assigned','Truck':[],'Trailer':[],'Driver':[] }
      :{ 'Truck':[row.truckId],'Trailer':row.trailerId?[row.trailerId]:[],
         'Driver':row.driverId?[row.driverId]:[],
         'Is Partner Trip':false,'Status':'Assigned','Partner':[],'Partner Truck Plates':'' };
    try{
      const ri=await atSafePatch(TABLES.ORDERS,impId,inh);
      if(ri?.error) throw new Error(ri.error.message||ri.error.type);
    }catch(err){ console.warn('[wi match] import assignment inherit:',err.message); }
  }

  // P&L feed (5/9, N2): a match writes 'Matched Import ID' through
  // syncOrderDownstream with skipPL:true (core/rt-feed.js says why — matching
  // alone isn't a P&L trigger), so rtOnOrderSaved never ran for a match on its
  // own. Call it directly: with N1 (worker/src/rt-rules.mjs) it attaches the
  // import's leg to the export's existing RT instead of leaving it single-leg
  // (measured 5/9: 9 of 46 matched pairs stuck that way). Non-blocking.
  if(!matchFailed && typeof rtOnOrderSaved === 'function'){
    for(const orderId of row.orderIds){
      rtOnOrderSaved(orderId).catch(e => console.warn('[wi match] rt sync:', e && e.message));
    }
  }
}

async function _wiRemoveImport(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!row){ toast('Η γραμμή δεν βρέθηκε','warn'); return; }
  if(!row.importId){ toast('Δεν υπάρχει ταιριασμένη εισαγωγή','warn'); return; }
  const impId=row.importId;
  row.importId=null;

  // Update import row UI
  const impRow=WINTL.rows.find(r=>r.type==='import'&&r.orderId===impId);
  if(impRow) impRow.matchedTo=null;

  _wiPaint();
  _wiSync('wi-sync-'+rowId,'pend','Αφαίρεση ταιριάσματος…'); // T3

  // Clear from ORDERS (patch export order)
  let ok=true;
  for(const orderId of row.orderIds){
    try{
      const res=await atSafePatch(TABLES.ORDERS,orderId,{'Matched Import ID':''});
      if(res?.error){ ok=false; throw new Error(res.error.message||res.error.type); }
      if (typeof syncOrderDownstream === 'function') {
        syncOrderDownstream(orderId, { source: 'intl', changedFields: ['Matched Import ID'], skipPA: true, skipVS: true, skipGRP: true, skipPL: true })
          .catch(e => console.warn('[wi unmatch sync]', e));
      }
    }catch(err){
      toast('Σφάλμα: '+err.message.slice(0,60),'warn');
      ok=false;
    }
  }
  _wiSync('wi-sync-'+rowId, ok?'ok':'err',
    ok?'Αφαιρέθηκε':'Η αφαίρεση ΔΕΝ γράφτηκε στη βάση — κάνε Ανανέωση'); // T3
  if(ok){
    // Ξεταίριασμα = το import δεν ταξιδεύει πια με αυτό το όχημα (owner 13/8):
    // καθαρίζεται η κληρονομημένη ανάθεσή του για να μην μείνει ορφανή.
    try{
      const rc=await atSafePatch(TABLES.ORDERS,impId,{
        'Truck':[],'Trailer':[],'Driver':[],'Partner':[],
        'Is Partner Trip':false,'Partner Truck Plates':'','Status':'Pending',
      });
      if(rc?.error) throw new Error(rc.error.message||rc.error.type);
    }catch(err){ console.warn('[wi unmatch] import assignment clear:',err.message); }
    // Invalidate cache so next load is fresh
    if(typeof atClearCache==='function') atClearCache(TABLES.ORDERS);
    toast('Το ταίριασμα αφαιρέθηκε ✓');
    // P&L feed (5/9, N2): the unmatch above went through syncOrderDownstream
    // with skipPL:true, same reason the match never reached the feed either —
    // so the import's leg was never detached and stayed on the export's RT
    // forever. rtOnImportUnmatched (core/rt-feed.js) removes just that leg via
    // DELETE /costs/rt/:id/legs (N1); non-blocking, toasts on its own failure.
    if(typeof rtOnImportUnmatched === 'function'){
      rtOnImportUnmatched(row.orderIds[0], impId).catch(e => console.warn('[wi unmatch] rt sync:', e && e.message));
    }
  }
}

/* ── AUTO-MATCH ALGORITHM ─────────────────────────────────────────── */
// Distance via canonical haversineKm (core/utils.js); local copy removed.

async function _wiAutoMatch() {
  const {data, rows} = WINTL;
  const expRows = rows.filter(r => r.type === 'export' && !r.importId);
  const impRows = rows.filter(r => r.type === 'import' && !r.matchedTo);
  if (!impRows.length || !expRows.length) { toast('Δεν υπάρχουν αταίριαστα ζεύγη'); return; }

  toast('Υπολογισμός ταιριασμάτων…');

  // Load locations with coordinates (from ref data cache)
  await preloadReferenceData();
  const locs = getRefLocations();
  const locMap = {};
  locs.forEach(r => { locMap[r.id] = { lat: r.fields['Latitude'], lng: r.fields['Longitude'], name: r.fields['Name']||'', country: r.fields['Country']||'' }; });

  // Batch-fetch ORDER_STOPS for all orders to get stop locations
  const allOrders = [...data.exports, ...data.imports];
  const allStopIds = allOrders.flatMap(r => r.fields['ORDER STOPS'] || []);
  const stopsByOrder = {}; // orderId → {Loading: [locId,...], Unloading: [locId,...]}
  if (allStopIds.length) {
    try {
      const chunks = [];
      // 90 per chunk, matching the sibling batch loop above (the other OR() builder
      // uses 90). Airtable's OR() formula has a practical length ceiling; 90 stays
      // safely under it. Keep both batchers on the same number.
      for (let i = 0; i < allStopIds.length; i += 90) chunks.push(allStopIds.slice(i, i + 90));
      const allStops = [];
      for (const chunk of chunks) {
        const f = `OR(${chunk.map(id => `RECORD_ID()="${id}"`).join(',')})`;
        const recs = await atGetAll(TABLES.ORDER_STOPS, { filterByFormula: f }, false);
        allStops.push(...recs);
      }
      for (const s of allStops) {
        const pid = (s.fields[F.STOP_PARENT_ORDER] || [])[0];
        if (!pid) continue;
        if (!stopsByOrder[pid]) stopsByOrder[pid] = { Loading: [], Unloading: [] };
        const type = s.fields[F.STOP_TYPE];
        if (type === 'Loading' || type === 'Unloading') {
          stopsByOrder[pid][type].push(s);
        }
      }
      // Sort each by stop number
      for (const pid of Object.keys(stopsByOrder)) {
        stopsByOrder[pid].Loading.sort((a, b) => (a.fields[F.STOP_NUMBER] || 0) - (b.fields[F.STOP_NUMBER] || 0));
        stopsByOrder[pid].Unloading.sort((a, b) => (a.fields[F.STOP_NUMBER] || 0) - (b.fields[F.STOP_NUMBER] || 0));
      }
    } catch (e) { console.warn('Auto-match: ORDER_STOPS fetch failed', e); }
  }

  // Get coords from ORDER_STOPS for an order
  const _getCoordsEx = (orderId, fields, stopType) => {
    const stops = stopsByOrder[orderId]?.[stopType];
    if (stops && stops.length) {
      const locArr = stops[0].fields[F.STOP_LOCATION];
      const locId = Array.isArray(locArr) ? locArr[0] : null;
      if (locId && locMap[locId]) {
        const loc = locMap[locId];
        if (loc.lat && loc.lng) return loc;
      }
    }
    return null;
  };

  // Score each export-import pair
  const suggestions = [];
  for (const expRow of expRows) {
    const exp = data.exports.find(r => r.id === expRow.orderIds[0]);
    if (!exp) continue;
    const ef = exp.fields;
    const expDelLoc = _getCoordsEx(exp.id, ef, 'Unloading');
    const expDelDate = toLocalDate(ef['Delivery DateTime']);

    let bestImp = null, bestScore = 0, bestDist = Infinity;
    for (const impRow of impRows) {
      if (impRow.matchedTo) continue;
      const imp = data.imports.find(r => r.id === impRow.orderId);
      if (!imp) continue;
      const imf = imp.fields;
      let score = 0;
      let dist = Infinity;

      // DISTANCE: export delivery → import loading (max 70 points — primary factor)
      const impLoadLoc = _getCoordsEx(imp.id, imf, 'Loading');
      if (expDelLoc && impLoadLoc) {
        dist = haversineKm(expDelLoc.lat, expDelLoc.lng, impLoadLoc.lat, impLoadLoc.lng);
        if (dist <= 50)       score += 70;  // <50km = same city
        else if (dist <= 150) score += 55;  // <150km = nearby
        else if (dist <= 300) score += 40;  // <300km = same region
        else if (dist <= 500) score += 20;  // <500km = reachable
      }

      // DATE: import loading within ±1 day of export delivery (max 30 points)
      const impLoadDate = toLocalDate(imf['Loading DateTime']);
      if (expDelDate && impLoadDate) {
        const diff = Math.abs(new Date(expDelDate+'T12:00:00') - new Date(impLoadDate+'T12:00:00')) / 864e5;
        if (diff <= 1) score += 30;
        else if (diff <= 2) score += 15;
      }

      if (score > bestScore || (score === bestScore && dist < bestDist)) {
        bestScore = score; bestImp = impRow; bestDist = dist;
      }
    }

    if (bestImp && bestScore >= 40) {
      suggestions.push({ expRow, impRow: bestImp, score: bestScore, dist: bestDist });
      bestImp.matchedTo = '__suggested__';
    }
  }

  // Reset temp marks
  suggestions.forEach(s => { s.impRow.matchedTo = null; });

  if (!suggestions.length) { toast('Δεν βρέθηκαν καλά ταιριάσματα (score <40)'); return; }

  // Show confirmation dialog with distance info
  const imp_label = (impRow) => {
    const imp = data.imports.find(r => r.id === impRow.orderId);
    return imp ? _wiCut(_wiClean(imp.fields['Loading Summary'] || ''), 25) : '?';
  };
  const exp_label = (expRow) => {
    const exp = data.exports.find(r => r.id === expRow.orderIds[0]);
    return exp ? _wiCut(_wiClean(exp.fields['Delivery Summary'] || ''), 25) : '?';
  };

  const msg = suggestions.map((s, i) =>
    `${i+1}. ${exp_label(s.expRow)} ↔ ${imp_label(s.impRow)} (${s.dist < 9999 ? Math.round(s.dist)+'km' : '?'} · score ${s.score})`
  ).join('\n');

  if (!(await confirmAction(`Το αυτόματο ταίριασμα βρήκε ${suggestions.length} ζεύγη:\n\n${msg}\n\nΕφαρμογή;`, { title: 'Αυτόματο ταίριασμα', confirmLabel: 'Εφαρμογή' }))) return;

  // Apply all matches
  for (const s of suggestions) {
    await _wiSaveImportMatch(s.expRow.id, s.impRow.orderId);
  }

  toast(`${suggestions.length} ταιριάσματα εφαρμόστηκαν ✓`, 'success');
}

/* ── SAVE ASSIGNMENT ───────────────────────────────────────────────── */
/* ── POPOVER ─────────────────────────────────────────────────── */
/* ── POPOVER (frame w4-assign-popover 189:745) ───────────────────────── */
function _wiOpenPopover(e,rowId){
  e.stopPropagation();
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const {trucks,trailers,drivers,partners}=WINTL.data;
  const o=WINTL.data.exports.find(r=>r.id===row.orderIds[0])||WINTL.data.imports.find(r=>r.id===row.orderId);
  const f=o?.fields||{};
  const subT=`${f['Loading DateTime']?_wk3D(_wiFmt(f['Loading DateTime']))+' ':''}${_wiClean(f['Loading Summary']||f['Client Name']||'—')} → ${f['Delivery DateTime']?_wk3D(_wiFmt(f['Delivery DateTime']))+' ':''}${_wiClean(f['Delivery Summary']||'—')} · ${('Total Pallets' in f)?f['Total Pallets']+'p':'— p'}`;
  const loadD=toLocalDate(f['Loading DateTime']||'');

  // Π2 (Wave 2): weekly load per truck/driver, from rows ALREADY in memory —
  // zero new fetches. The dropdown answers «πού είναι ήδη πιασμένο» inline,
  // which today lives in phones/Excel/memory (00 §3, gap G1).
  const _busy={};
  WINTL.rows.forEach(r=>{
    if(r.id===rowId) return;
    const ro=WINTL.data.exports.find(x=>x.id===r.orderIds?.[0])||WINTL.data.imports.find(x=>x.id===r.orderId);
    if(!ro) return;
    const dt=ro.fields['Loading DateTime'];
    const entry={d:dt?toLocalDate(dt):'', end:toLocalDate(ro.fields['Delivery DateTime']||dt||''), dest:_wiClean(ro.fields['Delivery Summary']||ro.fields['Loading Summary']||'')};
    if(r.truckId){(_busy[r.truckId]=_busy[r.truckId]||[]).push(entry);}
    if(r.driverId){(_busy[r.driverId]=_busy[r.driverId]||[]).push(entry);}
  });
  const wd=iso=>{try{return new Date(iso+'T12:00:00').toLocaleDateString('el-GR',{weekday:'short'});}catch{return '';}};
  const dm=iso=>iso?_wk3D(_wiFmt(iso+'T12:00:00')):'';
  // Availability line per option: free → return + next departure (drivers by
  // the owner's X+2 rule, 561/2006); busy → count + legs of this week.
  const avail=(px,id)=>{
    const b=_busy[id];
    if(!b||!b.length) return {free:true,txt:'✓ ελεύθερο — χωρίς ανάθεση αυτή την εβδομάδα'};
    const end=b.map(x=>x.end).filter(Boolean).sort().pop()||'';
    const next=end?(px==='dr'?_wk3AddDays(end,2):_wk3AddDays(end,1)):'';
    if(loadD&&next&&next<=loadD) return {free:true,txt:`✓ ελεύθερο — επιστρέφει ${wd(end)} ${dm(end)}, διαθέσιμο για φόρτωση ${dm(next)}${px==='dr'?' (Χ+2)':''}`};
    return {free:false,txt:`δεσμ. ${b.length}× αυτή την εβδομάδα · ${b.slice(0,2).map(x=>`${wd(x.d)} → ${escapeHtml(x.dest.split(',')[0])}`).join(' · ')}`};
  };
  const mkDrop=(px,arr,selId,ph,note)=>{
    const uid=`${px}_p_${rowId}`;
    const sel=arr.find(x=>x.id===selId)?.label||'';
    const showAv=(px==='tk'||px==='dr');
    const opts=arr.map(x=>{
      const l=(x.label||'').replace(/"/g,'&quot;');
      const a=showAv?avail(px,x.id):null;
      const s=a?`<div class="wi-sdo-sub${a.free?' free':''}">${a.txt}</div>`:'';
      return `<div class="wi-sdo${a&&!a.free?' wi-sdo--busy':''}" data-id="${x.id}" data-lbl="${l}">${l}${s}</div>`;
    }).join('');
    return `<div class="wi-sd" id="wsd-${uid}">
      <input type="text" class="wi-pop-inp wi-sdi" placeholder="${ph}" value="${sel.replace(/"/g,'&quot;')}"
             oninput="_wiSdF('${uid}',this.value)" onfocus="_wiSdO('${uid}')" autocomplete="off"/>
      <input type="hidden" id="wsd-v-${uid}" value="${selId||''}"/>
      <div id="wsd-l-${uid}" class="wi-sdl">${opts}${note?`<div class="wi2-sd-note">${note}</div>`:''}</div>
    </div>`;
  };
  const imp=row.importId?WINTL.data.imports.find(r=>r.id===row.importId):null;

  const pop=document.getElementById('wi-popover');
  pop.innerHTML=`
    <div class="wi-pop-header">
      <div class="wi-pop-title">Ανάθεση</div>
      <div class="wi-pop-subtitle">${subT}</div>
      <button class="wi-pop-close" onclick="_wiClosePopover()" title="Κλείσιμο">✕</button>
    </div>
    <div class="wi-pop-body">
      <div class="wi-pop-section-lbl">ΔΙΚΟΣ ΣΤΟΛΟΣ</div>
      <div class="wi-pop-row">
        <div class="wi-pop-field"><span class="wi-pop-lbl">Φορτηγό</span>${mkDrop('tk',trucks,row.truckId,'Πινακίδα…')}</div>
        <div class="wi-pop-field"><span class="wi-pop-lbl">Ρυμούλκα</span>${mkDrop('tl',trailers,row.trailerId,'Πινακίδα…')}</div>
        <div class="wi-pop-field"><span class="wi-pop-lbl">Οδηγός</span>${mkDrop('dr',drivers,row.driverId,'Όνομα…','Οδηγοί: ο κανόνας 561/2006 τηρείται — επιστροφή Χ → επόμενη αναχώρηση Χ+2 (⚡Χ+1 μόνο κατ΄ εξαίρεση)')}</div>
      </div>
      <div class="wi-pop-section-lbl">ΣΥΝΕΡΓΑΤΗΣ</div>
      <div class="wi-pop-row">
        <div class="wi-pop-field" style="flex:2"><span class="wi-pop-lbl">Εταιρεία</span>${mkDrop('pt',partners,row.partnerId,'Εταιρεία…')}</div>
        <div class="wi-pop-field" style="flex:0 0 150px"><span class="wi-pop-lbl">Πινακίδες</span><input class="wi-pop-inp" type="text" placeholder="π.χ. ΙΑΒ 1099" id="wi-pop-pp-${rowId}" value="${escapeHtml(row.partnerPlates||'')}"/></div>
        <div class="wi-pop-field" style="flex:0 0 130px"><span class="wi-pop-lbl">Κόμιστρο εξαγωγής €</span><input class="wi-pop-inp" type="number" step="0.01" placeholder="0.00" id="wi-pop-rate-exp-${rowId}" value="${row.partnerRate||''}"/></div>
      </div>
      <div class="wi-pop-row" style="align-items:center">
        <div class="wi-pop-field" style="flex:0 0 150px${row.importId?'':';opacity:.45'}"><span class="wi-pop-lbl">Κόμιστρο εισαγωγής €</span><input class="wi-pop-inp" type="number" step="0.01" placeholder="${row.importId?'0.00':'—'}" id="wi-pop-rate-imp-${rowId}" value="${row.importId?(row.partnerRateImp||''):''}" ${row.importId?'':'disabled'}/></div>
        <span class="wi2-pop-note">${row.importId?'κόμιστρο του σκέλους εισαγωγής (συνεργάτης)':'ενεργό μόνο με ταιριασμένη εισαγωγή'}</span>
      </div>
    </div>
    <div id="wi-lane-${rowId}" class="wi-lane-hist"></div>
    <div id="wi2-pop-warn-${rowId}" class="wi2-pop-warn"><b>⚠</b><span></span></div>
    ${row.type==='export'?`<div class="wi-pop-section-lbl wi2-pop-sec">ΤΑΙΡΙΑΣΜΕΝΗ ΕΙΣΑΓΩΓΗ</div>
    <div id="wi-piz-${rowId}" class="wi2-piz"
         ondragover="event.preventDefault();this.classList.add('dh')" ondragleave="this.classList.remove('dh')"
         ondrop="event.stopPropagation();_wiDropOnPanel(event,${rowId})">${imp
      ?`<div class="wi2-ichip"><span>${_wiClean(imp.fields['Loading Summary']||'—')} → ${_wiClean(imp.fields['Delivery Summary']||'—')}</span><small>${_wiFmt(imp.fields['Loading DateTime'])} → ${_wiFmt(imp.fields['Delivery DateTime'])} · ${('Total Pallets' in imp.fields)?imp.fields['Total Pallets']+' p':'— p'}</small><button class="wk3-unm" title="Αφαίρεση ταιριάσματος" onclick="event.stopPropagation();_wiClosePopover();_wiRemoveImport(${rowId})">×</button></div>`
      :'σύρε εισαγωγή εδώ — ή άφησε κενό: θα μετρηθεί στα «κενά» του tally'}</div>`:''}
    <div class="wi-pop-footer">
      <span class="wi2-pop-sync">sync: ⟳ γράφεται → ✓ γράφτηκε / ⚠ ΔΕΝ γράφτηκε (μένει ορατό)</span>
      ${row.saved?`<button class="wi-pop-cancel" onclick="event.stopPropagation();_wiClear(${rowId}).then(()=>_wiClosePopover())">Καθαρισμός</button>`:''}
      <button class="wi-pop-save" id="wi-pop-btn-${rowId}"
              onclick="event.stopPropagation();_wiSaveFromPopover(${rowId})">
        <div id="wi-pop-spin-${rowId}" class="wi2-spin" style="display:none"></div>
        ${row.saved?'Ενημέρωση ανάθεσης':'Αποθήκευση ανάθεσης'}
      </button>
    </div>`;

  const rect=e.currentTarget.getBoundingClientRect();
  const popW=600, popH=380;
  let left=rect.left-10;
  let top=rect.bottom+6;
  if(left+popW>window.innerWidth-12) left=window.innerWidth-popW-12;
  if(top+popH>window.innerHeight-12) top=rect.top-popH-6;
  if(top<10) top=10;
  Object.assign(pop.style,{display:'block',left:`${Math.max(10,left)}px`,top:`${top}px`});
  pop.dataset.rowId=String(rowId);
  setTimeout(()=>document.addEventListener('click',_wiPopoverOutside,{capture:true}),10);
  _wi2PopWarn(rowId);
  _wiFillLaneHist(rowId,row); // Π3 (Wave 3) — async, hides itself when no data
}

// Π3 (Wave 3): last 3 recorded rates on the SAME lane, under the rate field —
// the live negotiation tool (00 §Β8). Lane = country→country from the
// free-text summaries: deliberately coarse (04 risk: city-level is fragile).
function _wiLaneOf(f){
  // Greek summaries often have no comma (plain supplier name) — the GR side is
  // implicit. Lane = GR + the FOREIGN end's country (last comma token).
  const cc=s=>{const p=String(s||'').split(','); if(p.length<2) return null;
    const t=p.pop().trim().slice(0,16).toUpperCase(); return t||null;};
  const dir=f?.['Direction'];
  const far=dir==='Import'?cc(f?.['Loading Summary']):cc(f?.['Delivery Summary']);
  if(!far) return null;
  return dir==='Import'?far+' → GR':'GR → '+far;
}
async function _wiFillLaneHist(rowId,row){
  const o=WINTL.data.exports.find(x=>x.id===row.orderIds?.[0])||WINTL.data.imports.find(x=>x.id===row.orderId);
  const lane=_wiLaneOf(o?.fields);
  if(!lane||!document.getElementById('wi-lane-'+rowId)) return;
  try{
    if(!WINTL._laneAll){ // one fetch per session, then in-memory
      // Facade quirks, both measured live: numeric `>` in formulas → 422, and
      // DERIVED fields (Loading/Delivery Summary) come back EMPTY when named
      // in fields[] — so filter by checkbox and fetch FULL records (25 rows).
      WINTL._laneAll=(await atGetAll(TABLES.ORDERS,{filterByFormula:`{Is Partner Trip}=1`},false))
        .filter(r=>typeof r.fields['Partner Rate']==='number'&&r.fields['Partner Rate']>0);
      // Post-Supabase, summaries never arrive from the Worker — the main view
      // builds them from ORDER_STOPS; do the same for the history set (once).
      await _wiInjectStopSummaries(WINTL._laneAll);
    }
    const dir=o?.fields['Direction'];
    const hits=WINTL._laneAll
      .filter(r=>r.fields['Direction']===dir&&_wiLaneOf(r.fields)===lane&&!row.orderIds.includes(r.id))
      .sort((a,b)=>(b.fields['Week Number']||0)-(a.fields['Week Number']||0)).slice(0,3);
    const el=document.getElementById('wi-lane-'+rowId);
    if(!el||!hits.length) return;
    el.innerHTML='<span class="wi-lane-title">Ιστορικό γραμμής '+escapeHtml(lane)+' — '+hits.length+' τελευταία κόμιστρα:</span>'+hits.map(r=>{
      const pid=(r.fields['Partner']||[])[0];
      const pn=WINTL.data.partners.find(p=>p.id===pid)?.label||'—';
      return `<span class="wi-lane-item">W${r.fields['Week Number']||'—'} · ${(r.fields['Partner Rate']||0).toLocaleString('el-GR')}€ · ${escapeHtml(_wiCut(pn,18))}</span>`;
    }).join('');
  }catch(e){ console.warn('lane hist:',e); }
}

function _wiPopoverOutside(e){
  const pop=document.getElementById('wi-popover');
  if(pop&&!pop.contains(e.target)&&!e.target.closest('.wi-ca')){
    _wiClosePopover();
  }
}
function _wiClosePopover(){
  const pop=document.getElementById('wi-popover');
  if(pop) pop.style.display='none';
  document.removeEventListener('click',_wiPopoverOutside,{capture:true});
}

async function _wiSaveFromPopover(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!row){return;}
  const syncPop=(p,f,l)=>{
    const uid=`${p}_p_${rowId}`;
    const val=document.getElementById(`wsd-v-${uid}`)?.value||'';
    const lbl=document.querySelector(`#wsd-${uid} .wi-sdi`)?.value||'';
    _tmsLog('syncPop',uid,'val=',val,'lbl=',lbl);
    if(val){row[f]=val;row[l]=lbl;}
  };
  syncPop('tk','truckId','truckLabel');
  syncPop('tl','trailerId','trailerLabel');
  syncPop('dr','driverId','driverLabel');
  syncPop('pt','partnerId','partnerLabel');

  const ppEl=document.getElementById(`wi-pop-pp-${rowId}`);
  if(ppEl) row.partnerPlates=ppEl.value;
  const rateExpEl=document.getElementById(`wi-pop-rate-exp-${rowId}`);
  if(rateExpEl) row.partnerRate=rateExpEl.value;
  const rateImpEl=document.getElementById(`wi-pop-rate-imp-${rowId}`);
  if(rateImpEl) row.partnerRateImp=rateImpEl.value;
  const isPartner=!!row.partnerId;
  if(!isPartner&&!row.truckId){toast('Επίλεξε φορτηγό ή συνεργάτη','warn');return;}
  if(isPartner&&!row.partnerRate){toast('Το κόμιστρο εξαγωγής είναι υποχρεωτικό για συνεργάτη','warn');return;}
  if(isPartner&&row.importId&&!row.partnerRateImp){toast('Το κόμιστρο εισαγωγής είναι υποχρεωτικό για συνεργάτη','warn');return;}
  // T1 (Wave 2): same-day double-booking → soft confirm, never a hard block —
  // the dispatcher may know better (split day, relay), but not silently.
  if(!isPartner){
    const conflict=_wiSameDayConflict(row);
    if(conflict && !(await confirmAction(conflict+'\n\nΣυνέχεια με την ανάθεση;',{title:'Πιθανή διπλή δέσμευση',confirmLabel:'Συνέχεια'}))) return;
  }
  const btn=document.getElementById(`wi-pop-btn-${rowId}`);
  const spin=document.getElementById(`wi-pop-spin-${rowId}`);
  if(btn){btn.disabled=true;if(spin)spin.style.display='block';}
  _wiSync('wi-sync-'+rowId,'pend','Αποθήκευση ανάθεσης…'); // T3
  // Stamp Assigned At only on first assignment (preserve for accurate assignment-speed metric)
  const isFirstAssignment = !row.saved;
  const assignedAtStamp = isFirstAssignment ? { 'Assigned At': new Date().toISOString() } : {};
  const fields=isPartner
    ?{'Partner':[row.partnerId],'Is Partner Trip':true,
      'Partner Truck Plates':row.partnerPlates||'','Status':'Assigned',
      'Truck':[],'Trailer':[],'Driver':[], ...assignedAtStamp}
    :{'Truck':[row.truckId],'Trailer':row.trailerId?[row.trailerId]:[],'Driver':row.driverId?[row.driverId]:[],'Is Partner Trip':false,'Status':'Assigned','Partner':[],'Partner Truck Plates':'', ...assignedAtStamp};
  // Save to export orders (with export rate)
  const expFields={...fields};
  if(isPartner) expFields['Partner Rate']=row.partnerRate?parseFloat(row.partnerRate):null;

  // Save to import order (with import rate) if matched
  const impFields={...fields};
  if(isPartner) impFields['Partner Rate']=row.partnerRateImp?parseFloat(row.partnerRateImp):null;

  const errors=[];
  for(const orderId of row.orderIds){
    try{
      const res=await atSafePatch(TABLES.ORDERS,orderId,expFields);
      if(res?.conflict){ toast('Η εγγραφή άλλαξε από άλλον χρήστη — ανανέωση…','warn'); await renderWeeklyIntl(); return; }
      if(res?.error) throw new Error(res.error.message||res.error.type||JSON.stringify(res.error));
      if (typeof plOnIntlPartnerAssigned === 'function') plOnIntlPartnerAssigned(orderId);
    }catch(err){errors.push(err.message);}
  }
  if(row.importId && !row.orderIds.includes(row.importId)){
    try{
      const res=await atSafePatch(TABLES.ORDERS,row.importId,impFields);
      if(res?.conflict){ toast('Η εγγραφή άλλαξε από άλλον χρήστη — ανανέωση…','warn'); await renderWeeklyIntl(); return; }
      if(res?.error) throw new Error(res.error.message||res.error.type||JSON.stringify(res.error));
      // Το σκέλος εισαγωγής είναι ΑΚΡΙΒΩΣ η περίπτωση PARTNER_DROPOFF (ο partner
      // μάς φέρνει φορτίο): χωρίς αυτό το κάλεσμα καταγραφόταν μόνο η μισή ροή.
      if (typeof plOnIntlPartnerAssigned === 'function') plOnIntlPartnerAssigned(row.importId);
    }catch(err){errors.push(err.message);}
  }
  if(errors.length){
    if(btn){btn.disabled=false;if(spin)spin.style.display='none';}
    _wiSync('wi-sync-'+rowId,'err','Η ανάθεση ΔΕΝ γράφτηκε στη βάση — ξαναπροσπάθησε'); // T3: stays visible
    // Full error list goes to the gated log; user sees a short message only.
    reportError('Σφάλμα αποθήκευσης αντιστοίχισης — δοκιμάστε ξανά', errors);
    return;
  }
  _wiClosePopover();

  // P&L feed (5/9, N2): assigning Truck/Driver here is exactly what turns an
  // order "executing" for rt-feed.js (Status Assigned + a vehicle) — but this
  // popover save never called it, so an RT for this trip was only ever created
  // on the NEXT unrelated order-form save. The block above (row.importId &&
  // !row.orderIds.includes(...)) already inherits Truck/Trailer/Driver onto a
  // matched import unconditionally, so rtOnOrderSaved for the export alone is
  // enough — it resolves the match itself via 'Matched Import ID'.
  if(typeof rtOnOrderSaved === 'function'){
    for(const orderId of row.orderIds){
      rtOnOrderSaved(orderId).catch(e => console.warn('[wi popover] rt sync:', e && e.message));
    }
  }

  // PARTNER ASSIGNMENT sync (both export + import rows)
  if(isPartner){
    try{ await _wiCreatePartnerAssignments(row); }
    catch(e){ console.warn('PA upsert error:',e.message); }
  } else {
    // Partner removed → delete PA records
    const allOids=[...row.orderIds];
    if(row.importId && !allOids.includes(row.importId)) allOids.push(row.importId);
    try{ await _wiDeletePartnerAssignments(allOids); }
    catch(e){ console.warn('PA delete error:',e.message); }
  }

  _wiSync('wi-sync-'+rowId,'ok','Η ανάθεση γράφτηκε'); // T3
  toast(row.saved?'Ενημερώθηκε ✓':'Αποθηκεύτηκε ✓');

  // Sync Veroia Switch → NAT_LOADS
  try {
    for (const oid of row.orderIds) {
      const recs = await atGetAll(TABLES.ORDERS, {
        filterByFormula: 'RECORD_ID()="'+oid+'"',
        fields: ['Direction','Type','Veroia Switch','National Order Created',
          'Client','Goods','Total Pallets','Temperature °C','Pallet Exchange',
          'National Groupage','Loading DateTime','Delivery DateTime','Reference',
        ],
      }, false);
      if (recs.length > 0 && typeof _syncVeroiaSwitch === 'function')
        await _syncVeroiaSwitch(oid, recs[0].fields);
    }
  } catch(e) {
    // The order save already succeeded; only the downstream VS→NAT_LOADS sync
    // failed. This used to be swallowed to console, so national planning data
    // could silently drift from assignment data with no signal. Tell the user
    // (their save stuck, but national needs a retry) and log it. We do NOT roll
    // back the save here.
    reportError('Η αποθήκευση έγινε, αλλά ο συγχρονισμός με National απέτυχε — άνοιξε ξανά και αποθήκευσε', e);
    if (typeof logError === 'function') logError(e, '_wiSaveFromPopover: VS→NAT_LOADS sync (post-save)');
  }

  await renderWeeklyIntl();
}

async function _wiCreatePartnerAssignments(row){
  // Build list of all orders (export + import) with their rates
  const assignments = [];

  for(const orderId of row.orderIds){
    assignments.push({ orderId, rate: row.partnerRate });
  }
  if(row.importId && !row.orderIds.includes(row.importId)){
    assignments.push({ orderId: row.importId, rate: row.partnerRateImp });
  }

  for(const asgn of assignments){
    try {
      await paUpsert({
        parentType: 'order',
        parentId:   asgn.orderId,
        partnerId:  row.partnerId,
        rate:       asgn.rate,
        status:     'Assigned',
      });
    } catch(err) {
      console.error('PA upsert failed:', asgn.orderId, err.message);
    }
  }
}

async function _wiDeletePartnerAssignments(orderIds){
  for(const oid of orderIds){
    try { await paDelete({ parentType: 'order', parentId: oid }); }
    catch(err) { console.warn('PA delete failed:', oid, err.message); }
  }
}


async function _wiClear(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  if(!(await confirmAction('Καθαρισμός ανάθεσης;', { confirmLabel: 'Καθαρισμός' }))) return;
  const allOrderIds=[...row.orderIds];
  if(row.importId && !allOrderIds.includes(row.importId)) allOrderIds.push(row.importId);
  const errors=[];
  for(const orderId of allOrderIds){
    try{
      const res=await atSafePatch(TABLES.ORDERS,orderId,{
        'Truck':[],'Trailer':[],'Driver':[],'Partner':[],
        'Is Partner Trip':false,'Partner Truck Plates':'',
      });
      if(res?.error) throw new Error(res.error.message||res.error.type);
      // Χωρίς ανάθεση δεν υπάρχει ανταλλαγή: ο feeder σβήνει την εκκρεμή κίνηση
      // partner (τις οριστικές δεν τις αγγίζει — είναι ιστορικό).
      if (typeof plOnIntlPartnerAssigned === 'function') plOnIntlPartnerAssigned(orderId);
    }catch(err){ errors.push(err.message); }
  }
  if(errors.length){ _wiSync('wi-sync-'+rowId,'err','Ο καθαρισμός ΔΕΝ γράφτηκε στη βάση'); toast('Ο καθαρισμός απέτυχε: '+errors[0].slice(0,50),'warn');return;}

  // Remove PA records for cleared orders
  try{ await _wiDeletePartnerAssignments(allOrderIds); }
  catch(e){ console.warn('PA delete error:',e.message); }

  _wiSync('wi-sync-'+rowId,'ok','Η ανάθεση καθαρίστηκε');
  toast('Η ανάθεση καθαρίστηκε ✓');
  WINTL.ui.openRow=null;
  await renderWeeklyIntl();
}

/* ── CONTEXT MENU ──────────────────────────────────────────────────── */
// Owner (10/8): κανόνας groupage — δείξε ΜΟΝΟ συνδυασμούς με σύνολο ≤33
// παλέτες (χωρητικότητα). «Δώρο άδωρο να εμφανίζει όλα τα φορτία».
function _wiRowPals(row){
  if(!row) return 0;
  if(row.type==='import'){
    const i=WINTL.data.imports.find(r=>r.id===row.orderId);
    return +(i?.fields['Total Pallets']||0);
  }
  return (row.orderIds||[]).reduce((s,oid)=>{
    const o=WINTL.data.exports.find(r=>r.id===oid);
    return s+(+(o?.fields['Total Pallets']||0));
  },0);
}
function _wiCtx(e,rowId){
  e.preventDefault();e.stopPropagation();
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const isGroup=row.orderIds.length>1;
  const myPals=_wiRowPals(row);
  const others=WINTL.rows.filter(r=>r.id!==rowId&&!r.saved&&r.type==='export'
    &&(myPals+_wiRowPals(r))<=33);
  const btn=(l,fn,d=false)=>
    `<button class="wi-ctx-i${d?' d':''}" onclick="${fn};_wiCtxClose()">${l}</button>`;
  let html='';
  if(others.length){
    html+=`<div class="wi-ctx-h">Groupage · χωράνε ≤33 παλ (τώρα ${myPals}p)</div>`;
    others.slice(0,6).forEach(o=>{
      const exp=WINTL.data.exports.find(r=>r.id===o.orderIds[0]);
      const lbl=_wiCut(_wiClean(exp?.fields['Delivery Summary']||`Γραμμή ${o.id}`),24);
      const op=_wiRowPals(o);
      html+=btn(`Μαζί με: ${lbl} (${op}p → ${myPals+op}p)`,`_wiMerge(${rowId},${o.id})`);
    });
    html+=`<div class="wi-ctx-sep"></div>`;
  }else if(row.type==='export'&&!row.saved){
    html+=`<div class="wi-ctx-h">Groupage — καμία συμβατή (όριο 33 παλ, τώρα ${myPals}p)</div>`;
  }
  const rc=_wiRotCands(row);
  if(rc.length){
    html+=`<div class="wi-ctx-h">⤷ Σκέλος προώθησης (ρότα)</div>`;
    rc.forEach(c2=>{ html+=btn(`⤷ ${c2.lbl}`,`_wiRotAdd(${rowId},'${c2.oid}')`); });
    html+=`<div class="wi-ctx-sep"></div>`;
  }
  if(isGroup) html+=btn('Διάλυση groupage',`_wiSplit(${rowId})`);
  if(row.importId) html+=btn('Αφαίρεση ταιριάσματος εισαγωγής',`_wiRemoveImport(${rowId})`);
  if(row.saved) html+=btn('Καθαρισμός ανάθεσης',`_wiClear(${rowId})`,true);
  const ctx=document.getElementById('wi-ctx');
  ctx.innerHTML=html;
  Object.assign(ctx.style,{display:'block',
    left:`${Math.min(e.clientX,window.innerWidth-220)}px`,
    top:`${Math.min(e.clientY,window.innerHeight-260)}px`});
  setTimeout(()=>document.addEventListener('click',_wiCtxClose,{once:true}),10);
}
function _wiCtxClose(){const el=document.getElementById('wi-ctx');if(el) el.style.display='none';}

// Ρότα: υποψήφια σκέλη για γονέα-order — διεθνή, χωρίς δική τους ρότα,
// όχι ο ίδιος/η ταιριασμένη του εισαγωγή, φόρτωση από τη φόρτωση του γονέα
// και μετά. Επιστρέφει [{oid,lbl}].
function _wiRotCands(parentRow){
  const pOid=parentRow.type==='import'?parentRow.orderId:parentRow.orderIds?.[0];
  const po=WINTL.data.exports.find(x=>x.id===pOid)||WINTL.data.imports.find(x=>x.id===pOid);
  if(!po) return [];
  const pLoad=String(po.fields['Loading DateTime']||'');
  const out=[];
  for(const r of WINTL.rows){
    if(r.id===parentRow.id||r.legOf||r.adj) continue;
    const oid=r.type==='import'?r.orderId:r.orderIds?.[0];
    if(!oid||oid===pOid||oid===parentRow.importId) continue;
    const o=WINTL.data.exports.find(x=>x.id===oid)||WINTL.data.imports.find(x=>x.id===oid);
    if(!o||o.fields['Rotation ID']) continue;
    if(String(o.fields['Loading DateTime']||'')<pLoad) continue;
    const lbl=`${_wk3D(_wiFmt(o.fields['Loading DateTime']))} ${_wk3Loc(o.fields['Loading Summary']||'—')} → ${_wk3Loc(o.fields['Delivery Summary']||'—')}`; // full label: the menu wraps, a cut hides the destination
    out.push({oid,lbl});
    if(out.length>=6) break;
  }
  return out;
}
async function _wiRotAdd(parentRowId, legOid){
  const pr=WINTL.rows.find(r=>r.id===parentRowId); if(!pr) return;
  const pOid=pr.type==='import'?pr.orderId:pr.orderIds?.[0];
  const patch={'Rotation ID':pOid};
  // Το σκέλος κληρονομεί όχημα/οδηγό του γονέα (ίδιο φορτηγό συνεχίζει)
  if(pr.truckId)   patch['Truck']=[pr.truckId];
  if(pr.trailerId) patch['Trailer']=[pr.trailerId];
  if(pr.driverId)  patch['Driver']=[pr.driverId];
  try{
    const res=await atSafePatch(TABLES.ORDERS,legOid,patch);
    if(res?.error) throw new Error(res.error.message||res.error.type);
    toast('⤷ Σκέλος συνδέθηκε στη ρότα ✓');
    renderWeeklyIntl();
  }catch(e){ reportError('Η σύνδεση σκέλους απέτυχε',e); }
}
async function _wiRotUnlink(e,legOid){
  e.preventDefault(); e.stopPropagation();
  const ok=await confirmAction('Αποσύνδεση του σκέλους από τη ρότα; (Η ανάθεση οχήματος μένει ως έχει.)',
    {title:'Ρότα',confirmLabel:'Αποσύνδεση'});
  if(!ok) return;
  try{
    const res=await atSafePatch(TABLES.ORDERS,legOid,{'Rotation ID':''});
    if(res?.error) throw new Error(res.error.message||res.error.type);
    toast('Σκέλος αποσυνδέθηκε ✓');
    renderWeeklyIntl();
  }catch(err){ reportError('Η αποσύνδεση απέτυχε',err); }
}

// Owner (10/8): δεξί κλικ σε ΕΙΣΑΓΩΓΗ → Groupage με άλλη εισαγωγή + Μεταφορά
// σε προηγούμενη/επόμενη εβδομάδα (μετακινεί τις ημερομηνίες ±7 ημέρες).
function _wiImpCtx(e,rowId){
  e.preventDefault();e.stopPropagation();
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const btn=(l,fn)=>`<button class="wi-ctx-i" onclick="${fn};_wiCtxClose()">${l}</button>`;
  let html='';
  const myPals=_wiRowPals(row);
  const others=WINTL.rows.filter(r=>r.type==='import'&&r.id!==rowId&&!r.adj&&!r.matchedTo
    &&(myPals+_wiRowPals(r))<=33);
  if(others.length){
    html+=`<div class="wi-ctx-h">Groupage εισαγωγών · ≤33 παλ (τώρα ${myPals}p)</div>`;
    others.slice(0,6).forEach(o=>{
      const oi=WINTL.data.imports.find(r=>r.id===o.orderId);
      const lbl=_wiCut(_wiClean(oi?.fields['Loading Summary']||oi?.fields['Client Name']||`I-${o.id}`).split(',')[0],22);
      const op=_wiRowPals(o);
      html+=btn(`Μαζί με: ${lbl} (${op}p → ${myPals+op}p)`,`_wiImpGroup(${rowId},${o.id})`);
    });
    html+=`<div class="wi-ctx-sep"></div>`;
  }
  const rc2=_wiRotCands(row);
  if(rc2.length){
    html+=`<div class="wi-ctx-h">⤷ Σκέλος προώθησης (ρότα)</div>`;
    rc2.forEach(c2=>{ html+=btn(`⤷ ${c2.lbl}`,`_wiRotAdd(${rowId},'${c2.oid}')`); });
    html+=`<div class="wi-ctx-sep"></div>`;
  }
  html+=`<div class="wi-ctx-h">Μεταφορά εβδομάδας</div>`;
  html+=btn(`← Στην W${WINTL.week-1} (ημερομηνίες −7)`,`_wiImpShift(${rowId},-7)`);
  html+=btn(`Στην W${WINTL.week+1} (ημερομηνίες +7) →`,`_wiImpShift(${rowId},7)`);
  const ctx=document.getElementById('wi-ctx');
  ctx.innerHTML=html;
  Object.assign(ctx.style,{display:'block',
    left:`${Math.min(e.clientX,window.innerWidth-220)}px`,
    top:`${Math.min(e.clientY,window.innerHeight-220)}px`});
  setTimeout(()=>document.addEventListener('click',_wiCtxClose,{once:true}),10);
}
async function _wiImpShift(rowId,days){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const imp=WINTL.data.imports.find(r=>r.id===row.orderId);if(!imp) return;
  const w=WINTL.week+(days>0?1:-1);
  const ok=await confirmAction(
    `Η εισαγωγή θα μεταφερθεί στην W${w}: οι ημερομηνίες φόρτωσης και παράδοσης μετακινούνται ${days>0?'+7':'−7'} ημέρες.`,
    {title:'Μεταφορά εβδομάδας',confirmLabel:'Μεταφορά'});
  if(!ok) return;
  const sh=s=>{ if(!s) return null; try{return new Date(new Date(s).getTime()+days*86400000).toISOString();}catch(e){return null;} };
  const patch={};
  const nl=sh(imp.fields['Loading DateTime']); if(nl) patch['Loading DateTime']=nl;
  const nd=sh(imp.fields['Delivery DateTime']); if(nd) patch['Delivery DateTime']=nd;
  if(!Object.keys(patch).length){ toast('Η εισαγωγή δεν έχει ημερομηνίες','warn'); return; }
  try{
    const res=await atPatch(TABLES.ORDERS,imp.id,patch);
    if(res?.error) throw new Error(res.error.message||res.error.type);
    toast(`Μεταφέρθηκε στην W${w} ✓`);
    renderWeeklyIntl();
  }catch(e){ reportError('Η μεταφορά απέτυχε',e); }
}
async function _wiImpGroup(rowId,otherRowId){
  const a=WINTL.rows.find(r=>r.id===rowId), b=WINTL.rows.find(r=>r.id===otherRowId);
  if(!a||!b) return;
  const ai=WINTL.data.imports.find(r=>r.id===a.orderId), bi=WINTL.data.imports.find(r=>r.id===b.orderId);
  if(!ai||!bi) return;
  const gid=ai.fields['Group ID']||bi.fields['Group ID']||('GI-'+Date.now().toString(36).toUpperCase());
  try{
    for(const oid of [ai.id,bi.id]){
      const res=await atSafePatch(TABLES.ORDERS,oid,{'Group ID':gid});
      if(res?.error) throw new Error(res.error.message||res.error.type);
    }
    toast('Groupage εισαγωγών ✓');
    renderWeeklyIntl();
  }catch(e){ reportError('Το groupage απέτυχε',e); }
}

/* ── GROUPAGE ──────────────────────────────────────────────────────── */
// Π1 (Wave 3, owner choice Α): the group persists via a shared text
// `Group ID` on ORDERS (same pattern as NAT_LOADS `Groupage ID`), rebuilt in
// _wiBuildRows — «με την ανανέωση η σελίδα χαλάει» (00 §2) ends here.
// UI-level grouping of ORDERS only: GL/CL and the never-delete rule untouched.
async function _wiGroupPatch(orderIds, gid, rowId){
  _wiSync('wi-sync-'+rowId,'pend', gid?'Αποθήκευση ομάδας…':'Διάλυση ομάδας…');
  let failed=false;
  for(const oid of orderIds){
    try{
      const res=await atSafePatch(TABLES.ORDERS,oid,{'Group ID':gid});
      if(res?.error) throw new Error(res.error.message||res.error.type);
    }catch(err){ failed=true; console.warn('Group ID save:',err.message); }
  }
  _wiSync('wi-sync-'+rowId, failed?'err':'ok',
    failed?'Η ομάδα ΔΕΝ αποθηκεύτηκε στη βάση (λείπει το πεδίο Group ID στον Worker/DB;) — θα χαθεί στην ανανέωση':'Η ομάδα αποθηκεύτηκε');
  if(failed) toast('Η ομάδα δεν αποθηκεύτηκε στη βάση — θα ισχύει μόνο μέχρι την ανανέωση','warn');
  return !failed;
}
async function _wiMerge(rowId,otherId){
  const row=WINTL.rows.find(r=>r.id===rowId),other=WINTL.rows.find(r=>r.id===otherId);
  if(!row||!other) return;
  other.orderIds.forEach(id=>{if(!row.orderIds.includes(id)) row.orderIds.push(id);});
  WINTL.rows=WINTL.rows.filter(r=>r.id!==otherId);
  _wiPaint();toast('Ομαδοποιήθηκε');
  const gid='GRP-'+String(row.orderIds[0]).slice(-8);
  await _wiGroupPatch(row.orderIds, gid, row.id);
}
async function _wiSplit(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row||row.orderIds.length<=1) return;
  const allIds=[...row.orderIds];
  const [first,...rest]=row.orderIds;row.orderIds=[first];
  rest.forEach(expId=>{
    const exp=WINTL.data.exports.find(r=>r.id===expId);
    WINTL.rows.push({
      id:++WINTL._seq, orderId:expId, orderIds:[expId], importId:null,
      truckId:'',trailerId:'',driverId:'',partnerId:'',
      truckLabel:'',trailerLabel:'',driverLabel:'',partnerLabel:'',
      partnerPlates:'',saved:false,
    });
  });
  _wiPaint();toast('Η ομάδα διαλύθηκε');
  await _wiGroupPatch(allIds, '', row.id); // clear Group ID on all members
}
// Π1: one paper packet for the whole group (print.html ?orderIds=…).
function _wiPrintGroup(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId); if(!row||row.orderIds.length<2) return;
  const base='https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/print.html';
  const sheet=row.partnerId?'partner':'driver';
  window.open(`${base}?orderIds=${row.orderIds.join(',')}&leg=export&sheet=${sheet}`,'_blank');
}

/* ── ΚΑΡΤΕΛΑ ΡΟΤΑΣ (owner 12/8, εγκεκριμένο πρωτότυπο grp_trip_proto) ──
   Κλικ σε γραμμή GRP: αντί για φόρμα (ποιου order;) ανοίγει πάνελ με τα μέλη
   της ομάδας — Επεξεργασία ανά order + σειρά παράδοσης με ↑↓. Η σειρά
   αποθηκεύεται στο suffix του Group ID (βλ. _wiGrpOrder). */
function _wiRota(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId); if(!row) return;
  const exps=_wiGrpOrder(row.orderIds.map(id=>WINTL.data.exports.find(r=>r.id===id)).filter(Boolean));
  if(exps.length<2){ _wk3Edit(row.orderIds[0]); return; }
  window._wiRotaState={rowId, ids:exps.map(e=>e.id)};
  _wiRotaRender();
}
function _wiRotaRender(){
  const st=window._wiRotaState; if(!st) return;
  const row=WINTL.rows.find(r=>r.id===st.rowId); if(!row) return;
  const exps=st.ids.map(id=>WINTL.data.exports.find(r=>r.id===id)).filter(Boolean);
  const asn=row.partnerLabel?row.partnerLabel+(row.partnerPlates?' · '+row.partnerPlates:'')
    :(row.truckLabel?row.truckLabel+(row.driverLabel?' · '+row.driverLabel:''):'Προς ανάθεση');
  const btnS='width:24px;height:24px;border:1px solid var(--border);background:var(--surface-card);border-radius:6px;color:var(--text-mid);cursor:pointer';
  const cardRow=(e)=>{const f=e.fields;
    return `<div style="border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:8px;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center">
      <div><div style="font-weight:800;font-size:13px">${(_wiClean(f['Client Name']||f['Client Summary']||String(f['Loading Summary']||'—').split(',')[0]))}</div>
        <div style="font-size:11px;color:var(--text-mid);margin-top:4px;font-variant-numeric:tabular-nums">${f['Reference']?`Ref <b>${escapeHtml(String(f['Reference']))}</b> · `:''}<b>${('Total Pallets' in f)?f['Total Pallets']+' παλ':'— παλ'}</b> · ${(_wiClean(f['Loading Summary']||'—'))} → ${(_wiClean(f['Delivery Summary']||'—'))}</div></div>
      <button style="font-size:11px;font-weight:800;color:var(--accent);border:1px solid var(--accent);background:var(--surface-card);border-radius:6px;padding:4px 12px;cursor:pointer;white-space:nowrap" onclick="_wiRotaClose();_wk3Edit('${e.id}')">Επεξεργασία</button>
    </div>`;};
  const seqRow=(e,k)=>{const f=e.fields;
    return `<div style="display:grid;grid-template-columns:24px 1fr auto 52px;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--surface-card)">
      <span style="width:16px;height:16px;border-radius:9999px;background:var(--text);color:var(--surface-card);font-size:11px;font-weight:800;text-align:center;line-height:16px">${k+1}</span>
      <span style="font-weight:700;font-size:12px">${(_wiClean(f['Delivery Summary']||'—'))}<small style="display:block;font-weight:500;color:var(--text-mid);font-size:11px">${[f['Delivery DateTime']?_wk3D(_wiFmt(f['Delivery DateTime'])):'', (_wiClean(f['Client Name']||f['Client Summary']||String(f['Loading Summary']||'').split(',')[0]))].filter(Boolean).join(' · ')}</small></span>
      <span></span>
      <span style="display:flex;gap:4px;justify-content:flex-end">
        <button ${k===0?'disabled':''} style="${btnS}${k===0?';opacity:.3;cursor:default':''}" onclick="_wiRotaMv(${k},-1)">↑</button>
        <button ${k===exps.length-1?'disabled':''} style="${btnS}${k===exps.length-1?';opacity:.3;cursor:default':''}" onclick="_wiRotaMv(${k},1)">↓</button>
      </span>
    </div>`;};
  let ov=document.getElementById('wiRotaOv');
  if(!ov){ ov=document.createElement('div'); ov.id='wiRotaOv'; document.body.appendChild(ov); }
  ov.innerHTML=`
    <div style="position:fixed;inset:0;background:rgba(11,25,41,.45);z-index:var(--z-overlay)" onclick="_wiRotaClose()"></div>
    <div style="position:fixed;top:0;right:0;width:480px;max-width:94vw;height:100vh;background:var(--surface-card);z-index:var(--z-overlay);box-shadow:var(--shadow-lg);display:flex;flex-direction:column">
      <div style="background:var(--surface-dark);color:var(--text-on-dark);padding:16px">
        <button style="float:right;background:none;border:none;color:var(--text-on-dark);font-size:18px;cursor:pointer" onclick="_wiRotaClose()">×</button>
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:18px">Καρτέλα Ρότας — GRP ×${exps.length}</div>
        <div style="font-size:11px;color:var(--text-on-dark);margin-top:4px">${exps.length} παραγγελίες · ${_wi2PalGroup(exps).replace(/<[^>]+>/g,'')} · ${escapeHtml(asn)}</div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px">
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:11px;letter-spacing:1.2px;color:var(--surface-dark);text-transform:uppercase;margin-bottom:8px">Παραγγελίες του group</div>
        ${exps.map(cardRow).join('')}
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:11px;letter-spacing:1.2px;color:var(--surface-dark);text-transform:uppercase;margin:16px 0 8px">Σειρά παράδοσης <span style="font-weight:500;color:var(--text-dim);text-transform:none;letter-spacing:0">— βελάκια ↑↓</span></div>
        <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">${exps.map(seqRow).join('')}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:8px;line-height:1.5">Η σειρά καθορίζει την αρίθμηση στο Weekly και τη διαδρομή στο φύλλο οδηγού.</div>
      </div>
      <div style="border-top:1px solid var(--border);padding:12px 16px;display:flex;gap:12px;justify-content:flex-end">
        <button style="font-size:12px;font-weight:800;border-radius:6px;padding:8px 16px;cursor:pointer;background:var(--surface-card);color:var(--danger);border:1px solid var(--danger);margin-right:auto" onclick="_wiRotaSplit()">Διάλυση ομάδας</button>
        <button style="font-size:12px;font-weight:800;border-radius:6px;padding:8px 16px;cursor:pointer;background:var(--surface-card);color:var(--text-mid);border:1px solid var(--border)" onclick="_wiRotaClose()">Κλείσιμο</button>
        <button style="font-size:12px;font-weight:800;border-radius:6px;padding:8px 16px;cursor:pointer;background:var(--accent);color:var(--surface-card);border:none" onclick="_wiRotaSave()">Αποθήκευση σειράς</button>
      </div>
    </div>`;
}
function _wiRotaMv(i,d){
  const st=window._wiRotaState; if(!st) return;
  const j=i+d; if(j<0||j>=st.ids.length) return;
  [st.ids[i],st.ids[j]]=[st.ids[j],st.ids[i]];
  _wiRotaRender();
}
async function _wiRotaSave(){
  const st=window._wiRotaState; if(!st) return;
  const exps=st.ids.map(id=>WINTL.data.exports.find(r=>r.id===id)).filter(Boolean);
  if(exps.length<2){ _wiRotaClose(); return; }
  const base=String(exps.find(e=>e.fields['Group ID'])?.fields['Group ID']||'').split('|')[0]
    ||('GRP-'+String(st.ids[0]).slice(-8));
  const gid=base+'|'+st.ids.join(',');
  // Γράφεται σε ΟΛΑ τα μέλη: το collapse στηρίζεται σε ισότητα του Group ID —
  // μερική αποτυχία θα έσπαγε την ομάδα στην ανανέωση, γι' αυτό το μήνυμα.
  let failed=false;
  for(const e of exps){
    try{
      const res=await atSafePatch(TABLES.ORDERS,e.id,{'Group ID':gid});
      if(res?.error) throw new Error(res.error.message||res.error.type);
      e.fields['Group ID']=gid;
    }catch(err){ failed=true; console.warn('Rota seq save:',err.message); }
  }
  toast(failed?'Η σειρά δεν αποθηκεύτηκε πλήρως — δοκίμασε ξανά':'Η σειρά αποθηκεύτηκε ✓', failed?'warn':undefined);
  _wiRotaClose();
  _wiRepaintRow(st.rowId);
}
function _wiRotaClose(){ document.getElementById('wiRotaOv')?.remove(); window._wiRotaState=null; }

// Owner 12/8: «δεν υπάρχει κουμπί ακύρωσης του groupage» — ορατή διάλυση από
// την καρτέλα. Το _wiSplit καθαρίζει το Group ID σε ΟΛΑ τα μέλη στη βάση
// (πλέον μόνιμο μετά το view fix), οπότε τα φορτία ξαναγίνονται απλές γραμμές
// και μετά από refresh. GL/CL δεν αγγίζονται — UI-level ομαδοποίηση μόνο.
async function _wiRotaSplit(){
  const st=window._wiRotaState; if(!st) return;
  const ok=await confirmAction('Διάλυση της ομάδας; Τα φορτία επιστρέφουν ως ανεξάρτητες γραμμές. (Η ανάθεση μένει στην πρώτη γραμμή — οι υπόλοιπες θέλουν δική τους.)',
    {title:'Groupage', confirmLabel:'Διάλυση'});
  if(!ok) return;
  const rid=st.rowId;
  _wiRotaClose();
  await _wiSplit(rid);
}

/* ── NAVIGATION ────────────────────────────────────────────────────── */
function _wiPrint(rowId, leg){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const orderId = leg==='export' ? row.orderIds[0] : (row.importId||row.orderIds[0]);
  // Β.3-6: ρητή επιλογή εντύπου όταν υπάρχει συνεργάτης (helper στο utils)
  printOrderSheet(orderId, leg, !!(row.partnerId||row.partnerLabel));
}

function _wiToggleGroup(rowId){
  WINTL.ui.openGroup = WINTL.ui.openGroup===rowId ? null : rowId;
  _wiRepaintRow(rowId);
}

function _wiOpenImpPopover(e, impId, rowId){
  // Import row uses same popover — row IS the import row, orderId = import order
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!row){console.error('Import row not found:',rowId);return;}
  _wiOpenPopover(e, rowId);
}


function _wiPrintWeek(){
  const rows=WINTL.rows.filter(r=>r.type==='export');
  const data=WINTL.data;
  // Χαρτί: το φύλλο ανοίγει σε ΔΙΚΟ του παράθυρο χωρίς style.css (core/utils
  // _printWeekShell), άρα κανένα var(--token) δεν θα έλυνε εκεί. Αντί για hex
  // (DESIGN Κ1): καθόλου χρώμα — περιγράμματα currentColor, έντονη κεφαλίδα.
  // Καμία κοπή επωνυμίας (Κ6): το χαρτί αναδιπλώνει. Άγνωστες παλέτες = «—» (Κ3).
  const td='padding:4px 6px;border:1px solid';
  const pals=f=>('Total Pallets' in f&&f['Total Pallets']!==''&&f['Total Pallets']!=null)?f['Total Pallets']:'—';
  let html=`<h2 style="font-family:'Syne',sans-serif;margin-bottom:12px">Εβδομαδιαίο Διεθνών — W${WINTL.week}</h2>
    <p style="font-size:12px;margin-bottom:16px">${rows.length} εξαγωγές · ${data.imports.length} εισαγωγές · Εκτύπωση ${new Date().toLocaleString('el-GR')} — αντικαθιστά κάθε προηγούμενη έκδοση</p>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="font-weight:700">
        <th style="${td};text-align:left">#</th>
        <th style="${td};text-align:left">Διαδρομή</th>
        <th style="${td};text-align:left">Ημερομηνίες</th>
        <th style="${td};text-align:center">Παλ.</th>
        <th style="${td};text-align:left">Ανάθεση</th>
        <th style="${td};text-align:left">Εισαγωγή</th>
      </tr></thead><tbody>`;
  rows.forEach((row,i)=>{
    const exps=row.orderIds.map(id=>data.exports.find(r=>r.id===id)).filter(Boolean);
    const primary=exps[0];if(!primary)return;
    const f=primary.fields;
    const imp=row.importId?data.imports.find(r=>r.id===row.importId):null;
    // Λεξιλόγιο ΜΕΡΟΣ Ε: «ΣΥΝ.» + επωνυμία · «ΙΔ.» + πινακίδα + οδηγός · «ΠΡΟΣ ΑΝΑΘΕΣΗ»
    const partner=row.partnerLabel||(row.partnerId?'—':'');
    const plates=[row.truckLabel,row.trailerLabel].filter(Boolean).join(' / ');
    const assign=partner?`ΣΥΝ. ${partner}${row.partnerPlates?' · '+row.partnerPlates:''}`
      :(plates?`ΙΔ. ${plates}${row.driverLabel?' · '+row.driverLabel:''}`:'ΠΡΟΣ ΑΝΑΘΕΣΗ');
    html+=`<tr>
      <td style="${td}">${i+1}</td>
      <td style="${td}">${escapeHtml(f['Loading Summary']||'')} → ${escapeHtml(f['Delivery Summary']||'')}</td>
      <td style="${td};font-variant-numeric:tabular-nums">${toLocalDate(f['Loading DateTime'])} → ${toLocalDate(f['Delivery DateTime'])}</td>
      <td style="${td};text-align:center;font-variant-numeric:tabular-nums">${pals(f)}</td>
      <td style="${td}">${escapeHtml(assign)}</td>
      <td style="${td}">${imp?(escapeHtml(imp.fields['Loading Summary']||'')+' → '+escapeHtml(imp.fields['Delivery Summary']||'')):'—'}</td>
    </tr>`;
  });
  html+='</tbody></table>';
  // WI-11: shared shell (core/utils) — one print chrome for both weekly pages.
  _printWeekShell(`Εβδομάδα ${WINTL.week} — Petras TMS`, html);
}

// Expose functions used from onclick/oninput/onfocus handlers
window.renderWeeklyIntl = renderWeeklyIntl;
window.WINTL = WINTL;
window._wiAutoMatch = _wiAutoMatch;
window._wiPrintWeek = _wiPrintWeek;
window._wiToggleGroup = _wiToggleGroup;
window._wiRota = _wiRota;
window._wiRotaMv = _wiRotaMv;
window._wiRotaSave = _wiRotaSave;
window._wiRotaClose = _wiRotaClose;
window._wiRotaSplit = _wiRotaSplit;
window._wiOpenPopover = _wiOpenPopover;
window._wiOpenImpPopover = _wiOpenImpPopover;
window._wiClosePopover = _wiClosePopover;
window._wiSaveFromPopover = _wiSaveFromPopover;
window._wiClear = _wiClear;
window._wiFullscreen = _wiFullscreen;
window._wiNewImport = _wiNewImport;
window._wiConsumePendingMatch = _wiConsumePendingMatch;
window._wiRemoveImport = _wiRemoveImport;
window._wiUnmatch = _wiUnmatch;
window._wiPrint = _wiPrint;
window._wiPrintImp = _wiPrintImp;

// Διόρθωση 1 (owner 25/8): το μενού κοινής χρήσης ΣΤΟ εικονίδιο της γραμμής —
// ένα βήμα, όχι μέσω preview. Delegated στο document: ο πίνακας ξαναχτίζεται
// σε κάθε αλλαγή εβδομάδας και per-element listeners θα χάνονταν σιωπηλά.
// Δεξί κλικ + long-press (ΟΧΙ διπλό: θα καθυστερούσε την εκτύπωση όλων κατά
// ~250ms αναμονής δεύτερου κλικ). Αριστερό κλικ: preview, ανέγγιχτο.
if (typeof shareMenuDelegate === 'function') {
  shareMenuDelegate(document, '.wk3-prt[data-shq]', (el) => {
    const q = el.dataset.shq;
    return {
      title: el.dataset.shtitle || 'PETRAS GROUP — Εντολή',
      fileName: el.dataset.shtitle,
      // Το περιεχόμενο έρχεται από το /print/pdf — ο ΙΔΙΟΣ παραγωγός με το
      // preview (αρχή 3): PDF ως έχει, κείμενο με &format=text (_waArr).
      pdfUrl: () => PROXY_URL + '/print/pdf?' + q,
      getText: async () => {
        const r = await fetch(PROXY_URL + '/print/pdf?' + q + '&format=text',
          { headers: { Authorization: 'Bearer ' + localStorage.getItem('tms_jwt') } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.text();
      },
      onPrint: () => window.open('https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/print.html?' + q, '_blank')
    };
  });
}
window._wiCtxClose = _wiCtxClose;
window._wiField = _wiField;
window._wiSdO = _wiSdO;
window._wiSdF = _wiSdF;
window._wiSdP = _wiSdP;
window._wiRepaintRow = _wiRepaintRow;
window._wiImpDragStart = _wiImpDragStart;
window._wiDragStart = _wiDragStart;
window._wiDropOnRow = _wiDropOnRow;
window._wiDropOnPanel = _wiDropOnPanel;
window._wiCtx = _wiCtx;
window._wiMerge = _wiMerge;
window._wiSplit = _wiSplit;
window._wiPrintGroup = _wiPrintGroup;
window._wiToggleDetails = _wiToggleDetails;
// Νέα παραγγελία από το εβδομαδιαίο — inline onclick, module σε IIFE
window._wiNewOrder = _wiNewOrder;
window._wiExportCSV = _wiExportCSV;
window._wiApplyFilter = _wiApplyFilter;
window._wk3Gaps = _wk3Gaps;
window._wiJumpFirstUnassigned = _wiJumpFirstUnassigned;
window._wi2Quick = _wi2Quick;
window._wi2Legend = _wi2Legend;
window._wi2PopWarn = _wi2PopWarn;
// Feedback dispatcher (19/5): drag import προς μέρα εκτός οθόνης απαιτούσε
// zoom-out — τώρα το φύλλο κυλάει μόνο του όταν το drag πλησιάζει τις άκρες.
document.addEventListener('dragover',function(e){
  if(!window._wiDragging) return;
  const sh=document.querySelector('.wk3-sheet'); if(!sh) return;
  const r=sh.getBoundingClientRect();
  if(e.clientY<r.top+70) sh.scrollTop-=16;
  else if(e.clientY>r.bottom-70) sh.scrollTop+=16;
});
window._wk3Edit = _wk3Edit;
window._wiImpCtx = _wiImpCtx;
window._wiRotAdd = _wiRotAdd;
window._wiRotUnlink = _wiRotUnlink;
window._wk3PickDate = _wk3PickDate;
// Αναδιπλούμενα εθνικά πάνελ (owner 10/8) — ανεξάρτητα, με μνήμη ανά χρήστη
function _wk3FeedTog(side){
  const k='tms_wk3_'+side, off=localStorage.getItem(k)!=='0';
  localStorage.setItem(k, off?'0':'1');
  const el=document.querySelector('.wk3');
  if(el) el.classList.toggle(side==='fl'?'fl-off':'fr-off', off);
}
window._wk3FeedTog = _wk3FeedTog;
window._wiImpShift = _wiImpShift;
window._wiImpGroup = _wiImpGroup;

function _wiExportCSV() {
  const allOrders = [...WINTL.data.exports, ...WINTL.data.imports];
  if (!allOrders.length) { toast('Δεν υπάρχουν δεδομένα για εξαγωγή', 'error'); return; }
  const rows = [['Order No','Direction','Client','Loading','Delivery','Load Date','Del Date','Pallets','Truck','Trailer','Driver','Partner','Status']];
  allOrders.forEach(r => { const f = r.fields;
    const trk = WINTL.data.trucks.find(t => t.id === ((f['Truck']||[])[0]))?.label || '';
    const trl = WINTL.data.trailers.find(t => t.id === ((f['Trailer']||[])[0]))?.label || '';
    const drv = WINTL.data.drivers.find(d => d.id === ((f['Driver']||[])[0]))?.label || '';
    const prt = WINTL.data.partners.find(p => p.id === ((f['Partner']||[])[0]))?.label || '';
    const assigned = !!(trk || prt);
    rows.push([f['Order Number']||'', f['Direction']||'',
      typeof getClientName==='function' ? getClientName((f['Client']||[])[0]) : '',
      f['Loading Summary']||'', f['Delivery Summary']||'',
      f['Loading DateTime']||'', f['Delivery DateTime']||'', ('Total Pallets' in f)?f['Total Pallets']:'',
      trk, trl, drv, prt, assigned?'Assigned':'Unassigned',
    ]); });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `weekly_intl_W${WINTL.week}_${localToday()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  toast('Το CSV εξήχθη ✓');
}

})();
