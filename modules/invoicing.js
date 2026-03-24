// ═══════════════════════════════════════════════
// MODULE — INVOICING VIEW  v1
// ═══════════════════════════════════════════════

const INV = { data: [], filtered: [], selectedId: null };
const _invFilters = { tab: 'ready', type: '', weekFrom: '', weekTo: '', client: '' };

// ─── Helpers ─────────────────────────────────────
function _invClientName(f) {
  const id = Array.isArray(f['Client']) ? f['Client'][0] : null;
  return id ? (_clientsMap[id] || id.slice(-6)) : '—';
}

function _invRoute(rec) {
  if (rec._type === 'intl') {
    const load = rec.fields['Loading Summary'] || '';
    const del  = rec.fields['Delivery Summary'] || '';
    return (load || '—') + ' → ' + (del || '—');
  }
  // National: use Goods as route proxy
  return rec.fields['Goods'] || '—';
}

function _invOrderNo(rec) {
  if (rec._type === 'intl') return rec.fields['Order Number'] || rec.id.slice(-6);
  return rec.fields['Order Number'] || rec.fields['National Order ID'] || rec.id.slice(-6);
}

function _invPallets(rec) {
  if (rec._type === 'intl') return rec.fields['Total Pallets'] || 0;
  return rec.fields['Pallets'] || 0;
}

function _invPrice(rec) {
  return rec.fields['Price'] || 0;
}

function _invNetPrice(rec) {
  return rec.fields['Net Price'] || 0;
}

function _invWeek(rec) {
  if (rec._type === 'intl') return rec.fields[' Week Number'] || '—';
  return rec.fields[' Week Number'] || rec.fields['Week Number'] || '—';
}

function _invPERequired(rec) {
  if (rec._type !== 'intl') return false;
  return !!rec.fields['Pallet Exchange'];
}

function _invPESheetsOK(rec) {
  if (rec._type !== 'intl') return true;
  if (!rec.fields['Pallet Exchange']) return true;
  return !!(rec.fields['Pallet Sheet 1 Uploaded'] && rec.fields['Pallet Sheet 2 Uploaded']);
}

function _invIsInvoiced(rec) {
  return rec.fields['Status'] === 'Invoiced' || !!rec.fields['Invoiced'];
}

function _invIsReady(rec) {
  if (_invIsInvoiced(rec)) return false;
  if (rec.fields['Status'] !== 'Delivered') return false;
  return _invPESheetsOK(rec);
}

function _invIsBlocked(rec) {
  if (_invIsInvoiced(rec)) return false;
  if (rec.fields['Status'] !== 'Delivered') return false;
  return _invPERequired(rec) && !_invPESheetsOK(rec);
}

function _fmtEuro(v) {
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(v || 0);
}

// ─── Main ────────────────────────────────────────
async function renderInvoicing() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading invoicing data...');
  try {
    const formula = `OR({Status}="Delivered",{Status}="Invoiced",{Invoiced}=1)`;
    const [intlRecs, natlRecs] = await Promise.all([
      _loadLocations().then(() => atGet(TABLES.ORDERS, formula, false)),
      atGet(TABLES.NAT_ORDERS, `OR({Status}="Delivered",{Status}="Invoiced")`, false),
    ]);

    // Tag type
    intlRecs.forEach(r => { r._type = 'intl'; });
    natlRecs.forEach(r => { r._type = 'natl'; });

    const all = [...intlRecs, ...natlRecs];

    // Pre-resolve client names
    const clientIds = [...new Set(all.flatMap(r => r.fields['Client'] || []).filter(Boolean))];
    await Promise.all(clientIds.map(id => _resolveClientName(id)));

    INV.data = all;
    INV.filtered = all;
    INV.selectedId = null;
    _invFilters.tab = 'ready';
    _invFilters.type = '';
    _invFilters.weekFrom = '';
    _invFilters.weekTo = '';
    _invFilters.client = '';

    _renderInvLayout(c);
    _applyInvFilters();
  } catch (e) {
    c.innerHTML = showError(e.message);
  }
}

