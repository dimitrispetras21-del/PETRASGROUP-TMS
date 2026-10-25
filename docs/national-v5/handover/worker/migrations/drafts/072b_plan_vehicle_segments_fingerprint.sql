-- 072b FINGERPRINT - read-only (SELECT only). Run it BEFORE 072b and again AFTER it: every column but read_at_athens
-- must be equal. 072b moves a rule and adds a table; it must change no row and no function of today (model=1),
-- no payroll line, no cost line, no place. The authoritative proofs are inside 072b's block; this is the owner's eye.
-- If dl_md5 or lines_md5 differs, someone saved payroll or costs in between: look at updated_at / created_at.
-- ASCII only. Works before and after 072b (it reads no 072b object).
SELECT
  (SELECT count(*) FROM public.ct_round_trips WHERE model = 1) AS round_trips_v1,
  (SELECT md5(coalesce(string_agg(to_jsonb(rt)::text, '|' ORDER BY rt.id), '')) FROM public.ct_round_trips rt WHERE rt.model = 1) AS rt_md5,
  (SELECT count(*) FROM public.dl_entries) AS dl_rows,
  (SELECT md5(coalesce(string_agg(to_jsonb(e)::text, '|' ORDER BY e.id), '')) FROM public.dl_entries e) AS dl_md5,
  (SELECT count(*) FROM public.ct_cost_lines) AS cost_lines,
  (SELECT md5(coalesce(string_agg(to_jsonb(l)::text, '|' ORDER BY l.id), '')) FROM public.ct_cost_lines l) AS lines_md5,
  (SELECT count(*) FROM public.locations) AS locations,
  -- the functions of today: every rt_* / dl_* / ct_* text (072b changes none of them)
  (SELECT md5(string_agg(p.proname || ':' || md5(p.prosrc), ',' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'rt\_%' OR p.proname LIKE 'dl\_%' OR p.proname LIKE 'ct\_%')) AS today_fn_md5,
  -- plan_move_pieces is NOT read here any more: owner question 7 = (b), 25/10, gives it (and plan_delete, and
  -- plan_rt_update) one hook - a handover the Move leaves outside the cycle is listed and removed after the token.
  -- Its text before and after is proved inside 072b (PART 6, md5 at every hook), in the verify (hooks_in_place)
  -- and by the rollback (byte for byte back); a move_md5 here would differ by design and teach the owner to ignore
  -- a difference in this row (principle 1).
  now() AT TIME ZONE 'Europe/Athens' AS read_at_athens;
