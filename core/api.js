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

function _userPrefix() {
  try {
    const u = JSON.parse(localStorage.getItem('tms_user') || '{}');
    return u.username || u.name || 'anon';
  } catch { return 'anon'; }
}

function _lsGet(key, tableId) {
  try {
    const raw = localStorage.getItem('at_' + _userPrefix() + '_' + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    const ttl = _isLong(tableId) ? LONG_MS : STABLE_MS;
    if (Date.now() - ts > ttl) { localStorage.removeItem('at_' + _userPrefix() + '_' + key); return null; }
    return data;
  } catch(e) { if (typeof logError === 'function') logError(e, '_lsGet cache read'); return null; }
}

function _lsSet(key, data) {
  try { localStorage.setItem('at_' + _userPrefix() + '_' + key, JSON.stringify({ data, ts: Date.now() })); } catch(e) { if (typeof logError === 'function') logError(e, '_lsSet cache write'); }
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

// ── Offline Queue ───────────────────────────────
const _offlineQueue = [];

function _isOnline() { return navigator.onLine; }

function _queueOffline(method, url, body, recordId) {
  _offlineQueue.push({ method, url, body, timestamp: Date.now(), recordId: recordId || null });
  _saveOfflineQueue();
  if (typeof showErrorToast === 'function') {
    showErrorToast('\u0391\u03C0\u03BF\u03B8\u03B7\u03BA\u03B5\u03CD\u03C4\u03B7\u03BA\u03B5 \u03C4\u03BF\u03C0\u03B9\u03BA\u03AC \u2014 \u03B8\u03B1 \u03C3\u03C4\u03B1\u03BB\u03B5\u03AF \u03BC\u03CC\u03BB\u03B9\u03C2 \u03B3\u03C5\u03C1\u03AF\u03C3\u03B5\u03B9 \u03C4\u03BF internet', 'warn');
  }
}

function _saveOfflineQueue() {
  try { localStorage.setItem('tms_offline_queue', JSON.stringify(_offlineQueue)); } catch(e) { if (typeof logError === 'function') logError(e, '_saveOfflineQueue'); }
}

function _loadOfflineQueue() {
  if (_offlineQueue.length > 0) return; // already loaded
  try {
    const q = JSON.parse(localStorage.getItem('tms_offline_queue') || '[]');
    _offlineQueue.push(...q);
  } catch(e) { if (typeof logError === 'function') logError(e, '_loadOfflineQueue'); }
}

async function _flushOfflineQueue() {
  if (!_offlineQueue.length || !navigator.onLine) return;
  const batch = [..._offlineQueue];
  _offlineQueue.length = 0;
  _saveOfflineQueue();

  let failed = 0, conflicts = 0;
  for (const item of batch) {
    try {
      // For PATCH operations, check if record was modified since we queued
      if (item.method === 'PATCH' && item.recordId) {
        try {
          const chkRes = await _atRetry(() => fetch(item.url.replace(/\?.*/, ''), { headers: _apiHeaders('GET') }));
          const currentData = await chkRes.json();
          if (currentData && currentData.fields) {
            const lastMod = currentData.fields['Last Modified'] || currentData.fields['lastModifiedTime'];
            if (lastMod) {
              const serverModified = new Date(lastMod).getTime();
              if (serverModified > item.timestamp) {
                conflicts++;
                if (typeof showErrorToast === 'function') {
                  showErrorToast('Conflict: record modified while offline', 'warn');
                }
                continue; // Skip this mutation, don't overwrite
              }
            }
            // If no Last Modified field, proceed with the mutation (can't detect conflicts)
          }
        } catch(e) {
          // If conflict check fails, proceed with the mutation anyway
          if (typeof logError === 'function') logError(e, '_flushOfflineQueue conflict check');
        }
      }
      await fetch(item.url, {
        method: item.method,
        headers: _apiHeaders(item.method),
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
    } catch(e) {
      if (typeof logError === 'function') logError(e, '_flushOfflineQueue mutation');
      _offlineQueue.push(item);
      failed++;
    }
  }
  _saveOfflineQueue();
  const synced = batch.length - failed - conflicts;
  if (synced > 0 && typeof showErrorToast === 'function') {
    showErrorToast(`${synced} \u03B1\u03BB\u03BB\u03B1\u03B3\u03AD\u03C2 \u03C3\u03C5\u03B3\u03C7\u03C1\u03BF\u03BD\u03AF\u03C3\u03C4\u03B7\u03BA\u03B1\u03BD${conflicts ? `, ${conflicts} conflicts` : ''}`, 'info');
  }
  if (conflicts > 0 && typeof showErrorToast === 'function') {
    showErrorToast(`${conflicts} \u03B1\u03BB\u03BB\u03B1\u03B3\u03AD\u03C2 \u03C0\u03B1\u03C1\u03B1\u03BB\u03B5\u03AF\u03C6\u03B8\u03B7\u03BA\u03B1\u03BD \u03BB\u03CC\u03B3\u03C9 conflict \u2014 reload`, 'warn');
  }
}

// Flush when back online
window.addEventListener('online', _flushOfflineQueue);

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
  } catch(e) { if (typeof logError === 'function') logError(e, '_auditLog'); }
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
        localStorage.removeItem('tms_jwt');
        window.location.href = 'index.html';
        throw new Error('Unauthorized');
      }
      if (res.status === 429) {
        if (typeof showErrorToast === 'function') {
          showErrorToast('\u03A0\u03BF\u03BB\u03BB\u03AC \u03B1\u03B9\u03C4\u03AE\u03BC\u03B1\u03C4\u03B1 \u2014 \u03B1\u03C5\u03C4\u03CC\u03BC\u03B1\u03C4\u03B7 \u03B5\u03C0\u03B1\u03BD\u03AC\u03BB\u03B7\u03C8\u03B7...', 'warn');
        }
        const wait = Math.pow(2, i) * 1000 + Math.random() * 500;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (res.status >= 500 && i < retries - 1) {
        if (typeof showErrorToast === 'function') {
          showErrorToast('\u03A3\u03C6\u03AC\u03BB\u03BC\u03B1 server \u2014 \u03B4\u03BF\u03BA\u03B9\u03BC\u03AC\u03C3\u03C4\u03B5 \u03BE\u03B1\u03BD\u03AC', 'error');
        }
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      if (!res.ok && i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries - 1) {
        if (typeof logError === 'function') logError(e, 'API retry exhausted');
        if (typeof showErrorToast === 'function') {
          showErrorToast('\u03A3\u03C6\u03AC\u03BB\u03BC\u03B1 \u03C3\u03CD\u03BD\u03B4\u03B5\u03C3\u03B7\u03C2 \u2014 \u03B4\u03BF\u03BA\u03B9\u03BC\u03AC\u03C3\u03C4\u03B5 \u03BE\u03B1\u03BD\u03AC', 'error');
        }
        throw e;
      }
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
  if (typeof USE_PROXY !== 'undefined' && USE_PROXY) {
    // Proxy mode: send JWT token (worker swaps it for the real Airtable PAT)
    const jwt = localStorage.getItem('tms_jwt');
    if (jwt) h['Authorization'] = 'Bearer ' + jwt;
  } else {
    // Direct mode: send Airtable token directly
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
    if (data.error) {
      const errMsg = data.error.message || data.error.type || 'Airtable error';
      if (typeof logError === 'function') logError(new Error(errMsg), '_atFetch');
      if (typeof showErrorToast === 'function') showErrorToast(errMsg, 'error');
      throw new Error(errMsg);
    }
    records = records.concat(data.records || []);
    offset  = data.offset || '';
  } while (offset);
  return records;
}

// ── Public API ────────────────────────────────────

/**
 * Fetch records from an Airtable table with optional filtering and caching
 * @param {string} tableId - Airtable table ID (e.g. TABLES.ORDERS)
 * @param {string} [filter=''] - filterByFormula string
 * @param {boolean} [useCache=true] - Whether to use memory/localStorage cache
 * @returns {Promise<Array<{id:string, fields:Object}>>} Array of Airtable records
 */
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
  // Field change protection: validate expected fields on first fetch
  const expectation = _FIELD_EXPECTATIONS[tableId];
  if (expectation && records.length > 0) {
    _validateFields(records, expectation.fields, expectation.context);
  }
  _memSet(key, records);
  if (stable) _lsSet(key, records);
  return records;
}

/**
 * Fetch records with advanced options (fields, sort, filter)
 * @param {string} tableId - Airtable table ID
 * @param {Object} [opts={}] - Query options
 * @param {string} [opts.filterByFormula] - Airtable filter formula
 * @param {string[]} [opts.fields] - Array of field names to return
 * @param {Array<{field:string, direction?:string}>} [opts.sort] - Sort specification
 * @param {boolean} [useCache=true] - Whether to use cache
 * @returns {Promise<Array<{id:string, fields:Object}>>} Array of Airtable records
 */
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
  // Field change protection: validate expected fields (only when not using field filter)
  if (!opts.fields) {
    const expectation = _FIELD_EXPECTATIONS[tableId];
    if (expectation && records.length > 0) {
      _validateFields(records, expectation.fields, expectation.context);
    }
  }
  _memSet(key, records);
  if (stable) _lsSet(key, records);
  return records;
}

/**
 * Update (PATCH) a single Airtable record
 * @param {string} tableId - Airtable table ID
 * @param {string} recId - Record ID to update
 * @param {Object} fields - Key/value pairs of fields to update
 * @returns {Promise<{id:string, fields:Object}>} Updated record
 */
async function atPatch(tableId, recId, fields) {
  _auditLog('PATCH', tableId, recId, fields);
  if (!_isOnline()) {
    _queueOffline('PATCH', _apiUrl(`/v0/${AT_BASE}/${tableId}/${recId}`), { fields }, recId);
    return { id: recId, fields, _offline: true };
  }
  const res = await _enqueue(() => _atRetry(() => fetch(_apiUrl(`/v0/${AT_BASE}/${tableId}/${recId}`), {
    method: 'PATCH',
    headers: _apiHeaders('PATCH'),
    body: JSON.stringify({ fields, typecast: true })
  })));
  const data = await res.json();
  if (data.error) {
    const errMsg = data.error.message || data.error.type || 'Unknown Airtable error';
    if (typeof logError === 'function') logError(new Error(errMsg), `atPatch(${tableId}, ${recId})`);
    if (typeof showErrorToast === 'function') showErrorToast(errMsg, 'error');
    throw new Error(errMsg);
  }
  invalidateCache(tableId);
  atNotifyChange(tableId);
  return data;
}

/**
 * Create a new Airtable record
 * @param {string} tableId - Airtable table ID
 * @param {Object} fields - Key/value pairs for the new record
 * @returns {Promise<{id:string, fields:Object}>} Created record with generated ID
 */
async function atCreate(tableId, fields) {
  _auditLog('CREATE', tableId, null, fields);
  if (!_isOnline()) {
    _queueOffline('POST', _apiUrl(`/v0/${AT_BASE}/${tableId}`), { fields });
    return { id: 'offline_' + Date.now(), fields, _offline: true };
  }
  const res = await _enqueue(() => _atRetry(() => fetch(_apiUrl(`/v0/${AT_BASE}/${tableId}`), {
    method: 'POST',
    headers: _apiHeaders('POST'),
    body: JSON.stringify({ fields, typecast: true })
  })));
  const data = await res.json();
  if (data.error) {
    const errMsg = data.error.message || data.error.type || 'Unknown Airtable error';
    if (typeof logError === 'function') logError(new Error(errMsg), `atCreate(${tableId})`);
    if (typeof showErrorToast === 'function') showErrorToast(errMsg, 'error');
    throw new Error(errMsg);
  }
  invalidateCache(tableId);
  atNotifyChange(tableId);
  return data;
}

/**
 * Delete a single Airtable record
 * @param {string} tableId - Airtable table ID
 * @param {string} recId - Record ID to delete
 * @returns {Promise<{id:string, deleted:boolean}>} Deletion confirmation
 */
async function atDelete(tableId, recId) {
  _auditLog('DELETE', tableId, recId, null);
  if (!_isOnline()) {
    _queueOffline('DELETE', _apiUrl(`/v0/${AT_BASE}/${tableId}/${recId}`), null, recId);
    return { id: recId, deleted: true, _offline: true };
  }
  const res = await _enqueue(() => _atRetry(() => fetch(_apiUrl(`/v0/${AT_BASE}/${tableId}/${recId}`), {
    method: 'DELETE',
    headers: _apiHeaders('DELETE')
  })));
  const data = await res.json();
  if (data.error) {
    const errMsg = data.error.message || data.error.type || 'Unknown Airtable error';
    if (typeof logError === 'function') logError(new Error(errMsg), `atDelete(${tableId}, ${recId})`);
    if (typeof showErrorToast === 'function') showErrorToast(errMsg, 'error');
    throw new Error(errMsg);
  }
  invalidateCache(tableId);
  atNotifyChange(tableId);
  return data;
}

/**
 * Fetch a single Airtable record by ID
 * @param {string} tableId - Airtable table ID
 * @param {string} recId - Record ID to fetch
 * @returns {Promise<{id:string, fields:Object}>} Single Airtable record
 */
async function atGetOne(tableId, recId) {
  const res = await _enqueue(() => _atRetry(() => fetch(
    _apiUrl(`/v0/${AT_BASE}/${tableId}/${recId}`),
    { headers: _apiHeaders('GET') }
  )));
  const data = await res.json();
  if (data.error) {
    const errMsg = data.error.message || data.error.type || 'Unknown Airtable error';
    if (typeof logError === 'function') logError(new Error(errMsg), `atGetOne(${tableId}, ${recId})`);
    if (typeof showErrorToast === 'function') showErrorToast(errMsg, 'error');
    throw new Error(errMsg);
  }
  return data;
}

/**
 * Batch create multiple Airtable records (up to 10 per request)
 * @param {string} tableId - Airtable table ID
 * @param {Array<Object>} recordsArr - Array of {fields: {...}} objects
 * @returns {Promise<Array<{id:string, fields:Object}>>} Created records
 */
async function atCreateBatch(tableId, recordsArr) {
  const results = [];
  for (let i = 0; i < recordsArr.length; i += 10) {
    const batch = recordsArr.slice(i, i + 10);
    _auditLog('CREATE_BATCH', tableId, null, { count: batch.length });
    const res = await _enqueue(() => _atRetry(() => fetch(
      _apiUrl(`/v0/${AT_BASE}/${tableId}`),
      {
        method: 'POST',
        headers: _apiHeaders('POST'),
        body: JSON.stringify({ records: batch, typecast: true })
      }
    )));
    const data = await res.json();
    if (data.error) {
      const errMsg = data.error.message || data.error.type || 'Unknown Airtable error';
      if (typeof logError === 'function') logError(new Error(errMsg), `atCreateBatch(${tableId})`);
      if (typeof showErrorToast === 'function') showErrorToast(errMsg, 'error');
      throw new Error(errMsg);
    }
    if (data.records) {
      const errors = data.records.filter(r => r.error);
      if (errors.length) {
        const errMsg = errors.map(e => e.error.message || e.error.type).join('; ');
        if (typeof logError === 'function') logError(new Error(errMsg), `atCreateBatch(${tableId}) partial`);
        if (typeof showErrorToast === 'function') showErrorToast(`Batch partial error: ${errMsg}`, 'warn');
      }
      results.push(...data.records.filter(r => !r.error));
    }
  }
  invalidateCache(tableId);
  atNotifyChange(tableId);
  return results;
}

/**
 * Batch update multiple Airtable records (up to 10 per request)
 * @param {string} tableId - Airtable table ID
 * @param {Array<{id:string, fields:Object}>} recordsArr - Array of {id, fields} objects
 * @returns {Promise<Array<{id:string, fields:Object}>>} Updated records
 */
async function atPatchBatch(tableId, recordsArr) {
  const results = [];
  for (let i = 0; i < recordsArr.length; i += 10) {
    const batch = recordsArr.slice(i, i + 10);
    _auditLog('PATCH_BATCH', tableId, null, { count: batch.length });
    const res = await _enqueue(() => _atRetry(() => fetch(
      _apiUrl(`/v0/${AT_BASE}/${tableId}`),
      {
        method: 'PATCH',
        headers: _apiHeaders('PATCH'),
        body: JSON.stringify({ records: batch, typecast: true })
      }
    )));
    const data = await res.json();
    if (data.error) {
      const errMsg = data.error.message || data.error.type || 'Unknown Airtable error';
      if (typeof logError === 'function') logError(new Error(errMsg), `atPatchBatch(${tableId})`);
      if (typeof showErrorToast === 'function') showErrorToast(errMsg, 'error');
      throw new Error(errMsg);
    }
    if (data.records) {
      const errors = data.records.filter(r => r.error);
      if (errors.length) {
        const errMsg = errors.map(e => e.error.message || e.error.type).join('; ');
        if (typeof logError === 'function') logError(new Error(errMsg), `atPatchBatch(${tableId}) partial`);
        if (typeof showErrorToast === 'function') showErrorToast(`Batch partial error: ${errMsg}`, 'warn');
      }
      results.push(...data.records.filter(r => !r.error));
    }
  }
  invalidateCache(tableId);
  atNotifyChange(tableId);
  return results;
}

function invalidateCache(tableId) {
  Object.keys(_MEM).forEach(k => { if (k.startsWith(tableId)) delete _MEM[k]; });
  try {
    const prefix = 'at_' + _userPrefix() + '_' + tableId;
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(prefix)) localStorage.removeItem(k);
    });
  } catch(e) { if (typeof logError === 'function') logError(e, 'invalidateCache localStorage'); }
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
  // Load and flush any queued offline mutations
  _loadOfflineQueue();
  _flushOfflineQueue();
}

