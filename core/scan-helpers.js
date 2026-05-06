// ═══════════════════════════════════════════════════════════════
// CORE — SCAN HELPERS
// Shared utilities for Orders Intl + Natl + Pallet scans:
//  - Image preprocessing (auto-rotate, resize, base64)
//  - PDF first-page preview rendering
//  - Anthropic API call with retry + timeout
//  - Document type detection (1st-pass classifier)
//  - Few-shot prompting from stored corrections
// ═══════════════════════════════════════════════════════════════
'use strict';

// ─── Tiered model selection ─────────────────────────────────────
// Different document types get different models — quality where it matters,
// cost-efficient where it doesn't.
//
//   Opus 4.6   → multi-stop / complex / unknown (max accuracy, ~$0.12/scan)
//   Sonnet 4   → simple Greek delivery notes + pallet sheets (~$0.024/scan)
//   Haiku 4    → only doc-type classification (~$0.005/scan)
//
// For typical Petras volume (~100 scans/month), tiered cost ≈ $6/mo
// vs $12 Opus-only or $2.40 Sonnet-only — small price for noticeable
// accuracy gain on the docs that actually matter (carrier orders, CMRs).
const SCAN_MODEL_OPUS   = 'claude-opus-4-6';
const SCAN_MODEL_SONNET = 'claude-sonnet-4-20250514';
const SCAN_MODEL_HAIKU  = 'claude-haiku-4-20250514';

const SCAN_MODELS_BY_TYPE = {
  CARRIER_ORDER: SCAN_MODEL_OPUS,    // multi-stop, complex tables
  CMR:           SCAN_MODEL_OPUS,    // 24 fields, small text
  DELIVERY_NOTE: SCAN_MODEL_SONNET,  // simple Greek format
  PALLET_SHEET:  SCAN_MODEL_SONNET,  // numerical, low complexity
  UNKNOWN:       SCAN_MODEL_OPUS,    // default to quality
};

/** Returns the right model for a given document type. */
function scanModelForType(docType) {
  return SCAN_MODELS_BY_TYPE[docType] || SCAN_MODEL_OPUS;
}

/** Friendly label for UI display. */
function scanModelLabel(model) {
  if (model === SCAN_MODEL_OPUS)   return 'Opus (high accuracy)';
  if (model === SCAN_MODEL_SONNET) return 'Sonnet (balanced)';
  if (model === SCAN_MODEL_HAIKU)  return 'Haiku (fast)';
  return model;
}

// Backwards-compat alias for code that still references SCAN_MODEL
const SCAN_MODEL = SCAN_MODEL_SONNET;
const SCAN_MAX_TOKENS = 4000;                     // bumped from 1000 (was cutting multi-stop)
const SCAN_TIMEOUT_MS = 60000;                    // 60s per call
const SCAN_MAX_RETRIES = 2;                       // total 3 attempts
const SCAN_TRAINING_KEY = 'tms_scan_training';   // localStorage key for few-shot examples
const SCAN_TRAINING_MAX = 30;                     // keep last 30 corrections

// ─── Image preprocessing ────────────────────────────────────────
/**
 * Read EXIF orientation tag from JPEG and return rotation degrees.
 * Returns 0 for non-JPEG or missing EXIF.
 */
async function _scanReadExifOrientation(file) {
  if (!file.type.startsWith('image/jpeg')) return 0;
  const buf = await file.slice(0, 65536).arrayBuffer();
  const view = new DataView(buf);
  if (view.getUint16(0) !== 0xFFD8) return 0;       // not JPEG
  let off = 2;
  while (off < view.byteLength) {
    const marker = view.getUint16(off);
    if (marker === 0xFFE1) {                        // APP1 / EXIF
      if (view.getUint32(off + 4) !== 0x45786966) return 0;
      const little = view.getUint16(off + 10) === 0x4949;
      const ifdOff = off + 10 + view.getUint32(off + 14, little);
      const tags = view.getUint16(ifdOff, little);
      for (let i = 0; i < tags; i++) {
        const tagOff = ifdOff + 2 + i * 12;
        if (view.getUint16(tagOff, little) === 0x0112) {
          const o = view.getUint16(tagOff + 8, little);
          return ({ 1: 0, 3: 180, 6: 90, 8: 270 }[o]) || 0;
        }
      }
      return 0;
    }
    off += 2 + view.getUint16(off + 2);
  }
  return 0;
}

