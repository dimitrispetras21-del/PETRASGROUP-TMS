// Proof rig — TRIP PnL «Εθνικό / Διεθνές / Μικτό» (owner 4/10/2026: «καθε RT
// εθνικων δημιουργει πλεον PnL ... θελω σε ξεχωριστο πεδιο-εθνικων/διεθνων»).
// Migration 034 appended revenue_intl / revenue_natl to ct_v_rt_pnl; on 4/10
// there are 0 national RTs (034 creates them from 5/10), so the three kinds are
// served from a small /costs/* facade and the screen OPENS in a real browser.
// Expected numbers are written out by hand below (not recomputed with the
// page's own functions) — the page must arrive at them on its own.
//
// Optional second half: PNL_REAL=<path to a JSON array of ct_v_rt_pnl rows>
// (a read-only SELECT, kept OUT of the repo — the repo is public) feeds the
// real rows through the page; the rig sums them itself and the page's
// «Διεθνή» row must match.
//
// Run from the MAIN repo root:
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<wt>/ node .claude/worktrees/<wt>/tests/critics/pnl-natl-intl-proof.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const eur = n => '€' + Math.round(Number(n) || 0).toLocaleString('el-GR');
// The screen's own convention (ctEurP): a loss in parentheses, never «€-500».
const eurP = n => Number(n) < 0 ? '(' + eur(-n).replace('€', '') + ' €)' : eur(n);

// ── Fixture: two international, two national (one without costs), three mixed (one priced, one unpriced VS, one priced exactly 850),
// one partner (international). All in ONE planning week so every card renders.
const row = o => Object.assign({ code: 'RT-' + o.id, trip_type: 'OWNED', driver_id: null, partner_id: null,
  date_end: null, status: 'in_progress', total_km: null, cost_vat: 0, dl_trip_value: null, dl_expenses: null,
  driver_pay_pending: false, driver_pay_missing: false }, o);
const PNL = [
  row({ id: 1, scope: 'INTL', truck_id: 1, date_start: '2026-09-28', revenue: 5000, revenue_intl: 5000, revenue_natl: 0, cost_net: 2000, cost_gross: 2000, profit_worst: 3000, margin_worst_pct: 60 }),
  row({ id: 2, scope: 'INTL', truck_id: 2, date_start: '2026-09-28', revenue: 3000, revenue_intl: 3000, revenue_natl: 0, cost_net: 3500, cost_gross: 3500, profit_worst: -500, margin_worst_pct: -16.7 }),
  row({ id: 3, scope: 'NATL', truck_id: 2, date_start: '2026-09-29', revenue: 800, revenue_intl: 0, revenue_natl: 800, cost_net: 300, cost_gross: 300, profit_worst: 500, margin_worst_pct: 62.5 }),
  row({ id: 4, scope: 'NATL', truck_id: 2, date_start: '2026-09-30', revenue: 650, revenue_intl: 0, revenue_natl: 650, cost_net: 0, cost_gross: 0, profit_worst: 650, margin_worst_pct: 100 }),
  row({ id: 5, scope: 'INTL', truck_id: 1, date_start: '2026-09-29', revenue: 6150, revenue_intl: 5300, revenue_natl: 850, cost_net: 2500, cost_gross: 2500, profit_worst: 3650, margin_worst_pct: 59.3 }),
  row({ id: 6, scope: 'INTL', trip_type: 'PARTNER', truck_id: null, partner_id: 9, date_start: '2026-09-30', revenue: 2850, revenue_intl: 2850, revenue_natl: 0, cost_net: 2700, cost_gross: 2700, profit_worst: 150, margin_worst_pct: 5.3 }),
  // Review 2d169480: a VS order with NO price yet — the 034 view still moves
  // the 850 transfer to the national leg, so intl = −850, natl = +850 (mixed).
  row({ id: 7, scope: 'INTL', truck_id: 1, date_start: '2026-10-01', revenue: 0, revenue_intl: -850, revenue_natl: 850, cost_net: 400, cost_gross: 400, profit_worst: -400, margin_worst_pct: null }),
  // …and a VS order priced exactly 850: intl = 0, natl = 850 (mixed too).
  row({ id: 8, scope: 'INTL', truck_id: 1, date_start: '2026-10-01', revenue: 850, revenue_intl: 0, revenue_natl: 850, cost_net: 300, cost_gross: 300, profit_worst: 550, margin_worst_pct: 64.7 }),
];
const RTS = PNL.map(t => ({ id: t.id, ct_rt_legs: [5, 7, 8].includes(t.id)
  ? [{ order_id: 500 + t.id, direction: 'Export' }, { nat_load_id: 70 + t.id }]
  : t.scope === 'NATL' ? [{ nat_load_id: 70 + t.id }] : [{ order_id: 500 + t.id, direction: 'Export' }] }));
