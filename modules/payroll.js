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

const _dl = { balances: [], gap: 0, filter: 'all', q: '', driver: null, entries: [], rts: [], year: String(new Date().getFullYear()) };

// Six sizes, six spacings, tokens only (DESIGN.md Β/Γ/Δ). Row 40px, ≥ 20 rows at 1080p.
function dlStyles() {
  return `<style>
  .dl-page{font-family:'DM Sans',sans-serif;font-size:14px;color:var(--text);background:var(--surface-card);min-height:100%}
  .dl-head{display:flex;align-items:center;gap:8px;padding:0 24px;height:58px}
  .dl-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700}
  .dl-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:9999px;border:1px solid var(--border);font-size:12px;color:var(--text-mid);cursor:pointer;background:none;font-family:inherit}
  .dl-chip.on{background:var(--surface-dark);color:var(--text-on-dark);border-color:var(--surface-dark)}
  .dl-chip b{color:var(--danger)} .dl-chip.on b{color:var(--text-on-dark)}
  .dl-sp{flex:1}
  .dl-search{height:34px;width:160px;border:1px solid var(--border);border-radius:6px;padding:0 12px;font:inherit;font-size:12px}
  .dl-btn{height:34px;padding:0 16px;border-radius:6px;border:1px solid var(--border);background:var(--surface-card);font:inherit;font-size:13px;font-weight:500;cursor:pointer;color:var(--text)}
  .dl-btn.pri{background:var(--accent);border-color:var(--accent);color:var(--text-on-dark)} .dl-btn.pri:hover{background:var(--accent-hover)}
  .dl-metrics{display:flex;align-items:center;gap:24px;padding:0 24px;height:36px;background:var(--surface-sunken);font-size:12px;color:var(--text-mid)}
  .dl-metrics b{color:var(--text)} .dl-metrics .warn{color:var(--warn);font-weight:700}
  .dl-th{display:flex;height:34px;background:var(--surface-sunken);border-bottom:1px solid var(--border)}
  .dl-th>div,.dl-row>div{padding:0 16px;display:flex;flex-direction:column;justify-content:center;gap:1px;flex:none}
  .dl-th>div{font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--text-mid);text-transform:uppercase}
  .dl-row{display:flex;height:40px;border-bottom:1px solid var(--border);cursor:pointer}
  .dl-row:hover{background:var(--surface-sunken)}
  .dl-row.pay{background:var(--surface-sunken)}
  .dl-row.canc .m,.dl-row.canc .n{text-decoration:line-through;color:var(--text-dim)}
  .dl-row.review{box-shadow:inset 3px 0 var(--warn)}
  .m{font-size:13px;font-weight:700} .s{font-size:11px;color:var(--text-dim)} .n{font-size:13px;font-variant-numeric:tabular-nums;text-align:right}
  .r{align-items:flex-end} .dim{color:var(--text-dim)} .link{color:var(--accent);font-size:12px;text-decoration:none}
  .dl-owe{color:var(--ok)} .dl-owed{color:var(--warn)} .dl-zero{color:var(--text-mid)}
  .dl-pill{display:inline-block;padding:3px 8px;border-radius:9999px;font-size:11px;border:1px solid var(--border);color:var(--text-mid)}
  .dl-foot{display:flex;align-items:center;height:44px;padding:0 24px;background:var(--surface-sunken);border-top:1px solid var(--border);font-size:12px;color:var(--text-mid);position:sticky;bottom:0}
  .dl-foot b{color:var(--text);font-size:13px;font-variant-numeric:tabular-nums}
  .dl-band{display:flex;align-items:center;gap:32px;padding:0 24px;height:56px;background:var(--surface-sunken)}
  .dl-band .k{font-size:11px;font-weight:500;color:var(--text-dim)} .dl-band .v{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums} .dl-band .big{font-size:18px}
  .dl-overlay{position:fixed;inset:0;background:var(--text-dim);opacity:.6;z-index:60;display:none} .dl-overlay.open{display:block}
  .dl-modal{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:640px;max-height:90vh;overflow:auto;background:var(--surface-card);border-radius:6px;padding:24px;z-index:61;display:none;box-shadow:0 8px 24px rgba(0,0,0,.18)} .dl-modal.open{display:block}
  .dl-f{display:flex;flex-direction:column;gap:6px;flex:1} .dl-f label{font-size:12px;color:var(--text-mid)} .dl-f input,.dl-f select{height:36px;border:1px solid var(--border);border-radius:6px;padding:0 12px;font:inherit;font-size:13px} .dl-f .h{font-size:11px;color:var(--text-dim)}
  .dl-fr{display:flex;gap:16px;margin-bottom:16px}
  .dl-seg{display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:16px} .dl-seg button{flex:1;height:36px;border:0;background:none;font:inherit;font-size:13px;color:var(--text-mid);cursor:pointer} .dl-seg button.on{background:var(--surface-dark);color:var(--text-on-dark);font-weight:500}
  .dl-calc{display:flex;gap:24px;align-items:center;padding:10px 16px;background:var(--surface-sunken);border-radius:6px;margin-bottom:16px;font-size:13px}
  .dl-calc .k{font-size:11px;color:var(--text-dim)} .dl-calc b{font-variant-numeric:tabular-nums}
  .dl-err{color:var(--danger);font-size:12px;margin-top:8px}
  </style>`;
}

