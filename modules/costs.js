// ═══════════════════════════════════════════════════════════════
// COSTS Φ1 — TRIP PnL (owner-only) + manual Round Trip + quick cost add
// Data: Worker /costs/* (JWT) — see docs/COSTS_ARCHITECTURE.md
// ═══════════════════════════════════════════════════════════════

const CT_CATEGORY_LABELS = {
  fuel: 'Καύσιμα', reefer_fuel: 'Καύσιμα ψυγείου', tolls: 'Διόδια', dkv: 'DKV κάρτα',
  adblue: 'AdBlue', driver_pay: 'Οδηγός', cash_m: 'Έξοδα Μ', spedition: 'Spedition',
  accommodation: 'Διαμονή', ferry_train: 'Ferry/Τρένα', fines: 'Πρόστιμα',
  partner_rate: 'Partner rate', fixed_alloc: 'Πάγια (Tier-2)', other: 'Λοιπά'
};

const _ct = { pnl: [], rts: {}, lookups: null, veh: 'ALL', scope: 'ALL', group: 'trip', openRt: null,
  // Φ4 partner pallet gate (docs/PALLETS_ARCHITECTURE.md §4.2): rt_id → gate record from /costs/pallet-gate.
  palletGate: {}, palletGateFailed: false,
  // Εμπλουτισμός διαδρομής (v3 κάρτες): pg order_id → ORDERS record + rec → pg,
  // με τη γέφυρα /pallets/gate — ίδιο μοτίβο με το _plvEnrich του Pallet Ledger.
  orderByPg: null, pgByRec: {}, ordersAll: null, enrichFail: false };

async function ctFetch(path, opts = {}) {
  const jwt = localStorage.getItem('tms_jwt');
  const res = await fetch(PROXY_URL + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: 'Bearer ' + jwt } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
  // 200 με μη-JSON σώμα (edge error page, λάθος proxy) ΔΕΝ είναι «κενή βάση» —
  // χωρίς αυτό, το onboarding «δεν έχει γραφτεί τίποτα» θα έκρυβε το σφάλμα.
  if (data === null) throw new Error('Μη αναγνώσιμη απάντηση διακομιστή');
  return data;
}
// Ζημιές πάντα σε παρένθεση, παντού — κάρτα, ανάπτυγμα, ομαδοποιήσεις. Το
// σκέτο ctEur δίνει «€-620» (μείον ΜΕΤΑ το €) που διαβάζεται σαν τυπογραφικό.
const ctEurP = n => (Number(n) < 0 ? '(' + ctEur(-n).replace('€', '') + ' €)' : ctEur(n));
const ctEur = n => '€' + Math.round(Number(n) || 0).toLocaleString('el-GR');
const ctEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function ctTruckName(id) { const t = (_ct.lookups?.trucks || []).find(x => x.id === id); return t ? t.license_plate : (id ? '#' + id : '—'); }
function ctDriverName(id) { const d = (_ct.lookups?.drivers || []).find(x => x.id === id); return d ? d.full_name : ''; }
function ctPartnerName(id) { const p = (_ct.lookups?.partners || []).find(x => x.id === id); return p ? p.company_name : (id ? '#' + id : '—'); }

function ctPill(m) {
  if (m == null) return '<span class="ct-pill ct-dim">—</span>';
  const c = m < 0 ? 'ct-red' : (m < 10 ? 'ct-amber' : 'ct-green');
  return `<span class="ct-pill ${c}">${m > 0 ? '+' : ''}${Number(m).toFixed(1)}%</span>`;
}
function ctChip(t) {
  const natl = t.scope === 'NATL' ? ' <span class="ct-chip ct-natl">ΕΘΝΙΚΟ</span>' : '';
  if (t.trip_type === 'PARTNER') return `<span class="ct-chip ct-partner">${ctEsc(ctPartnerName(t.partner_id))}</span>` + natl;
  return `<span class="ct-chip ct-owned">${ctEsc(ctTruckName(t.truck_id))}</span>` + natl;
}
// Λεξιλόγιο κατάστασης (owner review 24/8) — δύο ανεξάρτητα σήματα: η ΕΚΤΕΛΕΣΗ
// εδώ, τα ΚΟΣΤΗ στο pill «κόστη ελλιπή». Ο feeder γεννά RT μόνο όταν η μεταφορά
// όντως εκτελείται, άρα planned + legs = «Σε εξέλιξη», όχι «Σχεδιασμένο» (αυτό
// μένει για χειροκίνητα RT χωρίς δεμένα φορτία). closed ≠ complete (κλειδωμένο
// 24/8: το κλεισμένο δέχεται κόστη) — το «Ολοκληρώθηκε» μιλά για τη μεταφορά
// (πνεύμα Delivered του ενιαίου λεξιλογίου), το «Οριστικό» για τα λογιστικά.
function ctStatusBadge(t) {
  const legs = ((_ct.rts[t.id] || {}).ct_rt_legs || []).length;
  const [lbl, cls] =
    t.status === 'cancelled' ? ['Άκυρο', 'ct-b-canc'] :
    t.status === 'complete' ? ['Οριστικό', 'ct-b-final'] :
    t.status === 'closed' ? ['Ολοκληρώθηκε', 'ct-b-done'] :
    (legs || t.status === 'in_progress') ? ['Σε εξέλιξη', 'ct-b-run'] :
    ['Σχεδιασμένο', 'ct-b-pend'];
  return `<span class="ct-badge ${cls}">${lbl}</span>`;
}

// ── page ─────────────────────────────────────────────────────────
async function renderTripPnl() {
  const c = document.getElementById('content');
  if (typeof ROLE !== 'undefined' && ROLE !== 'owner') {
    c.innerHTML = `<div class="page-header"><div><div class="page-title">TRIP PnL</div></div></div>
      <div style="background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:40px;text-align:center;color:var(--text-dim)">
      🔒 Η κερδοφορία ανά δρομολόγιο είναι ορατή μόνο στον ιδιοκτήτη.</div>`;
    return;
  }
  c.innerHTML = ctStyles() + `
    <div class="page-header">
      <div>
        <div class="page-title">TRIP PnL <span class="ct-rolechip">🔒 Owner only</span></div>
        <div class="page-sub">Κερδοφορία ανά round trip · έσοδα auto από φορτία · κόστη καθαρό + ΦΠΑ χωριστά</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="ct-btn" onclick="ctOpenSettings()">⚙ Ρυθμίσεις</button>
        <button class="ct-btn ct-primary" onclick="ctOpenRtModal()">+ Νέο Round Trip</button>
      </div>
    </div>
    <div id="ctLede"></div>
    <div class="ct-stats" id="ctKpis"></div>
    <div class="ct-toolbar" id="ctToolbar2">
      <div class="ct-seg" id="ctScopeSeg">
        <button data-s="ALL" class="active" onclick="ctSetScope('ALL')">Όλα</button>
        <button data-s="INTL" onclick="ctSetScope('INTL')">Διεθνή</button>
        <button data-s="NATL" onclick="ctSetScope('NATL')">Εθνικά</button>
      </div>
      <select id="ctVehSel" onchange="ctSetVeh(this.value)"><option value="ALL">Όλος ο στόλος</option></select>
      <select id="ctGroup" onchange="_ct.group=this.value;ctRenderList()">
        <option value="trip">Δρομολόγια</option>
        <option value="truck">Ανά Φορτηγό / Partner</option>
        <option value="driver">Ανά Οδηγό</option>
        <option value="week">Ανά Εβδομάδα</option>
      </select>
      <span style="flex:1"></span>
      <button class="ct-btn" onclick="ctReload()">↻ Ανανέωση</button>
    </div>
    <div id="ctRecon"></div>
    <div id="ctList"></div>
    <div class="ct-overlay" id="ctOverlay" onclick="ctCloseAll()"></div>
    <div class="ct-panel" id="ctPanel"></div>
    <div class="ct-modal" id="ctModal"></div>`;
  await ctReload();
}

async function ctReload() {
  const list = document.getElementById('ctList');
  if (list) list.innerHTML = '<div class="ct-empty">Φόρτωση…</div>';
  // Reset ΟΛΩΝ των σημαιών αποτυχίας ανά φόρτωση — μια παλιά αποτυχία δεν
  // πρέπει να στοιχειώνει την επόμενη επιτυχία (εύρημα review 24/8).
  _ct.palletGateFailed = false; _ct.linesFailed = false;
  _ct.linesCapped = false; _ct.rtsCapped = false;
  _ct.loadFailed = false; _ct.loadError = '';
  try {
    // Φ4: pallet-gate failure must NOT take down the whole PnL page — a
    // missing auxiliary "is the sheet in?" signal is far less bad than the
    // owner losing the entire PnL list because one extra endpoint 404'd
    // (the gate views were only just added — 007_pallets_gates.sql — and may
    // not be live in every environment yet). .catch() isolates it from the
    // Promise.all so /costs/pnl and /costs/rt still load normally.
    const [pnl, rts, lookups, palletGate, lines] = await Promise.all([
      ctFetch('/costs/pnl'), ctFetch('/costs/rt'), _ct.lookups ? Promise.resolve({ cached: true }) : ctFetch('/costs/lookups'),
      ctFetch('/costs/pallet-gate').catch(e => { console.warn('[costs] pallet-gate failed', e.message); _ct.palletGateFailed = true; return { records: [] }; }),
      // Μία κλήση για ΟΛΕΣ τις γραμμές κόστους (όριο 300) — τροφοδοτεί το
      // cost-complete και τη «σκάλα» χωρίς N+1 αιτήματα ανά δρομολόγιο.
      // Αποτυχία εδώ = η πληρότητα κοστών γίνεται ΑΓΝΩΣΤΗ, όχι «μηδέν» —
      // η σημαία τη μετατρέπει σε ορατό μήνυμα αντί για ψευδή «κόστη ελλιπή».
      ctFetch('/costs/lines').catch(e => { console.warn('[costs] lines failed', e.message); _ct.linesFailed = true; return { records: [] }; })
    ]);
    _ct.pnl = pnl.records || [];
    _ct.rts = {}; (rts.records || []).forEach(r => { _ct.rts[r.id] = r; });
    if (!lookups.cached) _ct.lookups = lookups;
    _ct.palletGate = {}; (palletGate.records || []).forEach(g => { _ct.palletGate[g.rt_id] = g; });
    _ct.linesByRt = {}; (lines.records || []).forEach(l => { if (l.rt_id) (_ct.linesByRt[l.rt_id] = _ct.linesByRt[l.rt_id] || []).push(l); });
    // Ανίχνευση σιωπηλού κοψίματος του Worker (review 24/8): 300 γραμμές /
    // 200 rts είναι τα server-side όρια — αν τα πιάσαμε, παλαιότερα RT θα
    // εμφανίζονταν ψευδώς «χωρίς κόστη»/«χωρίς σκέλη». Λέγεται φωναχτά.
    _ct.linesCapped = (lines.records || []).length >= 300;
    _ct.rtsCapped = (rts.records || []).length >= 200;
    // Η διαδρομή με ονόματα είναι ρητό αίτημα owner (24/8) — ο εμπλουτισμός
    // τρέχει ΠΡΙΝ το render ώστε οι κάρτες να βγουν κατευθείαν πλήρεις· αν
    // αποτύχει, οι κάρτες βγαίνουν με ποσά + ορατή σημείωση, ποτέ κενές.
    await ctEnrich();
    ctRenderSummary(); ctRenderVehBar(); ctRenderList();
    ctRecon();
  } catch (e) {
    // Ορατό σφάλμα με επανάληψη — ποτέ κενή/μισή σελίδα (αρχή 1). Η σημαία
    // σφραγίζει το σφάλμα: ένα κλικ σε φίλτρο ΔΕΝ το αντικαθιστά με το
    // onboarding «δεν έχει γραφτεί τίποτα» (ψεύτικο κενό — review 24/8).
    _ct.loadFailed = true; _ct.loadError = e.message;
    if (list) list.innerHTML = ctErrorCard();
    const k = document.getElementById('ctKpis'); if (k) k.innerHTML = '';
    const ld = document.getElementById('ctLede'); if (ld) ld.innerHTML = '';
    const rc = document.getElementById('ctRecon'); if (rc) rc.innerHTML = '';
    const tb = document.getElementById('ctToolbar2'); if (tb) tb.style.display = 'none';
  }
}
function ctErrorCard() {
  return `<div class="ct-empty">⚠ Τα /costs/* δεν απάντησαν: <b>${ctEsc(_ct.loadError)}</b><br>
    <span style="font-size:12px">Τα νούμερα ΔΕΝ είναι μηδέν — απλώς δεν φορτώθηκαν.</span><br>
    <button class="ct-btn" style="margin-top:12px" onclick="ctReload()">↻ Δοκίμασε ξανά</button></div>`;
}

