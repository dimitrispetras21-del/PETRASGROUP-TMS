// ═══════════════════════════════════════════════
// MODULE — INVOICING  v2
// Bug fixes + Aging buckets + Invoice Number/Date + Outstanding KPI + Sort
// ═══════════════════════════════════════════════

const INV = { data: [], filtered: [], selectedId: null, sort: { col: 'aging', dir: 'desc' } };
const _invFilters = { tab: 'ready', type: '', weekFrom: '', weekTo: '', client: '' };

// ─── Helpers ─────────────────────────────────────
function _invClientName(rec) {
  const f = rec.fields;
  const id = Array.isArray(f['Client']) ? f['Client'][0] : null;
  if (id) return getClientName(id);
  return f['Client Summary'] || f['Client Name'] || '—';
}

function _invRoute(rec) {
  if (rec._type === 'intl') {
    const load = rec.fields['Loading Summary'] || '';
    const del  = rec.fields['Delivery Summary'] || '';
    return (load || '—') + ' → ' + (del || '—');
  }
  return rec.fields['Goods'] || '—';
}

function _invOrderNo(rec) {
  return rec.fields['Order Number'] || rec.fields['National Order ID'] || rec.id.slice(-6);
}

function _invPallets(rec) {
  return rec._type === 'intl' ? (rec.fields['Total Pallets'] || 0) : (rec.fields['Pallets'] || 0);
}

function _invPrice(rec) { return rec.fields['Price'] || 0; }
function _invNetPrice(rec) { return rec.fields['Net Price'] || 0; }
function _invWeek(rec) { return rec.fields['Week Number'] || '—'; }

function _invPERequired(rec) { return !!rec.fields['Pallet Exchange']; }

function _invPESheetsOK(rec) {
  if (!rec.fields['Pallet Exchange']) return true;
  if (rec._type === 'intl') {
    return !!(rec.fields['Pallet Sheet 1 Uploaded'] && rec.fields['Pallet Sheet 2 Uploaded']);
  }
  return true;
}

