# Redesign Oracle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Χτίζει τον **κριτή** του redesign — απογραφή των 11 μονάδων και έξι εκτελέσιμους ελέγχους — ώστε καμία μετέπειτα αλλαγή σχεδίασης να μη χάνει πληροφορία σιωπηλά.

**Architecture:** Ένας κατάλογος μονάδων (`tests/critics/units.js`) τροφοδοτεί δύο οικογένειες ελέγχων: **στατικούς** (καθαρό Node + regex πάνω στα αρχεία) και **ζωντανούς** (Playwright πάνω στην εφαρμογή). Οι ζωντανοί τρέχουν χωρίς διαπιστευτήρια: η αυθεντικοποίηση γίνεται με ψεύτικη συνεδρία στο localStorage (υπάρχον πρότυπο `tests/e2e/smoke.spec.js`) και τα δεδομένα σερβίρονται από **ηχογραφημένο HAR**. Ένα αρχείο `baseline.json` κρατά την τρέχουσα κατάσταση ώστε οι έλεγχοι να λειτουργούν ως **καστάνια**: μια μονάδα δεν επιτρέπεται να χειροτερέψει, και μετά τον ανασχεδιασμό της το όριό της γίνεται μηδέν.

**Tech Stack:** Node 18+ (CommonJS, όπως το υπόλοιπο repo) · `@playwright/test` ^1.44 (ήδη εγκατεστημένο) · καμία νέα εξάρτηση.

## Global Constraints

- **Το repo είναι ΔΗΜΟΣΙΟ.** Ό,τι περιέχει πραγματικά δεδομένα πελατών — HAR, screenshots — **δεν γίνεται commit ποτέ**. Μόνο ονόματα πεδίων.
- **Supabase = SELECT μόνο.** Κανένα βήμα αυτού του πλάνου δεν γράφει στη βάση.
- **Κανένα deploy.** Το πλάνο δεν αγγίζει `app.html`, `modules/`, `core/`, ή τον Worker. Άρα **δεν χρειάζεται bump `?v=`**.
- **Ο agent δεν εισάγει ποτέ κωδικούς.** Το μόνο βήμα με διαπιστευτήρια (Task 1) το εκτελεί ο owner με το χέρι.
- Γλώσσα κώδικα/σχολίων: **αγγλικά**. Έγγραφα και μηνύματα commit: **ελληνικά**.
- Οι 11 μονάδες και οι 6 κριτές ορίζονται στο `docs/superpowers/specs/2026-08-28-app-redesign-graph-design.md` §3.1 και §6.

## File Structure

| Αρχείο | Ευθύνη |
|---|---|
| `tests/critics/units.js` | Ο κατάλογος των 11 μονάδων: routes, αρχεία, βαθμίδα. Μία πηγή αλήθειας. |
| `tests/critics/static.js` | Κριτές #3 (hex) και #4 (κοπή) — regex πάνω στα αρχεία, χωρίς browser. |
| `tests/critics/auth.js` | Κοινό fixture: ψεύτικη συνεδρία + επαναπαραγωγή HAR. |
| `tests/critics/contract.spec.js` | Φ0 απογραφή + κριτής #1 (συμβόλαιο) + #6 (ζωντανό). |
| `tests/critics/semantics.spec.js` | Κριτές #2 (ρόλοι) και #5 (άγνωστο ≠ μηδέν). |
| `tests/critics/run.js` | Ο ενορχηστρωτής: fan-out στις 11 μονάδες + **fan-in guard**. |
| `docs/redesign/contracts/<unit>.json` | Το συμβόλαιο κάθε μονάδας. **Commit** (μόνο ονόματα). |
| `docs/redesign/baseline.json` | Τα όρια της καστάνιας. **Commit.** |
| `docs/redesign/OBSERVATIONS.md` | Ημερολόγιο: τι έσπασε, τι πήρε παραπάνω χρόνο. Τροφοδοτεί το τελικό skill. |
| `.har/` · `docs/redesign/before/` | HAR και screenshots. **Gitignored** — περιέχουν δεδομένα πελατών. |

---

### Task 1: Ηχογράφηση HAR και απομόνωση ευαίσθητων αρχείων

