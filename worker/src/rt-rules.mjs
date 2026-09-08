// Pure validation + upsert planning for /costs/rt. Lives outside index.js so it
// can be tested with node:test without a Worker runtime — same posture as
// ledger-rules.mjs: every rejection names the field, never a silent drop (the
// facade's trap, CLAUDE.md «μηχανισμός-παγίδα 1»).
export const RT_SCOPES = ['INTL', 'NATL'];
export const RT_TRIP_TYPES = ['OWNED', 'PARTNER'];
export const RT_DIRECTIONS = ['EXPORT', 'IMPORT', 'ANODOS', 'KATHODOS'];
// Immutable statuses (ct_round_trips.status check, migration 001): a leg is
// financial history once the RT reaches one of these — removing it would
// rewrite a closed record, not correct a plan. `cancelled` is deliberately
// NOT in this list (owner 8/9 defect: unmatch toast «απέτυχε αφαίρεση
// σκέλους εισαγωγής» on every unmatch, worker/src/index.js DELETE
// /costs/rt/:id/legs) — a cancelled RT is a discarded PLAN (it never carried
// real costs; rtOnOrderSaved in core/rt-feed.js only cancels an RT that has
// zero cost lines), not history, so freeing its leg is a correction, not a
// rewrite. Also lets planRtUpsert (below) reclaim a stale cancelled-RT leg
// row for a freshly created RT instead of hitting the DB's unique index
// (ct_leg_order/ct_leg_nat_load) with nowhere for the leg to go.
export const RT_CLOSED_STATUSES = ['closed', 'complete'];
const MAX_LEGS = 20;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function int(v) { return Number.isInteger(v); }

function pickRow(body) {
  const row = {};
  for (const f of ['scope', 'trip_type', 'truck_id', 'trailer_id', 'driver_id', 'partner_id', 'date_start', 'date_end', 'total_km', 'source']) {
    if (body[f] === undefined || body[f] === null || body[f] === '') continue;
    row[f] = typeof body[f] === 'string' ? body[f].trim() : body[f];
  }
  return row;
}

function validateLeg(leg, i) {
  if (!leg || typeof leg !== 'object') return { error: `legs[${i}]: must be an object` };
  if (!RT_DIRECTIONS.includes(leg.direction)) return { error: `legs[${i}].direction must be one of ${RT_DIRECTIONS.join('|')}` };
  const hasOrder = leg.order_id !== undefined && leg.order_id !== null;
  const hasNat = leg.nat_load_id !== undefined && leg.nat_load_id !== null;
  // DB invariant `one_source` (ct_rt_legs): exactly one of the two — enforced
  // here too so a malformed leg fails loud at the API, not as a DB 500.
  if (hasOrder === hasNat) return { error: `legs[${i}]: exactly one of order_id/nat_load_id required` };
  if (hasOrder && !int(leg.order_id)) return { error: `legs[${i}].order_id must be an integer` };
  if (hasNat && !int(leg.nat_load_id)) return { error: `legs[${i}].nat_load_id must be an integer` };
  const out = { direction: leg.direction };
  if (hasOrder) out.order_id = leg.order_id; else out.nat_load_id = leg.nat_load_id;
  // seq (025_rt_leg_seq.sql, 8/9): the dispatcher's stop order for a groupage
  // (Group ID suffix, modules/weekly_intl.js _wiGrpOrder). Optional — every
  // caller that doesn't send it (older core/rt-feed.js, manual RT creation)
  // keeps working exactly as before.
  if (leg.seq !== undefined && leg.seq !== null) {
    if (!int(leg.seq)) return { error: `legs[${i}].seq must be an integer` };
    out.seq = leg.seq;
  }
  return { leg: out };
}

