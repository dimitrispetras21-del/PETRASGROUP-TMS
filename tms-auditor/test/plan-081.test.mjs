// 081 (F28 the stops of a cycle by the road, and the truck's stop follows its point; owner 31/10) on the
// production-shaped PGlite copy as production holds it on 31/10: prod-shaped-074.mjs (072 ... 074a, 074, 074b) + 075,
// 076, 077, 078, 080. 079 only moved day L (the copy has its own L). 082 (PR #177, not run) patches other functions.
// Each scenario runs inside a transaction that is always rolled back, with the deferred rules (071's plan_chk) fired
// before the rows are read: the same scenario first on the LIVE texts (it must show F28 / the stop that stays =
// NO-GO), then after 081 (GO), then after the rollback (the live behaviour again). Every case reads ROWS (rt_stops,
// shipments, ct_round_trips, audit_log), never only an answer. Places carry the coordinates of their TOWN centre
// (public), as production's RT-1300 / RT-1306 / RT-1315 do at their own addresses.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts } from '../../worker/migrations/drafts/tools/build-081.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
async function errorOf(db, sql, p) { try { await db.query(sql, p); return null; } catch (e) { return { msg: String(e.message), hint: e.hint ?? null }; } }
// a file of several statements (a migration, its dry run) runs through exec
async function execErr(db, sql) { try { await db.exec(sql); return null; } catch (e) { return { msg: String(e.message), hint: e.hint ?? null }; } }
const SIGS = ['public.plan_h_reseq(bigint,text,text)', 'public.plan_order_update(jsonb,text,text)'];
const LIVE = ['14322e7190d6431cc11c267f49bb5735', '39d38711b825e3ba698a814aeb53bbcc'];   // production, SELECT 31/10
const RT_UPDATE = 'be70612fb940356278c7c66705c8ee33';   // plan_rt_update, production 31/10: 081 calls it, never patches it
const md5Of = async (db, sig) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${sig}'::regprocedure`)).m;
const md5s = (db) => Promise.all(SIGS.map((s) => md5Of(db, s)));

// town centres (lat, lon); the hub is Veroia
const TOWN = {
  veroia: [40.6027, 22.1894], asp: [38.0634, 23.6406], alx: [40.6603, 22.4062], dim: [39.3721, 22.8869],
  kop: [40.6308, 22.1325], kozani: [40.3007, 21.7887], larisa: [39.6390, 22.4191],
  ath1: [37.9640, 23.6853], ath2: [37.9854, 23.6842], ath3: [37.9784, 23.6868],
  sparti: [37.0739, 22.4303], korinthia: [38.0476, 22.6635],
};
let seqNo = 0;
// A scenario inside a transaction that is always rolled back; the deferred rules fire before the rows are read
async function scenario(db, steps) {
  await db.exec('BEGIN');
  try {
    const out = await steps();
    const late = await execErr(db, 'SET CONSTRAINTS ALL IMMEDIATE');
    return { ...out, late };
  } finally { await db.exec('ROLLBACK'); }
}
// The Athens instant of (today + k days) at hh:mm
const T = async (db, k, hm) => (await one(db, `SELECT (((now() AT TIME ZONE 'Europe/Athens')::date + $1::int) + $2::time) AT TIME ZONE 'Europe/Athens' AS t`, [k, hm])).t;
async function places(db, names) {
  const out = {};
  for (const n of names) {
    seqNo += 1;
    out[n] = (await one(db, `INSERT INTO locations (legacy_id, name, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING id`,
      ['rec081' + seqNo, 'TEST 081 ' + n + ' ' + seqNo, TOWN[n][0], TOWN[n][1]])).id;
  }
  return out;
}
const truck = async (db) => (await one(db, `INSERT INTO trucks (license_plate) VALUES ($1) RETURNING id`, ['TEST-081-' + (++seqNo)])).id;
const client = async (db) => (await one(db, `INSERT INTO clients (company_name) VALUES ('TEST 081 client') RETURNING id`)).id;
// a point loaded on day kl and delivered on day kd, each a whole day (the form's pre-fill since 28/10)
async function day(db, o, d, kl, kd = kl, pallets = 6) {
  return { origin_location_id: o, dest_location_id: d, pallets, load_from: await T(db, kl, '00:00'), load_to: await T(db, kl, '23:59'),
    deliver_from: await T(db, kd, '00:00'), deliver_to: await T(db, kd, '23:59') };
}
async function stop(db, ref, loc, side, k) {
  return { ref, location_id: loc, side, planned_from: await T(db, k, '00:00'), planned_to: await T(db, k, '23:59') };
}
// one national order of these points, onto a target (a new cycle, or an existing one with its own new stops)
async function create(db, cl, side, shipments, target, stops) {
  return (await one(db, `SELECT plan_orders_create($1::jsonb, 'test:081', 'dispatcher') AS r`, [JSON.stringify({
    request_id: crypto.randomUUID(), target, stops,
    orders: [{ client_id: cl, price: 100, reference: 'WN081-TEST', goods: 'TEST', pallet_exchange: false, direction: side, shipments }] })])).r;
}
const update = async (db, body) => (await one(db, `SELECT plan_order_update($1::jsonb, 'test:081', 'dispatcher') AS r`, [JSON.stringify(body)])).r;
const order = async (db, rt) => (await db.query(`SELECT id, location_id, seq, planned_from, planned_to FROM rt_stops
  WHERE rt_id = $1 AND deleted_at IS NULL ORDER BY seq`, [rt])).rows;
