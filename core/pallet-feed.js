// ═══════════════════════════════════════════════════════════
// CORE — PALLET FEEDERS (Φ2, spec docs/PALLETS_F2_FEEDERS.md)
// Όλη η λογική αυτόματης τροφοδότησης του ημερολογίου παλετών σε ΕΝΑ σημείο.
// Κανόνες: idempotent (έλεγχος πριν τη δημιουργία), μη-μπλοκάρον (αποτυχία
// feeder = toast, ΠΟΤΕ δεν μπλοκάρει το order), αγγίζει ΜΟΝΟ pending.
// Ο Worker κάνει τη μετάφραση legacy recXXX → pg ids (στέλνουμε *_rec).
// ═══════════════════════════════════════════════════════════
'use strict';

async function plFetch(path, opts = {}) {
  const jwt = localStorage.getItem('tms_jwt');
  const _rq = (typeof tmsNewAction === 'function' ? tmsNewAction() : null);   // Level A: one id per action
  const res = await fetch(PROXY_URL + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: 'Bearer ' + jwt } : {}), ...(typeof tmsReqHeaders === 'function' ? tmsReqHeaders(_rq ? _rq + '-1' : null) : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (typeof tmsNoteResponse === 'function') tmsNoteResponse(res);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || ('HTTP ' + res.status)); e._req = _rq; throw e; }
  return data;
}

// One duration for every «enter it in the Ισοζύγιο by hand» line, failure or
// designed case alike (critic-5 S5-09: the same instruction had two weights,
// 8 s and 10 s). 10 s: the intake line is the COMMON outcome of an own-truck
// lot and is read on a phone at 06:00 (critic-1 R2-1).
const _PL_TOAST_MS = 10000;

// Μη-μπλοκάρον περίβλημα: ΚΑΘΕ feeder περνάει από εδώ.
async function _plSafe(label, fn) {
  try { return await fn(); }
  catch (e) {
    console.warn('[pallet-feed]', label, e && e.message);
    if (typeof showErrorToast === 'function') {
      showErrorToast('Παλέτες: απέτυχε ' + label + ' — καταχώρησε χειροκίνητα από το Ισοζύγιο', 'warn', _PL_TOAST_MS);
    }
    return null;
  }
}

function _plToday() { return new Date().toISOString().slice(0, 10); }
function _plDate(dt) { return dt ? String(dt).slice(0, 10) : _plToday(); }

async function _plLoadOrder(orderId, source) {
  const tableId = source === 'intl' ? TABLES.ORDERS : TABLES.NAT_ORDERS;
  const parentField = source === 'intl' ? F.STOP_PARENT_ORDER : F.STOP_PARENT_NAT;
  const rec = await atGetOne(tableId, orderId);
  const stops = await stopsLoad(orderId, parentField);
  return { rec, stops };
}

function _plClientRec(fields) {
  const c = fields['Client'];
  return Array.isArray(c) ? c[0] : (c || null);
}

