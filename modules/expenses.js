// ═══════════════════════════════════════════════════════════
// MODULE — ΕΞΟΔΑ ΔΡΟΜΟΛΟΓΙΩΝ (v4, owner 13/9/2026: redesign after Figma)
// accountant/owner full, management read-only.
// Backend: /costs/rt (from/to), /costs/lookups, /costs/lines, /costs/ledger/:id (Worker).
// Spec: docs/superpowers/specs/2026-09-13-fuel-collection-program.md §0/§2.
// Figma: KO7l2AfucR3HJEDIg1Yptr, frames 547:1011 (vehicle) / 547:1297 (week) / 547:1583 (entry panel).
//
// What changed from v3 (owner 8/9): a «Εβδομάδα | Όχημα» tab replaces the
// week-only sheet; every displayed amount is net+vat combined (no more ΦΠΑ
// column/field anywhere — one «Ποσό €» per line, spec §0.6); the «Ναύλος»
// column is gone (its lines stay visible under «Λοιπά»); «Τέλη DKV» and
// «Έξοδα Μ» are new columns — the second reads dl_entries.expenses through
// rt.ledger_entry (GET /costs/rt), never a second copy of the same money
// (spec §0.8α, «ίδιο χρήμα, ένα σημείο»); fuel entries carry a Πηγή and,
// for the reefer tank, the trip's own trailer; toll entries carry a
// mandatory toll_country picked from a search list, never free text.
// ctFetch/CT_CATEGORY_LABELS/ctWeekOf still come from modules/costs.js
// (loaded earlier in app.html) — one list of category words, one week
// definition, never a second copy (αρχή 3).
// ═══════════════════════════════════════════════════════════
'use strict';

// fixed_alloc excluded (spec §3, unchanged from v3): written only by the
// future Tier-2 allocator. driver_pay/cash_m excluded: gone since 5/9/2026.
// partner_rate stays a postable category (its lines live under «Λοιπά» now,
// spec §0.8α «τίποτα δεν κρύβεται») even though it has no column of its own.
const EX_CATEGORIES = ['fuel', 'reefer_fuel', 'tolls', 'dkv', 'adblue', 'spedition', 'accommodation', 'ferry_train', 'fines', 'partner_rate', 'other'];
// Categories whose entry row/modal show Λίτρα/Χιλιόμετρα/Πρατήριο — adblue is
// a liquid too and has always used these fields (v3), kept unchanged here.
const EX_FUEL_CATEGORIES = ['fuel', 'reefer_fuel', 'adblue'];
// Narrower than the Worker's own CT_FUEL_SOURCE_CATEGORIES (costs-line-rules.mjs
// also allows adblue at the API level): the Πηγή select is a UI decision for
// the two truck/reefer diesel categories only (spec §2.Β point 4) — adblue
// never asked for a source, and adding one nobody asked for would be the
// «configurability that wasn't requested» CLAUDE.md warns against.
const EX_FUEL_SOURCE_CATEGORIES = ['fuel', 'reefer_fuel'];
const EX_FUEL_SOURCES = [
  { v: 'DKV', l: 'DKV' }, { v: 'DADI', l: 'DADI' }, { v: 'BG_STATION', l: 'BG πρατήριο' },
  { v: 'OWN_STATION', l: 'Ιδιόκτητο' }, { v: 'THIRD_PARTY', l: 'Τρίτος' }
];
// Grid columns = the owner's own sheet categories (spec §0.8α, locked after
// Figma 13/9) — «Ναύλος» is gone as a column; DKV fees get their own column
// instead of hiding inside «Λοιπά». cats[0] is what the entry row preselects.
// `expect` = which groups a CLOSED own-fleet trip must have before it counts
// as complete (own truck → fuel + tolls); a partner trip never claims
// anything is missing (there is no «Ναύλος» column to check any more).
const EX_GROUPS = [
  { key: 'fuel', label: 'Καύσιμα', cats: ['fuel', 'reefer_fuel'] },
  { key: 'tolls', label: 'Διόδια', cats: ['tolls'] },
  { key: 'adblue', label: 'AdBlue', cats: ['adblue'] },
  { key: 'dkv', label: 'Τέλη DKV', cats: ['dkv'] },
  { key: 'spedition', label: 'Spedition', cats: ['spedition'] },
  { key: 'fines', label: 'Πρόστιμα', cats: ['fines'] },
  { key: 'ferry', label: 'Καράβια/Τρένα', cats: ['ferry_train'] },
  { key: 'other', label: 'Λοιπά', cats: ['other', 'accommodation', 'partner_rate'] }
];
// Column order (spec §2, point 2, exact): the synthetic «expm» slot between
// Spedition and Πρόστιμα is «Έξοδα Μ» — NOT a cost-line category, so it is a
// plain string in this order array rather than an EX_GROUPS member (nothing
// that walks EX_GROUPS to match a line's category may ever stumble on it).
const EX_COL_ORDER = ['fuel', 'tolls', 'adblue', 'dkv', 'spedition', 'expm', 'fines', 'ferry', 'other'];
const EX_EXPECT_OWN = ['fuel', 'tolls'];
const EX_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
// Week strip: 4 weeks back, 2 forward around the selected one (Figma, week tab only).
const EX_STRIP_BACK = 4, EX_STRIP_FWD = 2;
// Vehicle tab range choices (spec §2.Γ «προεπιλογή 8 εβδομάδες»).
const EX_VEH_RANGES = [4, 8, 12];

