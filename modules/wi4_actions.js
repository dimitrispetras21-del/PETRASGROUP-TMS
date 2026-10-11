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
// Queue card / panel buttons (§e #2): one existing action per item. The ONE
// copy: the band's cards (WIV2) read it through _actLabel.
const ACT_LABEL = Object.freeze({
  assign: 'Ανάθεση', newImport: 'Νέα εισαγωγή', pieces: 'Κομμάτια', national: 'Εθνικά →', date: 'Ημερομηνία',
  open: 'Άνοιγμα', lot: 'Παρτίδα', convert: 'Μετατροπή', retry: 'Ξαναδοκίμασε', relay: 'Τοπικός οδηγός',
});
const _actLabel = (it) => (!it ? '' : it.act === 'week' ? 'W' + (it.week || '+1') + ' →' : (ACT_LABEL[it.act] || ''));

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
// The group line's pallets with the BOARD's rule (WIV2._pals, one source):
// «28+? π.» when a member has no figure — the row's cell says «28+?» for the
// same load, and «· 28 π.» here made it two numbers (review 11/10).
function _pals(oids) {
  const v = V(), list = oids.map(_fieldsOf);
  const p = v && typeof v._pals === 'function' ? v._pals(list) : null;
  if (!p) return null;
  return p.known ? String(p.n) + (p.miss ? '+?' : '') : null;
}
function _plural(n, one, many) {
  const lg = L();
  if (typeof lg.plural === 'function') { try { const s = lg.plural(n, one); if (s) return s; } catch (_) {} }
  return n + ' ' + (n === 1 ? one : many);
}
const GONE = 'Η σειρά δεν βρίσκεται πια στον πίνακα — ανανέωσε';

// Parse builder HTML into item descriptors. The parsed <button> NODES are
// kept and later MOVED into the v4 menu (importNode): re-emitting a decoded
// onclick into a new attribute would break on quotes (§e.9 step 3).
// Headers (.wi-ctx-h) and separators are dropped: v4 draws its own sections.
// A builder returns some items DISABLED (no onclick, the reason in the title,
// e.g. «+ Κομμάτι από απόθεμα…» on a row with no truck yet). They still
// belong to a section and carry an icon: the label names the handler they
// stand for (sheet 14 draws it with the truck items, its icon in the icon
// column — review 11/10: it fell under ΕΞΑΓΩΓΗ, out of line, iconless).
const DISABLED_AS = Object.freeze({ '+ Κομμάτι από απόθεμα…': '_wiStockPanel' });
function _parseItems(html, src) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  const out = [];
  for (const b of doc.querySelectorAll('button.wi-ctx-i')) {
    const onclick = b.getAttribute('onclick') || '';
    const label = String(b.textContent || '').trim();
    const fn = _handlerOf(onclick);
    const disabled = !!b.disabled || b.hasAttribute('disabled');
    out.push({ node: b, onclick, fn, name: _nameOf(fn), label, disabled,
      as: !onclick && disabled ? (DISABLED_AS[label] || '') : '',
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
      const sec = lg.menuSection(it.name || it.as || '');
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
        .filter((it) => lg.menuSection(it.name || it.as || '') !== 'truck' && take(it));
      const f = _fieldsOf(m);
      const p = 'Total Pallets' in f ? ' · ' + (+f['Total Pallets'] || 0) + ' π.' : '';
      sec.subs.push({ kind: 'member', title: (i + 1) + ' · ' + (I.clientName(f) || m) + p, head: 'ΦΟΡΤΙΟ ' + (i + 1) + ' ΤΗΣ ΟΜΑΔΑΣ',
        sub: _memberLine(m), oids: [m], items });
    });
  };
  const e = byKind('export'), im = byKind('import');
  if (e && e.group && expUsedNormal) memberSubs(e, row, false);
  if (im && im.group && impUsedNormal) memberSubs(im, impRow, true);
  // An item of the group section that names ONE member and nothing else (e.g.
  // «Φόρτωση με τοπικό οδηγό — εξαγωγή REF-…») acts on that load, so it lives
  // in that member's submenu (sheet 14), not three times in the group list.
  for (const s of [e, im]) {
    if (!s || !s.subs.length) continue;
    s.items = s.items.filter((it) => {
      const ids = [...new Set(_recIdsIn(it.fn))];
      const sub = ids.length === 1 && s.subs.find((x) => x.kind === 'member' && x.oids[0] === ids[0]);
      if (!sub) return true;
      sub.items.push(it);
      return false;
    });
  }

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
  // Where the builder already holds that _wk3Edit (a pre-order's
  // «Μετατροπή…», a lot's «Άνοιγμα», a split leg's «Αρχική παραγγελία…»), THAT
  // item moves first: the order always opens from the top of its section.
  const openFirst = (list) => { const i = list.findIndex((it) => it.name === '_wk3Edit'); if (i > 0) list.unshift(list.splice(i, 1)[0]); };
  for (const s of sections) {
    if ((s.kind === 'export' || s.kind === 'import') && !s.group) {
      const o = s.splitLeg ? null : openItem(s.oids[0]);
      if (o) s.items.unshift(o); else openFirst(s.items);
    }
    for (const sub of s.subs) if (sub.kind === 'member') { const o = openItem(sub.oids[0]); if (o) sub.items.unshift(o); else openFirst(sub.items); }
  }

  // Labels and key hints.
  const hinted = new Set();
  // own = the direction word a load list may drop (parity r1, F13): inside
  // ONE load's list (a single-load section, a member submenu) the builder's
  // « — εξαγωγή REF-…» only repeats the section head and cut the label at
  // 300px (Figma 1097:3897 / 1064:2396: «Φόρτωση με τοπικό οδηγό…»). The
  // other direction's word stays: there it names a different order.
  const label = (it, ctx, own) => {
    let t = RELABEL.menu[it.label] || it.label;
    if (it.name === '_wiMenuPrint' && ctx && ctx.group) t = RELABEL.menu['Εκτύπωση όλων'];
    // Same handler on a row that is already a group: «(πρόσθεση)» is derived
    // from row state, not a new action (§e.9 relabel table).
    if (it.name === '_wiPanelGroupBuild' && /,\s*false\s*\)$/.test(it.fn) && ctx && ctx.group) t = 'Groupage εξαγωγών… (πρόσθεση)';
    if (own) t = t.replace(new RegExp(' — ' + own + '(?: .*?)?(…?)$'), '$1');
    it.label = t;
    const act = it.name === '_wiPanelAssign' ? 'assign' : it.name === '_wiMenuPrint' ? 'print' : it.v4only ? 'open' : null;
    it.hint = '';
    if (act && !hinted.has(act)) { const h = _hintFor(act); if (h) { it.hint = h; hinted.add(act); } }
  };
  const word = (s) => (s.kind === 'export' ? 'εξαγωγή' : s.kind === 'import' ? 'εισαγωγή' : '');
  truck.forEach((it) => label(it, null));
  for (const s of sections) {
    s.items.forEach((it) => label(it, s, s.group ? '' : word(s)));
    for (const sub of s.subs) sub.items.forEach((it) => label(it, null, sub.kind === 'member' ? word(s) : ''));
  }

  // Red and order (parity r1, F6; Figma 1097:3858, sheet 14 1064:2376).
  // «Αφαίρεση ταιριάσματος» undoes a match like «Καθαρισμός», «Διάλυση» and
  // «Βγάλε από το groupage» undo theirs, so it is red in v4 too (v1 keeps its
  // plain item). Every list reads the same way: the order's opener stays on
  // top (the rig and the O key rely on it), print second, the rest in the
  // builder's order, the red items last — never a red line between two
  // ordinary ones.
  const isDanger = (it) => it.danger || /(^|\s)d(\s|$)/.test((it.node && it.node.getAttribute && it.node.getAttribute('class')) || '');
  const isPrint = (it) => it.name === '_wiMenuPrint' || it.name === '_wiPrintSplitAll';
  const ordered = (list) => {
    list.forEach((it) => { if (it.name === '_wiUnmatchRow' || it.name === '_wiUnmatch' || isDanger(it)) it.danger = true; });
    const head = list.length && list[0].name === '_wk3Edit' ? list.slice(0, 1) : [];
    const rest = list.slice(head.length);
    return head.concat(rest.filter(isPrint), rest.filter((it) => !isPrint(it) && !it.danger), rest.filter((it) => !isPrint(it) && it.danger));
  };
  for (const s of sections) { s.items = ordered(s.items); for (const sub of s.subs) sub.items = ordered(sub.items); }

  return { rowId: row.id, oid: orderId, row, header: _menuHeader(row, impRow, expOids, impOids), truck, sections };
}

