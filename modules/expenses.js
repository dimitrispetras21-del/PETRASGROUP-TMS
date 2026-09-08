// ═══════════════════════════════════════════════════════════
// MODULE — ΕΞΟΔΑ ΔΡΟΜΟΛΟΓΙΩΝ · εβδομαδιαίο φύλλο (v3, owner 8/9/2026: επιλογή Α)
// accountant/owner full, management read-only.
// Backend αμετάβλητο: /costs/rt (from/to), /costs/lookups, /costs/lines (Worker).
// Spec: docs/superpowers/specs/2026-09-07-trip-expenses-design.md §6 (v3)
// Figma: «fin-formal · Έξοδα A · Εβδομαδιαίο φύλλο» (541:1011).
//
// Why a week-first grid (owner 8/9): the previous list loaded EVERY round
// trip from /costs/rt and stacked them under week headers — the list grew
// with history and entry meant hunting for the trip. Entry is per trip per
// week, so the week is the unit: one fetch of the selected week's trips,
// rows = trips, columns = expense groups, cell = amount + line count, click
// on a cell = inline entry for that trip + category. Nothing older than the
// selected week is ever fetched.
// ctFetch/CT_CATEGORY_LABELS/ctWeekOf come from modules/costs.js (loaded
// earlier in app.html) — one list of category words, one week definition
// (Σάβ→Παρ, same as TRIP PnL), never a second copy (αρχή 3).
// ═══════════════════════════════════════════════════════════
'use strict';

// fixed_alloc excluded (spec §3): it is written by the future Tier-2
// allocator, never by hand. driver_pay/cash_m excluded: gone since 5/9/2026
// (see modules/costs.js comment) — the Worker's own CT_CATEGORIES no longer
// accepts them either.
const EX_CATEGORIES = ['fuel', 'reefer_fuel', 'tolls', 'dkv', 'adblue', 'spedition', 'accommodation', 'ferry_train', 'fines', 'partner_rate', 'other'];
const EX_FUEL_CATEGORIES = ['fuel', 'reefer_fuel', 'adblue'];
// Grid columns = expense GROUPS, not the 11 raw categories: the accountant
// reads «καύσιμα / διόδια / …» per trip, the raw category stays on the line.
// cats[0] is what the entry row preselects when the cell is opened.
// `expect` = which groups a CLOSED trip must have before it counts as
// complete: own truck → fuel + tolls; partner trip → the partner rate.
const EX_GROUPS = [
  { key: 'fuel', label: 'Καύσιμα', cats: ['fuel', 'reefer_fuel'] },
  { key: 'tolls', label: 'Διόδια', cats: ['tolls'] },
  { key: 'adblue', label: 'AdBlue', cats: ['adblue'] },
  { key: 'ferry', label: 'Γέφ./Φέρι', cats: ['ferry_train'] },
  { key: 'partner', label: 'Ναύλος', cats: ['partner_rate'] },
  { key: 'other', label: 'Λοιπά', cats: ['other', 'dkv', 'spedition', 'accommodation', 'fines'] }
];
const EX_EXPECT_OWN = ['fuel', 'tolls'];
const EX_EXPECT_PARTNER = ['partner'];
const EX_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
// Week strip: 4 weeks back, 2 forward around the selected one (Figma 541:1011).
const EX_STRIP_BACK = 4, EX_STRIP_FWD = 2;

// _ex.week: the selected planning week (ctWeekOf shape: start/end/week/label).
// _ex.rts: ONLY that week's trips (date_start inside it). _ex.linesByRt:
// rt_id → its lines, one filtered GET per trip (the Worker has no rt_id=in
// filter; ≤15 parallel small requests beat one 300-row-capped snapshot that
// silently drops history — αρχή 1). _ex.unalloc: every unallocated line; the
// «Χωρίς δρομολόγιο» row shows those dated inside the week, the summary says
// how many more sit outside it. _ex.open: the expanded cell {rtId|'none', group}.
const _ex = {
  lookups: null, canWrite: false,
  week: null, rts: [], stripRts: [], linesByRt: {}, unalloc: [],
  loading: false, err: null, q: '',
  open: null, editId: null, qe: null,
  // «Εισαγωγές» DKV band (round 2, spec point 4) — GET /costs/import/docs,
  // fetched separately from the critical page data so a slow/missing
  // endpoint never blocks the main screen.
  importDocs: [], importDocsLoading: false, importDocsErr: null
};

// Local calendar dates, never toISOString(): that is UTC, and between 00:00
// and 03:00 Athens time it names yesterday — «today» and the week bounds would
// shift a day (critic 7/9). localToday()/toLocalDate() are the app's helpers.
function exTodayIso() { return localToday(); }

function exShiftIso(iso, days) {
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days);
  return toLocalDate(d);
}

