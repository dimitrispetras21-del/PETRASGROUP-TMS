// Completes the SQL-built package (monitoring.build_package) with what only the REPO knows:
// code pointers from the graph (docs/tms-auditor/graph/part-*.json) and the commit the pointers refer to.
// Also renders every timestamp in Europe/Athens once, so the report validator can reject invented hours.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GRAPH = path.join(ROOT, 'docs/tms-auditor/graph');

let _edges = null;
function graphEdges() {
  if (_edges) return _edges;
  _edges = [];
  for (const f of fs.readdirSync(GRAPH).filter((f) => /^part-[a-z]\.json$/.test(f))) {
    try { _edges.push(...(JSON.parse(fs.readFileSync(path.join(GRAPH, f), 'utf8')).edges || []).map((e) => ({ ...e, part: f }))); }
    catch (_) { /* a broken part is reported by graph/merge.mjs, not here */ }
  }
  return _edges;
}

// Pointers = edges that the graph says belong to the check's flows or that name the check in `coverage`.
// Confirmed edges first; at most 12 (the package must stay small — brief §Γ: ≤50 ids, bounded size).
export function codePointers(check, max = 12) {
  if (!check) return [];
  const flows = new Set(check.flows || []);
  const hits = graphEdges().filter((e) => (e.flow && flows.has(e.flow)) || (e.coverage || []).includes(check.id));
  const rank = { confirmed: 0, probable: 1, unknown: 2 };
  const seen = new Set(); const out = [];
  for (const e of hits.sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3))) {
    const src = String(e.src || '').split('#')[0];
    if (!src || src.startsWith('db:') || seen.has(src)) continue;
    seen.add(src); out.push({ src: e.src, edge: `${e.from} -[${e.type}]-> ${e.to}`, status: e.status });
    if (out.length >= max) break;
  }
  return out;
}

// Code EXCERPTS (review B 23/9 #2): the measured diagnosis cost 131k tokens because the model had to read 4
// files, i.e. 5 model turns each re-reading the whole context. The package now carries the code itself —
// ±40 lines around each pointer, merged per file, under a total budget — so a diagnosis is ONE turn.
export const EXCERPT_WINDOW = 40;
export const EXCERPT_BUDGET_CHARS = 75000;           // ≈ 25k tokens of code at ~3 chars/token
export function codeExcerpts(pointers, { window = EXCERPT_WINDOW, budget = EXCERPT_BUDGET_CHARS } = {}) {
  const byFile = new Map();
  for (const p of pointers || []) {
    const m = String(p.src || '').match(/^([^:#]+):(\d+)(?:-(\d+))?/);
    if (!m) continue;
    const file = m[1]; const a = Number(m[2]); const b = m[3] ? Number(m[3]) : a;
    if (!fs.existsSync(path.join(ROOT, file))) continue;
    if (!byFile.has(file)) byFile.set(file, []);
    // a pointed RANGE (e.g. «83-228») is kept whole up to 160 lines; a single line gets ±window
    byFile.get(file).push(b - a <= 160 ? [Math.max(1, a - window), b + window] : [Math.max(1, a - window), a + window]);
  }
  const out = []; let used = 0; let dropped = 0;
  for (const [file, ranges] of byFile) {
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of ranges) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
    for (const [from, to0] of merged) {
      const to = Math.min(to0, lines.length);
      const text = lines.slice(from - 1, to).map((l, i) => `${from + i}: ${l}`).join('\n');
      if (used + text.length > budget) { dropped++; continue; }
      used += text.length; out.push({ file, from, to, text });
    }
  }
  return { excerpts: out, dropped, chars: used };
}

const fmt = new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function athens(ts) { const p = Object.fromEntries(fmt.formatToParts(new Date(ts)).map((x) => [x.type, x.value])); return `${p.day}/${p.month} ${p.hour}:${p.minute}`; }

export function enrich(sqlPkg, { sha } = {}) {
  const pkg = structuredClone(sqlPkg);
  pkg.code_pointers = codePointers(pkg.check ? { id: pkg.check.id, flows: pkg.check.flows } : null);
  const ex = codeExcerpts(pkg.code_pointers);
  pkg.code_excerpts = ex.excerpts;
  if (ex.dropped) pkg.code_excerpts_truncated = `[περικόπηκε: ${ex.dropped} απόσπασμα(τα) εκτός προϋπολογισμού — ζήτα τα με «ζήτα: αρχείο:γραμμές»]`;
  let head = sha;
  if (!head) { try { head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch (_) { head = 'unknown'; } }
  pkg.repo = { sha: head, note: 'code pointers are from the graph at this SHA; production may differ (deployed ≠ main until verified)' };
  const times = [];
  const walk = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && /(_at|_seen|run_at|created_at)$/.test(k)) times.push(athens(v)); else walk(v); } };
  walk(pkg);
  pkg.times_athens = [...new Set(times)];
  const size = JSON.stringify(pkg).length;
  pkg.size_bytes = size;
  return pkg;
}
