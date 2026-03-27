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
// max 2 per browser when proxy active (server manages global limit), 4 in direct mode
const _Q = { running: 0, max: (typeof USE_PROXY !== 'undefined' && USE_PROXY) ? 2 : 4, queue: [] };
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
  const data = await res.json();
  invalidateCache(tableId);
  atNotifyChange(tableId);
  return data;
}

async function atCreate(tableId, fields) {
  _auditLog('CREATE', tableId, null, fields);
  const res = await _enqueue(() => _atRetry(() => fetch(_apiUrl(`/v0/${AT_BASE}/${tableId}`), {
    method: 'POST',
    headers: _apiHeaders('POST'),
    body: JSON.stringify({ fields })
  })));
  const data = await res.json();
  invalidateCache(tableId);
  atNotifyChange(tableId);
  return data;
}

async function atDelete(tableId, recId) {
  _auditLog('DELETE', tableId, recId, null);
  const res = await _enqueue(() => _atRetry(() => fetch(_apiUrl(`/v0/${AT_BASE}/${tableId}/${recId}`), {
    method: 'DELETE',
    headers: _apiHeaders('DELETE')
  })));
  const data = await res.json();
  invalidateCache(tableId);
  atNotifyChange(tableId);
  return data;
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

// ═══════════════════════════════════════════════
// MULTI-USER: Auto-Refresh, Conflict Detection, Presence
// ═══════════════════════════════════════════════

// ── 1. Auto-Refresh ────────────────────────────────
// Pages register a callback; every 60s we invalidate dynamic caches
// and call the callback so the page re-renders with fresh data.
let _autoRefreshCb = null;
let _autoRefreshTimer = null;

function atAutoRefresh(callback, intervalMs = 60000) {
  _autoRefreshCb = callback;
  if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
  _autoRefreshTimer = setInterval(() => {
    // Invalidate dynamic table caches (not stable/long)
    Object.keys(_MEM).forEach(k => {
      const tableId = k.substring(0, 17); // tblXXXXXXXXXXXXX
      if (!_isStable(tableId)) delete _MEM[k];
    });
    if (_autoRefreshCb) _autoRefreshCb();
  }, intervalMs);
}

function atStopAutoRefresh() {
  if (_autoRefreshTimer) { clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
  _autoRefreshCb = null;
}

// ── 2. Conflict Detection (Optimistic Locking) ────
// Before PATCH, fetch current record and compare Modified time.
// If someone else changed it since we loaded, warn the user.
const _recordVersions = {}; // { recId: lastModifiedTime }

function atTrackVersion(record) {
  if (record && record.id) {
    _recordVersions[record.id] = record.fields?.['Last Modified'] || record.fields?.['Modified'] || null;
  }
}

function atTrackVersions(records) {
  if (Array.isArray(records)) records.forEach(r => atTrackVersion(r));
}

async function atSafePatch(tableId, recId, fields) {
  // Check if record was modified by someone else
  const tracked = _recordVersions[recId];
  if (tracked) {
    try {
      const res = await _enqueue(() => _atRetry(() =>
        fetch(_apiUrl(`/v0/${AT_BASE}/${tableId}/${recId}`), {
          headers: _apiHeaders('GET')
        })
      ));
      const current = await res.json();
      const currentMod = current.fields?.['Last Modified'] || current.fields?.['Modified'] || null;
      if (currentMod && tracked && currentMod !== tracked) {
        const proceed = confirm(
          'This record was modified by another user since you loaded it.\n' +
          'Save anyway? (Cancel to reload first)'
        );
        if (!proceed) return { conflict: true, current };
      }
    } catch {} // If check fails, proceed anyway
  }

  const result = await atPatch(tableId, recId, fields);
  // Update tracked version
  if (result && result.fields) {
    _recordVersions[recId] = result.fields['Last Modified'] || result.fields['Modified'] || null;
  }
  return result;
}

// ── 3. Online Presence ─────────────────────────────
// BroadcastChannel for cross-tab awareness + localStorage heartbeat
const _PRESENCE_KEY = 'tms_presence';
const _PRESENCE_TTL = 90000; // 90 sec = offline if no heartbeat
let _presenceChannel = null;

function atPresenceStart() {
  const user = JSON.parse(localStorage.getItem('tms_user') || '{}');
  if (!user.name) return;

  // Heartbeat: write to localStorage every 30s
  const beat = () => {
    try {
      const all = JSON.parse(localStorage.getItem(_PRESENCE_KEY) || '{}');
      all[user.name] = {
        role: user.role || 'unknown',
        page: localStorage.getItem('tms_page') || 'dashboard',
        ts: Date.now()
      };
      // Clean stale entries
      Object.keys(all).forEach(k => {
        if (Date.now() - all[k].ts > _PRESENCE_TTL) delete all[k];
      });
      localStorage.setItem(_PRESENCE_KEY, JSON.stringify(all));
    } catch {}
  };
  beat();
  setInterval(beat, 30000);

  // BroadcastChannel for instant cross-tab notifications
  try {
    _presenceChannel = new BroadcastChannel('tms_sync');
    _presenceChannel.onmessage = (e) => {
      if (e.data?.type === 'invalidate' && e.data?.table) {
        invalidateCache(e.data.table);
        if (_autoRefreshCb) _autoRefreshCb();
      }
    };
  } catch {} // BroadcastChannel not supported in all browsers
}

// Notify other tabs that a table changed (call after mutations)
function atNotifyChange(tableId) {
  try {
    if (_presenceChannel) {
      _presenceChannel.postMessage({ type: 'invalidate', table: tableId });
    }
  } catch {}
}

// Get list of online users
function atGetOnlineUsers() {
  try {
    const all = JSON.parse(localStorage.getItem(_PRESENCE_KEY) || '{}');
    const now = Date.now();
    return Object.entries(all)
      .filter(([_, v]) => now - v.ts < _PRESENCE_TTL)
      .map(([name, v]) => ({ name, role: v.role, page: v.page, lastSeen: v.ts }));
  } catch { return []; }
}
