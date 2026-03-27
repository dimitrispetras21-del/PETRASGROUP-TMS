// ═══════════════════════════════════════════════
// CORE — AIRTABLE API  (with localStorage cache)
// ═══════════════════════════════════════════════

// ── Cache layer ──────────────────────────────────
// Memory cache (session) + localStorage (cross-refresh)
// TTL tiers:
//   LONG    (LOCATIONS, TRUCKS, TRAILERS, DRIVERS): 4h localStorage (rarely change)
//   STABLE  (CLIENTS, PARTNERS):                     30 min localStorage
//   NORMAL  (ORDERS, TRIPS, etc):                     2 min memory only

const _MEM = {};   // { key: { data, ts } }

const _LONG_TABLES = new Set([
  'tblxu8DRfTQOFRCzS',  // LOCATIONS
  'tblEAPExIAjiA3asD',  // TRUCKS
  'tblDcrqRJXzPrtYLm',  // TRAILERS
  'tbl7UGmYhc2Y82pPs',  // DRIVERS
]);
const _STABLE_TABLES = new Set([
  'tblLHl5m8bqONfhWv',  // PARTNERS
  'tblFWKAQVUzAM8mCE',  // CLIENTS
]);
const LONG_MS     =  4 * 60 * 60 * 1000;  // 4 hours
const STABLE_MS   = 30 * 60 * 1000;  // 30 min
const SESSION_MS  =  2 * 60 * 1000;  //  2 min

function _isLong(tableId) {
  return _LONG_TABLES.has(tableId);
}
function _isStable(tableId) {
  return _isLong(tableId) || _STABLE_TABLES.has(tableId);
}

function _lsGet(key, tableId) {
  try {
    const raw = localStorage.getItem('at_' + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    const ttl = _isLong(tableId) ? LONG_MS : STABLE_MS;
    if (Date.now() - ts > ttl) { localStorage.removeItem('at_' + key); return null; }
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

// ── Request Queue (max 4 concurrent, Airtable limit = 5) ──
const _Q = { running: 0, max: 4, queue: [] };
function _enqueue(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      _Q.running++;
      try { resolve(await fn()); }
      catch (e) { reject(e); }
      finally {
        _Q.running--;
        if (_Q.queue.length > 0) _Q.queue.shift()();
      }
    };
    if (_Q.running < _Q.max) run();
    else _Q.queue.push(run);
  });
}

// ── Audit Log (mutations only, last 200 entries) ──
const _AUDIT_MAX = 200;
function _auditLog(action, tableId, recId, fields) {
  try {
    const user = JSON.parse(localStorage.getItem('tms_user') || '{}');
    const entry = {
      ts: new Date().toISOString(),
      user: user.name || 'unknown',
      role: user.role || 'unknown',
      action,          // PATCH | CREATE | DELETE
      table: tableId,
      record: recId || null,
      fields: fields ? Object.keys(fields) : null
    };
    const log = JSON.parse(localStorage.getItem('tms_audit') || '[]');
    log.push(entry);
    if (log.length > _AUDIT_MAX) log.splice(0, log.length - _AUDIT_MAX);
    localStorage.setItem('tms_audit', JSON.stringify(log));
  } catch {}
}

// Read audit log (for admin/debug)
function atGetAuditLog() {
  try { return JSON.parse(localStorage.getItem('tms_audit') || '[]'); }
  catch { return []; }
}

// ── Retry wrapper (exponential backoff) ───────────
async function _atRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fn();
      if (res.status === 401) {
        localStorage.removeItem('tms_user');
        window.location.href = 'index.html';
        throw new Error('Unauthorized');
      }
      if (res.status === 429) {
        const wait = Math.pow(2, i) * 1000 + Math.random() * 500;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok && i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// ── API URL builder (direct vs proxy) ─────────────
function _apiUrl(path) {
  if (typeof USE_PROXY !== 'undefined' && USE_PROXY) {
    return `${PROXY_URL}${path}`;
  }
  return `https://api.airtable.com${path}`;
}

function _apiHeaders(method) {
  const h = {};
  if (typeof USE_PROXY === 'undefined' || !USE_PROXY) {
    h['Authorization'] = 'Bearer ' + AT_TOKEN;
  }
  if (method !== 'GET' && method !== 'DELETE') {
    h['Content-Type'] = 'application/json';
  }
  return h;
}

// ── Core fetch (paginated) ────────────────────────
async function _atFetch(tableId, paramStr = '') {
  let records = [], offset = '';
  do {
    let url = _apiUrl(`/v0/${AT_BASE}/${tableId}`) + `?pageSize=100${paramStr ? '&' + paramStr : ''}`;
    if (offset) url += `&offset=${offset}`;
    const res  = await _enqueue(() => _atRetry(() => fetch(url, { headers: _apiHeaders('GET') })));
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
    const memTtl = _isLong(tableId) ? LONG_MS : (stable ? STABLE_MS : SESSION_MS);
    const mem = _memGet(key, memTtl);
    if (mem) return mem;
    if (stable) { const ls = _lsGet(key, tableId); if (ls) { _memSet(key, ls); return ls; } }
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
    const memTtl = _isLong(tableId) ? LONG_MS : (stable ? STABLE_MS : SESSION_MS);
    const mem = _memGet(key, memTtl);
    if (mem) return mem;
    if (stable) { const ls = _lsGet(key, tableId); if (ls) { _memSet(key, ls); return ls; } }
  }

  const records = await _atFetch(tableId, paramStr);
  _memSet(key, records);
  if (stable) _lsSet(key, records);
  return records;
}

async function atPatch(tableId, recId, fields) {
  _auditLog('PATCH', tableId, recId, fields);
  const res = await _enqueue(() => _atRetry(() => fetch(_apiUrl(`/v0/${AT_BASE}/${tableId}/${recId}`), {
    method: 'PATCH',
    headers: _apiHeaders('PATCH'),
    body: JSON.stringify({ fields })
  })));
  return res.json();
}

async function atCreate(tableId, fields) {
  _auditLog('CREATE', tableId, null, fields);
  const res = await _enqueue(() => _atRetry(() => fetch(_apiUrl(`/v0/${AT_BASE}/${tableId}`), {
    method: 'POST',
    headers: _apiHeaders('POST'),
    body: JSON.stringify({ fields })
  })));
  return res.json();
}

async function atDelete(tableId, recId) {
  _auditLog('DELETE', tableId, recId, null);
  const res = await _enqueue(() => _atRetry(() => fetch(_apiUrl(`/v0/${AT_BASE}/${tableId}/${recId}`), {
    method: 'DELETE',
    headers: _apiHeaders('DELETE')
  })));
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
