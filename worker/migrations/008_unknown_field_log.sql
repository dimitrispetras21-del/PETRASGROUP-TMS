-- ============================================================================
-- 008: facade unknown-field log — Phase 1 of the silent-drop fix (owner 24/8)
--
-- WHY: the facade silently drops unknown field labels (fieldsToColumns on
-- write, fields[] on read) and answers 200 OK. Months of frontend fields never
-- reached the DB (ramp order/truck/driver 0/30, clients contact_person
-- 0/1920, orders invoiced 0/89 — measured 24/8). We do NOT know the full
-- list; this table makes production traffic produce it.
--
-- DESIGN: one row per (day, table, field, kind, method, role, actor); repeats
-- increment `count`. Bounded rows by construction — a screen polling every
-- 30s with a bad fields[] list adds ONE row per day, not thousands. The
-- Worker additionally dedupes per-isolate per-minute before calling the RPC.
--
-- Phase 2 (rejecting unknown writes) is deliberately NOT here.
-- ============================================================================

create table if not exists public.facade_unknown_fields (
  id          bigint generated always as identity primary key,
  day         date        not null default (now() at time zone 'utc')::date,
  table_name  text        not null,
  field_label text        not null,
  kind        text        not null check (kind in ('write', 'read', 'filter', 'sort')),
  method      text        not null default '',
  role        text        not null default '',
  actor       text        not null default '',
  count       bigint      not null default 1,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  sample_path text,
  -- method/role/actor default '' (not NULL) on purpose: NULLs never collide
  -- in a unique constraint, which would break the one-row-per-bucket design.
  constraint facade_unknown_fields_bucket
    unique (day, table_name, field_label, kind, method, role, actor)
);

-- Supabase default privileges auto-grant table access to anon/authenticated
-- on CREATE. We closed exactly such doors on 23/8 — do not open a new one.
-- Only the Worker's service_role may touch this table.
alter table public.facade_unknown_fields enable row level security;
revoke all on table public.facade_unknown_fields from public, anon, authenticated;
grant select, insert, update on table public.facade_unknown_fields to service_role;
grant usage, select on sequence public.facade_unknown_fields_id_seq to service_role;

-- Upsert entry point for the Worker. SECURITY INVOKER (the default): it runs
-- with the caller's rights, and only service_role is granted EXECUTE below —
-- unlike the SECURITY DEFINER functions we had to lock down on 23/8.
create or replace function public.log_unknown_field(
  p_table text, p_label text, p_kind text, p_method text,
  p_role text, p_actor text, p_path text
) returns bigint
language sql
set search_path to 'public'
as $$
  insert into public.facade_unknown_fields as f
    (table_name, field_label, kind, method, role, actor, sample_path)
  values (
    left(coalesce(p_table, ''), 100),
    left(coalesce(p_label, ''), 200),
    p_kind,
    left(coalesce(p_method, ''), 10),
    left(coalesce(p_role, ''), 50),
    left(coalesce(p_actor, ''), 100),
    left(p_path, 300)
  )
  on conflict on constraint facade_unknown_fields_bucket
  do update set count = f.count + 1, last_seen = now()
  returning f.count;
$$;

revoke execute on function public.log_unknown_field(text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.log_unknown_field(text, text, text, text, text, text, text)
  to service_role;

-- The question this table answers, after 3-5 days of normal use:
--   select table_name, field_label, kind, sum(count) as hits,
--          min(first_seen) as first_seen, max(last_seen) as last_seen,
--          array_agg(distinct nullif(actor, '')) as actors
--   from facade_unknown_fields
--   group by 1, 2, 3
--   order by hits desc;
