// ============================================================================
// notifications.js, «Ειδοποιήσεις»: every alert the bell computes, as one page
// ----------------------------------------------------------------------------
// Opened from «Όλες οι ειδοποιήσεις» at the foot of the bell and from
// Διαχείριση › Ειδοποιήσεις in the sidebar, every role (Nick 14/10). The bell's dropdown shows at most 20 grouped cards; this
// page lists every alert of the same refresh, ungrouped, with tabs, category
// chips, search and the usual notification-centre actions.
//
// WHERE THE DATA COMES FROM: nowhere new. _refreshNotifs (core/utils.js) builds
// the alerts from live reads every 5 minutes and keeps the full list in
// _notifRaw; this page renders that list and asks for a refresh when it opens.
// So the page and the bell can never disagree, and no role sees an alert the
// bell would not have shown them (per-username rules unchanged).
//
// STATE: read / «Αργότερα» live per browser in NotifStore (core/utils.js), keyed by
// the record an alert is about, and forgotten once the alert is no longer raised. This
// is phase 1 (T71). Phase 2 (T72) stores alerts and their state in the
// database for history and audit; only NotifStore changes then.
//
// NOT HERE (yet): when an alert started. Alerts are computed, not stored, so
// there is no honest "since" to show until phase 2; the page does not invent one.
// ============================================================================

