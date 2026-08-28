// ═══════════════════════════════════════════════
// MODULE — NATIONAL ORDERS  v2
// ═══════════════════════════════════════════════
(function() {
'use strict';

const NATL_ORDERS = { data: [], filtered: [], selectedId: null };
const _natlFilters = {};
let _natlSortCol = null;
let _natlSortDir = 0;
let _onPage = 1;
const _onPageSize = 50;
let _natlPeriod = '60'; // '60' | '180' | 'all'

// ─── Virtual Scroll State ─────────────────────
const _onVS = { sortedRecs: [], lastStart: -1, lastEnd: -1, rafId: null };
const _ON_ROW_H = 40;
const _ON_BUFFER = 10;

// ─── Ref data: delegates to shared form-helpers.js ──
const _loadLocations = fhLoadLocations;
const _batchResolveClients = fhBatchResolveClients;

// Form helpers for location/client selects (delegates to core/form-helpers.js)
function _locSelect(id, currentId) { return fhLocSelect(id, currentId, 'fhLocDrop'); }
function _clientSelect(id, currentId, currentLabel) { return fhClientSelect(id, currentId, currentLabel, 'fhClientDrop'); }

// ─── Main ───────────────────────────────────────
async function renderOrdersNatl() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading national orders...');
  try {
    // Date range filter based on period dropdown
    let _natlDateFormula = '';
    if (_natlPeriod !== 'all') {
      const days = _natlPeriod === '180' ? 180 : 60;
      const _natlCutoff = new Date();
      _natlCutoff.setDate(_natlCutoff.getDate() - days);
      const _natlCutoffStr = _natlCutoff.toISOString().split('T')[0];
      _natlDateFormula = `IS_AFTER({Loading DateTime}, '${_natlCutoffStr}')`;
    }
    const [, records] = await Promise.all([
      _loadLocations(),
      atGet(TABLES.NAT_ORDERS, _natlDateFormula || '', false),
    ]);
    records.sort((a,b) => (b.fields['Loading DateTime']||'').localeCompare(a.fields['Loading DateTime']||''));
    NATL_ORDERS.data = records;
    NATL_ORDERS.filtered = records;
    NATL_ORDERS.selectedId = null;
    Object.keys(_natlFilters).forEach(k => delete _natlFilters[k]);
    _onPage = 1;

    // Pre-resolve all client names — batch fetches in parallel (not N+1)
    const _allClientIds = [...new Set(records
      .flatMap(r => r.fields['Client']||[])
      .filter(Boolean))];
    await _batchResolveClients(_allClientIds);

    _renderNatlLayout(c);
    _applyNatlFilters();
  } catch(e) {
    c.innerHTML = showError('Failed to load national orders');
    if (typeof logError === 'function') logError(e, 'renderOrdersNatl load');
  }
}

function _renderNatlLayout(c) {
  const canEdit = can('orders') === 'full';
  const _i = n => (typeof icon === 'function') ? icon(n, 14) : '';
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:var(--space-4)">
      <div>
        <div class="page-title">Εθνικές Παραγγελίες</div>
        <div class="page-sub" id="natlSub">${NATL_ORDERS.data.length} orders</div>
      </div>
      <div style="display:flex;gap:var(--space-2);align-items:center">
        <button class="btn btn-secondary btn-sm" onclick="openNatlScan()">${_i('camera')} Scan</button>
        ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="openNatlCreate()">${_i('plus')} New Order</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="_natlExportCSV()">${_i('download')} CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="_natlPrint()">${_i('file_text')} Print</button>
      </div>
    </div>
    <div class="entity-layout">
      <div class="entity-list-panel">
        <div class="entity-toolbar-v2">
          <div class="entity-search-wrap">
            ${_i('search')}
            <input class="entity-search-input" placeholder="Αναζήτηση πελάτη / τοποθεσίας / εμπορεύματος…"
              oninput="natlSearch(this.value)">
          </div>
          <select class="svc-filter" onchange="natlFilter('Direction',this.value)">
            <option value="">Κατεύθυνση: Όλες</option>
            <option value="North→South">↓ ΚΑΘΟΔΟΣ (Βορράς→Νότος)</option>
            <option value="South→North">↑ ΑΝΟΔΟΣ (Νότος→Βορράς)</option>
          </select>
          <select class="svc-filter" onchange="natlFilter('Type',this.value)">
            <option value="">Τύπος: Όλοι</option>
            <option value="Independent">Ανεξάρτητη</option>
            <option value="Veroia Switch">Veroia Switch</option>
          </select>
          <select class="svc-filter" onchange="natlFilter('Status',this.value)">
            <option value="">Κατάσταση παραγγελίας: Όλες</option>
            <option value="Pending">Σε αναμονή</option>
            <option value="Confirmed">Επιβεβαιωμένη</option>
            <option value="In Transit">Σε μεταφορά</option>
            <option value="Delivered">Παραδόθηκε</option>
          </select>
          <select class="svc-filter" onchange="natlFilter('_trip',this.value)">
            <option value="">Ανάθεση οχήματος: Όλες</option>
            <option value="unassigned">Χωρίς δρομολόγιο</option>
            <option value="assigned">Με δρομολόγιο</option>
          </select>
          <select class="svc-filter" onchange="natlFilter('_groupage',this.value)">
            <option value="">Ομαδοποίηση: Όλες</option>
            <option value="1">Μόνο ομαδοποιημένες</option>
          </select>
          <select class="svc-filter" onchange="natlPeriodChange(this.value)">
            <option value="60" ${_natlPeriod==='60'?'selected':''}>Τελευταίες 60 ημέρες</option>
            <option value="180" ${_natlPeriod==='180'?'selected':''}>Τελευταίοι 6 μήνες</option>
            <option value="all" ${_natlPeriod==='all'?'selected':''}>Όλα</option>
          </select>
          <span class="entity-count-chip" id="natlCount">${NATL_ORDERS.data.length}</span>
        </div>
        <div class="entity-table-wrap" id="natlTable"></div>
      </div>
      <div class="entity-detail-panel hidden" id="natlDetail"></div>
    </div>`;
}

// ─── Sort helpers ────────────────────────────────
const _natlColDefs = [
  { key: 'name',     label: 'ΟΝΟΜΑ',      type: 'text',   get: (f) => f['Name']||'' },
  { key: 'dir',      label: 'ΚΑΤΕΥΘ.',       type: 'text',   get: (f) => f['Direction']||'' },
  { key: 'client',   label: 'ΠΕΛΑΤΗΣ',    type: 'text',   get: (f) => { const id=(f['Client']||[])[0]; return id?(_fhClientsMap[id]||''):''; } },
  { key: 'pickup',   label: 'ΠΑΡΑΛΑΒΗ',    type: 'text',   get: (f) => { const id=(f['Pickup Location 1']||[])[0]; return id?(_fhLocationsMap[id]||''):''; } },
  { key: 'delivery', label: 'ΠΑΡΑΔΟΣΗ',  type: 'text',   get: (f) => { const id=(f['Delivery Location 1']||f['Delivery Location']||[])[0]; return id?(_fhLocationsMap[id]||''):''; } },
  { key: 'loadDate', label: 'ΗΜ. ΦΟΡΤΩΣΗΣ', type: 'date',   get: (f) => f['Loading DateTime']||'' },
  { key: 'delDate',  label: 'ΗΜ. ΠΑΡΑΔΟΣΗΣ',  type: 'date',   get: (f) => f['Delivery DateTime']||'' },
  { key: 'pal',      label: 'ΠΑΛ.',       type: 'number', get: (f) => f['Pallets']||0 },
  { key: 'trip',     label: 'ΔΡΟΜΟΛΟΓΙΟ',      type: 'text',   get: (f) => ((f['Linked Trip']?.length||0)+(f['NATIONAL TRIPS']?.length||0)+(f['NATIONAL TRIPS 2']?.length||0))>0?'Assigned':'Pending' },
  { key: 'inv',      label: 'ΤΙΜ.',       type: 'text',   get: (f) => f['Invoiced']?'1':'0' },
];

function _natlSortToggle(key) {
  if (_natlSortCol === key) {
    _natlSortDir = (_natlSortDir + 1) % 3;
    if (_natlSortDir === 0) _natlSortCol = null;
  } else {
    _natlSortCol = key;
    _natlSortDir = 1;
  }
  _applyNatlFilters();
}

function _natlSortRecords(recs) {
  if (!_natlSortCol || _natlSortDir === 0) return recs;
  const col = _natlColDefs.find(c => c.key === _natlSortCol);
  if (!col) return recs;
  const dir = _natlSortDir === 1 ? 1 : -1;
  return [...recs].sort((a, b) => {
    let va = col.get(a.fields), vb = col.get(b.fields);
    if (col.type === 'number') return ((parseFloat(va)||0) - (parseFloat(vb)||0)) * dir;
    if (col.type === 'date') return (va||'').localeCompare(vb||'') * dir;
    return String(va).toLowerCase().localeCompare(String(vb).toLowerCase()) * dir;
  });
}

// ─── Table (Virtual Scroll) ─────────────────────
function _onRowHtml(r) {
  const f = r.fields;
  const hasTrip = (f['Linked Trip']?.length||0)+(f['NATIONAL TRIPS']?.length||0)+(f['NATIONAL TRIPS 2']?.length||0) > 0;
  const dir = f['Direction']||'';
  const dirB = dir==='South→North'
    ? '<span class="badge badge-blue">↑ S→N</span>'
    : dir==='North→South'
      ? '<span class="badge badge-green">↓ N→S</span>'
      : `<span class="badge badge-grey">${dir||'—'}</span>`;
  const tripB  = hasTrip ? '<span class="badge badge-green">Assigned</span>' : '<span class="badge badge-yellow">Pending</span>';
  const vsB    = f['Type']==='Veroia Switch' ? '<span class="badge badge-yellow" style="margin-right:4px;font-size:10px">VS</span>' : '';
  const grpB   = f['National Groupage'] ? '<span class="badge badge-blue" style="margin-right:4px;font-size:10px">GRP</span>' : '';
  const sel    = r.id === NATL_ORDERS.selectedId ? ' selected' : '';

  const _pickupId = (f['Pickup Location 1']||[])[0]||'';
  const pickup = _pickupId ? (_fhLocationsMap[_pickupId]||'—') : '—';
  const _delivId = (f['Delivery Location 1']||f['Delivery Location']||[])[0]||'';
  const delivery = _delivId ? (_fhLocationsMap[_delivId]||'—') : '—';
  const _clientId = (f['Client']||[])[0]||'';
  const client = _clientId ? (_fhClientsMap[_clientId]||'—') : '—';

  return `<tr onclick="selectNatlOrder('${r.id}')" id="nrow_${r.id}" class="${sel}" style="height:${_ON_ROW_H}px">
    <td style="white-space:nowrap">${vsB}${grpB}<strong style="color:var(--text);font-size:12px">${escapeHtml(f['Name']||r.id.slice(-6))}</strong></td>
    <td>${dirB}</td>
    <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(client)}</td>
    <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(pickup)}</td>
    <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(delivery)}</td>
    <td>${f['Loading DateTime']  ? formatDateShort(f['Loading DateTime'])  : '—'}</td>
    <td>${f['Delivery DateTime'] ? formatDateShort(f['Delivery DateTime']) : '—'}</td>
    <td>${f['Pallets']||'—'}</td>
    <td>${tripB}</td>
    <td onclick="event.stopPropagation();toggleNatlInvoiced('${r.id}',${!!f['Invoiced']})"
      title="${f['Invoiced']?'Mark as Not Invoiced':'Mark as Invoiced'}"
      style="cursor:pointer;text-align:center">
      ${f['Invoiced']
        ? '<span class="badge badge-grey" style="cursor:pointer">✓ INV</span>'
        : '<span style="color:var(--text-dim);font-size:18px;line-height:1">·</span>'}
    </td>
  </tr>`;
}

function _onVirtualPaint() {
  const scroller = document.getElementById('onVScroll');
  if (!scroller) return;
  const tbody = scroller.querySelector('tbody');
  const topSp = document.getElementById('onTopSpacer');
  const botSp = document.getElementById('onBottomSpacer');
  if (!tbody || !topSp || !botSp) return;

  const total = _onVS.sortedRecs.length;
  const scrollTop = scroller.scrollTop;
  const visH = scroller.clientHeight;
  const startIdx = Math.max(0, Math.floor(scrollTop / _ON_ROW_H) - _ON_BUFFER);
  const endIdx = Math.min(total, Math.ceil((scrollTop + visH) / _ON_ROW_H) + _ON_BUFFER);

  if (startIdx === _onVS.lastStart && endIdx === _onVS.lastEnd) return;
  _onVS.lastStart = startIdx;
  _onVS.lastEnd = endIdx;

  topSp.style.height = (startIdx * _ON_ROW_H) + 'px';
  botSp.style.height = ((total - endIdx) * _ON_ROW_H) + 'px';

  const html = [];
  for (let i = startIdx; i < endIdx; i++) {
    html.push(_onRowHtml(_onVS.sortedRecs[i]));
  }
  tbody.innerHTML = html.join('');
}

function _onOnScroll() {
  if (_onVS.rafId) return;
  _onVS.rafId = requestAnimationFrame(() => {
    _onVS.rafId = null;
    _onVirtualPaint();
  });
}

function _renderNatlTable(records) {
  const wrap = document.getElementById('natlTable');
  if (!records.length) { wrap.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-dim)">Καμία παραγγελία δεν ταιριάζει στα φίλτρα</div>`; return; }

  const sortedRecs = _natlSortRecords(records);
  _onVS.sortedRecs = sortedRecs;
  _onVS.lastStart = -1;
  _onVS.lastEnd = -1;

  const ths = _natlColDefs.map(c => {
    const arrow = _natlSortCol===c.key ? (_natlSortDir===1?' <span style="color: var(--accent-text)">▲</span>':_natlSortDir===2?' <span style="color: var(--accent-text)">▼</span>':'') : '';
    return `<th style="cursor:pointer;user-select:none" onclick="_natlSortToggle('${c.key}')">${c.label}${arrow}</th>`;
  }).join('');

  const totalH = sortedRecs.length * _ON_ROW_H;
  wrap.innerHTML = `
    <div id="onVScroll" style="height:calc(100vh - 280px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#CBD5E0 transparent">
      <table>
        <thead><tr>${ths}</tr></thead>
      </table>
      <div id="onTopSpacer" style="height:0"></div>
      <table><tbody></tbody></table>
      <div id="onBottomSpacer" style="height:${totalH}px"></div>
    </div>
    <div style="padding:8px 16px;color:var(--panel-dim);font-size:12px;text-align:center">${sortedRecs.length} orders</div>`;

  const scroller = document.getElementById('onVScroll');
  scroller.addEventListener('scroll', _onOnScroll, { passive: true });
  _onVirtualPaint();
}

