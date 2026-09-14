// ═══════════════════════════════════════════════════════════
// MODULE — ΜΙΣΘΟΔΟΣΙΑ ΟΔΗΓΩΝ (v2: αρχική με λίστα+strip, καρτέλα, μαζική πληρωμή)
// Backend αμετάβλητο: /costs/ledger* (Worker).
// Spec: docs/superpowers/specs/2026-09-05-driver-payroll-v2-ui.md
// v2 λεξιλόγιο: κανένα ποσό δεν έχει δίπλα του λέξη-περιγραφή — το πρόσημο
// και η παρένθεση (dlMoney) το λένε. Κανένας εσωτερικός κωδικός στην οθόνη
// (round trip = μικρό εικονίδιο, χωρίς κείμενο).
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

// v2 balance display (v2 UI rule #1): no word next to the amount — the sign
// alone carries the meaning. Positive = owed to the driver. Negative = the
// driver owes it back, shown in parentheses and amber so it never reads like
// a stray hyphen next to tabular digits. Used for every "balance" figure
// (ΟΦΕΙΛΗ, ΝΕΑ ΟΦΕΙΛΗ, ΣΥΝΟΛΟ/running balance) — never for a per-line delta,
// which keeps the older +/− format from dlDelta.
// A balance that is 0 only because every trip is still valueless is unknown, not zero:
// a dash, so twelve «0,00 €» do not shout on the home list (DESIGN.md #3).
function dlBal(b) { return (Number(b.balance) === 0 && b.pending_count > 0) ? '—' : dlMoney(b.balance); }
function dlMoney(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  const s = Math.abs(v).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? '(' + s + ' €)' : s + ' €';
}

// Kept from v1 exactly as-is (owner instruction 5/9): existing tests assert
// its literal return strings. v2 screens never call this function — its
// wording is dead code by design, not a v2 UI violation. See v2-ui-report.md.
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

// ── v3 formal ledger (#10): cells never carry «€» — but a negative figure
// still needs the accounting parenthesis, just without the currency mark
// dlMoney would add. Used for every ΑΞΙΑ/ΕΛΑΒΕ/ΕΞΟΔΑ/ΥΠΟΛΟΙΠΟ cell in the
// driver card's ledger (opening/closing included); the home mini-table keeps
// dlEur/dlMoney as before (v2, unchanged, still carries €). ──
function dlNumP(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  const s = Math.abs(v).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? '(' + s + ')' : s;
}

// Same ±/U+2212 convention as dlDelta, for a raw period total instead of one
// entry (the ΜΕΤΑΒΟΛΗ cell in the ledger's totals row).
function dlSignedNum(n) {
  const v = Number(n || 0);
  const s = Math.abs(v).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '−' : '+') + s;
}

function dlTypeLabel(t) { return DL_TYPE_LABELS[t] || t; }

// The driver-balance view's type column is NULL for most rows (57/59) —
// unknown is said in words, never guessed as one of the two known values
// (DESIGN.md #3).
function dlTypeWord(t) { return t === 'External' ? 'Εξωτερικός' : t === 'Internal' ? 'Εσωτερικός' : '—'; }

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

// ── Ποια στήλη παίρνει το ποσό κάθε κίνησης — ΕΝΑΣ κανόνας για οθόνη, A4 και CSV ──
// Trip: ΑΞΙΑ/ΕΛΑΒΕ(=advance)/ΕΞΟΔΑ as written (ΑΞΙΑ null while pending).
// Payment: ΕΛΑΒΕ. Adjustment: dl_entries has only a signed `amount` and no
// category (ledger-rules.mjs), so the sign decides the column — positive
// (bonus) under ΑΞΙΑ, negative (deduction) under ΕΛΑΒΕ as a plain positive
// figure. Either way ΜΕΤΑΒΟΛΗ = ΑΞΙΑ + ΕΞΟΔΑ − ΕΛΑΒΕ holds for every row and
// therefore for the totals row too (Figma 600/601:1011 put its two sample
// adjustments under ΑΞΙΑ/ΕΞΟΔΑ by hand — the data cannot tell those apart,
// noted for the owner in DECISION_LOG 14/9). null = «—» in the cell.
function dlEntryAmounts(e) {
  if (e.entry_type === 'trip') return { value: e.pending ? null : e.trip_value, received: e.advance, expenses: e.expenses };
  const a = Number(e.amount || 0);
  if (e.entry_type === 'adjustment') return a > 0 ? { value: a, received: null, expenses: null } : { value: null, received: -a, expenses: null };
  return { value: null, received: a, expenses: null };
}

// ── Περίοδος καρτέλας (v3 #8) — ΜΙΑ συνάρτηση για οθόνη, εκτύπωση A4 και CSV ──
// The card, the A4 statement (print_payroll.html) and the CSV all slice the
// same driver history through here, so the opening balance can never disagree
// between screen and paper (αρχή 3). `entries` is the FULL history of one
// driver (GET /costs/ledger/:id with no year — the year filter would hide the
// movements that make up January's opening balance), in any order.
//   year:  'YYYY' | 'all'      month: '' (whole year) | '01'..'12'
// Returns chronological rows inside the period plus:
//   opening  = running balance after the last movement BEFORE the period (0 if none)
//   closing  = running balance after the last movement IN the period (= opening if none)
//   totals   = live sums for the period (cancelled rows contribute nothing; a
//              pending trip contributes to nothing but pendingCount)
function dlPeriod(entries, year, month) {
  const all = year === 'all';
  const from = all ? null : year + '-' + (month || '01') + '-01';
  // Real last day of the period (Sep = 30, Feb = 28/29): `to` is printed on the
  // A4 statement («Υπόλοιπο τέλους περιόδου (30/09/2026)»), not only compared —
  // measured live 14/9: a fixed «-31» printed 31/09/2026.
  const to = all ? null : (() => { const y = Number(year), m = Number(month || '12'); const d = new Date(Date.UTC(y, m, 0)).getUTCDate(); return year + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); })();
  const chrono = (entries || []).slice().sort((a, b) => a.entry_date === b.entry_date ? Number(a.id) - Number(b.id) : (a.entry_date < b.entry_date ? -1 : 1));
  const rows = chrono.filter(e => (!from || e.entry_date >= from) && (!to || e.entry_date <= to));
  const before = from ? chrono.filter(e => e.entry_date < from) : [];
  const opening = before.length ? Number(before[before.length - 1].running_balance || 0) : 0;
  const closing = rows.length ? Number(rows[rows.length - 1].running_balance || 0) : opening;
  const live = rows.filter(e => !e.cancelled);
  const sum = (list, f) => list.reduce((a, e) => a + Number(f(e) || 0), 0);
  const trips = live.filter(e => e.entry_type === 'trip');
  const totals = {
    trips: trips.length,
    pendingCount: trips.filter(e => e.pending).length,
    value: sum(trips, e => e.trip_value),
    advance: sum(trips, e => e.advance),
    expenses: sum(trips, e => e.expenses),
    payments: sum(live.filter(e => e.entry_type === 'payment_bank' || e.entry_type === 'payment_cash'), e => e.amount),
    adjustments: sum(live.filter(e => e.entry_type === 'adjustment'), e => e.amount),
    delta: sum(live, e => e.balance_delta)
  };
  // Column sums of the live rows exactly as dlEntryAmounts places them — the
  // totals row of the ledger (screen, A4, CSV) adds up column by column.
  const columns = live.reduce((c, e) => { const a = dlEntryAmounts(e); return { value: c.value + Number(a.value || 0), received: c.received + Number(a.received || 0), expenses: c.expenses + Number(a.expenses || 0) }; }, { value: 0, received: 0, expenses: 0 });
  return { from, to, rows, opening, closing, totals, columns };
}

// _dl.view: which of the three v2 screens is on screen. _dl.selected: driver
// highlighted in the home list (right panel preview, no route change).
// _dl.driver/_dl.entries/_dl.rts: the open driver card (screen 2). Since v3
// (#8), _dl.entries is the driver's FULL history (no ?year= on the fetch —
// the year filter would hide the movements a January opening balance needs)
// and _dl.year/_dl.month only slice it client-side via dlPeriod, so changing
// the period never re-fetches.
// _dl.editId: id of the entry row currently inline-edited on screen 2.
// _dl.menuOpenId: id of the entry whose «···» menu is open on screen 2.
// _dl.bulk: state for screen 3, built fresh each time it opens.
// _dl.sort/cardPayId/cardPayMethod/printMenuOpen (Φάση 2, αρχική με κάρτες,
// Figma 614/616:1011) replace the v2 split-view's selected/selLoading/selErr
// — nothing outside the home view ever read those (grep confirmed 14/9). The
// card grid has no «selected row» concept, only a per-driver payment box
// (cardPayId) that opens inline on its own card.
// `monthData` (Φάση 2, αρχική) is the current calendar month's aggregate
// block from the Worker (or null) — NOT the same field as `month` below,
// which is the driver card's own year/month PERIOD SELECTOR ('01'..'12',
// unrelated screen, unchanged). There is no month navigation on the home
// screen any more (owner review 14/9: dead weight, principle 8) — it is
// always today's real month, so nothing here needs a per-month cache.
const _dl = { view: 'home', balances: [], gap: 0, q: '',
  monthData: null, sort: 'balance', pendingFirst: false,
  cardPayId: null, cardPayMethod: 'payment_bank', printMenuOpen: false,
  driver: null, entries: [], rts: [], year: String(new Date().getFullYear()), month: String(new Date().getMonth() + 1).padStart(2, '0'),
  editId: null, menuOpenId: null, bulk: null };

function dlInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase() || '?';
}

