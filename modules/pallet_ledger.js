// ═══════════════════════════════════════════════════════════
// MODULE — PALLET LEDGER (2-table model)
// Suppliers ledger + Partners ledger. Each entry linked to ORDER_STOP.
// Rule: unloading stops never create entries. Partners only on INTL leg.
// ═══════════════════════════════════════════════════════════
// Module state uses 'PL' / '_pl' prefix to avoid global collisions.
'use strict';

const PL = {
  supplierRecs: [],   // entries from PALLET_LEDGER_SUPPLIERS
  partnerRecs:  [],   // entries from PALLET_LEDGER_PARTNERS
  partners: [],
  locations: [],
  clients: [],
  orders: [],         // combined INTL + NAT orders with Pallet Exchange=ON
  stopsByOrder: {},   // { orderId: [stop records] }
  filters: { from: '', to: '', direction: '', _q: '', tab: 'suppliers' }, // tab=suppliers|partners
};

/* ── Main render ─────────────────────────────── */
async function renderPalletLedger() {
  const c = document.getElementById('content');
  c.style.padding = ''; c.style.overflow = '';
  c.innerHTML = '<div style="text-align:center;padding:60px;color:#94A3B8">Loading Pallet Ledger...</div>';

  const [supRecs, partRecs, partners, locations, clients, intlOrders, natOrders] = await Promise.all([
    atGetAll(TABLES.PALLET_LEDGER_SUPPLIERS, {
      fields: ['Date','Direction','Pallets','Pallet Type','Order Stop','Loading Supplier',
               'AI Extracted','Verified','Notes'],
      sort: [{ field: 'Date', direction: 'desc' }],
    }).catch(() => []),
    atGetAll(TABLES.PALLET_LEDGER_PARTNERS, {
      fields: ['Date','Direction','Pallets','Pallet Type','Order Stop','Partner',
               'AI Extracted','Verified','Notes'],
      sort: [{ field: 'Date', direction: 'desc' }],
    }).catch(() => []),
    preloadReferenceData().then(() => getRefPartners()),
    preloadReferenceData().then(() => getRefLocations()),
    preloadReferenceData().then(() => getRefClients()),
    atGetAll(TABLES.ORDERS, { fields: ['Order Number','Client','Loading DateTime','Pallet Exchange','Veroia Switch','Direction'] }, true).catch(() => []),
    atGetAll(TABLES.NAT_ORDERS, { fields: ['Name','Client','Loading DateTime','Pallet Exchange'] }, true).catch(() => []),
  ]);

  PL.supplierRecs = supRecs;
  PL.partnerRecs  = partRecs;
  PL.partners     = partners;
  PL.locations    = locations;
  PL.clients      = clients;
  PL.orders = [
    ...intlOrders.filter(r => r.fields['Pallet Exchange']).map(r => ({
      id: r.id, type: 'intl',
      isVS: !!r.fields['Veroia Switch'],
      direction: r.fields['Direction'],
      label: `INTL ${r.fields['Order Number']||r.id.slice(-5)} — ${(r.fields['Loading DateTime']||'').slice(0,10)}`
    })),
    ...natOrders.filter(r => r.fields['Pallet Exchange']).map(r => ({
      id: r.id, type: 'nat', isVS: false,
      label: `NAT ${r.fields['Name']||r.id.slice(-5)} — ${(r.fields['Loading DateTime']||'').slice(0,10)}`
    })),
  ].sort((a,b) => a.label.localeCompare(b.label));

  _plRender();
}

/* ── Load stops for an order (lazy, cached) ─ */
async function _plLoadStopsForOrder(orderId, orderType) {
  if (PL.stopsByOrder[orderId]) return PL.stopsByOrder[orderId];
  try {
    const parentField = orderType === 'intl' ? F.STOP_PARENT_ORDER : F.STOP_PARENT_NAT;
    const stops = await atGetAll(TABLES.ORDER_STOPS, {
      filterByFormula: `FIND("${orderId}",ARRAYJOIN({${parentField}},","))>0`,
      fields: [F.STOP_NUMBER, F.STOP_TYPE, F.STOP_LOCATION, F.STOP_DATETIME, F.STOP_PALLETS]
    }, false);
    stops.sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0));
    PL.stopsByOrder[orderId] = stops;
    return stops;
  } catch(e) { console.warn('stops load failed:', e); return []; }
}

