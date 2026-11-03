// ═══════════════════════════════════════════════════════════════════════════
// «Παραγγελίες»: the invoicing rules and the invoicing writes — ONE copy.
//
// Owner 3/11/2026: «Εβδομάδα» is Eirini's working table — she types the ΤΠΥ,
// ticks «Αυτοπαράδοση», enters or corrects a price there as in «Προς
// τιμολόγηση», without going back and forth between pages. Both views call
// this file, never a copy of their own (principle 3): the fields each write
// sends, the ΤΠΥ date and duplicate checks, who may write, where
// «Αυτοπαράδοση» is offered, the confirm texts, and the proof that a write
// reached the table — the record the Worker returns, never the absence of an
// error (an unmapped label is a 200 on the facade, trap #1; an offline
// stand-in is not a write).
//
// `it` = a row of OrdersInvoicingView.pure.annotate:
//   { rec, id, type: 'intl'|'natl', f, state, reason, num, client, clientId }.
// Pure rules are exported for node (tests/orders-invoicing-view.test.js and
// tests/orders-invoice-ops.test.js); the writes need the browser globals.
// ═══════════════════════════════════════════════════════════════════════════
const InvoiceOps = (() => {
  'use strict';

  const normTpy = s => String(s == null ? '' : s).trim().toLowerCase();

  // Is this ΤΠΥ already on another invoiced order of the loaded set? Same
  // client = normal (one ERP invoice often covers several orders); another
  // client = almost certainly a typo, so the write asks first.
  function dupCheck(items, number, self) {
    const n = normTpy(number);
    const out = { same: [], other: [] };
    if (!n) return out;
    for (const it of items) {
      if (it.id === self.id || it.state !== 'invoiced') continue;
      if (normTpy(it.f['Invoice Number']) !== n) continue;
      (it.clientId && it.clientId === self.clientId ? out.same : out.other).push(it);
    }
    return out;
  }
  // Date rules of the ERP invoice: after today = error (an invoice cannot be
  // issued tomorrow). Before the delivery is normal since B0 (owner 21/10/2026:
  // invoiced from registration) — the old «πριν την παράδοση — σίγουρα;» would
  // now fire on most invoices, and a warning that always fires is never read.
  function dateCheck(dateYmd, todayYmd) {
    if (!dateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return { error: 'συμπλήρωσε ημερομηνία' };
    if (dateYmd > todayYmd) return { error: 'μετά τη σημερινή (' + OrdersCommon.dm(todayYmd) + ')' };
    return {};
  }
  // The live lines under a ΤΠΥ box — the date, then a duplicate ΤΠΥ — in the
  // same words wherever she types one. kind: 'bad' | 'warn' | 'muted', which
  // each view maps to its own class; the text is raw (the view escapes it).
  function tpyHints(n, dc, dup) {
    const out = [dc.error ? { kind: 'bad', text: 'Ημερομηνία ' + dc.error } : { kind: 'muted', text: 'σήμερα ή παλαιότερη' }];
    if (dup.other.length) out.push({ kind: 'warn', text: `Ο ΤΠΥ ${n} υπάρχει ήδη στην ${dup.other[0].num} άλλου πελάτη (${dup.other[0].client})` });
    else if (dup.same.length) out.push({ kind: 'muted', text: `Ο ίδιος ΤΠΥ καλύπτει ήδη ${dup.same.map(x => x.num).join(', ')} του ίδιου πελάτη — ένα τιμολόγιο για πολλές παραγγελίες` });
    return out;
  }
  // The three fields — nothing else (no Status: «Invoiced» is a checkbox, not a
  // lifecycle status, owner 23/8 locked; migration 014 CHECK would refuse it).
  const invoiceFields = (n, d) => ({ 'Invoiced': true, 'Invoice Number': n, 'Invoice Date': d });
  // «Αυτοπαράδοση» (101): invoiced with no ERP number — the base and the Worker
  // let it through only with Self Delivery true, and 101's CHECK only with NO
  // number — sent as null, so the write never depends on what the row held.
  // The date is the day she ticks it.
  const selfFields = d => ({ 'Invoiced': true, 'Self Delivery': true, 'Invoice Number': null, 'Invoice Date': d });
  // Invoiced off and the ERP number/date cleared — migration 043 only guards
  // the transition TO true, the Worker lets this through. A self delivery clears
  // its box IN THE SAME write: unticking it alone on an invoiced row is refused
  // (101 — it never clears Invoiced by itself). Only then is the label sent, so
  // an ordinary undo never depends on it.
  const undoFields = self => Object.assign({ 'Invoiced': false, 'Invoice Number': null, 'Invoice Date': null }, self ? { 'Self Delivery': false } : {});
  // A ΤΠΥ correction on an invoiced order: number and date only.
  const tpyFields = (n, d) => ({ 'Invoice Number': n, 'Invoice Date': d });

  const isLot = it => it.type === 'intl' && typeof OrdersStock !== 'undefined' && OrdersStock.isLot(it.f);
  // «Αυτοπαράδοση» beside the ΤΠΥ (owner 2/11/2026): one tick = invoiced, no
  // number. Offered wherever the ΤΠΥ or the price is asked for — a self
  // delivery often has no price, and needs none (101). Not on an UNPRICED stock
  // lot: 057 freezes a lot source's price once it is invoiced, so it could
  // never get one (code review xhigh 2/11) — its price first, then the box.
  const selfAllowed = it => it.state === 'ready' || (it.state === 'blocked' && !isLot(it));

  // Who may change an INVOICED order's price (owner 3/11/2026: owner and
  // accountant, as 085): the rule of core/order-quick-edit.js, asked, never
  // copied. Without it every invoiced price stays locked (never an unpriced
  // one — that would say «τιμολογημένη» of an order that is not).
  const priceLocked = f => (typeof OrderQuickEdit !== 'undefined' && OrderQuickEdit.priceLocked ? OrderQuickEdit.priceLocked(f) : OrdersCommon.isInvoiced(f));
  // Owner + accountant (config.js costs:'full', «Προς τιμολόγηση» since 28/9);
  // the Worker checks the role again on PATCH.
  const canWrite = () => typeof can === 'function' && can('costs') === 'full';
  const tableOf = it => (it.type === 'intl' ? TABLES.ORDERS : TABLES.NAT_ORDERS);

  // ── Writes: each sends ONE PATCH and returns what the Worker answered, or
  // throws with the reason (the Worker / 043 / 101 / 057 refusal in Greek, a
  // 403, or the check below). core/api.js has already raised the red toast for
  // a refusal it saw; the caller says the reason where she is looking.
  function _answer(res, offlineMsg) {
    if (res && res._offline) throw new Error(offlineMsg);
    return (res && res.fields) || {};
  }
  async function writeInvoice(it, num, d) {
    const fields = invoiceFields(num, d);
    const back = _answer(await atPatch(tableOf(it), it.id, fields), 'Εκτός σύνδεσης — ο ΤΠΥ δεν γράφτηκε ακόμη');
    if (back['Invoiced'] !== true || normTpy(back['Invoice Number']) !== normTpy(num)) throw new Error('ο διακομιστής δεν επιβεβαίωσε τον ΤΠΥ');
    return fields;
  }
  async function writeSelf(it, d) {
    const fields = selfFields(d);
    const back = _answer(await atPatch(tableOf(it), it.id, fields), 'Εκτός σύνδεσης — δεν γράφτηκε ακόμη');
    if (back['Self Delivery'] !== true || back['Invoiced'] !== true) throw new Error('ο διακομιστής δεν επιβεβαίωσε την αυτοπαράδοση');
    return fields;
  }
  async function writeUndo(it, self) {
    const fields = undoFields(self);
    const back = _answer(await atPatch(tableOf(it), it.id, fields), 'Εκτός σύνδεσης — η αναίρεση δεν γράφτηκε ακόμη');
    if (back['Invoiced'] === true) throw new Error('ο διακομιστής δεν επιβεβαίωσε την αναίρεση');
    return fields;
  }
  async function writeTpy(it, num, d) {
    const fields = tpyFields(num, d);
    const back = _answer(await atPatch(tableOf(it), it.id, fields), 'Εκτός σύνδεσης — η διόρθωση δεν γράφτηκε ακόμη');
    if (normTpy(back['Invoice Number']) !== normTpy(num)) throw new Error('ο διακομιστής δεν επιβεβαίωσε τον ΤΠΥ');
    return fields;
  }
  // Same rules as «Χωρίς τιμή» save(): the price the Worker returns must be the
  // one typed (a coercion or a trigger would otherwise show success for a
  // different amount; review 28/9). Returns the price written.
  async function writePrice(it, n) {
    const res = await atPatch(tableOf(it), it.id, { 'Price': n });
    if (res && res._offline) throw new Error('Εκτός σύνδεσης — η τιμή δεν γράφτηκε ακόμη');
    const back = OrdersCommon.price(res && res.fields);
    if (!(back > 0)) throw new Error('ο διακομιστής δεν επέστρεψε την τιμή');
    if (Math.abs(back - n) > 0.005) throw new Error(`γράφτηκε ${OrdersCommon.eur(back)} αντί για ${OrdersCommon.eur(n)}`);
    return back;
  }

  // ── The questions asked before a write (same words wherever she writes) ──
  const confirmDup = (o, num, edit) => confirmAction(edit
    ? `Ο ΤΠΥ ${num} υπάρχει ήδη στην ${o.num} άλλου πελάτη (${o.client}). Διόρθωση παρ' όλα αυτά;`
    : `Ο ΤΠΥ ${num} υπάρχει ήδη στην ${o.num} άλλου πελάτη (${o.client}).\nΈνα τιμολόγιο ERP δεν αφορά δύο πελάτες — έλεγξε τον αριθμό. Καταχώριση παρ' όλα αυτά;`,
  { title: 'Ο ΤΠΥ υπάρχει ήδη', confirmLabel: edit ? 'Διόρθωση' : 'Καταχώριση', danger: true });
  const confirmEdit = (it, num) => confirmAction(`Η παραγγελία ${it.num} είναι ήδη τιμολογημένη.\nΟ αριθμός ${it.f['Invoice Number'] || '—'} θα αντικατασταθεί από ${num}.`,
    { title: 'Διόρθωση ΤΠΥ', confirmLabel: 'Διόρθωση' });
  const confirmUndo = (it, self) => confirmAction(self
    ? `Αναίρεση τιμολόγησης της ${it.num} (αυτοπαράδοση);\nΗ παραγγελία ξαναγίνεται «προς κοπή», η αυτοπαράδοση και η ημερομηνία σβήνουν.`
    : `Αναίρεση τιμολόγησης της ${it.num} (ΤΠΥ ${it.f['Invoice Number'] || '—'});\nΗ παραγγελία ξαναγίνεται «προς κοπή», ο αριθμός και η ημερομηνία σβήνουν. Το τιμολόγιο στο ERP ΔΕΝ ακυρώνεται από εδώ.`,
  { title: 'Αναίρεση τιμολόγησης', confirmLabel: 'Αναίρεση', danger: true });

  // An INVOICED order's price (owner 3/11): asked before, in the words of the
  // undo — the ERP invoice already carries the old amount and does not change
  // from here. A self delivery has no ERP invoice: that sentence is left out.
  // `it` needs only { num, f } (the card's «Διόρθωση» asks it too).
  const confirmPrice = (it, n) => {
    const f = it.f || {}, self = OrdersCommon.isSelfDelivery(f);
    const old = OrdersCommon.hasPrice(f) ? OrdersCommon.eurSym(OrdersCommon.price(f)) : '—';
    return confirmAction(self
      ? `Αλλαγή τιμής της ${it.num} (αυτοπαράδοση);\nΗ τιμή ${old} γίνεται ${OrdersCommon.eurSym(n)}. Δεν υπάρχει τιμολόγιο ERP για αυτή την παραγγελία.`
      : `Αλλαγή τιμής της ${it.num} (ΤΠΥ ${f['Invoice Number'] || '—'});\nΗ παραγγελία είναι τιμολογημένη: η τιμή ${old} γίνεται ${OrdersCommon.eurSym(n)}. Το τιμολόγιο στο ERP ΔΕΝ αλλάζει από εδώ.`,
    { title: 'Αλλαγή τιμής τιμολογημένης', confirmLabel: 'Αλλαγή τιμής', danger: true });
  };

  return { normTpy, dupCheck, dateCheck, tpyHints, invoiceFields, selfFields, undoFields, tpyFields, isLot, selfAllowed, priceLocked, canWrite, tableOf,
    writeInvoice, writeSelf, writeUndo, writeTpy, writePrice, confirmDup, confirmEdit, confirmUndo, confirmPrice };
})();

if (typeof window !== 'undefined') window.InvoiceOps = InvoiceOps;
if (typeof module !== 'undefined' && module.exports) module.exports = InvoiceOps;