async function renderPayroll() {
  const c = document.getElementById('content');
  if (can('costs') === 'none') { c.innerHTML = showAccessDenied(); return; }
  c.style.padding = '0';
  _dl.driver = null;
  c.innerHTML = dlStyles() + '<div class="dl-page"><div style="padding:32px;color:var(--text-mid)">Φόρτωση καρτελών…</div></div>';
  try {
    const r = await ctFetch('/costs/ledger');
    _dl.balances = r.records || []; _dl.gap = r.gap || 0;
  } catch (e) {
    c.innerHTML = dlStyles() + '<div class="dl-page">' + showError('Οι καρτέλες οδηγών δεν φορτώθηκαν: ' + e.message) + '</div>';
    return;
  }
  dlRenderList();
}

function dlVisible() {
  const q = _dl.q.trim().toLowerCase();
  return _dl.balances.filter(b => {
    if (_dl.filter === 'all' && !b.active) return false;
    if (_dl.filter === 'balance' && !(Number(b.balance) !== 0)) return false;
    if (_dl.filter === 'pending' && !(b.pending_count > 0)) return false;
    if (_dl.filter === 'stale' && !(b.days_since_last_entry > 30 && b.active)) return false;
    if (_dl.filter === 'inactive' && b.active) return false;
    return !q || String(b.full_name).toLowerCase().includes(q);
  });
}

