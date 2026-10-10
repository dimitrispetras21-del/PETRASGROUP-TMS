// node --test tests/wi4-menu-parity.test.js
// Weekly International v4 — per-load menu parity (TECH_DESIGN §e.9, §a.5).
//
// Why: the v4 per-load menu GATHERS the items of today's right-click menus
// instead of copying them (principle 3). Two things can then go wrong without
// a sound: an extraction that changes what the old menus show, and a v4 menu
// that drops, doubles or renames an action. This file guards both.
//
//   1. Builders = openers (WP2, strict now). Every item builder exported in
//      WI_INTERNAL returns EXACTLY the HTML its old opener puts in #wi-ctx, for
//      every row of a synthetic week, so v1 menus stay byte-identical and v4
//      gathers the same items the user sees today.
//   2. The old strings the v4 relabel map keys on (§e.9 table, left column)
//      still exist in builder output or in the panel strings of the module: a
//      rename in old code must fail here, not silently skip a relabel.
//   3. The v4 menu rules (strict once WP5 lands; a visible TODO until then):
//      every old handler at least once (truck handlers excepted in member
//      submenus), no onclick twice, unique labels, and «Άνοιγμα παραγγελίας»
//      → _wk3Edit(...) the ONLY v4-only onclick. The checker is a pure
//      function on HTML strings, self-tested below on synthetic menus.
//
// The real module runs in a vm (no DOM): weekly_intl.js plus the real
// core/tms-week.js, core/data-helpers.js, core/orders-common.js,
// modules/preorder.js and core/relay.js; toLocalDate/localToday/escapeHtml are
// taken from core/utils.js by name. Synthetic data only (public repo).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const WI_SRC = fs.readFileSync(process.env.WI_SRC || path.join(ROOT, 'modules/weekly_intl.js'), 'utf8');
const fnFrom = (src, name) => {
  const m = src.match(new RegExp('function ' + name + '\\([^)]*\\) ?\\{[\\s\\S]*?\\n\\}\\n'));
  if (!m) throw new Error(name + ' not found');
  return m[0];
};

