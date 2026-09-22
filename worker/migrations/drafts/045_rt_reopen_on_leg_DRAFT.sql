-- 045 — DRAFT (ΔΕΝ ΕΚΤΕΛΕΣΤΗΚΕ) — Round trip που είναι closed/complete ΞΑΝΑΝΟΙΓΕΙ όταν του προσαρτάται σκέλος
--        με παραγγελία όχι Delivered/Cancelled — από ΟΠΟΙΑ διαδρομή (front, Worker POST /costs/rt attach, SQL).
--        Απόφαση owner 22/9: «Το πρόβλημα πρέπει να λυθεί ΕΠ' ΑΟΡΙΣΤΟΝ» — αρχή 4: ο κανόνας όσο πιο χαμηλά αντέχει.
--        Τρέχει ο owner μετά τις 15:00 (Supabase SQL editor). Ελεγκτής: «μεγάλη» αλλαγή (migration).
--
-- WHY (22/9, docs/data-audit/2026-09/2026-09-22-pantelis-rota-cands.md «Μετά το merge»): η MyDay (367, Pending)
-- προσαρτήθηκε ως 3ο σκέλος στο RT-1171 (361+364 Delivered) και το RT έμεινε/έγινε closed. Το front διορθώθηκε
-- (rt-feed _rtOpenLegs, main 696bb9d) αλλά καλύπτει ΜΙΑ διαδρομή. Μετρήθηκε: 1/69 κλειστά RT με ανοιχτό σκέλος.
--
-- ΤΙ ΥΠΑΡΧΕΙ ΗΔΗ (διαβάστηκε 22/9, pg_get_functiondef — για να μη διπλασιαστεί λογική):
--   • 013 rt_sync_legs (AFTER INSERT OR DELETE ON ct_rt_legs): αντιγράφει όχημα RT↔order, καλεί rt_recompute.
--     Το rt_recompute αλλάζει status ΜΟΝΟ σε 'cancelled' όταν μείνουν 0 σκέλη — ποτέ closed/planned.
--   • 013 rt_sync_from_order (orders): όχημα/αδέλφια/recompute — δεν κλείνει, δεν ξανανοίγει.
--   • 033 rt_create_from_order (orders): στη ΔΙΚΗ ΤΗΣ διαδρομή attach (insert στο ct_rt_legs) ξανανοίγει
--     («reopened: leg … not yet delivered (033)») — αλλά ΜΟΝΟ όταν η ίδια κάνει το insert, δηλαδή σε UPDATE των
--     orders με truck_id/partner. Στη ζωντανή περίπτωση 22/9 επέστρεψε νωρίς (η 367 δεν είχε ακόμη truck_id) και
--     το σκέλος το έβαλε ο Worker.
--   • Worker POST /costs/rt, action attach (index.js ~3104): dbInsert στο ct_rt_legs = ΣΚΕΤΟ INSERT (όχι upsert)·
--     τα seq ενημερώνονται με PATCH (UPDATE seq, ΟΧΙ order_id)· το RT παίρνει μόνο date_end (extend). Δεν ξανανοίγει.
--   ⇒ Το 045 καλύπτει ΜΟΝΟ την εισαγωγή σκέλους (INSERT, και UPDATE OF order_id για πληρότητα) στο ct_rt_legs —
--     ό,τι κι αν το γράψει. Η 033 μένει ως έχει (η δική της επαναφορά γίνεται πλεονάζουσα αλλά αβλαβής: ίδιο
--     αποτέλεσμα, δύο audit γραμμές στην περίπτωση που περνά και από τις δύο). Σκέλη national_loads (nat_load_id)
--     ΔΕΝ εξετάζονται εδώ (άλλο λεξιλόγιο status) — αν χρειαστεί, δεύτερη migration.
--   • Σειρά triggers στο ct_rt_legs: αλφαβητική → rt_reopen_on_leg ΠΡΙΝ το rt_sync_legs. Ανεξάρτητα μεταξύ τους.
--
-- Αναστρέψιμο: DROP TRIGGER rt_reopen_on_leg ON ct_rt_legs; DROP FUNCTION rt_reopen_on_leg();

BEGIN;

CREATE OR REPLACE FUNCTION public.rt_reopen_on_leg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  rt ct_round_trips%rowtype;
  o  orders%rowtype;
begin
  if new.order_id is null then return null; end if;                 -- national leg: εκτός πεδίου (βλ. κεφαλίδα)
  select * into rt from ct_round_trips where id = new.rt_id;
  if rt.id is null or rt.status not in ('closed','complete') then return null; end if;
  select * into o from orders where id = new.order_id;
  if o.id is null or o.deleted_at is not null then return null; end if;
  if o.status in ('Delivered','Cancelled') then return null; end if; -- παραδομένο σκέλος δεν ξανανοίγει ιστορικό

  update ct_round_trips
     set status = 'planned', closed_at = null, updated_at = now()
   where id = rt.id;
  perform rt_sync_audit('update', 'ct_round_trips', rt.id::text,
    jsonb_build_object('status', rt.status, 'closed_at', rt.closed_at),
    jsonb_build_object('status', 'planned', 'closed_at', null,
                       'leg_order', new.order_id, 'order_status', o.status,
                       'reason', 'reopened: leg attached while trip was ' || rt.status || ' and order not delivered (045)'));
  return null;
