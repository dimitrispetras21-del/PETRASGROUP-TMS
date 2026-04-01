// ═══════════════════════════════════════════════
// CORE — FORM HELPERS
// Shared location/client dropdown widgets for order forms
// Depends on: utils.js (escapeHtml), api.js (atGet, atGetAll)
// ═══════════════════════════════════════════════

// ─── Shared caches (used by both intl + natl modules) ──
const _fhLocationsArr = [];  // [{id,label}]
const _fhLocationsMap = {};  // recId → label
const _fhClientsMap   = {};  // recId → name
const _fhClientCache  = {};  // query → [{id,label}]

/**
 * Load all locations into shared cache (idempotent)
 */
async function fhLoadLocations() {
  if (_fhLocationsArr.length) return;
  const locs = await atGet(TABLES.LOCATIONS);
  const sorted = locs
    .map(r => ({
      id: r.id,
      label: [r.fields['Name'], r.fields['City'], r.fields['Country']].filter(Boolean).join(', ')
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  // Push into shared array (don't reassign — other refs may hold it)
  sorted.forEach(l => {
    _fhLocationsArr.push(l);
    _fhLocationsMap[l.id] = l.label;
  });
}

/**
 * Search clients by name (cached, debounced externally)
 */
async function fhSearchClients(q) {
  if (!q || q.length < 2) return [];
  const key = q.toLowerCase();
  if (_fhClientCache[key]) return _fhClientCache[key];
  const formula = `SEARCH(LOWER("${q.replace(/"/g, '')}"), LOWER({Company Name}))`;
  const recs = await atGet(TABLES.CLIENTS, formula, false);
  const res = recs
    .map(r => ({ id: r.id, label: r.fields['Company Name'] || '' }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 30);
  _fhClientCache[key] = res;
  res.forEach(c => { _fhClientsMap[c.id] = c.label; });
  return res;
}

/**
 * Batch-resolve client IDs to names (for pre-loading table views)
 */
async function fhBatchResolveClients(ids) {
  const unresolvedIds = ids.filter(id => !_fhClientsMap[id]);
  if (!unresolvedIds.length) return;
  const batches = [];
  for (let i = 0; i < unresolvedIds.length; i += 10) {
    const batch = unresolvedIds.slice(i, i + 10);
    const f = `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(',')})`;
    batches.push(
      atGetAll(TABLES.CLIENTS, { filterByFormula: f, fields: ['Company Name'] }, false).catch(() => [])
    );
  }
  const results = await Promise.all(batches);
  results.flat().forEach(r => { _fhClientsMap[r.id] = r.fields['Company Name'] || r.id; });
}

/**
 * Resolve a single client record ID to a name
 */
async function fhResolveClientName(recId) {
  if (!recId) return '';
  if (_fhClientsMap[recId]) return _fhClientsMap[recId];
  try {
    const d = await atGetOne(TABLES.CLIENTS, recId);
    const name = d.fields?.['Company Name'] || '';
    _fhClientsMap[recId] = name;
    return name;
  } catch (e) { return ''; }
}

/**
 * Get client name from clients map (synchronous, for table rendering)
 */
function fhClientName(clientField) {
  const id = Array.isArray(clientField) ? clientField[0] : null;
  return id ? escapeHtml(_fhClientsMap[id] || id.slice(-6)) : '\u2014';
}

/**
 * Get location label from shared cache
 */
function fhLocationLabel(recId) {
  return _fhLocationsMap[recId] || '';
}

// ─── Dropdown widgets (for inline HTML in forms) ───────

/**
 * Build a location select widget HTML
 * @param {string} id - Unique field identifier
 * @param {string} currentId - Current location record ID (or '')
 * @param {string} [locDropFn='fhLocDrop'] - Name of the dropdown handler function
 */
function fhLocSelect(id, currentId, locDropFn) {
  const fn = locDropFn || 'fhLocDrop';
  const label = currentId ? (_fhLocationsMap[currentId] || '') : '';
  return `<div style="position:relative">
    <input class="form-input" id="ls_${id}" autocomplete="off" value="${escapeHtml(label)}"
      placeholder="Search location..."
      oninput="${fn}('${id}',this.value)"
      onfocus="${fn}('${id}',this.value)"
      onblur="fhHideDrop('ls_${id}_d')">
    <input type="hidden" id="lv_${id}" value="${currentId || ''}">
    <div id="ls_${id}_d" class="linked-drop" style="display:none"></div>
  </div>`;
}

/**
 * Build a client select widget HTML
 * @param {string} id - Unique field identifier
 * @param {string} currentId - Current client record ID (or '')
 * @param {string} currentLabel - Current client name
 * @param {string} [clientDropFn='fhClientDrop'] - Name of the dropdown handler function
 */
function fhClientSelect(id, currentId, currentLabel, clientDropFn) {
  const fn = clientDropFn || 'fhClientDrop';
  return `<div style="position:relative">
    <input class="form-input" id="ls_${id}" autocomplete="off" value="${escapeHtml(currentLabel || '')}"
      placeholder="Type 2+ chars to search..."
      oninput="${fn}('${id}',this.value)"
      onblur="fhHideDrop('ls_${id}_d')">
    <input type="hidden" id="lv_${id}" value="${currentId || ''}">
    <div id="ls_${id}_d" class="linked-drop" style="display:none"></div>
  </div>`;
}

/**
 * Hide a dropdown after a short delay (for onblur)
 */
function fhHideDrop(dropId) {
  setTimeout(() => {
    const d = document.getElementById(dropId);
    if (d) d.style.display = 'none';
  }, 200);
}

/**
 * Show location dropdown filtered by query
 */
function fhLocDrop(id, q) {
  const pool = q.trim()
    ? _fhLocationsArr.filter(o => o.label.toLowerCase().includes(q.toLowerCase())).slice(0, 25)
    : _fhLocationsArr.slice(0, 25);
  fhShowDrop('ls_' + id + '_d', id, pool);
}

/**
 * Show client dropdown with async search
 */
let _fhClientTimer = null;
function fhClientDrop(id, q) {
  clearTimeout(_fhClientTimer);
  const d = document.getElementById('ls_' + id + '_d');
  if (q.length < 2) { if (d) d.style.display = 'none'; return; }
  if (d) {
    d.style.display = 'block';
    d.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:var(--text-dim)">Searching...</div>';
  }
  _fhClientTimer = setTimeout(async () => {
    const results = await fhSearchClients(q);
    fhShowDrop('ls_' + id + '_d', id, results);
  }, 300);
}

/**
 * Render dropdown items
 */
function fhShowDrop(dropId, id, items) {
  const d = document.getElementById(dropId);
  if (!d) return;
  if (!items.length) { d.style.display = 'none'; return; }
  d.style.display = 'block';
  d.innerHTML = items.map(o =>
    `<div onmousedown="fhPickLinked('${id}','${o.id}','${o.label.replace(/'/g, "\\'").replace(/</g, '&lt;')}')"
      class="linked-drop-item">${escapeHtml(o.label)}</div>`
  ).join('');
}

/**
 * Pick a linked record from dropdown
 */
function fhPickLinked(id, recId, label) {
  const s = document.getElementById('ls_' + id);
  if (s) s.value = label;
  const v = document.getElementById('lv_' + id);
  if (v) v.value = recId;
  const d = document.getElementById('ls_' + id + '_d');
  if (d) d.style.display = 'none';
}
