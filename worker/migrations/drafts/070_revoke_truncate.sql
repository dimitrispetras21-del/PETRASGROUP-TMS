-- 070 - NO TRUNCATE FOR THE API ROLES: service_role (the Worker), anon and authenticated lose TRUNCATE on
--       every table in public, now and for every new table. Issue S7 (on-site issue log 12/10).
--
-- DRAFT - NOT EXECUTED. Prepared by Valuedriven 16/10 (branch vd/s7-revoke-truncate).
-- The owner runs it in the Supabase SQL editor AFTER 15:00 (the team works 05:30-14:30), in this order:
--   1. 070_revoke_truncate_dryrun.sql    this block + a deliberate error: NOTHING kept
--   2. 070_revoke_truncate.sql           (this file)
--   3. 070_revoke_truncate_verify.sql    read-only; ONE row, every column as EXPECTED
-- No Worker or front change goes with it. ASCII only (clipboard-safe). ONE DO block = ONE statement: an
-- error anywhere undoes all of it (the SQL editor is not atomic across statements - lesson 056).
--
-- WHY (read on production 16/10, SELECT only): service_role holds TRUNCATE on 38 of the 39 tables in public,
-- all but stock_lots (057 created it with "no DELETE/TRUNCATE: soft delete only"). Among them orders,
-- national_loads, groupage_lines, order_stops, pl_movements, audit_log and app_errors. TRUNCATE empties a
-- table in one statement WITHOUT a DELETE grant, fires no ON DELETE trigger (no cascade, no soft delete,
-- no audit_log row) and only a backup brings the rows back. The default privileges of postgres in public
-- hand it to every NEW table as well (service_role=arwDxtm: DELETE "d" was already taken out, TRUNCATE "D"
-- was not).
-- WHO USES IT: nobody. PostgREST, the Worker's only way in as service_role, has no TRUNCATE verb; 0 function
-- bodies in public or monitoring contain TRUNCATE; in the repo the word appears only in tests' lists of
-- forbidden SQL. postgres (SQL editor, pg_cron, the owner of every table) keeps TRUNCATE.
-- NOT CHANGED: DELETE where service_role still holds it (8 tables, pl_movements among them: the Worker's
-- pallet delete route uses it and audits it). That is a separate decision.
-- UNDO: 070_revoke_truncate_rollback.sql.

DO $do$
DECLARE
  t record;
  n int := 0;
  left_over int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);   -- REVOKE needs a short lock per table; give up rather than queue

  FOR t IN
    SELECT c.oid::regclass AS rel, r.rolname
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      CROSS JOIN (VALUES ('service_role'), ('anon'), ('authenticated')) AS r(rolname)
     WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p')
       AND has_table_privilege(r.rolname, c.oid, 'TRUNCATE')
     ORDER BY c.relname, r.rolname
  LOOP
    EXECUTE format('REVOKE TRUNCATE ON TABLE %s FROM %I', t.rel, t.rolname);
    n := n + 1;
  END LOOP;

  -- New tables the owner creates later are born without it.
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM service_role, anon, authenticated;

  -- Proof inside the same statement: a REVOKE only removes grants the current user made, so if any grant
  -- came from another grantor it would survive silently. Then nothing is kept.
  SELECT count(*) INTO left_over
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p')
     AND (has_table_privilege('service_role', c.oid, 'TRUNCATE')
       OR has_table_privilege('anon', c.oid, 'TRUNCATE')
       OR has_table_privilege('authenticated', c.oid, 'TRUNCATE'));
  IF left_over <> 0 THEN
    RAISE EXCEPTION '070 STOP: an API role still has TRUNCATE on % tables after the REVOKE - nothing kept, copy this to the coordinator', left_over;
  END IF;
  IF NOT has_table_privilege('service_role', 'public.orders', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.orders', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.orders', 'SELECT') THEN
    RAISE EXCEPTION '070 STOP: service_role lost SELECT/INSERT/UPDATE on orders - nothing kept';
  END IF;

  RAISE NOTICE '070 OK: % TRUNCATE grants revoked (service_role, anon, authenticated, public tables); new tables of postgres in public are born without it', n;
END
$do$;
