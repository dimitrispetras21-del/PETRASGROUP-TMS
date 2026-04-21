// ═══════════════════════════════════════════════
// CORE — ROUTER & SIDEBAR
// ═══════════════════════════════════════════════

const NAV = [
  { section: 'Planning', perm: 'planning', items: [
    { id: 'dashboard',      label: 'Dashboard',           icon: 'layout_grid' },
    { id: 'weekly_intl',    label: 'Weekly International',icon: 'globe' },
    { id: 'weekly_natl',    label: 'Weekly National',     icon: 'home' },
    { id: 'weekly_pickups', label: 'National Pick Ups',   icon: 'package' },
  ]},
  { section: 'Daily Ops', perm: 'planning', items: [
    { id: 'daily_ops',      label: 'Daily Ops Plan',      icon: 'list_checks' },
    { id: 'daily_ramp',     label: 'Daily Ramp Board',    icon: 'activity' },
  ]},
  { section: 'Orders', perm: 'orders', items: [
    { id: 'orders_intl', label: 'International Orders', icon: 'file_text' },
    { id: 'orders_natl', label: 'National Orders',      icon: 'file_text' },
    { id: 'locations',   label: 'Locations',            icon: 'map_pin' },
  ]},
  { section: 'Clients & Partners', perm: 'clients', items: [
    { id: 'clients',  label: 'Clients',  icon: 'building' },
    { id: 'partners', label: 'Partners', icon: 'users' },
  ]},
  { section: 'Drivers', perm: 'drivers', items: [
    { id: 'drivers', label: 'Drivers',        icon: 'user' },
    { id: 'payroll', label: 'Driver Payroll', icon: 'coins' },
  ]},
  { section: 'Maintenance', perm: 'maintenance', items: [
    { id: 'maint_dash',   label: 'Dashboard',       icon: 'layout_grid' },
    { id: 'maint_req',    label: 'Work Orders',     icon: 'list_checks' },
    { id: 'maint_expiry', label: 'Expiry Alerts',   icon: 'alert_triangle' },
    { id: 'maint_svc',    label: 'Service Records', icon: 'tool' },
  ]},
  { section: 'Fleet', perm: 'maintenance', items: [
    { id: 'trucks',         label: 'Trucks',           icon: 'truck' },
    { id: 'trailers',       label: 'Trailers',         icon: 'truck' },
    { id: 'workshops',      label: 'Workshops',        icon: 'tool' },
    { id: 'maint_trucks',   label: 'Trucks History',   icon: 'clock' },
    { id: 'maint_trailers', label: 'Trailers History', icon: 'clock' },
  ]},
  { section: 'Finance', perm: 'orders', items: [
    { id: 'invoicing',     label: 'Invoicing',     icon: 'file_check' },
    { id: 'pallet_ledger', label: 'Pallet Ledger', icon: 'package' },
    { id: 'costs',         label: 'Costs (soon)',  icon: 'coins' },
  ]},
  { section: 'Insights', perm: 'ceo_dashboard', items: [
    { id: 'ceo_dashboard', label: 'CEO Dashboard',  icon: 'award' },
    { id: 'performance',   label: 'My Performance', icon: 'trending_up' },
  ]},
  { section: 'Admin', perm: 'settings', items: [
    { id: 'settings',      label: 'Settings',      icon: 'settings' },
    { id: 'metrics_audit', label: 'Metrics Audit', icon: 'bar_chart' },
    { id: 'trash',         label: 'Trash',         icon: 'trash' },
    { id: 'error_log',     label: 'Error Log',     icon: 'alert_triangle' },
  ]},
];

// Lucide icon helper — pulls SVGs from core/icons.js (single source of truth)
function _navIcon(name) {
  if (typeof icon === 'function') return icon(name, 16);
  return ''; // fallback if icons.js not loaded
}

// Per-group collapsed state persistence
function _navGroupKey(gi) { return `tms_nav_grp_${gi}_collapsed`; }
function _navGroupIsCollapsed(gi) {
  // Default: first group open, rest collapsed (only on first visit)
  const stored = localStorage.getItem(_navGroupKey(gi));
  if (stored === null) return false; // default: all open
  return stored === '1';
}
function _navGroupSetCollapsed(gi, collapsed) {
  localStorage.setItem(_navGroupKey(gi), collapsed ? '1' : '0');
}

