// ═══════════════════════════════════════════════════════════════════
// DOC VIEWER (scan round 3, 27/9/2026)
//
// Renders the ORIGINAL scanned document (never the AI's reading of it) so a
// dispatcher can check a value against the source. Two callers share this:
// core/scan-review.js (the side-by-side scan review panel, a File straight
// from the upload) and the document-storage viewer modal (a Blob fetched
// from the Worker after the order is saved) — the API below is the contract
// between them, keep it stable.
//
//   window.DocViewer.render(container, {file|blob, mime, filename, text?})
//     → Promise<{ highlight(quote) => boolean, clear(), destroy() }>
//
// PDF: pdf.js renders each page to a <canvas>, plus a text-layer of
// invisible, precisely-positioned <span>s (same transform math pdf.js's own
// text layer uses) so a quote can be found and its span(s) boxed. Images:
// plain <img> — nothing to box, so highlight() always returns false and the
// quote is shown in a caption bar instead. Legacy .doc: text via
// core/doc-text.js, rendered as plain text with the match wrapped in a
// <span>. .docx / .eml / .msg: no parser here (see core/doc-text.js's own
// scope note) — filename + a download button, never a public URL.
// ═══════════════════════════════════════════════════════════════════
'use strict';

function _dvExt(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function _dvKind(mime, filename) {
  const ext = _dvExt(filename);
  const m = mime || '';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (ext === 'doc' || m === 'application/msword') return 'doc';
  if (ext === 'txt' || m === 'text/plain') return 'txt';
  return 'unsupported';   // .docx, .eml, .msg, and anything else we don't parse
}

// ─── Text folding / matching ────────────────────────────────────────
// Accent map kept 1:1 (one input char → one output char) so the .doc/.txt
// path can map a match in the folded string back to an exact offset in the
// ORIGINAL text — needed there to wrap the real substring in a <span>. The
// PDF path highlights whole text-layer items instead (see below), so it
// folds with NFD (which can change string length) — cheaper, and no index
// map is needed for it.
const _DV_FOLD1 = {
  'á':'a','à':'a','â':'a','ä':'a','ã':'a','å':'a','ā':'a',
  'é':'e','è':'e','ê':'e','ë':'e','ē':'e','ę':'e',
  'í':'i','ì':'i','î':'i','ï':'i','ī':'i',
  'ó':'o','ò':'o','ô':'o','ö':'o','õ':'o','ő':'o',
  'ú':'u','ù':'u','û':'u','ü':'u','ű':'u',
  'ý':'y','ÿ':'y','ñ':'n','ń':'n','ň':'n','ç':'c','ć':'c','č':'c',
  'ą':'a','ł':'l','ś':'s','š':'s','ź':'z','ż':'z','ž':'z',
  'ř':'r','ě':'e','ů':'u','ď':'d','ť':'t',
  'ά':'α','έ':'ε','ή':'η','ί':'ι','ό':'ο','ύ':'υ','ώ':'ω','ΐ':'ι','ΰ':'υ',
};
function _dvFoldChar(ch) {
  const lo = ch.toLowerCase();
  return _DV_FOLD1[lo] || lo;
}
// Folds + collapses whitespace, keeping map[i] = index into the ORIGINAL text
// that norm[i] came from (so a match can be mapped back exactly).
function _dvBuildIndex(text) {
  let norm = '';
  const map = [];
  let lastWasSpace = true; // also trims leading whitespace
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) { norm += ' '; map.push(i); lastWasSpace = true; }
      continue;
    }
    norm += _dvFoldChar(ch);
    map.push(i);
    lastWasSpace = false;
  }
  if (norm.endsWith(' ')) { norm = norm.slice(0, -1); map.pop(); }
  return { norm, map };
}
function _dvFoldQuote(q) {
  return _dvBuildIndex(String(q || '')).norm;
}
/** Exact search over a folded index, falling back to a space-free compare
 * (handles a stray/missing space at an extraction seam — "22.500kg" vs the
 * quote "22.500 kg"). Returns {start,end} into the ORIGINAL text, or null. */
