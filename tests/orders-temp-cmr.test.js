// «Κατά CMR» (owner 7/10, Παντελής): an international order may say its
// temperature is the one on the CMR instead of a number ('Temp Per CMR', 065).
// Every screen then shows «CMR» — never an empty cell or a 0 that reads as «no
// reefer» — and the paper/WhatsApp say «όπως γράφει το CMR». The app's rule is
// OrdersCommon.tempText; print.html (no core JS) carries ordTemp. This runs
// BOTH real functions (no copies) and keeps them deciding the same.
// run: node --test tests/orders-temp-cmr.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { OrdersCommon } = require('../core/orders-common.js');

test('tempText: «CMR» when Temp Per CMR, whatever number is left on the row', () => {
  assert.strictEqual(OrdersCommon.tempText({ 'Temp Per CMR': true }), 'CMR');
  assert.strictEqual(OrdersCommon.tempText({ 'Temp Per CMR': true, 'Temperature °C': 2 }), 'CMR');
  assert.strictEqual(OrdersCommon.tempText({ 'Temp Per CMR': true, 'Temperature °C': 0 }), 'CMR');
});

test('tempText: a numbered order reads exactly as before (0 is a temperature, empty is none)', () => {
  assert.strictEqual(OrdersCommon.tempText({ 'Temperature °C': 2 }), '2 °C');
  assert.strictEqual(OrdersCommon.tempText({ 'Temp Per CMR': false, 'Temperature °C': -18 }), '-18 °C');
  assert.strictEqual(OrdersCommon.tempText({ 'Temperature °C': 0 }), '0 °C');
  assert.strictEqual(OrdersCommon.tempText({ 'Temperature °C': '' }), '');
  assert.strictEqual(OrdersCommon.tempText({}), '');
  assert.strictEqual(OrdersCommon.tempText(null), '');
  // Absent label = a Worker that does not map it yet: a numbered order, as before.
  assert.strictEqual(OrdersCommon.tempText({ 'Temperature °C': 4 }), OrdersCommon.tempText({ 'Temp Per CMR': false, 'Temperature °C': 4 }));
  // Only a real true counts — a stray string must not hide a number.
  assert.strictEqual(OrdersCommon.tempText({ 'Temp Per CMR': 'false', 'Temperature °C': 4 }), '4 °C');
});

function printFns() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'print.html'), 'utf8');
  const grab = re => { const m = html.match(re); assert.ok(m, 'found in print.html: ' + re); return m[0]; };
  const src = [
    grab(/var LBL=null;/),
    grab(/var LBL_EN=\{[\s\S]*?\};/),
    grab(/var LBL_GR=\{[\s\S]*?\};/),
    grab(/function tempPerCmr\(f\)\{[^\n]*\}/),
    grab(/function ordTemp\(f,sf\)\{[\s\S]*?\n\}/),
  ].join('\n');
  const ctx = {};
  vm.runInNewContext(src + '\nthis.ordTemp=ordTemp;this.LBL_EN=LBL_EN;this.LBL_GR=LBL_GR;this.setL=function(l){LBL=l;};', ctx);
  return ctx;
}

test('print.html ordTemp: the CMR wording per sheet language, never a number next to it', () => {
  const P = printFns();
  assert.strictEqual(P.LBL_GR.tempCmr, 'όπως γράφει το CMR');
  assert.strictEqual(P.LBL_EN.tempCmr, 'as stated on the CMR');
  assert.strictEqual(P.LBL_GR.keepCmr, 'Τήρησε τη θερμοκρασία που γράφει το CMR.');
  assert.strictEqual(P.LBL_EN.keepCmr, 'Keep the temperature stated on the CMR.');
  P.setL(P.LBL_GR);
  // the flag wins over the order's number AND a stop's own number
  assert.strictEqual(P.ordTemp({ 'Temp Per CMR': true, 'Temperature °C': 2 }, { Temperature: 5 }), 'όπως γράφει το CMR');
  P.setL(P.LBL_EN);
  assert.strictEqual(P.ordTemp({ 'Temp Per CMR': true }), 'as stated on the CMR');
  // numbered: the stop's own figure first, then the order's — as before
  assert.strictEqual(P.ordTemp({ 'Temperature °C': 2 }, { Temperature: 5 }), '5°C');
  assert.strictEqual(P.ordTemp({ 'Temperature °C': 2 }, {}), '2°C');
  assert.strictEqual(P.ordTemp({ 'Temperature °C': 0 }), '0°C');
  assert.strictEqual(P.ordTemp({}), '');
});

test('print.html and the app decide the same for every shape', () => {
  const P = printFns();
  P.setL(P.LBL_GR);
  const shapes = [{}, { 'Temperature °C': 2 }, { 'Temperature °C': 0 }, { 'Temperature °C': '' }, { 'Temp Per CMR': false, 'Temperature °C': 3 },
    { 'Temp Per CMR': true }, { 'Temp Per CMR': true, 'Temperature °C': 7 }, { 'Temp Per CMR': 'true', 'Temperature °C': 1 }];
  for (const f of shapes) {
    const app = OrdersCommon.tempText(f), paper = P.ordTemp(f);
    if (app === 'CMR') assert.strictEqual(paper, P.LBL_GR.tempCmr, JSON.stringify(f));
    else assert.strictEqual(paper, app.replace(' °C', '°C'), JSON.stringify(f));
  }
});