// Six sizes, tokens only (DESIGN.md Β/Γ/Δ) — 11/12/13/14/18/28.
function dlStyles() {
  return `<style>
  .dl-page{font-family:'DM Sans',sans-serif;font-size:14px;color:var(--text);background:var(--surface-card);min-height:100%}
  .dl-head{display:flex;align-items:center;gap:8px;padding:0 24px;height:58px;border-bottom:1px solid var(--border)}
  .dl-title{font-family:'Syne',sans-serif;font-size:28px;font-weight:700}
  .dl-sp{flex:1}
  .dl-btn{height:34px;padding:0 16px;border-radius:6px;border:1px solid var(--border);background:var(--surface-card);font:inherit;font-size:13px;font-weight:500;cursor:pointer;color:var(--text)}
  .dl-btn.pri{background:var(--accent);border-color:var(--accent);color:var(--text-on-dark)} .dl-btn.pri:hover{background:var(--accent-hover)}
  .dl-btn:disabled{opacity:.5;cursor:default}
  .dl-search{height:34px;box-sizing:border-box;border:1px solid var(--border);border-radius:6px;padding:0 12px;font:inherit;font-size:12px;margin:12px 16px;width:calc(100% - 32px)}
  .dl-avatar{width:32px;height:32px;border-radius:9999px;background:var(--surface-sunken);color:var(--text-mid);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex:none}
  .dl-hero .dl-avatar{background:var(--surface-dark);color:var(--text-on-dark)}
  .dl-hero{display:flex;align-items:center;gap:20px;padding:20px 24px;border-bottom:1px solid var(--border)}
  .dl-hero-main{display:flex;flex-direction:column;gap:2px}
  .dl-hero-bal{display:flex;flex-direction:column}
  .dl-hero-stat{display:flex;flex-direction:column;gap:2px;padding:0 16px;border-left:1px solid var(--border)}
  .k{font-size:11px;font-weight:500;color:var(--text-dim);text-transform:uppercase;letter-spacing:.03em}
  .v{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
  .v.big{font-size:28px}
  .dl-th{display:flex;height:34px;background:var(--surface-sunken);border-bottom:1px solid var(--border)}
  .dl-th>div,.dl-row>div{padding:0 16px;display:flex;flex-direction:column;justify-content:center;gap:1px;flex:none}
  .dl-th>div{font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--text-mid);text-transform:uppercase}
  .dl-row{display:flex;height:44px;border-bottom:1px solid var(--border)}
  .dl-row.click{cursor:pointer}
  .dl-row.click:hover{background:var(--surface-sunken)}
  .dl-row.qe{background:var(--surface-sunken)}
  .dl-row.edit{background:var(--surface-sunken);box-shadow:inset 3px 0 var(--accent)}
  .dl-row.canc .m,.dl-row.canc .n{text-decoration:line-through;color:var(--text-dim)}
  .dl-row.review{box-shadow:inset 3px 0 var(--warn)}
  .m{font-size:13px;font-weight:700} .s{font-size:11px;color:var(--text-dim)} .n{font-size:13px;font-variant-numeric:tabular-nums;text-align:right}
  .r{align-items:flex-end} .dim{color:var(--text-dim)} .link{color:var(--accent);font-size:12px;text-decoration:none;cursor:pointer}
  .dl-owe{color:var(--ok)} .dl-owed{color:var(--warn)} .dl-neg{color:var(--warn)}
  .dl-rt{color:var(--accent);font-size:11px;margin-left:6px;cursor:default}
  .dl-x{width:24px;height:24px;border:0;background:none;border-radius:9999px;color:var(--text-dim);cursor:pointer;font-size:14px;line-height:1}
  .dl-x:hover{color:var(--danger);background:var(--surface-sunken)}
  .dl-ei{width:100%;height:28px;border:1px solid var(--border);border-radius:6px;padding:0 8px;font:inherit;font-size:13px;box-sizing:border-box}
  .r .dl-ei{text-align:right}
  /* min-height (not a fixed height) + wrap: the v3 card's longer legend text
     (v3 #6 footer) wraps onto two lines at 1280px — a fixed 44px would clip
     it. The v2 bulk-payment footer's short content never grows past 44px,
     so this is a strict generalisation, not a v2 behaviour change. */
  .dl-foot{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;min-height:44px;padding:8px 24px;background:var(--surface-sunken);border-top:1px solid var(--border);font-size:12px;color:var(--text-mid);position:sticky;bottom:0}
  .dl-foot b{color:var(--text);font-size:13px;font-variant-numeric:tabular-nums}
  .dl-bulk-ctrl{display:flex;align-items:flex-end;gap:16px;padding:16px 24px;border-bottom:1px solid var(--border);flex-wrap:wrap}
  .dl-overlay{position:fixed;inset:0;background:var(--text-dim);opacity:.6;z-index:60;display:none} .dl-overlay.open{display:block}
  .dl-modal{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:420px;max-height:90vh;overflow:auto;background:var(--surface-card);border-radius:6px;padding:24px;z-index:61;display:none;box-shadow:0 8px 24px rgba(0,0,0,.18)} .dl-modal.open{display:block}
  .dl-f{display:flex;flex-direction:column;gap:6px;flex:1} .dl-f label{font-size:12px;color:var(--text-mid)} .dl-f input,.dl-f select{height:36px;border:1px solid var(--border);border-radius:6px;padding:0 12px;font:inherit;font-size:13px;box-sizing:border-box}
  .dl-fr{display:flex;gap:16px;margin-bottom:16px}
  .dl-seg{display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden} .dl-seg button{flex:1;height:36px;border:0;background:none;font:inherit;font-size:13px;color:var(--text-mid);cursor:pointer} .dl-seg button.on{background:var(--surface-dark);color:var(--text-on-dark);font-weight:500}
  .dl-err{color:var(--danger);font-size:12px;margin-top:8px}
  .dl-cc{color:var(--text-dim);font-weight:400}
  .dl-sep{color:var(--text-dim);font-weight:600;padding:0 4px}
  /* Leg block under a trip entry (owner 5/9): the border that used to close
     the row now closes the whole entry, so the legs read as part of it, not
     a divider from the next row. .rt-legs/.rt-* come from assets/style.css —
     one leg renderer shared with the entity card (core/utils.js:rtLegBlockHtml). */
  .dl-entry{border-bottom:1px solid var(--border)}
  .dl-entry .dl-row{border-bottom:0}
  .dl-entry-legs{padding:2px 16px 10px 0}
  /* ── v3 driver card (#10 formal ledger style, exStyles-derived) — scoped to
     .dl-hero/.dl-ledger so the v2 home list and bulk-payment screen (still
     .dl-btn/.dl-row at their v2 sizes) are untouched. ── */
  /* Long driver names (two words of 12+ Greek letters are common) may wrap —
     the balance figure and the five action buttons must not: measured on the
     rig 14/9, «Παπαδόπουλος Γιώργος» pushed «330,00 €» and «Εκτύπωση καρτέλας»
     onto two lines each. */
  .dl-hero .dl-btn{height:32px;white-space:nowrap;flex:none}
  .dl-hero .dl-title{font-size:24px;line-height:1.15}
  .dl-hero-main{min-width:0}
  .dl-hero-bal .v.big{white-space:nowrap}
  .dl-btn.primary{background:var(--navy);border-color:var(--navy);color:var(--text-on-dark)}
  .dl-btn.primary:hover{background:var(--navy-hover)}
  .dl-word{font-size:12px;color:var(--warn);font-weight:500;margin-left:6px}
  /* Year chips + month select + «Όλο το έτος» reset (Figma 600:1011 note 3,
     owner correction 14/9: chips, not a <select>, for the year). */
  .dl-period{display:flex;align-items:center;gap:8px;padding:12px 24px;flex-wrap:wrap}
  .dl-period select{height:32px;border:1px solid var(--border);border-radius:6px;padding:0 10px;font:inherit;font-size:13px;background:var(--surface-card);color:var(--text)}
  .dl-ychip{height:32px;padding:0 14px;border:1px solid var(--border);border-radius:6px;background:var(--surface-card);font:inherit;font-size:13px;color:var(--text-mid);cursor:pointer}
  .dl-ychip.sel{background:var(--navy);border-color:var(--navy);color:var(--text-on-dark);font-weight:600}
  .dl-period-label{font-size:12px;color:var(--text-mid)}
  /* Year stat boxes (correction #2) — same .k/.v tokens as the old v2
     hero-stat boxes, just in their own row under the hero. */
  .dl-stats{display:flex;gap:24px;padding:4px 24px 16px;flex-wrap:wrap}
  .dl-stats .box{display:flex;flex-direction:column;gap:2px}
  .dl-ledger .dl-th{height:32px;border-bottom:2px solid var(--border-mid,var(--border))}
  .dl-ledger .dl-row{height:40px}
  .dl-ledger .dl-row.opening{background:var(--surface-sunken)}
  .dl-ledger .dl-row.opening .m{font-weight:600}
  .dl-ledger .dl-row.pending{border-left:3px solid var(--warn)}
  .dl-ledger .dl-row.dl-totals{border-top:3px double var(--border-mid,var(--border))}
  .dl-ledger .dl-row.dl-totals .m,.dl-ledger .dl-row.dl-totals .n{font-weight:700}
  /* «···» menu (v3 #7, replaces the permanent «×») — anchored to its own
     32px cell so it never shifts the row's own layout when it opens. Each
     item is two lines (Figma 600:1011 note 6): a title and a one-line
     explanation — only the Ακύρωση title itself is red, never its subtitle. */
  .dl-more{width:24px;height:24px;border:0;background:none;border-radius:4px;color:var(--text-dim);cursor:pointer;font-size:14px;line-height:1}
  .dl-more:hover{background:var(--surface-sunken);color:var(--text)}
  .dl-menu{position:absolute;right:0;top:100%;z-index:20;min-width:200px;background:var(--surface-card);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow-md,0 4px 12px rgba(0,0,0,.12));display:flex;flex-direction:column;padding:4px;text-align:left}
  .dl-menu button{display:flex;flex-direction:column;align-items:flex-start;gap:1px;background:none;border:0;text-align:left;padding:6px 10px;font:inherit;cursor:pointer;border-radius:4px}
  .dl-menu button:hover{background:var(--surface-sunken)}
  .dl-menu-t{font-size:12.5px;color:var(--text)}
  .dl-menu-s{font-size:10.5px;color:var(--text-dim)}
  .dl-menu-cancel .dl-menu-t{color:var(--danger)}
  /* ── αρχική με κάρτες (Φάση 2, Figma 614/616:1011) — formal KPI μπάρα αντί
     για τη λωρίδα μηνών/chips (owner review 14/9: καμία επιλογή μήνα πια, ο
     μήνας είναι πάντα ο τρέχων): πλακίδια λευκά με λεπτό περίγραμμα, χωρίς
     σκιά, tokens μόνο· navy μόνο στο κύριο κουμπί (.dl-btn.primary) και στο
     ενεργό πλακίδιο ταξινόμησης (.dl-kpi-tile.on — περίγραμμα, όχι γέμισμα,
     η κάρτα δεν είναι επιλέξιμη γραμμή). ── */
  .dl-kpi{display:flex;gap:12px;padding:16px 24px 8px;flex-wrap:wrap}
  .dl-kpi-tile{flex:1;min-width:150px;background:var(--surface-card);border:1px solid var(--border);border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:4px}
  .dl-kpi-tile .v{font-family:'Syne',sans-serif;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
  .dl-kpi-tile[data-kpi="pending"]{cursor:pointer}
  .dl-kpi-tile[data-kpi="pending"] .v{color:var(--warn)}
  .dl-kpi-tile.on{border-color:var(--navy)}
  .dl-kpi-tile.on .k{color:var(--navy)}
  .dl-kpi-foot{display:flex;align-items:center;gap:10px;padding:4px 24px 12px;flex-wrap:wrap;border-bottom:1px solid var(--border)}
  .dl-kpi-sub{font-size:12px;color:var(--text-mid)}
  .dl-kpi-foot select{height:32px;border:1px solid var(--border);border-radius:6px;padding:0 10px;font:inherit;font-size:12px;background:var(--surface-card);color:var(--text)}
  .dl-kpi-foot .dl-search{margin:0;width:200px}
  .dl-note{padding:6px 24px;font-size:12px;color:var(--warn)}
  /* Inactive drivers never become a card (owner review 14/9) but a real
     balance must stay visible somewhere (αρχή 1) — one grey line inside the
     sticky footer, not a silent drop. width:100% forces its own line inside
     .dl-foot's flex-wrap without touching that shared rule (driver/bulk views). */
  .dl-foot-inactive{width:100%;font-size:11px;color:var(--text-dim)}
  /* Fixed column count, never auto-fill (coordinator review 14/9 on the owner's
     wide Chrome: auto-fill gave 6 columns of ~190px and cut the names to
     «Papatheoc…»). Figma 614:1011 is 4 columns of ~268px at 1440; 3 fit at
     1280, 5 from 1700 up. minmax(0,1fr) so a long name can never widen a track. */
  .dl-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;padding:16px 24px}
  @media (max-width:1320px){.dl-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media (min-width:1700px){.dl-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}
  /* Owner correction 14/9 (μετά το Figma frame): η 3px άνω άκρη υπάρχει ΠΑΝΤΑ,
     όχι μόνο σε εκκρεμότητα — «να δείχνει σχεδιασμένη κι όταν είναι εντάξει».
     Γαλάζιο token: --accent-light είναι rgba wash (ακατάλληλο για περίγραμμα),
     και το γαλάζιο hex της πλαϊνής μπάρας δεν υπάρχει πουθενά ως global token
     (μόνο τοπικά, επαναλαμβανόμενο ως κυριολεκτικό hex σε άλλα modules) —
     άρα var(--accent) όπως προβλέπει η ίδια η ανάθεση όταν δεν βρεθεί token. */
  /* Top edge ALWAYS on (owner 14/9 «να δείχνει σχεδιασμένη κι όταν είναι εντάξει»):
     the sidebar's light blue (--panel-accent) when nothing is pending,
     amber when a trip still has no value. */
  .dl-card{position:relative;border:1px solid var(--border);border-top:3px solid var(--panel-accent,var(--accent));border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--surface-card)}
  .dl-card.pending{border-top-color:var(--warn)}
  /* 268px cards at 1440 (4 columns beside the sidebar): the stat labels and
     the two action buttons must stay on one line — measured 14/9, «ΔΡΟΜ. ΜΗΝΑ»
     and «Καρτέλα →» each wrapped onto two lines. */
  .dl-card .k{white-space:nowrap}
  .dl-card .dl-btn{white-space:nowrap;padding:0 10px}
  /* Name first, balance second: the header wraps, so a long name keeps its
     whole line and the balance drops to a second row (right-aligned) instead
     of squeezing the name into an ellipsis. ≤22 characters (DM Sans 600 14)
     never truncate at the 268px card; the ellipsis stays only as a last
     resort for names longer than the card itself. */
  .dl-card-top{display:flex;flex-wrap:nowrap;align-items:flex-start;gap:10px}
  .dl-card .dl-avatar{width:36px;height:36px;font-size:12px}
  .dl-card-id{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}
  /* The balance sits in the SAME place on every card — top right, on the
     avatar's line (owner 14/9: «άλλες φορές το ποσό είναι πάνω, άλλες κάτω»
     — the earlier flex-wrap dropped it under 5/49 long names). The name wraps
     inside its own column instead, up to two lines, never an ellipsis —
     breaking at spaces, inside a word only when a single word cannot fit. */
  .dl-card-id .m{white-space:normal;overflow-wrap:break-word;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .dl-bal-wrap{display:flex;flex-direction:column;align-items:flex-end;text-align:right;flex:none;margin-left:auto;min-width:96px}
  .dl-bal{font-family:'Syne',sans-serif;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
  .dl-balword{font-size:11px;font-weight:500;color:var(--text-dim)}
  .dl-balword.dl-owe{color:var(--ok)} .dl-balword.dl-owed{color:var(--warn)}
  .dl-card .dl-ms{display:flex;gap:14px}
  .dl-card .dl-ms .box{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}
  .dl-lastpay{font-size:11px;color:var(--text-dim)}
  .dl-card-actions{display:flex;align-items:center;gap:8px}
  .dl-badge{font-size:11px;font-weight:500;color:var(--warn);border:1px solid var(--warn);border-radius:9999px;padding:2px 8px;white-space:nowrap}
  .dl-card-pay,.dl-card-open{white-space:nowrap;height:28px;padding:0 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface-card);font:inherit;font-size:12px;color:var(--text);cursor:pointer}
  .dl-card-pay:hover,.dl-card-open:hover{background:var(--surface-sunken)}
  .dl-cardpay{margin-top:2px;padding-top:10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px}
  .dl-cp-date,.dl-cp-amount{height:30px;box-sizing:border-box;border:1px solid var(--border);border-radius:6px;padding:0 10px;font:inherit;font-size:12px;width:100%}
  .dl-cp-actions{display:flex;gap:8px}
  .dl-cp-save{height:30px;padding:0 14px;border-radius:6px;border:1px solid var(--navy);background:var(--navy);color:var(--text-on-dark);font:inherit;font-size:12px;font-weight:500;cursor:pointer;flex:1}
  .dl-cp-cancel{height:30px;padding:0 14px;border-radius:6px;border:1px solid var(--border);background:none;font:inherit;font-size:12px;color:var(--text-mid);cursor:pointer}
  </style>`;
}

