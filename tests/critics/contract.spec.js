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
const { guardWidening } = require('./ratchet');

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

// WHY this exists: button/badge labels in this app embed LIVE operational
// numbers — counts of expired compliance documents (ΚΤΕΟ/ΚΕΚ/insurance/FRC
// cold-chain certificates), fleet compliance percentages, fleet sizes,
// pending movement counts. Contracts are committed to docs/redesign/
// contracts/ on a PUBLIC repo, and the plan's own constraint (§ "Μόνο
// ονόματα πεδίων") says a contract holds FIELD NAMES only. Without this,
// e.g. "22 ληγμένα έγγραφα" gets frozen into git history as a dated,
// public statement about this company's fleet regulatory non-compliance.
// Stripping digit runs keeps the structural label ("ληγμένα έγγραφα") while
// the datum never reaches disk. Applied only to fields/actions — NOT to
// `endpoints`, which are facade table ids (tblXXXXXXXXXXXXXX) that already
// contain digits and are already public (CLAUDE.md's own facade ID table).
function sanitize(s) {
  return s.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
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
      const s = sanitize(t);
      if (s) fields.add(s);
    }
    for (const t of await page.locator('button, [data-action]').allTextContents()) {
      const s = sanitize(t);
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

// A unit with no routes (today: 'styles', which is assets/style.css) has no
// screen to drive, so there is nothing here to check — the static critics are
// its whole coverage. Skipping it at declaration time is deliberate: declaring
// a test that navigates to nothing would scrape an empty contract, and an
// empty contract is exactly the artefact this file exists to make impossible.
const LIVE_UNITS = UNITS.filter(u => u.routes.length > 0);

for (const unit of LIVE_UNITS) {
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
      // Guard against recurrence: sanitize() above should already have
      // scrubbed every digit out of fields/actions, but a contract that
      // would leak operational data must NEVER reach disk even if a future
      // change to the scraping logic reintroduces a raw source. Fail loudly
      // here rather than silently writing the leak — see engineering
      // principle #1 in CLAUDE.md ("ό,τι δεν γίνεται, πρέπει να ακούγεται").
      const leaked = [...now.fields, ...now.actions].filter(s => /\d/.test(s));
      if (leaked.length) {
        throw new Error(`${unit.unit}: contract would leak operational data — digit(s) found in fields/actions: ${leaked.join(' | ')}`);
      }

      // ORDER MATTERS, and it used to be wrong: the contract file was written
      // BEFORE this assertion, so a unit whose screen never rendered still
      // left a committed contract of zero fields behind — a file that then
      // reads as "this screen legitimately has no fields" and makes critic #1
      // a no-op for it forever. Nothing is written unless the screen actually
      // rendered.
      expect(now.fields.length, `${unit.unit}: μηδέν πεδία — η οθόνη δεν φόρτωσε`)
        .toBeGreaterThan(0);

      // A re-capture may record FEWER console errors, never new ones without
      // an explicit flag — see ratchet.js.
      const baseline = readErrorBaseline();
      const knownBefore = new Set(baseline[unit.unit] || []);
      guardWidening(`error-baseline.json / ${unit.unit}`,
        signatures.filter(s => !knownBefore.has(s)).map(s => `ΝΕΟ σφάλμα κονσόλας: ${s}`));

      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(now, null, 2) + '\n');

      baseline[unit.unit] = signatures;
      writeErrorBaseline(baseline);
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
    // `actions` was captured and committed from the start but compared by
    // nothing, so a redesign could delete every button on every screen and the
    // contract critic would still pass. A lost action is a lost capability —
    // the same class of loss as a lost field, judged the same way. Contracts
    // written before this comparison existed may predate a button; that shows
    // up as a normal tier-1 failure naming the action, which is the point.
    const lostActions = before.actions.filter(a => !now.actions.includes(a));

    // Critic #1 — hard gate on tier 1, report-only on tier 3 (spec §6.1).
    if (unit.tier === 1) {
      expect(lost, `${unit.unit}: ΧΑΘΗΚΑΝ πεδία: ${lost.join(', ')}`).toHaveLength(0);
      expect(lostActions, `${unit.unit}: ΧΑΘΗΚΑΝ ενέργειες: ${lostActions.join(', ')}`).toHaveLength(0);
    } else if (lost.length || lostActions.length) {
      const added = now.fields.filter(f => !before.fields.includes(f));
      const addedActions = now.actions.filter(a => !before.actions.includes(a));
      console.log(`\n⚠ ${unit.unit} (tier 3) διαφορά συμβολαίου — θέλει έγκριση στη Φ6:`);
      console.log(`  πεδία αφαιρέθηκαν: ${lost.join(', ') || '—'}`);
      console.log(`  πεδία προστέθηκαν: ${added.join(', ') || '—'}`);
      console.log(`  ενέργειες αφαιρέθηκαν: ${lostActions.join(', ') || '—'}`);
      console.log(`  ενέργειες προστέθηκαν: ${addedActions.join(', ') || '—'}`);
    }

    const lostEp = before.endpoints.filter(e => !now.endpoints.includes(e));
    expect(lostEp, `${unit.unit}: έπαψαν κλήσεις: ${lostEp.join(', ')}`).toHaveLength(0);
  });
}
