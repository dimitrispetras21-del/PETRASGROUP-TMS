// @ts-check
// Playwright configuration for Petras Group TMS E2E tests.
// Run with: npm run e2e
// Tests run against the live GitHub Pages deploy by default; override with PW_BASE_URL env var.

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 45 * 1000,
  expect: { timeout: 10 * 1000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PW_BASE_URL || 'https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'el-GR',
    timezoneId: 'Europe/Athens',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // tests/critics/*.test.js run under node:test, not here (no @playwright/test
    // globals). Only *.spec.js are Playwright tests, so this project is
    // scoped to those two files — it must NOT pick up the node:test files by
    // matching the whole directory.
    {
      name: 'critics',
      testDir: './tests/critics',
      // kanban.spec.js προστέθηκε 3/9/2026: ο κριτής των δύο kanban οθονών
      // (weekly_intl/natl). Η λίστα είναι ΚΛΕΙΣΤΗ επίτηδες — units.test.js/
      // static.test.js τρέχουν σε node:test, όχι εδώ. Νέος κριτής = νέα γραμμή
      // εδώ ΚΑΙ στο EXPECTED_LIVE του run.js, αλλιώς δεν τρέχει ποτέ.
      testMatch: ['contract.spec.js', 'semantics.spec.js', 'kanban.spec.js'],
      // serviceWorkers:'block' is required, not cosmetic: sw.js registers and
      // then makes its own fetches from the worker execution context, which
      // page.routeFromHAR (page-scoped) cannot see. Those requests fall
      // through to the LIVE backend, which 401s a fake session — the app's
      // auth guard reads that as "logged out" and bounces to index.html,
      // producing an app.html<->index.html loop that empties every contract.
      // Confirmed by a probe: identical run, only this option differs,
      // fixes 11/11 units getting stuck on "Loading...".
      use: { ...devices['Desktop Chrome'], serviceWorkers: 'block' },
      // Serial, not parallel: CAPTURE mode does a read-modify-write on the
      // SHARED docs/redesign/error-baseline.json and semantics-baseline.json
      // (each test merges its own unit's findings into the same file).
      // fullyParallel:true at the top level would let workers race those
      // files and silently drop each other's writes — exactly the "silent
      // failure" this project's own engineering principle #1 warns against.
      // Each unit's own contract file has no such risk (one file per unit),
      // but the shared baseline
      // does, so the whole project runs serially.
      fullyParallel: false,
    },
  ],
});
