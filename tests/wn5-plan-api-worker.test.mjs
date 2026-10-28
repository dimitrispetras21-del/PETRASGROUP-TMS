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
// The functions whose top-level key list (plan_h_keys(p, …, 'p')) holds request_id: the creations. One chunk per
// CREATE FUNCTION, so a key list is never read across into the next function.
function requestRpcs(sql) {
  return sql.split('CREATE FUNCTION public.').slice(1).map((chunk) => {
    const name = /^(\w+)/.exec(chunk)[1];
    const k = /perform plan_h_keys\(p, array\[([^\]]*)\], 'p'\)/.exec(chunk);
    return k && /'request_id'/.test(k[1]) ? name : null;
  }).filter(Boolean).sort();
}

// F4α-T1, widened by T25 (072b): the same drift rule over 072 AND the executed 072b. DRY_ROUTES = the PLAN_ROUTES
// rows with dryRun:true; REQUEST_ROUTES = the routes whose RPC accepts request_id in its plan_h_keys list.
test('F4α-T25: DRY_ROUTES / REQUEST_ROUTES = PLAN_ROUTES dryRun rows / the request_id RPCs of 072 + 072b + 077', (t) => {
  const F072B = path.join(ROOT, 'worker/migrations/072b_plan_vehicle_segments.sql');
  if (!fs.existsSync(F072B) || !/resource: "handover"/.test(SRC)) { t.todo('072b not in tree (SQL or Worker routes)'); return; }
  const s = planSandbox(() => { throw new Error('no fetch here'); });
  const client = JSON.parse(s.run('JSON.stringify({ dry: PlanApi.DRY_ROUTES, req: PlanApi.REQUEST_ROUTES })'));
  const routes = planRoutes();
  assert.ok(routes.length >= 18, `PLAN_ROUTES parser read ${routes.length} rows`);
  assert.deepStrictEqual([...client.dry].sort(), routes.filter((r) => r.dry).map((r) => `${r.method} ${r.path}`).sort());
  // 077 patches plan_order_update's key list in place (a hunk, its text in a dollar quote): its replacement names the
  // function the hunk belongs to, so it is read as one more chunk (F21, the edit takes request_id)
  const F077 = ['drafts/077_plan_order_edit.sql', '077_plan_order_edit.sql'].map((f) => path.join(ROOT, 'worker/migrations', f)).find((f) => fs.existsSync(f));
  assert.ok(F077, '077 not in tree: the client lists PATCH /plan/orders/:id as a request_id route');
  const h077 = /h_2b CONSTANT text := \$h\$([\s\S]*?)\$h\$;/.exec(fs.readFileSync(F077, 'utf8'));
  assert.ok(h077 && /plan_h_keys\(p, array\[[^\]]*'request_id'[^\]]*\], 'p'\)/.test(h077[1]), '077 h_2b: plan_order_update takes request_id');
  const rpcs = requestRpcs(SQL + '\n' + fs.readFileSync(F072B, 'utf8') + '\nCREATE FUNCTION public.plan_order_update(\n' + h077[1]);
  assert.deepStrictEqual(rpcs, ['plan_local_loading', 'plan_order_update', 'plan_orders_create', 'plan_seg_change', 'plan_split_piece'], '072 / 072b / 077 has a request_id RPC the client does not know');
  assert.deepStrictEqual([...client.req].sort(), rpcs.map((fn) => { const r = routes.find((x) => x.rpc === fn); assert.ok(r, fn + ' has no route'); return `${r.method} ${r.path}`; }).sort());
});
