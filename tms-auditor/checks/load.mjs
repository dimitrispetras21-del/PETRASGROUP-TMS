// Loads tms-auditor/checks/*.sql (one file per check, metadata in a comment header) and lints each one.
// The .sql files are the ONLY source of truth for the catalog: the production seed (047b) is generated from
// them and a test fails if the committed seed drifts (principle 3: two copies = none).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHECKS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SEVERITIES = ['P1', 'P2', 'P3', 'P4', 'MECH'];
const SCHEDULES = ['fast', 'half', 'hourly', 'daily', 'weekly'];
const OPS = ['>', '>=', '<', '<=', '=', '<>', 'decrease', 'increase', 'none'];

// Functions a check may call. Anything else (TMS functions, rpc, pg_* admin, set_config, dblink…) is rejected:
// a check reads, it never executes application logic (brief: «χωρίς συναρτήσεις του TMS»).
const ALLOWED_FN = new Set(['count', 'sum', 'max', 'min', 'abs', 'coalesce', 'left', 'btrim', 'round', 'extract',
  'array_agg', 'now', 'exists', 'in', 'any', 'date', 'greatest', 'least', 'lower', 'upper', 'length']);
const KEYWORDS = new Set(['select', 'from', 'where', 'and', 'or', 'not', 'on', 'as', 'join', 'filter', 'over', 'values',
  'interval', 'case', 'when', 'then', 'else', 'end', 'between', 'is', 'having', 'by']);
const FORBIDDEN = /\b(insert|update|delete|merge|alter|drop|create|grant|revoke|truncate|copy|call|do|vacuum|analyze|lock|listen|notify|set|reset|execute|prepare|refresh|comment|security|pg_sleep|dblink|lo_\w+|set_config|nextval|setval)\b/i;

// Dollar-quoted strings FIRST, then '…' — same order as monitoring.check_sql_guard (047).
function stripStrings(sql) { return sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''").replace(/'(?:[^']|'')*'/g, "''"); }

export function lintSql(sql, where) {
  const errs = [];
  const s = stripStrings(sql).replace(/--[^\n]*/g, ' ');
  if (!/^\s*select\b/i.test(s)) errs.push(`${where}: must start with SELECT`);
  if (/;/.test(s.replace(/;\s*$/, ''))) errs.push(`${where}: exactly one statement`);
  const bad = s.match(FORBIDDEN);
  if (bad) errs.push(`${where}: forbidden keyword «${bad[0]}»`);
  for (const m of s.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const fn = m[1].toLowerCase();
    if (!ALLOWED_FN.has(fn) && !KEYWORDS.has(fn)) errs.push(`${where}: function «${fn}()» not in allowlist`);
  }
  return errs;
}

export function parseCheck(file, text) {
  const meta = {}; const lines = text.split('\n'); let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^-- ([a-z]+): ?(.*)$/);
    if (!m) break;
    meta[m[1]] = m[2].trim();
  }
  const body = lines.slice(i).join('\n');
  const [sqlPart, idsPart] = body.split(/^-- @ids\s*$/m);
  const red = (meta.red || '').match(/^(>=|<=|<>|>|<|=|decrease|increase|none)\s*(-?\d+(?:\.\d+)?)?$/);
  const enabled = (meta.enabled || '').startsWith('yes');
  const c = {
    id: meta.id, title: meta.title, flows: (meta.flows || '').split(',').map(s => s.trim()).filter(Boolean),
    severity: meta.severity, schedule: meta.schedule,
    red_op: red ? red[1] : null, red_value: red && red[2] != null ? Number(red[2]) : 0,
    baseline: meta.baseline === '' || meta.baseline == null ? null : Number(meta.baseline),
    is_queue: meta.queue === 'yes', entity_table: meta.entity || null,
    impact: meta.impact || null, next_step: meta.next || null, exceptions: meta.exceptions || null,
    tolerance: meta.tolerance || null, source: meta.source || null,
    enabled, disabled_reason: enabled ? null : (meta.enabled || '').replace(/^no:\s*/, '') || 'χωρίς αιτία',
    sql: (sqlPart || '').trim().replace(/;\s*$/, ''), ids_sql: idsPart ? idsPart.trim().replace(/;\s*$/, '') : null,
    file,
  };
  const errs = [];
  if (!c.id || path.basename(file, '.sql') !== c.id) errs.push(`${file}: id must equal file name`);
  if (!c.title) errs.push(`${file}: title missing`);
  if (!SEVERITIES.includes(c.severity)) errs.push(`${file}: severity ${c.severity}`);
  if (!SCHEDULES.includes(c.schedule)) errs.push(`${file}: schedule ${c.schedule}`);
  if (!OPS.includes(c.red_op)) errs.push(`${file}: red «${meta.red}»`);
  if (c.enabled) {
    errs.push(...lintSql(c.sql, `${c.id} sql`));
    if (c.ids_sql) errs.push(...lintSql(c.ids_sql, `${c.id} ids`));
    if (!c.is_queue && (c.severity === 'P1' || c.severity === 'P2') && !c.impact && !c.exceptions)
      errs.push(`${c.id}: P1/P2 needs impact or exceptions text (the alert must say why it matters)`);
  }
  return { check: c, errs };
}

