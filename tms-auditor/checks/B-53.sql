-- id: B-53
-- title: Αναίρεση τιμολόγησης (invoiced true→false) από μη-owner (24 ώρες)
-- flows: F-30
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: 
-- impact: Ενημερωτικό: μια τιμολογημένη παραγγελία ξανάγινε ατιμολόγητη από ρόλο που δεν είναι owner (ο φραγμός Δ10 απορρίφθηκε 22/9 — μετριέται).
-- next: Ιστορικό Ενεργειών → orders/update με αλλαγή Invoiced (ανάγνωση).
-- exceptions: Ο owner αναιρεί από την καρτέλα (4801db4) — δεν μετρά.
-- tolerance: 
-- source: απόφαση owner 22/9 23:40 (Δ10 απορρίφθηκε)
-- enabled: yes
SELECT count(*) FROM audit_log WHERE table_name IN ('orders','national_orders') AND action='update' AND role<>'owner'
 AND (before_data->>'invoiced')='true' AND coalesce(after_data->>'invoiced','false')='false'
 AND created_at>now()-interval '24 hours';
