-- id: P-03
-- title: Ανάθεση χωρίς γεγονός γύρου (ίχνος)
-- flows: F-14
-- severity: P3
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: audit
-- impact: 
-- next: 
-- exceptions: Γονείς split· ίδιο σήμα με B-01 (κατάσταση) — εδώ με ώρα και actor.
-- tolerance: ζεύγος εντός ±60″ (το audit του trigger γράφεται ΠΡΙΝ από του Worker)
-- source: 02a §2 ζεύγος
-- enabled: yes
SELECT count(*) FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND (a.before_data->>'truck_id') IS NULL AND (a.before_data->>'partner_id') IS NULL AND ((a.after_data->>'truck_id') IS NOT NULL OR (a.after_data->>'partner_id') IS NOT NULL) AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name IN ('ct_round_trips','ct_rt_legs') AND b.actor LIKE 'trigger:rt%' AND b.created_at BETWEEN a.created_at-interval '60 seconds' AND a.created_at+interval '60 seconds');
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT a.record_id AS x FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND (a.before_data->>'truck_id') IS NULL AND (a.before_data->>'partner_id') IS NULL AND ((a.after_data->>'truck_id') IS NOT NULL OR (a.after_data->>'partner_id') IS NOT NULL) AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name IN ('ct_round_trips','ct_rt_legs') AND b.actor LIKE 'trigger:rt%' AND b.created_at BETWEEN a.created_at-interval '60 seconds' AND a.created_at+interval '60 seconds') LIMIT 50) s;
