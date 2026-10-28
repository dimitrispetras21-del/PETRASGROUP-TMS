// node --test tests/wn5-plan-api.test.mjs
// National v5 F4α Task T1 — core/plan-api.js (planFetch), the ONE client of /plan/* (F2 decision 44):
//   - a /plan/* call is sent ONCE whatever the answer (core/api.js _atRetry re-sends every 5xx and network drop;
//     a 500 plan_unknown may have been SAVED, so a resend could write twice);
//   - nothing is queued offline (the offline queue replays writes from localStorage later);
//   - the message shown is error.message of the body (no Greek copy in the client, principle 3);
//   - request_id / dry_run only where the Worker and 072 take them; the id lives in memory only;
//   - designed answers (409/422/428/403) are not app errors; 5xx/400/404 are logged once.
// The REAL core files run in the shared vm sandbox (tests/wn5-plan-sandbox.mjs) with a scripted fetch.
import { test } from 'node:test';
import assert from 'node:assert';
import { planSandbox, outcome, json } from './wn5-plan-sandbox.mjs';

const SENT = 'rig sentinel: the client shows the body message as is';
const answer = (status, type, code) => () => json(status, { error: { type, code, message: `${SENT} ${code}` } });
const RID = 'aaaaaaaa-0000-4000-8000-000000000001';
const WRITE = `planFetch('POST', '/plan/orders', { body: { orders: [] }, requestId: '${RID}' })`;
const READ = `planFetch('GET', '/plan/board?week=2026-10-10')`;
const logged = (s) => s.errors.filter((e) => String(e.ctx || '').startsWith('planFetch'));
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('F4α-T1: 500 plan_unknown on a write → exactly ONE fetch, kind unknown, maybeSaved, message = body message', async () => {
  const s = planSandbox(answer(500, 'SERVER', 'plan_unknown'));
  const r = await outcome(s, WRITE);
  assert.strictEqual(s.plan().length, 1, `fetches ${s.plan().length}`);
  assert.deepStrictEqual({ ok: r.ok, kind: r.kind, code: r.code, maybeSaved: r.maybeSaved, m: r.m },
    { ok: false, kind: 'unknown', code: 'plan_unknown', maybeSaved: true, m: `${SENT} plan_unknown` });
  assert.strictEqual(logged(s).length, 1, JSON.stringify(s.errors));
});

test('F4α-T1: 503 slow / 409 busy_retry / network throw on a write → one fetch each', async () => {
  const cases = [
    [answer(503, 'SERVER', 'slow'), 'slow', false],
    [answer(409, 'PLAN_RULE', 'busy_retry'), 'busy', false],
    [() => { throw new TypeError('Failed to fetch'); }, 'unknown', true],
    // the live Worker's PLAN_NO_RESEND status for a maybe-kept write: read by code, never as a refusal
    [answer(422, 'OUTCOME_UNKNOWN', 'plan_unknown'), 'unknown', true],
    [answer(422, 'SERVER', 'amount_leak'), 'leak', true],
  ];
  for (const [script, kind, maybeSaved] of cases) {
    const s = planSandbox(script);
    const r = await outcome(s, WRITE);
    assert.strictEqual(s.plan().length, 1, `${kind}: fetches ${s.plan().length}`);
    assert.strictEqual(r.kind, kind, JSON.stringify(r));
    assert.strictEqual(r.maybeSaved, maybeSaved, JSON.stringify(r));
  }
});

test('F4α-T1: GET board 500 plan_failed → one fetch (no read retry either)', async () => {
  const s = planSandbox(answer(500, 'SERVER', 'plan_failed'));
  const r = await outcome(s, READ);
  assert.strictEqual(s.plan().length, 1, `fetches ${s.plan().length}`);
  assert.deepStrictEqual({ kind: r.kind, write: r.write, maybeSaved: r.maybeSaved, m: r.m }, { kind: 'failed', write: false, maybeSaved: false, m: `${SENT} plan_failed` });
  assert.strictEqual(logged(s).length, 1);
});

test("F4α-T1: abort/timeout on a write → kind 'unknown' (maybe saved), on a read → 'failed'", async () => {
  const hang = (url, m, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('The operation was aborted'))));
  for (const [call, kind, maybeSaved] of [
    [`planFetch('POST', '/plan/orders', { body: { orders: [] }, requestId: '${RID}', timeoutMs: 6000 })`, 'unknown', true],
    ["planFetch('GET', '/plan/board?week=2026-10-10', { timeoutMs: 6000 })", 'failed', false],
  ]) {
    const s = planSandbox(hang);
    const p = outcome(s, call);
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(s.fire(6000), 1, 'the fetch timeout was armed once');
    const r = await p;
    assert.strictEqual(s.plan().length, 1);
    assert.deepStrictEqual({ kind: r.kind, maybeSaved: r.maybeSaved }, { kind, maybeSaved }, JSON.stringify(r));
  }
});

