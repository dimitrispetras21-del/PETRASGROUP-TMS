#!/usr/bin/env node
// Baseline run of TODAY's order scanner over the golden set.
//
//   TMS_JWT=<token> node tools/scan-eval/run-current.mjs --confirm-cost
//   node tools/scan-eval/run-current.mjs --dry-run          (no network, mock Worker)
//
// Options:
//   --golden <path>     golden.json (default: nearest .local/scan-golden/golden.json)
//   --docs <dir>        documents dir (default: <golden dir>/docs)
//   --out <path>        results file, must be under .local/ (default: <golden dir>/results/current-<ts>.json)
//   --only d01,d02      subset of doc_ids
//   --examples <path>   JSON array = localStorage 'tms_scan_training' of a browser (few-shot);
//                       default [] = a fresh browser. TABLES.SCAN_TRAINING is '' in config.js,
//                       so production has no shared examples — each browser only has its own.
//   --refresh-ref       re-download clients/locations instead of using the 24h cache
//   --confirm-cost      required for a live run: every live run spends Anthropic credit
//
// The token is read from TMS_JWT and only ever placed in the Authorization
// header. It is never printed or written. An expired token stops the run
// before any document is sent.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createScannerSandbox, toPrediction, browserMimeType, REF_FIELDS } from './lib/app-sandbox.mjs';
import { createMockFetch } from './lib/mock-fetch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
// The browser adds this automatically; the Worker answers 403 "Origin required" without it.
const APP_ORIGIN = 'https://dimitrispetras21-del.github.io';

// $ per million tokens (Anthropic list prices, checked 27/9/2026). Cache write
// = 1.25× input, cache read = 0.1× input (5-minute cache, as the app uses).
export const PRICES = {
  'claude-opus-5':             { in: 5, out: 25 },
  'claude-sonnet-5':           { in: 2, out: 10 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
};

export function callCost(model, u = {}) {
  const p = PRICES[model];
  if (!p) return null;
  return ((u.input_tokens || 0) * p.in + (u.cache_creation_input_tokens || 0) * p.in * 1.25 +
    (u.cache_read_input_tokens || 0) * p.in * 0.1 + (u.output_tokens || 0) * p.out) / 1e6;
}

function arg(name, dflt = null) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : dflt;
}
const flag = name => process.argv.includes('--' + name);

function findGoldenDir() {
  if (process.env.SCAN_GOLDEN_DIR) return process.env.SCAN_GOLDEN_DIR;
  // Worktrees live inside the main checkout, so walk up until .local/scan-golden appears.
  let d = REPO;
  for (let i = 0; i < 6; i++) {
    const c = path.join(d, '.local', 'scan-golden');
    if (fs.existsSync(c)) return c;
    d = path.dirname(d);
  }
  return path.join(REPO, '.local', 'scan-golden');
}

function assertLocal(p, what) {
  if (!path.resolve(p).split(path.sep).includes('.local')) {
    throw new Error(`${what} must live under .local/ (gitignored) — it holds real document data and the repo is public: ${p}`);
  }
}

export function jwtExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.exp ? new Date(payload.exp * 1000) : null;
  } catch { return null; }
}

/** fetch that adds the browser's Origin header and records every call (never the token). */
export function recordingFetch(inner) {
  const calls = [];
  const f = async (url, init = {}) => {
    const headers = { ...(init.headers || {}), Origin: APP_ORIGIN };
    const t0 = Date.now();
    const rec = { method: init.method || 'GET', path: new URL(url).pathname };
    if (rec.path === '/v1/ai/messages' && init.body) {
      try { const b = JSON.parse(init.body); rec.model = b.model; rec.max_tokens = b.max_tokens; rec.tools = (b.tools || []).length; rec.messages = b.messages.length; } catch {}
    }
    calls.push(rec);
    const res = await inner(url, { ...init, headers });
    rec.status = res.status; rec.ms = Date.now() - t0;
    if (rec.model && res.ok) {
      const body = await res.clone().json().catch(() => null);
      if (body) { rec.usage = body.usage || null; rec.stop_reason = body.stop_reason || null; rec.cost = callCost(rec.model, body.usage); }
    }
    return res;
  };
  f.calls = calls;
  return f;
}

async function fetchRefData(fetchFn, consts) {
  const getAll = async (table, fields) => {
    let out = [], offset = '';
    do {
      const qs = ['pageSize=100', ...fields.map(x => 'fields[]=' + encodeURIComponent(x))];
      if (offset) qs.push('offset=' + offset);
      const res = await fetchFn(`${consts.PROXY_URL}/v0/${consts.AT_BASE}/${table}?${qs.join('&')}`,
        { headers: { Authorization: 'Bearer ' + process.env.TMS_JWT } });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(`reference data ${table}: HTTP ${res.status} ${body.error?.message || ''}`);
      out = out.concat(body.records || []);
      offset = body.offset || '';
    } while (offset);
    return out;
  };
  return {
    clients: await getAll(consts.TABLES.CLIENTS, REF_FIELDS.clients),
    locations: await getAll(consts.TABLES.LOCATIONS, REF_FIELDS.locations),
  };
}

function gitHead() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO }).toString().trim(); } catch { return null; }
}

