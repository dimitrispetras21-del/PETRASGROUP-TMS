-- id: B-61
-- title: VS εθνικό σκέλος με παράδοση που πέρασε, χωρίς εκτελεστή — από 5/10
-- flows: F-10,F-23
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity: national_loads
-- impact: Το VS σκέλος εκτελέστηκε (η ώρα παράδοσης πέρασε) χωρίς φορτηγό/συνεργάτη στο TMS: μένει «ΠΡΟΣ ΑΝΑΘΕΣΗ» και κανείς δεν ξέρει ποιος το έκανε (μισθοδοσία, RT).
-- next: Εβδομαδιαίο Εθνικών → το σκέλος· ρώτα τον Σωτήρη ποιο φορτηγό το έκανε και ανάθεσέ το (ανάγνωση από τον ελεγκτή).
-- exceptions: Ανεξάρτητα από status: τα εθνικά ΔΕΝ παίρνουν πια «Delivered» (owner 4/10) — εκτελεσμένο = η ώρα παράδοσης πέρασε. Σκέλη με παράδοση πριν 5/10 εκτός (40 ιστορικά χωρίς εκτελεστή, μένουν ως έχουν). Μόνο source_type='Direct' (VS)· Cancelled εκτός.
-- tolerance:
-- source: έκθεση εθνικών 5/10 §4 έλεγχος 3 (SA-1/WN-04) + απόφαση owner 4/10 «δεν θελουμε παραδοσεις για το εθνικων» · DRAFT 058 · 4/10 = 0 (40 χωρίς τομή 5/10)
-- enabled: yes
SELECT count(*) FROM national_loads nl WHERE nl.deleted_at IS NULL AND nl.source_type='Direct' AND coalesce(nl.status,'')<>'Cancelled'
 AND NOT (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
 AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05'
 AND coalesce(nl.delivery_datetime < now(), nl.actual_delivery_date < (now() AT TIME ZONE 'Europe/Athens')::date);
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT nl.legacy_id AS x FROM national_loads nl WHERE nl.deleted_at IS NULL AND nl.source_type='Direct' AND coalesce(nl.status,'')<>'Cancelled'
 AND NOT (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
 AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05'
 AND coalesce(nl.delivery_datetime < now(), nl.actual_delivery_date < (now() AT TIME ZONE 'Europe/Athens')::date) LIMIT 50) s;
