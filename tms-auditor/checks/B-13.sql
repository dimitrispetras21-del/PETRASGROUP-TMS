-- id: B-13
-- title: Παραδομένες χωρίς τιμή > 3 ημέρες
-- flows: F-30,F-26
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: yes
-- entity: 
-- impact: 
-- next: 
-- exceptions: Σκέλη split· VS εθνικό σκέλος.
-- tolerance: 
-- source: 02b Β-13 · 22/9 = 24 (ουρά dispatcher)
-- enabled: yes
SELECT count(*) FROM orders WHERE deleted_at IS NULL AND status='Delivered' AND coalesce(price,0)<=0 AND parent_order_id IS NULL
 AND coalesce(actual_delivery_date,delivery_datetime) < current_date-3;
