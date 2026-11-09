// 071 + 071b + 072 + 072b ↔ Worker refusal contract (national v5 F2, owner 21–22/10/2026:
// the lower layer names the codes and constraints, αρχή 4). Pattern of
// local-relay-contract.test.mjs: the migrations themselves are read, so a
// rename on either side fails HERE, at build time, never on a dispatcher's
// save (αρχή 6) — and a Worker text with no counterpart in the base fails too
// (dead code, αρχή 8).
//
// The files are read from this checkout — never skipped when missing:
//   worker/migrations/071_plan_schema.sql, 071b_plan_one_vehicle.sql (live 22/10)
//   worker/migrations/drafts/072_plan_functions.sql  (draft, until it runs)
//   worker/migrations/072_plan_functions.sql         (after it ran and moved)
//   worker/migrations/drafts/072b_plan_vehicle_segments.sql (vehicle handover; then worker/migrations/)
// On deploy/worker-plan the 072 draft is a COPY of the SQL branch's file
// (feat/national-v5-f2); when 072 changes there, copy it again and
// re-run this test before deploy — the diagnostic prints the md5 checked.
// The copy is also compared with the SQL branch's file through git (final
// review 25/10, finding 4): a review fix there without a recopy fails HERE.
// The same for 072b on deploy/worker-plan-handover: a copy of
// feat/national-v5-handover-prev-rate's file (owner 26/10: one step, #100, then the previous partner's rate on top; #96 merged the first one), re-synced with ONE command
//   git checkout feat/national-v5-handover-prev-rate -- worker/migrations/drafts/072b_plan_vehicle_segments.sql
// and, so this branch never mixes a new 072b with older generated files and tests (code review xhigh 26/10), the set:
//   git checkout feat/national-v5-handover-prev-rate -- 'worker/migrations/drafts/072b_*' worker/migrations/drafts/tools/build-072b.mjs tests/sql-072b-drafts.test.js tms-auditor/test/plan-072b.test.mjs
// And 073 (national v5 F3, money) on deploy/worker-plan-f3: a copy of feat/national-v5-f3's file
//   git checkout feat/national-v5-f3 -- worker/migrations/drafts/073_plan_money.sql
// And 074a (national v5 F5, the reads of day L) on deploy/worker-plan-f5: a copy of feat/national-v5-f5-074a's file
//   git checkout feat/national-v5-f5-074a -- worker/migrations/drafts/074a_plan_reads.sql
// and 074 (day L itself), whose three refusal codes the Worker already speaks (deploy 1 carries the texts, deploy 2
// is one line): a copy of feat/national-v5-f5-074's file, required once the switch is open (see CODES_074)
//   git checkout feat/national-v5-f5-074 -- worker/migrations/drafts/074_plan_cutover.sql
// And «Αλλαγή στον δρόμο» + «Σύνθεση φορτίων» (owner 2/11, ONE Worker chain, deploy/worker-transfer-drafts): 102 is on
// main (#238, drafts/ until it runs); 098 and 099 are copies of their SQL branches (#230, #237 stacked on it):
//   git checkout origin/feat/transfer-098-point -- worker/migrations/drafts/098_plan_transfer_point.sql
//   git checkout origin/feat/transfer-099-act -- worker/migrations/drafts/099_plan_transfer.sql
//
// 072's own refusals are parsed from `plan_h_raise('<code>'` (a literal code
// as the first argument — the convention of the SQL plan, Task A1) and from
// any literal HINT = 'plan:<code>'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG = path.join(here, '..', 'migrations');
const src = readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8');

function lift(re, what) {
  const m = src.match(re);
  assert.ok(m, `${what} not found in worker/src/index.js`);
  return m[0];
}
const table = (name) => lift(new RegExp(`const ${name} = \\{[\\s\\S]*?\\n\\};\\n`), name);
const W = new Function([
  table('STOCK_CHECK_TEXT'), table('RELAY_RULE_TEXT'), table('RELAY_CHECK_TEXT'),
  table('PLAN_RULE_TEXT'), table('PLAN_CHECK_TEXT'), table('PLAN_CONSTRAINT_CODE'),
  lift(/function stockRuleError\(e\) \{[\s\S]*?\n\}\n/, 'stockRuleError'),
].join('\n') + '\nreturn { RELAY_CHECK_TEXT, PLAN_RULE_TEXT, PLAN_CHECK_TEXT, stockRuleError };')();

function readOne(names, hint) {
  const file = names.map((n) => path.join(MIG, n)).find((f) => existsSync(f));
  assert.ok(file, `${names.join(' / ')} not found under worker/migrations — ${hint}`);
  return { file, sql: readFileSync(file, 'utf8') };
}
const f071 = () => readOne(['071_plan_schema.sql'], 'it is live since 22/10 and must be in main');
const f071b = () => readOne(['071b_plan_one_vehicle.sql'], 'it is live since 22/10 and must be in main');
const f072 = () => readOne(['drafts/072_plan_functions.sql', '072_plan_functions.sql'],
  'copy it from the SQL branch: git checkout feat/national-v5-f2 -- worker/migrations/drafts/072_plan_functions.sql');
const f072b = () => readOne(['drafts/072b_plan_vehicle_segments.sql', '072b_plan_vehicle_segments.sql'],
  'copy it from the SQL branch: git checkout feat/national-v5-handover-prev-rate -- worker/migrations/drafts/072b_plan_vehicle_segments.sql');
const f073 = () => readOne(['drafts/073_plan_money.sql', '073_plan_money.sql'],
  'copy it from the SQL branch: git checkout feat/national-v5-f3 -- worker/migrations/drafts/073_plan_money.sql');
const f074a = () => readOne(['drafts/074a_plan_reads.sql', '074a_plan_reads.sql'],
  'copy it from the SQL branch: git checkout feat/national-v5-f5-074a -- worker/migrations/drafts/074a_plan_reads.sql');
const f077 = () => readOne(['drafts/077_plan_order_edit.sql', '077_plan_order_edit.sql'],
  'it travels with this Worker change (077 + GET /plan/orders/:id, one PR)');
// 085 (owner 31/10, F62): its two refusal codes travel with their Worker texts in one PR
const f085 = () => readOne(['drafts/085_plan_invoiced_client_price.sql', '085_plan_invoiced_client_price.sql'],
  'it travels with this Worker change (085 + invoiced_client / invoiced_price, one PR)');