// ── κοινός renderer γραμμής κίνησης της καρτέλας (v3 ledger) ──
// Μέχρι τη Φάση 2 δεχόταν ένα δεύτερο όρισμα για το μικρό, συνοπτικό μοτίβο
// στηλών της παλιάς (v2) split-view αρχικής — έφυγε μαζί με εκείνη την
// αρχική (Figma 614:1011, η νέα αρχική με κάρτες δεν καλεί πια αυτή τη
// συνάρτηση καθόλου), οπότε αφαιρέθηκε ως νεκρός κώδικας (CLAUDE.md αρχή 8)
// χωρίς να αλλάξει τίποτα στη συμπεριφορά που μένει — αυτή ήταν πάντα η
// μοναδική πλήρης διαδρομή της καρτέλας.
function dlEntryRowHtml(e) {
  const wDate = 100, wMoney = 110, wTotal = 130;
  const isTrip = e.entry_type === 'trip';
  const dateTxt = dlDateRange(e.entry_date, e.date_end);
  // Leg block (owner 5/9): route detail moves BELOW the header row as one row
  // per leg — see assets/style.css .rt-legs and core/utils.js:rtLegBlockHtml
  // (shared with the entity card). route_text is only what's left to show
  // when the view has no legs — hand-written routes never had legs to begin with.
  const hasLegs = isTrip && Array.isArray(e.route_legs) && e.route_legs.length > 0;
  const routeText = isTrip
    ? (hasLegs ? '' : e.route_text ? escapeHtml(e.route_text) : '—')
    : (e.entry_type === 'payment_bank' ? 'Κατάθεση τράπεζας' : e.entry_type === 'payment_cash' ? 'Πληρωμή μετρητά'
      // Figma 600:1011: an adjustment reads «Προσαρμογή — <reason>» — the reason
      // IS the entry (there is no route or bank to identify it by).
      : 'Προσαρμογή' + (e.note ? ' — ' + escapeHtml(e.note) : ''));
  // RT link: icon only, no visible code (v2 rule #2) — the code sits in title.
  const rtIcon = (isTrip && e.rt_id) ? `<span class="dl-rt" title="${escapeHtml(e.rt_code || '')}">↗</span>` : '';
  // v3 #9: a valueless trip carries a visible word on the card, not only the
  // amber bar and the ΑΞΙΑ dash.
  const pendingWord = (isTrip && e.pending) ? ` <span class="dl-word">χωρίς αξία</span>` : '';
  const legsHtml = hasLegs ? `<div class="dl-entry-legs" style="margin-left:${wDate + 16}px">${rtLegBlockHtml(e.route_legs)}</div>` : '';
  const wrap = row => hasLegs ? `<div class="dl-entry">${row}${legsHtml}</div>` : row;

  if (e.cancelled) {
    return wrap(`<div class="dl-row canc" data-entry="${e.id}" title="${escapeHtml(e.deleted_reason || '')}">
      <div style="width:${wDate}px"><span style="font-size:12px;font-variant-numeric:tabular-nums">${dateTxt}</span></div>
      <div style="flex:1"><span class="m">${routeText}</span></div>
      <div style="width:${wMoney}px" class="r"><span class="n">—</span></div>
      <div style="width:${wMoney}px" class="r"><span class="n">—</span></div>
      <div style="width:${wMoney}px" class="r"><span class="n">—</span></div>
      <div style="width:120px" class="r"><span class="n">—</span></div>
      <div style="width:${wTotal}px" class="r"><span class="n">—</span></div>
      <div style="width:32px"></div>
    </div>`);
  }

  if (_dl.editId === e.id) {
    return wrap(`<div class="dl-row edit" data-entry="${e.id}">
      <div style="width:100px"><span style="font-size:12px;font-variant-numeric:tabular-nums">${dateTxt}</span></div>
      <div style="flex:1"><span class="m">${routeText}</span></div>
      <div style="width:110px" class="r"><input class="dl-ei" type="number" step="0.01" id="dlEiValue" value="${e.trip_value ?? ''}" onkeydown="dlEiKeydown(event,${e.id})"></div>
      <div style="width:110px" class="r"><input class="dl-ei" type="number" step="0.01" id="dlEiAdvance" value="${e.advance ?? ''}" onkeydown="dlEiKeydown(event,${e.id})"></div>
      <div style="width:110px" class="r"><input class="dl-ei" type="number" step="0.01" id="dlEiExpenses" value="${e.expenses ?? ''}" onkeydown="dlEiKeydown(event,${e.id})"></div>
      <div style="width:120px" class="r"><span class="n dim">—</span></div>
      <div style="width:130px" class="r"><span class="n dim">—</span></div>
      <div style="width:32px"></div>
    </div>`);
  }

  // v3 #10: the card's cells never carry «€» (dlNumP).
  const amt = n => dlNumP(n);
  const bal = n => dlNumP(n);
  const ea = dlEntryAmounts(e);
  const valueCell = (isTrip && e.pending)
    ? `<span class="n" style="color:var(--warn)">—</span>`
    : `<span class="n${ea.value == null ? ' dim' : ''}">${amt(ea.value)}</span>`;
  const advCell = `<span class="n${ea.received == null ? ' dim' : ''}">${amt(ea.received)}</span>`;
  const expCell = `<span class="n${ea.expenses == null ? ' dim' : ''}">${amt(ea.expenses)}</span>`;
  const balCell = (isTrip && e.pending)
    ? `<span class="n" style="color:var(--warn)">—</span>`
    : `<span class="n ${Number(e.balance_delta) < 0 ? 'dl-owed' : 'dl-owe'}">${dlDelta(e)}</span>`;
  const totalCell = `<span class="n">${bal(e.running_balance)}</span>`;
  // v3 #7: the permanent «×» and whole-row click are gone — a «···» menu
  // (Διόρθωση/Ακύρωση) replaces both.
  const moreCell = dlMoreCellHtml(e, isTrip);
  const pendingCls = (isTrip && e.pending) ? ' pending' : '';

  return wrap(`<div class="dl-row${pendingCls}${e.needs_review ? ' review' : ''}${e.entry_type !== 'trip' ? ' pay' : ''}" data-entry="${e.id}" title="${e.needs_review ? escapeHtml(e.review_note || '') : ''}">
    <div style="width:${wDate}px"><span style="font-size:12px;font-variant-numeric:tabular-nums">${dateTxt}</span></div>
    <div style="flex:1"><span class="m" style="font-weight:${isTrip ? 500 : 400}">${routeText}</span>${rtIcon}${pendingWord}</div>
    <div style="width:${wMoney}px" class="r">${valueCell}</div>
    <div style="width:${wMoney}px" class="r">${advCell}</div>
    <div style="width:${wMoney}px" class="r">${expCell}</div>
    <div style="width:120px" class="r">${balCell}</div>
    <div style="width:${wTotal}px" class="r">${totalCell}</div>
    ${moreCell}
  </div>`);
}

