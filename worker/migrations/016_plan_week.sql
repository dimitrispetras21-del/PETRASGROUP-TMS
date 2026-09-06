-- 016 — Planning week for the Weekly boards (owner 6/9/2026)
--
-- «Ένα φορτηγό ξεφόρτωσε Παρασκευή· το κουμπώνω με μια εισαγωγή που φορτώνει
-- Σάββατο. Δεν θέλω να αλλάζουν οι ημερομηνίες.» The Weekly week runs Sat–Fri,
-- so a Saturday loading belongs to NEXT week by date. «Μεταφορά εβδομάδας»
-- used to shift loading/delivery by ±7 days to force the row over — it lied
-- about when the truck loads. Now it writes ONLY this column: the Saturday
-- that starts the week the dispatcher wants the row shown in. Dates, the
-- round trip, payroll and prints keep the real dates. NULL = «by date».

begin;

alter table orders add column if not exists plan_week_start date;
alter table orders drop constraint if exists orders_plan_week_start_saturday;
alter table orders add constraint orders_plan_week_start_saturday
  check (plan_week_start is null or extract(dow from plan_week_start) = 6);
comment on column orders.plan_week_start is
  'Weekly board override (owner 6/9/2026): Saturday that starts the planning week this order is shown in. Never moves loading/delivery dates. NULL = by date.';

commit;

-- Proof: select count(*) filter (where plan_week_start is not null) from orders;  -- 0 right after
