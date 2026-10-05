-- 057 ROLLBACK R2 — revenue back to the pre-057 rule. This file holds ONE DO block on purpose: the
-- SQL editor runs the whole file when nothing is selected, so a rollback file must never hold a second
-- action (R1 «guards off» lives in 057_stock_lots_rollback_r1_guards_off.sql, R3 «blank group_id
-- normaliser off» in 057_stock_lots_rollback_r3_blank_null_off.sql).
-- Never drop columns, tables or views: orders_with_derived reads stock_lots, and breaking it takes
-- down every ORDERS read of the app. The screens have their own kill switch: FEATURES.STOCK_LOTS=false
-- in config.js (front deploy) hides every stock entry point without touching the database.

-- ── R2 — money back to today's rule ──────────────────────────────────────────────────────────────
-- When: the allocation shows wrong numbers in TRIP PnL. Effect: ct_v_rt_revenue is re-created with
-- the text migration 034 (national RTs) left on 4/10 evening — 4 columns, revenue / revenue_intl /
-- revenue_natl, embedded verbatim below (pg_get_viewdef via SELECT) → every RT reads orders.price
-- again, exactly as before 057, and a VS piece pays the full x_import / x_export again (the
-- OWNER-Q3 proration of 057 lives only in the view: stock_vs_charge() and the full_truck_pallets row
-- stay, unused); ct_v_rt_pnl keeps reading the same 4 columns; the stock_v_* views stay (unused by
-- revenue). Proof: the view's md5 is the pre-057 one (62e488b5…, the md5 057 guards).
-- View options (round 2, SQL reviewer P3 (1)): CREATE OR REPLACE VIEW resets a view's options to the
-- ones it names — none. Round 1b refused to run when the view had options, which blocked the rollback
-- exactly when it may be needed (an owner who set security_invoker after 057 could not roll money
-- back without first deciding about the option). Now the options are RECORDED before, PUT BACK after
-- and PROVED identical: the rollback changes the money rule and nothing else. (057 itself still
-- refuses options: it is a forward change the owner can re-plan; a rollback is not.)
-- WHAT IT REPLACES (round 3, critic-3 Σ2-05): only the revenue text 057 wrote (md5 7bd4c2b3…, the
-- «revenue» md5 in 057's NOTICE; measured on the PGlite replica whose deparse matched production's
-- for every guarded view) — or, re-run, the pre-057 text it restores. Anything else means a later
-- migration rewrote ct_v_rt_revenue: replacing it would silently delete that migration's logic, so
-- R2 refuses and must be regenerated with it. 057_stock_lots_verify.sql V1 «revenue_known_to_r2»
-- and the dry run's scenario G check, the same evening, that the text 057 leaves is the one R2 knows.
-- THE SCREEN (critic-3 Σ2-05 b): R2 changes the database's revenue only. TRIP PnL's lot lines
-- (modules/costs.js, independent of FEATURES.STOCK_LOTS by design) keep printing «παρτίδα #N …»
-- amounts that no longer add up to the RT's revenue — R2 goes together with a front change; tell the
-- coordinator before running it.
do $r2$
declare
  v_md5   text;
  v_opts  text[];
  v_after text[];
  -- The two texts R2 may replace (header). One literal each: harness + verify V1 prove the first is
  -- what 057 leaves, the second is the md5 057 guards before it runs.
  v_057_md5 constant text := '7bd4c2b3206af115a5cfff5478dfdfc9';
  v_pre_md5 constant text := '62e488b56373dd14e1b697f7756aa5a8';
