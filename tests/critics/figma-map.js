// The Figma <-> code binding, and the check that keeps it honest.
//
// Figma's own Code Connect would normally hold this. It refuses on this account:
// "You need a Dev or Full seat on an Organization or Enterprise plan" — the
// premium bought on 26/8 is Professional. So the mapping lives here instead.
//
// The point was never the tool, it was the binding: a designer opening a
// component should learn which code renders it, and the pair must break loudly
// when one side moves. A description in Figma carries the first half; this file
// carries the second. Rename ctCardHtml and `npm run critics` goes red naming
// the Figma component that now lies.
//
// Node ids are from file KO7l2AfucR3HJEDIg1Yptr.

const fs = require('fs');

const MAP = [
  { component: 'TripCard',       nodeId: '7:86',
    src: 'modules/costs.js',        fns: ['ctCardHtml', 'ctRenderSummary', 'ctPill'] },
  { component: 'Badge',          nodeId: '14:818',
    src: 'modules/costs.js',        fns: ['ctStatusBadge'] },
  { component: 'AssignmentChip', nodeId: '14:827',
    src: 'modules/costs.js',        fns: ['ctChip'] },
  { component: 'Row',            nodeId: '14:867',
    src: 'modules/weekly_natl.js',  fns: ['_wnRowHTML'] },
  // showEmpty and showError are separate functions on purpose: DESIGN.md #7
  // says "καμία κίνηση καταγεγραμμένη" is not "η φόρτωση απέτυχε". If one of
  // them ever disappears, the distinction has quietly collapsed in code while
  // the Figma component still promises it.
  { component: 'StateMessage',   nodeId: '83:17',
    src: 'core/ui.js',              fns: ['showEmpty', 'showError'] },

  // Κύμα 5 — Μισθοδοσία Οδηγών (5/9/2026). Node ids = τα τρία screens.
  { component: 'PayrollBalances', nodeId: '454:901', src: 'modules/payroll.js', fns: ['renderPayroll', 'dlRenderHome'] },
  { component: 'DriverLedger',    nodeId: '454:902', src: 'modules/payroll.js', fns: ['renderPayrollDriver', 'dlRenderDriverCard'] },
  { component: 'LedgerEntryForm', nodeId: '454:903', src: 'modules/payroll.js', fns: ['dlOpenPayment', 'dlSavePayment'] },

  // Built in Figma, not yet in code. Listed rather than omitted: a gap you can
  // see is work, a gap you cannot see is a surprise during implementation.
  { component: 'Button',          nodeId: '80:22', src: null, fns: [] },
  { component: 'TableHeaderCell', nodeId: '81:19', src: null, fns: [] },
  { component: 'FormField',       nodeId: '82:26', src: null, fns: [] },
];

function check() {
  const failures = [];
  const pending = [];
  let verified = 0;

  for (const entry of MAP) {
    if (!entry.src) { pending.push(entry.component); continue; }

    if (!fs.existsSync(entry.src)) {
      failures.push(`${entry.component}: λείπει το αρχείο ${entry.src}`);
      continue;
    }
    const source = fs.readFileSync(entry.src, 'utf8');
    for (const fn of entry.fns) {
      // Matches `function name(`, `async function name(`, and `const name = (`.
      const re = new RegExp('(function\\s+' + fn + '\\b|\\b' + fn + '\\s*=\\s*(async\\s*)?\\()');
      if (re.test(source)) verified++;
      else failures.push(
        `${entry.component} (Figma ${entry.nodeId}): το ${entry.src} δεν έχει πια «${fn}» — ` +
        `η περιγραφή του component στο Figma δείχνει σε κάτι ανύπαρκτο`);
    }
  }

  return { pass: failures.length === 0, failures, verified, pending, total: MAP.length };
}

module.exports = { MAP, check };
