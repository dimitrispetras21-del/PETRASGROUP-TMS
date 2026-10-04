-- 058 — four national checks for the tms-auditor (B-59 … B-62) + audit_log parse fix for 8 existing
--       checks (B-36, B-53, P-02…P-06, P-08).
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
--         (the drag & drop queue that would pick them up is not worked by anyone). «Unassigned» is
--         normal until the line is dragged into a truck, so only lines LOADING BY TOMORROW (Athens
--         date — groupage_lines.loading_date is type date, checked 4/10; a NULL counts, 0 today) are red — review 4/10: a line
--         loading in 3 weeks is not a finding.
--   B-61  report §4 #2 (SA-1/WN-04): a VS national leg whose delivery time has passed with no truck
--         and no partner ⇒ stays «ΠΡΟΣ ΑΝΑΘΕΣΗ», nobody knows who ran it. Status is NOT read:
--         owner 4/10 «δεν θελουμε παραδοσεις για το εθνικων» — national legs no longer get
--         «Delivered» (trigger national_load_follow_order to stop copying it; no «Παραδόθηκε» in
--         the front); «executed» = the delivery time has passed. delivery_datetime < now() (it is a
--         timestamptz, 15:00 on VS legs), so a Monday 15:00 leg shows in Monday's 17:00 digest;
--         actual_delivery_date only as fallback.
--   B-62  report §3 P1-α (wave 0, commit f1419375): a multi-stop national order whose delivery
--         stops were written with 0/NULL pallets ⇒ wrong Weekly load and pallet ledger.
--
-- Audit-log parse fix (coordinator 4/10): audit_log.before_data/after_data is a jsonb STRING when the
-- Worker writes it and a jsonb OBJECT when a DB trigger does (30 days: both shapes present; every
-- orders/order_stops row from the Worker is a string). «x->>'k'» reads only objects, so the checks
-- that read Worker-written rows never fired. Every accessor in the 8 checks becomes
--   ((x #>> '{}')::jsonb->>'k')
-- which reads BOTH shapes: #>> '{}' returns the object's JSON text or the string's content and
-- ::jsonb parses either to the object. Not the CASE/jsonb_typeof form: jsonb_typeof is not on the
-- allow-list of check_sql_guard (047) / lintSql, and adding it means changing 047 in production.
-- Verified read-only 4/10: all 8,318 audit_log rows parse to an object (0 cast errors, before and
-- after); an object round-trips unchanged (0 differ). A future non-JSON string would make the check
-- ERROR ⇒ MECH incident — loud, never a silent 0 (principle 1).
-- Old vs new SQL over the last 30 days (window widened to 30 days for the measurement only) and the
-- new SQL in its own window now (4/10 ~16:45 Athens):
--   B-36  37 → 37  (now 0)   trigger rows are objects — unchanged, as expected
--   B-53   0 →  1  (now 0)
--   P-02   0 →  4  (now 0)
--   P-03   4 → 47  (now 0)   classified read-only 4/10 (review asked: split parents?): NOT mostly split —
--               2 hits on 1 split parent, 6 on split children/legs (3 now Cancelled+deleted), 4 audit
--               rows with no matching order (role system), 35 on plain owned orders (34 have a live RT
--               today, 1 deleted).
--               ALL 47 fall 5/9–14/9 (7/9: 20) — before RT-on-assignment (033, 14/9); since 15/9:
--               0 hits out of 102 Worker-written assignments. So P-03 is quiet now, not «1.6/day»:
--               SQL left as is (only the parse changed); a hit from now on is a real «assigned, no
--               RT event within 60″». The owner may still decide to exclude split legs.
--   P-04   0 →  9  (now 0)
--   P-05   0 →  0  (now 0)
--   P-06   2 →  7  (now 0)
--   P-08   0 →  0  (now 0)
-- All new values in their own windows are 0 today ⇒ no incident on the first run. The production
-- texts of the 8 equal the 047b originals (md5 checked 4/10); the block refuses if they don't.
--
-- «Only what is new» (owner 28/9: «αστα αυτα μην ασχολεισαι συνεχεια»): B-59 and B-61 count ONLY
-- from 5/10/2026 on (delivery date, Athens), so the 14 assigned loads and the 40 vehicle-less VS
-- legs of the past (§8.2: «τα 40 παλιά μένουν ως έχουν») never raise an incident. B-60 skips lines
-- reset by the never-delete rule (parent no longer groupage / cancelled / deleted).
--
-- Measured read-only on production 4/10/2026 16:19 Athens (Supabase MCP, SELECT only), with the
-- EXACT sql_text below:
--   B-59 = 0   (without the 5/10 cut it would be 14 — all historical, no national RT exists)
--   B-60 = 0   (re-measured 4/10 16:33 with the horizon; 2 groupage lines in total, both
--               Assigned to consolidated load 5)
--   B-61 = 0   (re-measured 4/10 16:28 after the owner decision; without the 5/10 cut 40 — all
--               historical; loads 121/122 deliver Mon 5/10 15:00 with no vehicle yet — B-61 WILL
--               count them from 15:00 if still unassigned)
--   B-62 = 0   (no national order has 2+ delivery stops today; 7 SINGLE-stop orders do have a
--               0-pallet delivery stop — outside this check by design, report item = multi-stop)
-- B-59 does not read status (only excludes Cancelled) — unaffected by «no Delivered for nationals».
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
-- Catalog (principle 3): tms-auditor/checks/B-59…B-62.sql hold the SAME rows — the VALUES list
-- below is what checks/load.mjs seedSql() produces from those files (field for field; sql_text and
-- ids_sql byte-identical; only the line breaks between fields differ). Edit the .sql files first,
-- then this list. 047b is regenerated from the catalog (build-seed.mjs) and its B-59…B-62 rows
-- are identical to these; 047b = «what the catalog defines», 058 = the delta production runs.
-- The md5 constants in the proof below are md5(sql_text)/md5(ids_sql) of the catalog files —
-- change a literal and the block refuses until the constant is recomputed from the file.
-- The 8 fixed rows are UPDATEs of sql_text/ids_sql ONLY (review 4/10): enabled, severity,
-- schedule_tag, disabled_reason etc. the owner may have changed by hand are NOT touched. Their texts
-- are the catalog files byte-for-byte
-- (tms-auditor/checks/B-36, B-53, P-02…P-06, P-08 .sql), same as their rows in 047b.
--
-- Idempotent: B-59…B-62 by INSERT … ON CONFLICT (id) DO UPDATE (new rows, same form as 047b); the 8
-- by UPDATE of the two texts — safe to re-run (the guard accepts their original or fixed text).
-- Reverse:   DELETE FROM monitoring.results WHERE check_id IN ('B-59','B-60','B-61','B-62');
--            DELETE FROM monitoring.checks  WHERE id       IN ('B-59','B-60','B-61','B-62');
--            (or, keeping history: UPDATE monitoring.checks SET enabled=false,
--             disabled_reason='…' WHERE id IN (…) — reported as a GAP, never green)
--            The 8 audit rows: UPDATE sql_text/ids_sql back to their 047b text as of commit e1a66597.

DO $do$
DECLARE r record; v numeric; ids text[]; n int; k int;
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
 AND coalesce(g.loading_date <= (now() AT TIME ZONE 'Europe/Athens')::date + 1, true)
 AND ((g.order_id IS NOT NULL AND o.deleted_at IS NULL AND coalesce(o.status,'')<>'Cancelled' AND coalesce(o.national_groupage,false))
   OR (g.national_order_id IS NOT NULL AND n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND coalesce(n.national_groupage,false)))$m$,
   $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT g.legacy_id AS x FROM groupage_lines g LEFT JOIN orders o ON o.id=g.order_id LEFT JOIN national_orders n ON n.id=g.national_order_id
 WHERE g.deleted_at IS NULL AND g.status='Unassigned' AND g.created_at < now()-interval '15 minutes'
 AND coalesce(g.loading_date <= (now() AT TIME ZONE 'Europe/Athens')::date + 1, true)
 AND ((g.order_id IS NOT NULL AND o.deleted_at IS NULL AND coalesce(o.status,'')<>'Cancelled' AND coalesce(o.national_groupage,false))
   OR (g.national_order_id IS NOT NULL AND n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND coalesce(n.national_groupage,false))) LIMIT 50) s$m$,
   $m$groupage_lines$m$, $m$>$m$, 0, NULL, $m$P2$m$, $m$hourly$m$, false,
   $m$Γραμμή groupage χωρίς φορτηγό — ο προμηθευτής δεν παραλαμβάνεται και δεν φαίνεται σε καμία στήλη του Εβδομαδιαίου Εθνικών.$m$,
   $m$Εβδομαδιαίο Εθνικών → Groupage: η γραμμή φορτώνει σήμερα/αύριο — σε ποιο φορτηγό μπαίνει; (ανάγνωση)$m$,
   $m$Unassigned είναι κανονικό μέχρι να μπει η γραμμή σε φορτηγό: μετρά ΜΟΝΟ όταν η φόρτωση είναι έως αύριο (Αθήνα· κενή ημερομηνία μετρά). Γραμμές που επανήλθαν σε Unassigned με τον κανόνα never-delete (η παραγγελία δεν είναι πια groupage, ακυρώθηκε ή διαγράφηκε) ΔΕΝ μετρούν.$m$,
   $m$15′ (γραμμές και φορτηγό γράφονται σε χωριστά αιτήματα)$m$, true, NULL),
  ($m$B-61$m$, $m$VS εθνικό σκέλος με παράδοση που πέρασε, χωρίς εκτελεστή — από 5/10$m$, ARRAY[$m$F-10$m$,$m$F-23$m$]::text[],
   $m$SELECT count(*) FROM national_loads nl WHERE nl.deleted_at IS NULL AND nl.source_type='Direct' AND coalesce(nl.status,'')<>'Cancelled'
 AND NOT (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
 AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05'
 AND coalesce(nl.delivery_datetime < now(), nl.actual_delivery_date < (now() AT TIME ZONE 'Europe/Athens')::date)$m$,
   $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT nl.legacy_id AS x FROM national_loads nl WHERE nl.deleted_at IS NULL AND nl.source_type='Direct' AND coalesce(nl.status,'')<>'Cancelled'
 AND NOT (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
 AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05'
 AND coalesce(nl.delivery_datetime < now(), nl.actual_delivery_date < (now() AT TIME ZONE 'Europe/Athens')::date) LIMIT 50) s$m$,
   $m$national_loads$m$, $m$>$m$, 0, NULL, $m$P2$m$, $m$hourly$m$, false,
   $m$Το VS σκέλος εκτελέστηκε (η ώρα παράδοσης πέρασε) χωρίς φορτηγό/συνεργάτη στο TMS: μένει «ΠΡΟΣ ΑΝΑΘΕΣΗ» και κανείς δεν ξέρει ποιος το έκανε (μισθοδοσία, RT).$m$,
   $m$Εβδομαδιαίο Εθνικών → το σκέλος· ρώτα τον Σωτήρη ποιο φορτηγό το έκανε και ανάθεσέ το (ανάγνωση από τον ελεγκτή).$m$,
   $m$Ανεξάρτητα από status: τα εθνικά ΔΕΝ παίρνουν πια «Delivered» (owner 4/10) — εκτελεσμένο = η ώρα παράδοσης πέρασε. Σκέλη με παράδοση πριν 5/10 εκτός (40 ιστορικά χωρίς εκτελεστή, μένουν ως έχουν). Μόνο source_type='Direct' (VS)· Cancelled εκτός.$m$,
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

  -- Audit-log parse fix for 8 EXISTING checks (B-36, B-53, P-02…P-06, P-08) — see header.
  -- Refuse if production holds a text that is neither the 047b original nor this fix: someone changed it
  -- by hand and 058 must not overwrite that silently (principle 1).
  SELECT count(*) INTO n FROM monitoring.checks k
    JOIN (VALUES
      ('B-36', '8145b8a0a3d0452941286201fea06ae3', 'd41d8cd98f00b204e9800998ecf8427e', '096e0a787b9bc2055a18fc89c834c7de', 'd41d8cd98f00b204e9800998ecf8427e'),
      ('B-53', '4b67650f70e3d72e325ac47c4339acdc', 'd41d8cd98f00b204e9800998ecf8427e', 'e99155ea4d5c4daf2f97df489a8e548d', 'd41d8cd98f00b204e9800998ecf8427e'),
      ('P-02', '3a8f1aee060f8c3808057f5fd6f73ab5', 'e0de594ab5ec47ce5f315b9f2f9eed8a', '55bf6920011abf6b2748b6a93d98edcc', 'f64e89b4a00137b45e56dd5018706325'),
      ('P-03', '73661a5399da8a9efa99c2dedff69974', 'cf908f5c887bd7b80bd77936539458a9', 'bd9237a8aa9760b21869f8b6106acb7c', '98319d0f95e4e089282008794b8b8a03'),
      ('P-04', '5c2ff894b014950e7c0cd1354a199236', 'e0e761f69e016292f4150f9182369989', 'b76867c13859cfd2e2f055574301b0df', 'a101d161212641b14eedbc4cdc804c6e'),
      ('P-05', 'dbb941bf181fee33caba05511ece3dd1', 'e9ad5348d5167deb05e363a4efde751f', '2c2b2f322ac36051678eefdf5094ed5d', '7a5d9cc52053921058cb49966fb3d14a'),
      ('P-06', '494d539fe59fe42cd6e5ce9f339ff133', '39189e2f93d3d132701221d3d1bb79bf', '4c872a20bdb8eeb5f6beae504e50630b', 'fec809ad9f3be0726513b3d256d7e0d0'),
      ('P-08', '2437e6d062862bfe336d1cfdb9ea769c', 'e1a800c6efff7dbb1ad2f25ab908021d', '5c51381d68d61a4cb09e1555c9d096be', 'a949c700d445f39cffea6943481b5ae8')
    ) e(id, old_sql, old_ids, new_sql, new_ids) ON e.id = k.id
   WHERE (md5(k.sql_text) = e.old_sql AND md5(coalesce(k.ids_sql, '')) = e.old_ids)
      OR (md5(k.sql_text) = e.new_sql AND md5(coalesce(k.ids_sql, '')) = e.new_ids);
  IF n <> 8 THEN RAISE EXCEPTION '058: only % of the 8 audit checks hold the 047b or the fixed text — production was edited by hand, stop', n; END IF;

-- ONLY the two texts are written (review 4/10): enabled, severity, schedule_tag, disabled_reason and
  -- every other column the owner may have changed by hand stay as they are. Texts = catalog files.
  UPDATE monitoring.checks SET sql_text = $m$SELECT count(*) FILTER (WHERE (((after_data #>> '{}')::jsonb->>'split'))='true') + count(*) FILTER (WHERE table_name='ct_round_trips' AND ((after_data #>> '{}')::jsonb->>'reason') LIKE 'reopened:%')
 FROM audit_log WHERE created_at>now()-interval '24 hours'$m$,
    ids_sql = NULL
   WHERE id = 'B-36';
  GET DIAGNOSTICS k = ROW_COUNT; IF k <> 1 THEN RAISE EXCEPTION '058: B-36 updated % rows', k; END IF;
  UPDATE monitoring.checks SET sql_text = $m$SELECT count(*) FROM audit_log WHERE table_name IN ('orders','national_orders') AND action='update' AND role<>'owner'
 AND (((before_data #>> '{}')::jsonb->>'invoiced'))='true' AND coalesce(((after_data #>> '{}')::jsonb->>'invoiced'),'false')='false'
 AND created_at>now()-interval '24 hours'$m$,
    ids_sql = NULL
   WHERE id = 'B-53';
  GET DIAGNOSTICS k = ROW_COUNT; IF k <> 1 THEN RAISE EXCEPTION '058: B-53 updated % rows', k; END IF;
  UPDATE monitoring.checks SET sql_text = $m$SELECT count(*) FROM audit_log a WHERE a.table_name='orders' AND a.action='create' AND (((a.after_data #>> '{}')::jsonb->>'veroia_switch'))='true' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name='national_loads' AND b.action IN ('create','update') AND (b.actor=a.actor OR b.actor LIKE 'trigger:national_load%') AND b.created_at BETWEEN a.created_at-interval '60 seconds' AND a.created_at+interval '60 seconds')$m$,
    ids_sql = $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT a.record_id AS x FROM audit_log a WHERE a.table_name='orders' AND a.action='create' AND (((a.after_data #>> '{}')::jsonb->>'veroia_switch'))='true' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name='national_loads' AND b.action IN ('create','update') AND (b.actor=a.actor OR b.actor LIKE 'trigger:national_load%') AND b.created_at BETWEEN a.created_at-interval '60 seconds' AND a.created_at+interval '60 seconds') LIMIT 50) s$m$
   WHERE id = 'P-02';
  GET DIAGNOSTICS k = ROW_COUNT; IF k <> 1 THEN RAISE EXCEPTION '058: P-02 updated % rows', k; END IF;
  UPDATE monitoring.checks SET sql_text = $m$SELECT count(*) FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND (((a.before_data #>> '{}')::jsonb->>'truck_id')) IS NULL AND (((a.before_data #>> '{}')::jsonb->>'partner_id')) IS NULL AND ((((a.after_data #>> '{}')::jsonb->>'truck_id')) IS NOT NULL OR (((a.after_data #>> '{}')::jsonb->>'partner_id')) IS NOT NULL) AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name IN ('ct_round_trips','ct_rt_legs') AND b.actor LIKE 'trigger:rt%' AND b.created_at BETWEEN a.created_at-interval '60 seconds' AND a.created_at+interval '60 seconds')$m$,
    ids_sql = $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT a.record_id AS x FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND (((a.before_data #>> '{}')::jsonb->>'truck_id')) IS NULL AND (((a.before_data #>> '{}')::jsonb->>'partner_id')) IS NULL AND ((((a.after_data #>> '{}')::jsonb->>'truck_id')) IS NOT NULL OR (((a.after_data #>> '{}')::jsonb->>'partner_id')) IS NOT NULL) AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name IN ('ct_round_trips','ct_rt_legs') AND b.actor LIKE 'trigger:rt%' AND b.created_at BETWEEN a.created_at-interval '60 seconds' AND a.created_at+interval '60 seconds') LIMIT 50) s$m$
   WHERE id = 'P-03';
  GET DIAGNOSTICS k = ROW_COUNT; IF k <> 1 THEN RAISE EXCEPTION '058: P-03 updated % rows', k; END IF;
  UPDATE monitoring.checks SET sql_text = $m$SELECT count(*) FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND coalesce(((a.before_data #>> '{}')::jsonb->>'matched_import_id'),'')='' AND coalesce(((a.after_data #>> '{}')::jsonb->>'matched_import_id'),'')<>'' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name IN ('ct_round_trips','ct_rt_legs') AND (b.actor=a.actor OR b.actor LIKE 'trigger:rt%') AND b.created_at BETWEEN a.created_at-interval '90 seconds' AND a.created_at+interval '90 seconds')$m$,
    ids_sql = $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT a.record_id AS x FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND coalesce(((a.before_data #>> '{}')::jsonb->>'matched_import_id'),'')='' AND coalesce(((a.after_data #>> '{}')::jsonb->>'matched_import_id'),'')<>'' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name IN ('ct_round_trips','ct_rt_legs') AND (b.actor=a.actor OR b.actor LIKE 'trigger:rt%') AND b.created_at BETWEEN a.created_at-interval '90 seconds' AND a.created_at+interval '90 seconds') LIMIT 50) s$m$
   WHERE id = 'P-04';
  GET DIAGNOSTICS k = ROW_COUNT; IF k <> 1 THEN RAISE EXCEPTION '058: P-04 updated % rows', k; END IF;
  UPDATE monitoring.checks SET sql_text = $m$SELECT count(*) FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND coalesce(((a.before_data #>> '{}')::jsonb->>'rotation_id'),'')='' AND coalesce(((a.after_data #>> '{}')::jsonb->>'rotation_id'),'')<>'' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name IN ('ct_round_trips','ct_rt_legs') AND (b.actor=a.actor OR b.actor LIKE 'trigger:rt%') AND b.created_at BETWEEN a.created_at-interval '90 seconds' AND a.created_at+interval '90 seconds')$m$,
    ids_sql = $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT a.record_id AS x FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND coalesce(((a.before_data #>> '{}')::jsonb->>'rotation_id'),'')='' AND coalesce(((a.after_data #>> '{}')::jsonb->>'rotation_id'),'')<>'' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name IN ('ct_round_trips','ct_rt_legs') AND (b.actor=a.actor OR b.actor LIKE 'trigger:rt%') AND b.created_at BETWEEN a.created_at-interval '90 seconds' AND a.created_at+interval '90 seconds') LIMIT 50) s$m$
   WHERE id = 'P-05';
  GET DIAGNOSTICS k = ROW_COUNT; IF k <> 1 THEN RAISE EXCEPTION '058: P-05 updated % rows', k; END IF;
  UPDATE monitoring.checks SET sql_text = $m$SELECT count(*) FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND (((a.after_data #>> '{}')::jsonb->>'status'))='Delivered' AND coalesce(((a.before_data #>> '{}')::jsonb->>'status'),'')<>'Delivered' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name='order_stops' AND b.action='update' AND b.actor=a.actor AND b.created_at BETWEEN a.created_at-interval '120 seconds' AND a.created_at+interval '120 seconds')$m$,
    ids_sql = $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT a.record_id AS x FROM audit_log a WHERE a.table_name='orders' AND a.action='update' AND (((a.after_data #>> '{}')::jsonb->>'status'))='Delivered' AND coalesce(((a.before_data #>> '{}')::jsonb->>'status'),'')<>'Delivered' AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name='order_stops' AND b.action='update' AND b.actor=a.actor AND b.created_at BETWEEN a.created_at-interval '120 seconds' AND a.created_at+interval '120 seconds') LIMIT 50) s$m$
   WHERE id = 'P-06';
  GET DIAGNOSTICS k = ROW_COUNT; IF k <> 1 THEN RAISE EXCEPTION '058: P-06 updated % rows', k; END IF;
  UPDATE monitoring.checks SET sql_text = $m$SELECT count(*) FROM audit_log a WHERE a.table_name='pl_movements' AND a.action='update' AND (((a.after_data #>> '{}')::jsonb->>'sheet_url')) IS NOT NULL AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name='pl_movements' AND b.action='confirm' AND b.record_id=a.record_id AND b.created_at BETWEEN a.created_at-interval '120 seconds' AND a.created_at+interval '120 seconds')$m$,
    ids_sql = $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT a.record_id AS x FROM audit_log a WHERE a.table_name='pl_movements' AND a.action='update' AND (((a.after_data #>> '{}')::jsonb->>'sheet_url')) IS NOT NULL AND a.created_at BETWEEN now()-interval '26 hours' AND now()-interval '3 minutes'
 AND NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.table_name='pl_movements' AND b.action='confirm' AND b.record_id=a.record_id AND b.created_at BETWEEN a.created_at-interval '120 seconds' AND a.created_at+interval '120 seconds') LIMIT 50) s$m$
   WHERE id = 'P-08';
  GET DIAGNOSTICS k = ROW_COUNT; IF k <> 1 THEN RAISE EXCEPTION '058: P-08 updated % rows', k; END IF;

  -- Proofs INSIDE the block: any failure aborts the whole block (nothing kept).
  -- (1) What is stored is exactly the catalog: md5 of tms-auditor/checks/B-59…B-62.sql sql/ids text.
  SELECT count(*) INTO n FROM monitoring.checks k
    JOIN (VALUES
      ('B-59', '95ff00d9e57a2497ad2d879e69440cb2', '0a6a34d11b716a21e9fb7621d2883511'),
      ('B-60', 'e258a2e4aac12b5686f79f585ce9d164', 'b87f133253be237b7dc910cd3dc4a83c'),
      ('B-61', 'c21dc070ce74aba46e5b3af40b55c171', '0936836e082b053b1b39ad9bc6061359'),
      ('B-62', '4d2c49408e3b3177fcc953de2de7c45e', '04fa2f616ac8dff12f8b72f6e81d1fe7')
    ) e(id, sql_md5, ids_md5) ON e.id = k.id
   WHERE md5(k.sql_text) = e.sql_md5 AND md5(k.ids_sql) = e.ids_md5 AND k.enabled AND k.severity = 'P2';
  IF n <> 4 THEN RAISE EXCEPTION '058: only % of 4 rows match the catalog md5 (enabled, P2)', n; END IF;
  -- (1b) The 8 fixed audit checks now hold the catalog text: parse present, no bare «_data->>» left.
  SELECT count(*) INTO n FROM monitoring.checks
   WHERE id IN ('B-36','B-53','P-02','P-03','P-04','P-05','P-06','P-08')
     AND position('_data #>> ''{}'')::jsonb->>' IN sql_text) > 0
     AND sql_text !~ '(after|before)_data\s*->>' AND coalesce(ids_sql, '') !~ '(after|before)_data\s*->>';
  IF n <> 8 THEN RAISE EXCEPTION '058: only % of 8 audit checks carry the parse and no bare after_data/before_data ->>', n; END IF;
  -- (2) B-61 must not depend on «Delivered»: nationals no longer get that status (owner 4/10).
  IF EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-61'
              AND (sql_text LIKE '%''Delivered''%' OR ids_sql LIKE '%''Delivered''%')) THEN
    RAISE EXCEPTION '058: B-61 still reads status Delivered';
  END IF;
  -- (3) Each check runs the way run_checks (047) runs it: guard, 10 s timeout, as tms_check_runner
  -- (SELECT only) — so a missing GRANT fails HERE, not silently as the editor's superuser.
  -- Texts are read BEFORE switching role: tms_check_runner cannot read schema monitoring.
  FOR r IN SELECT id, sql_text, ids_sql FROM monitoring.checks
            WHERE id IN ('B-59','B-60','B-61','B-62','B-36','B-53','P-02','P-03','P-04','P-05','P-06','P-08')
              AND enabled ORDER BY id LOOP       -- a check the owner disabled is not run (it may be disabled because it fails)
    PERFORM monitoring.check_sql_guard(r.sql_text);
    IF r.ids_sql IS NOT NULL THEN PERFORM monitoring.check_sql_guard(r.ids_sql); END IF;
    PERFORM set_config('statement_timeout', '10000', true);
    SET LOCAL ROLE tms_check_runner;
    EXECUTE r.sql_text INTO v;
    ids := NULL;
    IF r.ids_sql IS NOT NULL THEN EXECUTE r.ids_sql INTO ids; END IF;
    RESET ROLE;
    IF v IS NULL THEN RAISE EXCEPTION '058: % returned NULL', r.id; END IF;
    RAISE NOTICE '058: % = % (ids %)', r.id, v, coalesce(array_to_string(ids, ','), '');
  END LOOP;
END $do$;

-- After the block (read-only, run separately — the editor shows the result grid, not NOTICEs):
-- SELECT id, severity, schedule_tag, enabled, title FROM monitoring.checks WHERE id IN ('B-59','B-60','B-61','B-62') ORDER BY id;
--   expect 4 rows, all enabled.
-- SELECT id, (sql_text ~ '(after|before)_data\s*->>') AS bare_left FROM monitoring.checks
--  WHERE id IN ('B-36','B-53','P-02','P-03','P-04','P-05','P-06','P-08') ORDER BY id;
--   expect 8 rows, bare_left = false everywhere.
-- Today's value of each check (4/10 16:19 Athens: 0 / 0 / 0 / 0):
-- SELECT 'B-59' AS id, count(*) FROM national_loads nl WHERE nl.deleted_at IS NULL AND coalesce(nl.status,'')<>'Cancelled'
--   AND (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
--   AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date, (nl.loading_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05'
--   AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.nat_load_id=nl.id AND r.status<>'cancelled')
-- UNION ALL
-- SELECT 'B-60', count(*) FROM groupage_lines g LEFT JOIN orders o ON o.id=g.order_id LEFT JOIN national_orders n ON n.id=g.national_order_id
--   WHERE g.deleted_at IS NULL AND g.status='Unassigned' AND g.created_at < now()-interval '15 minutes'
--   AND coalesce(g.loading_date <= (now() AT TIME ZONE 'Europe/Athens')::date + 1, true)
--   AND ((g.order_id IS NOT NULL AND o.deleted_at IS NULL AND coalesce(o.status,'')<>'Cancelled' AND coalesce(o.national_groupage,false))
--     OR (g.national_order_id IS NOT NULL AND n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND coalesce(n.national_groupage,false)))
-- UNION ALL
-- SELECT 'B-61', count(*) FROM national_loads nl WHERE nl.deleted_at IS NULL AND nl.source_type='Direct' AND coalesce(nl.status,'')<>'Cancelled'
--   AND NOT (nl.truck_id IS NOT NULL OR (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL))
--   AND coalesce(nl.actual_delivery_date, (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date) >= date '2026-10-05'
--   AND coalesce(nl.delivery_datetime < now(), nl.actual_delivery_date < (now() AT TIME ZONE 'Europe/Athens')::date)
-- UNION ALL
-- SELECT 'B-62', count(*) FROM national_orders n WHERE n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND n.created_at < now()-interval '15 minutes'
--   AND (SELECT count(*) FROM order_stops s WHERE s.national_order_id=n.id AND s.deleted_at IS NULL AND s.stop_type='Unloading') >= 2
--   AND (EXISTS (SELECT 1 FROM order_stops s WHERE s.national_order_id=n.id AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND coalesce(s.pallets,0)<=0)
--     OR EXISTS (SELECT 1 FROM order_stops s JOIN national_loads l ON l.id=s.national_load_id WHERE l.source_national_order_id=n.id AND l.deleted_at IS NULL AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND coalesce(s.pallets,0)<=0));
-- The first real run results (after the next hourly/daily cycle):
-- SELECT check_id, run_at, value, status, ids, err FROM monitoring.results WHERE check_id IN ('B-59','B-60','B-61','B-62') ORDER BY run_at DESC LIMIT 8;
