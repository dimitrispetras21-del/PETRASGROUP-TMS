// Local, isolated database for the auditor: PGlite (real Postgres compiled to WASM, in-process, in-memory).
// It loads the SAME DRAFT migrations that production would run (worker/migrations/drafts/047*, 048, 050),
// minus the lines fenced with "-- @prod-only-begin/end" (CREATE EXTENSION pg_cron/pg_net, cron.schedule),
// and replaces pg_net + Vault with mock schemas that RECORD every outbound call instead of making it.
// Nothing here can reach production: there is no network client and no connection string.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { loadChecks, seedSql } from '../checks/load.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const DRAFTS = path.join(ROOT, 'worker/migrations/drafts');
const FIXTURE = path.join(HERE, '../test/fixtures/schema.sql');

export function stripProdOnly(sql) {
  const removed = [];
  const out = sql.replace(/-- @prod-only-begin[\s\S]*?-- @prod-only-end/g, (m) => { removed.push(m); return '-- (prod-only block skipped locally)'; });
  return { sql: out, removed };
}

// pg_net / Vault stand-ins. http_* return a request id and write a response row whose status comes from
// net.mock_status (per URL prefix; default 200), so tests can simulate "the routine /fire endpoint is down".
export const MOCKS = `
CREATE SCHEMA IF NOT EXISTS net;
CREATE TABLE net.mock_requests (id bigserial PRIMARY KEY, method text, url text, headers jsonb, body jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE net._http_response (id bigint PRIMARY KEY, status_code int, content text,
  created timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE net.mock_status (url_prefix text PRIMARY KEY, status_code int NOT NULL);
CREATE FUNCTION net._mock(p_method text, p_url text, p_headers jsonb, p_body jsonb) RETURNS bigint
LANGUAGE plpgsql AS $$ DECLARE rid bigint; code int; BEGIN
  INSERT INTO net.mock_requests (method, url, headers, body) VALUES (p_method, p_url, p_headers, p_body) RETURNING id INTO rid;
  SELECT status_code INTO code FROM net.mock_status WHERE p_url LIKE url_prefix || '%' ORDER BY length(url_prefix) DESC LIMIT 1;
  INSERT INTO net._http_response (id, status_code) VALUES (rid, coalesce(code, 200));
  RETURN rid; END $$;
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}',
  timeout_milliseconds int DEFAULT 2000) RETURNS bigint LANGUAGE sql AS $$ SELECT net._mock('POST', url, headers, body) $$;
CREATE FUNCTION net.http_get(url text, params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}',
  timeout_milliseconds int DEFAULT 2000) RETURNS bigint LANGUAGE sql AS $$ SELECT net._mock('GET', url, headers, NULL) $$;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE vault.mock_secrets (name text PRIMARY KEY, secret text NOT NULL);
CREATE VIEW vault.decrypted_secrets AS SELECT name, secret AS decrypted_secret FROM vault.mock_secrets;
`;

// `grant select [(<columns>)] on <relations> to <roles>;` statements of a DRAFT migration, read from the draft itself
// so the local database and the grant tests use the draft's own list (one source, no hand-copied copy). Used for 057
// (stock lots): it is ONE DO block that rewrites production views, so it cannot run on the fixture — but the objects
// the checks read are mirrored in the fixture (test/fixtures DRAFT_057), and without the draft's grants
// tms_check_runner would fail on them with «permission denied». Delete together with DRAFT_057 once 057 is executed
// and re-snapshotted.
// cols (round 2): 057 gives tms_reader a COLUMN grant on stock_lots (every column except warehouse_charge, Ε1). It
// is kept as a column grant here too — widened to the whole table, the local tms_reader could read the owner's money
// and the roles test that proves it cannot would pass for the wrong reason.
export function draftGrants(file) {
  const sql = fs.readFileSync(path.join(DRAFTS, file), 'utf8').replace(/--[^\n]*/g, '');
  return [...sql.matchAll(/\bgrant\s+select\s*(?:\(([^)]*)\)\s*)?on\s+([^;]+?)\s+to\s+([^;]+?);/gi)].map((m) => ({
    cols: m[1] ? m[1].split(',').map((x) => x.trim()) : null,
    rels: m[2].split(',').map((x) => x.trim().replace(/^public\./, '')),
    roles: m[3].split(',').map((x) => x.trim()),
  }));
}
export const STOCK_DRAFT = '057_stock_lots.sql';

export async function createDb({ roles = false, seed = true, fixture = true } = {}) {
  const db = new PGlite();
  await db.exec(MOCKS);
  if (fixture) await db.exec(fs.readFileSync(FIXTURE, 'utf8'));
  await db.exec(fs.readFileSync(path.join(DRAFTS, '047_monitoring_schema.sql'), 'utf8'));
  await db.exec(stripProdOnly(fs.readFileSync(path.join(DRAFTS, '048_monitoring_notify.sql'), 'utf8')).sql);
  if (seed) {
    const { checks, errors } = loadChecks();
    if (errors.length) throw new Error('catalog lint: ' + errors.join('; '));
    await db.exec(seedSql(checks));
  }
  if (roles) await db.exec(fs.readFileSync(path.join(DRAFTS, '050_monitor_roles.sql'), 'utf8'));
  // 057's grants, only on what exists here: relations it creates that no check reads (stock_v_lot_alloc,
  // stock_v_rt_amounts) are not in the fixture, service_role is not a local role, tms_reader exists only with 050.
  if (fixture) for (const g of draftGrants(STOCK_DRAFT)) for (const rel of g.rels) for (const role of g.roles) {
    const ok = (await db.query(`SELECT to_regclass($1) IS NOT NULL AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $2) AS ok`,
      ['public.' + rel, role])).rows[0].ok;
    if (ok) await db.exec(`GRANT SELECT ${g.cols ? `(${g.cols.join(', ')}) ` : ''}ON public.${rel} TO ${role}`);
  }
  return db;
}

export async function one(db, sql, params) { const r = await db.query(sql, params); return r.rows[0]; }
export async function all(db, sql, params) { return (await db.query(sql, params)).rows; }
