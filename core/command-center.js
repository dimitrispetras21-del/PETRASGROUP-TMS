// ═══════════════════════════════════════════════════════════
// CORE — Universal Command Center component
// Reusable across Ops / Weekly INTL / Weekly NATL / Dashboard
// ═══════════════════════════════════════════════════════════

/**
 * Build the main Command Center HTML.
 * @param {Object} cfg
 * @param {string} cfg.title - e.g. "COMMAND CENTER · W15"
 * @param {number} cfg.pct - Completion percentage 0-100
 * @param {Array<{icon,sev,text,scrollTo?}>} cfg.actions - Action alerts
 * @param {Array<string>} [cfg.widgets] - Extra widget HTML strings
 * @returns {string} HTML
 */
function buildCommandCenterHTML(cfg) {
  const { title, pct = 0, actions = [], widgets = [] } = cfg;
  const sevColor = s => s==='crit'?'#DC2626':s==='warn'?'#D97706':s==='ok'?'#059669':'#0284C7';
  const sevBg = s => s==='crit'?'#FEE2E2':s==='warn'?'#FEF3C7':s==='ok'?'#D1FAE5':'#DBEAFE';

  const actionsHTML = actions.map(a => `
    <span style="background:${sevBg(a.sev)};color:${sevColor(a.sev)};padding:5px 10px;border-radius:5px;font-size:11px;font-weight:600;${a.scrollTo?'cursor:pointer':''}" ${a.scrollTo?`onclick="document.getElementById('${a.scrollTo}')?.scrollIntoView({behavior:'smooth',block:'center'})"`:''}>
      ${a.icon} ${a.text}
    </span>`).join('');

  return `
  <div style="background:linear-gradient(135deg,#0B1929,#1E3A8A);color:#fff;padding:14px 18px;border-radius:10px;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <div style="position:relative;width:56px;height:56px;flex-shrink:0">
        <svg width="56" height="56" viewBox="0 0 56 56" style="transform:rotate(-90deg)">
          <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="5"/>
          <circle cx="28" cy="28" r="24" fill="none" stroke="#10B981" stroke-width="5"
            stroke-dasharray="${2*Math.PI*24}" stroke-dashoffset="${2*Math.PI*24*(1-pct/100)}" stroke-linecap="round"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:14px;font-weight:700">${pct}%</div>
      </div>
      <div style="flex:1;min-width:200px">
        <div style="font-family:'Syne',sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;opacity:0.8">${title}</div>
        ${actionsHTML ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${actionsHTML}</div>` : ''}
      </div>
    </div>
    ${widgets.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1)">${widgets.join('')}</div>` : ''}
  </div>`;
}

/**
 * Widget: Fleet Utilization
 * @param {Array} trucks - All active trucks (with .id)
 * @param {Set<string>} assignedIds - Truck IDs assigned this week
 */
function widgetFleet(trucks, assignedIds) {
  const total = trucks.length;
  const busy = [...assignedIds].filter(id => trucks.find(t => t.id === id)).length;
  const pct = total ? Math.round(busy / total * 100) : 0;
  const barCol = pct > 85 ? '#DC2626' : pct > 60 ? '#10B981' : '#F59E0B';
  return `
  <div style="background:rgba(255,255,255,0.07);padding:10px 12px;border-radius:6px">
    <div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">🚛 FLEET UTIL</div>
    <div style="display:flex;align-items:baseline;gap:6px">
      <span style="font-size:18px;font-weight:700;font-family:'Syne',sans-serif">${busy}</span>
      <span style="font-size:11px;opacity:0.6">/ ${total} busy · ${pct}%</span>
    </div>
    <div style="width:100%;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;margin-top:4px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${barCol}"></div></div>
  </div>`;
}

/**
 * Widget: Empty Legs (unmatched orders)
 */
function widgetEmptyLegs(soloExp, soloImp, suggestion) {
  const total = soloExp + soloImp;
  return `
  <div style="background:rgba(255,255,255,0.07);padding:10px 12px;border-radius:6px">
    <div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">🔗 EMPTY LEGS</div>
    <div style="display:flex;align-items:baseline;gap:6px">
      <span style="font-size:18px;font-weight:700;font-family:'Syne',sans-serif;color:${total?'#F59E0B':'#10B981'}">${total}</span>
      <span style="font-size:11px;opacity:0.6">${soloExp} exp · ${soloImp} imp</span>
    </div>
    ${suggestion ? `<div style="font-size:10px;opacity:0.7;margin-top:3px">${suggestion}</div>` : ''}
  </div>`;
}

/**
 * Widget: Vs Last Week
 */
function widgetVsLastWeek(curOrders, prevOrders, curAssigned, prevAssigned) {
  const deltaOrders = curOrders - prevOrders;
  const deltaAssigned = prevAssigned ? Math.round((curAssigned - prevAssigned) / prevAssigned * 100) : 0;
  const arrow = d => d > 0 ? '↑' : d < 0 ? '↓' : '→';
  const col = d => d > 0 ? '#10B981' : d < 0 ? '#EF4444' : '#94A3B8';
  return `
  <div style="background:rgba(255,255,255,0.07);padding:10px 12px;border-radius:6px">
    <div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">📊 VS LAST WEEK</div>
    <div style="display:flex;gap:10px;font-size:11px">
      <div><div style="opacity:0.6;font-size:9px">Orders</div><div><span style="font-size:14px;font-weight:700;font-family:'Syne',sans-serif">${curOrders}</span> <span style="color:${col(deltaOrders)}">${arrow(deltaOrders)}${Math.abs(deltaOrders)}</span></div></div>
      <div><div style="opacity:0.6;font-size:9px">Assigned</div><div><span style="font-size:14px;font-weight:700;font-family:'Syne',sans-serif">${curAssigned}</span> <span style="color:${col(deltaAssigned)}">${arrow(deltaAssigned)}${Math.abs(deltaAssigned)}%</span></div></div>
    </div>
  </div>`;
}

/**
 * Widget: On-Time Streak
 */
function widgetOnTimeStreak(currentWeekPct, streakWeeks) {
  const fire = streakWeeks >= 3 ? '🔥' : streakWeeks >= 1 ? '✨' : '';
  const col = currentWeekPct >= 90 ? '#10B981' : currentWeekPct >= 75 ? '#F59E0B' : '#EF4444';
  return `
  <div style="background:rgba(255,255,255,0.07);padding:10px 12px;border-radius:6px">
    <div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">${fire} ON-TIME</div>
    <div style="display:flex;align-items:baseline;gap:6px">
      <span style="font-size:18px;font-weight:700;font-family:'Syne',sans-serif;color:${col}">${currentWeekPct}%</span>
      <span style="font-size:11px;opacity:0.6">this week</span>
    </div>
    <div style="font-size:10px;opacity:0.7;margin-top:3px">${streakWeeks ? `${streakWeeks} week${streakWeeks>1?'s':''} streak ≥90%` : 'Below 90% target'}</div>
  </div>`;
}

// ── Async data helpers ──────────────────────────────────────

/**
 * Compute empty legs for the current week data (exports/imports mismatch).
 */
function computeEmptyLegs(exports, imports) {
  // Solo exports: no matching import within the week
  // Heuristic: export delivers to country X → check if any import loads from same country X
  const expRegions = exports.map(e => (e.fields['Delivery Summary']||'').split(',').pop().trim().slice(0,3).toUpperCase());
  const impRegions = imports.map(i => (i.fields['Loading Summary']||'').split(',').pop().trim().slice(0,3).toUpperCase());
  const impSet = new Set(impRegions.filter(Boolean));
  const expSet = new Set(expRegions.filter(Boolean));
  const soloExp = expRegions.filter(r => r && !impSet.has(r)).length;
  const soloImp = impRegions.filter(r => r && !expSet.has(r)).length;
  return { soloExp, soloImp };
}

/**
 * Fetch previous week's order counts (async).
 */
async function fetchPreviousWeekStats(week, tableId) {
  try {
    const prevWeek = week - 1;
    const filter = `{ Week Number}=${prevWeek}`;
    const recs = await atGetAll(tableId, { filterByFormula: filter, fields: ['Truck','Partner','Status'] }, false).catch(() => []);
    const total = recs.length;
    const assigned = recs.filter(r => (r.fields['Truck']||[]).length || (r.fields['Partner']||[]).length).length;
    return { total, assigned };
  } catch(e) { return { total: 0, assigned: 0 }; }
}

/**
 * Fetch on-time performance streak for last N weeks.
 */
async function fetchOnTimeStreak(tableId, currentWeek, lookbackWeeks = 8) {
  try {
    // Fetch delivered orders from last N weeks with Delivery Performance field
    const fromWeek = currentWeek - lookbackWeeks;
    const filter = `AND({ Week Number}>=${fromWeek},{Status}='Delivered')`;
    const recs = await atGetAll(tableId, {
      filterByFormula: filter,
      fields: [' Week Number', 'Delivery Performance']
    }, false).catch(() => []);

    // Group by week
    const byWeek = {};
    recs.forEach(r => {
      const w = r.fields[' Week Number'];
      if (!w) return;
      if (!byWeek[w]) byWeek[w] = { total: 0, onTime: 0 };
      byWeek[w].total++;
      if (r.fields['Delivery Performance'] === 'On Time') byWeek[w].onTime++;
    });

    // Current week %
    const cur = byWeek[currentWeek] || { total: 0, onTime: 0 };
    const curPct = cur.total ? Math.round(cur.onTime / cur.total * 100) : 0;

    // Streak: consecutive prior weeks with ≥90%
    let streak = 0;
    for (let w = currentWeek - 1; w >= fromWeek; w--) {
      const d = byWeek[w];
      if (!d || !d.total) break;
      const pct = Math.round(d.onTime / d.total * 100);
      if (pct >= 90) streak++;
      else break;
    }
    return { currentWeekPct: curPct, streakWeeks: streak };
  } catch(e) { return { currentWeekPct: 0, streakWeeks: 0 }; }
}

// Expose globally for module use
if (typeof window !== 'undefined') {
  window.buildCommandCenterHTML = buildCommandCenterHTML;
  window.widgetFleet = widgetFleet;
  window.widgetEmptyLegs = widgetEmptyLegs;
  window.widgetVsLastWeek = widgetVsLastWeek;
  window.widgetOnTimeStreak = widgetOnTimeStreak;
  window.computeEmptyLegs = computeEmptyLegs;
  window.fetchPreviousWeekStats = fetchPreviousWeekStats;
  window.fetchOnTimeStreak = fetchOnTimeStreak;
}
