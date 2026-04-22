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

if (!user || _authSessionExpired(user)) {
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