// RT 4 has NO cost line → «κόστη ελλιπή» → its row's net/margin must be «—».
const LINES = PNL.filter(t => t.id !== 4).map((t, i) => ({ id: 900 + i, rt_id: t.id, category: 'fuel', net: t.cost_net, vat: 0 }));
const LOOKUPS = { trucks: [{ id: 1, license_plate: 'ΤΕΣΤ-1001', active: true }, { id: 2, license_plate: 'ΤΕΣΤ-1002', active: true }],
  trailers: [], drivers: [], partners: [{ id: 9, company_name: 'Συνεργάτης Α', active: true }] };

// Hand-computed expectations (independent of modules/costs.js).
const EXP = {
  INTL:  { n: 3, ri: 10850, rn: 0,    rev: 10850, cost: 8200,  net: 2650, mg: '24.4%' },   // RT 1, 2, 6
  NATL:  { n: 2, ri: 0,     rn: 1450, rev: 1450,  cost: 300,   net: null, mg: null, q: '1/2' }, // RT 3, 4 (4 without costs)
  // RT 5 + 7 + 8: intl 5300 − 850 + 0 = 4450 · natl 850 × 3 = 2550 · revenue 6150 + 0 + 850 = 7000
  // costs 2500 + 400 + 300 = 3200 · net 3800 · 3800 / 7000 = 54.29 %
  MIX:   { n: 3, ri: 4450,  rn: 2550, rev: 7000,  cost: 3200,  net: 3800, mg: '54.3%' },
  // all 8: intl 10850 + 0 + 4450 = 15300 · natl 0 + 1450 + 2550 = 4000 · revenue 19300 · costs 11700 · RT 4 without costs
  TOTAL: { n: 8, ri: 15300, rn: 4000, rev: 19300, cost: 11700, net: null, mg: null, q: '7/8' },
};

async function newPage(browser, role, data) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const S = { req: [], errors: [] };
  page.on('pageerror', e => S.errors.push(String(e)));
  page.on('dialog', d => d.accept());
  await preparePage(page, role);
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, route => {
    const u = new URL(route.request().url()); const p = u.pathname;
    S.req.push(route.request().method() + ' ' + p + u.search);
    if (p.endsWith('/costs/pnl')) return json(route, { records: data.pnl });
    if (p.endsWith('/costs/rt')) return json(route, { records: data.rts });
    if (p.endsWith('/costs/lookups')) return json(route, data.lookups);
    if (p.endsWith('/costs/pallet-gate')) return json(route, { records: [] });
    if (p.endsWith('/costs/lines')) {
      const rid = u.searchParams.get('rt_id');
      return json(route, { records: rid ? data.lines.filter(l => String(l.rt_id) === rid) : data.lines });
    }
    return route.request().method() === 'GET' ? json(route, { records: [] }) : json(route, { ok: true });
  });
  await gotoPage(page, 'costs', BASE);
  return { page, S };
}
const kindTable = page => page.$$eval('#ctKindTbl tr[data-kind]', rows => rows.map(r => {
  const o = { kind: r.dataset.kind, label: r.cells[0].textContent.trim() };
  r.querySelectorAll('td[data-c]').forEach(td => { o[td.dataset.c] = td.textContent.replace(/\s+/g, ' ').trim(); });
  return o;
}));
const visibleCards = page => page.$$eval('.ct-card', cs => cs.map(c => Number(c.id.replace('ctCard', ''))).sort((a, b) => a - b));
const stakeRevenue = page => page.$eval('.ct-stake .ct-eq .ct-eqi .nv', b => b.textContent.trim());
function checkRow(r, e, name) {
  if (!r) return ok(false, name + ': row missing');
  const cost = eur(e.cost) + (e.q ? ' ' + e.q : '');
  const net = e.net == null ? '—' : eurP(e.net);
  const mg = e.mg == null ? '—' : e.mg;
  const got = [r.n, r.ri, r.rn, r.rev, r.cost, r.net, r.mg].join(' | ');
  const want = [String(e.n), eur(e.ri), eur(e.rn), eur(e.rev), cost, net, mg].join(' | ');
  ok(got === want, `${name}: ${got}` + (got === want ? '' : `   (expected ${want})`));
}

