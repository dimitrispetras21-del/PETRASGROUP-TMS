-- ═══════════════════════════════════════════════════════════════════════
-- NATIONAL LOADS — ώρα ραντεβού ανά σκέλος
-- 2026-08-10 · Weekly National v3, διόρθωση owner
--
-- ΓΙΑΤΙ ΞΕΧΩΡΙΣΤΟ ΠΕΔΙΟ
-- Το σήμα ώρας έβγαινε αυτόματα από την ώρα του loading_datetime /
-- delivery_datetime. Αυτό είναι λάθος: μια εγγραφή μπορεί να έχει ώρα μέσα
-- της για δεκάδες λόγους — ένα ΡΑΝΤΕΒΟΥ όμως είναι απόφαση, που κάποιος
-- πήρε και κατέγραψε ρητά. Χωρίς ξεχωριστό πεδίο τα δύο δεν ξεχωρίζουν, και
-- η σελίδα γέμιζε σήματα που δεν είχε ζητήσει κανείς.
--
-- ΤΥΠΟΣ: text, όχι time
-- Είναι ώρα ρολογιού τοίχου («ο πελάτης δέχεται στις 10:00»), χωρίς ζώνη
-- ώρας και χωρίς σύνδεση με ημερομηνία. Το text περνά αυτούσιο μέσα από τον
-- facade του Worker και εμφανίζεται όπως αποθηκεύτηκε. Ένα time θα γυρνούσε
-- «10:00:00» και θα ήθελε μορφοποίηση σε κάθε καταναλωτή.
--
-- ΑΣΦΑΛΕΙΑ: καθαρά προσθετικό. Δύο nullable στήλες. Καμία υπάρχουσα στήλη
-- δεν αλλάζει, καμία εγγραφή δεν μεταναστεύει, τίποτα δεν σπάει αν το
-- frontend δεν τις ζητήσει ποτέ.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.national_loads
  ADD COLUMN IF NOT EXISTS loading_appointment  text,
  ADD COLUMN IF NOT EXISTS delivery_appointment text;

-- Μορφή HH:MM (24ωρο) ή NULL. Το NOT VALID αφήνει τις υπάρχουσες γραμμές
-- ήσυχες — είναι όλες NULL ούτως ή άλλως — και ελέγχει μόνο ό,τι γράφεται
-- από εδώ και πέρα.
ALTER TABLE public.national_loads
  ADD CONSTRAINT national_loads_loading_appointment_fmt
  CHECK (loading_appointment IS NULL
         OR loading_appointment ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') NOT VALID;

ALTER TABLE public.national_loads
  ADD CONSTRAINT national_loads_delivery_appointment_fmt
  CHECK (delivery_appointment IS NULL
         OR delivery_appointment ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') NOT VALID;

COMMENT ON COLUMN public.national_loads.loading_appointment
  IS 'Ώρα ραντεβού φόρτωσης, HH:MM. Ορίζεται ρητά από τον χρήστη (δεξί κλικ στο Weekly National). ΔΕΝ εξάγεται από το loading_datetime.';
COMMENT ON COLUMN public.national_loads.delivery_appointment
  IS 'Ώρα ραντεβού παράδοσης, HH:MM. Ορίζεται ρητά από τον χρήστη. ΔΕΝ εξάγεται από το delivery_datetime.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ΜΕΤΑ ΤΟ MIGRATION — δύο βήματα ακόμη, με ΑΥΤΗ τη σειρά
--
-- 1) WORKER: στον χάρτη του tblVW42cZnfC47gTb (NATIONAL LOADS), στο μπλοκ
--    `fields`, πρόσθεσε:
--
--        "Loading Appointment":  "loading_appointment",
--        "Delivery Appointment": "delivery_appointment"
--
--    Είναι scalars, όχι links — πάνε στο `fields`, ΟΧΙ στο `links`.
--
-- 2) FRONTEND: μόνο ΑΦΟΥ ο Worker σερβίρει τα πεδία, πρόσθεσέ τα στο
--    `fields:` array του _wnLoadAll (modules/weekly_natl.js) και ενεργοποίησε
--    το δεξί κλικ «Ώρα ραντεβού».
--
--    Η σειρά έχει σημασία: αίτημα για πεδίο που ο Worker δεν γνωρίζει
--    γυρίζει 422 και ρίχνει ΟΛΗ τη σελίδα, όχι μόνο το σήμα.
--
-- ΕΛΕΓΧΟΣ ότι πέρασε:
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name = 'national_loads'
--      AND column_name LIKE '%appointment%';
--   -- αναμενόμενο: 2 γραμμές, και οι δύο text
-- ═══════════════════════════════════════════════════════════════════════
