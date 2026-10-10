// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL v4 — actions (global WI4Actions)
// ─────────────────────────────────────────────────────────────────────
// Spec: docs/weekly-intl-redesign/TECH_DESIGN.md §d.4, §e #3/#9/#10/#17/#19,
// §e.9, §g.4. Owner: WP5. Frozen signatures: tests/wi4-contract.stub.js.
//
// Per-load menu, date panel, conflict dialog, keyboard + «?» sheet and the
// queue «Όλα N ▾» panel. Every item calls an EXISTING opener or write through
// window.WI_INTERNAL (principle 3); the only v4-only item is «Άνοιγμα
// παραγγελίας», which is today's name click (§e.9).
//
// At load this file only defines WI4Actions — no listener, timer, observer or
// fetch (§b step 6). The keyboard listeners and the #wi-panel observer are
// attached by WIV2.paint() through attach(), never by loading this file.
//
// Rules this file keeps (each one is a past incident of this project):
//   - async UI stores ORDER ids and re-resolves the row with WIV2.rowIdOf at
//     the moment of the click: row ids are a per-build sequence (§f);
//   - no role gate is added: _wiBlockReadOnly is called exactly where the old
//     opener calls it (_wiCtx), and nowhere else;
//   - no ✓ before a write has answered (§e #10);
//   - the pure rules (keys, sections, icons, conflict text) live in WI4
//     (core/wi4-logic.js); this file only draws and dispatches.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const W = () => window.WI_INTERNAL;
const L = () => (typeof WI4 !== 'undefined' ? WI4 : {});
const V = () => (typeof WIV2 !== 'undefined' ? WIV2 : null);
const REC = /^rec[A-Za-z0-9]+$/;
const CLOSE_SUFFIX = ';_wiCtxClose()';

const _toast = (m, t) => { if (typeof toast === 'function') toast(m, t); };
const _esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s));
const _today = () => (typeof localToday === 'function' ? localToday() : new Date().toISOString().slice(0, 10));
function _logErr(e, where) { try { if (typeof logError === 'function') logError(e, where); } catch (_) {} }

// Every v4 listener starts here (§a.4): SPA navigation does not remove
// document listeners, and a v4 key must never act on another page or on the
// v1 fallback board.
function _live() {
  const v = V();
  return !!(v && v.active() && document.querySelector('#content .wi4'));
}

// ─── Copy (UI in Greek) ───────────────────────────────────────────────
const FIELD = Object.freeze({
  'Loading DateTime': { seg: 'Φόρτωση', title: 'Ημερομηνία φόρτωσης' },
  'Delivery DateTime': { seg: 'Εκφόρτωση', title: 'Ημερομηνία εκφόρτωσης' },
  'VS CD Date': { seg: 'Βέροια', title: 'Ημερομηνία Βέροιας' },
});
// Greek names of the checked labels for WI4.describeConflict (§d.5).
const LABELS_GR = Object.freeze({
  'Loading DateTime': 'ημερομηνία φόρτωσης', 'Delivery DateTime': 'ημερομηνία εκφόρτωσης',
  'VS CD Date': 'ημερομηνία Βέροιας', Truck: 'φορτηγό', Trailer: 'ρυμούλκα', Driver: 'οδηγός',
  Partner: 'συνεργάτης', 'Partner Truck Plates': 'πινακίδες συνεργάτη',
  'Is Partner Trip': 'δρομολόγιο συνεργάτη', 'Matched Import ID': 'ταίριασμα εισαγωγής',
});
// What each bound action does, for the «?» sheet. The sheet lists only the
// keys WI4.KEYMAP binds (§d.4): an action here without a key is never shown.
const ACTION_TEXT = Object.freeze({
  rowPrev: 'σειρά', rowNext: 'σειρά', queueNext: 'επόμενο της ουράς', search: 'αναζήτηση',
  menu: 'μενού ενεργειών (ανά φορτίο)', assign: 'ανάθεση φορτηγού ή συνεργάτη', date: 'ημερομηνία',
  print: 'εκτύπωση / WhatsApp', newImport: 'νέα εισαγωγή (σε κενό γύρισμα)', open: 'άνοιγμα παραγγελίας',
  escape: 'κλείσιμο', help: 'αυτή η λίστα',
});
const ACTION_GROUP = Object.freeze({
  rowPrev: 'ΠΛΟΗΓΗΣΗ', rowNext: 'ΠΛΟΗΓΗΣΗ', queueNext: 'ΠΛΟΗΓΗΣΗ', search: 'ΠΛΟΗΓΗΣΗ',
  menu: 'ΣΤΗ ΣΕΙΡΑ', assign: 'ΣΤΗ ΣΕΙΡΑ', date: 'ΣΤΗ ΣΕΙΡΑ', print: 'ΣΤΗ ΣΕΙΡΑ', newImport: 'ΣΤΗ ΣΕΙΡΑ', open: 'ΣΤΗ ΣΕΙΡΑ',
  escape: 'ΓΕΝΙΚΑ', help: 'ΓΕΝΙΚΑ',
});
// Queue card / panel buttons (§e #2): one existing action per item.
const ACT_LABEL = Object.freeze({
  assign: 'Ανάθεση', newImport: 'Νέα εισαγωγή', pieces: 'Κομμάτια', national: 'Εθνικά →', date: 'Ημερομηνία',
  open: 'Άνοιγμα', lot: 'Παρτίδα', convert: 'Μετατροπή', retry: 'Ξαναδοκίμασε',
});

// ─── Relabels (§e.9, decision 10/10: one name per thing) ───────────────
// Keys are today's exact strings; tests/wi4-menu-parity.test.js checks that
// each one still occurs in a builder or a panel, so a rename in old code
// fails loudly instead of silently skipping a relabel. v1 is never touched:
// the map runs only on v4-built menus and on #wi-panel while v4 is active.
const RELABEL = Object.freeze({
  menu: Object.freeze({
    'Ομαδοποίηση…': 'Groupage εξαγωγών…',
    '+ Εισαγωγή στο φορτίο…': 'Groupage εισαγωγών · σε αυτό το φορτίο…',
    'Εκτύπωση…': 'Εκτύπωση / WhatsApp…',
    'Εκτύπωση όλων': 'Εκτύπωση / WhatsApp όλων…',
    'Ακύρωση groupage': 'Βγάλε από το groupage',
    // «⤷» is replaced by the submenu icon (§e.9 Visuals).
    '⤷ Σκέλος προώθησης (ρότα)…': 'Σκέλος προώθησης (ρότα)…',
  }),
  panelTitle: Object.freeze({
    'Ομαδοποίηση': 'Groupage εξαγωγών',
    '+ Εισαγωγή στο φορτίο': 'Groupage εισαγωγών · σε αυτό το φορτίο',
  }),
  // The group panel's primary button reads «Ομαδοποίηση» for exports AND for
  // imports (weekly_intl.js _wiPanelGroupBuild): its v4 name follows the
  // panel's (already v4) title, so an import panel never says «εξαγωγών».
  panelButton: Object.freeze({ 'Ομαδοποίηση': true }),
});

// ─── Small DOM/format helpers ──────────────────────────────────────────
function _handlerOf(onclick) {
  const s = String(onclick || '');
  return s.endsWith(CLOSE_SUFFIX) ? s.slice(0, -CLOSE_SUFFIX.length) : s;
}
const _nameOf = (fn) => (/^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(fn) || [])[1] || '';
const _recIdsIn = (fn) => (String(fn).match(/'(rec[A-Za-z0-9]+)'/g) || []).map((s) => s.slice(1, -1));
function _fieldsOf(oid) { const r = W().recOf(oid); return (r && r.fields) || {}; }
function _pals(oids) {
  let n = 0, known = false;
  for (const id of oids) { const f = _fieldsOf(id); if ('Total Pallets' in f) { known = true; n += +f['Total Pallets'] || 0; } }
  return known ? n : null;
}
function _plural(n, one, many) {
  const lg = L();
  if (typeof lg.plural === 'function') { try { const s = lg.plural(n, one); if (s) return s; } catch (_) {} }
  return n + ' ' + (n === 1 ? one : many);
}
const _place = (f, kind) => W().raw(W().placeStr(f, kind));

