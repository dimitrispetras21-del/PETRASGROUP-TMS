// ═══════════════════════════════════════════════
// MODULE — LOCATIONS v2
// ═══════════════════════════════════════════════
// Module state uses 'LOC' / '_loc' prefix to avoid global collisions.
'use strict';

const LOC = {
  records: [],
  filtered: [],
  sortCol: 'Name',
  sortDir: 1,
  page: 1,
  pageSize: 50,
  editingId: null,
  loaded: false,
};

// ── Entry point ────────────────────────────────
async function renderLocations() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading locations…');
  try {
    if (!LOC.loaded) {
      LOC.records = await _locFetchAll();
      LOC.loaded = true;
    }
    c.innerHTML = _locShell();
    _locBindEvents();
    _locRenderOverview();
    _locBuildFilterOptions();
    _locApplyFilters();
  } catch (e) {
    c.innerHTML = showError('Failed to load locations');
    if (typeof logError === 'function') logError(e, 'renderLocations load');
  }
}

// ── Shell ──────────────────────────────────────
function _locShell() {
  return `
<div class="page-header">
  <div>
    <div class="page-title" style="border-bottom:2px solid var(--navy-mid);display:inline-block;padding-bottom:2px">Locations</div>
    <div class="page-sub" id="locSub">—</div>
  </div>
  <button class="btn btn-primary" onclick="_locOpenCreate()">+ New Location</button>
</div>

<div style="display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid var(--border)">
  <div class="loc-tab active" data-tab="overview">Επισκόπηση</div>
  <div class="loc-tab" data-tab="list">Όλες οι Τοποθεσίες</div>
  <div class="loc-tab" data-tab="map">Χάρτης</div>
</div>

<!-- Overview Panel -->
<div id="locPanel-overview" class="loc-panel">
  <div class="kpi-grid" id="locKpis"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div class="table-wrap" style="overflow:hidden">
      <div style="padding:12px 18px;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--navy-mid);border-bottom:2px solid var(--navy-mid);display:flex;align-items:center;gap:8px;background:rgba(11,25,41,0.03)">
        Ανά Χώρα <span style="font-size:12px;font-weight:400;letter-spacing:0;color:var(--text-mid);text-transform:none" id="locCountryLabel"></span>
      </div>
      <div id="locCountryBars" style="overflow-y:auto;max-height:380px;scrollbar-width:thin;scrollbar-color:#CBD5E0 transparent"></div>
    </div>
    <div class="table-wrap" style="overflow:hidden">
      <div style="padding:12px 18px;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--navy-mid);border-bottom:2px solid var(--navy-mid);display:flex;align-items:center;gap:8px;background:rgba(11,25,41,0.03)">
        Ανά Κατηγορία <span style="font-size:12px;font-weight:400;letter-spacing:0;color:var(--text-mid);text-transform:none" id="locTypeLabel"></span>
      </div>
      <div id="locTypeBars" style="overflow-y:auto;max-height:380px;scrollbar-width:thin;scrollbar-color:#CBD5E0 transparent"></div>
    </div>
  </div>
</div>

<!-- List Panel -->
<div id="locPanel-list" class="loc-panel" style="display:none">
  <div class="entity-layout" style="height:calc(100vh - 265px);border-top:3px solid var(--navy-mid)">
    <div class="entity-list-panel">
      <div class="entity-toolbar" style="border-bottom:2px solid rgba(11,25,41,0.12)">
        <input class="search-input" id="locSearch" placeholder="Search name, city, address…" style="max-width:280px">
        <select class="filter-select" id="locCountryFilter">
          <option value="">Χώρα: Όλες</option>
        </select>
        <select class="filter-select" id="locTypeFilter">
          <option value="">All Types</option>
        </select>
        <span class="entity-count" id="locCount"></span>
      </div>
      <div class="entity-table-wrap" id="locTableWrap">
        <table id="locTable">
          <thead>
            <tr>
              <th class="loc-th" data-col="Name" style="cursor:pointer;color:var(--navy-mid)">Name ↕</th>
              <th class="loc-th" data-col="City" style="cursor:pointer;color:var(--navy-mid)">City ↕</th>
              <th class="loc-th" data-col="Country" style="cursor:pointer;color:var(--navy-mid)">Country ↕</th>
              <th class="loc-th">Type</th>
              <th class="loc-th">Coordinates</th>
              <th class="loc-th" style="width:80px"></th>
            </tr>
          </thead>
          <tbody id="locTbody"></tbody>
        </table>
      </div>
      <div id="locPager" style="display:flex;align-items:center;gap:6px;padding:12px 18px;border-top:1px solid var(--border);justify-content:flex-end;background:var(--bg-card);flex-shrink:0"></div>
    </div>
  </div>
</div>

<!-- Map Panel — γεμίζει από το locations_map.js με το πρώτο κλικ στην καρτέλα -->
<div id="locPanel-map" class="loc-panel" style="display:none">
  <div id="locMapHost" style="height:calc(100vh - 265px);border-top:3px solid var(--navy-mid)"></div>
</div>

<style>
.loc-tab { padding:10px 20px;font-size:13px;font-weight:500;color:var(--text-dim);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .15s,border-color .15s;display:inline-block; }
.loc-tab:hover { color:var(--text); }
.loc-tab.active { color:var(--navy-mid);border-bottom-color:var(--navy-mid);font-weight:600; }
.loc-bar-row { appearance:none;border:0;background:none;font:inherit;color:inherit;width:100%;text-align:left;display:flex;align-items:center;padding:7px 18px;gap:12px; }
.loc-bar-row.clickable { cursor:pointer;transition:background .1s; }
.loc-bar-row.clickable:hover { background:var(--bg-hover); }
.loc-bar-row.clickable:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
.loc-bar-label { min-width:140px;max-width:180px;font-size:13px;color:var(--text-mid);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.loc-bar-track { flex:1;height:5px;background:var(--bg-hover);border-radius:3px;overflow:hidden; }
.loc-bar-fill  { height:100%;background:var(--navy-mid);border-radius:3px;transition:width .5s ease; }
.loc-bar-count { font-size:12px;color:var(--text-dim);min-width:32px;text-align:right;font-variant-numeric:tabular-nums; }
.loc-pager-btn { background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:4px 10px;font-size:12px;color:var(--text-mid);cursor:pointer;transition:all .12s; }
.loc-pager-btn:hover:not(:disabled) { border-color:var(--navy-mid);color:var(--navy-mid); }
.loc-pager-btn.active { background:var(--navy-mid);color:#fff;border-color:var(--navy-mid);font-weight:700; }
#locSearch:focus, #locCountryFilter:focus, #locTypeFilter:focus { border-color:var(--navy-mid) !important; box-shadow:0 0 0 3px rgba(11,25,41,0.08) !important; }
.loc-pager-btn.active { background:var(--accent);color:#fff;border-color:var(--accent);font-weight:700; }
.loc-pager-btn:disabled { opacity:.3;cursor:not-allowed; }
.loc-act-btn { background:none;border:none;cursor:pointer;padding:4px 7px;border-radius:5px;color:var(--text-dim);transition:all .12s;font-size:12px;line-height:1; }
.loc-act-btn:hover { background:var(--bg-hover);color:var(--text); }
.loc-act-btn.del:hover { background:var(--danger-bg);color:var(--danger); }
#locTable thead th {
  background: var(--navy-mid) !important;
  color: rgba(196,207,219,0.85) !important;
  border-bottom: none !important;
  letter-spacing: 1.2px;
}
#locTable thead th.loc-th[data-col]:hover {
  color: #fff !important;
}
/* Οι γραμμές άνοιξαν κάρτα (Βήμα 4, 25/8) — το παλιό cursor:default έκρυβε ότι είναι πατήσιμες */
#locTable tbody tr { cursor:pointer !important; }
#locTable tbody tr:hover { background:var(--bg-hover); }
.kpi-card { cursor:default !important; }
</style>`;
}