// «···» menu cell (v3 #7, Figma 600:1011 note 6): each item carries a one-line
// subtitle explaining what it does — Διόρθωση only for a trip (the only entry
// type with inline-editable amounts), Ακύρωση on every live row. Only the
// word «Ακύρωση» itself is red, not its subtitle (dl-menu-t vs dl-menu-s).
function dlMoreCellHtml(e, isTrip) {
  const open = _dl.menuOpenId === e.id;
  const item = (cls, title, sub, fn) => `<button type="button" class="${cls}" onclick="event.stopPropagation();${fn}(${e.id})"><span class="dl-menu-t">${title}</span><span class="dl-menu-s">${sub}</span></button>`;
  const editItem = isTrip ? item('dl-menu-edit', 'Διόρθωση', 'Αλλαγή αξίας, εξόδων ή ποσού', 'dlMenuEdit') : '';
  const menu = open ? `<div class="dl-menu">${editItem}${item('dl-menu-cancel', 'Ακύρωση', 'Παραμένει στο ιστορικό ως ακυρωμένη', 'dlMenuCancel')}</div>` : '';
  return `<div style="width:32px;position:relative" class="r">
    <button type="button" class="dl-more" title="Επιλογές" onclick="event.stopPropagation();dlToggleMenu(${e.id})">···</button>
    ${menu}
  </div>`;
}

// ═══════════════════ ΟΘΟΝΗ 1 — ΑΡΧΙΚΗ ═══════════════════

async function renderPayroll() {
  const c = document.getElementById('content');
  if (can('costs') === 'none') { c.innerHTML = showAccessDenied(); return; }
  c.style.padding = '0';
  _dl.view = 'home'; _dl.entries = []; _dl.q = ''; _dl.sort = 'balance'; _dl.pendingFirst = false;
  _dl.cardPayId = null; _dl.printMenuOpen = false;
  c.innerHTML = dlStyles() + '<div class="dl-page"><div style="padding:32px;color:var(--text-mid)">Φόρτωση καρτελών…</div></div>';
  try {
    await dlReloadBalances();
  } catch (e) {
    c.innerHTML = dlStyles() + '<div class="dl-page">' + showError('Οι καρτέλες οδηγών δεν φορτώθηκαν: ' + e.message) + '</div>';
    return;
  }
  dlRenderHome();
}

// Balances list is stale the moment any ledger write lands: shared by every
// write path so none of them can drift back to an old copy. Since Φάση 2
// (αρχική με κάρτες) this ONE request also carries ?month=<τρέχων μήνας> and
// stashes the extra `month` block it comes back with (Worker ledger-month.mjs)
// in _dl.monthData — a separate second GET would defeat the point of the
// Worker aggregating it server-side in the same round trip. Owner review
// 14/9: the home screen shows ONLY the real current calendar month, never a
// picked one — so there is nothing to cache across calls, every reload just
// asks again for whatever «now» is.
async function dlReloadBalances() {
  const r = await ctFetch('/costs/ledger?month=' + dlCurrentMonth());
  _dl.balances = r.records || []; _dl.gap = r.gap || 0;
  _dl.monthData = r.month || null; // null = ο Worker δεν το δίνει ακόμη (αρχή 1: ορατό, όχι σιωπή)
}

// 'YYYY-MM' του πραγματικού σημερινού μήνα — για το ?month= του fetch ΚΑΙ
// για τον υπότιτλο .dl-kpi-sub (με λέξεις, μέσω DL_MONTHS πιο κάτω στο αρχείο).
function dlCurrentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function dlSetSort(s) { _dl.sort = s; dlRenderHome(); }
// «Χωρίς αξία» δεν είναι ένα φίλτρο εύρους — είναι ένα ανεξάρτητο πλακίδιο
// ταξινόμησης που ανοιγοκλείνει (συμβόλαιο: «ενεργό = ΤΑΞΙΝΟΜΕΙ πρώτους τους
// εκκρεμείς, δεν κρύβει»), άρα δικό του boolean state, όχι μια τιμή του #dlSort.
function dlTogglePendingFirst() { _dl.pendingFirst = !_dl.pendingFirst; dlRenderHome(); }
function dlTogglePrintMenu() { _dl.printMenuOpen = !_dl.printMenuOpen; dlRenderHome(); }

// Ενιαία πηγή αλήθειας για ποιοι οδηγοί/με ποια σειρά φαίνονται στο πλέγμα —
// dlRenderHome (το πλέγμα) ΚΑΙ dlHomeNewTrip (ο πρώτος ορατός οδηγός) περνούν
// ΚΑΙ οι δύο από εδώ, ώστε το «Δρομολόγιο» να ανοίγει πάντα την ΠΡΩΤΗ κάρτα
// που βλέπει ο χρήστης, όχι μια σειρά υπολογισμένη ξεχωριστά αλλού (αρχή 3).
// Owner review 14/9: μόνο ενεργοί ΜΕ κίνηση φαίνονται πια σαν κάρτες — οι
// ανενεργοί με υπόλοιπο αναφέρονται αλλού (dlRenderHome, .dl-foot-inactive).
function dlHomeGroups() {
  const q = _dl.q.trim().toLowerCase();
  const base = _dl.balances.filter(b => b.active !== false && b.has_entries);
  const searched = q ? base.filter(b => String(b.full_name).toLowerCase().includes(q)) : base;
  const sortKey = _dl.pendingFirst ? 'pending' : _dl.sort;
  const cmp = {
    balance: (a, b) => Number(b.balance) - Number(a.balance),
    name: (a, b) => String(a.full_name).localeCompare(String(b.full_name), 'el'),
    pending: (a, b) => (Number(b.pending_count || 0) - Number(a.pending_count || 0)) || Number(b.balance) - Number(a.balance)
  }[sortKey] || ((a, b) => Number(b.balance) - Number(a.balance));
  return searched.slice().sort(cmp);
}

// Re-render on each keystroke rebuilds the input, which resets the caret to
// the end unless the position is restored explicitly.
function dlSearchInput(el) {
  const pos = el.selectionStart;
  _dl.q = el.value;
  dlRenderHome();
  const s = document.getElementById('dlSearch');
  if (s) { s.focus(); s.setSelectionRange(pos, pos); }
}

// Ανοίγει/κλείνει την ενσωματωμένη φόρμα πληρωμής ΜΕΣΑ στην κάρτα του οδηγού
// — ένα scalar state εγγυάται «μία τη φορά». Το v2 όνομα (dlSelectDriver)
// έμεινε αμετάβλητο (συμβόλαιο)· ο ρόλος του άλλαξε από «δείξε προεπισκόπηση
// σε πλαϊνό πάνελ» (split-view, Figma 596, απορρίφθηκε) σε «διάλεξε ποιον
// πληρώνεις» — και τα δύο είναι «επίλεξε έναν οδηγό», απλώς η κάρτα αντικατέστησε τη γραμμή.
function dlSelectDriver(driverId) {
  _dl.cardPayId = (_dl.cardPayId === driverId) ? null : driverId;
  _dl.cardPayMethod = 'payment_bank';
  dlRenderHome();
}

function dlRenderHome() {
  const c = document.getElementById('content');
  // «Ενεργοί οδηγοί» = ακριβώς οι οδηγοί που φαίνονται σαν κάρτες (active &&
  // has_entries) — μία βάση, όχι δύο αριθμοί που θα μπορούσαν να διαφωνήσουν
  // (αρχή 3). Ο ανενεργός-με-υπόλοιπο πάει στο footer, όχι εδώ.
  const activeDrivers = _dl.balances.filter(b => b.active !== false && b.has_entries);
  const sumBalance = activeDrivers.reduce((a, b) => a + Number(b.balance || 0), 0);
  const totalPending = activeDrivers.reduce((a, b) => a + Number(b.pending_count || 0), 0);
  const monthData = _dl.monthData;
  const monthAvailable = !!monthData;
  const monthTrips = monthAvailable ? activeDrivers.reduce((a, b) => a + Number((monthData.drivers[b.driver_id] || {}).trips || 0), 0) : null;
  const monthPayments = monthAvailable ? activeDrivers.reduce((a, b) => a + Number((monthData.drivers[b.driver_id] || {}).payments || 0), 0) : null;
  const cm = dlCurrentMonth();
  const monthLabel = DL_MONTHS[Number(cm.slice(5, 7)) - 1] + ' ' + cm.slice(0, 4);

  // Ανενεργοί που ακόμη χρωστούν/τους χρωστάμε: ΔΕΝ γίνονται κάρτα (owner
  // review 14/9), αλλά ένα υπόλοιπο που υπάρχει δεν πρέπει να εξαφανίζεται
  // σιωπηλά (αρχή 1) — μία γραμμή στο footer τους μετράει.
  const inactiveWithBalance = _dl.balances.filter(b => b.active === false && Number(b.balance || 0) !== 0);
  const inactiveSum = inactiveWithBalance.reduce((a, b) => a + Number(b.balance || 0), 0);

  const scope = dlHomeGroups();
  const gridHtml = scope.length
    ? scope.map(b => dlHomeCardHtml(b, monthAvailable, monthData)).join('')
    : showEmpty({ title: 'Κανένας οδηγός', description: 'Άλλαξε αναζήτηση.' });

  c.innerHTML = dlStyles() + `<div class="dl-page">
    <div class="dl-head"><span class="dl-title">Μισθοδοσία Οδηγών</span><span class="dl-sp"></span>
      <button id="dlBtnBulk" class="dl-btn primary" onclick="renderPayrollBulk()">Μαζική πληρωμή</button>
      <button id="dlBtnTripHome" class="dl-btn" onclick="dlHomeNewTrip()">Δρομολόγιο</button>
      <span style="position:relative" data-print-wrap>
        <button id="dlBtnPrintHome" class="dl-btn" onclick="event.stopPropagation();dlTogglePrintMenu()">Εκτύπωση ▾</button>
        ${_dl.printMenuOpen ? `<div class="dl-menu"><button type="button" class="dl-menu-print-drivers" onclick="_dl.printMenuOpen=false;dlPrintDrivers()">Κατάσταση οφειλών οδηγών</button></div>` : ''}
      </span>
      <button id="dlBtnCsvHome" class="dl-btn" onclick="dlCsvDrivers(_dl.balances.filter(b => b.active !== false))">CSV</button>
    </div>
    <div class="dl-kpi">
      <div class="dl-kpi-tile" data-kpi="owed"><div class="k">Οφειλή σήμερα</div><div class="v">${dlEur(sumBalance)}</div></div>
      <div class="dl-kpi-tile" data-kpi="trips"><div class="k">Δρομολόγια μήνα</div><div class="v">${monthAvailable ? monthTrips : '—'}</div></div>
      <div class="dl-kpi-tile${_dl.pendingFirst ? ' on' : ''}" data-kpi="pending" onclick="dlTogglePendingFirst()"><div class="k">Χωρίς αξία</div><div class="v">${totalPending}</div></div>
      <div class="dl-kpi-tile" data-kpi="payments"><div class="k">Πληρωμές μήνα</div><div class="v">${monthAvailable ? dlEur(monthPayments) : '—'}</div></div>
      <div class="dl-kpi-tile" data-kpi="active"><div class="k">Ενεργοί οδηγοί</div><div class="v">${activeDrivers.length}</div></div>
    </div>
    <div class="dl-kpi-foot">
      <span class="dl-kpi-sub">${escapeHtml(monthLabel)}</span>
      <span class="dl-sp"></span>
      <select id="dlSort" onchange="dlSetSort(this.value)">
        <option value="balance"${_dl.sort === 'balance' ? ' selected' : ''}>Οφειλή φθίνουσα</option>
        <option value="name"${_dl.sort === 'name' ? ' selected' : ''}>Όνομα</option>
        <option value="pending"${_dl.sort === 'pending' ? ' selected' : ''}>Χωρίς αξία</option>
      </select>
      <input id="dlSearch" class="dl-search" placeholder="Αναζήτηση οδηγού…" value="${escapeHtml(_dl.q)}" oninput="dlSearchInput(this)">
    </div>
    ${monthAvailable ? '' : `<div class="dl-note">Δεν φορτώθηκαν τα ποσά μήνα — ο διακομιστής δεν υποστηρίζει ακόμη τον μήνα</div>`}
    <div class="dl-grid">${gridHtml}</div>
    <div class="dl-foot">
      <span><b>${activeDrivers.length}</b> οδηγοί</span><span>·</span>
      <span><b>${totalPending}</b> δρομολόγια χωρίς αξία</span><span>·</span>
      <span>οφειλή <b>${dlMoney(sumBalance)}</b> ${escapeHtml(dlBalanceWord(sumBalance).text)}</span>
      <span class="dl-sp"></span>
      <span>Ποσά σε ευρώ. Υπόλοιπο = συνολικό έως σήμερα · μήνας (${escapeHtml(monthLabel)}) = κινήσεις με ημερομηνία μέσα σε αυτόν</span>
      ${inactiveWithBalance.length ? `<div class="dl-foot-inactive">+ ${inactiveWithBalance.length} ανενεργοί με υπόλοιπο ${dlMoney(inactiveSum)}, βλ. κατάσταση οφειλών</div>` : ''}
    </div>
  </div>`;
}

