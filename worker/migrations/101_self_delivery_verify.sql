-- 101 VERIFY - read only (SELECT). Runs before and after 101_self_delivery.sql (the column is read through to_jsonb, so
-- the query does not fail while it does not exist yet). One row.
-- EXPECTED right after 101: applied = '101 in place', columns 2, checks 2, triggers_on_self 2, views_end_on_it 2, b11_b12 'new',
--   self_invoiced 0, self_not_invoiced 0, b11_value 2 (the two rows of 21/8, untouched since 043).
-- BEFORE 101: applied = 'before 101', columns 0, checks 0, triggers_on_self 0, views_end_on_it 0, b11_b12 'old'.
-- LATER: self_invoiced grows with every "Aftoparadosi" ticked on the invoicing screen; self_not_invoiced stays 0
--   (the screen writes both together and clears both together - anything else is a write from outside the screen);
--   b11_value stays 2.
SELECT CASE
         WHEN g.cols = 2 AND g.cks = 2 AND g.fn = '670400a6032afeaa247787464533704f' THEN '101 in place'
         WHEN g.cols = 0 AND g.fn = 'dd975c4f04f95f528c7c79a80eb4d387' THEN 'before 101'
         ELSE '101 MIXED - stop, copy this row to the coordinator' END AS applied,
       g.cols AS columns,
       g.cks AS checks,
       g.trg AS triggers_on_self,
       g.views AS views_end_on_it,
       CASE WHEN g.b11 = 'a75afea135d5685718c62c44b0f1ebcf' AND g.b12 = '34da2de0eedfbdbbfaf20a705c125c3c' THEN 'new'
            WHEN g.b11 = 'e9c5a511168f40a9a377ec1d027fa012' AND g.b12 = '15c4186a24376ddfd2c716de0b15baa7' THEN 'old'
            ELSE 'OTHER' END AS b11_b12,
       (SELECT count(*) FROM public.orders o WHERE o.deleted_at IS NULL AND o.invoiced AND to_jsonb(o)->>'self_delivery' = 'true')
     + (SELECT count(*) FROM public.national_orders n WHERE n.deleted_at IS NULL AND n.invoiced AND to_jsonb(n)->>'self_delivery' = 'true') AS self_invoiced,
       (SELECT count(*) FROM public.orders o WHERE o.deleted_at IS NULL AND o.invoiced IS NOT TRUE AND to_jsonb(o)->>'self_delivery' = 'true')
     + (SELECT count(*) FROM public.national_orders n WHERE n.deleted_at IS NULL AND n.invoiced IS NOT TRUE AND to_jsonb(n)->>'self_delivery' = 'true') AS self_not_invoiced,
       (SELECT count(*) FROM public.orders o WHERE o.deleted_at IS NULL AND o.invoiced AND to_jsonb(o)->>'self_delivery' IS DISTINCT FROM 'true'
          AND coalesce(btrim(o.invoice_number), '') = '')
     + (SELECT count(*) FROM public.national_orders n WHERE n.deleted_at IS NULL AND n.invoiced AND to_jsonb(n)->>'self_delivery' IS DISTINCT FROM 'true'
          AND coalesce(btrim(n.invoice_number), '') = '') AS b11_value
  FROM (SELECT
          (SELECT count(*) FROM pg_attribute WHERE attname = 'self_delivery' AND NOT attisdropped
            AND attrelid IN ('public.orders'::regclass, 'public.national_orders'::regclass)) AS cols,
          (SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND convalidated
            AND conname IN ('orders_self_delivery_no_tpy', 'national_orders_self_delivery_no_tpy')) AS cks,
          (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.invoice_mark_guard()'::regprocedure) AS fn,
          (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O' AND tgfoid = 'public.invoice_mark_guard()'::regprocedure
            AND pg_get_triggerdef(oid) LIKE '%price, self_delivery ON%') AS trg,
          (SELECT count(*) FROM pg_attribute a WHERE a.attname = 'self_delivery' AND NOT a.attisdropped
            AND a.attrelid IN ('public.orders_with_derived'::regclass, 'public.national_orders_with_derived'::regclass)
            AND a.attnum = (SELECT max(x.attnum) FROM pg_attribute x WHERE x.attrelid = a.attrelid AND NOT x.attisdropped)) AS views,
          (SELECT md5(sql_text) FROM monitoring.checks WHERE id = 'B-11') AS b11,
          (SELECT md5(sql_text) FROM monitoring.checks WHERE id = 'B-12') AS b12) g;
