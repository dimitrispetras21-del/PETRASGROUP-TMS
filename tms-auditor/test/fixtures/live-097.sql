-- live-097.sql: captured from production 2/11/2026 (SELECT pg_get_functiondef / pg_get_triggerdef), the v1 pair
-- rules the production-shaped copy did not hold: rt_create_from_order (033 + 066), rt_link_split (037 + 066),
-- rt_merge (037), and their two triggers on orders. md5(prosrc) on production 2/11:
--   rt_create_from_order 0845ec6170fd2918d21efd56856daa3e
--   rt_link_split        6f954b256f103f1c6a8f8ab400a67808
--   rt_merge             41d629e48ba519c458848a9572b346c8
-- tms-auditor/test/rt-097.test.mjs asserts the copy holds exactly these (and the live md5 of every other function
-- the incident ran through), so a drift between this capture and the copy fails before any scenario.
CREATE OR REPLACE FUNCTION public.rt_create_from_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_type    text;
  dir         text;
  d_start     date;
  d_end       date;
  init_status text;
  new_rt_id   bigint;
  leg_rows    int;
  target      ct_round_trips%rowtype;
  n_targets   int;
  target_ids  text;
  next_seq    smallint;
  reason      text;
begin
  if new.deleted_at is not null or new.status = 'Cancelled' then
    return null;
  end if;
  if not (new.truck_id is not null
          or (coalesce(new.is_partner_trip, false) and new.partner_id is not null)) then
    return null;
  end if;
  if coalesce(new.is_partner_trip, false) and new.parent_order_id is not null then
    return null;
  end if;
  if exists (select 1 from orders c where c.parent_order_id = new.id and c.deleted_at is null) then
    return null;
  end if;
  if exists (select 1 from ct_rt_legs l join ct_round_trips r on r.id = l.rt_id
             where l.order_id = new.id and r.status <> 'cancelled') then
    return null;
  end if;
  delete from ct_rt_legs l using ct_round_trips r
   where l.order_id = new.id and r.id = l.rt_id and r.status = 'cancelled';
  get diagnostics leg_rows = row_count;
  if leg_rows > 0 then
    perform rt_sync_audit('delete', 'ct_rt_legs', new.id::text,
      jsonb_build_object('order_id', new.id), jsonb_build_object('reason', 'stale leg on a cancelled round trip freed (033)'));
  end if;

  new_type := case when coalesce(new.is_partner_trip, false) then 'PARTNER' else 'OWNED' end;
  dir      := case when new.direction = 'Import' then 'IMPORT' else 'EXPORT' end;

  with recursive walk as (
    select new.id as node, 0 as depth
    union
    select n.id, w.depth + 1
    from walk w
    join orders cur on cur.id = w.node
    join orders n on n.deleted_at is null and n.id <> cur.id and (
         (cur.group_id is not null and split_part(n.group_id,'|',1) = split_part(cur.group_id,'|',1))
      or (cur.matched_import_id is not null and n.legacy_id = cur.matched_import_id)
      or (n.matched_import_id is not null and n.matched_import_id = cur.legacy_id)
      or (cur.rotation_id is not null and n.legacy_id = cur.rotation_id)
      or (n.rotation_id is not null and n.rotation_id = cur.legacy_id))
    where w.depth < 6
  )
  select count(distinct r.id), string_agg(distinct r.id::text, ',')
    into n_targets, target_ids
  from walk w
  join ct_rt_legs l on l.order_id = w.node
  join ct_round_trips r on r.id = l.rt_id
  where w.node <> new.id and r.status <> 'cancelled';

  if n_targets > 1 then
    perform rt_sync_audit('update', 'orders', new.id::text, null,
      jsonb_build_object('conflict', true, 'rt_ids', target_ids,
                         'reason', 'conflict: related orders sit on more than one live round trip — not merged (033)'));
    return null;
  end if;

  if n_targets = 1 then
    select * into target from ct_round_trips where id = target_ids::bigint;
    if target.trip_type = new_type
       and (new_type = 'PARTNER' or target.truck_id is null or target.truck_id = new.truck_id)
       and (new_type = 'OWNED'   or target.partner_id is null or target.partner_id = new.partner_id) then
      select coalesce(max(seq), 0) + 1 into next_seq from ct_rt_legs where rt_id = target.id;
      insert into ct_rt_legs (rt_id, direction, order_id, seq)
      values (target.id, dir, new.id, next_seq)
      on conflict (order_id) where order_id is not null do nothing;
      get diagnostics leg_rows = row_count;
      if leg_rows = 0 then return null; end if;

      perform rt_sync_audit('update', 'ct_round_trips', target.id::text, null,
        jsonb_build_object('leg_order', new.id, 'direction', dir, 'seq', next_seq,
                           'reason', 'related order attached to the pair/group round trip (033)'));

      if target.status in ('closed', 'complete') and new.status <> 'Delivered' then
        update ct_round_trips set status = 'planned', closed_at = null, updated_at = now() where id = target.id;
        perform rt_sync_audit('update', 'ct_round_trips', target.id::text,
          jsonb_build_object('status', target.status),
          jsonb_build_object('status', 'planned', 'reason', 'reopened: leg ' || new.id || ' not yet delivered (033)'));
      end if;
      return null;
    end if;
    reason := 'related round trip ' || target.code || ' runs another vehicle — separate trip (033)';
  else
    reason := 'no related round trip — first executed order of its pair/group (033)';
  end if;

  d_start := coalesce(new.loading_datetime, new.actual_delivery_date, new.delivery_datetime, current_date);
  d_end   := coalesce(new.actual_delivery_date, new.delivery_datetime);
  if d_end is not null and d_end < d_start then d_end := null; end if;
  init_status := case when new.status = 'Delivered' then 'closed' else 'planned' end;

  insert into ct_round_trips
    (scope, trip_type, truck_id, trailer_id, driver_id, partner_id,
     date_start, date_end, status, source, created_by)
  values
    ('INTL', new_type,
     case when new_type = 'OWNED' then new.truck_id else null end,
     case when new_type = 'OWNED' then new.trailer_id else null end,
     case when new_type = 'OWNED' then new.driver_id else null end,
     case when new_type = 'PARTNER' then new.partner_id else null end,
     d_start, d_end, init_status, 'planner', 'trigger:rt_create')
  returning id into new_rt_id;

  insert into ct_rt_legs (rt_id, direction, order_id, seq)
  values (new_rt_id, dir, new.id, 1)
  on conflict (order_id) where order_id is not null do nothing;
  get diagnostics leg_rows = row_count;

  if leg_rows = 0 then
    delete from ct_round_trips where id = new_rt_id;
    perform rt_sync_audit('delete', 'ct_round_trips', new_rt_id::text,
      jsonb_build_object('order_id', new.id, 'reason', 'lost race for the leg — another process attached it first'), null);
    return null;
  end if;

  perform rt_sync_audit('create', 'ct_round_trips', new_rt_id::text, null,
    jsonb_build_object('scope', 'INTL', 'trip_type', new_type, 'date_start', d_start, 'date_end', d_end,
                       'status', init_status, 'source_order', new.id, 'reason', reason));
  return null;
