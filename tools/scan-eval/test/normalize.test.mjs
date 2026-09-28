import test from 'node:test';
import assert from 'node:assert/strict';
import { normDate, normNumber, normRef, normCountry, normPalletType, normDirection, goodsMatch, normConfidence, normId } from '../lib/normalize.mjs';

test('normDate: document formats → ISO, garbage → null', () => {
  assert.equal(normDate('2031-01-05'), '2031-01-05');
  assert.equal(normDate('2031-01-05T13:00:00Z'), '2031-01-05');
  assert.equal(normDate('05.01.2031'), '2031-01-05');
  assert.equal(normDate('5/1/2031'), '2031-01-05');
  assert.equal(normDate('05-01-31'), '2031-01-05');
  assert.equal(normDate('Friday 18/09'), null);
  assert.equal(normDate('32.01.2031'), null);
  assert.equal(normDate(null), null);
});

test('normNumber: European separators', () => {
  assert.equal(normNumber('22.500kg'), 22500);
  assert.equal(normNumber('3.723,00 EUR'), 3723);
  assert.equal(normNumber('2 200,00'), 2200);
  assert.equal(normNumber('21,000'), 21000);
  assert.equal(normNumber('1,5'), 1.5);
  assert.equal(normNumber('-18C'), -18);
  assert.equal(normNumber(1300), 1300);
  assert.equal(normNumber('n/a'), null);
});

test('normRef keeps leading zeros, drops separators and case', () => {
  assert.equal(normRef('syn 0001'), normRef('SYN-0001'));
  assert.notEqual(normRef('0123'), normRef('123'));
  assert.equal(normRef(''), null);
});

test('country, pallet type, direction, id', () => {
  assert.equal(normCountry('Germany'), 'DE');
  assert.equal(normCountry('Ελλάδα'), 'GR');
  assert.equal(normCountry('gr'), 'GR');
  assert.equal(normPalletType('EP'), 'EUR');
  assert.equal(normPalletType('Euro pallet'), 'EUR');
  assert.equal(normDirection('EXPORT'), 'Export');
  assert.equal(normId(['recA']), 'recA');
  assert.equal(normId([]), null);
});

test('goodsMatch is lenient on extra words, strict on different goods', () => {
  assert.equal(goodsMatch('Deep frozen meat', 'frozen meat'), true);
  assert.equal(goodsMatch('Grapes', 'Damsons'), false);
  assert.equal(goodsMatch('', 'x'), null);
});

test('normConfidence', () => {
  assert.equal(normConfidence('HIGH'), 0.9);
  assert.equal(normConfidence(1.4), 1);
  assert.equal(normConfidence('?'), null);
});