// _ex.tab: 'week' | 'vehicle' (spec §0.8 «tab επιλογής πάνω»). _ex.veh holds
// the vehicle tab's own scope — a truck id, a week range and its own fetched
// rows — kept separate from the week tab's _ex.rts/_ex.week so switching
// tabs never mixes the two data sets (αρχή 3 in spirit: two views, one
// backend shape, never one view's state leaking into the other's render).
// exActiveRts()/exActiveLinesByRt() below are the ONE place that decides
// which of the two the shared grid/panel code reads.
const _ex = {
  lookups: null, canWrite: false, tab: null,
  week: null, rts: [], stripRts: [], linesByRt: {}, unalloc: [],
  veh: { truckId: null, range: 8, from: null, to: null, rts: [], linesByRt: {}, loading: false, err: null },
  loading: false, err: null, q: '',
  open: null, editId: null, qe: null, expmAmount: '',
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
function exNum(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Every displayed amount is net+vat combined (spec §0.6 «ΦΠΑ φεύγει τελείως
// από την οθόνη»): a manually-entered line always has vat=0 (or null) so
// this is a no-op there, and a DKV-imported line's real split still shows as
// one gross figure — one formula, one place, works for both origins.
function exLineAmt(l) { return Number(l.net || 0) + Number(l.vat || 0); }
function exAmt(lines) { return lines.reduce((a, l) => a + exLineAmt(l), 0); }

function exDate(iso) {
  if (!iso) return '—';
  const [, m, d] = iso.slice(0, 10).split('-');
  return d + '/' + m;
}
function exShortRange(start, end) {
  const [, m1, d1] = start.slice(0, 10).split('-'), [, m2, d2] = end.slice(0, 10).split('-');
  return m1 === m2 ? d1 + '–' + d2 + '/' + m1 : d1 + '/' + m1 + '–' + d2 + '/' + m2;
}
function exDateFull(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d + '/' + m + '/' + y;
}
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
function exResolveTrailerName(id) { const t = (_ex.lookups && _ex.lookups.trailers || []).find(x => x.id === id); return t ? t.license_plate : null; }
// USERS roster first name (spec point 7) — created_by is the login username
// (e.g. 'alexia'); the screen should read the person's name. core/utils.js
// owns this lookup (userDisplayName) so every screen that shows created_by
// resolves it the same way; this file only falls back if that helper is
// somehow missing (defensive, not a second copy of the roster).
function exUserDisplay(username) {
  if (typeof userDisplayName === 'function') return userDisplayName(username);
  if (!username) return '';
  return username.charAt(0).toUpperCase() + username.slice(1);
}

function exShowError(e) {
  const msg = (e && e.message) || String(e);
  showErrorToast(msg === 'Forbidden' ? ('Δεν έχεις δικαίωμα για αυτή την ενέργεια — ' + msg) : msg, 'error');
}

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
  /* Segmented tab (spec §0.8): sits between the subtitle and the week
     strip/vehicle controls — the ONLY place the two views are chosen. */
  .ex-seg{display:inline-flex;border:1px solid var(--border);border-radius:4px;overflow:hidden;width:fit-content}
  .ex-seg button{height:30px;padding:0 18px;border:0;background:var(--surface-card);font:inherit;font-size:12.5px;color:var(--text-mid);cursor:pointer}
  .ex-seg button+button{border-left:1px solid var(--border)}
  .ex-seg button.active{background:var(--navy);color:var(--text-on-dark);font-weight:600}
  .ex-vehctl{display:flex;align-items:flex-end;gap:16px;padding:12px 16px;flex-wrap:wrap}
  /* Week strip: the selected week is the ONLY other navy element on the page. */
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
  .ex-sum{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 20px;flex-wrap:wrap}
  .ex-sum-kv{display:flex;gap:24px;flex-wrap:wrap}
  .ex-sum-kv span{font-size:12px;color:var(--text-mid)} .ex-sum-kv b{font-size:13px;color:var(--text);margin-left:8px;font-variant-numeric:tabular-nums}
  .ex-sum-kv b.warn{color:var(--warn)} .ex-sum-kv b.ok{color:var(--ok)}
  .ex-sum-pend{font-size:11.5px;font-weight:500;color:var(--warn)}
  .ex-sum-pend.ok{color:var(--ok)}
  .ex-search{height:30px;box-sizing:border-box;border:1px solid var(--border);border-radius:4px;padding:0 10px;font:inherit;font-size:12px;width:240px}
  /* Fits inside the card WITHOUT scrolling at both 1280 and 1440 (owner
     review 13/9: the first pass forced min-width:1280px, which is wider than
     the ~1150px a 1440-wide window leaves once the 228px sidebar and page
     padding are subtracted — the card scrolled even though nothing needed
     to). overflow-x stays as a safety net for narrower windows only; the
     grid's own track widths below are sized to need it at neither proof
     viewport. */
  .ex-gridwrap{overflow-x:auto}
  /* 4 fixed head tracks + 9 amount groups (spec §2 point 2) + Σύνολο + Κατάσταση. */
  .ex-gh,.ex-gr,.ex-gt{display:grid;grid-template-columns:22px 62px minmax(90px,1fr) 80px repeat(9,60px) 68px 72px;gap:4px;align-items:center;padding:0 10px}
  /* «Καράβια/Τρένα» is the one header that wraps to two lines at this width
     — allowed (line-height 1.1 keeps it inside the fixed 32px row), never
     truncated or renamed. */
  .ex-gh{height:32px;line-height:1.1;background:var(--surface-sunken);border-bottom:2px solid var(--border-mid,var(--border));font-size:9px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--text-mid);overflow-wrap:break-word}
  .ex-gr{min-height:40px;padding-top:6px;padding-bottom:6px}
  .ex-trip{border-bottom:1px solid var(--border)}
  .ex-trip:hover{background:var(--surface-sunken)}
  .ex-trip.open,.ex-gr.open{background:var(--surface-sunken)}
  .ex-legs{padding:0 10px 9px 100px;font-size:12px}
  .ex-legs .rt-n{font-size:11.5px} .ex-legs .rt-c,.ex-legs .rt-d{font-size:11px}
  .ex-legs .ex-route{font-size:12px}
  .ex-gr.none-row{border-top:1px solid var(--border-mid,var(--border));border-bottom:1px solid var(--border)}
  .ex-gt{height:40px;background:var(--surface-sunken);border-top:2px solid var(--navy);font-weight:600}
  .ex-gt .grand{font-family:'Syne',sans-serif;font-size:13.5px}
  .r{text-align:right} .dim{color:var(--text-dim)} .mid{color:var(--text-mid)}
  .n{font-variant-numeric:tabular-nums}
  .ex-plate{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;letter-spacing:.02em;white-space:nowrap}
  .ex-gr>div{min-width:0} .ex-clip{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ex-route{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-mid)}
  .ex-st{font-size:11.5px;font-weight:500;color:var(--text-mid)} .ex-st.att{color:var(--warn)} .ex-st.ok{color:var(--ok)}
  .ex-cell{display:flex;flex-direction:column;align-items:flex-end;gap:1px;padding:2px 4px;border-radius:3px;border:1.5px solid transparent;min-height:26px;justify-content:center}
  .ex-cell.can{cursor:pointer} .ex-cell.can:hover{background:var(--surface-card);border-color:var(--border)}
  .ex-cell.open{border-color:var(--navy);background:var(--surface-card)}
  .ex-cell .a{font-variant-numeric:tabular-nums;font-size:11.5px}
  .ex-cell .b{font-size:9.5px;color:var(--text-dim);white-space:nowrap}
  .ex-cell.missing .a{color:var(--warn);font-weight:500;font-size:11px}
  .ex-cell.empty{min-height:26px}
  .ex-gp{border-bottom:1px solid var(--border-mid,var(--border));border-left:3px solid var(--navy);background:var(--surface-sunken)}
  .ex-gp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 16px 4px;font-size:12px}
  .ex-gp-head .k{font-size:9.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-mid);margin-right:10px}
  .ex-th{height:30px;padding:0 16px;font-size:10px;font-weight:600;letter-spacing:.04em;color:var(--text-mid);text-transform:uppercase;border-bottom:1px solid var(--border)}
  .ex-row{min-height:36px;padding:4px 16px;border-bottom:1px solid var(--border);background:var(--surface-card)}
  .ex-th.ex-line-grid,.ex-row.ex-line-grid{display:grid;grid-template-columns:78px minmax(130px,1fr) 62px 84px 76px minmax(96px,1fr);gap:8px;align-items:center}
  .ex-line-grid>div{min-width:0;overflow-wrap:break-word;word-break:break-word}
  .ex-user{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .m{font-size:13px;font-weight:700} .s{font-size:12px;color:var(--text-mid)}
  .ex-ei{height:30px;border:1px solid var(--border-mid,var(--border));border-radius:3px;padding:0 8px;font:inherit;font-size:12.5px;box-sizing:border-box;background:var(--surface-card)}
  .ex-ei:focus{outline:none;border-color:var(--navy);box-shadow:0 0 0 1px var(--navy)}
  .ex-ei.warn{border-color:var(--warn)}
  .ex-warn-hint{font-size:10.5px;color:var(--warn);display:block;margin-top:2px}
  .ex-row.qe{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;padding:10px 16px 12px;background:transparent;border-bottom:0}
  .ex-row.edit{box-shadow:inset 3px 0 var(--navy);background:var(--surface-card);border-bottom:1px solid var(--border)}
  .ex-qe-break{flex-basis:100%;height:0}
  .ex-qe-cat{width:170px;max-width:100%} .ex-qe-date{width:140px;max-width:100%} .ex-qe-amt{width:100px} .ex-qe-note{flex:1;min-width:160px}
  .ex-qe-hint{font-size:11px;color:var(--text-dim);white-space:nowrap;padding-bottom:8px}
  .ex-qe-fuel{display:flex;flex-wrap:wrap;gap:8px}
  .ex-field{display:flex;flex-direction:column;gap:3px;max-width:100%;position:relative}
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
  /* Searchable country combobox (spec §2.Β/8β) — a plain text input plus a
     positioned list under it; the STORED value only ever changes via
     exCountrySelect on a pick, never by parsing whatever text is typed. */
  .ex-cdrop{position:absolute;top:100%;left:0;right:0;z-index:20;margin-top:2px;background:var(--surface-card);border:1px solid var(--border);border-radius:4px;max-height:180px;overflow-y:auto;box-shadow:var(--shadow-md,0 4px 12px rgba(0,0,0,.12))}
  .ex-cdrop-opt{padding:6px 10px;font-size:12px;cursor:pointer}
  .ex-cdrop-opt.hi,.ex-cdrop-opt:hover{background:var(--surface-sunken)}
  .ex-cdrop-opt.dim{color:var(--text-dim);cursor:default}
  .ex-idocs{padding:8px 16px 10px}
  .ex-idochead{font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-mid);margin-bottom:4px}
  .ex-idoc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:3px 0;font-size:12px}
  @media (max-width:1320px){
    .ex-page{padding:16px 16px 32px}
    .ex-gh,.ex-gr,.ex-gt{grid-template-columns:18px 54px minmax(80px,1fr) 70px repeat(9,54px) 60px 64px;gap:3px;padding:0 8px}
    .ex-legs{padding-left:88px}
    .ex-gr{padding-top:5px;padding-bottom:5px}
    .ex-cell .a{font-size:10.5px}
  }
  </style>`;
}

// ═══════════════════ ΕΝΕΡΓΟ TAB — μοιραζόμενα accessors ═══════════════════
// The grid/panel/entry code below reads through these two instead of _ex.rts
// / _ex.linesByRt directly, so the SAME rendering pipeline serves both tabs
// (spec §2.Γ «ίδιο backend» / «ίδιες στήλες») without a second copy of it.
function exActiveRts() { return _ex.tab === 'vehicle' ? _ex.veh.rts : _ex.rts; }
function exActiveLinesByRt() { return _ex.tab === 'vehicle' ? _ex.veh.linesByRt : _ex.linesByRt; }
function exRtLines(rtId) { return exActiveLinesByRt()[rtId] || []; }
function exFindLine(id) {
  const byRt = exActiveLinesByRt();
  for (const k in byRt) { const f = byRt[k].find(l => l.id === id); if (f) return f; }
  return (_ex.unalloc.find(l => l.id === id)) || null;
}

// ═══════════════════ ΦΟΡΤΩΣΗ ═══════════════════

async function renderExpenses() {
  const c = document.getElementById('content');
  if (can('costs') === 'none') { c.innerHTML = showAccessDenied(); return; }
  _ex.canWrite = can('costs') === 'full';
  c.style.padding = '0';
  _ex.open = null; _ex.editId = null; _ex.q = '';
  if (!_ex.tab) _ex.tab = 'week';
  if (!_ex.week) _ex.week = ctWeekOf(exTodayIso());
  c.innerHTML = exStyles() + '<div class="ex-page"><div style="color:var(--text-mid)">Φόρτωση εξόδων…</div></div>';
  if (_ex.tab === 'vehicle') {
    if (_ex.veh.truckId) await exLoadVehicle(); else await exVehLoadLookupsThenDefault();
  } else {
    await exLoad();
  }
  _ex.importDocs = []; _ex.importDocsLoading = true; _ex.importDocsErr = null;
  exLoadImportDocs(); // fire-and-forget — re-renders on arrival
}

function exSwitchTab(tab) {
  if (_ex.tab === tab) return;
  _ex.tab = tab; _ex.open = null; _ex.editId = null; _ex.q = '';
  if (tab === 'vehicle') {
    if (_ex.veh.truckId) exLoadVehicle(); else exVehLoadLookupsThenDefault();
  } else {
    exRenderPage();
  }
}

// Strip window bounds around the selected week (week tab only).
function exStripBounds() {
  return { from: exShiftIso(_ex.week.start, -7 * EX_STRIP_BACK), to: exShiftIso(_ex.week.end, 7 * EX_STRIP_FWD) };
}

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

// ── Vehicle tab (spec §2.Γ) ─────────────────────────────────────────────
async function exVehLoadLookupsThenDefault() {
  if (!_ex.lookups) {
    try { _ex.lookups = await ctFetch('/costs/lookups'); }
    catch (e) { _ex.veh.err = e.message; exRenderPage(); return; }
  }
  const trucks = (_ex.lookups.trucks || []).filter(t => t.active !== false);
  if (trucks.length) { _ex.veh.truckId = trucks[0].id; await exLoadVehicle(); } else exRenderPage();
}
function exVehSetTruck(v) {
  _ex.veh.truckId = v ? Number(v) : null;
  _ex.open = null; _ex.editId = null;
  if (_ex.veh.truckId) exLoadVehicle(); else exRenderPage();
}
function exVehSetRange(v) {
  _ex.veh.range = Number(v);
  if (_ex.veh.truckId) exLoadVehicle();
}
function exVehTruckPlate() { return _ex.veh.truckId ? exTruckName(_ex.veh.truckId) : ''; }

// ONE /costs/rt?from&to call for the whole range (spec §2.Γ point 1) — the
// Worker has no truck_id-scoped variant of this route, so the truck filter
// happens client-side on the same response, exactly like the week strip
// already filters its own wider window by planning week.
async function exLoadVehicle() {
  _ex.veh.loading = true; _ex.veh.err = null;
  exRenderPage();
  try {
    if (!_ex.lookups) _ex.lookups = await ctFetch('/costs/lookups');
    const curWk = ctWeekOf(exTodayIso());
    const toIso = curWk.end;
    const fromWk = ctWeekOf(exShiftIso(curWk.start, -7 * (_ex.veh.range - 1)));
    const fromIso = fromWk.start;
    _ex.veh.from = fromIso; _ex.veh.to = toIso;
    const rtRes = await ctFetch('/costs/rt?from=' + fromIso + '&to=' + toIso);
    _ex.veh.rts = (rtRes.records || [])
      .filter(r => r.status !== 'cancelled' && r.truck_id === _ex.veh.truckId)
      .sort((a, b) => String(a.date_start).localeCompare(String(b.date_start)) || a.id - b.id);
    await exLoadVehicleLines();
  } catch (e) {
    _ex.veh.err = e.message;
  }
  _ex.veh.loading = false;
  exRenderPage();
}
async function exLoadVehicleLines() {
  const perRt = await Promise.all(_ex.veh.rts.map(r => ctFetch('/costs/lines?rt_id=' + r.id).then(res => [r.id, res.records || []])));
  _ex.veh.linesByRt = Object.fromEntries(perRt);
}

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

function exImportDocRowHtml(d) {
  const period = d.period_from && d.period_to ? (exDate(d.period_from) + '–' + exDate(d.period_to)) : '—';
  const statusTxt = d.status === 'draft' ? 'πρόχειρο' : (d.status || '—');
  const when = d.created_at ? exDate(d.created_at) : '';
  const label = 'DKV · ' + (d.invoice_no || d.zip_name || '—') + ' · ' + period + (d.lines_total != null ? ' · ' + d.lines_total + ' γραμμές' : '') + ' · ' + statusTxt + ' · ' + (d.created_by ? exUserDisplay(d.created_by) : '—') + (when ? ' ' + when : '');
  return `<div class="ex-idoc-row"><span class="s">${escapeHtml(label)}</span><button class="ex-link" onclick='exOpenImportZip(${JSON.stringify(String(d.id))})'>ZIP</button></div>`;
}

async function exOpenImportZip(id) {
  try {
    const res = await ctFetch('/costs/import/docs?id=' + encodeURIComponent(id) + '&signed=1');
    const url = res && (res.signed_url || (res.doc && res.doc.signed_url));
    if (!url) { showErrorToast('Δεν βρέθηκε σύνδεσμος ZIP.', 'error'); return; }
    window.open(url, '_blank');
  } catch (e) { exShowError(e); }
}

// ═══════════════════ ΥΠΟΛΟΓΙΣΜΟΙ ═══════════════════

function exGroupOf(cat) { return EX_GROUPS.find(g => g.cats.includes(cat)) || EX_GROUPS[EX_GROUPS.length - 1]; }
function exGroupLines(lines, group) { return lines.filter(l => group.cats.includes(l.category)); }
function exIsDone(r) { return r.status === 'closed' || r.status === 'complete'; }
function exUnallocInWeek() { return _ex.unalloc.filter(l => l.line_date && l.line_date >= _ex.week.start && l.line_date <= _ex.week.end); }

// «λείπει» is claimed only for a CLOSED own-fleet trip missing fuel or
// tolls — a partner trip never claims anything is missing any more (spec §2
// point 2: «partner trips expect nothing now (no partner column) — keep
// «Πλήρες» for partner trips»). An open trip simply has not happened yet.
function exMissingGroups(r) {
  if (!exIsDone(r)) return [];
  if (exIsPartnerTrip(r)) return [];
  const lines = exRtLines(r.id);
  return EX_EXPECT_OWN.filter(k => !exGroupLines(lines, EX_GROUPS.find(g => g.key === k)).length);
}
function exRtState(r) {
  if (!exIsDone(r)) return { word: 'Σε εξέλιξη', cls: '' };
  return exMissingGroups(r).length ? { word: 'Ελλείψεις', cls: 'att' } : { word: 'Πλήρες', cls: 'ok' };
}

// Generic stats for whichever tab is active. `total` already folds in
// Έξοδα Μ and (week tab) the unallocated lines, so the grand-total cell in
// the footer and «Σύνολο εξόδων» in the summary bar always read the SAME
// number (αρχή 3) instead of two independent sums that could drift apart.
function exStats() {
  const rts = exActiveRts();
  const all = rts.flatMap(r => exRtLines(r.id));
  const expM = rts.reduce((a, r) => a + Number((r.ledger_entry && r.ledger_entry.expenses) || 0), 0);
  const done = rts.filter(exIsDone);
  const gaps = done.filter(r => exMissingGroups(r).length);
  const noneAll = _ex.tab === 'week' ? exUnallocInWeek() : [];
  // Unallocated DKV fee lines are real money but never «εκκρεμότητα» here
  // (spec §2 point 8) — the network fee lands on the sheet before any human
  // could assign it to a trip, so counting it as a pending task would nag
  // about work nobody can do from this screen.
  const noneNonDkv = noneAll.filter(l => l.category !== 'dkv');
  const noneDkv = noneAll.filter(l => l.category === 'dkv');
  return {
    trips: rts.length, complete: done.length - gaps.length, gaps: gaps.length, open: rts.length - done.length,
    lines: all.length + noneAll.length,
    total: exAmt(all) + expM + exAmt(noneAll),
    // «εκτός εβδομάδας» excludes DKV fee lines too — same rule as the in-week count.
    noneWeek: noneNonDkv.length, noneOther: _ex.tab === 'week' ? (_ex.unalloc.filter(l => l.category !== 'dkv').length - noneNonDkv.length) : 0,
    noneDkvWeek: noneDkv.length, noneDkvAmt: exAmt(noneDkv)
  };
}

function exFilteredTrips() {
  const q = _ex.q.trim().toLowerCase();
  const rts = exActiveRts();
  if (!q) return rts;
  const legText = r => (Array.isArray(r.route_legs) ? r.route_legs : []).flatMap(l => [l.from && l.from.name, l.from && l.from.city, l.to && l.to.name, l.to && l.to.city]).filter(Boolean).join(' ');
  return rts.filter(r => (exTruckName(r.truck_id) + ' ' + exPersonName(r) + ' ' + String(r.route_text || '') + ' ' + legText(r)).toLowerCase().includes(q));
}

function exColLabel(k) { if (k === 'expm') return 'Έξοδα Μ'; const g = EX_GROUPS.find(x => x.key === k); return g ? g.label : k; }
function exColTotal(k, trips) {
  if (k === 'expm') return trips.reduce((a, r) => a + Number((r.ledger_entry && r.ledger_entry.expenses) || 0), 0);
  const g = EX_GROUPS.find(x => x.key === k);
  return exAmt(trips.flatMap(r => exGroupLines(exRtLines(r.id), g)));
}
function exExtraColLabel(groupKey) {
  if (groupKey === 'tolls') return 'Χώρα';
  if (groupKey === 'fuel' || groupKey === 'adblue') return 'Λίτρα';
  return '';
}

// ═══════════════════ RENDER ═══════════════════

function exRenderPage() {
  const c = document.getElementById('content');
  // The DKV import view (modules/expenses_import.js) replaces #content in
  // place — a late refetch here must not paint the sheet over it.
  if (c && c.querySelector('.ei-page')) return;
  const tab = _ex.tab;
  const segHtml = `<div class="ex-seg"><button type="button" class="${tab === 'week' ? 'active' : ''}" onclick="exSwitchTab('week')">Εβδομάδα</button><button type="button" class="${tab === 'vehicle' ? 'active' : ''}" onclick="exSwitchTab('vehicle')">Όχημα</button></div>`;
  let titleHtml, subHtml;
  if (tab === 'vehicle') {
    const plate = exVehTruckPlate();
    titleHtml = 'Έξοδα δρομολογίων' + (plate ? ' — Όχημα ' + escapeHtml(plate) : '');
    const rangeLbl = 'Τελευταίες ' + _ex.veh.range + ' εβδομάδες';
    subHtml = (_ex.veh.from && _ex.veh.to)
      ? `${rangeLbl} · ${exDateFull(_ex.veh.from)} – ${exDateFull(_ex.veh.to)} · Κλικ σε κελί για καταχώριση`
      : 'Επίλεξε όχημα';
  } else {
    const w = _ex.week;
    titleHtml = 'Έξοδα δρομολογίων — Εβδομάδα ' + w.week;
    subHtml = `Περίοδος ${exDateFull(w.start)} – ${exDateFull(w.end)} · Κλικ σε κελί για καταχώριση`;
  }
  const head = `<div class="ex-head">
      <div><div class="ex-title">${titleHtml}</div><div class="ex-sub">${subHtml}</div></div>
      <div class="ex-actions-top">${_ex.canWrite ? '<button class="ex-btn" onclick="eiOpenImport()">Εισαγωγή DKV</button>' : ''}</div>
    </div>`;
  const navHtml = tab === 'week' ? exWeekStripHtml() : exVehControlsHtml();
  let body;
  if (tab === 'vehicle') {
    body = _ex.veh.loading ? '<div class="ex-card" style="padding:20px;color:var(--text-mid)">Φόρτωση…</div>'
      : _ex.veh.err ? showError('Τα έξοδα δεν φορτώθηκαν: ' + _ex.veh.err)
      : (_ex.veh.truckId ? exSummaryHtml() + exGridHtml() : '<div class="ex-card" style="padding:20px;color:var(--text-mid)">Επίλεξε όχημα.</div>');
  } else {
    body = _ex.loading ? '<div class="ex-card" style="padding:20px;color:var(--text-mid)">Φόρτωση εβδομάδας…</div>'
      : _ex.err ? showError('Τα έξοδα δεν φορτώθηκαν: ' + _ex.err)
      : exSummaryHtml() + exGridHtml();
  }
  const importHtml = (tab === 'week' && !_ex.loading && !_ex.err) ? exImportDocsSectionHtml() : '';
  c.innerHTML = exStyles() + `<div class="ex-page">${head}${segHtml}${navHtml}${body}${importHtml}</div>`;
}

function exVehControlsHtml() {
  const trucks = (_ex.lookups && _ex.lookups.trucks || []).filter(t => t.active !== false);
  const opts = trucks.map(t => `<option value="${t.id}"${_ex.veh.truckId === t.id ? ' selected' : ''}>${escapeHtml(t.license_plate)}</option>`).join('');
  const rangeOpts = EX_VEH_RANGES.map(v => `<option value="${v}"${_ex.veh.range === v ? ' selected' : ''}>Τελευταίες ${v} εβδομάδες</option>`).join('');
  const rangeTxt = (_ex.veh.from && _ex.veh.to) ? `${exDateFull(_ex.veh.from)} – ${exDateFull(_ex.veh.to)}` : '';
  return `<div class="ex-card ex-vehctl">
    <div class="ex-field" style="width:170px"><label class="ex-flabel">Όχημα</label><select class="ex-ei" onchange="exVehSetTruck(this.value)">${opts}</select></div>
    <div class="ex-field" style="width:200px"><label class="ex-flabel">Εύρος</label><select class="ex-ei" onchange="exVehSetRange(this.value)">${rangeOpts}</select></div>
    <span class="s dim">${escapeHtml(rangeTxt)}</span>
  </div>`;
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
    if (sel && !_ex.loading && !_ex.err) { const s = exStats(); hint = s.gaps ? `<span class="c">${s.gaps} ελλείψεις</span>` : (s.trips ? 'πλήρης' : '—'); }
    else hint = count ? count + ' δρομ.' : '—';
    chips.push(`<button type="button" class="ex-wk${sel ? ' sel' : ''}${future ? ' future' : ''}" onclick="exGoWeek('${wk.start}')">
      <span class="a">Εβδ. ${wk.week}</span><span class="b">${exShortRange(wk.start, wk.end)} · ${hint}</span></button>`);
  }
  return `<div class="ex-card ex-wkstrip"><button type="button" class="ex-wkarrow" onclick="exWeekShift(-1)" title="Προηγούμενη εβδομάδα">‹</button>${chips.join('')}<button type="button" class="ex-wkarrow" onclick="exWeekShift(1)" title="Επόμενη εβδομάδα">›</button></div>`;
}

function exSummaryHtml() {
  const s = exStats();
  const pend = [];
  if (s.gaps) pend.push(s.gaps + (s.gaps === 1 ? ' δρομολόγιο με ελλείψεις' : ' δρομολόγια με ελλείψεις'));
  if (_ex.tab === 'week') {
    if (s.noneWeek) pend.push(s.noneWeek + ' γραμμές χωρίς δρομολόγιο');
    if (s.noneOther) pend.push(s.noneOther + ' χωρίς δρομολόγιο εκτός εβδομάδας');
  }
  return `<div class="ex-card ex-sum">
    <div class="ex-sum-kv">
      <span>Δρομολόγια <b>${s.trips}</b></span>
      <span>Πλήρη <b class="${s.complete ? 'ok' : ''}">${s.complete}</b></span>
      <span>Με ελλείψεις <b class="${s.gaps ? 'warn' : ''}">${s.gaps}</b></span>
      <span>Σε εξέλιξη <b>${s.open}</b></span>
      <span>Γραμμές <b>${s.lines}</b></span>
      <span>Σύνολο εξόδων <b>${exEur(s.total)}</b></span>
    </div>
    <div class="ex-sum-pend${pend.length ? '' : ' ok'}">${pend.length ? 'Εκκρεμότητες: ' + escapeHtml(pend.join(' · ')) : 'Καμία εκκρεμότητα'}</div>
  </div>`;
}

function exGridHtml() {
  const tab = _ex.tab;
  const trips = exFilteredTrips();
  const th = `<div class="ex-gh"><div class="r">Α/Α</div><div>Όχημα</div><div>Οδηγός</div><div>Ημερομηνίες</div>${EX_COL_ORDER.map(k => `<div class="r">${exColLabel(k)} €</div>`).join('')}<div class="r">Σύνολο €</div><div>Κατάσταση</div></div>`;
  const emptyMsg = exActiveRts().length
    ? 'Κανένα δρομολόγιο για αυτή την αναζήτηση.'
    : (tab === 'vehicle' ? 'Κανένα δρομολόγιο σε αυτό το εύρος.' : 'Κανένα δρομολόγιο σε αυτή την εβδομάδα.');
  const rows = trips.length ? trips.map((r, i) => exTripRowHtml(r, i + 1)).join('')
    : `<div class="ex-gr"><div></div><div class="mid" style="grid-column:2/-1">${emptyMsg}</div></div>`;
  const totals = EX_COL_ORDER.map(k => exColTotal(k, trips));
  const stats = exStats();
  const label = tab === 'vehicle'
    ? `Σύνολο ${escapeHtml(exVehTruckPlate())} (${trips.length} δρομολόγια, ${stats.lines} γραμμές)`
    : `Σύνολο εβδομάδας ${_ex.week.week} (${_ex.rts.length} δρομολόγια, ${stats.lines} γραμμές)`;
  const tt = `<div class="ex-gt"><div class="r" style="grid-column:1/5">${label}</div>${totals.map(t => `<div class="r n">${exNum(t)}</div>`).join('')}<div class="r n grand">${exNum(stats.total)}</div><div></div></div>`;
  const tollsLine = tab === 'vehicle' ? exVehTollsByCountryHtml() : '';
  const foot = `<div class="ex-foot"><p>Ποσά όπως στο παραστατικό. Κενό κελί = καμία γραμμή. «Λείπει» μόνο σε ολοκληρωμένο δρομολόγιο χωρίς γραμμή στην κατηγορία.</p><span>Enter = αποθήκευση · Esc = κλείσιμο κελιού</span></div>`;
  const searchPh = tab === 'vehicle' ? 'Οδηγός, πελάτης, ημερομηνία' : 'Πινακίδα, οδηγός, πελάτης';
  return `<div class="ex-card"><div style="display:flex;justify-content:flex-end;padding:8px 16px 0"><input class="ex-search" placeholder="${searchPh}" value="${escapeHtml(_ex.q)}" oninput="exSearchInput(this)"></div>
    <div class="ex-gridwrap"><div class="ex-grid">${th}${rows}${tab === 'week' ? exNoneRowHtml() : ''}${tt}</div></div>${tollsLine}${foot}</div>`;
}

// «Διόδια ανά χώρα» quiet line under the totals row (spec §2.Γ point 1) —
// only meaningful once a truck is scoped, so vehicle tab only.
function exVehTollsByCountryHtml() {
  const tollsGroup = EX_GROUPS.find(g => g.key === 'tolls');
  const all = _ex.veh.rts.flatMap(r => exGroupLines(exRtLines(r.id), tollsGroup));
  const byCountry = {};
  all.forEach(l => { const c = l.toll_country || '—'; byCountry[c] = (byCountry[c] || 0) + exLineAmt(l); });
  const parts = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).map(([c, amt]) => c + ' ' + exNum(amt));
  if (!parts.length) return '';
  return `<div class="ex-foot" style="border-top:0;padding-top:0"><p>Διόδια ανά χώρα: ${escapeHtml(parts.join(' · '))}</p></div>`;
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
  const keyArg = typeof rtKey === 'number' ? rtKey : "'" + rtKey + "'";
  const onclick = _ex.canWrite ? ` onclick="exToggleCell(${keyArg},'${group.key}')"` : '';
  const dkv = lines.length && lines.every(l => l.doc_id) ? ' · DKV' : '';
  const a = missing ? 'λείπει' : (lines.length ? exNum(exAmt(lines)) : '');
  const b = lines.length ? `${lines.length} γρ.${dkv}` : '';
  return `<div class="${cls}" data-rt="${rtKey}" data-group="${group.key}"${onclick}><span class="a">${a}</span>${b ? `<span class="b">${b}</span>` : ''}</div>`;
}

// «Έξοδα Μ» cell: a different data source (rt.ledger_entry, from GET
// /costs/rt) — never a cost line, so it cannot reuse exCellHtml's
// group/lines shape.
function exExpMCellHtml(rtKey, r) {
  const entry = r.ledger_entry;
  const isOpen = _ex.open && _ex.open.rtId === rtKey && _ex.open.group === 'expm';
  const has = entry && entry.expenses != null && Number(entry.expenses) !== 0;
  const cls = ['ex-cell', _ex.canWrite ? 'can' : '', isOpen ? 'open' : '', !has ? 'empty' : ''].filter(Boolean).join(' ');
  const keyArg = typeof rtKey === 'number' ? rtKey : "'" + rtKey + "'";
  const onclick = _ex.canWrite ? ` onclick="exToggleCell(${keyArg},'expm')"` : '';
  const a = has ? exNum(entry.expenses) : '';
  return `<div class="${cls}" data-rt="${rtKey}" data-group="expm"${onclick}><span class="a">${a}</span></div>`;
}

function exTripRowHtml(r, idx) {
  const lines = exRtLines(r.id);
  const missing = exMissingGroups(r);
  const st = exRtState(r);
  const isOpen = _ex.open && _ex.open.rtId === r.id;
  const partner = exIsPartnerTrip(r);
  const cells = EX_COL_ORDER.map(k => {
    if (k === 'expm') return exExpMCellHtml(r.id, r);
    const g = EX_GROUPS.find(x => x.key === k);
    return exCellHtml(r.id, g, exGroupLines(lines, g), missing.includes(k));
  }).join('');
  const hasLegs = Array.isArray(r.route_legs) && r.route_legs.length > 0;
  const legsHtml = hasLegs ? rtLegBlockHtml(r.route_legs) : (r.route_text ? `<span class="ex-route">${escapeHtml(r.route_text)}</span>` : '');
  const expM = Number((r.ledger_entry && r.ledger_entry.expenses) || 0);
  const rowTotal = exAmt(lines) + expM;
  const hasAny = lines.length > 0 || expM !== 0;
  return `<div class="ex-trip${isOpen ? ' open' : ''}" data-trip="${r.id}"><div class="ex-gr${isOpen ? ' open' : ''}" data-rt="${r.id}">
      <div class="r dim">${idx}</div>
      <div class="ex-clip ${partner ? 'mid' : 'ex-plate'}">${escapeHtml(partner ? 'Συνεργάτης' : exTruckName(r.truck_id))}</div>
      <div class="ex-clip" title="${escapeHtml(exPersonName(r))}">${escapeHtml(exPersonName(r))}</div>
      <div class="mid n">${exShortRange(r.date_start, r.date_end || r.date_start)}</div>
      ${cells}
      <div class="r n" style="font-weight:600">${hasAny ? exNum(rowTotal) : ''}</div>
      <div class="ex-st ${st.cls}">${st.word}</div>
    </div>${legsHtml ? `<div class="ex-legs">${legsHtml}</div>` : ''}${isOpen ? exOpenPanelHtml(r) : ''}</div>`;
}

// «Χωρίς δρομολόγιο»: unallocated lines dated inside the week (week tab
// only — the vehicle tab has no such concept, every row there is already a
// specific truck's own RT). Unallocated DKV fee lines are pulled OUT of
// their normal column and shown as one quiet line underneath instead — they
// never had a person to assign them and never will from this row (spec §2
// point 8), so the cell stays non-interactive rather than offering an
// action that always fails.
function exNoneRowHtml() {
  const allLines = exUnallocInWeek();
  const lines = allLines.filter(l => l.category !== 'dkv');
  const dkvLines = allLines.filter(l => l.category === 'dkv');
  const isOpen = _ex.open && _ex.open.rtId === 'none';
  const cells = EX_COL_ORDER.map(k => {
    if (k === 'expm') return '<div></div>';
    if (k === 'dkv') return '<div class="dim" style="font-size:10.5px">βλ. κάτω</div>';
    const g = EX_GROUPS.find(x => x.key === k);
    return exCellHtml('none', g, exGroupLines(lines, g), false);
  }).join('');
  const dkvNote = dkvLines.length
    ? `<div class="ex-idoc-row" style="padding:4px 16px 8px"><span class="s dim">Τέλη DKV χωρίς δρομολόγιο: ${dkvLines.length} ${dkvLines.length === 1 ? 'γραμμή' : 'γραμμές'}, ${exEur(exAmt(dkvLines))}</span></div>`
    : '';
  return `<div class="ex-gr none-row${isOpen ? ' open' : ''}" data-rt="none">
      <div></div><div class="dim">—</div><div class="ex-st${lines.length ? ' att' : ''}">Χωρίς δρομολόγιο</div>
      <div class="${lines.length ? 'mid' : 'dim'}" style="font-size:12px">${lines.length ? lines.length + ' προς ανάθεση' : 'καμία γραμμή'}</div>
      ${cells}
      <div class="r n" style="font-weight:600">${lines.length ? exNum(exAmt(lines)) : ''}</div>
      <div class="ex-st${lines.length ? ' att' : ''}">${lines.length ? 'Ανάθεση' : ''}</div>
    </div>${isOpen ? exOpenPanelHtml(null) : ''}${dkvNote}`;
}

// ═══════════════════ ΑΝΟΙΧΤΟ ΚΕΛΙ ═══════════════════

function exToggleCell(rtKey, groupKey) {
  if (!_ex.canWrite) return;
  if (_ex.open && _ex.open.rtId === rtKey && _ex.open.group === groupKey) { exCloseCell(); return; }
  _ex.open = { rtId: rtKey, group: groupKey };
  _ex.editId = null;
  if (groupKey === 'expm') {
    const rt = exActiveRts().find(r => r.id === rtKey);
    const entry = rt && rt.ledger_entry;
    _ex.expmAmount = entry && entry.expenses != null ? String(entry.expenses) : '';
    exRenderPage();
    const el = document.getElementById('exExpMAmt'); if (el) el.focus();
    return;
  }
  const group = EX_GROUPS.find(g => g.key === groupKey);
  const rt = rtKey === 'none' ? null : exActiveRts().find(r => r.id === rtKey);
  _ex.qe = { category: group.cats[0], date: (rt && rt.date_start) || exTodayIso(), fuelSource: 'DKV', trailerOverride: false, trailerId: null };
  delete _exCountryNs.exQeCountry;
  exRenderPage();
  const netEl = document.getElementById('exQeAmt');
  if (netEl) netEl.focus();
}
function exCloseCell() { _ex.open = null; _ex.editId = null; exRenderPage(); }

// Dispatches to the right panel body for the open cell — the «Έξοδα Μ»
// column reads/writes the payroll ledger, everything else reads/writes a
// cost line, and the two must never share one render function (their save
// rules, and even their target endpoint, differ completely).
function exOpenPanelHtml(rt) {
  if (_ex.open.group === 'expm') return exExpMPanelHtml(rt);
  return exPanelHtml(rt);
}

function exPanelHtml(rt) {
  const group = EX_GROUPS.find(g => g.key === _ex.open.group);
  const isNone = !rt;
  // The none-row's own DKV lines never open here (spec §2 point 8 — see
  // exNoneRowHtml, that cell has no onclick) — exGroupLines naturally
  // returns [] for group.key==='dkv' plus isNone anyway since exUnallocInWeek
  // would need filtering, but the cell is unreachable so this is defensive.
  const lines = isNone ? exGroupLines(exUnallocInWeek(), group) : exGroupLines(exRtLines(rt.id), group);
  const title = isNone ? 'Χωρίς δρομολόγιο' : (exIsPartnerTrip(rt) ? 'Συνεργάτης' : exTruckName(rt.truck_id)) + ' · ' + exPersonName(rt) + ' · ' + exDateRange(rt.date_start, rt.date_end);
  const rowsHtml = lines.length ? lines.map(l => exLineRowHtml(l, { unallocated: isNone })).join('') : '';
  const thHtml = lines.length ? `<div class="ex-th ex-line-grid"><div>Ημ/νία</div><div>Κατηγορία · Σημείωση</div><div>${exExtraColLabel(group.key)}</div><div class="r">Ποσό</div><div>Ποιος</div><div></div></div>` : '';
  return `<div class="ex-gp" data-panel="${isNone ? 'none' : rt.id}">
    <div class="ex-gp-head"><div><span class="k">Καταχώριση</span>${escapeHtml(group.label)} · ${escapeHtml(title)}${lines.length ? ` · <span class="mid">${lines.length} γραμμές, ${exEur(exAmt(lines))}</span>` : ''}</div><button class="ex-link" onclick="exCloseCell()">Κλείσιμο</button></div>
    ${thHtml}${rowsHtml}${exQeRowHtml(group)}
  </div>`;
}

// «Έξοδα Μ» panel (spec §2 point 6): ONE field, writes the payroll ledger
// directly — not ct_cost_lines. rt is always a real trip here; the
// «Χωρίς δρομολόγιο» row never renders a clickable Έξοδα Μ cell (no RT ⇒ no
// ledger entry can exist), so this function is never called with rt===null.
function exExpMPanelHtml(rt) {
  if (!rt) return '';
  const entry = rt.ledger_entry;
  const title = (exIsPartnerTrip(rt) ? 'Συνεργάτης' : exTruckName(rt.truck_id)) + ' · ' + exPersonName(rt) + ' · ' + exDateRange(rt.date_start, rt.date_end);
  const head = `<div class="ex-gp-head"><div><span class="k">Καταχώριση</span>Έξοδα Μ · ${escapeHtml(title)}</div><button class="ex-link" onclick="exCloseCell()">Κλείσιμο</button></div>`;
  if (!entry) {
    return `<div class="ex-gp" data-panel="${rt.id}">${head}<div class="ex-row" style="padding:10px 16px;color:var(--text-mid)">Το δρομολόγιο δεν έχει εγγραφή Μισθοδοσίας.</div></div>`;
  }
  return `<div class="ex-gp" data-panel="${rt.id}">${head}
    <div class="ex-row qe">
      <div class="ex-field ex-qe-amt"><label class="ex-flabel">Ποσό €</label><input class="ex-ei" type="number" step="0.01" id="exExpMAmt" value="${escapeHtml(_ex.expmAmount || '')}" onkeydown="exExpMKeydown(event)"></div>
      <span class="ex-qe-hint">Enter = αποθήκευση</span>
    </div>
  </div>`;
}
function exExpMKeydown(ev) { if (ev.key === 'Enter') { ev.preventDefault(); exExpMSubmit(); } else if (ev.key === 'Escape') { ev.preventDefault(); exCloseCell(); } }

async function exExpMSubmit() {
  if (!_ex.open || _ex.open.group !== 'expm') return;
  const rt = exActiveRts().find(r => r.id === _ex.open.rtId);
  if (!rt || !rt.ledger_entry) return;
  const el = document.getElementById('exExpMAmt');
  const raw = el ? el.value : '';
  if (raw === '') { showErrorToast('Χρειάζεται ποσό.', 'error'); return; }
  const amount = Number(raw);
  const before = rt.ledger_entry.expenses;
  const body = { expenses: amount };
  // Worker rule (worker/src/ledger-rules.mjs validatePatch): reason required
  // only when an already-written (non-null) value actually changes — same
  // client-side check as modules/payroll.js dlSaveInlineEdit, so this never
  // round-trips a 400 for a rule the Worker already enforces.
  if (before != null && Number(before) !== amount) {
    const reason = window.prompt('Αιτιολογία αλλαγής (υποχρεωτική):');
    if (!reason || !reason.trim()) return;
    body.reason = reason.trim();
  }
  try {
    await ctFetch('/costs/ledger/' + rt.ledger_entry.id, { method: 'PATCH', body });
    await exAfterLedgerMutation();
  } catch (e) { exShowError(e); }
}
// ledger_entry lives on the RT row itself (GET /costs/rt), not on a cost
// line — a plain lines refetch would never see the new value, so this
// reloads the whole active tab (spec §2 point 6 «refetch /costs/rt»).
async function exAfterLedgerMutation() {
  try { await (_ex.tab === 'vehicle' ? exLoadVehicle() : exLoad()); }
  catch (e) { showErrorToast('Η καταχώρηση έγινε, αλλά τα σύνολα δεν ανανεώθηκαν: ' + e.message, 'error'); }
}

// ═══════════════════ ΧΩΡΑ — searchable combobox (spec §2 point 5) ═══════
// Reuses core/countries.js (countryCode/countryName/COUNTRY_PRIORITY) rather
// than a second hardcoded country list: that file already IS «ISO-2 code +
// Greek name, Europe/fleet countries first» for the whole app (driver/partner
// sheets already search it the same way) — a parallel EX_COUNTRIES constant
// would be exactly the «δύο πηγές αλήθειας» CLAUDE.md forbids, for data this
// codebase already owns in one place. The STORED value is always the code
// returned by a pick (exCountryPick) — never anything typed by hand.
const _exCountryNs = {}; // namespace ('exQeCountry' | 'exMdCountry' | 'exEdCountry_<id>') → { code, query, matches, hi, open }
function _exCountryNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function _exCountryOrder() {
  return COUNTRY_PRIORITY.concat(COUNTRY_CODES.filter(c => !COUNTRY_PRIORITY.includes(c)))
    .sort((a, b) => { const pa = COUNTRY_PRIORITY.indexOf(a), pb = COUNTRY_PRIORITY.indexOf(b); if (pa !== -1 && pb !== -1) return pa - pb; if (pa !== -1) return -1; if (pb !== -1) return 1; return countryName(a).localeCompare(countryName(b), 'el'); });
}
function _exCountryMatches(q) {
  const nq = _exCountryNorm(q);
  const ordered = _exCountryOrder();
  const pool = nq ? ordered.filter(c => _exCountryNorm(countryName(c)).includes(nq) || c.toLowerCase() === nq) : ordered;
  return pool.slice(0, 8).map(c => ({ code: c, name: countryName(c) }));
}
function exCountryDropHtml(ns) {
  const st = _exCountryNs[ns];
  if (!st || !st.open) return '';
  if (!st.matches.length) return '<div class="ex-cdrop-opt dim">καμία χώρα</div>';
  return st.matches.map((m, i) => `<div class="ex-cdrop-opt${i === st.hi ? ' hi' : ''}" onmousedown="event.preventDefault();exCountryPick('${ns}',${i})">${escapeHtml(m.name)} (${m.code})</div>`).join('');
}
function exCountryFieldHtml(ns, width) {
  const st = _exCountryNs[ns];
  const val = st && st.code ? (countryName(st.code) + ' (' + st.code + ')') : ((st && st.query) || '');
  return `<div class="ex-field ex-country" style="width:${width || 170}px">
    <label class="ex-flabel">Χώρα</label>
    <input class="ex-ei" type="text" autocomplete="off" id="${ns}Input" placeholder="αναζήτηση…" value="${escapeHtml(val)}"
      oninput="exCountryInput('${ns}', this)" onkeydown="exCountryKeydown('${ns}', event)" onfocus="exCountryInput('${ns}', this)">
    <div class="ex-cdrop" id="${ns}Drop"${st && st.open ? '' : ' hidden'}>${exCountryDropHtml(ns)}</div>
  </div>`;
}
function _exCountryRenderDrop(ns) {
  const d = document.getElementById(ns + 'Drop');
  const st = _exCountryNs[ns];
  if (!d) return;
  d.innerHTML = exCountryDropHtml(ns);
  d.hidden = !(st && st.open);
}
function exCountryInput(ns, el) {
  const st = _exCountryNs[ns] = _exCountryNs[ns] || {};
  st.query = el.value; st.open = true; st.hi = 0; st.matches = _exCountryMatches(el.value); st.code = null;
  _exCountryRenderDrop(ns);
}
function exCountryKeydown(ns, ev) {
  const st = _exCountryNs[ns] || (_exCountryNs[ns] = { matches: _exCountryMatches(''), open: false, hi: 0 });
  if (ev.key === 'ArrowDown') { ev.preventDefault(); st.open = true; if (!st.matches.length) st.matches = _exCountryMatches(st.query || ''); st.hi = Math.min((st.hi || 0) + 1, st.matches.length - 1); _exCountryRenderDrop(ns); return; }
  if (ev.key === 'ArrowUp') { ev.preventDefault(); st.hi = Math.max((st.hi || 0) - 1, 0); _exCountryRenderDrop(ns); return; }
  if (ev.key === 'Enter') { if (st.open && st.matches.length) { ev.preventDefault(); exCountryPick(ns, st.hi || 0); } return; }
  if (ev.key === 'Escape') { if (st.open) { ev.preventDefault(); ev.stopPropagation(); st.open = false; _exCountryRenderDrop(ns); } }
}
function exCountryPick(ns, i) {
  const st = _exCountryNs[ns]; if (!st || !st.matches[i]) return;
  const m = st.matches[i];
  st.open = false; st.code = m.code;
  const input = document.getElementById(ns + 'Input');
  if (input) input.value = m.name + ' (' + m.code + ')';
  _exCountryRenderDrop(ns);
}

// ═══════════════════ ΡΥΜΟΥΛΚΑ — reefer trailer chip/select (spec §2 point 4) ═
// state: an object carrying {trailerOverride, trailerId} — _ex.qe for the
// inline row, _exModalState for the modal. ns picks which DOM ids/handlers
// a re-render targets so the same function serves both surfaces.
function exTrailerFieldHtml(rt, state, ns) {
  ns = ns || 'qe';
  const rtTrailerId = rt && rt.trailer_id;
  const showSelect = state.trailerOverride || !rtTrailerId;
  const idAttr = ns === 'md' ? 'exMdTrailerId' : 'exQeTrailerId';
  if (!showSelect) {
    const plate = exResolveTrailerName(rtTrailerId) || ('#' + rtTrailerId);
    return `<div class="ex-field" style="width:220px"><label class="ex-flabel">Ρυμούλκα</label>
      <div class="s">${escapeHtml(plate)} · από το δρομολόγιο · <button type="button" class="ex-link" onclick="exTrailerOverrideClick('${ns}')">αλλαγή</button></div></div>`;
  }
  const trailers = (_ex.lookups && _ex.lookups.trailers) || [];
  const opts = '<option value="">Ρυμούλκα…</option>' + trailers.map(t => `<option value="${t.id}"${state.trailerId === t.id ? ' selected' : ''}>${escapeHtml(t.license_plate)}</option>`).join('');
  const warn = !rtTrailerId;
  return `<div class="ex-field" style="width:170px">
    <label class="ex-flabel">Ρυμούλκα</label>
    <select class="ex-ei${warn ? ' warn' : ''}" id="${idAttr}" onchange="exTrailerIdChange('${ns}', this.value)">${opts}</select>
    ${warn ? '<span class="ex-warn-hint">Το δρομολόγιο δεν έχει ρυμούλκα — επίλεξε</span>' : ''}
  </div>`;
}
function _exTrailerStateFor(ns) { return ns === 'md' ? _exModalState : _ex.qe; }
function exTrailerIdChange(ns, val) { const s = _exTrailerStateFor(ns); if (s) s.trailerId = val ? Number(val) : null; }
function exTrailerOverrideClick(ns) {
  const s = _exTrailerStateFor(ns); if (!s) return;
  s.trailerOverride = true;
  if (ns === 'md') {
    const wrap = document.getElementById('exMdReeferWrap');
    if (wrap) wrap.innerHTML = exTrailerFieldHtml(s.rt, s, 'md');
  } else {
    const wrap = document.getElementById('exQeReeferWrap');
    const rtId = exOpenRtId(); const rt = rtId != null ? exActiveRts().find(r => r.id === rtId) : null;
    if (wrap) wrap.innerHTML = exTrailerFieldHtml(rt, s, 'qe');
  }
}

function exFuelSourceSelectHtml(id, value) {
  const opts = EX_FUEL_SOURCES.map(o => `<option value="${o.v}"${value === o.v ? ' selected' : ''}>${escapeHtml(o.l)}</option>`).join('');
  return `<div class="ex-field" style="width:130px"><label class="ex-flabel">Πηγή</label><select class="ex-ei" id="${id}">${opts}</select></div>`;
}

// ═══════════════════ ΓΡΗΓΟΡΗ ΚΑΤΑΧΩΡΗΣΗ ═══════════════════

function exQeRowHtml(group) {
  const cat = _ex.qe.category;
  const fuelOn = EX_FUEL_CATEGORIES.includes(cat);
  const fuelSourceOn = EX_FUEL_SOURCE_CATEGORIES.includes(cat);
  const isTolls = cat === 'tolls';
  const isReefer = cat === 'reefer_fuel';
  // The select is scoped to THIS group's own categories only (spec §2 point
  // 4 «Κατηγορία περιορισμένη») — a receipt that needs a different category
  // is corrected afterwards (Διόρθωση, full category list), not re-typed
  // here mid-entry.
  const opts = group.cats.map(c => `<option value="${c}"${cat === c ? ' selected' : ''}>${escapeHtml(CT_CATEGORY_LABELS[c] || c)}</option>`).join('');
  const rtId = exOpenRtId();
  const rt = rtId != null ? exActiveRts().find(r => r.id === rtId) : null;
  return `<div class="ex-row qe">
    <div class="ex-field ex-qe-cat"><label class="ex-flabel">Κατηγορία</label><select class="ex-ei" id="exQeCategory" onchange="exQeCategoryChange(this)">${opts}</select></div>
    ${fuelSourceOn ? exFuelSourceSelectHtml('exQeFuelSource', _ex.qe.fuelSource) : ''}
    <div class="ex-field ex-qe-date"><label class="ex-flabel">Ημερομηνία</label><input class="ex-ei" type="date" id="exQeDate" value="${_ex.qe.date || ''}" onchange="exQeDateChange(this)"></div>
    ${isTolls ? exCountryFieldHtml('exQeCountry', 170) : ''}
    <div class="ex-field ex-qe-amt"><label class="ex-flabel">Ποσό €</label><input class="ex-ei" type="number" step="0.01" id="exQeAmt" placeholder="0,00" onkeydown="exQeKeydown(event)"></div>
    <div class="ex-field ex-qe-note"><label class="ex-flabel">Παραστατικό / σημείωση</label><input class="ex-ei" type="text" id="exQeNote" placeholder="αρ. απόδειξης" onkeydown="exQeKeydown(event)"></div>
    <span class="ex-qe-hint">Enter = αποθήκευση · <button class="ex-link" type="button" onclick="exOpenEntryModalFromRow()">σε παράθυρο</button></span>
    <div class="ex-qe-break"></div>
    <span id="exQeReeferWrap">${isReefer ? exTrailerFieldHtml(rt, _ex.qe, 'qe') : ''}</span>
    ${isReefer ? '<div class="ex-qe-break"></div>' : ''}
    <span id="exQeFuelFields" class="ex-qe-fuel" style="display:${fuelOn ? 'flex' : 'none'}">
      <div class="ex-field" style="width:90px"><label class="ex-flabel">Λίτρα</label><input class="ex-ei" type="number" step="0.01" id="exQeLiters" onkeydown="exQeKeydown(event)"></div>
      <div class="ex-field" style="width:100px"><label class="ex-flabel">Χιλιόμετρα</label><input class="ex-ei" type="number" step="1" min="0" id="exQeKm" onkeydown="exQeKeydown(event)"></div>
      <div class="ex-field" style="width:120px"><label class="ex-flabel">Πρατήριο</label><input class="ex-ei" type="text" id="exQeStation" onkeydown="exQeKeydown(event)"></div>
    </span>
  </div>`;
}

// Only the reefer wrap needs live updating on a category switch within the
// fuel group (fuel ⇄ reefer_fuel) — a full re-render would drop whatever the
// user already typed in Ποσό/Παραστατικό (they are not part of _ex.qe).
function exQeCategoryChange(el) {
  _ex.qe.category = el.value;
  _ex.qe.trailerOverride = false; _ex.qe.trailerId = null;
  const wrap = document.getElementById('exQeReeferWrap');
  if (wrap) {
    const rtId = exOpenRtId(); const rt = rtId != null ? exActiveRts().find(r => r.id === rtId) : null;
    wrap.innerHTML = el.value === 'reefer_fuel' ? exTrailerFieldHtml(rt, _ex.qe, 'qe') : '';
  }
}
function exQeDateChange(el) { _ex.qe.date = el.value; }
function exQeKeydown(ev) {
  if (ev.key === 'Enter') { ev.preventDefault(); exQeSubmit(); }
  else if (ev.key === 'Escape') { ev.preventDefault(); exCloseCell(); }
}

// Κοινό σώμα POST/PATCH /costs/lines — το μοιράζονται η ενσωματωμένη γραμμή
// (exQeSubmit), το modal (exModalSubmit) ΚΑΙ η διόρθωση (exSaveEdit), ώστε ο
// κανόνας ενός ποσού/fuel_source/trailer_id/toll_country να ζει σε ΕΝΑ
// σημείο (αρχή 3). v.amount is the single «Ποσό €» — always written to
// `net` (spec §2 point 3): the split net/vat pair only still exists for a
// DKV-imported line, which never goes through this builder.
function exBuildLineBody(rtId, v) {
  if (!v.date) { showErrorToast('Χρειάζεται ημερομηνία.', 'error'); return null; }
  if (v.amount === '' || v.amount == null || isNaN(Number(v.amount))) { showErrorToast('Χρειάζεται ποσό.', 'error'); return null; }
  const body = { category: v.category, line_date: v.date, net: Number(v.amount) };
  if (rtId != null) body.rt_id = Number(rtId);
  const note = (v.note || '').trim();
  if (note) body.note = note;
  if (EX_FUEL_CATEGORIES.includes(v.category)) {
    if (v.liters !== '' && v.liters != null) body.liters = Number(v.liters);
    if (v.km !== '' && v.km != null) body.km_reading = Math.round(Number(v.km)); // integer column
    const station = (v.station || '').trim();
    if (station) body.station = station;
  }
  if (EX_FUEL_SOURCE_CATEGORIES.includes(v.category) && v.fuelSource) {
    body.fuel_source = v.fuelSource;
  }
  if (v.category === 'reefer_fuel') {
    // Chip mode (RT has its own trailer, never overridden): omit trailer_id
    // entirely — the Worker defaults it from the RT (worker/src/index.js
    // POST/PATCH /costs/lines). Select mode (overridden, or the RT has none
    // to default from): a value is mandatory, never a silent null credit.
    if (v.trailerOverride || !v.rtHasTrailer) {
      if (v.trailerId == null) { showErrorToast('Χρειάζεται ρυμούλκα.', 'error'); return null; }
      body.trailer_id = Number(v.trailerId);
    }
  }
  if (v.category === 'tolls') {
    if (!v.tollCountry) { showErrorToast('Χρειάζεται χώρα διοδίων.', 'error'); return null; }
    body.toll_country = v.tollCountry;
  }
  return body;
}

function exOpenRtId() { return !_ex.open || _ex.open.rtId === 'none' ? null : _ex.open.rtId; }

async function exQeSubmit() {
  if (!_ex.open) return;
  const g = id => document.getElementById(id);
  const rtId = exOpenRtId();
  const rt = rtId != null ? exActiveRts().find(r => r.id === rtId) : null;
  const category = g('exQeCategory').value;
  const body = exBuildLineBody(rtId, {
    category, date: g('exQeDate').value, amount: g('exQeAmt').value, note: g('exQeNote').value,
    liters: g('exQeLiters') ? g('exQeLiters').value : '', km: g('exQeKm') ? g('exQeKm').value : '', station: g('exQeStation') ? g('exQeStation').value : '',
    fuelSource: g('exQeFuelSource') ? g('exQeFuelSource').value : '',
    trailerId: _ex.qe.trailerId, trailerOverride: _ex.qe.trailerOverride, rtHasTrailer: !!(rt && rt.trailer_id),
    tollCountry: (_exCountryNs.exQeCountry || {}).code
  });
  if (!body) return;
  try {
    await ctFetch('/costs/lines', { method: 'POST', body });
    await exAfterMutation();
    // Category + date stay (spec: πολλές αποδείξεις στη σειρά) — only the
    // amount field is cleared, done implicitly by exRenderPage rebuilding
    // the row from _ex.qe, which was never touched above.
    const amtEl = document.getElementById('exQeAmt');
    if (amtEl) amtEl.focus();
  } catch (e) { exShowError(e); }
}

// ═══════════════════ ΓΡΑΜΜΗ / ΔΙΟΡΘΩΣΗ / ΔΙΑΓΡΑΦΗ / ΑΝΑΘΕΣΗ ═══════════════

function exLineRowHtml(line, opts) {
  if (_ex.editId === line.id) return exEditLineRowHtml(line);
  const mine = typeof user !== 'undefined' && user && line.created_by === user.username;
  const canEditThis = _ex.canWrite && (mine || ROLE === 'owner');
  const isTolls = line.category === 'tolls';
  const extraTxt = isTolls ? (line.toll_country || '') : (line.liters != null ? Number(line.liters).toLocaleString('el-GR', { maximumFractionDigits: 2 }) + ' L' : '');
  const extraCls = isTolls ? 'ex-plate' : 's dim';
  const noteBits = [
    line.note,
    line.category === 'reefer_fuel' && line.trailer_id ? 'Ρυμούλκα ' + (exResolveTrailerName(line.trailer_id) || ('#' + line.trailer_id)) : null,
    line.fuel_source ? (EX_FUEL_SOURCES.find(s => s.v === line.fuel_source) || {}).l : null
  ].filter(Boolean).join(' · ');
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
    <div class="ex-cn"><span class="ex-cat${line.doc_id ? ' dkv' : ''}">${escapeHtml(CT_CATEGORY_LABELS[line.category] || line.category)}${line.doc_id ? ' · DKV' : ''}</span>${noteBits ? `<br><span class="s dim">${escapeHtml(noteBits)}</span>` : ''}</div>
    <div class="${extraCls}">${escapeHtml(extraTxt)}</div>
    <div class="n r">${exEur(exLineAmt(line))}</div>
    <div class="s dim ex-user" title="${escapeHtml(line.created_by || '')}">${escapeHtml(exUserDisplay(line.created_by))}</div>
    <div class="ex-actions">${assignHtml}${actionsHtml}</div>
  </div>`;
}

