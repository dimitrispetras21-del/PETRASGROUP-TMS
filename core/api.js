// ═══════════════════════════════════════════════
// CORE — AIRTABLE API  (with localStorage cache)
// ═══════════════════════════════════════════════

// ── Cache layer ──────────────────────────────────
// Memory cache (session) + localStorage (cross-refresh)
// TTL tiers:
//   STABLE  (LOCATIONS, TRUCKS, TRAILERS, DRIVERS, PARTNERS): 30 min localStorage
//   NORMAL  (ORDERS, TRIPS, etc):                              2 min memory only

const _MEM = {};   // { key: { data, ts } }

const _STABLE_TABLES = new Set([
  'tblxu8DRfTQOFRCzS',  // LOCATIONS
  'tblEAPExIAjiA3asD',  // TRUCKS
  'tblDcrqRJXzPrtYLm',  // TRAILERS
  'tblTJ5HJCTFLuMrdb',  // DRIVERS
  'tblpartners',         // PARTNERS (covered by prefix match below)
]);
const STABLE_MS   = 30 * 60 * 1000;  // 30 min
const SESSION_MS  =  2 * 60 * 1000;  //  2 min

function _isStable(tableId) {
  return _STABLE_TABLES.has(tableId) || tableId.startsWith('tblxu8') || tableId.startsWith('tblEAP') || tableId.startsWith('tblDcr') || tableId.startsWith('tblTJ5') || tableId.startsWith('tblFWK');
}

function _lsGet(key) {
  try {
    const raw = localStorage.getItem('at_' + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > STABLE_MS) { localStorage.removeItem('at_' + key); return null; }
    return data;
  } catch { return null; }
}

function _lsSet(key, data) {
  try { localStorage.setItem('at_' + key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function _memGet(key, ttl) {
  const e = _MEM[key];
  if (e && Date.now() - e.ts < ttl) return e.data;
  return null;
}

function _memSet(key, data) { _MEM[key] = { data, ts: Date.now() }; }

// ── Core fetch (paginated) ────────────────────────
async function _atFetch(tableId, paramStr = '') {
  let records = [], offset = '';
  do {
    let url = `https://api.airtable.com/v0/${AT_BASE}/${tableId}?pageSize=100${paramStr ? '&' + paramStr : ''}`;
    if (offset) url += `&offset=${offset}`;
    const res  = await fetch(url, { headers: { Authorization: 'Bearer ' + AT_TOKEN } });
    const data = await res.json();
    records = records.concat(data.records || []);
    offset  = data.offset || '';
  } while (offset);
  return records;
}

// ── Public API ────────────────────────────────────
async function atGet(tableId, filter = '', useCache = true) {
  const paramStr = filter ? `filterByFormula=${encodeURIComponent(filter)}` : '';
  const key = tableId + paramStr;
  const stable = _isStable(tableId);

  if (useCache) {
    const mem = _memGet(key, stable ? STABLE_MS : SESSION_MS);
    if (mem) return mem;
    if (stable) { const ls = _lsGet(key); if (ls) { _memSet(key, ls); return ls; } }
  }

  const records = await _atFetch(tableId, paramStr);
  _memSet(key, records);
  if (stable) _lsSet(key, records);
  return records;
}

async function atGetAll(tableId, opts = {}, useCache = true) {
  const params = [];
  if (opts.filterByFormula) params.push(`filterByFormula=${encodeURIComponent(opts.filterByFormula)}`);
  if (opts.fields) opts.fields.forEach(f => params.push(`fields[]=${encodeURIComponent(f)}`));
  if (opts.sort) opts.sort.forEach(s => params.push(`sort[0][field]=${encodeURIComponent(s.field)}&sort[0][direction]=${s.direction || 'asc'}`));
  const paramStr = params.join('&');
  const key = tableId + paramStr;
  const stable = _isStable(tableId);

  if (useCache) {
    const mem = _memGet(key, stable ? STABLE_MS : SESSION_MS);
    if (mem) return mem;
    if (stable) { const ls = _lsGet(key); if (ls) { _memSet(key, ls); return ls; } }
  }

  const records = await _atFetch(tableId, paramStr);
  _memSet(key, records);
  if (stable) _lsSet(key, records);
  return records;
}

async function atPatch(tableId, recId, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${tableId}/${recId}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + AT_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  return res.json();
}

async function atCreate(tableId, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${tableId}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + AT_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  return res.json();
}

async function atDelete(tableId, recId) {
  const res = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${tableId}/${recId}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + AT_TOKEN }
  });
  return res.json();
}

function invalidateCache(tableId) {
  Object.keys(_MEM).forEach(k => { if (k.startsWith(tableId)) delete _MEM[k]; });
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('at_' + tableId)) localStorage.removeItem(k);
    });
  } catch {}
}

function atClearCache(tableId) { invalidateCache(tableId); }

// Helper: extract first value from linked record / array field
function fv(v) {
  if (Array.isArray(v)) return v[0] || '';
  return v ?? '';
}

// ── Background preload (called on app init) ───────
function atPreload() {
  const TABLES_CFG = typeof TABLES !== 'undefined' ? TABLES : {};
  const preloadIds = [
    TABLES_CFG.LOCATIONS,
    TABLES_CFG.TRUCKS,
    TABLES_CFG.TRAILERS,
    TABLES_CFG.DRIVERS,
  ].filter(Boolean);
  // Fire and forget — warms both memory + localStorage
  preloadIds.forEach(id => atGet(id, '', true).catch(() => {}));
}
