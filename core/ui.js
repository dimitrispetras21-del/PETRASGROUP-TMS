// ═══════════════════════════════════════════════
// CORE — UI (Modal, shared components)
// ═══════════════════════════════════════════════

// ── Modal ────────────────────────────────────────
function openModal(title, bodyHTML, footerHTML = '') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalFooter').innerHTML = footerHTML;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function initModal() {
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
}

// ── Loading / Error states ────────────────────────
function showLoading(msg = 'Loading...') {
  return `<div class="loading"><div class="spinner"></div> ${msg}</div>`;
}

function showError(msg) {
  return `<div class="empty-state"><div class="icon">⚠️</div><h3>Error</h3><p>${msg}</p></div>`;
}

function showEmpty(msg = 'No records found') {
  return `<div class="empty-state"><div class="icon">📭</div><h3>${msg}</h3></div>`;
}

function showAccessDenied() {
  return `<div class="access-denied">
    <div class="icon">🔒</div>
    <h2>Access Restricted</h2>
    <p>You don't have permission to view this section.</p>
  </div>`;
}

function showComingSoon(label) {
  return `<div class="coming-soon">
    <div class="cs-icon">🛠️</div>
    <h3>${label}</h3>
    <p>This module is under development</p>
  </div>`;
}

// ── Toast notifications ───────────────────────────
function toast(msg, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;
      font-size:13px;font-weight:500;z-index:9999;transition:opacity 0.3s;box-shadow:0 4px 16px rgba(0,0,0,0.15)`;
    document.body.appendChild(el);
  }
  const colors = { success: '#059669', danger: '#DC2626', info: '#3B82F6', warn: '#D97706' };
  el.style.background = colors[type] || colors.success;
  el.style.color = '#fff';
  el.style.opacity = '1';
  el.textContent = msg;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.style.opacity = '0', 3000);
}