// ── Εμπλουτισμός διαδρομής (v3): pg id → πλήρες ORDERS record ─────────────
// Ίδια γέφυρα με το _plvEnrich του Pallet Ledger: όλα τα recs της (cached)
// λίστας ORDERS → /pallets/gate σε παρτίδες των 250 → χάρτης pg↔rec. Τα
// ονόματα πελατών λύνονται σε παρτίδες (fhBatchResolveClients), ΟΧΙ Ν+1.
async function ctEnrich() {
  _ct.orderByPg = null; _ct.pgByRec = {}; _ct.ordersAll = null; _ct.enrichFail = false;
  try {
    // Χωρίς αυτό, σε σκληρό reload οι κάρτες ζωγραφίζονται ΠΡΙΝ γεμίσει το
    // cache τοποθεσιών και κάθε προορισμός βγαίνει «—» (race, μετρήθηκε 24/8).
    // Το preloadReferenceData είναι deduped — αν έχει ήδη τρέξει, είναι no-op.
    if (typeof preloadReferenceData === 'function') await preloadReferenceData();
    const orders = await atGetAll(TABLES.ORDERS, {}, true);
    const byRec = {}; orders.forEach(o => { byRec[o.id] = o; });
    const recs = Object.keys(byRec);
    const m = {};
    for (let i = 0; i < recs.length; i += 250) {
      const g = await ctFetch('/pallets/gate?order_recs=' + recs.slice(i, i + 250).join(','));
      (g.records || []).forEach(r => {
        if (byRec[r.order_rec]) { m[r.order_id] = byRec[r.order_rec]; _ct.pgByRec[r.order_rec] = r.order_id; }
      });
    }
    _ct.orderByPg = m; _ct.ordersAll = orders;
    // Μόνο οι πελάτες των legs — λίγοι· χωρίς αυτό το fhClientName δείχνει
    // ουρά rec id αντί για όνομα (το «#1314» πρόβλημα της λίστας πελατών).
    const clientIds = new Set();
    Object.values(_ct.rts).forEach(rt => (rt.ct_rt_legs || []).forEach(l => {
      const o = l.order_id != null && m[l.order_id];
      const c = o && Array.isArray(o.fields['Client']) ? o.fields['Client'][0] : null;
      if (c) clientIds.add(c);
    }));
    if (clientIds.size && typeof fhBatchResolveClients === 'function') await fhBatchResolveClients([...clientIds]);
  } catch (e) {
    console.warn('[costs] enrich failed:', e && e.message);
    _ct.orderByPg = {}; _ct.enrichFail = true;
  }
}

// ── Cost-complete v1: έχει η γραμμή έστω μία καταχωρημένη γραμμή κόστους; ──
// Χωρίς αυτό, δρομολόγιο με έσοδα και 0 κόστη θα έδειχνε «περιθώριο 100%» —
// χειρότερο κι από το €0: το 100% μοιάζει με είδηση (εύρημα 24/8, αρχή 1).
function ctCostInfo(t) {
  const n = (_ct.linesByRt && _ct.linesByRt[t.id] ? _ct.linesByRt[t.id].length : 0);
  return { n, complete: n > 0 };
}
function ctIncompletePill(n) {
  return `<span class="ct-pill ct-amber" title="Το περιθώριο κρύβεται μέχρι να καταχωρηθούν κόστη — αλλιώς το άγραφο κόστος θα διαβαζόταν σαν καθαρό κέρδος">κόστη ελλιπή${n ? '' : ' · 0 γραμμές'}</span>`;
}

function ctVisible() {
  return _ct.pnl.filter(t =>
    (_ct.scope === 'ALL' || t.scope === _ct.scope) &&
    (_ct.veh === 'ALL' || (_ct.veh === 'PARTNERS' ? t.trip_type === 'PARTNER' : t.truck_id === _ct.veh)));
}

// Ποσό με πρόσημο για ρέον κείμενο: «−€620» αντί «€-620» (το ctEur αφήνει το
// μείον του toLocaleString μετά το €, που διαβάζεται σαν τυπογραφικό λάθος).
const ctSigned = n => (Number(n) < 0 ? '−' + ctEur(-n) : ctEur(n));

