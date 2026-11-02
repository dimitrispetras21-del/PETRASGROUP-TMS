// 101 (owner 2/11/2026, "Aftoparadosi" = self delivery: invoiced without an ERP transport invoice) on PGlite, the local
// Postgres the auditor already uses (no network, nothing reaches production).
// The copy: the fixture's orders / national_orders, invoice_mark_guard() and its two triggers from 043's file (its text
// IS the live one: md5 asserted), B-11 / B-12 as the 047b seed holds them (= production, md5 asserted), and two
// STAND-IN views that end exactly like the live ones (the anchors "o.temp_per_cmr / FROM" and "id AS order_no / FROM
// national_orders n"). The live view texts cannot be rebuilt here (orders_with_derived_old3 and friends), so the md5 of
// the two views - and only those two constants - are swapped for the stand-ins' before 101 runs; every other guard runs
// on its production value. The stand-ins carry a role grant and a default privilege, as Supabase's would, so the
// rollback's "owner and rights back" is proven, not assumed.
// Each case reads ROWS (orders, national_orders, monitoring.checks, pg_catalog), never only an answer.
// Run: cd tms-auditor && npm install && node --test test/plan-101.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createDb, migrationFile } from '../lib/db.mjs';
import { facts, generated, GEN_MD5 } from '../../worker/migrations/drafts/tools/build-101.mjs';

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }

const SRC = read('101_self_delivery.sql');
const F = facts(SRC).consts;

// grants: false = views never granted (relacl NULL), so the rollback's "rights back" meets a NULL ACL
async function copy({ grants = true } = {}) {
  const db = await createDb({ v5: false });
  // 101 ran 2/11: the fixture has the column and the catalog the new B-11 / B-12 texts. Back to the state 101 met
  // (its guards: no column, the old texts) - the replace is 101's own hunk in reverse.
  await db.exec(`ALTER TABLE public.orders DROP COLUMN self_delivery; ALTER TABLE public.national_orders DROP COLUMN self_delivery;
    UPDATE monitoring.checks SET sql_text = replace(sql_text, '${F.chk_b}', '${F.chk_a}'), ids_sql = replace(ids_sql, '${F.chk_b}', '${F.chk_a}')
     WHERE id IN ('B-11', 'B-12')`);
  await db.exec(read('043_invoice_mark_guard.sql'));
  await db.exec(`
    CREATE ROLE t101_reader; CREATE ROLE t101_anon;
    -- as live: v = the older derived view, o = orders itself (temp_per_cmr came with 065, after the fixture's snapshot)
    ALTER TABLE public.orders ADD COLUMN temp_per_cmr boolean NOT NULL DEFAULT false;
    CREATE VIEW public.orders_with_derived AS
      SELECT v.id, v.legacy_id, v.price, v.invoiced, v.invoice_number, o.temp_per_cmr
        FROM (SELECT id, legacy_id, price, invoiced, invoice_number FROM public.orders) v JOIN public.orders o ON o.id = v.id;
    CREATE VIEW public.national_orders_with_derived AS
      SELECT id, legacy_id, price, invoiced, invoice_number, id AS order_no FROM public.national_orders n;
    SET search_path = public;`);
  if (grants) await db.exec(`
    GRANT SELECT ON public.orders_with_derived, public.national_orders_with_derived TO t101_reader;
    -- what Supabase does to every new relation in public (principle 5): the rollback's CREATE VIEW meets it
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO t101_anon;`);
  await db.exec(`UPDATE monitoring.checks SET red_value = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND n.nspname = 'public'), baseline = NULL WHERE id = 'B-54'`);
  const owd = (await one(db, `SELECT md5(pg_get_viewdef('public.orders_with_derived'::regclass)) AS m`)).m;
  const nowd = (await one(db, `SELECT md5(pg_get_viewdef('public.national_orders_with_derived'::regclass)) AS m`)).m;
  // the ONLY two constants swapped (see the header): every file the owner runs reads them from the same two lines
  const adapt = (sql) => {
    const out = sql.replace(`c_owd_live CONSTANT text := '${F.c_owd_live}'`, `c_owd_live CONSTANT text := '${owd}'`)
      .replace(`c_nowd_live CONSTANT text := '${F.c_nowd_live}'`, `c_nowd_live CONSTANT text := '${nowd}'`);
    assert.strictEqual(out.split(`c_owd_live CONSTANT text := '${owd}'`).length, 2, 'c_owd_live swapped, once');
    assert.strictEqual(out.split(`c_nowd_live CONSTANT text := '${nowd}'`).length, 2, 'c_nowd_live swapped, once');
    return out;
  };
  return { db, adapt, owd };
}
const state = async (db) => one(db, `SELECT
  (SELECT count(*)::int FROM pg_attribute WHERE attname = 'self_delivery' AND NOT attisdropped
     AND attrelid IN ('public.orders'::regclass, 'public.national_orders'::regclass)) AS cols,
  (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.invoice_mark_guard()'::regprocedure) AS fn,
  (SELECT string_agg(pg_get_triggerdef(oid), ' | ' ORDER BY tgname) FROM pg_trigger WHERE tgfoid = 'public.invoice_mark_guard()'::regprocedure) AS trg,
  (SELECT md5(sql_text) FROM monitoring.checks WHERE id = 'B-11') AS b11, (SELECT md5(sql_text) FROM monitoring.checks WHERE id = 'B-12') AS b12,
  (SELECT md5(pg_get_viewdef('public.orders_with_derived'::regclass))) AS owd,
  (SELECT md5(pg_get_viewdef('public.national_orders_with_derived'::regclass))) AS nowd,
  (SELECT relacl::text FROM pg_class WHERE oid = 'public.orders_with_derived'::regclass) AS acl_o,
  (SELECT relacl::text FROM pg_class WHERE oid = 'public.national_orders_with_derived'::regclass) AS acl_n`);
