// Rig — «Παραγγελίες › Εβδομάδα» → «Εκτύπωση»: the invoicing week on A4
// portrait paper (owner 3/11/2026, Figma 2543:7735).
//
// Same synthetic week and mocks as tests/critics/orders-week-proof.js (invented
// data only — the repo is public). Judged on the DOM of the screen and of the
// paper side by side, never on the code under test:
//   same    — one paper block per row of the screen (international RT rows and
//             national pairs), in the same order, with the screen's Σ of that row
//             (footnote marks included) — the paper computes nothing of its own.
//   state   — the paper's «Κατάσταση εβδομάδας» = the screen's, cell by cell, and
//             its count line adds up to the orders counted.
//   paper   — window.print is called once, the page is A4 portrait (the PDF of
//             the print media is measured), no «RT-» code, no «0,00», no /costs/pnl.
//   refuse  — with /costs/rt failing, nothing is printed and a toast says why.
//
// Run from the MAIN repo root (node_modules + .har), against a server of the
// tree under test:
//   cd /Users/dimitrispetras/PETRASGROUP-TMS && \
//   PW_BASE_URL=http://127.0.0.1:8795/ PW_SHOT_DIR=<scratch> node <tree>/tests/critics/orders-week-print-rig.js
const P = require('./orders-week-proof.js');
const path = require('path');
const fs = require('fs');
const os = require('os');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));

// Never inside the clone (public repo): the OS temp folder unless PW_SHOT_DIR says otherwise.
const SHOT_DIR = process.env.PW_SHOT_DIR || path.join(os.tmpdir(), 'orders-week-print-rig');
fs.mkdirSync(SHOT_DIR, { recursive: true });

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ ' + msg); } }
const squash = s => String(s || '').replace(/\s+/g, '');

// window.print is stubbed BEFORE the app loads: the rig counts the calls and the
// layer stays printed-on (body.owv-printing) for the measures below.
async function stubPrint(page) {
  await page.addInitScript(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++; }; });
}

async function screenRows(page) {
  return page.$$eval('.ow4-row.trip-row', rows => rows.map(r => {
    const s = r.querySelector('.ow4-sig'); return s ? s.textContent : '';
  }));
}
async function paperTrips(page) {
  return page.$$eval('#owvPrint .owvp-trip td.n', tds => tds.map(td => td.textContent));
}
async function screenState(page) {
  return page.$$eval('.ow4-st tbody tr, .ow4-st tfoot tr', trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => {
    const c = td.cloneNode(true); c.querySelectorAll('sup').forEach(x => x.remove()); return c.textContent.trim();
  })));
}
async function paperState(page) {
  return page.$$eval('#owvPrint .owvp-st tbody tr', trs => trs.map(tr => [...tr.querySelectorAll('td.n')].map(td => td.textContent.trim())));
}

async function runRole(browser, role) {
  console.log(`\n[${role}] Εβδομάδα → Εκτύπωση`);
  const page = await P.newPage(browser, role);
  await stubPrint(page);
  await P.openWeek(page);
  const screen = await screenRows(page);
  await page.click('[data-owv="print"]');
  await page.waitForSelector('#owvPrint .owvp', { state: 'attached', timeout: 10000 });
  assert(await page.evaluate(() => window.__printCalls) === 1, `${role}: window.print called once`);
  assert(await page.evaluate(() => document.body.classList.contains('owv-printing')), `${role}: the print layer is on while printing`);

  const paper = await paperTrips(page);
  assert(paper.length === screen.length, `${role}: one paper block per screen row (${paper.length} / ${screen.length})`);
  const diff = screen.map((s, i) => squash(s) === squash(paper[i]) ? null : `${i}: «${s}» ≠ «${paper[i]}»`).filter(Boolean);
  assert(diff.length === 0, `${role}: every block's Σ = the screen row's Σ, in the same order` + (diff.length ? ' — ' + diff.slice(0, 3).join(' · ') : ''));

  const sS = await screenState(page), pS = await paperState(page);
  assert(JSON.stringify(sS) === JSON.stringify(pS), `${role}: «Κατάσταση εβδομάδας» on paper = on screen ${JSON.stringify(pS)}`);
  const count = await page.$eval('#owvPrint .owvp-count', e => e.textContent);
  const m = count.match(/Παραγγελίες: (\d+) τιμολογημένες \+ (\d+) προς κοπή(?: \([^)]*\))? \+ (\d+) χωρίς τιμή(?: \+ (\d+) άλλες)? = (\d+)/);
  assert(!!m && (+m[1] + +m[2] + +m[3] + +(m[4] || 0)) === +m[5], `${role}: the count line adds up: «${count}»`);

  const text = await page.$eval('#owvPrint', e => e.innerText);
  assert(!/RT-\d/.test(text), `${role}: no «RT-» code on paper`);
  const amounts = await page.$$eval('#owvPrint td.n', tds => tds.map(td => td.textContent.trim()));
  const zero = amounts.filter(x => /^0,00/.test(x));
  assert(amounts.length > 0 && zero.length === 0, `${role}: no «0,00» in ${amounts.length} amount cells (no price = «—»)` + (zero.length ? ': ' + JSON.stringify(zero) : ''));
  assert(!page._log.some(u => /^PNL /.test(u)), `${role}: NO request to /costs/pnl`);
  assert(P.realErrors(page).length === 0, `${role}: 0 page/console errors: ` + JSON.stringify(P.realErrors(page)));

  // The paper as the browser prints it: print media, A4 PDF (portrait = taller than wide).
  await page.emulateMedia({ media: 'print' });
  const shown = await page.evaluate(() => {
    const vis = el => !!el && el.checkVisibility();
    return { print: vis(document.getElementById('owvPrint')), app: vis(document.getElementById('content')) };
  });
  assert(shown.print && !shown.app, `${role}: in print media only the paper shows (${JSON.stringify(shown)})`);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync(path.join(SHOT_DIR, `print-${role}.pdf`), pdf);
  const box = String(pdf).match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/);
  assert(!!box && Math.abs(+box[1] - 595.92) < 2 && Math.abs(+box[2] - 842.88) < 2, `${role}: the PDF page is A4 portrait (${box ? box[1] + ' × ' + box[2] : 'no MediaBox'})`);
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.screenshot({ path: path.join(SHOT_DIR, `print-${role}.png`), fullPage: true });
  await page.context().close();
}

async function runRefuse(browser) {
  console.log('\n[owner] /costs/rt fails → no paper');
  const page = await P.newPage(browser, 'owner', { rtFail: true });
  await stubPrint(page);
  await P.openWeek(page);
  await page.click('[data-owv="print"]');
  await page.waitForTimeout(400);
  assert(await page.evaluate(() => window.__printCalls) === 0, 'rtFail: window.print NOT called');
  const toastText = await page.evaluate(() => [...document.querySelectorAll('.toast, #toast, [class*="toast"]')].map(e => e.textContent).join(' '));
  assert(/Η εκτύπωση δεν βγήκε/.test(toastText) && /δρομολόγια/.test(toastText), 'rtFail: a toast says the print did not go out and why: ' + toastText.replace(/\s+/g, ' ').slice(0, 160));
  await page.context().close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await runRole(browser, 'owner');
    await runRole(browser, 'accountant');
    await runRefuse(browser);
  } catch (e) {
    failed++;
    console.log('  ✗ ΚΑΤΑΡΡΕΥΣΗ: ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  console.log(`\n${passed}/${passed + failed} assertions · paper → ${SHOT_DIR}`);
  process.exit(failed ? 1 : 0);
})();