Ο μόνος κόμβος που απαιτεί τον owner. Παράγει το αρχείο δεδομένων που θα ξαναπαίζεται σε κάθε επόμενο τρέξιμο, ώστε **κανένας έλεγχος να μη χρειάζεται ποτέ ξανά κωδικό**.

**Files:**
- Modify: `.gitignore`
- Create: `tests/critics/record-har.js`
- Create (τοπικά, gitignored): `.har/tms.har`

**Interfaces:**
- Consumes: τίποτα
- Produces: `.har/tms.har` — ηχογράφηση όλων των κλήσεων δικτύου· καταναλώνεται από `tests/critics/auth.js`

- [ ] **Step 1: Πρόσθεσε τα ευαίσθητα μονοπάτια στο `.gitignore`**

Πρόσθεσε στο τέλος του `.gitignore`:

```gitignore
# Redesign oracle — περιέχουν ΠΡΑΓΜΑΤΙΚΑ δεδομένα πελατών (επωνυμίες, τιμές).
# Το repo είναι δημόσιο· αυτά μένουν τοπικά.
# Βλ. docs/superpowers/plans/2026-08-28-redesign-oracle.md
.har/
docs/redesign/before/
```

- [ ] **Step 2: Επιβεβαίωσε ότι το git τα αγνοεί**

```bash
mkdir -p .har docs/redesign/before && touch .har/probe docs/redesign/before/probe.png && git status --porcelain | grep -E "\.har|before/" || echo "ΣΩΣΤΟ: αγνοούνται"
```

Expected: `ΣΩΣΤΟ: αγνοούνται`

Αν εμφανιστεί οτιδήποτε άλλο, **σταμάτα** — το `.gitignore` δεν έπιασε.

```bash
rm -f .har/probe docs/redesign/before/probe.png
```

- [ ] **Step 3: Γράψε το script ηχογράφησης**

Create `tests/critics/record-har.js`:

```js
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
```

- [ ] **Step 4: Ο OWNER τρέχει την ηχογράφηση**

```bash
node tests/critics/record-har.js
```

Expected: ανοίγει browser· ο owner κάνει login και περνάει από κάθε σελίδα· στο κλείσιμο τυπώνεται `HAR γράφτηκε: .har/tms.har`.

- [ ] **Step 5: Επαλήθευσε ότι το HAR περιέχει κλήσεις προς τον Worker**

```bash
node -e "const h=require('./.har/tms.har');const e=h.log.entries.filter(x=>/tbl[A-Za-z0-9]{14}/.test(x.request.url));console.log('κλήσεις facade:',e.length)"
```

Expected: αριθμός **> 20**. Αν είναι 0, ο owner δεν πέρασε από τις σελίδες — ξανά από το Step 4.

- [ ] **Step 6: Commit (μόνο ο κώδικας, ΠΟΤΕ το HAR)**

```bash
git add .gitignore tests/critics/record-har.js
git status --porcelain | grep -E "^A.*\.har/" && echo "ΣΤΟΠ: το HAR μπήκε στο index" || git commit -m "test(oracle): ηχογράφηση HAR μία φορά — χωρίς αποθηκευμένο κωδικό ή token"
```

---

### Task 2: Ο κατάλογος των 11 μονάδων

Η μία πηγή αλήθειας για το «τι είναι μονάδα». Κάθε επόμενο task τη διαβάζει.

**Files:**
- Create: `tests/critics/units.js`
- Test: `tests/critics/units.test.js`

**Interfaces:**
- Consumes: τίποτα
- Produces: `module.exports = UNITS`, πίνακας από
  `{ unit: string, tier: 1|3, routes: string[], files: string[] }`

- [ ] **Step 1: Γράψε το failing test**

Create `tests/critics/units.test.js`:

```js
// Plain node:test — no Playwright needed, these are pure data assertions.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const UNITS = require('./units');

test('exactly 11 units, matching the spec', () => {
  assert.strictEqual(UNITS.length, 11);
});

test('every listed file exists on disk', () => {
  for (const u of UNITS) {
    for (const f of u.files) {
      assert.ok(fs.existsSync(f), `missing file ${f} for unit ${u.unit}`);
    }
  }
});

test('entity is one unit covering six routes', () => {
  const e = UNITS.find(u => u.unit === 'entity');
  assert.strictEqual(e.routes.length, 6);
  assert.deepStrictEqual(e.files, ['core/entity.js']);
});

test('six units are tier 3', () => {
  assert.strictEqual(UNITS.filter(u => u.tier === 3).length, 6);
});
```

