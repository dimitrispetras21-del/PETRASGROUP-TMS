// node --test tests/wi4-actions.test.js
// Weekly International v4 — actions (WP5; TECH_DESIGN §d.4, §e #3/#9/#10/#17,
// §e.9, §g.4).
//
// What is proven here, without a browser:
//   1. the date panel sends EXACTLY today's PATCH body, plus `_expect` only
//      while v4 is active — the real _wiDateWrite of weekly_intl.js runs, and
//      the request is captured at atSafePatch;
//   2. the per-load menu model: truck items once at the top, «Άνοιγμα
//      παραγγελίας» first per single load, member submenus without truck
//      items, unmatch under ΕΙΣΑΓΩΓΗ, relabels, no onclick twice anywhere;
//   3. the read-only gate runs exactly where _wiCtx runs it, and nothing
//      opens when it blocks;
//   4. the keyboard dispatcher acts only while v4 is live, and N only on an
//      empty return;
//   5. the «?» sheet and the key hints read the live KEYMAP (both shapes).
// The menu-parity rules themselves are in tests/wi4-menu-parity.test.js.
// WI4 (core/wi4-logic.js, WP1) is replaced by a fake that follows §d: this
// file tests the drawing/dispatch layer, not the rules.
// Synthetic data only (public repo).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// Values made inside the vm carry its realm's prototypes: compare plain copies
// (undefined kept visible, so «no time sent» stays distinct from null).
const plain = (v) => (v === undefined ? '__undef__' : JSON.parse(JSON.stringify(v, (k, x) => (x === undefined ? '__undef__' : x))));
const eq = (a, b, msg) => assert.deepStrictEqual(plain(a), plain(b), msg);
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const fnFrom = (src, name) => {
  const m = src.match(new RegExp('function ' + name + '\\([^)]*\\) ?\\{[\\s\\S]*?\\n\\}\\n'));
  if (!m) throw new Error(name + ' not found');
  return m[0];
};