end $function$
;
CREATE OR REPLACE FUNCTION public.rt_link_split()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  own_rt bigint; other_ids text; n_other int; other_rt ct_round_trips%rowtype; own ct_round_trips%rowtype;
  own_exp boolean; own_imp boolean; oth_exp boolean; oth_imp boolean;
begin
  if new.deleted_at is not null or new.status = 'Cancelled' then return null; end if;
  select r.id into own_rt from ct_rt_legs l join ct_round_trips r on r.id = l.rt_id
   where l.order_id = new.id and r.status <> 'cancelled' limit 1;
  if own_rt is null then return null; end if;   -- 033's territory

  with recursive walk as (
    select new.id as node, 0 as depth
    union
    select n.id, w.depth + 1
    from walk w
    join orders cur on cur.id = w.node
    join orders n on n.deleted_at is null and n.id <> cur.id and (
         (cur.group_id is not null and split_part(n.group_id,'|',1) = split_part(cur.group_id,'|',1))
      or (cur.matched_import_id is not null and n.legacy_id = cur.matched_import_id)
      or (n.matched_import_id is not null and n.matched_import_id = cur.legacy_id)
      or (cur.rotation_id is not null and n.legacy_id = cur.rotation_id)
      or (n.rotation_id is not null and n.rotation_id = cur.legacy_id))
    where w.depth < 6
  )
  select count(distinct r.id), string_agg(distinct r.id::text, ',')
    into n_other, other_ids
  from walk w join ct_rt_legs l on l.order_id = w.node join ct_round_trips r on r.id = l.rt_id
  where w.node <> new.id and r.status <> 'cancelled' and r.id <> own_rt;
  if coalesce(n_other, 0) = 0 then return null; end if;

  perform rt_sync_audit('update', 'orders', new.id::text, null,
    jsonb_build_object('split', true, 'own_rt', own_rt, 'other_rt_ids', other_ids,
                       'reason', 'split: related orders sit on another live round trip than this order''s (037)'));

  -- Automatic merge (owner 19/9), only for the one shape that is provably
  -- one trip — same vehicle, one RT export-only, the other import-only.
  -- Everything else stays the audit row above, for a human. The older RT
  -- keeps its code (least id) so cost lines and the payroll line already
  -- entered on the export side stay where the accountant saw them.
  if n_other = 1 then
    select * into own from ct_round_trips where id = own_rt;
    select * into other_rt from ct_round_trips where id = other_ids::bigint;
    select bool_or(direction = 'EXPORT'), bool_or(direction = 'IMPORT') into own_exp, own_imp from ct_rt_legs where rt_id = own.id;
    select bool_or(direction = 'EXPORT'), bool_or(direction = 'IMPORT') into oth_exp, oth_imp from ct_rt_legs where rt_id = other_rt.id;
    if own.trip_type = other_rt.trip_type and own.truck_id is not distinct from other_rt.truck_id
       and own.partner_id is not distinct from other_rt.partner_id
       and ((own_exp and not own_imp and oth_imp and not oth_exp) or (own_imp and not own_exp and oth_exp and not oth_imp)) then
      perform rt_merge(least(own.id, other_rt.id), greatest(own.id, other_rt.id), 'link written after both sides had a round trip (rt_link_split)');
    end if;
  end if;
  return null;
