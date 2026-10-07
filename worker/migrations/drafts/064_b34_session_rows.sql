-- 064 - DRAFT (NOT EXECUTED) - B-34 and B-34b stop counting the routine end of a login; loops still count.
-- ONE DO block (lesson 056: the SQL editor is not atomic), ASCII only (the clipboard has mangled Greek
-- before), then ONE proof SELECT. Writes TWO rows of monitoring.checks (B-34.sql_text, B-34b.sql_text),
-- nothing else. All or nothing: a refusal on either check undoes both.
--
-- WHY. 5/10 21:11-21:15 UTC one Windows PC wrote 2010 app_errors rows ("preload_...: Unauthorized"), one per
-- request after its login was refused, and kept B-34 red for a day. The front end of branch
-- fix/session-expired-quiet stops that: after the first 401 nothing is sent, and the end of the session is
-- written per browser TAB as "session: ..." rows (core/session-streak.js tmsStreakNote):
--   session: expired -> login (user X; ...)               ROUTINE: an 8 h login ended. Once per tab, so about
--                                                         one per user per working day.
--   session: rejected before expiry -> login (...)        not routine: a 401 while the browser still held the
--                                                         login as valid for > 5 min (clock, refused token)
--   session: login rejected at load - <reason> (...)      not routine: the tamper guard (unknown username)
--   session: redirect loop - N loads in M s (...)         not routine: a tab that keeps loading the app
-- (the real rows carry a Unicode arrow and dash; the LIKE below needs only the ASCII prefix.)
--   B-34  (red > 5 in 24 h): counted, the routine row of 6 users would hold it red every day - an alarm
--         nobody reads.
--   B-34b (red > 0 new first-40-characters in 1 h): the routine row names its user within its first 40
--         characters, so each user's first one after the deploy, and again after 8 days without one, would be
--         a "new message": about 6 red hours that say nothing.
-- Only the FIRST kind is excluded, by its prefix, in both; the other three keep counting. Safe before the
-- front end ships: no row has that prefix yet, so neither check moves.
--
-- GUARDS. Each check must hold exactly the text 047b seeded and 057b extended on 5/10 (= the catalog at
-- main 5d546256, tms-auditor/checks/B-34.sql and B-34b.sql):
--   B-34   md5 b26af3ea8f32a0ce01984d6f3eb3921d  (minus 057b's line: ee5498c631cd9c1b9426ba7cda9d69b2, 057b's guard)
--   B-34b  md5 94d6570352907febd3f4aea2aa98ebeb  (minus 057b's line: 077efbe51163e3630b7a96b3f09fbe96, 057b's guard)
-- Anything else -> RAISE, nothing changed. A check already at 064's text (B-34 27c40fa3d9f1f153ebc43e6e130cd767,
-- B-34b 810faa4eb43bbc660755c640c5a1ec8f) -> NOTICE, that check left as it is (a second paste is harmless).
-- The new texts are tms-auditor/checks/B-34.sql and B-34b.sql of this branch byte for byte;
-- tms-auditor/test/dryrun-064.test.mjs pins every md5 and both texts to the catalog, runs this file and its
-- rollback on PGlite, and proves which "session:" rows each check counts.
-- Reverse: 064_b34_session_rows_rollback.sql.
DO $do$
DECLARE
  v_b34_old_md5  constant text := 'b26af3ea8f32a0ce01984d6f3eb3921d';
  v_b34_new      constant text := $c$SELECT count(*) FROM app_errors WHERE created_at>now()-interval '24 hours' AND message NOT LIKE 'queue: offline flush%'
 AND message NOT LIKE '_atRetry 422 rule%'
 AND message NOT LIKE 'session: expired%'$c$;
  v_b34b_old_md5 constant text := '94d6570352907febd3f4aea2aa98ebeb';
  v_b34b_new     constant text := $c$SELECT count(DISTINCT left(e.message,40)) FROM app_errors e WHERE e.created_at>now()-interval '1 hour' AND e.message NOT LIKE 'queue: offline flush%'
 AND NOT EXISTS (SELECT 1 FROM app_errors p WHERE left(p.message,40)=left(e.message,40) AND p.created_at BETWEEN now()-interval '8 days' AND now()-interval '1 hour')
 AND e.message NOT LIKE '_atRetry 422 rule%'
 AND e.message NOT LIKE 'session: expired%'$c$;
  r     record;
  v_md5 text;
  v_n   int;
  v     numeric;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  FOR r IN SELECT * FROM (VALUES ('B-34', v_b34_old_md5, v_b34_new), ('B-34b', v_b34b_old_md5, v_b34b_new)) AS t(id, old_md5, new_text) LOOP
    SELECT md5(sql_text) INTO v_md5 FROM monitoring.checks WHERE id = r.id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION '064 refused: monitoring.checks has no % - nothing changed', r.id;
    END IF;
    IF v_md5 = md5(r.new_text) THEN
      RAISE NOTICE '064: % already holds the 064 text (md5 %) - left as it is', r.id, v_md5;
      CONTINUE;
    END IF;
    IF v_md5 IS DISTINCT FROM r.old_md5 THEN
      RAISE EXCEPTION '064 refused: % sql_text md5 is %, expected % (the 047b + 057b text). Someone changed it since 5/10 - nothing changed; re-read it and regenerate 064', r.id, v_md5, r.old_md5;
    END IF;

    UPDATE monitoring.checks SET sql_text = r.new_text WHERE id = r.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN RAISE EXCEPTION '064 proof: % rows of % updated, expected 1', v_n, r.id; END IF;

    -- Proof: the new text passes the in-DB guard and runs as the auditor runs it (monitoring.run_checks), so a
    -- check that would error at its first hourly run fails HERE and every UPDATE above is undone with it.
    PERFORM monitoring.check_sql_guard(r.new_text);
    SET LOCAL ROLE tms_check_runner;
    EXECUTE r.new_text INTO v;
    RESET ROLE;
    IF v IS NULL THEN RAISE EXCEPTION '064 proof: % returned NULL', r.id; END IF;
    RAISE NOTICE '064 OK: % md5 % -> %, now = %', r.id, r.old_md5, md5(r.new_text), v;
  END LOOP;
END
$do$;

-- Expected: two rows, is_064_text = true, md5 27c40fa3d9f1f153ebc43e6e130cd767 (B-34) and 810faa4eb43bbc660755c640c5a1ec8f (B-34b).
SELECT id, md5(sql_text) = CASE id WHEN 'B-34' THEN '27c40fa3d9f1f153ebc43e6e130cd767' ELSE '810faa4eb43bbc660755c640c5a1ec8f' END AS is_064_text,
       md5(sql_text) AS md5, enabled, red_op, red_value
FROM monitoring.checks WHERE id IN ('B-34', 'B-34b') ORDER BY id;
