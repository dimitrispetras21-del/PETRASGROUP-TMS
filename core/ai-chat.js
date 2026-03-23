// ═══════════════════════════════════════════════════════════════
// AI CHAT + OBSERVER — Floating TMS Assistant
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
          'Date Reported': new Date().toISOString().substring(0,10),
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
      default: return { error: 'Unknown tool: ' + name };
    }
  } catch(e) {
    return { error: e.message };
  }
}

/* ── ROLE PROFILES ─────────────────────────────────────────── */
const AIC_PROFILES = {
  owner: {
    persona: 'You are Petras, a strategic logistics copilot for the company owner.',
    focus: 'You focus on big-picture KPIs, cost efficiency, fleet utilization, and business growth. You proactively suggest optimizations and flag risks. You know the owner manages everything — planning, maintenance, costs, clients.',
    greeting: name => `Γεια σου ${name}! Είμαι ο Petras, ο AI σύμβουλός σου. Ρώτησέ με ό,τι θες για orders, fleet, maintenance ή costs.`,
    tools: ['read_orders','read_fleet','create_work_order','update_record','navigate_to'],
  },
  dispatcher: {
    persona: 'You are a dispatch assistant focused on daily operations.',
    focus: 'You help the dispatcher with order assignment, weekly planning, trip management, and load consolidation. You prioritize speed — finding orders, checking truck availability, and suggesting assignments. You don\'t discuss costs or financial data.',
    greeting: name => `Hi ${name}! I'm your dispatch assistant. Ask me about orders, truck availability, weekly planning, or say "go to weekly intl" to navigate.`,
    tools: ['read_orders','read_fleet','create_work_order','navigate_to'],
  },
  management: {
    persona: 'You are a management reporting assistant.',
    focus: 'You help management with fleet oversight, maintenance tracking, driver management, and client relations. You summarize data clearly and flag issues that need attention. You can read all data but should confirm before making changes.',
    greeting: name => `Hello ${name}! I'm your TMS assistant. I can help with fleet status, maintenance alerts, driver info, and client overview.`,
    tools: ['read_orders','read_fleet','create_work_order','update_record','navigate_to'],
  },
  accountant: {
    persona: 'You are a finance-focused TMS assistant.',
    focus: 'You help the accountant with cost tracking, fuel receipts, driver payroll data, and trip cost analysis. You focus on numbers and financial accuracy. You can read order and fleet data for reference.',
    greeting: name => `Hello ${name}! I can help you find cost data, fuel receipts, trip costs, and driver payroll information.`,
    tools: ['read_orders','read_fleet','navigate_to'],
  }
};

/* ── SYSTEM PROMPT ─────────────────────────────────────────── */
function _aicSystemPrompt() {
  const role = typeof ROLE !== 'undefined' ? ROLE : 'owner';
  const page = typeof currentPage !== 'undefined' ? currentPage : 'dashboard';
  const week = typeof currentWeekNumber === 'function' ? currentWeekNumber() : '?';
  const userName = typeof user !== 'undefined' ? (user.name || 'User') : 'User';
  const profile = AIC_PROFILES[role] || AIC_PROFILES.owner;

  return `${profile.persona}
You work for Petras Group — a cold chain transport company (Greece ↔ Central/Eastern Europe).

${profile.focus}

Current context:
- User: ${userName}, Role: ${role}
- Current page: ${page}
- Date: ${new Date().toISOString().substring(0,10)}, Week: W${week}

Rules:
- Be concise and direct. Short answers, no fluff.
- Match the user's language — Greek or English.
- ALWAYS confirm before modifying data (create_work_order, update_record).
- Summarize tool results clearly — never dump raw JSON to the user.
- ${role === 'dispatcher' ? 'You cannot access cost or financial data.' : ''}
- ${role === 'accountant' ? 'You cannot create or modify orders. Focus on financial data.' : ''}

TMS pages: dashboard, weekly_intl, weekly_natl, weekly_pickups, daily_ramp, orders_intl, orders_natl, maint_req, maint_expiry, locations, clients, partners, trucks, trailers, drivers.`;
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
async function _aicRunObserver() {
  // Check cache (10 min)
  if (AiChat._obsCache && Date.now() - AiChat._obsCacheTs < 600000) {
    AiChat.suggestions = AiChat._obsCache;
    return;
  }

  const alerts = [];
  try {
    const [trucks, trailers] = await Promise.all([
      atGetAll(TABLES.TRUCKS, { fields: ['License Plate','Active','KTEO Expiry','KEK Expiry','Insurance Expiry'] }, true),
      atGetAll(TABLES.TRAILERS, { fields: ['License Plate','Active','KTEO Expiry','FRC Expiry','Insurance Expiry'] }, true),
    ]);

    // Check truck expiries
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

    // Check trailer expiries
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

    // Check pending work orders
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
    } catch(e) {}

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
  } catch(e) {}

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
      <span class="aic-head-title">TMS Assistant</span>
      <button class="aic-head-close" onclick="_aicToggle()">✕</button>
    </div>
    <div class="aic-obs" id="aic-obs"></div>
    <div class="aic-msgs" id="aic-msgs"></div>
    <div class="aic-input-bar">
      <textarea class="aic-input" id="aic-input" rows="1" placeholder="Ask anything…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();_aicSend()}"></textarea>
      <button class="aic-send" id="aic-send-btn" onclick="_aicSend()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>`;
  document.body.appendChild(panel);

  // Run observer in background
  setTimeout(() => _aicRunObserver().then(() => _aicUpdateDot()), 2000);
}

async function _aicToggle() {
  AiChat.isOpen = !AiChat.isOpen;
  const panel = document.getElementById('aic-panel');
  const btn = document.getElementById('aic-toggle');

  if (AiChat.isOpen) {
    btn.style.display = 'none';
    panel.classList.add('open');
    await _aicRunObserver();
    _aicRenderObs();
    _aicRenderMsgs();
    // Welcome message if empty
    if (!AiChat.messages.length) {
      const _role = typeof ROLE !== 'undefined' ? ROLE : 'owner';
      const _name = typeof user !== 'undefined' ? (user.name || 'User').split(' ')[0] : 'User';
      const _profile = AIC_PROFILES[_role] || AIC_PROFILES.owner;
      AiChat.messages.push({ role: 'assistant', content: _profile.greeting(_name) });
      _aicRenderMsgs();
    }
    setTimeout(() => document.getElementById('aic-input')?.focus(), 250);
  } else {
    panel.classList.remove('open');
    btn.style.display = 'flex';
    _aicUpdateDot();
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
  } catch(e) {}
}

/* ── INIT ON LOAD ──────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _aicInit);
} else {
  _aicInit();
}