const namesOf = (rows, L) => rows.map((x) => Object.keys(L).find((n) => L[n] === x.location_id));
const shipOf = async (db, natId) => (await one(db, `SELECT * FROM shipments WHERE nat_order_id = $1 AND deleted_at IS NULL ORDER BY id LIMIT 1`, [natId]));

// F28, RT-1300's shape: ANODOS on one day, all windows 00:00-23:59. National #90 Aspropyrgos -> Alexandria makes the
// cycle; national #91 Dimini -> Kopanos joins it. The road north: Aspropyrgos, Dimini, Alexandria, Kopanos.
const f28 = (db) => scenario(db, async () => {
  const L = await places(db, ['asp', 'alx', 'dim', 'kop']);
  const cl = await client(db), trk = await truck(db);
  const a = await create(db, cl, 'ANODOS', [await day(db, L.asp, L.alx, 20)], { new_rt: { trip_type: 'OWNED', truck_id: trk }, side: 'ANODOS' },
    [await stop(db, 'a', L.asp, 'ANODOS', 20), await stop(db, 'b', L.alx, 'ANODOS', 20)]);
  const rt = a.ids.rt_id;
  await create(db, cl, 'ANODOS', [await day(db, L.dim, L.kop, 20)], { rt_id: rt, side: 'ANODOS' },
    [await stop(db, 'c', L.dim, 'ANODOS', 20), await stop(db, 'd', L.kop, 'ANODOS', 20)]);
  const seqAudit = Number((await one(db, `SELECT count(*) AS n FROM audit_log WHERE table_name = 'rt_stops' AND action = 'update'
    AND record_id IN (SELECT id::text FROM rt_stops WHERE rt_id = $1) AND after_data ? 'seq'`, [rt])).n);
  return { names: namesOf(await order(db, rt), L), seqAudit };
});
// RT-1306's shape: KATHODOS Kozani -> three points in Athens 1-3 km apart, entered ath1, ath2, ath3 (the order of the
// international's unloadings); ath2 is the nearest to Kozani. One place: the dispatcher's order stays.
const town = (db) => scenario(db, async () => {
  const L = await places(db, ['kozani', 'ath1', 'ath2', 'ath3']);
  const cl = await client(db), trk = await truck(db);
  const a = await create(db, cl, 'KATHODOS', [await day(db, L.kozani, L.ath1, 20), await day(db, L.kozani, L.ath2, 20), await day(db, L.kozani, L.ath3, 20)],
    { new_rt: { trip_type: 'OWNED', truck_id: trk }, side: 'KATHODOS' },
    [await stop(db, 'k', L.kozani, 'KATHODOS', 20), await stop(db, 'x1', L.ath1, 'KATHODOS', 20), await stop(db, 'x2', L.ath2, 'KATHODOS', 20),
     await stop(db, 'x3', L.ath3, 'KATHODOS', 20)]);
  return { names: namesOf(await order(db, a.ids.rt_id), L) };
});
// RT-1315's shape: ANODOS only, Aspropyrgos, Sparti, Korinthia entered in that order, all to Veroia two days later
const climb = (db) => scenario(db, async () => {
  const L = await places(db, ['asp', 'sparti', 'korinthia', 'veroia']);
  const cl = await client(db), trk = await truck(db);
  const a = await create(db, cl, 'ANODOS', [await day(db, L.asp, L.veroia, 20, 22), await day(db, L.sparti, L.veroia, 20, 22), await day(db, L.korinthia, L.veroia, 20, 22)],
    { new_rt: { trip_type: 'OWNED', truck_id: trk }, side: 'ANODOS' },
    [await stop(db, 'a', L.asp, 'ANODOS', 20), await stop(db, 's', L.sparti, 'ANODOS', 20), await stop(db, 'k', L.korinthia, 'ANODOS', 20),
     await stop(db, 'v', L.veroia, 'ANODOS', 22)]);
  return { names: namesOf(await order(db, a.ids.rt_id), L) };
});
// A cycle whose same-time group is EXECUTED (day -3): a later re-sequence of the cycle leaves that group in the order
// it ran in (F28's entry order, as RT-1300 on 27/10)
const ran = (db) => scenario(db, async () => {
  const L = await places(db, ['asp', 'alx', 'dim', 'kop']);
  const cl = await client(db), trk = await truck(db);
  const a = await create(db, cl, 'ANODOS', [await day(db, L.asp, L.alx, -3), await day(db, L.dim, L.kop, -3)],
    { new_rt: { trip_type: 'OWNED', truck_id: trk }, side: 'ANODOS' },
    [await stop(db, 'a', L.asp, 'ANODOS', -3), await stop(db, 'b', L.alx, 'ANODOS', -3), await stop(db, 'c', L.dim, 'ANODOS', -3),
     await stop(db, 'd', L.kop, 'ANODOS', -3)]);
  const rt = a.ids.rt_id;
  const before = namesOf(await order(db, rt), L);
  await db.query(`SELECT plan_h_reseq($1, 'test:081', 'dispatcher')`, [rt]);
  return { before, after: namesOf(await order(db, rt), L) };
});

