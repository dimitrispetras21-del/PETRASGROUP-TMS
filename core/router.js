// ═══════════════════════════════════════════════
// CORE — ROUTER & SIDEBAR
// ═══════════════════════════════════════════════

const NAV = [
  { section: 'Planning', perm: 'planning', items: [
    { id: 'dashboard',      label: 'Dashboard',           icon: 'dashboard' },
    { id: 'weekly_intl',    label: 'Weekly International',icon: 'globe' },
    { id: 'weekly_natl',    label: 'Weekly National',     icon: 'home' },
    { id: 'weekly_pickups', label: 'National Pick Ups',   icon: 'pickup' },
    { id: 'daily_ops',      label: 'Daily Ops Plan',      icon: 'clipboard' },
    { id: 'daily_ramp',     label: 'Daily Ramp Board',    icon: 'ramp' },
  ]},
  { section: 'Orders', perm: 'orders', items: [
    { id: 'orders_intl', label: 'International Orders', icon: 'doc' },
    { id: 'orders_natl', label: 'National Orders',      icon: 'doc' },
    { id: 'invoicing',   label: 'Invoicing',            icon: 'invoice' },
    { id: 'locations',   label: 'Locations',            icon: 'location' },
  ]},
  { section: 'Clients & Partners', perm: 'clients', items: [
    { id: 'clients',        label: 'Clients',        icon: 'building' },
    { id: 'partners',       label: 'Partners',        icon: 'handshake' },
    { id: 'pallet_ledger',  label: 'Pallet Ledger',   icon: 'pallet' },
  ]},
  { section: 'Maintenance', perm: 'maintenance', items: [
    { id: 'maint_dash',     label: 'Dashboard',        icon: 'dashboard' },
    { id: 'maint_req',      label: 'Work Orders',      icon: 'clipboard' },
    { id: 'maint_expiry',   label: 'Expiry Alerts',    icon: 'alert' },
    { id: 'maint_svc',      label: 'Service Records',  icon: 'wrench' },
    { id: 'maint_trucks',   label: 'Trucks History',   icon: 'truck' },
    { id: 'maint_trailers', label: 'Trailers History', icon: 'trailer' },
    { id: 'trucks',         label: 'Trucks',           icon: 'truck' },
    { id: 'trailers',       label: 'Trailers',         icon: 'trailer' },
    { id: 'workshops',      label: 'Workshops',        icon: 'wrench' },
  ]},
  { section: 'Drivers', perm: 'drivers', items: [
    { id: 'drivers', label: 'Drivers',        icon: 'person' },
    { id: 'payroll', label: 'Driver Payroll', icon: 'money' },
  ]},
  { section: 'Costs', perm: 'costs', items: [
    { id: 'costs_dash', label: 'Dashboard', icon: 'dashboard' },
    { id: 'fuel',       label: 'Fuels',     icon: 'fuel' },
    { id: 'costs',      label: 'Costs',     icon: 'chart' },
    { id: 'pl',         label: 'P&Ls',      icon: 'trending' },
  ]},
  { section: 'Settings', perm: 'settings', items: [
    { id: 'settings', label: 'Settings', icon: 'gear' },
  ]},
];

