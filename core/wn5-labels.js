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
  });

  const CONSEQUENCE = Object.freeze({
    payroll_amount: (c) => 'γραμμή μισθοδοσίας με ποσό (' + month(c.month) + ')' + amounts(c),
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
