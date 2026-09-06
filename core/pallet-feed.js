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
  const res = await fetch(PROXY_URL + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: 'Bearer ' + jwt } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

// Μη-μπλοκάρον περίβλημα: ΚΑΘΕ feeder περνάει από εδώ.
async function _plSafe(label, fn) {
  try { return await fn(); }
  catch (e) {
    console.warn('[pallet-feed]', label, e && e.message);
    if (typeof showErrorToast === 'function') {
      showErrorToast('Παλέτες: απέτυχε ' + label + ' — καταχώρησε χειροκίνητα από το Ισοζύγιο', 'warn', 8000);
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
window.plOnIntlPartnerAssigned = plOnIntlPartnerAssigned;
window.plOnExchangeOff = plOnExchangeOff;
window.plOnOrderDeleted = plOnOrderDeleted;
