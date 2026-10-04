-- 057 ROLLBACK — two INDEPENDENT DO blocks; run only the one you need, each proves itself.
-- Never drop columns, tables or views: orders_with_derived reads stock_lots, and breaking it takes
-- down every ORDERS read of the app. The screens have their own kill switch: FEATURES.STOCK_LOTS=false
-- in config.js (front deploy) hides every stock entry point without touching the database.

-- ── R1 — guards off ──────────────────────────────────────────────────────────────────────────────
-- When: a guard bug blocks ordinary work (e.g. 06:00, saves of orders refused). Effect: the three
-- triggers go; the six CHECKs STAY (they only bite rows with stock_lot_id, i.e. pieces). The auditor's
-- S-02 turns red on purpose until the guards are back (re-create them from 057 §6).
do $r1$
declare
  v_n int;
begin
  drop trigger if exists stock_guard_orders on public.orders;
  drop trigger if exists stock_guard_natl   on public.national_orders;
  drop trigger if exists stock_guard_lots   on public.stock_lots;
  select count(*) into v_n from pg_trigger
   where not tgisinternal and tgname in ('stock_guard_orders', 'stock_guard_natl', 'stock_guard_lots');
  if v_n <> 0 then
    raise exception 'R1 proof: % stock_guard trigger(s) still present', v_n;
  end if;
  raise notice 'R1 OK: 0 stock_guard triggers. CHECKs untouched. S-02 will report this until 057 §6 is re-run.';
end
$r1$;

-- ── R2 — money back to today's rule ──────────────────────────────────────────────────────────────
-- When: the allocation shows wrong numbers in TRIP PnL. Effect: ct_v_rt_revenue is re-created with
-- its 3/10 text (embedded verbatim below) → every RT reads orders.price again, exactly as before 057;
-- the stock_v_* views stay (unused by revenue). Proof: the view's md5 is the pre-057 one.
do $r2$
declare
  v_md5 text;
begin
  perform set_config('search_path', 'public', true);   -- same deparse context as the md5 measurement
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
