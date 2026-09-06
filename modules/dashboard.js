// ═══════════════════════════════════════════════
// MODULE — DASHBOARD v3 (κύμα 3, Figma dash-home 338:874 · light)
// ═══════════════════════════════════════════════
// Δομή κατά το frame: header → Η ΕΒΔΟΜΑΔΑ (σκορ + 3 πλακίδια) → Στόχοι 2026
// → Αναχωρήσεις/Παραδόσεις → Αναμονή ανάθεσης κατά προθεσμία → Ειδοποιήσεις.
// Το ΤΙ ΚΑΙΕΙ αφαιρέθηκε (owner 30/8)· η κάρτα Συμμόρφωσης δεν επανήλθε
// (owner 11/8)· σκορ/στατιστικά πάνω-πάνω = απόφαση owner 30/8, σημειωμένη
// απόκλιση από τη φιλοσοφία (η δράση των 05:30 είναι πιο κάτω), τηρείται.
(function() {
'use strict';

let _dashRefreshTimer = null;
const _esc = s => (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s);
const _arr = v => Array.isArray(v) ? v : (v ? [v] : []);

// «Χωρίς ανάθεση» = χωρίς φορτηγό ΚΑΙ χωρίς συνεργάτη (owner 2/9,
// DECISION_LOG). Ο παλιός κώδικας εδώ έλεγχε μόνο Truck και έδειχνε ψεύτικες
// εκκρεμότητες για φορτία που ήδη τρέχουν με συνεργάτη — ίδιος ορισμός με το
// core/metrics.js, όχι δεύτερος.
const _unassigned = f => !_arr(f['Truck']).length && !_arr(f['Partner']).length;
const _open = f => { const s = f['Status'] || 'Pending'; return s !== 'Delivered' && s !== 'Invoiced' && s !== 'Cancelled'; };

// Πληκτρολόγιο για στοιχεία που δεν είναι <button>/<a> (γραμμές πίνακα,
// ειδοποιήσεις). Χωρίς αυτό μετρήθηκαν 3/9/2026 στην οθόνη 121 στοιχεία με
// onclick και μόνο 56 προσβάσιμα με Tab — ο πληκτρολογιακός χρήστης δεν
// μπορούσε να ανοίξει καμία γραμμή. Το `this.click()` καλεί το ΙΔΙΟ onclick,
// ώστε να μην υπάρχει δεύτερη διαδρομή που μπορεί να αποκλίνει.
const _KB = `tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}"`;

// Διαφορά σε ΗΜΕΡΕΣ, τοπική ζώνη — ΠΟΤΕ σε ώρες (3/9/2026).
// Οι στήλες φόρτωσης/παράδοσης είναι Postgres `date` χωρίς ώρα, οπότε
// `new Date('2026-09-03')` = μεσάνυχτα UTC = 03:00 Αθήνας. Η παλιά ωριαία
// αφαίρεση έβγαζε ΚΑΘΕ σημερινή φόρτωση «πέρασε · 3 ώρες» μετά τις 03:00 και
// την ταξινομούσε πρώτη — μετρήθηκε ζωντανά σε 7/7 γραμμές. Η σύγκριση
// ημέρας-με-ημέρα δεν έχει ζώνη να χάσει: το toLocalDate() κανονικοποιεί και
// τα δύο σχήματα (σκέτη ημερομηνία ή ISO με ώρα) σε τοπικό YYYY-MM-DD και το
// Date.UTC() αφαιρεί ακέραιες ημέρες χωρίς θερινή ώρα στη μέση.
function _dashDayDiff(raw, todayStr) {
  const d = toLocalDate(raw);
  if (!d) return null;
  const p = d.split('-').map(Number), t = todayStr.split('-').map(Number);
  return Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(t[0], t[1] - 1, t[2])) / 864e5);
}

// Στόχοι έτους 2026 — PLACEHOLDER (owner 30/8: «οι στόχοι είναι placeholder,
// ορίζονται με τον owner»). Δεν υπάρχει πίνακας ρυθμίσεων για να αποθηκευτούν
// και το localStorage απορρίφθηκε ρητά (CEO anti-pattern) — μένουν εδώ
// σκληρά, μέχρι να υπάρξει πίνακας. Σημειωμένο στο παραδοτέο.
const DASH_GOALS_2026 = {
  onTimePct: 95,        // ≥
  deadKmAvg: 50,        // ≤ χλμ
  utilizationPct: 85,   // ≥
  daysNoExpired: 365,   // = ημέρες έτους
};

