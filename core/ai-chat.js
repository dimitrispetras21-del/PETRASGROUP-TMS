// ═══════════════════════════════════════════════════════════════
// ΝΑΚΗΣ — Ψηφιακός Βοηθός Petras Group
// ═══════════════════════════════════════════════════════════════
'use strict';

// Profile schema version — bump when profile shape changes for migrations
const _NAKIS_PROFILE_VERSION = 2;

// Tools that mutate Airtable data — require user confirmation before exec
const _DESTRUCTIVE_TOOLS = new Set(['create_work_order', 'update_record']);

// System prompt size cap (~4K tokens; rough estimate = chars / 4)
const _MAX_PAGE_CTX_CHARS = 2000;
const _MAX_APP_KNOWLEDGE_CHARS = 5000;

// Daily token quota per user (rough cap to prevent bill blowups)
const _DAILY_TOKEN_LIMIT = 100000;

const AiChat = {
  isOpen: false,
  messages: [],
  suggestions: [],
  isLoading: false,
  abortCtrl: null,
  _obsCache: null,
  _obsCacheTs: 0,
};

/* ── USER-SCOPED STORAGE KEYS ─────────────────────────────── */
function _nakisUserSlug() {
  const name = typeof user !== 'undefined' ? (user.name || 'default') : 'default';
  return name.replace(/\s+/g, '_');
}
function _nakisProfileKey()  { return 'nakis_profile_' + _nakisUserSlug(); }
function _nakisNotifsKey()   { return 'nakis_notifs_'  + _nakisUserSlug(); }
function _nakisHistoryKey()  { return 'aic_history_'   + _nakisUserSlug(); }
function _nakisTokensKey()   { return 'nakis_tokens_'  + _nakisUserSlug() + '_' + localToday(); }

/* ── PROFILE MANAGEMENT (with schema versioning) ──────────── */
function _nakisGetProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(_nakisProfileKey()));
    if (!raw) return null;
    return _nakisMigrateProfile(raw);
  } catch { return null; }
}
function _nakisSaveProfile(profile) {
  profile.interviewDate = localToday();
  profile.profileVersion = _NAKIS_PROFILE_VERSION;
  localStorage.setItem(_nakisProfileKey(), JSON.stringify(profile));
}
function _nakisMigrateProfile(p) {
  // v0/v1 → v2: ensure all expected arrays exist as arrays (not undefined)
  if (!p.profileVersion || p.profileVersion < 2) {
    p.focus_clients = Array.isArray(p.focus_clients) ? p.focus_clients : [];
    p.focus_routes  = Array.isArray(p.focus_routes)  ? p.focus_routes  : [];
    p.pain_points   = Array.isArray(p.pain_points)   ? p.pain_points   : [];
    p.daily_must_do = Array.isArray(p.daily_must_do) ? p.daily_must_do : [];
    p.reminders     = Array.isArray(p.reminders)     ? p.reminders     : [];
    p.detail_level  = p.detail_level || 'brief';
    p.profileVersion = _NAKIS_PROFILE_VERSION;
    try { localStorage.setItem(_nakisProfileKey(), JSON.stringify(p)); } catch {}
  }
  return p;
}

/* ── REMINDERS ───────────────────────────────────────────── */
function _nakisGetNotifs() {
  try { return JSON.parse(localStorage.getItem(_nakisNotifsKey())) || []; } catch { return []; }
}
function _nakisSaveNotifs(notifs) {
  localStorage.setItem(_nakisNotifsKey(), JSON.stringify(notifs));
}

/* ── DAILY TOKEN QUOTA ───────────────────────────────────── */
function _nakisTokensUsed() {
  return parseInt(localStorage.getItem(_nakisTokensKey()) || '0', 10) || 0;
}
function _nakisAddTokens(n) {
  if (!n || n < 0) return;
  localStorage.setItem(_nakisTokensKey(), String(_nakisTokensUsed() + n));
}
function _nakisQuotaOk() {
  return _nakisTokensUsed() < _DAILY_TOKEN_LIMIT;
}
function _nakisQuotaPct() {
  return Math.min(100, Math.round(_nakisTokensUsed() / _DAILY_TOKEN_LIMIT * 100));
}

/* ── PAGE CONTEXT COLLECTOR ──────────────────────────────── */
function _aicPageContext() {
  const page = typeof currentPage !== 'undefined' ? currentPage : '';
  const lines = [];

  try {
    if (page === 'weekly_intl' && typeof WINTL !== 'undefined' && WINTL.rows) {
      const exp = WINTL.data?.exports || [];
      const imp = WINTL.data?.imports || [];
      const rows = WINTL.rows || [];
      const expRows = rows.filter(r => r.type === 'export');
      const unassigned = expRows.filter(r => !r.saved).length;
      const assigned = expRows.filter(r => r.saved).length;
      const unmatched = expRows.filter(r => !r.importId).length;
      lines.push(`Weekly International W${WINTL.week}:`);
      lines.push(`  ${exp.length} exports (${assigned} assigned, ${unassigned} UNASSIGNED)`);
      lines.push(`  ${imp.length} imports, ${unmatched} exports χωρίς matched import (empty return risk)`);
    }

    if (page === 'weekly_natl' && typeof WNATL !== 'undefined' && WNATL.rows) {
      const ns = WNATL.rows.filter(r => r.type === 'northsouth');
      const sn = WNATL.rows.filter(r => r.type === 'southnorth');
      const unassNS = ns.filter(r => !r.saved).length;
      const unassSN = sn.filter(r => !r.saved).length;
      lines.push(`Weekly National W${WNATL.week}:`);
      lines.push(`  ${ns.length} ΚΑΘΟΔΟΣ (${unassNS} unassigned), ${sn.length} ΑΝΟΔΟΣ (${unassSN} unassigned)`);
    }

    if (page === 'daily_ramp' && typeof RAMP !== 'undefined') {
      const inb = (RAMP.records || []).filter(r => r.fields['Type'] === 'Παραλαβή');
      const out = (RAMP.records || []).filter(r => r.fields['Type'] === 'Φόρτωση');
      const done = (RAMP.records || []).filter(r => r.fields['Status'] === 'Done').length;
      const stockItems = RAMP.stock || [];
      lines.push(`Ramp Board ${RAMP.date}:`);
      lines.push(`  ${inb.length} inbound, ${out.length} outbound, ${done} completed`);
      if (stockItems.length) lines.push(`  Stock: ${stockItems.length} items in warehouse`);
    }

    if (page === 'daily_ops' && typeof OPS !== 'undefined') {
      const total = OPS.intl?.length || 0;
      const overdue = OPS.overdue?.length || 0;
      lines.push(`Daily Ops (${OPS.date}):`);
      lines.push(`  ${total} orders today, ${overdue} OVERDUE`);
    }

    if ((page === 'maint_dashboard' || page === 'maint_expiry' || page === 'maint_req') && typeof MAINT !== 'undefined' && _canSee('maintenance')) {
      const trucks = MAINT.trucks || [];
      const trailers = MAINT.trailers || [];
      const expiring = [];
      for (const t of trucks) {
        if (!t.fields['Active']) continue;
        for (const f of ['KTEO Expiry', 'KEK Expiry', 'Insurance Expiry']) {
          const d = t.fields[f];
          if (d) {
            const days = Math.ceil((new Date(d) - new Date()) / 86400000);
            if (days <= 30) expiring.push(`${t.fields['License Plate']} ${f.replace(' Expiry','')}: ${days}d`);
          }
        }
      }
      lines.push(`Maintenance: ${trucks.length} trucks, ${trailers.length} trailers`);
      if (expiring.length) lines.push(`  Expiring soon: ${expiring.slice(0, 5).join(', ')}`);
    }

    if (page === 'orders_intl' && typeof INTL_ORDERS !== 'undefined') {
      lines.push(`International Orders: ${INTL_ORDERS.data?.length || 0} records loaded`);
    }
    if (page === 'orders_natl' && typeof NATL_ORDERS !== 'undefined') {
      lines.push(`National Orders: ${NATL_ORDERS.data?.length || 0} records loaded`);
    }
  } catch (e) {
    lines.push(`(context error: ${e.message})`);
  }

  return lines.join('\n') || 'No page-specific data loaded yet.';
}

