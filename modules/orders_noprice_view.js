// ═══════════════════════════════════════════════════════════════════════════
// VIEW — «Χωρίς τιμή» of the one «Παραγγελίες» page (modules/orders_hub.js)
//
// Owner 27/9/2026: «θέλω ένα φίλτρο με όσα είναι χωρίς τιμή γιατί πολλές φορές
// η Ειρήνη χρειάζεται να τα συγκεντρώσει και να μου τα φέρει να τα δω για να
// συμπληρώσω». So: the OWNER writes the prices here (Enter per row); the
// accountant sees the same list WITHOUT inputs and prints it on A4 for him.
// Figma (approved): KO7l2AfucR3HJEDIg1Yptr 808:1275 (screen), 775:1011 (A4).
//
// The list is NOT a query of its own: it is OrdersData.stateOf() ===
// {blocked, reason:'price'} over the one set «Προς τιμολόγηση» reads, so the
// tab counter, the sidebar counter and this list can never disagree
// (principle 3). All weeks, oldest first.
//
// «Συμπληρώθηκαν σήμερα» must be true across sessions, not «what this tab
// did»: for owner/management it comes from GET /audit (every facade PATCH is
// audited with before + after rows since the Worker reads the row before the
// update). The accountant cannot read /audit (Worker AUDIT_READERS) — she gets
// this tab's own saves only, without an error banner, because nothing failed.
// ═══════════════════════════════════════════════════════════════════════════
const OrdersNoPrice = (() => {
  'use strict';

  // Owner 27/9 (Figma H): the red bar / ★ marks an order waiting > 10 days
  // since delivery. One constant so screen, A4 and CSV agree.
  const OVERDUE_DAYS = 10;

  // ── Pure logic (unit-tested in tests/orders-noprice-view.test.js) ───────

  // Greek money input: «950», «950,5», «1.250,00», also «1250.50» typed with a
  // dot. A comma is always the decimal mark (the dots are then thousands); with
  // no comma, a dot is thousands ONLY in the strict «1.250» / «12.500.000»
  // shape, otherwise a decimal point. Anything else → null, never a guess: a
  // wrongly parsed price would go straight to invoicing.
  function parsePrice(raw) {
    let s = String(raw == null ? '' : raw).replace(/[\s €]/g, '');
    if (!s) return null;
    if (s.includes(',')) {
      if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(s)) return null;
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    } else if (!/^\d+(\.\d{1,2})?$/.test(s)) {
      return null;
    }
    const n = Math.round(parseFloat(s) * 100) / 100;
    // > 0: the SAME rule as OrdersCommon.hasPrice / the Worker / migration 043 —
    // a 0 would be written and then still count as «χωρίς τιμή».
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // The list: delivered, not invoiced, no price > 0 (stateOf decides), in scope.
  function selectNoPrice(records, stateOf, scope) {
    return (records || []).filter(r => {
      if (scope && scope !== 'all' && r._type !== scope) return false;
      const s = stateOf(r);
      return s && s.key === 'blocked' && s.reason === 'price';
    });
  }

  const _clientId = r => { const c = (r.fields || {})['Client']; return Array.isArray(c) ? (c[0] || '') : (typeof c === 'string' ? c : ''); };
  const _ymd = raw => String(raw || '').slice(0, 10);
  const _deliveryYmd = r => _ymd((r.fields || {})['Delivery DateTime']);

  // Oldest first by delivery date; an order with no delivery date has no age
  // to rank by, so it goes last (and shows «—» days) instead of pretending.
  function _byOldest(a, b) {
    const da = _deliveryYmd(a), db = _deliveryYmd(b);
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (!da !== !db) return da ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  }
  // Clients ordered by their OLDEST item, items oldest first inside.
  function groupByClient(items) {
    const m = new Map();
    for (const r of items || []) {
      const k = _clientId(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    const groups = [...m.entries()].map(([clientId, arr]) => ({ clientId, items: arr.sort(_byOldest) }));
    groups.sort((g1, g2) => _byOldest(g1.items[0], g2.items[0]));
    return groups;
  }

  // First non-empty link of «<base> 1..10» — the same slots placeOf reads.
  function _firstLink(f, base) {
    for (let i = 1; i <= 10; i++) {
      const v = f[base + ' ' + i];
      const id = Array.isArray(v) ? v[0] : (typeof v === 'string' ? v : null);
      if (id) return id;
    }
    return '';
  }
  // «Same route» = same first loading AND same first delivery location.
  function routeKey(r) {
    const f = r.fields || {};
    const natl = r._type === 'natl';
    const load = _firstLink(f, natl ? 'Pickup Location' : 'Loading Location');
    const del = _firstLink(f, natl ? 'Delivery Location' : 'Unloading Location');
    return load && del ? load + '>' + del : '';
  }
  const _price = r => { const v = parseFloat((r.fields || {})['Price']); return Number.isFinite(v) ? v : null; };

  // ΤΕΛΕΥΤ. ΤΙΜΗ: the most recent OTHER order of the same client on the same
  // route with a price > 0, from the loaded set. A hint for the owner's memory
  // — never written anywhere (owner 27/9: he decides every price).
  function lastPriceHint(rec, pool) {
    const cid = _clientId(rec), key = routeKey(rec);
    if (!cid || !key) return null;
    let best = null, bestDate = '';
    for (const o of pool || []) {
      if (o === rec || (o.id === rec.id && o._type === rec._type)) continue;
      if (_clientId(o) !== cid || routeKey(o) !== key) continue;
      const p = _price(o);
      if (!(p > 0)) continue;
      const d = _deliveryYmd(o) || _ymd((o.fields || {})['Loading DateTime']);
      if (!best || d > bestDate) { best = o; bestDate = d; }
    }
    return best ? { price: _price(best), rec: best, date: bestDate } : null;
  }

  // audit_log.before_data / after_data are written with JSON.stringify into
  // the column, so they come back as JSON strings (audit_trail.js _auditParse).
  const _parse = v => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (_) { return null; }
  };
  // Today's fills from GET /audit entries: an update whose BEFORE row had no
  // price (null / ≤ 0) and whose AFTER row has one. An entry without a before
  // row cannot prove «it had no price» → not counted (the old Worker wrote
  // before_data NULL on facade PATCHes; claiming those would be a guess).
  // One per record: the latest qualifying entry wins. Newest first.
  function filledFromAudit(entries) {
    const byRec = new Map();
    for (const e of entries || []) {
      if (e.action && e.action !== 'update') continue;
      const before = _parse(e.before_data), after = _parse(e.after_data);
      if (!before || !after) continue;
      const bp = parseFloat(before.price), ap = parseFloat(after.price);
      if (bp > 0 || !(ap > 0)) continue;
      const k = e.table_name + '|' + e.record_id;
      const cur = byRec.get(k);
      if (!cur || String(e.created_at) > cur.at) {
        byRec.set(k, { recordId: e.record_id, table: e.table_name, price: ap, actor: e.actor || '', at: String(e.created_at || '') });
      }
    }
    return [...byRec.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }
  // Server truth first; this tab's saves fill in what /audit cannot show
  // (accountant) or has not returned yet.
  function mergeFilled(fromAudit, fromSession) {
    const seen = new Set((fromAudit || []).map(x => x.table + '|' + x.recordId));
    const out = (fromAudit || []).slice();
    for (const s of fromSession || []) if (!seen.has(s.table + '|' + s.recordId)) out.push(s);
    return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }
  const tableOfType = t => (t === 'natl' ? 'national_orders' : 'orders');
  const typeOfTable = t => (t === 'national_orders' ? 'natl' : 'intl');

  // ── View state ──────────────────────────────────────────────────────────
  // This tab's own saves, per calendar day (a tab left open overnight must not
  // carry yesterday's list into «σήμερα»).
  const _session = { day: '', items: [] };
  let V = null;   // { ctx, set, all, list, groups, clientInfo, clientFailed, audit, canWrite }

  const _role = () => (typeof ROLE !== 'undefined' ? ROLE : '');
  const _isOwner = () => _role() === 'owner';
  const _esc = s => escapeHtml(String(s == null ? '' : s));
  const _username = () => { try { return JSON.parse(localStorage.getItem('tms_user') || '{}').username || ''; } catch (_) { return ''; } };
  function _sessionItems() {
    const d = OrdersCommon.today();
    if (_session.day !== d) { _session.day = d; _session.items = []; }
    return _session.items;
  }
  // The roster (config.js USERS) names the actor — the one list the tamper
  // guard already keeps; no second copy of names here (principle 3).
  function _actorShort(username) {
    const u = (typeof USERS !== 'undefined' ? USERS : []).find(x => x.username === username);
    const name = (u && u.name) || username || '';
    const parts = name.trim().split(/\s+/);
    return parts.length > 1 ? parts[0][0] + '. ' + parts.slice(1).join(' ') : name;
  }
  const _hhmm = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false }); };

  // CLIENTS reference data carries only 'Company Name' (api.js _REF_FIELDS —
  // widening it breaks the HAR critics, see the comment there), so ΑΦΜ and
  // όροι are read here for the few clients on the list.
  async function _loadClientInfo(list) {
    const ids = [...new Set(list.map(_clientId).filter(Boolean))];
    const map = {};
    if (!ids.length) return { map, failed: false };
    try {
      for (const batch of OrdersList.chunk(ids, 10)) {
        const f = `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(',')})`;
        const recs = await atGetAll(TABLES.CLIENTS, { filterByFormula: f, fields: ['Company Name', 'VAT Number', 'Payment Terms Days'] }, true);
        recs.forEach(r => { map[r.id] = r.fields || {}; });
      }
      return { map, failed: false };
    } catch (e) {
      console.error('noprice: client details', e);
      return { map, failed: true };
    }
  }

  // GET /audit is owner + management only (Worker AUDIT_READERS). Paged: the
  // Worker caps a page at 200 and a busy morning of dispatcher edits exceeds it.
  async function _loadAudit() {
    if (!['owner', 'management'].includes(_role())) return { items: [], skipped: true };
    const since = new Date(OrdersCommon.today() + 'T00:00:00').toISOString();   // local midnight, as UTC
    const entries = [];
    let truncated = false;
    try {
      for (const t of ['orders', 'national_orders']) {
        for (let page = 0, off = 0; ; page++, off += 200) {
          if (page >= 10) { truncated = true; break; }
          const res = await plFetch(`/audit?table=${t}&action=update&since=${encodeURIComponent(since)}&limit=200&offset=${off}`);
          const got = res.entries || [];
          entries.push(...got);
          if (got.length < 200) break;
        }
      }
      return { items: filledFromAudit(entries), truncated };
    } catch (e) {
      console.error('noprice: /audit', e);
      return { items: [], failed: true };
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  async function render(ctx) {
    const owner = _isOwner();
    ctx.setSub(owner
      ? 'Όλες οι εβδομάδες · γράψε τιμή και Enter — η παραγγελία περνά στα «Προς τιμολόγηση» της Ειρήνης'
      : 'Όλες οι εβδομάδες · παραδομένες χωρίς τιμή — τύπωσέ τη για τον owner');
    const set = await OrdersData.loadInvoicingSet();
    if (!ctx.isCurrent()) return;
    const all = OrdersData.all(set);
    const list = selectNoPrice(all, r => OrdersData.stateOf(set, r), ctx.scope);
    const [ci, audit] = await Promise.all([_loadClientInfo(list), _loadAudit()]);
    if (!ctx.isCurrent()) return;
    V = { ctx, set, all, list, groups: groupByClient(list), clientInfo: ci.map, clientFailed: ci.failed, audit, canWrite: owner };
    // Print is the accountant's primary action (she carries the sheet to the
    // owner) → navy there; for the owner the primary action is the price box.
    const printCls = owner ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm';
    ctx.setActions(`<button type="button" class="${printCls}" onclick="OrdersNoPrice.print()">Εκτύπωση</button>`
      + '<button type="button" class="btn btn-secondary btn-sm" onclick="OrdersNoPrice.csv()">CSV</button>');
    _paint();
  }

  const _rawClientName = id => {
    const n = (V && V.clientInfo[id] && V.clientInfo[id]['Company Name'])
      || (typeof _fhClientsMap !== 'undefined' && _fhClientsMap[id]) || '';
    return n || (id ? '—' : 'Χωρίς πελάτη');
  };
  function _clientMeta(id) {
    const c = (V && V.clientInfo[id]) || {};
    const vat = String(c['VAT Number'] || '').trim();
    const terms = parseInt(c['Payment Terms Days'], 10);
    // NULL fields never arrive (facade trap #2): an absent ΑΦΜ is shown as a
    // gap, not hidden — otherwise a missing one reads like «not needed».
    return { vat, terms: Number.isFinite(terms) && terms > 0 ? terms : null };
  }
  function _pallets(r) {
    const f = r.fields || {};
    const v = r._type === 'natl' ? f['Pallets'] : f['Total Pallets'];
    return v === undefined || v === null || v === '' ? '' : String(v);
  }
  function _goods(r) {
    const f = r.fields || {};
    const t = f['Temperature °C'];
    return [f['Goods'] || '', t !== undefined && t !== null && t !== '' ? t + ' °C' : ''].filter(Boolean).join(' ');
  }
  // Grey line under the dates: own truck's plate, else the partner.
  function _vehicle(r) {
    const f = r.fields || {};
    const tid = (Array.isArray(f['Truck']) && f['Truck'][0]) || '';
    if (tid) {
      const t = getRefTrucks().find(x => x.id === tid);
      if (t && t.fields['License Plate']) return t.fields['License Plate'];
    }
    const pid = (Array.isArray(f['Partner']) && f['Partner'][0]) || '';
    if (pid) {
      const p = getRefPartners().find(x => x.id === pid);
      const plates = String(f['Partner Truck Plates'] || '').trim();
      return [(p && p.fields['Company Name']) || '', plates].filter(Boolean).join(' · ');
    }
    return '';
  }
  const _days = r => OrdersCommon.daysSinceDelivery(r);
  const _overdue = r => { const d = _days(r); return d !== null && d > OVERDUE_DAYS; };
  // «#1209», «Ε-427», or the reference when the national number is not served yet.
  function _label(r) {
    const n = OrdersCommon.numLabel(r);
    if (n !== '—') return n;
    const ref = String((r.fields || {})['Reference'] || '').trim();
    return ref ? 'παραγγελία ' + ref : 'παραγγελία';
  }
  const _dates = r => `${OrdersCommon.dm(r.fields['Loading DateTime'])} → ${OrdersCommon.dm(r.fields['Delivery DateTime'])}`;
  function _hint(r) { return lastPriceHint(r, V.all); }

  function _filledRows() {
    const fromAudit = (V.audit && V.audit.items) || [];
    const merged = mergeFilled(fromAudit, _sessionItems());
    const out = [];
    for (const x of merged) {
      const type = typeOfTable(x.table);
      if (V.ctx.scope !== 'all' && V.ctx.scope !== type) continue;
      const rec = V.all.find(r => r.id === x.recordId && r._type === type);
      // Only orders that belong to THIS list's world: delivered (in the set) and
      // no longer missing a price. A price typed today on an order still in
      // planning is a dispatcher's normal edit, not a «συμπλήρωση» from here.
      if (!rec) continue;
      const st = OrdersData.stateOf(V.set, rec);
      if (st.key === 'pending' || st.key === 'cancelled' || (st.key === 'blocked' && st.reason === 'price')) continue;
      out.push({ x, rec, st });
    }
    return out;
  }

  function _paint(keep) {
    const ctx = V.ctx;
    if (!ctx.isCurrent()) return;
    _ensureStyles();
    const typed = keep || {};
    const owner = V.canWrite;
    const filled = _filledRows();
    // Accountant: /audit is closed to her role (Worker AUDIT_READERS) and she
    // never writes prices, so a «0» here would read as «the owner filled
    // nothing today» — a false zero. Say «—» and why, without an error banner:
    // nothing failed.
    const noHistory = !!V.audit.skipped && !filled.length;
    const oldest = V.list.reduce((m, r) => { const d = _days(r); return d !== null && (m === null || d > _days(m)) ? r : m; }, null);
    const oldestDays = oldest ? _days(oldest) : null;

    const banners = [];
    if (V.set.natlFailed) banners.push('Οι εθνικές παραγγελίες δεν φορτώθηκαν — η λίστα δείχνει μόνο διεθνείς. Δεν σημαίνει ότι οι εθνικές έχουν τιμή· ξαναδοκίμασε.');
    const notes = [];
    if (V.clientFailed) notes.push('τα στοιχεία πελατών (ΑΦΜ, όροι) δεν φορτώθηκαν');
    if (V.audit.failed) notes.push('το ιστορικό σημερινών συμπληρώσεων δεν φορτώθηκε — φαίνονται μόνο όσες έγιναν από αυτή την καρτέλα');
    if (V.audit.truncated) notes.push('το ιστορικό σημερινών συμπληρώσεων είναι πολύ μεγάλο — ίσως λείπουν κάποιες');

    const kpi = `
    <div class="np-kpi">
      <div class="np-k"><div class="np-kl">Εκκρεμούν</div><div class="np-kv">${V.list.length}</div></div>
      <div class="np-k"><div class="np-kl">Παλαιότερη</div><div class="np-kv"><span class="${oldestDays !== null && oldestDays > OVERDUE_DAYS ? 'np-red' : ''}">${oldestDays === null ? '—' : oldestDays + (oldestDays === 1 ? ' ημέρα' : ' ημέρες')}</span>${oldest ? `<span class="np-ks">από παράδοση · ${OrdersCommon.dm(oldest.fields['Delivery DateTime'])}</span>` : ''}</div></div>
      <div class="np-k"><div class="np-kl">Πελάτες</div><div class="np-kv">${V.groups.length}</div></div>
      <div class="np-k"><div class="np-kl">Συμπληρώθηκαν σήμερα</div><div class="np-kv">${noHistory
        ? '<span class="np-dim" id="npFilledCount" title="Το ιστορικό αλλαγών το διαβάζουν μόνο owner και management">—</span>'
        : `<span class="${filled.length ? 'np-green' : ''}" id="npFilledCount">${filled.length}</span>`}</div></div>
      <div class="np-knote">${owner ? 'Η Ειρήνη βλέπει την ίδια λίστα χωρίς πεδία τιμής και την τυπώνει για εσένα' : 'Ο owner συμπληρώνει τις τιμές· τύπωσε τη λίστα για εκείνον'}</div>
    </div>`;

    const cols = ['np-c-no', 'np-c-ref', 'np-c-pl', 'np-c-pl', 'np-c-dt', 'np-c-pal', 'np-c-days', 'np-c-last'].concat(owner ? ['np-c-in'] : []).concat(['np-c-open']);
    const colgroup = '<colgroup>' + cols.map(c => `<col class="${c}">`).join('') + '</colgroup>';
    const ncol = cols.length;
    const head = `<tr><th>ΑΡ.</th><th>ΑΝΑΦΟΡΑ</th><th>ΦΟΡΤΩΣΗ</th><th>ΠΑΡΑΔΟΣΗ</th><th>ΗΜΕΡΟΜΗΝΙΕΣ</th><th>ΠΑΛ. · ΕΙΔΟΣ</th><th class="np-r">ΜΕΡΕΣ</th><th class="np-r">ΤΕΛΕΥΤ. ΤΙΜΗ</th>${owner ? '<th class="np-in-h">ΤΙΜΗ €</th>' : ''}<th></th></tr>`;

    const rowHtml = r => {
      const f = r.fields;
      const d = _days(r);
      const hint = _hint(r);
      const hintHtml = hint
        ? `<span class="np-main">${OrdersCommon.eur(hint.price)}</span><span class="np-sub">${_esc(OrdersCommon.numLabel(hint.rec) !== '—' ? OrdersCommon.numLabel(hint.rec) : (hint.rec.fields['Reference'] || ''))} · ${OrdersCommon.dm(hint.date)}</span>`
        : '<span class="np-sub">— πρώτη φορά</span>';
      const key = r._type + ':' + r.id;
      const input = owner ? `<td class="np-in-td">
          <input class="np-in" type="text" inputmode="decimal" autocomplete="off" aria-label="Τιμή € για ${_esc(_label(r))}"
            data-id="${_esc(r.id)}" data-type="${r._type}" value="${_esc(typed[key] || '')}"
            placeholder="${hint ? OrdersCommon.eur(hint.price) : ''}"
            onkeydown="OrdersNoPrice.onKey(event)" oninput="OrdersNoPrice.clearMsg(this)">
          <div class="np-msg" id="npMsg_${_esc(r._type + '_' + r.id)}"></div></td>` : '';
      return `<tr class="np-row${_overdue(r) ? ' np-late' : ''}" data-key="${_esc(key)}">
        <td class="np-no">${_esc(OrdersCommon.numLabel(r))}</td>
        <td>${f['Reference'] ? `<span class="np-ref">${_esc(f['Reference'])}</span>` : '<span class="np-dim">— χωρίς</span>'}</td>
        <td>${OrdersCommon.placeCell(OrdersCommon.placeOf(r, 'load'), { noDate: true })}</td>
        <td>${OrdersCommon.placeCell(OrdersCommon.placeOf(r, 'del'), { noDate: true })}</td>
        <td><span class="np-main np-num">${_dates(r)}</span><span class="np-sub" title="${_esc(_vehicle(r))}">${_esc(_vehicle(r)) || '&nbsp;'}</span></td>
        <td><span class="np-main np-num">${_esc(_pallets(r)) || '—'}</span><span class="np-sub" title="${_esc(_goods(r))}">${_esc(_goods(r)) || '&nbsp;'}</span></td>
        <td class="np-r np-num${_overdue(r) ? ' np-red' : ''}">${d === null ? '—' : d}</td>
        <td class="np-r np-num">${hintHtml}</td>
        ${input}
        <td class="np-r"><button type="button" class="np-open" onclick="OrdersHub.openOrder('${r._type}','${_esc(r.id)}')">Άνοιγμα →</button></td>
      </tr>`;
    };

    let body;
    if (!V.list.length) {
      const what = ctx.scope === 'intl' ? 'διεθνής ' : ctx.scope === 'natl' ? 'εθνική ' : '';
      body = `<tr><td colspan="${ncol}" class="np-empty">Καμία ${what}παραγγελία χωρίς τιμή — όλες οι παραδομένες έχουν τιμή.</td></tr>`;
    } else {
      body = V.groups.map(g => {
        const meta = _clientMeta(g.clientId);
        const metaTxt = V.clientFailed ? '' : [meta.vat ? 'ΑΦΜ ' + meta.vat : 'ΑΦΜ —', meta.terms ? 'όροι ' + meta.terms + ' ημ.' : 'όροι —'].join(' · ');
        return `<tr class="np-grp"><td colspan="${ncol}"><span class="np-gname">${_esc(_rawClientName(g.clientId))}</span><span class="np-gmeta">${_esc(metaTxt)}</span></td></tr>`
          + g.items.map(rowHtml).join('');
      }).join('');
    }

    const filledHtml = filled.length ? filled.map(({ x, rec, st }) => {
      const next = st.key === 'ready'
        ? `→ Προς τιμολόγηση · εβδ. ${OrdersCommon.weekLabel(OrdersCommon.weekStartOf(rec))}`
        : st.key === 'invoiced' ? '→ τιμολογήθηκε'
        : st.key === 'blocked' && st.reason === 'sheets' ? '→ περιμένει δελτία παλετών (Αλεξία)'
        : '';
      return `<tr>
        <td class="np-no">${_esc(OrdersCommon.numLabel(rec))}</td>
        <td>${rec.fields['Reference'] ? `<span class="np-ref">${_esc(rec.fields['Reference'])}</span>` : '<span class="np-dim">— χωρίς</span>'}</td>
        <td>${OrdersCommon.placeCell(OrdersCommon.placeOf(rec, 'load'), { noDate: true })}</td>
        <td>${OrdersCommon.placeCell(OrdersCommon.placeOf(rec, 'del'), { noDate: true })}</td>
        <td><span class="np-main np-num">${_dates(rec)}</span><span class="np-sub">${_esc(_rawClientName(_clientId(rec)))}</span></td>
        <td><span class="np-main np-num">${_esc(_pallets(rec)) || '—'}</span></td>
        <td colspan="${owner ? 3 : 2}" class="np-fill"><span class="np-main np-num"><span class="np-dot"></span>${OrdersCommon.eurSym(x.price)} · ${_esc(_actorShort(x.actor))} ${_hhmm(x.at)}</span><span class="np-sub">${_esc(next)}</span></td>
        <td class="np-r"><button type="button" class="np-open" onclick="OrdersHub.openOrder('${rec._type}','${_esc(rec.id)}')">Άνοιγμα →</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="${ncol}" class="np-empty np-empty-s">${noHistory
      ? 'Οι σημερινές συμπληρώσεις του owner φαίνονται στα «Προς τιμολόγηση» — το ιστορικό αλλαγών δεν ανοίγει στον ρόλο σου.'
      : 'Καμία συμπλήρωση σήμερα.'}</td></tr>`;

    ctx.body.innerHTML = `
      ${banners.map(b => `<div class="np-banner" role="alert">${_esc(b)}</div>`).join('')}
      ${kpi}
      <div class="np-card">
        <table class="np-t">${colgroup}<thead>${head}</thead><tbody>${body}</tbody></table>
      </div>
      <div class="np-sec"><span class="np-sec-t">Συμπληρώθηκαν σήμερα</span><span class="np-sec-s">φεύγουν από τη λίστα · η Ειρήνη τις βλέπει στα «Προς τιμολόγηση»</span></div>
      <div class="np-card" id="npFilled">
        <table class="np-t">${colgroup}<tbody>${filledHtml}</tbody></table>
      </div>
      ${notes.map(n => `<div class="np-note">${_esc(n.charAt(0).toUpperCase() + n.slice(1))}.</div>`).join('')}
      <div class="np-foot">Σειρά: παλαιότερη πρώτα · κόκκινη γραμμή = πάνω από ${OVERDUE_DAYS} ημέρες από την παράδοση · «τελευταία τιμή» = η πιο πρόσφατη του ίδιου πελάτη για ίδια φόρτωση και παράδοση (ενδεικτική, δεν γράφεται αυτόματα)</div>`;
  }

  // ── Write (owner only) ──────────────────────────────────────────────────
  function _msgEl(input) { return document.getElementById('npMsg_' + input.dataset.type + '_' + input.dataset.id); }
  function clearMsg(input) { const m = _msgEl(input); if (m) { m.textContent = ''; m.className = 'np-msg'; } input.classList.remove('np-in-err'); }
  function _showMsg(input, text, kind) {
    const m = _msgEl(input);
    if (m) { m.textContent = text; m.className = 'np-msg' + (kind ? ' np-msg-' + kind : ''); }
    if (kind === 'err') input.classList.add('np-in-err');
  }
  function onKey(ev) {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    save(ev.target);
  }

  async function save(input) {
    // The Worker would accept a PATCH from the accountant too (she has PATCH on
    // orders); the owner decides prices (27/9), so the screen never offers it.
    if (!V || !V.canWrite || input.disabled) return;
    const type = input.dataset.type, id = input.dataset.id;
    const rec = V.all.find(r => r.id === id && r._type === type);
    if (!rec) return;
    const n = parsePrice(input.value);
    if (n === null) { _showMsg(input, 'Γράψε ποσό μεγαλύτερο του 0 — π.χ. 950 ή 1.250,00', 'err'); return; }
    input.disabled = true;
    _showMsg(input, 'Αποθήκευση…', '');
    try {
      const res = await atPatch(type === 'intl' ? TABLES.ORDERS : TABLES.NAT_ORDERS, id, { 'Price': n });
      // atPatch queues writes while offline and returns a stand-in: nothing
      // reached the table yet, so nothing may be reported as done.
      if (res && res._offline) throw Object.assign(new Error('Εκτός σύνδεσης — η τιμή δεν γράφτηκε ακόμη'), { _ours: true });
      // The proof is the row the Worker returns, not the absence of an error:
      // an unmapped label is dropped with a 200 (facade trap #1).
      const back = OrdersCommon.price(res && res.fields);
      if (!(back > 0)) throw Object.assign(new Error('ο διακομιστής δεν επέστρεψε την τιμή'), { _ours: true });
      // The row leaves the list on success — so «a price came back» is not
      // enough: it must be the price that was typed (a coercion or a trigger
      // would otherwise show success for a different amount; review 28/9).
      if (Math.abs(back - n) > 0.005) throw Object.assign(new Error(`γράφτηκε ${OrdersCommon.eur(back)} αντί για ${OrdersCommon.eur(n)}`), { _ours: true });
      rec.fields['Price'] = back;
      _sessionItems().push({ recordId: id, table: tableOfType(type), price: back, actor: _username(), at: new Date().toISOString() });
      OrdersData.invalidate();
      OrdersHub.refreshBadges();
      const lbl = _esc(_label(rec));
      if (OrdersData.sheetsOk(V.set, rec)) toast(`Η τιμή καταχωρήθηκε — η ${lbl} πέρασε στα Προς τιμολόγηση`);
      else toast(`Η τιμή καταχωρήθηκε — η ${lbl} περιμένει ακόμη δελτία παλετών (Αλεξία)`, 'warn');
      _repaintFromState();
    } catch (e) {
      input.disabled = false;
      _showMsg(input, 'Δεν αποθηκεύτηκε: ' + (e && e.message ? e.message : 'άγνωστο σφάλμα'), 'err');
      // atPatch/_atRetry already raised a red toast for every failure THEY see
      // (422/403/500/network — measured: three stacked toasts per 500 when this
      // added a fourth). Only the two failures detected here need one.
      if (e && e._ours) reportError('Η τιμή δεν αποθηκεύτηκε', e);
      input.focus();
    }
  }

  // Move the saved row without a reload, keeping what the owner already typed
  // in other rows, then put the cursor on the next empty box.
  function _repaintFromState() {
    const keep = {};
    V.ctx.body.querySelectorAll('input.np-in').forEach(i => { if (i.value) keep[i.dataset.type + ':' + i.dataset.id] = i.value; });
    V.list = selectNoPrice(V.all, r => OrdersData.stateOf(V.set, r), V.ctx.scope);
    V.groups = groupByClient(V.list);
    _paint(keep);
    const next = [...V.ctx.body.querySelectorAll('input.np-in')].find(i => !i.value);
    if (next) next.focus();
  }

  // ── A4 + CSV (both roles) ───────────────────────────────────────────────
  function _ordered() { return V ? V.groups.flatMap(g => g.items) : []; }

  function print() {
    if (!V) return;
    const recs = _ordered();
    const now = new Date();
    const who = _actorShort(_username());
    const nIntl = recs.filter(r => r._type === 'intl').length, nNatl = recs.length - nIntl;
    const esc = _esc;
    const placeA4 = p => (!p || (!p.name && !p.sub)) ? '<b>—</b>'
      : `<b>${esc(p.sub || p.name)}</b><span>${esc(p.sub ? p.name : '')}</span>`;
    const rows = recs.map(r => {
      const f = r.fields, d = _days(r), late = _overdue(r);
      const meta = _clientMeta(_clientId(r));
      const hint = _hint(r);
      const sub = [meta.vat ? 'ΑΦΜ ' + meta.vat : 'ΑΦΜ —', meta.terms ? 'όροι ' + meta.terms + ' ημ.' : '', f['Reference'] || 'χωρίς αναφορά'].filter(Boolean).join(' · ');
      const pal = _pallets(r);
      return `<tr class="${late ? 'late' : ''}">
        <td class="no">${late ? '<i>★</i>' : ''}${esc(OrdersCommon.numLabel(r))}</td>
        <td><b>${esc(_rawClientName(_clientId(r)))}</b><span>${esc(sub)}</span></td>
        <td>${placeA4(OrdersCommon.placeOf(r, 'load'))}</td>
        <td>${placeA4(OrdersCommon.placeOf(r, 'del'))}</td>
        <td><b class="${late ? 'red' : ''}">${_dates(r)}${d === null ? '' : ' · ' + d + ' ημ.'}</b><span>${esc([pal ? pal + ' παλ.' : '', f['Goods'] || ''].filter(Boolean).join(' · '))}</span></td>
        <td class="r">${hint ? OrdersCommon.eur(hint.price) : '—'}</td>
        <td><div class="box"></div></td>
      </tr>
      <tr class="noterow"><td></td><td colspan="6"><span class="nl">Σημείωση</span><span class="line"></span></td></tr>`;
    }).join('');
    const _cs = getComputedStyle(document.documentElement);
    // The popup loads no stylesheet: copy the live token values (orders_intl.js
    // print does the same) so the page stays on the palette without a hex here.
    const rootCss = ':root{' + ['--surface-dark', '--text', '--text-mid', '--text-dim', '--border', '--border-mid', '--surface-sunken', '--danger']
      .map(t => `${t}:${_cs.getPropertyValue(t).trim()}`).join(';') + '}';
    const html = `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8">
<title>Παραγγελίες χωρίς τιμή — ${now.toLocaleDateString('el-GR')}</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>${rootCss}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;color:var(--text);font-size:10.5px;font-variant-numeric:tabular-nums;padding:28px 36px;background:#fff}
.top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:22px}
.brand{font-family:'Syne',sans-serif;font-weight:700;font-size:12px;letter-spacing:.8px}
.when{color:var(--text-mid);font-size:10px}
h1{font-family:'Syne',sans-serif;font-weight:600;font-size:19px;margin-bottom:3px}
.sub{color:var(--text-mid);font-size:10.5px;padding-bottom:10px;border-bottom:1.5px solid var(--text);margin-bottom:10px}
.sum{font-size:10.5px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead th{background:var(--surface-sunken);color:var(--text-mid);font-size:8.5px;font-weight:600;letter-spacing:.6px;text-align:left;padding:7px 6px;border-bottom:1px solid var(--border-mid)}
td{padding:8px 6px 2px;vertical-align:top}
td b{display:block;font-weight:600;font-size:10.5px}
td span{display:block;color:var(--text-mid);font-size:9.5px;margin-top:2px}
td.no{font-weight:600;position:relative}
td.no i{position:absolute;left:-12px;color:var(--danger);font-style:normal}
.red{color:var(--danger)}
.r{text-align:right;color:var(--text-mid)}
.box{border:1.2px solid var(--text);border-radius:3px;height:27px}
.noterow td{padding:2px 6px 9px;border-bottom:1px solid var(--border)}
.noterow td span.nl{display:inline-block;color:var(--text-mid);font-size:9.5px;margin-right:6px}
.noterow td span.line{display:inline-block;width:80%;border-bottom:1px solid var(--border-mid);vertical-align:bottom}
tr{page-break-inside:avoid}
.sign{margin-top:36px;border-top:1px solid var(--border-mid);padding-top:18px;display:grid;grid-template-columns:auto 1fr auto 1fr;gap:22px 12px;align-items:end;font-size:10px;color:var(--text-mid)}
.sign .ln{border-bottom:1px solid var(--text);height:14px}
.foot{margin-top:28px;display:flex;justify-content:space-between;color:var(--text-mid);font-size:9px}
.ret{margin-top:18px;font-weight:600;font-size:11px}
@media print{body{padding:0}@page{size:A4 portrait;margin:14mm}}
</style></head><body>
<div class="top"><div class="brand">PETRAS GROUP</div><div class="when">${esc(now.toLocaleDateString('el-GR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }))} · ${_hhmm(now.toISOString())}${who ? ' · ' + esc(who) : ''}</div></div>
<h1>Παραγγελίες χωρίς τιμή</h1>
<div class="sub">Για συμπλήρωση από τον owner · επιστροφή στο λογιστήριο για καταχώριση</div>
<div class="sum">${recs.length} ${recs.length === 1 ? 'παραγγελία' : 'παραγγελίες'} · ${nIntl} ${nIntl === 1 ? 'διεθνής' : 'διεθνείς'} · ${nNatl} ${nNatl === 1 ? 'εθνική' : 'εθνικές'} · σειρά: παλαιότερη πρώτα · ★ πάνω από ${OVERDUE_DAYS} ημέρες</div>
<table>
<colgroup><col style="width:9%"><col style="width:23%"><col style="width:15%"><col style="width:15%"><col style="width:18%"><col style="width:10%"><col style="width:10%"></colgroup>
<thead><tr><th>ΑΡ.</th><th>ΠΕΛΑΤΗΣ · ΑΦΜ</th><th>ΦΟΡΤΩΣΗ</th><th>ΠΑΡΑΔΟΣΗ</th><th>ΗΜ/ΝΙΕΣ · ΠΑΛ.</th><th style="text-align:right;white-space:nowrap">ΤΕΛ. ΤΙΜΗ</th><th>ΤΙΜΗ €</th></tr></thead>
<tbody>${rows || '<tr><td colspan="7" style="padding:14px 6px;color:var(--text-mid)">Καμία παραγγελία χωρίς τιμή.</td></tr>'}</tbody>
</table>
<div class="sign">
<span>Συμπλήρωσε</span><div class="ln"></div><span>Ημερομηνία</span><div class="ln"></div>
<span>Επιστράφηκε στην Ειρήνη</span><div class="ln"></div><span>Καταχωρήθηκαν στο TMS</span><div style="display:flex;gap:6px;align-items:end"><div class="ln" style="width:60px"></div><span>/ ${recs.length}</span></div>
</div>
<div class="ret">Επιστροφή στην Ειρήνη για καταχώριση</div>
<div class="foot"><span>«Τελ. τιμή» = η πιο πρόσφατη τιμή του ίδιου πελάτη για ίδια φόρτωση και παράδοση — ενδεικτική.</span><span>Petras Group TMS</span></div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script>
</body></html>`;
    OrdersList.printOpen(html);
  }

  function csv() {
    if (!V) return;
    const rows = [['Αρ.', 'Τύπος', 'Αναφορά', 'Πελάτης', 'ΑΦΜ', 'Όροι (ημ.)', 'Φόρτωση', 'Παράδοση', 'Ημ. φόρτωσης', 'Ημ. παράδοσης', 'Όχημα', 'Παλέτες', 'Είδος', 'Ημέρες από παράδοση', 'Τελ. τιμή', 'Τελ. τιμή από', 'Τιμή €']];
    for (const r of _ordered()) {
      const f = r.fields, meta = _clientMeta(_clientId(r)), hint = _hint(r);
      const pl = w => { const p = OrdersCommon.placeOf(r, w); return [p.name, p.sub].filter(Boolean).join(' · '); };
      const d = _days(r);
      rows.push([
        OrdersCommon.numLabel(r), r._type === 'natl' ? 'Εθνική' : 'Διεθνής', f['Reference'] || '', _rawClientName(_clientId(r)),
        meta.vat, meta.terms === null ? '' : meta.terms, pl('load'), pl('del'),
        OrdersCommon.ymd(f['Loading DateTime']), OrdersCommon.ymd(f['Delivery DateTime']), _vehicle(r),
        _pallets(r), _goods(r), d === null ? '' : d,
        hint ? OrdersCommon.eur(hint.price) : '', hint ? [OrdersCommon.numLabel(hint.rec), OrdersCommon.dm(hint.date)].join(' · ') : '',
        '',
      ]);
    }
    OrdersList.csvDownload(rows, `xoris-timi-${OrdersCommon.today()}.csv`);
  }

  // Tokens only (DESIGN.md #1). Injected once.
  function _ensureStyles() {
    if (document.getElementById('npStyles')) return;
    const st = document.createElement('style'); st.id = 'npStyles';
    st.textContent = `
.np-banner{border:1px solid var(--danger);color:var(--danger);background:var(--bg-card);border-radius:8px;padding:10px 14px;margin-bottom:var(--space-3);font-size:13px}
.np-kpi{display:flex;align-items:stretch;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:var(--space-3);gap:0}
.np-k{padding:0 22px 0 0;margin-right:22px;border-right:1px solid var(--border)}
.np-k:nth-child(4){border-right:none}
.np-kl{font-size:11.5px;color:var(--text-mid);margin-bottom:3px}
.np-kv{font-size:18px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:10px}
.np-ks{font-size:11.5px;font-weight:400;color:var(--text-mid)}
.np-knote{margin-left:auto;align-self:center;font-size:12px;color:var(--text-mid);max-width:360px;text-align:left}
.np-red,.np-t td.np-red{color:var(--danger)}
.np-green{color:var(--ok)}
.np-card{background:var(--bg-card);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:var(--space-3)}
.np-t{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12.5px}
.np-t th{text-align:left;font-size:10.5px;font-weight:600;letter-spacing:.4px;color:var(--text-mid);padding:10px 10px;border-bottom:1px solid var(--border-mid);background:var(--bg-card)}
.np-t td{padding:9px 10px;border-bottom:1px solid var(--border);vertical-align:top;color:var(--text)}
.np-t tr:last-child td{border-bottom:none}
.np-t .np-r{text-align:right}
.np-t th.np-in-h{color:var(--text)}
.np-grp td{background:var(--surface-sunken);padding:7px 10px;border-bottom:1px solid var(--border)}
.np-gname{font-weight:600;color:var(--text);margin-right:12px}
.np-gmeta{font-size:11.5px;color:var(--text-mid)}
.np-row.np-late td:first-child{box-shadow:inset 3px 0 0 var(--danger)}
.np-no{font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.np-ref{font-variant-numeric:tabular-nums}
.np-dim{color:var(--text-dim)}
.np-num{font-variant-numeric:tabular-nums}
.np-main{display:block;line-height:1.25;white-space:nowrap}
.np-sub{display:block;font-size:11.5px;color:var(--text-mid);line-height:1.25;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.np-in{width:100%;height:32px;border:1px solid var(--border-mid);border-radius:6px;padding:0 10px;font:500 13px 'DM Sans',sans-serif;text-align:right;font-variant-numeric:tabular-nums;color:var(--text);background:var(--bg-card)}
.np-in::placeholder{color:var(--text-dim)}
.np-in:focus{outline:none;border-color:var(--surface-dark);box-shadow:0 0 0 1px var(--surface-dark)}
.np-in.np-in-err{border-color:var(--danger)}
.np-in:disabled{background:var(--surface-sunken)}
.np-msg{font-size:11px;line-height:1.25;margin-top:3px;color:var(--text-mid);white-space:normal}
.np-msg:empty{display:none}
.np-msg-err{color:var(--danger)}
.np-open{border:none;background:none;color:var(--accent);font:500 12.5px 'DM Sans',sans-serif;cursor:pointer;white-space:nowrap;padding:0}
.np-open:hover{text-decoration:underline}
.np-empty{color:var(--text-mid);padding:18px 12px !important}
.np-empty-s{padding:12px !important}
.np-sec{display:flex;align-items:baseline;gap:12px;margin:var(--space-4) 0 var(--space-2)}
.np-sec-t{font-weight:600;font-size:13.5px;color:var(--text)}
.np-sec-s{font-size:11.5px;color:var(--text-mid)}
.np-fill .np-main{display:flex;align-items:center;gap:7px;justify-content:flex-end}
.np-fill .np-sub{text-align:right}
.np-dot{width:7px;height:7px;border-radius:50%;background:var(--ok);flex-shrink:0}
.np-note{font-size:12px;color:var(--text-mid);margin-bottom:var(--space-2)}
.np-foot{font-size:11.5px;color:var(--text-dim);margin-top:var(--space-2)}
.np-t col.np-c-no{width:70px}.np-t col.np-c-ref{width:110px}.np-t col.np-c-pl{width:auto}
.np-t col.np-c-dt{width:150px}.np-t col.np-c-pal{width:130px}.np-t col.np-c-days{width:64px}
.np-t col.np-c-last{width:110px}.np-t col.np-c-in{width:130px}.np-t col.np-c-open{width:90px}`;
    document.head.appendChild(st);
  }

  return {
    // view
    render, onKey, clearMsg, save, print, csv,
    // pure (also exported for node:test below)
    parsePrice, selectNoPrice, groupByClient, routeKey, lastPriceHint, filledFromAudit, mergeFilled, OVERDUE_DAYS,
  };
})();

if (typeof OrdersHub !== 'undefined') {
  OrdersHub.register('noprice', {
    label: 'Χωρίς τιμή', order: 4, badgeTone: 'danger',
    // Dispatcher never sees prices-to-fill (costs:none) — same gate as the counters.
    visible: () => typeof can === 'function' && can('costs') !== 'none',
    render: ctx => OrdersNoPrice.render(ctx),
  });
}
if (typeof window !== 'undefined') window.OrdersNoPrice = OrdersNoPrice;

if (typeof module !== 'undefined' && module.exports) {
  const { parsePrice, selectNoPrice, groupByClient, routeKey, lastPriceHint, filledFromAudit, mergeFilled, OVERDUE_DAYS } = OrdersNoPrice;
  module.exports = { parsePrice, selectNoPrice, groupByClient, routeKey, lastPriceHint, filledFromAudit, mergeFilled, OVERDUE_DAYS };
}