async function renderDashboard() {
  const c = document.getElementById('content');
  c.innerHTML = _dashSkeleton();

  try {
    // Ίδιο παράθυρο και ίδια endpoints με πριν: ORDERS/NAT_LOADS 30 ημερών +
    // ORDER_STOPS ανά παραγγελία. Καμία αλλαγή απόδοσης χωρίς απόφαση.
    const _dashCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await preloadReferenceData();
    const trucks = getRefTrucks();
    const clients = getRefClients();
    const trailers = getRefTrailers();
    let [orders, natLoads] = await Promise.all([
      atGet(TABLES.ORDERS, `IS_AFTER({Loading DateTime}, '${_dashCutoff}')`),
      // Το NAT_LOADS φορτώνεται και δεν διαβάζεται από κανένα πλακίδιο — όπως
      // και πριν. Μένει για ισότητα συμβολαίου (endpoint) μέχρι απόφαση owner·
      // σημειωμένο ως νεκρή κλήση (αρχή 8) στο παραδοτέο.
      atGet(TABLES.NAT_LOADS, `IS_AFTER({Loading DateTime}, '${_dashCutoff}')`),
    ]);
    void natLoads;
    // Wave 3 (owner 6/9, FEATURES.ORDER_SPLIT): a split leg is execution detail
    // of its parent order — every KPI/list below reads `orders`, so filtering
    // once here (rather than at each tile) keeps the dashboard counting the
    // customer's order once. No fields[] restriction on this fetch, so the
    // field is already present when it exists — this is a pure client-side
    // filter, no request-shape change on the off-path.
    if (typeof FEATURES !== 'undefined' && FEATURES.ORDER_SPLIT) {
      orders = orders.filter(r => !getLinkedId(r.fields['Parent Order']));
    }

    const _dashStopsByOrder = {};
    const _dashStopIds = orders.flatMap(r => r.fields['ORDER STOPS'] || []);
    let stopsFailed = false;
    if (_dashStopIds.length) {
      try {
        for (let b = 0; b < _dashStopIds.length; b += 90) {
          const batch = _dashStopIds.slice(b, b + 90);
          const ff = `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(',')})`;
          const recs = await atGetAll(TABLES.ORDER_STOPS, { filterByFormula: ff }, false);
          recs.forEach(sr => {
            const pid = (sr.fields[F.STOP_PARENT_ORDER] || [])[0];
            if (pid) { if (!_dashStopsByOrder[pid]) _dashStopsByOrder[pid] = []; _dashStopsByOrder[pid].push(sr); }
          });
        }
      } catch(e) {
        // Ορατή αποτυχία: τα Κενά χλμ δείχνουν «δεν φόρτωσε», όχι «—» που
        // μοιάζει με «χωρίς ζεύγη» (κανόνας #7).
        stopsFailed = true;
        if (typeof logError === 'function') logError(e, 'dashboard ORDER_STOPS fetch');
      }
    }

    const truckMap = {}; trucks.forEach(t => { truckMap[t.id] = t.fields; });
    const clientMap = {}; clients.forEach(cl => { clientMap[cl.id] = cl.fields; });

    const now = new Date();
    const today = localToday();
    const tmrw = localTomorrow();
    const wn = currentWeekNumber();
    const pm = now.getHours() >= 12;

    // ═══ Η ΕΒΔΟΜΑΔΑ ═══
    const activeTrucks = trucks.filter(t => t.fields['Active']);
    const weekOf = w => orders.filter(r => Number(r.fields['Week Number']) === Number(w));
    const trendWeeks = [wn - 3, wn - 2, wn - 1, wn].filter(w => w >= 1);

    // Άγνωστο ≠ μηδέν, και «λίγα» ≠ «κακά» (3/9/2026). Δευτέρα πρωί η εβδομάδα
    // έχει 2-3 παραγγελίες: το `_pct(0,3)` έγραφε «Ανάθεση 0% (0/3)», το KPI
    // «ΦΟΡΤΗΓΑ ΣΕ ΔΡΟΜΟ 0%», το δέλτα «−32 μον. vs W35», και το σκορ έπεφτε
    // ~20 μονάδες κατηγορώντας την Ανάθεση για μια εβδομάδα που δεν έχει καν
    // αρχίσει. Μηδέν παραγγελίες = κανένα ποσοστό· κάτω από WEEK_MIN το
    // ποσοστό ΔΗΛΩΝΕΤΑΙ «πολύ νωρίς» και δεν κρίνεται με χρώμα.
    // Ο έλεγχος γίνεται ΕΔΩ και όχι στο core/metrics.js — εκείνο δεν είναι
    // δικό μας αρχείο και το `_pct` το μοιράζονται κι άλλες οθόνες.
    const WEEK_MIN = 5;
    const weekN = weekOf(wn).length;
    const weekNone = weekN === 0;
    const weekEarly = weekN < WEEK_MIN;
    const weekNote = weekNone ? `καμία παραγγελία στη W${wn} ακόμη`
      : weekEarly ? `πολύ νωρίς — ${weekN} ${weekN === 1 ? 'παραγγελία' : 'παραγγελίες'} στη W${wn}` : '';

    // Φορτηγά σε δρόμο — metrics.fleetUtilization, ίδιος τύπος για KPI και τάση.
    const util = metrics.fleetUtilization(trucks, orders, { week: wn });
    const utilTrend = trendWeeks.map(w => ({ week: w, pct: metrics.fleetUtilization(trucks, orders, { week: w }).pct, n: weekOf(w).length }));
    const idleIds = new Set(activeTrucks.map(t => t.id));
    weekOf(wn).forEach(o => _arr(o.fields['Truck']).forEach(id => idleIds.delete(id)));
    const idlePlates = activeTrucks.filter(t => idleIds.has(t.id)).map(t => t.fields['License Plate'] || '?');
    const unassignedWeek = weekOf(wn).filter(r => _unassigned(r.fields) && _open(r.fields)).length;

    // Συνέπεια παράδοσης — ΜΟΝΟ η ένδειξη On Time/Delayed (owner 30/8), ποτέ
    // ημερομηνίες. Μία υλοποίηση: _ecOnTime() του core/entity.js.
    const perfOf = list => list.map(r => r.fields['Delivery Performance'] || '');
    const onTime = _ecOnTime(perfOf(orders));                       // null = καμία κρίση
    const onTimeTrend = trendWeeks.map(w => ({ week: w, r: _ecOnTime(perfOf(weekOf(w))) }));

    // Κενά χλμ — ζευγάρωμα εξαγωγής→επιστροφής (owner 12/8, βλ. _dashDeadKm).
    const locCoords = {};
    getRefLocations().forEach(l => {
      const lat = l.fields['Latitude'], lng = l.fields['Longitude'];
      if (lat && lng) locCoords[l.id] = { lat: +lat, lng: +lng };
    });
    const avgOf = list => list.length ? Math.round(list.reduce((s, v) => s + v, 0) / list.length) : null;
    const deadKm = _dashDeadKm(weekOf(wn), _dashStopsByOrder, locCoords);
    const deadKmTrend = trendWeeks.map(w => ({ week: w, r: _dashDeadKm(weekOf(w), _dashStopsByOrder, locCoords) }));
    const deadKmAvg = avgOf(deadKm.list);
    const deadKmPrev = deadKmTrend.length > 1 ? avgOf(deadKmTrend[deadKmTrend.length - 2].r.list) : null;

    // Συμμόρφωση — metrics.compliancePct (MA-7: μία πηγή, >= today).
    const comp = metrics.compliancePct(trucks);
    // Ανάθεση — metrics.assignmentRate (φορτηγό Ή συνεργάτης = ανατεθειμένο).
    const assign = metrics.assignmentRate(weekOf(wn), {});

    // Βαθμός εβδομάδας — metrics.weeklyScore, ΧΩΡΙΣ κατασκευασμένο 100 στα Κενά
    // χλμ (το παλιό safeDeadKm, πρόταση βαθμίδας 3 στο w3-notes). Όταν λείπει
    // συνιστώσα, μερικό σκορ με αστερίσκο: το βάρος της συνιστώσας βγαίνει από
    // την ίδια τη weeklyScore (διαφορά 0↔100), όχι από δεύτερη σταθερά εδώ.
    // Χωρίς κρίση παράδοσης το σκορ δεν υπολογίζεται καθόλου (MA-8).
    const deadKmScore = deadKmAvg == null ? null
      : deadKmAvg <= 50 ? 100 : deadKmAvg <= 150 ? Math.round(100 - (deadKmAvg - 50)) : Math.max(0, Math.round(50 - (deadKmAvg - 150) * 0.33));
    let score = null, scoreParts = 0, scorePartial = false;
    // Χωρίς καμία παραγγελία στην εβδομάδα, η Ανάθεση δεν είναι 0% — είναι
    // άγνωστη· ένα σκορ χτισμένο πάνω της θα ήταν κατασκευασμένο.
    if (onTime && !weekNone) {
      const base = { assignment_rate: assign.pct, on_time: onTime.pct, compliance: comp.pct };
      if (deadKmScore != null) {
        score = metrics.weeklyScore({ ...base, dead_km_score: deadKmScore }).score; scoreParts = 4;
      } else {
        const zero = metrics.weeklyScore({ ...base, dead_km_score: 0 }).score;
        const full = metrics.weeklyScore({ ...base, dead_km_score: 100 }).score;
        const w = (full - zero) / 100;
        score = Math.round(zero / (1 - w)); scoreParts = 3; scorePartial = true;
      }
    }
    const onTimeCount = onTime ? Math.round(onTime.pct * onTime.judged / 100) : 0;
    // `judged:false` = the value is shown but NOT ranked: a bar that says
    // «πολύ νωρίς» and is painted amber as «τραβά κάτω» contradicts itself
    // (measured 4/9: «Ανάθεση 0% (0/3) · πολύ νωρίς» in warn colour).
    const comps = [
      { l: 'Ανάθεση',     pct: weekNone ? null : assign.pct, judged: !weekEarly,
        txt: weekNone ? `— (${weekNote})` : `${assign.pct}% (${assign.assigned}/${assign.total})${weekEarly ? ' · πολύ νωρίς' : ''}` },
      { l: 'Συνέπεια',    pct: onTime ? onTime.pct : null, txt: onTime ? `${onTime.pct}% (${onTimeCount}/${onTime.judged})` : '— (χωρίς κρίση)' },
      { l: 'Συμμόρφωση',  pct: comp.pct,    txt: `${comp.pct}% (${comp.valid}/${comp.total})` },
      { l: 'Κενά χλμ',    pct: deadKmScore, txt: deadKmScore == null ? '— (χωρίς μέτρηση)' : `${deadKmScore}% (${deadKmAvg} χλμ)` },
    ];
    const known = comps.filter(x => x.pct != null && x.judged !== false);
    const weakest = known.length ? known.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;

    // ═══ ΑΝΑΧΩΡΗΣΕΙΣ / ΠΑΡΑΔΟΣΕΙΣ ═══
    const departures = [], deliveries = [];
    orders.forEach(r => {
      const f = r.fields;
      const loadDt = toLocalDate(f['Loading DateTime']);
      const delDt = toLocalDate(f['Delivery DateTime']);
      if (loadDt !== today && loadDt !== tmrw && delDt !== today && delDt !== tmrw) return;
      const row = {
        id: r.id,
        client: _dashClientName(f, clientMap),
        route: orderRoute(f, 80),
        pallets: f['Total Pallets'],
        plate: _dashPlate(f, truckMap),
        status: _dashStatusWord(f),
        loaded: f['Status'] === 'In Transit' || f['Status'] === 'Delivered' || f['Status'] === 'Invoiced',
      };
      if (loadDt === today || loadDt === tmrw) departures.push({ ...row, day: loadDt === today ? 'ΣΗΜΕΡΑ' : 'ΑΥΡΙΟ', time: _dashTime(f['Loading DateTime']) });
      if (delDt === today || delDt === tmrw)   deliveries.push({ ...row, day: delDt === today ? 'ΣΗΜΕΡΑ' : 'ΑΥΡΙΟ', time: _dashTime(f['Delivery DateTime']) });
    });
    const byDayTime = (a, b) => (a.day === b.day ? 0 : a.day === 'ΣΗΜΕΡΑ' ? -1 : 1) || a.time.localeCompare(b.time);
    departures.sort(byDayTime); deliveries.sort(byDayTime);

    // ═══ ΑΝΑΜΟΝΗ ΑΝΑΘΕΣΗΣ — ΚΑΤΑ ΠΡΟΘΕΣΜΙΑ ═══
    // ΠΡΟΘΕΣΜΙΑ = ΗΜΕΡΕΣ έως τη φόρτωση (owner 2/9 · μονάδα διορθωμένη 3/9),
    // όχι «ηλικία» από τη δημιουργία — το createdTime ήταν ανάποδο σήμα.
    // Ώρες δεν υπάρχουν στη βάση· βλ. _dashDayDiff.
    const waiting = orders.filter(r => _unassigned(r.fields) && _open(r.fields)).map(r => {
      const f = r.fields;
      const days = _dashDayDiff(f['Loading DateTime'], today);
      const dir = f['Direction'] === 'Import' ? 'IMP' : 'EXP';
      return {
        id: r.id, label: f['Reference'] ? `${dir} ${f['Reference']}` : dir,
        client: _dashClientName(f, clientMap), route: orderRoute(f, 80),
        delDate: (f['Delivery DateTime'] || '').substring(0, 10), pallets: f['Total Pallets'],
        days, direction: f['Direction'],
      };
    }).sort((a, b) => (a.days == null ? 1e9 : a.days) - (b.days == null ? 1e9 : b.days));
    // Δύο ΞΕΧΩΡΙΣΤΟΙ αριθμοί: το παλιό «σε <48ω» μετρούσε και τις αρνητικές
    // ώρες, δηλαδή έλεγε «φορτώνουν σε <48ω» για φορτία που είχαν ΗΔΗ περάσει.
    const waitingLate = waiting.filter(w => w.days != null && w.days < 0).length;
    const waitingSoon = waiting.filter(w => w.days != null && w.days >= 0 && w.days <= 2).length;

    // ═══ ΕΙΔΟΠΟΙΗΣΕΙΣ ΣΤΟΛΟΥ ═══
    // ληγμένα → χωρίς καταχώρηση → συντομότερη λήξη (dash-home, 2/9), όλα
    // (χωρίς εσωτερική κύλιση, χωρίς slice — εύρημα 26/8).
    const alerts = [];
    const horizon = toLocalDate(new Date(Date.now() + 30 * 864e5));
    const docLabel = { 'KTEO Expiry': 'ΚΤΕΟ', 'KEK Expiry': 'ΚΕΚ', 'Insurance Expiry': 'Ασφάλεια', 'FRC Expiry': 'FRC' };
    const pushDoc = (plate, kind, field, f) => {
      const dt = (f[field] || '').substring(0, 10);
      if (!dt) { alerts.push({ plate, kind, doc: docLabel[field], state: 'unknown', days: null }); return; }
      if (dt > horizon) return;
      const days = Math.ceil((new Date(dt) - now) / 864e5);
      alerts.push({ plate, kind, doc: docLabel[field], state: days < 0 ? 'expired' : 'soon', days });
    };
    activeTrucks.forEach(t => TRUCK_EXPIRY_NAMES.forEach(fl => pushDoc(t.fields['License Plate'] || '—', 'truck', fl, t.fields)));
    // Ρυμούλκες: `!== false` ώστε ασυμπλήρωτο Active να ΕΙΔΟΠΟΙΕΙ. Το FRC
    // ζητείται μόνο από ψυγεία και όχι με NO-FRC στα Notes — ίδιος κανόνας με
    // το maintenance.js (_expiryFieldsFor), ώστε μια κουρτίνα να μη γράφεται
    // «άγνωστο FRC».
    trailers.filter(t => t.fields['Active'] !== false).forEach(t => {
      const f = t.fields;
      TRAILER_EXPIRY_FIELDS.forEach(ef => {
        if (ef.field === 'FRC Expiry') {
          if (/\bNO-FRC\b/i.test(String(f['Notes'] || ''))) return;
          if (!f[ef.field] && String(f['Trailer Type'] || '').trim().toLowerCase() !== 'reefer') return;
        }
        pushDoc(f['License Plate'] || '—', 'trailer', ef.field, f);
      });
    });
    const rank = { expired: 0, unknown: 1, soon: 2 };
    alerts.sort((a, b) => rank[a.state] - rank[b.state] || (a.days ?? 0) - (b.days ?? 0));
    const nExpired = alerts.filter(a => a.state === 'expired').length;
    const nUnknown = alerts.filter(a => a.state === 'unknown').length;
    const nSoon = alerts.filter(a => a.state === 'soon').length;

    // ΜΙΑ γραμμή ανά ΟΧΗΜΑ, όχι ανά έγγραφο (3/9/2026). Μετρήθηκε: 43
    // ειδοποιήσεις σε στήλη 380px που συνέχιζε μόνη της 770px κάτω από την
    // αριστερή στήλη, με την ίδια πινακίδα να επαναλαμβάνεται 2-3 φορές.
    // Η ομαδοποίηση ΔΕΝ κρύβει τίποτα — κανένα slice, κάθε έγγραφο μένει
    // ορατό δίπλα στην πινακίδα του (αρχή 1). Το `alerts` είναι ήδη
    // ταξινομημένο και το Map κρατά σειρά εισαγωγής, οπότε το χειρότερο
    // έγγραφο κάθε οχήματος είναι το docs[0] και τα οχήματα βγαίνουν με τη
    // σειρά του χειρότερου εγγράφου τους.
    const _groups = new Map();
    alerts.forEach(a => {
      const key = a.kind + '|' + a.plate;
      if (!_groups.has(key)) _groups.set(key, { plate: a.plate, kind: a.kind, docs: [] });
      _groups.get(key).docs.push(a);
    });
    const alertGroups = [..._groups.values()];

    // ═══ ΣΤΟΧΟΙ 2026 — τιμές από το ΠΡΑΓΜΑΤΙΚΟ παράθυρο (30 ημ), όχι YTD ═══
    // Το frame γράφει YTD· το YTD θέλει ανάγνωση όλου του έτους (νέα κλήση =
    // αλλαγή απόδοσης, PRIME DIRECTIVE). Μέχρι απόφαση owner, το παράθυρο
    // ΔΗΛΩΝΕΤΑΙ πάνω στο πλακίδιο. «Ημέρες χωρίς ληγμένο» δεν μετράται: θέλει
    // ιστορικό λήξεων ανά ημέρα που δεν υπάρχει — γράφεται «—», ποτέ αριθμός.
    const util30 = metrics.fleetUtilization(trucks, orders, {});
    const dead30 = _dashDeadKm(orders, _dashStopsByOrder, locCoords);
    const dead30Avg = avgOf(dead30.list);

    if (typeof reportPageMetrics === 'function') reportPageMetrics('dashboard', {
      weekNumber: wn,
      expiredFleetDocs: nExpired,
      fleetAlerts30d: nSoon,
      activeTrucks: activeTrucks.length,
      trucksInUse: util.busy,
      compliancePct: comp.pct,
      weeklyScore: score == null ? -1 : score,
      onTimePct: onTime ? onTime.pct : -1,
      unassignedOpen: waiting.length,
    });

    // ═══ RENDER ═══
    if (typeof currentPage !== 'undefined' && currentPage !== 'dashboard') return;
    const greeting = now.getHours() < 12 ? 'Καλημέρα' : now.getHours() < 18 ? 'Καλό απόγευμα' : 'Καλό βράδυ';
    const dateStr = now.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' });
    const hhmm = now.toTimeString().slice(0, 5);
    // Ουδέτερος δακτύλιος όταν το σκορ είναι μερικό Ή η εβδομάδα μόλις άρχισε:
    // ένα κόκκινο 53 από τρεις παραγγελίες Δευτέρας είναι ετυμηγορία που
    // κανείς δεν έχει δικαίωμα να βγάλει ακόμη.
    const ringColor = score == null ? 'var(--text-dim)' : (scorePartial || weekEarly) ? 'var(--surface-dark)' : score >= 85 ? 'var(--ok)' : score >= 70 ? 'var(--warn)' : 'var(--danger)';
    const prevUtil = utilTrend.length > 1 ? utilTrend[utilTrend.length - 2] : null;
    const prevOnTime = onTimeTrend.length > 1 ? onTimeTrend[onTimeTrend.length - 2].r : null;

    const opsDep = _dashOpsCard('Αναχωρήσεις', departures, 'weekly_intl', 'Εβδομαδιαίο', pm, 'Καμία αναχώρηση σήμερα ή αύριο', 'ORDERS · ημερομηνία φόρτωσης');
    const opsDel = _dashOpsCard('Παραδόσεις', deliveries, 'orders_intl', 'Παραγγελίες', false, 'Καμία παράδοση σήμερα ή αύριο', 'ORDERS · ημερομηνία παράδοσης');

    c.innerHTML = `${_dashCss()}
    <div class="dh dash-home">
      <div class="dh-header">
        <div>
          <div class="dh-greet">${greeting}, ${_esc(user.name.split(' ')[0])}</div>
          <div class="dh-date">${_esc(dateStr)} · Εβδομάδα ${wn} ISO</div>
        </div>
        <div class="dh-actions">
          <button type="button" class="btn btn-primary btn-sm" onclick="navigate('orders_intl')">Νέα παραγγελία</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="navigate('daily_ops')">Ημερήσιο</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="navigate('weekly_intl')">Εβδομαδιαίο</button>
          <span class="dh-upd">ενημερώθηκε ${hhmm} · ανά 5′</span>
        </div>
      </div>

      <div class="dh-band-label">Η ΕΒΔΟΜΑΔΑ · W${wn} · ανασκόπηση — τα σημερινά παρακάτω</div>
      <div class="dh-band">
        <div class="dh-card dh-score">
          <div class="dh-ring-wrap">
            <div class="dh-ring" style="--ring:${ringColor};--deg:${score == null ? 0 : Math.round(score * 3.6)}deg">
              <div class="dh-ring-num">${score == null ? '—' : score + (scorePartial ? '*' : '')}</div>
            </div>
            <div class="dh-score-label">ΒΑΘΜΟΣ W${wn}${score == null ? ' · χωρίς δείγμα' : ` · ${scoreParts}/4`}</div>
            ${scorePartial ? `<div class="dh-score-note">* μερικό σκορ — ${scoreParts} από 4 συνιστώσες (λείπουν τα Κενά χλμ)</div>` : ''}
            ${weekEarly && score != null ? `<div class="dh-score-note">${weekNote}</div>` : ''}
          </div>
          <div class="dh-bars">
            ${comps.map(x => `<div class="dh-bar${weakest && x.l === weakest.l ? ' low' : ''}">
              <span>${x.l}</span>
              <div class="dh-bar-track">${x.pct == null ? '' : `<div class="dh-bar-fill" style="width:${x.pct}%"></div>`}</div>
              <span class="dh-bar-val">${x.txt}</span>
            </div>`).join('')}
            <div class="dh-receipt">metrics.weeklyScore() · βάρη 30/30/25/15 · ${onTime ? `δείγμα ${onTime.judged} κριθείσες` : 'χωρίς κρίση παράδοσης — το σκορ δεν υπολογίζεται'}${weekNone ? ` · ${weekNote} — το σκορ δεν υπολογίζεται` : ''}${scorePartial ? ` · χωρίς Κενά χλμ (${scoreParts}/4)` : ''}${weakest && score != null ? ` · τραβά κάτω: ${weakest.l}` : ''}</div>
          </div>
        </div>

        ${_dashKpi({
          label: 'ΦΟΡΤΗΓΑ ΣΕ ΔΡΟΜΟ', period: `W${wn}`, link: 'Εβδομαδιαίο', page: 'weekly_intl',
          // Χωρίς παραγγελίες στην εβδομάδα δεν υπάρχει «0% αξιοποίηση» —
          // υπάρχει εβδομάδα που δεν άρχισε. Και το δέλτα σιωπά όσο το
          // δείγμα είναι πολύ μικρό: «−32 μον. vs W35» από 3 παραγγελίες
          // είναι θόρυβος που διαβάζεται ως κατάρρευση.
          value: weekNone ? '—' : `${util.pct}%`, muted: weekNone,
          delta: (prevUtil && !weekEarly) ? _dashDeltaPts(util.pct, prevUtil.pct, prevUtil.n, wn - 1, 'μον.', false) : '',
          trend: _dashTrend(utilTrend.map(t => ({ v: t.pct, ok: t.n > 0 }))),
          sub: `${util.busy}/${util.total} ενεργά φορτηγά · ${unassignedWeek} χωρίς ανάθεση${weekNote ? ` · ${weekNote}` : ''}`,
          warnSub: weekEarly,
          src: `ORDERS × TRUCKS · W${wn} ISO · φορτηγά με ≥1 ανάθεση`,
        })}
        ${_dashKpi({
          label: 'ΚΕΝΑ ΧΙΛΙΟΜΕΤΡΑ', period: `W${wn}`, link: 'Εβδομαδιαίο', page: 'weekly_intl',
          value: deadKmAvg == null ? '—' : `${deadKmAvg} χλμ`,
          muted: deadKmAvg == null,
          delta: deadKmAvg == null ? '' : _dashDeltaPts(deadKmAvg, deadKmPrev, deadKmPrev == null ? 0 : 1, wn - 1, 'χλμ', true),
          trend: _dashTrend(deadKmTrend.map(t => ({ v: avgOf(t.r.list), ok: t.r.list.length > 0 }))),
          sub: stopsFailed ? 'οι στάσεις δεν φόρτωσαν — δεν μετρήθηκε'
             : deadKm.paired === 0 ? 'κανένα ζεύγος διαδρομών αυτή την εβδομάδα'
             : deadKmAvg == null ? `0/${deadKm.paired} ζεύγη — λείπουν συντεταγμένες`
             : `μ.ό. ${deadKm.list.length}/${deadKm.paired} ζευγών${deadKm.noCoords ? ` · ${deadKm.noCoords} χωρίς συντεταγμένες` : ''}`,
          src: `ORDER_STOPS · W${wn} · ${deadKmAvg == null ? 'γεμίζει με συντεταγμένες' : 'εξαγωγή → επόμενη φόρτωση ίδιου φορτηγού'}`,
          warnSub: stopsFailed || (deadKmAvg == null && deadKm.paired > 0),
        })}
        ${_dashKpi({
          // ΠΡΟΣΟΧΗ: αυτό το πλακίδιο μετράει ΟΛΟ το παράθυρο 30 ημερών
          // (`orders`), όχι την εβδομάδα — γι' αυτό το επίθημα λέει «30 ΗΜ»
          // ενώ κάθεται μέσα στη ζώνη «Η ΕΒΔΟΜΑΔΑ». Η ασυμφωνία υπήρχε πάντα
          // και ήταν αόρατη· τώρα δηλώνεται (αρχή 1).
          label: 'ΣΥΝΕΠΕΙΑ ΠΑΡΑΔΟΣΗΣ', period: '30 ΗΜ', link: 'Παραγγελίες', page: 'orders_intl',
          value: onTime ? `${onTime.pct}%` : '—', muted: !onTime,
          delta: onTime && prevOnTime ? _dashDeltaPts(onTime.pct, prevOnTime.pct, prevOnTime.judged, wn - 1, 'μον.', false) : '',
          trend: _dashTrend(onTimeTrend.map(t => ({ v: t.r ? t.r.pct : null, ok: !!t.r }))),
          sub: onTime ? `${onTimeCount}/${onTime.judged} κριθείσες εμπρόθεσμες · ${onTime.unjudged} χωρίς κρίση` : `καμία κρίση παράδοσης στις 30 ημέρες · ${orders.length} παραγγελίες`,
          src: 'ORDERS · 30 ημ · κρίση dispatcher (On Time/Delayed), όχι ημερομηνίες',
        })}
      </div>

      <div class="dh-card dh-goals">
        <div class="dh-goals-head">
          <span class="dh-goals-title">Στόχοι 2026 — μέτρηση τελευταίων 30 ημερών</span>
          <span class="dh-goals-note">όχι YTD: το παράθυρο δεδομένων είναι 30 ημερών · στόχοι ενδεικτικοί, ορίζονται από τον owner</span>
        </div>
        <div class="dh-goals-grid">
          ${_dashGoal('ΣΥΝΕΠΕΙΑ ΠΑΡΑΔΟΣΗΣ', '30 ΗΜ', onTime ? `${onTime.pct}%` : '—', onTime ? `(δείγμα ${onTime.judged})` : '(χωρίς κρίση)', `στόχος ≥ ${DASH_GOALS_2026.onTimePct}%`,
            onTime ? _dashGap(onTime.pct - DASH_GOALS_2026.onTimePct, 'μον.') : null)}
          ${_dashGoal('ΚΕΝΑ ΧΙΛΙΟΜΕΤΡΑ', '30 ΗΜ', dead30Avg == null ? '—' : `${dead30Avg} χλμ μ.ό.`, dead30Avg == null ? (dead30.paired ? '(λείπουν συντεταγμένες)' : '(κανένα ζεύγος)') : `(${dead30.list.length} ζεύγη)`, `στόχος ≤ ${DASH_GOALS_2026.deadKmAvg} χλμ`,
            dead30Avg == null ? null : _dashGap(DASH_GOALS_2026.deadKmAvg - dead30Avg, 'χλμ'))}
          ${_dashGoal('ΑΞΙΟΠΟΙΗΣΗ ΣΤΟΛΟΥ', '30 ΗΜ', util30.total ? `${util30.pct}%` : '—', util30.total ? `(${util30.busy}/${util30.total} φορτηγά)` : '(κανένα ενεργό φορτηγό)', `στόχος ≥ ${DASH_GOALS_2026.utilizationPct}%`,
            util30.total ? _dashGap(util30.pct - DASH_GOALS_2026.utilizationPct, 'μον.') : null)}
          ${_dashGoal('ΗΜΕΡΕΣ ΧΩΡΙΣ ΛΗΓΜΕΝΟ ΕΓΓΡΑΦΟ', 'ΕΤΟΣ', '—', '(δεν μετράται ακόμη)', `στόχος ${DASH_GOALS_2026.daysNoExpired}`,
            `<span class="dh-goal-d">χρειάζεται ιστορικό λήξεων ανά ημέρα · σήμερα: ${nExpired ? `${nExpired} ληγμένα σε κυκλοφορία` : 'κανένα ληγμένο'}</span>`)}
        </div>
      </div>

      <div class="dh-main">
        <div class="dh-left">
          <div class="dh-ops">${pm ? opsDel + opsDep : opsDep + opsDel}</div>

          <div class="dh-card">
            <div class="dh-ch">Αναμονή ανάθεσης — κατά προθεσμία
              <span class="n">${waiting.length} ανοιχτές · χωρίς φορτηγό ΚΑΙ χωρίς συνεργάτη${waitingLate ? ` · ${waitingLate} πέρασαν` : ''}${waitingSoon ? ` · ${waitingSoon} φορτώνουν εντός 2 ημερών` : ''} · ORDERS 30 ημ</span>
            </div>
            ${waiting.length ? `<table class="dh-tbl">
              <thead><tr><th>ΦΟΡΤΙΟ</th><th>ΠΕΛΑΤΗΣ / ΔΡΟΜΟΛΟΓΙΟ</th><th>ΠΑΡΑΔΟΣΗ</th><th style="text-align:right">PAL</th><th style="text-align:right">ΠΡΟΘΕΣΜΙΑ</th></tr></thead>
              <tbody>${waiting.map(w => `<tr ${_KB} aria-label="${_esc(w.label)} — άνοιγμα παραγγελίας" onclick="window._dashNav={dir:'${w.direction === 'Import' ? 'Import' : 'Export'}',trip:'unassigned'};navigate('orders_intl')">
                <td class="dh-lbl">${_esc(w.label)}</td>
                <td><span class="c">${_esc(w.client)}</span> <span class="r">${_esc(w.route)}</span></td>
                <td>${w.delDate ? fmtDateDM(w.delDate) : '—'}</td>
                <td style="text-align:right;font-variant-numeric:tabular-nums">${w.pallets != null ? w.pallets : '—'}</td>
                <td style="text-align:right">${_dashDuePill(w.days)}</td>
              </tr>`).join('')}</tbody>
            </table>` : `<div class="dh-empty">Καμία ανοιχτή παραγγελία χωρίς ανάθεση — ORDERS 30 ημ, ${orders.length} παραγγελίες ελέγχθηκαν.</div>`}
            <div class="dh-foot">ΔΙΑΘΕΣΙΜΑ ΓΙΑ ΑΝΑΘΕΣΗ · ${idlePlates.length}/${activeTrucks.length}
              ${idlePlates.slice(0, 3).map(p => `<span class="dh-plate">${_esc(p)}</span>`).join('')}
              ${idlePlates.length > 3 ? `<a class="dh-link" onclick="navigate('trucks')">+${idlePlates.length - 3} ακόμη ›</a>` : ''}
              ${!idlePlates.length ? '<span class="dh-foot-none">κανένα αδρανές φορτηγό αυτή την εβδομάδα</span>' : ''}
            </div>
          </div>
        </div>

        <div class="dh-right">
          <div class="dh-card">
            <div class="dh-ch">Ειδοποιήσεις στόλου <a class="dh-link" style="margin-left:auto" onclick="navigate('maint_expiry')">Λήξεις ›</a></div>
            <div class="dh-sum">${nExpired} ληγμένα · ${nUnknown} χωρίς καταχώρηση · ${nSoon} λήγουν σε 30 ημ — σε ${alertGroups.length} ${alertGroups.length === 1 ? 'όχημα' : 'οχήματα'}</div>
            ${alertGroups.length ? alertGroups.map(g => `<div class="dh-alert" role="button" ${_KB} onclick="navigate('${g.kind === 'truck' ? 'trucks' : 'trailers'}')">
              <span class="p">${_esc(g.plate)}${g.kind === 'trailer' ? ' <span class="k">(ρυμ.)</span>' : ''}</span>
              <span class="dh-docs">${g.docs.map(a => `<span class="dh-doc"><span class="d">${a.doc}</span> ${
                a.state === 'expired' ? `<span class="x">ΛΗΓΜΕΝΟ — ${Math.abs(a.days)} ${Math.abs(a.days) === 1 ? 'μέρα' : 'μέρες'}</span>`
                : a.state === 'unknown' ? '<span class="u">άγνωστο · συμπλήρωση ›</span>'
                : `<span class="k">σε ${a.days} ${a.days === 1 ? 'μέρα' : 'μέρες'}</span>`}</span>`).join('')}</span>
            </div>`).join('') : '<div class="dh-empty">Κανένα έγγραφο ληγμένο, άγνωστο ή προς λήξη σε 30 ημέρες — TRUCKS + TRAILERS.</div>'}
          </div>
        </div>
      </div>
    </div>`;

    if (_dashRefreshTimer) clearInterval(_dashRefreshTimer);
    _dashRefreshTimer = setInterval(() => {
      if (typeof currentPage !== 'undefined' && currentPage === 'dashboard') renderDashboard();
      else { clearInterval(_dashRefreshTimer); _dashRefreshTimer = null; }
    }, 5 * 60 * 1000);

  } catch (e) {
    if (typeof logError === 'function') logError(e, 'renderDashboard');
    // Σφάλμα ≠ κενό (κανόνας #7): λέει τι δεν φόρτωσε και δίνει Επανάληψη.
    c.innerHTML = `${_dashCss()}<div class="dh"><div class="dh-card">
      <div class="dh-ch">Το dashboard δεν φόρτωσε</div>
      <div class="dh-err">${_esc(e && e.message ? e.message : 'σφάλμα')} — ORDERS / TRUCKS / ORDER_STOPS. Αυτό ΔΕΝ σημαίνει ότι δεν υπάρχουν παραγγελίες.
        <button type="button" class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="renderDashboard()">Επανάληψη</button></div>
    </div></div>`;
  }
}