- [ ] **Step 2: Τρέξε το για να δεις ότι αποτυγχάνει**

```bash
node --test tests/critics/units.test.js
```

Expected: FAIL — `Cannot find module './units'`

- [ ] **Step 3: Γράψε τον κατάλογο**

Create `tests/critics/units.js`:

```js
// The 11 redesign units. A "unit" is one body of CODE, not one route:
// six master-data routes all render through renderEntity(), so core/entity.js
// is ONE unit covering six screens (core/router.js:305-320). Treating them as
// six would fan out six agents onto the same file — a hidden edge, not
// parallelism.
//
// Source of truth: docs/superpowers/specs/2026-08-28-app-redesign-graph-design.md §3.1
// Excluded on purpose (§3.2): costs (already the reference), ceo_dashboard,
// performance, invoicing (structurally broken — fix before polishing),
// daily_ramp (owner 24/8: goes last).

module.exports = [
  // Tier 1 — the data contract is a HARD gate: no field may disappear.
  { unit: 'entity',      tier: 1, routes: ['clients', 'partners', 'drivers', 'trucks', 'trailers', 'workshops'], files: ['core/entity.js'] },
  { unit: 'maintenance', tier: 1, routes: ['maint_dash', 'maint_req', 'maint_expiry', 'maint_svc'],              files: ['modules/maintenance.js'] },
  { unit: 'locations',   tier: 1, routes: ['locations'],                                                          files: ['modules/locations.js', 'modules/locations_map.js'] },
  { unit: 'pallets',     tier: 1, routes: ['pallet_ledger'],                                                      files: ['modules/pallet_ledger.js', 'modules/pallet_upload.js'] },
  { unit: 'audit',       tier: 1, routes: ['audit_trail', 'metrics_audit'],                                       files: ['modules/audit_trail.js', 'modules/metrics_audit.js'] },

  // Tier 3 — the contract MAY change; the critic reports a diff for approval
  // instead of failing (spec §6.1).
  { unit: 'dashboard',   tier: 3, routes: ['dashboard'],    files: ['modules/dashboard.js'] },
  { unit: 'daily_ops',   tier: 3, routes: ['daily_ops'],    files: ['modules/daily_ops.js'] },
  { unit: 'weekly_intl', tier: 3, routes: ['weekly_intl'],  files: ['modules/weekly_intl.js'] },
  { unit: 'weekly_natl', tier: 3, routes: ['weekly_natl'],  files: ['modules/weekly_natl.js'] },
  { unit: 'orders_intl', tier: 3, routes: ['orders_intl'],  files: ['modules/orders_intl.js'] },
  { unit: 'orders_natl', tier: 3, routes: ['orders_natl'],  files: ['modules/orders_natl.js'] },
];
```

- [ ] **Step 4: Τρέξε τα tests**

```bash
node --test tests/critics/units.test.js
```

Expected: `# pass 4` / `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add tests/critics/units.js tests/critics/units.test.js
git commit -m "test(oracle): κατάλογος 11 μονάδων — 6 routes μοιράζονται το core/entity.js"
```

---

### Task 3: Στατικοί κριτές #3 (hex) και #4 (κοπή), με καστάνια

Δεν χρειάζονται browser. Τρέχουν σε δευτερόλεπτα και πιάνουν τις δύο πιο συχνές παραβάσεις.

**Files:**
- Create: `tests/critics/static.js`
- Create: `docs/redesign/baseline.json`
- Test: `tests/critics/static.test.js`

**Interfaces:**
- Consumes: `require('./units')`
- Produces: `module.exports = { measure, check }` όπου
  `measure(unit) -> { hex: number, truncate: number }` και
  `check(unit, allowance) -> { pass: boolean, failures: string[], measured: object }`

- [ ] **Step 1: Γράψε το failing test**

