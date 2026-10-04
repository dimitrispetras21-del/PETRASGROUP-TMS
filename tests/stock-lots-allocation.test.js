// tests/stock-lots-allocation.test.js — run: TZ=Europe/Athens node --test tests/stock-lots-allocation.test.js
// Ε1 (owner 3–4/10/2026): a stock lot's net (client price − charge) is allocated to the RTs
// that carry its pieces, pallets × net/T, in cents. The rule lives in the DB (DRAFT 057,
// stock_v_lot_money + stock_v_lot_alloc); this file mirrors it in exact integer arithmetic and proves
// (round 2 #1, owner 4/10: charge = partner_cost + warehouse_charge = charge_total — «cost» below)
// the properties the owner was promised:
//   • Σ piece amounts = allocated_amount = round(net·drawn/T, 2), exactly;
//   • allocated + in stock / written off = net, exactly (no cent created or lost);
//   • a NEW piece never changes the cents of an earlier piece (running-total rule);
//   • every piece is within one cent of its exact share.
//
// The SQL side cannot run here, so it is pinned two ways (same scheme as tms-week-sql.test.js):
//  1. SQL_MD5 = md5 of the canonical result string for CASES, computed in Postgres 17 (production,
//     SELECT only on synthetic VALUES, 4/10/2026) with the SAME expressions as 057. Print that SQL with
//     `PRINT_SQL=1 node tests/stock-lots-allocation.test.js` to re-measure.
//  2. FORMULA_SHA = sha256 of the allocation expressions as they stand in the migration file — edit
//     the SQL and this test fails until the formula is re-measured (principle 6).
process.env.TZ = 'Europe/Athens';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATION = path.join(__dirname, '..', 'worker', 'migrations', 'drafts', '057_stock_lots.sql');
const SQL_MD5 = '682a9e034ff63710c1c1e42720e13a69';   // Postgres 17.6 (production, SELECT on VALUES) 4/10/2026, 80 cases
// Re-pinned 4/10 (round 2 #1): 057 now nets the price against charge_total (partner_cost + warehouse_charge)
// instead of intake_cost. The arithmetic is the same (net = round(price − cost, 2)), so SQL_MD5 stands.
const FORMULA_SHA = '5f007388f2fa7397c626581ffed2fc959f43c96e8cf7a8b12244f17cdaa324fc';

// ── The rule, in exact integers ─────────────────────────────────────────────────────────────────
// Money in thousandths of a euro (milli), pallets in tenths. Postgres numeric division is not exact
// rational arithmetic (it rounds the quotient to ≥16 significant digits before round(…, 2)), but a
// quotient of integers with denominator ≤ 10⁴·T can never sit within 10⁻¹⁶ of a half-cent without being
// exactly on it, so exact rational rounding gives the same cents. SQL_MD5 checks that claim.
function roundDiv(n, d) {               // BigInt n/d, d > 0, rounded half AWAY from zero (= numeric round())
  const neg = n < 0n;
  const a = neg ? -n : n;
  const q = a / d, r = a % d;
  const v = 2n * r >= d ? q + 1n : q;
  return neg ? -v : v;
}
const cents = (milli) => roundDiv(BigInt(milli), 10n);          // round(x, 2) of a 3-decimal amount
const fmt = (c) => {                                            // numeric(…, 2)::text
  const neg = c < 0n, a = neg ? -c : c;
  return (neg ? '-' : '') + (a / 100n).toString() + '.' + (a % 100n).toString().padStart(2, '0');
};

// net = round(price − cost, 2); piece i = R(cum_i) − R(cum_{i−1}), R(x) = round(net·x/T, 2)
function allocate({ priceMilli, costMilli, totalTenths, pieceTenths }) {
  const net = cents(priceMilli - costMilli);
  const T = BigInt(totalTenths);
  const R = (cumTenths) => roundDiv(net * BigInt(cumTenths), T);
  let cum = 0;
  const amounts = pieceTenths.map((p) => { const a = R(cum + p) - R(cum); cum += p; return a; });
  const allocated = R(cum);
  return { net, amounts, allocated, remainder: net - allocated, drawnTenths: cum };
}

