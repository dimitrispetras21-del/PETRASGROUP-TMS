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

function dlTypeLabel(t) { return DL_TYPE_LABELS[t] || t; }

// dl_v_balance.type is NULL for most rows (57/59) — unknown is said in words,
// never guessed as one of the two known values (DESIGN.md #3).
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

// _dl.view: which of the three v2 screens is on screen. _dl.selected: driver
// highlighted in the home list (right panel preview, no route change).
// _dl.driver/_dl.entries/_dl.rts/_dl.year: the open driver card (screen 2).
// _dl.editId: id of the entry row currently inline-edited on screen 2.
// _dl.bulk: state for screen 3, built fresh each time it opens.
const _dl = { view: 'home', balances: [], gap: 0, q: '', selected: null, selLoading: false, selErr: null,
  driver: null, entries: [], rts: [], year: String(new Date().getFullYear()), editId: null, bulk: null };

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
  .dl-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:9999px;border:1px solid var(--border);font-size:12px;color:var(--text-mid);cursor:pointer;background:none;font-family:inherit}
  .dl-chip.on{background:var(--surface-dark);color:var(--text-on-dark);border-color:var(--surface-dark)}
  .dl-strip{display:flex;align-items:center;gap:8px;padding:0 24px;height:36px;background:var(--surface-sunken);font-size:12px;color:var(--text-mid);border-bottom:1px solid var(--border)}
  .dl-strip b{color:var(--text)}
  .dl-search{height:34px;box-sizing:border-box;border:1px solid var(--border);border-radius:6px;padding:0 12px;font:inherit;font-size:12px;margin:12px 16px;width:calc(100% - 32px)}
  .dl-split{display:flex;align-items:stretch}
  .dl-list{width:460px;flex:none;border-right:1px solid var(--border);display:flex;flex-direction:column}
  .dl-list-rows{overflow-y:auto}
  .dl-right{flex:1;min-width:0;overflow-y:auto}
  .dl-lrow{display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;border-left:3px solid transparent;cursor:pointer}
  .dl-lrow:hover{background:var(--surface-sunken)}
  .dl-lrow.sel{border-left-color:var(--accent);background:var(--surface-sunken)}
  .dl-lrow.faded{opacity:.5}
  .dl-avatar{width:32px;height:32px;border-radius:9999px;background:var(--surface-sunken);color:var(--text-mid);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex:none}
  .dl-hero .dl-avatar,.dl-mini-hero .dl-avatar{background:var(--surface-dark);color:var(--text-on-dark)}
  .dl-hero{display:flex;align-items:center;gap:20px;padding:20px 24px;border-bottom:1px solid var(--border)}
  .dl-hero-main{display:flex;flex-direction:column;gap:2px}
  .dl-hero-bal{display:flex;flex-direction:column}
  .dl-hero-stat{display:flex;flex-direction:column;gap:2px;padding:0 16px;border-left:1px solid var(--border)}
  .dl-mini-hero{display:flex;align-items:center;gap:16px;padding:20px 24px}
  .dl-mini-boxes{display:flex;gap:24px;padding:0 24px 16px}
  .dl-mini-boxes .box{display:flex;flex-direction:column;gap:2px}
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
  .dl-foot{display:flex;align-items:center;height:44px;padding:0 24px;background:var(--surface-sunken);border-top:1px solid var(--border);font-size:12px;color:var(--text-mid);position:sticky;bottom:0}
  .dl-foot b{color:var(--text);font-size:13px;font-variant-numeric:tabular-nums}
  .dl-bulk-ctrl{display:flex;align-items:flex-end;gap:16px;padding:16px 24px;border-bottom:1px solid var(--border);flex-wrap:wrap}
  .dl-overlay{position:fixed;inset:0;background:var(--text-dim);opacity:.6;z-index:60;display:none} .dl-overlay.open{display:block}
  .dl-modal{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:420px;max-height:90vh;overflow:auto;background:var(--surface-card);border-radius:6px;padding:24px;z-index:61;display:none;box-shadow:0 8px 24px rgba(0,0,0,.18)} .dl-modal.open{display:block}
  .dl-f{display:flex;flex-direction:column;gap:6px;flex:1} .dl-f label{font-size:12px;color:var(--text-mid)} .dl-f input,.dl-f select{height:36px;border:1px solid var(--border);border-radius:6px;padding:0 12px;font:inherit;font-size:13px;box-sizing:border-box}
  .dl-fr{display:flex;gap:16px;margin-bottom:16px}
  .dl-seg{display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden} .dl-seg button{flex:1;height:36px;border:0;background:none;font:inherit;font-size:13px;color:var(--text-mid);cursor:pointer} .dl-seg button.on{background:var(--surface-dark);color:var(--text-on-dark);font-weight:500}
  .dl-err{color:var(--danger);font-size:12px;margin-top:8px}
  </style>`;
}

// ── κοινός renderer γραμμής κίνησης — mini (αρχική) και πλήρης (καρτέλα) ──
// opts.compact: home mini-table (6 στήλες, όχι ΥΠΟΛΟΙΠΟ, όχι κλικ/ακύρωση).
function dlEntryRowHtml(e, opts) {
  const compact = !!(opts && opts.compact);
  const wDate = compact ? 90 : 100, wMoney = compact ? 90 : 110, wTotal = compact ? 100 : 130;
  const isTrip = e.entry_type === 'trip';
  const dateTxt = dlDateRange(e.entry_date, e.date_end);
  const routeText = isTrip
    ? (e.route_text ? escapeHtml(e.route_text) : '—')
    : (e.entry_type === 'payment_bank' ? 'Κατάθεση τράπεζας' : e.entry_type === 'payment_cash' ? 'Πληρωμή μετρητά' : 'Προσαρμογή');
  // RT link: icon only, no visible code (v2 rule #2) — the code sits in title.
  const rtIcon = (isTrip && e.rt_id) ? `<span class="dl-rt" title="${escapeHtml(e.rt_code || '')}">↗</span>` : '';

  if (e.cancelled) {
    return `<div class="dl-row canc" title="${escapeHtml(e.deleted_reason || '')}">
      <div style="width:${wDate}px"><span style="font-size:12px">${dateTxt}</span></div>
      <div style="flex:1"><span class="m">${routeText}</span></div>
      <div style="width:${wMoney}px" class="r"><span class="n">—</span></div>
      <div style="width:${wMoney}px" class="r"><span class="n">—</span></div>
      <div style="width:${wMoney}px" class="r"><span class="n">—</span></div>
      ${compact ? '' : `<div style="width:120px" class="r"><span class="n">—</span></div>`}
      <div style="width:${wTotal}px" class="r"><span class="n">—</span></div>
      ${compact ? '' : '<div style="width:32px"></div>'}
    </div>`;
  }

  if (!compact && _dl.editId === e.id) {
    return `<div class="dl-row edit">
      <div style="width:100px"><span style="font-size:12px">${dateTxt}</span></div>
      <div style="flex:1"><span class="m">${routeText}</span></div>
      <div style="width:110px" class="r"><input class="dl-ei" type="number" step="0.01" id="dlEiValue" value="${e.trip_value ?? ''}" onkeydown="dlEiKeydown(event,${e.id})"></div>
      <div style="width:110px" class="r"><input class="dl-ei" type="number" step="0.01" id="dlEiAdvance" value="${e.advance ?? ''}" onkeydown="dlEiKeydown(event,${e.id})"></div>
      <div style="width:110px" class="r"><input class="dl-ei" type="number" step="0.01" id="dlEiExpenses" value="${e.expenses ?? ''}" onkeydown="dlEiKeydown(event,${e.id})"></div>
      <div style="width:120px" class="r"><span class="n dim">—</span></div>
      <div style="width:130px" class="r"><span class="n dim">—</span></div>
      <div style="width:32px"></div>
    </div>`;
  }

  const valueCell = isTrip
    ? (e.pending ? `<span class="n" style="color:var(--warn)">—</span>` : `<span class="n">${dlEur(e.trip_value)}</span>`)
    : `<span class="n dim">—</span>`;
  const advCell = isTrip ? `<span class="n${e.advance == null ? ' dim' : ''}">${dlEur(e.advance)}</span>` : `<span class="n">${dlEur(e.amount)}</span>`;
  const expCell = isTrip ? `<span class="n${e.expenses == null ? ' dim' : ''}">${dlEur(e.expenses)}</span>` : `<span class="n dim">—</span>`;
  const balCell = (isTrip && e.pending)
    ? `<span class="n" style="color:var(--warn)">—</span>`
    : `<span class="n ${Number(e.balance_delta) < 0 ? 'dl-owed' : 'dl-owe'}">${dlDelta(e)}</span>`;
  const totalCell = `<span class="n">${dlMoney(e.running_balance)}</span>`;
  const clickable = !compact && isTrip;
  const cancelBtn = compact ? '' : `<div style="width:32px" class="r"><button class="dl-x" title="Ακύρωση" onclick="event.stopPropagation();dlRowCancelClick(${e.id})">×</button></div>`;

  return `<div class="dl-row${e.needs_review ? ' review' : ''}${clickable ? ' click' : ''}${e.entry_type !== 'trip' ? ' pay' : ''}"${clickable ? ` onclick="dlEditRow(${e.id})"` : ''} title="${e.needs_review ? escapeHtml(e.review_note || '') : ''}">
    <div style="width:${wDate}px"><span style="font-size:12px">${dateTxt}</span></div>
    <div style="flex:1"><span class="m" style="font-weight:${isTrip ? 500 : 400}">${routeText}</span>${rtIcon}</div>
    <div style="width:${wMoney}px" class="r">${valueCell}</div>
    <div style="width:${wMoney}px" class="r">${advCell}</div>
    <div style="width:${wMoney}px" class="r">${expCell}</div>
    ${compact ? '' : `<div style="width:120px" class="r">${balCell}</div>`}
    <div style="width:${wTotal}px" class="r">${totalCell}</div>
    ${cancelBtn}
  </div>`;
}

// ═══════════════════ ΟΘΟΝΗ 1 — ΑΡΧΙΚΗ ═══════════════════

async function renderPayroll() {
  const c = document.getElementById('content');
  if (can('costs') === 'none') { c.innerHTML = showAccessDenied(); return; }
  c.style.padding = '0';
  _dl.view = 'home'; _dl.selected = null; _dl.entries = []; _dl.q = '';
  c.innerHTML = dlStyles() + '<div class="dl-page"><div style="padding:32px;color:var(--text-mid)">Φόρτωση καρτελών…</div></div>';
  try {
    await dlReloadBalances();
  } catch (e) {
    c.innerHTML = dlStyles() + '<div class="dl-page">' + showError('Οι καρτέλες οδηγών δεν φορτώθηκαν: ' + e.message) + '</div>';
    return;
  }
  const first = dlHomeGroups().withEntries[0];
  if (first) await dlSelectDriver(first.driver_id); else dlRenderHome();
}

// Balances list is stale the moment any ledger write lands: shared by every
// write path so none of them can drift back to an old copy.
async function dlReloadBalances() {
  const r = await ctFetch('/costs/ledger');
  _dl.balances = r.records || []; _dl.gap = r.gap || 0;
}

function dlHomeGroups() {
  const q = _dl.q.trim().toLowerCase();
  const act = _dl.balances.filter(b => b.active !== false); // NULL active reads as active (I3)
  const filtered = q ? act.filter(b => String(b.full_name).toLowerCase().includes(q)) : act;
  return {
    withEntries: filtered.filter(b => b.has_entries).sort((a, b) => Number(b.balance) - Number(a.balance)),
    rest: filtered.filter(b => !b.has_entries).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), 'el'))
  };
}

// Re-render on each keystroke rebuilds the input, which resets the caret to
// the end unless the position is restored explicitly.
function dlSearchInput(el) {
  const pos = el.selectionStart;
  _dl.q = el.value;
  dlRenderHome();
  const s = document.querySelector('.dl-search');
  if (s) { s.focus(); s.setSelectionRange(pos, pos); }
}

// Clicking a driver in the home list fills the right panel without a route
// change (spec Οθόνη 1): fetch happens here, dlRenderHome draws both states.
async function dlSelectDriver(driverId) {
  _dl.selected = driverId;
  _dl.selLoading = true; _dl.selErr = null;
  dlRenderHome();
  try {
    const r = await ctFetch('/costs/ledger/' + driverId + '?year=' + new Date().getFullYear());
    _dl.entries = r.records || []; _dl.rts = r.rts || [];
  } catch (e) {
    _dl.selErr = e.message; _dl.entries = [];
  }
  _dl.selLoading = false;
  dlRenderHome();
}

function dlRenderHome() {
  const c = document.getElementById('content');
  const act = _dl.balances.filter(b => b.active !== false);
  const total = act.reduce((a, b) => a + Number(b.balance || 0), 0);
  const trips = act.reduce((a, b) => a + Number(b.trips_ytd || 0), 0);
  const pending = act.reduce((a, b) => a + Number(b.pending_count || 0), 0);
  const month = new Date().toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
  const groups = dlHomeGroups();
  const row = (b, faded) => `<div class="dl-lrow${_dl.selected === b.driver_id ? ' sel' : ''}${faded ? ' faded' : ''}" onclick="dlSelectDriver(${b.driver_id})">
      <div class="dl-avatar">${escapeHtml(dlInitials(b.full_name))}</div>
      <span class="m" style="flex:1">${escapeHtml(b.full_name)}</span>
      ${faded ? '' : `<span class="n${Number(b.balance) < 0 ? ' dl-neg' : ''}">${dlBal(b)}</span>`}
    </div>`;
  const listHtml = (groups.withEntries.length || groups.rest.length)
    ? groups.withEntries.map(b => row(b, false)).join('') + groups.rest.map(b => row(b, true)).join('')
    : showEmpty({ title: 'Κανένας οδηγός', description: 'Άλλαξε αναζήτηση.' });
  c.innerHTML = dlStyles() + `<div class="dl-page">
    <div class="dl-head"><span class="dl-title">Μισθοδοσία Οδηγών</span><span class="dl-sp"></span>
      <button class="dl-btn" onclick="renderPayrollBulk()">Μαζική πληρωμή</button>
      <button class="dl-btn pri" onclick="dlHomeNewTrip()">Δρομολόγιο</button></div>
    <div class="dl-strip"><span><b>${dlEur(total)}</b> οφειλή σήμερα</span><span>·</span>
      <span><b>${trips}</b> δρομολόγια φέτος</span><span>·</span>
      <span><b>${pending}</b> χωρίς αξία</span>
      <span class="dl-sp"></span><span>${escapeHtml(month)}</span></div>
    <div class="dl-split">
      <div class="dl-list">
        <input class="dl-search" placeholder="Αναζήτηση…" value="${escapeHtml(_dl.q)}" oninput="dlSearchInput(this)">
        <div class="dl-list-rows">${listHtml}</div>
      </div>
      <div class="dl-right">${dlHomeRightHtml()}</div>
    </div>
  </div>`;
}

function dlHomeRightHtml() {
  if (!_dl.selected) return showEmpty({ title: 'Επίλεξε οδηγό', description: 'Κλικ σε έναν οδηγό από τη λίστα.' });
  if (_dl.selLoading) return `<div style="padding:32px;color:var(--text-mid)">Φόρτωση…</div>`;
  if (_dl.selErr) return showError('Η καρτέλα δεν φορτώθηκε: ' + _dl.selErr);
  const b = _dl.balances.find(x => x.driver_id === _dl.selected) || { driver_id: _dl.selected, full_name: '#' + _dl.selected, balance: null, type: null, trips_ytd: 0, last_entry_date: null };
  const live = _dl.entries.filter(e => !e.cancelled);
  const trips = live.filter(e => e.entry_type === 'trip');
  const value = trips.reduce((a, e) => a + Number(e.trip_value || 0), 0);
  const cash = live.filter(e => e.entry_type === 'payment_cash').reduce((a, e) => a + Number(e.amount), 0);
  const bank = live.filter(e => e.entry_type === 'payment_bank').reduce((a, e) => a + Number(e.amount), 0);
  const last = b.last_entry_date ? dlDateRange(b.last_entry_date, null) : '—';
  const rows = _dl.entries.slice(0, 7).map(e => dlEntryRowHtml(e, { compact: true })).join('');
  return `
    <div class="dl-mini-hero">
      <div class="dl-avatar" style="width:56px;height:56px;font-size:18px">${escapeHtml(dlInitials(b.full_name))}</div>
      <div style="flex:1"><span class="dl-title" style="font-size:18px">${escapeHtml(b.full_name)}</span><br>
        <span class="s">${dlTypeWord(b.type)} · ${b.trips_ytd || 0} δρομολόγια φέτος</span></div>
      <span class="v big${Number(b.balance) < 0 ? ' dl-neg' : ''}">${dlBal(b)}</span>
    </div>
    <div class="dl-mini-boxes">
      <div class="box"><div class="k">Αξία έτους</div><div class="v">${dlEur(value)}</div></div>
      <div class="box"><div class="k">Πληρωμές έτους</div><div class="v">${dlEur(cash + bank)}</div></div>
      <div class="box"><div class="k">Τελευταίο</div><div class="v" style="font-size:13px">${last}</div></div>
    </div>
    <div class="dl-th"><div style="width:90px">Ημ/νία</div><div style="flex:1">Δρομολόγιο</div><div style="width:90px" class="r">Αξία</div><div style="width:90px" class="r">Έλαβε</div><div style="width:90px" class="r">Έξοδα</div><div style="width:100px" class="r">Σύνολο</div></div>
    <div>${rows || showEmpty({ title: 'Καμία κίνηση ακόμη', description: '' })}</div>
    <div style="padding:16px 24px"><a class="link" href="#" onclick="renderPayrollDriver(${b.driver_id});return false">Άνοιγμα καρτέλας →</a></div>`;
}

async function dlHomeNewTrip() {
  if (!_dl.selected) return;
  await renderPayrollDriver(_dl.selected);
  dlFocusQuickEntry();
}

function dlFocusQuickEntry() {
  const el = document.getElementById('dlQeRoute');
  if (el) el.focus();
}

// ═══════════════════ ΟΘΟΝΗ 2 — ΚΑΡΤΕΛΑ ΟΔΗΓΟΥ ═══════════════════

async function renderPayrollDriver(driverId) {
  const c = document.getElementById('content');
  _dl.view = 'driver'; _dl.driver = driverId; _dl.editId = null;
  _dl.year = String(new Date().getFullYear());
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

async function dlReloadEntries() {
  const r = await ctFetch('/costs/ledger/' + _dl.driver + (_dl.year === 'all' ? '' : '?year=' + _dl.year));
  _dl.entries = r.records || []; _dl.rts = r.rts || [];
}

async function dlSetYear(y) {
  _dl.year = y; _dl.editId = null;
  try { await dlReloadEntries(); dlRenderDriverCard(); }
  catch (e) {
    document.getElementById('content').innerHTML = dlStyles() + '<div class="dl-page">' + showError('Η καρτέλα δεν φορτώθηκε: ' + e.message) + '</div>';
  }
}

function dlRenderDriverCard() {
  const c = document.getElementById('content');
  const b = _dl.balances.find(x => x.driver_id === _dl.driver) || { driver_id: _dl.driver, full_name: '#' + _dl.driver, balance: 0, type: null };
  const live = _dl.entries.filter(e => !e.cancelled);
  const trips = live.filter(e => e.entry_type === 'trip');
  const value = trips.reduce((a, e) => a + Number(e.trip_value || 0), 0);
  const allPending = trips.length > 0 && trips.every(t => t.pending);
  const cash = live.filter(e => e.entry_type === 'payment_cash').reduce((a, e) => a + Number(e.amount), 0);
  const bank = live.filter(e => e.entry_type === 'payment_bank').reduce((a, e) => a + Number(e.amount), 0);
  // API returns newest-first: the oldest entry (first movement) is the last item.
  const firstEntry = _dl.entries.length ? _dl.entries[_dl.entries.length - 1].entry_date : null;
  const y0 = new Date().getFullYear();
  const years = [String(y0), String(y0 - 1), String(y0 - 2), 'all'];
  const yr = y => `<button class="dl-chip${_dl.year === y ? ' on' : ''}" onclick="dlSetYear('${y}')">${y === 'all' ? 'Όλα' : y}</button>`;
  const rows = [dlQuickEntryRowHtml()].concat(
    _dl.entries.length ? _dl.entries.map(e => dlEntryRowHtml(e, {})) : [showEmpty({ title: 'Καμία κίνηση ακόμη', description: 'Η καρτέλα ξεκινά με το πρώτο δρομολόγιο ή την εισαγωγή του Excel.' })]
  ).join('');
  c.innerHTML = dlStyles() + `<div class="dl-page">
    <div class="dl-head"><a class="link" href="#" onclick="renderPayroll();return false">← Μισθοδοσία</a><span class="dl-sp"></span>
      ${years.map(yr).join('')}</div>
    <div class="dl-hero">
      <div class="dl-avatar" style="width:56px;height:56px;font-size:18px">${escapeHtml(dlInitials(b.full_name))}</div>
      <div class="dl-hero-main"><span class="dl-title">${escapeHtml(b.full_name)}</span>
        <span class="s">${dlTypeWord(b.type)}${firstEntry ? ' · από ' + dlDateRange(firstEntry, null) : ''}</span></div>
      <div class="dl-hero-bal"><span class="v big${Number(b.balance) < 0 ? ' dl-neg' : ''}">${dlBal(b)}</span></div>
      <div class="dl-hero-stat"><div class="k">Δρομολόγια ${_dl.year === 'all' ? '' : _dl.year}</div><div class="v">${trips.length}</div></div>
      <div class="dl-hero-stat"><div class="k">Αξία ${_dl.year === 'all' ? '' : _dl.year}</div><div class="v">${allPending ? '—' : dlEur(value)}</div></div>
      <div class="dl-hero-stat"><div class="k">Πληρωμές ${_dl.year === 'all' ? '' : _dl.year}</div><div class="v">${dlEur(cash + bank)}</div></div>
      <span class="dl-sp"></span>
      <button class="dl-btn" onclick="dlOpenPayment(${_dl.driver})">Πληρωμή</button>
      <button class="dl-btn pri" onclick="dlFocusQuickEntry()">Δρομολόγιο</button>
    </div>
    <div class="dl-th"><div style="width:100px">Ημ/νία</div><div style="flex:1">Διαδρομή</div><div style="width:110px" class="r">Αξία</div><div style="width:110px" class="r">Έλαβε</div><div style="width:110px" class="r">Έξοδα</div><div style="width:120px" class="r">Υπόλοιπο</div><div style="width:130px" class="r">Σύνολο</div><div style="width:32px"></div></div>
    <div>${rows}</div>
    <div class="dl-overlay" id="dlOverlay" onclick="dlClosePayment()"></div><div class="dl-modal" id="dlModal"></div>
  </div>`;
}

// ── γραμμή γρήγορης καταχώρισης — μόνο δρομολόγιο, χωρίς σύνδεση RT (η
// σύνδεση μένει αυτόματη από το import, βλ. v2 rule #2) ──
function dlQuickEntryRowHtml() {
  return `<div class="dl-row qe">
    <div style="width:100px"><span class="s">σήμερα</span></div>
    <div style="flex:1"><input class="dl-ei" id="dlQeRoute" placeholder="Διαδρομή…" onkeydown="dlQeKeydown(event)"></div>
    <div style="width:110px" class="r"><input class="dl-ei" type="number" step="0.01" id="dlQeValue" placeholder="Αξία" onkeydown="dlQeKeydown(event)"></div>
    <div style="width:110px" class="r"><input class="dl-ei" type="number" step="0.01" id="dlQeAdvance" placeholder="Έλαβε" onkeydown="dlQeKeydown(event)"></div>
    <div style="width:110px" class="r"><input class="dl-ei" type="number" step="0.01" id="dlQeExpenses" placeholder="Έξοδα" onkeydown="dlQeKeydown(event)"></div>
    <div style="width:120px" class="r"><span class="n dim">—</span></div>
    <div style="width:130px" class="r"><span class="n dim">—</span></div>
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
  const body = { driver_id: _dl.driver, entry_type: 'trip', entry_date: new Date().toISOString().slice(0, 10), route, trip_value: n('dlQeValue'), advance: n('dlQeAdvance'), expenses: n('dlQeExpenses') };
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

