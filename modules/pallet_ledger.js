// ═══════════════════════════════════════════════
// MODULE — PALLET LEDGER
// Sidebar page: balance cards + filterable table + CRUD
// ═══════════════════════════════════════════════

const PL = {
  records: [],
  partners: [],
  locations: [],
  clients: [],
  filters: { from: '', to: '', counterparty: '', partner: '', supplier: '', direction: '' },
  selected: null,
};

/* ── Main render ─────────────────────────────── */
async function renderPalletLedger() {
  const c = document.getElementById('content');
  c.style.padding = '';
  c.style.overflow = '';
  c.innerHTML = '<div style="text-align:center;padding:60px;color:#94A3B8">Loading Pallet Ledger...</div>';

  // Fetch all data in parallel
  const [recs, partners, locations] = await Promise.all([
    atGetAll(TABLES.PALLET_LEDGER, {
      fields: ['Date','Direction','Pallets','Pallet Type','Counterparty Type','Stop Type',
               'Loading Supplier','Client Account','Partner Account','Order','AI Extracted',
               'Verified','Notes'],
      sort: [{ field: 'Date', direction: 'desc' }],
    }),
    preloadReferenceData().then(() => getRefPartners()),
    preloadReferenceData().then(() => getRefLocations()),
  ]);

  PL.records = recs;
  PL.partners = partners;
  PL.locations = locations;
  PL.selected = null;

  _plRender();
}

/* ── Compute balances ────────────────────────── */
function _plBalances() {
  const supBal = {}; // locId → net
  const partBal = {}; // partnerId → net

  for (const r of PL.records) {
    const f = r.fields;
    const dir = f['Direction'];
    const pals = f['Pallets'] || 0;
    const sign = dir === 'OUT' ? 1 : -1;

    if (f['Counterparty Type'] === 'Client' || f['Counterparty Type'] === 'Supplier') {
      const locId = Array.isArray(f['Loading Supplier']) ? f['Loading Supplier'][0] : null;
      if (locId) supBal[locId] = (supBal[locId] || 0) + sign * pals;
    }
    if (f['Counterparty Type'] === 'Partner') {
      const pid = Array.isArray(f['Partner Account']) ? f['Partner Account'][0] : null;
      if (pid) partBal[pid] = (partBal[pid] || 0) + sign * pals;
    }
  }

  const supTotal = Object.values(supBal).reduce((a, b) => a + b, 0);
  const partTotal = Object.values(partBal).reduce((a, b) => a + b, 0);

  // Top 5 debtors (positive = they owe us)
  const topSup = Object.entries(supBal)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, v]) => ({ name: _plLocName(id), amount: v }));

  const topPart = Object.entries(partBal)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, v]) => ({ name: _plPartnerName(id), amount: v }));

  return { supTotal, partTotal, topSup, topPart };
}

function _plLocName(id) {
  const loc = PL.locations.find(l => l.id === id);
  return loc ? (loc.fields['Name'] || loc.fields['City'] || id) : id?.substring(0, 8) || '—';
}

function _plPartnerName(id) {
  const p = PL.partners.find(p => p.id === id);
  return p ? (p.fields['Company Name'] || id) : id?.substring(0, 8) || '—';
}

/* ── Filter records ──────────────────────────── */
function _plFiltered() {
  const { from, to, counterparty, partner, supplier, direction } = PL.filters;
  return PL.records.filter(r => {
    const f = r.fields;
    if (from && (f['Date'] || '') < from) return false;
    if (to && (f['Date'] || '') > to) return false;
    if (counterparty && f['Counterparty Type'] !== counterparty) return false;
    if (direction && f['Direction'] !== direction) return false;
    if (partner) {
      const pid = Array.isArray(f['Partner Account']) ? f['Partner Account'][0] : null;
      if (pid !== partner) return false;
    }
    if (supplier) {
      const lid = Array.isArray(f['Loading Supplier']) ? f['Loading Supplier'][0] : null;
      if (lid !== supplier) return false;
    }
    return true;
  });
}

