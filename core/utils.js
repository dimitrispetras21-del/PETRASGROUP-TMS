// ===============================================
// CORE -- UTILS
// ===============================================

// -- Debug Logger --------------------------------
// Gated console.log for verbose sync/flow logs.
// Enable at runtime via DevTools:   TMS_DEBUG = true
// Persist across reloads:           localStorage.setItem('tms_debug','1')
function _tmsLog(...args) {
  try {
    if (typeof window !== 'undefined' && window.TMS_DEBUG) { console.log('[TMS]', ...args); return; }
    if (typeof localStorage !== 'undefined' && localStorage.getItem('tms_debug') === '1') { console.log('[TMS]', ...args); }
  } catch(_) {}
}
if (typeof window !== 'undefined') window._tmsLog = _tmsLog;

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
const MAX_ERROR_LOG = 200;  // Bumped from 50 for busy-day coverage

/**
 * Infer severity from error shape + message heuristics.
 * @returns {'critical'|'warning'|'info'}
 */
function _inferSeverity(error, context) {
  const msg = (error?.message || String(error || '')).toLowerCase();
  const st = error?.status;
  // Explicit HTTP status
  if (st >= 500) return 'critical';
  if (st === 401 || st === 403) return 'warning';
  if (st === 404) return 'warning';
  if (st === 422 || st === 400) return 'warning';
  // Aborts / cancellations → info
  if (msg.includes('abort') || error?.name === 'AbortError') return 'info';
  // Critical keywords
  if (/rate[- ]?limit|quota|authentication|permission denied|unauthori[sz]ed/i.test(msg)) return 'warning';
  if (/timeout|network|failed to fetch|cors|offline/i.test(msg)) return 'warning';
  if (/cannot read|undefined is not|typeerror|syntaxerror|referenceerror/i.test(msg)) return 'critical';
  // Context-based
  const ctxLo = (context || '').toLowerCase();
  if (ctxLo.includes('save') || ctxLo.includes('create') || ctxLo.includes('delete')) return 'critical';
  return 'warning'; // default
}

/**
 * Dedup: if the last entry has the same msg+ctx, bump its count instead of appending.
 */
function _maybeDedup(entry) {
  if (_errorLog.length === 0) return false;
  const last = _errorLog[_errorLog.length - 1];
  if (last.msg === entry.msg && last.ctx === entry.ctx) {
    last.count = (last.count || 1) + 1;
    last.ts = entry.ts; // update to most recent
    return true;
  }
  return false;
}

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
    severity: _inferSeverity(error, context),
    user: (function() { try { return JSON.parse(localStorage.getItem('tms_user') || '{}').name || 'unknown'; } catch { return 'unknown'; } })(),
    page: localStorage.getItem('tms_page') || 'dashboard',
    count: 1,
  };
  if (!_maybeDedup(entry)) {
    _errorLog.push(entry);
    if (_errorLog.length > MAX_ERROR_LOG) _errorLog.shift();
  }
  try { localStorage.setItem('tms_errors', JSON.stringify(_errorLog)); }
  catch(e) {
    // Quota exceeded — trim to half and retry once
    try {
      _errorLog.splice(0, Math.floor(_errorLog.length / 2));
      localStorage.setItem('tms_errors', JSON.stringify(_errorLog));
    } catch(_) { console.warn('[TMS] Failed to persist error log:', e); }
  }
  console.error(`[TMS ERROR] ${context}:`, error);
  // Forward to Sentry if available (loaded lazily — see _initSentry)
  try {
    if (window.Sentry && typeof window.Sentry.captureException === 'function') {
      window.Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
        level: entry.severity === 'info' ? 'info' : entry.severity === 'warning' ? 'warning' : 'error',
        extra: { ctx: context, user: entry.user, page: entry.page }
      });
    }
  } catch(_) {}
}

