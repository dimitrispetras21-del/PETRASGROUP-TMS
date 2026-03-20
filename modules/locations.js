// ═══════════════════════════════════════════════
// MODULE — LOCATIONS
// CRUD + Overview for LOCATIONS master table
// ═══════════════════════════════════════════════

// ── State ─────────────────────────────────────
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

// ── Entry point (called by router) ─────────────
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
    _locApplyFilters();
    _locBuildFilterOptions();
  } catch (e) {
    c.innerHTML = showError('Failed to load locations: ' + e.message);
  }
}

// ── Shell HTML ─────────────────────────────────
function _locShell() {
  return `
<div class="page-header">
  <div>
    <div class="page-title">Locations</div>
    <div class="page-sub" id="locSub">Loading…</div>
  </div>
  <button class="btn btn-primary" onclick="_locOpenCreate()">+ New Location</button>
</div>

<!-- Tabs -->
<div class="loc-tabs" id="locTabs">
  <div class="loc-tab active" data-tab="overview">📊 Overview</div>
  <div class="loc-tab" data-tab="list">📋 All Locations</div>
</div>

<!-- Overview Panel -->
<div id="locPanel-overview" class="loc-panel active">
  <div class="kpi-grid" id="locKpis"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;" id="locChartsGrid">
    <div class="table-wrap">
      <div style="padding:14px 18px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);border-bottom:1px solid var(--border)">
        By Country <span style="color:var(--text-mid);font-family:monospace" id="locCountryLabel"></span>
      </div>
      <div id="locCountryBars" style="padding:6px 0;max-height:400px;overflow-y:auto"></div>
    </div>
    <div class="table-wrap">
      <div style="padding:14px 18px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);border-bottom:1px solid var(--border)">
        By Category <span style="color:var(--text-mid);font-family:monospace" id="locTypeLabel"></span>
      </div>
      <div id="locTypeBars" style="padding:6px 0;max-height:400px;overflow-y:auto"></div>
    </div>
  </div>
</div>

<!-- List Panel -->
<div id="locPanel-list" class="loc-panel" style="display:none">
  <div class="table-wrap">
    <div class="table-toolbar">
      <input class="search-input" id="locSearch" placeholder="Search name, city, address…" style="max-width:300px">
      <select class="search-input" id="locCountryFilter" style="max-width:160px;flex:none">
        <option value="">All Countries</option>
      </select>
      <select class="search-input" id="locTypeFilter" style="max-width:180px;flex:none">
        <option value="">All Types</option>
      </select>
      <span style="margin-left:auto;font-size:12px;color:var(--text-dim)" id="locCount"></span>
    </div>
    <table id="locTable">
      <thead>
        <tr>
          <th class="loc-th" data-col="Name" style="cursor:pointer">Name ↕</th>
          <th class="loc-th" data-col="City" style="cursor:pointer">City ↕</th>
          <th class="loc-th" data-col="Country" style="cursor:pointer">Country ↕</th>
          <th class="loc-th" data-col="Type">Type</th>
          <th class="loc-th">Coordinates</th>
          <th class="loc-th" style="width:80px"></th>
        </tr>
      </thead>
      <tbody id="locTbody"></tbody>
    </table>
    <div id="locPager" style="display:flex;align-items:center;gap:6px;padding:12px 18px;border-top:1px solid var(--border);justify-content:flex-end"></div>
  </div>
</div>

<style>
.loc-tabs { display:flex; gap:0; margin-bottom:20px; border-bottom:2px solid var(--border); }
.loc-tab  { padding:10px 20px; font-size:13px; font-weight:500; color:var(--text-dim);
            cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-2px; transition:all .15s; }
.loc-tab:hover { color:var(--text); }
.loc-tab.active { color:var(--text); border-bottom-color:var(--accent); }
.loc-panel { }
.loc-bar-row { display:flex; align-items:center; padding:6px 18px; gap:12px; cursor:pointer; transition:background .1s; }
.loc-bar-row:hover { background:var(--bg-hover); }
.loc-bar-label { min-width:140px; max-width:180px; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.loc-bar-track { flex:1; height:6px; background:var(--bg); border-radius:3px; overflow:hidden; border:1px solid var(--border); }
.loc-bar-fill  { height:100%; background:var(--accent); border-radius:3px; transition:width .4s ease; }
.loc-bar-count { font-family:monospace; font-size:12px; color:var(--text-dim); min-width:36px; text-align:right; }
.loc-pager-btn { background:var(--bg); border:1px solid var(--border); border-radius:5px; padding:4px 10px;
                  font-size:12px; color:var(--text-mid); cursor:pointer; transition:all .12s; font-family:monospace; }
.loc-pager-btn:hover:not(:disabled) { border-color:var(--accent); color:var(--accent); }
.loc-pager-btn.active { background:var(--accent); color:#fff; border-color:var(--accent); font-weight:700; }
.loc-pager-btn:disabled { opacity:.3; cursor:not-allowed; }
.loc-act-btn { background:none; border:none; cursor:pointer; padding:4px 7px; border-radius:5px;
               font-size:13px; color:var(--text-dim); transition:all .12s; }
.loc-act-btn:hover.edit { background:rgba(11,25,41,.07); color:var(--accent); }
.loc-act-btn:hover.del  { background:var(--danger-bg); color:var(--danger); }
</style>
`;
}

