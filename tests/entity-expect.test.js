// T208 (ValueDriven 27/11/2026): the entity forms (clients, partners, drivers, trucks, trailers, workshops) send
// only the fields the user changed, with `_expect` = what the form showed for them.
//  1. Contract with the Worker: every label an entity form can send is one expectParse accepts (an unknown or
//     list label is a 400, which would block the save), from both source files.
//  2. saveEntityRecord itself, run in a vm with config.js, core/wi4-logic.js and core/entity.js and the network
//     stubbed: what reaches atSafePatch, and what the user sees on a 409.
// Run: node --test tests/entity-expect.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const W = read('worker/src/index.js');

// ── the Worker side, verbatim ──
const pick = (re, what) => { const m = W.match(re); assert.ok(m, `${what} not found in worker/src/index.js`); return m[0]; };
const wapi = new Function('__name',
  pick(/\nvar TABLES = \{[\s\S]*?\n\};\n/, 'TABLES')
  + pick(/\nfunction columnToLabel\(cfg\) \{[\s\S]*?\n\}\n/, 'columnToLabel')
  + pick(/\nfunction expectCanon\(cfg, label\) \{[\s\S]*?\n\}\n/, 'expectCanon')
  + pick(/\nvar EXPECT_MAX_LABELS = .*\n/, 'EXPECT_MAX_LABELS')
  + pick(/\nvar EXPECT_NON_SCALAR = .*\n/, 'EXPECT_NON_SCALAR')
  + pick(/\nfunction expectParse\(cfg, raw\) \{[\s\S]*?\n\}\n/, 'expectParse')
  + '\nreturn { TABLES, expectParse, EXPECT_MAX_LABELS };')(() => {});

// ── the front end, in one vm context ──
function load() {
  const calls = { patch: [], toast: [], warn: [], closed: 0, rendered: 0, logged: [] };
  const elements = {};
  const dummy = () => ({ value: '', textContent: '', disabled: false, style: {}, classList: { toggle() {}, add() {}, remove() {} } });
  const ctx = {
    console,
    document: {
      getElementById: (id) => elements[id] || (id.startsWith('ef_') && !id.startsWith('ef_save_') && !id.startsWith('ef_note_') ? null : dummy()),
      addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
      activeElement: dummy(),
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {}, location: { search: '', hostname: 'localhost' },
    setTimeout, clearTimeout, setInterval, clearInterval,
    BroadcastChannel: class { postMessage() {} close() {} },
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['config.js', 'core/wi4-logic.js', 'core/entity.js']) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, {
    atSafePatch: async (tableId, recId, fields, opts) => { calls.patch.push({ tableId, recId, fields, opts }); return ctx.__answer || { id: recId, fields }; },
    atPatch: async () => { throw new Error('saveEntityRecord must go through atSafePatch'); },
    atCreate: async () => ({ id: 'recNEW' }),
    invalidateCache() {}, closeModal() { calls.closed++; },
    toast: (m) => calls.toast.push(m), showErrorToast: (m, kind) => calls.warn.push({ m, kind }),
    reportError: (m, e) => { throw e; }, logError: (e, where) => calls.logged.push(`${where}: ${e.message}`),
    renderEntity: async () => { calls.rendered++; }, can: () => 'full',
  });
  return { ctx, calls, elements, dummy };
}

const CLIENT = {
  'Company Name': 'ΑΛΦΑ ΑΕ', 'Contact Person': 'Γιάννης', Phone: '2310 000000', Email: 'a@alfa.gr',
  Adress: 'Οδός 1', City: 'Βέροια', Country: 'Greece', 'VAT Number': '099999999', 'Payment Terms Days': 30,
};

// Opens the edit form on a client the list holds, filling every input with what the form would show.
function openClient(env, fields = CLIENT) {
  const { ctx, elements, dummy } = env;
  vm.runInContext(`_entityState.clients = { records: [{ id: 'recCLIENT0001', fields: ${JSON.stringify(fields)} }], filtered: [], filters: {} };`, ctx);
  ctx.openEntityEdit = ctx.openEntityEdit; // declared in entity.js
  vm.runInContext("buildEntityModal = function () {}; openEntityEdit('clients', 'recCLIENT0001');", ctx);
  const cfg = vm.runInContext('ENTITY_CONFIG.clients', ctx);
  for (const sec of cfg.formFields) for (const f of sec.fields) {
    const el = dummy();
    el.value = fields[f.f] == null ? '' : String(fields[f.f]);
    elements['ef_' + f.f.replace(/\s/g, '_')] = el;
  }
  return cfg;
}
const input = (env, label) => env.elements['ef_' + label.replace(/\s/g, '_')];
const save = (env) => vm.runInContext("saveEntityRecord('clients', 'recCLIENT0001')", env.ctx);

test('contract: every label an entity form sends is accepted by the Worker\'s expectParse (no 400 that blocks a save)', () => {
  const { ctx } = load();
  const cfgs = vm.runInContext('ENTITY_CONFIG', ctx);
  let n = 0;
  for (const [key, cfg] of Object.entries(cfgs)) {
    const wcfg = wapi.TABLES[cfg.tableId];
    assert.ok(wcfg, `${key}: table ${cfg.tableId} not in the Worker's TABLES`);
    for (const f of cfg.formFields.flatMap((s) => s.fields)) {
      if (f.disabled || f.type === 'list') continue;
      const r = wapi.expectParse(wcfg, { [f.f]: null });
      assert.ok(!r.error, `${key} «${f.f}»: ${r.error}`);
      n++;
    }
  }
  assert.ok(n >= 50, `only ${n} labels checked: the extraction is broken`);
});

