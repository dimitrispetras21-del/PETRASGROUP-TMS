// core/wn5-labels.js — National v5 (F4α, T11): the ONLY texts of the v5 screens for codes the Worker sends WITHOUT
// a text: warnings[].code of a write or a preview, consequences[].kind of a dry run. Every other message the screen
// shows is error.message, preview.conflict.message or notice.message as the Worker / the DB wrote it (principle 3:
// a second copy of a Worker text drifts). tests/wn5-labels.test.js holds both maps equal to the codes 072 builds.
//
// Amounts: the DB strips amount / advance / expenses / invoice_number for every role but owner and accountant
// (plan_h_strip_amounts, 072:381). A line shows an amount ONLY when the key is present in the item — the screen never
// checks a role (owner 23/10, decision 41; no role gate on screens, owner 10/10).
// No line says «πληρωμένη» (decision 10, S-85): the base cannot know what was paid, so the list names the month.
// Pure: no DOM, no clock. UMD like core/wi4-logic.js: require() in node tests, window.WN5Lab in the page.
(function (root) {
  'use strict';
  const SIDE_ACC = Object.freeze({ KATHODOS: 'ΚΑΘΟΔΟ', ANODOS: 'ΑΝΟΔΟ' });
  const side = (s) => SIDE_ACC[s] || '—';
  const num = (n) => (typeof n === 'number' && isFinite(n) ? n : null);
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== null && o[k] !== undefined;
  function pal(n) { const v = num(n); return v === null ? '—' : String(Math.round(v * 10) / 10).replace('.', ','); }
  // The month as Figma H4/H6 write it (approval 25/10, Σ8): «γραμμή μισθοδοσίας με ποσό (Οκτώβριος)».
  const MONTHS = Object.freeze(['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος']);
  function month(m) { const x = /^(\d{4})-(\d{2})$/.exec(String(m || '')); return x && MONTHS[Number(x[2]) - 1] ? MONTHS[Number(x[2]) - 1] : '—'; }
  function day(d) { const x = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return x ? x[3] + '/' + x[2] : '—'; }
  function eur(n) {
    const v = num(n);
    return v === null ? null : v.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }
  // «· ποσό 120,00 € · προκαταβολή 50,00 €» — each part only when its key came in the item.
  function amounts(c) {
    const out = [];
    for (const [k, w] of [['amount', 'ποσό'], ['advance', 'προκαταβολή'], ['expenses', 'έξοδα']]) {
      if (has(c, k) && eur(c[k])) out.push(w + ' ' + eur(c[k]));
    }
    return out.length ? ' · ' + out.join(' · ') : '';
  }

  // The trailer's pallets are ONE number (principle 3): WN5L.CAP of core/wn5-logic.js, itself held to the over_33
  // HAVING of 072 by tests/wn5-logic.test.js — never a second literal here. Read at call time: app.html loads
  // wn5-logic.js before this file, node require()s it; a sandbox without it gets lines without the number.
  function cap() {
    if (typeof WN5L !== 'undefined' && WN5L && typeof WN5L.CAP === 'number') return WN5L.CAP;
    if (typeof require === 'function') { try { return require('./wn5-logic.js').CAP; } catch (_) { return null; } }
    return null;
  }

  const WARNING = Object.freeze({
    // Δ12 tile 7: «Υπέρβαση 21π στο ΚΖΗ 2106 — αποθηκεύτηκε». 072 sends rt_id/side/pallets only; after a save the
    // screen adds saved_on (the cycle's truck or partner, from the board it holds) and the line is Figma's. Without
    // it (a preview, before saving) the side and the sum: nothing is claimed as saved.
    over_33: (w) => {
      const c = cap();
      if (num(w.pallets) === null || c === null) return 'Υπέρβαση ' + (c === null ? '' : c + ' ') + 'παλετών στην ' + side(w.side);
      return w.saved_on
        ? 'Υπέρβαση ' + pal(w.pallets - c) + 'π στο ' + w.saved_on + ' — αποθηκεύτηκε'
        : 'Υπέρβαση ' + pal(w.pallets - c) + 'π στην ' + side(w.side) + ' · ' + pal(w.pallets) + '/' + c;
    },
    mixed_temp: (w) => 'Μεικτές θερμοκρασίες στην ' + side(w.side) + ' · διαφορά ' + pal(w.delta_c) + ' °C',
    v1_same_truck: (w) => 'Το ίδιο φορτηγό έχει τις ίδιες ημέρες και δρομολόγιο του παλιού Εβδομαδιαίου (' + (w.rt_code || '—') + ')',
    local_payroll_review: () => 'Η γραμμή μισθοδοσίας του τοπικού οδηγού με ποσό πάει για έλεγχο στο λογιστήριο',
    vs_day_differs: (w) => 'Η ημέρα του VS διαφέρει από την πρώτη ημέρα του στη Βέροια (' + day(w.first_hub_day) + ')',
    // 072b: a stop that the new vehicle now executes (the driver sheet and the payroll days follow it)
    seg_stop_moved: (w) => `η στάση #${w.stop_id} περνά στο όχημα του άλλου τμήματος (#${w.from_segment_id} → #${w.to_segment_id})`,
    // 072b H-24: the handover time falls inside the stop's window — it stays with the segment of its arrival (H-9)
    seg_stop_straddles: (w) => `η ώρα της αλλαγής πέφτει μέσα στο παράθυρο της στάσης #${w.stop_id}: μένει στο τμήμα της άφιξης`,
    // 081 (owner 31/10): a point's new window did not take its truck's stop with it, and why. 'shared' names how many
    // other points stop there: the stop-time change moves it for all of them, with its own preview. 'windows_differ':
    // points of the same save asked the one stop for different windows (no other point is there to count). Any other
    // reason is a rule the move broke (owner 31/10, loose rules now): the point was saved and the stop stayed.
    stop_kept: (w) => {
      const n = Array.isArray(w.others) ? w.others.length : 0;
      const head = `η στάση του φορτηγού στο ${w.rt_code || '—'} δεν άλλαξε`;
      if (w.reason === 'executed') return head + ': έχει ήδη εκτελεστεί';
      if (w.reason === 'handover') return head + ': ο κύκλος έχει αλλαγή οχήματος · «Αλλαγή ώρας στάσης ›»';
      if (w.reason === 'windows_differ') return head + ': σημεία αυτής της αποθήκευσης ζητούν διαφορετική ώρα εκεί · «Αλλαγή ώρας στάσης ›»';
      // a rule the move would break (the point was saved, the stop stayed): the rule in words, never a code; the
      // busy detail only when it is cycle codes (in a race plan_h_finish can only name its EXCLUDE constraint)
      if (w.reason === 'truck_busy') return head + `: το φορτηγό είναι απασχολημένο τότε${/^RT-[\w/ -]+$/.test(w.detail || '') ? ' (' + w.detail + ')' : ''}`;
      if (w.reason === 'driver_busy') return head + `: ο οδηγός είναι απασχολημένος τότε${/^RT-[\w/ -]+$/.test(w.detail || '') ? ' (' + w.detail + ')' : ''}`;
      if (w.reason === 'stop_order' || w.reason === 'side_order' || w.reason === 'leg_order') return head + ': η νέα ώρα χαλάει τη σειρά των στάσεων του κύκλου · «Αλλαγή ώρας στάσης ›»';
      if (w.reason === 'payroll_locked') return head + ': η μισθοδοσία του κύκλου έχει ήδη ποσά';
      if (w.reason !== 'shared') return head + ': η μετακίνηση δεν επιτρέπεται εδώ · «Αλλαγή ώρας στάσης ›»';
      return head + `: εξυπηρετεί και ${n === 1 ? '1 άλλο σημείο' : n > 1 ? n + ' άλλα σημεία' : 'άλλα σημεία'} · «Αλλαγή ώρας στάσης ›» την αλλάζει για όλα`;
    },
  });

  const CONSEQUENCE = Object.freeze({
    // 073: one payroll line per driver of the cycle; when the item carries the driver's segment (segment_text,
    // «RT-… · ΑΡΧΙΚΟ ως <σημείο>») the line names it, without the key it stays byte-identical to T11's.
    payroll_amount: (c) => 'γραμμή μισθοδοσίας με ποσό (' + (c.segment_text ? c.segment_text + ' · ' : '') + month(c.month) + ')' + amounts(c),
    costs: (c) => {
      const n = num(c.count);
      const head = (n === null ? '—' : String(n)) + ' ' + (n === 1 ? 'γραμμή' : 'γραμμές') + ' ' + (c.pay_source || 'εξόδων');
      return has(c, 'amount') && eur(c.amount) ? head + ' · ' + eur(c.amount) : head;
    },
    executed_leg: (c) => 'διόρθωση: η παράδοση της ' + day(c.stop_day) + ' έχει ήδη γίνει',
    later_leg: (c) => 'φεύγει μαζί και το επόμενο σκέλος στο ' + (c.code || '—'),
    local_loading: (c) => 'ακυρώνεται η φόρτωση με τοπικό της ' + day(c.move_date),
    local_payroll: (c) => 'γραμμή μισθοδοσίας τοπικού με ποσό (' + month(c.month) + ')' + amounts(c) + ' · πάει για έλεγχο στο λογιστήριο',
    rt_cancelled: (c) => 'το δρομολόγιο ' + (c.code || '—') + ' θα σβηστεί',
    // invoice_number is a money key: a dispatcher's item never has it (S-87)
    invoiced: (c) => (has(c, 'invoice_number') ? 'τιμολογήθηκε (' + c.invoice_number + '): ' : 'τιμολογήθηκε: ') + 'το ERP κάνει το πιστωτικό',
    // 072b (👤7 = β): Move, Delete and plan_rt_update that narrow a cycle past a handover remove it after the token
    seg_removed: (c) => `θα αφαιρεθεί η αλλαγή οχήματος ${c.place_note || '—'} ${c.at_athens || ''}`.trim(),
    // 072b «one step» (owner 26/10): the same plan_rt_update also changes the vehicle of the ONE segment that stays.
    // The item carries ids only (no plate / name), so the line says what happens, not which vehicle.
    seg_vehicle: (c) => 'το τμήμα που μένει παίρνει το νέο ' + (c.trip_type === 'PARTNER' ? 'συνεργάτη' : 'όχημα'),
    // 072b prev_partner_rate: the previous segment's partner rate changes with the handover (decision 41: the rate is
    // shown to every role that writes it, so it is not a stripped amount)
    partner_rate: (c) => 'κόμιστρο ' + (c.partner || 'συνεργάτη') + ': ' + (eur(c.rate_from) || '—') + ' → ' + (eur(c.rate_to) || '—'),
    // 073 (F3 decision 8): a confirmed pallet line on a leg that leaves — counted, never money: every role sees it;
    // it is reversed after the token and a new pending line is written for the new movement.
    pallets_confirmed: (c) => `επιβεβαιωμένη γραμμή παλετών · ${c.event_type === 'LOADING' ? 'φόρτωση' : c.event_type === 'DELIVERY' ? 'παράδοση' : String(c.event_type)}`
      + ` · πήραμε ${c.taken} · δώσαμε ${c.given} — αντιλογίζεται μετά την επιβεβαίωση`,
    // 074a (F5 Ε-19): deleting an international order takes its VS bridge pieces off the v5 cycles. The item carries
    // ids and the cycle code only (no client, no amount, no place, no reference). «της στάσης #6101» (live 28/10) named
    // an internal order_stops id nobody can read, so the line names the cycle and whose load it is: this international
    // order's, or a national order made from it (nat_order_id: the base's id, not the reference the board shows, so
    // not printed). A place name comes only when the item carries one (c.place: a base change, proposed in the PR of
    // 28/10) — never an id.
    piece_on_rt: (c) => `βγαίνει από το ${c.code || '—'} `
      + (c.place ? `το φορτίο για ${c.place}` : c.nat_order_id != null ? 'το φορτίο της εθνικής που βγήκε από αυτή την παραγγελία' : 'το φορτίο αυτής της παραγγελίας'),
  });

  // The category word the two-step list puts before a line (Figma Δ5 2053:8079 and H4 2125:7738: «Μισθοδοσία · …»).
  // Only the kinds a frame draws with one; costs keeps its own words (see the T11 test that pins «2 γραμμές DKV»).
  const CATEGORY = Object.freeze({ payroll_amount: 'Μισθοδοσία', local_payroll: 'Μισθοδοσία' });

  // An unknown code is shown, never dropped (principle 1, Ε-21); the caller logs it once.
  function warningLine(w) {
    const f = w && Object.prototype.hasOwnProperty.call(WARNING, w.code) ? WARNING[w.code] : null;
    return f ? { text: f(w), unknown: false } : { text: 'προειδοποίηση · ' + String((w && w.code) || '—'), unknown: true };
  }
  function consequenceLine(c) {
    const f = c && Object.prototype.hasOwnProperty.call(CONSEQUENCE, c.kind) ? CONSEQUENCE[c.kind] : null;
    return f ? { text: f(c), unknown: false } : { text: 'άλλη επίπτωση · ' + String((c && c.kind) || '—'), unknown: true };
  }

  // H-19 / R-18 (072b): the eight reasons of a vehicle handover, the CHECK seg_reason_list of 072b. The screen's
  // ONLY copy of them, drift-tested against the SQL (tests/wn5-labels.test.js). «Βλάβη φορτηγού» here and
  // «Βλάβη οχήματος» in the Daily (067, OPS_DELAY) are two approved texts for the same code (HPLAN:121): keep both.
  // group = the two headings of the H2 list (ΑΠΡΟΒΛΕΠΤΟ / ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΟ) and «Άλλο», whose note is mandatory
  // (CHECK seg_other_note).
  const REASON = Object.freeze({
    vehicle_breakdown: Object.freeze({ text: 'Βλάβη φορτηγού', group: 'unplanned' }),
    reefer_breakdown: Object.freeze({ text: 'Βλάβη ψυγείου', group: 'unplanned' }),
    accident: Object.freeze({ text: 'Ατύχημα', group: 'unplanned' }),
    driver_hours: Object.freeze({ text: 'Ώρες οδηγού (ταχογράφος)', group: 'unplanned' }),
    driver_unavailable: Object.freeze({ text: 'Κώλυμα οδηγού (ασθένεια κ.λπ.)', group: 'unplanned' }),
    planned_driver: Object.freeze({ text: 'Προγραμματισμένη αλλαγή οδηγού', group: 'planned' }),
    planned_truck: Object.freeze({ text: 'Προγραμματισμένη αλλαγή φορτηγού', group: 'planned' }),
    other: Object.freeze({ text: 'Άλλο', group: 'other', noteRequired: true }),
  });
  // An unknown code is said, never dropped (principle 1); the caller logs it once.
  function reasonLine(code) {
    const r = Object.prototype.hasOwnProperty.call(REASON, code) ? REASON[code] : null;
    return r ? { text: r.text, unknown: false } : { text: 'άλλος λόγος · ' + String(code), unknown: true };
  }

  const WN5Lab = Object.freeze({ WARNING, CONSEQUENCE, CATEGORY, REASON, warningLine, consequenceLine, reasonLine });
  if (typeof module !== 'undefined' && module.exports) module.exports = WN5Lab;
  else root.WN5Lab = WN5Lab;
})(typeof window !== 'undefined' ? window : this);
