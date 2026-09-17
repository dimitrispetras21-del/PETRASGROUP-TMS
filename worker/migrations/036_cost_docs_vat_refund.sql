-- 036 — ct_cost_docs.vat_refund: the foreign VAT REMOBIS refunds against a DKV statement (owner 17/9/2026)
--
-- STATUS: DRAFT — NOT EXECUTED. The owner runs it by hand (Supabase SQL editor,
-- after 15:00 — αρχή 7). Order does NOT matter here: the Worker probes the
-- column (42703 guard, same as migration 024) and, until it exists, answers
-- the parse with vat_refund_unavailable:true and simply does not write it —
-- the import still works, the screen says the amount is not being stored.
--
-- WHY: the BG entity's August 2026 DKV statement carries a REMOBIS
-- «E-STATEMENT OF ACCOUNT …-900»: the Romanian VAT on the RO invoice
-- (1.395,21 EUR) is refunded through REMOBIS and netted on the E-SUMMARY
-- («VAT Refund total −1.395,21 · » Total 14.471,83» against Σ rows 15.867,04).
-- Owner 17/9: it is a RECEIVABLE, shown «σε γενικά», never a trip cost —
-- so it must not be a ct_cost_lines row (a negative 'dkv' line would lower
-- the month's DKV cost and every RT/week total that sums lines), and it must
-- not be lost either. A column on the document is the one place that
-- changes NO existing total: ct_cost_docs.total_gross stays Σ lines (as on
-- doc 1), payable = total_gross − vat_refund is derived where shown.
--
-- Rejected: a new ct_cost_lines category 'vat_refund' — every view/screen
-- that sums lines (ct_v_rt_costs, Έξοδα Δρομολογίων weekly sheet, TRIP PnL,
-- truck month) would need an exclusion, and the first one that forgets it
-- silently understates costs (αρχή 3: one more place to remember).
--
-- Written by the Worker at /costs/import/parse (abs. value, EUR, 2dp); read
-- by GET /costs/import/docs. Existing rows: NULL = «no refund on this
-- statement» (doc 1, GR entity, has none — its E-SUMMARY prints no refund line).

begin;

alter table ct_cost_docs add column if not exists vat_refund numeric(12,2);
comment on column ct_cost_docs.vat_refund is
  'EUR refunded by REMOBIS (foreign VAT) and netted on this statement''s E-SUMMARY. Receivable, not a cost: never summed into lines. payable = total_gross - coalesce(vat_refund,0). Owner 17/9/2026.';
alter table ct_cost_docs add constraint ct_cost_docs_vat_refund_nonneg check (vat_refund is null or vat_refund >= 0);

commit;

-- Proof AFTER (expect 1 row: vat_refund | numeric):
-- select column_name, data_type from information_schema.columns
--  where table_name = 'ct_cost_docs' and column_name = 'vat_refund';
