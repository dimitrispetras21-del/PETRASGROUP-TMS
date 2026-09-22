-- id: B-16
-- title: Πύλη παλετών: παραδομένες μπλοκαρισμένες
-- flows: F-30,F-31,F-32
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: yes
-- entity: 
-- impact: 
-- next: 
-- exceptions: Κλειδωμένο «ΠΟΤΕ cutoff» (25/8).
-- tolerance: 
-- source: 02b Β-16 · 22/9 = 63
-- enabled: yes
SELECT count(*) FROM pl_v_order_gate g JOIN orders o ON o.id=g.order_id
 WHERE NOT g.sheets_ok AND o.deleted_at IS NULL AND o.status='Delivered' AND o.invoiced IS NOT TRUE AND coalesce(o.pallet_exchange,false);