/**
 * Preprocess uploaded image for AI extraction:
 *   - auto-rotate based on EXIF orientation
 *   - resize to max 2000px on longest side
 *   - re-encode as JPEG quality 0.85 (smaller payload, ~75% saving on phone shots)
 *   - return { blob, base64, mediaType }
 *
 * Skips processing for PDFs and small images (<1MB).
 */
async function scanPreprocessFile(file) {
  // PDFs pass through untouched
  if (file.type === 'application/pdf') {
    const b64 = await _scanFileToBase64(file);
    return { blob: file, base64: b64, mediaType: 'application/pdf', wasPreprocessed: false };
  }

  // Tiny images skip preprocessing
  if (!file.type.startsWith('image/')) {
    throw new Error('Unsupported file type: ' + file.type);
  }
  if (file.size < 500 * 1024) {
    const b64 = await _scanFileToBase64(file);
    return { blob: file, base64: b64, mediaType: file.type, wasPreprocessed: false };
  }

  const rotation = await _scanReadExifOrientation(file);
  const img = await _scanLoadImage(file);

  // Compute output dims (max 1600px longest side, preserve aspect).
  // Was 2000 — dropped to 1600 for ~25% fewer image tokens with negligible
  // accuracy loss on logistics docs (text remains legible).
  const MAX = 1600;
  let { width, height } = img;
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];
  const scale = Math.min(1, MAX / Math.max(width, height));
  const ow = Math.round(width * scale);
  const oh = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext('2d');

  // Apply rotation transform centered on canvas
  ctx.save();
  ctx.translate(ow / 2, oh / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  // Draw original (pre-rotation dims) into rotated frame
  const drawW = rotation === 90 || rotation === 270 ? oh : ow;
  const drawH = rotation === 90 || rotation === 270 ? ow : oh;
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  // Re-encode at quality 0.85
  const blob = await new Promise(res =>
    canvas.toBlob(res, 'image/jpeg', 0.85)
  );
  const b64 = await _scanFileToBase64(blob);
  return { blob, base64: b64, mediaType: 'image/jpeg', wasPreprocessed: true };
}

function _scanLoadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = e => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

function _scanFileToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(new Error('File read error'));
    r.readAsDataURL(blob);
  });
}

// ─── PDF first-page preview (uses pdf.js from CDN, lazy-loaded) ──
let _scanPdfJsLoaded = null;
async function _scanLoadPdfJs() {
  if (_scanPdfJsLoaded) return _scanPdfJsLoaded;
  _scanPdfJsLoaded = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.onload = () => {
      // eslint-disable-next-line no-undef
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      res(window.pdfjsLib);
    };
    s.onerror = () => rej(new Error('pdf.js failed to load'));
    document.head.appendChild(s);
  });
  return _scanPdfJsLoaded;
}

/**
 * Render the first page of a PDF file as a data-URL image (max 400px wide).
 * Returns null if pdf.js fails to load (offline). UI should fallback to a
 * generic PDF icon in that case.
 */
async function scanRenderPDFPreview(file) {
  try {
    const pdfjs = await _scanLoadPdfJs();
    const ab = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: ab }).promise;
    const page = await doc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.5, 400 / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (e) {
    console.warn('[scan] PDF preview failed:', e && e.message);
    return null;
  }
}

// ─── Anthropic API call with retry + timeout ────────────────────
/**
 * Call Anthropic /v1/messages with retry + timeout.
 * @param {Object} payload  body for the messages endpoint
 * @param {Object} [opts]   { retries, timeoutMs, signal }
 * @returns {Promise<Object>} parsed response
 */
async function scanCallAnthropic(payload, opts = {}) {
  const retries = opts.retries ?? SCAN_MAX_RETRIES;
  const timeoutMs = opts.timeoutMs ?? SCAN_TIMEOUT_MS;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTH_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(payload),
        signal: opts.signal || ctrl.signal,
      });
      clearTimeout(to);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        let msg = body.error?.message || `API error ${res.status}`;
        // Friendlier messages for common errors
        if (res.status === 429 || msg.includes('rate limit')) {
          msg = 'Rate limit reached — περιμένετε 60s και ξαναπροσπαθήστε. (Tip: μειώστε scans συγχρόνως)';
        } else if (res.status === 529) {
          msg = 'Anthropic API overloaded — προσπαθήστε ξανά σε λίγο.';
        }
        // Don't retry 4xx (except 429)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new Error(msg);
        }
        lastErr = new Error(msg);
      } else {
        return await res.json();
      }
    } catch (e) {
      clearTimeout(to);
      if (e.name === 'AbortError') {
        lastErr = new Error('AI request timed out (60s)');
      } else if (!lastErr) {
        lastErr = e;
      }
    }
    if (attempt < retries) {
      // Exponential backoff: 1s, 2s
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastErr || new Error('AI call failed after retries');
}

