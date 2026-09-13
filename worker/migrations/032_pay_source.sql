-- 032 — pay_source on every cost line: DKV / CASH / REVOLUT (owner 13/9/2026)
--
-- STATUS: DRAFT — NOT EXECUTED. The owner runs it by hand (Supabase SQL editor,
-- after 15:00 — αρχή 7) BEFORE the Worker deploy that writes pay_source.
--
-- WHY: after seeing the live v5 sheet the owner asked for a «Πηγή» on every
-- line — not only fuel — «για να επιλέγει αν είναι μετρητά ή Revolut ή
-- τράπεζα». It answers a different question from fuel_source (030): that one
-- says WHO sold the fuel (DADI, the BG station, our own tank…); this one says
-- HOW the line was paid — through the DKV account, in cash by the driver, or
-- by card/transfer from the Revolut business account. Two questions, two
-- columns; folding them into one would force «DKV» to mean both «bought at
-- a DKV station» and «paid via DKV», which are not the same thing (a DKV
-- station fill-up can be paid in cash).
--
-- Rejected: a single free-text «source» — the owner explicitly wants a fixed
-- choice, never typed («ΕΛΛΑΔΑ/gr/greece» is the same trap for countries).
--
-- Backfill: every imported line (doc_id set) was paid through the DKV account
-- by definition — the import IS the DKV statement. Manual lines stay null
-- until the accountant picks one (the entry row will require it).

begin;

alter table ct_cost_lines
  add column if not exists pay_source text;

alter table ct_cost_lines
  add constraint ct_line_pay_source_chk check (
    pay_source is null or pay_source in ('DKV','CASH','REVOLUT')
  );

update ct_cost_lines
   set pay_source = 'DKV'
 where doc_id is not null
   and pay_source is null;

commit;

-- Proof (run after):
--   select pay_source, (doc_id is not null) as imported, count(*)
--     from ct_cost_lines group by 1,2 order by 1,2;
--   -- expect: every imported line 'DKV'; manual lines null until edited.
