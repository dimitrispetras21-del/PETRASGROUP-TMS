// ═══════════════════════════════════════════════
// CORE — UTILS
// ═══════════════════════════════════════════════

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