// ─── Document type detection (1st pass) ─────────────────────────
/**
 * Quick Haiku classify call. Returns one of:
 *   'CMR' | 'CARRIER_ORDER' | 'PALLET_SHEET' | 'DELIVERY_NOTE' | 'UNKNOWN'
 * Falls back to 'UNKNOWN' if the call fails — extraction can proceed with generic prompt.
 */
async function scanDetectDocType(base64, mediaType) {
  const content = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: base64 } };
  try {
    const data = await scanCallAnthropic({
      model: SCAN_MODEL_HAIKU,           // cheapest model — classification is simple
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: [
          content,
          { type: 'text', text:
            'Classify this logistics document into ONE category. Return ONLY the category code, nothing else:\n' +
            '- CMR (international waybill, multi-language, 24 numbered fields)\n' +
            '- CARRIER_ORDER (transport order with PAL column, supplier rows, dispatch instructions)\n' +
            '- PALLET_SHEET (EUR/EPAL pallet exchange / counting form)\n' +
            '- DELIVERY_NOTE (Greek δελτίο αποστολής, simple list)\n' +
            '- UNKNOWN (none of the above)'
          }
        ]
      }]
    }, { retries: 1, timeoutMs: 15000 });
    const text = (data.content?.find(c => c.type === 'text')?.text || '').trim().toUpperCase();
    const valid = ['CMR', 'CARRIER_ORDER', 'PALLET_SHEET', 'DELIVERY_NOTE'];
    return valid.find(v => text.includes(v)) || 'UNKNOWN';
  } catch (e) {
    console.warn('[scan] Doc type detection failed, defaulting to UNKNOWN:', e.message);
    return 'UNKNOWN';
  }
}

// ─── Few-shot training store ────────────────────────────────────
// Two-tier persistence:
//   1. Airtable `_SCAN_TRAINING` table  — shared across all users (canonical)
//   2. localStorage cache               — fast read, also fallback if table absent
//
// Airtable schema expected (create manually if not exists):
//   - Doc Type (single select: CMR/CARRIER_ORDER/PALLET_SHEET/DELIVERY_NOTE/UNKNOWN)
//   - Summary (text)
//   - Client (linked to CLIENTS, optional)
//   - AI Output (long text — JSON of original AI response)
//   - Corrected (long text — JSON of user-corrected final values)
//   - Created (date, auto-populated)
//
// If the table doesn't exist, all reads/writes degrade gracefully to localStorage.
const SCAN_TRAINING_TABLE = 'tbl_SCAN_TRAINING';  // overridable via TABLES.SCAN_TRAINING

/**
 * Save a correction. Writes to localStorage immediately + tries Airtable async.
 * @param {string} docType
 * @param {string} userInputSummary  filename / hint
 * @param {Object} aiOutput          original AI extraction
 * @param {Object} correctedOutput   user-corrected final values
 * @param {string} [clientId]        optional matched client id for client-aware few-shot
 */
function scanSaveCorrection(docType, userInputSummary, aiOutput, correctedOutput, clientId) {
  // 1. localStorage write — synchronous, never fails
  try {
    const list = JSON.parse(localStorage.getItem(SCAN_TRAINING_KEY) || '[]');
    list.unshift({
      ts: Date.now(),
      docType,
      summary: userInputSummary,
      clientId: clientId || null,
      ai: aiOutput,
      corrected: correctedOutput,
    });
    if (list.length > SCAN_TRAINING_MAX) list.length = SCAN_TRAINING_MAX;
    localStorage.setItem(SCAN_TRAINING_KEY, JSON.stringify(list));
  } catch (e) { console.warn('[scan] save correction (local) failed:', e.message); }

  // 2. Airtable write — async, best-effort
  const tableId = (typeof TABLES !== 'undefined' && TABLES.SCAN_TRAINING) || null;
  if (tableId && typeof atCreate === 'function') {
    const fields = {
      'Doc Type': docType,
      'Summary': userInputSummary || '',
      'AI Output':   JSON.stringify(aiOutput).slice(0, 50000),
      'Corrected':   JSON.stringify(correctedOutput).slice(0, 50000),
    };
    if (clientId) fields['Client'] = [clientId];
    atCreate(tableId, fields).catch(e => {
      console.warn('[scan] save correction (airtable) failed:', e.message);
    });
  }
}

