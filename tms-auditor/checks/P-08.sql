-- id: P-08
-- title: Παλέτες: ενημέρωση χωρίς επιβεβαίωση (ίχνος)
-- flows: F-31
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: audit
-- impact: Το δελτίο παλετών ανέβηκε αλλά η κίνηση δεν επιβεβαιώθηκε — μένει εκκρεμής και μπλοκάρει τιμολόγηση.
-- next: 
-- exceptions: 
-- tolerance: ζεύγος εντός ±120″ (το audit του trigger γράφεται ΠΡΙΝ από του Worker)
-- source: 02a §2 ζεύγος
-- enabled: yes
SELECT count(*) FROM audit_log a WHERE a.table_name='pl_movements' AND a.action='update' AND (a.after_data->>'sheet_url') IS NOT NULL AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name='pl_movements' AND b.action='confirm' AND b.record_id=a.record_id AND b.created_at BETWEEN a.created_at-interval '120 seconds' AND a.created_at+interval '120 seconds');
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT a.record_id AS x FROM audit_log a WHERE a.table_name='pl_movements' AND a.action='update' AND (a.after_data->>'sheet_url') IS NOT NULL AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name='pl_movements' AND b.action='confirm' AND b.record_id=a.record_id AND b.created_at BETWEEN a.created_at-interval '120 seconds' AND a.created_at+interval '120 seconds') LIMIT 50) s;
