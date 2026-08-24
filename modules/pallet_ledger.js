// ═══════════════════════════════════════════════════════════
// MODULE — ΙΣΟΖΥΓΙΟ ΠΑΛΕΤΩΝ (Φ2 minimal: εκκρεμείς + διορθώσεις + νέα κίνηση)
// Πηγή: /pallets/* (Worker). Το πλήρες Ισοζύγιο (υπόλοιπα/drill-down) = Φ3.
// ═══════════════════════════════════════════════════════════
'use strict';

// q/from/to: το παλιό pallet_ledger page είχε φίλτρα + CSV — δεν τα χάνουμε
// (η λογίστρια τα χρησιμοποιεί καθημερινά· αφαίρεσή τους = οπισθοδρόμηση).
const PLV = { movements: [], lookups: null, balances: { clients: null, partners: null }, tab: 'pending', busy: false, q: '', from: '', to: '' };

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
  _plvDraw();
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

// Μερικό render, ΟΧΙ _plvDraw(): το πλήρες innerHTML ξαναχτίζει και το input
// της αναζήτησης, που χάνει το focus σε ΚΑΘΕ πλήκτρο — ο χρήστης έγραφε «elita»
// και έμενε μόνο το «e» (εύρημα audit 25/8). Ενημερώνεται μόνο ο πίνακας.
function plvFilter(key, val) {
  PLV[key] = val;
  const el = document.getElementById('plvTbl');
  const isBalanceTab = PLV.tab === 'clients' || PLV.tab === 'partners';
  if (el && !isBalanceTab) el.innerHTML = _plvTableHtml(_plvRows());
  else _plvDraw();
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
    head = ['Αντισυμβαλλόμενος', 'Υπόλοιπο', 'Ανοιχτό από', 'Ημέρες', 'Εκκρεμείς'];
    body = rows.map(b => {
      const days = b.open_since ? Math.floor((Date.now() - new Date(b.open_since + 'T00:00:00').getTime()) / 86400000) : '';
      return [b[nameKey] || ('#' + b[idKey]), b.balance, b.open_since || '', days, b.pending_count || 0].map(esc).join(',');
    });
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

function _plvOverview() {
  const all = [...(PLV.balances.clients || []), ...(PLV.balances.partners || [])];
  const owed = all.filter(b => b.balance > 0).reduce((s, b) => s + b.balance, 0);
  const owe  = all.filter(b => b.balance < 0).reduce((s, b) => s - b.balance, 0);
  const net = owed - owe;
  const box = (lbl, val, col) => `<div style="flex:1 1 150px;background:var(--panel,#fff);border:1px solid var(--line,#e2e8f0);border-radius:10px;padding:12px 16px">
    <div style="font-size:11px;color:var(--panel-dim);text-transform:uppercase;letter-spacing:.04em">${lbl}</div>
    <div style="font-family:Syne;font-size:22px;font-weight:700;color:${col}">${val} pal</div></div>`;
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:16px 0">
    ${box('Μας οφείλουν', owed, '#15803D')}
    ${box('Οφείλουμε', owe, '#B91C1C')}
    ${box('Καθαρό', (net > 0 ? '+' : '') + net, net >= 0 ? 'var(--accent)' : '#B91C1C')}
  </div>`;
}

function _plvDays(d) {
  if (!d) return '';
  const days = Math.floor((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86400000);
  return days <= 0 ? 'σήμερα' : days + ' ημ.';
}

function _plvBalanceTable(kind) {
  const rows = (PLV.balances[kind] || [])
    .filter(b => b.balance !== 0 || b.pending_count > 0)
    .sort((a, b) => b.balance - a.balance); // πρώτα όποιος μας χρωστάει τα περισσότερα
  if (!rows.length) return '<div style="padding:30px;text-align:center;color:var(--panel-dim)">Κανένα ανοιχτό υπόλοιπο</div>';
  const idKey = kind === 'clients' ? 'client_id' : 'partner_id';
  const nameKey = kind === 'clients' ? 'client_name' : 'partner_name';
  return `<div style="overflow-x:auto"><table class="plv-tbl" style="width:100%;border-collapse:collapse;font-size:13px">
    <tr style="text-align:left;color:var(--panel-dim)">
      <th>${kind === 'clients' ? 'Πελάτης' : 'Συνεργάτης'}</th>
      <th style="text-align:right">Υπόλοιπο</th><th>Ανοιχτό από</th>
      <th style="text-align:right">Εκκρεμείς</th><th></th></tr>
    ${rows.map(b => `<tr style="border-top:1px solid var(--line,#e2e8f0);cursor:pointer" onclick="plvDrill('${kind}',${b[idKey]})">
      <td>${b[nameKey] || ('#' + b[idKey])}</td>
      <td style="text-align:right;font-weight:700;color:${b.balance > 0 ? '#15803D' : b.balance < 0 ? '#B91C1C' : 'inherit'}">${b.balance > 0 ? '+' : ''}${b.balance}</td>
      <td>${_plvDays(b.open_since)}</td>
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
  <div style="padding:20px;max-width:1100px">
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
      <input id="plvQ" placeholder="Αναζήτηση (κωδικός, όνομα, σημείο)" value="${PLV.q}" oninput="plvFilter('q',this.value)" style="flex:1 1 220px;padding:8px 12px;font-size:13px">
      <label style="font-size:12px;color:var(--panel-dim)">Από <input type="date" value="${PLV.from}" onchange="plvFilter('from',this.value)" style="padding:6px;font-size:13px"></label>
      <label style="font-size:12px;color:var(--panel-dim)">Έως <input type="date" value="${PLV.to}" onchange="plvFilter('to',this.value)" style="padding:6px;font-size:13px"></label>`}
      <button class="btn-scan" onclick="plvExportCSV()">Export CSV</button>
    </div>
    <div id="plvTbl">${isBalanceTab ? _plvBalanceTable(PLV.tab) : _plvTableHtml(rows)}</div>
  </div>
  <div id="plvModal"></div>`;
}

// Ο πίνακας κινήσεων σε δική του συνάρτηση ώστε το plvFilter να τον ξαναχτίζει
// ΧΩΡΙΣ να αγγίζει τα φίλτρα (βλ. σχόλιο στο plvFilter — focus).
function _plvTableHtml(rows) {
  return `
    <div style="overflow-x:auto">
    <style>.plv-tbl th,.plv-tbl td{padding:8px 12px}.plv-tbl th{white-space:nowrap}</style>
    <table class="plv-tbl" style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="text-align:left;color:var(--panel-dim)">
        <th style="padding:8px">Κωδ.</th><th>Ημ/νία</th><th>Είδος</th><th>Αντισυμβαλλόμενος</th>
        <th>Σημείο</th><th style="text-align:right">Πήραμε</th><th style="text-align:right">Δώσαμε</th>
        <th>Κατάσταση</th><th></th>
      </tr>
      ${rows.map(m => `
      <tr style="border-top:1px solid var(--line,#e2e8f0)">
        <td style="padding:8px">${m.code}</td>
        <td>${m.movement_date}</td>
        <td>${PLV_EVENT_GR[m.event_type] || m.event_type}</td>
        <td>${_plvName(m)}</td>
        <td>${_plvLoc(m)}</td>
        <td style="text-align:right">${m.taken}</td>
        <td style="text-align:right">${m.given}</td>
        <td>${m.status === 'pending' ? '<span style="color:#92400E;font-weight:600">εκκρεμής</span>' : m.status === 'confirmed' ? '<span style="color:var(--accent)">οριστική</span>' : 'αντιλογισμένη'}</td>
        <td style="white-space:nowrap">
          ${m.status === 'pending' ? (m.taken + m.given === 0 && m.event_type !== 'ADJUSTMENT'
            // 0/0 δεν παίρνει ενεργή «Επιβεβαίωση» — ο Worker την απορρίπτει
            // (taken+given>0) και ο χρήστης θα έτρωγε σφάλμα για πάντα. Το κουμπί
            // μένει ΚΛΙΚΑΡΙΣΤΟ ως «Διόρθωση»: το modal είναι ο μόνος τρόπος να
            // μπουν σωστές ποσότητες — αν κλείδωνε, η κίνηση δεν διορθωνόταν ποτέ.
            ? `<button class="btn-scan" style="padding:4px 12px;border-color:#92400E;color:#92400E" title="Μηδενικές ποσότητες — χρειάζεται διόρθωση πριν την επιβεβαίωση" onclick="plvOpenConfirm(${m.id})">Διόρθωση ποσοτήτων</button>`
            : `<button class="btn-scan" style="padding:4px 12px" onclick="plvOpenConfirm(${m.id})">Επιβεβαίωση</button>`) : ''}
          ${m.status === 'confirmed' && m.event_type === 'DELIVERY' ? `<button class="btn-scan" style="padding:4px 12px" onclick="plvFixDelivery(${m.id})">Διόρθωση ανταλλαγής</button>` : ''}
          ${m.sheet_url ? `<a href="#" onclick="plvViewSheet('${m.sheet_url.replace(/'/g, '')}');return false" style="margin-left:6px;font-size:12px">δελτίο</a>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="9" style="padding:30px;text-align:center;color:var(--panel-dim)">Καμία κίνηση εδώ</td></tr>'}
    </table>
    </div>`;
}

function plvTab(t) { PLV.tab = t; _plvDraw(); }

/* ── Ανάλυση υπολοίπου (drill-down): ανά σημείο + ιστορικό ── */
async function plvDrill(kind, id) {
  const nameKey = kind === 'clients' ? 'client_name' : 'partner_name';
  const idKey = kind === 'clients' ? 'client_id' : 'partner_id';
  const row = (PLV.balances[kind] || []).find(b => b[idKey] === id);
  const el = document.getElementById('plvModal');
  el.innerHTML = '<div style="position:fixed;inset:0;background:rgba(11,25,41,.55);display:flex;align-items:center;justify-content:center;z-index:1000"><div style="background:var(--panel,#fff);color:var(--panel-text,#0F172A);border-radius:12px;padding:24px">Φόρτωση...</div></div>';
  try {
    const q = kind === 'clients' ? 'client_id=' + id : 'partner_id=' + id;
    const [hist, locs] = await Promise.all([
      plFetch('/pallets/movements?' + q),
      kind === 'clients' ? plFetch('/pallets/balances/clients/' + id) : Promise.resolve({ records: [] })
    ]);
    const moves = (hist.records || []).filter(m => m.status !== 'reversed');
    const locRows = (locs.records || []).filter(l => l.balance !== 0);
    el.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(11,25,41,.55);display:flex;align-items:center;justify-content:center;z-index:1000" onclick="if(event.target===this)plvCloseModal()">
      <div style="background:var(--panel,#fff);color:var(--panel-text,#0F172A);border-radius:12px;padding:24px;width:min(720px,94vw);max-height:88vh;overflow:auto">
        <h3 style="font-family:Syne;margin:0 0 4px">${row ? row[nameKey] : ''}</h3>
        <div style="font-size:13px;color:var(--panel-dim);margin-bottom:16px">
          Υπόλοιπο <b style="color:${row && row.balance > 0 ? '#15803D' : '#B91C1C'}">${row ? (row.balance > 0 ? '+' : '') + row.balance : '—'} pal</b>
          ${row && row.open_since ? ' · ανοιχτό ' + _plvDays(row.open_since) : ''}</div>
        ${locRows.length ? `<div style="font-size:12px;font-weight:700;color:var(--panel-dim);margin-bottom:6px">ΑΝΑ ΣΗΜΕΙΟ</div>
        <table class="plv-tbl" style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px">
          ${locRows.map(l => `<tr style="border-top:1px solid var(--line,#e2e8f0)"><td>${l.location_name || '—'}</td>
          <td style="text-align:right;font-weight:700;color:${l.balance > 0 ? '#15803D' : '#B91C1C'}">${l.balance > 0 ? '+' : ''}${l.balance}</td></tr>`).join('')}
        </table>` : ''}
        <div style="font-size:12px;font-weight:700;color:var(--panel-dim);margin-bottom:6px">ΙΣΤΟΡΙΚΟ</div>
        <table class="plv-tbl" style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="text-align:left;color:var(--panel-dim)"><th>Ημ/νία</th><th>Είδος</th><th>Σημείο</th>
            <th style="text-align:right">Πήραμε</th><th style="text-align:right">Δώσαμε</th><th>Κατάσταση</th></tr>
          ${moves.map(m => `<tr style="border-top:1px solid var(--line,#e2e8f0)">
            <td>${m.movement_date}</td><td>${PLV_EVENT_GR[m.event_type] || m.event_type}</td>
            <td>${_plvLoc(m)}</td><td style="text-align:right">${m.taken}</td>
            <td style="text-align:right">${m.given}</td>
            <td>${m.status === 'pending' ? 'εκκρεμής' : 'οριστική'}</td></tr>`).join('') ||
            '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--panel-dim)">Καμία κίνηση</td></tr>'}
        </table>
        <div style="display:flex;justify-content:flex-end;margin-top:16px">
          <button class="btn-scan" onclick="plvCloseModal()">Κλείσιμο</button></div>
      </div>
    </div>`;
  } catch (e) {
    el.innerHTML = '';
    showErrorToast('Αποτυχία ανάλυσης: ' + e.message, 'error');
  }
}

/* ── Modal επιβεβαίωσης εκκρεμούς ── */
function plvOpenConfirm(id) {
  const m = PLV.movements.find(x => x.id === id);
  if (!m) return;
  // Ο κανόνας του Worker (taken+given>0, εκτός ADJUSTMENT) εφαρμόζεται ΚΑΙ εδώ:
  // η υποβολή κλειδώνει όσο 0/0 και εξηγεί, αντί να επιστρέφει 400 μετά (αρχή 1).
  const needsQty = m.event_type !== 'ADJUSTMENT';
  const zero = needsQty && m.taken + m.given === 0;
  document.getElementById('plvModal').innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(11,25,41,.55);display:flex;align-items:center;justify-content:center;z-index:1000" onclick="if(event.target===this)plvCloseModal()">
    <div style="background:var(--panel,#fff);color:var(--panel-text,#0F172A);border-radius:12px;padding:24px;width:min(440px,92vw)">
      <h3 style="font-family:Syne;margin:0 0 6px">Επιβεβαίωση — ${m.code}</h3>
      <div style="font-size:13px;color:var(--panel-dim);margin-bottom:14px">${PLV_EVENT_GR[m.event_type]} · ${_plvName(m)}</div>
      <label style="font-size:13px">Πήραμε (παλέτες)<input id="plvTaken" type="number" min="0" value="${m.taken}" ${needsQty ? 'oninput="plvZeroCheck()"' : ''} style="width:100%;padding:10px;margin:4px 0 12px;font-size:16px"></label>
      <label style="font-size:13px">Δώσαμε (παλέτες)<input id="plvGiven" type="number" min="0" value="${m.given}" ${needsQty ? 'oninput="plvZeroCheck()"' : ''} style="width:100%;padding:10px;margin:4px 0 12px;font-size:16px"></label>
      <div id="plvZeroNote" style="display:${zero ? 'block' : 'none'};font-size:12px;color:#92400E;margin:0 0 12px">Μηδενικές ποσότητες — χρειάζεται διόρθωση: συμπλήρωσε πόσες παλέτες πήραμε ή δώσαμε για να ενεργοποιηθεί η επιβεβαίωση.</div>
      <label style="font-size:13px">Δελτίο (φωτο/PDF — προαιρετικό)<input id="plvFile" type="file" accept="image/*,.pdf" style="width:100%;margin:4px 0 14px"></label>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-scan" onclick="plvCloseModal()">Άκυρο</button>
        <button id="plvConfirmGo" class="btn-new-order" ${zero ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''} onclick="plvDoConfirm(${m.id})">Επιβεβαίωση κίνησης</button>
      </div>
    </div>
  </div>`;
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
function plvCloseModal() { document.getElementById('plvModal').innerHTML = ''; }

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
    plvCloseModal(); await renderPalletLedger();
  } catch (e) { showErrorToast('Αποτυχία επιβεβαίωσης: ' + e.message, 'error'); }
  finally { PLV.busy = false; }
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
      <label style="font-size:13px">Ημερομηνία<input id="plvNmDate" type="date" value="${new Date().toISOString().slice(0, 10)}" style="width:100%;padding:10px;margin:4px 0 12px"></label>
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
window.plvNewMovement = plvNewMovement; window.plvDoCreate = plvDoCreate; window.plvViewSheet = plvViewSheet;
window.plvFilter = plvFilter; window.plvExportCSV = plvExportCSV;
window.plvDrill = plvDrill;
// Τα inline oninput/onmousedown/onblur του typeahead τρέχουν σε global scope.
window.plvAcSearch = plvAcSearch; window.plvAcPick = plvAcPick; window.plvAcBlur = plvAcBlur;
