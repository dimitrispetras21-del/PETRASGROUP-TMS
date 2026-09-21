-- 041 — ct_cost_docs.lines_deleted: imported DKV lines deleted after the
--        commit are counted on the document (owner 21/9/2026, Alexia's
--        request 6: «μπορεί να διορθώνει ΚΑΙ να διαγράφει»).
--
-- ✅ ΕΚΤΕΛΕΣΤΗΚΕ 21/9/2026 ~15:00 UTC (owner): lines_deleted 0 στα docs 1–4.
-- (Ιστορικό:) ΕΓΚΕΚΡΙΜΕΝΗ 21/9 (owner μέσω συντονιστή). Εκτελεί ΜΟΝΟ ο
-- owner, μετά τις 15:00. Σειρά w11: Worker deploy → 038 → 039 → 040 → 041 →
-- 042 → push. Ο Worker γράφει τη στήλη μόνο αν υπάρχει (guard 42703) — πριν
-- τρέξει η 041 η διαγραφή περνά και το audit κρατά doc_id/import_key, μόνο ο
-- μετρητής λείπει.
--
-- WHY: a confirmed document's lines_total / E-SUMMARY agreement is a claim.
-- Once one of its lines is deleted the claim is false; the screen must say
-- «N γραμμές σβήστηκαν μετά την καταχώρηση — δεν συμφωνεί πλέον 1:1» on the
-- document row and in the trip frame (αρχή 1), and the audit row of every
-- such delete names the document and the imported key.

begin;
alter table ct_cost_docs add column if not exists lines_deleted integer not null default 0;
comment on column ct_cost_docs.lines_deleted is 'w11 (041): imported lines deleted after the commit (Worker DELETE /costs/lines increments it)';
-- Backfill from the audit trail: deletes of imported lines that already happened
-- carry before_data.doc_id (the row as it was).
update ct_cost_docs d set lines_deleted = x.n
from (select (before_data->>'doc_id')::bigint doc_id, count(*) n
      from audit_log where table_name = 'ct_cost_lines' and action = 'delete' and before_data ? 'doc_id' and before_data->>'doc_id' is not null
      group by 1) x
where x.doc_id = d.id;
commit;

-- ═══ ΜΕΤΑ ═══
-- select id, invoice_no, lines_total, lines_deleted from ct_cost_docs order by id;   -- 21/9: αναμένονται 0 παντού (καμία διαγραφή εισαγόμενης ως τώρα — αν όχι, το audit το λέει)