function exEditLineRowHtml(line) {
  const p = id => id + '_' + line.id;
  const fuelOn = EX_FUEL_CATEGORIES.includes(line.category);
  const fuelSourceOn = EX_FUEL_SOURCE_CATEGORIES.includes(line.category);
  const isTolls = line.category === 'tolls';
  const isReefer = line.category === 'reefer_fuel';
  const cns = 'exEdCountry_' + line.id;
  if (isTolls && !_exCountryNs[cns]) _exCountryNs[cns] = { code: line.toll_country || null, query: '', matches: [], open: false, hi: 0 };
  const opts = EX_CATEGORIES.map(c => `<option value="${c}"${line.category === c ? ' selected' : ''}>${escapeHtml(CT_CATEGORY_LABELS[c] || c)}</option>`).join('');
  const trailers = (_ex.lookups && _ex.lookups.trailers) || [];
  const trailerOptsHtml = '<option value="">Ρυμούλκα…</option>' + trailers.map(t => `<option value="${t.id}"${line.trailer_id === t.id ? ' selected' : ''}>${escapeHtml(t.license_plate)}</option>`).join('');
  return `<div class="ex-row edit qe" data-line="${line.id}">
    <select class="ex-ei ex-qe-cat" id="${p('exEdCategory')}" onchange="exEdCategoryChange(${line.id}, this)">${opts}</select>
    <input class="ex-ei ex-qe-date" type="date" id="${p('exEdDate')}" value="${line.line_date || ''}">
    <input class="ex-ei ex-qe-amt" type="number" step="0.01" id="${p('exEdAmt')}" value="${line.net != null || line.vat != null ? exLineAmt(line) : ''}">
    <div class="ex-qe-break"></div>
    <input class="ex-ei ex-qe-note" type="text" id="${p('exEdNote')}" value="${escapeHtml(line.note || '')}">
    <div class="ex-qe-break"></div>
    <span id="${p('exEdFuelSourceWrap')}">${fuelSourceOn ? exFuelSourceSelectHtml(p('exEdFuelSource'), line.fuel_source || 'DKV') : ''}</span>
    <span id="${p('exEdCountryWrap')}">${isTolls ? exCountryFieldHtml(cns, 170) : ''}</span>
    <span id="${p('exEdTrailerWrap')}">${isReefer ? `<div class="ex-field" style="width:170px"><label class="ex-flabel">Ρυμούλκα</label><select class="ex-ei" id="${p('exEdTrailerId')}">${trailerOptsHtml}</select></div>` : ''}</span>
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
  const line = exFindLine(id) || {};
  const p = k => k + '_' + id;
  const g = document.getElementById(p('exEdFuelFields'));
  if (g) g.style.display = EX_FUEL_CATEGORIES.includes(el.value) ? 'flex' : 'none';
  const srcWrap = document.getElementById(p('exEdFuelSourceWrap'));
  if (srcWrap) srcWrap.innerHTML = EX_FUEL_SOURCE_CATEGORIES.includes(el.value) ? exFuelSourceSelectHtml(p('exEdFuelSource'), line.fuel_source || 'DKV') : '';
  const cWrap = document.getElementById(p('exEdCountryWrap'));
  if (cWrap) {
    const cns = 'exEdCountry_' + id;
    if (!_exCountryNs[cns]) _exCountryNs[cns] = { code: line.toll_country || null, query: '', matches: [], open: false, hi: 0 };
    cWrap.innerHTML = el.value === 'tolls' ? exCountryFieldHtml(cns, 170) : '';
  }
  const tWrap = document.getElementById(p('exEdTrailerWrap'));
  if (tWrap) {
    const trailers = (_ex.lookups && _ex.lookups.trailers) || [];
    const trailerOptsHtml = '<option value="">Ρυμούλκα…</option>' + trailers.map(t => `<option value="${t.id}"${line.trailer_id === t.id ? ' selected' : ''}>${escapeHtml(t.license_plate)}</option>`).join('');
    tWrap.innerHTML = el.value === 'reefer_fuel' ? `<div class="ex-field" style="width:170px"><label class="ex-flabel">Ρυμούλκα</label><select class="ex-ei" id="${p('exEdTrailerId')}">${trailerOptsHtml}</select></div>` : '';
  }
}

// PATCH /costs/lines/:id requires a non-empty `reason` (worker/src/index.js
// «ΣΗΜΑΔΕΜΕΝΗ ΠΡΟΣΘΗΚΗ») — every correction here 400s without it.
async function exSaveEdit(id) {
  const g = k => document.getElementById(k + '_' + id);
  const category = g('exEdCategory').value;
  const line_date = g('exEdDate').value;
  const amtStr = g('exEdAmt').value;
  if (amtStr === '') { showErrorToast('Χρειάζεται ποσό.', 'error'); return; }
  let tollCountry;
  if (category === 'tolls') {
    tollCountry = (_exCountryNs['exEdCountry_' + id] || {}).code;
    if (!tollCountry) { showErrorToast('Χρειάζεται χώρα διοδίων.', 'error'); return; }
  }
  const reason = window.prompt('Αιτιολογία διόρθωσης (υποχρεωτική):');
  if (!reason || !reason.trim()) return;
  // Spec §2 point 3: one field going forward — a correction always writes
  // net = the typed amount and zeroes vat, even for a line whose vat used to
  // be split (a DKV-imported line's own numbers are untouched unless a human
  // deliberately edits them here).
  const body = { category, line_date, reason: reason.trim(), net: Number(amtStr), vat: 0 };
  const note = g('exEdNote').value.trim();
  if (note) body.note = note;
  if (EX_FUEL_CATEGORIES.includes(category)) {
    const liters = g('exEdLiters').value, km = g('exEdKm').value, station = g('exEdStation').value.trim();
    if (liters !== '') body.liters = Number(liters);
    if (km !== '') body.km_reading = Math.round(Number(km));
    if (station) body.station = station;
  }
  if (EX_FUEL_SOURCE_CATEGORIES.includes(category)) {
    const fs = g('exEdFuelSource'); if (fs) body.fuel_source = fs.value;
  }
  if (category === 'reefer_fuel') {
    const tr = g('exEdTrailerId'); if (tr && tr.value) body.trailer_id = Number(tr.value);
  }
  if (category === 'tolls') body.toll_country = tollCountry;
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

// Shared by every cost-line write path: reloads the ACTIVE tab's lines
// straight from the server — never a local increment (αρχή 2). The open
// cell stays open so a run of receipts goes in without re-clicking.
async function exAfterMutation() {
  try { if (_ex.tab === 'vehicle') await exLoadVehicleLines(); else await exLoadLines(); }
  catch (e) { showErrorToast('Η καταχώρηση έγινε, αλλά τα σύνολα δεν ανανεώθηκαν: ' + e.message, 'error'); }
  exRenderPage();
}

function exEditLine(id) { _ex.editId = id; exRenderPage(); }
function exCancelEdit() { _ex.editId = null; exRenderPage(); }

// ═══════════════════ ΜΙΑ ΦΟΡΜΑ, ΔΥΟ ΠΟΡΤΕΣ (round 2, owner 7/9 night) ═══════
// exOpenEntryModal(): ΟΙ ΙΔΙΕΣ κανόνες/πεδία με την ενσωματωμένη καταχώρηση
// (exBuildLineBody, exQeSubmit πιο πάνω), ως κεντραρισμένο modal. Δύο καλούντες:
//   1. Αυτή η οθόνη — σύνδεσμος «σε παράθυρο», σε αυτή την περίπτωση
//      `categories` περιορίζεται στο ανοιχτό group (ίδιος κανόνας με exQeRowHtml).
//   2. Το TRIP PnL (modules/costs.js, owner-only, ctOpenEntry) — καμία ομάδα
//      κελιού, άρα `categories` λείπει και ο πλήρης κατάλογος EX_CATEGORIES
//      μένει διαθέσιμος, όπως πριν.
let _exModalState = null;

function exEnsureModalStyles() {
  if (document.getElementById('exModalStyleTag')) return;
  const tag = document.createElement('style');
  tag.id = 'exModalStyleTag';
  tag.textContent = `
    .ex-modal-scrim{position:fixed;inset:0;background:rgba(11,25,41,.45);z-index:var(--z-overlay,9000)}
    .ex-modal-box{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:560px;max-width:94vw;max-height:90vh;overflow-y:auto;background:var(--surface-card);border-radius:4px;box-shadow:var(--shadow-md);z-index:calc(var(--z-overlay,9000) + 1);font-family:'DM Sans',sans-serif;color:var(--text)}
    .ex-modal-head{background:var(--surface-dark);color:var(--text-on-dark);padding:12px 20px;font-family:'Syne',sans-serif;font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .ex-modal-close{background:none;border:0;color:var(--text-dim);font-size:18px;cursor:pointer;line-height:1}
    .ex-modal-body{padding:16px 20px}
    .ex-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .ex-modal-grid .ex-field{grid-column:span 1}
    .ex-modal-grid .ex-field.ex-modal-wide{grid-column:1/-1}
    .ex-modal-fuel{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:12px}
    .ex-modal-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
    .ex-modal-box .ex-field{display:flex;flex-direction:column;gap:3px;position:relative}
    .ex-modal-box .ex-flabel{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-mid)}
    .ex-modal-box .ex-ei{height:30px;border:1px solid var(--border);border-radius:3px;padding:0 8px;font:inherit;font-size:12.5px;box-sizing:border-box;width:100%}
    .ex-modal-box .ex-btn{height:32px;padding:0 14px;border-radius:4px;border:1px solid var(--border);background:var(--surface-card);font:inherit;font-size:12.5px;cursor:pointer;color:var(--text)}
    .ex-modal-box .ex-btn-primary{background:var(--navy);color:var(--text-on-dark);border-color:var(--navy)}
  `;
  document.head.appendChild(tag);
}

function exModalLookups() {
  if (_ex.lookups) return _ex.lookups;
  if (typeof _ct !== 'undefined' && _ct.lookups) return _ct.lookups;
  return null;
}
function exModalTruckName(id) { const lk = exModalLookups(); const t = lk && (lk.trucks || []).find(x => x.id === id); return t ? t.license_plate : null; }
function exModalDriverName(id) { const lk = exModalLookups(); const d = lk && (lk.drivers || []).find(x => x.id === id); return d ? d.full_name : null; }
function exModalPartnerName(id) { const lk = exModalLookups(); const p = lk && (lk.partners || []).find(x => x.id === id); return p ? p.company_name : null; }

function exModalTitle(rt, rtId) {
  if (rtId == null) return 'Καταχώρηση κόστους — Χωρίς δρομολόγιο';
  if (!rt) return 'Καταχώρηση κόστους';
  const plate = exModalTruckName(rt.truck_id);
  const person = exModalDriverName(rt.driver_id) || exModalPartnerName(rt.partner_id);
  const parts = [plate, person].filter(Boolean);
  return 'Καταχώρηση κόστους' + (parts.length ? ' — ' + parts.join(' · ') : '');
}

/**
 * exOpenEntryModal({ rtId, rt, onSaved, category, categories })
 * rtId: αριθμός δρομολογίου ή null («Χωρίς δρομολόγιο»).
 * rt:   προαιρετικό record (προεπιλογή ημερομηνίας/ρυμούλκας + τίτλος).
 * categories: προαιρετικός περιορισμός του Κατηγορία select (group.cats).
 * onSaved: καλείται ΜΕΤΑ την επιτυχή POST — ο καλών ξαναφορτώνει τα δικά του.
 */
function exOpenEntryModal({ rtId, rt, onSaved, category, categories }) {
  exEnsureModalStyles();
  _exModalState = {
    rtId: rtId == null ? null : Number(rtId), rt: rt || null, onSaved,
    categories: categories || null,
    category: category || (categories && categories[0]) || EX_CATEGORIES[0],
    date: (rt && rt.date_start) || exTodayIso(),
    fuelSource: 'DKV', trailerOverride: false, trailerId: null
  };
  delete _exCountryNs.exMdCountry;
  let host = document.getElementById('exModalHost');
  if (!host) { host = document.createElement('div'); host.id = 'exModalHost'; document.body.appendChild(host); }
  host.innerHTML = exModalHtml();
  const amtEl = document.getElementById('exMdAmt');
  if (amtEl) amtEl.focus();
}

function exModalHtml() {
  const s = _exModalState;
  const cats = (s.categories && s.categories.length) ? s.categories : EX_CATEGORIES;
  const fuelOn = EX_FUEL_CATEGORIES.includes(s.category);
  const fuelSourceOn = EX_FUEL_SOURCE_CATEGORIES.includes(s.category);
  const isTolls = s.category === 'tolls';
  const isReefer = s.category === 'reefer_fuel';
  const opts = cats.map(c => `<option value="${c}"${s.category === c ? ' selected' : ''}>${escapeHtml(CT_CATEGORY_LABELS[c] || c)}</option>`).join('');
  return `<div class="ex-modal-scrim" onclick="exCloseModal()"></div>
    <div class="ex-modal-box">
      <div class="ex-modal-head">${escapeHtml(exModalTitle(s.rt, s.rtId))}<button class="ex-modal-close" onclick="exCloseModal()">&times;</button></div>
      <div class="ex-modal-body">
        <div class="ex-modal-grid">
          <div class="ex-field"><label class="ex-flabel">Κατηγορία</label><select class="ex-ei" id="exMdCategory" onchange="exModalCategoryChange(this)">${opts}</select></div>
          <span id="exMdFuelSourceWrap">${fuelSourceOn ? exFuelSourceSelectHtml('exMdFuelSource', s.fuelSource) : ''}</span>
          <div class="ex-field"><label class="ex-flabel">Ημερομηνία</label><input class="ex-ei" type="date" id="exMdDate" value="${s.date || ''}"></div>
          <span id="exMdCountryWrap">${isTolls ? exCountryFieldHtml('exMdCountry', 170) : ''}</span>
          <div class="ex-field"><label class="ex-flabel">Ποσό €</label><input class="ex-ei" type="number" step="0.01" id="exMdAmt" placeholder="0,00" onkeydown="exModalKeydown(event)"></div>
          <div class="ex-field ex-modal-wide"><label class="ex-flabel">Παραστατικό / σημείωση</label><input class="ex-ei" type="text" id="exMdNote" placeholder="αρ. απόδειξης" onkeydown="exModalKeydown(event)"></div>
        </div>
        <span id="exMdReeferWrap">${isReefer ? exTrailerFieldHtml(s.rt, s, 'md') : ''}</span>
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
  const s = _exModalState; if (!s) return;
  s.category = el.value;
  s.trailerOverride = false; s.trailerId = null;
  delete _exCountryNs.exMdCountry;
  const g = document.getElementById('exMdFuelFields'); if (g) g.style.display = EX_FUEL_CATEGORIES.includes(el.value) ? 'grid' : 'none';
  const src = document.getElementById('exMdFuelSourceWrap');
  if (src) src.innerHTML = EX_FUEL_SOURCE_CATEGORIES.includes(el.value) ? exFuelSourceSelectHtml('exMdFuelSource', s.fuelSource) : '';
  const reefer = document.getElementById('exMdReeferWrap');
  if (reefer) reefer.innerHTML = el.value === 'reefer_fuel' ? exTrailerFieldHtml(s.rt, s, 'md') : '';
  const country = document.getElementById('exMdCountryWrap');
  if (country) country.innerHTML = el.value === 'tolls' ? exCountryFieldHtml('exMdCountry', 170) : '';
}
function exModalKeydown(ev) { if (ev.key === 'Enter') { ev.preventDefault(); exModalSubmit(); } }