/* ── Helpers ──────────────────────────────────── */
function _plLocName(id) {
  const loc = PL.locations.find(l => l.id === id);
  return loc ? (loc.fields['Name'] || loc.fields['City'] || id) : (id?.substring(0,8) || '—');
}
function _plPartnerName(id) {
  const p = PL.partners.find(p => p.id === id);
  return p ? (p.fields['Company Name'] || id) : (id?.substring(0,8) || '—');
}

/* ── Balances ─────────────────────────────────── */
function _plBalances() {
  const supBal = {}, partBal = {};
  for (const r of PL.supplierRecs) {
    const f = r.fields;
    const sign = f['Direction'] === 'OUT' ? 1 : -1;
    const lid = Array.isArray(f['Loading Supplier']) ? f['Loading Supplier'][0] : null;
    if (lid) supBal[lid] = (supBal[lid] || 0) + sign * (f['Pallets']||0);
  }
  for (const r of PL.partnerRecs) {
    const f = r.fields;
    const sign = f['Direction'] === 'OUT' ? 1 : -1;
    const pid = Array.isArray(f['Partner']) ? f['Partner'][0] : null;
    if (pid) partBal[pid] = (partBal[pid] || 0) + sign * (f['Pallets']||0);
  }
  const supTotal = Object.values(supBal).reduce((a,b)=>a+b,0);
  const partTotal = Object.values(partBal).reduce((a,b)=>a+b,0);
  const topSup = Object.entries(supBal).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([id,v])=>({name:_plLocName(id),amount:v}));
  const topPart = Object.entries(partBal).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([id,v])=>({name:_plPartnerName(id),amount:v}));
  return { supTotal, partTotal, topSup, topPart };
}

/* ── Active records (by tab) ──────────────────── */
function _plActive() {
  return PL.filters.tab === 'partners' ? PL.partnerRecs : PL.supplierRecs;
}
function _plActiveTable() {
  return PL.filters.tab === 'partners' ? TABLES.PALLET_LEDGER_PARTNERS : TABLES.PALLET_LEDGER_SUPPLIERS;
}

/* ── Filter ───────────────────────────────────── */
function _plFiltered() {
  const { from, to, direction, _q } = PL.filters;
  return _plActive().filter(r => {
    const f = r.fields;
    if (_q) {
      const q = _q.toLowerCase();
      const nameLookup = PL.filters.tab === 'partners'
        ? _plPartnerName(Array.isArray(f['Partner']) ? f['Partner'][0] : null)
        : _plLocName(Array.isArray(f['Loading Supplier']) ? f['Loading Supplier'][0] : null);
      if (!nameLookup.toLowerCase().includes(q)
        && !(f['Notes']||'').toLowerCase().includes(q)
        && !(f['Pallet Type']||'').toLowerCase().includes(q)) return false;
    }
    if (from && (f['Date']||'') < from) return false;
    if (to   && (f['Date']||'') > to)   return false;
    if (direction && f['Direction'] !== direction) return false;
    return true;
  });
}

