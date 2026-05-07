# Known Issues & Incomplete Areas

Honest catalogue. The auditor will find these anyway — better they know
upfront so they can focus on the unknown unknowns.

Severity:
- 🔴 **CRITICAL** — security risk or data-loss potential. Fix before scaling.
- 🟠 **HIGH** — silent misbehavior or major UX. Fix soon.
- 🟡 **MEDIUM** — known limitation, monitor.
- 🟢 **LOW** — cosmetic or "by design" trade-off.

---

## 🔴 Critical

### S1. API tokens exposed in browser
**File**: `config.js` lines 14-16
```js
const AT_TOKEN = 'patpPJXnFYnxdgoK3.a216...';
const ANTH_KEY = 'sk-ant-api03-HG90hAxac0K9...';
```
Anyone with DevTools access reads the Airtable PAT and the Anthropic API key.
Both have full read/write scope. A Cloudflare Worker proxy is **already
written** in `/worker/` (CORS-locked, JWT-authed) but **not yet deployed**.
The flag `USE_PROXY = false` in config.js — flipping to `true` activates the
already-wired proxy path in `core/api.js`.

**Fix path**: deploy worker + flip flag. ~30 minutes once Cloudflare account
is set up. See `worker/README.md` for `wrangler` commands.

### S2. No automated backups
Airtable is the only source of truth. If a user accidentally bulk-deletes,
recovery requires Airtable's manual snapshot (7-day retention) + manual
restore. There is **no scheduled export** to git/S3/DigitalOcean.

**Fix path**: GitHub Actions cron + Airtable List Records API → JSON dump
to a `backups/YYYY-MM-DD/` folder. ~1 hour.

### S3. Test data pollution (~1090 records)
The Airtable base contains roughly 1090 records left over from testing
sessions over the past months. They skew KPIs (margins, dead km, on-time%)
and confuse reports. There's no `is_test` flag, so a one-shot cleanup script
+ manual triage is required.

---

## 🟠 High

### A1. Sync chain has no transactional rollback
The cascade `ORDERS → NAT_ORDERS → GROUPAGE_LINES → CONS_LOADS → NAT_LOADS
→ ORDER_STOPS → RAMP → PALLET_LEDGER → PARTNER_ASSIGN` is best-effort.
- VS sync (commit a8871aa) has a per-step `try/catch` and a rollback list
  on failure (`_createdIds.reverse()` then `atDelete` each), but rollback
  itself can partially fail.
- Other sync paths (`syncGLtoCLtoNL`, `_syncGroupageLinesFromNO`) have
  per-call catch blocks that just log to error log.

**Symptom**: orphan child records that survive parent deletion. Mitigation
exists: `cleanupOrphans()` in console (covers GL + CL + NL + PA + RAMP).

### A2. localStorage quota will hit eventually
Per-user, per-browser data being stored:
- `tms_errors` — error log, capped at 200 (auto-purged after 14d as of d6e0765)
- `tms_audit` — audit log of mutations, capped at 200
- `aic_history_<user>` — chat history, **uncapped**
- `nakis_profile_<user>` — interview profile
- `nakis_notifs_<user>` — Νάκης reminders
- `tms_scan_training` — capped at 30 corrections
- `tms_user`, `tms_jwt`, `tms_page`, `tms_sidebar_*` — small
- Reference data caches (clients, partners, locations, drivers, trucks, trailers) ~30 min TTL

A power user crossing 5–10 MB will start seeing silent write failures.
Chat history is the biggest unbounded growth vector.

**Fix**: cap chat history at last N messages or last X days.

### A3. Concurrent edits — partial protection only
`atSafePatch` (api.js:799) does a server-version check before patching and
returns `{conflict: true}` on detected race. **But only some forms use it**;
many places still call `atPatch` directly. Audit `grep -n "atPatch\b"` for
mutations not going through `atSafePatch`.

### A4. Permission boundary is client-side only
Sidebar hides items based on `can(perm)`. `navigate()` also checks (added
in commit 64d11d3). But:
- `localStorage.tms_user.role` is not signed; `_authRoleTampered()` does a
  client-side sanity check against the hardcoded USERS array.
- All mutations go straight to Airtable; the API doesn't know about roles.
- A motivated user can edit localStorage + bypass `_authRoleTampered` (the
  USERS array is in `index.html` source).

This is acceptable for an internal-only app with 6 trusted users. **Not
acceptable** if external users get accounts. The Cloudflare Worker (S1)
solves this by JWT-authing every request server-side.

### A5. Anthropic credit balance can deplete silently
When credits run out, all scans + Νάκης stop working. The error path now
maps the API's "credit balance too low" to a friendly Greek toast (commit
a7c68e2) — but there's no proactive monitoring of remaining credits.

**Fix**: a periodic ping to a free-tier Sonnet endpoint + alert when 402
returns + a "credits low" banner. ~1 hour.