// Sentry: lazy-loaded. To enable: set window.SENTRY_DSN in config.js, then call _initSentry()
function _initSentry() {
  if (window.Sentry || !window.SENTRY_DSN) return;
  const s = document.createElement('script');
  s.src = 'https://browser.sentry-cdn.com/7.99.0/bundle.min.js';
  s.crossOrigin = 'anonymous';
  s.onload = () => {
    try {
      window.Sentry.init({ dsn: window.SENTRY_DSN, tracesSampleRate: 0.1, environment: location.hostname.includes('github.io') ? 'production' : 'dev' });
    } catch(e) { console.warn('Sentry init failed:', e); }
  };
  document.head.appendChild(s);
}
// Auto-init if DSN configured
if (typeof window !== 'undefined' && window.SENTRY_DSN) _initSentry();

/**
 * Get the persisted error log
 * @returns {Array} Array of error log entries
 */
function getErrorLog() {
  try { return JSON.parse(localStorage.getItem('tms_errors') || '[]'); } catch { return []; }
}

// Error log UI state (filters)
const _errLogState = { search: '', severity: '', user: '', ctx: '', range: 'all' };

function _elRelTime(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.round(diff / 60) + 'm ago';
  if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.round(diff / 86400) + 'd ago';
  return new Date(iso).toLocaleDateString('el-GR');
}

function _elSeverityPill(sev) {
  const map = { critical: 'red', warning: 'amber', info: 'green' };
  const label = { critical: 'CRIT', warning: 'WARN', info: 'INFO' };
  return `<span class="dash-aging-pill ${map[sev] || 'amber'}">${label[sev] || 'WARN'}</span>`;
}

