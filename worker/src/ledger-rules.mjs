// Pure validation for /costs/ledger. Lives outside index.js so it can be
// tested with node:test without a Worker runtime. Every rejection names the
// field: an unknown field is a 400, never a silent drop (the facade's trap,
// CLAUDE.md «μηχανισμός-παγίδα 1»).
export const DL_TYPES = ['trip', 'payment_cash', 'payment_bank', 'adjustment'];
export const DL_FIELDS = ['driver_id', 'entry_type', 'entry_date', 'date_end', 'route', 'rt_id',
  'trip_value', 'advance', 'expenses', 'amount', 'note'];
const TRIP_ONLY = ['date_end', 'route', 'rt_id', 'trip_value', 'advance', 'expenses'];
// Single source for "which fields a trip PATCH may touch": every DL field except the
// identity fields (driver_id/entry_type, never patched) and amount (forbidden on a
// trip at creation too — see validateNewEntry).
const TRIP_EDITABLE = DL_FIELDS.filter(f => f !== 'driver_id' && f !== 'entry_type' && f !== 'amount');
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function num(v) { return typeof v === 'number' && Number.isFinite(v); }

export function validateNewEntry(body) {
  if (!body || typeof body !== 'object') return { error: 'body required' };
  const unknown = Object.keys(body).filter(k => !DL_FIELDS.includes(k));
  if (unknown.length) return { error: 'unknown field: ' + unknown.join(', ') };
  if (!DL_TYPES.includes(body.entry_type)) return { error: 'entry_type must be one of ' + DL_TYPES.join('|') };
  if (!Number.isInteger(body.driver_id)) return { error: 'driver_id required' };
  if (!ISO.test(body.entry_date || '')) return { error: 'entry_date must be YYYY-MM-DD' };
  const row = { driver_id: body.driver_id, entry_type: body.entry_type, entry_date: body.entry_date };
  if (body.entry_type === 'trip') {
    if (body.amount != null) return { error: 'amount is not allowed on a trip' };
    if (body.date_end != null) {
      if (!ISO.test(body.date_end)) return { error: 'date_end must be YYYY-MM-DD' };
      if (body.date_end < body.entry_date) return { error: 'date_end must not be before entry_date' };
      row.date_end = body.date_end;
    }
    for (const f of ['trip_value', 'advance', 'expenses']) {
      if (body[f] != null) { if (!num(body[f]) || body[f] < 0) return { error: f + ' must be a number ≥ 0' }; row[f] = body[f]; }
    }
    if (body.route != null && String(body.route).trim()) row.route = String(body.route).trim();
    if (body.rt_id != null) { if (!Number.isInteger(body.rt_id)) return { error: 'rt_id must be an integer' }; row.rt_id = body.rt_id; }
  } else {
    for (const f of TRIP_ONLY) if (body[f] != null) return { error: f + ' is not allowed on a ' + body.entry_type };
    if (!num(body.amount)) return { error: 'amount required' };
    if (body.entry_type === 'adjustment' ? body.amount === 0 : body.amount <= 0) return { error: 'amount must be ' + (body.entry_type === 'adjustment' ? '≠ 0' : '> 0') };
    row.amount = body.amount;
  }
  if (body.note != null && String(body.note).trim()) row.note = String(body.note).trim();
  row.source = 'manual';
  return { row };
}

// A PATCH may: fill a NULL amount (no reason), change a written amount/date
// (reason required — it goes to the audit log), cancel (reason required),
// or clear needs_review (reason required).
export function validatePatch(body, before) {
  if (!body || typeof body !== 'object') return { error: 'body required' };
  const reason = String(body.reason || '').trim();
  if (body.cancel) {
    if (!reason) return { error: 'reason required to cancel' };
    // cancel is a standalone action — mixing in other edits would hide which
    // change actually happened in the audit trail
    const extra = Object.keys(body).filter(k => k !== 'cancel' && k !== 'reason');
    if (extra.length) return { error: 'cancel cannot be combined with other fields: ' + extra.join(', ') };
    return { patch: { deleted_at: new Date().toISOString(), deleted_reason: reason }, needsReason: true };
  }
  if (body.needs_review === false) {
    if (!reason) return { error: 'reason required to clear needs_review' };
    const extra = Object.keys(body).filter(k => k !== 'needs_review' && k !== 'reason');
    if (extra.length) return { error: 'needs_review cannot be combined with other fields: ' + extra.join(', ') };
    return { patch: { needs_review: false, review_note: reason }, needsReason: true };
  }
  const editable = before.entry_type === 'trip' ? TRIP_EDITABLE : ['entry_date', 'amount', 'note'];
  const patch = {}; let needsReason = false;
  for (const [k, v] of Object.entries(body)) {
    if (k === 'reason') continue;
    if (!editable.includes(k)) return { error: k + ' is not editable on a ' + before.entry_type };
    if (['trip_value', 'advance', 'expenses'].includes(k) && v != null && (!num(v) || v < 0)) return { error: k + ' must be a number ≥ 0' };
    if (k === 'amount' && v != null) {
      // same per-type invariant as validateNewEntry: payment amounts are always
      // positive, adjustments may be negative but never zero
      if (!num(v)) return { error: 'amount must be a number' };
      const isAdjustment = before.entry_type === 'adjustment';
      if (isAdjustment ? v === 0 : v <= 0) return { error: 'amount must be ' + (isAdjustment ? '≠ 0' : '> 0') };
    }
    if (k === 'rt_id' && v != null && !Number.isInteger(v)) return { error: 'rt_id must be an integer' };
    if (['entry_date', 'date_end'].includes(k) && v != null && !ISO.test(v)) return { error: k + ' must be YYYY-MM-DD' };
    patch[k] = v;
    // Notes are free-text metadata, not an audited financial/date fact — the
    // spec requires a reason for amount/date corrections, not for notes.
    if (k !== 'note' && before[k] != null && before[k] !== v) needsReason = true;
  }
  if (!Object.keys(patch).length) return { error: 'nothing to update' };
  // Date pair invariant re-checked after the merge: a PATCH that only moves one
  // end of the range must still not leave date_end before entry_date.
  if ('entry_date' in patch || 'date_end' in patch) {
    const effEntryDate = 'entry_date' in patch ? patch.entry_date : before.entry_date;
    const effDateEnd = 'date_end' in patch ? patch.date_end : before.date_end;
    if (effDateEnd != null && effEntryDate != null && effDateEnd < effEntryDate) {
      return { error: 'date_end must not be before entry_date' };
    }
  }
  return { patch, needsReason };
}