// ═══════════════════════════════════════════════
// REFERENCE DATA — Single fetch, global cache
// ═══════════════════════════════════════════════
// Fetches ALL reference tables once with ALL needed fields.
// Modules use getRefTrucks() etc. instead of calling atGetAll() repeatedly.

const REF_DATA = {
  trucks: null, drivers: null, trailers: null,
  locations: null, clients: null, partners: null,
  _loaded: false, _loading: null,
};

const _REF_FIELDS = {
  trucks:    ['License Plate', 'Active', 'KTEO Expiry', 'KEK Expiry', 'Insurance Expiry'],
  drivers:   ['Full Name', 'Active'],
  trailers:  ['License Plate', 'Active', 'KTEO Expiry', 'Insurance Expiry'],
  locations: ['Name', 'City', 'Country', 'Latitude', 'Longitude'],
  clients:   ['Company Name'],
  partners:  ['Company Name', 'Adress', 'Country'],
};

/**
 * Preload all reference/lookup tables (trucks, drivers, trailers, locations, clients, partners).
 * Fetches in parallel and populates REF_DATA. Safe to call multiple times (deduped).
 * @returns {Promise<Object>} REF_DATA object with all reference arrays populated
 */
async function preloadReferenceData() {
  if (REF_DATA._loaded) return REF_DATA;
  // Prevent duplicate parallel loads
  if (REF_DATA._loading) return REF_DATA._loading;

  const T = typeof TABLES !== 'undefined' ? TABLES : {};
  REF_DATA._loading = Promise.all([
    atGetAll(T.TRUCKS,    { fields: _REF_FIELDS.trucks },    true),
    atGetAll(T.DRIVERS,   { fields: _REF_FIELDS.drivers },   true),
    atGetAll(T.TRAILERS,  { fields: _REF_FIELDS.trailers },  true),
    atGetAll(T.LOCATIONS, { fields: _REF_FIELDS.locations },  true),
    atGetAll(T.CLIENTS,   { fields: _REF_FIELDS.clients },   true),
    atGetAll(T.PARTNERS,  { fields: _REF_FIELDS.partners },  true),
  ]).then(([trucks, drivers, trailers, locations, clients, partners]) => {
    REF_DATA.trucks    = trucks;
    REF_DATA.drivers   = drivers;
    REF_DATA.trailers  = trailers;
    REF_DATA.locations = locations;
    REF_DATA.clients   = clients;
    REF_DATA.partners  = partners;
    REF_DATA._loaded   = true;
    REF_DATA._loading  = null;
    return REF_DATA;
  });

  return REF_DATA._loading;
}

