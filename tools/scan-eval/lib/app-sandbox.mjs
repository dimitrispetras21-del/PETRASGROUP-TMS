// Runs TODAY's order scanner (International Orders → "New Order from Scan")
// in Node, from the app's own source files — not a re-implementation.
//
// Why load the real files instead of copying the prompts: a copy drifts the
// day someone edits the prompt (principle 3), and then the baseline measures
// a scanner that no longer exists. Here the prompts, model tiering, tool loop,
// Haiku clean-up, Opus escalation, fuzzy matching and form prefill all come
// from config.js, core/scan-helpers.js, core/form-helpers.js, core/countries.js
// and the scan functions of modules/orders_intl.js at the checked-out commit.
//
// The browser is replaced by minimal stubs (DOM, localStorage, FileReader).
// The only network access is the injected `fetch`.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Scan path of modules/orders_intl.js, in call order (batch flow = _scanExtract).
export const INTL_SCAN_FUNCTIONS = [
  '_scanHandleFiles', '_scanExtractCore', '_scanScore', '_scanWeak',
  '_intlBuildSystemPrompt', '_scanPreview', '_scanOpen',
];

// Fields the app preloads for the reference lists (core/api.js _REF_FIELDS).
// test/sandbox.test.mjs fails if these drift from api.js.
export const REF_FIELDS = {
  clients: ['Company Name'],
  locations: ['Name', 'City', 'Country', 'Latitude', 'Longitude'],
};

/**
 * Source text of one top-level function: the shortest slice ending in a
 * column-0 '}' that parses. (A '}' in column 0 also occurs inside template
 * literals — _intlBuildSystemPrompt's JSON schema — so "first '}'" is wrong.)
 */
export function extractFunction(src, name) {
  const re = new RegExp(`^(async\\s+)?function\\s+${name}\\s*\\(`, 'm');
  const m = re.exec(src);
  if (!m) throw new Error(`function ${name} not found — the scan path changed; update INTL_SCAN_FUNCTIONS`);
  for (let end = src.indexOf('\n}', m.index); end >= 0; end = src.indexOf('\n}', end + 2)) {
    const candidate = src.slice(m.index, end + 2);
    try { new vm.Script(candidate); return candidate; } catch { /* brace inside a string; keep going */ }
  }
  throw new Error(`function ${name}: no parseable end found`);
}

function fakeElement() {
  return {
    style: {}, innerHTML: '', textContent: '', value: '', disabled: false,
    insertAdjacentHTML() {}, appendChild() {}, click() {}, addEventListener() {},
  };
}

class FileReaderPolyfill {
  readAsDataURL(blob) {
    blob.arrayBuffer().then(buf => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
      this.onload && this.onload();
    }, e => this.onerror && this.onerror(e));
  }
}

// Browser MIME type by extension, as Chrome/Safari report File.type.
export function browserMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ({ '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.eml': 'message/rfc822', '.txt': 'text/plain' })[ext] || '';
}

/**
 * @param {object} o
 * @param {string} o.repoRoot
 * @param {Function} o.fetch            the only network path
 * @param {string} o.jwt                goes to localStorage.tms_jwt, as in the app
 * @param {{clients:Array, locations:Array}} o.refData  facade records {id, fields}
 * @param {Array} [o.examples]          localStorage 'tms_scan_training' (few-shot); [] = fresh browser
 * @param {'current'|'v2'} [o.engine]   'v2' flips the app's own switch (localStorage tms_scan_engine)
 * @param {object} [o.v2]               overrides for the app's SCAN_V2 settings (model, mode, effort, thinking)
 * @param {object} [o.clientHistory]    offline snapshot for scanV2ClientHistoryLocations/scanV2LocationAddressMap
 *   (round 3): { byClient: { [clientId]: [{id, fields}] }, address: { [locationId]: string } }. Built read-only
 *   from the real Worker by build-client-history.mjs. Omitted = atGetAll(ORDERS by Client) returns [] (today's
 *   default — no history signal), matching every test written before round 3.
 */