// ── Tab binding ─────────────────────────────────
function _locBindEvents() {
  document.querySelectorAll('.loc-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.loc-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const name = t.dataset.tab;
      document.querySelectorAll('.loc-panel').forEach(p => p.style.display = 'none');
      document.getElementById('locPanel-' + name).style.display = 'block';
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

// ── Overview ───────────────────────────────────
function _locRenderOverview() {
  const recs = LOC.records.map(r => r.fields);
  const total = recs.length;
  const countries = [...new Set(recs.map(r => r.Country).filter(Boolean))];
  const withCoords = recs.filter(r => r.Latitude && r.Longitude).length;
  const missing = recs.filter(r => !r.Country || !r.City).length;

  document.getElementById('locSub').textContent =
    `${total.toLocaleString()} locations · ${countries.length} countries · ${withCoords.toLocaleString()} with coordinates`;

  // KPI Cards
  document.getElementById('locKpis').innerHTML = [
    { label: 'Total Locations', value: total.toLocaleString(), delta: '' },
    { label: 'Countries',       value: countries.length,        delta: '' },
    { label: 'With Coordinates',value: withCoords.toLocaleString(), delta: `${Math.round(withCoords/total*100)}% coverage` },
    { label: 'Missing Data',    value: missing.toLocaleString(), delta: 'No country or city' },
  ].map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      ${k.delta ? `<div class="kpi-delta">${k.delta}</div>` : ''}
    </div>`).join('');

  // Country bars
  const cCounts = {};
  recs.forEach(r => { const k = r.Country || '— Unknown'; cCounts[k] = (cCounts[k]||0)+1; });
  const cSorted = Object.entries(cCounts).sort((a,b) => b[1]-a[1]).slice(0,18);
  const cMax = cSorted[0]?.[1] || 1;
  document.getElementById('locCountryLabel').textContent = countries.length;
  document.getElementById('locCountryBars').innerHTML = cSorted.map(([label, count]) => `
    <div class="loc-bar-row" onclick="_locFilterByCountry('${label.replace(/'/g,"\\'")}')">
      <div class="loc-bar-label" title="${_locEsc(label)}">${_locEsc(label)}</div>
      <div class="loc-bar-track"><div class="loc-bar-fill" style="width:${(count/cMax*100).toFixed(1)}%"></div></div>
      <div class="loc-bar-count">${count}</div>
    </div>`).join('');

  // Type bars — normalize noisy CLIENT: entries
  const tCounts = {};
  recs.forEach(r => {
    let t = (r.Type || '').trim();
    if (!t) t = '— No Type';
    else if (/^(CLIENT|CLINET|client)/i.test(t)) t = 'Client Location';
    else if (/^PARTNER/i.test(t)) t = 'Partner Warehouse';
    else if (/ΣΥΝΕΡΓΕΙ/i.test(t) || /^SERVICE/i.test(t)) t = 'Service / Workshop';
    else if (/ΚΑΥΣΙΜ|ΠΕΤΡΕΛ|FUEL/i.test(t)) t = 'Fuel Station';
    else if (/^NOTES/i.test(t)) t = 'Notes / Misc';
    else if (t === 'Client Depot')       t = 'Client Depot';
    else if (t === 'Veroia Hub')         t = 'Veroia Hub';
    else if (t === 'Budapest Hub')       t = 'Budapest Hub';
    tCounts[t] = (tCounts[t]||0)+1;
  });
  const tSorted = Object.entries(tCounts).sort((a,b) => b[1]-a[1]).slice(0,12);
  const tMax = tSorted[0]?.[1] || 1;
  document.getElementById('locTypeLabel').textContent = Object.keys(tCounts).length;
  document.getElementById('locTypeBars').innerHTML = tSorted.map(([label, count]) => `
    <div class="loc-bar-row">
      <div class="loc-bar-label" title="${_locEsc(label)}">${_locEsc(label)}</div>
      <div class="loc-bar-track"><div class="loc-bar-fill" style="width:${(count/tMax*100).toFixed(1)}%;opacity:${label==='— No Type'?.4:1}"></div></div>
      <div class="loc-bar-count">${count}</div>
    </div>`).join('');
}

// ── Filter dropdowns ───────────────────────────
function _locBuildFilterOptions() {
  const countries = [...new Set(LOC.records.map(r => r.fields.Country).filter(Boolean))].sort();
  const cf = document.getElementById('locCountryFilter');
  countries.forEach(c => { const o = document.createElement('option'); o.value = o.textContent = c; cf.appendChild(o); });

  const tf = document.getElementById('locTypeFilter');
  ['Client Depot','Veroia Hub','Budapest Hub','Partner Warehouse','Office','Service / Workshop','Fuel Station','Custom Point'].forEach(t => {
    const o = document.createElement('option'); o.value = t; o.textContent = t; tf.appendChild(o);
  });
}

function _locFilterByCountry(country) {
  // Switch to list tab
  document.querySelectorAll('.loc-tab').forEach(x => x.classList.remove('active'));
  document.querySelector('.loc-tab[data-tab="list"]').classList.add('active');
  document.querySelectorAll('.loc-panel').forEach(p => p.style.display = 'none');
  document.getElementById('locPanel-list').style.display = 'block';
  document.getElementById('locCountryFilter').value = country;
  LOC.page = 1;
  _locApplyFilters();
}

// ── Filter + Sort ──────────────────────────────
function _locApplyFilters() {
  const q = (document.getElementById('locSearch')?.value || '').toLowerCase().trim();
  const country = document.getElementById('locCountryFilter')?.value || '';
  const type = (document.getElementById('locTypeFilter')?.value || '').toLowerCase();

  LOC.filtered = LOC.records.filter(r => {
    const f = r.fields;
    if (country && f.Country !== country) return false;
    if (type) {
      const t = (f.Type || '').toLowerCase();
      if (type === 'client depot' && (t.startsWith('client') || t.startsWith('clinet'))) {
        // match
      } else if (!t.includes(type)) return false;
    }
    if (q) {
      const hay = [f.Name, f.City, f.Country, f.Address].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Sort
  const col = LOC.sortCol;
  LOC.filtered.sort((a, b) => {
    const av = (a.fields[col] || '').toString().toLowerCase();
    const bv = (b.fields[col] || '').toString().toLowerCase();
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
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-dim)">No locations found</td></tr>`;
    document.getElementById('locPager').innerHTML = '';
    return;
  }

  tbody.innerHTML = slice.map(r => {
    const f = r.fields;
    const hasCoords = f.Latitude != null && f.Longitude != null;
    const mapsUrl = hasCoords ? `https://maps.google.com?q=${f.Latitude},${f.Longitude}` : '';
    return `<tr>
      <td style="font-weight:500;color:var(--text);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_locEsc(f.Name||'')}">${_locEsc(f.Name || '—')}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_locEsc(f.City || '—')}</td>
      <td><span class="badge badge-blue" style="font-family:monospace;font-size:11px">${_locEsc(f.Country || '—')}</span></td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--text-dim)" title="${_locEsc(f.Type||'')}">${_locEsc(f.Type || '—')}</td>
      <td style="font-family:monospace;font-size:11px;white-space:nowrap">
        ${hasCoords
          ? `<a href="${mapsUrl}" target="_blank" style="color:var(--accent);text-decoration:none;opacity:.7" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.7">${f.Latitude.toFixed(4)}, ${f.Longitude.toFixed(4)} ↗</a>`
          : '<span style="color:var(--text-dim)">—</span>'}
      </td>
      <td onclick="event.stopPropagation()">
        <button class="loc-act-btn edit" onclick="_locOpenEdit('${r.id}')" title="Edit">✏️</button>
        <button class="loc-act-btn del"  onclick="_locConfirmDelete('${r.id}','${_locEsc(f.Name||'').replace(/'/g,"\\'")}') " title="Delete">🗑️</button>
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
  if (pages <= 1) { pager.innerHTML = ''; return; }

  const p = LOC.page;
  let html = `<span style="font-size:12px;color:var(--text-dim);margin-right:8px">${((p-1)*LOC.pageSize+1)}–${Math.min(p*LOC.pageSize,total)} of ${total.toLocaleString()}</span>`;
  html += `<button class="loc-pager-btn" onclick="_locGoPage(${p-1})" ${p===1?'disabled':''}>‹</button>`;

  const range = [];
  for (let i=1; i<=pages; i++) {
    if (i===1||i===pages||Math.abs(i-p)<=2) range.push(i);
    else if (range[range.length-1]!=='…') range.push('…');
  }
  range.forEach(pg => {
    if (pg==='…') html += `<span class="loc-pager-btn" style="cursor:default;opacity:.4">…</span>`;
    else html += `<button class="loc-pager-btn ${pg===p?'active':''}" onclick="_locGoPage(${pg})">${pg}</button>`;
  });
  html += `<button class="loc-pager-btn" onclick="_locGoPage(${p+1})" ${p===pages?'disabled':''}>›</button>`;
  pager.innerHTML = html;
}

