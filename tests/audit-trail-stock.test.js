// node --test tests/audit-trail-stock.test.js
// Stock lots Φ1 (impact map 4/10 AT-01): the audit trail names the new table and columns in Greek
// instead of «STOCK LOTS» / «stock_lot_id» / «closed_note». The two maps and their label functions
// are cut verbatim from modules/audit_trail.js and run in a vm.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const S = fs.readFileSync(path.join(__dirname, '..', 'modules', 'audit_trail.js'), 'utf8');
const cut = (re, name) => { const m = S.match(re); if (!m) throw new Error(name + ' not found'); return m[0]; };
const ctx = {};
vm.runInNewContext([
  cut(/const _AUDIT_FIELD = \{[\s\S]*?\n\};/, '_AUDIT_FIELD'),
  cut(/function _auditFieldLabel\(f\) \{[\s\S]*?\n\}/, '_auditFieldLabel'),
  cut(/const _AUDIT_TABLE = \{[\s\S]*?\n\};/, '_AUDIT_TABLE'),
  cut(/function _auditTableLabel\(t\) \{[\s\S]*?\n\}/, '_auditTableLabel'),
].join('\n') + '\nthis.f = _auditFieldLabel; this.t = _auditTableLabel;', ctx);

test('AT-01: stock lots table and columns read in Greek', () => {
  assert.strictEqual(ctx.t('stock_lots'), 'Παρτίδες αποθέματος');
  assert.strictEqual(ctx.f('stock_lot_id'), 'Παρτίδα αποθέματος');
  assert.strictEqual(ctx.f('closed_note'), 'Κλείσιμο υπολοίπου · αιτιολογία');
  // an unlisted column still shows raw (visible as unlabelled, never guessed)
  assert.strictEqual(ctx.f('some_new_column'), 'some_new_column');
});

// F4α T9 (F2 note 4): 072 writes ONE audit_log row per creation request (plan_h_remember: table plan_request,
// record_id = the request uuid, after_data {op, request_id, body_md5, answer}). The trail labels it «Κωδικός
// αιτήματος» with its op as the handle — never raw JSON, never «PLAN REQUEST» — and names the five v5 tables of 071.
// The row renderer and its maps are cut verbatim from modules/audit_trail.js; the time and escaping helpers are stubs.
const row = {};
vm.runInNewContext([
  cut(/const _AUDIT_ACTION = \{[\s\S]*?\n\};/, '_AUDIT_ACTION'),
  cut(/const _AUDIT_TABLE = \{[\s\S]*?\n\};/, '_AUDIT_TABLE'),
  cut(/function _auditTableLabel\(t\) \{[\s\S]*?\n\}/, '_auditTableLabel'),
  cut(/const _AUDIT_LABEL_KEYS = [^\n]*\n/, '_AUDIT_LABEL_KEYS'),
  cut(/function _auditRecordLabel\(e\) \{[\s\S]*?\n\}/, '_auditRecordLabel'),
  cut(/function _auditChangeHtml\(e\) \{[\s\S]*?\n\}/, '_auditChangeHtml'),
  cut(/function _auditRow\(e\) \{[\s\S]*?\n\}/, '_auditRow'),
  "const _AUDIT_ROLE = {}; function _auditWhen() { return { short: '26/10 10:00', full: '26/10/2026 10:00' }; }",
  "function _auditEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;'); }",
  'this.row = _auditRow; this.t = _auditTableLabel;',
].join('\n'), row);
const RID = 'aaaaaaaa-0000-4000-8000-000000000001';
const PLAN_REQUEST = { action: 'create', table_name: 'plan_request', record_id: RID, actor: 'demo_dispatcher', role: 'dispatcher',
  created_at: '2026-10-26T10:00:00Z', _after: { op: 'plan_orders_create', request_id: RID, body_md5: 'f'.repeat(32),
    answer: { ok: true, op: 'plan_orders_create', dry_run: false, ids: { nat_order_ids: [7] }, warnings: [], notice_ids: [] } } };

test('F4α-T9: a plan_request row shows «Κωδικός αιτήματος» and its op, never raw JSON or «PLAN REQUEST»', () => {
  const html = row.row(PLAN_REQUEST);
  assert.ok(!html.includes('PLAN REQUEST'), 'the raw table name is on screen: ' + html);
  assert.ok(html.includes('<td class="at-table-name">Κωδικός αιτήματος</td>'), html);
  assert.ok(html.includes('<span class="at-rec-label">plan_orders_create</span>'), 'the op must be the record handle: ' + html);
  assert.ok(!/\{&quot;|\{"|body_md5|nat_order_ids/.test(html), 'raw JSON of after_data on screen: ' + html);
  assert.ok(html.includes('Νέα εγγραφή'));
});

test('F4α-T9: the five v5 tables have Greek labels', () => {
  const want = { shipments: 'Αποστολές εθνικών', shipment_pieces: 'Κομμάτια αποστολών', piece_legs: 'Σκέλη κομματιών', rt_stops: 'Στάσεις κύκλων', plan_notices: 'Ειδοποιήσεις εθνικών' };
  for (const [t, label] of Object.entries(want)) assert.strictEqual(row.t(t), label, t);
  assert.strictEqual(row.t('plan_request'), 'Κωδικός αιτήματος');
  assert.strictEqual(row.t('some_new_table'), 'SOME NEW TABLE', 'an unlisted table still shows raw (visible as unlabelled)');
});