// ── Κενά χλμ — ζευγάρωμα εξαγωγής → επιστροφής ─────────────────────────
// Είχε τρία λάθη που έδιναν μέσο όρο ενός ζεύγους ενώ υπήρχαν δεκάδες (owner
// 12/8/2026): (1) κάθε εξαγωγή έπαιρνε την ΠΡΩΤΗ εισαγωγή του φορτηγού,
// (2) καμία χρονική σειρά, (3) ζεύγος χωρίς συντεταγμένες έπεφτε σιωπηλά.
// Τώρα: κάθε επιστροφή καταναλώνεται ΜΙΑ φορά, επιλέγεται η πλησιέστερη ΜΕΤΑ
// την παράδοση, και όσα ζεύγη δεν μετρήθηκαν ΔΗΛΩΝΟΝΤΑΙ.
function _dashDeadKm(weekOrders, stopsByOrder, locCoords) {
  const exps = weekOrders.filter(r => r.fields['Direction'] === 'Export' && _arr(r.fields['Truck']).length);
  const imps = weekOrders.filter(r => r.fields['Direction'] === 'Import' && _arr(r.fields['Truck']).length);
  const firstStop = (id, type, last) => {
    const st = (stopsByOrder[id] || [])
      .filter(x => x.fields[F.STOP_TYPE] === type)
      .sort((a, b) => last
        ? (b.fields[F.STOP_NUMBER] || 0) - (a.fields[F.STOP_NUMBER] || 0)
        : (a.fields[F.STOP_NUMBER] || 0) - (b.fields[F.STOP_NUMBER] || 0));
    return st.length ? (st[0].fields[F.STOP_LOCATION] || [])[0] || null : null;
  };
  const used = new Set();
  const list = [];
  let paired = 0, noCoords = 0;
  [...exps].sort((a, b) => String(a.fields['Delivery DateTime'] || '').localeCompare(String(b.fields['Delivery DateTime'] || '')))
    .forEach(exp => {
      const truck = getLinkId(exp.fields['Truck']);
      if (!truck) return;
      const doneAt = String(exp.fields['Delivery DateTime'] || '');
      const cand = imps
        .filter(i => !used.has(i.id) && getLinkId(i.fields['Truck']) === truck)
        .filter(i => !doneAt || String(i.fields['Loading DateTime'] || '') >= doneAt)
        .sort((a, b) => String(a.fields['Loading DateTime'] || '').localeCompare(String(b.fields['Loading DateTime'] || '')))[0];
      if (!cand) return;
      used.add(cand.id);
      paired++;
      const a = firstStop(exp.id, 'Unloading', true);
      const b = firstStop(cand.id, 'Loading', false);
      if (a && b && locCoords[a] && locCoords[b]) {
        list.push(Math.round(haversineKm(locCoords[a].lat, locCoords[a].lng, locCoords[b].lat, locCoords[b].lng)));
      } else {
        noCoords++;
      }
    });
  return { list, paired, noCoords };
}

