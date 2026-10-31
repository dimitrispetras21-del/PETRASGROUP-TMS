// ═══════════════════════════════════════════════════════════════════════
// CORE — NEW VERSION, RELOADED ONLY WHEN NOTHING IS HALF-DONE (F20 / F58 / F36, owner 31/10/2026)
// ─────────────────────────────────────────────────────────────────────
// sw.js activates a new SW_VERSION at once (skipWaiting + clients.claim), and app.html used to answer its
// controllerchange with location.reload() on the spot. In the owner's dispatcher simulation that reload landed
// three times on a half-filled form: everything typed was gone, no warning, 0 rows written. The version check
// itself is unchanged; only the moment of the reload moves:
//   - nothing open and nothing typed → reload now, as before (the user sees the new version at once);
//   - a form, dialog or popover open, focus in a field, or a field typed into and still on screen → a small
//     «Νέα έκδοση · ανανέωση» pill; a click reloads at once, and the page reloads by itself at the first check
//     (every 2 s) that finds nothing open.
// Conservative on purpose: a false «busy» only delays the reload (the pill is there); a false «idle» loses work.
// At load it only defines globals: no listener, timer or DOM until app.html calls tmsSwUpdateWatch / Ready.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const CHECK_MS = 2000;
// Every kind of floating window this app draws: the shared modal (core/ui.js .modal-overlay.open), the modules'
// own overlays / drawers / dialogs / menus (mf-, ct-, ex-, dl-, pu-, plv-, locc-, cmdk-, aic-, mnt-drawer, wn5-dlg,
// wn5-menu, wi4-*, wi-panel …). Matched by name AND by visibility: closed ones stay in the DOM hidden.
const OPEN_SEL = [
  'dialog[open]', '[role="dialog"]', '[aria-modal="true"]',
  '[class*="overlay"]', '[class*="modal"]', '[class*="popover"]', '[class*="drawer"]', '[class*="scrim"]',
  '[class*="popup"]', '[class*="dlg"]', '[class*="-pop"]',
  '.wi-panel', '.wi-sdl', '#wi-ctx', '.entity-detail-panel', '.wi4-conf', '.wi4-datep', '.wi4-qp',
  '.wn5-menu', '.wi4-umenu', '.wi-group-pals',
].join(',');
// The page's own notices are never «a form»: this pill, the offline / cache-age banners, the toasts.
const OWN = '#tmsUpdatePill, #offlineBanner, #cacheAgeBanner, #tms-toast-container, #toast';
// A search or filter box keeps its text for the whole visit; it is not unsaved work.
const SEARCHY = /search|filter|αναζ[ηή]τ|φίλτρ/i;

let _typed = null;      // fields the user typed into on this page (see _noteTyped)
let _pending = false;
let _timer = 0;

function _visible(el) {
  if (!el || !el.isConnected || !el.getClientRects().length) return false;
  // a closed side panel stays in the DOM collapsed to 0 px (core/entity.js .entity-detail-panel.hidden)
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (getComputedStyle(el).visibility === 'hidden') return false;   // inherited: covers a hidden parent
  // opacity is not inherited: a closed window faded out on its outer box leaves its inner boxes at 1
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (Number(getComputedStyle(n).opacity) === 0) return false;
  }
  return true;
}

function _editable(el) {
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function _searchy(el) {
  return el.type === 'search' || el.getAttribute('role') === 'searchbox'
    || SEARCHY.test([el.id, el.className, el.name, el.placeholder].map(String).join(' '));
}

function _changed(el) {
  if (el.isContentEditable) return true;
  if (el.tagName === 'SELECT') return Array.from(el.options).some((o) => o.selected !== o.defaultSelected);
  if (el.type === 'checkbox' || el.type === 'radio') return el.checked !== el.defaultChecked;
  return el.value !== el.defaultValue;
}

// Why a reload now would lose something (null = nothing would be lost).
function tmsFormBusy() {
  const a = document.activeElement;
  if (_editable(a) && !a.closest(OWN)) return 'focus';
  for (const el of document.querySelectorAll(OPEN_SEL)) {
    if (!el.closest(OWN) && _visible(el)) return 'open';
  }
  if (_typed) {
    for (const el of _typed) {
      if (!el.isConnected) { _typed.delete(el); continue; }   // re-drawn after its save: nothing left to lose
      if (_visible(el) && !_searchy(el) && _changed(el)) return 'typed';
    }
  }
  return null;
}

function _pill() {
  let p = document.getElementById('tmsUpdatePill');
  if (p) return p;
  p = document.createElement('button');
  p.type = 'button';
  p.id = 'tmsUpdatePill';
  p.textContent = 'Νέα έκδοση · ανανέωση';
  // bottom centre: the left edge is the navy sidebar (navy on navy did not show), the right edge the toasts
  p.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:calc(var(--z-top) + 4);border:0;'
    + 'border-radius:999px;padding:6px 14px;background:var(--accent);color:#fff;font:500 12px/1.4 "DM Sans",sans-serif;'
    + 'box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;opacity:.92;';
  // An explicit click is the user's choice, form or not.
  p.addEventListener('click', () => _reload());
  document.body.appendChild(p);
  return p;
}

function _reload() {
  if (_timer) { clearInterval(_timer); _timer = 0; }
  window.location.reload();
}

function _check() {
  if (!tmsFormBusy()) _reload();
}

// Called by app.html on the SW's controllerchange. Once per page: the reload, when it comes, loads the new version.
function tmsSwUpdateReady() {
  if (_pending) return;
  _pending = true;
  if (!tmsFormBusy()) { _reload(); return; }
  _pill();
  _timer = setInterval(_check, CHECK_MS);
}

// Typed fields are remembered from the first keystroke of the page, not from the announcement: a field filled
// a minute ago and left (focus elsewhere, no dialog) is still unsaved work when the new version arrives.
function _noteTyped(e) {
  if (!e.isTrusted || !_editable(e.target)) return;
  (_typed = _typed || new Set()).add(e.target);
}

function tmsSwUpdateWatch() {
  document.addEventListener('input', _noteTyped, true);
  document.addEventListener('change', _noteTyped, true);
}

window.tmsFormBusy = tmsFormBusy;
window.tmsSwUpdateReady = tmsSwUpdateReady;
window.tmsSwUpdateWatch = tmsSwUpdateWatch;
})();
