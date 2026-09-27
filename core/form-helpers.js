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
      // One list everywhere (owner 5/9): the picker shows the Greek name even
      // when the record still stores an old English/Greek spelling or code.
      label: [r.fields['Name'], r.fields['City'], typeof countryName === 'function' ? countryName(r.fields['Country']) : r.fields['Country']].filter(Boolean).join(', ')
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  // Push into shared array (don't reassign — other refs may hold it)
  sorted.forEach(l => {
    _fhLocationsArr.push(l);
    _fhLocationsMap[l.id] = l.label;
  });
}

// SWR (owner 12/8): φρεσκάρισμα των shared arrays ΕΠΙ ΤΟΠΟΥ από το background
// revalidate του api.js — νέες/μετονομασμένες τοποθεσίες χωρίς reload. In-place
// (length=0, push) γιατί άλλα modules κρατούν αναφορά στο ίδιο array.
function _fhRefreshLocations(locRecords) {
  if (!Array.isArray(locRecords) || !locRecords.length || !_fhLocationsArr.length) return;
  const sorted = locRecords
    .map(r => ({
      id: r.id,
      // One list everywhere (owner 5/9): the picker shows the Greek name even
      // when the record still stores an old English/Greek spelling or code.
      label: [r.fields['Name'], r.fields['City'], typeof countryName === 'function' ? countryName(r.fields['Country']) : r.fields['Country']].filter(Boolean).join(', ')
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  _fhLocationsArr.length = 0;
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
  const safe = q.replace(/[^a-zA-Z0-9\s\u0370-\u03FF\u1F00-\u1FFF.-]/g, '').trim();
  if (!safe) return [];
  const formula = `SEARCH(LOWER("${safe}"), LOWER({Company Name}))`;
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
      // safeFetch: a failed batch leaves those ids unresolved, and the caller
      // falls back to displaying the raw record id ("recAbc123...") as if it
      // were a company name. That is not a wrong number, so it stays soft, but
      // it was previously invisible: nothing reached /app-errors, so a partly
      // broken CLIENTS read looked like odd data rather than a fetch failure.
      safeFetch(
        () => atGetAll(TABLES.CLIENTS, { filterByFormula: f, fields: ['Company Name'] }, false),
        'form-helpers: resolve client names'
      )
    );
  }
  const results = await Promise.all(batches);
  // didFail results are tagged empty arrays, so flat() handles them without a
  // guard; the ids simply stay unresolved, exactly as before this change.
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
      oninput="if(!this.value.trim())document.getElementById('lv_${id}').value='';${fn}('${id}',this.value)"
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
      oninput="if(!this.value.trim())document.getElementById('lv_${id}').value='';${fn}('${id}',this.value)"
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
// 9/9 (owner: «πληκτρολογούσα και δεν εμφανίζονταν τοποθεσίες»): locations are
// stored in Latin/ELOT 743 spelling (9/8 decision), so a dispatcher typing
// «Βέροια» matched nothing. Compare both sides transliterated and accent-free.
const _FH_EL = { 'α':'a','β':'v','γ':'g','δ':'d','ε':'e','ζ':'z','η':'i','θ':'th','ι':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y','φ':'f','χ':'ch','ψ':'ps','ω':'o' };
function _fhNorm(s) {
  let t = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  t = t.replace(/ου/g, 'ou').replace(/αυ/g, 'av').replace(/ευ/g, 'ev').replace(/(^|\s)μπ/g, '$1b').replace(/(^|\s)ντ/g, '$1d').replace(/γγ/g, 'ng').replace(/γκ/g, 'gk');
  return t.replace(/[α-ω]/g, c => _FH_EL[c] || c);
}
function fhLocDrop(id, q) {
  const nq = _fhNorm(q.trim());
  const pool = nq
    ? _fhLocationsArr.filter(o => (o._n || (o._n = _fhNorm(o.label))).includes(nq)).slice(0, 25)
    : _fhLocationsArr.slice(0, 25);
  fhShowDrop('ls_' + id + '_d', id, pool);
}
// Case-keeping ELOT transliteration for STORED names (locations are Latin-only,
// owner 9/8) — _fhNorm lowercases, which is right for search and wrong for a name.
function _fhTranslit(s) {
  const one = w => {
    if (!/[Ͱ-Ͽ]/.test(w)) return w;
    const t = w.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const allUp = t === t.toUpperCase();
    const l = t.toLowerCase().replace(/ου/g, 'ou').replace(/αυ/g, 'av').replace(/ευ/g, 'ev').replace(/^μπ/, 'b').replace(/^ντ/, 'd').replace(/γγ/g, 'ng').replace(/γκ/g, 'gk').replace(/[α-ω]/g, c => _FH_EL[c] || c);
    if (allUp) return l.toUpperCase();
    return /^[Α-Ω]/.test(t) ? l.charAt(0).toUpperCase() + l.slice(1) : l;
  };
  return String(s || '').split(/(\s+)/).map(w => /^\s+$/.test(w) ? w : one(w)).join('');
}
if (typeof window !== 'undefined') { window._fhNorm = _fhNorm; window._fhTranslit = _fhTranslit; }

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
  d.innerHTML = items.map(o => {
    const safeLabel = o.label.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    return `<div onmousedown="fhPickLinked('${id}','${o.id}','${safeLabel}')"
      class="linked-drop-item">${escapeHtml(o.label)}</div>`;
  }).join('');
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

// ─── Pallet Exchange: explicit ΝΑΙ / ΟΧΙ (owner 27/9) ─────────────────────
// Was a checkbox, where «not ticked» and «forgot to tick» both saved as
// Pallet Exchange = false. PE drives the pallet-ledger feeders and the
// invoicing gate, so a forgotten tick silently became a wrong answer. Now:
//   · a NEW order has no default — save is refused until ΝΑΙ or ΟΧΙ is chosen;
//   · an existing order opens on its stored value and is not asked again
//     (a legacy NULL opens unchosen and, if left so, the field is not written);
//   · Industrial / CHEP never exchange (production 27/9: 19/19 and 9/9 = No),
//     so those types force ΟΧΙ and lock the control. Switching back to EUR
//     restores what was there before the lock — nothing for a new order, the
//     stored value for an edit — so the lock never leaves a choice behind.
// Shared by the international and the national form: one rule, one place.
const PE_NO_EXCHANGE_TYPES = ['Industrial', 'CHEP'];

function peChoiceHtml(pfx, f, isEdit) {
  const v = f['Pallet Exchange'];
  const orig = isEdit && v === true ? 'yes' : isEdit && v === false ? 'no' : '';
  const radio = (val, lbl) => `<label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="radio" name="${pfx}_PalletExch" value="${val}" ${orig === val ? 'checked' : ''} onchange="pePicked('${pfx}')" style="width:15px;height:15px;margin:0">${lbl}</label>`;
  return `<div class="form-field">
        <label class="form-label">Ανταλλαγή παλετών (PE) *</label>
        <div class="form-input" id="${pfx}_PalletExch" data-orig="${orig}" style="display:flex;align-items:center;gap:24px">
          ${radio('yes', 'ΝΑΙ')}${radio('no', 'ΟΧΙ')}</div>
        <div id="${pfx}_PalletExchHint" style="font-size:11px;line-height:1.3;color:var(--text-dim)"></div>
      </div>`;
}

// null = nothing chosen. The caller decides: null blocks a new order, and is
// simply not written on an edit.
function peRead(pfx) {
  const on = document.querySelector(`input[name="${pfx}_PalletExch"]:checked`);
  return on ? on.value === 'yes' : null;
}

function pePicked(pfx) {
  const box = document.getElementById(pfx + '_PalletExch');
  if (box) box.style.borderColor = '';
  const h = document.getElementById(pfx + '_PalletExchHint');
  if (h && h.dataset.err) { h.textContent = ''; h.style.color = 'var(--text-dim)'; delete h.dataset.err; }
}

// Runs on every pallet-type change and once when the form opens.
function peSyncPalletType(pfx, palletType) {
  const box = document.getElementById(pfx + '_PalletExch'); if (!box) return;
  const radios = box.querySelectorAll('input[type="radio"]');
  const h = document.getElementById(pfx + '_PalletExchHint');
  if (PE_NO_EXCHANGE_TYPES.includes(palletType)) {
    radios.forEach(r => { r.checked = r.value === 'no'; r.disabled = true; });
    box.style.opacity = '.6';
    pePicked(pfx);
    if (h) h.textContent = 'Industrial/CHEP: χωρίς ανταλλαγή';
    box.dataset.locked = '1';
  } else if (box.dataset.locked) {
    const orig = box.dataset.orig || '';
    radios.forEach(r => { r.disabled = false; r.checked = r.value === orig; });
    box.style.opacity = '';
    if (h) h.textContent = '';
    delete box.dataset.locked;
  }
}

// Paints the unanswered control in place; returns the line for the toast.
function peMarkMissing(pfx) {
  const box = document.getElementById(pfx + '_PalletExch');
  if (box) { box.style.borderColor = 'var(--danger)'; box.scrollIntoView({ block: 'center' }); }
  const h = document.getElementById(pfx + '_PalletExchHint');
  if (h) { h.textContent = 'Υποχρεωτικό — διάλεξε ΝΑΙ ή ΟΧΙ'; h.style.color = 'var(--danger)'; h.dataset.err = '1'; }
  return 'Ανταλλαγή παλετών (PE): διάλεξε ΝΑΙ ή ΟΧΙ';
}
