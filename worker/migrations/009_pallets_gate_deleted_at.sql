-- ============================================================
-- ΠΑΛΕΤΕΣ — Migration 009: pl_v_order_gate + φίλτρα deleted_at
-- Τρέξε ΟΛΟΚΛΗΡΟ στο Supabase SQL editor (project gatejgbpyodlepkvqkgf).
--
-- Η 007 μετρούσε ΚΑΙ soft-deleted στάσεις/παραγγελίες: σβησμένη στάση
-- φόρτωσης σε παραγγελία με Pallet Exchange θα απαιτούσε δελτίο για
-- ανύπαρκτη στάση → η παραγγελία θα κλείδωνε ΜΟΝΙΜΑ στην τιμολόγηση
-- (μόνο το owner override θα τη σώζε). Εντοπίστηκε 26/8/2026 ως λανθάνον
-- (0 επηρεαζόμενες την ημέρα του ελέγχου) από ανεξάρτητο audit.
-- Παραγγελία με deleted_at δεν εμφανίζεται καθόλου — δεν τιμολογείται
-- ούτως ή άλλως, άρα δεν χρωστά δελτίο.
-- ============================================================
create or replace view pl_v_order_gate with (security_invoker = true) as
with ls as (
  select s.order_id, s.id as stop_id
  from order_stops s
  where s.stop_type = 'Loading' and s.order_id is not null
    and s.deleted_at is null
),
cov as (
  select distinct order_stop_id
  from pl_movements
  where event_type = 'LOADING' and status = 'confirmed' and order_stop_id is not null
)
select
  o.legacy_id                           as order_rec,
  ls.order_id,
  count(*)                              as loading_stops,
  count(cov.order_stop_id)              as covered_stops,
  (count(*) = count(cov.order_stop_id)) as sheets_ok
from ls
join orders o on o.id = ls.order_id and o.deleted_at is null
left join cov on cov.order_stop_id = ls.stop_id
group by o.legacy_id, ls.order_id;

-- Γεννημένη κλειστή (αρχή 5). Το CREATE OR REPLACE διατηρεί μεν τα ACL της
-- 007, αλλά το κλείσιμο δηλώνεται ρητά — δεν βασίζεται σε παρενέργεια.
revoke all on pl_v_order_gate from public, anon, authenticated;
grant select on pl_v_order_gate to service_role;

-- ============================================================
-- ΕΛΕΓΧΟΣ (πριν/μετά ίδια νούμερα όσο δεν υπάρχουν σβησμένες στάσεις σε
-- PE παραγγελίες):
--   select count(*), count(*) filter (where sheets_ok) from pl_v_order_gate;
--   select has_table_privilege('anon','pl_v_order_gate','SELECT');  -- false
-- ============================================================

-- 009_rollback: ξανατρέξε το CREATE OR REPLACE VIEW της 007
-- (worker/migrations/007_pallets_gates.sql, §4.1 — χωρίς τα δύο φίλτρα
-- deleted_at) + το ίδιο revoke/grant μπλοκ από πάνω.
