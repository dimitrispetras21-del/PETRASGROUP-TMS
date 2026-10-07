-- 064 ROLLBACK - DRAFT (NOT EXECUTED) - puts B-34 back to the 047b + 057b text (before 064).
-- ONE DO block, ASCII only, then ONE proof SELECT. Writes ONE row of monitoring.checks (B-34.sql_text).
--
-- GUARD. Refuses unless B-34 holds exactly 064's text (md5 27c40fa3d9f1f153ebc43e6e130cd767): a later,
-- different change to B-34 is never overwritten by a stale rollback. Already the 057b text (md5
-- b26af3ea8f32a0ce01984d6f3eb3921d) -> NOTICE, nothing changed.
-- AFTER RUNNING: remove the "session: expired" line from tms-auditor/checks/B-34.sql and regenerate 047b
-- (node tms-auditor/checks/build-seed.mjs), or the catalog and production disagree (principle 3) and the next
-- seed would put 064 back silently.
DO $do$
DECLARE
  v_064_md5 constant text := '27c40fa3d9f1f153ebc43e6e130cd767';
  v_old     constant text := $c$SELECT count(*) FROM app_errors WHERE created_at>now()-interval '24 hours' AND message NOT LIKE 'queue: offline flush%'
 AND message NOT LIKE '_atRetry 422 rule%'$c$;
  v_md5 text;
  v_n   int;
BEGIN
  SELECT md5(sql_text) INTO v_md5 FROM monitoring.checks WHERE id = 'B-34' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '064 rollback refused: monitoring.checks has no B-34 - nothing changed';
  END IF;
  IF v_md5 = md5(v_old) THEN
    RAISE NOTICE '064 rollback: B-34 already holds the 057b text (md5 %) - nothing changed', v_md5;
    RETURN;
  END IF;
  IF v_md5 IS DISTINCT FROM v_064_md5 THEN
    RAISE EXCEPTION '064 rollback refused: B-34 sql_text md5 is %, expected % (the 064 text). It changed after 064 - nothing changed', v_md5, v_064_md5;
  END IF;
  UPDATE monitoring.checks SET sql_text = v_old WHERE id = 'B-34';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 OR md5(v_old) <> 'b26af3ea8f32a0ce01984d6f3eb3921d' THEN
    RAISE EXCEPTION '064 rollback proof: % rows updated or the restored text is not the 057b one (md5 %)', v_n, md5(v_old);
  END IF;
  RAISE NOTICE '064 rollback OK: B-34 md5 % -> %', v_064_md5, md5(v_old);
END
$do$;

-- Expected: one row, is_057b_text = true, md5 b26af3ea8f32a0ce01984d6f3eb3921d.
SELECT id, md5(sql_text) = 'b26af3ea8f32a0ce01984d6f3eb3921d' AS is_057b_text, md5(sql_text) AS md5, enabled
FROM monitoring.checks WHERE id = 'B-34';
