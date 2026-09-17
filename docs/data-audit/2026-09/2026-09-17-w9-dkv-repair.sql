-- w9 DKV import (17/9/2026) — data repairs for the OWNER to run by hand (Supabase SQL editor, after 15:00).
-- Every statement carries its proof SELECT before and after. Run block by block, read the counts.
-- Repo copy: plates and ids replaced by placeholders (public repo); the owner has the filled-in version via the coordinator.

-- ── A. Plate alias: <OLD_PLATE> is the OLD plate of the truck now registered as <CURRENT_PLATE> (owner 17/9).
--     Worker: applyRules (worker/src/import-rules.mjs) reads ct_plate_aliases → truck_id; the parser only normalizes.
-- before (expect 1 row: <TRUCK_ID> | <CURRENT_PLATE> ; and 0 rows for the alias):
select id, license_plate from trucks where upper(replace(license_plate,' ','')) = '<CURRENT_PLATE>';
select * from ct_plate_aliases where alias = '<OLD_PLATE>';
begin;
insert into ct_plate_aliases (alias, truck_id) values ('<OLD_PLATE>', <TRUCK_ID>);
commit;
-- after (expect 1 row): select * from ct_plate_aliases where alias = '<OLD_PLATE>';

-- ── B. Doc 1 (GR entity, 8/9): one reverse-charge line booked net 19,95 / vat −15,04 — the −15,04 is a DISCOUNT, not VAT
--     (parser 1.1.0 net+vat≈gross heuristic; fixed in 1.2.0: reverse charge ⇒ vat 0, net = total). Gross stays 4,91.
-- before (expect exactly 1 row: id 69):
select id, net, vat, note from ct_cost_lines where doc_id = 1 and vat < 0;
begin;
update ct_cost_lines set net = 4.91, vat = 0 where id = 69 and doc_id = 1 and net = 19.95 and vat = -15.04;
-- proof inside the transaction (expect 1 | 4.91 | 0.00):
select count(*), min(net), min(vat) from ct_cost_lines where id = 69;
commit;
-- after: doc 1 Σ(net+vat) unchanged (expect 16199.35 as before — the gross of the line did not move):
select round(sum(net+vat)::numeric,2) from ct_cost_lines where doc_id = 1;

-- ── C. Draft ct_cost_docs id 2 (BG entity, 11/9, 0 lines, total_gross NULL).
--     NO cleanup is needed for the re-import: /costs/import/parse finds the draft by zip_sha256 and UPDATES it in place
--     (index.js: draftExisting → PATCH), so re-uploading the SAME ZIP reuses id 2. A confirmed doc with the same hash
--     would answer 409 — none exists. Only if the owner re-zips the PDFs (new bytes → new hash → new draft row) does
--     id 2 stay behind as an empty orphan; then, AFTER the new import is confirmed:
-- before (expect 1 row with status draft and 0 lines):
select d.id, d.status, d.total_gross, (select count(*) from ct_cost_lines l where l.doc_id = d.id) as lines from ct_cost_docs d where d.id = 2;
-- delete only while it is still an empty draft (hard delete: nothing references it; ct_cost_lines.doc_id would block otherwise):
-- begin;
-- delete from ct_cost_docs where id = 2 and status = 'draft' and not exists (select 1 from ct_cost_lines where doc_id = 2);
-- commit;
-- The storage object cost-docs/<hash>.zip of the orphan can stay (private bucket, 2 MB) or be removed from the Storage UI.

-- ── D. Migration 036 (ct_cost_docs.vat_refund) — worker/migrations/036_cost_docs_vat_refund.sql, DRAFT, owner runs it.
--     Until then the Worker answers vat_refund_unavailable:true and the screen says the refund is not stored.
