#!/usr/bin/env node
// Worker deploy guard (CLAUDE.md «Ο WORKER»: the three + one marker per live
// feature: stock lots, local moves, stop delay, presence, temperature per CMR,
// the VD /costs/rt filters, national v5, its vehicle handover, its F3 and its F5 (day L), counted in CONTENT, never by byte equality: wrangler re-bundles
// the source, and the CF API returns the live script as multipart with a
// random boundary per request — two downloads of the same version «differ».
//
// Usage:  node worker/tools/worker-guard.mjs <file> --plan 0|1|2 --handover 0|1 [--f3 0|1 [--f5 0|1]]
//   <file>   worker/src/index.js, a `wrangler deploy --dry-run --outdir` bundle,
//            or the raw CF API download (multipart is unwrapped here)
//   --plan   the national v5 marker and its writes switch: 0 = before F2 is
//            live (no PLAN_PERMS); 1 = PLAN_PERMS once, writes CLOSED (decision
//            22: `var PLAN_WRITES_OPEN = false;` once, no `= true` anywhere);
//            2 = day L (F5 deploy 2, plan W7/W8): PLAN_PERMS once, writes OPEN
//            (`var PLAN_WRITES_OPEN = true;` once, no `= false` anywhere). 2 needs
//            --handover 1 --f3 1 --f5 1: the switch opens only on the whole chain.
//   --handover expected count of the vehicle handover marker (072b routes,
//            `rpc: "plan_seg_change"`): 0 before that deploy, 1 after it, and
//            1 needs --plan 1. Never a default: a forgotten flag is a usage
//            error, not an «OK» (handover plan H-18).
//   --f3     optional (national v5 F3): expected presence of the F3 markers,
//            ONE PER FEATURE (CLAUDE.md, three rules of one source, rule 3;
//            final review 26/10, W-8): "v_rt_cycle" (E21, the end of a v5
//            cycle read by GET /costs/rt), review_cycles (E10, DKV lines
//            matched to v5 cycles), pl_mov_stop_once (E11, the pallet rows of
//            the plan and the one-writer index) and ctPartnerLineCheck (Q6-1,
//            a partner invoice line names its partner). 0 = before the F3
//            deploy (none of them), 1 = the F3 bundle / live after it (each at
//            least once: later phases may use them again); 1 needs
//            --handover 1 (F3 is built on it, one chain). Without it: as before.
//   --f5     optional, only after --f3 (national v5 F5, plan W8): the F5 markers,
//            ONE PER FEATURE: rpc: "plan_config_read" (W1), rpc: "plan_lookups"
//            (W2), rpc: "plan_nat_state" (E3/E5, stream d1) - each route row
//            exactly once -, var LEGACY_CLOSED_AFTER_L (E16, the declaration
//            once), truncated:  (E18, GET /costs/rt) and "order_delete_preview"
//            (E19) - at least once. 0 = before deploy 1 (none), 1 = deploy 1 and
//            after; 1 needs --f3 1. Without it: as before.
// Prints one line per marker and exits 1 on the first STOP condition — no
// partial «OK» (αρχή 1).
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const [file, flag, planArg, hflag, handoverArg, f3Flag, f3Arg, f5Flag, f5Arg] = args;
// exactly these five, seven with --f3, or nine with --f3 and --f5: an extra flag (e.g. a later phase's before its guard
// knows it) would be ignored and the tool would print OK without checking it - a usage error instead (code review
// xhigh 26/10, principle 1)
if (![5, 7, 9].includes(args.length) || !file || flag !== '--plan' || !['0', '1', '2'].includes(planArg) || hflag !== '--handover'
    || !['0', '1'].includes(handoverArg) || (planArg === '0' && handoverArg === '1')
    || (args.length >= 7 && (f3Flag !== '--f3' || !['0', '1'].includes(f3Arg) || (f3Arg === '1' && handoverArg !== '1')))
    || (args.length === 9 && (f5Flag !== '--f5' || !['0', '1'].includes(f5Arg) || (f5Arg === '1' && f3Arg !== '1')))
    || (planArg === '2' && (args.length !== 9 || handoverArg !== '1' || f3Arg !== '1' || f5Arg !== '1'))) {
  console.error('usage: node worker/tools/worker-guard.mjs <file> --plan 0|1|2 --handover 0|1 [--f3 0|1 [--f5 0|1]] (handover 1 needs plan 1 or 2, f3 1 needs handover 1, f5 1 needs f3 1, plan 2 needs handover 1 f3 1 f5 1)');
  process.exit(2);
}
const plan = Number(planArg);
const handover = Number(handoverArg);

function unwrapMultipart(raw) {
  // A CF API script download: «--<boundary>\r\nContent-Disposition: form-data;
  // name="index.js"; filename="index.js"\r\nContent-Type: …\r\n\r\n<js>\r\n--<boundary>--».
  const first = raw.split(/\r?\n/, 1)[0];
  if (!/^--\S+$/.test(first)) return raw;
  const boundary = first.slice(2);
  const parts = raw.split(`--${boundary}`).slice(1, -1);
  // the script part, named by filename= or only by name= (the CF API has sent both shapes)
  const js = parts.filter((p) => /(?:file)?name="[^"]+\.m?js"/.test(p));
  if (js.length !== 1) throw new Error(`multipart: expected one .js part, found ${js.length}`);
  const blank = /\r?\n\r?\n/.exec(js[0]);
  if (!blank) throw new Error('multipart: the .js part has no header/body separator');
  return js[0].slice(blank.index + blank[0].length).replace(/\r?\n$/, '');
}