// Convenience accessors — return cached arrays or empty arrays if not yet loaded
function getRefTrucks()    { return REF_DATA.trucks    || []; }
function getRefDrivers()   { return REF_DATA.drivers   || []; }
function getRefTrailers()  { return REF_DATA.trailers  || []; }
function getRefLocations() { return REF_DATA.locations || []; }
function getRefClients()   { return REF_DATA.clients   || []; }
function getRefPartners()  { return REF_DATA.partners  || []; }

// Build id→fields lookup map from ref data array
function refMap(arr) {
  const m = {};
  (arr || []).forEach(r => { m[r.id] = r.fields; });
  return m;
}

// Invalidate ref data (call after mutations to ref tables)
function invalidateRefData() {
  REF_DATA.trucks = REF_DATA.drivers = REF_DATA.trailers = null;
  REF_DATA.locations = REF_DATA.clients = REF_DATA.partners = null;
  REF_DATA._loaded = false;
  REF_DATA._loading = null;
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
    } catch(e) { if (typeof logError === 'function') logError(e, 'atSafePatch version check'); } // If check fails, proceed anyway
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
    } catch(e) { if (typeof logError === 'function') logError(e, 'presence heartbeat'); }
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
  } catch(e) { if (typeof logError === 'function') logError(e, 'BroadcastChannel init'); } // BroadcastChannel not supported in all browsers
}

