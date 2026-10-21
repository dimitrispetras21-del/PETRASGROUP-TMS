// 071a (owner 21/10/2026, B0: every order - a stock lot too - is invoiced from its registration), proved on
// PGlite, the local Postgres the auditor already uses (no network, nothing reaches production).
// The three stock guards are created from 057's text, which IS the live text (md5-proven in
// tests/sql-071a-drafts.test.js). The fixture's stock_v_lots / stock_v_pieces are TABLES (DRAFT_057 in
// test/fixtures), so each case writes the rows the views would compute. Every case runs on 057's guards (it
// meets the old refusal), then after the GENERATED 071a file (it passes - except the lot PRICE freeze and two
// unrelated rules, which must refuse both times), then after the GENERATED rollback (the old refusal again).
// The dry run and 071a's own refusals run here too.
// Run: cd tms-auditor && npm install && node --test test/rules-071a.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createDb } from '../lib/db.mjs';
import { DRAFTS, SRC_057, TARGETS, LIVE_MD5, LIVE_B15_SQL, LIVE_B15_MD5, buildAll, md5 } from '../../worker/migrations/drafts/tools/build-071a.mjs';

const SRC = fs.readFileSync(SRC_057, 'utf8');
const { g, a } = buildAll();
const FILE = (k) => fs.readFileSync(path.join(DRAFTS, TARGETS[k]), 'utf8');
const FNS = Object.keys(LIVE_MD5);

// One `create function public.<name>(` statement of 057, up to and including its closing `$f$;`.
function fn057(name) {
  const at = SRC.indexOf(`  create function public.${name}(`);
  assert.ok(at >= 0, `057: ${name} not found`);
  const open = SRC.indexOf('$f$', at);
  const close = SRC.indexOf('$f$', open + 3);
  return SRC.slice(at, close + 4);
}
const TRIGGERS = SRC.split('\n').filter((l) => /^ {2}create trigger stock_guard_(lots|orders|natl) /.test(l)).join('\n');

// The fixture + 057's functions and triggers + the auditor rows as production holds them on 22/10 (the
// committed seed already carries 071a's S-03 / B-15, so they are put back to the live text first).
async function db057() {
  const db = await createDb({ roles: false });
  for (const fn of ['order_pallets', 'stock_natl_delivered', 'stock_raise', ...FNS]) await db.exec(fn057(fn));
  await db.exec(TRIGGERS);
  await db.query(`UPDATE monitoring.checks SET enabled = true, disabled_reason = NULL WHERE id = 'S-03'`);
  await db.query(`UPDATE monitoring.checks SET sql_text = $1 WHERE id = 'B-15'`, [LIVE_B15_SQL]);
  const { n } = (await db.query(`SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public'`)).rows[0];
  await db.query(`UPDATE monitoring.checks SET red_value = $1, baseline = NULL WHERE id = 'B-54'`, [n]);
  return db;
}
const srcMd5 = async (db, fn) => (await db.query(`SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = $1::regprocedure`, [`public.${fn}()`])).rows[0].m;
const check = async (db, id) => (await db.query(`SELECT enabled, disabled_reason, md5(sql_text) AS m FROM monitoring.checks WHERE id = $1`, [id])).rows[0];

// The refusal's code: the hint 'stock:<code>' (057's stock_raise); the Greek message as a fallback.
const MSG = [
  [/^(Η παρτίδα τιμολογήθηκε|Τιμολογημένη παραγγελία δεν γίνεται παρτίδα)/, 'lot_invoiced'],
  [/^Η παρτίδα δεν τιμολογείται ακόμη/, 'invoice_incomplete'],
  [/^Τιμολογημένη παρτίδα δεν ξανανοίγει/, 'reopen_invoiced'],
  [/^Υπέρβαση αποθέματος/, 'over_draw'],
  [/^Κομμάτι σε κίνηση ή παραδομένο δεν σβήνεται/, 'piece_executed'],
];
function codeOf(e) {
  if (e && typeof e.hint === 'string' && e.hint.startsWith('stock:')) return e.hint.slice(6);
  const hit = MSG.find(([re]) => re.test(String(e && e.message)));
  return hit ? hit[1] : 'ERROR ' + (e && e.message);
}
// setup runs with the triggers OFF (replica): it builds a state the guards may no longer let one write
// reach (e.g. an invoiced lot under 057). The action runs with the triggers ON. Nothing is kept.
async function attempt(db, setup, action) {
  await db.exec('BEGIN');
  try {
    await db.exec(`SET LOCAL session_replication_role = replica;\n${setup}\nSET LOCAL session_replication_role = origin;`);
    try { await db.exec(action); return 'OK'; } catch (e) { return codeOf(e); }
  } finally { await db.exec('ROLLBACK'); }
}

