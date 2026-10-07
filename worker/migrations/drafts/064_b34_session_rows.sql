-- 064 - DRAFT (NOT EXECUTED) - B-34 stops counting the routine end of a login; loops still count.
-- ONE DO block (lesson 056: the SQL editor is not atomic), ASCII only (the clipboard has mangled Greek
-- before), then ONE proof SELECT. Writes ONE row of monitoring.checks (B-34.sql_text), nothing else.
--
-- WHY. 5/10 21:11-21:15 UTC one Windows PC wrote 2010 app_errors rows ("preload_...: Unauthorized"), one per
-- request after its login was refused, and kept B-34 red for a day. The front end of branch
-- fix/session-expired-quiet stops that: after the first 401 nothing is sent, and the end of the session is
-- written per browser TAB as "session: ..." rows (core/api.js _tmsStreakNote):
--   session: expired -> login (user X; ...)               ROUTINE: an 8 h login ended. Once per tab, so about
--                                                         one per user per working day.
--   session: rejected before expiry -> login (...)        not routine: a 401 while the browser still held the
--                                                         login as valid for > 5 min (clock, refused token)
--   session: login rejected at load - <reason> (...)      not routine: the tamper guard (unknown username)
--   session: redirect loop - N loads in M s (...)         not routine: a tab that keeps loading the app
-- (the real rows carry a Unicode arrow and dash; the LIKE below needs only the ASCII prefix.) Counted, the routine row of 6
-- users would hold B-34 (red > 5 in 24 h) red every day - an alarm nobody reads. Only the FIRST kind is
-- excluded, by its prefix; the other three keep counting. Safe before the front end ships: no row has
-- that prefix yet, so the count does not move.
--
-- GUARD. B-34 must hold exactly the text 047b seeded and 057b extended on 5/10:
--   md5 b26af3ea8f32a0ce01984d6f3eb3921d = tms-auditor/checks/B-34.sql at main 2fceaafd
--   (and that text minus 057b's line = ee5498c631cd9c1b9426ba7cda9d69b2, the md5 057b itself guarded).
-- Anything else -> RAISE, nothing changed. Already 064's text (md5 27c40fa3d9f1f153ebc43e6e130cd767)
-- -> NOTICE, nothing changed (a second paste is harmless).
-- The new text is tms-auditor/checks/B-34.sql of this branch byte for byte; tms-auditor/test/dryrun-064.test.mjs
-- pins both md5s and this text to the catalog, runs this file and its rollback on PGlite, and proves which
-- "session:" rows B-34 counts.
-- Reverse: 064_b34_session_rows_rollback.sql.
DO $do$
DECLARE
  v_old_md5 constant text := 'b26af3ea8f32a0ce01984d6f3eb3921d';
  v_new     constant text := $c$SELECT count(*) FROM app_errors WHERE created_at>now()-interval '24 hours' AND message NOT LIKE 'queue: offline flush%'
 AND message NOT LIKE '_atRetry 422 rule%'
 AND message NOT LIKE 'session: expired%'$c$;
  v_md5 text;
  v_n   int;
  v     numeric;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  SELECT md5(sql_text) INTO v_md5 FROM monitoring.checks WHERE id = 'B-34' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '064 refused: monitoring.checks has no B-34 - nothing changed';
  END IF;
  IF v_md5 = md5(v_new) THEN
    RAISE NOTICE '064: B-34 already holds the 064 text (md5 %) - nothing changed', v_md5;
    RETURN;
  END IF;
  IF v_md5 IS DISTINCT FROM v_old_md5 THEN
    RAISE EXCEPTION '064 refused: B-34 sql_text md5 is %, expected % (the 047b + 057b text). Someone changed it since 5/10 - nothing changed; re-read it and regenerate 064', v_md5, v_old_md5;
  END IF;

  UPDATE monitoring.checks SET sql_text = v_new WHERE id = 'B-34';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '064 proof: % rows updated, expected 1', v_n; END IF;

  -- Proof: the new text passes the in-DB guard and runs as the auditor runs it (monitoring.run_checks), so a
  -- check that would error at its first hourly run fails HERE and the UPDATE above is undone with it.
  PERFORM monitoring.check_sql_guard(v_new);
  SET LOCAL ROLE tms_check_runner;
  EXECUTE v_new INTO v;
  RESET ROLE;
  IF v IS NULL THEN RAISE EXCEPTION '064 proof: B-34 returned NULL'; END IF;
  RAISE NOTICE '064 OK: B-34 md5 % -> %, B-34 now = %', v_old_md5, md5(v_new), v;
END
$do$;

-- Expected: one row, is_064_text = true, md5 27c40fa3d9f1f153ebc43e6e130cd767.
SELECT id, md5(sql_text) = '27c40fa3d9f1f153ebc43e6e130cd767' AS is_064_text, md5(sql_text) AS md5, enabled, red_op, red_value
FROM monitoring.checks WHERE id = 'B-34';
