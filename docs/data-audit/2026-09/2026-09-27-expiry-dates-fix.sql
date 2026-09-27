-- 2026-09-27 · Διόρθωση ημερομηνιών λήξης στόλου (παρατήρηση Θοδωρή)
-- DRAFT — ΕΚΤΕΛΕΙΤΑΙ ΜΟΝΟ ΜΕ ΡΗΤΟ «ΝΑΙ» ΤΟΥ OWNER.
--
-- Πηγή αλήθειας = το ΕΓΓΡΑΦΟ στο Drive (ΚΤΕΟ / πράσινη κάρτα / συμβόλαιο),
-- όχι το φύλλο «ΗΜΕΡΟΜΗΝΙΕΣ ΛΗΞΗΣ pro», που έχει ανάμεικτη πληκτρολόγηση
-- ημέρα/μήνα (βλ. COMPLIANCE-AUDIT-2026-08-06.md). Αναφορά:
-- docs/data-audit/2026-09/2026-09-27-expiry-dates-check.md
--
-- Κάθε UPDATE φρουρείται με την ΤΡΕΧΟΥΣΑ τιμή: αν κάποιος την άλλαξε στο
-- μεταξύ, η γραμμή δεν αγγίζεται και το τελικό SELECT το δείχνει (ok=false).

BEGIN;

-- ── ΦΟΡΤΗΓΑ ──────────────────────────────────────────────────────────────
-- IAB2106 ΚΕΚ: ΑΝΤΕΣΤΡΑΜΜΕΝΗ. «ΚΤΕΟ 11-11-2026.pdf»: «ΚΕΚ μέχρι 11/05/2026».
UPDATE trucks SET kek_expiry = '2026-05-11' WHERE id = 14 AND license_plate = 'IAB2106' AND kek_expiry = '2026-11-05';
-- IAZ7245 ΚΕΚ: είχε μπει η ημερομηνία ΚΤΕΟ. «ΚΤΕΟ 4-12-2026.pdf»: «ΚΕΚ μέχρι 04/06/2026».
UPDATE trucks SET kek_expiry = '2026-06-04' WHERE id = 5  AND license_plate = 'IAZ7245' AND kek_expiry = '2026-12-04';
-- CB4612PE ΚΤΕΟ+ΚΕΚ: νέο «ΚΤΕΟ 5-9-2027.pdf» (ανέβηκε 25/9): 05.09.2026 → 05.09.2027.
UPDATE trucks SET kteo_expiry = '2027-09-05', kek_expiry = '2027-09-05'
 WHERE id = 23 AND license_plate = 'CB4612PE' AND kteo_expiry = '2026-08-28' AND kek_expiry = '2026-08-28';

-- ── ΡΥΜΟΥΛΚΕΣ ────────────────────────────────────────────────────────────
-- P53802 ασφάλεια: συμβόλαιο 06/09/2026 → 06/09/2027.
UPDATE trailers SET insurance_expiry = '2027-09-06' WHERE id = 35 AND license_plate = 'P53802' AND insurance_expiry = '2026-09-05';
-- P59483 ασφάλεια: «Ασφάλεια 27-9-2027.pdf» 27/09/2026 → 27/09/2027 (το φύλλο έχει τη λήξη πράσινης κάρτας 26/9).
UPDATE trailers SET insurance_expiry = '2027-09-27' WHERE id = 14 AND license_plate = 'P59483' AND insurance_expiry = '2026-09-26';
-- P61335 ασφάλεια: νέα πράσινη κάρτα 22/09/2026 → 21/09/2027 (συμβόλαιο δεν ανέβηκε ακόμη).
UPDATE trailers SET insurance_expiry = '2027-09-21' WHERE id = 77 AND license_plate = 'P61335' AND insurance_expiry = '2026-09-22';
-- P59487 ΚΤΕΟ: «ΚΤΕΟ 13-8-2027.pdf» · ασφάλεια: 24/08/2026 → 24/08/2027.
UPDATE trailers SET kteo_expiry = '2027-08-13', insurance_expiry = '2027-08-24'
 WHERE id = 76 AND license_plate = 'P59487' AND kteo_expiry = '2026-08-13' AND insurance_expiry = '2026-08-24';
-- TB53142 ασφάλεια: συμβόλαιο λήγει 05/12/2026 23:59 (φύλλο + όνομα αρχείου λένε 2 — λάθος ημέρα).
UPDATE trailers SET insurance_expiry = '2026-12-05' WHERE id = 20 AND license_plate = 'TB53142' AND insurance_expiry = '2026-12-02';
-- E9019EE ασφάλεια: πράσινη κάρτα Lev Ins (έκδ. 04.09.2026) 11-09-2026 → 10-09-2027.
UPDATE trailers SET insurance_expiry = '2027-09-10' WHERE id = 8  AND license_plate = 'E9019EE' AND insurance_expiry = '2026-09-10';

-- Απόδειξη: 11 πεδία σε 9 οχήματα. Αναμένονται 9 γραμμές, όλες ok = true.
SELECT 'truck' t, license_plate, kteo_expiry, kek_expiry, insurance_expiry,
       (license_plate, kteo_expiry, kek_expiry) IN (('IAB2106','2026-11-11'::date,'2026-05-11'::date),
                                                   ('IAZ7245','2026-12-04'::date,'2026-06-04'::date),
                                                   ('CB4612PE','2027-09-05'::date,'2027-09-05'::date)) ok
  FROM trucks WHERE id IN (14,5,23)
UNION ALL
SELECT 'trailer', license_plate, kteo_expiry, NULL, insurance_expiry,
       (license_plate, insurance_expiry) IN (('P53802','2027-09-06'::date),('P59483','2027-09-27'::date),('P61335','2027-09-21'::date),
                                             ('P59487','2027-08-24'::date),('TB53142','2026-12-05'::date),('E9019EE','2027-09-10'::date))
  FROM trailers WHERE id IN (35,14,77,76,20,8);

COMMIT;