// ── Helpers ───────────────────────────────────────────────
function _dashClientName(f, clientMap) {
  const id = getLinkId(f['Client']);
  return (id && clientMap[id] ? clientMap[id]['Company Name'] : (f['Client Name'] || f['Client Summary'] || '').split(',')[0].trim()) || '—';
}
function _dashPlate(f, truckMap) {
  const tid = getLinkId(f['Truck']);
  if (tid && truckMap[tid]) return truckMap[tid]['License Plate'] || '';
  if (_arr(f['Partner']).length) return f['Partner Truck Plates'] || 'ΣΥΝ.';
  return '';
}
// Ώρα φόρτωσης/παράδοσης — ΜΟΝΟ αν υπάρχει. Οι στήλες είναι `date` χωρίς ώρα
// (μετρημένο 3/9: κανένα δείγμα με 'T'), οπότε η συνάρτηση επέστρεφε μόνιμα
// «—» και κάθε γραμμή ξεκινούσε με μια παύλα που δεν σήμαινε τίποτα. Κενό
// string = η γραμμή δεν αποδίδει καθόλου ώρα (αρχή 8: ή ζωντανεύει ή φεύγει).
function _dashTime(raw) {
  raw = raw || '';
  return raw.includes('T') ? (raw.split('T')[1] || '').substring(0, 5) : '';
}
// Κανόνας #2: η κατάσταση είναι ΛΕΞΗ, όχι χρωματιστή κουκκίδα.
function _dashStatusWord(f) {
  const s = f['Status'] || 'Pending';
  if (s === 'In Transit') return { t: 'ΣΕ ΜΕΤΑΦΟΡΑ', cls: 'on' };
  if (s === 'Delivered' || s === 'Invoiced') return { t: 'ΠΑΡΑΔΟΘΗΚΕ', cls: '' };
  if (s === 'Cancelled') return { t: 'ΑΚΥΡΩΘΗΚΕ', cls: '' };
  if (_arr(f['Partner']).length) return { t: 'ΣΥΝΕΡΓΑΤΗΣ', cls: '' };
  if (_arr(f['Truck']).length) return { t: 'ΑΝΑΤΕΘΕΙΜΕΝΟ', cls: '' };
  return { t: 'ΧΩΡΙΣ ΦΟΡΤΗΓΟ', cls: 'none' };
}