// Section lines in the row's own words (sheet 14, menu ≈ 300px): a load is
// «ΠΕΛΑΤΗΣ · Φόρτωση → Παράδοση · 18 π.», never the v1 dump of every stop with
// its country spelled out (review 11/10: «Alpha Farm, Veria, Ελλάδα → Beta
// Market, Berlin, Γερμανία, Zeta Store, …» made the menu 820px wide). The
// names come from WIV2._ends — the same parser and «χώρα μόνο εκτός GR» rule
// as the row. Only the first loading and the last delivery point: «+N» on
// the row holds the rest.
const _pi = (p) => (p == null ? '' : ' · ' + p + ' π.');
function _endsOf(oid) { const v = V(); try { return v && typeof v._ends === 'function' ? v._ends(oid) : null; } catch (e) { _logErr(e, 'wi4 menu: ends'); return null; } }
function _routeLine(oid) {
  const e = _endsOf(oid);
  if (!e) return '';
  const from = e.vsExp ? 'Βέροια' : e.from.title, to = e.vsImp ? 'Βέροια' : e.to.title;
  // «Ίδιος πελάτης μία φορά» (rules): no client before a loading point with its name.
  const who = e.client && e.client !== from ? e.client + ' · ' : '';
  return who + from + ' → ' + to + _pi(e.pallets);
}
function _groupLine(oids) {
  const e = _endsOf(oids[oids.length - 1]);
  const to = e ? (e.vsImp ? 'Βέροια' : [e.to.title, e.to.place].filter(Boolean).join(', ')) : '—';
  return _plural(oids.length, 'φορτίο', 'φορτία') + ' → ' + to + _pi(_pals(oids));
}
// A member's own line (sheet 14 submenu): «Alpha Farm, Veria → Beta Market · 13 π.».
function _memberLine(oid) {
  const e = _endsOf(oid);
  if (!e) return '';
  const from = e.vsExp ? 'Βέροια' : [e.from.title, e.from.city].filter(Boolean).join(', ');
  return from + ' → ' + (e.vsImp ? 'Βέροια' : e.to.title) + _pi(e.pallets);
}
// «Σάβ 3/10»: the board's ONE day format (WI4.dayLabel) — never a second one.
const _dl = (d) => { const lg = L(); return d && typeof lg.dayLabel === 'function' ? lg.dayLabel(d) : ''; };
function _relayTitle(rec, oid) {
  try {
    const o = W().relayOrder(oid);
    const s = (typeof Relay !== 'undefined' && Relay.summary) ? Relay.summary(rec, o) : null;
    if (s) return (s.kind === 'relay_delivery' ? 'Τοπική παράδοση' : 'Τοπική φόρτωση') + ' · ' + (s.driverName || 'ΠΡΟΣ ΑΝΑΘΕΣΗ') +
      (s.day && _dl(s.day) ? ' · ' + _dl(s.day) : '');
  } catch (e) { _logErr(e, 'wi4 menu: relay title'); }
  return 'Τοπική';
}
function _menuHeader(row, impRow, expOids, impOids) {
  let l1;
  // An assigned row whose truck is not in the cache (the list holds Active
  // trucks only) is «—», never «ΠΡΟΣ ΑΝΑΘΕΣΗ» in the very place the dispatcher
  // acts from; a partner missing from the cache is «—», never the generic
  // «Συνεργάτης» (owner 4/9).
  // l1p: the same line in parts, the plates marked for DM Mono (sheet 14:
  // «TST-1001 · Driver Test 01»); l1 stays the plain text. An own truck's
  // WHOLE line is one mono run, driver included (Figma 1097:3860, parity r1
  // F10); a partner's company name keeps the sans.
  let l1p;
  if (row.hasSplitLegs) l1p = [{ t: 'Σπασμένη παραγγελία' }];
  else if (row.partnerId) l1p = [{ t: row.partnerLabel || '—' }].concat(row.partnerPlates ? [{ t: ' · ' }, { t: row.partnerPlates, mono: true }] : []);
  else if (row.saved) l1p = [{ t: (row.truckLabel || '—') + (row.driverLabel ? ' · ' + row.driverLabel : ''), mono: !!row.truckLabel }];
  else l1p = [{ t: 'ΠΡΟΣ ΑΝΑΘΕΣΗ' }];
  l1 = l1p.map((x) => x.t).join('');
  const first = _fieldsOf(expOids[0] || impOids[0]);
  const lastF = _fieldsOf(impOids.length ? impOids[impOids.length - 1] : expOids[expOids.length - 1]);
  const from = _dl(_dayOf('Loading DateTime', first['Loading DateTime'])) || '—';
  const to = _dl(_dayOf('Delivery DateTime', lastF['Delivery DateTime'])) || '—';
  const n = [];
  if (expOids.length) n.push(expOids.length + ' ' + (expOids.length === 1 ? 'εξαγωγή' : 'εξαγωγές'));
  if (impOids.length) n.push(impOids.length + ' ' + (impOids.length === 1 ? 'εισαγωγή' : 'εισαγωγές'));
  return { l1, l1p, l2: from + ' → ' + to + (n.length ? ' · ' + n.join(' · ') : '') };
}

// Icon of an item from WI4.MENU_ICON (keyed on handler name). A word is a
// core/icons.js name; anything else is drawn as text.
function _iconEl(name) {
  const span = document.createElement('span');
  span.className = 'wi4-m-ic';
  const v = (L().MENU_ICON || {})[name];
  // 15px with a 1.875 stroke = Figma's 15×15 lucide icons at 1.17px
  // (1097:3858, parity r1 F5); icons.js's 1.75 drew them thinner.
  if (v && typeof icon === 'function' && /^[a-z][\w-]*$/.test(v)) span.innerHTML = icon(v, 15, '', 1.875);
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
  // A v4-red item the builder draws plain (unmatch, F6): .d = v1's own red.
  if (it.danger) b.classList.add('d');
  b.textContent = '';
  b.appendChild(_iconEl(it.name || it.as || ''));
  // The label in its own span: ONE line, cut with «…» (review 11/10: long
  // labels wrapped under the icon); the whole label is the title unless the
  // builder gave one (a disabled item's reason).
  const l = document.createElement('span'); l.className = 'wi4-m-l'; l.textContent = it.label;
  b.appendChild(l);
  if (!b.getAttribute('title')) b.setAttribute('title', it.label);
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
    // text, so it undoes the section's caps style for itself. One line, cut
    // with «…»: the whole of it is the title (the menu is 300px, sheet 14).
    // Medium 11.5/15 in ink: Figma 1097:3878 (parity r1 F11).
    const s = document.createElement('div'); s.className = 'wi4-l2'; s.textContent = sub; s.title = sub;
    Object.assign(s.style, { textTransform: 'none', letterSpacing: '0', fontWeight: '500', fontSize: '11.5px', lineHeight: '15px', color: 'var(--wi4-ink)' });
    d.appendChild(s);
  }
  return d;
}

