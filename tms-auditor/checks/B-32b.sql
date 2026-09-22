-- id: B-32b
-- title: Ενεργές παραγγελίες σε ανενεργό όχημα/οδηγό
-- flows: F-14,F-37
-- severity: P3
-- schedule: weekly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: 
-- impact: 
-- next: 
-- exceptions: 
-- tolerance: 
-- source: 02b Β-32 · 22/9 = 0
-- enabled: yes
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status NOT IN ('Cancelled','Delivered')
 AND (EXISTS (SELECT 1 FROM trucks t WHERE t.id=o.truck_id AND (t.deleted_at IS NOT NULL OR t.active IS FALSE))
   OR EXISTS (SELECT 1 FROM drivers d WHERE d.id=o.driver_id AND (d.deleted_at IS NOT NULL OR d.active IS FALSE)));
