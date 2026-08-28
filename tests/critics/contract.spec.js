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

// ── Critic #6 ratchet ────────────────────────────────────────────────────
// WHY this exists: replaying a HAR is not the same runtime as a live
// backend. Some console errors are baked into what got recorded regardless
// of app correctness — e.g. weekly_natl hits /local_moves, which genuinely
// 404s in PRODUCTION today (CLAUDE.md: "στο repo αλλά ΔΕΝ έχουν γίνει
// deploy" — real behaviour, not a rig artifact); pallets and audit hit
// endpoints (/pallets/gate, /app-errors) the recorded session never called,
// so HAR replay's notFound:'abort' fails them the same way a genuinely
// missing recording always does. Asserting zero console errors on top of
// that would paint units red for reasons that have nothing to do with a
// real regression in the unit's own code — and a suite that's always red
// gets ignored, the exact failure mode that made docs/redesign/baseline.json
// a ratchet instead of a hard zero for critics #3/#4. So #6 records what
// was observed at CAPTURE time as a per-unit baseline (this file) and fails
// only when a signature shows up that was NOT already there — a genuinely
// NEW console error, which is the thing worth stopping on.
const ERR_FILE = 'docs/redesign/error-baseline.json';

// Console noise inherent to the test rig itself, not to any one unit — same
// filter tests/e2e/smoke.spec.js already uses against the LIVE app.
function stripRigNoise(errors) {
  return errors.filter(e =>
    !e.includes('presence') && !e.includes('favicon') && !/sentry/i.test(e));
}

// Collapse a raw error to a STABLE signature so the same underlying error
// compares equal run after run: `?v=<timestamp>` cache-busts on every
// deploy (CLAUDE.md's own ?v=TIMESTAMP convention), Airtable record ids
// differ between HAR recordings, and week-relative ISO dates in filter URLs
// (e.g. weekly_natl's local_moves query) shift with "today". Only the first
// line is kept: a full stack trace's line/column numbers shift whenever
// unrelated code in the same file changes, which would make the baseline
// brittle for no benefit — the message line is what identifies the error.
function normalizeError(raw) {
  return raw
    .split('\n')[0]
    .replace(/\?v=\d+/g, '?v=X')
    .replace(/\brec[A-Za-z0-9]{14,}\b/g, 'recXXXXX')
    .replace(/\d{4}-\d{2}-\d{2}/g, 'YYYY-MM-DD')
    .trim();
}

function readErrorBaseline() {
  try { return JSON.parse(fs.readFileSync(ERR_FILE, 'utf8')); }
  catch (e) { return {}; }
}

function writeErrorBaseline(baseline) {
  const sorted = {};
  for (const k of Object.keys(baseline).sort()) sorted[k] = baseline[k];
  fs.writeFileSync(ERR_FILE, JSON.stringify(sorted, null, 2) + '\n');
}

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

    // Critic #6 signal — normalized + deduplicated so it's stable and
    // comparable against docs/redesign/error-baseline.json either way.
    const signatures = [...new Set(stripRigNoise(errors).map(normalizeError))].sort();

    if (CAPTURE) {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(now, null, 2) + '\n');

      const baseline = readErrorBaseline();
      baseline[unit.unit] = signatures;
      writeErrorBaseline(baseline);

      expect(now.fields.length, `${unit.unit}: μηδέν πεδία — η οθόνη δεν φόρτωσε`)
        .toBeGreaterThan(0);
      return;
    }

    // Critic #6 — ratchet against the recorded baseline, not zero-tolerance.
    // See the block above readErrorBaseline() for why.
    const baseline = readErrorBaseline();
    const known = new Set(baseline[unit.unit] || []);
    const newErrors = signatures.filter(s => !known.has(s));
    expect(newErrors, `${unit.unit}: ΝΕΑ σφάλματα κονσόλας (όχι στο baseline):\n${newErrors.join('\n')}`)
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
