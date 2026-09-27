// Scoring: golden set × scanner results → per-check verdicts + aggregates.
// Pure (no I/O). Formats are documented in tools/scan-eval/README.md.
import {
  normDate, normNumber, normText, normRef, normCountry, normPalletType,
  normDirection, normId, goodsMatch, normConfidence,
} from './normalize.mjs';

// Critical = the fields that make an order wrong on the road or in billing if
// the dispatcher trusts them. Owner's list (scan programme, round 1).
export const CRITICAL = ['client_id', 'reference', 'pallets', 'temperature_c', 'stop_dates', 'stops'];

const SCALAR = {
  client_id:       (t, g) => (t.any_of || [t.v]).map(normId).includes(normId(g)),
  reference:       (t, g) => normRef(t.v) === normRef(g),
  direction:       (t, g) => normDirection(t.v) === normDirection(g),
  goods:           (t, g) => goodsMatch(t.v, g) === true,
  gross_weight_kg: (t, g) => numClose(t.v, g, 0.005),
  pallets:         (t, g) => numClose(t.v, g, 0),
  pallet_type:     (t, g) => normPalletType(t.v) === normPalletType(g),
  temperature_c:   (t, g) => numClose(t.v, g, 0),
  price:           (t, g) => numClose(t.v, g, 0.005),
};
export const SCALAR_FIELDS = Object.keys(SCALAR);

// Which scanner confidence key speaks for which check (current scanner asks
// for field_confidence with these names; later engines may send exact names).
const CONF_KEY = {
  client_id: ['client_id', 'client_name'], reference: ['reference'], pallets: ['pallets'],
  stop_dates: ['stop_dates', 'dates'], stops: ['stops', 'loading_stops', 'delivery_stops'],
  stop_pallets: ['stop_pallets', 'pallets'],
};

function numClose(truth, got, relTol) {
  const a = normNumber(truth), b = normNumber(got);
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= Math.abs(a) * relTol;
}

function field(t) {
  // Golden values are {v, src, contested?, any_of?}; a bare value is accepted
  // for hand-written fixtures.
  if (t == null) return null;
  if (typeof t === 'object' && !Array.isArray(t) && ('v' in t || 'any_of' in t)) return t;
  return { v: t };
}

function hasTruth(t) {
  if (!t) return false;
  if (t.any_of && t.any_of.length) return true;
  return t.v != null && t.v !== '';
}

function confFor(pred, check) {
  const c = pred && pred.confidence;
  if (!c) return null;
  const keys = CONF_KEY[check] || [check];
  const vals = keys.map(k => normConfidence(c[k])).filter(v => v != null);
  return vals.length ? Math.min(...vals) : null;
}

// Pick the predicted order for a golden order: same reference first, then
// same position. One file can carry several orders; the current scanner
// returns one, so the 2nd golden order then has no prediction (all wrong).
function alignOrders(goldenOrders, predOrders) {
  const used = new Set();
  return goldenOrders.map((g, i) => {
    const ref = normRef(field(g.reference)?.v);
    let j = ref ? predOrders.findIndex((p, k) => !used.has(k) && normRef(p.reference) === ref) : -1;
    if (j < 0 && i < predOrders.length && !used.has(i)) j = i;
    if (j >= 0) used.add(j);
    return j >= 0 ? predOrders[j] : null;
  });
}

function stopChecks(gOrder, pred, push) {
  const gStops = gOrder.stops || [];
  const pStops = (pred && pred.stops) || [];
  for (const type of ['loading', 'delivery']) {
    const gs = gStops.filter(s => s.type === type);
    const ps = pStops.filter(s => s.type === type);
    if (!gs.length) continue;
    const countOk = gs.length === ps.length;
    const contestedCount = gs.some(s => s.contested_count);
    push({ check: 'stops', key: `${type}.count`, ok: countOk, expected: gs.length, got: ps.length, contested: contestedCount });
    gs.forEach((s, i) => {
      const p = ps[i] || null;
      const date = field(s.date);
      if (hasTruth(date)) push({ check: 'stop_dates', key: `${type}[${i}].date`, ok: !!p && normDate(date.v) === normDate(p.date),
        expected: normDate(date.v), got: p ? normDate(p.date) ?? p.date ?? null : null, contested: !!date.contested });
      const ids = s.location_ids || [];
      if (ids.length) push({ check: 'stops', key: `${type}[${i}].location`, ok: !!p && ids.includes(normId(p.location_id)),
        expected: ids, got: p ? normId(p.location_id) : null, contested: !!s.contested_location });
      const pal = field(s.pallets);
      if (hasTruth(pal)) push({ check: 'stop_pallets', key: `${type}[${i}].pallets`, ok: !!p && numClose(pal.v, p.pallets, 0),
        expected: pal.v, got: p ? p.pallets ?? null : null, contested: !!pal.contested });
      const country = field(s.country);
      if (hasTruth(country)) push({ check: 'stop_country', key: `${type}[${i}].country`, ok: !!p && normCountry(country.v) === normCountry(p.country),
        expected: normCountry(country.v), got: p ? normCountry(p.country) : null, contested: !!country.contested });
    });
  }
}