function dlRenderList() {
  const c = document.getElementById('content');
  const act = _dl.balances.filter(b => b.active);
  const owe = act.filter(b => Number(b.balance) > 0), owed = act.filter(b => Number(b.balance) < 0);
  const total = act.reduce((a, b) => a + Number(b.balance || 0), 0);
  const pending = act.reduce((a, b) => a + Number(b.pending_count || 0), 0);
  const stale = act.filter(b => b.days_since_last_entry > 30).length;
  const rows = dlVisible();
  const chip = (id, label, n) => `<button class="dl-chip${_dl.filter === id ? ' on' : ''}" onclick="_dl.filter='${id}';dlRenderList()">${label}${n != null ? ' <b>' + n + '</b>' : ''}</button>`;
  const body = rows.length ? rows.map(b => {
    const w = dlBalanceWord(b.balance);
    const last = b.last_trip_date ? `${dlDateRange(b.last_trip_date, b.last_trip_end)} ${escapeHtml(b.last_trip_route || '')}` : '—';
    const sub = b.last_trip_rt_code ? `<span class="link">${escapeHtml(b.last_trip_rt_code)}</span>` : (b.last_trip_date ? 'χωρίς σύνδεση RT' : 'καμία καταχώρηση');
    const staleTxt = b.days_since_last_entry > 30 ? `<span style="color:var(--warn)">χωρίς κίνηση ${b.days_since_last_entry} ημέρες</span>` : (b.last_payment_date ? `τελευταία πληρωμή ${dlDateRange(b.last_payment_date, null)} ${b.last_payment_type === 'payment_bank' ? 'τράπεζα' : 'μετρητά'}` : '');
    return `<div class="dl-row${b.review_count ? ' review' : ''}" onclick="renderPayrollDriver(${b.driver_id})">
      <div style="width:560px"><span class="m">${escapeHtml(b.full_name)}</span><span class="s">${b.type === 'External' ? 'Εξωτερικός' : 'Εσωτερικός'}${staleTxt ? ' · ' + staleTxt : ''}</span></div>
      <div style="width:384px"><span style="font-size:12px">${last}</span><span class="s">${sub}</span></div>
      <div style="width:120px" class="r"><span class="n">${b.has_entries ? b.trips_ytd : '—'}</span></div>
      <div style="width:200px" class="r"><span class="n ${w.cls}" style="font-weight:700">${b.has_entries ? dlEur(b.balance) : '—'} <span style="font-weight:400;color:var(--text-dim);font-size:12px">${b.has_entries ? w.text : 'χωρίς καρτέλα'}</span></span></div>
      <div style="width:120px"><span class="link">καρτέλα →</span></div></div>`;
  }).join('') : showEmpty({ title: 'Καμία καρτέλα σε αυτό το φίλτρο', description: 'Άλλαξε φίλτρο ή καταχώρησε την πρώτη κίνηση.' });
  c.innerHTML = dlStyles() + `<div class="dl-page">
    <div class="dl-head"><span class="dl-title">Μισθοδοσία Οδηγών</span><span style="width:8px"></span>
      ${chip('all', 'Όλοι', act.length)}${chip('balance', 'Με υπόλοιπο', owe.length + owed.length)}${chip('pending', 'Εκκρεμείς αξίες', pending)}${chip('stale', 'Χωρίς κίνηση 30+ ημ.', stale)}${chip('inactive', 'Ανενεργοί')}
      <span class="dl-sp"></span>
      <input class="dl-search" placeholder="Αναζήτηση…" value="${escapeHtml(_dl.q)}" oninput="_dl.q=this.value;dlRenderList();document.querySelector('.dl-search').focus()">
      <button class="dl-btn pri" onclick="dlOpenForm(null,'trip')">Νέα κίνηση</button></div>
    <div class="dl-metrics"><span><b>Χρωστάμε ${dlEur(total)}</b> σε ${owe.length} οδηγούς</span><span>·</span>
      ${pending ? `<span class="warn">${pending} δρομολόγι${pending === 1 ? 'ο' : 'α'} χωρίς αξία</span>` : ''}
      ${stale ? `<span class="warn">${stale} οδηγοί χωρίς καταχώρηση πάνω από 30 ημέρες</span>` : ''}
      <span class="dl-sp"></span>
      <span style="font-size:11px">${_dl.gap ? `<span class="warn">RT χωρίς γραμμή καρτέλας: ${_dl.gap}</span>` : 'RT χωρίς γραμμή καρτέλας: 0'} · πηγή: dl_v_balance</span></div>
    <div class="dl-th"><div style="width:560px">Οδηγός</div><div style="width:384px">Τελευταίο δρομολόγιο</div><div style="width:120px" class="r">Δρομολόγια ${_dl.year}</div><div style="width:200px" class="r">Υπόλοιπο</div><div style="width:120px"></div></div>
    <div>${body}</div>
    <div class="dl-foot"><span>${act.length} οδηγοί · ${owe.length} με υπόλοιπο · ${owed.length} μας χρωστούν</span><span class="dl-sp"></span><span>Σύνολο οφειλής προς οδηγούς &nbsp;<b>${dlEur(total)}</b></span></div>
    <div class="dl-overlay" id="dlOverlay" onclick="dlCloseForm()"></div><div class="dl-modal" id="dlModal"></div>
  </div>`;
}

