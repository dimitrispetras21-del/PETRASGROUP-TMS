// ═══════════════════════════════════════════════════════════════
// ΝΑΚΗΣ — Ψηφιακός Βοηθός Petras Group
// ═══════════════════════════════════════════════════════════════
'use strict';

const AiChat = {
  isOpen: false,
  messages: [],
  suggestions: [],
  isLoading: false,
  abortCtrl: null,
  _obsCache: null,
  _obsCacheTs: 0,
};

/* ── PROFILE MANAGEMENT ──────────────────────────────────── */
function _nakisProfileKey() {
  const name = typeof user !== 'undefined' ? (user.name || 'default') : 'default';
  return 'nakis_profile_' + name.replace(/\s+/g, '_');
}
function _nakisGetProfile() {
  try { return JSON.parse(localStorage.getItem(_nakisProfileKey())); } catch { return null; }
}
function _nakisSaveProfile(profile) {
  profile.interviewDate = localToday();
  localStorage.setItem(_nakisProfileKey(), JSON.stringify(profile));
}
function _nakisNotifsKey() {
  const name = typeof user !== 'undefined' ? (user.name || 'default') : 'default';
  return 'nakis_notifs_' + name.replace(/\s+/g, '_');
}
function _nakisGetNotifs() {
  try { return JSON.parse(localStorage.getItem(_nakisNotifsKey())) || []; } catch { return []; }
}
function _nakisSaveNotifs(notifs) {
  localStorage.setItem(_nakisNotifsKey(), JSON.stringify(notifs));
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
      const done = (RAMP.records || []).filter(r => r.fields['Status'] === '✅ Έγινε').length;
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

/* ── CSS INJECTION ──────────────────────────────────────────── */
(function(){
  if (document.getElementById('ai-chat-css')) return;
  const s = document.createElement('style'); s.id = 'ai-chat-css';
  s.textContent = `
/* floating button */
.aic-btn { position:fixed; bottom:24px; right:24px; z-index:950;
  width:52px; height:52px; border-radius:50%; border:none;
  background:var(--accent); color:#fff; cursor:pointer;
  box-shadow:0 4px 16px rgba(2,132,199,0.35);
  display:flex; align-items:center; justify-content:center;
  transition:all .2s ease; }
.aic-btn:hover { background:var(--accent-hover); transform:scale(1.08); }
.aic-btn .aic-dot { position:absolute; top:2px; right:2px; width:12px; height:12px;
  background:#DC2626; border-radius:50%; border:2px solid var(--bg-card);
  display:none; }
.aic-btn.has-alerts .aic-dot { display:block; }

/* panel */
.aic-panel { position:fixed; bottom:24px; right:24px; z-index:950;
  width:400px; height:580px; max-height:80vh;
  background:var(--bg-card); border-radius:16px;
  box-shadow:0 8px 40px rgba(0,0,0,0.18);
  display:flex; flex-direction:column; overflow:hidden;
  transform:scale(0.92) translateY(16px); opacity:0;
  pointer-events:none; transition:all .2s ease; }
.aic-panel.open { transform:scale(1) translateY(0); opacity:1; pointer-events:auto; }

/* header */
.aic-head { height:48px; background:#0B1929; color:#fff;
  display:flex; align-items:center; padding:0 16px; flex-shrink:0; }
.aic-head-title { font-family:'Syne',sans-serif; font-size:14px; font-weight:600; flex:1; }
.aic-head-close { background:none; border:none; color:#94A3B8; cursor:pointer;
  font-size:18px; padding:4px 8px; border-radius:6px; }
.aic-head-close:hover { color:#fff; background:rgba(255,255,255,0.1); }

/* observer suggestions */
.aic-obs { max-height:160px; overflow-y:auto; border-bottom:1px solid var(--border);
  background:linear-gradient(180deg,rgba(2,132,199,0.04),transparent); padding:8px 12px; }
.aic-obs:empty { display:none; padding:0; border:none; }
.aic-obs-card { display:flex; align-items:flex-start; gap:8px; padding:6px 8px;
  background:var(--bg); border-radius:8px; margin-bottom:4px; font-size:11px;
  line-height:1.4; border-left:3px solid var(--accent); }
.aic-obs-card.sev-critical { border-left-color:#DC2626; }
.aic-obs-card.sev-warning { border-left-color:#D97706; }
.aic-obs-card.sev-info { border-left-color:var(--accent); }
.aic-obs-card .aic-obs-text { flex:1; color:var(--text); }
.aic-obs-card .aic-obs-title { font-weight:700; font-size:11px; }
.aic-obs-card .aic-obs-detail { color:var(--text-mid); font-size:10px; margin-top:1px; }
.aic-obs-dismiss { background:none; border:none; color:var(--text-dim); cursor:pointer;
  font-size:14px; padding:0 4px; flex-shrink:0; }

/* messages */
.aic-msgs { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px; }
.aic-msg { max-width:85%; padding:10px 14px; border-radius:12px; font-size:13px;
  line-height:1.5; word-wrap:break-word; white-space:pre-wrap; }
.aic-msg.user { align-self:flex-end; background:var(--accent); color:#fff; border-bottom-right-radius:4px; }
.aic-msg.asst { align-self:flex-start; background:var(--bg); color:var(--text); border-bottom-left-radius:4px; }
.aic-msg.asst .tool-badge { display:inline-block; background:rgba(2,132,199,0.1); color:var(--accent);
  font-size:10px; font-weight:600; padding:2px 6px; border-radius:4px; margin-bottom:4px; }
.aic-msg.typing { background:var(--bg); color:var(--text-dim); font-style:italic; align-self:flex-start; }

/* input */
.aic-input-bar { display:flex; align-items:center; border-top:1px solid var(--border);
  padding:8px 12px; gap:8px; flex-shrink:0; }
.aic-input { flex:1; border:1px solid var(--border-mid); border-radius:10px;
  padding:10px 14px; font-size:13px; font-family:'DM Sans',sans-serif;
  outline:none; background:var(--bg); color:var(--text); resize:none;
  max-height:80px; overflow-y:auto; }
.aic-input:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(2,132,199,0.12); }
.aic-send { width:36px; height:36px; border-radius:50%; border:none;
  background:var(--accent); color:#fff; cursor:pointer;
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
  transition:all .15s; }
.aic-send:hover { background:var(--accent-hover); }
.aic-send:disabled { opacity:0.4; cursor:not-allowed; }
.aic-qbtn { padding:4px 10px; border-radius:12px; border:1px solid rgba(255,255,255,0.12);
  background:rgba(255,255,255,0.04); color:#94A3B8; font-size:10px; font-weight:500;
  cursor:pointer; transition:all .15s; white-space:nowrap; }
.aic-qbtn:hover { background:rgba(56,189,248,0.1); color:#38BDF8; border-color:rgba(56,189,248,0.3); }
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

async function _aicExecTool(name, input) {
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

  return `Είσαι ο Νάκης, ο ψηφιακός βοηθός της Petras Group — εταιρεία ψυγειομεταφορών (Ελλάδα ↔ Κεντρική/Ανατολική Ευρώπη).
Μιλάς Ελληνικά. Είσαι σύντομος, πρακτικός, φιλικός αλλά χωρίς φλυαρίες.

${interviewBlock}

ΤΡΕΧΟΝ CONTEXT:
- Χρήστης: ${userName}, Ρόλος: ${role}
- Σελίδα: ${page}
- Ημερομηνία: ${localToday()}, Εβδομάδα: W${week}

ΔΕΔΟΜΕΝΑ ΣΕΛΙΔΑΣ:
${pageCtx}

${notifs.length ? `ΕΚΚΡΕΜΕΙΣ ΥΠΕΝΘΥΜΙΣΕΙΣ:\n${notifs.map(n => '- ' + n.text + (n.due_date ? ' (λήξη: ' + n.due_date + ')' : '')).join('\n')}` : ''}

ΚΑΝΟΝΕΣ ΣΥΜΠΕΡΙΦΟΡΑΣ:
${profile ? `- Ξεκίνα ΠΑΝΤΑ με 1-2 ΣΥΓΚΕΚΡΙΜΕΝΕΣ παρατηρήσεις βάσει δεδομένων σελίδας
- Δώσε προτεραιότητα: ${(profile.pain_points || []).join(', ') || 'general'}
- Focus πελάτες: ${(profile.focus_clients || []).join(', ') || 'all'}
- Επίπεδο λεπτομέρειας: ${profile.detail_level || 'brief'}
- Daily must-do: ${(profile.daily_must_do || []).join(', ') || 'none set'}
- Αν ο χρήστης πει "ξανα-γνώρισέ με" → ξεκίνα νέο interview` : ''}
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

/* ── CLAUDE API CALL ───────────────────────────────────────── */
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
  return res.json();
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

  // Add user message
  AiChat.messages.push({ role: 'user', content: text });
  _aicRenderMsgs();
  _aicSetLoading(true);

  try {
    // Build API messages from history
    let apiMsgs = AiChat.messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content
    }));

    let response = await _aicCallClaude(apiMsgs);
    let maxLoops = 5;

    // Tool use loop
    while (response.stop_reason === 'tool_use' && maxLoops-- > 0) {
      const toolBlocks = response.content.filter(b => b.type === 'tool_use');
      const textBlocks = response.content.filter(b => b.type === 'text');

      // Show any text before tool calls
      if (textBlocks.length) {
        const txt = textBlocks.map(b => b.text).join('');
        if (txt.trim()) {
          AiChat.messages.push({ role: 'assistant', content: txt });
          _aicRenderMsgs();
        }
      }

      // Execute tools and collect results
      const toolResults = [];
      for (const tb of toolBlocks) {
        // Show tool badge
        _aicShowToolBadge(tb.name);
        const result = await _aicExecTool(tb.name, tb.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tb.id,
          content: JSON.stringify(result).substring(0, 4000)
        });
      }

      // Add assistant response + tool results to messages
      apiMsgs.push({ role: 'assistant', content: response.content });
      apiMsgs.push({ role: 'user', content: toolResults });

      // Get next response
      response = await _aicCallClaude(apiMsgs);
    }

    // Final text response
    const finalText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    AiChat.messages.push({ role: 'assistant', content: finalText || '(no response)' });
  } catch(e) {
    if (e.name === 'AbortError') return;
    AiChat.messages.push({ role: 'assistant', content: '⚠ Error: ' + e.message });
  }

  _aicSetLoading(false);
  _aicRenderMsgs();
  _aicSaveHistory();
}