// ─── Filters ────────────────────────────────────
function natlSearch(q) { _natlFilters._q = q.toLowerCase().trim(); _onPage = 1; _applyNatlFilters(); }
function natlFilter(k,v) { if(!v) delete _natlFilters[k]; else _natlFilters[k]=v; _onPage = 1; _applyNatlFilters(); }
function natlPeriodChange(v) { _natlPeriod = v; _onVS.lastStart = -1; _onVS.lastEnd = -1; renderOrdersNatl(); }

function _applyNatlFilters() {
  let recs = NATL_ORDERS.data;
  if (_natlFilters._q) {
    const q = _natlFilters._q;
    recs = recs.filter(r => {
      const f = r.fields;
      const cId = Array.isArray(f['Client']) ? f['Client'][0] : '';
      const pId = (f['Pickup Location 1']||[])[0]||'';
      const dId = (f['Delivery Location 1']||f['Delivery Location']||[])[0]||'';
      return String(f['Name']||'').toLowerCase().includes(q)
        || (_fhClientsMap[cId]||'').toLowerCase().includes(q)
        || (_fhLocationsMap[pId]||'').toLowerCase().includes(q)
        || (_fhLocationsMap[dId]||'').toLowerCase().includes(q)
        || (f['Goods']||'').toLowerCase().includes(q);
    });
  }
  if (_natlFilters['Direction']) recs = recs.filter(r => r.fields['Direction'] === _natlFilters['Direction']);
  if (_natlFilters['Type'])      recs = recs.filter(r => r.fields['Type']      === _natlFilters['Type']);
  if (_natlFilters['Status'])    recs = recs.filter(r => r.fields['Status']    === _natlFilters['Status']);
  if (_natlFilters['_groupage']) recs = recs.filter(r => r.fields['National Groupage']);
  if (_natlFilters['_trip']==='unassigned') recs = recs.filter(r => {
    const f=r.fields; return !f['Linked Trip']?.length && !f['NATIONAL TRIPS']?.length && !f['NATIONAL TRIPS 2']?.length;
  });
  if (_natlFilters['_trip']==='assigned') recs = recs.filter(r => {
    const f=r.fields; return f['Linked Trip']?.length>0 || f['NATIONAL TRIPS']?.length>0 || f['NATIONAL TRIPS 2']?.length>0;
  });
  NATL_ORDERS.filtered = recs;
  _renderNatlTable(recs);
  const n = recs.length + (recs.length===1?' παραγγελία':' παραγγελίες');
  document.getElementById('natlCount').textContent = n;
  document.getElementById('natlSub').textContent   = n;
}

