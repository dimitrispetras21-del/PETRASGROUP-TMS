-- 105 PREFLIGHT - read-only, BEFORE the dry run (any time; ~10-20 s of CPU, no lock a screen waits on).
-- Proves the per-load expressions 105 will create (ct_v_rt_revenue_legs, copied from ct_v_rt_revenue of 3/11) add
-- up to the live ct_v_rt_revenue on EVERY round trip. The text below is the view body of 105_rt_pnl_complete.sql,
-- verbatim (tests/sql-105-drafts.test.js fails if they drift).
-- EXPECTED one row: round_trips_loads = round_trips_live, n_diff = 0, rev_text_md5 = 4b6fd9a9674d57d87c303d6500940f36.
-- Anything else: do NOT run 105, copy the row to the coordinator.
SET statement_timeout = '120s';
WITH lg AS (
 WITH natord_home AS (
         SELECT nord.id AS national_order_id,
            nord.price,
            COALESCE(( SELECT min(h1.id) AS min
                   FROM national_loads h1
                  WHERE h1.source_national_order_id = nord.id AND h1.deleted_at IS NULL), ( SELECT min(h2.id) AS min
                   FROM national_loads h2
                  WHERE h2.deleted_at IS NULL AND h2.source_cons_load_id = (( SELECT gl.cons_load_id
                           FROM groupage_lines gl
                          WHERE gl.national_order_id = nord.id AND gl.deleted_at IS NULL AND gl.cons_load_id IS NOT NULL
                          ORDER BY gl.id
                         LIMIT 1)))) AS home_nat_load_id
           FROM national_orders nord
          WHERE nord.deleted_at IS NULL AND nord.price IS NOT NULL AND nord.source_order_id IS NULL AND NOT (EXISTS ( SELECT 1
                   FROM shipments s5
                  WHERE s5.nat_order_id = nord.id AND s5.deleted_at IS NULL))
        ), legs AS (
         SELECT rt.id AS rt_id,
            l.id AS leg_id,
            l.order_id,
            l.nat_load_id,
                CASE
                    WHEN l.order_id IS NOT NULL THEN o.parent_order_id IS NULL OR o.leg_no = 1
                    ELSE NULL::boolean
                END AS carries_price,
                CASE
                    WHEN l.order_id IS NOT NULL THEN COALESCE(sa.rt_amount, o.price,
                    CASE
                        WHEN o.leg_no = 1 THEN p.price
                        ELSE NULL::numeric
                    END)
                    ELSE NULL::numeric
                END AS intl_price,
                CASE
                    WHEN l.order_id IS NOT NULL THEN
                    CASE
                        WHEN
                        CASE
                            WHEN o.parent_order_id IS NOT NULL THEN p.veroia_switch
                            ELSE o.veroia_switch
                        END THEN stock_vs_charge(
                        CASE
                            WHEN
                            CASE
                                WHEN o.parent_order_id IS NOT NULL THEN p.direction
                                ELSE o.direction
                            END = 'Export'::text THEN ct_setting('x_export'::text)
                            ELSE ct_setting('x_import'::text)
                        END, vp.pallets)
                        ELSE 0::numeric
                    END
                    ELSE 0::numeric
                END AS intl_vs_charge,
                CASE
                    WHEN l.nat_load_id IS NOT NULL THEN
                    CASE
                        WHEN nl.source_type = 'Direct'::text AND nl.source_order_id IS NOT NULL AND nl.id = (( SELECT min(d.id) AS min
                           FROM national_loads d
                          WHERE d.source_order_id = nl.source_order_id AND d.source_type = 'Direct'::text AND d.deleted_at IS NULL)) AND
                        CASE
                            WHEN so.parent_order_id IS NOT NULL THEN sp.veroia_switch
                            ELSE so.veroia_switch
                        END AND NOT (EXISTS ( SELECT 1
                           FROM shipments b
                          WHERE (b.order_id = so.id OR b.order_id = sp.id) AND b.deleted_at IS NULL)) THEN stock_vs_charge(
                        CASE
                            WHEN
                            CASE
                                WHEN so.parent_order_id IS NOT NULL THEN sp.direction
                                ELSE so.direction
                            END = 'Export'::text THEN ct_setting('x_export'::text)
                            ELSE ct_setting('x_import'::text)
                        END, svp.pallets)
                        ELSE 0::numeric
                    END
                    ELSE 0::numeric
                END AS natl_vs_income,
                CASE
                    WHEN l.nat_load_id IS NOT NULL THEN COALESCE(( SELECT sum(h.price) AS sum
                       FROM natord_home h
                      WHERE h.home_nat_load_id = nl.id), 0::numeric)
                    ELSE 0::numeric
                END AS natl_price
           FROM ct_round_trips rt
             LEFT JOIN ct_rt_legs l ON l.rt_id = rt.id
             LEFT JOIN orders o ON o.id = l.order_id
             LEFT JOIN orders p ON p.id = o.parent_order_id
             LEFT JOIN stock_v_rt_amounts sa ON sa.order_id = o.id
             LEFT JOIN stock_v_pieces vp ON vp.piece_kind = 'intl'::text AND vp.piece_id = o.id
             LEFT JOIN national_loads nl ON nl.id = l.nat_load_id
             LEFT JOIN orders so ON so.id = nl.source_order_id
             LEFT JOIN orders sp ON sp.id = so.parent_order_id
             LEFT JOIN stock_v_pieces svp ON svp.piece_kind = 'intl'::text AND svp.piece_id = so.id
        )
 SELECT legs.rt_id,
    'leg'::text AS source,
    legs.leg_id,
    NULL::bigint AS v5_leg_id,
    legs.order_id,
    legs.nat_load_id,
    NULL::bigint AS nat_order_id,
    legs.carries_price,
    legs.intl_price,
    legs.intl_vs_charge,
    legs.natl_vs_income,
    legs.natl_price,
        CASE
            WHEN legs.order_id IS NOT NULL THEN COALESCE(legs.intl_price, 0::numeric) - legs.intl_vs_charge
            ELSE 0::numeric
        END AS rev_intl,
        CASE
            WHEN legs.nat_load_id IS NOT NULL THEN legs.natl_vs_income + legs.natl_price
            ELSE 0::numeric
        END AS rev_natl,
    false AS missing
   FROM legs
UNION ALL
 SELECT x.rt_id,
    'v5'::text AS source,
    NULL::bigint AS leg_id,
    x.leg_id AS v5_leg_id,
    x.order_id,
    NULL::bigint AS nat_load_id,
    x.nat_order_id,
    NULL::boolean AS carries_price,
    NULL::numeric AS intl_price,
    0::numeric AS intl_vs_charge,
    0::numeric AS natl_vs_income,
    x.amount AS natl_price,
    0::numeric AS rev_intl,
    x.amount AS rev_natl,
    x.amount IS NULL AND x.kind = 'price'::text AS missing
   FROM ct_v_v5_revenue x
  WHERE x.rt_id IS NOT NULL
), agg AS (
 SELECT rt_id, COALESCE(sum(rev_intl + rev_natl), 0::numeric) AS revenue, COALESCE(sum(rev_intl), 0::numeric) AS revenue_intl,
   COALESCE(sum(rev_natl), 0::numeric) AS revenue_natl, COALESCE(bool_or(missing), false) AS revenue_missing
  FROM lg GROUP BY rt_id)
SELECT (SELECT count(*) FROM agg) AS round_trips_loads, (SELECT count(*) FROM public.ct_v_rt_revenue) AS round_trips_live,
  (SELECT count(*) FROM agg a FULL JOIN public.ct_v_rt_revenue r USING (rt_id)
    WHERE a.revenue IS DISTINCT FROM r.revenue OR a.revenue_intl IS DISTINCT FROM r.revenue_intl
       OR a.revenue_natl IS DISTINCT FROM r.revenue_natl OR a.revenue_missing IS DISTINCT FROM r.revenue_missing) AS n_diff,
  md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) AS rev_text_md5;