// ── A no-DOM world holding the real module ───────────────────────────────
function el() {
  return { innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, hasAttribute: () => false, focus() {} };
}
function world() {
  const ctxEl = el();
  const store = new Map();
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    ROLE: 'dispatcher', currentPage: 'weekly_intl',
    FEATURES: { ORDER_SPLIT: true, GROUP_TILES: true, STOCK_LOTS: true, WI_V2: 'off', WI_PRESENCE: false },
    TABLES: { ORDERS: 'tblO', STOCK_LOTS: 'tblStockLots', LOCAL_MOVES: 'local_moves' },
    can: () => 'full', toast() {}, logError() {}, reportError() {},
    addEventListener() {}, removeEventListener() {},
    innerWidth: 1920, innerHeight: 1080,
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    document: {
      addEventListener() {}, removeEventListener() {}, head: null, body: el(),
      getElementById: id => (id === 'wi-ctx' ? ctxEl : null), querySelector: () => null, querySelectorAll: () => [],
      createElement: () => el(), fullscreenElement: null,
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const utils = read('core/utils.js');
  vm.runInContext(['toLocalDate', 'localToday', 'escapeHtml'].map(n => fnFrom(utils, n)).join('\n')
    + '\nObject.assign(this,{toLocalDate,localToday,escapeHtml});', ctx);
  for (const f of ['core/tms-week.js', 'core/data-helpers.js', 'core/orders-common.js', 'modules/preorder.js', 'core/relay.js'])
    vm.runInContext(read(f), ctx, { filename: f });
  vm.runInContext('this.TmsWeek=TmsWeek;this.OrdersStock=OrdersStock;', ctx);
  vm.runInContext(WI_SRC, ctx, { filename: 'modules/weekly_intl.js' });
  return { ctx, ctxEl, W: ctx.WI_INTERNAL };
}

// Synthetic week: a matched own pair, a partner, an unassigned export, an
// export group, a split parent with two legs, a rota leg, an import group on
// our own truck, a free import, a pre-order, a lot and a relay.
const R = (id, dir, f) => ({ id, fields: Object.assign({ Type: 'International', Direction: dir, Status: 'Pending',
  'Client Name': 'CLIENT ' + id, Reference: 'R-' + id, 'Total Pallets': 10,
  'Loading DateTime': '2026-10-05T08:00:00.000Z', 'Delivery DateTime': '2026-10-07T10:00:00.000Z' }, f) });
const own = n => ({ Truck: ['recT' + n], Driver: ['recD' + n], Status: 'Assigned' });
function fill(W) {
  const D = W.WINTL.data;
  D.trucks = [1, 2, 3, 4, 5, 6, 7].map(n => ({ id: 'recT' + n, label: 'TST-10' + n }));
  D.trailers = []; D.drivers = [1, 2, 3, 4, 5, 6, 7].map(n => ({ id: 'recD' + n, label: 'Driver ' + n }));
  D.partners = [{ id: 'recP1', label: 'Partner One' }, { id: 'recP2', label: 'Partner Two' }];
  D.exports = [
    R('recE01', 'Export', Object.assign(own(1), { 'Matched Import ID': 'recI01' })),
    R('recE02', 'Export', { Partner: ['recP1'], 'Is Partner Trip': true, Status: 'Assigned' }),
    R('recE03', 'Export', {}),
    R('recE04', 'Export', Object.assign(own(2), { 'Group ID': 'GRP-T|recE04,recE05' })),
    R('recE05', 'Export', Object.assign(own(2), { 'Group ID': 'GRP-T|recE04,recE05' })),
    R('recE07', 'Export', { 'Ops Status': 'Provisional' }),
    R('recE08', 'Export', {}),
    R('recE81', 'Export', Object.assign(own(4), { 'Parent Order': ['recE08'], 'Leg No': 1 })),
    R('recE82', 'Export', Object.assign(own(5), { 'Parent Order': ['recE08'], 'Leg No': 2 })),
    R('recE09', 'Export', Object.assign(own(6), { Status: 'In Transit' })),
  ];
  D.imports = [
    R('recI01', 'Import', own(1)),
    R('recI02', 'Import', Object.assign(own(7), { 'Group ID': 'GI-T|recI02,recI03' })),
    R('recI03', 'Import', Object.assign(own(7), { 'Group ID': 'GI-T|recI02,recI03' })),
    R('recI04', 'Import', {}),
    R('recI05', 'Import', Object.assign(own(6), { 'Rotation ID': 'recE09' })),
    R('recI06', 'Import', { Partner: ['recP2'], 'Is Partner Trip': true, Status: 'Assigned', 'Own Stock Lot': 'recLot1' }),
    R('recI07', 'Import', { 'Ops Status': 'Provisional' }),
  ];
  D.stock = { status: 'ok', lots: [{ id: 'recLot1', fields: { 'Remaining Pallets': 10 } }], loose: [] };
  W.WINTL._range = { ws: '2026-10-03', we: '2026-10-09' };
  W.WINTL.relay = { state: 'ok', byOrder: { recI01: { relay_delivery: { id: 'recMv1', fields: { 'Parent Order': ['recI01'], 'Move Kind': 'relay_delivery' } } } }, err: '', syncErr: {} };
  W.buildRows();
}

function ev(ctxEl) { return { preventDefault() {}, stopPropagation() {}, currentTarget: ctxEl, target: ctxEl, clientX: 300, clientY: 200 }; }
let shown = 0;   // openers that showed a non-empty menu (coverage, not vacuous equality)
async function opened(ctx, ctxEl, call) {
  ctxEl.innerHTML = ''; ctxEl.style = {};
  await vm.runInContext(call, ctx);
  if (ctxEl.innerHTML) shown++;
  return ctxEl.innerHTML;
}

test('the module loads in a no-DOM world and exposes the item builders through WI_INTERNAL', () => {
  const { W } = world();
  for (const k of ['ctxItems', 'impCtxItems', 'segCtxItems', 'preCtxItems', 'lotCtxItems', 'legCtxItems', 'relayCtxItems', 'splitHeaderCtxItems'])
    assert.strictEqual(typeof W[k], 'function', k);
  assert.ok(Object.isFrozen(W), 'WI_INTERNAL is frozen: v4 cannot swap an old function under the old board');
});

test('fixture: the synthetic week builds the row kinds the menus branch on', () => {
  const { W } = world(); fill(W);
  const rows = W.WINTL.rows;
  const has = (pred, what) => assert.ok(rows.some(pred), 'no ' + what);
  has(r => r.type === 'export' && r.importId, 'matched export');
  has(r => r.type === 'export' && r.orderIds.length > 1, 'export group');
  has(r => r.type === 'import' && r.orderIds.length > 1, 'import group');
  has(r => r.hasSplitLegs, 'split parent');
  has(r => r.splitLegOf, 'split leg');
  has(r => r.legOf, 'rota leg');
  has(r => r.partnerId, 'partner row');
  assert.ok(W.preCtxItems(rows.find(r => (r.orderIds || [])[0] === 'recE07')), 'pre-order menu');
  assert.ok(W.lotCtxItems(rows.find(r => r.orderId === 'recI06'), true), 'lot menu');
});

// 1. Builders = openers, row by row. The opener's own routing stays in the
// opener (pre-order and lot first), so each builder is compared on the rows
// where its opener reaches it.
test('builders = openers: every opener shows exactly its builder\'s HTML (v1 menus unchanged)', async () => {
  const { ctx, ctxEl, W } = world(); fill(W);
  ctx.__ev = ev(ctxEl);
  let compared = 0;
  for (const row of W.WINTL.rows) {
    const id = row.id, oid = (row.orderIds || [])[0] || row.orderId;
    const pre = W.preCtxItems(row), lotE = W.lotCtxItems(row, false), lotI = W.lotCtxItems(row, true);
    const expE = pre || lotE || W.ctxItems(row);
    assert.strictEqual(await opened(ctx, ctxEl, `_wiCtx(__ev,${id})`), expE, `_wiCtx row ${oid}`); compared++;
    const expI = pre || lotI || W.impCtxItems(row, undefined);
    assert.strictEqual(await opened(ctx, ctxEl, `_wiImpCtx(__ev,${id})`), expI, `_wiImpCtx row ${oid}`); compared++;
    if (row.type === 'export' && row.importId) {
      const imp = W.impGroupRowOf(row.importId);
      const expM = W.preCtxItems(imp) || W.impCtxItems(imp, id);
      assert.strictEqual(await opened(ctx, ctxEl, `_wiMatchedImpCtx(__ev,${id})`), expM, `_wiMatchedImpCtx row ${oid}`); compared++;
    }
    assert.strictEqual(await opened(ctx, ctxEl, `_wiSplitHeaderCtx(__ev,${id})`), W.splitHeaderCtxItems(row), `_wiSplitHeaderCtx row ${oid}`); compared++;
    if ((row.orderIds || []).length > 1) for (const m of row.orderIds) for (const isImp of [false, true]) {
      assert.strictEqual(await opened(ctx, ctxEl, `_wiSegCtx(__ev,${id},'${m}',${isImp})`), W.segCtxItems(id, m, isImp), `_wiSegCtx ${oid}/${m}/${isImp}`); compared++;
    }
  }
  for (const legs of Object.values(W.WINTL._legs)) for (const l of legs) {
    const oid = l.orderId || l.orderIds[0];
    const exp = W.preCtxItems({ orderIds: [oid] }) || W.legCtxItems(oid);
    assert.strictEqual(await opened(ctx, ctxEl, `_wiLegCtx(__ev,'${oid}')`), exp, `_wiLegCtx ${oid}`); compared++;
  }
  assert.strictEqual(await opened(ctx, ctxEl, `_wiRelayCtx(__ev,'recMv1','recI01')`), W.relayCtxItems('recMv1', 'recI01'), '_wiRelayCtx'); compared++;
  assert.ok(compared >= 50 && shown >= 50, `only ${compared} menus compared, ${shown} non-empty — the fixture lost coverage`);
});

test('builders are pure: calling one twice gives the same HTML and never touches #wi-ctx', () => {
  const { ctxEl, W } = world(); fill(W);
  ctxEl.innerHTML = 'untouched';
  for (const row of W.WINTL.rows) {
    assert.strictEqual(W.ctxItems(row), W.ctxItems(row));
    assert.strictEqual(W.impCtxItems(row), W.impCtxItems(row));
  }
  assert.strictEqual(ctxEl.innerHTML, 'untouched');
});

// 2. The §e.9 relabel table's old strings (left column). These are facts of
// weekly_intl.js, not a copy of the v4 map: the map's own keys are checked
// against them in part 3 once WP5 exposes it.
const OLD_STRINGS = [
  { s: 'Ομαδοποίηση…', where: 'menu' }, { s: '+ Εισαγωγή στο φορτίο…', where: 'menu' },
  { s: 'Εκτύπωση…', where: 'menu' }, { s: 'Ακύρωση groupage', where: 'menu' }, { s: 'Εκτύπωση όλων', where: 'menu' },
  { s: 'Groupage εισαγωγών…', where: 'menu' },
  { s: "'Ομαδοποίηση'", where: 'panel' }, { s: '>Ομαδοποίηση<', where: 'panel' }, { s: "'+ Εισαγωγή στο φορτίο'", where: 'panel' },
];
test('the old strings the v4 relabel map keys on still exist (a rename in old code fails here)', () => {
  const { W } = world(); fill(W);
  const rows = W.WINTL.rows;
  const menus = [];
  for (const r of rows) {
    menus.push(W.ctxItems(r), W.impCtxItems(r), W.splitHeaderCtxItems(r));
    if (r.importId) { const imp = W.impGroupRowOf(r.importId); if (imp) menus.push(W.impCtxItems(imp, r.id)); }
    for (const m of (r.orderIds || []).length > 1 ? r.orderIds : []) menus.push(W.segCtxItems(r.id, m, false), W.segCtxItems(r.id, m, true));
  }
  const all = menus.join('\n');
  const missing = OLD_STRINGS.filter(o => !(o.where === 'menu' ? all.includes('>' + o.s + '<') : WI_SRC.includes(o.s)));
  assert.deepStrictEqual(missing, [], 'old menu/panel strings not found');
});

// 3. The v4 menu rules, as a pure checker on HTML strings.
const BTN = /<button\b[^>]*?\bonclick="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g;
const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const handlerOf = onclick => decode(onclick).replace(/;_wiCtxClose\(\)$/, '');
const itemsOf = html => [...String(html).matchAll(BTN)].map(m => ({ fn: handlerOf(m[1]), label: m[2].replace(/<[^>]+>/g, '').trim() }));
const TRUCK = /^_wiPanelAssign\(|^_wiClear\(|^_wiStockPanel\(/;
/**
 * @param {string[]} oldMenus  HTML of every old builder that applies to the load
 * @param {{main:string, submenus:string[]}} v4  the v4 menu: the main list and
 *   each member submenu (HTML of .wi-ctx-i buttons)
 * @returns {string[]} violations, [] = parity
 */
function parityViolations(oldMenus, v4) {
  const out = [];
  const lists = [v4.main, ...(v4.submenus || [])].map(itemsOf);
  const v4All = lists.flat();
  const oldFns = new Set(oldMenus.flatMap(itemsOf).map(i => i.fn));
  for (const fn of oldFns) if (!v4All.some(i => i.fn === fn)) out.push('missing handler ' + fn);
  lists.forEach((items, k) => {
    const seenFn = new Set(), seenLbl = new Set();
    for (const i of items) {
      if (seenFn.has(i.fn)) out.push(`onclick twice in ${k ? 'submenu ' + k : 'main'}: ${i.fn}`); seenFn.add(i.fn);
      if (seenLbl.has(i.label)) out.push(`label twice in ${k ? 'submenu ' + k : 'main'}: ${i.label}`); seenLbl.add(i.label);
      if (k && TRUCK.test(i.fn)) out.push('truck handler in a member submenu: ' + i.fn);
    }
  });
  for (const i of v4All) if (!oldFns.has(i.fn) && !/^_wk3Edit\('rec[A-Za-z0-9]+'\)$/.test(i.fn)) out.push('v4-only onclick ' + i.fn);
  for (const i of v4All) if (/^_wk3Edit\(/.test(i.fn) && !oldFns.has(i.fn) && i.label !== 'Άνοιγμα παραγγελίας') out.push('v4-only _wk3Edit labelled «' + i.label + '»');
  return out;
}

test('checker self-test: parity holds for a faithful merge and fails loudly on each broken rule', () => {
  const b = (label, fn) => `<button class="wi-ctx-i" onclick="${fn};_wiCtxClose()">${label}</button>`;
  const oldA = b('Ανάθεση…', '_wiPanelAssign(3,false)') + b('Εκτύπωση…', '_wiMenuPrint(3,false)') + b('Αφαίρεση ταιριάσματος', '_wiUnmatchRow(3)');
  const oldB = b('Ανάθεση…', '_wiPanelAssign(3,false)') + b('+ Εισαγωγή στο φορτίο…', '_wiPanelJoinLoad(3)');
  const good = { main: b('Άνοιγμα παραγγελίας', "_wk3Edit('recE01')") + b('Ανάθεση…', '_wiPanelAssign(3,false)')
    + b('Εκτύπωση / WhatsApp…', '_wiMenuPrint(3,false)') + b('Αφαίρεση ταιριάσματος', '_wiUnmatchRow(3)')
    + b('Groupage εισαγωγών · σε αυτό το φορτίο…', '_wiPanelJoinLoad(3)'), submenus: [] };
  assert.deepStrictEqual(parityViolations([oldA, oldB], good), []);
  const drop = { main: good.main.replace(b('Αφαίρεση ταιριάσματος', '_wiUnmatchRow(3)'), ''), submenus: [] };
  assert.match(parityViolations([oldA, oldB], drop).join('|'), /missing handler _wiUnmatchRow\(3\)/);
  const twice = { main: good.main + b('Ανάθεση ξανά…', '_wiPanelAssign(3,false)'), submenus: [] };
  assert.match(parityViolations([oldA, oldB], twice).join('|'), /onclick twice in main/);
  const sameLabel = { main: good.main + b('Ανάθεση…', '_wiRota(3)'), submenus: [] };
  assert.match(parityViolations([oldA, oldB], sameLabel).join('|'), /label twice in main: Ανάθεση…/);
  const invented = { main: good.main + b('Καθυστέρηση…', '_wiDelay(3)'), submenus: [] };
  assert.match(parityViolations([oldA, oldB], invented).join('|'), /v4-only onclick _wiDelay\(3\)/);
  const truckInSub = { main: good.main, submenus: [b('Ανάθεση…', '_wiPanelAssign(3,false)')] };
  assert.match(parityViolations([oldA, oldB], truckInSub).join('|'), /truck handler in a member submenu/);
  const wrongOpen = { main: good.main.replace('Άνοιγμα παραγγελίας', 'Φόρμα'), submenus: [] };
  assert.match(parityViolations([oldA, oldB], wrongOpen).join('|'), /v4-only _wk3Edit labelled «Φόρμα»/);
});

test('v4 per-load menu (WP5) meets the parity rules on every fixture load', () => {
  // WP5 wiring. WI4Actions._gather(orderId) is the model openRowMenu draws
  // (the same parsed <button> nodes, moved, relabelled). It runs here on the
  // real builders with: a regex DOMParser for the builders' flat <button>
  // markup; a WIV2 whose rowIdOf finds the row that owns the order; and a WI4
  // whose menuSection follows §e.9 rule 5 (core/wi4-logic.js is WP1's).
  // Lists given to the checker: the truck section is `main`; each load
  // section and each «▸» submenu is its own list, because Figma draws the
  // same per-load label («Εκτύπωση / WhatsApp…») under ΕΞΑΓΩΓΗ and under
  // ΕΙΣΑΓΩΓΗ and the section header tells them apart. Uniqueness of onclick
  // across the WHOLE menu is asserted on top.
  const { ctx, W } = world(); fill(W);
  const dec = x => String(x).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  ctx.DOMParser = function () {};
  ctx.DOMParser.prototype.parseFromString = html => {
    const nodes = [];
    for (const m of String(html).matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      const at = {};
      for (const a of m[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) at[a[1]] = a[2] === undefined ? '' : dec(a[2]);
      if (!/(^|\s)wi-ctx-i(\s|$)/.test(at.class || '')) continue;
      nodes.push({ getAttribute: n => (n in at ? at[n] : null), hasAttribute: n => n in at, disabled: 'disabled' in at, textContent: dec(m[2].replace(/<[^>]+>/g, '')) });
    }
    return { querySelectorAll: () => nodes };
  };
  ctx.WI4 = { KEYMAP: { KeyA: 'assign', KeyP: 'print', KeyO: 'open' }, MENU_ICON: {},
    menuSection: fn => (/^(_wiPanelAssign|_wiClear|_wiStockPanel)$/.test(fn) ? 'truck' : /^(_wiUnmatchRow|_wiUnmatch)$/.test(fn) ? 'import' : 'export') };
  ctx.WIV2 = { active: () => false, _broken: false,
    rowIdOf: oid => { const r = W.WINTL.rows.find(x => (x.orderIds || []).includes(oid) || x.orderId === oid); return r ? r.id : null; } };
  vm.runInContext(read('modules/wi4_actions.js'), ctx, { filename: 'modules/wi4_actions.js' });
  const A = ctx.WI4Actions;
  const html = items => items.filter(i => i.onclick).map(i => `<button class="wi-ctx-i" onclick="${i.onclick}">${i.label}</button>`).join('');
  const oidsOf = r => ((r.orderIds && r.orderIds.length) ? r.orderIds : [r.orderId]);
  let loads = 0;
  for (const row of W.WINTL.rows) {
    if (row.type === 'import' && row.matchedTo) continue;   // drawn inside its export row, no plane of its own
    const oid = oidsOf(row)[0];
    // What the old openers show for this load (their own routing).
    const old = [];
    if (row.legOf) old.push(W.preCtxItems({ orderIds: [oid] }) || W.legCtxItems(oid));
    else if (row.hasSplitLegs) old.push(W.splitHeaderCtxItems(row));
    else if (row.type === 'import') {
      const own = W.preCtxItems(row) || W.lotCtxItems(row, true);
      old.push(own || W.impCtxItems(row, undefined));
      if (!own && row.orderIds.length > 1) for (const m of row.orderIds) old.push(W.segCtxItems(row.id, m, true));
    } else {
      const own = W.preCtxItems(row) || W.lotCtxItems(row, false);
      old.push(own || W.ctxItems(row));
      if (!own && row.orderIds.length > 1) for (const m of row.orderIds) old.push(W.segCtxItems(row.id, m, false));
      if (row.importId) {
        const imp = W.impGroupRowOf(row.importId);
        const pre = W.preCtxItems(imp);
        old.push(pre || W.impCtxItems(imp, row.id));
        if (!pre && imp.orderIds.length > 1) for (const m of imp.orderIds) old.push(W.segCtxItems(imp.id, m, true));
      }
    }
    for (const o of W.relayIdsOfRow(row)) for (const rec of Object.values(W.WINTL.relay.byOrder[o] || {})) old.push(W.relayCtxItems(rec.id, o));
    const m = A._gather(oid);
    assert.ok(m, 'no menu for ' + oid);
    const lists = m.sections.flatMap(s => [s.items, ...s.subs.map(x => x.items)]);
    assert.deepStrictEqual(parityViolations(old, { main: html(m.truck), submenus: lists.map(html) }), [], 'parity, load ' + oid);
    const all = [m.truck, ...lists].flat().filter(i => i.onclick).map(i => i.onclick);
    assert.strictEqual(new Set(all).size, all.length, 'an onclick twice in the menu of ' + oid);
    loads++;
  }
  assert.ok(loads >= 10, `only ${loads} loads checked — the fixture lost coverage`);
  // The relabel map's keys exist in some builder output or panel string.
  for (const k of Object.keys(A._RELABEL.menu)) assert.ok(WI_SRC.includes(k), 'relabel key gone from weekly_intl.js: ' + k);
  for (const k of Object.keys(A._RELABEL.panelTitle)) assert.ok(WI_SRC.includes("'" + k + "'"), 'panel title gone: ' + k);
});