// Αριθμός/λέξη στο υπόλοιπο της κάρτας (Figma 616:1011 #5): ένα υπόλοιπο 0
// μόνο επειδή κάθε δρομολόγιο είναι ακόμη χωρίς αξία είναι άγνωστο, όχι
// τακτοποιημένο — ίδια διάκριση με το dlBal, απλώς με τη λέξη του
// dlBalanceWord αντί για το μονό «—» του dlBal (dlNumP-στυλ: χωρίς «€»,
// παρένθεση στο αρνητικό, όπως ο πίνακας της καρτέλας).
function dlCardBalance(b) {
  if (Number(b.balance) === 0 && b.pending_count > 0) return { num: '—', word: 'χωρίς αξία', cls: 'dl-owed' };
  const w = dlBalanceWord(b.balance);
  return { num: dlNumP(b.balance), word: w.text, cls: w.cls };
}

// Γραμμή «Τελ. πληρωμή» — τρεις καταστάσεις, όχι δύο: (1) πληρωμή ΜΕΣΑ στο
// μήνα με γνωστό ποσό (month.drivers[id].last_payment), (2) καμία πληρωμή
// αυτόν τον μήνα αλλά υπάρχει παλαιότερη (από το ισοζύγιο του οδηγού, χωρίς
// ποσό εκεί), ή (3) καμία ποτέ. Όταν το endpoint μήνα δεν είναι ακόμη ζωντανό,
// μόνο το ισοζύγιο είναι γνωστό — τέταρτος κλάδος, όχι μάντεμα ντυμένο σαν το
// (2) (item 5 της ανάθεσης).
function dlHomeLastPayLine(b, monthAvailable, monthly) {
  if (monthAvailable) {
    if (monthly && monthly.last_payment) {
      return 'Τελ. πληρωμή ' + dlDateRange(monthly.last_payment.date, null) + ' · ' + dlTypeLabel(monthly.last_payment.type) + ' ' + dlNum(monthly.last_payment.amount);
    }
    // «Καμία πληρωμή τον μήνα» is the sentence regardless of whether an
    // earlier payment exists at all — the «· τελ. DD/MM» suffix only adds a
    // reference date when the driver's own balance record actually has one.
    return b.last_payment_date ? ('Καμία πληρωμή τον μήνα · τελ. ' + dlDateRange(b.last_payment_date, null)) : 'Καμία πληρωμή τον μήνα';
  }
  return b.last_payment_date ? ('Τελ. πληρωμή ' + dlDateRange(b.last_payment_date, null) + ' · ' + dlTypeLabel(b.last_payment_type)) : 'Καμία πληρωμή';
}

function dlHomeCardHtml(b, monthAvailable, monthData) {
  const pendingN = Number(b.pending_count || 0);
  const isPending = pendingN > 0;
  const bal = dlCardBalance(b);
  const monthly = monthAvailable ? (monthData.drivers[b.driver_id] || { trips: 0, value: 0, payments: 0 }) : null;
  const msTrips = monthAvailable ? String(monthly.trips) : '—';
  const msValue = monthAvailable ? dlNum(monthly.value) : '—';
  const msPayments = monthAvailable ? dlNum(monthly.payments) : '—';
  return `<div class="dl-card${isPending ? ' pending' : ''}" data-driver="${b.driver_id}">
    <div class="dl-card-top">
      <div class="dl-avatar">${escapeHtml(dlInitials(b.full_name))}</div>
      <div class="dl-card-id"><span class="m">${escapeHtml(b.full_name)}</span>${(b.type === 'External' || b.type === 'Internal') ? `<span class="s">${dlTypeWord(b.type)}</span>` : ''}</div>
      <div class="dl-bal-wrap"><span class="dl-bal">${bal.num}</span><span class="dl-balword ${bal.cls}">${escapeHtml(bal.word)}</span></div>
    </div>
    <div class="dl-ms">
      <div class="box"><div class="k">Δρομ. μήνα</div><div class="v">${msTrips}</div></div>
      <div class="box"><div class="k">Αξία</div><div class="v">${msValue}</div></div>
      <div class="box"><div class="k">Πληρωμές</div><div class="v">${msPayments}</div></div>
    </div>
    <div class="dl-lastpay">${escapeHtml(dlHomeLastPayLine(b, monthAvailable, monthly))}</div>
    <div class="dl-card-actions">
      ${isPending ? `<span class="dl-badge">${pendingN} χωρίς αξία</span>` : ''}
      <span class="dl-sp"></span>
      <button type="button" class="dl-card-pay" onclick="dlSelectDriver(${b.driver_id})">Πληρωμή</button>
      <button type="button" class="dl-card-open" onclick="renderPayrollDriver(${b.driver_id})">Καρτέλα →</button>
    </div>
    ${_dl.cardPayId === b.driver_id ? dlHomeRightHtml(b.driver_id) : ''}
  </div>`;
}

// Ενσωματωμένη φόρμα πληρωμής ΜΕΣΑ στην κάρτα (item 5.«πληρωμή στην κάρτα»
// της ανάθεσης) — αντικαθιστά το v2 πλαϊνό πάνελ προεπισκόπησης. Ίδιο όνομα
// συνάρτησης (συμβόλαιο)· βλ. σχόλιο στο dlSelectDriver για τον νέο ρόλο.
function dlHomeRightHtml(driverId) {
  const today = new Date().toISOString().slice(0, 10);
  return `<div class="dl-cardpay" onclick="event.stopPropagation()">
    <input type="date" class="dl-cp-date" id="dlCpDate" value="${today}">
    <div class="dl-seg">
      <button type="button" class="dl-cp-seg${_dl.cardPayMethod === 'payment_bank' ? ' on' : ''}" onclick="dlCardPayMethod('payment_bank')">Τράπεζα</button>
      <button type="button" class="dl-cp-seg${_dl.cardPayMethod === 'payment_cash' ? ' on' : ''}" onclick="dlCardPayMethod('payment_cash')">Μετρητά</button>
    </div>
    <input type="number" step="0.01" class="dl-cp-amount" id="dlCpAmount" placeholder="Ποσό (€)" onkeydown="dlCardPayKeydown(event, ${driverId})">
    <div class="dl-cp-actions">
      <button type="button" class="dl-cp-save" onclick="dlCardPaySave(${driverId})">Καταχώριση</button>
      <button type="button" class="dl-cp-cancel" onclick="dlSelectDriver(${driverId})">Άκυρο</button>
    </div>
    <div class="s">Enter = καταχώριση · Esc = κλείσιμο</div>
    <div class="dl-err" id="dlCpErr"></div>
  </div>`;
}

// Ίδια τεχνική με το dlPayMethod της καρτέλας: εναλλαγή classList, όχι πλήρες
// re-render — αλλιώς η ημερομηνία/το ποσό που μόλις πληκτρολόγησε ο χρήστης χάνονται.
function dlCardPayMethod(m) {
  _dl.cardPayMethod = m;
  document.querySelectorAll('.dl-cp-seg').forEach(btn => btn.classList.toggle('on',
    (m === 'payment_bank' && btn.textContent === 'Τράπεζα') || (m === 'payment_cash' && btn.textContent === 'Μετρητά')));
}

// Esc κλείνει από ΟΠΟΥΔΗΠΟΤΕ στη σελίδα μέσω του global listener πιο κάτω
// (όχι μόνο εδώ) — αυτό εδώ χρειάζεται μόνο το Enter, γιατί το πεδίο ποσού
// δεν είναι μέσα σε <form> (κανένα submit να αποτρέψει με άλλον τρόπο).
function dlCardPayKeydown(ev, driverId) {
  if (ev.key === 'Enter') { ev.preventDefault(); dlCardPaySave(driverId); }
}

async function dlCardPaySave(driverId) {
  const date = document.getElementById('dlCpDate').value;
  const amt = document.getElementById('dlCpAmount').value;
  const err = document.getElementById('dlCpErr');
  if (!(Number(amt) > 0)) { if (err) err.textContent = 'Το ποσό πρέπει να είναι θετικό.'; return; }
  try {
    await ctFetch('/costs/ledger', { method: 'POST', body: { driver_id: driverId, entry_type: _dl.cardPayMethod, entry_date: date || undefined, amount: Number(amt) } });
    _dl.cardPayId = null;
    await dlReloadBalances(); // unconditional refetch — always current month's totals too, not a local edit
    dlRenderHome();
  } catch (e) {
    if (err) err.textContent = 'Δεν καταχωρήθηκε: ' + e.message;
  }
}

// Κλείνει το μενού «Εκτύπωση ▾» της κεφαλίδας σε κλικ έξω — το μενού «···»
// ανά γραμμή έχει δικό του listener πιο κάτω (dlCloseMenu)· αυτό εδώ αγγίζει
// μόνο το _dl.printMenuOpen, άρα δεν μπορεί να έρθει σε σύγκρουση με εκείνο.
// Το ίδιο keydown listener κλείνει και την πληρωμή-στην-κάρτα με Esc από
// ΟΠΟΥΔΗΠΟΤΕ στη σελίδα (όχι μόνο ενώ πληκτρολογεί κανείς το ποσό — π.χ. Esc
// αμέσως μετά το «Πληρωμή», πριν αγγίξει το πεδίο).
if (typeof document !== 'undefined') {
  document.addEventListener('click', function (ev) {
    if (!_dl.printMenuOpen) return;
    if (ev.target.closest && ev.target.closest('[data-print-wrap]')) return;
    _dl.printMenuOpen = false;
    if (_dl.view === 'home') dlRenderHome();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && _dl.cardPayId !== null && _dl.view === 'home') { _dl.cardPayId = null; dlRenderHome(); }
  });
}

async function dlHomeNewTrip() {
  const first = dlHomeGroups()[0];
  if (!first) return;
  await renderPayrollDriver(first.driver_id);
  dlFocusQuickEntry();
}

function dlFocusQuickEntry() {
  const el = document.getElementById('dlQeRoute');
  if (el) el.focus();
}

// ═══════════════════ ΟΘΟΝΗ 2 — ΚΑΡΤΕΛΑ ΟΔΗΓΟΥ (v3) ═══════════════════

const DL_MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος',
  'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];

// v3 correction (owner Figma 600:1011, approved): year is a row of chips —
// dlYearOptions/a <select> was the pre-Figma guess in the written contract.
function dlYearChips() {
  const y0 = new Date().getFullYear();
  const chip = (val, label) => `<button type="button" class="dl-ychip${_dl.year === String(val) ? ' sel' : ''}" data-year="${val}" onclick="dlSetYearChip('${val}')">${label}</button>`;
  return [y0, y0 - 1, y0 - 2].map(y => chip(y, y)).join('') + chip('all', 'Όλα');
}

