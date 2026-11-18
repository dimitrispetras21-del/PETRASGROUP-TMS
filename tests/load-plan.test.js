// tests/load-plan.test.js — run: node --test tests/load-plan.test.js
// core/load-plan.js (17/11/2026): capacity of the reefer box by pallet type and the row layout the panel draws.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const LP = require('../core/load-plan.js');

const shape = p => p.rows.map(r => r.k).join('');
const pallets = p => p.rows.reduce((a, r) => a + r.n, 0);

// Front-back gaps on each side (0–12, 12–24 dm). The one allowed: behind the first single after the «δόντι»
// (owner 17/11 «Μονές, και ας μείνει 0,1 μ»).
function gaps(p) {
  const out = [];
  for (const side of [[0, 12], [12, 24]]) {
    const e = p.rows.flatMap((r, k) => r.cells.filter(x => x.y < side[1] && x.y + x.h > side[0])
      .map(x => ({ a: r.at + x.x, b: r.at + x.x + x.w, ok: r.k === 'S' && k > 0 && !!p.rows[k - 1].stag }))).sort((x, y) => x.a - y.a);
    for (let j = 1; j < e.length; j++) if (e[j].a > e[j - 1].b && !e[j].ok) out.push(`${side[0]}:${e[j - 1].b}–${e[j].a}`);
  }
  return out;
}

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
  assert.strictEqual(LP.plan({ eur: 1 }).rows[0].cells[0].y, 0, 'last single at the wall');
  const mixed = LP.plan({ eur: 1, ind: 4 });
  assert.strictEqual(shape(mixed), 'IIS');
  assert.ok(mixed.rows[2].wall);
  const p = LP.plan({ eur: 11 });
  assert.ok(p.rows.filter(r => r.k === 'S').every(r => !r.wall), 'singles of the D S … D block stay in the middle');
  assert.ok(p.rows.filter(r => r.k === 'S').every(r => r.cells[0].y === 6), 'centred across the 2.4 m (6 + 12 + 6 dm)');
});

test('industrials only: pairs, singles at the front when few, a lone one against the wall', () => {
  assert.deepStrictEqual(LP.plan({ ind: 26 }).rows.map(r => r.n), Array(13).fill(2));
  assert.deepStrictEqual(LP.plan({ ind: 8 }).rows.map(r => r.n), [2, 1, 2, 1, 2]);
  assert.strictEqual(pallets(LP.plan({ ind: 25 })), 25);
  // a lone industrial stands at the wall, never centred across the box
  assert.deepStrictEqual(LP.plan({ ind: 3 }).rows.map(r => r.cells.map(c => c.y)), [[0, 12], [0]]);
});

test('mixed loads: industrials at the front by the cab, the free room at the back (owner 17/11)', () => {
  const p = LP.plan({ eur: 20, ind: 4 });
  assert.strictEqual(shape(p), 'IIDSDSDSDSDSDSD');
  assert.strictEqual(pallets(p), 24);
  assert.ok(p.used < LP.BOX, 'room left at the back');
});

