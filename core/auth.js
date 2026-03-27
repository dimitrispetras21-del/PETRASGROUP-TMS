// ═══════════════════════════════════════════════
// CORE — AUTH
// ═══════════════════════════════════════════════

const user = JSON.parse(localStorage.getItem('tms_user') || 'null');
// Check session exists AND not expired
if (!user || (user.expiresAt && Date.now() > user.expiresAt)) {
  localStorage.removeItem('tms_user');
  window.location.href = 'index.html';
}

const ROLE = user?.role || 'dispatcher';

function can(section) {
  return PERMS[ROLE]?.[section] || 'none';
}

// Warm cache for stable tables immediately on app load
// atPreload is defined in api.js and runs in background
setTimeout(() => { if (typeof atPreload === 'function') atPreload(); }, 100);
