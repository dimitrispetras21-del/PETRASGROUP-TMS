// node --test tests/wn5-labels.test.js
// National v5 F4α T11: core/wn5-labels.js holds the ONLY texts the v5 screens own — the codes the Worker sends
// without a text (warnings[].code, consequences[].kind of a dry run). Everything else the screen shows is
// error.message / preview.conflict.message / notice.message as the Worker or the DB wrote it (principle 3).
// Why a drift test: a code added to 072 without a label would show «άλλη επίπτωση · <code>» in a confirmation
// list the morning it ships; here it breaks the build instead (principle 6).
// Amounts: the DB strips amount/advance/expenses/invoice_number for every role but owner/accountant
// (plan_h_strip_amounts, 072:381); a line shows an amount ONLY when the key is in the item — never a role check.
// Owner 23/10 (decision 10, S-85): no line ever says «πληρωμένη».
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const L = require(path.join(ROOT, 'core', 'wn5-labels.js'));
// 072b (T26): the warning codes and consequence kinds are those of 072 + 072b — the screen labels both.
// 081 (owner 31/10): plan_order_update's stop_kept, labelled once 081 is in the tree (drafts/ until the owner runs it)
const SQL_081_FILE = ['worker/migrations/081_plan_stop_order_follows.sql', 'worker/migrations/drafts/081_plan_stop_order_follows.sql']
  .map((f) => path.join(ROOT, f)).find((f) => fs.existsSync(f));
const SQL_072B_FILE = ['worker/migrations/072b_plan_vehicle_segments.sql', 'worker/migrations/drafts/072b_plan_vehicle_segments.sql']
  .map((f) => path.join(ROOT, f)).find((f) => fs.existsSync(f));
const SQL = [path.join(ROOT, 'worker', 'migrations', '072_plan_functions.sql'), SQL_072B_FILE, SQL_081_FILE].filter(Boolean).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
// Literal codes only: `'code', 'over_33'` is a warning; `'code', c.code` (a cycle code) is not.
const literals = (re) => [...new Set([...SQL.matchAll(re)].map((m) => m[1]))].sort();
// The 072b additions, present only when 072b is in the tree.
const B_WARN = SQL_072B_FILE ? ['seg_stop_moved', 'seg_stop_straddles'] : [];
const B_KIND = SQL_072B_FILE ? ['partner_rate', 'seg_removed', 'seg_vehicle'] : [];
const C_WARN = SQL_081_FILE ? ['stop_kept'] : [];

