// ═══════════════════════════════════════════════════════════════════
// SCAN REVIEW (scan round 3, 27/9/2026)
//
// Puts the order form next to the original scanned document (core/doc-
// viewer.js) so a dispatcher checks a value against the source instead of
// trusting a green field. v2-engine results only (core/scan-engine-v2.js) —
// v1 keeps today's plain confidence tint, no side-by-side (docs/scan/03: v1
// never kept the original document at all, so there is nothing to show it
// next to).
//
//   window.ScanReview.attach({ formRoot, file, text, fieldMeta,
//                              modelLabel?, warnings? }) → { detach() }
//
//   fieldMeta = { [inputElementId]: { confidence: 0..1, quote: string, label } }
//
// formRoot's current children ARE "the form" — attach() wraps them next to
// the document; detach() puts them back. Callers (modules/orders_intl.js,
// modules/orders_natl.js) pass core/scan-engine-v2.js's own field_confidence
// / per-field quotes straight through — no matching logic lives here, only
// display and the accept/edit bookkeeping.
//
// window._scanPendingDoc = { file, source: 'scan' } is set here for the
// document-storage save path to pick up and upload — cleared on detach.
// Detach itself is driven by a MutationObserver on the modal overlay, not by
// hooking Save/Cancel: those buttons belong to submitIntlOrder/submitNatlOrder
// (owned elsewhere), and closeModal() is the one choke point every close path
// already goes through. A `wrapper.isConnected` check guards against a
// detach that fires AFTER a newer scan has already replaced formRoot's
// content (the batch "Save → next scan" flow) — the exact race this file
// must not lose to (Principle 1: a silent stomp of the next form would be
// worse than a no-op restore).
// ═══════════════════════════════════════════════════════════════════
'use strict';

let _srCurrent = null;   // the one attached instance — a new attach() always retires it first
let _srSeq = 0;

function _srMark(score) {
  if (score >= 0.9) return { cls: 'scan-review-badge-high', text: '✓' };
  if (score >= 0.6) return { cls: 'scan-review-badge-med', text: '~ έλεγξε' };
  return { cls: 'scan-review-badge-low', text: '⚠ έλεγξε' };
}

