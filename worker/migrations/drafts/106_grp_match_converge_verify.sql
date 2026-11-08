-- VERIFY 106 - read only. Run after the source (and again after a rollback). ASCII only.
-- EXPECTED after 106: one row "106 in place", partly_matched_groups 0, rt225 "closed / 7 / 3 legs".
-- EXPECTED after the rollback: "106 NOT APPLIED", partly_matched_groups 1.
SELECT CASE WHEN (SELECT matched_import_id FROM orders WHERE id = 464) = 'recR5tH3Mw2nLFX0n' THEN '106 in place' ELSE '106 NOT APPLIED' END AS state,
       (SELECT count(*) FROM (
          SELECT split_part(nullif(group_id,''),'|',1) FROM orders
           WHERE deleted_at IS NULL AND coalesce(status,'') <> 'Cancelled' AND direction = 'Export'
             AND split_part(nullif(group_id,''),'|',1) LIKE 'GRP-%'
           GROUP BY 1
          HAVING count(nullif(matched_import_id,'')) > 0
             AND (count(nullif(matched_import_id,'')) < count(*) OR count(DISTINCT nullif(matched_import_id,'')) > 1)) q) AS partly_matched_groups,
       (SELECT status || ' / ' || truck_id || ' / ' || (SELECT count(*) FROM ct_rt_legs WHERE rt_id = 225) || ' legs'
          FROM ct_round_trips WHERE id = 225) AS rt225;