// ── Feeder §3.1: αποθήκευση order → pending LOADING ανά στάση φόρτωσης ──
async function plOnOrderSaved(orderId, source) {
  return _plSafe('δημιουργία εκκρεμών φόρτωσης', async () => {
    const { rec, stops } = await _plLoadOrder(orderId, source);
    if (!rec) return;
    // Wave 3 (owner 6/9, FEATURES.ORDER_SPLIT): a leg is not a second delivery
    // to the client — the pallet ledger tracks exchange against the PARENT's
    // client only, or a hand-over would double the balance for one shipment.
    // No-op while the flag is off (nothing ever has Parent Order set).
    if (source === 'intl' && typeof FEATURES !== 'undefined' && FEATURES.ORDER_SPLIT && getLinkedId(rec.fields['Parent Order'])) return;
    if (!rec.fields['Pallet Exchange']) return plOnExchangeOff(orderId, source);
    const clientRec = _plClientRec(rec.fields);
    const claimed = new Set();
    for (const s of stops) {
      if (s.fields[F.STOP_TYPE] !== 'Loading') continue;
      const existing = await plFetch('/pallets/movements?order_stop_rec=' + encodeURIComponent(s.id));
      const cur = (existing.records || [])[0];
      const pallets = parseInt(s.fields[F.STOP_PALLETS], 10) || 0;
      if (!cur) {
        const created = await plFetch('/pallets/movements', { method: 'POST', body: {
          movement_date: _plDate(s.fields[F.STOP_DATETIME]),
          counterparty_type: 'CLIENT',
          client_rec: clientRec,
          location_rec: (s.fields[F.STOP_LOCATION] || [])[0] || null,
          event_type: 'LOADING',
          taken: pallets, given: 0,
          order_stop_rec: s.id, order_rec: orderId
        }});
        if (created && created.record) claimed.add(created.record.id);
      } else {
        claimed.add(cur.id);
        if (cur.status === 'pending' && cur.taken !== pallets) {
          await plFetch('/pallets/movements/' + cur.id, { method: 'PATCH', body: { taken: pallets } });
        }
        // confirmed: δεν αγγίζεται ποτέ από feeder
      }
    }
    // Στάση που διαγράφηκε από την παραγγελία αφήνει ορφανή εκκρεμή που δείχνει
    // σε ανύπαρκτη στάση. Τη σβήνουμε εδώ — ΜΟΝΟ pending· οι confirmed είναι ιστορικό.
    const all = await plFetch('/pallets/movements?order_rec=' + encodeURIComponent(orderId));
    for (const m of (all.records || [])) {
      if (m.status === 'pending' && m.event_type === 'LOADING' && !claimed.has(m.id)) {
        await plFetch('/pallets/movements/' + m.id, { method: 'DELETE' });
      }
    }
  });
}

// ── Feeder §3.2: Status → Delivered → confirmed DELIVERY net 0 ανά παράδοση ──
async function plOnDelivered(orderId) {
  return _plSafe('εγγραφές παράδοσης', async () => {
    const { rec, stops } = await _plLoadOrder(orderId, 'intl');
    if (!rec) return;
    // Wave 3: see plOnOrderSaved — a leg's delivery isn't a second client delivery.
    if (typeof FEATURES !== 'undefined' && FEATURES.ORDER_SPLIT && getLinkedId(rec.fields['Parent Order'])) return;
    if (!rec.fields['Pallet Exchange']) return;
    // A stock LOT's «Delivered» is the warehouse intake, not a client
    // delivery: no client DELIVERY (a confirmed 33/33 «client exchange at
    // Αποθήκη Χ» would be false, impact map C-03 / PL-02). Ε5: the client
    // exchanges ONCE, at the lot's loading (plOnOrderSaved, unchanged).
    // Its own label (critic-1 R2-8): «απέτυχε εγγραφές παράδοσης» read as a
    // failed CLIENT delivery, for a warehouse intake.
    if (OrdersStock.isLot(rec.fields)) return _plSafe('κίνηση παλετών αποθήκης', () => _plLotIntake(rec, stops, orderId));
    const clientRec = _plClientRec(rec.fields);
    for (const s of stops) {
      if (s.fields[F.STOP_TYPE] !== 'Unloading') continue;
      const existing = await plFetch('/pallets/movements?order_stop_rec=' + encodeURIComponent(s.id));
      if ((existing.records || []).length) continue; // ήδη γραμμένη
      const pallets = parseInt(s.fields[F.STOP_PALLETS], 10) || 0;
      if (!pallets) continue;
      await plFetch('/pallets/movements', { method: 'POST', body: {
        movement_date: _plToday(),
        counterparty_type: 'CLIENT',
        client_rec: clientRec,
        location_rec: (s.fields[F.STOP_LOCATION] || [])[0] || null,
        event_type: 'DELIVERY',
        taken: pallets, given: pallets,
        order_stop_rec: s.id, order_rec: orderId,
        confirm: true
      }});
    }
  });
}