// The movement is never deleted — cancellation with a reason is the only undo,
// and stays visible (struck through) on the card.
async function dlRowCancelClick(id) {
  const reason = window.prompt('Αιτιολογία ακύρωσης (υποχρεωτική):');
  if (!reason) return;
  try {
    await ctFetch('/costs/ledger/' + id, { method: 'PATCH', body: { cancel: true, reason } });
    await dlReloadBalances();
    await dlReloadEntries();
    dlRenderDriverCard();
  } catch (err) { alert('Δεν ακυρώθηκε: ' + err.message); }
}

// ── μικρό modal πληρωμής (screen 2) ──
function dlOpenPayment(driverId) {
  const m = document.getElementById('dlModal'); document.getElementById('dlOverlay').classList.add('open'); m.classList.add('open');
  const today = new Date().toISOString().slice(0, 10);
  m.dataset.method = 'payment_bank';
  m.innerHTML = `<div style="display:flex;align-items:center;margin-bottom:16px"><span class="dl-title" style="font-size:18px">Πληρωμή</span><span class="dl-sp"></span><button class="dl-btn" style="border:0" onclick="dlClosePayment()">✕</button></div>
    <div class="dl-fr"><div class="dl-f"><label>Ημερομηνία</label><input type="date" id="dlPayDate" value="${today}"></div></div>
    <div class="dl-f" style="margin-bottom:6px"><label>Τρόπος</label></div>
    <div class="dl-seg" id="dlPaySeg" style="margin-bottom:16px">
      <button class="on" onclick="dlPayMethod('payment_bank')">Τράπεζα</button>
      <button onclick="dlPayMethod('payment_cash')">Μετρητά</button>
    </div>
    <div class="dl-fr"><div class="dl-f"><label>Ποσό (€)</label><input type="number" step="0.01" id="dlPayAmount"></div></div>
    <div style="display:flex;gap:12px;align-items:center"><span class="dl-sp"></span><button class="dl-btn" style="border:0;color:var(--accent)" onclick="dlClosePayment()">Άκυρο</button><button class="dl-btn pri" onclick="dlSavePayment(${driverId})">Καταχώριση</button></div>
    <div class="dl-err" id="dlErr"></div>`;
}

function dlPayMethod(m) {
  document.getElementById('dlModal').dataset.method = m;
  document.querySelectorAll('#dlPaySeg button').forEach(btn => btn.classList.toggle('on', (m === 'payment_bank' && btn.textContent === 'Τράπεζα') || (m === 'payment_cash' && btn.textContent === 'Μετρητά')));
}

function dlClosePayment() {
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
    dlClosePayment();
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
    } catch (e) { _dl.bulk.prevMonth[d.driver_id] = { payment_bank: null, payment_cash: null }; }
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
    <div style="width:130px" class="r"><span class="n dim">${_dl.bulk.prevLoaded ? (pmVal != null ? dlEur(pmVal) : '—') : '…'}</span></div>
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
  module.exports = { dlEur, dlBalanceWord, dlDelta, dlTypeLabel, dlDateRange, dlMoney };
}
