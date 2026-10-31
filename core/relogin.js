// ═══════════════════════════════════════════════════════════════════════
// CORE — LOG IN AGAIN WITHOUT LEAVING THE PAGE (F36, owner 31/10/2026)
// ─────────────────────────────────────────────────────────────────────
// The 8-hour JWT ends in the middle of the day's work. Until 31/10 the first 401 sent the page to index.html, and a
// form half-filled or just saved was gone with it (simulation F36). Now core/api.js opens this window over the
// page instead: the same /auth/login as index.html, the form underneath untouched. After the login:
//   - the same user and role → the page carries on (tmsSessionRestored); a /plan/* write with a request_id that was
//     waiting is sent again by core/plan-api.js; any other write that was refused is NOT re-sent — this window and
//     a red toast say «πάτα ξανά Αποθήκευση», so the user presses Save and sees what goes;
//   - another user or another role → a fresh app.html, where core/auth.js runs the tamper guard as at every login:
//     this page's menus, role and form belong to the user who opened it.
// No silent refresh (a Worker and security change, the owner's decision for later) and no new refusal.
// At load it only defines its global: no listener, timer or DOM until the first 401.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const LOST_TEXT = 'Η σύνδεση έληξε — πάτα ξανά Αποθήκευση';
const SESSION_TTL = 8 * 60 * 60 * 1000;   // index.html's fallback when the token has no readable exp

let _el = null;
let _lost = false;
let _busy = false;

// The same reading as index.html _jwtExpiryMs (index.html loads no core file, so the rule lives twice;
// tests/relogin.test.mjs holds the two bodies equal).
function _jwtExpiryMs(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function _pageUser() {
  // `user` is core/auth.js's top-level binding: whose page this is, read at load and never changed by a login here.
  return typeof user !== 'undefined' && user && user.username ? user : null;
}

function _build(u) {
  const ov = document.createElement('div');
  ov.id = 'tmsRelogin';
  ov.className = 'tms-relogin-overlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-labelledby', 'tmsReloginTitle');
  ov.style.cssText = 'position:fixed;inset:0;z-index:calc(var(--z-top) + 10);display:flex;align-items:center;'
    + 'justify-content:center;background:rgba(11,25,41,.55);font:14px/1.45 "DM Sans",sans-serif;';
  ov.innerHTML =
    '<form id="tmsReloginForm" autocomplete="on" style="width:320px;max-width:calc(100vw - 32px);background:var(--bg-card,#fff);'
    + 'border-radius:10px;padding:22px 22px 18px;box-shadow:0 12px 32px rgba(0,0,0,.3);color:var(--text,#0B1929);">'
    + '<div id="tmsReloginTitle" style="font:700 18px/1.3 Syne,sans-serif;margin-bottom:4px;">Συνδέσου ξανά</div>'
    + '<div id="tmsReloginNote" style="color:var(--text-mid,#64748B);font-size:13px;margin-bottom:14px;">Η σύνδεση έληξε. Η φόρμα σου μένει ανοιχτή.</div>'
    + '<div id="tmsReloginLost" style="display:none;color:var(--danger,#B91C1C);font-weight:600;font-size:13px;margin-bottom:14px;"></div>'
    + '<label style="display:block;font-size:12px;color:var(--text-mid,#64748B);margin-bottom:3px;" for="tmsReloginUser">Χρήστης</label>'
    + '<input id="tmsReloginUser" name="username" autocomplete="username" readonly style="width:100%;box-sizing:border-box;'
    + 'padding:8px 10px;border:1px solid var(--border,#CBD5E1);border-radius:6px;background:var(--bg,#F4F6F9);margin-bottom:10px;">'
    + '<label style="display:block;font-size:12px;color:var(--text-mid,#64748B);margin-bottom:3px;" for="tmsReloginPass">Κωδικός</label>'
    + '<input id="tmsReloginPass" name="password" type="password" autocomplete="current-password" required style="width:100%;'
    + 'box-sizing:border-box;padding:8px 10px;border:1px solid var(--border,#CBD5E1);border-radius:6px;margin-bottom:8px;">'
    + '<div id="tmsReloginErr" role="alert" style="display:none;color:var(--danger,#B91C1C);font-size:12px;margin-bottom:8px;"></div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">'
    + '<a href="index.html" id="tmsReloginOut" style="font-size:12px;color:var(--text-mid,#64748B);">Έξοδος</a>'
    + '<button type="submit" id="tmsReloginBtn" style="border:0;border-radius:6px;padding:8px 18px;background:var(--accent,#0284C7);'
    + 'color:#fff;font:600 13px "DM Sans",sans-serif;cursor:pointer;">Σύνδεση</button>'
    + '</div></form>';
  ov.querySelector('#tmsReloginUser').value = u.username;
  ov.querySelector('#tmsReloginForm').addEventListener('submit', (e) => { e.preventDefault(); _submit(); });
  return ov;
}

