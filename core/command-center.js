// ═══════════════════════════════════════════════════════════
// CORE — Universal Command Center component
// Reusable across Ops / Weekly INTL / Weekly NATL / Dashboard
// ═══════════════════════════════════════════════════════════

// Emoji were a third icon system on top of Lucide SVG and the icons.js set.
// One source of truth: core/icons.js. Falls back to nothing if not loaded.
// See docs/design/DEEP_AUDIT_2026-08-04/metrics_audit.md MA-5.
function _ccIcon(n) { return (typeof icon === 'function') ? icon(n, 11) : ''; }

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
  const sevColor = s => s==='crit'?'var(--danger)':s==='warn'?'#D97706':s==='ok'?'#059669':'var(--accent)';
  const sevBg = s => s==='crit'?'#FEE2E2':s==='warn'?'var(--warning-soft)':s==='ok'?'#D1FAE5':'#DBEAFE';

  // Π4 (Wave 1): a chip with scrollTo is a real button — it jumps to the first
  // matching row and flashes it, instead of being a dead counter. Chips without
  // a target stay plain spans.
  const actionsHTML = actions.map(a => a.scrollTo
    ? `<button type="button" style="background:${sevBg(a.sev)};color:${sevColor(a.sev)};padding:5px 10px;border-radius:5px;font-size:11px;font-weight:600;border:none;cursor:pointer;font-family:inherit" onclick="_ccJump('${a.scrollTo}')">
      ${a.icon} ${a.text}
    </button>`
    : `<span style="background:${sevBg(a.sev)};color:${sevColor(a.sev)};padding:5px 10px;border-radius:5px;font-size:11px;font-weight:600">
      ${a.icon} ${a.text}
    </span>`).join('');

  return `
  <div style="background:linear-gradient(135deg,var(--navy-mid),#1E3A8A);color:#fff;padding:14px 18px;border-radius:10px;margin-bottom:12px">
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
  const barCol = pct > 85 ? 'var(--danger)' : pct > 60 ? 'var(--panel-ok)' : 'var(--panel-warn)';
  return `
  <div style="background:rgba(255,255,255,0.07);padding:10px 12px;border-radius:6px">
    <div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">${_ccIcon('truck')} ΑΞΙΟΠΟΙΗΣΗ ΣΤΟΛΟΥ</div>
    <div style="display:flex;align-items:baseline;gap:6px">
      <span style="font-size:18px;font-weight:700;font-family:'Syne',sans-serif">${busy}</span>
      <span style="font-size:11px;opacity:0.6">/ ${total} σε χρήση · ${pct}%</span>
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
    <div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">${_ccIcon('route')} ΚΕΝΑ ΔΡΟΜΟΛΟΓΙΑ</div>
    <div style="display:flex;align-items:baseline;gap:6px">
      <span style="font-size:18px;font-weight:700;font-family:'Syne',sans-serif;color:${total?'var(--panel-warn)':'var(--panel-ok)'}">${total}</span>
      <span style="font-size:11px;opacity:0.6">${soloExp} εξαγ. · ${soloImp} εισαγ.</span>
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
  const col = d => d > 0 ? 'var(--panel-ok)' : d < 0 ? '#EF4444' : 'var(--panel-dim)';
  return `
  <div style="background:rgba(255,255,255,0.07);padding:10px 12px;border-radius:6px">
    <div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">${_ccIcon('bar_chart')} ΣΕ ΣΧΕΣΗ ΜΕ ΠΡΟΗΓΟΥΜΕΝΗ</div>
    <div style="display:flex;gap:10px;font-size:11px">
      <div><div style="opacity:0.6;font-size:9px">Παραγγελίες</div><div><span style="font-size:14px;font-weight:700;font-family:'Syne',sans-serif">${curOrders}</span> <span style="color:${col(deltaOrders)}">${arrow(deltaOrders)}${Math.abs(deltaOrders)}</span></div></div>
      <div><div style="opacity:0.6;font-size:9px">Ανατεθειμένα</div><div><span style="font-size:14px;font-weight:700;font-family:'Syne',sans-serif">${curAssigned}</span> <span style="color:${col(deltaAssigned)}">${arrow(deltaAssigned)}${Math.abs(deltaAssigned)}%</span></div></div>
    </div>
  </div>`;
}

/**
 * Widget: On-Time Streak
 */
function widgetOnTimeStreak(currentWeekPct, streakWeeks) {
  const fire = streakWeeks >= 3 ? '🔥' : streakWeeks >= 1 ? '✨' : '';
  const col = currentWeekPct >= 90 ? 'var(--panel-ok)' : currentWeekPct >= 75 ? 'var(--panel-warn)' : '#EF4444';
  return `
  <div style="background:rgba(255,255,255,0.07);padding:10px 12px;border-radius:6px">
    <div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">${fire} ΣΥΝΕΠΕΙΑ ΠΑΡΑΔΟΣΗΣ</div>
    <div style="display:flex;align-items:baseline;gap:6px">
      <span style="font-size:18px;font-weight:700;font-family:'Syne',sans-serif;color:${col}">${currentWeekPct}%</span>
      <span style="font-size:11px;opacity:0.6">αυτή την εβδομάδα</span>
    </div>
    <div style="font-size:10px;opacity:0.7;margin-top:3px">${streakWeeks ? `${streakWeeks} ${streakWeeks>1?'εβδομάδες':'εβδομάδα'} σερί ≥90%` : 'Κάτω από τον στόχο 90%'}</div>
  </div>`;
}