// A regex DOMParser: enough for the builders' flat <button> markup.
const dec = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function FakeParser() {}
FakeParser.prototype.parseFromString = function (html) {
  const nodes = [];
  for (const m of String(html).matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = {};
    for (const a of m[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? '' : dec(a[2]);
    if (!/(^|\s)wi-ctx-i(\s|$)/.test(attrs.class || '')) continue;
    nodes.push({ getAttribute: (n) => (n in attrs ? attrs[n] : null), hasAttribute: (n) => n in attrs,
      disabled: 'disabled' in attrs, textContent: dec(m[2].replace(/<[^>]+>/g, '')), outer: m[0] });
  }
  return { querySelectorAll: () => nodes };
};

const KEYMAP = { ArrowUp: 'rowPrev', ArrowDown: 'rowNext', Enter: 'menu', KeyA: 'assign', KeyD: 'date', KeyP: 'print',
  KeyN: 'newImport', KeyO: 'open', KeyQ: 'queueNext', Slash: 'search', 'Shift+Slash': 'help', Escape: 'escape' };
function fakeWI4() {
  return {
    KEYMAP,
    MENU_ICON: {},
    menuSection: (fn) => (/^(_wiPanelAssign|_wiClear|_wiStockPanel)$/.test(fn) ? 'truck' : /^(_wiUnmatchRow|_wiUnmatch)$/.test(fn) ? 'import' : 'export'),
    plural: (n, one) => n + ' ' + (n === 1 ? one : one === 'φορτίο' ? 'φορτία' : one),
    buildExpect: (fields, rec) => { const o = {}; for (const f of fields) o[f] = rec.fields[f]; return Object.keys(o).length ? o : undefined; },
    keyAction: (ev, st) => (st.onPage && st.rootPresent && !ev.ctrl && !ev.meta ? KEYMAP[(ev.shift ? 'Shift+' : '') + ev.code] || null : null),
  };
}

function el() {
  return { innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, hasAttribute: () => false, focus() {}, appendChild() {} };
}
function world(opts = {}) {
  const ctxEl = el();
  const store = new Map();
  const calls = [];
  const root = el();
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    ROLE: 'dispatcher', currentPage: 'weekly_intl',
    FEATURES: { ORDER_SPLIT: true, GROUP_TILES: true, STOCK_LOTS: true, WI_V2: 'off', WI_PRESENCE: false },
    TABLES: { ORDERS: 'tblO', STOCK_LOTS: 'tblStockLots', LOCAL_MOVES: 'local_moves' },
    can: () => opts.planning || 'full', toast: (m, t) => calls.push(['toast', m, t]), logError() {}, reportError() {},
    addEventListener() {}, removeEventListener() {},
    innerWidth: 1920, innerHeight: 1080,
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: {
      addEventListener() {}, removeEventListener() {}, head: null, body: el(),
      getElementById: (id) => (id === 'wi-ctx' ? ctxEl : null),
      querySelector: (s) => (opts.rootPresent && s === '#content .wi4' ? root : null), querySelectorAll: () => [],
      createElement: () => el(), fullscreenElement: null,
    },
    DOMParser: FakeParser,
    invalidateCache: () => calls.push(['invalidate']),
    syncOrderDownstream: (id, o) => { calls.push(['sync', id, o]); return Promise.resolve(); },
    atSafePatch: (t, id, fields, o) => { calls.push(['patch', t, id, JSON.parse(JSON.stringify(fields)), o === undefined ? undefined : JSON.parse(JSON.stringify(o))]); return Promise.resolve({ id, fields }); },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const utils = read('core/utils.js');
  vm.runInContext(['toLocalDate', 'localToday', 'escapeHtml'].map((n) => fnFrom(utils, n)).join('\n')
    + '\nObject.assign(this,{toLocalDate,localToday,escapeHtml});', ctx);
  for (const f of ['core/tms-week.js', 'core/data-helpers.js', 'core/orders-common.js', 'modules/preorder.js', 'core/relay.js'])
    vm.runInContext(read(f), ctx, { filename: f });
  vm.runInContext('this.TmsWeek=TmsWeek;this.OrdersStock=OrdersStock;', ctx);
  vm.runInContext(read('modules/weekly_intl.js'), ctx, { filename: 'modules/weekly_intl.js' });
  const W = ctx.WI_INTERNAL;
  ctx.WI4 = fakeWI4();
  let active = !!opts.active;
  ctx.WIV2 = {
    _broken: false,
    active: () => active,
    rowIdOf: (oid) => { const r = W.WINTL.rows.find((x) => (x.orderIds || []).includes(oid) || x.orderId === oid); return r ? r.id : null; },
    rowOrder: () => opts.order || [],
    focusRow: (oid) => { calls.push(['focus', oid]); W.WINTL.ui.v4Focus = oid; return true; },
    queueItems: () => opts.queue || [],
    search: (q) => calls.push(['search', q]), searchFocus: () => calls.push(['searchFocus']),
    noteMove: (...a) => calls.push(['noteMove', ...a]),
  };
  vm.runInContext(read('modules/wi4_actions.js'), ctx, { filename: 'modules/wi4_actions.js' });
  return { ctx, ctxEl, W, A: ctx.WI4Actions, calls, setActive: (v) => { active = v; } };
}

const R = (id, dir, f) => ({ id, fields: Object.assign({ Type: 'International', Direction: dir, Status: 'Pending',
  'Client Name': 'CLIENT ' + id, Reference: 'R-' + id, 'Total Pallets': 10,
  'Loading DateTime': '2026-10-05T08:00:00.000Z', 'Delivery DateTime': '2026-10-07T10:00:00.000Z' }, f) });
const own = (n) => ({ Truck: ['recT' + n], Driver: ['recD' + n], Status: 'Assigned' });
function fill(W) {
  const D = W.WINTL.data;
  D.trucks = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: 'recT' + n, label: 'TST-10' + n }));
  D.trailers = []; D.drivers = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: 'recD' + n, label: 'Driver ' + n }));
  D.partners = [{ id: 'recP1', label: 'Partner One' }];
  D.exports = [
    R('recE01', 'Export', Object.assign(own(1), { 'Matched Import ID': 'recI01' })),
    R('recE02', 'Export', { Partner: ['recP1'], 'Is Partner Trip': true, Status: 'Assigned' }),
    R('recE03', 'Export', { 'Veroia Switch': true, 'VS CD Date': '2026-10-06' }),
    R('recE04', 'Export', Object.assign(own(2), { 'Group ID': 'GRP-T|recE04,recE05' })),
    R('recE05', 'Export', Object.assign(own(2), { 'Group ID': 'GRP-T|recE04,recE05' })),
    R('recE07', 'Export', { 'Ops Status': 'Provisional' }),
  ];
  D.imports = [
    R('recI01', 'Import', own(1)),
    R('recI04', 'Import', {}),
  ];
  D.stock = { status: 'ok', lots: [], loose: [] };
  W.WINTL._range = { ws: '2026-10-03', we: '2026-10-09' };
  W.WINTL.relay = { state: 'ok', byOrder: {}, err: '', syncErr: {} };
  W.buildRows();
}
const lists = (m) => [m.truck, ...m.sections.flatMap((s) => [s.items, ...s.subs.map((x) => x.items)])];
const fns = (items) => items.filter((i) => i.onclick).map((i) => i.fn);