// Parse builder HTML into item descriptors. The parsed <button> NODES are
// kept and later MOVED into the v4 menu (importNode): re-emitting a decoded
// onclick into a new attribute would break on quotes (§e.9 step 3).
// Headers (.wi-ctx-h) and separators are dropped: v4 draws its own sections.
function _parseItems(html, src) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  const out = [];
  for (const b of doc.querySelectorAll('button.wi-ctx-i')) {
    const onclick = b.getAttribute('onclick') || '';
    const label = String(b.textContent || '').trim();
    const fn = _handlerOf(onclick);
    out.push({ node: b, onclick, fn, name: _nameOf(fn), label, disabled: !!b.disabled || b.hasAttribute('disabled'),
      key: onclick ? 'on:' + onclick : 'dis:' + label, src });
  }
  return out;
}

function _keyEntries() {
  const km = L().KEYMAP, out = [];
  const isCode = (k) => /^(Shift\+)?(Key[A-Z]|Digit\d|Arrow(Up|Down|Left|Right)|Enter|Escape|Slash|Space|Tab)$/.test(k);
  const push = (combo, action) => { if (combo && action) out.push({ combo: String(combo), action: String(action) }); };
  if (Array.isArray(km)) {
    km.forEach((e) => {
      if (Array.isArray(e)) push(e[0], e[1]);
      else if (e && e.action) push((e.shift ? 'Shift+' : '') + (e.code || e.key || ''), e.action);
    });
  } else if (km && typeof km === 'object') {
    for (const [k, v] of Object.entries(km)) {
      const val = typeof v === 'string' ? v : (v && (v.action || v.code));
      if (isCode(k)) push(k, typeof v === 'string' ? v : v && v.action);
      else if (val && isCode(val)) push(val, k);   // keyed by action → code
    }
  }
  return out;
}
function _keyLabel(combo) {
  const SPECIAL = { 'Shift+Slash': '?', Slash: '/', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Enter: 'Enter', Space: 'Space', Tab: 'Tab' };
  if (SPECIAL[combo]) return SPECIAL[combo];
  const m = /^(Shift\+)?Key([A-Z])$/.exec(combo);
  if (m) return (m[1] ? '⇧' : '') + m[2];
  return combo.replace(/^Digit/, '');
}
function _hintFor(action) {
  const e = _keyEntries().find((x) => x.action === action);
  return e ? _keyLabel(e.combo) : '';
}

// ═══ Per-load menu (§e.9) ═══════════════════════════════════════════════

// The menu model: pure data over the parsed items (no DOM writes), so the
// parity test can check it in node (tests/wi4-menu-parity.test.js).
//   {rowId, oid, header:{l1,l2}, truck:[item], sections:[{kind, title, sub,
//    oids, items:[item], subs:[{kind, title, sub, oids, items}]}]}
// An item is {node?, onclick, fn, name, label, disabled, key, hint, v4only?}.
function _gather(orderId) {
  const I = W(), D = I.WINTL, lg = L();
  if (typeof lg.menuSection !== 'function') throw new Error('WI4.menuSection is missing (core/wi4-logic.js)');
  const v = V();
  const rowId = v ? v.rowIdOf(orderId) : null;
  const row = rowId == null ? null : D.rows.find((r) => r.id === rowId);
  if (!row) return null;
  const isGroup = (r) => !!r && (r.orderIds || []).length > 1;
  const oidsOf = (r) => (r ? ((r.orderIds && r.orderIds.length) ? r.orderIds.slice() : [r.orderId]).filter(Boolean) : []);

  const isImpRow = row.type === 'import';
  const impRow = !isImpRow && row.importId ? I.impGroupRowOf(row.importId) : (isImpRow ? row : null);
  const expOids = isImpRow ? [] : oidsOf(row);
  const impOids = impRow ? oidsOf(impRow) : [];

  // Sources, in old-opener routing order: a pre-order first, then a lot, then
  // the normal menu — exactly what _wiCtx / _wiImpCtx / _wiMatchedImpCtx do.
  const sections = [];
  let expUsedNormal = false, impUsedNormal = false;
  if (row.legOf) {
    const html = I.preCtxItems({ orderIds: [orderId] }) || I.legCtxItems(orderId);
    sections.push({ kind: 'leg', title: 'ΣΚΕΛΟΣ ΡΟΤΑΣ', sub: _routeLine(orderId), oids: [orderId], items: _parseItems(html, 'leg'), subs: [] });
  } else if (row.hasSplitLegs) {
    const pid = oidsOf(row)[0];
    const legs = (D._splitLegs && D._splitLegs[pid]) || [];
    sections.push({ kind: 'split', title: 'ΣΠΑΣΜΕΝΗ ΣΕ ' + (legs.length || 2) + ' ΣΚΕΛΗ', sub: _routeLine(pid),
      oids: [pid], items: _parseItems(I.splitHeaderCtxItems(row), 'split'), subs: [] });
  } else {
    if (!isImpRow) {
      let html = I.preCtxItems(row) || I.lotCtxItems(row, false);
      if (!html) { html = I.ctxItems(row); expUsedNormal = true; }
      sections.push({ kind: 'export', title: isGroup(row) ? 'GROUPAGE ΕΞΑΓΩΓΗΣ' : 'ΕΞΑΓΩΓΗ',
        sub: isGroup(row) ? _groupLine(expOids, 'del') : _routeLine(expOids[0]), oids: expOids, group: isGroup(row),
        splitLeg: !!row.splitLegOf, items: _parseItems(html, 'exp'), subs: [] });
    }
    if (impRow) {
      let html;
      if (isImpRow) html = I.preCtxItems(row) || I.lotCtxItems(row, true);
      else html = I.preCtxItems(impRow);
      if (!html) { html = isImpRow ? I.impCtxItems(row, undefined) : I.impCtxItems(impRow, row.id); impUsedNormal = true; }
      sections.push({ kind: 'import', title: isGroup(impRow) ? 'GROUPAGE ΕΙΣΑΓΩΓΗΣ' : 'ΕΙΣΑΓΩΓΗ',
        sub: isGroup(impRow) ? _groupLine(impOids, 'del') : _routeLine(impOids[0]), oids: impOids, group: isGroup(impRow),
        splitLeg: !!impRow.splitLegOf, items: _parseItems(html, 'imp'), subs: [] });
    }
  }

  // Sections by handler (§e.9 step 5). The truck section is WI4's rule; an
  // export-builder item that acts on an import order (unmatch, the import's
  // local relay) belongs under ΕΙΣΑΓΩΓΗ, where the user looks for it.
  const truck = [];
  const seen = new Set();
  const take = (it) => { if (seen.has(it.key)) return false; seen.add(it.key); return true; };
  const byKind = (k) => sections.find((s) => s.kind === k);
  for (const s of sections.slice()) {
    const keep = [];
    for (const it of s.items) {
      if (!take(it)) continue;
      const sec = lg.menuSection(it.name);
      if (sec === 'truck') { truck.push(it); continue; }
      const toImp = s.kind === 'export' && byKind('import') &&
        (sec === 'import' || _recIdsIn(it.fn).some((id) => impOids.includes(id)));
      if (toImp) byKind('import').pendingFromExp = (byKind('import').pendingFromExp || []).concat(it);
      else keep.push(it);
    }
    s.items = keep;
  }
  const imp = byKind('import');
  if (imp && imp.pendingFromExp) { imp.items = imp.items.concat(imp.pendingFromExp); delete imp.pendingFromExp; }

  // Member submenus («▸» per load of a groupage). Truck-section handlers are
  // dropped there: Figma shows each truck item once (rule 5).
  const memberSubs = (sec, groupRow, isImp) => {
    oidsOf(groupRow).forEach((m, i) => {
      const items = _parseItems(I.segCtxItems(groupRow.id, m, isImp), isImp ? 'segI' : 'segE')
        .filter((it) => lg.menuSection(it.name) !== 'truck' && take(it));
      const f = _fieldsOf(m);
      const p = 'Total Pallets' in f ? ' · ' + (+f['Total Pallets'] || 0) + ' π.' : '';
      sec.subs.push({ kind: 'member', title: (i + 1) + ' · ' + (I.clientName(f) || m) + p, head: 'ΦΟΡΤΙΟ ' + (i + 1) + ' ΤΗΣ ΟΜΑΔΑΣ',
        sub: _routeLine(m), oids: [m], items });
    });
  };
  const e = byKind('export'), im = byKind('import');
  if (e && e.group && expUsedNormal) memberSubs(e, row, false);
  if (im && im.group && impUsedNormal) memberSubs(im, impRow, true);

  // Local relays drawn under this row: one «▸» per relay, with the relay's own
  // menu (_wiRelayCtx items). Edit and delete of a relay live there today.
  const byOrder = (D.relay && D.relay.byOrder) || {};
  if (D.relay && D.relay.state === 'ok' && typeof I.relayIdsOfRow === 'function') {
    for (const oid of I.relayIdsOfRow(row)) {
      for (const rec of Object.values(byOrder[oid] || {})) {
        if (!rec || !rec.id) continue;
        const items = _parseItems(I.relayCtxItems(rec.id, oid), 'relay').filter(take);
        if (!items.length) continue;
        const host = (im && im.oids.includes(oid)) ? im : (e || sections[0]);
        if (!host) continue;
        host.subs.push({ kind: 'relay', title: _relayTitle(rec, oid), head: 'ΤΟΠΙΚΗ', sub: _routeLine(oid), oids: [oid], items });
      }
    }
  }

  // «Άνοιγμα παραγγελίας» first in every single-load section and member
  // submenu (§e.9 step 6) — today's name click. Not on a split leg (it keeps
  // «Αρχική παραγγελία…»), not where the same _wk3Edit already sits (a
  // pre-order's «Μετατροπή…», a lot's «Άνοιγμα», a rota leg's «Επεξεργασία…»).
  const openItem = (oid) => {
    const onclick = "_wk3Edit('" + oid + "')" + CLOSE_SUFFIX;
    if (!REC.test(oid) || seen.has('on:' + onclick)) return null;
    seen.add('on:' + onclick);
    return { onclick, fn: _handlerOf(onclick), name: '_wk3Edit', label: 'Άνοιγμα παραγγελίας', disabled: false, key: 'on:' + onclick, v4only: true };
  };
  for (const s of sections) {
    if ((s.kind === 'export' || s.kind === 'import') && !s.group && !s.splitLeg) {
      const o = openItem(s.oids[0]); if (o) s.items.unshift(o);
    }
    for (const sub of s.subs) if (sub.kind === 'member') { const o = openItem(sub.oids[0]); if (o) sub.items.unshift(o); }
  }

  // Labels and key hints.
  const hinted = new Set();
  const label = (it, ctx) => {
    let t = RELABEL.menu[it.label] || it.label;
    if (it.name === '_wiMenuPrint' && ctx && ctx.group) t = RELABEL.menu['Εκτύπωση όλων'];
    // Same handler on a row that is already a group: «(πρόσθεση)» is derived
    // from row state, not a new action (§e.9 relabel table).
    if (it.name === '_wiPanelGroupBuild' && /,\s*false\s*\)$/.test(it.fn) && ctx && ctx.group) t = 'Groupage εξαγωγών… (πρόσθεση)';
    it.label = t;
    const act = it.name === '_wiPanelAssign' ? 'assign' : it.name === '_wiMenuPrint' ? 'print' : it.v4only ? 'open' : null;
    it.hint = '';
    if (act && !hinted.has(act)) { const h = _hintFor(act); if (h) { it.hint = h; hinted.add(act); } }
  };
  truck.forEach((it) => label(it, null));
  for (const s of sections) { s.items.forEach((it) => label(it, s)); for (const sub of s.subs) sub.items.forEach((it) => label(it, null)); }

  return { rowId: row.id, oid: orderId, row, header: _menuHeader(row, impRow, expOids, impOids), truck, sections };
}

