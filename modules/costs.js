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

// MarginBadge (Figma 7:85): πράσινο σήμα ΜΟΝΟ σε πραγματικό θετικό margin —
// αρνητικό μένει γυμνό κόκκινο κείμενο (το πράσινο κουτί γύρω από ζημιά θα
// έλεγε «όλα καλά»), άγνωστο μένει παύλα.
function ctPill(m) {
  if (m == null) return '<span class="ct-mgn dim">—</span>';
  if (m < 0) return `<span class="ct-mgn neg ct-mono">−${Math.abs(Number(m)).toFixed(1)}%</span>`;
  // 0% δεν είναι κέρδος — ουδέτερο, όχι πράσινο (υπάρχει live: RT-1005,
  // κόμιστρο partner = έσοδο, break-even).
  if (Number(m) === 0) return '<span class="ct-mgn ct-mono">0.0%</span>';
  return `<span class="ct-mbadge ct-mono">${Number(m).toFixed(1)}%</span>`;
}
// Ταυτότητα οχήματος στην κεφαλίδα (Figma 7:6): σκέτο κείμενο δίπλα στον
// κωδικό, όχι chip — η διάκριση OWNED/PARTNER γίνεται με τη λέξη.
function ctChip(t) {
  const natl = t.scope === 'NATL' ? ' · ΕΘΝΙΚΟ' : '';
  if (t.trip_type === 'PARTNER') return `<span class="plate">PARTNER · ${ctEsc(ctPartnerName(t.partner_id))}${natl}</span>`;
  return `<span class="plate">${ctEsc(ctTruckName(t.truck_id))}${natl}</span>`;
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
      Η κερδοφορία ανά δρομολόγιο είναι ορατή μόνο στον ιδιοκτήτη.</div>`;
    return;
  }
  c.innerHTML = ctStyles() + `
    <div class="page-header">
      <div>
        <div class="page-title">TRIP PnL <span class="ct-rolechip">Owner only</span></div>
        <div class="page-sub">Κερδοφορία ανά round trip · έσοδα auto από φορτία · κόστη καθαρό + ΦΠΑ χωριστά</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="ct-btn ct-navy" onclick="ctOpenSettings()">Ρυθμίσεις</button>
        <button class="ct-btn ct-primary" onclick="ctOpenRtModal()">+ Νέο Round Trip</button>
      </div>
    </div>
    <div id="ctLede"></div>
    <div class="ct-toolbar" id="ctToolbar2">
      <div class="ct-seg" id="ctScopeSeg">
        <button data-s="ALL" class="active" onclick="ctSetScope('ALL')">Όλα</button>
        <button data-s="INTL" onclick="ctSetScope('INTL')">Διεθνή</button>
        <button data-s="NATL" onclick="ctSetScope('NATL')">Εθνικά</button>
      </div>
      <span class="ct-vr"></span>
      <select id="ctVehSel" onchange="ctSetVeh(this.value)"><option value="ALL">Όλος ο στόλος</option></select>
      <select id="ctGroup" onchange="_ct.group=this.value;ctRenderList()">
        <option value="trip">Δρομολόγια</option>
        <option value="truck">Ανά Φορτηγό / Partner</option>
        <option value="driver">Ανά Οδηγό</option>
        <option value="week">Ανά Εβδομάδα</option>
      </select>
      <span class="ct-vr"></span>
      <span class="ct-sorthint" id="ctSortHint">Ταξινόμηση: Έσοδα ↓</span>
      <span style="flex:1"></span>
      <button class="ct-btn" onclick="ctReload()">Ανανέωση</button>
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
    const ld = document.getElementById('ctLede'); if (ld) ld.innerHTML = '';
    const rc = document.getElementById('ctRecon'); if (rc) rc.innerHTML = '';
    const tb = document.getElementById('ctToolbar2'); if (tb) tb.style.display = 'none';
  }
}
function ctErrorCard() {
  return `<div class="ct-empty">Τα /costs/* δεν απάντησαν: <b>${ctEsc(_ct.loadError)}</b><br>
    <span style="font-size:12px">Τα νούμερα ΔΕΝ είναι μηδέν — απλώς δεν φορτώθηκαν.</span><br>
    <button class="ct-btn" style="margin-top:12px" onclick="ctReload()">Δοκίμασε ξανά</button></div>`;
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
function ctVisible() {
  return _ct.pnl.filter(t =>
    (_ct.scope === 'ALL' || t.scope === _ct.scope) &&
    (_ct.veh === 'ALL' || (_ct.veh === 'PARTNERS' ? t.trip_type === 'PARTNER' : t.truck_id === _ct.veh)));
}

// StakeBanner (Figma 6:31, owner 28/8 — αντικατέστησε το navy lede + το
// 5-στηλο KPI strip): ΕΝΑ λευκό μπλοκ που λέει το διακύβευμα («N από M χωρίς
// κόστος» + «€X έσοδα σε αναμονή») και ΜΙΑ εξίσωση ΕΣΟΔΑ − ΚΟΣΤΗ = ΚΑΘΑΡΟ.
// Το ΚΑΘΑΡΟ υπακούει στην πύλη cost-complete: όσο λείπουν κόστη είναι παύλα —
// το άγραφο κόστος ως €0 θα διαβαζόταν σαν καθαρό κέρδος (DESIGN.md κανόνας 3).
function ctRenderSummary() {
  const lede = document.getElementById('ctLede');
  const tb = document.getElementById('ctToolbar2');
  // Κενή βάση: η κενή κατάσταση (στο ctRenderList) είναι ΟΛΗ η σελίδα —
  // καμία κάρτα, κανένα «€0» που μοιάζει με μέτρηση.
  if (!_ct.pnl.length) { lede.innerHTML = ''; if (tb) tb.style.display = 'none'; return; }
  if (tb) tb.style.display = '';
  const V = ctVisible();
  const rev = V.reduce((a, t) => a + Number(t.revenue || 0), 0);
  const gross = V.reduce((a, t) => a + Number(t.cost_gross || 0), 0);
  const net = V.reduce((a, t) => a + Number(t.cost_net || 0), 0);
  const incomplete = V.filter(t => !ctCostInfo(t).complete);
  const losses = V.filter(t => ctCostInfo(t).complete && Number(t.profit_worst) < 0);
  const allComplete = V.length > 0 && incomplete.length === 0;
  // Έσοδα «σε αναμονή» = των δρομολογίων χωρίς κόστη: αυτό είναι το διακύβευμα,
  // όχι διακόσμηση — όσο μένουν ακοστολόγητα, το καθαρό τους είναι άγνωστο.
  const pendingRev = incomplete.reduce((a, t) => a + Number(t.revenue || 0), 0);
  let title, stake = '', netVal, foot;
  if (_ct.linesFailed) {
    title = 'Οι γραμμές κόστους δεν φόρτωσαν — άγνωστη πληρότητα';
    netVal = '<b class="nv dim">—</b>';
    foot = 'Τα ΚΟΣΤΗ είναι τα καταχωρημένα στη βάση· αν είναι πλήρη δεν είναι γνωστό όσο οι γραμμές δεν φορτώνουν. Δοκίμασε «Ανανέωση».';
  } else if (!allComplete) {
    title = `${incomplete.length} από ${V.length} δρομολόγια χωρίς καταχωρημένο κόστος`;
    stake = `<span class="stake ct-mono">${ctEur(pendingRev)} έσοδα σε αναμονή</span>`;
    netVal = '<b class="nv dim">—</b>';
    foot = 'Το περιθώριο κέρδους δεν υπολογίζεται μέχρι να καταχωρηθούν τα κόστη. Τα δρομολόγια ταξινομούνται κατά έσοδα φθίνοντα.';
  } else {
    const p = rev - gross;
    title = losses.length
      ? `${V.length} δρομολόγια με πλήρη κόστη — ${losses.length} ζημιογόν${losses.length === 1 ? 'ο' : 'α'}`
      : 'Όλα τα δρομολόγια με καταχωρημένα κόστη';
    // Πράσινο ΜΟΝΟ σε πραγματικό θετικό καθαρό — ποτέ σε παύλα ή μηδέν.
    netVal = `<b class="nv ct-mono${p < 0 ? ' neg' : p > 0 ? ' pos' : ''}">${ctEurP(p)}</b>`;
    foot = `Margin ${rev ? (p / rev * 100).toFixed(1) + '%' : '—'} με ΦΠΑ · ${rev ? ((rev - net) / rev * 100).toFixed(1) + '%' : '—'} χωρίς. Τα δρομολόγια ταξινομούνται κατά έσοδα φθίνοντα.`;
  }
  lede.innerHTML = `<div class="ct-stake">
    <div class="ct-stop"><span class="t">${title}</span>${stake}</div>
    <div class="ct-eq">
      <span class="ct-eqi"><span class="l">Εσοδα</span><b class="nv ct-mono">${ctEur(rev)}</b></span>
      <span class="op">−</span>
      <span class="ct-eqi"><span class="l">Κοστη</span><b class="nv ct-mono">${ctEur(gross)}</b></span>
      <span class="op">=</span>
      <span class="ct-eqi"><span class="l">Καθαρο</span>${netVal}</span>
    </div>
    <div class="ct-sfoot">${foot}</div></div>`;
}

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
    ? `<div class="ct-note ct-nwarn" style="font-weight:600">${icon('warning', 13)} Δελτίο παλετών: ${gatedCount} ${gatedCount === 1 ? 'διαδρομή partner το περιμένει' : 'διαδρομές partner το περιμένουν'}</div>`
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
  const w = icon('warning', 13);
  const warnNotes =
    (_ct.linesFailed ? `<div class="ct-note ct-nwarn">${w} Οι γραμμές κόστους ΔΕΝ φόρτωσαν — η πληρότητα κοστών είναι <b>άγνωστη</b>, όχι μηδενική. Ό,τι δείχνει «κόστη;» παρακάτω μπορεί να έχει κανονικά κόστη. <button class="ct-btn" style="height:26px;padding:0 10px" onclick="ctReload()">Ανανέωση</button></div>` : '') +
    (_ct.linesCapped ? `<div class="ct-note ct-nwarn">${w} Φορτώθηκαν μόνο οι 300 νεότερες γραμμές κόστους (όριο Worker) — παλαιότερα δρομολόγια ίσως δείχνουν ψευδώς «χωρίς κόστη». Χρειάζεται σελιδοποίηση στο /costs (ουρά Worker).</div>` : '') +
    (_ct.rtsCapped ? `<div class="ct-note ct-nwarn">${w} Φορτώθηκαν μόνο τα 200 νεότερα round trips (όριο Worker) — παλαιότερες κάρτες ίσως εμφανίζονται χωρίς σκέλη.</div>` : '');
  const notice = warnNotes + ctPalletGateNotice(V);
  // Η ένδειξη ταξινόμησης ισχύει μόνο για τη λίστα καρτών — οι ομαδοποιήσεις
  // ταξινομούνται κατά margin και η ένδειξη «Έσοδα ↓» εκεί θα ήταν ψέμα.
  const sh = document.getElementById('ctSortHint');
  if (sh) sh.style.display = _ct.group === 'trip' ? '' : 'none';
  if (_ct.group === 'trip') {
    // Μία λίστα, κατά έσοδα φθίνοντα (Figma 6:47, owner 28/8 — αντικατέστησε
    // τη «γραμμή του νερού» της 24/8): το «τι θέλει προσοχή» το λέει πλέον το
    // StakeBanner με το «N από M χωρίς κόστος», όχι η σειρά της λίστας.
    const sorted = [...V].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
    // Αποτυχία εμπλουτισμού = ορατή σημείωση, όχι σιωπηλά γυμνές κάρτες.
    const enrichNote = _ct.enrichFail
      ? `<div class="ct-note ct-nwarn">${icon('warning', 13)} Τα στοιχεία διαδρομής (πελάτες/προορισμοί) δεν φόρτωσαν — οι κάρτες δείχνουν μόνο ποσά. Δοκίμασε «Ανανέωση».</div>` : '';
    el.innerHTML = notice + enrichNote + sorted.map(ctCardHtml).join('') +
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
    <td class="ct-num ct-mono" style="font-weight:700;${r.p < 0 ? 'color:#B91C1C' : ''}">${ctEurP(r.p)}</td>
    <td style="text-align:center">${ctPill(r.mg != null ? Math.round(r.mg * 10) / 10 : null)}</td>
    <td class="ct-num ct-mono" style="color:var(--text-dim)">${r.mx != null ? r.mx.toFixed(1) + '%' : '—'}</td></tr>`).join('');
  const h = _ct.group === 'truck' ? 'Φορτηγό / Partner' : _ct.group === 'driver' ? 'Οδηγός' : 'Εβδομάδα';
  el.innerHTML = notice +
    (skipped ? `<div class="ct-note ct-nwarn">${icon('warning', 13)} ${skipped} ${skipped === 1 ? 'δρομολόγιο' : 'δρομολόγια'} με ελλιπή κόστη ΔΕΝ μετρούν στα παρακάτω αθροίσματα.</div>` : '') +
    `<table class="ct-tbl"><thead><tr><th>${h}</th><th class="ct-num">Trips</th><th class="ct-num">Έσοδα</th>
    <th class="ct-num">Κόστη</th><th class="ct-num">Καθαρό</th><th style="text-align:center">Margin (ΦΠΑ)</th><th class="ct-num">χωρίς ΦΠΑ</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ── Κάρτα δρομολογίου (Figma component 7:86 TripCard, owner 28/8) ─────────
// Ένα σκέλος = μία γραμμή: badge κατεύθυνσης · διαδρομή · ημερομηνία · ποσό
// σε σταθερή στήλη 70px δεξιά (πλάτος = στοίχιση, tabular-nums).
function ctLegLine(l) {
  if (l.nat_load_id) {
    return `<div class="ct-leg"><span class="dchip imp">VS</span>
      <span class="rt" style="color:var(--text-dim);font-style:italic">εθνικό σκέλος — εσωτερική μεταφορά, όχι έσοδο πελάτη</span></div>`;
  }
  const imp = String(l.direction || '').toUpperCase().includes('IMP');
  const o = _ct.orderByPg && _ct.orderByPg[l.order_id];
  const chip = `<span class="dchip ${imp ? 'imp' : 'exp'}">${imp ? 'IMPORT' : 'EXPORT'}</span>`;
  if (!o) return `<div class="ct-leg">${chip}<span class="rt">φορτίο #${l.order_id} <span style="color:var(--text-dim)">(στοιχεία διαδρομής μη διαθέσιμα)</span></span></div>`;
  const f = o.fields;
  const from = imp ? orderLoadName(f, 26) : fhClientName(f['Client']);
  const to = orderDelName(f, 26) || '—';
  const cc = orderLocCountry(f, 'del');
  const date = imp ? (f['Delivery DateTime'] || f['Loading DateTime']) : f['Loading DateTime'];
  const price = f['Price'] != null && f['Price'] !== '' ? ctEur(f['Price']) : '<span style="color:var(--text-dim);font-weight:400">—</span>';
  return `<div class="ct-leg">${chip}
    <span class="rt">${imp ? ctEsc(from) : from} <span class="arr">→</span> ${ctEsc(to)}${cc && !imp ? ' (' + cc + ')' : ''}</span>
    <span class="ldate ct-mono">${fmtDate(date)}</span>
    <span class="lamt ct-mono">${price}</span></div>`;
}

// Εξίσωση κάρτας (Figma 7:84/7:85): ΕΣΟΔΑ − ΚΟΣΤΗ = ΚΑΘΑΡΟ σε μία γραμμή.
// Στα costs-missing ΚΟΣΤΗ/ΚΑΘΑΡΟ είναι παύλες + κουμπί καταχώρησης — η παύλα
// είναι σχεδιαστική απόφαση, όχι παράλειψη: άγραφο κόστος ως €0 θα διαβαζόταν
// ως καθαρό κέρδος (DESIGN.md κανόνας 3). Πράσινο ΜΟΝΟ σε πραγματικό καθαρό.
function ctCardNums(t, ci) {
  const dash = '<b class="nv dim">—</b>';
  let costs = dash, net = dash, badge = '', right = '', note = '';
  if (_ct.linesFailed) {
    // Η πληρότητα είναι ΑΓΝΩΣΤΗ — ούτε margin ούτε ψευδές «χωρίς κόστη».
    note = `<span class="ct-eqnote">οι γραμμές κόστους δεν φόρτωσαν — πληρότητα άγνωστη</span>`;
  } else if (!ci.complete) {
    right = `<button class="ct-btn ct-accbtn" onclick="event.stopPropagation();ctOpenCostModal(${t.id})">+ Καταχώρηση κόστους</button>`;
  } else {
    const p = Number(t.profit_worst);
    costs = `<b class="nv ct-mono">${ctEur(t.cost_gross)}</b>`;
    net = `<b class="nv nnet ct-mono${p < 0 ? ' neg' : p > 0 ? ' pos' : ''}">${ctEurP(p)}</b>`;
    badge = ctPill(t.margin_worst_pct);
  }
  return `<div class="ct-eqrow">
    <div class="ct-eq ct-eqsm">
      <span class="ct-eqi"><span class="l">Εσοδα</span><b class="nv ct-mono">${ctEur(t.revenue)}</b></span>
      <span class="op">−</span>
      <span class="ct-eqi"><span class="l">Κοστη</span>${costs}</span>
      <span class="op">=</span>
      <span class="ct-eqi"><span class="l">Καθαρο</span>${net}</span>
      ${badge}${note}
    </div>${right}</div>`;
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
    ? `<div class="ct-locknote">${icon('warning', 13)} Δελτίο παλετών: λείπει σε ${gate.legs_needing_sheet - gate.legs_with_sheet} από ${gate.legs_needing_sheet} σκέλη — οι χαμένες παλέτες είναι κόστος που δεν φαίνεται ακόμη εδώ</div>` : '';
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
        ? `<div class="ct-leg" style="color:var(--text-dim);font-size:12px">Veroia Switch: −${ctEur(diff)} εσωτερική μεταφορά (δεν είναι έσοδο πελάτη), άρα έσοδο trip ${ctEur(t.revenue)}</div>`
        : `<div class="ct-leg" style="color:#8A5A00;font-size:12px">${icon('warning', 12)} οι τιμές των σκελών αθροίζουν ${ctEur(legsSum)} αλλά το έσοδο trip είναι ${ctEur(t.revenue)} — ανεξήγητη διαφορά ${ctEur(diff)}</div>`;
    }
  }
  const why = ci.complete && Number(t.profit_worst) < 0 ? `<div class="ct-dwhy">${icon('warning', 12)} ${ctWhyText(t, lines)}</div>` : '';
  return `<div class="ct-card" id="ctCard${t.id}" onclick="ctOpenPanel(${t.id})">
    <div class="ct-chead">
      <div class="ct-chl">
        <span class="code">${ctEsc(t.code)}</span>
        ${ctChip(t)}
        <span class="ct-vr12"></span>
        <span class="dates ct-mono">${fmtDate(t.date_start)}${t.date_end ? ' → ' + fmtDate(t.date_end) : ''}</span>
      </div>
      ${ctStatusBadge(t)}
    </div>
    <div class="ct-div"></div>
    <div class="ct-clegs">${legs.map(ctLegLine).join('')}${returnLine}${vsNote}${partnerNote}</div>
    <div class="ct-div"></div>
    ${ctCardNums(t, ci)}
    ${lockLine}
    ${why}
  </div>`;
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
  let html = missing.length ? `<div class="ct-note ct-nwarn">
    ${icon('warning', 13)} <b>${missing.length} εκτελεσμέν${missing.length === 1 ? 'η παραγγελία' : 'ες παραγγελίες'} χωρίς round trip</b> — ο feeder δεν τις έπιασε.
    Άνοιξε & ξανασώσε τη γραμμή στο Weekly, ή φτιάξε RT χειροκίνητα:
    ${missing.slice(0, 5).map(r => ctEsc(r.fields['Reference'] || r.id)).join(' · ')}${missing.length > 5 ? ' · +' + (missing.length - 5) : ''}</div>` : '';
  if (unbridged.length) html += `<div class="ct-note ct-nwarn">${icon('warning', 13)} ${unbridged.length} εκτελεσμέν${unbridged.length === 1 ? 'η παραγγελία είναι' : 'ες παραγγελίες είναι'} εκτός γέφυρας (χωρίς Loading stop) — ο μετρητής δεν μπορεί να ελέγξει αν έχουν RT:
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
  if (linesFetchFailed) costRows = `<div class="ct-note ct-nwarn">${icon('warning', 13)} Οι γραμμές κόστους δεν φόρτωσαν — η ανάλυση ανά κατηγορία δεν είναι διαθέσιμη. Τα σύνολα από κάτω έρχονται από τη βάση.</div>`;
  else if (!costRows) costRows = '<div style="font-size:12px;color:var(--text-dim)">Καμία γραμμή κόστους ακόμα — πρόσθεσε την πρώτη από τη φόρμα πιο πάνω.</div>';
  if (t.trip_type === 'PARTNER') costRows += `<div class="ct-lrow"><span style="font-style:italic;color:var(--text-dim)">Καύσιμα/διόδια/οδηγός δεν καταγράφονται εδώ — είναι κόστη του συνεργάτη, όχι ελλιπή δικά μας. Το δικό μας κόστος είναι το κόμιστρο.</span><span></span></div>`;
  const catOpts = Object.entries(CT_CATEGORY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  panel.innerHTML = `
    <div class="ct-phead"><button class="ct-close" onclick="ctCloseAll()">&times;</button>
      <h2>${ctEsc(t.code)} · ${t.scope === 'NATL' ? 'Εθνικό' : 'Διεθνές'}</h2>
      <div class="ct-pmeta">${t.trip_type === 'PARTNER' ? 'Partner: ' + ctEsc(ctPartnerName(t.partner_id)) : ctEsc(ctTruckName(t.truck_id)) + (ctDriverName(t.driver_id) ? ' · ' + ctEsc(ctDriverName(t.driver_id)) : '')}
       · ${fmtDate(t.date_start)}${t.date_end ? ' → ' + fmtDate(t.date_end) : ''} · ${t.total_km ? t.total_km.toLocaleString('el-GR') + ' km' : 'χωρίς km'}</div>
      ${(t.trip_type === 'PARTNER' && _ct.palletGate[t.id] && _ct.palletGate[t.id].sheets_ok === false) ? `<div style="margin-top:8px;padding:6px 10px;border:1px solid rgba(251,191,36,.4);border-radius:6px;color:#FCD34D;font-size:12px;font-weight:600">
        Δελτίο παλετών: λείπει σε ${_ct.palletGate[t.id].legs_needing_sheet - _ct.palletGate[t.id].legs_with_sheet} από ${_ct.palletGate[t.id].legs_needing_sheet} σκέλη — το PnL είναι ελλιπές</div>` : ''}
      ${t.status === 'planned' || t.status === 'in_progress' ? `<button class="ct-btn" style="margin-top:10px;background:#fff" onclick="ctCloseRt(${t.id})">Κλείσιμο trip — χειροκίνητο</button>` : ''}</div>
    ${!complete ? `<div class="ct-psec"><div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 14px">
      <div style="font-weight:700;color:#8A5A00;font-size:13px">Κόστη ελλιπή — καμία γραμμή κόστους ακόμη</div>
      <div style="font-size:12px;color:#B45309;margin-top:4px">Το καθαρό/margin δεν υπολογίζεται — το άγραφο κόστος θα διαβαζόταν σαν καθαρό κέρδος που δεν υπάρχει. Καταχώρησε τα κόστη ακριβώς από κάτω.</div>
    </div></div>` : `<div class="ct-psec"><div class="ct-duo">
      <div class="ct-m ct-mprimary"><div class="l">Καθαρό — με ΦΠΑ (worst case)</div><div class="v ct-mono" style="color:${Number(t.profit_worst) < 0 ? '#FCA5A5' : '#fff'}">${ctEurP(t.profit_worst)}</div><div class="s">margin ${t.margin_worst_pct != null ? Number(t.margin_worst_pct).toFixed(1) + '%' : '—'}</div></div>
      <div class="ct-m"><div class="l">Καθαρό — χωρίς ΦΠΑ</div><div class="v ct-mono"${Number(t.profit_ex_vat) < 0 ? ' style="color:#B91C1C"' : ''}>${ctEurP(t.profit_ex_vat)}</div><div class="s">margin ${t.margin_ex_vat_pct != null ? Number(t.margin_ex_vat_pct).toFixed(1) + '%' : '—'} · ΦΠΑ ${ctEur(t.cost_vat)}</div></div>
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
        ? `<div class="ct-lrow"><span style="font-style:italic;color:var(--text-dim)">Εθνικό σκέλος VS — εσωτερική μεταφορά (x_export 850 / x_import 650), όχι έσοδο πελάτη</span><span class="ct-mono" style="color:var(--text-dim)">memo</span></div>`
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
    <div class="ct-mhead">Καταχώρηση κόστους — ${ctEsc(t.code)} <button class="ct-close" onclick="ctCloseAll()">&times;</button></div>
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
  return `<div class="ct-dwhy" style="display:block;margin-top:10px">${icon('warning', 12)} ${ctWhyText(t, lines)}</div>`;
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
    <div class="ct-mhead">Νέο Round Trip — κέντρο κόστους <button class="ct-close" onclick="ctCloseAll()">&times;</button></div>
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
  m.innerHTML = '<div class="ct-mhead">Ρυθμίσεις COSTS <button class="ct-close" onclick="ctCloseAll()">&times;</button></div><div class="ct-mbody ct-empty">Φόρτωση…</div>';
  const labels = { x_export: 'X — VS transfer (export)', x_import: 'X — VS transfer (import)', pallet_eur: 'Αξία παλέτας EUR', vat_default: 'Προεπιλογή ΦΠΑ', wear_fallback_eur_km: 'Φθορά €/km (fallback)' };
  try {
    const s = await ctFetch('/costs/settings');
    m.querySelector('.ct-mbody').innerHTML = (s.records || []).map(r => `
      <div class="ct-srow"><span>${labels[r.key] || r.key}</span>
      <input type="number" step="0.001" id="ctS_${r.key}" value="${r.value}">
      <button class="ct-btn" onclick="ctSaveSetting('${r.key}')">Αποθήκευση</button></div>`).join('') +
      '<div class="ct-note">Owner-only. Οι αλλαγές επηρεάζουν ΟΛΟΥΣ τους υπολογισμούς PnL άμεσα (τα views διαβάζουν live).</div>';
  } catch (e) { m.querySelector('.ct-mbody').innerHTML = 'Σφάλμα: ' + ctEsc(e.message); }
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
/* Χρώματα εκτός :root του app — ορίζονται ΜΙΑ φορά εδώ (DESIGN.md κανόνας 1:
   ένα χρώμα, ένα όνομα, ένα σπίτι)· θα ανέβουν στο style.css με το πέρασμα
   των 97 hex. --ct-line = --border του DESIGN.md (το :root --border του app
   σημαίνει ήδη άλλο πράγμα — hairline rgba — και δεν αγγίζεται από εδώ). */
#content{--ct-line:#E2E8F0;--ct-ok:#15803D;--ct-ok-bg:#DCFCE7;--ct-exp-bg:#E0F2FE}
.ct-rolechip{display:inline-flex;align-items:center;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:var(--warning-soft,#FEF3C7);color:#B45309;vertical-align:middle}
/* StakeBanner (Figma 6:31): το διακύβευμα + η εξίσωση, σε ΕΝΑ λευκό μπλοκ */
.ct-stake{background:var(--bg-card,#fff);border:1px solid var(--ct-line);border-radius:8px;padding:24px;margin-bottom:12px;display:flex;flex-direction:column;gap:16px}
.ct-stop{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap}
.ct-stop .t{font-family:'Syne',sans-serif;font-weight:700;font-size:18px;color:var(--navy-mid,#0B1929)}
.ct-stop .stake{font-size:14px;font-weight:700;color:var(--accent,#0284C7)}
.ct-eq{display:flex;align-items:baseline;gap:24px;background:var(--bg,#F4F6F9);border-radius:6px;padding:16px;flex-wrap:wrap}
.ct-eqi{display:inline-flex;align-items:baseline;gap:8px}
.ct-eqi .l{font-size:13px;text-transform:uppercase;letter-spacing:.02em;color:var(--text-dim)}
.ct-eqi .nv{font-size:20px;font-weight:700;color:var(--navy-mid,#0B1929)}
.ct-eqi .nv.dim{color:var(--text-dim)}
.ct-eqi .nv.pos{color:var(--ct-ok)}.ct-eqi .nv.neg{color:var(--danger-strong,#B91C1C)}
.ct-eq .op{font-size:18px;color:var(--text-dim)}
.ct-sfoot{font-size:13px;color:var(--text-dim)}
/* FilterRow (Figma 6:48): μία λευκή μπάρα — tabs, dropdowns, ταξινόμηση */
.ct-toolbar{display:flex;align-items:center;gap:16px;margin-bottom:16px;flex-wrap:wrap;background:var(--bg-card,#fff);border:1px solid var(--ct-line);border-radius:8px;padding:12px}
.ct-toolbar select{font-family:inherit;font-size:13px;padding:6px 10px;border:1px solid var(--ct-line);border-radius:6px;background:#fff;color:var(--navy-mid,#0B1929)}
.ct-vr{width:1px;height:16px;background:var(--ct-line)}
.ct-sorthint{font-size:13px;font-weight:500;color:var(--text-dim)}
.ct-seg{display:flex;gap:4px}
.ct-seg button{background:none;border:none;font-family:inherit;font-size:13px;font-weight:400;color:var(--text-dim);padding:6px 12px;border-radius:6px;cursor:pointer}
.ct-seg button.active{background:var(--bg,#F4F6F9);color:var(--navy-mid,#0B1929);font-weight:600}
.ct-btn{display:inline-flex;align-items:center;gap:7px;padding:0 14px;height:34px;border-radius:6px;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer;border:1px solid var(--ct-line);background:#fff;color:var(--navy-mid,#0B1929)}
.ct-btn.ct-primary{background:var(--accent,#0284C7);color:#fff;border:none;font-weight:600}
.ct-btn.ct-accbtn{border:1px solid var(--accent,#0284C7);color:var(--accent,#0284C7);font-weight:600;padding:0 16px}
.ct-tbl{width:100%;background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:12px;border-collapse:separate;border-spacing:0;overflow:hidden}
.ct-tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim);text-align:left;padding:10px 13px;border-bottom:1px solid #E2E8F0;background:#F8FAFC}
.ct-tbl td{padding:10px 13px;border-bottom:1px solid rgba(0,0,0,.06);font-size:13px}
.ct-tbl tbody tr{cursor:pointer}.ct-tbl tbody tr:hover{background:#F0F9FF}.ct-tbl tr:last-child td{border-bottom:none}
.ct-num{text-align:right}.ct-mono{font-variant-numeric:tabular-nums}
.ct-mgn{font-size:12.5px;font-weight:600;color:var(--navy-mid,#0B1929)}
.ct-mgn.neg{color:var(--danger-strong,#B91C1C)}.ct-mgn.dim{color:var(--text-dim)}
.ct-mbadge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;background:var(--ct-ok-bg);color:var(--ct-ok)}
.ct-btn.ct-navy{border-color:var(--navy-mid,#0B1929);font-weight:600}
/* StatusChip (Figma 7:41): χρώμα ΚΑΙ λέξη — πράσινο μόνο το ολοκληρωμένο */
.ct-badge{display:inline-block;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:600;white-space:nowrap;background:var(--bg,#F4F6F9);color:var(--text-mid,#475569)}
.ct-b-run{background:var(--ct-exp-bg);color:var(--accent-hover,#0369A1)}
.ct-b-done,.ct-b-final{background:var(--ct-ok-bg);color:var(--ct-ok)}
.ct-b-canc{color:var(--text-dim)}
.ct-empty{background:#fff;border:1px dashed rgba(0,0,0,.15);border-radius:12px;padding:34px;text-align:center;color:var(--text-dim);font-size:14px}
/* TripCard (Figma 7:86): δοχείο r8/p20, ζώνες με gap 16 και 1px διαχωριστικά */
.ct-card{background:var(--bg-card,#fff);border:1px solid var(--ct-line);border-radius:8px;padding:20px;margin-bottom:16px;cursor:pointer;display:flex;flex-direction:column;gap:16px;transition:box-shadow .15s}
.ct-card:hover{box-shadow:0 3px 14px rgba(11,25,41,.09)}
.ct-div{height:1px;background:var(--ct-line)}
.ct-chead{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ct-chl{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.ct-chl .code{font-weight:700;font-size:16px;color:var(--navy-mid,#0B1929)}
.ct-chl .plate{font-size:12px;color:var(--text-dim)}
.ct-vr12{width:1px;height:12px;background:var(--ct-line)}
.ct-chl .dates{font-size:13px;color:var(--text-dim)}
.ct-clegs{display:flex;flex-direction:column;gap:8px}
.ct-leg{display:flex;align-items:baseline;gap:12px;font-size:13px}
.ct-leg .rt{flex:1;font-weight:500;color:var(--navy-mid,#0B1929);min-width:0}
.ct-leg .arr{color:var(--text-dim)}
.ct-leg .ldate{font-size:13px;color:var(--text-dim);white-space:nowrap}
/* 70px σταθερή στήλη ποσών (Figma): χωρίς αυτήν τα ποσά δεν στοιχίζονται */
.ct-leg .lamt{width:70px;text-align:right;font-weight:700;color:var(--navy-mid,#0B1929);white-space:nowrap}
.ct-leg.ct-noret{color:#B45309;display:block}
.dchip{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.02em;padding:2px 7px;border-radius:4px;flex-shrink:0}
.dchip.exp{background:var(--ct-exp-bg);color:var(--accent,#0284C7)}
.dchip.imp{background:var(--ct-line);color:var(--navy-mid,#0B1929)}
/* Εξίσωση κάρτας: ίδια γραμματική με το StakeBanner, μικρότερη κλίμακα */
.ct-eqrow{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.ct-eqsm{background:none;padding:0;gap:20px}
.ct-eqsm .l{font-size:12px}
.ct-eqsm .nv{font-size:16px;font-weight:600}
.ct-eqsm .nv.nnet{font-weight:700}
.ct-eqsm .op{font-size:16px}
.ct-eqsm .nv.pos{color:var(--ct-ok)}.ct-eqsm .nv.neg{color:var(--danger-strong,#B91C1C)}
.ct-eqnote{font-size:12px;color:#8A5A00}
.ct-locknote{font-size:12.5px;color:#8A5A00;background:#fff;border:1px solid #E6CE9E;border-radius:6px;padding:6px 10px}
.ct-dwhy{display:inline-block;font-size:12.5px;color:#8A5A00;background:#fff;border:1px solid #E6CE9E;border-radius:6px;padding:6px 10px;align-self:flex-start}
.ct-dwhy svg,.ct-locknote svg,.ct-nwarn svg{vertical-align:-2px;margin-right:2px}
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
.ct-note.ct-nwarn{font-size:12.5px;color:#8A5A00;background:#fff;border:1px solid #E6CE9E;margin:0 0 10px}
.ct-srow{display:grid;grid-template-columns:1fr 130px auto;gap:10px;align-items:center;padding:8px 0;border-bottom:1px dashed rgba(0,0,0,.08);font-size:13px}
.ct-srow input{font-family:inherit;font-size:13px;padding:7px 10px;border:1px solid rgba(0,0,0,.12);border-radius:6px;text-align:right}
@media(max-width:768px){.ct-qform{grid-template-columns:1fr 1fr}.ct-fgrid{grid-template-columns:1fr}.ct-duo{grid-template-columns:1fr}.ct-leg{flex-wrap:wrap}.ct-leg .lamt{width:auto}.ct-eq{gap:12px;padding:12px}}
</style>`; }