// ── Sidebar ───────────────────────────────────────
function renderNav() {
  const nav = document.getElementById('sidebarNav');
  let html = '';

  // ⌘K quick-jump button at the top
  if (typeof openCommandPalette === 'function') {
    html += '<button class="sidebar-cmdk" onclick="openCommandPalette()" title="Quick jump (⌘K)">'
          + (typeof icon === 'function' ? icon('search', 14) : '')
          + '<span class="sidebar-cmdk-label">Quick jump…</span>'
          + '<kbd>⌘K</kbd>'
          + '</button>';
  }

  NAV.forEach((group, gi) => {
    if (can(group.perm) === 'none') return;
    const collapsed = _navGroupIsCollapsed(gi);
    const sid = 'navgrp_' + gi;
    html += '<div class="nav-section' + (collapsed ? ' collapsed-section' : '') + '" onclick="toggleNavSection(this,\'' + sid + '\',' + gi + ')">'
          + '<span>' + group.section + '</span>'
          + '<span class="chevron">' + _navIcon('chevron_down') + '</span>'
          + '</div>';
    html += '<div class="nav-group-items' + (collapsed ? ' collapsed-items' : '') + '" id="' + sid + '">';
    for (const item of group.items) {
      html += '<div class="nav-item" tabindex="0" data-tooltip="' + item.label
            + '" onclick="navigate(\'' + item.id + '\')"'
            + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();navigate(\'' + item.id + '\')}"'
            + ' id="nav_' + item.id + '">'
            + '<div class="nav-icon">' + _navIcon(item.icon) + '</div>'
            + '<span class="nav-label">' + item.label + '</span>'
            + '</div>';
    }
    html += '</div>';
  });
  nav.innerHTML = html;
}

function toggleNavSection(el, groupId, gi) {
  const items = document.getElementById(groupId);
  const isCollapsed = el.classList.toggle('collapsed-section');
  items.classList.toggle('collapsed-items', isCollapsed);
  if (typeof gi === 'number') _navGroupSetCollapsed(gi, isCollapsed);
}

function toggleSidebar() {
  const sb   = document.getElementById('sidebar');
  const icon = document.getElementById('toggleIcon');
  sb.classList.toggle('collapsed');
  const isCollapsed = sb.classList.contains('collapsed');
  icon.textContent = isCollapsed ? '▶' : '◀';
  localStorage.setItem('tms_sidebar_collapsed', isCollapsed ? 'true' : 'false');
}

function restoreSidebar() {
  if (localStorage.getItem('tms_sidebar_collapsed') === 'true') {
    const sb = document.getElementById('sidebar');
    const icon = document.getElementById('toggleIcon');
    if (sb) sb.classList.add('collapsed');
    if (icon) icon.textContent = '▶';
  }
}

// ── Router ────────────────────────────────────────
let currentPage = '';

/**
 * Navigate to a page by ID. Updates sidebar highlight, topbar breadcrumb,
 * persists the choice to localStorage, and renders the target module.
 * @param {string} page - Page identifier (e.g. 'dashboard', 'orders_intl')
 */
function navigate(page) {
  // Permission guard: block navigation if user lacks access
  const _pagePerm = {};
  NAV.forEach(g => g.items.forEach(i => { _pagePerm[i.id] = g.perm; }));
  const reqPerm = _pagePerm[page];
  if (reqPerm && typeof can === 'function' && can(reqPerm) === 'none') {
    if (typeof toast === 'function') toast('Δεν έχετε πρόσβαση σε αυτή τη σελίδα', 'error');
    if (typeof logError === 'function') logError(new Error('Permission denied: ' + page), 'navigate');
    return;
  }
  currentPage = page;
  localStorage.setItem('tms_page', page);

  // Auto-collapse sidebar on nav click + persist
  const sb = document.getElementById('sidebar');
  if (sb && !sb.classList.contains('collapsed')) {
    sb.classList.add('collapsed');
    const icon = document.getElementById('toggleIcon');
    if (icon) icon.textContent = '▶';
    localStorage.setItem('tms_sidebar_collapsed', 'true');
  }

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav_' + page);
  if (navEl) {
    navEl.classList.add('active');
    // Auto-open parent section if collapsed
    const group = navEl.closest('.nav-group-items');
    if (group && group.classList.contains('collapsed-items')) {
      const section = group.previousElementSibling;
      if (section) {
        section.classList.remove('collapsed-section');
        group.classList.remove('collapsed-items');
      }
    }
  }

  let label = page, section = '';
  for (const g of NAV) {
    const item = g.items.find(i => i.id === page);
    if (item) { label = item.label; section = g.section; break; }
  }
  const topbar = document.getElementById('topbarTitle');
  if (section && section !== label) {
    topbar.innerHTML = `<span style="color:var(--text-dim);font-weight:400">${section}</span> <span style="color:var(--text-dim);margin:0 4px;font-weight:300">/</span> ${label}`;
  } else {
    topbar.textContent = label;
  }

  const c = document.getElementById('content');
  // Reset content styles (some pages override these)
  c.style.padding = '';
  c.style.overflow = '';
  c.style.background = '';

  switch (page) {
    // Planning
    case 'dashboard':      renderDashboard();            break;
    case 'weekly_intl':    renderWeeklyIntl(); break;
    case 'weekly_natl':    renderWeeklyNatl();       break;
    case 'weekly_pickups':
      document.getElementById('topbarTitle').textContent = 'National Pick Ups';
      c.style.padding = '0';
      c.style.overflow = 'hidden';
      c.innerHTML = '<iframe src="https://dimitrispetras21-del.github.io/petras-assign/national_consolidation.html" style="width:100%;height:100%;border:none;display:block;" allow="clipboard-write"></iframe>';
      break;
    case 'daily_ops':      renderDailyOps();                                      break;
    case 'daily_ramp':     renderDailyRamp(); break;
    // Orders
    case 'orders_intl':    renderOrdersIntl();            break;
    case 'orders_natl':    renderOrdersNatl();            break;
    case 'locations':      renderLocations();                                     break;
    // Clients & Partners
    case 'clients':        renderEntity('clients');       break;
    case 'partners':       renderEntity('partners');      break;
    case 'pallet_ledger':  renderPalletLedger();          break;
    case 'invoicing':      renderInvoicing();             break;
    // Maintenance
    case 'maint_dash':     renderMaintDash();       break;
    case 'maint_req':      renderMaintRequests();   break;
    case 'maint_expiry':   renderExpiryAlerts();    break;
    case 'maint_svc':      renderServiceRecords();  break;
    case 'maint_trucks':   renderTrucksHistory();   break;
    case 'maint_trailers': renderTrailersHistory(); break;
    case 'workshops':      renderEntity('workshops'); break;
    case 'trucks':         renderEntity('trucks');        break;
    case 'trailers':       renderEntity('trailers');      break;
    // Drivers
    case 'drivers':        renderEntity('drivers');       break;
    case 'payroll':        c.innerHTML = showComingSoon('Driver Payroll');        break;
    // Costs
    case 'costs_dash':     c.innerHTML = showComingSoon('Costs Dashboard');       break;
    case 'fuel':           c.innerHTML = showComingSoon('Fuels');                 break;
    case 'costs':          c.innerHTML = showComingSoon('Costs');                 break;
    case 'pl':             c.innerHTML = showComingSoon('P&Ls');                  break;
    // CEO
    case 'ceo_dashboard':  renderCEODashboard();                                  break;
    // HR
    case 'performance':    renderPerformance();                                   break;
    // Settings
    case 'settings':
      if (can('settings') !== 'full') { c.innerHTML = showAccessDenied(); break; }
      c.innerHTML = showComingSoon('Settings');
      break;
    case 'trash':
      if (can('settings') !== 'full') { c.innerHTML = showAccessDenied(); break; }
      renderTrashViewer();
      break;
    case 'error_log':
      renderErrorLog();
      break;
    case 'metrics_audit':
      if (can('settings') !== 'full') { c.innerHTML = showAccessDenied(); break; }
      renderMetricsAudit();
      break;
    default:
      c.innerHTML = showComingSoon(label);
  }

  // Inject footer after page renders (delay for async renderers)
  setTimeout(() => {
    if (!document.querySelector('.page-footer') && c.scrollHeight > 100) {
      c.insertAdjacentHTML('beforeend',
        `<div class="page-footer"><span class="footer-logo">PETRAS GROUP TMS</span><span>v2.0 · ${new Date().getFullYear()}</span></div>`);
    }
  }, 2000);
}

/**
 * Log the current user out. Clears session data and redirects to the login page.
 */
function logout() {
  if (typeof clearApiCaches === 'function') clearApiCaches();
  if (typeof atStopAutoRefresh === 'function') atStopAutoRefresh();
  localStorage.removeItem('tms_user'); localStorage.removeItem('tms_jwt'); localStorage.removeItem('tms_page');
  window.location.href = 'index.html';
}
