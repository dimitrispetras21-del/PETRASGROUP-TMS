-- 070 ROLLBACK - service_role gets TRUNCATE back on every public table but stock_lots (the state of 16/10),
-- and the default privileges of postgres in public give it to new tables again. anon and authenticated get
-- nothing back: on production they held no TRUNCATE before 070.
--
-- DRAFT - NOT EXECUTED. Only if the owner decides to undo 070, after 15:00, with an explicit yes.
-- ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it.
-- EXPECTED: NOTICE "070 ROLLBACK OK ..."; then 070_revoke_truncate_verify.sql shows truncate_left = 38
-- (one per public table but stock_lots, if no table was added since) and default_truncate = 1.

DO $do$
DECLARE
  t record;
  n int := 0;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  FOR t IN
    SELECT c.oid::regclass AS rel
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> 'stock_lots'
       AND NOT has_table_privilege('service_role', c.oid, 'TRUNCATE')
     ORDER BY c.relname
  LOOP
    EXECUTE format('GRANT TRUNCATE ON TABLE %s TO service_role', t.rel);
    n := n + 1;
  END LOOP;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRUNCATE ON TABLES TO service_role;
  RAISE NOTICE '070 ROLLBACK OK: TRUNCATE granted back to service_role on % tables; default privileges restored', n;
END
$do$;
