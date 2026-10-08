-- 064 ROLLBACK - DRAFT (NOT EXECUTED) - puts B-34 and B-34b back to the 047b + 057b texts (before 064).
-- ONE DO block, ASCII only, then ONE proof SELECT. Writes TWO rows of monitoring.checks (B-34.sql_text,
-- B-34b.sql_text). All or nothing: a refusal on either check undoes both.
--
-- GUARDS. Each check must hold exactly 064's text (B-34 md5 27c40fa3d9f1f153ebc43e6e130cd767, B-34b md5
-- 810faa4eb43bbc660755c640c5a1ec8f): a later, different change is never overwritten by a stale rollback.
-- A check already at the 057b text (B-34 b26af3ea8f32a0ce01984d6f3eb3921d, B-34b
-- 94d6570352907febd3f4aea2aa98ebeb) -> NOTICE, that check left as it is.
-- AFTER RUNNING: remove the "session: expired" line from tms-auditor/checks/B-34.sql and B-34b.sql and
-- regenerate 047b (node tms-auditor/checks/build-seed.mjs), or the catalog and production disagree
-- (principle 3) and the next seed would put 064 back silently.
DO $do$
DECLARE
  v_b34_064_md5  constant text := '27c40fa3d9f1f153ebc43e6e130cd767';
  v_b34_old      constant text := $c$SELECT count(*) FROM app_errors WHERE created_at>now()-interval '24 hours' AND message NOT LIKE 'queue: offline flush%'
 AND message NOT LIKE '_atRetry 422 rule%'$c$;
  v_b34b_064_md5 constant text := '810faa4eb43bbc660755c640c5a1ec8f';
  v_b34b_old     constant text := $c$SELECT count(DISTINCT left(e.message,40)) FROM app_errors e WHERE e.created_at>now()-interval '1 hour' AND e.message NOT LIKE 'queue: offline flush%'
 AND NOT EXISTS (SELECT 1 FROM app_errors p WHERE left(p.message,40)=left(e.message,40) AND p.created_at BETWEEN now()-interval '8 days' AND now()-interval '1 hour')
 AND e.message NOT LIKE '_atRetry 422 rule%'$c$;
  r     record;
  v_md5 text;
  v_n   int;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('B-34', v_b34_064_md5, v_b34_old, 'b26af3ea8f32a0ce01984d6f3eb3921d'),
                                 ('B-34b', v_b34b_064_md5, v_b34b_old, '94d6570352907febd3f4aea2aa98ebeb'))
           AS t(id, md5_064, old_text, old_md5) LOOP
    SELECT md5(sql_text) INTO v_md5 FROM monitoring.checks WHERE id = r.id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION '064 rollback refused: monitoring.checks has no % - nothing changed', r.id;
    END IF;
    IF v_md5 = md5(r.old_text) THEN
      RAISE NOTICE '064 rollback: % already holds the 057b text (md5 %) - left as it is', r.id, v_md5;
      CONTINUE;
    END IF;
    IF v_md5 IS DISTINCT FROM r.md5_064 THEN
      RAISE EXCEPTION '064 rollback refused: % sql_text md5 is %, expected % (the 064 text). It changed after 064 - nothing changed', r.id, v_md5, r.md5_064;
    END IF;
    UPDATE monitoring.checks SET sql_text = r.old_text WHERE id = r.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 OR md5(r.old_text) <> r.old_md5 THEN
      RAISE EXCEPTION '064 rollback proof: % rows of % updated or the restored text is not the 057b one (md5 %)', v_n, r.id, md5(r.old_text);
    END IF;
    RAISE NOTICE '064 rollback OK: % md5 % -> %', r.id, r.md5_064, md5(r.old_text);
  END LOOP;
END
$do$;

-- Expected: two rows, is_057b_text = true, md5 b26af3ea8f32a0ce01984d6f3eb3921d (B-34) and 94d6570352907febd3f4aea2aa98ebeb (B-34b).
SELECT id, md5(sql_text) = CASE id WHEN 'B-34' THEN 'b26af3ea8f32a0ce01984d6f3eb3921d' ELSE '94d6570352907febd3f4aea2aa98ebeb' END AS is_057b_text,
       md5(sql_text) AS md5, enabled
FROM monitoring.checks WHERE id IN ('B-34', 'B-34b') ORDER BY id;