/**
 * Get up to N relevant examples for few-shot prompting.
 * Smart selection prioritises examples from the SAME client when possible.
 *
 * @param {string} docType
 * @param {number} [limit=3]
 * @param {string} [hintClientId]  if provided, prefer examples from this client
 * @returns {Array} corrections sorted by relevance
 */
function scanGetTrainingExamples(docType, limit = 3, hintClientId = null) {
  try {
    let list = JSON.parse(localStorage.getItem(SCAN_TRAINING_KEY) || '[]');
    list = list.filter(e => e.docType === docType);
    if (!list.length) return [];

    // Client-aware ranking:
    //   1. Same client: most-recent first (huge boost)
    //   2. Other clients: most-recent first
    if (hintClientId) {
      const sameClient = list.filter(e => e.clientId === hintClientId);
      const otherClient = list.filter(e => e.clientId !== hintClientId);
      list = [...sameClient, ...otherClient];
    }
    return list.slice(0, limit);
  } catch { return []; }
}

/**
 * On app boot, hydrate localStorage cache from the canonical Airtable
 * _SCAN_TRAINING table. Best-effort — fails silently if table missing.
 */
async function scanHydrateTrainingCache() {
  const tableId = (typeof TABLES !== 'undefined' && TABLES.SCAN_TRAINING) || null;
  if (!tableId || typeof atGetAll !== 'function') return;
  try {
    const recs = await atGetAll(tableId, {
      maxRecords: SCAN_TRAINING_MAX,
      sort: [{ field: 'Created', direction: 'desc' }],
    }, false).catch(() => []);
    if (!recs?.length) return;
    const list = recs.map(r => {
      const f = r.fields || {};
      let ai = {}, corrected = {};
      try { ai = JSON.parse(f['AI Output'] || '{}'); } catch {}
      try { corrected = JSON.parse(f['Corrected'] || '{}'); } catch {}
      return {
        ts: new Date(f['Created'] || Date.now()).getTime(),
        docType: f['Doc Type'] || 'UNKNOWN',
        summary: f['Summary'] || '',
        clientId: (f['Client'] || [])[0] || null,
        ai, corrected,
      };
    });
    localStorage.setItem(SCAN_TRAINING_KEY, JSON.stringify(list));
    console.log('[scan] hydrated', list.length, 'training examples from Airtable');
  } catch (e) {
    console.warn('[scan] hydrate failed:', e.message);
  }
}

// ─── Aliases dictionary — common abbreviations & misspellings ──
// Edit/extend in core/scan-helpers.js. Used both at AI prompt-injection time
// (to tell the model what to expect) AND client-side fuzzy matching.
const SCAN_ALIASES = {
  // Greek cities — common English/Greeklish forms users type
  'ATH':         'Αθήνα',
  'ATHENS':      'Αθήνα',
  'ATHINA':      'Αθήνα',
  'THESS':       'Θεσσαλονίκη',
  'THESSALONIKI':'Θεσσαλονίκη',
  'SKG':         'Θεσσαλονίκη',
  'SALONIKA':    'Θεσσαλονίκη',
  'ASPRO':       'Ασπρόπυργος',
  'ASPROPYRGOS': 'Ασπρόπυργος',
  'PATRA':       'Πάτρα',
  'PATRAS':      'Πάτρα',
  'NAFPAKTOS':   'Ναύπακτος',
  'AGRINIO':     'Αγρίνιο',
  'AGRINION':    'Αγρίνιο',
  'KATERINI':    'Κατερίνη',
  'KATARINI':    'Κατερίνη',
  'NAUPLIO':     'Ναύπλιο',
  'NAFPLIO':     'Ναύπλιο',
  'VEROIA':      'Βέροια',
  'VERIA':       'Βέροια',
  'VELO':        'Βέλο',
  'IRAKLEIO':    'Ηράκλειο',
  'HERAKLION':   'Ηράκλειο',
  // Country codes
  'DE':          'Germany',
  'IT':          'Italy',
  'AT':          'Austria',
  'SI':          'Slovenia',
  'HR':          'Croatia',
  'HU':          'Hungary',
  'PL':          'Poland',
  'CZ':          'Czech Republic',
  'SK':          'Slovakia',
  'RO':          'Romania',
  'BG':          'Bulgaria',
};

/** Apply alias substitution to a string. Returns the canonical form. */
function scanResolveAlias(s) {
  if (!s) return s;
  const upper = String(s).trim().toUpperCase();
  return SCAN_ALIASES[upper] || s;
}