(async () => {
  const browser = await chromium.launch();
  const data = { pnl: PNL, rts: RTS, lines: LINES, lookups: LOOKUPS };

  console.log('\n── Owner · subtotals per type');
  let { page, S } = await newPage(browser, 'owner', data);
  await page.waitForSelector('#ctKindTbl', { timeout: 60000 }); await page.waitForTimeout(300);
  let T = await kindTable(page);
  const by = k => T.find(r => r.kind === k);
  ok(T.map(r => r.label).join(',') === 'Διεθνή,Εθνικά,Μικτά,Σύνολο', 'rows: ' + T.map(r => r.label).join(','));
  checkRow(by('INTL'), EXP.INTL, 'Διεθνή');
  checkRow(by('NATL'), EXP.NATL, 'Εθνικά');
  checkRow(by('MIX'), EXP.MIX, 'Μικτά');
  checkRow(by('TOTAL'), EXP.TOTAL, 'Σύνολο');
  const note = await page.$eval('#ctKindNote', n => n.textContent);
  ok(/κόστη του ΔΕΝ μοιράζονται/.test(note), 'note says costs of a mixed RT are not split');
  ok(await stakeRevenue(page) === eur(EXP.TOTAL.rev), 'banner «Όλα» revenue = Σύνολο row: ' + await stakeRevenue(page));
  if (process.env.PNL_SHOT) await page.screenshot({ path: process.env.PNL_SHOT, fullPage: false });

  console.log('\n── Owner · per-RT type field');
  ok((await visibleCards(page)).join(',') === '1,2,3,4,5,6,7,8', 'all 8 cards: ' + (await visibleCards(page)).join(','));
  const kinds = await page.$$eval('.ct-card', cs => Object.fromEntries(cs.map(c => [c.id.replace('ctCard', ''), (c.querySelector('.ct-kind') || {}).textContent])));
  ok(JSON.stringify(kinds) === JSON.stringify({ 1: 'Διεθνές', 2: 'Διεθνές', 3: 'Εθνικό', 4: 'Εθνικό', 5: 'Μικτό', 6: 'Διεθνές', 7: 'Μικτό', 8: 'Μικτό' }), 'type per card: ' + JSON.stringify(kinds));
  const split5 = await page.$eval('#ctCard5 .ct-split', s => s.textContent.trim()).catch(() => '');
  ok(split5 === `διεθνή ${eur(5300)} · εθνικά ${eur(850)}`, 'mixed card shows the revenue split: ' + split5);
  const split7 = await page.$eval('#ctCard7 .ct-split', s => s.textContent.trim()).catch(() => '');
  ok(split7 === `διεθνή ${eur(-850)} · εθνικά ${eur(850)}`, 'unpriced VS RT (intl −850) is Μικτό with its split: ' + split7);
  ok(await page.$('#ctCard1 .ct-split') === null && await page.$('#ctCard3 .ct-split') === null, 'pure cards show no split');
  const leg5 = await page.$eval('#ctCard5', c => c.textContent);
  ok(/εθνικό φορτίο #75/.test(leg5) && !/όχι έσοδο πελάτη/.test(leg5), 'national leg line no longer says «όχι έσοδο πελάτη»');

  console.log('\n── Owner · type filter');
  const seg = async (s, ids, rev) => {
    await page.click(`#ctScopeSeg button[data-s="${s}"]`); await page.waitForTimeout(200);
    const v = (await visibleCards(page)).join(',');
    const r = await stakeRevenue(page);
    ok(v === ids && r === eur(rev), `«${s}» → cards ${v}, banner revenue ${r}`);
    const t2 = await kindTable(page);
    ok(t2.find(x => x.kind === 'TOTAL').rev === eur(EXP.TOTAL.rev), `«${s}»: the type table keeps all types (Σύνολο ${eur(EXP.TOTAL.rev)})`);
  };
  await seg('MIX', '5,7,8', EXP.MIX.rev);
  await seg('NATL', '3,4', EXP.NATL.rev);
  await seg('INTL', '1,2,6', EXP.INTL.rev);
  await seg('ALL', '1,2,3,4,5,6,7,8', EXP.TOTAL.rev);

  console.log('\n── Owner · vehicle filter narrows the subtotals');
  await page.selectOption('#ctVehSel', '2'); await page.waitForTimeout(200);
  T = await kindTable(page);
  checkRow(by('INTL'), { n: 1, ri: 3000, rn: 0, rev: 3000, cost: 3500, net: -500, mg: '-16.7%' }, 'ΤΕΣΤ-1002 Διεθνή');
  checkRow(by('NATL'), EXP.NATL, 'ΤΕΣΤ-1002 Εθνικά');
  ok(by('MIX').n === '0' && by('MIX').rev === '—', 'ΤΕΣΤ-1002 Μικτά: 0 and «—», not €0');
  await page.selectOption('#ctVehSel', 'ALL'); await page.waitForTimeout(200);

  console.log('\n── Owner · panel of the mixed RT');
  await page.click('#ctCard5'); await page.waitForSelector('#ctPanel.open .ct-totrow', { timeout: 10000 });
  const ph = await page.$eval('#ctPanel h2', h => h.textContent.trim());
  ok(ph === 'RT-5 · Μικτό', 'panel header: ' + ph);
  const pt = await page.$eval('#ctPanel', p => p.textContent.replace(/\s+/g, ' '));
  ok(pt.includes('Έσοδα διεθνή' + eur(5300)) && pt.includes('Έσοδα εθνικά' + eur(850)), 'panel lists Έσοδα διεθνή ' + eur(5300) + ' / εθνικά ' + eur(850));
  ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
  ok(S.req.some(r => r.startsWith('GET /costs/pnl')), 'owner page read GET /costs/pnl');
  await page.context().close();

  console.log('\n── Owner · Worker without the 034 columns');
  const noSplit = PNL.map(t => { const c = Object.assign({}, t); delete c.revenue_intl; delete c.revenue_natl; return c; });
  ({ page, S } = await newPage(browser, 'owner', Object.assign({}, data, { pnl: noSplit })));
  await page.waitForSelector('#ctKindTbl', { timeout: 60000 }); await page.waitForTimeout(300);
  T = await kindTable(page);
  const nn = await page.$eval('#ctKindNote', n => n.textContent);
  ok(/δεν ήρθε από τον διακομιστή/.test(nn), 'missing columns are SAID, not read as €0 national revenue');
  // INTL by scope = RT 1, 2, 5, 6, 7, 8: 5000 + 3000 + 6150 + 2850 + 0 + 850 = 17850
  ok(by('MIX').n === '0' && by('INTL').n === '6' && by('NATL').n === '2', `type falls back to scope (Διεθνή ${by('INTL').n}, Εθνικά ${by('NATL').n}, Μικτά ${by('MIX').n})`);
  ok(by('INTL').ri === '—' && by('INTL').rn === '—' && by('INTL').rev === eur(17850), 'split cells «—», revenue still summed: ' + by('INTL').rev);
  await page.context().close();

  console.log('\n── Dispatcher · no TRIP PnL');
  ({ page, S } = await newPage(browser, 'dispatcher', data));
  await page.waitForFunction(() => /ορατή μόνο στον ιδιοκτήτη/.test(document.getElementById('content')?.textContent || ''), null, { timeout: 60000 }).catch(() => {});
  const dt = await page.$eval('#content', c => c.textContent);
  ok(/ορατή μόνο στον ιδιοκτήτη/.test(dt), 'dispatcher sees the owner-only message');
  ok(await page.$('#ctKindTbl') === null && await page.$('.ct-card') === null, 'no table, no cards');
  ok(!S.req.some(r => r.includes('/costs/')), 'no /costs/* request at all: ' + (S.req.filter(r => r.includes('/costs/')).join(',') || 'none'));
  ok(await page.$('#nav_costs') === null, 'no «TRIP PnL» item in the dispatcher menu');
  await page.context().close();
  const worker = fs.readFileSync(path.resolve(__dirname, '../../worker/src/index.js'), 'utf8');
  const perms = worker.slice(worker.indexOf('var COSTS_PERMS'), worker.indexOf('function ctCan'));
  const pnlRoles = perms.split('\n').filter(l => /^\s*\w+: \{/.test(l) && /\bpnl: \[/.test(l)).map(l => l.trim().split(':')[0]);
  ok(pnlRoles.join(',') === 'owner', 'Worker COSTS_PERMS: only owner has pnl (' + pnlRoles.join(',') + ')');

  if (process.env.PNL_REAL) {
    console.log('\n── Real rows (read-only SELECT of ct_v_rt_pnl, ' + process.env.PNL_REAL + ')');
    const real = JSON.parse(fs.readFileSync(process.env.PNL_REAL, 'utf8'));
    // Hard-coded expectation, measured 4/10/2026 with a SELECT on ct_v_rt_pnl:
    // 128 RTs, every one scope INTL with revenue_natl = 0 → all «Διεθνή», no
    // «Εθνικά», no «Μικτά». The page's rule is NOT re-implemented here (review
    // 2d169480). If the file no longer matches that measurement the expectation
    // is stale — say so and fail instead of re-deriving it.
    const EXPECT_REAL = { INTL: real, NATL: [], MIX: [] };
    const stale = real.filter(t => t.scope !== 'INTL' || Number(t.revenue_natl) !== 0);
    ok(!stale.length, 'real rows still match the 4/10 measurement (all INTL, natl 0)' + (stale.length ? ' — STALE: ' + stale.length + ' rows differ, update EXPECT_REAL' : ''));
    const sum = (rows, f) => rows.reduce((a, t) => a + Number(t[f] || 0), 0);
    // Every RT gets one cost line so net/margin are shown — the comparison is
    // the page's arithmetic against the view's, not the completeness gate.
    const realLines = real.map((t, i) => ({ id: 100000 + i, rt_id: t.id, category: 'other', net: 0, vat: 0 }));
    ({ page, S } = await newPage(browser, 'owner', { pnl: real, rts: real.map(t => ({ id: t.id, ct_rt_legs: [] })), lines: realLines, lookups: LOOKUPS }));
    await page.waitForSelector('#ctKindTbl', { timeout: 60000 }); await page.waitForTimeout(300);
    T = await kindTable(page);
    for (const k of ['INTL', 'NATL', 'MIX']) {
      const rows = EXPECT_REAL[k];
      const rev = sum(rows, 'revenue'), gross = sum(rows, 'cost_gross'), pw = sum(rows, 'profit_worst');
      console.log(`    SELECT ${k}: n=${rows.length} revenue_intl=${sum(rows, 'revenue_intl').toFixed(2)} revenue_natl=${sum(rows, 'revenue_natl').toFixed(2)} cost_gross=${gross.toFixed(2)} Σprofit_worst=${pw.toFixed(2)}`);
      if (!rows.length) { ok(by(k).n === '0', `${k}: 0 RTs on the page too`); continue; }
      checkRow(by(k), { n: rows.length, ri: sum(rows, 'revenue_intl'), rn: sum(rows, 'revenue_natl'), rev, cost: gross, net: pw, mg: (pw / rev * 100).toFixed(1) + '%' }, 'page ' + k);
    }
    await page.context().close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
