// ═══════════════════════════════════════════════════════════
// MODULE — ΜΙΣΘΟΔΟΣΙΑ ΟΔΗΓΩΝ (καρτέλα οδηγού)
// Source: /costs/ledger* (Worker) → dl_v_balance / dl_v_entries.
// Spec: docs/superpowers/specs/2026-09-05-driver-payroll-ledger-design.md
// Figma KO7l2AfucR3HJEDIg1Yptr → w5-payroll-balances / -driver-ledger / -entry-form.
// Tokens only — no hex here (DESIGN.md #1). Unknown is never 0 (#3): a trip
// without a value is «εκκρεμεί», a balance is a number AND a word (#2).
// ═══════════════════════════════════════════════════════════
'use strict';

const DL_TYPE_LABELS = { trip: 'Δρομολόγιο', payment_cash: 'Μετρητά', payment_bank: 'Τράπεζα', adjustment: 'Προσαρμογή' };

// Format number to Greek locale: e.g., 354.76 → '354,76'
// Returns '—' for null/undefined/empty; otherwise 2-decimal formatted string.
function dlNum(n) {
  if (n === null || n === undefined || n === '') return null;
  return Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dlEur(n) {
  const s = dlNum(n);
  return s === null ? '—' : s + ' €';
}

function dlBalanceWord(n) {
  // Distinguish unknown (null/undefined/'') from zero: unknown = 'χωρίς καρτέλα', zero = 'τακτοποιημένο'
  if (n === null || n === undefined || n === '') {
    return { text: 'χωρίς καρτέλα', cls: 'dl-zero' };
  }
  const v = Number(n);
  if (v > 0) return { text: 'του χρωστάμε', cls: 'dl-owe' };
  if (v < 0) return { text: 'μας χρωστά', cls: 'dl-owed' };
  return { text: 'τακτοποιημένο', cls: 'dl-zero' };
}

// U+2212 minus: a hyphen next to tabular digits reads as a typo («-950,47»).
// Unknown balance_delta returns dash; pending trips return dash.
function dlDelta(e) {
  if (e.balance_delta === null || e.balance_delta === undefined) return '—';
  if (e.entry_type === 'trip' && e.pending) return '—';
  const v = Number(e.balance_delta);
  const s = Math.abs(v).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '−' : '+') + s;
}

function dlTypeLabel(t) { return DL_TYPE_LABELS[t] || t; }

function dlDateRange(start, end) {
  // Format date as DD/MM, optionally with YY if crossing a year boundary
  const dm = (s, includeYear = false) => {
    if (includeYear) return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(2, 4);
    return s.slice(8, 10) + '/' + s.slice(5, 7);
  };
  if (!end || end === start) return dm(start);
  // Check if crossing a year boundary
  if (start.slice(0, 4) !== end.slice(0, 4)) {
    return dm(start, true) + '–' + dm(end, true);
  }
  // Same year: check if crossing a month boundary
  return start.slice(5, 7) === end.slice(5, 7) ? start.slice(8, 10) + '–' + dm(end) : dm(start) + '–' + dm(end);
}

// node:test reads these; the browser ignores the guard.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dlEur, dlBalanceWord, dlDelta, dlTypeLabel, dlDateRange };
}