// ── fixture rows (ids 9xxx, legacy recT071a…; client 7 and truck 55 need no row: the fixture has no FKs) ──
const WH = `INSERT INTO locations (id, name) VALUES (9001, 'TEST 071a warehouse');`;
const SRC_O = (inv) => `INSERT INTO orders (id, legacy_id, status, client_id, unloading_location_1_id, loading_pallets_1, price, invoiced, invoice_number)
  VALUES (9101, 'recT071aSRC', 'Pending', 7, 9001, 33, 3300, ${inv}, ${inv ? "'T-071a'" : 'NULL'});`;
const LOT = `INSERT INTO stock_lots (id, legacy_id, order_id) VALUES (9301, 'recT071aLOT', 9101);`;
const VLOT = (inv) => `INSERT INTO stock_v_lots (id, legacy_id, order_id, client_id, warehouse_location_id, invoiced, stock_pallets, intake_status, intake_delivered, pieces, pieces_delivered, complete)
  VALUES (9301, 'recT071aLOT', 9101, 7, 9001, ${inv}, 33, 'Pending', false, 0, 0, false);`;
const PIECE = (status, truck) => `INSERT INTO orders (id, legacy_id, status, client_id, loading_location_1_id, loading_pallets_1, stock_lot_id, truck_id)
  VALUES (9201, 'recT071aP1', '${status}', 7, 9001, 5, 9301, ${truck ? 55 : 'NULL'});
  INSERT INTO stock_v_pieces (lot_id, piece_kind, piece_id, pallets, status, delivered, on_truck) VALUES (9301, 'intl', 9201, 5, '${status}', ${status === 'Delivered'}, ${!!truck});`;
const DRAW = `INSERT INTO orders (id, legacy_id, status, client_id, loading_location_1_id, loading_pallets_1, stock_lot_id)
  VALUES (9202, 'recT071aP2', 'Pending', 7, 9001, 5, 9301);`;
const CLOSED = `UPDATE stock_lots SET closed_note = 'TEST', closed_at = now() WHERE id = 9301;
  UPDATE stock_v_lots SET closed_note = 'TEST', closed_at = now(), intake_delivered = true WHERE id = 9301;`;
const NSRC = (inv) => `INSERT INTO national_orders (id, legacy_id, client_id, delivery_location_1_id, pallets, price, delivery_datetime, invoiced, invoice_number)
  VALUES (9401, 'recT071aNSRC', 7, 9001, 33, 500, current_date + 40, ${inv}, ${inv ? "'T-071a'" : 'NULL'});`;
const NLOT = `INSERT INTO stock_lots (id, legacy_id, nat_order_id) VALUES (9302, 'recT071aNLOT', 9401);`;
const NVLOT = (inv) => `INSERT INTO stock_v_lots (id, nat_order_id, client_id, warehouse_location_id, invoiced, stock_pallets, intake_delivered, pieces, pieces_delivered, complete)
  VALUES (9302, 9401, 7, 9001, ${inv}, 33, false, 0, 0, false);`;
const NDRAW = `INSERT INTO national_orders (id, legacy_id, client_id, pickup_location_1_id, pallets, delivery_datetime, stock_lot_id)
  VALUES (9402, 'recT071aNP1', 7, 9001, 5, current_date + 45, 9302);`;
const INV_LOT = WH + SRC_O(true) + LOT + VLOT(true);

