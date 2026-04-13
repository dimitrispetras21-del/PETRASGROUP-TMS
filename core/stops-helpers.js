// ═══════════════════════════════════════════════
// CORE — ORDER STOPS HELPERS
// CRUD operations for ORDER_STOPS sub-table
// Depends on: api.js (atGetAll, atCreateBatch, atPatchBatch, atDelete)
//             config.js (TABLES, F)
// ═══════════════════════════════════════════════

/**
 * Load ORDER_STOPS for a given order, sorted by Stop Type then Stop Number.
 * @param {string} orderId - Parent order record ID
 * @param {string} parentField - 'Parent Order' (INTL) or 'Parent Nat Order' (NAT)
 * @returns {Promise<Array>} Sorted stop records [{id, fields:{...}}]
 */
async function stopsLoad(orderId, parentField) {
  if (!orderId) return [];
  const filter = `FIND("${orderId}", ARRAYJOIN({${parentField}}, ","))>0`;
  const recs = await atGetAll(TABLES.ORDER_STOPS, {
    filterByFormula: filter,
  }, false);
  // Sort: Loading first, then Unloading, then Cross-dock; within type by Stop Number
  const typeOrder = { 'Loading': 1, 'Unloading': 2, 'Cross-dock': 3 };
  return recs.sort((a, b) => {
    const ta = typeOrder[a.fields[F.STOP_TYPE]] || 9;
    const tb = typeOrder[b.fields[F.STOP_TYPE]] || 9;
    if (ta !== tb) return ta - tb;
    return (a.fields[F.STOP_NUMBER] || 0) - (b.fields[F.STOP_NUMBER] || 0);
  });
}

/**
 * Save ORDER_STOPS for an order (create/update/delete as needed).
 * @param {string} orderId - Parent order record ID
 * @param {Array} stopsArr - [{stopNumber, stopType, locationId, pallets, dateTime, clientId?, temp?, ref?, goods?, notes?}]
 * @param {string} parentField - 'Parent Order' or 'Parent Nat Order'
 * @returns {Promise<Array>} Created/updated record IDs
 */
async function stopsSave(orderId, stopsArr, parentField) {
  if (!orderId || !stopsArr.length) return [];

  // Fetch existing stops for this order
  const existing = await stopsLoad(orderId, parentField);
  const existingMap = new Map(); // key: "Loading_1" → record
  existing.forEach(r => {
    const key = `${r.fields[F.STOP_TYPE]}_${r.fields[F.STOP_NUMBER]}`;
    existingMap.set(key, r);
  });

  const toCreate = [];
  const toUpdate = [];
  const matchedIds = new Set();

  for (const s of stopsArr) {
    const key = `${s.stopType}_${s.stopNumber}`;
    const fields = _stopObjToFields(s, orderId, parentField);

    const existRec = existingMap.get(key);
    if (existRec) {
      // Update existing
      matchedIds.add(existRec.id);
      toUpdate.push({ id: existRec.id, fields });
    } else {
      // Create new
      toCreate.push({ fields });
    }
  }

  // Delete stops that are no longer in the form
  const toDelete = existing.filter(r => !matchedIds.has(r.id));

  const results = [];

  if (toCreate.length) {
    const created = await atCreateBatch(TABLES.ORDER_STOPS, toCreate);
    results.push(...created.map(r => r.id));
  }
  if (toUpdate.length) {
    await atPatchBatch(TABLES.ORDER_STOPS, toUpdate);
    results.push(...toUpdate.map(r => r.id));
  }
  if (toDelete.length) {
    await Promise.all(toDelete.map(r => atDelete(TABLES.ORDER_STOPS, r.id).catch(e => {
      console.error('Stop delete error:', e);
    })));
  }

  return results;
}

/**
 * Convert a stop object from the form to Airtable fields.
 */
function _stopObjToFields(s, orderId, parentField) {
  const fields = {
    [parentField]:    [orderId],
    [F.STOP_NUMBER]:  s.stopNumber,
    [F.STOP_TYPE]:    s.stopType,
    [F.STOP_LABEL]:   `${s.stopType} #${s.stopNumber}`,
  };
  if (s.locationId) fields[F.STOP_LOCATION] = [s.locationId];
  if (s.dateTime)   fields[F.STOP_DATETIME] = s.dateTime;
  if (s.pallets != null && s.pallets !== '') fields[F.STOP_PALLETS] = parseFloat(s.pallets) || 0;
  if (s.clientId)   fields[F.STOP_CLIENT] = [s.clientId];
  if (s.temp != null && s.temp !== '') fields[F.STOP_TEMP] = parseFloat(s.temp) || 0;
  if (s.ref)        fields[F.STOP_REF] = s.ref;
  if (s.goods)      fields[F.STOP_GOODS] = s.goods;
  if (s.notes)      fields[F.STOP_NOTES] = s.notes;
  return fields;
}