const NotifPage = (() => {
  'use strict';

  // Category by the page an alert opens; alerts with no page by their title.
  const CAT_BY_PAGE = {
    orders_intl: 'Παραγγελίες', orders: 'Παραγγελίες', weekly_intl: 'Παραγγελίες', weekly_natl: 'Παραγγελίες',
    daily_ops: 'Ημερήσια λειτουργία',
    maint_req: 'Συντήρηση',
    maint_expiry: 'Λήξεις εγγράφων',
    invoicing: 'Τιμολόγηση',
  };
  const SEV = {
    danger: { label: 'Κρίσιμη', cls: 'nc-sev-danger', rank: 0 },
    warn:   { label: 'Προς ενέργεια', cls: 'nc-sev-warn', rank: 1 },
    info:   { label: 'Ενημέρωση', cls: 'nc-sev-info', rank: 2 },
  };
  const TABS = [
    ['all', 'Όλες'], ['unread', 'Μη αναγνωσμένες'], ['danger', 'Κρίσιμες'], ['snoozed', 'Σε αναμονή'],
  ];

  let tab = 'all';
  let cat = '';
  let q = '';      // normalised, for matching
  let qRaw = '';   // as typed, for the input (spaces and capitals survive a redraw)
  const picked = new Set();

  const catOf = (n) => n.page ? (CAT_BY_PAGE[n.page] || 'Άλλα')
    : (/^Υπενθύμιση/.test(n.title || '') ? 'Υπενθυμίσεις' : 'Σύστημα');

  // Plain text for search: titles and subs are stored already HTML-escaped by
  // _refreshNotifs (that is how the bell inserts them), so decode once here.
  // encodeURIComponent leaves ' as is, and these keys go inside onclick='…' strings.
  // try/catch: a lone surrogate (half an emoji from user text) makes encodeURIComponent throw.
  const enc = (s) => { try { return encodeURIComponent(s).replace(/'/g, '%27'); } catch (_) { return encodeURIComponent(Array.from(s).filter(c => c.length === 2 || !/[\ud800-\udfff]/.test(c)).join('')).replace(/'/g, '%27'); } };

  const plain = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.toLowerCase(); };

  function rows() {
    return (_notifRaw || []).map(n => {
      const key = _notifKey(n);
      const until = NotifStore.snoozedUntil(key);
      return { n, key, cat: catOf(n), sev: SEV[n.type] || SEV.info, read: NotifStore.isRead(key), until };
    }).sort((a, b) => a.sev.rank - b.sev.rank || a.cat.localeCompare(b.cat, 'el'));
  }

  function visible(all) {
    return all.filter(r => {
      if (tab === 'snoozed' ? !r.until : r.until) return false;
      if (tab === 'unread' && r.read) return false;
      if (tab === 'danger' && r.n.type !== 'danger') return false;
      if (cat && r.cat !== cat) return false;
      if (q && !(plain(r.n.title) + ' ' + plain(r.n.sub)).includes(q)) return false;
      return true;
    });
  }

  const fmtUntil = (u) => {
    if (u === 'change') return 'ώσπου να λυθεί';
    const d = new Date(u);
    const p = (x) => String(x).padStart(2, '0');
    return `ως ${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  function statusHtml(r) {
    if (r.until) return `<span class="nc-st nc-st-snz">Σε αναμονή ${escapeHtml(fmtUntil(r.until))}</span>`;
    return r.read ? '<span class="nc-st">Αναγνωσμένη</span>' : '<span class="nc-st nc-st-new">Νέα</span>';
  }

  function actionsHtml(r) {
    const k = enc(r.key);
    const open = r.n.page
      ? `<button type="button" class="btn btn-ghost btn-sm" onclick="NotifPage.open('${k}')">Άνοιγμα</button>` : '';
    if (r.until) return `${open}<button type="button" class="btn btn-ghost btn-sm" onclick="NotifPage.act('unsnooze',['${k}'])">Επαναφορά</button>`;
    return `${open}
      <button type="button" class="btn btn-ghost btn-sm" onclick="NotifPage.act('${r.read ? 'unread' : 'read'}',['${k}'])">${r.read ? 'Μη αναγνωσμένη' : 'Αναγνωσμένη'}</button>
      <select class="filter-select nc-later" aria-label="Αργότερα" onchange="NotifPage.act(this.value,['${k}']);this.selectedIndex=0">
        <option value="">Αργότερα…</option><option value="h1">1 ώρα</option><option value="tomorrow">Ως αύριο</option><option value="change">Ώσπου να λυθεί</option>
      </select>`;
  }

  function bodyHtml() {
    const all = rows();
    const shown = visible(all);
    const due = all.filter(r => !r.until);
    const count = (t) => t === 'all' ? due.length : t === 'unread' ? due.filter(r => !r.read).length
      : t === 'danger' ? due.filter(r => r.n.type === 'danger').length : all.filter(r => r.until).length;
    const cats = [...new Set(due.map(r => r.cat))].sort((a, b) => a.localeCompare(b, 'el'));
    for (const k of [...picked]) if (!shown.some(r => r.key === k)) picked.delete(k);
    const allPicked = shown.length && shown.every(r => picked.has(r.key));

    const tabs = TABS.map(([t, l]) =>
      `<button type="button" class="nc-tab${tab === t ? ' on' : ''}" onclick="NotifPage.tab('${t}')">${l} <span class="nc-n">${count(t)}</span></button>`).join('');
    const chips = ['', ...cats].map(c =>
      `<button type="button" class="nc-chip${cat === c ? ' on' : ''}" onclick="NotifPage.cat('${enc(c)}')">${c ? escapeHtml(c) : 'Όλες οι κατηγορίες'}</button>`).join('');
    const bulk = picked.size ? `
      <div class="nc-bulk"><b>${picked.size} επιλεγμένες</b>
        ${tab === 'snoozed'
          ? '<button type="button" class="btn btn-ghost btn-sm" onclick="NotifPage.bulk(\'unsnooze\')">Επαναφορά</button>'
          : `<button type="button" class="btn btn-ghost btn-sm" onclick="NotifPage.bulk('read')">Αναγνωσμένες</button>
             <button type="button" class="btn btn-ghost btn-sm" onclick="NotifPage.bulk('h1')">Αργότερα 1 ώρα</button>
             <button type="button" class="btn btn-ghost btn-sm" onclick="NotifPage.bulk('tomorrow')">Αργότερα ως αύριο</button>`}
        <button type="button" class="btn btn-ghost btn-sm" onclick="NotifPage.clearPick()">Καμία</button>
      </div>` : '';

    const body = shown.length ? `
      <div class="table-wrap"><table class="nc-table" data-sort-id="notifications">
        <thead><tr>
          <th class="nc-pick"><input type="checkbox" aria-label="Επιλογή όλων" ${allPicked ? 'checked' : ''} onchange="NotifPage.pickAll(this.checked)"></th>
          <th class="nc-sev" data-sort="num">Σοβαρότητα</th><th class="nc-cat" data-sort="text">Κατηγορία</th><th data-sort="text">Ειδοποίηση</th>
          <th class="nc-stc" data-sort="num">Κατάσταση</th><th class="nc-act">Ενέργειες</th>
        </tr></thead>
        <tbody>${shown.map(r => `
          <tr class="${r.read || r.until ? 'nc-done' : ''}">
            <td class="nc-pick"><input type="checkbox" aria-label="Επιλογή" ${picked.has(r.key) ? 'checked' : ''} onchange="NotifPage.pick('${enc(r.key)}',this.checked)"></td>
            <td class="nc-sev" data-sort-value="${r.sev.rank}"><span class="nc-dot ${r.sev.cls}"></span>${r.sev.label}</td>
            <td class="nc-cat">${escapeHtml(r.cat)}</td>
            <td><div class="nc-title">${r.n.title}</div><div class="nc-sub">${r.n.sub || ''}</div></td>
            <td class="nc-stc" data-sort-value="${r.until ? 2 : r.read ? 1 : 0}">${statusHtml(r)}</td>
            <td class="nc-act">${actionsHtml(r)}</td>
          </tr>`).join('')}
        </tbody></table></div>`
      : `<div class="empty-state"><p>${tab === 'snoozed' ? 'Καμία ειδοποίηση σε αναμονή.' : 'Καμία ειδοποίηση με αυτά τα φίλτρα.'}</p></div>`;

    const updated = _notifBuiltAt ? new Date(_notifBuiltAt).toTimeString().slice(0, 5) : '';
    return `
      <div class="nc-head">
        <h2 class="nc-h">Ειδοποιήσεις</h2>
        <span class="nc-sub-h">${due.filter(r => r.n.type === 'danger').length} κρίσιμες · ${due.filter(r => r.n.type === 'warn').length} προς ενέργεια · ${due.filter(r => r.n.type === 'info').length} ενημέρωση${updated ? ` · ενημερώθηκε ${updated}` : ''}</span>
        <span class="nc-spacer"></span>
        <input id="ncSearch" class="search-input nc-search" placeholder="Αναζήτηση…" value="${escapeHtml(qRaw)}" oninput="NotifPage.search(this.value)">
        <button type="button" class="btn btn-ghost btn-sm" onclick="NotifPage.allRead()" ${due.some(r => !r.read) ? '' : 'disabled'}>Σήμανση όλων ως αναγνωσμένες</button>
      </div>
      <div class="nc-tabs" role="tablist">${tabs}</div>
      <div class="nc-chips">${chips}</div>
      ${bulk}
      ${body}`;
  }

  function redraw() {
    const host = document.getElementById('ncBody');
    if (!host) return;
    const had = document.activeElement && document.activeElement.id === 'ncSearch';
    host.innerHTML = bodyHtml();
    // Keep the user's column sort across every redraw (core/ui.js TableSort).
    if (typeof TableSort !== 'undefined') TableSort.apply(host);
    if (had) { const s = document.getElementById('ncSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }

  const untilOf = (how) => {
    if (how === 'h1') return Date.now() + 3600e3;
    if (how === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.getTime(); }
    if (how === 'change') return 'change';
    return undefined;
  };

  // The dropdown reads the same NotifStore, so a «Αργότερα» here is left out of
  // it the next time the bell opens (opening refreshes). The red dot keeps its
  // colour until that refresh or the 5-minute one.
  function apply(how, keys) {
    if (!how || !keys.length) return;
    if (how === 'read' || how === 'unread') NotifStore.markRead(keys, how === 'read');
    else if (how === 'unsnooze') NotifStore.snooze(keys, null);
    else { const u = untilOf(how); if (u !== undefined) NotifStore.snooze(keys, u); }
    picked.clear();
    redraw();
    if (typeof toast === 'function') toast(how === 'read' ? 'Σημειώθηκαν ως αναγνωσμένες'
      : how === 'unread' ? 'Σημειώθηκε ως μη αναγνωσμένη'
      : how === 'unsnooze' ? 'Επέστρεψαν στη λίστα' : 'Σε αναμονή');
  }

  return {
    redraw,
    tab(t) { tab = t; picked.clear(); redraw(); },
    cat(c) { cat = decodeURIComponent(c); redraw(); },
    search(v) { qRaw = v || ''; q = qRaw.trim().toLowerCase(); redraw(); },
    pick(k, on) { k = decodeURIComponent(k); on ? picked.add(k) : picked.delete(k); redraw(); },
    pickAll(on) { picked.clear(); if (on) visible(rows()).forEach(r => picked.add(r.key)); redraw(); },
    clearPick() { picked.clear(); redraw(); },
    act(how, keys) { apply(how, keys.map(decodeURIComponent)); },
    bulk(how) { apply(how, [...picked]); },
    allRead() { apply('read', rows().filter(r => !r.until && !r.read).map(r => r.key)); },
    open(k) {
      const r = rows().find(x => x.key === decodeURIComponent(k));
      if (!r || !r.n.page) return;
      NotifStore.markRead([r.key]);
      navigate(r.n.page);
    },
  };
})();
if (typeof window !== 'undefined') window.NotifPage = NotifPage;

async function renderNotifications() {
  const c = document.getElementById('content');
  c.innerHTML = `<div id="ncBody"><div class="loading">Φόρτωση…</div></div>
    <style>
    /* Same layout language as Ιστορικό Ενεργειών and the entity lists (the
       redesigned tables): 58px head line, 34px header in 13px/600 capitals
       (CSS uppercase, so lang="el" drops the accents), 40px rows, ΜΕΡΟΣ Β tokens. */
    .nc-head { display: flex; align-items: center; gap: 12px; min-height: 58px; padding: 0 0 8px; flex-wrap: wrap; }
    .nc-h { font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 700; color: var(--text); margin: 0; }
    .nc-sub-h { font-size: var(--text-sm); color: var(--text-dim); }
    .nc-spacer { flex: 1 0 0; }
    .nc-search { max-width: 220px; height: 34px; padding: 0 12px; font-size: var(--text-sm); }
    .nc-tabs { display: flex; gap: 24px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
    .nc-tab { border: none; background: none; padding: 6px 0 10px; font: 500 13.5px 'DM Sans', sans-serif; color: var(--text-mid); cursor: pointer; position: relative; min-height: 0; }
    .nc-tab.on { color: var(--text); font-weight: 600; }
    .nc-tab.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 3px; background: var(--surface-dark); }
    .nc-n { margin-left: 6px; font-size: 11px; font-weight: 600; color: var(--text-dim); font-variant-numeric: tabular-nums; }
    .nc-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .nc-chip { border: 1px solid var(--border); background: var(--surface-card); color: var(--text-mid); border-radius: 999px; padding: 4px 12px; font: 500 12px 'DM Sans', sans-serif; cursor: pointer; min-height: 0; }
    .nc-chip.on { background: var(--surface-dark); color: #fff; border-color: var(--surface-dark); }
    .nc-bulk { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 8px; background: var(--surface-sunken); border: 1px solid var(--border); border-radius: var(--radius); font-size: var(--text-sm); }
    .nc-table thead th { height: 34px; padding: 0 16px; font-size: var(--text-body); font-weight: 600; letter-spacing: normal; color: var(--text-mid); background: var(--surface-sunken); border-bottom: 1px solid var(--border); text-transform: uppercase; }
    .nc-table tbody td { height: 40px; padding: 4px 16px; font-size: var(--text-sm); color: var(--text-mid); border-bottom: 1px solid var(--border); line-height: 1.35; vertical-align: middle; }
    .nc-table tbody tr { cursor: default; }
    .nc-table tr.nc-done .nc-title { font-weight: 500; color: var(--text-mid); }
    .nc-pick { width: 36px; }
    .nc-sev { width: 150px; white-space: nowrap; }
    .nc-cat { width: 160px; }
    .nc-stc { width: 160px; }
    .nc-act { width: 1%; white-space: nowrap; text-align: right; }   /* shrink to its buttons; the alert text takes the rest */
    .nc-act .btn, .nc-act .nc-later { margin-left: 4px; }
    .nc-later { height: 30px; font-size: var(--text-sm); }
    .nc-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
    .nc-sev-danger { background: var(--danger); }
    .nc-sev-warn { background: var(--warning); }
    .nc-sev-info { background: var(--accent); }
    .nc-title { font-size: var(--text-body); font-weight: 600; color: var(--text); }
    .nc-sub { font-size: var(--text-xs); color: var(--text-dim); margin-top: 2px; }
    .nc-st { color: var(--text-dim); }
    .nc-st-new { color: var(--text); font-weight: 600; }
    .nc-st-snz { color: var(--text-mid); }
    </style>`;
  // Draw what the last refresh holds at once, then refresh and redraw (the
  // refresh calls NotifPage.redraw itself while this page is open).
  if (_notifBuiltAt) NotifPage.redraw();
  await _refreshNotifs();
  NotifPage.redraw();
}
