-- 072 - NATIONAL v5, PHASE F2: THE plan_* FUNCTIONS, BORN CLOSED, 0 ROWS.
--
-- DRAFT. Spec docs/superpowers/specs/2026-10-21-national-v5-design.md (owner 21/10), plan
-- docs/superpowers/plans/2026-10-22-f2-national-v5-plan-functions.md. The owner runs it in the Supabase SQL editor AFTER
-- 15:00 (the team works 05:30-14:30), with an explicit yes, in this order:
--   0. 071_plan_schema_fingerprint.sql    read-only (keep the row)
--   1. 072_plan_functions_dryrun.sql      this block + a deliberate error: NOTHING kept
--   2. 072_plan_functions.sql             (this file)
--   3. 072_plan_functions_verify.sql      read-only, one row
--   4. 071_plan_schema_fingerprint.sql    again: the same md5s as in step 0
--   5. 072_plan_functions_test.sql        OPTIONAL on production (advances the RT- code sequence): the rules on
--                                         TEST rows, ends in a deliberate error, nothing kept
-- ASCII only (clipboard-safe; Greek notice texts are base64, as 060). ONE DO block = ONE statement: an error
-- anywhere undoes all of it.
--
-- WHAT IT ADDS: functions only. No table, no column, no trigger (B-54 stays), no change to any existing function
-- (each one 072 relies on is guarded by the md5 of its LIVE text below). Every write of the v5 model goes through
-- a public plan_* (SECURITY DEFINER, SET search_path = public, owner postgres, p_actor + p_role, one audit_log row
-- per changed row, RETURNS jsonb, EXECUTE to service_role only). The internal helpers plan_h_* are closed to
-- everyone, like the *_problem helpers of 071. A refusal: SQLSTATE 23514, HINT 'plan:<code>'.
-- Parts (ASCII markers; each task inserts above them, never rewrites): 0 guards, 1 helpers, 2 section A (orders,
-- put, group, split, move, order update), 3 section B (cycle, delete, VS, local loading), 4 notices and reads,
-- 5 rights and proofs.
--
-- REVERSE: 072_plan_functions_rollback.sql (refuses if any v5 row exists).
-- EXPECTED: NOTICE "072 OK: ..." and ONE row: result = '072 OK', public_functions = 16 (15 without decision 21),
--   public_triggers = 46, b54_red_value = 46, v5_rows = 0, v5_cycles = 0 (plan_functions = 6 + the 072 ones).

DO $do$
DECLARE
  v_g record; v_trg0 int; v_trg1 int; v_rows0 bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS (read only).
  IF to_regclass('public.shipments') IS NULL OR to_regclass('public.rt_stops') IS NULL
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
          AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once')) <> 2 THEN
    RAISE EXCEPTION '072: 071 and 071b must be applied first';
  END IF;
  IF to_regprocedure('public.plan_h_raise(text,text)') IS NOT NULL THEN
    RAISE EXCEPTION '072: already applied (plan_h_raise exists) - run 072_plan_functions_verify.sql instead';
  END IF;
  -- Every existing function 072 relies on, as the LIVE text read 22/10 and again 23/10 and 24/10 (md5 of prosrc). Any
  -- difference = stop: the behaviour the plan_* below were written against is not the one in production any more.
  -- The SAME list is proved again in PART 5 (tests/sql-072-drafts.test.js wants every pair exactly twice).
  FOR v_g IN SELECT * FROM (VALUES
      ('public.dl_sync_from_rt()', '331cea3a8987b74a9b0add698df9b158'),
      ('public.dl_local_day_sync(bigint,date)', '151dab06e2676f3c8885d7298d0ac6af'),
      ('public.dl_sync_from_local_move()', 'f053c478c79ef55dcc62b65a61939b9b'),
      ('public.local_moves_before()', '3b9f0a27c9921c63ce9fb41f09ef0462'),
      ('public.dl_local_line_guard()', 'e7f0348ccc5764d29608b8701f0e83b6'),
      ('public.dl_cash_sync_entry()', '6d702bad6485f06535c6a0d5aff0bd0c'),
      ('public.order_cd_stop_follow()', '433a1a7205fceb264e77f5a0c71a1521'),
      ('public.ramp_follows_stop()', '6fa6a83c4191af271dbae85935d710c5'),
      ('public.invoice_mark_guard()', 'dd975c4f04f95f528c7c79a80eb4d387'),
      ('public.stock_guard_natl()', 'e941edbca9ff1bbeba0c89d49eb71cb3'),
      ('public.stock_guard_orders()', '63aa751d93cc8b34afa5587912de7045'),
      ('public.national_orders_soft_delete_cascade()', '6c423b14397c659272b1c9256189933d'),
      ('public.rt_status_guard()', 'd7757f99c3443ac167d5bdaf3e34b142'),
      ('public.plan_chk()', '8f2fa7e5541aded2dffc853a57c54c22'),
      ('public.plan_rt_window_sync()', '050cbabe34493018f4335f748029761e'),
      ('public.plan_rt_problem(bigint)', 'f383f449d55e657cfa929bb51a9120f6'),
      ('public.plan_shipment_problem(bigint)', '8dd2beb159142bf5a6a4e32688688875'),
      ('public.plan_leg_problem(bigint)', '24803f176f12355faa84c07e43cb0df0'),
      ('public.plan_local_loading_problem(bigint)', '4c3dbec3810121a2a585fe8b49ceadf1'),
      ('public.ct_rt_legs_v2_guard()', '6240d699bc114ffd49c7d62780432c94'),
      ('public.rt_sync_to_orders()', 'a63234c844c2b6236b1e6dfe1410b8fc'),
      ('public.rt_sync_to_national_loads()', '028efb76373a0a6517134feaea88bc2f')
    ) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '072: % is not the live text read 22/10 (expected md5 %) - stop, re-measure', v_g.sig, v_g.m;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'plan\_%') <> 6 THEN
    RAISE EXCEPTION '072: expected exactly the 6 plan_* functions of 071 - stop, re-measure';
  END IF;
  SELECT (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces)
       + (SELECT count(*) FROM public.rt_stops) + (SELECT count(*) FROM public.piece_legs)
       + (SELECT count(*) FROM public.plan_notices) + (SELECT count(*) FROM public.ct_round_trips WHERE model = 2)
    INTO v_rows0;
  IF v_rows0 <> 0 THEN
    RAISE EXCEPTION '072: % v5 row(s) exist before 072 - stop (the plan was measured on 0)', v_rows0;
  END IF;
  IF (SELECT count(*) FROM public.locations WHERE is_hub) <> 1 THEN
    RAISE EXCEPTION '072: the hub is not exactly one location';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = v_trg0 AND baseline IS NULL) THEN
    RAISE EXCEPTION '072: B-54 red_value is not the live trigger count % - re-measure', v_trg0;
  END IF;

  -- 1. HELPERS (plan_h_*: closed to every API role, called only by the plan_* below, owner postgres).
  CREATE FUNCTION public.plan_h_raise(p_code text, p_detail text) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
