// ═══════════════════════════════════════════════════════════
// MODULE — ΕΞΟΔΑ ΔΡΟΜΟΛΟΓΙΩΝ (accountant/owner full, management read-only)
// Backend αμετάβλητο: /costs/rt, /costs/lookups, /costs/lines (Worker).
// Spec: docs/superpowers/specs/2026-09-07-trip-expenses-design.md
// Visual model copied from modules/payroll.js (dl* helpers/screens) — same
// page shell, quick-entry row, inline edit. Prefix here is ex* to keep the
// two modules' globals apart; ctFetch/CT_CATEGORY_LABELS come from
// modules/costs.js (loaded earlier in app.html) and are reused as-is so the
// category wording never drifts into a second, slightly different list
// (αρχή 3: δύο πηγές αλήθειας σημαίνει καμία).
// ═══════════════════════════════════════════════════════════
'use strict';

// fixed_alloc excluded (spec §3): it is written by the future Tier-2
// allocator, never by hand. driver_pay/cash_m excluded: gone since 5/9/2026
// (see modules/costs.js comment) — the Worker's own CT_CATEGORIES no longer
// accepts them either.
const EX_CATEGORIES = ['fuel', 'reefer_fuel', 'tolls', 'dkv', 'adblue', 'spedition', 'accommodation', 'ferry_train', 'fines', 'partner_rate', 'other'];
const EX_FUEL_CATEGORIES = ['fuel', 'reefer_fuel', 'adblue'];
// Χρώμα pill ανά κατηγορία (round 2 D, owner 8/9 «top tier»): amber=καύσιμα,
// μπλε=διόδια/κάρτες/φέρι, πράσινο=κόμιστρο συνεργάτη, γκρι τα υπόλοιπα.
// spedition δεν αναφέρεται ρητά στο σχεδιαστικό αίτημα — μπαίνει στο γκρι
// («λοιπά») παρά να επινοηθεί πέμπτο χρώμα εκτός token set.
function exCatPillClass(cat) {
  if (EX_FUEL_CATEGORIES.includes(cat)) return 'ex-pill-amber';
  if (cat === 'tolls' || cat === 'dkv' || cat === 'ferry_train') return 'ex-pill-blue';
  if (cat === 'partner_rate') return 'ex-pill-green';
  return 'ex-pill-gray';
}
const EX_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

// _ex.selected: null (nothing open) | 'none' (Χωρίς δρομολόγιο) | rt id (number).
// _ex.allLines: unfiltered /costs/lines snapshot — feeds the top stats and
// the per-trip totals in the left list. Refetched after every write so the
// numbers on screen are never a local guess (αρχή 2: η απόδειξη είναι ο
// πίνακας). _ex.panelLines: the lines actually shown in the right panel for
// whatever is selected — fetched with the matching server-side filter
// (rt_id= or alloc_status=unallocated) so a trip past the 300-row cap on the
// unfiltered fetch still shows its own lines correctly.
const _ex = {
  rts: [], lookups: null, allLines: [], canWrite: false,
  q: '', selected: null, panelLines: [], panelLoading: false, panelErr: null,
  editId: null, qe: null,
  // «Εισαγωγές» DKV band (round 2, spec point 4) — GET /costs/import/docs,
  // fetched separately from the critical page data above so a slow/missing
  // endpoint (Φ2 not deployed everywhere yet) never blocks the main screen.
  importDocs: [], importDocsLoading: false, importDocsErr: null
};

// Local calendar dates, never toISOString(): that is UTC, and between 00:00
// and 03:00 Athens time it names yesterday — «today» and the week bounds would
// shift a day (critic 7/9). localToday()/toLocalDate() are the app's helpers.
function exTodayIso() { return localToday(); }

function exWeekBounds(ref) {
  const now = ref ? new Date(ref) : new Date();
  const diffToMon = (now.getDay() + 6) % 7; // 0=Monday
  const mon = new Date(now); mon.setDate(now.getDate() - diffToMon); mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: toLocalDate(mon), end: toLocalDate(sun) };
}

function exWithinDays(dateStr, days) {
  if (!dateStr) return false;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days); cutoff.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00') >= cutoff;
}

