// ═══════════════════════════════════════════════════════════════════════════
// MODULE — ORDERS HUB («Παραγγελίες», one page for international + national)
//
// Owner 28/9/2026: «προς τιμολόγηση και εβδομαδιαία ανασκόπηση θέλω να μπουν στις
// παραγγελίες και όχι νέο page. το ίδιο και το χωρίς τιμή … να συμπτύξουμε
// εθνικές και διεθνείς παραγγελίες σε ένα page» — approved with «1. ναι».
// Figma round 6 (y45000): A 804 Κατάλογος · B 805 Προς τιμολόγηση · G 808:1011
// Εβδομάδα · H 808:1275 Χωρίς τιμή.
//
// This file owns ONLY the frame: route, header, scope (Όλες/Διεθνείς/Εθνικές),
// view tabs, counters. Each view renders itself into #ordersBody:
//   catalog   → modules/orders_catalog.js (every scope; the cards come from
//               modules/orders_intl.js / orders_natl.js)
//   invoicing → modules/orders_invoicing_view.js
//   week      → modules/orders_week_view.js
//   noprice   → modules/orders_noprice_view.js
// Old routes (orders_intl, orders_natl, invoicing) are aliases resolved in
// navigate() — bookmarks, dashboard links and the remembered page keep working.
// ═══════════════════════════════════════════════════════════════════════════
const OrdersHub = (() => {
  'use strict';

  const VIEWS = {};   // key → { label, order, visible(), render(ctx), counts? }
  const H = { scope: 'all', view: '', token: 0, preset: null, pendingSelect: null };

  const _user = () => { try { return (JSON.parse(localStorage.getItem('tms_user') || '{}').username) || ''; } catch (_) { return ''; } };
  // Per-viewer convenience only (remembered tab/scope) — nothing depends on it.
  const _lsKey = () => 'tms_orders_hub_' + _user();
  function _loadPrefs() {
    try { const p = JSON.parse(localStorage.getItem(_lsKey()) || '{}'); if (p.scope) H.scope = p.scope; if (p.view) H.view = p.view; } catch (_) {}
  }
  function _savePrefs() { try { localStorage.setItem(_lsKey(), JSON.stringify({ scope: H.scope, view: H.view })); } catch (_) {} }

  const _role = () => (typeof ROLE !== 'undefined' ? ROLE : '');
  // Accountant lands on her queue; everyone else on the catalog.
  const _defaultView = () => (_role() === 'accountant' ? 'invoicing' : 'catalog');

  function register(key, def) { VIEWS[key] = Object.assign({ order: 99, visible: () => true }, def); }
  function _visibleViews() { return Object.entries(VIEWS).filter(([, v]) => v.visible()).sort((a, b) => a[1].order - b[1].order); }

  // Called by navigate() for the alias routes before it renders 'orders'.
  function preset(p) { H.preset = p || null; }

  function _applyPreset() {
    _loadPrefs();
    if (H.preset) {
      if (H.preset.scope) H.scope = H.preset.scope;
      if (H.preset.view) H.view = H.preset.view;
      H.preset = null;
    }
    if (!['all', 'intl', 'natl'].includes(H.scope)) H.scope = 'all';
    if (!H.view || !VIEWS[H.view] || !VIEWS[H.view].visible()) H.view = _defaultView();
    if (!VIEWS[H.view] || !VIEWS[H.view].visible()) H.view = 'catalog';
  }

  const _esc = s => (typeof escapeHtml === 'function' ? escapeHtml(String(s)) : String(s));

  function _headerHtml() {
    const seg = [['all', 'Όλες'], ['intl', 'Διεθνείς'], ['natl', 'Εθνικές']]
      .map(([k, l]) => `<button type="button" class="oh-seg-b${H.scope === k ? ' on' : ''}" data-scope="${k}" aria-pressed="${H.scope === k}" onclick="OrdersHub.setScope('${k}')">${l}</button>`).join('');
    const tabs = _visibleViews().map(([k, v]) =>
      `<button type="button" class="oh-tab${H.view === k ? ' on' : ''}" data-view="${k}" aria-selected="${H.view === k}" role="tab" onclick="OrdersHub.setView('${k}')">${_esc(v.label)}<span class="oh-badge${v.badgeTone === 'danger' ? ' danger' : ''}" id="ohBadge_${k}"></span></button>`).join('');
    return `
    <div class="oh-head">
      <div class="oh-titles">
        <div class="page-title">Παραγγελίες</div>
        <div class="page-sub" id="ohSub"></div>
      </div>
      <div class="oh-right">
        <div class="oh-actions" id="ohActions"></div>
        <div class="oh-seg" role="group" aria-label="Εύρος">${seg}</div>
      </div>
    </div>
    <div class="oh-tabs" role="tablist">${tabs}<div class="oh-tabs-extra" id="ohTabsExtra"></div></div>
    <div id="ordersBody" class="oh-body"></div>`;
  }

  async function render() {
    _applyPreset();
    _ensureStyles();
    if (typeof OrdersCommon !== 'undefined') OrdersCommon.ensureStyles();
    const c = document.getElementById('content');
    c.innerHTML = _headerHtml();
    await _renderBody();
    refreshBadges();
  }

  // Re-draw the current view only (header stays): used after a save/delete in
  // any view and by the modules' own «rerender» calls.
  async function _renderBody() {
    const body = document.getElementById('ordersBody');
    if (!body) return;
    const token = ++H.token;
    const v = VIEWS[H.view];
    document.getElementById('ohSub').textContent = '';
    document.getElementById('ohActions').innerHTML = '';
    document.getElementById('ohTabsExtra').innerHTML = '';
    body.innerHTML = typeof showLoading === 'function' ? showLoading('Φόρτωση…') : '';
    const ctx = {
      body, scope: H.scope, view: H.view,
      isCurrent: () => token === H.token && typeof currentPage !== 'undefined' && currentPage === 'orders',
      setSub: t => { const el = document.getElementById('ohSub'); if (el && token === H.token) el.textContent = t; },
      setActions: html => { const el = document.getElementById('ohActions'); if (el && token === H.token) el.innerHTML = html; },
      setTabsExtra: html => { const el = document.getElementById('ohTabsExtra'); if (el && token === H.token) el.innerHTML = html; },
    };
    try {
      await v.render(ctx);
    } catch (e) {
      // DESIGN #7: what happened · what it does NOT mean · what to do.
      if (token === H.token) body.innerHTML = typeof showError === 'function'
        ? showError('Η σελίδα δεν φορτώθηκε. Δεν σημαίνει ότι λείπουν δεδομένα — η ανάγνωση απέτυχε. Ξαναδοκίμασε· αν επιμένει, ενημέρωσε τον διαχειριστή.')
        : 'Σφάλμα φόρτωσης';
      if (typeof logError === 'function') logError(e, 'orders hub: ' + H.view);
    }
  }

  function setScope(s) {
    if (H.scope === s || !['all', 'intl', 'natl'].includes(s)) return;
    H.scope = s; _savePrefs();
    document.querySelectorAll('.oh-seg-b').forEach(b => { const on = b.dataset.scope === s; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    _renderBody();
    refreshBadges();
  }
  function setView(v) {
    if (!VIEWS[v] || !VIEWS[v].visible()) return;
    H.view = v; _savePrefs();
    document.querySelectorAll('.oh-tab').forEach(b => { const on = b.dataset.view === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    _renderBody();
  }

  // Public: «redraw what is on screen». When the hub is not the current page
  // (e.g. a form saved from the dashboard), open the hub instead of painting
  // into someone else's page.
  function refresh() {
    if (typeof OrdersData !== 'undefined') OrdersData.invalidate();
    if (typeof currentPage !== 'undefined' && currentPage === 'orders' && document.getElementById('ordersBody')) {
      refreshBadges();
      return _renderBody();
    }
    return navigate('orders');
  }
  // Open the hub on a given scope/view (links from other pages).
  function open(scope, view) { preset({ scope, view }); navigate('orders'); }
  // Open ONE order in its own catalog with its card (the «Άνοιγμα →» of the
  // money views): the card and its actions belong to the type's own module.
  function openOrder(type, id) {
    H.pendingSelect = { type, id };
    if (typeof currentPage !== 'undefined' && currentPage === 'orders' && document.getElementById('ordersBody')) {
      H.scope = type; H.view = 'catalog'; _savePrefs();
      document.getElementById('content').innerHTML = _headerHtml();
      _renderBody().then(refreshBadges);
      return;
    }
    open(type, 'catalog');
  }
  function _consumeSelect() {
    const p = H.pendingSelect; H.pendingSelect = null;
    if (p && typeof OrdersCatalog !== 'undefined') OrdersCatalog.open(p.type, p.id);
  }

  // ── Counters ────────────────────────────────────────────────────────────
  // Tab counters follow the scope; the sidebar counter is the ROLE's queue,
  // all types (owner 28/9 design: Ειρήνη → «Προς τιμολόγηση», owner → «Χωρίς
  // τιμή», dispatcher none). Both come from the one OrdersData set — the same
  // records the views list, so a counter can never disagree with its list.
  async function refreshBadges() {
    // Dispatcher: no money queue, no counter — and no all-time invoicing read
    // just to paint a number on a read-only tab.
    if (!(typeof can === 'function' && can('costs') !== 'none')) { _setNavBadge(''); return; }
    let set;
    try { set = await OrdersData.loadInvoicingSet(); } catch (e) { console.warn('orders hub: counters', e); return; }
    const inScope = r => H.scope === 'all' || r._type === H.scope;
    let ready = 0, noprice = 0, readyAll = 0, nopriceAll = 0;
    for (const r of OrdersData.all(set)) {
      const s = OrdersData.stateOf(set, r);
      const isReady = s.key === 'ready', isNp = s.key === 'blocked' && s.reason === 'price';
      if (isReady) readyAll++;
      if (isNp) nopriceAll++;
      if (!inScope(r)) continue;
      if (isReady) ready++;
      if (isNp) noprice++;
    }
    _setBadge('invoicing', ready);
    _setBadge('noprice', noprice);
    const navRole = _role() === 'accountant' ? readyAll : (_role() === 'owner' ? nopriceAll : 0);
    _setNavBadge(navRole);
  }
  function _setBadge(view, n) { const el = document.getElementById('ohBadge_' + view); if (el) el.textContent = n ? String(n) : ''; }
  function _setNavBadge(n) {
    const nav = document.getElementById('nav_orders'); if (!nav) return;
    let b = nav.querySelector('.oh-navbadge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'oh-navbadge'; nav.appendChild(b); }
    b.textContent = String(n);
  }

  // ── The catalog view: ONE list for every scope (modules/orders_catalog.js).
  // The two old per-type lists are not drawn any more — one list, one set of
  // columns, one code path (principle 3); the modules keep loading + cards.
  register('catalog', {
    label: 'Κατάλογος', order: 1,
    render: async ctx => { await OrdersCatalog.render(ctx); _consumeSelect(); },
  });

  // Tokens only (DESIGN.md #1); Syne only for the title (page-title class).
  function _ensureStyles() {
    if (document.getElementById('ohStyles')) return;
    const st = document.createElement('style'); st.id = 'ohStyles';
    st.textContent = `
.oh-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-4);margin-bottom:var(--space-3)}
.oh-right{display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;justify-content:flex-end}
.oh-actions{display:flex;gap:var(--space-2);align-items:center}
.oh-seg{display:inline-flex;background:var(--surface-sunken);border:1px solid var(--border);border-radius:8px;padding:2px}
.oh-seg-b{border:1px solid transparent;background:transparent;color:var(--text-mid);font:500 12.5px 'DM Sans',sans-serif;padding:5px 14px;border-radius:6px;cursor:pointer}
.oh-seg-b.on{background:var(--bg-card);border-color:var(--border-mid);color:var(--text);font-weight:600}
.oh-tabs{display:flex;align-items:flex-end;gap:28px;border-bottom:1px solid var(--border-mid);margin-bottom:var(--space-3)}
.oh-tab{position:relative;border:none;background:none;padding:6px 0 10px;font:500 13.5px 'DM Sans',sans-serif;color:var(--text-mid);cursor:pointer}
.oh-tab.on{color:var(--text);font-weight:600}
.oh-tab.on::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:3px;background:var(--surface-dark)}
.oh-badge{margin-left:7px;font-size:11px;font-weight:600;color:var(--text-mid);font-variant-numeric:tabular-nums}
.oh-badge:empty{display:none}
.oh-tab.on .oh-badge{color:var(--text)}
.oh-badge.danger{color:var(--danger)}
.oh-tabs-extra{margin-left:auto;padding-bottom:6px}
.oh-navbadge{margin-left:auto;font-size:11px;font-weight:600;color:var(--text-on-dark);font-variant-numeric:tabular-nums}`;
    document.head.appendChild(st);
  }

  return { register, preset, render, refresh, open, openOrder, setScope, setView, refreshBadges, get scope() { return H.scope; }, get view() { return H.view; } };
})();

function renderOrders() { return OrdersHub.render(); }
window.OrdersHub = OrdersHub;
window.renderOrders = renderOrders;
