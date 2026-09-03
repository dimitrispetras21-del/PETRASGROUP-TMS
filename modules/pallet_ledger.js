// ═══════════════════════════════════════════════════════════
// MODULE — ΙΣΟΖΥΓΙΟ ΠΑΛΕΤΩΝ (Φ2 minimal: εκκρεμείς + διορθώσεις + νέα κίνηση)
// Πηγή: /pallets/* (Worker). Το πλήρες Ισοζύγιο (υπόλοιπα/drill-down) = Φ3.
// Redesign κύμα 2 (2/9/2026): Figma w2-pallet-ledger-overview / -movements /
// -balances-clients / -balances-partners / -movement-form. Tokens μόνο —
// κανένα hex εδώ (DESIGN.md #1)· τα ονόματα δεν κόβονται ποτέ (#6).
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
  c.innerHTML = '<div class="plv-empty">Φόρτωση κινήσεων παλετών...</div>';
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

// Κατάσταση = outline pill με κουκκίδα ΚΑΙ λέξη (owner 2/9: το ισοζύγιο κρατά
// το pill του· DESIGN.md #2: το χρώμα δεν κουβαλά μόνο του το νόημα).
function _plvPill(status) {
  if (status === 'pending') return '<span class="plv-pill plv-pill-pending"><i></i>εκκρεμής</span>';
  if (status === 'confirmed') return '<span class="plv-pill plv-pill-ok"><i></i>οριστική</span>';
  return '<span class="plv-pill plv-pill-rev"><i></i>αντιλογισμένη</span>';
}

