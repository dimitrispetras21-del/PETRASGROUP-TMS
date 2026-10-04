// core/orders-list.js — the shared engine of the two order lists
// (modules/orders_intl.js, modules/orders_natl.js).
//
// Step 1 of the unification (owner 22/9/2026, docs/data-audit/2026-09/
// 2026-09-22-orders-lists-unification.md §3): ONLY what was byte-identical in
// both modules moves here — the period cutoff formula, the virtual-scroll
// painter and its rAF throttle (the «cancel order» flow that also lived here
// was removed 28/9 — orders have only «Διαγραφή», owner). Behaviour is
// unchanged by construction: each module keeps its own state object, its own
// row renderer, its own strings, and passes them in.
// Step 2a (22/9): the column sort, the CSV download, the print tail, the OR()
// batching and the row-count label — the parts that differed only by wording.
// 28/9: the two lists became ONE (modules/orders_catalog.js) and the old list
// code left both modules, with the shared filter engine (filterSpecs /
// applyFilters / tripState) that only they used. Today's readers: the catalog
// and the order views (sort, shell, virtual scroll, CSV, print, count), the two
// loaders (periodFormula) and the batched reads (chunk).
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

  // Sort by a column definition ({key, type, get(fields, rec)}): numbers by
  // value, dates by ISO string, everything else case-insensitively. dir 1 = asc,
  // 2 = desc, 0/no column = the incoming order untouched.
  sortRecords(recs, colDefs, sortCol, sortDir) {
    if (!sortCol || sortDir === 0) return recs;
    const col = colDefs.find(c => c.key === sortCol);
    if (!col) return recs;
    const dir = sortDir === 1 ? 1 : -1;
    return [...recs].sort((a, b) => {
      const va = col.get(a.fields, a), vb = col.get(b.fields, b);
      if (col.type === 'number') return ((parseFloat(va) || 0) - (parseFloat(vb) || 0)) * dir;
      if (col.type === 'date') return (va || '').localeCompare(vb || '') * dir;
      return String(va).toLowerCase().localeCompare(String(vb).toLowerCase()) * dir;
    });
  },

  // Step 2b-b: the table shell around the virtual scroller. Head and body are
  // two SEPARATE <table>s (the head must stay put while tbody is repainted)
  // sharing ONE <colgroup> + table-layout:fixed, so the declared widths — not
  // the content — decide (Δ1 3/9: two auto-layout tables drifted +566px).
  // Legend ABOVE the table (below the 100vh-280px scroller it fell under the
  // fold at 1440×900, measured 3/9). overflow-anchor:none (owner 6/9: Chrome's
  // scroll anchoring + spacer growth = runaway scroll loop). Sort arrows are
  // plain text: accent is reserved for the primary action (DESIGN ΜΕΡΟΣ Β).
  // Scrollbar look is NOT set here — each module's CSS owns it (reviewer P4 on
  // 5d8250f: an inline colour beat the national rule; one source, principle 3).
  // The row renderer, the empty state and the strips stay in each module.
  tableShell({ colDefs, sortCol, sortDir, sortToggle, ids, rowH, total, legend, legendClass, footClass }) {
    const ths = colDefs.map(c => {
      const arrow = sortCol === c.key ? (sortDir === 1 ? ' ▲' : sortDir === 2 ? ' ▼' : '') : '';
      const click = c.nosort ? '' : ` onclick="${sortToggle}('${c.key}')"`;
      return `<th style="cursor:${c.nosort ? 'default' : 'pointer'};user-select:none"${click}${c.t ? ` title="${c.t}"` : ''}>${c.label}${arrow}</th>`;
    }).join('');
    const colgroup = `<colgroup>${colDefs.map(c => `<col style="width:${c.w}px">`).join('')}</colgroup>`;
    return `
    <div class="${legendClass}">${legend}</div>
    <div id="${ids.scroller}" style="height:calc(100vh - 280px);overflow-y:auto;overflow-anchor:none">
      <table style="table-layout:fixed;width:100%">${colgroup}
        <thead><tr>${ths}</tr></thead>
      </table>
      <div id="${ids.top}" style="height:0"></div>
      <table style="table-layout:fixed;width:100%">${colgroup}<tbody></tbody></table>
      <div id="${ids.bottom}" style="height:${total * rowH}px"></div>
    </div>
    <div class="${footClass}">${OrdersList.countLabel(total)}</div>`;
  },

  // «N παραγγελία / παραγγελίες» — the count both lists print in the header.
  countLabel(n) { return n + (n === 1 ? ' παραγγελία' : ' παραγγελίες'); },

  // Airtable-style OR() formulas have a length limit: split id lists in
  // batches (the international list used 90 from day one; the national
  // «missing load» check sent ONE formula for every candidate — fixed 22/9).
  chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; },

  // CSV: BOM + quoted cells, one download, Greek toasts (DESIGN.md ΜΕΡΟΣ Ε —
  // the national list said «CSV exported» until 22/9). csvSafeCell: core/utils.js.
  csvDownload(rows, filename) {
    const csv = rows.map(r => r.map(c => `"${String(csvSafeCell(c)).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = filename; a.click(); URL.revokeObjectURL(a.href);
    toast('Το CSV αποθηκεύτηκε');
  },

  // Print: a new tab with the module's own A4 HTML; the popup-blocked message
  // is the same Greek sentence for both lists.
  printOpen(html) {
    const w = window.open('', '_blank');
    if (!w) { toast('Το αναδυόμενο παράθυρο μπλοκαρίστηκε — επίτρεψε τα pop-ups για αυτόν τον ιστότοπο', 'warn'); return; }
    w.document.write(html);
    w.document.close();
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = OrdersList;
