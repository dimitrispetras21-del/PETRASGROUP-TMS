// ═══════════════════════════════════════════════
// CORE — AUTH
// ═══════════════════════════════════════════════

const user = JSON.parse(sessionStorage.getItem('tms_user') || 'null');
if (!user) window.location.href = 'index.html';

const ROLE = user?.role || 'dispatcher';

function can(section) {
  return PERMS[ROLE]?.[section] || 'none';
}

// Warm cache for stable tables immediately on app load
// atPreload is defined in api.js and runs in background
setTimeout(() => { if (typeof atPreload === 'function') atPreload(); }, 100);