function _routeLine(oid) {
  const f = _fieldsOf(oid);
  if (!Object.keys(f).length) return '';
  const I = W();
  const p = 'Total Pallets' in f ? ' · ' + (+f['Total Pallets'] || 0) + ' π.' : '';
  return (I.clientName(f) || '—') + ' · ' + _place(f, 'load') + ' → ' + _place(f, 'del') + p;
}
function _groupLine(oids, kind) {
  const last = _fieldsOf(oids[oids.length - 1]);
  const pals = _pals(oids);
  return _plural(oids.length, 'φορτίο', 'φορτία') + ' → ' + _place(last, kind) + (pals == null ? '' : ' · ' + pals + ' π.');
}
function _relayTitle(rec, oid) {
  try {
    const o = W().relayOrder(oid);
    const s = (typeof Relay !== 'undefined' && Relay.summary) ? Relay.summary(rec, o) : null;
    if (s) return (s.kind === 'relay_delivery' ? 'Τοπική παράδοση' : 'Τοπική φόρτωση') + ' · ' + (s.driverName || 'ΠΡΟΣ ΑΝΑΘΕΣΗ') +
      (s.day && Relay.fmtDay ? ' · ' + Relay.fmtDay(s.day) : '');
  } catch (e) { _logErr(e, 'wi4 menu: relay title'); }
  return 'Τοπική';
}
function _menuHeader(row, impRow, expOids, impOids) {
  const I = W();
  let l1;
  if (row.hasSplitLegs) l1 = 'Σπασμένη παραγγελία';
  else if (row.partnerId) l1 = (row.partnerLabel || 'Συνεργάτης') + (row.partnerPlates ? ' · ' + row.partnerPlates : '');
  else if (row.truckLabel) l1 = row.truckLabel + (row.driverLabel ? ' · ' + row.driverLabel : '');
  else l1 = 'ΠΡΟΣ ΑΝΑΘΕΣΗ';
  const first = _fieldsOf(expOids[0] || impOids[0]);
  const lastF = _fieldsOf(impOids.length ? impOids[impOids.length - 1] : expOids[expOids.length - 1]);
  const from = first['Loading DateTime'] ? I.fmt(first['Loading DateTime']) : '—';
  const to = lastF['Delivery DateTime'] ? I.fmt(lastF['Delivery DateTime']) : '—';
  const n = [];
  if (expOids.length) n.push(expOids.length + ' ' + (expOids.length === 1 ? 'εξαγωγή' : 'εξαγωγές'));
  if (impOids.length) n.push(impOids.length + ' ' + (impOids.length === 1 ? 'εισαγωγή' : 'εισαγωγές'));
  return { l1, l2: from + ' → ' + to + (n.length ? ' · ' + n.join(' · ') : '') };
}

// Icon of an item from WI4.MENU_ICON (keyed on handler name). A word is a
// core/icons.js name; anything else is drawn as text.
function _iconEl(name) {
  const span = document.createElement('span');
  span.className = 'wi4-m-ic';
  const v = (L().MENU_ICON || {})[name];
  if (v && typeof icon === 'function' && /^[a-z][\w-]*$/.test(v)) span.innerHTML = icon(v, 14);
  else if (v) span.textContent = v;
  return span;
}
function _itemNode(it) {
  let b = it.node ? document.importNode(it.node, true) : null;
  if (!b) {
    // The v4-only «Άνοιγμα παραγγελίας»: same markup as _wiCtxBtn. The order
    // id passed REC above, so the attribute cannot carry markup.
    b = document.createElement('button');
    b.className = 'wi-ctx-i';
    b.setAttribute('onclick', it.onclick);
  }
  b.textContent = '';
  b.appendChild(_iconEl(it.name));
  b.appendChild(document.createTextNode(it.label));
  if (it.hint) { const k = document.createElement('span'); k.className = 'wi4-key wi4-m-k'; k.textContent = it.hint; b.appendChild(k); }
  return b;
}
function _secHead(title, sub) {
  const d = document.createElement('div');
  d.className = 'wi4-m-sec';
  d.textContent = title;
  if (sub) {
    // Section titles are upper-case words written as such (CSS upper-casing
    // keeps the Greek tonos in some browsers); the line under them is normal
    // text, so it undoes the section's caps style for itself.
    const s = document.createElement('div'); s.className = 'wi4-l2'; s.textContent = sub;
    Object.assign(s.style, { textTransform: 'none', letterSpacing: '0', fontWeight: '400', fontSize: '11px', color: 'var(--wi4-ink)' });
    d.appendChild(s);
  }
  return d;
}

let _menuHl = [];
let _menuObs = null;
function _hlClear() { _menuHl.forEach((el) => el.classList.remove('wi4-mhl')); _menuHl = []; }
function _hlSet(oids) {
  _hlClear();
  for (const oid of oids || []) {
    if (!REC.test(oid)) continue;
    document.querySelectorAll('#content .wi4 [data-oid="' + oid + '"]').forEach((el) => { el.classList.add('wi4-mhl'); _menuHl.push(el); });
  }
}
function _hoverable(el, oids) {
  el.addEventListener('mouseenter', () => _hlSet(oids));
  el.addEventListener('mouseleave', _hlClear);
}

