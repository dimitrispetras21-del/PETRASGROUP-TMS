-- 105 VERIFY - read-only. Run after 105_rt_pnl_complete.sql (or any time). One row each.
-- EXPECTED: views 3; rev_live_text = 'changed by 105'; rows = round_trips; anon_rights = 0; service_writes = 0;
--   and the complete counts per trip type (3/11: closed own 14 of 158, closed partner 33 of 35).
SELECT
  (SELECT count(*) FROM pg_class WHERE oid IN (to_regclass('public.ct_v_rt_revenue_legs'), to_regclass('public.ct_v_rt_cost_cat'),
     to_regclass('public.ct_v_rt_complete'))) AS views,
  CASE WHEN md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) = '4b6fd9a9674d57d87c303d6500940f36'
       THEN 'the text of 3/11 (105 not run)' ELSE 'changed by 105' END AS rev_live_text,
  md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) AS rev_text_md5,
  (SELECT count(*) FROM public.ct_v_rt_complete) AS rows,
  (SELECT count(*) FROM public.ct_v_rt_pnl) AS round_trips,
  (SELECT count(*) FROM unnest(ARRAY['public.ct_v_rt_revenue_legs', 'public.ct_v_rt_cost_cat', 'public.ct_v_rt_complete']) v(rel)
     CROSS JOIN unnest(ARRAY['anon', 'authenticated']) r(role) WHERE has_table_privilege(r.role, v.rel, 'SELECT')) AS anon_rights,
  (SELECT count(*) FROM unnest(ARRAY['public.ct_v_rt_revenue_legs', 'public.ct_v_rt_cost_cat', 'public.ct_v_rt_complete']) v(rel)
     CROSS JOIN unnest(ARRAY['service_role', 'tms_check_runner']) r(role)
     WHERE has_table_privilege(r.role, v.rel, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')) AS service_writes;

SELECT trip_type, done, count(*) AS round_trips, count(*) FILTER (WHERE complete) AS complete,
  count(*) FILTER (WHERE 'fuel' = ANY (missing)) AS no_fuel, count(*) FILTER (WHERE 'tolls' = ANY (missing)) AS no_tolls,
  count(*) FILTER (WHERE 'driver' = ANY (missing)) AS no_driver, count(*) FILTER (WHERE 'partner_rate' = ANY (missing)) AS no_rate,
  count(*) FILTER (WHERE 'price' = ANY (missing)) AS no_price, count(*) FILTER (WHERE 'trip_type' = ANY (missing)) AS odd_type
FROM public.ct_v_rt_complete GROUP BY trip_type, done ORDER BY trip_type, done;
