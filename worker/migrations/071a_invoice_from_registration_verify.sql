-- 071a VERIFY - READ ONLY (SELECT only, writes nothing). ASCII only.
-- Run it BEFORE 071a: every "state" line says "before". Run it AFTER 071a: every "state" line says "after".
-- The "ok ..." lines must say ok in both runs. Anything "UNKNOWN" or "STOP": do not go on, copy the result
-- to the coordinator. The fingerprints are those of worker/migrations/drafts/tools/build-071a.mjs
-- (tests/sql-071a-drafts.test.js fails if they drift from it).
SELECT 'stock_guard_lots' AS what,
       CASE md5(prosrc) WHEN '46e61e5f4c1e74af19cba5ddaa9f2975' THEN 'before'
                        WHEN '231b539e429f5d404d0eaa46618d79c5' THEN 'after'
                        ELSE 'UNKNOWN ' || md5(prosrc) END AS state
  FROM pg_proc WHERE oid = 'public.stock_guard_lots()'::regprocedure
UNION ALL
SELECT 'stock_guard_orders',
       CASE md5(prosrc) WHEN '20833484dffdf168b1e1de9fdc242027' THEN 'before'
                        WHEN '63aa751d93cc8b34afa5587912de7045' THEN 'after'
                        ELSE 'UNKNOWN ' || md5(prosrc) END
  FROM pg_proc WHERE oid = 'public.stock_guard_orders()'::regprocedure
UNION ALL
SELECT 'stock_guard_natl',
       CASE md5(prosrc) WHEN '26b4cc060ab15152a51693c9f0a67f81' THEN 'before'
                        WHEN 'e941edbca9ff1bbeba0c89d49eb71cb3' THEN 'after'
                        ELSE 'UNKNOWN ' || md5(prosrc) END
  FROM pg_proc WHERE oid = 'public.stock_guard_natl()'::regprocedure
UNION ALL
SELECT 'auditor S-03',
       CASE WHEN enabled AND md5(sql_text) = '0df9746599fb62724c719d2f467ff280' THEN 'before'
            WHEN NOT enabled AND md5(sql_text) = '0df9746599fb62724c719d2f467ff280' AND disabled_reason LIKE '071a (owner 21/10/2026)%' THEN 'after'
            ELSE 'UNKNOWN' END
  FROM monitoring.checks WHERE id = 'S-03'
UNION ALL
SELECT 'auditor B-15',
       CASE md5(sql_text) WHEN '40d8808efe298f7321a8706dc726a784' THEN 'before'
                          WHEN '8e4f22fd86852cf10e2e00b48e1bd2ee' THEN 'after'
                          ELSE 'UNKNOWN ' || md5(sql_text) END
  FROM monitoring.checks WHERE id = 'B-15'
UNION ALL
SELECT 'stock_guard triggers enabled',
       CASE WHEN count(*) = 3 THEN 'ok 3' ELSE 'STOP ' || count(*) END
  FROM pg_trigger
 WHERE NOT tgisinternal AND tgenabled = 'O' AND tgname IN ('stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl')
UNION ALL
SELECT 'guards: invoker, search_path, closed to the API roles',
       CASE WHEN count(*) = 3 THEN 'ok' ELSE 'STOP ' || count(*) END
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl')
   AND NOT p.prosecdef AND p.proconfig = ARRAY['search_path=public']
   AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
UNION ALL
SELECT 'B-54 red_value = live trigger count',
       CASE WHEN (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') = count(*) THEN 'ok ' || count(*) ELSE 'STOP ' || count(*) END
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
 WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public'
UNION ALL
SELECT 'lots: live / invoiced / not complete',
       count(*) || ' / ' || count(*) FILTER (WHERE invoiced) || ' / ' || count(*) FILTER (WHERE NOT complete)
  FROM stock_v_lots;
