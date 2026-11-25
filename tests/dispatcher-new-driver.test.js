// Dispatcher creates a driver (owner 25/11, usability test): CREATE only, nothing wider.
// Holds the three sides to each other, from the source files:
//  1. Worker RBAC: dispatcher drivers = GET+POST; no PATCH/DELETE; trucks/trailers/workshops unchanged (GET).
//  2. Every field a create sends (the Drivers page form and the «Ανάθεση» shortcut) is a key of the DRIVERS
//     map of the Worker's TABLES — an unknown label is dropped with a 200 (facade trap 1).
//  3. Front end: canCreateEntity('drivers') is true for dispatcher, the edit gate ('full') stays false.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const W = fs.readFileSync(path.join(ROOT, 'worker', 'src', 'index.js'), 'utf8');
const ENT = fs.readFileSync(path.join(ROOT, 'core', 'entity.js'), 'utf8');
const ASG = fs.readFileSync(path.join(ROOT, 'modules', 'wn5_assign.js'), 'utf8');

// PERMISSIONS + can(), verbatim from the Worker source, run in a vm
const permSrc = (W.match(/var PERMISSIONS = \{[\s\S]*?\n__name\(can, "can"\);/) || [''])[0];
const wctx = { __name: () => {} };
if (permSrc) vm.runInNewContext(permSrc + '\nthis.can = can; this.P = PERMISSIONS;', wctx);

// the DRIVERS block of TABLES
const drvSrc = (W.match(/tbl7UGmYhc2Y82pPs: \{\n    name: "DRIVERS",[\s\S]*?\n  \},\n/) || [''])[0];
const DRIVERS = drvSrc ? vm.runInNewContext('(' + drvSrc.replace(/^tbl7UGmYhc2Y82pPs: /, '').replace(/,\n$/, '') + ')') : null;

test('sources found', () => {
  assert.ok(permSrc, 'PERMISSIONS / can() in worker/src/index.js');
  assert.ok(DRIVERS && DRIVERS.pg === 'drivers', 'DRIVERS map in TABLES');
});

test('Worker: dispatcher may GET and POST drivers, never PATCH or DELETE', () => {
  const { can } = wctx;
  assert.strictEqual(can('dispatcher', 'drivers', 'GET'), true);
  assert.strictEqual(can('dispatcher', 'drivers', 'POST'), true);
  assert.strictEqual(can('dispatcher', 'drivers', 'PATCH'), false);
  assert.strictEqual(can('dispatcher', 'drivers', 'DELETE'), false);
});

test('Worker: nothing else of the dispatcher area widens (trucks, trailers, workshops stay GET)', () => {
  for (const t of ['trucks', 'trailers', 'workshops']) {
    assert.deepStrictEqual([...wctx.P.dispatcher[t]], ['GET'], t);
  }
  // warehouse still has no drivers row and no wildcard
  assert.strictEqual(wctx.can('warehouse', 'drivers', 'POST'), false);
  assert.strictEqual(wctx.can('warehouse', 'drivers', 'GET'), false);
});

test('Drivers page form: every field it sends is in the DRIVERS map', () => {
  const at = ENT.indexOf("formTitles: ['Νέος οδηγός'");
  const s = ENT.indexOf('formFields: [', at);
  const ff = ENT.slice(s, ENT.indexOf('\n    ],', s));
  // one entry per `{ f: '…'` up to the next entry; disabled ones are never sent (saveEntityRecord)
  const parts = ff.split(/(?=\{ f: ')/).filter((p) => p.startsWith("{ f: '"));
  const sent = parts.filter((p) => !/disabled: true/.test(p)).map((p) => p.match(/^\{ f: '([^']+)'/)[1]);
  assert.deepStrictEqual(sent.sort(), ['Full Name', 'License Expiry', 'License Number', 'Phone', 'Type']);
  for (const f of sent) assert.ok(DRIVERS.fields[f], `«${f}» is not in the DRIVERS map — the Worker would drop it with a 200`);
  assert.ok(!DRIVERS.fields['Salary Base'], 'Salary Base is not a column: it must stay a disabled field');
});

test('«Ανάθεση» shortcut: the POST body keys are in the DRIVERS map', () => {
  // the form calls core/entity.js (the v5 modules never write the facade themselves)
  assert.match(ASG, /await createDriverQuick\(name, type\)/);
  const m = ENT.match(/atCreate\(TABLES\.DRIVERS, \{([^}]*)\}\)/);
  assert.ok(m, 'atCreate(TABLES.DRIVERS, {...}) in core/entity.js createDriverQuick');
  const keys = [...m[1].matchAll(/(?:'([^']+)'|(\w+)):/g)].map((x) => x[1] || x[2]);
  assert.deepStrictEqual(keys, ['Full Name', 'Type']);
  for (const k of keys) assert.ok(DRIVERS.fields[k], k);
  // the type values the two buttons send are the ones the Drivers page stores
  assert.ok(/data-newdr="Internal"/.test(ASG) && /data-newdr="External"/.test(ASG));
});

// canCreateEntity verbatim, against a stub ENTITY_CONFIG / PERMS
function canCreateFor(role, perm) {
  const fn = (ENT.match(/function canCreateEntity\(entityKey\) \{[\s\S]*?\n\}\n/) || [''])[0];
  assert.ok(fn, 'canCreateEntity in core/entity.js');
  const cr = (ENT.match(/createRoles: (\[[^\]]*\])/) || [])[1];
  const ctx = { ROLE: role, can: () => perm, ENTITY_CONFIG: { drivers: { perm: 'drivers', createRoles: vm.runInNewContext(cr) } } };
  vm.runInNewContext(fn + '\nthis.r = canCreateEntity("drivers");', ctx);
  return ctx.r;
}

test('front end: create opens for dispatcher (view), for full roles; not for warehouse or another view role', () => {
  assert.strictEqual(canCreateFor('dispatcher', 'view'), true);
  assert.strictEqual(canCreateFor('owner', 'full'), true);
  assert.strictEqual(canCreateFor('warehouse', 'none'), false);
  assert.strictEqual(canCreateFor('somefuture', 'view'), false);
});

test('front end: config.js keeps dispatcher drivers:view (edit stays closed)', () => {
  const cfg = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
  assert.match(cfg, /dispatcher: \{[^\n]*drivers:'view'/);
  // the row pencil is behind 'full', like the card ✎ (canEdit)
  assert.match(ENT, /can\(cfg\.perm\) === 'full' \? `<button type="button" class="btn-icon" aria-label="Επεξεργασία"/);
});