function _renderMenu(model) {
  const frag = document.createDocumentFragment();
  const hd = document.createElement('div');
  hd.className = 'wi4-m-hd';
  hd.textContent = model.header.l1;
  const l2 = document.createElement('div'); l2.className = 'wi4-l2'; l2.textContent = model.header.l2;
  hd.appendChild(l2);
  frag.appendChild(hd);
  model.truck.forEach((it) => frag.appendChild(_itemNode(it)));
  let openSub = null;
  for (const s of model.sections) {
    const box = document.createElement('div');
    box.appendChild(_secHead(s.title, s.sub));
    s.items.forEach((it) => box.appendChild(_itemNode(it)));
    for (const sub of s.subs) {
      // The «▸» line toggles its submenu inline. Its items are inserted only
      // while open, so _wiCtxKeydown's ↑↓ never lands on a hidden button.
      // No onclick attribute: it is not an action, and the parity test
      // counts every onclick as one.
      const more = document.createElement('button');
      more.className = 'wi-ctx-i wi4-m-more';
      more.setAttribute('aria-expanded', 'false');
      more.appendChild(_iconEl('submenu'));
      more.appendChild(document.createTextNode(sub.title));
      const body = document.createElement('div');
      body.className = 'wi4-m-sub';
      const nodes = [_secHead(sub.head || '', sub.sub)].concat(sub.items.map(_itemNode));
      more.addEventListener('click', (ev) => {
        // Keep the menu open: _wiCtxShow closes it on the next document click.
        ev.stopPropagation();
        const opening = !body.classList.contains('open');
        if (openSub && openSub !== body) { openSub.classList.remove('open'); openSub.textContent = ''; openSub._more.setAttribute('aria-expanded', 'false'); }
        body.textContent = '';
        if (opening) nodes.forEach((n) => body.appendChild(n));
        body.classList.toggle('open', opening);
        more.setAttribute('aria-expanded', String(opening));
        openSub = opening ? body : null;
      });
      body._more = more;
      _hoverable(more, sub.oids);
      box.appendChild(more);
      box.appendChild(body);
    }
    _hoverable(box, s.oids);
    frag.appendChild(box);
  }
  return frag;
}

function _presenceCtx(record, part, action) {
  try {
    if (typeof FEATURES === 'undefined' || !FEATURES.WI_PRESENCE) return;
    if (typeof WI4Presence === 'undefined' || typeof WI4Presence.setContext !== 'function') return;
    WI4Presence.setContext({ week: W().WINTL.week, record: record || null, part: part || null, action: action || 'view' });
  } catch (e) { _logErr(e, 'wi4: presence context'); }
}
const _partOf = (oid) => (String(_fieldsOf(oid)['Direction'] || '') === 'Import' ? 'import' : 'export');

async function openRowMenu(e, orderId) {
  if (e && e.preventDefault) e.preventDefault();
  if (e && e.stopPropagation) e.stopPropagation();
  const I = W();
  // The read-only gate, exactly where _wiCtx calls it (no new role gate).
  if (I.blockReadOnly()) return;
  let model;
  try { model = _gather(orderId); }
  catch (err) {
    _logErr(err, 'wi4 menu: gather');
    _toast('Το μενού δεν άνοιξε — ' + ((err && err.message) || 'σφάλμα'), 'error');
    return;
  }
  if (!model) { _toast('Η σειρά δεν βρίσκεται πια στον πίνακα — ανανέωσε', 'warn'); return; }
  if (I.stockOn() && document.fullscreenElement) e = await I.leaveFs(e);
  const ctx = document.getElementById('wi-ctx');
  if (!ctx) return;
  const rows = 2 + model.truck.length + model.sections.reduce((n, s) => n + 2 + s.items.length + s.subs.length, 0);
  _hlClear();
  I.ctxShow(e, '', Math.min(window.innerHeight - 20, rows * 28));
  ctx.appendChild(_renderMenu(model));
  // Close bookkeeping: _wiCtxClose only hides #wi-ctx, so watch its style to
  // drop the row highlight and the presence context with it.
  if (_menuObs) _menuObs.disconnect();
  _menuObs = new MutationObserver(() => {
    if (ctx.style.display === 'block') return;
    _menuObs.disconnect(); _menuObs = null; _hlClear(); _presenceCtx(null, null, 'view');
  });
  _menuObs.observe(ctx, { attributes: true, attributeFilter: ['style'] });
  ctx.addEventListener('click', _hlClear, { once: true, capture: true });
  _presenceCtx(orderId, _partOf(orderId), 'menu');
}

// ═══ Conflict dialog «Ποια κρατάμε;» (§g.4) ═════════════════════════════
let _dlg = null;   // {back, resolve, onKey}
function _conflictText(conflict, ctx) {
  const lg = L();
  let d = null;
  try { if (typeof lg.describeConflict === 'function') d = lg.describeConflict(Object.assign({}, conflict, { mine: ctx && ctx.mine }), LABELS_GR); }
  catch (e) { _logErr(e, 'wi4: describeConflict'); }
  const txt = typeof d === 'string' ? d : (d && d.text);
  return txt || 'Η εγγραφή άλλαξε από τότε που την άνοιξες. Ποια κρατάμε;';
}
function _keepLabel(by) {
  if (typeof by === 'string' && by && by !== 'user' && by !== 'auto') return 'Κράτα του ' + by;
  if (by === 'user') return 'Κράτα του άλλου χρήστη';
  if (by === 'auto') return 'Κράτα την αυτόματη';
  return 'Κράτα την τρέχουσα';
}
function _btn(cls, text, onClick) {
  const b = document.createElement('button');
  b.className = cls; b.type = 'button'; b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
function _dlgClose(choice) {
  const d = _dlg; if (!d) return;
  _dlg = null;
  window.removeEventListener('keydown', d.onKey, true);
  if (d.back && d.back.parentNode) d.back.parentNode.removeChild(d.back);
  if (d.box && d.box.parentNode) d.box.parentNode.removeChild(d.box);
  d.resolve(choice);
}
function conflictDialog(conflict, ctx) {
  if (_dlg) _dlgClose('keep');
  const c = conflict || {};
  const kind = (ctx && ctx.kind) || 'assign';
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'wi4-conf';
    box.setAttribute('role', 'alertdialog');
    const p = document.createElement('div'); p.textContent = _conflictText(c, ctx); box.appendChild(p);
    const ft = document.createElement('div'); ft.className = 'wi4-dlg-ft';
    ft.appendChild(_btn('wi4-btn sm', _keepLabel(c.by), () => _dlgClose('keep')));
    if (kind === 'date') ft.appendChild(_btn('wi4-btn sm pri', 'Γράψε τη δική μου', () => _dlgClose('mine')));
    else ft.appendChild(_btn('wi4-btn sm pri', 'Ξανάνοιξε την ανάθεση', () => _dlgClose('reopen')));
    box.appendChild(ft);
    const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); _dlgClose('keep'); } };
    let back = null;
    // Inside the date panel when the conflict is about the date it is showing;
    // a small modal everywhere else (§g.4).
    if (kind === 'date' && _dp && _dp.oid === ctx.orderId && _dp.el) {
      const slot = _dp.el.querySelector('[data-wi4-conf]');
      slot.textContent = ''; slot.appendChild(box);
    } else {
      back = document.createElement('div');
      back.className = 'wi4-dlg-back';
      const dlg = document.createElement('div'); dlg.className = 'wi4-dlg';
      const x = _btn('wi4-link', '×', () => _dlgClose('keep'));
      x.setAttribute('aria-label', 'Κλείσιμο'); x.style.float = 'right';
      dlg.appendChild(x); dlg.appendChild(box);
      back.appendChild(dlg);
      // Closing in any way = «Κράτα του Χ»: that is what the screen already shows.
      back.addEventListener('mousedown', (ev) => { if (ev.target === back) _dlgClose('keep'); });
      document.body.appendChild(back);
    }
    _dlg = { back, box, resolve, onKey };
    window.addEventListener('keydown', onKey, true);
    const f = box.querySelector('button.pri'); if (f) f.focus();
  });
}

// ═══ Date panel (§e #10) ════════════════════════════════════════════════
let _dp = null;   // {oid, field, rec, cur:{field:iso}, sel, view:{y,m}, time0, busy, err, el, anchor, onKey, onDown}

const _pad = (n) => String(n).padStart(2, '0');
const _ymd = (d) => d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate());
function _dayOf(field, iso) {
  if (!iso) return null;
  if (field === 'VS CD Date') return String(iso).slice(0, 10);
  return typeof toLocalDate === 'function' ? (toLocalDate(iso) || null) : String(iso).slice(0, 10);
}
function _timeOf(field, iso) {
  if (!iso || field === 'VS CD Date') return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : _pad(d.getHours()) + ':' + _pad(d.getMinutes());
}
function _hasVs(f) { return !!f['Veroia Switch']; }