// 089 (P-7): its CHECK's text travels with this Worker change; the SQL is reviewed on its own branch (it needs 086)
const f089 = () => readOne(['drafts/089_plan_partner_rate_anodos.sql', '089_plan_partner_rate_anodos.sql'],
  'copy it from the SQL branch: git checkout feat/089-partner-rate-anodos -- worker/migrations/drafts/089_plan_partner_rate_anodos.sql');
// 098 / 099 / 102 (owner 2/11): their codes, CHECKs and RPCs travel with this Worker change
const f095 = () => readOne(['095_plan_small_relaxed.sql', 'drafts/095_plan_small_relaxed.sql'], 'it is on main since #217');
const f098 = () => readOne(['drafts/098_plan_transfer_point.sql', '098_plan_transfer_point.sql'],
  'copy it from the SQL branch: git checkout origin/feat/transfer-098-point -- worker/migrations/drafts/098_plan_transfer_point.sql');
const f099 = () => readOne(['drafts/099_plan_transfer.sql', '099_plan_transfer.sql'],
  'copy it from the SQL branch: git checkout origin/feat/transfer-099-act -- worker/migrations/drafts/099_plan_transfer.sql');
const f102 = () => readOne(['drafts/102_plan_drafts.sql', '102_plan_drafts.sql'], 'it is on main since #238');
const f111 = () => readOne(['111_intl_form_stops.sql', 'drafts/111_intl_form_stops.sql'], 'it ran 8/11 and is on main');
// 074 may still be in review when deploy 1 goes (it runs on day L): null when no copy is on this branch
const f074 = () => ['drafts/074_plan_cutover.sql', '074_plan_cutover.sql'].map((n) => path.join(MIG, n)).filter((f) => existsSync(f))
  .map((file) => ({ file, sql: readFileSync(file, 'utf8') }))[0] || null;
const writesOpen = /\nvar PLAN_WRITES_OPEN = true;\n/.test(src);
const uniq = (re, text) => [...new Set([...text.matchAll(re)].map((m) => m[1]))].sort();
const greek = /[α-ωΑ-Ωά-ώ]/;

// The codes of the F2 plan's Interfaces («Κωδικοί plan:»): the parsed sets must
// equal these exactly, so a code added or dropped in SQL without the plan (or
// the reverse) fails here.
const CODES_071 = ['chain', 'chain_time', 'hard_delete', 'leg_locked', 'leg_order', 'leg_place', 'leg_stop_dead',
  'local_loading_day', 'local_loading_gone', 'local_loading_stop', 'model_locked', 'piece_dead', 'piece_locked',
  'piece_parent', 'pieces_alive', 'pieces_sum', 'rt_cancelled', 'rt_not_v2', 'rt_window', 'shipment_locked',
  'side_order', 'split_not_at_hub', 'stop_locked', 'stop_order', 'stop_seq', 'v1_link_on_v2'];
const CODES_072 = ['bad_input', 'driver_busy', 'group_empty', 'local_cancel_no_id', 'local_exists', 'need_token', 'no_actor', 'no_client',
  'no_price', 'no_vehicle', 'no_window', 'not_at_hub', 'not_stock', 'notice_gone', 'order_gone', 'order_not_v5',
  'parts_sum', 'payroll_locked', 'piece_busy', 'piece_split', 'request_missing', 'request_reused', 'rt_gone', 'same_rt', 'stale_confirm', 'stock_lot',
  'stop_gone', 'truck_busy', 'vehicle_clear_use_clear', 'vs_locked', 'vs_not_bridge'];
// 072b's own codes (vehicle handover plan, Interfaces «Κωδικοί plan: της 072b»): its COMMIT rules (plan_seg_problem /
// plan_chk_seg) and its direct raises, minus the 071 / 072 codes it reuses (truck_busy, rt_gone, need_token, ...).
const CODES_072B = ['seg_cancel', 'seg_copy', 'seg_cover', 'seg_first', 'seg_gone', 'seg_locked', 'seg_many', 'seg_no_vehicle',
  'seg_none', 'seg_not_v2', 'seg_outside', 'seg_reason', 'seg_same', 'seg_time', 'seg_unassigned'];
// 073 (F3): the pallet feeder's one refusal (plan_h_pallet_sync, D-10). 073 also raises 072's bad_input (a
// non-finite number), so its codes are compared minus the 071 / 072 / 072b ones, as 072b's are.
const CODES_073 = ['pallet_fraction'];
// 074 (F5 plan, Task W «Consumes»): the INSERT freeze, the day-L guard, the bridge re-cut. The Worker carries their
// texts from deploy 1; the 074 copy proves them as soon as it is on this branch, and MUST be here once the switch
// is open (deploy 2 = day L, when 074 has run) - before that its absence is a visible skip, never a silent pass.
const CODES_074 = ['bad_cutover_day', 'bridge_recut', 'legacy_frozen'];
// 085 (owner 31/10): an invoiced national keeps its client; its price only from owner / accountant. 085 also raises
// 072's no_client and bad_input, so its codes are compared minus the earlier ones.
const CODES_085 = ['invoiced_client', 'invoiced_price'];
// 098 (the transfer stop, owner 2/11): two COMMIT rules of its own ('<code>:<piece>' as 071's); its hunks also carry
// 071's chain / leg_place / split_not_at_hub and 072's not_at_hub, which keep their codes (new words only)
const CODES_098 = ['transfer_chain', 'transfer_left'];
// 099 (plan_transfer): its own direct raises, minus the earlier codes it reuses (rt_gone, piece_dead, parts_sum, ...)
const CODES_099 = ['transfer_at_hub', 'transfer_next_leg', 'transfer_not_on_board'];
// 102 (shared drafts): the codes its PR names (header «NEW REFUSAL CODES»), minus 072's it reuses
const CODES_102 = ['draft_empty', 'draft_gone', 'draft_not_ready', 'draft_piece_missing', 'draft_pieces', 'draft_side', 'draft_stale',
  'piece_in_draft'];
// Retired by the spec §7 — must appear nowhere (plan Interfaces).
const RETIRED = ['hub_endpoint', 'piece_planned', 'bridge_moved', 'bridge_split', 'legacy_nl', 'frozen',
  'restore_expired', 'restore_conflict', 'partner_rate_on_owned', 'window_order'];
