// ═══════════════════════════════════════════════════════════
// CORE — Central Order Sync Service
// ─────────────────────────────────────────────────────────────
// Principle: ORDERS + NAT_ORDERS are the single source of truth.
// Every derived table (NAT_LOADS, GL, CL, ORDER_STOPS, RAMP,
// PALLET_LEDGER_*) must sync when the source changes.
//
// Usage:
//   await syncOrderDownstream(orderId, { source: 'intl' })
//   await syncOrderDownstream(natOrderId, { source: 'natl' })
// ═══════════════════════════════════════════════════════════

const _orderSync = (function() {
  'use strict';

  /**
   * Main entry: sync all derived tables for a given source order.
   * @param {string} orderId - source record ID
   * @param {Object} opts
   * @param {'intl'|'natl'} opts.source - which source table
   * @param {string[]} [opts.changedFields] - fields that changed (for optimization)
   * @param {boolean} [opts.skipVS=false] - skip Veroia Switch sync
   * @param {boolean} [opts.skipGRP=false] - skip groupage sync
   * @param {boolean} [opts.skipRamp=false] - skip RAMP sync
   * @param {boolean} [opts.skipPL=false] - skip pallet ledger cleanup
   * @param {boolean} [opts.skipPA=false] - skip partner assignment sync
   * @returns {Promise<{ok: boolean, failed: string[]}>}
   */
  async function syncOrderDownstream(orderId, opts = {}) {
    const { source, changedFields = [], skipVS, skipGRP, skipRamp, skipPL, skipPA } = opts;
    if (!orderId || !source) return { ok: false, failed: ['missing orderId/source'] };

    const failed = [];
    const run = async (label, fn) => {
      try { await fn(); } catch (e) {
        console.warn(`[order-sync] ${label} failed:`, e);
        if (typeof logError === 'function') logError(e, `order-sync.${label}`);
        failed.push(label);
      }
    };

    // 1. Propagate status change to Partner Assignments
    if (!skipPA && (changedFields.length === 0 || changedFields.includes('Status'))) {
      await run('paSyncStatus', async () => {
        if (typeof paSyncStatus !== 'function') return;
        const tableId = source === 'intl' ? TABLES.ORDERS : TABLES.NAT_ORDERS;
        const rec = await atGetOne(tableId, orderId).catch(() => null);
        if (!rec) return;
        await paSyncStatus({ parentType: 'order', parentId: orderId, status: rec.fields['Status'] });
      });
    }

    // 2. Veroia Switch chain (intl only)
    if (source === 'intl' && !skipVS) {
      await run('VS chain', async () => {
        if (typeof _syncVeroiaSwitch !== 'function') return;
        const rec = await atGetOne(TABLES.ORDERS, orderId).catch(() => null);
        if (!rec) return;
        await _syncVeroiaSwitch(orderId, rec.fields);
      });
    }

    // 3. National Groupage chain (both intl and natl can have groupage)
    if (!skipGRP) {
      await run('GRP→GL→CL→NL cascade', async () => {
        await syncGLtoCLtoNL(orderId, source);
      });
    }

    // 4. RAMP sync — trigger background sync (non-blocking)
    if (!skipRamp) {
      await run('RAMP sync', async () => {
        if (typeof _rampAutoSync === 'function') {
          // Fire-and-forget — RAMP sync fetches its own data by date
          _rampAutoSync().catch(e => console.warn('[order-sync] RAMP bg sync:', e));
        }
      });
    }

    // 5. Pallet Ledger orphan cleanup if Pallet Exchange toggled OFF
    if (!skipPL && changedFields.includes('Pallet Exchange')) {
      await run('PL orphan cleanup', async () => {
        await cleanupPLorphans(orderId, source);
      });
    }

    // 6. Invalidate caches so next reads pick up fresh data
    try {
      invalidateCache(TABLES.ORDERS);
      invalidateCache(TABLES.NAT_ORDERS);
      invalidateCache(TABLES.NAT_LOADS);
      invalidateCache(TABLES.GL_LINES);
      invalidateCache(TABLES.CONS_LOADS);
      invalidateCache(TABLES.ORDER_STOPS);
      invalidateCache(TABLES.RAMP);
    } catch(_) {}

    return { ok: failed.length === 0, failed };
  }

  /**
   * Cascade GL Pallets/Temperature/Goods changes down to CL and NL.
   * Called when source order fields change.
   */
  async function syncGLtoCLtoNL(orderId, source) {
    const parentField = source === 'intl' ? 'Linked International Order' : 'Linked National Order';
    const gls = await atGetAll(TABLES.GL_LINES, {
      filterByFormula: `FIND("${orderId}",ARRAYJOIN({${parentField}},","))>0`,
      fields: ['Pallets','Goods','Temperature C','Reference','Status','Groupage ID']
    }, false).catch(() => []);
    if (!gls.length) return;

    // Find distinct CL parents for these GLs
    const clIds = new Set();
    for (const gl of gls) {
      if (gl.fields['Status'] === 'Assigned') {
        // Find CL that contains this GL
        const cls = await atGetAll(TABLES.CONS_LOADS, {
          filterByFormula: `FIND("${gl.id}",ARRAYJOIN({Groupage Lines},","))>0`,
          fields: ['Name','Groupage Lines']
        }, false).catch(() => []);
        cls.forEach(c => clIds.add(c.id));
      }
    }

    // For each affected CL, recompute totals from its current GL lines
    for (const clId of clIds) {
      try {
        const cl = await atGetOne(TABLES.CONS_LOADS, clId).catch(() => null);
        if (!cl) continue;
        const clGlIds = cl.fields['Groupage Lines'] || [];
        if (!clGlIds.length) continue;
        const clGls = await atGetAll(TABLES.GL_LINES, {
          filterByFormula: `OR(${clGlIds.map(id=>`RECORD_ID()="${id}"`).join(',')})`,
          fields: ['Pallets','Temperature C','Goods']
        }, false).catch(() => []);
        const totalPallets = clGls.reduce((s, r) => s + (r.fields['Pallets']||0), 0);
        const temps = [...new Set(clGls.map(r => r.fields['Temperature C']).filter(v => v!=null))];
        const goods = [...new Set(clGls.map(r => r.fields['Goods']).filter(Boolean))].join(' / ');
        // Update CL totals (only fields that exist — wrap in try)
        try {
          await atPatch(TABLES.CONS_LOADS, clId, {
            'Total Pallets': totalPallets,
            ...(temps.length === 1 ? { 'Temperature C': temps[0] } : {}),
            ...(goods ? { 'Goods': goods } : {}),
          });
        } catch(e) { /* some fields may not exist on CL */ }

        // Find NL that was built from this CL and update it
        const nls = await atGetAll(TABLES.NAT_LOADS, {
          filterByFormula: `{Source Record}="${clId}"`,
          fields: ['Total Pallets','Temperature C']
        }, false).catch(() => []);
        for (const nl of nls) {
          try {
            await atPatch(TABLES.NAT_LOADS, nl.id, {
              'Total Pallets': totalPallets,
              ...(temps.length === 1 ? { 'Temperature C': temps[0] } : {}),
            });
          } catch(_) {}
        }
      } catch(e) { console.warn('[order-sync] CL/NL cascade:', e); }
    }
  }

  /**
   * Clean up Pallet Ledger entries that are orphaned because
   * Pallet Exchange was toggled OFF on the source order.
   */
  async function cleanupPLorphans(orderId, source) {
    const tableId = source === 'intl' ? TABLES.ORDERS : TABLES.NAT_ORDERS;
    const rec = await atGetOne(tableId, orderId).catch(() => null);
    if (!rec || rec.fields['Pallet Exchange']) return; // Only cleanup if PE is OFF

    // Find all stops for this order
    const parentField = source === 'intl' ? 'Parent Order' : 'Parent Nat Order';
    const stops = await atGetAll(TABLES.ORDER_STOPS, {
      filterByFormula: `FIND("${orderId}",ARRAYJOIN({${parentField}},","))>0`,
      fields: ['Stop Number']
    }, false).catch(() => []);
    if (!stops.length) return;

    const stopIds = stops.map(s => s.id);
    const stopFilter = `OR(${stopIds.map(id => `FIND("${id}",ARRAYJOIN({Order Stop},","))>0`).join(',')})`;

    // Cleanup from both ledger tables
    for (const tbl of [TABLES.PALLET_LEDGER_SUPPLIERS, TABLES.PALLET_LEDGER_PARTNERS]) {
      const pls = await atGetAll(tbl, { filterByFormula: stopFilter, fields: ['Pallets'] }, false).catch(() => []);
      for (const pl of pls) {
        try { await atDelete(tbl, pl.id); }
        catch(e) { console.warn('[order-sync] PL delete:', e); }
      }
      if (pls.length) console.log(`[order-sync] Deleted ${pls.length} PL entries (PE=OFF) from ${tbl}`);
    }
  }

  /**
   * Convenience: patch a source order AND trigger downstream sync.
   * Drop-in replacement for atPatch when the caller wants automatic sync.
   */
  async function patchWithSync(tableId, orderId, fields, opts = {}) {
    const source = tableId === TABLES.ORDERS ? 'intl' : (tableId === TABLES.NAT_ORDERS ? 'natl' : null);
    if (!source) {
      // Not a source table — just patch, no sync
      return typeof atSafePatch === 'function' ? atSafePatch(tableId, orderId, fields) : atPatch(tableId, orderId, fields);
    }
    const patchFn = typeof atSafePatch === 'function' ? atSafePatch : atPatch;
    const result = await patchFn(tableId, orderId, fields);
    if (result && result.conflict) return result; // conflict detection bail
    const changedFields = Object.keys(fields);
    await syncOrderDownstream(orderId, { source, changedFields, ...opts });
    return result;
  }

  return { syncOrderDownstream, syncGLtoCLtoNL, cleanupPLorphans, patchWithSync };
})();

if (typeof window !== 'undefined') {
  window.syncOrderDownstream = _orderSync.syncOrderDownstream;
  window.syncGLtoCLtoNL = _orderSync.syncGLtoCLtoNL;
  window.cleanupPLorphans = _orderSync.cleanupPLorphans;
  window.patchWithSync = _orderSync.patchWithSync;
}
