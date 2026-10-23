// 068 (presence) on PGlite, at build time (principle 6): the owner's evening run of the dry run, 068, verify,
// the rules test and the rollback should only confirm what this file already knows.
// Production shape for what 068 touches (read 23/10, SELECT): the Supabase roles; the default ACL that gives
// service_role more than the four privileges the Worker needs on a new table (postgres: arwxtm); audit_log's
// (table_name, created_at DESC) and orders' legacy_id / pkey indexes. The fixture's audit_log / orders columns
// are the 22/9 capture.
// Known limit: PGlite is one session, so the dry run's C fingerprint can never see a colleague's save here.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { freshDb } from './helpers.mjs';
import { MIGRATIONS } from '../lib/db.mjs';   // 068 executed 24/10: out of drafts/ (CLAUDE.md rule 5)

const read = (f) => fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
const TRG = `SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public'`;
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const one = async (db, sql) => (await db.query(sql)).rows[0];

async function prodShaped() {
  const db = await freshDb();
  await db.exec(`DO $r$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $r$;
  ALTER ROLE service_role BYPASSRLS;`);   // as production (rolbypassrls true, read 23/10): RLS on, no policies
  // what Supabase hands every new table / function (production pg_default_acl is wider still for anon and
  // authenticated on supabase_admin's objects): 068 must close all of it.
  await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT ON public.audit_log, public.orders TO service_role;
    CREATE INDEX IF NOT EXISTS audit_log_table_idx ON public.audit_log (table_name, created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_log_record_idx ON public.audit_log (record_id);
    CREATE UNIQUE INDEX IF NOT EXISTS orders_legacy_id_key ON public.orders (legacy_id);`);
  // two real-shaped international orders; the newest with a legacy id is the one the rules test references
  await db.exec(`INSERT INTO public.orders (legacy_id, order_type, status) VALUES
    ('recTEST068OLD01', 'International', 'Pending'), ('recTEST068NEW01', 'International', 'Pending')`);
  // history in both key styles, as production has (4222 legacy-keyed + 144 id::text-keyed, 23/10)
  await db.exec(`INSERT INTO public.audit_log (actor, role, action, table_name, record_id, created_at)
    SELECT 'dispatcher1', 'dispatcher', 'update', 'orders', legacy_id, now() - interval '2 days' FROM public.orders;
    INSERT INTO public.audit_log (actor, role, action, table_name, record_id, created_at)
    SELECT 'trigger:rt_sync', 'system', 'update', 'orders', id::text, now() - interval '2 days' FROM public.orders`);
  return db;
}

test('068 presence on a production-shaped PGlite copy', async (t) => {
  const db = await prodShaped();
  const before = (await one(db, TRG)).n;
  const sql068 = read('068_presence.sql');

  await t.test('dry run: 4 OK, 0 FAIL, and keeps nothing', async () => {
    const msg = await errorOf(db, read('068_presence_dryrun.sql'));
    assert.match(msg ?? '', /DRY RUN 068 finished - EVERYTHING UNDONE, nothing kept\. Result: 4 OK, 0 FAIL/, msg);
    assert.equal((await one(db, `SELECT to_regclass('public.presence')::text AS r`)).r, null);
  });

  await t.test('without the service_role REVOKE the in-block proof refuses (and 068 keeps nothing)', async () => {
    const mutant = sql068.replace('  REVOKE ALL ON public.presence FROM service_role;\n', '');
    assert.notEqual(mutant, sql068, 'the REVOKE line was not found');
    const msg = await errorOf(db, mutant);
    assert.match(msg ?? '', /068 proof: service_role holds .*want exactly DELETE,INSERT,SELECT,UPDATE/, msg);
    assert.equal((await one(db, `SELECT to_regclass('public.presence')::text AS r`)).r, null);
  });

  await t.test('068 applies: service_role exactly SIUD, closed to anon/authenticated/PUBLIC, no trigger (B-54 unchanged)', async () => {
    assert.equal(await errorOf(db, sql068), null);
    const acl = await one(db, `SELECT string_agg(e.privilege_type, ',' ORDER BY e.privilege_type) AS p
      FROM pg_class c, aclexplode(c.relacl) e WHERE c.oid = 'public.presence'::regclass AND e.grantee = 'service_role'::regrole`);
    assert.equal(acl.p, 'DELETE,INSERT,SELECT,UPDATE');
    const open = await one(db, `SELECT count(*)::int AS n FROM pg_class c, aclexplode(c.relacl) e
      WHERE c.oid = 'public.presence'::regclass AND (e.grantee = 0 OR e.grantee IN ('anon'::regrole, 'authenticated'::regrole))`);
    assert.equal(open.n, 0);
    assert.equal((await one(db, TRG)).n, before);
  });

  await t.test('verify: 7 OK, 0 FAIL, and sees the (table_name, created_at) index', async () => {
    const msg = await errorOf(db, read('068_presence_verify.sql'));
    assert.match(msg ?? '', /VERIFY 068 finished - read-only, nothing changed\. Result: 7 OK, 0 FAIL/, msg);
    assert.match(msg, /V4 ok table closed to PUBLIC\/anon\/authenticated, service_role exactly SIUD/);
    assert.match(msg, /audit_log created_at index: yes/);
  });

  await t.test('verify notices a widened service_role (V4 FAIL)', async () => {
    await db.exec(`BEGIN; GRANT TRUNCATE ON public.presence TO service_role`);
    const msg = await errorOf(db, read('068_presence_verify.sql'));
    await db.exec('ROLLBACK');
    assert.match(msg ?? '', /Result: 6 OK, 1 FAIL/, msg);
    assert.match(msg, /V4 FAIL 0 open entries; service_role DELETE,INSERT,SELECT,TRUNCATE,UPDATE/);
  });

  await t.test('rules test: 13 OK, 0 FAIL (S13: the UNION join = the old OR join), nothing kept', async () => {
    const auditBefore = (await one(db, `SELECT count(*)::int AS n FROM public.audit_log`)).n;
    const msg = await errorOf(db, read('068_presence_test.sql'));
    assert.match(msg ?? '', /RULES TEST 068 finished - EVERYTHING UNDONE, nothing kept\. Result: 13 OK, 0 FAIL/, msg);
    assert.match(msg, /S13 changes join = old OR join ok \d+ rows both ways, 6 of 10 test rows/);
    assert.equal((await one(db, `SELECT count(*)::int AS n FROM public.audit_log`)).n, auditBefore);
    assert.equal((await one(db, `SELECT count(*)::int AS n FROM public.presence`)).n, 0);
  });

  await t.test('rollback removes both objects', async () => {
    assert.equal(await errorOf(db, read('068_presence_rollback.sql')), null);
    assert.equal((await one(db, `SELECT to_regclass('public.presence')::text AS r`)).r, null);
    assert.equal((await one(db, TRG)).n, before);
  });
});
