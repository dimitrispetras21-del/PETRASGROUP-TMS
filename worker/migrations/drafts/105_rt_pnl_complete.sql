-- 105 - ROUND TRIP RESULT: ONE "COMPLETE" RULE AND REVENUE PER LOAD, IN THE DATABASE (owner 3/11/2026).
--
-- Design: docs/design/prints-pnl-week-2026-11-03.md, section 4, prerequisites 1-3 (PR #252, approved 3/11).
-- The owner's answers 3/11: a round trip is "complete" when it has its trip expenses (the rule of the screen
-- "Expenses": own truck = fuel (truck or reefer) + tolls; partner = the partner rate) AND the driver's value
-- (payroll); km (wear) and the pallet slip do NOT count. Today the TRIP PnL screen says "complete" with ONE cost line
-- (144 of 158 closed own trips) while the paper must say "missing" per category: two rules = none (principle 3).
-- The rule goes here, read by the screen AND the paper (principle 4).
-- Number 105: 104 is pl_week_checks (feat/pallets-week-checks), 103 is reserved (swap / EPOMENA).
-- The owner runs it in the Supabase SQL editor AFTER 15:00 (the team works 05:30-14:30), with an explicit yes,
-- one step at a time:
--   1. 105_rt_pnl_complete_dryrun.sql   this block + a deliberate error: NOTHING kept
--   2. 105_rt_pnl_complete.sql          (this file)
--   3. 105_rt_pnl_complete_verify.sql   read-only
-- ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it.
--
-- WHAT IT ADDS (no table, no row, no trigger, no function: three views and the text of one view)
--   * view ct_v_rt_revenue_legs: one row per round-trip leg (and per v5 revenue line), with the price of the load,
--     the Veroia Switch charge taken off an international leg, the Veroia Switch income of a national leg, and
--     carries_price (a split order's second leg carries no price by design: the first leg does). Its expressions are
--     ct_v_rt_revenue's own, moved here VERBATIM; nothing is computed differently;
--   * view ct_v_rt_revenue: the SAME five columns, now the sum of ct_v_rt_revenue_legs (one source for the total and
--     its loads). Before = after is PROVEN below on every round trip (and on ct_v_rt_pnl, which reads it): a single
--     difference in any cent stops everything;
--   * view ct_v_rt_cost_cat: cost lines per round trip x category x toll country (the paper's "tolls per country",
--     owner 3/11) - count, net, vat;
--   * view ct_v_rt_complete: per round trip (not cancelled) done (closed / complete), missing text[] of
--     fuel | tolls | driver | partner_rate | price, complete = nothing missing. Measured 3/11 (SELECT only): closed own
--     trips 14 of 158 complete (124 without a driver value), closed partner trips 33 of 35;
--   * rights, born closed (principle 5): the three new views SELECT to service_role and tms_check_runner only;
--     PUBLIC / anon / authenticated nothing. ct_v_rt_revenue keeps its rights (CREATE OR REPLACE).
-- NOT HERE: the Worker route and the screens that read ct_v_rt_complete (their own PRs, after this ran).
-- REVERSE: 105_rt_pnl_complete_rollback.sql (ct_v_rt_revenue back to its text of 3/11, md5 below).
-- EXPECTED: NOTICE "105 OK: ..." (the round trips, the revenue and P&L fingerprints unchanged, the complete count).

DO $do$
DECLARE
  -- md5(pg_get_viewdef('public.ct_v_rt_revenue', true)) on 3/11/2026: the text 105 was written against
  c_rev_live CONSTANT text := '4b6fd9a9674d57d87c303d6500940f36';
  v_rev0 text; v_rev1 text; v_pnl0 text; v_pnl1 text; v_trg0 bigint; v_trg1 bigint;
  v_rts bigint; v_cmp bigint; v_ok bigint; v_diff bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('search_path', 'public', true);

  -- ===== PART 0: GUARDS (nothing written before them) =====
  IF to_regclass('public.ct_v_rt_revenue_legs') IS NOT NULL OR to_regclass('public.ct_v_rt_cost_cat') IS NOT NULL
     OR to_regclass('public.ct_v_rt_complete') IS NOT NULL THEN
    RAISE EXCEPTION '105: a 105 view already exists - 105 has run, nothing to do';
  END IF;
  IF to_regclass('public.ct_v_rt_revenue') IS NULL OR to_regclass('public.ct_v_rt_pnl') IS NULL
     OR to_regclass('public.ct_v_v5_revenue') IS NULL OR to_regclass('public.ct_cost_lines') IS NULL THEN
    RAISE EXCEPTION '105: ct_v_rt_revenue / ct_v_rt_pnl / ct_v_v5_revenue / ct_cost_lines missing - stop';
  END IF;
  IF md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) <> c_rev_live THEN
    RAISE EXCEPTION '105: ct_v_rt_revenue is not the text 105 was written against (md5 %) - stop, ask the coordinator',
      md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true));
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role', 'tms_check_runner')) <> 4 THEN
    RAISE EXCEPTION '105: an API or auditor role is missing - stop';
  END IF;
  SELECT md5(string_agg(concat_ws('|', rt_id, revenue, revenue_intl, revenue_natl, revenue_missing), ';' ORDER BY rt_id))
    INTO v_rev0 FROM public.ct_v_rt_revenue;
  SELECT md5(string_agg(concat_ws('|', id, revenue, revenue_intl, revenue_natl, cost_net, cost_vat, profit_worst, profit_ex_vat,
      margin_worst_pct, v5_revenue_missing), ';' ORDER BY id))
    INTO v_pnl0 FROM public.ct_v_rt_pnl;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';

  -- ===== PART 1: REVENUE PER LOAD (ct_v_rt_revenue's own expressions, verbatim) =====
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
    x.leg_id,
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

  -- ===== PART 2: ct_v_rt_revenue = the sum of its loads (same five columns, same order) =====
  EXECUTE $v$CREATE OR REPLACE VIEW public.ct_v_rt_revenue AS
 SELECT rt_id,
    COALESCE(sum(rev_intl + rev_natl), 0::numeric) AS revenue,
    COALESCE(sum(rev_intl), 0::numeric) AS revenue_intl,
    COALESCE(sum(rev_natl), 0::numeric) AS revenue_natl,
    COALESCE(bool_or(missing), false) AS revenue_missing
   FROM public.ct_v_rt_revenue_legs
  GROUP BY rt_id
$v$;

  -- ===== PART 3: COST LINES PER CATEGORY AND TOLL COUNTRY =====
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

  -- ===== PART 4: THE ONE "COMPLETE" RULE (owner 3/11) =====
  EXECUTE $v$CREATE VIEW public.ct_v_rt_complete AS
 SELECT pn.id AS rt_id,
    pn.trip_type,
    pn.status,
    pn.status = ANY (ARRAY['closed'::text, 'complete'::text]) AS done,
    m.missing,
    cardinality(m.missing) = 0 AS complete
   FROM public.ct_v_rt_pnl pn
     JOIN public.ct_round_trips rt ON rt.id = pn.id
     LEFT JOIN ( SELECT c.rt_id,
            bool_or(c.category = ANY (ARRAY['fuel'::text, 'reefer_fuel'::text])) AS fuel,
            bool_or(c.category = 'tolls'::text) AS tolls
           FROM public.ct_cost_lines c
          WHERE c.rt_id IS NOT NULL
          GROUP BY c.rt_id) cl ON cl.rt_id = pn.id
     LEFT JOIN ( SELECT g.rt_id
           FROM public.ct_v_rt_revenue_legs g
          WHERE g.source = 'leg'::text AND g.carries_price AND COALESCE(g.intl_price, 0::numeric) = 0::numeric
          GROUP BY g.rt_id) np ON np.rt_id = pn.id
     CROSS JOIN LATERAL ( SELECT array_remove(ARRAY[
                CASE WHEN pn.trip_type = 'OWNED'::text AND NOT COALESCE(cl.fuel, false) THEN 'fuel'::text ELSE NULL::text END,
                CASE WHEN pn.trip_type = 'OWNED'::text AND NOT COALESCE(cl.tolls, false) THEN 'tolls'::text ELSE NULL::text END,
                CASE WHEN pn.trip_type = 'OWNED'::text AND pn.dl_trip_value IS NULL THEN 'driver'::text ELSE NULL::text END,
                CASE WHEN pn.trip_type = 'PARTNER'::text AND (pn.partner_rate_missing OR (rt.model IS DISTINCT FROM 2 AND pn.partner_planned = 0::numeric AND pn.partner_invoiced = 0::numeric)) THEN 'partner_rate'::text ELSE NULL::text END,
                CASE WHEN pn.v5_revenue_missing OR np.rt_id IS NOT NULL THEN 'price'::text ELSE NULL::text END], NULL::text) AS missing) m
$v$;

  -- ===== PART 5: RIGHTS, BORN CLOSED =====
  EXECUTE 'REVOKE ALL ON public.ct_v_rt_revenue_legs, public.ct_v_rt_cost_cat, public.ct_v_rt_complete FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT SELECT ON public.ct_v_rt_revenue_legs, public.ct_v_rt_cost_cat, public.ct_v_rt_complete TO service_role, tms_check_runner';

  -- ===== PART 6: PROOFS (any failure undoes everything) =====
  SELECT md5(string_agg(concat_ws('|', rt_id, revenue, revenue_intl, revenue_natl, revenue_missing), ';' ORDER BY rt_id))
    INTO v_rev1 FROM public.ct_v_rt_revenue;
  IF v_rev1 IS DISTINCT FROM v_rev0 THEN
    RAISE EXCEPTION '105 proof: ct_v_rt_revenue changed (% -> %) - the per-load view is not the same rule', v_rev0, v_rev1;
  END IF;
  SELECT md5(string_agg(concat_ws('|', id, revenue, revenue_intl, revenue_natl, cost_net, cost_vat, profit_worst, profit_ex_vat,
      margin_worst_pct, v5_revenue_missing), ';' ORDER BY id))
    INTO v_pnl1 FROM public.ct_v_rt_pnl;
  IF v_pnl1 IS DISTINCT FROM v_pnl0 THEN
    RAISE EXCEPTION '105 proof: ct_v_rt_pnl changed (% -> %)', v_pnl0, v_pnl1;
  END IF;
  SELECT count(*) INTO v_diff FROM (SELECT rt_id, sum(rev_intl + rev_natl) s FROM public.ct_v_rt_revenue_legs GROUP BY rt_id) a
    JOIN public.ct_v_rt_revenue r USING (rt_id) WHERE COALESCE(a.s, 0) <> r.revenue;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION '105 proof: % round trips whose loads do not add up to their revenue', v_diff;
  END IF;
  SELECT count(*) INTO v_rts FROM public.ct_v_rt_pnl;
  SELECT count(*), count(*) FILTER (WHERE complete) INTO v_cmp, v_ok FROM public.ct_v_rt_complete;
  IF v_cmp <> v_rts OR (SELECT count(DISTINCT rt_id) FROM public.ct_v_rt_complete) <> v_rts THEN
    RAISE EXCEPTION '105 proof: ct_v_rt_complete has % rows for % round trips (expected one each)', v_cmp, v_rts;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ct_v_rt_complete WHERE complete <> (cardinality(missing) = 0)
             OR NOT (missing <@ ARRAY['fuel', 'tolls', 'driver', 'partner_rate', 'price'])) THEN
    RAISE EXCEPTION '105 proof: ct_v_rt_complete names a missing item outside its five words';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['public.ct_v_rt_revenue_legs', 'public.ct_v_rt_cost_cat', 'public.ct_v_rt_complete']) v(rel)
             CROSS JOIN unnest(ARRAY['anon', 'authenticated']) r(role)
             WHERE has_table_privilege(r.role, v.rel, 'SELECT'))
     OR EXISTS (SELECT 1 FROM unnest(ARRAY['public.ct_v_rt_revenue_legs', 'public.ct_v_rt_cost_cat', 'public.ct_v_rt_complete']) v(rel)
             CROSS JOIN unnest(ARRAY['service_role', 'tms_check_runner']) r(role)
             WHERE NOT has_table_privilege(r.role, v.rel, 'SELECT')) THEN
    RAISE EXCEPTION '105 proof: the rights of a new view are not service_role + tms_check_runner only';
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN
    RAISE EXCEPTION '105 proof: trigger count % -> % (expected unchanged, B-54)', v_trg0, v_trg1;
  END IF;

  RAISE NOTICE '105 OK: % round trips, revenue % and P&L % unchanged, % complete, triggers %', v_rts, v_rev1, v_pnl1, v_ok, v_trg1;
END $do$;