// The write arguments of the panel's current state, or null when nothing
// changed. hhmm is passed ONLY when the time was changed (or when resending
// «Γράψε τη δική μου»), so a day-only change sends exactly today's body:
// _wiDateWrite keeps the old time of day itself (_wk3IsoOnDay).
function _dpWriteArgs(st) {
  if (!st || !st.sel) return null;
  const curIso = st.cur[st.field] == null ? null : st.cur[st.field];
  const curDay = _dayOf(st.field, curIso);
  const t = st.field === 'VS CD Date' ? '' : String(st.time || '');
  const timeChanged = st.field !== 'VS CD Date' && t !== st.time0 && /^\d{2}:\d{2}$/.test(t);
  if (st.sel === curDay && !timeChanged && !st.force) return null;
  const hhmm = (timeChanged || (st.force && /^\d{2}:\d{2}$/.test(t))) ? t : undefined;
  return [st.oid, st.field, curIso, st.sel, hhmm];
}

function _dpGroupDay(f) {
  const isImp = String(f['Direction'] || '') === 'Import';
  return _dayOf('Loading DateTime', isImp ? f['Loading DateTime'] : f['Delivery DateTime']) || '';
}

function datePanel(orderId, field, anchorEl) {
  const I = W();
  const rec = (I.WINTL.data.exports || []).find((r) => r.id === orderId) || (I.WINTL.data.imports || []).find((r) => r.id === orderId);
  if (!rec) { _toast('Η παραγγελία δεν βρίσκεται στην εβδομάδα — ανανέωσε', 'warn'); return; }
  const f = rec.fields || {};
  if (!FIELD[field] || (field === 'VS CD Date' && !_hasVs(f))) field = 'Loading DateTime';
  _dpClose();
  // The value the user SEES is read now from WINTL.data (server truth) and
  // becomes the _expect of the write (§g.4), never re-read at save time.
  const cur = {};
  for (const k of Object.keys(FIELD)) cur[k] = f[k] == null ? null : f[k];
  const st = { oid: orderId, field, rec, cur, sel: null, view: null, time: '', time0: '', busy: false, err: '', el: null, anchor: anchorEl || null };
  _dpSetField(st, field);
  const el = document.createElement('div');
  el.className = 'wi4-datep';
  el.setAttribute('role', 'dialog');
  st.el = el;
  _dp = st;
  document.body.appendChild(el);
  _dpRender();
  _dpPlace();
  // ui.js:407 changes the week on ←/→ from a bubble-phase document listener.
  // While the panel is open, a capture-phase window listener owns ←/→/Esc and
  // stops them there (§d.4); it goes away with the panel.
  st.onKey = (ev) => {
    if (_dp !== st) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); if (_dlg) _dlgClose('keep'); else _dpClose(); return; }
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.stopPropagation();
    // Inside the time field the arrows move the caret; ui.js ignores inputs.
    if (ev.target && ev.target.closest && ev.target.closest('input,select,textarea')) return;
    ev.preventDefault();
    _dpMoveDay(ev.key === 'ArrowLeft' ? -1 : 1);
  };
  st.onDown = (ev) => {
    if (_dp !== st || st.busy) return;
    if (el.contains(ev.target) || (_dlg && _dlg.back && _dlg.back.contains(ev.target))) return;
    _dpClose();
  };
  window.addEventListener('keydown', st.onKey, true);
  setTimeout(() => { if (_dp === st) document.addEventListener('mousedown', st.onDown, true); }, 0);
  _presenceCtx(orderId, _partOf(orderId), 'date:' + field);
  const first = el.querySelector('.wi4-cal-d.sel') || el.querySelector('.wi4-seg button.on');
  if (first) first.focus();
}

function _dpSetField(st, field) {
  st.field = field;
  st.sel = _dayOf(field, st.cur[field]);
  st.time0 = _timeOf(field, st.cur[field]);
  st.time = st.time0;
  st.force = false;
  const base = st.sel || _today();
  st.view = { y: +base.slice(0, 4), m: +base.slice(5, 7) - 1 };
}
function _dpMoveDay(n) {
  const st = _dp; if (!st || st.busy || st.conflicting) return;
  const base = st.sel || _today();
  const d = new Date(+base.slice(0, 4), +base.slice(5, 7) - 1, +base.slice(8, 10) + n, 12);
  st.sel = _ymd(d);
  st.view = { y: d.getFullYear(), m: d.getMonth() };
  _dpRender();
  const s = st.el.querySelector('.wi4-cal-d.sel'); if (s) s.focus();
}

const _MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const _WEEK = ['Σάβ', 'Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ'];   // TMS week starts on Saturday

function _dpRender() {
  const st = _dp; if (!st) return;
  const I = W(), f = st.rec.fields || {};
  const el = st.el;
  el.textContent = '';
  const hd = document.createElement('div'); hd.className = 'wi4-datep-hd'; hd.textContent = FIELD[st.field].title; el.appendChild(hd);
  const id = document.createElement('div'); id.className = 'wi4-datep-id';
  id.textContent = (I.clientName(f) || '—') + ' · ' + _place(f, 'load') + ' — ' + _place(f, 'del');
  el.appendChild(id);

  const seg = document.createElement('div'); seg.className = 'wi4-seg'; seg.setAttribute('role', 'tablist');
  for (const k of Object.keys(FIELD)) {
    if (k === 'VS CD Date' && !_hasVs(f)) continue;
    const b = _btn(k === st.field ? 'on' : '', FIELD[k].seg, () => {
      if (st.busy || st.conflicting || k === st.field) return;
      _dpSetField(st, k); st.err = ''; _dpRender();
      _presenceCtx(st.oid, _partOf(st.oid), 'date:' + k);
    });
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(k === st.field));
    seg.appendChild(b);
  }
  el.appendChild(seg);

  const pn = document.createElement('div'); pn.setAttribute('data-wi4-pnote', ''); el.appendChild(pn);
  const conf = document.createElement('div'); conf.setAttribute('data-wi4-conf', ''); el.appendChild(conf);

  // Month header + Saturday-first grid.
  const nav = document.createElement('div'); nav.className = 'wi4-cal';
  nav.style.gridTemplateColumns = '28px 1fr 28px';
  const mv = (n) => () => { if (st.conflicting) return; const d = new Date(st.view.y, st.view.m + n, 1, 12); st.view = { y: d.getFullYear(), m: d.getMonth() }; _dpRender(); };
  const prev = _btn('wi4-cal-d', '‹', mv(-1)); prev.setAttribute('aria-label', 'Προηγούμενος μήνας');
  const next = _btn('wi4-cal-d', '›', mv(1)); next.setAttribute('aria-label', 'Επόμενος μήνας');
  const title = document.createElement('div'); title.className = 'wi4-cal-h'; title.style.fontSize = '12px';
  title.textContent = _MONTHS[st.view.m] + ' ' + st.view.y;
  nav.appendChild(prev); nav.appendChild(title); nav.appendChild(next);
  el.appendChild(nav);
  const cal = document.createElement('div'); cal.className = 'wi4-cal';
  _WEEK.forEach((w) => { const h = document.createElement('div'); h.className = 'wi4-cal-h'; h.textContent = w; cal.appendChild(h); });
  const first = new Date(st.view.y, st.view.m, 1, 12);
  const back = (first.getDay() + 1) % 7;   // days since the Saturday on/before the 1st
  const start = new Date(st.view.y, st.view.m, 1 - back, 12);
  const last = new Date(st.view.y, st.view.m + 1, 0, 12);
  const span = back + last.getDate();
  const cells = Math.ceil(span / 7) * 7;
  const today = _today(), curDay = _dayOf(st.field, st.cur[st.field]);
  for (let i = 0; i < cells; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12);
    const ymd = _ymd(d);
    const cls = ['wi4-cal-d'];
    if (d.getMonth() !== st.view.m) cls.push('out');
    if (ymd === today) cls.push('today');
    if (ymd === curDay && ymd !== st.sel) cls.push('cur');
    if (ymd === st.sel) cls.push('sel');
    const b = _btn(cls.join(' '), String(d.getDate()), () => { if (st.busy || st.conflicting) return; st.sel = ymd; st.err = ''; _dpRender(); });
    b.setAttribute('aria-label', I.fmt(ymd));
    if (ymd === st.sel) b.setAttribute('aria-pressed', 'true');
    cal.appendChild(b);
  }
  el.appendChild(cal);

  // VS CD Date stays date-only, as today (§e #10).
  if (st.field !== 'VS CD Date') {
    const lab = document.createElement('label'); lab.className = 'wi4-datep-id'; lab.textContent = 'Ώρα ';
    const t = document.createElement('input'); t.type = 'time'; t.className = 'wi4-time'; t.value = st.time;
    t.addEventListener('input', () => { st.time = t.value; });
    lab.appendChild(t);
    el.appendChild(lab);
  }
  const note = document.createElement('div'); note.className = 'wi4-datep-note';
  note.textContent = 'Αλλάζει και τις στάσεις και τη Βέροια όπου υπάρχει. Η Εβδομάδα δεν αλλάζει από εδώ.';
  el.appendChild(note);
  if (st.err) {
    const er = document.createElement('div'); er.className = 'wi4-conf'; er.setAttribute('role', 'alert'); er.textContent = st.err;
    el.appendChild(er);
  }
  const ft = document.createElement('div'); ft.className = 'wi4-datep-ft';
  const cancel = _btn('wi4-btn', 'Άκυρο', () => _dpClose());
  // Never a ✓ before the write has answered: the button says it is working.
  const ok = _btn('wi4-btn pri', st.busy ? 'Αποθηκεύεται…' : (st.err ? 'Ξαναδοκίμασε' : 'Αλλαγή'), () => _dpSave());
  if (st.busy || st.conflicting || !st.sel) ok.disabled = true;
  if (st.busy) cancel.disabled = true;
  ft.appendChild(cancel); ft.appendChild(ok);
  el.appendChild(ft);
  _refreshPresence();
}

