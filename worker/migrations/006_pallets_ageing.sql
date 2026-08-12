-- ============================================================
-- ΠΑΛΕΤΕΣ Φ3 — Migration 006: ηλικία οφειλής στα views υπολοίπων
-- Τρέξε ΟΛΟΚΛΗΡΟ στο Supabase SQL editor (project gatejgbpyodlepkvqkgf).
--
-- open_since = από πότε είναι ΑΝΟΙΧΤΗ η τρέχουσα οφειλή. ΟΧΙ η πρώτη κίνηση
-- του λογαριασμού: αν ο πελάτης χρωστούσε τον Μάιο, ξόφλησε τον Ιούνιο και
-- ξαναχρωστάει από τον Ιούλιο, η οφειλή είναι Ιουλίου. Υπολογίζεται ως η
-- πρώτη κίνηση ΜΕΤΑ την τελευταία φορά που το τρέχον υπόλοιπο μηδένισε.
-- Υπόλοιπο 0 σήμερα ⇒ open_since NULL (δεν υπάρχει ανοιχτή οφειλή).
--
-- ΠΡΟΣΟΧΗ: create or replace view δέχεται νέες στήλες ΜΟΝΟ στο τέλος.
-- ============================================================

create or replace view pl_v_balance_clients with (security_invoker = true) as
with conf as (
  select client_id, movement_date, id, (given - taken) as delta
  from pl_movements
  where status = 'confirmed' and client_id is not null
),
run as (
  select client_id, movement_date,
         sum(delta) over (partition by client_id order by movement_date, id) as running
  from conf
),
lastzero as (
  select client_id, max(movement_date) as zero_date
  from run where running = 0 group by client_id
),
ageing as (
  select r.client_id, min(r.movement_date) as open_since
  from run r
  left join lastzero z on z.client_id = r.client_id
  where z.zero_date is null or r.movement_date > z.zero_date
  group by r.client_id
)
select
  c.id           as client_id,
  c.company_name as client_name,
  coalesce(sum(m.given - m.taken) filter (where m.status = 'confirmed'), 0) as balance,
  count(*)       filter (where m.status = 'pending')                        as pending_count,
  a.open_since
from clients c
join pl_movements m on m.client_id = c.id
left join ageing a on a.client_id = c.id
group by c.id, c.company_name, a.open_since;

create or replace view pl_v_balance_partners with (security_invoker = true) as
with conf as (
  select partner_id, movement_date, id, (given - taken) as delta
  from pl_movements
  where status = 'confirmed' and partner_id is not null
),
run as (
  select partner_id, movement_date,
         sum(delta) over (partition by partner_id order by movement_date, id) as running
  from conf
),
lastzero as (
  select partner_id, max(movement_date) as zero_date
  from run where running = 0 group by partner_id
),
ageing as (
  select r.partner_id, min(r.movement_date) as open_since
  from run r
  left join lastzero z on z.partner_id = r.partner_id
  where z.zero_date is null or r.movement_date > z.zero_date
  group by r.partner_id
)
select
  p.id           as partner_id,
  p.company_name as partner_name,
  coalesce(sum(m.given - m.taken) filter (where m.status = 'confirmed'), 0) as balance,
  count(*)       filter (where m.status = 'pending')                        as pending_count,
  a.open_since
from partners p
join pl_movements m on m.partner_id = p.id
left join ageing a on a.partner_id = p.id
group by p.id, p.company_name, a.open_since;

-- ============================================================
-- ΕΛΕΓΧΟΣ:
--   select * from pl_v_balance_clients limit 5;   -- + στήλη open_since
--   select * from pl_v_balance_partners limit 5;
--   -- λογικός έλεγχος: όποιος έχει balance = 0 πρέπει να έχει open_since NULL
--   select count(*) from pl_v_balance_clients where balance = 0 and open_since is not null;  -- 0
-- ============================================================

-- 006_rollback: ξανατρέξε τα δύο view definitions του 003/004 χωρίς το ageing CTE.
