// core/orders-list.js — the shared engine of the two order lists
// (modules/orders_intl.js, modules/orders_natl.js).
//
// Step 1 of the unification (owner 22/9/2026, docs/data-audit/2026-09/
// 2026-09-22-orders-lists-unification.md §3): ONLY what was byte-identical in
// both modules moves here — the period cutoff formula, the virtual-scroll
// painter and its rAF throttle, and the «cancel order» flow. Behaviour is
// unchanged by construction: each module keeps its own state object, its own
// row renderer, its own strings, and passes them in. Sorting, filters, the
// row/column renderers and the card follow in step 2/3.
//
// No IIFE on purpose: the two modules ARE IIFEs and reach this through the
// global, exactly like they reach TABLES, atGet or toast.

const OrdersList = {
  // Both lists load «τελευταίες 60 ημέρες» by default; '180' and 'all' are
  // the other two values of the period select. Returns '' for 'all' — the
  // callers AND() it into their own formula only when non-empty.
  periodFormula(period) {
    if (period === 'all') return '';
    const days = period === '180' ? 180 : 60;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return `IS_AFTER({Loading DateTime}, '${cutoffStr}')`;
  },

  // Pure range math of the virtual scroller — kept separate so it can be
  // unit-tested without a DOM (tests/orders-list.test.js).
  virtualRange(scrollTop, visH, total, rowH, buffer) {
    const startIdx = Math.max(0, Math.floor(scrollTop / rowH) - buffer);
    const endIdx = Math.min(total, Math.ceil((scrollTop + visH) / rowH) + buffer);
    return { startIdx, endIdx };
  },

  // Paints only the rows in view (+ buffer) and sizes the two spacers so the
  // scrollbar still represents the whole list. `vs` is the module's own state
  // object ({ sortedRecs, lastStart, lastEnd, rafId }) — mutated in place, so
  // every existing `vs.lastStart = -1` reset in the modules keeps working.
  virtualPaint(vs, { scrollerId, topSpacerId, bottomSpacerId, rowH, buffer, rowHtml }) {
    const scroller = document.getElementById(scrollerId);
    if (!scroller) return;
    const tbody = scroller.querySelector('tbody');
    const topSp = document.getElementById(topSpacerId);
    const botSp = document.getElementById(bottomSpacerId);
    if (!tbody || !topSp || !botSp) return;

    const total = vs.sortedRecs.length;
    const { startIdx, endIdx } = OrdersList.virtualRange(scroller.scrollTop, scroller.clientHeight, total, rowH, buffer);

    if (startIdx === vs.lastStart && endIdx === vs.lastEnd) return;
    vs.lastStart = startIdx;
    vs.lastEnd = endIdx;

    topSp.style.height = (startIdx * rowH) + 'px';
    botSp.style.height = ((total - endIdx) * rowH) + 'px';

    const html = [];
    for (let i = startIdx; i < endIdx; i++) html.push(rowHtml(vs.sortedRecs[i]));
    tbody.innerHTML = html.join('');
  },

  // One paint per animation frame, whatever the scroll event rate.
  virtualOnScroll(vs, paint) {
    if (vs.rafId) return;
    vs.rafId = requestAnimationFrame(() => {
      vs.rafId = null;
      paint();
    });
  },

  // «Ακύρωση»: Status → Cancelled, downstream sync, close the card, re-render.
  // The linked records (NL/GL/CL/Ramp/Pallet Ledger) stay — deletion is the
  // separate hard cascade each module keeps for itself.
  async cancelOrder({ recId, table, source, detailId, rerender, confirmText, errorText, logTag }) {
    if (!(await confirmAction(confirmText, { title: 'Ακύρωση παραγγελίας', confirmLabel: 'Ακύρωσέ την', danger: true }))) return;
    try {
      await atPatch(table, recId, { 'Status': 'Cancelled' });
      invalidateCache(table);
      try {
        if (typeof syncOrderDownstream === 'function') {
          await syncOrderDownstream(recId, { source, changedFields: ['Status'] });
        }
      } catch (e) { console.warn('Cancel: downstream sync warning:', e.message); }
      toast('Παραγγελία ακυρώθηκε', 'success');
      document.getElementById(detailId)?.classList.add('hidden');
      await rerender();
    } catch (e) {
      // User sees a clean message; full error goes to the persistent error log
      // (with call-site + recId context), not dumped raw into the toast.
      reportError(errorText);
      if (typeof logError === 'function') logError(e, logTag + ' ' + recId);
    }
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = OrdersList;