begin
  -- One shape for every refusal of plan_* (spec 2.1, the same as 071's plan_chk): SQLSTATE 23514, HINT
  -- 'plan:<code>'. The Worker puts what follows "<code>:" in brackets after its Greek text, so the detail is
  -- ASCII only (ids, codes, dates), never user text.
  raise exception 'plan rule broken: %:%', p_code, coalesce(p_detail, '')
    using errcode = '23514', hint = 'plan:' || p_code;
end
$f$;

  CREATE FUNCTION public.plan_h_ctx(p_actor text, p_role text) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
begin
  -- Who (decision 1): audit_log.role is NOT NULL and the auditor tells people from machines by it. The
  -- RIGHTS live only in the Worker's PLAN_PERMS (one source); the base uses the role for the audit row and to
  -- decide whether money is shown (decision 9).
  if coalesce(btrim(p_actor), '') = '' then perform plan_h_raise('no_actor', 'actor'); end if;
  if p_role is null or p_role not in ('owner', 'dispatcher', 'management', 'accountant', 'warehouse') then
    perform plan_h_raise('no_actor', 'role');
  end if;
  -- Each plan_* is one transaction of its own through PostgREST, where the 071 rules start DEFERRED. A caller
  -- that ran an earlier plan_* in the same transaction (the rules test does) left them IMMEDIATE (plan_h_finish):
  -- deferring again here makes every call see the same thing, whoever calls it.
  set constraints all deferred;
end
$f$;

  CREATE FUNCTION public.plan_h_keys(p jsonb, p_allowed text[], p_what text) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
declare k text;
begin
  -- An unknown key is refused, never ignored (principle 1: the facade's silent drop of unknown fields cost 10
  -- findings). The key is named in the detail only when it is a plain ASCII name.
  if p is null or jsonb_typeof(p) <> 'object' then perform plan_h_raise('bad_input', p_what); end if;
  select x into k from jsonb_object_keys(p) x where not (x = any (p_allowed)) order by x limit 1;
  if k is not null then
    perform plan_h_raise('bad_input', p_what || '.' || case when k ~ '^[A-Za-z0-9_]+$' then k else '?' end);
  end if;
end
$f$;

  CREATE FUNCTION public.plan_h_replay(p jsonb, p_op text, p_actor text) RETURNS jsonb
    LANGUAGE plpgsql SET search_path = public AS $f$
declare v_rid text; a audit_log%rowtype;
begin
  -- Decision 44 (owner 23/10): a creation (plan_orders_create, plan_split_piece, plan_local_loading) carries the
  -- screen's request_id (a uuid, one per open form). It is REQUIRED (review of PR #84): without it a lost answer
  -- could only be retried as a second creation, so a missing id is refused (request_missing), never a silent pass.
  -- Sent again - an answer lost after the COMMIT, the button pressed once more - it returns the FIRST call's answer
  -- (+ replayed) and writes nothing. The same request_id with another body, for another act or from another person
  -- (the JWT user, p_actor) is refused (request_reused): never the first answer for a request that was not that
  -- one, and never one person's ids to another. The record is ONE audit_log row (table_name 'plan_request', record_id = the request_id), written in the
  -- same transaction as the writes (an undone call leaves none) and found through audit_log_record_idx: no new
  -- table (072 adds none), no second trace beside the audit. Called right after plan_h_keys, before any state is
  -- read, so a repeat is never refused by what the first call did (piece_split, local_exists). NULL = go on.
  if not (p ? 'request_id') then perform plan_h_raise('request_missing', p_op); end if;
  if jsonb_typeof(p->'request_id') is distinct from 'string'
     or (p->>'request_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform plan_h_raise('bad_input', 'request_id');
  end if;
  v_rid := lower(p->>'request_id');
  -- two tabs sending the same request at once: the second waits here for the first one's COMMIT, then finds it
  perform pg_advisory_xact_lock(hashtextextended('plan_request:' || v_rid, 0));
  select * into a from audit_log where record_id = v_rid and table_name = 'plan_request' order by id limit 1;
  if a.id is null then return null; end if;
  if a.after_data->>'op' is distinct from p_op or a.actor is distinct from p_actor
     or a.after_data->>'body_md5' is distinct from md5((p - 'request_id')::text) then
    perform plan_h_raise('request_reused', v_rid);
  end if;
  return (a.after_data->'answer') || jsonb_build_object('replayed', true);
end
$f$;

  CREATE FUNCTION public.plan_h_remember(p jsonb, p_op text, p_answer jsonb, p_actor text, p_role text) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
begin
  -- Decision 44: the record plan_h_replay finds (plan_h_replay already refused a creation without request_id).
  -- Called after the writes and before plan_h_finish, so a rule that refuses at the end undoes it with them.
  perform plan_h_audit(p_actor, p_role, 'create', 'plan_request', lower(p->>'request_id'), null,
                       jsonb_build_object('op', p_op, 'request_id', lower(p->>'request_id'),
                                          'body_md5', md5((p - 'request_id')::text), 'answer', p_answer));
end
$f$;

  CREATE FUNCTION public.plan_h_audit(p_actor text, p_role text, p_action text, p_table text, p_id text,
                                      p_before jsonb, p_after jsonb) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
begin
  -- One audit_log row per changed row, the actor being the person (spec 2.1), never 'trigger:'.
  insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
  values (p_actor, p_role, p_action, p_table, p_id, p_before, p_after, now());
end
$f$;

  CREATE FUNCTION public.plan_h_location(p_location bigint) RETURNS bigint
    LANGUAGE plpgsql SET search_path = public AS $f$
begin
  if p_location is null or not exists (select 1 from locations where id = p_location and deleted_at is null) then
    perform plan_h_raise('bad_input', 'location:' || coalesce(p_location::text, 'null'));
  end if;
  return p_location;
end
$f$;

  CREATE FUNCTION public.plan_h_stop_add(p_rt bigint, p_location bigint, p_side text, p_from timestamptz,
                                         p_to timestamptz, p_actor text, p_role text) RETURNS bigint
    LANGUAGE plpgsql SET search_path = public AS $f$
declare s rt_stops%rowtype; v_seq int;
begin
  if p_side is null or p_side not in ('KATHODOS', 'ANODOS') then perform plan_h_raise('bad_input', 'stop.side'); end if;
  if p_from is null or p_to is null then perform plan_h_raise('bad_input', 'stop.planned'); end if;
  -- coordinator 25/10 (cross-cutting input rule): 'infinity' / '-infinity' are valid timestamptz input and were
  -- written as they are (a stop without end stretches its cycle's window and falls out of every day read)
  if not (isfinite(p_from) and isfinite(p_to)) then perform plan_h_raise('bad_input', 'stop.planned:finite'); end if;
  perform plan_h_location(p_location);
  -- A provisional seq after the live ones; plan_h_reseq gives the final order (decision 5).
  select coalesce(max(seq), 0) + 1 into v_seq from rt_stops where rt_id = p_rt and deleted_at is null;
  insert into rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
  values (p_rt, v_seq, p_location, p_side, p_from, p_to, p_actor) returning * into s;
  perform plan_h_audit(p_actor, p_role, 'create', 'rt_stops', s.id::text, null, to_jsonb(s));
  return s.id;
end
$f$;

  CREATE FUNCTION public.plan_h_reseq(p_rt bigint, p_actor text, p_role text) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
declare r record;
begin
  -- Decision 5: the base alone writes seq - KATHODOS before ANODOS, then by planned_from. A stop that does not
  -- fit that order in time is refused at the end by 071 (stop_order / leg_order), never silently re-dated.
  for r in select s.id, s.seq,
                  row_number() over (order by (s.side = 'ANODOS'), s.planned_from, s.seq, s.id) as rn
             from rt_stops s where s.rt_id = p_rt and s.deleted_at is null loop
    if r.seq <> r.rn then
      update rt_stops set seq = r.rn where id = r.id;
      perform plan_h_audit(p_actor, p_role, 'update', 'rt_stops', r.id::text,
                           jsonb_build_object('seq', r.seq), jsonb_build_object('seq', r.rn));
    end if;
  end loop;
end
$f$;

  CREATE FUNCTION public.plan_h_target(p_target jsonb, p_stops jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SET search_path = public AS $f$
declare
  r ct_round_trips%rowtype; v_rt bigint; v_side text; s jsonb; v_ref text; v_id bigint; v_map jsonb := '{}';
begin
  -- Resolves a target {rt_id, side} or {new_rt, side} and the request's stops into {rt_id, side, stops: {ref:
  -- stop_id}}: existing live stops by stop_id, new ones created (decision 4: the base invents no stop and no hour).
  perform plan_h_keys(p_target, array['rt_id', 'side', 'new_rt'], 'target');
  v_side := p_target->>'side';
  if v_side is null or v_side not in ('KATHODOS', 'ANODOS') then perform plan_h_raise('bad_input', 'target.side'); end if;
  if p_target ? 'new_rt' then
    if p_target ? 'rt_id' then perform plan_h_raise('bad_input', 'target: rt_id and new_rt'); end if;
    -- Decision 3: the cycle is born from this assignment only, in the caller's transaction. plan_rt_create is
    -- section B's (Task B1) and late-bound: until B1 exists this call is 42883, and no case of section A uses it.
    -- It answers this function's shape {rt_id, side, stops} plus code / stop_ids / new / warnings.
    return plan_rt_create(jsonb_build_object('new_rt', p_target->'new_rt', 'side', v_side, 'stops', p_stops),
                          p_actor, p_role);
  end if;
  v_rt := (p_target->>'rt_id')::bigint;
  if v_rt is null then perform plan_h_raise('bad_input', 'target.rt_id'); end if;
  -- One writer per cycle at a time (as rt_merge): two dispatchers on one truck queue here, not at COMMIT.
  select * into r from ct_round_trips where id = v_rt for no key update;
  if r.id is null or r.model <> 2 then perform plan_h_raise('rt_gone', v_rt::text); end if;
  if r.status = 'cancelled' then perform plan_h_raise('rt_cancelled', v_rt::text); end if;
  if p_stops is not null and jsonb_typeof(p_stops) <> 'array' then perform plan_h_raise('bad_input', 'stops'); end if;
  for s in select value from jsonb_array_elements(coalesce(p_stops, '[]')) loop
    perform plan_h_keys(s, array['ref', 'stop_id', 'location_id', 'side', 'planned_from', 'planned_to'], 'stop');
    v_ref := s->>'ref';
    if v_ref is null or v_map ? v_ref then perform plan_h_raise('bad_input', 'stop.ref'); end if;
    if s ? 'stop_id' then
      select id into v_id from rt_stops where id = (s->>'stop_id')::bigint and rt_id = v_rt and deleted_at is null;
      if v_id is null then perform plan_h_raise('stop_gone', s->>'stop_id'); end if;
    else
      v_id := plan_h_stop_add(v_rt, (s->>'location_id')::bigint, coalesce(s->>'side', v_side),
                              (s->>'planned_from')::timestamptz, (s->>'planned_to')::timestamptz, p_actor, p_role);
    end if;
    v_map := v_map || jsonb_build_object(v_ref, v_id);
  end loop;
  return jsonb_build_object('rt_id', v_rt, 'side', v_side, 'stops', v_map);
end
$f$;

  CREATE FUNCTION public.plan_h_stop_at(p_map jsonb, p_location bigint, p_side text) RETURNS bigint
    LANGUAGE plpgsql SET search_path = public AS $f$
declare v_ids bigint[];
begin
  -- Decision 6: a piece's stop is found by place among the request's stops; on the target side first.
  select array_agg(s.id order by (s.side <> p_side), s.id) into v_ids
    from rt_stops s
   where s.id in (select value::bigint from jsonb_each_text(coalesce(p_map, '{}')))
     and s.location_id = p_location and s.deleted_at is null;
  if v_ids is null then return null; end if;
  if array_length(v_ids, 1) > 1
     and (select count(*) from rt_stops where id = any (v_ids) and side = p_side) <> 1 then
    perform plan_h_raise('bad_input', 'stop.ambiguous:' || p_location);
  end if;
  return v_ids[1];
end
$f$;

  CREATE FUNCTION public.plan_h_leg_add(p_piece bigint, p_rt bigint, p_pickup bigint, p_drop bigint,
                                        p_actor text, p_role text, p_leg_no int DEFAULT NULL) RETURNS bigint
    LANGUAGE plpgsql SET search_path = public AS $f$
declare l piece_legs%rowtype; v_no int;
begin
  -- The next live leg number of the piece (a moved leg is soft-deleted first, so its number is free again). A
  -- re-pointed leg keeps its number (p_leg_no, plan_vs_set_place): the chain of the piece does not change.
  v_no := p_leg_no;
  if v_no is null then
    select coalesce(max(leg_no), 0) + 1 into v_no from piece_legs where piece_id = p_piece and deleted_at is null;
  end if;
  insert into piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by)
  values (p_piece, v_no, p_rt, p_pickup, p_drop, p_actor) returning * into l;
  perform plan_h_audit(p_actor, p_role, 'create', 'piece_legs', l.id::text, null, to_jsonb(l));
  -- F3 hook: the pallet feeder of this leg (pl_movements.piece_leg_id, 073) is written here.
  return l.id;
end
$f$;

  CREATE FUNCTION public.plan_h_leg_drop(p_leg bigint, p_reason text, p_actor text, p_role text) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
declare a piece_legs%rowtype; b piece_legs%rowtype;
begin
  -- A leg never changes (071 leg_locked): it is soft-deleted and a new one is written.
  select * into a from piece_legs where id = p_leg and deleted_at is null for no key update;
  if a.id is null then return; end if;
  update piece_legs set deleted_at = now(), deleted_reason = p_reason, deleted_by = p_actor
   where id = p_leg returning * into b;
  perform plan_h_audit(p_actor, p_role, 'delete', 'piece_legs', p_leg::text, to_jsonb(a), to_jsonb(b));
end
$f$;

  CREATE FUNCTION public.plan_h_stops_sweep(p_stops bigint[], p_reason text, p_actor text, p_role text)
    RETURNS bigint[]
    LANGUAGE plpgsql SET search_path = public AS $f$
declare s rt_stops%rowtype; s2 rt_stops%rowtype; lm local_moves%rowtype; v_out bigint[] := '{}';
begin
  -- Decision 4: a stop that lost its last leg in THIS operation goes (soft); a stop declared without a leg stays.
  -- Its loading by a local driver goes with it, in the same transaction (spec 3; 071 local_loading_stop/_gone).
  for s in select * from rt_stops where id = any (p_stops) and deleted_at is null order by id for no key update loop
    if not exists (select 1 from piece_legs where pickup_stop_id = s.id and deleted_at is null) then
      for lm in update local_moves set deleted_at = now()
                 where rt_stop_id = s.id and move_kind = 'nat_loading' and deleted_at is null and status <> 'Cancelled'
                returning * loop
        perform plan_h_audit(p_actor, p_role, 'delete', 'local_moves', lm.id::text,
                             jsonb_build_object('deleted_at', null), jsonb_build_object('deleted_at', lm.deleted_at, 'reason', p_reason));
      end loop;
    end if;
    if not exists (select 1 from piece_legs where (pickup_stop_id = s.id or drop_stop_id = s.id) and deleted_at is null) then
      update rt_stops set deleted_at = now(), deleted_reason = p_reason, deleted_by = p_actor
       where id = s.id returning * into s2;
      perform plan_h_audit(p_actor, p_role, 'delete', 'rt_stops', s.id::text, to_jsonb(s), to_jsonb(s2));
      v_out := v_out || s.id;
    end if;
  end loop;
  return v_out;
end
$f$;

  CREATE FUNCTION public.plan_h_token(p_fn text, p_key text, p_full jsonb) RETURNS text
    LANGUAGE plpgsql STABLE SET search_path = public AS $f$
begin
  -- Decision 7, rewritten after the review of 23/10: the token NEVER hashes an amount. The dispatcher holds the
  -- token and the list without amounts, so an md5 over (that list + the hidden amount) gave the amount back by
  -- trying values, in a fraction of a second. The token is the list as the dispatcher sees it + the row version
  -- (xmin, ctid) of every row whose money is in the list: a changed amount is still stale_confirm, the token is
  -- the same for every role, and it tells nothing about any amount. ctid: a row updated inside the SAME
  -- transaction keeps its xmin but always gets a new ctid. plpgsql: plan_h_strip_amounts is created after this.
  return md5('072|' || p_fn || '|' || p_key || '|' || plan_h_strip_amounts(p_full, 'dispatcher')::text || '|'
    || coalesce((select string_agg('e' || e.id || ':' || e.xmin::text || e.ctid::text, ',' order by e.id) from dl_entries e
                  where e.id in (select (c->>'dl_entry_id')::bigint from jsonb_array_elements(p_full) c
                                  where c ? 'dl_entry_id')), '') || '|'
    || coalesce((select string_agg('c' || l.id || ':' || l.xmin::text || l.ctid::text, ',' order by l.id) from ct_cost_lines l
                  where l.rt_id in (select (c->>'rt_id')::bigint from jsonb_array_elements(p_full) c
                                     where c->>'kind' = 'costs')), '') || '|'
    || coalesce((select string_agg('n' || n.id || ':' || n.xmin::text || n.ctid::text, ',' order by n.id) from national_orders n
                  where n.id in (select (c->>'nat_order_id')::bigint from jsonb_array_elements(p_full) c
                                  where c->>'kind' = 'invoiced')), ''));
end
$f$;

  CREATE FUNCTION public.plan_h_strip_amounts(p jsonb, p_role text) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $f$
begin
  -- Decision 9 / spec 3 Rights: amounts only to owner and accountant; cut here, in one place, so no route can
  -- leak them (the Worker passes the answer through as it is).
  if p_role in ('owner', 'accountant') or p is null then return p; end if;
  if jsonb_typeof(p) = 'object' then
    return (select coalesce(jsonb_object_agg(k, plan_h_strip_amounts(v, p_role)), '{}'::jsonb)
              from jsonb_each(p) t(k, v) where k not in ('amount', 'advance', 'expenses', 'invoice_number'));
  elsif jsonb_typeof(p) = 'array' then
    return (select coalesce(jsonb_agg(plan_h_strip_amounts(v, p_role) order by i), '[]'::jsonb)
              from jsonb_array_elements(p) with ordinality t(v, i));
  end if;
  return p;
end
$f$;

  CREATE FUNCTION public.plan_h_rt_consequences(p_rt bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE SET search_path = public AS $f$
declare v jsonb;
begin
  -- What leaves with a cycle's vehicle or the cycle itself: payroll lines WITH amounts (011's definition:
  -- trip_value, advance or expenses entered) and the cost lines per pay source. Decision 10 (owner 23/10): no
  -- "paid" flag - the base cannot know what was paid (payments are monthly: an optional advance on the 15th and
  -- the settlement on the 1st-5th of the next month, never tied to trips), so the list names the line's month
  -- ('YYYY-MM' of dl_entries.entry_date) and claims nothing more. Full amounts; the caller strips them by role.
  select coalesce(jsonb_agg(x order by x->>'kind', x::text), '[]'::jsonb) into v from (
    select jsonb_build_object('kind', 'payroll_amount', 'rt_id', p_rt, 'dl_entry_id', e.id, 'driver_id', e.driver_id,
             'month', to_char(e.entry_date, 'YYYY-MM'),
             'amount', e.trip_value, 'advance', e.advance, 'expenses', e.expenses) as x
      from dl_entries e
     where e.rt_id = p_rt and e.deleted_at is null
       and (e.trip_value is not null or e.advance is not null or e.expenses is not null)
    union all
    select jsonb_build_object('kind', 'costs', 'rt_id', p_rt, 'pay_source', c.pay_source, 'count', count(*),
                              'amount', sum(c.net + c.vat))
      from ct_cost_lines c where c.rt_id = p_rt group by c.pay_source) t;
  return v;
end
$f$;

  CREATE FUNCTION public.plan_h_notice(p_desk text, p_kind text, p_tpl_b64 text, p_args text[], p_order bigint,
                                       p_nat_order bigint, p_rt bigint, p_actor text, p_role text) RETURNS bigint
    LANGUAGE plpgsql SET search_path = public AS $f$
declare n plan_notices%rowtype;
begin
  -- Decision 25: the base writes the Greek text (base64 template, this file stays ASCII), so the board and the
  -- auditor read the same words.
  insert into plan_notices (to_desk, kind, message, order_id, nat_order_id, rt_id, created_by)
  values (p_desk, p_kind, format(convert_from(decode(p_tpl_b64, 'base64'), 'UTF8'), variadic p_args),
          p_order, p_nat_order, p_rt, p_actor) returning * into n;
  perform plan_h_audit(p_actor, p_role, 'create', 'plan_notices', n.id::text, null, to_jsonb(n));
  return n.id;
end
$f$;

  CREATE FUNCTION public.plan_h_vs_day(p_order bigint, p_day date, p_actor text, p_role text) RETURNS bigint
    LANGUAGE plpgsql SET search_path = public AS $f$
declare o orders%rowtype;
begin
  -- Spec 3 VS: ONE field, orders.cross_dock_date; 069 order_cd_stop_follow moves the order's Cross-dock stop and
  -- ramp_follows_stop its Ramp line, as today. NULL = nothing changed, no notice.
  select * into o from orders where id = p_order for no key update;
  if o.id is null or o.cross_dock_date is not distinct from p_day then return null; end if;
  -- Decision 17: F5's bridge trigger reads this to tell the national desk's write (the VS stays on its truck)
  -- from the international desk's.
  perform set_config('plan.writer', 'natl', true);
  update orders set cross_dock_date = p_day where id = p_order;
  perform plan_h_audit(p_actor, p_role, 'update', 'orders', coalesce(o.legacy_id, o.id::text),
                       jsonb_build_object('cross_dock_date', o.cross_dock_date),
                       jsonb_build_object('cross_dock_date', p_day, 'by', 'national desk (072)'));
  -- "The national desk changed the Veroia day of international %s: %s -> %s"
  return plan_h_notice('intl', 'vs_day_changed',
    'zqTOvyDOlc64zr3Ouc66z47OvSDOrM67zrvOsc6+zrUgz4TOt869IM63zrzOrc+BzrEgzpLOrc+Bzr/Ouc6xz4Igz4TOt8+CIM60zrnOtc64zr3Ov8+Nz4IgJXM6ICVzIOKGkiAlcw==',
    array[coalesce(o.reference, o.id::text), coalesce(to_char(o.cross_dock_date, 'DD/MM'), '-'), to_char(p_day, 'DD/MM')],
    p_order, null, null, p_actor, p_role);
end
$f$;

  CREATE FUNCTION public.plan_h_vs_follow(p_pieces bigint[], p_actor text, p_role text) RETURNS bigint[]
    LANGUAGE plpgsql SET search_path = public AS $f$
declare o record; v_out bigint[] := '{}'; v_n bigint;
begin
  -- Decision 16 / spec 3 VS: when this operation put on a truck a piece of a VS that was NOT stock, the
  -- international's day becomes the FIRST hub day of all its pieces (v_vs_state, the one definition).
  for o in select distinct ps.order_id, vv.first_hub_day
             from v_piece_state ps join v_vs_state vv on vv.order_id = ps.order_id
            where ps.piece_id = any (p_pieces) and ps.kind in ('vs_import', 'vs_export') loop
    if o.first_hub_day is not null then
      v_n := plan_h_vs_day(o.order_id, o.first_hub_day, p_actor, p_role);
      if v_n is not null then v_out := v_out || v_n; end if;
    end if;
  end loop;
  return v_out;
end
$f$;

  CREATE FUNCTION public.plan_h_rt_cancel_if_empty(p_rt bigint, p_reason text, p_actor text, p_role text)
    RETURNS boolean
    LANGUAGE plpgsql SET search_path = public AS $f$
declare r ct_round_trips%rowtype; lm local_moves%rowtype; s rt_stops%rowtype; e dl_entries%rowtype; v_n bigint;
begin
  -- Decision 11, in this order: (legs already off) (b) local loadings, (c) stops, (d) payroll lines WITH amounts
  -- deleted explicitly - 011 would flag them needs_review, and the spec says there is no needs_review - (e) the
  -- cycle cancelled (spec 2.1: no deleted_at on ct_round_trips). 011 deletes the empty payroll line by itself.
  select * into r from ct_round_trips where id = p_rt for no key update;
  if r.id is null or r.model <> 2 or r.status = 'cancelled' then return false; end if;
  if exists (select 1 from piece_legs where rt_id = p_rt and deleted_at is null) then return false; end if;
  for lm in update local_moves set deleted_at = now()
             where rt_stop_id in (select id from rt_stops where rt_id = p_rt) and move_kind = 'nat_loading'
               and deleted_at is null and status <> 'Cancelled' returning * loop
    perform plan_h_audit(p_actor, p_role, 'delete', 'local_moves', lm.id::text,
                         jsonb_build_object('deleted_at', null), jsonb_build_object('deleted_at', lm.deleted_at, 'reason', p_reason));
  end loop;
  for s in update rt_stops set deleted_at = now(), deleted_reason = p_reason, deleted_by = p_actor
            where rt_id = p_rt and deleted_at is null returning * loop
    perform plan_h_audit(p_actor, p_role, 'delete', 'rt_stops', s.id::text, jsonb_build_object('deleted_at', null),
                         jsonb_build_object('deleted_at', s.deleted_at, 'reason', p_reason));
  end loop;
  for e in update dl_entries set deleted_at = now(), deleted_reason = p_reason || ' (' || p_actor || ')', updated_at = now()
            where rt_id = p_rt and deleted_at is null
              and (trip_value is not null or advance is not null or expenses is not null) returning * loop
    perform plan_h_audit(p_actor, p_role, 'delete', 'dl_entries', e.id::text,
                         jsonb_build_object('deleted_at', null, 'trip_value', e.trip_value, 'advance', e.advance, 'expenses', e.expenses),
                         jsonb_build_object('deleted_at', e.deleted_at, 'deleted_reason', e.deleted_reason));
  end loop;
  update ct_round_trips set status = 'cancelled', updated_at = now() where id = p_rt;
  perform plan_h_audit(p_actor, p_role, 'update', 'ct_round_trips', p_rt::text, jsonb_build_object('status', r.status),
                       jsonb_build_object('status', 'cancelled', 'reason', p_reason));
  -- Decision 13: cost lines stay on the cycle (the trace; DKV must not re-match a wrong cycle) and the
  -- national desk is told.
  select count(*) into v_n from ct_cost_lines where rt_id = p_rt;
  if v_n > 0 then
    -- "Cycle %s was cancelled and keeps %s cost lines: a trip is missing"
    perform plan_h_notice('natl', 'costs_without_rt',
      'zp8gzrrPjc66zrvOv8+CICVzIM6xzrrPhc+Bz47OuM63zrrOtSDOus6xzrkgzrrPgc6xz4TOrCAlcyDOs8+BzrHOvM68zq3PgiDOtc6+z4zOtM+Jzr06IM67zrXOr8+AzrXOuSDOtM+Bzr/OvM6/zrvPjM6zzrnOvw==',
      array[r.code, v_n::text], null, null, p_rt, p_actor, p_role);
  end if;
  return true;
end
$f$;

  CREATE FUNCTION public.plan_h_finish() RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
declare v_con text; v_det text;
begin
  -- Every plan_* ends here: the deferred rules of 071/071b fire INSIDE the function, where a refusal keeps its
  -- plan:<code>, instead of at COMMIT inside PostgREST. The EXCLUDE of 071b (23P01) becomes truck_busy /
  -- driver_busy with the codes of the cycles that collide (decision 19). The detail lists every overlapping pair of
  -- the same truck / driver, not only this call's: the pre-check plan_h_busy names the one other cycle on the
  -- normal path, so this net speaks only in a race, where one more code in the brackets is accepted (review 23/10).
  set constraints all immediate;
exception when exclusion_violation then
  get stacked diagnostics v_con = constraint_name;
  select string_agg(distinct a.code, '/') into v_det
    from ct_round_trips a join ct_round_trips b
      on b.id <> a.id and b.model = 2 and b.trip_type = 'OWNED' and b.status <> 'cancelled'
     and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)')
     and case when v_con = 'rt_v2_driver_once' then a.driver_id = b.driver_id else a.truck_id = b.truck_id end
   where a.model = 2 and a.trip_type = 'OWNED' and a.status <> 'cancelled';
  perform plan_h_raise(case when v_con = 'rt_v2_driver_once' then 'driver_busy' else 'truck_busy' end,
                       coalesce(v_det, v_con));