// ─── Layout ──────────────────────────────────────
function _renderInvLayout(c) {
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:14px">
      <div>
        <div class="page-title">Invoicing</div>
        <div class="page-sub" id="invSub">${INV.data.length} orders</div>
      </div>
    </div>

    <!-- KPI Cards -->
    <div id="invKPI" style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px"></div>

    <!-- Tabs -->
    <div id="invTabs" style="display:flex;gap:0;margin-bottom:14px;border-bottom:2px solid #1E293B"></div>

    <!-- Filters -->
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <select class="filter-select" onchange="_invSetFilter('type',this.value)">
        <option value="">Type: All</option>
        <option value="intl">International</option>
        <option value="natl">National</option>
      </select>
      <input type="number" class="filter-select" style="width:80px" placeholder="Week from"
        onchange="_invSetFilter('weekFrom',this.value)">
      <input type="number" class="filter-select" style="width:80px" placeholder="Week to"
        onchange="_invSetFilter('weekTo',this.value)">
      <input class="search-input" style="max-width:220px" placeholder="Search client..."
        oninput="_invSetFilter('client',this.value)">
    </div>

    <!-- Content area: table + detail -->
    <div style="display:flex;gap:16px;align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Order No</th><th>Type</th><th>Client</th><th>Route</th>
              <th style="text-align:right">Pallets</th><th style="text-align:right">Price</th>
              <th style="text-align:right">Net Price</th><th>PE</th><th>Status</th>
            </tr></thead>
            <tbody id="invBody"></tbody>
          </table>
        </div>
      </div>
      <div id="invDetail" style="width:340px;flex-shrink:0;display:none"></div>
    </div>
  `;
}

// ─── Tabs ────────────────────────────────────────
function _renderInvTabs() {
  const tabs = [
    { key: 'ready',    label: 'Ready',    count: INV.data.filter(_invIsReady).length },
    { key: 'blocked',  label: 'Blocked',  count: INV.data.filter(_invIsBlocked).length },
    { key: 'invoiced', label: 'Invoiced', count: INV.data.filter(_invIsInvoiced).length },
    { key: 'all',      label: 'All',      count: INV.data.length },
  ];
  const el = document.getElementById('invTabs');
  if (!el) return;
  el.innerHTML = tabs.map(t => `
    <button onclick="_invSetTab('${t.key}')"
      style="padding:8px 18px;font-family:'Syne',sans-serif;font-size:13px;font-weight:600;
      border:none;cursor:pointer;background:none;
      color:${_invFilters.tab === t.key ? '#0284C7' : '#94A3B8'};
      border-bottom:2px solid ${_invFilters.tab === t.key ? '#0284C7' : 'transparent'};
      margin-bottom:-2px">
      ${t.label} <span style="font-weight:400;opacity:0.7">(${t.count})</span>
    </button>
  `).join('');
}

function _invSetTab(key) {
  _invFilters.tab = key;
  _applyInvFilters();
}

function _invSetFilter(key, val) {
  _invFilters[key] = val;
  _applyInvFilters();
}

// ─── KPI Cards ───────────────────────────────────
function _renderInvKPI() {
  const ready    = INV.data.filter(_invIsReady);
  const blocked  = INV.data.filter(_invIsBlocked);
  const invoiced = INV.data.filter(_invIsInvoiced);

  // Invoiced this month
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();
  const invThisMonth = invoiced; // All invoiced shown (no date field to filter by month precisely)

  const readyTotal   = ready.reduce((s, r) => s + (_invPrice(r) || 0), 0);
  const invTotal     = invoiced.reduce((s, r) => s + (_invPrice(r) || 0), 0);
  const allTotal     = INV.data.reduce((s, r) => s + (_invPrice(r) || 0), 0);

  const el = document.getElementById('invKPI');
  if (!el) return;

  const cardStyle = `background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:16px 20px`;
  const labelStyle = `font-size:12px;color:#94A3B8;font-family:'DM Sans',sans-serif;margin-bottom:4px`;
  const valueStyle = `font-size:22px;font-weight:700;color:#F1F5F9;font-family:'Syne',sans-serif`;
  const deltaStyle = `font-size:11px;color:#64748B;margin-top:4px;font-family:'DM Sans',sans-serif`;

  el.innerHTML = `
    <div style="${cardStyle}">
      <div style="${labelStyle}">Ready to Invoice</div>
      <div style="${valueStyle};color:#0284C7">${ready.length}</div>
      <div style="${deltaStyle}">${_fmtEuro(readyTotal)}</div>
    </div>
    <div style="${cardStyle}">
      <div style="${labelStyle}">Blocked (PE Missing)</div>
      <div style="${valueStyle};color:#F59E0B">${blocked.length}</div>
      <div style="${deltaStyle}">Awaiting pallet sheets</div>
    </div>
    <div style="${cardStyle}">
      <div style="${labelStyle}">Invoiced</div>
      <div style="${valueStyle};color:#10B981">${invoiced.length}</div>
      <div style="${deltaStyle}">${_fmtEuro(invTotal)}</div>
    </div>
    <div style="${cardStyle}">
      <div style="${labelStyle}">Total Revenue</div>
      <div style="${valueStyle}">${_fmtEuro(allTotal)}</div>
      <div style="${deltaStyle}">${INV.data.length} orders</div>
    </div>
  `;
}

