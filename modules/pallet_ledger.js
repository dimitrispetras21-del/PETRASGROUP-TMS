// ═══════════════════════════════════════════════════════════
// MODULE — ΙΣΟΖΥΓΙΟ ΠΑΛΕΤΩΝ (Φ2 minimal: εκκρεμείς + διορθώσεις + νέα κίνηση)
// Πηγή: /pallets/* (Worker). Το πλήρες Ισοζύγιο (υπόλοιπα/drill-down) = Φ3.
// ═══════════════════════════════════════════════════════════
'use strict';

// q/from/to: το παλιό pallet_ledger page είχε φίλτρα + CSV — δεν τα χάνουμε
// (η λογίστρια τα χρησιμοποιεί καθημερινά· αφαίρεσή τους = οπισθοδρόμηση).
const PLV = { movements: [], lookups: null, balances: { clients: null, partners: null }, tab: 'pending', busy: false, q: '', from: '', to: '',
  // Redesign 27/8: ομαδοποίηση (client|location|none), κατάσταση διπλώματος ανά
  // ομάδα (κρατιέται όσο ο χρήστης μένει στη σελίδα), cache παραγγελιών ανά
  // pg id για τις πλούσιες γραμμές, και σημαία αποτυχίας εμπλουτισμού.
  groupBy: 'client', open: {}, orderById: null, enrichFail: false };

async function renderPalletLedger() {
  const c = document.getElementById('content');
  c.style.padding = ''; c.style.overflow = '';
  c.innerHTML = '<div style="text-align:center;padding:60px;color:var(--panel-dim)">Φόρτωση κινήσεων παλετών...</div>';
  try {
    const [mv, lk] = await Promise.all([
      plFetch('/pallets/movements'),
      PLV.lookups ? Promise.resolve(PLV.lookups) : plFetch('/pallets/lookups')
    ]);
    PLV.movements = mv.records || [];
    PLV.lookups = lk;
    const [bc, bp] = await Promise.all([
      plFetch('/pallets/balances?type=clients'),
      plFetch('/pallets/balances?type=partners')
    ]);
    PLV.balances.clients = bc.records || [];
    PLV.balances.partners = bp.records || [];
  } catch (e) {
    c.innerHTML = `<div style="padding:40px;color:var(--danger)">Σφάλμα φόρτωσης: ${e.message}</div>`;
    return;
  }
  // Ο εμπλουτισμός ΕΚΤΟΣ του παραπάνω try: αποτυχία του δεν αδειάζει ποτέ τη
  // σελίδα — οι γραμμές δείχνονται χωρίς τα πεδία παραγγελίας + ένδειξη ⚠.
  await _plvEnrich();
  _plvDraw();
}

/* ── §2: πλούσιες γραμμές — Reference/φορτηγό/μεταφορέας/δελτίο ──
   Η κίνηση κρατά order_id σε pg bigint, το facade μιλά recXXX. Η ΜΟΝΗ
   υπάρχουσα γέφυρα pg-id ↔ rec χωρίς νέο endpoint είναι το /pallets/gate
   (γυρίζει order_rec + order_id ανά παραγγελία): του στέλνουμε όλα τα recs
   της (2λεπτο-cached) λίστας ORDERS σε παρτίδες των 250 — ΟΧΙ ένα αίτημα
   ανά κίνηση, και κάτω από το όριο των 300 recs του Worker/1000 της
   PostgREST. Πινακίδες/partners από το προφορτωμένο cache αναφοράς. */
async function _plvEnrich() {
  PLV.enrichFail = false;
  try {
    const orders = await atGetAll(TABLES.ORDERS, {}, true);
    const byRec = {};
    orders.forEach(o => { byRec[o.id] = o; });
    const recs = Object.keys(byRec);
    const idMap = {};
    for (let i = 0; i < recs.length; i += 250) {
      const g = await plFetch('/pallets/gate?order_recs=' + recs.slice(i, i + 250).join(','));
      (g.records || []).forEach(r => { if (byRec[r.order_rec]) idMap[r.order_id] = byRec[r.order_rec]; });
    }
    PLV.orderById = idMap;
  } catch (e) {
    // Θόρυβος στο console + ⚠ στην οθόνη — ποτέ σιωπή, ποτέ κενή σελίδα.
    console.warn('[pallet-ledger] enrichment failed:', e && e.message);
    PLV.orderById = {};
    PLV.enrichFail = true;
  }
}

// Το όνομα έρχεται embedded από το /pallets/movements (PostgREST join) — τα
// lookups μένουν ΜΟΝΟ ως fallback, γιατί κόβονται στα 1000 (db-max-rows) και
// άφηναν όσους πελάτες έπεφταν αλφαβητικά μετά το όριο ως «Πελάτης #1314» (12/8).
function _plvName(m) {
  if (m.counterparty_type === 'CLIENT') {
    if (m.clients && m.clients.company_name) return m.clients.company_name;
    const cl = ((PLV.lookups && PLV.lookups.clients) || []).find(x => x.id === m.client_id);
    return cl ? cl.company_name : ('Πελάτης #' + m.client_id);
  }
  if (m.partners && m.partners.company_name) return m.partners.company_name;
  const p = ((PLV.lookups && PLV.lookups.partners) || []).find(x => x.id === m.partner_id);
  return p ? p.company_name : ('Partner #' + m.partner_id);
}
function _plvLoc(m) {
  if (m.locations && m.locations.name) return m.locations.name;
  const l = ((PLV.lookups && PLV.lookups.locations) || []).find(x => x.id === m.location_id);
  return l ? l.name : '';
}
// Ελληνική εμφάνιση (17/08/26) ΜΟΝΟ στην οθόνη — το CSV μένει ISO ώστε το
// Excel να ταξινομεί σωστά. Το nowrap στο κελί: το «2026-08-17» έσπαγε στη μέση.
function _plvFmtDate(d) {
  if (!d) return '';
  const p = String(d).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0].slice(2) : d;
}

// Status ως pill παντού (λίστα/καρτέλα/πάνελ) — το σκέτο κείμενο δεν σαρωνόταν
// με το μάτι σε 40 γραμμές.
function _plvPill(status) {
  if (status === 'pending') return '<span class="plv-pill plv-pill-pending">εκκρεμής</span>';
  if (status === 'confirmed') return '<span class="plv-pill plv-pill-ok">οριστική</span>';
  return '<span class="plv-pill plv-pill-rev">αντιλογισμένη</span>';
}

// Κατεύθυνση ποσότητας με μία ματιά: ↓ παλέτες μπήκαν σε εμάς (πράσινο),
// ↑ έφυγαν από εμάς· το μηδέν αχνό ώστε να μη μαγνητίζει το μάτι.
function _plvQty(n, dir) {
  const v = n || 0;
  const arrow = dir === 'in' ? '↓' : '↑';
  if (!v) return `<span style="opacity:.35">${arrow} 0</span>`;
  return `<span style="color:${dir === 'in' ? '#15803D' : '#B91C1C'};font-weight:600">${arrow} ${v}</span>`;
}

const PLV_EVENT_GR = {
  LOADING: 'Φόρτωση', DELIVERY: 'Παράδοση', PARTNER_PICKUP: 'Παραλαβή από partner',
  PARTNER_DROPOFF: 'Παράδοση από partner', RETURN_OUT: 'Επιστροφή αδειών',
  RETURN_IN: 'Παραλαβή αδειών', ADJUSTMENT: 'Τακτοποίηση'
};

function _plvRows() {
  let rows;
  if (PLV.tab === 'pending') rows = PLV.movements.filter(m => m.status === 'pending');
  else if (PLV.tab === 'noreturn') rows = PLV.movements.filter(m =>
    m.status === 'confirmed' && m.event_type === 'DELIVERY' && m.given > m.taken);
  else rows = PLV.movements.filter(m => m.status !== 'reversed');
  if (PLV.from) rows = rows.filter(m => m.movement_date >= PLV.from);
  if (PLV.to)   rows = rows.filter(m => m.movement_date <= PLV.to);
  const q = PLV.q.trim().toLowerCase();
  if (q) rows = rows.filter(m =>
    (m.code + ' ' + _plvName(m) + ' ' + _plvLoc(m) + ' ' + (m.notes || '')).toLowerCase().includes(q));
  return rows;
}

// Σύνολο γραμμών του τρέχοντος tab ΧΩΡΙΣ φίλτρα q/ημερομηνιών — ο παρονομαστής
// του μετρητή «N από M».
function _plvTabTotal() {
  if (PLV.tab === 'pending') return PLV.movements.filter(m => m.status === 'pending').length;
  if (PLV.tab === 'noreturn') return PLV.movements.filter(m =>
    m.status === 'confirmed' && m.event_type === 'DELIVERY' && m.given > m.taken).length;
  return PLV.movements.filter(m => m.status !== 'reversed').length;
}

