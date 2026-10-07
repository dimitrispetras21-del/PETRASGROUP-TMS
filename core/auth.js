// ═══════════════════════════════════════════════
// CORE — AUTH
// ═══════════════════════════════════════════════

let user;
try { user = JSON.parse(localStorage.getItem('tms_user') || 'null'); }
catch { user = null; }  // malformed JSON

// Crash-test fix: validate expiresAt is a real number (not "invalid" or NaN).
// Without this, `Date.now() > NaN` is always false → never auto-logs out if
// localStorage is tampered with (security-adjacent).
function _authSessionExpired(u) {
  if (!u) return true;
  if (!u.expiresAt) return false;  // no expiry set = session never expires
  const exp = typeof u.expiresAt === 'number' ? u.expiresAt : parseInt(u.expiresAt, 10);
  if (isNaN(exp) || exp <= 0) return true;  // malformed → treat as expired
  return Date.now() > exp;
}

// Role escalation guard: user.role comes from localStorage (mutable by attacker).
// Cross-check against the canonical USERS array — if the stored role does not
// match the role registered for this username, force a logout.
// This closes the window where an attacker edits tms_user in DevTools to 'owner'.
function _authRoleTampered(u) {
  if (!u || !u.username) return false;  // nothing to check
  if (typeof USERS === 'undefined' || !Array.isArray(USERS)) return false;  // USERS not loaded yet
  const known = USERS.find(x => x.username === u.username);
  if (!known) return true;  // username not in allowed list
  return known.role !== u.role;
}

// Why this page is turned away (null = it may stay). Not a yes/no like the
// tests above, because api.js needs the REASON: a plain
// expiry or no login is every morning's first page and stays silent, while a
// tamper-guard bounce is never routine — a user missing from config.js USERS
// is bounced at every login, and until 7/10 nothing ever said so.
function _authRejectReason(u) {
  if (!u) return 'no login';
  if (_authSessionExpired(u)) return 'expired';
  if (_authRoleTampered(u)) return USERS.some(x => x.username === u.username) ? 'role mismatch' : 'unknown username';
  return null;
}

const _authReject = _authRejectReason(user);
if (_authReject) {
  // The page keeps running until the browser has left: the preload timers
  // below and the first render still fire, with no token, and each 401 was
  // logged (5/10 storm, 2010 rows). api.js reads this flag, refuses every
  // request before it is sent and counts the page in the tab's streak
  // (core/api.js _tmsStreakNote). Set BEFORE the login is removed: afterwards
  // nothing in this page knows whose login it was.
  window._tmsNoSessionAtLoad = { reason: _authReject, user: (user && user.username) || null, exp: (user && user.expiresAt) || null };
  localStorage.removeItem('tms_user');
  localStorage.removeItem('tms_jwt');
  window.location.href = 'index.html';
}

const ROLE = user?.role || 'dispatcher';

function can(section) {
  return PERMS[ROLE]?.[section] || 'none';
}

// Warm cache for stable tables immediately on app load
// atPreload is defined in api.js and runs in background
setTimeout(() => { if (typeof atPreload === 'function') atPreload(); }, 100);
// Preload normalized reference data (single fetch per table, shared across modules)
// A failed preload used to surface only as an «unhandledrejection» with no
// context (audit 28/9); the pages that need the data say so themselves
// (orders: banner) — this line makes the cause reach app_errors with a name.
setTimeout(() => {
  if (typeof preloadReferenceData !== 'function') return;
  preloadReferenceData().catch(e => { if (typeof logError === 'function') logError(e, 'auth: preloadReferenceData'); });
}, 200);
// Shared scan examples are synced when the scan dialog opens (openIntlScan →
// scanSyncTrainingFromServer), not here: at login every role would read
// scan_examples, and warehouse has no right to it (403 toast), 27/9/2026.