// ─── Filter + Render Table ───────────────────────
function _applyInvFilters() {
  let list = INV.data;

  // Tab filter
  if (_invFilters.tab === 'ready')    list = list.filter(_invIsReady);
  if (_invFilters.tab === 'blocked')  list = list.filter(_invIsBlocked);
  if (_invFilters.tab === 'invoiced') list = list.filter(_invIsInvoiced);

  // Type filter
  if (_invFilters.type) list = list.filter(r => r._type === _invFilters.type);

  // Week range
  if (_invFilters.weekFrom) {
    const wf = parseInt(_invFilters.weekFrom);
    list = list.filter(r => {
      const w = parseInt(_invWeek(r));
      return !isNaN(w) && w >= wf;
    });
  }
  if (_invFilters.weekTo) {
    const wt = parseInt(_invFilters.weekTo);
    list = list.filter(r => {
      const w = parseInt(_invWeek(r));
      return !isNaN(w) && w <= wt;
    });
  }

  // Client search
  if (_invFilters.client && _invFilters.client.length >= 2) {
    const q = _invFilters.client.toLowerCase();
    list = list.filter(r => _invClientName(r.fields).toLowerCase().includes(q));
  }

  INV.filtered = list;
  _renderInvTabs();
  _renderInvKPI();
  _renderInvTable();

  const sub = document.getElementById('invSub');
  if (sub) sub.textContent = `${list.length} of ${INV.data.length} orders`;
}

