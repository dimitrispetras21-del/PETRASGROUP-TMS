-- 105 - ROUND TRIP RESULT: ONE "COMPLETE" RULE AND REVENUE PER LOAD, IN THE DATABASE (owner 3/11/2026).
--
-- Design: docs/design/prints-pnl-week-2026-11-03.md, section 4, prerequisites 1-3 (PR #252, approved 3/11).
-- The owner's answers 3/11: a round trip is "complete" when it has its trip expenses (the rule of the screen
-- "Expenses": own truck = fuel (truck or reefer) + tolls; partner = the partner rate) AND the driver's value
-- (payroll); km (wear) and the pallet slip do NOT count. Today the TRIP PnL screen says "complete" with ONE cost line
-- while the paper must say "missing" per category: two rules = none (principle 3). The rule goes here (principle 4).
-- Number 105: 104 is pl_week_checks, 103 is reserved (swap / EPOMENA).
--
-- REWORKED 8/11 after the first dry run timed out (~2-3 min of CPU, "upstream timeout"; nothing kept): reading
-- ct_v_rt_pnl / ct_v_rt_revenue costs ~5 s of PLANNING alone (the stock views under them), the old block read them
-- 6-8 times after DDL and held an AccessExclusiveLock on ct_v_rt_revenue the whole time. Now (measured 8/11 with
-- EXPLAIN, SELECT only): this block touches NO live view (ct_v_rt_revenue stays as it is - proven by its md5), takes
-- no lock a screen waits on, and reads only the light ct_v_rt_complete (0.2 s planning + 0.1 s run). The heavy
-- proof (the per-load view adds up to ct_v_rt_revenue on every round trip) runs READ-ONLY, outside this block:
-- 105_rt_pnl_complete_preflight.sql before, 105_rt_pnl_complete_verify.sql after.
--
-- The owner runs it in the Supabase SQL editor AFTER 15:00 (the team works 05:30-14:30), with an explicit yes,
-- one step at a time:
--   0. 105_rt_pnl_complete_preflight.sql  read-only, ~10-20 s: the per-load sums = ct_v_rt_revenue (n_diff 0)
--   1. 105_rt_pnl_complete_dryrun.sql     this block + a deliberate error: NOTHING kept (a few seconds)
--   2. 105_rt_pnl_complete.sql            (this file)
--   3. 105_rt_pnl_complete_verify.sql     read-only
-- ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it. statement_timeout 30 s bounds it (the
-- SQL editor's gateway gave up on the first try; a block it cuts must die, not run on), and the block refuses past 20 s.
-- The SET stays on the editor's connection: preflight and verify set their own bound first.
--
-- WHAT IT ADDS (no table, no row, no trigger, no function, no change to an existing view: three new views)
--   * view ct_v_rt_revenue_legs: one row per round-trip leg (and per v5 revenue line): the price of the load, the
--     Veroia Switch charge taken off an international leg, the Veroia Switch income of a national leg, carries_price
--     (a split order's second leg carries no price by design). Its expressions are COPIED verbatim from
--     ct_v_rt_revenue of 3/11 (md5 below; tests/fixtures/ct_v_rt_revenue-2026-11-03.sql). Making ct_v_rt_revenue read
--     this view instead (one source) is NOT done here: it would lock the live view and was measured too costly to
--     prove inside a block. Until then the copy is guarded three times: this block refuses if ct_v_rt_revenue is not
--     the 3/11 text; preflight and verify prove the sums on every round trip; and the paper (Worker PR) must check
--     sum(loads) = ct_v_rt_pnl.revenue for the trip it prints and refuse to print otherwise;
--   * view ct_v_rt_cost_cat: cost lines per round trip x category x toll country (the paper's "tolls per country",
--     owner 3/11) - count, net, vat;
--   * view ct_v_rt_complete: per round trip (not cancelled) done (closed / complete), missing text[] of
--     fuel | tolls | driver | partner_rate | price | trip_type (a type that is neither OWNED nor PARTNER is never
--     "complete": born closed), complete = nothing missing. LIGHT on purpose: base tables + ct_v_rt_costs +
--     ct_v_v5_revenue + ct_v_rt_partner_cost, never ct_v_rt_pnl or the stock views. Its "price" = a leg that carries
--     the price with none - the SAME number the revenue takes (the leg's price, else the parent's on leg 1), then 0
--     counts as none (owner 13/10); an order of a stock lot is left to the lot (its price is the lot's allocation;
--     1 such leg 8/11) - or a v5 line without a price. Measured 8/11 (SELECT of this body, 255 round trips): 16 trips
--     "price" (14 as the per-load rule of 3/11, + 2 whose leg 1 says 0 while the parent has a price: the revenue
--     counts 0 there, so they are NOT complete); closed own 14 of 166 complete (132 without a driver value), closed
--     partner 35 of 37, open own 0 of 47, open partner 4 of 5;
--   * rights, born closed (principle 5): SELECT to service_role and tms_check_runner and nothing else (Supabase's
--     default ALL is revoked from every API role first); PUBLIC / anon / authenticated nothing.
-- KNOWN LIMITS (said, not hidden; code review xhigh 3/11):
--   * one line of a category = the category is there (as the Expenses screen): a partial fuel is not detected;
--   * partner rate: "missing" when the whole planned and invoiced partner cost is 0 (model 1) or a v5 segment has no
--     rate (model 2) - a partner trip with a rate on ONE of its orders is complete (0 such trips 3/11);
--   * an old (model 1) national load whose national order has no price adds 0 and is not flagged "price" (old
--     nationals are without value, owner 28/10);
--   * ct_v_rt_cost_cat is the cost LINES only: cost_net also holds the driver's value and expenses, wear and the planned
--     partner rate - the paper adds them from ct_v_rt_pnl and must prove its total = cost_net (the Worker / print PR);
--   * leg_id is ct_rt_legs.id (source 'leg'); a v5 line carries its plan leg in v5_leg_id;
--   * reading ct_v_rt_revenue_legs costs seconds of planning (the stock views): read it for ONE round trip (the paper),
--     never for a week.
-- REVERSE: 105_rt_pnl_complete_rollback.sql (drops the three views while each still carries the text it signed in its
--   comment; nothing else to give back).
-- AFTER 105 the per-load view is a COPY: a migration that changes ct_v_rt_revenue must change ct_v_rt_revenue_legs in
--   the same file (tests/sql-105-drafts.test.js fails the build otherwise; DECISION_LOG 8/11).
-- EXPECTED: NOTICE "105 OK: ..." within seconds.

SET statement_timeout = '30s';

DO $do$
DECLARE
  -- md5(pg_get_viewdef('public.ct_v_rt_revenue', true)) on 3/11/2026 (= 8/11): the text the per-load copy was taken from
  c_rev_live CONSTANT text := '4b6fd9a9674d57d87c303d6500940f36';
  v_t0 timestamptz := clock_timestamp();
  v_trg0 bigint; v_trg1 bigint; v_rts bigint; v_cmp bigint; v_dist bigint; v_ok bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('search_path', 'public', true);

  -- ===== PART 0: GUARDS (nothing written before them; all cheap) =====
  IF to_regclass('public.ct_v_rt_revenue_legs') IS NOT NULL OR to_regclass('public.ct_v_rt_cost_cat') IS NOT NULL
     OR to_regclass('public.ct_v_rt_complete') IS NOT NULL THEN
    RAISE EXCEPTION '105: a 105 view already exists - 105 has run, nothing to do';
  END IF;
  IF to_regclass('public.ct_v_rt_revenue') IS NULL OR to_regclass('public.ct_v_rt_costs') IS NULL
     OR to_regclass('public.ct_v_v5_revenue') IS NULL OR to_regclass('public.ct_v_rt_partner_cost') IS NULL
     OR to_regclass('public.ct_cost_lines') IS NULL OR to_regclass('public.ct_rt_legs') IS NULL THEN
    RAISE EXCEPTION '105: a view or table 105 reads is missing - stop';
  END IF;
  IF md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) <> c_rev_live THEN
    RAISE EXCEPTION '105: ct_v_rt_revenue is not the text the per-load view was copied from (md5 %) - stop, ask the coordinator',
      md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true));
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role', 'tms_check_runner')) <> 4 THEN
    RAISE EXCEPTION '105: an API or auditor role is missing - stop';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';

  -- ===== PART 1: REVENUE PER LOAD (a verbatim copy of ct_v_rt_revenue's expressions of 3/11) =====
  EXECUTE $v$CREATE VIEW public.ct_v_rt_revenue_legs AS
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
$v$;

  -- ===== PART 2: COST LINES PER CATEGORY AND TOLL COUNTRY =====
  EXECUTE $v$CREATE VIEW public.ct_v_rt_cost_cat AS
 SELECT rt_id,
    category,
    toll_country,
    count(*) AS lines,
    sum(net) AS net,
    sum(vat) AS vat
   FROM public.ct_cost_lines
  WHERE rt_id IS NOT NULL
  GROUP BY rt_id, category, toll_country
$v$;

  -- ===== PART 3: THE ONE "COMPLETE" RULE (owner 3/11), light =====
  EXECUTE $v$CREATE VIEW public.ct_v_rt_complete AS
 SELECT rt.id AS rt_id,
    rt.trip_type,
    rt.status,
    rt.status = ANY (ARRAY['closed'::text, 'complete'::text]) AS done,
    m.missing,
    cardinality(m.missing) = 0 AS complete
   FROM public.ct_round_trips rt
     JOIN public.ct_v_rt_costs co ON co.rt_id = rt.id
     LEFT JOIN ( SELECT c.rt_id,
            bool_or(c.category = ANY (ARRAY['fuel'::text, 'reefer_fuel'::text])) AS fuel,
            bool_or(c.category = 'tolls'::text) AS tolls
           FROM public.ct_cost_lines c
          WHERE c.rt_id IS NOT NULL
          GROUP BY c.rt_id) cl ON cl.rt_id = rt.id
     LEFT JOIN ( SELECT l.rt_id
           FROM public.ct_rt_legs l
             JOIN public.orders o ON o.id = l.order_id
             LEFT JOIN public.orders p ON p.id = o.parent_order_id
          WHERE (o.parent_order_id IS NULL OR o.leg_no = 1) AND o.stock_lot_id IS NULL
            AND NULLIF(COALESCE(o.price, CASE WHEN o.leg_no = 1 THEN p.price ELSE NULL::numeric END), 0::numeric) IS NULL
          GROUP BY l.rt_id) np ON np.rt_id = rt.id
     LEFT JOIN ( SELECT x.rt_id,
            bool_or(x.amount IS NULL AND x.kind = 'price'::text) AS v5_missing
           FROM public.ct_v_v5_revenue x
          WHERE x.rt_id IS NOT NULL
          GROUP BY x.rt_id) v5 ON v5.rt_id = rt.id
     LEFT JOIN ( SELECT pc.rt_id,
            bool_or(pc.rate_missing) AS rate_missing
           FROM public.ct_v_rt_partner_cost pc
          GROUP BY pc.rt_id) pr ON pr.rt_id = rt.id
     CROSS JOIN LATERAL ( SELECT array_remove(ARRAY[
                CASE WHEN rt.trip_type = 'OWNED'::text AND NOT COALESCE(cl.fuel, false) THEN 'fuel'::text ELSE NULL::text END,
                CASE WHEN rt.trip_type = 'OWNED'::text AND NOT COALESCE(cl.tolls, false) THEN 'tolls'::text ELSE NULL::text END,
                CASE WHEN rt.trip_type = 'OWNED'::text AND co.dl_trip_value IS NULL THEN 'driver'::text ELSE NULL::text END,
                CASE WHEN rt.trip_type = 'PARTNER'::text AND ((rt.model = 2 AND COALESCE(pr.rate_missing, false)) OR (rt.model IS DISTINCT FROM 2 AND co.partner_planned = 0::numeric AND co.partner_invoiced = 0::numeric)) THEN 'partner_rate'::text ELSE NULL::text END,
                CASE WHEN COALESCE(v5.v5_missing, false) OR np.rt_id IS NOT NULL THEN 'price'::text ELSE NULL::text END,
                CASE WHEN rt.trip_type IS NULL OR (rt.trip_type <> ALL (ARRAY['OWNED'::text, 'PARTNER'::text])) THEN 'trip_type'::text ELSE NULL::text END], NULL::text) AS missing) m
  WHERE rt.status <> 'cancelled'::text
$v$;

  -- ===== PART 4: RIGHTS, BORN CLOSED =====
  -- Supabase's default privileges give ALL on a new relation to anon, authenticated AND service_role: revoke all of it
  EXECUTE 'REVOKE ALL ON public.ct_v_rt_revenue_legs, public.ct_v_rt_cost_cat, public.ct_v_rt_complete FROM PUBLIC, anon, authenticated, service_role, tms_check_runner';
  EXECUTE 'GRANT SELECT ON public.ct_v_rt_revenue_legs, public.ct_v_rt_cost_cat, public.ct_v_rt_complete TO service_role, tms_check_runner';

  -- ===== PART 4b: EACH VIEW SIGNS ITS OWN TEXT =====
  -- The rollback drops a view only while its text is still this md5 (a comment survives CREATE OR REPLACE VIEW, the
  -- text does not): a later migration's replacement is never dropped by 105's rollback in silence.
  EXECUTE format('COMMENT ON VIEW public.ct_v_rt_revenue_legs IS %L', '105 (owner 3/11): revenue per load. md5 '
    || md5(pg_get_viewdef('public.ct_v_rt_revenue_legs'::regclass, true)));
  EXECUTE format('COMMENT ON VIEW public.ct_v_rt_cost_cat IS %L', '105 (owner 3/11): cost lines per category and toll country. md5 '
    || md5(pg_get_viewdef('public.ct_v_rt_cost_cat'::regclass, true)));
  EXECUTE format('COMMENT ON VIEW public.ct_v_rt_complete IS %L', '105 (owner 3/11): the one complete rule. md5 '
    || md5(pg_get_viewdef('public.ct_v_rt_complete'::regclass, true)));

  -- ===== PART 5: CHEAP PROOFS (no read of ct_v_rt_pnl, ct_v_rt_revenue or ct_v_rt_revenue_legs: seconds of planning each) =====
  IF md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) <> c_rev_live THEN
    RAISE EXCEPTION '105 proof: ct_v_rt_revenue changed - 105 must not touch it';
  END IF;
  SELECT count(*) INTO v_rts FROM public.ct_round_trips WHERE status <> 'cancelled';
  -- ONE read of the new view (each read is a plan): one row per round trip, none twice
  SELECT count(*), count(DISTINCT rt_id), count(*) FILTER (WHERE complete) INTO v_cmp, v_dist, v_ok FROM public.ct_v_rt_complete;
  IF v_cmp <> v_rts OR v_dist <> v_rts THEN
    RAISE EXCEPTION '105 proof: ct_v_rt_complete has % rows (% round trips) for % round trips (expected one each)', v_cmp, v_dist, v_rts;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['public.ct_v_rt_revenue_legs', 'public.ct_v_rt_cost_cat', 'public.ct_v_rt_complete']) v(rel)
             CROSS JOIN unnest(ARRAY['anon', 'authenticated']) r(role)
             WHERE has_table_privilege(r.role, v.rel, 'SELECT'))
     OR EXISTS (SELECT 1 FROM unnest(ARRAY['public.ct_v_rt_revenue_legs', 'public.ct_v_rt_cost_cat', 'public.ct_v_rt_complete']) v(rel)
             CROSS JOIN unnest(ARRAY['service_role', 'tms_check_runner']) r(role)
             WHERE NOT has_table_privilege(r.role, v.rel, 'SELECT')
                OR has_table_privilege(r.role, v.rel, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')) THEN
    RAISE EXCEPTION '105 proof: the rights of a new view are not SELECT to service_role + tms_check_runner only';
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN
    RAISE EXCEPTION '105 proof: trigger count % -> % (expected unchanged, B-54)', v_trg0, v_trg1;
  END IF;
  IF clock_timestamp() - v_t0 > interval '20 seconds' THEN
    RAISE EXCEPTION '105: the block took % (more than 20 s) - stop, ask the coordinator', clock_timestamp() - v_t0;
  END IF;

  RAISE NOTICE '105 OK: % round trips, % complete, ct_v_rt_revenue untouched (%), triggers %, in %',
    v_rts, v_ok, c_rev_live, v_trg1, clock_timestamp() - v_t0;
END $do$;