test('a single goes before the «δόντι»: 2 industrial, single euro, industrial + euro, then on (owner 18/11)', () => {
  const p = LP.plan({ eur: 6, ind: 3 });
  assert.strictEqual(shape(p), 'ISXDD');
  assert.strictEqual(p.rows[1].cells[0].y, 6, 'the single in the middle, behind the industrial pair');
  assert.ok(p.rows.slice(3).every(r => r.stag === 2), 'after the «δόντι» staggered doubles');
  assert.deepStrictEqual(gaps(p), []);
  // a single never opens the box: one industrial alone → no single before the «δόντι»
  assert.ok(!/S/.test(shape(LP.layout([{ n: 1, ind: true }, { n: 10 }])).slice(0, -1)));
  const q = LP.layout([{ n: 2, ind: true }, { n: 4 }, { n: 3, ind: true }, { n: 7 }, { n: 4, ind: true }]);
  assert.ok(!/S/.test(shape(q).slice(4)), 'a second euro run takes no singles');
  assert.deepStrictEqual(gaps(q), []);
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
  const last = LP.plan({ eur: 26, ind: 5 }).rows.slice(-1)[0];
  assert.deepStrictEqual([last.k, last.at + last.cells[0].x, last.cells[0].y], ['S', 124, 12]);
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

test('a load in delivery order: the last delivery by the cab, the first at the doors (owner 17/11, case Μπάμπαλος)', () => {
  // KHI 4612, 17–18/11: cab → doors = MTG 2, Eastwest 8, Strobl 7, Widmann 8 (EUR), Budapest 4 (Industrial)
  const p = LP.layout([{ n: 2 }, { n: 8 }, { n: 7 }, { n: 8 }, { n: 4, ind: true }]);
  assert.strictEqual(p.placed, 29);
  assert.strictEqual(p.dropped, 0);
  assert.ok(p.used <= 128, 'room for the bars');
  const order = p.rows.flatMap(r => r.cells.map(c => c.part));
  assert.deepStrictEqual(order, order.slice().sort((a, b) => a - b), 'parts follow each other from the cab to the doors');
  assert.deepStrictEqual(p.rows.slice(-2).map(r => r.k), ['I', 'I'], 'the industrials for Budapest at the doors');
  assert.ok(p.rows[0].k === 'D' && p.rows[1].k === 'S', 'singles at the front of the euro');
});

test('only the first euro run takes singles; an odd industrial before euro makes the «δόντι»', () => {
  const p = LP.layout([{ n: 8 }, { n: 4, ind: true }, { n: 11 }]);
  const second = p.rows.slice(p.rows.findIndex(r => r.k === 'I') + 2);
  assert.ok(!second.some(r => r.k === 'S' && !r.wall), 'no singles in the second euro run');
  assert.ok(p.rows.slice(0, 3).some(r => r.k === 'S'), 'the first euro run has them');
  const t = LP.layout([{ n: 10 }, { n: 3, ind: true }, { n: 6 }]);
  assert.ok(t.rows.some(r => r.k === 'X'), 'odd industrial in the middle shares its row with the next euro');
  assert.strictEqual(t.placed, 19);
});

test('forklift sheet: names are escaped, an over-full load says so, the tint follows the delivery', () => {
  const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
  const ctx = { window: {}, console, FEATURES: {}, escapeHtml: v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'load-plan.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'modules', 'orders_intl_group.js'), 'utf8'), ctx);
  const parts = [{ no: 2, n: 30, place: 'A<b>', client: 'C', from: 'F' }, { no: 1, n: 4, ind: true, place: 'B', client: 'D', from: 'G' }];
  const lay = ctx.LoadPlan.layout(parts.map(x => ({ n: x.n, ind: x.ind })));
  const html = ctx.window.IntlGroup._rampSheet({ tone: 'blue', pal: 34, cap: 32, lay, parts, date: 'x', printed: 'y' });
  assert.ok(html.includes('A&lt;b&gt;') && !html.includes('A<b>'), 'a place name is escaped');
  assert.ok(html.includes('class="big bad"') && html.includes('πάνω από 32'), 'over the capacity in red, in words');
  assert.ok(lay.dropped > 0 && html.includes(lay.dropped + ' δεν χωρούν'));
  const [a] = ctx.LoadPlan.paint(1, 'blue'), [b] = ctx.LoadPlan.paint(2, 'blue');
  assert.notStrictEqual(a, b, 'neighbouring deliveries get the two tints');
});

test('forklift sheet: a delivery\'s temperature only when the load has more than one; a «loaded» box per delivery', () => {
  const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
  const ctx = { window: {}, console, FEATURES: {}, escapeHtml: v => String(v) };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'load-plan.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'modules', 'orders_intl_group.js'), 'utf8'), ctx);
  const parts = [{ no: 2, n: 8, place: 'A', temp: '+2°' }, { no: 1, n: 4, place: 'B', temp: '+8°' }];
  const lay = ctx.LoadPlan.layout(parts.map(x => ({ n: x.n })));
  const one = ctx.window.IntlGroup._rampSheet({ tone: 'slate', pal: 12, cap: 33, lay, parts, temp: '+4°' });
  assert.ok(!one.includes('class="tp"'), 'one temperature: only in the header');
  assert.ok(one.includes('>+4°<'));
  const two = ctx.window.IntlGroup._rampSheet({ tone: 'slate', pal: 12, cap: 33, lay, parts, split: true });
  assert.ok(two.includes('class="tp">+8°') && two.includes('ΧΩΡΙΣΜΑ'), 'two temperatures: per delivery, and the header says «χώρισμα»');
  assert.strictEqual((one.match(/class="ck"/g) || []).length, 2, 'a «loaded» box per delivery');
});

test('a lone euro that would leave a front-back gap goes to the doors, at the wall (owner 17/11)', () => {
  // the second euro run (8, after the «δόντι») goes staggered: 1 flat + 3 doubles + 1 left → to the doors
  const p = LP.layout([{ n: 2, ind: true }, { n: 4 }, { n: 3, ind: true }, { n: 8 }, { n: 4, ind: true }]);
  assert.strictEqual(p.placed, 21);
  const last = p.rows[p.rows.length - 1];
  assert.deepStrictEqual([last.k, last.wall, last.cells[0].y, last.cells[0].part], ['S', true, 0, 3]);
  assert.deepStrictEqual(gaps(p), []);
  // with singles in the first euro run, an odd one left also goes to the doors
  const q = LP.layout([{ n: 3, ind: true }, { n: 7 }, { n: 4, ind: true }]);
  assert.deepStrictEqual(shape(q), 'ISXDDIIS');
  assert.ok(q.rows[q.rows.length - 1].wall);
});

test('after staggered euro the industrials go on staggered, laid as usual: the 0.2 m stays at the last row (owner 17/11)', () => {
  const p = LP.layout([{ n: 2, ind: true }, { n: 4 }, { n: 3, ind: true }, { n: 7 }, { n: 4, ind: true }]);
  const ind = p.rows.filter(r => r.k === 'I' && r.at > 40);
  assert.ok(ind.length === 2 && ind.every(r => r.stag === 2 && r.cells.every(c => c.w === 10 && c.h === 12)), 'not turned, staggered');
  assert.deepStrictEqual(gaps(p), []);
});

test('no front-back gap on either side in mixed sequences of industrial and euro, except behind the first single after the «δόντι» (owner 17/11)', () => {
  const cases = [[[3, 1], [7, 0], [4, 1]], [[3, 1], [7, 0], [3, 1], [6, 0]], [[3, 1], [8, 0], [4, 1]], [[1, 1], [10, 0], [2, 1], [5, 0]], [[5, 1], [12, 0], [6, 1]], [[2, 1], [9, 0], [3, 1], [4, 0]], [[2, 1], [4, 0], [3, 1], [8, 0], [4, 1]]];
  for (const c of cases) {
    const p = LP.layout(c.map(([n, i]) => ({ n, ind: !!i })));
    assert.strictEqual(p.placed + p.dropped, c.reduce((a, [n]) => a + n, 0), JSON.stringify(c));
    assert.deepStrictEqual(gaps(p), [], JSON.stringify(c));
  }
});

test('forklift sheet: a check box for the loader and the driver (owner 18/11)', () => {
  const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
  const ctx = { window: {}, console, FEATURES: {}, escapeHtml: v => String(v) };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'load-plan.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'modules', 'orders_intl_group.js'), 'utf8'), ctx);
  const parts = [{ no: 1, n: 10, place: 'A' }];
  const html = ctx.window.IntlGroup._rampSheet({ tone: 'slate', pal: 10, cap: 33, lay: ctx.LoadPlan.layout([{ n: 10 }]), parts });
  assert.ok(html.includes('Έλεγχος πριν την αναχώρηση') && html.includes('ο οδηγός ελέγχουν'));
  assert.ok(html.includes('Φορτωτής · υπογραφή') && html.includes('Οδηγός · υπογραφή'));
});

test('industrials only: 20 take 2 singles, in the middle; the last lone one at the wall (owner 18/11)', () => {
  const p = LP.plan({ ind: 20 });
  const singles = p.rows.filter(r => r.n === 1);
  assert.strictEqual(singles.length, 2);
  assert.ok(singles.every(r => r.cells[0].y === 6), 'singles in the middle');
  assert.deepStrictEqual(gaps(p), []);
  const odd = LP.plan({ ind: 21 }), last = odd.rows[odd.rows.length - 1];
  assert.deepStrictEqual([last.n, last.cells[0].y], [1, 0], 'the last lone one at the wall');
});

// tally (18/11): the screens that know only each order's pallets and Pallet Type (Weekly, scan, Εθνικά) ask this, so
// none keeps its own 33.
test('tally: the capacity of a load from its orders\' pallets and types', () => {
  assert.deepStrictEqual(LP.tally([{ n: 24, type: 'EUR' }]), { eur: 24, ind: 0, total: 24, cap: 33, over: 0 });
  assert.deepStrictEqual(LP.tally([{ n: 27, type: 'Industrial' }]), { eur: 0, ind: 27, total: 27, cap: 26, over: 1 });
  // the owner's example: 20 EUR + 4 industrial → 32; CHEP and no type count as euro
  assert.strictEqual(LP.tally([{ n: 20, type: 'CHEP' }, { n: 4, type: 'Industrial' }]).cap, 32);
  assert.strictEqual(LP.tally([{ n: 20 }, { n: '4', type: 'industrial' }]).cap, 32);
  // nothing / unknown figures: the euro capacity, no NaN
  assert.deepStrictEqual(LP.tally([]), { eur: 0, ind: 0, total: 0, cap: 33, over: 0 });
  assert.deepStrictEqual(LP.tally([{ n: null }, { n: '' }, null]), { eur: 0, ind: 0, total: 0, cap: 33, over: 0 });
  // a part pallet takes a place (as the form counts): 32.5 EUR → 33 places, not over; 33.5 → over by 1
  assert.strictEqual(LP.tally([{ n: 32.5 }]).over, 0);
  assert.strictEqual(LP.tally([{ n: 33.5 }]).over, 1);
  // the order of the parts never moves the number
  assert.strictEqual(LP.tally([{ n: 4, type: 'Industrial' }, { n: 20 }]).cap, LP.tally([{ n: 20 }, { n: 4, type: 'Industrial' }]).cap);
});

// One source (owner 17/11, principle 3): the screens that used a fixed 33 ask core/load-plan.js. Comments may tell the
// history; code may not hold the number.
test('no fixed 33 in the capacity checks of the screens (Weekly, v4, form fill, scan, Εθνικά CAP / compose)', () => {
  const fs = require('node:fs'), path = require('node:path');
  const code = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\n')
    .filter(l => !/^\s*(\/\/|\/?\*)/.test(l)).map(l => l.replace(/\s\/\/.*$/, '')).join('\n');
  for (const f of ['core/wi4-logic.js', 'core/wn5-logic.js', 'modules/wn5_compose.js', 'modules/weekly_intl_v2.js'])
    assert.doesNotMatch(code(f), /\b33\b/, f);
  const oi = code('modules/orders_intl.js');
  assert.doesNotMatch(oi, /[<>]=?\s*33\b|\/33\b|> 33 \(/, 'orders_intl: form fill and scan');
  assert.strictEqual((oi.match(/LoadPlan\.tally\(/g) || []).length, 2, 'orders_intl: the fill line and the scan ask LoadPlan');
  assert.doesNotMatch(code('modules/weekly_intl.js'), /WI_PAL_CAP|[<>]=?\s*33\b|\/33\b/, 'weekly_intl');
});
