-- id: B-30
-- title: Ράμπα χωρίς δεσμό / δεσμός σε διαγραμμένο
-- flows: F-28,F-29
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: 
-- impact: 
-- next: 
-- exceptions: 44 παλιές πριν 6/9 (το created_at τις κόβει).
-- tolerance: 
-- source: 02b Β-30 · 22/9 = 0+0
-- enabled: yes
SELECT (SELECT count(*) FROM ramp WHERE created_at>now()-interval '7 days' AND deleted_at IS NULL AND order_id IS NULL AND national_load_id IS NULL AND national_order_id IS NULL)
     + (SELECT count(*) FROM ramp r LEFT JOIN orders o ON o.id=r.order_id LEFT JOIN national_loads nl ON nl.id=r.national_load_id
        WHERE r.deleted_at IS NULL AND ((r.order_id IS NOT NULL AND o.deleted_at IS NOT NULL) OR (r.national_load_id IS NOT NULL AND nl.deleted_at IS NOT NULL)));
