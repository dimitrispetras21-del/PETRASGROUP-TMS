// Φ0 inventory + critics #1 and #6.
//
// Run with CAPTURE=1 to WRITE the contracts (the Φ0 inventory).
// Run without it to CHECK the current app against the committed contracts.
// Same traversal both ways, so the check can never drift from the capture.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const UNITS = require('./units');
const { preparePage, gotoPage } = require('./auth');

const DIR = 'docs/redesign/contracts';
const CAPTURE = process.env.CAPTURE === '1';

// A "field" is any column header or labelled value the screen presents.
// An "action" is anything the user can click that changes state.
async function readContract(page, unit, baseURL) {
  const endpoints = new Set();
  page.on('request', r => {
    const m = r.url().match(/tbl[A-Za-z0-9]{14}/);
    if (m) endpoints.add(`${r.method()} ${m[0]}`);
  });

  const fields = new Set();
  const actions = new Set();

  for (const route of unit.routes) {
    // Deviation from the plan's original `page.goto('app.html#/'+route)`:
    // the app never reads location.hash (verified by grep — no hashchange
    // listener, no location.hash read anywhere). That goto would always
    // land on whatever 'tms_page' last was, i.e. every unit's every route
    // rendering identically. gotoPage drives the app's real mechanism
    // instead — see tests/critics/auth.js for the full explanation.
    await gotoPage(page, route, baseURL);
    await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2500);   // async data loads

    for (const t of await page.locator('th, [data-field], label').allTextContents()) {
      const s = t.trim();
      if (s) fields.add(s);
    }
    for (const t of await page.locator('button, [data-action]').allTextContents()) {
      const s = t.trim();
      if (s) actions.add(s);
    }
  }

  return {
    unit: unit.unit,
    tier: unit.tier,
    fields:    [...fields].sort(),
    actions:   [...actions].sort(),
    endpoints: [...endpoints].sort(),
  };
}

for (const unit of UNITS) {
  test(`contract: ${unit.unit}`, async ({ page, baseURL }) => {
    await preparePage(page, 'owner');

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    const now = await readContract(page, unit, baseURL);
    const file = path.join(DIR, `${unit.unit}.json`);

    if (CAPTURE) {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(now, null, 2) + '\n');
      expect(now.fields.length, `${unit.unit}: μηδέν πεδία — η οθόνη δεν φόρτωσε`)
        .toBeGreaterThan(0);
      return;
    }

    // Critic #6 — same known-benign filter as tests/e2e/smoke.spec.js
    const critical = errors.filter(e =>
      !e.includes('presence') && !e.includes('favicon') && !/sentry/i.test(e));
    expect(critical, `${unit.unit}: σφάλματα κονσόλας:\n${critical.join('\n')}`)
      .toHaveLength(0);

    const before = JSON.parse(fs.readFileSync(file, 'utf8'));
    const lost = before.fields.filter(f => !now.fields.includes(f));

    // Critic #1 — hard gate on tier 1, report-only on tier 3 (spec §6.1).
    if (unit.tier === 1) {
      expect(lost, `${unit.unit}: ΧΑΘΗΚΑΝ πεδία: ${lost.join(', ')}`).toHaveLength(0);
    } else if (lost.length) {
      const added = now.fields.filter(f => !before.fields.includes(f));
      console.log(`\n⚠ ${unit.unit} (tier 3) διαφορά συμβολαίου — θέλει έγκριση στη Φ6:`);
      console.log(`  αφαιρέθηκαν: ${lost.join(', ') || '—'}`);
      console.log(`  προστέθηκαν: ${added.join(', ') || '—'}`);
    }

    const lostEp = before.endpoints.filter(e => !now.endpoints.includes(e));
    expect(lostEp, `${unit.unit}: έπαψαν κλήσεις: ${lostEp.join(', ')}`).toHaveLength(0);
  });
}