function dlSetYearChip(y) {
  _dl.year = y; _dl.editId = null; _dl.menuOpenId = null;
  dlRenderDriverCard();
}

function dlResetMonth() {
  _dl.month = ''; _dl.editId = null; _dl.menuOpenId = null;
  dlRenderDriverCard();
}

function dlMonthOptions() {
  let html = `<option value=""${_dl.month === '' ? ' selected' : ''}>Όλο το έτος</option>`;
  for (let i = 1; i <= 12; i++) {
    const mm = String(i).padStart(2, '0');
    html += `<option value="${mm}"${_dl.month === mm ? ' selected' : ''}>${DL_MONTHS[i - 1]}</option>`;
  }
  return html;
}

async function renderPayrollDriver(driverId) {
  const c = document.getElementById('content');
  _dl.view = 'driver'; _dl.driver = driverId; _dl.editId = null; _dl.menuOpenId = null;
  _dl.year = String(new Date().getFullYear());
  _dl.month = String(new Date().getMonth() + 1).padStart(2, '0');
  c.style.padding = '0';
  c.innerHTML = dlStyles() + '<div class="dl-page"><div style="padding:32px;color:var(--text-mid)">Φόρτωση καρτέλας…</div></div>';
  if (!_dl.balances.length) { try { await dlReloadBalances(); } catch (e) { /* handled by the entries fetch below */ } }
  try {
    await dlReloadEntries();
  } catch (e) {
    c.innerHTML = dlStyles() + '<div class="dl-page">' + showError('Η καρτέλα δεν φορτώθηκε: ' + e.message) + '</div>';
    return;
  }
  dlRenderDriverCard();
}

// v3 (#8): the FULL driver history, no ?year= — dlPeriod slices it client-side
// for the screen, the A4 print and the CSV alike (contract), so a January
// opening balance can never disagree between them.
async function dlReloadEntries() {
  const r = await ctFetch('/costs/ledger/' + _dl.driver);
  _dl.entries = r.records || []; _dl.rts = r.rts || [];
}

// Changing the period only re-slices the already-loaded history — no fetch
// (contract «περίοδος»). Year comes from dlSetYearChip/dlResetMonth — this is
// only the month <select>'s onchange.
function dlSetPeriod() {
  const mEl = document.getElementById('dlMonth');
  _dl.month = mEl ? mEl.value : _dl.month;
  _dl.editId = null; _dl.menuOpenId = null;
  dlRenderDriverCard();
}

// Shared by the period bar and the totals-row label (Figma 600:1011) — both
// show the exact same «Περίοδος …» text, so it is computed once here instead
// of twice, and can never disagree between the two spots (αρχή 3).
function dlPeriodLabel(period) {
  if (!period.rows.length) return 'Καμία κίνηση στην περίοδο';
  const start = period.rows[0].entry_date, end = period.rows[period.rows.length - 1].entry_date;
  const n = period.rows.length;
  return 'Περίοδος ' + dlDateRange(start, end) + ' · ' + n + (n === 1 ? ' κίνηση' : ' κινήσεις');
}

function dlRenderDriverCard() {
  const c = document.getElementById('content');
  const b = _dl.balances.find(x => x.driver_id === _dl.driver) || { driver_id: _dl.driver, full_name: '#' + _dl.driver, balance: 0, type: null };
  // API returns newest-first: the oldest entry (first movement) is the last item.
  const firstEntry = _dl.entries.length ? _dl.entries[_dl.entries.length - 1].entry_date : null;
  const bw = dlBalanceWord(b.balance);
  const period = dlPeriod(_dl.entries, _dl.year, _dl.month);
  const rows = period.rows.length
    ? period.rows.map(e => dlEntryRowHtml(e)).join('')
    : showEmpty({ title: 'Καμία κίνηση στην περίοδο', description: '' });
  // ΕΛΑΒΕ column mixes trip advances and payment/adjustment amounts (same
  // three entry types dlEntryRowHtml puts in that column) — its period total
  // has to add all three or it would silently disagree with the rows above it.
  const valueTotal = period.columns.value;
  const receivedTotal = period.columns.received;
  const periodLabel = dlPeriodLabel(period);
  // Opening row's date (Figma 600:1011 note 4): the day the transferred
  // balance is AS OF, i.e. the first day of the period — blank for «Όλα».
  const openDate = period.from ? dlDateRange(period.from, null) : '';
  // Year stat boxes (v3 correction #2): always the WHOLE year regardless of
  // the month filter — dlPeriod(entries, year, '') — «€» is allowed here,
  // these are caption figures, not ledger cells (contract's «no €» rule is
  // about the table's own cells).
  const yp = dlPeriod(_dl.entries, _dl.year, '');
  const yLabel = _dl.year === 'all' ? 'όλων των ετών' : _dl.year;
  const yAllPending = yp.totals.trips > 0 && yp.totals.trips === yp.totals.pendingCount;
  c.innerHTML = dlStyles() + `<div class="dl-page">
    <div class="dl-head"><a class="link" href="#" onclick="renderPayroll();return false">← Μισθοδοσία</a></div>
    <div class="dl-hero">
      <div class="dl-avatar" style="width:56px;height:56px;font-size:18px">${escapeHtml(dlInitials(b.full_name))}</div>
      <div class="dl-hero-main"><span class="dl-title">${escapeHtml(b.full_name)}</span>
        <span class="s">${dlTypeWord(b.type)}${firstEntry ? ' · από ' + dlDateRange(firstEntry, null) : ''}</span></div>
      <div class="dl-hero-bal"><span class="v big${Number(b.balance) < 0 ? ' dl-neg' : ''}">${dlBal(b)}</span><span class="s">${escapeHtml(bw.text)}</span></div>
      <span class="dl-sp"></span>
      <button id="dlBtnPayment" class="dl-btn primary" onclick="dlOpenPayment(${_dl.driver})">Πληρωμή</button>
      <button id="dlBtnAdjust" class="dl-btn" onclick="dlOpenAdjust(${_dl.driver})">Προσαρμογή</button>
      <button id="dlBtnTrip" class="dl-btn" onclick="dlFocusQuickEntry()">Δρομολόγιο</button>
      <button id="dlBtnPrintCard" class="dl-btn" onclick="dlPrintCard(${_dl.driver}, '${_dl.year}', '${_dl.month}')">Εκτύπωση καρτέλας</button>
      <button id="dlBtnCsvCard" class="dl-btn" onclick="dlCsvCardClick()">CSV</button>
    </div>
    <div class="dl-stats">
      <div class="box"><div class="k">Δρομολόγια ${yLabel}</div><div class="v">${yp.totals.trips}</div></div>
      <div class="box"><div class="k">Αξία ${yLabel}</div><div class="v">${yAllPending ? '—' : dlEur(yp.totals.value)}</div></div>
      <div class="box"><div class="k">Έξοδα ${yLabel}</div><div class="v">${dlEur(yp.totals.expenses)}</div></div>
      <div class="box"><div class="k">Πληρωμές ${yLabel}</div><div class="v">${dlEur(yp.totals.payments)}</div></div>
      <div class="box"><div class="k">Χωρίς αξία</div><div class="v" style="color:var(--warn)">${yp.totals.pendingCount} δρομολόγι${yp.totals.pendingCount === 1 ? 'ο' : 'α'}</div></div>
    </div>
    <div class="dl-period">
      <span class="k">Έτος</span>${dlYearChips()}
      <span class="k" style="margin-left:12px">Μήνας</span>
      <select id="dlMonth" onchange="dlSetPeriod()">${dlMonthOptions()}</select>
      <button type="button" class="dl-btn" onclick="dlResetMonth()">Όλο το έτος</button>
      <span class="dl-sp"></span>
      <span class="dl-period-label">${escapeHtml(periodLabel)}</span>
    </div>
    <div class="dl-ledger">
      <div class="dl-th"><div style="width:100px">Ημ/νία</div><div style="flex:1">Κίνηση</div><div style="width:110px" class="r">Αξία</div><div style="width:110px" class="r">Έλαβε</div><div style="width:110px" class="r">Έξοδα</div><div style="width:120px" class="r">Μεταβολή</div><div style="width:130px" class="r">Υπόλοιπο</div><div style="width:32px"></div></div>
      ${dlQuickEntryRowHtml()}
      <div class="dl-row opening">
        <div style="width:100px">${openDate ? `<span style="font-size:12px;font-variant-numeric:tabular-nums">${openDate}</span>` : ''}</div>
        <div style="flex:1"><span class="m">Υπόλοιπο έναρξης περιόδου</span></div>
        <div style="width:110px" class="r"></div><div style="width:110px" class="r"></div><div style="width:110px" class="r"></div><div style="width:120px" class="r"></div>
        <div style="width:130px" class="r"><span class="n">${dlNumP(period.opening)}</span></div><div style="width:32px"></div>
      </div>
      <div>${rows}</div>
      <div class="dl-row dl-totals">
        <div style="width:100px"></div><div style="flex:1"><span class="m">${escapeHtml(periodLabel)} · υπόλοιπο τέλους ${dlMoney(period.closing)}</span></div>
        <div style="width:110px" class="r"><span class="n">${dlNumP(valueTotal)}</span></div>
        <div style="width:110px" class="r"><span class="n">${dlNumP(receivedTotal)}</span></div>
        <div style="width:110px" class="r"><span class="n">${dlNumP(period.columns.expenses)}</span></div>
        <div style="width:120px" class="r"><span class="n">${dlSignedNum(period.totals.delta)}</span></div>
        <div style="width:130px" class="r"><span class="n dl-closing">${dlNumP(period.closing)}</span></div><div style="width:32px"></div>
      </div>
    </div>
    <div class="dl-foot"><span>Ποσά σε €. ΜΕΤΑΒΟΛΗ = αξία + έξοδα − έλαβε · ΥΠΟΛΟΙΠΟ = τρέχον υπόλοιπο μετά την κίνηση · «—» = δρομολόγιο χωρίς καταχωρισμένη αξία</span><span class="dl-sp"></span><span>··· = Διόρθωση / Ακύρωση κίνησης</span></div>
    <div class="dl-overlay" id="dlOverlay" onclick="dlCloseModal()"></div><div class="dl-modal" id="dlModal"></div>
  </div>`;
}

function dlCsvCardClick() {
  const b = _dl.balances.find(x => x.driver_id === _dl.driver) || { full_name: '#' + _dl.driver };
  dlCsvCard(b.full_name, _dl.entries, _dl.year, _dl.month);
}