function exEur(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
// Cells carry the unit in the column header — amounts alone inside them.
function exNum(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function exDate(iso) {
  if (!iso) return '—';
  const [, m, d] = iso.slice(0, 10).split('-');
  return d + '/' + m;
}
// dd/mm/yyyy — the formal ledger convention (Figma 537:1011), used where a
// full date is a fact on record (row dates), not in the compact strip.
// Strip chips: «05–11/09» inside one month, «29/08–04/09» across two — the
// shortest form that still reads as dates, so the gap hint beside it fits.
function exShortRange(start, end) {
  const [, m1, d1] = start.slice(0, 10).split('-'), [, m2, d2] = end.slice(0, 10).split('-');
  return m1 === m2 ? d1 + '–' + d2 + '/' + m1 : d1 + '/' + m1 + '–' + d2 + '/' + m2;
}
function exDateFull(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d + '/' + m + '/' + y;
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
function exIsPartnerTrip(r) { return !!r.partner_id && !r.truck_id; }

// 403 from ctCan() (worker/src/index.js) always carries the literal message
// "Forbidden" — no HTTP status reaches this far through ctFetch, so that
// exact string is how a permission failure is told apart from any other
// server error (αρχή 1: ό,τι δεν γίνεται πρέπει να ακούγεται).
function exShowError(e) {
  const msg = (e && e.message) || String(e);
  showErrorToast(msg === 'Forbidden' ? ('Δεν έχεις δικαίωμα για αυτή την ενέργεια — ' + msg) : msg, 'error');
}

// Formal financial language (owner 8/9 «πιο professional και formal», Figma
// 537:1011 / 541:1011): white cards on the page ground, 4px radii, navy
// primary, ledger table with 2px header rule and a double-rule totals row,
// status as a word in neutral grey — attention only in the warn token.
// Tokens only, no new hex.
function exStyles() {
  return `<style>
  .ex-page{font-family:'DM Sans',sans-serif;font-size:13px;color:var(--text);background:var(--surface-page);min-height:100%;padding:20px 32px 40px;display:flex;flex-direction:column;gap:16px}
  .ex-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
  .ex-title{font-family:'Syne',sans-serif;font-size:20px;font-weight:700;line-height:1.2}
  .ex-sub{font-size:12.5px;color:var(--text-mid);margin-top:5px;max-width:640px}
  .ex-actions-top{display:flex;gap:8px;flex:none}
  .ex-btn{height:32px;padding:0 14px;border-radius:4px;border:1px solid var(--border-mid,var(--border));background:var(--surface-card);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;color:var(--text)}
  .ex-btn.primary{background:var(--navy);border-color:var(--navy);color:var(--text-on-dark)}
  .ex-card{background:var(--surface-card);border:1px solid var(--border);border-radius:4px}
  /* Week strip (Figma 541:1011): the selected week is the ONLY navy element
     on the page — it answers «which week am I entering» before anything else. */
  .ex-wkstrip{display:flex;align-items:stretch;gap:6px;padding:8px}
  .ex-wkarrow{width:34px;border:1px solid var(--border);border-radius:4px;background:none;font:inherit;color:var(--text-mid);cursor:pointer}
  .ex-wk{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;padding:6px 12px;border-radius:4px;border:0;background:none;text-align:left;font:inherit;cursor:pointer;color:var(--text)}
  .ex-wk:hover{background:var(--surface-sunken)}
  .ex-wk.sel{background:var(--navy);color:var(--text-on-dark)}
  .ex-wk .a{font-size:12px;font-weight:600}
  .ex-wk .b{font-size:11px;color:var(--text-mid);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ex-wk.sel .b{color:var(--silver,var(--text-on-dark))}
  .ex-wk.future .a{color:var(--text-dim)}
  .ex-wk .c{color:var(--warn)} .ex-wk.sel .c{color:var(--text-on-dark)}
  /* Summary bar: key/value pairs in one line, pending items on the right. */
  .ex-sum{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 20px;flex-wrap:wrap}
  .ex-sum-kv{display:flex;gap:24px;flex-wrap:wrap}
  .ex-sum-kv span{font-size:12px;color:var(--text-mid)} .ex-sum-kv b{font-size:13px;color:var(--text);margin-left:8px;font-variant-numeric:tabular-nums}
  .ex-sum-kv b.warn{color:var(--warn)} .ex-sum-kv b.ok{color:var(--ok)}
  .ex-sum-pend{font-size:11.5px;font-weight:500;color:var(--warn)}
  .ex-sum-pend.ok{color:var(--ok)}
  .ex-search{height:30px;box-sizing:border-box;border:1px solid var(--border);border-radius:4px;padding:0 10px;font:inherit;font-size:12px;width:240px}
  /* Ledger grid. Fixed tracks for numbers, one flexible track for the route;
     at widths below the sum the CARD scrolls sideways, never the page. */
  .ex-gridwrap{overflow-x:auto}
  .ex-grid{min-width:1100px}
  .ex-gh,.ex-gr,.ex-gt{display:grid;grid-template-columns:26px 70px 110px 76px minmax(120px,1fr) repeat(6,80px) 88px 80px;gap:6px;align-items:center;padding:0 16px}
  .ex-gh{height:32px;background:var(--surface-sunken);border-bottom:2px solid var(--border-mid,var(--border));font-size:9.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-mid)}
  .ex-gr{min-height:40px;padding-top:6px;padding-bottom:6px;border-bottom:1px solid var(--border)}
  .ex-gr.open{background:var(--surface-sunken)}
  .ex-gr.none-row{border-top:1px solid var(--border-mid,var(--border))}
  .ex-gt{height:40px;background:var(--surface-sunken);border-top:2px solid var(--navy);font-weight:600}
  .ex-gt .grand{font-family:'Syne',sans-serif;font-size:13.5px}
  .r{text-align:right} .dim{color:var(--text-dim)} .mid{color:var(--text-mid)}
  .n{font-variant-numeric:tabular-nums}
  .ex-plate{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;letter-spacing:.02em;white-space:nowrap}
  .ex-gr>div{min-width:0} .ex-clip{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ex-route{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-mid)}
  .ex-st{font-size:11.5px;font-weight:500;color:var(--text-mid)} .ex-st.att{color:var(--warn)} .ex-st.ok{color:var(--ok)}
  /* Cell: amount over line count. Clickable when the user can write; the
     open one gets the navy frame the Figma shows for «where am I typing». */
  .ex-cell{display:flex;flex-direction:column;align-items:flex-end;gap:1px;padding:2px 4px;border-radius:3px;border:1.5px solid transparent;min-height:26px;justify-content:center}
  .ex-cell.can{cursor:pointer} .ex-cell.can:hover{background:var(--surface-card);border-color:var(--border)}
  .ex-cell.open{border-color:var(--navy);background:var(--surface-card)}
  .ex-cell .a{font-variant-numeric:tabular-nums;font-size:12.5px}
  .ex-cell .b{font-size:10px;color:var(--text-dim);white-space:nowrap}
  .ex-cell.missing .a{color:var(--warn);font-weight:500;font-size:11.5px}
  .ex-cell.empty .a{color:var(--border-mid,var(--text-dim))}
  /* Expanded cell panel: lines of that group + the entry row, full width. */
  .ex-gp{border-bottom:1px solid var(--border-mid,var(--border));border-left:3px solid var(--navy);background:var(--surface-sunken)}
  .ex-gp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 16px 4px;font-size:12px}
  .ex-gp-head .k{font-size:9.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-mid);margin-right:10px}
  .ex-th{height:30px;padding:0 16px;font-size:10px;font-weight:600;letter-spacing:.04em;color:var(--text-mid);text-transform:uppercase;border-bottom:1px solid var(--border)}
  .ex-row{min-height:36px;padding:4px 16px;border-bottom:1px solid var(--border);background:var(--surface-card)}
  .ex-th.ex-line-grid,.ex-row.ex-line-grid{display:grid;grid-template-columns:78px minmax(130px,1fr) 52px 72px 72px 76px minmax(96px,1fr);gap:8px;align-items:center}
  .ex-line-grid>div{min-width:0;overflow-wrap:break-word;word-break:break-word}
  .ex-user{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .m{font-size:13px;font-weight:700} .s{font-size:12px;color:var(--text-mid)}
  .ex-ei{height:30px;border:1px solid var(--border-mid,var(--border));border-radius:3px;padding:0 8px;font:inherit;font-size:12.5px;box-sizing:border-box;background:var(--surface-card)}
  .ex-ei:focus{outline:none;border-color:var(--navy);box-shadow:0 0 0 1px var(--navy)}
  /* Entry / inline-edit rows: flex-wrap, .ex-qe-break = line break. */
  .ex-row.qe{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;padding:10px 16px 12px;background:transparent;border-bottom:0}
  .ex-row.edit{box-shadow:inset 3px 0 var(--navy);background:var(--surface-card);border-bottom:1px solid var(--border)}
  .ex-qe-break{flex-basis:100%;height:0}
  .ex-qe-cat{width:150px;max-width:100%} .ex-qe-date{width:140px;max-width:100%} .ex-qe-amt{width:100px} .ex-qe-note{flex:1;min-width:160px}
  .ex-qe-hint{font-size:11px;color:var(--text-dim);white-space:nowrap;padding-bottom:8px}
  .ex-qe-fuel{display:flex;flex-wrap:wrap;gap:8px}
  .ex-field{display:flex;flex-direction:column;gap:3px;max-width:100%}
  .ex-flabel{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-mid)}
  .ex-field .ex-ei{width:100%}
  .ex-cn{line-height:1.4}
  .ex-cat{font-size:12px} .ex-cat.dkv{color:var(--text-mid)}
  .ex-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;justify-content:flex-end}
  .ex-assign{width:100%;max-width:170px}
  .ex-link{background:none;border:0;color:var(--accent-text,var(--accent));font:inherit;font-size:12px;cursor:pointer;padding:0}
  .ex-link.danger{color:var(--danger)}
  .ex-foot{display:flex;justify-content:space-between;gap:16px;padding:8px 16px;font-size:11px;color:var(--text-mid);border-top:1px solid var(--border)}
  .ex-foot p{margin:0;max-width:820px}
  /* «Εισαγωγές» band: a footnote list under the sheet, not a competing block. */
  .ex-idocs{padding:8px 16px 10px}
  .ex-idochead{font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-mid);margin-bottom:4px}
  .ex-idoc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:3px 0;font-size:12px}
  /* Below ~1320px (1280 laptop: 1280 − 228 sidebar) the fixed tracks would
     force the card to scroll; tighter page padding + narrower tracks keep the
     whole sheet in view instead (proof asserts the PAGE never scrolls sideways). */
  @media (max-width:1320px){
    .ex-page{padding:16px 16px 32px}
    .ex-grid{min-width:0}
    .ex-gh,.ex-gr,.ex-gt{grid-template-columns:22px 62px 96px 66px minmax(90px,1fr) repeat(6,68px) 78px 72px;gap:5px;padding:0 10px}
    .ex-gr{padding-top:5px;padding-bottom:5px}
    .ex-cell .a{font-size:12px}
  }
  </style>`;
}

// ═══════════════════ ΦΟΡΤΩΣΗ ═══════════════════

async function renderExpenses() {
  const c = document.getElementById('content');
  if (can('costs') === 'none') { c.innerHTML = showAccessDenied(); return; }
  _ex.canWrite = can('costs') === 'full';
  c.style.padding = '0';
  _ex.open = null; _ex.editId = null; _ex.q = '';
  if (!_ex.week) _ex.week = ctWeekOf(exTodayIso());
  c.innerHTML = exStyles() + '<div class="ex-page"><div style="color:var(--text-mid)">Φόρτωση εξόδων…</div></div>';
  await exLoad();
  _ex.importDocs = []; _ex.importDocsLoading = true; _ex.importDocsErr = null;
  exLoadImportDocs(); // fire-and-forget — re-renders on arrival
}

// Strip window bounds around the selected week.
function exStripBounds() {
  return { from: exShiftIso(_ex.week.start, -7 * EX_STRIP_BACK), to: exShiftIso(_ex.week.end, 7 * EX_STRIP_FWD) };
}

// One /costs/rt call covers the whole strip window (≤ 7 weeks, well under
// the Worker's 200-row limit) — the same rows give the strip its per-week
// trip counts AND the selected week's rows, so the two never disagree.
async function exLoad() {
  _ex.loading = true; _ex.err = null;
  exRenderPage();
  try {
    const { from, to } = exStripBounds();
    const [rtRes, lookupsRes] = await Promise.all([
      ctFetch('/costs/rt?from=' + from + '&to=' + to),
      _ex.lookups ? Promise.resolve(_ex.lookups) : ctFetch('/costs/lookups')
    ]);
    _ex.lookups = lookupsRes || {};
    _ex.stripRts = (rtRes.records || []).filter(r => r.status !== 'cancelled');
    _ex.rts = _ex.stripRts.filter(r => { const w = ctWeekOf(r.date_start); return w && w.start === _ex.week.start; })
      .sort((a, b) => String(a.date_start).localeCompare(String(b.date_start)) || a.id - b.id);
    await exLoadLines();
  } catch (e) {
    _ex.err = e.message;
  }
  _ex.loading = false;
  exRenderPage();
}

async function exLoadLines() {
  const [perRt, unRes] = await Promise.all([
    Promise.all(_ex.rts.map(r => ctFetch('/costs/lines?rt_id=' + r.id).then(res => [r.id, res.records || []]))),
    ctFetch('/costs/lines?alloc_status=unallocated')
  ]);
  _ex.linesByRt = Object.fromEntries(perRt);
  _ex.unalloc = unRes.records || [];
}

function exWeekShift(n) { exGoWeek(exShiftIso(_ex.week.start, 7 * n)); }
function exGoWeek(startIso) {
  _ex.week = ctWeekOf(startIso);
  _ex.open = null; _ex.editId = null;
  exLoad();
}

// GET /costs/import/docs (spec round 2 point 4) — a plain list, read-only
// here. Not on the critical path on purpose: this band is supplementary,
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
  const body = _ex.importDocsLoading ? '<div class="s">Φόρτωση…</div>'
    : _ex.importDocsErr ? `<div class="s">Δεν φορτώθηκαν: ${escapeHtml(_ex.importDocsErr)}</div>`
    : !_ex.importDocs.length ? '<div class="s">Καμία εισαγωγή DKV ακόμη.</div>'
    : _ex.importDocs.map(exImportDocRowHtml).join('');
  return `<div class="ex-card ex-idocs"><div class="ex-idochead">Εισαγωγές DKV</div>${body}</div>`;
}

// «DKV · <invoice_no> · <period_from–period_to> · <lines_total> γραμμές ·
// <status> · <created_by> <date>». invoice_no absent on a draft — falls
// back to the zip name.
function exImportDocRowHtml(d) {
  const period = d.period_from && d.period_to ? (exDate(d.period_from) + '–' + exDate(d.period_to)) : '—';
  const statusTxt = d.status === 'draft' ? 'πρόχειρο' : (d.status || '—');
  const when = d.created_at ? exDate(d.created_at) : '';
  const label = 'DKV · ' + (d.invoice_no || d.zip_name || '—') + ' · ' + period + ' · ' + (d.lines_total != null ? d.lines_total : '—') + ' γραμμές · ' + statusTxt + ' · ' + (d.created_by || '—') + (when ? ' ' + when : '');
  return `<div class="ex-idoc-row"><span class="s">${escapeHtml(label)}</span><button class="ex-link" onclick='exOpenImportZip(${JSON.stringify(String(d.id))})'>ZIP</button></div>`;
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

// ═══════════════════ ΥΠΟΛΟΓΙΣΜΟΙ ═══════════════════

function exRtLines(rtId) { return _ex.linesByRt[rtId] || []; }
function exGroupOf(cat) { return EX_GROUPS.find(g => g.cats.includes(cat)) || EX_GROUPS[EX_GROUPS.length - 1]; }
function exGroupLines(lines, group) { return lines.filter(l => group.cats.includes(l.category)); }
function exNet(lines) { return lines.reduce((a, l) => a + Number(l.net || 0), 0); }
function exVat(lines) { return lines.reduce((a, l) => a + Number(l.vat || 0), 0); }
function exIsDone(r) { return r.status === 'closed' || r.status === 'complete'; }
function exUnallocInWeek() { return _ex.unalloc.filter(l => l.line_date && l.line_date >= _ex.week.start && l.line_date <= _ex.week.end); }

// «λείπει» is claimed only for a CLOSED trip with no line in a group the
// trip type needs — an open trip simply has not happened yet (a warning
// there would be noise every Monday). Own truck: fuel + tolls; partner: rate.
function exMissingGroups(r) {
  if (!exIsDone(r)) return [];
  const lines = exRtLines(r.id);
  const expect = exIsPartnerTrip(r) ? EX_EXPECT_PARTNER : EX_EXPECT_OWN;
  return expect.filter(k => !exGroupLines(lines, EX_GROUPS.find(g => g.key === k)).length);
}
function exRtState(r) {
  if (!exIsDone(r)) return { word: 'Σε εξέλιξη', cls: '' };
  return exMissingGroups(r).length ? { word: 'Ελλείψεις', cls: 'att' } : { word: 'Πλήρες', cls: 'ok' };
}

function exWeekStats() {
  const all = _ex.rts.flatMap(r => exRtLines(r.id));
  const inWeekNone = exUnallocInWeek();
  const done = _ex.rts.filter(exIsDone);
  const gaps = done.filter(r => exMissingGroups(r).length);
  return {
    trips: _ex.rts.length, complete: done.length - gaps.length, gaps: gaps.length, open: _ex.rts.length - done.length,
    lines: all.length + inWeekNone.length,
    net: exNet(all) + exNet(inWeekNone), vat: exVat(all) + exVat(inWeekNone),
    noneWeek: inWeekNone.length, noneOther: _ex.unalloc.length - inWeekNone.length
  };
}

function exFilteredTrips() {
  const q = _ex.q.trim().toLowerCase();
  if (!q) return _ex.rts;
  return _ex.rts.filter(r => exTruckName(r.truck_id).toLowerCase().includes(q) || exPersonName(r).toLowerCase().includes(q) || String(r.route_text || '').toLowerCase().includes(q));
}

// ═══════════════════ RENDER ═══════════════════

function exRenderPage() {
  const c = document.getElementById('content');
  // The DKV import view (modules/expenses_import.js) replaces #content in
  // place. A late refetch of this page (lookups/docs arriving after the user
  // already clicked «Εισαγωγή DKV») must not paint the sheet over it — seen
  // live 8/9: the import screen vanished 2–3 s after opening.
  if (c && c.querySelector('.ei-page')) return;
  const w = _ex.week;
  const head = `<div class="ex-head">
      <div><div class="ex-title">Έξοδα δρομολογίων — Εβδομάδα ${w.week}</div>
        <div class="ex-sub">Περίοδος ${exDateFull(w.start)} – ${exDateFull(w.end)} · Καταχώριση ανά δρομολόγιο και κατηγορία · Κλικ σε κελί για επιτόπου καταχώριση</div></div>
      <div class="ex-actions-top">${_ex.canWrite ? '<button class="ex-btn" onclick="eiOpenImport()">Εισαγωγή DKV</button>' : ''}</div>
    </div>`;
  let body;
  if (_ex.loading) body = '<div class="ex-card" style="padding:20px;color:var(--text-mid)">Φόρτωση εβδομάδας…</div>';
  else if (_ex.err) body = showError('Τα έξοδα δεν φορτώθηκαν: ' + _ex.err);
  else body = exSummaryHtml() + exGridHtml();
  c.innerHTML = exStyles() + `<div class="ex-page">${head}${exWeekStripHtml()}${body}${_ex.loading || _ex.err ? '' : exImportDocsSectionHtml()}</div>`;
}

function exWeekStripHtml() {
  const chips = [];
  const today = ctWeekOf(exTodayIso());
  for (let i = -EX_STRIP_BACK; i <= EX_STRIP_FWD; i++) {
    const wk = ctWeekOf(exShiftIso(_ex.week.start, 7 * i));
    const sel = wk.start === _ex.week.start;
    const future = today && wk.start > today.start;
    const count = _ex.stripRts.filter(r => { const x = ctWeekOf(r.date_start); return x && x.start === wk.start; }).length;
    let hint;
    if (sel && !_ex.loading && !_ex.err) { const s = exWeekStats(); hint = s.gaps ? `<span class="c">${s.gaps} ελλείψεις</span>` : (s.trips ? 'πλήρης' : '—'); }
    else hint = count ? count + ' δρομ.' : '—';
    chips.push(`<button type="button" class="ex-wk${sel ? ' sel' : ''}${future ? ' future' : ''}" onclick="exGoWeek('${wk.start}')">
      <span class="a">Εβδ. ${wk.week}</span><span class="b">${exShortRange(wk.start, wk.end)} · ${hint}</span></button>`);
  }
  return `<div class="ex-card ex-wkstrip"><button type="button" class="ex-wkarrow" onclick="exWeekShift(-1)" title="Προηγούμενη εβδομάδα">‹</button>${chips.join('')}<button type="button" class="ex-wkarrow" onclick="exWeekShift(1)" title="Επόμενη εβδομάδα">›</button></div>`;
}

function exSummaryHtml() {
  const s = exWeekStats();
  const pend = [];
  if (s.gaps) pend.push(s.gaps + (s.gaps === 1 ? ' δρομολόγιο με ελλείψεις' : ' δρομολόγια με ελλείψεις'));
  if (s.noneWeek) pend.push(s.noneWeek + ' γραμμές χωρίς δρομολόγιο');
  if (s.noneOther) pend.push(s.noneOther + ' χωρίς δρομολόγιο εκτός εβδομάδας');
  return `<div class="ex-card ex-sum">
    <div class="ex-sum-kv">
      <span>Δρομολόγια <b>${s.trips}</b></span>
      <span>Πλήρη <b class="${s.complete ? 'ok' : ''}">${s.complete}</b></span>
      <span>Με ελλείψεις <b class="${s.gaps ? 'warn' : ''}">${s.gaps}</b></span>
      <span>Σε εξέλιξη <b>${s.open}</b></span>
      <span>Γραμμές <b>${s.lines}</b></span>
      <span>Καθαρή αξία <b>${exEur(s.net)}</b></span>
      <span>Φ.Π.Α. <b>${exEur(s.vat)}</b></span>
      <span>Μικτή αξία εβδομάδας <b>${exEur(s.net + s.vat)}</b></span>
    </div>
    <div class="ex-sum-pend${pend.length ? '' : ' ok'}">${pend.length ? 'Εκκρεμότητες: ' + escapeHtml(pend.join(' · ')) : 'Καμία εκκρεμότητα'}</div>
  </div>`;
}

function exGridHtml() {
  const trips = exFilteredTrips();
  const th = `<div class="ex-gh"><div class="r">Α/Α</div><div>Όχημα</div><div>Οδηγός</div><div>Ημερομ.</div><div>Διαδρομή</div>${EX_GROUPS.map(g => `<div class="r">${g.label} €</div>`).join('')}<div class="r">Σύνολο €</div><div>Κατάσταση</div></div>`;
  const rows = trips.length ? trips.map((r, i) => exTripRowHtml(r, i + 1)).join('')
    : `<div class="ex-gr"><div></div><div class="mid" style="grid-column:2/-1">${_ex.rts.length ? 'Κανένα δρομολόγιο για αυτή την αναζήτηση.' : 'Κανένα δρομολόγιο σε αυτή την εβδομάδα.'}</div></div>`;
  const totals = EX_GROUPS.map(g => exNet(trips.flatMap(r => exGroupLines(exRtLines(r.id), g))));
  const grand = totals.reduce((a, b) => a + b, 0) + exNet(exUnallocInWeek());
  const tt = `<div class="ex-gt"><div class="r" style="grid-column:1/6">Σύνολο εβδομάδας ${_ex.week.week} (${_ex.rts.length} δρομολόγια, ${exWeekStats().lines} γραμμές)</div>${totals.map(t => `<div class="r n">${exNum(t)}</div>`).join('')}<div class="r n grand">${exNum(grand)}</div><div></div></div>`;
  const foot = `<div class="ex-foot"><p>Ποσά καθαρά, χωρίς Φ.Π.Α. Κάθε κελί αθροίζει τις γραμμές της κατηγορίας για το δρομολόγιο. «Λείπει» σημαίνεται μόνο σε ολοκληρωμένο δρομολόγιο χωρίς γραμμή στην κατηγορία. Οι γραμμές DKV έρχονται από την εισαγωγή και δεν πληκτρολογούνται.</p><span>Enter = αποθήκευση · Esc = κλείσιμο κελιού</span></div>`;
  return `<div class="ex-card"><div style="display:flex;justify-content:flex-end;padding:8px 16px 0"><input class="ex-search" placeholder="Πινακίδα, οδηγός, διαδρομή" value="${escapeHtml(_ex.q)}" oninput="exSearchInput(this)"></div>
    <div class="ex-gridwrap"><div class="ex-grid">${th}${rows}${exNoneRowHtml()}${tt}</div></div>${foot}</div>`;
}

function exSearchInput(el) {
  const pos = el.selectionStart;
  _ex.q = el.value;
  exRenderPage();
  const s = document.querySelector('.ex-search');
  if (s) { s.focus(); s.setSelectionRange(pos, pos); }
}

function exCellHtml(rtKey, group, lines, missing) {
  const isOpen = _ex.open && _ex.open.rtId === rtKey && _ex.open.group === group.key;
  const cls = ['ex-cell', _ex.canWrite ? 'can' : '', isOpen ? 'open' : '', missing ? 'missing' : '', !lines.length && !missing ? 'empty' : ''].filter(Boolean).join(' ');
  // rtKey is a number or the literal 'none' — single quotes keep it inside the
  // double-quoted attribute (JSON.stringify would close the attribute early).
  const keyArg = typeof rtKey === 'number' ? rtKey : "'" + rtKey + "'";
  const onclick = _ex.canWrite ? ` onclick="exToggleCell(${keyArg},'${group.key}')"` : '';
  const dkv = lines.length && lines.every(l => l.doc_id) ? ' · DKV' : '';
  const a = missing ? 'λείπει' : (lines.length ? exNum(exNet(lines)) : '—');
  const b = lines.length ? `${lines.length} γρ.${dkv}` : '';
  return `<div class="${cls}" data-rt="${rtKey}" data-group="${group.key}"${onclick}><span class="a">${a}</span>${b ? `<span class="b">${b}</span>` : ''}</div>`;
}

function exTripRowHtml(r, idx) {
  const lines = exRtLines(r.id);
  const missing = exMissingGroups(r);
  const st = exRtState(r);
  const isOpen = _ex.open && _ex.open.rtId === r.id;
  const partner = exIsPartnerTrip(r);
  const cells = EX_GROUPS.map(g => exCellHtml(r.id, g, exGroupLines(lines, g), missing.includes(g.key))).join('');
  return `<div class="ex-gr${isOpen ? ' open' : ''}" data-rt="${r.id}">
      <div class="r dim">${idx}</div>
      <div class="ex-clip ${partner ? 'mid' : 'ex-plate'}">${escapeHtml(partner ? 'Συνεργάτης' : exTruckName(r.truck_id))}</div>
      <div class="ex-clip" title="${escapeHtml(exPersonName(r))}">${escapeHtml(exPersonName(r))}</div>
      <div class="mid">${exDateRange(r.date_start, r.date_end)}</div>
      <div class="ex-route" title="${escapeHtml(r.route_text || '')}">${escapeHtml(r.route_text || '—')}</div>
      ${cells}
      <div class="r n" style="font-weight:600">${exNum(exNet(lines))}</div>
      <div class="ex-st ${st.cls}">${st.word}</div>
    </div>${isOpen ? exPanelHtml(r) : ''}`;
}

// «Χωρίς δρομολόγιο»: unallocated lines dated inside the week (DKV lines the
// import could not place, receipts logged before the trip existed). Always
// the last row, so an accountant sees the week's leftovers next to its trips.
function exNoneRowHtml() {
  const lines = exUnallocInWeek();
  const isOpen = _ex.open && _ex.open.rtId === 'none';
  const cells = EX_GROUPS.map(g => exCellHtml('none', g, exGroupLines(lines, g), false)).join('');
  return `<div class="ex-gr none-row${isOpen ? ' open' : ''}" data-rt="none">
      <div></div><div class="dim">—</div><div class="ex-st att">Χωρίς δρομολόγιο</div><div class="mid">εβδ. ${_ex.week.week}</div>
      <div class="ex-route">${lines.length ? lines.length + ' γραμμές προς ανάθεση' : 'καμία γραμμή'}</div>
      ${cells}
      <div class="r n" style="font-weight:600">${exNum(exNet(lines))}</div>
      <div class="ex-st ${lines.length ? 'att' : ''}">${lines.length ? 'Ανάθεση' : '—'}</div>
    </div>${isOpen ? exPanelHtml(null) : ''}`;
}

// ═══════════════════ ΑΝΟΙΧΤΟ ΚΕΛΙ ═══════════════════

function exToggleCell(rtKey, groupKey) {
  if (!_ex.canWrite) return;
  if (_ex.open && _ex.open.rtId === rtKey && _ex.open.group === groupKey) { exCloseCell(); return; }
  const group = EX_GROUPS.find(g => g.key === groupKey);
  const rt = rtKey === 'none' ? null : _ex.rts.find(r => r.id === rtKey);
  _ex.open = { rtId: rtKey, group: groupKey };
  _ex.editId = null;
  // Date defaults to the trip's first day (inside the week by construction),
  // or today for «Χωρίς δρομολόγιο». Category = the group's first category.
  _ex.qe = { category: group.cats[0], date: (rt && rt.date_start) || exTodayIso() };
  exRenderPage();
  const netEl = document.getElementById('exQeNet');
  if (netEl) netEl.focus();
}
function exCloseCell() { _ex.open = null; _ex.editId = null; exRenderPage(); }

function exPanelHtml(rt) {
  const group = EX_GROUPS.find(g => g.key === _ex.open.group);
  const isNone = !rt;
  const lines = exGroupLines(isNone ? exUnallocInWeek() : exRtLines(rt.id), group);
  const title = isNone ? 'Χωρίς δρομολόγιο' : (exIsPartnerTrip(rt) ? 'Συνεργάτης' : exTruckName(rt.truck_id)) + ' · ' + exPersonName(rt) + ' · ' + exDateRange(rt.date_start, rt.date_end);
  const rowsHtml = lines.length ? lines.map(l => exLineRowHtml(l, { unallocated: isNone })).join('') : '';
  const thHtml = lines.length ? `<div class="ex-th ex-line-grid"><div>Ημ/νία</div><div>Κατηγορία · Σημείωση</div><div>Λίτρα</div><div class="r">Καθαρό</div><div class="r">ΦΠΑ</div><div>Ποιος</div><div></div></div>` : '';
  return `<div class="ex-gp" data-panel="${isNone ? 'none' : rt.id}">
    <div class="ex-gp-head"><div><span class="k">Καταχώριση</span>${escapeHtml(group.label)} · ${escapeHtml(title)}${lines.length ? ` · <span class="mid">${lines.length} γραμμές, ${exEur(exNet(lines))} καθαρό</span>` : ''}</div><button class="ex-link" onclick="exCloseCell()">Κλείσιμο</button></div>
    ${thHtml}${rowsHtml}${exQeRowHtml(group)}
  </div>`;
}

// ═══════════════════ ΓΡΗΓΟΡΗ ΚΑΤΑΧΩΡΗΣΗ ═══════════════════

function exQeRowHtml(group) {
  const fuelOn = EX_FUEL_CATEGORIES.includes(_ex.qe.category);
  // The select lists the whole category set (a receipt may need «Λοιπά» to
  // become «Πρόστιμα»), preselected to the opened group — the group's own
  // categories first so the common case is one Enter away.
  const ordered = [...group.cats, ...EX_CATEGORIES.filter(c => !group.cats.includes(c))];
  const opts = ordered.map(c => `<option value="${c}"${_ex.qe.category === c ? ' selected' : ''}>${escapeHtml(CT_CATEGORY_LABELS[c] || c)}</option>`).join('');
  return `<div class="ex-row qe">
    <div class="ex-field ex-qe-cat"><label class="ex-flabel">Κατηγορία</label><select class="ex-ei" id="exQeCategory" onchange="exQeCategoryChange(this)">${opts}</select></div>
    <div class="ex-field ex-qe-date"><label class="ex-flabel">Ημερομηνία</label><input class="ex-ei" type="date" id="exQeDate" value="${_ex.qe.date || ''}" onchange="exQeDateChange(this)"></div>
    <div class="ex-field ex-qe-amt"><label class="ex-flabel">Καθαρό €</label><input class="ex-ei" type="number" step="0.01" id="exQeNet" placeholder="0,00" onkeydown="exQeKeydown(event)"></div>
    <div class="ex-field ex-qe-amt"><label class="ex-flabel">ΦΠΑ €</label><input class="ex-ei" type="number" step="0.01" id="exQeVat" placeholder="0,00" onkeydown="exQeKeydown(event)"></div>
    <div class="ex-field ex-qe-note"><label class="ex-flabel">Παραστατικό / σημείωση</label><input class="ex-ei" type="text" id="exQeNote" placeholder="αρ. απόδειξης" onkeydown="exQeKeydown(event)"></div>
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
function exQeKeydown(ev) {
  if (ev.key === 'Enter') { ev.preventDefault(); exQeSubmit(); }
  else if (ev.key === 'Escape') { ev.preventDefault(); exCloseCell(); }
}

// Κοινό σώμα POST /costs/lines — το μοιράζονται η ενσωματωμένη γραμμή
// καταχώρησης (exQeSubmit) ΚΑΙ το modal «μία φόρμα, δύο πόρτες» (exModalSubmit),
// ώστε ο κανόνας «καθαρό ή ΦΠΑ υποχρεωτικό»/τα πεδία καυσίμων να ζουν σε ΕΝΑ
// σημείο (αρχή 3). Δέχεται ήδη-διαβασμένες τιμές (όχι DOM ids). rtId: null
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

function exOpenRtId() { return !_ex.open || _ex.open.rtId === 'none' ? null : _ex.open.rtId; }

async function exQeSubmit() {
  if (!_ex.open) return;
  const g = id => document.getElementById(id);
  const body = exBuildLineBody(exOpenRtId(), {
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
  // Assignment targets = the WEEK's trips only (the old screen offered every
  // trip in history here — the very list the owner asked to get rid of).
  const assignHtml = (opts && opts.unallocated && _ex.canWrite)
    ? `<select class="ex-ei ex-assign" onchange="exAssignLine(${line.id}, this.value)">
        <option value="">Ανάθεση σε δρομολόγιο…</option>
        ${_ex.rts.map(r => `<option value="${r.id}">${escapeHtml(exIsPartnerTrip(r) ? exPersonName(r) : exTruckName(r.truck_id))} · ${exDateRange(r.date_start, r.date_end)}</option>`).join('')}
      </select>`
    : '';
  const actionsHtml = canEditThis
    ? `<button class="ex-link" onclick="exEditLine(${line.id})">Διόρθωση</button><button class="ex-link danger" onclick="exDeleteLine(${line.id})">Διαγραφή</button>`
    : '';
  return `<div class="ex-row ex-line-grid" data-line="${line.id}">
    <div class="s">${exDateFull(line.line_date)}</div>
    <div class="ex-cn"><span class="ex-cat${line.doc_id ? ' dkv' : ''}">${escapeHtml(CT_CATEGORY_LABELS[line.category] || line.category)}${line.doc_id ? ' · DKV' : ''}</span>${line.note ? `<br><span class="s dim">${escapeHtml(line.note)}</span>` : ''}</div>
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
  return `<div class="ex-row edit qe" data-line="${line.id}">
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

// Shared by every write path: reloads the week's lines straight from the
// server — never a local increment (αρχή 2). The open cell stays open so a
// run of receipts goes in without re-clicking.
async function exAfterMutation() {
  // A failed refetch must be heard (αρχή 1): the write went through, but the
  // numbers on screen are now stale — say so instead of pretending.
  try { await exLoadLines(); }
  catch (e) { showErrorToast('Η καταχώρηση έγινε, αλλά τα σύνολα δεν ανανεώθηκαν: ' + e.message, 'error'); }
  exRenderPage();
}

// ═══════════════════ ΜΙΑ ΦΟΡΜΑ, ΔΥΟ ΠΟΡΤΕΣ (round 2, owner 7/9 night) ═══════
// exOpenEntryModal(): οι ΙΔΙΕΣ πεδία/κανόνες με την ενσωματωμένη καταχώρηση
// (exBuildLineBody, exQeSubmit πιο πάνω), ως κεντραρισμένο modal. Δύο καλούντες:
//   1. Αυτή η οθόνη — σύνδεσμος «σε παράθυρο» δίπλα στο Enter-hint.
//   2. Το TRIP PnL (modules/costs.js, owner-only, ctOpenEntry).
// Η κάρτα προσθέτει δικό της <style id="exModalStyleTag"> στο <head> αντί να
// βασίζεται στο exStyles() του #content: το modal μπορεί να ανοίξει ΚΑΙ όταν
// η τρέχουσα σελίδα είναι το TRIP PnL, όπου το exStyles() δεν έχει εγχυθεί.
let _exModalState = null;

function exEnsureModalStyles() {
  if (document.getElementById('exModalStyleTag')) return;
  const tag = document.createElement('style');
  tag.id = 'exModalStyleTag';
  tag.textContent = `
    .ex-modal-scrim{position:fixed;inset:0;background:rgba(11,25,41,.45);z-index:var(--z-overlay,9000)}
    .ex-modal-box{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:520px;max-width:94vw;max-height:90vh;overflow-y:auto;background:var(--surface-card);border-radius:4px;box-shadow:var(--shadow-md);z-index:calc(var(--z-overlay,9000) + 1);font-family:'DM Sans',sans-serif;color:var(--text)}
    .ex-modal-head{background:var(--surface-dark);color:var(--text-on-dark);padding:12px 20px;font-family:'Syne',sans-serif;font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .ex-modal-close{background:none;border:0;color:var(--text-dim);font-size:18px;cursor:pointer;line-height:1}
    .ex-modal-body{padding:16px 20px}
    .ex-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .ex-modal-grid .ex-field{grid-column:span 1}
    .ex-modal-grid .ex-field.ex-modal-wide{grid-column:1/-1}
    .ex-modal-fuel{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:12px}
    .ex-modal-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
    .ex-modal-box .ex-field{display:flex;flex-direction:column;gap:3px}
    .ex-modal-box .ex-flabel{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-mid)}
    .ex-modal-box .ex-ei{height:30px;border:1px solid var(--border);border-radius:3px;padding:0 8px;font:inherit;font-size:12.5px;box-sizing:border-box;width:100%}
    .ex-modal-box .ex-btn{height:32px;padding:0 14px;border-radius:4px;border:1px solid var(--border);background:var(--surface-card);font:inherit;font-size:12.5px;cursor:pointer;color:var(--text)}
    .ex-modal-box .ex-btn-primary{background:var(--navy);color:var(--text-on-dark);border-color:var(--navy)}
  `;
  document.head.appendChild(tag);
}

// /costs/lookups is the SAME shape from both modules — whichever one already
// fetched it is reused, so the modal never needs a third fetch of its own
// (αρχή 3). Neither cache may exist yet — every lookup tolerates that with «—».
function exModalLookups() {
  if (_ex.lookups) return _ex.lookups;
  if (typeof _ct !== 'undefined' && _ct.lookups) return _ct.lookups;
  return null;
}
function exModalTruckName(id) { const lk = exModalLookups(); const t = lk && (lk.trucks || []).find(x => x.id === id); return t ? t.license_plate : null; }
function exModalDriverName(id) { const lk = exModalLookups(); const d = lk && (lk.drivers || []).find(x => x.id === id); return d ? d.full_name : null; }
function exModalPartnerName(id) { const lk = exModalLookups(); const p = lk && (lk.partners || []).find(x => x.id === id); return p ? p.company_name : null; }

// Τίτλος από πινακίδα/οδηγό ΜΟΝΟ — ποτέ κωδικό RT (spec §1) ούτε έσοδα/margin,
// ακόμη κι όταν ο καλών είναι το owner-only TRIP PnL.
function exModalTitle(rt, rtId) {
  if (rtId == null) return 'Καταχώρηση κόστους — Χωρίς δρομολόγιο';
  if (!rt) return 'Καταχώρηση κόστους';
  const plate = exModalTruckName(rt.truck_id);
  const person = exModalDriverName(rt.driver_id) || exModalPartnerName(rt.partner_id);
  const parts = [plate, person].filter(Boolean);
  return 'Καταχώρηση κόστους' + (parts.length ? ' — ' + parts.join(' · ') : '');
}

/**
 * exOpenEntryModal({ rtId, rt, onSaved, category })
 * rtId: αριθμός δρομολογίου ή null («Χωρίς δρομολόγιο»).
 * rt:   προαιρετικό record (προεπιλογή ημερομηνίας + τίτλος).
 * onSaved: καλείται ΜΕΤΑ την επιτυχή POST — ο καλών ξαναφορτώνει τα δικά του.
 */
function exOpenEntryModal({ rtId, rt, onSaved, category }) {
  exEnsureModalStyles();
  _exModalState = {
    rtId: rtId == null ? null : Number(rtId), rt: rt || null, onSaved,
    category: category || (EX_CATEGORIES && EX_CATEGORIES[0]) || 'fuel',
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
          <div class="ex-field ex-modal-wide"><label class="ex-flabel">Παραστατικό / σημείωση</label><input class="ex-ei" type="text" id="exMdNote" placeholder="αρ. απόδειξης" onkeydown="exModalKeydown(event)"></div>
        </div>
        <div id="exMdFuelFields" class="ex-modal-fuel" style="display:${fuelOn ? 'grid' : 'none'}">
          <div class="ex-field"><label class="ex-flabel">Λίτρα</label><input class="ex-ei" type="number" step="0.01" id="exMdLiters" onkeydown="exModalKeydown(event)"></div>
          <div class="ex-field"><label class="ex-flabel">Χιλιόμετρα</label><input class="ex-ei" type="number" step="1" min="0" id="exMdKm" onkeydown="exModalKeydown(event)"></div>
          <div class="ex-field"><label class="ex-flabel">Πρατήριο</label><input class="ex-ei" type="text" id="exMdStation" onkeydown="exModalKeydown(event)"></div>
        </div>
        <div class="ex-modal-foot">
          <button class="ex-btn" onclick="exCloseModal()">Άκυρο</button>
          <button class="ex-btn ex-btn-primary" onclick="exModalSubmit()">Αποθήκευση</button>
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

// Σύνδεσμος «σε παράθυρο» της ενσωματωμένης γραμμής — ίδιο δρομολόγιο/«Χωρίς
// δρομολόγιο» και ίδια κατηγορία με το ανοιχτό κελί.
function exOpenEntryModalFromRow() {
  const rtId = exOpenRtId();
  const rt = rtId == null ? null : _ex.rts.find(r => r.id === rtId);
  exOpenEntryModal({ rtId, rt, category: _ex.qe && _ex.qe.category, onSaved: exAfterMutation });
}
