// 102 (owner 2/11/2026, "Synthesi fortion": shared draft loads in the base) on the production-shaped PGlite copy as
// production holds it after 093, 095, 096 and 097 (prod-shaped-093.mjs + the three). Nothing reaches production.
// Order: NO-GO before 102 (no table, no act), the dry run keeps nothing, 102 runs (born closed), then each rule of the
// design on ROWS (plan_drafts, plan_draft_pieces, audit_log, ct_round_trips, rt_stops, piece_legs, plan_notices),
// never only an answer; then the rollback (refused with a live draft, clean after) and its dry run.
// Test rows only: TEST 102 names. Run: cd tms-auditor && npm install && node --test test/plan-102.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { prodShaped093 } from './prod-shaped-093.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts } from '../../worker/migrations/drafts/tools/build-102.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
// one act as the Worker calls it, in a savepoint: a refusal leaves the case usable and the rows are read after it
async function call(db, fn, body, role = 'dispatcher', actor = 'test:102') {
  await db.exec('SAVEPOINT c');
  try {
    const r = (await one(db, `SELECT ${fn}($1::jsonb, $2, $3) AS r`, [JSON.stringify(body), actor, role])).r;
    await db.exec('RELEASE SAVEPOINT c');
    return { r, err: null };
  } catch (e) { await db.exec('ROLLBACK TO SAVEPOINT c'); return { r: null, err: String(e.message), hint: e.hint ?? null }; }
}
const readDrafts = async (db, point) => (await one(db, `SELECT plan_drafts_read($1, 'dispatcher') AS r`, [point])).r;
// the rows a draft must NOT write (design rule 6): every v5 trip row
const tripRows = (db) => num(db, `SELECT (SELECT count(*) FROM ct_round_trips WHERE model = 2) + (SELECT count(*) FROM rt_stops)
  + (SELECT count(*) FROM piece_legs) + (SELECT count(*) FROM plan_notices) AS n`);

let seqNo = 0;
const T = async (db, k, hm) => (await one(db, `SELECT (((now() AT TIME ZONE 'Europe/Athens')::date + $1::int) + $2::time) AT TIME ZONE 'Europe/Athens' AS t`, [k, hm])).t;
const D = async (db, k) => (await one(db, `SELECT ((now() AT TIME ZONE 'Europe/Athens')::date + $1::int)::text AS d`, [k])).d;
const place = async (db) => (await one(db, `INSERT INTO locations (legacy_id, name, latitude, longitude) VALUES ($1, $2, 40.3, 21.8) RETURNING id`,
  ['rec102' + (++seqNo), 'TEST 102 place ' + seqNo])).id;
// one national order of one shipment A -> B, waiting (no target): its piece id
async function piece(db, a, b, pallets = 6, day = 4) {
  const cl = (await one(db, `INSERT INTO clients (company_name) VALUES ($1) RETURNING id`, ['TEST 102 client ' + (++seqNo)])).id;
  const r = await call(db, 'plan_orders_create', { request_id: crypto.randomUUID(), orders: [{ client_id: cl, price: 100, reference: 'T102-' + seqNo,
    temperature_c: 4, shipments: [{ origin_location_id: a, dest_location_id: b, pallets,
      load_from: await T(db, day, '08:00'), load_to: await T(db, day, '10:00'), deliver_from: await T(db, day + 1, '08:00'), deliver_to: await T(db, day + 1, '12:00') }] }] });
  assert.strictEqual(r.err, null, r.err);
  return Number(r.r.ids.piece_ids[0]);
}

