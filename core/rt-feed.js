// ═══════════════════════════════════════════════════════════
// CORE — RT FEEDER (COSTS Φ2, εγκεκριμένος πίνακας 24/8)
// Auto-create/sync/close round trips από την εκτέλεση των παραγγελιών.
// Μοτίβο pallet-feed: idempotent, μη μπλοκάρον, ποτέ σιωπηλό.
// Κανόνες-κλειδιά:
//  • RT γεννιέται όταν Status ∈ {In Transit, Delivered} ΚΑΙ υπάρχει ανάθεση —
//    όχι στην καταχώρηση: τα πλάνα αλλάζουν (owner 24/8).
//  • Κλεισμένο (closed/complete) RT ΔΕΝ αγγίζεται ποτέ αυτόματα — μόνο toast.
//    Το cost-complete είναι άλλος άξονας: γραμμές κόστους μπαίνουν κι αργότερα.
//  • RT με γραμμές κόστους δεν ακυρώνεται ποτέ αυτόματα (ποτέ ορφανά κόστη).
//  • Μοναδικότητα: unique index ct_leg_order στη βάση — όχι έλεγχοι κώδικα.
// Κενά του σημερινού /costs API (δηλώνονται με toast, ΔΕΝ αυτοσχεδιάζουμε):
// OWNED↔PARTNER, ενημέρωση κομίστρου.
// Η προσθήκη legs σε υπάρχον RT ΛΥΘΗΚΕ 5/9 (worker/src/rt-rules.mjs, N1):
// το POST /costs/rt είναι πλέον idempotent — attach αντί για δεύτερο create.
// ═══════════════════════════════════════════════════════════
'use strict';

const _RT = { lookups: null, pg: {} };

async function _rtSafe(label, fn) {
  try { return await fn(); }
  catch (e) {
    console.warn('[rt-feed]', label, e && e.message);
    if (typeof showErrorToast === 'function') {
      showErrorToast('P&L: απέτυχε ' + label + ' — ο μετρητής συμφωνίας στο TRIP PnL θα το δείξει', 'warn', 8000);
    }
    return null;
  }
}

async function _rtLookups() {
  if (!_RT.lookups) _RT.lookups = await plFetch('/costs/lookups');
  return _RT.lookups;
}

// rec → pg id: η ΜΟΝΗ γέφυρα χωρίς νέο endpoint είναι το /pallets/gate.
// Όριο: παραγγελία χωρίς ζωντανή στάση φόρτωσης δεν αντιστοιχίζεται —
// φωνάζουμε και τη μαζεύει ο μετρητής συμφωνίας.
async function _rtPg(orderRec) {
  if (_RT.pg[orderRec] !== undefined) return _RT.pg[orderRec];
  const g = await plFetch('/pallets/gate?order_recs=' + encodeURIComponent(orderRec));
  return (_RT.pg[orderRec] = (g.records && g.records[0]) ? g.records[0].order_id : null);
}

// Ο facade δίνει rec ids για στόλο· τα /costs θέλουν pg — αντιστοίχιση μέσω
// πινακίδας/ονόματος από τα /costs/lookups (πηγή: ίδια βάση).
function _rtFleetIds(f, lk) {
  const plate = r => r ? String(r).trim() : '';
  const truckPlate = typeof getTruckPlate === 'function' ? plate(getTruckPlate(getLinkedId(f['Truck']))) : '';
  const trailerRec = getLinkedId(f['Trailer']);
  const trailerPlate = trailerRec && typeof getRefTrailers === 'function'
    ? plate((getRefTrailers().find(t => t.id === trailerRec) || { fields: {} }).fields['License Plate']) : '';
  const driverName = typeof getDriverName === 'function' ? plate(getDriverName(getLinkedId(f['Driver']))) : '';
  const partnerRec = getLinkedId(f['Partner']);
  const partnerName = partnerRec && typeof getRefPartners === 'function'
    ? plate((getRefPartners().find(p => p.id === partnerRec) || { fields: {} }).fields['Company Name']) : '';
  const find = (rows, key, val) => { const r = val ? (rows || []).find(x => plate(x[key]) === val) : null; return r ? r.id : null; };
  return {
    truck_id: find(lk.trucks, 'license_plate', truckPlate),
    trailer_id: find(lk.trailers, 'license_plate', trailerPlate),
    driver_id: find(lk.drivers, 'full_name', driverName),
    partner_id: find(lk.partners, 'company_name', partnerName)
  };
}

