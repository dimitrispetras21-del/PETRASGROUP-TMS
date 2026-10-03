// Order number labels (owner 27/9: «αριθμός παραγγελίας πολύ σημαντικός και
// για εθνικών»). The national number arrives only after view 054 + the Worker
// deploy; until then the field is ABSENT and every screen says «—» — never the
// record id. This runs the REAL OrdersCommon.numLabel (no copy), so the front
// end is safe to ship before the backend (3/10).
const test = require('node:test');
const assert = require('node:assert');
const { OrdersCommon } = require('../core/orders-common.js');

test('national: «Ε-n» when the Worker sends Order No, «—» before 054 + deploy', () => {
  assert.strictEqual(OrdersCommon.numLabel({ _type: 'natl', id: 'recAbc123456789A', fields: { 'Order No': 427 } }), 'Ε-427');
  assert.strictEqual(OrdersCommon.numLabel({ _type: 'natl', id: 'recAbc123456789A', fields: {} }), '—');
});

test('international keeps «#n»; the two «427»s stay apart by prefix', () => {
  assert.strictEqual(OrdersCommon.numLabel({ _type: 'intl', fields: { 'Order No': 427 } }), '#427');
  assert.notStrictEqual(OrdersCommon.numLabel({ _type: 'intl', fields: { 'Order No': 427 } }),
    OrdersCommon.numLabel({ _type: 'natl', fields: { 'Order No': 427 } }));
});

test('no number never falls back to the record id', () => {
  const out = OrdersCommon.numLabel({ _type: 'natl', id: 'recXYZ987654321Q', fields: { Reference: 'ΠΑΡ 1' } });
  assert.ok(!/rec|XYZ|321Q/.test(out), out);
});