### A6. Deletes are partially soft, partially hard
`atSoftDelete` exists (writes to a "trash" record before deleting) but is
inconsistently used across modules. Some `atDelete` calls in cascade chains
go straight to hard delete (e.g. NL/CL/RAMP cascades).

### A7. `cleanupOrphans()` runs from console only — no UI
A senior dev or owner needs to know to open DevTools + type the function
name. Hidden from regular dispatchers (good) but no admin dashboard hook.

---

## 🟡 Medium

### M1. Field-naming traps in Airtable
- `Adress` (single 'd') in PARTNERS + CLIENTS — typo from initial setup, kept
- `Veroia Switch` — no trailing space (a previous bug fixed by removing one)
- `Week Number` — formula field, NOT writable (don't include in PATCH bodies)
- `Direction` field has THREE different value sets:
  - ORDERS: `Export` / `Import`
  - NAT_ORDERS: `North→South` / `South→North` (with arrow chars)
  - CONS_LOADS: `ΑΝΟΔΟΣ` / `ΚΑΘΟΔΟΣ` (Greek)
- Linked record values must be plain string arrays: `['recXXX']`, NOT `[{id:'recXXX'}]`
- `filterByFormula` for linked records: use `FIND("recXXX", ARRAYJOIN({Field},","))>0`,
  NOT `SEARCH()`

See [`SCHEMA.md`](./SCHEMA.md) for the full traps list.

### M2. Service Worker version bumps are manual
Each file has `?v=TIMESTAMP` in `app.html`. Forgetting to bump = stale
client. There's `scripts/bump-versions.sh` but no CI gate enforcing it.

### M3. `atPatchBatch` and bulk operations have no progress UI
A 50-record bulk update fires 50 individual API calls (well, 5 batches of 10
respecting Airtable rate limit). User sees no progress.

### M4. Print PDF flow is browser-dependent
Uses `window.open()` + `window.print()` + auto-trigger. Works in Chrome/Edge.
Safari iOS partially. Old browsers (IE11, no concern) totally broken.

### M5. No Sentry or external error tracking
SDK is loaded (commit 64d11d3), `logError()` forwards to it — but the DSN
in `config.js` is empty. Errors live in localStorage only. After 14 days
they auto-purge (commit d6e0765). No alerting.

### M6. Νάκης (chat assistant) per-user state lives in localStorage
Per-user profile, history, notifs are localStorage-only. If the user
switches browser/device, everything resets. Active learning of scan
corrections also localStorage-only (with optional Airtable mirror that's
not configured).

### M7. Driver mobile experience untested
The mobile audit (commit f420aea) covered the planning section. Drivers
don't have a dedicated UI; if they were to use TMS at all, it'd be the
desktop UI shrunk. Not a regression, just a gap.

### M8. Tests are skeletal
- `tests/test-runner.html` — 3 unit test files, not run in CI
- `tests/e2e/` — 2 Playwright files (smoke + VS scenarios), require Node
  installed locally. Not in CI.

---

## 🟢 Low / by design

- **Inline `style=""` everywhere**. The codebase predates the design-token
  layer (`tms-stat-card`, `tms-pill` etc.). New code uses tokens; old code
  still has inline. Refactor opportunity, not a bug.
- **No virtual scrolling** for entity tables — they cap at 500 rows
  rendered (commit 7d7a3df) with a footer warning. Acceptable for current
  data volume (~400 partners, ~200 clients). Will need fixing at 1000+.
- **No bundler.** Each module is its own `<script>` tag. Network waterfall
  is acceptable on 4G/5G; on slow 3G, cold load is 8–12s.
- **DPS Logistics dual-brand UI** (per CLAUDE.md) is partially implemented.
- **The error log + audit log are per-user (localStorage)**, not centralised.
  Owner can't see other users' errors without DevTools-walking each browser.
  Centralising → Airtable is on the roadmap (S2-related).

---

## Recently fixed (within last 30 days)

| Date | Issue | Commit |
|---|---|---|
| May 6 | Cascade delete used `fields:['Name']` causing 422 | 6a6078c |
| May 6 | PARTNER_ASSIGN orphans after order delete | 3f7b8b5 |
| May 6 | False-positive Status validator on small samples | d6e0765 |
| May 5 | Νάκης error messages were raw English API responses | a7c68e2 |
| May 5 | Tool-use loop returned `"Now I have..."` preamble breaking JSON.parse | f668f5e |
| May 5 | Rate-limit (30K input tokens/min) on tool-use loop | f668f5e |
| May 5 | Airtable 422 on Performance page (`Loading Points` field) | a430abd |
| April | 11 crash-test bugs across mobile, visual, planning | a8871aa |
| April | 14 critical/high bugs from full audit (Phase 1+2) | 85255a4 |

---

## How we want to be told about new findings

Add to this file under the appropriate severity. Or open a PR. Or just
write a Markdown note and dump it in `docs/audit-findings/`. We'll triage.

The team has been honest about what's broken — please be the same.
