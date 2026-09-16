// ═══════════════════════════════════════════════════════════
// MODULE — ΜΙΣΘΟΔΟΣΙΑ ΟΔΗΓΩΝ: εκτύπωση A4 + CSV (v3, Figma 601:1011)
// Συμβόλαιο: docs/superpowers/plans/2026-09-14-payroll-v3-contract.md
// Το A4 ζει σε ξεχωριστό αρχείο (print_payroll.html) — εδώ μόνο το άνοιγμα
// του παραθύρου (ίδιο μοτίβο με print.html) και το CSV, που τρέχει μέσα στο
// app.html άρα έχει ήδη dlPeriod/dlNum/dlDelta/dlTypeLabel (modules/payroll.js).
// ═══════════════════════════════════════════════════════════
'use strict';

// ── Εκτύπωση καρτέλας ──
// ΣΧΕΤΙΚΟ URL (όχι PROXY_URL/apex domain μπροστά) — δουλεύει είτε η σελίδα
// ανοίγει από GitHub Pages είτε από το τοπικό http.server του rig, όπως
// print.html. Το print_payroll.html κάνει μόνο του τα fetch με το PROXY_URL.
function dlPrintCard(driverId, year, month) {
  var qs = 'doc=card&driver=' + encodeURIComponent(driverId) + '&year=' + encodeURIComponent(year);
  if (month) qs += '&month=' + encodeURIComponent(month);
  window.open('print_payroll.html?' + qs, '_blank');
}

function dlPrintDrivers() {
  window.open('print_payroll.html?doc=drivers', '_blank');
}

