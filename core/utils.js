// ═══════════════════════════════════════════════
// CORE — UTILS
// ═══════════════════════════════════════════════

// Convert Airtable UTC datetime to local YYYY-MM-DD string
function toLocalDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// Today's date as YYYY-MM-DD in local timezone
function localToday() {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// Tomorrow's date as YYYY-MM-DD in local timezone
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
      atGetAll(TABLES.TRAILERS, { fields: ['Plate','ATP Expiry','Insurance Expiry'] }, true),
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
      items.push({ type: 'danger', title: `${f['Direction']} χωρίς ανάθεση`, sub: route, page: 'orders_intl' });
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
                items.push({ type: 'danger', title: `${t.fields[plateField]} — ${field.replace(' Expiry','')} ΛΗΓΜΕΝΟ`, sub: `Εληξε ${Math.abs(days)} μερες πριν`, page: 'expiry_alerts' });
              } else if (days <= 14) {
                items.push({ type: 'warn', title: `${t.fields[plateField]} — ${field.replace(' Expiry','')} ληγει σε ${days}μ`, sub: dt, page: 'expiry_alerts' });
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
      items.push({ type: 'info', title: 'Υπενθύμιση', sub: r.text, page: null });
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