/* ── Render ───────────────────────────────────── */
function _plRender() {
  const c = document.getElementById('content');
  const bal = _plBalances();
  const filtered = _plFiltered();
  const tab = PL.filters.tab;

  c.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <div>
      <h2 style="font-family:'Syne',sans-serif;font-size:22px;margin:0">Pallet Ledger</h2>
      <div style="font-size:13px;color:#94A3B8;margin-top:4px">${PL.supplierRecs.length} supplier · ${PL.partnerRecs.length} partner entries</div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" onclick="_plExportCSV()">Export CSV</button>
      <button class="btn btn-new-order" onclick="_plOpenCreate()">+ New Entry</button>
    </div>
  </div>

  <div class="pl-balance-cards">
    <div class="pl-balance-card">
      <h4>Suppliers Owe Us</h4>
      <div class="pl-big-num ${bal.supTotal>0?'positive':bal.supTotal<0?'negative':'zero'}">${bal.supTotal>0?'+':''}${bal.supTotal} pal</div>
    </div>
    <div class="pl-balance-card">
      <h4>Partners Owe Us</h4>
      <div class="pl-big-num ${bal.partTotal>0?'positive':bal.partTotal<0?'negative':'zero'}">${bal.partTotal>0?'+':''}${bal.partTotal} pal</div>
    </div>
    <div class="pl-balance-card">
      <h4>Top Supplier Debtors</h4>
      ${bal.topSup.length ? `<ul class="pl-debtor-list">${bal.topSup.map(d=>`<li><span>${d.name}</span><span class="pl-debtor-amt">+${d.amount}</span></li>`).join('')}</ul>` : '<div style="font-size:12px;color:#94A3B8">No debtors</div>'}
    </div>
    <div class="pl-balance-card">
      <h4>Top Partner Debtors</h4>
      ${bal.topPart.length ? `<ul class="pl-debtor-list">${bal.topPart.map(d=>`<li><span>${d.name}</span><span class="pl-debtor-amt">+${d.amount}</span></li>`).join('')}</ul>` : '<div style="font-size:12px;color:#94A3B8">No debtors</div>'}
    </div>
  </div>

  <!-- Tabs -->
  <div style="display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:12px">
    <button onclick="PL.filters.tab='suppliers';_plRender()" style="background:${tab==='suppliers'?'var(--accent,#0284C7)':'transparent'};color:${tab==='suppliers'?'#fff':'var(--text)'};border:none;padding:8px 16px;font:600 13px DM Sans;cursor:pointer;border-radius:6px 6px 0 0">Suppliers (${PL.supplierRecs.length})</button>
    <button onclick="PL.filters.tab='partners';_plRender()" style="background:${tab==='partners'?'var(--accent,#0284C7)':'transparent'};color:${tab==='partners'?'#fff':'var(--text)'};border:none;padding:8px 16px;font:600 13px DM Sans;cursor:pointer;border-radius:6px 6px 0 0">Partners (${PL.partnerRecs.length})</button>
  </div>

  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:end">
    <div style="display:flex;flex-direction:column;gap:2px">
      <label style="font-size:10px;color:#94A3B8;text-transform:uppercase">Search</label>
      <input type="text" value="${PL.filters._q||''}" oninput="PL.filters._q=this.value.toLowerCase().trim();_plRender()" style="padding:6px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px;width:180px" placeholder="name / notes...">
    </div>
    <div style="display:flex;flex-direction:column;gap:2px">
      <label style="font-size:10px;color:#94A3B8;text-transform:uppercase">From</label>
      <input type="date" value="${PL.filters.from}" onchange="PL.filters.from=this.value;_plRender()" style="padding:6px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px">
    </div>
    <div style="display:flex;flex-direction:column;gap:2px">
      <label style="font-size:10px;color:#94A3B8;text-transform:uppercase">To</label>
      <input type="date" value="${PL.filters.to}" onchange="PL.filters.to=this.value;_plRender()" style="padding:6px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px">
    </div>
    <div style="display:flex;flex-direction:column;gap:2px">
      <label style="font-size:10px;color:#94A3B8;text-transform:uppercase">Direction</label>
      <select onchange="PL.filters.direction=this.value;_plRender()" style="padding:6px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px">
        <option value="">All</option>
        <option value="OUT" ${PL.filters.direction==='OUT'?'selected':''}>OUT</option>
        <option value="IN"  ${PL.filters.direction==='IN' ?'selected':''}>IN</option>
      </select>
    </div>
    <div style="font-size:12px;color:#64748B;padding:8px">${filtered.length} records</div>
  </div>

  <table class="entity-table" style="width:100%">
    <thead>
      <tr>
        <th>Date</th><th>Dir</th><th>Pallets</th><th>${tab==='partners'?'Partner':'Supplier'}</th>
        <th>Stop</th><th>Verified</th><th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${filtered.length===0 ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:#94A3B8">No records</td></tr>` :
       filtered.map(r => {
        const f = r.fields;
        const dirClass = f['Direction']==='OUT' ? 'color:#10B981' : 'color:#EF4444';
        const name = tab==='partners'
          ? _plPartnerName(Array.isArray(f['Partner']) ? f['Partner'][0] : null)
          : _plLocName(Array.isArray(f['Loading Supplier']) ? f['Loading Supplier'][0] : null);
        const stopLabel = (Array.isArray(f['Order Stop']) && f['Order Stop'][0]) ? f['Order Stop'][0].slice(-6) : '—';
        return `<tr onclick="_plEdit('${r.id}')" style="cursor:pointer">
          <td>${f['Date']||'—'}</td>
          <td><span style="${dirClass};font-weight:700;font-size:12px">${f['Direction']||'—'}</span></td>
          <td style="font-weight:600">${f['Pallets']||0}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</td>
          <td style="font-size:11px;color:#64748B">${stopLabel}</td>
          <td>${f['Verified']?'✓':''}</td>
          <td>
            <button class="btn btn-sm" onclick="event.stopPropagation();_plEdit('${r.id}')" style="font-size:11px;padding:2px 8px">Edit</button>
            <button class="btn btn-sm" onclick="event.stopPropagation();_plDelete('${r.id}')" style="font-size:11px;padding:2px 8px;color:#EF4444">Del</button>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

/* ── Create / Edit modal ─────────────────────── */
function _plOpenCreate() { _plOpenForm(null); }
function _plEdit(id) { _plOpenForm(id); }

function _plOpenForm(recId) {
  const tab = PL.filters.tab;
  const rec = recId ? _plActive().find(r => r.id === recId) : null;
  const f = rec?.fields || {};
  const selOrderStop = Array.isArray(f['Order Stop']) ? f['Order Stop'][0] : null;

  const orderOpts = PL.orders.map(o =>
    `<option value="${o.id}" data-type="${o.type}" data-vs="${o.isVS||false}" data-dir="${o.direction||''}">${o.label}${o.isVS?' [VS]':''}</option>`
  ).join('');

  const partnerOpts = PL.partners.sort((a,b)=>(a.fields['Company Name']||'').localeCompare(b.fields['Company Name']||''))
    .map(p => {
      const sel = Array.isArray(f['Partner']) && f['Partner'][0]===p.id ? 'selected' : '';
      return `<option value="${p.id}" ${sel}>${p.fields['Company Name']||p.id}</option>`;
    }).join('');

  const html = `
  <div class="pu-overlay" id="plFormOverlay" onclick="if(event.target===this)document.getElementById('plFormOverlay').remove()">
    <div class="pu-modal" style="width:540px">
      <div class="pu-header">
        <h2>${recId?'Edit':'New'} ${tab==='partners'?'Partner':'Supplier'} Entry</h2>
        <button class="pu-close" onclick="document.getElementById('plFormOverlay').remove()">&times;</button>
      </div>
      <div class="pu-body">
        <div class="pu-form-grid">
          <div class="pu-field pu-full-width">
            <label>Order (required — pick first to load stops)</label>
            <select id="plf_order" onchange="_plOnOrderChange()">
              <option value="">— pick order —</option>${orderOpts}
            </select>
          </div>
          <div class="pu-field pu-full-width">
            <label>Stop (required)</label>
            <select id="plf_stop" disabled><option value="">— pick order first —</option></select>
          </div>
          <div class="pu-field">
            <label>Direction</label>
            <select id="plf_dir">
              <option value="OUT" ${f['Direction']==='OUT'?'selected':''}>OUT (we gave)</option>
              <option value="IN"  ${f['Direction']==='IN' ?'selected':''}>IN (we received)</option>
            </select>
          </div>
          <div class="pu-field">
            <label>Pallets</label>
            <input type="number" id="plf_pals" value="${f['Pallets']||0}" min="0">
          </div>
          <div class="pu-field">
            <label>Pallet Type</label>
            <select id="plf_ptype">
              ${['EUR/EPAL','CHEP','LPR','Other'].map(t => `<option value="${t}" ${f['Pallet Type']===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
          ${tab==='partners' ? `
          <div class="pu-field">
            <label>Partner (required)</label>
            <select id="plf_partner"><option value="">—</option>${partnerOpts}</select>
          </div>` : ''}
          <div class="pu-field">
            <label>Verified</label>
            <select id="plf_verified">
              <option value="false" ${!f['Verified']?'selected':''}>No</option>
              <option value="true"  ${f['Verified']?'selected':''}>Yes</option>
            </select>
          </div>
          <div class="pu-field pu-full-width">
            <label>Notes</label>
            <textarea id="plf_notes" rows="2">${f['Notes']||''}</textarea>
          </div>
          <div class="pu-field pu-full-width" id="plf_warning" style="display:none;padding:8px;background:#FEF3C7;color:#92400E;font-size:12px;border-radius:4px"></div>
        </div>
        <div class="pu-actions">
          <button class="btn" onclick="document.getElementById('plFormOverlay').remove()">Cancel</button>
          <button class="btn btn-new-order" onclick="_plSaveForm('${recId||''}')">${recId?'Update':'Create'}</button>
        </div>
      </div>
    </div>
  </div>`;

  document.getElementById('plFormOverlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);

  // Pre-populate if editing
  if (recId && selOrderStop) {
    // Find which order this stop belongs to (async — load all stops)
    (async () => {
      for (const o of PL.orders) {
        const stops = await _plLoadStopsForOrder(o.id, o.type);
        if (stops.find(s => s.id === selOrderStop)) {
          document.getElementById('plf_order').value = o.id;
          await _plOnOrderChange();
          document.getElementById('plf_stop').value = selOrderStop;
          _plValidateSelection();
          break;
        }
      }
    })();
  }
}

async function _plOnOrderChange() {
  const sel = document.getElementById('plf_order');
  const orderId = sel.value;
  const stopSel = document.getElementById('plf_stop');
  if (!orderId) {
    stopSel.innerHTML = '<option value="">— pick order first —</option>';
    stopSel.disabled = true;
    return;
  }
  const opt = sel.selectedOptions[0];
  const orderType = opt.dataset.type;
  stopSel.innerHTML = '<option value="">loading...</option>';
  stopSel.disabled = true;
  const stops = await _plLoadStopsForOrder(orderId, orderType);
  // ONLY Loading stops + Cross-dock stops (unloadings don't create entries)
  const valid = stops.filter(s => ['Loading','Cross-dock'].includes(s.fields[F.STOP_TYPE]));
  if (!valid.length) {
    stopSel.innerHTML = '<option value="">no eligible stops (only Loading/Cross-dock count)</option>';
    return;
  }
  stopSel.innerHTML = '<option value="">— pick stop —</option>' + valid.map(s => {
    const locId = (s.fields[F.STOP_LOCATION]||[])[0];
    const locName = _plLocName(locId);
    const n = s.fields[F.STOP_NUMBER] || '?';
    const t = s.fields[F.STOP_TYPE];
    return `<option value="${s.id}" data-loc="${locId}" data-type="${t}" data-date="${(s.fields[F.STOP_DATETIME]||'').slice(0,10)}">${t} #${n} — ${locName}</option>`;
  }).join('');
  stopSel.disabled = false;
  stopSel.onchange = _plValidateSelection;
}

function _plValidateSelection() {
  const warn = document.getElementById('plf_warning');
  if (!warn) return;
  const tab = PL.filters.tab;
  const orderSel = document.getElementById('plf_order');
  const stopSel = document.getElementById('plf_stop');
  const opt = orderSel.selectedOptions[0];
  const stopOpt = stopSel.selectedOptions[0];
  if (!opt || !stopOpt || !stopOpt.value) { warn.style.display = 'none'; return; }
  const stopType = stopOpt.dataset.type;
  const isVS = opt.dataset.vs === 'true';
  const orderType = opt.dataset.type;
  const isIntlLeg = (orderType === 'intl' && !isVS); // pure INTL

  const msgs = [];
  if (tab === 'partners') {
    // Partner entries: only on INTL leg (non-VS INTL loadings) OR crossdocks
    if (stopType === 'Loading' && !isIntlLeg) {
      msgs.push('⚠️ Partner entries μόνο σε INTL leg loadings (non-VS). Τα national legs δεν έχουν partner exchange.');
    }
  }
  warn.textContent = msgs.join(' ');
  warn.style.display = msgs.length ? 'block' : 'none';
}

async function _plSaveForm(recId) {
  const tab = PL.filters.tab;
  const orderSel = document.getElementById('plf_order');
  const stopSel  = document.getElementById('plf_stop');
  const stopId = stopSel.value;
  if (!stopId) { alert('Pick an Order and a Stop first.'); return; }
  const stopOpt = stopSel.selectedOptions[0];
  const locId = stopOpt.dataset.loc;
  const stopDate = stopOpt.dataset.date;

  const fields = {
    'Date': stopDate || localToday(),
    'Direction': document.getElementById('plf_dir').value,
    'Pallets': parseInt(document.getElementById('plf_pals').value) || 0,
    'Pallet Type': document.getElementById('plf_ptype').value,
    'Order Stop': [stopId],
    'Verified': document.getElementById('plf_verified').value === 'true',
    'Notes': document.getElementById('plf_notes').value,
  };

  if (tab === 'partners') {
    const pid = document.getElementById('plf_partner').value;
    if (!pid) { alert('Pick a Partner.'); return; }
    fields['Partner'] = [pid];
  } else {
    if (locId) fields['Loading Supplier'] = [locId];
  }

  const tbl = _plActiveTable();
  try {
    if (recId) await atPatch(tbl, recId, fields);
    else       await atCreate(tbl, fields);
    document.getElementById('plFormOverlay').remove();
    invalidateCache(tbl);
    renderPalletLedger();
  } catch(e) { alert('Error: ' + e.message); }
}

/* ── CSV Export ─────────────────────────────── */
function _plExportCSV() {
  const recs = _plFiltered();
  if (!recs.length) { toast('No records to export', 'error'); return; }
  const tab = PL.filters.tab;
  const counterHeader = tab === 'partners' ? 'Partner' : 'Supplier';
  const rows = [['Date','Direction','Pallets','Pallet Type', counterHeader, 'Stop Ref','Verified','Notes']];
  recs.forEach(r => { const f = r.fields;
    const name = tab === 'partners'
      ? _plPartnerName(Array.isArray(f['Partner']) ? f['Partner'][0] : null)
      : _plLocName(Array.isArray(f['Loading Supplier']) ? f['Loading Supplier'][0] : null);
    const stopId = (Array.isArray(f['Order Stop']) ? f['Order Stop'][0] : '') || '';
    rows.push([f['Date']||'', f['Direction']||'', f['Pallets']||0, f['Pallet Type']||'', name, stopId, f['Verified']?'Yes':'No', f['Notes']||'']);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `pallet_ledger_${tab}_${localToday()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  toast('CSV exported');
}

/* ── Delete ──────────────────────────────────── */
async function _plDelete(id) {
  if (!confirm('Delete this pallet record?')) return;
  const tbl = _plActiveTable();
  try {
    await atSoftDelete(tbl, id);
    invalidateCache(tbl);
    renderPalletLedger();
  } catch(e) { alert('Error: ' + e.message); }
}

// Expose
window.renderPalletLedger = renderPalletLedger;
window.PL = PL;
window._plRender = _plRender;
window._plOpenCreate = _plOpenCreate;
window._plEdit = _plEdit;
window._plDelete = _plDelete;
window._plOpenForm = _plOpenForm;
window._plSaveForm = _plSaveForm;
window._plOnOrderChange = _plOnOrderChange;
window._plValidateSelection = _plValidateSelection;
window._plExportCSV = _plExportCSV;