function exEur(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function exDate(iso) {
  if (!iso) return '—';
  const [, m, d] = iso.slice(0, 10).split('-');
  return d + '/' + m;
}

// «2–7 Σεπ» format (spec §3 literal example) — deliberately not
// payroll.js's dlDateRange, which renders «02–07/09» for the same input.
function exDateRange(start, end) {
  if (!start) return '—';
  const d1 = new Date(start + 'T12:00:00');
  const day1 = d1.getDate(), mon1 = EX_MONTHS[d1.getMonth()];
  if (!end || end === start) return day1 + ' ' + mon1;
  const d2 = new Date(end + 'T12:00:00');
  const day2 = d2.getDate(), mon2 = EX_MONTHS[d2.getMonth()];
  return mon1 === mon2 ? (day1 + '–' + day2 + ' ' + mon1) : (day1 + ' ' + mon1 + ' – ' + day2 + ' ' + mon2);
}

function exTruckName(id) { const t = (_ex.lookups && _ex.lookups.trucks || []).find(x => x.id === id); return t ? t.license_plate : '—'; }
function exDriverName(id) { const d = (_ex.lookups && _ex.lookups.drivers || []).find(x => x.id === id); return d ? d.full_name : ''; }
function exPartnerName(id) { const p = (_ex.lookups && _ex.lookups.partners || []).find(x => x.id === id); return p ? p.company_name : ''; }
function exPersonName(r) { return r.driver_id ? exDriverName(r.driver_id) : (r.partner_id ? exPartnerName(r.partner_id) : '—'); }

// 403 from ctCan() (worker/src/index.js) always carries the literal message
// "Forbidden" — no HTTP status reaches this far through ctFetch, so that
// exact string is how a permission failure is told apart from any other
// server error (αρχή 1: ό,τι δεν γίνεται πρέπει να ακούγεται).
function exShowError(e) {
  const msg = (e && e.message) || String(e);
  showErrorToast(msg === 'Forbidden' ? ('Δεν έχεις δικαίωμα για αυτή την ενέργεια — ' + msg) : msg, 'error');
}

function exStyles() {
  return `<style>
  .ex-page{font-family:'DM Sans',sans-serif;font-size:14px;color:var(--text);background:var(--surface-card);min-height:100%}
  .ex-head{display:flex;align-items:center;gap:8px;padding:0 24px;height:58px;border-bottom:1px solid var(--border)}
  .ex-title{font-family:'Syne',sans-serif;font-size:28px;font-weight:700}
  /* Hero strip (round 2 D, owner 8/9 «top tier»): ΕΝΑ μεγάλο νούμερο (καθαρό
     εξόδων εβδομάδας, Syne 28px) + δύο μικρότερα — ιεραρχία πρώτα, όχι πέντε
     ισοδύναμα κελιά. Η κλάση .ex-strip ΕΠΙΤΗΔΕΣ δεν άλλαξε (proof selector). */
  .ex-strip{display:flex;align-items:stretch;padding:16px 24px;background:var(--surface-card);border-bottom:1px solid var(--border)}
  .ex-hero-big{display:flex;flex-direction:column;gap:2px;padding-right:24px;margin-right:24px;border-right:1px solid var(--border);justify-content:center}
  .ex-hero-big .v{font-family:'Syne',sans-serif;font-size:28px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
  .ex-hero-sm{display:flex;flex-direction:column;gap:2px;justify-content:center;margin-right:24px}
  .ex-hero-sm .v{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}
  /* text-transform:none εδώ επίτηδες — το γενικό .k (right panel) το κάνει
     ΚΕΦΑΛΑΙΑ, αλλά .innerText() (Playwright) ΑΝΤΑΝΑΚΛΑ το CSS text-transform·
     μια uppercase ετικέτα θα έκανε το proof's case-sensitive «αυτή την
     εβδομάδα» να μη βρεθεί ποτέ. Βρέθηκε ξανατρέχοντας τα 43 προϋπάρχοντα
     ελέγχους μετά το round 2 (η ίδια η οθόνη δεν άλλαξε ελληνικό κείμενο). */
  .ex-hero-big .k,.ex-hero-sm .k{font-size:11px;font-weight:500;color:var(--text-mid);text-transform:none;letter-spacing:.02em}
  .ex-cap-note{padding:6px 24px;font-size:11px;color:var(--warn,#B45309);background:var(--surface-sunken);border-bottom:1px solid var(--border)}
  /* «Εισαγωγές» DKV band (round 2, spec point 4) — a plain read-only list,
     no card treatment: it sits below the hero strip like a footnote, not a
     new competing block (owner 8/9 «λιγότερες λέξεις, ιεραρχία»). */
  .ex-idocs{border-bottom:1px solid var(--border)}
  .ex-idochead{padding:8px 24px 2px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-mid)}
  .ex-idoc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:3px 24px 6px;font-size:12px}
  .ex-warn{color:var(--danger)} .ex-warn b{color:var(--danger)} .ex-warn .v{color:var(--danger)}
  /* WeekGroup στη λίστα αριστερά (round 2 C): ίδιο μοτίβο ετικέτας με το
     TRIP PnL (modules/costs.js .ct-wkhead) — καμία κερδοφορία εδώ, μόνο σύνολο
     εξόδων (spec §1 «ποτέ στην οθόνη έσοδα/περιθώρια»). */
  /* text-transform ΕΠΙΤΗΔΕΣ όχι uppercase — ίδιο ύφος με το .ct-wkhead του
     TRIP PnL (modules/costs.js, D: «week headers in costs.js consistent with
     it»)· βλ. σχόλιο στο .ex-hero-big .k πιο πάνω για το γιατί το uppercase
     σπάει το proof's case-sensitive .innerText(). */
  .ex-wkhead{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:8px 16px;background:var(--surface-sunken);border-bottom:1px solid var(--border);border-top:1px solid var(--border);font-size:13px;font-weight:700;color:var(--text)}
  .ex-wkhead .ex-wktot{font-variant-numeric:tabular-nums;color:var(--text);font-size:12px}
  /* Κατάσταση = χρώμα + λέξη ΜΙΑ φορά σε legend, μετά μόνο η κουκκίδα ανά γραμμή. */
  .ex-legend{display:flex;align-items:center;gap:16px;padding:0 16px 8px;font-size:11px;color:var(--text-mid)}
  .ex-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle}
  .ex-dot.ex-progress{background:var(--accent)} .ex-dot.ex-done{background:var(--ok)}
  /* Πινακίδα ως μονόχωρη navy ετικέτα (round 2 D) — ίδιος τόνος στη λίστα και
     στην κεφαλίδα της καρτέλας, ώστε το μάτι να μαθαίνει ΕΝΑ σχήμα «πινακίδα». */
  .ex-plate{display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700;letter-spacing:.02em;background:var(--navy);color:var(--text-on-dark);border-radius:4px;padding:2px 7px;white-space:nowrap}
  .ex-plate.lg{font-size:16px;padding:4px 10px}
  .ex-plate.sm{font-size:11px}
  .ex-search{height:34px;box-sizing:border-box;border:1px solid var(--border);border-radius:6px;padding:0 12px;font:inherit;font-size:12px;margin:12px 16px;width:calc(100% - 32px)}
  .ex-split{display:flex;align-items:stretch}
  /* 300px fixed (was 420px) — at 1280px viewport (sidebar 228 + this) the
     right card needs the remaining width to fit the entry row without
     horizontal scroll (coordinator defect 1, 7/9). */
  .ex-list{width:300px;flex:none;border-right:1px solid var(--border);display:flex;flex-direction:column}
  .ex-list-rows{overflow-y:auto}
  /* overflow-x:hidden is deliberate, not just overflow:auto — this card must
     never scroll sideways (defect 1); every row below is built to fit
     without needing it, so a horizontal scrollbar here would only ever mean
     a future change reintroduced the same overflow. */
  .ex-right{flex:1;min-width:0;overflow-y:auto;overflow-x:hidden}
  .ex-lrow{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:56px;padding:8px 16px;border-left:3px solid transparent;border-bottom:1px solid var(--border);cursor:pointer}
  .ex-lrow:hover{background:var(--surface-sunken)}
  .ex-lrow.sel{border-left-color:var(--accent);background:var(--surface-sunken)}
  .ex-lrow-main{display:flex;flex-direction:column;gap:2px;min-width:0}
  .ex-lrow-side{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none}
  .ex-status{font-size:11px;font-weight:600}
  .ex-status.ex-progress{color:var(--accent)} .ex-status.ex-done{color:var(--ok)}
  .ex-hero{display:flex;align-items:center;gap:20px;padding:20px 24px;border-bottom:1px solid var(--border)}
  .ex-hero-main{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
  .ex-hero-stat{display:flex;flex-direction:column;gap:2px;padding:0 16px;border-left:1px solid var(--border)}
  .k{font-size:11px;font-weight:500;color:var(--text-dim);text-transform:uppercase;letter-spacing:.03em}
  .v{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}
  .ex-th{height:34px;background:var(--surface-sunken);border-bottom:1px solid var(--border);padding:0 16px;font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--text-mid);text-transform:uppercase}
  .ex-row{min-height:44px;padding:6px 16px;border-bottom:1px solid var(--border)}
  /* Shared grid for the header + each display line (defect 1, spec §3 point
     3: date · category+note · liters · net · vat · user · actions). Two
     compound selectors (not a shared class) so this always wins over the
     plain .ex-th/.ex-row rules above regardless of CSS source order.
     minmax() on the two flexible tracks (note, actions) is what keeps every
     column inside the card instead of forcing .ex-right to scroll — a fixed
     px sum here was the original bug. min-width:0 on every cell stops a long
     unbroken note/username from blowing out its column's own intrinsic size. */
  .ex-th.ex-line-grid,.ex-row.ex-line-grid{display:grid;grid-template-columns:56px minmax(130px,1fr) 52px 72px 72px 76px minmax(96px,1fr);gap:8px;align-items:center}
  .ex-line-grid>div{min-width:0;overflow-wrap:break-word;word-break:break-word}
  /* "Ποιος" (created_by, e.g. demo_accountant): one unbroken word longer than
     its 76px column — break-word above would split it mid-letter, which
     reads as broken UI rather than "the layout fits". Ellipsis is the
     narrow-column convention instead; title="" carries the full value. */
  .ex-user{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .m{font-size:13px;font-weight:700} .s{font-size:12px;color:var(--text-mid)} .n{font-size:13px;font-variant-numeric:tabular-nums}
  .r{text-align:right} .dim{color:var(--text-dim)}
  .ex-ei{height:32px;border:1px solid var(--border);border-radius:6px;padding:0 8px;font:inherit;font-size:13px;box-sizing:border-box}
  /* Quick-entry + inline-edit rows share this: a flex-wrap row instead of the
     grid above, because they hold form fields (not fixed display columns).
     Each .ex-qe-break is an empty flex-basis:100% item — the classic
     flexbox line-break trick — so the fields split into the three rows the
     coordinator asked for (category/date/net/vat · note · fuel fields)
     without a fixed min-width forcing the whole card to scroll (defect 1). */
  /* Sunken panel look (round 2 D): border + λίγο μεγαλύτερο padding γύρω από
     το ίδιο flex-wrap layout — η ίδια δικαιολογία defect-1 στο σχόλιο πάνω
     εξακολουθεί να ισχύει, το panel απλώς φαίνεται πιο «βυθισμένο». */
  .ex-row.qe{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;background:var(--surface-sunken);border:1px solid var(--border);border-radius:6px;margin:12px 16px;padding:12px}
  .ex-row.edit{box-shadow:inset 3px 0 var(--accent)}
  .ex-qe-break{flex-basis:100%;height:0}
  .ex-qe-cat{width:150px;max-width:100%}
  .ex-qe-date{width:140px;max-width:100%}
  .ex-qe-amt{width:100px}
  .ex-qe-note{flex:1;min-width:160px}
  .ex-qe-hint{font-size:11px;color:var(--text-dim);white-space:nowrap;padding-bottom:6px}
  .ex-qe-fuel{display:flex;flex-wrap:wrap;gap:8px}
  /* Field wrapper: ετικέτα 10px ΚΕΦΑΛΑΙΑ πάνω από το input (round 2 D). */
  .ex-field{display:flex;flex-direction:column;gap:3px;max-width:100%}
  .ex-flabel{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-mid)}
  .ex-field .ex-ei{width:100%}
  .ex-cn{line-height:1.4}
  /* Κατηγορία ως pill (round 2 D): amber καύσιμα, μπλε διόδια/κάρτες/φέρι,
     πράσινο κόμιστρο συνεργάτη, γκρι τα υπόλοιπα — μόνο tokens, καμία νέα hex. */
  .ex-pill{display:inline-block;font-size:11px;font-weight:600;padding:1px 7px;border-radius:9999px}
  .ex-pill-amber{background:var(--warn-bg);color:var(--warn)}
  .ex-pill-blue{background:var(--accent-light);color:var(--accent-text)}
  .ex-pill-green{background:var(--success-bg);color:var(--ok)}
  .ex-pill-gray{background:var(--surface-sunken);color:var(--text-mid)}
  .ex-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;justify-content:flex-end}
  .ex-assign{width:100%;max-width:170px}
  .ex-link{background:none;border:0;color:var(--accent);font:inherit;font-size:12px;cursor:pointer;padding:0}
  .ex-link.danger{color:var(--danger)}
  .ex-btn{height:32px;padding:0 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface-card);font:inherit;font-size:12px;cursor:pointer;color:var(--text)}
  </style>`;
}

// ═══════════════════ ΦΟΡΤΩΣΗ + ΚΕΛΥΦΟΣ ═══════════════════

async function renderExpenses() {
  const c = document.getElementById('content');
  if (can('costs') === 'none') { c.innerHTML = showAccessDenied(); return; }
  _ex.canWrite = can('costs') === 'full';
  c.style.padding = '0';
  _ex.selected = null; _ex.panelLines = []; _ex.panelErr = null; _ex.editId = null; _ex.q = '';
  c.innerHTML = exStyles() + '<div class="ex-page"><div style="padding:32px;color:var(--text-mid)">Φόρτωση εξόδων…</div></div>';
  try {
    const [rtRes, lookupsRes, linesRes] = await Promise.all([
      ctFetch('/costs/rt'),
      ctFetch('/costs/lookups'),
      ctFetch('/costs/lines')
    ]);
    // Cancelled trips and anything older than 60 days don't belong in a
    // screen for logging today's receipts (spec §3 «τελευταίων 60 ημερών»).
    _ex.rts = (rtRes.records || []).filter(r => r.status !== 'cancelled' && exWithinDays(r.date_start, 60));
    _ex.lookups = lookupsRes || {};
    _ex.allLines = linesRes.records || [];
  } catch (e) {
    c.innerHTML = exStyles() + '<div class="ex-page">' + showError('Τα έξοδα δεν φορτώθηκαν: ' + e.message) + '</div>';
    return;
  }
  _ex.importDocs = []; _ex.importDocsLoading = true; _ex.importDocsErr = null;
  exRenderPage();
  exLoadImportDocs(); // fire-and-forget — re-renders the whole page again on arrival, same pattern exAfterMutation already uses
}

// GET /costs/import/docs (spec round 2 point 4) — a plain list, read-only
// here. Not on the Promise.all above on purpose: this band is supplementary,
// its own failure (or the route not existing yet) must never block the rest
// of the screen loading (αρχή 1 in the other direction — a secondary defect
// stays visible in ITS OWN corner, not by taking the whole page down).
async function exLoadImportDocs() {
  try {
    const res = await ctFetch('/costs/import/docs');
    _ex.importDocs = (res && (res.records || res.docs)) || [];
    _ex.importDocsErr = null;
  } catch (e) {
    _ex.importDocs = [];
    _ex.importDocsErr = e.message;
  }
  _ex.importDocsLoading = false;
  exRenderPage();
}

function exImportDocsSectionHtml() {
  if (_ex.importDocsLoading) return `<div class="ex-idocs"><div class="ex-idochead">Εισαγωγές</div><div class="s dim" style="padding:4px 24px 8px">Φόρτωση…</div></div>`;
  if (_ex.importDocsErr) return `<div class="ex-idocs"><div class="ex-idochead">Εισαγωγές</div><div class="s dim" style="padding:4px 24px 8px">Δεν φορτώθηκαν: ${escapeHtml(_ex.importDocsErr)}</div></div>`;
  if (!_ex.importDocs.length) return `<div class="ex-idocs"><div class="ex-idochead">Εισαγωγές</div><div class="s dim" style="padding:4px 24px 8px">Καμία εισαγωγή DKV ακόμη.</div></div>`;
  return `<div class="ex-idocs"><div class="ex-idochead">Εισαγωγές</div>${_ex.importDocs.map(exImportDocRowHtml).join('')}</div>`;
}

// «DKV · <invoice_no> · <period_from–period_to> · <lines_total> γραμμές ·
// <status> · <created_by> <date>» (spec round 2 point 4). invoice_no absent
// on a draft (no παραστατικό εκδόθηκε ακόμη) — falls back to the zip name.
function exImportDocRowHtml(d) {
  const period = d.period_from && d.period_to ? (exDate(d.period_from) + '–' + exDate(d.period_to)) : '—';
  const isDraft = d.status === 'draft';
  const statusTxt = isDraft ? 'πρόχειρο' : (d.status || '—');
  const when = d.created_at ? exDate(d.created_at) : '';
  const label = 'DKV · ' + (d.invoice_no || d.zip_name || '—') + ' · ' + period + ' · ' + (d.lines_total != null ? d.lines_total : '—') + ' γραμμές · ' + statusTxt + ' · ' + (d.created_by || '—') + (when ? ' ' + when : '');
  return `<div class="ex-idoc-row">
    <span class="s">${escapeHtml(label)}</span>
    <button class="ex-link" onclick='exOpenImportZip(${JSON.stringify(String(d.id))})'>ZIP</button>
  </div>`;
}

// GET .../docs?id=..&signed=1 on click, not eagerly for the whole list — a
// signed URL is a short-lived credential, no reason to mint one nobody asked
// to open yet.
async function exOpenImportZip(id) {
  try {
    const res = await ctFetch('/costs/import/docs?id=' + encodeURIComponent(id) + '&signed=1');
    const url = res && (res.signed_url || (res.doc && res.doc.signed_url));
    if (!url) { showErrorToast('Δεν βρέθηκε σύνδεσμος ZIP.', 'error'); return; }
    window.open(url, '_blank');
  } catch (e) { exShowError(e); }
}

function exTopStats() {
  const { start, end } = exWeekBounds();
  const weekNet = _ex.allLines.filter(l => l.line_date && l.line_date >= start && l.line_date <= end)
    .reduce((a, l) => a + Number(l.net || 0), 0);
  // One definition of «χωρίς δρομολόγιο»: the Worker's alloc_status, the same
  // key the right panel filters on. `!rt_id` would also count lines in
  // `review`, which the panel never shows (critic 7/9).
  // The Worker caps the unfiltered GET /costs/lines at 300 rows. A snapshot of
  // exactly 300 is almost certainly truncated: say «300+» and explain, never
  // present a capped count as the whole truth (αρχή 1). Per-trip totals from
  // the same snapshot are null (rendered «—») when a trip has no rows in it.
  return {
    weekNet, count: _ex.allLines.length, capped: _ex.allLines.length >= EX_LINES_CAP,
    unallocated: _ex.allLines.filter(l => l.alloc_status === 'unallocated').length
  };
}
const EX_LINES_CAP = 300;

function exTripTotal(rtId) {
  const rows = _ex.allLines.filter(l => l.rt_id === rtId);
  return rows.length ? rows.reduce((a, l) => a + Number(l.net || 0), 0) : null;
}

function exFilteredTrips() {
  const q = _ex.q.trim().toLowerCase();
  if (!q) return _ex.rts;
  return _ex.rts.filter(r => {
    const plate = exTruckName(r.truck_id).toLowerCase();
    const person = exPersonName(r).toLowerCase();
    return plate.includes(q) || person.includes(q) || String(r.date_start || '').includes(q);
  });
}

function exRenderPage() {
  const c = document.getElementById('content');
  // The DKV import view (modules/expenses_import.js) replaces #content in
  // place. A late refetch of this page (lookups/docs arriving after the user
  // already clicked «Εισαγωγή DKV») must not paint the list over it — seen
  // live 8/9: the import screen vanished 2–3 s after opening. If the import
  // view is on screen, this render is simply not ours to do.
  if (c && c.querySelector('.ei-page')) return;
  const stats = exTopStats();
  const trips = exFilteredTrips();
  const listHtml = exUnallocatedRowHtml()
    + (trips.length ? exGroupedTripsHtml(trips) : showEmpty({ title: 'Κανένα δρομολόγιο', description: 'Άλλαξε αναζήτηση.' }));
  c.innerHTML = exStyles() + `<div class="ex-page">
    <div class="ex-head"><span class="ex-title">Έξοδα Δρομολογίων</span>${_ex.canWrite ? '<button class="btn-new-order" style="margin-left:auto" onclick="eiOpenImport()">Εισαγωγή DKV</button>' : ''}</div>
    <div class="ex-strip">
      <div class="ex-hero-big"><div class="v">${exEur(stats.weekNet)}</div><div class="k">αυτή την εβδομάδα</div></div>
      <div class="ex-hero-sm"><div class="v">${stats.capped ? EX_LINES_CAP + '+' : stats.count}</div><div class="k">γραμμές</div></div>
      <div class="ex-hero-sm${stats.unallocated > 0 ? ' ex-warn' : ''}"><div class="v">${stats.capped ? stats.unallocated + '+' : stats.unallocated}</div><div class="k">χωρίς δρομολόγιο</div></div>
    </div>
    ${exImportDocsSectionHtml()}
    ${stats.capped ? `<div class="ex-cap-note">Οι αριθμοί καλύπτουν τις ${EX_LINES_CAP} πιο πρόσφατες γραμμές — τα σύνολα ανά δρομολόγιο ισχύουν μόνο για όσα φαίνονται με ποσό.</div>` : ''}
    <div class="ex-split">
      <div class="ex-list">
        <input class="ex-search" placeholder="Αναζήτηση…" value="${escapeHtml(_ex.q)}" oninput="exSearchInput(this)">
        <div class="ex-legend"><span><span class="ex-dot ex-progress"></span>Σε εξέλιξη</span><span><span class="ex-dot ex-done"></span>Ολοκληρώθηκε</span></div>
        <div class="ex-list-rows">${listHtml}</div>
      </div>
      <div class="ex-right">${exRightHtml()}</div>
    </div>
  </div>`;
}

// Ομαδοποίηση κατά εβδομάδα πλανισμού (round 2 C, owner 7/9 night) — ίδιο
// ctWeekOf με το TRIP PnL (modules/costs.js, φορτώνει πριν αυτό το αρχείο),
// ΧΩΡΙΣ σύνολο εσόδων/κέρδους: μόνο το άθροισμα των εξόδων που ήδη δείχνει η
// στήλη «σύνολο» κάθε γραμμής (spec §1 — ποτέ έσοδα/περιθώριο σε αυτή την
// οθόνη). Καμία αναδίπλωση/κλείσιμο εδώ (σε αντίθεση με το TRIP PnL) — δεν
// ζητήθηκε και θα ήταν πολυπλοκότητα χωρίς λόγο (αρχή απλότητας).
function exGroupedTripsHtml(trips) {
  const groups = {}, order = [];
  trips.forEach(r => {
    const w = typeof ctWeekOf === 'function' ? ctWeekOf(r.date_start) : null;
    const key = w ? w.start : 'χωρίς-ημερομηνία';
    if (!groups[key]) { groups[key] = { info: w, trips: [] }; order.push(key); }
    groups[key].trips.push(r);
  });
  order.sort((a, b) => b.localeCompare(a)); // Σάββατο ISO ως string — νεότερη πρώτη
  return order.map(key => {
    const g = groups[key];
    const total = g.trips.reduce((a, r) => a + (exTripTotal(r.id) || 0), 0);
    const label = g.info ? g.info.label : 'Χωρίς ημερομηνία';
    return `<div class="ex-wkhead"><span>${escapeHtml(label)}</span><span class="ex-wktot">${exEur(total)}</span></div>` +
      g.trips.map(exTripRowHtml).join('');
  }).join('');
}

function exSearchInput(el) {
  const pos = el.selectionStart;
  _ex.q = el.value;
  exRenderPage();
  const s = document.querySelector('.ex-search');
  if (s) { s.focus(); s.setSelectionRange(pos, pos); }
}

function exUnallocatedRowHtml() {
  const n = _ex.allLines.filter(l => l.alloc_status === 'unallocated').length;
  const sel = _ex.selected === 'none';
  return `<div class="ex-lrow${sel ? ' sel' : ''}" onclick="exSelectNone()">
    <div class="ex-lrow-main"><span class="m">Χωρίς δρομολόγιο</span></div>
    <div class="ex-lrow-side"><span class="n${n > 0 ? ' ex-warn' : ''}">${n}</span></div>
  </div>`;
}

function exTripRowHtml(r) {
  const total = exTripTotal(r.id);
  const done = r.status === 'closed' || r.status === 'complete';
  const route = r.route_text ? (String(r.route_text).length > 40 ? escapeHtml(String(r.route_text).slice(0, 40)) + '…' : escapeHtml(r.route_text)) : '—';
  // Η κατάσταση λέγεται με λέξη ΜΙΑ φορά, στο legend πάνω από τη λίστα — εδώ
  // μόνο η έγχρωμη κουκκίδα (round 2 D· title="" κρατά τη λέξη για hover/a11y).
  return `<div class="ex-lrow${_ex.selected === r.id ? ' sel' : ''}" onclick="exSelectRt(${r.id})">
    <div class="ex-lrow-main">
      <span class="ex-plate sm">${escapeHtml(exTruckName(r.truck_id))}</span>
      <span class="s">${escapeHtml(exPersonName(r))} · ${exDateRange(r.date_start, r.date_end)}</span>
      <span class="s dim">${route}</span>
    </div>
    <div class="ex-lrow-side">
      <span class="n">${total == null ? '—' : exEur(total)}</span>
      <span class="ex-dot ${done ? 'ex-done' : 'ex-progress'}" title="${done ? 'Ολοκληρώθηκε' : 'Σε εξέλιξη'}"></span>
    </div>
  </div>`;
}

// ═══════════════════ ΕΠΙΛΟΓΗ + ΔΕΞΙΟ ΠΑΝΕΛ ═══════════════════

async function exSelectRt(id) {
  _ex.selected = id; _ex.editId = null; _ex.panelLoading = true; _ex.panelErr = null;
  const rt = _ex.rts.find(r => r.id === id);
  _ex.qe = { category: EX_CATEGORIES[0], date: (rt && rt.date_start) || exTodayIso() };
  exRenderPage();
  try {
    const r = await ctFetch('/costs/lines?rt_id=' + id);
    _ex.panelLines = r.records || [];
  } catch (e) { _ex.panelErr = e.message; _ex.panelLines = []; }
  _ex.panelLoading = false;
  exRenderPage();
}

async function exSelectNone() {
  _ex.selected = 'none'; _ex.editId = null; _ex.panelLoading = true; _ex.panelErr = null;
  _ex.qe = { category: EX_CATEGORIES[0], date: exTodayIso() };
  exRenderPage();
  try {
    const r = await ctFetch('/costs/lines?alloc_status=unallocated');
    _ex.panelLines = r.records || [];
  } catch (e) { _ex.panelErr = e.message; _ex.panelLines = []; }
  _ex.panelLoading = false;
  exRenderPage();
}

function exRightHtml() {
  if (_ex.selected === null) return showEmpty({ title: 'Επίλεξε δρομολόγιο', description: 'Κλικ σε ένα δρομολόγιο από τη λίστα, ή «Χωρίς δρομολόγιο».' });
  if (_ex.panelLoading) return `<div style="padding:32px;color:var(--text-mid)">Φόρτωση…</div>`;
  if (_ex.panelErr) return showError('Οι γραμμές δεν φορτώθηκαν: ' + _ex.panelErr);
  const isNone = _ex.selected === 'none';
  const rt = isNone ? null : _ex.rts.find(r => r.id === _ex.selected);
  if (!isNone && !rt) return showError('Το δρομολόγιο δεν βρέθηκε.');
  const netSum = _ex.panelLines.reduce((a, l) => a + Number(l.net || 0), 0);
  const vatSum = _ex.panelLines.reduce((a, l) => a + Number(l.vat || 0), 0);
  const heroHtml = isNone
    ? `<div class="ex-hero"><div class="ex-hero-main"><span class="ex-title" style="font-size:18px">Χωρίς δρομολόγιο</span></div>
        <div class="ex-hero-stat"><div class="k">Καθαρό</div><div class="v">${exEur(netSum)}</div></div>
        <div class="ex-hero-stat"><div class="k">ΦΠΑ</div><div class="v">${exEur(vatSum)}</div></div></div>`
    : `<div class="ex-hero">
        <div class="ex-hero-main">
          <div><span class="ex-plate lg">${escapeHtml(exTruckName(rt.truck_id))}</span></div>
          <span class="s">${escapeHtml(exPersonName(rt))} · ${exDateRange(rt.date_start, rt.date_end)}${rt.route_text ? ' · ' + escapeHtml(rt.route_text) : ''}</span>
        </div>
        <div class="ex-hero-stat"><div class="k">Καθαρό</div><div class="v">${exEur(netSum)}</div></div>
        <div class="ex-hero-stat"><div class="k">ΦΠΑ</div><div class="v">${exEur(vatSum)}</div></div>
      </div>`;
  const qeHtml = _ex.canWrite ? exQeRowHtml() : '';
  const rowsHtml = _ex.panelLines.length
    ? _ex.panelLines.map(l => exLineRowHtml(l, { unallocated: isNone })).join('')
    : showEmpty({ title: 'Καμία γραμμή ακόμη', description: '' });
  const thHtml = `<div class="ex-th ex-line-grid"><div>Ημ/νία</div><div>Κατηγορία · Σημείωση</div><div>Λίτρα</div><div class="r">Καθαρό</div><div class="r">ΦΠΑ</div><div>Ποιος</div><div></div></div>`;
  return heroHtml + thHtml + `<div>${qeHtml}${rowsHtml}</div>`;
}

// ═══════════════════ ΓΡΗΓΟΡΗ ΚΑΤΑΧΩΡΗΣΗ ═══════════════════

function exQeRowHtml() {
  const fuelOn = EX_FUEL_CATEGORIES.includes(_ex.qe.category);
  const opts = EX_CATEGORIES.map(c => `<option value="${c}"${_ex.qe.category === c ? ' selected' : ''}>${escapeHtml(CT_CATEGORY_LABELS[c] || c)}</option>`).join('');
  // Row 1: category/date/net/vat · row 2: note + hint · row 3: fuel fields
  // (spec §3 point 2 + coordinator defect 1). The .ex-qe-break before the
  // fuel span stays in the DOM even when hidden — exQeCategoryChange only
  // toggles that span's display, it never re-renders this row, so the break
  // must always be present or the layout would jump when it appears.
  // Κάθε πεδίο σε δικό του .ex-field (ετικέτα 10px ΚΕΦΑΛΑΙΑ πάνω από το input —
  // «top tier» D, owner 8/9): οι ΙΔΙΕΣ κλάσεις πλάτους (ex-qe-cat/date/amt/note)
  // μεταφέρθηκαν από τα inputs στα wrapper divs, άρα το CSS layout (defect 1,
  // 7/9 — καμία οριζόντια κύλιση) μένει ακριβώς το ίδιο. Τα ids ΔΕΝ άλλαξαν.
  return `<div class="ex-row qe">
    <div class="ex-field ex-qe-cat"><label class="ex-flabel">Κατηγορία</label><select class="ex-ei" id="exQeCategory" onchange="exQeCategoryChange(this)">${opts}</select></div>
    <div class="ex-field ex-qe-date"><label class="ex-flabel">Ημερομηνία</label><input class="ex-ei" type="date" id="exQeDate" value="${_ex.qe.date || ''}" onchange="exQeDateChange(this)"></div>
    <div class="ex-field ex-qe-amt"><label class="ex-flabel">Καθαρό €</label><input class="ex-ei" type="number" step="0.01" id="exQeNet" placeholder="0,00" onkeydown="exQeKeydown(event)"></div>
    <div class="ex-field ex-qe-amt"><label class="ex-flabel">ΦΠΑ €</label><input class="ex-ei" type="number" step="0.01" id="exQeVat" placeholder="0,00" onkeydown="exQeKeydown(event)"></div>
    <div class="ex-qe-break"></div>
    <div class="ex-field ex-qe-note"><label class="ex-flabel">Σημείωση / παραστατικό</label><input class="ex-ei" type="text" id="exQeNote" placeholder="π.χ. αρ. απόδειξης" onkeydown="exQeKeydown(event)"></div>
    <span class="ex-qe-hint">Enter = αποθήκευση · <button class="ex-link" type="button" onclick="exOpenEntryModalFromRow()">σε παράθυρο</button></span>
    <div class="ex-qe-break"></div>
    <span id="exQeFuelFields" class="ex-qe-fuel" style="display:${fuelOn ? 'flex' : 'none'}">
      <div class="ex-field" style="width:90px"><label class="ex-flabel">Λίτρα</label><input class="ex-ei" type="number" step="0.01" id="exQeLiters" onkeydown="exQeKeydown(event)"></div>
      <div class="ex-field" style="width:100px"><label class="ex-flabel">Χιλιόμετρα</label><input class="ex-ei" type="number" step="1" min="0" id="exQeKm" onkeydown="exQeKeydown(event)"></div>
      <div class="ex-field" style="width:120px"><label class="ex-flabel">Πρατήριο</label><input class="ex-ei" type="text" id="exQeStation" onkeydown="exQeKeydown(event)"></div>
    </span>
  </div>`;
}

function exQeCategoryChange(el) {
  _ex.qe.category = el.value;
  const g = document.getElementById('exQeFuelFields');
  if (g) g.style.display = EX_FUEL_CATEGORIES.includes(el.value) ? 'flex' : 'none';
}

function exQeDateChange(el) { _ex.qe.date = el.value; }

function exQeKeydown(ev) { if (ev.key === 'Enter') { ev.preventDefault(); exQeSubmit(); } }

// Κοινό σώμα POST /costs/lines — το μοιράζονται η ενσωματωμένη γραμμή γρήγορης
// καταχώρησης (exQeSubmit) ΚΑΙ το modal «μία φόρμα, δύο πόρτες» (exModalSubmit,
// round 2), ώστε ο κανόνας «καθαρό ή ΦΠΑ υποχρεωτικό»/τα πεδία καυσίμων να
// ζουν σε ΕΝΑ σημείο (αρχή 3) — πριν, το TRIP PnL (modules/costs.js) είχε
// ξαναγράψει το ίδιο σχήμα ακόμη δύο φορές. Δέχεται ήδη-διαβασμένες τιμές
// (όχι DOM ids) ώστε να μη νοιάζεται ποια φόρμα τις παρήγαγε. rtId: null
// («Χωρίς δρομολόγιο») ή αριθμός.
function exBuildLineBody(rtId, v) {
  if (!v.date) { showErrorToast('Χρειάζεται ημερομηνία.', 'error'); return null; }
  // Mirrors the Worker's own check (POST /costs/lines): "net or vat amount
  // required" — caught here first so a blank submit doesn't round-trip.
  if (v.net === '' && v.vat === '') { showErrorToast('Χρειάζεται καθαρό ή ΦΠΑ ποσό.', 'error'); return null; }
  const body = { category: v.category, line_date: v.date };
  if (rtId != null) body.rt_id = Number(rtId);
  if (v.net !== '') body.net = Number(v.net);
  if (v.vat !== '') body.vat = Number(v.vat);
  const note = (v.note || '').trim();
  if (note) body.note = note;
  if (EX_FUEL_CATEGORIES.includes(v.category)) {
    if (v.liters !== '' && v.liters != null) body.liters = Number(v.liters);
    if (v.km !== '' && v.km != null) body.km_reading = Math.round(Number(v.km)); // integer column
    const station = (v.station || '').trim();
    if (station) body.station = station;
  }
  return body;
}

async function exQeSubmit() {
  const g = id => document.getElementById(id);
  const body = exBuildLineBody(_ex.selected === 'none' ? null : _ex.selected, {
    category: g('exQeCategory').value, date: g('exQeDate').value,
    net: g('exQeNet').value, vat: g('exQeVat').value, note: g('exQeNote').value,
    liters: g('exQeLiters') ? g('exQeLiters').value : '', km: g('exQeKm') ? g('exQeKm').value : '', station: g('exQeStation') ? g('exQeStation').value : ''
  });
  if (!body) return;
  try {
    await ctFetch('/costs/lines', { method: 'POST', body });
    await exAfterMutation();
    // Category + date stay (spec §3: πολλές αποδείξεις στη σειρά) — only the
    // amount fields cleared, done implicitly by exRenderPage rebuilding the
    // row from _ex.qe, which was never touched above.
    const netEl = document.getElementById('exQeNet');
    if (netEl) netEl.focus();
  } catch (e) { exShowError(e); }
}

// ═══════════════════ ΓΡΑΜΜΗ / ΔΙΟΡΘΩΣΗ / ΔΙΑΓΡΑΦΗ / ΑΝΑΘΕΣΗ ═══════════════════

function exLineRowHtml(line, opts) {
  if (_ex.editId === line.id) return exEditLineRowHtml(line);
  const mine = typeof user !== 'undefined' && user && line.created_by === user.username;
  const canEditThis = _ex.canWrite && (mine || ROLE === 'owner');
  const litersTxt = line.liters != null ? Number(line.liters).toLocaleString('el-GR', { maximumFractionDigits: 2 }) + ' L' : '';
  const assignHtml = (opts && opts.unallocated && _ex.canWrite)
    ? `<select class="ex-ei ex-assign" onchange="exAssignLine(${line.id}, this.value)">
        <option value="">Ανάθεση σε δρομολόγιο…</option>
        ${_ex.rts.map(r => `<option value="${r.id}">${escapeHtml(exTruckName(r.truck_id))} · ${exDateRange(r.date_start, r.date_end)}</option>`).join('')}
      </select>`
    : '';
  const actionsHtml = canEditThis
    ? `<button class="ex-link" onclick="exEditLine(${line.id})">Διόρθωση</button><button class="ex-link danger" onclick="exDeleteLine(${line.id})">Διαγραφή</button>`
    : '';
  // Date · category+note (stacked) · liters · net · vat · user · actions —
  // the .ex-line-grid columns fixed in exStyles() (defect 1, spec §3 pt 3).
  return `<div class="ex-row ex-line-grid">
    <div class="s">${exDate(line.line_date)}</div>
    <div class="ex-cn"><span class="ex-pill ${exCatPillClass(line.category)}">${escapeHtml(CT_CATEGORY_LABELS[line.category] || line.category)}</span>${line.note ? `<br><span class="s dim">${escapeHtml(line.note)}</span>` : ''}</div>
    <div class="s dim">${litersTxt}</div>
    <div class="n r">${exEur(line.net)}</div>
    <div class="n r dim">${exEur(line.vat)}</div>
    <div class="s dim ex-user" title="${escapeHtml(line.created_by || '')}">${escapeHtml(line.created_by || '')}</div>
    <div class="ex-actions">${assignHtml}${actionsHtml}</div>
  </div>`;
}

function exEditLineRowHtml(line) {
  const p = id => id + '_' + line.id;
  const fuelOn = EX_FUEL_CATEGORIES.includes(line.category);
  const opts = EX_CATEGORIES.map(c => `<option value="${c}"${line.category === c ? ' selected' : ''}>${escapeHtml(CT_CATEGORY_LABELS[c] || c)}</option>`).join('');
  // Same wrapping grid as the quick-entry row (.qe) — it edits the identical
  // field set (category/date/net/vat/note/fuel), just with a Save/Cancel pair
  // appended, so reusing the entry row's layout is the direct fix for the
  // same overflow (coordinator defect 1) rather than a second bespoke layout.
  return `<div class="ex-row edit qe">
    <select class="ex-ei ex-qe-cat" id="${p('exEdCategory')}" onchange="exEdCategoryChange(${line.id}, this)">${opts}</select>
    <input class="ex-ei ex-qe-date" type="date" id="${p('exEdDate')}" value="${line.line_date || ''}">
    <input class="ex-ei ex-qe-amt" type="number" step="0.01" id="${p('exEdNet')}" value="${line.net ?? ''}">
    <input class="ex-ei ex-qe-amt" type="number" step="0.01" id="${p('exEdVat')}" value="${line.vat ?? ''}">
    <div class="ex-qe-break"></div>
    <input class="ex-ei ex-qe-note" type="text" id="${p('exEdNote')}" value="${escapeHtml(line.note || '')}">
    <div class="ex-qe-break"></div>
    <span id="${p('exEdFuelFields')}" class="ex-qe-fuel" style="display:${fuelOn ? 'flex' : 'none'}">
      <input class="ex-ei" style="width:90px" type="number" step="0.01" id="${p('exEdLiters')}" value="${line.liters ?? ''}">
      <input class="ex-ei" style="width:100px" type="number" step="1" min="0" id="${p('exEdKm')}" value="${line.km_reading ?? ''}">
      <input class="ex-ei" style="width:120px" type="text" id="${p('exEdStation')}" value="${escapeHtml(line.station || '')}">
    </span>
    <div class="ex-qe-break"></div>
    <button class="ex-btn" onclick="exSaveEdit(${line.id})">Αποθήκευση</button>
    <button class="ex-btn" onclick="exCancelEdit()">Άκυρο</button>
  </div>`;
}

function exEdCategoryChange(id, el) {
  const g = document.getElementById('exEdFuelFields_' + id);
  if (g) g.style.display = EX_FUEL_CATEGORIES.includes(el.value) ? 'flex' : 'none';
}

function exEditLine(id) { _ex.editId = id; exRenderPage(); }
function exCancelEdit() { _ex.editId = null; exRenderPage(); }

// PATCH /costs/lines/:id requires a non-empty `reason` (worker/src/index.js
// — the same ΣΗΜΑΔΕΜΕΝΗ ΠΡΟΣΘΗΚΗ the owner-only TRIP PnL screen already
// used); without it every correction here would 400.
async function exSaveEdit(id) {
  const g = k => document.getElementById(k + '_' + id);
  const category = g('exEdCategory').value;
  const line_date = g('exEdDate').value;
  const netStr = g('exEdNet').value, vatStr = g('exEdVat').value;
  const reason = window.prompt('Αιτιολογία διόρθωσης (υποχρεωτική):');
  if (!reason || !reason.trim()) return;
  const body = { category, line_date, reason: reason.trim(), net: netStr === '' ? 0 : Number(netStr), vat: vatStr === '' ? 0 : Number(vatStr) };
  const note = g('exEdNote').value.trim();
  if (note) body.note = note;
  if (EX_FUEL_CATEGORIES.includes(category)) {
    const liters = g('exEdLiters').value, km = g('exEdKm').value, station = g('exEdStation').value.trim();
    if (liters !== '') body.liters = Number(liters);
    if (km !== '') body.km_reading = Math.round(Number(km)); // integer column
    if (station) body.station = station;
  }
  try {
    await ctFetch('/costs/lines/' + id, { method: 'PATCH', body });
    _ex.editId = null;
    await exAfterMutation();
  } catch (e) { exShowError(e); }
}

async function exDeleteLine(id) {
  if (!window.confirm('Διαγραφή γραμμής εξόδου; Δεν αναιρείται.')) return;
  const reason = window.prompt('Αιτιολογία διαγραφής (υποχρεωτική):');
  if (!reason || !reason.trim()) return;
  try {
    await ctFetch('/costs/lines/' + id, { method: 'DELETE', body: { reason: reason.trim() } });
    await exAfterMutation();
  } catch (e) { exShowError(e); }
}

async function exAssignLine(id, val) {
  if (!val) return;
  const reason = window.prompt('Αιτιολογία ανάθεσης (υποχρεωτική):');
  if (!reason || !reason.trim()) return;
  try {
    await ctFetch('/costs/lines/' + id, { method: 'PATCH', body: { rt_id: Number(val), reason: reason.trim() } });
    await exAfterMutation();
  } catch (e) { exShowError(e); }
}

// Shared by every write path: reloads the unfiltered snapshot (top stats +
// left-list per-trip totals) and whatever the right panel is showing, straight
// from the server — never a local increment (αρχή 2).
async function exAfterMutation() {
  // A failed refetch must be heard (αρχή 1): the write went through, but the
  // totals on screen are now stale — say so instead of pretending.
  try { _ex.allLines = (await ctFetch('/costs/lines')).records || []; }
  catch (e) { showErrorToast('Η καταχώρηση έγινε, αλλά τα σύνολα δεν ανανεώθηκαν: ' + e.message, 'error'); }
  if (_ex.selected !== null) {
    try {
      _ex.panelLines = _ex.selected === 'none'
        ? (await ctFetch('/costs/lines?alloc_status=unallocated')).records || []
        : (await ctFetch('/costs/lines?rt_id=' + _ex.selected)).records || [];
      _ex.panelErr = null;
    } catch (e) { _ex.panelErr = e.message; }
  }
  exRenderPage();
}

// ═══════════════════ ΜΙΑ ΦΟΡΜΑ, ΔΥΟ ΠΟΡΤΕΣ (round 2, owner 7/9 night) ═══════
// exOpenEntryModal(): οι ΙΔΙΕΣ πεδία/κανόνες με την ενσωματωμένη γρήγορη
// καταχώρηση (exBuildLineBody, exQeSubmit πιο πάνω), ως κεντραρισμένο modal.
// Δύο καλούντες:
//   1. Αυτή η οθόνη — προαιρετικά, σύνδεσμος «σε παράθυρο» δίπλα στο Enter-hint.
//   2. Το TRIP PnL (modules/costs.js, owner-only, ctOpenEntry) — αντικατέστησε
//      τις τρεις παλιές αντιγραφές του ίδιου σχήματος εκεί (αρχή 3).
// Η κάρτα προσθέτει δικό της <style id="exModalStyleTag"> στο <head> αντί να
// βασίζεται στο exStyles() του #content: το modal μπορεί να ανοίξει ΚΑΙ όταν
// η τρέχουσα σελίδα είναι το TRIP PnL, όπου το exStyles() δεν έχει ποτέ
// εγχυθεί στο DOM (μόνο το renderExpenses() το κάνει, στο δικό του render).
let _exModalState = null;

function exEnsureModalStyles() {
  if (document.getElementById('exModalStyleTag')) return;
  const tag = document.createElement('style');
  tag.id = 'exModalStyleTag';
  tag.textContent = `
    .ex-modal-scrim{position:fixed;inset:0;background:rgba(11,25,41,.45);z-index:var(--z-overlay,9000)}
    .ex-modal-box{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:520px;max-width:94vw;max-height:90vh;overflow-y:auto;background:var(--surface-card);border-radius:6px;box-shadow:var(--shadow-md);z-index:calc(var(--z-overlay,9000) + 1);font-family:'DM Sans',sans-serif;color:var(--text)}
    .ex-modal-head{background:var(--surface-dark);color:var(--text-on-dark);padding:12px 20px;font-family:'Syne',sans-serif;font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .ex-modal-close{background:none;border:0;color:var(--text-dim);font-size:18px;cursor:pointer;line-height:1}
    .ex-modal-body{padding:16px 20px}
    .ex-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .ex-modal-grid .ex-field{grid-column:span 1}
    .ex-modal-grid .ex-field.ex-modal-wide{grid-column:1/-1}
    .ex-modal-fuel{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:12px}
    .ex-modal-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
  `;
  document.head.appendChild(tag);
}

// /costs/lookups is the SAME shape from both modules — whichever one already
// fetched it is reused, so the modal never needs a third fetch of its own
// (αρχή 3). Neither cache may exist yet (e.g. modal opened before either
// screen ever loaded) — every lookup below tolerates that with «—».
function exModalLookups() {
  if (_ex.lookups) return _ex.lookups;
  if (typeof _ct !== 'undefined' && _ct.lookups) return _ct.lookups;
  return null;
}
function exModalTruckName(id) { const lk = exModalLookups(); const t = lk && (lk.trucks || []).find(x => x.id === id); return t ? t.license_plate : null; }
function exModalDriverName(id) { const lk = exModalLookups(); const d = lk && (lk.drivers || []).find(x => x.id === id); return d ? d.full_name : null; }
function exModalPartnerName(id) { const lk = exModalLookups(); const p = lk && (lk.partners || []).find(x => x.id === id); return p ? p.company_name : null; }

// Τίτλος από πινακίδα/οδηγό ΜΟΝΟ — ποτέ κωδικό RT (spec §1: «ποτέ κωδικοί RT»
// στην οθόνη της Αλεξίας) ούτε έσοδα/margin, ακόμη κι όταν ο καλών είναι το
// owner-only TRIP PnL — το ίδιο modal, η ίδια σύμβαση, ανεξάρτητα από ρόλο.
function exModalTitle(rt, rtId) {
  if (rtId == null) return 'Καταχώρηση κόστους — Χωρίς δρομολόγιο';
  if (!rt) return 'Καταχώρηση κόστους';
  const plate = exModalTruckName(rt.truck_id);
  const person = exModalDriverName(rt.driver_id) || exModalPartnerName(rt.partner_id);
  const parts = [plate, person].filter(Boolean);
  return 'Καταχώρηση κόστους' + (parts.length ? ' — ' + parts.join(' · ') : '');
}

/**
 * exOpenEntryModal({ rtId, rt, onSaved })
 * rtId: αριθμός δρομολογίου ή null («Χωρίς δρομολόγιο»).
 * rt:   προαιρετικό record (μόνο για προεπιλογή ημερομηνίας + τον τίτλο) —
 *       οποιοδήποτε σχήμα με date_start/truck_id/driver_id/partner_id.
 * onSaved: καλείται ΜΕΤΑ την επιτυχή POST — ο κάθε καλών ξαναφορτώνει τα δικά
 *          του δεδομένα (exAfterMutation εδώ, ctReload+ctOpenPanel στο costs.js).
 */
function exOpenEntryModal({ rtId, rt, onSaved }) {
  exEnsureModalStyles();
  _exModalState = {
    rtId: rtId == null ? null : Number(rtId), rt: rt || null, onSaved,
    category: (EX_CATEGORIES && EX_CATEGORIES[0]) || 'fuel',
    date: (rt && rt.date_start) || exTodayIso()
  };
  let host = document.getElementById('exModalHost');
  if (!host) { host = document.createElement('div'); host.id = 'exModalHost'; document.body.appendChild(host); }
  host.innerHTML = exModalHtml();
  const netEl = document.getElementById('exMdNet');
  if (netEl) netEl.focus();
}

function exModalHtml() {
  const s = _exModalState;
  const fuelOn = EX_FUEL_CATEGORIES.includes(s.category);
  const opts = EX_CATEGORIES.map(c => `<option value="${c}"${s.category === c ? ' selected' : ''}>${escapeHtml(CT_CATEGORY_LABELS[c] || c)}</option>`).join('');
  return `<div class="ex-modal-scrim" onclick="exCloseModal()"></div>
    <div class="ex-modal-box">
      <div class="ex-modal-head">${escapeHtml(exModalTitle(s.rt, s.rtId))}<button class="ex-modal-close" onclick="exCloseModal()">&times;</button></div>
      <div class="ex-modal-body">
        <div class="ex-modal-grid">
          <div class="ex-field"><label class="ex-flabel">Κατηγορία</label><select class="ex-ei" id="exMdCategory" onchange="exModalCategoryChange(this)">${opts}</select></div>
          <div class="ex-field"><label class="ex-flabel">Ημερομηνία</label><input class="ex-ei" type="date" id="exMdDate" value="${s.date || ''}"></div>
          <div class="ex-field"><label class="ex-flabel">Καθαρό €</label><input class="ex-ei" type="number" step="0.01" id="exMdNet" placeholder="0,00" onkeydown="exModalKeydown(event)"></div>
          <div class="ex-field"><label class="ex-flabel">ΦΠΑ €</label><input class="ex-ei" type="number" step="0.01" id="exMdVat" placeholder="0,00" onkeydown="exModalKeydown(event)"></div>
          <div class="ex-field ex-modal-wide"><label class="ex-flabel">Σημείωση / παραστατικό</label><input class="ex-ei" type="text" id="exMdNote" placeholder="π.χ. αρ. απόδειξης" onkeydown="exModalKeydown(event)"></div>
        </div>
        <div id="exMdFuelFields" class="ex-modal-fuel" style="display:${fuelOn ? 'grid' : 'none'}">
          <div class="ex-field"><label class="ex-flabel">Λίτρα</label><input class="ex-ei" type="number" step="0.01" id="exMdLiters" onkeydown="exModalKeydown(event)"></div>
          <div class="ex-field"><label class="ex-flabel">Χιλιόμετρα</label><input class="ex-ei" type="number" step="1" min="0" id="exMdKm" onkeydown="exModalKeydown(event)"></div>
          <div class="ex-field"><label class="ex-flabel">Πρατήριο</label><input class="ex-ei" type="text" id="exMdStation" onkeydown="exModalKeydown(event)"></div>
        </div>
        <div class="ex-modal-foot">
          <button class="ex-btn" onclick="exCloseModal()">Άκυρο</button>
          <button class="ex-btn ex-btn-primary" style="background:var(--accent);color:#fff;border-color:var(--accent)" onclick="exModalSubmit()">Αποθήκευση</button>
        </div>
      </div>
    </div>`;
}

function exModalCategoryChange(el) {
  if (_exModalState) _exModalState.category = el.value;
  const g = document.getElementById('exMdFuelFields');
  if (g) g.style.display = EX_FUEL_CATEGORIES.includes(el.value) ? 'grid' : 'none';
}
function exModalKeydown(ev) { if (ev.key === 'Enter') { ev.preventDefault(); exModalSubmit(); } }

async function exModalSubmit() {
  const s = _exModalState; if (!s) return;
  const g = id => document.getElementById(id);
  const body = exBuildLineBody(s.rtId, {
    category: g('exMdCategory').value, date: g('exMdDate').value,
    net: g('exMdNet').value, vat: g('exMdVat').value, note: g('exMdNote').value,
    liters: g('exMdLiters') ? g('exMdLiters').value : '', km: g('exMdKm') ? g('exMdKm').value : '', station: g('exMdStation') ? g('exMdStation').value : ''
  });
  if (!body) return;
  try {
    await ctFetch('/costs/lines', { method: 'POST', body });
    const onSaved = s.onSaved;
    exCloseModal();
    if (onSaved) onSaved();
  } catch (e) { exShowError(e); }
}

function exCloseModal() {
  _exModalState = null;
  const host = document.getElementById('exModalHost');
  if (host) host.innerHTML = '';
}

// Σύνδεσμος «σε παράθυρο» της ενσωματωμένης γραμμής γρήγορης καταχώρησης —
// ίδιο δρομολόγιο/«Χωρίς δρομολόγιο» με το ήδη επιλεγμένο (_ex.selected).
function exOpenEntryModalFromRow() {
  const rtId = _ex.selected === 'none' ? null : _ex.selected;
  const rt = rtId == null ? null : _ex.rts.find(r => r.id === rtId);
  exOpenEntryModal({ rtId, rt, onSaved: exAfterMutation });
}
