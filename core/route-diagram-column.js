// ═══════════════════════════════════════════════════════════════════════
// ROUTE DIAGRAM COLUMN — the diagram in its own column beside a side card (global RouteDiagramColumn)
// ─────────────────────────────────────────────────────────────────────
// Owner 8/11/2026 («Ναι, φτιάξτο», on a mock over the live app): on a wide screen the route diagram of «Παραγγελίες ›
// Εβδομάδα» (order card) and «Παλέτες › Εβδομάδα» (order panel) leaves the card for a 400px column at the right
// edge, and the card moves left to sit next to it. Below 1600px the screen has no room for both: the diagram stays
// inside the card, as before. Both screens use this one helper, so the column, its head and the width rule are
// the same in both (principle 3). core/route-diagram.js stays pure (no DOM): the DOM is here.
//
// The host decides WHAT is drawn (it already read the stops: no read here) and calls:
//   wide()                                  the screen has room for the column (re-checked on every call)
//   open(container, { anchor, sub, body, z, onClose })   put/refresh THE column of container; anchor = the card
//   close(container)                        remove it and put the card back at the right edge
//   sub(vehicle, stops)                     the head's grey text «truck · driver · 3/11 → 7/11»
//   onWideChange(key, fn)                   fn() when the width crosses 1600px (one listener per key)
// The column closes by itself when its anchor gets the class «hidden» (every way the order card closes: ×, Esc,
// another card, the documents) — the card's own code is not touched for it.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const MQ = '(min-width: 1600px)';
const WIDTH = 400;
const ATH_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' });

const _mq = () => (typeof window.matchMedia === 'function' ? window.matchMedia(MQ) : null);

function wide() {
  const mq = _mq();
  return mq ? mq.matches : window.innerWidth >= 1600;
}

// The head (owner rule: truck · driver · days, never a bare code). vehicle = [plate, who] as the screen already
// knows them; stops = ORDER STOPS facade records (fields.DateTime). Unknown parts are left out, not guessed:
// with nothing known the head is «Διαδρομή» alone.
function sub(vehicle, stops) {
  const dm = (ymd) => Number(ymd.slice(8, 10)) + '/' + Number(ymd.slice(5, 7));
  const days = (stops || []).map((s) => s && s.fields && s.fields.DateTime)
    .filter((v) => v && !Number.isNaN(new Date(v).getTime())).map((v) => ATH_DAY.format(new Date(v))).sort();
  const span = days.length ? dm(days[0]) + (days[days.length - 1] !== days[0] ? ' → ' + dm(days[days.length - 1]) : '') : '';
  // '—' is how the week screen writes a vehicle with no plate: not a fact for the head
  return [...(vehicle || []).map((x) => String(x || '').trim()).filter((x) => x && x !== '—'), span].filter(Boolean).join(' · ');
}

function _stop(col) {
  if (col._rdcObs) col._rdcObs.disconnect();
  if (col._rdcAnchor) col._rdcAnchor.style.right = '';
}

function open(container, o) {
  if (!container) return null;
  let col = container.querySelector(':scope > .rdc');
  if (!col) {
    col = document.createElement('aside');
    col.className = 'rdc';
    col.setAttribute('aria-label', 'Διαδρομή');
    col.innerHTML = '<div class="rdc-h"><b>Διαδρομή</b><span data-rdc-sub></span>'
      + '<button type="button" class="rdc-x" title="Κλείσιμο διαδρομής" aria-label="Κλείσιμο διαδρομής">×</button></div><div class="rdc-b" data-rdc-body></div>';
    // the column's own × closes only the column: the host puts the diagram back inside its card (onClose)
    col.querySelector('.rdc-x').addEventListener('click', () => { const f = col._rdcClose; close(container); if (f) f(); });
    container.appendChild(col);
  }
  col._rdcClose = o.onClose || null;
  if (o.z != null) col.style.zIndex = String(o.z);
  col.querySelector('[data-rdc-sub]').textContent = o.sub || '';
  const body = col.querySelector('[data-rdc-body]');
  const top = body.scrollTop;
  body.innerHTML = o.body || '';
  body.scrollTop = top;
  if (col._rdcAnchor !== o.anchor) {
    _stop(col);
    col._rdcAnchor = o.anchor || null;
    col._rdcObs = null;
    if (o.anchor && typeof MutationObserver === 'function') {
      // the card closed (class «hidden») or left the page: the column goes with it
      col._rdcObs = new MutationObserver(() => {
        if (!o.anchor.isConnected || o.anchor.classList.contains('hidden')) close(container);
      });
      col._rdcObs.observe(o.anchor, { attributes: true, attributeFilter: ['class'] });
    }
  }
  if (o.anchor) o.anchor.style.right = WIDTH + 'px';
  return col;
}

function close(container) {
  const col = container && container.querySelector(':scope > .rdc');
  if (!col) return false;
  _stop(col);
  col.remove();
  return true;
}

const _watch = new Map();
let _wired = false;
function onWideChange(key, fn) {
  _watch.set(key, fn);
  if (_wired) return;
  _wired = true;
  const mq = _mq();
  const run = () => _watch.forEach((f) => { try { f(); } catch (e) { console.error('route diagram column: resize', e); } });
  if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', run);
  else window.addEventListener('resize', (() => { let w = wide(); return () => { if (wide() !== w) { w = wide(); run(); } }; })());
}

const RouteDiagramColumn = Object.freeze({ WIDTH, wide, open, close, sub, onWideChange });
if (typeof window !== 'undefined') window.RouteDiagramColumn = RouteDiagramColumn;
})();
