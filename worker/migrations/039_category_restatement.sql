-- 039 — category 'restatement' («Έξοδα αναμόρφωσης») on ct_cost_lines
--        (owner 21/9/2026, Alexia's request 1 — a CATEGORY, not a flag; the
--        19/9 flag proposal was rejected by the owner).
--
-- ΕΓΚΕΚΡΙΜΕΝΗ 21/9 (owner μέσω συντονιστή) — ΔΕΝ ΕΧΕΙ ΤΡΕΞΕΙ. Εκτελεί ΜΟΝΟ ο
-- owner, μετά τις 15:00. Σειρά w11: Worker deploy → 038 → 039 → 040 → 041 →
-- 042 → push. Ο Worker (CT_CATEGORIES) και η οθόνη (EX_CATEGORIES,
-- CT_CATEGORY_LABELS) γνωρίζουν την τιμή από το ίδιο commit· χωρίς αυτή τη
-- migration ο Worker δέχεται 'restatement' και η βάση την απορρίπτει με
-- check_violation → 500 «Insert failed» (ακούγεται, δεν γράφεται λάθος).
--
-- WHY: an expense without a valid document (parking with no receipt, a
-- Bulgarian inspection paid by hand — see the trip frame of 21/9: «ΠΑΡΚΙΝΓΚ-
-- ΧΩΡΙΣ ΑΠΟΔΕΙΞΗ 4,83», «ΒΟΥΛΓΑΡΙΑ ΧΩΡΙΣ ΑΠΟΔΕΙΞΗ-ΚΤΕΟ 76,69») is restated
-- for tax. It counts in the trip total like any line; the screens show it
-- inside «Λοιπά» with its own sub-total («X αναμ.», «εκ των οποίων
-- αναμόρφωση»). Trade-off, accepted by the owner: one value per line, so a
-- toll without a receipt is filed as «Αναμόρφωση», not as «Διόδια».
-- Payment stays mandatory (040) — the screen defaults it to CASH.

begin;
alter table ct_cost_lines drop constraint if exists ct_cost_lines_category_check;
alter table ct_cost_lines add constraint ct_cost_lines_category_check
  check (category = any (array['fuel','reefer_fuel','tolls','dkv','adblue','spedition','accommodation','ferry_train','fines','partner_rate','fixed_alloc','other','restatement']));
commit;

-- ═══ ΜΕΤΑ ═══
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'ct_cost_lines_category_check';   -- περιέχει 'restatement'
-- select count(*) from ct_cost_lines where category = 'restatement';   -- 0 την ημέρα του run· αυξάνεται με τις καταχωρήσεις της Αλεξίας