test("F4α-T1: offline → kind 'offline', zero fetch, nothing in tms_offline_queue", async () => {
  const s = planSandbox(() => json(200, { ok: true }), { offline: true });
  const r = await outcome(s, WRITE);
  assert.strictEqual(r.kind, 'offline', JSON.stringify(r));
  assert.strictEqual(s.plan().length, 0, 'a fetch was sent while offline');
  assert.strictEqual(s.store.get('tms_offline_queue'), undefined, 'the write was queued for a later replay');
});

test('F4α-T1: body numbers stay JSON numbers; non-finite → client_not_finite, zero fetch', async () => {
  const s = planSandbox(() => json(200, { ok: true, op: 'plan_put_pieces', ids: {}, warnings: [], notice_ids: [] }));
  await outcome(s, "planFetch('POST', '/plan/legs', { body: { pallets: 12, price: 450.5, temperature_c: -1, n: { x: 3 } } })");
  assert.strictEqual(s.plan()[0].body, '{"pallets":12,"price":450.5,"temperature_c":-1,"n":{"x":3}}');
  for (const bad of ['{ pallets: Infinity }', '{ n: { x: NaN } }', '{ list: [1, -Infinity] }']) {
    const t = planSandbox(() => json(200, { ok: true }));
    const r = await outcome(t, `planFetch('POST', '/plan/legs', { body: ${bad} })`);
    assert.strictEqual(r.code, 'client_not_finite', bad);
    assert.strictEqual(t.plan().length, 0, bad);
  }
});

test('F4α-T1: headers are exactly Authorization + Content-Type', async () => {
  const s = planSandbox(() => json(200, { week: '2026-10-10', cycles: [], waiting: [], hub: [], notices: [] }));
  await outcome(s, "planFetch('POST', '/plan/move', { body: { from: { piece_ids: [1] }, target: { wait: true } }, dry: true })");
  await outcome(s, READ);
  const [post, get] = s.plan();
  assert.deepStrictEqual(Object.keys(post.headers).sort(), ['Authorization', 'Content-Type']);
  assert.strictEqual(post.headers.Authorization, 'Bearer test.jwt.not-real');
  assert.strictEqual(post.headers['Content-Type'], 'application/json');
  assert.deepStrictEqual(Object.keys(get.headers), ['Authorization'], 'a GET carries no body and no Content-Type');
});

test('F4α-T1: requestId only on REQUEST_ROUTES (else client_request_route, zero fetch); dry only on DRY_ROUTES', async () => {
  const refused = [
    [`planFetch('POST', '/plan/move', { body: {}, requestId: '${RID}' })`, 'client_request_route'],
    ["planFetch('POST', '/plan/orders', { body: {}, dry: true })", 'client_dry_route'],
    [`planFetch('POST', '/plan/orders', { body: { request_id: '${RID}' } })`, 'client_body_key'],
    ["planFetch('POST', '/plan/move', { body: { dry_run: true } })", 'client_body_key'],
    ["planFetch('POST', '/plan/orders', { body: {}, requestId: 'not-a-uuid' })", 'client_request_id'],
    ["planFetch('DELETE', '/plan/orders/1')", 'client_bad_call'],
  ];
  for (const [call, code] of refused) {
    const s = planSandbox(() => json(200, { ok: true }));
    const r = await outcome(s, call);
    assert.strictEqual(r.code, code, call + ' → ' + JSON.stringify(r));
    assert.strictEqual(s.plan().length, 0, call);
  }
  const s = planSandbox(() => json(200, { ok: true }));
  await outcome(s, "planFetch('POST', '/plan/move', { body: { from: { piece_ids: [1] } }, dry: true })");
  await outcome(s, `planFetch('POST', '/plan/orders', { body: { orders: [] }, requestId: '${RID}' })`);
  assert.strictEqual(JSON.parse(s.plan()[0].body).dry_run, true);
  assert.strictEqual(JSON.parse(s.plan()[1].body).request_id, RID);
  assert.deepStrictEqual(JSON.parse(s.run('JSON.stringify(PlanApi.DRY_ROUTES)')),
    ['POST /plan/move', 'PATCH /plan/rt/:id', 'POST /plan/rt/:id/clear', 'POST /plan/delete',
      // T25: the three 072b routes (live 26/10); their drift to PLAN_ROUTES is held by tests/wn5-plan-api-worker.test.mjs
      'POST /plan/rt/:id/handover', 'PATCH /plan/segments/:id', 'POST /plan/segments/:id/remove']);
  assert.strictEqual(s.run("PlanApi.routeOf('patch', '/plan/rt/123?x=1')"), 'PATCH /plan/rt/:id');
});

