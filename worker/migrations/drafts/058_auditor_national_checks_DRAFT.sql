-- 058 — four national checks for the tms-auditor (B-59 … B-62).
-- DRAFT · NOT EXECUTED · the owner runs it in the SQL editor (ONE DO block — lesson of 056:
-- the editor is not atomic across statements; inside one DO block a failure rolls back ALL).
-- Touches ONLY monitoring.checks (schema monitoring, live since 27/9 via 047/047b/048/050).
-- No TMS table, no TMS data, no Worker, no front end.
--
-- Why (owner 4/10/2026, national readiness report .claude/plans/national-readiness-2026-10-05.md
-- §4 «Για να το μαθαίνουμε όταν κάτι σπάει», principle 1): Sotiris starts the national desk on
-- Mon 5/10. Four ways national work can go wrong without anyone seeing it:
--   B-59  report §4 #1 (WN-02/SA-2/N-12): a national load with a vehicle but no round trip ⇒ the
--         driver is not paid and costs land on no RT. 0 of 243 RT legs are national today.
--   B-60  report §4 #6 + PU-1: groupage lines left «Unassigned» ⇒ a supplier is never collected
--         (the drag & drop queue that would pick them up is not worked by anyone).
--   B-61  report §4 #2 (SA-1/WN-04): a VS national leg auto-closed «Delivered» with no truck and
--         no partner ⇒ stays red «ΠΡΟΣ ΑΝΑΘΕΣΗ» forever, nobody knows who ran it.
--   B-62  report §3 P1-α (wave 0, commit f1419375): a multi-stop national order whose delivery
--         stops were written with 0/NULL pallets ⇒ wrong Weekly load and pallet ledger.
--
-- «Only what is new» (owner 28/9: «αστα αυτα μην ασχολεισαι συνεχεια»): B-59 and B-61 count ONLY
-- from 5/10/2026 on (delivery date, Athens), so the 14 assigned loads and the 40 vehicle-less VS
-- legs of the past (§8.2: «τα 40 παλιά μένουν ως έχουν») never raise an incident. B-60 skips lines
-- reset by the never-delete rule (parent no longer groupage / cancelled / deleted).
--
-- Measured read-only on production 4/10/2026 16:19 Athens (Supabase MCP, SELECT only), with the
-- EXACT sql_text below:
--   B-59 = 0   (without the 5/10 cut it would be 14 — all historical, no national RT exists)
--   B-60 = 0   (2 groupage lines in total, both Assigned to consolidated load 5)
--   B-61 = 0   (without the cut 40 of the 45 Delivered VS legs; loads 121/122 deliver 5/10, no
--               vehicle yet — B-61 WILL count them if they close without an executor)
--   B-62 = 0   (no national order has 2+ delivery stops today; 7 SINGLE-stop orders do have a
--               0-pallet delivery stop — outside this check by design, report item = multi-stop)
-- The 8 statements (4 counts + 4 id lists) were linted with tms-auditor/checks/load.mjs lintSql
-- (same allow-list as check_sql_guard) — all OK — and run verbatim: 0/{} for each.
--
-- B-59 is EXPECTED to go red as soon as Sotiris assigns a national load delivered ≥ 5/10: no
-- mechanism creates national RTs until 034 (DRAFT, owner decision §8.1; proposed backfill from
-- 5/10). Deliberately red, not a queue: its ids are the loads Thodoris enters by hand as «trip»
-- lines this week, and when 034 runs with its backfill the check turns green BY ITSELF and becomes
-- a real alarm — no later flip to forget (principle 8). Severity P2 ⇒ 17:00 digest, never a push.
--
-- Mechanism followed exactly (047): one row per check in monitoring.checks; run_checks(tag) runs
-- sql_text (ONE number) and ids_sql (≤ 50 ids) as tms_check_runner (SELECT only — every table
-- read here is already in its 047 GRANT list: national_loads, groupage_lines, national_orders,
-- order_stops, orders, ct_rt_legs, ct_round_trips); check_sql_guard() allows only count/coalesce/
-- exists/…; 'executor' = truck_id OR (is_partner_trip AND partner_id) — the SAME rule as B-01,
-- trigger 033 and 034 l.144-145. Statuses verified 4/10: national_loads.source_type
-- Direct(=VS)/National/Groupage; groupage_lines.status Assigned/Unassigned; RT status 'cancelled'.
--
-- Catalog note (principle 3): tms-auditor/checks/*.sql is the repo source of 047b. These four rows
-- are NOT yet there as files; adding B-59…B-62.sql + regenerating 047b is a follow-up (the
-- seed-drift test guards 047b, not this file).
--
-- Idempotent: INSERT … ON CONFLICT (id) DO UPDATE (same form as 047b) — safe to re-run.
-- Reverse:   DELETE FROM monitoring.results WHERE check_id IN ('B-59','B-60','B-61','B-62');
--            DELETE FROM monitoring.checks  WHERE id       IN ('B-59','B-60','B-61','B-62');
--            (or, keeping history: UPDATE monitoring.checks SET enabled=false,
--             disabled_reason='…' WHERE id IN (…) — reported as a GAP, never green)

DO $do$
DECLARE r record; v numeric; ids text[]; n int;
BEGIN
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '058: monitoring.checks does not exist — 047 must run first';
  END IF;

  INSERT INTO monitoring.checks (id, title, flows, sql_text, ids_sql, entity_table, red_op, red_value, baseline, severity,
    schedule_tag, is_queue, impact, next_step, exceptions, tolerance, enabled, disabled_reason) VALUES
  ($m$B-59$m$, $m$Εθνικό φορτίο με όχημα χωρίς γύρο (RT) — από 5/10$m$, ARRAY[$m$F-23$m$,$m$F-14$m$,$m$F-35$m$]::text[],
   $m$SELECT count(*) FROM national_loads nl WHERE nl.deleted_at IS NULL AND coalesce(nl.status,'')<>'Cancelled'
 AND (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
 AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date, (nl.loading_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05'
 AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.nat_load_id=nl.id AND r.status<>'cancelled')$m$,
   $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT nl.legacy_id AS x FROM national_loads nl WHERE nl.deleted_at IS NULL AND coalesce(nl.status,'')<>'Cancelled'
 AND (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
 AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date, (nl.loading_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05'
 AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.nat_load_id=nl.id AND r.status<>'cancelled') LIMIT 50) s$m$,
   $m$national_loads$m$, $m$>$m$, 0, NULL, $m$P2$m$, $m$daily$m$, false,
   $m$Ο οδηγός του εθνικού δεν πληρώνεται αυτόματα και τα έξοδα του φορτηγού δεν προσγειώνονται σε κανένα γύρο.$m$,
   $m$Μισθοδοσία → υπάρχει χειροκίνητη γραμμή «trip» για το φορτίο; (ανάγνωση)$m$,
   $m$Μέχρι να τρέξει το 034 (απόφαση owner §8.1) ΚΑΘΕ ανατεθειμένο εθνικό από 5/10 μετρά — αναμενόμενο κόκκινο, τα ids = οι γραμμές «trip» που περνά χειροκίνητα ο Θοδωρής. Με το 034 + backfill από 5/10 πρασινίζει μόνο του. Φορτία με παράδοση πριν 5/10 εκτός (14 ιστορικά).$m$,
   NULL, true, NULL),
  ($m$B-60$m$, $m$Γραμμές groupage «Unassigned» σε ζωντανή παραγγελία groupage$m$, ARRAY[$m$F-11$m$,$m$F-25$m$]::text[],
   $m$SELECT count(*) FROM groupage_lines g LEFT JOIN orders o ON o.id=g.order_id LEFT JOIN national_orders n ON n.id=g.national_order_id
 WHERE g.deleted_at IS NULL AND g.status='Unassigned' AND g.created_at < now()-interval '15 minutes'
 AND ((g.order_id IS NOT NULL AND o.deleted_at IS NULL AND coalesce(o.status,'')<>'Cancelled' AND coalesce(o.national_groupage,false))
   OR (g.national_order_id IS NOT NULL AND n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND coalesce(n.national_groupage,false)))$m$,
   $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT g.legacy_id AS x FROM groupage_lines g LEFT JOIN orders o ON o.id=g.order_id LEFT JOIN national_orders n ON n.id=g.national_order_id
 WHERE g.deleted_at IS NULL AND g.status='Unassigned' AND g.created_at < now()-interval '15 minutes'
 AND ((g.order_id IS NOT NULL AND o.deleted_at IS NULL AND coalesce(o.status,'')<>'Cancelled' AND coalesce(o.national_groupage,false))
   OR (g.national_order_id IS NOT NULL AND n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND coalesce(n.national_groupage,false))) LIMIT 50) s$m$,
   $m$groupage_lines$m$, $m$>$m$, 0, NULL, $m$P2$m$, $m$hourly$m$, false,
   $m$Γραμμή groupage χωρίς φορτηγό — ο προμηθευτής δεν παραλαμβάνεται και δεν φαίνεται σε καμία στήλη του Εβδομαδιαίου Εθνικών.$m$,
   $m$Εβδομαδιαίο Εθνικών / Παραγγελίες → Groupage: σε ποιο φορτηγό έπρεπε να μπει η γραμμή; (ανάγνωση)$m$,
   $m$Γραμμές που επανήλθαν σε Unassigned με τον κανόνα never-delete (η παραγγελία δεν είναι πια groupage, ακυρώθηκε ή διαγράφηκε) ΔΕΝ μετρούν.$m$,
   $m$15′ (γραμμές και φορτηγό γράφονται σε χωριστά αιτήματα)$m$, true, NULL),
  ($m$B-61$m$, $m$VS εθνικό σκέλος «Delivered» χωρίς εκτελεστή — από 5/10$m$, ARRAY[$m$F-10$m$,$m$F-23$m$,$m$F-26$m$]::text[],
   $m$SELECT count(*) FROM national_loads nl WHERE nl.deleted_at IS NULL AND nl.source_type='Direct' AND nl.status='Delivered'
 AND NOT (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
 AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05'$m$,
   $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT nl.legacy_id AS x FROM national_loads nl WHERE nl.deleted_at IS NULL AND nl.source_type='Direct' AND nl.status='Delivered'
 AND NOT (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
 AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05' LIMIT 50) s$m$,
   $m$national_loads$m$, $m$>$m$, 0, NULL, $m$P2$m$, $m$hourly$m$, false,
   $m$Το VS σκέλος έκλεισε αυτόματα με τη διεθνή χωρίς φορτηγό/συνεργάτη: μένει για πάντα «ΠΡΟΣ ΑΝΑΘΕΣΗ», δεν δέχεται ανάθεση και κανείς δεν ξέρει ποιος το εκτέλεσε (μισθοδοσία, RT).$m$,
   $m$Εβδομαδιαίο Εθνικών → το σκέλος· ρώτα τον Σωτήρη ποιο φορτηγό το έκανε (ανάγνωση — η ανάθεση σε κλειστό σκέλος περιμένει την απόφαση §8.2).$m$,
   $m$Σκέλη με παράδοση πριν 5/10 εκτός (40 από 45 παραδομένα VS, «μένουν ως έχουν» §8.2). Μόνο source_type='Direct' (VS).$m$,
   NULL, true, NULL),
  ($m$B-62$m$, $m$Εθνική πολυστάσια με στάση παράδοσης 0/κενές παλέτες$m$, ARRAY[$m$F-12$m$]::text[],
   $m$SELECT count(*) FROM national_orders n WHERE n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND n.created_at < now()-interval '15 minutes'
 AND (SELECT count(*) FROM order_stops s WHERE s.national_order_id=n.id AND s.deleted_at IS NULL AND s.stop_type='Unloading') >= 2
 AND (EXISTS (SELECT 1 FROM order_stops s WHERE s.national_order_id=n.id AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND coalesce(s.pallets,0)<=0)
   OR EXISTS (SELECT 1 FROM order_stops s JOIN national_loads l ON l.id=s.national_load_id WHERE l.source_national_order_id=n.id AND l.deleted_at IS NULL AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND coalesce(s.pallets,0)<=0))$m$,
   $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT n.legacy_id AS x FROM national_orders n WHERE n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND n.created_at < now()-interval '15 minutes'
 AND (SELECT count(*) FROM order_stops s WHERE s.national_order_id=n.id AND s.deleted_at IS NULL AND s.stop_type='Unloading') >= 2
 AND (EXISTS (SELECT 1 FROM order_stops s WHERE s.national_order_id=n.id AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND coalesce(s.pallets,0)<=0)
   OR EXISTS (SELECT 1 FROM order_stops s JOIN national_loads l ON l.id=s.national_load_id WHERE l.source_national_order_id=n.id AND l.deleted_at IS NULL AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND coalesce(s.pallets,0)<=0)) LIMIT 50) s$m$,
   $m$national_orders$m$, $m$>$m$, 0, NULL, $m$P2$m$, $m$hourly$m$, false,
   $m$Στάση παράδοσης με 0 παλέτες: λάθος φορτίο στο Εβδομαδιαίο Εθνικών και λάθος κίνηση στο Ισοζύγιο παλετών (το σφάλμα μηδενισμού του Κύματος 0).$m$,
   $m$Άνοιγμα της εθνικής → παλέτες ανά σημείο παράδοσης (ανάγνωση).$m$,
   $m$Μετρά στάσεις της παραγγελίας (national_order_id) ΚΑΙ του φορτίου της (national_load_id). Μονοστάσιες εκτός.$m$,
   $m$15′ (οι στάσεις γράφονται σε δεύτερο αίτημα)$m$, true, NULL)
  ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, flows=EXCLUDED.flows, sql_text=EXCLUDED.sql_text,
    ids_sql=EXCLUDED.ids_sql, entity_table=EXCLUDED.entity_table, red_op=EXCLUDED.red_op, red_value=EXCLUDED.red_value,
    baseline=EXCLUDED.baseline, severity=EXCLUDED.severity, schedule_tag=EXCLUDED.schedule_tag, is_queue=EXCLUDED.is_queue,
    impact=EXCLUDED.impact, next_step=EXCLUDED.next_step, exceptions=EXCLUDED.exceptions, tolerance=EXCLUDED.tolerance,
    enabled=EXCLUDED.enabled, disabled_reason=EXCLUDED.disabled_reason;

  -- Proofs INSIDE the block: a guard refusal or a non-numeric result aborts the whole block (nothing kept).
  FOR r IN SELECT id, sql_text, ids_sql FROM monitoring.checks WHERE id IN ('B-59','B-60','B-61','B-62') ORDER BY id LOOP
    PERFORM monitoring.check_sql_guard(r.sql_text);
    PERFORM monitoring.check_sql_guard(r.ids_sql);
    EXECUTE r.sql_text INTO v;
    EXECUTE r.ids_sql INTO ids;
    IF v IS NULL THEN RAISE EXCEPTION '058: % returned NULL', r.id; END IF;
    RAISE NOTICE '058: % = % (ids %)', r.id, v, coalesce(array_to_string(ids, ','), '');
  END LOOP;
  SELECT count(*) INTO n FROM monitoring.checks WHERE id IN ('B-59','B-60','B-61','B-62') AND enabled;
  IF n <> 4 THEN RAISE EXCEPTION '058: expected 4 enabled checks, found %', n; END IF;
END $do$;

-- After the block (read-only, run separately — the editor shows the result grid, not NOTICEs):
-- SELECT id, severity, schedule_tag, enabled, title FROM monitoring.checks WHERE id IN ('B-59','B-60','B-61','B-62') ORDER BY id;
--   expect 4 rows, all enabled.
-- Today's value of each check (4/10 16:19 Athens: 0 / 0 / 0 / 0):
-- SELECT 'B-59' AS id, count(*) FROM national_loads nl WHERE nl.deleted_at IS NULL AND coalesce(nl.status,'')<>'Cancelled'
--   AND (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
--   AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date, (nl.loading_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05'
--   AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.nat_load_id=nl.id AND r.status<>'cancelled')
-- UNION ALL
-- SELECT 'B-60', count(*) FROM groupage_lines g LEFT JOIN orders o ON o.id=g.order_id LEFT JOIN national_orders n ON n.id=g.national_order_id
--   WHERE g.deleted_at IS NULL AND g.status='Unassigned' AND g.created_at < now()-interval '15 minutes'
--   AND ((g.order_id IS NOT NULL AND o.deleted_at IS NULL AND coalesce(o.status,'')<>'Cancelled' AND coalesce(o.national_groupage,false))
--     OR (g.national_order_id IS NOT NULL AND n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND coalesce(n.national_groupage,false)))
-- UNION ALL
-- SELECT 'B-61', count(*) FROM national_loads nl WHERE nl.deleted_at IS NULL AND nl.source_type='Direct' AND nl.status='Delivered'
--   AND NOT (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
--   AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05'
-- UNION ALL
-- SELECT 'B-62', count(*) FROM national_orders n WHERE n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND n.created_at < now()-interval '15 minutes'
--   AND (SELECT count(*) FROM order_stops s WHERE s.national_order_id=n.id AND s.deleted_at IS NULL AND s.stop_type='Unloading') >= 2
--   AND (EXISTS (SELECT 1 FROM order_stops s WHERE s.national_order_id=n.id AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND coalesce(s.pallets,0)<=0)
--     OR EXISTS (SELECT 1 FROM order_stops s JOIN national_loads l ON l.id=s.national_load_id WHERE l.source_national_order_id=n.id AND l.deleted_at IS NULL AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND coalesce(s.pallets,0)<=0));
-- The first real run results (after the next hourly/daily cycle):
-- SELECT check_id, run_at, value, status, ids, err FROM monitoring.results WHERE check_id IN ('B-59','B-60','B-61','B-62') ORDER BY run_at DESC LIMIT 8;