// body → { ok:true, row, legs } | { ok:false, status:400, error }
export function validateRtBody(body) {
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'body required' };
  if (!RT_SCOPES.includes(body.scope)) return { ok: false, status: 400, error: 'scope must be one of ' + RT_SCOPES.join('|') };
  if (!RT_TRIP_TYPES.includes(body.trip_type)) return { ok: false, status: 400, error: 'trip_type must be one of ' + RT_TRIP_TYPES.join('|') };
  if (!ISO.test(body.date_start || '')) return { ok: false, status: 400, error: 'date_start must be YYYY-MM-DD' };
  // Mirrors the DB's owned_needs_truck / partner_needs_partner checks — catching
  // it here gives a named 400 instead of a raw Postgres constraint error.
  if (body.trip_type === 'OWNED' && !int(body.truck_id)) return { ok: false, status: 400, error: 'trip_type OWNED requires truck_id' };
  if (body.trip_type === 'PARTNER' && !int(body.partner_id)) return { ok: false, status: 400, error: 'trip_type PARTNER requires partner_id' };
  if (body.date_end !== undefined && body.date_end !== null) {
    if (!ISO.test(body.date_end)) return { ok: false, status: 400, error: 'date_end must be YYYY-MM-DD' };
    if (body.date_end < body.date_start) return { ok: false, status: 400, error: 'date_end must not be before date_start' };
  }
  const legsIn = Array.isArray(body.legs) ? body.legs : [];
  if (legsIn.length > MAX_LEGS) return { ok: false, status: 400, error: `legs: max ${MAX_LEGS}` };
  const legs = [];
  for (let i = 0; i < legsIn.length; i++) {
    const v = validateLeg(legsIn[i], i);
    if (v.error) return { ok: false, status: 400, error: v.error };
    legs.push(v.leg);
  }
  return { ok: true, row: pickRow(body), legs };
}

// existing: [{id, order_id, nat_load_id, rt_id, seq, rt_status?}] — the
// ct_rt_legs rows the caller already found for the order_ids/nat_load_ids in
// `legs` (index.js looks these up with a SELECT before calling this, now
// including `id` and `seq` so a re-post that only changes the dispatcher's
// stop order can UPDATE the leg instead of silently doing nothing). We trust
// the DB's unique partial index (ct_leg_order / ct_leg_nat_load, migration
// 001) to guarantee each order/load appears in AT MOST one row — no re-check
// of that here.
//
// `rt_status` (owner 8/9 defect, N2): a row whose RT is `cancelled` — a
// discarded plan, not history (see RT_CLOSED_STATUSES's own comment) — must
// not count as "existing" for the create/attach decision below. Without this
// a fresh execution of the SAME order (e.g. re-assigned after the plan that
// created its old RT was cancelled) silently ATTACHED to that dead RT and
// stayed invisible in P&L — found via the Weekly International unmatch toast,
// but the root cause is here, in planning, not in the unmatch path. A caller
// that never sends `rt_status` (older callers, every existing test) sees the
// row treated as active — identical to today's behaviour.
// The DB's unique index still holds the stale row in place regardless of RT
// status, so `staleLegIds` names it: the caller must free it (DELETE — now
// allowed for a cancelled RT, see canRemoveLeg) before inserting the leg
// under whichever RT this plan lands it on.
export function planRtUpsert({ legs, existing }) {
  const rows = existing || [];
  const active = rows.filter(e => e.rt_status !== 'cancelled');
  const stale = rows.filter(e => e.rt_status === 'cancelled');
  const staleLegIds = stale.length ? stale.map(e => e.id) : null;

  if (!active.length) return staleLegIds ? { action: 'create', staleLegIds } : { action: 'create' };
  const rtIds = [...new Set(active.map(e => e.rt_id))];
  if (rtIds.length > 1) {
    return { action: 'conflict', status: 409, error: 'legs already belong to different round trips: ' + rtIds.join(',') };
  }
  const rt_id = rtIds[0];
  const findExisting = (leg) => active.find(e =>
    (leg.order_id !== undefined && e.order_id === leg.order_id) ||
    (leg.nat_load_id !== undefined && e.nat_load_id === leg.nat_load_id));
  const legsToAdd = [];
  const legsToUpdateSeq = [];
  for (const leg of legs) {
    const match = findExisting(leg);
    if (!match) { legsToAdd.push(leg); continue; }
    if (leg.seq !== undefined && leg.seq !== match.seq) legsToUpdateSeq.push({ id: match.id, seq: leg.seq });
  }
  const plan = { action: 'attach', rt_id, legsToAdd };
  // Omitted when empty (not `legsToUpdateSeq: []`) so every caller/test that
  // predates seq — and never sends it — sees the exact same shape as before.
  if (legsToUpdateSeq.length) plan.legsToUpdateSeq = legsToUpdateSeq;
  if (staleLegIds) plan.staleLegIds = staleLegIds;
  return plan;
}

// rt: the ct_round_trips row (or null/undefined, treated as removable — the
// caller is expected to have already 404'd on a missing RT).
export function canRemoveLeg(rt) {
  if (rt && RT_CLOSED_STATUSES.includes(rt.status)) {
    return { ok: false, status: 409, error: `cannot remove a leg from a ${rt.status} round trip` };
  }
  return { ok: true };
}