// ── 1. The date write ────────────────────────────────────────────────────
test('date panel args: a day-only change sends no time; a time change does; no change sends nothing', () => {
  const { A } = world();
  const st = (o) => Object.assign({ oid: 'recE01', field: 'Loading DateTime', cur: { 'Loading DateTime': '2026-10-05T08:00:00.000Z' },
    sel: '2026-10-06', time: '11:00', time0: '11:00', force: false }, o);
  eq(A._dpWriteArgs(st()), ['recE01', 'Loading DateTime', '2026-10-05T08:00:00.000Z', '2026-10-06', undefined]);
  eq(A._dpWriteArgs(st({ time: '14:30' }))[4], '14:30');
  // «Γράψε τη δική μου» resends the chosen time explicitly, so the value
  // stays mine even though _expect is now the other user's.
  eq(A._dpWriteArgs(st({ force: true }))[4], '11:00');
  // VS CD Date is date-only: a time never travels with it.
  const vs = A._dpWriteArgs(st({ field: 'VS CD Date', cur: { 'VS CD Date': '2026-10-06' }, sel: '2026-10-07', time: '09:00' }));
  eq(vs, ['recE01', 'VS CD Date', '2026-10-06', '2026-10-07', undefined]);
  assert.strictEqual(A._dpWriteArgs(st({ sel: null })), null);
});

test('date panel no-change: same day and same time → no write at all', () => {
  const { A, ctx } = world();
  const today = vm.runInContext("toLocalDate('2026-10-05T08:00:00.000Z')", ctx);
  const s = { oid: 'recE01', field: 'Loading DateTime', cur: { 'Loading DateTime': '2026-10-05T08:00:00.000Z' }, sel: today, time: '', time0: '', force: false };
  assert.strictEqual(A._dpWriteArgs(s), null);
});

test('date write body = today\'s body; _expect only while v4 is active (real _wiDateWrite)', async () => {
  const { W, A, calls, setActive } = world();
  fill(W);
  const cur = W.WINTL.data.exports[0].fields['Loading DateTime'];
  const st = { oid: 'recE01', field: 'Loading DateTime', cur: { 'Loading DateTime': cur }, sel: '2026-10-06', time: '', time0: '', force: false };
  // Today's path: _wk3PickDate calls _wiDateWrite(orderId, field, curIso, nd).
  await W.dateWrite('recE01', 'Loading DateTime', cur, '2026-10-06');
  const today = calls.filter((c) => c[0] === 'patch').pop();
  calls.length = 0;
  await W.dateWrite.apply(null, A._dpWriteArgs(st));
  const v4off = calls.filter((c) => c[0] === 'patch').pop();
  eq(v4off, today, 'flag-off: the v4 panel sends the same request as the hidden input');
  assert.strictEqual(v4off[4], undefined, 'no opts → no _expect');
  assert.ok(calls.some((c) => c[0] === 'sync' && c[1] === 'recE01' && c[2].changedFields[0] === 'Loading DateTime'), 'same downstream sync');
  setActive(true);
  calls.length = 0;
  await W.dateWrite.apply(null, A._dpWriteArgs(st));
  const v4on = calls.filter((c) => c[0] === 'patch').pop();
  eq(v4on.slice(0, 4), today.slice(0, 4), 'same table, record and fields');
  eq(v4on[4], { expect: { 'Loading DateTime': cur } }, 'plus _expect = the value the panel showed');
});