// Notify other tabs that a table changed (call after mutations)
function atNotifyChange(tableId) {
  try {
    if (_presenceChannel) {
      _presenceChannel.postMessage({ type: 'invalidate', table: tableId });
    }
  } catch(e) { if (typeof logError === 'function') logError(e, 'atNotifyChange broadcast'); }
}

// ── 4. Soft Delete (trash before delete) ─────────
/**
 * Save record to localStorage trash, then permanently delete from Airtable.
 * Keeps last 50 deleted records for potential recovery.
 * @param {string} tableId - Airtable table ID
 * @param {string} recordId - Record ID to delete
 * @returns {Promise<{id:string, deleted:boolean}>} Deletion confirmation
 */
async function atSoftDelete(tableId, recordId) {
  // Save to trash before deleting
  try {
    const rec = await atGetOne(tableId, recordId);
    const trash = JSON.parse(localStorage.getItem('tms_trash') || '[]');
    trash.unshift({
      id: recordId,
      table: tableId,
      fields: rec.fields,
      deletedAt: new Date().toISOString(),
      deletedBy: JSON.parse(localStorage.getItem('tms_user') || '{}').name || 'unknown',
    });
    // Keep last 50 deleted records
    if (trash.length > 50) trash.length = 50;
    localStorage.setItem('tms_trash', JSON.stringify(trash));
  } catch(e) {
    if (typeof logError === 'function') logError(e, 'soft delete backup');
  }
  // Then actually delete
  return atDelete(tableId, recordId);
}