// ── Tabs ──────────────────────────────────────
function _locBindEvents() {
  document.querySelectorAll('.loc-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.loc-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.loc-panel').forEach(p => p.style.display = 'none');
      document.getElementById('locPanel-' + t.dataset.tab).style.display = 'block';
      // Ο χάρτης χτίζεται με το πρώτο άνοιγμα της καρτέλας, όχι με τη σελίδα:
      // το Leaflet (54 KB) και το fetch των συνεργείων δεν χρεώνονται σε όποιον
      // δεν ανοίξει ποτέ τον χάρτη. Στα επόμενα ανοίγματα το _lmapOpen κάνει
      // invalidateSize, γιατί όσο το panel ήταν display:none το Leaflet
      // μετρούσε μηδενικό ύψος και ο χάρτης θα έμενε γκρι.
      if (t.dataset.tab === 'map' && typeof _lmapOpen === 'function') _lmapOpen();
    });
  });
  document.getElementById('locSearch').addEventListener('input', () => { LOC.page = 1; _locApplyFilters(); });
  document.getElementById('locCountryFilter').addEventListener('change', () => { LOC.page = 1; _locApplyFilters(); });
  document.getElementById('locTypeFilter').addEventListener('change', () => { LOC.page = 1; _locApplyFilters(); });
  document.querySelectorAll('.loc-th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (LOC.sortCol === col) LOC.sortDir *= -1;
      else { LOC.sortCol = col; LOC.sortDir = 1; }
      LOC.page = 1;
      _locApplyFilters();
    });
  });
}

