-- id: B-09
-- title: Αυτόματη γραμμή μισθοδοσίας χωρίς ζωντανό γύρο
-- flows: F-35
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: dl_entries
-- impact: Πληρωμή οδηγού για γύρο που ακυρώθηκε.
-- next: 
-- exceptions: source='excel' (ιστορικό 6/9) ποτέ.
-- tolerance: 
-- source: 02b Β-09 · 22/9 = 0
-- enabled: yes
SELECT count(*) FROM dl_entries d WHERE d.entry_type='trip' AND d.source='auto' AND d.deleted_at IS NULL
 AND (d.rt_id IS NULL OR EXISTS (SELECT 1 FROM ct_round_trips r WHERE r.id=d.rt_id AND r.status='cancelled'));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT d.id::text AS x FROM dl_entries d WHERE d.entry_type='trip' AND d.source='auto' AND d.deleted_at IS NULL
 AND (d.rt_id IS NULL OR EXISTS (SELECT 1 FROM ct_round_trips r WHERE r.id=d.rt_id AND r.status='cancelled')) LIMIT 50) s;