function _locGoPage(p) {
  LOC.page = p;
  _locRenderTable();
  document.getElementById('locTable')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Create / Edit Modal ────────────────────────
function _locOpenCreate() {
  LOC.editingId = null;
  openModal(
    'New Location',
    _locFormHTML({}),
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" id="locSaveBtn" onclick="_locSave()">Save Location</button>`
  );
  document.getElementById('locGeoBtn')?.addEventListener('click', _locGeocode);
}

function _locOpenEdit(id) {
  const rec = LOC.records.find(r => r.id === id);
  if (!rec) return;
  LOC.editingId = id;
  openModal(
    'Edit Location',
    _locFormHTML(rec.fields),
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" id="locSaveBtn" onclick="_locSave()">Save Changes</button>`
  );
  document.getElementById('locGeoBtn')?.addEventListener('click', _locGeocode);
}

function _locFormHTML(f) {
  const countries = [...new Set(LOC.records.map(r => r.fields.Country).filter(Boolean))].sort();
  const cDL = countries.map(c => `<option value="${_locEsc(c)}">`).join('');
  const typesDL = ['Client Depot','Veroia Hub','Budapest Hub','Partner Warehouse','Office','Service / Workshop','Fuel Station','Custom Point','PARTNER']
    .map(t => `<option value="${t}">`).join('');
  return `
<datalist id="locCDL">${cDL}</datalist>
<datalist id="locTDL">${typesDL}</datalist>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
  <div style="grid-column:1/-1">
    <label style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);display:block;margin-bottom:5px">Name *</label>
    <input id="locF_name" class="search-input" style="max-width:100%;width:100%" placeholder="e.g. VERMION FRESH, Veroia" value="${_locEsc(f.Name||'')}">
  </div>
  <div>
    <label style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);display:block;margin-bottom:5px">Country</label>
    <input id="locF_country" class="search-input" style="max-width:100%;width:100%" list="locCDL" placeholder="e.g. Greece" value="${_locEsc(f.Country||'')}">
  </div>
  <div>
    <label style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);display:block;margin-bottom:5px">City</label>
    <input id="locF_city" class="search-input" style="max-width:100%;width:100%" placeholder="e.g. Veroia" value="${_locEsc(f.City||'')}">
  </div>
  <div style="grid-column:1/-1">
    <label style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);display:block;margin-bottom:5px">Address</label>
    <input id="locF_address" class="search-input" style="max-width:100%;width:100%" placeholder="Street, postal code…" value="${_locEsc(f.Address||'')}">
  </div>
  <div style="grid-column:1/-1">
    <label style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);display:block;margin-bottom:5px">Type</label>
    <input id="locF_type" class="search-input" style="max-width:100%;width:100%" list="locTDL" placeholder="e.g. Client Depot" value="${_locEsc(f.Type||'')}">
  </div>
  <div>
    <label style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);display:block;margin-bottom:5px">Latitude</label>
    <input id="locF_lat" class="search-input" style="max-width:100%;width:100%" type="number" step="any" placeholder="40.5211" value="${f.Latitude != null ? f.Latitude : ''}">
  </div>
  <div>
    <label style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);display:block;margin-bottom:5px">Longitude</label>
    <input id="locF_lon" class="search-input" style="max-width:100%;width:100%" type="number" step="any" placeholder="22.2033" value="${f.Longitude != null ? f.Longitude : ''}">
  </div>
  <div style="grid-column:1/-1">
    <button class="btn btn-ghost" id="locGeoBtn" style="width:100%">🌍 Auto-fill coordinates from Name + City</button>
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
  if (country)  fields.Country   = country;
  if (city)     fields.City      = city;
  if (address)  fields.Address   = address;
  if (type)     fields.Type      = type;
  if (!isNaN(lat)) fields.Latitude  = lat;
  if (!isNaN(lon)) fields.Longitude = lon;

  const saveBtn = document.getElementById('locSaveBtn');
  if (saveBtn) { saveBtn.textContent = 'Saving…'; saveBtn.disabled = true; }

  try {
    const url = LOC.editingId
      ? `https://api.airtable.com/v0/${AT_BASE}/${TABLES.LOCATIONS}/${LOC.editingId}`
      : `https://api.airtable.com/v0/${AT_BASE}/${TABLES.LOCATIONS}`;
    const method = LOC.editingId ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
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
    if (saveBtn) { saveBtn.textContent = 'Save Location'; saveBtn.disabled = false; }
  }
}