/* ── CSS INJECTION (uses app design tokens) ────────────────── */
(function(){
  if (document.getElementById('ai-chat-css')) return;
  const s = document.createElement('style'); s.id = 'ai-chat-css';
  s.textContent = `
/* Floating launcher button */
.aic-btn { position:fixed; bottom:24px; right:24px; z-index:950;
  width:52px; height:52px; border-radius:50%; border:none;
  background:var(--accent); color:#fff; cursor:pointer;
  box-shadow:0 4px 16px rgba(2,132,199,0.35);
  display:flex; align-items:center; justify-content:center;
  transition:all var(--duration-base, .2s) var(--ease-out, ease); }
.aic-btn:hover { background:var(--accent-hover, #0369A1); transform:scale(1.08); }
.aic-btn .aic-dot { position:absolute; top:2px; right:2px; width:12px; height:12px;
  background:var(--danger, #DC2626); border-radius:50%; border:2px solid var(--bg-card, #fff);
  display:none; }
.aic-btn.has-alerts .aic-dot { display:block; }

/* Panel */
.aic-panel { position:fixed; bottom:24px; right:24px; z-index:950;
  width:400px; height:600px; max-height:80vh;
  background:#0F1C2F; border-radius:var(--radius-lg, 12px);
  box-shadow:0 12px 48px rgba(15,23,42,0.4);
  display:flex; flex-direction:column; overflow:hidden;
  transform:scale(0.92) translateY(16px); opacity:0;
  pointer-events:none; transition:all var(--duration-base, .2s) var(--ease-out, ease);
  border:1px solid rgba(255,255,255,0.06); }
.aic-panel.open { transform:scale(1) translateY(0); opacity:1; pointer-events:auto; }

/* Header */
.aic-head { height:52px; background:#0B1929; color:#fff;
  display:flex; align-items:center; padding:0 var(--space-4, 16px);
  flex-shrink:0; border-bottom:1px solid rgba(255,255,255,0.06); }
.aic-head-title { font-family:'Syne',sans-serif; font-size:15px; font-weight:700;
  flex:1; letter-spacing:0.3px; display:inline-flex; align-items:center; gap:8px; }
.aic-head-title .aic-head-status { width:7px; height:7px; border-radius:50%;
  background:#34D399; box-shadow:0 0 0 3px rgba(16,185,129,0.15); }
.aic-quota-badge { font-size:9px; font-weight:600; color:#94A3B8;
  font-family:'DM Sans',monospace; padding:2px 8px;
  background:rgba(255,255,255,0.05); border-radius:10px; margin-right:8px; }
.aic-quota-badge.warn { color:#F59E0B; background:rgba(245,158,11,0.12); }
.aic-quota-badge.full { color:#F87171; background:rgba(220,38,38,0.15); }
.aic-head-close { background:none; border:none; color:#94A3B8; cursor:pointer;
  padding:6px; border-radius:6px; display:flex; align-items:center;
  transition:all var(--duration-fast, .12s) ease; }
.aic-head-close:hover { color:#fff; background:rgba(255,255,255,0.1); }

/* Quick action buttons */
.aic-quick { display:flex; gap:6px; padding:8px var(--space-3, 12px); flex-wrap:wrap;
  border-bottom:1px solid rgba(255,255,255,0.06); }
.aic-qbtn { padding:5px 11px; border-radius:14px; border:1px solid rgba(255,255,255,0.10);
  background:rgba(255,255,255,0.04); color:#94A3B8; font-size:11px; font-weight:600;
  cursor:pointer; transition:all var(--duration-fast, .15s) ease; white-space:nowrap; }
.aic-qbtn:hover { background:rgba(56,189,248,0.12); color:#38BDF8; border-color:rgba(56,189,248,0.3); }

/* Messages */
.aic-msgs { flex:1; overflow-y:auto; padding:var(--space-3, 12px); display:flex;
  flex-direction:column; gap:8px;
  scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.08) transparent; }
.aic-msgs::-webkit-scrollbar { width:6px; }
.aic-msgs::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:3px; }
.aic-msg { max-width:88%; padding:9px 13px; border-radius:12px; font-size:13px;
  line-height:1.5; word-wrap:break-word; white-space:pre-wrap;
  animation:aic-msg-in 0.18s var(--ease-out, ease); }
@keyframes aic-msg-in { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
.aic-msg.user { align-self:flex-end; background:var(--accent, #0284C7); color:#fff; border-bottom-right-radius:4px; }
.aic-msg.asst { align-self:flex-start; background:rgba(255,255,255,0.04); color:#E2E8F0;
  border-bottom-left-radius:4px; border:1px solid rgba(255,255,255,0.04); }
.aic-msg.asst .tool-badge { display:inline-flex; align-items:center; gap:5px;
  background:rgba(56,189,248,0.12); color:#38BDF8;
  font-size:11px; font-weight:600; padding:3px 9px; border-radius:6px;
  font-family:inherit; }
.aic-msg.typing { background:rgba(255,255,255,0.04); color:#94A3B8;
  font-style:italic; align-self:flex-start; }

/* Input bar */
.aic-input-bar { display:flex; align-items:center;
  border-top:1px solid rgba(255,255,255,0.06);
  padding:10px var(--space-3, 12px); gap:8px; flex-shrink:0;
  background:rgba(0,0,0,0.15); }
.aic-input { flex:1; border:1px solid rgba(255,255,255,0.10); border-radius:10px;
  padding:10px 14px; font-size:13px; font-family:'DM Sans',sans-serif;
  outline:none; background:rgba(255,255,255,0.04); color:#E2E8F0; resize:none;
  max-height:80px; overflow-y:auto;
  transition:border-color var(--duration-fast, .15s) ease, box-shadow var(--duration-fast, .15s) ease; }
.aic-input::placeholder { color:#64748B; }
.aic-input:focus { border-color:#38BDF8; box-shadow:0 0 0 3px rgba(56,189,248,0.15); }
.aic-send { width:36px; height:36px; border-radius:50%; border:none;
  background:var(--accent, #0284C7); color:#fff; cursor:pointer;
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
  transition:all var(--duration-fast, .15s) ease; }
.aic-send:hover { background:var(--accent-hover, #0369A1); transform:scale(1.05); }
.aic-send:disabled { opacity:0.4; cursor:not-allowed; transform:none; }

/* Confirmation modal for destructive tools */
.aic-confirm-overlay {
  position:fixed; inset:0; z-index:1000;
  background:rgba(0,0,0,0.55);
  display:flex; align-items:center; justify-content:center;
  padding:20px;
  animation:aic-overlay-in 0.15s var(--ease-out, ease);
}
@keyframes aic-overlay-in { from { opacity:0; } to { opacity:1; } }
.aic-confirm-card {
  background:#0F1C2F; color:#E2E8F0;
  border:1px solid rgba(255,255,255,0.08);
  border-radius:var(--radius-lg, 12px);
  width:100%; max-width:440px;
  box-shadow:0 24px 60px rgba(0,0,0,0.5);
  overflow:hidden;
  animation:aic-card-in 0.2s var(--ease-out, ease);
}
@keyframes aic-card-in { from { opacity:0; transform:translateY(8px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
.aic-confirm-head {
  display:flex; align-items:center; gap:10px;
  padding:16px var(--space-4, 16px);
  border-bottom:1px solid rgba(255,255,255,0.06);
}
.aic-confirm-icon { color:#F59E0B; display:inline-flex; }
.aic-confirm-title { font-family:'Syne',sans-serif; font-size:14px;
  font-weight:700; letter-spacing:0.3px; }
.aic-confirm-body {
  padding:var(--space-4, 16px);
  font-size:12px; line-height:1.6;
  display:flex; flex-direction:column; gap:5px;
}
.aic-confirm-body strong { color:#94A3B8; font-weight:600; min-width:90px; display:inline-block; }
.aic-confirm-foot {
  display:flex; gap:10px; justify-content:flex-end;
  padding:12px var(--space-4, 16px);
  border-top:1px solid rgba(255,255,255,0.06);
  background:rgba(0,0,0,0.15);
}
.aic-confirm-foot button {
  padding:7px 16px; border-radius:6px;
  font-size:12px; font-weight:700; cursor:pointer;
  transition:all var(--duration-fast, .12s) ease;
  font-family:inherit;
  letter-spacing:0.2px;
}
.aic-confirm-cancel {
  background:rgba(255,255,255,0.04); color:#94A3B8;
  border:1px solid rgba(255,255,255,0.08);
}
.aic-confirm-cancel:hover { background:rgba(255,255,255,0.08); color:#E2E8F0; }
.aic-confirm-ok {
  background:#38BDF8; color:#0B1929;
  border:1px solid #38BDF8;
}
.aic-confirm-ok:hover { background:#7DD3FC; }

@media (prefers-reduced-motion: reduce) {
  .aic-msg, .aic-confirm-overlay, .aic-confirm-card { animation:none; }
}
`;
  document.head.appendChild(s);
})();