// Rough pre-run estimate so the owner sees the order of magnitude before
// spending: ~2.5k tokens per PDF page, Haiku classify + Opus tool loop.
function estimateUsd(pages) {
  const doc = pages * 2500, sys = 6000;
  const haiku = (doc * 1) / 1e6;
  const opusWrite = ((doc + sys) * 5 * 1.25) / 1e6;
  const opusReads = ((doc + sys) * 3 * 5 * 0.1) / 1e6;
  const opusOut = (4 * 1500 * 25) / 1e6;
  return haiku + opusWrite + opusReads + opusOut;
}

async function main() {
  const dry = flag('dry-run');
  const goldenDir = findGoldenDir();
  const goldenPath = arg('golden', path.join(goldenDir, 'golden.json'));
  const docsDir = arg('docs', path.join(path.dirname(goldenPath), 'docs'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = arg('out', path.join(path.dirname(goldenPath), 'results', `${dry ? 'dryrun' : 'current'}-${stamp}.json`));
  assertLocal(outPath, '--out');

  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  const only = arg('only') ? new Set(arg('only').split(',')) : null;
  const docs = golden.docs.filter(d => !only || only.has(d.doc_id));
  const examples = arg('examples') ? JSON.parse(fs.readFileSync(arg('examples'), 'utf8')) : [];

  let fetchFn, refData, jwt;
  if (dry) {
    const fixture = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'synthetic-ref.json'), 'utf8'));
    const extraction = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'synthetic-extraction.json'), 'utf8'));
    fetchFn = recordingFetch(createMockFetch({ refData: fixture, extraction }));
    refData = fixture;
    jwt = 'dry.run.token';
  } else {
    jwt = process.env.TMS_JWT;
    if (!jwt) throw new Error('TMS_JWT is not set — log in to the app, copy localStorage.tms_jwt, export TMS_JWT');
    const exp = jwtExpiry(jwt);
    if (exp && exp < new Date()) throw new Error(`TMS_JWT expired at ${exp.toISOString()} — log in again`);
    const pages = docs.reduce((s, d) => s + (d.doc_type === 'pdf' ? d.pages || 1 : 0), 0);
    const est = docs.filter(d => d.doc_type === 'pdf').reduce((s, d) => s + estimateUsd(d.pages || 1), 0);
    console.log(`${docs.length} documents, ${pages} PDF pages; rough cost estimate $${est.toFixed(2)} (actual is measured per call)`);
    if (!flag('confirm-cost')) { console.log('Not sent. Re-run with --confirm-cost to spend it.'); return; }
    fetchFn = recordingFetch(globalThis.fetch);
  }

  // Reference lists: the same fields the app preloads, via the same Worker.
  const bootstrap = createScannerSandbox({ repoRoot: REPO, fetch: fetchFn, jwt, refData: { clients: [], locations: [] } });
  const consts = bootstrap.constants();
  if (!dry) {
    const cachePath = path.join(path.dirname(goldenPath), 'ref-cache.json');
    const fresh = fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < 24 * 3600e3;
    if (fresh && !flag('refresh-ref')) refData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    else { refData = await fetchRefData(fetchFn, consts); fs.writeFileSync(cachePath, JSON.stringify(refData)); }
    console.log(`reference data: ${refData.clients.length} clients, ${refData.locations.length} locations`);
  }

  const sandbox = createScannerSandbox({ repoRoot: REPO, fetch: fetchFn, jwt, refData, examples });
  const out = { schema: 'scan-results/v1', engine: 'current', dry_run: dry, commit: gitHead(), run_at: new Date().toISOString(),
    models: consts.MODELS, max_tokens: consts.SCAN_MAX_TOKENS, examples: examples.length, docs: [] };

  for (const d of docs) {
    const buf = fs.readFileSync(path.join(docsDir, d.file));
    const file = new File([buf], d.file, { type: browserMimeType(d.file) });
    const before = fetchFn.calls.length;
    const t0 = Date.now();
    let r;
    try { r = await sandbox.scanFile(file); } catch (e) { r = { status: 'error', error: e.message }; }
    const calls = fetchFn.calls.slice(before).filter(c => c.path === '/v1/ai/messages');
    const row = {
      doc_id: d.doc_id, file: d.file, status: r.status, error: r.error || null, ms: Date.now() - t0,
      calls: calls.map(({ model, status, ms, usage, stop_reason, cost, tools, messages }) => ({ model, status, ms, usage, stop_reason, cost, tools, messages })),
      cost_usd: calls.reduce((s, c) => s + (c.cost || 0), 0),
      truncated: calls.some(c => c.stop_reason === 'max_tokens'),
      orders: r.status === 'ok' ? [toPrediction(r, consts.F)] : [],
      raw: r.parsed || null,
    };
    out.docs.push(row);
    console.log(`${d.doc_id} ${row.status.padEnd(8)} ${String(calls.length).padStart(2)} calls ${(row.ms / 1000).toFixed(1).padStart(5)}s $${row.cost_usd.toFixed(3)}${row.truncated ? ' TRUNCATED(max_tokens)' : ''}${row.error ? ' — ' + row.error.slice(0, 80) : ''}`);
  }
  out.total_cost_usd = out.docs.reduce((s, x) => s + x.cost_usd, 0);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n${out.docs.filter(x => x.status === 'ok').length}/${out.docs.length} ok · total $${out.total_cost_usd.toFixed(2)} · ${outPath}`);
  console.log(`score: node tools/scan-eval/score.mjs --golden ${goldenPath} --results ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error('run-current:', e.message); process.exit(1); });