// ─── Fuzzy matching (lightweight Levenshtein, no external lib) ──
function _scanLevenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Find the best match in `candidates` for `query`.
 *
 * Combined scoring:
 *   - exact (case-insensitive) match → score 1.0
 *   - substring match → score 0.85 to 0.95 (longer match = higher)
 *   - Levenshtein normalized (0-1) where 1.0 = identical
 *   - alias resolution applied first
 *
 * @param {string} query
 * @param {Array<{id, label}>} candidates
 * @param {Object} [opts] { threshold: 0.6, limit: 1 }
 * @returns {Array<{id, label, score}>}  best matches sorted by score
 */
function scanFuzzyMatch(query, candidates, opts = {}) {
  const threshold = opts.threshold ?? 0.6;
  const limit = opts.limit ?? 1;
  if (!query || !candidates?.length) return [];

  // Apply alias substitution then normalise
  const resolved = scanResolveAlias(query);
  const q = String(resolved).trim().toLowerCase();
  if (!q) return [];

  const results = [];
  for (const c of candidates) {
    const label = (c.label || '').toLowerCase();
    if (!label) continue;
    let score = 0;
    if (label === q) {
      score = 1.0;
    } else if (label.includes(q) && q.length >= 3) {
      // Substring match — score weighted by query length / label length
      score = 0.85 + 0.10 * Math.min(1, q.length / label.length);
    } else if (q.includes(label) && label.length >= 3) {
      score = 0.80 + 0.10 * Math.min(1, label.length / q.length);
    } else {
      // Token-level: split on spaces and try matching each token
      const qTokens = q.split(/[\s\-,.]+/).filter(t => t.length >= 2);
      const lTokens = label.split(/[\s\-,.]+/).filter(t => t.length >= 2);
      let tokenHits = 0;
      for (const qt of qTokens) {
        if (lTokens.some(lt => lt === qt || (qt.length >= 4 && lt.includes(qt)) || (lt.length >= 4 && qt.includes(lt)))) {
          tokenHits++;
        }
      }
      if (tokenHits > 0) {
        score = 0.5 + 0.3 * (tokenHits / Math.max(qTokens.length, 1));
      } else {
        // Levenshtein distance — only worth computing if labels short & similar length
        if (Math.abs(label.length - q.length) <= Math.max(3, Math.floor(label.length * 0.3))) {
          const dist = _scanLevenshtein(q, label);
          const norm = 1 - dist / Math.max(q.length, label.length);
          if (norm >= threshold) score = norm * 0.85;  // cap below substring matches
        }
      }
    }
    if (score >= threshold) {
      results.push({ id: c.id, label: c.label, score });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// ─── Reference data injection — adds known clients/locations to prompts ──
/**
 * Build a compact reference data block for the system prompt.
 * Helps the AI return canonical names/IDs that already exist in our base.
 *
 * @param {Object} opts { clients: Array, locations: Array, maxClients: 50, maxLocs: 80 }
 * @returns {string} formatted block ready to append to a system prompt
 */
function scanBuildReferenceBlock(opts = {}) {
  const maxClients = opts.maxClients ?? 50;
  const maxLocs = opts.maxLocs ?? 80;
  const clients = (opts.clients || []).slice(0, maxClients);
  const locations = (opts.locations || []).slice(0, maxLocs);
  const lines = [];
  if (clients.length) {
    lines.push('\nKNOWN CLIENTS (' + clients.length + '):');
    for (const c of clients) {
      const name = c.fields?.['Company Name'] || c.label || '';
      if (name) lines.push('- ' + name + ' [id:' + c.id + ']');
    }
  }
  if (locations.length) {
    lines.push('\nKNOWN LOCATIONS (' + locations.length + '):');
    for (const l of locations) {
      const f = l.fields || {};
      const parts = [f['Name'] || l.label || '', f['City'] || '', f['Country'] || ''].filter(Boolean);
      if (parts.length) lines.push('- ' + parts.join(' · ') + ' [id:' + l.id + ']');
    }
  }
  if (lines.length) {
    lines.push('\nMatching rules:');
    lines.push('- When extracting a client/location that appears in the lists above, return its EXACT canonical name.');
    lines.push('- Also return the matched record id in `client_id` / `location_id` fields when confident (>0.85).');
    lines.push('- For unknown values, return the document text as-is — the system will offer manual selection.');
  }
  return lines.join('\n');
}

/**
 * Get top-N most-relevant clients/locations from preloaded reference data.
 * Currently sorted alphabetically; future improvement: sort by recent usage.
 *
 * Defaults bumped from 50/80 → 150/250 for fast-mode (single-call, no tools).
 * Trade-off: ~5-8K more tokens per call but eliminates multi-turn round-trips
 * which save 10-15 seconds end-to-end.
 */
function scanGetReferenceData(maxClients = 150, maxLocs = 250) {
  const allClients = (typeof getRefClients === 'function' ? getRefClients() : []) || [];
  const allLocs = (typeof getRefLocations === 'function' ? getRefLocations() : []) || [];

  // Filter to active records only (where the field exists)
  const activeClients = allClients.filter(c => c.fields?.['Active'] !== false);
  const activeLocs = allLocs.filter(l => l.fields?.['Active'] !== false);

  // Sort alphabetically by Company Name / Name
  activeClients.sort((a, b) => (a.fields?.['Company Name'] || '').localeCompare(b.fields?.['Company Name'] || ''));
  activeLocs.sort((a, b) => (a.fields?.['Name'] || '').localeCompare(b.fields?.['Name'] || ''));

  return {
    clients: activeClients.slice(0, maxClients),
    locations: activeLocs.slice(0, maxLocs),
  };
}

// ─── Tool use definitions (Phase 4) ─────────────────────────────
// Lets the model query our reference data DURING extraction instead of being
// limited to whatever we crammed into the system prompt. The model can ask
// "find this client" / "find this location" mid-extraction and get fresh
// candidates with IDs, then return canonical refs in the final JSON.
//
// This is more accurate than naive prompt-injection for two reasons:
//   1. Model can search by partial / phonetic queries (not just substring)
//   2. We don't blow the context with 200 entries — only return relevant ones
//
// Trade-off: each tool call = 1 extra API round-trip. Capped at 6 calls/scan.
const SCAN_TOOLS = [
  {
    name: 'search_clients',
    description: 'Search the Petras client database for a company name. Use this when extracting "client_name" — pass the exact text from the document. Returns up to 5 matches with their canonical name + record id + match score.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Company name as it appears in the document' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_locations',
    description: 'Search the Petras locations database for a warehouse / supplier / delivery point. Use this for every loading_stop or delivery_stop. Returns up to 5 matches with name + city + country + record id + match score.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Location name (warehouse / supplier name) from the document' },
        city:  { type: 'string', description: 'City if known (helps disambiguation)' },
        country: { type: 'string', description: 'Country code or name if known' },
      },
      required: ['query'],
    },
  },
];

