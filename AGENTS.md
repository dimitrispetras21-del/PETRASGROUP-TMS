# AGENTS.md

Project-specific guidance for AI agents. See `CLAUDE.md` for the product rules,
architecture (sync chain, Airtable/Supabase field traps), design system, and the
deploy `?v=` cache-busting convention — that content is authoritative and not
duplicated here.

## Cursor Cloud specific instructions

The dependency-refresh (`npm install` + Playwright chromium browser) runs
automatically on startup via the environment update script, so the notes below
focus on how to run and test the app rather than on installing dependencies. If
headless chromium ever fails to launch on a fresh VM (missing OS libraries), run
`npx playwright install --with-deps chromium` once — that step installs system
libs and is intentionally kept out of the automatic update script.

### What this is

A **static frontend** (plain HTML/JS, no bundler needed to run). `index.html` is
the login page; `app.html` is the SPA shell that loads `config.js` + `core/*` +
`modules/*` via `<script>` tags. The browser talks only to a **live Cloudflare
Worker** backend (`petras-tms-backend-staging.petrasgroup.workers.dev`, set in
`config.js` `PROXY_URL`) that fronts Supabase Postgres. Post-C2 cutover the
browser no longer calls Airtable directly (`USE_PROXY = true`).

### Running it (dev)

Serve the repo root with any static server and open the app — same as the
`build.sh` footer:

- `python3 -m http.server 8080`, then open `http://localhost:8080/index.html`
  (login) or `/app.html` (main app).

### Non-obvious gotcha: CORS from localhost

The Worker's CORS allowlist only accepts the production origin
`https://dimitrispetras21-del.github.io`. When you serve locally from
`http://localhost:8080`, **every backend fetch is CORS-blocked**, so:

- Module pages render (sidebar, headers, filters) but show empty/error states
  ("Failed to load…" / "Failed to fetch") — this is expected locally, not a bug.
- A login POST from localhost fails in the browser at the CORS layer and shows
  "Δεν ήταν δυνατή η σύνδεση…" (could not connect) rather than a 401. The endpoint
  itself is healthy — a direct `curl` to `/auth/login` returns a clean
  `401 {"error":"Invalid credentials"}`.

To exercise real data locally you need either a gitignored `config.local.js`
direct-mode override with a read-only token (not in the repo), or to run from the
allowlisted origin. Live login is bcrypt-verified in Postgres — there is **no
offline/local auth**.

### Running the UI without a login

To render `app.html` without a backend login, seed a mock session in
localStorage before it loads (exactly what `tests/e2e/smoke.spec.js` does):

```js
localStorage.setItem('tms_user', JSON.stringify({
  name: 'Dev', role: 'owner', username: 'dimitris',
  loginAt: Date.now(), expiresAt: Date.now() + 8*60*60*1000
}));
```

`role: 'owner'` unlocks every nav item. `core/auth.js` cross-checks the username
against `USERS` in `config.js`, so use a username that exists there.

### Lint / guard

CI (`.github/workflows/code-guards.yml`) runs only `bash tests/check-fail-open.sh`
— a ratchet that fails if the count of error-swallowing "fail-open" data fetches
rises. That script is the real gate. An `.eslintrc.json` exists but ESLint is not
a declared dependency, so it is not wired into CI.

### Tests

- **Unit**: open `tests/test-runner.html` in a browser (loads `config.js`,
  `core/constants.js`, `core/utils.js`, `core/api.js` + the `test-*.js` suites).
  Headless run: serve the repo, load the page in Playwright's chromium, read
  `#summary`. ~10 assertions in `test-vs-sync.js`/`test-business.js` are
  **known-stale** — they assert old Greek direction values (`ΚΑΘΟΔΟΣ`/`ΑΝΟΔΟΣ`)
  while `config.js` intentionally migrated `F.CL_*` to arrow form (`North→South`),
  plus intentional non-`tbl` IDs (`LOCAL_MOVES: 'local_moves'`, blank
  `SCAN_TRAINING`). These are pre-existing test drift, not regressions.
- **E2E**: `npm run e2e` (Playwright). Default `baseURL` is the live GitHub Pages
  deploy; override with `PW_BASE_URL` (e.g. `PW_BASE_URL=http://localhost:8080/`).
  Legacy `smoke.spec.js`/`vs-scenarios.spec.js` use mock localStorage auth. Note:
  smoke's "loads without console errors" test **fails against localhost** because
  of the CORS block above; its 14 per-page render checks pass. Live suites
  (`vs-scenarios-live`, `post-c2-walk`) need `PW_TMS_*`/`PW_OWNER_*` creds.
  See `docs/TESTING.md` for the canonical flows.

### Build

`bash build.sh` (esbuild) → `dist/` bundles + regenerates the tracked
`app.prod.html`. Two harmless quirks: it uses `bc` only to pretty-print sizes
(not installed here → cosmetic "bc: command not found" lines; the build still
succeeds), and it rewrites `app.prod.html` with a new timestamp — don't commit
that incidental regeneration.

### worker/

`worker/` holds the Cloudflare Worker source + `wrangler.toml`. It requires CF
secrets and is **not** part of frontend dev — do not deploy it during setup.
