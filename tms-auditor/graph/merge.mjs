// Merges docs/tms-auditor/graph/part-*.json into ONE machine-readable graph (tms-graph.json) and prints the
// numbers the docs quote. Rejects contract violations (SCHEMA.md) instead of silently fixing them.
// Merging is by exact id — never by name similarity. Conflicting statuses keep the strongest evidence
// (confirmed > probable > unknown) and record every source.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/tms-auditor/graph');
const ID = /^(page|action|role|fn|ep|tbl|view|dbfn|trg|ls|job|ext|rule|check):.+/;
const RANK = { confirmed: 0, probable: 1, unknown: 2 };

export function merge() {
  const parts = fs.readdirSync(DIR).filter((f) => /^part-[a-z]\.json$/.test(f)).sort();
  const nodes = new Map(); const edges = new Map(); const problems = []; const byPart = {};
  const extra = { failure_modes: [], gaps: [], cross_deps: [], checks_existing: [], writers: [], conflicts: [], final_outcomes: [], check_updates: [] };
  for (const f of parts) {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); const p = j.part || f.slice(5, 6);
    byPart[p] = { nodes: (j.nodes || []).length, edges: (j.edges || []).length, sha: j.sha, tokens: j.tokens_used ?? 'unknown' };
    for (const n of j.nodes || []) {
      if (!ID.test(n.id)) { problems.push(`${f}: node id «${n.id}» breaks SCHEMA.md`); continue; }
      const cur = nodes.get(n.id);
      if (!cur) nodes.set(n.id, { ...n, type: n.id.split(':')[0], type_label: n.type, parts: [p] });   // type = id prefix (parts used free labels) else if (!cur.parts.includes(p)) cur.parts.push(p);
    }
    for (const e of j.edges || []) {
      if (!['confirmed', 'probable', 'unknown'].includes(e.status)) problems.push(`${f}: edge ${e.from}->${e.to} status «${e.status}»`);
      const k = `${e.from}|${e.type}|${e.to}`; const cur = edges.get(k);
      if (!cur) edges.set(k, { ...e, parts: [p], srcs: [e.src] });
      else { cur.parts.includes(p) || cur.parts.push(p); cur.srcs.includes(e.src) || cur.srcs.push(e.src);
             if ((RANK[e.status] ?? 3) < (RANK[cur.status] ?? 3)) { cur.status = e.status; cur.src = e.src; } }
    }
    for (const k of Object.keys(extra)) for (const x of j[k] || []) extra[k].push({ ...x, part: p });
  }
  // edges whose endpoints no part declared as a node: keep them, count them (they are leads, not facts)
  let dangling = 0;
  for (const e of edges.values()) for (const end of [e.from, e.to]) if (!nodes.has(end)) {
    dangling++; if (ID.test(end)) nodes.set(end, { id: end, type: end.split(':')[0], label: end, src: 'implied by edge', parts: ['(implied)'] });
  }
  const partOf = (id) => nodes.get(id)?.parts || [];
  const cross = [...edges.values()].filter((e) => { const a = partOf(e.from), b = partOf(e.to); return a.length && b.length && !a.some((x) => b.includes(x)); });
  const stats = {
    parts: byPart, nodes: nodes.size, edges: edges.size, dangling_endpoints: dangling,
    by_status: Object.fromEntries(['confirmed', 'probable', 'unknown'].map((s) => [s, [...edges.values()].filter((e) => e.status === s).length])),
    by_node_type: [...nodes.values()].reduce((a, n) => ((a[n.type] = (a[n.type] || 0) + 1), a), {}),
    cross_part_edges: cross.length, failure_modes: extra.failure_modes.length, conflicts: extra.conflicts.length,
    final_outcomes_without_check: extra.final_outcomes.filter((o) => !(o.proving_checks || []).length).length,
    problems,
  };
  return { stats, graph: { generated: new Date().toISOString(), nodes: [...nodes.values()], edges: [...edges.values()], ...extra } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { stats, graph } = merge();
  fs.writeFileSync(path.join(DIR, 'tms-graph.json'), JSON.stringify(graph));
  fs.writeFileSync(path.join(DIR, 'tms-graph-stats.json'), JSON.stringify(stats, null, 1));
  console.log(JSON.stringify(stats, null, 1));
  if (stats.problems.length) process.exit(1);
}