let _menuHl = [];
let _menuObs = null;
function _hlClear() { _menuHl.forEach((el) => el.classList.remove('wi4-mhl')); _menuHl = []; }
// member = a groupage member's «▸» line (sheet 14 note 1064:2416: «το φορτίο
// αυτό φωτίζεται μπλε στη σειρά»): only THAT load's points, which carry
// data-order-id; the row and its index carry the group's first order in
// data-oid, so lighting them suggested every load (parity r1 F3). A point
// folded behind «+N» is not drawn: the chip that holds it lights instead.
// A section lights its row (data-oid) and its loads' points.
function _hlSet(oids, member) {
  _hlClear();
  const add = (el) => { if (el && !el.classList.contains('wi4-mhl')) { el.classList.add('wi4-mhl'); _menuHl.push(el); } };
  for (const oid of oids || []) {
    if (!REC.test(oid)) continue;
    document.querySelectorAll('#content .wi4 [data-order-id="' + oid + '"]').forEach((el) => {
      const pts = el.getClientRects().length ? null : el.closest('.wi4-pts');
      add(pts ? pts.querySelector('.wi4-more') || el : el);
    });
    if (!member) document.querySelectorAll('#content .wi4 [data-oid="' + oid + '"]').forEach(add);
  }
}
// back = the section's loads: a «▸» line and its flyout sit INSIDE the
// section's box, so leaving them for the section's own lines fires no new
// mouseenter on the box — the section lights again here instead of going dark.
// Leaving the menu altogether clears after it (the box's own mouseleave).
function _hoverable(el, oids, member, back) {
  el.addEventListener('mouseenter', () => _hlSet(oids, member));
  el.addEventListener('mouseleave', () => (back ? _hlSet(back) : _hlClear()));
}
// The menu never runs past the window: it scrolls inside only when it is
// taller than the window (CSS max-height); otherwise it OPENS UPWARD as far as
// the room under it is short, and it moves left when it would cross the right
// edge (_wiCtxShow places it for a 240px menu; v4's is wider, review 11/10) —
// or right, when docked to an arrow near the left edge (F14).
function _fitMenu() {
  const ctx = document.getElementById('wi-ctx');
  if (!ctx || ctx.style.display !== 'block') return;
  const r = ctx.getBoundingClientRect();
  if (r.bottom > window.innerHeight - 8) ctx.style.top = Math.max(8, Math.round(window.innerHeight - 8 - r.height)) + 'px';
  if (r.right > window.innerWidth - 8) ctx.style.left = Math.max(8, Math.round(window.innerWidth - 8 - r.width)) + 'px';
  else if (r.left < 8) ctx.style.left = '8px';
}
// A member's / relay's submenu is a FLYOUT beside its «▸» line (Figma sheet
// 14 1064:2376: 260px at menu right − 6, line top − 6), not an accordion that
// grew the menu and made it jump up (parity r1 F2). It stays inside #wi-ctx
// in the DOM — _wiCtxKeydown's ↑↓, the click-outside close and the item's own
// _wiCtxClose keep working — and escapes #wi-ctx's overflow by being
// position:fixed (nothing above #wi-ctx has a transform, filter or contain).
// Mirrored to the menu's left when the window has no room on the right;
// clamped inside the window vertically.
function _placeSub(body) {
  const ctx = document.getElementById('wi-ctx');
  const more = body && body._more;
  if (!ctx || !more || !body.classList.contains('open')) return;
  const m = ctx.getBoundingClientRect(), l = more.getBoundingClientRect();
  const w = body.offsetWidth, h = body.offsetHeight;
  let left = m.right - 6;
  if (left + w > window.innerWidth - 8) left = m.left + 6 - w;
  const top = Math.max(8, Math.min(l.top - 6, window.innerHeight - 8 - h));
  body.style.left = Math.round(Math.max(8, left)) + 'px';
  body.style.top = Math.round(top) + 'px';
}
// The menu scrolls inside on a short window: the open flyout follows its line.
function _menuScroll() {
  const ctx = document.getElementById('wi-ctx');
  _placeSub(ctx && ctx.querySelector('.wi4-m-sub.open'));
}
// ←/→ while the menu is open (parity r1 F1; sheet 14: → opens a «▸» line's
// submenu, ← returns). ui.js changes the WEEK on ←/→ from a bubble-phase
// document listener, so → on a member line threw the menu and the week away.
// A capture-phase window listener — the date panel's pattern — takes every ←/→
// while #wi-ctx is shown, whatever has the focus: the week never moves behind
// an open menu. It leaves with the menu (the close hook), or by itself when
// the menu was hidden or repainted without that hook running.
let _menuKey = null;
function _menuKeyOff() { if (_menuKey) window.removeEventListener('keydown', _menuKey, true); _menuKey = null; }
function _menuKeyOn(ctx) {
  _menuKeyOff();
  const onKey = (ev) => {
    if (!ctx.isConnected || ctx.style.display !== 'block') { if (_menuKey === onKey) _menuKeyOff(); return; }
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault(); ev.stopPropagation();
    const a = document.activeElement;
    if (!a || !ctx.contains(a)) return;
    if (ev.key === 'ArrowRight') {
      const more = a.closest('.wi4-m-more');
      if (!more || !more._sub) return;
      if (more.getAttribute('aria-expanded') !== 'true') more.click();
      const first = more._sub.querySelector('.wi-ctx-i:not([disabled])');
      if (first) first.focus();
      return;
    }
    const sub = a.closest('.wi4-m-sub.open');
    const more = sub ? sub._more : (a.matches('.wi4-m-more[aria-expanded="true"]') ? a : null);
    if (!more) return;
    if (more.getAttribute('aria-expanded') === 'true') more.click();
    more.focus();
  };
  _menuKey = onKey;
  window.addEventListener('keydown', onKey, true);
}

