-- id: B-85
-- title: Μεικτές θερμοκρασίες (>= 2 °C) στην ίδια πλευρά κύκλου
-- flows: F-23
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: ct_round_trips
-- impact: Φορτία με διαφορετική θερμοκρασία στο ίδιο ψυγείο: ενημέρωση, όχι άρνηση (η plan_* δίνει ήδη την προειδοποίηση mixed_temp).
-- next: Dispatcher: έλεγχος θερμοκρασιών στη σειρά του κύκλου.
-- exceptions: Ζωντανές κινήσεις, κύκλος όχι ακυρωμένος, ανά (κύκλος, πλευρά).
-- tolerance: 2 °C
-- source: DRAFT 073b (plan F3, spec 8) · PGlite 26/10 (072 + 072b + 073): 0 on the production copy, red in the scenario of plan-073b.test.mjs
-- enabled: yes
SELECT count(*) FROM (SELECT l.rt_id, s.side FROM piece_legs l JOIN rt_stops s ON s.id = l.pickup_stop_id
 JOIN shipment_pieces p ON p.id = l.piece_id JOIN v_shipments v ON v.shipment_id = p.shipment_id JOIN ct_round_trips r ON r.id = l.rt_id
 WHERE l.deleted_at IS NULL AND r.status <> 'cancelled' AND v.temperature_c IS NOT NULL
 GROUP BY l.rt_id, s.side HAVING max(v.temperature_c) - min(v.temperature_c) >= 2) z;