function _dvFindInIndex(idx, quoteNorm) {
  if (!quoteNorm) return null;
  let p = idx.norm.indexOf(quoteNorm);
  if (p >= 0) return { start: idx.map[p], end: idx.map[p + quoteNorm.length - 1] + 1 };
  const noSpaceQ = quoteNorm.replace(/ /g, '');
  if (!noSpaceQ) return null;
  // Build a space-free view of the same index, keeping a map back into `idx`.
  let noSpaceNorm = '', backMap = [];
  for (let i = 0; i < idx.norm.length; i++) {
    if (idx.norm[i] === ' ') continue;
    noSpaceNorm += idx.norm[i];
    backMap.push(i);
  }
  p = noSpaceNorm.indexOf(noSpaceQ);
  if (p < 0) return null;
  const i0 = backMap[p], i1 = backMap[p + noSpaceQ.length - 1];
  return { start: idx.map[i0], end: idx.map[i1] + 1 };
}

// ─── PDF: canvas render + positioned text-layer ─────────────────────
// Same transform pdf.js's own text layer builder uses: item.transform placed
// through the page viewport gives left/top/rotation/height in CSS pixels
// that line up with the canvas pixel-for-pixel (both are sized from the SAME
// viewport, un-scaled by devicePixelRatio — only the canvas bitmap is).
async function _dvRenderPdf(container, buf) {
  const pdfjs = await _scanLoadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const root = document.createElement('div');
  root.className = 'doc-viewer';
  container.appendChild(root);

  const targetWidth = Math.max(280, Math.min(container.clientWidth || 600, 900));
  const dpr = window.devicePixelRatio || 1;
  const items = [];   // flat, in reading order (page by page) — the search index

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const natural = page.getViewport({ scale: 1 });
    const scale = targetWidth / natural.width;
    const viewport = page.getViewport({ scale });

    const pageEl = document.createElement('div');
    pageEl.className = 'doc-viewer-page';
    pageEl.style.width = viewport.width + 'px';
    pageEl.style.height = viewport.height + 'px';

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pageEl.appendChild(canvas);

    const textLayer = document.createElement('div');
    textLayer.className = 'doc-viewer-textlayer';
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!it.str) continue;
      const tx = pdfjs.Util.transform(viewport.transform, it.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]) || 8;
      const angle = Math.atan2(tx[1], tx[0]);
      const span = document.createElement('span');
      span.textContent = it.str;
      span.style.left = tx[4] + 'px';
      span.style.top = (tx[5] - fontHeight) + 'px';
      span.style.fontSize = fontHeight + 'px';
      if (angle) span.style.transform = `rotate(${angle}rad)`;
      textLayer.appendChild(span);
      if (it.str.trim()) items.push({ el: span, text: it.str, norm: _pdfFold(it.str) });
    }
    pageEl.appendChild(textLayer);
    root.appendChild(pageEl);
  }
  return { root, items };
}
function _pdfFold(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Tries: (A) a single text-layer item containing the quote (or vice versa —
 * covers most fields, since pdf.js keeps a short run as one item), then
 * (B) a window of up to 8 consecutive items, joined with no separator AND
 * with a space, to catch a quote pdf.js split across runs (its own comment:
 * "splits accented letters into their own runs" — "München" → "M"+"ü"+"nchen"). */
function _dvHighlightPdfItems(items, quote) {
  const nq = _pdfFold(quote);
  if (!nq) return null;
  for (const it of items) {
    if (it.norm.includes(nq) || (nq.length >= 3 && nq.includes(it.norm))) return [it];
  }
  const WIN = 8;
  for (let i = 0; i < items.length; i++) {
    let joinedPlain = '', joinedSpaced = '';
    for (let j = i; j < Math.min(items.length, i + WIN); j++) {
      joinedPlain += items[j].norm;
      joinedSpaced += (j > i ? ' ' : '') + items[j].norm;
      if (joinedPlain.includes(nq) || joinedSpaced.includes(nq)) return items.slice(i, j + 1);
    }
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────
async function _dvRender(container, opts) {
  const src = opts.file || opts.blob || null;
  const mime = opts.mime || (src && src.type) || '';
  const filename = opts.filename || (src && src.name) || '';
  const kind = _dvKind(mime, filename);
  container.innerHTML = '';
  let objectUrl = null;

  if (kind === 'pdf') {
    if (!src) throw new Error('DocViewer: PDF needs file or blob');
    const buf = await src.arrayBuffer();
    let pdf;
    try { pdf = await _dvRenderPdf(container, buf); }
    catch (e) {
      container.innerHTML = `<div class="doc-viewer-unsupported">Το PDF δεν μπόρεσε να φορτωθεί (${escapeHtml(e.message || '')}).</div>`;
      return { highlight: () => false, clear() {}, destroy() { container.innerHTML = ''; } };
    }
    let current = [];
    return {
      highlight(quote) {
        current.forEach(it => it.el.classList.remove('doc-viewer-hl'));
        current = [];
        const hit = _dvHighlightPdfItems(pdf.items, quote);
        if (!hit) return false;
        hit.forEach(it => it.el.classList.add('doc-viewer-hl'));
        current = hit;
        hit[0].el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return true;
      },
      clear() { current.forEach(it => it.el.classList.remove('doc-viewer-hl')); current = []; },
      destroy() { container.innerHTML = ''; },
    };
  }

  if (kind === 'image') {
    if (!src) throw new Error('DocViewer: image needs file or blob');
    objectUrl = URL.createObjectURL(src);
    container.innerHTML = `<div class="doc-viewer-image"><img src="${objectUrl}" alt="${escapeHtml(filename)}"></div>
      <div class="doc-viewer-caption" id="dvCaption" style="display:none"></div>`;
    const caption = container.querySelector('#dvCaption');
    return {
      // Nothing to box on a photo — surface the quote as text instead, and
      // say so via the false return (the caller decides what "not found"
      // should look like elsewhere; this is just what DocViewer itself shows).
      highlight(quote) {
        if (!quote) { caption.style.display = 'none'; return false; }
        caption.style.display = 'block';
        caption.textContent = '« ' + quote + ' »';
        return false;
      },
      clear() { caption.style.display = 'none'; },
      destroy() { if (objectUrl) URL.revokeObjectURL(objectUrl); container.innerHTML = ''; },
    };
  }

  if (kind === 'doc' || kind === 'txt') {
    let text = opts.text;
    if (text == null) {
      if (!src) throw new Error('DocViewer: ' + kind + ' needs file, blob or text');
      if (kind === 'doc') {
        const buf = await src.arrayBuffer();
        text = docLegacyToText(buf);   // throws loudly on anything it can't read — same contract as the scan path
      } else {
        text = await src.text();
      }
    }
    const pre = document.createElement('pre');
    pre.className = 'doc-viewer-text';
    pre.textContent = text;
    container.appendChild(pre);
    const idx = _dvBuildIndex(text);
    return {
      highlight(quote) {
        const hit = _dvFindInIndex(idx, _dvFoldQuote(quote));
        if (!hit) { pre.textContent = text; return false; }
        pre.textContent = '';
        pre.appendChild(document.createTextNode(text.slice(0, hit.start)));
        const mark = document.createElement('span');
        mark.className = 'doc-viewer-hl';
        mark.textContent = text.slice(hit.start, hit.end);
        pre.appendChild(mark);
        pre.appendChild(document.createTextNode(text.slice(hit.end)));
        mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return true;
      },
      clear() { pre.textContent = text; },
      destroy() { container.innerHTML = ''; },
    };
  }

  // .docx / .eml / .msg / anything else: no parser here (core/doc-text.js
  // only reads legacy binary .doc — see its own header comment on why).
  // Download goes through the blob we already have in memory, never a URL.
  if (src) objectUrl = URL.createObjectURL(src);
  container.innerHTML = `
    <div class="doc-viewer-unsupported">
      <div>📄 ${escapeHtml(filename || 'έγγραφο')}</div>
      <div>Δεν υποστηρίζεται προεπισκόπηση για αυτόν τον τύπο αρχείου.</div>
      ${objectUrl ? `<a class="btn btn-ghost btn-sm" href="${objectUrl}" download="${escapeHtml(filename || 'document')}">Λήψη αρχείου</a>` : ''}
    </div>`;
  return {
    highlight: () => false,
    clear() {},
    destroy() { if (objectUrl) URL.revokeObjectURL(objectUrl); container.innerHTML = ''; },
  };
}

if (typeof window !== 'undefined') {
  window.DocViewer = { render: _dvRender };
}
