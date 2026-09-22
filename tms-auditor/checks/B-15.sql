-- id: B-15
-- title: Παραδομένες ατιμολόγητες > 30 ημέρες
-- flows: F-30
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: yes
-- entity: 
-- impact: 
-- next: 
-- exceptions: 
-- tolerance: 
-- source: 02b Β-15 · 22/9 = 58
-- enabled: yes
SELECT count(*) FROM orders WHERE deleted_at IS NULL AND status='Delivered' AND invoiced IS NOT TRUE AND parent_order_id IS NULL
 AND coalesce(actual_delivery_date,delivery_datetime) < current_date-30;
