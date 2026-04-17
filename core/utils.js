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
    stack: error?.stack?.split('\n').slice(0, 8).join('\n') || '',
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
  const username = (user.username || '').toLowerCase();
  const role = user.role;
  const isOwner = role === 'owner' || username === 'dimitris';

  // Per-user feature flags (owner sees everything)
  const isPlanner   = username === 'kelesmitos' || isOwner;
  const isControl   = username === 'pantelis'   || isOwner;
  const isChiefOps  = username === 'sotiris'    || isOwner;
  const isEquip     = username === 'thodoris'   || isOwner || role === 'maintenance' || role === 'management';
  const isInvoicing = username === 'eirini'     || isOwner || role === 'accountant';

  try {
    // Fetch base data + extras only for users that need them
    const promises = [
      atGet(TABLES.ORDERS),
      atGetAll(TABLES.TRUCKS, { fields: ['License Plate','Active','KTEO Expiry','KEK Expiry','Insurance Expiry'] }, true),
      atGetAll(TABLES.TRAILERS, { fields: ['License Plate','ATP Expiry','Insurance Expiry'] }, true),
      (isChiefOps) ? atGetAll(TABLES.NAT_LOADS, { fields: ['Direction','Status','Delivery DateTime','Delivery Performance'] }, true).catch(()=>[]) : Promise.resolve([]),
      (isChiefOps || isEquip) ? atGetAll(TABLES.MAINT_REQ, { fields: ['Status','Priority','Date Reported'] }, true).catch(()=>[]) : Promise.resolve([]),
    ];
    const [orders, trucks, trailers, natLoads, maint] = await Promise.all(promises);

    // ── 1. UNIVERSAL: Unassigned orders due in 48h ──
    orders.filter(r => {
      const f = r.fields;
      const noTruck = !f['Truck'] || (Array.isArray(f['Truck']) && !f['Truck'].length);
      const del = toLocalDate(f['Delivery DateTime']);
      return noTruck && del && del <= in48h && del >= today && f['Status'] !== 'Delivered' && f['Status'] !== 'Cancelled';
    }).forEach(r => {
      const f = r.fields;
      const route = `${(f['Loading Summary']||'').slice(0,20)} → ${(f['Delivery Summary']||'').slice(0,20)}`;
      items.push({ type: 'danger', title: `${escapeHtml(f['Direction']||'Order')} χωρίς ανάθεση`, sub: escapeHtml(route), page: 'orders_intl' });
    });

    // ── 2. KELESMITOS — Master Planner ──
    if (isPlanner) {
      const wn = typeof currentWeekNumber === 'function' ? currentWeekNumber() : 0;
      // Exports this week assigned but no matched return load
      orders.filter(r => {
        const f = r.fields;
        return f['Direction'] === 'Export' && f['Week Number'] == wn && f['Truck'] &&
               !f['Matched Import ID'] && f['Status'] !== 'Delivered' && f['Status'] !== 'Cancelled';
      }).slice(0, 5).forEach(r => {
        const f = r.fields;
        items.push({ type: 'warn', title: 'Export χωρίς return load',
          sub: escapeHtml(`${(f['Delivery Summary']||'').slice(0,30)} — βρες import`), page: 'weekly_intl' });
      });
    }

    // ── 3. PANTELIS — Control Tower ──
    if (isControl) {
      // Loadings today, assigned, but Driver Notified is false
      orders.filter(r => {
        const f = r.fields;
        const ld = toLocalDate(f['Loading DateTime']);
        return ld === today && f['Truck'] && !f['Driver Notified'] &&
               f['Status'] !== 'Cancelled' && f['Status'] !== 'Delivered';
      }).slice(0, 5).forEach(r => {
        const f = r.fields;
        items.push({ type: 'warn', title: 'Οδηγός μη ενημερωμένος',
          sub: escapeHtml(`Φόρτωση σήμερα: ${(f['Loading Summary']||'').slice(0,25)}`), page: 'daily_ops' });
      });

      // Deliveries today, assigned, but Client Notified is false
      orders.filter(r => {
        const f = r.fields;
        const dd = toLocalDate(f['Delivery DateTime']);
        return dd === today && f['Truck'] && !f['Client Notified'] &&
               f['Status'] !== 'Delivered' && f['Status'] !== 'Cancelled';
      }).slice(0, 5).forEach(r => {
        const f = r.fields;
        items.push({ type: 'warn', title: 'Πελάτης μη ενημερωμένος',
          sub: escapeHtml(`Παράδοση σήμερα: ${(f['Delivery Summary']||'').slice(0,25)}`), page: 'daily_ops' });
      });

      // Delivered last 3 days without CMR Photo
      orders.filter(r => {
        const f = r.fields;
        if (f['Status'] !== 'Delivered') return false;
        if (f['CMR Photo Received']) return false;
        const dd = toLocalDate(f['Delivery DateTime']);
        if (!dd) return false;
        const dayDiff = Math.floor((new Date(today) - new Date(dd)) / 864e5);
        return dayDiff >= 0 && dayDiff <= 3;
      }).slice(0, 5).forEach(r => {
        const f = r.fields;
        items.push({ type: 'info', title: 'CMR εκκρεμεί',
          sub: escapeHtml(`${f['Order Number']||''} ${(f['Delivery Summary']||'').slice(0,20)}`), page: 'daily_ops' });
      });
    }

    // ── 4. SOTIRIS — Chief Ops ──
    if (isChiefOps) {
      // National loads delivered today/recently without Performance set
      natLoads.filter(r => {
        const f = r.fields;
        if (f['Status'] !== 'Delivered') return false;
        if (f['Delivery Performance']) return false;
        const dd = toLocalDate(f['Delivery DateTime']);
        if (!dd) return false;
        const dayDiff = Math.floor((new Date(today) - new Date(dd)) / 864e5);
        return dayDiff >= 0 && dayDiff <= 3;
      }).slice(0, 5).forEach(r => {
        const f = r.fields;
        items.push({ type: 'info', title: 'National χωρίς Performance',
          sub: escapeHtml(`${f['Direction']||''} — ορίσε On-Time/Delayed`), page: 'weekly_natl' });
      });

      // Critical maintenance issues open
      maint.filter(r => {
        const f = r.fields;
        const st = (f['Status']||'').toLowerCase();
        if (st === 'done' || st === 'closed' || st === 'resolved' || st === 'completed') return false;
        const prio = (f['Priority']||'').toLowerCase();
        return prio === 'high' || prio === 'critical' || prio === 'urgent';
      }).slice(0, 5).forEach(r => {
        const f = r.fields;
        items.push({ type: 'danger', title: `Κρίσιμη βλάβη — ${escapeHtml(f['Priority']||'')}`,
          sub: escapeHtml(`Status: ${f['Status']||'Open'}`), page: 'maint_req' });
      });
    }

    // ── 5. THODORIS / OWNER / MAINTENANCE — Equipment Manager ──
    if (isEquip) {
      const now = new Date();
      const checkDocs = (list, plateField, docFields) => {
        list.filter(t => t.fields['Active'] !== false).forEach(t => {
          docFields.forEach(field => {
            const dt = (t.fields[field] || '').substring(0, 10);
            if (dt) {
              const days = Math.ceil((new Date(dt) - now) / 864e5);
              if (days < 0) {
                items.push({ type: 'danger', title: `${escapeHtml(t.fields[plateField])} — ${escapeHtml(field.replace(' Expiry',''))} ΛΗΓΜΕΝΟ`, sub: `Εληξε ${Math.abs(days)} μερες πριν`, page: 'maint_expiry' });
              } else if (days <= 14) {
                items.push({ type: 'warn', title: `${escapeHtml(t.fields[plateField])} — ${escapeHtml(field.replace(' Expiry',''))} ληγει σε ${days}μ`, sub: escapeHtml(dt), page: 'maint_expiry' });
              }
            }
          });
        });
      };
      checkDocs(trucks, 'License Plate', ['KTEO Expiry','KEK Expiry','Insurance Expiry']);
      checkDocs(trailers, 'License Plate', ['ATP Expiry','Insurance Expiry']);
    }

    // ── 6. EIRINI / ACCOUNTANT — Invoicing ──
    if (isInvoicing) {
      // Delivered last 14 days without invoice
      orders.filter(r => {
        const f = r.fields;
        if (f['Status'] !== 'Delivered') return false;
        const inv = (f['Invoice Status']||'').toLowerCase();
        if (f['Invoiced'] || inv === 'invoiced' || inv === 'paid') return false;
        const dd = toLocalDate(f['Delivery DateTime']);
        if (!dd) return false;
        const dayDiff = Math.floor((new Date(today) - new Date(dd)) / 864e5);
        return dayDiff >= 0 && dayDiff <= 14;
      }).slice(0, 8).forEach(r => {
        const f = r.fields;
        items.push({ type: 'warn', title: 'Παραγγελία χωρίς τιμολόγιο',
          sub: escapeHtml(`${f['Order Number']||''} — ${(f['Client Summary']||f['Client Name']||'').slice(0,25)}`), page: 'invoicing' });
      });
    }

    // ── 7. NAKIS REMINDERS — Universal ──
    const reminders = JSON.parse(localStorage.getItem('tms_reminders') || '[]');
    const nowMs = Date.now();
    reminders.filter(r => new Date(r.time).getTime() <= nowMs && !r.dismissed).forEach(r => {
      items.push({ type: 'info', title: 'Υπενθύμιση', sub: escapeHtml(r.text), page: null });
    });

  } catch(e) { console.warn('Notif refresh error:', e); }

  // Sort by severity: danger > warn > info
  const sevOrder = { danger: 0, warn: 1, info: 2 };
  items.sort((a, b) => (sevOrder[a.type]||3) - (sevOrder[b.type]||3));

  _notifItems = items;

  // Update dot (red = danger present, otherwise just visible)
  const dot = document.getElementById('notifDot');
  if (dot) {
    dot.style.display = items.length ? 'block' : 'none';
    dot.style.background = items.some(i => i.type === 'danger') ? '#DC2626' : '#F59E0B';
  }

  // Greeting line based on role/time of day
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Καλημέρα' : hr < 18 ? 'Καλησπέρα' : 'Καλό βράδυ';
  const firstName = (user.name || username).split(' ')[0];
  const dangerCount = items.filter(i => i.type === 'danger').length;
  const warnCount = items.filter(i => i.type === 'warn').length;
  const headerSub = items.length
    ? `${dangerCount ? `${dangerCount} κρίσιμα` : ''}${dangerCount && warnCount ? ' • ' : ''}${warnCount ? `${warnCount} προς ενέργεια` : ''}${!dangerCount && !warnCount ? `${items.length} info` : ''}`
    : 'Όλα ΟΚ';

  // Render panel
  const panel = document.getElementById('notifPanel');
  if (panel) {
    panel.innerHTML = `
      <div class="notif-header" style="text-transform:none;letter-spacing:0;color:var(--text)">
        <div>
          <div style="font-size:13px;font-weight:700">${escapeHtml(greet)}, ${escapeHtml(firstName)}</div>
          <div style="font-size:11px;font-weight:400;color:var(--text-dim);margin-top:2px">${headerSub}</div>
        </div>
      </div>
      <div class="notif-list">
        ${items.length ? items.slice(0, 15).map(n => `
          <div class="notif-item" ${n.page ? `onclick="_notifOpen=false;document.getElementById('notifPanel').style.display='none';navigate('${n.page}')"` : ''}>
            <div class="notif-icon ${n.type}">${n.type==='danger'?'!':n.type==='warn'?'!':'i'}</div>
            <div class="notif-body">
              <div class="notif-title">${n.title}</div>
              <div class="notif-sub">${n.sub}</div>
            </div>
          </div>`).join('') : '<div class="notif-empty">Δεν υπαρχουν εκκρεμότητες · καλή δουλειά!</div>'}
      </div>`;
  }
}