function _invIsInvoiced(rec) {
  const st = rec.fields['Status'];
  return st === 'Invoiced' || !!rec.fields['Invoiced'];
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

function _invDeliveredAt(rec) {
  return rec.fields['Delivery DateTime'] || rec.fields['Delivery Date'] || null;
}

function _invDaysSinceDelivery(rec) {
  const dt = _invDeliveredAt(rec);
  if (!dt) return null;
  const diff = (Date.now() - new Date(dt).getTime()) / 86400000;
  return Math.floor(diff);
}

function _invAgingBucket(days) {
  if (days == null) return { key: 'na',   label: '—',     color: '#64748B' };
  if (days <= 7)    return { key: '0-7',  label: '0-7μ',  color: '#10B981' };
  if (days <= 14)   return { key: '7-14', label: '7-14μ', color: '#7DD3FC' };
  if (days <= 30)   return { key: '14-30',label: '14-30μ',color: '#F59E0B' };
  return                    { key: '>30', label: `${days}μ`, color: '#DC2626' };
}

function _invIsOverdue(rec) {
  if (_invIsInvoiced(rec)) return false;
  if (rec.fields['Status'] !== 'Delivered') return false;
  const d = _invDaysSinceDelivery(rec);
  return d != null && d > 30;
}

function _fmtEuro(v) {
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(v || 0);
}

// Auto-suggest next invoice number: INV-YYYY-NNNN
function _invNextNumber() {
  const yr = new Date().getFullYear();
  const prefix = `INV-${yr}-`;
  let max = 0;
  INV.data.forEach(r => {
    const n = (r.fields['Invoice Number']||'').toString();
    if (n.startsWith(prefix)) {
      const num = parseInt(n.slice(prefix.length), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return prefix + String(max + 1).padStart(4, '0');
}

// ─── Main ────────────────────────────────────────
async function renderInvoicing() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading invoicing data...');
  try {
    await preloadReferenceData();
    const formula = `OR({Status}="Delivered",{Status}="Invoiced",{Invoiced}=1)`;
    const [intlRecs, natlRecs] = await Promise.all([
      atGet(TABLES.ORDERS, formula, false),
      atGet(TABLES.NAT_ORDERS, `OR({Status}="Delivered",{Status}="Invoiced",{Invoiced}=1)`, false).catch(() => []),
    ]);

    intlRecs.forEach(r => { r._type = 'intl'; });
    natlRecs.forEach(r => { r._type = 'natl'; });

    INV.data = [...intlRecs, ...natlRecs];
    INV.filtered = INV.data;
    INV.selectedId = null;
    _invFilters.tab = 'ready';
    _invFilters.type = '';
    _invFilters.weekFrom = '';
    _invFilters.weekTo = '';
    _invFilters.client = '';
    INV.sort = { col: 'aging', dir: 'desc' };

    _renderInvLayout(c);
    _applyInvFilters();
  } catch (e) {
    c.innerHTML = showError(e.message);
    console.error('Invoicing:', e);
  }
}

// ─── Layout ──────────────────────────────────────
function _renderInvLayout(c) {
  const _i = n => (typeof icon === 'function') ? icon(n, 14) : '';
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:var(--space-4)">
      <div>
        <div class="page-title">Invoicing</div>
        <div class="page-sub" id="invSub">${INV.data.length} orders</div>
      </div>
      <div style="display:flex;gap:var(--space-2);align-items:center">
        <button class="btn btn-ghost btn-sm" onclick="_invShowOutstandingModal()">${_i('users')} Outstanding by Client</button>
        <button class="btn btn-secondary btn-sm" onclick="_invExportPDF()">${_i('file_text')} PDF για Λογιστή</button>
        <button class="btn btn-primary btn-sm" onclick="_invBatchInvoice()" id="invBatchBtn" style="display:none">${_i('check')} Mark Selected Invoiced</button>
        <button class="btn btn-ghost btn-sm" onclick="_invExportCSV()">${_i('file_text')} Export CSV</button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div id="invKPI" style="display:grid;grid-template-columns:repeat(5,1fr);gap:var(--space-3);margin-bottom:var(--space-5)"></div>

    <!-- Tabs -->
    <div id="invTabs" style="display:flex;gap:0;margin-bottom:var(--space-4);border-bottom:2px solid var(--border-default, #1E293B)"></div>

    <!-- Filters -->
    <div class="entity-toolbar-v2" style="margin-bottom:var(--space-4)">
      <div class="entity-search-wrap">
        ${_i('search')}
        <input class="entity-search-input" placeholder="Search client..."
          oninput="_invSetFilter('client',this.value)">
      </div>
      <select class="svc-filter" onchange="_invSetFilter('type',this.value)">
        <option value="">Type: All</option>
        <option value="intl">International</option>
        <option value="natl">National</option>
      </select>
      <input type="number" class="svc-filter" style="width:110px" placeholder="Week from"
        onchange="_invSetFilter('weekFrom',this.value)">
      <input type="number" class="svc-filter" style="width:110px" placeholder="Week to"
        onchange="_invSetFilter('weekTo',this.value)">
    </div>

    <div style="display:flex;gap:16px;align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="table-wrap">
          <table>
            <thead><tr id="invThead"></tr></thead>
            <tbody id="invBody"></tbody>
          </table>
        </div>
      </div>
      <div id="invDetail" style="width:360px;flex-shrink:0;display:none"></div>
    </div>
  `;
}

// ─── Tabs ────────────────────────────────────────
function _renderInvTabs() {
  const tabs = [
    { key: 'ready',    label: 'Ready',    count: INV.data.filter(_invIsReady).length },
    { key: 'overdue',  label: 'Overdue',  count: INV.data.filter(_invIsOverdue).length },
    { key: 'blocked',  label: 'Blocked',  count: INV.data.filter(_invIsBlocked).length },
    { key: 'invoiced', label: 'Invoiced', count: INV.data.filter(_invIsInvoiced).length },
    { key: 'all',      label: 'All',      count: INV.data.length },
  ];
  const el = document.getElementById('invTabs');
  if (!el) return;
  el.innerHTML = tabs.map(t => {
    const isActive = _invFilters.tab === t.key;
    const isOverdue = t.key === 'overdue' && t.count > 0;
    const color = isActive ? '#0284C7' : (isOverdue ? '#DC2626' : '#94A3B8');
    return `
      <button onclick="_invSetTab('${t.key}')"
        style="padding:8px 18px;font-family:'Syne',sans-serif;font-size:13px;font-weight:600;
        border:none;cursor:pointer;background:none;
        color:${color};
        border-bottom:2px solid ${isActive ? '#0284C7' : 'transparent'};
        margin-bottom:-2px">
        ${t.label} <span style="font-weight:400;opacity:0.7">(${t.count})</span>
      </button>`;
  }).join('');
}

function _invSetTab(key)            { _invFilters.tab = key; _applyInvFilters(); }
function _invSetFilter(key, val)    { _invFilters[key] = val; _applyInvFilters(); }
function _invSetSort(col) {
  if (INV.sort.col === col) INV.sort.dir = INV.sort.dir === 'asc' ? 'desc' : 'asc';
  else { INV.sort.col = col; INV.sort.dir = 'asc'; }
  _renderInvTable();
  _renderInvHead();
}

// ─── KPI Cards ───────────────────────────────────
function _renderInvKPI() {
  const ready    = INV.data.filter(_invIsReady);
  const blocked  = INV.data.filter(_invIsBlocked);
  const invoiced = INV.data.filter(_invIsInvoiced);
  const overdue  = INV.data.filter(_invIsOverdue);

  // Outstanding = delivered orders not yet invoiced (waiting to issue invoice)
  const outstandingRecs = INV.data.filter(r => r.fields['Status'] === 'Delivered' && !_invIsInvoiced(r));
  const outstandingTotal = outstandingRecs.reduce((s,r) => s + (_invPrice(r)||0), 0);
  const outstandingClients = new Set(outstandingRecs.map(r => Array.isArray(r.fields['Client']) ? r.fields['Client'][0] : null).filter(Boolean));

  const readyTotal = ready.reduce((s, r) => s + (_invPrice(r) || 0), 0);
  const invTotal   = invoiced.reduce((s, r) => s + (_invPrice(r) || 0), 0);

  const el = document.getElementById('invKPI');
  if (!el) return;

  const cardStyle = `background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:16px 18px`;
  const labelStyle = `font-size:11px;color:#94A3B8;font-family:'DM Sans',sans-serif;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px`;
  const valueStyle = `font-size:22px;font-weight:700;color:#F1F5F9;font-family:'Syne',sans-serif`;
  const deltaStyle = `font-size:11px;color:#64748B;margin-top:4px;font-family:'DM Sans',sans-serif`;

  el.innerHTML = `
    <div style="${cardStyle}">
      <div style="${labelStyle}">Ready to Invoice</div>
      <div style="${valueStyle};color:#0284C7">${ready.length}</div>
      <div style="${deltaStyle}">${_fmtEuro(readyTotal)}</div>
    </div>
    <div style="${cardStyle};${overdue.length ? 'border-color:#7F1D1D' : ''}">
      <div style="${labelStyle}">Overdue (>30μ)</div>
      <div style="${valueStyle};color:${overdue.length ? '#DC2626' : '#10B981'}">${overdue.length}</div>
      <div style="${deltaStyle}">${overdue.length ? 'Άμεση ενέργεια' : 'Όλα ΟΚ'}</div>
    </div>
    <div style="${cardStyle}">
      <div style="${labelStyle}">Blocked (PE)</div>
      <div style="${valueStyle};color:#F59E0B">${blocked.length}</div>
      <div style="${deltaStyle}">Awaiting pallet sheets</div>
    </div>
    <div style="${cardStyle}">
      <div style="${labelStyle}">Invoiced</div>
      <div style="${valueStyle};color:#10B981">${invoiced.length}</div>
      <div style="${deltaStyle}">${_fmtEuro(invTotal)}</div>
    </div>
    <div style="${cardStyle};cursor:pointer" onclick="_invShowOutstandingModal()" title="Δες ανά πελάτη">
      <div style="${labelStyle}">Outstanding</div>
      <div style="${valueStyle}">${_fmtEuro(outstandingTotal)}</div>
      <div style="${deltaStyle}">${outstandingClients.size} πελάτες</div>
    </div>
  `;
}

// ─── Table head (sortable) ───────────────────────
function _renderInvHead() {
  const head = document.getElementById('invThead');
  if (!head) return;
  const cols = [
    { key: '_check', label: '<input type="checkbox" onchange="_invToggleAll(this.checked)" style="cursor:pointer">', sortable: false, w: '30px' },
    { key: 'order',  label: 'Order No' },
    { key: 'type',   label: 'Type' },
    { key: 'client', label: 'Client' },
    { key: 'route',  label: 'Route' },
    { key: 'aging',  label: 'Aging' },
    { key: 'pallets',label: 'Pallets', align: 'right' },
    { key: 'price',  label: 'Price',   align: 'right' },
    { key: 'pe',     label: 'PE',      align: 'center' },
    { key: 'status', label: 'Status' },
  ];
  head.innerHTML = cols.map(c => {
    if (c.sortable === false) return `<th style="width:${c.w||''}">${c.label}</th>`;
    const arrow = INV.sort.col === c.key ? (INV.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    const align = c.align ? `text-align:${c.align};` : '';
    return `<th style="cursor:pointer;${align}user-select:none" onclick="_invSetSort('${c.key}')">${c.label}${arrow}</th>`;
  }).join('');
}

// ─── Filter + Render Table ───────────────────────
function _applyInvFilters() {
  let list = INV.data;

  if (_invFilters.tab === 'ready')    list = list.filter(_invIsReady);
  if (_invFilters.tab === 'overdue')  list = list.filter(_invIsOverdue);
  if (_invFilters.tab === 'blocked')  list = list.filter(_invIsBlocked);
  if (_invFilters.tab === 'invoiced') list = list.filter(_invIsInvoiced);

  if (_invFilters.type) list = list.filter(r => r._type === _invFilters.type);

  if (_invFilters.weekFrom) {
    const wf = parseInt(_invFilters.weekFrom);
    list = list.filter(r => { const w = parseInt(_invWeek(r)); return !isNaN(w) && w >= wf; });
  }
  if (_invFilters.weekTo) {
    const wt = parseInt(_invFilters.weekTo);
    list = list.filter(r => { const w = parseInt(_invWeek(r)); return !isNaN(w) && w <= wt; });
  }

  if (_invFilters.client && _invFilters.client.length >= 2) {
    const q = _invFilters.client.toLowerCase();
    list = list.filter(r => _invClientName(r).toLowerCase().includes(q));
  }

  INV.filtered = list;
  _renderInvTabs();
  _renderInvKPI();
  _renderInvHead();
  _renderInvTable();

  const sub = document.getElementById('invSub');
  if (sub) sub.textContent = `${list.length} of ${INV.data.length} orders`;
}

function _invSortVal(rec, col) {
  switch(col) {
    case 'order':   return _invOrderNo(rec);
    case 'type':    return rec._type;
    case 'client':  return _invClientName(rec).toLowerCase();
    case 'route':   return _invRoute(rec).toLowerCase();
    case 'aging':   return _invDaysSinceDelivery(rec) ?? -1;
    case 'pallets': return _invPallets(rec);
    case 'price':   return _invPrice(rec);
    case 'pe':      return _invPESheetsOK(rec) ? 1 : 0;
    case 'status':  return _invIsInvoiced(rec) ? 2 : _invIsBlocked(rec) ? 1 : 0;
    default: return '';
  }
}

function _renderInvTable() {
  const tbody = document.getElementById('invBody');
  if (!tbody) return;

  if (!INV.filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#64748B;padding:32px">No orders match current filters</td></tr>`;
    return;
  }

  // Sort
  const sorted = [...INV.filtered].sort((a, b) => {
    const va = _invSortVal(a, INV.sort.col);
    const vb = _invSortVal(b, INV.sort.col);
    if (va < vb) return INV.sort.dir === 'asc' ? -1 : 1;
    if (va > vb) return INV.sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = sorted.map(r => {
    const f = r.fields;
    const sel = INV.selectedId === r.id ? 'background:#1E293B;' : '';
    const overdueRow = _invIsOverdue(r) ? 'background:#3F1212;' : '';

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

    const days = _invDaysSinceDelivery(r);
    const bucket = _invAgingBucket(days);
    const agingBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${bucket.color}22;color:${bucket.color};border:1px solid ${bucket.color}55">${bucket.label}</span>`;

    const isReady = _invIsReady(r);
    return `<tr onclick="_invSelect('${r.id}')" style="cursor:pointer;${sel}${overdueRow}transition:background 0.15s">
      <td onclick="event.stopPropagation()"><input type="checkbox" class="inv-cb" data-id="${r.id}" onchange="_invCheckChanged()" ${!isReady?'disabled style="opacity:0.3"':'style="cursor:pointer"'}></td>
      <td><strong>${escapeHtml(_invOrderNo(r))}</strong></td>
      <td>${typeBadge}</td>
      <td onclick="event.stopPropagation();_invShowClientHistory(${JSON.stringify(_invClientName(r)).replace(/"/g,'&quot;')})" style="cursor:pointer;color:#7DD3FC;text-decoration:underline;text-decoration-style:dotted" title="Δες ιστορικό πελάτη">${escapeHtml(_invClientName(r))}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(_invRoute(r))}</td>
      <td>${agingBadge}</td>
      <td style="text-align:right">${_invPallets(r)}</td>
      <td style="text-align:right">${_fmtEuro(_invPrice(r))}</td>
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

  if (!INV.selectedId) { panel.style.display = 'none'; return; }

  const rec = INV.data.find(r => r.id === INV.selectedId);
  if (!rec) { panel.style.display = 'none'; return; }

  const f = rec.fields;
  const canInvoice = can('orders') === 'full' || can('costs') === 'full';
  const isInvoiced = _invIsInvoiced(rec);
  const isBlocked  = _invIsBlocked(rec);
  const days = _invDaysSinceDelivery(rec);
  const bucket = _invAgingBucket(days);

  // Invoice block — different rendering depending on state
  let invoiceBlock = '';
  if (isBlocked) {
    invoiceBlock = `<button disabled style="width:100%;padding:10px;border-radius:8px;border:1px solid #334155;
      background:#1E293B;color:#64748B;font-size:13px;font-weight:600;cursor:not-allowed;margin-top:12px">
      PE Sheets Missing — Cannot Invoice</button>`;
  } else if (!isInvoiced && canInvoice) {
    const nextNum = _invNextNumber();
    const today = localToday();
    invoiceBlock = `
      <div style="margin-top:14px;padding:12px;background:#1E293B;border-radius:8px;border:1px solid #334155">
        <div style="font-size:11px;color:#94A3B8;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Έκδοση Τιμολογίου</div>
        <input id="invNumInput" value="${nextNum}" style="width:100%;padding:8px;border-radius:6px;background:#0F172A;border:1px solid #334155;color:#F1F5F9;font-size:13px;font-family:'DM Sans',sans-serif;margin-bottom:8px" placeholder="Invoice Number">
        <input id="invDateInput" type="date" value="${today}" style="width:100%;padding:8px;border-radius:6px;background:#0F172A;border:1px solid #334155;color:#F1F5F9;font-size:13px;font-family:'DM Sans',sans-serif;margin-bottom:10px">
        <button onclick="_invMarkInvoiced('${rec.id}')" style="width:100%;padding:10px;border-radius:8px;
          border:none;background:#0284C7;color:#fff;font-size:13px;font-weight:600;cursor:pointer;
          transition:background 0.15s"
          onmouseenter="this.style.background='#0369A1'" onmouseleave="this.style.background='#0284C7'">
          Mark as Invoiced</button>
      </div>`;
  } else if (isInvoiced) {
    const num = f['Invoice Number'] || '—';
    const date = f['Invoice Date'] || '—';
    invoiceBlock = `
      <div style="margin-top:14px;padding:12px;background:#064E3B22;border-radius:8px;border:1px solid #064E3B">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:11px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px">Τιμολόγιο</span>
          <span style="font-size:11px;font-weight:600;color:#6EE7B7">Invoiced</span>
        </div>
        <div style="font-size:13px;color:#F1F5F9;font-weight:600">${escapeHtml(num)}</div>
        <div style="font-size:11px;color:#94A3B8;margin-top:2px">${escapeHtml(date)}</div>
      </div>`;
  }

  const row = (label, val) => `
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1E293B">
      <span style="color:#94A3B8;font-size:12px">${label}</span>
      <span style="color:#F1F5F9;font-size:13px;font-weight:500;text-align:right;max-width:200px;overflow:hidden;text-overflow:ellipsis">${val}</span>
    </div>`;

  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:20px;position:sticky;top:16px;max-height:calc(100vh - 40px);overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:#F1F5F9">${escapeHtml(_invOrderNo(rec))}</span>
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;
          background:${rec._type === 'intl' ? '#0C2D5C' : '#14532D'};
          color:${rec._type === 'intl' ? '#38BDF8' : '#4ADE80'}">${rec._type === 'intl' ? 'INTL' : 'NATL'}</span>
      </div>
      ${days != null ? `<div style="margin-bottom:10px;padding:6px 10px;background:${bucket.color}22;border-radius:6px;border:1px solid ${bucket.color}55"><span style="font-size:11px;color:${bucket.color};font-weight:600">⏱ ${days} μέρες από την παράδοση</span></div>` : ''}
      ${row('Client', escapeHtml(_invClientName(rec)))}
      ${row('Route', escapeHtml(_invRoute(rec)))}
      ${row('Week', _invWeek(rec))}
      ${row('Pallets', _invPallets(rec))}
      ${row('Price', _fmtEuro(_invPrice(rec)))}
      ${row('Net Price', _fmtEuro(_invNetPrice(rec)))}
      ${rec._type === 'intl' ? row('Pallet Exchange', _invPERequired(rec) ? 'Yes' : 'No') : ''}
      ${rec._type === 'intl' && _invPERequired(rec) ? row('PE Sheets', _invPESheetsOK(rec) ? 'Uploaded' : 'Missing') : ''}
      ${row('Status', f['Status'] || '—')}
      ${row('Direction', f['Direction'] || '—')}
      ${row('Pallet Balance', `<span id="invPalBal_${rec.id}" style="color:#94A3B8">…</span>`)}
      ${invoiceBlock}
    </div>
  `;

  // Async fetch pallet balance for this client
  const clientId = Array.isArray(f['Client']) ? f['Client'][0] : null;
  if (clientId) _invFetchPalletBalance(clientId, `invPalBal_${rec.id}`);
}

// ─── Invoice Action ──────────────────────────────
async function _invMarkInvoiced(recId) {
  const rec = INV.data.find(r => r.id === recId);
  if (!rec) return;

  if (rec._type === 'intl' && _invPERequired(rec) && !_invPESheetsOK(rec)) {
    toast('Cannot invoice — pallet exchange sheets are missing', 'error');
    return;
  }

  const numInput  = document.getElementById('invNumInput');
  const dateInput = document.getElementById('invDateInput');
  const invNumber = numInput ? numInput.value.trim() : '';
  const invDate   = dateInput ? dateInput.value : localToday();

  if (!invNumber) { toast('Συμπλήρωσε Invoice Number', 'error'); return; }

  const table = rec._type === 'intl' ? TABLES.ORDERS : TABLES.NAT_ORDERS;
  try {
    const fields = {
      'Status': 'Invoiced',
      'Invoiced': true,
      'Invoice Number': invNumber,
      'Invoice Date': invDate,
    };
    await atPatch(table, recId, fields);
    invalidateCache(table);

    Object.assign(rec.fields, fields);

    toast(`Τιμολόγιο ${invNumber} εκδόθηκε`);
    _applyInvFilters();
    _renderInvDetail();
  } catch (e) {
    toast('Αποτυχία: ' + e.message, 'error');
  }
}

// ─── Batch Operations ───────────────────────────
function _invCheckChanged() {
  const checked = document.querySelectorAll('.inv-cb:checked');
  const btn = document.getElementById('invBatchBtn');
  if (btn) btn.style.display = checked.length > 0 ? '' : 'none';
}

function _invToggleAll(checked) {
  document.querySelectorAll('.inv-cb:not(:disabled)').forEach(cb => cb.checked = checked);
  _invCheckChanged();
}

async function _invBatchInvoice() {
  const ids = [...document.querySelectorAll('.inv-cb:checked')].map(cb => cb.dataset.id);
  if (!ids.length) return;
  if (!confirm(`Mark ${ids.length} orders as Invoiced?\n(Auto-generated invoice numbers, today's date)`)) return;

  let ok = 0, fail = 0;
  const today = localToday();
  for (const id of ids) {
    const rec = INV.data.find(r => r.id === id);
    if (!rec) continue;
    try {
      const tbl = rec._type === 'intl' ? TABLES.ORDERS : TABLES.NAT_ORDERS;
      const num = _invNextNumber();
      const fields = {
        'Status': 'Invoiced',
        'Invoiced': true,
        'Invoice Number': num,
        'Invoice Date': today,
      };
      await atPatch(tbl, id, fields);
      Object.assign(rec.fields, fields);
      ok++;
    } catch(e) { console.error('Batch fail:', id, e); if (typeof logError === 'function') logError(e, 'invBatchInvoice ' + id); fail++; }
  }
  invalidateCache(TABLES.ORDERS);
  invalidateCache(TABLES.NAT_ORDERS);
  toast(fail ? `${ok} τιμολόγια εκδόθηκαν, ${fail} απέτυχαν` : `${ok} τιμολόγια εκδόθηκαν`, fail ? 'warn' : 'success');
  _applyInvFilters();
}

// ─── Outstanding by Client modal ─────────────────
function _invShowOutstandingModal() {
  // Group by client — show ONLY delivered orders not yet invoiced
  const byClient = {};
  INV.data.filter(r => r.fields['Status'] === 'Delivered' && !_invIsInvoiced(r)).forEach(r => {
    const name = _invClientName(r);
    if (!byClient[name]) byClient[name] = { total: 0, count: 0, oldest: 0 };
    byClient[name].total += _invPrice(r) || 0;
    byClient[name].count += 1;
    const days = _invDaysSinceDelivery(r) || 0;
    if (days > byClient[name].oldest) byClient[name].oldest = days;
  });

  const rows = Object.entries(byClient)
    .sort(([,a], [,b]) => b.total - a.total)
    .map(([name, d]) => {
      const bucket = _invAgingBucket(d.oldest);
      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td style="text-align:right">${d.count}</td>
        <td style="text-align:right;font-weight:600">${_fmtEuro(d.total)}</td>
        <td style="text-align:center"><span style="color:${bucket.color};font-weight:600">${bucket.label}</span></td>
      </tr>`;
    }).join('');

  const grandTotal = Object.values(byClient).reduce((s,d) => s + d.total, 0);

  openModal('Outstanding by Client', `
    <div style="max-height:60vh;overflow-y:auto">
      <table style="width:100%">
        <thead>
          <tr><th>Client</th><th style="text-align:right">Orders</th><th style="text-align:right">Total</th><th style="text-align:center">Oldest</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;padding:30px;color:#64748B">Δεν υπάρχουν εκκρεμότητες</td></tr>'}</tbody>
        ${rows ? `<tfoot><tr style="border-top:2px solid #334155"><td colspan="2" style="font-weight:700">TOTAL</td><td style="text-align:right;font-weight:700;color:#F59E0B">${_fmtEuro(grandTotal)}</td><td></td></tr></tfoot>` : ''}
      </table>
    </div>
  `);
}

// ─── CSV Export ─────────────────────────────────
function _invExportCSV() {
  const rows = [['Order No','Type','Client','Route','Aging Days','Pallets','Price','Net Price','Invoice Number','Invoice Date','PE Status','Status']];
  INV.filtered.forEach(r => {
    rows.push([
      _invOrderNo(r),
      r._type === 'intl' ? 'International' : 'National',
      _invClientName(r),
      _invRoute(r).replace(/,/g, ' '),
      _invDaysSinceDelivery(r) ?? '',
      _invPallets(r),
      _invPrice(r) || 0,
      _invNetPrice(r) || 0,
      r.fields['Invoice Number'] || '',
      r.fields['Invoice Date'] || '',
      _invPESheetsOK(r) ? 'OK' : 'Missing',
      _invIsInvoiced(r) ? 'Invoiced' : _invIsBlocked(r) ? 'Blocked' : 'Ready',
    ]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `invoicing_${localToday()}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('CSV exported');
}

// ─── Bulk PDF Export (for accountant) ───────────────
function _invExportPDF() {
  const list = INV.filtered;
  if (!list.length) { toast('Δεν υπάρχουν εγγραφές για εξαγωγή', 'error'); return; }

  const tabLabel = ({ ready:'Ready', overdue:'Overdue', blocked:'Blocked', invoiced:'Invoiced', all:'All' })[_invFilters.tab] || 'All';
  const today = new Date().toLocaleDateString('el-GR');

  // Sort by date descending
  const sorted = [...list].sort((a,b) => {
    const da = new Date(_invDeliveredAt(a) || 0).getTime();
    const db = new Date(_invDeliveredAt(b) || 0).getTime();
    return db - da;
  });

  const totalPrice = sorted.reduce((s,r) => s + (_invPrice(r)||0), 0);
  const totalNet = sorted.reduce((s,r) => s + (_invNetPrice(r)||0), 0);
  const totalPallets = sorted.reduce((s,r) => s + (_invPallets(r)||0), 0);

  const rows = sorted.map(r => {
    const f = r.fields;
    const dt = _invDeliveredAt(r);
    const dtStr = dt ? new Date(dt).toLocaleDateString('el-GR') : '—';
    return `<tr>
      <td>${escapeHtml(_invOrderNo(r))}</td>
      <td>${r._type === 'intl' ? 'INTL' : 'NATL'}</td>
      <td>${escapeHtml(_invClientName(r))}</td>
      <td>${escapeHtml(_invRoute(r))}</td>
      <td style="text-align:center">${dtStr}</td>
      <td style="text-align:right">${_invPallets(r)}</td>
      <td style="text-align:right">${_fmtEuro(_invPrice(r))}</td>
      <td style="text-align:right">${_fmtEuro(_invNetPrice(r))}</td>
      <td>${escapeHtml(f['Invoice Number']||'—')}</td>
      <td style="text-align:center">${escapeHtml(f['Invoice Date']||'—')}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="el"><head><meta charset="UTF-8">
    <title>Invoicing Report — ${tabLabel} — ${today}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0B1929;padding-bottom:12px;margin-bottom:16px}
      .hdr h1{font-size:18px;font-weight:700;color:#0B1929}
      .hdr .meta{font-size:11px;color:#555;text-align:right}
      .stats{display:flex;gap:24px;margin-bottom:14px;padding:10px;background:#F5F7FA;border-radius:6px}
      .stat{font-size:11px}
      .stat b{display:block;font-size:14px;color:#0B1929}
      table{width:100%;border-collapse:collapse;font-size:10px}
      thead th{background:#0B1929;color:#fff;padding:6px 8px;text-align:left;font-weight:600}
      tbody td{padding:5px 8px;border-bottom:1px solid #E5E7EB}
      tbody tr:nth-child(even){background:#FAFAFA}
      tfoot td{padding:8px;font-weight:700;background:#F5F7FA;border-top:2px solid #0B1929}
      .pbar{position:fixed;top:0;left:0;right:0;background:#0B1929;color:#fff;padding:10px 20px;display:flex;justify-content:space-between;align-items:center}
      .pbar button{background:#0284C7;color:#fff;border:none;padding:6px 18px;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer}
      .pbar button:hover{background:#0369A1}
      .body-wrap{margin-top:50px}
      @media print {
        .pbar{display:none}
        .body-wrap{margin-top:0}
        body{padding:10px}
        @page{size:A4 landscape;margin:1cm}
      }
    </style></head><body>
    <div class="pbar">
      <span style="font-weight:700">Petras Group — Invoicing Report</span>
      <button onclick="window.print()">Εκτύπωση / Save as PDF</button>
    </div>
    <div class="body-wrap">
      <div class="hdr">
        <div>
          <h1>Invoicing Report</h1>
          <div style="font-size:11px;color:#555;margin-top:4px">Tab: ${tabLabel}</div>
        </div>
        <div class="meta">
          <div><b>Date:</b> ${today}</div>
          <div><b>Records:</b> ${sorted.length}</div>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><b>${sorted.length}</b>Orders</div>
        <div class="stat"><b>${totalPallets}</b>Total Pallets</div>
        <div class="stat"><b>${_fmtEuro(totalPrice)}</b>Gross Revenue</div>
        <div class="stat"><b>${_fmtEuro(totalNet)}</b>Net Revenue</div>
      </div>
      <table>
        <thead><tr>
          <th>Order #</th><th>Type</th><th>Client</th><th>Route</th>
          <th style="text-align:center">Delivered</th>
          <th style="text-align:right">Pallets</th>
          <th style="text-align:right">Price</th>
          <th style="text-align:right">Net</th>
          <th>Inv. #</th><th style="text-align:center">Inv. Date</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="5">TOTAL</td>
          <td style="text-align:right">${totalPallets}</td>
          <td style="text-align:right">${_fmtEuro(totalPrice)}</td>
          <td style="text-align:right">${_fmtEuro(totalNet)}</td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table>
    </div>
    <script>setTimeout(()=>window.print(), 400);</script>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { toast('Επέτρεψε popups για να δεις το PDF', 'error'); return; }
  w.document.write(html);
  w.document.close();
}

// ─── Client History modal ──────────────────────────
function _invShowClientHistory(clientName) {
  const orders = INV.data
    .filter(r => _invClientName(r) === clientName)
    .sort((a,b) => {
      const da = new Date(_invDeliveredAt(a) || 0).getTime();
      const db = new Date(_invDeliveredAt(b) || 0).getTime();
      return db - da;
    });

  if (!orders.length) { toast('Δεν βρέθηκαν παραγγελίες', 'error'); return; }

  const totalPrice = orders.reduce((s,r) => s + (_invPrice(r)||0), 0);
  const invoicedCount = orders.filter(_invIsInvoiced).length;
  const pendingCount = orders.length - invoicedCount;
  const pendingTotal = orders.filter(r => !_invIsInvoiced(r)).reduce((s,r) => s + (_invPrice(r)||0), 0);

  const rows = orders.map(r => {
    const f = r.fields;
    const dt = _invDeliveredAt(r);
    const dtStr = dt ? new Date(dt).toLocaleDateString('el-GR') : '—';
    const days = _invDaysSinceDelivery(r);
    const bucket = _invAgingBucket(days);
    const isInv = _invIsInvoiced(r);
    const statusBadge = isInv
      ? `<span style="padding:2px 6px;border-radius:4px;background:#064E3B;color:#6EE7B7;font-size:10px;font-weight:600">Invoiced</span>`
      : `<span style="padding:2px 6px;border-radius:4px;background:#0C4A6E;color:#7DD3FC;font-size:10px;font-weight:600">Pending</span>`;

    return `<tr>
      <td>${escapeHtml(_invOrderNo(r))}</td>
      <td>${r._type === 'intl' ? 'INTL' : 'NATL'}</td>
      <td>${dtStr}</td>
      <td><span style="color:${bucket.color};font-weight:600">${bucket.label}</span></td>
      <td style="text-align:right">${_fmtEuro(_invPrice(r))}</td>
      <td>${escapeHtml(f['Invoice Number']||'—')}</td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join('');

  openModal(`Ιστορικό — ${clientName}`, `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      <div style="padding:10px;background:#0F172A;border-radius:6px;border:1px solid #1E293B">
        <div style="font-size:10px;color:#94A3B8;text-transform:uppercase">Σύνολο</div>
        <div style="font-size:18px;font-weight:700;color:#F1F5F9">${orders.length}</div>
      </div>
      <div style="padding:10px;background:#0F172A;border-radius:6px;border:1px solid #1E293B">
        <div style="font-size:10px;color:#94A3B8;text-transform:uppercase">Invoiced</div>
        <div style="font-size:18px;font-weight:700;color:#10B981">${invoicedCount}</div>
      </div>
      <div style="padding:10px;background:#0F172A;border-radius:6px;border:1px solid #1E293B">
        <div style="font-size:10px;color:#94A3B8;text-transform:uppercase">Pending</div>
        <div style="font-size:18px;font-weight:700;color:#F59E0B">${pendingCount}</div>
        <div style="font-size:10px;color:#64748B;margin-top:2px">${_fmtEuro(pendingTotal)}</div>
      </div>
      <div style="padding:10px;background:#0F172A;border-radius:6px;border:1px solid #1E293B">
        <div style="font-size:10px;color:#94A3B8;text-transform:uppercase">Total Revenue</div>
        <div style="font-size:18px;font-weight:700;color:#F1F5F9">${_fmtEuro(totalPrice)}</div>
      </div>
    </div>
    <div style="max-height:50vh;overflow-y:auto">
      <table style="width:100%">
        <thead><tr>
          <th>Order #</th><th>Type</th><th>Delivered</th><th>Aging</th>
          <th style="text-align:right">Price</th><th>Inv. #</th><th>Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);
}

// ─── Pallet Balance for client ──────────────────────
async function _invFetchPalletBalance(clientId, mountId) {
  if (!clientId) return;
  try {
    const ff = `FIND("${clientId}", ARRAYJOIN({Client Account}, ","))>0`;
    const recs = await atGetAll(TABLES.PALLET_LEDGER, { fields: ['Direction','Pallets','Date'], filterByFormula: ff }, false).catch(()=>[]);
    let inP = 0, outP = 0;
    recs.forEach(r => {
      const d = (r.fields['Direction']||'').toLowerCase();
      const p = +r.fields['Pallets'] || 0;
      if (d === 'loading' || d === 'in')       inP += p;
      else if (d === 'unloading' || d === 'out') outP += p;
    });
    const balance = inP - outP;
    const target = document.getElementById(mountId);
    if (!target) return;
    const color = balance > 0 ? '#10B981' : balance < 0 ? '#F59E0B' : '#94A3B8';
    const sign = balance > 0 ? '+' : '';
    const label = balance > 0 ? '(μας οφείλει)' : balance < 0 ? '(τους οφείλουμε)' : '(zero)';
    target.innerHTML = `<span style="color:${color};font-weight:600">${sign}${balance}</span> <span style="color:#94A3B8;font-size:10px">${label}</span><span style="color:#64748B;font-size:10px;margin-left:6px">in:${inP} · out:${outP}</span>`;
  } catch(e) {
    const target = document.getElementById(mountId);
    if (target) target.textContent = '—';
  }
}
