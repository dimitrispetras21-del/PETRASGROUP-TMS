-- 043 — Σήμανση «τιμολογήθηκε» μόνο με τιμή και αριθμό ΤΠΥ του ERP (owner 21/9/2026,
--        αποφάσεις 2 + 3 της ετοιμότητας Ειρήνης — docs/data-audit/2026-09/2026-09-21-eirini-readiness.md §7.1).
--
-- ΕΓΚΕΚΡΙΜΕΝΗ 21/9 (owner μέσω συντονιστή) — ΔΕΝ ΕΧΕΙ ΤΡΕΞΕΙ. Εκτελεί ΜΟΝΟ ο owner,
-- Supabase SQL editor, μετά τις 15:00. Σειρά: Worker deploy (422) → 043 → push front end.
-- Η σειρά Worker↔043 είναι αδιάφορη: και οι δύο αρνούνται το ίδιο πράγμα με το ίδιο
-- μήνυμα· η οθόνη (invoicing.js) δεν στέλνει πια σήμανση χωρίς αριθμό ή χωρίς τιμή.
--
-- WHY (μετρήθηκε 21/9): invoiced 2/192, ΚΑΙ ΟΙ ΔΥΟ χωρίς invoice_number (owner 21/8)·
-- invoice_number/invoice_date γραμμένα 0/192· 27 παραδομένες χωρίς τιμή με ενεργό checkbox.
-- Το TMS ΔΕΝ εκδίδει τιμολόγια (κλείδωμα 23/8) — η οθόνη όμως γεννούσε INV-2026-NNNN και
-- η μαζική σήμανση τα έγραφε χωρίς να ρωτήσει. Από εδώ και πέρα ο αριθμός είναι του ERP.
--
-- TRIGGER ΜΕΤΑΒΑΣΗΣ, ΟΧΙ CHECK — γιατί: ένα CHECK (ακόμη και NOT VALID) απορρίπτει ΚΑΘΕ
-- update στις 2 γραμμές της 21/8 μέχρι να γραφτεί αριθμός που ο owner δεν έχει αποφασίσει
-- (§7.1.9) — ένας dispatcher που διορθώνει ημερομηνία θα έπαιρνε σφάλμα «τιμολογίου». Ο
-- trigger πυροδοτεί ΜΟΝΟ όταν μια γραμμή ΓΙΝΕΤΑΙ invoiced ή όταν, ενώ είναι invoiced,
-- αλλάζει invoice_number ή price. Οι 2 παλιές γραμμές μένουν όπως είναι — τίμια
-- αναπαλήθευτες — και τις μετρά το ερώτημα ελέγχου στο τέλος. Δεν γίνεται backfill με
-- placeholder: αριθμός που δεν υπάρχει στο ERP είναι ψέμα (αρχή 1).
--
-- Ισχύει και για national_orders (απόφαση 5: οι εθνικές τιμολογούνται από το TMS).

begin;

create or replace function invoice_mark_guard() returns trigger
language plpgsql as $$
begin
  if new.invoiced is true and (
       tg_op = 'INSERT'
       or old.invoiced is distinct from true
       or new.invoice_number is distinct from old.invoice_number
       or new.price is distinct from old.price) then
    if coalesce(btrim(new.invoice_number), '') = '' then
      raise exception 'Δεν σημαίνεται τιμολογημένη χωρίς αριθμό τιμολογίου (ΤΠΥ) του ERP'
        using errcode = 'check_violation', constraint = 'invoice_mark_requires_number';
    end if;
    if coalesce(new.price, 0) <= 0 then
      raise exception 'Δεν σημαίνεται τιμολογημένη χωρίς τιμή'
        using errcode = 'check_violation', constraint = 'invoice_mark_requires_price';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_invoice_mark_guard on orders;
create trigger orders_invoice_mark_guard
  before insert or update of invoiced, invoice_number, price on orders
  for each row execute function invoice_mark_guard();

drop trigger if exists national_orders_invoice_mark_guard on national_orders;
create trigger national_orders_invoice_mark_guard
  before insert or update of invoiced, invoice_number, price on national_orders
  for each row execute function invoice_mark_guard();

-- Φρουρός: ο trigger υπάρχει και στους δύο πίνακες, αλλιώς τίποτα δεν έγινε.
do $$
declare n int;
begin
  select count(*) into n from pg_trigger
   where tgname in ('orders_invoice_mark_guard', 'national_orders_invoice_mark_guard') and not tgisinternal;
  if n <> 2 then raise exception '043: αναμενόταν 2 triggers, βρέθηκαν %', n; end if;
end $$;

commit;

-- ΜΕΤΑ (SELECT, owner ή session):
--   select count(*) filter (where invoiced) as invoiced,
--          count(*) filter (where invoiced and coalesce(btrim(invoice_number),'')='') as invoiced_without_number
--     from orders where deleted_at is null;
--   -- αναμενόμενο αμέσως μετά: invoiced 2, invoiced_without_number 2 (οι γραμμές της 21/8,
--   -- ανέγγιχτες — §7.1.9)· από τη Δευτέρα το πρώτο ανεβαίνει, το δεύτερο ΔΕΝ ανεβαίνει ποτέ.
-- Δοκιμή άρνησης (σε συναλλαγή που γυρίζει πίσω, ΟΧΙ σε πραγματική παραγγελία):
--   begin; update orders set invoiced = true where id = <παραγγελία-δοκιμή με τιμή>; rollback;
--   -- αναμενόμενο: ERROR «χωρίς αριθμό τιμολογίου (ΤΠΥ)»
