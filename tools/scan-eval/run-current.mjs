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
//   --engine v2         run the round-2 engine (core/scan-engine-v2.js) through the SAME app
//                       flow (gate → extract → preview/match → form); default 'current'
//   --model/--mode/--effort/--thinking   override SCAN_V2 settings for this run (v2 only)
//   --replay <results.json>  no model calls: reuse the answers recorded in an earlier v2 run
//                       (matching / preview / form changes measured at zero cost)
//   --budget <usd>      stop before a document if the ledger total would pass this
//                       (ledger = <golden dir>/results/ledger.jsonl, one line per live run)
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
  'claude-haiku-4-5':          { in: 1, out: 5 },
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
      try { const b = JSON.parse(init.body); rec.model = b.model; rec.max_tokens = b.max_tokens; rec.tools = (b.tools || []).length; rec.messages = b.messages.length; rec.structured = !!b.output_config?.format; } catch {}
    }
    calls.push(rec);
    const res = await inner(url, { ...init, headers });
    rec.status = res.status; rec.ms = Date.now() - t0;
    if (rec.model && res.ok) {
      const body = await res.clone().json().catch(() => null);
      if (body) { rec.usage = body.usage || null; rec.stop_reason = body.stop_reason || null; rec.cost = callCost(rec.model, body.usage); }
      // v2 answers are kept (results live under .local/ only) so --replay can
      // re-run matching/prefill changes on the same answers at zero cost.
      if (body && rec.structured) rec.output = (body.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
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
  const engine = arg('engine', 'current');
  const v2 = { model: arg('model'), mode: arg('mode'), effort: arg('effort'), thinking: arg('thinking') };
  const budget = arg('budget') ? Number(arg('budget')) : null;
  const goldenDir = findGoldenDir();
  const goldenPath = arg('golden', path.join(goldenDir, 'golden.json'));
  const docsDir = arg('docs', path.join(path.dirname(goldenPath), 'docs'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = arg('out', path.join(path.dirname(goldenPath), 'results', `${dry ? 'dryrun-' : arg('replay') ? 'replay-' : ''}${engine}${v2.model ? '-' + v2.model : ''}${v2.mode ? '-' + v2.mode : ''}-${stamp}.json`));
  assertLocal(outPath, '--out');

  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  const only = arg('only') ? new Set(arg('only').split(',')) : null;
  const docs = golden.docs.filter(d => !only || only.has(d.doc_id));
  const examples = arg('examples') ? JSON.parse(fs.readFileSync(arg('examples'), 'utf8')) : [];

  // Round 3 (docs/scan/04, task 3): client order history for location matching.
  // Built read-only by build-client-history.mjs; absent by default (--no-history
  // or file missing) → atGetAll(ORDERS by Client) returns [], exactly like before.
  const historyPath = flag('no-history') ? null : arg('history', path.join(path.dirname(goldenPath), 'client-history.json'));
  const clientHistory = historyPath && fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : null;
  if (arg('engine', 'current') === 'v2') {
    console.log(clientHistory ? `client history: ${Object.keys(clientHistory.byClient || {}).length} clients, ${Object.keys(clientHistory.address || {}).length} location addresses (${historyPath})`
      : 'client history: none loaded (run build-client-history.mjs, or pass --history) — matching ignores past orders');
  }
  // Per doc_id: the doc's OWN saved order (golden truth `matched[].legacy_id`) and
  // its "Created At" from the snapshot — never counted as "history" while scoring
  // THAT doc, see the leakage note in build-client-history.mjs / app-sandbox.mjs.
  const scanExcludeFor = d => {
    const ownId = (d.matched || []).find(m => m.table === 'orders')?.legacy_id;
    if (!ownId || !clientHistory) return {};
    let createdAt = null;
    for (const recs of Object.values(clientHistory.byClient || {})) {
      const own = recs.find(r => r.id === ownId);
      if (own) { createdAt = own.fields?.['Created At'] || null; break; }
    }
    return { excludeOrderId: ownId, excludeCreatedAtOrAfter: createdAt };
  };

  // Round 3 (docs/scan/04, task 3): the country-mismatch override in
  // _sv2PickLocation only fires with BOTH a client-history precedent AND a
  // confirmed-bad record here — auto-loads the newest data-quality scan
  // (build-data-quality.mjs); --no-data-quality disables the override
  // entirely (its documented default when nothing is loaded).
  if (!flag('no-data-quality') && v2.dataQualityLocationIds == null) {
    const dqDir = path.join(path.dirname(goldenPath), 'data-quality');
    const newest = fs.existsSync(dqDir) ? fs.readdirSync(dqDir).filter(f => f.endsWith('.json')).sort().at(-1) : null;
    const dqFile = arg('data-quality', newest ? path.join(dqDir, newest) : null);
    if (dqFile && fs.existsSync(dqFile)) {
      const dq = JSON.parse(fs.readFileSync(dqFile, 'utf8'));
      v2.dataQualityLocationIds = (dq.records || []).map(r => r.id);
      console.log(`data quality: ${v2.dataQualityLocationIds.length} flagged location(s) (${dqFile})`);
    }
  }

  let fetchFn, refData, jwt;
  const replay = arg('replay') ? JSON.parse(fs.readFileSync(arg('replay'), 'utf8')) : null;
  let currentDoc = null;
  if (replay) {
    // No model calls: each document gets the answer recorded for it in an
    // earlier live run; everything after the model (matching, preview, form)
    // runs from the current code.
    const byDoc = new Map(replay.docs.map(d => [d.doc_id, d.calls.find(c => c.output)]));
    const inner = async (url, init) => {
      if (new URL(url).pathname !== '/v1/ai/messages') throw new Error('replay: unexpected ' + url);
      const c = byDoc.get(currentDoc);
      if (!c) return new Response(JSON.stringify({ error: 'replay: no recorded answer for ' + currentDoc }), { status: 400 });
      return new Response(JSON.stringify({ model: c.model, content: [{ type: 'text', text: c.output }], stop_reason: c.stop_reason, usage: c.usage }), { status: 200 });
    };
    fetchFn = recordingFetch(inner);
    refData = JSON.parse(fs.readFileSync(path.join(path.dirname(goldenPath), 'ref-cache.json'), 'utf8'));
    jwt = 'replay.token';
  } else if (dry) {
    const fixture = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'synthetic-ref.json'), 'utf8'));
    const extraction = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'synthetic-extraction.json'), 'utf8'));
    const extractionV2 = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'synthetic-extraction-v2.json'), 'utf8'));
    fetchFn = recordingFetch(createMockFetch({ refData: fixture, extraction, extractionV2 }));
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
  if (!dry && !replay) {
    const cachePath = path.join(path.dirname(goldenPath), 'ref-cache.json');
    const fresh = fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < 24 * 3600e3;
    if (fresh && !flag('refresh-ref')) refData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    else { refData = await fetchRefData(fetchFn, consts); fs.writeFileSync(cachePath, JSON.stringify(refData)); }
    console.log(`reference data: ${refData.clients.length} clients, ${refData.locations.length} locations`);
  }

  const sandbox = createScannerSandbox({ repoRoot: REPO, fetch: fetchFn, jwt, refData, examples, engine, v2, clientHistory });
  const settings = sandbox.constants();
  const out = { schema: 'scan-results/v1', engine, dry_run: dry, commit: gitHead(), run_at: new Date().toISOString(),
    models: consts.MODELS, max_tokens: consts.SCAN_MAX_TOKENS, examples: examples.length,
    v2_settings: engine === 'v2' ? settings.SCAN_V2 : null, docs: [] };
  const ledgerPath = path.join(path.dirname(goldenPath), 'results', 'ledger.jsonl');
  const spentBefore = fs.existsSync(ledgerPath)
    ? fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).reduce((s, l) => s + (JSON.parse(l).cost_usd || 0), 0) : 0;
  if (!dry && !replay && budget != null) console.log(`ledger: $${spentBefore.toFixed(2)} spent before this run, budget $${budget.toFixed(2)}`);

  for (const d of docs) {
    const runSoFar = out.docs.reduce((s, x) => s + x.cost_usd, 0);
    if (!dry && !replay && budget != null && spentBefore + runSoFar + 0.15 > budget) {
      console.log(`STOP: budget $${budget} would be exceeded (spent ${(spentBefore + runSoFar).toFixed(2)})`);
      break;
    }
    currentDoc = d.doc_id;
    const buf = fs.readFileSync(path.join(docsDir, d.file));
    const file = new File([buf], d.file, { type: browserMimeType(d.file) });
    const before = fetchFn.calls.length;
    const t0 = Date.now();
    let r;
    // Reset scan-engine-v2.js's per-client history cache before every document:
    // two golden docs can share a client, each with ITS OWN exclude-the-answer
    // filter — without this, doc 2 would silently reuse doc 1's (differently
    // filtered) cached history. See scanV2ResetPerScanCaches's own comment.
    sandbox.run('typeof scanV2ResetPerScanCaches === "function" && scanV2ResetPerScanCaches()');
    try { r = await sandbox.scanFile(file, scanExcludeFor(d)); } catch (e) { r = { status: 'error', error: e.message }; }
    const calls = fetchFn.calls.slice(before).filter(c => c.path === '/v1/ai/messages');
    const row = {
      doc_id: d.doc_id, file: d.file, status: r.status, error: r.error || null, ms: Date.now() - t0,
      calls: calls.map(({ model, status, ms, usage, stop_reason, cost, tools, messages, output }) => ({ model, status, ms, usage, stop_reason, cost, tools, messages, output })),
      cost_usd: calls.reduce((s, c) => s + (c.cost || 0), 0),
      truncated: calls.some(c => c.stop_reason === 'max_tokens'),
      orders: r.status === 'ok' ? [toPrediction(r, consts.F)] : [],
      raw: r.parsed || null,
      v2: r.parsed?._v2 ? { input: r.parsed._v2.input, why: r.parsed._v2.why, orders: r.parsed._v2.orders,
        client_candidates: r.parsed._v2.client_candidates, location_candidates: r.parsed._v2.location_candidates } : null,
    };
    out.docs.push(row);
    console.log(`${d.doc_id} ${row.status.padEnd(8)} ${String(calls.length).padStart(2)} calls ${(row.ms / 1000).toFixed(1).padStart(5)}s $${row.cost_usd.toFixed(3)}${row.truncated ? ' TRUNCATED(max_tokens)' : ''}${row.error ? ' — ' + row.error.slice(0, 80) : ''}`);
  }
  out.total_cost_usd = out.docs.reduce((s, x) => s + x.cost_usd, 0);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  if (replay) out.replay_of = path.basename(arg('replay'));   // costs = the recorded run's, nothing spent now
  if (!dry && !replay) fs.appendFileSync(ledgerPath, JSON.stringify({ at: out.run_at, file: path.basename(outPath), engine, v2, docs: out.docs.length, cost_usd: out.total_cost_usd }) + '\n');
  console.log(`\n${out.docs.filter(x => x.status === 'ok').length}/${out.docs.length} ok · total $${out.total_cost_usd.toFixed(2)} · ${outPath}`);
  console.log(`score: node tools/scan-eval/score.mjs --golden ${goldenPath} --results ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error('run-current:', e.message); process.exit(1); });