/**
 * Validate stops before save.
 * @param {Array} stopsArr - Stop objects from form
 * @returns {{errors: string[], warnings: string[]}}
 */
function stopsValidate(stopsArr) {
  const errors = [];
  const warnings = [];

  const loading = stopsArr.filter(s => s.stopType === 'Loading');
  const unloading = stopsArr.filter(s => s.stopType === 'Unloading');

  if (!loading.length) errors.push('At least 1 Loading stop is required');
  if (!unloading.length) errors.push('At least 1 Unloading stop is required');

  // Check required fields on stop 1
  if (loading.length && !loading[0].locationId) errors.push('Loading Location 1 is required');
  if (unloading.length && !unloading[0].locationId) errors.push('Unloading Location 1 is required');
  if (loading.length && !loading[0].dateTime) errors.push('Loading Date (Stop 1) is required');
  if (unloading.length && !unloading[0].dateTime) errors.push('Unloading Date (Stop 1) is required');

  // Pallets comparison warning
  const loadPals = loading.reduce((sum, s) => sum + (parseFloat(s.pallets) || 0), 0);
  const unloadPals = unloading.reduce((sum, s) => sum + (parseFloat(s.pallets) || 0), 0);
  if (loadPals > 0 && unloadPals > 0 && loadPals !== unloadPals) {
    warnings.push(`Loading pallets (${loadPals}) ≠ Unloading pallets (${unloadPals})`);
  }

  // Date cross-validation
  const firstLoad = loading.find(s => s.dateTime);
  const firstUnload = unloading.find(s => s.dateTime);
  if (firstLoad?.dateTime && firstUnload?.dateTime) {
    if (new Date(firstUnload.dateTime) < new Date(firstLoad.dateTime)) {
      errors.push('Delivery date cannot be before loading date');
    }
  }

  return { errors, warnings };
}

/**
 * Convert ORDER_STOPS records to flat Location 1-10 fields (for dual-write backward compat).
 * @param {Array} stopsArr - Stop objects [{stopType, stopNumber, locationId, pallets, dateTime}]
 * @returns {Object} Airtable fields object for ORDERS table
 */
function stopsToFlatFields(stopsArr) {
  const fields = {};
  const loading = stopsArr.filter(s => s.stopType === 'Loading').sort((a, b) => a.stopNumber - b.stopNumber);
  const unloading = stopsArr.filter(s => s.stopType === 'Unloading').sort((a, b) => a.stopNumber - b.stopNumber);

  loading.forEach((s, idx) => {
    const i = idx + 1;
    if (s.locationId) fields[`Loading Location ${i}`] = [s.locationId];
    if (s.pallets != null) fields[`Loading Pallets ${i}`] = parseFloat(s.pallets) || 0;
    if (s.dateTime) {
      if (i === 1) fields['Loading DateTime'] = s.dateTime;
      else fields[`Loading DateTime ${i}`] = s.dateTime;
    }
  });

  unloading.forEach((s, idx) => {
    const i = idx + 1;
    if (s.locationId) fields[`Unloading Location ${i}`] = [s.locationId];
    if (s.pallets != null) fields[`Unloading Pallets ${i}`] = parseFloat(s.pallets) || 0;
    if (s.dateTime) {
      fields[`Unloading DateTime ${i}`] = s.dateTime;
      if (i === 1) fields['Delivery DateTime'] = s.dateTime;
    }
  });

  return fields;
}

/**
 * Convert flat Location 1-10 fields from an order to stop objects (fallback read for old orders).
 * @param {Object} orderFields - Airtable record fields
 * @returns {Array} Stop objects [{stopNumber, stopType, locationId, pallets, dateTime}]
 */
function stopsFromFlatFields(orderFields) {
  const f = orderFields;
  const stops = [];

  // Loading stops
  for (let i = 1; i <= 10; i++) {
    const locArr = f[`Loading Location ${i}`];
    const locId = Array.isArray(locArr) ? locArr[0] : null;
    if (!locId && i > 1) break;
    if (!locId) continue;
    const dt = i === 1 ? f['Loading DateTime'] : f[`Loading DateTime ${i}`];
    stops.push({
      stopNumber: i,
      stopType: 'Loading',
      locationId: locId,
      pallets: f[`Loading Pallets ${i}`] || 0,
      dateTime: dt ? toLocalDate(dt) : '',
    });
  }

  // Unloading stops
  for (let i = 1; i <= 10; i++) {
    const locArr = f[`Unloading Location ${i}`];
    const locId = Array.isArray(locArr) ? locArr[0] : null;
    if (!locId && i > 1) break;
    if (!locId) continue;
    const dt = f[`Unloading DateTime ${i}`];
    stops.push({
      stopNumber: i,
      stopType: 'Unloading',
      locationId: locId,
      pallets: f[`Unloading Pallets ${i}`] || 0,
      dateTime: dt ? toLocalDate(dt) : '',
    });
  }

  return stops;
}
