// tests/intl-scan-hours.test.js — run: node --test tests/intl-scan-hours.test.js
// The stop time a scan reads goes to the new form's hours (modules/orders_intl.js _scanOpen, `hrs`).
// Owner 9/11: a lone time is an appointment, from = to («08:00» → 08:00–08:00). A word that says a deadline keeps
// «to» only; a word that says «from» keeps «from» only. The function is local to _scanOpen, so the test cuts its
// source out of the module (with _oiHm and _OI_HM_RE) and runs it as it is: a change there is what this test sees.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'orders_intl.js'), 'utf8');
function cut(startRe, endMark) {
  const i = src.search(startRe);
  assert.ok(i >= 0, 'not found in orders_intl.js: ' + startRe);
  const j = src.indexOf(endMark, i);
  assert.ok(j > i, 'end not found after ' + startRe);
  return src.slice(i, j + endMark.length);
}
const re = cut(/const _OI_HM_RE = /, ';\n');
const hm = cut(/function _oiHm\(v\) \{/, '\n}\n');
const hrsSrc = cut(/const hrs = s => \{/, '\n  };');
const F = { STOP_TIME_FROM: 'Time From', STOP_TIME_TO: 'Time To' };
// eslint-disable-next-line no-new-func
const hrs = new Function('F', `${re}\n${hm}\n${hrsSrc}\nreturn hrs;`)(F);
const at = (time) => { const o = hrs({ time }); return [o['Time From'], o['Time To']]; };

test('two times = from–to', () => {
  assert.deepStrictEqual(at('07:00-11:30'), ['07:00', '11:30']);
  assert.deepStrictEqual(at('0700-1100'), ['07:00', '11:00']);
});
test('a lone time = an appointment, from = to (owner 9/11)', () => {
  assert.deepStrictEqual(at('08:00'), ['08:00', '08:00']);
  assert.deepStrictEqual(at('6.00'), ['06:00', '06:00']);
  assert.deepStrictEqual(at('slot 07:00'), ['07:00', '07:00']);
});
test('a deadline word keeps «to» only', () => {
  assert.deepStrictEqual(at('bis 1530'), [null, '15:30']);
  assert.deepStrictEqual(at('until 10:00'), [null, '10:00']);
  assert.deepStrictEqual(at('έως 10:00'), [null, '10:00']);
});
test('a «from» word keeps «from» only, never an appointment', () => {
  assert.deepStrictEqual(at('ab 08:00'), ['08:00', null]);
  assert.deepStrictEqual(at('from 8:00'), ['08:00', null]);
  assert.deepStrictEqual(at('από 08:00'), ['08:00', null]);
  assert.deepStrictEqual(at('nach 09.00'), ['09:00', null]);
});
test('no time = nothing', () => {
  assert.deepStrictEqual(at(''), [null, null]);
  assert.deepStrictEqual(at('morning'), [null, null]);
});
