-- 073 FINGERPRINT - read-only (SELECT only, writes nothing). Run it BEFORE 073 and right AFTER 073 (and after the
-- rollback): the same row, if nobody wrote in between (the content depends on today's date and on every write: run
-- them the same evening, after 15:00, one right after the other). ASCII only.
-- WHAT: the same ordered rows that 073 proves inside its block (its snap_sql, one list per fact, principle 3): every
-- view 073 replaces and every view that reads one of them, the pallet ledger and the round trips (the new last column
-- of ct_v_rt_pnl is left out), plus the payroll rows. Each value is <rows>:<md5 of the rows in order>.
SELECT now() AT TIME ZONE 'Europe/Athens' AS athens_now,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.ct_v_rt_revenue v) AS revenue,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.ct_v_rt_costs v) AS costs,
  (SELECT count(*) || ':' || md5(coalesce(string_agg((to_jsonb(v) - 'partner_rate_missing')::text, '|' ORDER BY v.id), '')) FROM public.ct_v_rt_pnl v) AS pnl,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.truck_id), '')) FROM public.ct_v_wear_rate v) AS wear_rate,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.dl_v_rt_route v) AS route,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.dl_v_rt_gap v) AS rt_gap,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.id), '')) FROM public.dl_v_entries v) AS dl_entries_view,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.driver_id), '')) FROM public.dl_v_balance v) AS dl_balance,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.ct_v_rt_pallet_gate v) AS pallet_gate,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.piece_kind, v.piece_id), '')) FROM public.stock_v_pieces v) AS stock_pieces,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.id), '')) FROM public.stock_v_lots v) AS stock_lots,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.lot_id), '')) FROM public.stock_v_lot_money v) AS lot_money,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.lot_id, v.seq), '')) FROM public.stock_v_lot_alloc v) AS lot_alloc,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.order_id, v.rt_amount), '')) FROM public.stock_v_rt_amounts v) AS rt_amounts,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(m)::text, '|' ORDER BY m.id), '')) FROM public.pl_movements m) AS pallets,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(r)::text, '|' ORDER BY r.id), '')) FROM public.ct_round_trips r) AS round_trips,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(e)::text, '|' ORDER BY e.id), '')) FROM public.dl_entries e) AS payroll;
