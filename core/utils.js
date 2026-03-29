// ===============================================
// CORE -- UTILS
// ===============================================

// -- Error Toast Notifications -----------------
// Non-blocking bottom-right toast for API / runtime errors.
// Max 3 visible at once; auto-dismiss after 5 s.

const _TOAST_MAX = 3;
const _toastQueue = [];

/**
 * Show a non-blocking toast notification (bottom-right corner)
 * @param {string} message - Text to display
 * @param {'error'|'warn'|'info'} [type='error'] - Toast type (controls colour)
 * @param {number} [durationMs=5000] - Auto-dismiss delay in ms
 */
function showErrorToast(message, type = 'error', durationMs = 5000) {
  // Ensure container exists
  let container = document.getElementById('tms-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'tms-toast-container';
    container.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none;max-width:380px;';
    document.body.appendChild(container);
  }

  // Enforce max visible
  while (container.children.length >= _TOAST_MAX) {
    container.removeChild(container.firstChild);
  }

  const toast = document.createElement('div');
  const bg = type === 'warn' ? '#92400E' : type === 'info' ? '#1E3A5F' : '#7F1D1D';
  toast.style.cssText =
    `background:${bg};color:#fff;padding:12px 18px;border-radius:8px;font:13px/1.4 "DM Sans",sans-serif;`
    + 'box-shadow:0 4px 12px rgba(0,0,0,.35);pointer-events:auto;opacity:0;transform:translateY(8px);'
    + 'transition:opacity .25s,transform .25s;';
  toast.textContent = message;
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Auto-dismiss
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, durationMs);
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string|null|undefined} str - Raw string
 * @returns {string} Escaped string safe for innerHTML
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert Airtable UTC datetime to local YYYY-MM-DD string
 * @param {string|null} raw - ISO datetime string from Airtable
 * @returns {string} Local date as YYYY-MM-DD, or empty string if invalid
 */
function toLocalDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

/**
 * Today's date as YYYY-MM-DD in the browser's local timezone
 * @returns {string} e.g. '2026-03-28'
 */
function localToday() {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

/**
 * Tomorrow's date as YYYY-MM-DD in the browser's local timezone
 * @returns {string} e.g. '2026-03-29'
 */
function localTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatCurrency(v, currency = '€') {
  if (v == null || v === '') return '—';
  return currency + ' ' + Number(v).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function expiryClass(dateStr) {
  if (!dateStr) return '';
  const days = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  if (days < 0)  return 'expiry-alert';
  if (days < 30) return 'expiry-warn';
  return 'expiry-ok';
}

function expiryLabel(dateStr) {
  if (!dateStr) return '—';
  const days = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  const base = formatDate(dateStr);
  if (days < 0)  return `<span class="expiry-alert">${base} (expired)</span>`;
  if (days < 30) return `<span class="expiry-warn">${base} (${days}d)</span>`;
  return `<span class="expiry-ok">${base}</span>`;
}

/**
 * ISO-ish week number for the current date (1-based)
 * @returns {number} Week number (1-53)
 */
function currentWeekNumber() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil((((now - start) / 86400000) + 1) / 7);
}

function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Extract first ID from linked-record field (handles all Airtable formats)
function getLinkId(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    const first = v[0];
    if (!first) return null;
    return typeof first === 'string' ? first : first.id || null;
  }
  return v.id || null;
}

// Format date as DD/MM/YYYY consistently
function fmtDate(d) {
  if (!d) return '—';
  const p = d.substring(0, 10).split('-');
  return `${p[2]}/${p[1]}/${p[0]}`;
}

// Format date as DD/MM (short)
function fmtDateDM(d) {
  if (!d) return '—';
  const p = d.substring(0, 10).split('-');
  return `${p[2]}/${p[1]}`;
}

// ═══ ERROR LOGGER ═══
const _errorLog = [];
const MAX_ERROR_LOG = 50;

/**
 * Log an error to the persistent error log (localStorage)
 * @param {Error|string} error - The error object or message
 * @param {string} [context=''] - Where the error occurred
 */