async function renderPayrollDriver(driverId) {
  const c = document.getElementById('content');
  const b = _dl.balances.find(x => x.driver_id === driverId);
  _dl.driver = driverId;
  c.innerHTML = dlStyles() + '<div class="dl-page"><div style="padding:32px;color:var(--text-mid)">Φόρτωση καρτέλας…</div></div>';
  try {
    const r = await ctFetch('/costs/ledger/' + driverId + (_dl.year === 'all' ? '' : '?year=' + _dl.year));
    _dl.entries = r.records || []; _dl.rts = r.rts || [];
  } catch (e) {
    c.innerHTML = dlStyles() + '<div class="dl-page">' + showError('Η καρτέλα δεν φορτώθηκε: ' + e.message) + '</div>';
    return;
  }
  dlRenderDriver(b || { driver_id: driverId, full_name: '#' + driverId, balance: 0, active: true });
}

function dlRenderDriver(b) {
  const c = document.getElementById('content');
  const live = _dl.entries.filter(e => !e.cancelled);
  const trips = live.filter(e => e.entry_type === 'trip');
  const value = trips.reduce((a, e) => a + Number(e.trip_value || 0), 0);
  const cash = live.filter(e => e.entry_type === 'payment_cash').reduce((a, e) => a + Number(e.amount), 0);
  const bank = live.filter(e => e.entry_type === 'payment_bank').reduce((a, e) => a + Number(e.amount), 0);
  const w = dlBalanceWord(b.balance);
  const yr = y => `<button class="dl-chip${_dl.year === y ? ' on' : ''}" onclick="_dl.year='${y}';renderPayrollDriver(${b.driver_id})">${y === 'all' ? 'Όλα' : y}</button>`;
  const y0 = new Date().getFullYear();
  const years = [String(y0), String(y0 - 1), String(y0 - 2), 'all'];
  const money = v => v == null ? '—' : dlEur(v).replace(' €', '');
  const num = (v, dim) => `<span class="n${dim ? ' dim' : ''}">${v}</span>`;
  const rows = _dl.entries.length ? _dl.entries.map(e => {
    const isTrip = e.entry_type === 'trip';
    let sub;
    if (e.cancelled) sub = `<span style="color:var(--warn)">ακυρώθηκε ${e.deleted_at.slice(8, 10)}/${e.deleted_at.slice(5, 7)} · ${escapeHtml(e.deleted_reason || '')}</span>`;
    else if (isTrip && e.pending) sub = `<span style="color:var(--warn)">${e.source === 'auto' ? 'auto από ' + escapeHtml(e.rt_code || '') + ' · ' : ''}εκκρεμεί αξία</span>`;
    else if (isTrip && e.rt_code) sub = `<span class="link">${escapeHtml(e.rt_code)}</span> · τρέφει το TRIP PnL`;
    else if (isTrip) sub = 'χωρίς σύνδεση RT';
    else sub = e.note ? escapeHtml(e.note) : '';
    if (e.needs_review) sub += ` <span style="color:var(--warn)">· ${escapeHtml(e.review_note || 'θέλει έλεγχο')}</span>`;
    const kept = isTrip && (e.advance != null || e.expenses != null) ? money(Number(e.advance || 0) - Number(e.expenses || 0)) : '—';
    return `<div class="dl-row${isTrip ? '' : ' pay'}${e.cancelled ? ' canc' : ''}${e.needs_review ? ' review' : ''}" onclick="dlOpenEdit(${e.id})">
      <div style="width:56px"><span class="s">${e.source === 'excel_import' ? 'xls' : (e.source === 'auto' ? 'auto' : '—')}</span></div>
      <div style="width:120px"><span style="font-size:12px">${dlDateRange(e.entry_date, e.date_end)}</span></div>
      <div style="width:120px"><span class="dl-pill">${dlTypeLabel(e.entry_type)}</span></div>
      <div style="width:448px"><span class="m" style="font-weight:${isTrip ? 500 : 400}">${escapeHtml(e.route_text || (e.entry_type === 'payment_bank' ? 'Κατάθεση τράπεζα' : e.entry_type === 'payment_cash' ? 'Πληρωμή μετρητά' : 'Προσαρμογή'))}</span><span class="s">${sub}</span></div>
      <div style="width:100px" class="r">${num(isTrip ? money(e.advance) : money(e.amount), isTrip && e.advance == null)}</div>
      <div style="width:100px" class="r">${num(isTrip ? money(e.expenses) : '—', !isTrip || e.expenses == null)}</div>
      <div style="width:100px" class="r">${num(kept, kept === '—')}</div>
      <div style="width:100px" class="r">${isTrip && e.pending ? '<span class="n" style="color:var(--warn)">εκκρεμεί</span>' : num(isTrip ? money(e.trip_value) : '—', !isTrip)}</div>
      <div style="width:120px" class="r"><span class="n ${e.cancelled ? 'dim' : (Number(e.balance_delta) < 0 ? 'dl-owed' : 'dl-owe')}" style="font-weight:500">${e.cancelled ? '—' : dlDelta(e)}</span></div>
      <div style="width:120px" class="r"><span class="n" style="font-weight:700">${e.cancelled ? '—' : money(e.running_balance)}</span></div></div>`;
  }).join('') : showEmpty({ title: 'Καμία κίνηση ακόμη', description: 'Η καρτέλα ξεκινά με το πρώτο δρομολόγιο ή την εισαγωγή του Excel.' });
  c.innerHTML = dlStyles() + `<div class="dl-page">
    <div class="dl-head"><a class="link" href="#" onclick="renderPayroll();return false">← Μισθοδοσία</a><span class="dl-title">${escapeHtml(b.full_name)}</span>
      <span class="dl-pill" style="background:var(--ok);color:var(--text-on-dark);border-color:var(--ok);font-size:10px;font-weight:600">${b.active ? 'ΕΝΕΡΓΟΣ' : 'ΑΝΕΝΕΡΓΟΣ'}</span>
      <span class="s" style="font-size:12px">${b.type === 'External' ? 'Εξωτερικός' : 'Εσωτερικός'}</span><span class="dl-sp"></span>
      ${years.map(yr).join('')}
      <button class="dl-btn" onclick="dlOpenForm(${b.driver_id},'payment_cash')">Πληρωμή</button>
      <button class="dl-btn pri" onclick="dlOpenForm(${b.driver_id},'trip')">Νέο δρομολόγιο</button></div>
    <div class="dl-band">
      <div><div class="k">ΥΠΟΛΟΙΠΟ ΣΗΜΕΡΑ</div><div><span class="v big ${w.cls}">${dlEur(b.balance)}</span> <span class="s" style="font-size:12px">${w.text}</span></div></div>
      <div><div class="k">ΔΡΟΜΟΛΟΓΙΑ ${_dl.year === 'all' ? '' : _dl.year}</div><div class="v">${trips.length}</div></div>
      <div><div class="k">ΑΞΙΑ ΔΡΟΜΟΛΟΓΙΩΝ</div><div class="v">${dlEur(value)}</div></div>
      <div><div class="k">ΠΛΗΡΩΜΕΣ</div><div><span class="v">${dlEur(cash + bank)}</span> <span class="s" style="font-size:12px">μετρητά ${dlEur(cash)} · τράπεζα ${dlEur(bank)}</span></div></div>
      <span class="dl-sp"></span><span class="s">πηγή: dl_v_entries · το υπόλοιπο υπολογίζεται, δεν γράφεται</span></div>
    <div class="dl-th"><div style="width:56px">#</div><div style="width:120px">Ημ/νία</div><div style="width:120px">Είδος</div><div style="width:448px">Διαδρομή / περιγραφή</div><div style="width:100px" class="r">Έλαβε</div><div style="width:100px" class="r">Έξοδα</div><div style="width:100px" class="r">Κράτησε</div><div style="width:100px" class="r">Αξία</div><div style="width:120px" class="r">Υπόλοιπο</div><div style="width:120px" class="r">Προοδευτικό</div></div>
    <div>${rows}</div>
    <div class="dl-foot"><span>Σύνολα ${_dl.year === 'all' ? '' : _dl.year} · ${trips.length} δρομολόγια · ${live.length - trips.length} πληρωμές · ${_dl.entries.length - live.length} ακυρωμέν${_dl.entries.length - live.length === 1 ? 'η' : 'ες'}</span><span class="dl-sp"></span>
      <span>Αξία <b>${dlEur(value)}</b> &nbsp; Πληρωμές <b>${dlEur(cash + bank)}</b></span></div>
    <div class="dl-overlay" id="dlOverlay" onclick="dlCloseForm()"></div><div class="dl-modal" id="dlModal"></div>
  </div>`;
}

