// node --test tests/f5-natv5-kpi.test.js
// F5 stream (d4), Ε15: NatV5Kpi (modules/performance.js) — the one reader of v5 national state for the KPI screens.
// The object is cut verbatim from the module and run in a vm with planFetch / PlanConfig stubbed to the contract of
// GET /plan/nat-state (id → "missing" | {executed, late, planned, …}). The screens themselves: tests/critics/f5-metrics-rig.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const S = fs.readFileSync(path.join(__dirname, '..', 'modules', 'performance.js'), 'utf8');
const src = (S.match(/const NatV5Kpi = \{[\s\S]*?\n\};/) || [])[0];
if (!src) throw new Error('NatV5Kpi not found in modules/performance.js');

function load({ state = 'after', answer, pc = true } = {}) {
  const calls = [];
  const logged = [];
  const ctx = {
    logError: (e, where) => logged.push(where),
    planFetch: async (m, p, opts) => {
      calls.push({ m, p, opts });
      if (answer instanceof Error) throw answer;
      const ids = new URLSearchParams(p.split('?')[1]).get('nat_order_ids').split(',');
      return Object.fromEntries(ids.map((id) => [id, answer ? answer(id) : 'missing']));
    },
  };
  if (pc) ctx.PlanConfig = { load: async () => ({ state, cutoverDay: state === 'after' ? '2026-10-31' : null }) };
  vm.runInNewContext(src + '\nthis.K = NatV5Kpi;', ctx);
  return { K: ctx.K, calls, logged };
}
// Objects built inside the vm have the vm's prototypes: compare them as JSON.
const same = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
const rec = (no) => ({ id: 'rec' + no, fields: { 'Order No': no } });
const s5 = (o) => Object.assign({ n_pieces: 1, n_executed: 1, executed: true, planned: true, late: false, hub_side: null, carriers: [] }, o);

test('before L: no request at all', async () => {
  const { K, calls } = load({ state: 'before' });
  const r = await K.read([rec(1), rec(2)]);
  assert.strictEqual(r.state, 'before');
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(r.byNo.size, 0);
  assert.strictEqual(r.failed, false);
});

test('no PlanConfig: unknown (logged once), the read still runs', async () => {
  const { K, calls, logged } = load({ pc: false, answer: () => s5() });
  same(await K.state(), { state: 'unknown', cutoverDay: null });
  await K.state();
  assert.deepStrictEqual(logged, ['NatV5Kpi.state']);
  const r = await K.read([rec(7)]);
  assert.strictEqual(r.state, 'unknown');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(r.byNo.size, 1);
});

test('after L: "missing" stays old model; v5Of pairs records with their state; bad ids are skipped', async () => {
  const { K, calls } = load({ answer: (id) => (id === '2' ? s5({ late: true }) : 'missing') });
  const recs = [rec(1), rec(2), rec(2), { id: 'x', fields: { 'Order No': 'abc' } }, { id: 'y', fields: {} }];
  const r = await K.read(recs);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].p, '/plan/nat-state?nat_order_ids=1,2');
  same(calls[0].opts, { designed: ['no_route'] });
  same([...r.byNo.keys()], [2]);
  const v = K.v5Of(recs, r);
  same(v.map((x) => x.rec.id), ['rec2', 'rec2']);
  assert.strictEqual(v[0].s.late, true);
});

test('more than 500 ids: one GET per 500', async () => {
  const { K, calls } = load();
  await K.read(Array.from({ length: 1201 }, (_, i) => rec(i + 1)));
  same(calls.map((c) => c.p.split('=')[1].split(',').length), [500, 500, 201]);
});

test('404 no_route (before Worker deploy 1): no v5 order, not a failure, not logged', async () => {
  const e = Object.assign(new Error('no_route'), { name: 'PlanError', code: 'no_route', status: 404 });
  const { K, logged } = load({ answer: e });
  const r = await K.read([rec(1)]);
  assert.strictEqual(r.failed, false);
  assert.strictEqual(r.byNo.size, 0);
  assert.deepStrictEqual(logged, []);
});

test('a refusal or a contract fault fails loudly, never «old model»', async () => {
  const refused = load({ answer: Object.assign(new Error('x'), { name: 'PlanError', code: 'server', status: 500 }) });
  const r1 = await refused.K.read([rec(1)]);
  assert.strictEqual(r1.failed, true);
  assert.deepStrictEqual(refused.logged, []);   // planFetch logs its own PlanError

  const noKey = load({ answer: (id) => (id === '1' ? undefined : 'missing') });
  const r2 = await noKey.K.read([rec(1), rec(2)]);
  assert.strictEqual(r2.failed, true);
  assert.strictEqual(r2.byNo.size, 0);
  assert.deepStrictEqual(noKey.logged, ['NatV5Kpi.read']);

  const badShape = load({ answer: () => ({ executed: 'yes', late: false }) });
  const r3 = await badShape.K.read([rec(1)]);
  assert.strictEqual(r3.failed, true);
});
