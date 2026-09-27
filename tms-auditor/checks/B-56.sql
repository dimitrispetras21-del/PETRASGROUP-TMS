-- id: B-56
-- title: Πρόσφατη παραγγελία χωρίς κανένα έγγραφο (προσέγγιση — δεν ξεχωρίζει σάρωση)
-- flows:
-- severity: P4
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: orders
-- impact:
-- next:
-- exceptions: Η αρχική πρόθεση (owner brief, scan round 3) ήταν «παραγγελίες που δημιουργήθηκαν ΑΠΟ σάρωση χωρίς κανένα έγγραφο» — π.χ. το /docs/upload απέτυχε ΜΕΤΑ την επιτυχή δημιουργία της παραγγελίας (core/order-docs.js handleOrderSaved· το banner «Ξαναδοκίμασε» που ακολουθεί ΔΕΝ αναγκάζει τον χρήστη να ολοκληρώσει πριν φύγει από τη σελίδα — _showUploadFailedBanner, ίδιο αρχείο). ΔΕΝ υπάρχει όμως καμία στήλη στα orders, ούτε ένδειξη στο audit_log, που να καταγράφει ΟΤΙ μια συγκεκριμένη παραγγελία δημιουργήθηκε από σάρωση (επιβεβαιώθηκε στο TABLES.tblgHlNmLBH3JTdIM/orders του Worker και στο core/order-docs.js: η ΜΟΝΗ γνώση «αυτό ήρθε από σάρωση» ζει στιγμιαία στο window._scanPendingDoc του browser και ΠΟΤΕ δεν γράφεται στη βάση — μόλις ανέβει το έγγραφο, το μόνο ίχνος που μένει είναι order_documents.source='scan', πράγμα άχρηστο για να εντοπίσεις ΑΚΡΙΒΩΣ τις περιπτώσεις που ΔΕΝ ανέβηκε τίποτα). Χωρίς αυτόν τον δείκτη, ένα SQL πάνω στα orders δεν μπορεί να ξεχωρίσει «παραγγελία από σάρωση που έχασε το έγγραφό της» από «χειροκίνητη παραγγελία που ποτέ δεν χρειάστηκε έγγραφο» — οι δεύτερες είναι η μεγάλη πλειοψηφία σήμερα, άρα ένας red-έλεγχος θα ήταν μόνιμα ενεργός χωρίς κανένα πραγματικό σήμα. Το SQL παρακάτω μετρά την ΠΛΗΣΙΕΣΤΕΡΗ διαθέσιμη προσέγγιση — παραγγελίες των τελευταίων 24 ωρών χωρίς ΚΑΝΕΝΑ order_documents row (σάρωση Ή χειροκίνητη μεταφόρτωση) — και μένει queue (is_queue, ΠΟΤΕ κόκκινο) ακριβώς επειδή δεν ξεχωρίζει σάρωση από χειροκίνητη δημιουργία. Θα γίνει πραγματικός (red) έλεγχος μόνο αν τα orders αποκτήσουν στήλη προέλευσης (π.χ. created_via/scan marker) ή ο Worker αρχίσει να γράφει στο audit_log μια ένδειξη σάρωσης στο ίδιο create.
-- tolerance:
-- source: scan round 3, 28/9/2026 — GAP τεκμηριωμένο στο exceptions
-- enabled: no: (α) order_documents δεν υπάρχει ακόμη — migration 053 είναι DRAFT (δεν έχει εκτελεστεί)· (β) καμία στήλη στα orders/κανένα audit_log δεν καταγράφει προέλευση σάρωσης, άρα ο έλεγχος είναι μόνο προσέγγιση (βλ. exceptions). Ενεργοποίησε ΜΕΤΑ το 053, ΜΟΝΟ ως queue (ποτέ red — μην αλλάξεις is_queue/red χωρίς να λυθεί πρώτα το κενό), και πρόσθεσε public.orders/public.order_documents στο GRANT SELECT της 047/050 αν δεν υπάρχουν ήδη (τα orders είναι ήδη στη λίστα· το order_documents όχι).
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.created_at > now() - interval '24 hours'
 AND NOT EXISTS (SELECT 1 FROM order_documents d WHERE d.order_id = o.id AND d.deleted_at IS NULL);
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL AND o.created_at > now() - interval '24 hours'
 AND NOT EXISTS (SELECT 1 FROM order_documents d WHERE d.order_id = o.id AND d.deleted_at IS NULL) LIMIT 50) s;
