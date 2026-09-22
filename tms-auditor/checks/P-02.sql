-- id: P-02
-- title: Νέα VS παραγγελία χωρίς εθνικό φορτίο (ίχνος)
-- flows: F-10
-- severity: P3
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: audit
-- impact: 
-- next: 
-- exceptions: 
-- tolerance: ζεύγος εντός ±60″ (το audit του trigger γράφεται ΠΡΙΝ από του Worker)
-- source: 02a §2 ζεύγος
-- enabled: yes
SELECT count(*) FROM audit_log a WHERE a.table_name='orders' AND a.action='create' AND (a.after_data->>'veroia_switch')='true' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name='national_loads' AND b.action IN ('create','update') AND (b.actor=a.actor OR b.actor LIKE 'trigger:national_load%') AND b.created_at BETWEEN a.created_at-interval '60 seconds' AND a.created_at+interval '60 seconds');
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT a.record_id AS x FROM audit_log a WHERE a.table_name='orders' AND a.action='create' AND (a.after_data->>'veroia_switch')='true' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name='national_loads' AND b.action IN ('create','update') AND (b.actor=a.actor OR b.actor LIKE 'trigger:national_load%') AND b.created_at BETWEEN a.created_at-interval '60 seconds' AND a.created_at+interval '60 seconds') LIMIT 50) s;
