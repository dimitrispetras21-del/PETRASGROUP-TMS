-- ============================================================
-- COSTS — Migration 010: ct_v_rt_pallet_gate + φίλτρο deleted_at
-- Τρέξε ΟΛΟΚΛΗΡΟ στο Supabase SQL editor (project gatejgbpyodlepkvqkgf).
--
-- Το ίδιο λανθάνον με την 009 (όπου βρέθηκαν 8 νεκρές απαιτήσεις δελτίων):
-- η 007 §4.2 κάνει join σε orders ΧΩΡΙΣ deleted_at IS NULL — σβησμένη
-- παραγγελία με pallet_exchange θα κρατούσε το PnL διαδρομής «ελλιπές» για
-- πάντα. Διορθώνεται ΠΡΙΝ γεννηθούν δεδομένα (σήμερα: 0 RTs, 0 legs).
-- Το ct_rt_legs ΔΕΝ έχει στήλη deleted_at (ελέγχθηκε 24/8) — μόνο orders.
-- ============================================================
create or replace view ct_v_rt_pallet_gate with (security_invoker = true) as
with rt_orders as (
  select l.rt_id, l.order_id
  from ct_rt_legs l
  join orders o on o.id = l.order_id and o.deleted_at is null
  where l.order_id is not null and o.pallet_exchange = true
),
sheets as (
  select distinct order_id
  from pl_movements
  where status = 'confirmed'
    and event_type in ('PARTNER_PICKUP', 'PARTNER_DROPOFF')
    and order_id is not null
)
select
  ro.rt_id,
  count(*)                       as legs_needing_sheet,
  count(s.order_id)              as legs_with_sheet,
  (count(*) = count(s.order_id)) as sheets_ok
from rt_orders ro
left join sheets s on s.order_id = ro.order_id
group by ro.rt_id;

-- Γεννημένη κλειστή (αρχή 5) — ρητά, όχι μέσω της παρενέργειας του OR REPLACE.
revoke all on ct_v_rt_pallet_gate from public, anon, authenticated;
grant select on ct_v_rt_pallet_gate to service_role;

-- ============================================================
-- ΕΛΕΓΧΟΣ (baseline 24/8: 0 γραμμές — τα ct_ είναι κενά, αναμένεται 0 και μετά):
--   select count(*) from ct_v_rt_pallet_gate;
--   select has_table_privilege('anon','ct_v_rt_pallet_gate','SELECT');  -- false
-- ============================================================

-- 010_rollback: ξανατρέξε το CREATE OR REPLACE VIEW της 007 §4.2
-- (worker/migrations/007_pallets_gates.sql — χωρίς το φίλτρο deleted_at)
-- + το ίδιο revoke/grant μπλοκ από πάνω.
