-- 075 VERIFY · read only. Run after 075, and again after the first confirmation in the app. Tables only, no views.
SET statement_timeout = '5s';
-- 1. the constraint (EXPECTED: the eight actions, validated)
SELECT conname, convalidated, pg_get_constraintdef(oid) AS def
FROM pg_constraint WHERE conrelid = 'public.audit_log'::regclass AND conname = 'audit_log_action_check';
-- 2. rows per action on pl_movements and orders today (EXPECTED after one confirmation: confirm >= 1)
SELECT table_name, action, count(*) AS rows, max(created_at) AS last
FROM public.audit_log
WHERE created_at >= date_trunc('day', now()) AND table_name IN ('pl_movements', 'orders', 'pallet-sheets')
GROUP BY 1, 2 ORDER BY 1, 2;
-- 3. refused audit rows the loud Worker reported (EXPECTED: rows only between the Worker deploy and 075, then 0)
SELECT date_trunc('hour', created_at) AS hour, count(*) AS refused
FROM public.app_errors WHERE page = 'worker:audit' AND created_at >= now() - interval '2 days'
GROUP BY 1 ORDER BY 1;
-- 4. no proof row left (EXPECTED 0)
SELECT count(*) AS proof_rows FROM public.audit_log WHERE actor = '075-proof';
