-- 065 VERIFY - read-only proofs (SELECT only, no writes). ASCII only.
-- Run each statement on its own (select it, Run): the SQL editor shows only the last result of a
-- multi-statement run.
-- "pin" sets search_path = public, extensions for THIS statement only, exactly as 065 does before it
-- measures: pg_get_viewdef qualifies every relation that is not on the search_path, so the same view
-- prints a different text - and md5 - in a session with another path. MATERIALIZED makes it run before
-- the select list; is_local = true ends with this statement's own transaction (nothing to reset).

-- V0 - BEFORE 065 (the coordinator, then again after the dry run: nothing kept). Expected ONE row:
--   owd_md5 4f82b738847c4770ccc379b1d558d542 | owd_columns 137 | owd_options NULL |
--   owd_acl {postgres=arwdDxtm/postgres,service_role=arwDxtm/postgres} (as read 4/10 - any other value:
--   065 keeps it as it is, write it down) | column_absent t | public_triggers 35 | b54_red_value 35 |
--   b54_baseline NULL
WITH pin AS MATERIALIZED (SELECT set_config('search_path', 'public, extensions', true) AS search_path)
SELECT md5(pg_get_viewdef('public.orders_with_derived'::regclass)) AS owd_md5,
       (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.orders_with_derived'::regclass
         AND attnum > 0 AND NOT attisdropped) AS owd_columns,
       (SELECT reloptions FROM pg_class WHERE oid = 'public.orders_with_derived'::regclass) AS owd_options,
       (SELECT relacl::text FROM pg_class WHERE oid = 'public.orders_with_derived'::regclass) AS owd_acl,
       NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid IN ('public.orders'::regclass, 'public.orders_with_derived'::regclass)
                    AND attname = 'temp_per_cmr' AND NOT attisdropped) AS column_absent,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT baseline FROM monitoring.checks WHERE id = 'B-54') AS b54_baseline
  FROM pin;

-- V1 - right after 065: ONE row, every boolean t; orders_marked_cmr 0 (until the screens ship).
WITH pin AS MATERIALIZED (SELECT set_config('search_path', 'public, extensions', true) AS search_path)
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders'
                AND column_name = 'temp_per_cmr' AND data_type = 'boolean' AND is_nullable = 'NO'
                AND column_default = 'false') AS column_ok,
       md5(pg_get_viewdef('public.orders_with_derived'::regclass)) = '55736818891a8f4e06193b23265cacf4' AS view_text_ok,
       (SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute
         WHERE attrelid = 'public.orders_with_derived'::regclass AND attnum > 137 AND NOT attisdropped) = 'temp_per_cmr' AS view_appended_ok,
       (SELECT reloptions IS NULL FROM pg_class WHERE oid = 'public.orders_with_derived'::regclass) AS view_no_options,
       has_column_privilege('service_role', 'public.orders_with_derived', 'temp_per_cmr', 'SELECT')
         AND has_column_privilege('service_role', 'public.orders', 'temp_per_cmr', 'UPDATE')
         AND has_column_privilege('service_role', 'public.orders', 'temp_per_cmr', 'INSERT') AS worker_can_read_write,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') =
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS b54_green,         -- both 35
       NOT EXISTS (SELECT 1 FROM public.orders_with_derived d JOIN public.orders o ON o.id = d.id
                    WHERE d.temp_per_cmr IS DISTINCT FROM o.temp_per_cmr) AS view_reads_table,
       (SELECT count(*) FROM public.orders WHERE temp_per_cmr) AS orders_marked_cmr
  FROM pin;

-- V2 - after the screens ship (and whenever in doubt): the orders marked "as on the CMR", newest
--      first, with the number they still carry (NULL = none; both are allowed). Principle 2: this
--      row count, not a green toast, is the proof that the form writes the flag.
SELECT o.id, o.reference, o.direction, o.status, o.temperature_c, o.refrigerator_mode, o.loading_datetime
  FROM public.orders o
 WHERE o.temp_per_cmr AND o.deleted_at IS NULL
 ORDER BY o.id DESC
 LIMIT 50;