function _dpPlace() {
  const st = _dp; if (!st) return;
  const el = st.el;
  const r = st.anchor && st.anchor.isConnected && st.anchor.getBoundingClientRect ? st.anchor.getBoundingClientRect() : null;
  const w = el.offsetWidth || 320, h = el.offsetHeight || 420;
  let left = r ? r.left : (window.innerWidth - w) / 2;
  let top = r ? r.bottom + 6 : (window.innerHeight - h) / 2;
  if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
  if (r && top + h > window.innerHeight - 12) top = r.top - h - 6;
  el.style.left = Math.max(10, left) + 'px';
  el.style.top = Math.max(10, top) + 'px';
}

function _dpClose() {
  const st = _dp; if (!st) return;
  _dp = null;
  window.removeEventListener('keydown', st.onKey, true);
  document.removeEventListener('mousedown', st.onDown, true);
  if (_dlg && _dlg.box && st.el.contains(_dlg.box)) _dlgClose('keep');
  if (st.el && st.el.parentNode) st.el.parentNode.removeChild(st.el);
  _presenceCtx(null, null, 'view');
  if (st.anchor && st.anchor.isConnected && st.anchor.focus) { try { st.anchor.focus(); } catch (_) {} }
}

async function _dpSave() {
  const st = _dp; if (!st || st.busy || st.conflicting) return;
  const args = _dpWriteArgs(st);
  if (!args) { _dpClose(); return; }
  const I = W(), v = V();
  st.busy = true; st.err = ''; _dpRender();
  const f = st.rec.fields || {};
  try {
    if (v && typeof v.noteMove === 'function') v.noteMove(st.oid, _dpGroupDay(f), (I.clientName(f) || '—') + ' → ' + _place(f, 'del'));
    const w = await I.dateWrite.apply(null, args);
    if (_dp !== st) return;
    if (w && w.conflict) {
      // While «Ποια κρατάμε;» is open the panel stays locked (no day click,
      // no second «Αλλαγή»): a re-render would drop the question, and a second
      // write would compare against the value the user just learned is stale.
      st.busy = false; st.conflicting = true; _dpRender();
      const mine = args[3] + (args[4] ? ' ' + args[4] : '');
      const choice = await conflictDialog(w.conflict, { orderId: st.oid, kind: 'date', mine: { [st.field]: mine } });
      if (_dp !== st) return;
      st.conflicting = false;
      if (choice === 'mine') {
        // «Γράψε τη δική μου» = resend with _expect = what the server holds
        // now. If it changed again meanwhile, that is another 409.
        const curNow = w.conflict.current ? w.conflict.current[st.field] : undefined;
        st.cur[st.field] = curNow === undefined ? null : curNow;
        st.force = true;
        return _dpSave();
      }
      _dpClose();
      I.renderWeeklyIntl();
      return;
    }
    if (!w || !w.ok) throw new Error('η εγγραφή δεν επιβεβαιώθηκε');
    // A Worker that could not run the check says so (§g.3): a quiet note for
    // this save, never a silent «checked».
    if (w.rec && w.rec._expectChecked === 'skipped') _toast('Ο έλεγχος «το άλλαξε άλλος» δεν έγινε σε αυτή την αποθήκευση', 'info');
    _dpClose();
    _toast('Ημερομηνία ενημερώθηκε ✓');
    I.renderWeeklyIntl();
  } catch (e) {
    if (typeof reportError === 'function') reportError('Η αλλαγή ημερομηνίας απέτυχε', e); else _logErr(e, 'wi4 date panel');
    if (_dp !== st) return;
    st.busy = false;
    st.err = 'Δεν αποθηκεύτηκε — ' + ((e && e.message) || 'σφάλμα') + '. Η ημερομηνία έμεινε όπως ήταν.';
    _dpRender();
  }
}

// Presence note inside the open date panel (§e #10, wording verbatim). An
// indication, never a lock. Called on render and from WIV2.presencePatch.
function _refreshPresence() {
  const st = _dp; if (!st || !st.el) return;
  const slot = st.el.querySelector('[data-wi4-pnote]'); if (!slot) return;
  slot.textContent = ''; slot.className = '';
  if (typeof FEATURES === 'undefined' || !FEATURES.WI_PRESENCE || typeof WI4Presence === 'undefined' || typeof WI4Presence.others !== 'function') return;
  let others = [];
  try { others = WI4Presence.others() || []; } catch (e) { _logErr(e, 'wi4: presence others'); return; }
  const want = 'date:' + st.field;
  for (const p of others) {
    const recs = Array.isArray(p.records) ? p.records : [p];
    const hit = recs.find((r) => r && r.record === st.oid && r.action === want);
    if (!hit) continue;
    const ago = hit.since ? Math.max(0, Math.round((Date.now() - new Date(hit.since).getTime()) / 1000)) : null;
    const when = ago == null ? '' : ' από πριν ' + (ago < 60 ? ago + '″' : Math.round(ago / 60) + '΄');
    slot.className = 'wi4-pnote';
    slot.textContent = 'Ο ' + (p.name || p.user_name || 'άλλος χρήστης') + ' έχει ανοιχτή αυτή την ημερομηνία' + when +
      '. Αν αποθηκεύσετε και οι δύο, θα σου πει ποια μένει.';
    return;
  }
}

// ═══ Queue panel «Όλα N ▾» (§e #3) ══════════════════════════════════════
let _qp = null;   // {el, items, on, onKey, onDown}
const _isUnknown = (it) => it && (it.code === 'SOURCE_UNKNOWN' || it.code === 'NAT_UNKNOWN');

function _queueAct(it) {
  if (!it) return;
  const I = W(), v = V();
  const oid = it.rowKey || it.key;
  const anchor = _rowEl(oid);
  switch (it.act) {
    case 'assign': return _assign(oid);
    case 'newImport': { const id = v && v.rowIdOf(oid); if (id != null) I.newImport(id); return; }
    case 'pieces': return I.stockLooseOpen(anchor || document.querySelector('#content .wi4 #wi-shelf'));
    case 'lot': {
      const st = I.WINTL.data.stock;
      const lot = st && (st.lots || []).find((l) => l.id === (it.lotId || it.key));
      if (!lot) { _toast('Η παρτίδα δεν βρέθηκε στο απόθεμα — ανανέωσε', 'warn'); return; }
      return I.stockLotOpen(anchor || document.querySelector('#content .wi4 #wi-shelf'), lot);
    }
    case 'national': if (typeof navigate === 'function') navigate('weekly_natl'); return;
    case 'date': return datePanel(oid, it.field || 'Loading DateTime', anchor && anchor.querySelector('.wi4-dc') || anchor);
    case 'open': case 'convert': if (REC.test(oid)) I.edit(oid); return;
    case 'retry': return it.source === 'relays' ? I.relayReload() : I.renderWeeklyIntl();
    default:
      if (v && oid) v.focusRow(oid);
  }
}