async function exModalSubmit() {
  const s = _exModalState; if (!s) return;
  const g = id => document.getElementById(id);
  const body = exBuildLineBody(s.rtId, {
    category: g('exMdCategory').value, date: g('exMdDate').value, amount: g('exMdAmt').value, note: g('exMdNote').value,
    liters: g('exMdLiters') ? g('exMdLiters').value : '', km: g('exMdKm') ? g('exMdKm').value : '', station: g('exMdStation') ? g('exMdStation').value : '',
    fuelSource: g('exMdFuelSource') ? g('exMdFuelSource').value : '',
    trailerId: s.trailerId, trailerOverride: s.trailerOverride, rtHasTrailer: !!(s.rt && s.rt.trailer_id),
    tollCountry: (_exCountryNs.exMdCountry || {}).code
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
// δρομολόγιο», ίδια κατηγορία ΚΑΙ το ίδιο group scope με το ανοιχτό κελί.
function exOpenEntryModalFromRow() {
  const rtId = exOpenRtId();
  const rt = rtId == null ? null : exActiveRts().find(r => r.id === rtId);
  const group = _ex.open && EX_GROUPS.find(g => g.key === _ex.open.group);
  exOpenEntryModal({ rtId, rt, category: _ex.qe && _ex.qe.category, categories: group ? group.cats : null, onSaved: exAfterMutation });
}
