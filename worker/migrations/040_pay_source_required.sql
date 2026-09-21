-- 040 — ct_cost_lines.pay_source NOT NULL (owner 21/9/2026, Alexia's request 2:
--        «πάλι τρόπος πληρωμής» — every expense line says how it was paid).
--
-- ΕΓΚΕΚΡΙΜΕΝΗ 21/9 (owner μέσω συντονιστή) — ΔΕΝ ΕΧΕΙ ΤΡΕΞΕΙ. Εκτελεί ΜΟΝΟ ο
-- owner, Supabase SQL editor, μετά τις 15:00. Σειρά w11: Worker deploy → 038 →
-- 039 → 040 → 041 → 042 → push front end. Η σειρά Worker↔040 είναι αδιάφορη:
-- ο νέος Worker απορρίπτει POST χωρίς pay_source και PATCH με null πριν τη
-- βάση· η οθόνη προεπιλέγει τιμή ανά κατηγορία από τις 13/9 (032).
--
-- WHY (measured 21/9): 8 rows with pay_source NULL — 7 hand-typed on one RT
-- (5–10/9, before the accountant's dropdown got its default) and 1 partner
-- rate written automatically by the Weekly (21/8). The value is inferred
-- from each line's note and confirmed by the owner (21/9):
--   306 fuel «DADI-…»            → CREDIT  (DADI invoice on credit)
--   307 reefer «DADI-…»          → CREDIT
--   308 fuel «NIKOLAI-…»         → CREDIT  (owner: Nikolai = supplier, paid on credit like DADI)
--   309 adblue «INV-…»           → CREDIT
--   310 tolls «BINIETA-INV-…»    → CREDIT  (vignette with invoice)
--   311 other «PARKING-ΜΕΤΡΗΤΑ»  → CASH    (the note says it)
--   312 fines «…-REV-INV…»       → REVOLUT (the note says it)
--     1 partner_rate «auto από Weekly» → CREDIT (partner freight, invoiced)
-- DADI / NIKOLAI are SUPPLIERS (fuel_source), never a way of paying — two
-- axes, one value each (αρχή 3). The guard below refuses to run if any
-- OTHER NULL row appeared since 21/9: the migration must never guess.

begin;

do $$
declare unexpected int;
begin
  select count(*) into unexpected from ct_cost_lines where pay_source is null and id not in (306, 307, 308, 309, 310, 311, 312, 1);
  if unexpected > 0 then
    raise exception '040: % pay_source NULL rows beyond the 8 measured on 21/9 — list them (select id, category, note from ct_cost_lines where pay_source is null) and extend the backfill before running', unexpected;
  end if;
end $$;

update ct_cost_lines set pay_source = 'CREDIT',  note = concat_ws(' · ', note, 'πληρωμή: πίστωση (040)') where id in (306, 307, 308, 309, 310, 1) and pay_source is null;
update ct_cost_lines set pay_source = 'CASH',    note = concat_ws(' · ', note, 'πληρωμή: μετρητά (040)')  where id = 311 and pay_source is null;
update ct_cost_lines set pay_source = 'REVOLUT', note = concat_ws(' · ', note, 'πληρωμή: Revolut (040)')  where id = 312 and pay_source is null;

insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
select 'migration:040', 'system', 'update', 'ct_cost_lines', id::text,
       jsonb_build_object('pay_source', null),
       jsonb_build_object('pay_source', pay_source, 'reason', 'backfill from the line note, owner 21/9 (040)'), now()
from ct_cost_lines where id in (306, 307, 308, 309, 310, 311, 312, 1);

alter table ct_cost_lines alter column pay_source set not null;

commit;

-- ═══ ΠΡΙΝ ═══
-- select id, rt_id, category, net + coalesce(vat,0) gross, note from ct_cost_lines where pay_source is null order by id;   -- τα 8 της 21/9
-- ═══ ΜΕΤΑ ═══
-- 1. select count(*) from ct_cost_lines where pay_source is null;   -- 0
-- 2. select id, pay_source from ct_cost_lines where id in (306,307,308,309,310,311,312,1) order by id;   -- CREDIT×6, CASH (311), REVOLUT (312)
-- 3. select is_nullable from information_schema.columns where table_name='ct_cost_lines' and column_name='pay_source';   -- NO
-- 4. select count(*) from audit_log where actor='migration:040';   -- 8
