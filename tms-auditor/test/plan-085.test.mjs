// 085 (F62 the client of a national changes until it is invoiced; an invoiced price only from owner / accountant; the
// read says invoiced - owner 31/10) on the production-shaped PGlite copy as production holds it on 1/11:
// prod-shaped-074.mjs (072 ... 074a, 074, 074b) + 075, 076, 077, 078, 080, 082 (with its fixture) and 081 - the same
// copy as plan-081.test.mjs, plus 081 itself (executed 31/10). The live md5 of plan_order_update / plan_order_read are
// the ones measured in production (SELECT 1/11).
// Each scenario runs inside a transaction that is always rolled back: first on the LIVE texts (the client cannot be
// corrected, an invoiced price changes from any role, the read is silent = NO-GO), then after 085 (GO), then after the
// rollback (the live behaviour again). Every case reads ROWS (national_orders, audit_log, pl_movements), never only an
// answer. "Invoiced" is written as the invoicing screen writes it (invoiced + the ERP number, 043's guard holds).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts } from '../../worker/migrations/drafts/tools/build-085.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
async function execErr(db, sql) { try { await db.exec(sql); return null; } catch (e) { return { msg: String(e.message), hint: e.hint ?? null }; } }
const SIGS = ['public.plan_order_update(jsonb,text,text)', 'public.plan_order_read(bigint,text)'];
const LIVE = ['323eb4ccde77d1848c74a8b4ab310021', 'e29477dd275c5640bc7a6e06fbe4caf5'];   // production, SELECT 1/11
const md5Of = async (db, sig) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${sig}'::regprocedure`)).m;
const md5s = (db) => Promise.all(SIGS.map((s) => md5Of(db, s)));

let seqNo = 0;
const T = async (db, k, hm) => (await one(db, `SELECT (((now() AT TIME ZONE 'Europe/Athens')::date + $1::int) + $2::time) AT TIME ZONE 'Europe/Athens' AS t`, [k, hm])).t;
const client = async (db, name = 'TEST 085 client') => (await one(db, `INSERT INTO clients (company_name) VALUES ($1) RETURNING id`, [name + ' ' + (++seqNo)])).id;
const place = async (db) => (await one(db, `INSERT INTO locations (legacy_id, name, latitude, longitude) VALUES ($1, $2, 40.3, 21.8) RETURNING id`,
  ['rec085' + (++seqNo), 'TEST 085 place ' + seqNo])).id;
const truck = async (db) => (await one(db, `INSERT INTO trucks (license_plate) VALUES ($1) RETURNING id`, ['TEST-085-' + (++seqNo)])).id;

// One national on a new cycle (KATHODOS, day 20), with pallet exchange: its legs write pending pallet rows (073).
// opts.invoiced: then marked invoiced as the invoicing screen does it (number + price, the 043 guard).
async function order(db, opts = {}) {
  const cl = await client(db), a = await place(db), b = await place(db), trk = await truck(db);
  const w = { load_from: await T(db, 20, '00:00'), load_to: await T(db, 20, '23:59'), deliver_from: await T(db, 20, '00:00'), deliver_to: await T(db, 20, '23:59') };
  const r = (await one(db, `SELECT plan_orders_create($1::jsonb, 'test:085', 'dispatcher') AS r`, [JSON.stringify({
    request_id: crypto.randomUUID(), target: { new_rt: { trip_type: 'OWNED', truck_id: trk }, side: 'KATHODOS' },
    stops: [{ ref: 'a', location_id: a, side: 'KATHODOS', planned_from: w.load_from, planned_to: w.load_to },
            { ref: 'b', location_id: b, side: 'KATHODOS', planned_from: w.deliver_from, planned_to: w.deliver_to }],
    orders: [{ client_id: cl, price: 100, reference: 'WN085-TEST', goods: 'TEST', pallet_exchange: true, direction: 'KATHODOS',
               shipments: [{ origin_location_id: a, dest_location_id: b, pallets: 6, ...w }] }] })])).r;
  const nat = r.ids.nat_order_ids[0];
  await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
  if (opts.invoiced) await db.query(`UPDATE national_orders SET invoiced = true, invoice_number = 'TPY-085', invoice_date = current_date WHERE id = $1`, [nat]);
  return { nat, client: cl };
}
// plan_order_update as the Worker calls it, with this role; a refusal is caught (savepoint), never the transaction's end
async function update(db, body, role) {
  await db.exec('SAVEPOINT u');
  try {
    const r = (await one(db, `SELECT plan_order_update($1::jsonb, 'test:085', $2) AS r`, [JSON.stringify(body), role])).r;
    await db.exec('RELEASE SAVEPOINT u');
    return { ans: r, err: null };
  } catch (e) {
    await db.exec('ROLLBACK TO SAVEPOINT u');
    return { ans: null, err: { msg: String(e.message), hint: e.hint ?? null } };
  }
}
const row = (db, nat) => one(db, `SELECT client_id, price, notes, invoiced FROM national_orders WHERE id = $1`, [nat]);
const clientAudits = async (db, nat) => (await db.query(`SELECT role, before_data->'client_id' AS b, after_data->'client_id' AS a FROM audit_log
  WHERE table_name = 'national_orders' AND action = 'update' AND after_data ? 'client_id'
    AND record_id = (SELECT legacy_id FROM national_orders WHERE id = $1) ORDER BY id`, [nat])).rows;
