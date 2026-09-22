-- 044 — DRAFT (ΔΕΝ ΕΚΤΕΛΕΣΤΗΚΕ) — «Προσωρινή» παραγγελία: οι επιτρεπτές τιμές του orders.ops_status
--        μπαίνουν στη βάση (αρχή 4: ο κανόνας όσο πιο χαμηλά αντέχει). Πρόταση session Παντελής 22/9,
--        docs/data-audit/2026-09/2026-09-22-pantelis-preorder.md §(δ). Τρέχει ο owner, μετά τις 15:00,
--        ΜΟΝΟ αφού εγκριθεί το θέμα 2 (4 αποφάσεις) — μέχρι τότε η στήλη μένει όπως είναι.
--
-- WHY (μετρήθηκε 22/9): ops_status = NULL σε 192/192, καμία οθόνη δεν το γράφει (WP-7 audit 8/2026),
-- ο Worker το χαρτογραφεί («Ops Status», index.js:1192). Χωρίς CHECK, μια λάθος γραφή ('Provisional ',
-- 'προσωρινή') θα περνούσε σιωπηλά (μηχανισμός-παγίδα 1) και η κάρτα του Weekly δεν θα την έδειχνε.
-- Μία τιμή σήμερα: 'Provisional'. Νέα τιμή = νέα migration, όχι επεξεργασία του CHECK με το χέρι.
--
-- Αναστρέψιμο: ALTER TABLE orders DROP CONSTRAINT orders_ops_status_values;

BEGIN;

-- ΠΡΙΝ: πρέπει 0 — αν όχι, ΣΤΑΜΑΤΑ (υπάρχει τιμή που κανείς δεν γνωρίζει).
SELECT count(*) AS unexpected_values FROM orders
 WHERE ops_status IS NOT NULL AND ops_status <> 'Provisional';

ALTER TABLE orders
  ADD CONSTRAINT orders_ops_status_values
  CHECK (ops_status IS NULL OR ops_status IN ('Provisional'));

-- ΜΕΤΑ: ο περιορισμός υπάρχει και είναι έγκυρος (convalidated = true).
SELECT conname, convalidated FROM pg_constraint
 WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_ops_status_values';

COMMIT;
