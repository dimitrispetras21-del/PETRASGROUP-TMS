-- id: B-31
-- title: VS επόμενων 3 ημερών χωρίς ράμπα (07:00)
-- flows: F-28
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: yes
-- entity: 
-- impact: 
-- next: 
-- exceptions: Αναμενόμενο > 0 πριν ανοίξει κανείς τη Ράμπα (autosync μόνο στο render).
-- tolerance: 
-- source: 02b Β-31 · 22/9 = 2
-- enabled: yes
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.veroia_switch AND o.status NOT IN ('Cancelled','Delivered')
 AND o.cross_dock_date BETWEEN current_date-1 AND current_date+3
 AND NOT EXISTS (SELECT 1 FROM ramp r WHERE r.deleted_at IS NULL AND (r.order_id=o.id OR r.national_load_id IN (SELECT id FROM national_loads WHERE source_order_id=o.id AND deleted_at IS NULL)));