const pendingClients = async (db, nat) => (await db.query(`SELECT DISTINCT m.client_id FROM pl_movements m
  JOIN piece_legs l ON l.id = m.piece_leg_id JOIN shipment_pieces sp ON sp.id = l.piece_id JOIN shipments sh ON sh.id = sp.shipment_id
  WHERE sh.nat_order_id = $1 AND m.status = 'pending'`, [nat])).rows.map((x) => Number(x.client_id));
// A scenario inside a transaction that is always rolled back; the deferred rules fire before it ends
async function scenario(db, steps) {
  await db.exec('BEGIN');
  try {
    const out = await steps();
    const late = await execErr(db, 'SET CONSTRAINTS ALL IMMEDIATE');
    return { ...out, late };
  } finally { await db.exec('ROLLBACK'); }
}

// The client of an order changes (role), its price changes (role), on an order invoiced or not
const change = (db, { invoiced = false, role = 'dispatcher', what = 'client', value } = {}) => scenario(db, async () => {
  const o = await order(db, { invoiced });
  const other = await client(db, 'TEST 085 other');
  const set = what === 'client' ? { client_id: value === undefined ? other : value }
    : what === 'price' ? { price: value === undefined ? 250 : value }
    : what === 'same' ? { client_id: o.client, price: 100, notes: 'TEST 085 same values back' } : {};
  const before = await row(db, o.nat);
  const u = await update(db, { nat_order_id: o.nat, set }, role);
  return { ...u, o, other, before, after: await row(db, o.nat), audits: await clientAudits(db, o.nat), pending: await pendingClients(db, o.nat) };
});
const readOf = (db, invoiced) => scenario(db, async () => {
  const o = await order(db, { invoiced });
  return { read: (await one(db, `SELECT plan_order_read($1, 'dispatcher') AS r`, [o.nat])).r };
});

