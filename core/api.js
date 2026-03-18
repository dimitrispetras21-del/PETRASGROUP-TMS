// ═══════════════════════════════════════════════
// CORE — AIRTABLE API
// ═══════════════════════════════════════════════

const _cache = {};

async function atGet(tableId, filter = '', useCache = true) {
  const key = tableId + filter;
  if (useCache && _cache[key] && (Date.now() - _cache[key].ts < 60000)) {
    return _cache[key].data;
  }
  let records = [], offset = '';
  do {
    let url = `https://api.airtable.com/v0/${AT_BASE}/${tableId}?pageSize=100`;
    if (filter) url += `&filterByFormula=${encodeURIComponent(filter)}`;
    if (offset) url += `&offset=${offset}`;
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + AT_TOKEN } });
    const data = await res.json();
    records = records.concat(data.records || []);
    offset = data.offset || '';
  } while (offset);
  _cache[key] = { data: records, ts: Date.now() };
  return records;
}

async function atPatch(tableId, recId, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${tableId}/${recId}`, {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + AT_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  return res.json();
}

async function atCreate(tableId, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${tableId}`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + AT_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  return res.json();
}

// atGetAll — accepts options object {filterByFormula, fields, sort}
async function atGetAll(tableId, opts = {}, useCache = true) {
  const params = [];
  if (opts.filterByFormula) params.push(`filterByFormula=${encodeURIComponent(opts.filterByFormula)}`);
  if (opts.fields) opts.fields.forEach(f => params.push(`fields[]=${encodeURIComponent(f)}`));
  if (opts.sort) opts.sort.forEach(s => params.push(`sort[0][field]=${encodeURIComponent(s.field)}&sort[0][direction]=${s.direction||'asc'}`));
  const paramStr = params.join('&');
  const key = tableId + paramStr;
  if (useCache && _cache[key] && (Date.now() - _cache[key].ts < 60000)) return _cache[key].data;
  let records = [], offset = '';
  do {
    let url = `https://api.airtable.com/v0/${AT_BASE}/${tableId}?pageSize=100${paramStr?'&'+paramStr:''}`;
    if (offset) url += `&offset=${offset}`;
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + AT_TOKEN } });
    const data = await res.json();
    records = records.concat(data.records || []);
    offset = data.offset || '';
  } while (offset);
  _cache[key] = { data: records, ts: Date.now() };
  return records;
}

async function atDelete(tableId, recId) {
  const res = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${tableId}/${recId}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + AT_TOKEN }
  });
  return res.json();
}

function invalidateCache(tableId) {
  Object.keys(_cache).forEach(k => { if (k.startsWith(tableId)) delete _cache[k]; });
}

// Helper: extract first value from linked record / array field
function fv(v) {
  if (Array.isArray(v)) return v[0] || '';
  return v ?? '';
}