end $function$;

DROP TRIGGER IF EXISTS rt_reopen_on_leg ON public.ct_rt_legs;
CREATE TRIGGER rt_reopen_on_leg
  AFTER INSERT OR UPDATE OF order_id ON public.ct_rt_legs
  FOR EACH ROW EXECUTE FUNCTION public.rt_reopen_on_leg();

-- ΦΡΟΥΡΟΣ (ελεγκτής P3 [3], μοτίβο 037/043): ακριβώς 2 triggers στο ct_rt_legs (rt_reopen_on_leg + rt_sync_legs) —
-- αλλιώς η συναλλαγή γυρίζει πίσω μόνη της, τίποτα δεν μένει μισό.
DO $$
DECLARE n int;
BEGIN
  SET LOCAL search_path = public;
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.ct_rt_legs'::regclass AND NOT tgisinternal;
  IF n <> 2 THEN
    RAISE EXCEPTION '045: αναμενόταν 2 triggers στο ct_rt_legs (rt_reopen_on_leg + rt_sync_legs), βρέθηκαν %', n;
  END IF;
END $$;
SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.ct_rt_legs'::regclass AND NOT tgisinternal ORDER BY tgname;   -- πρέπει: rt_reopen_on_leg, rt_sync_legs

COMMIT;

-- ── ΣΕΝΑΡΙΟ ΔΟΚΙΜΗΣ (γυρίζει πίσω — ΤΙΠΟΤΑ δεν μένει). Πραγματικά ids 22/9:
--    RT-1004 (id 4): closed, όλα τα σκέλη Delivered · παραγγελία 369: Pending, χωρίς σκέλος, χωρίς φορτηγό.
--    Αν κάποιο από τα δύο άλλαξε ως την εκτέλεση, το πρώτο SELECT το δείχνει — μην συνεχίσεις.
BEGIN;
SELECT r.code, r.status AS rt_status_before,
       (SELECT status FROM orders WHERE id = 369) AS order_status,
       (SELECT count(*) FROM ct_rt_legs WHERE order_id = 369) AS legs_of_369   -- πρέπει 0
  FROM ct_round_trips r WHERE r.id = 4;

INSERT INTO ct_rt_legs (rt_id, direction, order_id, seq) VALUES (4, 'EXPORT', 369, 99);

-- ΠΡΟΣΔΟΚΙΑ: status = 'planned', closed_at NULL, 1 γραμμή audit «reopened … (045)» για το RT 4.
-- ΤΙ ΑΛΛΟ ΘΑ ΔΕΙΣ (ελεγκτής P4 [5] — αλυσίδα, όλα γυρίζουν πίσω): ο rt_sync_legs (013) τρέχει στο ίδιο INSERT και
-- αντιγράφει το όχημα του RT-1004 στην 369 → +1 audit γραμμή στα orders (record 369, «leg attached»)· το rt_recompute
-- μπορεί να αλλάξει date_start/date_end του RT 4 → +1 audit γραμμή ct_round_trips (dates). Άρα ως 3 γραμμές audit,
-- όχι 1 — αυτό είναι φυσιολογικό. Το ΜΟΝΟ που ελέγχεις: status planned + η γραμμή με reason «(045)».
SELECT code, status AS rt_status_after, closed_at FROM ct_round_trips WHERE id = 4;
SELECT actor, action, table_name, record_id, after_data->>'reason' AS reason FROM audit_log
 WHERE (table_name = 'ct_round_trips' AND record_id = '4') OR (table_name = 'orders' AND record_id = '369')
 ORDER BY created_at DESC LIMIT 4;

ROLLBACK;   -- ← ΥΠΟΧΡΕΩΤΙΚΟ: το σκέλος-δοκιμή και το ξανάνοιγμα ΔΕΝ μένουν

-- ── ΜΕΤΑ (μετά και το ξανάνοιγμα του RT-1171 από το 2026-09-22_reopen_rt1171_DRAFT.sql): πρέπει 0.
SELECT count(DISTINCT r.id) AS closed_with_open_leg
  FROM ct_round_trips r JOIN ct_rt_legs l ON l.rt_id = r.id JOIN orders o ON o.id = l.order_id
 WHERE r.status IN ('closed','complete') AND o.deleted_at IS NULL
   AND o.status IS DISTINCT FROM 'Delivered' AND o.status IS DISTINCT FROM 'Cancelled';
