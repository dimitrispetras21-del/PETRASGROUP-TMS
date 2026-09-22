-- id: B-46
-- title: Hand-over σκελών ασύμφωνο (εκφόρτωση σκέλους 1 ≠ φόρτωση σκέλους 2)
-- flows: F-20,F-13
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: orders
-- impact: Τα δύο σκέλη λένε διαφορετικό σημείο παράδοσης — ο οδηγός του 2ου σκέλους πάει σε λάθος μέρος.
-- next: 
-- exceptions: Γονείς χωρίς ακριβώς σκέλη 1 και 2.
-- tolerance: 
-- source: 04 ΝΕΟΣ Β-46 · στήλες unloading_location_1_id / loading_location_1_id / leg_no (κατάλογος 22/9)
-- enabled: yes
SELECT count(*) FROM orders a JOIN orders b ON b.parent_order_id=a.parent_order_id AND b.leg_no=2
 WHERE a.leg_no=1 AND a.parent_order_id IS NOT NULL AND a.deleted_at IS NULL AND b.deleted_at IS NULL
 AND a.status<>'Cancelled' AND b.status<>'Cancelled'
 AND a.unloading_location_1_id IS DISTINCT FROM b.loading_location_1_id;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT a.legacy_id AS x FROM orders a JOIN orders b ON b.parent_order_id=a.parent_order_id AND b.leg_no=2
 WHERE a.leg_no=1 AND a.parent_order_id IS NOT NULL AND a.deleted_at IS NULL AND b.deleted_at IS NULL
 AND a.status<>'Cancelled' AND b.status<>'Cancelled'
 AND a.unloading_location_1_id IS DISTINCT FROM b.loading_location_1_id LIMIT 50) s;