// ── CSV: κοινά εργαλεία ──
// RFC4180-ελάχιστο: εισαγωγικά μόνο όταν το κελί περιέχει το διαχωριστικό,
// εισαγωγικά ή αλλαγή γραμμής (διπλασιασμός εσωτερικών εισαγωγικών).
function dlCsvCell(v) {
  var s = (v === null || v === undefined) ? '' : String(v);
  if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function dlCsvRow(cells) { return cells.map(dlCsvCell).join(';'); }

// UTF-8 BOM (ώστε το Excel να διαβάσει τα ελληνικά χωρίς να ρωτήσει encoding)
// + `;` διαχωριστικό (το κόμμα είναι ήδη το δεκαδικό, dlNum) — owner spec 14/9.
function dlCsvDownload(filename, lines) {
  var csv = '﻿' + lines.map(dlCsvRow).join('\r\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

// DD/MM/YYYY· «—» για ανύπαρκτη ημερομηνία (ίδια σύμβαση με dlEur/dlMoney:
// άγνωστο ποτέ κενό αδιάφορο — αρχή 1).
function dlCsvDate(s) {
  if (!s) return '—';
  var p = String(s).split('T')[0].split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(s);
}

function dlCsvSafeName(s) { return String(s || '').replace(/[\\/:*?"<>|]/g, '-'); }

// Ποσό CSV: δεκαδικά με κόμμα (dlNum), «—» για null/undefined/'' — ποτέ κενό
// κελί χωρίς εξήγηση, ίδια σύμβαση με το ledger στην οθόνη (dlEur/dlMoney).
function dlCsvAmt(n) { var s = dlNum(n); return s === null ? '—' : s; }

// Κείμενο κίνησης — ίδια λογική με dlEntryRowHtml (modules/payroll.js):
// δρομολόγιο → route_text· πληρωμή/προσαρμογή → η λέξη τους. Ο λόγος
// προσαρμογής (note, υποχρεωτικός στη φόρμα) ΔΕΝ χάνεται στο αρχείο εξαγωγής
// (αρχή 1) — μπαίνει σε παρένθεση μετά την περιγραφή.
// «Τύπος · λεπτομέρεια» — ίδια σύμβαση με το A4 (print_payroll.html, Figma
// 601:1011, ενημέρωση συμβολαίου 14/9): μία διατύπωση παντού (αρχή 3).
function dlCsvKinisi(e) {
  var base = e.entry_type === 'trip' ? 'Δρομολόγιο · ' + (e.route_text || '—')
    : e.entry_type === 'payment_bank' ? 'Πληρωμή · Κατάθεση τράπεζας'
    : e.entry_type === 'payment_cash' ? 'Πληρωμή · Μετρητά'
    : 'Προσαρμογή' + (e.note ? ' · ' + e.note : '');
  if (e.entry_type === 'trip' && e.pending) base += ' (χωρίς καταχωρισμένη αξία)';
  return base;
}
// ΑΞΙΑ/ΕΛΑΒΕ/ΕΞΟΔΑ: ο ΙΔΙΟΣ κανόνας στήλης με την οθόνη και το A4 —
// dlEntryAmounts (modules/payroll.js), μία σύμβαση παντού (αρχή 3).
function dlCsvValue(e) { return dlCsvAmt(dlEntryAmounts(e).value); }
function dlCsvReceived(e) { return dlCsvAmt(dlEntryAmounts(e).received); }
function dlCsvExpenses(e) { return dlCsvAmt(dlEntryAmounts(e).expenses); }

// ── dlCsvCard: μία καρτέλα οδηγού, μία περίοδος ──
// Ίδιο dlPeriod με την οθόνη ΚΑΙ το A4 (print_payroll.html) — καμία δεύτερη
// εκδοχή του υπολοίπου έναρξης/τέλους (αρχή 3, βλ. συμβόλαιο §Κοινός helper).
// Ακυρωμένες γραμμές ΔΕΝ μπαίνουν (owner spec 14/9) — σε ένα αρχείο για
// λογιστική/έλεγχο δεν έχει νόημα μια κίνηση που ποτέ δεν μέτρησε στο υπόλοιπο.
function dlCsvCard(driverName, entries, year, month) {
  var p = dlPeriod(entries, year, month);
  // Newest first, like the card and the A4 (owner 16/9); opening/closing still
  // come from the chronological pass inside dlPeriod.
  var live = p.desc.filter(function (e) { return !e.cancelled; });
  var lines = [
    ['Ημερομηνία', 'Κίνηση', 'Αξία', 'Έλαβε', 'Έξοδα', 'Μεταβολή', 'Υπόλοιπο'],
    ['', 'Υπόλοιπο έναρξης περιόδου', '', '', '', '', dlNum(p.opening)]
  ];
  live.forEach(function (e) {
    lines.push([
      String(e.entry_date || '').split('T')[0].split('-').reverse().join('/'),
      dlCsvKinisi(e), dlCsvValue(e), dlCsvReceived(e), dlCsvExpenses(e), dlDelta(e), dlNum(e.running_balance)
    ]);
  });
  lines.push(['', 'Υπόλοιπο τέλους περιόδου', '', '', '', '', dlNum(p.closing)]);
  var period = year === 'all' ? 'ολα' : (month ? year + '-' + month : year);
  dlCsvDownload('μισθοδοσία-' + dlCsvSafeName(driverName) + '-' + period + '.csv', lines);
}

// ── dlCsvDrivers: κατάσταση οφειλών όλων των οδηγών ──
// Ίδιο φίλτρο/ταξινόμηση με doc=drivers στο print_payroll.html — μόνο
// has_entries, φθίνουσα κατά υπόλοιπο — ώστε το CSV και το χαρτί να δείχνουν
// τους ίδιους οδηγούς με την ίδια σειρά (αρχή 3).
function dlCsvDrivers(balances) {
  var rows = (balances || []).filter(function (d) { return d.has_entries; })
    .slice().sort(function (a, b) { return Number(b.balance || 0) - Number(a.balance || 0); });
  var lines = [['Οδηγός', 'Τύπος', 'Υπόλοιπο', 'Δρομολόγια έτους', 'Χωρίς αξία', 'Τελευταία κίνηση', 'Τελευταία πληρωμή']];
  rows.forEach(function (d) {
    var lastPay = d.last_payment_date
      ? dlCsvDate(d.last_payment_date) + (d.last_payment_type ? ' (' + dlTypeLabel(d.last_payment_type) + ')' : '')
      : '—';
    lines.push([d.full_name, dlTypeWord(d.type), dlNum(d.balance), d.trips_ytd || 0, d.pending_count || 0, dlCsvDate(d.last_entry_date), lastPay]);
  });
  dlCsvDownload('μισθοδοσία-οδηγοί-' + new Date().toISOString().slice(0, 10) + '.csv', lines);
}