// one write per call, inside a savepoint: a refusal leaves the case usable and the row is read after it
async function write(db, sql) {
  await db.exec('SAVEPOINT w');
  try { await db.exec(sql); await db.exec('RELEASE SAVEPOINT w'); return null; }
  catch (e) { await db.exec('ROLLBACK TO SAVEPOINT w'); return String(e.message); }
}
const row = (db, t, id) => one(db, `SELECT invoiced, invoice_number, invoice_date::text AS d, price::text AS price, to_jsonb(x)->>'self_delivery' AS sd
  FROM public.${t} x WHERE legacy_id = $1`, [id]);

test('101 on the copy: before, dry run, GO, refusals, auditor, second run, rollback', async (t) => {
  const { db, adapt, owd } = await copy();
  const live = await state(db);

  await t.test('the copy holds the live texts 101 guards on: 043 (md5), its triggers, B-11 / B-12 (md5); GEN_MD5 = the hunks', async () => {
    assert.strictEqual(live.fn, F.c_fn_live);
    assert.strictEqual(live.trg, `${F.c_trg_n} | ${F.c_trg_o}`);
    assert.strictEqual(live.b11, F.c_b11_sql);
    assert.strictEqual(live.b12, F.c_b12_sql);
    const src = (await one(db, `SELECT prosrc FROM pg_proc WHERE oid = 'public.invoice_mark_guard()'::regprocedure`)).prosrc;
    const b = await one(db, `SELECT (SELECT sql_text FROM monitoring.checks WHERE id = 'B-11') AS b11, (SELECT sql_text FROM monitoring.checks WHERE id = 'B-12') AS b12`);
    const g = generated(src, b.b11, b.b12);
    assert.deepStrictEqual({ fn: md5(g.fn), b11: md5(g.b11), b12: md5(g.b12) }, GEN_MD5);
  });

  await t.test('NO-GO on 043: invoiced without a number or without a price is refused (there is no self delivery yet)', async () => {
    await db.exec(`BEGIN; INSERT INTO orders (legacy_id, price, invoiced) VALUES ('rec101N', 1200, false), ('rec101P', NULL, false)`);
    assert.match(await write(db, `UPDATE orders SET invoiced = true WHERE legacy_id = 'rec101N'`) ?? '', /ΤΠΥ/);
    assert.match(await write(db, `UPDATE orders SET invoiced = true, invoice_number = 'T-1' WHERE legacy_id = 'rec101P'`) ?? '', /τιμή/);
    assert.strictEqual((await row(db, 'orders', 'rec101N')).invoiced, false);
    await db.exec('ROLLBACK');
  });

  await t.test('verify before 101 says so (it runs before the column exists)', async () => {
    const v = await one(db, read('101_self_delivery_verify.sql'));
    assert.deepStrictEqual([v.applied, Number(v.columns), Number(v.checks), v.b11_b12], ['before 101', 0, 0, 'old']);
  });

  await t.test('the dry run keeps nothing and names the md5 it ends on', async () => {
    const msg = await errorOf(db, adapt(read('101_self_delivery_dryrun.sql')));
    assert.match(msg ?? '', /DRY RUN 101 finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}101 ran: columns 2, guard /, msg);
    assert.ok(msg.includes(`guard ${GEN_MD5.fn}, triggers on self_delivery 2, views end on it 2, b11 ${GEN_MD5.b11}, b12 ${GEN_MD5.b12}`), msg);
    assert.deepStrictEqual(await state(db), live);
  });

  await t.test('101 runs: the column, the guard, the triggers, the views (owner and rights kept), B-11 / B-12', async () => {
    assert.strictEqual(await errorOf(db, adapt(SRC)), null);
    const s = await state(db);
    assert.strictEqual(s.cols, 2);
    assert.strictEqual(s.fn, GEN_MD5.fn);
    assert.strictEqual(s.trg, `${F.c_trg_n.replace('price ON', 'price, self_delivery ON')} | ${F.c_trg_o.replace('price ON', 'price, self_delivery ON')}`);
    assert.deepStrictEqual([s.b11, s.b12], [GEN_MD5.b11, GEN_MD5.b12]);
    assert.deepStrictEqual([s.acl_o, s.acl_n], [live.acl_o, live.acl_n]);
    assert.notStrictEqual(s.owd, owd);
    const last = await db.query(`SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod) AS ty FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname IN ('orders_with_derived', 'national_orders_with_derived') AND a.attnum = (SELECT max(attnum) FROM pg_attribute x WHERE x.attrelid = a.attrelid) ORDER BY 1`);
    assert.deepStrictEqual(last.rows.map((r) => `${r.relname}.${r.attname}:${r.ty}`), ['national_orders_with_derived.self_delivery:boolean', 'orders_with_derived.self_delivery:boolean']);
    assert.match(await errorOf(db, adapt(SRC)) ?? '', /101: self_delivery already exists - 101 ran/, 'a second run stops');
    // verify (read only) on the copy: the stand-in views do not change what it reads
    const v = await one(db, read('101_self_delivery_verify.sql'));
    assert.deepStrictEqual([v.applied, Number(v.columns), Number(v.checks), Number(v.triggers_on_self), Number(v.views_end_on_it), v.b11_b12],
      ['101 in place', 2, 2, 2, 2, 'new']);
  });

  await t.test('GO and the refusals after 101 (one transaction, rolled back)', async (tt) => {
    await db.exec(`BEGIN; INSERT INTO orders (legacy_id, price, invoiced) VALUES ('rec101A', NULL, false), ('rec101B', 800, false);
      INSERT INTO national_orders (legacy_id, price, invoiced) VALUES ('rec101C', NULL, false)`);
    await tt.test('invoiced as a self delivery with no number (and no price) - kept; read back through both views', async () => {
      for (const [tb, id, price] of [['orders', 'rec101A', null], ['orders', 'rec101B', '800'], ['national_orders', 'rec101C', null]]) {
        assert.strictEqual(await write(db, `UPDATE ${tb} SET invoiced = true, self_delivery = true, invoice_date = '2026-11-02' WHERE legacy_id = '${id}'`), null, id);
        assert.deepStrictEqual(await row(db, tb, id), { invoiced: true, invoice_number: null, d: '2026-11-02', price, sd: 'true' });
      }
      assert.strictEqual((await one(db, `SELECT self_delivery FROM orders_with_derived WHERE legacy_id = 'rec101A'`)).self_delivery, true);
      assert.strictEqual((await one(db, `SELECT self_delivery FROM national_orders_with_derived WHERE legacy_id = 'rec101C'`)).self_delivery, true);
      // a price may come (and go) later on an invoiced self delivery
      assert.strictEqual(await write(db, `UPDATE orders SET price = 950 WHERE legacy_id = 'rec101A'`), null);
      assert.strictEqual(await write(db, `UPDATE orders SET price = NULL WHERE legacy_id = 'rec101A'`), null);
    });
    await tt.test('refused: unticking self_delivery alone on an invoiced row without a number (043 message); nothing changes', async () => {
      assert.match(await write(db, `UPDATE orders SET self_delivery = false WHERE legacy_id = 'rec101A'`) ?? '', /ΤΠΥ/);
      assert.match(await write(db, `UPDATE national_orders SET self_delivery = false WHERE legacy_id = 'rec101C'`) ?? '', /ΤΠΥ/);
      assert.strictEqual((await row(db, 'orders', 'rec101A')).sd, 'true');
      // with a number and a price, unticking leaves an ordinary invoice: allowed
      assert.strictEqual(await write(db, `UPDATE orders SET self_delivery = false, invoice_number = 'T-9' WHERE legacy_id = 'rec101B'`), null);
      assert.deepStrictEqual(await row(db, 'orders', 'rec101B'), { invoiced: true, invoice_number: 'T-9', d: '2026-11-02', price: '800', sd: 'false' });
    });
    await tt.test('the auditor: B-11 / B-12 leave self deliveries out and still count an invoice without a number', async () => {
      const b = async (id) => Number(Object.values(await one(db, (await one(db, `SELECT sql_text FROM monitoring.checks WHERE id = $1`, [id])).sql_text))[0]);
      assert.deepStrictEqual([await b('B-11'), await b('B-12')], [0, 0]);
      await db.exec(`ALTER TABLE orders DISABLE TRIGGER orders_invoice_mark_guard;
        INSERT INTO orders (legacy_id, price, invoiced) VALUES ('rec101X', NULL, true);
        ALTER TABLE orders ENABLE TRIGGER orders_invoice_mark_guard`);
      assert.deepStrictEqual([await b('B-11'), await b('B-12')], [1, 1]);
      const ids = (await one(db, `SELECT ids_sql FROM monitoring.checks WHERE id = 'B-11'`)).ids_sql;
      assert.deepStrictEqual(Object.values(await one(db, ids))[0], ['rec101X']);
    });
    await tt.test('the CHECK: a self delivery is an invoiced row WITHOUT a TPY - the box never sits beside a real number', async () => {
      await db.exec(`INSERT INTO orders (legacy_id, price, invoiced, invoice_number) VALUES ('rec101H', 700, true, 'T-7'), ('rec101J', 700, false, NULL)`);
      assert.match(await write(db, `UPDATE orders SET self_delivery = true WHERE legacy_id = 'rec101H'`) ?? '', /orders_self_delivery_no_tpy/, 'a numbered invoice cannot become a self delivery');
      assert.match(await write(db, `UPDATE orders SET self_delivery = true WHERE legacy_id = 'rec101J'`) ?? '', /orders_self_delivery_no_tpy/, 'nor an uninvoiced row');
      assert.match(await write(db, `UPDATE orders SET invoice_number = 'T-8' WHERE legacy_id = 'rec101A'`) ?? '', /orders_self_delivery_no_tpy/, 'a self delivery cannot get a number');
      assert.match(await write(db, `UPDATE orders SET invoiced = false WHERE legacy_id = 'rec101A'`) ?? '', /orders_self_delivery_no_tpy/, 'invoiced off alone is refused (the box would stay)');
      assert.match(await write(db, `UPDATE national_orders SET invoice_number = 'E-1' WHERE legacy_id = 'rec101C'`) ?? '', /national_orders_self_delivery_no_tpy/);
      assert.deepStrictEqual(await row(db, 'orders', 'rec101H'), { invoiced: true, invoice_number: 'T-7', d: null, price: '700', sd: 'false' });
      assert.strictEqual((await row(db, 'orders', 'rec101A')).sd, 'true');
    });
    await tt.test('the screen\'s undo (invoiced, number, date, self delivery cleared in one write) passes', async () => {
      assert.strictEqual(await write(db, `UPDATE orders SET invoiced = false, invoice_number = NULL, invoice_date = NULL, self_delivery = false WHERE legacy_id = 'rec101A'`), null);
      assert.deepStrictEqual(await row(db, 'orders', 'rec101A'), { invoiced: false, invoice_number: null, d: null, price: null, sd: 'false' });
    });
    await tt.test('everything else exactly as 043: no number / no price refused; a number + price allowed', async () => {
      await db.exec(`INSERT INTO orders (legacy_id, price, invoiced) VALUES ('rec101D', 500, false), ('rec101E', NULL, false)`);
      assert.match(await write(db, `UPDATE orders SET invoiced = true WHERE legacy_id = 'rec101D'`) ?? '', /ΤΠΥ/);
      assert.match(await write(db, `UPDATE orders SET invoiced = true, self_delivery = false, invoice_number = 'T-2' WHERE legacy_id = 'rec101E'`) ?? '', /τιμή/);
      assert.strictEqual(await write(db, `UPDATE orders SET invoiced = true, invoice_number = 'T-3' WHERE legacy_id = 'rec101D'`), null);
      assert.match(await write(db, `UPDATE orders SET price = 0 WHERE legacy_id = 'rec101D'`) ?? '', /τιμή/);
      assert.match(await write(db, `INSERT INTO national_orders (legacy_id, invoiced) VALUES ('rec101F', true)`) ?? '', /ΤΠΥ/);
      assert.strictEqual(await write(db, `INSERT INTO national_orders (legacy_id, invoiced, self_delivery) VALUES ('rec101G', true, true)`), null);
    });
    await db.exec('ROLLBACK');
  });

  await t.test('the rollback stops while a row is invoiced as a self delivery, then puts every text, view and right back', async () => {
    await db.exec(`INSERT INTO national_orders (legacy_id, price, invoiced, self_delivery) VALUES ('rec101R', NULL, true, true)`);
    const id = (await one(db, `SELECT id FROM national_orders WHERE legacy_id = 'rec101R'`)).id;
    assert.match(await errorOf(db, adapt(read('101_self_delivery_rollback.sql'))) ?? '', new RegExp(`undo them from the screen first: national order ${id}$`));
    assert.strictEqual((await state(db)).cols, 2, 'nothing changed');
    await db.exec(`UPDATE national_orders SET invoiced = false, self_delivery = false WHERE legacy_id = 'rec101R'`);
    const msg = await errorOf(db, adapt(read('101_self_delivery_rollback_dryrun.sql')));
    assert.match(msg ?? '', /DRY RUN 101 ROLLBACK finished - EVERYTHING UNDONE/, msg);
    assert.ok(msg.includes(`rollback ran: columns 0, guard ${F.c_fn_live}, triggers on self_delivery 0, views end on it 0, b11 ${F.c_b11_sql}, b12 ${F.c_b12_sql}`), msg);
    assert.strictEqual((await state(db)).cols, 2, 'the dry run kept nothing');
    assert.strictEqual(await errorOf(db, adapt(read('101_self_delivery_rollback.sql'))), null);
    const s = await state(db);
    assert.deepStrictEqual(s, live, 'every text, view and right as before 101 (t101_anon\'s default grant taken away again)');
    assert.match(s.acl_o, /t101_reader=r\//);
    assert.doesNotMatch(s.acl_o, /t101_anon/);
    assert.match(await errorOf(db, adapt(read('101_self_delivery_rollback.sql'))) ?? '', /101 has not run, nothing to reverse/);
  });

  await t.test('after the rollback 101 runs again (the reverse is complete)', async () => {
    assert.strictEqual(await errorOf(db, adapt(SRC)), null);
    assert.strictEqual((await state(db)).fn, GEN_MD5.fn);
  });
});

test('101 and its rollback on views that were never granted (relacl NULL): the owner\'s default rights come back', async () => {
  const { db, adapt } = await copy({ grants: false });
  const live = await state(db);
  assert.deepStrictEqual([live.acl_o, live.acl_n], [null, null]);
  assert.strictEqual(await errorOf(db, adapt(SRC)), null);
  assert.strictEqual(await errorOf(db, adapt(read('101_self_delivery_rollback.sql'))), null);
  const s = await state(db);
  assert.strictEqual(s.cols, 0);
  assert.strictEqual(s.fn, live.fn);
  const def = await one(db, `SELECT acldefault('r', relowner)::text AS d FROM pg_class WHERE oid = 'public.orders_with_derived'::regclass`);
  assert.ok(s.acl_o === null || s.acl_o === def.d, s.acl_o);
});