function _dashOpsCard(title, rows, page, linkLabel, collapsed, emptyText, src) {
  const group = day => rows.filter(r => r.day === day);
  const rowHtml = r => `<div class="dh-row" role="button" ${_KB} onclick="navigate('${page}')">
    <div><div class="c">${_esc(r.client)}</div><div class="r">${_esc(r.route)}</div></div>
    <div class="m">${r.time ? r.time + ' · ' : ''}${r.pallets != null ? r.pallets + 'p' : '—'}${r.plate ? ' · ' + _esc(r.plate) : ''}<div class="s ${r.status.cls}">${r.status.t}</div></div>
  </div>`;
  const body = rows.length
    ? ['ΣΗΜΕΡΑ', 'ΑΥΡΙΟ'].map(d => group(d).length ? `<div class="dh-grp">${d}</div>${group(d).map(rowHtml).join('')}` : '').join('')
    : `<div class="dh-empty">${emptyText} — ${src}.</div>`;
  // pm (μετά τις 12:00, dash-home-pm 376:898): οι αναχωρήσεις συμπτύσσονται
  // σε «x/y φόρτωσαν» — η πρωινή δουλειά τελείωσε, οι παραδόσεις προηγούνται.
  const todayRows = group('ΣΗΜΕΡΑ');
  if (collapsed && todayRows.length) {
    const loaded = todayRows.filter(r => r.loaded).length;
    return `<div class="dh-card"><details class="dh-details">
      <summary class="dh-ch">${title}<span class="n">${loaded}/${todayRows.length} φόρτωσαν σήμερα · άνοιγμα ▾</span></summary>${body}</details></div>`;
  }
  return `<div class="dh-card">
    <div class="dh-ch">${title}<span class="n">${rows.length}</span><a class="dh-link" onclick="navigate('${page}')">${linkLabel} ›</a></div>
    ${body}
  </div>`;
}