Create `tests/critics/static.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { measure, check } = require('./static');
const UNITS = require('./units');

test('measure counts hex colours in a unit', () => {
  const entity = UNITS.find(u => u.unit === 'entity');
  const m = measure(entity);
  assert.ok(typeof m.hex === 'number');
  assert.ok(typeof m.truncate === 'number');
});

test('a unit at its allowance passes', () => {
  const entity = UNITS.find(u => u.unit === 'entity');
  const m = measure(entity);
  const r = check(entity, { hex: m.hex, truncate: m.truncate });
  assert.strictEqual(r.pass, true);
});

test('a unit over its allowance fails and says by how much', () => {
  const weekly = UNITS.find(u => u.unit === 'weekly_intl');
  const r = check(weekly, { hex: 0, truncate: 0 });
  assert.strictEqual(r.pass, false);
  assert.match(r.failures.join(' '), /hex/);
});
```

- [ ] **Step 2: Τρέξε το για να δεις ότι αποτυγχάνει**

```bash
node --test tests/critics/static.test.js
```

Expected: FAIL — `Cannot find module './static'`

- [ ] **Step 3: Γράψε τους στατικούς κριτές**

Create `tests/critics/static.js`:

```js
// Critics #3 and #4 from DESIGN.md ΜΕΡΟΣ Α, made executable.
//
// Ratchet, not absolute: today the codebase holds 528 hex literals inside
// modules, so asserting zero would paint every unit red on day one and the
// suite would be ignored within a week. Instead each unit carries an allowance
// (docs/redesign/baseline.json) that may only ever go DOWN. When a unit is
// redesigned its allowance is set to 0 and the rule becomes absolute.

const fs = require('fs');

// 3-, 6- and 8-digit hex. \b at the end keeps #FFFFFF80 from matching twice.
const HEX = /#[0-9A-Fa-f]{3,8}\b/g;
// DESIGN.md #6: company and location names are never cut — dispatchers phone
// these companies and read the name off the screen.
const TRUNCATE = /(text-overflow\s*:\s*ellipsis|\btruncate\b|\bline-clamp\b)/g;

function countIn(file, re) {
  const src = fs.readFileSync(file, 'utf8');
  return (src.match(re) || []).length;
}

function measure(unit) {
  return {
    hex:      unit.files.reduce((n, f) => n + countIn(f, HEX), 0),
    truncate: unit.files.reduce((n, f) => n + countIn(f, TRUNCATE), 0),
  };
}

function check(unit, allowance) {
  const m = measure(unit);
  const failures = [];
  if (m.hex > allowance.hex) {
    failures.push(`${unit.unit}: hex ${m.hex} > όριο ${allowance.hex} (DESIGN.md #1)`);
  }
  if (m.truncate > allowance.truncate) {
    failures.push(`${unit.unit}: κοπή ${m.truncate} > όριο ${allowance.truncate} (DESIGN.md #6)`);
  }
  return { pass: failures.length === 0, failures, measured: m };
}

module.exports = { measure, check };
```

- [ ] **Step 4: Τρέξε τα tests**

```bash
node --test tests/critics/static.test.js
```

Expected: `# pass 3` / `# fail 0`

- [ ] **Step 5: Παρήγαγε το αρχείο βάσης**

```bash
mkdir -p docs/redesign && node -e "
const U=require('./tests/critics/units');const {measure}=require('./tests/critics/static');
const out={};for(const u of U)out[u.unit]=measure(u);
require('fs').writeFileSync('docs/redesign/baseline.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
"
```

Expected: JSON με 11 κλειδιά. Το `weekly_intl.hex` πρέπει να είναι **56** (μέτρηση 28/8/2026). Αν διαφέρει, κάποιος άλλαξε το αρχείο στο μεταξύ — κατέγραψέ το στο `OBSERVATIONS.md`.

- [ ] **Step 6: Commit**

```bash
git add tests/critics/static.js tests/critics/static.test.js docs/redesign/baseline.json
git commit -m "test(oracle): στατικοί κριτές hex+κοπή ως καστάνια — το όριο μόνο πέφτει"
```

---

### Task 4: Fixture αυθεντικοποίησης χωρίς κωδικό

**Files:**
- Create: `tests/critics/auth.js`