function logError(error, context = '') {
  const entry = {
    ts: new Date().toISOString(),
    msg: error?.message || String(error),
    stack: error?.stack?.split('\n').slice(0, 3).join('\n') || '',
    ctx: context,
    user: (function() { try { return JSON.parse(localStorage.getItem('tms_user') || '{}').name || 'unknown'; } catch { return 'unknown'; } })(),
    page: window.location.hash || (localStorage.getItem('tms_page') || 'dashboard'),
  };
  _errorLog.push(entry);
  if (_errorLog.length > MAX_ERROR_LOG) _errorLog.shift();
  try { localStorage.setItem('tms_errors', JSON.stringify(_errorLog)); } catch(e) { console.warn('[TMS] Failed to persist error log:', e); }
  console.error(`[TMS ERROR] ${context}:`, error);
}

/**
 * Get the persisted error log
 * @returns {Array} Array of error log entries
 */
function getErrorLog() {
  try { return JSON.parse(localStorage.getItem('tms_errors') || '[]'); } catch { return []; }
}

/**
 * Render the error log viewer page (owner role only)
 */
function renderErrorLog() {
  const c = document.getElementById('content');
  const u = JSON.parse(localStorage.getItem('tms_user') || '{}');
  if (u.role !== 'owner') { c.innerHTML = showAccessDenied(); return; }

  const errors = getErrorLog().reverse(); // newest first
  const rows = errors.map(e => `<tr>
    <td style="white-space:nowrap;font-size:11px">${escapeHtml(e.ts ? new Date(e.ts).toLocaleString('el-GR') : '—')}</td>
    <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(e.msg)}">${escapeHtml(e.msg)}</td>
    <td>${escapeHtml(e.ctx || '—')}</td>
    <td>${escapeHtml(e.user || '—')}</td>
    <td>${escapeHtml(e.page || '—')}</td>
    <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;font-size:10px;color:var(--text-dim)" title="${escapeHtml(e.stack||'')}">${escapeHtml((e.stack||'').split('\n')[0] || '—')}</td>
  </tr>`).join('');

  c.innerHTML = `
    <div class="page-header" style="margin-bottom:14px">
      <div>
        <div class="page-title">Error Log</div>
        <div class="page-sub">${errors.length} errors (last 50)</div>
      </div>
      <div>
        <button class="btn btn-scan" onclick="localStorage.removeItem('tms_errors');renderErrorLog()">Clear Log</button>
      </div>
    </div>
    <div class="entity-table-wrap" style="max-height:calc(100vh - 200px)">
      <table>
        <thead><tr>
          <th>Timestamp</th><th>Message</th><th>Context</th><th>User</th><th>Page</th><th>Stack</th>
        </tr></thead>
        <tbody>${rows.length ? rows : '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No errors logged</td></tr>'}</tbody>
      </table>
    </div>`;
}

// Load persisted errors into memory on init
try {
  const stored = JSON.parse(localStorage.getItem('tms_errors') || '[]');
  _errorLog.push(...stored);
} catch(e) { console.warn('[TMS] Failed to load stored error log:', e); }

// ═══ NOTIFICATION CENTER ═══
let _notifOpen = false;
let _notifItems = [];

function _toggleNotifPanel() {
  _notifOpen = !_notifOpen;
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  if (_notifOpen) {
    _refreshNotifs().then(() => { panel.style.display = 'block'; });
    setTimeout(() => document.addEventListener('click', _closeNotifOutside, { once: true }), 50);
  } else {
    panel.style.display = 'none';
  }
}

function _closeNotifOutside(e) {
  const wrap = document.getElementById('notifWrap');
  if (wrap && !wrap.contains(e.target)) {
    _notifOpen = false;
    document.getElementById('notifPanel').style.display = 'none';
  } else if (_notifOpen) {
    setTimeout(() => document.addEventListener('click', _closeNotifOutside, { once: true }), 50);
  }
}

