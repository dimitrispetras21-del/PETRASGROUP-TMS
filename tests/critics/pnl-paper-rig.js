// Rig — the two P&L papers (print_pnl.html, owner 3/11/2026, Figma 2542:7735 / 2537:7735) in a real browser.
// Invented data only (the repo is public); the Worker is stubbed at the network (page.route), nothing reaches it.
// Judged on the DOM and the printed PDF, never on the code under test:
//   trip   — A4 PORTRAIT, the result line, «Σκόπια», the Veroia Switch row, no «RT-», no 0,00 for a missing amount;
//   week   — A4 LANDSCAPE, «Σύνολο εβδομάδας», «Μόνο τα πλήρη»;
//   refuse — a total that does not add up: no paper, the print button disabled, window.print never called;
//   roles  — a non-owner (403) is told the paper is the owner's; the owner on an old Worker (403) is told to update.
// Run from the MAIN repo root (node_modules), against a static server of the tree under test:
//   cd /Users/dimitrispetras/PETRASGROUP-TMS && PW_BASE_URL=http://127.0.0.1:8797/ PW_SHOT_DIR=<scratch> node <tree>/tests/critics/pnl-paper-rig.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require(path.join('/Users/dimitrispetras/PETRASGROUP-TMS', 'node_modules', 'playwright'));

const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8797/';
// Never inside the clone (public repo): the OS temp folder unless PW_SHOT_DIR says otherwise.
const SHOT_DIR = process.env.PW_SHOT_DIR || path.join(os.tmpdir(), 'pnl-paper-rig');
fs.mkdirSync(SHOT_DIR, { recursive: true });
let passed = 0, failed = 0;
const assert = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.log('  ✗ ' + m); } };

const LK = { trucks: [{ id: 1, license_plate: 'ΑΒΓ1001' }], drivers: [{ id: 11, full_name: 'Δοκιμαστής Γιώργος' }], partners: [{ id: 21, company_name: 'Συνεργάτης Δοκιμής ΑΕ' }], trailers: [], pay_sources: [] };
const T1 = { id: 1, trip_type: 'OWNED', truck_id: 1, driver_id: 11, date_start: '2026-10-17', date_end: '2026-10-22', status: 'closed',
  revenue: 5600, cost_net: 1735, cost_vat: 70, profit_worst: 3795, margin_worst_pct: 67.8 };
const T2 = { id: 2, trip_type: 'PARTNER', partner_id: 21, date_start: '2026-10-19', date_end: '2026-10-21', status: 'closed',
  revenue: 3000, cost_net: 2100, cost_vat: 0, profit_worst: 900, margin_worst_pct: 30 };
const COMMON = {
  complete: [{ rt_id: 1, missing: [], complete: true }, { rt_id: 2, missing: [], complete: true }],
  cost_cat: [
    { rt_id: 1, category: 'fuel', toll_country: 'BG', lines: 2, net: 600, vat: 0 }, { rt_id: 1, category: 'reefer_fuel', toll_country: null, lines: 1, net: 100, vat: 0 },
    { rt_id: 1, category: 'tolls', toll_country: 'MK', lines: 2, net: 40, vat: 0 }, { rt_id: 1, category: 'tolls', toll_country: 'HU', lines: 1, net: 200, vat: 54 },
    { rt_id: 1, category: 'accommodation', toll_country: null, lines: 1, net: 25, vat: 16 }],
  costs: [{ rt_id: 1, lines_net: 1685, vat: 70, wear: 50, dl_trip_value: 650, dl_expenses: 70, partner_planned: 0, partner_invoiced: 0 },
    { rt_id: 2, lines_net: 2100, vat: 0, wear: 0, dl_trip_value: null, dl_expenses: null, partner_planned: 2100, partner_invoiced: 0 }],
  rts: [{ id: 1, model: 1 }, { id: 2, model: 1 }], partner_cost: [],
  legs: [{ id: 10, rt_id: 1, seq: 1, order_id: 100 }, { id: 11, rt_id: 1, seq: 2, order_id: 101 }],
  orders: [{ id: 100, direction: 'Export', client_id: 31, loading_datetime: '2026-10-17', delivery_datetime: '2026-10-19', loading_location_1_id: 41, unloading_location_1_id: 42, loading_pallets_1: 33 },
    { id: 101, direction: 'Import', client_id: 32, loading_datetime: '2026-10-20', delivery_datetime: '2026-10-22', loading_location_1_id: 43, unloading_location_1_id: 41, loading_pallets_1: 26 }],
  clients: [{ id: 31, company_name: 'Πελάτης Ένα' }, { id: 32, company_name: 'Πελάτης Δύο' }],
  locations: [{ id: 41, city: 'Βέροια' }, { id: 42, city: 'Wien' }, { id: 43, city: 'Brno' }],
  nat_loads: [], nat_orders: [], v5_lines: [], truncated: false
};
const TRIP = { ...COMMON, trips: [T1], revenue_legs: [
  { rt_id: 1, source: 'leg', leg_id: 10, order_id: 100, carries_price: true, intl_price: 3200, intl_vs_charge: 100, rev_intl: 3100, rev_natl: 0 },
  { rt_id: 1, source: 'leg', leg_id: 11, order_id: 101, carries_price: true, intl_price: 2500, intl_vs_charge: 0, rev_intl: 2500, rev_natl: 0 }] };