/* ── TOOL DEFINITIONS ──────────────────────────────────────── */
const AIC_TOOLS = [
  {
    name: 'read_orders',
    description: 'Search international or national orders. Returns key fields: client, goods, pallets, temp, status, dates.',
    input_schema: {
      type:'object',
      properties: {
        type: { type:'string', enum:['international','national'], description:'Order type' },
        filter: { type:'string', description:'Airtable filterByFormula (optional)' },
        limit: { type:'number', description:'Max records (default 10)' }
      },
      required:['type']
    }
  },
  {
    name: 'read_fleet',
    description: 'Query trucks or trailers — returns plate, brand, model, expiry dates, active status.',
    input_schema: {
      type:'object',
      properties: {
        asset_type: { type:'string', enum:['trucks','trailers'], description:'Fleet asset type' },
        filter: { type:'string', description:'Airtable filterByFormula (optional)' }
      },
      required:['asset_type']
    }
  },
  {
    name: 'create_work_order',
    description: 'Create a maintenance work order / request.',
    input_schema: {
      type:'object',
      properties: {
        vehicle_plate: { type:'string', description:'License plate' },
        description: { type:'string', description:'Work description' },
        priority: { type:'string', enum:['SOS','Άμεσα','Κανονικό'], description:'Priority level' },
        notes: { type:'string', description:'Additional notes (optional)' }
      },
      required:['vehicle_plate','description','priority']
    }
  },
  {
    name: 'update_record',
    description: 'Update fields on an existing Airtable record. Always confirm with user before calling.',
    input_schema: {
      type:'object',
      properties: {
        table: { type:'string', enum:['orders','national_orders','trucks','trailers','maintenance_requests'], description:'Table name' },
        record_id: { type:'string', description:'Airtable record ID (recXXX)' },
        fields: { type:'object', description:'Key-value pairs to update' }
      },
      required:['table','record_id','fields']
    }
  },
  {
    name: 'navigate_to',
    description: 'Navigate the TMS app to a specific page.',
    input_schema: {
      type:'object',
      properties: {
        page: { type:'string', enum:['dashboard','weekly_intl','weekly_natl','weekly_pickups','daily_ramp','orders_intl','orders_natl','maint_req','maint_expiry','locations','clients','partners','trucks','trailers','drivers'], description:'Page ID to navigate to' }
      },
      required:['page']
    }
  },
  {
    name: 'save_profile',
    description: 'Save user profile after onboarding interview. Call this after collecting all answers.',
    input_schema: {
      type:'object',
      properties: {
        role_description: { type:'string', description:'User role and responsibilities' },
        morning_routine: { type:'string', description:'What they check first each morning' },
        focus_clients: { type:'array', items:{type:'string'}, description:'Key clients they care about' },
        focus_routes: { type:'array', items:{type:'string'}, description:'Key routes/corridors' },
        pain_points: { type:'array', items:{type:'string'}, description:'Common problems they face' },
        detail_level: { type:'string', enum:['brief','detailed'], description:'Preferred notification detail' },
        daily_must_do: { type:'array', items:{type:'string'}, description:'Daily mandatory tasks' },
        reminders: { type:'array', items:{type:'string'}, description:'Things to remind about' }
      },
      required:['role_description']
    }
  },
  {
    name: 'set_reminder',
    description: 'Set a reminder for the user. Shows as notification next time they open TMS.',
    input_schema: {
      type:'object',
      properties: {
        text: { type:'string', description:'Reminder text' },
        due_date: { type:'string', description:'When to show (YYYY-MM-DD). Use today for immediate.' }
      },
      required:['text','due_date']
    }
  },
  {
    name: 'read_page_context',
    description: 'Get a summary of what data is loaded on the current TMS page, plus user profile and pending notifications.',
    input_schema: { type:'object', properties:{} }
  }
];

/* ── TOOL EXECUTION ────────────────────────────────────────── */
const _TABLE_MAP = {
  orders: 'ORDERS', national_orders: 'NAT_ORDERS', trucks: 'TRUCKS',
  trailers: 'TRAILERS', maintenance_requests: 'MAINT_REQ'
};

