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

// ── Wave 1 (owner 6/9): a GROUP is one round trip, not one per pair ──
// Pure — no I/O, so it can be unit-tested with plain node (same posture as
// worker/src/rt-rules.mjs). Given one order of a round trip plus the other
// orders that could be its leg-mates (already fetched by the caller), returns
// EVERY leg that belongs together: all Group ID siblings, each export's
// matched import (and the reverse — an import's matching export), and any
// rotation leg hanging off any of those. De-duplicated by order id. Nat loads
// are intentionally absent — VS legs are not modelled as round-trip legs yet.
// Implementation note: this is a closure over three symmetric relations
// (Group ID sibling, Matched Import ID pair, Rotation ID parent↔child) —
// walked as a graph (BFS) rather than "start's group, then start's pair,
// then start's rotation" in sequence, because the set must come out
// IDENTICAL no matter which member triggers the feed first (owner: "whichever
// member triggers the feed first"). A one-pass version keyed off `start`
// alone missed a group's rotation leg when triggered from the group's
// MATCHED IMPORT (the import has no Group ID of its own to expand from) —
// caught by the unit test that triggers from each side of the same trip.
// Wave 3 (owner 6/9, FEATURES.ORDER_SPLIT): a split PARENT never joins a round
// trip — its Truck/Partner are cleared on split (docs/design/2026-09-06-order-
// split.md: «Roundtrip: ποτέ» for the parent, status becomes derived from its
// legs), so it already fails rtOnOrderSaved's `assigned` check on its own and
// never reaches this function in the normal flow. This is defence in depth for
// any caller that hands us a parent id directly (e.g. a future Ρότα «add» on a
// split row) — pure, no I/O, so rtLegsForOrder stays unit-testable with plain
// node. A LEG (its OWN Parent Order is set) is unaffected — it is an ordinary
// order for the feed, exactly like before this order-splitting feature existed.
function _rtIsSplitParent(o, byId) {
  if (!o || !o.fields || o.fields['Parent Order']) return false; // legs are ordinary
  const pid = o.id;
  return Object.values(byId).some(cand => {
    const p = (cand.fields || {})['Parent Order'];
    return (Array.isArray(p) ? p[0] : p) === pid;
  });
}
function rtLegsForOrder(order, allOrders) {
  const byId = {};
  (allOrders || []).forEach(o => { if (o && o.id) byId[o.id] = o; });
  const start = (order && order.id && byId[order.id]) ? byId[order.id] : order;
  if (!start || !start.id) return [];
  byId[start.id] = start;
  if (_rtIsSplitParent(start, byId)) return [];

  const dirOf = o => ((o.fields || {})['Direction'] === 'Import') ? 'IMPORT' : 'EXPORT';
  const seen = new Set([start.id]);
  const queue = [start.id];
  const visit = id => { if (id && byId[id] && !seen.has(id) && !_rtIsSplitParent(byId[id], byId)) { seen.add(id); queue.push(id); } };

  while (queue.length) {
    const o = byId[queue.pop()];
    const f = o.fields || {};
    const gid = f['Group ID'];
    if (gid) Object.values(byId).forEach(cand => { if ((cand.fields || {})['Group ID'] === gid) visit(cand.id); });
    visit(f['Matched Import ID']); // export → its import
    Object.values(byId).forEach(cand => { if ((cand.fields || {})['Matched Import ID'] === o.id) visit(cand.id); }); // import ← its export
    visit(f['Rotation ID']); // rotation leg → its parent
    Object.values(byId).forEach(cand => { if ((cand.fields || {})['Rotation ID'] === o.id) visit(cand.id); }); // parent ← its rotation legs
  }

  return [...seen].map(id => ({ orderId: id, direction: dirOf(byId[id]) }));
}
if (typeof module !== 'undefined' && module.exports) module.exports = { rtLegsForOrder };