// OWNER-Q7 answered 4/10 (pallet movement at warehouse intake; pieces never
// exchange) — coordinator queue #6, owner: «Να γράφεται και η αποθήκη».
// The intake is locked pallet case #4 (docs/PALLETS_ARCHITECTURE §3): we hand
// loaded pallets to a PARTNER, so ONE pending PARTNER_PICKUP, given = the
// lot's pallets, taken = 0 until the sheet says what the warehouse left. Once
// per lot: found by its warehouse stop, never rewritten (a confirmed one is
// history). The ledger only knows clients and partners and a location is
// linked to no partner, so a lot our own truck carried has no counterparty to
// write — it is said, not invented. Pieces write nothing (Ε5: their receivers
// never exchange); pallets that leave on pieces are the accountant's
// ADJUSTMENT (case #10) — the owner asked for the intake only.
//
// In-flight guard (critic-3 Σ2-07): the write is GET-then-POST and
// pl_mov_stop is a plain index, so two calls that overlap in this page (a
// double click on «Παραλαβή αποθήκης») both read «none» and wrote TWO
// pending «given 33»; confirmed from
// the sheet, the partner would «owe» 66. One intake per lot at a time here;
// a second call returns — the first is writing the same row. Two USERS at the
// same second can still both write: only a unique index on pl_movements
// (order_stop_id, event_type) would stop that, and there is none today.
const _plLotInFlight = new Map();   // orderId → the running intake
// orderId → id of the movement THIS page's intake wrote. The undo removes only
// that row: a pending PARTNER_PICKUP the accountant typed on the same stop
// before the click (the intake then wrote nothing) is hers, not the intake's.
// The undo bar lives in this page only, so the map always outlives it.
const _plLotWrote = new Map();

async function _plLotIntake(rec, stops, orderId) {
  if (_plLotInFlight.has(orderId)) return;
  const run = _plLotIntakeOnce(rec, stops, orderId);
  _plLotInFlight.set(orderId, run);
  try { return await run; } finally { _plLotInFlight.delete(orderId); }
}

// The lot's warehouse stop: one rule for the intake and its undo.
function _plLotStop(stops) { return stops.find(x => x.fields[F.STOP_TYPE] === 'Unloading'); }

// Every lot-intake line names the lot and its pallets, with one prefix
// (critic-1 R2-1): three lots received in one morning were identical lines,
// and the person who must act was told nothing he could act on.
const _PL_BY_HAND = ' — καταχώρησέ τις στο Ισοζύγιο';
function _plLotSay(f, s, text) {
  const no = f['Order No'] ? ' #' + f['Order No'] : '';
  const n = parseInt(s ? s.fields[F.STOP_PALLETS] : f['Total Pallets'], 10) || 0;
  if (typeof showErrorToast === 'function') showErrorToast('Παλέτες αποθήκης' + no + (n ? ' (' + n + 'p)' : '') + ': ' + text, 'warn', _PL_TOAST_MS);
}

async function _plLotIntakeOnce(rec, stops, orderId) {
  const f = rec.fields;
  const partnerRec = Array.isArray(f['Partner']) ? f['Partner'][0] : null;
  const s = _plLotStop(stops);
  // These two returns were silent (R2-8): nothing written, nothing said.
  if (!s) return _plLotSay(f, null, 'χωρίς σημείο αποθήκης' + _PL_BY_HAND);
  const pallets = parseInt(s.fields[F.STOP_PALLETS], 10) || 0;
  if (!pallets) return _plLotSay(f, s, '0 παλέτες στο σημείο αποθήκης' + _PL_BY_HAND);
  if (!partnerRec || !f['Is Partner Trip']) return _plLotSay(f, s, 'χωρίς συνεργάτη' + _PL_BY_HAND);
  const byStop = '/pallets/movements?order_stop_rec=' + encodeURIComponent(s.id);
  const existing = await plFetch(byStop);
  if ((existing.records || []).length) return;
  try {
    const made = await plFetch('/pallets/movements', { method: 'POST', body: {
      movement_date: _plToday(),
      counterparty_type: 'PARTNER',
      partner_rec: partnerRec,
      location_rec: (s.fields[F.STOP_LOCATION] || [])[0] || null,
      event_type: 'PARTNER_PICKUP',
      taken: 0, given: pallets,
      order_stop_rec: s.id, order_rec: orderId
    }});
    if (made && made.record) _plLotWrote.set(orderId, made.record.id);
  } catch (e) {
    // A POST lost on the way back (timeout, dropped line) may have written
    // the row. «Failed — enter it by hand» would then make the accountant
    // write a second one: ask again by its stop before saying it (Σ2-07).
    const again = await plFetch(byStop).catch(() => null);
    const landed = again && (again.records || []).find(m => m.event_type === 'PARTNER_PICKUP');
    if (landed) { _plLotWrote.set(orderId, landed.id); return; }   // none existed before the POST
    if (again && (again.records || []).length) return;
    throw e;
  }
}

