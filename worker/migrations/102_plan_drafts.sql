-- 102 - NATIONAL v5: SHARED DRAFT LOADS ("Synthesi fortion", owner 2/11/2026), BORN CLOSED, 0 ROWS.
--
-- Design: docs/national-v5/compose-drafts-design-2026-11-02.md (owner 2/11: E1-E4 answered, "a draft is built over
-- days"). Number 102: 098-100 are reserved by the transfer work, 101 is self delivery (executed 2/11).
-- The owner runs it in the Supabase SQL editor AFTER 15:00 (the team works 05:30-14:30), with an explicit yes:
--   1. 102_plan_drafts_dryrun.sql   this block + a deliberate error: NOTHING kept
--   2. 102_plan_drafts.sql          (this file)
--   3. 102_plan_drafts_verify.sql   read-only, one row
-- ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it.
--
-- WHAT IT ADDS (and NOTHING else: no text of 071-101 changes, no row of an existing table is written but B-54's)
--   * table plan_drafts: a draft load - a side, a point (today Veroia, tomorrow any transfer point), a day, an
--     optional window and an optional vehicle INTENT (never an assignment: no EXCLUDE, no busy check). version +
--     updated_by / updated_at: a write that read an older version is refused (draft_stale), never a silent overwrite.
--     realized_* = it became a real load (the link stays); deleted_* = soft delete with a reason;
--   * table plan_draft_pieces: which piece is in which draft. ONE live draft per piece is a UNIQUE index (principle 4).
--     snap = the piece as it was when it went in (pallets, position, end, days, client): a change at the source is
--     SHOWN per piece, never applied silently; the user's "OK" (ack) renews it, with a trace;
--   * view v_plan_draft_piece_state: each live piece of a live draft NOW against its snap - dead / split / assigned /
--     moved (block "Dimiourgia") or changed (amber, does not block) or ok;
--   * 8 public plan_*: plan_drafts_read, plan_draft_history (reads), plan_draft_create, plan_draft_update,
--     plan_draft_pieces, plan_draft_move, plan_draft_delete, plan_draft_realize (writes) + 9 closed helpers;
--   * plan_draft_realize = "Dimiourgia": 072's own core (plan_h_target + plan_h_put, the core of POST /plan/legs) on
--     the draft's pieces AS THEY ARE NOW, in ONE transaction with the draft's closing: both or neither;
--   * 1 trigger function + 2 triggers (B-54 +2): a hard DELETE on either table is refused (soft delete only);
--   * born closed: RLS on, SELECT only to service_role / tms_reader / tms_check_runner, one policy monitor_read per
--     table for the two auditor roles (the rule of D-14), EXECUTE of the 8 acts to service_role only.
-- Owner answers built in: E1 the Weekly marks a piece "se proxeiro" from plan_drafts_read (no board change); E2 an
-- ANODOS piece always goes DIRECT to its end - realize refuses to_hub; E3 every write role deletes a draft (the
-- Worker's PLAN_PERMS: one resource); E4 "old" = the draft's own day has passed (in the read), never auto-deleted.
-- A draft is NOT a trip: no rt_stops, piece_legs, ct_round_trips, plan_notices, no VS follow - until realize.
--
-- NEW REFUSAL CODES (the Worker's Greek texts come with its routes): draft_gone, draft_stale, draft_side, draft_empty,
-- draft_pieces, draft_not_ready, draft_piece_missing, piece_in_draft. The rest are 072's (bad_input, piece_dead, ...).
-- REVERSE: 102_plan_drafts_rollback.sql (refuses while a live draft exists).
-- EXPECTED: NOTICE "102 OK: ..." and ONE row: result = '102 OK', tables = 2, acts = 8,
--   public_triggers = <before + 2> = b54_red_value.

DO $do$
DECLARE
  v_sig text; v_trg0 int; v_trg1 int; v_k bigint;
  -- what 102 calls and relies on (071, 072, 075; 101 ran: the order 101 -> 102)
  c_needs CONSTANT text[] := ARRAY['public.plan_h_raise(text,text)', 'public.plan_h_ctx(text,text)', 'public.plan_h_keys(jsonb,text[],text)',
    'public.plan_h_replay(jsonb,text,text)', 'public.plan_h_remember(jsonb,text,jsonb,text,text)',
    'public.plan_h_audit(text,text,text,text,text,jsonb,jsonb)', 'public.plan_h_finish()', 'public.plan_h_ok(text,jsonb,jsonb,jsonb)',
    'public.plan_h_location(bigint)', 'public.plan_h_target(jsonb,jsonb,text,text)', 'public.plan_h_put(jsonb,jsonb,text,text,bigint[])',
    'public.plan_h_dir_side(text)'];
  -- the 8 acts (EXECUTE to service_role) and the closed helpers: ONE list here, read by the proofs below; the rollback
  -- and tests/sql-102-drafts.test.js read them from this text (build-102.mjs facts())
  c_acts CONSTANT text[] := ARRAY['public.plan_drafts_read(bigint,text)', 'public.plan_draft_history(bigint,text)',
    'public.plan_draft_create(jsonb,text,text)', 'public.plan_draft_update(jsonb,text,text)', 'public.plan_draft_pieces(jsonb,text,text)',
    'public.plan_draft_move(jsonb,text,text)', 'public.plan_draft_delete(jsonb,text,text)', 'public.plan_draft_realize(jsonb,text,text)'];
  c_helpers CONSTANT text[] := ARRAY['public.plan_draft_no_delete()', 'public.plan_h_draft_role(text)', 'public.plan_h_draft_lock(bigint,jsonb)',
    'public.plan_h_draft_touch(bigint,jsonb,text,text)', 'public.plan_h_draft_snap(bigint)', 'public.plan_h_draft_add(bigint,bigint,jsonb,text,text)',
    'public.plan_h_draft_win(jsonb)', 'public.plan_h_draft_vehicle(jsonb)', 'public.plan_h_draft_json(bigint)'];
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('search_path', 'public', true);

  -- ===== PART 0: GUARDS (nothing written before them) =====
  IF to_regclass('public.plan_drafts') IS NOT NULL OR to_regclass('public.plan_draft_pieces') IS NOT NULL THEN
    RAISE EXCEPTION '102: plan_drafts already exists - 102 has run, nothing to do';
  END IF;
  FOREACH v_sig IN ARRAY c_needs LOOP
    IF to_regprocedure(v_sig) IS NULL THEN RAISE EXCEPTION '102: % is missing - stop', v_sig; END IF;
  END LOOP;
  IF to_regclass('public.v_piece_state') IS NULL OR to_regclass('public.v_shipments') IS NULL THEN
    RAISE EXCEPTION '102: the 071 views v_piece_state / v_shipments are missing - stop';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.orders'::regclass AND attname = 'self_delivery' AND NOT attisdropped) THEN
    RAISE EXCEPTION '102: 101 has not run (orders.self_delivery) - the order is 101 -> 102';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role', 'tms_reader', 'tms_check_runner')) <> 5 THEN
    RAISE EXCEPTION '102: an API or auditor role is missing - stop';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = v_trg0 AND baseline IS NULL) THEN
    RAISE EXCEPTION '102: B-54 red_value is not the live trigger count % - re-measure', v_trg0;
  END IF;

  -- ===== PART 1: THE TABLES (born closed, empty) =====
  CREATE TABLE public.plan_drafts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    side text NOT NULL CHECK (side IN ('KATHODOS', 'ANODOS')),
    point_location_id bigint NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,
    day date NOT NULL,
    win_from time, win_to time,
    truck_id bigint REFERENCES public.trucks (id) ON DELETE RESTRICT,
    trailer_id bigint REFERENCES public.trailers (id) ON DELETE RESTRICT,
    driver_id bigint REFERENCES public.drivers (id) ON DELETE RESTRICT,
    partner_id bigint REFERENCES public.partners (id) ON DELETE RESTRICT,
    version int NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
    realized_at timestamptz, realized_by text,
    realized_rt_id bigint REFERENCES public.ct_round_trips (id) ON DELETE RESTRICT,
    deleted_at timestamptz, deleted_by text, deleted_reason text,
    -- a window is both ends or none (none = the whole day, 093); a night window may end "before" it starts (094)
    CONSTRAINT plan_drafts_win CHECK ((win_from IS NULL) = (win_to IS NULL) AND (win_from IS NULL OR win_from <> win_to)),
    CONSTRAINT plan_drafts_real CHECK ((realized_at IS NULL) = (realized_by IS NULL) AND (realized_at IS NULL) = (realized_rt_id IS NULL)),
    CONSTRAINT plan_drafts_del CHECK ((deleted_at IS NULL) = (deleted_by IS NULL) AND (deleted_at IS NULL) = (deleted_reason IS NULL)),
    CONSTRAINT plan_drafts_end CHECK (realized_at IS NULL OR deleted_at IS NULL),
    -- own vehicle or partner, never both (as a cycle: one executes)
    CONSTRAINT plan_drafts_vehicle CHECK (partner_id IS NULL OR (truck_id IS NULL AND trailer_id IS NULL AND driver_id IS NULL))
  );
  CREATE INDEX plan_drafts_live ON public.plan_drafts (point_location_id, day) WHERE realized_at IS NULL AND deleted_at IS NULL;

  CREATE TABLE public.plan_draft_pieces (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    draft_id bigint NOT NULL REFERENCES public.plan_drafts (id) ON DELETE RESTRICT,
    piece_id bigint NOT NULL REFERENCES public.shipment_pieces (id) ON DELETE RESTRICT,
    snap jsonb NOT NULL CHECK (jsonb_typeof(snap) = 'object'),
    added_by text NOT NULL, added_at timestamptz NOT NULL DEFAULT now(),
    removed_at timestamptz, removed_by text,
    removed_reason text CHECK (removed_reason IN ('manual', 'moved', 'realized', 'draft_deleted')),
    CONSTRAINT plan_draft_pieces_rm CHECK ((removed_at IS NULL) = (removed_by IS NULL) AND (removed_at IS NULL) = (removed_reason IS NULL))
  );
  -- one piece in at most ONE live draft: the base says it, every path (principle 4). A draft that is deleted or
  -- realized closes its rows in the same transaction, so a live row always belongs to a live draft.
  CREATE UNIQUE INDEX plan_draft_pieces_one ON public.plan_draft_pieces (piece_id) WHERE removed_at IS NULL;
  CREATE INDEX plan_draft_pieces_draft ON public.plan_draft_pieces (draft_id) WHERE removed_at IS NULL;

  -- soft delete only, the rule of the 071 tables: every change keeps its trace
  CREATE FUNCTION public.plan_draft_no_delete() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public AS $f$
begin
  raise exception 'plan rule broken: hard delete on % (soft delete only)', tg_table_name
    using errcode = '23514', hint = 'plan:hard_delete';
end
$f$;
  CREATE TRIGGER plan_drafts_no_delete BEFORE DELETE ON public.plan_drafts
    FOR EACH ROW EXECUTE FUNCTION public.plan_draft_no_delete();
  CREATE TRIGGER plan_draft_pieces_no_delete BEFORE DELETE ON public.plan_draft_pieces
    FOR EACH ROW EXECUTE FUNCTION public.plan_draft_no_delete();

  -- ===== PART 2: THE STATE OF A PIECE IN A DRAFT, NOW (read model; no money) =====
  -- Never a silent drop or a silent update (owner 2/11): each live piece of a live draft against its snap.
  -- dead (deleted, its order deleted or the VS switched off: no live shipment), split, assigned (left the waiting -
  -- e.g. put on a cycle elsewhere), moved (still waiting, elsewhere) BLOCK "Dimiourgia" until the piece is taken out;
  -- changed (pallets, end, ready / due day, client) is amber and does not block.
  CREATE VIEW public.v_plan_draft_piece_state WITH (security_invoker = true) AS
  SELECT dp.id AS draft_piece_id, dp.draft_id, dp.piece_id, dp.snap, x.state, x.changed,
         x.state IN ('dead', 'split', 'assigned', 'moved') AS blocking
    FROM public.plan_draft_pieces dp
    JOIN public.plan_drafts d ON d.id = dp.draft_id
    JOIN public.shipment_pieces sp ON sp.id = dp.piece_id
    LEFT JOIN public.v_piece_state ps ON ps.piece_id = dp.piece_id
    LEFT JOIN public.v_shipments vs ON vs.shipment_id = sp.shipment_id
    CROSS JOIN LATERAL (
      SELECT EXISTS (SELECT 1 FROM public.shipment_pieces c WHERE c.parent_piece_id = dp.piece_id AND c.deleted_at IS NULL) AS split,
             array_remove(ARRAY[
               CASE WHEN ps.pallets IS DISTINCT FROM (dp.snap->>'pallets')::numeric THEN 'pallets' END,
               CASE WHEN vs.nat_to_location_id IS DISTINCT FROM (dp.snap->>'nat_to_location_id')::bigint THEN 'nat_to_location_id' END,
               CASE WHEN ps.nat_ready_day IS DISTINCT FROM (dp.snap->>'nat_ready_day')::date THEN 'nat_ready_day' END,
               CASE WHEN ps.nat_due_day IS DISTINCT FROM (dp.snap->>'nat_due_day')::date THEN 'nat_due_day' END,
               CASE WHEN vs.client_id IS DISTINCT FROM (dp.snap->>'client_id')::bigint THEN 'client_id' END], NULL) AS fields
    ) f
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN sp.deleted_at IS NOT NULL THEN 'dead'
               WHEN f.split THEN 'split'
               WHEN ps.piece_id IS NULL THEN 'dead'
               WHEN NOT ps.waiting THEN 'assigned'
               WHEN ps.position_location_id IS DISTINCT FROM (dp.snap->>'position_location_id')::bigint THEN 'moved'
               WHEN cardinality(f.fields) > 0 THEN 'changed'
               ELSE 'ok' END AS state,
             CASE WHEN ps.piece_id IS NULL OR f.split THEN '{}'::text[] ELSE f.fields END AS changed
    ) x
   WHERE dp.removed_at IS NULL AND d.deleted_at IS NULL AND d.realized_at IS NULL;

  -- ===== PART 3: CLOSED HELPERS =====
  -- the role of a read (a read has no actor; the rights live in the Worker's PLAN_PERMS, as for every plan_*)
  CREATE FUNCTION public.plan_h_draft_role(p_role text) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
begin
  if p_role is null or p_role not in ('owner', 'dispatcher', 'management', 'accountant', 'warehouse') then
    perform plan_h_raise('no_actor', 'role');
  end if;
end
$f$;

  -- {draft_id, version} -> the live draft row, locked; a draft that is gone, or a version that is not the one read,
  -- is refused BEFORE anything is written (two people, the same day or days apart: never a silent overwrite)
  CREATE FUNCTION public.plan_h_draft_lock(p_id bigint, p_version jsonb) RETURNS public.plan_drafts
    LANGUAGE plpgsql SET search_path = public AS $f$
declare d plan_drafts%rowtype;
begin
  if p_id is null then perform plan_h_raise('bad_input', 'draft_id'); end if;
  if jsonb_typeof(p_version) is distinct from 'number' then perform plan_h_raise('bad_input', 'version'); end if;
  select * into d from plan_drafts where id = p_id for update;
  if d.id is null or d.deleted_at is not null or d.realized_at is not null then
    perform plan_h_raise('draft_gone', p_id::text);
  end if;
  if d.version <> (p_version #>> '{}')::numeric then
    perform plan_h_raise('draft_stale', d.id || ':' || d.version);
  end if;
  return d;
end
$f$;

  -- one write of a draft = one version more, who and when, and its audit row (before / after)
  CREATE FUNCTION public.plan_h_draft_touch(p_id bigint, p_before jsonb, p_actor text, p_role text) RETURNS integer
    LANGUAGE plpgsql SET search_path = public AS $f$
declare v int;
begin
  update plan_drafts set version = version + 1, updated_by = p_actor, updated_at = now() where id = p_id returning version into v;
  perform plan_h_audit(p_actor, p_role, 'update', 'plan_drafts', p_id::text, p_before,
                       (select to_jsonb(d) from plan_drafts d where d.id = p_id));
  return v;
end
$f$;

  -- the piece as it is now, the fields whose change the draft shows (pallets, position, end, days, client)
  CREATE FUNCTION public.plan_h_draft_snap(p_piece bigint) RETURNS jsonb
    LANGUAGE sql STABLE SET search_path = public AS $f$
  select jsonb_build_object('pallets', ps.pallets, 'position_location_id', ps.position_location_id,
                            'nat_to_location_id', vs.nat_to_location_id, 'nat_ready_day', ps.nat_ready_day,
                            'nat_due_day', ps.nat_due_day, 'client_id', vs.client_id)
    from v_piece_state ps join v_shipments vs on vs.shipment_id = ps.shipment_id
   where ps.piece_id = p_piece
$f$;

  -- a piece into a live draft: alive, not split, waiting, on the draft's side of the point, in no other live draft.
  -- Side (the base's part of the rule; the screen filters with WN5L.waitSide): a KATHODOS draft takes what stands AT
  -- the point, an ANODOS draft what waits ELSEWHERE to come to it. p_snap: a moved piece keeps the snap it had.
  CREATE FUNCTION public.plan_h_draft_add(p_draft bigint, p_piece bigint, p_snap jsonb, p_actor text, p_role text) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
declare d plan_drafts%rowtype; ps v_piece_state%rowtype; v_other bigint; r plan_draft_pieces%rowtype;
begin
  select * into d from plan_drafts where id = p_draft;
  if p_piece is null then perform plan_h_raise('bad_input', 'piece_id'); end if;
  if not exists (select 1 from shipment_pieces where id = p_piece and deleted_at is null) then
    perform plan_h_raise('piece_dead', p_piece::text);
  end if;
  if exists (select 1 from shipment_pieces c where c.parent_piece_id = p_piece and c.deleted_at is null) then
    perform plan_h_raise('piece_split', p_piece::text);
  end if;
  select * into ps from v_piece_state where piece_id = p_piece;
  if ps.piece_id is null then perform plan_h_raise('piece_dead', p_piece::text); end if;
  if not ps.waiting then perform plan_h_raise('piece_busy', p_piece::text); end if;
  if (d.side = 'KATHODOS') is distinct from (ps.position_location_id = d.point_location_id) then
    perform plan_h_raise('draft_side', p_piece || ':' || d.side);
  end if;
  select draft_id into v_other from plan_draft_pieces where piece_id = p_piece and removed_at is null;
  -- ':same' = already in THIS draft (a second press), never worded as a conflict with another draft
  if v_other is not null then
    perform plan_h_raise('piece_in_draft', p_piece || ':' || v_other || case when v_other = p_draft then ':same' else '' end);
  end if;
  -- two people adding the same piece at the same moment both pass the check above: the unique index decides, and the
  -- loser hears the same code, never a bare 23505 the Worker cannot word (principle 1)
  begin
    insert into plan_draft_pieces (draft_id, piece_id, snap, added_by)
    values (p_draft, p_piece, coalesce(p_snap, plan_h_draft_snap(p_piece)), p_actor) returning * into r;
  exception when unique_violation then
    perform plan_h_raise('piece_in_draft', p_piece || ':race');
  end;
  perform plan_h_audit(p_actor, p_role, 'create', 'plan_draft_pieces', r.id::text, null, to_jsonb(r));
end
$f$;

  -- {from: 'HH:MM', to: 'HH:MM'} or null (= the whole day) -> [from, to]; anything else is bad_input
  CREATE FUNCTION public.plan_h_draft_win(p_win jsonb) RETURNS time[]
    LANGUAGE plpgsql STABLE SET search_path = public AS $f$
begin
  if p_win is null or jsonb_typeof(p_win) = 'null' then return array[null, null]::time[]; end if;
  perform plan_h_keys(p_win, array['from', 'to'], 'win');
  if coalesce(p_win->>'from', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(p_win->>'to', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or p_win->>'from' = p_win->>'to' then
    perform plan_h_raise('bad_input', 'win');
  end if;
  return array[(p_win->>'from')::time, (p_win->>'to')::time];
end
$f$;

  -- {truck_id?, trailer_id?, driver_id?, partner_id?} or null (= none): an INTENT, each id alive, partner alone
  CREATE FUNCTION public.plan_h_draft_vehicle(p_v jsonb) RETURNS bigint[]
    LANGUAGE plpgsql STABLE SET search_path = public AS $f$
declare t bigint; tl bigint; dr bigint; pa bigint;
begin
  if p_v is null or jsonb_typeof(p_v) = 'null' then return array[null, null, null, null]::bigint[]; end if;
  perform plan_h_keys(p_v, array['truck_id', 'trailer_id', 'driver_id', 'partner_id'], 'vehicle');
  t := (p_v->>'truck_id')::bigint; tl := (p_v->>'trailer_id')::bigint; dr := (p_v->>'driver_id')::bigint; pa := (p_v->>'partner_id')::bigint;
  if pa is not null and num_nonnulls(t, tl, dr) > 0 then perform plan_h_raise('bad_input', 'vehicle:partner_or_own'); end if;
  if (t is not null and not exists (select 1 from trucks where id = t))
     or (tl is not null and not exists (select 1 from trailers where id = tl))
     or (dr is not null and not exists (select 1 from drivers where id = dr))
     or (pa is not null and not exists (select 1 from partners where id = pa)) then
    perform plan_h_raise('bad_input', 'vehicle:unknown');
  end if;
  return array[t, tl, dr, pa];
end
$f$;

  -- a draft as the screen reads it: its fields, "old" (E4: its own day has passed, Athens), "ready" (pieces and no
  -- blocking mark), and each live piece with its state, its changed fields, its snap and the piece NOW in the shape
  -- of the board's waiting[] (072 plan_board), so a draft for another week is built with the same engine
  CREATE FUNCTION public.plan_h_draft_json(p_id bigint) RETURNS jsonb
    LANGUAGE sql STABLE SET search_path = public AS $f$
  select jsonb_build_object('draft_id', d.id, 'side', d.side, 'point_location_id', d.point_location_id, 'day', d.day,
           'win_from', to_char(d.win_from, 'HH24:MI'), 'win_to', to_char(d.win_to, 'HH24:MI'),
           'truck_id', d.truck_id, 'trailer_id', d.trailer_id, 'driver_id', d.driver_id, 'partner_id', d.partner_id,
           'version', d.version, 'created_by', d.created_by, 'created_at', d.created_at, 'updated_by', d.updated_by,
           'updated_at', d.updated_at, 'old', d.day < (now() at time zone 'Europe/Athens')::date,
           'ready', exists (select 1 from v_plan_draft_piece_state s where s.draft_id = d.id)
                    and not exists (select 1 from v_plan_draft_piece_state s where s.draft_id = d.id and s.blocking),
           'pieces', coalesce((
             select jsonb_agg(jsonb_build_object('piece_id', s.piece_id, 'state', s.state, 'changed', to_jsonb(s.changed),
                      'blocking', s.blocking, 'snap', s.snap,
                      'piece', case when ps.piece_id is null then null else jsonb_build_object(
                        'piece_id', ps.piece_id, 'shipment_id', ps.shipment_id, 'kind', ps.kind, 'order_id', ps.order_id,
                        'nat_order_id', ps.nat_order_id, 'order_stop_id', ps.order_stop_id, 'pallets', ps.pallets,
                        'leave_by', ps.leave_by, 'position_location_id', ps.position_location_id, 'at_hub', ps.at_hub,
                        'nat_from_location_id', vs.nat_from_location_id, 'nat_to_location_id', vs.nat_to_location_id,
                        'nat_ready_day', ps.nat_ready_day, 'nat_due_day', ps.nat_due_day, 'overdue', ps.overdue,
                        'is_stock', ps.is_stock, 'client_id', vs.client_id, 'client', cl.company_name, 'reference', vs.reference,
                        'temperature_c', vs.temperature_c, 'pallet_exchange', vs.pallet_exchange, 'load_from', vs.load_from,
                        'load_to', vs.load_to, 'deliver_from', vs.deliver_from, 'deliver_to', vs.deliver_to,
                        'direction', plan_h_dir_side(nor.direction)) end)
                    order by s.draft_piece_id)
               from v_plan_draft_piece_state s
               left join v_piece_state ps on ps.piece_id = s.piece_id
               left join v_shipments vs on vs.shipment_id = ps.shipment_id
               left join clients cl on cl.id = vs.client_id
               left join national_orders nor on nor.id = ps.nat_order_id
              where s.draft_id = d.id), '[]'::jsonb))
    from plan_drafts d where d.id = p_id
$f$;

  -- ===== PART 4: THE ACTS =====
  -- GET /plan/drafts?point=<id>: the live drafts of a point (null = every point: the Weekly's "se proxeiro" mark, E1),
  -- whatever their day - a draft is often for 3-4 days ahead, beyond the week on screen (owner 2/11)
  CREATE FUNCTION public.plan_drafts_read(p_point bigint, p_role text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
begin
  perform plan_h_draft_role(p_role);
  return jsonb_build_object('point_location_id', p_point, 'today', (now() at time zone 'Europe/Athens')::date,
    'drafts', coalesce((select jsonb_agg(plan_h_draft_json(d.id) order by d.day, d.id) from plan_drafts d
                         where d.deleted_at is null and d.realized_at is null
                           and (p_point is null or d.point_location_id = p_point)), '[]'::jsonb));
end
$f$;

  -- GET /plan/drafts/:id/history: every change of a draft and of its pieces, in order - who, when, what (owner 2/11:
  -- a draft built over days is traced step by step). Any draft, live or not.
  CREATE FUNCTION public.plan_draft_history(p_draft bigint, p_role text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
begin
  perform plan_h_draft_role(p_role);
  if p_draft is null or not exists (select 1 from plan_drafts where id = p_draft) then
    perform plan_h_raise('draft_gone', coalesce(p_draft::text, 'null'));
  end if;
  return jsonb_build_object('draft_id', p_draft, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('at', a.created_at, 'actor', a.actor, 'role', a.role, 'action', a.action,
             'table', a.table_name, 'record_id', a.record_id, 'before', a.before_data, 'after', a.after_data) order by a.created_at, a.id)
      from audit_log a
     where (a.table_name = 'plan_drafts' and a.record_id = p_draft::text)
        or (a.table_name = 'plan_draft_pieces' and a.record_id in (select id::text from plan_draft_pieces where draft_id = p_draft))), '[]'::jsonb));
end
$f$;

  -- POST /plan/drafts: a new draft, with or without pieces. A creation: request_id (decision 44, plan_h_replay)
  CREATE FUNCTION public.plan_draft_create(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare v_rep jsonb; v_win time[]; v_veh bigint[]; d plan_drafts%rowtype; it jsonb; v_ans jsonb;
begin
  perform plan_h_ctx(p_actor, p_role);
  perform plan_h_keys(p, array['side', 'point_location_id', 'day', 'win', 'vehicle', 'pieces', 'request_id'], 'p');
  v_rep := plan_h_replay(p, 'plan_draft_create', p_actor);
  if v_rep is not null then return v_rep; end if;
  if coalesce(p->>'side', '') not in ('KATHODOS', 'ANODOS') then perform plan_h_raise('bad_input', 'side'); end if;
  perform plan_h_location((p->>'point_location_id')::bigint);
  if p->>'day' is null or not isfinite((p->>'day')::date) then perform plan_h_raise('bad_input', 'day'); end if;
  v_win := plan_h_draft_win(p->'win');
  v_veh := plan_h_draft_vehicle(p->'vehicle');
  if p ? 'pieces' and jsonb_typeof(p->'pieces') is distinct from 'array' then perform plan_h_raise('bad_input', 'pieces'); end if;
  insert into plan_drafts (side, point_location_id, day, win_from, win_to, truck_id, trailer_id, driver_id, partner_id, created_by, updated_by)
  values (p->>'side', (p->>'point_location_id')::bigint, (p->>'day')::date, v_win[1], v_win[2], v_veh[1], v_veh[2], v_veh[3], v_veh[4], p_actor, p_actor)
  returning * into d;
  perform plan_h_audit(p_actor, p_role, 'create', 'plan_drafts', d.id::text, null, to_jsonb(d));
  for it in select value from jsonb_array_elements(coalesce(p->'pieces', '[]'::jsonb)) loop
    perform plan_h_keys(it, array['piece_id'], 'piece');
    perform plan_h_draft_add(d.id, (it->>'piece_id')::bigint, null, p_actor, p_role);
  end loop;
  v_ans := plan_h_ok('plan_draft_create', jsonb_build_object('draft_id', d.id, 'version', d.version), '[]'::jsonb, '[]'::jsonb);
  perform plan_h_remember(p, 'plan_draft_create', v_ans, p_actor, p_role);
  perform plan_h_finish();
  return v_ans;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range or invalid_parameter_value then
    perform plan_h_raise('bad_input', sqlstate);
end
$f$;

  -- PATCH /plan/drafts/:id: day / window / vehicle intent, each key present = set (null = clear), any number of times
  CREATE FUNCTION public.plan_draft_update(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare d plan_drafts%rowtype; v_win time[]; v_veh bigint[]; v int;
begin
  perform plan_h_ctx(p_actor, p_role);
  perform plan_h_keys(p, array['draft_id', 'version', 'day', 'win', 'vehicle'], 'p');
  if not (p ? 'day' or p ? 'win' or p ? 'vehicle') then perform plan_h_raise('bad_input', 'nothing to change'); end if;
  d := plan_h_draft_lock((p->>'draft_id')::bigint, p->'version');
  if p ? 'day' then
    if p->>'day' is null or not isfinite((p->>'day')::date) then perform plan_h_raise('bad_input', 'day'); end if;
    update plan_drafts set day = (p->>'day')::date where id = d.id;
  end if;
  if p ? 'win' then
    v_win := plan_h_draft_win(p->'win');
    update plan_drafts set win_from = v_win[1], win_to = v_win[2] where id = d.id;
  end if;
  if p ? 'vehicle' then
    v_veh := plan_h_draft_vehicle(p->'vehicle');
    update plan_drafts set truck_id = v_veh[1], trailer_id = v_veh[2], driver_id = v_veh[3], partner_id = v_veh[4] where id = d.id;
  end if;
  v := plan_h_draft_touch(d.id, to_jsonb(d), p_actor, p_role);
  perform plan_h_finish();
  return plan_h_ok('plan_draft_update', jsonb_build_object('draft_id', d.id, 'version', v), '[]'::jsonb, '[]'::jsonb);
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range or invalid_parameter_value then
    perform plan_h_raise('bad_input', sqlstate);
end
$f$;

  -- POST /plan/drafts/:id/pieces: remove (manual) / ack (the user saw a change at the source: the snap is renewed to
  -- the piece as it is now, with a trace) / add - in that order, one version more for the whole call
  CREATE FUNCTION public.plan_draft_pieces(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare d plan_drafts%rowtype; it jsonb; v_piece bigint; r plan_draft_pieces%rowtype; v_snap jsonb; v int; v_n int := 0;
begin
  perform plan_h_ctx(p_actor, p_role);
  perform plan_h_keys(p, array['draft_id', 'version', 'add', 'remove', 'ack'], 'p');
  for it in select value from jsonb_each(p) where key in ('add', 'remove', 'ack') loop
    if jsonb_typeof(it) is distinct from 'array' then perform plan_h_raise('bad_input', 'add/remove/ack'); end if;
  end loop;
  d := plan_h_draft_lock((p->>'draft_id')::bigint, p->'version');
  for it in select value from jsonb_array_elements(coalesce(p->'remove', '[]'::jsonb)) loop
    v_piece := (it #>> '{}')::bigint;
    select * into r from plan_draft_pieces where draft_id = d.id and piece_id = v_piece and removed_at is null for update;
    if r.id is null then perform plan_h_raise('draft_piece_missing', coalesce(v_piece::text, 'null') || ':' || d.id); end if;
    update plan_draft_pieces set removed_at = now(), removed_by = p_actor, removed_reason = 'manual' where id = r.id;
    perform plan_h_audit(p_actor, p_role, 'update', 'plan_draft_pieces', r.id::text, to_jsonb(r),
                         (select to_jsonb(x) from plan_draft_pieces x where x.id = r.id));
    v_n := v_n + 1;
  end loop;
  for it in select value from jsonb_array_elements(coalesce(p->'ack', '[]'::jsonb)) loop
    v_piece := (it #>> '{}')::bigint;
    select * into r from plan_draft_pieces where draft_id = d.id and piece_id = v_piece and removed_at is null for update;
    if r.id is null then perform plan_h_raise('draft_piece_missing', coalesce(v_piece::text, 'null') || ':' || d.id); end if;
    -- a blocking mark (dead, split, assigned, moved) is never acked away: the piece is taken out. An ack of 'moved'
    -- would renew the position and let a KATHODOS draft realize a piece that no longer stands at its point.
    v_snap := plan_h_draft_snap(v_piece);
    if v_snap is null or exists (select 1 from v_plan_draft_piece_state s where s.draft_piece_id = r.id and s.blocking) then
      perform plan_h_raise('draft_not_ready', v_piece || ':ack');
    end if;
    update plan_draft_pieces set snap = v_snap where id = r.id;
    perform plan_h_audit(p_actor, p_role, 'update', 'plan_draft_pieces', r.id::text, to_jsonb(r),
                         (select to_jsonb(x) from plan_draft_pieces x where x.id = r.id));
    v_n := v_n + 1;
  end loop;
  for it in select value from jsonb_array_elements(coalesce(p->'add', '[]'::jsonb)) loop
    perform plan_h_keys(it, array['piece_id'], 'piece');
    perform plan_h_draft_add(d.id, (it->>'piece_id')::bigint, null, p_actor, p_role);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then perform plan_h_raise('bad_input', 'nothing to change'); end if;
  v := plan_h_draft_touch(d.id, to_jsonb(d), p_actor, p_role);
  perform plan_h_finish();
  return plan_h_ok('plan_draft_pieces', jsonb_build_object('draft_id', d.id, 'version', v), '[]'::jsonb, '[]'::jsonb);
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range or invalid_parameter_value then
    perform plan_h_raise('bad_input', sqlstate);
end
$f$;

  -- POST /plan/drafts/move: pieces from one live draft to another of the same side and point, ONE transaction, both
  -- drafts locked in id order with the versions the screen read. The piece keeps its snap (its marks stay).
  CREATE FUNCTION public.plan_draft_move(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare a plan_drafts%rowtype; b plan_drafts%rowtype; v_from bigint; v_to bigint; it jsonb; v_piece bigint;
        r plan_draft_pieces%rowtype; va int; vb int;
begin
  perform plan_h_ctx(p_actor, p_role);
  perform plan_h_keys(p, array['piece_ids', 'from', 'to'], 'p');
  perform plan_h_keys(p->'from', array['draft_id', 'version'], 'from');
  perform plan_h_keys(p->'to', array['draft_id', 'version'], 'to');
  if jsonb_typeof(p->'piece_ids') is distinct from 'array' or jsonb_array_length(p->'piece_ids') = 0 then
    perform plan_h_raise('bad_input', 'piece_ids');
  end if;
  v_from := (p->'from'->>'draft_id')::bigint; v_to := (p->'to'->>'draft_id')::bigint;
  if v_from is null or v_to is null or v_from = v_to then perform plan_h_raise('bad_input', 'from/to'); end if;
  if v_from < v_to then
    a := plan_h_draft_lock(v_from, p->'from'->'version'); b := plan_h_draft_lock(v_to, p->'to'->'version');
  else
    b := plan_h_draft_lock(v_to, p->'to'->'version'); a := plan_h_draft_lock(v_from, p->'from'->'version');
  end if;
  if a.side <> b.side or a.point_location_id <> b.point_location_id then
    perform plan_h_raise('draft_side', a.id || ':' || b.id);
  end if;
  for it in select value from jsonb_array_elements(p->'piece_ids') loop
    v_piece := (it #>> '{}')::bigint;
    select * into r from plan_draft_pieces where draft_id = a.id and piece_id = v_piece and removed_at is null for update;
    if r.id is null then perform plan_h_raise('draft_piece_missing', coalesce(v_piece::text, 'null') || ':' || a.id); end if;
    update plan_draft_pieces set removed_at = now(), removed_by = p_actor, removed_reason = 'moved' where id = r.id;
    perform plan_h_audit(p_actor, p_role, 'update', 'plan_draft_pieces', r.id::text, to_jsonb(r),
                         (select to_jsonb(x) from plan_draft_pieces x where x.id = r.id));
    -- the piece must still be one a draft may take (alive, waiting, on the side): a move never carries a piece that
    -- left the waiting into another draft - it is taken out instead
    perform plan_h_draft_add(b.id, v_piece, r.snap, p_actor, p_role);
  end loop;
  va := plan_h_draft_touch(a.id, to_jsonb(a), p_actor, p_role);
  vb := plan_h_draft_touch(b.id, to_jsonb(b), p_actor, p_role);
  perform plan_h_finish();
  return plan_h_ok('plan_draft_move', jsonb_build_object('from', jsonb_build_object('draft_id', a.id, 'version', va),
                   'to', jsonb_build_object('draft_id', b.id, 'version', vb)), '[]'::jsonb, '[]'::jsonb);
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range or invalid_parameter_value then
    perform plan_h_raise('bad_input', sqlstate);
end
$f$;

  -- POST /plan/drafts/:id/delete: soft, with a reason; its pieces are released (draft_deleted) in the same
  -- transaction. Every write role (E3, owner 2/11: the Worker's one resource). Never automatic (E4).
  CREATE FUNCTION public.plan_draft_delete(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare d plan_drafts%rowtype; r plan_draft_pieces%rowtype; v_n int := 0;
begin
  perform plan_h_ctx(p_actor, p_role);
  perform plan_h_keys(p, array['draft_id', 'version', 'reason'], 'p');
  if p ? 'reason' and jsonb_typeof(p->'reason') not in ('string', 'null') then perform plan_h_raise('bad_input', 'reason'); end if;
  d := plan_h_draft_lock((p->>'draft_id')::bigint, p->'version');
  for r in select * from plan_draft_pieces where draft_id = d.id and removed_at is null order by id for update loop
    update plan_draft_pieces set removed_at = now(), removed_by = p_actor, removed_reason = 'draft_deleted' where id = r.id;
    perform plan_h_audit(p_actor, p_role, 'update', 'plan_draft_pieces', r.id::text, to_jsonb(r),
                         (select to_jsonb(x) from plan_draft_pieces x where x.id = r.id));
    v_n := v_n + 1;
  end loop;
  update plan_drafts set deleted_at = now(), deleted_by = p_actor,
         deleted_reason = coalesce(nullif(btrim(p->>'reason'), ''), 'deleted by user') where id = d.id;
  perform plan_h_draft_touch(d.id, to_jsonb(d), p_actor, p_role);
  perform plan_h_finish();
  return plan_h_ok('plan_draft_delete', jsonb_build_object('draft_id', d.id, 'pieces_released', v_n), '[]'::jsonb, '[]'::jsonb);
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range or invalid_parameter_value then
    perform plan_h_raise('bad_input', sqlstate);
end
$f$;

  -- POST /plan/drafts/:id/realize = "Dimiourgia": the request the screen built with the assignment engine (the same
  -- body as POST /plan/legs: pieces, target, stops) on the draft's pieces AS THEY ARE NOW, through 072's own core
  -- (plan_h_target + plan_h_put: waiting, split, deleted re-checked there), and the draft closed - ONE transaction:
  -- both or neither, so a draft never says "open" over pieces already on a cycle (principle 1). A creation:
  -- request_id. The pieces must be EXACTLY the draft's live ones; E2 (owner 2/11): no to_hub - a piece goes direct to
  -- its end; whole pieces only (no take_pallets). A blocking mark refuses first, with the piece named.
  CREATE FUNCTION public.plan_draft_realize(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare v_rep jsonb; d plan_drafts%rowtype; l jsonb; it jsonb; v_have bigint[]; v_sent bigint[]; v_bad record;
        v_tgt jsonb; v_put jsonb; v_rt bigint; r plan_draft_pieces%rowtype; v_ans jsonb;
begin
  perform plan_h_ctx(p_actor, p_role);
  perform plan_h_keys(p, array['draft_id', 'version', 'legs', 'request_id'], 'p');
  v_rep := plan_h_replay(p, 'plan_draft_realize', p_actor);
  if v_rep is not null then return v_rep; end if;
  d := plan_h_draft_lock((p->>'draft_id')::bigint, p->'version');
  l := p->'legs';
  perform plan_h_keys(l, array['pieces', 'target', 'stops'], 'legs');
  if jsonb_typeof(l->'pieces') is distinct from 'array' then perform plan_h_raise('bad_input', 'legs.pieces'); end if;
  for it in select value from jsonb_array_elements(l->'pieces') loop
    perform plan_h_keys(it, array['piece_id', 'pickup', 'drop'], 'piece');
  end loop;
  select array_agg(piece_id order by piece_id) into v_have from plan_draft_pieces where draft_id = d.id and removed_at is null;
  if v_have is null then perform plan_h_raise('draft_empty', d.id::text); end if;
  select array_agg((x->>'piece_id')::bigint order by (x->>'piece_id')::bigint) into v_sent from jsonb_array_elements(l->'pieces') x;
  if v_sent is distinct from v_have then perform plan_h_raise('draft_pieces', d.id::text); end if;
  select piece_id, state into v_bad from v_plan_draft_piece_state where draft_id = d.id and blocking order by draft_piece_id limit 1;
  if v_bad.piece_id is not null then perform plan_h_raise('draft_not_ready', v_bad.piece_id || ':' || v_bad.state); end if;
  if jsonb_typeof(l->'target') is distinct from 'object' or (l->'target'->>'side') is distinct from d.side then
    perform plan_h_raise('bad_input', 'legs.target.side');
  end if;
  v_tgt := plan_h_target(l->'target', l->'stops', p_actor, p_role);
  -- ONE lock order (072 plan_put_pieces, K1 review r1): after the cycle, the pieces by id
  perform 1 from shipment_pieces sp where sp.id = any (v_have) order by sp.id for no key update;
  v_put := plan_h_put(l->'pieces', v_tgt, p_actor, p_role, '{}');
  v_rt := (v_put->>'rt_id')::bigint;
  for r in select * from plan_draft_pieces where draft_id = d.id and removed_at is null order by id loop
    update plan_draft_pieces set removed_at = now(), removed_by = p_actor, removed_reason = 'realized' where id = r.id;
    perform plan_h_audit(p_actor, p_role, 'update', 'plan_draft_pieces', r.id::text, to_jsonb(r),
                         (select to_jsonb(x) from plan_draft_pieces x where x.id = r.id));
  end loop;
  update plan_drafts set realized_at = now(), realized_by = p_actor, realized_rt_id = v_rt where id = d.id;
  perform plan_h_draft_touch(d.id, to_jsonb(d), p_actor, p_role);
  v_ans := plan_h_ok('plan_draft_realize',
    jsonb_build_object('draft_id', d.id, 'rt_id', v_rt, 'stop_ids', v_put->'stop_ids', 'leg_ids', v_put->'leg_ids',
                       'piece_ids', v_put->'piece_ids'),
    v_put->'warnings', v_put->'notice_ids');
  perform plan_h_remember(p, 'plan_draft_realize', v_ans, p_actor, p_role);
  perform plan_h_finish();
  return v_ans;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range or invalid_parameter_value then
    perform plan_h_raise('bad_input', sqlstate);
end
$f$;

  -- ===== PART 5: BORN CLOSED =====
  ALTER TABLE public.plan_drafts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.plan_draft_pieces ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.plan_drafts, public.plan_draft_pieces, public.v_plan_draft_piece_state
    FROM PUBLIC, anon, authenticated, service_role;
  GRANT SELECT ON public.plan_drafts, public.plan_draft_pieces, public.v_plan_draft_piece_state
    TO service_role, tms_reader, tms_check_runner;
  REVOKE ALL ON SEQUENCE public.plan_drafts_id_seq, public.plan_draft_pieces_id_seq FROM PUBLIC, anon, authenticated, service_role;
  FOREACH v_sig IN ARRAY c_acts || c_helpers LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_sig);
  END LOOP;
  FOREACH v_sig IN ARRAY c_acts LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
  -- the auditor reads the drafts (E4: an open draft past its day by more than 3 days; the rule of D-14): its roles
  -- are NOBYPASSRLS, so the GRANT alone would show them 0 rows. SELECT only, the two auditor roles only.
  CREATE POLICY monitor_read ON public.plan_drafts FOR SELECT TO tms_check_runner, tms_reader USING (true);
  CREATE POLICY monitor_read ON public.plan_draft_pieces FOR SELECT TO tms_check_runner, tms_reader USING (true);

  -- ===== PART 6: PROOFS =====
  FOREACH v_sig IN ARRAY c_acts || c_helpers LOOP
    IF to_regprocedure(v_sig) IS NULL THEN RAISE EXCEPTION '102 proof: % was not created', v_sig; END IF;
  END LOOP;
  SELECT count(*) INTO v_k FROM unnest(c_acts) s
   WHERE (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(s))
     AND has_function_privilege('service_role', to_regprocedure(s), 'EXECUTE')
     AND NOT has_function_privilege('anon', to_regprocedure(s), 'EXECUTE')
     AND NOT has_function_privilege('authenticated', to_regprocedure(s), 'EXECUTE');
  IF v_k <> 8 THEN RAISE EXCEPTION '102 proof: the 8 acts are not definer + service_role only (% of 8)', v_k; END IF;
  SELECT count(*) INTO v_k FROM unnest(c_helpers) s
   WHERE has_function_privilege('anon', to_regprocedure(s), 'EXECUTE') OR has_function_privilege('authenticated', to_regprocedure(s), 'EXECUTE')
      OR has_function_privilege('service_role', to_regprocedure(s), 'EXECUTE');
  IF v_k <> 0 THEN RAISE EXCEPTION '102 proof: % closed helper(s) executable by an API role', v_k; END IF;
  SELECT count(*) INTO v_k FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('plan_drafts', 'plan_draft_pieces', 'v_plan_draft_piece_state')
     AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'));
  IF v_k <> 0 THEN RAISE EXCEPTION '102 proof: % new relation(s) open to an API role beyond SELECT', v_k; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.plan_drafts'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.plan_draft_pieces'::regclass)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('plan_drafts', 'plan_draft_pieces')
          AND policyname = 'monitor_read' AND cmd = 'SELECT'
          AND roles::text[] @> ARRAY['tms_check_runner', 'tms_reader'] AND cardinality(roles) = 2) <> 2
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('plan_drafts', 'plan_draft_pieces')) <> 2 THEN
    RAISE EXCEPTION '102 proof: RLS off, or the policies are not monitor_read (SELECT, the two auditor roles only)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid = 'public.plan_draft_pieces_one'::regclass AND i.indisunique) THEN
    RAISE EXCEPTION '102 proof: the one-draft-per-piece index is not unique';
  END IF;
  IF (SELECT count(*) FROM public.plan_drafts) + (SELECT count(*) FROM public.plan_draft_pieces) <> 0 THEN
    RAISE EXCEPTION '102 proof: a draft row exists';
  END IF;
  -- B-54: exactly two triggers more
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 + 2 THEN RAISE EXCEPTION '102 proof: trigger count % -> % (expected +2)', v_trg0, v_trg1; END IF;
  UPDATE monitoring.checks SET red_value = v_trg1 WHERE id = 'B-54' AND red_value = v_trg0;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> 1 THEN RAISE EXCEPTION '102: B-54 not updated (% rows)', v_k; END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '102 OK: 2 tables (born closed, 0 rows), the state view, 8 acts, 9 closed helpers, 2 policies; triggers % -> %, B-54 = %',
    v_trg0, v_trg1, v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN to_regprocedure('public.plan_draft_realize(jsonb,text,text)') IS NOT NULL THEN '102 OK' ELSE '102 NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('plan_drafts', 'plan_draft_pieces')) AS tables,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
          AND proname IN ('plan_drafts_read', 'plan_draft_history', 'plan_draft_create', 'plan_draft_update', 'plan_draft_pieces',
                          'plan_draft_move', 'plan_draft_delete', 'plan_draft_realize')) AS acts,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value;