// 081 part 2: one national Kozani -> Athens riding a KATHODOS cycle alone on day k. The form moves its delivery to
// day k+1 (+ opts.days; and, with opts.both, its loading to day k-1). opts.shared: a second national Larisa -> Athens
// shares the Athens stop. opts.busy: the same truck has another cycle on day k+1. opts.past: the cycle ran (k = -3).
// opts.anodos: an ANODOS pair on day k+1 (a delivery moved past it breaks stop_order).
const follow = (db, opts = {}) => scenario(db, async () => {
  const L = await places(db, ['kozani', 'larisa', 'ath1', 'dim', 'asp', 'kop']);
  const cl = await client(db), trk = await truck(db);
  const k = opts.past ? -3 : 20;
  const a = await create(db, cl, 'KATHODOS', [await day(db, L.kozani, L.ath1, k)], { new_rt: { trip_type: 'OWNED', truck_id: trk }, side: 'KATHODOS' },
    [await stop(db, 'a', L.kozani, 'KATHODOS', k), await stop(db, 'b', L.ath1, 'KATHODOS', k)]);
  const rt = a.ids.rt_id, nat = a.ids.nat_order_ids[0];
  let other = null;
  if (opts.shared) {
    const bStop = (await order(db, rt)).find((x) => x.location_id === L.ath1).id;
    other = await create(db, cl, 'KATHODOS', [await day(db, L.larisa, L.ath1, k)], { rt_id: rt, side: 'KATHODOS' },
      [await stop(db, 'l', L.larisa, 'KATHODOS', k), { ref: 'b', stop_id: bStop }]);
  }
  if (opts.anodos) {
    await create(db, cl, 'ANODOS', [await day(db, L.asp, L.kop, k + 1)], { rt_id: rt, side: 'ANODOS' },
      [await stop(db, 'p', L.asp, 'ANODOS', k + 1), await stop(db, 'q', L.kop, 'ANODOS', k + 1)]);
  }
  if (opts.busy) {
    await create(db, cl, 'KATHODOS', [await day(db, L.dim, L.kop, k + 1)], { new_rt: { trip_type: 'OWNED', truck_id: trk }, side: 'KATHODOS' },
      [await stop(db, 'd', L.dim, 'KATHODOS', k + 1), await stop(db, 'e', L.kop, 'KATHODOS', k + 1)]);
  }
  await db.exec('SET CONSTRAINTS ALL IMMEDIATE');   // the assignments' own requests end here (their COMMIT)
  const sh0 = await shipOf(db, nat);
  const stops0 = await order(db, rt);
  const audit0 = Number((await one(db, `SELECT coalesce(max(id), 0) AS n FROM audit_log`)).n);
  const kd = k + 1 + (opts.days ?? 0);
  const ship = opts.pallets ? { shipment_id: sh0.id, pallets: 4 }
    : { shipment_id: sh0.id, deliver_from: await T(db, kd, '00:00'), deliver_to: await T(db, kd, '23:59') };
  if (opts.both) Object.assign(ship, { load_from: await T(db, k - 1, '00:00'), load_to: await T(db, k - 1, '23:59') });
  let ans = null, err = null;
  await db.exec('SAVEPOINT u');
  try { ans = await update(db, { nat_order_id: nat, shipments: [ship] }); await db.exec('RELEASE SAVEPOINT u'); }
  catch (e) { err = { msg: String(e.message), hint: e.hint ?? null }; await db.exec('ROLLBACK TO SAVEPOINT u'); }
  const stops1 = await order(db, rt);
  const sh1 = await shipOf(db, nat);
  const rt1 = await one(db, `SELECT start_at, end_at FROM ct_round_trips WHERE id = $1`, [rt]);
  const auditStops = Number((await one(db, `SELECT count(*) AS n FROM audit_log WHERE id > $1 AND table_name = 'rt_stops' AND action = 'update'`, [audit0])).n);
  const iso = (x) => x && new Date(x).toISOString();
  const at = (rows, loc) => iso(rows.find((x) => x.location_id === loc).planned_from);
  return { ans, err, auditStops, rt1, B0: at(stops0, L.ath1), B1: at(stops1, L.ath1), A0: at(stops0, L.kozani), A1: at(stops1, L.kozani),
    want: iso(ship.deliver_from), wantLoad: iso(ship.load_from), shipDeliver: iso(sh1.deliver_from), shipDeliver0: iso(sh0.deliver_from),
    otherShip: other ? (await shipOf(db, other.ids.nat_order_ids[0])).id : null, stopB: stops0.find((x) => x.location_id === L.ath1).id };
});

