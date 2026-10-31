-- 080 VERIFY - read only (SELECT), after 080_plan_optional_price_pallets.sql. One row.
-- EXPECTED: applied = '080 in place', changed_texts 0, pallets_nullable true, pieces_check true, shape_check true,
-- pnl_flag true, b100_on true, worker_execute true. The counts grow as the desk saves orders without a price or pallets:
-- orders_no_price = B-90's queue, orders_unknown_pallets = B-100's, rt_revenue_missing = cycles the P&L flags.
SELECT CASE WHEN EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-100')
             AND (SELECT NOT attnotnull FROM pg_attribute WHERE attrelid = 'public.shipment_pieces'::regclass AND attname = 'pallets')
            THEN '080 in place' ELSE '080 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_orders_create(jsonb,text,text)', '2326a1dc062d08b71fb0d8f28dc36151'),
          ('public.plan_h_order_summary(jsonb)', '73e59554178fbdbebdf9544994dfa5e5'),
          ('public.plan_shipment_problem(bigint)', 'eb19f0bd29b5cbc7843d2145be858727'),
          ('public.plan_h_resize(bigint,numeric,text,text)', 'b5adbb199b7bff4d7f0fc3d70a34cb7d'),
          ('public.plan_h_put(jsonb,jsonb,text,text,bigint[])', '7ed550b6cafa5bf2fb88d65ba2c112bf'),
          ('public.plan_split_piece(jsonb,text,text)', '4a61314bbab1492431750fd75cffdb14'),
          ('public.plan_h_pallet_sync(bigint[],text,text)', '8310af0c7711ba2fcfda96955ae5f7a5')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT NOT attnotnull FROM pg_attribute WHERE attrelid = 'public.shipment_pieces'::regclass AND attname = 'pallets') AS pallets_nullable,
       (SELECT position('parent_piece_id' IN pg_get_constraintdef(oid)) > 0 FROM pg_constraint
         WHERE conrelid = 'public.shipment_pieces'::regclass AND conname = 'pieces_pallets') AS pieces_check,
       (SELECT position('pallets IS NOT NULL' IN pg_get_constraintdef(oid)) = 0 FROM pg_constraint
         WHERE conrelid = 'public.shipments'::regclass AND conname = 'shipments_shape') AS shape_check,
       (SELECT attname = 'v5_revenue_missing' FROM pg_attribute WHERE attrelid = 'public.ct_v_rt_pnl'::regclass AND attnum > 0
         ORDER BY attnum DESC LIMIT 1) AS pnl_flag,
       (SELECT enabled FROM monitoring.checks WHERE id = 'B-100') AS b100_on,
       has_function_privilege('service_role', 'public.plan_orders_create(jsonb,text,text)', 'EXECUTE')
         AND has_function_privilege('service_role', 'public.plan_split_piece(jsonb,text,text)', 'EXECUTE')
         AND has_table_privilege('service_role', 'public.ct_v_rt_pnl', 'SELECT') AS worker_execute,
       (SELECT count(*) FROM public.national_orders n WHERE n.deleted_at IS NULL AND n.price IS NULL
          AND EXISTS (SELECT 1 FROM public.shipments s WHERE s.nat_order_id = n.id AND s.deleted_at IS NULL)) AS orders_no_price,
       (SELECT count(DISTINCT s.nat_order_id) FROM public.shipments s WHERE s.deleted_at IS NULL AND s.order_stop_id IS NULL
          AND s.pallets IS NULL) AS orders_unknown_pallets,
       (SELECT count(*) FROM public.ct_v_rt_revenue WHERE revenue_missing AND rt_id IN (SELECT rt_id FROM public.piece_legs)) AS rt_revenue_missing;
