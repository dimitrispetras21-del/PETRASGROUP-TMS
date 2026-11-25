// 114 (owner 8/11 "first a split", again 25/11): a waiting load splits at its own loading point, on the
// production-shaped PGlite copy as production holds it on 25/11 (prod-shaped-112.mjs; the md5 of every text 114
// touches = the production measure of 25/11, asserted first). Nothing reaches production.
// Order: NO-GO before 114, the dry run keeps nothing, 114 runs, then the rules on ROWS (shipment_pieces, piece_legs,
// v_piece_state, the board), the refusals, then the rollback (refused while such a split is live, clean after).
// Test rows only: TEST 114 names, T114- references. Run: cd tms-auditor && npm install && node --test test/plan-114.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { prodShaped112 } from './prod-shaped-112.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts } from '../../worker/migrations/drafts/tools/build-114.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const N = (x) => (x === null || x === undefined ? x : Number(x));
// a whole file, as the owner runs it (outside a transaction: the editor's own one)
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
// the same inside a scenario's transaction: in a savepoint, so the case stays usable after a refusal
async function errorIn(db, sql) {
  await db.exec('SAVEPOINT e');
  try { await db.exec(sql); await db.exec('RELEASE SAVEPOINT e'); return null; }
  catch (e) { await db.exec('ROLLBACK TO SAVEPOINT e'); return String(e.message); }
}
// one act as the Worker calls it (POST /plan/pieces/split -> plan_split_piece, POST /plan/legs -> plan_put_pieces), in a
// savepoint: a refusal leaves the case usable and the rows are read after it
async function call(db, fn, body) {
  await db.exec('SAVEPOINT c');
  try {
    const r = (await one(db, `SELECT ${fn}($1::jsonb, 'test:114', 'dispatcher') AS r`, [JSON.stringify(body)])).r;
    await db.exec('RELEASE SAVEPOINT c');
    return { r, err: null };
  } catch (e) { await db.exec('ROLLBACK TO SAVEPOINT c'); return { r: null, err: String(e.message) }; }
}
async function scenario(db, steps) {
  await db.exec('BEGIN');
  try { return await steps(); } finally { await db.exec('ROLLBACK'); }
}
const P = '114_plan_split_at_loading';
const DAY = '2026-12-07', WEEK = '2026-12-05';   // a Monday; its board week starts on the Saturday
const at = (h) => `${DAY}T${String(h).padStart(2, '0')}:00:00+02:00`;
const verify = (db) => one(db, read(`${P}_verify.sql`));
const split = (db, piece, parts) => call(db, 'plan_split_piece', { piece_id: piece, parts, request_id: crypto.randomUUID() });
let seq = 0;
const place = async (db) => N((await one(db, `INSERT INTO locations (legacy_id, name) VALUES ($1, $2) RETURNING id`,
  ['r114L' + (++seq), 'TEST 114 place ' + seq])).id);
const truck = async (db) => N((await one(db, `INSERT INTO trucks (license_plate) VALUES ($1) RETURNING id`, ['TEST-114-' + (++seq)])).id);
// a national load of p pallets from a to b on DAY: its one piece
async function national(db, a, b, p) {
  // a plan_* call ends with the 071 rules IMMEDIATE for the rest of the transaction (plan_h_finish): the order, its
  // shipment and its piece are three rows of one write, judged together at the end (as plan_orders_create does)
  await db.exec('SET CONSTRAINTS ALL DEFERRED');   // outside a transaction: a warning, nothing else
  const n = N((await one(db, `INSERT INTO national_orders (legacy_id, client_id, reference, price, pallets)
    VALUES ($1, (SELECT min(id) FROM clients), 'T114-N', 100, $2) RETURNING id`, ['r114N' + (++seq), p])).id);
  const sh = N((await one(db, `INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
      deliver_from, deliver_to, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'test:114') RETURNING id`,
    [n, a, b, p, at(8), at(9), at(18), at(19)])).id);
  return N((await one(db, `INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES ($1, $2, 'test:114') RETURNING id`, [sh, p])).id);
}
// POST /plan/legs: the piece on a new OWNED trip of truck tk, from where it waits (h1) to its national end (h2)
async function put(db, piece, tk, h1 = 8, h2 = 18) {
  const v = await one(db, `SELECT ps.position_location_id f, vs.nat_to_location_id t FROM v_piece_state ps
    JOIN v_shipments vs ON vs.shipment_id = ps.shipment_id WHERE ps.piece_id = $1`, [piece]);
  return call(db, 'plan_put_pieces', {
    pieces: [{ piece_id: piece, pickup: 'p', drop: 'd' }],
    target: { new_rt: { trip_type: 'OWNED', truck_id: tk }, side: 'ANODOS' },
    stops: [{ ref: 'p', location_id: N(v.f), side: 'ANODOS', planned_from: at(h1), planned_to: at(h1 + 1) },
            { ref: 'd', location_id: N(v.t), side: 'ANODOS', planned_from: at(h2), planned_to: at(h2 + 1) }] });
}
const state = (db, id) => one(db, `SELECT piece_id, parent_piece_id, pallets, leave_by, is_stock, waiting, at_hub, position_location_id
  FROM v_piece_state WHERE piece_id = $1`, [id]);