function _dashKpi(k) {
  return `<button type="button" class="dh-card dh-kpi" onclick="navigate('${k.page}')">
    <div class="dh-kpi-top"><span>${k.label}${k.period ? ` <span class="dh-per">· ${k.period}</span>` : ''}</span><span class="dh-kpi-link">${k.link} ›</span></div>
    <div class="dh-kpi-val${k.muted ? ' muted' : ''}">${k.value}${k.delta || ''}</div>
    ${k.trend}
    <div class="dh-kpi-sub${k.warnSub ? ' warn' : ''}">${k.sub}</div>
    <div class="dh-src">${k.src}</div>
  </button>`;
}

// Δέλτα σε ΜΟΝΑΔΕΣ (ποσοστιαίες), όχι σε % της προηγούμενης τιμής (dash-home
// 2/9). Χωρίς δείγμα την προηγούμενη εβδομάδα → τίποτα, όχι ψεύτικο +100%.
function _dashDeltaPts(cur, prev, prevN, prevWeek, unit, lowerBetter) {
  if (prev == null || !prevN) return '';
  const d = cur - prev;
  if (!d) return `<span class="dh-delta">±0 vs W${prevWeek}</span>`;
  const good = lowerBetter ? d < 0 : d > 0;
  return `<span class="dh-delta ${good ? 'good' : 'bad'}">${d > 0 ? '+' : '−'}${Math.abs(d)} ${unit} vs W${prevWeek}</span>`;
}

