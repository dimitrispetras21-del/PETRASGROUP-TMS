// ═══════════════════════════════════════════════
// MODULE — LOCATIONS v2
// ═══════════════════════════════════════════════

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
    c.innerHTML = showError('Failed to load locations: ' + e.message);
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
  <div class="loc-tab active" data-tab="overview">Overview</div>
  <div class="loc-tab" data-tab="list">All Locations</div>
</div>

<!-- Overview Panel -->
<div id="locPanel-overview" class="loc-panel">
  <div class="kpi-grid" id="locKpis"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div class="table-wrap" style="overflow:hidden">
      <div style="padding:12px 18px;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--navy-mid);border-bottom:2px solid var(--navy-mid);display:flex;align-items:center;gap:8px;background:rgba(11,25,41,0.03)">
        By Country <span style="font-size:12px;font-weight:400;letter-spacing:0;color:var(--text-mid);text-transform:none" id="locCountryLabel"></span>
      </div>
      <div id="locCountryBars" style="overflow-y:auto;max-height:380px;scrollbar-width:thin;scrollbar-color:#CBD5E0 transparent"></div>
    </div>
    <div class="table-wrap" style="overflow:hidden">
      <div style="padding:12px 18px;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--navy-mid);border-bottom:2px solid var(--navy-mid);display:flex;align-items:center;gap:8px;background:rgba(11,25,41,0.03)">
        By Category <span style="font-size:12px;font-weight:400;letter-spacing:0;color:var(--text-mid);text-transform:none" id="locTypeLabel"></span>
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
          <option value="">All Countries</option>
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

<style>
.loc-tab { padding:10px 20px;font-size:13px;font-weight:500;color:var(--text-dim);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .15s,border-color .15s;display:inline-block; }
.loc-tab:hover { color:var(--text); }
.loc-tab.active { color:var(--navy-mid);border-bottom-color:var(--navy-mid);font-weight:600; }
.loc-bar-row { display:flex;align-items:center;padding:7px 18px;gap:12px; }
.loc-bar-row.clickable { cursor:pointer;transition:background .1s; }
.loc-bar-row.clickable:hover { background:var(--bg-hover); }
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
#locTable tbody tr { cursor:default !important; }
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
    `${total.toLocaleString()} locations · ${countries.length} countries · ${withCoords.toLocaleString()} with coordinates`;

  document.getElementById('locKpis').innerHTML = [
    { label: 'Total Locations',  value: total.toLocaleString(),     delta: '' },
    { label: 'Countries',        value: countries.length,           delta: '' },
    { label: 'With Coordinates', value: withCoords.toLocaleString(),delta: `${Math.round(withCoords/total*100)}% coverage` },
    { label: 'Missing Data',     value: missing.toLocaleString(),   delta: 'No country or city' },
  ].map(k => `
    <div class="kpi-card" style="cursor:default">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      ${k.delta ? `<div class="kpi-delta">${k.delta}</div>` : ''}
    </div>`).join('');

  // Country bars — clickable drill-down
  const cCounts = {};
  recs.forEach(r => { const k = r.Country || '— Unknown'; cCounts[k] = (cCounts[k]||0)+1; });
  const cSorted = Object.entries(cCounts).sort((a,b) => b[1]-a[1]).slice(0,18);
  const cMax = cSorted[0]?.[1] || 1;
  document.getElementById('locCountryLabel').textContent = `${countries.length} countries`;
  document.getElementById('locCountryBars').innerHTML =
    cSorted.map(([label, count]) => `
      <div class="loc-bar-row clickable" onclick="_locFilterByCountry('${label.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">
        <div class="loc-bar-label" title="${_locEsc(label)}">${_locEsc(label)}</div>
        <div class="loc-bar-track"><div class="loc-bar-fill" style="width:${(count/cMax*100).toFixed(1)}%"></div></div>
        <div class="loc-bar-count">${count}</div>
      </div>`).join('') +
    `<div style="padding:8px 18px 12px;font-size:11px;color:var(--text-dim)">Click a country to filter list →</div>`;

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
    if (country && f.Country !== country) return false;
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
    return `<tr>
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
        <button class="loc-act-btn del" onclick="_locConfirmDelete('${r.id}','${_locEsc(f.Name||'').replace(/'/g,"\\'")}') " title="Delete">🗑️</button>
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

  const btn = document.getElementById('locSaveBtn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }
  try {
    const url = LOC.editingId
      ? `https://api.airtable.com/v0/${AT_BASE}/${TABLES.LOCATIONS}/${LOC.editingId}`
      : `https://api.airtable.com/v0/${AT_BASE}/${TABLES.LOCATIONS}`;
    const res = await fetch(url, {
      method: LOC.editingId ? 'PATCH' : 'POST',
      headers: { Authorization: 'Bearer ' + AT_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Save failed');
    if (LOC.editingId) {
      const idx = LOC.records.findIndex(r => r.id === LOC.editingId);
      if (idx !== -1) LOC.records[idx] = data;
    } else {
      LOC.records.unshift(data);
    }
    closeModal();
    _locRenderOverview();
    _locApplyFilters();
    toast(LOC.editingId ? 'Location updated ✓' : 'Location created ✓', 'success');
  } catch (e) {
    toast('Error: ' + e.message, 'danger');
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
  closeModal();
  try {
    const res = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${TABLES.LOCATIONS}/${id}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + AT_TOKEN }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Delete failed');
    LOC.records = LOC.records.filter(r => r.id !== id);
    _locRenderOverview();
    _locApplyFilters();
    toast('Location deleted', 'success');
  } catch (e) { toast('Delete failed: ' + e.message, 'danger'); }
}

// ── Fetch ───────────────────────────────────────
async function _locFetchAll() {
  const records = [];
  let offset = null;
  const fp = ['Name','Country','City','Address','Type','Latitude','Longitude'].map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  do {
    const url = `https://api.airtable.com/v0/${AT_BASE}/${TABLES.LOCATIONS}?${fp}&pageSize=100${offset?'&offset='+offset:''}`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + AT_TOKEN } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'API error');
    records.push(...d.records);
    offset = d.offset || null;
  } while (offset);
  return records;
}

// ── Utils ───────────────────────────────────────
function _locEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
