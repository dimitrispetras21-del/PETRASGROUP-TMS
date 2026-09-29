// Proof rig — Orders catalog load (perf 29/9, owner «ok για κατάλογο»).
// Recorded 28/8 backend (HAR) + a few stubs for requests the recording lacks:
//   1. LOCATIONS is read ONCE, in the reference-preload shape — never the old
//      whole-table shape (no fields[]) that the pickers and the boot preload
//      used to read a second time.
//   2. No ORDER_STOPS request before a card opens; opening an international
//      card reads its stops (one request) and prints them.
//   3. While names are loading, rows show «…» (never «—» or a record id);
//      when the reference preload FAILS, the list says so and no «…» stays.
//   4. A card whose stops fail says so, instead of looking like «no stops».
// Run from the MAIN repo root:
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<wt>/ node .claude/worktrees/<wt>/tests/critics/orders-catalog-load-proof.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const HAR = path.resolve(process.cwd(), '.har', 'tms.har');
const T = { LOCATIONS: 'tblxu8DRfTQOFRCzS', STOPS: 'tblaeY5QOHAS1gyE8', TRUCKS: 'tblEAPExIAjiA3asD', NAT_LOADS: 'tblVW42cZnfC47gTb' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

// From the recording: the reference TRUCKS page (recorded before «Tachograph
// Expiry» joined the ref fields) and every ORDER_STOPS record, so a card's
// own stop query can be answered.
const har = JSON.parse(fs.readFileSync(HAR, 'utf8')).log.entries;
const trucksRef = har.find(e => e.request.url.includes(T.TRUCKS) && /KEK%20Expiry|KEK Expiry/.test(e.request.url) && !/Year/.test(e.request.url) && e.response.status === 200).response.content.text;
const stopsById = {};
har.filter(e => e.request.url.includes(T.STOPS) && e.response.status === 200).forEach(e => {
  try { (JSON.parse(e.response.content.text || '{}').records || []).forEach(r => { stopsById[r.id] = r; }); } catch (_) { /* not JSON */ }
});

async function newPage(browser, opts) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1600, height: 960 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page._reqs = [];
  page.on('request', r => { if (r.url().includes(HOST)) page._reqs.push(decodeURIComponent(r.url())); });
  await preparePage(page, 'owner');
  await page.addInitScript(() => localStorage.setItem('tms_orders_hub_demo_owner', JSON.stringify({ scope: 'all', view: 'catalog' })));
  // Registered AFTER the HAR replay → handled first; the rest falls back to the HAR.
  await page.route(`**/${HOST}/**`, async route => {
    const u = decodeURIComponent(route.request().url());
    if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs));
    if (opts.locFail && u.includes(T.LOCATIONS)) return json(route, { error: 'stub: locations down' }, 500);
    if (u.includes(T.TRUCKS) && /Tachograph/.test(u) && !/Year/.test(u)) return opts.refFail ? json(route, { error: 'stub: ref down' }, 500) : json(route, trucksRef);
    if (u.includes(T.NAT_LOADS) && /Source National Order/.test(u)) return json(route, { records: [] });
    if (/tblOrderDocuments/.test(u)) return json(route, { records: [] });
    if (u.includes(T.STOPS) && /RECORD_ID/.test(u)) {
      if (opts.stopsFail) return json(route, { error: 'stub: stops down' }, 500);
      const want = u.match(/rec[A-Za-z0-9]{14}/g) || [];
      return json(route, { records: want.map(i => stopsById[i]).filter(Boolean) });
    }
    return route.fallback();
  });
  return page;
}
const rowsText = page => page.$$eval('#ocTable tbody tr[onclick]', trs => trs.map(tr => tr.innerText));

