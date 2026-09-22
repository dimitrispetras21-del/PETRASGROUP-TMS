-- ΕΚΤΕΛΕΣΤΗΚΕ 22/9/2026 (owner· ΜΕΤΑ-SELECT 21:00: RT-1171 planned / closed_at NULL, closed_with_open_leg 0). Αρχικά DRAFT — ξανάνοιγμα RT-1171 (owner, μετά τις 15:00, μετά το merge του fix/rota-cands-myday).
--
-- WHY (22/9, docs/data-audit/2026-09/2026-09-22-pantelis-rota-cands.md «Μετά το merge»): στις 13:49 η MyDay (367,
-- Pending) προσαρτήθηκε ως 3ο σκέλος στο RT-1171 (361 Delivered + 364 Delivered) και το rt-feed έκλεισε το RT κρίνοντας
-- μόνο από το ζεύγος (audit_log 6473/6474). Κλειστό RT με ανοιχτό σκέλος = η 367 δεν θα κλείσει ποτέ σωστά και τα
-- έξοδά της κολλάνε. Ο κώδικας διορθώθηκε (_rtOpenLegs)· η εγγραφή θέλει χέρι. Μετρήθηκε 22/9: από 69 κλειστά RT
-- ΜΟΝΟ το RT-1171 έχει σκέλος όχι Delivered/Cancelled — μία γραμμή, όχι μαζική επισκευή.
--
-- Αναστρέψιμο: UPDATE ct_round_trips SET status='closed', closed_at=now() WHERE code='RT-1171';

BEGIN;

-- ΠΡΙΝ: πρέπει 1 γραμμή, status closed, 3 σκέλη με το 367 Pending.
SELECT r.code, r.status, r.closed_at, r.date_end,
       string_agg(l.order_id::text || ':' || o.status, ', ' ORDER BY l.seq) AS legs
FROM ct_round_trips r JOIN ct_rt_legs l ON l.rt_id=r.id JOIN orders o ON o.id=l.order_id
WHERE r.code='RT-1171' GROUP BY r.id;

UPDATE ct_round_trips
   SET status='planned', closed_at=NULL, updated_at=now()
 WHERE code='RT-1171' AND status='closed';

-- ΜΕΤΑ: 1 γραμμή, status planned, closed_at NULL· και 0 κλειστά RT με ανοιχτό σκέλος σε όλη τη βάση.
SELECT code, status, closed_at FROM ct_round_trips WHERE code='RT-1171';
SELECT count(DISTINCT r.id) AS closed_with_open_leg   -- πρέπει 0
FROM ct_round_trips r JOIN ct_rt_legs l ON l.rt_id=r.id JOIN orders o ON o.id=l.order_id
WHERE r.status IN ('closed','complete') AND o.deleted_at IS NULL
  AND o.status IS DISTINCT FROM 'Delivered' AND o.status IS DISTINCT FROM 'Cancelled';

COMMIT;