// 071 rewrote three 060 CHECKs on local_moves (same names, nat_loading added):
// they keep their relay texts and type.
const RELAY_OWNED = ['local_moves_kind_chk', 'local_moves_kind_parent', 'local_moves_relay_trailer'];
// Live before 071 (pg_constraint, SELECT 22/10/2026) and reachable by plan_*.
const LIVE_PRE_071 = ['partner_needs_partner'];
// 071 constraints no request can meet, each with the reason:
const UNREACHABLE = {
  // UNIQUE (rt_id, id) exists only as the FK target of piece_legs; id is
  // already unique, so it can never be the one that fails.
  rt_stops_rt_id: 'FK target, id already unique',
};

function codes071(sql) {
  return uniq(/(?:return|prob :=|format\()\s*'([a-z_0-9]+):/g, sql)
    .concat(uniq(/hint = 'plan:([a-z_0-9]+)'/gi, sql))
    .filter((c, i, a) => a.indexOf(c) === i).sort();
}
// 072 also raises some 071 codes itself (rt_cancelled, piece_dead: refused at once, with 071's text): only the
// codes 072 adds are compared with CODES_072.
function codes072(sql) {
  return uniq(/plan_h_raise\(\s*'([a-z_0-9]+)'/g, sql)
    .concat(uniq(/HINT = 'plan:([a-z_0-9]+)'/gi, sql))
    .filter((c, i, a) => a.indexOf(c) === i)
    .filter((c) => !CODES_071.includes(c)).sort();
}
// 072b raises through plan_h_raise AND has COMMIT rules of its own ('<code>:<RT>', as 071's): both shapes, minus the
// 071 / 072 codes it reuses.
function codes072b(sql) {
  return uniq(/plan_h_raise\(\s*'([a-z_0-9]+)'/g, sql)
    .concat(uniq(/(?:return|prob :=)\s*'([a-z_0-9]+):/g, sql))
    .concat(uniq(/HINT = 'plan:([a-z_0-9]+)'/gi, sql))
    .filter((c, i, a) => a.indexOf(c) === i)
    .filter((c) => !CODES_071.includes(c) && !CODES_072.includes(c)).sort();
}

function codes074(sql) {
  return uniq(/plan_h_raise\(\s*'([a-z_0-9]+)'/g, sql)
    .concat(uniq(/HINT = 'plan:([a-z_0-9]+)'/gi, sql))
    .filter((c, i, a) => a.indexOf(c) === i)
    .filter((c) => !CODES_071.includes(c) && !CODES_072.includes(c) && !CODES_072B.includes(c) && !CODES_073.includes(c)).sort();
}
function codes085(sql) {
  return uniq(/plan_h_raise\(\s*'([a-z_0-9]+)'/g, sql)
    .filter((c) => ![...CODES_071, ...CODES_072, ...CODES_072B, ...CODES_073, ...CODES_074].includes(c)).sort();
}
const EARLIER = () => [...CODES_071, ...CODES_072, ...CODES_072B, ...CODES_073, ...CODES_074, ...CODES_085];
// one parser for the three: a direct raise, a COMMIT rule's '<code>:' return, a literal plan: hint - minus the earlier
// codes each one reuses
function codesLater(sql, before) {
  return uniq(/plan_h_raise\(\s*'([a-z_0-9]+)'/g, sql)
    .concat(uniq(/(?:return|prob :=)\s*'([a-z_0-9]+):/g, sql))
    .concat(uniq(/hint = 'plan:([a-z_0-9]+)'/gi, sql))
    .filter((c, i, a) => a.indexOf(c) === i)
    .filter((c) => !before.includes(c)).sort();
}
function codes073(sql) {
  return uniq(/plan_h_raise\(\s*'([a-z_0-9]+)'/g, sql)
    .concat(uniq(/HINT = 'plan:([a-z_0-9]+)'/gi, sql))
    .filter((c, i, a) => a.indexOf(c) === i)
    .filter((c) => !CODES_071.includes(c) && !CODES_072.includes(c) && !CODES_072B.includes(c)).sort();
}

test('071, 071b, 072, 072b, 073, 074a found and fingerprinted', (t) => {
  for (const { file, sql } of [f071(), f071b(), f072(), f072b(), f073(), f074a(), ...[f074()].filter(Boolean)]) {
    t.diagnostic(`checked: ${path.relative(path.join(here, '..', '..'), file)} md5 ${createHash('md5').update(sql).digest('hex')}`);
  }
  assert.ok(f072().sql.includes('plan_h_raise('), '072 raises through plan_h_raise');
});

// Two copies of 072, one source (principle 3): the SQL branch owns the file, this branch carries a copy. The first
// ref that has the file is the source: the SQL branch, its origin copy, then origin/main (after the SQL PR merged).
// No ref with the file = a visible skip, never a silent pass.
function sameAsSqlBranch(t, { file, sql }, sqlBranch) {
  const rel = path.relative(path.join(here, '..', '..'), file).split(path.sep).join('/');
  const md5 = (x) => createHash('md5').update(x).digest('hex');
  // the drafts/ path first, then the executed one: once the migration ran, rule 5 moves it out of drafts/ on main
  // and its branch may be gone, while this branch still carries the copy it was reviewed with (F5 review r2)
  const paths = rel.includes('/drafts/') ? [rel, rel.replace('/drafts/', '/')] : [rel];
  for (const ref of [sqlBranch, `origin/${sqlBranch}`, 'origin/main']) {
    for (const at of paths) {
      let theirs;
      try {
        theirs = execFileSync('git', ['show', `${ref}:${at}`], { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      } catch { continue; }
      assert.equal(md5(sql), md5(theirs), `${rel} differs from ${ref}:${at}: git show ${ref}:${at} > ${rel}`);
      t.diagnostic(`copy: ${rel} = ${ref}:${at} (md5 ${md5(sql)})`);
      return;
    }
  }
  // A copy still in drafts/ is a migration nobody ran yet: its SQL branch is the only source that can say the copy is
  // right, so a clone that cannot reach it FAILS (final review 26/10, W-10: the 073 copy skipped in silence in a
  // clean clone, where feat/national-v5-f3 was not on origin). git fetch origin <branch>, or push the SQL branch with
  // this one. An executed migration (out of drafts/) is on main: a skip there only says the branch was deleted.
  if (rel.includes('/drafts/')) assert.fail(`no ref holds ${rel} (${sqlBranch}, origin/${sqlBranch}, origin/main): fetch or push the SQL branch - an unreviewable copy is never a pass`);
  t.skip(`no ref holds ${rel} (${sqlBranch} merged and deleted, or not fetched): the copy is not compared`);
}
test('the 072 copy is byte-identical to the SQL branch file', (t) => sameAsSqlBranch(t, f072(), 'feat/national-v5-f2'));
// 072b: the same rule, its own SQL branch (vehicle handover plan, Task B4)
test('the 072b copy is byte-identical to the SQL branch file', (t) => sameAsSqlBranch(t, f072b(), 'feat/national-v5-handover-prev-rate'));
// 073: the same rule, the F3 SQL branch
test('the 073 copy is byte-identical to the SQL branch file', (t) => sameAsSqlBranch(t, f073(), 'feat/national-v5-f3'));
// A migration is in drafts/ OR executed, never both (CLAUDE.md rule 5): a copy carried here and merged after the
// file moved on main would leave a stale drafts/ twin that readOne() reads first (F5 review r2)
test('no migration of this chain is both in drafts/ and executed', () => {
  for (const name of ['072_plan_functions.sql', '072b_plan_vehicle_segments.sql', '073_plan_money.sql', '074a_plan_reads.sql', '074_plan_cutover.sql',
    '098_plan_transfer_point.sql', '099_plan_transfer.sql', '102_plan_drafts.sql']) {
    assert.ok(!(existsSync(path.join(MIG, 'drafts', name)) && existsSync(path.join(MIG, name))), `${name} is in drafts/ and executed: remove the drafts/ copy`);
  }
});
// 098 / 099: the same rule, the transfer SQL branches (#230, #237); 102 is main's own file
test('the 098 copy is byte-identical to the SQL branch file', (t) => sameAsSqlBranch(t, f098(), 'feat/transfer-098-point'));
test('the 099 copy is byte-identical to the SQL branch file', (t) => sameAsSqlBranch(t, f099(), 'feat/transfer-099-act'));
// 074a / 074: the same rule, the F5 SQL branches
test('the 074a copy is byte-identical to the SQL branch file', (t) => sameAsSqlBranch(t, f074a(), 'feat/national-v5-f5-074a'));
test('074: its copy is here once the switch is open, and then byte-identical to the SQL branch file', (t) => {
  const f = f074();
  if (!f) {
    assert.ok(!writesOpen, 'PLAN_WRITES_OPEN is open (deploy 2 = day L) without a copy of 074: its codes are unproven');
    t.skip('074 copy not on this branch yet (PLAN_WRITES_OPEN false): CODES_074 checked against the plan only');
    return;
  }
  sameAsSqlBranch(t, f, 'feat/national-v5-f5-074');
});

test('the parsed codes are exactly the plans\' 26 + 31 + 15 + 1 — none missing, none extra, none retired', () => {
  assert.deepEqual(codes071(f071().sql), CODES_071, '071 codes');
  assert.deepEqual(codes072(f072().sql), CODES_072, '072 codes');
  assert.deepEqual(codes072b(f072b().sql), CODES_072B, '072b codes');
  assert.deepEqual(codes073(f073().sql), CODES_073, '073 codes');
  if (f074()) assert.deepEqual(codes074(f074().sql), CODES_074, '074 codes');
  assert.deepEqual(codes085(f085().sql), CODES_085, '085 codes');
  assert.deepEqual(codesLater(f098().sql, EARLIER()), CODES_098, '098 codes');
  assert.deepEqual(codesLater(f099().sql, [...EARLIER(), ...CODES_098]), CODES_099, '099 codes');
  assert.deepEqual(codesLater(f102().sql, [...EARLIER(), ...CODES_098, ...CODES_099]), CODES_102, '102 codes');
  // 102 names its new codes in its header: the parsed set is that list, none forgotten on either side
  const named = /NEW REFUSAL CODES[^:]*:\s*([\s\S]*?)\.\s+The rest/.exec(f102().sql);
  assert.ok(named, '102 header «NEW REFUSAL CODES» not found');
  assert.deepEqual(named[1].replace(/--/g, ' ').split(/[\s,]+/).filter(Boolean).sort(), CODES_102, '102 header codes');
  for (const sql of [f071().sql, f071b().sql, f072().sql, f072b().sql, f073().sql, f074a().sql, ...[f074()].filter(Boolean).map((f) => f.sql)]) {
    for (const r of RETIRED) assert.ok(!new RegExp(`'(?:plan:)?${r}[:']`).test(sql), `retired code «${r}» appears in SQL`);
  }
  for (const r of RETIRED) assert.ok(!Object.prototype.hasOwnProperty.call(W.PLAN_RULE_TEXT, r), `retired code «${r}» has a Worker text`);
});

test('every plan: code has its own Greek text, the DB detail apart (owner 8/11: never in the text); every Worker code key is raised by 071/072/072b/073/074/085/095/098/099/102', () => {
  // 095 plan_seg_problem: a later segment without its point (it had no text until 8/11 and fell to raw English)
  assert.match(f095().sql, /return 'seg_place_text:'/, '095 raises seg_place_text');
  const all = [...EARLIER(), 'seg_place_text', ...CODES_098, ...CODES_099, ...CODES_102];
  for (const code of all) {
    assert.ok(Object.prototype.hasOwnProperty.call(W.PLAN_RULE_TEXT, code), `«${code}» has no Greek text in PLAN_RULE_TEXT`);
    const r = W.stockRuleError({ pg: { code: '23514', hint: 'plan:' + code, message: `plan rule broken: ${code}:RT-1280` } });
    assert.equal(r.type, 'PLAN_RULE');
    assert.equal(r.code, code);
    assert.equal(r.message, W.PLAN_RULE_TEXT[code]);
    assert.equal(r.detail, 'RT-1280');
    assert.doesNotMatch(r.message, /RT-\d/, `${code}: no RT code in the text`);
    assert.match(r.message, greek, `${code} text is Greek`);
  }
  const dead = Object.keys(W.PLAN_RULE_TEXT).filter((k) => !all.includes(k));
  assert.deepEqual(dead, [], 'Worker plan: keys that 071/072/072b/073/074/085/098/099/102 never raise (dead code, αρχή 8)');
});

// owner 2/11: the menu is ONE entry, «Αλλαγή στον δρόμο» - the three texts whose rule 098 widens say so, and every
// transfer code speaks of it; a draft code speaks of a draft (πρόχειρο)
test('098 widens leg_place / split_not_at_hub / not_at_hub: their texts and the transfer codes name «Αλλαγή στον δρόμο»; draft codes name the draft', () => {
  for (const code of ['leg_place', 'split_not_at_hub', 'not_at_hub', ...CODES_098, ...CODES_099]) {
    assert.match(W.PLAN_RULE_TEXT[code], /«Αλλαγή στον δρόμο»|σημείο της αλλαγής/, code);
  }
  for (const code of CODES_102.filter((c) => c.startsWith('draft_') || c === 'piece_in_draft')) assert.match(W.PLAN_RULE_TEXT[code], /πρόχειρ/, code);
  assert.match(W.PLAN_RULE_TEXT.draft_stale, /άλλαξε από άλλον/, 'owner 2/11: «άλλαξε από άλλον, ξαναφόρτωσε»');
  assert.match(W.PLAN_RULE_TEXT.draft_stale, /ξαναφόρτωσε/);
  // piece_in_draft keeps its detail (the piece, the draft, :same / :race) for the screen to word the draft - apart, as `detail`
  for (const detail of ['41:7', '41:7:same', '41:race']) {
    const r = W.stockRuleError({ pg: { code: 'P0001', hint: 'plan:piece_in_draft', message: `plan rule broken: piece_in_draft:${detail}` } });
    // the drafts screen still reads «(piece:draft)» from the text (wn5_compose.js _words): kept for this code only
    assert.deepEqual(r, { type: 'PLAN_RULE', code: 'piece_in_draft', message: `${W.PLAN_RULE_TEXT.piece_in_draft} (${detail})`, detail });
  }
  // the one-live-draft index answers the same code as plan_h_draft_add's own catch, whichever layer refused
  assert.deepEqual(W.stockRuleError({ pg: { code: '23505', message: 'duplicate key value violates unique constraint "plan_draft_pieces_one"' } }),
    { type: 'PLAN_RULE', code: 'piece_in_draft', message: W.PLAN_RULE_TEXT.piece_in_draft });
  assert.deepEqual(uniq(/CREATE UNIQUE INDEX (\w+)/g, f102().sql), ['plan_draft_pieces_one'], '102 adds one UNIQUE (else: a code here)');
  assert.deepEqual(uniq(/CREATE UNIQUE INDEX (\w+)/g, f098().sql + f099().sql), [], '098 / 099 add no UNIQUE (else: a code here)');
});

// 073 / D-9 (narrow): the Worker's POST /pallets/movements answers 409 in Greek by the NAME of 073's UNIQUE index;
// a rename on either side would turn the double row back into a bare 500 - caught here, at build time (αρχή 6).
test('073 creates pl_mov_stop_once on (order_stop_id, event_type) for LOADING / DELIVERY only, and the Worker names it', () => {
  const m = /CREATE UNIQUE INDEX (pl_mov_stop_once) ON public\.pl_movements \(order_stop_id, event_type\)\s+WHERE ([^;]*);/.exec(f073().sql);
  assert.ok(m, 'pl_mov_stop_once not found in 073');
  assert.match(m[2], /event_type IN \('LOADING', 'DELIVERY'\)/, 'D-9 narrow (owner 25/10)');
  assert.match(m[2], /status <> 'reversed'/, 'reversed rows do not count');
  assert.equal(src.split('/pl_mov_stop_once/.test(').length - 1, 1, 'the Worker maps the index by its name, once');
});

test('every 071 CHECK and UNIQUE is mapped to Greek or classified; every PLAN_CHECK_TEXT key exists', () => {
  const sql = f071().sql;
  const checks = uniq(/CONSTRAINT (\w+) CHECK/g, sql);
  const uniques = uniq(/CREATE UNIQUE INDEX (\w+)/g, sql).concat(uniq(/CONSTRAINT (\w+) UNIQUE/g, sql));
  assert.ok(checks.includes('rt_v2_dates') && checks.includes('local_moves_nat_loading'), `071 CHECKs parsed: ${checks.join(', ')}`);
  for (const name of [...checks, ...LIVE_PRE_071]) {
    const r = W.stockRuleError({ pg: { code: '23514', message: `new row for relation "x" violates check constraint "${name}"` } });
    assert.ok(r, `${name} → null (would be the 500 path)`);
    assert.match(r.message, greek, `${name} text is Greek`);
    assert.ok(!r.message.includes('κανόνας ' + name), `${name} has its own text, not the generic fallback`);
    if (RELAY_OWNED.includes(name)) assert.equal(r.type, 'LOCAL_RELAY_RULE', `${name} keeps its 060 family`);
    else assert.deepEqual(r, { type: 'PLAN_RULE', code: name, message: W.PLAN_CHECK_TEXT[name] }, name);
  }
  for (const name of uniques) {
    const r = W.stockRuleError({ pg: { code: '23505', message: `duplicate key value violates unique constraint "${name}"` } });
    if (Object.prototype.hasOwnProperty.call(UNREACHABLE, name)) { assert.equal(r, null, `${name}: ${UNREACHABLE[name]}`); continue; }
    assert.ok(r, `${name} → null (would be the 500 path)`);
    assert.equal(r.type, 'PLAN_RULE');
    assert.match(r.message, greek);
  }
  // the race floor and 072's own refusal say the same thing
  assert.deepEqual(W.stockRuleError({ pg: { code: '23505', message: 'duplicate key value violates unique constraint "local_moves_nat_loading_once"' } }),
    { type: 'PLAN_RULE', code: 'local_exists', message: W.PLAN_RULE_TEXT.local_exists });
  // 072b's CHECKs on rt_vehicle_segments: each one Greek, its own text (the reason's value IS a CHECK)
  const checks072b = uniq(/CONSTRAINT (\w+) CHECK/g, f072b().sql);
  assert.equal(checks072b.length, 10, `072b CHECKs parsed: ${checks072b.join(', ')}`);
  for (const name of checks072b) {
    const r = W.stockRuleError({ pg: { code: '23514', message: `new row for relation "rt_vehicle_segments" violates check constraint "${name}"` } });
    assert.deepEqual(r, { type: 'PLAN_RULE', code: name, message: W.PLAN_CHECK_TEXT[name] }, name);
    assert.match(r.message, greek, `${name} text is Greek`);
  }
  assert.deepEqual(uniq(/CREATE UNIQUE INDEX (\w+)/g, f072b().sql).concat(uniq(/CONSTRAINT (\w+) UNIQUE/g, f072b().sql)), [],
    '072b adds no UNIQUE (else: a text here)');
  // 089's one CHECK on rt_vehicle_segments (the ANODOS part of the fee): Greek, its own text, never the 500 path
  const checks089 = uniq(/CONSTRAINT (\w+) CHECK/g, f089().sql);
  assert.deepEqual(checks089, ['seg_partner_rate_anodos'], `089 CHECKs parsed: ${checks089.join(', ')}`);
  for (const name of checks089) {
    const r = W.stockRuleError({ pg: { code: '23514', message: `new row for relation "rt_vehicle_segments" violates check constraint "${name}"` } });
    assert.deepEqual(r, { type: 'PLAN_RULE', code: name, message: W.PLAN_CHECK_TEXT[name] }, name);
    assert.match(r.message, greek, `${name} text is Greek`);
  }
  // 098 / 099 (the transfer stop) and 102 (drafts): every NAMED CHECK Greek, its own text, never the 500 path. 102's
  // unnamed column CHECKs (side, version, snap, removed_reason) are values its functions write or check first: they
  // stay the loud 422 «Κανόνας βάσης <name>» of planRefusal
  const checksRoad = uniq(/CONSTRAINT (\w+) CHECK/g, f098().sql + f099().sql + f102().sql);
  assert.deepEqual(checksRoad, ['plan_draft_pieces_rm', 'plan_drafts_del', 'plan_drafts_end', 'plan_drafts_real', 'plan_drafts_vehicle',
    'plan_drafts_win', 'rt_stops_transfer_note', 'rt_stops_transfer_place', 'rt_stops_transfer_reason', 'rt_stops_transfer_waits'],
    `098 / 099 / 102 CHECKs parsed: ${checksRoad.join(', ')}`);
  for (const name of checksRoad) {
    const r = W.stockRuleError({ pg: { code: '23514', message: `new row for relation "x" violates check constraint "${name}"` } });
    assert.deepEqual(r, { type: 'PLAN_RULE', code: name, message: W.PLAN_CHECK_TEXT[name] }, name);
    assert.match(r.message, greek, `${name} text is Greek`);
  }
  // 111 (the new international form): the two hour formats of a stop, Greek, never the 500 path
  const checks111 = uniq(/ADD CONSTRAINT (\w+) CHECK/g, f111().sql);
  assert.deepEqual(checks111, ['order_stops_time_from_fmt', 'order_stops_time_to_fmt'], `111 CHECKs parsed: ${checks111.join(', ')}`);
  for (const name of checks111) {
    const r = W.stockRuleError({ pg: { code: '23514', message: `new row for relation "order_stops" violates check constraint "${name}"` } });
    assert.deepEqual(r, { type: 'PLAN_RULE', code: name, message: W.PLAN_CHECK_TEXT[name] }, name);
    assert.match(r.message, greek, `${name} text is Greek`);
  }
  // a base without 111 under this Worker: named for order_stops only (LOCAL MOVES has its own time_from / time_to)
  for (const pg of [{ code: 'PGRST204', message: "Could not find the 'time_from' column of 'order_stops' in the schema cache" },
    { code: '42703', message: 'column "time_to" of relation "order_stops" does not exist' },
    { code: '23502', message: 'null value in column "via_hub" of relation "order_stops" violates not-null constraint' }]) {
    assert.equal(W.stockRuleError({ pg }).code, '111_missing', pg.message);
  }
  for (const pg of [{ code: '42703', message: 'column "time_from" of relation "local_moves" does not exist' },
    { code: '23502', message: 'null value in column "pallets" of relation "order_stops" violates not-null constraint' }]) {
    assert.equal(W.stockRuleError({ pg }), null, pg.message);
  }
  const known = new Set([...checks, ...uniques, ...LIVE_PRE_071, ...checks072b, ...checks089, ...checksRoad, ...checks111]);
  const dead = Object.keys(W.PLAN_CHECK_TEXT).filter((k) => !known.has(k));
  assert.deepEqual(dead, [], 'PLAN_CHECK_TEXT keys with no constraint in 071, 072b, 089, 098, 099, 102, 111 or live before 071');
  for (const k of RELAY_OWNED) assert.ok(!Object.prototype.hasOwnProperty.call(W.PLAN_CHECK_TEXT, k), `${k} stays in RELAY_CHECK_TEXT only`);
});

test('071b: each EXCLUDE (23P01, deferred) answers the same code as 072\'s pre-check', () => {
  const ex = uniq(/CONSTRAINT (\w+) EXCLUDE/g, f071b().sql);
  assert.deepEqual(ex, ['rt_v2_driver_once', 'rt_v2_truck_once']);
  const want = { rt_v2_truck_once: 'truck_busy', rt_v2_driver_once: 'driver_busy' };
  for (const name of ex) {
    const r = W.stockRuleError({ pg: { code: '23P01', details: 'Key (truck_id, tstzrange(start_at, end_at)) conflicts', message: `conflicting key value violates exclusion constraint "${name}"` } });
    assert.deepEqual(r, { type: 'PLAN_RULE', code: want[name], message: W.PLAN_RULE_TEXT[want[name]] }, name);
  }
  assert.equal(W.stockRuleError({ pg: { code: '23P01', message: 'conflicting key value violates exclusion constraint "other_excl"' } }), null);
  // 072b MOVES them to rt_vehicle_segments with the SAME names: this map, 072's plan_h_finish and the texts stay
  const sql = f072b().sql;
  assert.deepEqual(uniq(/DROP CONSTRAINT (rt_v2_\w+)/g, sql), ['rt_v2_driver_once', 'rt_v2_truck_once'], '072b drops exactly 071b\'s two');
  assert.deepEqual(uniq(/ADD CONSTRAINT (\w+) EXCLUDE/g, sql), ['rt_v2_driver_once', 'rt_v2_truck_once'], '072b adds them back by the same names');
});

test('plan: hint is the marker whatever SQLSTATE; unknown code still loud; no detail, no brackets', () => {
  assert.equal(W.stockRuleError({ pg: { code: 'P0001', hint: 'plan:truck_busy', message: 'plan rule broken: truck_busy:RT-1290' } }).code, 'truck_busy');
  const hard = W.stockRuleError({ pg: { code: '23514', hint: 'plan:hard_delete', message: 'plan rule broken: hard delete on rt_stops (soft delete only)' } });
  assert.equal(hard.message, W.PLAN_RULE_TEXT.hard_delete, 'a message without «<code>:» adds no brackets');
  const unknown = W.stockRuleError({ pg: { code: '23514', hint: 'plan:brand_new', message: 'plan rule broken: brand_new:7' } });
  assert.equal(unknown.type, 'PLAN_RULE');
  assert.equal(unknown.code, 'brand_new');
  assert.match(unknown.message, /brand_new/);
  const long = W.stockRuleError({ pg: { code: '23514', hint: 'plan:chain', message: 'plan rule broken: chain:' + 'x'.repeat(500) } });
  assert.equal(long.message, W.PLAN_RULE_TEXT.chain, 'the detail never in the text');
  assert.ok(long.detail.length <= 120, 'detail capped at 120 chars');
  assert.match(W.stockRuleError({ pg: { code: '23514', hint: 'plan:toString', message: 'x' } }).message, /^Η βάση αρνήθηκε την αλλαγή με κανόνα χωρίς κείμενο \(toString\)/, 'prototype key is not a text');
  assert.doesNotMatch(unknown.message, /plan rule broken|:7/, 'the raw English message and an unknown code\'s detail never reach the text');
  // 110 rt_changed has no text yet: «rt_changed:<role> <time>» stays readable for wn5_actions.js _orderErr
  const ch = W.stockRuleError({ pg: { code: 'P0001', hint: 'plan:rt_changed', message: 'plan rule broken: rt_changed:owner 2026-11-09T10:42:00+00:00' } });
  assert.match(ch.message, /rt_changed:\s*([a-z]*)\s+(\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:?\d{2}))/, 'the screen regex of _orderErr finds role and time');
});
// ─────────────── Γ3: the Worker's RPC calls and money keys ↔ 072 (review 23/10) ───────────────
// PostgREST finds a function by its name AND its argument names: a rename on one side would pass every stub test
// of plan-routes and fail only on day L, as a misdiagnosed 503 schema_behind. Both sides are read from the sources.
test('every PLAN_ROUTES rpc exists in 072 / 072b with the argument names the Worker sends; every public plan_* is routed', () => {
  const sigs = Object.fromEntries([...(f072().sql + f072b().sql).matchAll(/CREATE FUNCTION public\.(plan_[a-z_]+)\(([^)]*)\)/g)]
    // 072b's COMMIT rule and its trigger functions are not RPCs (EXECUTE for no API role, its PART 8)
    .filter((m) => !m[1].startsWith('plan_h_') && !['plan_seg_problem', 'plan_chk_seg', 'plan_seg_follow', 'plan_seg_copy'].includes(m[1]))
    .map((m) => [m[1], m[2].split(',').map((a) => a.trim().split(/\s+/)[0]).filter(Boolean)]));
  const WRITE = ['p', 'p_actor', 'p_role'];
  const want = { plan_board: ['p_week', 'p_role'], plan_vs_state: ['p_order_ids'], plan_notices_list: ['p_desk', 'p_role'] };
  const routes = src.match(/var PLAN_ROUTES = \[[\s\S]*?\n\];\n/);
  assert.ok(routes, 'PLAN_ROUTES not found in worker/src/index.js');
  // the 074a and 077 reads have their own tests below
  const routed = new Set([...routes[0].matchAll(/"(plan_[a-z_]+)"/g)].map((m) => m[1])
    .filter((fn) => !Object.hasOwn(READS_074A, fn) && !Object.hasOwn(READS_077, fn) && !Object.hasOwn(ROAD_RPCS, fn)));
  for (const fn of routed) assert.deepEqual(sigs[fn], want[fn] || WRITE, `${fn}: 072 signature vs the Worker's args`);
  assert.deepEqual([...routed].sort(), Object.keys(sigs).filter((x) => x !== 'plan_rt_create').sort(),
    'every public plan_* routed once; plan_rt_create internal (decision 3)');
});

// F5 (074a): the four reads routed under /plan/* and the preview DELETE ORDERS asks for first (E19) - each one
// created by 074a with exactly the argument names the Worker sends, and EXECUTE for the service role only (born
// closed: the Worker is its one caller). Read from the copy, so a rename in a1's file fails here, not on day L.
const READS_074A = { plan_config_read: [], plan_lookups: ['p_role'], plan_nat_state: ['p_nat_order_ids'], plan_activity: ['p_kind', 'p_id'] };
test('074a creates the Worker\'s four /plan/* reads and order_delete_preview with the argument names it sends', () => {
  const sql = f074a().sql;
  const sigs = Object.fromEntries([...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.([a-z_]+)\(([^)]*)\)/g)]
    .map((m) => [m[1], m[2].split(',').map((a) => a.trim().split(/\s+/)[0]).filter(Boolean)]));
  // one GRANT may name several functions: the names granted EXECUTE to service_role, from every such statement
  const granted = new Set([...sql.matchAll(/GRANT EXECUTE ON FUNCTION ([^;]*?)\s+TO service_role\s*;/g)]
    .flatMap((m) => [...m[1].matchAll(/public\.([a-z_]+)\(/g)].map((x) => x[1])));
  for (const [fn, args] of Object.entries(READS_074A)) {
    assert.deepEqual(sigs[fn], args, `${fn}: 074a signature vs the Worker's args`);
    assert.ok(src.includes(`rpc: "${fn}"`), `${fn} is routed in PLAN_ROUTES`);
    assert.ok(granted.has(fn), `${fn}: EXECUTE for the service role`);
  }
  const call = /dbRpc\(env, "order_delete_preview", \{ ([^}]*) \}\)/.exec(src);
  assert.ok(call, 'the Worker calls order_delete_preview');
  assert.deepEqual(sigs.order_delete_preview, [...call[1].matchAll(/(p_[a-z_]+):/g)].map((m) => m[1]), 'order_delete_preview: 074a signature vs the Worker\'s args');
  assert.ok(granted.has('order_delete_preview'), 'order_delete_preview: EXECUTE for the service role');
});

// 077 (F13): the edit form's read of one national order - created by 077 with exactly the argument names the Worker
// sends, born closed (REVOKE from every API role, EXECUTE for the service role only), routed once.
const READS_077 = { plan_order_read: ['p_nat_order_id', 'p_role'] };
test('077 creates GET /plan/orders/:id\'s read with the argument names the Worker sends, EXECUTE for the service role only', () => {
  const sql = f077().sql;
  const sigs = Object.fromEntries([...sql.matchAll(/CREATE FUNCTION public\.([a-z_]+)\(([^)]*)\)/g)]
    .map((m) => [m[1], m[2].split(',').map((a) => a.trim().split(/\s+/)[0]).filter(Boolean)]));
  for (const [fn, args] of Object.entries(READS_077)) {
    assert.deepEqual(sigs[fn], args, `${fn}: 077 signature vs the Worker's args`);
    assert.equal(src.split(`rpc: "${fn}"`).length - 1, 1, `${fn} is routed once in PLAN_ROUTES`);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(bigint,text\\) FROM PUBLIC, anon, authenticated, service_role;`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(bigint,text\\) TO service_role;`));
  }
  // the args the Worker builds are exactly those names
  const fnSrc = /function planOrderReadArgs\(url, caller, match\) \{[\s\S]*?\n\}/.exec(src);
  assert.ok(fnSrc, 'planOrderReadArgs not found');
  assert.deepEqual([...fnSrc[0].matchAll(/(p_[a-z_]+):/g)].map((m) => m[1]), READS_077.plan_order_read);
});

// 099 + 102 (owner 2/11, one Worker chain): the nine RPCs of POST /plan/transfer and /plan/drafts - each created by its
// migration with exactly the argument names the Worker sends, SECURITY DEFINER, born closed (REVOKE from every API
// role, EXECUTE for the service role only), routed exactly once. Read from the files, so a rename fails here, not on
// the first transfer of a dispatcher (αρχή 6).
const ROAD_RPCS = {
  plan_transfer: ['p', 'p_actor', 'p_role'],
  plan_drafts_read: ['p_point', 'p_role'], plan_draft_history: ['p_draft', 'p_role'],
  plan_draft_create: ['p', 'p_actor', 'p_role'], plan_draft_update: ['p', 'p_actor', 'p_role'], plan_draft_pieces: ['p', 'p_actor', 'p_role'],
  plan_draft_move: ['p', 'p_actor', 'p_role'], plan_draft_delete: ['p', 'p_actor', 'p_role'], plan_draft_realize: ['p', 'p_actor', 'p_role']
};
test('099 / 102 create the nine RPCs of /plan/transfer and /plan/drafts with the argument names the Worker sends, service role only', () => {
  const t099 = f099().sql;
  const t102 = f102().sql;
  const sigs = Object.fromEntries([...(t099 + t102).matchAll(/CREATE FUNCTION public\.(plan_[a-z_]+)\(([^)]*)\)/g)]
    .map((m) => [m[1], m[2].split(',').map((a) => a.trim().split(/\s+/)[0]).filter(Boolean)]));
  for (const [fn, args] of Object.entries(ROAD_RPCS)) {
    assert.deepEqual(sigs[fn], args, `${fn}: 099 / 102 signature vs the Worker's args`);
    assert.equal(src.split(`rpc: "${fn}"`).length - 1, 1, `${fn} is routed once in PLAN_ROUTES`);
    assert.match(t099 + t102, new RegExp(`FUNCTION public\\.${fn}\\([^)]*\\) RETURNS jsonb\\s+LANGUAGE plpgsql (?:STABLE )?SECURITY DEFINER`), `${fn}: SECURITY DEFINER`);
  }
  // 099: one REVOKE / GRANT pair, written out; 102: its c_acts list, revoked and granted in two loops
  assert.match(t099, /REVOKE ALL ON FUNCTION public\.plan_transfer\(jsonb,text,text\) FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(t099, /GRANT EXECUTE ON FUNCTION public\.plan_transfer\(jsonb,text,text\) TO service_role;/);
  const acts = /c_acts CONSTANT text\[\] := ARRAY\[([\s\S]*?)\];/.exec(t102);
  assert.ok(acts, '102 c_acts not found');
  assert.deepEqual([...acts[1].matchAll(/public\.([a-z_]+)\(/g)].map((m) => m[1]).sort(), Object.keys(ROAD_RPCS).filter((f) => f !== 'plan_transfer').sort());
  assert.match(t102, /FOREACH v_sig IN ARRAY c_acts \|\| c_helpers LOOP\s+EXECUTE format\('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_sig\);/);
  assert.match(t102, /FOREACH v_sig IN ARRAY c_acts LOOP\s+EXECUTE format\('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig\);/);
  // the two reads' args are built by the Worker with exactly those names
  for (const [name, fn] of [['planDraftsArgs', 'plan_drafts_read'], ['planDraftHistoryArgs', 'plan_draft_history']]) {
    const body = new RegExp(`function ${name}\\(url, caller(?:, match)?\\) \\{[\\s\\S]*?\\n\\}`).exec(src);
    assert.ok(body, `${name} not found`);
    assert.deepEqual([...body[0].matchAll(/(p_[a-z_]+):/g)].map((m) => m[1]), ROAD_RPCS[fn], name);
  }
  // the creations replay by request_id (decision 44): the three whose key list holds it - and only those
  const withRid = [...(t099 + t102).matchAll(/CREATE FUNCTION public\.(plan_[a-z_]+)\(p jsonb[\s\S]*?perform plan_h_keys\(p, array\[([^\]]*)\], 'p'\)/g)]
    .filter((m) => /'request_id'/.test(m[2])).map((m) => m[1]).sort();
  assert.deepEqual(withRid, ['plan_draft_create', 'plan_draft_realize', 'plan_transfer']);
});

// review of PR #90, finding 7: the roles that SEE amounts, held equal the same way. If the Worker's list were
// wider than 072's, its tripwire would go blind for a role the DB cuts for; if narrower, every answer to a
// role the DB serves amounts to would become a 422 amount_leak.
test('PLAN_MONEY_ROLES of the Worker = the roles plan_h_strip_amounts serves amounts to (one list, two layers)', () => {
  const m = src.match(/var PLAN_MONEY_ROLES = (\[[^\]]*\]);/);
  assert.ok(m, 'PLAN_MONEY_ROLES not found in worker/src/index.js');
  const strip = /CREATE FUNCTION public\.plan_h_strip_amounts\([\s\S]*?if p_role in \(([^)]*)\) or p is null then return p;/.exec(f072().sql);
  assert.ok(strip, 'plan_h_strip_amounts role list not found in 072');
  assert.deepEqual(JSON.parse(m[1]).slice().sort(), [...strip[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort());
});

test('PLAN_MONEY_KEYS of the Worker = the keys plan_h_strip_amounts cuts (one list, two layers)', () => {
  const m = src.match(/var PLAN_MONEY_KEYS = (\[[^\]]*\]);/);
  assert.ok(m, 'PLAN_MONEY_KEYS not found in worker/src/index.js');
  const strip = /CREATE FUNCTION public\.plan_h_strip_amounts\([\s\S]*?k not in \(([^)]*)\)/.exec(f072().sql);
  assert.ok(strip, 'plan_h_strip_amounts key list not found in 072');
  assert.deepEqual(JSON.parse(m[1]).slice().sort(), [...strip[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort());
});
