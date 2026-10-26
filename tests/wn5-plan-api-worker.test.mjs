// node --test tests/wn5-plan-api-worker.test.mjs
// National v5 F4α Task T1 — planFetch against the REAL Worker source (tests/critics/wn5-worker-harness.mjs):
// the kinds the screen reacts to come from the Worker's real statuses and codes, and the message is the Worker's
// own text, read here from worker/src/index.js — never retyped (principle 3). Plus the drift test: the client's
// DRY_ROUTES / REQUEST_ROUTES are the Worker's PLAN_ROUTES rows with dryRun:true and the 072 RPCs whose key list
// holds request_id, so a new route or a new creation cannot be forgotten on one side.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { planSandbox, outcome, ROOT, json } from './wn5-plan-sandbox.mjs';
import { makeWorker } from './critics/wn5-worker-harness.mjs';

const SRC = fs.readFileSync(path.join(ROOT, 'worker/src/index.js'), 'utf8');
const SQL = fs.readFileSync(path.join(ROOT, 'worker/migrations/072_plan_functions.sql'), 'utf8');
const RULE_TEXT = (() => {
  const m = /const PLAN_RULE_TEXT = (\{[\s\S]*?\n\});/.exec(SRC);
  assert.ok(m, 'PLAN_RULE_TEXT not found in worker/src/index.js');
  return vm.runInNewContext('(' + m[1] + ')');
})();
const CLOSED_TEXT = (/"writes_closed", "([^"]+)"/.exec(SRC) || [])[1];
// The status the live Worker gives an answer whose write may be kept (plan_unknown): read, never retyped.
const NO_RESEND = Number((/var PLAN_NO_RESEND = (\d+);/.exec(SRC) || [])[1]);
const RID = 'bbbbbbbb-0000-4000-8000-000000000002';
// Only /plan/* goes to the Worker: logError's POST /app-errors (fire-and-forget) is answered here, or it would
// overlap the next request on the one-request-at-a-time harness.
const through = (w) => planSandbox((url, method, init) => (new URL(url).pathname.startsWith('/plan/')
  ? w.fetch(new Request(url, { method, headers: init.headers, body: init.body }))
  : json(201, {})));
const pgRule = (code, detail = '') => ({ status: 400, body: { code: 'P0001', details: null, hint: `plan:${code}`, message: `plan rule broken: ${code}:${detail}` } });

test('F4α-T1: real Worker, writes closed: POST /plan/orders → kind closed, message = the Worker text, one fetch, zero DB calls', async () => {
  assert.ok(CLOSED_TEXT, 'the writes_closed text was not found in worker/src/index.js');
  const w = makeWorker({ role: 'dispatcher' });
  const s = through(w);
  const r = await outcome(s, `planFetch('POST', '/plan/orders', { body: { orders: [] }, requestId: '${RID}' })`);
  assert.deepStrictEqual({ status: r.status, kind: r.kind, code: r.code, m: r.m }, { status: 409, kind: 'closed', code: 'writes_closed', m: CLOSED_TEXT });
  assert.strictEqual(s.plan().length, 1);
  assert.strictEqual(w.calls.length, 0, 'the closed switch let a write reach the DB');
});

test("F4α-T1: real Worker: dry run move passes the switch; PLAN_RULE 422 → kind 'refusal' with the Worker's PLAN_RULE_TEXT message", async () => {
  assert.strictEqual(typeof RULE_TEXT.piece_split, 'string', 'piece_split has no text in PLAN_RULE_TEXT');
  const w = makeWorker({ role: 'dispatcher', db: (fn) => (fn === 'plan_move_pieces' ? pgRule('piece_split', '4001') : undefined) });
  const s = through(w);
  const r = await outcome(s, "planFetch('POST', '/plan/move', { body: { from: { piece_ids: [4001] }, target: { wait: true } }, dry: true })");
  assert.deepStrictEqual({ status: r.status, type: r.type, kind: r.kind, code: r.code, m: r.m },
    { status: 422, type: 'PLAN_RULE', kind: 'refusal', code: 'piece_split', m: `${RULE_TEXT.piece_split} (4001)` });
  assert.deepStrictEqual(w.calls.map((c) => [c.fn, c.p.dry_run, c.p_role]), [['plan_move_pieces', true, 'dispatcher']]);
  assert.strictEqual(s.plan().length, 1);
});

