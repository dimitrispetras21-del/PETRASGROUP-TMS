// Critics #2 and #5 from DESIGN.md. Neither is about looks; both are about
// truth: does the wrong role see money, and does "nobody wrote this" ever
// render the same as "this is zero".
//
// Run with CAPTURE=1 to WRITE docs/redesign/semantics-baseline.json (today's
// known violations). Run without it to CHECK the app against that baseline.
//
// Ratchet, not absolute zero — same reasoning as docs/redesign/baseline.json
// (critics #3/#4) and error-baseline.json (critic #6): these screens hold
// real violations today, found on first run. Asserting zero would paint all
// 11 units red from day one, and a suite that starts all-red gets ignored
// within a week. So today's violations become the recorded backlog; a
// critic only fails on something NEW, beyond what's already recorded. The
// backlog itself is fixed later, inside each unit's own redesign — not here.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const UNITS = require('./units');
const { preparePage, gotoPage } = require('./auth');

const CAPTURE = process.env.CAPTURE === '1';
const FILE = 'docs/redesign/semantics-baseline.json';

// Locked owner decision, 23/8/2026: a dispatcher never sees P&L. Price stays
// visible until the P&L phase; margin, profit, revenue and fuel do not.
const FORBIDDEN_FOR_DISPATCHER = [
  'Gross Profit', 'Margin Percent', 'Client Revenue', 'Καθαρό Κέρδος', 'Περιθώριο',
];

function readBaseline() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { return { pnlLeaks: {}, zeroSuspects: {} }; }
}

// Sorted keys (units, then routes) so a re-capture produces a small, readable
// diff instead of reordering the whole file — same convention contract.spec.js
// uses for error-baseline.json.
function writeBaseline(b) {
  const sortObj = (o) => {
    const out = {};
    for (const k of Object.keys(o).sort()) out[k] = o[k];
    return out;
  };
  const sorted = { pnlLeaks: {}, zeroSuspects: {} };
  for (const unit of Object.keys(b.pnlLeaks).sort()) sorted.pnlLeaks[unit] = sortObj(b.pnlLeaks[unit]);
  for (const unit of Object.keys(b.zeroSuspects).sort()) sorted.zeroSuspects[unit] = sortObj(b.zeroSuspects[unit]);
  fs.writeFileSync(FILE, JSON.stringify(sorted, null, 2) + '\n');
}

for (const unit of UNITS) {
  test(`roles: ${unit.unit} hides P&L from dispatcher`, async ({ page, baseURL }) => {
    await preparePage(page, 'dispatcher');
    const baseline = readBaseline();
    const known = baseline.pnlLeaks[unit.unit] || {};
    const routeLeaks = {};
    const newLeaks = [];

    for (const route of unit.routes) {
      // Deviation from the brief's page.goto('app.html#/'+route): the app
      // never reads location.hash — see tests/critics/auth.js. gotoPage
      // drives the app's real navigation mechanism (a cookie->localStorage
      // bridge) instead.
      await gotoPage(page, route, baseURL);
      await page.waitForTimeout(2000);
      const body = await page.locator('body').innerText();

      const found = FORBIDDEN_FOR_DISPATCHER.filter(term => body.includes(term));
      routeLeaks[route] = found;

      const knownForRoute = new Set(known[route] || []);
      for (const term of found) {
        if (!knownForRoute.has(term)) newLeaks.push(`${route}: «${term}»`);
      }
    }

    if (CAPTURE) {
      baseline.pnlLeaks[unit.unit] = routeLeaks;
      writeBaseline(baseline);
      return;
    }

    expect(newLeaks,
      `${unit.unit}: ΝΕΑ διαρροή P&L σε dispatcher, πέρα από το καταγεγραμμένο baseline:\n${newLeaks.join('\n')}`
    ).toHaveLength(0);
  });

  test(`unknown-is-not-zero: ${unit.unit}`, async ({ page, baseURL }) => {
    await preparePage(page, 'owner');
    const baseline = readBaseline();
    const allowed = baseline.zeroSuspects[unit.unit] || {};
    const routeCounts = {};
    const overLimit = [];

    for (const route of unit.routes) {
      await gotoPage(page, route, baseURL);
      await page.waitForTimeout(2500);   // async data loads

      // DESIGN.md #3: a value that was never entered must render as a dash
      // or as "δεν έχει καταχωρηθεί" — never as 0 / 0% / €0. An unwritten
      // cost shown as €0 reads as pure profit.
      //
      // Detection: a cell holding EXACTLY "€0" / "0%" / "0 €" is the shape a
      // missing value takes. A real zero is written "0,00 €", which these
      // exact-match locators do not touch.
      const suspects = await page.locator(
        'td:text-is("€0"), td:text-is("0%"), td:text-is("0 €")'
      ).count();
      routeCounts[route] = suspects;

      const limit = allowed[route] ?? 0;
      if (suspects > limit) overLimit.push(`${route}: ${suspects} κελιά > όριο ${limit}`);
    }

    if (CAPTURE) {
      baseline.zeroSuspects[unit.unit] = routeCounts;
      writeBaseline(baseline);
      return;
    }

    expect(overLimit,
      `${unit.unit}: κελιά δείχνουν μηδέν αντί για «δεν καταχωρήθηκε», πάνω από το καταγεγραμμένο όριο (DESIGN.md #3):\n${overLimit.join('\n')}`
    ).toHaveLength(0);
  });
}
