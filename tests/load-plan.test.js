// tests/load-plan.test.js — run: node --test tests/load-plan.test.js
// core/load-plan.js (17/11/2026): capacity of the reefer box by pallet type and the row layout the panel draws.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const LP = require('../core/load-plan.js');

const shape = p => p.rows.map(r => r.k).join('');
const pallets = p => p.rows.reduce((a, r) => a + r.n, 0);

test('capacity: euro only 33, industrial only 26, the owner\'s 20 EUR + 4 Industrial → 32', () => {
  assert.strictEqual(LP.capacity({ eur: 33 }), 33);
  assert.strictEqual(LP.capacity({ ind: 26 }), 26);
  assert.strictEqual(LP.capacity({ eur: 20, ind: 4 }), 32);
  assert.strictEqual(LP.euroFill(112), 28, '11.2 m = 8 knife + 2 double');
});

test('an odd industrial takes a flat euro beside it («δόντι»): 28 EUR + 1 IND fits 32', () => {
  const p = LP.plan({ eur: 28, ind: 1 });
  assert.strictEqual(p.cap, 32);
  assert.strictEqual(p.over, 0);
  assert.strictEqual(shape(p)[0], 'X', 'the shared row opens the load, industrials at the front');
  assert.strictEqual(pallets(p), 29);
});

test('29 EUR → D S D S D S D + 6 knife, spread to 12.8 m, not to the doors (owner 17/11)', () => {
  const p = LP.plan({ eur: 29 });
  assert.strictEqual(shape(p), 'DSDSDSDKKKKKK');
  assert.strictEqual(p.used, 128);
});

test('32 EUR goes without a single, 31 takes them (owner 17/11)', () => {
  assert.ok(!shape(LP.plan({ eur: 32 })).includes('S'));
  assert.ok(shape(LP.plan({ eur: 31 })).includes('S'));
  assert.strictEqual(shape(LP.plan({ eur: 33 })), 'K'.repeat(11));
});

test('every euro count 2–33: all pallets placed, fits the box, singles only in a D S … D front block, never last', () => {
  for (let e = 2; e <= 33; e++) {
    const p = LP.plan({ eur: e });
    const s = shape(p);
    assert.strictEqual(pallets(p), e, `${e}: every pallet placed`);
    assert.ok(p.used <= LP.BOX, `${e}: within 13.2 m`);
    assert.strictEqual(p.over, 0, `${e}: fits`);
    assert.ok(!s.endsWith('S'), `${e}: never ends with a single`);
    if (s.includes('S')) {
      assert.match(s, /^(DS)+D[DK]*$/, `${e}: ${s}`);
      assert.ok(p.used <= 128, `${e}: singles spread to 12.8 m at most`);
    } else assert.match(s, /^D*K*$/, `${e}: ${s}`);
    const singles = (s.match(/S/g) || []).length;
    assert.ok(e + singles <= Math.max(32, e), `${e}: euro + singles ≤ 32`);
  }
});

test('a single in the last row stands at the wall; one earlier stays in the middle (owner 17/11)', () => {
  assert.strictEqual(shape(LP.plan({ eur: 1 })), 'S');
  assert.ok(LP.svg(LP.plan({ eur: 1 }), { scale: 1 }).includes('class="lp-e lp-s" x="0.0" y="14.0"'), 'last single at the wall');
  const mixed = LP.plan({ eur: 1, ind: 4 });
  assert.strictEqual(shape(mixed), 'IIS');
  assert.ok(mixed.rows[2].wall);
  const p = LP.plan({ eur: 11 });
  assert.ok(p.rows.filter(r => r.k === 'S').every(r => !r.wall), 'singles of the D S … D block stay in the middle');
  assert.ok(LP.svg(p, { scale: 1 }).includes('class="lp-e lp-s" x="8.0" y="20.0"'));
});