let text;
try {
  text = unwrapMultipart(readFileSync(file, 'utf8'));
} catch (e) {
  // deploy night reads one line, never a stack trace (αρχή 1)
  console.log(`GUARD STOP — ${e.message} (${file})`);
  process.exit(1);
}
const count = (needle) => text.split(needle).length - 1;
// WORKSHOPS fields are counted INSIDE the WORKSHOPS block: Country: "country" appears in six tables, so a
// whole-file count could never see it go missing from this one (CLAUDE.md: the three). Same shape in the source
// and in a double esbuild bundle (review 23/10).
const ws = (text.match(/\n {2}tblMiFxbm9ky8PCQi: \{\n[\s\S]*?\n {2}\},?\n/) || [''])[0];
const inWs = (needle) => ws.split(needle).length - 1;
const rows = [
  // inside the dispatcher block only: the lazy scan stops at the next 2-space key (another role)
  ['dispatcher order_stops DELETE', (text.match(/\n {2}dispatcher: \{\n(?:(?! {2}\S)[^\n]*\n)*? {4}order_stops: \["GET", "POST", "PATCH", "DELETE"\]/g) || []).length, (n) => n === 1],
  ['"VS CD Date": "cross_dock_date"', count('"VS CD Date": "cross_dock_date"'), (n) => n === 1],
  ['WORKSHOPS Country: "country"', inWs('Country: "country"'), (n) => n === 1],
  ['WORKSHOPS Aliases: "aliases"', inWs('Aliases: "aliases"'), (n) => n === 1],
  ['WORKSHOPS "VAT Number": "tax_id"', inWs('"VAT Number": "tax_id"'), (n) => n === 1],
  ['WORKSHOPS "Legal Name": "legal_name"', inWs('"Legal Name": "legal_name"'), (n) => n === 1],
  ['tblStockLots: {', count('tblStockLots: {'), (n) => n === 1],
  ['"Move Kind": "move_kind"', count('"Move Kind": "move_kind"'), (n) => n === 1],
  // the features live since 23-24/10 (CLAUDE.md, rule of one source 3): stop-delay, presence, temperature per CMR
  ['"Delay Reason": "delay_reason"', count('"Delay Reason": "delay_reason"'), (n) => n === 1],
  ['var PRESENCE_ROLES', count('var PRESENCE_ROLES'), (n) => n === 1],
  ['Temp Per CMR', count('Temp Per CMR'), (n) => n === 1],
  // the 24 lines of ValueDriven 19/10 (Worker 3439b1e3, decision 29): the order_ids check of GET /costs/rt
  ['VD /costs/rt order_ids {0,49}$/', count('{0,49}$/'), (n) => n === 1],
  ['var PLAN_PERMS = {', count('var PLAN_PERMS = {'), (n) => n === (plan === 0 ? 0 : 1)],
  // the vehicle handover (072b): its route row, once live never removed (CLAUDE.md rule of one source 3)
  ['rpc: "plan_seg_change"', count('rpc: "plan_seg_change"'), (n) => n === handover]
];
if (plan === 1) {
  rows.push(['var PLAN_WRITES_OPEN = false;', count('var PLAN_WRITES_OPEN = false;'), (n) => n === 1]);
  rows.push(['PLAN_WRITES_OPEN = true', count('PLAN_WRITES_OPEN = true'), (n) => n === 0]);
}
if (plan === 2) {
  // day L: the one line of deploy 2, and nothing of the closed switch left anywhere
  rows.push(['var PLAN_WRITES_OPEN = true;', count('var PLAN_WRITES_OPEN = true;'), (n) => n === 1]);
  rows.push(['PLAN_WRITES_OPEN = false', count('PLAN_WRITES_OPEN = false'), (n) => n === 0]);
}
const f3 = f3Flag === undefined ? null : Number(f3Arg);
if (f3 !== null) {
  // names, not declarations: at least one each after F3 (never 0), none before it
  for (const [name, mark] of [['"v_rt_cycle" (F3, E21)', '"v_rt_cycle"'], ['review_cycles (F3, E10)', 'review_cycles'],
    ['pl_mov_stop_once (F3, E11)', 'pl_mov_stop_once'], ['ctPartnerLineCheck (F3, Q6-1)', 'ctPartnerLineCheck']]) {
    rows.push([name, count(mark), (n) => (f3 === 1 ? n >= 1 : n === 0)]);
  }
}
const f5 = f5Flag === undefined ? null : Number(f5Arg);
if (f5 !== null) {
  // the three route rows and the declaration exactly once (a second would be a merge gone wrong), the two names at
  // least once; none of them before deploy 1
  for (const [name, mark, once] of [['rpc: "plan_config_read" (F5, W1)', 'rpc: "plan_config_read"', true],
    ['rpc: "plan_lookups" (F5, W2)', 'rpc: "plan_lookups"', true], ['rpc: "plan_nat_state" (F5, E3/E5)', 'rpc: "plan_nat_state"', true],
    ['var LEGACY_CLOSED_AFTER_L (F5, E16)', 'var LEGACY_CLOSED_AFTER_L', true], ['truncated:  (F5, E18)', 'truncated: ', false],
    ['"order_delete_preview" (F5, E19)', '"order_delete_preview"', false]]) {
    rows.push([name, count(mark), (n) => (f5 === 1 ? (once ? n === 1 : n >= 1) : n === 0)]);
  }
}
let ok = true;
for (const [name, n, good] of rows) {
  const pass = good(n);
  ok = ok && pass;
  console.log(`${pass ? 'OK  ' : 'STOP'}  ${name} = ${n}`);
}
console.log(ok ? `GUARD OK (${rows.length} markers, plan=${plan}, handover=${handover}${f3 !== null ? `, f3=${f3}` : ''}${f5 !== null ? `, f5=${f5}` : ''}) ${file}` : `GUARD STOP — do not deploy / roll back (${file})`);
process.exit(ok ? 0 : 1);