/**
 * Π4 (Wave 1): jump to a row from a Command Center action chip.
 * Scrolls the element into view and flashes it so the eye lands on the right
 * line — a counter you can act on instead of just read.
 */
function _ccJump(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('cc-jump-flash');
  void el.offsetWidth; // restart the animation on repeated clicks
  el.classList.add('cc-jump-flash');
  setTimeout(() => el.classList.remove('cc-jump-flash'), 1700);
}

/**
 * Π5γ (Wave 1): week phase badge. The page serves two different jobs —
 * building NEXT week (Tue→Sat, per owner interview 00 §1) and correcting the
 * CURRENT one — and the UI never said which one you're in.
 */
function weekPhaseBadge(week, today) {
  const phase = week > today ? 'build' : week === today ? 'live' : 'closed';
  const lbl = phase === 'build' ? 'ΧΤΙΖΕΤΑΙ' : phase === 'live' ? 'ΣΕ ΕΞΕΛΙΞΗ' : 'ΚΛΕΙΣΜΕΝΗ';
  return `<span class="wk-phase wk-phase--${phase}" title="${
    phase === 'build' ? 'Μελλοντική εβδομάδα — το πλάνο χτίζεται' :
    phase === 'live' ? 'Τρέχουσα εβδομάδα — εκτελείται' :
    'Περασμένη εβδομάδα — μόνο ανάγνωση/διορθώσεις'}">${lbl}</span>`;
}

// ── Async data helpers ──────────────────────────────────────

// computeEmptyLegs() (country-prefix heuristic) was removed in Wave 1 — Π5α.
// Measured against W20: it reported 10 "empty legs" when the real unmatched
// count was 36 (02_BASELINE §3). Both weekly pages now pass their REAL
// unmatched counts, which they already compute for the header chips.

/**
 * Fetch previous week's order counts (async).
 * Uses Week Number field if available, else falls back to date range filter.
 */
async function fetchPreviousWeekStats(week, tableId, useDateRange = false) {
  try {
    const prevWeek = week - 1;
    let filter;
    if (useDateRange) {
      // Compute prev week date range (Sunday start)
      const y = new Date().getFullYear(), jan1 = new Date(y, 0, 1);
      const firstSun = new Date(jan1); firstSun.setDate(jan1.getDate() - jan1.getDay());
      const ws = new Date(firstSun); ws.setDate(firstSun.getDate() + (prevWeek - 1) * 7);
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      const wsStr = ws.toISOString().slice(0,10);
      const weStr = we.toISOString().slice(0,10);
      filter = `AND(IS_AFTER({Loading DateTime},'${wsStr}'),IS_BEFORE({Loading DateTime},'${weStr}T23:59:59'))`;
    } else {
      filter = `{Week Number}=${prevWeek}`;
    }
    // safeFetch, and the failure is RE-THROWN rather than absorbed here. This
    // function is the source behind the "vs last week" widget, whose callers
    // (weekly_natl, weekly_intl) now use safeFetch themselves and hide the
    // widget when it fails. Returning {total:0,assigned:0} on a broken fetch
    // would defeat that: the caller would receive a plausible zero, decide the
    // data is real, and render "0 last week" as a record week. Failing loudly
    // to the caller is what lets the caller stay honest.
    const recs = await safeFetch(
      () => atGetAll(tableId, { filterByFormula: filter, fields: ['Truck','Partner','Status'] }, false),
      'command-center: previous week stats'
    );
    if (didFail(recs)) throw new Error('previous-week stats unavailable');
    const total = recs.length;
    const assigned = recs.filter(r => (r.fields['Truck']||[]).length || (r.fields['Partner']||[]).length).length;
    return { total, assigned };
  } catch(e) {
    // Deliberately rethrow instead of the old {total:0,assigned:0}. See above:
    // a zero here becomes a confident comparison two layers up.
    throw e;
  }
}

/**
 * Fetch on-time performance streak for last N weeks.
 * Only works on tables with Week Number + Delivery Performance (ORDERS).
 */
async function fetchOnTimeStreak(tableId, currentWeek, lookbackWeeks = 8) {
  try {
    const fromWeek = currentWeek - lookbackWeeks;
    const filter = `AND({Week Number}>=${fromWeek},{Status}='Delivered')`;
    const recs = await atGetAll(tableId, {
      filterByFormula: filter,
      fields: ['Week Number', 'Delivery Performance']
    }, false).catch(() => []);

    const byWeek = {};
    recs.forEach(r => {
      const w = r.fields['Week Number'];
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

// A `_ccFallback()` helper briefly lived here, rendering "δεν φόρτωσε" into a
// failed widget's placeholder. It was removed when this branch merged #28,
// which had already settled the same question the other way: a failed widget is
// HIDDEN (see the didFail() branches in weekly_intl/weekly_natl). Both are
// defensible; keeping both would leave two conventions for one situation, and
// #28's reasoning is documented and deliberate. One convention wins.

// Expose globally for module use
if (typeof window !== 'undefined') {
  window.buildCommandCenterHTML = buildCommandCenterHTML;
  window.widgetFleet = widgetFleet;
  window.widgetEmptyLegs = widgetEmptyLegs;
  window.widgetVsLastWeek = widgetVsLastWeek;
  window.widgetOnTimeStreak = widgetOnTimeStreak;
  window._ccJump = _ccJump;
  window.weekPhaseBadge = weekPhaseBadge;
  window.fetchPreviousWeekStats = fetchPreviousWeekStats;
  window.fetchOnTimeStreak = fetchOnTimeStreak;
}
