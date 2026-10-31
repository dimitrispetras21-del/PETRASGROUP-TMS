-- 087 VERIFY - read only (SELECT), after 087_plan_split_leave_by.sql. One row.
-- EXPECTED: applied = '087 in place', worker_execute true.
--   stock_chosen: live stock rows whose leave_by is not the default (nat_due_day - 1) = days a user chose in
--   "Spase...", or whose national day moved since (measure it before the run: it grows only with 087's field).
--   stock_late: live stock rows already late
--   (v_piece_state.overdue), the panel's red rows - compare with the panel before and after.
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_split_piece(jsonb,text,text)'::regprocedure)
                 = 'd41717aed68e31def164cee48df6694d' THEN '087 in place' ELSE '087 NOT APPLIED' END AS applied,
       has_function_privilege('service_role', 'public.plan_split_piece(jsonb,text,text)', 'EXECUTE') AS worker_execute,
       (SELECT count(*) FROM public.v_piece_state ps WHERE ps.is_stock AND ps.leave_by IS DISTINCT FROM ps.nat_due_day - 1) AS stock_chosen,
       (SELECT count(*) FROM public.v_piece_state ps WHERE ps.is_stock AND ps.overdue) AS stock_late;