// Τάση 4 εβδομάδων (ο παλιός sparkline 7 εβδ από παράθυρο 30 ημ έδειχνε
// τρεις εβδομάδες πάντα 0 — πρόταση w3-notes). Κάτω από 2 σημεία με δεδομένα:
// «καμία χρονική σειρά», όχι επίπεδη γραμμή στο 0 (dash-states 377:898).
function _dashTrend(points) {
  const withData = points.filter(p => p.ok && p.v != null);
  if (withData.length < 2) return '<div class="dh-trend"><span class="dh-noseries">καμία χρονική σειρά</span></div>';
  const vals = withData.map(p => p.v);
  const max = Math.max(...vals, 1);
  return `<div class="dh-trend"><span class="dh-bars4">${points.map((p, i) =>
    `<i style="height:${p.ok && p.v != null ? Math.max(3, Math.round(p.v / max * 16)) : 2}px"${i === points.length - 1 ? ' class="last"' : ''}${p.ok && p.v != null ? '' : ' data-empty="1"'}></i>`).join('')}</span>
    <span>${withData.length} εβδ · ${vals[0]} → ${vals[vals.length - 1]}</span></div>`;
}

// `period` υποχρεωτικό: δύο πλακίδια με το ΙΔΙΟ όνομα και διαφορετικό αριθμό
// («ΚΕΝΑ ΧΙΛΙΟΜΕΤΡΑ —» της εβδομάδας 130px πάνω από «ΚΕΝΑ ΧΙΛΙΟΜΕΤΡΑ 218 χλμ»
// των 30 ημερών) διαβάζονται ως αντίφαση. Το επίθημα υπήρχε στο Figma και
// είχε αφαιρεθεί — επανήλθε 3/9/2026, και στα ΔΥΟ επίπεδα.
function _dashGoal(label, period, value, meta, target, gapHtml) {
  return `<div><div class="dh-goal-l">${label} <span class="dh-per">· ${period}</span></div>
    <div class="dh-goal-v">${value} <span class="dh-goal-t">${meta}</span><span class="dh-goal-t">· ${target}</span></div>
    ${gapHtml || '<span class="dh-goal-d">απόσταση από τον στόχο: δεν μετράται</span>'}</div>`;
}
// Απόσταση από στόχο σε ΚΕΙΜΕΝΟ, όχι μπάρα προόδου (dash-home 2/9).
// `diff` είναι ήδη προσανατολισμένο: θετικό = καλύτερα από τον στόχο.
function _dashGap(diff, unit) {
  if (!diff) return '<span class="dh-goal-d">στον στόχο</span>';
  const abs = Math.abs(diff);
  return diff > 0
    ? `<span class="dh-goal-d">+${abs} ${unit} καλύτερα από τον στόχο</span>`
    : `<span class="dh-goal-d bad">−${abs} ${unit} από τον στόχο</span>`;
}

// Προθεσμία φόρτωσης σε ΗΜΕΡΕΣ (3/9). Δύο αλλαγές μαζί:
//  · μονάδα — «σήμερα» δεν λέγεται πια «πέρασε · 3 ώρες» (βλ. _dashDayDiff)·
//  · χρώμα — η προθεσμία είναι ΠΟΡΤΟΚΑΛΙ, όχι κόκκινο. Το κόκκινο μένει
//    αποκλειστικά στο ΛΗΓΜΕΝΟ έγγραφο των Ειδοποιήσεων στόλου: όταν δύο
//    διαφορετικά πράγματα βάφονται ίδια, και η στήλη βγαίνει 7/7 κόκκινη, το
//    χρώμα παύει να ταξινομεί (frame dash-home 338:874, μέτρηση 3/9).
function _dashDuePill(days) {
  if (days == null) return '<span class="dh-pill">χωρίς ημερομηνία φόρτωσης</span>';
  if (days < 0) { const a = Math.abs(days); return `<span class="dh-pill late">πέρασε · ${a} ${a === 1 ? 'μέρα' : 'μέρες'}</span>`; }
  if (days === 0) return '<span class="dh-pill due">φορτώνει σήμερα</span>';
  if (days === 1) return '<span class="dh-pill due">αύριο</span>';
  if (days <= 2) return `<span class="dh-pill due">σε ${days} μέρες</span>`;
  return `<span class="dh-pill">σε ${days} μέρες</span>`;
}

