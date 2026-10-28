-- 075 · audit_log accepts every action the Worker writes (owner 28/10, Υ2: «παμε Α»). ASCII. ONE DO block.
-- Why: audit_log_action_check accepted only create/update/delete/cascade_delete, so the Worker's confirm, reverse,
-- invoice_override and upload rows were refused and audit() kept it to console.error (A41). Measured 28/10:
-- 0 of 215 confirmations, 0 reversals, 0 invoice overrides in audit_log. The 140+ lost confirmations are NOT
-- recovered: the history screen reads them from the movement itself (confirmed_by/confirmed_at) and says so.
-- The Worker list (worker/src/index.js, every audit()/auditMany() call, 28/10): create, update, delete,
-- cascade_delete, confirm, reverse, invoice_override, upload. No grant or revoke: the constraint widens only.
-- Rows already there all hold one of the four old actions (measured 14 826 rows, 0 outside), so the new CHECK
-- validates them all; the block proves it before and after.
-- EXPECTED: NOTICE "075 OK | ..." and COMMIT.
DO $m$
DECLARE
  v_def text; v_rows bigint; v_bad bigint; v_ok int := 0;
  v_new text[] := ARRAY['create','update','delete','cascade_delete','confirm','reverse','invoice_override','upload'];
  v_a text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- 0. GUARDS: the constraint is the one measured, and nothing else changed it
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c
    WHERE c.conrelid = 'public.audit_log'::regclass AND c.conname = 'audit_log_action_check';
  IF v_def IS NULL THEN RAISE EXCEPTION '075: audit_log_action_check not found - stop, re-measure'; END IF;
  IF v_def LIKE '%confirm%' THEN RAISE EXCEPTION '075: already applied (%) - stop', v_def; END IF;
  IF v_def NOT LIKE '%create%' OR v_def NOT LIKE '%update%' OR v_def NOT LIKE '%delete%' OR v_def NOT LIKE '%cascade_delete%' THEN
    RAISE EXCEPTION '075: unexpected definition % - stop, re-measure', v_def;
  END IF;
  SELECT count(*), count(*) FILTER (WHERE NOT (action = ANY (v_new))) INTO v_rows, v_bad FROM public.audit_log;
  IF v_bad <> 0 THEN RAISE EXCEPTION '075: % rows hold an action outside the new list - stop', v_bad; END IF;

  -- 1. THE CHANGE: same name, wider list
  ALTER TABLE public.audit_log DROP CONSTRAINT audit_log_action_check;
  ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check CHECK (action = ANY (ARRAY['create','update','delete','cascade_delete','confirm','reverse','invoice_override','upload']::text[]));

  -- 2. PROOF, in subtransactions that leave no row: every Worker action is accepted, an unknown one still refused
  FOREACH v_a IN ARRAY v_new LOOP
    BEGIN
      INSERT INTO public.audit_log (actor, role, action, table_name, record_id, created_at)
        VALUES ('075-proof', 'owner', v_a, 'pl_movements', '075-proof', now());
      v_ok := v_ok + 1;
      RAISE EXCEPTION USING ERRCODE = 'P0075', MESSAGE = 'undo proof row';
    EXCEPTION WHEN SQLSTATE 'P0075' THEN NULL;
    END;
  END LOOP;
  IF v_ok <> array_length(v_new, 1) THEN RAISE EXCEPTION '075: only % of % actions accepted', v_ok, array_length(v_new, 1); END IF;
  BEGIN
    INSERT INTO public.audit_log (actor, role, action, table_name, record_id, created_at)
      VALUES ('075-proof', 'owner', 'bogus', 'pl_movements', '075-proof', now());
    RAISE EXCEPTION '075: an unknown action was accepted - the CHECK does not hold';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.audit_log WHERE actor = '075-proof') THEN RAISE EXCEPTION '075: a proof row was left'; END IF;
  IF (SELECT count(*) FROM public.audit_log) < v_rows THEN RAISE EXCEPTION '075: rows lost'; END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c
    WHERE c.conrelid = 'public.audit_log'::regclass AND c.conname = 'audit_log_action_check';
  RAISE NOTICE '075 OK | rows % | accepted % of 8 | unknown refused | %', v_rows, v_ok, v_def;
END
$m$;