export function loadChecks(dir = CHECKS_DIR) {
  const files = fs.readdirSync(dir).filter(f => /^[A-Z]+-\d+[a-z]?\.sql$/.test(f)).sort();
  const checks = []; const errors = [];
  for (const f of files) {
    const { check, errs } = parseCheck(f, fs.readFileSync(path.join(dir, f), 'utf8'));
    checks.push(check); errors.push(...errs);
  }
  const ids = new Set();
  for (const c of checks) { if (ids.has(c.id)) errors.push(`duplicate id ${c.id}`); ids.add(c.id); }
  return { checks, errors };
}

// Tables/views a check reads (FROM/JOIN targets) — used to prove the 050 GRANT list covers every check.
export function tablesRead(sql) {
  const out = new Set();
  for (const m of stripStrings(sql).matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_.]*)/gi)) {
    const t = m[1].toLowerCase().replace(/^public\./, '');
    if (!['lateral', 'unnest'].includes(t)) out.add(t);
  }
  return [...out];
}

const q = (v) => v == null ? 'NULL' : `$m$${String(v)}$m$`;
export function seedSql(checks) {
  const rows = checks.map(c => `(${[q(c.id), q(c.title), `ARRAY[${c.flows.map(q).join(',')}]::text[]`, q(c.sql), q(c.ids_sql),
    q(c.entity_table), q(c.red_op), c.red_value, c.baseline ?? 'NULL', q(c.severity), q(c.schedule), c.is_queue,
    q(c.impact), q(c.next_step), q(c.exceptions), q(c.tolerance), c.enabled, q(c.disabled_reason)].join(', ')})`);
  return `-- 047b_monitoring_seed.sql — GENERATED by tms-auditor/checks/build-seed.mjs from tms-auditor/checks/*.sql.\n` +
    `-- DO NOT EDIT BY HAND: edit the .sql check files and regenerate (test seed-drift fails otherwise).\n` +
    `-- DRAFT · NOT EXECUTED · owner runs after 047. Reverse: DELETE FROM monitoring.checks (schema monitoring only).\n` +
    `INSERT INTO monitoring.checks (id, title, flows, sql_text, ids_sql, entity_table, red_op, red_value, baseline, severity,\n` +
    `  schedule_tag, is_queue, impact, next_step, exceptions, tolerance, enabled, disabled_reason) VALUES\n` +
    rows.join(',\n') + `\nON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, flows=EXCLUDED.flows, sql_text=EXCLUDED.sql_text,\n` +
    `  ids_sql=EXCLUDED.ids_sql, entity_table=EXCLUDED.entity_table, red_op=EXCLUDED.red_op, red_value=EXCLUDED.red_value,\n` +
    `  baseline=EXCLUDED.baseline, severity=EXCLUDED.severity, schedule_tag=EXCLUDED.schedule_tag, is_queue=EXCLUDED.is_queue,\n` +
    `  impact=EXCLUDED.impact, next_step=EXCLUDED.next_step, exceptions=EXCLUDED.exceptions, tolerance=EXCLUDED.tolerance,\n` +
    `  enabled=EXCLUDED.enabled, disabled_reason=EXCLUDED.disabled_reason;\n`;
}