// ─── Detail Panel ───────────────────────────────
function selectNatlOrder(recId) {
  NATL_ORDERS.selectedId = recId;
  document.querySelectorAll('#natlTable tbody tr').forEach(tr => tr.classList.remove('selected'));
  const row = document.getElementById('nrow_'+recId); if(row) row.classList.add('selected');
  const rec = NATL_ORDERS.data.find(r => r.id === recId); if(!rec) return;
  const panel = document.getElementById('natlDetail');
  panel.classList.remove('hidden');
  const f = rec.fields;
  const canEdit = can('orders') === 'full';
  const hasTrip = (f['Linked Trip']?.length||0)+(f['NATIONAL TRIPS']?.length||0)+(f['NATIONAL TRIPS 2']?.length||0) > 0;
  const stMap = {Pending:'badge-yellow',Confirmed:'badge-blue','In Transit':'badge-green',Delivered:'badge-grey'};
  const cId = Array.isArray(f['Client']) ? f['Client'][0] : '';
  const pId = (f['Pickup Location 1']||[])[0]||'';
  const dId = (f['Delivery Location 1']||f['Delivery Location']||[])[0]||'';

  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="detail-title" style="font-size:13px">${escapeHtml(f['Name']||recId.slice(-6))}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px">
          ${escapeHtml(f['Direction']||'')} · ${escapeHtml(f['Type']||'')}
        </div>
      </div>
      <div class="detail-actions">
        ${canEdit?`<button type="button" class="btn-icon" title="Edit" onclick="openNatlEdit('${recId}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 2l3 3-9 9H2v-3l9-9z"/></svg>
        </button>
        ${f['Status']!=='Cancelled' && f['Status']!=='Delivered' && f['Status']!=='Invoiced' ? `<button type="button" class="btn-icon" title="Cancel order (mark as Cancelled, keep record)" onclick="cancelNatlOrder('${recId}')" style="color:#D97706">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l10 10M13 3L3 13"/></svg>
        </button>`:''}
        <button type="button" class="btn-icon" title="Delete (cascade — removes linked NL/GL/CL/Ramp/Pallets)" onclick="deleteNatlOrder('${recId}')" style="color:var(--danger)">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/></svg>
        </button>`:''}
        <button type="button" class="btn-icon" onclick="document.getElementById('natlDetail').classList.add('hidden')">✕</button>
      </div>
    </div>
    <div class="detail-body">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        <span class="badge ${stMap[f['Status']]||'badge-grey'}">${escapeHtml(f['Status']||'No Status')}</span>
        ${hasTrip?'<span class="badge badge-green">Trip Assigned</span>':'<span class="badge badge-yellow">No Trip</span>'}
        ${f['National Groupage']?'<span class="badge badge-blue">Groupage</span>':''}
        ${f['Type']==='Veroia Switch'?'<span class="badge badge-yellow">Veroia Switch</span>':''}
        ${f['Invoiced']?'<span class="badge badge-grey">Invoiced</span>':''}
        ${f['Pallet Exchange']?'<span class="badge badge-grey">Pallet Exch.</span>':''}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Order</div>
        ${_dF('Client',      escapeHtml(_fhClientsMap[cId]||cId||'—'))}
        ${_dF('Direction',   escapeHtml(f['Direction']||'—'))}
        ${_dF('Type',        escapeHtml(f['Type']||'—'))}
        ${_dF('Goods',       escapeHtml(f['Goods']||'—'))}
        ${_dF('Pallets',     escapeHtml(f['Pallets']||'—'))}
        ${_dF('Temperature', f['Temperature °C']!=null?escapeHtml(f['Temperature °C'])+' °C':'—')}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Route</div>
        ${_dF('Pickup',    escapeHtml(_fhLocationsMap[pId]||pId||'—'))}
        ${_dF('Load Date', f['Loading DateTime']  ? formatDate(f['Loading DateTime'])  : '—')}
        ${_dF('Delivery',  escapeHtml(_fhLocationsMap[dId]||dId||'—'))}
        ${_dF('Del Date',  f['Delivery DateTime'] ? formatDate(f['Delivery DateTime']) : '—')}
      </div>
      ${can('costs')!=='none'?`
      <div class="detail-section">
        <div class="detail-section-title">Financial</div>
        ${_dF('Price', f['Price']?'€ '+Number(f['Price']).toLocaleString('el-GR'):'—')}
      </div>`:''}
      ${f['Notes']?`<div class="detail-section"><div class="detail-section-title">Notes</div>
        <div style="font-size:12.5px;color:var(--text-mid);line-height:1.5">${escapeHtml(f['Notes'])}</div></div>`:''}
    </div>`;
}

/* ═══ Φ3β — GROUPAGE: μία καταχώρηση, πολλοί πελάτες (Γ1) ═════════════
 *
 * Γράφει ΟΛΟΚΛΗΡΗ την αλυσίδα, με αυστηρή σειρά:
 *
 *   1. NAT_ORDERS  xN   ένα ανά πελάτη, με το δικό του Price
 *   2. GROUPAGE_LINES xM  ένα ανά στάση, δεμένο στην παραγγελία του
 *   3. CONSOLIDATED_LOAD x1  το φορτηγό
 *   4. PATCH GL -> Linked Consolidated Load
 *   5. NAT_LOAD x1  Source Consolidated Load -> το CL
 *   6. ORDER_STOPS ανά παραγγελία, με παλέτες ΑΝΑ ΣΤΑΣΗ
 *
 * ΓΙΑΤΙ ΓΡΑΦΟΥΜΕ ΕΜΕΙΣ ΤΟ NAT_LOAD (εύρημα 10/8): κανένα σημείο αυτού του
 * repo δεν δημιουργεί NL από CL — η εφαρμογή μόνο διαβάζει Source Type=
 * 'Groupage'. Τη δημιουργία την κάνει το petras-assign, που δεν αγγίζουμε
 * (Δ11). Χωρίς αυτό το βήμα το φορτίο δεν θα εμφανιζόταν ΠΟΤΕ στο εβδομαδιαίο.
 *
 * ΠΑΓΙΔΑ Ο1: το `Groupage ID` είναι derived στα GL (ο Worker το εξαιρεί
 * επίτηδες) και κανονικό πεδίο στα CL. Γράφεται ΜΟΝΟ στο CL.
 *
 * Η υπάρχουσα φόρμα ενός πελάτη ΔΕΝ αγγίζεται. Αυτό είναι νέα, πρόσθετη
 * διαδρομή: αν σπάσει, η κανονική καταχώρηση δεν επηρεάζεται.
 */
async function _natlWriteGroupageChain(common, groups) {
  const created = { orders: [], gls: [], cl: null, nl: null };
  const grpId = 'G-' + Date.now().toString(36).toUpperCase();

  // 1. NAT_ORDERS — ένα ανά πελάτη
  for (const g of groups) {
    const totalPal = g.stops.reduce((s, x) => s + (x.pallets || 0), 0);
    const f = {
      'Direction': common.direction,
      'Client': [g.clientId],
      'Goods': common.goods || '',
      'Pallets': totalPal,
      'Loading DateTime': common.loadDate,
      'Delivery DateTime': g.stops[0]?.date || common.delDate,
      'National Groupage': true,
      'Status': 'Pending',
      'Pickup Location 1': [common.fromLocId],
    };
    if (common.temp != null && common.temp !== '') f['Temperature °C'] = parseFloat(common.temp);
    if (g.price) f['Price'] = parseFloat(g.price);
    g.stops.forEach((s, i) => { if (i < 10) f[`Delivery Location ${i+1}`] = [s.locId]; });
    const rec = await atCreate(TABLES.NAT_ORDERS, f);
    created.orders.push({ id: rec.id, group: g });

    // 6. ORDER_STOPS — παλέτες ΑΝΑ ΣΤΑΣΗ (Α1: ποτέ το σύνολο σε καθεμία)
    const stops = [{ stopNumber: 1, stopType: 'Loading', locationId: common.fromLocId,
                     pallets: totalPal, dateTime: common.loadDate, clientId: g.clientId }];
    g.stops.forEach((s, i) => stops.push({ stopNumber: i+1, stopType: 'Unloading',
      locationId: s.locId, pallets: s.pallets || 0, dateTime: s.date || common.delDate,
      clientId: g.clientId, notes: s.note || null }));
    try { await stopsSave(rec.id, stops, F.STOP_PARENT_NAT); }
    catch(e) { console.warn('groupage: ORDER_STOPS', e); }
  }

  // 2. GROUPAGE_LINES — ένα ανά στάση, δεμένο στην παραγγελία του
  for (const o of created.orders) {
    for (const s of o.group.stops) {
      const gl = await atCreate(TABLES.GL_LINES, {
        'Direction': common.direction,
        'Pallets': s.pallets || 0,
        'Loading Date': (common.loadDate||'').slice(0,10) || null,
        'Delivery Date': (s.date || common.delDate || '').slice(0,10) || null,
        'Status': 'Assigned',
        'Goods': common.goods || '',
        'Loading Location': [common.fromLocId],
        'Delivery Location': [s.locId],
        'Linked National Order': [o.id],
        // ΟΧΙ Groupage ID εδώ — derived στα GL (Ο1)
      });
      created.gls.push(gl.id);
    }
  }

  // 3. CONSOLIDATED_LOAD — το φορτηγό
  const allStops = groups.flatMap(g => g.stops);
  const totalPallets = allStops.reduce((s, x) => s + (x.pallets || 0), 0);
  const clFields = {
    'Name': `${common.fromLabel} — ${(common.loadDate||'').slice(0,10)}`,
    'Date': (common.loadDate||'').slice(0,10) || null,
    'Direction': common.direction === 'South→North' ? DIR.ANODOS : DIR.KATHODOS,
    'Status': 'Pending',
    'Total Pallets': totalPallets,
    'Goods': common.goods || '',
    'Loading DateTime': common.loadDate || null,
    'Delivery DateTime': common.delDate || null,
    'Is Groupage': true,
    'Groupage ID': grpId,
    'Loading Location 1': [common.fromLocId],
  };
  if (common.temp != null && common.temp !== '') clFields['Temperature C'] = parseFloat(common.temp);
  allStops.forEach((s, i) => {
    if (i >= 10) return;
    clFields[`Delivery Location ${i+1}`] = [s.locId];
    clFields[`Pallets ${i+1}`] = s.pallets || 0;
  });
  const cl = await atCreate(TABLES.CONS_LOADS, clFields);
  created.cl = cl.id;

  // 4. Δέσε τα GL στο CL — τώρα υπάρχει και από τις δύο πλευρές ίχνος
  for (const glId of created.gls) {
    try { await atPatch(TABLES.GL_LINES, glId, { 'Linked Consolidated Load': [cl.id] }); }
    catch(e) { console.warn('groupage: GL->CL link', e); }
  }

  // 5. NAT_LOAD — η γραμμή που θα δει ο dispatcher στο εβδομαδιαίο
  const nlFields = {
    'Name': clFields['Name'],
    'Direction': common.direction,
    'Source Type': 'Groupage',
    'Source Consolidated Load': [cl.id],
    'Client': groups.length === 1 ? (groups[0].clientLabel||'')
            : `${groups[0].clientLabel||''} +${groups.length-1}`,
    'Goods': common.goods || '',
    'Total Pallets': totalPallets,
    'Loading DateTime': common.loadDate || null,
    'Delivery DateTime': common.delDate || null,
    'Status': 'Pending',
    'Pickup Location 1': [common.fromLocId],
  };
  if (common.temp != null && common.temp !== '') nlFields['Temperature C'] = parseFloat(common.temp);
  allStops.forEach((s, i) => { if (i < 10) nlFields[`Delivery Location ${i+1}`] = [s.locId]; });
  const nl = await atCreate(TABLES.NAT_LOADS, nlFields);
  created.nl = nl.id;

  return created;
}

/* ── Φόρμα groupage ───────────────────────────────────────────────────
 * Μία γραμμή ανά ΣΤΑΣΗ, με στήλη πελάτη. Η ομαδοποίηση σε παραγγελίες
 * γίνεται στην υποβολή: όσοι πελάτες, τόσες παραγγελίες.
 *
 * Το εγκεκριμένο prototype έχει φωλιασμένα κουτιά ανά πελάτη. Εδώ η ίδια
 * πληροφορία μπαίνει σε επίπεδο πίνακα με στήλη «Πελάτης» — παράγει
 * ΑΚΡΙΒΩΣ τα ίδια δεδομένα με πολύ λιγότερο κώδικα, και η προεπισκόπηση
 * από κάτω δείχνει την ομαδοποίηση όσο γράφεις, ώστε να μη χαθεί η εικόνα
 * «ποιος πελάτης, πόσα σημεία».
 */
let _grpRows = [];

// openNatlGroupage αφαιρέθηκε: το groupage ζει ΜΕΣΑ στη φόρμα (Δ17).

let _grpSeq = 0;

/* Δ17 — επιλογή τύπου ΜΕΣΑ στη φόρμα, μόνο σε δημιουργία.
   Το κρυφό nf_Groupage μένει συγχρονισμένο: το διαβάζει το submitNatlOrder
   αυτούσιο, οπότε η απλή διαδρομή δεν αγγίχτηκε καθόλου.
   Το πλάτος αλλάζει ΜΟΝΟ στο groupage — η απλή φόρμα μένει 680px, ίδια
   ακριβώς με πριν. */
function _natlMode(m) {
  const cb = document.getElementById('nf_Groupage'); if (cb) cb.checked = !!m;
  const m0 = document.getElementById('nf_m0'), m1 = document.getElementById('nf_m1');
  if (!m0 || !m1) return;                      // edit mode: δεν υπάρχουν κάρτες
  m0.className = 'nf-mode' + (m ? '' : ' on');
  m1.className = 'nf-mode' + (m ? ' on' : '');
  const r0 = m0.querySelector('input'), r1 = m1.querySelector('input');
  if (r0) r0.checked = !m; if (r1) r1.checked = !!m;
  const simple = document.getElementById('nf_simple'), grp = document.getElementById('nf_grp');
  if (simple) simple.style.display = m ? 'none' : '';
  if (grp)    grp.style.display    = m ? '' : 'none';
  const modal = document.getElementById('modal');
  if (modal) modal.style.maxWidth = m ? '900px' : '680px';
  const btn = document.getElementById('natlBtnSubmit');
  if (btn) {
    btn.setAttribute('onclick', m ? '_grpSubmit()' : "submitNatlOrder('')");
    btn.textContent = m ? 'Καταχώρηση' : 'Submit';
  }
  if (m) { if (!_grpRows.length) _grpRows = [++_grpSeq]; _grpRender(); }
}


/* Μία ΚΑΡΤΑ ανά στάση, όχι στριμωγμένη γραμμή 7 στηλών.
   Πελάτης και τοποθεσία χρησιμοποιούν ΤΑ ΙΔΙΑ αναζητήσιμα πεδία με την
   κανονική φόρμα (_clientSelect / _locSelect): γράφεις 2 χαρακτήρες και
   ψάχνει. Οι τιμές ζουν στα κρυφά lv_<id> και διαβάζονται στην υποβολή. */
// ─── Απλό φορτίο: σημεία παράδοσης ──────────────────────────────────────
// Και τα κανονικά φορτία έχουν πολλαπλά σημεία με διαφορετικές παλέτες το
// καθένα (owner 12/08). Ένα συνολικό «Pallets» στην κορυφή δεν μπορούσε να το
// εκφράσει — ίδια ρίζα με το Α1, όπου το σύνολο γραφόταν αυτούσιο σε κάθε
// στάση. Το σύνολο υπολογίζεται πλέον από τα σημεία, δεν δηλώνεται.
let _simRows = [], _simSeq = 0;

function _simRowHTML(uid, pre) {
  pre = pre || {};
  return `<div class="grp-row" id="simr_${uid}"
      style="border:1px solid var(--border-mid);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#fff">
    <div style="display:grid;grid-template-columns:minmax(0,3fr) 62px 150px minmax(0,1.2fr) 34px;gap:12px;align-items:end">
      <div><label class="form-label">Τοποθεσία παράδοσης *</label>${_locSelect('nsl'+uid, pre.loc||'')}</div>
      <div><label class="form-label">Παλέτες</label>
        <input class="form-input" type="number" id="simp${uid}" min="0" max="99" step="1"
          value="${pre.pal||''}" style="text-align:right"
          oninput="if(this.value.length>2)this.value=this.value.slice(0,2)"></div>
      <div><label class="form-label">Ημερομηνία</label>
        <input class="form-input" type="date" id="simd${uid}" value="${pre.date||''}"></div>
      <div><label class="form-label">Σημείωση</label>
        <input class="form-input" id="simn${uid}" value="${escapeHtml(pre.note||'')}" placeholder="π.χ. παράδοση πρωί"></div>
      <button type="button" title="Αφαίρεση" onclick="_simDelRow(${uid})"
        style="height:38px;border:1px solid var(--border-mid);background:#fff;border-radius:8px;cursor:pointer;font-size:16px;color:var(--text-dim)">×</button>
    </div>
  </div>`;
}

// Προσθήκη με insertAdjacentHTML, ΟΧΙ ξαναζωγράφισμα όλων: το re-render θα
// έσβηνε ό,τι πληκτρολογείται στην αναζήτηση τοποθεσίας των άλλων καρτών.
function _simAddRow(pre) {
  if (_simRows.length >= 10) return;   // Α6: το schema έχει 10 θέσεις παράδοσης
  const uid = ++_simSeq; _simRows.push(uid);
  document.getElementById('sf_rows')?.insertAdjacentHTML('beforeend', _simRowHTML(uid, pre));
}

function _simDelRow(uid) {
  if (_simRows.length <= 1) return;    // πάντα μένει τουλάχιστον ένα σημείο
  _simRows = _simRows.filter(x => x !== uid);
  document.getElementById('simr_' + uid)?.remove();
}

// Διαβάζει τα σημεία με τη σειρά εμφάνισης· κάρτα χωρίς τοποθεσία αγνοείται.
function _simRead() {
  const g = id => document.getElementById(id)?.value || '';
  return _simRows.map(uid => ({
    locId: document.getElementById('lv_nsl' + uid)?.value || '',
    pal:   parseInt(g('simp' + uid), 10) || 0,
    date:  g('simd' + uid),
    note:  g('simn' + uid)
  })).filter(s => s.locId);
}

function _grpRowHTML(uid) {
  return `<div class="grp-row" id="grpr_${uid}"
      style="border:1px solid var(--border-mid);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#fff">
    <div style="display:grid;grid-template-columns:minmax(0,2fr) 130px 34px;gap:12px;align-items:end;margin-bottom:10px">
      <div><label class="form-label">Πελάτης *</label>${_clientSelect('grpc'+uid, '', '')}</div>
      <div><label class="form-label">Αξία € <span style="color:var(--text-dim);font-weight:400">(ανά πελάτη)</span></label>
        <input class="form-input" type="number" id="grpv${uid}" oninput="_grpPreview()"></div>
      <button type="button" title="Αφαίρεση" onclick="_grpDelRow(${uid})"
        style="height:38px;border:none;background:none;color:var(--text-dim);font-size:17px;cursor:pointer">×</button>
    </div>
    <div style="display:grid;grid-template-columns:minmax(0,3fr) 72px 150px minmax(0,1.2fr);gap:12px;align-items:end">
      <div><label class="form-label">Τοποθεσία παράδοσης *</label>${_locSelect('grpl'+uid, '')}</div>
      <div><label class="form-label">Παλέτες</label>
        <input class="form-input" type="number" id="grpp${uid}" min="0" max="99" step="1"
          style="text-align:right"
          oninput="if(this.value.length>2)this.value=this.value.slice(0,2);_grpPreview()"></div>
      <div><label class="form-label">Ημερομηνία</label>
        <input class="form-input" type="date" id="grpd${uid}"></div>
      <div><label class="form-label">Σημείωση</label>
        <input class="form-input" id="grpn${uid}" placeholder="π.χ. παράδοση πρωί"></div>
    </div>
  </div>`;
}

// Προσθήκη/αφαίρεση ΧΩΡΙΣ πλήρη επανασχεδίαση: ένα re-render θα έσβηνε ό,τι
// έχει ήδη πληκτρολογηθεί στα πεδία αναζήτησης των άλλων γραμμών.
function _grpAddRow() {
  const c = document.getElementById('gf_rows'); if (!c) return;
  const uid = ++_grpSeq; _grpRows.push(uid);
  c.insertAdjacentHTML('beforeend', _grpRowHTML(uid));
  _grpPreview();
}
function _grpDelRow(uid) {
  if (_grpRows.length <= 1) return;
  const el = document.getElementById('grpr_'+uid); if (el) el.remove();
  _grpRows = _grpRows.filter(x => x !== uid);
  _grpPreview();
}
function _grpSet() { _grpPreview(); }   // συμβατότητα με παλιά onchange

function _grpRender() {
  const c = document.getElementById('gf_rows'); if (!c) return;
  if (!_grpRows.length || typeof _grpRows[0] !== 'number') _grpRows = [++_grpSeq];
  c.innerHTML = _grpRows.map(_grpRowHTML).join('');
  _grpPreview();
}

// Διαβάζει ΑΠΟ ΤΟ DOM — τα αναζητήσιμα πεδία γράφουν στα κρυφά lv_<id>,
// όχι σε δικό μας μοντέλο.
function _grpGroups() {
  const clients = (getRefClients?.()||[]);
  const by = {}; const order = [];
  _grpRows.forEach(uid => {
    const g = id => document.getElementById(id)?.value?.trim() || '';
    const cid = g('lv_grpc'+uid), lid = g('lv_grpl'+uid);
    if (!cid || !lid) return;
    if (!by[cid]) {
      by[cid] = { clientId:cid,
        clientLabel: clients.find(c=>c.id===cid)?.fields?.['Company Name']
                  || document.getElementById('ls_grpc'+uid)?.value || '',
        price:'', stops:[] };
      order.push(cid);
    }
    const pr = g('grpv'+uid); if (pr && !by[cid].price) by[cid].price = pr;
    by[cid].stops.push({ locId:lid, pallets:parseFloat(g('grpp'+uid))||0,
                         date:g('grpd'+uid), note:g('grpn'+uid) });
  });
  return order.map(k => by[k]);
}

// Ενημερώνει ΜΟΝΟ την προεπισκόπηση — ποτέ τις γραμμές.
function _grpPreview() {
  const box = document.getElementById('gf_preview'); if (!box) return;
  const g = _grpGroups();
  const tot = g.reduce((s,x)=>s+x.stops.reduce((a,y)=>a+(y.pallets||0),0),0);
  const cls = tot>33 ? 'color:var(--danger)' : (tot>=30 ? 'color:#B45309' : 'color:var(--text-mid)');
  box.innerHTML = !g.length ? '' : `
    <div style="border:1px dashed rgba(2,123,189,.35);background:var(--accent-light);border-radius:8px;padding:12px 14px">
      <div style="font-size:11.5px;font-weight:700;color: var(--accent-text);margin-bottom:7px">
        ${g.length} ${g.length===1?'παραγγελία':'παραγγελίες'} · 1 φορτίο · <span style="${cls}">${tot}/33 παλέτες</span></div>
      ${g.map(x=>`<div style="font-size:11.5px;color:var(--text-mid)"><b style="color:var(--text)">${escapeHtml(x.clientLabel)}</b> · ${x.stops.length} σημεία · ${x.stops.reduce((s,y)=>s+(y.pallets||0),0)}p${x.price?' · '+x.price+' €':''}</div>`).join('')}
      ${tot>33?'<div style="margin-top:7px;font-size:11px;color:var(--danger);font-weight:600">Ξεπερνά τις 33 παλέτες.</div>':''}
    </div>`;
  const btn = document.getElementById('natlBtnSubmit');
  if (btn && btn.getAttribute('onclick')==='_grpSubmit()')
    btn.textContent = g.length ? `Καταχώρηση ${g.length} ${g.length===1?'παραγγελίας':'παραγγελιών'}` : 'Καταχώρηση';
}

async function _grpSubmit() {
  const v = id => document.getElementById(id)?.value?.trim() || '';
  const common = {
    direction: v('nf_Direction'), fromLocId: v('lv_npickup'),
    fromLabel: (getRefLocations()||[]).find(l => l.id === v('lv_npickup'))?.fields?.Name || '',
    loadDate: v('nf_LoadDate'), delDate: '',
    goods: v('nf_Goods'), temp: v('nf_Temp'),
  };
  const groups = _grpGroups();
  // Το πεδίο «Delivery Date» της κορυφής έφυγε μαζί με το «Pallets» (owner
  // 12/08): η ημερομηνία παράδοσης του φορτίου είναι η πρώτη δηλωμένη των
  // σημείων. Εφεδρεία η φόρτωση, ώστε CL/NL να μη μένουν χωρίς ημερομηνία.
  common.delDate = groups.flatMap(g => g.stops).map(s => s.date).find(Boolean) || common.loadDate;
  if (!common.fromLocId || !common.loadDate) { toast('Σημείο φόρτωσης και ημερομηνία φόρτωσης είναι υποχρεωτικά','warn'); return; }
  if (!groups.length) { toast('Χρειάζεται τουλάχιστον μία γραμμή με πελάτη και τοποθεσία','warn'); return; }
  const nStops = groups.reduce((s,g)=>s+g.stops.length,0);
  if (nStops > 10) { toast('Όριο 10 σημείων παράδοσης ανά φορτίο','warn'); return; }

  const btn = document.getElementById('natlBtnSubmit');
  if (btn) { btn.disabled = true; btn.textContent = 'Αποθήκευση…'; }
  try {
    const res = await _natlWriteGroupageChain(common, groups);
    [TABLES.NAT_ORDERS, TABLES.GL_LINES, TABLES.CONS_LOADS, TABLES.NAT_LOADS]
      .forEach(t => { try { invalidateCache(t); } catch(_){} });
    closeModal();
    toast(`${res.orders.length} παραγγελίες · ${res.gls.length} γραμμές · 1 φορτίο`, 'success');
    if (typeof renderOrdersNatl === 'function') renderOrdersNatl();
  } catch (e) {
    console.error('_grpSubmit:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Καταχώρηση'; }
    // Δεν κρύβουμε το μισοτελειωμένο: ο owner πρέπει να ξέρει ότι μπορεί να
    // έμειναν εγγραφές πίσω, ώστε να τρέξει τον έλεγχο ορφανών.
    toast('Η καταχώρηση απέτυχε — έλεγξε για ημιτελές φορτίο στα CONSOLIDATED LOADS', 'error');
  }
}

// ─── Modal ──────────────────────────────────────
function openNatlCreate() { _openNatlModal(null, {}); }
function openNatlEdit(recId) {
  const rec = NATL_ORDERS.data.find(r=>r.id===recId);
  if(rec) _openNatlModal(recId, rec.fields);
}

async function _openNatlModal(recId, f) {
  const isEdit = !!recId;
  const clientId  = Array.isArray(f['Client'])           ? f['Client'][0]           : '';
  const pickupId  = (f['Pickup Location 1']||[])[0]||'';
  const delivId   = (f['Delivery Location 1']||f['Delivery Location']||[])[0]||'';
  // Resolve single client name for edit form (batch if not cached)
  if (clientId && !_fhClientsMap[clientId]) await _batchResolveClients([clientId]);
  const clientLabel = clientId ? (_fhClientsMap[clientId] || '') : '';
  // Value/label ΧΩΡΙΣΤΑ (παγίδα Φ1): το value είναι ΤΙΜΗ ΒΑΣΗΣ και δεν μεταφράζεται ποτέ.
  const opt = (arr, cur) => arr.map(o=>{const v=Array.isArray(o)?o[0]:o, l=Array.isArray(o)?o[1]:o; return `<option value="${v}" ${f[cur]===v?'selected':''}>${l}</option>`;}).join('');

  const body = `
    <div class="form-grid">
      <div class="form-field">
        <label class="form-label">Direction *</label>
        <select class="form-select" id="nf_Direction"><option value="">— Select —</option>
          ${opt([['North→South','ΚΑΘΟΔΟΣ (Βορράς→Νότος)'],['South→North','ΑΝΟΔΟΣ (Νότος→Βορράς)']],'Direction')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Type</label>
        <select class="form-select" id="nf_Type"><option value="">— Select —</option>
          ${opt([['Independent','Ανεξάρτητη'],['Veroia Switch','Veroia Switch']],'Type')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Client *</label>
        ${_clientSelect('nclient', clientId, clientLabel)}
      </div>
      <div class="form-field">
        <label class="form-label">Price (€)</label>
        <input class="form-input" type="number" id="nf_Price" value="${f['Price']||''}">
      </div>
      <div class="form-field">
        <label class="form-label">Goods</label>
        <input class="form-input" type="text" id="nf_Goods" value="${escapeHtml(f['Goods']||'')}" placeholder="e.g. Fresh Produce">
      </div>
      <div class="form-field">
        <label class="form-label">Temperature °C</label>
        <input class="form-input" type="number" id="nf_Temp" value="${f['Temperature °C']!=null?f['Temperature °C']:''}">
      </div>
      <div class="form-field" style="padding-top:24px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="nf_PalletExch" ${f['Pallet Exchange']?'checked':''} style="width:15px;height:15px">
          Pallet Exchange</label>
      </div>
    </div>
    <input type="checkbox" id="nf_Groupage" ${f['National Groupage']?'checked':''} style="display:none">
    ${isEdit ? '' : `
    <div style="padding-top:16px;border-top:1px solid var(--border);margin-top:16px">
      <div class="detail-section-title">Order Type</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <label class="nf-mode on" id="nf_m0" onclick="_natlMode(0)">
          <input type="radio" name="nfmode" checked>
          <span><b>Κανονικό φορτίο</b><em>Ένας πελάτης — 1 παραγγελία</em></span></label>
        <label class="nf-mode" id="nf_m1" onclick="_natlMode(1)">
          <input type="radio" name="nfmode">
          <span><b>Groupage</b><em>Πολλοί πελάτες, ένα φορτηγό — 1 παραγγελία ανά πελάτη</em></span></label>
      </div>
    </div>`}

    <div id="nf_grp" style="display:none;padding-top:16px;border-top:1px solid var(--border);margin-top:16px">
      <div class="detail-section-title">Παραδόσεις — μία κάρτα ανά σημείο</div>
      <div id="gf_rows"></div>
      <button type="button" class="btn btn-ghost" style="font-size:12px;padding:5px 14px;margin-top:8px"
        onclick="_grpAddRow()">+ Προσθήκη γραμμής</button>
      <div id="gf_preview" style="margin-top:14px"></div>
    </div>
    <div id="nf_simple" style="padding-top:16px;border-top:1px solid var(--border)">
      <div class="detail-section-title" style="margin-bottom:12px">Φόρτωση</div>
      <div class="form-grid">
        <div class="form-field">
          <label class="form-label">Pickup Location *</label>
          ${_locSelect('npickup', pickupId)}
        </div>
        <div class="form-field">
          <label class="form-label">Loading Date *</label>
          <input class="form-input" type="date" id="nf_LoadDate"
            value="${f['Loading DateTime']?toLocalDate(f['Loading DateTime']):''}">
        </div>
      </div>
      <div class="detail-section-title" style="margin:16px 0 12px">Παραδόσεις — μία κάρτα ανά σημείο</div>
      <div id="sf_rows"></div>
      <button type="button" class="btn btn-ghost" style="font-size:12px;padding:5px 14px;margin-top:8px"
        onclick="_simAddRow()">+ Προσθήκη σημείου</button>
    </div>

    <div style="margin-top:16px">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="nf_Notes" rows="2">${escapeHtml(f['Notes']||'')}</textarea>
    </div>`;

  const footer = `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-success" id="natlBtnSubmit" onclick="submitNatlOrder('${recId||''}')">
      ${isEdit?'Save Changes':'Submit'}
    </button>`;

  document.getElementById('modal').style.maxWidth = '680px';
  openModal(isEdit ? 'Edit National Order' : 'New National Order', body, footer);
  if (!isEdit) { _grpRows = []; _natlMode(0); }

  // Προσυμπλήρωση των σημείων παράδοσης από τις 10 θέσεις του schema.
  _simRows = []; _simSeq = 0;
  const _pre = [];
  for (let i = 1; i <= 10; i++) {
    const lid = (f[`Delivery Location ${i}`] || [])[0];
    if (lid) _pre.push({ loc: lid });
  }
  if (!_pre.length && delivId) _pre.push({ loc: delivId });   // παλιό μονό πεδίο
  if (_pre.length) {
    _pre[0].date = f['Delivery DateTime'] ? toLocalDate(f['Delivery DateTime']) : '';
    // Οι παλέτες ανά στάση ζουν στα ORDER_STOPS, που δεν φορτώνονται στη φόρμα.
    // Με ΕΝΑ σημείο το σύνολο ΕΙΝΑΙ η στάση, οπότε προσυμπληρώνεται με ασφάλεια·
    // με πολλά θα ήταν εικασία, άρα μένουν κενά και το σύνολο δεν πειράζεται.
    if (_pre.length === 1 && f['Pallets']) _pre[0].pal = f['Pallets'];
  }
  (_pre.length ? _pre : [{}]).forEach(p => _simAddRow(p));
}

// ─── Submit ─────────────────────────────────────
async function submitNatlOrder(recId) {
  const btn = document.getElementById('natlBtnSubmit');
  if(btn) { btn.textContent='Saving...'; btn.disabled=true; }

  try {
    const fields = {};
    const sv = id => document.getElementById(id)?.value?.trim()||'';
    const nv = id => { const v=document.getElementById(id)?.value; return v!==''&&v!=null?parseFloat(v):null; };
    const ck = id => !!document.getElementById(id)?.checked;

    if(sv('nf_Direction')) fields['Direction']       = sv('nf_Direction');
    if(sv('nf_Type'))      fields['Type']            = sv('nf_Type');
    if(sv('nf_Goods'))     fields['Goods']           = sv('nf_Goods');
    if(sv('nf_Notes'))     fields['Notes']           = sv('nf_Notes');
    if(sv('nf_LoadDate'))  fields['Loading DateTime']  = sv('nf_LoadDate');

    // Τα σημεία παράδοσης είναι πλέον κάρτες: η ημερομηνία και το σύνολο
    // παλετών της παραγγελίας προκύπτουν ΑΠΟ αυτά, δεν δηλώνονται χωριστά.
    const _stops = _simRead();
    const _delDate = (_stops.find(s => s.date) || {}).date || '';
    if (_delDate) fields['Delivery DateTime'] = _delDate;

    const price  = nv('nf_Price');   if(price!=null)  fields['Price']          = price;
    const temp   = nv('nf_Temp');    if(temp!=null)    fields['Temperature °C'] = temp;

    // Γράφεται μόνο αν όντως δηλώθηκαν παλέτες. Σε επεξεργασία παραγγελίας με
    // πολλά σημεία οι κάρτες ανοίγουν κενές (τα ανά-στάση νούμερα ζουν στα
    // ORDER_STOPS), οπότε ένα άθροισμα 0 θα έσβηνε το υπάρχον σύνολο.
    const pallets = _stops.reduce((a, s) => a + s.pal, 0);
    if (pallets > 0) fields['Pallets'] = pallets;

    fields['Pallet Exchange']  = ck('nf_PalletExch');
    fields['National Groupage']= ck('nf_Groupage');

    const clientId  = document.getElementById('lv_nclient')?.value;
    const pickupId  = document.getElementById('lv_npickup')?.value;
    const delivId   = _stops.length ? _stops[0].locId : '';

    if(clientId)  fields['Client']              = [clientId];
    if(pickupId)  fields['Pickup Location 1']  = [pickupId];
    // Οι θέσεις που περίσσεψαν καθαρίζονται ρητά με κενό πίνακα — ο Worker το
    // μεταφράζει σε NULL (index.js:1845). Χωρίς αυτό, αφαίρεση σημείου σε
    // επεξεργασία θα άφηνε το παλιό σημείο να ζει στη βάση.
    for (let i = 1; i <= 10; i++) {
      fields[`Delivery Location ${i}`] = _stops[i-1] ? [_stops[i-1].locId] : [];
    }

    // Validation
    const _vErrors = [];
    if(!fields['Direction'])          _vErrors.push('Direction is required');
    if(!clientId)                     _vErrors.push('Client is required');
    if(!pickupId)                     _vErrors.push('Pickup Location is required');
    if(!delivId)                      _vErrors.push('Χρειάζεται τουλάχιστον ένα σημείο παράδοσης');
    if(!fields['Loading DateTime'])   _vErrors.push('Loading Date is required');
    if(!fields['Delivery DateTime'])  _vErrors.push('Χρειάζεται ημερομηνία σε ένα τουλάχιστον σημείο');

    // Date cross-validation
    if (fields['Loading DateTime'] && fields['Delivery DateTime']) {
      if (new Date(fields['Delivery DateTime']) < new Date(fields['Loading DateTime'])) {
        _vErrors.push('Delivery date cannot be before loading date');
      }
    }
    // Crash-test fix: reject negative pallet counts (previously silently saved)
    if (fields['Total Pallets'] != null && fields['Total Pallets'] < 0) {
      _vErrors.push('Pallet count cannot be negative');
    }
    if (fields['Pallets'] != null && fields['Pallets'] < 0) {
      _vErrors.push('Pallet count cannot be negative');
    }

    if (_vErrors.length) {
      showErrorToast(_vErrors.join(' | '), 'warn', 8000);
      throw new Error('v');
    }

    let savedNatlId = recId;
    if(recId) {
      const patchRes = await atSafePatch(TABLES.NAT_ORDERS, recId, fields);
      if (patchRes?.conflict) { toast('Record modified by another user — reload and try again','warn'); return; }
    } else {
      // ── Duplicate check by Reference (strong signal — same transport doc) ──
      if (fields['Reference'] && typeof findDuplicateOrders === 'function') {
        const refDupes = await findDuplicateOrders(fields['Reference'], TABLES.NAT_ORDERS);
        if (refDupes.length) {
          const list = refDupes.map(d => {
            const f = d.fields;
            return `• ${f['Name'] || d.id.slice(-6)} — ${(f['Loading DateTime']||'').substring(0,10) || 'no date'}`;
          }).join('\n');
          const ok = await confirmAction(
            `Πιθανό duplicate\n\n` +
            `Υπάρχουν ${refDupes.length} National Orders με Reference "${fields['Reference']}":\n\n` +
            `${list}\n\n` +
            `Συνέχεια αποθήκευσης ως νέα παραγγελία;`,
            { title: 'Πιθανό duplicate', confirmLabel: 'Αποθήκευση ως νέα' }
          );
          if (!ok) {
            if (btn) { btn.textContent = 'Submit'; btn.disabled = false; }
            throw new Error('v');
          }
        }
      }

      // ── Soft duplicate check: same client + same loading date ──
      // safeFetch, not `.catch(() => [])`: this is a DUPLICATE GUARD, so a
      // swallowed error makes it answer "no duplicates" to every check while
      // looking like it ran. That is exactly the defect fixed in PR #28 for the
      // international guard (`findDuplicateOrders`), which sat silently disabled
      // from the C2 cutover until 2026-07-29. Same shape, different module.
      //
      // Verified live 2026-08-02: this filter returns HTTP 200 against the
      // facade and FIND+ARRAYJOIN matches linked record ids correctly on the
      // new backend. (Learning #7's "FIND+ARRAYJOIN does not work" described
      // AIRTABLE, which the facade replaced; it does not apply post-cutover.)
      // So the guard works today, and the fail-open is latent risk, not a live
      // defect. NAT_ORDERS holds 0 records, so it has never been exercised.
      if (clientId && fields['Loading DateTime']) {
        const dupFilter = `AND(FIND("${clientId}",ARRAYJOIN({Client},","))>0,IS_SAME({Loading DateTime},'${fields['Loading DateTime']}','day'))`;
        const dups = await safeFetch(
          () => atGetAll(TABLES.NAT_ORDERS, { filterByFormula: dupFilter, fields:['Name'], maxRecords:1 }, false),
          'national order: duplicate guard'
        );
        // A guard that could not run must not silently pass. Tell the user the
        // check did not happen and let them decide, rather than implying a
        // clean result. Deliberately does NOT block the save: this guard is
        // "soft" by design (it only warns on a real hit), and hard-failing a
        // save because a check errored would be a worse trade for a dispatcher
        // mid-entry.
        if (didFail(dups)) {
          if (!(await confirmAction('Ο έλεγχος για διπλότυπα δεν μπόρεσε να εκτελεστεί. Συνέχεια χωρίς έλεγχο;', { confirmLabel: 'Συνέχεια' }))) {
            if (btn) { btn.textContent = 'Submit'; btn.disabled = false; }
            throw new Error('v');
          }
        } else if (dups.length) {
          if (!(await confirmAction('Υπάρχει ήδη order με ίδιο client + ημερομηνία. Δημιουργία duplicate;', { confirmLabel: 'Δημιουργία' }))) {
            throw new Error('v');
          }
        }
      }
      const created = await atCreate(TABLES.NAT_ORDERS, fields);
      savedNatlId = created.id;
    }

    // ── Active learning: persist scan correction (Phase 3) ──
    try {
      if (window._natlScanResult && typeof scanSaveCorrection === 'function') {
        const r = window._natlScanResult;
        const corrected = {
          name: fields['Name'] || '',
          client_id: (fields['Client']||[])[0] || null,
          direction: fields['Direction'] || '',
          type: fields['Type'] || '',
          pallets: fields['Pallets'] ?? null,
          loading_date:  fields['Loading DateTime']  || '',
          delivery_date: fields['Delivery DateTime'] || '',
          pickup_locations:   (r.matched?.pickups || []).map(s => ({ location_name: s._locLabel || s.location_name, location_id: s._locId || null, city: s.city, pallets: s.pallets })),
          delivery_locations: (r.matched?.deliveries || []).map(s => ({ location_name: s._locLabel || s.location_name, location_id: s._locId || null, city: s.city })),
        };
        scanSaveCorrection(
          'DELIVERY_NOTE',
          window._natlScanFile?.name || '',
          r.data,
          corrected,
          (fields['Client']||[])[0] || null
        );
        delete window._natlScanResult;
      }
    } catch (e) { console.warn('[natl_scan] save correction skipped:', e.message); }

    // ── Save ORDER_STOPS for national order ──
    try {
      const _natStops = [];
      const _sRef = fields['Reference'] || null, _sGoods = fields['Goods'] || null, _sTemp = fields['Temperature °C'] ?? null;
      if (pickupId) _natStops.push({ stopNumber: 1, stopType: 'Loading', locationId: pickupId, pallets: pallets || 0, dateTime: fields['Loading DateTime'] || null, clientId: clientId || null, ref: _sRef, goods: _sGoods, temp: _sTemp });
      // Α1: κάθε στάση παίρνει ΤΙΣ ΔΙΚΕΣ ΤΗΣ παλέτες. Πριν γραφόταν το σύνολο
      // αυτούσιο σε κάθε στάση, που έδειχνε π.χ. 20/20/20 αντί για 8/6/6.
      _stops.forEach((s, i) => _natStops.push({ stopNumber: i + 1, stopType: 'Unloading',
        locationId: s.locId, pallets: s.pal || 0,
        dateTime: s.date || fields['Delivery DateTime'] || null,
        clientId: clientId || null, ref: _sRef, goods: _sGoods, temp: _sTemp,
        notes: s.note || null }));
      if (_natStops.length) await stopsSave(savedNatlId, _natStops, F.STOP_PARENT_NAT);
      if (typeof plOnOrderSaved === 'function') await plOnOrderSaved(savedNatlId, 'natl');
    } catch(e) { console.warn('NAT ORDER_STOPS save:', e); }

    // ── Sync GROUPAGE LINES ──────────────────────────────────
    // Sync GL: create/update if Groupage ON, delete unassigned if OFF
  if (savedNatlId && fields['National Groupage']) {
      try {
        await _syncGroupageLinesFromNO(savedNatlId, fields);
      } catch(e) { console.warn('GL sync error:', e); }
    } else if (savedNatlId && !fields['National Groupage']) {
      // National Groupage turned OFF → DELETE GL + CL + CL-linked NL
      try {
        const staleGL = await atGetAll(TABLES.GL_LINES, {
          filterByFormula: `FIND("${savedNatlId}",ARRAYJOIN({Linked National Order},","))>0`,
          fields: ['Status']
        }, false);
        // Delete CONS_LOADS linked to these GL lines
        for (const gl of staleGL) {
          try {
            const cls = await atGetAll(TABLES.CONS_LOADS, {
              filterByFormula: `FIND("${gl.id}",ARRAYJOIN({Groupage Lines},","))>0`,
            }, false);
            for (const cl of cls) {
              // Delete NL records from this CL
              try {
                const nlsFromCL = await atGetAll(TABLES.NAT_LOADS, {
                  filterByFormula: `{Source Record}="${cl.id}"`,
                  fields: ['Name']
                }, false);
                for (const nl of nlsFromCL) await atDelete(TABLES.NAT_LOADS, nl.id);
              } catch(e) { console.warn('NL-CL cleanup:', e); }
              await atDelete(TABLES.CONS_LOADS, cl.id);
            }
          } catch(e) { console.warn('CL cleanup:', e); }
        }
        // FIXME(audit): GL_LINES must never be hard-deleted — only set Status='Unassigned'.
        // Hard-delete breaks the ORDERS→GL_LINES→CONS_LOADS history chain permanently.
        // See .reference/ANALYSIS_WEAK_SPOTS_OPPORTUNITIES.md and orders_natl.js findings.
        for (const r of staleGL) {
          try { await atSafePatch(TABLES.GL_LINES, r.id, { Status: 'Unassigned' }); }
          catch(e) { console.warn('GL unassign:', e); }
        }
        if (staleGL.length) _tmsLog(`Unassigned ${staleGL.length} stale GL lines`);
        invalidateCache(TABLES.GL_LINES);
        invalidateCache(TABLES.NAT_LOADS);
      } catch(e) { console.warn('GL cleanup error:', e); }
    }
    // ─────────────────────────────────────────────────────────

    // ── Sync NATIONAL LOADS ─────────────────────────────────
    try {
      if (!fields['National Groupage']) {
        // Non-groupage → create/update NL record
        const fullRec = await atGetOne(TABLES.NAT_ORDERS, savedNatlId);
        if (fullRec.fields) await _syncNationalLoad(savedNatlId, fullRec.fields, false);
      } else {
        // Groupage ON → remove NL (CL save will create its own NL)
        await _syncNationalLoad(savedNatlId, {}, true);
      }
    } catch(e) { console.warn('NL sync error:', e); }
    // ─────────────────────────────────────────────────────────

    // Central sync — RAMP trigger + PL orphan cleanup + PA sync + cache invalidation
    if (savedNatlId && typeof syncOrderDownstream === 'function') {
      syncOrderDownstream(savedNatlId, { source: 'natl', skipVS: true, skipGRP: true })
        .catch(e => console.warn('[natl save sync]', e));
    }

    invalidateCache(TABLES.NAT_ORDERS);
    document.getElementById('modal').style.maxWidth = '';
    closeModal();
    toast(recId ? 'Order updated ✓' : 'Order created ✓');
    await renderOrdersNatl();

  } catch(e) {
    // 'v' is the validation sentinel thrown after a blocking validation message;
    // that path already told the user, so skip to avoid double-reporting.
    if(e.message!=='v') reportError('Σφάλμα αποθήκευσης παραγγελίας', e);
    if(btn) { btn.textContent=recId?'Save Changes':'Submit'; btn.disabled=false; }
  }
}

// ─── Inline toggle ───────────────────────────────
async function toggleNatlInvoiced(recId, current) {
  const newVal = !current;
  try {
    const res = await atSafePatch(TABLES.NAT_ORDERS, recId, { 'Invoiced': newVal });
    if (res?.conflict) { toast('Record modified by another user — refresh','warn'); return; }
    const rec = NATL_ORDERS.data.find(r => r.id === recId);
    if(rec) rec.fields['Invoiced'] = newVal;
    // Central sync
    if (typeof syncOrderDownstream === 'function') {
      syncOrderDownstream(recId, { source: 'natl', changedFields: ['Invoiced'], skipVS: true, skipGRP: true, skipRamp: true, skipPA: true })
        .catch(e => console.warn('[natl invoice sync]', e));
    }
    _applyNatlFilters();
    toast(newVal ? 'Marked as Invoiced' : 'Invoice removed');
  } catch(e) { reportError('Σφάλμα ενημέρωσης τιμολόγησης', e); }
}

// ═══════════════════════════════════════════════
// _syncGroupageLinesFromNO
// For INDEPENDENT National Orders (no parent ORDERS)
// Creates/updates GL lines from NO Pickup Locations
// ═══════════════════════════════════════════════
const _syncingNOs = new Set();
async function _syncGroupageLinesFromNO(noId, noFields) {
  if (_syncingNOs.has(noId)) return;
  _syncingNOs.add(noId);
  try {
  const _lid = v => (v&&typeof v==='object'&&v.id)?v.id:(typeof v==='string'?v:null);
  const dir  = noFields['Direction']||'';
  const ref  = noFields['Reference']||'';
  const goods= noFields['Goods']||'';
  const temp = noFields['Temperature °C']??null;
  const loadDt = (noFields['Loading DateTime']||'').slice(0,10)||null;
  const delDt  = (noFields['Delivery DateTime']||'').slice(0,10)||null;
  const noDir = dir === 'South→North' ? 'South→North' : 'North→South';

  // Get all pickup locations from Pickup Location 1-10
  const pickupLocs = [];
  for (let i=1; i<=10; i++) {
    const arr = noFields[`Pickup Location ${i}`];
    if (!arr?.length) { if(i>1) break; continue; }
    pickupLocs.push(_lid(arr[0]));
  }

  if (!pickupLocs.length) return;

  // Per-stop pallets from Loading Pallets 1-10 fields, fallback to total/count.
  // Bugfix: Math.floor(totalPal / locs.length) dropped the remainder (e.g. 100÷3 = 33+33+33 = 99).
  // We now distribute the remainder to the first N stops so the sum always equals totalPal.
  const totalPal = noFields['Pallets'] || 0;
  const palPerLoc = {};

  // ── Φ3α (SPEC ανοιχτό #3): οι ΚΑΤΑΓΕΓΡΑΜΜΕΝΕΣ παλέτες προηγούνται ──────
  //
  // Ο μερισμός από κάτω μοιράζει το σύνολο ισόποσα στα σημεία. Είναι εικασία:
  // «31 παλέτες σε 3 σημεία» γίνεται 11+10+10 ακόμη κι όταν η αλήθεια είναι
  // 20+8+3. Το αποτέλεσμα φεύγει στα GROUPAGE LINES, από εκεί στο Pick Ups,
  // και ο άνθρωπος που φορτώνει βλέπει λάθος νούμερα.
  //
  // Η φόρμα γράφει ήδη τις πραγματικές παλέτες κάθε στάσης στα ORDER_STOPS.
  // Αυτές είναι η αλήθεια — τις διαβάζουμε πρώτα.
  const _stopPal = {};
  try {
    const _noStops = await stopsLoad(noId, F.STOP_PARENT_NAT);
    (_noStops || []).forEach(s => {
      if (s.fields?.[F.STOP_TYPE] !== 'Loading') return;
      const lid = _lid((s.fields?.[F.STOP_LOCATION]||[])[0]) || _lid(s.fields?.[F.STOP_LOCATION]);
      const p = s.fields?.[F.STOP_PALLETS];
      if (lid && p != null) _stopPal[lid] = p;
    });
  } catch(e) { console.warn('GL: ανάγνωση ORDER_STOPS απέτυχε, πέφτω σε μερισμό', e); }

  // Ο μερισμός μένει ΜΟΝΟ ως έσχατο δίχτυ, για παραγγελίες που γράφτηκαν
  // πριν καταγράφονται παλέτες ανά στάση. Δεν τον αφαιρώ: το GL.Pallets
  // τροφοδοτεί τον σχεδιαστή του Pick Ups, και ένα κενό εκεί θα του έσπαγε
  // τη λογική — σε αντίθεση με τα ORDER_STOPS, όπου το κενό είναι ορατό.
  const base = pickupLocs.length > 0 ? Math.floor(totalPal / pickupLocs.length) : totalPal;
  const remainder = pickupLocs.length > 0 ? (totalPal - base * pickupLocs.length) : 0;
  pickupLocs.forEach((locId, i) => {
    if (_stopPal[locId] != null) { palPerLoc[locId] = _stopPal[locId]; return; }
    const explicit = noFields[`Loading Pallets ${i+1}`] || noFields['Loading Pallets'] || 0;
    palPerLoc[locId] = explicit || (base + (i < remainder ? 1 : 0));
  });

  const delivArr = noFields['Delivery Location 1'] || noFields['Delivery Location'] || [];
  const delivId  = delivArr.length ? _lid(delivArr[0]) : null;

  // Get existing GL for this NO
  const existing = await atGetAll(TABLES.GL_LINES, {
    filterByFormula: `FIND("${noId}",ARRAYJOIN({Linked National Order},","))>0`,
    fields: ['Loading Location','Status','Pallets']
  }, false);

  const existMap = {};
  existing.forEach(r => {
    const loc = (r.fields['Loading Location']||[])[0];
    if (loc) existMap[loc] = r;
  });

  const toCreate = [];
  const toUpdate = [];

  pickupLocs.forEach((locId, i) => {
    if (!locId) return;
    const pal = palPerLoc[locId] || totalPal;
    const fields = {
      'Reference':             ref,
      'Pallets':               pal,
      'Direction':             noDir,
      'Status':                'Unassigned',
      'Goods':                 goods,
      'Loading Location':      [locId],
      'Linked National Order': [noId],
    };
    if (loadDt) fields['Loading Date']  = loadDt;
    if (delDt)  fields['Delivery Date'] = delDt;
    if (temp !== null) fields['Temperature C'] = temp;
    if (delivId) fields['Delivery Location'] = [delivId];

    if (existMap[locId]) {
      if (existMap[locId].fields.Status !== 'Assigned') {
        toUpdate.push({ id: existMap[locId].id, fields });
      }
      delete existMap[locId];
    } else {
      toCreate.push(fields);
    }
  });

  // FIXME(audit): GL_LINES must never be hard-deleted — only set Status='Unassigned'.
  // See .reference/ANALYSIS_WEAK_SPOTS_OPPORTUNITIES.md and orders_natl.js findings.
  for (const [locId, rec] of Object.entries(existMap)) {
    if (rec.fields.Status !== 'Assigned') {
      try { await atSafePatch(TABLES.GL_LINES, rec.id, { Status: 'Unassigned' }); }
      catch(e) { console.warn('GL stale unassign:', e); }
    }
  }

  // Batch create
  if (toCreate.length) {
    await atCreateBatch(TABLES.GL_LINES, toCreate.map(f => ({ fields: f })));
  }

  // Batch update
  if (toUpdate.length) {
    await atPatchBatch(TABLES.GL_LINES, toUpdate);
  }

  _tmsLog(`_syncGroupageLinesFromNO: ${toCreate.length} created, ${toUpdate.length} updated for NO ${noId}`);
  } finally {
    _syncingNOs.delete(noId);
  }
}

// ═══════════════════════════════════════════════
// _syncNationalLoad — Sync non-groupage NO → NATIONAL LOADS
// Creates/updates a unified record for Weekly National consumption
// ═══════════════════════════════════════════════
const _syncingNLs = new Set();
async function _syncNationalLoad(noId, noFields, isDelete) {
  if (!TABLES.NAT_LOADS) return;
  if (_syncingNLs.has(noId)) return;
  _syncingNLs.add(noId);
  try {

  // Find existing NL record for this NO
  const existing = await atGetAll(TABLES.NAT_LOADS, {
    filterByFormula: `{Source Record}="${noId}"`,
    fields: ['Name']
  }, false);

  if (isDelete) {
    // Delete NL record(s) when NO is deleted or groupage turned ON
    for (const r of existing) {
      try { await atDelete(TABLES.NAT_LOADS, r.id); } catch(e) { console.warn('NL delete err:', e); }
    }
    _tmsLog(`_syncNationalLoad: deleted ${existing.length} NL for NO ${noId}`);
    return;
  }

  // Build direction
  const dir = noFields['Direction'] || '';
  let nlDir = 'North→South';
  if (dir === 'South→North') nlDir = 'South→North';

  // Resolve client name
  let clientName = '';
  try {
    const cArr = noFields['Client'];
    const cId = Array.isArray(cArr) ? (cArr[0]?.id || cArr[0]) : null;
    if (cId) {
      const cRec = await atGetOne(TABLES.CLIENTS, cId);
      clientName = cRec.fields?.['Company Name'] || '';
    }
  } catch(e) { logError(e, 'orders_natl resolve client name'); }

  const _lid = v => {
    if (!v) return null;
    if (Array.isArray(v)) return v.length ? (v[0]?.id || v[0]) : null;
    return typeof v === 'object' ? v.id : v;
  };

  // Build NL fields
  const nlFields = {
    'Name': `${clientName || 'Order'} — ${toLocalDate(noFields['Loading DateTime'])}`,
    'Direction': nlDir,
    'Source Type': 'Direct',
    'Source Record': noId,
    'Source Orders': noId,
    'Client': clientName,
    'Goods': noFields['Goods'] || '',
    'Total Pallets': noFields['Pallets'] || 0,
    'Temperature C': noFields['Temperature °C'] ?? null,
    'Loading DateTime': noFields['Loading DateTime'] || null,
    'Delivery DateTime': noFields['Delivery DateTime'] || null,
    'Reference': noFields['Reference'] || '',
    'Status': 'Pending',
    'Pallet Exchange': !!noFields['Pallet Exchange'],
  };

  // Copy Pickup/Delivery Locations 1-10 (new-style), fallback to old-style
  let hasNewPickup = false, hasNewDeliv = false;
  for (let i = 1; i <= 10; i++) {
    const pId = _lid(noFields[`Pickup Location ${i}`]);
    const dId = _lid(noFields[`Delivery Location ${i}`]);
    if (pId) { nlFields[`Pickup Location ${i}`] = [pId]; hasNewPickup = true; }
    if (dId) { nlFields[`Delivery Location ${i}`] = [dId]; hasNewDeliv = true; }
  }
  // Note: old-style single 'Pickup Location' / 'Delivery Location' fields no longer exist in schema

  let _nlRecId = null;
  if (existing.length) {
    // Update existing
    await atPatch(TABLES.NAT_LOADS, existing[0].id, nlFields);
    _nlRecId = existing[0].id;
    _tmsLog(`_syncNationalLoad: updated NL ${existing[0].id} for NO ${noId}`);
  } else {
    // Create new
    const created = await atCreate(TABLES.NAT_LOADS, nlFields);
    _nlRecId = created.id;
    _tmsLog(`_syncNationalLoad: created NL ${created.id} for NO ${noId}`);
  }

  // Write ORDER_STOPS for the NAT_LOADS record
  if (_nlRecId) {
    const _nlStops = [];
    const _pals = noFields['Pallets'] || 0;
    const _clientId = Array.isArray(noFields['Client']) ? (_lid(noFields['Client'][0]) || _lid(noFields['Client'])) : null;
    const _goods = noFields['Goods'] || null;
    const _temp  = noFields['Temperature °C'] ?? null;
    const _ref   = noFields['Reference'] || null;

    // ── Φ2 (Α1): παλέτες ΑΝΑ ΣΤΑΣΗ, όχι το σύνολο σε κάθε στάση ──────────
    //
    // Πριν: `pallets: _pals` έγραφε το ΣΥΝΟΛΟ της παραγγελίας σε ΚΑΘΕ στάση.
    // Παραγγελία 20p σε 3 σημεία έγραφε 20+20+20 = 60p στα ORDER_STOPS, και
    // κάθε τι που τα αθροίζει έβλεπε τριπλάσιο φορτίο.
    //
    // Δεν είναι συστημικό: τα διεθνή το κάνουν ήδη σωστά (orders_intl.js:1435,
    // :1442 γράφουν parseFloat(pal) ανά στάση). Τα εθνικά έμειναν πίσω.
    //
    // Πηγή αλήθειας = τα ORDER_STOPS της ΙΔΙΑΣ της παραγγελίας, όπου η φόρμα
    // έχει ήδη γράψει τις παλέτες κάθε σημείου.
    const _byStop = {};
    try {
      const _noStops = await stopsLoad(noId, F.STOP_PARENT_NAT);
      (_noStops || []).forEach(s => {
        const t = s.fields?.[F.STOP_TYPE], n = s.fields?.[F.STOP_NUMBER], p = s.fields?.[F.STOP_PALLETS];
        if (t && p != null) _byStop[t + '#' + (n || 0)] = p;
      });
    } catch(e) { console.warn('Α1: ανάγνωση ORDER_STOPS της NO απέτυχε', e); }

    let _nLoad = 0, _nUnload = 0;
    for (let i = 1; i <= 10; i++) {
      if (_lid(noFields[`Pickup Location ${i}`]))   _nLoad++;
      if (_lid(noFields[`Delivery Location ${i}`])) _nUnload++;
    }

    // ΜΙΑ στάση → το σύνολο είναι όντως της στάσης.
    // ΠΟΛΛΕΣ χωρίς αναλυτικά δεδομένα → null (κενό), ΠΟΤΕ το σύνολο σε
    // καθεμία: το λάθος νούμερο είναι χειρότερο από το κανένα, γιατί
    // αθροίζεται σιωπηλά σε πολλαπλάσιο φορτίο.
    const _palFor = (type, i, count) => {
      const v = _byStop[type + '#' + i];
      if (v != null) return v;
      return count === 1 ? _pals : null;
    };

    for (let i = 1; i <= 10; i++) {
      const pId = _lid(noFields[`Pickup Location ${i}`]);
      if (pId) _nlStops.push({ stopNumber: i, stopType: 'Loading', locationId: pId,
        pallets: _palFor('Loading', i, _nLoad), dateTime: noFields['Loading DateTime'] || null,
        clientId: _clientId, goods: _goods, temp: _temp, ref: _ref });
      const dId = _lid(noFields[`Delivery Location ${i}`]);
      if (dId) _nlStops.push({ stopNumber: i, stopType: 'Unloading', locationId: dId,
        pallets: _palFor('Unloading', i, _nUnload), dateTime: noFields['Delivery DateTime'] || null,
        clientId: _clientId, goods: _goods, temp: _temp, ref: _ref });
    }
    if (_nlStops.length) {
      try { await stopsSave(_nlRecId, _nlStops, F.STOP_PARENT_NL); }
      catch(e) { console.warn('NL ORDER_STOPS write error:', e); }
    }
  }

  } finally {
    _syncingNLs.delete(noId);
  }
}

// ═══════════════════════════════════════════════
// cancelNatlOrder — soft cancel: marks Status='Cancelled', leaves linked
// records intact for audit/reporting. Use for client-cancelled orders.
// ═══════════════════════════════════════════════
async function cancelNatlOrder(recId) {
  if (!(await confirmAction('Ακύρωση αυτής της National Order;\n\nΘα μαρκαριστεί ως Cancelled αλλά τα linked records (NL/GL/CL/Ramp/Pallet Ledger) παραμένουν.\n\nΓια ολική διαγραφή χρησιμοποίησε το Delete.', { title: 'Ακύρωση παραγγελίας', confirmLabel: 'Ακύρωσέ την', danger: true }))) return;
  try {
    await atPatch(TABLES.NAT_ORDERS, recId, { 'Status': 'Cancelled' });
    invalidateCache(TABLES.NAT_ORDERS);
    try {
      if (typeof syncOrderDownstream === 'function') {
        await syncOrderDownstream(recId, { source: 'natl', changedFields: ['Status'] });
      }
    } catch(e) { console.warn('Cancel: downstream sync warning:', e.message); }
    toast('Παραγγελία ακυρώθηκε', 'success');
    document.getElementById('natlDetail')?.classList.add('hidden');
    await renderOrdersNatl();
  } catch(e) {
    reportError('Η ακύρωση απέτυχε, δοκιμάστε ξανά');
    if (typeof logError === 'function') logError(e, 'cancelNatlOrder ' + recId);
  }
}

// ═══════════════════════════════════════════════
// deleteNatlOrder — Delete a National Order + cleanup NL/GL/CL/Ramp
// ═══════════════════════════════════════════════
async function deleteNatlOrder(recId) {
  if (!confirm('Delete this National Order? This will also remove linked loads and groupage lines.')) return;

  try {
    toast('Deleting order...', 'info');
    let _delFail = 0;

    // 1. Delete NAT_LOADS (Direct) linked to this NO
    try {
      const nls = await atGetAll(TABLES.NAT_LOADS, {
        filterByFormula: `{Source Record}="${recId}"`,
        fields: ['Name']
      }, false);
      for (const nl of nls) {
        try { await atDelete(TABLES.NAT_LOADS, nl.id); } catch(e) { _delFail++; console.warn('NL delete:', e); }
      }
      if (nls.length) _tmsLog(`Deleted ${nls.length} NAT_LOADS for NO ${recId}`);
    } catch(e) { _delFail++; console.warn('NL cleanup error:', e); }

    // 2. Delete GL lines + linked CL + CL-linked NL
    try {
      const gls = await atGetAll(TABLES.GL_LINES, {
        filterByFormula: `FIND("${recId}",ARRAYJOIN({Linked National Order},","))>0`,
        fields: ['Status']
      }, false);
      for (const gl of gls) {
        // Delete CONS_LOADS linked to this GL
        try {
          const cls = await atGetAll(TABLES.CONS_LOADS, {
            filterByFormula: `FIND("${gl.id}",ARRAYJOIN({Groupage Lines},","))>0`,
            fields: ['Name']
          }, false);
          for (const cl of cls) {
            // Delete NL records from this CL
            try {
              const nlsFromCL = await atGetAll(TABLES.NAT_LOADS, {
                filterByFormula: `{Source Record}="${cl.id}"`,
                fields: ['Name']
              }, false);
              for (const nl of nlsFromCL) { try { await atDelete(TABLES.NAT_LOADS, nl.id); } catch(e) { _delFail++; } }
            } catch(e) { _delFail++; console.warn('NL-CL cleanup:', e); }
            try { await atDelete(TABLES.CONS_LOADS, cl.id); } catch(e) { _delFail++; console.warn('CL delete:', e); }
          }
        } catch(e) { _delFail++; console.warn('CL cleanup:', e); }
        // FIXME(audit): GL_LINES must never be hard-deleted — only set Status='Unassigned'.
        // See .reference/ANALYSIS_WEAK_SPOTS_OPPORTUNITIES.md and orders_natl.js findings.
        try { await atSafePatch(TABLES.GL_LINES, gl.id, { Status: 'Unassigned' }); } catch(e) { _delFail++; console.warn('GL unassign:', e); }
      }
      if (gls.length) _tmsLog(`Unassigned ${gls.length} GL lines for NO ${recId} (CL/NL deleted)`);
    } catch(e) { _delFail++; console.warn('GL cleanup error:', e); }

    // 3. Delete RAMP records linked to this NO (field is 'National Order', NOT 'Source Order')
    try {
      const ramps = await atGetAll(TABLES.RAMP, {
        filterByFormula: `FIND("${recId}",ARRAYJOIN({National Order},","))>0`,
        fields: ['Name']
      }, false);
      for (const r of ramps) {
        try { await atDelete(TABLES.RAMP, r.id); } catch(e) { _delFail++; console.warn('Ramp delete:', e); }
      }
    } catch(e) { _delFail++; console.warn('Ramp cleanup:', e); }

    if (typeof plOnOrderDeleted === 'function') await plOnOrderDeleted(recId, 'natl');

    // 4. Delete ORDER_STOPS linked to this NO
    try {
      const natStops = await stopsLoad(recId, F.STOP_PARENT_NAT);
      for (const s of natStops) {
        try { await atDelete(TABLES.ORDER_STOPS, s.id); } catch(e) { _delFail++; console.warn('Stop delete:', e); }
      }
      if (natStops.length) _tmsLog(`Deleted ${natStops.length} ORDER_STOPS for NO ${recId}`);
    } catch(e) { _delFail++; console.warn('ORDER_STOPS cleanup:', e); }

    // 4b. Delete PARTNER_ASSIGN records linked to this NO (via Nat Load field — also Order in case national orders use that)
    try {
      const pas = await atGetAll(TABLES.PARTNER_ASSIGN, {
        filterByFormula: `OR(FIND("${recId}",ARRAYJOIN({${F.PA_ORDER}},",")) > 0, FIND("${recId}",ARRAYJOIN({${F.PA_NAT_LOAD}},",")) > 0)`,
      }, false);
      for (const pa of pas) {
        try { await atDelete(TABLES.PARTNER_ASSIGN, pa.id); } catch(e) { _delFail++; console.warn('PA delete:', e); }
      }
      if (pas.length) _tmsLog(`Deleted ${pas.length} PARTNER_ASSIGN for NO ${recId}`);
    } catch(e) { _delFail++; console.warn('PA cleanup:', e); }

    // 5. Delete the NAT_ORDER itself (soft delete — saved to trash)
    await atSoftDelete(TABLES.NAT_ORDERS, recId);

    // Invalidate caches
    invalidateCache(TABLES.NAT_ORDERS);
    invalidateCache(TABLES.NAT_LOADS);
    invalidateCache(TABLES.GL_LINES);
    invalidateCache(TABLES.CONS_LOADS);

    toast(_delFail ? `Order deleted (${_delFail} linked records failed — check data)` : 'Order deleted', _delFail ? 'warn' : 'success');
    if (_delFail && typeof logError === 'function') logError(new Error(`Cascade delete: ${_delFail} sub-deletes failed`), 'deleteNatlOrder ' + recId);
    await renderOrdersNatl();
  } catch(e) {
    reportError('Η διαγραφή απέτυχε, δοκιμάστε ξανά', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// SCAN FLOW — clone of orders_intl with national-specific schema
// ═══════════════════════════════════════════════════════════════

function openNatlScan() {
  document.getElementById('modal').style.maxWidth = '520px';
  openModal('Νέα National Order από Scan', `
    <div style="text-align:center;padding:4px 0 20px">
      <div style="font-size:12px;color:var(--text-dim);margin-top:4px">
        Upload εθνικού δελτίου — AI εξάγει pickup/delivery και προσυμπληρώνει τη φόρμα
      </div>
    </div>

    <div id="natlScanDrop"
      style="border:2px dashed var(--border-dark);border-radius:8px;padding:36px 20px;
             text-align:center;cursor:pointer;background:var(--bg);transition:border-color 0.15s"
      onclick="document.getElementById('natlScanFile').click()"
      ondragover="event.preventDefault();document.getElementById('natlScanDrop').style.borderColor='var(--accent)'"
      ondragleave="document.getElementById('natlScanDrop').style.borderColor='var(--border-dark)'"
      ondrop="_natlScanDrop(event)">
      <div style="font-size:30px;margin-bottom:8px;opacity:0.35">📎</div>
      <div style="font-size:13px;font-weight:500;color:var(--text-mid)">Drag & drop ή κλικ για upload</div>
      <div style="font-size:12px;color:var(--text-dim);margin-top:4px">JPG · PNG · PDF — max 10MB</div>
      <button type="button" class="btn btn-ghost btn-sm" style="margin-top:12px"
        onclick="event.stopPropagation();document.getElementById('natlScanCamera').click()">
        📷 &nbsp;Λήψη με κάμερα
      </button>
    </div>
    <input type="file" id="natlScanFile" accept="image/*,application/pdf" style="display:none"
      onchange="_natlScanHandleFile(this.files[0])">
    <input type="file" id="natlScanCamera" accept="image/*" capture="environment" style="display:none"
      onchange="_natlScanHandleFile(this.files[0])">

    <div id="natlScanStatus" style="display:none;margin-top:14px"></div>`,

  `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
   <button class="btn btn-success" id="btnNatlScanGo" onclick="_natlScanExtract()" disabled>
     🤖 &nbsp;Extract & Fill Form
   </button>`);
}

function _natlScanDrop(e) {
  e.preventDefault();
  document.getElementById('natlScanDrop').style.borderColor = 'var(--border-dark)';
  _natlScanHandleFile(e.dataTransfer.files[0]);
}

async function _natlScanHandleFile(file) {
  if (!file) return;
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) { toast(`File too large (${(file.size/1024/1024).toFixed(1)}MB) — max 10MB`, 'error'); return; }
  if (!file.type.startsWith('image/') && file.type !== 'application/pdf') { toast('Only JPG / PNG / PDF supported', 'error'); return; }

  window._natlScanFile = file;
  const btn = document.getElementById('btnNatlScanGo');
  if (btn) btn.disabled = false;

  const drop = document.getElementById('natlScanDrop');
  if (drop) drop.innerHTML = `
    <div style="font-size:24px;margin-bottom:6px">✅</div>
    <div style="font-size:13px;font-weight:500;color:var(--success)">${escapeHtml(file.name)}</div>
    <div style="font-size:12px;color:var(--text-dim);margin-top:3px">${(file.size/1024).toFixed(0)} KB — κλικ για αλλαγή</div>`;

  const st = document.getElementById('natlScanStatus');
  if (!st) return;
  st.style.display = 'block';
  st.innerHTML = `<div class="scan-preview-doc"><span style="color:var(--text-dim);font-size:12px">Loading preview…</span></div>`;
  try {
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      st.innerHTML = `<div class="scan-preview-doc"><img src="${url}" alt="preview"></div>`;
    } else if (typeof scanRenderPDFPreview === 'function') {
      const dataUrl = await scanRenderPDFPreview(file);
      st.innerHTML = dataUrl
        ? `<div class="scan-preview-doc"><img src="${dataUrl}" alt="PDF page 1"></div>`
        : `<div class="scan-preview-info">📄 PDF · ${escapeHtml(file.name)}</div>`;
    }
  } catch(e) { st.innerHTML = `<div class="scan-preview-info">📄 ${escapeHtml(file.name)}</div>`; }
}

async function _natlScanExtract() {
  const file = window._natlScanFile;
  if (!file) return;
  const st = document.getElementById('natlScanStatus');
  const btn = document.getElementById('btnNatlScanGo');
  const setStatus = (icon, text, kind = 'info') => {
    if (!st) return;
    const bg = kind === 'error' ? 'var(--danger-bg)' : 'var(--bg)';
    const color = kind === 'error' ? 'var(--danger)' : 'var(--text-mid)';
    const border = kind === 'error' ? 'rgba(220,38,38,0.2)' : 'var(--border)';
    st.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:${bg};border-radius:8px;border:1px solid ${border};font-size:13px;color:${color}">${icon}${text}</div>`;
  };
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block"></span> &nbsp;Analyzing...'; }
  setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>', 'Προετοιμασία αρχείου…');

  try {
    const pre = await scanPreprocessFile(file);
    setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>', 'AI αναλύει το εθνικό δελτίο…');

    const cb = pre.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: pre.mediaType, data: pre.base64 } }
      : { type: 'image',    source: { type: 'base64', media_type: pre.mediaType, data: pre.base64 } };

    // Reference data injection (Phase 2.3)
    const refData = (typeof scanGetReferenceData === 'function') ? scanGetReferenceData(50, 80) : { clients: [], locations: [] };
    const refBlock = (typeof scanBuildReferenceBlock === 'function') ? scanBuildReferenceBlock(refData) : '';

    const sysPrompt = `You are a logistics document parser for Petras Group's NATIONAL Greek transport operations.
Extract data from Greek delivery notes (Δελτίο Αποστολής), national transport orders, or domestic CMR variants.
Return ONLY valid JSON — no markdown, no explanation.

Output schema:
{
  "name": "order reference / number from document (e.g. 'NO-2026-001')",
  "reference": "transport reference / Δελτίο Αποστολής number / order #. Look for: 'Αρ. Δελτίου', 'Α/Α', 'No.', 'Reference', 'Αρ. Παραγγελίας'. Numeric/alphanumeric value only. null if not found.",
  "client_name": "company that issued or paid for the transport",
  "direction": "South→North if delivering northwards (e.g. Athens→Thessaloniki, Patra→Veroia), North→South if going south",
  "type": "Direct | Groupage | Cross-dock",
  "goods": "comma-separated product list",
  "pallets": total pallets count,
  "temperature_c": number or null,
  "price_eur": number or null,
  "loading_date": "YYYY-MM-DD",
  "delivery_date": "YYYY-MM-DD",
  "confidence": "HIGH | MEDIUM | LOW",
  "field_confidence": { "client_name": 0-1, "pallets": 0-1, "pickup_locations": 0-1, "delivery_locations": 0-1, "dates": 0-1 },
  "pickup_locations": [{
    "location_name": "supplier / pickup site name",
    "city": "Greek city in Latin",
    "city_gr": "Greek city in Greek script",
    "pallets": number,
    "date": "YYYY-MM-DD"
  }],
  "delivery_locations": [{
    "location_name": "consignee name",
    "city": "Greek city in Latin",
    "city_gr": "Greek city in Greek",
    "pallets": null,
    "date": "YYYY-MM-DD"
  }],
  "notes": "special instructions"
}

GREEK NATIONAL CONTEXT:
- All locations are in Greece. No customs.
- Common Greek city pairs: Αθήνα↔Θεσσαλονίκη, Πάτρα↔Θεσσαλονίκη, Ηράκλειο→Athens, Veroia↔Athens
- Veroia/Βέροια is a cross-dock hub — note if mentioned
- Direction "South→North" (ΑΝΟΔΟΣ): Athens/Patra → Veroia/Thessaloniki
- Direction "North→South" (ΚΑΘΟΔΟΣ): Veroia/Thessaloniki → Athens/Patra
- "Groupage" = multiple suppliers consolidated; "Direct" = single supplier
- field_confidence: 1.0 = clearly read, 0.4 = barely legible
- Sum pickup pallets must equal total pallets` + refBlock + `

You have access to two tools:
- search_clients(query)        → look up canonical client name + id
- search_locations(query, city, country) → look up canonical location name + id

USE THESE TOOLS for the client and every pickup/delivery location.
Set client_id and location_id fields when tools return a confident match (>0.85).`;

    const messages = [];
    const examples = (typeof scanGetTrainingExamples === 'function') ? scanGetTrainingExamples('DELIVERY_NOTE', 3) : [];
    examples.forEach(ex => {
      messages.push({ role: 'user', content: [{ type: 'text', text: 'Extract:' }] });
      messages.push({ role: 'assistant', content: [{ type: 'text', text: JSON.stringify(ex.corrected) }] });
    });
    messages.push({ role: 'user', content: [cb, { type: 'text', text:
      'Extract national order data. Use search_clients and search_locations tools.\n\n' +
      'CRITICAL: Final message = ONLY the JSON object. No preamble, no markdown, no commentary. Start with `{` end with `}`.'
    }] });

    // DELIVERY_NOTE → Sonnet (per tier map). Use tool-use loop with fallback.
    const natlModel = (typeof scanModelForType === 'function') ? scanModelForType('DELIVERY_NOTE') : SCAN_MODEL;
    let data;
    try {
      data = await scanExtractWithTools({
        model: natlModel,
        max_tokens: SCAN_MAX_TOKENS,
        system: sysPrompt,
        messages,
        onProgress: (stage, detail) => {
          if (stage === 'tools') {
            setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>', detail);
          }
        },
      });
    } catch (toolErr) {
      console.warn('[natl_scan] tool-use loop failed, falling back:', toolErr.message);
      data = await scanCallAnthropic({
        model: natlModel,
        max_tokens: SCAN_MAX_TOKENS,
        system: sysPrompt,
        messages,
      });
    }

    const raw = data.content.find(c => c.type === 'text')?.text || '{}';
    const parsed = (typeof scanExtractJSON === 'function')
      ? scanExtractJSON(raw)
      : JSON.parse(raw.replace(/```json|```/g, '').trim());
    parsed._docType = 'DELIVERY_NOTE';
    await _natlScanPreview(parsed);
  } catch (e) {
    setStatus('❌ ', e.message || 'Extraction failed', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '🤖 &nbsp;Extract & Fill Form'; }
    if (typeof logError === 'function') logError(e, 'natl_scan_extract');
  }
}