/** Execute a tool call from the AI and return the result content. */
async function _scanRunTool(name, input) {
  if (name === 'search_clients') {
    const all = (typeof getRefClients === 'function' ? getRefClients() : []) || [];
    const list = all
      .filter(c => c.fields?.['Active'] !== false)
      .map(c => ({ id: c.id, label: c.fields?.['Company Name'] || '' }))
      .filter(c => c.label);
    const matches = scanFuzzyMatch(input.query || '', list, { threshold: 0.5, limit: 5 });
    return JSON.stringify(matches.length ? matches : { not_found: input.query });
  }
  if (name === 'search_locations') {
    const all = (typeof getRefLocations === 'function' ? getRefLocations() : []) || [];
    const list = all.map(l => {
      const f = l.fields || {};
      const label = [f['Name'], f['City'], f['Country']].filter(Boolean).join(' · ');
      return { id: l.id, label, name: f['Name'] || '', city: f['City'] || '', country: f['Country'] || '' };
    }).filter(l => l.label);
    // Composite query: name + city + country if provided
    const composite = [input.query, input.city, input.country].filter(Boolean).join(' ');
    const matches = scanFuzzyMatch(composite, list, { threshold: 0.5, limit: 5 });
    // Decorate result with structured fields for AI clarity
    const decorated = matches.map(m => {
      const orig = list.find(l => l.id === m.id);
      return { id: m.id, label: m.label, score: m.score, city: orig?.city || '', country: orig?.country || '' };
    });
    return JSON.stringify(decorated.length ? decorated : { not_found: composite });
  }
  return JSON.stringify({ error: 'unknown_tool: ' + name });
}

/**
 * Drive a multi-turn extraction conversation with tool use.
 * The AI may call search_clients / search_locations multiple times; we
 * execute each tool, append the result, and continue until the model
 * returns a final assistant message (no more tool_use blocks).
 *
 * After tool calls, we drop the tools array and explicitly ask for JSON-only
 * output to prevent the model from emitting "Now I have everything..." preamble.
 *
 * @param {Object} basePayload {model, max_tokens, system, messages}
 * @returns {Promise<Object>} the final assistant response containing JSON
 */
