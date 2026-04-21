// ═══════════════════════════════════════════════
// CORE — UI (Modal, shared components)
// ═══════════════════════════════════════════════

// ── Modal ────────────────────────────────────────
let _modalPrevFocus = null;

function openModal(title, bodyHTML, footerHTML = '') {
  _modalPrevFocus = document.activeElement;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalFooter').innerHTML = footerHTML;
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('open');
  // Focus first focusable element inside modal
  requestAnimationFrame(() => {
    const modal = document.getElementById('modal');
    const focusable = modal.querySelectorAll('input,select,textarea,button,[tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();
    else modal.querySelector('.modal-close')?.focus();
  });
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  if (_modalPrevFocus) { try { _modalPrevFocus.focus(); } catch(_) {} _modalPrevFocus = null; }
}

function initModal() {
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  // Trap focus inside modal + Escape to close
  document.addEventListener('keydown', e => {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay || !overlay.classList.contains('open')) return;
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key !== 'Tab') return;
    const modal = document.getElementById('modal');
    const focusable = [...modal.querySelectorAll('input,select,textarea,button,a,[tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

// ── Empty State helper (custom illustrations) ────
/**
 * Build a polished empty state block.
 * @param {Object} cfg
 * @param {string} cfg.illustration - key for SVG illustration
 * @param {string} cfg.title - main message
 * @param {string} [cfg.description] - secondary hint
 * @param {{label, onClick}} [cfg.action] - optional CTA
 */
function showEmpty(cfg) {
  const { illustration = 'inbox', title = 'No records', description = '', action } = cfg || {};
  const svg = _EMPTY_SVG[illustration] || _EMPTY_SVG.inbox;
  return `<div class="empty-state">
    <div class="empty-state-illustration">${svg}</div>
    <h3>${title}</h3>
    ${description ? `<p>${description}</p>` : ''}
    ${action ? `<button class="btn btn-primary" onclick="${action.onClick}">${action.label}</button>` : ''}
  </div>`;
}

// Minimal custom SVG illustrations (monochrome, brand-aligned)
const _EMPTY_SVG = {
  inbox: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect x="20" y="40" width="80" height="60" rx="8" fill="none" stroke="currentColor" stroke-width="2" opacity="0.3"/>
    <path d="M20 70 L45 70 L52 78 L68 78 L75 70 L100 70" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M35 40 L35 25 L85 25 L85 40" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5"/>
    <circle cx="60" cy="55" r="3" fill="currentColor" opacity="0.3"/>
  </svg>`,
  search: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="24" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <line x1="68" y1="68" x2="90" y2="90" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="8" fill="currentColor" opacity="0.15"/>
  </svg>`,
  order: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect x="30" y="20" width="60" height="80" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
    <line x1="42" y1="40" x2="78" y2="40" stroke="currentColor" stroke-width="2" opacity="0.5"/>
    <line x1="42" y1="54" x2="78" y2="54" stroke="currentColor" stroke-width="2" opacity="0.5"/>
    <line x1="42" y1="68" x2="65" y2="68" stroke="currentColor" stroke-width="2" opacity="0.5"/>
    <circle cx="78" cy="82" r="6" fill="currentColor" opacity="0.3"/>
    <path d="M75 82 L77 84 L81 80" stroke="white" stroke-width="1.5" fill="none"/>
  </svg>`,
  truck: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect x="15" y="50" width="55" height="32" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M70 60 L85 60 L95 68 L95 82 L70 82 Z" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="30" cy="86" r="6" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="82" cy="86" r="6" fill="none" stroke="currentColor" stroke-width="2"/>
    <line x1="20" y1="60" x2="60" y2="60" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
    <line x1="20" y1="70" x2="55" y2="70" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  </svg>`,
  plan: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect x="20" y="25" width="80" height="75" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
    <line x1="20" y1="42" x2="100" y2="42" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="35" cy="55" r="3" fill="currentColor" opacity="0.5"/>
    <line x1="42" y1="55" x2="85" y2="55" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
    <circle cx="35" cy="68" r="3" fill="currentColor" opacity="0.5"/>
    <line x1="42" y1="68" x2="75" y2="68" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
    <circle cx="35" cy="81" r="3" fill="currentColor" opacity="0.3"/>
    <line x1="42" y1="81" x2="70" y2="81" stroke="currentColor" stroke-width="1.5" opacity="0.2"/>
    <rect x="32" y="18" width="8" height="12" rx="1" fill="currentColor" opacity="0.6"/>
    <rect x="80" y="18" width="8" height="12" rx="1" fill="currentColor" opacity="0.6"/>
  </svg>`,
  ramp: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 95 L110 95" stroke="currentColor" stroke-width="2"/>
    <path d="M30 95 L30 60 L90 60 L90 95" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M30 60 L50 45 L90 45 L90 60" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5"/>
    <rect x="45" y="70" width="15" height="18" rx="1" fill="currentColor" opacity="0.3"/>
    <rect x="65" y="70" width="15" height="18" rx="1" fill="currentColor" opacity="0.3"/>
  </svg>`,
};

// ── Loading Skeletons ────────────────────────────
function showLoading(msg = 'Loading...') {
  return `<div style="padding:24px">
    <div style="display:flex;gap:14px;margin-bottom:24px">
      ${[1,2,3,4].map(() => `<div style="flex:1;height:70px;background:#0F172A;border:1px solid #1E293B;border-radius:10px;overflow:hidden;position:relative">
        <div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.03),transparent);animation:sk-shimmer 1.5s infinite"></div>
      </div>`).join('')}
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="height:36px;background:#F0F5FA;border-bottom:1px solid var(--border)"></div>
      ${[1,2,3,4,5,6].map(() => `<div style="height:40px;border-bottom:1px solid var(--border);position:relative;overflow:hidden">
        <div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(0,0,0,0.02),transparent);animation:sk-shimmer 1.5s infinite"></div>
      </div>`).join('')}
    </div>
    <div style="text-align:center;padding:16px 0;color:var(--text-dim);font-size:12px">${msg}</div>
  </div>
  <style>@keyframes sk-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}</style>`;
}

function showError(msg) {
  return `<div class="empty-state"><div style="font-size:32px;margin-bottom:12px">&#9888;</div><h3 style="color:var(--danger)">Error</h3><p style="color:var(--text-dim);font-size:13px">${msg}</p></div>`;
}

// A4: Empty states with subtle illustrations
function showEmpty(msg = 'No records found', sub = '') {
  return `<div class="empty-state" style="padding:60px 20px;text-align:center">
    <div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:#0F172A;display:flex;align-items:center;justify-content:center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5"><path d="M9 5H2v14h20V5h-7"/><path d="M9 5l3-3 3 3"/><path d="M12 2v10"/></svg>
    </div>
    <h3 style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px">${msg}</h3>
    ${sub ? `<p style="color:var(--text-dim);font-size:12px">${sub}</p>` : ''}
  </div>`;
}

function showAccessDenied() {
  return `<div class="empty-state" style="padding:60px 20px;text-align:center">
    <div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:#0F172A;display:flex;align-items:center;justify-content:center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/><circle cx="12" cy="16" r="1"/></svg>
    </div>
    <h3 style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--text)">Access Restricted</h3>
    <p style="color:var(--text-dim);font-size:12px">You don't have permission to view this section.</p>
  </div>`;
}

function showComingSoon(label) {
  return `<div class="empty-state" style="padding:60px 20px;text-align:center">
    <div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:#0F172A;display:flex;align-items:center;justify-content:center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0284C7" stroke-width="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
    </div>
    <h3 style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--text)">${label}</h3>
    <p style="color:var(--text-dim);font-size:12px">This module is under development</p>
  </div>`;
}

// ── Toast with success animation (A5) ───────────
function toast(msg, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;
      font-size:13px;font-weight:500;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.15);
      transform:translateY(20px);opacity:0;transition:transform 0.25s ease,opacity 0.25s ease;
      display:flex;align-items:center;gap:8px`;
    document.body.appendChild(el);
  }
  const colors = { success: '#059669', danger: '#DC2626', info: '#3B82F6', warn: '#D97706' };
  const icons = {
    success: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2"><path d="M4 10l4 4 8-8"/></svg>',
    danger: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2"><path d="M6 6l8 8M14 6l-8 8"/></svg>',
    warn: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2"><path d="M10 4v7M10 14v1"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2"><circle cx="10" cy="10" r="7"/><path d="M10 7v4M10 14v0"/></svg>',
  };
  el.style.background = colors[type] || colors.success;
  el.style.color = '#fff';
  el.innerHTML = (icons[type] || icons.success) + `<span>${msg}</span>`;
  // Animate in
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(0)';
    el.style.opacity = '1';
  });
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.transform = 'translateY(20px)';
    el.style.opacity = '0';
  }, 3000);
}

// ── Keyboard shortcuts (A2) ─────────────────────
document.addEventListener('keydown', e => {
  // Esc closes modals/panels
  if (e.key === 'Escape') {
    const overlay = document.querySelector('.mf-overlay');
    if (overlay) { overlay.remove(); return; }
    if (document.getElementById('modalOverlay')?.classList.contains('open')) { closeModal(); return; }
    // Close entity detail panel
    const detail = document.querySelector('.entity-detail-panel:not(.hidden)');
    if (detail) { detail.classList.add('hidden'); return; }
  }
  // Arrow left/right for week navigation (only on weekly pages)
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest('input,select,textarea')) {
    if (currentPage === 'weekly_intl' && typeof WINTL !== 'undefined') {
      WINTL.week += e.key === 'ArrowLeft' ? -1 : 1;
      renderWeeklyIntl();
      e.preventDefault();
    }
    if (currentPage === 'weekly_natl' && typeof WNATL !== 'undefined') {
      WNATL.week += e.key === 'ArrowLeft' ? -1 : 1;
      renderWeeklyNatl();
      e.preventDefault();
    }
  }
});

// Expose empty state helper
if (typeof window !== 'undefined') {
  window.showEmpty = showEmpty;
}