begin
  perform set_config('search_path', 'public', true);   -- same deparse context as the md5 measurement
  perform set_config('lock_timeout', '5s', true);       -- never queue TRIP PnL reads behind an idle transaction
  select md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) into v_md5;
  if v_md5 is distinct from v_057_md5 and v_md5 is distinct from v_pre_md5 then
    raise exception 'R2 guard: ct_v_rt_revenue is neither the text 057 wrote (md5 %) nor the pre-057 one — another migration rewrote it since 057 (md5 now %); regenerate R2 with it, never replace it blind',
      v_057_md5, v_md5;
  end if;
  -- Recorded BEFORE the replace (header): NULL = owner-rights, as 057 left it.
  select c.reloptions into v_opts from pg_class c where c.oid = 'public.ct_v_rt_revenue'::regclass;
  create or replace view public.ct_v_rt_revenue as
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
            WHERE nord.deleted_at IS NULL AND nord.price IS NOT NULL AND nord.source_order_id IS NULL
          ), legs AS (
           SELECT rt.id AS rt_id,
                  CASE
                      WHEN l.order_id IS NOT NULL THEN COALESCE(o.price,
                      CASE
                          WHEN o.leg_no = 1 THEN p.price
                          ELSE NULL::numeric
                      END, 0::numeric) -
                      CASE
                          WHEN
                          CASE
                              WHEN o.parent_order_id IS NOT NULL THEN p.veroia_switch
                              ELSE o.veroia_switch
                          END THEN
                          CASE
                              WHEN
                              CASE
                                  WHEN o.parent_order_id IS NOT NULL THEN p.direction
                                  ELSE o.direction
                              END = 'Export'::text THEN ct_setting('x_export'::text)
                              ELSE ct_setting('x_import'::text)
                          END
                          ELSE 0::numeric
                      END
                      ELSE 0::numeric
                  END AS rev_intl,
                  CASE
                      WHEN l.nat_load_id IS NOT NULL THEN
                      CASE
                          WHEN nl.source_type = 'Direct'::text AND nl.source_order_id IS NOT NULL AND nl.id = (( SELECT min(d.id) AS min
                             FROM national_loads d
                            WHERE d.source_order_id = nl.source_order_id AND d.source_type = 'Direct'::text AND d.deleted_at IS NULL)) AND
                          CASE
                              WHEN so.parent_order_id IS NOT NULL THEN sp.veroia_switch
                              ELSE so.veroia_switch
                          END THEN
                          CASE
                              WHEN
                              CASE
                                  WHEN so.parent_order_id IS NOT NULL THEN sp.direction
                                  ELSE so.direction
                              END = 'Export'::text THEN ct_setting('x_export'::text)
                              ELSE ct_setting('x_import'::text)
                          END
                          ELSE 0::numeric
                      END + COALESCE(( SELECT sum(h.price) AS sum
                         FROM natord_home h
                        WHERE h.home_nat_load_id = nl.id), 0::numeric)
                      ELSE 0::numeric
                  END AS rev_natl
             FROM ct_round_trips rt
               LEFT JOIN ct_rt_legs l ON l.rt_id = rt.id
               LEFT JOIN orders o ON o.id = l.order_id
               LEFT JOIN orders p ON p.id = o.parent_order_id
               LEFT JOIN national_loads nl ON nl.id = l.nat_load_id
               LEFT JOIN orders so ON so.id = nl.source_order_id
               LEFT JOIN orders sp ON sp.id = so.parent_order_id
          )
   SELECT rt_id,
      COALESCE(sum(rev_intl + rev_natl), 0::numeric) AS revenue,
      COALESCE(sum(rev_intl), 0::numeric) AS revenue_intl,
      COALESCE(sum(rev_natl), 0::numeric) AS revenue_natl
     FROM legs
    GROUP BY rt_id;
  select md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) into v_md5;
  if v_md5 is distinct from v_pre_md5 then
    raise exception 'R2 proof: ct_v_rt_revenue md5 is %, expected the pre-057 (034) %', v_md5, v_pre_md5;
  end if;
  -- Put back what the replace reset. The options come from the catalog itself (key=value pairs such
  -- as security_invoker=true), so splicing them into ALTER VIEW … SET is exact.
  if v_opts is not null then
    execute format('alter view public.ct_v_rt_revenue set (%s)', array_to_string(v_opts, ', '));
  end if;
  -- The md5 cannot see options (pg_get_viewdef prints none): proved on their own, element for element.
  select c.reloptions into v_after from pg_class c where c.oid = 'public.ct_v_rt_revenue'::regclass;
  if v_after is distinct from v_opts then
    raise exception 'R2 proof: ct_v_rt_revenue options % after the rollback, % before — expected the same',
      coalesce(array_to_string(v_after, ', '), 'none'), coalesce(array_to_string(v_opts, ', '), 'none');
  end if;
  raise notice 'R2 OK: ct_v_rt_revenue is the pre-057 (034) text again (md5 %), view options kept: %.', v_md5,
    coalesce(array_to_string(v_after, ', '), 'none (owner-rights)');
end
$r2$;