// Auto-refresh notifications every 5 min
setInterval(() => { _refreshNotifs(); }, 300000);
// Initial load after 3 seconds
setTimeout(() => { _refreshNotifs(); }, 3000);

// ═══ TRASH VIEWER (Owner only) ═══

// Reverse-lookup table name from ID
function _tableNameFromId(tableId) {
  if (typeof TABLES === 'undefined') return tableId;
  for (const [name, id] of Object.entries(TABLES)) {
    if (id === tableId) return name;
  }
  return tableId;
}

function renderTrashViewer() {
  const c = document.getElementById('content');
  const trash = typeof getTrash === 'function' ? getTrash() : [];

  let html = `
    <div style="max-width:1100px;margin:0 auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
        <div>
          <h2 style="margin:0;font-family:'Syne',sans-serif;font-size:22px;color:var(--text-primary,#e2e8f0);">Trash</h2>
          <p style="margin:4px 0 0;color:var(--text-dim,#94a3b8);font-size:13px;">${trash.length} deleted record(s) — last 50 kept in browser storage</p>
        </div>
        ${trash.length ? `<button onclick="_clearAllTrash()" style="background:#7F1D1D;color:#fca5a5;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-family:'DM Sans',sans-serif;">Clear All Trash</button>` : ''}
      </div>`;

  if (!trash.length) {
    html += `
      <div style="text-align:center;padding:60px 20px;color:var(--text-dim,#94a3b8);">
        <svg width="48" height="48" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2" style="opacity:0.4;margin-bottom:16px;"><path d="M3 6h14M8 6V4h4v2M5 6v11a1 1 0 001 1h8a1 1 0 001-1V6M8 9v6M12 9v6"/></svg>
        <p style="font-size:15px;">Trash is empty</p>
        <p style="font-size:12px;margin-top:4px;">Deleted records will appear here for recovery</p>
      </div>`;
  } else {
    html += `<div style="display:flex;flex-direction:column;gap:8px;">`;
    trash.forEach((item, idx) => {
      const tableName = _tableNameFromId(item.table);
      const deletedAt = new Date(item.deletedAt);
      const timeAgo = _trashTimeAgo(deletedAt);
      // Show a few key fields as preview
      const preview = _trashPreview(item.fields);

      html += `
        <div style="background:var(--card-bg,#111827);border:1px solid var(--border,#1e293b);border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:14px;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="background:#1e3a5f;color:#93c5fd;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${escapeHtml(tableName)}</span>
              <span style="color:var(--text-dim,#94a3b8);font-size:11px;">${escapeHtml(item.id)}</span>
            </div>
            <div style="color:var(--text-primary,#e2e8f0);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(preview)}</div>
            <div style="color:var(--text-dim,#94a3b8);font-size:11px;margin-top:4px;">Deleted ${escapeHtml(timeAgo)} by ${escapeHtml(item.deletedBy || 'unknown')}</div>
          </div>
          <button onclick="_restoreTrashItem(${idx})" style="background:#0c4a1a;color:#86efac;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif;white-space:nowrap;">Restore</button>
        </div>`;
    });
    html += `</div>`;
  }

  html += `</div>`;
  c.innerHTML = html;
}

function _trashTimeAgo(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  return days + 'd ago';
}

function _trashPreview(fields) {
  if (!fields) return '(no data)';
  // Try common identifying fields
  const tryFields = ['Name', 'Company Name', 'Full Name', 'License Plate', 'Direction', 'Status', 'Client', 'Type', 'City'];
  const parts = [];
  for (const f of tryFields) {
    if (fields[f]) {
      let val = fields[f];
      if (Array.isArray(val)) val = val.join(', ');
      if (typeof val === 'string' && val.length > 40) val = val.substring(0, 40) + '...';
      parts.push(f + ': ' + val);
      if (parts.length >= 3) break;
    }
  }
  return parts.length ? parts.join(' | ') : Object.keys(fields).slice(0, 3).join(', ');
}

async function _restoreTrashItem(idx) {
  if (!confirm('Restore this record to its original table?')) return;
  const result = await atRestoreFromTrash(idx);
  if (result) {
    if (typeof showErrorToast === 'function') showErrorToast('Record restored successfully', 'info');
    renderTrashViewer(); // Re-render
  }
}

function _clearAllTrash() {
  if (!confirm('Permanently clear all trash? This cannot be undone.')) return;
  localStorage.setItem('tms_trash', '[]');
  renderTrashViewer();
}
