# Petras Group TMS — Audit Pack

Welcome. This folder is the **starting point for code/architecture audits**.
It assumes the reader is a senior dev who has *not* worked on this codebase
before. The goal is to take you from "I just got the repo" to "I can find
my way around" in under an hour.

---

## What this app is

A **Transport Management System** for Petras Group — a Greek cold-chain
logistics company operating Greece ↔ Central/Eastern Europe routes.

- **Stack**: vanilla JS SPA, no framework. ~30 modules, ~30k LOC.
- **Backend**: Airtable (15 tables, 200k+ records target). REST API, no DB layer.
- **Hosting**: GitHub Pages (static).
- **AI**: Direct Anthropic API for Νάκης assistant + document scanning.
- **Users**: 6 internal (dispatchers, owner, accountant, ops manager).
- **Status**: production-used by Petras team daily.

Live: `https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/app.html`

---

## Read order

If you have **30 minutes**:
1. This README
2. [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) — what's broken/incomplete (saves time)
3. [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — sync chain mental model
4. Skim [`../CLAUDE.md`](../CLAUDE.md) — operational notes

If you have **2 hours**:
- All Tier 1 above plus:
5. [`SCHEMA.md`](./SCHEMA.md) — Airtable tables + field naming gotchas
6. [`DEBUGGING.md`](./DEBUGGING.md) — console commands you'll want to know
7. [`PERFORMANCE.md`](./PERFORMANCE.md) — known bottlenecks
8. [`SECURITY.md`](./SECURITY.md) — threat model + known gaps
9. [`TESTING.md`](./TESTING.md) — canonical flows to verify
10. [`CHANGELOG_ANNOTATED.md`](./CHANGELOG_ANNOTATED.md) — recent commits with "why"

When you find issues:
→ Drop a Markdown file in [`audit-findings/`](./audit-findings/) — see template in TESTING.md.

For owner reference (provisioning access):
→ [`AUDIT_ACCESS.md`](./AUDIT_ACCESS.md) — checklist of what to provision + how.

---

## Repository layout

```
PETRASGROUP-TMS/
├── app.html                 ← shell + script tags with ?v= cache busting
├── index.html               ← login page (separate from app)
├── config.js                ← Airtable creds, table IDs, role matrix
├── sw.js                    ← Service Worker for offline / PWA
├── core/
│   ├── api.js               ← atGet/atGetAll/atPatch/atCreate/atDelete + cache + queue
│   ├── auth.js              ← role guard + session expiry
│   ├── router.js            ← navigate(), sidebar render, page routing
│   ├── utils.js             ← toast, error log, audit log, notifications
│   ├── ui.js                ← modal, empty states, loading skeletons
│   ├── entity.js            ← generic CRUD engine (clients/partners/drivers/trucks/trailers/locations)
│   ├── scan-helpers.js      ← shared AI scan logic (preprocessing, tools, fuzzy match)
│   ├── ai-chat.js           ← Νάκης AI assistant (1700+ LOC)
│   ├── form-helpers.js      ← shared form widgets (autocomplete inputs, etc.)
│   ├── data-helpers.js      ← linked-record lookups + duplicate detection
│   ├── stops-helpers.js     ← ORDER_STOPS save/load
│   ├── pa-helpers.js        ← PARTNER_ASSIGN sync
│   ├── order-sync.js        ← downstream sync coordinator
│   ├── command-palette.js   ← ⌘K quick jump
│   ├── command-center.js    ← shared "command center" component used in Weekly views
│   ├── metrics.js           ← canonical KPI calculations
│   ├── icons.js             ← inline Lucide SVG icon set
│   └── constants.js         ← misc enums
├── modules/
│   ├── dashboard.js         ← main dashboard (KPIs, alerts)
│   ├── ceo_dashboard.js     ← owner-only strategic view
│   ├── weekly_intl.js       ← weekly international planner
│   ├── weekly_natl.js       ← weekly national planner (ΑΝΟΔΟΣ/ΚΑΘΟΔΟΣ)
│   ├── daily_ops.js         ← dispatcher command centre (today/tomorrow)
│   ├── daily_ramp.js        ← Veroia warehouse ramp board
│   ├── orders_intl.js       ← International orders CRUD + scan
│   ├── orders_natl.js       ← National orders CRUD + scan
│   ├── locations.js         ← locations master data
│   ├── maintenance.js       ← workshops + work orders + expiry alerts
│   ├── pallet_upload.js     ← AI pallet sheet extractor
│   ├── pallet_ledger.js     ← suppliers + partners pallet ledger
│   ├── invoicing.js         ← invoice management
│   ├── performance.js       ← per-user KPI dashboard
│   └── metrics_audit.js     ← admin tool — verifies all metric calcs
├── assets/style.css         ← global stylesheet (~5500 lines)
├── tests/                   ← unit + e2e (Playwright)
├── worker/                  ← Cloudflare Worker proxy (NOT deployed yet)
└── docs/                    ← you are here
```

---

## Setup for audit work

### Read-only (recommended for auditors)
```bash
git clone https://github.com/dimitrispetras21-del/PETRASGROUP-TMS.git
cd PETRASGROUP-TMS
open index.html  # → login screen, use credentials from owner
```

### Run locally with hot-reload
No build step. Open `app.html` directly in a browser. The Airtable token
is hardcoded in `config.js` — auditor will need either:
- a separate test Airtable PAT (best practice), or
- the production PAT (handle with care, see [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) §Security)

### Useful scripts
```bash
bash build.sh                  # produces minified bundle (rarely used — prod runs unminified)
bash scripts/bump-versions.sh  # bumps ?v= cache-bust on changed files
```

---

## Testing the live app

| Asset | URL / Path |
|---|---|
| Live app | https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/app.html |
| Login | https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/index.html |
| Repo | https://github.com/dimitrispetras21-del/PETRASGROUP-TMS |
| Issues | (none — track in audit doc directly) |
| Sentry | Not yet configured (see [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md)) |

### Test user
Ask the owner for a low-privilege test account. **Don't audit with the
`owner` role** — you'll see CEO Dashboard + admin tools that may bias your
view of the dispatcher's reality. Use `dispatcher` or `accountant`.

---

## Where bugs typically surface

Based on the last 60+ commits, these are the **hot zones**:

1. **`core/api.js` lines 200-380** (atGetAll, retry, validation) — rate limits, field name changes
2. **`modules/orders_intl.js` cascade delete + scan flow** — multi-step async chain
3. **`modules/daily_ramp.js` auto-sync** — runs every 2 minutes, race conditions with edits
4. **Sync chain ORDERS → NAT_LOADS → GL → CL → NL → RAMP** — many failure modes (see ARCHITECTURE.md)
5. **`core/scan-helpers.js` tool-use loop** — multi-turn API conversation with tool execution

If an auditor finds something weird, it's almost certainly in one of those
five places. Consider it a starting point.

---

## Conventions / style

- **No build pipeline by default.** Each `<script>` tag has `?v=TIMESTAMP`
  for cache busting. Bump it on every file change. (Yes, this is manual.
  See `scripts/bump-versions.sh` for help.)
- **Greek + English mixed**: UI is Greek for the Petras team (Greek users).
  Comments are mostly English. Console messages are mixed.
- **No TypeScript.** Inline JSDoc where it matters.
- **Functional over OO** — most modules are loose collections of functions
  on `window`. State is module-scoped const objects (e.g. `INV`, `LOC`, `OPS`).
- **Inline styles + utility classes mix.** A design-token CSS layer was added
  late (`tms-stat-card`, `tms-pill` etc.) — older modules still have inline.
- **No transactions** in Airtable. Cascade deletes are best-effort with
  `_delFail` counter + toast warnings. See [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md).

---

## Support / questions

The codebase has been actively iterated for ~6 months. Most "why is this
ugly?" questions have an answer. If you can't figure out what something is
for, check the commit message — they're consistently detailed.

```bash
git log --oneline --grep="<keyword>" | head
git log --follow -p -- <path/to/file> | head -200
```

— Audit pack assembled May 2026.