test('contract: a list field is refused by the Worker, which is why the form never puts one in _expect', () => {
  const r = wapi.expectParse(wapi.TABLES.tblMiFxbm9ky8PCQi, { Aliases: [] });
  assert.match(String(r.error), /list\/json/);
});

test('one field changed → only that field is written, _expect holds what the form showed', async () => {
  const env = load(); openClient(env);
  input(env, 'Phone').value = '2310 111111';
  await save(env);
  assert.strictEqual(env.calls.patch.length, 1);
  const p = env.calls.patch[0];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.fields)), { Phone: '2310 111111' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.opts)), { expect: { Phone: '2310 000000' } });
  assert.strictEqual(env.calls.closed, 1);
});

test('a number shown as text is not a change (30 vs «30»), a trimmed space is not a change', async () => {
  const env = load(); openClient(env);
  input(env, 'Company Name').value = 'ΑΛΦΑ ΑΕ ';
  input(env, 'Email').value = 'b@alfa.gr';
  await save(env);
  assert.deepStrictEqual(Object.keys(env.calls.patch[0].fields), ['Email']);
});

test('nothing changed → no write at all, the form closes with «Δεν άλλαξε τίποτα»', async () => {
  const env = load(); openClient(env);
  await save(env);
  assert.strictEqual(env.calls.patch.length, 0);
  assert.deepStrictEqual(env.calls.toast, ['Δεν άλλαξε τίποτα']);
  assert.strictEqual(env.calls.closed, 1);
});

test('a field emptied → null is written and checked against what was there', async () => {
  const env = load(); openClient(env);
  input(env, 'Email').value = '';
  await save(env);
  const p = env.calls.patch[0];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.fields)), { Email: null });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.opts)), { expect: { Email: 'a@alfa.gr' } });
});

test('the comparison is with what the form SHOWED, even when the list was read again while it was open', async () => {
  const env = load(); openClient(env);
  vm.runInContext("_entityState.clients.records = [{ id: 'recCLIENT0001', fields: Object.assign({}, _entityState.clients.records[0].fields, { Phone: '2310 999999' }) }];", env.ctx);
  input(env, 'Phone').value = '2310 111111';
  await save(env);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(env.calls.patch[0].opts)), { expect: { Phone: '2310 000000' } });
});

test('409 → nothing closes, the button comes back, a warning names the field and what is there now, the list is read again', async () => {
  const env = load(); openClient(env);
  env.ctx.__answer = { conflict: true, fields: ['Phone'], by: 'user', at: null, current: { Phone: '2310 999999' } };
  input(env, 'Phone').value = '2310 111111';
  await save(env);
  assert.strictEqual(env.calls.closed, 0);
  assert.strictEqual(env.calls.toast.length, 0, 'no «ενημερώθηκε» toast');
  assert.strictEqual(env.calls.warn.length, 1);
  assert.strictEqual(env.calls.warn[0].kind, 'warn');
  assert.match(env.calls.warn[0].m, /Δεν αποθηκεύτηκε τίποτα/);
  assert.match(env.calls.warn[0].m, /Τηλέφωνο: «2310 999999»/);
  assert.strictEqual(env.calls.rendered, 1);
});

test('409 on a link field names the field, never a record id', async () => {
  const env = load(); openClient(env);
  env.ctx.__answer = { conflict: true, fields: ['Country'], current: { Country: ['recABCDEFGH12'] } };
  input(env, 'Country').value = 'Cyprus';
  await save(env);
  assert.doesNotMatch(env.calls.warn[0].m, /rec[A-Z]/);
});

test('more than 12 changes → all are written, the first 12 are checked (the Worker takes at most 12)', async () => {
  const many = {}; for (let i = 0; i < 14; i++) many['F' + i] = 'old';
  const env = load();
  const cfg = vm.runInContext('ENTITY_CONFIG.clients', env.ctx);
  cfg.formFields.push({ fields: Object.keys(many).map((f) => ({ f, label: f })) });
  openClient(env, Object.assign({}, CLIENT, many));
  for (const f of Object.keys(many)) input(env, f).value = 'new';
  await save(env);
  const p = env.calls.patch[0];
  assert.strictEqual(Object.keys(p.fields).length, 14);
  assert.strictEqual(Object.keys(p.opts.expect).length, wapi.EXPECT_MAX_LABELS);
});

test('without WI4.sameValue the form is sent whole, unchecked, and that is logged', async () => {
  const env = load(); openClient(env);
  env.ctx.WI4 = undefined;
  input(env, 'Phone').value = '2310 111111';
  await save(env);
  const p = env.calls.patch[0];
  assert.ok(Object.keys(p.fields).length > 1, 'whole form, as before T208');
  assert.strictEqual(p.opts, undefined);
  assert.strictEqual(env.calls.logged.length, 1);
});