// Undo of «Παραλαβή αποθήκης» in the Ημερήσιο (critic-1 R2-4): the order went
// back, the pending intake movement stayed — «given 33» in the accountant's
// queue for goods that never arrived. It goes with the order's undo: only the
// movement THIS page's intake wrote (_plLotWrote), and only while pending. A
// confirmed one is history the accountant signed: it is said, never deleted —
// the reversal is hers, in the Ισοζύγιο.
async function plOnLotIntakeUndone(orderId) {
  // Undo pressed while the intake is still writing: its row would land
  // after this read and stay behind.
  const busy = _plLotInFlight.get(orderId);
  if (busy) await busy.catch(() => {});
  const mine = _plLotWrote.get(orderId);
  if (mine == null) return;   // this page's intake wrote nothing — nothing to take back
  let rec = null, s = null;
  try {
    const lo = await _plLoadOrder(orderId, 'intl');
    rec = lo.rec; s = rec && _plLotStop(lo.stops);
    if (!s) return;
    const got = await plFetch('/pallets/movements?order_stop_rec=' + encodeURIComponent(s.id));
    const m = (got.records || []).find(r => r.id === mine);
    if (!m) { _plLotWrote.delete(orderId); return; }   // already gone
    if (m.status === 'pending') {
      await plFetch('/pallets/movements/' + m.id, { method: 'DELETE' });
      _plLotWrote.delete(orderId);
    } else if (m.status === 'confirmed') {
      _plLotSay(rec.fields, s, 'η κίνηση παλετών επιβεβαιώθηκε — αντιλογισμός από το Ισοζύγιο');
    }
  } catch (e) {
    // Not _plSafe: its «καταχώρησε χειροκίνητα» would send the accountant to
    // ADD a movement, when the pending one must be REMOVED.
    console.warn('[pallet-feed] αναίρεση κίνησης παλετών αποθήκης', e && e.message);
    if (rec) _plLotSay(rec.fields, s, 'η εκκρεμής κίνηση δεν σβήστηκε — σβήσ\' την από το Ισοζύγιο');
    else if (typeof showErrorToast === 'function') showErrorToast('Παλέτες αποθήκης: η εκκρεμής κίνηση δεν σβήστηκε — σβήσ\' την από το Ισοζύγιο', 'warn', _PL_TOAST_MS);
  }
}