// [name, setup, action, on 057's guards, after 071a]
const CASES = [
  ['C1 an invoiced order is marked as a lot', WH + SRC_O(true), LOT, 'lot_invoiced', 'OK'],
  ['C2 a lot is invoiced before its pieces arrive', WH + SRC_O(false) + LOT + VLOT(false),
    `UPDATE orders SET invoiced = true, invoice_number = 'T-071a' WHERE id = 9101;`, 'invoice_incomplete', 'OK'],
  ['C3 an invoiced lot gives a piece', INV_LOT, DRAW, 'lot_invoiced', 'OK'],
  ['C4 a piece of an invoiced lot is delivered', INV_LOT + PIECE('In Transit', true), `UPDATE orders SET status = 'Delivered' WHERE id = 9201;`, 'lot_invoiced', 'OK'],
  ['C5 a delivered piece of an invoiced lot steps back', INV_LOT + PIECE('Delivered', true), `UPDATE orders SET status = 'In Transit' WHERE id = 9201;`, 'lot_invoiced', 'OK'],
  ['C6 a loose piece of an invoiced lot is deleted', INV_LOT + PIECE('Pending', false), `UPDATE orders SET deleted_at = now() WHERE id = 9201;`, 'lot_invoiced', 'OK'],
  ['C7 an invoiced lot is received in the warehouse', INV_LOT, `UPDATE orders SET status = 'Delivered' WHERE id = 9101;`, 'lot_invoiced', 'OK'],
  ['C8 KEPT: an invoiced lot changes its price', INV_LOT, `UPDATE orders SET price = 3400 WHERE id = 9101;`, 'lot_invoiced', 'lot_invoiced'],
  ['C9 an invoiced closed lot is reopened', INV_LOT + CLOSED, `UPDATE stock_lots SET closed_note = NULL WHERE id = 9301;`, 'reopen_invoiced', 'OK'],
  ['C10 the close note of an invoiced lot is corrected', INV_LOT + CLOSED, `UPDATE stock_lots SET closed_note = 'TEST 2' WHERE id = 9301;`, 'lot_invoiced', 'OK'],
  ['C11 an invoiced lot with no pieces is unmarked', INV_LOT, `UPDATE stock_lots SET deleted_at = now() WHERE id = 9301;`, 'lot_invoiced', 'OK'],
  ['N1 an invoiced national order is marked as a lot', WH + NSRC(true), NLOT, 'lot_invoiced', 'OK'],
  ['N2 a national lot is invoiced before its pieces', WH + NSRC(false) + NLOT + NVLOT(false),
    `UPDATE national_orders SET invoiced = true, invoice_number = 'T-071a' WHERE id = 9401;`, 'invoice_incomplete', 'OK'],
  ['N3 an invoiced national lot gives a piece', WH + NSRC(true) + NLOT + NVLOT(true), NDRAW, 'lot_invoiced', 'OK'],
  ['N4 KEPT: an invoiced national lot changes its price', WH + NSRC(true) + NLOT + NVLOT(true),
    `UPDATE national_orders SET price = 600 WHERE id = 9401;`, 'lot_invoiced', 'lot_invoiced'],
  ['X1 UNCHANGED: a draw above the stock', WH + SRC_O(false) + LOT + VLOT(false)
    + `INSERT INTO stock_v_pieces (lot_id, piece_kind, piece_id, pallets) VALUES (9301, 'intl', 9999, 30);`, DRAW, 'over_draw', 'over_draw'],
  ['X2 UNCHANGED: a delivered piece is not deleted', WH + SRC_O(false) + LOT + VLOT(false) + PIECE('Delivered', true),
    `UPDATE orders SET deleted_at = now() WHERE id = 9201;`, 'piece_executed', 'piece_executed'],
];

test('on 057\'s guards (production today) every case meets its old refusal', async () => {
  const db = await db057();
  for (const fn of FNS) assert.strictEqual(await srcMd5(db, fn), LIVE_MD5[fn], `${fn} = the live text`);
  for (const [name, setup, action, before] of CASES) assert.strictEqual(await attempt(db, setup, action), before, name);
});