function _elFilter(errors) {
  const s = _errLogState;
  return errors.filter(e => {
    if (s.severity && e.severity !== s.severity) return false;
    if (s.user && e.user !== s.user) return false;
    if (s.ctx && !String(e.ctx || '').toLowerCase().includes(s.ctx.toLowerCase())) return false;
    if (s.search) {
      const q = s.search.toLowerCase();
      const blob = [e.msg, e.ctx, e.user, e.page, e.stack].join(' ').toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (s.range && s.range !== 'all') {
      const now = Date.now();
      const cutoffs = { '1h': 3600e3, '24h': 86400e3, '7d': 7 * 86400e3 };
      if (e.ts && (now - new Date(e.ts).getTime()) > (cutoffs[s.range] || 0)) return false;
    }
    return true;
  });
}

function _errLogSetFilter(key, val) { _errLogState[key] = val; renderErrorLog(); }

function _errLogExport(format) {
  const errors = getErrorLog();
  if (!errors.length) { if (typeof toast === 'function') toast('No errors to export'); return; }
  let blob, filename;
  if (format === 'csv') {
    const rows = [['Timestamp','Severity','Count','User','Page','Context','Message','Stack']];
    errors.forEach(e => rows.push([
      e.ts || '', e.severity || '', e.count || 1, e.user || '', e.page || '',
      e.ctx || '', e.msg || '', (e.stack || '').replace(/\n/g, ' | ')
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    filename = `tms-errors-${new Date().toISOString().slice(0,10)}.csv`;
  } else {
    blob = new Blob([JSON.stringify(errors, null, 2)], { type: 'application/json' });
    filename = `tms-errors-${new Date().toISOString().slice(0,10)}.json`;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  if (typeof toast === 'function') toast('Exported ' + format.toUpperCase());
}

function _errLogClear() {
  // Confirmation modal (uses same styling as Nakis confirm)
  const existing = document.querySelector('.aic-confirm-overlay.el-clear');
  if (existing) return;
  const overlay = document.createElement('div');
  overlay.className = 'aic-confirm-overlay el-clear';
  const _ic = (typeof icon === 'function') ? icon('alert_triangle', 18) : '⚠';
  overlay.innerHTML = `
    <div class="aic-confirm-card">
      <div class="aic-confirm-head">
        <span class="aic-confirm-icon">${_ic}</span>
        <span class="aic-confirm-title">Καθαρισμός Error Log;</span>
      </div>
      <div class="aic-confirm-body">
        <div>Θα διαγραφούν <strong>${_errorLog.length}</strong> error entries.</div>
        <div style="margin-top:8px;color:#94A3B8;font-size:11px">Μπορείς να κάνεις Export πρώτα (JSON/CSV) αν θέλεις να κρατήσεις backup.</div>
      </div>
      <div class="aic-confirm-foot">
        <button class="aic-confirm-cancel">Ακύρωση</button>
        <button class="aic-confirm-ok">Διαγραφή</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.aic-confirm-cancel').onclick = close;
  overlay.querySelector('.aic-confirm-ok').onclick = () => {
    // FIX: clear BOTH memory and localStorage (bug: was only localStorage)
    _errorLog.length = 0;
    localStorage.removeItem('tms_errors');
    close();
    renderErrorLog();
    if (typeof toast === 'function') toast('Error log cleared');
  };
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

function _errLogShowStack(idx) {
  const errors = getErrorLog().reverse();
  const e = errors[idx];
  if (!e) return;
  const overlay = document.createElement('div');
  overlay.className = 'aic-confirm-overlay';
  overlay.innerHTML = `
    <div class="aic-confirm-card" style="max-width:680px">
      <div class="aic-confirm-head">
        <span class="aic-confirm-icon">${_elSeverityPill(e.severity)}</span>
        <span class="aic-confirm-title" style="font-size:13px">${escapeHtml(e.msg || '')}</span>
      </div>
      <div class="aic-confirm-body">
        <div><strong>Context:</strong> ${escapeHtml(e.ctx || '—')}</div>
        <div><strong>User:</strong> ${escapeHtml(e.user || '—')}</div>
        <div><strong>Page:</strong> ${escapeHtml(e.page || '—')}</div>
        <div><strong>When:</strong> ${e.ts ? new Date(e.ts).toLocaleString('el-GR') : '—'} (${_elRelTime(e.ts)})</div>
        ${(e.count && e.count > 1) ? `<div><strong>Count:</strong> ${e.count} occurrences</div>` : ''}
        <div style="margin-top:10px"><strong>Stack trace:</strong></div>
        <pre style="margin:4px 0 0;padding:10px;background:rgba(0,0,0,.25);border-radius:4px;font-size:11px;line-height:1.4;max-height:300px;overflow:auto;white-space:pre-wrap;font-family:'DM Sans',monospace">${escapeHtml(e.stack || '(no stack trace)')}</pre>
      </div>
      <div class="aic-confirm-foot">
        <button class="aic-confirm-cancel">Close</button>
        <button class="aic-confirm-ok" onclick="navigator.clipboard.writeText(${JSON.stringify(JSON.stringify(e, null, 2))});this.textContent='Copied!';setTimeout(()=>this.textContent='Copy JSON',1200)">Copy JSON</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.aic-confirm-cancel').onclick = close;
  overlay.onclick = (e2) => { if (e2.target === overlay) close(); };
  document.addEventListener('keydown', function esc(ev) {
    if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

/**
 * Render the error log viewer page (owner role only)
 */
function renderErrorLog() {
  const c = document.getElementById('content');
  const u = JSON.parse(localStorage.getItem('tms_user') || '{}');
  if (u.role !== 'owner') { c.innerHTML = showAccessDenied(); return; }

  const all = getErrorLog().reverse(); // newest first
  const filtered = _elFilter(all);

  // Severity counts (on full set, not filtered)
  const counts = { critical: 0, warning: 0, info: 0 };
  all.forEach(e => { counts[e.severity || 'warning'] = (counts[e.severity || 'warning'] || 0) + 1; });

  // Unique users for filter dropdown
  const users = [...new Set(all.map(e => e.user).filter(Boolean))];
  const sentryOn = !!(window.Sentry && window.SENTRY_DSN);
  const _ic = (name, size) => (typeof icon === 'function') ? icon(name, size || 14) : '';

  const rows = filtered.map((e, idx) => {
    // Find original index in `all` for modal lookup
    const origIdx = all.indexOf(e);
    return `<tr onclick="_errLogShowStack(${origIdx})" style="cursor:pointer">
      <td style="white-space:nowrap">${_elSeverityPill(e.severity)}</td>
      <td style="white-space:nowrap;font-family:'DM Sans',monospace;font-size:11px;color:var(--dc-text-dim)" title="${e.ts ? new Date(e.ts).toLocaleString('el-GR') : ''}">${_elRelTime(e.ts)}</td>
      <td style="max-width:340px;overflow:hidden;text-overflow:ellipsis;font-weight:500">${escapeHtml((e.msg || '').substring(0, 140))}${(e.count && e.count > 1) ? `<span style="margin-left:6px;padding:1px 6px;background:rgba(56,189,248,0.12);color:#38BDF8;border-radius:3px;font-size:10px;font-weight:700;font-family:'DM Sans',monospace">×${e.count}</span>` : ''}</td>
      <td style="color:var(--dc-text-mid)">${escapeHtml(e.ctx || '—')}</td>
      <td style="color:var(--dc-text-mid)">${escapeHtml(e.user || '—')}</td>
      <td style="color:var(--dc-text-dim);font-size:11px">${escapeHtml(e.page || '—')}</td>
    </tr>`;
  }).join('');

  c.innerHTML = `
    <div class="dash-wrap">
      <div class="dash-header">
        <div>
          <div class="dash-greeting">${_ic('alert_triangle', 22)} Error Log</div>
          <div class="dash-date">${all.length} entries total · ${filtered.length} shown · Sentry ${sentryOn ? 'ON' : 'OFF'}</div>
        </div>
        <div style="display:flex;gap:var(--space-2);align-items:center">
          <button class="btn btn-ghost btn-sm" onclick="_errLogExport('json')">${_ic('file_text', 14)} JSON</button>
          <button class="btn btn-ghost btn-sm" onclick="_errLogExport('csv')">${_ic('file_text', 14)} CSV</button>
          <button class="btn btn-secondary btn-sm" onclick="_errLogClear()">${_ic('trash', 14)} Clear</button>
        </div>
      </div>

      <!-- KPI Bar (3 severity counts) -->
      <div class="dash-kpi-bar" style="grid-template-columns:repeat(3,1fr)">
        <div class="dash-kpi" onclick="_errLogSetFilter('severity','critical')">
          <div class="dash-kpi-glow" style="background:linear-gradient(90deg,#DC2626,transparent)"></div>
          <div class="dash-kpi-label">${_ic('alert_triangle', 11)} Critical</div>
          <div class="dash-kpi-value ${counts.critical ? 'dash-val-danger' : 'dash-val-muted'}">${counts.critical}</div>
          <div class="dash-kpi-sub">errors + exceptions</div>
        </div>
        <div class="dash-kpi" onclick="_errLogSetFilter('severity','warning')">
          <div class="dash-kpi-glow" style="background:linear-gradient(90deg,#D97706,transparent)"></div>
          <div class="dash-kpi-label">${_ic('clock', 11)} Warning</div>
          <div class="dash-kpi-value ${counts.warning ? 'dash-val-warning' : 'dash-val-muted'}">${counts.warning}</div>
          <div class="dash-kpi-sub">auth, network, 4xx</div>
        </div>
        <div class="dash-kpi" onclick="_errLogSetFilter('severity','info')">
          <div class="dash-kpi-glow" style="background:linear-gradient(90deg,#10B981,transparent)"></div>
          <div class="dash-kpi-label">${_ic('info', 11)} Info</div>
          <div class="dash-kpi-value ${counts.info ? 'dash-val-success' : 'dash-val-muted'}">${counts.info}</div>
          <div class="dash-kpi-sub">aborts, expected</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="entity-toolbar-v2" style="margin-bottom:var(--space-4)">
        <div class="entity-search-wrap">
          ${_ic('search')}
          <input class="entity-search-input" placeholder="Search message / context / user…"
            value="${escapeHtml(_errLogState.search)}"
            oninput="_errLogState.search=this.value;renderErrorLog()">
        </div>
        <select class="svc-filter" onchange="_errLogSetFilter('severity',this.value)">
          <option value="">Severity: All</option>
          <option value="critical"${_errLogState.severity==='critical'?' selected':''}>Critical</option>
          <option value="warning"${_errLogState.severity==='warning'?' selected':''}>Warning</option>
          <option value="info"${_errLogState.severity==='info'?' selected':''}>Info</option>
        </select>
        <select class="svc-filter" onchange="_errLogSetFilter('user',this.value)">
          <option value="">User: All</option>
          ${users.map(u => `<option value="${escapeHtml(u)}"${_errLogState.user===u?' selected':''}>${escapeHtml(u)}</option>`).join('')}
        </select>
        <select class="svc-filter" onchange="_errLogSetFilter('range',this.value)">
          <option value="all">Time: All</option>
          <option value="1h"${_errLogState.range==='1h'?' selected':''}>Last hour</option>
          <option value="24h"${_errLogState.range==='24h'?' selected':''}>Last 24h</option>
          <option value="7d"${_errLogState.range==='7d'?' selected':''}>Last 7 days</option>
        </select>
        <span class="entity-count-chip">${filtered.length}</span>
      </div>

      <!-- Table -->
      <div class="dash-card">
        <div class="dash-card-body flush">
          <table class="md-fleet-table">
            <thead><tr>
              <th style="width:70px">Sev</th>
              <th style="width:90px">When</th>
              <th>Message</th>
              <th style="width:160px">Context</th>
              <th style="width:120px">User</th>
              <th style="width:120px">Page</th>
            </tr></thead>
            <tbody>${rows.length ? rows : `<tr><td colspan="6"><div class="dash-empty" style="padding:var(--space-8) var(--space-4)">${_ic('check_circle', 28)}<div>No errors logged${all.length && !rows.length ? ' matching filters' : ''}</div></div></td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// Expose globally for onclick handlers
window._errLogSetFilter = _errLogSetFilter;
window._errLogExport = _errLogExport;
window._errLogClear = _errLogClear;
window._errLogShowStack = _errLogShowStack;
window._errLogState = _errLogState;

// Load persisted errors into memory on init
try {
  const stored = JSON.parse(localStorage.getItem('tms_errors') || '[]');
  _errorLog.push(...stored);
} catch(e) { console.warn('[TMS] Failed to load stored error log:', e); }

// ═══ UNDO BUTTON RENDERER ═══
let _undoTickTimer = null;
function renderUndoButton() {
  const btn = document.getElementById('undoBtn');
  if (!btn) return;
  const a = (typeof getUndoAction === 'function') ? getUndoAction() : null;
  const lbl = document.getElementById('undoLabel');
  const cd = document.getElementById('undoCountdown');

  if (!a) {
    // Idle state: always visible, icon only, dimmed, title shows "nothing to undo"
    btn.classList.add('undo-btn-idle');
    btn.title = 'Nothing to undo';
    if (lbl) lbl.style.display = 'none';
    if (cd) cd.style.display = 'none';
    if (_undoTickTimer) { clearInterval(_undoTickTimer); _undoTickTimer = null; }
    return;
  }

  // Active state: full button with label + countdown
  btn.classList.remove('undo-btn-idle');
  const verb = a.type === 'delete' ? 'Restore' : a.type === 'patch' ? 'Revert' : 'Undo';
  const labelText = `${verb}: ${String(a.label || '').slice(0, 24)}`;
  btn.title = labelText;
  if (lbl) { lbl.style.display = ''; lbl.textContent = labelText; }
  if (cd) cd.style.display = '';
  // Tick countdown every second
  if (_undoTickTimer) clearInterval(_undoTickTimer);
  const tick = () => {
    const left = Math.max(0, Math.round((60000 - (Date.now() - a.ts)) / 1000));
    if (cd) cd.textContent = left + 's';
    if (left <= 0) { if (typeof clearUndo === 'function') clearUndo(); }
  };
  tick();
  _undoTickTimer = setInterval(tick, 1000);
}

// Initial render on page load (so idle icon shows immediately)
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => { try { renderUndoButton(); } catch(_) {} });
}

// ═══ NOTIFICATION CENTER ═══
let _notifOpen = false;
let _notifItems = [];

function _toggleNotifPanel() {
  _notifOpen = !_notifOpen;
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  if (_notifOpen) {
    // Lazy permission prompt — only when user actively engages with notifications.
    // Avoids the annoying "this site wants to show notifications" on every page load.
    _maybeRequestPushPermission();
    _refreshNotifs().then(() => { panel.style.display = 'block'; });
    setTimeout(() => document.addEventListener('click', _closeNotifOutside, { once: true }), 50);
  } else {
    panel.style.display = 'none';
  }
}

function _maybeRequestPushPermission() {
  if (!('Notification' in window)) return;
  // Already granted or denied — leave it
  if (Notification.permission !== 'default') return;
  // Don't pester — only ask once per session
  if (sessionStorage.getItem('tms_notif_perm_asked')) return;
  sessionStorage.setItem('tms_notif_perm_asked', '1');
  Notification.requestPermission().then(p => {
    if (p === 'granted') toast('Push notifications ενεργοποιήθηκαν', 'info');
  });
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
      (isChiefOps) ? atGetAll(TABLES.NAT_LOADS, { fields: ['Direction','Status','Delivery DateTime'] }, true).catch(()=>[]) : Promise.resolve([]),
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

  // ── Smart grouping: collapse N items with same title prefix into one ──
  // e.g. 5 separate "KTEO expires" notifications → "5 trucks need KTEO renewal"
  // Group key = first 25 chars of title (covers truck/trailer/order template variants).
  const groupable = ['warn', 'info'];  // never group critical "danger" items
  const groupedMap = new Map();
  const ungrouped = [];
  items.forEach(it => {
    if (!groupable.includes(it.type)) { ungrouped.push(it); return; }
    const key = it.type + ':' + (it.title || '').slice(0, 25).toLowerCase();
    if (!groupedMap.has(key)) groupedMap.set(key, []);
    groupedMap.get(key).push(it);
  });
  const groupedItems = [];
  groupedMap.forEach(arr => {
    if (arr.length >= 3) {
      // Consolidate 3+ items into one expandable group
      groupedItems.push({
        type: arr[0].type,
        title: `${arr.length}× ${arr[0].title}`,
        sub: `Tap to expand · ${arr.map(x => x.sub).filter(Boolean).slice(0,2).join(' · ').slice(0,60)}…`,
        page: arr[0].page,
        children: arr,
        grouped: true,
      });
    } else {
      // Less than 3 — keep individual
      groupedItems.push(...arr);
    }
  });
  // Re-sort: danger first, then groups by count desc, then individual warn, then info
  const sevOrder = { danger: 0, warn: 1, info: 2 };
  const finalItems = [...ungrouped, ...groupedItems];
  finalItems.sort((a, b) => {
    const sa = sevOrder[a.type] ?? 3;
    const sb = sevOrder[b.type] ?? 3;
    if (sa !== sb) return sa - sb;
    // Same severity: groups first (more impactful), then by item count
    if (a.grouped && !b.grouped) return -1;
    if (!a.grouped && b.grouped) return 1;
    return (b.children?.length || 0) - (a.children?.length || 0);
  });

  _notifItems = finalItems;
  // Re-assign for render below (which still references `items`)
  items.length = 0;
  items.push(...finalItems);

  // Update dot (red = danger present, otherwise just visible)
  const dot = document.getElementById('notifDot');
  if (dot) {
    dot.style.display = items.length ? 'block' : 'none';
    dot.style.background = items.some(i => i.type === 'danger') ? '#DC2626' : '#F59E0B';
  }

  // ── Browser-native push for NEW critical notifications ──
  // Fires even when the user is on another tab. Tracks last-shown signature
  // in sessionStorage to avoid re-pinging on every refresh.
  try {
    const dangers = items.filter(i => i.type === 'danger');
    if (dangers.length && 'Notification' in window && Notification.permission === 'granted') {
      const sig = dangers.map(i => _notifKey(i)).sort().join('|');
      const lastSig = sessionStorage.getItem('tms_notif_last_sig') || '';
      if (sig !== lastSig) {
        sessionStorage.setItem('tms_notif_last_sig', sig);
        // Show browser notification (consolidated if more than one)
        const top = dangers[0];
        const title = dangers.length > 1
          ? `Petras TMS — ${dangers.length} κρίσιμα`
          : 'Petras TMS — Κρίσιμη ειδοποίηση';
        const body = dangers.length > 1
          ? `${top.title}\n+${dangers.length - 1} ακόμη — δες στο app`
          : `${top.title}\n${top.sub || ''}`;
        try {
          const n = new Notification(title, { body, tag: 'tms-critical', icon: '/PETRASGROUP-TMS/logo.png' });
          n.onclick = () => { window.focus(); if (top.page) navigate(top.page); n.close(); };
        } catch(e) { /* notifications API can throw on unsupported platforms */ }
      }
    }
  } catch(e) { console.warn('[notif] browser push failed:', e.message); }

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
        ${items.length ? items.slice(0, 20).map((n, idx) => {
          // Snoozed items (in-memory) — skip rendering
          if (_notifSnoozed.has(_notifKey(n))) return '';

          // Top-level notification card
          const navClick = n.page
            ? `_notifOpen=false;document.getElementById('notifPanel').style.display='none';navigate('${n.page}');event.stopPropagation();`
            : '';
          const expandClick = n.grouped
            ? `event.stopPropagation();_notifToggleGroup(${idx});`
            : '';
          const onClick = n.grouped ? expandClick : navClick;
          const expanded = !!_notifExpanded[idx];

          return `
            <div class="notif-item ${n.grouped ? 'grouped' : ''}" data-notif-idx="${idx}" ${onClick ? `onclick="${onClick}"` : ''}>
              <div class="notif-icon ${n.type}">${n.type==='danger'?'!':n.type==='warn'?'!':'i'}</div>
              <div class="notif-body">
                <div class="notif-title">${n.title}${n.grouped ? ` <span style="opacity:0.5;font-size:10px">${expanded?'▾':'▸'}</span>` : ''}</div>
                <div class="notif-sub">${n.sub}</div>
                <div class="notif-actions" style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap" onclick="event.stopPropagation()">
                  ${n.page ? `<button class="notif-btn notif-btn-primary" onclick="_notifOpen=false;document.getElementById('notifPanel').style.display='none';navigate('${n.page}')">Open</button>` : ''}
                  <button class="notif-btn notif-btn-ghost" onclick="_notifSnooze(${idx})" title="Hide for this session">Snooze</button>
                </div>
                ${n.grouped && expanded ? `
                  <div class="notif-children" style="margin-top:8px;border-left:2px solid var(--border);padding-left:8px">
                    ${n.children.map(c => `
                      <div class="notif-child" style="padding:4px 0;font-size:11.5px;cursor:${c.page?'pointer':'default'}"
                        ${c.page ? `onclick="event.stopPropagation();_notifOpen=false;document.getElementById('notifPanel').style.display='none';navigate('${c.page}')"` : ''}>
                        <div style="color:var(--text-mid);font-weight:500">${c.title}</div>
                        <div style="color:var(--text-dim);font-size:10.5px">${c.sub}</div>
                      </div>`).join('')}
                  </div>` : ''}
              </div>
            </div>`;
        }).join('') : '<div class="notif-empty">Δεν υπαρχουν εκκρεμότητες · καλή δουλειά!</div>'}
      </div>`;
  }
}

// ─── Per-session snooze + expand state ───────────────────────────
const _notifSnoozed = new Set();   // keys of snoozed items (cleared on reload)
const _notifExpanded = {};         // idx → bool (group expanded)

function _notifKey(n) {
  return (n.title || '') + '|' + (n.sub || '').slice(0, 50);
}
function _notifSnooze(idx) {
  const n = _notifItems[idx];
  if (!n) return;
  _notifSnoozed.add(_notifKey(n));
  _refreshNotifs();
  toast('Hidden for this session');
}
function _notifToggleGroup(idx) {
  _notifExpanded[idx] = !_notifExpanded[idx];
  // Re-render panel only — don't re-fetch
  const panel = document.getElementById('notifPanel');
  if (panel && panel.style.display !== 'none') _refreshNotifs();
}
if (typeof window !== 'undefined') {
  window._notifSnooze = _notifSnooze;
  window._notifToggleGroup = _notifToggleGroup;
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