async function _refreshNotifs() {
  const items = [];
  const today = localToday();
  const in48h = toLocalDate(new Date(Date.now() + 48 * 3600000));
  try {
    const [orders, trucks, trailers] = await Promise.all([
      atGet(TABLES.ORDERS),
      atGetAll(TABLES.TRUCKS, { fields: ['License Plate','Active','KTEO Expiry','KEK Expiry','Insurance Expiry'] }, true),
      atGetAll(TABLES.TRAILERS, { fields: ['License Plate','ATP Expiry','Insurance Expiry'] }, true),
    ]);

    // Unassigned orders due in 48h
    orders.filter(r => {
      const f = r.fields;
      const noTruck = !f['Truck'] || (Array.isArray(f['Truck']) && !f['Truck'].length);
      const del = toLocalDate(f['Delivery DateTime']);
      return noTruck && del && del <= in48h && del >= today && f['Status'] !== 'Delivered' && f['Status'] !== 'Cancelled';
    }).forEach(r => {
      const f = r.fields;
      const route = `${(f['Loading Summary']||'').slice(0,20)} → ${(f['Delivery Summary']||'').slice(0,20)}`;
      items.push({ type: 'danger', title: `${escapeHtml(f['Direction'])} χωρίς ανάθεση`, sub: escapeHtml(route), page: 'orders_intl' });
    });

    // Expired fleet docs (role-aware: only for owner/maintenance)
    if (user.role === 'owner' || user.role === 'maintenance') {
      const now = new Date();
      const checkDocs = (list, plateField, docFields) => {
        list.filter(t => t.fields['Active'] !== false).forEach(t => {
          docFields.forEach(field => {
            const dt = (t.fields[field] || '').substring(0, 10);
            if (dt) {
              const days = Math.ceil((new Date(dt) - now) / 864e5);
              if (days < 0) {
                items.push({ type: 'danger', title: `${escapeHtml(t.fields[plateField])} — ${escapeHtml(field.replace(' Expiry',''))} ΛΗΓΜΕΝΟ`, sub: `Εληξε ${Math.abs(days)} μερες πριν`, page: 'expiry_alerts' });
              } else if (days <= 14) {
                items.push({ type: 'warn', title: `${escapeHtml(t.fields[plateField])} — ${escapeHtml(field.replace(' Expiry',''))} ληγει σε ${days}μ`, sub: escapeHtml(dt), page: 'expiry_alerts' });
              }
            }
          });
        });
      };
      checkDocs(trucks, 'License Plate', ['KTEO Expiry','KEK Expiry','Insurance Expiry']);
      checkDocs(trailers, 'Plate', ['ATP Expiry','Insurance Expiry']);
    }

    // Reminders from Nakis
    const reminders = JSON.parse(localStorage.getItem('tms_reminders') || '[]');
    const nowMs = Date.now();
    reminders.filter(r => new Date(r.time).getTime() <= nowMs && !r.dismissed).forEach(r => {
      items.push({ type: 'info', title: 'Υπενθύμιση', sub: escapeHtml(r.text), page: null });
    });

  } catch(e) { console.warn('Notif refresh error:', e); }

  _notifItems = items;

  // Update dot
  const dot = document.getElementById('notifDot');
  if (dot) dot.style.display = items.length ? 'block' : 'none';

  // Render panel
  const panel = document.getElementById('notifPanel');
  if (panel) {
    panel.innerHTML = `
      <div class="notif-header">
        <span>Ειδοποιησεις</span>
        <span style="font-size:10px;font-weight:400;color:var(--text-dim)">${items.length} ενεργές</span>
      </div>
      <div class="notif-list">
        ${items.length ? items.slice(0, 12).map(n => `
          <div class="notif-item" ${n.page ? `onclick="_notifOpen=false;document.getElementById('notifPanel').style.display='none';navigate('${n.page}')"` : ''}>
            <div class="notif-icon ${n.type}">${n.type==='danger'?'!':n.type==='warn'?'!':'i'}</div>
            <div class="notif-body">
              <div class="notif-title">${n.title}</div>
              <div class="notif-sub">${n.sub}</div>
            </div>
          </div>`).join('') : '<div class="notif-empty">Δεν υπαρχουν ειδοποιησεις</div>'}
      </div>`;
  }
}

// Auto-refresh notifications every 5 min
setInterval(() => { _refreshNotifs(); }, 300000);
// Initial load after 3 seconds
setTimeout(() => { _refreshNotifs(); }, 3000);
