// ═══════════════════════════════════════════════════════════════════
// DOC VIEWER (scan round 3, 27/9/2026)
//
// Renders the ORIGINAL scanned/stored document (never the AI's reading of it)
// so it can be checked against a value on record. Originally shared by two
// callers — core/scan-review.js (the side-by-side scan review panel, removed
// 28/9/2026: the owner kept the plain form instead) and the document-storage
// viewer modal (core/order-docs.js, a Blob fetched from the Worker after the
// order is saved), which is the only caller left. The removed review panel
// was the ONLY thing that ever called highlight(quote) — jump to a field's
// source quote in the document — so highlight() and everything that existed
// only to support it (the PDF text-layer, the .doc/.txt text-fold/search
// index, the image caption bar) were deleted with it 28/9/2026 (principle 8:
// dead code lies). order-docs.js's viewer only ever needed to SHOW the
// document, never to search it.
//
//   window.DocViewer.render(container, {file|blob, mime, filename, text?})
//     → Promise<{ destroy() }>
//
// PDF: pdf.js renders each page to a plain <canvas>. Images: plain <img>.
// Legacy .doc: text via core/doc-text.js, rendered as plain text (pre-wrap).
// .docx / .eml / .msg: no parser here (see core/doc-text.js's own scope
// note) — filename + a download button, never a public URL.
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

// ─── PDF: canvas render, one <canvas> per page ───────────────────────
async function _dvRenderPdf(container, buf) {
  const pdfjs = await _scanLoadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const root = document.createElement('div');
  root.className = 'doc-viewer';
  container.appendChild(root);

  const targetWidth = Math.max(280, Math.min(container.clientWidth || 600, 900));
  const dpr = window.devicePixelRatio || 1;

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
    root.appendChild(pageEl);
  }
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
    try { await _dvRenderPdf(container, buf); }
    catch (e) {
      container.innerHTML = `<div class="doc-viewer-unsupported">Το PDF δεν μπόρεσε να φορτωθεί (${escapeHtml(e.message || '')}).</div>`;
    }
    return { destroy() { container.innerHTML = ''; } };
  }

  if (kind === 'image') {
    if (!src) throw new Error('DocViewer: image needs file or blob');
    objectUrl = URL.createObjectURL(src);
    container.innerHTML = `<div class="doc-viewer-image"><img src="${objectUrl}" alt="${escapeHtml(filename)}"></div>`;
    return { destroy() { if (objectUrl) URL.revokeObjectURL(objectUrl); container.innerHTML = ''; } };
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
    return { destroy() { container.innerHTML = ''; } };
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
  return { destroy() { if (objectUrl) URL.revokeObjectURL(objectUrl); container.innerHTML = ''; } };
}

if (typeof window !== 'undefined') {
  window.DocViewer = { render: _dvRender };
}