function _showLost() {
  if (!_el) return;
  _el.querySelector('#tmsReloginNote').style.display = 'none';
  const l = _el.querySelector('#tmsReloginLost');
  l.textContent = LOST_TEXT;
  l.style.display = 'block';
}

function _err(text) {
  const e = _el && _el.querySelector('#tmsReloginErr');
  if (!e) return;
  e.textContent = text || '';
  e.style.display = text ? 'block' : 'none';
}

// core/api.js calls this for every request refused while the session is gone (idempotent). lostWrite: a write of
// the user was refused or answered 401 and will not be sent by itself.
// While the window is open no key reaches the page and focus stays in it. Keys are stopped on WINDOW in the capture
// phase, the first stop of every key: core/ui.js's confirm dialog listens on document in the capture phase too
// (Enter → confirm), so a stop on the window element itself would come too late and an Enter in the password
// field would confirm the dialog underneath. stopPropagation leaves the form's own Enter → submit (a default action).
function _guardKey(e) {
  if (!_el) return;
  e.stopPropagation();
  if (!_el.contains(e.target)) e.preventDefault();
  if (e.key === 'Tab') {
    // past the last field Tab would leave the page (no focusin to catch it): cycle inside the window
    const f = Array.from(_el.querySelectorAll('input:not([readonly]), a[href], button'));
    const i = f.indexOf(document.activeElement);
    e.preventDefault();
    f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
  }
}
function _trapFocus(e) {
  if (_el && !_el.contains(e.target)) { const p = _el.querySelector('#tmsReloginPass'); if (p) p.focus(); }
}

function tmsReloginOpen(lostWrite) {
  const u = _pageUser();
  if (!u) throw new Error('relogin: no page user');   // core/api.js falls back to the old navigation
  if (lostWrite) _lost = true;
  if (!_el) {
    _el = _build(u);
    document.body.appendChild(_el);
    window.addEventListener('keydown', _guardKey, true);
    document.addEventListener('focusin', _trapFocus, true);
    setTimeout(() => { const p = _el && _el.querySelector('#tmsReloginPass'); if (p) p.focus(); }, 0);
  }
  if (_lost) _showLost();
}

function _close() {
  window.removeEventListener('keydown', _guardKey, true);
  document.removeEventListener('focusin', _trapFocus, true);
  if (_el) _el.remove();
  _el = null;
}

async function _submit() {
  if (_busy || !_el) return;
  const u = _pageUser();
  const pass = _el.querySelector('#tmsReloginPass').value;
  if (!pass) { _err('Γράψε τον κωδικό'); return; }
  _busy = true;
  const btn = _el.querySelector('#tmsReloginBtn');
  btn.disabled = true; btn.textContent = 'Σύνδεση…';
  _err('');
  try {
    let res, data = null;
    try {
      res = await fetch(`${PROXY_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u.username, password: pass }),
      });
      data = await res.json().catch(() => null);
    } catch (_) {
      _err(navigator.onLine ? 'Δεν απάντησε το σύστημα — δοκίμασε ξανά' : 'Δεν υπάρχει σύνδεση στο internet');
      return;
    }
    if (!res.ok || !data || !data.token) {
      _err(res.status === 401 ? 'Λάθος κωδικός' : `Το σύστημα δεν απάντησε σωστά (σφάλμα ${res.status}) — δοκίμασε ξανά`);
      return;
    }
    const profile = data.user || {};
    const session = {
      name: profile.name,
      role: profile.role,
      username: profile.username,
      loginAt: Date.now(),
      expiresAt: _jwtExpiryMs(data.token) || (Date.now() + SESSION_TTL),
    };
    localStorage.setItem('tms_jwt', data.token);
    localStorage.setItem('tms_user', JSON.stringify(session));
    if (session.username !== u.username || session.role !== u.role) {
      // Not this page's user or role any more: a fresh page, through core/auth.js's guard.
      window.location.href = 'app.html';
      return;
    }
    u.loginAt = session.loginAt;
    u.expiresAt = session.expiresAt;
    const lost = _lost;
    _lost = false;
    _close();
    if (typeof tmsSessionRestored === 'function') tmsSessionRestored();
    if (lost && typeof showErrorToast === 'function') showErrorToast(LOST_TEXT, 'error', 10000);
  } finally {
    _busy = false;
    if (_el) { const b = _el.querySelector('#tmsReloginBtn'); if (b) { b.disabled = false; b.textContent = 'Σύνδεση'; } }
  }
}

window.tmsReloginOpen = tmsReloginOpen;
})();