test('after the generated 071a: invoicing from registration passes; the price freeze and the other rules still refuse', async () => {
  const db = await db057();
  await db.exec(FILE('apply'));
  for (const fn of FNS) assert.strictEqual(await srcMd5(db, fn), md5(g[fn].next), fn);
  for (const [name, setup, action, , after] of CASES) assert.strictEqual(await attempt(db, setup, action), after, name);
  const s03 = await check(db, 'S-03'), b15 = await check(db, 'B-15');
  assert.deepStrictEqual([s03.enabled, s03.disabled_reason], [false, a.s03Reason], 'S-03 off, with its reason');
  assert.strictEqual(b15.m, md5(a.b15Sql), 'B-15 = tms-auditor/checks/B-15.sql');
  await assert.rejects(db.exec(FILE('apply')), /already holds the 071a text/, 'a second run refuses');
});

test('the dry run ends in its deliberate error and keeps nothing', async () => {
  const db = await db057();
  await assert.rejects(db.exec(FILE('dryrun')), /DRY RUN 071a finished - EVERYTHING UNDONE, nothing kept/);
  for (const fn of FNS) assert.strictEqual(await srcMd5(db, fn), LIVE_MD5[fn], fn);
  assert.strictEqual((await check(db, 'S-03')).enabled, true);
  assert.strictEqual((await check(db, 'B-15')).m, LIVE_B15_MD5);
});

test('071a refuses a guard that is not 057\'s text, and a B-54 out of step', async () => {
  const db = await db057();
  await db.exec(`CREATE OR REPLACE FUNCTION public.stock_guard_natl() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $f$ begin return new; end $f$;`);
  await assert.rejects(db.exec(FILE('apply')), /stock_guard_natl is not the 057 text read 22\/10/);
  const db2 = await db057();
  await db2.query(`UPDATE monitoring.checks SET red_value = red_value + 1 WHERE id = 'B-54'`);
  await assert.rejects(db2.exec(FILE('apply')), /B-54 red_value is not the live trigger count/);
});

test('the rollback gives 057\'s guards back byte for byte, and the old refusals with them', async () => {
  const db = await db057();
  await db.exec(FILE('apply'));
  await db.exec(FILE('rollback'));
  for (const fn of FNS) assert.strictEqual(await srcMd5(db, fn), LIVE_MD5[fn], fn);
  assert.strictEqual((await check(db, 'S-03')).enabled, true);
  assert.strictEqual((await check(db, 'B-15')).m, LIVE_B15_MD5);
  for (const [name, setup, action, before] of CASES) assert.strictEqual(await attempt(db, setup, action), before, `${name} (after the rollback)`);
  await assert.rejects(db.exec(FILE('rollback')), /is not the 071a text/, 'a second rollback refuses');
});

// B0 review #3 (owner 22/10/2026): no silent freeze. A lot invoiced while 071a was live and still incomplete
// would, under 057, have its pieces frozen until the invoice is undone. The rollback names such lots and
// refuses; the owner decides (undo the invoices, or accept the freeze by naming exactly those lots).
test('the rollback refuses while an invoiced lot is not complete, naming it; the owner can accept the freeze explicitly', async () => {
  const db = await db057();
  await db.exec(FILE('apply'));
  await db.exec('BEGIN');
  try {
    await db.exec(`SET LOCAL session_replication_role = replica;\n${INV_LOT}\nSET LOCAL session_replication_role = origin;`);
    await db.exec('SAVEPOINT s1');
    await assert.rejects(db.exec(FILE('rollback')), /071a ROLLBACK refused: 1 invoiced lot\(s\) not complete: recT071aLOT\b[\s\S]*owner/);
    await db.exec('ROLLBACK TO SAVEPOINT s1');
    for (const fn of FNS) assert.strictEqual(await srcMd5(db, fn), md5(g[fn].next), `${fn}: still 071a after the refusal`);
    // accepting a DIFFERENT list is no acceptance
    await db.exec(`SELECT set_config('tms.rollback_071a_accept_freeze', 'recOTHER', true)`);
    await assert.rejects(db.exec(FILE('rollback')), /071a ROLLBACK refused/);
    await db.exec('ROLLBACK TO SAVEPOINT s1');
    await db.exec(`SELECT set_config('tms.rollback_071a_accept_freeze', 'recT071aLOT', true)`);
    await db.exec(FILE('rollback'));
    for (const fn of FNS) assert.strictEqual(await srcMd5(db, fn), LIVE_MD5[fn], `${fn}: back to 057 once the owner accepted`);
  } finally { await db.exec('ROLLBACK'); }
});
