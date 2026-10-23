-- ΔΕΝ ΕΚΤΕΛΕΣΤΗΚΕ — owner, μετά τις 15:00
-- 068 ROLLBACK - removes everything 068_presence.sql created (function presence_beat, table presence)
-- and nothing else. DRAFT - NOT EXECUTED. ASCII only after the first line. ONE DO block (all or nothing).
--
-- WHEN: only if presence must go away, AFTER 15:00, with an explicit yes in the conversation.
-- BEFORE IT: stop the beats first, or every open board turns "Zontani eikona se pafsi" at its next beat
--   (loud, not silent - the Worker answers 503 when the RPC is gone). The fastest stop is the Worker env
--   var PRESENCE_OFF = "1" (Cloudflare dashboard, no Pages deploy): every tab stops for the session at its
--   next beat (TECH_DESIGN g.5). If the Worker route was never deployed, nothing beats - go ahead.
-- DATA: presence rows are indications that expire within 90 s (TTL clamp) - who had which order open a
--   minute ago. Nothing of value is lost, so unlike 060's rollback there is no "refuse while data exists"
--   guard; the notice reports how many live rows were dropped.
-- No CASCADE, on purpose: if anything was built on top of the table or the function since 068 (a view,
--   another function, a policy), the DROP fails loudly and nothing changes - look before forcing.
-- EXPECTED: "Success. No rows returned" (and NOTICE "068 rollback OK: ..."). Proof afterwards:
--   SELECT to_regclass('public.presence'), to_regproc('public.presence_beat');  -> NULL | NULL
-- 068 can run again afterwards (its guards look for exactly these two names).

DO $do$
DECLARE
  n_live int;
  n_all int;
BEGIN
  PERFORM set_config('search_path', 'public, pg_temp', true);
  -- DROP TABLE takes an ACCESS EXCLUSIVE lock; behind an idle open transaction it would wait forever
  -- while every beat queues behind it. Give up after 5 s instead - nothing half-done (as 057/060).
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS
  IF to_regclass('public.presence') IS NULL THEN
    RAISE EXCEPTION '068 rollback: public.presence does not exist - 068 is not applied';
  END IF;
  IF to_regprocedure('public.presence_beat(text,text,text,text,text,integer,text,text,text,integer,boolean,timestamptz,boolean)') IS NULL THEN
    RAISE EXCEPTION '068 rollback: public.presence_beat(13 args) does not exist - not the 068 shape, stop and look';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'presence_beat' AND pronamespace = 'public'::regnamespace) <> 1 THEN
    RAISE EXCEPTION '068 rollback: more than one public.presence_beat exists - not the 068 shape, stop and look';
  END IF;
  SELECT count(*) FILTER (WHERE expires_at > now()), count(*) INTO n_live, n_all FROM public.presence;

  -- 1. REMOVE (function first: it is the only thing that uses the table)
  DROP FUNCTION public.presence_beat(text, text, text, text, text, integer, text, text, text,
                                     integer, boolean, timestamptz, boolean);
  DROP TABLE public.presence;

  -- 2. PROOF
  IF to_regclass('public.presence') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'presence_beat' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION '068 rollback proof: an object is still there';
  END IF;

  RAISE NOTICE '068 rollback OK: presence_beat and presence removed (% live / % total presence rows dropped)', n_live, n_all;
END
$do$;