test('102 on the production-shaped copy: before, dry run, GO, the rules on rows, rollback', async (t) => {
  const db = await prodShaped093();
  for (const f of ['095_plan_small_relaxed.sql', '096_plan_handover_accept_busy.sql', '097_plan_vs_state_hub_only.sql']) await db.exec(read(f));
  // as live: B-54 = the trigger count (the copy's monitoring row follows its own triggers)
  await db.exec(`UPDATE monitoring.checks SET red_value = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND n.nspname = 'public'), baseline = NULL WHERE id = 'B-54'`);
  const trg0 = await num(db, `SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`);
  const hub = await num(db, `SELECT id FROM locations WHERE is_hub`);
  const SRC = read('102_plan_drafts.sql');
  const F = facts(SRC);

  await t.test('NO-GO before 102: no table, no act; verify says "before 102"', async () => {
    assert.strictEqual((await one(db, `SELECT to_regclass('public.plan_drafts') AS t`)).t, null);
    assert.match(await errorOf(db, `SELECT plan_draft_create('{}'::jsonb, 'x', 'dispatcher')`) ?? '', /does not exist/);
    const v = await one(db, read('102_plan_drafts_verify.sql'));
    assert.deepStrictEqual([v.applied, Number(v.tables), Number(v.acts)], ['before 102', 0, 0]);
  });

  await t.test('the dry run keeps nothing and says what it would make', async () => {
    const msg = await errorOf(db, read('102_plan_drafts_dryrun.sql'));
    assert.ok((msg ?? '').includes(`DRY RUN 102 finished - EVERYTHING UNDONE, nothing kept. The block ran to its end  ||  102 ran: tables 2, acts 8, helpers 9, drafts_table 1, policies 2, triggers ${trg0 + 2}, b54 ${trg0 + 2}`), msg);
    assert.strictEqual((await one(db, `SELECT to_regclass('public.plan_drafts') AS t`)).t, null);
    assert.strictEqual(await num(db, `SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`), trg0);
  });

  await t.test('102 runs: born closed (RLS, 2 policies, SELECT only, 8 acts service_role only), B-54 +2; verify; a second run stops', async () => {
    assert.strictEqual(await errorOf(db, SRC), null);
    const v = await one(db, read('102_plan_drafts_verify.sql'));
    assert.deepStrictEqual([v.applied, Number(v.tables), Number(v.acts), Number(v.helpers), Number(v.policies), Number(v.open_to_api), v.b54_equals_triggers],
      ['102 in place', 2, 8, 9, 2, 0, true]);
    assert.strictEqual(await num(db, `SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`), trg0 + 2);
    for (const s of F.acts) assert.strictEqual((await one(db, `SELECT has_function_privilege('anon', '${s}'::regprocedure, 'EXECUTE') AS a`)).a, false, s);
    assert.match(await errorOf(db, SRC) ?? '', /102 has run, nothing to do/);
  });

  // the copy's places: the point (Veroia), two in the South, one past Veroia
  const south1 = await place(db), south2 = await place(db), north = await place(db);
  const day = await D(db, 4);

  await t.test('a draft is NOT a trip: create / pieces / move / update / delete write 0 trip rows; every change has its audit row', async () => {
    await db.exec('BEGIN');
    try {
      const k1 = await piece(db, hub, south1, 8), k2 = await piece(db, hub, south2, 5), k3 = await piece(db, hub, south1, 4);
      const trips = await tripRows(db);
      const aud0 = await num(db, `SELECT count(*) FROM audit_log WHERE table_name IN ('plan_drafts', 'plan_draft_pieces')`);
      const c1 = await call(db, 'plan_draft_create', { side: 'KATHODOS', point_location_id: hub, day, pieces: [{ piece_id: k1 }, { piece_id: k2 }], request_id: crypto.randomUUID() });
      assert.strictEqual(c1.err, null, c1.err);
      const c2 = await call(db, 'plan_draft_create', { side: 'KATHODOS', point_location_id: hub, day, request_id: crypto.randomUUID() });
      const d1 = Number(c1.r.ids.draft_id), d2 = Number(c2.r.ids.draft_id);
      // one piece in at most one live draft: refused with the other draft named; the unique index is the net
      const dup = await call(db, 'plan_draft_pieces', { draft_id: d2, version: 1, add: [{ piece_id: k1 }] });
      assert.match(dup.err ?? '', new RegExp(`piece_in_draft:${k1}:${d1}`));
      assert.match(await errorOf(db, `SAVEPOINT u; INSERT INTO plan_draft_pieces (draft_id, piece_id, snap, added_by) VALUES (${d2}, ${k1}, '{}', 'x')`) ?? '', /plan_draft_pieces_one|duplicate key/);
      await db.exec('ROLLBACK TO SAVEPOINT u');
      const mv = await call(db, 'plan_draft_move', { piece_ids: [k2], from: { draft_id: d1, version: 1 }, to: { draft_id: d2, version: 1 } });
      assert.strictEqual(mv.err, null, mv.err);
      const add = await call(db, 'plan_draft_pieces', { draft_id: d2, version: 2, add: [{ piece_id: k3 }] });
      assert.strictEqual(add.err, null, add.err);
      const up = await call(db, 'plan_draft_update', { draft_id: d2, version: 3, day: await D(db, 5), win: { from: '16:00', to: '18:00' } });
      assert.strictEqual(up.err, null, up.err);
      const del = await call(db, 'plan_draft_delete', { draft_id: d1, version: 2, reason: 'TEST 102' });
      assert.strictEqual(del.err, null, del.err);
      assert.strictEqual(await tripRows(db), trips, 'no ct_round_trips / rt_stops / piece_legs / plan_notices');
      assert.ok(await num(db, `SELECT count(*) FROM audit_log WHERE table_name IN ('plan_drafts', 'plan_draft_pieces')`) - aud0 >= 9);
      const h = (await one(db, `SELECT plan_draft_history($1, 'dispatcher') AS r`, [d2])).r;
      assert.ok(h.rows.length >= 5 && h.rows.every((x) => x.actor === 'test:102'), JSON.stringify(h.rows.map((x) => [x.table, x.action])));
      // soft only: the deleted draft is there with its reason, its piece released; a hard DELETE is refused
      const dd = await one(db, `SELECT deleted_reason, (SELECT count(*) FROM plan_draft_pieces WHERE draft_id = $1 AND removed_at IS NULL) AS live FROM plan_drafts WHERE id = $1`, [d1]);
      assert.deepStrictEqual([dd.deleted_reason, Number(dd.live)], ['TEST 102', 0]);
      assert.match(await errorOf(db, `SAVEPOINT x; DELETE FROM plan_drafts WHERE id = ${d1}`) ?? '', /hard delete/);
      await db.exec('ROLLBACK TO SAVEPOINT x');
      // read: only live drafts; the moved piece kept its snap
      const rd = await readDrafts(db, hub);
      assert.deepStrictEqual(rd.drafts.map((x) => x.draft_id), [d2]);
      assert.deepStrictEqual(rd.drafts[0].pieces.map((x) => [x.piece_id, x.state]), [[k2, 'ok'], [k3, 'ok']]);
      assert.deepStrictEqual([rd.drafts[0].win_from, rd.drafts[0].win_to, rd.drafts[0].version], ['16:00', '18:00', 4]);
    } finally { await db.exec('ROLLBACK'); }
  });

  await t.test('two people, days apart: a write on an old version is refused (draft_stale) and writes nothing', async () => {
    await db.exec('BEGIN');
    try {
      const k = await piece(db, hub, south1);
      const c = await call(db, 'plan_draft_create', { side: 'KATHODOS', point_location_id: hub, day, pieces: [{ piece_id: k }], request_id: crypto.randomUUID() });
      const id = Number(c.r.ids.draft_id);
      assert.strictEqual((await call(db, 'plan_draft_update', { draft_id: id, version: 1, day: await D(db, 6) }, 'dispatcher', 'person A')).err, null);
      const before = await one(db, `SELECT to_jsonb(d) AS j FROM plan_drafts d WHERE id = $1`, [id]);
      const stale = await call(db, 'plan_draft_update', { draft_id: id, version: 1, day: await D(db, 7) }, 'management', 'person B');
      assert.match(stale.err ?? '', new RegExp(`draft_stale:${id}:2`));
      assert.deepStrictEqual((await one(db, `SELECT to_jsonb(d) AS j FROM plan_drafts d WHERE id = $1`, [id])).j, before.j);
    } finally { await db.exec('ROLLBACK'); }
  });

  await t.test('source changes are marked per piece (amber), "old" only after the draft\'s own day; realize uses the pieces as they are now', async () => {
    await db.exec('BEGIN');
    try {
      const k1 = await piece(db, hub, south1, 8), k2 = await piece(db, hub, south2, 5);
      const c = await call(db, 'plan_draft_create', { side: 'KATHODOS', point_location_id: hub, day, pieces: [{ piece_id: k1 }, { piece_id: k2 }], request_id: crypto.randomUUID() });
      const id = Number(c.r.ids.draft_id);
      // built days ago, its day ahead: not old
      await db.exec(`UPDATE plan_drafts SET created_at = now() - interval '9 days' WHERE id = ${id}`);
      assert.strictEqual((await readDrafts(db, hub)).drafts[0].old, false);
      // the order's client changed at the source (an order edit): amber on that piece, the draft still ready
      const cl2 = (await one(db, `INSERT INTO clients (company_name) VALUES ('TEST 102 client new') RETURNING id`)).id;
      await db.query(`UPDATE national_orders SET client_id = $1 WHERE id = (SELECT nat_order_id FROM v_piece_state WHERE piece_id = $2)`, [cl2, k1]);
      let rd = (await readDrafts(db, hub)).drafts[0];
      const p1 = rd.pieces.find((x) => x.piece_id === k1);
      assert.deepStrictEqual([p1.state, p1.changed, p1.blocking, Number(p1.piece.client_id), rd.ready], ['changed', ['client_id'], false, Number(cl2), true]);
      assert.notStrictEqual(Number(p1.snap.client_id), Number(cl2));
      // a blocking mark is never acked away: a piece 'moved' (snap position no longer its position) is refused
      await db.exec(`UPDATE plan_draft_pieces SET snap = jsonb_set(snap, '{position_location_id}', '${south2}') WHERE piece_id = ${k2} AND removed_at IS NULL`);
      assert.strictEqual((await readDrafts(db, hub)).drafts[0].pieces.find((x) => x.piece_id === k2).state, 'moved');
      assert.match((await call(db, 'plan_draft_pieces', { draft_id: id, version: 1, ack: [k2] })).err ?? '', new RegExp(`draft_not_ready:${k2}:ack`));
      await db.exec(`UPDATE plan_draft_pieces SET snap = jsonb_set(snap, '{position_location_id}', '${hub}') WHERE piece_id = ${k2} AND removed_at IS NULL`);
      // a second press adding a piece already in this draft says ':same', not a conflict with another draft
      assert.match((await call(db, 'plan_draft_pieces', { draft_id: id, version: 1, add: [{ piece_id: k1 }] })).err ?? '', new RegExp(`piece_in_draft:${k1}:${id}:same`));
      // "OK" renews the snap, with a trace
      assert.strictEqual((await call(db, 'plan_draft_pieces', { draft_id: id, version: 1, ack: [k1] })).err, null);
      rd = (await readDrafts(db, hub)).drafts[0];
      assert.strictEqual(rd.pieces.find((x) => x.piece_id === k1).state, 'ok');
      const legs = { pieces: [{ piece_id: k1 }, { piece_id: k2 }], target: { new_rt: { trip_type: 'OWNED', later: true }, side: 'KATHODOS' },
        stops: [{ ref: 'h', location_id: hub, side: 'KATHODOS', planned_from: await T(db, 4, '00:00'), planned_to: await T(db, 4, '23:59') },
                { ref: 'a', location_id: south1, side: 'KATHODOS', planned_from: await T(db, 5, '08:00'), planned_to: await T(db, 5, '12:00') },
                { ref: 'b', location_id: south2, side: 'KATHODOS', planned_from: await T(db, 5, '08:00'), planned_to: await T(db, 5, '12:00') }] };
      // E2: to_hub refused; the pieces must be exactly the draft's
      assert.match((await call(db, 'plan_draft_realize', { draft_id: id, version: 2, request_id: crypto.randomUUID(),
        legs: { ...legs, pieces: [{ piece_id: k1, to_hub: true }, { piece_id: k2 }] } })).err ?? '', /piece\.to_hub/);
      assert.match((await call(db, 'plan_draft_realize', { draft_id: id, version: 2, request_id: crypto.randomUUID(),
        legs: { ...legs, pieces: [{ piece_id: k1 }] } })).err ?? '', new RegExp(`draft_pieces:${id}`));
      // realize = "Dimiourgia" without a truck (083 later): ONE cycle with no vehicle, both pieces as they are now
      const rid = crypto.randomUUID();
      const ok = await call(db, 'plan_draft_realize', { draft_id: id, version: 2, request_id: rid, legs });
      assert.strictEqual(ok.err, null, ok.err);
      await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
      const rt = Number(ok.r.ids.rt_id);
      const row = await one(db, `SELECT r.truck_id, r.partner_id, (SELECT count(*) FROM piece_legs l WHERE l.rt_id = r.id AND l.deleted_at IS NULL) AS legs,
          (SELECT string_agg(sp.pallets::text, ',' ORDER BY sp.id) FROM piece_legs l JOIN shipment_pieces sp ON sp.id = l.piece_id WHERE l.rt_id = r.id) AS pal,
          (SELECT realized_rt_id FROM plan_drafts WHERE id = $2) AS link,
          (SELECT count(*) FROM plan_draft_pieces WHERE draft_id = $2 AND removed_at IS NULL) AS live
        FROM ct_round_trips r WHERE r.id = $1`, [rt, id]);
      assert.deepStrictEqual([row.truck_id, row.partner_id, Number(row.legs), row.pal, Number(row.link), Number(row.live)], [null, null, 2, '8.0,5.0', rt, 0]);
      // the same request_id again: the first answer, nothing new
      const again = await call(db, 'plan_draft_realize', { draft_id: id, version: 2, request_id: rid, legs });
      assert.strictEqual(again.r?.replayed, true, again.err);
      assert.strictEqual((await readDrafts(db, hub)).drafts.length, 0);
    } finally { await db.exec('ROLLBACK'); }
  });

  await t.test('"old" = the draft\'s own day has passed (Athens), nothing else', async () => {
    await db.exec('BEGIN');
    try {
      const c = await call(db, 'plan_draft_create', { side: 'KATHODOS', point_location_id: hub, day: await D(db, -1), request_id: crypto.randomUUID() });
      assert.strictEqual(c.err, null, c.err);
      assert.strictEqual((await readDrafts(db, hub)).drafts[0].old, true);
    } finally { await db.exec('ROLLBACK'); }
  });

  await t.test('a piece that left the waiting (put on a cycle elsewhere) stays in the draft, marked, and blocks realize - nothing written', async () => {
    await db.exec('BEGIN');
    try {
      const k1 = await piece(db, hub, south1), k2 = await piece(db, hub, south2);
      const c = await call(db, 'plan_draft_create', { side: 'KATHODOS', point_location_id: hub, day, pieces: [{ piece_id: k1 }, { piece_id: k2 }], request_id: crypto.randomUUID() });
      const id = Number(c.r.ids.draft_id);
      const put = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: k1 }], target: { new_rt: { trip_type: 'OWNED', later: true }, side: 'KATHODOS' },
        stops: [{ ref: 'h', location_id: hub, side: 'KATHODOS', planned_from: await T(db, 4, '00:00'), planned_to: await T(db, 4, '23:59') },
                { ref: 'a', location_id: south1, side: 'KATHODOS', planned_from: await T(db, 5, '08:00'), planned_to: await T(db, 5, '12:00') }] });
      assert.strictEqual(put.err, null, put.err);
      const rd = (await readDrafts(db, hub)).drafts[0];
      assert.deepStrictEqual([rd.pieces.map((x) => [x.piece_id, x.state, x.blocking]), rd.ready], [[[k1, 'assigned', true], [k2, 'ok', false]], false]);
      const trips = await tripRows(db);
      const r = await call(db, 'plan_draft_realize', { draft_id: id, version: 1, request_id: crypto.randomUUID(), legs: { pieces: [{ piece_id: k1 }, { piece_id: k2 }],
        target: { new_rt: { trip_type: 'OWNED', later: true }, side: 'KATHODOS' }, stops: [] } });
      assert.match(r.err ?? '', new RegExp(`draft_not_ready:${k1}:assigned`));
      assert.strictEqual(await tripRows(db), trips);
      assert.strictEqual(await num(db, `SELECT version FROM plan_drafts WHERE id = $1`, [id]), 1);
    } finally { await db.exec('ROLLBACK'); }
  });

  await t.test('sides: KATHODOS takes what stands at the point, ANODOS what waits elsewhere; an ANODOS past Veroia goes direct (E2)', async () => {
    await db.exec('BEGIN');
    try {
      const kat = await piece(db, hub, south1), an1 = await piece(db, south1, hub, 7), an2 = await piece(db, south2, north, 3);
      const wrong = await call(db, 'plan_draft_create', { side: 'ANODOS', point_location_id: hub, day, pieces: [{ piece_id: kat }], request_id: crypto.randomUUID() });
      assert.match(wrong.err ?? '', new RegExp(`draft_side:${kat}:ANODOS`));
      const c = await call(db, 'plan_draft_create', { side: 'ANODOS', point_location_id: hub, day, pieces: [{ piece_id: an1 }, { piece_id: an2 }], request_id: crypto.randomUUID() });
      assert.strictEqual(c.err, null, c.err);
      const id = Number(c.r.ids.draft_id);
      const ok = await call(db, 'plan_draft_realize', { draft_id: id, version: 1, request_id: crypto.randomUUID(), legs: {
        pieces: [{ piece_id: an1 }, { piece_id: an2 }], target: { new_rt: { trip_type: 'OWNED', later: true }, side: 'ANODOS' },
        stops: [{ ref: 's1', location_id: south1, side: 'ANODOS', planned_from: await T(db, 4, '08:00'), planned_to: await T(db, 4, '10:00') },
                { ref: 's2', location_id: south2, side: 'ANODOS', planned_from: await T(db, 4, '08:00'), planned_to: await T(db, 4, '10:00') },
                { ref: 'h', location_id: hub, side: 'ANODOS', planned_from: await T(db, 5, '08:00'), planned_to: await T(db, 5, '12:00') },
                { ref: 'n', location_id: north, side: 'ANODOS', planned_from: await T(db, 5, '08:00'), planned_to: await T(db, 5, '12:00') }] } });
      assert.strictEqual(ok.err, null, ok.err);
      await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
      // the piece past Veroia drops at its own end, not at Veroia
      const drop = await num(db, `SELECT s.location_id FROM piece_legs l JOIN rt_stops s ON s.id = l.drop_stop_id WHERE l.piece_id = $1 AND l.deleted_at IS NULL`, [an2]);
      assert.strictEqual(drop, north);
    } finally { await db.exec('ROLLBACK'); }
  });

  await t.test('rollback: refused with a live draft (nothing changed); clean after; its dry run keeps nothing', async () => {
    await db.exec('BEGIN');
    const k = await piece(db, hub, south1);
    await call(db, 'plan_draft_create', { side: 'KATHODOS', point_location_id: hub, day, pieces: [{ piece_id: k }], request_id: crypto.randomUUID() });
    assert.match(await errorOf(db, read('102_plan_drafts_rollback.sql')) ?? '', /1 live draft\(s\)/);
    await db.exec('ROLLBACK');
    const msg = await errorOf(db, read('102_plan_drafts_rollback_dryrun.sql'));
    assert.ok((msg ?? '').includes(`rollback ran: tables 0, acts 0, helpers 0, drafts_table 0, policies 0, triggers ${trg0}, b54 ${trg0}`), msg);
    assert.notStrictEqual((await one(db, `SELECT to_regclass('public.plan_drafts') AS t`)).t, null);
    assert.strictEqual(await errorOf(db, read('102_plan_drafts_rollback.sql')), null);
    const v = await one(db, read('102_plan_drafts_verify.sql'));
    assert.deepStrictEqual([v.applied, Number(v.tables), Number(v.acts), Number(v.helpers), v.b54_equals_triggers], ['before 102', 0, 0, 0, true]);
    assert.strictEqual(await num(db, `SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`), trg0);
  });
});