function _srAttach(opts) {
  if (_srCurrent) { try { _srCurrent.detach(); } catch (e) {} }

  const formRoot = opts.formRoot;
  const fieldMeta = opts.fieldMeta || {};
  const myId = ++_srSeq;
  const originalHTML = formRoot.innerHTML;
  const modalEl = formRoot.closest('.modal') || document.getElementById('modal');
  const prevWidth = modalEl ? modalEl.style.width : '';
  const prevMaxWidth = modalEl ? modalEl.style.maxWidth : '';

  const warnings = opts.warnings || [];
  formRoot.innerHTML = `
    <div class="scan-review-layout" id="scanReviewLayout${myId}">
      <div class="scan-review-header">
        ${opts.modelLabel ? `<span class="scan-review-model">${escapeHtml(opts.modelLabel)}</span>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" id="scanReviewAccept${myId}">Αποδοχή βέβαιων</button>
        <span class="scan-review-count" id="scanReviewCount${myId}"></span>
      </div>
      ${warnings.length ? `<div class="scan-review-warnings">${warnings.map(w => '⚠ ' + escapeHtml(w)).join('<br>')}</div>` : ''}
      <div class="scan-review-cols">
        <div class="scan-review-doc" id="scanReviewDoc${myId}"></div>
        <div class="scan-review-form" id="scanReviewForm${myId}"></div>
      </div>
    </div>`;
  const wrapper = document.getElementById('scanReviewLayout' + myId);
  document.getElementById('scanReviewForm' + myId).innerHTML = originalHTML;

  if (modalEl) { modalEl.style.width = 'min(1320px, 96vw)'; modalEl.style.maxWidth = '96vw'; }

  const docPane = document.getElementById('scanReviewDoc' + myId);
  const countEl = document.getElementById('scanReviewCount' + myId);
  const acceptBtn = document.getElementById('scanReviewAccept' + myId);

  const entries = Object.keys(fieldMeta).map(id => {
    const el = document.getElementById(id);
    return el ? { id, el, meta: fieldMeta[id], reviewed: false, badgeEl: null } : null;
  }).filter(Boolean);

  const updateCount = () => {
    const n = entries.filter(e => !e.reviewed && (e.meta.confidence || 0) < 0.9).length;
    countEl.textContent = n ? `${n} πεδία θέλουν έλεγχο` : 'όλα ελεγμένα ✓';
  };

  const clearDecoration = entry => {
    entry.el.classList.remove('scan-conf-high', 'scan-conf-med', 'scan-conf-low');
    if (entry.badgeEl) { entry.badgeEl.remove(); entry.badgeEl = null; }
  };

  const decorate = entry => {
    clearDecoration(entry);
    if (entry.reviewed) return;
    const c = entry.meta.confidence || 0;
    const hasValue = String(entry.el.value == null ? '' : entry.el.value).trim() !== '';
    const badge = document.createElement('div');
    badge.className = 'scan-review-badge';
    if (!hasValue && c === 0) {
      entry.el.classList.add('scan-conf-low');
      badge.classList.add('scan-review-badge-low');
      badge.textContent = '⚠ δεν βρέθηκε';
    } else if (c >= 0.9) {
      badge.classList.add('scan-review-badge-high');
      badge.textContent = '✓';
    } else {
      entry.el.classList.add(c >= 0.6 ? 'scan-conf-med' : 'scan-conf-low');
      const m = _srMark(c);
      badge.classList.add(m.cls);
      badge.textContent = m.text;
    }
    entry.el.insertAdjacentElement('afterend', badge);
    entry.badgeEl = badge;
  };

  const markReviewed = entry => {
    if (entry.reviewed) return;
    entry.reviewed = true;
    clearDecoration(entry);
    updateCount();
  };

  let viewer = null;
  let destroyed = false;

  DocViewer.render(docPane, { file: opts.file, text: opts.text }).then(v => {
    if (destroyed) { v.destroy(); return; }   // detached while the viewer was still loading
    viewer = v;
    entries.forEach(entry => {
      decorate(entry);
      const onFocus = () => { if (entry.meta.quote) viewer.highlight(entry.meta.quote); };
      const onEdit = () => markReviewed(entry);
      entry.el.addEventListener('focus', onFocus);
      entry.el.addEventListener('click', onFocus);
      entry.el.addEventListener('input', onEdit);
      entry.el.addEventListener('change', onEdit);
    });
    updateCount();
  }).catch(e => {
    console.warn('[scan-review] DocViewer failed:', e && e.message);
    docPane.innerHTML = `<div class="doc-viewer-unsupported">Το έγγραφο δεν φορτώθηκε (${escapeHtml(e && e.message || '')}).</div>`;
    entries.forEach(decorate);
    updateCount();
  });

  acceptBtn.addEventListener('click', () => {
    entries.filter(e => !e.reviewed && (e.meta.confidence || 0) >= 0.9).forEach(markReviewed);
  });

  // Every scan opens a fresh order form; the storage agent uploads the ORIGINAL
  // file the user picked, so only set this when we actually have one (a replay
  // / text-only caller has nothing to upload).
  if (opts.file) window._scanPendingDoc = { file: opts.file, source: 'scan', __srId: myId };

  const overlay = document.getElementById('modalOverlay');
  let obs = null;
  if (overlay) {
    obs = new MutationObserver(muts => {
      const closed = muts.some(m => m.attributeName === 'class' && m.oldValue && m.oldValue.includes('open') && !overlay.classList.contains('open'));
      if (closed) detach();
    });
    obs.observe(overlay, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  }

  function detach() {
    if (destroyed) return;
    destroyed = true;
    if (obs) { try { obs.disconnect(); } catch (e) {} }
    if (viewer) { try { viewer.destroy(); } catch (e) {} }
    // Only restore if nothing newer has already replaced this content — a
    // stale detach (this instance's overlay-close observer, firing after a
    // NEW scan already reused the same #modalBody) must never overwrite it.
    if (wrapper.isConnected) { try { formRoot.innerHTML = originalHTML; } catch (e) {} }
    if (modalEl && modalEl.isConnected) { modalEl.style.width = prevWidth; modalEl.style.maxWidth = prevMaxWidth; }
    if (window._scanPendingDoc && window._scanPendingDoc.__srId === myId) delete window._scanPendingDoc;
    if (_srCurrent === inst) _srCurrent = null;
  }

  const inst = { detach };
  _srCurrent = inst;
  return inst;
}

if (typeof window !== 'undefined') {
  window.ScanReview = { attach: _srAttach };
}