test('industrials only: pairs, singles at the front when few, a lone one against the wall', () => {
  assert.deepStrictEqual(LP.plan({ ind: 26 }).rows.map(r => r.n), Array(13).fill(2));
  assert.deepStrictEqual(LP.plan({ ind: 8 }).rows.map(r => r.n), [2, 1, 2, 1, 2]);
  assert.strictEqual(pallets(LP.plan({ ind: 25 })), 25);
  // the drawing puts a lone industrial at the wall (its rect starts at the top edge), never centred across the box
  const svg = LP.svg(LP.plan({ ind: 3 }), { scale: 1 });
  const ys = [...svg.matchAll(/class="lp-i" x="[\d.]+" y="([\d.]+)"/g)].map(m => Number(m[1]));
  assert.deepStrictEqual(ys, [14, 26, 14]);
});

test('mixed loads: industrials at the front by the cab, the free room at the back (owner 17/11)', () => {
  const p = LP.plan({ eur: 20, ind: 4 });
  assert.strictEqual(shape(p), 'IIDSDSDSDSDSDSD');
  assert.strictEqual(pallets(p), 24);
  assert.ok(p.used < LP.BOX, 'room left at the back');
});

test('after the «δόντι» the euro go as staggered doubles, no gap between rows (owner 17/11)', () => {
  const p = LP.plan({ eur: 6, ind: 3 });
  assert.strictEqual(shape(p), 'IXDDS');
  assert.ok(p.rows.filter(r => r.k === 'D').every(r => r.stag === 2));
  assert.ok(p.rows[4].wall, 'the odd euro left closes the load at the wall');
  const svg = LP.svg(p, { scale: 1 });
  // X row 10–20 dm: flat euro flush at 10; the next double's euro side starts at 18 (= 10 + 8), the other side at 20
  assert.ok(svg.includes('class="lp-e" x="10.0" y="26.0"'), 'flat euro flush to the row in front');
  assert.ok(svg.includes('class="lp-e" x="20.0" y="14.0"') && svg.includes('class="lp-e" x="18.0" y="26.0"'), 'staggered double');
  assert.ok(!/K|DS|SD/.test(shape(LP.plan({ eur: 28, ind: 1 })).slice(1, -1)), 'no knife or single inside the staggered part');
});

test('over capacity: a warning count, the box drawn full', () => {
  const p = LP.plan({ eur: 30, ind: 4 });
  assert.strictEqual(p.cap, 32);
  assert.strictEqual(p.over, 2);
  assert.strictEqual(pallets(p), 32);
  assert.ok(p.used <= LP.BOX);
  assert.strictEqual(LP.plan({ ind: 28 }).over, 2);
});

test('pallet type: Industrial is industrial; EUR, CHEP and empty are euro', () => {
  assert.ok(LP.isInd('Industrial'));
  assert.ok(!LP.isInd('EUR') && !LP.isInd('CHEP') && !LP.isInd(''));
});

test('code review: an odd euro after the «δόντι» stays inside the box, on the euro side', () => {
  for (let i = 1; i <= 25; i += 2) for (let e = 1; e <= 33; e++) {
    const p = LP.plan({ eur: e, ind: i });
    assert.ok(p.used <= LP.BOX, `${e} EUR + ${i} IND: used ${p.used}`);
    assert.strictEqual(pallets(p), Math.min(p.total, p.cap), `${e} EUR + ${i} IND: every fitting pallet drawn`);
  }
  assert.ok(LP.svg(LP.plan({ eur: 26, ind: 5 }), { scale: 1 }).includes('class="lp-e lp-s" x="124.0" y="26.0"'));
});

test('code review: industrials only never spread to the doors with singles', () => {
  for (let i = 1; i <= 26; i++) {
    const p = LP.plan({ ind: i });
    assert.strictEqual(pallets(p), i);
    if (p.rows.some(r => r.n === 1) && i < 25) assert.ok(p.used <= 120, `${i}: ${p.used}`);
  }
});

test('industrials only: singles up to 20, pairs only from 21 (owner 17/11)', () => {
  assert.ok(LP.plan({ ind: 20 }).rows.some(r => r.n === 1));
  assert.deepStrictEqual(LP.plan({ ind: 21 }).rows.map(r => r.n), [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1]);
  assert.deepStrictEqual(LP.plan({ ind: 24 }).rows.map(r => r.n), Array(12).fill(2));
});
