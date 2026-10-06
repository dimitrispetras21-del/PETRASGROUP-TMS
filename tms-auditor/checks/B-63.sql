-- id: B-63
-- title: Τοπική παράδοση/φόρτωση χωρίς τοπικό οδηγό (σήμερα, αύριο ή εκπρόθεσμη)
-- flows: F-22,F-35
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity: local_moves
-- impact: Η παραγγελία δηλώθηκε «με τοπικό οδηγό» αλλά κανείς δεν ορίστηκε: στις 05:30 το Ημερήσιο δείχνει «ΤΟΠ. ΠΡΟΣ ΑΝΑΘΕΣΗ» και η παράδοση/φόρτωση δεν έχει εκτελεστή.
-- next: Εβδομαδιαίο Διεθνών → η παραγγελία → «…με τοπικό οδηγό»: ποιος την κάνει; (ανάγνωση)
-- exceptions: Μετρά μόνο τοπικές με παραγγελία (relay_delivery/relay_loading) με μέρα έως αύριο (Αθήνα) ή εκπρόθεσμες. Παραγγελία ήδη Delivered (ή In Transit για τοπική φόρτωση) εκτός: η δουλειά έγινε. Οι απλές τοπικές κινήσεις του Εβδομαδιαίου Εθνικών (move_kind='local') εκτός.
-- tolerance:
-- source: σχέδιο local-relay v4 έλεγχος «B-60» → B-63 (συντονιστής 4/10) · DRAFT 060 · 4/10 = 0 (καμία τοπική)
-- enabled: yes
SELECT count(*) FROM local_moves lm JOIN orders o ON o.id=lm.parent_order_id
 WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND lm.driver_id IS NULL
 AND lm.move_date <= (now() AT TIME ZONE 'Europe/Athens')::date + 1
 AND NOT (coalesce(o.status,'')='Delivered' OR (lm.move_kind='relay_loading' AND coalesce(o.status,'')='In Transit'));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT coalesce(lm.legacy_id, lm.id::text) AS x FROM local_moves lm JOIN orders o ON o.id=lm.parent_order_id
 WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND lm.driver_id IS NULL
 AND lm.move_date <= (now() AT TIME ZONE 'Europe/Athens')::date + 1
 AND NOT (coalesce(o.status,'')='Delivered' OR (lm.move_kind='relay_loading' AND coalesce(o.status,'')='In Transit')) LIMIT 50) s;
