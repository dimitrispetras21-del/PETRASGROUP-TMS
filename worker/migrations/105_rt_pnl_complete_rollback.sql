-- 105 ROLLBACK - takes 105 back: drops its three views (105 changes nothing else).
-- Run only on the coordinator's word, AFTER 15:00, in the Supabase SQL editor; dry run first
-- (105_rt_pnl_complete_rollback_dryrun.sql). ASCII only. ONE DO block = ONE statement.
-- Before: the Worker / screens that read the 105 views must be rolled back first (they would answer 500 on a missing
-- view - loud, never a silent 0). A view a later migration built on one of them makes the DROP fail - loud, nothing
-- dropped. A view whose text is no longer the md5 it signed in its comment (a later migration replaced it) makes the
-- rollback refuse before it drops anything - loud, nothing dropped.
-- EXPECTED: NOTICE "105 ROLLBACK OK: ..." within seconds.

SET statement_timeout = '30s';

DO $do$
DECLARE
  c_rev_live CONSTANT text := '4b6fd9a9674d57d87c303d6500940f36';
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('search_path', 'public', true);
  IF to_regclass('public.ct_v_rt_revenue_legs') IS NULL AND to_regclass('public.ct_v_rt_cost_cat') IS NULL
     AND to_regclass('public.ct_v_rt_complete') IS NULL THEN
    RAISE EXCEPTION '105 rollback: none of the 105 views is there - 105 has not run, nothing to reverse';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['public.ct_v_rt_revenue_legs', 'public.ct_v_rt_cost_cat', 'public.ct_v_rt_complete']) v(rel)
             WHERE to_regclass(v.rel) IS NOT NULL
               AND substring(COALESCE(obj_description(to_regclass(v.rel), 'pg_class'), '') FROM 'md5 ([0-9a-f]{32})$')
                   IS DISTINCT FROM md5(pg_get_viewdef(to_regclass(v.rel), true))) THEN
    RAISE EXCEPTION '105 rollback: a 105 view is no longer the text 105 created (a later migration replaced it) - stop, ask the coordinator';
  END IF;
  EXECUTE 'DROP VIEW IF EXISTS public.ct_v_rt_complete';
  EXECUTE 'DROP VIEW IF EXISTS public.ct_v_rt_cost_cat';
  EXECUTE 'DROP VIEW IF EXISTS public.ct_v_rt_revenue_legs';
  IF to_regclass('public.ct_v_rt_revenue_legs') IS NOT NULL OR to_regclass('public.ct_v_rt_cost_cat') IS NOT NULL
     OR to_regclass('public.ct_v_rt_complete') IS NOT NULL THEN
    RAISE EXCEPTION '105 rollback proof: a 105 view is still there';
  END IF;
  IF md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) <> c_rev_live THEN
    RAISE NOTICE '105 rollback: ct_v_rt_revenue is no longer the 3/11 text (md5 %) - 105 never changed it, a later migration did',
      md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true));
  END IF;
  RAISE NOTICE '105 ROLLBACK OK: the three 105 views dropped';
END $do$;