// ── γραμμή γρήγορης καταχώρισης — μόνο δρομολόγιο, χωρίς σύνδεση RT (η
// σύνδεση μένει αυτόματη από το import, βλ. v2 rule #2) ΚΑΙ χωρίς επιλογέα
// τύπου (v3 correction #4 — Πληρωμή/Προσαρμογή έχουν το δικό τους κουμπί στο
// hero). «Δρομολόγιο» μένει σταθερή ετικέτα, όχι select. Η ημερομηνία γίνεται
// πεδίο (#dlQeDate, προεπιλογή σήμερα) αντί για σταθερό κείμενο, ώστε να
// καταχωρείται δρομολόγιο και εκτός της τρέχουσας ημέρας. ──
function dlQuickEntryRowHtml() {
  const today = new Date().toISOString().slice(0, 10);
  return `<div class="dl-row qe">
    <div style="width:100px"><input class="dl-ei" type="date" id="dlQeDate" value="${today}" onkeydown="dlQeKeydown(event)"></div>
    <div style="flex:1;flex-direction:row;align-items:center;gap:8px;display:flex">
      <span class="s" style="flex:none">Δρομολόγιο</span>
      <input class="dl-ei" id="dlQeRoute" style="flex:1" placeholder="Διαδρομή, π.χ. Veroia → Wels → Oinofyta" onkeydown="dlQeKeydown(event)">
    </div>
    <div style="width:110px" class="r"><input class="dl-ei" type="number" step="0.01" id="dlQeValue" placeholder="Αξία" onkeydown="dlQeKeydown(event)"></div>
    <div style="width:110px" class="r"><input class="dl-ei" type="number" step="0.01" id="dlQeAdvance" placeholder="Έλαβε" onkeydown="dlQeKeydown(event)"></div>
    <div style="width:110px" class="r"><input class="dl-ei" type="number" step="0.01" id="dlQeExpenses" placeholder="Έξοδα" onkeydown="dlQeKeydown(event)"></div>
    <div style="width:120px" class="r"><span class="n dim">—</span></div>
    <div style="width:130px" class="r"><button class="dl-btn" id="dlQeSave" style="height:28px;padding:0 10px;font-size:12px" onclick="dlQeSubmit()">Καταχώριση</button></div>
    <div style="width:32px"></div>
  </div>`;
}

function dlQeKeydown(ev) {
  if (ev.key === 'Enter') { ev.preventDefault(); dlQeSubmit(); }
  else if (ev.key === 'Escape') { ev.preventDefault(); dlQeClear(); }
}

