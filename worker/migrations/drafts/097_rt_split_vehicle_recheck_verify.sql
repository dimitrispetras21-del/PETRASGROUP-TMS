-- 097 / 097b VERIFY (read-only, any time). One row: is the vehicle trigger in place, does B-54 equal the trigger
-- count, how many EXPORTS have their matched import on another live round trip (the detection query of 2/11: it
-- counts closed + closed pairs too, which B-77 leaves out on purpose; an import whose stale matched_import_id points
-- at another import - #268 -> #302, August, two trucks - is not an export and is left out), which pairs, and is 097b
-- in place.
-- Expected after 097 + 097b: 097 in place | T | T | 0 | (none) | 097b in place.
-- Before 097b: split_pairs 2, pairs "525>528 RT-1240/RT-1242, 602>606 RT-1278/RT-1283".
-- THIS FILE IS ASCII ONLY.
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'rt_y_link_split_vehicle'
                          AND tgenabled = 'O' AND md5(pg_get_triggerdef(oid)) = 'b1db54c1bcc73d086bc6cfa06a3e677e')
            THEN '097 in place' ELSE '097 NOT APPLIED' END AS rule,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       s.n AS split_pairs,
       coalesce(s.list, '(none)') AS pairs,
       CASE WHEN (SELECT count(*) FROM ct_round_trips WHERE id IN (285, 244) AND status = 'cancelled') = 2
             AND (SELECT count(*) FROM ct_rt_legs WHERE (order_id, rt_id) IN ((606, 280), (528, 242))) = 2
            THEN '097b in place' ELSE '097b NOT APPLIED' END AS repair
FROM (SELECT count(*) AS n,
             string_agg(ex.id || '>' || im.id || ' ' || re.code || '/' || ri.code, ', ' ORDER BY ex.id) AS list
        FROM orders ex
        JOIN orders im ON im.legacy_id = ex.matched_import_id AND im.deleted_at IS NULL
        JOIN ct_rt_legs le ON le.order_id = ex.id JOIN ct_round_trips re ON re.id = le.rt_id AND re.status <> 'cancelled'
        JOIN ct_rt_legs li ON li.order_id = im.id JOIN ct_round_trips ri ON ri.id = li.rt_id AND ri.status <> 'cancelled'
       WHERE ex.deleted_at IS NULL AND ex.direction = 'Export' AND re.id <> ri.id) s;
