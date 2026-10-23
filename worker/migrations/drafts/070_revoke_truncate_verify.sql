-- 070 VERIFY - read-only (SELECT only, writes nothing). Run after 070_revoke_truncate.sql, and any time later.
-- ONE row. ASCII only.
-- EXPECTED after 070:
--   truncate_left = 0 ; default_truncate = 0 ; owner_keeps = true ; worker_keeps = true
-- Before 070 (16/10): truncate_left = 38 (service_role on every public table but stock_lots), default_truncate = 1.
-- Any other value: copy the row to the coordinator.
SELECT
  (SELECT count(*)
     FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND (has_table_privilege('service_role', c.oid, 'TRUNCATE')
        OR has_table_privilege('anon', c.oid, 'TRUNCATE')
        OR has_table_privilege('authenticated', c.oid, 'TRUNCATE')))                 AS truncate_left,
  (SELECT count(*)
     FROM pg_default_acl a, aclexplode(a.defaclacl) x
    WHERE a.defaclrole = 'postgres'::regrole AND a.defaclnamespace = 'public'::regnamespace
      AND a.defaclobjtype = 'r' AND x.privilege_type = 'TRUNCATE'
      AND x.grantee IN ('service_role'::regrole, 'anon'::regrole, 'authenticated'::regrole)) AS default_truncate,
  has_table_privilege('postgres', 'public.orders', 'TRUNCATE')                          AS owner_keeps,
  (has_table_privilege('service_role', 'public.orders', 'SELECT')
   AND has_table_privilege('service_role', 'public.orders', 'INSERT')
   AND has_table_privilege('service_role', 'public.orders', 'UPDATE'))                  AS worker_keeps;
