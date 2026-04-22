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

if (!user || _authSessionExpired(user) || _authRoleTampered(user)) {
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
setTimeout(() => { if (typeof preloadReferenceData === 'function') preloadReferenceData(); }, 200);