test('F4α-T1: slot(): same id until confirm(); new id after confirm(); nothing in sessionStorage/localStorage/history', async () => {
  const s = planSandbox(() => json(200, { ok: true }));
  const r = JSON.parse(s.run(`(() => {
    const sl = PlanApi.slot();
    const a = sl.id, b = sl.id;
    sl.confirm();
    const c = sl.id;
    sl.close();
    let closed = null; try { sl.id; } catch (e) { closed = e.code; }
    return JSON.stringify({ a, b, c, closed });
  })()`));
  assert.ok(UUID4.test(r.a), r.a);
  assert.strictEqual(r.a, r.b, 'the id changed without a confirmed 200');
  assert.notStrictEqual(r.c, r.a, 'confirm() must mint the next id');
  assert.strictEqual(r.closed, 'client_slot_closed');
  assert.strictEqual(s.session.size, 0, 'something went to sessionStorage');
  assert.ok(![...s.store.values()].some((v) => v.includes(r.a) || v.includes(r.c)), 'the request id reached localStorage');
});

test('F4α-T1: designed kinds are not logged; 5xx/400/404 and the Origin string 403 logged once; opts.designed silences only its codes', async () => {
  const designed = [[409, 'WRITES_CLOSED', 'writes_closed'], [409, 'PLAN_RULE', 'busy_retry'], [422, 'PLAN_RULE', 'truck_busy'],
    [422, 'PLAN_RULE', 'stale_confirm'], [422, 'PLAN_RULE', 'request_reused'], [428, 'PLAN_RULE', 'need_token'], [403, 'FORBIDDEN', 'forbidden']];
  for (const [st, type, code] of designed) {
    const s = planSandbox(answer(st, type, code));
    const r = await outcome(s, "planFetch('POST', '/plan/move', { body: {} })");
    assert.strictEqual(r.status, st);
    assert.strictEqual(logged(s).length, 0, `${code} was logged as an app error`);
  }
  for (const [st, type, code] of [[500, 'SERVER', 'plan_failed'], [503, 'SCHEMA_BEHIND', 'schema_behind'], [400, 'BAD_REQUEST', 'bad_input'], [404, 'NOT_FOUND', 'no_route']]) {
    const s = planSandbox(answer(st, type, code));
    await outcome(s, "planFetch('POST', '/plan/move', { body: {} })");
    assert.strictEqual(logged(s).length, 1, `${code}: ${JSON.stringify(s.errors)}`);
    assert.strictEqual(logged(s)[0].ctx, 'planFetch POST /plan/move');
  }
  // The Origin gate's string 403 is a configuration fault (a new domain), not a role: logged, the client's own words
  const o = planSandbox(() => new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { 'content-type': 'application/json' } }));
  const ro = await outcome(o, "planFetch('POST', '/plan/move', { body: {} })");
  assert.deepStrictEqual({ kind: ro.kind, code: ro.code, logged: logged(o).length }, { kind: 'client', code: 'origin', logged: 1 });
  // opts.designed (PlanIds.load and the missing GET /plan/lookups, Ε-2): only the named code goes unlogged
  const q = planSandbox(answer(404, 'NOT_FOUND', 'no_route'));
  await outcome(q, "planFetch('GET', '/plan/lookups', { designed: ['no_route'] })");
  assert.strictEqual(logged(q).length, 0, 'a no_route the caller named as designed was logged');
  const q2 = planSandbox(answer(400, 'BAD_REQUEST', 'bad_input'));
  await outcome(q2, "planFetch('GET', '/plan/lookups', { designed: ['no_route'] })");
  assert.strictEqual(logged(q2).length, 1, 'opts.designed silenced another code');
});

test("F4α-T1: 2xx non-JSON → kind 'client' code 'bad_answer' (never {})", async () => {
  const s = planSandbox(() => new Response('<html>proxy page</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
  const r = await outcome(s, READ);
  assert.deepStrictEqual({ ok: r.ok, kind: r.kind, code: r.code }, { ok: false, kind: 'client', code: 'bad_answer' });
  const e = planSandbox(() => new Response('', { status: 200 }));
  const r2 = await outcome(e, READ);
  assert.strictEqual(r2.code, 'bad_answer', 'an empty 200 was taken for an empty board');
});

test("F4α-T1: 401 → tmsSessionExpired('plan POST /plan/move', null)", async () => {
  const s = planSandbox(answer(401, 'AUTH', 'unauthorized'));
  const r = await outcome(s, "planFetch('POST', '/plan/move', { body: {} })");
  assert.deepStrictEqual(s.expired, ['plan POST /plan/move']);
  assert.strictEqual(r.gone, true, 'the session refusal was not the error thrown');
  assert.strictEqual(logged(s).length, 0, 'a session end is not an app error');
});

test('F4α-T1: a 200 JSON comes back as the parsed body', async () => {
  const board = { week: '2026-10-10', cycles: [], waiting: [], hub: [], notices: [] };
  const s = planSandbox(() => json(200, board));
  const r = await outcome(s, READ);
  assert.deepStrictEqual(r, { ok: true, x: board });
});