// ── Overview ──────────────────────────────────
function _locRenderOverview() {
  const recs = LOC.records.map(r => r.fields);
  const total = recs.length;
  const countries = [...new Set(recs.map(r => r.Country).filter(Boolean))];
  const withCoords = recs.filter(r => r.Latitude != null && r.Longitude != null).length;
  const missing = recs.filter(r => !r.Country || !r.City).length;

  document.getElementById('locSub').textContent =
    `${total.toLocaleString()} locations · ${countries.length} χώρες · ${withCoords.toLocaleString()} with coordinates`;

  document.getElementById('locKpis').innerHTML = [
    { label: 'Σύνολο Τοποθεσιών',  value: total.toLocaleString(),     delta: '' },
    { label: 'Countries',        value: countries.length,           delta: '' },
    { label: 'Με Συντεταγμένες', value: withCoords.toLocaleString(),delta: `${Math.round(withCoords/total*100)}% coverage` },
    { label: 'Ελλιπή Στοιχεία',     value: missing.toLocaleString(),   delta: 'Χωρίς χώρα ή πόλη — κλικ για λίστα', click: "_locFilterByCountry('__missing')" },
  ].map(k => `
    <div class="kpi-card" ${k.click ? `style="cursor:pointer" role="button" tabindex="0" onclick="${k.click}" onkeydown="if(event.key==='Enter'){${k.click}}"` : 'style="cursor:default"'}>
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      ${k.delta ? `<div class="kpi-delta">${k.delta}</div>` : ''}
    </div>`).join('');

  // Country bars — clickable drill-down
  const cCounts = {};
  recs.forEach(r => { const k = r.Country || '— Unknown'; cCounts[k] = (cCounts[k]||0)+1; });
  const cSorted = Object.entries(cCounts).sort((a,b) => b[1]-a[1]).slice(0,18);
  const cMax = cSorted[0]?.[1] || 1;
  document.getElementById('locCountryLabel').textContent = `${countries.length} χώρες`;
  document.getElementById('locCountryBars').innerHTML =
    cSorted.map(([label, count]) => `
      <button type="button" class="loc-bar-row clickable" onclick="_locFilterByCountry('${label.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">
        <div class="loc-bar-label" title="${_locEsc(label)}">${_locEsc(label)}</div>
        <div class="loc-bar-track"><div class="loc-bar-fill" style="width:${(count/cMax*100).toFixed(1)}%"></div></div>
        <div class="loc-bar-count">${count}</div>
      </button>`).join('') +
    `<div style="padding:8px 18px 12px;font-size:11px;color:var(--text-dim)">Κλικ σε χώρα για φιλτράρισμα →</div>`;

  // Type bars — read-only
  const tCounts = {};
  recs.forEach(r => {
    let t = (r.Type || '').trim();
    if (!t) t = '— No Type';
    else if (/^(CLIENT|CLINET|client)/i.test(t)) t = 'Client Location';
    else if (/^PARTNER/i.test(t)) t = 'Partner Warehouse';
    else if (/ΣΥΝΕΡΓΕΙ|^SERVICE/i.test(t)) t = 'Service / Workshop';
    else if (/ΚΑΥΣΙΜ|ΠΕΤΡΕΛ|FUEL/i.test(t)) t = 'Fuel Station';
    else if (/^NOTES/i.test(t)) t = 'Notes / Misc';
    tCounts[t] = (tCounts[t]||0)+1;
  });
  const tSorted = Object.entries(tCounts).sort((a,b) => b[1]-a[1]).slice(0,14);
  const tMax = tSorted[0]?.[1] || 1;
  document.getElementById('locTypeLabel').textContent = `${Object.keys(tCounts).length} categories`;
  document.getElementById('locTypeBars').innerHTML = tSorted.map(([label, count]) => `
    <div class="loc-bar-row">
      <div class="loc-bar-label" title="${_locEsc(label)}">${_locEsc(label)}</div>
      <div class="loc-bar-track"><div class="loc-bar-fill" style="width:${(count/tMax*100).toFixed(1)}%;opacity:${label==='— No Type'?.3:1}"></div></div>
      <div class="loc-bar-count">${count}</div>
    </div>`).join('');
}

// ── Filter options ─────────────────────────────
function _locBuildFilterOptions() {
  const countries = [...new Set(LOC.records.map(r => r.fields.Country).filter(Boolean))].sort();
  const cf = document.getElementById('locCountryFilter');
  // LO-2: η κάρτα «Ελλιπή Στοιχεία» οδηγεί εδώ — μόνιμη επιλογή στο φίλτρο
  { const o = document.createElement('option'); o.value = '__missing'; o.textContent = '— Ελλιπή στοιχεία'; cf.appendChild(o); }
  countries.forEach(c => { const o = document.createElement('option'); o.value = o.textContent = c; cf.appendChild(o); });

  const tf = document.getElementById('locTypeFilter');
  ['Client Depot','Veroia Hub','Budapest Hub','Partner Warehouse','Office','Service / Workshop','Fuel Station','Custom Point']
    .forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; tf.appendChild(o); });
}

function _locFilterByCountry(country) {
  document.querySelectorAll('.loc-tab').forEach(x => x.classList.remove('active'));
  document.querySelector('.loc-tab[data-tab="list"]')?.classList.add('active');
  document.querySelectorAll('.loc-panel').forEach(p => p.style.display = 'none');
  document.getElementById('locPanel-list').style.display = 'block';
  document.getElementById('locCountryFilter').value = country;
  LOC.page = 1;
  _locApplyFilters();
}