/* ── Monthly trend ───────────────────────────── */
function _plMonthlyTrend() {
  const months = {};
  const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  PL.records.forEach(r => {
    const d = r.fields['Date'];
    if (!d) return;
    const key = d.substring(0,7); // YYYY-MM
    if (!months[key]) months[key] = { in: 0, out: 0 };
    const pals = r.fields['Pallets'] || 0;
    if (r.fields['Direction'] === 'IN') months[key].in += pals;
    else months[key].out += pals;
  });
  const sorted = Object.entries(months).sort((a,b) => a[0].localeCompare(b[0])).slice(-6);
  if (!sorted.length) return '';
  return `<div style="margin-bottom:16px">
    <div style="font-family:'Syne',sans-serif;font-size:12px;font-weight:700;margin-bottom:8px;letter-spacing:.5px">MONTHLY TREND</div>
    <div style="display:flex;gap:6px;overflow-x:auto">
      ${sorted.map(([key, v]) => {
        const net = v.in - v.out;
        const m = parseInt(key.split('-')[1]) - 1;
        return `<div style="background:#0F172A;border:1px solid #1E293B;border-radius:8px;padding:10px 14px;min-width:110px;flex:1">
          <div style="font-size:11px;color:#94A3B8;margin-bottom:4px">${mNames[m]} ${key.split('-')[0]}</div>
          <div style="display:flex;gap:8px;font-size:12px;font-weight:600">
            <span style="color:#10B981">+${v.in}</span>
            <span style="color:#EF4444">-${v.out}</span>
          </div>
          <div style="font-size:14px;font-weight:700;font-family:'Syne',sans-serif;color:${net>=0?'#10B981':'#EF4444'};margin-top:2px">${net>=0?'+':''}${net}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

/* ── Full render ─────────────────────────────── */
function _plRender() {
  const c = document.getElementById('content');
  const bal = _plBalances();
  const filtered = _plFiltered();

  const partnerOpts = PL.partners
    .sort((a, b) => (a.fields['Company Name'] || '').localeCompare(b.fields['Company Name'] || ''))
    .map(p => `<option value="${p.id}" ${PL.filters.partner === p.id ? 'selected' : ''}>${p.fields['Company Name'] || p.id}</option>`)
    .join('');

  const locOpts = PL.locations
    .sort((a, b) => (a.fields['Name'] || '').localeCompare(b.fields['Name'] || ''))
    .map(l => `<option value="${l.id}" ${PL.filters.supplier === l.id ? 'selected' : ''}>${l.fields['Name'] || l.fields['City'] || l.id}</option>`)
    .join('');

  c.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <div>
      <h2 style="font-family:'Syne',sans-serif;font-size:22px;margin:0">Pallet Ledger</h2>
      <div style="font-size:13px;color:#94A3B8;margin-top:4px">${PL.records.length} total records</div>
    </div>
    <button class="btn btn-new-order" onclick="_plOpenCreate()">+ New Record</button>
  </div>

  <div class="pl-balance-cards">
    <div class="pl-balance-card">
      <h4>Suppliers Owe Us</h4>
      <div class="pl-big-num ${bal.supTotal > 0 ? 'positive' : bal.supTotal < 0 ? 'negative' : 'zero'}">
        ${bal.supTotal > 0 ? '+' : ''}${bal.supTotal} pal
      </div>
    </div>
    <div class="pl-balance-card">
      <h4>Partners Owe Us</h4>
      <div class="pl-big-num ${bal.partTotal > 0 ? 'positive' : bal.partTotal < 0 ? 'negative' : 'zero'}">
        ${bal.partTotal > 0 ? '+' : ''}${bal.partTotal} pal
      </div>
    </div>
    <div class="pl-balance-card">
      <h4>Top Supplier Debtors</h4>
      ${bal.topSup.length ? `<ul class="pl-debtor-list">${bal.topSup.map(d =>
        `<li><span>${d.name}</span><span class="pl-debtor-amt">+${d.amount}</span></li>`
      ).join('')}</ul>` : '<div style="font-size:12px;color:#94A3B8">No debtors</div>'}
    </div>
    <div class="pl-balance-card">
      <h4>Top Partner Debtors</h4>
      ${bal.topPart.length ? `<ul class="pl-debtor-list">${bal.topPart.map(d =>
        `<li><span>${d.name}</span><span class="pl-debtor-amt">+${d.amount}</span></li>`
      ).join('')}</ul>` : '<div style="font-size:12px;color:#94A3B8">No debtors</div>'}
    </div>
  </div>

  ${_plMonthlyTrend()}

  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:end">
    <div style="display:flex;flex-direction:column;gap:2px">
      <label style="font-size:10px;color:#94A3B8;text-transform:uppercase">From</label>
      <input type="date" value="${PL.filters.from}" onchange="PL.filters.from=this.value;_plRender()" style="padding:6px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px">
    </div>
    <div style="display:flex;flex-direction:column;gap:2px">
      <label style="font-size:10px;color:#94A3B8;text-transform:uppercase">To</label>
      <input type="date" value="${PL.filters.to}" onchange="PL.filters.to=this.value;_plRender()" style="padding:6px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px">
    </div>
    <div style="display:flex;flex-direction:column;gap:2px">
      <label style="font-size:10px;color:#94A3B8;text-transform:uppercase">Counterparty</label>
      <select onchange="PL.filters.counterparty=this.value;_plRender()" style="padding:6px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px">
        <option value="">All</option>
        <option value="Client" ${PL.filters.counterparty==='Client'?'selected':''}>Client</option>
        <option value="Partner" ${PL.filters.counterparty==='Partner'?'selected':''}>Partner</option>
      </select>
    </div>
    <div style="display:flex;flex-direction:column;gap:2px">
      <label style="font-size:10px;color:#94A3B8;text-transform:uppercase">Direction</label>
      <select onchange="PL.filters.direction=this.value;_plRender()" style="padding:6px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px">
        <option value="">All</option>
        <option value="OUT" ${PL.filters.direction==='OUT'?'selected':''}>OUT</option>
        <option value="IN" ${PL.filters.direction==='IN'?'selected':''}>IN</option>
      </select>
    </div>
    <div style="display:flex;flex-direction:column;gap:2px">
      <label style="font-size:10px;color:#94A3B8;text-transform:uppercase">Partner</label>
      <select onchange="PL.filters.partner=this.value;_plRender()" style="padding:6px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px">
        <option value="">All</option>
        ${partnerOpts}
      </select>
    </div>
    <div style="display:flex;flex-direction:column;gap:2px">
      <label style="font-size:10px;color:#94A3B8;text-transform:uppercase">Supplier</label>
      <select onchange="PL.filters.supplier=this.value;_plRender()" style="padding:6px 8px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px">
        <option value="">All</option>
        ${locOpts}
      </select>
    </div>
    <div style="font-size:12px;color:#64748B;padding:8px">${filtered.length} records</div>
  </div>

  <table class="entity-table" style="width:100%">
    <thead>
      <tr>
        <th>Date</th>
        <th>Dir</th>
        <th>Pallets</th>
        <th>Counterparty</th>
        <th>Name</th>
        <th>Stop</th>
        <th>Verified</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${filtered.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94A3B8">No records</td></tr>' : ''}
      ${filtered.map(r => {
        const f = r.fields;
        const dirClass = f['Direction'] === 'OUT' ? 'color:#EF4444' : 'color:#10B981';
        const name = f['Counterparty Type'] === 'Partner'
          ? _plPartnerName(Array.isArray(f['Partner Account']) ? f['Partner Account'][0] : null)
          : _plLocName(Array.isArray(f['Loading Supplier']) ? f['Loading Supplier'][0] : null);
        return `<tr onclick="_plSelect('${r.id}')" style="cursor:pointer" class="${PL.selected===r.id?'selected':''}">
          <td>${f['Date'] || '—'}</td>
          <td><span style="${dirClass};font-weight:700;font-size:12px">${f['Direction'] || '—'}</span></td>
          <td style="font-weight:600">${f['Pallets'] || 0}</td>
          <td style="font-size:12px">${f['Counterparty Type'] || '—'}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</td>
          <td style="font-size:12px">${f['Stop Type'] || '—'}</td>
          <td>${f['Verified'] ? '✓' : ''}</td>
          <td>
            <button class="btn btn-sm" onclick="event.stopPropagation();_plEdit('${r.id}')" style="font-size:11px;padding:2px 8px">Edit</button>
            <button class="btn btn-sm" onclick="event.stopPropagation();_plDelete('${r.id}')" style="font-size:11px;padding:2px 8px;color:#EF4444">Del</button>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

/* ── Select row ──────────────────────────────── */
function _plSelect(id) {
  PL.selected = PL.selected === id ? null : id;
  _plRender();
}

/* ── Create / Edit modal ─────────────────────── */
function _plOpenCreate() { _plOpenForm(null); }
function _plEdit(id) { _plOpenForm(id); }

function _plOpenForm(recId) {
  const rec = recId ? PL.records.find(r => r.id === recId) : null;
  const f = rec?.fields || {};

  const partnerOpts = PL.partners
    .map(p => {
      const sel = Array.isArray(f['Partner Account']) && f['Partner Account'][0] === p.id ? 'selected' : '';
      return `<option value="${p.id}" ${sel}>${p.fields['Company Name'] || p.id}</option>`;
    }).join('');

  const locOpts = PL.locations
    .map(l => {
      const sel = Array.isArray(f['Loading Supplier']) && f['Loading Supplier'][0] === l.id ? 'selected' : '';
      return `<option value="${l.id}" ${sel}>${l.fields['Name'] || l.fields['City'] || l.id}</option>`;
    }).join('');

  const html = `
  <div class="pu-overlay" id="plFormOverlay" onclick="if(event.target===this)document.getElementById('plFormOverlay').remove()">
    <div class="pu-modal" style="width:500px">
      <div class="pu-header">
        <h2>${recId ? 'Edit' : 'New'} Pallet Record</h2>
        <button class="pu-close" onclick="document.getElementById('plFormOverlay').remove()">&times;</button>
      </div>
      <div class="pu-body">
        <div class="pu-form-grid">
          <div class="pu-field">
            <label>Date</label>
            <input type="date" id="plf_date" value="${f['Date'] ? toLocalDate(f['Date']) : localToday()}">
          </div>
          <div class="pu-field">
            <label>Direction</label>
            <select id="plf_dir">
              <option value="OUT" ${f['Direction']==='OUT'?'selected':''}>OUT</option>
              <option value="IN" ${f['Direction']==='IN'?'selected':''}>IN</option>
            </select>
          </div>
          <div class="pu-field">
            <label>Pallets</label>
            <input type="number" id="plf_pals" value="${f['Pallets'] || 0}" min="0">
          </div>
          <div class="pu-field">
            <label>Counterparty Type</label>
            <select id="plf_ctype" onchange="_plFormToggle()">
              <option value="Client" ${f['Counterparty Type']==='Client'?'selected':''}>Client/Supplier</option>
              <option value="Partner" ${f['Counterparty Type']==='Partner'?'selected':''}>Partner</option>
            </select>
          </div>
          <div class="pu-field" id="plf_partnerWrap" style="${f['Counterparty Type']==='Partner'?'':'display:none'}">
            <label>Partner</label>
            <select id="plf_partner"><option value="">—</option>${partnerOpts}</select>
          </div>
          <div class="pu-field" id="plf_supplierWrap" style="${f['Counterparty Type']!=='Partner'?'':'display:none'}">
            <label>Supplier (Location)</label>
            <select id="plf_supplier"><option value="">—</option>${locOpts}</select>
          </div>
          <div class="pu-field">
            <label>Stop Type</label>
            <select id="plf_stop">
              <option value="Loading" ${f['Stop Type']==='Loading'?'selected':''}>Loading</option>
              <option value="Crossdock" ${f['Stop Type']==='Crossdock'?'selected':''}>Crossdock</option>
              <option value="No Order" ${f['Stop Type']==='No Order'?'selected':''}>No Order</option>
            </select>
          </div>
          <div class="pu-field">
            <label>Verified</label>
            <select id="plf_verified">
              <option value="false" ${!f['Verified']?'selected':''}>No</option>
              <option value="true" ${f['Verified']?'selected':''}>Yes</option>
            </select>
          </div>
          <div class="pu-field pu-full-width">
            <label>Notes</label>
            <textarea id="plf_notes" rows="2">${f['Notes'] || ''}</textarea>
          </div>
        </div>
        <div class="pu-actions">
          <button class="btn" onclick="document.getElementById('plFormOverlay').remove()">Cancel</button>
          <button class="btn btn-new-order" onclick="_plSaveForm('${recId || ''}')">${recId ? 'Update' : 'Create'}</button>
        </div>
      </div>
    </div>
  </div>`;

  document.getElementById('plFormOverlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function _plFormToggle() {
  const ctype = document.getElementById('plf_ctype').value;
  document.getElementById('plf_partnerWrap').style.display = ctype === 'Partner' ? '' : 'none';
  document.getElementById('plf_supplierWrap').style.display = ctype !== 'Partner' ? '' : 'none';
}

async function _plSaveForm(recId) {
  const fields = {
    'Date': document.getElementById('plf_date').value,
    'Direction': document.getElementById('plf_dir').value,
    'Pallets': parseInt(document.getElementById('plf_pals').value) || 0,
    'Pallet Type': 'EUR/EPAL',
    'Counterparty Type': document.getElementById('plf_ctype').value,
    'Stop Type': document.getElementById('plf_stop').value,
    'Verified': document.getElementById('plf_verified').value === 'true',
    'Notes': document.getElementById('plf_notes').value,
  };

  const ctype = document.getElementById('plf_ctype').value;
  if (ctype === 'Partner') {
    const pid = document.getElementById('plf_partner').value;
    if (pid) fields['Partner Account'] = [pid];
  } else {
    const lid = document.getElementById('plf_supplier').value;
    if (lid) fields['Loading Supplier'] = [lid];
  }

  try {
    if (recId) {
      await atPatch(TABLES.PALLET_LEDGER, recId, fields);
    } else {
      await atCreate(TABLES.PALLET_LEDGER, fields);
    }
    document.getElementById('plFormOverlay').remove();
    invalidateCache(TABLES.PALLET_LEDGER);
    renderPalletLedger();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

/* ── Delete ──────────────────────────────────── */
async function _plDelete(id) {
  if (!confirm('Delete this pallet record?')) return;
  try {
    await atDelete(TABLES.PALLET_LEDGER, id);
    invalidateCache(TABLES.PALLET_LEDGER);
    renderPalletLedger();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}
