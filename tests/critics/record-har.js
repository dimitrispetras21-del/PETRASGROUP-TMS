// One-off HAR recorder. Run by the OWNER, interactively, once.
//
// Why a HAR instead of a stored JWT: the token expires in 8 hours, so a stored
// session would silently rot and the critics would start passing against an
// error page. A HAR is frozen data — the critics stay deterministic, and no
// credential ever reaches the agent or the repo.
//
// Usage:  node tests/critics/record-har.js
// The browser opens. Log in by hand, click through every page in the sidebar,
// then close the window. The HAR lands in .har/tms.har (gitignored).

const { chromium } = require('@playwright/test');
const path = require('path');

const BASE = process.env.PW_BASE_URL
  || 'https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    recordHar: { path: path.resolve('.har/tms.har'), content: 'embed' },
    locale: 'el-GR',
    timezoneId: 'Europe/Athens',
  });
  const page = await context.newPage();
  await page.goto(BASE);

  console.log('\n>>> Κάνε login και πέρασε από ΚΑΘΕ σελίδα του sidebar.');
  console.log('>>> Όταν τελειώσεις, κλείσε το παράθυρο του browser.\n');

  await page.waitForEvent('close', { timeout: 0 });
  await context.close();   // flushes the HAR to disk
  await browser.close();
  console.log('HAR γράφτηκε: .har/tms.har');
})();
