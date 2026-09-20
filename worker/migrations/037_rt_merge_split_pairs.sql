-- 037 — rt_merge(): one physical round trip that was born as TWO round trips
--        (export on one, its matched import on the other) becomes one.
--        + audit of every such split the moment it appears (rt_link_split).
--
-- ΕΓΚΕΚΡΙΜΕΝΗ 19/9/2026, ΕΠΙΒΕΒΑΙΩΣΗ owner 20/9/2026 (μέσω συντονιστή):
-- αυτόματη συγχώνευση ΜΟΝΟ στη στενή περίπτωση (ίδιο όχημα + δεσμός + ένα RT
-- μόνο-EXPORT / άλλο μόνο-IMPORT), κάθε άλλη περίπτωση audit «split»·
-- backfill rt_merge(133,159). ΔΕΝ ΕΧΕΙ ΤΡΕΞΕΙ — εκτελεί ΜΟΝΟ ο owner, Supabase
-- SQL editor, μετά τις 15:00, αφού τρέξει τα SELECT «ΠΡΙΝ» και επιβεβαιώσει
-- ότι το ζεύγος του backfill είναι ακόμη όπως μετρήθηκε 19/9. Τρέχει ΜΟΝΗ της:
-- η 034 (εθνικά) δεν εγκρίθηκε 20/9, καμία 038 δεν υπάρχει.
--
-- WHY (measured 19/9/2026, session «Έξοδα w10», full numbers in
-- docs/data-audit/2026-09/2026-09-19-w10-expenses.md):
--   103 live INTL round trips: 66 carry export+import, 28 export only,
--   9 import only. Of 24 same-truck pairs with overlapping/adjacent windows,
--   23 are two DIFFERENT cycles (each already has its export and its return;
--   the overlap is lagging delivery dates). ONE pair is a real cycle cut in
--   two: RT-1133 (export, closed, 6 cost lines) + RT-1159 (its matched import,
--   0 lines). Both were created by 031 («standalone») before 033; 033's
--   backfill skipped them because each already had a live leg.
--
-- The mechanism that will produce the next one (033 gap): the pair link is
-- written on the EXPORT row (orders.matched_import_id) — usually AFTER the
-- import already got its truck and therefore its own RT. rt_create_from_order
-- then fires on the export, sees «a leg on a live RT ends here» and returns
-- BEFORE the relation walk. Nobody re-evaluates, nothing is logged (αρχή 1).
--
-- Rejected (owner brief 19/9 asked for it): a date rule «import of the same
-- truck loading ≤ N days after the export's delivery → attach». 23 of the 24
-- pairs are consecutive cycles 1–3 days apart; any N would merge different
-- trips, and dates are exactly the field that lags. The key stays the link.
--
-- What this migration does:
--   1. rt_merge(keep, drop, reason) — the ONLY way two RTs become one:
--      legs move (seq continues), ct_cost_lines.rt_id moves, the dropped RT
--      is CANCELLED (never deleted: dl_entries.rt_id has no ON DELETE), its
--      payroll line follows the 011 rule (no amounts → soft-deleted with
--      reason; amounts → needs_review, never summed silently), keep is
--      recomputed (013) and reopened only if it now holds a not-Delivered leg
--      (033 rule). Every step writes an audit row with reason '(037)'.
--   2. rt_link_split — AFTER UPDATE OF matched_import_id/group_id/rotation_id
--      on orders: when the order already sits on a live RT and a related
--      order sits on ANOTHER live RT of the same vehicle, writes an audit row
--      'split: …' (today: silence) and, ONLY for the one shape that is
--      provably one trip — same vehicle, one RT export-only, the other
--      import-only — calls rt_merge (owner decision 19/9). Any other shape
--      (two full cycles, three RTs, other truck) stays an audit row for a
--      human: never merged on a guess.
--   3. Backfill: rt_merge(133, 159) guarded by the exact state measured 19/9;
--      any deviation raises and the transaction rolls back.

begin;

