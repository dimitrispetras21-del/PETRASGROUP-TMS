#!/usr/bin/env node
// Worker deploy guard (CLAUDE.md «Ο WORKER»: the three + one marker per live
// feature: stock lots, local moves, stop delay, presence, temperature per CMR,
// the VD /costs/rt filters, national v5, its vehicle handover, its F3, its F5 (day L), the order edit, 085, 089, 101, the road (099 + 102) and the pallets week mark (104), counted in CONTENT, never by byte equality: wrangler re-bundles
// the source, and the CF API returns the live script as multipart with a
// random boundary per request — two downloads of the same version «differ».
//
// Usage:  node worker/tools/worker-guard.mjs <file> --plan 0|1|2 --handover 0|1 [--f3 0|1 [--f5 0|1 [--edit 0|1 [--invoiced 0|1 [--rate2 0|1 [--self 0|1 [--road 0|1 [--wchk 0|1 [--dkv 0|1 [--pnlp 0|1 [--pmiss 0|1]]]]]]]]]]]
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
//            (W2), rpc: "plan_nat_state" (E3/E5, stream d1), rpc: "plan_activity"
//            (E12/E13, stream d3) - each route row
//            exactly once -, var LEGACY_CLOSED_AFTER_L (E16) and var
//            LEGACY_ROWS_AFTER_L (E16 by row, owner 28/10) - each declaration
//            once -, truncated:  (E18, GET /costs/rt) and "order_delete_preview"
//            (E19) - at least once. 0 = before deploy 1 (none), 1 = deploy 1 and
//            after; 1 needs --f3 1. Without it: as before.
//   --edit   optional, only after --f5 (077, the edit of a national order, live test 28/10 F13): rpc:
//            "plan_order_read" (GET /plan/orders/:id) - the route row exactly once. 0 = before that deploy (none),
//            1 = after it; 1 needs --f5 1. Without it: as before.
//   --invoiced optional, only after --edit (085, owner 31/10: an invoiced national keeps its client, its price only
//            from owner / accountant): the PLAN_RULE_TEXT key invoiced_client: - exactly once. 0 = before that deploy
//            (none), 1 = after it; 1 needs --edit 1. Without it: as before.
//   --rate2  optional, only after --invoiced (089, P-7, owner 31/10 + 1/11: the partner rate of the ANODOS): the
//            PLAN_CHECK_TEXT key seg_partner_rate_anodos: - exactly once. 0 = before that deploy (none), 1 = after it;
//            1 needs --invoiced 1 (089's Worker is built on 085's, one chain). Without it: as before.
//   --self   optional, only after --rate2 (101, owner 2/11: «Αυτοπαράδοση», invoiced without an ERP invoice): the
//            map row "Self Delivery": "self_delivery" - exactly twice (ORDERS + NATIONAL ORDERS). 0 = before that
//            deploy (none), 1 = after it; 1 needs --rate2 1 (built on 089's Worker, one chain). Without it: as before.
//   --road   optional, only after --self (owner 2/11, ONE Worker chain for two features): rpc: "plan_transfer" (099,
//            POST /plan/transfer, «Αλλαγή στον δρόμο») and rpc: "plan_draft_realize" (102, /plan/drafts, «Σύνθεση
//            φορτίων») - each route row exactly once. 0 = before that deploy (none of them), 1 = after it; 1 needs
//            --self 1 (built on 101's Worker 7bb5003a). Without it: as before.
//   --wchk   optional, only after --road (104, the pallets week's «Ελέγχθηκε» mark, /pallets/week-checks): the one object
//            naming its three acts, `var PLW_RPC = {` - exactly once. 0 = before that deploy, 1 = after it; 1 needs
//            --road 1 (built on b329ff91, one chain). Without it: as before.
//   --dkv    optional, only after --wchk (DKV parser 1.3.0 + the E-SUMMARY gate, 8/11/2026): the gate's «summary row
//            with no lines» entry `no_lines: true` (worker/src/import-rules.mjs) and the parser's
//            `SHORT_UNIT_TOKENS.has(` (core/dkv-parser.js, L/UN units) - each exactly once in the BUNDLE (neither is in src/index.js
//            itself: wrangler bundles both files). 0 = before that deploy, 1 = after it; 1 needs --wchk 1 (built on
//            0563b45a, one chain). Without it: as before.
//   --pnlp   optional, only after --dkv (the P&L papers, owner 3/11/2026: GET /costs/pnl-paper, owner only): the
//            route's own line `resource === "pnl-paper"` - exactly once. 0 = before that deploy, 1 = after it; 1 needs
//            --dkv 1 (built on 24d38435, one chain). Without it: as before.
//   --pmiss  optional, only after --pnlp (pallets U4, 107: GET /pallets/missing, POST /pallets/no-exchange, the
//            movement history GET /pallets/movements/:id/history and the city / stop-pallets embeds of U3): the act's
//            object `var PLN_RPC = {`, the list route `resource === "missing"` and the history line
//            `action === "history"` - each exactly once. 0 = before that deploy, 1 = after it; 1 needs --pnlp 1 (built
//            on 0190cc37, one chain). Without it: as before.
// Prints one line per marker and exits 1 on the first STOP condition — no
// partial «OK» (αρχή 1).
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const [file, flag, planArg, hflag, handoverArg, f3Flag, f3Arg, f5Flag, f5Arg, editFlag, editArg, invFlag, invArg, r2Flag, r2Arg, sdFlag, sdArg, rdFlag, rdArg, wcFlag, wcArg, dkFlag, dkArg, ppFlag, ppArg, pmFlag, pmArg] = args;
// exactly these five, seven with --f3, nine with --f3 and --f5, eleven with --edit after them, thirteen with --invoiced, fifteen with --rate2, seventeen with --self, nineteen with --road, twenty-one with --wchk, twenty-three with --dkv, twenty-five with --pnlp, twenty-seven with --pmiss: an extra flag (e.g. a later phase's before its guard
// knows it) would be ignored and the tool would print OK without checking it - a usage error instead (code review
// xhigh 26/10, principle 1)
if (![5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27].includes(args.length) || !file || flag !== '--plan' || !['0', '1', '2'].includes(planArg) || hflag !== '--handover'
    || !['0', '1'].includes(handoverArg) || (planArg === '0' && handoverArg === '1')
    || (args.length >= 7 && (f3Flag !== '--f3' || !['0', '1'].includes(f3Arg) || (f3Arg === '1' && handoverArg !== '1')))
    || (args.length >= 9 && (f5Flag !== '--f5' || !['0', '1'].includes(f5Arg) || (f5Arg === '1' && f3Arg !== '1')))
    || (args.length >= 11 && (editFlag !== '--edit' || !['0', '1'].includes(editArg) || (editArg === '1' && f5Arg !== '1')))
    || (args.length >= 13 && (invFlag !== '--invoiced' || !['0', '1'].includes(invArg) || (invArg === '1' && editArg !== '1')))
    || (args.length >= 15 && (r2Flag !== '--rate2' || !['0', '1'].includes(r2Arg) || (r2Arg === '1' && invArg !== '1')))
    || (args.length >= 17 && (sdFlag !== '--self' || !['0', '1'].includes(sdArg) || (sdArg === '1' && r2Arg !== '1')))
    || (args.length >= 19 && (rdFlag !== '--road' || !['0', '1'].includes(rdArg) || (rdArg === '1' && sdArg !== '1')))
    || (args.length >= 21 && (wcFlag !== '--wchk' || !['0', '1'].includes(wcArg) || (wcArg === '1' && rdArg !== '1')))
    || (args.length >= 23 && (dkFlag !== '--dkv' || !['0', '1'].includes(dkArg) || (dkArg === '1' && wcArg !== '1')))
    || (args.length >= 25 && (ppFlag !== '--pnlp' || !['0', '1'].includes(ppArg) || (ppArg === '1' && dkArg !== '1')))
    || (args.length === 27 && (pmFlag !== '--pmiss' || !['0', '1'].includes(pmArg) || (pmArg === '1' && ppArg !== '1')))
    || (planArg === '2' && (args.length < 9 || handoverArg !== '1' || f3Arg !== '1' || f5Arg !== '1'))) {
  console.error('usage: node worker/tools/worker-guard.mjs <file> --plan 0|1|2 --handover 0|1 [--f3 0|1 [--f5 0|1 [--edit 0|1 [--invoiced 0|1 [--rate2 0|1 [--self 0|1 [--road 0|1 [--wchk 0|1 [--dkv 0|1 [--pnlp 0|1 [--pmiss 0|1]]]]]]]]]]] (handover 1 needs plan 1 or 2, f3 1 needs handover 1, f5 1 needs f3 1, edit 1 needs f5 1, invoiced 1 needs edit 1, rate2 1 needs invoiced 1, self 1 needs rate2 1, road 1 needs self 1, wchk 1 needs road 1, dkv 1 needs wchk 1, pnlp 1 needs dkv 1, pmiss 1 needs pnlp 1, plan 2 needs handover 1 f3 1 f5 1)');
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
    ['rpc: "plan_activity" (F5, E12/E13)', 'rpc: "plan_activity"', true],
    ['var LEGACY_CLOSED_AFTER_L (F5, E16)', 'var LEGACY_CLOSED_AFTER_L', true],
    ['var LEGACY_ROWS_AFTER_L (F5, E16 rows, owner 28/10)', 'var LEGACY_ROWS_AFTER_L', true], ['truncated:  (F5, E18)', 'truncated: ', false],
    ['"order_delete_preview" (F5, E19)', '"order_delete_preview"', false]]) {
    rows.push([name, count(mark), (n) => (f5 === 1 ? (once ? n === 1 : n >= 1) : n === 0)]);
  }
}
const edit = editFlag === undefined ? null : Number(editArg);
if (edit !== null) {
  // the route row exactly once (a second would be a merge gone wrong); none before the 077 deploy
  rows.push(['rpc: "plan_order_read" (077, F13)', count('rpc: "plan_order_read"'), (n) => (edit === 1 ? n === 1 : n === 0)]);
}
const invoiced = invFlag === undefined ? null : Number(invArg);
if (invoiced !== null) {
  // the text key exactly once (a second would be a merge gone wrong); none before the 085 deploy
  rows.push(['invoiced_client: (085, F62)', count('invoiced_client: "'), (n) => (invoiced === 1 ? n === 1 : n === 0)]);
}
const rate2 = r2Flag === undefined ? null : Number(r2Arg);
if (rate2 !== null) {
  // the text key exactly once (a second would be a merge gone wrong); none before the 089 deploy
  rows.push(['seg_partner_rate_anodos: (089, P-7)', count('seg_partner_rate_anodos: "'), (n) => (rate2 === 1 ? n === 1 : n === 0)]);
}
const self = sdFlag === undefined ? null : Number(sdArg);
if (self !== null) {
  // the map row on both tables, exactly twice (a third would be a merge gone wrong, one = a table forgotten: its label
  // would be dropped silently with a 200); none before the 101 deploy
  rows.push(['"Self Delivery": "self_delivery" (101, ORDERS + NATIONAL ORDERS)', count('"Self Delivery": "self_delivery"'), (n) => (self === 1 ? n === 2 : n === 0)]);
}
const road = rdFlag === undefined ? null : Number(rdArg);
if (road !== null) {
  // one marker per feature (CLAUDE.md, rule of one source 3), each route row exactly once (a second would be a merge
  // gone wrong); none before that deploy
  rows.push(['rpc: "plan_transfer" (099, «Αλλαγή στον δρόμο»)', count('rpc: "plan_transfer"'), (n) => (road === 1 ? n === 1 : n === 0)]);
  rows.push(['rpc: "plan_draft_realize" (102, «Σύνθεση φορτίων»)', count('rpc: "plan_draft_realize"'), (n) => (road === 1 ? n === 1 : n === 0)]);
}
const wchk = wcFlag === undefined ? null : Number(wcArg);
if (wchk !== null) {
  // 104, the pallets week's «Ελέγχθηκε» mark (/pallets/week-checks): the one object naming its three acts, exactly once
  rows.push(['var PLW_RPC = { (104, «Ελέγχθηκε» της εβδομάδας παλετών)', count('var PLW_RPC = {'), (n) => (wchk === 1 ? n === 1 : n === 0)]);
}
const dkv = dkFlag === undefined ? null : Number(dkArg);
if (dkv !== null) {
  // DKV parser 1.3.0 + the E-SUMMARY gate (8/11/2026): both live in files wrangler bundles, so only a bundle or a CF
  // download carries them - src/index.js alone reads 0 and stops (on purpose: the check is on what runs)
  rows.push(['no_lines: true (DKV gate, summary row without lines)', count('no_lines: true'), (n) => (dkv === 1 ? n === 1 : n === 0)]);
  // (the parser's use site, not its declaration: esbuild rewrites `new Set(` to `/* @__PURE__ */ new Set(`)
  rows.push(['SHORT_UNIT_TOKENS.has( (DKV parser 1.3.0, L/UN)', count('SHORT_UNIT_TOKENS.has('), (n) => (dkv === 1 ? n === 1 : n === 0)]);
}
const pnlp = ppFlag === undefined ? null : Number(ppArg);
if (pnlp !== null) {
  // the P&L papers (owner 3/11/2026): GET /costs/pnl-paper, its route line exactly once
  rows.push(['resource === "pnl-paper" (χαρτιά αποτελέσματος, /costs/pnl-paper)', count('resource === "pnl-paper"'), (n) => (pnlp === 1 ? n === 1 : n === 0)]);
}
const pmiss = pmFlag === undefined ? null : Number(pmArg);
if (pmiss !== null) {
  // pallets U4 (107): the no-exchange act's object, the missing-delivery route, the movement history - each exactly once
  rows.push(['var PLN_RPC = { (107, «Χωρίς ανταλλαγή»)', count('var PLN_RPC = {'), (n) => (pmiss === 1 ? n === 1 : n === 0)]);
  rows.push(['resource === "missing" (107, «Λείπει παράδοση»)', count('resource === "missing"'), (n) => (pmiss === 1 ? n === 1 : n === 0)]);
  rows.push(['action === "history" (ιστορικό κίνησης παλετών)', count('action === "history"'), (n) => (pmiss === 1 ? n === 1 : n === 0)]);
}
let ok = true;
for (const [name, n, good] of rows) {
  const pass = good(n);
  ok = ok && pass;
  console.log(`${pass ? 'OK  ' : 'STOP'}  ${name} = ${n}`);
}
console.log(ok ? `GUARD OK (${rows.length} markers, plan=${plan}, handover=${handover}${f3 !== null ? `, f3=${f3}` : ''}${f5 !== null ? `, f5=${f5}` : ''}${edit !== null ? `, edit=${edit}` : ''}${invoiced !== null ? `, invoiced=${invoiced}` : ''}${rate2 !== null ? `, rate2=${rate2}` : ''}${self !== null ? `, self=${self}` : ''}${road !== null ? `, road=${road}` : ''}${wchk !== null ? `, wchk=${wchk}` : ''}${dkv !== null ? `, dkv=${dkv}` : ''}${pnlp !== null ? `, pnlp=${pnlp}` : ''}${pmiss !== null ? `, pmiss=${pmiss}` : ''}) ${file}` : `GUARD STOP — do not deploy / roll back (${file})`);
process.exit(ok ? 0 : 1);
