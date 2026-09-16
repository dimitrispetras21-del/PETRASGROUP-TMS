-- 035 — pay_source accepts 'CREDIT' (ΠΙΣΤΩΣΗ) as a fourth payment method (owner 16/9/2026)
--
-- STATUS: DRAFT — NOT EXECUTED. The owner runs it by hand (Supabase SQL editor,
-- after 15:00 — αρχή 7) BEFORE the Worker deploy that accepts 'CREDIT'
-- (worker/src/costs-line-rules.mjs CT_PAY_SOURCES). Order matters: a Worker
-- that accepts 'CREDIT' against a CHECK that still rejects it turns every
-- credit line into a database error; a CHECK that accepts it under a Worker
-- that still rejects it is merely a 400 the accountant can read. The screen
-- itself lists only what GET /costs/lookups declares (pay_sources), so the
-- «ΠΙΣΤΩΣΗ» option appears by itself once the Worker is live — never before.
--
-- WHY: the owner's 16/9 review of «Έξοδα Δρομολογίων» (E8) — some suppliers
-- (a fuel station, a forwarder) are paid later, on account, not through the
-- DKV card, the driver's cash or the Revolut account. The owner asked for it
-- as a GENERAL choice on every category, not a special case for one supplier.
--
-- Rejected: encoding «paid later» as pay_source NULL — NULL already means
-- «nobody recorded how this was paid» (old manual lines), and the screen
-- prints «Πληρωμή —» for it on purpose (αρχή 1). A real fact needs a real value.
--
-- No backfill: no existing line is known to have been paid on credit.
-- Existing values ('DKV','CASH','REVOLUT') are untouched — the new CHECK is a
-- strict superset of the old one, so no row can fail it.

begin;

-- Proof BEFORE: the current constraint (expect 3 values: DKV, CASH, REVOLUT).
select conname, pg_get_constraintdef(oid) as before_def
  from pg_constraint
 where conrelid = 'ct_cost_lines'::regclass
   and conname = 'ct_line_pay_source_chk';

alter table ct_cost_lines
  drop constraint if exists ct_line_pay_source_chk;

alter table ct_cost_lines
  add constraint ct_line_pay_source_chk check (
    pay_source is null or pay_source in ('DKV','CASH','REVOLUT','CREDIT')
  );

-- Proof AFTER (inside the transaction — a wrong definition is rolled back by
-- the owner instead of committed): expect the 4-value list.
select conname, pg_get_constraintdef(oid) as after_def
  from pg_constraint
 where conrelid = 'ct_cost_lines'::regclass
   and conname = 'ct_line_pay_source_chk';

commit;

-- Proof (run after, separately):
--   select pay_source, count(*) from ct_cost_lines group by 1 order by 1;
--   -- expect: the same counts as before this migration (no row changed);
--   -- 'CREDIT' appears only after the first credit line is entered from the screen.