**Interfaces:**
- Consumes: `.har/tms.har` (Task 1)
- Produces: `module.exports = { preparePage }` — `async preparePage(page, role)` με
  προεπιλογή `role = 'owner'`· χρησιμοποιείται από τα Tasks 5 και 6

- [ ] **Step 1: Γράψε το fixture**

Create `tests/critics/auth.js`:

```js
// Shared page setup for every live critic.
//
// Two halves, and both matter:
//   1. A fake session in localStorage so core/auth.js does not bounce us to
//      index.html. Shape copied from tests/e2e/smoke.spec.js (which copies
//      index.html doLogin()).
//   2. HAR replay so the page renders REAL data without a real token. Without
//      this the screens render empty, and an empty screen passes a naive
//      "did it load" check while proving nothing — exactly the failure mode
//      DESIGN.md #7 warns about.

const path = require('path');
const HAR = path.resolve('.har/tms.har');

async function preparePage(page, role = 'owner') {
  await page.addInitScript(r => {
    localStorage.setItem('tms_user', JSON.stringify({
      name: 'Critic', role: r, username: 'critic',
      loginAt: Date.now(), expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    }));
  }, role);

  // notFound:'abort' is deliberate: a request the HAR does not cover must FAIL
  // loudly. Falling through to the live backend would make the critics depend
  // on production state and quietly non-deterministic.
  await page.routeFromHAR(HAR, { url: '**/*', notFound: 'abort' });
}

module.exports = { preparePage };
```

- [ ] **Step 2: Επαλήθευσε ότι η υπάρχουσα υποδομή δεν έσπασε**

```bash
npx playwright test tests/e2e/smoke.spec.js --grep "app.html loads" --reporter=list
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/critics/auth.js
git commit -m "test(oracle): fixture με ψεύτικη συνεδρία + επαναπαραγωγή HAR — μηδέν διαπιστευτήρια"
```

---

### Task 5: Φ0 απογραφή + κριτές #1 (συμβόλαιο) και #6 (ζωντανό)

**Files:**
- Create: `tests/critics/contract.spec.js`
- Create (παράγονται): `docs/redesign/contracts/<unit>.json`

**Interfaces:**
- Consumes: `require('./units')`, `require('./auth').preparePage`
- Produces: αρχεία `docs/redesign/contracts/<unit>.json` σχήματος
  `{ unit: string, tier: number, fields: string[], actions: string[], endpoints: string[] }`

- [ ] **Step 1: Γράψε τον κώδικα απογραφής και ελέγχου**

Create `tests/critics/contract.spec.js`:

