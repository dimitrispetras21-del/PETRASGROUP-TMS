// ═══════════════════════════════════════════════════════════════════════════
// MODULE — ORDERS CATALOG «Όλες» (international + national in one list)
//
// Owner 28/9/2026 («να συμπτύξουμε εθνικές και διεθνείς … σε ένα page» → «ναι»),
// Figma round 6 frame 804:1011. One list, one set of columns for both types:
// ΦΟΡΤΩΣΗ and ΠΑΡΑΔΟΣΗ are separate columns with the place NAME on top and a
// grey «City CC» + date below (owner 28/9), and an invoiced order shows its ERP
// number «✓ ΤΠΥ 0433» in green (owner 28/9).
//
// What this file does NOT own: loading and the card. The records come from the
// two modules' own loaders (loadOrdersIntlData / loadOrdersNatlData) and a row
// opens the module's own card (selectIntlOrder / selectNatlOrder) in the same
// layout — so edit, duplicate, delete, pallet sheets and every cascade behind
// them stay exactly the code the dispatchers use today. A second card for the
// mixed list would be a second truth about what an order is (principle 3).
// ═══════════════════════════════════════════════════════════════════════════
const OrdersCatalog = (() => {
  'use strict';

  const ROW_H = 46, BUFFER = 12;
  const S = {
    period: '60', rows: [], filtered: [], noLoad: new Set(), filters: {},
    sortCol: 'load', sortDir: 2, selected: null, ctx: null,
    vs: { sortedRecs: [], lastStart: -1, lastEnd: -1, rafId: null },
  };
  const C = () => OrdersCommon;
  const esc = s => escapeHtml(String(s == null ? '' : s));

  // Display words only — the raw values are never rewritten (filters and
  // writes keep reading the field). A national order with no Status stays «—»:
  // the intl-empty-means-Pending asymmetry is an open owner decision ([4]),
  // not something the merged list settles silently.
  const STATUS = {
    'Pending':    ['Σε αναμονή', 'pending'],
    'Assigned':   ['Ανατέθηκε', 'assigned'],
    'Confirmed':  ['Επιβεβαιώθηκε', 'confirmed'],
    'In Transit': ['Σε μεταφορά', 'transit'],
    'Delivered':  ['Παραδόθηκε', 'delivered'],
    'Invoiced':   ['Τιμολογήθηκε', 'delivered'],
    'Cancelled':  ['Ακυρώθηκε', 'cancelled'],
  };
  const DIR = { Export: 'Εξαγωγή', Import: 'Εισαγωγή', 'South→North': 'Άνοδος', 'North→South': 'Κάθοδος' };
  const PERIOD_LABEL = { '60': 'τελευταίες 60 ημέρες', '180': 'τελευταίοι 6 μήνες', all: 'όλες οι ημερομηνίες' };

  function _status(r) { return r.f['Status'] || (r.type === 'intl' ? 'Pending' : ''); }

  // Assignment, in the words of each type (the same facts the two lists show):
  //   intl → partner company, or plate + driver; «προς ανάθεση» when open;
  //   natl → «εκτός» + «Στείλε →» when the national load is missing (the one
  //          real gap, owner 22/9), «μέσω ομαδοπ.» for groupage, else «στο
  //          Εβδομαδιαίο» (a NAT_LOAD exists — plates live on the trip).
  function _assign(r) {
    const f = r.f;
    if (r.type === 'natl') {
      if (S.noLoad.has(r.id)) return { key: 'out', html: `<span class="oc-dot danger"></span><span class="oc-red">εκτός</span> <button type="button" class="oc-link" onclick="event.stopPropagation();_natlSendToWeekly('${r.id}')" title="Δημιουργεί το φορτίο που λείπει — μετά εμφανίζεται στο Εβδομαδιαίο Εθνικών">Στείλε →</button>`, text: 'εκτός Εβδομαδιαίου' };
      if (f['National Groupage']) return { key: 'grp', html: '<span class="oc-dot hollow"></span>μέσω ομαδοπ.', text: 'μέσω ομαδοποίησης' };
      return { key: 'in', html: '<span class="oc-dot ok"></span>στο Εβδομαδιαίο', text: 'στο Εβδομαδιαίο' };
    }
    const pid = (f['Partner'] || [])[0];
    if (pid) {
      const pr = (typeof getRefPartners === 'function' ? getRefPartners() : []).find(x => x.id === pid);
      const name = pr?.fields?.['Company Name'] || '—';
      return { key: 'partner', html: `<span class="oc-l1" title="${esc(name)}">${esc(name)}</span><span class="oc-l2">συνεργάτης</span>`, text: name + ' · συνεργάτης' };
    }
    const tid = (f['Truck'] || [])[0], did = (f['Driver'] || [])[0];
    if (!tid && !did) {
      const st = _status(r);
      if (st === 'Delivered' || st === 'Cancelled' || st === 'Invoiced') return { key: 'none', html: '<span class="oc-dim">—</span>', text: '' };
      return { key: 'pa', html: '<span class="oc-dot hollow"></span><span class="oc-dim">προς ανάθεση</span>', text: 'προς ανάθεση' };
    }
    const t = tid ? (typeof getRefTrucks === 'function' ? getRefTrucks() : []).find(x => x.id === tid) : null;
    const d = did ? (typeof getRefDrivers === 'function' ? getRefDrivers() : []).find(x => x.id === did) : null;
    const plate = t?.fields?.['License Plate'] || '—';
    const drv = (d?.fields?.['Full Name'] || '').trim();
    return { key: 'own', html: `<span class="oc-l1">${esc(plate)}</span><span class="oc-l2" title="${esc(drv)}">${esc(drv)}</span>`, text: [plate, drv].filter(Boolean).join(' · ') };
  }

  function _row(rec, type) {
    const r = { id: rec.id, type, rec, f: rec.fields };
    const f = r.f;
    rec._type = type;
    r.fields = f;                       // OrdersList.sortRecords reads .fields
    r.num = C().numLabel(rec);
    r.no = Number(f['Order No']) || 0;
    r.ref = String(f['Reference'] || '').replace(/["']+/g, '').trim();
    r.dir = DIR[f['Direction']] || '';
    r.client = typeof fhClientName === 'function' ? fhClientName(f['Client']) : '';
    r.load = C().placeOf(rec, 'load');
    r.del = C().placeOf(rec, 'del');
    r.pal = type === 'intl' ? f['Total Pallets'] : f['Pallets'];
    r.assign = _assign(r);
    r.status = _status(r);
    r.price = C().price(f);
    r.week = C().weekStartOf(rec);
    r.pre = type === 'intl' && typeof isPreorder === 'function' && isPreorder(f);
    r.tags = [];
    if (type === 'intl' && f['Veroia Switch']) r.tags.push('VS');
    if (f['National Groupage']) r.tags.push('GRP');
    if (f['Pallet Exchange']) r.tags.push('PE');
    if (type === 'intl' && f['High Risk Flag']) r.tags.push('HR');
    return r;
  }

  // ── Columns (widths for 1440 with the card closed; table-layout:fixed
  // scales them when the ~480px card opens) ─────────────────────────────────
  const COLS = [
    { key: 'no',     label: 'ΑΡ.',        w: 60,  type: 'number', get: (f, r) => (r.type === 'natl' ? 1e7 : 0) + r.no },
    { key: 'ref',    label: 'ΑΝΑΦΟΡΑ',    w: 116, type: 'text',   get: (f, r) => r.ref },
    { key: 'client', label: 'ΠΕΛΑΤΗΣ',    w: 150, type: 'text',   get: (f, r) => r.client },
    { key: 'load',   label: 'ΦΟΡΤΩΣΗ',    w: 168, type: 'date',   get: (f) => f['Loading DateTime'] || '' },
    { key: 'del',    label: 'ΠΑΡΑΔΟΣΗ',   w: 168, type: 'date',   get: (f) => f['Delivery DateTime'] || '' },
    { key: 'pal',    label: 'ΠΑΛ.',       w: 44,  type: 'number', get: (f, r) => r.pal || 0 },
    { key: 'assign', label: 'ΑΝΑΘΕΣΗ',    w: 130, type: 'text',   get: (f, r) => r.assign.text },
    { key: 'status', label: 'ΚΑΤΑΣΤΑΣΗ',  w: 112, type: 'text',   get: (f, r) => r.status },
    { key: 'price',  label: 'ΤΙΜΗ €',     w: 84,  type: 'number', get: (f, r) => r.price || 0 },
    { key: 'inv',    label: 'ΤΙΜΟΛΟΓΙΟ',  w: 104, type: 'text',   get: (f) => String(f['Invoice Number'] || '') },
  ];

  function _rowHtml(r) {
    const f = r.f;
    const sel = r.id === S.selected ? ' selected' : '';
    const tags = r.tags.map(t => `<span class="oc-tag">${t}</span>`).join('');
    const [stWord, stDot] = STATUS[r.status] || [r.status || '—', 'unknown'];
    const statusHtml = r.pre && typeof preorderPillHtml === 'function' ? preorderPillHtml(f)
      : `<span class="oc-sdot oc-s-${stDot}"></span>${esc(stWord)}`;
    const priceHtml = r.price !== null ? esc(C().eur(r.price))
      : (r.status === 'Cancelled' || r.pre ? '<span class="oc-dim">—</span>' : '<span class="oc-red">χωρίς τιμή</span>');
    return `<tr id="ocrow_${r.id}" class="oc-row${sel}" style="height:${ROW_H}px" onclick="OrdersCatalog.open('${r.type}','${r.id}')">
      <td class="oc-num"><b>${esc(r.num)}</b></td>
      <td><span class="oc-l1" title="${esc(r.ref)}">${r.ref ? esc(r.ref) : '<span class="oc-dim">— χωρίς αναφορά</span>'}</span><span class="oc-l2">${esc(r.dir)}${tags}</span></td>
      <td><span class="oc-l1 oc-plain" title="${r.client}">${r.client}</span></td>
      <td>${r.pre ? '<span class="oc-dim">—</span>' : C().placeCell(r.load)}</td>
      <td>${r.pre ? '<span class="oc-dim">—</span>' : C().placeCell(r.del)}</td>
      <td class="oc-r">${r.pal ? esc(r.pal) : '<span class="oc-dim">—</span>'}</td>
      <td>${r.assign.html}</td>
      <td class="oc-nowrap">${statusHtml}</td>
      <td class="oc-r oc-med">${priceHtml}</td>
      <td>${C().invCell(f)}</td>
    </tr>`;
  }

  // ── Filters ──────────────────────────────────────────────────────────────
  function _inScope(r) { const s = S.ctx ? S.ctx.scope : 'all'; return s === 'all' || r.type === s; }
  function _apply() {
    const F = S.filters;
    let rows = S.rows.filter(_inScope);
    if (F.q) {
      const q = F.q;
      rows = rows.filter(r => [r.num, r.ref, _unesc(r.client), r.load.name, r.load.sub, r.del.name, r.del.sub, r.f['Goods'] || '', r.f['Invoice Number'] || '']
        .some(s => String(s).toLowerCase().includes(q)));
    }
    if (F.dir) rows = rows.filter(r => r.f['Direction'] === F.dir);
    if (F.status) rows = rows.filter(r => r.status === F.status);
    // Brand exists on international orders only (core/orders-list.js
    // filterSpecs.natl has no Brand): picking a brand narrows to international.
    if (F.brand) rows = rows.filter(r => r.type === 'intl' && r.f['Brand'] === F.brand);
    if (F.week) rows = rows.filter(r => r.week === F.week);
    if (F.chip === 'pa') rows = rows.filter(r => r.assign.key === 'pa' && !r.pre);
    if (F.chip === 'out') rows = rows.filter(r => r.assign.key === 'out');
    if (F.chip === 'noprice') rows = rows.filter(r => r.price === null && r.status !== 'Cancelled' && !r.pre);
    S.filtered = rows;
    _paintTable();
    _paintKpi();
  }

  function _kpis(rows) {
    const live = rows.filter(r => r.status !== 'Cancelled');
    return {
      total: rows.length,
      intl: rows.filter(r => r.type === 'intl').length,
      natl: rows.filter(r => r.type === 'natl').length,
      transit: rows.filter(r => r.status === 'In Transit').length,
      delivered: rows.filter(r => C().isDelivered(r.rec)).length,
      value: live.filter(r => r.price !== null).reduce((s, r) => s + r.price, 0),
      unpriced: live.filter(r => r.price === null && !r.pre).length,
      pa: rows.filter(r => r.assign.key === 'pa' && !r.pre).length,
      out: rows.filter(r => r.assign.key === 'out').length,
    };
  }

  // The KPI band describes the SCOPE (not the text filters) — the chips are
  // entry points into it, like the Figma; the count under the table follows
  // the filters.
  function _paintKpi() {
    const box = document.getElementById('ocKpi'); if (!box) return;
    const all = !S.ctx || S.ctx.scope === 'all';
    const k = _kpis(S.rows.filter(_inScope));
    const stat = (l, v) => `<div class="oc-stat"><div class="oc-k">${l}</div><div class="oc-v">${v}</div></div>`;
    const chip = (key, l, n, red) => n ? `<button type="button" class="oc-chip${red ? ' red' : ''}${S.filters.chip === key ? ' on' : ''}" onclick="OrdersCatalog.chip('${key}')">${l} <b>${n}</b></button>` : '';
    box.innerHTML = `
      <div class="oc-stats">${stat('Σύνολο', k.total)}${all ? stat('Διεθνείς', k.intl) + stat('Εθνικές', k.natl) : ''}${stat('Σε μεταφορά', k.transit)}${stat('Παραδόθηκαν', k.delivered)}</div>
      <div class="oc-hero"><div class="oc-k">Αξία περιόδου</div><div><span class="oc-hv">${esc(C().eurSym(k.value))}</span>${k.unpriced ? `<span class="oc-hc">εκτός ${k.unpriced} χωρίς τιμή</span>` : ''}</div></div>
      <div class="oc-chips">${chip('pa', 'Προς ανάθεση', k.pa)}${chip('out', 'Εκτός Εβδομαδιαίου', k.out, true)}${chip('noprice', 'Χωρίς τιμή', k.unpriced, true)}</div>`;
  }

  function _paintTable() {
    const wrap = document.getElementById('ocTable'); if (!wrap) return;
    if (!S.filtered.length) {
      const any = Object.keys(S.filters).some(k => S.filters[k] && k !== 'qRaw');
      wrap.innerHTML = showEmpty({
        illustration: 'order',
        title: any ? 'Καμία παραγγελία με αυτά τα φίλτρα' : 'Καμία παραγγελία σε αυτή την περίοδο',
        description: any ? `Από ${S.rows.filter(_inScope).length} συνολικά · ${PERIOD_LABEL[S.period]}.` : `Περίοδος: ${PERIOD_LABEL[S.period]}.`,
        action: any ? { label: 'Καθαρισμός φίλτρων', onClick: 'OrdersCatalog.clear()' } : null,
      });
      return;
    }
    const sorted = OrdersList.sortRecords(S.filtered, COLS, S.sortCol, S.sortDir);
    S.vs.sortedRecs = sorted; S.vs.lastStart = -1; S.vs.lastEnd = -1;
    wrap.innerHTML = OrdersList.tableShell({
      colDefs: COLS, sortCol: S.sortCol, sortDir: S.sortDir, sortToggle: 'OrdersCatalog.sort',
      ids: { scroller: 'ocVScroll', top: 'ocTop', bottom: 'ocBottom' }, rowH: ROW_H, total: sorted.length,
      legend: '<b>#</b> διεθνής · <b>Ε-</b> εθνική · <b>VS</b> Veroia Switch · <b>GRP</b> ομαδοποίηση · <b>PE</b> ανταλλαγή παλετών · <b>HR</b> υψηλό ρίσκο · <b class="oc-g">✓ ΤΠΥ</b> τιμολογήθηκε στο ERP',
      legendClass: 'oc-legend', footClass: 'oc-foot',
    });
    document.getElementById('ocVScroll').addEventListener('scroll', () => OrdersList.virtualOnScroll(S.vs, _paint), { passive: true });
    _paint();
  }
  function _paint() {
    OrdersList.virtualPaint(S.vs, { scrollerId: 'ocVScroll', topSpacerId: 'ocTop', bottomSpacerId: 'ocBottom', rowH: ROW_H, buffer: BUFFER, rowHtml: _rowHtml });
  }

  function _weekOptions() {
    const weeks = [...new Set(S.rows.filter(_inScope).map(r => r.week).filter(Boolean))].sort().reverse();
    const cur = C().weekStartOfYmd(C().today());
    return weeks.map(w => `<option value="${w}"${S.filters.week === w ? ' selected' : ''}>${w === cur ? '→ ' : ''}${C().weekLabel(w)}</option>`).join('');
  }

  function _layoutHtml() {
    const opt = (v, l, cur) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${l}</option>`;
    const F = S.filters;
    return `
    <div class="oc-kpi" id="ocKpi"></div>
    <div class="oc-toolbar">
      <div class="entity-search-wrap oc-search">${typeof icon === 'function' ? icon('search', 14) : ''}
        <input class="entity-search-input" placeholder="Αριθμός, αναφορά, πελάτης, τόπος, ΤΠΥ" value="${esc(F.qRaw || '')}" oninput="OrdersCatalog.search(this.value)">
      </div>
      <select class="svc-filter" onchange="OrdersCatalog.filter('dir',this.value)">${opt('', 'Κατεύθυνση: Όλες', F.dir || '')}${opt('Export', 'Εξαγωγή', F.dir)}${opt('Import', 'Εισαγωγή', F.dir)}${opt('South→North', 'Άνοδος', F.dir)}${opt('North→South', 'Κάθοδος', F.dir)}</select>
      <select class="svc-filter" onchange="OrdersCatalog.filter('status',this.value)">${opt('', 'Κατάσταση: Όλες', F.status || '')}${Object.entries(STATUS).filter(([k]) => k !== 'Invoiced').map(([k, v]) => opt(k, v[0], F.status)).join('')}</select>
      <select class="svc-filter" onchange="OrdersCatalog.filter('brand',this.value)" title="Μόνο οι διεθνείς έχουν μάρκα">${opt('', 'Μάρκα: Όλες', F.brand || '')}${opt('Petras Group', 'Petras Group', F.brand)}${opt('DPS', 'DPS', F.brand)}</select>
      <select class="svc-filter" onchange="OrdersCatalog.filter('week',this.value)" title="Εβδομάδα όπως στο Weekly (Σάββατο–Παρασκευή)"><option value="">Εβδομάδα: Όλες</option>${_weekOptions()}</select>
      <select class="svc-filter" onchange="OrdersCatalog.period(this.value)">${opt('60', 'Τελευταίες 60 ημέρες', S.period)}${opt('180', 'Τελευταίοι 6 μήνες', S.period)}${opt('all', 'Όλα', S.period)}</select>
      <button type="button" class="oc-link" onclick="OrdersCatalog.clear()">Καθαρισμός</button>
    </div>
    <div class="entity-layout oi-layout on-v2 oc-cat">
      <div class="entity-list-panel"><div class="oc-tablewrap" id="ocTable"></div></div>
      <div class="entity-detail-panel hidden" id="intlDetail"></div>
      <div class="entity-detail-panel hidden" id="natlDetail"></div>
    </div>`;
  }

  function _actionsHtml() {
    const canEdit = typeof can === 'function' && can('orders') === 'full';
    const _i = n => (typeof icon === 'function' ? icon(n, 14) : '');
    const menu = canEdit ? `
      <div class="oc-new">
        <button type="button" class="btn btn-primary btn-sm" onclick="OrdersCatalog.toggleNew(event)">+ Νέα παραγγελία ▾</button>
        <div class="oc-menu hidden" id="ocNewMenu">
          <button type="button" onclick="OrdersCatalog.newOrder('intl')">Διεθνής</button>
          <button type="button" onclick="OrdersCatalog.newOrder('natl')">Εθνική</button>
          <button type="button" onclick="OrdersCatalog.newOrder('pre')">Pre-order</button>
          <button type="button" onclick="OrdersCatalog.newOrder('scan-intl')">Σάρωση διεθνούς</button>
          <button type="button" onclick="OrdersCatalog.newOrder('scan-natl')">Σάρωση εθνικής</button>
        </div>
      </div>` : '';
    return `<button type="button" class="btn btn-ghost btn-sm" onclick="OrdersCatalog.csv()">${_i('download')} CSV</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="OrdersCatalog.print()">${_i('file_text')} Εκτύπωση</button>${menu}`;
  }

  async function render(ctx) {
    S.ctx = ctx;
    _ensureStyles();
    OrdersCommon.ensureStyles();
    const [intl, natl] = await Promise.all([loadOrdersIntlData(S.period), loadOrdersNatlData(S.period)]);
    if (!ctx.isCurrent()) return;
    S.noLoad = natl.noLoad || new Set();
    S.rows = [...intl.records.map(r => _row(r, 'intl')), ...natl.records.map(r => _row(r, 'natl'))];
    ctx.setActions(_actionsHtml());
    ctx.body.innerHTML = [...(intl.warns || []), ...(natl.warns || [])].map(w => `<div class="oc-warn">⚠ ${esc(w)}</div>`).join('') + _layoutHtml();
    _apply();
    const n = S.rows.filter(_inScope).length;
    ctx.setSub(`Διεθνείς και εθνικές · ${OrdersList.countLabel(n)} · ${PERIOD_LABEL[S.period]}`);
  }

  // ── Public handlers (inline onclick) ─────────────────────────────────────
  function open(type, id) {
    S.selected = id;
    document.querySelectorAll('#ocTable tr.selected').forEach(tr => tr.classList.remove('selected'));
    const row = document.getElementById('ocrow_' + id); if (row) row.classList.add('selected');
    if (type === 'intl') { if (typeof closeNatlDetail === 'function') closeNatlDetail(); selectIntlOrder(id); }
    else { if (typeof _oiCloseCard === 'function') _oiCloseCard(); selectNatlOrder(id); }
  }
  function search(v) { S.filters.qRaw = v; S.filters.q = String(v || '').toLowerCase().trim(); _apply(); }
  function filter(k, v) { if (v) S.filters[k] = v; else delete S.filters[k]; _apply(); }
  function chip(k) { S.filters.chip = S.filters.chip === k ? '' : k; _apply(); }
  function clear() {
    S.filters = {};
    // Same rule as the two lists (OI-4): «clear» also widens the period, which
    // needs a refetch, not a re-filter.
    if (S.period !== 'all') { S.period = 'all'; OrdersHub.refresh(); } else { _apply(); }
  }
  function period(v) { S.period = v; OrdersHub.refresh(); }
  function sort(key) {
    if (S.sortCol === key) { S.sortDir = (S.sortDir + 1) % 3; if (S.sortDir === 0) S.sortCol = null; }
    else { S.sortCol = key; S.sortDir = 1; }
    _paintTable();
  }
  function toggleNew(ev) {
    ev.stopPropagation();
    const m = document.getElementById('ocNewMenu'); if (!m) return;
    m.classList.toggle('hidden');
    if (!m.classList.contains('hidden')) setTimeout(() => document.addEventListener('click', () => m.classList.add('hidden'), { once: true }), 0);
  }
  function newOrder(kind) {
    document.getElementById('ocNewMenu')?.classList.add('hidden');
    if (kind === 'intl') return openIntlCreate();
    if (kind === 'natl') return openNatlCreate();
    if (kind === 'pre') return openPreorder();
    if (kind === 'scan-intl') return openIntlScan();
    if (kind === 'scan-natl') return openNatlScan();
  }

  // fhClientName returns HTML-escaped text; CSV/print/search need the plain name.
  function _unesc(s) { const d = document.createElement('textarea'); d.innerHTML = String(s || ''); return d.value; }
  function _plain(p) { return p && (p.name || p.sub) ? [p.name, p.sub].filter(Boolean).join(', ') : ''; }
  function csv() {
    const head = ['ΑΡ.', 'Τύπος', 'Αναφορά', 'Κατεύθυνση', 'Πελάτης', 'Φόρτωση', 'Ημ. φόρτωσης', 'Παράδοση', 'Ημ. παράδοσης', 'Παλέτες', 'Ανάθεση', 'Κατάσταση', 'Τιμή', 'ΤΠΥ', 'Ημ. ΤΠΥ'];
    const rows = S.filtered.map(r => [r.num, r.type === 'intl' ? 'Διεθνής' : 'Εθνική', r.ref, r.dir, _unesc(r.client), _plain(r.load), C().ymd(r.f['Loading DateTime']),
      _plain(r.del), C().ymd(r.f['Delivery DateTime']), r.pal || '', r.assign.text, (STATUS[r.status] || [r.status])[0] || '',
      r.price !== null ? C().eur(r.price) : '', r.f['Invoice Number'] || '', C().ymd(r.f['Invoice Date'])]);
    OrdersList.csvDownload([head, ...rows], `paraggelies_${C().today()}.csv`);
  }
  function print() {
    const tr = S.filtered.map(r => `<tr><td>${esc(r.num)}</td><td>${esc(r.ref)}<br><small>${esc(r.dir)}</small></td><td>${esc(_unesc(r.client))}</td>
      <td>${esc(r.load.name)}<br><small>${esc(r.load.sub)} · ${C().dm(r.load.date)}</small></td><td>${esc(r.del.name)}<br><small>${esc(r.del.sub)} · ${C().dm(r.del.date)}</small></td>
      <td class="r">${esc(r.pal || '')}</td><td>${esc((STATUS[r.status] || [r.status])[0] || '')}</td><td class="r">${r.price !== null ? esc(C().eur(r.price)) : '—'}</td>
      <td>${r.f['Invoice Number'] ? '✓ ΤΠΥ ' + esc(r.f['Invoice Number']) : ''}</td></tr>`).join('');
    OrdersList.printOpen(`<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Παραγγελίες</title><style>
      @page{size:A4 landscape;margin:12mm}body{font:10px/1.35 'DM Sans',Arial,sans-serif;color:#000}h1{font-size:15px;margin:0 0 2px}
      .s{color:#444;margin-bottom:8px}table{width:100%;border-collapse:collapse}th{font-size:8.5px;text-align:left;border-bottom:1px solid #000;padding:3px}
      td{border-bottom:1px solid #ccc;padding:3px;vertical-align:top}small{color:#444}.r{text-align:right}</style></head><body>
      <h1>Παραγγελίες</h1><div class="s">${esc(OrdersList.countLabel(S.filtered.length))} · ${esc(PERIOD_LABEL[S.period])} · ${esc(C().dm(C().today()))}</div>
      <table><thead><tr><th>ΑΡ.</th><th>ΑΝΑΦΟΡΑ</th><th>ΠΕΛΑΤΗΣ</th><th>ΦΟΡΤΩΣΗ</th><th>ΠΑΡΑΔΟΣΗ</th><th class="r">ΠΑΛ.</th><th>ΚΑΤΑΣΤΑΣΗ</th><th class="r">ΤΙΜΗ €</th><th>ΤΙΜΟΛΟΓΙΟ</th></tr></thead><tbody>${tr}</tbody></table>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script></body></html>`);
  }

  // Tokens only (DESIGN.md #1). The print sheet is plain black-on-white.
  function _ensureStyles() {
    if (document.getElementById('ocCatStyles')) return;
    const st = document.createElement('style'); st.id = 'ocCatStyles';
    st.textContent = `
.oc-kpi{display:flex;align-items:center;gap:var(--space-4);background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px 18px;margin-bottom:var(--space-3)}
.oc-stats{display:flex;gap:26px}.oc-k{font-size:11px;color:var(--text-mid)}.oc-v{font-size:15px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums}
.oc-hero{border-left:1px solid var(--border);padding-left:18px}.oc-hv{font:700 19px 'Syne',sans-serif;color:var(--text);font-variant-numeric:tabular-nums}
.oc-hc{margin-left:8px;font-size:11px;color:var(--text-mid)}
.oc-chips{margin-left:auto;display:flex;gap:8px}
.oc-chip{border:1px solid var(--border-mid);background:var(--bg-card);border-radius:6px;padding:4px 10px;font-size:12px;color:var(--text-mid);cursor:pointer}
.oc-chip b{margin-left:6px;color:var(--text)}.oc-chip.red{border-color:var(--danger);color:var(--danger)}.oc-chip.red b{color:var(--danger)}
.oc-chip.on{background:var(--surface-sunken);font-weight:600}
.oc-toolbar{display:flex;gap:var(--space-2);align-items:center;flex-wrap:wrap;margin-bottom:var(--space-3)}
.oc-search{flex:0 1 280px}
.oc-link{border:none;background:none;color:var(--accent);font-weight:600;font-size:12.5px;cursor:pointer;padding:0 4px}
.oc-warn{border:1px solid var(--warn);color:var(--warn);border-radius:6px;padding:6px 10px;font-size:12px;margin-bottom:8px}
.oc-cat .oc-tablewrap{background:var(--bg-card);border:1px solid var(--border);border-radius:8px;overflow:hidden}
.oc-cat .oc-tablewrap thead th{background:var(--surface-sunken);font:700 10.5px/1.3 'DM Sans',sans-serif;letter-spacing:.5px;color:var(--text-mid);padding:9px 8px;border-bottom:1px solid var(--border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
.oc-cat .oc-tablewrap tbody td{padding:0 8px;font-size:12.5px;color:var(--text);border-bottom:1px solid var(--border);vertical-align:middle;overflow:hidden}
.oc-cat .oc-tablewrap tbody tr{cursor:pointer}.oc-cat .oc-tablewrap tbody tr:hover td{background:var(--surface-sunken)}
.oc-cat .oc-tablewrap tbody tr.selected td{background:var(--accent-light)}
.oc-num{font-variant-numeric:tabular-nums;white-space:nowrap}.oc-r{text-align:right;font-variant-numeric:tabular-nums}.oc-med{font-weight:500}.oc-nowrap{white-space:nowrap}
.oc-l1{display:block;font-weight:500;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;line-height:1.3}.oc-l1.oc-plain{font-weight:400}
.oc-l2{display:block;font-size:11.5px;color:var(--text-mid);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;line-height:1.3}
.oc-tag{display:inline-block;margin-left:6px;padding:0 4px;border:1px solid var(--border-mid);border-radius:3px;font-size:9px;font-weight:600;letter-spacing:.3px;color:var(--text-mid);line-height:13px}
.oc-dim{color:var(--text-dim)}.oc-red{color:var(--danger);font-weight:500}.oc-g{color:var(--ok)}
.oc-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:6px;vertical-align:middle;background:var(--text-mid)}
.oc-dot.ok{background:var(--ok)}.oc-dot.danger{background:var(--danger)}.oc-dot.hollow{background:transparent;border:1.5px solid var(--text-mid)}
.oc-sdot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:6px;vertical-align:middle}
.oc-s-pending{border:1.5px solid var(--text-dim)}.oc-s-assigned{background:var(--accent)}.oc-s-confirmed{background:var(--text-mid)}
.oc-s-transit{background:var(--surface-dark)}.oc-s-delivered{background:var(--ok)}.oc-s-cancelled,.oc-s-unknown{border:1.5px solid var(--border-mid)}
.oc-legend{font-size:11px;color:var(--text-mid);padding:8px 12px;border-bottom:1px solid var(--border)}.oc-foot{font-size:11px;color:var(--text-mid);padding:8px 12px}
.oc-new{position:relative}.oc-menu{position:absolute;right:0;top:36px;z-index:30;background:var(--bg-card);border:1px solid var(--border-mid);border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.12);padding:4px;min-width:170px}
.oc-menu.hidden{display:none}.oc-menu button{display:block;width:100%;text-align:left;border:none;background:none;padding:8px 10px;font-size:13px;border-radius:6px;cursor:pointer;color:var(--text)}
.oc-menu button:hover{background:var(--surface-sunken)}`;
    document.head.appendChild(st);
  }

  return { render, open, search, filter, chip, clear, period, sort, toggleNew, newOrder, csv, print };
})();
window.OrdersCatalog = OrdersCatalog;