/* ── DESTRUCTIVE-ACTION CONFIRMATION MODAL ───────────────── */
function _aicConfirmDestructive(toolName, input) {
  return new Promise(resolve => {
    // Build human-readable preview of what will happen
    let title = '', preview = '';
    if (toolName === 'create_work_order') {
      title = 'Δημιουργία Work Order;';
      preview = `<div><strong>Όχημα:</strong> ${_aicEscape(input.vehicle_plate || '?')}</div>`
              + `<div><strong>Priority:</strong> <span style="padding:2px 8px;border-radius:4px;background:rgba(245,158,11,.15);color:#F59E0B">${_aicEscape(input.priority || '?')}</span></div>`
              + `<div><strong>Description:</strong> ${_aicEscape(input.description || '')}</div>`
              + (input.notes ? `<div><strong>Notes:</strong> ${_aicEscape(input.notes)}</div>` : '');
    } else if (toolName === 'update_record') {
      title = 'Ενημέρωση record;';
      preview = `<div><strong>Table:</strong> ${_aicEscape(input.table || '?')}</div>`
              + `<div><strong>Record:</strong> <code style="font-family:'DM Sans',monospace;font-size:11px;background:rgba(0,0,0,.2);padding:1px 5px;border-radius:3px">${_aicEscape(input.record_id || '?')}</code></div>`
              + `<div style="margin-top:8px"><strong>Fields:</strong></div>`
              + `<pre style="margin:4px 0 0;padding:8px;background:rgba(0,0,0,.2);border-radius:4px;font-size:11px;max-height:120px;overflow:auto">${_aicEscape(JSON.stringify(input.fields || {}, null, 2))}</pre>`;
    } else {
      title = 'Επιβεβαίωση ενέργειας;';
      preview = `<pre style="margin:0;padding:8px;background:rgba(0,0,0,.2);border-radius:4px;font-size:11px;max-height:160px;overflow:auto">${_aicEscape(JSON.stringify(input, null, 2))}</pre>`;
    }

    // Inject overlay
    const overlay = document.createElement('div');
    overlay.className = 'aic-confirm-overlay';
    overlay.innerHTML = `
      <div class="aic-confirm-card">
        <div class="aic-confirm-head">
          <span class="aic-confirm-icon">${typeof icon === 'function' ? icon('alert_triangle', 18) : '⚠'}</span>
          <span class="aic-confirm-title">${title}</span>
        </div>
        <div class="aic-confirm-body">${preview}</div>
        <div class="aic-confirm-foot">
          <button class="aic-confirm-cancel">Ακύρωση</button>
          <button class="aic-confirm-ok">Επιβεβαίωση</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('.aic-confirm-cancel').onclick = () => cleanup(false);
    overlay.querySelector('.aic-confirm-ok').onclick = () => cleanup(true);
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    // Esc to cancel
    const escHandler = (e) => { if (e.key === 'Escape') { cleanup(false); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);
  });
}

async function _aicExecTool(name, input) {
  // Destructive-action gate: ask user before mutating data
  if (_DESTRUCTIVE_TOOLS.has(name)) {
    const ok = await _aicConfirmDestructive(name, input);
    if (!ok) return { error: 'Cancelled by user — no changes made.', cancelled: true };
  }
  try {
    switch(name) {
      case 'read_orders': {
        const tid = input.type === 'international' ? TABLES.ORDERS : TABLES.NAT_ORDERS;
        const opts = {};
        if (input.filter) opts.filterByFormula = input.filter;
        const recs = await atGetAll(tid, opts, true);
        const lim = input.limit || 10;
        return recs.slice(0, lim).map(r => {
          const f = r.fields;
          return { id: r.id, client: f['Client Name'] || f['Client'] || '', goods: f['Goods'] || '', pallets: f['Pallets'] || f['Total Pallets'] || '', status: f['Status'] || '', direction: f['Direction'] || '' };
        });
      }
      case 'read_fleet': {
        const tid = input.asset_type === 'trucks' ? TABLES.TRUCKS : TABLES.TRAILERS;
        const opts = {};
        if (input.filter) opts.filterByFormula = input.filter;
        const recs = await atGetAll(tid, opts, true);
        return recs.map(r => {
          const f = r.fields;
          const obj = { id: r.id, plate: f['License Plate'] || '', brand: f['Brand'] || '', model: f['Model'] || '', active: !!f['Active'] };
          if (input.asset_type === 'trucks') {
            obj.kteo = f['KTEO Expiry'] || null;
            obj.kek = f['KEK Expiry'] || null;
            obj.insurance = f['Insurance Expiry'] || null;
          } else {
            obj.kteo = f['KTEO Expiry'] || null;
            obj.frc = f['FRC Expiry'] || null;
            obj.insurance = f['Insurance Expiry'] || null;
          }
          return obj;
        });
      }
      case 'create_work_order': {
        const fields = {
          'Vehicle Plate': input.vehicle_plate,
          'Description': input.description,
          'Priority': input.priority,
          'Status': 'Pending',
          'Date Reported': localToday(),
        };
        if (input.notes) fields['Notes'] = input.notes;
        const created = await atCreate(TABLES.MAINT_REQ, fields);
        toast('Work order created!', 'success');
        return { success: true, id: created.id };
      }
      case 'update_record': {
        const tKey = _TABLE_MAP[input.table];
        if (!tKey || !TABLES[tKey]) return { error: 'Unknown table: ' + input.table };
        await atPatch(TABLES[tKey], input.record_id, input.fields);
        toast('Record updated', 'success');
        return { success: true };
      }
      case 'navigate_to': {
        navigate(input.page);
        return { success: true, navigated_to: input.page };
      }
      case 'save_profile': {
        _nakisSaveProfile(input);
        toast('Profile saved!', 'success');
        return { success: true, message: 'Profile saved. I will now personalize suggestions based on this profile.' };
      }
      case 'set_reminder': {
        const notifs = _nakisGetNotifs();
        notifs.push({
          id: 'rem_' + Date.now(),
          text: input.text,
          due_date: input.due_date,
          type: 'reminder',
          severity: 'info',
          created: localToday(),
          dismissed: false
        });
        _nakisSaveNotifs(notifs);
        toast('Reminder set!', 'success');
        return { success: true, reminder: input.text, due: input.due_date };
      }
      case 'read_page_context': {
        const profile = _nakisGetProfile();
        const notifs = _nakisGetNotifs().filter(n => !n.dismissed && n.due_date <= localToday());
        return {
          page: typeof currentPage !== 'undefined' ? currentPage : 'unknown',
          context: _aicPageContext(),
          profile: profile || 'No profile — interview needed',
          pending_notifications: notifs.length ? notifs : 'None'
        };
      }
      default: return { error: 'Unknown tool: ' + name };
    }
  } catch(e) {
    return { error: e.message };
  }
}

/* ── ROLE PROFILES ─────────────────────────────────────────── */
const AIC_PROFILES = {
  owner: {
    tools: ['read_orders','read_fleet','create_work_order','update_record','navigate_to','save_profile','set_reminder','read_page_context'],
  },
  dispatcher: {
    tools: ['read_orders','read_fleet','create_work_order','navigate_to','save_profile','set_reminder','read_page_context'],
  },
  management: {
    tools: ['read_fleet','create_work_order','update_record','navigate_to','save_profile','set_reminder','read_page_context'],
  },
  accountant: {
    tools: ['read_orders','read_fleet','navigate_to','save_profile','set_reminder','read_page_context'],
  }
};

/* ── APP KNOWLEDGE BASE ────────────────────────────────────── */
const APP_KNOWLEDGE = `
You are Nakis, the AI assistant for Petras Group TMS. You help users learn and use the app.

## App Pages & How to Use Them:

### Dashboard
- Shows overview KPIs: fleet usage, dead km, on-time delivery, weekly score
- KPI cards are clickable — click "Unassigned Exports" to jump to orders
- Weekly Score: 0-100 based on assignment, on-time, compliance, empty legs

### International Orders (ORDERS menu)
- Create: Click "+ New Order" → fill Direction (Export/Import), Client, Loading/Delivery locations, dates, pallets, goods, temperature
- Required: Direction, Client, Loading Date, Delivery Date, at least 1 location
- Edit: Click any row → edit form opens
- Veroia Switch: Toggle ON to auto-create National Order for cross-dock at Veroia
- Search: Type in search bar to filter by client, location, goods
- Period: Use "Last 60 days / 6 months / All" dropdown to see older orders

### National Orders (ORDERS menu)
- Auto-created by Veroia Switch OR created manually
- National Groupage: Toggle ON to create Groupage Lines for consolidation
- Direction: South→North (ΑΝΟΔΟΣ) = supplier to Veroia, North→South (ΚΑΘΟΔΟΣ) = Veroia to client

### Weekly International (PLANNING menu)
- Shows exports (left), assignment (center), imports (right) for selected week
- Assign truck: Right-click export row → select truck/driver/trailer from popover
- Match import: Drag import card from right column → drop on export row
- Auto-Match: Click "Auto Match" to let AI suggest import/export pairs based on distance and dates
- Print: Click "Print Week" for PDF export
- Navigate weeks: Click week pills at top (W13, W14, W15...)

### Weekly National (PLANNING menu)
- Shows ΚΑΘΟΔΟΣ (left), ΑΝΑΘΕΣΗ (center), ΑΝΟΔΟΣ (right)
- Assign: Right-click → select truck/driver
- Context menu: Right-click for more options (unassign, split, print)

### Daily Ramp Board (PLANNING menu)
- Shows today's warehouse operations at Veroia
- Inbound (left): incoming deliveries — click "Done" when unloaded
- Outbound (right): outgoing shipments
- Postpone: Click "Postpone" to move to tomorrow
- Time: Set arrival/departure time from dropdown
- Auto-syncs from Orders — no need to create manually

### Daily Ops Plan (PLANNING menu)
- Today/Tomorrow view of all international operations
- Status flow: Pending → Assigned → In Transit → Delivered → Invoiced
- Checklists: Docs Ready, Temp OK, CMR Photo, Client Notified, Driver Notified
- Overdue banner shows orders past delivery date

### My Performance (HR menu)
- Personalized KPIs based on your role
- Weekly Score trend (last 4 weeks)
- Nakis Feedback: AI-generated weekly assessment
- Goals: Set and track personal targets

### Master Data (various menus)
- Clients, Partners, Drivers, Trucks, Trailers, Locations
- Click "+ New" to add, click row to edit
- Trucks/Trailers: track KTEO, Insurance, ATP expiry dates

## Key Concepts:
- **Veroia Switch**: Cross-docking at Veroia warehouse. Export goods arrive, get consolidated, then go to national delivery.
- **ΑΝΟΔΟΣ (Anodos)**: South→North direction (supplier → Veroia)
- **ΚΑΘΟΔΟΣ (Kathodos)**: North→South direction (Veroia → client)
- **Groupage**: Consolidating multiple small shipments into one truck
- **Wednesday Cutoff**: Export orders must be confirmed by Wednesday for weekend delivery
- **Dead Kilometers**: Distance truck drives empty between delivery and next pickup

## Common Questions:
- "How do I assign a truck?" → Go to Weekly International, right-click the order row, select truck from popover
- "How do I match import/export?" → Drag the import card and drop it on the export row
- "What does the red pill mean?" → Unassigned order (no truck allocated yet)
- "How do I postpone a ramp entry?" → Click "Postpone" button on the ramp row
- "How do I see older orders?" → Change the Period dropdown from "Last 60 days" to "All time"
`;

const _PAGE_HELP_NAMES = {
  dashboard: 'Dashboard',
  weekly_intl: 'Weekly International',
  weekly_natl: 'Weekly National',
  weekly_pickups: 'National Pick Ups',
  daily_ramp: 'Daily Ramp Board',
  daily_ops: 'Daily Ops Plan',
  orders_intl: 'International Orders',
  orders_natl: 'National Orders',
  invoicing: 'Invoicing',
  locations: 'Locations',
  clients: 'Clients',
  partners: 'Partners',
  pallet_ledger: 'Pallet Ledger',
  trucks: 'Trucks',
  trailers: 'Trailers',
  workshops: 'Workshops',
  drivers: 'Drivers',
  payroll: 'Driver Payroll',
  maint_dash: 'Maintenance Dashboard',     // FIX: was 'maint_dashboard'
  maint_expiry: 'Expiry Alerts',
  maint_req: 'Maintenance Requests',
  maint_svc: 'Service Records',
  maint_trucks: 'Trucks History',
  maint_trailers: 'Trailers History',
  ceo_dashboard: 'CEO Dashboard',
  performance: 'My Performance',           // FIX: was 'my_performance'
  settings: 'Settings',
  trash: 'Trash',
  error_log: 'Error Log',
  metrics_audit: 'Metrics Audit',
};

/* ── SYSTEM PROMPT ─────────────────────────────────────────── */
function _aicSystemPrompt() {
  const role = typeof ROLE !== 'undefined' ? ROLE : 'owner';
  const page = typeof currentPage !== 'undefined' ? currentPage : 'dashboard';
  const week = typeof currentWeekNumber === 'function' ? currentWeekNumber() : '?';
  const userName = typeof user !== 'undefined' ? (user.name || 'User') : 'User';
  const profile = _nakisGetProfile();
  const notifs = _nakisGetNotifs().filter(n => !n.dismissed && n.due_date <= localToday());
  const pageCtx = _aicPageContext();

  const interviewBlock = !profile ? `
ΣΗΜΑΝΤΙΚΟ: Δεν υπάρχει profile για αυτόν τον χρήστη. ΠΡΕΠΕΙ να κάνεις onboarding interview.
Πες: "Γεια σου, είμαι ο Νάκης, ο ψηφιακός βοηθός της Petras Group! Για να σε βοηθάω καλύτερα, θέλω να σε γνωρίσω λίγο."
Μετά ρώτα ΜΙΑ-ΜΙΑ τις ερωτήσεις (περίμενε απάντηση πριν τη next):
1. Ποιος είσαι και ποιος ο ρόλος σου στην εταιρεία;
2. Τι κοιτάς πρώτο κάθε πρωί στο TMS;
3. Ποιοι πελάτες ή δρομολόγια σε αφορούν περισσότερο;
4. Τι πηγαίνει συχνά στραβά στη δουλειά σου;
5. Πόσο λεπτομερείς θες τις ειδοποιήσεις; (σύντομο/αναλυτικό)
6. Ποια tasks ΠΡΕΠΕΙ να γίνουν καθημερινά χωρίς εξαίρεση;
7. Τι θα ήθελες να σου υπενθυμίζω;
Αφού μαζέψεις ΟΛΕΣ τις απαντήσεις, κάλεσε save_profile με τα δεδομένα.
Μετά το save πες: "Τέλεια, τώρα σε γνωρίζω! Από εδώ και πέρα θα σου δίνω εξατομικευμένες συμβουλές."` :
  `USER PROFILE:
${JSON.stringify(profile, null, 1)}`;

  // Budget caps to prevent prompt bloat over time
  const trimmedAppKnowledge = APP_KNOWLEDGE.length > _MAX_APP_KNOWLEDGE_CHARS
    ? APP_KNOWLEDGE.slice(0, _MAX_APP_KNOWLEDGE_CHARS) + '\n…(truncated for brevity)'
    : APP_KNOWLEDGE;
  const trimmedPageCtx = pageCtx.length > _MAX_PAGE_CTX_CHARS
    ? pageCtx.slice(0, _MAX_PAGE_CTX_CHARS) + '\n…(truncated)'
    : pageCtx;
  // Cap notifications: max 5 entries
  const cappedNotifs = (notifs || []).slice(0, 5);

  return `Είσαι ο Νάκης, ο ψηφιακός βοηθός της Petras Group — εταιρεία ψυγειομεταφορών (Ελλάδα ↔ Κεντρική/Ανατολική Ευρώπη).
Μιλάς Ελληνικά. Είσαι σύντομος, πρακτικός, φιλικός αλλά χωρίς φλυαρίες.

${interviewBlock}

ΤΡΕΧΟΝ CONTEXT:
- Χρήστης: ${userName}, Ρόλος: ${role}
- Σελίδα: ${page} (${_PAGE_HELP_NAMES[page] || page})
- Ημερομηνία: ${localToday()}, Εβδομάδα: W${week}

APP TRAINING GUIDE:
${trimmedAppKnowledge}

ΔΕΔΟΜΕΝΑ ΣΕΛΙΔΑΣ:
${trimmedPageCtx}

${cappedNotifs.length ? `ΕΚΚΡΕΜΕΙΣ ΥΠΕΝΘΥΜΙΣΕΙΣ:\n${cappedNotifs.map(n => '- ' + n.text + (n.due_date ? ' (λήξη: ' + n.due_date + ')' : '')).join('\n')}${notifs.length > 5 ? `\n(+${notifs.length - 5} more)` : ''}` : ''}

ΚΑΝΟΝΕΣ ΣΥΜΠΕΡΙΦΟΡΑΣ:
${profile ? `- Ξεκίνα ΠΑΝΤΑ με 1-2 ΣΥΓΚΕΚΡΙΜΕΝΕΣ παρατηρήσεις βάσει δεδομένων σελίδας
- Δώσε προτεραιότητα: ${(profile.pain_points || []).join(', ') || 'general'}
- Focus πελάτες: ${(profile.focus_clients || []).join(', ') || 'all'}
- Επίπεδο λεπτομέρειας: ${profile.detail_level || 'brief'}
- Daily must-do: ${(profile.daily_must_do || []).join(', ') || 'none set'}
- Αν ο χρήστης πει "ξανα-γνώρισέ με" → ξεκίνα νέο interview` : ''}
- Αν ρωτήσουν "How do I use this page?" ή "πώς λειτουργεί αυτή η σελίδα", χρησιμοποίησε το APP TRAINING GUIDE για να δώσεις οδηγίες σχετικά με τη σελίδα ${_PAGE_HELP_NAMES[page] || page}
- Αν ρωτήσουν για concepts (Veroia Switch, Groupage, ΑΝΟΔΟΣ κλπ), εξήγησε με βάση το APP TRAINING GUIDE
- ΠΑΝΤΑ επιβεβαίωσε πριν αλλάξεις data (create_work_order, update_record)
- Συνόψισε αποτελέσματα tools — ποτέ raw JSON
- ${role === 'dispatcher' ? 'Δεν έχεις πρόσβαση σε κόστη/οικονομικά.' : ''}
- ${role === 'accountant' ? 'Δεν μπορείς να δημιουργήσεις orders. Focus σε οικονομικά.' : ''}

ΣΕΛΙΔΕΣ TMS: dashboard, weekly_intl, weekly_natl, weekly_pickups, daily_ramp, orders_intl, orders_natl, maint_req, maint_expiry, locations, clients, partners, trucks, trailers, drivers.`;
}

function _aicAllowedTools() {
  const role = typeof ROLE !== 'undefined' ? ROLE : 'owner';
  const profile = AIC_PROFILES[role] || AIC_PROFILES.owner;
  return AIC_TOOLS.filter(t => profile.tools.includes(t.name));
}

/* ── CLAUDE API CALL (non-streaming, used inside tool loops) ── */
async function _aicCallClaude(messages) {
  AiChat.abortCtrl = new AbortController();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AiChat.abortCtrl.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTH_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: _aicSystemPrompt(),
      tools: _aicAllowedTools(),
      messages: messages
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }
  const json = await res.json();
  // Track token usage for daily quota
  if (json.usage) {
    _nakisAddTokens((json.usage.input_tokens || 0) + (json.usage.output_tokens || 0));
  }
  return json;
}

/* ── CLAUDE API STREAMING (used for the final user-visible response) ── */
async function _aicCallClaudeStream(messages, onTextDelta) {
  AiChat.abortCtrl = new AbortController();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AiChat.abortCtrl.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTH_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: _aicSystemPrompt(),
      tools: _aicAllowedTools(),
      messages: messages,
      stream: true
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  const toolUses = [];
  let currentToolJson = '';
  let currentToolBlock = null;
  let stopReason = null;
  const usage = { input_tokens: 0, output_tokens: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      let evt;
      try { evt = JSON.parse(data); } catch { continue; }
      if (evt.type === 'message_start' && evt.message?.usage) {
        usage.input_tokens = evt.message.usage.input_tokens || 0;
      } else if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
        currentToolBlock = { type: 'tool_use', id: evt.content_block.id, name: evt.content_block.name, input: {} };
        currentToolJson = '';
      } else if (evt.type === 'content_block_delta') {
        if (evt.delta?.type === 'text_delta') {
          fullText += evt.delta.text;
          if (onTextDelta) onTextDelta(fullText);
        } else if (evt.delta?.type === 'input_json_delta' && currentToolBlock) {
          currentToolJson += evt.delta.partial_json || '';
        }
      } else if (evt.type === 'content_block_stop') {
        if (currentToolBlock) {
          try { currentToolBlock.input = JSON.parse(currentToolJson || '{}'); }
          catch { currentToolBlock.input = {}; }
          toolUses.push(currentToolBlock);
          currentToolBlock = null;
          currentToolJson = '';
        }
      } else if (evt.type === 'message_delta') {
        if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
        if (evt.usage?.output_tokens) usage.output_tokens = evt.usage.output_tokens;
      }
    }
  }

  // Build pseudo-response shape compatible with non-streaming flow
  const content = [];
  if (fullText) content.push({ type: 'text', text: fullText });
  toolUses.forEach(tu => content.push(tu));

  // Track token usage for daily quota
  _nakisAddTokens((usage.input_tokens || 0) + (usage.output_tokens || 0));

  return { content, stop_reason: stopReason || (toolUses.length ? 'tool_use' : 'end_turn'), usage };
}

/* ── SEND MESSAGE ──────────────────────────────────────────── */
async function _aicSend() {
  const inp = document.getElementById('aic-input');
  const text = inp.value.trim();
  if (!text || AiChat.isLoading) return;
  inp.value = '';

  // Re-interview trigger
  if (text.includes('ξανα-γνώρισέ') || text.includes('ξαναγνωρισε') || text.includes('reset profile')) {
    localStorage.removeItem(_nakisProfileKey());
    AiChat.messages = [];
    _aicRenderMsgs();
    toast('Profile reset — starting interview');
    _aicToggle(); // close
    setTimeout(() => _aicToggle(), 300); // reopen → triggers interview
    return;
  }

  // Daily quota check
  if (!_nakisQuotaOk()) {
    AiChat.messages.push({ role: 'user', content: text });
    AiChat.messages.push({
      role: 'assistant',
      content: `⚠ Έφτασες το ημερήσιο όριο tokens (${_DAILY_TOKEN_LIMIT.toLocaleString()}). Δοκίμασε ξανά αύριο.`
    });
    _aicRenderMsgs();
    _aicSaveHistory();
    return;
  }

  // Add user message
  AiChat.messages.push({ role: 'user', content: text });
  _aicRenderMsgs();
  _aicSetLoading(true);

  try {
    // Build API messages from history (string-only for safety)
    let apiMsgs = AiChat.messages
      .filter(m => typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content }));

    let maxLoops = 5;
    while (maxLoops-- > 0) {
      // Allocate a placeholder assistant message that the stream fills incrementally
      const idx = AiChat.messages.length;
      AiChat.messages.push({ role: 'assistant', content: '' });
      _aicRenderMsgs();

      // STREAM this round-trip (text deltas appear progressively)
      const response = await _aicCallClaudeStream(apiMsgs, (partialText) => {
        AiChat.messages[idx].content = partialText;
        _aicRenderMsgs();
      });

      const streamedText = response.content.find(b => b.type === 'text')?.text || '';
      if (streamedText) {
        AiChat.messages[idx].content = streamedText;
      } else {
        // No text in this turn (pure tool_use) — drop the empty placeholder
        AiChat.messages.splice(idx, 1);
      }

      // Done if model didn't call more tools
      if (response.stop_reason !== 'tool_use') break;

      // Execute tool calls and feed results back into next loop iteration
      const toolBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];
      for (const tb of toolBlocks) {
        _aicShowToolBadge(tb.name);
        const result = await _aicExecTool(tb.name, tb.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tb.id,
          content: JSON.stringify(result).substring(0, 4000)
        });
      }

      // Append assistant-with-tools turn + user tool_result turn for next API call
      apiMsgs.push({ role: 'assistant', content: response.content });
      apiMsgs.push({ role: 'user', content: toolResults });
    }
  } catch(e) {
    if (e.name === 'AbortError') return;
    AiChat.messages.push({ role: 'assistant', content: '⚠ Error: ' + e.message });
  }

  _aicSetLoading(false);
  _aicRenderMsgs();
  _aicSaveHistory();
}

function _aicShowToolBadge(toolName) {
  const labels = {
    read_orders: 'Reading orders',
    read_fleet: 'Reading fleet',
    create_work_order: 'Creating work order',
    update_record: 'Updating record',
    navigate_to: 'Navigating',
    save_profile: 'Saving profile',
    set_reminder: 'Setting reminder',
    read_page_context: 'Reading page context',
  };
  const iconMap = {
    read_orders: 'file_text',
    read_fleet: 'truck',
    create_work_order: 'plus',
    update_record: 'edit',
    navigate_to: 'arrow_up_right',
    save_profile: 'user_check',
    set_reminder: 'bell',
    read_page_context: 'info',
  };
  const msgs = document.getElementById('aic-msgs');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'aic-msg asst';
  const ic = (typeof icon === 'function') ? icon(iconMap[toolName] || 'tool', 11) : '';
  div.innerHTML = `<span class="tool-badge">${ic} ${labels[toolName] || toolName}…</span>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

/* ── LOCAL OBSERVER ────────────────────────────────────────── */
function _canSee(section) {
  const role = typeof ROLE !== 'undefined' ? ROLE : 'owner';
  const p = PERMS[role] || PERMS.owner;
  return p[section] && p[section] !== 'none';
}

async function _aicRunObserver() {
  // Check cache (10 min)
  if (AiChat._obsCache && Date.now() - AiChat._obsCacheTs < 600000) {
    AiChat.suggestions = AiChat._obsCache;
    return;
  }

  const alerts = [];
  try {
    // MAINTENANCE alerts — only for roles with maintenance access
    if (_canSee('maintenance')) {
      const [trucks, trailers] = await Promise.all([
        atGetAll(TABLES.TRUCKS, { fields: ['License Plate','Active','KTEO Expiry','KEK Expiry','Insurance Expiry'] }, true),
        atGetAll(TABLES.TRAILERS, { fields: ['License Plate','Active','KTEO Expiry','FRC Expiry','Insurance Expiry'] }, true),
      ]);

      for (const t of trucks) {
        if (!t.fields['Active']) continue;
        const plate = t.fields['License Plate'] || '';
        for (const [field, label] of [['KTEO Expiry','KTEO'],['KEK Expiry','KEK'],['Insurance Expiry','Insurance']]) {
          const d = t.fields[field];
          if (!d) continue;
          const days = _daysUntil(d);
          if (days !== null && days <= 30) {
            alerts.push({
              type: 'expiry', severity: days < 0 ? 'critical' : days <= 14 ? 'warning' : 'info',
              title: `${plate} — ${label}`,
              detail: days < 0 ? `Expired ${Math.abs(days)} days ago` : `Expires in ${days} days`,
              page: 'maint_expiry'
            });
          }
        }
      }

      for (const t of trailers) {
        if (!t.fields['Active']) continue;
        const plate = t.fields['License Plate'] || '';
        for (const [field, label] of [['KTEO Expiry','KTEO'],['FRC Expiry','FRC'],['Insurance Expiry','Insurance']]) {
        const d = t.fields[field];
        if (!d) continue;
        const days = _daysUntil(d);
        if (days !== null && days <= 30) {
          alerts.push({
            type: 'expiry', severity: days < 0 ? 'critical' : days <= 14 ? 'warning' : 'info',
            title: `${plate} — ${label}`,
            detail: days < 0 ? `Expired ${Math.abs(days)} days ago` : `Expires in ${days} days`,
            page: 'maint_expiry'
          });
        }
      }
    }

      // Check pending work orders (maintenance role only)
      try {
        const wos = await atGetAll(TABLES.MAINT_REQ, { fields: ['Status','Priority'] }, true);
        const sosCount = wos.filter(r => r.fields['Status'] !== 'Done' && r.fields['Priority'] === 'SOS').length;
        const pendCount = wos.filter(r => r.fields['Status'] === 'Pending').length;
        if (sosCount > 0) {
          alerts.push({ type: 'workorder', severity: 'critical', title: `${sosCount} SOS work orders`, detail: 'Require immediate attention', page: 'maint_req' });
        }
        if (pendCount > 0) {
          alerts.push({ type: 'workorder', severity: 'warning', title: `${pendCount} pending work orders`, detail: 'Awaiting action', page: 'maint_req' });
        }
      } catch(e) { logError(e, 'ai-chat maintenance alerts'); }
    } // end maintenance block

    // PLANNING alerts — only for roles with planning access
    if (_canSee('planning')) {
      try {
        // Unassigned orders — multi-tier urgency
        const in48h = toLocalDate(new Date(Date.now() + 2 * 864e5));
        const in7d = toLocalDate(new Date(Date.now() + 7 * 864e5));
        const unassigned = await atGetAll(TABLES.ORDERS, {
          filterByFormula: `AND({Type}='International',{Truck}=BLANK(),IS_AFTER({Delivery DateTime},'${localToday()}'))`,
          fields: ['Delivery Summary','Delivery DateTime','Direction']
        }, true);

        // CRITICAL: delivering in <48h
        const crit48 = unassigned.filter(r => toLocalDate(r.fields['Delivery DateTime']) <= in48h);
        if (crit48.length) {
          alerts.push({ type:'unassigned_critical', severity:'critical',
            title:`${crit48.length} unassigned — delivery <48h!`,
            detail: crit48.slice(0,3).map(r => (r.fields['Delivery Summary']||'').split('/')[0].trim().slice(0,20)).join(', '),
            page:'weekly_intl' });
        }

        // WARNING: aging >24h unassigned
        const aging = unassigned.filter(r => {
          const created = r.createdTime || '';
          return created && (Date.now() - new Date(created).getTime()) > 24 * 3600000;
        });
        const agingNon48 = aging.filter(r => toLocalDate(r.fields['Delivery DateTime']) > in48h);
        if (agingNon48.length) {
          alerts.push({ type:'unassigned_aging', severity:'warning',
            title:`${agingNon48.length} unassigned >24h`,
            detail: `${aging.length} total unassigned, oldest ${Math.round((Date.now() - new Date(aging[0]?.createdTime || '').getTime()) / 3600000)}h`,
            page:'weekly_intl' });
        }

        // INFO: empty return legs this week
        const wn = typeof currentWeekNumber === 'function' ? currentWeekNumber() : 0;
        const weekExports = unassigned.length ? [] : await atGetAll(TABLES.ORDERS, {
          filterByFormula: `AND({Type}='International',{Direction}='Export',{Week Number}=${wn},{Truck}!='')`,
          fields: ['Truck','Matched Import ID']
        }, true).catch(() => []);
        const emptyLegs = weekExports.filter(r => !r.fields['Matched Import ID']);
        if (emptyLegs.length > 2) {
          alerts.push({ type:'empty_legs', severity:'info',
            title:`${emptyLegs.length} exports χωρίς return trip`,
            detail: 'Empty leg risk — check import matching',
            page:'weekly_intl' });
        }
      } catch(e) { console.warn('Planning observer error:', e); }
    }

    // REMINDERS — check user reminders due today
    const notifs = _nakisGetNotifs();
    const today = localToday();
    const dueReminders = notifs.filter(n => !n.dismissed && n.type === 'reminder' && n.due_date <= today);
    dueReminders.forEach(n => {
      alerts.push({ type: 'reminder', severity: 'info', title: 'Υπενθύμιση', detail: n.text, page: null });
    });

    // Sort: critical first
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => (sevOrder[a.severity]||2) - (sevOrder[b.severity]||2));

  } catch(e) {
    console.warn('Observer error:', e);
  }

  AiChat.suggestions = alerts.slice(0, 8);
  AiChat._obsCache = AiChat.suggestions;
  AiChat._obsCacheTs = Date.now();
}

/* ── UI RENDER ─────────────────────────────────────────────── */
function _aicInit() {
  // Restore history (per-user key)
  try {
    const saved = sessionStorage.getItem(_nakisHistoryKey());
    if (saved) AiChat.messages = JSON.parse(saved).slice(-20);
  } catch(e) { logError(e, 'ai-chat restore history'); }

  // Inject floating button
  const btn = document.createElement('button');
  btn.className = 'aic-btn';
  btn.id = 'aic-toggle';
  btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><span class="aic-dot"></span>`;
  btn.onclick = () => _aicToggle();
  document.body.appendChild(btn);

  // Inject panel
  const panel = document.createElement('div');
  panel.className = 'aic-panel';
  panel.id = 'aic-panel';
  const closeIcon = (typeof icon === 'function') ? icon('x', 16) : '✕';
  panel.innerHTML = `
    <div class="aic-head">
      <span class="aic-head-title"><span class="aic-head-status" title="Online"></span>Νάκης</span>
      <span class="aic-quota-badge" id="aic-quota-badge" title="Daily token usage"></span>
      <button class="aic-head-close" onclick="_aicToggle()" aria-label="Close">${closeIcon}</button>
    </div>
    <div class="aic-quick" id="aic-quick">
      <button class="aic-qbtn" onclick="_aicQuick('Morning briefing')">Briefing</button>
      <button class="aic-qbtn" onclick="_aicQuick('Τι πρεπει να κανω σημερα?')">Today</button>
      <button class="aic-qbtn" onclick="_aicQuick('Ποια orders ειναι unassigned?')">Unassigned</button>
      <button class="aic-qbtn" onclick="_aicQuick('Fleet status - τι ληγει?')">Fleet</button>
      <button class="aic-qbtn" onclick="_aicQuick('How do I use this page?')">Help</button>
    </div>
    <div class="aic-msgs" id="aic-msgs"></div>
    <div class="aic-input-bar">
      <textarea class="aic-input" id="aic-input" rows="1" placeholder="Ask anything…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();_aicSend()}"></textarea>
      <button class="aic-send" id="aic-send-btn" onclick="_aicSend()" aria-label="Send">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>`;
  document.body.appendChild(panel);

  // Run observer in background (feeds data to system prompt, no pinned cards)
  setTimeout(() => _aicRunObserver(), 2000);
}

async function _aicToggle() {
  AiChat.isOpen = !AiChat.isOpen;
  const panel = document.getElementById('aic-panel');
  const btn = document.getElementById('aic-toggle');

  if (AiChat.isOpen) {
    btn.style.display = 'none';
    panel.classList.add('open');
    await _aicRunObserver();
    _aicRenderMsgs();
    // Contextual greeting or interview start
    if (!AiChat.messages.length) {
      const profile = _nakisGetProfile();
      if (!profile) {
        // No profile → trigger interview via Claude
        AiChat.messages.push({ role: 'user', content: 'Γεια σου Νάκη!' });
        _aicRenderMsgs();
        _aicSetLoading(true);
        try {
          const response = await _aicCallClaude(AiChat.messages.map(m => ({role:m.role, content:m.content})));
          const text = response.content.filter(b=>b.type==='text').map(b=>b.text).join('');
          AiChat.messages.push({ role: 'assistant', content: text || 'Γεια σου! Είμαι ο Νάκης.' });
        } catch(e) {
          AiChat.messages.push({ role: 'assistant', content: 'Γεια σου! Είμαι ο Νάκης, ο ψηφιακός βοηθός σου. Ας γνωριστούμε — ποιος είσαι και ποιος ο ρόλος σου;' });
        }
        _aicSetLoading(false);
        _aicRenderMsgs();
        _aicSaveHistory();
      } else {
        // Has profile → morning briefing or contextual greeting
        const briefKey = 'nakis_brief_' + localToday();
        const hadBriefToday = localStorage.getItem(briefKey);
        const briefPrompt = !hadBriefToday
          ? '(MORNING BRIEFING: ο χρήστης μόλις μπήκε για πρώτη φορά σήμερα. Δώσε σύντομο morning briefing στα ελληνικά: 1) Πόσα unassigned orders υπάρχουν 2) Τι φορτώνει/παραδίδεται σήμερα 3) Urgent θέματα από τα observer data. Μέγιστο 4-5 γραμμές. Ξεκίνα με "Καλημέρα" ή "Καλό απόγευμα" ανάλογα την ώρα.)'
          : '(ο χρήστης μόλις άνοιξε τον Νάκη)';
        if (!hadBriefToday) localStorage.setItem(briefKey, '1');
        AiChat.messages.push({ role: 'user', content: briefPrompt });
        _aicRenderMsgs();
        _aicSetLoading(true);
        try {
          const response = await _aicCallClaude(AiChat.messages.map(m => ({role:m.role, content:m.content})));
          const text = response.content.filter(b=>b.type==='text').map(b=>b.text).join('');
          // Replace the fake user message with just the greeting
          AiChat.messages = [{ role: 'assistant', content: text || 'Γεια σου! Τι χρειάζεσαι;' }];
        } catch(e) {
          AiChat.messages = [{ role: 'assistant', content: 'Γεια σου! Τι μπορώ να κάνω για σένα;' }];
        }
        _aicSetLoading(false);
        _aicRenderMsgs();
        _aicSaveHistory();
      }
    }
    setTimeout(() => document.getElementById('aic-input')?.focus(), 250);
  } else {
    panel.classList.remove('open');
    btn.style.display = 'flex';
  }
}

function _aicRenderObs() {
  const container = document.getElementById('aic-obs');
  if (!container) return;
  container.innerHTML = AiChat.suggestions.map((s, i) => `
    <div class="aic-obs-card sev-${s.severity}">
      <div class="aic-obs-text">
        <div class="aic-obs-title">${s.title}</div>
        <div class="aic-obs-detail">${s.detail}</div>
      </div>
      <button class="aic-obs-dismiss" onclick="event.stopPropagation();AiChat.suggestions.splice(${i},1);_aicRenderObs();_aicUpdateDot()" title="Dismiss">✕</button>
    </div>`).join('');
}

function _aicRenderMsgs() {
  const container = document.getElementById('aic-msgs');
  if (!container) return;
  container.innerHTML = AiChat.messages.map(m => {
    if (m.role === 'user') {
      return `<div class="aic-msg user">${_aicEscape(m.content)}</div>`;
    } else {
      return `<div class="aic-msg asst">${_aicEscape(m.content)}</div>`;
    }
  }).join('');
  if (AiChat.isLoading) {
    container.innerHTML += '<div class="aic-msg typing">Thinking…</div>';
  }
  container.scrollTop = container.scrollHeight;
}

function _aicEscape(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function _aicSetLoading(v) {
  AiChat.isLoading = v;
  const btn = document.getElementById('aic-send-btn');
  if (btn) btn.disabled = v;
  _aicRenderMsgs();
  _aicUpdateQuotaBadge();
}

function _aicUpdateQuotaBadge() {
  const badge = document.getElementById('aic-quota-badge');
  if (!badge) return;
  const pct = _nakisQuotaPct();
  const used = _nakisTokensUsed();
  if (used === 0) {
    badge.textContent = '';
    badge.style.display = 'none';
    return;
  }
  badge.style.display = '';
  // Format: "12.4K / 100K"
  const usedFmt = used >= 1000 ? (used / 1000).toFixed(1) + 'K' : String(used);
  const limFmt  = (_DAILY_TOKEN_LIMIT / 1000) + 'K';
  badge.textContent = `${usedFmt}/${limFmt}`;
  badge.title = `${pct}% of daily token quota used today`;
  badge.className = 'aic-quota-badge' + (pct >= 100 ? ' full' : pct >= 80 ? ' warn' : '');
}

function _aicUpdateDot() {
  const btn = document.getElementById('aic-toggle');
  if (!btn) return;
  if (AiChat.suggestions.length > 0) {
    btn.classList.add('has-alerts');
  } else {
    btn.classList.remove('has-alerts');
  }
}

function _aicSaveHistory() {
  try {
    const toSave = AiChat.messages.slice(-20).filter(m => typeof m.content === 'string');
    sessionStorage.setItem(_nakisHistoryKey(), JSON.stringify(toSave));
  } catch(e) { logError(e, 'ai-chat save history'); }
}

function _aicQuick(text) {
  const input = document.getElementById('aic-input');
  if (input) { input.value = text; _aicSend(); }
}

/* ── INIT ON LOAD ──────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _aicInit);
} else {
  _aicInit();
}
