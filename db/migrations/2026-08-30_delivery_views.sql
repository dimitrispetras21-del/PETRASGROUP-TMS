-- Τρία views επίδοσης παράδοσης — οδηγός · πελάτης · συνεργάτης
-- Έγκριση owner στη συνομιλία 30/8/2026: «φτιάξε τα τρία views».
-- ============================================================================
-- ΓΙΑΤΙ VIEW ΚΑΙ ΟΧΙ ΣΤΗΛΗ `drivers.performance`
-- Ένα ποσοστό είναι ΠΑΡΑΓΩΓΟ των παραγγελιών. Μια στήλη είναι αντίγραφο, και
-- τα αντίγραφα αποκλίνουν — όχι *αν*, πότε (αρχή 3). Θα χρειαζόταν trigger για
-- να μένει σωστή, δηλαδή όλο το ρίσκο απόκλισης χωρίς κανένα κέρδος έναντι
-- του view. Και ένας σκέτος αριθμός `100` δεν λέει «από 3» ή «από 300» — ενώ
-- εδώ 15 παραγγελίες δεν αποδίδονται σε κανέναν και πρέπει να φαίνονται.
--
-- ΓΙΑΤΙ ΣΤΗ ΒΑΣΗ ΚΑΙ ΟΧΙ ΣΤΟ FRONTEND (αρχή 4)
-- Ο ορισμός ζει σε ΕΝΑ σημείο. Καρτέλα, dashboard, μελλοντική αναφορά και
-- export παίρνουν τον ίδιο αριθμό. Σήμερα ο υπολογισμός είναι στο
-- core/entity.js (_ecOnTime)· μόλις εκτεθούν τα views, εκείνος γίνεται
-- ανάγνωση πεδίου και ο ορισμός μετακομίζει εδώ.
--
-- Ο ΟΡΙΣΜΟΣ (owner 30/8, DECISION_LOG)
-- «Στην ώρα του» = ο dispatcher σήμανε «Παραδόθηκε». Το «Delay» γράφει
-- 'Delayed'.
-- ⛔ ΠΟΤΕ από ημερομηνίες: το actual_delivery_date καταγράφει ΠΟΤΕ ΠΑΤΗΘΗΚΕ ΤΟ
-- ΚΟΥΜΠΙ, όχι πότε παραδόθηκε το φορτίο — η ομάδα δουλεύει 05:30-14:30, οπότε
-- παράδοση Κυριακής σημαίνεται τη Δευτέρα. 51 από 89 έχουν actual > planned
-- και ΚΑΜΙΑ δεν είναι αργοπορία.
--
-- ⚠️ ΜΟΝΟ `orders`. Το `national_loads` ΔΕΝ έχει στήλη delivery_performance
-- (επαληθεύτηκε 30/8) — οι εθνικές μεταφορές δεν κρίνονται καθόλου. Οδηγός που
-- κάνει μόνο εθνικά ΔΕΝ θα εμφανιστεί εδώ, και η καρτέλα του θα δείχνει «—».
-- Αυτό είναι σωστό (κανόνας #3: άγνωστο ≠ μηδέν) αλλά ΔΕΝ είναι προφανές.
--
-- pct = NULL όταν judged = 0. ΜΗΝ το κάνεις 0: «κανείς δεν έκρινε» δεν είναι
-- «απέτυχε σε όλα».

BEGIN;

-- security_invoker: το view τρέχει με τα δικαιώματα ΤΟΥ ΚΑΛΟΥΝΤΟΣ, όχι του
-- ιδιοκτήτη. Χωρίς αυτό ένα view παρακάμπτει το RLS του βασικού πίνακα και
-- γίνεται πίσω πόρτα. Ό,τι γεννιέται, γεννιέται κλειστό (αρχή 5).

CREATE OR REPLACE VIEW v_driver_delivery WITH (security_invoker = true) AS
SELECT
  o.driver_id,
  count(*)                                                                    AS total,
  count(*) FILTER (WHERE o.delivery_performance IN ('On Time','Delayed'))      AS judged,
  count(*) FILTER (WHERE o.delivery_performance = 'On Time')                   AS on_time,
  count(*) FILTER (WHERE o.delivery_performance = 'Delayed')                   AS delayed,
  count(*) FILTER (WHERE o.delivery_performance IS NULL
                      OR o.delivery_performance NOT IN ('On Time','Delayed'))  AS unjudged,
  CASE WHEN count(*) FILTER (WHERE o.delivery_performance IN ('On Time','Delayed')) = 0
       THEN NULL
       ELSE round(100.0 * count(*) FILTER (WHERE o.delivery_performance = 'On Time')
                        / count(*) FILTER (WHERE o.delivery_performance IN ('On Time','Delayed')))
  END                                                                          AS pct
FROM orders o
WHERE o.deleted_at IS NULL AND o.driver_id IS NOT NULL
GROUP BY o.driver_id;

CREATE OR REPLACE VIEW v_client_delivery WITH (security_invoker = true) AS
SELECT
  o.client_id,
  count(*)                                                                    AS total,
  count(*) FILTER (WHERE o.delivery_performance IN ('On Time','Delayed'))      AS judged,
  count(*) FILTER (WHERE o.delivery_performance = 'On Time')                   AS on_time,
  count(*) FILTER (WHERE o.delivery_performance = 'Delayed')                   AS delayed,
  count(*) FILTER (WHERE o.delivery_performance IS NULL
                      OR o.delivery_performance NOT IN ('On Time','Delayed'))  AS unjudged,
  -- Τζίρος πελάτη = τι μας έδωσε. Η τιμή πώλησης είναι ορατή μέχρι τη φάση
  -- P&L (κλείδωμα owner 23/8) — δεν είναι περιθώριο ούτε κέρδος.
  coalesce(sum(o.price), 0)                                                    AS revenue,
  CASE WHEN count(*) FILTER (WHERE o.delivery_performance IN ('On Time','Delayed')) = 0
       THEN NULL
       ELSE round(100.0 * count(*) FILTER (WHERE o.delivery_performance = 'On Time')
                        / count(*) FILTER (WHERE o.delivery_performance IN ('On Time','Delayed')))
  END                                                                          AS pct
FROM orders o
WHERE o.deleted_at IS NULL AND o.client_id IS NOT NULL
GROUP BY o.client_id;

CREATE OR REPLACE VIEW v_partner_delivery WITH (security_invoker = true) AS
SELECT
  o.partner_id,
  count(*)                                                                    AS total,
  count(*) FILTER (WHERE o.delivery_performance IN ('On Time','Delayed'))      AS judged,
  count(*) FILTER (WHERE o.delivery_performance = 'On Time')                   AS on_time,
  count(*) FILTER (WHERE o.delivery_performance = 'Delayed')                   AS delayed,
  count(*) FILTER (WHERE o.delivery_performance IS NULL
                      OR o.delivery_performance NOT IN ('On Time','Delayed'))  AS unjudged,
  -- Τζίρος συνεργάτη = τι ΤΟΥ πληρώσαμε. Αντίθετη φορά από τον πελάτη.
  coalesce(sum(o.partner_rate), 0)                                             AS paid,
  CASE WHEN count(*) FILTER (WHERE o.delivery_performance IN ('On Time','Delayed')) = 0
       THEN NULL
       ELSE round(100.0 * count(*) FILTER (WHERE o.delivery_performance = 'On Time')
                        / count(*) FILTER (WHERE o.delivery_performance IN ('On Time','Delayed')))
  END                                                                          AS pct
FROM orders o
WHERE o.deleted_at IS NULL AND o.partner_id IS NOT NULL
GROUP BY o.partner_id;

-- Η Supabase δίνει ΑΥΤΟΜΑΤΑ πρόσβαση στον `anon` σε κάθε νέο αντικείμενο.
-- Κανείς δεν το αποφασίζει — απλώς συμβαίνει (αρχή 5). Ο Worker μιλάει με
-- service_role, που δεν επηρεάζεται από τα παρακάτω.
REVOKE ALL ON v_driver_delivery,  v_client_delivery,  v_partner_delivery FROM anon;
REVOKE ALL ON v_driver_delivery,  v_client_delivery,  v_partner_delivery FROM authenticated;

COMMIT;

-- ── ΕΠΑΛΗΘΕΥΣΗ — τρέξε ΜΕΤΑ το COMMIT και σύγκρινε ──────────────────────────
-- Αναμενόμενο (μετρημένο 30/8 ΠΡΙΝ τη δημιουργία, με σκέτο SELECT):
--   οδηγοί      19 γραμμές · 54 κριμένα ·  4 άκριτα · κανένας με pct NULL
--   πελάτες     20 γραμμές · 89 κριμένα · 10 άκριτα
--   συνεργάτες   8 γραμμές · 20 κριμένα ·  0 άκριτα
-- Απόκλιση = κάτι πάει στραβά στο view. ΜΗΝ το αγνοήσεις.
--
-- SELECT 'οδηγοί' AS ομάδα, count(*) AS γραμμές, sum(judged) AS κριμένα,
--        sum(unjudged) AS άκριτα, count(*) FILTER (WHERE pct IS NULL) AS χωρίς_pct
--   FROM v_driver_delivery
-- UNION ALL SELECT 'πελάτες',    count(*), sum(judged), sum(unjudged), count(*) FILTER (WHERE pct IS NULL) FROM v_client_delivery
-- UNION ALL SELECT 'συνεργάτες', count(*), sum(judged), sum(unjudged), count(*) FILTER (WHERE pct IS NULL) FROM v_partner_delivery;