function dlOpenForm(driverId, type) {
  const drivers = _dl.balances.filter(b => b.active);
  const m = document.getElementById('dlModal'); document.getElementById('dlOverlay').classList.add('open'); m.classList.add('open');
  const cur = driverId ? drivers.find(d => d.driver_id === driverId) : null;
  const bal = cur ? Number(cur.balance || 0) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const seg = ['trip', 'payment_cash', 'payment_bank'].map(t => `<button class="${type === t ? 'on' : ''}" onclick="dlOpenForm(${driverId || 'null'},'${t}')">${t === 'trip' ? 'Δρομολόγιο' : t === 'payment_cash' ? 'Πληρωμή μετρητά' : 'Πληρωμή τράπεζα'}</button>`).join('');
  const rtOpts = '<option value="">— χωρίς σύνδεση —</option>' + (driverId ? _dl.rts : []).map(r => `<option value="${r.rt_id}">${escapeHtml(r.code)} · ${dlDateRange(r.date_start, null)}</option>`).join('');
  const drvOpts = drivers.map(d => `<option value="${d.driver_id}"${d.driver_id === driverId ? ' selected' : ''}>${escapeHtml(d.full_name)}</option>`).join('');
  m.innerHTML = `<div style="display:flex;align-items:center;margin-bottom:16px"><span class="dl-title">Νέα κίνηση${cur ? ' — ' + escapeHtml(cur.full_name) : ''}</span><span class="dl-sp"></span><button class="dl-btn" style="border:0" onclick="dlCloseForm()">✕</button></div>
    <div class="dl-f" style="margin-bottom:6px"><label>Είδος κίνησης *</label></div><div class="dl-seg">${seg}</div>
    <div class="dl-fr"><div class="dl-f"><label>Οδηγός *</label><select id="dlDriver">${drvOpts}</select><span class="h">${cur ? 'ενεργός · υπόλοιπο ' + dlEur(bal) + ' πριν την κίνηση' : ''}</span></div>
      ${type === 'trip' ? `<div class="dl-f"><label>Σύνδεση με round trip</label><select id="dlRt">${rtOpts}</select><span class="h">προαιρετικό · τρέφει το TRIP PnL</span></div>` : `<div class="dl-f"><label>Ημερομηνία *</label><input type="date" id="dlDate" value="${today}"></div>`}</div>
    ${type === 'trip' ? `
    <div class="dl-fr"><div class="dl-f"><label>Αναχώρηση *</label><input type="date" id="dlDate" value="${today}"></div><div class="dl-f"><label>Επιστροφή</label><input type="date" id="dlEnd"><span class="h">κενή όσο ο οδηγός είναι στον δρόμο</span></div></div>
    <div class="dl-fr"><div class="dl-f"><label>Διαδρομή *</label><input id="dlRoute" placeholder="ΒΕΡΟΙΑ-ΠΟΛΩΝΙΑ-ΒΕΡΟΙΑ"><span class="h">ελεύθερο κείμενο, όπως στο Excel — ή αυτόματα από το RT</span></div></div>
    <div class="dl-fr"><div class="dl-f"><label>Αξία δρομολογίου (€)</label><input type="number" step="0.01" id="dlValue" oninput="dlRecalc()"><span class="h">κενό = εκκρεμεί, όχι 0</span></div>
      <div class="dl-f"><label>Έλαβε (προκαταβολή)</label><input type="number" step="0.01" id="dlAdvance" oninput="dlRecalc()"><span class="h">μετρητά στην αναχώρηση</span></div>
      <div class="dl-f"><label>Έξοδα (λίστα οδηγού)</label><input type="number" step="0.01" id="dlExpenses" oninput="dlRecalc()"><span class="h">χωρίς παραστατικό — Έξοδα Μ</span></div></div>
    <div class="dl-calc" id="dlCalc"></div>` : `
    <div class="dl-fr"><div class="dl-f"><label>Ποσό (€) *</label><input type="number" step="0.01" id="dlAmount" oninput="dlRecalc()"></div></div>
    <div class="dl-calc" id="dlCalc"></div>`}
    <div class="dl-fr"><div class="dl-f"><label>Σημείωση</label><input id="dlNote"><span class="h">προαιρετικό</span></div></div>
    <div style="display:flex;align-items:center;gap:12px"><span style="font-size:11px;color:var(--warn);max-width:320px">Η κίνηση δεν διαγράφεται. Αν γίνει λάθος, ακυρώνεται με αιτιολογία και μένει ορατή στην καρτέλα.</span><span class="dl-sp"></span>
      <button class="dl-btn" style="border:0;color:var(--accent)" onclick="dlCloseForm()">Άκυρο</button><button class="dl-btn pri" onclick="dlSaveForm('${type}')">Καταχώρηση</button></div><div class="dl-err" id="dlErr"></div>`;
  m.dataset.balance = String(bal);
  dlRecalc();
}