// Fetch the small set of orders that could be leg-mates of `rec`: Group ID
// siblings, each one's matched import/export counterpart, and rotation legs
// off any of those — targeted filters, not a full ORDERS scan (CLAUDE.md
// «κάθε αντίγραφο αποκλίνει» applies to queries too: a full-table read here
// would be slow AND would still miss nothing rtLegsForOrder needs).
async function _rtGatherOrders(rec) {
  const byId = { [rec.id]: rec };
  const filterIn = async (formula) => {
    try { return await atGetAll(TABLES.ORDERS, { filterByFormula: formula }, true) || []; }
    catch (e) { console.warn('[rt-feed] gather:', e && e.message); return []; }
  };
  // Fixed point, not a single pass: a rotation leg can belong to ITS OWN
  // Group ID too, and a freshly-discovered group sibling can have its own
  // matched import — one pass would miss those. Bounded by MAX_LEGS
  // (worker/src/rt-rules.mjs) since a round trip can have at most 20 legs, so
  // this converges in at most a handful of rounds for the group sizes this
  // app actually has (owner: 2-4 members).
  let grew = true;
  while (grew && Object.keys(byId).length <= 20) {
    grew = false;
    for (const o of Object.values(byId)) {
      const gid = o.fields['Group ID'];
      if (gid) { for (const cand of await filterIn(`{Group ID}='${gid}'`)) { if (!byId[cand.id]) { byId[cand.id] = cand; grew = true; } } }
      const mid = o.fields['Matched Import ID'];
      if (mid && !byId[mid]) { const imp = await atGetOne(TABLES.ORDERS, mid); if (imp) { byId[imp.id] = imp; grew = true; } }
    }
    for (const id of Object.keys(byId)) {
      for (const cand of await filterIn(`{Matched Import ID}='${id}'`)) { if (!byId[cand.id]) { byId[cand.id] = cand; grew = true; } }
      for (const cand of await filterIn(`{Rotation ID}='${id}'`)) { if (!byId[cand.id]) { byId[cand.id] = cand; grew = true; } }
    }
  }
  // Wave 3: strip any gathered order that turned out to be a split PARENT —
  // rtLegsForOrder's own guard already excludes it from the final leg set, but
  // dropping it here too means a stray candidate never reaches _rtPg for a
  // wasted /pallets/gate lookup.
  return Object.values(byId).filter(o => !_rtIsSplitParent(o, byId));
}

// Exposed for callers that need an order's round trip without re-implementing
// the pg lookup (weekly_intl.js Ρότα unlink, C2 — 6/9).
async function rtFindForOrder(orderId) {
  const pg = await _rtPg(orderId);
  if (pg == null) return { pg: null, rt: null };
  return { pg, rt: await _rtFind([pg]) };
}

// ── Κύρια είσοδος: κάθε αποθήκευση διεθνούς παραγγελίας ──
async function rtOnOrderSaved(orderId) {
  return _rtSafe('συγχρονισμός round trip', async () => {
    let rec = await atGetOne(TABLES.ORDERS, orderId);
    if (!rec) return;
    let f = rec.fields;
    // Import με ζεύγος: η άγκυρα είναι το export του — δουλεύουμε σε εκείνο.
    // (Ρότα/ομάδα σκέλη μπαίνουν παρακάτω μέσω rtLegsForOrder, όχι εδώ —
    // η άγκυρα καθορίζει status/assigned/ημερομηνίες, όπως πριν.)
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

    // A2 (owner 6/9): a group/rota is ONE round trip, not one per export+import
    // pair. Gather the order's leg-mates (group siblings, matched pairs,
    // rotation legs) and translate the whole set to pg ids — pgX/pgI stay as
    // the two-id shape the rest of this function already knows for the
    // create/close paths below; `legPgs`/`pgDir` carry the FULL set for the
    // POST /costs/rt body so a 3+ leg group attaches in one go.
    const gathered = await _rtGatherOrders(rec);
    const legsInfo = rtLegsForOrder(rec, gathered);
    const pgDir = {}; const legPgs = [];
    for (const leg of legsInfo) {
      const pg = await _rtPg(leg.orderId);
      if (pg == null) continue; // χωρίς στάση — το πιάνει ο μετρητής συμφωνίας
      pgDir[pg] = leg.direction;
      legPgs.push(pg);
    }
    if (!legPgs.includes(pgX)) { pgDir[pgX] = 'EXPORT'; legPgs.push(pgX); }
    const pgI = importRec ? await _rtPg(importRec) : null;
    if (pgI != null && !legPgs.includes(pgI)) { pgDir[pgI] = 'IMPORT'; legPgs.push(pgI); }
    if (legPgs.length > 20) { // MAX_LEGS (worker/src/rt-rules.mjs) — never silently truncate
      _rtWarn('P&L: η ομάδα έχει πάνω από 20 σκέλη — πάνω από το όριο του Worker, δες το χειροκίνητα στο TRIP PnL');
      return;
    }
    const rt = await _rtFind(legPgs);
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
        legs: legPgs.map(pg => ({ direction: pgDir[pg], order_id: pg }))
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
      const haveIds = (rt.ct_rt_legs || []).map(l => l.order_id);
      const missingIds = legPgs.filter(id => !haveIds.includes(id));
      if (missingIds.length) {
        // Send the WHOLE leg set, not only the missing ones: the Worker decides
        // «attach» by looking for a posted leg that already belongs to an RT and
        // then inserts only what is missing (rt-rules.mjs planRtUpsert). Posting
        // just the new leg always created a second, separate RT (proven 6/9).
        const legsBody = legPgs.map(id => ({ direction: pgDir[id], order_id: id }));
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
    // Returned for callers that need to know whether a round trip exists now
    // (weekly_intl.js C1, Ρότα add — 6/9): undefined on every early return
    // above (not exec, cancelled, closed, gone) means "no RT to attach to".
    return rtRef;
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
window.rtLegsForOrder = rtLegsForOrder;
window.rtFindForOrder = rtFindForOrder;