export function createScannerSandbox({ repoRoot, fetch, jwt, refData, examples = [], engine = 'current', v2 = {}, clientHistory = null }) {
  const events = { toasts: [], errors: [], logs: [] };
  const store = new Map([['tms_jwt', jwt || ''], ['tms_scan_training', JSON.stringify(examples)]]);
  if (engine === 'v2') store.set('tms_scan_engine', 'v2');
  const elements = new Map();
  let captured = null;
  // Set per scanFile() call (run-current.mjs): the golden doc's OWN saved
  // order id, so a client's order history never includes the very answer
  // being scored — see the leakage note in build-client-history.mjs.
  let excludeOrderId = null;
  let excludeCreatedAtOrAfter = null;

  const ctx = {
    console: { log: (...a) => events.logs.push(a.join(' ')), warn: (...a) => events.logs.push(a.join(' ')), error: (...a) => events.logs.push(a.join(' ')), info() {}, debug() {} },
    // DecompressionStream: core/doc-text.js's .docx reader inflates zip
    // entries with it (native in Node >= 18, same object the outer process
    // already has — vm.createContext gives the sandbox NOTHING it isn't
    // handed explicitly, so without this line the .docx path would throw
    // "no DecompressionStream" only inside this harness, never in a browser).
    setTimeout, clearTimeout, AbortController, URL, Blob, File, TextEncoder, TextDecoder, DecompressionStream, Intl, structuredClone, btoa, atob, WeakMap,
    fetch,
    FileReader: FileReaderPolyfill,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    document: {
      getElementById: id => { if (!elements.has(id)) elements.set(id, fakeElement()); return elements.get(id); },
      createElement: () => fakeElement(),
      head: fakeElement(),
    },
    // App globals the scan path touches.
    toast: (msg, type) => events.toasts.push({ msg: String(msg), type }),
    _tmsLog: () => {},
    logError: (e, where) => events.errors.push({ where, message: e && e.message }),
    closeModal: () => {},
    openIntlScan: () => {},
    _searchClients: async () => [],
    // Duplicate-reference check in _scanPreview, and (round 3) scanV2ClientHistoryLocations
    // / scanV2LocationAddressMap in core/scan-engine-v2.js, all go through this one stub.
    // Without a clientHistory snapshot everything still returns [] — the pre-round-3
    // behaviour, so old tests that don't pass the option are unaffected.
    atGetAll: async (tableId, opts = {}) => {
      // TABLES is a `const` inside the loaded vm scripts, so it never becomes
      // an own property of the plain `ctx` object this closure was defined on
      // (that's only true for `var`/function declarations) — `run(...)` reads
      // it the same way `constants()` below does.
      const filter = opts.filterByFormula || '';
      if (clientHistory && tableId === run('TABLES.ORDERS') && /^FIND\(/.test(filter)) {
        const m = /FIND\("([^"]+)"/.exec(filter);
        const clientId = m && m[1];
        const recs = (clientHistory.byClient && clientHistory.byClient[clientId]) || [];
        // Leakage guard (docs/scan/04 task 3): the golden truth for a document
        // was built FROM its own saved order, so that exact record — and
        // anything saved after it — must never come back as "history" while
        // scoring THAT document. Two independent checks (id, timestamp)
        // because either alone could miss an edge case silently.
        return recs.filter(r => r.id !== excludeOrderId
          && (!excludeCreatedAtOrAfter || !r.fields || !r.fields['Created At'] || r.fields['Created At'] < excludeCreatedAtOrAfter));
      }
      if (clientHistory && tableId === run('TABLES.LOCATIONS') && (opts.fields || []).includes('Address')) {
        const addr = clientHistory.address || {};
        return Object.keys(addr).map(id => ({ id, fields: { Address: addr[id] } }));
      }
      return [];
    },
    atGet: async () => refData.locations,
    getRefClients: () => refData.clients,
    getRefLocations: () => refData.locations,
    _openModal: async (id, f, clientLabel, stops) => { captured = { f, clientLabel, stops }; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);

  const load = (rel, code) => vm.runInContext(code ?? fs.readFileSync(path.join(repoRoot, rel), 'utf8'), ctx, { filename: rel });
  load('config.js');
  load('core/countries.js');
  const utils = fs.readFileSync(path.join(repoRoot, 'core/utils.js'), 'utf8');
  load('core/utils.js#escapeHtml', extractFunction(utils, 'escapeHtml'));
  load('core/scan-helpers.js');
  load('core/doc-text.js');
  load('core/scan-engine-v2.js');
  load('core/form-helpers.js');
  const intl = fs.readFileSync(path.join(repoRoot, 'modules/orders_intl.js'), 'utf8');
  for (const fn of INTL_SCAN_FUNCTIONS) load(`modules/orders_intl.js#${fn}`, extractFunction(intl, fn));
  // The PDF thumbnail loads pdf.js from a CDN <script>; irrelevant to extraction.
  vm.runInContext('scanRenderPDFPreview = async () => null;', ctx);
  // Engine v2 reads the PDF text layer with pdf.js; the browser loads the same
  // version (3.11.174) from the CDN, here it comes from node_modules.
  ctx.__pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  vm.runInContext('_scanLoadPdfJs = async () => __pdfjs;', ctx);
  for (const [k, v] of Object.entries(v2)) if (v != null) vm.runInContext(`SCAN_V2[${JSON.stringify(k)}] = ${JSON.stringify(v)};`, ctx);

  const run = code => vm.runInContext(code, ctx);
  const ready = run('fhLoadLocations()');

  return {
    events,
    constants: () => run('({ MODELS, PROXY_URL, AT_BASE, TABLES: { CLIENTS: TABLES.CLIENTS, LOCATIONS: TABLES.LOCATIONS, ORDERS: TABLES.ORDERS }, SCAN_MAX_TOKENS, F, SCAN_V2: { ...SCAN_V2 } })'),
    // Test-only escape hatch: calls a scan-engine-v2.js internal (e.g.
    // _sv2PalletsFromText, _sv2Calibrate, _sv2PickLocation) without going
    // through a full scanFile() round trip. Never used by run-current.mjs.
    run,
    /**
     * One file through the batch flow: gate → extract → preview/match → form prefill.
     * @param {{excludeOrderId?:string, excludeCreatedAtOrAfter?:string}} [opts] round 3: the golden
     *   doc's own saved order id (and its "Created At"), excluded from scanV2ClientHistoryLocations
     *   so scoring never leaks the answer key — or anything saved after it — into the client's history.
     * @returns {{status:'ok'|'rejected'|'error', error?:string, parsed?:object, form?:object, matched?:object}}
     */
    async scanFile(file, opts = {}) {
      await ready;
      excludeOrderId = opts.excludeOrderId || null;
      excludeCreatedAtOrAfter = opts.excludeCreatedAtOrAfter || null;
      captured = null;
      events.toasts.length = 0; events.errors.length = 0;
      ctx._scanFiles = []; ctx._scanUploadedFile = null; ctx._scanResult = null;
      ctx._scanHandleFiles([file]);
      if (!ctx._scanFiles.length) {
        return { status: 'rejected', error: events.toasts.map(t => t.msg).join(' | ') || 'rejected by upload gate' };
      }
      const parsed = await ctx._scanExtractCore(file);
      if (!parsed) {
        const err = events.errors.map(e => e.message).join(' | ') || elements.get('scanStatus')?.innerHTML || 'extraction returned nothing';
        return { status: 'error', error: err.replace(/<[^>]+>/g, '').trim() };
      }
      await ctx._scanPreview(parsed);
      const result = ctx._scanResult;
      if (!result) return { status: 'error', error: '_scanPreview produced no _scanResult', parsed };
      await ctx._scanOpen(result.matched, result.data);
      if (!captured) return { status: 'error', error: '_scanOpen did not reach the form', parsed };
      return { status: 'ok', parsed, matched: result.matched, form: captured };
    },
  };
}

/** Form prefill (what the dispatcher would see) → canonical prediction for score.mjs. */
export function toPrediction({ parsed, matched, form }, F) {
  const f = form.f || {};
  const stopOut = (list, type, rawList) => (list || []).map((s, i) => ({
    type,
    location_id: (s.fields[F.STOP_LOCATION] || [])[0] || null,
    date: s.fields[F.STOP_DATETIME] || null,
    pallets: s.fields[F.STOP_PALLETS] ?? null,
    city: rawList?.[i]?.city || null,
    country: rawList?.[i]?.country || null,
  }));
  const loading = stopOut(form.stops?.loadStops, 'loading', matched?.loadStops);
  const delivery = stopOut(form.stops?.unloadStops, 'delivery', matched?.delStops);
  // The order form shows total pallets as the sum of loading stops (what gets
  // saved); fall back to the AI total only when no loading stop carries any.
  const stopSum = loading.reduce((s, x) => s + (Number(x.pallets) || 0), 0);
  const conf = { ...(parsed.field_confidence || {}) };
  return {
    client_id: (f['Client'] || [])[0] || null,
    reference: f['Reference'] ?? null,
    direction: f['Direction'] ?? null,
    goods: f['Goods'] ?? null,
    gross_weight_kg: f['Gross Weight kg'] ?? null,
    pallets: stopSum || parsed.pallets || null,
    pallet_type: f['Pallet Type'] ?? null,        // today's scanner never sets it
    temperature_c: f['Temperature °C'] ?? null,
    price: f['Price'] ?? null,
    notes: f['Notes'] ?? null,
    stops: [...loading, ...delivery],
    confidence: conf,
    overall_confidence: parsed.confidence ?? null,
  };
}
