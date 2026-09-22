-- id: P-06
-- title: Delivered χωρίς σφραγίδα στάσης (ίχνος · δεύτερη πόρτα)
-- flows: F-26,F-09
-- severity: P3
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: audit
-- impact: 
-- next: 
-- exceptions: Delivered από καρτέλα (F-09) = ασάφεια Α1 — το σήμα ΕΙΝΑΙ αυτό.
-- tolerance: ζεύγος εντός ±120″ (το audit του trigger γράφεται ΠΡΙΝ από του Worker)
-- source: 02a §2 ζεύγος
-- enabled: yes
SELECT count(*) FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND (a.after_data->>'status')='Delivered' AND coalesce(a.before_data->>'status','')<>'Delivered' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name='order_stops' AND b.action='update' AND b.actor=a.actor AND b.created_at BETWEEN a.created_at-interval '120 seconds' AND a.created_at+interval '120 seconds');
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT a.record_id AS x FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND (a.after_data->>'status')='Delivered' AND coalesce(a.before_data->>'status','')<>'Delivered' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name='order_stops' AND b.action='update' AND b.actor=a.actor AND b.created_at BETWEEN a.created_at-interval '120 seconds' AND a.created_at+interval '120 seconds') LIMIT 50) s;