// Μερικό render, ΟΧΙ _plvDraw(): το πλήρες innerHTML ξαναχτίζει και το input
// της αναζήτησης, που χάνει το focus σε ΚΑΘΕ πλήκτρο — ο χρήστης έγραφε «elita»
// και έμενε μόνο το «e» (εύρημα audit 25/8). Ενημερώνεται μόνο ο πίνακας —
// μετρητής και × ανανεώνονται επιτόπου, χωρίς να αγγιχτεί το input.
function plvFilter(key, val) {
  PLV[key] = val;
  const el = document.getElementById('plvTbl');
  const isBalanceTab = PLV.tab === 'clients' || PLV.tab === 'partners';
  if (el && !isBalanceTab) {
    const rows = _plvRows();
    el.innerHTML = _plvListHtml(rows);
    const cnt = document.getElementById('plvCount');
    if (cnt) cnt.textContent = rows.length + ' από ' + _plvTabTotal();
    const x = document.getElementById('plvQClear');
    if (x) x.style.display = PLV.q ? '' : 'none';
  } else _plvDraw();
}

function plvClearQ() {
  PLV.q = '';
  const i = document.getElementById('plvQ');
  if (i) { i.value = ''; i.focus(); }
  plvFilter('q', '');
}

function plvExportCSV() {
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const isBalanceTab = PLV.tab === 'clients' || PLV.tab === 'partners';
  let head, body, fname;
  if (isBalanceTab) {
    const rows = (PLV.balances[PLV.tab] || []).filter(b => b.balance !== 0 || b.pending_count > 0);
    if (!rows.length) { toast('Κανένα υπόλοιπο για εξαγωγή', 'error'); return; }
    const nameKey = PLV.tab === 'clients' ? 'client_name' : 'partner_name';
    const idKey = PLV.tab === 'clients' ? 'client_id' : 'partner_id';
    // Χωρίς «Ανοιχτό από»/«Ημέρες»: το pl_v_balance_clients δεν επιστρέφει
    // open_since — η στήλη έβγαινε ΠΑΝΤΑ κενή και στο CSV (νεκρή στήλη, 25/8).
    head = ['Αντισυμβαλλόμενος', 'Υπόλοιπο', 'Εκκρεμείς'];
    body = rows.map(b => [b[nameKey] || ('#' + b[idKey]), b.balance, b.pending_count || 0].map(esc).join(','));
    fname = 'ypoloipa-' + PLV.tab + '-' + new Date().toISOString().slice(0, 10) + '.csv';
  } else {
    const rows = _plvRows();
    if (!rows.length) { toast('Καμία κίνηση για εξαγωγή', 'error'); return; }
    head = ['Κωδικός', 'Ημερομηνία', 'Είδος', 'Αντισυμβαλλόμενος', 'Σημείο', 'Πήραμε', 'Δώσαμε', 'Καθαρό', 'Κατάσταση', 'Σημείωση'];
    body = rows.map(m => [m.code, m.movement_date, PLV_EVENT_GR[m.event_type] || m.event_type,
      _plvName(m), _plvLoc(m), m.taken, m.given, m.given - m.taken, m.status, m.notes || ''].map(esc).join(','));
    fname = 'paletes-' + new Date().toISOString().slice(0, 10) + '.csv';
  }
  // BOM: χωρίς αυτό το Excel δείχνει τα ελληνικά ως μουτζούρες
  const blob = new Blob(['﻿' + [head.map(esc).join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click(); URL.revokeObjectURL(a.href);
  toast('CSV εξήχθη ✓');
}

// §3 (27/8): οι κάρτες έπαψαν να είναι διακόσμηση — δείχνουν ΠΟΙΟΣ χρωστάει
// (top-3, κλικ → καρτέλα) και πόσες εκκρεμείς έχουν ήδη δελτίο. Χαμηλότερες:
// δεν δικαιούνται το πάνω τρίτο της οθόνης.
function _plvOverview() {
  const tag = (arr, kind, nameKey, idKey) => (arr || []).map(b => ({ kind, name: b[nameKey] || ('#' + b[idKey]), bid: b[idKey], balance: b.balance }));
  const all = tag(PLV.balances.clients, 'clients', 'client_name', 'client_id')
    .concat(tag(PLV.balances.partners, 'partners', 'partner_name', 'partner_id'));
  const owedList = all.filter(b => b.balance > 0).sort((a, b) => b.balance - a.balance);
  const oweList  = all.filter(b => b.balance < 0).sort((a, b) => a.balance - b.balance);
  const owed = owedList.reduce((s, b) => s + b.balance, 0);
  const owe  = -oweList.reduce((s, b) => s + b.balance, 0);
  const pend = PLV.movements.filter(m => m.status === 'pending');
  const withSheet = pend.filter(m => m.sheet_url).length;
  const top3 = (list, sign) => list.length
    ? list.slice(0, 3).map(b => `<div onclick="event.stopPropagation();plvDrill('${b.kind}',${b.bid})" title="Άνοιγμα καρτέλας" style="display:flex;justify-content:space-between;gap:8px;font-size:11.5px;margin-top:3px;cursor:pointer" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration=''">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.name}</span><b>${sign}${Math.abs(b.balance)}</b></div>`).join('')
    : '<div style="font-size:11.5px;color:var(--panel-dim);margin-top:3px">κανείς</div>';
  const card = (lbl, valHtml, bodyHtml, go, title) => `<div class="plv-card" onclick="plvTab('${go}')" title="${title}" style="flex:1 1 200px;background:var(--panel,#fff);border:1px solid var(--line,#e2e8f0);border-radius:10px;padding:9px 14px">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <span style="font-size:10.5px;color:var(--panel-dim);text-transform:uppercase;letter-spacing:.04em">${lbl}</span>
      ${valHtml}
    </div>${bodyHtml}</div>`;
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">
    ${card('Μας οφείλουν', `<span style="font-family:Syne;font-size:18px;font-weight:700;color:#15803D">${owed} pal</span>`, top3(owedList, '+'), 'clients', 'Άνοιγμα: Πελάτες')}
    ${card('Οφείλουμε', `<span style="font-family:Syne;font-size:18px;font-weight:700;color:#B91C1C">${owe} pal</span>`, top3(oweList, '−'), 'partners', 'Άνοιγμα: Συνεργάτες')}
    ${card('Εκκρεμή', `<span style="font-family:Syne;font-size:18px;font-weight:700;color:#92400E">${pend.length}</span>`,
      `<div style="font-size:11.5px;color:var(--panel-dim);margin-top:3px">${withSheet} με δελτίο · <b style="color:#92400E">${pend.length - withSheet} χωρίς</b></div>`, 'pending', 'Άνοιγμα: Εκκρεμείς')}
  </div>`;
}

// «Ανοιχτό από» αφαιρέθηκε από πίνακα/CSV/drill (25/8): η όψη pl_v_balance_*
// δεν έχει στήλη open_since — το πεδίο ήταν πάντα undefined και η στήλη πάντα
// κενή (αρχή 8: νεκρή στήλη = ψέμα). Αν χρειαστεί, προστίθεται πρώτα στην όψη.
function _plvBalanceTable(kind) {
  const rows = (PLV.balances[kind] || [])
    .filter(b => b.balance !== 0 || b.pending_count > 0)
    .sort((a, b) => b.balance - a.balance); // πρώτα όποιος μας χρωστάει τα περισσότερα
  if (!rows.length) return `<div style="padding:44px;text-align:center;color:var(--panel-dim)">
    ${typeof icon === 'function' ? icon('check_circle', 28) : ''}
    <div style="margin:10px 0 4px;font-weight:600;color:var(--panel-text,#0F172A)">Κανένα ανοιχτό υπόλοιπο</div>
    <div style="font-size:12px">Όλα τα ισοζύγια ${kind === 'clients' ? 'πελατών' : 'συνεργατών'} είναι στο μηδέν.</div>
  </div>`;
  const idKey = kind === 'clients' ? 'client_id' : 'partner_id';
  const nameKey = kind === 'clients' ? 'client_name' : 'partner_name';
  return `<div style="overflow-x:auto"><table class="plv-tbl" style="width:100%;border-collapse:collapse;font-size:13px">
    <tr style="text-align:left;color:var(--panel-dim)">
      <th>${kind === 'clients' ? 'Πελάτης' : 'Συνεργάτης'}</th>
      <th style="text-align:right">Υπόλοιπο</th>
      <th style="text-align:right">Εκκρεμείς</th><th></th></tr>
    ${rows.map(b => `<tr style="border-top:1px solid var(--line,#e2e8f0);cursor:pointer" onclick="plvDrill('${kind}',${b[idKey]})">
      <td>${b[nameKey] || ('#' + b[idKey])}</td>
      <td style="text-align:right;font-weight:700;color:${b.balance > 0 ? '#15803D' : b.balance < 0 ? '#B91C1C' : 'inherit'}">${b.balance > 0 ? '+' : ''}${b.balance}</td>
      <td style="text-align:right">${b.pending_count || ''}</td>
      <td style="color:var(--accent);font-size:12px">ανάλυση →</td></tr>`).join('')}
  </table></div>`;
}

function _plvDraw() {
  const c = document.getElementById('content');
  const pend = PLV.movements.filter(m => m.status === 'pending').length;
  const isBalanceTab = PLV.tab === 'clients' || PLV.tab === 'partners';
  const rows = isBalanceTab ? [] : _plvRows();
  c.innerHTML = `
  <div style="padding:20px 24px;max-width:1280px;margin:0 auto">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <h1 style="font-family:Syne;font-size:22px;margin:0">Ισοζύγιο Παλετών</h1>
      <button class="btn-new-order" onclick="plvNewMovement()">+ Νέα κίνηση</button>
    </div>
    ${_plvOverview()}
    <div style="display:flex;gap:8px;margin:16px 0;flex-wrap:wrap">
      ${[['pending', 'Εκκρεμείς (' + pend + ')'], ['noreturn', 'Χωρίς πλήρη επιστροφή'], ['all', 'Όλες οι κινήσεις'], ['clients', 'Πελάτες'], ['partners', 'Συνεργάτες']].map(([id, lbl]) =>
        `<button onclick="plvTab('${id}')" style="padding:8px 16px;border-radius:20px;border:1px solid var(--accent);cursor:pointer;font-size:13px;${PLV.tab === id ? 'background:var(--accent);color:#fff' : 'background:transparent;color:var(--accent)'}">${lbl}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      ${isBalanceTab ? '' : `
      <div style="flex:1 1 220px;position:relative;display:flex;align-items:center">
        <input id="plvQ" placeholder="Αναζήτηση (κωδικός, όνομα, σημείο)" value="${PLV.q}" oninput="plvFilter('q',this.value)" style="width:100%;padding:8px 28px 8px 12px;font-size:13px">
        <span id="plvQClear" onclick="plvClearQ()" title="Καθαρισμός αναζήτησης" style="display:${PLV.q ? '' : 'none'};position:absolute;right:8px;cursor:pointer;color:var(--panel-dim);font-size:16px;line-height:1">×</span>
      </div>
      <span id="plvCount" style="font-size:12px;color:var(--panel-dim);white-space:nowrap">${rows.length} από ${_plvTabTotal()}</span>
      <label style="font-size:12px;color:var(--panel-dim)">Από <input type="date" value="${PLV.from}" onchange="plvFilter('from',this.value)" style="padding:6px;font-size:13px"></label>
      <label style="font-size:12px;color:var(--panel-dim)">Έως <input type="date" value="${PLV.to}" onchange="plvFilter('to',this.value)" style="padding:6px;font-size:13px"></label>`}
      <button class="btn-scan" onclick="plvExportCSV()">Export CSV</button>
    </div>
    ${isBalanceTab ? '' : `
    <div style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--panel-dim);margin:-4px 0 10px;flex-wrap:wrap">
      Ομαδοποίηση:
      ${[['client', 'Ανά πελάτη'], ['location', 'Ανά σημείο'], ['none', 'Χωρίς']].map(([v, l]) =>
        `<button onclick="plvGroupBy('${v}')" style="padding:4px 12px;border-radius:14px;font-size:12px;cursor:pointer;border:1px solid ${PLV.groupBy === v ? 'var(--accent)' : 'var(--line,#CBD5E1)'};${PLV.groupBy === v ? 'background:var(--accent);color:#fff' : 'background:transparent;color:var(--panel-dim)'}">${l}</button>`).join('')}
      ${PLV.enrichFail ? '<span style="color:#92400E;margin-left:8px" title="Η ανάγνωση των παραγγελιών απέτυχε — οι στήλες Reference/Μεταφορικό είναι προσωρινά κενές. Οι κινήσεις εμφανίζονται κανονικά.">⚠ στοιχεία παραγγελιών μη διαθέσιμα</span>' : ''}
    </div>`}
    <!-- Το style εδώ, ΟΧΙ μέσα στον πίνακα κινήσεων: τα tabs ισοζυγίου το
         έχαναν και οι επικεφαλίδες κολλούσαν («ΥπόλοιποΑνοιχτό από», 25/8). -->
    <style>
      .plv-tbl th,.plv-tbl td{padding:8px 12px}.plv-tbl th{white-space:nowrap}
      .plv-pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11.5px;font-weight:600;white-space:nowrap}
      .plv-pill-pending{background:#FEF3C7;color:#92400E}
      .plv-pill-ok{background:#DCFCE7;color:#15803D}
      .plv-pill-rev{background:#E2E8F0;color:#475569}
      .plv-card{cursor:pointer;transition:box-shadow .15s,border-color .15s}
      .plv-card:hover{border-color:var(--accent,#027BBD);box-shadow:0 2px 10px rgba(2,123,189,.18)}
      /* Ιεραρχία με τυπογραφία + διακριτικό φόντο, όχι πλαίσια: Syne στον
         πελάτη, αχνό υπο-επίπεδο σημείου, DM Sans στις κινήσεις. */
      .plv-ghead{display:flex;align-items:center;gap:6px;background:rgba(2,123,189,.06);border-radius:8px;padding:8px 12px;margin:12px 0 2px;cursor:pointer;user-select:none}
      .plv-ghead:hover{background:rgba(2,123,189,.11)}
      .plv-gname{font-family:Syne;font-size:14.5px;font-weight:700}
      .plv-gsum{margin-left:auto;font-size:12px;color:var(--panel-dim);white-space:nowrap}
      .plv-gsub{font-size:12px;font-weight:600;color:var(--panel-dim);padding:8px 12px 2px 30px}
    </style>
    <div id="plvTbl">${isBalanceTab ? _plvBalanceTable(PLV.tab) : _plvListHtml(rows)}</div>
  </div>
  <div id="plvModal"></div>`;
}

/* ── Redesign 27/8: ιεραρχία πελάτης → σημείο → κινήσεις ──
   Τα δεδομένα ΕΧΟΥΝ φυσική ιεραρχία· ο επίπεδος πίνακας επαναλάμβανε τον
   πελάτη σε κάθε γραμμή. Ομαδοποίηση με σύνολα ανά επίπεδο, δίπλωμα, και
   διακόπτης Ανά πελάτη / Ανά σημείο / Χωρίς. */

// Στοιχεία παραγγελίας ανά γραμμή (Reference/μεταφορικό) — γεμίζουν από το
// _plvEnrich (§2)· μέχρι τότε κενά, ΟΧΙ «—» παντού.
function _plvRowExtras(m) {
  const o = (PLV.orderById || {})[m.order_id];
  if (!o) return { ref: '', carrier: '' };
  const f = o.fields;
  let carrier = '';
  if (f['Is Partner Trip']) {
    const pid = getLinkedId(f['Partner']);
    const p = pid ? getRefPartners().find(x => x.id === pid) : null;
    carrier = ((p && p.fields['Company Name']) || 'Partner')
      + (f['Partner Truck Plates'] ? ' · ' + f['Partner Truck Plates'] : '');
  } else {
    carrier = getTruckPlate(getLinkedId(f['Truck'])) || '';
  }
  return { ref: f['Reference'] || '', carrier };
}

function _plvMovementRow(m, grouped) {
  const x = _plvRowExtras(m);
  return `
      <tr style="border-top:1px solid var(--line,#e2e8f0);cursor:pointer" title="Λεπτομέρειες κίνησης" onclick="if(!event.target.closest('button,a'))plvOpenPanel(${m.id})">
        <td style="white-space:nowrap">${m.code}</td>
        <td style="white-space:nowrap">${_plvFmtDate(m.movement_date)}</td>
        <td>${PLV_EVENT_GR[m.event_type] || m.event_type}</td>
        ${grouped ? '' : `<td>${_plvName(m)}</td><td>${_plvLoc(m)}</td>`}
        <td style="text-align:right">${_plvQty(m.taken, 'in')}</td>
        <td style="text-align:right">${_plvQty(m.given, 'out')}</td>
        <td style="font-size:12px;white-space:nowrap">${x.ref ? escapeHtml(x.ref) : ''}</td>
        <td style="font-size:12px">${x.carrier ? escapeHtml(x.carrier) : ''}</td>
        <td style="text-align:center">${m.sheet_url ? `<a href="#" title="Προβολή δελτίου" onclick="plvViewSheet('${String(m.sheet_url).replace(/'/g, '')}');return false" style="text-decoration:none">📎</a>` : ''}</td>
        <td>${_plvPill(m.status)}</td>
        <td style="white-space:nowrap">
          ${m.status === 'pending' ? (m.taken + m.given === 0 && m.event_type !== 'ADJUSTMENT'
            // 0/0 δεν παίρνει ενεργή «Επιβεβαίωση» — ο Worker την απορρίπτει
            // (taken+given>0)· το modal είναι ο μόνος δρόμος διόρθωσης.
            ? `<button class="btn-scan" style="padding:4px 12px;border-color:#92400E;color:#92400E" title="Μηδενικές ποσότητες — χρειάζεται διόρθωση πριν την επιβεβαίωση" onclick="plvOpenConfirm(${m.id})">Διόρθωση ποσοτήτων</button>`
            : `<button class="btn-scan" style="padding:4px 12px" onclick="plvOpenConfirm(${m.id})">Επιβεβαίωση</button>`) : ''}
          ${m.status === 'confirmed' && m.event_type === 'DELIVERY' ? `<button class="btn-scan" style="padding:4px 12px" onclick="plvFixDelivery(${m.id})">Διόρθωση ανταλλαγής</button>` : ''}
        </td>
      </tr>`;
}

const _PLV_EMPTY = (cols) => `<tr><td colspan="${cols}" style="padding:44px;text-align:center;color:var(--panel-dim)">
        ${typeof icon === 'function' ? icon('package', 28) : ''}
        <div style="margin:10px 0 4px;font-weight:600;color:var(--panel-text,#0F172A)">Καμία κίνηση εδώ</div>
        <div style="font-size:12px">Δοκίμασε άλλο tab ή καθάρισε αναζήτηση/ημερομηνίες.</div>
        <button class="btn-new-order" style="margin-top:14px" onclick="plvNewMovement()">+ Νέα κίνηση</button>
      </td></tr>`;

const _PLV_HEAD_G = `<tr style="text-align:left;color:var(--panel-dim)">
        <th>Κωδ.</th><th>Ημ/νία</th><th>Είδος</th>
        <th style="text-align:right">Πήραμε</th><th style="text-align:right">Δώσαμε</th>
        <th>Reference</th><th>Μεταφορικό</th><th title="Δελτίο">📎</th><th>Κατάσταση</th><th></th></tr>`;
// Ίδια πλάτη σε ΟΛΑ τα τμήματα ώστε οι στήλες να ευθυγραμμίζονται μεταξύ ομάδων.
const _PLV_COLS_G = `<colgroup><col style="width:8%"><col style="width:7%"><col style="width:9%"><col style="width:6%"><col style="width:6%"><col style="width:11%"><col style="width:16%"><col style="width:4%"><col style="width:11%"><col style="width:22%"></colgroup>`;

function _plvTableHtml(rows) {
  return `
    <div style="overflow-x:auto">
    <table class="plv-tbl" style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="text-align:left;color:var(--panel-dim)">
        <th>Κωδ.</th><th>Ημ/νία</th><th>Είδος</th><th>Αντισυμβαλλόμενος</th><th>Σημείο</th>
        <th style="text-align:right">Πήραμε</th><th style="text-align:right">Δώσαμε</th>
        <th>Reference</th><th>Μεταφορικό</th><th title="Δελτίο">📎</th><th>Κατάσταση</th><th></th>
      </tr>
      ${rows.map(m => _plvMovementRow(m, false)).join('') || _PLV_EMPTY(12)}
    </table>
    </div>`;
}

// Ομάδες από τις ΦΙΛΤΡΑΡΙΣΜΕΝΕΣ γραμμές: πελάτες πρώτα (κατά πλήθος), μετά
// «Συνεργάτες» (υπο-ομάδα ανά partner) και «Χωρίς αντισυμβαλλόμενο» — πάντα
// ορατές στο τέλος, ποτέ κρυμμένες.
function _plvBuildGroups(rows) {
  const mode = PLV.groupBy;
  const tops = new Map();
  rows.forEach(m => {
    let t, s;
    if (mode === 'location') {
      t = { k: 'L' + (m.location_id || 0), label: _plvLoc(m) || 'Χωρίς σημείο', order: m.location_id ? 0 : 1 };
      s = { k: 'c' + (m.counterparty_type || '') + (m.client_id || m.partner_id || 0), label: _plvName(m) };
    } else if (m.counterparty_type === 'CLIENT' && m.client_id) {
      t = { k: 'C' + m.client_id, label: _plvName(m), order: 0 };
      s = { k: 'l' + (m.location_id || 0), label: _plvLoc(m) || 'Χωρίς σημείο' };
    } else if (m.counterparty_type === 'PARTNER') {
      t = { k: '_PARTNERS', label: 'Συνεργάτες', order: 1 };
      s = { k: 'p' + (m.partner_id || 0), label: _plvName(m) };
    } else {
      t = { k: '_NONE', label: 'Χωρίς αντισυμβαλλόμενο', order: 2 };
      s = { k: 'x', label: '—' };
    }
    if (!tops.has(t.k)) tops.set(t.k, { key: t.k, label: t.label, order: t.order, subs: new Map(), count: 0, tk: 0, gv: 0 });
    const T = tops.get(t.k);
    T.count++; T.tk += m.taken || 0; T.gv += m.given || 0;
    if (!T.subs.has(s.k)) T.subs.set(s.k, { key: s.k, label: s.label, rows: [], tk: 0, gv: 0 });
    const S = T.subs.get(s.k);
    S.rows.push(m); S.tk += m.taken || 0; S.gv += m.given || 0;
  });
  return Array.from(tops.values())
    .sort((a, b) => a.order - b.order || b.count - a.count || String(a.label).localeCompare(b.label))
    .map(T => ({ ...T, subs: Array.from(T.subs.values()).sort((a, b) => b.rows.length - a.rows.length) }));
}

// Υπόλοιπο πελάτη από ΟΛΕΣ τις φορτωμένες κινήσεις του (όχι τις φιλτραρισμένες)
// — ίδιος τύπος με το pl_v_balance_clients: Σ(given−taken) ΜΟΝΟ confirmed.
function _plvClientBal(clientId) {
  let s = 0;
  PLV.movements.forEach(m => {
    if (m.client_id === clientId && m.counterparty_type === 'CLIENT' && m.status === 'confirmed') s += (m.given || 0) - (m.taken || 0);
  });
  return s;
}

// Δίπλωμα: προεπιλογή κλειστά εκτός αν ομάδες ≤3· ενεργή αναζήτηση = όλα
// ανοιχτά (οι ομάδες χωρίς αποτέλεσμα λείπουν ήδη — χτίζονται από τα rows).
function _plvIsOpen(key, groupsLen) {
  if (PLV.q) return true;
  if (PLV.open[key] !== undefined) return PLV.open[key];
  return groupsLen <= 3;
}

function plvToggleGroup(key) {
  const groups = _plvBuildGroups(_plvRows());
  PLV.open[key] = !_plvIsOpen(key, groups.length);
  const el = document.getElementById('plvTbl');
  if (el) el.innerHTML = _plvListHtml(_plvRows());
}

function plvGroupBy(mode) {
  PLV.groupBy = mode;
  PLV.open = {}; // νέα δομή, νέες προεπιλογές διπλώματος
  _plvDraw();
}

function _plvListHtml(rows) {
  if (PLV.groupBy === 'none' || !rows.length) return _plvTableHtml(rows);
  const groups = _plvBuildGroups(rows);
  const arrow = (o) => `<span style="display:inline-block;width:14px;color:var(--panel-dim)">${o ? '▾' : '▸'}</span>`;
  let html = '<div>';
  groups.forEach(T => {
    const o = _plvIsOpen(T.key, groups.length);
    let balHtml = '';
    if (T.key[0] === 'C') {
      const cid = parseInt(T.key.slice(1), 10);
      const bal = _plvClientBal(cid);
      const vb = (PLV.balances.clients || []).find(b => b.client_id === cid);
      // Αν το τοπικό άθροισμα αποκλίνει από την όψη, το ⚠ το ΔΕΙΧΝΕΙ αντί να
      // διαλέξει σιωπηλά πλευρά (αρχή 1) — δύο πηγές αλήθειας = καμία.
      const mismatch = vb && vb.balance !== bal;
      balHtml = ` · υπόλοιπο <b style="color:${bal > 0 ? '#15803D' : bal < 0 ? '#B91C1C' : 'inherit'}">${bal > 0 ? '+' : ''}${bal}</b>${mismatch ? ` <span title="Απόκλιση από την όψη pl_v_balance_clients: όψη=${vb.balance}, υπολογισμένο=${bal}" style="color:#B91C1C;cursor:help">⚠</span>` : ''}`;
    }
    html += `<div class="plv-ghead" onclick="plvToggleGroup('${T.key}')">${arrow(o)}<span class="plv-gname">${T.label}</span>
      <span class="plv-gsum">${T.count} ${T.count === 1 ? 'κίνηση' : 'κινήσεις'} · <span style="color:#15803D">↓ ${T.tk}</span> · <span style="color:#B91C1C">↑ ${T.gv}</span>${balHtml}</span></div>`;
    if (o) {
      T.subs.forEach(S => {
        html += `<div class="plv-gsub">${S.label}<span style="font-weight:400;color:var(--panel-dim)"> — ${S.rows.length} · <span style="color:#15803D">↓ ${S.tk}</span> · <span style="color:#B91C1C">↑ ${S.gv}</span></span></div>
        <div style="overflow-x:auto"><table class="plv-tbl" style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed">${_PLV_COLS_G}
          ${S.rows.map(m => _plvMovementRow(m, true)).join('')}
        </table></div>`;
      });
    }
  });
  return html + '</div>';
}

// Ισοπεδωμένη σειρά εμφάνισης — Η ουρά του wizard: περιλαμβάνει ΚΑΙ τις
// κινήσεις κλειστών ομάδων (δεν εξαφανίζονται επειδή δεν φαίνονται).
function _plvFlatRows() {
  const rows = _plvRows();
  if (PLV.groupBy === 'none') return rows;
  const out = [];
  _plvBuildGroups(rows).forEach(T => T.subs.forEach(S => S.rows.forEach(m => out.push(m))));
  return out;
}

function plvTab(t) { PLV.tab = t; _plvDraw(); }

/* ── Καρτέλα αντισυμβαλλόμενου (2.3): κίνηση λογαριασμού με τρεχούμενο ──
   Όψη-statement σε πλήρη σελίδα, όχι modal: η accountant τη δουλεύει σαν
   καρτέλα. Το τρεχούμενο υπολογίζεται client-side ΜΟΝΟ από τις confirmed
   (ίδιος τύπος με την όψη: Σ(given−taken))· οι pending φαίνονται στη ροή
   αλλά ΔΕΝ μετρούν — σημασμένες με pill και «—» στο τρεχούμενο. */
async function plvDrill(kind, id) {
  const nameKey = kind === 'clients' ? 'client_name' : 'partner_name';
  const idKey = kind === 'clients' ? 'client_id' : 'partner_id';
  const bal = (PLV.balances[kind] || []).find(b => b[idKey] === id);
  const c = document.getElementById('content');
  c.innerHTML = '<div style="text-align:center;padding:60px;color:var(--panel-dim)">Φόρτωση καρτέλας...</div>';
  try {
    const q = kind === 'clients' ? 'client_id=' + id : 'partner_id=' + id;
    const [hist, locs] = await Promise.all([
      plFetch('/pallets/movements?' + q),
      kind === 'clients' ? plFetch('/pallets/balances/clients/' + id) : Promise.resolve({ records: [] })
    ]);
    // Χρονολογικά ΑΥΞΟΝΤΑ — μια κίνηση λογαριασμού διαβάζεται από πάνω προς
    // τα κάτω· το endpoint γυρίζει φθίνοντα για τη λίστα.
    const moves = (hist.records || []).filter(m => m.status !== 'reversed')
      .sort((a, b) => a.movement_date === b.movement_date ? a.id - b.id : (a.movement_date < b.movement_date ? -1 : 1));
    let run = 0;
    const rows = moves.map(m => {
      const isC = m.status === 'confirmed';
      if (isC) run += (m.given || 0) - (m.taken || 0);
      return { m, run: isC ? run : null };
    });
    const pendCnt = moves.filter(m => m.status === 'pending').length;
    const name = bal ? bal[nameKey] : (moves.length ? _plvName(moves[0]) : '#' + id);
    PLV._stmt = { kind, id, name, rows };
    const locRows = (locs.records || []).filter(l => l.balance !== 0);
    c.innerHTML = `
    <div style="padding:20px 24px;max-width:1100px;margin:0 auto">
      <style>.plv-tbl th,.plv-tbl td{padding:8px 12px}.plv-tbl th{white-space:nowrap}
        .plv-pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11.5px;font-weight:600;white-space:nowrap}
        .plv-pill-pending{background:#FEF3C7;color:#92400E}.plv-pill-ok{background:#DCFCE7;color:#15803D}.plv-pill-rev{background:#E2E8F0;color:#475569}</style>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:12px">
          <button class="btn-scan" onclick="_plvDraw()">← Επιστροφή</button>
          <h1 style="font-family:Syne;font-size:20px;margin:0">${name}</h1>
        </div>
        <button class="btn-scan" onclick="plvStmtCSV()">Export CSV καρτέλας</button>
      </div>
      <div style="font-size:13px;color:var(--panel-dim);margin:10px 0 18px">
        Υπόλοιπο <b style="color:${bal && bal.balance > 0 ? '#15803D' : bal && bal.balance < 0 ? '#B91C1C' : 'inherit'}">${bal ? (bal.balance > 0 ? '+' : '') + bal.balance : '0'} pal</b>
        · ${pendCnt} εκκρεμείς (εκτός τρεχούμενου)
      </div>
      ${locRows.length ? `<div style="font-size:12px;font-weight:700;color:var(--panel-dim);margin-bottom:6px">ΑΝΑ ΣΗΜΕΙΟ</div>
      <table class="plv-tbl" style="width:auto;min-width:280px;border-collapse:collapse;font-size:13px;margin-bottom:18px">
        ${locRows.map(l => `<tr style="border-top:1px solid var(--line,#e2e8f0)"><td>${l.location_name || '—'}</td>
        <td style="text-align:right;font-weight:700;color:${l.balance > 0 ? '#15803D' : '#B91C1C'}">${l.balance > 0 ? '+' : ''}${l.balance}</td></tr>`).join('')}
      </table>` : ''}
      <div style="overflow-x:auto">
      <table class="plv-tbl" style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="text-align:left;color:var(--panel-dim)"><th>Ημ/νία</th><th>Κωδ.</th><th>Είδος</th><th>Σημείο</th>
          <th style="text-align:right">Πήραμε</th><th style="text-align:right">Δώσαμε</th><th>Κατάσταση</th>
          <th style="text-align:right">Τρεχούμενο</th></tr>
        ${rows.map(({ m, run }) => `<tr style="border-top:1px solid var(--line,#e2e8f0)${m.status === 'pending' ? ';opacity:.75' : ''}">
          <td style="white-space:nowrap">${_plvFmtDate(m.movement_date)}</td>
          <td>${m.code}</td>
          <td>${PLV_EVENT_GR[m.event_type] || m.event_type}</td>
          <td>${_plvLoc(m)}</td>
          <td style="text-align:right">${_plvQty(m.taken, 'in')}</td>
          <td style="text-align:right">${_plvQty(m.given, 'out')}</td>
          <td>${_plvPill(m.status)}</td>
          <td style="text-align:right;font-weight:700">${run == null ? '<span style="opacity:.4">—</span>' : (run > 0 ? '+' : '') + run}</td>
        </tr>`).join('') || '<tr><td colspan="8" style="padding:30px;text-align:center;color:var(--panel-dim)">Καμία κίνηση</td></tr>'}
      </table>
      </div>
    </div>`;
  } catch (e) {
    showErrorToast('Αποτυχία καρτέλας: ' + e.message, 'error');
    _plvDraw();
  }
}

function plvStmtCSV() {
  const s = PLV._stmt;
  if (!s || !s.rows.length) { toast('Κενή καρτέλα — τίποτα για εξαγωγή', 'error'); return; }
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['Ημερομηνία', 'Κωδικός', 'Είδος', 'Σημείο', 'Πήραμε', 'Δώσαμε', 'Κατάσταση', 'Τρεχούμενο'];
  const body = s.rows.map(({ m, run }) => [m.movement_date, m.code,
    PLV_EVENT_GR[m.event_type] || m.event_type, _plvLoc(m), m.taken, m.given,
    m.status, run == null ? '' : run].map(esc).join(','));
  const blob = new Blob(['﻿' + [head.map(esc).join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kartela-' + String(s.name).replace(/[^A-Za-z0-9Α-Ωα-ω_-]+/g, '_').slice(0, 40) + '-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click(); URL.revokeObjectURL(a.href);
  toast('CSV καρτέλας εξήχθη ✓');
}

/* ── Modal επιβεβαίωσης εκκρεμούς ── */
function plvOpenConfirm(id, inWiz) {
  const m = PLV.movements.find(x => x.id === id);
  if (!m) return;
  // Wizard ξεκαθαρίσματος (2.1): το άνοιγμα από τη λίστα χτίζει ουρά με την
  // ΤΡΕΧΟΥΣΑ ταξινόμηση/φίλτρα, ώστε η επιτυχής επιβεβαίωση να προχωρά μόνη
  // της στην επόμενη pending. Κάθε κίνηση κρατά τον ΔΙΚΟ της κύκλο δελτίου —
  // δεν υπάρχει μαζική επιβεβαίωση: η πύλη έμεινε αυστηρή (owner 24/8).
  if (!inWiz && m.status === 'pending') {
    // Ισοπεδωμένη ΣΕΙΡΑ ΕΜΦΑΝΙΣΗΣ των ομάδων — και οι κλειστές ομάδες μέσα:
    // η ουρά δεν χάνει κινήσεις επειδή δεν φαίνονται (§5 redesign).
    PLV.wizQueue = _plvFlatRows().filter(x => x.status === 'pending').map(x => x.id);
  }
  const q = m.status === 'pending' ? (PLV.wizQueue || []) : [];
  const pos = q.indexOf(id);
  const counter = q.length > 1 && pos >= 0
    ? ` <span style="font-size:12px;color:var(--panel-dim);font-weight:400">· ${pos + 1} από ${q.length}</span>` : '';
  // Ο κανόνας του Worker (taken+given>0, εκτός ADJUSTMENT) εφαρμόζεται ΚΑΙ εδώ:
  // η υποβολή κλειδώνει όσο 0/0 και εξηγεί, αντί να επιστρέφει 400 μετά (αρχή 1).
  const needsQty = m.event_type !== 'ADJUSTMENT';
  const zero = needsQty && m.taken + m.given === 0;
  document.getElementById('plvModal').innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(11,25,41,.55);display:flex;align-items:center;justify-content:center;z-index:1000" onclick="if(event.target===this)plvWizClose()">
    <div style="background:var(--panel,#fff);color:var(--panel-text,#0F172A);border-radius:12px;padding:24px;width:min(440px,92vw)">
      <h3 style="font-family:Syne;margin:0 0 6px">Επιβεβαίωση — ${m.code}${counter}</h3>
      <div style="font-size:13px;color:var(--panel-dim);margin-bottom:14px">${PLV_EVENT_GR[m.event_type]} · ${_plvName(m)}</div>
      <label style="font-size:13px">Πήραμε (παλέτες)<input id="plvTaken" type="number" min="0" value="${m.taken}" ${needsQty ? 'oninput="plvZeroCheck()"' : ''} style="width:100%;padding:10px;margin:4px 0 12px;font-size:16px"></label>
      <label style="font-size:13px">Δώσαμε (παλέτες)<input id="plvGiven" type="number" min="0" value="${m.given}" ${needsQty ? 'oninput="plvZeroCheck()"' : ''} style="width:100%;padding:10px;margin:4px 0 12px;font-size:16px"></label>
      <div id="plvZeroNote" style="display:${zero ? 'block' : 'none'};font-size:12px;color:#92400E;margin:0 0 12px">Μηδενικές ποσότητες — χρειάζεται διόρθωση: συμπλήρωσε πόσες παλέτες πήραμε ή δώσαμε για να ενεργοποιηθεί η επιβεβαίωση.</div>
      <label style="font-size:13px">Δελτίο (φωτο/PDF — προαιρετικό)<input id="plvFile" type="file" accept="image/*,.pdf" style="width:100%;margin:4px 0 14px"></label>
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn-scan" onclick="plvWizClose()">Κλείσιμο</button>
        ${q.length > 1 && pos >= 0 ? `<button class="btn-scan" onclick="plvWizAdvance(${m.id})" title="Προσπέρασε χωρίς επιβεβαίωση">Παράλειψη →</button>` : ''}
        <button id="plvConfirmGo" class="btn-new-order" ${zero ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''} onclick="plvDoConfirm(${m.id})">Επιβεβαίωση κίνησης</button>
      </div>
    </div>
  </div>`;
  document.addEventListener('keydown', _plvEsc);
}

// Escape κλείνει modal/πάνελ/wizard από παντού.
function _plvEsc(e) { if (e.key === 'Escape') plvWizClose(); }
function plvWizClose() { PLV.wizQueue = null; plvCloseModal(); }

// Επόμενη pending της ουράς μετά την afterId — φρέσκια κατάσταση, όχι η
// στιγμιαία: ό,τι επιβεβαιώθηκε/διαγράφηκε στο μεταξύ προσπερνιέται.
function plvWizAdvance(afterId) {
  const q = PLV.wizQueue || [];
  const i = q.indexOf(afterId);
  for (let k = i + 1; k < q.length; k++) {
    const m = PLV.movements.find(x => x.id === q[k]);
    if (m && m.status === 'pending') { plvOpenConfirm(q[k], true); return; }
  }
  PLV.wizQueue = null;
  plvCloseModal();
  toast('Τέλος της λίστας εκκρεμών ✓');
  renderPalletLedger();
}

// Ζωντανή εναλλαγή του κλειδώματος: το κουμπί ανάβει μόλις μπει ποσότητα.
function plvZeroCheck() {
  const t = parseInt((document.getElementById('plvTaken') || {}).value, 10) || 0;
  const g = parseInt((document.getElementById('plvGiven') || {}).value, 10) || 0;
  const btn = document.getElementById('plvConfirmGo');
  const note = document.getElementById('plvZeroNote');
  if (!btn) return;
  const zero = t + g === 0;
  btn.disabled = zero;
  btn.style.opacity = zero ? '.5' : '';
  btn.style.cursor = zero ? 'not-allowed' : '';
  if (note) note.style.display = zero ? 'block' : 'none';
}
function plvCloseModal() {
  document.getElementById('plvModal').innerHTML = '';
  document.removeEventListener('keydown', _plvEsc);
}

async function _plvUploadIfAny() {
  const fi = document.getElementById('plvFile');
  if (!fi || !fi.files || !fi.files[0]) return null;
  const file = fi.files[0];
  const b64 = await new Promise((ok, err) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = err; r.readAsDataURL(file);
  });
  const res = await plFetch('/pallets/sheets', { method: 'POST', body: { filename: file.name, content_base64: b64 } });
  return res.path;
}

async function plvDoConfirm(id) {
  if (PLV.busy) return; PLV.busy = true;
  try {
    const taken = parseInt(document.getElementById('plvTaken').value, 10) || 0;
    const given = parseInt(document.getElementById('plvGiven').value, 10) || 0;
    // Δίχτυ κάτω από το disabled κουμπί (π.χ. αν το DOM πειραχτεί): ο ίδιος
    // κανόνας με τον Worker, με μήνυμα στα ελληνικά αντί για γυμνό 400.
    const m = PLV.movements.find(x => x.id === id);
    if (m && m.event_type !== 'ADJUSTMENT' && taken + given === 0) {
      showErrorToast('Μηδενικές ποσότητες — συμπλήρωσε πόσες παλέτες πήραμε ή δώσαμε', 'error');
      return;
    }
    const path = await _plvUploadIfAny();
    const patch = { taken, given, sheet_source: path ? 'UPLOAD' : 'MANUAL' };
    if (path) patch.sheet_url = path;
    await plFetch('/pallets/movements/' + id, { method: 'PATCH', body: patch });
    await plFetch('/pallets/movements/' + id + '/confirm', { method: 'POST' });
    toast('Κίνηση επιβεβαιώθηκε ✓');
    if (PLV.wizQueue && PLV.wizQueue.length > 1) {
      // Wizard: ελαφρύ refresh μόνο της λίστας και αμέσως η επόμενη — τα
      // ισοζύγια ξαναφορτώνονται μία φορά, στο τέλος της ουράς.
      const mv = await plFetch('/pallets/movements');
      PLV.movements = mv.records || [];
      plvWizAdvance(id);
    } else {
      plvCloseModal(); await renderPalletLedger();
    }
  } catch (e) { showErrorToast('Αποτυχία επιβεβαίωσης: ' + e.message, 'error'); }
  // Σε αποτυχία: το μήνυμα του Worker εμφανίζεται, το modal ΜΕΝΕΙ στην
  // τρέχουσα κίνηση — ο wizard δεν προσπερνά ποτέ σιωπηλά (αρχή 1).
  finally { PLV.busy = false; }
}

/* ── Πλαϊνό πάνελ κίνησης (2.2): όλη η ταυτότητα σε ένα slide-in ── */
function plvOpenPanel(id) {
  const m = PLV.movements.find(x => x.id === id);
  if (!m) return;
  const row = (lbl, val) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line,#eef2f7);font-size:13px">
    <span style="color:var(--panel-dim);white-space:nowrap">${lbl}</span><span style="text-align:right">${val}</span></div>`;
  // Η καταγωγή δείχνεται με τα pg ids που κουβαλά η κίνηση — αρκούν για
  // αναζήτηση, χωρίς νέο endpoint (πεδίο εργασίας: μόνο front end).
  const src = m.order_id
    ? `Παραγγελία #${m.order_id}${m.order_stop_id ? ' · Στάση #' + m.order_stop_id : ''}`
    : (m.cons_load_id ? 'Δρομολόγιο #' + m.cons_load_id : 'Χειροκίνητη');
  const sheet = m.sheet_url
    ? `<a href="#" onclick="plvViewSheet('${String(m.sheet_url).replace(/'/g, '')}');return false">Προβολή δελτίου</a>`
    : (m.sheet_source === 'MANUAL' ? 'MANUAL (χωρίς αρχείο)' : '—');
  const actions = m.status === 'pending' ? `
      <button class="btn-new-order" style="width:100%;margin-bottom:8px" onclick="plvCloseModal();plvOpenConfirm(${m.id})">${m.taken + m.given === 0 && m.event_type !== 'ADJUSTMENT' ? 'Διόρθωση ποσοτήτων' : 'Επιβεβαίωση'}</button>
      <button class="btn-scan" style="width:100%;border-color:#B91C1C;color:#B91C1C" onclick="plvPanelDelete(${m.id})">Διαγραφή εκκρεμούς</button>`
    : m.status === 'confirmed' && m.event_type === 'DELIVERY' ? `
      <button class="btn-scan" style="width:100%" onclick="plvCloseModal();plvFixDelivery(${m.id})">Διόρθωση ανταλλαγής</button>`
    : m.status === 'confirmed' ? `
      <div style="font-size:12px;color:var(--panel-dim);margin-bottom:6px">Οι οριστικές δεν σβήνονται — μόνο αντιλογισμός, με αιτιολογία:</div>
      <input id="plvRevReason" type="text" placeholder="Αιτιολογία αντιλογισμού" style="width:100%;padding:9px;margin-bottom:8px;font-size:13px">
      <button class="btn-scan" style="width:100%" onclick="plvPanelReverse(${m.id})">Αντιλογισμός</button>`
    : '';
  document.getElementById('plvModal').innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(11,25,41,.35);z-index:1000" onclick="if(event.target===this)plvCloseModal()">
    <div style="position:absolute;top:0;right:0;bottom:0;width:min(400px,94vw);background:var(--panel,#fff);color:var(--panel-text,#0F172A);box-shadow:-12px 0 32px rgba(11,25,41,.25);padding:22px;overflow:auto">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-family:Syne;margin:0">${m.code}</h3>
        <span style="cursor:pointer;font-size:22px;line-height:1;color:var(--panel-dim)" onclick="plvCloseModal()" title="Κλείσιμο (Esc)">×</span>
      </div>
      <div style="margin:8px 0 14px">${_plvPill(m.status)}</div>
      ${row('Είδος', PLV_EVENT_GR[m.event_type] || m.event_type)}
      ${row('Αντισυμβαλλόμενος', _plvName(m))}
      ${row('Σημείο', _plvLoc(m) || '—')}
      ${row('Ημερομηνία', _plvFmtDate(m.movement_date))}
      ${row('Πήραμε', _plvQty(m.taken, 'in'))}
      ${row('Δώσαμε', _plvQty(m.given, 'out'))}
      ${row('Πηγή', src)}
      ${row('Δελτίο', sheet)}
      ${row('Δημιουργία', `${m.created_by || '—'}${m.created_at ? ' · ' + _plvFmtDate(m.created_at) : ''}`)}
      ${m.confirmed_by ? row('Επιβεβαίωση', `${m.confirmed_by}${m.confirmed_at ? ' · ' + _plvFmtDate(m.confirmed_at) : ''}`) : ''}
      ${m.reason ? row('Αιτιολογία', escapeHtml(m.reason)) : ''}
      ${m.notes ? row('Σημείωση', escapeHtml(m.notes)) : ''}
      <div style="margin-top:18px">${actions}</div>
    </div>
  </div>`;
  document.addEventListener('keydown', _plvEsc);
}

async function plvPanelDelete(id) {
  if (!confirm('Διαγραφή της εκκρεμούς κίνησης; Οι οριστικές δεν σβήνονται ποτέ.')) return;
  try {
    await plFetch('/pallets/movements/' + id, { method: 'DELETE' });
    toast('Η εκκρεμής διαγράφηκε ✓');
    plvCloseModal(); await renderPalletLedger();
  } catch (e) { showErrorToast('Αποτυχία διαγραφής: ' + e.message, 'error'); }
}

async function plvPanelReverse(id) {
  const reason = ((document.getElementById('plvRevReason') || {}).value || '').trim();
  if (!reason) { showErrorToast('Γράψε αιτιολογία για τον αντιλογισμό', 'error'); return; }
  try {
    await plFetch('/pallets/movements/' + id + '/reverse', { method: 'POST', body: { reason } });
    toast('Αντιλογίστηκε ✓');
    plvCloseModal(); await renderPalletLedger();
  } catch (e) { showErrorToast('Αποτυχία αντιλογισμού: ' + e.message, 'error'); }
}

/* ── Διόρθωση ανταλλαγής (σενάριο Lidl): reverse + σωστό replacement ── */
function plvFixDelivery(id) {
  const m = PLV.movements.find(x => x.id === id);
  if (!m) return;
  document.getElementById('plvModal').innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(11,25,41,.55);display:flex;align-items:center;justify-content:center;z-index:1000" onclick="if(event.target===this)plvCloseModal()">
    <div style="background:var(--panel,#fff);color:var(--panel-text,#0F172A);border-radius:12px;padding:24px;width:min(440px,92vw)">
      <h3 style="font-family:Syne;margin:0 0 6px">Διόρθωση ανταλλαγής — ${m.code}</h3>
      <div style="font-size:13px;color:var(--panel-dim);margin-bottom:14px">Δώσαμε ${m.given} γεμάτες. Πόσες άδειες πήραμε ΠΡΑΓΜΑΤΙΚΑ;</div>
      <label style="font-size:13px">Πήραμε (πραγματικά)<input id="plvRealTaken" type="number" min="0" value="0" style="width:100%;padding:10px;margin:4px 0 12px;font-size:16px"></label>
      <label style="font-size:13px">Σημείωση (τι έγινε)<input id="plvFixNote" type="text" placeholder="π.χ. Lidl — δεν είχαν άδειες" style="width:100%;padding:10px;margin:4px 0 14px"></label>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-scan" onclick="plvCloseModal()">Άκυρο</button>
        <button class="btn-new-order" onclick="plvDoFix(${m.id})">Καταχώρηση διόρθωσης</button>
      </div>
    </div>
  </div>`;
}

async function plvDoFix(id) {
  if (PLV.busy) return; PLV.busy = true;
  try {
    const m = PLV.movements.find(x => x.id === id);
    const realTaken = parseInt(document.getElementById('plvRealTaken').value, 10) || 0;
    const note = document.getElementById('plvFixNote').value || '';
    const res = await plFetch('/pallets/movements/' + id + '/reverse', { method: 'POST', body: {
      reason: 'Διόρθωση ανταλλαγής παράδοσης' + (note ? ' — ' + note : ''),
      replacement: {
        movement_date: m.movement_date, counterparty_type: m.counterparty_type,
        client_id: m.client_id, partner_id: m.partner_id, location_id: m.location_id,
        event_type: 'DELIVERY', taken: realTaken, given: m.given,
        order_stop_id: m.order_stop_id, order_id: m.order_id, notes: note
      }
    }});
    if (res.replacement) await plFetch('/pallets/movements/' + res.replacement.id + '/confirm', { method: 'POST' });
    toast('Διόρθωση καταχωρήθηκε ✓');
    plvCloseModal(); await renderPalletLedger();
  } catch (e) { showErrorToast('Αποτυχία διόρθωσης: ' + e.message, 'error'); }
  finally { PLV.busy = false; }
}

/* ── Typeahead αντισυμβαλλόμενου/σημείου ──
   Το select δεν χωρούσε 1.921 πελάτες — και δεν τους έδειχνε ποτέ όλους ούτως
   ή άλλως: η PostgREST κόβει στα 1000 και το active=true αφήνει 1.821 (12/8).
   Ο χρήστης πληκτρολογεί, ο server γυρίζει 20. */
// Timer ΑΝΑ πεδίο, όχι κοινό: με κοινό, όποιος πληκτρολογούσε στον
// αντισυμβαλλόμενο και περνούσε στο σημείο μέσα σε 250ms ακύρωνε την πρώτη
// αναζήτηση και έμενε με άδεια λίστα δίπλα σε γεμάτο πεδίο.
const PLV_AC = { rows: {}, timers: {} };

function plvAcSearch(field, type) {
  clearTimeout(PLV_AC.timers[field]);
  const inp = document.getElementById('plvAcQ_' + field);
  const hid = document.getElementById(field);
  const box = document.getElementById('plvAcList_' + field);
  // Κάθε πληκτρολόγηση ακυρώνει την προηγούμενη επιλογή: αλλιώς ο χρήστης
  // σβήνει το όνομα, βλέπει άδειο πεδίο και υποβάλλει τον παλιό πελάτη.
  hid.value = '';
  const q = inp.value.trim();
  if (q.length < 2) { box.style.display = 'none'; return; }
  PLV_AC.timers[field] = setTimeout(async () => {
    let rows;
    try {
      const r = await plFetch('/pallets/lookups/search?type=' + type + '&q=' + encodeURIComponent(q));
      rows = r.records || [];
    } catch (e) {
      // Σιωπηλή άδεια λίστα θα διαβαζόταν ως «δεν υπάρχει τέτοιος πελάτης» και
      // η λογίστρια θα άνοιγε διπλοεγγραφή.
      box.innerHTML = '<div style="color:var(--danger,#B91C1C)">Σφάλμα αναζήτησης: ' + escapeHtml(e.message) + '</div>';
      box.style.display = 'block';
      return;
    }
    PLV_AC.rows[field] = rows;
    box.innerHTML = rows.length
      ? rows.map((r, i) => `<div onmousedown="plvAcPick('${field}',${i})">${escapeHtml(r.name || '')}` +
          (r.kind === 'P' ? ' <span style="opacity:.55">· partner</span>' : '') + '</div>').join('')
      : '<div style="opacity:.6">Καμία εγγραφή</div>';
    box.style.display = 'block';
  }, 250);
}

// onmousedown και όχι onclick: το blur του input προλαβαίνει το click και
// κρύβει τη λίστα πριν καταγραφεί η επιλογή.
function plvAcPick(field, idx) {
  const r = (PLV_AC.rows[field] || [])[idx];
  if (!r) return;
  document.getElementById(field).value = r.kind === 'L' ? String(r.id) : r.kind + ':' + r.id;
  document.getElementById('plvAcQ_' + field).value = r.name;
  document.getElementById('plvAcList_' + field).style.display = 'none';
}

function plvAcBlur(field) {
  setTimeout(() => {
    const b = document.getElementById('plvAcList_' + field);
    if (b) b.style.display = 'none';
  }, 150);
}

/* ── Νέα χειροκίνητη κίνηση ── */
function plvNewMovement() {
  PLV_AC.rows = {};
  document.getElementById('plvModal').innerHTML = `
  <style>
    /* --panel-text, ΟΧΙ κληρονομιά: το --panel (#0F172A) τυχαίνει να έχει την
       ίδια τιμή με το --text, οπότε χωρίς ρητό χρώμα η λίστα βγαίνει σκούρο
       πάνω σε σκούρο — κενά κουτιά (πιάστηκε live 12/8, βλ. style.css:88). */
    .plv-ac{position:absolute;left:0;right:0;top:44px;z-index:20;background:var(--panel,#fff);
      color:var(--panel-text,#0F172A);border:1px solid var(--panel-border,#e2e8f0);
      border-radius:8px;max-height:210px;overflow:auto;box-shadow:0 8px 24px rgba(11,25,41,.16)}
    .plv-ac>div{padding:9px 12px;font-size:13px;cursor:pointer}
    .plv-ac>div:hover{background:var(--panel-border,#F4F6F9)}
  </style>
  <div style="position:fixed;inset:0;background:rgba(11,25,41,.55);display:flex;align-items:center;justify-content:center;z-index:1000" onclick="if(event.target===this)plvCloseModal()">
    <!-- color ρητά: το --panel (#0F172A) τυχαίνει να ισούται με το --text, οπότε
         χωρίς αυτό οι ετικέτες βγαίνουν σκούρο σε σκούρο — αόρατες (style.css:88). -->
    <div style="background:var(--panel,#fff);color:var(--panel-text,#0F172A);border-radius:12px;padding:24px;width:min(460px,92vw);max-height:90vh;overflow:auto">
      <h3 style="font-family:Syne;margin:0 0 14px">Νέα κίνηση παλετών</h3>
      <label style="font-size:13px">Είδος<select id="plvNmType" style="width:100%;padding:10px;margin:4px 0 12px">
        <option value="RETURN_OUT">Επιστροφή αδειών (δίνουμε)</option>
        <option value="RETURN_IN">Παραλαβή αδειών (παίρνουμε)</option>
        <option value="PARTNER_PICKUP">Partner πήρε από εμάς</option>
        <option value="PARTNER_DROPOFF">Partner μάς έφερε</option>
        <option value="ADJUSTMENT">Τακτοποίηση/διαγραφή οφειλής (μόνο owner)</option>
      </select></label>
      <label style="font-size:13px">Αιτιολογία (υποχρεωτική για τακτοποίηση)<input id="plvNmReason" type="text" style="width:100%;padding:10px;margin:4px 0 12px"></label>
      <label style="font-size:13px">Αντισυμβαλλόμενος
        <div style="position:relative">
          <input id="plvAcQ_plvNmParty" type="text" autocomplete="off" placeholder="Πελάτης ή partner — 2+ γράμματα"
            oninput="plvAcSearch('plvNmParty','party')" onblur="plvAcBlur('plvNmParty')"
            style="width:100%;padding:10px;margin:4px 0 12px">
          <input type="hidden" id="plvNmParty" value="">
          <div class="plv-ac" id="plvAcList_plvNmParty" style="display:none"></div>
        </div>
      </label>
      <label style="font-size:13px">Σημείο (προαιρετικό)
        <div style="position:relative">
          <input id="plvAcQ_plvNmLoc" type="text" autocomplete="off" placeholder="Τοποθεσία — 2+ γράμματα"
            oninput="plvAcSearch('plvNmLoc','locations')" onblur="plvAcBlur('plvNmLoc')"
            style="width:100%;padding:10px;margin:4px 0 12px">
          <input type="hidden" id="plvNmLoc" value="">
          <div class="plv-ac" id="plvAcList_plvNmLoc" style="display:none"></div>
        </div>
      </label>
      <label style="font-size:13px">Ημερομηνία<input id="plvNmDate" type="date" value="${new Date().toISOString().slice(0, 10)}" min="2020-01-01" max="2030-12-31" style="width:100%;padding:10px;margin:4px 0 12px"></label>
      <div style="display:flex;gap:10px">
        <label style="font-size:13px;flex:1">Πήραμε<input id="plvNmTaken" type="number" min="0" value="0" style="width:100%;padding:10px;margin:4px 0 12px"></label>
        <label style="font-size:13px;flex:1">Δώσαμε<input id="plvNmGiven" type="number" min="0" value="0" style="width:100%;padding:10px;margin:4px 0 12px"></label>
      </div>
      <label style="font-size:13px">Δελτίο (φωτο/PDF — προαιρετικό)<input id="plvFile" type="file" accept="image/*,.pdf" style="width:100%;margin:4px 0 6px"></label>
      <label style="font-size:13px">Σημείωση<input id="plvNmNote" type="text" style="width:100%;padding:10px;margin:4px 0 14px"></label>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-scan" onclick="plvCloseModal()">Άκυρο</button>
        <button class="btn-new-order" onclick="plvDoCreate()">Καταχώρηση + Επιβεβαίωση</button>
      </div>
    </div>
  </div>`;
}

async function plvDoCreate() {
  if (PLV.busy) return; PLV.busy = true;
  try {
    // Με typeahead το πεδίο μένει κενό αν ο χρήστης πληκτρολόγησε χωρίς να
    // διαλέξει. Χωρίς αυτόν τον έλεγχο θα έφτανε partner_id=NaN στον worker.
    const partyVal = document.getElementById('plvNmParty').value;
    if (!partyVal) { showErrorToast('Διάλεξε αντισυμβαλλόμενο από τη λίστα', 'error'); return; }
    // Η βάση δέχτηκε '0206-08-08' (πληκτρολογικό 0206 αντί 2026, PM-1034) — το
    // min/max του input δεν πιάνει χειροκίνητη πληκτρολόγηση σε όλα τα browsers,
    // οπότε ο έλεγχος γίνεται ρητά εδώ, με μήνυμα που δείχνει το λάθος έτος.
    const md = document.getElementById('plvNmDate').value;
    if (!md || md < '2020-01-01' || md > '2030-12-31') {
      showErrorToast('Η ημερομηνία «' + (md || 'κενή') + '» είναι εκτός λογικού εύρους (2020–2030) — έλεγξε το έτος', 'error');
      return;
    }
    const [kind, pid] = partyVal.split(':');
    const path = await _plvUploadIfAny();
    const body = {
      movement_date: document.getElementById('plvNmDate').value,
      counterparty_type: kind === 'C' ? 'CLIENT' : 'PARTNER',
      event_type: document.getElementById('plvNmType').value,
      taken: parseInt(document.getElementById('plvNmTaken').value, 10) || 0,
      given: parseInt(document.getElementById('plvNmGiven').value, 10) || 0,
      notes: document.getElementById('plvNmNote').value || null,
      reason: (document.getElementById('plvNmReason') || {}).value || null,
      sheet_source: path ? 'UPLOAD' : 'MANUAL',
      confirm: true
    };
    if (kind === 'C') body.client_id = parseInt(pid, 10); else body.partner_id = parseInt(pid, 10);
    const loc = document.getElementById('plvNmLoc').value;
    if (loc) body.location_id = parseInt(loc, 10);
    if (path) body.sheet_url = path;
    await plFetch('/pallets/movements', { method: 'POST', body });
    toast('Κίνηση καταχωρήθηκε ✓');
    plvCloseModal(); await renderPalletLedger();
  } catch (e) { showErrorToast('Αποτυχία: ' + e.message, 'error'); }
  finally { PLV.busy = false; }
}

async function plvViewSheet(path) {
  try {
    const r = await plFetch('/pallets/sheets?path=' + encodeURIComponent(path));
    window.open(r.url, '_blank');
  } catch (e) { showErrorToast('Δεν άνοιξε το δελτίο: ' + e.message, 'error'); }
}

window.renderPalletLedger = renderPalletLedger;
window.plvTab = plvTab; window.plvOpenConfirm = plvOpenConfirm; window.plvCloseModal = plvCloseModal;
window.plvDoConfirm = plvDoConfirm; window.plvFixDelivery = plvFixDelivery; window.plvDoFix = plvDoFix;
window.plvZeroCheck = plvZeroCheck;
window.plvOpenPanel = plvOpenPanel; window.plvPanelDelete = plvPanelDelete; window.plvPanelReverse = plvPanelReverse;
window.plvWizClose = plvWizClose; window.plvWizAdvance = plvWizAdvance;
window.plvNewMovement = plvNewMovement; window.plvDoCreate = plvDoCreate; window.plvViewSheet = plvViewSheet;
window.plvFilter = plvFilter; window.plvExportCSV = plvExportCSV; window.plvClearQ = plvClearQ;
window.plvGroupBy = plvGroupBy; window.plvToggleGroup = plvToggleGroup;
window.plvDrill = plvDrill; window.plvStmtCSV = plvStmtCSV; window._plvDraw = _plvDraw;
// Τα inline oninput/onmousedown/onblur του typeahead τρέχουν σε global scope.
window.plvAcSearch = plvAcSearch; window.plvAcPick = plvAcPick; window.plvAcBlur = plvAcBlur;