// ── Filter + Sort ──────────────────────────────
function _locApplyFilters() {
  const q       = (document.getElementById('locSearch')?.value || '').toLowerCase().trim();
  const country = document.getElementById('locCountryFilter')?.value || '';
  const type    = (document.getElementById('locTypeFilter')?.value || '').toLowerCase();

  LOC.filtered = LOC.records.filter(r => {
    const f = r.fields;
    if (country === '__missing') { if (f.Country && f.City) return false; }
    else if (country && f.Country !== country) return false;
    if (type) {
      const t = (f.Type || '').toLowerCase();
      const isClient = type === 'client depot' && (t.startsWith('client') || t.startsWith('clinet'));
      if (!isClient && !t.includes(type)) return false;
    }
    if (q) {
      const hay = [f.Name, f.City, f.Country, f.Address].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  LOC.filtered.sort((a, b) => {
    const av = (a.fields[LOC.sortCol] || '').toString().toLowerCase();
    const bv = (b.fields[LOC.sortCol] || '').toString().toLowerCase();
    return av < bv ? -LOC.sortDir : av > bv ? LOC.sortDir : 0;
  });

  const el = document.getElementById('locCount');
  if (el) el.textContent = LOC.filtered.length.toLocaleString() + ' records';
  _locRenderTable();
}

// ── Table ──────────────────────────────────────
function _locRenderTable() {
  const start = (LOC.page - 1) * LOC.pageSize;
  const slice = LOC.filtered.slice(start, start + LOC.pageSize);
  const tbody = document.getElementById('locTbody');
  if (!tbody) return;

  if (!LOC.filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px;color:var(--text-dim)">No locations found</td></tr>`;
    document.getElementById('locPager').innerHTML = '';
    return;
  }

  tbody.innerHTML = slice.map(r => {
    const f = r.fields;
    const hasCoords = f.Latitude != null && f.Longitude != null;
    const mapsUrl = hasCoords ? `https://maps.google.com?q=${f.Latitude},${f.Longitude}` : '';
    return `<tr onclick="_locOpenCard('${r.id}')" style="cursor:pointer">
      <td style="font-weight:500;color:var(--text)" title="${_locEsc(f.Name||'')}">${_locEsc(f.Name || '—')}</td>
      <td>${_locEsc(f.City || '—')}</td>
      <td><span class="badge badge-blue" style="font-size:11px">${_locEsc(f.Country || '—')}</span></td>
      <td style="font-size:12px" title="${_locEsc(f.Type||'')}">${_locEsc(f.Type || '—')}</td>
      <td style="white-space:nowrap">
        ${hasCoords
          ? `<a href="${mapsUrl}" target="_blank" onclick="event.stopPropagation()" style="color:var(--text-mid);text-decoration:none" onmouseover="this.style.color='var(--navy-mid)'" onmouseout="this.style.color='var(--text-mid)'">${f.Latitude.toFixed(4)}, ${f.Longitude.toFixed(4)} ↗</a>`
          : '<span style="color:var(--text-dim)">—</span>'}
      </td>
      <td onclick="event.stopPropagation()" style="text-align:right;padding-right:14px">
        <button class="loc-act-btn" onclick="_locOpenEdit('${r.id}')" title="Edit">✏️</button>
        ${r.id === F.VEROIA_LOC
          ? '<span class="loc-act-btn" title="Κλειδωμένο — κλειδί της αλυσίδας Veroia Switch" style="cursor:default;opacity:0.5">🔒</span>'
          : `<button class="loc-act-btn del" onclick="_locConfirmDelete('${r.id}','${_locEsc(f.Name||'').replace(/'/g,"\\'")}') " title="Delete">🗑️</button>`}
      </td>
    </tr>`;
  }).join('');

  _locRenderPager();
}

function _locRenderPager() {
  const total = LOC.filtered.length;
  const pages = Math.ceil(total / LOC.pageSize);
  const pager = document.getElementById('locPager');
  if (!pager) return;
  if (pages <= 1) {
    pager.innerHTML = `<span style="font-size:12px;color:var(--text-dim)">${total.toLocaleString()} records</span>`;
    return;
  }
  const p = LOC.page;
  let html = `<span style="font-size:12px;color:var(--text-dim);margin-right:8px">${((p-1)*LOC.pageSize+1).toLocaleString()}–${Math.min(p*LOC.pageSize,total).toLocaleString()} of ${total.toLocaleString()}</span>`;
  html += `<button class="loc-pager-btn" onclick="_locGoPage(${p-1})" ${p===1?'disabled':''}>‹</button>`;
  const range = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - p) <= 2) range.push(i);
    else if (range[range.length - 1] !== '…') range.push('…');
  }
  range.forEach(pg => {
    if (pg === '…') html += `<span class="loc-pager-btn" style="cursor:default;opacity:.4;pointer-events:none">…</span>`;
    else html += `<button class="loc-pager-btn ${pg===p?'active':''}" onclick="_locGoPage(${pg})">${pg}</button>`;
  });
  html += `<button class="loc-pager-btn" onclick="_locGoPage(${p+1})" ${p===pages?'disabled':''}>›</button>`;
  pager.innerHTML = html;
}

function _locGoPage(p) {
  LOC.page = p;
  _locRenderTable();
  document.getElementById('locTableWrap')?.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Create / Edit ──────────────────────────────
function _locOpenCreate() {
  LOC.editingId = null;
  openModal('New Location', _locFormHTML({}),
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" id="locSaveBtn" onclick="_locSave()">Save Location</button>`);
  setTimeout(() => document.getElementById('locGeoBtn')?.addEventListener('click', _locGeocode), 50);
}

function _locOpenEdit(id) {
  const rec = LOC.records.find(r => r.id === id);
  if (!rec) return;
  LOC.editingId = id;
  openModal('Edit Location', _locFormHTML(rec.fields),
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" id="locSaveBtn" onclick="_locSave()">Save Changes</button>`);
  setTimeout(() => document.getElementById('locGeoBtn')?.addEventListener('click', _locGeocode), 50);
}

function _locFormHTML(f) {
  const countries = [...new Set(LOC.records.map(r => r.fields.Country).filter(Boolean))].sort();
  return `
<datalist id="locCDL">${countries.map(c => `<option value="${_locEsc(c)}">`).join('')}</datalist>
<datalist id="locTDL">${['Client Depot','Veroia Hub','Budapest Hub','Partner Warehouse','Office','Service / Workshop','Fuel Station','Custom Point'].map(t => `<option value="${t}">`).join('')}</datalist>
<div class="form-grid">
  <div class="form-field span-2">
    <label class="form-label">Name *</label>
    <input id="locF_name" class="form-input" placeholder="e.g. VERMION FRESH, Veroia" value="${_locEsc(f.Name||'')}">
  </div>
  <div class="form-field">
    <label class="form-label">Country</label>
    <input id="locF_country" class="form-input" list="locCDL" placeholder="e.g. Greece" value="${_locEsc(f.Country||'')}">
  </div>
  <div class="form-field">
    <label class="form-label">City</label>
    <input id="locF_city" class="form-input" placeholder="e.g. Veroia" value="${_locEsc(f.City||'')}">
  </div>
  <div class="form-field span-2">
    <label class="form-label">Address</label>
    <input id="locF_address" class="form-input" placeholder="Street, postal code…" value="${_locEsc(f.Address||'')}">
  </div>
  <div class="form-field span-2">
    <label class="form-label">Type</label>
    <input id="locF_type" class="form-input" list="locTDL" placeholder="e.g. Client Depot" value="${_locEsc(f.Type||'')}">
  </div>
  <div class="form-field">
    <label class="form-label">Ωράριο (Opening Hours)</label>
    <input id="locF_hours" class="form-input" placeholder="π.χ. 06:00–14:00" value="${_locEsc(f['Opening Hours']||'')}">
  </div>
  <div class="form-field">
    <label class="form-label">Ημέρες παράδοσης</label>
    <input id="locF_days" class="form-input" placeholder="π.χ. Δευ–Παρ" value="${_locEsc(f['Delivery Days']||'')}">
  </div>
  <div class="form-field">
    <label class="form-label">Latitude</label>
    <input id="locF_lat" class="form-input" type="number" step="any" placeholder="40.5211" value="${f.Latitude != null ? f.Latitude : ''}">
  </div>
  <div class="form-field">
    <label class="form-label">Longitude</label>
    <input id="locF_lon" class="form-input" type="number" step="any" placeholder="22.2033" value="${f.Longitude != null ? f.Longitude : ''}">
  </div>
  <div class="form-field span-2">
    <button class="btn btn-ghost" id="locGeoBtn" style="width:100%;justify-content:center">Auto-fill coordinates from Name + City</button>
  </div>
</div>`;
}

async function _locSave() {
  const name = document.getElementById('locF_name')?.value.trim();
  if (!name) { toast('Name is required', 'danger'); return; }
  const fields = { Name: name };
  const country = document.getElementById('locF_country')?.value.trim();
  const city    = document.getElementById('locF_city')?.value.trim();
  const address = document.getElementById('locF_address')?.value.trim();
  const type    = document.getElementById('locF_type')?.value.trim();
  const lat     = parseFloat(document.getElementById('locF_lat')?.value);
  const lon     = parseFloat(document.getElementById('locF_lon')?.value);
  if (country)    fields.Country   = country;
  if (city)       fields.City      = city;
  if (address)    fields.Address   = address;
  if (type)       fields.Type      = type;
  if (!isNaN(lat)) fields.Latitude  = lat;
  if (!isNaN(lon)) fields.Longitude = lon;
  const hours = document.getElementById('locF_hours')?.value.trim();
  const days  = document.getElementById('locF_days')?.value.trim();
  if (hours) fields['Opening Hours'] = hours;
  if (days)  fields['Delivery Days'] = days;

  const btn = document.getElementById('locSaveBtn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }
  try {
    const data = LOC.editingId
      ? await atPatch(TABLES.LOCATIONS, LOC.editingId, fields)
      : await atCreate(TABLES.LOCATIONS, fields);
    if (data.error) throw new Error(data.error.message || 'Save failed');
    if (LOC.editingId) {
      const idx = LOC.records.findIndex(r => r.id === LOC.editingId);
      if (idx !== -1) LOC.records[idx] = data;
    } else {
      LOC.records.unshift(data);
    }
    closeModal();
    _locRenderOverview();
    _locApplyFilters();
    // Ο χάρτης χτίζεται μία φορά και κρατά δικό του αντίγραφο των σημείων: χωρίς
    // αυτό, αλλαγή συντεταγμένων έδειχνε πράσινο toast ενώ η καρφίτσα έμενε στο
    // παλιό σημείο μέχρι reload — ο χρήστης θα νόμιζε ότι έσωσε λάθος.
    if (typeof _lmapRefresh === 'function') _lmapRefresh();
    toast(LOC.editingId ? 'Location updated ✓' : 'Location created ✓', 'success');
  } catch (e) {
    reportError('Save failed', e);
    if (btn) { btn.textContent = 'Save Location'; btn.disabled = false; }
  }
}

async function _locGeocode() {
  const name    = document.getElementById('locF_name')?.value.trim();
  const city    = document.getElementById('locF_city')?.value.trim();
  const country = document.getElementById('locF_country')?.value.trim();
  const q = [name, city, country].filter(Boolean).join(', ');
  if (!q) { toast('Enter name or city first', 'danger'); return; }
  const btn = document.getElementById('locGeoBtn');
  if (btn) { btn.textContent = 'Searching…'; btn.disabled = true; }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`);
    const d = await r.json();
    if (d[0]) {
      document.getElementById('locF_lat').value = parseFloat(d[0].lat).toFixed(6);
      document.getElementById('locF_lon').value = parseFloat(d[0].lon).toFixed(6);
      toast('Coordinates filled ✓', 'success');
    } else { toast('No result found', 'danger'); }
  } catch (e) { toast('Geocode failed', 'danger'); }
  finally { if (btn) { btn.textContent = 'Auto-fill coordinates from Name + City'; btn.disabled = false; } }
}

// ── Delete ─────────────────────────────────────
function _locConfirmDelete(id, name) {
  openModal('Delete Location?',
    `<div style="color:var(--text-mid);font-size:14px;line-height:1.7">
      Delete <strong style="color:var(--text)">${name}</strong>?<br>
      <span style="color:var(--danger);font-size:12px">Orders linked to this location will lose the reference.</span>
     </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="_locDoDelete('${id}')">Delete</button>`);
}

async function _locDoDelete(id) {
  // The Veroia cross-dock is not an ordinary location: the whole Veroia Switch
  // chain (ORDERS -> NAT_ORDERS -> GL -> CL -> RAMP) resolves through this one
  // record id. Deleting it was a single click that breaks national planning,
  // and nothing in the UI said so.
  // See docs/design/DEEP_AUDIT_2026-08-04/locations.md LO-4.
  if (id === F.VEROIA_LOC) {
    closeModal();
    toast('Το Veroia Cross-Dock δεν διαγράφεται — είναι κλειδί της αλυσίδας Veroia Switch', 'danger');
    return;
  }
  closeModal();
  try {
    const data = await atSoftDelete(TABLES.LOCATIONS, id);
    if (data.error) throw new Error(data.error.message || 'Delete failed');
    LOC.records = LOC.records.filter(r => r.id !== id);
    _locRenderOverview();
    _locApplyFilters();
    toast('Location deleted', 'success');
  } catch (e) { reportError('Delete failed', e); }
}

// ── Fetch ───────────────────────────────────────
async function _locFetchAll() {
  return atGetAll(TABLES.LOCATIONS, {
    // Opening Hours / Delivery Days: η φόρμα τα γράφει και ο Worker τα χαρτογραφεί,
    // αλλά έλειπαν από ΕΔΩ — και το _locOpenEdit δίνει στη φόρμα αυτό ακριβώς το
    // cached record. Αποτέλεσμα: το input πάντα κενό ακόμη κι όταν η βάση είχε τιμή,
    // και το `if (hours)` του _locSave δεν ξανάστελνε ποτέ τίποτα (owner 25/8).
    fields: ['Name','Country','City','Address','Type','Latitude','Longitude',
             'Opening Hours','Delivery Days']
  }, false);
}

// ── Utils ───────────────────────────────────────
function _locEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Κάρτα τοποθεσίας (Βήμα 4, owner 25/8 — χωρίς migration) ─────────────
// Κλικ σε γραμμή → πλαϊνό panel: Στοιχεία / Ιστορικό / Προϊόντα. Ο «ρόλος»
// του σημείου ΔΕΝ είναι χειροκίνητη ταξινόμηση — είναι μέτρηση με ημερομηνίες
// από τα order_stops (stop_type + γονιός στάσης). Μία φόρτωση πριν 3 μήνες
// δεν κάνει το σημείο «σημείο φόρτωσης»· γι' αυτό δίπλα σε κάθε μέτρηση
// γράφεται η τελευταία ημερομηνία. Το deleted_at φιλτράρεται από τον Worker
// στη γενική ανάγνωση (index.js: deleted_at=is.null).
const LOCC = { openId: null, tab: 'history', stops: null, orderById: {}, natById: {}, failed: false };

function _locCardHost() {
  let ov = document.getElementById('loccOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'loccOverlay'; ov.className = 'locc-overlay';
    ov.onclick = _locCloseCard;
    const p = document.createElement('div'); p.id = 'loccPanel'; p.className = 'locc-panel';
    const st = document.createElement('style'); st.id = 'loccStyles'; st.textContent = _locCardCss();
    document.body.append(st, ov, p);
  }
  return document.getElementById('loccPanel');
}

function _locCardCss() { return `
.locc-overlay{position:fixed;inset:0;background:rgba(11,25,41,.45);opacity:0;pointer-events:none;transition:opacity .2s;z-index:9000}
.locc-overlay.open{opacity:1;pointer-events:auto}
.locc-panel{position:fixed;top:0;right:-560px;width:560px;max-width:96vw;height:100vh;background:#fff;box-shadow:-8px 0 30px rgba(11,25,41,.25);transition:right .25s;z-index:9100;overflow-y:auto}
.locc-panel.open{right:0}
.locc-head{background:var(--navy-mid,#0B1929);color:#fff;padding:18px 22px}
.locc-head h2{font-family:'Syne',sans-serif;font-size:17px;margin:0 0 4px}
.locc-meta{font-size:12px;color:#94A3B8}
.locc-close{float:right;background:none;border:none;color:#94A3B8;font-size:18px;cursor:pointer}
.locc-role{font-size:12.5px;color:#E2E8F0;margin-top:8px;line-height:1.5}
.locc-tabs{display:flex;gap:0;border-bottom:1px solid rgba(0,0,0,.08);background:#F8FAFC}
.locc-tab{font-size:12.5px;font-weight:600;color:var(--text-dim);padding:10px 16px;cursor:pointer;border-bottom:2px solid transparent}
.locc-tab.active{color:var(--accent,#0284C7);border-bottom-color:var(--accent,#0284C7)}
.locc-sec{padding:14px 22px}
.locc-row{display:flex;justify-content:space-between;gap:14px;font-size:13px;padding:6px 0;border-bottom:1px dashed rgba(0,0,0,.06)}
.locc-row .k{color:var(--text-dim);flex-shrink:0}
.locc-row .v{text-align:right}
.locc-hrow{display:grid;grid-template-columns:78px 86px 1fr 60px;gap:10px;font-size:12.5px;padding:7px 0;border-bottom:1px dashed rgba(0,0,0,.06);align-items:baseline}
.locc-hrow .num{text-align:right;font-variant-numeric:tabular-nums}
.locc-stype{display:inline-block;padding:1px 7px;border-radius:5px;font-size:10px;font-weight:700;letter-spacing:.05em;border:1px solid rgba(11,25,41,.22);color:#334155;background:#fff;white-space:nowrap}
.locc-empty{font-size:13px;color:var(--text-dim);padding:18px 0}
.locc-note{font-size:12.5px;color:#8A5A00;background:#fff;border:1px solid #E6CE9E;border-radius:6px;padding:8px 12px;margin:10px 22px 0}
`; }

function _locCloseCard() {
  document.getElementById('loccOverlay')?.classList.remove('open');
  document.getElementById('loccPanel')?.classList.remove('open');
  LOCC.openId = null;
}

async function _locOpenCard(id) {
  const rec = LOC.records.find(r => r.id === id); if (!rec) return;
  const panel = _locCardHost();
  document.getElementById('loccOverlay').classList.add('open');
  panel.classList.add('open');
  LOCC.openId = id; LOCC.tab = 'history'; LOCC.stops = null; LOCC.failed = false;
  panel.innerHTML = _locCardShell(rec, '<div class="locc-empty">Φόρτωση ιστορικού…</div>');
  try {
    // Το φίλτρο linked-record δουλεύει εδώ: το ORDER STOPS έχει links block
    // στον Worker (Location) — δεν είναι η περίπτωση RAMP (422).
    const stops = await atGetAll(TABLES.ORDER_STOPS, {
      filterByFormula: `FIND("${id}", ARRAYJOIN({Location}, ","))>0`
    }, false);
    // Εμπλουτισμός γονιών σε ΠΑΡΤΙΔΕΣ (όχι Ν+1): μία cached λίστα ORDERS,
    // μία NATIONAL LOADS μόνο αν χρειάζεται.
    const orderRecs = new Set(stops.map(s => getLinkedId(s.fields['Parent Order'])).filter(Boolean));
    LOCC.orderById = {};
    if (orderRecs.size) {
      (await atGet(TABLES.ORDERS)).forEach(o => { if (orderRecs.has(o.id)) LOCC.orderById[o.id] = o; });
    }
    LOCC.natById = {};
    if (stops.some(s => getLinkedId(s.fields['Parent Nat Load']))) {
      (await atGet(TABLES.NAT_LOADS)).forEach(n => { LOCC.natById[n.id] = n; });
    }
    LOCC.stops = stops.sort((a, b) => String(b.fields['DateTime'] || '').localeCompare(String(a.fields['DateTime'] || '')));
  } catch (e) {
    // Ορατή αποτυχία — ποτέ κενή καρτέλα που μοιάζει με «δεν υπάρχει τίποτα».
    LOCC.failed = true; LOCC.stops = []; LOCC.failError = e.message;
  }
  if (LOCC.openId === id) panel.innerHTML = _locCardShell(rec, _locCardBody(rec));
}

function _locCardTab(t) {
  LOCC.tab = t;
  const rec = LOC.records.find(r => r.id === LOCC.openId); if (!rec) return;
  document.getElementById('loccPanel').innerHTML = _locCardShell(rec, _locCardBody(rec));
}

// Ο ρόλος από τα δεδομένα: μετρήσεις stop_type + γονιών, με τελευταία ημ/νία.
function _locRoleLine() {
  if (!LOCC.stops || LOCC.failed || !LOCC.stops.length) return '';
  const by = {};
  LOCC.stops.forEach(s => {
    const t = s.fields['Stop Type'] || '—';
    (by[t] = by[t] || { n: 0, last: '' }); by[t].n++;
    const d = String(s.fields['DateTime'] || '');
    if (d > by[t].last) by[t].last = d;
  });
  const lbl = { Loading: 'Φόρτωση', Unloading: 'Παράδοση', 'Cross-dock': 'Cross-dock' };
  const types = Object.entries(by).map(([t, v]) =>
    `${lbl[t] || t} ${v.n}×${v.last ? ' (τελ. ' + fmtDate(v.last) + ')' : ''}`).join(' · ');
  let intl = 0, natl = 0;
  LOCC.stops.forEach(s => {
    if (getLinkedId(s.fields['Parent Order'])) intl++;
    else if (getLinkedId(s.fields['Parent Nat Order']) || getLinkedId(s.fields['Parent Nat Load'])) natl++;
  });
  const mix = (intl || natl) ? ` — Διεθνείς ${intl}× · Εθνικές ${natl}×` : '';
  return `<div class="locc-role">${types}${mix}</div>`;
}

function _locCardShell(rec, body) {
  const f = rec.fields;
  const n = LOCC.stops ? LOCC.stops.length : null;
  const goodsN = LOCC.stops ? Object.keys(_locGoodsAgg()).length : null;
  return `
  <div class="locc-head"><button class="locc-close" onclick="_locCloseCard()">&times;</button>
    <h2>${_locEsc(f.Name || '—')}</h2>
    <div class="locc-meta">${_locEsc(f.City || '—')} · ${_locEsc(f.Country || '—')}${f.Address ? ' · ' + _locEsc(f.Address) : ''}</div>
    ${_locRoleLine()}</div>
  <div class="locc-tabs">
    <div class="locc-tab${LOCC.tab === 'history' ? ' active' : ''}" onclick="_locCardTab('history')">Ιστορικό${n != null ? ' (' + n + ')' : ''}</div>
    <div class="locc-tab${LOCC.tab === 'info' ? ' active' : ''}" onclick="_locCardTab('info')">Στοιχεία</div>
    <div class="locc-tab${LOCC.tab === 'goods' ? ' active' : ''}" onclick="_locCardTab('goods')">Προϊόντα${goodsN ? ' (' + goodsN + ')' : ''}</div>
  </div>
  ${body}`;
}

function _locCardBody(rec) {
  if (LOCC.failed) {
    return `<div class="locc-note">Το ιστορικό δεν φόρτωσε (${_locEsc(LOCC.failError || 'σφάλμα')}) — αυτό ΔΕΝ σημαίνει ότι δεν υπάρχουν κινήσεις.
      <button class="btn" style="margin-left:8px" onclick="_locOpenCard('${rec.id}')">Δοκίμασε ξανά</button></div>`;
  }
  if (LOCC.tab === 'info') return _locCardInfo(rec);
  if (LOCC.tab === 'goods') return _locCardGoods();
  return _locCardHistory();
}

function _locCardInfo(rec) {
  const f = rec.fields;
  const miss = '<span style="color:var(--text-dim)">— δεν έχει καταχωρηθεί</span>';
  const maps = (f.Latitude != null && f.Longitude != null)
    ? `<a href="https://maps.google.com?q=${f.Latitude},${f.Longitude}" target="_blank">${f.Latitude.toFixed(4)}, ${f.Longitude.toFixed(4)}</a>` : miss;
  const row = (k, v) => `<div class="locc-row"><span class="k">${k}</span><span class="v">${v || miss}</span></div>`;
  return `<div class="locc-sec">
    ${row('Διεύθυνση', f.Address && _locEsc(f.Address))}
    ${row('Πόλη', f.City && _locEsc(f.City))}
    ${row('Χώρα', f.Country && _locEsc(f.Country))}
    ${row('Συντεταγμένες', maps)}
    ${row('Ωράριο', f['Opening Hours'] && _locEsc(f['Opening Hours']))}
    ${row('Ημέρες παράδοσης', f['Delivery Days'] && _locEsc(f['Delivery Days']))}
    ${row('Τύπος (ελεύθερο πεδίο)', f.Type && _locEsc(f.Type))}
  </div>`;
}

function _locStopClient(s) {
  const cid = getLinkedId(s.fields['Client at Stop']);
  if (cid) {
    const c = getRefClients().find(x => x.id === cid);
    if (c) return c.fields['Company Name'] || '';
  }
  const o = LOCC.orderById[getLinkedId(s.fields['Parent Order'])];
  if (o) {
    const c = getRefClients().find(x => x.id === getLinkedId(o.fields['Client']));
    if (c) return c.fields['Company Name'] || '';
  }
  return '';
}

function _locCardHistory() {
  if (!LOCC.stops.length) {
    // Ρητό κενό (αρχή 1): 111/1.185 τοποθεσίες έχουν ιστορικό — οι υπόλοιπες
    // ΔΕΝ πρέπει να μοιάζουν με σφάλμα.
    return `<div class="locc-sec"><div class="locc-empty">Καμία κίνηση καταγεγραμμένη για αυτή την τοποθεσία.
      Το ιστορικό ξεκινά με την πρώτη στάση παραγγελίας που θα τη δηλώσει σημείο φόρτωσης ή παράδοσης.</div></div>`;
  }
  const lbl = { Loading: 'ΦΟΡΤΩΣΗ', Unloading: 'ΠΑΡΑΔΟΣΗ', 'Cross-dock': 'CROSS-DOCK' };
  const rows = LOCC.stops.map(s => {
    const f = s.fields;
    const o = LOCC.orderById[getLinkedId(f['Parent Order'])];
    const nl = LOCC.natById[getLinkedId(f['Parent Nat Load'])];
    const ref = (o && o.fields['Reference']) || f['Reference'] || (nl && nl.fields['Name']) || '—';
    const client = _locStopClient(s);
    const truckRec = o && getLinkedId(o.fields['Truck']);
    const truck = truckRec ? (getRefTrucks().find(t => t.id === truckRec) || {}).fields : null;
    const plate = truck ? (truck['License Plate'] || truck['Plate'] || '') : '';
    const who = [client, plate].filter(Boolean).join(' · ');
    return `<div class="locc-hrow">
      <span style="color:var(--text-dim);font-variant-numeric:tabular-nums">${f['DateTime'] ? fmtDate(f['DateTime']) : '—'}</span>
      <span><span class="locc-stype">${lbl[f['Stop Type']] || _locEsc(f['Stop Type'] || '—')}</span></span>
      <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_locEsc(ref)}${who ? ' · ' + _locEsc(who) : ''}">${_locEsc(ref)}${who ? ' <span style="color:var(--text-dim)">· ' + _locEsc(who) + '</span>' : ''}</span>
      <span class="num">${f['Pallets'] != null ? f['Pallets'] + ' pal' : '—'}</span>
    </div>`;
  }).join('');
  return `<div class="locc-sec">${rows}</div>`;
}

function _locGoodsAgg() {
  const agg = {};
  (LOCC.stops || []).forEach(s => {
    const g = String(s.fields['Goods'] || '').trim();
    if (!g) return;
    const k = g.toUpperCase();
    (agg[k] = agg[k] || { name: g, n: 0, load: 0, unload: 0 });
    agg[k].n++;
    if (s.fields['Stop Type'] === 'Loading') agg[k].load++;
    if (s.fields['Stop Type'] === 'Unloading') agg[k].unload++;
  });
  return agg;
}

function _locCardGoods() {
  const agg = Object.values(_locGoodsAgg()).sort((a, b) => b.n - a.n);
  if (!agg.length) {
    return `<div class="locc-sec"><div class="locc-empty">Κανένα εμπόρευμα καταγεγραμμένο στις στάσεις αυτής της τοποθεσίας.
      Συμπληρώνεται από το πεδίο «Εμπόρευμα» των στάσεων — όχι χειροκίνητα εδώ.</div></div>`;
  }
  const rows = agg.map(g => `<div class="locc-row"><span>${_locEsc(g.name)}</span>
    <span class="v" style="color:var(--text-dim);font-variant-numeric:tabular-nums">${g.n}×${g.load ? ' · φορτώνεται ' + g.load + '×' : ''}${g.unload ? ' · παραδίδεται ' + g.unload + '×' : ''}</span></div>`).join('');
  return `<div class="locc-sec">${rows}</div>`;
}
