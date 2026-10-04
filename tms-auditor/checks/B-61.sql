-- id: B-61
-- title: VS εθνικό σκέλος «Delivered» χωρίς εκτελεστή — από 5/10
-- flows: F-10,F-23,F-26
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: national_loads
-- impact: Το VS σκέλος έκλεισε αυτόματα με τη διεθνή χωρίς φορτηγό/συνεργάτη: μένει για πάντα «ΠΡΟΣ ΑΝΑΘΕΣΗ», δεν δέχεται ανάθεση και κανείς δεν ξέρει ποιος το εκτέλεσε (μισθοδοσία, RT).
-- next: Εβδομαδιαίο Εθνικών → το σκέλος· ρώτα τον Σωτήρη ποιο φορτηγό το έκανε (ανάγνωση — η ανάθεση σε κλειστό σκέλος περιμένει την απόφαση §8.2).
-- exceptions: Σκέλη με παράδοση πριν 5/10 εκτός (40 από 45 παραδομένα VS, «μένουν ως έχουν» §8.2). Μόνο source_type='Direct' (VS).
-- tolerance: 
-- source: έκθεση εθνικών 5/10 §4 έλεγχος 3 (SA-1/WN-04) · DRAFT 058 · 4/10 = 0 (40 χωρίς τομή 5/10)
-- enabled: yes
SELECT count(*) FROM national_loads nl WHERE nl.deleted_at IS NULL AND nl.source_type='Direct' AND nl.status='Delivered'
 AND NOT (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
 AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05';
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT nl.legacy_id AS x FROM national_loads nl WHERE nl.deleted_at IS NULL AND nl.source_type='Direct' AND nl.status='Delivered'
 AND NOT (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
 AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05' LIMIT 50) s;
