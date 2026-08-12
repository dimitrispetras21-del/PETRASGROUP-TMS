-- ============================================================
-- ΠΑΛΕΤΕΣ Φ4 — Migration 007: τα δύο gates (PALLETS_ARCHITECTURE §4)
-- Τρέξε ΟΛΟΚΛΗΡΟ στο Supabase SQL editor (project gatejgbpyodlepkvqkgf).
--
-- Δύο views που απαντούν «υπάρχει δελτίο;» χωρίς να χρειάζεται το frontend
-- να κατεβάσει όλες τις κινήσεις και να τις ταιριάξει μόνο του.
-- ============================================================

-- 4.1 GATE ΠΕΛΑΤΗ — τιμολόγηση
-- Μια παραγγελία τιμολογείται μόνο αν ΚΑΘΕ στάση φόρτωσής της έχει οριστική
-- κίνηση LOADING. Επιστρέφει και το legacy_id ώστε το invoicing (που μιλάει
-- recXXX) να φιλτράρει απευθείας, χωρίς δεύτερη μετάφραση.
-- ΠΡΟΣΟΧΗ: παραγγελία ΧΩΡΙΣ στάσεις φόρτωσης δεν εμφανίζεται καθόλου εδώ —
-- το frontend το ερμηνεύει ως «δεν απαιτείται δελτίο» (δεν υπάρχει στάση).
create or replace view pl_v_order_gate with (security_invoker = true) as
with ls as (
  select s.order_id, s.id as stop_id
  from order_stops s
  where s.stop_type = 'Loading' and s.order_id is not null
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
join orders o on o.id = ls.order_id
left join cov on cov.order_stop_id = ls.stop_id
group by o.legacy_id, ls.order_id;

-- 4.2 GATE PARTNER — Trip PnL
-- Το PnL διαδρομής με partner είναι ελλιπές όσο λείπει το δελτίο: οι χαμένες
-- παλέτες είναι πραγματικό κόστος (ct_settings.pallet_eur). Μετράμε ΜΟΝΟ τα
-- σκέλη των οποίων η παραγγελία έχει pallet exchange — τα υπόλοιπα δεν
-- χρωστούν δελτίο. Διαδρομή χωρίς τέτοιο σκέλος δεν εμφανίζεται (= εντάξει).
create or replace view ct_v_rt_pallet_gate with (security_invoker = true) as
with rt_orders as (
  select l.rt_id, l.order_id
  from ct_rt_legs l
  join orders o on o.id = l.order_id
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

-- ============================================================
-- ΕΛΕΓΧΟΣ:
--   select * from pl_v_order_gate limit 5;
--   select * from ct_v_rt_pallet_gate limit 5;
--   -- λογικός έλεγχος: covered_stops δεν γίνεται ποτέ > loading_stops
--   select count(*) from pl_v_order_gate where covered_stops > loading_stops;  -- 0
-- ============================================================

-- 007_rollback:
-- drop view if exists pl_v_order_gate;
-- drop view if exists ct_v_rt_pallet_gate;