```js
// Φ0 inventory + critics #1 and #6.
//
// Run with CAPTURE=1 to WRITE the contracts (the Φ0 inventory).
// Run without it to CHECK the current app against the committed contracts.
// Same traversal both ways, so the check can never drift from the capture.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const UNITS = require('./units');
const { preparePage } = require('./auth');

const DIR = 'docs/redesign/contracts';
const CAPTURE = process.env.CAPTURE === '1';

// A "field" is any column header or labelled value the screen presents.
// An "action" is anything the user can click that changes state.
async function readContract(page, unit) {
  const endpoints = new Set();
  page.on('request', r => {
    const m = r.url().match(/tbl[A-Za-z0-9]{14}/);
    if (m) endpoints.add(`${r.method()} ${m[0]}`);
  });

  const fields = new Set();
  const actions = new Set();

  for (const route of unit.routes) {
    await page.goto(`app.html#/${route}`);
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
  test(`contract: ${unit.unit}`, async ({ page }) => {
    await preparePage(page, 'owner');

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    const now = await readContract(page, unit);
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
```

- [ ] **Step 2: Τρέξε σε λειτουργία απογραφής**

```bash
CAPTURE=1 npx playwright test tests/critics/contract.spec.js --reporter=list
```

Expected: **11 passed**, και 11 αρχεία στο `docs/redesign/contracts/`.

Αν κάποιο πέσει με «μηδέν πεδία», λείπει από το HAR — γύρνα στο Task 1 Step 4.

- [ ] **Step 3: Τρέξε σε λειτουργία ελέγχου, χωρίς αλλαγές στον κώδικα**

```bash
npx playwright test tests/critics/contract.spec.js --reporter=list
```

Expected: **11 passed** — τίποτα δεν άλλαξε, άρα τίποτα δεν χάθηκε. Αυτό αποδεικνύει ότι ο κριτής δεν βγάζει ψευδείς συναγερμούς.

- [ ] **Step 4: Απόδειξε ότι ο κριτής όντως πιάνει απώλεια**

```bash
node -e "
const f='docs/redesign/contracts/entity.json';
const c=JSON.parse(require('fs').readFileSync(f,'utf8'));
c.fields.push('__ΨΕΥΤΙΚΟ_ΠΕΔΙΟ__');
require('fs').writeFileSync(f,JSON.stringify(c,null,2)+'\n');
" && npx playwright test tests/critics/contract.spec.js --grep "contract: entity" --reporter=list; git checkout docs/redesign/contracts/entity.json
```

Expected: **FAIL** με `ΧΑΘΗΚΑΝ πεδία: __ΨΕΥΤΙΚΟ_ΠΕΔΙΟ__`, και μετά το `git checkout` επαναφέρει το αρχείο.

Ένας κριτής που δεν τον έχεις δει να κοκκινίζει δεν είναι κριτής.

- [ ] **Step 5: Commit**

```bash
git add tests/critics/contract.spec.js docs/redesign/contracts/
git commit -m "test(oracle): Φ0 απογραφή + κριτής συμβολαίου — σκληρή πύλη σε tier 1, αναφορά σε tier 3"
```

---

### Task 6: Κριτές #2 (ρόλοι) και #5 (άγνωστο ≠ μηδέν)

**Files:**
- Create: `tests/critics/semantics.spec.js`

**Interfaces:**
- Consumes: `require('./units')`, `require('./auth').preparePage`
- Produces: κανένα αρχείο — μόνο έλεγχοι

- [ ] **Step 1: Γράψε τους δύο κριτές**

Create `tests/critics/semantics.spec.js`:

```js
// Critics #2 and #5. Neither is about looks; both are about truth.

const { test, expect } = require('@playwright/test');
const UNITS = require('./units');
const { preparePage } = require('./auth');

// Locked owner decision, 23/8/2026: a dispatcher never sees P&L. Price stays
// visible until the P&L phase; margin, profit, revenue and fuel do not.
const FORBIDDEN_FOR_DISPATCHER = [
  'Gross Profit', 'Margin Percent', 'Client Revenue', 'Καθαρό Κέρδος', 'Περιθώριο',
];

for (const unit of UNITS) {
  test(`roles: ${unit.unit} hides P&L from dispatcher`, async ({ page }) => {
    await preparePage(page, 'dispatcher');
    for (const route of unit.routes) {
      await page.goto(`app.html#/${route}`);
      await page.waitForTimeout(2000);
      const body = await page.locator('body').innerText();
      for (const term of FORBIDDEN_FOR_DISPATCHER) {
        expect(body, `${route}: ο dispatcher βλέπει «${term}»`).not.toContain(term);
      }
    }
  });

  test(`unknown-is-not-zero: ${unit.unit}`, async ({ page }) => {
    await preparePage(page, 'owner');
    for (const route of unit.routes) {
      await page.goto(`app.html#/${route}`);
      await page.waitForTimeout(2500);

      // DESIGN.md #3: a value that was never entered must render as a dash or
      // as "δεν έχει καταχωρηθεί" — never as 0 / 0% / €0. An unwritten cost
      // shown as €0 reads as pure profit.
      //
      // Detection: a cell holding EXACTLY "€0" / "0%" / "0 €" is the shape a
      // missing value takes. A real zero is written "0,00 €".
      const suspects = await page.locator(
        'td:text-is("€0"), td:text-is("0%"), td:text-is("0 €")'
      ).allTextContents();

      expect(suspects,
        `${route}: ${suspects.length} κελιά δείχνουν μηδέν αντί για «δεν καταχωρήθηκε» (DESIGN.md #3)`
      ).toHaveLength(0);
    }
  });
}
```

- [ ] **Step 2: Τρέξε τους**

```bash
npx playwright test tests/critics/semantics.spec.js --reporter=list
```

Expected: **22 tests**. Κάποια θα **αποτύχουν** — αυτό είναι το σωστό αποτέλεσμα σήμερα, γιατί τα ευρήματα υπάρχουν πραγματικά στην εφαρμογή.

- [ ] **Step 3: Κατέγραψε τις αποτυχίες ως ευρήματα, μην τις «διορθώσεις»**

```bash
npx playwright test tests/critics/semantics.spec.js --reporter=list 2>&1 | grep -E "✘|×|failed" | tee /tmp/semantics-failures.txt
```

Αυτές οι αποτυχίες είναι **πραγματικά ευρήματα**, όχι σφάλματα του κριτή. Αντιγράφονται στο `docs/redesign/OBSERVATIONS.md` (Task 7) και διορθώνονται μέσα στο redesign της κάθε μονάδας — **όχι εδώ**.

- [ ] **Step 4: Commit**

```bash
git add tests/critics/semantics.spec.js
git commit -m "test(oracle): κριτές ρόλων και «άγνωστο δεν είναι μηδέν» — DESIGN.md #3 και κλείδωμα 23/8"
```

---

### Task 7: Ενορχηστρωτής με fan-in guard, και το ημερολόγιο παρατηρήσεων

**Files:**
- Create: `tests/critics/run.js`
- Create: `docs/redesign/OBSERVATIONS.md`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `require('./units')`, `require('./static').check`, `docs/redesign/baseline.json`
- Produces: εντολή `npm run critics` — μία αναφορά για τις 11 μονάδες, exit 2 σε νεκρό κόμβο

- [ ] **Step 1: Γράψε τον ενορχηστρωτή**

Create `tests/critics/run.js`:

```js
// Fan-out over the 11 units, fan-in with a guard.
//
// The guard is the whole point. In a chain one failure stops everything —
// annoying but obvious. In a fan-out, one unit that quietly returns nothing
// slips into a report that looks complete. So the count of results is checked
// against the count of jobs, and a gap ABORTS instead of summarising half the
// data.

const { execFileSync } = require('child_process');
const UNITS = require('./units');
const { check } = require('./static');
const baseline = require('../../docs/redesign/baseline.json');

const results = [];
for (const unit of UNITS) {
  try {
    results.push({ unit: unit.unit, ...check(unit, baseline[unit.unit]) });
  } catch (e) {
    console.error(`κόμβος ${unit.unit} πέθανε: ${e.message}`);
  }
}

if (results.length < UNITS.length) {
  console.error(`\n⛔ ΣΤΟΠ: ${UNITS.length - results.length} από ${UNITS.length} κόμβους δεν γύρισαν.`);
  console.error('Καμία αναφορά σε μισό σύνολο. Διόρθωσε τους νεκρούς κόμβους πρώτα.');
  process.exit(2);
}

const failed = results.filter(r => !r.pass);
for (const r of results) {
  const mark = r.pass ? '✓' : '✗';
  console.log(`${mark} ${r.unit.padEnd(14)} hex ${String(r.measured.hex).padStart(3)}  κοπή ${r.measured.truncate}`);
}
for (const f of failed) for (const msg of f.failures) console.log(`   ${msg}`);

console.log(`\n${results.length - failed.length}/${results.length} μονάδες εντός ορίων`);

// Live critics run through Playwright; surface their exit code too.
try {
  execFileSync('npx', ['playwright', 'test', 'tests/critics/', '--reporter=line'],
    { stdio: 'inherit' });
} catch {
  process.exitCode = 1;
}

if (failed.length) process.exitCode = 1;
```

- [ ] **Step 2: Πρόσθεσε τα scripts στο `package.json`**

Στο αντικείμενο `"scripts"`, αμέσως μετά τη γραμμή `"e2e:install": "playwright install --with-deps chromium"`, πρόσθεσε κόμμα και:

```json
    "critics": "node tests/critics/run.js",
    "critics:capture": "CAPTURE=1 playwright test tests/critics/contract.spec.js"
```

- [ ] **Step 3: Επαλήθευσε τον fan-in guard**

```bash
cp tests/critics/units.js /tmp/units.bak && node -e "
const p='tests/critics/units.js';const fs=require('fs');
fs.writeFileSync(p, fs.readFileSync(p,'utf8').replace(\"'core/entity.js'\",\"'core/ΔΕΝ_ΥΠΑΡΧΕΙ.js'\"));
" && npm run critics; echo "exit=$?"; cp /tmp/units.bak tests/critics/units.js
```

Expected: `⛔ ΣΤΟΠ: 1 από 11 κόμβους δεν γύρισαν.` και `exit=2`.

Αν αντ' αυτού τυπώσει «10/10 μονάδες εντός ορίων», ο guard **δεν δουλεύει** — μη συνεχίσεις.

- [ ] **Step 4: Τρέξε καθαρά**

```bash
npm run critics
```

Expected: 11 γραμμές `✓` για τους στατικούς, μετά η έξοδος των ζωντανών κριτών (με τα πραγματικά ευρήματα του Task 6).

- [ ] **Step 5: Άνοιξε το ημερολόγιο παρατηρήσεων**

Create `docs/redesign/OBSERVATIONS.md`:

```markdown
# Redesign — ημερολόγιο παρατηρήσεων

Κρατιέται **κατά** την εκτέλεση, όχι μετά. Από αυτό γράφεται στο τέλος το
skill `graph-task` — ώστε να κωδικοποιεί τι όντως έσπασε, όχι τι υποθέσαμε.

Απόφαση owner 28/8/2026: το skill γράφεται **τελευταίο**.

## Τι καταγράφεται

| Κατηγορία | Παράδειγμα |
|---|---|
| **Ψευδής συναγερμός** | κριτής κοκκίνισε χωρίς πραγματικό πρόβλημα |
| **Διαφυγή** | κάτι έσπασε και **κανένας** κριτής δεν το έπιασε — το πιο πολύτιμο |
| **Νεκρός κόμβος** | agent δεν γύρισε· τι τον σκότωσε |
| **Απόκλιση χρόνου** | πύλη που πήρε πολύ περισσότερο απ' ό,τι εκτιμήθηκε |
| **Κρυφή ακμή** | δύο κόμβοι που πάτησαν ο ένας τον άλλο |

## Καταγραφές

### 2026-08-28 — εκκίνηση

- Σημείο μηδέν: 528 hex μέσα σε modules, 22.795 γραμμές, 11 μονάδες.
- Ο κριτής #5 («άγνωστο ≠ μηδέν») κοκκίνισε από την πρώτη στιγμή σε πραγματικά
  ευρήματα. Δεν διορθώθηκαν εδώ — ανήκουν στο redesign κάθε μονάδας.
```

- [ ] **Step 6: Commit και push**

```bash
git add tests/critics/run.js docs/redesign/OBSERVATIONS.md package.json
git commit -m "test(oracle): ενορχηστρωτής με fan-in guard + ημερολόγιο παρατηρήσεων"
git push origin main
```

---

## Τι ΔΕΝ κάνει αυτό το πλάνο

Σκόπιμα εκτός, με δικό τους πλάνο το καθένα:

| Εκτός | Πότε |
|---|---|
| Φ1 — το σύστημα στο Figma | επόμενο· απαιτεί τον owner |
| Φ2–Φ6 — σχεδίαση, υλοποίηση, merge | ένα πλάνο ανά κύμα (spec §7) |
| Φ3 — απόδειξη πυκνότητας | μπαίνει στο πλάνο του κύματος 1, όταν υπάρχει σχεδίαση να δοκιμαστεί |
| Το skill `graph-task` | **τελευταίο**, από το `OBSERVATIONS.md` |
| Διόρθωση των ευρημάτων του κριτή #5 | μέσα στο redesign κάθε μονάδας |

## Ορισμός του «τελείωσε»

1. `npm run critics` τρέχει και τυπώνει 11 μονάδες.
2. Ο fan-in guard έχει **δει** να κοκκινίζει (Task 7 Step 3).
3. Ο κριτής συμβολαίου έχει **δει** να κοκκινίζει (Task 5 Step 4).
4. 11 συμβόλαια στο `docs/redesign/contracts/`, committed.
5. Κανένα HAR ή screenshot στο git (`git ls-files | grep -E "\.har|before/"` → κενό).
