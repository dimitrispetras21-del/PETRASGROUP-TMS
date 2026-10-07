// ═══════════════════════════════════════════════════════════════
// CORE — ORDER DOCUMENTS (Scan Round 3, document storage)
// ═══════════════════════════════════════════════════════════════
// Backend contract (worker/src/index.js, built in parallel — code against it
// exactly, never assume it is deployed):
//   POST {PROXY_URL}/docs/upload?order=<id>&sha256=<64hex>&filename=<name>&source=scan|upload
//        body = raw file bytes, Content-Type = file mime.
//        201 (or 200 if the sha256 already exists for this order) →
//        {id, order_id, sha256, filename, mime, size, source, created_at}
//   GET  {PROXY_URL}/docs/list?order=<id>            → rows, newest first
//   GET  {PROXY_URL}/docs/file/<id>                  → streamed bytes
//   Facade table TABLES.ORDER_DOCS (GET only) — used only to know WHICH
//   orders have >=1 document, for the paperclip badge. It never carries the
//   file bytes.
// No delete endpoint exists — this module never offers to remove a document.
//
// FK note: order_documents.order_id points to orders(id) (the INTERNATIONAL
// table). National orders live in national_orders, a different id-space, so
// nothing here can attach a document to a national order without a schema
// change (see handleNatlOrderSaved below) — GAP, reported in the round-3 handoff.
(function () {
'use strict';

// ── Client-side gate (mirrors the Worker's own limits so the user hears the
// problem before a round-trip, not after) ──
const _OD_MAX_BYTES = 15 * 1024 * 1024;
const _OD_EXT_MIME = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  eml: 'message/rfc822',
  msg: 'application/vnd.ms-outlook',
  txt: 'text/plain',
};
const OD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.eml,.msg,.txt';

function _odExt(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}
function _odGuessMime(file) {
  if (file && file.type) return file.type;
  return _OD_EXT_MIME[_odExt(file && file.name)] || 'application/octet-stream';
}

/**
 * @param {File} file
 * @returns {{ok:true, ext:string, mime:string}|{ok:false, reason:string}}
 */
function validateFile(file) {
  if (!file) return { ok: false, reason: 'Δεν επιλέχθηκε αρχείο' };
  if (file.size > _OD_MAX_BYTES) {
    return { ok: false, reason: `Το αρχείο ξεπερνά τα 15MB (${(file.size / 1024 / 1024).toFixed(1)}MB)` };
  }
  const ext = _odExt(file.name);
  if (!_OD_EXT_MIME[ext]) {
    return { ok: false, reason: `Μη υποστηριζόμενος τύπος αρχείου${ext ? ': .' + ext : ''}` };
  }
  return { ok: true, ext, mime: _odGuessMime(file) };
}

async function _odSha256(file) {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Fetch plumbing (deliberately NOT core/api.js's atGet/atGetAll) ──
// atGetAll's error path (_atFetch) throws a generic "Failed to load data" RED
// TOAST on any non-ok response — right for a page's primary data, wrong for a
// decorative badge index that must degrade silently while /docs/* is still
// being deployed (see the module docstring). Same JWT/Level-A headers, same
// 401 handling, none of the toasting.
function _odHeaders(method) {
  const req = typeof tmsNewAction === 'function' ? tmsNewAction() : null;
  return typeof _apiHeaders === 'function' ? _apiHeaders(method, req) : {};
}
async function _odFetch(url, opts) {
  // Same fail-safe as _atRetry, through the same helpers (core/api.js loads
  // first in app.html): after the page's first 401 nothing is sent and
  // nothing is logged per request — this used to be a second copy of the 401
  // branch, which is how the copies drift (5/10 storm, 2010 rows). typeof
  // guards like ctFetch (modules/costs.js): a page that loads this file
  // without api.js must get its answer, not a ReferenceError (review 6/10 P3-4).
  if (typeof tmsSessionGone === 'function' && tmsSessionGone()) throw tmsSessionRefuse();
  const res = await fetch(url, opts);
  if (typeof tmsNoteResponse === 'function') tmsNoteResponse(res);
  if (res.status === 401 && typeof tmsSessionExpired === 'function') throw tmsSessionExpired('docs');
  return res;
}
async function _odErrMsg(res, fallback) {
  try { const j = await res.json(); if (j && j.error) return j.error; } catch (_) {}
  return fallback;
}

// ── Badge index: ONE atGetAll-shaped call, cached like ORDERS (2 min) ──
let _odIndexSet = null;      // Set<orderId> — orders with >=1 stored document
let _odIndexTs = 0;
let _odIndexPromise = null;
const _OD_INDEX_TTL = 2 * 60 * 1000; // same tier as ORDERS (core/api.js SESSION_MS)

/**
 * Load (or reuse) the "which orders have documents" index. Never throws and
 * never shows a toast: a failed/undeployed /ORDER_DOCS table means the
 * paperclip simply does not render anywhere this render — the list/weekly/
 * daily page it decorates must never know the difference.
 * @param {boolean} [force]
 * @returns {Promise<Set<string>>}
 */
async function preloadIndex(force) {
  if (!force && _odIndexSet && (Date.now() - _odIndexTs) < _OD_INDEX_TTL) return _odIndexSet;
  if (_odIndexPromise) return _odIndexPromise;
  _odIndexPromise = (async () => {
    const ids = new Set();
    try {
      let offset = '';
      do {
        let url = _apiUrl(`/v0/${AT_BASE}/${TABLES.ORDER_DOCS}`) + `?pageSize=100&fields[]=${encodeURIComponent('Order')}`;
        if (offset) url += `&offset=${encodeURIComponent(offset)}`;
        const res = await _odFetch(url, { headers: _odHeaders('GET'), cache: 'no-store' });
        if (!res.ok) {
          const msg = await _odErrMsg(res, 'HTTP ' + res.status);
          console.warn(`[order-docs] index unavailable (${res.status}): ${msg} — badges stay off this render`);
          return ids; // empty index; caller renders exactly as if no order had a document
        }
        const data = await res.json();
        (data.records || []).forEach(r => {
          const link = r.fields && r.fields['Order'];
          const oid = Array.isArray(link) ? link[0] : link;
          if (oid) ids.add(oid);
        });
        offset = data.offset || '';
      } while (offset);
    } catch (e) {
      console.warn('[order-docs] index fetch failed:', e && e.message);
      return ids;
    }
    return ids;
  })();
  const result = await _odIndexPromise;
  _odIndexSet = result;
  _odIndexTs = Date.now();
  _odIndexPromise = null;
  return _odIndexSet;
}

function hasDocs(orderId) { return !!(orderId && _odIndexSet && _odIndexSet.has(orderId)); }
function invalidateIndex() { _odIndexSet = null; _odIndexTs = 0; }

// ── Upload / list / fetch ──

/**
 * @param {string} orderId
 * @param {File} file
 * @param {'scan'|'upload'} source
 * @returns {Promise<{id,order_id,sha256,filename,mime,size,source,created_at}>}
 */
async function uploadDoc(orderId, file, source) {
  const gate = validateFile(file);
  if (!gate.ok) { const e = new Error(gate.reason); e._gate = true; throw e; }
  const sha256 = await _odSha256(file);
  const qs = new URLSearchParams({
    order: orderId,
    sha256,
    filename: file.name || ('document.' + gate.ext),
    source: source || 'upload',
  });
  const url = `${PROXY_URL}/docs/upload?${qs.toString()}`;
  // _apiHeaders forces 'Content-Type: application/json' on any non-GET/DELETE
  // method (core/api.js) — every OTHER Worker write is JSON, this one is raw
  // bytes, so the file's own mime must win. Order of Object.assign matters.
  const headers = Object.assign({}, _odHeaders('POST'), { 'Content-Type': gate.mime });
  const res = await _odFetch(url, { method: 'POST', headers, body: file });
  if (res.status === 200 || res.status === 201) {
    invalidateIndex(); // the order just gained (or confirmed) a document — next badge paint must see it
    return res.json().catch(() => ({}));
  }
  const msg = await _odErrMsg(res, 'HTTP ' + res.status);
  const e = new Error(msg); e._status = res.status;
  throw e;
}

/** @returns {Promise<Array<object>>} newest first */
async function listDocs(orderId) {
  const url = `${PROXY_URL}/docs/list?order=${encodeURIComponent(orderId)}`;
  const res = await _odFetch(url, { headers: _odHeaders('GET'), cache: 'no-store' });
  if (!res.ok) throw new Error(await _odErrMsg(res, 'HTTP ' + res.status));
  const data = await res.json();
  return Array.isArray(data) ? data : (data.records || data.docs || []);
}

/** @returns {Promise<{blob:Blob, mime:string}>} */
async function fetchFileBlob(id) {
  const url = `${PROXY_URL}/docs/file/${encodeURIComponent(id)}`;
  const res = await _odFetch(url, { headers: _odHeaders('GET') });
  if (!res.ok) throw new Error(await _odErrMsg(res, 'HTTP ' + res.status));
  const mime = res.headers.get('content-type') || 'application/octet-stream';
  const blob = await res.blob();
  return { blob, mime };
}

// ── Styles (own, minimal — assets/style.css is the review-UI agent's file
// this round; nothing here needs to live there) ──
function _odEnsureStyles() {
  if (document.getElementById('odStyles')) return;
  const st = document.createElement('style'); st.id = 'odStyles';
  st.textContent = `
.od-badge{display:inline-flex;align-items:center;justify-content:center;margin-left:4px;color:var(--text-mid);cursor:pointer;vertical-align:middle}
.od-badge:hover{color:var(--accent)}
.od-banner{position:fixed;left:24px;bottom:88px;z-index:var(--z-top);max-width:420px;background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.18);padding:12px 14px;font:13px/1.4 "DM Sans",sans-serif;display:flex;align-items:flex-start;gap:10px;color:var(--text)}
.od-banner-msg{flex:1}
.od-banner-retry{background:var(--accent);color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
.od-banner-retry:disabled{opacity:.6;cursor:default}
.od-banner-close{background:none;border:none;color:var(--text-mid);font-size:16px;line-height:1;cursor:pointer;padding:0 2px}
.od-list{display:flex;flex-direction:column;gap:8px}
.od-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--border);border-radius:6px;padding:8px 10px}
.od-row-main{display:flex;flex-direction:column;min-width:0}
.od-fname{font-family:'Syne',sans-serif;font-weight:700;font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px}
.od-meta{font-size:11px;color:var(--text-dim);margin-top:2px}
.od-row-acts{display:flex;gap:6px;flex-shrink:0}
.od-empty{padding:24px;text-align:center;color:var(--text-mid);font-size:13px}
.od-inline{margin-top:12px}
`;
  document.head.appendChild(st);
}

// ── Badge (list rows, weekly cards, daily ops rows) ──
/**
 * @param {string} orderId
 * @param {{size?:number}} [opts]
 * @returns {string} '' when the order has no document
 */
function badge(orderId, opts) {
  if (!hasDocs(orderId)) return '';
  _odEnsureStyles();
  const size = (opts && opts.size) || 13;
  const svg = typeof icon === 'function' ? icon('paperclip', size) : '';
  // stopPropagation: the badge sits inside rows/cards that own their own
  // click (select row), drag (Weekly reorder) and right-click (context menu)
  // handlers — the badge must never trigger any of them.
  return `<span class="od-badge" title="Έγγραφα παραγγελίας" onclick="event.stopPropagation();OrderDocs.openViewer('${orderId}')">${svg}</span>`;
}

// ── Detail-card section (orders_intl.js card) ──
function sectionHtml(orderId, opts) {
  if (!_odIndexSet) preloadIndex().catch(() => {}); // best-effort; this render shows "Κανένα έγγραφο" until it lands
  const has = hasDocs(orderId);
  const viewBtn = has
    ? `<button type="button" class="oi-link" onclick="OrderDocs.openViewer('${orderId}')">Προβολή εγγράφων</button>`
    : '<span class="oi-note">Κανένα έγγραφο</span>';
  const attachBtn = (opts && opts.canEdit)
    ? `<button type="button" class="oi-link" onclick="OrderDocs.attachToOrder('${orderId}')">Επισύναψη εγγράφου</button>`
    : '';
  return [viewBtn, attachBtn].filter(Boolean).join('<span class="oi-sep">·</span>');
}

// ── Viewer modal ──
function _odFmtSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n < 1024 * 1024 ? Math.round(n / 1024) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB';
}
function _odFmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('el-GR', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (_) { return String(iso); }
}
function _odSourceLabel(s) { return s === 'scan' ? 'σάρωση' : s === 'upload' ? 'μεταφόρτωση' : (s || '—'); }
// Safe to splice into a double-quoted onclick="..." attribute: JSON.stringify
// gives correct JS-string escaping (quotes/backslashes), escapeHtml then makes
// that text safe as HTML-attribute content — the browser HTML-decodes the
// attribute before running it as JS, landing back on the same string literal.
// A plain JSON.stringify(filename) broke here: a `"` inside a double-quoted
// onclick attribute closes the attribute early, corrupting the button's markup
// (caught by tools/scan-eval/docs-smoke.mjs, filenames are never trusted input).
function _odJsArg(s) { return escapeHtml(JSON.stringify(String(s == null ? '' : s))); }

function _odListHtml(docs) {
  return `<div class="od-list">${docs.map(d => `
    <div class="od-row">
      <div class="od-row-main">
        <span class="od-fname" title="${escapeHtml(d.filename || '')}">${escapeHtml(d.filename || '—')}</span>
        <span class="od-meta">${_odFmtDate(d.created_at)} · ${_odFmtSize(d.size)} · ${_odSourceLabel(d.source)}${d.uploaded_by ? ' · ' + escapeHtml(d.uploaded_by) : ''}</span>
      </div>
      <div class="od-row-acts">
        <button type="button" class="btn btn-secondary btn-sm" onclick="OrderDocs._openInline(${_odJsArg(d.id)},${_odJsArg(d.filename)})">Προβολή</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="OrderDocs._download(${_odJsArg(d.id)},${_odJsArg(d.filename || 'document')})">Λήψη</button>
      </div>
    </div>
    <div id="_odInline_${escapeHtml(d.id)}"></div>`).join('')}</div>`;
}

async function openViewer(orderId) {
  _odEnsureStyles();
  const BODY = '_odViewerBody';
  openModal('Έγγραφα παραγγελίας', `<div id="${BODY}">${typeof showLoading === 'function' ? showLoading('Φόρτωση…') : 'Φόρτωση…'}</div>`,
    `<button type="button" class="btn btn-ghost" onclick="closeModal()">Κλείσιμο</button>`);
  try {
    const docs = await listDocs(orderId);
    const body = document.getElementById(BODY);
    if (!body) return; // modal was closed while the request was in flight
    body.innerHTML = docs.length ? _odListHtml(docs) : '<div class="od-empty">Δεν βρέθηκαν έγγραφα.</div>';
  } catch (e) {
    console.warn('[order-docs] list failed:', e && e.message);
    const body = document.getElementById(BODY);
    if (body) body.innerHTML = `<div class="od-empty">Τα έγγραφα δεν φορτώθηκαν — ${escapeHtml(e.message || '')}.</div>`;
  }
}

async function _openInline(id, filename) {
  const holder = document.getElementById('_odInline_' + id);
  if (!holder) return;
  holder.className = 'od-inline';
  holder.innerHTML = typeof showLoading === 'function' ? showLoading('Φόρτωση εγγράφου…') : 'Φόρτωση…';
  try {
    const { blob, mime } = await fetchFileBlob(id);
    if (window.DocViewer && typeof window.DocViewer.render === 'function') {
      holder.innerHTML = '';
      await window.DocViewer.render(holder, { blob, mime, filename });
    } else {
      // Fallback while core/doc-viewer.js is still a placeholder (round-3
      // agents build in parallel) — a plain blob preview, same data.
      const url = URL.createObjectURL(blob);
      holder.innerHTML = /^image\//.test(mime)
        ? `<img src="${url}" alt="${escapeHtml(filename || '')}" style="max-width:100%;border-radius:6px">`
        : `<iframe src="${url}" title="${escapeHtml(filename || '')}" style="width:100%;height:60vh;border:1px solid var(--border);border-radius:6px"></iframe>`;
    }
  } catch (e) {
    console.warn('[order-docs] file fetch failed:', e && e.message);
    holder.innerHTML = `<div class="od-empty">Το έγγραφο δεν φορτώθηκε — ${escapeHtml(e.message || '')}.</div>`;
  }
}

async function _download(id, filename) {
  try {
    const { blob } = await fetchFileBlob(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'document';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) {
    console.warn('[order-docs] download failed:', e && e.message);
    if (typeof showErrorToast === 'function') showErrorToast('Η λήψη απέτυχε', 'error');
  }
}

// ── Explicit attach action (existing order) ──
function attachToOrder(orderId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = OD_ACCEPT;
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    toast('Μεταφόρτωση εγγράφου…', 'info');
    try {
      await uploadDoc(orderId, file, 'upload');
      toast('Το έγγραφο αποθηκεύτηκε ✓', 'success');
      // uploadDoc() already invalidated the badge index, but sectionHtml's own
      // lazy preload (fire-and-forget) would not repaint anything once it
      // lands — the card would keep showing «Κανένα έγγραφο» until some
      // unrelated action re-rendered it. Force the refetch NOW, then repaint
      // the row + card through the one hook orders_intl.js already exposes
      // for exactly this (fresh data in, same render) — no full page reload.
      await preloadIndex(true);
      if (typeof window._intlRefreshOrder === 'function') {
        await window._intlRefreshOrder(orderId);
      } else if (typeof INTL_ORDERS !== 'undefined' && INTL_ORDERS.selectedId === orderId && typeof selectIntlOrder === 'function') {
        selectIntlOrder(orderId);
      }
    } catch (e) {
      _showUploadFailedBanner(orderId, file, 'upload', e);
    }
  }, { once: true });
  input.click();
}

// ── Persistent failure banner (principle 1: a failed write must be LOUD,
// never a toast that fades in 3s while the order looks fully saved) ──
function _showUploadFailedBanner(orderId, file, source, err) {
  _odEnsureStyles();
  const is501 = err && err._status === 501;
  const label = '#' + String(orderId || '').slice(-6);
  const msg = is501
    ? 'Η φύλαξη εγγράφων δεν έχει ενεργοποιηθεί ακόμη — το έγγραφο ΔΕΝ αποθηκεύτηκε.'
    : `Η παραγγελία ${label} αποθηκεύτηκε, αλλά το έγγραφο ΔΕΝ ανέβηκε — ${(err && err.message) || 'σφάλμα ανεβάσματος'}.`;
  const wrap = document.createElement('div');
  wrap.className = 'od-banner';
  wrap.innerHTML = `<span class="od-banner-msg">${escapeHtml(msg)}</span>
    <button type="button" class="od-banner-retry">Ξαναδοκίμασε</button>
    <button type="button" class="od-banner-close" aria-label="Κλείσιμο">×</button>`;
  document.body.appendChild(wrap);
  wrap.querySelector('.od-banner-close').onclick = () => wrap.remove();
  wrap.querySelector('.od-banner-retry').onclick = async () => {
    const btn = wrap.querySelector('.od-banner-retry');
    btn.disabled = true; btn.textContent = 'Ξαναπροσπάθεια…';
    try {
      await uploadDoc(orderId, file, source); // same File object, still in memory — no re-pick needed
      wrap.remove();
      toast('Το έγγραφο αποθηκεύτηκε ✓', 'success');
    } catch (e2) {
      wrap.remove();
      _showUploadFailedBanner(orderId, file, source, e2);
    }
  };
}

// ── Post-save hooks ──

/**
 * Called by modules/orders_intl.js right after a NEW order is created
 * (submitIntlOrder, !recId branch only — an edit never touches
 * _scanPendingDoc). Upload-after-create is the only order the two writes can
 * happen in, so "upload OK but order save failed" cannot occur here: this
 * function never runs unless the order create already succeeded.
 * @param {string} orderId - the just-created order's record id
 */
async function handleOrderSaved(orderId) {
  const pending = window._scanPendingDoc;
  if (!pending || !pending.file) return;
  // One-shot regardless of outcome: a stale pointer must never attach to a
  // LATER, unrelated order (e.g. the next row of a batch scan queue).
  window._scanPendingDoc = null;
  try {
    await uploadDoc(orderId, pending.file, pending.source || 'scan');
    toast('Το έγγραφο αποθηκεύτηκε ✓', 'success');
  } catch (e) {
    _showUploadFailedBanner(orderId, pending.file, pending.source || 'scan', e);
  }
}

/**
 * Called by modules/orders_natl.js right after a NEW national order is
 * created. National orders write to `national_orders`, not `orders` —
 * order_documents.order_id is an FK to `orders`, so uploading here would
 * either fail the FK or (worse) attach silently to the wrong id-space if the
 * column were ever made loose. Until national gets its own documents column
 * (GAP — not built this round), the honest answer is: say so, don't attempt it.
 */
function handleNatlOrderSaved() {
  const pending = window._scanPendingDoc;
  if (!pending || !pending.file) return;
  window._scanPendingDoc = null;
  toast('Η φύλαξη εγγράφου για εθνικές δεν υποστηρίζεται ακόμη', 'warn');
}

window.OrderDocs = {
  ACCEPT: OD_ACCEPT,
  validateFile, uploadDoc, listDocs, fetchFileBlob,
  preloadIndex, hasDocs, invalidateIndex,
  badge, sectionHtml, openViewer, attachToOrder,
  handleOrderSaved, handleNatlOrderSaved,
  _openInline, _download,
};
})();
