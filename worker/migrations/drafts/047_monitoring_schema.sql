-- 047_monitoring_schema.sql — DRAFT · NOT EXECUTED · owner runs after 15:00 (principle 7)
-- Branch feat/tms-auditor. Supersedes the 047 sketch in docs/grok-bot/monitoring-2026-09-22/05 §1.1
-- (same numbering, same schema name). Deviations from that sketch, and why:
--   1. incident_key stays per check, BUT each incident tracks entity_ids; a NEW entity appearing under an
--      already-open incident sets worsened_at, so it is re-notified (05's version would hide the 2nd
--      broken order behind the 1st one's open incident for 24h).
--   2. run_checks() does NOT decide liveness. monitoring.deadman_ok() does (no open MECH, nothing undelivered
--      > 90′, notifier routine alive) — read by the watchdog routine. 05 pinged a dead-man even on errors.
--   3. Alert text is rendered by SQL (render_alert) so a P1/MECH alert needs NO model (brief §ΣΤ).
--   4. 'decrease'/'increase' operators compare with the previous value (B-18/B-29 "must never shrink").
-- Needs NO extension: runs identically in PGlite (local tests) and Supabase. pg_cron/pg_net live in 048.
-- Security: sql_text is executed dynamically. The function is NOT security definer and only the owner
-- (postgres) may write monitoring.checks; tms_reader gets SELECT only (050). See 05 §1.1 risk note.
-- Reverse: DROP SCHEMA monitoring CASCADE;  (touches no TMS table, no TMS data)

CREATE SCHEMA IF NOT EXISTS monitoring;
-- Born closed (principle 5, review A 23/9 #2): nothing in this schema is usable by PUBLIC — not even the
-- functions created further down in THIS file (default privileges apply to them) — until 050 grants the two
-- monitoring roles explicitly. Running 047/048 without 050 therefore exposes nothing.
REVOKE ALL ON SCHEMA monitoring FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA monitoring REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA monitoring REVOKE ALL ON TABLES FROM PUBLIC;

-- A1 (review A 23/9 #1): the check SQL is stored text executed dynamically. Three guards INSIDE the DB, so a
-- bad row fails here and not only in the repo lint: (1) one SELECT/WITH statement, (2) only allow-listed
-- functions (an old SECURITY DEFINER function granted to PUBLIC could otherwise write on the check's behalf),
-- (3) executed as tms_check_runner, a NOLOGIN role with SELECT only — DML fails on privileges.
-- The function allow-list below is the SAME list as tms-auditor/checks/load.mjs (catalog.test.mjs fails on drift).
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tms_check_runner') THEN
    CREATE ROLE tms_check_runner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $do$;
GRANT tms_check_runner TO CURRENT_USER;          -- PG ≥16: the creator needs membership to SET ROLE to it
-- SELECT only, explicit list = every table/view the catalog reads (catalog.test.mjs checks the coverage).
GRANT SELECT ON
  public.orders, public.order_stops, public.national_orders, public.national_loads,
  public.groupage_lines, public.consolidated_loads, public.ramp,
  public.ct_round_trips, public.ct_rt_legs, public.ct_cost_lines, public.ct_cost_docs,
  public.dl_entries, public.pl_movements, public.app_errors, public.facade_unknown_fields,
  public.trucks, public.trailers, public.drivers, public.locations, public.local_moves,
  public.dl_v_rt_gap, public.pl_v_order_gate, public.audit_log
TO tms_check_runner;

CREATE TABLE monitoring.checks (
  id            text PRIMARY KEY,                    -- 'B-01', 'P-03', 'TEST-01'
  title         text NOT NULL,                       -- Greek, one line
  flows         text[] NOT NULL DEFAULT '{}',        -- {'F-14'}
  sql_text      text NOT NULL,                       -- ONE statement returning ONE number
  ids_sql       text,                                -- optional: ONE statement returning text[] (≤50 ids)
  entity_table  text,                                -- table the ids belong to (package building)
  red_op        text NOT NULL CHECK (red_op IN ('>','>=','<','<=','=','<>','decrease','increase','none')),
  red_value     numeric NOT NULL DEFAULT 0,
  baseline      numeric,                             -- historic value that is NOT a finding (e.g. B-11 = 2)
  severity      text NOT NULL CHECK (severity IN ('P1','P2','P3','P4','MECH')),
  schedule_tag  text NOT NULL CHECK (schedule_tag IN ('fast','half','hourly','daily','weekly')),
  is_queue      boolean NOT NULL DEFAULT false,      -- work queue: never red, only a number in the digest
  impact        text,                                -- one Greek sentence: who is hurt, what does not happen
  next_step     text,                                -- one safe step (read / decide), never a fix
  confidence    text NOT NULL DEFAULT 'σταθερός έλεγχος SQL — δείχνει ΤΙ, όχι ΓΙΑΤΙ',
  exceptions    text,
  tolerance     text,
  code_pointers jsonb NOT NULL DEFAULT '[]',         -- from docs/tms-auditor/graph (file:line@sha)
  sha_verified  text,
  enabled       boolean NOT NULL DEFAULT true,
  disabled_reason text,                              -- a disabled check is reported as a GAP, never green
  CHECK (enabled OR disabled_reason IS NOT NULL)
);

CREATE TABLE monitoring.runs (
  run_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag         text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  expected_n  int NOT NULL DEFAULT 0,
  ran_n       int NOT NULL DEFAULT 0,
  error_n     int NOT NULL DEFAULT 0,
  complete    boolean NOT NULL DEFAULT false,           -- ran_n = expected_n AND error_n = 0
  source_cron boolean NOT NULL DEFAULT false            -- true only when pg_cron started it (schedule drift check)
);

CREATE TABLE monitoring.results (
  id         bigserial PRIMARY KEY,
  run_id     uuid NOT NULL REFERENCES monitoring.runs(run_id),
  check_id   text NOT NULL REFERENCES monitoring.checks(id),
  run_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  value      numeric,                                   -- NULL = did not return
  prev_value numeric,
  status     text NOT NULL CHECK (status IN ('green','red','queue','error')),
  ids        text[],
  ms         int,
  err        text
);
CREATE INDEX results_check_time_idx ON monitoring.results (check_id, run_at DESC);

CREATE TABLE monitoring.incidents (
  id              bigserial PRIMARY KEY,
  incident_key    text NOT NULL,
  check_id        text NOT NULL,
  severity        text NOT NULL CHECK (severity IN ('P1','P2','P3','P4','MECH')),
  state           text NOT NULL DEFAULT 'new'
                  CHECK (state IN ('new','confirmed','false_alarm','resolved','recurred')),
  value           numeric,
  expected        text,
  first_seen      timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen       timestamptz NOT NULL DEFAULT clock_timestamp(),
  occurrences     int NOT NULL DEFAULT 1,
  entity_ids      text[] NOT NULL DEFAULT '{}',
  worsened_at     timestamptz,                       -- value ×2 / +1, or a NEW entity id appeared
  notified_at     timestamptz,
  notified_value  numeric,
  notify_count    int NOT NULL DEFAULT 0,
  diagnosis       jsonb,                             -- validated report (category, text, model, tokens)
  diagnosed_at    timestamptz,
  human_note      text,
  state_changed_by text,
  state_changed_at timestamptz,
  resolved_verified_at timestamptz
);
-- One OPEN incident per key; history keeps closed ones.
CREATE UNIQUE INDEX incidents_open_key ON monitoring.incidents (incident_key)
  WHERE state IN ('new','confirmed','recurred');

CREATE TABLE monitoring.notifications (
  id          bigserial PRIMARY KEY,
  incident_id bigint REFERENCES monitoring.incidents(id),
  kind        text NOT NULL CHECK (kind IN ('alert','storm','digest','test')),
  channel     text NOT NULL,                          -- 'push-routine' | 'email-routine' | 'telegram' | 'ntfy' | 'mock'
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  status      text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  sent_at     timestamptz,
  sender      text,                                   -- routine run id / pg_net request id
  err         text
);

CREATE TABLE monitoring.heartbeat (
  source     text PRIMARY KEY,                        -- 'routine-p1' | 'routine-digest' | 'cron-fast' …
  last_beat  timestamptz NOT NULL,
  last_run   text,
  detail     text
);

CREATE TABLE monitoring.limits (name text PRIMARY KEY, value numeric NOT NULL, note text);
INSERT INTO monitoring.limits VALUES
  ('push_max_per_run',        3,  'more than this ⇒ ONE storm message listing the rest, never silence'),
  ('alerts_per_day',          20, 'beyond this only storm summaries'),
  ('investigations_per_day',  5,  'the 6th waits: diagnosis = ΕΚΚΡΕΜΕΙ — όριο ημέρας'),
  ('renotify_hours',          24, 'same open incident, same value ⇒ re-notify at most once per 24h'),
  ('routine_stale_minutes',   75, 'p1 routine runs hourly (Claude Code routines: minimum interval 1h) ⇒ >75′ = MECH'),
  ('fast_stale_minutes',      35, 'no complete fast run within this, in shift ⇒ MECH'),
  ('worsen_ratio',            2,  'value ≥ notified_value × ratio ⇒ worsened');

-- ---------------------------------------------------------------------------------------------
-- Incident upsert shared by run_checks and self_check. Returns incident id.
CREATE OR REPLACE FUNCTION monitoring.raise_incident(p_key text, p_check text, p_sev text,
    p_value numeric, p_expected text, p_ids text[] DEFAULT '{}')
RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE inc monitoring.incidents%ROWTYPE; had_closed boolean; ratio numeric; new_id bigint;
BEGIN
  SELECT * INTO inc FROM monitoring.incidents
   WHERE incident_key = p_key AND state IN ('new','confirmed','recurred') FOR UPDATE;
  IF FOUND THEN
    SELECT value INTO ratio FROM monitoring.limits WHERE name = 'worsen_ratio';
    UPDATE monitoring.incidents SET
      last_seen   = clock_timestamp(),
      occurrences = occurrences + 1,
      value       = p_value,
      entity_ids  = ARRAY(SELECT DISTINCT unnest(entity_ids || coalesce(p_ids,'{}')) ORDER BY 1),
      -- a new entity, or the number got much worse, re-opens the notification path
      worsened_at = CASE
        WHEN EXISTS (SELECT 1 FROM unnest(coalesce(p_ids,'{}')) x WHERE x <> ALL (inc.entity_ids))
          OR (inc.notified_value IS NOT NULL AND p_value >= greatest(inc.notified_value * ratio, inc.notified_value + 1))
        THEN clock_timestamp() ELSE worsened_at END
    WHERE id = inc.id;
    RETURN inc.id;
  END IF;
  SELECT EXISTS (SELECT 1 FROM monitoring.incidents WHERE incident_key = p_key AND state = 'resolved')
    INTO had_closed;
  INSERT INTO monitoring.incidents (incident_key, check_id, severity, state, value, expected, entity_ids)
  VALUES (p_key, p_check, p_sev, CASE WHEN had_closed THEN 'recurred' ELSE 'new' END,
          p_value, p_expected, coalesce(p_ids,'{}'))
  RETURNING id INTO new_id;
  RETURN new_id;
END $fn$;

CREATE OR REPLACE FUNCTION monitoring.resolve_incident(p_key text, p_by text)
RETURNS void LANGUAGE sql AS $fn$
  UPDATE monitoring.incidents SET state = 'resolved', resolved_verified_at = clock_timestamp(),
         state_changed_by = p_by, state_changed_at = clock_timestamp()
   WHERE incident_key = p_key AND state IN ('new','recurred');
  -- 'confirmed' (a human said "real") is NOT auto-closed by one green run: a human closes it.
$fn$;

CREATE OR REPLACE FUNCTION monitoring.check_sql_guard(p_sql text)
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE body text; fn text;
  allowed text[] := ARRAY['count','sum','max','min','abs','coalesce','left','btrim','round','extract',
    'array_agg','now','exists','in','any','date','greatest','least','lower','upper','length',
    'select','from','where','and','or','not','on','as','join','filter','over','values','interval',
    'case','when','then','else','end','between','is','having','by'];
BEGIN
  -- dollar-quoted strings FIRST (review A 23/9 P4): stripping '…' first lets «$q$'$q$; DELETE …; SELECT '»
  -- hide a second statement inside what looks like a quoted string
  body := regexp_replace(p_sql, '\$([A-Za-z_]*)\$.*?\$\1\$', '''''', 'g');
  body := regexp_replace(body, '''([^'']|'''')*''', '''''', 'g');      -- string literals out
  body := regexp_replace(body, '--[^\n]*', ' ', 'g');                   -- comments out
  body := regexp_replace(body, ';\s*$', '');
  IF body !~* '^\s*(select|with)\s' THEN RAISE EXCEPTION 'check sql refused: must start with SELECT/WITH'; END IF;
  IF position(';' IN body) > 0 THEN RAISE EXCEPTION 'check sql refused: exactly one statement'; END IF;
  FOR fn IN SELECT lower(m[1]) FROM regexp_matches(body, '([a-z_][a-z0-9_]*)\s*\(', 'gi') AS m LOOP
    IF fn <> ALL (allowed) THEN RAISE EXCEPTION 'check sql refused: function %() not allowed', fn; END IF;
  END LOOP;
END $fn$;

-- ---------------------------------------------------------------------------------------------
-- The runner. Writes a result for EVERY enabled check of the tag — also on error (principle 1).
CREATE OR REPLACE FUNCTION monitoring.run_checks(p_tag text, p_from_cron boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE r monitoring.checks%ROWTYPE; v numeric; prev numeric; ids text[]; t0 timestamptz;
        st text; red boolean; g_run uuid; n_exp int := 0; n_ran int := 0; n_err int := 0; lim numeric;
BEGIN
  SELECT count(*) INTO n_exp FROM monitoring.checks WHERE enabled AND schedule_tag = p_tag;
  INSERT INTO monitoring.runs (tag, expected_n, source_cron) VALUES (p_tag, n_exp, p_from_cron) RETURNING run_id INTO g_run;

  FOR r IN SELECT * FROM monitoring.checks WHERE enabled AND schedule_tag = p_tag ORDER BY id LOOP
    t0 := clock_timestamp(); v := NULL; ids := NULL; st := 'error';
    SELECT value INTO prev FROM monitoring.results
     WHERE check_id = r.id AND value IS NOT NULL ORDER BY run_at DESC, id DESC LIMIT 1;
    BEGIN
      PERFORM set_config('statement_timeout', '10000', true);          -- one slow check cannot stall the run
      PERFORM monitoring.check_sql_guard(r.sql_text);
      IF r.ids_sql IS NOT NULL THEN PERFORM monitoring.check_sql_guard(r.ids_sql); END IF;
      SET LOCAL ROLE tms_check_runner;                                  -- SELECT-only for the check itself
      EXECUTE r.sql_text INTO v;
      IF r.ids_sql IS NOT NULL THEN EXECUTE r.ids_sql INTO ids; END IF;
      RESET ROLE;                                                       -- (an error rolls the role back too)
      IF v IS NULL THEN
        RAISE EXCEPTION 'check returned NULL — absence is not green';
      END IF;
      lim := coalesce(r.baseline, r.red_value);
      red := CASE r.red_op
               WHEN '>'  THEN v >  lim  WHEN '>=' THEN v >= lim
               WHEN '<'  THEN v <  lim  WHEN '<=' THEN v <= lim
               WHEN '='  THEN v =  lim  WHEN '<>' THEN v <> lim
               WHEN 'decrease' THEN prev IS NOT NULL AND v < prev
               WHEN 'increase' THEN prev IS NOT NULL AND v > prev
               ELSE false END;
      st := CASE WHEN r.is_queue THEN 'queue' WHEN red THEN 'red' ELSE 'green' END;
      n_ran := n_ran + 1;
    EXCEPTION WHEN OTHERS THEN
      st := 'error'; n_err := n_err + 1;
      INSERT INTO monitoring.results (run_id, check_id, value, prev_value, status, ms, err)
      VALUES (g_run, r.id, NULL, prev, 'error',
              (extract(epoch FROM clock_timestamp() - t0) * 1000)::int, left(SQLSTATE || ' ' || SQLERRM, 300));
      PERFORM monitoring.raise_incident('MECH:check:' || r.id, 'MECH', 'MECH', NULL,
              'ο έλεγχος ' || r.id || ' να επιστρέφει αριθμό');
      CONTINUE;
    END;
    INSERT INTO monitoring.results (run_id, check_id, value, prev_value, status, ids, ms)
    VALUES (g_run, r.id, v, prev, st, ids, (extract(epoch FROM clock_timestamp() - t0) * 1000)::int);
    -- a check that works again closes its own MECH incident
    PERFORM monitoring.resolve_incident('MECH:check:' || r.id, 'run_checks');
    IF st = 'red' THEN
      PERFORM monitoring.raise_incident(r.id, r.id, r.severity, v,
              CASE WHEN r.red_op IN ('decrease','increase') THEN 'όχι ' || r.red_op || ' από ' || coalesce(prev::text,'—')
                   ELSE 'κόκκινο αν ' || r.red_op || ' ' || lim END,
              coalesce(ids, '{}'));
    ELSIF st = 'green' THEN
      PERFORM monitoring.resolve_incident(r.id, 'run_checks');
    END IF;
  END LOOP;

  UPDATE monitoring.runs SET finished_at = clock_timestamp(), ran_n = n_ran, error_n = n_err,
         complete = (n_ran = n_exp AND n_err = 0)
   WHERE run_id = g_run;
  IF n_ran + n_err < n_exp THEN                                  -- a check vanished mid-run
    PERFORM monitoring.raise_incident('MECH:run:' || p_tag, 'MECH', 'MECH', n_ran, 'έτρεξαν ' || n_exp);
  ELSE
    PERFORM monitoring.resolve_incident('MECH:run:' || p_tag, 'run_checks');
  END IF;
  INSERT INTO monitoring.heartbeat (source, last_beat, last_run, detail)
  VALUES ('cron-' || p_tag, clock_timestamp(), g_run::text, n_ran || '/' || n_exp || ' err ' || n_err)
  ON CONFLICT (source) DO UPDATE SET last_beat = EXCLUDED.last_beat, last_run = EXCLUDED.last_run,
                                     detail = EXCLUDED.detail;
  RETURN g_run;
END $fn$;

-- ---------------------------------------------------------------------------------------------
-- "No data is RED": stale checks, stale notifier routine ⇒ MECH incidents.
-- Runs from cron (048) AND is re-evaluated by the p1 routine, so either one alone still catches it.
CREATE OR REPLACE FUNCTION monitoring.self_check(p_now timestamptz DEFAULT clock_timestamp())
RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE n int := 0; c record; lim_r numeric; in_shift boolean; hb timestamptz;
BEGIN
  SELECT value INTO lim_r FROM monitoring.limits WHERE name = 'routine_stale_minutes';
  in_shift := extract(isodow FROM (p_now AT TIME ZONE 'Europe/Athens')) BETWEEN 1 AND 6
          AND (p_now AT TIME ZONE 'Europe/Athens')::time BETWEEN '05:45' AND '15:00';

  -- every enabled check must have a non-error result within 2× its interval (weekly: 8 days)
  FOR c IN
    SELECT k.id, max(r.run_at) AS last_run,
           CASE k.schedule_tag WHEN 'fast' THEN 30 WHEN 'half' THEN 60 WHEN 'hourly' THEN 130
                               WHEN 'daily' THEN 1500 ELSE 11520 END AS max_min
      FROM monitoring.checks k LEFT JOIN monitoring.results r ON r.check_id = k.id AND r.status <> 'error'
     WHERE k.enabled AND (k.schedule_tag NOT IN ('fast','half') OR in_shift)
     GROUP BY k.id, k.schedule_tag
  LOOP
    IF c.last_run IS NULL OR c.last_run < p_now - make_interval(mins => c.max_min) THEN
      PERFORM monitoring.raise_incident('MECH:stale:' || c.id, 'MECH', 'MECH', NULL,
              'αποτέλεσμα εντός ' || c.max_min || ' λεπτών');
      n := n + 1;
    ELSE
      PERFORM monitoring.resolve_incident('MECH:stale:' || c.id, 'self_check');
    END IF;
  END LOOP;

  FOR c IN SELECT problem, detail FROM monitoring.v_health WHERE problem LIKE 'schedule:%' LOOP
    PERFORM monitoring.raise_incident('MECH:' || c.problem, 'MECH', 'MECH', NULL, c.detail);
    n := n + 1;
  END LOOP;

  -- Mutual watch (owner 22/9 23:15): the p1 routine and the watchdog routine each beat hourly; either one
  -- stale ⇒ MECH incident, which the OTHER one pushes. Both stale ⇒ only the Anthropic-cloud risk remains.
  FOR c IN SELECT unnest(ARRAY['routine-p1','routine-watchdog']) AS src LOOP
    SELECT last_beat INTO hb FROM monitoring.heartbeat WHERE source = c.src;
    IF hb IS NULL OR hb < p_now - make_interval(mins => lim_r::int) THEN
      PERFORM monitoring.raise_incident('MECH:' || c.src, 'MECH', 'MECH', NULL,
              'ρουτίνα ' || c.src || ' ζωντανή εντός ' || lim_r || ' λεπτών');
      n := n + 1;
    ELSE
      PERFORM monitoring.resolve_incident('MECH:' || c.src, 'self_check');
    END IF;
  END LOOP;
  RETURN n;
END $fn$;


-- ---------------------------------------------------------------------------------------------
-- Alert text (≤ 8 lines, no model): τι / ροή / έκταση / επίπτωση / αποδεικτικά+ώρα / βεβαιότητα / επόμενο.
CREATE OR REPLACE FUNCTION monitoring.render_alert(p_incident bigint)
RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT concat_ws(E'\n',
    CASE WHEN i.severity = 'MECH' THEN '⚫ ΜΗΧΑΝΙΣΜΟΣ' ELSE '🔴 ' || i.severity END
      || CASE WHEN i.state = 'recurred' THEN ' (ΞΑΝΑ)' ELSE '' END
      || ' · ' || i.check_id || ' ' || coalesce(k.title, 'ο ίδιος ο ελεγκτής: ' || i.incident_key)
      || CASE WHEN cardinality(k.flows) > 0 THEN ' (' || array_to_string(k.flows, ',') || ')' ELSE '' END,
    'Έκταση: ' || coalesce(i.value::text, 'χωρίς τιμή')
      || CASE WHEN cardinality(i.entity_ids) > 0
              THEN ' · ids ' || array_to_string(i.entity_ids[1:8], ', ')
                   || CASE WHEN cardinality(i.entity_ids) > 8 THEN ' +' || (cardinality(i.entity_ids) - 8) ELSE '' END
              ELSE '' END,
    'Επίπτωση: ' || coalesce(k.impact, CASE WHEN i.severity = 'MECH'
                    THEN 'ο έλεγχος δεν βλέπει — η σιωπή ΔΕΝ σημαίνει «όλα καλά»' ELSE 'δεν έχει οριστεί' END),
    'Αποδεικτικά: όριο «' || coalesce(i.expected, '?') || '»' || ' · πρώτη φορά '
      || to_char(i.first_seen AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI')
      || ' · τελευταία ' || to_char(i.last_seen AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI')
      || ' · ×' || i.occurrences,
    'Βεβαιότητα: ' || coalesce(k.confidence, 'μηχανισμός — βέβαιο ότι ΔΕΝ έτρεξε κάτι'),
    'Επόμενο: ' || coalesce(k.next_step, 'άνοιγμα monitoring.results/runs για το ' || i.check_id),
    'Διάγνωση: ' || coalesce(i.diagnosis->>'category', 'εκκρεμεί'))
  FROM monitoring.incidents i LEFT JOIN monitoring.checks k ON k.id = i.check_id AND i.check_id <> 'MECH'
  WHERE i.id = p_incident;
$fn$;

-- What must be pushed now. Policy: P1 + MECH immediately; P2 waits for the 17:00 digest.
CREATE OR REPLACE VIEW monitoring.v_alerts_due_raw AS
  SELECT i.id, i.incident_key, i.check_id, i.severity, i.state, i.value, i.first_seen
    FROM monitoring.incidents i
   WHERE i.state IN ('new','recurred','confirmed') AND i.severity IN ('P1','MECH')
     AND (i.notified_at IS NULL
          OR i.worsened_at > i.notified_at
          OR i.last_seen > i.notified_at + make_interval(hours => (SELECT value::int FROM monitoring.limits WHERE name='renotify_hours')));

CREATE OR REPLACE VIEW monitoring.v_alerts_due AS
  SELECT d.*, monitoring.render_alert(d.id) AS body
    FROM monitoring.v_alerts_due_raw d
   ORDER BY CASE d.severity WHEN 'MECH' THEN 0 ELSE 1 END, d.first_seen;

-- Read-time health (no writes, no cron needed): what the ROUTINES read. If pg_cron itself dies, self_check()
-- never runs — so staleness must be computed at READ time, by whoever is still alive. One row per problem;
-- zero rows = healthy. «Δεν υπάρχουν στοιχεία» (no run ever / stale) is a problem row, never silence.
CREATE OR REPLACE VIEW monitoring.v_health AS
  WITH now_ AS (SELECT clock_timestamp() AS t,
                  extract(isodow FROM (clock_timestamp() AT TIME ZONE 'Europe/Athens')) BETWEEN 1 AND 6
                  AND (clock_timestamp() AT TIME ZONE 'Europe/Athens')::time BETWEEN '05:45' AND '15:00' AS in_shift),
  tags AS (SELECT * FROM (VALUES ('fast', 35, true), ('half', 65, true), ('hourly', 130, false),
                                 ('daily', 1500, false), ('weekly', 11520, false)) v(tag, max_min, shift_only)),
  last_run AS (SELECT tag, max(finished_at) FILTER (WHERE complete) AS last_ok FROM monitoring.runs GROUP BY tag)
  SELECT 'cron:' || t.tag AS problem, 'MECH' AS severity,
         'ο κύκλος ' || t.tag || ' δεν ολοκληρώθηκε εντός ' || t.max_min || '′ (τελευταίος: '
         || coalesce(to_char(l.last_ok AT TIME ZONE 'Europe/Athens','DD/MM HH24:MI'), 'ΠΟΤΕ') || ')' AS detail
    FROM tags t CROSS JOIN now_ n LEFT JOIN last_run l ON l.tag = t.tag
   WHERE EXISTS (SELECT 1 FROM monitoring.checks k WHERE k.enabled AND k.schedule_tag = t.tag)
     AND (NOT t.shift_only OR n.in_shift)
     AND (l.last_ok IS NULL OR l.last_ok < n.t - make_interval(mins => t.max_min))
  UNION ALL
  SELECT 'routine:' || s.src, 'MECH', 'η ρουτίνα ' || s.src || ' δεν έδωσε σημείο ζωής εντός '
         || (SELECT value FROM monitoring.limits WHERE name='routine_stale_minutes') || '′ (τελευταίο: '
         || coalesce(to_char(h.last_beat AT TIME ZONE 'Europe/Athens','DD/MM HH24:MI'), 'ΠΟΤΕ') || ')'
    FROM (VALUES ('routine-p1'), ('routine-watchdog')) s(src) CROSS JOIN now_ n
    LEFT JOIN monitoring.heartbeat h ON h.source = s.src
   WHERE h.last_beat IS NULL
      OR h.last_beat < n.t - make_interval(mins => (SELECT value::int FROM monitoring.limits WHERE name='routine_stale_minutes'))
  UNION ALL
  SELECT 'incident:' || i.incident_key, 'MECH', 'ανοιχτό περιστατικό μηχανισμού από '
         || to_char(i.first_seen AT TIME ZONE 'Europe/Athens','DD/MM HH24:MI')
    FROM monitoring.incidents i WHERE i.severity = 'MECH' AND i.state IN ('new','confirmed','recurred')
  UNION ALL
  -- A3 (review A 23/9 #4): pg_cron runs in UTC; at the DST change (25/10) the shift-bound jobs silently move
  -- one hour. The first complete run of today, in Athens time, must be within 30′ of its planned time.
  SELECT 'schedule:' || x.tag, 'MECH', 'ο πρώτος κύκλος ' || x.tag || ' σήμερα έτρεξε ' || to_char(x.first_athens, 'HH24:MI')
         || ' Αθήνα αντί ' || to_char(x.planned, 'HH24:MI') || ' — πιθανή αλλαγή ώρας (UTC cron)'
    FROM (SELECT r.tag, min(r.started_at AT TIME ZONE 'Europe/Athens') AS first_athens,
                 CASE r.tag WHEN 'fast' THEN time '05:00' WHEN 'half' THEN time '06:00' WHEN 'daily' THEN time '05:10' END AS planned
            FROM monitoring.runs r
           WHERE r.tag IN ('fast','half','daily')
             AND (r.started_at AT TIME ZONE 'Europe/Athens')::date = (clock_timestamp() AT TIME ZONE 'Europe/Athens')::date
             AND r.source_cron
           GROUP BY r.tag) x
   WHERE abs(extract(epoch FROM (x.first_athens::time - x.planned))) > 1800
  UNION ALL
  SELECT 'undelivered:' || d.incident_key, 'MECH', 'ειδοποίηση ' || d.severity || ' εκκρεμεί > 90′ (από '
         || to_char(d.first_seen AT TIME ZONE 'Europe/Athens','DD/MM HH24:MI') || ')'
    FROM monitoring.v_alerts_due_raw d CROSS JOIN now_ n WHERE d.first_seen < n.t - interval '90 minutes';


-- (Defined after v_alerts_due_raw: SQL-language bodies are validated at CREATE time.)
-- True only when EVERYTHING is healthy. Read by the watchdog routine: false ⇒ «ο ελεγκτής σιώπησε» push+email.
CREATE OR REPLACE FUNCTION monitoring.deadman_ok(p_now timestamptz DEFAULT clock_timestamp())
RETURNS boolean LANGUAGE sql STABLE AS $fn$
  SELECT NOT EXISTS (SELECT 1 FROM monitoring.incidents WHERE severity = 'MECH' AND state IN ('new','confirmed','recurred'))
     AND NOT EXISTS (SELECT 1 FROM monitoring.v_alerts_due_raw WHERE first_seen < p_now - interval '90 minutes')
     AND EXISTS (SELECT 1 FROM monitoring.heartbeat WHERE source = 'routine-p1'
                  AND last_beat > p_now - make_interval(mins => (SELECT value::int FROM monitoring.limits WHERE name='routine_stale_minutes')));
$fn$;

-- Narrow write path for the notifier (EXECUTE granted to tms_monitor_writer in 050). Records what was
-- sent and marks the incident notified. Touches ONLY schema monitoring.
CREATE OR REPLACE FUNCTION monitoring.record_notification(p_incident bigint, p_kind text, p_channel text,
    p_body text, p_status text, p_sender text, p_err text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = monitoring, pg_temp AS $fn$
DECLARE nid bigint;
BEGIN
  IF p_kind NOT IN ('alert','storm','digest','test') OR p_status NOT IN ('queued','sent','failed') THEN
    RAISE EXCEPTION 'invalid kind/status';
  END IF;
  INSERT INTO monitoring.notifications (incident_id, kind, channel, body, status, sent_at, sender, err)
  VALUES (p_incident, p_kind, left(p_channel, 40), left(p_body, 4000), p_status,
          CASE WHEN p_status = 'sent' THEN clock_timestamp() END, left(p_sender, 120), left(p_err, 300))
  RETURNING id INTO nid;
  IF p_incident IS NOT NULL AND p_status = 'sent' THEN
    UPDATE monitoring.incidents SET notified_at = clock_timestamp(), notified_value = value,
           notify_count = notify_count + 1 WHERE id = p_incident;
  END IF;
  RETURN nid;
END $fn$;

CREATE OR REPLACE FUNCTION monitoring.beat(p_source text, p_run text, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = monitoring, pg_temp AS $fn$
  INSERT INTO monitoring.heartbeat (source, last_beat, last_run, detail)
  VALUES (left(p_source, 40), clock_timestamp(), left(p_run, 120), left(p_detail, 300))
  ON CONFLICT (source) DO UPDATE SET last_beat = EXCLUDED.last_beat, last_run = EXCLUDED.last_run,
                                     detail = EXCLUDED.detail;
$fn$;

-- Stores a VALIDATED diagnosis (validator: tms-auditor/investigate/validate.mjs; the routine only calls this
-- with a report that passed it). Does not change state: red stays red until the check runs green.
CREATE OR REPLACE FUNCTION monitoring.record_diagnosis(p_incident bigint, p_report jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = monitoring, pg_temp AS $fn$
BEGIN
  IF (p_report->>'category') IS NULL OR (p_report->>'category') NOT IN
     ('ΤΕΚΜΗΡΙΩΜΕΝΟ ΤΕΧΝΙΚΟ ΕΛΑΤΤΩΜΑ','ΠΙΘΑΝΟ ΠΡΟΒΛΗΜΑ','ΛΕΙΤΟΥΡΓΙΚΗ ΕΚΚΡΕΜΟΤΗΤΑ',
      'ΕΓΚΕΚΡΙΜΕΝΗ ΕΞΑΙΡΕΣΗ','ΑΝΕΠΑΡΚΗ ΣΤΟΙΧΕΙΑ') THEN
    RAISE EXCEPTION 'invalid category';
  END IF;
  IF octet_length(p_report::text) > 16000 THEN RAISE EXCEPTION 'report too large'; END IF;
  UPDATE monitoring.incidents SET diagnosis = p_report, diagnosed_at = clock_timestamp() WHERE id = p_incident;
END $fn$;

-- ---------------------------------------------------------------------------------------------
-- Incident package for the investigator (brief §Γ). Built by SQL so the model does not choose what to read.
-- Contains NO usernames, NO before/after data, NO names: roles, ids, counts, timestamps only.
-- Code pointers / last commit are added by the JS side from docs/tms-auditor/graph (repo, not DB).
CREATE OR REPLACE FUNCTION monitoring.build_package(p_incident bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $fn$
DECLARE i monitoring.incidents%ROWTYPE; k monitoring.checks%ROWTYPE; aud jsonb; errs jsonb; keys text[]; num_keys text[];
BEGIN
  SELECT * INTO i FROM monitoring.incidents WHERE id = p_incident;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO k FROM monitoring.checks WHERE id = i.check_id;

  -- audit rows of the affected entities, newest 20, without actor/before/after.
  -- TWO keys: the Worker audits facade tables with legacy_id ('rec…') but the DB triggers (rt_sync_audit…)
  -- audit with the numeric id. Matching only one of them hid every trigger row (found 22/9 by the first real
  -- Claude diagnosis in the local chain: «audit_last20 empty — searched with the wrong key?»).
  IF k.entity_table IS NOT NULL AND cardinality(i.entity_ids) > 0 THEN
    keys := i.entity_ids[1:50];
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                AND table_name = k.entity_table AND column_name = 'legacy_id') THEN
      EXECUTE format('SELECT coalesce(array_agg(id::text), ''{}'') FROM public.%I WHERE legacy_id = ANY($1)', k.entity_table)
        INTO num_keys USING keys;
      keys := keys || coalesce(num_keys, '{}');
    END IF;
    EXECUTE $q$SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]') FROM (
               SELECT created_at, action, table_name, record_id, role
                 FROM public.audit_log
                WHERE record_id = ANY($2)
                  AND (table_name = $1 OR role = 'system')          -- trigger rows may name a derived table
                  AND created_at > $3 - interval '14 days'
                ORDER BY created_at DESC LIMIT 20) x$q$
      INTO aud USING k.entity_table, keys, i.first_seen;
  END IF;
  SELECT coalesce(jsonb_agg(e ORDER BY e.created_at DESC), '[]') INTO errs FROM (
    SELECT created_at, left(message, 120) AS message
      FROM public.app_errors
     WHERE created_at BETWEEN i.first_seen - interval '2 hours' AND i.last_seen
     ORDER BY created_at DESC LIMIT 10) e;

  RETURN jsonb_build_object(
    'incident', jsonb_build_object('id', i.id, 'key', i.incident_key, 'state', i.state, 'severity', i.severity,
                 'value', i.value, 'expected', i.expected, 'first_seen', i.first_seen, 'last_seen', i.last_seen,
                 'occurrences', i.occurrences, 'entity_ids', to_jsonb(i.entity_ids[1:50])),
    'check', CASE WHEN k.id IS NULL THEN NULL ELSE jsonb_build_object('id', k.id, 'title', k.title,
                 'flows', to_jsonb(k.flows), 'sql', k.sql_text, 'entity_table', k.entity_table,
                 'exceptions', k.exceptions, 'tolerance', k.tolerance, 'impact', k.impact,
                 'code_pointers', k.code_pointers, 'sha_verified', k.sha_verified) END,
    'history', (SELECT coalesce(jsonb_agg(h ORDER BY h.run_at DESC), '[]') FROM (
                 SELECT run_at, value, status FROM monitoring.results
                  WHERE check_id = i.check_id ORDER BY run_at DESC LIMIT 7) h),
    'audit_last20', coalesce(aud, '[]'),
    'app_errors_window', errs,
    'not_in_package', jsonb_build_array('usernames/actors', 'audit before/after data', 'names of clients/drivers',
                 'Worker request logs (none exist before Level A)', 'what the user saw on screen'));
END $fn$;

-- Digest text for 17:00 (sent even when everything is green). First line after the title = last COMPLETE run.
CREATE OR REPLACE FUNCTION monitoring.digest(p_now timestamptz DEFAULT clock_timestamp())
RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT concat_ws(E'\n',
    'Έλεγχος TMS ' || to_char(p_now AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI'),
    'Τελευταίος ΠΛΗΡΗΣ έλεγχος: ' || coalesce((SELECT to_char(max(finished_at) AT TIME ZONE 'Europe/Athens','DD/MM HH24:MI')
                                             FROM monitoring.runs WHERE complete), 'ΚΑΝΕΝΑΣ — ΚΟΚΚΙΝΟ'),
    (SELECT '⚫ ΜΗΧΑΝΙΣΜΟΣ: ' || string_agg(incident_key, ', ' ORDER BY incident_key)
       FROM monitoring.incidents WHERE severity = 'MECH' AND state IN ('new','confirmed','recurred')),
    coalesce((SELECT string_agg('🔴 ' || i.severity || ' ' || i.check_id || ' ' || k.title || ': ' || i.value
                                || ' · διάγνωση: ' || coalesce(i.diagnosis->>'category','εκκρεμεί'), E'\n' ORDER BY i.severity, i.check_id)
                FROM monitoring.incidents i JOIN monitoring.checks k ON k.id = i.check_id
               WHERE i.state IN ('new','confirmed','recurred')), '✅ κανένα ανοιχτό περιστατικό ελέγχου'),
    (SELECT 'Ουρές: ' || string_agg(k.title || ' ' || r.value
                   || CASE WHEN w.value IS NOT NULL AND r.value > w.value * 1.2 THEN ' ▲ (+20% σε 7 ημ.)' ELSE '' END,
                   ' · ' ORDER BY k.id)
       FROM monitoring.checks k
       JOIN LATERAL (SELECT value FROM monitoring.results WHERE check_id = k.id AND status = 'queue'
                      ORDER BY run_at DESC LIMIT 1) r ON true
       LEFT JOIN LATERAL (SELECT value FROM monitoring.results WHERE check_id = k.id AND status = 'queue'
                           AND run_at < p_now - interval '7 days' ORDER BY run_at DESC LIMIT 1) w ON true
      WHERE k.is_queue AND k.enabled),
    (SELECT 'ΚΕΝΑ (έλεγχοι εκτός λειτουργίας): ' || string_agg(id, ', ' ORDER BY id)
       FROM monitoring.checks WHERE NOT enabled));
$fn$;

-- Born closed, explicitly (the default privileges above cover functions created later by the same owner).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA monitoring FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA monitoring FROM PUBLIC;
DO $do$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP     -- Supabase API roles, if present
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA monitoring FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA monitoring FROM %I', r);
      EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA monitoring FROM %I', r);
    END IF;
  END LOOP;
END $do$;
