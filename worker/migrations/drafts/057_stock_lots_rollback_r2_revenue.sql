-- 057 ROLLBACK R2 — revenue back to the 3/10 rule. This file holds ONE DO block on purpose: the SQL
-- editor runs the whole file when nothing is selected, so a rollback file must never hold a second
-- action (R1 «guards off» lives in 057_stock_lots_rollback_r1_guards_off.sql).
-- Never drop columns, tables or views: orders_with_derived reads stock_lots, and breaking it takes
-- down every ORDERS read of the app. The screens have their own kill switch: FEATURES.STOCK_LOTS=false
-- in config.js (front deploy) hides every stock entry point without touching the database.

-- ── R2 — money back to today's rule ──────────────────────────────────────────────────────────────
-- When: the allocation shows wrong numbers in TRIP PnL. Effect: ct_v_rt_revenue is re-created with
-- its 3/10 text (embedded verbatim below) → every RT reads orders.price again, exactly as before 057;
-- the stock_v_* views stay (unused by revenue). Proof: the view's md5 is the pre-057 one.
do $r2$
declare
  v_md5 text;
begin
  perform set_config('search_path', 'public', true);   -- same deparse context as the md5 measurement
  perform set_config('lock_timeout', '5s', true);       -- never queue TRIP PnL reads behind an idle transaction
  create or replace view public.ct_v_rt_revenue as
   SELECT rt.id AS rt_id,
      COALESCE(sum(
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
              WHEN nl.source_type = 'Direct'::text AND nl.source_order_id IS NOT NULL THEN
              CASE
                  WHEN nl.direction = 'ΑΝΟΔΟΣ'::text THEN ct_setting('x_export'::text)
                  ELSE ct_setting('x_import'::text)
              END
              ELSE 0::numeric
          END), 0::numeric) AS revenue
     FROM ct_round_trips rt
       LEFT JOIN ct_rt_legs l ON l.rt_id = rt.id
       LEFT JOIN orders o ON o.id = l.order_id
       LEFT JOIN orders p ON p.id = o.parent_order_id
       LEFT JOIN national_loads nl ON nl.id = l.nat_load_id
    GROUP BY rt.id;
  select md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) into v_md5;
  if v_md5 is distinct from 'db4967d5ca267d1acaa285852ee83628' then
    raise exception 'R2 proof: ct_v_rt_revenue md5 is %, expected the 3/10 db4967d5ca267d1acaa285852ee83628', v_md5;
  end if;
  raise notice 'R2 OK: ct_v_rt_revenue is the 3/10 text again (md5 %).', v_md5;
end
$r2$;
