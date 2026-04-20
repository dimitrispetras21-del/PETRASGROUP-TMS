// ═══════════════════════════════════════════════════════════
// CORE — COMMAND PALETTE (⌘K / Ctrl+K)
// Quick search + navigation + actions. Inspired by Linear/Raycast.
// ═══════════════════════════════════════════════════════════

(function() {
  'use strict';

  const CMD = {
    open: false,
    query: '',
    selectedIdx: 0,
    items: [],
  };

  function _buildItems() {
    const items = [];
    // Pages (from NAV)
    if (typeof NAV !== 'undefined') {
      NAV.forEach(group => {
        if (typeof can === 'function' && can(group.perm) === 'none') return;
        group.items.forEach(item => {
          items.push({
            type: 'page',
            section: group.section,
            title: item.label,
            keywords: `${item.label} ${group.section}`.toLowerCase(),
            action: () => { if (typeof navigate === 'function') navigate(item.id); },
            icon: 'file_text',
          });
        });
      });
    }
    // Quick actions
    items.push(
      { type: 'action', title: 'Refresh current page', keywords: 'refresh reload',
        action: () => { if (typeof currentPage !== 'undefined' && typeof navigate === 'function') navigate(currentPage); },
        icon: 'refresh' },
      { type: 'action', title: 'Sign out', keywords: 'logout sign out exit',
        action: () => { if (typeof logout === 'function') logout(); },
        icon: 'user_check' },
      { type: 'action', title: 'Undo last action', keywords: 'undo revert',
        action: () => { if (typeof undoLastAction === 'function') undoLastAction(); },
        icon: 'refresh' },
    );
    return items;
  }

  function _filter(q) {
    if (!q) return CMD.items.slice(0, 20);
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return CMD.items
      .map(it => {
        let score = 0;
        for (const w of words) {
          if (it.title.toLowerCase().includes(w)) score += 3;
          if (it.keywords.includes(w)) score += 1;
          if (it.title.toLowerCase().startsWith(w)) score += 2;
        }
        return { it, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(x => x.it);
  }

  function _render() {
    let overlay = document.getElementById('cmdk-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'cmdk-overlay';
      overlay.className = 'cmdk-overlay';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    }
    if (!CMD.open) { overlay.style.display = 'none'; return; }
    overlay.style.display = 'flex';
    const filtered = _filter(CMD.query);
    const ico = (n) => (typeof icon === 'function') ? icon(n, 16) : '';
    overlay.innerHTML = `
      <div class="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="cmdk-search">
          ${ico('search')}
          <input id="cmdk-input" class="cmdk-input" type="text" placeholder="Search pages or actions…" value="${CMD.query.replace(/"/g,'&quot;')}" autocomplete="off" autofocus>
          <span class="cmdk-esc">ESC</span>
        </div>
        <div class="cmdk-list" id="cmdk-list">
          ${filtered.length === 0 ? `<div class="cmdk-empty">No matches</div>` :
            filtered.map((it, i) => `
              <div class="cmdk-item ${i === CMD.selectedIdx ? 'selected' : ''}" data-idx="${i}" role="option">
                <span class="cmdk-ico">${ico(it.icon || 'file_text')}</span>
                <span class="cmdk-title">${it.title}</span>
                ${it.section ? `<span class="cmdk-section">${it.section}</span>` : `<span class="cmdk-section">${it.type === 'action' ? 'Action' : ''}</span>`}
              </div>
            `).join('')
          }
        </div>
        <div class="cmdk-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>ESC</kbd> close</span>
        </div>
      </div>`;
    const input = document.getElementById('cmdk-input');
    if (input) {
      input.focus();
      input.oninput = e => { CMD.query = e.target.value; CMD.selectedIdx = 0; _render(); };
    }
    overlay.querySelectorAll('.cmdk-item').forEach(el => {
      el.onclick = () => { const idx = parseInt(el.dataset.idx); CMD.selectedIdx = idx; _execute(); };
      el.onmouseover = () => { CMD.selectedIdx = parseInt(el.dataset.idx); document.querySelectorAll('.cmdk-item').forEach(x => x.classList.toggle('selected', parseInt(x.dataset.idx) === CMD.selectedIdx)); };
    });
  }

  function _execute() {
    const filtered = _filter(CMD.query);
    const item = filtered[CMD.selectedIdx];
    if (!item) return;
    close();
    setTimeout(() => item.action(), 50);
  }

  function open() {
    CMD.items = _buildItems();
    CMD.query = '';
    CMD.selectedIdx = 0;
    CMD.open = true;
    _render();
  }
  function close() {
    CMD.open = false;
    _render();
  }

  // Keyboard listener
  document.addEventListener('keydown', e => {
    const modifier = e.metaKey || e.ctrlKey;
    if (modifier && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (CMD.open) close(); else open();
      return;
    }
    if (!CMD.open) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const max = _filter(CMD.query).length - 1;
      CMD.selectedIdx = Math.min(CMD.selectedIdx + 1, max);
      _render();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      CMD.selectedIdx = Math.max(CMD.selectedIdx - 1, 0);
      _render();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      _execute();
    }
  });

  if (typeof window !== 'undefined') {
    window.openCommandPalette = open;
    window.closeCommandPalette = close;
  }
})();
