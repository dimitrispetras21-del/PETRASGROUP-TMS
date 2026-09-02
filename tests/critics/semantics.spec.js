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
const { guardWidening } = require('./ratchet');

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

// PROOF OF RENDER — without this both critics below are vacuous.
//
// Both work by looking for something BAD: a forbidden P&L term in the body,
// a cell reading "€0". A screen that never rendered — bounced to index.html,
// crashed to its error boundary, still on "Loading..." — contains neither, so
// both critics went GREEN on a blank page. That is the worst possible failure
// mode for a critic: it reports safety precisely when it has checked nothing.
//
// So every route asserts it actually rendered before it is judged, mirroring
// what contract.spec.js already does under CAPTURE (`μηδέν πεδία — η οθόνη δεν
// φόρτωσε`). Two conditions, because they fail differently: #sidebar visible
// means the app shell mounted and auth did not bounce us; non-empty #content
// means the router actually painted a screen into it.
async function assertRendered(page, unit, route) {
  await expect(page.locator('#sidebar'),
    `${unit.unit}/${route}: το κέλυφος δεν φόρτωσε — ο έλεγχος δεν είδε οθόνη`)
    .toBeVisible({ timeout: 15000 });
  const body = (await page.locator('#content').innerText()).trim();
  expect(body.length,
    `${unit.unit}/${route}: κενή οθόνη — ο έλεγχος θα περνούσε χωρίς να ελέγξει τίποτα`)
    .toBeGreaterThan(0);
  // Μη-κενό ΔΕΝ σημαίνει απέδωσε. Μετρήθηκε 3/9/2026: το audit_trail έδειχνε
  // «No session token. Sign in again.» (207 bytes) και περνούσε ως «απέδωσε».
  // Ένα μήνυμα αποτυχίας auth ΕΙΝΑΙ περιεχόμενο για το innerText — δεν είναι
  // οθόνη. Οι δύο υπογραφές είναι αυτές που ο κώδικας όντως γράφει
  // (audit_trail.js:60, core/api.js 401 path)· κάθε νέα προστίθεται ΜΕ την
  // περίπτωση που την έφερε, όχι προληπτικά.
  expect(/No session token|Sign in again/.test(body),
    `${unit.unit}/${route}: η οθόνη έδειξε μήνυμα auth αντί για περιεχόμενο — ο έλεγχος δεν είδε οθόνη:\n${body.slice(0, 120)}`)
    .toBe(false);
  return body;
}

// Units with no routes (today: 'styles' = assets/style.css) have no screen to
// drive; the static critics are their whole coverage. See contract.spec.js.
const LIVE_UNITS = UNITS.filter(u => u.routes.length > 0);

for (const unit of LIVE_UNITS) {
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
      await assertRendered(page, unit, route);
      const body = await page.locator('body').innerText();

      const found = FORBIDDEN_FOR_DISPATCHER.filter(term => body.includes(term));
      routeLeaks[route] = found;

      const knownForRoute = new Set(known[route] || []);
      for (const term of found) {
        if (!knownForRoute.has(term)) newLeaks.push(`${route}: «${term}»`);
      }
    }

    if (CAPTURE) {
      // A re-capture may record FEWER leaks, never a new one without an
      // explicit flag — see ratchet.js.
      guardWidening(`semantics-baseline.json / pnlLeaks / ${unit.unit}`, newLeaks.map(l => `ΝΕΑ διαρροή P&L — ${l}`));
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
      await assertRendered(page, unit, route);

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
      // Same ratchet: a re-capture may record FEWER zero-cells per route,
      // never more without an explicit flag — see ratchet.js. `overLimit` is
      // already exactly the list of routes whose count went UP.
      guardWidening(`semantics-baseline.json / zeroSuspects / ${unit.unit}`,
        overLimit.map(o => `ΠΕΡΙΣΣΟΤΕΡΑ κελιά «μηδέν αντί για κενό» — ${o}`));
      baseline.zeroSuspects[unit.unit] = routeCounts;
      writeBaseline(baseline);
      return;
    }

    expect(overLimit,
      `${unit.unit}: κελιά δείχνουν μηδέν αντί για «δεν καταχωρήθηκε», πάνω από το καταγεγραμμένο όριο (DESIGN.md #3):\n${overLimit.join('\n')}`
    ).toHaveLength(0);
  });

  // ── Κριτής πλάτους ────────────────────────────────────────────────────────
  // ΓΙΑΤΙ ΥΠΑΡΧΕΙ: στις 29/8/2026 ο πίνακας Πελατών χρειαζόταν 1411px, έπαιρνε
  // 1138px και έκοβε ΟΛΟΚΛΗΡΗ τη στήλη ΚΑΤΑΣΤΑΣΗ — ενώ δίπλα του έμεναν 482px
  // αχρησιμοποίητα (το κλειστό detail panel κρατούσε πλάτος· βλ. style.css,
  // «ΜΗΝ αφαιρεθεί το .hidden»). Κανένας από τους έξι κριτές δεν το είδε: το
  // συμβόλαιο μετράει ΑΝ υπάρχει η στήλη στο DOM, όχι αν ΦΑΙΝΕΤΑΙ. Η σουίτα
  // ήταν κατάφωτη πράσινη πάνω από μια οθόνη με κρυμμένη στήλη.
  //
  // ΓΙΑΤΙ 1920×1080 ΡΗΤΑ: το playwright.config δίνει 1280×720 (Desktop Chrome),
  // όπου η οριζόντια κύλιση είναι ΘΕΜΙΤΗ. Ο κανόνας #5 μιλάει για 1080p — σε
  // στενότερη οθόνη ο έλεγχος θα έβγαζε ψευδείς συναγερμούς σε κάθε πίνακα.
  test(`layout: ${unit.unit} χωρίς οριζόντια υπερχείλιση στα 1080p`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await preparePage(page, 'owner');
    const over = [];

    for (const route of unit.routes) {
      await gotoPage(page, route, baseURL);
      await page.waitForTimeout(2500);
      await assertRendered(page, unit, route);

      // 2px ανοχή: στρογγυλοποιήσεις υποδιαιρέσεων pixel σε πίνακες με
      // border-collapse δίνουν σταθερά διαφορές <1px που δεν είναι κοπή.
      const found = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('*')) {
          const ox = getComputedStyle(el).overflowX;
          if (ox !== 'auto' && ox !== 'scroll') continue;
          const cut = el.scrollWidth - el.clientWidth;
          if (cut > 2) out.push(`${el.tagName}.${(el.className || '').toString().trim().slice(0, 40)} −${cut}px`);
        }
        return out;
      });
      for (const f of found) over.push(`${route}: ${f}`);
    }

    // Απόλυτος κανόνας, ΟΧΙ καστάνια: σε αντίθεση με hex/κοπή/μηδενικά εδώ δεν
    // υπάρχει καταγεγραμμένο χρέος — μετρήθηκε 29/8 και οι έξι οθόνες της
    // μονάδας entity είναι στο 1618/1618. Ό,τι εμφανιστεί είναι ΝΕΟ.
    expect(over,
      `${unit.unit}: περιεχόμενο κομμένο οριζόντια στα 1920×1080 — ο χρήστης πρέπει να κυλήσει για να δει στήλες (DESIGN.md #5):\n${over.join('\n')}`
    ).toHaveLength(0);
  });
}