// ── Deterministic cases (mulberry32) — the SAME list is measured in Postgres ─────────────────────
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeCases(n, seed) {
  const r = rng(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  // case 0 = the owner's example (plan §5): 3300 €, warehouse 300 €, 33 pallets, pieces 5/15/13
  const out = [{ priceMilli: 3300000, costMilli: 300000, totalTenths: 330, pieceTenths: [50, 150, 130] }];
  while (out.length < n) {
    const subCent = r() < 0.15;                           // a few prices/rates with a third decimal
    const priceMilli = int(1, 600000) * (subCent ? 1 : 10);
    const costMilli = r() < 0.1 ? int(0, 900000) * 10 : int(0, Math.floor(priceMilli / 10)) * 10; // some negative nets
    const totalTenths = r() < 0.2 ? int(5, 660) : int(1, 66) * 10;                                 // some half/tenth pallets
    const pieceTenths = [];
    let left = totalTenths;
    const k = int(0, 7);
    for (let i = 0; i < k && left > 0; i++) {
      const p = r() < 0.2 ? int(1, left) : Math.min(left, int(1, 20) * 10);
      pieceTenths.push(p); left -= p;
    }
    out.push({ priceMilli, costMilli, totalTenths, pieceTenths });
  }
  return out;
}
const CASES = makeCases(80, 20261004);

const canonical = (cases) => cases.map((c, i) => {
  const a = allocate(c);
  return `${i}:${a.amounts.map(fmt).join(',')}|${fmt(a.allocated)}|${fmt(a.remainder)}`;
}).join(';');

// The measuring SQL: exactly the 057 expressions (net = round(price − cost, 2); piece =
// round(net·cum/T, 2) − round(net·(cum − pallets)/T, 2); allocated = round(net·drawn/T, 2)).
function measuringSql(cases) {
  const dec = (milli) => (milli / 1000).toFixed(3);
  const ten = (t) => (t / 10).toFixed(1);
  const c = cases.map((x, i) => `(${i}, ${dec(x.priceMilli)}::numeric, ${dec(x.costMilli)}::numeric, ${ten(x.totalTenths)}::numeric)`).join(',\n  ');
  const p = cases.flatMap((x, i) => x.pieceTenths.map((t, j) => `(${i}, ${j + 1}, ${ten(t)}::numeric)`)).join(',\n  ');
  return `with c(case_no, price, cost, total) as (values
  ${c}),
p(case_no, seq, pallets) as (values
  ${p}),
w as (select p.case_no, p.seq, p.pallets,
             sum(p.pallets) over (partition by p.case_no order by p.seq rows between unbounded preceding and current row) as cum
        from p),
m as (select c.case_no, round(c.price - c.cost, 2) as net, c.total,
             coalesce((select sum(p.pallets) from p where p.case_no = c.case_no), 0) as drawn
        from c)
select md5(string_agg(line, ';' order by case_no)) as sql_md5 from (
  select m.case_no, m.case_no || ':'
         || coalesce((select string_agg((round(m.net * w.cum / m.total, 2) - round(m.net * (w.cum - w.pallets) / m.total, 2))::text, ',' order by w.seq)
                        from w where w.case_no = m.case_no), '')
         || '|' || round(m.net * m.drawn / m.total, 2)
         || '|' || (m.net - round(m.net * m.drawn / m.total, 2)) as line
    from m) x;`;
}

// The allocation expressions of 057, whitespace-normalised: the money view's net/alloc and the
// per-piece amount. Changing any of them must change this hash.
function formulaText() {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const pick = (re, what) => { const m = sql.match(re); assert.ok(m, `057: ${what} not found`); return m[0].replace(/\s+/g, ' ').trim(); };
  return [
    pick(/round\(x\.price - c\.charge_total, 2\)\s+as net,/, 'net expression'),
    pick(/round\(round\(x\.price - c\.charge_total, 2\) \* l\.drawn_pallets \/ nullif\(l\.stock_pallets, 0\), 2\) as alloc/, 'allocated_amount expression'),
    pick(/round\(w\.net \* w\.cum_pallets \/ w\.total_pallets, 2\)\s+- round\(w\.net \* \(w\.cum_pallets - w\.pallets\) \/ w\.total_pallets, 2\)/, 'piece amount expression'),
    pick(/order by p\.created_at, p\.piece_kind, p\.piece_id\s+rows between unbounded preceding and current row/, 'running-total order'),
  ].join('\n');
}

if (process.env.PRINT_SQL) {
  console.log(measuringSql(CASES));
  console.log('-- JS md5:', crypto.createHash('md5').update(canonical(CASES)).digest('hex'));
  console.log('-- FORMULA_SHA:', crypto.createHash('sha256').update(formulaText()).digest('hex'));
}

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────────
test('the owner\'s example (plan §5, rules test M1–M3)', () => {
  const m1 = allocate({ priceMilli: 3300000, costMilli: 300000, totalTenths: 330, pieceTenths: [50, 150, 130] });
  assert.deepStrictEqual(m1.amounts.map(fmt), ['454.55', '1363.63', '1181.82']);
  assert.strictEqual(fmt(m1.allocated), '3000.00');
  assert.strictEqual(fmt(m1.remainder), '0.00');                       // in_stock 0.00
  const m2 = allocate({ priceMilli: 3300000, costMilli: 300000, totalTenths: 330, pieceTenths: [50, 150] });
  assert.strictEqual(fmt(m2.allocated), '1818.18');
  assert.strictEqual(fmt(m2.remainder), '1181.82');                    // in stock
  const m3 = allocate({ priceMilli: 3300000, costMilli: 300000, totalTenths: 330, pieceTenths: [50, 150, 110] });
  assert.strictEqual(fmt(m3.allocated), '2818.18');
  assert.strictEqual(fmt(m3.remainder), '181.82');                     // «χαμένο υπόλοιπο» after the close
});

test('no cent is created or lost, earlier pieces never move, every piece within a cent (5000 cases)', () => {
  for (const [i, c] of makeCases(5000, 7).entries()) {
    const a = allocate(c);
    const sum = a.amounts.reduce((s, x) => s + x, 0n);
    assert.strictEqual(sum, a.allocated, `case ${i}: Σ pieces ≠ allocated`);
    assert.strictEqual(a.allocated + a.remainder, a.net, `case ${i}: allocated + remainder ≠ net`);
    if (a.drawnTenths === c.totalTenths) assert.strictEqual(a.remainder, 0n, `case ${i}: all pallets out but remainder ≠ 0`);
    for (let k = 0; k < c.pieceTenths.length; k++) {
      const prefix = allocate({ ...c, pieceTenths: c.pieceTenths.slice(0, k) });
      assert.deepStrictEqual(prefix.amounts, a.amounts.slice(0, k), `case ${i}: adding piece ${k + 1} changed an earlier piece`);
      // |amount − net·p/T| < 1 cent, in exact integers: |amount·T − net·p| < T
      const diff = a.amounts[k] * BigInt(c.totalTenths) - a.net * BigInt(c.pieceTenths[k]);
      assert.ok((diff < 0n ? -diff : diff) < BigInt(c.totalTenths), `case ${i}: piece ${k + 1} off by a cent or more`);
    }
  }
});

test('Postgres gives the same cents (SQL_MD5 measured with the 057 expressions)', () => {
  assert.notStrictEqual(SQL_MD5, 'PENDING', 'measure SQL_MD5: PRINT_SQL=1 node tests/stock-lots-allocation.test.js');
  assert.strictEqual(crypto.createHash('md5').update(canonical(CASES)).digest('hex'), SQL_MD5);
});

test('the migration still carries the measured formula (FORMULA_SHA)', () => {
  assert.notStrictEqual(FORMULA_SHA, 'PENDING', 'pin FORMULA_SHA: PRINT_SQL=1 node tests/stock-lots-allocation.test.js');
  assert.strictEqual(crypto.createHash('sha256').update(formulaText()).digest('hex'), FORMULA_SHA,
    '057 allocation SQL changed — re-measure SQL_MD5 in Postgres, then update both pins');
});
