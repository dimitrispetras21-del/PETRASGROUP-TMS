# PETRAS GROUP — SYSTEM STATUS
_Last updated: 2026-05-08 (Session 22)_

---

## ⚠️ Current operational state (May 2026)

**Production**: live, used daily. App at https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/app.html

**Audit in progress**: senior dev team auditing from `main` branch. **Hands
off existing code** until user signals audit is complete. New work goes on
isolated feature branches only. Reference: [`docs/AUDIT_ACCESS.md`](docs/AUDIT_ACCESS.md).

**Most recent commits**:
- `3d12da0` — Full audit pack delivered (/docs/ folder)
- `5d9e9ed` — Parallel scan tools + tool-result cache + Notes field
- `6fdef33` — Reverted FAST scan mode (kept duplicate detection)

**Cumulative work this month**: 60+ commits across crash-test fixes, mobile
optimization, visual consistency, scan v2/v3, agentic Νάκης, production
polish, cancel/delete on orders.

**Current open work** (next session pickup):
- Trip Costs module — scope locked, schema proposed, awaiting user
  confirmation on 3 decisions. See
  [project memory: session_22_trip_costs_handoff.md](file:///Users/dimitrispetras/.claude/projects/-Users-dimitrispetras-PETRASGROUP-TMS/memory/session_22_trip_costs_handoff.md).

**Operational pain points**:
- Anthropic API credits deplete periodically (no automated alert)
- ~1090 test records in Airtable polluting KPIs
- API tokens still in browser source (Cloudflare Worker proxy ready, not deployed)

**Branch strategy during audit**:
- `main` = audit-team-visible production
- `feature/costs-module` (not yet created) = next dev work
- No merges to main until audit complete

---

## Credentials
| Key | Value |
|---|---|
| AT Token | `patpPJX***[see Claude project memory]` |
| Anthropic Key | `sk-ant-api03-***[see Claude project memory]` |
| Airtable Base | `appElT5CQV6JQvym8` |
| GitHub Token (petras-assign) | `ghp_DZl***[see Claude project memory]` |
| GitHub Token (PETRASGROUP-TMS) | `ghp_BZk***[see Claude project memory]` |
| Old GitHub Pages | `https://dimitrispetras21-del.github.io/petras-assign/` |
| **NEW TMS App** | `https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/` |
| Old Repo | `https://github.com/dimitrispetras21-del/petras-assign` |
| **NEW TMS Repo** | `https://github.com/dimitrispetras21-del/PETRASGROUP-TMS` |

---

## Airtable Table IDs
| Table | ID |
|---|---|
| ORDERS | tblgHlNmLBH3JTdIM |
| TRIPS | tblgoyV26PBc6L9uE |
| TRIP COSTS | tblWUus6uSpqE1LMW |
| TRUCKS | tblEAPExIAjiA3asD |
| TRAILERS | tblDcrqRJXzPrtYLm |
| DRIVERS | tbl7UGmYhc2Y82pPs |
| DRIVER LEDGER | tblZVr4BCr9sGFf8n |
| FUEL RECEIPTS | tblxRFsMeVhlLrBjF |
| NATIONAL TRIPS | tbloI9yAxxyOJpMyr |
| NATIONAL ORDERS | tblGHCCsTMqAy4KR2 |
| CLIENTS | tblFWKAQVUzAM8mCE |
| PARTNERS | tblLHl5m8bqONfhWv |
| LOCATIONS | tblxu8DRfTQOFRCzS |
| RAMP PLAN | tblT8W5WcuToBQNiY |
| PALLET LEDGER | tblAAH3N1bIcBRPXi |

---

## DECISION: Custom Web App

**Architecture:**
```
Database:  Airtable (€20/month)
Frontend:  Vanilla JS SPA — single app.html
Hosting:   GitHub Pages (PETRASGROUP-TMS repo) — free
Auth:      sessionStorage + hardcoded users in app.html
```

---

## Roles & Permissions

| Module | Owner | Dispatcher | Management | Accountant |
|---|---|---|---|---|
| Planning | ✅ Full | ✅ Full | 👁 View | 👁 View |
| Orders | ✅ Full | ✅ Full | 👁 View | 👁 View |
| Clients & Partners | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| Maintenance | ✅ Full | 👁 View | ✅ Full | 👁 View |
| Drivers | ✅ Full | 👁 View | ✅ Full | ✅ Full |
| Costs / P&L | ✅ Full | ❌ | 👁 View | ✅ Full |
| Settings | ✅ Full | ❌ | ✅ Full | ❌ |

**Login users:**
| Username | Password | Role |
|---|---|---|
| dimitris | petras2024 | owner |
| dispatcher | dispatch24 | dispatcher |
| management | manage24 | management |
| accountant | account24 | accountant |

---

## Navigation Structure

```
PLANNING
  Dashboard
  Weekly International
  Weekly National
  National Pick Ups
  Daily Ops Plan
  Daily Ramp Board

ORDERS
  International Orders
  National Orders
  Locations

CLIENTS & PARTNERS
  Clients
  Partners

MAINTENANCE
  Dashboard
  Overview
  Trucks History
  Trailers History
  Expiry Alerts
  Trucks
  Trailers

DRIVERS
  Drivers
  Driver Payroll

COSTS
  Dashboard
  Fuels
  Costs
  P&Ls

SETTINGS
```

---

## TMS App — Build Status (Session 15)

### ✅ COMPLETED

| File | Description |
|---|---|
| `index.html` | Login page — dark navy, truck photo, role-based auth |
| `app.html` | Full SPA — 2150+ lines, all modules |
| `logo.png` | Petras Group logo (cropped, white-inverted in sidebar) |
| `truck.jpg` | Login background graphic |
| `SYSTEM_STATUS.md` | This file |

**Design system (Session 15 final):**
- Fonts: Syne (headings/nav) + DM Sans (body)
- Sidebar: dark navy `#080F1A`, collapsible to 56px icon-only mode
- Nav: compact — 10px font, 5px padding, all items fit without scroll
- Logo: 36px height, prominent
- Content: `#F7F8FA` background, white cards `#FFFFFF`
- Icons: custom SVG line-style (no emoji)
- Nav labels: UPPERCASE, 10px, 1.3px letter-spacing
- All UI strings: 100% English
- Buttons: solid dark navy — single CTA style
- Badges: flat, 4px border-radius
- Detail panel: slides in from right, `#F7F8FA` bg

**Live & functional modules:**

| Module | Features |
|---|---|
| Dashboard | KPIs (active trips, weekly trips, pending orders, total), active trips table |
| Clients | List + search + country/status filter + detail panel + create/edit modal |
| Partners | List + search + country/status filter + detail panel + create/edit modal |
| Drivers | List + search + type/status filter + detail panel + create/edit modal |
| Trucks | List + search + brand/status filter + detail panel + create/edit modal |
| Trailers | List + search + type/status filter + detail panel + create/edit modal |

**Master data engine features (all 5 entities):**
- Search across all relevant text fields simultaneously
- Multiple dropdown filters (dynamic options from live data)
- Sticky table headers
- Click row → detail panel slides in from right
- Expiry date coloring: green/amber/red based on days remaining
- Active/Inactive toggle directly in detail panel (updates Airtable)
- Edit button per row → modal form
- Create new record → modal form with sections
- Form saves directly to Airtable via PATCH/POST API
- Cache invalidation on save → auto-refresh

### ⏳ NEXT BUILD QUEUE

1. **International Orders** — full CRUD with trip assignment status
2. **Weekly International Plan** — trips per week, assignment view
3. **Daily Ramp Board** — migrate from Airtable Interface
4. **Trips module** — migrate petras_assign-2.html
5. **Costs → Fuel Import** — migrate fuel_import.html
6. **Costs → Trip P&L** — migrate trip_costs.html
7. **Maintenance** — service history per vehicle
8. **Driver Payroll** — ledger view
9. **Settings** — user management

---

## Legacy Apps (petras-assign repo) — Still Active

| App | URL | Status |
|---|---|---|
| Trip Assignment v2 | `.../petras_assign-2.html` | ✅ Live |
| National Assignment | `.../national_assign.html` | ✅ Live |
| Order Intake | `.../order_upload.html` | ✅ Live |
| Pallet Upload v2 | `.../pallet_upload_v2.html` | ✅ Live |
| Trip P&L Entry | `.../trip_costs.html` | ✅ Live |
| Fuel & Tolls Import | `.../fuel_import.html` | ✅ Live |

**These remain active until equivalent module is built in new TMS app.**

---

## Key Technical Notes

### Airtable API
- Rate limit: 5 req/sec → cache 60s in JS `_cache` object
- Linked record filter: `FIND("recXXX", ARRAYJOIN({Trip Link}, ","))`
- Cannot create formula fields via API
- Cannot set rollup filter conditions via API → manual UI only
- Button formula: `RECORD_ID()` not `{Record ID}`
- PARTNERS table ID confirmed: `tblLHl5m8bqONfhWv`
- PARTNERS field: `Adress` (single 'd') — exact match required

### Master Data Engine Pattern
- Config-driven: `ENTITY_CONFIG` object defines columns, filters, form fields, detail sections per entity
- `renderEntity(key)` → single function handles all 5 entities
- `buildEntityTable()` → renders table from config
- `selectEntity()` → populates detail panel
- `openEntityCreate/Edit()` → builds modal form from config
- `saveEntityRecord()` → PATCH or POST to Airtable
- `applyEntityFilters()` → client-side filtering after initial load
- `toggleActive()` → instant PATCH + cache bust + re-render

### GitHub
- Push protection: Airtable token in code → allow via secret scanning UI
- Force push allowed (no branch protection on main)

### Browser → Anthropic API
- Requires header: `anthropic-dangerous-direct-browser-access: true`

### Airtable Scripting
- Use `console.log()` not `output.text()`
- `sendEmail()` does NOT exist → use `output.set()` + Send Email action

---

## Pending — Airtable Manual UI Tasks
1. ⏳ TRIPS rollup filters (6 fields: DADI/External/Reefer liters+cost)
2. ⏳ Total Costs formula update (add fuel cost fields)
3. ⏳ RAMP PLAN automation (script ready, not added)
4. ⏳ Driver Pay rollup in TRIPS from DRIVER LEDGER

---

## Strategic Notes
- **Veroia Switch** = INTERNAL cross-docking — never notify clients
- **Wednesday Cutoff** = all export orders until Wed for weekend delivery
- **Proactive Pulse Protocol:** Mission Start (30min) → Pre-Alert (Tue AM) → Fresh-Check Close (1h after CMR)
- **Red Light Rule:** CALL immediately for delays, update every 2h
- **DPS Logistics** = second brand, dual-brand model active
- **Migration horizon:** Revisit custom stack Q3/Q4 2026 if needed
