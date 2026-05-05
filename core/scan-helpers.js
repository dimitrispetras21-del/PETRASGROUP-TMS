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

const SCAN_MODEL = 'claude-sonnet-4-20250514';   // unified across all scans
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

  // Compute output dims (max 2000px longest side, preserve aspect)
  const MAX = 2000;
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
        const msg = body.error?.message || `API error ${res.status}`;
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
      model: 'claude-haiku-4-20250514',  // cheapest model for classification
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
/**
 * Save a (input, corrected output) pair for future few-shot prompting.
 * Stored in localStorage; in v2 should move to Airtable _SCAN_TRAINING table.
 *
 * @param {string} docType
 * @param {string} userInputSummary  short hint about file (filename, size)
 * @param {Object} aiOutput          original AI extraction
 * @param {Object} correctedOutput   user-corrected final values
 */
function scanSaveCorrection(docType, userInputSummary, aiOutput, correctedOutput) {
  try {
    const list = JSON.parse(localStorage.getItem(SCAN_TRAINING_KEY) || '[]');
    list.unshift({
      ts: Date.now(),
      docType,
      summary: userInputSummary,
      ai: aiOutput,
      corrected: correctedOutput,
    });
    if (list.length > SCAN_TRAINING_MAX) list.length = SCAN_TRAINING_MAX;
    localStorage.setItem(SCAN_TRAINING_KEY, JSON.stringify(list));
  } catch (e) { console.warn('[scan] save correction failed:', e.message); }
}

/**
 * Get up to N most-recent successful corrections for a given doc type.
 * Used to construct few-shot examples in the extraction prompt.
 */
function scanGetTrainingExamples(docType, limit = 3) {
  try {
    const list = JSON.parse(localStorage.getItem(SCAN_TRAINING_KEY) || '[]');
    return list.filter(e => e.docType === docType).slice(0, limit);
  } catch { return []; }
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
  window.SCAN_MODEL = SCAN_MODEL;
  window.SCAN_MAX_TOKENS = SCAN_MAX_TOKENS;
}