// ── 2. The per-load menu model ───────────────────────────────────────────
test('menu model, matched own pair: truck once on top, Άνοιγμα first, unmatch under ΕΙΣΑΓΩΓΗ', () => {
  const { W, A } = world(); fill(W);
  const m = A._gather('recE01');
  assert.ok(m, 'model');
  eq(m.sections.map((s) => s.kind), ['export', 'import']);
  const truck = fns(m.truck);
  assert.ok(truck.some((f) => /^_wiPanelAssign\(/.test(f)), 'Ανάθεση in the truck section');
  assert.ok(truck.some((f) => /^_wiClear\(/.test(f)), 'Καθαρισμός in the truck section');
  assert.strictEqual(truck.filter((f) => /^_wiPanelAssign\(/.test(f)).length, 1, 'Ανάθεση once (export + matched import gave it twice)');
  const [exp, imp] = m.sections;
  assert.strictEqual(exp.items[0].label, 'Άνοιγμα παραγγελίας');
  assert.strictEqual(exp.items[0].fn, "_wk3Edit('recE01')");
  assert.strictEqual(imp.items[0].fn, "_wk3Edit('recI01')");
  assert.ok(fns(imp.items).some((f) => /^_wiUnmatchRow\(/.test(f)), 'Αφαίρεση ταιριάσματος under ΕΙΣΑΓΩΓΗ');
  assert.ok(!fns(exp.items).some((f) => /^_wiUnmatchRow\(/.test(f)));
  assert.ok(imp.items.some((i) => i.label === 'Groupage εισαγωγών · σε αυτό το φορτίο…'), 'join relabelled');
  assert.ok(exp.items.some((i) => i.label === 'Εκτύπωση / WhatsApp…'), 'print relabelled');
  assert.ok(exp.items.some((i) => i.label === 'Σκέλος προώθησης (ρότα)…'), '⤷ replaced by the icon');
  assert.strictEqual(m.header.l1, 'TST-101 · Driver 1');
  assert.match(m.header.l2, /1 εξαγωγή · 1 εισαγωγή$/);
});

test('menu model, groupage: group items in the section, one «▸» per load, no truck item in a submenu', () => {
  const { W, A } = world(); fill(W);
  const m = A._gather('recE04');
  const exp = m.sections[0];
  assert.strictEqual(exp.kind, 'export');
  assert.strictEqual(exp.group, true);
  assert.ok(!exp.items.some((i) => i.v4only), 'no Άνοιγμα on the group section: each member has its own');
  assert.ok(exp.items.some((i) => i.label === 'Εκτύπωση / WhatsApp όλων…'), 'group-level print says «όλων»');
  assert.ok(exp.items.some((i) => /^Groupage εξαγωγών… \(πρόσθεση\)$/.test(i.label)), 'group build on a group row = «(πρόσθεση)»');
  assert.strictEqual(exp.subs.length, 2);
  for (const sub of exp.subs) {
    assert.strictEqual(sub.items[0].label, 'Άνοιγμα παραγγελίας');
    assert.ok(!sub.items.some((i) => /^(_wiPanelAssign|_wiClear|_wiStockPanel)$/.test(i.name)), 'truck handler in a member submenu');
    assert.ok(sub.items.some((i) => i.label === 'Βγάλε από το groupage'), 'Ακύρωση groupage relabelled');
  }
  assert.match(exp.subs[0].title, /^1 · CLIENT recE04 · 10 π\.$/);
});

test('menu model: no onclick twice anywhere, and the only v4-only item is Άνοιγμα παραγγελίας', () => {
  const { W, A } = world(); fill(W);
  for (const r of W.WINTL.rows) {
    if (r.type === 'import' && r.matchedTo) continue;   // drawn inside its export row
    const oid = (r.orderIds || [])[0] || r.orderId;
    const m = A._gather(oid);
    const all = lists(m).flat().filter((i) => i.onclick);
    const keys = all.map((i) => i.onclick);
    assert.strictEqual(new Set(keys).size, keys.length, 'duplicate onclick in the menu of ' + oid);
    for (const i of all.filter((x) => x.v4only)) assert.strictEqual(i.label, 'Άνοιγμα παραγγελίας');
  }
});

test('menu model: a pre-order keeps its own menu, and its «Μετατροπή» is not doubled by Άνοιγμα', () => {
  const { W, A } = world(); fill(W);
  const m = A._gather('recE07');
  const items = m.sections[0].items;
  assert.ok(items.some((i) => /^Μετατροπή σε παραγγελία/.test(i.label)));
  assert.ok(!items.some((i) => i.v4only), '_wk3Edit already present → no second item');
});

test('menu model: key hints come from the live KEYMAP (A on Ανάθεση, P on Εκτύπωση, O on Άνοιγμα)', () => {
  const { W, A } = world(); fill(W);
  const m = A._gather('recE01');
  const all = lists(m).flat();
  assert.strictEqual(all.find((i) => i.name === '_wiPanelAssign').hint, 'A');
  assert.strictEqual(all.find((i) => i.name === '_wiMenuPrint').hint, 'P');
  assert.strictEqual(all.find((i) => i.v4only).hint, 'O');
  assert.strictEqual(all.filter((i) => i.hint === 'P').length, 1, 'one hint per key per menu');
});

// ── 3. The read-only gate ────────────────────────────────────────────────
test('openRowMenu: the read-only gate runs first, and a blocked role opens nothing', async () => {
  const { W, A, calls, ctxEl } = world({ planning: 'view' }); fill(W);
  await A.openRowMenu({ preventDefault() {}, stopPropagation() {}, clientX: 1, clientY: 1 }, 'recE01');
  assert.ok(calls.some((c) => c[0] === 'toast' && /Μόνο ανάγνωση/.test(c[1])), 'today\'s gate message');
  assert.strictEqual(ctxEl.style.display, undefined, '#wi-ctx untouched');
});

// ── 4. Keyboard dispatch ─────────────────────────────────────────────────
test('run(): nothing acts while v4 is not live (flag off / fallback board)', () => {
  const { W, A, calls } = world({ active: false, rootPresent: true, order: ['recE01', 'recE02'] }); fill(W);
  A.run('rowNext'); A.run('help'); A.run('search');
  eq(calls.filter((c) => c[0] !== 'toast'), []);
});

test('run(): ↑/↓ walk the drawn order by order id; / focuses search; Esc clears the search first', () => {
  const { W, A, calls } = world({ active: true, rootPresent: true, order: ['recE01', 'recE02', 'recE03'] }); fill(W);
  A.run('rowNext'); A.run('rowNext'); A.run('rowPrev');
  eq(calls.filter((c) => c[0] === 'focus').map((c) => c[1]), ['recE01', 'recE02', 'recE01']);
  A.run('search');
  assert.ok(calls.some((c) => c[0] === 'searchFocus'));
  W.WINTL.filter = 'abc';
  A.run('escape');
  assert.ok(calls.some((c) => c[0] === 'search' && c[1] === ''));
});

test('run(): N opens a new import only on an empty return; elsewhere it says why', () => {
  const { W, A, calls, ctx } = world({ active: true, rootPresent: true }); fill(W);
  let opened = null;
  ctx.openIntlEditWith = (id, f) => { opened = f; };
  W.WINTL.ui.v4Focus = 'recE01';            // matched pair → refused
  A.run('newImport');
  assert.strictEqual(opened, null);
  assert.ok(calls.some((c) => c[0] === 'toast' && /κενό γύρισμα/.test(c[1])));
  W.WINTL.ui.v4Focus = 'recE04';            // own group without import → empty return
  A.run('newImport');
  eq(opened, { Type: 'International', Direction: 'Import' });
});

test('run(): Q walks the queue in its order and skips items without a row', () => {
  const queue = [{ code: 'SOURCE_UNKNOWN', level: 'amber', rowKey: null }, { code: 'NO_TRUCK', level: 'red', rowKey: 'recE03' }, { code: 'EMPTY_RETURN', level: 'amber', rowKey: 'recE04' }];
  const { W, A, calls } = world({ active: true, rootPresent: true, queue }); fill(W);
  A.run('queueNext'); A.run('queueNext'); A.run('queueNext');
  eq(calls.filter((c) => c[0] === 'focus').map((c) => c[1]), ['recE03', 'recE04', 'recE03']);
});

// ── 5. The live keymap ───────────────────────────────────────────────────
test('KEYMAP is read in either shape (code → action, or action → code); E/I are never invented', () => {
  const { A, ctx } = world();
  const a = A._keyEntries();
  assert.ok(a.some((e) => e.combo === 'Shift+Slash' && e.action === 'help'));
  assert.ok(!a.some((e) => /Key[EI]$/.test(e.combo)));
  ctx.WI4.KEYMAP = { assign: 'KeyA', help: 'Shift+Slash' };
  eq(A._keyEntries(), [{ combo: 'KeyA', action: 'assign' }, { combo: 'Shift+Slash', action: 'help' }]);
  ctx.WI4.KEYMAP = [{ code: 'KeyD', action: 'date' }, { code: 'Slash', shift: true, action: 'help' }];
  eq(A._keyEntries(), [{ combo: 'KeyD', action: 'date' }, { combo: 'Shift+Slash', action: 'help' }]);
});

test('the relabel map keys still exist in today\'s code (a rename fails here)', () => {
  const { A } = world();
  const src = read('modules/weekly_intl.js');
  for (const k of Object.keys(A._RELABEL.menu)) assert.ok(src.includes(k), 'menu string gone: ' + k);
  for (const k of Object.keys(A._RELABEL.panelTitle)) assert.ok(src.includes("'" + k + "'"), 'panel title gone: ' + k);
  for (const k of Object.keys(A._RELABEL.panelButton)) assert.ok(src.includes('>' + k + '<'), 'panel button gone: ' + k);
});