// The arithmetic is shown before saving: the toast is not the proof.
function dlRecalc() {
  const el = document.getElementById('dlCalc'); if (!el) return;
  const g = id => { const x = document.getElementById(id); return x && x.value !== '' ? Number(x.value) : null; };
  const bal = Number(document.getElementById('dlModal').dataset.balance || 0);
  if (document.getElementById('dlAmount')) {
    const amt = g('dlAmount');
    el.innerHTML = `<div><div class="k">ΥΠΟΛΟΙΠΟ ΓΡΑΜΜΗΣ</div><b>${amt != null ? '−' + dlEur(amt) : '—'}</b></div><div><div class="k">ΝΕΟ ΠΡΟΟΔΕΥΤΙΚΟ</div><b>${amt != null ? dlEur(bal - amt) : '—'}</b></div>`;
    return;
  }
  const v = g('dlValue'), a = g('dlAdvance'), x = g('dlExpenses');
  const kept = (a != null || x != null) ? (a || 0) - (x || 0) : null;
  const delta = v != null ? v - (kept || 0) : null;
  el.innerHTML = `<div><div class="k">ΚΡΑΤΗΣΕ</div><b>${kept != null ? dlEur(kept) : '—'}</b></div><div><div class="k">ΥΠΟΛΟΙΠΟ ΓΡΑΜΜΗΣ</div><b>${delta != null ? (delta >= 0 ? '+' : '−') + dlEur(Math.abs(delta)) : 'εκκρεμεί'}</b></div><div><div class="k">ΝΕΟ ΠΡΟΟΔΕΥΤΙΚΟ</div><b>${delta != null ? dlEur(bal + delta) : '—'}</b></div><span class="dl-sp"></span><span class="k">αξία − (έλαβε − έξοδα)</span>`;
}