test('F4α-T1: real Worker: 428 need_token, 422 stale_confirm, 422 request_reused, 409 busy_retry, 503 slow/schema_behind, 500 plan_unknown map to the right kinds', async () => {
  const MOVE = "planFetch('POST', '/plan/move', { body: { from: { piece_ids: [4001] }, target: { wait: true }, confirm_token: 'x' } })";
  const CREATE = `planFetch('POST', '/plan/orders', { body: { orders: [] }, requestId: '${RID}' })`;
  const cases = [
    ['need_token', MOVE, () => pgRule('need_token'), 428, 'need_token', false],
    ['stale_confirm', MOVE, () => pgRule('stale_confirm'), 422, 'stale', false],
    ['request_reused', CREATE, () => pgRule('request_reused', RID), 422, 'reused', false],
    ['busy_retry', CREATE, () => ({ status: 500, body: { code: '40P01', message: 'deadlock detected' } }), 409, 'busy', false],
    ['slow', CREATE, () => ({ status: 500, body: { code: '57014', message: 'canceling statement due to statement timeout' } }), 503, 'slow', false],
    ['schema_behind', CREATE, () => ({ status: 404, body: { code: 'PGRST202', message: 'Could not find the function public.plan_orders_create(p, p_actor, p_role) in the schema cache' } }), 503, 'schema', false],
    ['plan_unknown', CREATE, () => { throw new Error('socket hang up'); }, NO_RESEND, 'unknown', true],
  ];
  assert.ok(NO_RESEND >= 400, 'PLAN_NO_RESEND not found in worker/src/index.js');
  for (const [code, call, db, status, kind, maybeSaved] of cases) {
    const w = makeWorker({ writesOpen: true, role: 'dispatcher', db });
    const s = through(w);
    const r = await outcome(s, call);
    assert.deepStrictEqual({ status: r.status, kind: r.kind, maybeSaved: r.maybeSaved }, { status, kind, maybeSaved }, `${code}: ${JSON.stringify(r)}`);
    assert.strictEqual(s.plan().length, 1, `${code}: fetches ${s.plan().length}`);
    assert.strictEqual(w.calls.length, 1, `${code}: RPC calls ${w.calls.length}`);
  }
});

function planRoutes() {
  const m = /var PLAN_ROUTES = \[([\s\S]*?)\n\];/.exec(SRC);
  assert.ok(m, 'PLAN_ROUTES not found in worker/src/index.js');
  return m[1].split('\n').filter((l) => /method:/.test(l)).map((l) => ({
    method: /method: "(\w+)"/.exec(l)[1],
    path: /re: \/\^(.*?)\$\//.exec(l)[1].replace(/\\\//g, '/').replace(/\(\\d\+\)/g, ':id'),
    rpc: (/rpc: "(\w+)"/.exec(l) || [])[1] || null,
    dry: /dryRun: true/.test(l),
    migration: (/migration: "(\w+)"/.exec(l) || [])[1] || null,
  }));
}
// The 072 functions whose top-level key list (plan_h_keys(p, …, 'p')) holds request_id: the creations.
function requestRpcs() {
  return SQL.split('CREATE FUNCTION public.').slice(1).map((chunk) => {
    const name = /^(\w+)/.exec(chunk)[1];
    const k = /perform plan_h_keys\(p, array\[([^\]]*)\], 'p'\)/.exec(chunk);
    return k && /'request_id'/.test(k[1]) ? name : null;
  }).filter(Boolean).sort();
}

test('F4α-T1: DRY_ROUTES equals the PLAN_ROUTES rows with dryRun:true; REQUEST_ROUTES equals the 072 plan_h_keys lists that contain request_id', () => {
  const s = planSandbox(() => { throw new Error('no fetch here'); });
  const client = JSON.parse(s.run('JSON.stringify({ dry: PlanApi.DRY_ROUTES, req: PlanApi.REQUEST_ROUTES })'));
  const routes = planRoutes();
  assert.ok(routes.length >= 15, `PLAN_ROUTES parser read ${routes.length} rows`);
  // The three 072b rows are T25's (it widens DRY_ROUTES / REQUEST_ROUTES and this test with them); every other
  // dryRun row must be in the client, so a new 072 route still fails here.
  const r072b = routes.filter((r) => r.dry && r.migration === '072b').map((r) => `${r.method} ${r.path}`).sort();
  assert.deepStrictEqual(r072b, ['PATCH /plan/segments/:id', 'POST /plan/rt/:id/handover', 'POST /plan/segments/:id/remove'],
    'the 072b dryRun rows changed — T25 must learn them');
  assert.deepStrictEqual([...client.dry].sort(), routes.filter((r) => r.dry && r.migration !== '072b').map((r) => `${r.method} ${r.path}`).sort());
  const rpcs = requestRpcs();
  assert.deepStrictEqual(rpcs, ['plan_local_loading', 'plan_orders_create', 'plan_split_piece'], '072 has a creation the client does not know');
  assert.deepStrictEqual([...client.req].sort(), rpcs.map((fn) => { const r = routes.find((x) => x.rpc === fn); assert.ok(r, fn + ' has no route'); return `${r.method} ${r.path}`; }).sort());
});