test('081 on the production-shaped copy (31/10): F28 and the stop that stays reproduced on the live texts, gone after 081', async (t) => {
  const db = await prodShaped074();
  for (const f of ['075_plan_order_side.sql', '076_plan_board_speed.sql', '077_plan_order_edit.sql', '078_audit_actions.sql']) await db.exec(read(f));
  await db.exec(`DELETE FROM monitoring.checks WHERE id = 'B-100'`);
  await db.exec(read('080_plan_optional_price_pallets.sql'));
  // the hub's coordinates, as production holds them (the copy's hub row has none)
  await db.exec(`UPDATE locations SET latitude = ${TOWN.veroia[0]}, longitude = ${TOWN.veroia[1]} WHERE is_hub`);
  const src = read('081_plan_stop_order_follows.sql');
  const F = facts(src);

  await t.test('the copy holds the LIVE texts 081 guards on (production md5, SELECT 31/10)', async () => {
    assert.deepStrictEqual(await md5s(db), LIVE);
    assert.deepStrictEqual(F.gen.map((g) => F.live[g.sig]), LIVE, 'PART 0 names the production md5');
    assert.strictEqual(await md5Of(db, 'public.plan_rt_update(jsonb,text,text)'), RT_UPDATE);
  });

  await t.test('NO-GO on the live texts: F28 - RT-1300 comes out 386 -> 778 -> 904 -> 541 (entry order)', async () => {
    const r = await f28(db);
    assert.strictEqual(r.late, null);
    assert.deepStrictEqual(r.names, ['asp', 'alx', 'dim', 'kop']);
  });
  await t.test('live: one town (RT-1306) and the climb (RT-1315) both keep entry order', async () => {
    assert.deepStrictEqual((await town(db)).names, ['kozani', 'ath1', 'ath2', 'ath3']);
    assert.deepStrictEqual((await climb(db)).names, ['asp', 'sparti', 'korinthia', 'veroia']);
  });
  await t.test('NO-GO on the live texts: a point riding ALONE moves a day, its truck stop stays where it was', async () => {
    const r = await follow(db);
    assert.strictEqual(r.err, null, JSON.stringify(r.err));
    assert.strictEqual(r.shipDeliver, r.want, 'the point moved');
    assert.strictEqual(r.B1, r.B0, 'the stop stayed (F30: a second step)');
    assert.strictEqual(r.auditStops, 0);
  });

  await t.test('081 dry run keeps nothing', async () => {
    const msg = (await execErr(db, read('081_plan_stop_order_follows_dryrun.sql')))?.msg ?? '';
    assert.match(msg, /DRY RUN 081 finished - EVERYTHING UNDONE/);
    assert.match(msg, new RegExp(`081 ran: reseq ${F.gen[0].m}, order_update ${F.gen[1].m}`));
    assert.deepStrictEqual(await md5s(db), LIVE);
  });

  await t.test('081 applies; the texts are the generated ones, the rights as before, plan_rt_update untouched', async () => {
    const rights = async () => (await db.query(`SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [SIGS])).rows;
    const acl0 = await rights();
    await db.exec(src);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    assert.deepStrictEqual(await rights(), acl0);
    assert.strictEqual(await md5Of(db, 'public.plan_rt_update(jsonb,text,text)'), RT_UPDATE);
    const v = await one(db, read('081_plan_stop_order_follows_verify.sql'));
    assert.strictEqual(v.applied, '081 in place');
    assert.strictEqual(Number(v.changed_texts), 0);
    assert.strictEqual(v.rt_update_untouched, true);
    assert.strictEqual(v.order_update_via_rt_update, true);
    assert.strictEqual(Number(v.order_broken), 0);
    assert.strictEqual(Number(v.legs_broken), 0);
  });

  await t.test('081 a second time is refused by its guard, nothing changes', async () => {
    assert.match((await execErr(db, src))?.msg ?? '', /is not its live text of 31\/10/);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
  });

  await t.test('GO: F28 - RT-1300 by the road: Aspropyrgos, Dimini, Alexandria, Kopanos; the moved stops have audit rows', async () => {
    const r = await f28(db);
    assert.strictEqual(r.late, null, 'leg_order / stop_order hold');
    assert.deepStrictEqual(r.names, ['asp', 'dim', 'alx', 'kop']);
    assert.ok(r.seqAudit >= 2, `audit rows for the re-sequenced stops: ${r.seqAudit}`);
  });
  await t.test('GO: one town (RT-1306, 1-3 km apart) keeps the dispatcher\'s order', async () => {
    assert.deepStrictEqual((await town(db)).names, ['kozani', 'ath1', 'ath2', 'ath3']);
  });
  await t.test('GO: ANODOS from the far end up (RT-1315): Sparti, Korinthia, Aspropyrgos, Veroia', async () => {
    const r = await climb(db);
    assert.strictEqual(r.late, null);
    assert.deepStrictEqual(r.names, ['sparti', 'korinthia', 'asp', 'veroia']);
  });
  await t.test('GO: an EXECUTED group keeps the order it ran in (history is not re-sequenced)', async () => {
    const r = await ran(db);
    assert.deepStrictEqual(r.before, ['asp', 'alx', 'dim', 'kop']);
    assert.deepStrictEqual(r.after, r.before);
  });

  await t.test('GO: a point riding ALONE moves a day - its truck stop follows in the same save, the cycle window too', async () => {
    const r = await follow(db);
    assert.strictEqual(r.err, null, JSON.stringify(r.err));
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.shipDeliver, r.want);
    assert.strictEqual(r.B1, r.want, 'the stop followed');
    assert.strictEqual(r.ans.ids.stops_moved.length, 1);
    assert.strictEqual(r.ans.ids.stops_moved[0].stop_id, r.stopB);
    assert.deepStrictEqual(r.ans.warnings, []);
    assert.ok(r.auditStops >= 1, 'the stop move has its audit row');
    assert.ok(new Date(r.rt1.end_at) > new Date(r.want), 'the cycle ends after the moved stop (plan_rt_window_sync)');
  });
  await t.test('GO: loading AND delivery move together - both stops follow, one call per cycle', async () => {
    const r = await follow(db, { both: true });
    assert.strictEqual(r.err, null, JSON.stringify(r.err));
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.A1, r.wantLoad);
    assert.strictEqual(r.B1, r.want);
    assert.strictEqual(r.ans.ids.stops_moved.length, 2);
  });
  await t.test('GO: a pallets-only change (no window) moves no stop and writes no stop row', async () => {
    const r = await follow(db, { pallets: true });
    assert.strictEqual(r.err, null, JSON.stringify(r.err));
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.B1, r.B0);
    assert.strictEqual(r.A1, r.A0);
    assert.deepStrictEqual(r.ans.ids.stops_moved, []);
    assert.deepStrictEqual(r.ans.warnings, []);
    assert.strictEqual(r.auditStops, 0);
  });
  await t.test('GO: a SHARED stop is not moved; the save keeps the point\'s window and names the other point', async () => {
    const r = await follow(db, { shared: true });
    assert.strictEqual(r.err, null, JSON.stringify(r.err));
    assert.strictEqual(r.shipDeliver, r.want, 'the point is saved');
    assert.strictEqual(r.B1, r.B0, 'the shared stop stays');
    assert.deepStrictEqual(r.ans.ids.stops_moved, []);
    const w = r.ans.warnings.find((x) => x.code === 'stop_kept');
    assert.strictEqual(w?.reason, 'shared', JSON.stringify(r.ans.warnings));
    assert.deepStrictEqual(w.others.map((o) => o.shipment_id), [r.otherShip]);
  });
  await t.test('GO: an EXECUTED stop is never moved; the answer says so', async () => {
    const r = await follow(db, { past: true });
    assert.strictEqual(r.err, null, JSON.stringify(r.err));
    assert.strictEqual(r.B1, r.B0);
    assert.strictEqual(r.ans.warnings.find((x) => x.code === 'stop_kept')?.reason, 'executed', JSON.stringify(r.ans.warnings));
  });
  await t.test('GO: the truck is busy that day on another cycle - truck_busy refuses the whole save, nothing written', async () => {
    const r = await follow(db, { busy: true });
    assert.strictEqual(r.err?.hint, 'plan:truck_busy', JSON.stringify(r.err));
    assert.strictEqual(r.shipDeliver, r.shipDeliver0, 'the point did not move either');
    assert.strictEqual(r.B1, r.B0);
  });
  await t.test('GO: the moved stop would come after the ANODOS ones - 071 stop_order refuses the whole save', async () => {
    const r = await follow(db, { anodos: true, days: 1 });
    assert.strictEqual(r.err?.hint, 'plan:stop_order', JSON.stringify(r.err));
    assert.strictEqual(r.shipDeliver, r.shipDeliver0);
    assert.strictEqual(r.B1, r.B0);
  });

  await t.test('081 rollback dry run keeps nothing; the rollback returns the live texts and the live behaviour', async () => {
    assert.match((await execErr(db, read('081_plan_stop_order_follows_rollback_dryrun.sql')))?.msg ?? '', /DRY RUN 081 ROLLBACK finished/);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    await db.exec(read('081_plan_stop_order_follows_rollback.sql'));
    assert.deepStrictEqual(await md5s(db), LIVE);
    assert.deepStrictEqual((await f28(db)).names, ['asp', 'alx', 'dim', 'kop']);
    const r = await follow(db);
    assert.strictEqual(r.B1, r.B0);
  });
});
