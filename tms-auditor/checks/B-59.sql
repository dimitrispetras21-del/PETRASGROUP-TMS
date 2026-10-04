-- id: B-59
-- title: Εθνικό φορτίο με όχημα χωρίς γύρο (RT) — από 5/10
-- flows: F-23,F-14,F-35
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: national_loads
-- impact: Ο οδηγός του εθνικού δεν πληρώνεται αυτόματα και τα έξοδα του φορτηγού δεν προσγειώνονται σε κανένα γύρο.
-- next: Μισθοδοσία → υπάρχει χειροκίνητη γραμμή «trip» για το φορτίο; (ανάγνωση)
-- exceptions: Μέχρι να τρέξει το 034 (απόφαση owner §8.1) ΚΑΘΕ ανατεθειμένο εθνικό από 5/10 μετρά — αναμενόμενο κόκκινο, τα ids = οι γραμμές «trip» που περνά χειροκίνητα ο Θοδωρής. Με το 034 + backfill από 5/10 πρασινίζει μόνο του. Φορτία με παράδοση πριν 5/10 εκτός (14 ιστορικά).
-- tolerance: 
-- source: έκθεση εθνικών 5/10 §4 έλεγχος 1 (WN-02/SA-2/N-12) · DRAFT 058 · 4/10 = 0 (14 χωρίς τομή 5/10)
-- enabled: yes
SELECT count(*) FROM national_loads nl WHERE nl.deleted_at IS NULL AND coalesce(nl.status,'')<>'Cancelled'
 AND (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
 AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date, (nl.loading_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05'
 AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.nat_load_id=nl.id AND r.status<>'cancelled');
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT nl.legacy_id AS x FROM national_loads nl WHERE nl.deleted_at IS NULL AND coalesce(nl.status,'')<>'Cancelled'
 AND (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
 AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date, (nl.loading_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05'
 AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.nat_load_id=nl.id AND r.status<>'cancelled') LIMIT 50) s;