function _aicShowToolBadge(toolName) {
  const labels = { read_orders: 'Reading orders…', read_fleet: 'Reading fleet…', create_work_order: 'Creating work order…', update_record: 'Updating record…', navigate_to: 'Navigating…' };
  const msgs = document.getElementById('aic-msgs');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'aic-msg asst';
  div.innerHTML = `<span class="tool-badge">🔧 ${labels[toolName] || toolName}</span>`;
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
          filterByFormula: `AND({Type}='International',{Direction}='Export',{ Week Number}=${wn},{Truck}!='')`,
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
  // Restore history
  try {
    const saved = sessionStorage.getItem('aic_history');
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
  panel.innerHTML = `
    <div class="aic-head">
      <span class="aic-head-title">Νάκης</span>
      <button class="aic-head-close" onclick="_aicToggle()">✕</button>
    </div>
    <div class="aic-quick" id="aic-quick" style="display:flex;gap:6px;padding:8px 12px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,0.06)">
      <button class="aic-qbtn" onclick="_aicQuick('Morning briefing')">Briefing</button>
      <button class="aic-qbtn" onclick="_aicQuick('Τι πρεπει να κανω σημερα?')">Today</button>
      <button class="aic-qbtn" onclick="_aicQuick('Ποια orders ειναι unassigned?')">Unassigned</button>
      <button class="aic-qbtn" onclick="_aicQuick('Fleet status - τι ληγει?')">Fleet</button>
    </div>
    <div class="aic-msgs" id="aic-msgs"></div>
    <div class="aic-input-bar">
      <textarea class="aic-input" id="aic-input" rows="1" placeholder="Ask anything…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();_aicSend()}"></textarea>
      <button class="aic-send" id="aic-send-btn" onclick="_aicSend()">
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
    sessionStorage.setItem('aic_history', JSON.stringify(toSave));
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