create or replace function rt_merge(p_keep bigint, p_drop bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
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
end $$;

-- ── 2. The split becomes audible the moment the link is written ──────────
-- Same relation walk as 033 (group_id, matched_import_id ⇄ legacy_id,
-- rotation_id ⇄ legacy_id, both ways, depth ≤ 6). Runs AFTER rt_create_from_order
-- («rt_c…» < «rt_l…», Postgres fires same-event AFTER triggers alphabetically),
-- so an order that had no leg was attached by 033 first and this finds one RT.
create or replace function rt_link_split() returns trigger
language plpgsql security definer set search_path = public as $$
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
         (cur.group_id is not null and n.group_id = cur.group_id)
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
end $$;

drop trigger if exists rt_link_split on orders;
create trigger rt_link_split
  after update of matched_import_id, group_id, rotation_id on orders
  for each row
  when (old.matched_import_id is distinct from new.matched_import_id
     or old.group_id is distinct from new.group_id
     or old.rotation_id is distinct from new.rotation_id)
  execute function rt_link_split();

-- ── 3. Backfill: the one pair measured 19/9 — guarded, or the whole run fails ──
do $$
declare ok boolean;
begin
  select (select count(*) = 1 from ct_rt_legs where rt_id = 133 and order_id = 282 and direction = 'EXPORT')
     and (select count(*) = 1 from ct_rt_legs where rt_id = 133)
     and (select count(*) = 1 from ct_rt_legs where rt_id = 159 and order_id = 339 and direction = 'IMPORT')
     and (select count(*) = 1 from ct_rt_legs where rt_id = 159)
     and (select status <> 'cancelled' from ct_round_trips where id = 133)
     and (select status <> 'cancelled' from ct_round_trips where id = 159)
     and (select matched_import_id = 'recpcl5vUdtk21391' from orders where id = 282)
     and (select legacy_id = 'recpcl5vUdtk21391' from orders where id = 339)
     and (select truck_id from ct_round_trips where id = 133) = (select truck_id from ct_round_trips where id = 159)
    into ok;
  if not ok then
    raise exception '037 backfill: RT-1133/RT-1159 are not in the state measured 19/9 — re-measure before merging';
  end if;
  perform rt_merge(133, 159, 'export 282 and its matched import 339 were born on two round trips by 031');
end $$;

commit;

-- ═══ ΠΡΙΝ (τρέξε πρώτα, μόνο ανάγνωση) — αναμενόμενα 19/9 ═══
-- select r.code, r.status, l.order_id, l.direction, l.seq from ct_round_trips r join ct_rt_legs l on l.rt_id = r.id
--  where r.id in (133,159) order by r.id, l.seq;                       -- 133: 282 EXPORT 1 · 159: 339 IMPORT 1
-- select rt_id, count(*) from ct_cost_lines where rt_id in (133,159) group by 1;   -- 133: 6 · 159: 0 γραμμές
-- select id, rt_id, trip_value, advance, expenses, deleted_at from dl_entries where rt_id in (133,159);
--                                                                      -- 133: μία ζωντανή με μόνο expenses · 159: μία ζωντανή, όλα NULL
-- ═══ ΜΕΤΑ ═══
-- 1. select r.code, r.status, r.date_start, r.date_end, l.order_id, l.direction, l.seq
--    from ct_round_trips r join ct_rt_legs l on l.rt_id = r.id where r.id in (133,159) order by r.id, l.seq;
--    -- 133: 282 EXPORT 1, 339 IMPORT 2 · παράθυρο 8/9 → 14/9 · status closed (και τα δύο Delivered) · 159: καμία γραμμή
-- 2. select id, status, notes from ct_round_trips where id = 159;         -- cancelled, notes «συγχωνεύθηκε στο RT-1133 …»
-- 3. select rt_id, count(*) from ct_cost_lines where rt_id in (133,159) group by 1;   -- 133: 6 · 159: —
-- 4. select id, rt_id, expenses, needs_review, deleted_at, deleted_reason from dl_entries where rt_id in (133,159);
--    -- 133: ζωντανή, needs_review false · 159: deleted_at set, reason «RT RT-1159 ακυρώθηκε»
-- 5. select count(*) from dl_v_rt_gap;                                    -- 0
-- 6. select action, record_id, after_data->>'reason' from audit_log
--    where actor = 'trigger:rt_sync' and after_data->>'reason' like '%(037)%' and created_at > now() - interval '10 minutes';
--    -- 2 γραμμές: merged RT-1159 into RT-1133 · merged into RT-1133
-- 7. Ξανά το SELECT «γνήσια κομμένα ζεύγη» του audit doc §2 → 0 γραμμές.