// ── Feeder §3.3: διεθνής ανάθεση σε partner (VS μόνο) ──
async function plOnIntlPartnerAssigned(orderId) {
  return _plSafe('εκκρεμής partner', async () => {
    const rec = await atGetOne(TABLES.ORDERS, orderId);
    if (!rec) return;
    const f = rec.fields;
    // Wave 3: see plOnOrderSaved — a leg's partner hand-over isn't a second
    // client-facing exchange; the parent's own assignment is cleared on split,
    // so it never reaches here with a partner anyway, but a leg can.
    if (typeof FEATURES !== 'undefined' && FEATURES.ORDER_SPLIT && getLinkedId(f['Parent Order'])) return;
    // A lot never carries VS (057 lot_vs), so it is never «eligible» below —
    // and the not-eligible branch would DELETE its pending intake movement
    // (_plLotIntake). A lot's partner pallets are the intake's alone.
    if (OrdersStock.isLot(f)) return;
    const partnerRec = Array.isArray(f['Partner']) ? f['Partner'][0] : null;
    const eligible = f['Pallet Exchange'] && f['Veroia Switch'] && f['Is Partner Trip'] && partnerRec;
    const evType = f['Direction'] === 'Import' ? 'PARTNER_DROPOFF' : 'PARTNER_PICKUP';
    // Υπάρχουσα partner-εγγραφή του order (μας αφορά ΜΟΝΟ pending)
    const existing = await plFetch('/pallets/movements?order_rec=' + encodeURIComponent(orderId));
    const partnerMoves = (existing.records || []).filter(m =>
      m.event_type === 'PARTNER_PICKUP' || m.event_type === 'PARTNER_DROPOFF');
    // Αν η ανταλλαγή οριστικοποιήθηκε (η ράμπα έγραψε το δελτίο), ο feeder δεν
    // ξαναγράφει τίποτα: μια δεύτερη αποθήκευση της παραγγελίας θα δημιουργούσε
    // διπλή κίνηση δίπλα στην οριστική. Οποιαδήποτε αλλαγή από εδώ και πέρα
    // γίνεται χειροκίνητα από το Ισοζύγιο (αντιλογισμός).
    if (partnerMoves.some(m => m.status === 'confirmed')) return;
    const cur = partnerMoves.find(m => m.status === 'pending');
    if (!eligible) {
      if (cur) await plFetch('/pallets/movements/' + cur.id, { method: 'DELETE' });
      return;
    }
    // 'Total Pallets', ΟΧΙ 'Pallets': τα ORDERS δεν έχουν πεδίο 'Pallets' στον
    // χάρτη του Worker (αυτό ανήκει σε RAMP/ledgers). Το facade παραλείπει το
    // άγνωστο όνομα σιωπηλά → parseInt(undefined)||0 → κάθε partner κίνηση
    // γεννιόταν 0/0 (εύρημα audit 25/8).
    const pallets = parseInt(f['Total Pallets'], 10) || 0;
    const qty = { // PICKUP: δίνουμε γεμάτες· DROPOFF: παίρνουμε γεμάτες (spec §2)
      taken: evType === 'PARTNER_DROPOFF' ? pallets : 0,
      given: evType === 'PARTNER_PICKUP' ? pallets : 0
    };
    if (!cur) {
      await plFetch('/pallets/movements', { method: 'POST', body: {
        movement_date: _plToday(),
        counterparty_type: 'PARTNER',
        partner_rec: partnerRec,
        location_rec: 'recJucKOhC1zh4IP3', // Βέροια Cross-Dock (spec §3.3)
        event_type: evType,
        ...qty,
        order_rec: orderId
      }});
    } else {
      await plFetch('/pallets/movements/' + cur.id, { method: 'PATCH', body: { partner_rec: partnerRec, event_type: evType, ...qty } });
    }
  });
}

// ── §3.1: Pallet Exchange OFF → σβήνονται ΜΟΝΟ οι pending του order ──
async function plOnExchangeOff(orderId, source) {
  return _plSafe('καθαρισμός εκκρεμών (PE off)', async () => {
    const existing = await plFetch('/pallets/movements?order_rec=' + encodeURIComponent(orderId));
    for (const m of (existing.records || [])) {
      if (m.status === 'pending') await plFetch('/pallets/movements/' + m.id, { method: 'DELETE' });
    }
  });
}

// ── Cascade delete order → ίδια συμπεριφορά: pending φεύγουν, confirmed μένουν ──
async function plOnOrderDeleted(orderId, source) {
  return plOnExchangeOff(orderId, source);
}

window.plFetch = plFetch;
window.plOnOrderSaved = plOnOrderSaved;
window.plOnDelivered = plOnDelivered;
window.plOnLotIntakeUndone = plOnLotIntakeUndone;
window.plOnIntlPartnerAssigned = plOnIntlPartnerAssigned;
window.plOnExchangeOff = plOnExchangeOff;
window.plOnOrderDeleted = plOnOrderDeleted;
