-- 071 FINGERPRINT - read-only (SELECT only). Run it BEFORE 071 and again AFTER it: rt_md5 and dl_md5 must be equal.
-- The authoritative proof is inside 071's block (same SQL, one transaction); this is the owner's own eye on it.
-- If dl_md5 differs, someone saved payroll in between: look for dl_entries.updated_at after the first run.
-- ASCII only. Works before and after 071 (it reads no 071 column).
SELECT
  (SELECT count(*) FROM public.ct_round_trips) AS round_trips,
  (SELECT md5(coalesce(string_agg(s.x, '|' ORDER BY s.id), '')) FROM (
     SELECT rt.id, jsonb_build_object(
       'code', rt.code, 'scope', rt.scope, 'status', rt.status, 'trip_type', rt.trip_type, 'truck', rt.truck_id,
       'driver', rt.driver_id, 'trailer', rt.trailer_id, 'partner', rt.partner_id, 'date_start', rt.date_start,
       'date_end', rt.date_end, 'closed_at', rt.closed_at, 'total_km', rt.total_km, 'notes', rt.notes,
       'updated_at', rt.updated_at, 'revenue', rv.revenue, 'revenue_intl', rv.revenue_intl,
       'revenue_natl', rv.revenue_natl, 'lines_net', c.lines_net, 'vat', c.vat, 'wear', c.wear,
       'dl_trip_value', c.dl_trip_value, 'dl_expenses', c.dl_expenses, 'pay_pending', c.driver_pay_pending,
       'pay_missing', c.driver_pay_missing, 'partner_planned', c.partner_planned,
       'partner_invoiced', c.partner_invoiced, 'pnl_cost_gross', p.cost_gross,
       'pnl_profit_worst', p.profit_worst, 'pnl_profit_ex_vat', p.profit_ex_vat)::text AS x
     FROM public.ct_round_trips rt
     JOIN public.ct_v_rt_revenue rv ON rv.rt_id = rt.id
     JOIN public.ct_v_rt_costs c ON c.rt_id = rt.id
     LEFT JOIN public.ct_v_rt_pnl p ON p.id = rt.id) s) AS rt_md5,
  (SELECT count(*) FROM public.dl_entries) AS dl_rows,
  (SELECT md5(coalesce(string_agg(to_jsonb(e)::text, '|' ORDER BY e.id), '')) FROM public.dl_entries e) AS dl_md5,
  now() AT TIME ZONE 'Europe/Athens' AS read_at_athens;
