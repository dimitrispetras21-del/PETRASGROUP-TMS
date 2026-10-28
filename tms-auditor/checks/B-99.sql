-- id: B-99
-- title: «Μέσω Βέροιας» σε στάση που δεν είναι εθνική πλευρά ζωντανής VS
-- flows: F-10
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: no
-- entity: order_stops
-- impact: Το order_stops.via_hub το γράφει μόνο η βάση (074, Q-6)· αληθές σε παραγγελία που δεν είναι VS, σβησμένη, ή σε στάση που δεν είναι εθνική πλευρά σημαίνει ότι κάτι το έγραψε παρακάμπτοντας τη γέφυρα.
-- next: Owner: ποια διαδρομή το έγραψε (το label «Via Hub» του facade μένει κλειστό για εγγραφή).
-- exceptions: Φρουρός του ανοιχτού (3) της κριτικής 26/10 (αρχή 1). Πριν από το L: 0 (via_hub false παντού).
-- tolerance:
-- source: DRAFT 074b (plan F5 Task C) · PGlite 28/10: 0 on the production copy, red in the scenario of plan-074.test.mjs
-- enabled: yes
SELECT count(*) FROM order_stops s JOIN orders o ON o.id = s.order_id WHERE s.via_hub AND (o.veroia_switch IS NOT TRUE OR o.deleted_at IS NOT NULL OR NOT coalesce((o.direction = 'Import' AND s.stop_type = 'Unloading') OR (o.direction = 'Export' AND s.stop_type = 'Loading'), false));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT coalesce(s.legacy_id, s.id::text) AS x FROM order_stops s JOIN orders o ON o.id = s.order_id WHERE s.via_hub AND (o.veroia_switch IS NOT TRUE OR o.deleted_at IS NOT NULL OR NOT coalesce((o.direction = 'Import' AND s.stop_type = 'Unloading') OR (o.direction = 'Export' AND s.stop_type = 'Loading'), false)) ORDER BY 1 LIMIT 50) s;
