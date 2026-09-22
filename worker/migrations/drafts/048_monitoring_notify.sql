-- 048_monitoring_notify.sql — DRAFT · NOT EXECUTED · owner runs after 15:00, AFTER 047
-- Wake-up and dead-man. Replaces the Telegram-first sketch of 05 §1.3 after the owner's 22/9 22:30 decision:
-- the alert channel is a Claude Code cloud ROUTINE (push + Gmail). Verified 22/9 at
-- code.claude.com/docs/en/routines.md: "The minimum interval is one hour" ⇒ the DB wakes the routine through
-- its API trigger (POST …/fire) as soon as a P1/MECH incident is due, and the hourly schedule is only a net.
-- Owner 22/9 23:15: NO healthchecks.io / ntfy / Telegram. The external eye is a SECOND routine
-- («tms-auditor-watchdog», hourly, +30′) that reads monitoring.heartbeat/runs and pushes+emails «ο ελεγκτής
-- σιώπησε». The two routines watch each other's heartbeat (self_check). Accepted residual risk: the whole
-- Anthropic cloud down ⇒ both silent. (A direct DB→Telegram/ntfy adapter can be added later if ever needed.)
--
-- Lines between "-- @prod-only-begin" and "-- @prod-only-end" are skipped by the local runner
-- (tms-auditor/run-checks.mjs), which provides mock schemas net/vault instead. Everything else runs
-- IDENTICALLY locally and in Supabase. Secrets live ONLY in Vault — never in cron.job.command (readable).
-- Reverse: SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'tms-%';
--          DROP FUNCTION monitoring.fire_due, monitoring.fire_verify;
--          DROP TABLE monitoring.fires;

-- @prod-only-begin
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
-- @prod-only-end

INSERT INTO monitoring.limits VALUES
  ('fire_min_gap_minutes', 30, 'same due set ⇒ fire the routine at most every 30′ (a NEW due incident fires at once)')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS monitoring.fires (
  id          bigserial PRIMARY KEY,
  fired_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  target      text NOT NULL,                 -- 'routine-p1'
  request_id  bigint,                        -- pg_net request id (net._http_response.id)
  incident_ids bigint[] NOT NULL DEFAULT '{}',
  http_status int,                           -- filled by fire_verify()
  verified_at timestamptz
);

CREATE OR REPLACE FUNCTION monitoring.secret(p_name text) RETURNS text
LANGUAGE sql STABLE AS $fn$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_name $fn$;

-- Wake the p1 routine when something is due. The fire text carries ONLY incident ids (the routine reads the
-- details itself with its own role); the routine prompt treats the payload as untrusted data by design.
CREATE OR REPLACE FUNCTION monitoring.fire_due() RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE due bigint[]; last monitoring.fires%ROWTYPE; gap int; req bigint; url text; tok text;
BEGIN
  SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO due FROM monitoring.v_alerts_due_raw;
  IF cardinality(due) = 0 THEN RETURN 0; END IF;
  SELECT * INTO last FROM monitoring.fires WHERE target = 'routine-p1' ORDER BY fired_at DESC LIMIT 1;
  SELECT value::int INTO gap FROM monitoring.limits WHERE name = 'fire_min_gap_minutes';
  IF last.id IS NOT NULL AND last.fired_at > clock_timestamp() - make_interval(mins => gap)
     AND due <@ last.incident_ids THEN
    RETURN 0;                                                   -- nothing new since the last wake-up
  END IF;
  url := monitoring.secret('routine_p1_fire_url');
  tok := monitoring.secret('routine_p1_fire_token');
  IF url IS NULL OR tok IS NULL THEN
    -- no wake-up path configured: say it, do not pretend (the hourly routine still sees the MECH incident)
    PERFORM monitoring.raise_incident('MECH:fire-not-configured', 'MECH', 'MECH', NULL, 'routine_p1_fire_url/token στο Vault');
    RETURN 0;
  END IF;
  SELECT net.http_post(
           url := url,
           body := jsonb_build_object('text', 'tms-auditor due incidents: ' || array_to_string(due, ',')),
           headers := jsonb_build_object('Authorization', 'Bearer ' || tok,
                                         'anthropic-beta', 'experimental-cc-routine-2026-04-01',
                                         'anthropic-version', '2023-06-01',
                                         'Content-Type', 'application/json'),
           timeout_milliseconds := 8000) INTO req;
  INSERT INTO monitoring.fires (target, request_id, incident_ids) VALUES ('routine-p1', req, due);
  RETURN cardinality(due);
END $fn$;

-- pg_net is async: the HTTP status appears later in net._http_response (kept ~6h). A fire that did not get
-- 2xx is a MECH incident; the hourly p1 run and the watchdog both read it (the wake-up failed, the net did not).
CREATE OR REPLACE FUNCTION monitoring.fire_verify() RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE f record; code int; n int := 0;
BEGIN
  FOR f IN SELECT * FROM monitoring.fires WHERE verified_at IS NULL AND request_id IS NOT NULL
             AND fired_at < clock_timestamp() - interval '1 minute' LOOP
    SELECT status_code INTO code FROM net._http_response WHERE id = f.request_id;
    UPDATE monitoring.fires SET http_status = code, verified_at = clock_timestamp() WHERE id = f.id;
    IF code IS NULL OR code NOT BETWEEN 200 AND 299 THEN
      PERFORM monitoring.raise_incident('MECH:fire:' || f.target, 'MECH', 'MECH', code, 'HTTP 2xx από ' || f.target);
      n := n + 1;
    ELSE
      PERFORM monitoring.resolve_incident('MECH:fire:' || f.target, 'fire_verify');
    END IF;
  END LOOP;
  RETURN n;
END $fn$;

-- Schedule (UTC; Athens = UTC+3 until 25/10, then UTC+2 — the shift-bound jobs must be re-set on 25/10).
-- If they are not, v_health reports «schedule:fast/half/daily» the same morning (047, review A 23/9 #4).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA monitoring FROM PUBLIC;   -- born closed (047 default privileges too)
REVOKE ALL ON ALL TABLES IN SCHEMA monitoring FROM PUBLIC;
-- @prod-only-begin
SELECT cron.schedule('tms-fast',    '*/15 2-11 * * 1-6', $$SELECT monitoring.run_checks('fast', true)$$);    -- 05:00–14:45 Athens
SELECT cron.schedule('tms-half',    '*/30 3-11 * * 1-6', $$SELECT monitoring.run_checks('half', true)$$);
SELECT cron.schedule('tms-hourly',  '7 * * * *',         $$SELECT monitoring.run_checks('hourly', true)$$);
SELECT cron.schedule('tms-daily',   '10 2 * * *',        $$SELECT monitoring.run_checks('daily', true)$$);   -- 05:10 Athens
SELECT cron.schedule('tms-weekly',  '20 2 * * 6',        $$SELECT monitoring.run_checks('weekly', true)$$);  -- Saturday = TMS week
SELECT cron.schedule('tms-fire',    '*/5 * * * *',       $$SELECT monitoring.fire_due(); SELECT monitoring.fire_verify()$$);
SELECT cron.schedule('tms-self',    '*/15 * * * *',      $$SELECT monitoring.self_check()$$);  -- stale checks/routines ⇒ MECH ⇒ fire
-- @prod-only-end
