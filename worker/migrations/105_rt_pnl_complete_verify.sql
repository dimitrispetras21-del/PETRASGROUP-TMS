-- 105 VERIFY - read-only. Run after 105_rt_pnl_complete.sql (or any time). ~10-20 s for the first query.
-- EXPECTED: (1) views 3; rev_live_text = 'the text of 3/11'; anon_rights = 0; service_writes = 0; rows = round_trips;
--   (2) loads_diff = 0 (the per-load view adds up to ct_v_rt_revenue on every round trip);
--   (3) the complete counts per trip type (measured 8/11 with a SELECT of the body: closed own 14 of 166,
--   closed partner 35 of 37, open own 0 of 47, open partner 4 of 5; 16 trips with 'price' missing).
SET statement_timeout = '120s';
SELECT
  (SELECT count(*) FROM pg_class WHERE oid IN (to_regclass('public.ct_v_rt_revenue_legs'), to_regclass('public.ct_v_rt_cost_cat'),
     to_regclass('public.ct_v_rt_complete'))) AS views,
  CASE WHEN md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) = '4b6fd9a9674d57d87c303d6500940f36'
       THEN 'the text of 3/11' ELSE 'CHANGED - the per-load copy must be checked' END AS rev_live_text,
  (SELECT count(*) FROM unnest(ARRAY['public.ct_v_rt_revenue_legs', 'public.ct_v_rt_cost_cat', 'public.ct_v_rt_complete']) v(rel)
     CROSS JOIN unnest(ARRAY['anon', 'authenticated']) r(role) WHERE has_table_privilege(r.role, v.rel, 'SELECT')) AS anon_rights,
  (SELECT count(*) FROM unnest(ARRAY['public.ct_v_rt_revenue_legs', 'public.ct_v_rt_cost_cat', 'public.ct_v_rt_complete']) v(rel)
     CROSS JOIN unnest(ARRAY['service_role', 'tms_check_runner']) r(role)
     WHERE has_table_privilege(r.role, v.rel, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')) AS service_writes,
  (SELECT count(*) FROM public.ct_v_rt_complete) AS rows,
  (SELECT count(*) FROM public.ct_round_trips WHERE status <> 'cancelled') AS round_trips;

SELECT count(*) AS loads_diff
  FROM (SELECT rt_id, COALESCE(sum(rev_intl + rev_natl), 0::numeric) AS revenue, COALESCE(sum(rev_intl), 0::numeric) AS revenue_intl,
          COALESCE(sum(rev_natl), 0::numeric) AS revenue_natl, COALESCE(bool_or(missing), false) AS missing
          FROM public.ct_v_rt_revenue_legs GROUP BY rt_id) a
  FULL JOIN public.ct_v_rt_revenue r USING (rt_id)
 WHERE a.revenue IS DISTINCT FROM r.revenue OR a.revenue_intl IS DISTINCT FROM r.revenue_intl
    OR a.revenue_natl IS DISTINCT FROM r.revenue_natl OR a.missing IS DISTINCT FROM r.revenue_missing;

SELECT trip_type, done, count(*) AS round_trips, count(*) FILTER (WHERE complete) AS complete,
  count(*) FILTER (WHERE 'fuel' = ANY (missing)) AS no_fuel, count(*) FILTER (WHERE 'tolls' = ANY (missing)) AS no_tolls,
  count(*) FILTER (WHERE 'driver' = ANY (missing)) AS no_driver, count(*) FILTER (WHERE 'partner_rate' = ANY (missing)) AS no_rate,
  count(*) FILTER (WHERE 'price' = ANY (missing)) AS no_price, count(*) FILTER (WHERE 'trip_type' = ANY (missing)) AS odd_type
FROM public.ct_v_rt_complete GROUP BY trip_type, done ORDER BY trip_type, done;
