-- 050_monitor_roles.sql — DRAFT · NOT EXECUTED · owner runs after 15:00, AFTER 047/048
-- Two database roles so that "read-only" is a PRIVILEGE, not a sentence in a prompt (today the auditors
-- connect as postgres: rolsuper/rolbypassrls = true — 01 §6).
--   tms_reader         : SELECT on an explicit list. Used by any interactive auditor session.
--   tms_monitor_writer : tms_reader + EXECUTE on three monitoring.* SECURITY DEFINER functions (schema
--                        monitoring only). Used by the p1/digest routines. Writes NOTHING in the TMS.
-- Why default_transaction_read_only is set but NOT relied on: a session may SET it off itself. The boundary
-- is the missing INSERT/UPDATE/DELETE grants + no EXECUTE on SECURITY DEFINER functions (checked below).
-- Principle 7: only GRANTs to the NEW roles; nothing is revoked from existing roles (service_role, anon, …).
-- Passwords are typed by the owner in the SQL editor — NEVER in this file, never in the repo.
-- Reverse: DROP OWNED BY tms_monitor_writer, tms_reader; DROP ROLE tms_monitor_writer, tms_reader;

CREATE ROLE tms_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 3 PASSWORD NULL;               -- owner: ALTER ROLE tms_reader PASSWORD '…' (not in git)
CREATE ROLE tms_monitor_writer LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 3 PASSWORD NULL;
GRANT tms_reader TO tms_monitor_writer;           -- writer = reader + 3 functions, nothing else

ALTER ROLE tms_reader         SET default_transaction_read_only = on;
ALTER ROLE tms_reader         SET statement_timeout = '15s';
ALTER ROLE tms_reader         SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE tms_monitor_writer SET statement_timeout = '15s';
ALTER ROLE tms_monitor_writer SET idle_in_transaction_session_timeout = '60s';

GRANT USAGE ON SCHEMA public, monitoring TO tms_reader;

-- Explicit list (principle 5: born closed). NEVER users, NEVER vault, NEVER raw audit_log.
-- Source: every table/view read by tms-auditor/checks/*.sql + the package builder. The local test
-- roles.test.mjs FAILS if a check reads a table missing here (the list cannot silently drift).
GRANT SELECT ON
  public.orders, public.order_stops, public.national_orders, public.national_loads,
  public.groupage_lines, public.consolidated_loads, public.ramp,
  public.ct_round_trips, public.ct_rt_legs, public.ct_cost_lines, public.ct_cost_docs,
  public.dl_entries, public.pl_movements, public.app_errors, public.facade_unknown_fields,
  public.trucks, public.trailers, public.drivers, public.locations, public.local_moves,
  public.dl_v_rt_gap, public.pl_v_order_gate
TO tms_reader;

-- audit_log only WITHOUT actor/before/after (column privileges; the package builder uses exactly these).
-- NOTE: the audit-pair checks (P-xx) need after_data keys → they run as postgres from cron, never as a role.
GRANT SELECT (id, created_at, role, action, table_name, record_id) ON public.audit_log TO tms_reader;

GRANT SELECT ON ALL TABLES IN SCHEMA monitoring TO tms_reader;
REVOKE ALL ON FUNCTION monitoring.record_notification(bigint,text,text,text,text,text,text),
                       monitoring.beat(text,text,text),
                       monitoring.record_diagnosis(bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION monitoring.record_notification(bigint,text,text,text,text,text,text),
                          monitoring.beat(text,text,text),
                          monitoring.record_diagnosis(bigint,jsonb) TO tms_monitor_writer;
-- Read-only functions the routines call (047 creates everything closed; views call render_alert AS THE CALLER).
GRANT EXECUTE ON FUNCTION monitoring.render_alert(bigint), monitoring.build_package(bigint),
                          monitoring.digest(timestamptz), monitoring.deadman_ok(timestamptz) TO tms_reader;
-- run_checks/self_check/raise_incident/resolve_incident: cron (postgres) only
REVOKE ALL ON FUNCTION monitoring.run_checks(text, boolean), monitoring.self_check(timestamptz),
                       monitoring.raise_incident(text,text,text,numeric,text,text[]),
                       monitoring.resolve_incident(text,text) FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------------
-- VERIFY without writing anything (run as postgres; every line must hold):
-- 1) no write privilege on ANY table in public/monitoring                        expected writable = 0, 0
-- SELECT r.rolname, count(*) FILTER (WHERE has_table_privilege(r.rolname, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE')) AS writable
--   FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE r.rolname IN ('tms_reader','tms_monitor_writer') AND n.nspname IN ('public','monitoring') AND c.relkind IN ('r','p','v')
--  GROUP BY 1;
-- 2) SECURITY DEFINER functions the roles can execute (they write as their OWNER!)
--    expected: tms_reader none · tms_monitor_writer exactly the 3 monitoring ones
-- SELECT r.rolname, n.nspname || '.' || p.proname AS fn
--   FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE r.rolname IN ('tms_reader','tms_monitor_writer') AND p.prosecdef
--    AND n.nspname NOT IN ('pg_catalog','information_schema') AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
--  ORDER BY 1, 2;
--    ⚠ functions granted to PUBLIC are executable by EVERY role, including these. Any public.* SECURITY DEFINER
--    function listed for tms_reader is a hole in "read-only": do NOT revoke it here — report it (security
--    finding: scratchpad, never the public repo) and decide separately (GRANT to service_role FIRST).
-- 3) SELECT rolname, rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname LIKE 'tms\_%';    -- all false
-- 4) SELECT has_table_privilege('tms_reader','public.users','SELECT');                                  -- false
-- 5) SELECT has_column_privilege('tms_reader','public.audit_log','before_data','SELECT');                -- false