async function dlSaveForm(type) {
  const g = id => { const x = document.getElementById(id); return x ? x.value : ''; };
  const n = id => { const v = g(id); return v === '' ? undefined : Number(v); };
  const body = { driver_id: Number(g('dlDriver')), entry_type: type, entry_date: g('dlDate') || undefined, note: g('dlNote') || undefined };
  if (type === 'trip') {
    Object.assign(body, { date_end: g('dlEnd') || undefined, route: g('dlRoute') || undefined, rt_id: g('dlRt') ? Number(g('dlRt')) : undefined, trip_value: n('dlValue'), advance: n('dlAdvance'), expenses: n('dlExpenses') });
    if (!body.route && !body.rt_id) { document.getElementById('dlErr').textContent = 'Διαδρομή ή σύνδεση με RT — ένα από τα δύο.'; return; }
  } else body.amount = n('dlAmount');
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
  try {
    await ctFetch('/costs/ledger', { method: 'POST', body });
    dlCloseForm();
    const r = await ctFetch('/costs/ledger'); _dl.balances = r.records || []; _dl.gap = r.gap || 0;
    if (_dl.driver) renderPayrollDriver(_dl.driver); else dlRenderList();
  } catch (e) { document.getElementById('dlErr').textContent = 'Δεν καταχωρήθηκε: ' + e.message; }
}

