-- 070 DRY RUN - 070_revoke_truncate.sql's DO block VERBATIM plus ONE last line: a deliberate error.
-- DO NOT EDIT BY HAND: copy 070's block and add the last RAISE (tests/sql-070-drafts.test.js fails on any drift).
-- WHY ONE DO block: the Supabase SQL editor is NOT atomic across statements (lesson 056), but ONE DO block is
--   ONE statement: its final error undoes everything inside it. ASCII only.
-- WHEN: AFTER 15:00, BEFORE 070_revoke_truncate.sql. Same lock timeout (5 s, then it gives up - run it again later).
-- EXPECTED (the red ERROR is deliberate): a NOTICE "070 OK: 38 TRUNCATE grants revoked ..." and then
--   ERROR: P0001: DRY RUN 070 finished - EVERYTHING UNDONE, nothing kept. 070 ran to its end
--   Anything else (an ERROR "070 STOP: ..."): do NOT run 070, copy the message to the coordinator.

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
  RAISE EXCEPTION 'DRY RUN 070 finished - EVERYTHING UNDONE, nothing kept. 070 ran to its end';
END
$do$;