end $function$
;
CREATE OR REPLACE FUNCTION public.rt_merge(p_keep bigint, p_drop bigint, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  k ct_round_trips%rowtype; d ct_round_trips%rowtype;
  n_legs int; n_lines int; base_seq smallint; live_drop dl_entries%rowtype;
begin
  if p_keep = p_drop then raise exception 'rt_merge: keep = drop (%)', p_keep; end if;
  select * into k from ct_round_trips where id = p_keep for update;
  select * into d from ct_round_trips where id = p_drop for update;
  if k.id is null or d.id is null then raise exception 'rt_merge: round trip missing (% / %)', p_keep, p_drop; end if;
  if k.status = 'cancelled' or d.status = 'cancelled' then
    raise exception 'rt_merge: % is cancelled — nothing to merge', case when k.status = 'cancelled' then k.code else d.code end;
  end if;
  -- one physical trip = one vehicle: never merge across trucks or owned↔partner
  if k.trip_type <> d.trip_type
     or (k.trip_type = 'OWNED'   and k.truck_id   is distinct from d.truck_id)
     or (k.trip_type = 'PARTNER' and k.partner_id is distinct from d.partner_id) then
    raise exception 'rt_merge: % and % run different vehicles — separate trips', k.code, d.code;
  end if;

  -- 1. legs: append after keep's last seq, in drop's own order
  select coalesce(max(seq), 0) into base_seq from ct_rt_legs where rt_id = p_keep;
  with moved as (
    select id, row_number() over (order by seq nulls last, id) as rn from ct_rt_legs where rt_id = p_drop
  )
  update ct_rt_legs l set rt_id = p_keep, seq = base_seq + m.rn from moved m where m.id = l.id;
  get diagnostics n_legs = row_count;
  -- rt_sync_legs (013) fires only on insert/delete, so an UPDATE of rt_id
  -- syncs nothing on its own: the vehicle is identical by the guard above,
  -- and the window is recomputed explicitly below.

  -- 2. cost lines follow the trip
  update ct_cost_lines set rt_id = p_keep where rt_id = p_drop;
  get diagnostics n_lines = row_count;

  -- 3. drop is cancelled, never deleted. dl_sync_from_rt (011) then handles
  --    its payroll line: no amounts → soft-delete with reason; amounts →
  --    needs_review (the money stays on the driver, visibly, never summed
  --    into keep's line by this function).
  select * into live_drop from dl_entries where rt_id = p_drop and deleted_at is null limit 1;
  update ct_round_trips
     set status = 'cancelled', updated_at = now(),
         notes = concat_ws(' · ', notes, 'συγχωνεύθηκε στο ' || k.code || ' ' || to_char(now(), 'DD/MM/YYYY') || ' (037): ' || p_reason)
   where id = p_drop;
  if live_drop.id is not null and (live_drop.trip_value is not null or live_drop.advance is not null or live_drop.expenses is not null) then
    -- keep's line must say where the second set of amounts lives (αρχή 1)
    update dl_entries set needs_review = true,
      review_note = concat_ws(' · ', review_note, 'συγχώνευση ' || d.code || '→' || k.code || ': η γραμμή #' || live_drop.id || ' του ' || d.code || ' έχει ποσά — έλεγξε, δεν αθροίστηκαν (037)'),
      updated_at = now()
    where rt_id = p_keep and deleted_at is null;
  end if;

  -- 4. keep: window from all legs (013); reopen only for a not-yet-delivered leg (033 rule)
  perform rt_recompute(p_keep);
  if k.status in ('closed', 'complete') and exists (
       select 1 from ct_rt_legs l join orders o on o.id = l.order_id
       where l.rt_id = p_keep and o.status <> 'Delivered') then
    update ct_round_trips set status = 'planned', closed_at = null, updated_at = now() where id = p_keep;
  end if;

  perform rt_sync_audit('update', 'ct_round_trips', p_keep::text,
    jsonb_build_object('legs_before', base_seq),
    jsonb_build_object('merged_from', d.code, 'legs_moved', n_legs, 'cost_lines_moved', n_lines,
                       'drop_ledger_entry', live_drop.id, 'reason', 'merged ' || d.code || ' into ' || k.code || ' (037): ' || p_reason));
  perform rt_sync_audit('update', 'ct_round_trips', p_drop::text,
    jsonb_build_object('status', d.status), jsonb_build_object('status', 'cancelled', 'merged_into', k.code, 'reason', 'merged into ' || k.code || ' (037)'));
end $function$
;
DROP TRIGGER IF EXISTS rt_create_from_order ON public.orders;
DROP TRIGGER IF EXISTS rt_link_split ON public.orders;
CREATE TRIGGER rt_create_from_order AFTER INSERT OR UPDATE OF status, truck_id, partner_id, driver_id, trailer_id, loading_datetime, delivery_datetime, group_id, matched_import_id, rotation_id, is_partner_trip ON public.orders FOR EACH ROW EXECUTE FUNCTION rt_create_from_order();
CREATE TRIGGER rt_link_split AFTER UPDATE OF matched_import_id, group_id, rotation_id ON public.orders FOR EACH ROW WHEN (((old.matched_import_id IS DISTINCT FROM new.matched_import_id) OR (old.group_id IS DISTINCT FROM new.group_id) OR (old.rotation_id IS DISTINCT FROM new.rotation_id))) EXECUTE FUNCTION rt_link_split();
