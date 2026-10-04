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
-- exceptions: source='excel' (ιστορικό 6/9) ποτέ. Γραμμές τοπικού οδηγού (local_move_id, χωρίς γύρο εκ σχεδιασμού) εκτός: τις ελέγχει ο B-64.
-- tolerance: 
-- source: 02b Β-09 · 22/9 = 0 · 060 (4/10): εξαιρούνται οι γραμμές τοπικού οδηγού
-- enabled: yes
SELECT count(*) FROM dl_entries d WHERE d.entry_type='trip' AND d.source='auto' AND d.deleted_at IS NULL AND d.local_move_id IS NULL
 AND (d.rt_id IS NULL OR EXISTS (SELECT 1 FROM ct_round_trips r WHERE r.id=d.rt_id AND r.status='cancelled'));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT d.id::text AS x FROM dl_entries d WHERE d.entry_type='trip' AND d.source='auto' AND d.deleted_at IS NULL AND d.local_move_id IS NULL
 AND (d.rt_id IS NULL OR EXISTS (SELECT 1 FROM ct_round_trips r WHERE r.id=d.rt_id AND r.status='cancelled')) LIMIT 50) s;