end
$f$;

  CREATE FUNCTION public.plan_h_ok(p_op text, p_ids jsonb, p_warnings jsonb, p_notices jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE SET search_path = public AS $f$
  -- The one answer shape of every write (Interfaces): empty lists are [], never absent (facade trap 2).
  select jsonb_build_object('ok', true, 'op', p_op, 'dry_run', false, 'ids', coalesce(p_ids, '{}'::jsonb),
                            'warnings', coalesce(p_warnings, '[]'::jsonb), 'notice_ids', coalesce(p_notices, '[]'::jsonb))
$f$;

  -- ===== PART 2: SECTION A (each task of section A inserts its functions above the marker below) =====
  CREATE FUNCTION public.plan_h_legacy_id() RETURNS text
    LANGUAGE plpgsql SET search_path = public AS $f$
declare
  c CONSTANT text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  b bytea; v text; i int;
begin
  -- Decision 20: the facade answers every row with id = legacy_id ('rec' + 14 [A-Za-z0-9], the Worker's
  -- mintLegacyId); a national order without one would show as id null on every screen that still reads it.
  -- gen_random_uuid is core (pg_catalog): no extension needed.
  loop
    b := uuid_send(gen_random_uuid());
    v := 'rec';
    for i in 0..13 loop v := v || substr(c, (get_byte(b, i) % 62) + 1, 1); end loop;
    exit when not exists (select 1 from national_orders where legacy_id = v);
  end loop;
  return v;
end
$f$;

  CREATE FUNCTION public.plan_h_order_summary(p_shipments jsonb) RETURNS jsonb
    LANGUAGE sql STABLE SET search_path = public AS $f$
  -- Decision 20: the national order's summary fields are DERIVED from its shipments, by this one rule, in the
  -- same transaction as every change to them (plan_orders_create, plan_order_update): pallets = sum, requested
  -- loading = first Athens day of load_from, requested delivery = last Athens day of deliver_to, first origin,
  -- last destination (in the shipments' order).
  select jsonb_build_object(
           'pallets', sum((e->>'pallets')::numeric),
           'loading_datetime', min(((e->>'load_from')::timestamptz at time zone 'Europe/Athens')::date),
           'delivery_datetime', max(((e->>'deliver_to')::timestamptz at time zone 'Europe/Athens')::date),
           'pickup_location_1_id', (array_agg((e->>'origin_location_id')::bigint order by i))[1],
           'delivery_location_1_id', (array_agg((e->>'dest_location_id')::bigint order by i desc))[1])
    from jsonb_array_elements(p_shipments) with ordinality t(e, i)
$f$;

  CREATE FUNCTION public.plan_orders_create(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare
  o jsonb; s jsonb; v_sum jsonb; v_client bigint; v_price numeric; v_tgt jsonb; v_put jsonb;
  n national_orders%rowtype; sh shipments%rowtype; pc shipment_pieces%rowtype;
  v_nos bigint[] := '{}'; v_shs bigint[] := '{}'; v_pcs bigint[] := '{}'; v_ans jsonb;
begin
  perform plan_h_ctx(p_actor, p_role);
  perform plan_h_keys(p, array['orders', 'target', 'stops', 'request_id'], 'p');
  -- decision 44: the same request_id again = the first answer, nothing written
  v_ans := plan_h_replay(p, 'plan_orders_create', p_actor);
  if v_ans is not null then return v_ans; end if;
  if jsonb_typeof(p->'orders') is distinct from 'array' or jsonb_array_length(p->'orders') = 0 then
    perform plan_h_raise('bad_input', 'orders');
  end if;
  -- N orders in ONE call (groupage of 3 clients = one transaction, R-04).
  for o in select value from jsonb_array_elements(p->'orders') loop
    perform plan_h_keys(o, array['client_id', 'price', 'reference', 'goods', 'temperature_c', 'pallet_exchange',
                                 'notes', 'shipments', 'stock_lot_id'], 'order');
    -- C-24: a lot piece (057) never enters v5 here; its relation to v5 is F3's (E6).
    if coalesce(o->'stock_lot_id', 'null'::jsonb) <> 'null'::jsonb then
      perform plan_h_raise('stock_lot', 'order');   -- never the caller's text in the detail (plan_h_raise)
    end if;
    v_client := (o->>'client_id')::bigint;
    if v_client is null or not exists (select 1 from clients where id = v_client and deleted_at is null) then
      perform plan_h_raise('no_client', coalesce(v_client::text, 'null'));
    end if;
    v_price := (o->>'price')::numeric;
    -- review A2 r1: NaN sorts above every number in Postgres (so "<= 0" is false) and Infinity passes "> 0"; either
    -- would be written to the unconstrained national_orders.price and poison every revenue sum. One comparison
    -- refuses both: a price is a finite number above 0.
    if v_price is null or not (v_price > 0 and v_price < 'Infinity'::numeric) then
      perform plan_h_raise('no_price', coalesce(v_price::text, 'null'));
    end if;
    -- review A2 r1: temperature_c is unconstrained numeric: NaN / +-Infinity would be stored as they are
    if abs((o->>'temperature_c')::numeric) >= 'Infinity'::numeric then
      perform plan_h_raise('bad_input', 'temperature_c:finite');
    end if;
    -- review A2 r1: an object / array / boolean in a text field would be stored as its JSON text, silently
    if exists (select 1 from unnest(array['reference', 'goods', 'notes']) f
                where jsonb_typeof(o->f) in ('object', 'array', 'boolean')) then
      perform plan_h_raise('bad_input', 'order:text');
    end if;
    if jsonb_typeof(o->'shipments') is distinct from 'array' or jsonb_array_length(o->'shipments') = 0 then
      perform plan_h_raise('bad_input', 'shipments');
    end if;
    for s in select value from jsonb_array_elements(o->'shipments') loop
      perform plan_h_keys(s, array['origin_location_id', 'dest_location_id', 'pallets', 'load_from', 'load_to',
                                   'deliver_from', 'deliver_to'], 'shipment');
      -- owner #12: a window from-to everywhere; the four ends are required.
      if s->>'load_from' is null or s->>'load_to' is null or s->>'deliver_from' is null or s->>'deliver_to' is null then
        perform plan_h_raise('no_window', 'shipment');
      end if;
      -- review A2 r2 (coordinator 25/10: every timestamptz input): 'infinity' / '-infinity' pass the null test above
      -- and the 071 CHECK shipments_win; the order would exist but fall out of every week / day read and show as
      -- Invalid Date on the screens. A window end is a finite time.
      if not (isfinite((s->>'load_from')::timestamptz) and isfinite((s->>'load_to')::timestamptz)
              and isfinite((s->>'deliver_from')::timestamptz) and isfinite((s->>'deliver_to')::timestamptz)) then
        perform plan_h_raise('no_window', 'shipment:finite');
      end if;
      perform plan_h_location((s->>'origin_location_id')::bigint);
      perform plan_h_location((s->>'dest_location_id')::bigint);
      -- one decimal at most (decision 20): shipments / shipment_pieces are numeric(6,1) and would round 2.55
      -- silently, while the order's summary kept 2.55 (review 23/10)
      if (s->>'pallets')::numeric <> round((s->>'pallets')::numeric, 1) then
        perform plan_h_raise('bad_input', 'pallets:one decimal');
      end if;
      -- review A2 r1: NaN sorts above every number, so it passes the line above AND the 071 CHECK pallets > 0, and
      -- would be written to shipments, pieces and the summary. Not below Infinity = refused (NaN and Infinity).
      if not ((s->>'pallets')::numeric < 'Infinity'::numeric) then
        perform plan_h_raise('bad_input', 'pallets:finite');
      end if;
    end loop;
    v_sum := plan_h_order_summary(o->'shipments');
    -- Never truck_id / partner_id / status (spec 2.1: no mirror); direction and type stay NULL (decision 20:
    -- the F4 readers read v_shipments).
    insert into national_orders (legacy_id, client_id, price, reference, goods, temperature_c, pallet_exchange, notes,
                                 pallets, loading_datetime, delivery_datetime, pickup_location_1_id, delivery_location_1_id)
    values (plan_h_legacy_id(), v_client, v_price, o->>'reference', o->>'goods', (o->>'temperature_c')::numeric,
            coalesce((o->>'pallet_exchange')::boolean, false), o->>'notes',
            (v_sum->>'pallets')::numeric, (v_sum->>'loading_datetime')::date, (v_sum->>'delivery_datetime')::date,
            (v_sum->>'pickup_location_1_id')::bigint, (v_sum->>'delivery_location_1_id')::bigint)
    returning * into n;
    perform plan_h_audit(p_actor, p_role, 'create', 'national_orders', n.legacy_id, null, to_jsonb(n));
    v_nos := v_nos || n.id;
    -- One shipment per A->B pair, one piece per shipment (Veroia may be A or B: a normal place, spec 3).
    for s in select value from jsonb_array_elements(o->'shipments') loop
      insert into shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                             deliver_from, deliver_to, created_by)
      values (n.id, (s->>'origin_location_id')::bigint, (s->>'dest_location_id')::bigint, (s->>'pallets')::numeric,
              (s->>'load_from')::timestamptz, (s->>'load_to')::timestamptz, (s->>'deliver_from')::timestamptz,
              (s->>'deliver_to')::timestamptz, p_actor)
      returning * into sh;
      perform plan_h_audit(p_actor, p_role, 'create', 'shipments', sh.id::text, null, to_jsonb(sh));
      insert into shipment_pieces (shipment_id, pallets, created_by) values (sh.id, sh.pallets, p_actor) returning * into pc;
      perform plan_h_audit(p_actor, p_role, 'create', 'shipment_pieces', pc.id::text, null, to_jsonb(pc));
      v_shs := v_shs || sh.id;
      v_pcs := v_pcs || pc.id;
    end loop;
  end loop;
  -- The "+" in a row: the new pieces go on the target in the same transaction (decision 3).
  if p ? 'target' then
    v_tgt := plan_h_target(p->'target', p->'stops', p_actor, p_role);
    v_put := plan_h_put((select jsonb_agg(jsonb_build_object('piece_id', x) order by x) from unnest(v_pcs) x),
                        v_tgt, p_actor, p_role, '{}');
  elsif p ? 'stops' then
    perform plan_h_raise('bad_input', 'stops without target');
  end if;
  v_ans := plan_h_ok('plan_orders_create',
    jsonb_build_object('nat_order_ids', to_jsonb(v_nos), 'shipment_ids', to_jsonb(v_shs), 'piece_ids', to_jsonb(v_pcs),
                       'rt_id', v_put->'rt_id', 'stop_ids', coalesce(v_put->'stop_ids', '[]'::jsonb),
                       'leg_ids', coalesce(v_put->'leg_ids', '[]'::jsonb)),
    v_put->'warnings', v_put->'notice_ids');
  perform plan_h_remember(p, 'plan_orders_create', v_ans, p_actor, p_role);
  perform plan_h_finish();
  return v_ans;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range or invalid_parameter_value then
    perform plan_h_raise('bad_input', sqlstate);
end
$f$;

  CREATE FUNCTION public.plan_h_put(p_pieces jsonb, p_tgt jsonb, p_actor text, p_role text, p_first bigint[])
    RETURNS jsonb
    LANGUAGE plpgsql SET search_path = public AS $f$
declare
  v_rt bigint := (p_tgt->>'rt_id')::bigint; v_side text := p_tgt->>'side'; v_map jsonb := p_tgt->'stops';
  it jsonb; v_id bigint; v_take numeric; v_pick bigint; v_drop bigint; v_to bigint; v_hub bigint;
  p shipment_pieces%rowtype; ps v_piece_state%rowtype; c1 shipment_pieces%rowtype; c2 shipment_pieces%rowtype;
  v_legs bigint[] := '{}'; v_pcs bigint[] := '{}'; v_new bigint[] := '{}'; v_follow bigint[] := '{}';
  v_warn jsonb; v_notices bigint[]; v_vs_first boolean;
begin
  -- The core of every assignment (plan_put_pieces / _group, plan_orders_create, plan_split_piece and
  -- plan_move_pieces with a target): pieces onto ONE resolved target (plan_h_target) in one transaction.
  if jsonb_typeof(p_pieces) is distinct from 'array' or jsonb_array_length(p_pieces) = 0 then
    perform plan_h_raise('bad_input', 'pieces');
  end if;
  select id into v_hub from locations where is_hub;
  for it in select value from jsonb_array_elements(p_pieces) loop
    perform plan_h_keys(it, array['piece_id', 'take_pallets', 'to_hub', 'pickup', 'drop'], 'piece');
    v_id := (it->>'piece_id')::bigint;
    select * into p from shipment_pieces where id = v_id for no key update;
    if p.id is null or p.deleted_at is not null then perform plan_h_raise('piece_dead', coalesce(v_id::text, 'null')); end if;
    if exists (select 1 from shipment_pieces c where c.parent_piece_id = p.id and c.deleted_at is null) then
      perform plan_h_raise('piece_split', p.id::text);
    end if;
    select * into ps from v_piece_state where piece_id = p.id;
    if ps.piece_id is null then perform plan_h_raise('piece_dead', p.id::text); end if;
    -- A piece already planned to its national end is not put again: it is moved (plan_move_pieces).
    if not ps.waiting then perform plan_h_raise('piece_busy', p.id::text); end if;
    -- decision 16 (critique 23/10): "first" = the international had NO live leg on any of its pieces before this
    -- one is written. A VS split at Veroia without a target leaves only stock; the first part of it that rides
    -- still moves the international's day ("stock" in spec 3 is what stays after a part has LEFT).
    v_vs_first := ps.kind in ('vs_import', 'vs_export') and not exists (
      select 1 from piece_legs l join shipment_pieces sp on sp.id = l.piece_id join shipments s on s.id = sp.shipment_id
       where s.order_id = ps.order_id and l.deleted_at is null);
    v_take := (it->>'take_pallets')::numeric;
    -- coordinator 25/10 (cross-cutting input rule): NaN sorts above every number and +-Infinity passes the size
    -- tests below; neither is a size (it would only ever be refused under a wrong code, parts_sum / not_stock)
    if v_take is not null and not (abs(v_take) < 'Infinity'::numeric) then
      perform plan_h_raise('bad_input', 'take_pallets:finite');
    end if;
    -- one decimal at most (decision 20): the split rows are numeric(6,1)
    if v_take is not null and v_take <> round(v_take, 1) then perform plan_h_raise('bad_input', 'take_pallets:one decimal'); end if;
    if v_take is not null and v_take <> ps.pallets then
      -- Spec 3 Board: the "+" takes a PART only from stock (a child without a leg of its own, at the hub); a load
      -- that is just arriving goes whole. Split + put = one transaction (spec 7).
      if not ps.is_stock then perform plan_h_raise('not_stock', p.id::text); end if;
      if v_take <= 0 or v_take > ps.pallets then
        perform plan_h_raise('parts_sum', format('%s:%s>%s', p.id, v_take, ps.pallets));
      end if;
      update shipment_pieces set split_at = now(), split_by = p_actor where id = p.id;
      perform plan_h_audit(p_actor, p_role, 'update', 'shipment_pieces', p.id::text,
                           jsonb_build_object('split_at', null), jsonb_build_object('split_at', now(), 'split_by', p_actor));
      insert into shipment_pieces (shipment_id, parent_piece_id, pallets, created_by)
      values (p.shipment_id, p.id, v_take, p_actor) returning * into c1;
      -- decision 18: the stock that stays keeps the parent's "leaves by" day
      insert into shipment_pieces (shipment_id, parent_piece_id, pallets, leave_by, created_by)
      values (p.shipment_id, p.id, ps.pallets - v_take, p.leave_by, p_actor) returning * into c2;
      perform plan_h_audit(p_actor, p_role, 'create', 'shipment_pieces', c1.id::text, null, to_jsonb(c1));
      perform plan_h_audit(p_actor, p_role, 'create', 'shipment_pieces', c2.id::text, null, to_jsonb(c2));
      v_new := v_new || c1.id || c2.id;
      v_id := c1.id;              -- the part that rides; it sits where the parent sits, with the same end
    end if;
    if it ? 'pickup' then
      v_pick := (v_map->>(it->>'pickup'))::bigint;
      if v_pick is null then perform plan_h_raise('bad_input', 'piece.pickup'); end if;
    else
      v_pick := plan_h_stop_at(v_map, ps.position_location_id, v_side);
    end if;
    if v_pick is null then perform plan_h_raise('bad_input', format('pickup:%s@%s', p.id, ps.position_location_id)); end if;
    v_to := case when coalesce((it->>'to_hub')::boolean, false) then v_hub
                 else (select nat_to_location_id from v_shipments where shipment_id = p.shipment_id) end;
    if it ? 'drop' then
      v_drop := (v_map->>(it->>'drop'))::bigint;
      if v_drop is null then perform plan_h_raise('bad_input', 'piece.drop'); end if;
    else
      v_drop := plan_h_stop_at(v_map, v_to, v_side);
    end if;
    if v_drop is null then perform plan_h_raise('bad_input', format('drop:%s@%s', p.id, v_to)); end if;
    v_legs := v_legs || plan_h_leg_add(v_id, v_rt, v_pick, v_drop, p_actor, p_role);
    v_pcs := v_pcs || v_id;
    -- decision 16: a piece that was NOT stock, or the first ride of a VS (v_vs_first), rewrites the international's
    -- day (p_first: the caller knows a piece counted as "first" before this operation changed it, e.g. a split part).
    if not ps.is_stock or v_vs_first or p.id = any (p_first) or v_id = any (p_first) then
      v_follow := v_follow || v_id;
    end if;
  end loop;
  perform plan_h_reseq(v_rt, p_actor, p_role);
  v_notices := plan_h_vs_follow(v_follow, p_actor, p_role);
  -- Warnings, never refusals: over 33 pallets on a side (spec 3 VS; every unit counts, C-23) and temperatures
  -- 2 C or more apart on a side (spec 7 B-87). over_33 is the SUM of the side's loadings, not the peak load on
  -- board (a load dropped at a middle stop still counts): an indication for the screen, never a rule.
  select coalesce(jsonb_agg(w order by w::text), '[]'::jsonb) into v_warn from (
    select jsonb_build_object('code', 'over_33', 'rt_id', v_rt, 'side', s.side, 'pallets', sum(pp.pallets)) as w
      from piece_legs l join rt_stops s on s.id = l.pickup_stop_id join shipment_pieces pp on pp.id = l.piece_id
     where l.rt_id = v_rt and l.deleted_at is null group by s.side having sum(pp.pallets) > 33
    union all
    select jsonb_build_object('code', 'mixed_temp', 'rt_id', v_rt, 'side', s.side,
                              'delta_c', max(vs.temperature_c) - min(vs.temperature_c))
      from piece_legs l join rt_stops s on s.id = l.pickup_stop_id join shipment_pieces pp on pp.id = l.piece_id
      join v_shipments vs on vs.shipment_id = pp.shipment_id
     where l.rt_id = v_rt and l.deleted_at is null group by s.side
    having max(vs.temperature_c) - min(vs.temperature_c) >= 2) x;
  -- the target's own warnings (a new cycle: v1_same_truck, decision 19) travel with the answer
  v_warn := coalesce(p_tgt->'warnings', '[]'::jsonb) || v_warn;
  return jsonb_build_object('rt_id', v_rt, 'side', v_side,
    'stop_ids', (select coalesce(jsonb_agg(value::bigint order by value::bigint), '[]'::jsonb) from jsonb_each_text(v_map)),
    'leg_ids', to_jsonb(v_legs), 'piece_ids', to_jsonb(v_pcs), 'new_piece_ids', to_jsonb(v_new),
    'warnings', v_warn, 'notice_ids', to_jsonb(v_notices));
end
$f$;

  CREATE FUNCTION public.plan_put_pieces(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare v_tgt jsonb; v_put jsonb;
begin
  perform plan_h_ctx(p_actor, p_role);
  perform plan_h_keys(p, array['pieces', 'target', 'stops'], 'p');
  v_tgt := plan_h_target(p->'target', p->'stops', p_actor, p_role);
  v_put := plan_h_put(p->'pieces', v_tgt, p_actor, p_role, '{}');
  perform plan_h_finish();
  return plan_h_ok('plan_put_pieces',
    jsonb_build_object('rt_id', v_put->'rt_id', 'stop_ids', v_put->'stop_ids', 'leg_ids', v_put->'leg_ids',
                       'piece_ids', v_put->'piece_ids', 'new_piece_ids', v_put->'new_piece_ids'),
    v_put->'warnings', v_put->'notice_ids');
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range or invalid_parameter_value then
    perform plan_h_raise('bad_input', sqlstate);
end
$f$;

  CREATE FUNCTION public.plan_put_group(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare v_ord bigint; v_nat bigint; v_pieces jsonb; v_tgt jsonb; v_put jsonb;
begin
  -- Design 3 "Assign": the whole card (e.g. the 3 deliveries of a VS) in one call. It never splits a piece
  -- (no take_pallets): a group is its waiting pieces, whole.
  perform plan_h_ctx(p_actor, p_role);
  perform plan_h_keys(p, array['group', 'target', 'stops'], 'p');
  perform plan_h_keys(p->'group', array['order_id', 'nat_order_id'], 'group');
  v_ord := (p->'group'->>'order_id')::bigint;
  v_nat := (p->'group'->>'nat_order_id')::bigint;
  -- Finite inputs (coordinator 25/10): the group ids are bigint, so 'NaN' / 'Infinity' fail the cast above (bad_input
  -- 22P02, never read as "no group"); the stop windows are refused in plan_h_stop_add ('stop.planned:finite').
  if num_nonnulls(v_ord, v_nat) <> 1 then perform plan_h_raise('bad_input', 'group'); end if;
  select jsonb_agg(jsonb_build_object('piece_id', ps.piece_id) order by ps.piece_id) into v_pieces
    from v_piece_state ps
   where ps.waiting and (ps.order_id = v_ord or ps.nat_order_id = v_nat);
  if v_pieces is null then perform plan_h_raise('group_empty', coalesce(v_ord, v_nat)::text); end if;
  v_tgt := plan_h_target(p->'target', p->'stops', p_actor, p_role);
  v_put := plan_h_put(v_pieces, v_tgt, p_actor, p_role, '{}');
  perform plan_h_finish();
  return plan_h_ok('plan_put_group',
    jsonb_build_object('rt_id', v_put->'rt_id', 'stop_ids', v_put->'stop_ids', 'leg_ids', v_put->'leg_ids',
                       'piece_ids', v_put->'piece_ids'),
    v_put->'warnings', v_put->'notice_ids');
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range or invalid_parameter_value then
    perform plan_h_raise('bad_input', sqlstate);
end
$f$;

  CREATE FUNCTION public.plan_split_piece(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare
  v_id bigint; v_hub bigint; v_sum numeric := 0; v_n int; part jsonb; v_tgt jsonb; v_put jsonb;
  p0 shipment_pieces%rowtype; ps v_piece_state%rowtype; c shipment_pieces%rowtype;
  v_children bigint[] := '{}'; v_legs jsonb := '[]'; v_rts jsonb := '[]'; v_warn jsonb := '[]'; v_notices jsonb := '[]';
  v_ans jsonb;
begin
  -- Spec 3 Board: a load splits only on the Veroia Board (at the hub). Each part may go onto a cycle in the same
  -- transaction; a part without a target stays as stock that "leaves by" the evening before the requested day.
  perform plan_h_ctx(p_actor, p_role);
  perform plan_h_keys(p, array['piece_id', 'parts', 'request_id'], 'p');
  -- decision 44: before the piece is read, so a repeat is not refused as piece_split by the first call's split
  v_ans := plan_h_replay(p, 'plan_split_piece', p_actor);
  if v_ans is not null then return v_ans; end if;
  v_id := (p->>'piece_id')::bigint;
  select * into p0 from shipment_pieces where id = v_id for no key update;
  if p0.id is null or p0.deleted_at is not null then perform plan_h_raise('piece_dead', coalesce(v_id::text, 'null')); end if;
  if exists (select 1 from shipment_pieces c2 where c2.parent_piece_id = p0.id and c2.deleted_at is null) then
    perform plan_h_raise('piece_split', p0.id::text);
  end if;
  select * into ps from v_piece_state where piece_id = p0.id;
  if ps.piece_id is null then perform plan_h_raise('piece_dead', p0.id::text); end if;
  select id into v_hub from locations where is_hub;
  -- refused here with its own code, before 071's split_not_at_hub would refuse it at the end
  if ps.position_location_id is distinct from v_hub then perform plan_h_raise('not_at_hub', p0.id::text); end if;
  if jsonb_typeof(p->'parts') is distinct from 'array' or jsonb_array_length(p->'parts') < 2 then
    perform plan_h_raise('bad_input', 'parts');
  end if;
  for part in select value from jsonb_array_elements(p->'parts') loop
    perform plan_h_keys(part, array['pallets', 'target', 'stops'], 'part');
    -- coordinator 25/10: 'NaN' / 'Infinity' / '-Infinity' are valid numeric texts; refused as input here, before
    -- they would read as a part <= 0 or a sum that does not match (parts_sum, the wrong code)
    if not (abs(coalesce((part->>'pallets')::numeric, 0)) < 'Infinity'::numeric) then
      perform plan_h_raise('bad_input', 'parts:finite');
    end if;
    if coalesce((part->>'pallets')::numeric, 0) <= 0 then perform plan_h_raise('parts_sum', p0.id || ':part<=0'); end if;
    -- one decimal at most (decision 20): the parts are numeric(6,1) and the sum is checked on what is written
    if (part->>'pallets')::numeric <> round((part->>'pallets')::numeric, 1) then
      perform plan_h_raise('bad_input', 'parts:one decimal');
    end if;
    v_sum := v_sum + (part->>'pallets')::numeric;
  end loop;
  if v_sum <> ps.pallets then perform plan_h_raise('parts_sum', format('%s:%s<>%s', p0.id, v_sum, ps.pallets)); end if;
  -- ONE lock order (as plan_move_pieces): every target cycle of the parts, by id, before anything is written
  perform 1 from ct_round_trips rt
   where rt.id in (select (q->'target'->>'rt_id')::bigint from jsonb_array_elements(p->'parts') q
                    where jsonb_typeof(q->'target') = 'object' and q->'target' ? 'rt_id')
   order by rt.id for no key update;
  update shipment_pieces set split_at = now(), split_by = p_actor where id = p0.id;
  perform plan_h_audit(p_actor, p_role, 'update', 'shipment_pieces', p0.id::text,
                       jsonb_build_object('split_at', null), jsonb_build_object('split_at', now(), 'split_by', p_actor));
  for part in select value from jsonb_array_elements(p->'parts') loop
    -- decision 18: only "leaves by" (the evening before the requested national day, as a date); "22:00" is the
    -- screen's text. A part that rides now has no leave_by.
    insert into shipment_pieces (shipment_id, parent_piece_id, pallets, leave_by, created_by)
    values (p0.shipment_id, p0.id, (part->>'pallets')::numeric,
            case when part ? 'target' then null else ps.nat_due_day - 1 end, p_actor)
    returning * into c;
    perform plan_h_audit(p_actor, p_role, 'create', 'shipment_pieces', c.id::text, null, to_jsonb(c));
    v_children := v_children || c.id;
    if part ? 'target' then
      v_tgt := plan_h_target(part->'target', part->'stops', p_actor, p_role);
      -- decision 16: the part put in the same operation counts as "first" when the split piece was not stock
      v_put := plan_h_put(jsonb_build_array(jsonb_build_object('piece_id', c.id)), v_tgt, p_actor, p_role,
                          case when ps.is_stock then '{}'::bigint[] else array[c.id] end);
      v_legs := v_legs || (v_put->'leg_ids');
      v_rts := v_rts || jsonb_build_array(v_put->'rt_id');
      v_warn := v_warn || (v_put->'warnings');
      v_notices := v_notices || (v_put->'notice_ids');
    elsif part ? 'stops' then
      perform plan_h_raise('bad_input', 'part.stops without target');
    end if;
  end loop;
  v_ans := plan_h_ok('plan_split_piece',
    jsonb_build_object('piece_ids', to_jsonb(v_children), 'leg_ids', v_legs, 'rt_ids', v_rts), v_warn, v_notices);
  perform plan_h_remember(p, 'plan_split_piece', v_ans, p_actor, p_role);
  perform plan_h_finish();
  return v_ans;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range or invalid_parameter_value then
    perform plan_h_raise('bad_input', sqlstate);
end
$f$;

  CREATE FUNCTION public.plan_h_confirm(p_fn text, p_key text, p_full jsonb, p jsonb, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SET search_path = public AS $f$
declare v_tok text := plan_h_token(p_fn, p_key, p_full);
begin
  -- Two steps for what deletes (spec 2.1): the dry run returns the list and the token and writes nothing (NULL =
  -- go on). Decision 8: an empty list needs no token; a changed list is stale_confirm before need_token.
  if coalesce((p->>'dry_run')::boolean, false) then
    return jsonb_build_object('ok', true, 'op', p_fn, 'dry_run', true, 'needs_confirm', jsonb_array_length(p_full) > 0,
                              'confirm_token', v_tok, 'consequences', plan_h_strip_amounts(p_full, p_role));
  end if;
  if p->>'confirm_token' is not null and p->>'confirm_token' <> v_tok then
    perform plan_h_raise('stale_confirm', p_fn);
  end if;
  if jsonb_array_length(p_full) > 0 and p->>'confirm_token' is null then
    perform plan_h_raise('need_token', p_fn);
  end if;
  return null;
end
$f$;

  CREATE FUNCTION public.plan_h_drop_consequences(p_legs bigint[], p_keep_rt bigint, p_chosen_rts bigint[] DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql STABLE SET search_path = public AS $f$
declare v jsonb := '[]'; r record;
begin
  -- The list of spec 3 for legs that are about to go (move, delete): executed legs (a correction); later legs on
  -- other cycles than the ones the user picked from (p_chosen_rts: a move takes every later leg of the piece with
  -- it, for the chain - listed as later_leg, never dropped silently); local loadings whose stop loses its last
  -- pickup, with the TOPIKO payroll line of that loading when it already has amounts (decision 33: 060 sends it to
  -- accounting's review); every cycle that would be left without a live leg (except the target p_keep_rt) with its
  -- payroll and costs. Distinct and sorted (kind, row), so the token is stable.
  v := v || coalesce((select jsonb_agg(jsonb_build_object('kind', 'executed_leg', 'leg_id', l.id, 'rt_id', l.rt_id,
                                                         'stop_day', ss.stop_day))
                        from piece_legs l join v_rt_stop_state ss on ss.stop_id = l.drop_stop_id
                       where l.id = any (p_legs) and l.deleted_at is null and ss.executed), '[]'::jsonb);
  v := v || coalesce((select jsonb_agg(jsonb_build_object('kind', 'later_leg', 'leg_id', l.id, 'rt_id', l.rt_id,
                                                         'code', c.code))
                        from piece_legs l join ct_round_trips c on c.id = l.rt_id
                       where p_chosen_rts is not null and l.id = any (p_legs) and l.deleted_at is null
                         and not (l.rt_id = any (p_chosen_rts))), '[]'::jsonb);
  for r in select lm.id, lm.driver_id, lm.move_date, s.rt_id
             from local_moves lm join rt_stops s on s.id = lm.rt_stop_id
            where lm.move_kind = 'nat_loading' and lm.deleted_at is null and lm.status <> 'Cancelled'
              and s.deleted_at is null
              and exists (select 1 from piece_legs l where l.id = any (p_legs) and l.pickup_stop_id = s.id
                             and l.deleted_at is null)
              and not exists (select 1 from piece_legs l where l.pickup_stop_id = s.id and l.deleted_at is null
                                 and not (l.id = any (p_legs))) loop
    v := v || jsonb_build_array(jsonb_build_object('kind', 'local_loading', 'local_move_id', r.id, 'rt_id', r.rt_id,
                                                   'driver_id', r.driver_id, 'move_date', r.move_date));
    -- the local driver's TOPIKO line of that day (060: one per driver and day, local_move_id set) with amounts;
    -- its month as for payroll_amount (decision 10: one date key for every payroll line of the list)
    v := v || coalesce((select jsonb_agg(jsonb_build_object('kind', 'local_payroll', 'dl_entry_id', e.id,
                                                           'local_move_id', r.id, 'driver_id', e.driver_id,
                                                           'month', to_char(e.entry_date, 'YYYY-MM'),
                                                           'amount', e.trip_value,
                                                           'advance', e.advance, 'expenses', e.expenses))
                          from dl_entries e
                         where e.driver_id = r.driver_id and e.entry_date = r.move_date and e.local_move_id is not null
                           and e.deleted_at is null
                           and (e.trip_value is not null or e.advance is not null or e.expenses is not null)), '[]'::jsonb);
  end loop;
  for r in select distinct l.rt_id from piece_legs l
            where l.id = any (p_legs) and l.deleted_at is null and l.rt_id is distinct from p_keep_rt loop
    if not exists (select 1 from piece_legs l where l.rt_id = r.rt_id and l.deleted_at is null and not (l.id = any (p_legs))) then
      v := v || jsonb_build_array(jsonb_build_object('kind', 'rt_cancelled', 'rt_id', r.rt_id,
                                                     'code', (select code from ct_round_trips where id = r.rt_id)))
             || plan_h_rt_consequences(r.rt_id);
    end if;
  end loop;
  return (select coalesce(jsonb_agg(e order by e->>'kind', e::text), '[]'::jsonb)
            from (select distinct e from jsonb_array_elements(v) e) x);
end
$f$;

  CREATE FUNCTION public.plan_move_pieces(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare
  v_from jsonb := p->'from'; v_rt bigint; v_side text; v_pieces bigint[]; v_legs bigint[]; v_wait boolean := false;
  v_keep bigint; v_full jsonb; v_conf jsonb; v_first bigint[]; v_stops bigint[]; v_src bigint[]; v_tgt jsonb;
  v_put jsonb; v_reason text; v_x bigint; v_gone bigint[] := '{}'; r ct_round_trips%rowtype; v_chosen bigint[];
begin
  -- Spec 7: "Move to..." per row, in ONE transaction; also back to waiting (decision 15, C-21) and a whole side
  -- (C-22: a breakdown). What was executed stays when a side moves; a piece moved after execution is a correction
  -- and is listed. A cycle left empty is cancelled with its payroll after the confirmation (owner 20/10).
  perform plan_h_ctx(p_actor, p_role);
  perform plan_h_keys(p, array['from', 'target', 'stops', 'dry_run', 'confirm_token'], 'p');
  perform plan_h_keys(v_from, array['piece_ids', 'rt_id', 'side'], 'from');
  v_rt := (v_from->>'rt_id')::bigint;
  v_side := v_from->>'side';
  -- Finite inputs (coordinator 25/10): every id is bigint, so 'NaN' / 'Infinity' fail their cast (bad_input 22P02,
  -- before the list); a new target stop's window is refused in plan_h_stop_add ('stop.planned:finite', the one
  -- guard), at execution: the dry run does not read the stops.
  if v_from ? 'piece_ids' then
    if v_side is not null or jsonb_typeof(v_from->'piece_ids') is distinct from 'array' then
      perform plan_h_raise('bad_input', 'from');
    end if;
    select array_agg(x::bigint order by x::bigint) into v_pieces from jsonb_array_elements_text(v_from->'piece_ids') x;
    if v_pieces is null then perform plan_h_raise('bad_input', 'from.piece_ids'); end if;
    for v_x in select unnest(v_pieces) loop
      if not exists (select 1 from shipment_pieces where id = v_x and deleted_at is null) then
        perform plan_h_raise('piece_dead', v_x::text);
      end if;
      if exists (select 1 from shipment_pieces where parent_piece_id = v_x and deleted_at is null) then
        perform plan_h_raise('piece_split', v_x::text);
      end if;
    end loop;
    -- the chosen legs (on from.rt_id when given) and every later leg of the same piece: they hang on them (chain)
    select array_agg(l.id order by l.id) into v_legs
      from piece_legs l
     where l.deleted_at is null and l.piece_id = any (v_pieces)
       and l.leg_no >= (select min(m.leg_no) from piece_legs m where m.piece_id = l.piece_id and m.deleted_at is null
                          and (v_rt is null or m.rt_id = v_rt));
  elsif v_rt is not null and v_side in ('KATHODOS', 'ANODOS') then
    if not exists (select 1 from ct_round_trips where id = v_rt and model = 2) then perform plan_h_raise('rt_gone', v_rt::text); end if;
    -- a leg belongs to the side of its pickup stop; an executed leg stays
    select array_agg(distinct l.piece_id) into v_pieces
      from piece_legs l join rt_stops s on s.id = l.pickup_stop_id
      join v_rt_stop_state d on d.stop_id = l.drop_stop_id
     where l.rt_id = v_rt and l.deleted_at is null and s.side = v_side and not d.executed;
    select array_agg(l.id order by l.id) into v_legs
      from piece_legs l
     where l.deleted_at is null and l.piece_id = any (v_pieces)
       and l.leg_no >= (select min(m.leg_no) from piece_legs m join rt_stops s on s.id = m.pickup_stop_id
                         join v_rt_stop_state d on d.stop_id = m.drop_stop_id
                        where m.piece_id = l.piece_id and m.deleted_at is null and m.rt_id = v_rt
                          and s.side = v_side and not d.executed);
  else
    perform plan_h_raise('bad_input', 'from');
  end if;
  if v_legs is null then perform plan_h_raise('bad_input', 'from:no live leg'); end if;
  -- every chosen piece moves FROM a live leg of this move: a piece without one (e.g. not on from.rt_id) would be
  -- put below as if it were waiting - an assignment nobody asked for (principle 1, review 23/10)
  select x into v_x from unnest(v_pieces) x
   where not exists (select 1 from piece_legs l where l.id = any (v_legs) and l.piece_id = x) limit 1;
  if v_x is not null then perform plan_h_raise('bad_input', 'from:no live leg:' || v_x); end if;
  -- a piece split at Veroia is never put again whole (plan_h_put: piece_split) - in the side mode too (a
  -- breakdown): refused BEFORE the list, so a dry run never hands out a token for a move its execution refuses
  -- (review 23/10; keeping the transshipment at Veroia is decision 36)
  select l.piece_id into v_x from piece_legs l
   where l.id = any (v_legs)
     and exists (select 1 from shipment_pieces c where c.parent_piece_id = l.piece_id and c.deleted_at is null) limit 1;
  if v_x is not null then perform plan_h_raise('piece_split', v_x::text); end if;
  -- the target, read only (the dry run writes nothing)
  if p->'target' ? 'wait' then
    perform plan_h_keys(p->'target', array['wait'], 'target');
    if (p->'target'->>'wait')::boolean is not true or p ? 'stops' then perform plan_h_raise('bad_input', 'target.wait'); end if;
    v_wait := true;
  else
    perform plan_h_keys(p->'target', array['rt_id', 'side', 'new_rt'], 'target');
    v_keep := (p->'target'->>'rt_id')::bigint;
    if v_keep is not null then
      select * into r from ct_round_trips where id = v_keep;
      if r.id is null or r.model <> 2 then perform plan_h_raise('rt_gone', v_keep::text); end if;
      if r.status = 'cancelled' then perform plan_h_raise('rt_cancelled', v_keep::text); end if;
      if not exists (select 1 from piece_legs l join rt_stops s on s.id = l.pickup_stop_id
                      where l.id = any (v_legs) and (l.rt_id <> v_keep or s.side is distinct from p->'target'->>'side')) then
        perform plan_h_raise('same_rt', v_keep::text);
      end if;
    end if;
  end if;
  -- the cycles the user picked from: the one of each moved piece's first moved leg; a later leg elsewhere is
  -- listed as later_leg (critique 23/10)
  select array_agg(distinct l.rt_id) into v_chosen from piece_legs l
   where l.id = any (v_legs)
     and l.leg_no = (select min(m.leg_no) from piece_legs m where m.id = any (v_legs) and m.piece_id = l.piece_id);
  -- ONE lock order for every plan_* (plan_delete, plan_vs_set_place, plan_split_piece too): the cycles first, by id,
  -- BEFORE the list is read and before any order (plan_h_put -> plan_h_vs_day locks orders after its cycle). Two
  -- moves out of one cycle then cannot both read "it does not empty" and cancel it without a token; two opposite
  -- moves R1 <-> R2 queue. A deadlock that slips through anyway (40P01) is a 409 busy_retry: nothing kept.
  -- NO KEY UPDATE: 072 never changes a key, and a FOR UPDATE would also block the FK reads of concurrent inserts
  -- (a DKV import into ct_cost_lines) - the rule of 057.
  perform 1 from ct_round_trips c
   where c.id = any (array(select l.rt_id from piece_legs l where l.id = any (v_legs)) || v_keep)
   order by c.id for no key update;
  v_full := plan_h_drop_consequences(v_legs, v_keep, v_chosen);
  v_conf := plan_h_confirm('plan_move_pieces', array_to_string(v_legs, ',') || '>' || coalesce(p->'target', 'null'::jsonb)::text,
                           v_full, p, p_role);
  if v_conf is not null then return v_conf; end if;

  v_reason := case when v_wait then 'plan_move_pieces: back to waiting' else 'plan_move_pieces: moved' end;
  -- decision 16 is about the state BEFORE this operation: a piece that was not stock still counts as "first"
  select array_agg(ps.piece_id) into v_first from v_piece_state ps where ps.piece_id = any (v_pieces) and not ps.is_stock;
  select array_agg(distinct x) into v_stops
    from piece_legs l, unnest(array[l.pickup_stop_id, l.drop_stop_id]) x where l.id = any (v_legs);
  select array_agg(distinct l.rt_id) into v_src from piece_legs l where l.id = any (v_legs);
  -- (1) the target's stops first, so a stop of the request is never swept; (2) old legs off; (3) new legs on;
  -- (4) stops that lost their last leg; (5) cycles left empty (decision 11 order inside).
  if not v_wait then v_tgt := plan_h_target(p->'target', p->'stops', p_actor, p_role); end if;
  for v_x in select unnest(v_legs) loop perform plan_h_leg_drop(v_x, v_reason, p_actor, p_role); end loop;
  if not v_wait then
    v_put := plan_h_put((select jsonb_agg(jsonb_build_object('piece_id', x) order by x) from unnest(v_pieces) x),
                        v_tgt, p_actor, p_role, coalesce(v_first, '{}'));
  end if;
  perform plan_h_stops_sweep(v_stops, v_reason, p_actor, p_role);
  for v_x in select unnest(v_src) loop
    if plan_h_rt_cancel_if_empty(v_x, v_reason, p_actor, p_role) then
      v_gone := v_gone || v_x;
    else
      perform plan_h_reseq(v_x, p_actor, p_role);
    end if;
  end loop;
  perform plan_h_finish();
  return plan_h_ok('plan_move_pieces',
    jsonb_build_object('rt_id', v_put->'rt_id', 'stop_ids', coalesce(v_put->'stop_ids', '[]'::jsonb),
                       'leg_ids', coalesce(v_put->'leg_ids', '[]'::jsonb), 'piece_ids', to_jsonb(v_pieces),
                       'dropped_leg_ids', to_jsonb(v_legs), 'cancelled_rt_ids', to_jsonb(v_gone)),
    v_put->'warnings', v_put->'notice_ids');
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range or invalid_parameter_value then
    perform plan_h_raise('bad_input', sqlstate);
end
$f$;
  -- @A (072 section A: plan_orders_create, plan_put_pieces, plan_put_group, plan_split_piece, plan_move_pieces, plan_order_update)

  -- ===== PART 3: CYCLE, DELETE, VS, LOCAL LOADING (section B) =====
  -- ===== PART 4: NOTICES AND READS (section B) =====
  -- ===== PART 5: RIGHTS AND PROOFS =====
  -- Its own block: the reviewer reads the rights in one place. Born closed (principle 5): the pg_default_acl of
  -- postgres gives EXECUTE to anon and authenticated on every new function. Everything 072 created loses every
  -- right, then service_role gets EXECUTE on v_pub only; plan_rt_create and every plan_h_* stay callable by nobody
  -- but their owner (the plan_* run as it).
  DECLARE
    -- The functions the Worker may call (PLAN_PERMS decides who; the base checks shape and rules). Each task adds
    -- its line above the marker; the leading NULL keeps every added line in the same ", '...'" shape and is removed.
    -- 16 when the plan is done (15 without decision 21).
    v_pub CONSTANT text[] := array_remove(ARRAY[
      NULL
    , 'public.plan_orders_create(jsonb,text,text)'
    , 'public.plan_put_pieces(jsonb,text,text)'
    , 'public.plan_put_group(jsonb,text,text)'
    , 'public.plan_split_piece(jsonb,text,text)'
    , 'public.plan_move_pieces(jsonb,text,text)'
    -- @pub (072 tasks add ", 'public.plan_x(<arg types>)'" lines above this marker)
    ]::text[], NULL);
    -- 071's own plan_* (triggers and rule readers): never touched by 072, closed for every API role
    v_f1 CONSTANT text[] := ARRAY['plan_chk', 'plan_rt_window_sync', 'plan_rt_problem', 'plan_shipment_problem',
                                  'plan_leg_problem', 'plan_local_loading_problem'];
    v_sig text; v_f record; v_k int; v_all int;
  BEGIN
    FOREACH v_sig IN ARRAY v_pub LOOP
      IF to_regprocedure(v_sig) IS NULL THEN
        RAISE EXCEPTION '072: % was not created - stop', v_sig;
      END IF;
    END LOOP;
    FOR v_f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
                WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%'
                  AND NOT (p.proname = ANY (v_f1)) ORDER BY 1 LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_f.sig);
    END LOOP;
    FOREACH v_sig IN ARRAY v_pub LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
    END LOOP;

    -- PROOFS (any difference = everything undone)
    SELECT count(*) INTO v_all FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%' AND NOT (p.proname = ANY (v_f1));
    SELECT count(*) INTO v_k FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%'
       AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
    IF v_k <> 0 THEN RAISE EXCEPTION '072 proof: % plan_* function(s) executable by anon / authenticated', v_k; END IF;
    SELECT count(*) INTO v_k FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%'
       AND has_function_privilege('service_role', p.oid, 'EXECUTE');
    IF v_k <> cardinality(v_pub)
       OR EXISTS (SELECT 1 FROM unnest(v_pub) s WHERE NOT has_function_privilege('service_role', to_regprocedure(s), 'EXECUTE')) THEN
      RAISE EXCEPTION '072 proof: service_role executes % plan_* function(s), expected exactly the % public ones', v_k, cardinality(v_pub);
    END IF;
    SELECT count(*) INTO v_k FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%'
       AND (pg_get_userbyid(p.proowner) <> 'postgres' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public']);
    IF v_k <> 0 THEN
      RAISE EXCEPTION '072 proof: % plan_* function(s) not owned by postgres or without SET search_path = public', v_k;
    END IF;
    -- every plan_h_* runs as its caller (invoker); every other 072 function as its owner (definer)
    SELECT count(*) INTO v_k FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%' AND NOT (p.proname = ANY (v_f1))
       AND p.prosecdef <> (p.proname NOT LIKE 'plan\_h\_%');
    IF v_k <> 0 THEN RAISE EXCEPTION '072 proof: % function(s) with the wrong SECURITY (helpers invoker, the rest definer)', v_k; END IF;
    -- every public one answers jsonb, never void (dbRpc reads a body: void = 500 after a write)
    IF EXISTS (SELECT 1 FROM unnest(v_pub) s JOIN pg_proc p ON p.oid = to_regprocedure(s)
                WHERE NOT p.prosecdef OR pg_get_function_result(p.oid) <> 'jsonb') THEN
      RAISE EXCEPTION '072 proof: a public plan_* is not SECURITY DEFINER or does not return jsonb';
    END IF;
    -- the live functions 072 relies on are still the texts read 22/10 (the list of the guard in PART 0)
    SELECT count(*) INTO v_k FROM (VALUES
        ('public.dl_sync_from_rt()', '331cea3a8987b74a9b0add698df9b158'),
        ('public.dl_local_day_sync(bigint,date)', '151dab06e2676f3c8885d7298d0ac6af'),
        ('public.dl_sync_from_local_move()', 'f053c478c79ef55dcc62b65a61939b9b'),
        ('public.local_moves_before()', '3b9f0a27c9921c63ce9fb41f09ef0462'),
        ('public.dl_local_line_guard()', 'e7f0348ccc5764d29608b8701f0e83b6'),
        ('public.dl_cash_sync_entry()', '6d702bad6485f06535c6a0d5aff0bd0c'),
        ('public.order_cd_stop_follow()', '433a1a7205fceb264e77f5a0c71a1521'),
        ('public.ramp_follows_stop()', '6fa6a83c4191af271dbae85935d710c5'),
        ('public.invoice_mark_guard()', 'dd975c4f04f95f528c7c79a80eb4d387'),
        ('public.stock_guard_natl()', 'e941edbca9ff1bbeba0c89d49eb71cb3'),
        ('public.stock_guard_orders()', '63aa751d93cc8b34afa5587912de7045'),
        ('public.national_orders_soft_delete_cascade()', '6c423b14397c659272b1c9256189933d'),
        ('public.rt_status_guard()', 'd7757f99c3443ac167d5bdaf3e34b142'),
        ('public.plan_chk()', '8f2fa7e5541aded2dffc853a57c54c22'),
        ('public.plan_rt_window_sync()', '050cbabe34493018f4335f748029761e'),
        ('public.plan_rt_problem(bigint)', 'f383f449d55e657cfa929bb51a9120f6'),
        ('public.plan_shipment_problem(bigint)', '8dd2beb159142bf5a6a4e32688688875'),
        ('public.plan_leg_problem(bigint)', '24803f176f12355faa84c07e43cb0df0'),
        ('public.plan_local_loading_problem(bigint)', '4c3dbec3810121a2a585fe8b49ceadf1'),
        ('public.ct_rt_legs_v2_guard()', '6240d699bc114ffd49c7d62780432c94'),
        ('public.rt_sync_to_orders()', 'a63234c844c2b6236b1e6dfe1410b8fc'),
        ('public.rt_sync_to_national_loads()', '028efb76373a0a6517134feaea88bc2f')
      ) v(sig, m)
     WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m;
    IF v_k <> 0 THEN RAISE EXCEPTION '072 proof: % live function(s) changed inside the block', v_k; END IF;
    -- 072 adds no trigger: the live count is the one measured in PART 0 and still equals B-54's red_value
    SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
    IF v_trg1 <> v_trg0 THEN
      RAISE EXCEPTION '072 proof: trigger count % -> % (072 adds no trigger)', v_trg0, v_trg1;
    END IF;
    IF v_trg1 IS DISTINCT FROM (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') THEN
      RAISE EXCEPTION '072 proof: % public triggers, B-54 red_value %', v_trg1, (SELECT red_value FROM monitoring.checks WHERE id = 'B-54');
    END IF;
    -- 0 v5 rows: creating the functions writes nothing (spec 2.2: the first real v5 row closes the way back)
    IF (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces)
       + (SELECT count(*) FROM public.rt_stops) + (SELECT count(*) FROM public.piece_legs)
       + (SELECT count(*) FROM public.plan_notices) + (SELECT count(*) FROM public.ct_round_trips WHERE model = 2) <> 0 THEN
      RAISE EXCEPTION '072 proof: v5 rows exist after the block';
    END IF;
    -- PostgREST learns the new functions now (W-04); without it every /plan/* RPC is 404 (= 503 schema_behind)
    PERFORM pg_notify('pgrst', 'reload schema');
    RAISE NOTICE '072 OK: % plan_* functions (% public, EXECUTE service_role only), triggers % (B-54 unchanged), 0 v5 rows',
      v_all, cardinality(v_pub), v_trg1;
  END;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN to_regprocedure('public.plan_h_raise(text,text)') IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%'
                              AND (has_function_privilege('anon', p.oid, 'EXECUTE')
                                   OR has_function_privilege('authenticated', p.oid, 'EXECUTE')))
            THEN '072 OK' ELSE '072 NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'plan\_%') AS plan_functions,
       (SELECT count(*) FROM pg_proc p WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'plan\_%'
          AND has_function_privilege('service_role', p.oid, 'EXECUTE')) AS public_functions,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces) + (SELECT count(*) FROM public.rt_stops)
         + (SELECT count(*) FROM public.piece_legs) + (SELECT count(*) FROM public.plan_notices) AS v5_rows,
       (SELECT count(*) FROM public.ct_round_trips WHERE model = 2) AS v5_cycles;
