-- 078 ROLLBACK - back to the four old actions. ASCII. ONE DO block, bounded by SET/RESET statement_timeout.
-- audit_log rows are evidence and are never deleted: rows written with confirm/reverse/invoice_override/upload
-- since 078 stay. The old CHECK comes back NOT VALID, so it refuses NEW rows with those actions again (as before
-- 078) without checking the rows already there. With the loud Worker live, every refused row then lands in
-- app_errors, as it did between the Worker deploy and 078.
-- EXPECTED: NOTICE "078 ROLLBACK OK | ..." and COMMIT.
-- statement_timeout before the block (coordinator 28/10: Supabase restarted twice today under heavy reads): the
-- block itself is one statement, so a SET inside it would not bound it. 5s is ample for 14.8k rows.
SET statement_timeout = '5s';
DO $r$
DECLARE v_def text; v_kept bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c
    WHERE c.conrelid = 'public.audit_log'::regclass AND c.conname = 'audit_log_action_check';
  IF v_def IS NULL OR v_def NOT LIKE '%confirm%' THEN RAISE EXCEPTION '078 rollback: 078 is not applied (%) - stop', v_def; END IF;
  SELECT count(*) INTO v_kept FROM public.audit_log WHERE action IN ('confirm','reverse','invoice_override','upload');
  ALTER TABLE public.audit_log DROP CONSTRAINT audit_log_action_check;
  ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check
    CHECK (action = ANY (ARRAY['create','update','delete','cascade_delete']::text[])) NOT VALID;
  RAISE NOTICE '078 ROLLBACK OK | rows kept with the new actions: % | %', v_kept,
    (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.conrelid = 'public.audit_log'::regclass AND c.conname = 'audit_log_action_check');
END
$r$;
-- the SET above lasts for the whole editor tab, so it is reset here; after an ERROR (the dry run always ends in
-- one) the editor stops before this line: run RESET statement_timeout; by hand or close the tab.
RESET statement_timeout;