async function _natlScanPreview(data) {
  const st = document.getElementById('natlScanStatus');
  const btn = document.getElementById('btnNatlScanGo');
  if (btn) { btn.disabled = false; btn.innerHTML = '🤖 &nbsp;Extract & Fill Form'; }

  // Match client — prefer AI-supplied client_id (from tool use), then fuzzy fallback
  let clientId = '', clientLabel = '';
  const allClients = (typeof getRefClients === 'function' ? getRefClients() : []) || [];
  if (data.client_id) {
    const direct = allClients.find(c => c.id === data.client_id);
    if (direct) { clientId = direct.id; clientLabel = direct.fields?.['Company Name'] || ''; }
  }
  if (!clientId && data.client_name) {
    if (typeof scanFuzzyMatch === 'function' && allClients.length) {
      const list = allClients.map(c => ({ id: c.id, label: c.fields?.['Company Name'] || '' })).filter(c => c.label);
      const best = scanFuzzyMatch(data.client_name, list, { threshold: 0.6, limit: 1 })[0];
      if (best) { clientId = best.id; clientLabel = best.label; }
    } else {
      try {
        const matches = await atGetAll(TABLES.CLIENTS, {
          filterByFormula: `OR(SEARCH(LOWER("${(data.client_name||'').replace(/"/g,'')}"),LOWER({Company Name})))`,
          fields: ['Company Name'], maxRecords: 5,
        }, false);
        if (matches.length) { clientId = matches[0].id; clientLabel = matches[0].fields['Company Name']; }
      } catch(e) { console.warn('[natl_scan] client match failed:', e.message); }
    }
  }

  // Match locations — prefer AI-supplied location_id, then fuzzy match using ref data
  const allLocs = (typeof getRefLocations === 'function' ? getRefLocations() : []) || [];
  const locList = allLocs.map(l => ({
    id: l.id,
    label: [(l.fields?.['Name']||''), (l.fields?.['City']||''), (l.fields?.['Country']||'')].filter(Boolean).join(' · '),
  })).filter(l => l.label);
  const _matchLoc = s => {
    if (s.location_id) {
      const direct = allLocs.find(l => l.id === s.location_id);
      if (direct) return direct;
    }
    if (typeof scanFuzzyMatch === 'function' && locList.length) {
      const composite = [s.location_name, s.city_gr, s.city].filter(Boolean).join(' ');
      const best = scanFuzzyMatch(composite, locList, { threshold: 0.55, limit: 1 })[0];
      if (best) return allLocs.find(l => l.id === best.id);
    }
    const nm = (s.location_name || '').toLowerCase();
    const cg = (s.city_gr || '').toLowerCase();
    const ct = (s.city || '').toLowerCase();
    return allLocs.find(l => nm && (l.fields['Name']||'').toLowerCase().includes(nm))
        || allLocs.find(l => cg && (l.fields['City']||'').toLowerCase().includes(cg))
        || allLocs.find(l => ct && (l.fields['City']||'').toLowerCase().includes(ct));
  };
  const pickups = (data.pickup_locations || []).map(s => {
    const m = _matchLoc(s);
    return { ...s, _locId: m?m.id:'', _locLabel: m?(m.fields['Name']||m.fields['City']):s.location_name||s.city_gr||s.city };
  });
  const deliveries = (data.delivery_locations || []).map(s => {
    const m = _matchLoc(s);
    return { ...s, _locId: m?m.id:'', _locLabel: m?(m.fields['Name']||m.fields['City']):s.location_name||s.city_gr||s.city };
  });

  const conf = data.confidence || 'LOW';
  const confC = conf === 'HIGH' ? 'var(--success)' : conf === 'MEDIUM' ? 'var(--warning)' : 'var(--danger)';
  const fc = data.field_confidence || {};
  const fcMark = score => {
    if (score == null) return '';
    return score >= 0.85 ? '<span style="color:var(--success)">✓</span>'
         : score >= 0.6  ? '<span style="color:var(--warning)">~</span>'
                         : '<span style="color:var(--danger)">⚠</span>';
  };

  const row = (label, val, score) => val ? `
    <div class="detail-field">
      <span class="detail-field-label">${label}</span>
      <span class="detail-field-value" style="display:flex;align-items:center;gap:6px">${val} ${fcMark(score)}</span>
    </div>` : '';

  st.style.display = 'block';
  st.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:4px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span class="detail-section-title" style="margin:0">AI Extraction</span>
        <span style="font-size:11px;font-weight:600;letter-spacing:1px;color:${confC}">${conf}</span>
      </div>
      ${row('Order Name', escapeHtml(data.name||''), fc.client_name)}
      ${data.reference ? row('Reference', escapeHtml(String(data.reference)), fc.reference != null ? fc.reference : 0.85) : ''}
      ${row('Client',  escapeHtml(clientLabel||data.client_name), fc.client_name)}
      ${row('Direction', data.direction||'', null)}
      ${row('Type',      data.type||'', null)}
      ${pickups.map((s,i)=>row(`Pickup ${pickups.length>1?i+1:''}`,    escapeHtml(s._locLabel), fc.pickup_locations)).join('')}
      ${deliveries.map((s,i)=>row(`Delivery ${deliveries.length>1?i+1:''}`,escapeHtml(s._locLabel), fc.delivery_locations)).join('')}
      ${row('Load Date', escapeHtml(data.loading_date||''), fc.dates)}
      ${row('Del Date',  escapeHtml(data.delivery_date||''), fc.dates)}
      ${row('Pallets',   data.pallets!=null?String(data.pallets):'', fc.pallets)}
      ${row('Goods',     escapeHtml(data.goods||''), null)}
      ${row('Temp',      data.temperature_c!=null?data.temperature_c+' °C':'', null)}
      ${data.notes ? `<div style="margin-top:8px;font-size:11px;color:var(--text-dim);font-style:italic">ℹ ${escapeHtml(data.notes)}</div>` : ''}
    </div>
    <div style="font-size:11px;color:var(--text-dim);text-align:center;padding-top:4px">
      ✓ matched · ~ partial · ⚠ low confidence
    </div>`;

  window._natlScanResult = { data, matched: { clientId, clientLabel, pickups, deliveries } };
  document.getElementById('modalFooter').innerHTML = `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-ghost" onclick="openNatlScan()">↩ Rescan</button>
    <button class="btn btn-success" onclick="_natlScanOpenForm()">Open Form →</button>`;

  // Duplicate detection — fire-and-forget. Insert warning if Reference matches existing.
  if (data.reference && typeof findDuplicateOrders === 'function') {
    findDuplicateOrders(data.reference, TABLES.NAT_ORDERS).then(dupes => {
      if (!dupes.length) return;
      const dupListHtml = dupes.map(d => {
        const f = d.fields;
        const loadDate = (f['Loading DateTime']||'').substring(0,10);
        const name = f['Name'] || d.id.slice(-6);
        return `<li style="margin:4px 0">
          <a href="#" onclick="event.preventDefault();closeModal();renderOrdersNatl().then(()=>setTimeout(()=>selectNatlOrder('${d.id}'),300))"
             style="color:#92400E;text-decoration:underline;font-weight:600">${escapeHtml(String(name))}</a>
          <span style="color:#78350F;font-size:11px"> · ${loadDate||'no date'}</span>
        </li>`;
      }).join('');
      st.insertAdjacentHTML('afterbegin', `
        <div style="background:var(--warning-soft);border:1px solid #FBBF24;padding:10px 14px;border-radius:8px;margin-bottom:10px">
          <div style="font-weight:700;color:#92400E;font-size:13px">⚠ Πιθανό duplicate</div>
          <div style="font-size:12px;color:#78350F;margin-top:4px">Βρέθηκε ήδη παραγγελία με Reference <strong>${escapeHtml(String(data.reference))}</strong>:</div>
          <ul style="margin:6px 0 0 18px;padding:0;font-size:12px">${dupListHtml}</ul>
        </div>`);
    });
  }
}

async function _natlScanOpenForm() {
  const r = window._natlScanResult;
  if (!r) return;
  const f = {};
  if (r.matched.clientId) f['Client'] = [r.matched.clientId];
  if (r.data.name)        f['Name'] = r.data.name;
  if (r.data.reference)   f['Reference'] = String(r.data.reference);
  if (r.data.direction)   f['Direction'] = r.data.direction;
  if (r.data.type)        f['Type'] = r.data.type;
  if (r.data.goods)       f['Goods'] = r.data.goods;
  if (r.data.notes)       f['Notes'] = String(r.data.notes);
  if (r.data.pallets)     f['Pallets'] = r.data.pallets;
  if (r.data.temperature_c != null) f['Temperature °C'] = r.data.temperature_c;
  if (r.data.price_eur)   f['Price'] = r.data.price_eur;
  if (r.data.loading_date)  f['Loading DateTime']  = r.data.loading_date;
  if (r.data.delivery_date) f['Delivery DateTime'] = r.data.delivery_date;

  r.matched.pickups.forEach((s, i) => {
    if (s._locId) f[`Pickup Location ${i+1}`] = [s._locId];
    if (s.pallets != null) f[`Loading Pallets ${i+1}`] = s.pallets;
  });
  r.matched.deliveries.forEach((s, i) => {
    if (s._locId) f[`Delivery Location ${i+1}`] = [s._locId];
  });

  // Stash for active learning — saved when user actually submits the form
  window._natlScanPending = { docType: 'DELIVERY_NOTE', summary: window._natlScanFile?.name || '', ai: r.data };

  closeModal();
  if (typeof openNatlCreate === 'function') {
    openNatlCreate();
    // Pre-fill form fields after the modal renders
    setTimeout(() => _natlPrefillFromScan(f), 100);
  }
}

function _natlPrefillFromScan(fields) {
  for (const [key, val] of Object.entries(fields)) {
    const inputs = document.querySelectorAll(`[data-field="${key}"], [name="${key}"], #fld_${key.replace(/\s/g,'_')}`);
    inputs.forEach(input => {
      // Apply confidence tint class based on _natlScanResult.data.field_confidence
      const fc = window._natlScanResult?.data?.field_confidence || {};
      const fcKey = ({'Client':'client_name','Pallets':'pallets','Loading DateTime':'dates','Delivery DateTime':'dates'})[key];
      if (fcKey && fc[fcKey] != null && typeof scanConfidenceClass === 'function') {
        input.classList.add(scanConfidenceClass(fc[fcKey]));
      }
      if (Array.isArray(val)) {
        // linked record — leave to form to handle, just store hint
        input.dataset.scanFill = val[0];
      } else {
        input.value = val;
      }
    });
  }
}

