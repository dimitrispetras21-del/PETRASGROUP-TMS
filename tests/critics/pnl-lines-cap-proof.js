// Proof rig — TRIP PnL: GET /costs/lines stops at 300 rows (4/10/2026).
// Live, the owner's screen read «73 από 128 χωρίς καταχωρημένο κόστος» while
// the base had costs on 81 of the 128 RTs: the batch call returns the 300
// NEWEST lines (line_date desc) and the live Worker has no offset, so RTs whose
// lines are all older read «χωρίς κόστος». The page now re-reads a full batch
// per RT with ?rt_id=. This rig serves a facade that cuts exactly like the
// Worker (300, newest first) and OPENS the screen; expectations are written out
// by hand, not recomputed with the page's functions. Synthetic data only.
//
// Run from the MAIN repo root:
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<wt>/ node .claude/worktrees/<wt>/tests/critics/pnl-lines-cap-proof.js
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

// 41 RTs in one planning week. RTs 1–40 carry 10 fuel lines each (400 lines):
// RT k's lines are dated so that RTs 1–30 hold the 300 newest and RTs 31–40
// only older ones. RT 41 has NO line at all — the one truly without costs.
const N = 41;
const PNL = Array.from({ length: N }, (_, i) => ({
  id: i + 1, code: 'RT-' + (i + 1), scope: 'INTL', trip_type: 'OWNED', truck_id: 1, driver_id: null, partner_id: null,
  date_start: '2026-09-28', date_end: null, status: 'in_progress', total_km: null,
  revenue: 1000, revenue_intl: 1000, revenue_natl: 0, cost_net: i + 1 === N ? 0 : 400, cost_gross: i + 1 === N ? 0 : 400, cost_vat: 0,
  profit_worst: i + 1 === N ? 1000 : 600, margin_worst_pct: i + 1 === N ? 100 : 60,
  dl_trip_value: null, dl_expenses: null, driver_pay_pending: false, driver_pay_missing: false,
}));
const RTS = PNL.map(t => ({ id: t.id, ct_rt_legs: [{ order_id: 500 + t.id, direction: 'Export' }] }));
const LINES = [];
for (let k = 1; k < N; k++) for (let j = 0; j < 10; j++) {
  // RT 1 newest … RT 40 oldest: one day per RT back from 30/9
  const d = new Date(Date.UTC(2026, 8, 30) - (k - 1) * 86400000).toISOString().slice(0, 10);
  LINES.push({ id: k * 100 + j, rt_id: k, category: 'fuel', net: 40, vat: 0, line_date: d });
}
const byNewest = (a, b) => (a.line_date < b.line_date ? 1 : a.line_date > b.line_date ? -1 : b.id - a.id);
const LOOKUPS = { trucks: [{ id: 1, license_plate: 'ΤΕΣΤ-1001', active: true }], trailers: [], drivers: [], partners: [] };

async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const S = { req: [], errors: [] };
  page.on('pageerror', e => S.errors.push(String(e)));
  page.on('dialog', d => d.accept());
  await preparePage(page, 'owner');
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, route => {
    const u = new URL(route.request().url()); const p = u.pathname;
    S.req.push(route.request().method() + ' ' + p + u.search);
    if (p.endsWith('/costs/pnl')) return json(route, { records: PNL });
    if (p.endsWith('/costs/rt')) return json(route, { records: RTS });
    if (p.endsWith('/costs/lookups')) return json(route, LOOKUPS);
    if (p.endsWith('/costs/pallet-gate')) return json(route, { records: [] });
    if (p.endsWith('/costs/lines')) {
      const rid = u.searchParams.get('rt_id');
      if (rid && opts.failRt === rid) return json(route, { error: 'boom' }, 500);
      // exactly the live Worker: order line_date.desc,id.desc · limit 300
      const rows = LINES.filter(l => !rid || String(l.rt_id) === rid).sort(byNewest).slice(0, 300);
      return json(route, { records: rows });
    }
    return route.request().method() === 'GET' ? json(route, { records: [] }) : json(route, { ok: true });
  });
  await gotoPage(page, 'costs', BASE);
  await page.waitForSelector('.ct-stake .ct-stop .t', { timeout: 60000 });
  await page.waitForTimeout(500);
  return { page, S };
}
const title = page => page.$eval('.ct-stake .ct-stop .t', el => el.textContent.trim());
const notes = page => page.$$eval('.ct-note', ns => ns.map(n => n.textContent.replace(/\s+/g, ' ').trim()).join(' | '));

(async () => {
  const browser = await chromium.launch();

  console.log('\n── capped batch (300 of 400 lines) → re-read per RT');
  {
    const { page, S } = await open(browser);
    const perRt = S.req.filter(r => /^GET \/costs\/lines\?rt_id=\d+$/.test(r)).map(r => r.split('=')[1]).sort((a, b) => a - b);
    ok(S.req.some(r => r === 'GET /costs/lines'), 'one batch call GET /costs/lines (returns 300 = full)');
    ok(perRt.length === N && perRt.join() === PNL.map(t => t.id).join(), `then one GET /costs/lines?rt_id= per RT on the page: ${perRt.length}/${N}`);
    ok(await title(page) === '1 από 41 δρομολόγια χωρίς καταχωρημένο κόστος', 'banner: «' + await title(page) + '» (only RT 41 has no line)');
    ok(await page.$eval('.ct-stake .ct-eqq', el => el.textContent.trim()) === '40/41', 'cost range next to «Κόστη»: 40/41');
    ok(!/300/.test(await notes(page)), 'no «300 lines» cap warning (old or new wording) — every RT was read in full');
    ok(!/ΔΕΝ φόρτωσαν/.test(await notes(page)), 'no «γραμμές κόστους ΔΕΝ φόρτωσαν» warning');
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  console.log('\n── one per-RT read fails → completeness UNKNOWN, never «χωρίς κόστος»');
  {
    const { page, S } = await open(browser, { failRt: '35' });
    const t = await title(page);
    ok(t === 'Οι γραμμές κόστους δεν φόρτωσαν — άγνωστη πληρότητα', 'banner: «' + t + '»');
    ok(!/χωρίς καταχωρημένο κόστος/.test(t), 'no «N από M χωρίς καταχωρημένο κόστος» claim');
    ok(/ΔΕΝ φόρτωσαν/.test(await notes(page)), 'visible «γραμμές κόστους ΔΕΝ φόρτωσαν» note with «Ανανέωση»');
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
