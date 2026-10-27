// node --test tests/wn5-actions-worker.test.mjs
// National v5 F4α (T12+): the bodies the board rig asserts, sent through the REAL worker/src/index.js
// (tests/critics/wn5-worker-harness.mjs, T1) behind a PostgREST stub. This is «the table» of CLAUDE.md's five
// questions for the write path while production writes are closed: which RPC the Worker calls, and that the body
// reaches it as p — unchanged, path id merged, with the caller as p_actor / p_role. Harness contract (T1):
// makeWorker({ writesOpen, role, db }) signs the JWT for `role`; db(fnName, args) gets the RPC's JSON args.
import { test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.resolve(HERE, '..');
const { makeWorker } = await import(pathToFileURL(path.join(ROOT, 'tests', 'critics', 'wn5-worker-harness.mjs')).href);

export async function send(opts, method, p, body) {
  const seen = [];
  const w = await makeWorker(Object.assign({ writesOpen: true, role: 'dispatcher' }, opts, {
    db: (fn, args) => { seen.push({ fn, args }); return { status: 200, body: opts.answer || { ok: true, op: fn, dry_run: !!(body && body.dry_run), ids: {}, warnings: [], notice_ids: [] } }; },
  }));
  const res = await w.fetch(new Request('https://w.invalid' + p, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { status: res.status, json: await res.json(), seen };
}

// the body of rig `assign` («Ένωση» of VS-T118 onto RT-T201)
const JOIN = { group: { order_id: 2101 }, target: { rt_id: 201, side: 'KATHODOS' },
  stops: [{ ref: 's2001', stop_id: 2001 }, { ref: 's2002', stop_id: 2002 }, { ref: 's2003', stop_id: 2003 },
          { ref: 'n4', location_id: 4, side: 'KATHODOS', planned_from: '2026-10-13T09:00:00+03:00', planned_to: '2026-10-13T10:00:00+03:00' }] };

test('F4α-T12: POST /plan/legs with a group → ONE plan_put_group, the body as p, the caller as p_actor / p_role', async () => {
  const r = await send({}, 'POST', '/plan/legs', JOIN);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.seen.length, 1);
  assert.strictEqual(r.seen[0].fn, 'plan_put_group');
  assert.deepStrictEqual(r.seen[0].args.p, JOIN);
  assert.strictEqual(r.seen[0].args.p_role, 'dispatcher');
  assert.ok(r.seen[0].args.p_actor, 'p_actor is the JWT sub');
});

test('F4α-T12: POST /plan/legs with pieces → plan_put_pieces; warehouse may (PLAN_PERMS legs, decision 41)', async () => {
  const body = { pieces: [{ piece_id: 4301 }], target: { rt_id: 201, side: 'KATHODOS' }, stops: [{ ref: 's2001', stop_id: 2001 }] };
  const r = await send({ role: 'warehouse' }, 'POST', '/plan/legs', body);
  assert.strictEqual(r.seen[0].fn, 'plan_put_pieces');
  assert.deepStrictEqual(r.seen[0].args.p, body);
});

test('F4α-T12: PATCH /plan/rt/201 {set} → plan_rt_update with rt_id merged from the path', async () => {
  const r = await send({}, 'PATCH', '/plan/rt/201', { set: { trip_type: 'OWNED', truck_id: 14 } });
  assert.strictEqual(r.seen[0].fn, 'plan_rt_update');
  assert.deepStrictEqual(r.seen[0].args.p, { set: { trip_type: 'OWNED', truck_id: 14 }, rt_id: 201 });
});

test('F4α-T12: writes closed (production until L): POST /plan/legs → 409 writes_closed, zero RPC', async () => {
  const r = await send({ writesOpen: false }, 'POST', '/plan/legs', JOIN);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.json.error.code, 'writes_closed');
  assert.strictEqual(r.seen.length, 0);
});

test('F4α-T14: writes closed, a move dry run passes the switch → ONE plan_move_pieces with dry_run true (Δ6 preview before day L)', async () => {
  const body = { from: { piece_ids: [5101], rt_id: 201 }, target: { wait: true }, dry_run: true };
  const r = await send({ writesOpen: false, answer: { ok: true, op: 'plan_move_pieces', dry_run: true, needs_confirm: false, confirm_token: 't', consequences: [] } }, 'POST', '/plan/move', body);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.seen.length, 1);
  assert.strictEqual(r.seen[0].fn, 'plan_move_pieces');
  assert.deepStrictEqual(r.seen[0].args.p, body);
});

test('F4α-T15: POST /plan/rt/201/clear — management 403 before any RPC (rt-clear = owner + dispatcher, dry run too)', async () => {
  const r = await send({ role: 'management', writesOpen: false }, 'POST', '/plan/rt/201/clear', { dry_run: true });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.json.error.code, 'forbidden');
  assert.strictEqual(r.seen.length, 0);
});

test('F4α-T15: dispatcher dry run → plan_rt_clear with rt_id merged from the path', async () => {
  const r = await send({ writesOpen: false, answer: { ok: true, op: 'plan_rt_clear', dry_run: true, needs_confirm: false, confirm_token: 't', consequences: [] } }, 'POST', '/plan/rt/201/clear', { dry_run: true });
  assert.strictEqual(r.seen[0].fn, 'plan_rt_clear');
  assert.deepStrictEqual(r.seen[0].args.p, { dry_run: true, rt_id: 201 });
});

test('F4α-T17: POST /plan/local-loading keeps the request_id in p (decision 44: the DB replays by it), a cancel has none', async () => {
  const create = { rt_stop_id: 2033, driver_id: 34, truck_id: 15, request_id: 'aaaaaaaa-0000-4000-8000-000000000017' };
  const r = await send({}, 'POST', '/plan/local-loading', create);
  assert.strictEqual(r.seen[0].fn, 'plan_local_loading');
  assert.deepStrictEqual(r.seen[0].args.p, create);
  const c = await send({}, 'POST', '/plan/local-loading', { local_move_id: 7002, cancel: true });
  assert.deepStrictEqual(c.seen[0].args.p, { local_move_id: 7002, cancel: true });
});

test('F4α-T18: POST /plan/delete — accountant 403 before any RPC; the dispatcher dry run reaches plan_delete without a reason', async () => {
  const no = await send({ role: 'accountant', writesOpen: false }, 'POST', '/plan/delete', { nat_order_id: 3111, dry_run: true });
  assert.strictEqual(no.status, 403);
  assert.strictEqual(no.seen.length, 0);
  const yes = await send({ writesOpen: false, answer: { ok: true, op: 'plan_delete', dry_run: true, needs_confirm: true, confirm_token: 't', consequences: [{ kind: 'invoiced', nat_order_id: 3111 }] } },
    'POST', '/plan/delete', { nat_order_id: 3111, dry_run: true });
  assert.strictEqual(yes.seen[0].fn, 'plan_delete');
  assert.deepStrictEqual(yes.seen[0].args.p, { nat_order_id: 3111, dry_run: true });
});