test('F4α-T11: WARNING keys = the warning codes raised in 072 + 072b (over_33, mixed_temp, v1_same_truck, local_payroll_review, vs_day_differs; seg_stop_moved, seg_stop_straddles)', () => {
  const codes = literals(/jsonb_build_object\(\s*'code',\s*'([a-z0-9_]+)'/g);
  assert.deepStrictEqual(codes, ['local_payroll_review', 'mixed_temp', 'over_33', 'v1_same_truck', 'vs_day_differs', ...B_WARN, ...C_WARN].sort(), 'the 072/072b/081 warning set changed: label the new code here');
  assert.deepStrictEqual(Object.keys(L.WARNING).sort(), codes);
  assert.ok(Object.isFrozen(L.WARNING));
});

test('F4α-T11: CONSEQUENCE keys = the consequence kinds built in 072 + 072b', () => {
  const kinds = literals(/jsonb_build_object\(\s*'kind',\s*'([a-z_]+)'/g);
  assert.deepStrictEqual(kinds, ['costs', 'executed_leg', 'invoiced', 'later_leg', 'local_loading', 'local_payroll', 'payroll_amount', 'rt_cancelled', ...B_KIND].sort());
  // T28: 073 (live) adds its own kinds; they are built inside E'...' bodies, where every quote is doubled
  const f073 = ['073_plan_money.sql', 'drafts/073_plan_money.sql'].map((f) => path.join(ROOT, 'worker', 'migrations', f)).find((f) => fs.existsSync(f));
  const k073 = f073 ? [...fs.readFileSync(f073, 'utf8').matchAll(/'{1,2}kind'{1,2}, '{1,2}([a-z_]+)'/g)].map((m) => m[1]) : [];
  // F5: 074a's order_delete_preview (Ε-19) adds piece_on_rt — the delete of an international order lists it
  const f074a = ['074a_plan_reads.sql', 'drafts/074a_plan_reads.sql'].map((f) => path.join(ROOT, 'worker', 'migrations', f)).find((f) => fs.existsSync(f));
  const k074a = f074a ? [...fs.readFileSync(f074a, 'utf8').matchAll(/'{1,2}kind'{1,2}, '{1,2}([a-z_]+)'/g)].map((m) => m[1]) : [];
  assert.ok(!f074a || k074a.includes('piece_on_rt'), '074a no longer builds piece_on_rt: ' + k074a.join());
  assert.deepStrictEqual(Object.keys(L.CONSEQUENCE).sort(), [...new Set([...kinds, ...k073, ...k074a])].sort());
  assert.ok(Object.isFrozen(L.CONSEQUENCE));
});

test('F4α-T11: amounts appear only when the key is in the consequence; «γραμμή μισθοδοσίας με ποσό (Οκτώβριος)» without it (S-84)', () => {
  const disp = { kind: 'payroll_amount', rt_id: 101, dl_entry_id: 7, driver_id: 31, month: '2026-10' };
  // the Figma words (H4/H6, approval 25/10): drift-pinned here, so a reword is a test change, never a silent one
  assert.deepStrictEqual(L.consequenceLine(disp), { text: 'γραμμή μισθοδοσίας με ποσό (Οκτώβριος)', unknown: false });
  const own = Object.assign({ amount: 120, advance: null, expenses: null }, disp);
  assert.strictEqual(L.consequenceLine(own).text, 'γραμμή μισθοδοσίας με ποσό (Οκτώβριος) · ποσό 120,00 €');
  assert.strictEqual(L.consequenceLine({ kind: 'local_payroll', rt_id: 101, local_move_id: 5, month: '2026-01' }).text, 'γραμμή μισθοδοσίας τοπικού με ποσό (Ιανουάριος) · πάει για έλεγχο στο λογιστήριο');
  assert.strictEqual(L.consequenceLine({ kind: 'costs', rt_id: 101, pay_source: 'DKV', count: 3 }).text, '3 γραμμές DKV');
  assert.strictEqual(L.consequenceLine({ kind: 'costs', rt_id: 101, pay_source: 'DKV', count: 1, amount: 186.4 }).text, '1 γραμμή DKV · 186,40 €');
  assert.strictEqual(L.consequenceLine({ kind: 'invoiced', nat_order_id: 3111 }).text, 'τιμολογήθηκε: το ERP κάνει το πιστωτικό');
  assert.strictEqual(L.consequenceLine({ kind: 'invoiced', nat_order_id: 3111, invoice_number: 'T-77' }).text, 'τιμολογήθηκε (T-77): το ERP κάνει το πιστωτικό');
  assert.strictEqual(L.consequenceLine({ kind: 'rt_cancelled', rt_id: 101, code: 'RT-T101' }).text, 'το δρομολόγιο RT-T101 θα σβηστεί');
  assert.strictEqual(L.warningLine({ code: 'over_33', rt_id: 101, side: 'KATHODOS', pallets: 54 }).text, 'Υπέρβαση 21π στην ΚΑΘΟΔΟ · 54/33');
  // Δ12 tile 7 after a save: the vehicle the screen added (saved_on), Figma's words
  assert.strictEqual(L.warningLine({ code: 'over_33', rt_id: 101, side: 'KATHODOS', pallets: 54, saved_on: 'TST-2106' }).text, 'Υπέρβαση 21π στο TST-2106 — αποθηκεύτηκε');
  // principle 3: the 33 of these lines IS WN5L.CAP (held to the 072 HAVING by tests/wn5-logic.test.js). A literal 33
  // in the over_33 entry fails here, and a page whose WN5L.CAP were 30 must say «24π · 54/30».
  const src = fs.readFileSync(path.join(ROOT, 'core', 'wn5-labels.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  const entry = src.slice(src.indexOf('over_33:'), src.indexOf('mixed_temp:'));
  assert.ok(entry.length > 0 && !/\b33\b/.test(entry.replace(/over_33/g, '')), 'a literal 33 in WARNING.over_33: ' + entry);
  const ctx = { WN5L: { CAP: 30 } }; ctx.window = ctx;
  require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'core', 'wn5-labels.js'), 'utf8'), ctx);
  assert.strictEqual(ctx.WN5Lab.warningLine({ code: 'over_33', side: 'KATHODOS', pallets: 54 }).text, 'Υπέρβαση 24π στην ΚΑΘΟΔΟ · 54/30');
});

test('F4α-T11: no line says «πληρωμένη» (S-85)', () => {
  const full = { rt_id: 1, dl_entry_id: 2, driver_id: 3, month: '2026-10', amount: 1, advance: 2, expenses: 3, pay_source: 'DKV', count: 2,
    leg_id: 4, stop_day: '2026-10-12', code: 'RT-1', local_move_id: 5, move_date: '2026-10-12', nat_order_id: 6, invoice_number: 'X' };
  const all = [...Object.keys(L.CONSEQUENCE).map((k) => L.consequenceLine(Object.assign({ kind: k }, full)).text),
    ...Object.keys(L.WARNING).map((k) => L.warningLine({ code: k, side: 'ANODOS', pallets: 40, delta_c: 4, rt_code: 'RT-1', first_hub_day: '2026-10-12' }).text)];
  for (const t of all) assert.ok(!/πληρωμ/i.test(t), t);
});

test('F5 + live 28/10: piece_on_rt names the cycle and whose load it is — never an internal stop id; no money key', () => {
  // live 28/10: «το φορτίο της στάσης #6101» named an order_stops id nobody can read (NO-GO on main)
  const vs = L.consequenceLine({ kind: 'piece_on_rt', leg_id: 9, piece_id: 4101, rt_id: 201, code: 'RT-T201', order_stop_id: 6101 });
  assert.deepStrictEqual(vs, { text: 'βγαίνει από το RT-T201 το φορτίο αυτής της παραγγελίας', unknown: false });
  assert.ok(!/#6101|στάσης #/.test(vs.text), vs.text);
  // a national order made from the deleted one: said, never by the base's internal id
  const nat = L.consequenceLine({ kind: 'piece_on_rt', rt_id: 201, code: 'RT-T201', order_stop_id: null, nat_order_id: 5231 }).text;
  assert.strictEqual(nat, 'βγαίνει από το RT-T201 το φορτίο της εθνικής που βγήκε από αυτή την παραγγελία');
  assert.ok(!/5231/.test(nat), nat);
  // a place, only when the base sends one (proposal in the PR of 28/10)
  assert.strictEqual(L.consequenceLine({ kind: 'piece_on_rt', code: 'RT-T201', order_stop_id: 6101, place: 'LARISA TEST' }).text,
    'βγαίνει από το RT-T201 το φορτίο για LARISA TEST');
  assert.strictEqual(L.consequenceLine({ kind: 'piece_on_rt', rt_id: 201 }).text, 'βγαίνει από το — το φορτίο αυτής της παραγγελίας');
});

test('F4α-T11: unknown kind / code → {unknown:true}, never dropped (S-52, Ε-21)', () => {
  // (seg_removed was the example here until 072b gave it a line, T26)
  assert.deepStrictEqual(L.consequenceLine({ kind: 'zz_new_kind', rt_id: 1 }), { text: 'άλλη επίπτωση · zz_new_kind', unknown: true });
  assert.deepStrictEqual(L.warningLine({ code: 'zz_new' }), { text: 'προειδοποίηση · zz_new', unknown: true });
  assert.deepStrictEqual(L.consequenceLine(null), { text: 'άλλη επίπτωση · —', unknown: true });
});

test('F4α-T11: the labels file builds no date of its own (no Date.now / new Date())', () => {
  const src = fs.readFileSync(path.join(ROOT, 'core', 'wn5-labels.js'), 'utf8');
  assert.ok(!/Date\.now\(|new Date\(\s*\)/.test(src), 'a label must not depend on the clock');
});

test('F4α-T11: the two-step list puts «Μισθοδοσία» before a payroll line (Figma Δ5 2053:8079, H4 2125:7738); CATEGORY only names CONSEQUENCE kinds', () => {
  assert.ok(Object.isFrozen(L.CATEGORY));
  assert.strictEqual(L.CATEGORY.payroll_amount, 'Μισθοδοσία');
  assert.strictEqual(L.CATEGORY.local_payroll, 'Μισθοδοσία');
  for (const k of Object.keys(L.CATEGORY)) assert.ok(Object.prototype.hasOwnProperty.call(L.CONSEQUENCE, k), 'CATEGORY names a kind 072 does not build: ' + k);
});

test('F4α-T11: «Ανανέωση ↻» still has messages to follow — PLAN_RULE_TEXT entries ask «ανανέωσε», and wn5_actions reads that same word', () => {
  // _wantsReread reads the Worker's own words instead of a second list of codes (principle 3); if the Worker rewords
  // its messages the button would vanish without notice — this breaks the build instead (principle 6).
  const W = fs.readFileSync(path.join(ROOT, 'worker', 'src', 'index.js'), 'utf8');
  const block = (W.match(/^const PLAN_RULE_TEXT = \{[\s\S]*?^\};/m) || [''])[0];
  assert.ok(block, 'PLAN_RULE_TEXT not found in worker/src/index.js');
  const asking = (block.match(/ανανέωσε/g) || []).length;
  assert.ok(asking >= 1, 'no PLAN_RULE_TEXT message asks «ανανέωσε» any more: «Ανανέωση ↻» would never show');
  const A = fs.readFileSync(path.join(ROOT, 'modules', 'wn5_actions.js'), 'utf8');
  assert.ok(/_wantsReread = [^\n]*\/ανανέωσε\/i/.test(A), 'wn5_actions no longer reads «ανανέωσε» from the message');
});

// ── F4α-T24 (072b): the reasons of a vehicle handover (H-19, R-18) ───────────────────────────────────────────
// The SQL of 072b is the one list (CHECK seg_reason_list); WN5Lab.REASON is the screen's only copy, pinned here.
const WN5Lab = L;
const SQL_072B = ['worker/migrations/072b_plan_vehicle_segments.sql', 'worker/migrations/drafts/072b_plan_vehicle_segments.sql']
  .map((f) => path.join(ROOT, f)).find((f) => fs.existsSync(f));

test('F4α-T24: REASON keys = CHECK seg_reason_list of 072b, 8 codes', (t) => {
  if (!SQL_072B) { t.todo('072b not in tree: no worker/migrations/[drafts/]072b_plan_vehicle_segments.sql'); return; }
  const sql = fs.readFileSync(SQL_072B, 'utf8');
  const m = /CONSTRAINT seg_reason_list CHECK \(reason IS NULL OR reason IN \(([\s\S]*?)\)\)/.exec(sql);
  assert.ok(m, 'seg_reason_list not found in ' + SQL_072B);
  const codes = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
  assert.strictEqual(codes.length, 8);
  assert.deepStrictEqual(Object.keys(WN5Lab.REASON).sort(), codes);
});

test('F4α-T24: «Βλάβη φορτηγού» here and «Βλάβη οχήματος» in 067 (daily_ops OPS_DELAY) both stay — one code, two approved texts', () => {
  assert.strictEqual(WN5Lab.REASON.vehicle_breakdown.text, 'Βλάβη φορτηγού');
  const ops = fs.readFileSync(path.join(ROOT, 'modules', 'daily_ops.js'), 'utf8');
  assert.ok(/code:'vehicle_breakdown',\s*resp:'us',\s*label:'Βλάβη οχήματος'/.test(ops), 'the 067 text changed: never unify them (HPLAN:121)');
});

test('F4α-T24: «Άλλο» needs its note; every reason has a group of the H2 list', () => {
  assert.strictEqual(WN5Lab.REASON.other.noteRequired, true);
  for (const [k, v] of Object.entries(WN5Lab.REASON)) assert.ok(['unplanned', 'planned', 'other'].includes(v.group), k);
  assert.deepStrictEqual(WN5Lab.reasonLine('nope'), { text: 'άλλος λόγος · nope', unknown: true });
});

// WCAG 2.x relative luminance / contrast of two hex colours (no dependency).
function wcag(a, b) {
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
// A token's value as style.css defines it first, following var(--x) to the end.
function token(css, name, depth = 0) {
  // a definition (name: #hex | var(--x);), never a mention in a comment
  const m = new RegExp(name + '\\s*:\\s*(#[0-9a-fA-F]{3,8}|var\\(--[\\w-]+\\))\\s*;').exec(css);
  if (!m || depth > 8) return null;
  const v = m[1].trim();
  const r = /^var\((--[\w-]+)\)$/.exec(v);
  return r ? token(css, r[1], depth + 1) : v.toLowerCase();
}
test('F4α-T24: label text on the own (#EEF2F6) and partner (#DDEFE3) tiles ≥ 4.5:1 for the three segment inks', () => {
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'style.css'), 'utf8');
  for (const ink of ['--wn5-seg-initial-ink', '--wn5-seg-intermediate-ink', '--wn5-seg-final-ink']) {
    const v = token(css, ink);
    assert.ok(/^#[0-9a-f]{6}$/.test(v || ''), `${ink} = ${v}`);
    for (const bg of ['--wi4-own', '--wi4-partner']) {
      const r = wcag(v, token(css, bg));
      assert.ok(r >= 4.5, `${ink} on ${bg}: ${r.toFixed(2)}:1`);
    }
  }
});

// ── F4α-T26 (072b): the new consequence and warnings of 072b have their screen lines ─────────────────────────
test('F4α-T26: seg_removed / seg_stop_moved / seg_stop_straddles labelled; drift vs 072b', (t) => {
  const r = WN5Lab.consequenceLine({ kind: 'seg_removed', rt_id: 101, code: 'RT-T101', segment_id: 702, at: '2026-10-13T00:00:00Z', at_athens: '13/10 03:00', place_note: 'Λαμία', reason: 'vehicle_breakdown' });
  assert.deepStrictEqual(r, { text: 'θα αφαιρεθεί η αλλαγή οχήματος Λαμία 13/10 03:00', unknown: false });
  assert.strictEqual(WN5Lab.warningLine({ code: 'seg_stop_moved', stop_id: 1002, from_segment_id: 701, to_segment_id: 702 }).unknown, false);
  assert.strictEqual(WN5Lab.warningLine({ code: 'seg_stop_straddles', stop_id: 1002, segment_id: 702 }).unknown, false);
  if (!SQL_072B) { t.todo('072b not in tree'); return; }
  const sql = require('fs').readFileSync(SQL_072B, 'utf8');
  const warns = [...new Set([...sql.matchAll(/'code', '(seg_[a-z_]+)'/g)].map((m) => m[1]))];
  const kinds = [...new Set([...sql.matchAll(/'kind', '([a-z_]+)'/g)].map((m) => m[1]))];
  assert.deepStrictEqual(warns.sort(), ['seg_stop_moved', 'seg_stop_straddles']);
  for (const k of kinds) assert.ok(Object.prototype.hasOwnProperty.call(WN5Lab.CONSEQUENCE, k), `072b consequence ${k} has no screen line`);
});

// ── F4α-T28 (073): pallets confirmed at a moved leg, payroll per driver ──────────────────────────────────────
const SQL_073 = ['worker/migrations/073_plan_money.sql', 'worker/migrations/drafts/073_plan_money.sql']
  .map((f) => path.join(ROOT, f)).find((f) => fs.existsSync(f));
test('F4α-T28: CONSEQUENCE covers pallets_confirmed (counts, never amounts); drift vs 073', (t) => {
  const r = WN5Lab.consequenceLine({ kind: 'pallets_confirmed', leg_id: 5, pl_movement_id: 77, event_type: 'DELIVERY', taken: 12, given: 12 });
  assert.deepStrictEqual(r, { text: 'επιβεβαιωμένη γραμμή παλετών · παράδοση · πήραμε 12 · δώσαμε 12 — αντιλογίζεται μετά την επιβεβαίωση', unknown: false });
  assert.ok(WN5Lab.consequenceLine({ kind: 'pallets_confirmed', event_type: 'X', taken: 1, given: 0 }).text.includes('X'), 'an unknown event type is said');
  if (!SQL_073) { t.todo('073 not in tree: no worker/migrations/[drafts/]073_plan_money.sql'); return; }
  const sql = fs.readFileSync(SQL_073, 'utf8');
  // 073 builds its consequences inside E'...' function bodies, where every quote is doubled (''kind'', ''x''):
  // a single-quote-only pattern finds nothing there and the drift check would pass on an empty list.
  const kinds = [...new Set([...sql.matchAll(/'{1,2}kind'{1,2}, '{1,2}([a-z_]+)'/g)].map((m) => m[1]))];
  assert.ok(kinds.includes('pallets_confirmed'), 'the drift pattern reads 073\'s consequence kinds');
  for (const k of kinds) assert.ok(Object.prototype.hasOwnProperty.call(WN5Lab.CONSEQUENCE, k), `073 consequence ${k} has no screen line`);
});
test('F4α-T28: a payroll line names the driver\'s segment when 073 sends segment_text, and only then', () => {
  const base = { kind: 'payroll_amount', rt_id: 101, dl_entry_id: 9, driver_id: 31, month: '2026-10' };
  assert.ok(WN5Lab.consequenceLine(Object.assign({ segment_text: 'RT-T101 · ΑΡΧΙΚΟ ως Λαμία' }, base)).text.includes('RT-T101 · ΑΡΧΙΚΟ ως Λαμία'));
  assert.ok(!WN5Lab.consequenceLine(base).text.includes('ΑΡΧΙΚΟ'));
});

test('081: stop_kept says why the truck stop stayed - never «0 άλλα σημεία», never a code', () => {
  const t = (w) => L.warningLine(Object.assign({ code: 'stop_kept', rt_code: 'RT-1' }, w));
  assert.deepStrictEqual(t({ reason: 'shared', others: [{ shipment_id: 2 }] }),
    { text: 'η στάση του φορτηγού στο RT-1 δεν άλλαξε: εξυπηρετεί και 1 άλλο σημείο · «Αλλαγή ώρας στάσης ›» την αλλάζει για όλα', unknown: false });
  assert.match(t({ reason: 'shared', others: [{}, {}] }).text, /εξυπηρετεί και 2 άλλα σημεία/);
  assert.match(t({ reason: 'windows_differ', others: [] }).text, /ζητούν διαφορετική ώρα/);
  assert.match(t({ reason: 'executed' }).text, /έχει ήδη εκτελεστεί$/);
  assert.match(t({ reason: 'handover' }).text, /αλλαγή οχήματος/);
  assert.strictEqual(t({ reason: 'truck_busy', detail: 'RT-1/RT-2' }).text, 'η στάση του φορτηγού στο RT-1 δεν άλλαξε: το φορτηγό είναι απασχολημένο τότε (RT-1/RT-2)');
  assert.match(t({ reason: 'stop_order' }).text, /σειρά των στάσεων/);
  assert.strictEqual(t({ reason: 'truck_busy', detail: 'rt_v2_truck_once' }).text, 'η στάση του φορτηγού στο RT-1 δεν άλλαξε: το φορτηγό είναι απασχολημένο τότε');
  assert.match(t({ reason: 'some_new_rule' }).text, /η μετακίνηση δεν επιτρέπεται εδώ/);
  for (const r of ['shared', 'windows_differ', 'executed', 'handover', 'truck_busy', 'driver_busy', 'stop_order', 'payroll_locked', 'x_rule'])
    assert.ok(!/\b0 άλλα|stop_kept|x_rule|undefined/.test(t({ reason: r, others: [] }).text), r);
});
