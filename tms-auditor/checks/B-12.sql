-- id: B-12
-- title: Τιμολογημένη χωρίς τιμή
-- flows: F-30
-- severity: P1
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: orders
-- impact: Τιμολόγιο ΤΠΥ χωρίς ποσό — ο 043 έπρεπε να το εμποδίσει.
-- next: 
-- exceptions: 
-- tolerance: 
-- source: 02b Β-12 · 22/9 = 0
-- enabled: yes
SELECT count(*) FROM orders WHERE deleted_at IS NULL AND invoiced AND coalesce(price,0)<=0;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT legacy_id AS x FROM orders WHERE deleted_at IS NULL AND invoiced AND coalesce(price,0)<=0 LIMIT 50) s;
