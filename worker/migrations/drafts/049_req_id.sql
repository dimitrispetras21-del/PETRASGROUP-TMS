-- 049_req_id.sql — DRAFT · NOT EXECUTED · owner runs after 15:00 · BEFORE the Worker deploy of feat/tms-auditor
-- Level A correlation: one id per user action ("x-tms-req: <26 chars>-<attempt>") travels
-- browser → Worker log line (kind:"req") → audit_log.req_id → app_errors.req_id.
-- Order matters: the new Worker writes req_id; if it deploys BEFORE this column exists, PostgREST rejects the
-- audit insert (unknown column) — audit() only console.errors, so the save SUCCEEDS WITHOUT AUDIT (02b §1.2).
-- Hence: this migration first, verify the SELECT below, THEN deploy.
-- Existing rows stay NULL = "before Level A" ⇒ checks treat NULL as GREY (unknown), never as green.
-- Reverse: ALTER TABLE … DROP COLUMN req_id (after reverting the Worker).

ALTER TABLE public.audit_log  ADD COLUMN IF NOT EXISTS req_id text;
ALTER TABLE public.app_errors ADD COLUMN IF NOT EXISTS req_id text;
ALTER TABLE public.app_errors ADD COLUMN IF NOT EXISTS role   text;   -- role of the verified JWT (never username)
CREATE INDEX IF NOT EXISTS audit_log_req_id_idx  ON public.audit_log  (req_id) WHERE req_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS app_errors_req_id_idx ON public.app_errors (req_id) WHERE req_id IS NOT NULL;

-- Verify (read-only), expected 3 rows:
-- SELECT table_name, column_name, data_type FROM information_schema.columns
--  WHERE table_schema='public' AND ((table_name='audit_log' AND column_name='req_id')
--     OR (table_name='app_errors' AND column_name IN ('req_id','role')));