async function scanExtractWithTools(basePayload) {
  // Rate-limit defence: cache the heavy stuff (image + system prompt) so each
  // round-trip in the tool loop only pays for new tokens.
  const cachedSystem = (typeof basePayload.system === 'string')
    ? [{ type: 'text', text: basePayload.system, cache_control: { type: 'ephemeral' } }]
    : basePayload.system;
  // Add cache_control to the FIRST user message containing the image — the AI
  // will reuse the cached image across tool-use loops within ~5 minutes.
  const messages = basePayload.messages.map((m, idx) => {
    if (idx === 0 && Array.isArray(m.content)) {
      const lastIdx = m.content.length - 1;
      const newContent = m.content.map((c, i) => {
        if (i === lastIdx && c.type === 'text') {
          return { ...c, cache_control: { type: 'ephemeral' } };
        }
        return c;
      });
      return { ...m, content: newContent };
    }
    return m;
  });
  const MAX_TOOL_LOOPS = 4;  // reduced from 6 to bound rate-limit exposure
  let usedTools = false;

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    const data = await scanCallAnthropic({
      ...basePayload,
      system: cachedSystem,
      messages,
      tools: SCAN_TOOLS,
    });

    const toolUses = (data.content || []).filter(c => c.type === 'tool_use');
    if (!toolUses.length) {
      // Model finished. If it used tools at some point, do a final clean-up
      // call WITHOUT tools, asking for JSON-only output. This prevents the
      // "Now I have everything..." preamble that breaks JSON.parse.
      if (usedTools) {
        const textBlock = (data.content || []).find(c => c.type === 'text');
        const possibleText = textBlock?.text || '';
        // If the response is already pure JSON, skip the cleanup call
        try {
          scanExtractJSON(possibleText);
          return data;  // already valid JSON
        } catch {
          // Falls through to clean-up call
        }
        // Append the assistant's commentary, then ask for JSON-only.
        // Use Haiku for this clean-up call — it's cheap, fast, and only needs
        // to reformat existing text. Saves Opus rate-limit budget.
        messages.push({ role: 'assistant', content: data.content });
        messages.push({
          role: 'user',
          content: [{ type: 'text', text: 'Now output the final extraction as JSON ONLY. No preamble, no commentary, no markdown fences. Start with `{` and end with `}`.' }]
        });
        const cleanData = await scanCallAnthropic({
          ...basePayload,
          model: SCAN_MODEL_HAIKU,  // override — cheap reformat call
          system: cachedSystem,
          messages,
          // No tools on this call — model can only emit text
        });
        return cleanData;
      }
      return data;
    }

    usedTools = true;
    // Append assistant turn (with tool_use blocks)
    messages.push({ role: 'assistant', content: data.content });

    // Execute each tool call and append the results
    const toolResults = [];
    for (const tu of toolUses) {
      try {
        const out = await _scanRunTool(tu.name, tu.input || {});
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      } catch (e) {
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ error: e.message }), is_error: true });
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }
  throw new Error('Tool-use loop hit cap of ' + MAX_TOOL_LOOPS + ' — model not converging');
}

/**
 * FAST single-call extraction — no tool use, no doc-type pre-classification.
 * Trade-offs:
 *   + 4-8s end-to-end (vs 15-35s with tool-use)
 *   + Anthropic prompt caching on system + image → cheap re-runs <5min
 *   - Larger system prompt (all known clients/locations injected upfront)
 *   - Slight accuracy drop on never-before-seen names (no fuzzy fallback in
 *     model's scope — but client-side fuzzy still runs on the response)
 *
 * The model returns the JSON in one shot. Tools are NOT registered, so the
 * model can't call search_*. Reference data is in the prompt — model picks
 * canonical name + id from there.
 *
 * @param {Object} payload  { model, max_tokens, system, messages }
 *   `system` should be a string OR array of blocks; we inject ref-block here.
 * @returns {Promise<Object>}
 */