function queuePanel() {
  if (_qp) { _qpClose(); return; }
  const v = V(); if (!v) return;
  const items = (v.queueItems() || []).slice();
  const el = document.createElement('div');
  el.className = 'wi4-qp';
  el.setAttribute('role', 'dialog');
  const hd = document.createElement('div'); hd.className = 'wi4-qp-h';
  hd.textContent = 'ΕΠΟΜΕΝΑ · ' + (items.some(_isUnknown) ? '≥' : '') + items.length + ' ';
  const kq = document.createElement('span'); kq.className = 'wi4-key'; kq.textContent = 'Q';
  const ke = document.createElement('span'); ke.className = 'wi4-key'; ke.textContent = 'Esc';
  hd.appendChild(kq); hd.appendChild(document.createTextNode(' επόμενο ')); hd.appendChild(ke); hd.appendChild(document.createTextNode(' κλείσιμο'));
  el.appendChild(hd);
  const rows = [];
  const lvls = [['red', 'ΤΩΡΑ'], ['amber', 'ΠΡΟΣΟΧΗ']];
  for (const [lvl, name] of lvls) {
    const its = items.filter((i) => i.level === lvl);
    if (!its.length) continue;
    const h = document.createElement('div'); h.className = 'wi4-qp-h ' + (lvl === 'red' ? 'wi4-t-red' : 'wi4-t-amb');
    h.textContent = name + ' · ' + its.length;
    el.appendChild(h);
    for (const it of its) {
      const r = document.createElement('div');
      r.className = 'wi4-qp-i ' + (lvl === 'red' ? 'wi4-r-red' : 'wi4-r-amb');
      r.tabIndex = -1;
      const t = document.createElement('div'); t.className = 'wi4-qcard-t';
      const l1 = document.createElement('span'); l1.className = 'wi4-l1 wi4-ell'; l1.textContent = it.text || it.title || it.code; l1.title = l1.textContent;
      t.appendChild(l1);
      if (it.sub) { const l2 = document.createElement('span'); l2.className = 'wi4-l2 wi4-ell'; l2.textContent = it.sub; l2.title = it.sub; t.appendChild(l2); }
      r.appendChild(t);
      if (ACT_LABEL[it.act]) {
        r.appendChild(_btn('wi4-btn sm', ACT_LABEL[it.act], (ev) => { ev.stopPropagation(); _qpClose(); _queueAct(it); }));
      }
      // A click on the body goes to the row and highlights it (sheet 15 B).
      r.addEventListener('click', () => { _qpOn(rows.indexOf(r)); });
      el.appendChild(r);
      rows.push(r); r._it = it;
    }
  }
  if (!items.length) {
    const r = document.createElement('div'); r.className = 'wi4-qp-i wi4-t-g2'; r.textContent = 'Τίποτα επείγον αυτή την εβδομάδα';
    el.appendChild(r);
  }
  document.body.appendChild(el);
  const a = document.querySelector('#content .wi4 .wi4-q-all');
  const ar = a && a.getBoundingClientRect ? a.getBoundingClientRect() : null;
  const w = el.offsetWidth || 440;
  el.style.left = Math.max(10, Math.min(window.innerWidth - w - 12, ar ? ar.right - w : window.innerWidth - w - 24)) + 'px';
  el.style.top = (ar ? ar.bottom + 6 : 80) + 'px';
  _qp = { el, rows, on: -1, anchor: a };
  _qp.onKey = (ev) => {
    if (!_qp || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); _qpClose(); return; }
    if (ev.code === 'KeyQ' || ev.key === 'ArrowDown') { ev.preventDefault(); ev.stopPropagation(); _qpOn(_qp.on + 1); return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); ev.stopPropagation(); _qpOn(_qp.on - 1); return; }
    if (ev.key === 'Enter' && _qp.on >= 0 && !(ev.target && ev.target.tagName === 'BUTTON')) {
      ev.preventDefault(); ev.stopPropagation();
      const it = _qp.rows[_qp.on]._it; _qpClose(); _queueAct(it);
    }
  };
  _qp.onDown = (ev) => { if (_qp && !el.contains(ev.target) && !(a && a.contains(ev.target))) _qpClose(); };
  window.addEventListener('keydown', _qp.onKey, true);
  setTimeout(() => { if (_qp && _qp.el === el) document.addEventListener('mousedown', _qp.onDown, true); }, 0);
  if (rows.length) _qpOn(0);
}
function _qpOn(i) {
  const q = _qp; if (!q || !q.rows.length) return;
  q.on = (i + q.rows.length) % q.rows.length;
  q.rows.forEach((r, k) => r.classList.toggle('on', k === q.on));
  const r = q.rows[q.on];
  if (r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
  const v = V(), it = r._it;
  if (v && it && it.rowKey) v.focusRow(it.rowKey);
}
function _qpClose() {
  const q = _qp; if (!q) return;
  _qp = null;
  window.removeEventListener('keydown', q.onKey, true);
  document.removeEventListener('mousedown', q.onDown, true);
  if (q.el.parentNode) q.el.parentNode.removeChild(q.el);
}

// ═══ «?» shortcuts sheet (§e #17) ═══════════════════════════════════════
let _help = null;
function _helpOpen() {
  if (_help) { _helpClose(); return; }
  const back = document.createElement('div'); back.className = 'wi4-dlg-back';
  const dlg = document.createElement('div'); dlg.className = 'wi4-dlg'; dlg.setAttribute('role', 'dialog');
  const hd = document.createElement('div'); hd.className = 'wi4-datep-hd'; hd.textContent = 'Συντομεύσεις ';
  const esc = _btn('wi4-key', 'Esc', () => _helpClose()); esc.style.float = 'right'; esc.setAttribute('aria-label', 'Κλείσιμο');
  hd.appendChild(esc);
  dlg.appendChild(hd);
  // Built from the live keymap: only keys that work are listed (§d.4).
  const rows = [];
  for (const e of _keyEntries()) {
    const text = ACTION_TEXT[e.action] || e.action;
    const prevRow = rows.find((r) => r.text === text && r.group === (ACTION_GROUP[e.action] || 'ΓΕΝΙΚΑ'));
    if (prevRow) prevRow.keys.push(_keyLabel(e.combo));
    else rows.push({ group: ACTION_GROUP[e.action] || 'ΓΕΝΙΚΑ', text, keys: [_keyLabel(e.combo)] });
  }
  for (const g of ['ΠΛΟΗΓΗΣΗ', 'ΣΤΗ ΣΕΙΡΑ', 'ΓΕΝΙΚΑ']) {
    const its = rows.filter((r) => r.group === g);
    if (!its.length) continue;
    const gh = document.createElement('div'); gh.className = 'wi4-qp-h'; gh.style.padding = '8px 0 2px'; gh.textContent = g;
    dlg.appendChild(gh);
    for (const r of its) {
      const row = document.createElement('div'); row.className = 'wi4-help-row';
      const k = document.createElement('div');
      r.keys.forEach((x) => { const s = document.createElement('span'); s.className = 'wi4-key'; s.textContent = x; s.style.marginRight = '4px'; k.appendChild(s); });
      const t = document.createElement('div'); t.textContent = r.text;
      row.appendChild(k); row.appendChild(t);
      dlg.appendChild(row);
    }
  }
  const GR = { A: 'Α', D: 'Δ', P: 'Π', N: 'Ν', O: 'Ο', Q: '—' };
  const letters = _keyEntries().map((e) => (/^Key([A-Z])$/.exec(e.combo) || [])[1]).filter((x) => x && GR[x] && GR[x] !== '—');
  const foot = document.createElement('div'); foot.className = 'wi4-datep-note';
  foot.textContent = (letters.length ? 'Ίδιο πλήκτρο σε ελληνικό και λατινικό πληκτρολόγιο (' + letters.map((x) => x + ' = ' + GR[x]).join(', ') + '). ' : '') +
    'Μέσα σε πεδίο κειμένου οι συντομεύσεις δεν ενεργούν. Ό,τι σβήνει ρωτά πρώτα, όπως και με το ποντίκι.';
  dlg.appendChild(foot);
  back.appendChild(dlg);
  back.addEventListener('mousedown', (ev) => { if (ev.target === back) _helpClose(); });
  document.body.appendChild(back);
  const onKey = (ev) => {
    if (ev.key === 'Escape' || (ev.code === 'Slash' && ev.shiftKey)) { ev.preventDefault(); ev.stopPropagation(); _helpClose(); }
  };
  window.addEventListener('keydown', onKey, true);
  _help = { back, onKey };
  esc.focus();
}
function _helpClose() {
  const h = _help; if (!h) return;
  _help = null;
  window.removeEventListener('keydown', h.onKey, true);
  if (h.back.parentNode) h.back.parentNode.removeChild(h.back);
}

// ═══ Keyboard (§d.4, §e #17) ════════════════════════════════════════════
function _rowEl(oid) {
  if (!REC.test(String(oid || ''))) return null;
  const v = V();
  const id = v ? v.rowIdOf(oid) : null;
  return (id != null && document.getElementById('wi-row-' + id)) || document.getElementById('wi-imp-' + oid) ||
    document.querySelector('#content .wi4 [data-oid="' + oid + '"]');
}
// _wiOpenPopover reads e.currentTarget.getBoundingClientRect(): from a key or
// a queue card it gets a synthetic event on the element, as weekly_natl does.
function _synth(el) {
  const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 200, bottom: 200, top: 180, width: 0, height: 0 };
  return { currentTarget: el, target: el, clientX: Math.round(r.left + 12), clientY: Math.round(r.bottom), preventDefault() {}, stopPropagation() {} };
}
function _assign(oid) {
  const I = W(), v = V();
  const id = v ? v.rowIdOf(oid) : null;
  const row = id == null ? null : I.WINTL.rows.find((r) => r.id === id);
  if (!row) { _toast('Η σειρά δεν βρίσκεται πια στον πίνακα — ανανέωσε', 'warn'); return; }
  const el = _rowEl(oid);
  const box = (el && el.querySelector('.wi4-asg .wi4-box, .wi4-box')) || el;
  if (!box) return;
  const ev = _synth(box);
  if (row.type === 'import') I.openImpPopover(ev, row.orderId, row.id); else I.openPopover(ev, row.id);
  _presenceCtx(oid, _partOf(oid), 'assign');
}
function _focusOid() { const ui = W().WINTL.ui || {}; return ui.v4Focus || null; }
function _clearFocus() {
  const I = W();
  if (I.WINTL.ui) I.WINTL.ui.v4Focus = null;
  document.querySelectorAll('#content .wi4 .wi4-focus').forEach((el) => el.classList.remove('wi4-focus'));
}

