-- 085 VERIFY - read only (SELECT), after 085_plan_invoiced_client_price.sql. One row.
-- EXPECTED: applied = '085 in place', changed_texts 0, update_knows_client true, read_says_invoiced true.
--   v5_invoiced / v5_open: live v5 nationals invoiced / not (7 / 19 on 1/11): the invoiced ones keep their client and
--   change price only from owner / accountant. It moves as orders are invoiced; it is NOT a fault.
--   client_changes: audit rows of a client change on a national (0 right after the run; each later one is a
--   correction, with before / after).
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_order_update(jsonb,text,text)'::regprocedure)
                 = 'f3f69925542ec94d04f2def48cc8628e' THEN '085 in place' ELSE '085 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_order_update(jsonb,text,text)', 'f3f69925542ec94d04f2def48cc8628e'),
          ('public.plan_order_read(bigint,text)', '3debf860290f6e4d382028ad5b7e96d4')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT prosrc LIKE '%invoiced_client%' AND prosrc LIKE '%invoiced_price%' FROM pg_proc
         WHERE oid = 'public.plan_order_update(jsonb,text,text)'::regprocedure) AS update_knows_client,
       (SELECT prosrc LIKE '%''invoiced'', coalesce(n.invoiced, false)%' FROM pg_proc
         WHERE oid = 'public.plan_order_read(bigint,text)'::regprocedure) AS read_says_invoiced,
       (SELECT count(*) FROM public.national_orders n WHERE n.deleted_at IS NULL AND n.invoiced IS TRUE
           AND EXISTS (SELECT 1 FROM public.shipments s WHERE s.nat_order_id = n.id AND s.deleted_at IS NULL)) AS v5_invoiced,
       (SELECT count(*) FROM public.national_orders n WHERE n.deleted_at IS NULL AND n.invoiced IS NOT TRUE
           AND EXISTS (SELECT 1 FROM public.shipments s WHERE s.nat_order_id = n.id AND s.deleted_at IS NULL)) AS v5_open,
       (SELECT count(*) FROM public.audit_log a WHERE a.table_name = 'national_orders' AND a.action = 'update'
           AND a.after_data ? 'client_id') AS client_changes;
