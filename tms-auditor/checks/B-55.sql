-- id: B-55
-- title: Έγγραφο παραγγελίας σε παραγγελία που έχει διαγραφεί
-- flows:
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: no
-- entity: order_documents
-- impact: Ένα σκαναρισμένο έγγραφο (CMR/τιμολόγιο/φωτογραφία) μένει συνδεδεμένο σε παραγγελία που θεωρείται διαγραμμένη (soft-delete) — κανείς δεν το βλέπει πια από την κάρτα της παραγγελίας, αλλά ούτε φεύγει (never-delete rule, migration 053).
-- next: Άνοιγμα της παραγγελίας (ή του ιστορικού της στο Audit Trail) και επιβεβαίωση αν η διαγραφή ήταν σωστή. Το έγγραφο ΔΕΝ σβήνεται ποτέ — μόνο ελέγχεται.
-- exceptions: Ο πίνακας order_documents έχει ON DELETE RESTRICT στο order_id (migration 053), άρα μια παραγγελία με έγγραφα δεν μπορεί ποτέ να γίνει hard-delete· ο μόνος τρόπος να προκύψει αυτό το εύρημα είναι soft-delete (orders.deleted_at) ΜΕΤΑ την ανέβαση του εγγράφου.
-- tolerance:
-- source: scan round 3, 28/9/2026
-- enabled: no: order_documents δεν υπάρχει ακόμη — migration 053_order_documents.sql είναι DRAFT, δεν έχει εκτελεστεί (worker/migrations/drafts/053_order_documents.sql). Ενεργοποίησε ΜΕΤΑ το 053 ΚΑΙ πρόσθεσε public.order_documents στο GRANT SELECT της 047 (tms_check_runner, γρ. ~27-32) και της 050 (tms_reader) — χωρίς αυτό ΚΑΘΕ εκτέλεση αποτυγχάνει με permission denied (catalog.test.mjs θα το πιάσει πρώτα, τοπικά).
SELECT count(*) FROM order_documents d JOIN orders o ON o.id = d.order_id WHERE d.deleted_at IS NULL AND o.deleted_at IS NOT NULL;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT d.legacy_id AS x FROM order_documents d JOIN orders o ON o.id = d.order_id WHERE d.deleted_at IS NULL AND o.deleted_at IS NOT NULL LIMIT 50) s;
