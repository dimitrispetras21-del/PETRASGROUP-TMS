// ═══════════════════════════════════════════════════════════
// PA-HELPERS — PARTNER ASSIGNMENT upsert / delete / status-sync
// Single source of truth for partner-assignment writes across
// weekly_intl, weekly_natl, daily_ops and any future caller.
//
// Parent type:
//   'order'    → F.PA_ORDER    (tblgHlNmLBH3JTdIM)
//   'nat_load' → F.PA_NAT_LOAD (tblVW42cZnfC47gTb)
// ═══════════════════════════════════════════════════════════

async function _paFindExisting(parentType, parentId) {
  const fld = parentType === 'nat_load' ? F.PA_NAT_LOAD : F.PA_ORDER;
  const filterByFormula = `FIND('${parentId}', ARRAYJOIN({${fld}}, ','))`;
  return atGetAll(TABLES.PARTNER_ASSIGN, {
    filterByFormula,
    fields: [F.PA_PARTNER, F.PA_ORDER, F.PA_NAT_LOAD, F.PA_STATUS, F.PA_RATE],
  }, false);
}

/**
 * Upsert a PARTNER ASSIGNMENT record for a given order or nat_load.
 * If a record exists → patch. Otherwise → create.
 *
 * @param {object} p
 * @param {'order'|'nat_load'} p.parentType
 * @param {string} p.parentId             — recId of ORDER or NAT_LOAD
 * @param {string} p.partnerId            — recId of PARTNER
 * @param {number|null} [p.rate]          — agreed rate (optional)
 * @param {string} [p.status='Assigned']  — initial status
 * @param {string|null} [p.notes]         — optional notes
 */
async function paUpsert({ parentType, parentId, partnerId, rate = null, status = 'Assigned', notes = null }) {
  if (!parentType || !parentId || !partnerId) return null;

  const fields = {
    [F.PA_PARTNER]:     [partnerId],
    [F.PA_ASSIGN_DATE]: (typeof localToday === 'function') ? localToday() : new Date().toISOString().slice(0, 10),
    [F.PA_STATUS]:      status,
  };
  if (parentType === 'nat_load') fields[F.PA_NAT_LOAD] = [parentId];
  else                           fields[F.PA_ORDER]    = [parentId];
  if (rate != null && rate !== '') fields[F.PA_RATE] = parseFloat(rate);
  if (notes) fields[F.PA_NOTES] = notes;

  const existing = await _paFindExisting(parentType, parentId);
  if (existing.length > 0) {
    return atPatch(TABLES.PARTNER_ASSIGN, existing[0].id, fields);
  }
  return atCreate(TABLES.PARTNER_ASSIGN, fields);
}

/**
 * Delete all PA records for a given parent (order or nat_load).
 * Called when a dispatcher clears/unassigns a partner.
 */
async function paDelete({ parentType, parentId }) {
  if (!parentType || !parentId) return 0;
  const existing = await _paFindExisting(parentType, parentId);
  for (const r of existing) {
    try { await atDelete(TABLES.PARTNER_ASSIGN, r.id); }
    catch (e) { console.warn('paDelete failed:', r.id, e.message); }
  }
  return existing.length;
}

/**
 * Sync PA Status for all assignments tied to a parent.
 * Called from daily_ops.js when Order.Status transitions.
 *
 * Only fires if at least one PA exists for this parent (no-op otherwise).
 */
async function paSyncStatus({ parentType, parentId, status }) {
  if (!parentType || !parentId || !status) return 0;
  const existing = await _paFindExisting(parentType, parentId);
  for (const r of existing) {
    const cur = r.fields[F.PA_STATUS] || '';
    if (cur === status) continue;
    try { await atPatch(TABLES.PARTNER_ASSIGN, r.id, { [F.PA_STATUS]: status }); }
    catch (e) { console.warn('paSyncStatus failed:', r.id, e.message); }
  }
  return existing.length;
}

/**
 * Fetch all PA records for a given partner (for drawer / metrics).
 */
async function paListByPartner(partnerId) {
  if (!partnerId) return [];
  const filterByFormula = `FIND('${partnerId}', ARRAYJOIN({${F.PA_PARTNER}}, ','))`;
  return atGetAll(TABLES.PARTNER_ASSIGN, {
    filterByFormula,
    fields: [
      F.PA_PARTNER, F.PA_ORDER, F.PA_NAT_LOAD, F.PA_STATUS, F.PA_RATE,
      F.PA_ASSIGN_DATE, F.PA_NOTES, F.PA_PAYMENT_TERMS,
      'Client Revenue', 'Gross Profit', 'Margin Percent',
    ],
  }, false);
}