async function _rtFind(pgIds) {
  const r = await plFetch('/costs/rt');
  return (r.records || []).find(rt => (rt.ct_rt_legs || []).some(l => pgIds.includes(l.order_id))) || null;
}

const _rtClosed = rt => rt && (rt.status === 'closed' || rt.status === 'complete');
const _rtWarn = (msg) => { if (typeof showErrorToast === 'function') showErrorToast(msg, 'warn', 9000); };

// ── Κύρια είσοδος: κάθε αποθήκευση διεθνούς παραγγελίας ──
async function rtOnOrderSaved(orderId) {
  return _rtSafe('συγχρονισμός round trip', async () => {
    let rec = await atGetOne(TABLES.ORDERS, orderId);
    if (!rec) return;
    let f = rec.fields;
    // Import με ζεύγος: η άγκυρα είναι το export του — δουλεύουμε σε εκείνο.
    if (f['Direction'] === 'Import') {
      const exp = await atGetAll(TABLES.ORDERS, { filterByFormula: `{Matched Import ID}='${orderId}'` }, true);
      if (exp && exp.length) { orderId = exp[0].id; rec = exp[0]; f = rec.fields; }
    }
    const status = f['Status'] || '';
    const partnerTrip = !!f['Is Partner Trip'];
    const assigned = !!(getLinkedId(f['Truck']) || (partnerTrip && getLinkedId(f['Partner'])));
    const importRec = f['Matched Import ID'] || null;
    const pgX = await _rtPg(orderId);
    if (pgX == null) return; // χωρίς στάση φόρτωσης — τη δείχνει ο μετρητής
    const pgI = importRec ? await _rtPg(importRec) : null;
    const rt = await _rtFind([pgX, pgI].filter(v => v != null));
    const gone = status === 'Cancelled';
    const exec = (status === 'In Transit' || status === 'Delivered') && assigned;

    if (_rtClosed(rt)) {
      // ΚΛΕΙΔΩΜΕΝΟΣ ΚΑΝΟΝΑΣ (owner 24/8): κλεισμένο = ιστορικό. Μόνο φωνή.
      if (gone) _rtWarn('P&L: η ' + (f['Reference'] || orderId) + ' ακυρώθηκε αλλά το ' + rt.code + ' είναι κλεισμένο — δες το στο TRIP PnL');
      return;
    }

    if (gone || !exec) {
      if (rt) {
        const lines = await plFetch('/costs/lines?rt_id=' + rt.id);
        if ((lines.records || []).length) {
          // Ποτέ ορφανά κόστη: μένει και φωνάζει.
          _rtWarn('P&L: το ' + rt.code + ' έχει κόστη αλλά η παραγγελία ' + (gone ? 'ακυρώθηκε' : 'έχασε την ανάθεση') + ' — θέλει χέρι στο TRIP PnL');
        } else {
          await plFetch('/costs/rt/' + rt.id, { method: 'PATCH', body: { status: 'cancelled' } });
        }
      }
      return;
    }

    // exec: διασφάλιση + συγχρονισμός
    const lk = await _rtLookups();
    const ids = _rtFleetIds(f, lk);
    let dStart = (f['Loading DateTime'] || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    let dEnd = (f['Delivery DateTime'] || '').slice(0, 10) || null;
    if (dEnd && dEnd < dStart) dEnd = null; // CHECK window_order της βάσης
    let rtRef = rt;
    if (!rt) {
      const body = {
        scope: 'INTL', trip_type: partnerTrip ? 'PARTNER' : 'OWNED', source: 'planner',
        date_start: dStart, date_end: dEnd,
        truck_id: partnerTrip ? null : ids.truck_id, trailer_id: partnerTrip ? null : ids.trailer_id,
        driver_id: partnerTrip ? null : ids.driver_id, partner_id: partnerTrip ? ids.partner_id : null,
        legs: [{ direction: 'EXPORT', order_id: pgX }].concat(pgI != null ? [{ direction: 'IMPORT', order_id: pgI }] : [])
      };
      if (body.trip_type === 'OWNED' && !body.truck_id) { _rtWarn('P&L: δεν βρέθηκε το φορτηγό στα lookups — το RT δεν δημιουργήθηκε (δες μετρητή)'); return; }
      if (body.trip_type === 'PARTNER' && !body.partner_id) { _rtWarn('P&L: δεν βρέθηκε ο συνεργάτης στα lookups — το RT δεν δημιουργήθηκε (δες μετρητή)'); return; }
      const res = await plFetch('/costs/rt', { method: 'POST', body });
      rtRef = res.record;
      // Αυτο-ίαση: ο Worker δεν είναι transactional — αν τα legs δεν γράφτηκαν,
      // το RT είναι ορφανό (δεν θα ξαναβρεθεί ποτέ) και ακυρώνεται ΕΔΩ, φωναχτά.
      // Δεν ισχύει σε response attach:true (N1, 5/9) — εκεί το RT βρέθηκε ήδη
      // υπαρκτό και res.legs είναι ΟΛΑ τα σκέλη του, όχι μόνο τα καινούρια.
      if (!res.attached && rtRef && (res.legs || []).length < body.legs.length) {
        await plFetch('/costs/rt/' + rtRef.id, { method: 'PATCH', body: { status: 'cancelled' } });
        _rtWarn('P&L: το ' + rtRef.code + ' δημιουργήθηκε χωρίς σκέλη και ακυρώθηκε — δες μετρητή συμφωνίας');
        return;
      }
      // Singleton κόμιστρο partner στη γέννηση — αλλιώς «κόστη ελλιπή» για πάντα.
      // Παραλείπεται σε attach:true: το RT δεν γεννήθηκε τώρα, άρα ήδη έχει (ή
      // έπρεπε να έχει πάρει) το κόμιστρό του — να το ξαναβάλεις θα το διπλογράψει.
      if (!res.attached && partnerTrip && parseFloat(f['Partner Rate'])) {
        await plFetch('/costs/lines', { method: 'POST', body: {
          rt_id: rtRef.id, category: 'partner_rate', net: parseFloat(f['Partner Rate']), vat: 0,
          line_date: dStart, note: 'auto από Weekly (' + (f['Reference'] || orderId) + ')' } });
      }
    } else {
      const patch = {};
      if (!partnerTrip && ids.truck_id && rt.truck_id !== ids.truck_id) patch.truck_id = ids.truck_id;
      if (!partnerTrip && ids.trailer_id && rt.trailer_id !== ids.trailer_id) patch.trailer_id = ids.trailer_id;
      if (!partnerTrip && ids.driver_id && rt.driver_id !== ids.driver_id) patch.driver_id = ids.driver_id;
      if (dStart && rt.date_start !== dStart) patch.date_start = dStart;
      if (dEnd && rt.date_end !== dEnd) patch.date_end = dEnd;
      if (Object.keys(patch).length) await plFetch('/costs/rt/' + rt.id, { method: 'PATCH', body: patch });
      // Λείπον σκέλος σε ήδη υπάρχον RT — π.χ. ταίριασμα στο Weekly International
      // ΜΕΤΑ τη δημιουργία του RT εξαγωγής (9 μονοσκελή RT μετρημένα 5/9, CLAUDE.md
      // «Κατάσταση 24/8, ενημ. 30/8»). Πριν το N1 (worker/src/rt-rules.mjs) ο
      // Worker δεν μπορούσε να προσθέσει σκέλος σε υπάρχον RT και εδώ μόνο
      // φωνάζαμε· τώρα το POST /costs/rt είναι idempotent και προσαρτά (attach)
      // ό,τι λείπει.
      const wantIds = [pgX].concat(pgI != null ? [pgI] : []);
      const haveIds = (rt.ct_rt_legs || []).map(l => l.order_id);
      const missingIds = wantIds.filter(id => !haveIds.includes(id));
      if (missingIds.length) {
        const legsBody = missingIds.map(id => ({ direction: id === pgX ? 'EXPORT' : 'IMPORT', order_id: id }));
        const attachRes = await plFetch('/costs/rt', { method: 'POST', body: {
          scope: 'INTL', trip_type: partnerTrip ? 'PARTNER' : 'OWNED',
          // Το validateRtBody απαιτεί truck_id/partner_id ακόμα κι όταν η ενέργεια
          // θα καταλήξει attach (δεν χρησιμοποιούνται εκεί) — πέφτουμε πίσω στα
          // ήδη γνωστά του rt όταν τα _rtFleetIds δεν βρήκαν αντιστοίχιση.
          truck_id: partnerTrip ? null : (ids.truck_id || rt.truck_id),
          partner_id: partnerTrip ? (ids.partner_id || rt.partner_id) : null,
          date_start: rt.date_start, date_end: dEnd || rt.date_end, legs: legsBody
        } });
        if (attachRes && attachRes.attached && attachRes.record) rtRef = attachRes.record;
        else _rtWarn('P&L: το ' + rt.code + ' δεν πήρε το σκέλος αυτόματα — δες το στο TRIP PnL');
      }
      if ((partnerTrip ? 'PARTNER' : 'OWNED') !== rt.trip_type) _rtWarn('P&L: αλλαγή ιδιόκτητο↔συνεργάτης στο ' + rt.code + ' δεν συγχρονίζεται αυτόματα — δες το στο TRIP PnL');
    }
    // Κλείσιμο = γεγονός δεδομένων (κλειδωμένο 10/8): solo export → Delivered
    // του export· ζεύγος → Delivered του import (στο VS αυτό είναι η άφιξη
    // Βέροια — εκεί παραδίδεται το VS import).
    let shouldClose = false;
    if (pgI == null) shouldClose = status === 'Delivered';
    else { const imp = await atGetOne(TABLES.ORDERS, importRec); shouldClose = !!imp && imp.fields['Status'] === 'Delivered'; }
    if (shouldClose && rtRef && !_rtClosed(rtRef)) {
      await plFetch('/costs/rt/' + rtRef.id, { method: 'PATCH', body: { status: 'closed' } });
    }
  });
}

// ── Διαγραφή παραγγελίας: ίδιοι κανόνες με ακύρωση ──
async function rtOnOrderDeleted(orderId) {
  return _rtSafe('καθάρισμα round trip διαγραμμένης', async () => {
    const pg = await _rtPg(orderId); // soft-deleted στάσεις = εκτός gate: το πιάνει ο μετρητής
    if (pg == null) return;
    const rt = await _rtFind([pg]);
    if (!rt) return;
    if (_rtClosed(rt)) return; // ιστορικό — μένει ως έχει
    const lines = await plFetch('/costs/lines?rt_id=' + rt.id);
    if ((lines.records || []).length) _rtWarn('P&L: το ' + rt.code + ' έχει κόστη αλλά η παραγγελία διαγράφηκε — θέλει χέρι στο TRIP PnL');
    else await plFetch('/costs/rt/' + rt.id, { method: 'PATCH', body: { status: 'cancelled' } });
  });
}

// ── Ξεταίριασμα εισαγωγής (Weekly International _wiRemoveImport) ──
// Το ταίριασμα/ξεταίριασμα γράφει 'Matched Import ID' μέσω syncOrderDownstream
// με skipPL:true (δεν είναι από μόνο του γεγονός P&L) — άρα ο αυτόματος feed
// ΠΟΤΕ δεν έβλεπε το ξεταίριασμα, και το σκέλος εισαγωγής έμενε κολλημένο σε
// RT που δεν το αφορά πια. Καλείται απευθείας από modules/weekly_intl.js.
// Αφαιρεί ΜΟΝΟ το σκέλος εισαγωγής — το RT της εξαγωγής μένει (ξαναγίνεται
// μονοσκελές, όπως πριν το ταίριασμα).
async function rtOnImportUnmatched(exportOrderId, importOrderId) {
  return _rtSafe('αφαίρεση σκέλους εισαγωγής', async () => {
    const pgI = await _rtPg(importOrderId);
    if (pgI == null) return; // χωρίς στάση φόρτωσης — τίποτα καταγεγραμμένο στο /costs
    const pgX = await _rtPg(exportOrderId);
    const rt = await _rtFind([pgX, pgI].filter(v => v != null));
    if (!rt) return; // δεν δημιουργήθηκε ποτέ RT — τίποτα να καθαριστεί
    await plFetch('/costs/rt/' + rt.id + '/legs?order_id=' + pgI, { method: 'DELETE' });
  });
}

window.rtOnOrderSaved = rtOnOrderSaved;
window.rtOnOrderDeleted = rtOnOrderDeleted;
window.rtOnImportUnmatched = rtOnImportUnmatched;
