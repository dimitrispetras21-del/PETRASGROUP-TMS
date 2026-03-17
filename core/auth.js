// ═══════════════════════════════════════════════
// CORE — AUTH
// ═══════════════════════════════════════════════

const user = JSON.parse(sessionStorage.getItem('tms_user') || 'null');
if (!user) window.location.href = 'index.html';

const ROLE = user?.role || 'dispatcher';

function can(section) {
  return PERMS[ROLE]?.[section] || 'none';
}
