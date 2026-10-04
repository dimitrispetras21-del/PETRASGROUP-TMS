-- id: B-65
-- title: Τοπική παράδοση/φόρτωση ασυνεπής με την παραγγελία της
-- flows: F-22,F-35
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: no
-- entity:
-- impact: Η τοπική δεν ταιριάζει πια με την παραγγελία: λάθος μέρα στο Ημερήσιο και στη μισθοδοσία του τοπικού, ή τοπική πάνω σε παραγγελία που δεν θα εκτελεστεί έτσι.
-- next: Εβδομαδιαίο Διεθνών → η παραγγελία: διόρθωσε ή σβήσε την τοπική (ανάγνωση).
-- exceptions: ids = <εγγραφή>:<λόγος>, ένας λόγος ανά τοπική με αυτή τη σειρά: parent (σβησμένη/ακυρωμένη παραγγελία) · preorder · day (μέρα ≠ μέρα πελάτη ή κενή) · same-driver (ο τοπικός = ο διεθνής) · truck-copy (το «άλλο» φορτηγό = της παραγγελίας) · vs · direction · split (η παραγγελία σπάστηκε σε σκέλη). Η βάση αρνείται τα ίδια όταν γράφεται η τοπική· εδώ φαίνονται όσα προέκυψαν από αλλαγή της παραγγελίας μετά.
-- tolerance:
-- source: σχέδιο local-relay v4 έλεγχος «B-61» → B-65 (+ pre-order, συντονιστής 4/10) · DRAFT 060 · 4/10 = 0 (καμία τοπική)
-- enabled: yes
SELECT count(*) FROM local_moves lm JOIN orders o ON o.id=lm.parent_order_id
 WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND (
 o.deleted_at IS NOT NULL OR coalesce(o.status,'')='Cancelled' OR coalesce(o.ops_status,'')='Provisional'
 OR (CASE lm.move_kind WHEN 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END) IS NULL
 OR lm.move_date <> (CASE lm.move_kind WHEN 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END)
 OR lm.driver_id = o.driver_id OR lm.truck_id = o.truck_id OR coalesce(o.veroia_switch,false)
 OR coalesce(o.direction,'') <> (CASE lm.move_kind WHEN 'relay_delivery' THEN 'Import' ELSE 'Export' END)
 OR EXISTS (SELECT 1 FROM orders l WHERE l.parent_order_id=o.id AND l.deleted_at IS NULL));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT coalesce(lm.legacy_id, lm.id::text) || ':' || CASE
 WHEN o.deleted_at IS NOT NULL OR coalesce(o.status,'')='Cancelled' THEN 'parent'
 WHEN coalesce(o.ops_status,'')='Provisional' THEN 'preorder'
 WHEN (CASE lm.move_kind WHEN 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END) IS NULL
   OR lm.move_date <> (CASE lm.move_kind WHEN 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END) THEN 'day'
 WHEN lm.driver_id = o.driver_id THEN 'same-driver'
 WHEN lm.truck_id = o.truck_id THEN 'truck-copy'
 WHEN coalesce(o.veroia_switch,false) THEN 'vs'
 WHEN coalesce(o.direction,'') <> (CASE lm.move_kind WHEN 'relay_delivery' THEN 'Import' ELSE 'Export' END) THEN 'direction'
 ELSE 'split' END AS x
 FROM local_moves lm JOIN orders o ON o.id=lm.parent_order_id
 WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND (
 o.deleted_at IS NOT NULL OR coalesce(o.status,'')='Cancelled' OR coalesce(o.ops_status,'')='Provisional'
 OR (CASE lm.move_kind WHEN 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END) IS NULL
 OR lm.move_date <> (CASE lm.move_kind WHEN 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END)
 OR lm.driver_id = o.driver_id OR lm.truck_id = o.truck_id OR coalesce(o.veroia_switch,false)
 OR coalesce(o.direction,'') <> (CASE lm.move_kind WHEN 'relay_delivery' THEN 'Import' ELSE 'Export' END)
 OR EXISTS (SELECT 1 FROM orders l WHERE l.parent_order_id=o.id AND l.deleted_at IS NULL)) LIMIT 50) s;
