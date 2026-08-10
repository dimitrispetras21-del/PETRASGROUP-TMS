-- ============================================================
-- ΠΑΛΕΤΕΣ Φ1 — Migration 003: schema pl_* (PALLETS_ARCHITECTURE §5)
-- Τρέξε το ΟΛΟΚΛΗΡΟ στο Supabase SQL editor (project gatejgbpyodlepkvqkgf)
-- με clipboard paste (pbcopy) — ΟΧΙ πληκτρολόγηση.
-- RLS: ενεργοποιείται εδώ χωρίς policies = πρόσβαση ΜΟΝΟ με service key
-- (ίδια κατάσταση με τα ct_* — εκεί έγινε χειροκίνητα μετά το 001).
-- Κανόνες status/αντιλογισμού: enforcement στο API layer (Worker), όχι εδώ.
-- ============================================================

-- 5.1 Το ημερολόγιο — μία γραμμή = μία κίνηση, ποτέ δεν σβήνεται (confirmed)
create sequence pl_code_seq start 1001;
create table pl_movements (
  id                bigint generated always as identity primary key,
  code              text unique not null default ('PM-' || nextval('pl_code_seq')::text),
  movement_date     date not null,
  counterparty_type text not null check (counterparty_type in ('CLIENT','PARTNER')),
  client_id         bigint references clients(id),
  partner_id        bigint references partners(id),
  location_id       bigint references locations(id),   -- σημείο (drill-down, όχι λογαριασμός)
  event_type        text not null check (event_type in
    ('LOADING','DELIVERY','PARTNER_PICKUP','PARTNER_DROPOFF',
     'RETURN_OUT','RETURN_IN','ADJUSTMENT')),
  -- taken/given ΠΑΝΤΑ από τη δική μας σκοπιά: taken = πήραμε εμείς,
  -- given = δώσαμε εμείς. Υπόλοιπο = Σ(given − taken). Θετικό = μας χρωστάει.
  taken             integer not null default 0 check (taken >= 0),
  given             integer not null default 0 check (given >= 0),
  order_stop_id     bigint references order_stops(id),
  cons_load_id      bigint references consolidated_loads(id),
  sheet_url         text,                          -- το δελτίο παλετών (upload)
  sheet_source      text check (sheet_source in ('UPLOAD_AI','UPLOAD','MANUAL')),
  status            text not null default 'pending'
                    check (status in ('pending','confirmed','reversed')),
  reversal_of       bigint references pl_movements(id),  -- η ΝΕΑ σωστή εγγραφή δείχνει την αντιλογισμένη
  reason            text,                          -- υποχρεωτικό σε ADJUSTMENT + στον αντιλογισμό
  notes             text,
  created_by        text not null,
  created_at        timestamptz not null default now(),
  confirmed_by      text,
  confirmed_at      timestamptz,
  constraint one_counterparty check (
    (counterparty_type = 'CLIENT'  and client_id  is not null and partner_id is null) or
    (counterparty_type = 'PARTNER' and partner_id is not null and client_id  is null)),
  constraint adjustment_needs_reason check (event_type <> 'ADJUSTMENT' or reason is not null)
);
create index pl_mov_client  on pl_movements (client_id, status);
create index pl_mov_partner on pl_movements (partner_id, status);
create index pl_mov_stop    on pl_movements (order_stop_id) where order_stop_id is not null;
create index pl_mov_cons    on pl_movements (cons_load_id)  where cons_load_id  is not null;
alter table pl_movements enable row level security;

-- 5.2 Views — υπόλοιπα ΜΟΝΟ από confirmed, τα pending χωριστή στήλη
create or replace view pl_v_balance_clients as
select
  c.id           as client_id,
  c.company_name as client_name,
  coalesce(sum(m.given - m.taken) filter (where m.status = 'confirmed'), 0) as balance,
  count(*)       filter (where m.status = 'pending')                        as pending_count
from clients c
join pl_movements m on m.client_id = c.id
group by c.id, c.company_name;

create or replace view pl_v_balance_partners as
select
  p.id           as partner_id,
  p.company_name as partner_name,
  coalesce(sum(m.given - m.taken) filter (where m.status = 'confirmed'), 0) as balance,
  count(*)       filter (where m.status = 'pending')                        as pending_count
from partners p
join pl_movements m on m.partner_id = p.id
group by p.id, p.company_name;

create or replace view pl_v_client_locations as
select
  m.client_id,
  m.location_id,
  l.name as location_name,
  coalesce(sum(m.given - m.taken) filter (where m.status = 'confirmed'), 0) as balance,
  count(*)       filter (where m.status = 'pending')                        as pending_count
from pl_movements m
left join locations l on l.id = m.location_id
where m.client_id is not null
group by m.client_id, m.location_id, l.name;