/**
 * Get all items in the trash (soft-deleted records)
 * @returns {Array} Array of trash entries
 */
function getTrash() {
  try { return JSON.parse(localStorage.getItem('tms_trash') || '[]'); }
  catch { return []; }
}

/**
 * Restore a record from trash back to its original table
 * @param {number} trashIndex - Index of the item in the trash array
 * @returns {Promise<{id:string, fields:Object}|null>} Restored record or null
 */
async function atRestoreFromTrash(trashIndex) {
  try {
    const trash = getTrash();
    if (trashIndex < 0 || trashIndex >= trash.length) return null;
    const item = trash[trashIndex];
    // Re-create the record in its original table
    const restored = await atCreate(item.table, item.fields);
    // Remove from trash
    trash.splice(trashIndex, 1);
    localStorage.setItem('tms_trash', JSON.stringify(trash));
    return restored;
  } catch(e) {
    if (typeof logError === 'function') logError(e, 'atRestoreFromTrash');
    if (typeof showErrorToast === 'function') showErrorToast('Restore failed: ' + e.message, 'error');
    return null;
  }
}

// ── 5. Field Change Protection ───────────────────
/**
 * Validate that expected fields exist in fetched records.
 * Warns in console and logs error if fields are missing (e.g. renamed in Airtable).
 * @param {Array} records - Array of Airtable records
 * @param {string[]} expectedFields - Field names that should exist
 * @param {string} context - Description for the warning message
 */