// Clicking a ledger row: fill a pending value, correct with a reason, or cancel with a reason.
function dlOpenEdit(id) {
  const e = _dl.entries.find(x => x.id === id); if (!e || e.cancelled) return;
  const m = document.getElementById('dlModal'); document.getElementById('dlOverlay').classList.add('open'); m.classList.add('open');
  const isTrip = e.entry_type === 'trip';
  m.innerHTML = `<div style="display:flex;align-items:center;margin-bottom:16px"><span class="dl-title">${escapeHtml(e.route_text || dlTypeLabel(e.entry_type))} · ${dlDateRange(e.entry_date, e.date_end)}</span><span class="dl-sp"></span><button class="dl-btn" style="border:0" onclick="dlCloseForm()">✕</button></div>
    ${isTrip ? `<div class="dl-fr"><div class="dl-f"><label>Αξία δρομολογίου (€)</label><input type="number" step="0.01" id="dlValue" value="${e.trip_value ?? ''}"></div><div class="dl-f"><label>Έλαβε</label><input type="number" step="0.01" id="dlAdvance" value="${e.advance ?? ''}"></div><div class="dl-f"><label>Έξοδα</label><input type="number" step="0.01" id="dlExpenses" value="${e.expenses ?? ''}"></div></div>`
             : `<div class="dl-fr"><div class="dl-f"><label>Ποσό (€)</label><input type="number" step="0.01" id="dlAmount" value="${e.amount}"></div></div>`}
    <div class="dl-fr"><div class="dl-f"><label>Αιτιολογία</label><input id="dlReason"><span class="h">υποχρεωτική όταν αλλάζει γραμμένο ποσό ή όταν ακυρώνεις</span></div></div>
    <div style="display:flex;gap:12px;align-items:center"><button class="dl-btn" style="color:var(--danger)" onclick="dlCancelEntry(${id})">Ακύρωση κίνησης</button><span class="dl-sp"></span>
      <button class="dl-btn" style="border:0;color:var(--accent)" onclick="dlCloseForm()">Άκυρο</button><button class="dl-btn pri" onclick="dlSaveEdit(${id})">Αποθήκευση</button></div><div class="dl-err" id="dlErr"></div>`;
}
async function dlSaveEdit(id) {
  const e = _dl.entries.find(x => x.id === id);
  const n = k => { const x = document.getElementById(k); return x && x.value !== '' ? Number(x.value) : null; };
  const body = { reason: document.getElementById('dlReason').value || undefined };
  if (e.entry_type === 'trip') { for (const [k, f] of [['trip_value', 'dlValue'], ['advance', 'dlAdvance'], ['expenses', 'dlExpenses']]) { const v = n(f); if (v !== (e[k] == null ? null : Number(e[k]))) body[k] = v; } }
  else { const v = n('dlAmount'); if (v !== Number(e.amount)) body.amount = v; }
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
  if (Object.keys(body).filter(k => k !== 'reason').length === 0) { document.getElementById('dlErr').textContent = 'Τίποτα δεν άλλαξε.'; return; }
  try { await ctFetch('/costs/ledger/' + id, { method: 'PATCH', body }); dlCloseForm(); renderPayrollDriver(_dl.driver); }
  catch (err) { document.getElementById('dlErr').textContent = 'Δεν αποθηκεύτηκε: ' + err.message; }
}
async function dlCancelEntry(id) {
  const reason = document.getElementById('dlReason').value.trim();
  if (!reason) { document.getElementById('dlErr').textContent = 'Η ακύρωση θέλει αιτιολογία.'; return; }
  try { await ctFetch('/costs/ledger/' + id, { method: 'PATCH', body: { cancel: true, reason } }); dlCloseForm(); renderPayrollDriver(_dl.driver); }
  catch (err) { document.getElementById('dlErr').textContent = 'Δεν ακυρώθηκε: ' + err.message; }
}
function dlCloseForm() {
  const o = document.getElementById('dlOverlay'), m = document.getElementById('dlModal');
  if (o) o.classList.remove('open'); if (m) m.classList.remove('open');
}

// node:test reads these; the browser ignores the guard.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dlEur, dlBalanceWord, dlDelta, dlTypeLabel, dlDateRange };
}