async function scanFastExtract(payload) {
  // Build cached system block — wraps user-supplied system text in a cache_control envelope
  const sys = (typeof payload.system === 'string')
    ? [{ type: 'text', text: payload.system, cache_control: { type: 'ephemeral' } }]
    : payload.system;

  // Mark image / first text block as cached too (so retries within 5min skip image tokens)
  const messages = payload.messages.map((m, idx) => {
    if (idx === 0 && Array.isArray(m.content)) {
      const lastIdx = m.content.length - 1;
      const newContent = m.content.map((c, i) =>
        (i === lastIdx && c.type === 'text') ? { ...c, cache_control: { type: 'ephemeral' } } : c
      );
      return { ...m, content: newContent };
    }
    return m;
  });

  return scanCallAnthropic({
    ...payload,
    system: sys,
    messages,
    // No tools[] → model can't call search_*. Single-shot extraction.
  });
}

// ─── Robust JSON extraction from AI response ────────────────────
/**
 * Parse AI text that should contain JSON, but may have:
 *   - markdown code fences (```json ... ```)
 *   - conversational preamble ("Here's the data...", "Now I have...", etc)
 *   - trailing commentary
 *   - smart quotes / non-standard whitespace
 *
 * Strategy:
 *   1. Strip code fences and trim
 *   2. Try direct parse
 *   3. Find first balanced {...} block and parse that
 *   4. Throw informative error with first 200 chars of input
 *
 * @param {string} text  raw text from AI response
 * @returns {Object} parsed JSON object
 */
function scanExtractJSON(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('scanExtractJSON: empty or non-string input');
  }
  // Step 1: strip fences and normalise whitespace
  let cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .replace(/“|”/g, '"')   // smart quotes → straight
    .replace(/‘|’/g, "'")
    .trim();

  // Step 2: direct parse
  try { return JSON.parse(cleaned); } catch {}

  // Step 3: find first balanced {...}
  const start = cleaned.indexOf('{');
  if (start < 0) {
    throw new Error('No JSON object found in AI response. Raw: ' + cleaned.slice(0, 200));
  }
  // Walk forward tracking depth, ignoring chars inside strings
  let depth = 0;
  let inStr = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (inStr) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) {
    // Fallback: just take from { to last }
    end = cleaned.lastIndexOf('}');
    if (end < start) throw new Error('Unbalanced JSON in AI response');
  }
  const jsonStr = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('JSON parse failed: ' + e.message + ' — first 300 chars: ' + jsonStr.slice(0, 300));
  }
}

// ─── Confidence helper ──────────────────────────────────────────
/**
 * Map confidence value (string HIGH/MEDIUM/LOW or numeric 0-1) to a UI tint
 * class for highlighting auto-filled fields.
 */
function scanConfidenceClass(c) {
  if (c == null) return '';
  const s = (typeof c === 'string') ? c.toUpperCase() : (c >= 0.85 ? 'HIGH' : c >= 0.6 ? 'MEDIUM' : 'LOW');
  return s === 'HIGH' ? 'scan-conf-high' : s === 'MEDIUM' ? 'scan-conf-med' : 'scan-conf-low';
}

// ─── Expose to window for use across modules ────────────────────
if (typeof window !== 'undefined') {
  window.scanPreprocessFile = scanPreprocessFile;
  window.scanRenderPDFPreview = scanRenderPDFPreview;
  window.scanCallAnthropic = scanCallAnthropic;
  window.scanDetectDocType = scanDetectDocType;
  window.scanSaveCorrection = scanSaveCorrection;
  window.scanGetTrainingExamples = scanGetTrainingExamples;
  window.scanConfidenceClass = scanConfidenceClass;
  window.scanExtractJSON = scanExtractJSON;
  window.SCAN_MODEL = SCAN_MODEL;
  window.SCAN_MAX_TOKENS = SCAN_MAX_TOKENS;
  window.SCAN_MODEL_OPUS = SCAN_MODEL_OPUS;
  window.SCAN_MODEL_SONNET = SCAN_MODEL_SONNET;
  window.SCAN_MODEL_HAIKU = SCAN_MODEL_HAIKU;
  window.scanModelForType = scanModelForType;
  window.scanModelLabel = scanModelLabel;
  // Phase 2: smart matching
  window.scanResolveAlias = scanResolveAlias;
  window.scanFuzzyMatch = scanFuzzyMatch;
  window.scanBuildReferenceBlock = scanBuildReferenceBlock;
  window.scanGetReferenceData = scanGetReferenceData;
  window.SCAN_ALIASES = SCAN_ALIASES;
  // Phase 3: active learning
  window.scanHydrateTrainingCache = scanHydrateTrainingCache;
  // Phase 4: tool use
  window.SCAN_TOOLS = SCAN_TOOLS;
  window.scanExtractWithTools = scanExtractWithTools;
  // Fast mode (single-call, no tools)
  window.scanFastExtract = scanFastExtract;
}