function _validateFields(records, expectedFields, context) {
  if (!records.length || !expectedFields.length) return;
  const actualFields = Object.keys(records[0].fields || {});
  const missing = expectedFields.filter(f => !actualFields.includes(f));
  if (missing.length > 0) {
    const msg = `Missing fields in ${context}: ${missing.join(', ')}`;
    console.warn('[TMS]', msg);
    if (typeof logError === 'function') logError(new Error(msg), 'field_validation');
  }
}

// Field expectations per table (add more as needed)
const _FIELD_EXPECTATIONS = {};
_FIELD_EXPECTATIONS[typeof TABLES !== 'undefined' && TABLES.ORDERS   ? TABLES.ORDERS   : ''] = { fields: ['Direction', 'Status', 'Loading DateTime', 'Delivery DateTime', 'Client'], context: 'ORDERS' };
_FIELD_EXPECTATIONS[typeof TABLES !== 'undefined' && TABLES.TRUCKS   ? TABLES.TRUCKS   : ''] = { fields: ['License Plate', 'Active'], context: 'TRUCKS' };
_FIELD_EXPECTATIONS[typeof TABLES !== 'undefined' && TABLES.RAMP     ? TABLES.RAMP     : ''] = { fields: ['Type', 'Plan Date', 'Status', 'Supplier/Client'], context: 'RAMP PLAN' };

// Get list of online users
function atGetOnlineUsers() {
  try {
    const all = JSON.parse(localStorage.getItem(_PRESENCE_KEY) || '{}');
    const now = Date.now();
    return Object.entries(all)
      .filter(([_, v]) => now - v.ts < _PRESENCE_TTL)
      .map(([name, v]) => ({ name, role: v.role, page: v.page, lastSeen: v.ts }));
  } catch(e) { if (typeof logError === 'function') logError(e, 'atGetOnlineUsers'); return []; }
}
