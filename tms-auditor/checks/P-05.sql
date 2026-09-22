-- id: P-05
-- title: Ρότα χωρίς ενημέρωση γύρου (ίχνος)
-- flows: F-18
-- severity: P3
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: audit
-- impact: 
-- next: 
-- exceptions: Κλειστός γύρος: το front αναιρεί τη ρότα (P3 22/9) — τότε υπάρχει και δεύτερο update.
-- tolerance: ζεύγος εντός ±90″ (το audit του trigger γράφεται ΠΡΙΝ από του Worker)
-- source: 02a §2 ζεύγος
-- enabled: yes
SELECT count(*) FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND coalesce(a.before_data->>'rotation_id','')='' AND coalesce(a.after_data->>'rotation_id','')<>'' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name IN ('ct_round_trips','ct_rt_legs') AND (b.actor=a.actor OR b.actor LIKE 'trigger:rt%') AND b.created_at BETWEEN a.created_at-interval '90 seconds' AND a.created_at+interval '90 seconds');
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT a.record_id AS x FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND coalesce(a.before_data->>'rotation_id','')='' AND coalesce(a.after_data->>'rotation_id','')<>'' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name IN ('ct_round_trips','ct_rt_legs') AND (b.actor=a.actor OR b.actor LIKE 'trigger:rt%') AND b.created_at BETWEEN a.created_at-interval '90 seconds' AND a.created_at+interval '90 seconds') LIMIT 50) s;