test('085 on the production-shaped copy (1/11): the client cannot be corrected and an invoiced price is open to every role on the live texts; after 085 the base holds both', async (t) => {
  const db = await prodShaped074();
  for (const f of ['075_plan_order_side.sql', '076_plan_board_speed.sql', '077_plan_order_edit.sql', '078_audit_actions.sql']) await db.exec(read(f));
  await db.exec(`DELETE FROM monitoring.checks WHERE id = 'B-100'`);
  await db.exec(read('080_plan_optional_price_pallets.sql'));
  await db.exec(fs.readFileSync(new URL('./fixtures/live-082.sql', import.meta.url), 'utf8'));
  // B-54 as production holds it (= the enabled triggers): 081's guard and 085's compare the two
  await db.query(`UPDATE monitoring.checks SET red_value = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') WHERE id = 'B-54'`);
  await db.exec(read('082_plan_bridge_keeps_cycles.sql'));
  await db.exec(read('081_plan_stop_order_follows.sql'));
  const src = read('085_plan_invoiced_client_price.sql');
  const F = facts(src);

  await t.test('the copy holds the LIVE texts 085 guards on (production md5, SELECT 1/11)', async () => {
    assert.deepStrictEqual(await md5s(db), LIVE);
    assert.deepStrictEqual(F.gen.map((g) => F.live[g.sig]), LIVE, 'PART 0 names the production md5');
  });

  await t.test('NO-GO on the live texts (F62): a client correction is refused as an unknown field, nothing written', async () => {
    const r = await change(db);
    assert.match(r.err?.msg ?? '', /bad_input:set/);
    assert.strictEqual(Number(r.after.client_id), r.o.client);
  });
  await t.test('NO-GO on the live texts: an INVOICED order\'s price changes from the dispatcher', async () => {
    const r = await change(db, { invoiced: true, what: 'price' });
    assert.strictEqual(r.err, null, JSON.stringify(r.err));
    assert.strictEqual(Number(r.after.price), 250);
  });
  await t.test('NO-GO on the live texts: the read does not say invoiced (the form cannot lock)', async () => {
    assert.ok(!('invoiced' in (await readOf(db, true)).read.order));
  });

  await t.test('085 dry run keeps nothing', async () => {
    const msg = (await execErr(db, read('085_plan_invoiced_client_price_dryrun.sql')))?.msg ?? '';
    assert.match(msg, /DRY RUN 085 finished - EVERYTHING UNDONE/);
    assert.match(msg, new RegExp(`085 ran: order_update ${F.gen[0].m}, order_read ${F.gen[1].m}`));
    assert.deepStrictEqual(await md5s(db), LIVE);
  });

  await t.test('085 applies; the texts are the generated ones, the rights as before; verify reads it', async () => {
    const rights = async () => (await db.query(`SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [SIGS])).rows;
    const acl0 = await rights();
    await db.exec(src);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    assert.deepStrictEqual(await rights(), acl0);
    const v = await one(db, read('085_plan_invoiced_client_price_verify.sql'));
    assert.strictEqual(v.applied, '085 in place');
    assert.strictEqual(Number(v.changed_texts), 0);
    assert.strictEqual(v.update_knows_client, true);
    assert.strictEqual(v.read_says_invoiced, true);
  });

  await t.test('085 a second time is refused by its guard, nothing changes', async () => {
    assert.match((await execErr(db, src))?.msg ?? '', /is not its live text of 1\/11/);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
  });

  await t.test('GO: the read says invoiced, true or false (never missing)', async () => {
    assert.strictEqual((await readOf(db, true)).read.order.invoiced, true);
    assert.strictEqual((await readOf(db, false)).read.order.invoiced, false);
  });
  for (const role of ['dispatcher', 'warehouse', 'management', 'accountant', 'owner']) {
    await t.test(`GO: not invoiced - ${role} corrects the client; the audit row has before / after; the pending pallet rows follow`, async () => {
      const r = await change(db, { role });
      assert.strictEqual(r.err, null, JSON.stringify(r.err));
      assert.strictEqual(r.late, null);
      assert.strictEqual(Number(r.after.client_id), r.other);
      assert.deepStrictEqual(r.audits.map((a) => [a.role, Number(a.b), Number(a.a)]), [[role, r.o.client, r.other]]);
      assert.deepStrictEqual(r.pending, [r.other], 'the order\'s pending pallet rows carry the new client');
    });
  }
  for (const role of ['dispatcher', 'accountant', 'owner']) {
    await t.test(`GO: INVOICED - ${role} cannot change the client (invoiced_client), nothing written`, async () => {
      const r = await change(db, { invoiced: true, role });
      assert.strictEqual(r.err?.hint, 'plan:invoiced_client', JSON.stringify(r.err));
      assert.strictEqual(Number(r.after.client_id), r.o.client);
      assert.deepStrictEqual(r.audits, []);
      assert.deepStrictEqual(r.pending, [r.o.client]);
    });
  }
  for (const role of ['dispatcher', 'warehouse', 'management']) {
    await t.test(`GO: INVOICED - ${role} cannot change the price (invoiced_price), nothing written`, async () => {
      const r = await change(db, { invoiced: true, role, what: 'price' });
      assert.strictEqual(r.err?.hint, 'plan:invoiced_price', JSON.stringify(r.err));
      assert.strictEqual(Number(r.after.price), 100);
    });
  }
  for (const role of ['accountant', 'owner']) {
    await t.test(`GO: INVOICED - ${role} changes the price`, async () => {
      const r = await change(db, { invoiced: true, role, what: 'price' });
      assert.strictEqual(r.err, null, JSON.stringify(r.err));
      assert.strictEqual(r.late, null);
      assert.strictEqual(Number(r.after.price), 250);
    });
  }
  await t.test('GO: not invoiced - the dispatcher changes the price, as before 085', async () => {
    const r = await change(db, { what: 'price' });
    assert.strictEqual(r.err, null, JSON.stringify(r.err));
    assert.strictEqual(Number(r.after.price), 250);
  });
  await t.test('GO: INVOICED - the same client and price sent back with a note: the note is saved, nothing refused', async () => {
    const r = await change(db, { invoiced: true, what: 'same' });
    assert.strictEqual(r.err, null, JSON.stringify(r.err));
    assert.strictEqual(r.after.notes, 'TEST 085 same values back');
    assert.strictEqual(Number(r.after.price), 100);
    assert.deepStrictEqual(r.audits, [], 'no client change written');
  });
  await t.test('GO: a client that is not there, or gone, or null, is no_client; a non-number is bad_input', async () => {
    assert.strictEqual((await change(db, { value: 999999999 })).err?.hint, 'plan:no_client');
    assert.strictEqual((await change(db, { value: null })).err?.hint, 'plan:no_client');
    assert.strictEqual((await change(db, { value: 'abc' })).err?.hint, 'plan:bad_input');
    assert.strictEqual((await change(db, { value: 12.5 })).err?.hint, 'plan:bad_input');
    const gone = await scenario(db, async () => {
      const o = await order(db);
      const g = await client(db, 'TEST 085 gone');
      await db.query(`UPDATE clients SET deleted_at = now() WHERE id = $1`, [g]);
      return { ...(await update(db, { nat_order_id: o.nat, set: { client_id: g } }, 'dispatcher')), after: await row(db, o.nat), o };
    });
    assert.strictEqual(gone.err?.hint, 'plan:no_client');
    assert.strictEqual(Number(gone.after.client_id), gone.o.client);
  });

  await t.test('085 rollback dry run keeps nothing; the rollback returns the live texts and the live behaviour', async () => {
    assert.match((await execErr(db, read('085_plan_invoiced_client_price_rollback_dryrun.sql')))?.msg ?? '', /DRY RUN 085 ROLLBACK finished/);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    await db.exec(read('085_plan_invoiced_client_price_rollback.sql'));
    assert.deepStrictEqual(await md5s(db), LIVE);
    assert.match((await change(db)).err?.msg ?? '', /bad_input:set/);
    assert.strictEqual((await change(db, { invoiced: true, what: 'price' })).err, null);
  });
});