function _renderInvTable() {
  const tbody = document.getElementById('invBody');
  if (!tbody) return;

  if (!INV.filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#64748B;padding:32px">No orders match current filters</td></tr>`;
    return;
  }

  tbody.innerHTML = INV.filtered.map(r => {
    const f = r.fields;
    const sel = INV.selectedId === r.id ? 'background:#1E293B;' : '';
    const typeBadge = r._type === 'intl'
      ? '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#0C2D5C;color:#38BDF8">INTL</span>'
      : '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#14532D;color:#4ADE80">NATL</span>';

    const peIcon = r._type !== 'intl' ? '<span style="color:#64748B">—</span>'
      : _invPESheetsOK(r)
        ? '<span style="color:#10B981;font-weight:700">&#10003;</span>'
        : '<span style="color:#F59E0B;font-weight:700">&#10007;</span>';

    let statusBadge;
    if (_invIsInvoiced(r)) {
      statusBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#064E3B;color:#6EE7B7">Invoiced</span>';
    } else if (_invIsBlocked(r)) {
      statusBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#78350F;color:#FCD34D">Blocked</span>';
    } else {
      statusBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#0C4A6E;color:#7DD3FC">Ready</span>';
    }

    return `<tr onclick="_invSelect('${r.id}')" style="cursor:pointer;${sel}transition:background 0.15s">
      <td><strong>${_invOrderNo(r)}</strong></td>
      <td>${typeBadge}</td>
      <td>${_invClientName(f)}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_invRoute(r)}</td>
      <td style="text-align:right">${_invPallets(r)}</td>
      <td style="text-align:right">${_fmtEuro(_invPrice(r))}</td>
      <td style="text-align:right">${_fmtEuro(_invNetPrice(r))}</td>
      <td style="text-align:center">${peIcon}</td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join('');
}

// ─── Detail Panel ────────────────────────────────
function _invSelect(id) {
  INV.selectedId = id;
  _renderInvTable();
  _renderInvDetail();
}

function _renderInvDetail() {
  const panel = document.getElementById('invDetail');
  if (!panel) return;

  if (!INV.selectedId) {
    panel.style.display = 'none';
    return;
  }

  const rec = INV.data.find(r => r.id === INV.selectedId);
  if (!rec) { panel.style.display = 'none'; return; }

  const f = rec.fields;
  const canInvoice = can('orders') === 'full' || can('costs') === 'full';
  const isInvoiced = _invIsInvoiced(rec);
  const isBlocked  = _invIsBlocked(rec);

  let invoiceBtn = '';
  if (!isInvoiced && canInvoice) {
    if (isBlocked) {
      invoiceBtn = `<button disabled style="width:100%;padding:10px;border-radius:8px;border:1px solid #334155;
        background:#1E293B;color:#64748B;font-size:13px;font-weight:600;cursor:not-allowed;margin-top:12px">
        PE Sheets Missing — Cannot Invoice</button>`;
    } else {
      invoiceBtn = `<button onclick="_invMarkInvoiced('${rec.id}')" style="width:100%;padding:10px;border-radius:8px;
        border:none;background:#0284C7;color:#fff;font-size:13px;font-weight:600;cursor:pointer;
        margin-top:12px;transition:background 0.15s"
        onmouseenter="this.style.background='#0369A1'" onmouseleave="this.style.background='#0284C7'">
        Mark as Invoiced</button>`;
    }
  }
  if (isInvoiced) {
    invoiceBtn = `<div style="text-align:center;padding:10px;border-radius:8px;background:#064E3B;
      color:#6EE7B7;font-size:13px;font-weight:600;margin-top:12px">Invoiced</div>`;
  }

  const row = (label, val) => `
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1E293B">
      <span style="color:#94A3B8;font-size:12px">${label}</span>
      <span style="color:#F1F5F9;font-size:13px;font-weight:500;text-align:right;max-width:180px;overflow:hidden;text-overflow:ellipsis">${val}</span>
    </div>`;

  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:20px;position:sticky;top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:#F1F5F9">
          ${_invOrderNo(rec)}</span>
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;
          background:${rec._type === 'intl' ? '#0C2D5C' : '#14532D'};
          color:${rec._type === 'intl' ? '#38BDF8' : '#4ADE80'}">
          ${rec._type === 'intl' ? 'INTL' : 'NATL'}</span>
      </div>
      ${row('Client', _invClientName(f))}
      ${row('Route', _invRoute(rec))}
      ${row('Week', _invWeek(rec))}
      ${row('Pallets', _invPallets(rec))}
      ${row('Price', _fmtEuro(_invPrice(rec)))}
      ${row('Net Price', _fmtEuro(_invNetPrice(rec)))}
      ${rec._type === 'intl' ? row('Pallet Exchange', _invPERequired(rec) ? 'Yes' : 'No') : ''}
      ${rec._type === 'intl' && _invPERequired(rec) ? row('PE Sheets', _invPESheetsOK(rec) ? 'Uploaded' : 'Missing') : ''}
      ${row('Status', f['Status'] || '—')}
      ${row('Direction', f['Direction'] || '—')}
      ${invoiceBtn}
    </div>
  `;
}

// ─── Invoice Action ──────────────────────────────
async function _invMarkInvoiced(recId) {
  const rec = INV.data.find(r => r.id === recId);
  if (!rec) return;

  // Double-check PE sheets for international
  if (rec._type === 'intl' && _invPERequired(rec) && !_invPESheetsOK(rec)) {
    toast('Cannot invoice — pallet exchange sheets are missing', 'error');
    return;
  }

  const table = rec._type === 'intl' ? TABLES.ORDERS : TABLES.NAT_ORDERS;

  try {
    const fields = { 'Status': 'Invoiced' };
    if (rec._type === 'intl') fields['Invoiced'] = true;

    await atPatch(table, recId, fields);
    invalidateCache(table);

    // Update local state
    rec.fields['Status'] = 'Invoiced';
    if (rec._type === 'intl') rec.fields['Invoiced'] = true;

    toast('Order marked as invoiced');
    _applyInvFilters();
    _renderInvDetail();
  } catch (e) {
    toast('Failed to invoice: ' + e.message, 'error');
  }
}