function dlQeClear() {
  ['dlQeRoute', 'dlQeValue', 'dlQeAdvance', 'dlQeExpenses'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

async function dlQeSubmit() {
  const g = id => document.getElementById(id).value;
  const route = g('dlQeRoute').trim();
  if (!route) { alert('Η διαδρομή είναι υποχρεωτική.'); document.getElementById('dlQeRoute').focus(); return; }
  const n = id => { const v = g(id); return v === '' ? undefined : Number(v); };
  const date = g('dlQeDate') || new Date().toISOString().slice(0, 10);
  const body = { driver_id: _dl.driver, entry_type: 'trip', entry_date: date, route, trip_value: n('dlQeValue'), advance: n('dlQeAdvance'), expenses: n('dlQeExpenses') };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
  try {
    await ctFetch('/costs/ledger', { method: 'POST', body });
    await dlReloadBalances();
    await dlReloadEntries();
    dlRenderDriverCard();
    dlFocusQuickEntry();
  } catch (e) { alert('Δεν καταχωρήθηκε: ' + e.message); }
}

// Click on a live trip row → its three amount cells become inputs in place.
function dlEditRow(id) {
  const e = _dl.entries.find(x => x.id === id);
  if (!e || e.cancelled || e.entry_type !== 'trip') return;
  _dl.editId = id;
  dlRenderDriverCard();
  const el = document.getElementById('dlEiValue');
  if (el) el.focus();
}

function dlEiKeydown(ev, id) {
  if (ev.key === 'Enter') { ev.preventDefault(); dlSaveInlineEdit(id); }
  else if (ev.key === 'Escape') { ev.preventDefault(); dlCancelInlineEdit(); }
}

function dlCancelInlineEdit() { _dl.editId = null; dlRenderDriverCard(); }

async function dlSaveInlineEdit(id) {
  const e = _dl.entries.find(x => x.id === id);
  if (!e) return;
  const g = k => { const el = document.getElementById(k); return el && el.value !== '' ? Number(el.value) : null; };
  const body = {};
  for (const [k, dom] of [['trip_value', 'dlEiValue'], ['advance', 'dlEiAdvance'], ['expenses', 'dlEiExpenses']]) {
    const v = g(dom);
    const orig = e[k] == null ? null : Number(e[k]);
    if (v !== orig) body[k] = v;
  }
  if (Object.keys(body).length === 0) { _dl.editId = null; dlRenderDriverCard(); return; }
  // Reason is required only when changing an already-written (non-null) value — the Worker enforces this.
  const changingWritten = Object.keys(body).some(k => e[k] != null);
  if (changingWritten) {
    const reason = window.prompt('Αιτιολογία αλλαγής (υποχρεωτική):');
    if (!reason) return;
    body.reason = reason;
  }
  try {
    await ctFetch('/costs/ledger/' + id, { method: 'PATCH', body });
    _dl.editId = null;
    await dlReloadBalances();
    await dlReloadEntries();
    dlRenderDriverCard();
  } catch (err) { alert('Δεν αποθηκεύτηκε: ' + err.message); }
}

// ── «···» μενού γραμμής (v3 #7, αντί για μόνιμο «×» + κλικ σε ολόκληρη
// γραμμή) — dlToggleMenu ανοιγοκλείνει, dlCloseMenu το κλείνει (κλικ έξω/Esc,
// βλ. τους document listeners πιο κάτω), dlMenuEdit/dlMenuCancel εκτελούν. ──
function dlToggleMenu(id) {
  _dl.menuOpenId = (_dl.menuOpenId === id) ? null : id;
  dlRenderDriverCard();
}

function dlCloseMenu() {
  if (_dl.menuOpenId !== null) { _dl.menuOpenId = null; dlRenderDriverCard(); }
}

function dlMenuEdit(id) { _dl.menuOpenId = null; dlEditRow(id); }

// The movement is never deleted — cancellation with a reason is the only undo,
// and stays visible (struck through) on the card.
async function dlMenuCancel(id) {
  _dl.menuOpenId = null;
  const reason = window.prompt('Αιτιολογία ακύρωσης (υποχρεωτική):');
  if (!reason) { dlRenderDriverCard(); return; }
  try {
    await ctFetch('/costs/ledger/' + id, { method: 'PATCH', body: { cancel: true, reason } });
    await dlReloadBalances();
    await dlReloadEntries();
    dlRenderDriverCard();
  } catch (err) { alert('Δεν ακυρώθηκε: ' + err.message); }
}

// Closes an open row menu on an outside click or Esc — guarded for node:test,
// which requires this file with no `document`.
if (typeof document !== 'undefined') {
  document.addEventListener('click', function (ev) {
    if (_dl.menuOpenId === null) return;
    if (ev.target.closest && (ev.target.closest('.dl-menu') || ev.target.closest('.dl-more'))) return;
    dlCloseMenu();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && _dl.menuOpenId !== null) dlCloseMenu();
  });
}

// ── modal πληρωμής/προσαρμογής (screen 2) — ίδιο #dlModal/#dlOverlay,
// περιεχόμενο εναλλάξ ανάλογα ποιο άνοιξε. ──
function dlOpenPayment(driverId) {
  const m = document.getElementById('dlModal'); document.getElementById('dlOverlay').classList.add('open'); m.classList.add('open');
  const today = new Date().toISOString().slice(0, 10);
  m.dataset.method = 'payment_bank';
  m.innerHTML = `<div style="display:flex;align-items:center;margin-bottom:16px"><span class="dl-title" style="font-size:18px">Πληρωμή</span><span class="dl-sp"></span><button class="dl-btn" style="border:0" onclick="dlCloseModal()">✕</button></div>
    <div class="dl-fr"><div class="dl-f"><label>Ημερομηνία</label><input type="date" id="dlPayDate" value="${today}"></div></div>
    <div class="dl-f" style="margin-bottom:6px"><label>Τρόπος</label></div>
    <div class="dl-seg" id="dlPaySeg" style="margin-bottom:16px">
      <button class="on" onclick="dlPayMethod('payment_bank')">Τράπεζα</button>
      <button onclick="dlPayMethod('payment_cash')">Μετρητά</button>
    </div>
    <div class="dl-fr"><div class="dl-f"><label>Ποσό (€)</label><input type="number" step="0.01" id="dlPayAmount"></div></div>
    <div style="display:flex;gap:12px;align-items:center"><span class="dl-sp"></span><button class="dl-btn" style="border:0;color:var(--accent)" onclick="dlCloseModal()">Άκυρο</button><button class="dl-btn primary" id="dlPaySave" onclick="dlSavePayment(${driverId})">Καταχώριση</button></div>
    <div class="dl-err" id="dlErr"></div>`;
}

function dlPayMethod(m) {
  document.getElementById('dlModal').dataset.method = m;
  document.querySelectorAll('#dlPaySeg button').forEach(btn => btn.classList.toggle('on', (m === 'payment_bank' && btn.textContent === 'Τράπεζα') || (m === 'payment_cash' && btn.textContent === 'Μετρητά')));
}

function dlCloseModal() {
  const o = document.getElementById('dlOverlay'), m = document.getElementById('dlModal');
  if (o) o.classList.remove('open'); if (m) m.classList.remove('open');
}

async function dlSavePayment(driverId) {
  const method = document.getElementById('dlModal').dataset.method || 'payment_bank';
  const date = document.getElementById('dlPayDate').value;
  const amt = document.getElementById('dlPayAmount').value;
  if (!(Number(amt) > 0)) { document.getElementById('dlErr').textContent = 'Το ποσό πρέπει να είναι θετικό.'; return; }
  try {
    await ctFetch('/costs/ledger', { method: 'POST', body: { driver_id: driverId, entry_type: method, entry_date: date || undefined, amount: Number(amt) } });
    dlCloseModal();
    await dlReloadBalances();
    await dlReloadEntries();
    dlRenderDriverCard();
  } catch (e) { document.getElementById('dlErr').textContent = 'Δεν καταχωρήθηκε: ' + e.message; }
}

// ── modal προσαρμογής (v3 #3) — ημερομηνία · ποσό (±, ≠0) · λόγος
// (υποχρεωτικός, γράφεται στο note). Ο Worker δέχεται entry_type='adjustment'
// με amount≠0 (ledger-rules.mjs) — το frontend μπλοκάρει πριν το POST τα ίδια
// (ποσό μηδέν ή λόγος κενός), ώστε το μήνυμα να είναι άμεσο, όχι server round-trip. ──
function dlOpenAdjust(driverId) {
  const m = document.getElementById('dlModal'); document.getElementById('dlOverlay').classList.add('open'); m.classList.add('open');
  const today = new Date().toISOString().slice(0, 10);
  m.innerHTML = `<div style="display:flex;align-items:center;margin-bottom:16px"><span class="dl-title" style="font-size:18px">Προσαρμογή</span><span class="dl-sp"></span><button class="dl-btn" style="border:0" onclick="dlCloseModal()">✕</button></div>
    <div class="dl-fr"><div class="dl-f"><label>Ημερομηνία</label><input type="date" id="dlAdjDate" value="${today}"></div></div>
    <div class="dl-fr"><div class="dl-f"><label>Ποσό (±)</label><input type="number" step="0.01" id="dlAdjAmount"></div></div>
    <div class="dl-f" style="margin-bottom:16px"><label>Λόγος</label><input type="text" id="dlAdjReason" placeholder="Υποχρεωτικό"></div>
    <div style="display:flex;gap:12px;align-items:center"><span class="dl-sp"></span><button class="dl-btn" style="border:0;color:var(--accent)" onclick="dlCloseModal()">Άκυρο</button><button class="dl-btn primary" id="dlAdjSave" onclick="dlSaveAdjust(${driverId})">Καταχώριση</button></div>
    <div class="dl-err" id="dlErr"></div>`;
}

async function dlSaveAdjust(driverId) {
  const date = document.getElementById('dlAdjDate').value;
  const amtStr = document.getElementById('dlAdjAmount').value;
  const reason = document.getElementById('dlAdjReason').value.trim();
  const amt = Number(amtStr);
  if (!reason || amtStr === '' || Number.isNaN(amt) || amt === 0) {
    document.getElementById('dlErr').textContent = 'Το ποσό (διάφορο του μηδέν) και ο λόγος είναι υποχρεωτικά.';
    return;
  }
  try {
    await ctFetch('/costs/ledger', { method: 'POST', body: { driver_id: driverId, entry_type: 'adjustment', entry_date: date || undefined, amount: amt, note: reason } });
    dlCloseModal();
    await dlReloadBalances();
    await dlReloadEntries();
    dlRenderDriverCard();
  } catch (e) { document.getElementById('dlErr').textContent = 'Δεν καταχωρήθηκε: ' + e.message; }
}

// ═══════════════════ ΟΘΟΝΗ 3 — ΜΑΖΙΚΗ ΠΛΗΡΩΜΗ ═══════════════════

async function renderPayrollBulk() {
  const c = document.getElementById('content');
  c.style.padding = '0';
  _dl.view = 'bulk';
  c.innerHTML = dlStyles() + '<div class="dl-page"><div style="padding:32px;color:var(--text-mid)">Φόρτωση…</div></div>';
  if (!_dl.balances.length) {
    try { await dlReloadBalances(); }
    catch (e) { c.innerHTML = dlStyles() + '<div class="dl-page">' + showError('Δεν φορτώθηκαν οι καρτέλες: ' + e.message) + '</div>'; return; }
  }
  _dl.bulk = { date: new Date().toISOString().slice(0, 10), method: 'payment_bank', amounts: {}, prevMonth: {}, prevLoaded: false, busy: false, done: 0, total: 0, results: {}, failErr: null };
  dlRenderBulk();
  dlLoadPrevMonth();
}

function dlBulkDrivers() {
  return _dl.balances.filter(b => b.has_entries).sort((a, b) => Number(b.balance) - Number(a.balance));
}

// Last payment of each method, per driver — parallel fetch, only for drivers
// with an open balance (spec Οθόνη 3): the rest never need the lookup.
async function dlLoadPrevMonth() {
  const targets = dlBulkDrivers().filter(d => Number(d.balance) > 0);
  await Promise.all(targets.map(async d => {
    try {
      const r = await ctFetch('/costs/ledger/' + d.driver_id);
      const entries = r.records || [];
      const find = t => { const e = entries.find(x => x.entry_type === t && !x.cancelled); return e ? Number(e.amount) : null; };
      _dl.bulk.prevMonth[d.driver_id] = { payment_bank: find('payment_bank'), payment_cash: find('payment_cash') };
    } catch (e) { _dl.bulk.prevMonth[d.driver_id] = { payment_bank: null, payment_cash: null, failed: true }; }
  }));
  _dl.bulk.prevLoaded = true;
  dlRenderBulk();
}

function dlRenderBulk() {
  const c = document.getElementById('content');
  const drivers = dlBulkDrivers();
  const seg = (m, label) => `<button class="${_dl.bulk.method === m ? 'on' : ''}" onclick="dlBulkMethod('${m}')">${label}</button>`;
  const rows = drivers.map(d => dlBulkRowHtml(d)).join('');
  c.innerHTML = dlStyles() + `<div class="dl-page">
    <div class="dl-head"><a class="link" href="#" onclick="renderPayroll();return false">← Μισθοδοσία</a><span class="dl-title" style="font-size:18px">Μαζική πληρωμή</span></div>
    <div class="dl-bulk-ctrl">
      <div class="dl-f" style="max-width:160px"><label>Ημερομηνία</label><input type="date" value="${_dl.bulk.date}" onchange="dlBulkDate(this.value)"></div>
      <div class="dl-f" style="max-width:220px"><label>Τρόπος</label><div class="dl-seg">${seg('payment_bank', 'Τράπεζα')}${seg('payment_cash', 'Μετρητά')}</div></div>
      <span class="dl-sp"></span>
      <button class="dl-btn" onclick="dlBulkSameAmount()">Ίδιο ποσό σε όλους</button>
      <button class="dl-btn" onclick="dlBulkFullBalance()">Όλη η οφειλή</button>
      <button class="dl-btn" onclick="dlBulkPrevMonth()"${_dl.bulk.prevLoaded ? '' : ' disabled'}>Όπως τον προηγούμενο μήνα</button>
    </div>
    ${_dl.bulk.failErr ? `<div class="dl-err" style="padding:8px 24px">${escapeHtml(_dl.bulk.failErr)} — οι προηγούμενες πληρωμές καταχωρήθηκαν.</div>` : ''}
    <div class="dl-th"><div style="width:320px">Οδηγός</div><div style="width:130px" class="r">Οφειλή</div><div style="width:130px" class="r">Προηγ. μήνας</div><div style="width:150px" class="r">Ποσό</div><div style="width:150px" class="r">Νέα οφειλή</div><div style="width:40px"></div></div>
    <div>${rows || showEmpty({ title: 'Κανένας οδηγός με κίνηση', description: '' })}</div>
    <div id="dlBulkFoot">${dlBulkFootHtml()}</div>
  </div>`;
}

function dlBulkRowHtml(d) {
  const amt = _dl.bulk.amounts[d.driver_id];
  const pm = _dl.bulk.prevMonth[d.driver_id];
  const pmVal = pm ? pm[_dl.bulk.method] : null;
  const bal = Number(d.balance || 0);
  const result = _dl.bulk.results[d.driver_id];
  return `<div class="dl-row">
    <div style="width:320px"><span class="m">${escapeHtml(d.full_name)}</span></div>
    <div style="width:130px" class="r"><span class="n${bal < 0 ? ' dl-neg' : ''}">${dlMoney(bal)}</span></div>
    <div style="width:130px" class="r"><span class="n dim">${_dl.bulk.prevLoaded ? (pm && pm.failed ? '<span title="δεν φορτώθηκε">?</span>' : (pmVal != null ? dlEur(pmVal) : '—')) : '…'}</span></div>
    <div style="width:150px" class="r"><input class="dl-ei" type="number" step="0.01" value="${amt ?? ''}" oninput="dlBulkAmount(${d.driver_id},this.value)"></div>
    <div style="width:150px" class="r" id="dlNewBal_${d.driver_id}">${dlBulkNewBalHtml(bal, amt)}</div>
    <div style="width:40px" class="r">${result === 'ok' ? '<span style="color:var(--ok)">✓</span>' : (result === 'fail' ? '<span style="color:var(--danger)">✕</span>' : '')}</div>
  </div>`;
}

function dlBulkNewBalHtml(bal, amtStr) {
  if (amtStr === undefined || amtStr === null || amtStr === '' || !(Number(amtStr) > 0)) return `<span class="s">παράλειψη</span>`;
  const nb = bal - Number(amtStr);
  return `<span class="n"${Math.abs(nb) < 0.005 ? ' style="color:var(--ok)"' : ''}>${dlMoney(nb)}</span>`;
}

function dlBulkFootHtml() {
  const rows = dlBulkDrivers().map(d => ({ id: d.driver_id, amt: _dl.bulk.amounts[d.driver_id] })).filter(r => r.amt !== undefined && r.amt !== '' && Number(r.amt) > 0);
  const n = rows.length;
  const sum = rows.reduce((a, r) => a + Number(r.amt), 0);
  const methodLabel = _dl.bulk.method === 'payment_bank' ? 'τράπεζα' : 'μετρητά';
  const dateTxt = _dl.bulk.date ? _dl.bulk.date.slice(8, 10) + '/' + _dl.bulk.date.slice(5, 7) + '/' + _dl.bulk.date.slice(0, 4) : '';
  const busy = _dl.bulk.busy;
  return `<div class="dl-foot">
    <span>${n} πληρωμ${n === 1 ? 'ή' : 'ές'} &nbsp; <b>${dlEur(sum)}</b> &nbsp; ${methodLabel} · ${dateTxt}${busy ? ` &nbsp; ${_dl.bulk.done} / ${_dl.bulk.total}` : ''}</span>
    <span class="dl-sp"></span>
    <button class="dl-btn" onclick="renderPayroll()"${busy ? ' disabled' : ''}>Άκυρο</button>
    <button class="dl-btn pri" onclick="dlBulkSubmit()"${(busy || !n) ? ' disabled' : ''}>Καταχώριση ${n} πληρωμών</button>
  </div>`;
}

// Live update without a full re-render: a full re-render on every keystroke
// would move the input's caret out from under a typing finger.
function dlBulkAmount(id, val) {
  _dl.bulk.amounts[id] = val;
  const b = _dl.balances.find(x => x.driver_id === id);
  const cell = document.getElementById('dlNewBal_' + id);
  if (cell) cell.innerHTML = dlBulkNewBalHtml(Number(b && b.balance || 0), val);
  const foot = document.getElementById('dlBulkFoot');
  if (foot) foot.innerHTML = dlBulkFootHtml();
}

function dlBulkMethod(m) { _dl.bulk.method = m; dlRenderBulk(); }

function dlBulkDate(v) {
  _dl.bulk.date = v;
  const foot = document.getElementById('dlBulkFoot');
  if (foot) foot.innerHTML = dlBulkFootHtml();
}

function dlBulkSameAmount() {
  const v = window.prompt('Ποσό για όλους (€):');
  if (v === null || v === '') return;
  const n = Number(v);
  if (!(n > 0)) return;
  dlBulkDrivers().forEach(d => { _dl.bulk.amounts[d.driver_id] = String(n); });
  dlRenderBulk();
}

function dlBulkFullBalance() {
  dlBulkDrivers().forEach(d => { if (Number(d.balance) > 0) _dl.bulk.amounts[d.driver_id] = Number(d.balance).toFixed(2); });
  dlRenderBulk();
}

function dlBulkPrevMonth() {
  dlBulkDrivers().forEach(d => {
    const pm = _dl.bulk.prevMonth[d.driver_id];
    const v = pm ? pm[_dl.bulk.method] : null;
    if (v != null) _dl.bulk.amounts[d.driver_id] = String(v);
  });
  dlRenderBulk();
}

// Sequential POSTs (spec Οθόνη 3): on failure, stop — earlier rows already
// posted are real payments and stay; the failing row and reason are shown.
async function dlBulkSubmit() {
  const rows = dlBulkDrivers().map(d => ({ id: d.driver_id, name: d.full_name, amount: _dl.bulk.amounts[d.driver_id] })).filter(r => r.amount !== undefined && r.amount !== '' && Number(r.amount) > 0);
  if (!rows.length) return;
  _dl.bulk.busy = true; _dl.bulk.done = 0; _dl.bulk.total = rows.length; _dl.bulk.results = {}; _dl.bulk.failErr = null;
  dlRenderBulk();
  for (const row of rows) {
    try {
      await ctFetch('/costs/ledger', { method: 'POST', body: { driver_id: row.id, entry_type: _dl.bulk.method, entry_date: _dl.bulk.date, amount: Number(row.amount) } });
      _dl.bulk.results[row.id] = 'ok';
      _dl.bulk.done++;
      dlRenderBulk();
    } catch (e) {
      _dl.bulk.results[row.id] = 'fail';
      _dl.bulk.failErr = row.name + ': ' + e.message;
      _dl.bulk.busy = false;
      dlRenderBulk();
      return;
    }
  }
  _dl.bulk.busy = false;
  renderPayroll();
}

// node:test reads these; the browser ignores the guard.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dlEur, dlBalanceWord, dlDelta, dlTypeLabel, dlDateRange, dlMoney, dlPeriod, dlEntryAmounts };
}