// Ενιαίο μπλοκ σύνοψης (owner 24/8: «πέντε κάρτες, πέντε στυλ» ήταν το κύριο
// σήμα «ερασιτεχνικό»): μία πρόταση-σύνοψη με πατήσιμα chips + ΜΙΑ λωρίδα με
// κοινό φόντο και κοινή τυπογραφική κλίμακα. Το «κόστη ελλιπή» ξεχωρίζει με
// χρώμα ΜΕΣΑ στο σύνολο, όχι με δικό του κουτί.
function ctRenderSummary() {
  const lede = document.getElementById('ctLede');
  const k = document.getElementById('ctKpis');
  const tb = document.getElementById('ctToolbar2');
  // Κενή βάση: η κενή κατάσταση (στο ctRenderList) είναι ΟΛΗ η σελίδα —
  // καμία κάρτα, κανένα «€0» που μοιάζει με μέτρηση.
  if (!_ct.pnl.length) { lede.innerHTML = ''; k.innerHTML = ''; if (tb) tb.style.display = 'none'; return; }
  if (tb) tb.style.display = '';
  const V = ctVisible();
  const rev = V.reduce((a, t) => a + Number(t.revenue || 0), 0);
  const gross = V.reduce((a, t) => a + Number(t.cost_gross || 0), 0);
  const net = V.reduce((a, t) => a + Number(t.cost_net || 0), 0);
  const vat = gross - net;
  const incomplete = V.filter(t => !ctCostInfo(t).complete);
  const losses = V.filter(t => ctCostInfo(t).complete && Number(t.profit_worst) < 0);
  const allComplete = V.length > 0 && incomplete.length === 0;
  // Πρόταση-σύνοψη (demo 24/8 — η ιδέα που ο owner ζήτησε πίσω): «Ν δρομολόγια
  // · Μ θέλουν κόστη · Καθαρό X (Y%)», με ΟΝΟΜΑΣΤΙΚΑ chips για ό,τι θέλει
  // προσοχή. Το Καθαρό υπακούει στην πύλη cost-complete: όσο λείπουν κόστη
  // δεν εμφανίζεται νούμερο — το «100% κέρδος» δεν υπάρχει πουθενά.
  // linesFailed: ΚΑΝΕΝΑ ονομαστικό chip «χωρίς κόστη» — θα κατηγορούσε ψευδώς
  // κάθε δρομολόγιο. Το σφάλμα το λέει η φράση του Καθαρού + η σημείωση.
  const chips = _ct.linesFailed ? [] : [
    ...incomplete.map(t => `<button class="ct-schip warn" onclick="ctOpenPanel(${t.id})">${ctEsc(t.code)} · χωρίς κόστη</button>`),
    ...losses.map(t => `<button class="ct-schip loss" onclick="ctOpenPanel(${t.id})">${ctEsc(t.code)} ${ctSigned(t.profit_worst)}</button>`)
  ];
  const chipHtml = chips.slice(0, 4).join('') + (chips.length > 4 ? `<span class="ct-schip more">+${chips.length - 4}</span>` : '');
  const netPhrase = _ct.linesFailed
    ? `Καθαρό <b class="warn">—</b> <span class="dim">άγνωστο — οι γραμμές κόστους δεν φόρτωσαν</span>`
    : allComplete
    ? `Καθαρό <b class="${rev - gross < 0 ? 'neg' : 'pos'}">${ctSigned(rev - gross)}</b> <span class="dim">(${rev ? ((rev - gross) / rev * 100).toFixed(1) + '%' : '—'})</span>`
    : `Καθαρό <b class="warn">—</b> <span class="dim">μη υπολογίσιμο όσο λείπουν κόστη</span>`;
  // Convoy strip (demo v3 — «όλη η εβδομάδα με μια ματιά»): κάθε RT μια
  // μπάρα, πλάτος ≈ έσοδα, χρώμα = κέρδος/ζημιά/χωρίς κόστη, ρίγες = σε
  // εξέλιξη. Κλικ = μετάβαση στην κάρτα του.
  const totRev = V.reduce((a, t) => a + Number(t.revenue || 0), 0) || 1;
  const convoy = V.length ? `<div class="ct-convoy">${[...V].sort((a, b) => (a.date_start < b.date_start ? -1 : 1)).map(t => {
    const ci = ctCostInfo(t);
    const cls = !ci.complete ? 'inc' : Number(t.profit_worst) < 0 ? 'loss' : 'prof';
    // Ίδιος κανόνας με το badge: planned ΧΩΡΙΣ legs = «Σχεδιασμένο», όχι ρίγες.
    const legsN = ((_ct.rts[t.id] || {}).ct_rt_legs || []).length;
    const run = (t.status === 'in_progress' || (t.status === 'planned' && legsN)) ? ' run' : '';
    const w = Math.max(6, Math.round(Number(t.revenue || 0) / totRev * 100));
    return `<span class="ct-cseg ${cls}${run}" style="flex:${w} 1 0" title="${ctEsc(t.code)} · έσοδα ${ctEur(t.revenue)}" onclick="ctScrollCard(${t.id})"></span>`;
  }).join('')}</div>
  <div class="ct-legend"><i class="d prof"></i>κέρδος <i class="d loss"></i>ζημιά <i class="d inc"></i>χωρίς κόστη <i class="d run"></i>σε εξέλιξη <span class="r">πλάτος ≈ έσοδα · κλικ = μετάβαση</span></div>` : '';
  lede.innerHTML = `<div class="ct-lede">
    <div class="ct-lsent">
    <button class="ct-schip" onclick="ctResetFilters()">${V.length} δρομολόγι${V.length === 1 ? 'ο' : 'α'}</button>
    <span class="sep">·</span>
    ${_ct.linesFailed
      ? `<span class="ct-schip warn" style="cursor:default">κόστη: σφάλμα φόρτωσης</span>`
      : incomplete.length
      ? `<button class="ct-schip warn" onclick="ctScrollList()">${incomplete.length} ${incomplete.length === 1 ? 'θέλει' : 'θέλουν'} κόστη</button>`
      : `<span>όλα με πλήρη κόστη</span>`}
    ${losses.length ? `<span class="sep">·</span><span>${losses.length} ζημιογόν${losses.length === 1 ? 'ο' : 'α'}</span>` : ''}
    ${chipHtml}
    <span class="sep">·</span> <span>${netPhrase}</span></div>
    ${convoy}</div>`;
  const netCell = allComplete
    ? `<div class="v" style="color:${rev - gross < 0 ? '#B91C1C' : '#047857'}">${ctSigned(rev - gross)}</div>
       <div class="s">margin ${rev ? ((rev - gross) / rev * 100).toFixed(1) + '%' : '—'} · χωρίς ΦΠΑ ${rev ? ((rev - net) / rev * 100).toFixed(1) + '%' : '—'}</div>`
    : `<div class="v warn">—</div><div class="s warn">κόστη ελλιπή σε ${incomplete.length} ${incomplete.length === 1 ? 'δρομολόγιο' : 'δρομολόγια'}</div>`;
  const lastCell = _ct.linesFailed
    ? `<div class="ct-stat"><div class="l warn">⚠ Κόστη</div><div class="v warn">;</div><div class="s warn">οι γραμμές δεν φόρτωσαν — άγνωστη πληρότητα</div></div>`
    : incomplete.length
    ? `<div class="ct-stat"><div class="l warn">⚠ Κόστη ελλιπή</div><div class="v warn">${incomplete.length} / ${V.length}</div><div class="s warn">το περιθώριο κρύβεται μέχρι να καταχωρηθούν</div></div>`
    : `<div class="ct-stat"><div class="l">Ζημιογόνα</div><div class="v" style="color:${losses.length ? '#B91C1C' : '#047857'}">${losses.length}</div><div class="s">${losses.length ? 'θέλουν απόφαση' : 'κανένα — με πλήρη κόστη'}</div></div>`;
  k.innerHTML = `
   <div class="ct-stat"><div class="l">Δρομολόγια</div><div class="v">${V.length}</div><div class="s">round trips στην τρέχουσα προβολή</div></div>
   <div class="ct-stat"><div class="l">Έσοδα</div><div class="v">${ctEur(rev)}</div><div class="s">auto από τα φορτία</div></div>
   <div class="ct-stat"><div class="l">Κόστη καταχωρημένα</div><div class="v">${ctEur(gross)}</div><div class="s">εκ των οποίων ΦΠΑ ${ctEur(vat)}</div></div>
   <div class="ct-stat"><div class="l">Καθαρό — worst case</div>${netCell}</div>
   ${lastCell}`;
}
function ctResetFilters() { _ct.veh = 'ALL'; ctSetScope('ALL'); const s = document.getElementById('ctVehSel'); if (s) s.value = 'ALL'; }
function ctScrollList() { document.getElementById('ctList')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

// Τα φίλτρα οχήματος έγιναν dropdown (owner review 24/8, σημείο 3): «τρεις
// σειρές χειριστηρίων για δύο γραμμές δεδομένων» — τώρα μία σειρά.
function ctRenderVehBar() {
  const sel = document.getElementById('ctVehSel'); if (!sel) return;
  const trucks = [...new Set(_ct.pnl.filter(t => t.truck_id).map(t => t.truck_id))];
  sel.innerHTML = '<option value="ALL">Όλος ο στόλος</option>' +
    trucks.map(id => `<option value="${id}">${ctEsc(ctTruckName(id))}</option>`).join('') +
    '<option value="PARTNERS">Partners</option>';
  sel.value = String(_ct.veh);
}
function ctSetVeh(v) { _ct.veh = (v === 'ALL' || v === 'PARTNERS') ? v : Number(v); ctRenderSummary(); ctRenderVehBar(); ctRenderList(); }
function ctSetScope(s) {
  _ct.scope = s;
  document.querySelectorAll('#ctScopeSeg button').forEach(b => b.classList.toggle('active', b.dataset.s === s));
  ctRenderSummary(); ctRenderList();
}

// Φ4: banner (real gate: N partner trips waiting on a sheet) + a quieter
// note (gate endpoint unreachable — never a lock, just missing info) shown
// above whichever list layout is active.
function ctPalletGateNotice(V) {
  const gatedCount = V.filter(t => t.trip_type === 'PARTNER' && _ct.palletGate[t.id] && _ct.palletGate[t.id].sheets_ok === false).length;
  const banner = gatedCount
    ? `<div style="background:#FEF3C7;color:#B45309;border:1px solid #FDE68A;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;font-weight:600">
        🔒 ${gatedCount} ${gatedCount === 1 ? 'διαδρομή partner περιμένει' : 'διαδρομές partner περιμένουν'} δελτίο παλετών</div>`
    : '';
  const failNote = _ct.palletGateFailed
    ? `<div class="ct-note" style="margin-bottom:10px">Ο έλεγχος δελτίων παλετών δεν φόρτωσε — τα PnL εμφανίζονται κανονικά, χωρίς αυτόν τον έλεγχο.</div>`
    : '';
  return banner + failNote;
}

function ctRenderList() {
  const V = ctVisible(), el = document.getElementById('ctList');
  // Σφραγισμένο σφάλμα φόρτωσης: όσο ισχύει, κάθε re-render δείχνει το
  // σφάλμα — όχι το onboarding κενό που θα διαβαζόταν ως «άδεια βάση».
  if (_ct.loadFailed) { el.innerHTML = ctErrorCard(); return; }
  if (!_ct.pnl.length) {
    // Η οθόνη που θα βλέπει ο owner μέχρι τον feeder: λέει ΤΙ είναι, ΓΙΑΤΙ
    // είναι κενή και ΤΙ θα τη γεμίσει — κανένα ψεύτικο μηδενικό (αρχή 1).
    el.innerHTML = `<div style="background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:44px 24px;text-align:center">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:17px">Το P&L είναι συνδεδεμένο — περιμένει το πρώτο round trip</div>
      <div style="color:var(--text-dim);font-size:13.5px;max-width:56ch;margin:8px auto 0">Κανένα νούμερο εδώ δεν είναι μηδέν· απλώς δεν έχει γραφτεί ακόμη τίποτα.
        Μια γραμμή Weekly = ένα round trip = ένα P&L. Η γραμμή κλείνει με την παράδοση του import — για Veroia Switch, με την άφιξη στη Βέροια.</div>
      <div style="text-align:left;max-width:46ch;margin:18px auto 0;font-size:13px">
        <div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px">Τι θα τη γεμίσει</div>
        <div style="padding:3px 0">1&nbsp;&nbsp;Δημιουργία round trip — χειροκίνητα τώρα («+ Νέο Round Trip»), αυτόματα από το Weekly στο επόμενο βήμα</div>
        <div style="padding:3px 0">2&nbsp;&nbsp;Καταχώρηση κοστών — DADI/DKV με σάρωση, τρίτα πρατήρια χειροκίνητα</div>
        <div style="padding:3px 0">3&nbsp;&nbsp;Με το κλείσιμο, η γραμμή κατατάσσεται στα κερδοφόρα ή στα ζημιογόνα</div>
      </div>
      <button class="ct-btn ct-primary" style="margin-top:18px" onclick="ctOpenRtModal()">+ Νέο Round Trip — ξεκίνα τον πιλότο</button>
    </div>`;
    return;
  }
  if (!V.length) {
    el.innerHTML = `<div class="ct-empty">Κανένα δρομολόγιο με αυτά τα φίλτρα.<br>
      <span style="font-size:12px">Δοκίμασε «Όλος ο στόλος» / «Όλα».</span></div>`;
    return;
  }
  // Ορατές προειδοποιήσεις αξιοπιστίας (review 24/8) — πριν από κάθε λίστα,
  // και στις ομαδοποιήσεις: αφορούν τα ίδια νούμερα.
  const warnNotes =
    (_ct.linesFailed ? `<div class="ct-note ct-nwarn">⚠ Οι γραμμές κόστους ΔΕΝ φόρτωσαν — η πληρότητα κοστών είναι <b>άγνωστη</b>, όχι μηδενική. Ό,τι δείχνει «κόστη;» παρακάτω μπορεί να έχει κανονικά κόστη. <button class="ct-btn" style="height:26px;padding:0 10px" onclick="ctReload()">↻ Ανανέωση</button></div>` : '') +
    (_ct.linesCapped ? `<div class="ct-note ct-nwarn">⚠ Φορτώθηκαν μόνο οι 300 νεότερες γραμμές κόστους (όριο Worker) — παλαιότερα δρομολόγια ίσως δείχνουν ψευδώς «χωρίς κόστη». Χρειάζεται σελιδοποίηση στο /costs (ουρά Worker).</div>` : '') +
    (_ct.rtsCapped ? `<div class="ct-note ct-nwarn">⚠ Φορτώθηκαν μόνο τα 200 νεότερα round trips (όριο Worker) — παλαιότερες κάρτες ίσως εμφανίζονται χωρίς σκέλη.</div>` : '');
  const notice = warnNotes + ctPalletGateNotice(V);
  if (_ct.group === 'trip') {
    // Γραμμή του νερού με ΚΑΡΤΕΣ (owner 24/8 v3: «το demo δεν ήταν πίνακας —
    // ήταν κάρτες»): πάνω ό,τι θέλει απόφαση — πρώτα τα ΧΩΡΙΣ κόστη (η κενή
    // κατάσταση είναι η σημαντικότερη), μετά οι ζημιές, χειρότερο margin
    // πρώτα — κάτω από το νερό οι κερδοφόρες. Αν το πάνω αδειάσει, αυτό
    // είναι το μήνυμα.
    const needsAction = V.filter(t => !ctCostInfo(t).complete || Number(t.profit_worst) < 0)
      .sort((a, b) => (ctCostInfo(a).complete ? 1 : 0) - (ctCostInfo(b).complete ? 1 : 0) || (a.margin_worst_pct ?? 999) - (b.margin_worst_pct ?? 999));
    const below = V.filter(t => ctCostInfo(t).complete && Number(t.profit_worst) >= 0)
      .sort((a, b) => (a.margin_worst_pct ?? 999) - (b.margin_worst_pct ?? 999));
    // Αποτυχία εμπλουτισμού = ορατή σημείωση, όχι σιωπηλά γυμνές κάρτες.
    const enrichNote = _ct.enrichFail
      ? `<div class="ct-note" style="margin-bottom:10px">⚠ Τα στοιχεία διαδρομής (πελάτες/προορισμοί) δεν φόρτωσαν — οι κάρτες δείχνουν μόνο ποσά. Δοκίμασε «↻ Ανανέωση».</div>` : '';
    el.innerHTML = notice + enrichNote +
      (needsAction.length
        ? `<div class="ct-secttl" style="color:#B45309">Θέλουν απόφαση ή κόστη — ${needsAction.length}</div>` + needsAction.map(ctCardHtml).join('')
        : `<div class="ct-empty" style="padding:16px;font-size:13px;margin-bottom:10px">Τίποτα δεν θέλει απόφαση — κανένα ζημιογόνο, καμία εκκρεμότητα κοστών. Αυτό είναι το μήνυμα.</div>`) +
      (needsAction.length && below.length
        ? `<div class="ct-wline"><span>θέλουν απόφαση ↑</span><span class="r"></span><span class="ct-mono" style="font-weight:700">0 €</span><span class="r"></span><span>κερδοφόρα ↓</span></div>` : '') +
      below.map(ctCardHtml).join('') +
      `<div style="font-size:12px;color:var(--text-dim);margin-top:8px">κλικ σε κάρτα για το πλήρες ανάπτυγμα · οι ζημιές σε παρένθεση</div>`;
    return;
  }
  const keyFn = _ct.group === 'truck' ? t => (t.trip_type === 'PARTNER' ? ctPartnerName(t.partner_id) : ctTruckName(t.truck_id))
    : _ct.group === 'driver' ? t => ctDriverName(t.driver_id) || ctPartnerName(t.partner_id)
    : t => { const d = new Date(t.date_start); const w = Math.ceil(((d - new Date(d.getFullYear(), 0, 1)) / 864e5 + new Date(d.getFullYear(), 0, 1).getDay() + 1) / 7); return 'Εβδ. ' + w; };
  const m = {};
  let skipped = 0;
  V.forEach(t => {
    // Στα αθροίσματα ομάδων μπαίνουν ΜΟΝΟ γραμμές με καταχωρημένα κόστη —
    // αλλιώς η ομάδα θα έδειχνε ψεύτικο περιθώριο. Οι υπόλοιπες μετριούνται ρητά.
    if (!ctCostInfo(t).complete) { skipped++; return; }
    const k = keyFn(t); (m[k] = m[k] || { n: 0, rev: 0, gross: 0, net: 0 }); m[k].n++; m[k].rev += Number(t.revenue || 0); m[k].gross += Number(t.cost_gross || 0); m[k].net += Number(t.cost_net || 0); });
  const rows = Object.entries(m).map(([k, v]) => ({ k, ...v, p: v.rev - v.gross, mg: v.rev ? (v.rev - v.gross) / v.rev * 100 : null, mx: v.rev ? (v.rev - v.net) / v.rev * 100 : null }))
    .sort((a, b) => (a.mg ?? 999) - (b.mg ?? 999)).map(r => `
    <tr><td style="font-weight:600">${ctEsc(r.k)}</td><td class="ct-num ct-mono">${r.n}</td>
    <td class="ct-num ct-mono">${ctEur(r.rev)}</td><td class="ct-num ct-mono">${ctEur(r.gross)}</td>
    <td class="ct-num ct-mono" style="font-weight:700;color:${r.p < 0 ? '#B91C1C' : '#047857'}">${ctEurP(r.p)}</td>
    <td style="text-align:center">${ctPill(r.mg != null ? Math.round(r.mg * 10) / 10 : null)}</td>
    <td class="ct-num ct-mono" style="color:var(--text-dim)">${r.mx != null ? r.mx.toFixed(1) + '%' : '—'}</td></tr>`).join('');
  const h = _ct.group === 'truck' ? 'Φορτηγό / Partner' : _ct.group === 'driver' ? 'Οδηγός' : 'Εβδομάδα';
  el.innerHTML = notice +
    (skipped ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:9px 13px;margin-bottom:10px;font-size:12.5px;color:#B45309">⚠ ${skipped} ${skipped === 1 ? 'δρομολόγιο' : 'δρομολόγια'} με ελλιπή κόστη ΔΕΝ μετρούν στα παρακάτω αθροίσματα.</div>` : '') +
    `<table class="ct-tbl"><thead><tr><th>${h}</th><th class="ct-num">Trips</th><th class="ct-num">Έσοδα</th>
    <th class="ct-num">Κόστη</th><th class="ct-num">Καθαρό</th><th style="text-align:center">Margin (ΦΠΑ)</th><th class="ct-num">χωρίς ΦΠΑ</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ── Κάρτα δρομολογίου (v3, εγκεκριμένο demo) ─────────────────────────────
// Ένα σκέλος = μία γραμμή διαδρομής με ονόματα. EXPORT: πελάτης → προορισμός
// (κατά το demo)· IMPORT: φόρτωση → εκφόρτωση («METRO Wien → Βέροια»).
function ctLegLine(l) {
  if (l.nat_load_id) {
    return `<div class="ct-leg"><span class="dchip vs">VS</span> <span style="color:var(--text-dim);font-style:italic">εθνικό σκέλος — εσωτερική μεταφορά, όχι έσοδο πελάτη</span></div>`;
  }
  const imp = String(l.direction || '').toUpperCase().includes('IMP');
  const o = _ct.orderByPg && _ct.orderByPg[l.order_id];
  const chip = `<span class="dchip ${imp ? 'imp' : 'exp'}">${imp ? 'IMPORT' : 'EXPORT'}</span>`;
  if (!o) return `<div class="ct-leg">${imp ? '<span class="ret">επιστροφή:</span> ' : ''}${chip} φορτίο #${l.order_id} <span style="color:var(--text-dim)">(στοιχεία διαδρομής μη διαθέσιμα)</span></div>`;
  const f = o.fields;
  const from = imp ? orderLoadName(f, 26) : fhClientName(f['Client']);
  const to = orderDelName(f, 26) || '—';
  const cc = orderLocCountry(f, 'del');
  const date = imp ? (f['Delivery DateTime'] || f['Loading DateTime']) : f['Loading DateTime'];
  const price = f['Price'] != null && f['Price'] !== '' ? ctEur(f['Price']) : '<span style="color:var(--text-dim)">χωρίς τιμή</span>';
  return `<div class="ct-leg">${imp ? '<span class="ret">επιστροφή:</span> ' : ''}${chip}
    <b>${imp ? ctEsc(from) : from}</b> <span class="arr">→</span> ${ctEsc(to)}${cc && !imp ? ' (' + cc + ')' : ''}
    · ${fmtDate(date)} · <span class="ct-mono">${price}</span></div>`;
}

// Σκάλα κόστους — ΠΑΝΤΑ ορατή στην κάρτα (owner 24/8: «το πιο πολύτιμο
// στοιχείο του demo»), όχι μόνο στα ζημιογόνα, όχι μόνο στο ανάπτυγμα.
function ctLadderHtml(t, ci, lines) {
  if (_ct.linesFailed) {
    return `<div class="ct-dwhy">Οι γραμμές κόστους δεν φόρτωσαν — η σκάλα δεν είναι διαθέσιμη. Το δρομολόγιο μπορεί να έχει κανονικά κόστη.</div>`;
  }
  if (!ci.complete) {
    return `<div class="ct-dwhy">Καμία γραμμή κόστους καταχωρημένη — το καθαρό/margin κρύβεται μέχρι την πρώτη, αλλιώς το άγραφο κόστος θα διαβαζόταν σαν καθαρό κέρδος.</div>
      <button class="ct-btn" style="margin-left:10px;vertical-align:bottom" onclick="event.stopPropagation();ctOpenCostModal(${t.id})">+ Καταχώρηση κόστους</button>`;
  }
  const cats = {};
  lines.forEach(l => { cats[l.category] = (cats[l.category] || 0) + Number(l.net || 0) + Number(l.vat || 0); });
  const maxV = Math.max(1, ...Object.values(cats));
  return `<div class="ct-dladder">${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([cat, v]) => `
    <div class="ct-dcat"><span class="n">${CT_CATEGORY_LABELS[cat] || cat}</span>
    <span class="b"><i style="width:${Math.round(v / maxV * 100)}%"></i></span>
    <span class="v ct-mono">${ctEur(v)}</span></div>`).join('')}</div>`;
}

// Αριθμοί δεξιά, στοιχισμένοι (πλάτος = πληροφορία): καθαρό μεγάλο + pill +
// έσοδα/κόστη μικρά. Χωρίς κόστη: η πύλη — pill + κουμπί, ΚΑΝΕΝΑ νούμερο.
function ctCardNums(t, ci) {
  // linesFailed: η πληρότητα είναι ΑΓΝΩΣΤΗ — ούτε margin ούτε ψευδές «ελλιπή».
  if (_ct.linesFailed) {
    return `<div class="ct-cnum"><span class="ct-pill ct-amber">κόστη; — σφάλμα φόρτωσης</span>
      <div class="sub">έσοδα ${ctEur(t.revenue)}</div></div>`;
  }
  if (!ci.complete) {
    return `<div class="ct-cnum">${ctIncompletePill(ci.n)}
      <div class="sub">έσοδα ${ctEur(t.revenue)} · κόστη άγραφα</div></div>`;
  }
  const p = Number(t.profit_worst); const loss = p < 0;
  return `<div class="ct-cnum">
    <div class="net ${loss ? 'neg' : 'pos'} ct-mono">${ctEurP(p)}</div>
    <div>${ctPill(t.margin_worst_pct)}</div>
    <div class="sub">έσοδα ${ctEur(t.revenue)} · κόστη ${ctEur(t.cost_gross)} · χωρίς ΦΠΑ ${t.margin_ex_vat_pct != null ? Number(t.margin_ex_vat_pct).toFixed(1) + '%' : '—'}</div>
  </div>`;
}

function ctCardHtml(t) {
  const ci = ctCostInfo(t);
  const gate = _ct.palletGate[t.id];
  const gated = t.trip_type === 'PARTNER' && gate && gate.sheets_ok === false;
  const legs = (_ct.rts[t.id] || {}).ct_rt_legs || [];
  const lines = (_ct.linesByRt && _ct.linesByRt[t.id]) || [];
  // Ρητή γραμμή επιστροφής όταν ΔΕΝ υπάρχει import (αίτημα owner 24/8) —
  // μόνο σε ιδιόκτητα: του συνεργάτη η επιστροφή δεν είναι δικό μας κόστος.
  const hasReturn = legs.some(l => String(l.direction || '').toUpperCase().includes('IMP') || l.nat_load_id);
  let returnLine = '';
  if (t.trip_type === 'OWNED') {
    if (!legs.length) {
      // Χειροκίνητο RT χωρίς δεμένα φορτία: ΔΕΝ ξέρουμε αν γύρισε άδειο —
      // το «γύρισε άδειο» εδώ θα ήταν ψέμα. Λέμε αυτό που ισχύει.
      returnLine = `<div class="ct-leg" style="color:var(--text-dim)">κανένα δεμένο φορτίο — η σύνδεση με φορτία έρχεται από τα planners (Φ2)</div>`;
    } else if (!hasReturn) {
      returnLine = (t.status === 'closed' || t.status === 'complete')
        ? `<div class="ct-leg ct-noret">επιστροφή: <b>καμία — γύρισε άδειο</b></div>`
        : `<div class="ct-leg" style="color:var(--text-dim)">επιστροφή: εκκρεμεί — δεν έχει δεθεί import ακόμη</div>`;
    }
  }
  // Το 🔒 των παλετών είναι ΔΙΚΗ ΤΟΥ γραμμή (owner 24/8, σημείο 6) — δεν
  // κρύβει πια το margin: προειδοποιεί ότι οι χαμένες παλέτες λείπουν από
  // τα νούμερα, χωρίς να τυφλώνει τον μόνο που τα χρειάζεται.
  const lockLine = gated
    ? `<div class="ct-locknote">🔒 Λείπει δελτίο παλετών σε ${gate.legs_needing_sheet - gate.legs_with_sheet} από ${gate.legs_needing_sheet} σκέλη — οι χαμένες παλέτες είναι κόστος που δεν φαίνεται ακόμη εδώ</div>` : '';
  const partnerNote = t.trip_type === 'PARTNER'
    ? `<div class="ct-leg" style="color:var(--text-dim);font-size:12px">κόμιστρο συνεργάτη — καύσιμα/διόδια/οδηγός είναι δικά του κόστη, όχι ελλιπή δικά μας</div>` : '';
  // Τα σκέλη δείχνουν τιμές παραγγελιών· το έσοδο trip αφαιρεί το εσωτερικό
  // VS κόμιστρο (view ct_v_rt_revenue). Χωρίς αυτή τη γραμμή, «2.700+3.100
  // αλλά έσοδα 5.150» διαβάζεται ως λάθος. Η διαφορά ΥΠΟΛΟΓΙΖΕΤΑΙ, δεν
  // αντιγράφεται η σταθερά (αρχή 3) — και αν δεν εξηγείται από VS, το λέμε.
  let vsNote = '';
  if (_ct.orderByPg) {
    const legsSum = legs.reduce((a, l) => {
      const o = l.order_id != null && _ct.orderByPg[l.order_id];
      return a + (o && o.fields['Price'] != null && o.fields['Price'] !== '' ? Number(o.fields['Price']) : 0);
    }, 0);
    const diff = Math.round(legsSum - Number(t.revenue || 0));
    if (diff > 0) {
      const hasVs = legs.some(l => { const o = l.order_id != null && _ct.orderByPg[l.order_id]; return o && o.fields['Veroia Switch']; });
      vsNote = hasVs
        ? `<div class="ct-leg" style="color:var(--text-dim);font-size:12px">⇄ Veroia Switch: −${ctEur(diff)} εσωτερική μεταφορά (δεν είναι έσοδο πελάτη) → έσοδο trip ${ctEur(t.revenue)}</div>`
        : `<div class="ct-leg" style="color:#B45309;font-size:12px">⚠ οι τιμές των σκελών αθροίζουν ${ctEur(legsSum)} αλλά το έσοδο trip είναι ${ctEur(t.revenue)} — ανεξήγητη διαφορά ${ctEur(diff)}</div>`;
    }
  }
  const why = ci.complete && Number(t.profit_worst) < 0 ? `<div class="ct-dwhy">⚠ ${ctWhyText(t, lines)}</div>` : '';
  return `<div class="ct-card" id="ctCard${t.id}" onclick="ctOpenPanel(${t.id})">
    <div class="ct-ctop">
      <div class="ct-cid">
        <span class="code">${ctEsc(t.code)}</span> ${ctChip(t)}
        <span class="dates ct-mono">${fmtDate(t.date_start)}${t.date_end ? ' → ' + fmtDate(t.date_end) : ''}</span>
        ${ctStatusBadge(t)}
        <button class="ct-addbtn" title="Καταχώρηση κόστους" onclick="event.stopPropagation();ctOpenCostModal(${t.id})">+</button>
      </div>
      ${ctCardNums(t, ci)}
    </div>
    <div class="ct-clegs">${legs.map(ctLegLine).join('')}${returnLine}${vsNote}${partnerNote}</div>
    ${lockLine}
    <div class="ct-cladder">${ctLadderHtml(t, ci, lines)}</div>
    ${why}
  </div>`;
}

function ctScrollCard(id) {
  const el = document.getElementById('ctCard' + id); if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400);
}

// ── Μετρητής συμφωνίας (εγκεκριμένος 24/8): «αν ο feeder σταματήσει, ποιος
// θα το πει;» — η ίδια η σελίδα, στην επόμενη φόρτωση. Συγκρίνει εκτελεσμένες
// διεθνείς παραγγελίες με ανάθεση ↔ σκέλη RT και ονομάζει όσες λείπουν.
function ctRecon() {
  const el = document.getElementById('ctRecon');
  if (!el) return;
  // v3: ξαναχρησιμοποιεί τη γέφυρα του ctEnrich — μία φόρτωση ORDERS + gate
  // τροφοδοτεί ΚΑΙ τις κάρτες ΚΑΙ τον μετρητή, όχι δύο (αρχή 3).
  if (_ct.enrichFail || !_ct.ordersAll) {
    el.innerHTML = '<div class="ct-note" style="margin-bottom:10px">Ο μετρητής συμφωνίας δεν έτρεξε — η γέφυρα παραγγελιών δεν φόρτωσε. Τα RT εμφανίζονται κανονικά.</div>';
    return;
  }
  const expected = _ct.ordersAll.filter(r => {
    const f = r.fields;
    // Κλειδωμένο (owner 24/8): ιστορικό ΧΩΡΙΣ backfill — ο μετρητής κοιτά
    // μόνο ό,τι φορτώθηκε από την ενεργοποίηση του feeder και μετά.
    return (f['Loading DateTime'] || '') >= '2026-08-24' &&
      (f['Status'] === 'Delivered' || f['Status'] === 'In Transit') &&
      f['Direction'] !== 'Import' &&
      (getLinkedId(f['Truck']) || (f['Is Partner Trip'] && getLinkedId(f['Partner'])));
  });
  const legIds = new Set();
  Object.values(_ct.rts).forEach(rt => (rt.ct_rt_legs || []).forEach(l => legIds.add(l.order_id)));
  const missing = expected.filter(r => _ct.pgByRec[r.id] != null && !legIds.has(_ct.pgByRec[r.id]));
  // Εκτός γέφυρας = η pl_v_order_gate δεν τις ξέρει (π.χ. χωρίς Loading stop):
  // ο μετρητής ΔΕΝ μπορεί να τις ελέγξει και το λέει — αλλιώς η σιωπή του θα
  // διαβαζόταν «όλα καλά» ακριβώς για τις πιο προβληματικές (review 24/8).
  const unbridged = expected.filter(r => _ct.pgByRec[r.id] == null);
  let html = missing.length ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:#B45309">
    ⚠ <b>${missing.length} εκτελεσμέν${missing.length === 1 ? 'η παραγγελία' : 'ες παραγγελίες'} χωρίς round trip</b> — ο feeder δεν τις έπιασε.
    Άνοιξε & ξανασώσε τη γραμμή στο Weekly, ή φτιάξε RT χειροκίνητα:
    ${missing.slice(0, 5).map(r => ctEsc(r.fields['Reference'] || r.id)).join(' · ')}${missing.length > 5 ? ' · +' + (missing.length - 5) : ''}</div>` : '';
  if (unbridged.length) html += `<div class="ct-note ct-nwarn">⚠ ${unbridged.length} εκτελεσμέν${unbridged.length === 1 ? 'η παραγγελία είναι' : 'ες παραγγελίες είναι'} εκτός γέφυρας (χωρίς Loading stop) — ο μετρητής δεν μπορεί να ελέγξει αν έχουν RT:
    ${unbridged.slice(0, 5).map(r => ctEsc(r.fields['Reference'] || r.id)).join(' · ')}${unbridged.length > 5 ? ' · +' + (unbridged.length - 5) : ''}</div>`;
  el.innerHTML = html;
}

// ── drill-down ───────────────────────────────────────────────────
async function ctOpenPanel(id) {
  const t = _ct.pnl.find(x => x.id === id); if (!t) return;
  _ct.openRt = id;
  const rt = _ct.rts[id] || {};
  const panel = document.getElementById('ctPanel');
  document.getElementById('ctOverlay').classList.add('open');
  panel.classList.add('open');
  panel.innerHTML = '<div class="ct-phead"><h2>' + ctEsc(t.code) + '</h2></div><div class="ct-empty">Φόρτωση κοστών…</div>';
  let lines = [], linesFetchFailed = false;
  try { lines = (await ctFetch('/costs/lines?rt_id=' + id)).records || []; } catch (e) { linesFetchFailed = true; }
  const linesNet = lines.reduce((a, l) => a + Number(l.net || 0), 0);
  // Σε αποτυχία fetch η «φθορά» ΔΕΝ υπολογίζεται: αλλιώς όλο το cost_net θα
  // εμφανιζόταν ως ψεύτικη γραμμή «Φθορά (auto)» (εύρημα review 24/8).
  const wear = linesFetchFailed ? 0 : Math.max(0, Number(t.cost_net || 0) - linesNet);
  // Η πληρότητα στο ανάπτυγμα κρίνεται από τα per-rt δεδομένα που ΜΟΛΙΣ
  // φορτώθηκαν — όχι από το κομμένο-στα-300 bulk της λίστας, που μπορεί να
  // αντιφάσκει με την ενότητα «Γραμμές (N)» δύο σημεία πιο κάτω.
  const complete = linesFetchFailed ? ctCostInfo(t).complete : lines.length > 0;
  const cats = {};
  lines.forEach(l => { const k = l.category; (cats[k] = cats[k] || { net: 0, vat: 0 }); cats[k].net += Number(l.net || 0); cats[k].vat += Number(l.vat || 0); });
  const maxV = Math.max(1, ...Object.values(cats).map(c => c.net + c.vat), wear);
  let costRows = Object.entries(cats).map(([k, v]) => `
    <div class="ct-crow"><span class="ct-cl">${CT_CATEGORY_LABELS[k] || k}</span>
    <span class="ct-bar"><i style="width:${Math.round((v.net + v.vat) / maxV * 100)}%"></i></span>
    <span class="ct-cv ct-mono">${ctEur(v.net + v.vat)}</span>
    <span class="ct-cvat ct-mono">${v.vat ? 'ΦΠΑ ' + ctEur(v.vat) : '—'}</span></div>`).join('');
  if (wear > 0.5) costRows += `<div class="ct-crow"><span class="ct-cl">Φθορά <span class="ct-badge ct-b-pend" style="font-size:10px">auto</span></span>
    <span class="ct-bar"><i style="width:${Math.round(wear / maxV * 100)}%;background:#64748B"></i></span>
    <span class="ct-cv ct-mono">${ctEur(wear)}</span><span class="ct-cvat ct-mono">€/km × km</span></div>`;
  if (linesFetchFailed) costRows = `<div class="ct-note ct-nwarn">⚠ Οι γραμμές κόστους δεν φόρτωσαν — η ανάλυση ανά κατηγορία δεν είναι διαθέσιμη. Τα σύνολα από κάτω έρχονται από τη βάση.</div>`;
  else if (!costRows) costRows = '<div style="font-size:12px;color:var(--text-dim)">Καμία γραμμή κόστους ακόμα — πρόσθεσε την πρώτη από τη φόρμα πιο πάνω.</div>';
  if (t.trip_type === 'PARTNER') costRows += `<div class="ct-lrow"><span style="font-style:italic;color:var(--text-dim)">Καύσιμα/διόδια/οδηγός δεν καταγράφονται εδώ — είναι κόστη του συνεργάτη, όχι ελλιπή δικά μας. Το δικό μας κόστος είναι το κόμιστρο.</span><span></span></div>`;
  const catOpts = Object.entries(CT_CATEGORY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  panel.innerHTML = `
    <div class="ct-phead"><button class="ct-close" onclick="ctCloseAll()">✕</button>
      <h2>${ctEsc(t.code)} · ${t.scope === 'NATL' ? 'Εθνικό' : 'Διεθνές'}</h2>
      <div class="ct-pmeta">${t.trip_type === 'PARTNER' ? 'Partner: ' + ctEsc(ctPartnerName(t.partner_id)) : ctEsc(ctTruckName(t.truck_id)) + (ctDriverName(t.driver_id) ? ' · ' + ctEsc(ctDriverName(t.driver_id)) : '')}
       · ${fmtDate(t.date_start)}${t.date_end ? ' → ' + fmtDate(t.date_end) : ''} · ${t.total_km ? t.total_km.toLocaleString('el-GR') + ' km' : 'χωρίς km'}</div>
      ${(t.trip_type === 'PARTNER' && _ct.palletGate[t.id] && _ct.palletGate[t.id].sheets_ok === false) ? `<div style="margin-top:8px;padding:6px 10px;background:rgba(251,191,36,.15);border-radius:6px;color:#FCD34D;font-size:12px;font-weight:600">
        🔒 Λείπει δελτίο παλετών σε ${_ct.palletGate[t.id].legs_needing_sheet - _ct.palletGate[t.id].legs_with_sheet} από ${_ct.palletGate[t.id].legs_needing_sheet} σκέλη — το PnL είναι ελλιπές</div>` : ''}
      ${t.status === 'planned' || t.status === 'in_progress' ? `<button class="ct-btn" style="margin-top:10px;background:#fff" onclick="ctCloseRt(${t.id})">🏁 Κλείσιμο trip (χειροκίνητο fallback)</button>` : ''}</div>
    ${!complete ? `<div class="ct-psec"><div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 14px">
      <div style="font-weight:700;color:#B45309;font-size:13px">⚠ Κόστη ελλιπή — καμία γραμμή κόστους ακόμη</div>
      <div style="font-size:12px;color:#B45309;margin-top:4px">Το καθαρό/margin δεν υπολογίζεται — το άγραφο κόστος θα διαβαζόταν σαν καθαρό κέρδος που δεν υπάρχει. Καταχώρησε τα κόστη ακριβώς από κάτω.</div>
    </div></div>` : `<div class="ct-psec"><div class="ct-duo">
      <div class="ct-m ct-mprimary"><div class="l">Καθαρό — με ΦΠΑ (worst case)</div><div class="v ct-mono" style="color:${Number(t.profit_worst) < 0 ? '#F87171' : '#34D399'}">${ctEurP(t.profit_worst)}</div><div class="s">margin ${t.margin_worst_pct != null ? Number(t.margin_worst_pct).toFixed(1) + '%' : '—'}</div></div>
      <div class="ct-m"><div class="l">Καθαρό — χωρίς ΦΠΑ</div><div class="v ct-mono" style="color:${Number(t.profit_ex_vat) < 0 ? '#B91C1C' : '#047857'}">${ctEurP(t.profit_ex_vat)}</div><div class="s">margin ${t.margin_ex_vat_pct != null ? Number(t.margin_ex_vat_pct).toFixed(1) + '%' : '—'} · ΦΠΑ ${ctEur(t.cost_vat)}</div></div>
    </div>${ctWhyLine(t, lines)}</div>`}
    <div class="ct-psec"><h3>+ Καταχώρηση κόστους (καθαρό + ΦΠΑ χωριστά)</h3>
      <div class="ct-qform">
        <select id="ctQcat">${catOpts}</select>
        <input type="number" id="ctQnet" placeholder="Καθαρό €" step="0.01">
        <input type="number" id="ctQvat" placeholder="ΦΠΑ €" step="0.01">
        <input type="date" id="ctQdate" value="${t.date_start}">
        <input type="text" id="ctQnote" placeholder="Σημείωση / παραστατικό">
        <button class="ct-btn ct-primary" onclick="ctQuickAdd(${t.id})">Αποθήκευση</button>
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:6px">${t.status === 'closed' || t.status === 'complete' ? 'Το δρομολόγιο έχει ολοκληρωθεί — δέχεται κανονικά κόστη: τα τιμολόγια έρχονται και εβδομάδες μετά.' : 'ΦΠΑ 24% = καθαρό × 0,24 · 0 για reverse charge εξωτερικού.'}</div></div>
    <div class="ct-psec"><h3>Έσοδα (auto από τα legs)</h3>
      ${(rt.ct_rt_legs || []).map(l => l.nat_load_id
        ? `<div class="ct-lrow"><span style="font-style:italic;color:var(--text-dim)">⇄ Εθνικό σκέλος VS — εσωτερική μεταφορά (x_export 850 / x_import 650), όχι έσοδο πελάτη</span><span class="ct-mono" style="color:var(--text-dim)">memo</span></div>`
        : `<div class="ct-lrow"><span>${String(l.direction || '').toUpperCase().includes('IMP') ? 'Import' : 'Export'} · διεθνές φορτίο #${l.order_id}</span><span></span></div>`).join('')}
      <div class="ct-totrow"><span>${(rt.ct_rt_legs || []).length || 0} συνδεδεμένα φορτία ${!(rt.ct_rt_legs || []).length ? '· <span style="color:#B45309">σύνδεση από planners στο επόμενο βήμα</span>' : ''}</span><span class="ct-mono">${ctEur(t.revenue)}</span></div></div>
    <div class="ct-psec"><h3>Κόστη ανά κατηγορία</h3>${costRows}
      <div class="ct-totrow ct-mini"><span>Καθαρό κόστος (+φθορά)</span><span class="ct-mono">${ctEur(t.cost_net)}</span></div>
      <div class="ct-totrow ct-mini"><span>ΦΠΑ</span><span class="ct-mono">${ctEur(t.cost_vat)}</span></div>
      <div class="ct-totrow"><span>Σύνολο κόστους</span><span class="ct-mono">${ctEur(t.cost_gross)}</span></div></div>
    ${lines.length ? `<div class="ct-psec"><h3>Γραμμές (${lines.length})</h3>${lines.map(l => `
      <div class="ct-lrow"><span>${CT_CATEGORY_LABELS[l.category] || l.category}${l.note ? ' · <span style="color:var(--text-dim)">' + ctEsc(l.note) + '</span>' : ''}</span>
      <span class="ct-mono">${ctEur(l.net)}${Number(l.vat) ? ' <span style="color:var(--text-dim)">+' + ctEur(l.vat) + ' ΦΠΑ</span>' : ''}</span></div>`).join('')}</div>` : ''}`;
}

// Κοινός POST — τον μοιράζονται η φόρμα του ανάπτυγματος και το modal της
// γραμμής, ώστε το σχήμα του αιτήματος να ζει σε ΕΝΑ σημείο (αρχή 3).
async function ctPostCostLine(rtId, line) {
  return ctFetch('/costs/lines', { method: 'POST', body: { rt_id: rtId, ...line } });
}

async function ctQuickAdd(rtId) {
  const net = parseFloat(document.getElementById('ctQnet').value);
  const vat = parseFloat(document.getElementById('ctQvat').value) || 0;
  if (isNaN(net)) { alert('Βάλε καθαρό ποσό'); return; }
  try {
    await ctPostCostLine(rtId, { category: document.getElementById('ctQcat').value,
      net, vat, line_date: document.getElementById('ctQdate').value || null,
      note: document.getElementById('ctQnote').value || null });
    await ctReload(); ctOpenPanel(rtId);
  } catch (e) { alert('Σφάλμα: ' + e.message); }
}

// Καταχώρηση κόστους από τη ΓΡΑΜΜΗ (owner review 24/8: «ο πιλότος είναι
// αδύνατος» χωρίς αυτήν) — ίδια πεδία με τη φόρμα του ανάπτυγματος, χωρίς να
// χρειάζεται να ανοίξει το πάνελ. Και τα ολοκληρωμένα RT δέχονται γραμμές
// (closed ≠ complete, κλειδωμένο 24/8): τα τιμολόγια έρχονται εβδομάδες μετά.
function ctOpenCostModal(id) {
  const t = _ct.pnl.find(x => x.id === id); if (!t) return;
  const catOpts = Object.entries(CT_CATEGORY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  document.getElementById('ctOverlay').classList.add('open');
  const m = document.getElementById('ctModal');
  m.classList.add('open');
  m.innerHTML = `
    <div class="ct-mhead">Καταχώρηση κόστους — ${ctEsc(t.code)} <button class="ct-close" onclick="ctCloseAll()">✕</button></div>
    <div class="ct-mbody">
      <div class="ct-fgrid">
        <label>Κατηγορία<select id="ctMcat">${catOpts}</select></label>
        <label>Ημερομηνία<input type="date" id="ctMdate" value="${ctEsc(t.date_start)}"></label>
        <label>Καθαρό €<input type="number" id="ctMnet" step="0.01" placeholder="π.χ. 320"></label>
        <label>ΦΠΑ € (χωριστά)<input type="number" id="ctMvat" step="0.01" placeholder="0 για reverse charge"></label>
        <label style="grid-column:1/-1">Σημείωση / παραστατικό<input type="text" id="ctMnote"></label>
      </div>
      <div class="ct-note">${t.status === 'closed' || t.status === 'complete' ? 'Το δρομολόγιο έχει ολοκληρωθεί — δέχεται κανονικά κόστη: τα τιμολόγια έρχονται και εβδομάδες μετά.' : 'ΦΠΑ 24% = καθαρό × 0,24 · 0 για reverse charge εξωτερικού.'}</div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">
        <button class="ct-btn" onclick="ctCloseAll()">Άκυρο</button>
        <button class="ct-btn ct-primary" onclick="ctModalSaveCost(${t.id})">Αποθήκευση</button>
      </div>
    </div>`;
  document.getElementById('ctMnet').focus();
}
async function ctModalSaveCost(rtId) {
  const net = parseFloat(document.getElementById('ctMnet').value);
  const vat = parseFloat(document.getElementById('ctMvat').value) || 0;
  if (isNaN(net)) { alert('Βάλε καθαρό ποσό'); return; }
  try {
    await ctPostCostLine(rtId, { category: document.getElementById('ctMcat').value,
      net, vat, line_date: document.getElementById('ctMdate').value || null,
      note: document.getElementById('ctMnote').value || null });
    ctCloseAll(); await ctReload();
  } catch (e) { alert('Σφάλμα: ' + e.message); }
}

async function ctCloseRt(id) {
  if (!confirm('Κλείσιμο trip; (κανονικά κλείνει αυτόματα με την παράδοση/άφιξη VS — αυτό είναι το χειροκίνητο fallback)')) return;
  try { await ctFetch('/costs/rt/' + id, { method: 'PATCH', body: { status: 'closed' } }); await ctReload(); ctOpenPanel(id); }
  catch (e) { alert('Σφάλμα: ' + e.message); }
}

// Η εξήγηση «γιατί» μιας ζημιάς, όπου βγαίνει από τα δεδομένα (demo §2):
// χωρίς import = γύρισε άδειο· πρόστιμα ονομαστικά· αλλιώς το ποσό υπέρβασης.
// Κείμενο χωριστά από το περιτύλιγμα: το ίδιο «γιατί» ζει και στη λίστα
// (κάρτα) και στο ανάπτυγμα (ctWhyLine).
function ctWhyText(t, lines) {
  const legs = (_ct.rts[t.id] || {}).ct_rt_legs || [];
  // Το VS εθνικό σκέλος ΕΙΝΑΙ επιστροφή — χωρίς το nat_load_id εδώ, η κάρτα
  // θα έδειχνε σκέλος VS και από κάτω «γύρισε άδειο» (αντίφαση, review 24/8).
  const hasImport = legs.some(l => String(l.direction || '').toUpperCase().includes('IMP') || l.nat_load_id);
  const fines = (lines || []).filter(l => l.category === 'fines').reduce((a, l) => a + Number(l.net || 0) + Number(l.vat || 0), 0);
  if (legs.length && !hasImport) return `Χωρίς δεμένο import — γύρισε άδειο. Ένα return φορτίο ≥ ${ctEur(-t.profit_worst)} το γύριζε κερδοφόρο.`;
  if (fines > 0) return `Πρόστιμα ${ctEur(fines)} — χωρίς αυτά το αποτέλεσμα θα ήταν ${ctEur(Number(t.profit_worst) + fines)}.`;
  return `Τα κόστη ξεπερνούν τα έσοδα κατά ${ctEur(-t.profit_worst)}.`;
}
function ctWhyLine(t, lines) {
  if (!(Number(t.profit_worst) < 0)) return '';
  return `<div style="margin-top:10px;background:#FEF3C7;color:#92400E;border-radius:8px;padding:8px 12px;font-size:12.5px">⚠ ${ctWhyText(t, lines)}</div>`;
}

// ── manual RT modal ──────────────────────────────────────────────
function ctOpenRtModal() {
  const lk = _ct.lookups || { trucks: [], trailers: [], drivers: [], partners: [] };
  const opt = (rows, label, none) => `<option value="">${none || '—'}</option>` + rows.filter(r => r.active !== false).map(r => `<option value="${r.id}">${ctEsc(r[label])}</option>`).join('');
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('ctOverlay').classList.add('open');
  const m = document.getElementById('ctModal');
  m.classList.add('open');
  m.innerHTML = `
    <div class="ct-mhead">Νέο Round Trip — κέντρο κόστους <button class="ct-close" onclick="ctCloseAll()">✕</button></div>
    <div class="ct-mbody">
      <div class="ct-fgrid">
        <label>Scope<select id="ctFscope"><option value="INTL">Διεθνές</option><option value="NATL">Εθνικό</option></select></label>
        <label>Τύπος<select id="ctFtype" onchange="document.getElementById('ctFpartnerWrap').style.display=this.value==='PARTNER'?'':'none'"><option value="OWNED">Ιδιόκτητο</option><option value="PARTNER">Partner</option></select></label>
        <label>Φορτηγό<select id="ctFtruck">${opt(lk.trucks, 'license_plate')}</select></label>
        <label>Τρέιλερ<select id="ctFtrailer">${opt(lk.trailers, 'license_plate')}</select></label>
        <label>Οδηγός<select id="ctFdriver">${opt(lk.drivers, 'full_name')}</select></label>
        <label id="ctFpartnerWrap" style="display:none">Partner<select id="ctFpartner">${opt(lk.partners, 'company_name')}</select></label>
        <label>Έναρξη<input type="date" id="ctFstart" value="${today}"></label>
        <label>Λήξη (αν είναι γνωστή)<input type="date" id="ctFend"></label>
        <label>Σύνολο km (χειροκίνητα)<input type="number" id="ctFkm" placeholder="π.χ. 4980"></label>
        <label style="grid-column:1/-1">Σημείωση<input type="text" id="ctFnotes" placeholder="π.χ. GR→DE VS export"></label>
      </div>
      <div class="ct-note">Κανονικά τα round trips δημιουργούνται αυτόματα από τα Weekly planners (Φ2) — αυτό είναι το χειροκίνητο δίχτυ ασφαλείας. Η σύνδεση με φορτία/έσοδα γίνεται στη Φ2· τα κόστη μπορούν να καταχωρούνται από τώρα.</div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">
        <button class="ct-btn" onclick="ctCloseAll()">Άκυρο</button>
        <button class="ct-btn ct-primary" onclick="ctCreateRt()">Δημιουργία</button>
      </div>
    </div>`;
}

async function ctCreateRt() {
  const v = id => document.getElementById(id).value;
  const type = v('ctFtype');
  const body = {
    scope: v('ctFscope'), trip_type: type, source: 'manual',
    truck_id: v('ctFtruck') ? Number(v('ctFtruck')) : null,
    trailer_id: v('ctFtrailer') ? Number(v('ctFtrailer')) : null,
    driver_id: v('ctFdriver') ? Number(v('ctFdriver')) : null,
    partner_id: v('ctFpartner') ? Number(v('ctFpartner')) : null,
    date_start: v('ctFstart'), date_end: v('ctFend') || null,
    total_km: v('ctFkm') ? Number(v('ctFkm')) : null
  };
  if (type === 'OWNED' && !body.truck_id) { alert('Το ιδιόκτητο θέλει φορτηγό'); return; }
  if (type === 'PARTNER' && !body.partner_id) { alert('Το partner trip θέλει partner'); return; }
  try {
    const res = await ctFetch('/costs/rt', { method: 'POST', body });
    ctCloseAll(); await ctReload();
    if (res.record) ctOpenPanel(res.record.id);
  } catch (e) { alert('Σφάλμα: ' + e.message); }
}

// ── settings ─────────────────────────────────────────────────────
async function ctOpenSettings() {
  document.getElementById('ctOverlay').classList.add('open');
  const m = document.getElementById('ctModal');
  m.classList.add('open');
  m.innerHTML = '<div class="ct-mhead">⚙ Ρυθμίσεις COSTS <button class="ct-close" onclick="ctCloseAll()">✕</button></div><div class="ct-mbody ct-empty">Φόρτωση…</div>';
  const labels = { x_export: 'X — VS transfer (export)', x_import: 'X — VS transfer (import)', pallet_eur: 'Αξία παλέτας EUR', vat_default: 'Προεπιλογή ΦΠΑ', wear_fallback_eur_km: 'Φθορά €/km (fallback)' };
  try {
    const s = await ctFetch('/costs/settings');
    m.querySelector('.ct-mbody').innerHTML = (s.records || []).map(r => `
      <div class="ct-srow"><span>${labels[r.key] || r.key}</span>
      <input type="number" step="0.001" id="ctS_${r.key}" value="${r.value}">
      <button class="ct-btn" onclick="ctSaveSetting('${r.key}')">Αποθήκευση</button></div>`).join('') +
      '<div class="ct-note">Owner-only. Οι αλλαγές επηρεάζουν ΟΛΟΥΣ τους υπολογισμούς PnL άμεσα (τα views διαβάζουν live).</div>';
  } catch (e) { m.querySelector('.ct-mbody').innerHTML = '⚠ ' + ctEsc(e.message); }
}
async function ctSaveSetting(key) {
  try {
    await ctFetch('/costs/settings', { method: 'PATCH', body: { key, value: parseFloat(document.getElementById('ctS_' + key).value) } });
    await ctReload(); alert('Αποθηκεύτηκε — τα PnL ενημερώθηκαν.');
  } catch (e) { alert('Σφάλμα: ' + e.message); }
}

function ctCloseAll() {
  document.getElementById('ctOverlay')?.classList.remove('open');
  document.getElementById('ctPanel')?.classList.remove('open');
  document.getElementById('ctModal')?.classList.remove('open');
}

// ── scoped styles (TMS tokens) ───────────────────────────────────
function ctStyles() { return `<style>
.ct-rolechip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:4px 10px;border-radius:9999px;background:var(--navy-mid,#0B1929);color:#38BDF8;border:1px solid rgba(56,189,248,.3);vertical-align:middle}
.ct-lede{background:var(--navy-mid,#0B1929);color:#E2E8F0;border-radius:12px;padding:13px 18px;margin-bottom:10px;font-size:13.5px;font-weight:500;display:flex;flex-direction:column;gap:9px}
.ct-lsent{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.ct-lede .sep{color:#475569}.ct-lede .dim{color:#7DA6CE;font-size:12px}
.ct-convoy{display:flex;gap:3px;height:22px}
.ct-cseg{border-radius:4px;cursor:pointer;min-width:14px;opacity:.95}
.ct-cseg:hover{opacity:1;outline:1px solid rgba(255,255,255,.55)}
.ct-cseg.prof{background:#22C55E}.ct-cseg.loss{background:#DC2626}.ct-cseg.inc{background:#F59E0B}
.ct-cseg.run{background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.4) 0 5px,transparent 5px 11px)}
.ct-legend{display:flex;align-items:center;gap:6px;font-size:11px;color:#94A3B8;flex-wrap:wrap}
.ct-legend .d{width:9px;height:9px;border-radius:2px;display:inline-block}
.ct-legend .d.prof{background:#22C55E}.ct-legend .d.loss{background:#DC2626}.ct-legend .d.inc{background:#F59E0B}
.ct-legend .d.run{background:#64748B;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.5) 0 2px,transparent 2px 4px)}
.ct-legend .r{margin-left:auto}
.ct-lede b.pos{color:#4ADE80}.ct-lede b.neg{color:#F87171}.ct-lede b.warn{color:#FCD34D}
.ct-schip{font-family:inherit;border:1px solid rgba(148,163,184,.35);background:rgba(148,163,184,.12);color:#E2E8F0;border-radius:9999px;padding:3px 12px;font-size:12px;font-weight:600;cursor:pointer}
.ct-schip:hover{background:rgba(148,163,184,.22)}
.ct-schip.warn{background:rgba(251,191,36,.14);border-color:rgba(251,191,36,.4);color:#FCD34D}
.ct-schip.loss{background:rgba(248,113,113,.13);border-color:rgba(248,113,113,.4);color:#FCA5A5}
.ct-schip.more{cursor:default;color:#94A3B8}
.ct-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1px;background:rgba(0,0,0,.07);border:1px solid rgba(0,0,0,.07);border-radius:12px;overflow:hidden;margin-bottom:14px}
.ct-stats:empty{display:none}
.ct-stat{background:#fff;padding:13px 17px}
.ct-stat .l{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim);font-weight:600}
.ct-stat .v{font-family:'Syne',sans-serif;font-size:21px;font-weight:800;margin-top:3px;font-variant-numeric:tabular-nums}
.ct-stat .s{font-size:11.5px;color:var(--text-dim);margin-top:2px}
.ct-stat .warn{color:#B45309}
.ct-toolbar{display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.ct-toolbar select{font-family:inherit;font-size:13px;padding:7px 11px;border:1px solid rgba(0,0,0,.12);border-radius:8px;background:#fff}
.ct-seg{display:flex;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:8px;padding:3px;gap:2px}
.ct-seg button{background:none;border:none;font-family:inherit;font-size:12px;font-weight:500;color:var(--text-dim);padding:6px 13px;border-radius:6px;cursor:pointer}
.ct-seg button.active{background:var(--accent,#0284C7);color:#fff}
.ct-btn{display:inline-flex;align-items:center;gap:7px;padding:0 14px;height:34px;border-radius:6px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--accent,#0284C7);background:#fff;color:var(--accent,#0284C7)}
.ct-btn.ct-primary{background:linear-gradient(135deg,#0C2D5C,var(--accent,#0284C7));color:#fff;border:none}
.ct-tbl{width:100%;background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:12px;border-collapse:separate;border-spacing:0;overflow:hidden}
.ct-tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim);text-align:left;padding:10px 13px;border-bottom:1px solid #E2E8F0;background:#F8FAFC}
.ct-tbl td{padding:10px 13px;border-bottom:1px solid rgba(0,0,0,.06);font-size:13px}
.ct-tbl tbody tr{cursor:pointer}.ct-tbl tbody tr:hover{background:#F0F9FF}.ct-tbl tr:last-child td{border-bottom:none}
.ct-num{text-align:right}.ct-mono{font-variant-numeric:tabular-nums}
.ct-pill{display:inline-block;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:700}
.ct-red{background:#7F1D1D;color:#fff}.ct-amber{background:#FEF3C7;color:#B45309}.ct-green{background:#DCFCE7;color:#166534}.ct-dim{color:var(--text-dim)}
.ct-chip{display:inline-block;padding:2px 9px;border-radius:6px;font-size:11px;font-weight:600}
.ct-owned{background:#0C2D5C;color:#fff}.ct-partner{background:#14532D;color:#fff}.ct-natl{background:#E0F2FE;color:#075985;border:1px solid #BAE6FD}
.ct-badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:500;white-space:nowrap}
.ct-b-pend{background:#E2E8F0;color:#475569}.ct-b-run{background:#E0F2FE;color:#075985}
.ct-b-done{background:#DCFCE7;color:#166534}.ct-b-final{background:#166534;color:#fff}.ct-b-canc{background:#FEE2E2;color:#B91C1C}
.ct-empty{background:#fff;border:1px dashed rgba(0,0,0,.15);border-radius:12px;padding:34px;text-align:center;color:var(--text-dim);font-size:14px}
.ct-secttl{font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;margin:14px 0 8px}
.ct-wline{display:flex;align-items:center;gap:10px;background:rgba(2,132,199,.06);border-radius:8px;padding:8px 14px;margin:16px 0 10px;font-size:12px;color:var(--accent,#0284C7);font-weight:600}
.ct-wline .r{flex:1;border-top:2px solid var(--accent,#0284C7);opacity:.3}
.ct-card{background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px 18px 12px;margin-bottom:10px;cursor:pointer;transition:box-shadow .15s}
.ct-card:hover{box-shadow:0 3px 14px rgba(11,25,41,.09)}
.ct-card.flash{outline:2px solid #38BDF8;outline-offset:2px}
.ct-ctop{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.ct-cid{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ct-cid .code{font-family:'Syne',sans-serif;font-weight:800;font-size:15px}
.ct-cid .dates{font-size:12.5px;color:var(--text-dim)}
.ct-cnum{text-align:right;flex-shrink:0}
.ct-cnum .net{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;line-height:1.1;margin-bottom:3px}
.ct-cnum .net.pos{color:#047857}.ct-cnum .net.neg{color:#B91C1C}
.ct-cnum .sub{font-size:11.5px;color:var(--text-dim);margin-top:3px}
.ct-clegs{margin-top:9px;border-top:1px dashed rgba(0,0,0,.07);padding-top:8px}
.ct-leg{font-size:13px;padding:2px 0}
.ct-leg .arr{color:var(--text-dim)}
.ct-leg .ret{color:var(--text-dim);font-size:12px}
.ct-leg.ct-noret{color:#B45309}
.dchip{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.04em;padding:1px 7px;border-radius:5px;vertical-align:1px}
.dchip.exp{background:#E0F2FE;color:#075985}.dchip.imp{background:#DCFCE7;color:#166534}.dchip.vs{background:#F1F5F9;color:#475569}
.ct-locknote{margin-top:8px;font-size:12.5px;color:#B45309;background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:6px 10px}
.ct-cladder{margin-top:9px;max-width:520px}
.ct-dladder{max-width:460px}
.ct-dcat{display:flex;align-items:center;gap:9px;font-size:12px;padding:2px 0}
.ct-dcat .n{width:118px;color:var(--text-dim)}
.ct-dcat .b{flex:1;height:6px;background:#E8EEF5;border-radius:3px;overflow:hidden}
.ct-dcat .b i{display:block;height:100%;background:var(--accent,#0284C7);border-radius:3px}
.ct-dcat .v{width:72px;text-align:right;font-weight:500}
.ct-dwhy{display:inline-block;font-size:12.5px;color:#92400E;background:#FEF3C7;border-radius:6px;padding:6px 10px;margin-top:6px}
.ct-addbtn{width:24px;height:24px;border-radius:6px;border:1px solid rgba(2,132,199,.4);background:#fff;color:var(--accent,#0284C7);font-size:15px;font-weight:700;line-height:1;cursor:pointer}
.ct-addbtn:hover{background:#F0F9FF}
.ct-overlay{position:fixed;inset:0;background:rgba(11,25,41,.45);opacity:0;pointer-events:none;transition:.2s;z-index:9000}
.ct-overlay.open{opacity:1;pointer-events:auto}
.ct-panel{position:fixed;top:0;right:-540px;width:540px;max-width:96vw;height:100vh;background:#fff;box-shadow:-8px 0 30px rgba(11,25,41,.25);transition:right .25s;z-index:9100;overflow-y:auto}
.ct-panel.open{right:0}
.ct-phead{background:var(--navy-mid,#0B1929);color:#fff;padding:18px 22px}
.ct-phead h2{font-family:'Syne',sans-serif;font-size:17px;margin:0 0 4px}
.ct-pmeta{font-size:12px;color:#94A3B8}
.ct-close{float:right;background:none;border:none;color:#94A3B8;font-size:18px;cursor:pointer}
.ct-psec{padding:15px 22px;border-bottom:1px solid rgba(0,0,0,.06)}
.ct-psec h3{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--text-dim);margin:0 0 10px}
.ct-duo{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ct-m{border:1px solid rgba(0,0,0,.1);border-radius:8px;padding:11px 13px}
.ct-mprimary{background:var(--navy-mid,#0B1929);border-color:var(--navy-mid,#0B1929)}
.ct-m .l{font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px}
.ct-mprimary .l{color:#7DA6CE}
.ct-m .v{font-family:'Syne',sans-serif;font-size:21px;font-weight:800;margin-top:4px}
.ct-m .s{font-size:11px;color:var(--text-dim);margin-top:2px}.ct-mprimary .s{color:#7DA6CE}
.ct-crow{display:flex;align-items:center;gap:10px;margin-bottom:7px;font-size:13px}
.ct-cl{width:128px}.ct-bar{flex:1;height:8px;background:#F1F5F9;border-radius:4px;overflow:hidden}
.ct-bar i{display:block;height:100%;background:var(--accent,#0284C7);border-radius:4px}
.ct-cv{width:74px;text-align:right;font-weight:500}.ct-cvat{width:84px;text-align:right;font-size:11px;color:var(--text-dim)}
.ct-totrow{display:flex;justify-content:space-between;font-weight:700;font-size:13px;padding-top:8px;border-top:1px dashed rgba(0,0,0,.1)}
.ct-totrow.ct-mini{font-weight:500;color:var(--text-dim);border-top:none;padding-top:2px}
.ct-lrow{display:flex;justify-content:space-between;font-size:12.5px;padding:5px 0;border-bottom:1px dashed rgba(0,0,0,.06)}
.ct-qform{display:grid;grid-template-columns:1.2fr .8fr .7fr 1fr 1.4fr auto;gap:8px}
.ct-qform input,.ct-qform select{font-family:inherit;font-size:12px;padding:7px 9px;border:1px solid rgba(0,0,0,.12);border-radius:6px;min-width:0}
.ct-modal{position:fixed;top:50%;left:50%;width:600px;max-width:94vw;max-height:90vh;overflow-y:auto;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(11,25,41,.3);z-index:9200;transform:translate(-50%,-46%) scale(.97);opacity:0;pointer-events:none;transition:all .2s}
.ct-modal.open{transform:translate(-50%,-50%) scale(1);opacity:1;pointer-events:auto}
.ct-mhead{background:var(--navy-mid,#0B1929);color:#fff;padding:14px 20px;font-family:'Syne',sans-serif;font-weight:700;font-size:15px}
.ct-mbody{padding:18px 20px}
.ct-fgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ct-fgrid label{display:flex;flex-direction:column;gap:5px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--text-dim)}
.ct-fgrid input,.ct-fgrid select{font-family:inherit;font-size:13px;padding:8px 11px;border:1px solid rgba(0,0,0,.12);border-radius:8px}
.ct-note{font-size:11px;color:var(--text-dim);background:rgba(2,132,199,.08);border-radius:6px;padding:8px 12px;margin-top:12px}
.ct-note.ct-nwarn{font-size:12.5px;color:#B45309;background:#FFFBEB;border:1px solid #FDE68A;margin:0 0 10px}
.ct-srow{display:grid;grid-template-columns:1fr 130px auto;gap:10px;align-items:center;padding:8px 0;border-bottom:1px dashed rgba(0,0,0,.08);font-size:13px}
.ct-srow input{font-family:inherit;font-size:13px;padding:7px 10px;border:1px solid rgba(0,0,0,.12);border-radius:6px;text-align:right}
@media(max-width:768px){.ct-qform{grid-template-columns:1fr 1fr}.ct-fgrid{grid-template-columns:1fr}.ct-duo{grid-template-columns:1fr}.ct-ctop{flex-direction:column}.ct-cnum{text-align:left}}
</style>`; }