// ── CSS (μόνο tokens — κανόνας #1) ─────────────────────────
function _dashCss() { return `<style>
.dh{max-width:1336px;margin:0 auto;padding:0 0 24px;color:var(--text);font-family:'DM Sans',sans-serif}
.dh-header{display:flex;justify-content:space-between;align-items:flex-start;padding:2px 0 8px}
.dh-greet{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;line-height:22px}
.dh-date{font-size:12px;color:var(--text-dim);margin-top:4px}
.dh-actions{display:flex;align-items:center;gap:8px}
.dh-upd{font-size:11px;color:var(--text-dim);margin-left:8px;white-space:nowrap}
.dh-band-label{font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--text-dim);margin:12px 0 8px}
.dh-band{display:grid;grid-template-columns:minmax(380px,500px) repeat(3,minmax(0,1fr));gap:12px}
.dh-card{background:var(--surface-card);border:1px solid var(--border);border-radius:6px;min-width:0}
.dh-score{display:flex;gap:16px;padding:12px 16px}
.dh-ring-wrap{flex:0 0 120px}
.dh-ring{width:120px;height:120px;border-radius:50%;background:conic-gradient(var(--ring) var(--deg),var(--surface-sunken) 0);display:grid;place-items:center;position:relative}
.dh-ring::after{content:'';position:absolute;inset:10px;background:var(--surface-card);border-radius:50%}
.dh-ring-num{position:relative;z-index:1;font-size:48px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.dh-score-label{font-size:11px;font-weight:700;letter-spacing:.04em;color:var(--text-dim);text-align:center;margin-top:8px;white-space:nowrap}
/* Ο αστερίσκος του «53*» δεν εξηγούνταν πουθενά στην οθόνη (σάρωση κάθε
   κόμβου κειμένου 3/9): μια tooltip δεν είναι εξήγηση για τον χρήστη των
   05:30. Η επεξήγηση είναι ΟΡΑΤΟ κείμενο, κάτω από τον δακτύλιο. */
.dh-score-note{font-size:11px;line-height:14px;color:var(--text-dim);text-align:center;margin-top:4px}
.dh-bars{flex:1;min-width:0}
/* Value column is minmax(118px,auto), not a fixed 118px: «0% (0/3) · πολύ νωρίς»
   measures 121px and was clipped by the card edge (4/9). The track shrinks
   instead — a bar 3px shorter is invisible, a cut word is not. */
.dh-bar{display:grid;grid-template-columns:92px minmax(0,1fr) minmax(118px,auto);align-items:center;gap:8px;font-size:12px;margin-bottom:8px}
.dh-bar-track{height:5px;background:var(--surface-sunken);border-radius:6px;overflow:hidden}
.dh-bar-fill{height:100%;border-radius:6px;background:var(--surface-dark)}
.dh-bar.low span:first-child{font-weight:700}
.dh-bar.low .dh-bar-fill{background:var(--warn)}
.dh-bar-val{text-align:right;font-variant-numeric:tabular-nums;color:var(--text-mid);white-space:nowrap}
.dh-receipt,.dh-src{font-size:11px;color:var(--text-dim);line-height:14px}
.dh-receipt{margin-top:12px}
.dh-kpi{padding:16px 16px 12px;display:flex;flex-direction:column;align-items:stretch;cursor:pointer;text-align:left;font:inherit;color:inherit}
.dh-kpi:hover{border-color:var(--accent)}
.dh-kpi-top{display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:700;letter-spacing:.04em;color:var(--text-dim)}
.dh-kpi-link{font-weight:500;letter-spacing:0;color:var(--accent-text);white-space:nowrap}
.dh-per{font-weight:500;letter-spacing:0;color:var(--text-dim);white-space:nowrap}
.dh-kpi-val{font-size:36px;font-weight:700;line-height:36px;margin-top:8px;display:flex;align-items:center;gap:8px;font-variant-numeric:tabular-nums;flex-wrap:wrap}
.dh-kpi-val.muted{color:var(--text-dim)}
.dh-delta{font-size:11px;font-weight:600;padding:2px 6px;border-radius:9999px;background:var(--surface-sunken);color:var(--text-mid);white-space:nowrap}
/* Το αρνητικό δέλτα είναι τάση, ΟΧΙ ληγμένο έγγραφο — πορτοκαλί. Το κόκκινο
   της οθόνης ανήκει αποκλειστικά στο ΛΗΓΜΕΝΟ (3/9). */
.dh-delta.good{color:var(--ok)} .dh-delta.bad{color:var(--warn)}
.dh-trend{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11px;color:var(--text-dim);min-height:16px}
.dh-bars4{display:flex;align-items:flex-end;gap:4px;height:16px}
.dh-bars4 i{display:block;width:7px;background:var(--border);border-radius:6px}
.dh-bars4 i.last{background:var(--surface-dark)}
.dh-bars4 i[data-empty]{background:var(--surface-sunken)}
.dh-noseries{font-style:italic}
.dh-kpi-sub{font-size:12px;color:var(--text-mid);margin-top:8px}
.dh-kpi-sub.warn{color:var(--warn)}
.dh-src{margin-top:auto;padding-top:8px}
.dh-goals{margin-top:12px;padding:12px 16px}
.dh-goals-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.dh-goals-title{font-size:14px;font-weight:700}
.dh-goals-note{font-size:11px;color:var(--text-dim)}
.dh-goals-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;margin-top:8px}
.dh-goal-l{font-size:11px;font-weight:700;letter-spacing:.04em;color:var(--text-dim)}
.dh-goal-v{font-size:16px;font-weight:700;margin-top:4px;font-variant-numeric:tabular-nums}
.dh-goal-t{font-size:11px;color:var(--text-dim);font-weight:400;margin-left:4px}
.dh-goal-d{display:block;font-size:11px;margin-top:4px;color:var(--text-mid)}
.dh-goal-d.bad{color:var(--warn)}
.dh-main{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:12px;margin-top:12px;align-items:start}
.dh-left{display:flex;flex-direction:column;gap:12px;min-width:0}
.dh-ops{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.dh-ch{display:flex;align-items:center;gap:8px;padding:12px 16px 4px;font-size:13px;font-weight:700}
.dh-ch .n{font-weight:500;color:var(--text-mid);font-size:12px;margin-left:auto}
.dh-link{font-size:12px;font-weight:500;color:var(--accent-text);cursor:pointer;white-space:nowrap}
.dh-details summary{list-style:none;cursor:pointer} .dh-details summary::-webkit-details-marker{display:none}
.dh-grp{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--text-dim);padding:8px 16px 0}
/* ≥36px σε κάθε κλικαρίσιμη γραμμή (μέτρηση 3/9: 49 στόχοι κάτω από 36px). */
.dh-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:4px 16px;min-height:36px;cursor:pointer}
.dh-row:hover{background:var(--surface-sunken)}
.dh-row .c{font-size:13px;font-weight:500}
.dh-row .r{font-size:11px;color:var(--text-dim)}
.dh-row .m{text-align:right;font-size:11px;color:var(--text-mid);white-space:nowrap;font-variant-numeric:tabular-nums}
.dh-row .s{font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--text-dim)}
/* «ΧΩΡΙΣ ΦΟΡΤΗΓΟ» = ενέργεια σήμερα, όχι ληγμένο έγγραφο — πορτοκαλί (3/9). */
.dh-row .s.on{color:var(--accent-text)} .dh-row .s.none{color:var(--warn)}
.dh-row:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.dh-tbl{width:100%;border-collapse:collapse;font-size:13px}
.dh-tbl th{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--text-dim);text-align:left;padding:8px 8px 6px;border-bottom:1px solid var(--border)}
.dh-tbl th:first-child,.dh-tbl td:first-child{padding-left:16px}
.dh-tbl td{padding:8px;border-bottom:1px solid var(--border);vertical-align:middle;height:36px}
.dh-tbl tbody tr{cursor:pointer} .dh-tbl tbody tr:hover td{background:var(--surface-sunken)}
.dh-tbl tbody tr:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.dh-tbl .dh-lbl{font-weight:600;white-space:nowrap}
.dh-tbl .c{font-weight:500} .dh-tbl .r{font-size:11px;color:var(--text-dim);margin-left:8px}
/* Η ΠΡΟΘΕΣΜΙΑ είναι πορτοκαλί, ποτέ κόκκινη (3/9): το κόκκινο μοιραζόταν με
   το ΛΗΓΜΕΝΟ ΚΤΕΟ των Ειδοποιήσεων και τα δύο σήμαιναν διαφορετικά πράγματα
   — ενέργεια σήμερα vs χρόνιο εύρημα. Επιπλέον το --danger πάνω σε
   --danger-bg μετρήθηκε 4.28:1 (κάτω από AA)· το --warning σε λευκή κάρτα
   δίνει 5.0:1 και πάνω σε --warning-bg 4.6:1. Περίγραμμα αντί για γέμισμα
   ώστε 7/7 πορτοκαλί γραμμές να μη γίνουν πάλι ένας τοίχος χρώματος. */
.dh-pill{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;background:var(--surface-sunken);border:1px solid transparent;color:var(--text-mid);white-space:nowrap}
.dh-pill.due{background:var(--surface-card);border-color:var(--warn);color:var(--warn)}
.dh-pill.late{background:var(--warn-bg);border-color:var(--warn);color:var(--warn)}
.dh-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 16px;font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--text-dim);border-top:1px solid var(--border)}
.dh-foot-none{font-weight:400;letter-spacing:0;font-size:11px}
.dh-plate{font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;border:1px solid var(--border);color:var(--text);letter-spacing:0}
/* Μία γραμμή ανά ΟΧΗΜΑ: τα έγγραφά του μπαίνουν σε στήλη μέσα στη γραμμή,
   ώστε τίποτα να μη χαθεί και η στήλη να μη συνεχίζει μόνη της (βλ. Δ3). */
.dh-alert{display:grid;grid-template-columns:96px minmax(0,1fr);gap:8px;padding:8px 16px;font-size:12px;align-items:start;min-height:36px;cursor:pointer;border-bottom:1px solid var(--border)}
.dh-alert:hover{background:var(--surface-sunken)}
.dh-alert:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.dh-alert .p{font-weight:600;padding-top:2px}
/* Τα έγγραφα ρέουν οριζόντια και τυλίγονται μόνο όταν δεν χωρούν: σε στοίβα
   η ομαδοποίηση έκανε τη στήλη ΨΗΛΟΤΕΡΗ (μετρήθηκε 1.376px) και ακύρωνε τον
   σκοπό της. Το σταθερό πλάτος στο όνομα εγγράφου κρατά τη στήλη ΚΤΕΟ/ΚΕΚ/FRC
   ευθυγραμμισμένη όταν τυλιχτούν — αλλιώς το «Ασφάλεια» μετατόπιζε τη γραμμή. */
.dh-docs{display:flex;flex-wrap:wrap;column-gap:12px;row-gap:2px;min-width:0}
.dh-doc{display:inline-flex;gap:8px;align-items:baseline;white-space:nowrap}
.dh-doc .d{min-width:58px}
.dh-alert .d{color:var(--text-mid)}
.dh-alert .x{color:var(--danger);font-weight:700} .dh-alert .u{color:var(--warn)} .dh-alert .k{color:var(--text-mid)}
.dh-sum{font-size:12px;color:var(--text-mid);padding:0 16px 8px}
.dh-empty{padding:16px;font-size:12px;color:var(--text-dim)}
.dh-err{padding:12px 16px;font-size:12px;color:var(--warn);background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:6px;margin:8px 16px 16px}
.dh-sk{background:var(--surface-sunken);border-radius:6px;animation:dh-sk 1.4s ease-in-out infinite}
@keyframes dh-sk{0%,100%{opacity:.5}50%{opacity:.9}}
@media (max-width:1366px){.dh-band{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.dh-score{grid-column:1/-1}.dh-main{grid-template-columns:minmax(0,1fr) 340px}}
</style>`; }

// ── Skeleton (light, μόνο tokens) ─────────────────────────
function _dashSkeleton() {
  return `${_dashCss()}<div class="dh">
    <div class="dh-header"><div><div class="dh-sk" style="width:220px;height:22px"></div><div class="dh-sk" style="width:180px;height:12px;margin-top:6px"></div></div><div class="dh-sk" style="width:360px;height:34px"></div></div>
    <div class="dh-band" style="margin-top:29px">${['','','',''].map(() => '<div class="dh-sk" style="height:163px"></div>').join('')}</div>
    <div class="dh-sk" style="height:106px;margin-top:12px"></div>
    <div class="dh-main"><div class="dh-left"><div class="dh-ops"><div class="dh-sk" style="height:218px"></div><div class="dh-sk" style="height:218px"></div></div><div class="dh-sk" style="height:276px"></div></div><div class="dh-sk" style="height:506px"></div></div>
  </div>`;
}

window.renderDashboard = renderDashboard;
})();