const WEEK = { ...COMMON, trips: [T1, T2], revenue_legs: [] };

async function open(browser, q, { pnl, pnlStatus = 200, role = 'owner' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript((role) => {
    localStorage.setItem('tms_jwt', 'rig-token');
    localStorage.setItem('tms_user', JSON.stringify({ name: 'Δοκιμαστής', role }));
    window.__printCalls = 0; window.print = () => { window.__printCalls++; };
  }, role);
  await page.route('**/costs/lookups', (r) => r.fulfill({ json: LK }));
  await page.route('**/costs/pnl-paper**', (r) => r.fulfill({ status: pnlStatus, json: pnlStatus === 200 ? pnl : { error: 'Forbidden' } }));
  await page.goto(BASE + 'print_pnl.html' + q);
  await page.waitForFunction(() => document.getElementById('doc').style.display === 'block' || document.getElementById('err').style.display === 'block');
  await page.waitForTimeout(700);
  return { page, ctx, errs };
}
async function pdfBox(page, name) {
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync(path.join(SHOT_DIR, name + '.pdf'), pdf);
  const m = String(pdf).match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/);
  const pages = (String(pdf).match(/\/Type\s*\/Page(?!s)/g) || []).length;
  return m ? [Number(m[1]), Number(m[2]), pages] : null;
}

(async () => {
  const browser = await chromium.launch();
  try {
    console.log('\n[trip] ?rt=1');
    let { page, ctx, errs } = await open(browser, '?rt=1', { pnl: TRIP });
    let txt = (await page.innerText('#doc')).replace(/\s+/g, ' ');
    assert(/Αποτέλεσμα 3\.795,00 €/.test(txt), 'the result line');
    assert(/Σκόπια/.test(txt) && /Ουγγαρία/.test(txt), 'tolls per country, MK = Σκόπια');
    assert(/Χρέωση Βέροιας/.test(txt), 'the Veroia Switch charge on its own row');
    assert(!/RT-\d/.test(txt), 'no code on paper');
    assert(await page.evaluate(() => window.__printCalls) === 1, 'window.print called once');
    await page.screenshot({ path: path.join(SHOT_DIR, 'trip.png'), fullPage: true });
    let box = await pdfBox(page, 'trip');
    assert(box && Math.abs(box[0] - 595.92) < 2 && Math.abs(box[1] - 842.88) < 2, 'A4 portrait PDF ' + JSON.stringify(box));
    assert(box && box[2] === 1, 'a two-load trip with every category fits ONE page (' + (box && box[2]) + ')');
    assert(errs.length === 0, '0 page errors ' + JSON.stringify(errs));
    await ctx.close();

    console.log('\n[week] ?from=2026-10-17&to=2026-10-23');
    ({ page, ctx, errs } = await open(browser, '?from=2026-10-17&to=2026-10-23', { pnl: WEEK }));
    txt = (await page.innerText('#doc')).replace(/\s+/g, ' ');
    assert(/Σύνολο εβδομάδας 8\.600,00/.test(txt), 'the week total');
    assert(/Μόνο τα πλήρη · 2 από 2/.test(txt), '«Μόνο τα πλήρη»');
    assert(/Βέροια → Wien/.test(txt), 'the route');
    await page.screenshot({ path: path.join(SHOT_DIR, 'week.png'), fullPage: true });
    box = await pdfBox(page, 'week');
    assert(box && Math.abs(box[0] - 842.88) < 2 && Math.abs(box[1] - 595.92) < 2, 'A4 landscape PDF ' + JSON.stringify(box));
    assert(errs.length === 0, '0 page errors ' + JSON.stringify(errs));
    await ctx.close();

    console.log('\n[refuse] a cost total that does not add up');
    ({ page, ctx } = await open(browser, '?rt=1', { pnl: { ...TRIP, trips: [{ ...T1, cost_net: 1736 }] } }));
    txt = (await page.innerText('#doc')).replace(/\s+/g, ' ');
    assert(/δεν βγήκε/.test(txt) && /ΑΒΓ1001 · 17\/10/.test(txt), 'the refusal names the trip by truck and day');
    assert(await page.evaluate(() => window.__printCalls) === 0, 'window.print NOT called');
    assert(await page.$eval('#ppPrintBtn', (b) => b.disabled), 'the print button is disabled');
    await ctx.close();

    console.log('\n[roles] 403');
    ({ page, ctx } = await open(browser, '?rt=1', { pnlStatus: 403, role: 'accountant' }));
    assert(/μόνο ο ιδιοκτήτης/.test(await page.textContent('#err')), 'a non-owner: the paper is the owner\'s');
    await ctx.close();
    ({ page, ctx } = await open(browser, '?rt=1', { pnlStatus: 403, role: 'owner' }));
    assert(/χρειάζεται ενημέρωση του διακομιστή/.test(await page.textContent('#err')), 'the owner on an old Worker: update it');
    await ctx.close();
  } catch (e) {
    failed++; console.log('  ✗ CRASH: ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  console.log(`\n${passed}/${passed + failed} assertions · paper → ${SHOT_DIR}`);
  process.exit(failed ? 1 : 0);
})();