function _renderMenu(model) {
  const frag = document.createDocumentFragment();
  const hd = document.createElement('div');
  hd.className = 'wi4-m-hd';
  (model.header.l1p || [{ t: model.header.l1 }]).forEach((x) => {
    if (!x.mono) { hd.appendChild(document.createTextNode(x.t)); return; }
    const m = document.createElement('span'); m.className = 'wi4-m-plate'; m.textContent = x.t; hd.appendChild(m);
  });
  const l2 = document.createElement('div'); l2.className = 'wi4-l2'; l2.textContent = model.header.l2; l2.title = model.header.l2;
  hd.appendChild(l2);
  frag.appendChild(hd);
  model.truck.forEach((it) => frag.appendChild(_itemNode(it)));
  let openSub = null;
  const closeSub = () => {
    if (!openSub) return;
    openSub.classList.remove('open'); openSub.textContent = ''; openSub._more.setAttribute('aria-expanded', 'false');
    openSub = null;
  };
  for (const s of model.sections) {
    const box = document.createElement('div');
    box.appendChild(_secHead(s.title, s.sub));
    // Line order (parity r1 F6, Figma 1097:3858 / sheet 14): the section's
    // items, a local relay's «▸» where its plain item would stand, the red
    // items, then the groupage members' «▸» lines (1064:2312 sits under
    // «Διάλυση groupage»).
    const lines = { relay: [], member: [] };
    for (const sub of s.subs) {
      // The «▸» line opens its submenu as a flyout (_placeSub). Its items are
      // inserted only while open, so _wiCtxKeydown's ↑↓ never lands on a
      // hidden button. No onclick attribute: it is not an action, and the
      // parity test counts every onclick as one. A member line carries the
      // load's box icon and a trailing chevron, so it reads as «opens».
      const more = document.createElement('button');
      more.className = 'wi-ctx-i wi4-m-more' + (sub.kind === 'member' ? ' wi4-m-mem' : '');
      more.setAttribute('aria-expanded', 'false');
      more.appendChild(_iconEl(sub.kind === 'member' ? 'member' : sub.kind === 'relay' ? 'relay' : 'submenu'));
      const ml = document.createElement('span'); ml.className = 'wi4-m-l'; ml.textContent = sub.title;
      more.appendChild(ml); more.setAttribute('title', sub.title);
      const chev = document.createElement('span');
      chev.className = 'wi4-m-chev';
      chev.setAttribute('aria-hidden', 'true');
      if (typeof icon === 'function') chev.innerHTML = icon('chevron_right', 12);
      more.appendChild(chev);
      const body = document.createElement('div');
      body.className = 'wi4-m-sub';
      const nodes = [_secHead(sub.head || '', sub.sub)].concat(sub.items.map(_itemNode));
      more.addEventListener('click', (ev) => {
        // Keep the menu open: _wiCtxShow closes it on the next document click.
        // One flyout at a time; a second click on its line closes it.
        ev.stopPropagation();
        const opening = openSub !== body;
        closeSub();
        if (!opening) return;
        nodes.forEach((n) => body.appendChild(n));
        body.classList.add('open');
        more.setAttribute('aria-expanded', 'true');
        openSub = body;
        _placeSub(body);
      });
      body._more = more; more._sub = body;
      const member = sub.kind === 'member';
      _hoverable(more, sub.oids, member, s.oids);
      _hoverable(body, sub.oids, member, s.oids);
      lines[member ? 'member' : 'relay'].push(more, body);
    }
    s.items.filter((it) => !it.danger).forEach((it) => box.appendChild(_itemNode(it)));
    lines.relay.forEach((n) => box.appendChild(n));
    s.items.filter((it) => it.danger).forEach((it) => box.appendChild(_itemNode(it)));
    lines.member.forEach((n) => box.appendChild(n));
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
  // A right-click on a print button belongs to the SHARE menu (§a.7,
  // shareMenuDelegate on the document): the row's menu steps aside and lets
  // the event bubble on — Λήψη PDF · Κοινή χρήση, for every role (11/10).
  if (e && e.type === 'contextmenu' && e.target && e.target.closest && e.target.closest('.wk3-prt[data-shq]')) return;
  // Opened from the arrow (its click, or Enter: run('menu') sends the arrow as
  // currentTarget) the menu docks to it — right edges flush, just under it —
  // over the assignment column (Figma 1097:3858, parity r1 F14), never over
  // the import the ΕΙΣΑΓΩΓΗ section talks about. A right-click keeps the
  // pointer. Read now: currentTarget is gone after the first await.
  const plane = e && e.type !== 'contextmenu' && e.currentTarget && e.currentTarget.closest ? e.currentTarget.closest('.wi4-plane') : null;
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
  // Height estimate for _wiCtxShow's placement (header 44, a section head
  // with its line 34, an item 30); _fitMenu then measures the real box.
  const est = 44 + 30 * model.truck.length + model.sections.reduce((n, s) => n + 34 + 30 * (s.items.length + s.subs.length), 0);
  _hlClear();
  I.ctxShow(e, '', Math.min(window.innerHeight - 16, est));
  ctx.appendChild(_renderMenu(model));
  if (plane && plane.isConnected) {
    const p = plane.getBoundingClientRect();
    ctx.style.left = Math.round(p.right - ctx.offsetWidth) + 'px';
    ctx.style.top = Math.round(p.bottom + 4) + 'px';
  }
  _fitMenu();
  _menuKeyOn(ctx);
  ctx.addEventListener('scroll', _menuScroll);
  // Close bookkeeping: _wiCtxClose only hides #wi-ctx, so watch its style to
  // drop the row highlight, the ←/→ guard, the flyout's scroll follower and
  // the presence context with it.
  if (_menuObs) _menuObs.disconnect();
  _menuObs = new MutationObserver(() => {
    if (ctx.style.display === 'block') return;
    _menuObs.disconnect(); _menuObs = null; _hlClear(); _menuKeyOff(); ctx.removeEventListener('scroll', _menuScroll);
    _presenceCtx(null, null, 'view');
  });
  _menuObs.observe(ctx, { attributes: true, attributeFilter: ['style'] });
  ctx.addEventListener('click', _hlClear, { once: true, capture: true });
  _presenceCtx(orderId, _partOf(orderId), 'menu');
}

// ═══ Conflict dialog «Ποια κρατάμε;» (§g.4) ═════════════════════════════
let _dlg = null;   // {back, resolve, onKey}
// Values as the board shows them — plates, names, «Πέμ 8/10 09:00» — never an
// internal id (rules «Μηνύματα»). A link the board cannot name reads «άλλη
// τιμή»: a guess at a plate is worse than saying we do not know which.
function _fmtConflict(label, v) {
  const I = W(), D = (I.WINTL && I.WINTL.data) || {};
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return 'κενό';
  if (label === 'Is Partner Trip') return v ? 'ναι' : 'όχι';
  if (FIELD[label]) {
    const s = String(v);
    let day, t = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) day = s;                               // a day the user picked
    else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) { day = s.slice(0, 10); t = s.slice(11); }
    else { day = _dayOf(label, s); t = _timeOf(label, s); }
    const lg = L();
    const dl = day && typeof lg.dayLabel === 'function' ? lg.dayLabel(day) : '';
    return dl ? dl + (t && label !== 'VS CD Date' ? ' ' + t : '') : 'άλλη τιμή';
  }
  const ids = Array.isArray(v) ? v : [v];
  const lists = { Truck: D.trucks, Trailer: D.trailers, Driver: D.drivers, Partner: D.partners };
  if (lists[label]) return ids.map((id) => ((lists[label] || []).find((x) => x.id === id) || {}).label || 'άλλη τιμή').join(', ');
  if (label === 'Matched Import ID') {
    return ids.map((id) => { const f = _fieldsOf(id); return Object.keys(f).length ? [I.clientName(f) || '—', f['Reference'] ? 'ΑΝΑΦ. ' + f['Reference'] : ''].filter(Boolean).join(' · ') : 'άλλη εισαγωγή'; }).join(', ');
  }
  const s = ids.join(', ');
  return /rec[A-Za-z0-9]{6,}/.test(s) ? 'άλλη τιμή' : s;
}
// → {lead, change, mine, question} (sheet 16 E, Figma 1125:2976): who AND
// what changed is the bold lead («Ο Χ την άλλαξε πριν 5″: Πέμ 8/10 → Παρ
// 9/10»), the user's own pick and the question one regular line under it.
// `expected` is what the user saw (the _expect sent), `mine` what they chose;
// both come from the caller, never re-read.
// The signed-in username: a 409 whose author is me (a second tab, a board
// that did not re-read) is never «άλλος χρήστης» (commit 11300633's goal).
function _me() { try { return (typeof user !== 'undefined' && user && user.username) || ''; } catch (_) { return ''; } }
function _byMe(by) { const me = _me(); return !!me && typeof by === 'string' && by === me; }
function _conflictParts(conflict, ctx) {
  const lg = L();
  try {
    if (typeof lg.describeConflict === 'function') {
      const d = lg.describeConflict(Object.assign({}, conflict, { mine: (ctx && ctx.mine) || {}, expected: (ctx && ctx.expected) || {}, now: Date.now(), me: _me() }), LABELS_GR, _fmtConflict);
      if (d && d.lead) {
        // The same words describeConflict puts in `body`, split at «Η δική
        // σου επιλογή» (several fields keep their names, joined by « · »).
        const ln = Array.isArray(d.lines) ? d.lines : [];
        const nm = (x) => (ln.length > 1 ? x.name + ': ' : '');
        return { lead: d.lead, change: ln.map((x) => nm(x) + x.before + ' → ' + x.theirs).join(' · '),
          mine: ln.length ? 'Η δική σου επιλογή: ' + ln.map((x) => nm(x) + x.mine).join(' · ') : '', question: d.question || 'Ποια κρατάμε;' };
      }
    }
  } catch (e) { _logErr(e, 'wi4: describeConflict'); }
  return { lead: 'Η εγγραφή άλλαξε από τότε που την άνοιξες', change: '', mine: '', question: 'Ποια κρατάμε;' };
}
function _keepLabel(by) {
  if (_byMe(by)) return 'Κράτα την τρέχουσα';   // never «Κράτα του <me>»
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
    const parts = _conflictParts(c, ctx);
    // Who changed it (a username only when the Worker sent one) and from →
    // to in one bold lead, then «Η δική σου επιλογή: … Ποια κρατάμε;» as one
    // regular line. Amber: it is news, not the user's error.
    const lead = document.createElement('div'); lead.className = 'wi4-conf-lead';
    if (typeof c.by === 'string' && c.by && c.by !== 'user' && c.by !== 'auto' && !_byMe(c.by)) {
      const av = document.createElement('span'); av.className = 'wi4-av sm'; av.textContent = c.by.trim().charAt(0).toUpperCase();
      lead.appendChild(av);
    }
    const lt = document.createElement('span'); lt.textContent = parts.lead + (parts.change ? ': ' + parts.change : '.');
    lead.appendChild(lt);
    box.appendChild(lead);
    const stale = !!(ctx && ctx.stale);
    // Stale: no question here — the bold line below replaces it.
    const line = [parts.mine ? parts.mine + '.' : '', stale ? '' : parts.question].filter(Boolean).join(' ');
    if (line) { const b = document.createElement('div'); b.textContent = line; box.appendChild(b); }
    // The re-read behind the question failed: the screen is not the server's
    // truth, so «keep what you see» would be an empty promise.
    if (stale) { const s = document.createElement('div'); s.className = 'wi4-conf-q'; s.textContent = 'Δεν ξαναδιαβάστηκε — ό,τι βλέπεις μπορεί να μην είναι η τρέχουσα τιμή.'; box.appendChild(s); }
    const ft = document.createElement('div'); ft.className = 'wi4-dlg-ft';
    if (ctx && ctx.stale) ft.appendChild(_btn('wi4-btn sm pri', 'Ανανέωση', () => _dlgClose('refresh')));
    // A match has nothing to «reopen»: reopening the ASSIGNMENT popover is not
    // a match. One button — the screen already shows the current match.
    else if (kind === 'match') ft.appendChild(_btn('wi4-btn sm pri', 'Κράτα την τρέχουσα', () => _dlgClose('keep')));
    else {
      ft.appendChild(_btn('wi4-btn sm', _keepLabel(c.by), () => _dlgClose('keep')));
      if (kind === 'date') ft.appendChild(_btn('wi4-btn sm pri', 'Γράψε τη δική μου', () => _dlgClose('mine')));
      else ft.appendChild(_btn('wi4-btn sm pri', 'Ξανάνοιξε την ανάθεση', () => _dlgClose('reopen')));
    }
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
      // × in a header row of its own, never floated over the panel's corner.
      const hd = document.createElement('div'); hd.className = 'wi4-dlg-hd';
      const t = document.createElement('span'); t.className = 'wi4-dlg-t'; t.textContent = 'Άλλαξε στο μεταξύ';
      const x = _btn('wi4-link wi4-dlg-x', '×', () => _dlgClose('keep'));
      x.setAttribute('aria-label', 'Κλείσιμο');
      hd.appendChild(t); hd.appendChild(x);
      dlg.appendChild(hd); dlg.appendChild(box);
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
// A typed time → «HH:MM» (24-hour), or '' when it is not one: «0730» and
// «7:30» are accepted, «25:99» and «7.30pm» are not.
function _hhmm(v) {
  let s = String(v || '').trim();
  if (/^\d{4}$/.test(s)) s = s.slice(0, 2) + ':' + s.slice(2);
  else if (/^\d:\d{2}$/.test(s)) s = '0' + s;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : '';
}
// The panel's identity line in the row's words (WIV2._ends).
function _panelLine(oid, f) {
  const e = _endsOf(oid);
  if (!e) return W().clientName(f) || '—';
  return (e.client || '—') + ' · ' + (e.from.place || e.from.title) + ' — ' + (e.to.place || e.to.title);
}

// The write arguments of the panel's current state, or null when nothing
// changed. hhmm is passed ONLY when the time was changed (or when resending
// «Γράψε τη δική μου»), so a day-only change sends exactly today's body:
// _wiDateWrite keeps the old time of day itself (_wk3IsoOnDay). The 6th
// argument (`seen`) is the value the panel SHOWED, sent as _expect: only this
// caller passes it (§g.4).
function _dpWriteArgs(st) {
  if (!st || !st.sel) return null;
  const curIso = st.cur[st.field] == null ? null : st.cur[st.field];
  const curDay = _dayOf(st.field, curIso);
  const t = st.field === 'VS CD Date' ? '' : _hhmm(st.time);
  const timeChanged = st.field !== 'VS CD Date' && !!t && t !== st.time0;
  if (st.sel === curDay && !timeChanged && !st.force) return null;
  const hhmm = (timeChanged || (st.force && t)) ? t : undefined;
  return [st.oid, st.field, curIso, st.sel, hhmm, curIso];
}

function _dpGroupDay(f) {
  const isImp = String(f['Direction'] || '') === 'Import';
  return _dayOf('Loading DateTime', isImp ? f['Loading DateTime'] : f['Delivery DateTime']) || '';
}

function datePanel(orderId, field, anchorEl) {
  const I = W();
  // A save in flight is never dropped by opening another panel: its answer
  // would land on nobody (no ✓, no repaint) while the table changed.
  if (_dp && _dp.busy) { _toast('Η προηγούμενη αλλαγή ημερομηνίας αποθηκεύεται ακόμη', 'info'); return; }
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
    if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation();
      // While «Αποθηκεύεται…» the panel stays: Esc cannot cancel a write that
      // has left, and closing would hide its answer.
      if (st.busy) return;
      if (_dlg) _dlgClose('keep'); else _dpClose();
      return;
    }
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
  // One line (sheet 16 D: «Gamma Fruits · City — Town»), the row's own
  // words: client · first loading place — last delivery place, «…» + title
  // for the rest. It was every stop with its country over 5 lines.
  const id = document.createElement('div'); id.className = 'wi4-datep-id';
  id.textContent = _panelLine(st.oid, f); id.title = id.textContent;
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

  // VS CD Date stays date-only, as today (§e #10). The time is a 24-hour
  // HH:MM text field: a native time input follows the BROWSER's locale and
  // showed «07:00 AM» on an en-US browser (the same trap that showed dates
  // «ανάποδα», memory 27/9). Label on its own line, field full width (16 D).
  if (st.field !== 'VS CD Date') {
    const lab = document.createElement('label'); lab.className = 'wi4-time-l'; lab.textContent = 'Ώρα';
    const t = document.createElement('input'); t.type = 'text'; t.className = 'wi4-time'; t.value = st.time;
    t.setAttribute('inputmode', 'numeric'); t.setAttribute('maxlength', '5'); t.setAttribute('placeholder', 'ΩΩ:ΛΛ');
    t.setAttribute('autocomplete', 'off'); t.setAttribute('aria-label', 'Ώρα (24ωρη, ΩΩ:ΛΛ)');
    t.addEventListener('input', () => { st.time = t.value; });
    t.addEventListener('change', () => { const n = _hhmm(t.value); if (n) { t.value = n; st.time = n; } });
    lab.appendChild(t);
    el.appendChild(lab);
  }
  const note = document.createElement('div'); note.className = 'wi4-datep-note';
  // What a change of THIS field moves (review 11/10: the Βέροια field said
  // «…και τη Βέροια»). A VS CD change moves the national leg's day there —
  // the Veroia Switch chain reads it (orders_intl _syncVeroiaSwitch).
  note.textContent = st.field === 'VS CD Date'
    ? 'Αλλάζει την ημερομηνία Βέροιας και την ημέρα του εθνικού σκέλους εκεί. Η Εβδομάδα δεν αλλάζει από εδώ.'
    : 'Αλλάζει και τις στάσεις και τη Βέροια όπου υπάρχει. Η Εβδομάδα δεν αλλάζει από εδώ.';
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

// The table's answer = what the user picked? The day ALWAYS; the time when
// one was sent (args[4]) — a changed time that the server did not store is
// not a ✓ either (review 11/10).
function _dpVerified(st, args, w) {
  const rec = w && w.rec && w.rec.fields ? w.rec.fields : null;
  const got = rec ? _dayOf(st.field, rec[st.field]) : null;
  if (got !== args[3]) return 'η εγγραφή δεν επιβεβαιώθηκε (' + (got || 'κενό') + ')';
  if (args[4] && _timeOf(st.field, rec[st.field]) !== args[4]) return 'η ώρα δεν επιβεβαιώθηκε (' + (_timeOf(st.field, rec[st.field]) || 'κενό') + ')';
  return '';
}
// One toast for a save (toast() shows ONE message and the second replaced
// the first: the «χωρίς έλεγχο» note was never seen). Unknown = not checked.
function _dpOkText(w) {
  if (w.rec && w.rec._expectChecked === 'skipped') return 'Ημερομηνία ενημερώθηκε ✓ · ο έλεγχος «το άλλαξε άλλος» δεν έγινε σε αυτή την αποθήκευση';
  if (typeof window !== 'undefined' && window.TMS_EXPECT_LIVE !== true) return 'Ημερομηνία ενημερώθηκε ✓ · χωρίς έλεγχο «το άλλαξε άλλος» (δεν είναι ενεργός ακόμη)';
  return 'Ημερομηνία ενημερώθηκε ✓';
}
const DP_OFFLINE = 'Χωρίς σύνδεση — η αλλαγή μπήκε σε αναμονή και θα σταλεί όταν επανέλθει· δεν είναι ακόμη στη βάση';
// The chain a date change waits for (_wiDateWrite returns syncOrderDownstream's
// {ok, failed}): a stage that failed is said in the user's words, never a ✓
// over a national load that did not move (review 11/10, the Λάβδας 7/9 case).
const SYNC_WHAT = Object.freeze({ 'VS chain': 'του εθνικού φορτίου', 'GRP→GL→CL→NL cascade': 'του groupage εθνικών',
  'RAMP sync': 'της ράμπας', 'PL feed sync': 'των παλετών', paSyncStatus: 'των αναθέσεων συνεργατών', sync: '' });
function _syncFail(w) {
  const ds = w && w.downstream;
  if (!ds || ds.ok !== false) return '';
  const what = (ds.failed || []).map((l) => (Object.prototype.hasOwnProperty.call(SYNC_WHAT, l) ? SYNC_WHAT[l] : l)).filter(Boolean).join(', ');
  _logErr(new Error('date change written, downstream failed: ' + (ds.failed || []).join(', ')), 'wi4 date panel');
  return 'Η ημερομηνία άλλαξε — ο συγχρονισμός' + (what ? ' ' + what : '') + ' απέτυχε· έλεγξε το Εβδομαδιαίο Εθνικών';
}
async function _dpSave() {
  const st = _dp; if (!st || st.busy || st.conflicting) return;
  // A typed time that is not HH:MM is said, never silently dropped.
  if (st.field !== 'VS CD Date' && String(st.time || '').trim() && !_hhmm(st.time)) {
    st.err = 'Η ώρα θέλει μορφή ΩΩ:ΛΛ (24ωρη), π.χ. 07:30.'; _dpRender(); return;
  }
  const args = _dpWriteArgs(st);
  if (!args) { _dpClose(); return; }
  const I = W(), v = V();
  st.busy = true; st.err = ''; _dpRender();
  const f = st.rec.fields || {};
  try {
    if (v && typeof v.noteMove === 'function') { const e = _endsOf(st.oid); v.noteMove(st.oid, _dpGroupDay(f), (I.clientName(f) || '—') + ' → ' + (e ? (e.vsImp ? 'Βέροια' : e.to.title) : '—')); }
    const w = await I.dateWrite.apply(null, args);
    if (_dp !== st) {
      // The panel was closed meanwhile (a page change): the answer is still
      // said — with the SAME read-back as the open panel — and the board
      // shows what the table now holds. Re-read only on this board:
      // renderWeeklyIntl paints into #content, which may belong to another page.
      const here = typeof currentPage === 'undefined' || currentPage === 'weekly_intl';
      if (w && w.conflict) { _toast('Η ημερομηνία δεν άλλαξε — την είχε αλλάξει άλλος', 'warn'); if (here) I.renderWeeklyIntl(); }
      else if (w && w.offline) _toast(DP_OFFLINE, 'info');
      else if (w && w.ok) {
        const bad = _dpVerified(st, args, w), sf = bad ? '' : _syncFail(w);
        if (bad) { _logErr(new Error(bad), 'wi4 date panel'); _toast('Η αλλαγή ημερομηνίας δεν επιβεβαιώθηκε — ' + bad, 'warn'); }
        else if (sf) _toast(sf, 'warn');
        else _toast(_dpOkText(w));
        if (here) I.renderWeeklyIntl();
      }
      return;
    }
    if (w && w.offline) {
      // atPatch QUEUED it (no network): not a write, so no ✓ (principle 2).
      st.busy = false; st.err = DP_OFFLINE; _dpRender();
      return;
    }
    if (w && w.conflict) {
      // While «Ποια κρατάμε;» is open the panel stays locked (no day click,
      // no second «Αλλαγή»): a re-render would drop the question, and a second
      // write would compare against the value the user just learned is stale.
      st.busy = false; st.conflicting = true; _dpRender();
      const mine = args[3] + (args[4] ? ' ' + args[4] : '');
      const choice = await conflictDialog(w.conflict, { orderId: st.oid, kind: 'date', mine: { [st.field]: mine }, expected: { [st.field]: args[2] } });
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
    // The proof is the table (principle 2): the ✓ needs the day (and the
    // time, when one was sent) the server answered with to be the user's.
    const bad = _dpVerified(st, args, w);
    if (bad) throw new Error(bad);
    // A Worker that could not run the check says so (§g.3), in the ✓'s own
    // toast: never a silent «checked». A downstream stage that failed is said
    // instead of the ✓ (the date IS written: the panel closes).
    _dpClose();
    const sf = _syncFail(w);
    _toast(sf || _dpOkText(w), sf ? 'warn' : undefined);
    I.renderWeeklyIntl();
  } catch (e) {
    // The panel says it inline, red, with the reason: one message, not a
    // second stacked toast (review 11/10). The trail goes to app_errors.
    if (_dp === st) _logErr(e, 'wi4 date panel');
    else if (typeof reportError === 'function') { reportError('Η αλλαγή ημερομηνίας απέτυχε', e); _logErr(e, 'wi4 date panel'); }
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
    // The promise «θα σου πει ποια μένει» holds only while the Worker CHECKS
    // _expect — confirmed by a save (TMS_EXPECT_LIVE true). Unknown = closed
    // (principle 5): before any save nobody has confirmed it, so the note
    // never promises it then either (review 11/10).
    const live = typeof window !== 'undefined' ? window.TMS_EXPECT_LIVE : undefined;
    // Confirmed, it is news: light blue with the colleague's avatar, the same
    // disc the row shows (Figma 1125:2885, sheet 16 B). Unconfirmed / off it
    // is a real warning and stays amber.
    slot.className = live === true ? 'wi4-pnote info' : 'wi4-pnote';
    const tail = live === true ? '. Αν αποθηκεύσετε και οι δύο, θα σου πει ποια μένει.'
      : live === false ? '. Ο έλεγχος «το άλλαξε άλλος» δεν είναι ενεργός — όποιος αποθηκεύσει τελευταίος μένει.'
      : '. Ο έλεγχος «το άλλαξε άλλος» δεν έχει επιβεβαιωθεί ακόμη — μπορεί να μείνει όποιος αποθηκεύσει τελευταίος.';
    const who = p.name || p.user_name || '';
    const ini = live === true ? String(who).trim().charAt(0).toUpperCase() : '';
    if (ini) { const av = document.createElement('span'); av.className = 'wi4-av sm'; av.setAttribute('aria-hidden', 'true'); av.textContent = ini; slot.appendChild(av); }
    const t = document.createElement('span');
    t.textContent = 'Ο ' + (who || 'άλλος χρήστης') + ' έχει ανοιχτή αυτή την ημερομηνία' + when + tail;
    slot.appendChild(t);
    return;
  }
}

// ═══ Queue panel «Όλα N ▾» (§e #3) ══════════════════════════════════════
let _qp = null;   // {el, items, on, onKey, onDown}
const _isUnknown = (it) => it && (it.code === 'SOURCE_UNKNOWN' || it.code === 'NAT_UNKNOWN');

// The ONE dispatcher of queue actions (band cards and «Όλα» panel alike). The
// case names are WI4.ACT's — tests/wi4-logic.test.js checks every one has a
// case here, so a renamed action fails loudly instead of doing nothing.
function _queueAct(it) {
  if (!it) return;
  const I = W(), v = V();
  const oid = it.rowKey || it.key;
  const anchor = _rowEl(oid);
  switch (it.act) {
    case 'assign': return _assign(oid);
    // Principle 1: a card whose row is gone says so, never a click that does nothing.
    case 'newImport': { const id = v && v.rowIdOf(oid); if (id != null) I.newImport(id); else _toast(GONE, 'warn'); return; }
    case 'pieces': return I.stockLooseOpen(anchor || document.querySelector('#content .wi4 #wi-shelf'));
    case 'lot': {
      const st = I.WINTL.data.stock;
      const lot = st && (st.lots || []).find((l) => l.id === (it.lotId || it.key));
      if (!lot) { _toast('Η παρτίδα δεν βρέθηκε στο απόθεμα — ανανέωσε', 'warn'); return; }
      return I.stockLotOpen(anchor || document.querySelector('#content .wi4 #wi-shelf'), lot);
    }
    case 'national': if (typeof navigate === 'function') navigate('weekly_natl'); return;
    case 'date': return datePanel(oid, it.field || 'Loading DateTime', anchor && anchor.querySelector('.wi4-dc') || anchor);
    case 'open': case 'convert': if (REC.test(oid)) I.edit(oid); else _toast(GONE, 'warn'); return;
    // A local relay's item opens THAT relay (edit, driver, delete live there).
    case 'relay': if (it.relayId && REC.test(oid)) { I.relayOpen(oid, it.relayId); return; } break;
    case 'retry':
      // sourceReasons names the relays source 'relay'; a failed save reopens
      // that load's actions (as the row's own «Ξαναδοκίμασε»), never a blind
      // reload that leaves the failure where it was.
      if (it.source === 'relay') return I.relayReload();
      if (it.relayId && REC.test(oid)) { I.relayOpen(oid, it.relayId); return; }
      if (it.code === 'SAVE_FAILED' && v && REC.test(oid)) return v._retry(oid);
      return I.renderWeeklyIntl();
    // A W+1 load: its assignment lives in its own week's board.
    case 'week': if (Number.isInteger(it.week)) { I.WINTL.week = it.week; I.renderWeeklyIntl(); } else _toast('Η εβδομάδα του φορτίου δεν είναι γνωστή — ανανέωσε', 'warn'); return;
  }
  if (!(v && oid && v.focusRow(oid))) _toast('Η σειρά δεν βρίσκεται σε αυτή την εβδομάδα — ανανέωσε ή άλλαξε εβδομάδα', 'info');
}

function queuePanel() {
  if (_qp) { _qpClose(); return; }
  const v = V(); if (!v) return;
  const items = (v.queueItems() || []).slice();
  // Same rule as the band: a source still loading or unread makes it «≥N».
  const loading = typeof v._queueLoading === 'function' && v._queueLoading();
  const el = document.createElement('div');
  el.className = 'wi4-qp';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Επόμενες ενέργειες');
  // Its own head class (parity r1 F3, Figma 1117:2677): as a .wi4-qp-h
  // section label it was upper-cased into «[Q] ΕΠΟΜΕΝΟ [ESC] ΚΛΕΙΣΙΜΟ».
  const hd = document.createElement('div'); hd.className = 'wi4-qp-hd';
  const span = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };
  hd.appendChild(span('wi4-qp-hn', 'ΕΠΟΜΕΝΑ · ' + (items.some(_isUnknown) || loading ? '≥' : '') + items.length));
  hd.appendChild(span('wi4-key', 'Q')); hd.appendChild(span('wi4-qp-kt', 'επόμενο'));
  hd.appendChild(span('wi4-key', 'Esc')); hd.appendChild(span('wi4-qp-kt', 'κλείσιμο'));
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
      // One line per item, as the band's cards (sheet 15 B): name, then
      // «Nπ · reason» in grey — the same words, the same pallets.
      const t = document.createElement('div'); t.className = 'wi4-qcard-t';
      const l1 = document.createElement('span'); l1.className = 'wi4-l1 wi4-ell'; l1.textContent = it.text || it.title || it.code; l1.title = l1.textContent;
      t.appendChild(l1);
      const sub = [it.pal != null ? it.pal + 'π' : '', it.sub || ''].filter(Boolean).join(' · ');
      if (sub) { const l2 = document.createElement('span'); l2.className = 'wi4-l2 wi4-ell'; l2.textContent = sub; l2.title = sub + (it.tip ? ' — ' + it.tip : ''); t.appendChild(l2); }
      r.appendChild(t);
      if (_actLabel(it)) {
        r.appendChild(_btn('wi4-btn sm', _actLabel(it), (ev) => { ev.stopPropagation(); _qpClose(); _queueAct(it); }));
      }
      // A click on the body goes to the row and highlights it (sheet 15 B).
      r.addEventListener('click', () => { _qpOn(rows.indexOf(r)); });
      el.appendChild(r);
      rows.push(r); r._it = it;
    }
  }
  if (!items.length) {
    const r = document.createElement('div'); r.className = 'wi4-qp-i wi4-t-g2';
    r.textContent = loading ? 'Φορτώνει — η λίστα δεν είναι πλήρης ακόμη' : 'Τίποτα επείγον αυτή την εβδομάδα';
    el.appendChild(r);
  }
  document.body.appendChild(el);
  const a = document.querySelector('#content .wi4 .wi4-q-all');
  const ar = a && a.getBoundingClientRect ? a.getBoundingClientRect() : null;
  // Sheet 15 B: under the queue band, from its LEFT edge (the search box) —
  // anchored to «Όλα»'s right edge it covered the import column (11/10).
  const band = document.querySelector('#content .wi4 .wi4-q');
  const br = band && band.getBoundingClientRect ? band.getBoundingClientRect() : null;
  const w = el.offsetWidth || 600;
  const left = br ? br.left : ar ? ar.right - w : window.innerWidth - w - 24;
  el.style.left = Math.max(10, Math.min(window.innerWidth - w - 12, left)) + 'px';
  el.style.top = ((br ? br.bottom : ar ? ar.bottom : 74) + 6) + 'px';
  _qp = { el, rows, on: -1, anchor: a, sc: document.getElementById('content') };
  _qp.onKey = (ev) => {
    if (!_qp || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); _qpClose(); return; }
    // The panel is the keyboard target while open (parity r1 F10): Tab cycles
    // inside it. Leaving it, Tab reached the ΑΠΟΘΕΜΑ label and scrolled the
    // board 769 → 0 under the open panel.
    if (ev.key === 'Tab') {
      const f = [...el.querySelectorAll('button, [tabindex="0"]')].filter((x) => !x.disabled);
      const i = f.indexOf(document.activeElement);
      const n = i < 0 ? (ev.shiftKey ? f.length - 1 : 0) : i + (ev.shiftKey ? -1 : 1);
      if (!f.length || (i >= 0 && n >= 0 && n < f.length)) return;
      ev.preventDefault(); ev.stopPropagation();
      f[(n + f.length) % f.length].focus({ preventScroll: true });
      return;
    }
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
  // The panel hangs from the band (parity r1 F1, sheet 15 B): it is fixed, so
  // a board that scrolls under it leaves it floating over the wrong rows (a
  // wheel moved the board 769px under a pinned panel). A scroll the USER makes
  // closes it — a wheel or a swipe, or any scroll that is not the one our own
  // Q / ↑↓ / click just made (_qpOn records where that one left the board).
  const sc = _qp.sc;
  if (sc) {
    _qp.top = sc.scrollTop;
    _qp.onWheel = () => _qpClose();
    _qp.onScroll = () => { if (_qp && Math.abs(sc.scrollTop - _qp.top) > 1) _qpClose(); };
    sc.addEventListener('wheel', _qp.onWheel, { passive: true });
    sc.addEventListener('touchmove', _qp.onWheel, { passive: true });
    sc.addEventListener('scroll', _qp.onScroll, { passive: true });
  }
  if (a) a.setAttribute('aria-expanded', 'true');
  // Opening only SELECTS the first line (sheet 15 B: line 1 on --wi4-sel,
  // nothing moves). Focusing its board row here scrolled #content 0 → 145 at
  // 1800×800 and left the band — and the panel's anchor — above the window.
  if (rows.length) _qpOn(0, { board: false });
}
// opt.board === false: select the line only, leave the board where it is.
function _qpOn(i, opt) {
  const q = _qp; if (!q || !q.rows.length) return;
  q.on = (i + q.rows.length) % q.rows.length;
  // Roving tabindex (F10): the selected line is the panel's one tab stop and
  // holds the focus, so Q / ↑↓ / Enter / Tab act inside the panel. No
  // browser scroll: the panel scrolls itself (nearest), the board never.
  q.rows.forEach((r, k) => { r.classList.toggle('on', k === q.on); r.tabIndex = k === q.on ? 0 : -1; });
  const r = q.rows[q.on];
  if (r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
  if (r.focus) r.focus({ preventScroll: true });
  if (opt && opt.board === false) return;
  const v = V(), it = r._it;
  if (v && it && it.rowKey) v.focusRow(it.rowKey);
  // Our own scroll (focusRow brings the row into view): not the user's.
  if (q.sc) q.top = q.sc.scrollTop;
}
function _qpClose() {
  const q = _qp; if (!q) return;
  _qp = null;
  window.removeEventListener('keydown', q.onKey, true);
  document.removeEventListener('mousedown', q.onDown, true);
  if (q.sc) {
    q.sc.removeEventListener('wheel', q.onWheel);
    q.sc.removeEventListener('touchmove', q.onWheel);
    q.sc.removeEventListener('scroll', q.onScroll);
  }
  const had = q.el.contains(document.activeElement);
  if (q.el.parentNode) q.el.parentNode.removeChild(q.el);
  // A band repainted while the panel was open drew a new «Όλα»: the anchor
  // captured at open may be detached by now.
  const a = q.anchor && q.anchor.isConnected ? q.anchor : document.querySelector('#content .wi4 .wi4-q-all');
  if (a) a.setAttribute('aria-expanded', 'false');
  // Focus back where the panel came from (F10) — only when it was inside the
  // panel: a click elsewhere keeps its own target. No scroll: «Όλα» may be
  // above the window after a Q.
  if (had && a && a.focus) a.focus({ preventScroll: true });
}

// ═══ «?» shortcuts sheet (§e #17) ═══════════════════════════════════════
let _help = null;
function _helpOpen() {
  if (_help) { _helpClose(); return; }
  const back = document.createElement('div'); back.className = 'wi4-dlg-back';
  // Its own class: the sheet's geometry is Figma 1119:2836's (600 wide, Syne
  // 17 title, 110px key column, DM Mono caps); the conflict dialog keeps .wi4-dlg.
  const dlg = document.createElement('div'); dlg.className = 'wi4-dlg wi4-help'; dlg.setAttribute('role', 'dialog');
  const hd = document.createElement('div'); hd.className = 'wi4-dlg-t'; hd.textContent = 'Συντομεύσεις';
  const esc = _btn('wi4-key', 'Esc', () => _helpClose()); esc.setAttribute('aria-label', 'Κλείσιμο');
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
  // Keys bound outside the board work here too and were missing (Figma lists
  // them): ←/→ from core/ui.js, ⌘K from the command palette — each read from
  // the constant next to its own binding. Placed as Figma places them: the
  // week with navigation before «/», the palette first in ΓΕΝΙΚΑ.
  const ext = [[window.UI_GLOBAL_KEYS, 'ΠΛΟΗΓΗΣΗ', ACTION_TEXT.search], [window.PALETTE_KEYS, 'ΓΕΝΙΚΑ', null]];
  for (const [list, group, before] of ext) {
    (Array.isArray(list) ? list : []).forEach((g) => {
      const at = rows.findIndex((r) => r.group === group && (before == null || r.text === before));
      const row = { group, text: String(g.label), keys: String(g.keys).split(/\s+/) };
      if (at < 0) rows.push(row); else rows.splice(at, 0, row);
    });
  }
  for (const g of ['ΠΛΟΗΓΗΣΗ', 'ΣΤΗ ΣΕΙΡΑ', 'ΓΕΝΙΚΑ']) {
    const its = rows.filter((r) => r.group === g);
    if (!its.length) continue;
    const gh = document.createElement('div'); gh.className = 'wi4-qp-h'; gh.textContent = g;
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
  // The bar's «Προβολή» and avatar menus count as open menus too: they own
  // their keys, and Esc/↓ under them acted on the board (live audit 11/10).
  const view = document.getElementById('wi4-view');
  const barMenu = !!(view && !view.hidden) || !!document.querySelector('.topbar .wi4-umenu:not([hidden])');
  return {
    menuOpen: shown('wi-ctx') || barMenu, panelOpen: shown('wi-panel'), popoverOpen: shown('wi-popover'),
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
    case 'date': {
      // D opens the field of the row's OWN chip (a VS export's chip is the
      // Βέροια day, §e #7): mouse and keyboard reach the same field.
      const chip = el && el.querySelector('.wi4-c-exp .wi4-dc, .wi4-dc');
      const f = chip && /datePanel\('rec[A-Za-z0-9]+','([^']+)'/.exec(chip.getAttribute('onclick') || '');
      datePanel(oid, f && FIELD[f[1]] ? f[1] : 'Loading DateTime', chip || el);
      return;
    }
    case 'print': {
      const id = v.rowIdOf(oid);
      const row = id == null ? null : I.WINTL.rows.find((r) => r.id === id);
      if (row) I.menuPrint(row.id, row.type === 'import'); else _toast(GONE, 'warn');
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
// The overlay state is read BEFORE any other handler runs (capture phase):
// _wiCtxKeydown closes #wi-ctx on Esc first, and this bubble-phase listener
// then saw «no menu open», read Esc as «escape» and dropped the keyboard
// focus — Enter → Esc → A lost the row (11/10). A key another handler already
// took (defaultPrevented) is never acted on twice.
let _keySnap = null;
function _onKeySnap(e) { _keySnap = _live() ? { e, st: _state() } : null; }
function _onKey(e) {
  if (!_live()) return;
  const lg = L();
  if (typeof lg.keyAction !== 'function') return;
  const st = _keySnap && _keySnap.e === e ? _keySnap.st : _state();
  _keySnap = null;
  if (e.defaultPrevented) return;
  const act = lg.keyAction(_evOf(e), st);
  if (!act) return;
  e.preventDefault();
  // The blue ring shows only after keyboard use (sheet 15 C), and with it the
  // key-hint strip (note 1119:2834).
  const root = document.querySelector('#content .wi4');
  if (root) { root.classList.add('wi4-kbd'); _khint(root); }
  run(act);
}
function _onMouse() {
  if (!_live()) return;
  const root = document.querySelector('#content .wi4');
  // The key-hint strip goes with the class (CSS hides it); the node stays, so
  // a press never changes the board's height under the pointer — removing it
  // at mousedown shifted a board scrolled to its end, and the click landed on
  // another row (rig date.chip).
  if (root) root.classList.remove('wi4-kbd');
}
// Sheet 15 C (1119:2812): while the keyboard is in use, a strip at the foot of
// the board names the main keys — before, they were found only through «?».
// Built once per board on the first key; shown only with .wi4-kbd (CSS).
// The caps come from the sheet's own source (_hintFor → WI4.KEYMAP), so the
// strip and «?» never disagree; an unbound action drops out. The labels are
// Figma's short ones. Figma's «← → εξαγωγή / εισαγωγή» is not bound (←/→ =
// week, owner) and so is not here.
const KHINT = Object.freeze([[['rowPrev', 'rowNext'], 'σειρά'], [['menu'], 'μενού'], [['assign'], 'ανάθεση'],
  [['date'], 'ημερομηνία'], [['queueNext'], 'επόμενο της ουράς'], [['help'], 'όλες']]);
function _khint(root) {
  if (document.getElementById('wi4-khint')) return;
  const bar = document.createElement('div');
  bar.id = 'wi4-khint'; bar.className = 'wi4-khint'; bar.setAttribute('aria-hidden', 'true');
  for (const [acts, text] of KHINT) {
    const keys = acts.map(_hintFor).filter(Boolean);
    if (keys.length !== acts.length) continue;
    const k = document.createElement('span'); k.className = 'wi4-key'; k.textContent = keys.join(' ');
    const t = document.createElement('span'); t.textContent = text;
    bar.appendChild(k); bar.appendChild(t);
  }
  if (bar.childNodes.length) root.appendChild(bar);
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
// The reused assignment popover places itself for a 380px form (old code,
// §c.3); its real form is taller, so a row low on the screen put its
// «Αποθήκευση» below the window (review 11/10). v4 lifts it back inside —
// position only; the popover's code and markup are untouched. Idempotent: it
// writes only when the box overflows, so its own write cannot loop.
function _fitPopover(pop) {
  if (!_live() || !pop || pop.style.display !== 'block') return;
  const r = pop.getBoundingClientRect(), max = window.innerHeight - 12;
  if (r.bottom <= max + 0.5) return;
  const top = Math.max(12, Math.round(max - r.height)) + 'px';
  if (pop.style.top !== top) pop.style.top = top;
}
let _panelObs = null, _popObs = null;
let _attached = false;
function attach() {
  if (!_attached) {
    _attached = true;
    document.addEventListener('keydown', _onKeySnap, true);
    document.addEventListener('keydown', _onKey);
    document.addEventListener('mousedown', _onMouse, true);
  }
  // #wi-panel and #wi-popover are re-created by every full paint (they live
  // in #content), so their observers are re-attached on each call.
  if (_popObs) _popObs.disconnect();
  const pop = document.getElementById('wi-popover');
  if (pop) {
    _popObs = new MutationObserver(() => _fitPopover(pop));
    _popObs.observe(pop, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
  }
  if (_panelObs) _panelObs.disconnect();
  const panel = document.getElementById('wi-panel');
  if (!panel) return;
  _panelObs = new MutationObserver(() => _relabelPanel(panel));
  _panelObs.observe(panel, { childList: true, subtree: true, characterData: true });
  _relabelPanel(panel);
}

function isOpen() { return !!(_dp || _qp || _dlg || _help); }

// Page change (WIV2._cleanup): the v4 overlays live on <body>, and none of
// them may stay on top of the next page. A date save in flight still reports
// its answer (the `_dp !== st` branch of _dpSave).
function _closeAll() {
  if (_dlg) _dlgClose('keep');
  if (_dp) _dpClose();
  _qpClose();
  _helpClose();
}

window.WI4Actions = Object.freeze({
  openRowMenu, datePanel, conflictDialog, queuePanel, run, attach, isOpen,
  // Seams for tests and for WP4 (underscore = not part of the frozen
  // contract). _queueAct is the ONE dispatcher of queue actions, and
  // _actLabel the one label of each, for the band cards and the «Όλα»
  // panel alike (principle 3).
  _gather, _dpWriteArgs, _queueAct, _actLabel, _refreshPresence, _keyEntries, _closeAll, _RELABEL: RELABEL,
});
})();
