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

function dlEur(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function dlBalanceWord(n) {
  const v = Number(n) || 0;
  if (v > 0) return { text: 'του χρωστάμε', cls: 'dl-owe' };
  if (v < 0) return { text: 'μας χρωστά', cls: 'dl-owed' };
  return { text: 'τακτοποιημένο', cls: 'dl-zero' };
}
// U+2212 minus: a hyphen next to tabular digits reads as a typo («-950,47»).
function dlDelta(e) {
  if (e.entry_type === 'trip' && e.pending) return '—';
  const v = Number(e.balance_delta) || 0;
  const s = Math.abs(v).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '−' : '+') + s;
}
function dlTypeLabel(t) { return DL_TYPE_LABELS[t] || t; }
function dlDateRange(start, end) {
  const dm = s => s.slice(8, 10) + '/' + s.slice(5, 7);
  if (!end || end === start) return dm(start);
  return start.slice(5, 7) === end.slice(5, 7) ? start.slice(8, 10) + '–' + dm(end) : dm(start) + '–' + dm(end);
}

// node:test reads these; the browser ignores the guard.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dlEur, dlBalanceWord, dlDelta, dlTypeLabel, dlDateRange };
}
