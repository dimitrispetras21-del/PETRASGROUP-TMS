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
        const rec = await atGetOne(tableId, orderId).catch(e => {
          console.warn('[order-sync] paSyncStatus fetch failed:', e && e.message);
          return null;
        });
        if (!rec) return;
        await paSyncStatus({ parentType: 'order', parentId: orderId, status: rec.fields['Status'] });
      });
    }

    // 2. Veroia Switch chain (intl only)
    if (source === 'intl' && !skipVS) {
      await run('VS chain', async () => {
        if (typeof _syncVeroiaSwitch !== 'function') {
          // 9/9: this silent return hid a dead VS chain for weeks (orders_intl.js
          // kept the function inside its IIFE). Never again quiet.
          const err = new Error('VS chain unavailable: _syncVeroiaSwitch is not exposed');
          if (typeof logError === 'function') logError(err, 'order-sync.VS chain');
          if (typeof toast === 'function') toast('Ο συγχρονισμός Veroia Switch δεν έτρεξε — ενημέρωσε το Weekly National χειροκίνητα', 'warn');
          return;
        }
        const rec = await atGetOne(TABLES.ORDERS, orderId).catch(e => {
          console.warn('[order-sync] VS chain fetch failed:', e && e.message);
          return null;
        });
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
        } else if (typeof logError === 'function') {
          logError(new Error('RAMP chain unavailable: _rampAutoSync is not exposed'), 'order-sync.RAMP sync');
        }
      });
    }

    // 5. Παλέτες Φ2: PE toggle → sync εκκρεμών (ON: δημιουργία, OFF: καθαρισμός pending)
    if (!skipPL && changedFields.includes('Pallet Exchange')) {
      await run('PL feed sync', async () => {
        if (typeof plOnOrderSaved === 'function') await plOnOrderSaved(orderId, source);
        if (source === 'intl' && typeof rtOnOrderSaved === 'function') await rtOnOrderSaved(orderId);
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
      fields: ['Pallets','Goods','Temperature C','Reference','Status','Groupage ID','Linked Consolidated Load']
    }, false).catch(e => { if (typeof logError === 'function') logError(e, 'order-sync: GL/CL/NL read (was silent until 13/9)'); return []; });
    if (!gls.length) return;

    // Find distinct CL parents for these GLs — from the line's own FK (13/9):
    // filtering CONS_LOADS by a «Groupage Lines» reverse field the Worker does
    // not model was a 422 swallowed into [], so this cascade never reached a CL.
    const clIds = new Set();
    for (const gl of gls) {
      if (gl.fields['Status'] === 'Assigned') {
        const _clId = getLinkedId(gl.fields['Linked Consolidated Load']);
        if (_clId) clIds.add(_clId);
      }
    }

    // For each affected CL, recompute totals from its current GL lines
    for (const clId of clIds) {
      try {
        const cl = await atGetOne(TABLES.CONS_LOADS, clId).catch(e => {
          console.warn('[order-sync] CL fetch failed for', clId, e && e.message);
          return null;
        });
        if (!cl) continue;
        const clGlIds = cl.fields['Groupage Lines'] || [];
        if (!clGlIds.length) continue;
        const clGls = await atGetAll(TABLES.GL_LINES, {
          filterByFormula: `OR(${clGlIds.map(id=>`RECORD_ID()="${id}"`).join(',')})`,
          fields: ['Pallets','Temperature C','Goods']
        }, false).catch(e => { if (typeof logError === 'function') logError(e, 'order-sync: GL/CL/NL read (was silent until 13/9)'); return []; });
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
        } catch(e) { if (typeof logError === 'function') logError(e, 'order-sync: CL totals (silent until 13/9 — a 403 for view roles hid here)'); }

        // Find NL that was built from this CL and update it
        const nls = await atGetAll(TABLES.NAT_LOADS, {
          filterByFormula: `FIND("${clId}",ARRAYJOIN({Source Consolidated Load},","))>0` /* 13/9: groupage loads link via the CL FK, never Source Record */,
          fields: ['Total Pallets','Temperature C']
        }, false).catch(e => { if (typeof logError === 'function') logError(e, 'order-sync: GL/CL/NL read (was silent until 13/9)'); return []; });
        for (const nl of nls) {
          try {
            await atPatch(TABLES.NAT_LOADS, nl.id, {
              'Total Pallets': totalPallets,
              ...(temps.length === 1 ? { 'Temperature C': temps[0] } : {}),
            });
          } catch(e) { if (typeof logError === 'function') logError(e, 'order-sync: NL totals from CL'); }
        }
      } catch(e) { console.warn('[order-sync] CL/NL cascade:', e); }
    }
  }

  /**
   * A groupage truck (CONSOLIDATED LOAD) is ONE load shared by N orders.
   * Returns the Assigned lines that stay on `clId` once the caller's own lines
   * (`releasedGlIds`) are released. Non-empty → the truck must survive.
   * The single copy of the «other customers?» check (audit A4, owner go 3/10):
   * order delete had it, the National Groupage OFF edit did not, so unticking
   * ONE order deleted everyone's truck. Throws when the read fails — a caller
   * must then KEEP the CL: an empty answer from a failed read is not «alone».
   */
  async function clOtherAssignedLines(clId, releasedGlIds) {
    const released = new Set(releasedGlIds || []);
    const lines = await atGetAll(TABLES.GL_LINES, {
      filterByFormula: `AND(FIND("${clId}",ARRAYJOIN({Linked Consolidated Load},","))>0,{Status}="Assigned")`,
      fields: ['Status']
    }, false);
    return lines.filter(x => !released.has(x.id));
  }

  /**
   * National Groupage turned OFF on an existing order (intl or natl): take the
   * order's lines `gls` off their trucks. A truck (CL + the national load built
   * from it) is deleted ONLY when nothing else would be left Assigned on it;
   * otherwise it stays for the other customers. Lines themselves are NEVER
   * deleted — the caller flips them to 'Unassigned' (never-delete rule, DB
   * ON DELETE RESTRICT). Failed share check → keep the truck + a visible warning.
   * @param {Array<{id:string, fields:Object}>} gls - lines being released (need 'Linked Consolidated Load')
   * @param {string} ctx - caller label for the error log
   * @returns {Promise<{kept:number, deleted:number, unsure:number, failed:number}>}
   */
  async function releaseGroupageTrucks(gls, ctx) {
    const res = { kept: 0, deleted: 0, unsure: 0, failed: 0 };
    const released = gls.map(g => g.id);
    // Two lines of one order can sit on the same truck — decide per truck once.
    const clIds = [...new Set(gls.map(g => getLinkedId(g.fields['Linked Consolidated Load'])).filter(Boolean))];
    const log = (e, what) => { if (typeof logError === 'function') logError(e, `${ctx}: ${what}`); else console.warn(ctx, what, e); };
    for (const clId of clIds) {
      let others;
      try { others = await clOtherAssignedLines(clId, released); }
      catch (e) { res.unsure++; log(e, `CL ${clId} share check — CL kept`); continue; }
      if (others.length) { res.kept++; continue; }
      try {
        const nls = await atGetAll(TABLES.NAT_LOADS, {
          filterByFormula: `FIND("${clId}",ARRAYJOIN({Source Consolidated Load},","))>0` /* 13/9: groupage loads link via the CL FK, never Source Record */,
          fields: ['Name']
        }, false);
        for (const nl of nls) await atDelete(TABLES.NAT_LOADS, nl.id);
      } catch (e) { res.failed++; log(e, `NL of CL ${clId}`); }
      try { await atDelete(TABLES.CONS_LOADS, clId); res.deleted++; }
      catch (e) { res.failed++; log(e, `delete CL ${clId}`); }
    }
    if (res.failed && typeof showErrorToast === 'function') {
      showErrorToast(`Το φορτηγό groupage δεν σβήστηκε ολόκληρο (${res.failed} αποτυχία) — έλεγξε το Weekly National.`, 'warn', 9000);
    } else if (res.unsure && typeof showErrorToast === 'function') {
      showErrorToast(`Το φορτηγό groupage ΔΕΝ σβήστηκε: δεν επιβεβαιώθηκε αν έχει κι άλλους πελάτες. Έλεγξε το Weekly National.`, 'warn', 9000);
    } else if (res.kept && typeof toast === 'function') {
      toast('Το κοινό φορτηγό groupage έμεινε για τους άλλους πελάτες — βγήκε μόνο αυτή η παραγγελία', 'info');
    }
    return res;
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

  return { syncOrderDownstream, syncGLtoCLtoNL, patchWithSync, clOtherAssignedLines, releaseGroupageTrucks };
})();

if (typeof window !== 'undefined') {
  window.syncOrderDownstream = _orderSync.syncOrderDownstream;
  window.syncGLtoCLtoNL = _orderSync.syncGLtoCLtoNL;
  window.patchWithSync = _orderSync.patchWithSync;
  window.clOtherAssignedLines = _orderSync.clOtherAssignedLines;
  window.releaseGroupageTrucks = _orderSync.releaseGroupageTrucks;
}
