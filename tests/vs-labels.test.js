// tests/vs-labels.test.js — run: node --test tests/vs-labels.test.js
// Every label the ONE Veroia day path (WP-A: _syncVeroiaSwitch, the form's
// cross-dock, Daily Ops «Σε μεταφορά», core/vs-dates.js) writes or reads must
// be in the Worker's TABLES map FOR THAT TABLE — facade trap 1: an unknown
// label is dropped with 200 OK on a write and is simply absent on a read
// (CLAUDE.md «Οι τρεις μηχανισμοί-παγίδες»). Read from the repo's Worker
// source (the deploy source, kept equal to production by rule 1 of 4/10).
// The map is evaluated, not grepped: one-word keys are unquoted
// (`Country: "country"`), so a grep for '"Price"' says «missing» falsely.
// The Weekly National v4 board's own labels are WP7's (tests/wn4-labels.test.js).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '../worker/src/index.js'), 'utf8');
// The literal starting at the first '{' after `from` (strings/comments skipped).
function literal(from) {
  const j = SRC.indexOf('{', from);
  let d = 0, q = null, k = j;
  for (; k < SRC.length; k++) {
    const c = SRC[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && SRC[k + 1] === '/') { k = SRC.indexOf('\n', k); continue; }
    if (c === '/' && SRC[k + 1] === '*') { k = SRC.indexOf('*/', k) + 1; continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) break;
  }
  return SRC.slice(j, k + 1);
}
const at = SRC.indexOf('var TABLES = {');
assert.ok(at >= 0, 'var TABLES not found in worker/src/index.js');
const TABLES = vm.runInNewContext('(' + literal(at) + ')', {});
// The Worker's OWN read-label function, run on the map (not a re-implementation):
// a column with two labels answers with the LAST one.
const ctlAt = SRC.indexOf('function columnToLabel(cfg)');
assert.ok(ctlAt >= 0, 'function columnToLabel not found');
const columnToLabel = vm.runInNewContext('(function columnToLabel(cfg)' + '{' + literal(ctlAt).slice(1) + ')', {});

const ORDERS = 'tblgHlNmLBH3JTdIM', NAT_LOADS = 'tblVW42cZnfC47gTb', ORDER_STOPS = 'tblaeY5QOHAS1gyE8';
// Where a label lives in a table's config: fields / computed (read) / aliases
// (write + filter) / links / reverseLinks.
const where = (tid, label) => ['fields', 'computed', 'aliases', 'links', 'reverseLinks']
  .filter((k) => TABLES[tid][k] && Object.prototype.hasOwnProperty.call(TABLES[tid][k], label));

test('the three tables are the ones the front end calls them', () => {
  assert.strictEqual(TABLES[ORDERS].name, 'ORDERS');
  assert.strictEqual(TABLES[NAT_LOADS].name, 'NATIONAL LOADS');
  assert.strictEqual(TABLES[ORDER_STOPS].name, 'ORDER STOPS');
});

test('cross-dock: BOTH labels write cross_dock_date on ORDERS', () => {
  assert.strictEqual(TABLES[ORDERS].fields['Cross-dock Date'], 'cross_dock_date');
  assert.strictEqual(TABLES[ORDERS].fields['VS CD Date'], 'cross_dock_date');
});
test('cross-dock: a READ answers it ONLY as «VS CD Date» (why VsDates.cdOf exists) — a reorder of the map fails here, not on screen', () => {
  assert.strictEqual(columnToLabel(TABLES[ORDERS]).cross_dock_date, 'VS CD Date');
});

test('Pallet Exchange (owner Ε3): a field on ORDERS and on NATIONAL LOADS', () => {
  assert.strictEqual(TABLES[ORDERS].fields['Pallet Exchange'], 'pallet_exchange');
  assert.strictEqual(TABLES[NAT_LOADS].fields['Pallet Exchange'], 'pallet_exchange');
  assert.strictEqual(columnToLabel(TABLES[NAT_LOADS]).pallet_exchange, 'Pallet Exchange', 'the national board reads it back under the same label');
});

// What the VS sync reads from the order (atGetOne, all fields — so each must
// come back under the label the code reads).
const ORDER_READS = ['Veroia Switch', 'Direction', 'Type', 'National Groupage', 'Loading DateTime', 'Delivery DateTime',
  'Client', 'Goods', 'Temperature °C', 'Reference', 'Pallet Exchange', 'VS CD Date', 'Total Pallets', 'ORDER STOPS'];
test('ORDERS: every label the VS sync reads is served under that label', () => {
  const readable = new Set(Object.values(columnToLabel(TABLES[ORDERS])).concat(Object.keys(TABLES[ORDERS].links || {}), Object.keys(TABLES[ORDERS].reverseLinks || {})));
  assert.deepStrictEqual(ORDER_READS.filter((l) => !readable.has(l)), []);
});
test('ORDERS: every label WP-A writes (form cross-dock, Daily Ops stamp, the sync\'s flag) is writable', () => {
  for (const l of ['Cross-dock Date', 'VS CD Date', 'National Order Created']) assert.deepStrictEqual(where(ORDERS, l), ['fields'], l);
});

// What the sync writes on the national load (nlFields + the locations), and
// the filter it finds the load with.
const NL_WRITES = ['Name', 'Direction', 'Source Type', 'Source Orders', 'Client', 'Goods', 'Temperature C', 'Total Pallets',
  'Pallet Exchange', 'Reference', 'Loading DateTime', 'Delivery DateTime', 'Status'];
test('NATIONAL LOADS: every field the sync writes is in the map', () => {
  assert.deepStrictEqual(NL_WRITES.filter((l) => !where(NAT_LOADS, l).includes('fields')), []);
  for (let i = 1; i <= 10; i++) {
    assert.deepStrictEqual(where(NAT_LOADS, 'Pickup Location ' + i), ['links']);
    assert.deepStrictEqual(where(NAT_LOADS, 'Delivery Location ' + i), ['links']);
  }
});
test('NATIONAL LOADS: «Source Record» (write + filter) is the alias that also sets the Source Order link', () => {
  assert.deepStrictEqual(where(NAT_LOADS, 'Source Record'), ['aliases']);
  assert.strictEqual(TABLES[NAT_LOADS].linkAliases['Source Record'], 'Source Order');
  assert.deepStrictEqual(where(NAT_LOADS, 'ORDER STOPS'), ['reverseLinks']);
});

// The national stops: written by stopsSave, and read by the sync to keep the
// national drop order (FIND on «Parent Nat Load» needs a links entry).
test('ORDER STOPS: the national stop labels and the «Parent Nat Load» link the drop-order read filters on', () => {
  for (const l of ['Stop Type', 'Stop Number', 'DateTime', 'Pallets', 'Temperature', 'Reference', 'Goods', 'Stop Label'])
    assert.deepStrictEqual(where(ORDER_STOPS, l), ['fields'], l);
  for (const l of ['Parent Nat Load', 'Parent Order', 'Location', 'Client at Stop'])
    assert.deepStrictEqual(where(ORDER_STOPS, l), ['links'], l);
  assert.strictEqual(TABLES[ORDER_STOPS].links['Parent Nat Load'].column, 'national_load_id');
});