async function _locGeocode() {
  const name    = document.getElementById('locF_name')?.value.trim();
  const city    = document.getElementById('locF_city')?.value.trim();
  const country = document.getElementById('locF_country')?.value.trim();
  const q = [name, city, country].filter(Boolean).join(', ');
  if (!q) { toast('Enter name or city first', 'danger'); return; }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`);
    const d = await r.json();
    if (d[0]) {
      document.getElementById('locF_lat').value = parseFloat(d[0].lat).toFixed(6);
      document.getElementById('locF_lon').value = parseFloat(d[0].lon).toFixed(6);
      toast('Coordinates filled ✓', 'success');
    } else {
      toast('No geocode result found', 'danger');
    }
  } catch (e) { toast('Geocode failed', 'danger'); }
}

// ── Delete ─────────────────────────────────────
function _locConfirmDelete(id, name) {
  openModal(
    'Delete Location?',
    `<p style="color:var(--text-mid);font-size:14px;line-height:1.6">
      Delete <strong>${name}</strong>?<br>
      <span style="color:var(--danger);font-size:12px">Orders linked to this location will lose the reference.</span>
     </p>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="_locDoDelete('${id}')">Delete</button>`
  );
}

async function _locDoDelete(id) {
  closeModal();
  try {
    const res = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${TABLES.LOCATIONS}/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + AT_TOKEN }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Delete failed');
    LOC.records = LOC.records.filter(r => r.id !== id);
    _locRenderOverview();
    _locApplyFilters();
    toast('Location deleted', 'success');
  } catch (e) {
    toast('Delete failed: ' + e.message, 'danger');
  }
}

// ── Data fetch ──────────────────────────────────
async function _locFetchAll() {
  const records = [];
  let offset = null;
  const fields = ['Name','Country','City','Address','Type','Latitude','Longitude'];
  const fp = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  do {
    const url = `https://api.airtable.com/v0/${AT_BASE}/${TABLES.LOCATIONS}?${fp}&pageSize=100${offset ? '&offset='+offset : ''}`;
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