const ICONS = {
  dashboard: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg>`,
  globe:     `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="8"/><ellipse cx="10" cy="10" rx="3.5" ry="8"/><line x1="2" y1="10" x2="18" y2="10"/><line x1="4" y1="6.5" x2="16" y2="6.5"/><line x1="4" y1="13.5" x2="16" y2="13.5"/></svg>`,
  home:      `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M8 18v-5h4v5"/></svg>`,
  pickup:    `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 15h16M4 15V9l2-4h8l2 4v6"/><circle cx="7" cy="15.5" r="1.5"/><circle cx="13" cy="15.5" r="1.5"/><line x1="4" y1="11" x2="16" y2="11"/></svg>`,
  clipboard: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="3" width="10" height="14" rx="1.5"/><path d="M8 3V2h4v1"/><line x1="8" y1="8" x2="12" y2="8"/><line x1="8" y1="11" x2="12" y2="11"/><line x1="8" y1="14" x2="11" y2="14"/></svg>`,
  ramp:      `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1" y="13" width="18" height="3" rx="1"/><path d="M3 13V8l4-4h6l4 4v5"/><circle cx="6" cy="16" r="1"/><circle cx="14" cy="16" r="1"/></svg>`,
  doc:       `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 2h7l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M12 2v4h4"/><line x1="7" y1="9" x2="13" y2="9"/><line x1="7" y1="12" x2="11" y2="12"/></svg>`,
  location:  `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 2a5 5 0 015 5c0 4-5 10-5 10S5 11 5 7a5 5 0 015-5z"/><circle cx="10" cy="7" r="2"/></svg>`,
  building:  `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="14" height="15" rx="1"/><path d="M8 18v-5h4v5"/><line x1="3" y1="7" x2="17" y2="7"/><line x1="7" y1="11" x2="9" y2="11"/><line x1="11" y1="11" x2="13" y2="11"/></svg>`,
  handshake: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 12l3-3 3 2 3-2 5 3"/><path d="M5 9L3 11M11 7l5 5M8 9l5 5"/></svg>`,
  wrench:    `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14.5 2a3.5 3.5 0 00-3.2 4.9L3.4 14.8a1.3 1.3 0 001.8 1.8l7.9-7.9A3.5 3.5 0 1014.5 2z"/></svg>`,
  truck:     `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1" y="7" width="11" height="8" rx="1"/><path d="M12 10h4l2 3v2h-6V10z"/><circle cx="4" cy="16.5" r="1.5"/><circle cx="10" cy="16.5" r="1.5"/><circle cx="16" cy="16.5" r="1.5"/></svg>`,
  trailer:   `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1" y="6" width="15" height="9" rx="1"/><circle cx="5" cy="16.5" r="1.5"/><circle cx="12" cy="16.5" r="1.5"/><line x1="16" y1="10.5" x2="19" y2="10.5"/></svg>`,
  alert:     `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 2.5L2.5 17h15L10 2.5z"/><line x1="10" y1="9" x2="10" y2="12.5"/><circle cx="10" cy="14.5" r="0.8" fill="currentColor" stroke="none"/></svg>`,
  person:    `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="6" r="3.5"/><path d="M3 18c0-3.9 3.1-7 7-7s7 3.1 7 7"/></svg>`,
  money:     `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="5" width="16" height="10" rx="1.5"/><circle cx="10" cy="10" r="2.5"/></svg>`,
  fuel:      `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 18V4a1 1 0 011-1h5a1 1 0 011 1v6l2 1v4a1 1 0 002 0V9l-2-2"/><line x1="7" y1="8" x2="10" y2="8"/></svg>`,
  chart:     `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="3" y1="17" x2="17" y2="17"/><rect x="4" y="10" width="3" height="7"/><rect x="8.5" y="6" width="3" height="11"/><rect x="13" y="3" width="3" height="14"/></svg>`,
  trending:  `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="2,15 7,9 11,12 18,5"/><polyline points="13,5 18,5 18,10"/></svg>`,
  gear:      `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="2.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4"/></svg>`,
  pallet:    `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="12" width="16" height="3" rx="0.5"/><rect x="2" y="5" width="16" height="3" rx="0.5"/><line x1="5" y1="8" x2="5" y2="12"/><line x1="10" y1="8" x2="10" y2="12"/><line x1="15" y1="8" x2="15" y2="12"/><line x1="5" y1="15" x2="5" y2="18"/><line x1="15" y1="15" x2="15" y2="18"/></svg>`,
  invoice:   `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="2" width="14" height="16" rx="1.5"/><line x1="6" y1="6" x2="14" y2="6"/><line x1="6" y1="9" x2="14" y2="9"/><line x1="6" y1="12" x2="10" y2="12"/><path d="M12 14l1.5 1.5 3-3"/></svg>`,
};

// ── Sidebar ───────────────────────────────────────
function renderNav() {
  const nav = document.getElementById('sidebarNav');
  let html = '';
  NAV.forEach((group, gi) => {
    if (can(group.perm) === 'none') return;
    const isOpen = gi === 0;
    const sid = 'navgrp_' + gi;
    html += '<div class="nav-section' + (isOpen ? '' : ' collapsed-section') + '" onclick="toggleNavSection(this,\'' + sid + '\')">'
          + '<span>' + group.section + '</span>'
          + '<span class="chevron">&#9662;</span>'
          + '</div>';
    html += '<div class="nav-group-items' + (isOpen ? '' : ' collapsed-items') + '" id="' + sid + '">';
    for (const item of group.items) {
      html += '<div class="nav-item" data-tooltip="' + item.label + '" onclick="navigate(\'' + item.id + '\')" id="nav_' + item.id + '">'
            + '<div class="nav-icon">' + (ICONS[item.icon] || item.icon) + '</div>'
            + '<span class="nav-label">' + item.label + '</span>'
            + '</div>';
    }
    html += '</div>';
  });
  nav.innerHTML = html;
}

function toggleNavSection(el, groupId) {
  const items = document.getElementById(groupId);
  const isCollapsed = el.classList.toggle('collapsed-section');
  items.classList.toggle('collapsed-items', isCollapsed);
}

function toggleSidebar() {
  const sb   = document.getElementById('sidebar');
  const icon = document.getElementById('toggleIcon');
  sb.classList.toggle('collapsed');
  icon.textContent = sb.classList.contains('collapsed') ? '▶' : '◀';
}

// ── Router ────────────────────────────────────────
let currentPage = '';

function navigate(page) {
  currentPage = page;
  localStorage.setItem('tms_page', page);

  // Auto-collapse sidebar on nav click
  const sb = document.getElementById('sidebar');
  if (sb && !sb.classList.contains('collapsed')) {
    sb.classList.add('collapsed');
    const icon = document.getElementById('toggleIcon');
    if (icon) icon.textContent = '▶';
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

  let label = page;
  for (const g of NAV) {
    const item = g.items.find(i => i.id === page);
    if (item) { label = item.label; break; }
  }
  document.getElementById('topbarTitle').textContent = label;

  const c = document.getElementById('content');
  // Reset content padding (some pages like pickups use zero-padding iframe)
  c.style.padding = '';
  c.style.overflow = '';

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
    // Settings
    case 'settings':
      if (can('settings') !== 'full') { c.innerHTML = showAccessDenied(); break; }
      c.innerHTML = showComingSoon('Settings');
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

function logout() {
  localStorage.removeItem('tms_user'); localStorage.removeItem('tms_page');
  window.location.href = 'index.html';
}