/**
 * @returns {{checks: Array, docs: Array}} one row per scored check, one per doc
 */
export function scoreRun(golden, results) {
  const byId = new Map((results.docs || []).map(d => [d.doc_id, d]));
  const checks = [];
  const docs = [];
  for (const gDoc of golden.docs || []) {
    const r = byId.get(gDoc.doc_id) || { status: 'missing', orders: [] };
    const ok = r.status === 'ok';
    const preds = ok ? (r.orders || []) : [];
    const aligned = alignOrders(gDoc.orders || [], preds);
    const docChecks = [];
    (gDoc.orders || []).forEach((gOrder, oi) => {
      const pred = aligned[oi];
      const push = c => {
        const row = { doc_id: gDoc.doc_id, order: oi, status: r.status, ...c };
        if (!pred) row.ok = false;
        row.critical = CRITICAL.includes(row.check);
        row.confidence = confFor(pred, row.check);
        docChecks.push(row);
      };
      for (const f of SCALAR_FIELDS) {
        const t = field(gOrder[f]);
        if (!hasTruth(t)) continue;       // document does not state it → not scored
        const got = pred ? pred[f] : null;
        push({ check: f, key: f, ok: !!pred && got != null && SCALAR[f](t, got), expected: t.any_of || t.v, got: got ?? null, contested: !!t.contested });
      }
      stopChecks(gOrder, pred, push);
    });
    checks.push(...docChecks);
    const crit = docChecks.filter(c => c.critical);
    const critNC = crit.filter(c => !c.contested);
    docs.push({
      doc_id: gDoc.doc_id, status: r.status,
      checks: docChecks.length, correct: docChecks.filter(c => c.ok).length,
      critical_all_ok: crit.length > 0 && crit.every(c => c.ok),
      critical_all_ok_uncontested: critNC.length > 0 && critNC.every(c => c.ok),
    });
  }
  return { checks, docs };
}

/**
 * A results file that answers exactly the golden truth. Scoring it must give
 * 100%; anything less means a malformed golden entry (bad date, typo in an
 * id list) — i.e. the golden set, not the scanner, would be lying.
 */
export function goldenToResults(golden) {
  const val = t => { const f = field(t); return f ? (f.any_of ? f.any_of[0] : f.v) : null; };
  return {
    schema: 'scan-results/v1', engine: 'oracle',
    docs: golden.docs.map(d => ({
      doc_id: d.doc_id, status: 'ok',
      orders: (d.orders || []).map(o => ({
        ...Object.fromEntries(SCALAR_FIELDS.map(f => [f, val(o[f])])),
        stops: (o.stops || []).map(s => ({ type: s.type, location_id: (s.location_ids || [])[0] || null,
          date: val(s.date), pallets: val(s.pallets), country: val(s.country) })),
      })),
    })),
  };
}

export function aggregate({ checks, docs }) {
  const byCheck = {};
  for (const c of checks) {
    const a = byCheck[c.check] ||= { scored: 0, correct: 0, scored_uncontested: 0, correct_uncontested: 0 };
    a.scored++; if (c.ok) a.correct++;
    if (!c.contested) { a.scored_uncontested++; if (c.ok) a.correct_uncontested++; }
  }
  for (const a of Object.values(byCheck)) {
    a.accuracy = a.scored ? a.correct / a.scored : null;
    a.accuracy_uncontested = a.scored_uncontested ? a.correct_uncontested / a.scored_uncontested : null;
  }
  // Calibration: does "0.9 sure" really mean ~90% right? Buckets on the
  // checks that carried a confidence.
  const edges = [0, 0.5, 0.7, 0.9, 1.0001];
  const calibration = edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1];
    const inB = checks.filter(c => c.confidence != null && c.confidence >= lo && c.confidence < hi);
    return { bucket: `${lo.toFixed(1)}–${Math.min(hi, 1).toFixed(1)}`, n: inB.length,
      accuracy: inB.length ? inB.filter(c => c.ok).length / inB.length : null };
  });
  const statusCounts = {};
  for (const d of docs) statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
  return {
    documents: docs.length,
    status: statusCounts,
    critical_all_ok: docs.filter(d => d.critical_all_ok).length,
    critical_all_ok_pct: docs.length ? docs.filter(d => d.critical_all_ok).length / docs.length : null,
    critical_all_ok_uncontested: docs.filter(d => d.critical_all_ok_uncontested).length,
    by_check: byCheck,
    calibration,
    checks_with_confidence: checks.filter(c => c.confidence != null).length,
  };
}
