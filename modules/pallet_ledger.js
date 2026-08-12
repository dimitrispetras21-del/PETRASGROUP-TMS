// ═══════════════════════════════════════════════════════════
// MODULE — ΙΣΟΖΥΓΙΟ ΠΑΛΕΤΩΝ (Φ2 minimal: εκκρεμείς + διορθώσεις + νέα κίνηση)
// Πηγή: /pallets/* (Worker). Το πλήρες Ισοζύγιο (υπόλοιπα/drill-down) = Φ3.
// ═══════════════════════════════════════════════════════════
'use strict';

// q/from/to: το παλιό pallet_ledger page είχε φίλτρα + CSV — δεν τα χάνουμε
// (η λογίστρια τα χρησιμοποιεί καθημερινά· αφαίρεσή τους = οπισθοδρόμηση).
const PLV = { movements: [], lookups: null, tab: 'pending', busy: false, q: '', from: '', to: '' };

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
  } catch (e) {
    c.innerHTML = `<div style="padding:40px;color:var(--danger)">Σφάλμα φόρτωσης: ${e.message}</div>`;
    return;
  }
  _plvDraw();
}

function _plvName(m) {
  if (m.counterparty_type === 'CLIENT') {
    const cl = (PLV.lookups.clients || []).find(x => x.id === m.client_id);
    return cl ? cl.company_name : ('Πελάτης #' + m.client_id);
  }
  const p = (PLV.lookups.partners || []).find(x => x.id === m.partner_id);
  return p ? p.company_name : ('Partner #' + m.partner_id);
}
function _plvLoc(m) {
  const l = (PLV.lookups.locations || []).find(x => x.id === m.location_id);
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

function plvFilter(key, val) { PLV[key] = val; _plvDraw(); }

function plvExportCSV() {
  const rows = _plvRows();
  if (!rows.length) { toast('Καμία κίνηση για εξαγωγή', 'error'); return; }
  const head = ['Κωδικός', 'Ημερομηνία', 'Είδος', 'Αντισυμβαλλόμενος', 'Σημείο', 'Πήραμε', 'Δώσαμε', 'Καθαρό', 'Κατάσταση', 'Σημείωση'];
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const body = rows.map(m => [m.code, m.movement_date, PLV_EVENT_GR[m.event_type] || m.event_type,
    _plvName(m), _plvLoc(m), m.taken, m.given, m.given - m.taken, m.status, m.notes || ''].map(esc).join(','));
  // BOM: χωρίς αυτό το Excel δείχνει τα ελληνικά ως μουτζούρες
  const blob = new Blob(['﻿' + [head.map(esc).join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'paletes-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click(); URL.revokeObjectURL(a.href);
  toast('CSV εξήχθη ✓');
}

function _plvDraw() {
  const c = document.getElementById('content');
  const pend = PLV.movements.filter(m => m.status === 'pending').length;
  const rows = _plvRows();
  c.innerHTML = `
  <div style="padding:20px;max-width:1100px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <h1 style="font-family:Syne;font-size:22px;margin:0">Ισοζύγιο Παλετών</h1>
      <button class="btn-new-order" onclick="plvNewMovement()">+ Νέα κίνηση</button>
    </div>
    <div style="display:flex;gap:8px;margin:16px 0;flex-wrap:wrap">
      ${[['pending', 'Εκκρεμείς (' + pend + ')'], ['noreturn', 'Χωρίς πλήρη επιστροφή'], ['all', 'Όλες οι κινήσεις']].map(([id, lbl]) =>
        `<button onclick="plvTab('${id}')" style="padding:8px 16px;border-radius:20px;border:1px solid var(--accent);cursor:pointer;font-size:13px;${PLV.tab === id ? 'background:var(--accent);color:#fff' : 'background:transparent;color:var(--accent)'}">${lbl}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <input id="plvQ" placeholder="Αναζήτηση (κωδικός, όνομα, σημείο)" value="${PLV.q}" oninput="plvFilter('q',this.value)" style="flex:1 1 220px;padding:8px 12px;font-size:13px">
      <label style="font-size:12px;color:var(--panel-dim)">Από <input type="date" value="${PLV.from}" onchange="plvFilter('from',this.value)" style="padding:6px;font-size:13px"></label>
      <label style="font-size:12px;color:var(--panel-dim)">Έως <input type="date" value="${PLV.to}" onchange="plvFilter('to',this.value)" style="padding:6px;font-size:13px"></label>
      <button class="btn-scan" onclick="plvExportCSV()">Export CSV</button>
    </div>
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
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
          ${m.status === 'pending' ? `<button class="btn-scan" style="padding:4px 12px" onclick="plvOpenConfirm(${m.id})">Επιβεβαίωση</button>` : ''}
          ${m.status === 'confirmed' && m.event_type === 'DELIVERY' ? `<button class="btn-scan" style="padding:4px 12px" onclick="plvFixDelivery(${m.id})">Διόρθωση ανταλλαγής</button>` : ''}
          ${m.sheet_url ? `<a href="#" onclick="plvViewSheet('${m.sheet_url.replace(/'/g, '')}');return false" style="margin-left:6px;font-size:12px">δελτίο</a>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="9" style="padding:30px;text-align:center;color:var(--panel-dim)">Καμία κίνηση εδώ</td></tr>'}
    </table>
    </div>
  </div>
  <div id="plvModal"></div>`;
}

function plvTab(t) { PLV.tab = t; _plvDraw(); }

/* ── Modal επιβεβαίωσης εκκρεμούς ── */
function plvOpenConfirm(id) {
  const m = PLV.movements.find(x => x.id === id);
  if (!m) return;
  document.getElementById('plvModal').innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(11,25,41,.55);display:flex;align-items:center;justify-content:center;z-index:1000" onclick="if(event.target===this)plvCloseModal()">
    <div style="background:var(--panel,#fff);border-radius:12px;padding:24px;width:min(440px,92vw)">
      <h3 style="font-family:Syne;margin:0 0 6px">Επιβεβαίωση — ${m.code}</h3>
      <div style="font-size:13px;color:var(--panel-dim);margin-bottom:14px">${PLV_EVENT_GR[m.event_type]} · ${_plvName(m)}</div>
      <label style="font-size:13px">Πήραμε (παλέτες)<input id="plvTaken" type="number" min="0" value="${m.taken}" style="width:100%;padding:10px;margin:4px 0 12px;font-size:16px"></label>
      <label style="font-size:13px">Δώσαμε (παλέτες)<input id="plvGiven" type="number" min="0" value="${m.given}" style="width:100%;padding:10px;margin:4px 0 12px;font-size:16px"></label>
      <label style="font-size:13px">Δελτίο (φωτο/PDF — προαιρετικό)<input id="plvFile" type="file" accept="image/*,.pdf" style="width:100%;margin:4px 0 14px"></label>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-scan" onclick="plvCloseModal()">Άκυρο</button>
        <button class="btn-new-order" onclick="plvDoConfirm(${m.id})">Επιβεβαίωση κίνησης</button>
      </div>
    </div>
  </div>`;
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
    <div style="background:var(--panel,#fff);border-radius:12px;padding:24px;width:min(440px,92vw)">
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

/* ── Νέα χειροκίνητη κίνηση ── */
function plvNewMovement() {
  const cls = (PLV.lookups.clients || []).map(c => `<option value="C:${c.id}">${c.company_name}</option>`).join('');
  const prs = (PLV.lookups.partners || []).map(p => `<option value="P:${p.id}">${p.company_name}</option>`).join('');
  const locs = (PLV.lookups.locations || []).map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  document.getElementById('plvModal').innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(11,25,41,.55);display:flex;align-items:center;justify-content:center;z-index:1000" onclick="if(event.target===this)plvCloseModal()">
    <div style="background:var(--panel,#fff);border-radius:12px;padding:24px;width:min(460px,92vw);max-height:90vh;overflow:auto">
      <h3 style="font-family:Syne;margin:0 0 14px">Νέα κίνηση παλετών</h3>
      <label style="font-size:13px">Είδος<select id="plvNmType" style="width:100%;padding:10px;margin:4px 0 12px">
        <option value="RETURN_OUT">Επιστροφή αδειών (δίνουμε)</option>
        <option value="RETURN_IN">Παραλαβή αδειών (παίρνουμε)</option>
        <option value="PARTNER_PICKUP">Partner πήρε από εμάς</option>
        <option value="PARTNER_DROPOFF">Partner μάς έφερε</option>
        <option value="ADJUSTMENT">Τακτοποίηση/διαγραφή οφειλής (μόνο owner)</option>
      </select></label>
      <label style="font-size:13px">Αιτιολογία (υποχρεωτική για τακτοποίηση)<input id="plvNmReason" type="text" style="width:100%;padding:10px;margin:4px 0 12px"></label>
      <label style="font-size:13px">Αντισυμβαλλόμενος<select id="plvNmParty" style="width:100%;padding:10px;margin:4px 0 12px">
        <optgroup label="Πελάτες">${cls}</optgroup><optgroup label="Partners">${prs}</optgroup>
      </select></label>
      <label style="font-size:13px">Σημείο (προαιρετικό)<select id="plvNmLoc" style="width:100%;padding:10px;margin:4px 0 12px"><option value="">—</option>${locs}</select></label>
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
    const [kind, pid] = document.getElementById('plvNmParty').value.split(':');
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
window.plvNewMovement = plvNewMovement; window.plvDoCreate = plvDoCreate; window.plvViewSheet = plvViewSheet;
window.plvFilter = plvFilter; window.plvExportCSV = plvExportCSV;
