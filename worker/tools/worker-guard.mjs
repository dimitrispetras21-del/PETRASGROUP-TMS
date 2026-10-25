#!/usr/bin/env node
// Worker deploy guard (CLAUDE.md «Ο WORKER»: the three + one marker per live
// feature: stock lots, local moves, stop delay, presence, temperature per CMR,
// the VD /costs/rt filters, national v5 and its vehicle handover), counted in CONTENT, never by byte equality: wrangler re-bundles
// the source, and the CF API returns the live script as multipart with a
// random boundary per request — two downloads of the same version «differ».
//
// Usage:  node worker/tools/worker-guard.mjs <file> --plan 0|1 --handover 0|1
//   <file>   worker/src/index.js, a `wrangler deploy --dry-run --outdir` bundle,
//            or the raw CF API download (multipart is unwrapped here)
//   --plan   expected count of the national v5 marker (0 = before F2 is live,
//            1 = the F2 bundle / live after the F2 deploy). With 1, writes must
//            also be closed in that bundle (decision 22). F5 (day L) opens the
//            writes in the same deploy as WN_V5, and --plan 1 STOPs on an open
//            switch: that chain adds the day-L mode here (e.g. --plan 2 = open,
//            the same 13 markers + PLAN_PERMS) with its test, never a deploy
//            that skips the guard (K1 review r2; plan K3 Step 2).
//   --handover expected count of the vehicle handover marker (072b routes,
//            `rpc: "plan_seg_change"`): 0 before that deploy, 1 after it, and
//            1 needs --plan 1. Never a default: a forgotten flag is a usage
//            error, not an «OK» (handover plan H-18).
// Prints one line per marker and exits 1 on the first STOP condition — no
// partial «OK» (αρχή 1).
import { readFileSync } from 'node:fs';

const [file, flag, planArg, hflag, handoverArg] = process.argv.slice(2);
if (!file || flag !== '--plan' || !['0', '1'].includes(planArg) || hflag !== '--handover' || !['0', '1'].includes(handoverArg)
    || (planArg === '0' && handoverArg === '1')) {
  console.error('usage: node worker/tools/worker-guard.mjs <file> --plan 0|1 --handover 0|1 (handover 1 needs plan 1)');
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
  ['var PLAN_PERMS = {', count('var PLAN_PERMS = {'), (n) => n === plan],
  // the vehicle handover (072b): its route row, once live never removed (CLAUDE.md rule of one source 3)
  ['rpc: "plan_seg_change"', count('rpc: "plan_seg_change"'), (n) => n === handover]
];
if (plan === 1) {
  rows.push(['var PLAN_WRITES_OPEN = false;', count('var PLAN_WRITES_OPEN = false;'), (n) => n === 1]);
  rows.push(['PLAN_WRITES_OPEN = true', count('PLAN_WRITES_OPEN = true'), (n) => n === 0]);
}
let ok = true;
for (const [name, n, good] of rows) {
  const pass = good(n);
  ok = ok && pass;
  console.log(`${pass ? 'OK  ' : 'STOP'}  ${name} = ${n}`);
}
console.log(ok ? `GUARD OK (${rows.length} markers, plan=${plan}, handover=${handover}) ${file}` : `GUARD STOP — do not deploy / roll back (${file})`);
process.exit(ok ? 0 : 1);