const problem = async (db, piece) => (await one(db, `SELECT plan_shipment_problem(shipment_id) AS p FROM shipment_pieces WHERE id = $1`, [piece])).p;

test('114 on the production-shaped copy: before, dry run, GO, the split on rows, refusals, rollback', async (t) => {
  const db = await prodShaped112();
  const SRC = read(`${P}.sql`);
  const F = facts(SRC);
  const hub = N((await one(db, `SELECT id FROM locations WHERE is_hub`)).id);
  const md5s = async () => one(db, `SELECT md5(pg_get_viewdef('public.v_piece_state'::regclass, true)) v,
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_split_piece(jsonb,text,text)'::regprocedure) p,
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_shipment_problem(bigint)'::regprocedure) s,
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure) b`);
  const before = await md5s();
  const south = await place(db), south2 = await place(db);

  await t.test('the copy is production of 25/11: every text 114 guards on has the measured md5', async () => {
    assert.strictEqual(before.v, F.viewOld);
    for (const [sig, m] of Object.entries(F.live)) {
      assert.strictEqual((await one(db, `SELECT md5(prosrc) m FROM pg_proc WHERE oid = $1::regprocedure`, [sig])).m, m, sig);
    }
  });

  await t.test('NO-GO before 114: verify "before 114"; a waiting load at its loading point is refused (not_at_hub)', async () => {
    assert.strictEqual((await verify(db)).applied, 'before 114');
    await scenario(db, async () => {
      const k = await national(db, south, hub, 16);
      const r = await split(db, k, [{ pallets: 3 }, { pallets: 13 }]);
      assert.match(r.err ?? '', /not_at_hub/);
    });
  });

  await t.test('the dry run keeps nothing and names the md5 it would end on', async () => {
    const msg = await errorOf(db, read(`${P}_dryrun.sql`));
    const gen = Object.fromEntries(F.gen.map((g) => [g.sig, g.m]));
    assert.ok((msg ?? '').includes(`DRY RUN 114 finished - EVERYTHING UNDONE, nothing kept. The block ran to its end  ||  114 ran: split ${gen['public.plan_split_piece(jsonb,text,text)']}, problem ${gen['public.plan_shipment_problem(bigint)']}, board ${gen['public.plan_board(date,text)']}, view ${F.viewNew}`), msg);
    assert.deepStrictEqual(await md5s(), before);
  });

  await t.test('114 runs: verify "114 in place", worker can execute, nothing split yet; a second run stops', async () => {
    assert.strictEqual(await errorOf(db, SRC), null);
    const v = await verify(db);
    assert.deepStrictEqual([v.applied, v.worker_execute, N(v.split_at_start), N(v.parts_waiting), N(v.parts_stock)], ['114 in place', true, 0, 0, 0]);
    assert.match(await errorOf(db, SRC) ?? '', /114 has run, nothing to do/);
  });

  await t.test('16 -> 3 + 13 at the loading point: two waiting parts, not stock, no leave_by; the sum holds; the board names them', async () => {
    await scenario(db, async () => {
      const k = await national(db, south, hub, 16);
      const aud0 = N((await one(db, `SELECT count(*) n FROM audit_log WHERE table_name = 'shipment_pieces'`)).n);
      const r = await split(db, k, [{ pallets: 3 }, { pallets: 13 }]);
      assert.strictEqual(r.err, null, r.err);
      const kids = r.r.ids.piece_ids.map(N);
      assert.strictEqual(kids.length, 2);
      assert.deepStrictEqual(r.r.ids.leg_ids, []);
      assert.ok((await one(db, `SELECT split_at FROM shipment_pieces WHERE id = $1`, [k])).split_at);
      for (const [i, id] of kids.entries()) {
        const s = await state(db, id);
        assert.deepStrictEqual([N(s.parent_piece_id), Number(s.pallets), s.leave_by, s.is_stock, s.waiting, s.at_hub, N(s.position_location_id)],
          [k, [3, 13][i], null, false, true, false, south]);
      }
      assert.strictEqual(await state(db, k), undefined, 'the split piece leaves v_piece_state');
      assert.strictEqual(await problem(db, k), null, 'pieces_sum and split_not_at_hub hold');
      assert.strictEqual(N((await one(db, `SELECT count(*) n FROM audit_log WHERE table_name = 'shipment_pieces'`)).n) - aud0, 3);
      const b = (await one(db, `SELECT plan_board($1::date, 'dispatcher') b`, [WEEK])).b;
      const w = b.waiting.filter((x) => kids.includes(N(x.piece_id)) || N(x.piece_id) === k);
      assert.deepStrictEqual(w.map((x) => [N(x.piece_id), N(x.parent_piece_id), x.is_stock, Number(x.pallets)]), [[kids[0], k, false, 3], [kids[1], k, false, 13]]);
      assert.ok(b.waiting.every((x) => 'parent_piece_id' in x), 'every waiting item says parent_piece_id');
      const v = await verify(db);
      assert.deepStrictEqual([N(v.split_at_start), N(v.parts_waiting), N(v.parts_stock)], [1, 2, 0]);
    });
  });

  await t.test('each part on a different truck with POST /plan/legs: two trips, the sum holds', async () => {
    await scenario(db, async () => {
      // to a place that is not Veroia: a load planned to Veroia stands there (at_hub), where it splits as before
      const k = await national(db, south, south2, 16);
      const kids = (await split(db, k, [{ pallets: 3 }, { pallets: 13 }])).r.ids.piece_ids.map(N);
      const a = await put(db, kids[0], await truck(db)), b = await put(db, kids[1], await truck(db), 10, 20);
      assert.strictEqual(a.err, null, a.err);
      assert.strictEqual(b.err, null, b.err);
      assert.notStrictEqual(N(a.r.ids.rt_id), N(b.r.ids.rt_id));
      const legs = (await db.query(`SELECT l.piece_id, l.rt_id, ps.location_id pick FROM piece_legs l JOIN rt_stops ps ON ps.id = l.pickup_stop_id
        WHERE l.piece_id = ANY($1::bigint[]) AND l.deleted_at IS NULL ORDER BY l.piece_id`, [kids])).rows;
      assert.deepStrictEqual(legs.map((l) => [N(l.piece_id), N(l.pick)]), [[kids[0], south], [kids[1], south]]);
      assert.strictEqual(await problem(db, k), null);
      for (const id of kids) assert.strictEqual((await state(db, id)).waiting, false);
      // a part that rides cannot split at its start any more
      assert.match((await split(db, kids[1], [{ pallets: 6 }, { pallets: 7 }])).err ?? '', /not_at_hub/);
      const v = await verify(db);
      assert.deepStrictEqual([N(v.split_at_start), N(v.parts_waiting)], [1, 0]);
    });
  });

  await t.test('refusals: a load that already rides; a truck or a day in a part; a sum that does not match; "only these pallets" of a part', async () => {
    await scenario(db, async () => {
      const ride = await national(db, south, south2, 10);
      assert.strictEqual((await put(db, ride, await truck(db))).err, null);
      assert.match((await split(db, ride, [{ pallets: 4 }, { pallets: 6 }])).err ?? '', /not_at_hub/);
      const k = await national(db, south2, hub, 16);
      assert.match((await split(db, k, [{ pallets: 3, leave_by: '2026-12-06' }, { pallets: 13 }])).err ?? '', /pallets only/);
      assert.match((await split(db, k, [{ pallets: 3, target: { rt_id: 1, side: 'ANODOS' } }, { pallets: 13 }])).err ?? '', /pallets only/);
      assert.match((await split(db, k, [{ pallets: 3 }, { pallets: 12 }])).err ?? '', /parts_sum/);
      assert.strictEqual(N((await one(db, `SELECT count(*) n FROM shipment_pieces WHERE parent_piece_id = $1`, [k])).n), 0, 'a refusal writes nothing');
      // option A of the plan is NOT the one chosen: "only these pallets" of a waiting part stays refused
      const kids = (await split(db, k, [{ pallets: 3 }, { pallets: 13 }])).r.ids.piece_ids.map(N);
      const v = await one(db, `SELECT vs.nat_to_location_id t FROM v_shipments vs JOIN shipment_pieces sp ON sp.shipment_id = vs.shipment_id WHERE sp.id = $1`, [k]);
      const take = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: kids[1], take_pallets: 5, pickup: 'p', drop: 'd' }],
        target: { new_rt: { trip_type: 'OWNED', truck_id: await truck(db) }, side: 'ANODOS' },
        stops: [{ ref: 'p', location_id: south2, side: 'ANODOS', planned_from: at(8), planned_to: at(9) },
                { ref: 'd', location_id: N(v.t), side: 'ANODOS', planned_from: at(18), planned_to: at(19) }] });
      assert.match(take.err ?? '', /not_stock/);
    });
  });

  await t.test('Veroia unchanged: a load waiting AT Veroia splits as before - its parts are stock and leave by the day before', async () => {
    await scenario(db, async () => {
      const k = await national(db, hub, south, 12);
      const r = await split(db, k, [{ pallets: 5 }, { pallets: 7 }]);
      assert.strictEqual(r.err, null, r.err);
      const due = (await one(db, `SELECT (vs.nat_due_day - 1)::text d FROM v_shipments vs JOIN shipment_pieces sp ON sp.shipment_id = vs.shipment_id WHERE sp.id = $1`, [k])).d;
      for (const id of r.r.ids.piece_ids.map(N)) {
        const s = await state(db, id);
        assert.deepStrictEqual([s.is_stock, s.at_hub], [true, true]);
        assert.strictEqual((await one(db, `SELECT leave_by::text d FROM shipment_pieces WHERE id = $1`, [id])).d, due);
      }
      assert.strictEqual(N((await verify(db)).split_at_start), 0, 'a Veroia split is not a split at the loading point');
    });
  });

  await t.test('rollback: refused while a load split at its loading point is live; then back to 25/11 byte for byte', async () => {
    await scenario(db, async () => {
      const k = await national(db, south, hub, 16);
      assert.strictEqual((await split(db, k, [{ pallets: 3 }, { pallets: 13 }])).err, null);
      assert.match(await errorIn(db, read(`${P}_rollback.sql`)) ?? '', /1 load\(s\) split at their loading point are live/);
    });
    const dry = await errorOf(db, read(`${P}_rollback_dryrun.sql`));
    assert.ok((dry ?? '').includes(`DRY RUN 114 ROLLBACK finished - EVERYTHING UNDONE, nothing kept. The block ran to its end  ||  rollback ran: split ${before.p}, problem ${before.s}, board ${before.b}, view ${before.v}`), dry);
    assert.strictEqual((await verify(db)).applied, '114 in place');
    assert.strictEqual(await errorOf(db, read(`${P}_rollback.sql`)), null);
    assert.deepStrictEqual(await md5s(), before);
    assert.strictEqual((await verify(db)).applied, 'before 114');
  });
});