(async () => {
  const browser = await chromium.launch();

  console.log('\n── cold open, 250 ms per request');
  let page = await newPage(browser, { delayMs: 250 });
  await gotoPage(page, 'orders', BASE);
  await page.waitForSelector('#ocTable tbody tr[onclick]', { timeout: 120000 });
  const first = await rowsText(page);
  ok(!first.some(t => /rec[A-Za-z0-9]{14}/.test(t)), 'first paint: no record id printed as a name');
  await page.waitForFunction(() => ![...document.querySelectorAll('#ocTable tbody tr[onclick]')].some(tr => tr.innerText.includes('…')), null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const names = await rowsText(page);
  ok(names.length > 0 && names.every(t => !t.includes('…')), `names landed: ${names.length} rows, no «…» left`);
  const locReqs = page._reqs.filter(u => u.includes(T.LOCATIONS));
  const locShapes = new Set(locReqs.map(u => (u.match(/fields\[\]=[^&]+/g) || []).join('&')));
  ok(locShapes.size === 1 && [...locShapes][0].includes('fields[]=Name'), `LOCATIONS read in ONE shape (the reference fields): ${[...locShapes].map(s => s || '(no fields — whole table)').join(' | ')}`);
  ok(!locReqs.some(u => !/fields\[\]/.test(u)), 'no whole-table LOCATIONS read (the old picker/boot copy)');
  const firstPage = locReqs.filter(u => !/offset=/.test(u)).length;
  ok(firstPage >= 1 && firstPage <= 2, `LOCATIONS first page requested ${firstPage}× (preload + at most its background revalidate)`);
  ok(!page._reqs.some(u => u.includes(T.STOPS)), 'no ORDER_STOPS request before a card opens');

  console.log('\n── open an international card');
  const intlId = await page.$eval('#ocTable tbody tr[onclick*="\'intl\'"]', tr => tr.getAttribute('onclick').match(/'(rec[^']+)'\)/)[1]);
  const before = page._reqs.length;
  await page.evaluate(id => OrdersCatalog.open('intl', id), intlId);
  await page.waitForFunction(() => { const p = document.getElementById('intlDetail'); return p && !p.classList.contains('hidden') && !/Φόρτωση στάσεων/.test(p.innerText); }, null, { timeout: 20000 });
  const stopReqs = page._reqs.slice(before).filter(u => u.includes(T.STOPS));
  ok(stopReqs.length === 1, `card open → ${stopReqs.length} ORDER_STOPS request`);
  const card = await page.$eval('#intlDetail', p => p.innerText);
  // innerText follows the CSS (uppercase labels: «ΦΟΡΤΩΣΗ»); a stop line ends in «N παλ.».
  ok(/ΦΟΡΤΩΣΗ/.test(card) && /ΠΑΡΑΔΟΣΗ/.test(card) && /\d+ παλ\./.test(card) && !/δεν φορτώθηκαν/.test(card), 'card prints its loading/delivery stops (with pallets)');
  await page.context().close();

  console.log('\n── reference preload fails');
  page = await newPage(browser, { refFail: true });
  await gotoPage(page, 'orders', BASE);
  await page.waitForSelector('#ocTable tbody tr[onclick]', { timeout: 120000 });
  await page.waitForFunction(() => /στοιχεία στόλου και συνεργατών δεν φορτώθηκαν/.test((document.getElementById('ocWarns') || {}).innerText || ''), null, { timeout: 60000 });
  ok(true, 'banner «Τα στοιχεία στόλου και συνεργατών δεν φορτώθηκαν …» shown');
  await page.waitForTimeout(500);
  ok(!(await rowsText(page)).some(t => t.includes('…')), 'no «…» left after the failure (it is said, not left pending)');

  console.log('\n── locations fail (the national cards print their labels)');
  await page.context().close();
  page = await newPage(browser, { locFail: true });
  await gotoPage(page, 'orders', BASE);
  await page.waitForSelector('#ocTable tbody tr[onclick]', { timeout: 120000 });
  await page.waitForFunction(() => /στάσεις στην καρτέλα των εθνικών/.test((document.getElementById('ocWarns') || {}).innerText || ''), null, { timeout: 90000 });
  ok(true, 'national banner «Οι τοποθεσίες δεν φορτώθηκαν — οι στάσεις στην καρτέλα των εθνικών …» shown');
  ok(!(await rowsText(page)).some(t => t.includes('…')), 'no «…» left after the locations failure');

  console.log('\n── a card whose stops fail');
  const id2 = await page.$eval('#ocTable tbody tr[onclick*="\'intl\'"]', tr => tr.getAttribute('onclick').match(/'(rec[^']+)'\)/)[1]);
  await page.context().close();
  page = await newPage(browser, { stopsFail: true });
  await gotoPage(page, 'orders', BASE);
  await page.waitForSelector('#ocTable tbody tr[onclick]', { timeout: 120000 });
  await page.evaluate(id => OrdersCatalog.open('intl', id), id2);
  await page.waitForFunction(() => /Οι στάσεις δεν φορτώθηκαν/.test((document.getElementById('intlDetail') || {}).innerText || ''), null, { timeout: 45000 });
  ok(true, 'card says «Οι στάσεις δεν φορτώθηκαν — δεν σημαίνει ότι δεν υπάρχουν»');
  await page.context().close();

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