// Κατεύθυνση ποσότητας με μία ματιά: ↓ παλέτες μπήκαν σε εμάς (πράσινο),
// ↑ έφυγαν από εμάς. Το «↓ 0» είναι ΑΛΗΘΙΝΟ μηδέν (η στήλη taken/given είναι
// NOT NULL DEFAULT 0 στο pl_movements — δεν υπάρχει «άγραφο»), γι' αυτό
// δείχνεται αχνά και όχι ως «—» (DESIGN.md #3 αφορά το άγραφο, όχι το μηδέν).
function _plvQty(n, dir) {
  const v = n || 0;
  const arrow = dir === 'in' ? '↓' : '↑';
  if (!v) return `<span class="plv-zero">${arrow} 0</span>`;
  return `<span class="${dir === 'in' ? 'plv-in' : 'plv-out'}">${arrow} ${v}</span>`;
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
  if (PLV.tab === 'noreturn') return _plvNoReturnCount();
  return PLV.movements.filter(m => m.status !== 'reversed').length;
}
function _plvNoReturnCount() {
  return PLV.movements.filter(m => m.status === 'confirmed' && m.event_type === 'DELIVERY' && m.given > m.taken).length;
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

// Υπόλοιπα ανά είδος: όλες οι ομαδοποιήσεις της κεφαλής (κάρτες, ταινία
// ισοζυγίου) ξεκινούν από εδώ ώστε να μην αποκλίνουν μεταξύ τους (αρχή 3).
function _plvBalTotals() {
  const tag = (arr, kind, nameKey, idKey) => (arr || []).map(b => ({ kind, name: b[nameKey] || ('#' + b[idKey]), bid: b[idKey], balance: b.balance }));
  const all = tag(PLV.balances.clients, 'clients', 'client_name', 'client_id')
    .concat(tag(PLV.balances.partners, 'partners', 'partner_name', 'partner_id'));
  const owedList = all.filter(b => b.balance > 0).sort((a, b) => b.balance - a.balance);
  const oweList  = all.filter(b => b.balance < 0).sort((a, b) => a.balance - b.balance);
  return { owedList, oweList,
    owed: owedList.reduce((s, b) => s + b.balance, 0),
    owe: -oweList.reduce((s, b) => s + b.balance, 0) };
}

// §3 (27/8): οι κάρτες έπαψαν να είναι διακόσμηση — δείχνουν ΠΟΙΟΣ χρωστάει
// (top-3, κλικ → καρτέλα) και πόσες εκκρεμείς έχουν ήδη δελτίο. Χαμηλότερες:
// δεν δικαιούνται το πάνω τρίτο της οθόνης.
function _plvOverview() {
  const { owedList, oweList, owed, owe } = _plvBalTotals();
  const pend = PLV.movements.filter(m => m.status === 'pending');
  const withSheet = pend.filter(m => m.sheet_url).length;
  const top3 = (list, sign) => list.length
    ? list.slice(0, 3).map(b => `<div class="plv-card-row" onclick="event.stopPropagation();plvDrill('${b.kind}',${b.bid})" title="Άνοιγμα καρτέλας">
        <span>${escapeHtml(b.name)}</span><b class="${sign === '+' ? 'plv-in' : 'plv-out'}">${sign}${Math.abs(b.balance)}</b></div>`).join('')
    : '<div class="plv-card-row plv-dim">κανείς</div>';
  const card = (lbl, valHtml, bodyHtml, go, title) => `<div class="plv-card" onclick="plvTab('${go}')" title="${title}">
    <div class="plv-card-h"><span class="plv-card-l">${lbl}</span>${valHtml}</div>${bodyHtml}</div>`;
  return `<div class="plv-cards">
    ${card('ΜΑΣ ΟΦΕΙΛΟΥΝ', `<span class="plv-card-v plv-in">${owed} pal</span>`, top3(owedList, '+'), 'clients', 'Άνοιγμα: Πελάτες')}
    ${card('ΟΦΕΙΛΟΥΜΕ', `<span class="plv-card-v plv-out">${owe} pal</span>`, top3(oweList, '−'), 'partners', 'Άνοιγμα: Συνεργάτες')}
    ${card('ΕΚΚΡΕΜΗ', `<span class="plv-card-v" style="color:var(--warning)">${pend.length}</span>`,
      `<div class="plv-card-row"><span>${withSheet} με δελτίο</span></div><div class="plv-card-row"><span style="color:var(--warning);font-weight:600">${pend.length - withSheet} χωρίς δελτίο</span></div>`, 'pending', 'Άνοιγμα: Εκκρεμείς')}
  </div>`;
}

// Ταινία σύνοψης των tabs ισοζυγίου (Figma balances-clients/-partners):
// «Μας χρωστάνε Χ παλέτες σε Ν πελάτες · Χρωστάμε Υ παλέτες σε Μ». Μετρά
// ΜΟΝΟ το είδος του tab — ο τίτλος λέει «Πελάτες», τα νούμερα είναι πελατών.
function _plvBalanceStrip(kind) {
  const rows = PLV.balances[kind] || [];
  const who = kind === 'clients' ? 'πελάτες' : 'συνεργάτες';
  const pos = rows.filter(b => b.balance > 0), neg = rows.filter(b => b.balance < 0);
  const owed = pos.reduce((s, b) => s + b.balance, 0), owe = -neg.reduce((s, b) => s + b.balance, 0);
  const pal = n => n === 1 ? '1 παλέτα' : n + ' παλέτες';
  const cnt = n => n === 1 ? (kind === 'clients' ? '1 πελάτη' : '1 συνεργάτη') : n + ' ' + who;
  const parts = [];
  if (pos.length) parts.push(`<span><b class="plv-in">Μας χρωστάνε ${pal(owed)}</b> σε ${cnt(pos.length)}</span>`);
  if (neg.length) parts.push(`<span><b class="plv-out">Χρωστάμε ${pal(owe)}</b> σε ${cnt(neg.length)}</span>`);
  if (!parts.length) parts.push('<span>Κανένα ανοιχτό υπόλοιπο</span>');
  const total = PLV.movements.filter(m => m.status !== 'reversed').length;
  return `<div class="plv-strip">${parts.join('<span class="plv-dim">·</span>')}
    <span style="margin-left:auto">${total} κινήσεις καταγεγραμμένες · πηγή: pl_movements · θετικό = μας χρωστά · αρνητικό = χρωστάμε</span></div>`;
}

// «Ανοιχτό από» αφαιρέθηκε από πίνακα/CSV/drill (25/8): η όψη pl_v_balance_*
// δεν έχει στήλη open_since — το πεδίο ήταν πάντα undefined και η στήλη πάντα
// κενή (αρχή 8: νεκρή στήλη = ψέμα). Αν χρειαστεί, προστίθεται πρώτα στην όψη.
function _plvBalanceTable(kind) {
  const rows = (PLV.balances[kind] || [])
    .filter(b => b.balance !== 0 || b.pending_count > 0)
    .sort((a, b) => b.balance - a.balance); // πρώτα όποιος μας χρωστάει τα περισσότερα
  if (!rows.length) return `<div class="plv-empty">
    ${typeof icon === 'function' ? icon('check_circle', 28) : ''}
    <div style="margin:10px 0 4px;font-weight:600;color:var(--text)">Κανένα ανοιχτό υπόλοιπο</div>
    <div>Όλα τα ισοζύγια ${kind === 'clients' ? 'πελατών' : 'συνεργατών'} είναι στο μηδέν.</div>
  </div>`;
  const idKey = kind === 'clients' ? 'client_id' : 'partner_id';
  const nameKey = kind === 'clients' ? 'client_name' : 'partner_name';
  // Η όψη γυρίζει pending_count 0 όταν δεν υπάρχει εκκρεμής: ΓΝΩΣΤΟ μηδέν,
  // γράφεται «0» (owner 3/9) — το frame 214 το έδειχνε «—», αλλά η παύλα
  // διαβάζεται ως «άγνωστο» (DESIGN.md #3 κόβει και προς τα εκεί). Αχνό,
  // ώστε το μάτι να πιάνει μόνο τις γραμμές με δουλειά.
  return `<div style="overflow-x:auto"><table class="plv-tbl">
    <tr><th>${kind === 'clients' ? 'Πελάτης' : 'Συνεργάτης'}</th>
      <th class="plv-num">Υπόλοιπο</th>
      <th class="plv-num">Εκκρεμείς κινήσεις</th><th></th></tr>
    ${rows.map(b => `<tr class="plv-row" onclick="plvDrill('${kind}',${b[idKey]})">
      <td class="plv-wrap"><b>${escapeHtml(b[nameKey] || ('#' + b[idKey]))}</b></td>
      <td class="plv-num">${b.balance === 0
        ? '<span class="plv-dim">0 · ισοσκελισμένο</span>'
        : `<b class="${b.balance > 0 ? 'plv-in' : 'plv-out'}">${b.balance > 0 ? '+' : '−'}${Math.abs(b.balance)}</b> <span class="plv-dim">${b.balance > 0 ? 'μας χρωστά' : 'χρωστάμε'}</span>`}</td>
      <td class="plv-num"><span class="${b.pending_count ? '' : 'plv-dim'}">${b.pending_count || 0}</span></td>
      <td style="color:var(--accent);font-size:var(--text-xs);text-align:right">ανάλυση →</td></tr>`).join('')}
  </table></div>`;
}

const PLV_TABS = [['pending', 'Εκκρεμείς'], ['noreturn', 'Χωρίς πλήρη επιστροφή'], ['all', 'Όλες οι κινήσεις'], ['clients', 'Πελάτες'], ['partners', 'Συνεργάτες']];

function _plvTabsHtml() {
  const pend = PLV.movements.filter(m => m.status === 'pending').length;
  const nr = _plvNoReturnCount();
  return `<div class="plv-tabs">${PLV_TABS.map(([id, lbl]) => {
    // «Εκκρεμείς (N)»: ίδια μορφή με το συμβόλαιο (pallets.json) — ο κριτής
    // #1 σβήνει τα ψηφία και συγκρίνει το «Εκκρεμείς ()».
    const txt = id === 'pending' ? `${lbl} (${pend})` : id === 'noreturn' && nr ? `${lbl}<span class="plv-badge">${nr}</span>` : lbl;
    return `<button class="plv-tab${PLV.tab === id ? ' on' : ''}" onclick="plvTab('${id}')">${txt}</button>`;
  }).join('')}</div>`;
}

// Το κοινό CSS της μονάδας — μία φορά ανά σχεδίαση, tokens μόνο.
const _PLV_STYLE = `<style>
  .plv-page{padding:20px 24px;max-width:1280px;margin:0 auto;font-size:var(--text-sm);color:var(--text)}
  .plv-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
  .plv-h1{font-family:Syne;font-size:20px;font-weight:700;margin:0}
  .plv-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .plv-tabs{display:flex;gap:6px;flex-wrap:wrap}
  .plv-tab{padding:6px 12px;border-radius:var(--radius-full);border:1px solid var(--silver-light);background:var(--bg-card);color:var(--text-mid);font-size:var(--text-sm);cursor:pointer;font-family:inherit;line-height:1.2}
  .plv-tab:hover{border-color:var(--accent);color:var(--accent-text)}
  .plv-tab.on,.plv-seg button.on{background:var(--navy-mid);border-color:var(--navy-mid);color:var(--bg-card)}
  .plv-badge{display:inline-block;margin-left:6px;padding:0 6px;border-radius:var(--radius-full);background:var(--warning-bg);color:var(--warning);font-weight:700;font-size:var(--text-xs)}
  .plv-search{position:relative;display:flex;align-items:center}
  .plv-search input{width:210px;padding:7px 26px 7px 10px;font-size:var(--text-sm);border:1px solid var(--silver-light);border-radius:var(--radius);background:var(--bg-card);color:var(--text);font-family:inherit}
  .plv-x{position:absolute;right:8px;cursor:pointer;color:var(--text-dim);font-size:16px;line-height:1}
  .plv-count,.plv-date,.plv-seg{font-size:var(--text-xs);color:var(--text-dim);white-space:nowrap}
  .plv-date input{padding:5px 6px;font-size:var(--text-xs);border:1px solid var(--silver-light);border-radius:var(--radius);font-family:inherit;color:var(--text)}
  .plv-seg{display:flex;gap:4px;align-items:center}
  .plv-seg button{padding:4px 10px;border-radius:var(--radius-full);border:1px solid var(--silver-light);background:var(--bg-card);color:var(--text-mid);font-size:var(--text-xs);cursor:pointer;font-family:inherit}
  .plv-link{background:none;border:0;color:var(--accent);font-weight:600;font-size:var(--text-body);cursor:pointer;font-family:inherit;padding:6px 8px}
  .plv-link:hover{color:var(--accent-text);text-decoration:underline}
  .plv-cards{display:flex;gap:12px;margin:14px 0 12px;flex-wrap:wrap}
  .plv-card{flex:1 1 200px;background:var(--bg-card);border:1px solid var(--silver-light);border-radius:var(--radius-md);padding:10px 14px;cursor:pointer;transition:box-shadow .15s,border-color .15s}
  .plv-card:hover{border-color:var(--accent);box-shadow:var(--shadow-sm)}
  .plv-card-h{display:flex;justify-content:space-between;align-items:baseline}
  .plv-card-l{font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--text-mid)}
  .plv-card-v{font-family:Syne;font-size:17px;font-weight:700}
  .plv-card-row{display:flex;justify-content:space-between;gap:8px;font-size:var(--text-xs);margin-top:4px;color:var(--text-mid)}
  .plv-card-row:hover span{text-decoration:underline}
  .plv-strip{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0 0;padding:8px 12px;background:var(--bg-hover);border-radius:var(--radius);font-size:var(--text-xs);color:var(--text-dim)}
  .plv-tbl{width:100%;border-collapse:collapse;font-size:var(--text-sm)}
  .plv-tbl th{padding:8px 10px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-mid);background:var(--bg-hover);white-space:nowrap}
  .plv-tbl td{padding:0 10px;height:36px;border-top:1px solid var(--silver-light);white-space:nowrap;vertical-align:middle}
  .plv-tbl td.plv-wrap{white-space:normal}
  .plv-tbl tr.plv-row{cursor:pointer}.plv-tbl tr.plv-row:hover td{background:var(--bg-hover)}
  .plv-code{font-weight:600}.plv-dim{color:var(--text-dim)}.plv-loc{color:var(--text-dim);text-transform:uppercase;font-size:var(--text-xs)}
  .plv-num{text-align:right}
  .plv-in{color:var(--success);font-weight:600}.plv-out{color:var(--danger);font-weight:600}.plv-zero{color:var(--text-dim);opacity:.6}
  .plv-pill{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:var(--radius-full);border:1px solid var(--silver-light);font-size:var(--text-xs);font-weight:500;white-space:nowrap;color:var(--text-mid);line-height:1.4}
  .plv-pill i{width:6px;height:6px;border-radius:50%;background:var(--text-dim)}
  .plv-pill-pending i{background:var(--warning)}.plv-pill-ok i{background:var(--success)}
  .plv-clip{color:var(--text-dim);text-decoration:none}.plv-clip:hover{color:var(--accent)}
  .plv-ghead{display:flex;align-items:center;gap:8px;background:var(--accent-light);border-radius:var(--radius);padding:6px 12px;margin:8px 0 0;cursor:pointer;user-select:none}
  .plv-gname{font-family:Syne;font-size:13.5px;font-weight:700}
  .plv-gsum{margin-left:auto;font-size:var(--text-xs);color:var(--text-dim);white-space:nowrap}
  .plv-empty{padding:44px;text-align:center;color:var(--text-dim);font-size:var(--text-sm)}
  /* Modal — Figma w2-pallet-movement-form: 680px, δύο στήλες, dashed dropzone */
  .plv-overlay{position:fixed;inset:0;background:rgba(11,25,41,.45);display:flex;align-items:center;justify-content:center;z-index:var(--z-overlay,1000)}
  .plv-modal{background:var(--bg-card);color:var(--text);border-radius:var(--radius-md);box-shadow:var(--shadow-md);width:min(680px,94vw);max-height:92vh;overflow:auto}
  .plv-modal.plv-sm{width:min(460px,94vw)}
  .plv-mhead{display:flex;align-items:center;gap:8px;padding:18px 24px 14px}
  .plv-mhead h3{font-family:Syne;font-size:18px;margin:0}
  .plv-mclose{margin-left:auto;cursor:pointer;font-size:16px;color:var(--text-dim);line-height:1}
  .plv-mbody{padding:0 24px 8px;display:flex;flex-direction:column;gap:14px}
  .plv-grid2{display:flex;gap:14px}.plv-grid2>*{flex:1 1 0;min-width:0}
  .plv-f{display:flex;flex-direction:column;gap:6px;font-size:var(--text-xs);color:var(--text-mid)}
  .plv-f input,.plv-f select{width:100%;box-sizing:border-box;padding:8px 12px;font-size:var(--text-body);font-family:inherit;color:var(--text);background:var(--bg-card);border:1px solid var(--silver-light);border-radius:var(--radius)}
  .plv-f input:focus,.plv-f select:focus{outline:2px solid var(--accent);outline-offset:-1px}
  .plv-hint{font-size:var(--text-xs);color:var(--text-dim)}
  .plv-drop{display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 16px;border:1px dashed var(--silver-light);border-radius:var(--radius);cursor:pointer;text-align:center}
  .plv-drop:hover,.plv-drop.over{border-color:var(--accent);background:var(--accent-light)}
  .plv-drop b{font-size:var(--text-sm);font-weight:500;color:var(--text-mid)}.plv-drop span{font-size:var(--text-xs);color:var(--text-dim)}
  .plv-mfoot{display:flex;align-items:center;gap:10px;padding:14px 24px 18px;font-size:var(--text-xs);color:var(--warning)}
  .plv-mfoot .plv-sp{flex:1}
  .plv-btn-ghost{background:none;border:0;color:var(--accent);font-weight:600;font-size:var(--text-body);padding:8px 16px;cursor:pointer;font-family:inherit;border-radius:var(--radius)}
  .plv-btn-ghost:hover{background:var(--accent-light)}
  .plv-btn-danger{background:none;border:1px solid var(--danger);color:var(--danger);font-weight:600;font-size:var(--text-body);padding:8px 16px;cursor:pointer;font-family:inherit;border-radius:var(--radius)}
  .plv-note{font-size:var(--text-xs);color:var(--warning);margin:0}
  /* Πλαϊνό πάνελ κίνησης */
  .plv-panel{position:absolute;top:0;right:0;bottom:0;width:min(400px,94vw);background:var(--bg-card);color:var(--text);box-shadow:var(--shadow-md);padding:22px;overflow:auto}
  .plv-prow{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--silver-light);font-size:var(--text-body)}
  .plv-prow span:first-child{color:var(--text-dim);white-space:nowrap}.plv-prow span:last-child{text-align:right}
  /* Typeahead: color ρητά — το --panel τυχαίνει να έχει την ίδια τιμή με το --text,
     οπότε χωρίς αυτό η λίστα βγαίνει σκούρο σε σκούρο (πιάστηκε live 12/8). */
  .plv-ac{position:absolute;left:0;right:0;top:100%;z-index:20;background:var(--bg-card);color:var(--text);border:1px solid var(--silver-light);border-radius:var(--radius);max-height:210px;overflow:auto;box-shadow:var(--shadow-md)}
  .plv-ac>div{padding:9px 12px;font-size:var(--text-body);cursor:pointer}.plv-ac>div:hover{background:var(--bg-hover)}
</style>`;

function _plvDraw() {
  const c = document.getElementById('content');
  const isBalanceTab = PLV.tab === 'clients' || PLV.tab === 'partners';
  const hasCards = PLV.tab === 'pending' || PLV.tab === 'noreturn';
  const rows = isBalanceTab ? [] : _plvRows();
  const filters = isBalanceTab ? '' : `
      <div class="plv-search">
        <input id="plvQ" placeholder="Αναζήτηση (κωδικός, όνομα, σημείο)" value="${escapeHtml(PLV.q)}" oninput="plvFilter('q',this.value)">
        <span id="plvQClear" class="plv-x" onclick="plvClearQ()" title="Καθαρισμός αναζήτησης" style="display:${PLV.q ? '' : 'none'}">×</span>
      </div>
      <span id="plvCount" class="plv-count">${rows.length} από ${_plvTabTotal()}</span>
      <label class="plv-date">Από <input type="date" value="${PLV.from}" onchange="plvFilter('from',this.value)"></label>
      <label class="plv-date">Έως <input type="date" value="${PLV.to}" onchange="plvFilter('to',this.value)"></label>
      <div class="plv-seg">Ομαδοποίηση:
        ${[['client', 'Ανά πελάτη'], ['location', 'Ανά σημείο'], ['none', 'Χωρίς']].map(([v, l]) =>
          `<button class="${PLV.groupBy === v ? 'on' : ''}" onclick="plvGroupBy('${v}')">${l}</button>`).join('')}
      </div>
      ${PLV.enrichFail ? '<span style="color:var(--warning)" title="Η ανάγνωση των παραγγελιών απέτυχε — οι στήλες Reference/Μεταφορικό είναι προσωρινά κενές. Οι κινήσεις εμφανίζονται κανονικά.">⚠ στοιχεία παραγγελιών μη διαθέσιμα</span>' : ''}`;
  const actions = `<button class="plv-link" onclick="plvExportCSV()">Εξαγωγή CSV</button>
      <button class="btn-new-order" onclick="plvNewMovement()">+ Νέα κίνηση</button>`;
  // Δύο διατάξεις κεφαλής (Figma): με κάρτες οφειλών (Εκκρεμείς/Χωρίς πλήρη
  // επιστροφή) τα tabs κάθονται κάτω από τις κάρτες· χωρίς κάρτες, δίπλα στον τίτλο.
  const head = hasCards
    ? `<div class="plv-top"><h1 class="plv-h1">Ισοζύγιο Παλετών</h1><div class="plv-right">${actions}</div></div>
       ${_plvOverview()}
       <div class="plv-top">${_plvTabsHtml()}<div class="plv-right">${filters}</div></div>`
    : `<div class="plv-top"><h1 class="plv-h1">Ισοζύγιο Παλετών</h1>${_plvTabsHtml()}<div class="plv-right">${actions}</div></div>
       ${isBalanceTab ? _plvBalanceStrip(PLV.tab) : `<div class="plv-top" style="margin-top:10px"><div class="plv-right">${filters}</div></div>`}`;
  c.innerHTML = `${_PLV_STYLE}
  <div class="plv-page">
    ${head}
    <div id="plvTbl" style="margin-top:12px">${isBalanceTab ? _plvBalanceTable(PLV.tab) : _plvListHtml(rows)}</div>
  </div>
  <div id="plvModal"></div>`;
  // Όλο το #plvTbl ως ΕΝΑ σύνολο: στην ομαδοποιημένη όψη κάθε ομάδα είναι δικός
  // της <table>, αλλά οι στήλες ΠΡΕΠΕΙ να μένουν ίδιες μεταξύ ομάδων — κρίση ανά
  // ομάδα θα έδινε διαφορετικές στήλες ανά πελάτη και θα κατέστρεφε την
  // ευθυγράμμιση που το κοινό colgroup υπάρχει για να κρατά.
  collapseEmptyColumns('plvTbl', 'pallets:list');
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

// Η γραμμή δεν έχει πλέον κουμπιά (Figma): κλικ → πλαϊνό πάνελ, όπου ζουν
// Επιβεβαίωση / Διόρθωση / Διαγραφή / Αντιλογισμός. Ο wizard εκκρεμών ξεκινά
// από εκεί και προχωρά μόνος του στην επόμενη — η ουρά δεν χάθηκε.
function _plvMovementRow(m, grouped) {
  const x = _plvRowExtras(m);
  const clip = m.sheet_url
    ? `<a href="#" class="plv-clip" title="Προβολή δελτίου" onclick="plvViewSheet('${String(m.sheet_url).replace(/'/g, '')}');return false">${typeof icon === 'function' ? icon('file_check', 14) : 'δελτίο'}</a>` : '';
  return `
      <tr class="plv-row" title="Λεπτομέρειες κίνησης" onclick="if(!event.target.closest('a'))plvOpenPanel(${m.id})">
        <td class="plv-code">${m.code}</td>
        <td class="plv-dim">${_plvFmtDate(m.movement_date)}</td>
        <td>${PLV_EVENT_GR[m.event_type] || m.event_type}</td>
        ${grouped ? '' : `<td class="plv-wrap">${escapeHtml(_plvName(m))}</td>`}
        ${grouped && PLV.groupBy === 'location'
          // Ομαδοποίηση ανά σημείο: η επικεφαλίδα είναι το σημείο, άρα η
          // γραμμή δείχνει τον αντισυμβαλλόμενο — αλλιώς θα εξαφανιζόταν.
          ? `<td class="plv-loc plv-wrap">${escapeHtml(_plvName(m))}</td>`
          : `<td class="plv-loc plv-wrap">${escapeHtml(_plvLoc(m)) || '<span class="plv-dim">—</span>'}</td>`}
        <td class="plv-num">${_plvQty(m.taken, 'in')}</td>
        <td class="plv-num">${_plvQty(m.given, 'out')}</td>
        <td class="plv-dim">${x.ref ? escapeHtml(x.ref) : ''}</td>
        <td class="plv-dim">${x.carrier ? escapeHtml(x.carrier) : ''}</td>
        <td style="text-align:center">${clip}</td>
        <td>${_plvPill(m.status)}</td>
      </tr>`;
}

const _PLV_EMPTY = (cols) => `<tr><td colspan="${cols}" class="plv-empty" style="height:auto">
        ${typeof icon === 'function' ? icon('package', 28) : ''}
        <div style="margin:10px 0 4px;font-weight:600;color:var(--text)">Καμία κίνηση εδώ</div>
        <div>Δοκίμασε άλλο tab ή καθάρισε αναζήτηση/ημερομηνίες.</div>
        <button class="btn-new-order" style="margin-top:14px" onclick="plvNewMovement()">+ Νέα κίνηση</button>
      </td></tr>`;

// Ίδια πλάτη σε ΟΛΑ τα τμήματα ώστε οι στήλες να ευθυγραμμίζονται μεταξύ ομάδων.
const _PLV_COLS_G = `<colgroup><col style="width:8%"><col style="width:7%"><col style="width:13%"><col style="width:20%"><col style="width:7%"><col style="width:7%"><col style="width:11%"><col style="width:14%"><col style="width:4%"><col style="width:9%"></colgroup>`;

// Κεφαλίδα της ΟΜΑΔΟΠΟΙΗΜΕΝΗΣ όψης (owner 3/9). Μέχρι σήμερα κεφαλίδες είχε
// ΜΟΝΟ η ομαδοποίηση «Χωρίς» — δηλαδή η μόνη που ΔΕΝ είναι η προεπιλογή. Η
// λογίστρια έβλεπε «↓ 32 · ↑ 0» χωρίς τίποτα να της λέει ποιο είναι ποιο, και
// οι κεφαλίδες εμφανίζονταν μόνο όταν ο πίνακας ήταν άδειος (_plvListHtml
// πέφτει στο _plvTableHtml όταν rows.length === 0).
//
// ΜΙΑ φορά πάνω από τις ομάδες, ΟΧΙ μία ανά ομάδα: οι επτά ομάδες θα έτρωγαν
// επτά γραμμές ύψους — ακριβώς ο χώρος που το redesign της 27/8 πάλεψε να
// κερδίσει (15 ορατές γραμμές αντί για ≥20 στα 1080p). Ευθυγραμμίζεται επειδή
// μοιράζεται ΤΟ ΙΔΙΟ colgroup και table-layout:fixed με κάθε πίνακα ομάδας.
//
// Η 4η στήλη αλλάζει νόημα με την ομαδοποίηση: όταν ομαδοποιούμε ανά σημείο, η
// επικεφαλίδα της ομάδας ΕΙΝΑΙ το σημείο, οπότε η γραμμή δείχνει τον
// αντισυμβαλλόμενο (βλ. _plvMovementRow) — η κεφαλίδα ακολουθεί, αλλιώς θα
// έλεγε ψέματα.
const _plvGroupHead = () => `<div style="overflow-x:auto"><table class="plv-tbl" style="table-layout:fixed">${_PLV_COLS_G}
      <tr>
        <th>Κωδ.</th><th>Ημ/νία</th><th>Είδος</th>
        <th>${PLV.groupBy === 'location' ? 'Αντισυμβαλλόμενος' : 'Σημείο'}</th>
        <th class="plv-num">Πήραμε</th><th class="plv-num">Δώσαμε</th>
        <th>Reference</th><th>Μεταφορικό</th><th title="Δελτίο"></th><th>Κατάσταση</th>
      </tr>
    </table></div>`;

function _plvTableHtml(rows) {
  return `
    <div style="overflow-x:auto">
    <table class="plv-tbl">
      <tr>
        <th>Κωδ.</th><th>Ημ/νία</th><th>Είδος</th><th>Αντισυμβαλλόμενος</th><th>Σημείο</th>
        <th class="plv-num">Πήραμε</th><th class="plv-num">Δώσαμε</th>
        <th>Reference</th><th>Μεταφορικό</th><th title="Δελτίο"></th><th>Κατάσταση</th>
      </tr>
      ${rows.map(m => _plvMovementRow(m, false)).join('') || _PLV_EMPTY(11)}
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

// Δίπλωμα: προεπιλογή ΑΝΟΙΧΤΑ (Figma 2/9 — η λογίστρια πρέπει να βλέπει τις
// κινήσεις χωρίς κλικ· με 45 εκκρεμείς σε 7 ομάδες το «κλειστά >3» του 27/8
// έδειχνε επτά επικεφαλίδες και καμία κίνηση). Ό,τι κλείσει ο χρήστης μένει
// κλειστό όσο μένει στη σελίδα· ενεργή αναζήτηση = όλα ανοιχτά.
function _plvIsOpen(key) {
  if (PLV.q) return true;
  if (PLV.open[key] !== undefined) return PLV.open[key];
  return true;
}

function plvToggleGroup(key) {
  const groups = _plvBuildGroups(_plvRows());
  PLV.open[key] = !_plvIsOpen(key, groups.length);
  const el = document.getElementById('plvTbl');
  if (el) el.innerHTML = _plvListHtml(_plvRows());
  // Το δίπλωμα ομάδας ξαναγράφει τη λίστα χωρίς να περάσει από το _plvDraw:
  // χωρίς αυτή τη γραμμή, το άνοιγμα μιας ομάδας θα επανέφερνε τις κενές στήλες.
  collapseEmptyColumns('plvTbl', 'pallets:list');
}

function plvGroupBy(mode) {
  PLV.groupBy = mode;
  PLV.open = {}; // νέα δομή, νέες προεπιλογές διπλώματος
  _plvDraw();
}

function _plvListHtml(rows) {
  if (PLV.groupBy === 'none' || !rows.length) return _plvTableHtml(rows);
  const groups = _plvBuildGroups(rows);
  const arrow = (o) => `<span class="plv-dim" style="display:inline-block;width:12px;font-size:10px">${o ? '▾' : '▸'}</span>`;
  let html = '<div>' + _plvGroupHead();
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
      balHtml = ` · υπόλοιπο <b class="${bal > 0 ? 'plv-in' : bal < 0 ? 'plv-out' : ''}">${bal > 0 ? '+' : ''}${bal}</b>${mismatch ? ` <span title="Απόκλιση από την όψη pl_v_balance_clients: όψη=${vb.balance}, υπολογισμένο=${bal}" style="color:var(--danger);cursor:help">⚠</span>` : ''}`;
    }
    html += `<div class="plv-ghead" onclick="plvToggleGroup('${T.key}')">${arrow(o)}<span class="plv-gname">${escapeHtml(T.label)}</span>
      <span class="plv-gsum">${T.count} ${T.count === 1 ? 'κίνηση' : 'κινήσεις'} · <span class="plv-in">↓ ${T.tk}</span> · <span class="plv-out">↑ ${T.gv}</span>${balHtml}</span></div>`;
    // Ένα επίπεδο κάτω από την επικεφαλίδα (Figma 2/9): η δεύτερη διάσταση
    // (σημείο ή αντισυμβαλλόμενος) είναι στήλη της γραμμής, όχι ενδιάμεση
    // ετικέτα — οι ετικέτες των 27/8 έτρωγαν 24px ανά σημείο (12 σε έναν
    // πελάτη) και άφηναν 15 γραμμές ορατές στα 1080p αντί για ≥20.
    if (o) {
      html += `<div style="overflow-x:auto"><table class="plv-tbl" style="table-layout:fixed">${_PLV_COLS_G}
          ${T.subs.map(S => S.rows.map(m => _plvMovementRow(m, true)).join('')).join('')}
        </table></div>`;
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
  c.innerHTML = '<div class="plv-empty">Φόρτωση καρτέλας...</div>';
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
    const balCls = bal && bal.balance > 0 ? 'plv-in' : bal && bal.balance < 0 ? 'plv-out' : '';
    c.innerHTML = `${_PLV_STYLE}
    <div class="plv-page" style="max-width:1100px">
      <div class="plv-top">
        <button class="plv-tab" onclick="_plvDraw()">← Επιστροφή</button>
        <h1 class="plv-h1">${escapeHtml(name)}</h1>
        <div class="plv-right"><button class="plv-link" onclick="plvStmtCSV()">Εξαγωγή CSV καρτέλας</button></div>
      </div>
      <div class="plv-strip">
        <span>Υπόλοιπο <b class="${balCls}">${bal ? (bal.balance > 0 ? '+' : '') + bal.balance : '0'} pal</b></span>
        <span class="plv-dim">·</span><span>${pendCnt} εκκρεμείς (εκτός τρεχούμενου)</span>
      </div>
      ${locRows.length ? `<div class="plv-card-l" style="margin:16px 0 6px">ΑΝΑ ΣΗΜΕΙΟ</div>
      <table class="plv-tbl" style="width:auto;min-width:280px;margin-bottom:6px">
        ${locRows.map(l => `<tr><td class="plv-wrap">${escapeHtml(l.location_name || '—')}</td>
        <td class="plv-num"><b class="${l.balance > 0 ? 'plv-in' : 'plv-out'}">${l.balance > 0 ? '+' : ''}${l.balance}</b></td></tr>`).join('')}
      </table>` : ''}
      <div style="overflow-x:auto;margin-top:12px">
      <table class="plv-tbl">
        <tr><th>Ημ/νία</th><th>Κωδ.</th><th>Είδος</th><th>Σημείο</th>
          <th class="plv-num">Πήραμε</th><th class="plv-num">Δώσαμε</th><th>Κατάσταση</th>
          <th class="plv-num">Τρεχούμενο</th></tr>
        ${rows.map(({ m, run }) => `<tr style="${m.status === 'pending' ? 'opacity:.75' : ''}">
          <td class="plv-dim">${_plvFmtDate(m.movement_date)}</td>
          <td class="plv-code">${m.code}</td>
          <td>${PLV_EVENT_GR[m.event_type] || m.event_type}</td>
          <td class="plv-loc plv-wrap">${escapeHtml(_plvLoc(m))}</td>
          <td class="plv-num">${_plvQty(m.taken, 'in')}</td>
          <td class="plv-num">${_plvQty(m.given, 'out')}</td>
          <td>${_plvPill(m.status)}</td>
          <td class="plv-num" style="font-weight:700">${run == null ? '<span class="plv-dim">—</span>' : (run > 0 ? '+' : '') + run}</td>
        </tr>`).join('') || '<tr><td colspan="8" class="plv-empty" style="height:auto">Καμία κίνηση</td></tr>'}
      </table>
      </div>
    </div>
    <div id="plvModal"></div>`;
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

/* ── Κοινά κομμάτια φορμών (Figma w2-pallet-movement-form) ── */
function _plvField(label, inner, hint) {
  return `<label class="plv-f">${label}${inner}${hint ? `<span class="plv-hint">${hint}</span>` : ''}</label>`;
}
// Dropzone δελτίου: το input μένει #plvFile ώστε το _plvUploadIfAny να
// διαβάζει το ίδιο στοιχείο σε όλες τις φόρμες. Σύρσιμο ή κλικ.
function _plvDropzone() {
  return `<div class="plv-drop" onclick="document.getElementById('plvFile').click()"
      ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')"
      ondrop="event.preventDefault();this.classList.remove('over');plvFileDropped(event.dataTransfer.files)">
    <input type="file" id="plvFile" accept="image/*,.pdf" style="display:none" onchange="plvFilePicked(this)">
    <b>Δελτίο (φωτογραφία ή PDF) — προαιρετικό</b>
    <span id="plvFileName">σύρε εδώ ή κάνε κλικ για επιλογή αρχείου</span>
  </div>`;
}
function plvFilePicked(inp) {
  const f = inp.files && inp.files[0];
  const el = document.getElementById('plvFileName');
  if (el) el.textContent = f ? `${f.name} (${(f.size / 1024).toFixed(0)} KB)` : 'σύρε εδώ ή κάνε κλικ για επιλογή αρχείου';
}
function plvFileDropped(files) {
  const inp = document.getElementById('plvFile');
  if (!inp || !files || !files.length) return;
  inp.files = files;
  plvFilePicked(inp);
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
    ? ` <span class="plv-dim" style="font-size:var(--text-sm);font-weight:400;font-family:'DM Sans'">· ${pos + 1} από ${q.length}</span>` : '';
  // Ο κανόνας του Worker (taken+given>0, εκτός ADJUSTMENT) εφαρμόζεται ΚΑΙ εδώ:
  // η υποβολή κλειδώνει όσο 0/0 και εξηγεί, αντί να επιστρέφει 400 μετά (αρχή 1).
  const needsQty = m.event_type !== 'ADJUSTMENT';
  const zero = needsQty && m.taken + m.given === 0;
  const oninput = needsQty ? 'oninput="plvZeroCheck()"' : '';
  document.getElementById('plvModal').innerHTML = `
  <div class="plv-overlay" onclick="if(event.target===this)plvWizClose()">
    <div class="plv-modal plv-sm">
      <div class="plv-mhead"><h3>Επιβεβαίωση — ${m.code}${counter}</h3><span class="plv-mclose" onclick="plvWizClose()" title="Κλείσιμο (Esc)">✕</span></div>
      <div class="plv-mbody">
        <div class="plv-hint" style="margin-top:-8px">${PLV_EVENT_GR[m.event_type]} · ${escapeHtml(_plvName(m))}</div>
        <div class="plv-grid2">
          ${_plvField('Πήραμε (παλέτες)', `<input id="plvTaken" type="number" min="0" value="${m.taken}" ${oninput}>`)}
          ${_plvField('Δώσαμε (παλέτες)', `<input id="plvGiven" type="number" min="0" value="${m.given}" ${oninput}>`)}
        </div>
        <p id="plvZeroNote" class="plv-note" style="display:${zero ? 'block' : 'none'}">Μηδενικές ποσότητες — χρειάζεται διόρθωση: συμπλήρωσε πόσες παλέτες πήραμε ή δώσαμε για να ενεργοποιηθεί η επιβεβαίωση.</p>
        ${_plvDropzone()}
      </div>
      <div class="plv-mfoot">
        <span class="plv-sp"></span>
        <button class="plv-btn-ghost" onclick="plvWizClose()">Κλείσιμο</button>
        ${q.length > 1 && pos >= 0 ? `<button class="plv-btn-ghost" onclick="plvWizAdvance(${m.id})" title="Προσπέρασε χωρίς επιβεβαίωση">Παράλειψη →</button>` : ''}
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
  const row = (lbl, val) => `<div class="plv-prow"><span>${lbl}</span><span>${val}</span></div>`;
  // Η καταγωγή δείχνεται με τα pg ids που κουβαλά η κίνηση — αρκούν για
  // αναζήτηση, χωρίς νέο endpoint (πεδίο εργασίας: μόνο front end).
  const src = m.order_id
    ? `Παραγγελία #${m.order_id}${m.order_stop_id ? ' · Στάση #' + m.order_stop_id : ''}`
    : (m.cons_load_id ? 'Δρομολόγιο #' + m.cons_load_id : 'Χειροκίνητη');
  const sheet = m.sheet_url
    ? `<a href="#" onclick="plvViewSheet('${String(m.sheet_url).replace(/'/g, '')}');return false">Προβολή δελτίου</a>`
    : (m.sheet_source === 'MANUAL' ? 'χειροκίνητη (χωρίς αρχείο)' : '—');
  const actions = m.status === 'pending' ? `
      <button class="btn-new-order" style="width:100%;margin-bottom:8px" onclick="plvCloseModal();plvOpenConfirm(${m.id})">${m.taken + m.given === 0 && m.event_type !== 'ADJUSTMENT' ? 'Διόρθωση ποσοτήτων' : 'Επιβεβαίωση'}</button>
      <button class="plv-btn-danger" style="width:100%" onclick="plvPanelDelete(${m.id})">Διαγραφή εκκρεμούς</button>`
    : m.status === 'confirmed' && m.event_type === 'DELIVERY' ? `
      <button class="btn-new-order" style="width:100%" onclick="plvCloseModal();plvFixDelivery(${m.id})">Διόρθωση ανταλλαγής</button>`
    : m.status === 'confirmed' ? `
      <div class="plv-hint" style="margin-bottom:6px">Οι οριστικές δεν σβήνονται — μόνο αντιλογισμός, με αιτιολογία:</div>
      <div class="plv-f"><input id="plvRevReason" type="text" placeholder="Αιτιολογία αντιλογισμού"></div>
      <button class="plv-btn-danger" style="width:100%;margin-top:8px" onclick="plvPanelReverse(${m.id})">Αντιλογισμός</button>`
    : '';
  document.getElementById('plvModal').innerHTML = `
  <div class="plv-overlay" style="display:block;background:rgba(11,25,41,.35)" onclick="if(event.target===this)plvCloseModal()">
    <div class="plv-panel">
      <div class="plv-mhead" style="padding:0">
        <h3>${m.code}</h3>
        <span class="plv-mclose" onclick="plvCloseModal()" title="Κλείσιμο (Esc)">✕</span>
      </div>
      <div style="margin:8px 0 14px">${_plvPill(m.status)}</div>
      ${row('Είδος', PLV_EVENT_GR[m.event_type] || m.event_type)}
      ${row('Αντισυμβαλλόμενος', escapeHtml(_plvName(m)))}
      ${row('Σημείο', escapeHtml(_plvLoc(m)) || '—')}
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
  <div class="plv-overlay" onclick="if(event.target===this)plvCloseModal()">
    <div class="plv-modal plv-sm">
      <div class="plv-mhead"><h3>Διόρθωση ανταλλαγής — ${m.code}</h3><span class="plv-mclose" onclick="plvCloseModal()" title="Κλείσιμο (Esc)">✕</span></div>
      <div class="plv-mbody">
        <div class="plv-hint" style="margin-top:-8px">Δώσαμε ${m.given} γεμάτες. Πόσες άδειες πήραμε ΠΡΑΓΜΑΤΙΚΑ;</div>
        ${_plvField('Πήραμε (πραγματικά)', `<input id="plvRealTaken" type="number" min="0" value="0">`)}
        ${_plvField('Σημείωση (τι έγινε)', `<input id="plvFixNote" type="text" placeholder="π.χ. Lidl — δεν είχαν άδειες">`)}
      </div>
      <div class="plv-mfoot">
        <span class="plv-sp"></span>
        <button class="plv-btn-ghost" onclick="plvCloseModal()">Άκυρο</button>
        <button class="btn-new-order" onclick="plvDoFix(${m.id})">Καταχώρηση διόρθωσης</button>
      </div>
    </div>
  </div>`;
  document.addEventListener('keydown', _plvEsc);
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
      box.innerHTML = '<div style="color:var(--danger)">Σφάλμα αναζήτησης: ' + escapeHtml(e.message) + '</div>';
      box.style.display = 'block';
      return;
    }
    PLV_AC.rows[field] = rows;
    box.innerHTML = rows.length
      ? rows.map((r, i) => `<div onmousedown="plvAcPick('${field}',${i})">${escapeHtml(r.name || '')}` +
          (r.kind === 'P' ? ' <span class="plv-dim">· partner</span>' : '') + '</div>').join('')
      : '<div class="plv-dim">Καμία εγγραφή</div>';
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

/* ── Νέα χειροκίνητη κίνηση (Figma w2-pallet-movement-form) ── */
function plvNewMovement() {
  PLV_AC.rows = {};
  const ac = (field, type, ph) => `<div style="position:relative">
          <input id="plvAcQ_${field}" type="text" autocomplete="off" placeholder="${ph}"
            oninput="plvAcSearch('${field}','${type}')" onblur="plvAcBlur('${field}')">
          <input type="hidden" id="${field}" value="">
          <div class="plv-ac" id="plvAcList_${field}" style="display:none"></div>
        </div>`;
  document.getElementById('plvModal').innerHTML = `
  <div class="plv-overlay" onclick="if(event.target===this)plvCloseModal()">
    <div class="plv-modal">
      <div class="plv-mhead"><h3>Νέα Κίνηση Παλετών</h3><span class="plv-mclose" onclick="plvCloseModal()" title="Κλείσιμο (Esc)">✕</span></div>
      <div class="plv-mbody">
        <div class="plv-grid2">
          ${_plvField('Είδος *', `<select id="plvNmType">
            <option value="RETURN_OUT">Επιστροφή αδειών (δίνουμε)</option>
            <option value="RETURN_IN">Παραλαβή αδειών (παίρνουμε)</option>
            <option value="PARTNER_PICKUP">Partner πήρε από εμάς</option>
            <option value="PARTNER_DROPOFF">Partner μάς έφερε</option>
            <option value="ADJUSTMENT">Τακτοποίηση/διαγραφή οφειλής (μόνο owner)</option>
          </select>`)}
          ${_plvField('Ημερομηνία', `<input id="plvNmDate" type="date" value="${new Date().toISOString().slice(0, 10)}" min="2020-01-01" max="2030-12-31">`)}
        </div>
        <div class="plv-grid2">
          ${_plvField('Αντισυμβαλλόμενος *', ac('plvNmParty', 'party', 'Πελάτης ή partner — 2+ γράμματα'))}
          ${_plvField('Σημείο (προαιρετικό)', ac('plvNmLoc', 'locations', 'Τοποθεσία — 2+ γράμματα'))}
        </div>
        <div class="plv-grid2">
          ${_plvField('Πήραμε (παλέτες)', `<input id="plvNmTaken" type="number" min="0" value="0">`)}
          ${_plvField('Δώσαμε (παλέτες)', `<input id="plvNmGiven" type="number" min="0" value="0">`)}
        </div>
        ${_plvField('Αιτιολογία', `<input id="plvNmReason" type="text">`, 'υποχρεωτική μόνο για Τακτοποίηση')}
        ${_plvField('Σημείωση', `<input id="plvNmNote" type="text">`)}
        ${_plvDropzone()}
      </div>
      <div class="plv-mfoot">
        <span>Χωρίς δελτίο η κίνηση μένει «εκκρεμής» μέχρι να την επιβεβαιώσει κάποιος (με ή χωρίς δελτίο)</span>
        <span class="plv-sp"></span>
        <button class="plv-btn-ghost" onclick="plvCloseModal()">Άκυρο</button>
        <button class="btn-new-order" onclick="plvDoCreate()">Καταχώρηση</button>
      </div>
    </div>
  </div>`;
  document.addEventListener('keydown', _plvEsc);
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
    // Πύλη δελτίων (owner 25/8, frame 2/9): ΜΕ δελτίο η κίνηση γίνεται
    // οριστική αμέσως· ΧΩΡΙΣ δελτίο μένει εκκρεμής μέχρι να επιβεβαιωθεί —
    // η επιβεβαίωση ΔΕΝ απαιτεί δελτίο: ο Worker δέχεται sheet_source 'MANUAL'
    // (ελεγκτής 3/9 — το παλιό σχόλιο έλεγε «με δελτίο» και υπερέβαλλε)
    // με δελτίο. Πριν (12/8) όλες οριστικοποιούνταν στην καταχώρηση.
    const body = {
      movement_date: md,
      counterparty_type: kind === 'C' ? 'CLIENT' : 'PARTNER',
      event_type: document.getElementById('plvNmType').value,
      taken: parseInt(document.getElementById('plvNmTaken').value, 10) || 0,
      given: parseInt(document.getElementById('plvNmGiven').value, 10) || 0,
      notes: document.getElementById('plvNmNote').value || null,
      reason: (document.getElementById('plvNmReason') || {}).value || null,
      sheet_source: path ? 'UPLOAD' : 'MANUAL',
      confirm: !!path
    };
    if (kind === 'C') body.client_id = parseInt(pid, 10); else body.partner_id = parseInt(pid, 10);
    const loc = document.getElementById('plvNmLoc').value;
    if (loc) body.location_id = parseInt(loc, 10);
    if (path) body.sheet_url = path;
    await plFetch('/pallets/movements', { method: 'POST', body });
    toast(path ? 'Κίνηση καταχωρήθηκε και οριστικοποιήθηκε ✓' : 'Κίνηση καταχωρήθηκε ως εκκρεμής — θέλει επιβεβαίωση');
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
window.plvFilePicked = plvFilePicked; window.plvFileDropped = plvFileDropped;
// Τα inline oninput/onmousedown/onblur του typeahead τρέχουν σε global scope.
window.plvAcSearch = plvAcSearch; window.plvAcPick = plvAcPick; window.plvAcBlur = plvAcBlur;