function _state() {
  const shown = (id) => { const el = document.getElementById(id); return !!(el && el.style.display === 'block'); };
  const mo = document.getElementById('modalOverlay');
  const pal = document.getElementById('cmdk-overlay');
  return {
    menuOpen: shown('wi-ctx'), panelOpen: shown('wi-panel'), popoverOpen: shown('wi-popover'),
    dialogOpen: !!(_dlg || _help || _qp), datePanelOpen: !!_dp,
    modalOpen: !!((mo && mo.classList.contains('open')) || document.querySelector('.mf-overlay')),
    paletteOpen: !!(pal && pal.style.display && pal.style.display !== 'none'),
    onPage: typeof currentPage !== 'undefined' && currentPage === 'weekly_intl',
    rootPresent: !!document.querySelector('#content .wi4'),
    hasFocusRow: !!_focusOid(),
  };
}

function run(action) {
  if (!_live()) return;
  const I = W(), v = V();
  const oid = _focusOid();
  switch (action) {
    case 'rowPrev': case 'rowNext': {
      const order = v.rowOrder() || [];
      if (!order.length) return;
      const i = order.indexOf(oid);
      const n = i < 0 ? (action === 'rowNext' ? 0 : order.length - 1) : Math.max(0, Math.min(order.length - 1, i + (action === 'rowNext' ? 1 : -1)));
      v.focusRow(order[n]);
      return;
    }
    case 'queueNext': {
      if (_qp) { _qpOn(_qp.on + 1); return; }
      const items = (v.queueItems() || []).filter((it) => it && it.rowKey);
      if (!items.length) return;
      const i = items.findIndex((it) => it.rowKey === oid);
      // Skip items whose row is not on this board (W+1 loads): try each once.
      for (let k = 1; k <= items.length; k++) {
        const it = items[(i + k + items.length) % items.length];
        if (v.focusRow(it.rowKey)) return;
      }
      _toast('Τα επόμενα της ουράς δεν είναι σε αυτή την εβδομάδα — δες το «Όλα»', 'info');
      return;
    }
    case 'search': v.searchFocus(); return;
    case 'help': _helpOpen(); return;
    case 'escape':
      if (I.WINTL.filter) v.search(''); else _clearFocus();
      return;
  }
  if (!oid) return;
  const el = _rowEl(oid);
  switch (action) {
    case 'menu': {
      const plane = el && el.querySelector('.wi4-plane');
      openRowMenu(_synth(plane || el), oid);
      return;
    }
    case 'assign': _assign(oid); return;
    case 'date': datePanel(oid, 'Loading DateTime', (el && el.querySelector('.wi4-dc')) || el); return;
    case 'print': {
      const id = v.rowIdOf(oid);
      const row = id == null ? null : I.WINTL.rows.find((r) => r.id === id);
      if (row) I.menuPrint(row.id, row.type === 'import');
      return;
    }
    case 'newImport': {
      const id = v.rowIdOf(oid);
      const row = id == null ? null : I.WINTL.rows.find((r) => r.id === id);
      // N works only on an empty return (§d.4): own export, no import, no partner.
      if (row && row.type === 'export' && !row.importId && !row.partnerId) I.newImport(row.id);
      else _toast('Το N ανοίγει νέα εισαγωγή μόνο σε κενό γύρισμα', 'info');
      return;
    }
    case 'open': I.edit(oid); return;
  }
}

function _evOf(e) {
  const t = e.target || {};
  return { code: e.code, key: e.key, shift: !!e.shiftKey, ctrl: !!e.ctrlKey, meta: !!e.metaKey, alt: !!e.altKey,
    targetTag: String(t.tagName || '').toLowerCase(), editable: !!t.isContentEditable };
}
function _onKey(e) {
  if (!_live()) return;
  const lg = L();
  if (typeof lg.keyAction !== 'function') return;
  const act = lg.keyAction(_evOf(e), _state());
  if (!act) return;
  e.preventDefault();
  // The blue ring shows only after keyboard use (sheet 15 C).
  const root = document.querySelector('#content .wi4');
  if (root) root.classList.add('wi4-kbd');
  run(act);
}
function _onMouse() {
  if (!_live()) return;
  const root = document.querySelector('#content .wi4');
  if (root) root.classList.remove('wi4-kbd');
}

// ═══ #wi-panel relabel (§e.9) ═══════════════════════════════════════════
// Panels opened from a relabelled item keep one name per thing: «Groupage
// εξαγωγών…» never opens a panel titled «Ομαδοποίηση». Idempotent (it only
// writes when a text differs), so its own writes cannot loop the observer.
function _relabelPanel(panel) {
  if (!panel || !_live() || !document.body.classList.contains('wi4-on')) return;
  const t = panel.querySelector('.wi-panel-title');
  if (t && RELABEL.panelTitle[t.textContent]) t.textContent = RELABEL.panelTitle[t.textContent];
  const btn = panel.querySelector('.wi-panel-ft .btn-primary');
  if (btn && RELABEL.panelButton[btn.textContent]) {
    const imp = t && /εισαγωγών/.test(t.textContent);
    const want = imp ? 'Groupage εισαγωγών' : 'Groupage εξαγωγών';
    if (btn.textContent !== want) btn.textContent = want;
  }
}
let _panelObs = null;
let _attached = false;
function attach() {
  if (!_attached) {
    _attached = true;
    document.addEventListener('keydown', _onKey);
    document.addEventListener('mousedown', _onMouse, true);
  }
  // #wi-panel is re-created by every full paint (it lives in #content), so
  // the observer is re-attached on each call (disconnected first).
  if (_panelObs) _panelObs.disconnect();
  const panel = document.getElementById('wi-panel');
  if (!panel) return;
  _panelObs = new MutationObserver(() => _relabelPanel(panel));
  _panelObs.observe(panel, { childList: true, subtree: true, characterData: true });
  _relabelPanel(panel);
}

function isOpen() { return !!(_dp || _qp || _dlg || _help); }

window.WI4Actions = Object.freeze({
  openRowMenu, datePanel, conflictDialog, queuePanel, run, attach, isOpen,
  // Seams for tests and for WP4 (underscore = not part of the frozen
  // contract). _queueAct is the ONE dispatcher of queue actions, for the
  // band cards and the «Όλα» panel alike (principle 3).
  _gather, _dpWriteArgs, _queueAct, _refreshPresence, _keyEntries, _RELABEL: RELABEL,
});
})();