// Expose functions used from onclick/onchange handlers
function _natlExportCSV() {
  const recs = NATL_ORDERS.filtered;
  if (!recs.length) { toast('No records to export', 'error'); return; }
  const rows = [['Name','Direction','Client','Pickup','Delivery','Load Date','Del Date','Pallets','Goods','Type','Trip','Invoiced','Price']];
  recs.forEach(r => { const f = r.fields;
    const cId = (f['Client']||[])[0]; const pId = (f['Pickup Location 1']||[])[0];
    const dId = (f['Delivery Location 1']||f['Delivery Location']||[])[0];
    const trip = ((f['Linked Trip']?.length||0)+(f['NATIONAL TRIPS']?.length||0)+(f['NATIONAL TRIPS 2']?.length||0))>0?'Assigned':'Pending';
    rows.push([f['Name']||'', f['Direction']||'', cId?(_fhClientsMap[cId]||''):'',
      pId?(_fhLocationsMap[pId]||''):'', dId?(_fhLocationsMap[dId]||''):'',
      f['Loading DateTime']||'', f['Delivery DateTime']||'', f['Pallets']||0,
      f['Goods']||'', f['Type']||'', trip, f['Invoiced']?'Yes':'No', f['Price']||0,
    ]); });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `orders_natl_${localToday()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  toast('CSV exported');
}

// Print-friendly view of National Orders. Opens new tab with A4 layout.
function _natlPrint() {
  const recs = NATL_ORDERS.filtered || [];
  if (!recs.length) { toast('No records to print', 'error'); return; }
  const today = localToday();
  const rowsHTML = recs.map(r => {
    const f = r.fields;
    const cId = (f['Client']||[])[0]; const pId = (f['Pickup Location 1']||[])[0];
    const dId = (f['Delivery Location 1']||f['Delivery Location']||[])[0];
    const direction = f['Direction']||'';
    const dirCls = direction.includes('North→South') ? 'dir-imp' : 'dir-exp';
    const trip = ((f['Linked Trip']?.length||0)+(f['NATIONAL TRIPS']?.length||0)+(f['NATIONAL TRIPS 2']?.length||0))>0?'Assigned':'Pending';
    const stCls = trip === 'Assigned' ? 'st-ok' : 'st-pending';
    return `<tr>
      <td>${escapeHtml(f['Name']||'')}</td>
      <td><span class="dir ${dirCls}">${direction}</span></td>
      <td>${escapeHtml(cId?(_fhClientsMap[cId]||''):'')}</td>
      <td>${escapeHtml(pId?(_fhLocationsMap[pId]||''):'')}</td>
      <td>${escapeHtml(dId?(_fhLocationsMap[dId]||''):'')}</td>
      <td>${(f['Loading DateTime']||'').substring(0,10)}</td>
      <td>${(f['Delivery DateTime']||'').substring(0,10)}</td>
      <td class="r">${f['Pallets']||0}</td>
      <td>${escapeHtml(f['Type']||'')}</td>
      <td><span class="st ${stCls}">${trip}</span></td>
      <td class="r">${f['Price'] ? '€'+Number(f['Price']).toLocaleString() : '—'}</td>
    </tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html><head>
    <title>National Orders — ${today}</title>
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'DM Sans',sans-serif;color:#0F172A;padding:20px;font-size:11px}
      h1{font-family:'Syne',sans-serif;font-size:22px;color:var(--navy-mid);margin-bottom:4px}
      .sub{color:#64748B;font-size:11px;margin-bottom:18px}
      table{width:100%;border-collapse:collapse;font-size:10px}
      thead th{background:var(--navy-mid);color:#fff;padding:8px 6px;text-align:left;font-weight:700;text-transform:uppercase;font-size:9px;letter-spacing:.4px}
      tbody td{padding:6px;border-bottom:1px solid #E2E8F0}
      .r{text-align:right}
      .dir{padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;white-space:nowrap}
      .dir-exp{background:#DBEAFE;color:#1E40AF}
      .dir-imp{background:var(--warning-soft);color:#92400E}
      .st{padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600}
      .st-ok{background:#D1FAE5;color:#064E3B}
      .st-pending{background:#F1F5F9;color:#475569}
      .footer{margin-top:14px;font-size:9px;color:#64748B;display:flex;justify-content:space-between}
      @media print { body { padding: 0 } @page { size: A4 landscape; margin: 1cm } }
    </style>
  </head><body>
    <h1>National Orders</h1>
    <div class="sub">${recs.length} orders · ${today} · Petras Group TMS</div>
    <table>
      <thead><tr>
        <th>Name</th><th>Direction</th><th>Client</th><th>Pickup</th><th>Delivery</th>
        <th>Load Date</th><th>Del Date</th><th class="r">Pallets</th><th>Type</th>
        <th>Trip</th><th class="r">Price</th>
      </tr></thead>
      <tbody>${rowsHTML}</tbody>
    </table>
    <div class="footer">
      <span>Printed ${new Date().toLocaleString('el-GR')}</span>
      <span>Petras Group · Cold Chain Logistics</span>
    </div>
    <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blocked — allow pop-ups for this site', 'warn'); return; }
  w.document.write(html);
  w.document.close();
}

window.renderOrdersNatl = renderOrdersNatl;
window.openNatlCreate = openNatlCreate;
window.openNatlEdit = openNatlEdit;
window.selectNatlOrder = selectNatlOrder;
window.toggleNatlInvoiced = toggleNatlInvoiced;
window._natlSortToggle = _natlSortToggle;
window._applyNatlFilters = _applyNatlFilters;
window.natlSearch = natlSearch;
window.natlFilter = natlFilter;
window.natlPeriodChange = natlPeriodChange;
window._natlExportCSV = _natlExportCSV;
window._natlPrint = _natlPrint;
window.openNatlScan = openNatlScan;
window._natlScanDrop = _natlScanDrop;
window._natlScanHandleFile = _natlScanHandleFile;
window._natlScanExtract = _natlScanExtract;
window._natlScanOpenForm = _natlScanOpenForm;
window.submitNatlOrder = submitNatlOrder;
window.deleteNatlOrder = deleteNatlOrder;
window.cancelNatlOrder = cancelNatlOrder;
// Φ3β — groupage: όλα καλούνται από inline onclick, module σε IIFE
window._grpAddRow = _grpAddRow;
window._grpDelRow = _grpDelRow;
window._grpSet    = _grpSet;
window._grpPreview = _grpPreview;
window._grpSubmit = _grpSubmit;
window._natlMode  = _natlMode;
// Τα inline onclick δεν βλέπουν μέσα στο IIFE — χωρίς αυτά, σιωπηλό ReferenceError.
window._simAddRow = _simAddRow;
window._simDelRow = _simDelRow;
// Natl-specific form dropdown helpers (self-contained, not shared with orders_intl)
// Form dropdown handlers now in core/form-helpers.js
// Legacy aliases for backward compat
window._natlClientDrop = fhClientDrop;
window._natlLocDrop = fhLocDrop;
window._natlShowDrop = fhShowDrop;
window._natlPickLinked = fhPickLinked;
// _onPage is mutated from onclick (++/--) so expose as getter/setter
Object.defineProperty(window, '_onPage', {
  get: function() { return _onPage; },
  set: function(v) { _onPage = v; },
  configurable: true
});
})();
