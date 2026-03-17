# PETRAS GROUP — SYSTEM STATUS
_Last updated: 2026-03-17 (Session 14)_

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
| PARTNERS | tbl6LTpiXxQv72R1m |
| LOCATIONS | tblxu8DRfTQOFRCzS |
| RAMP PLAN | tblT8W5WcuToBQNiY |
| PALLET LEDGER | tblAAH3N1bIcBRPXi |

---

## ✅ DECISION: Custom Web App (Session 14)

**Architecture:**
```
Database:  Airtable (€20/month) — unchanged
Frontend:  Vanilla JS SPA — single app.html
Hosting:   GitHub Pages (PETRASGROUP-TMS repo) — free
Auth:      sessionStorage + hardcoded users
```

**Stack rationale:** No Node.js, no build step, no frameworks.
Change = push = live. Claude writes/debugs reliably. Full control.

---

## TMS App — Roles & Permissions

| Module | Owner | Dispatcher | Management | Accountant |
|---|---|---|---|---|
| Planning | ✅ Full | ✅ Full | 👁️ View | 👁️ View |
| Orders Management | ✅ Full | ✅ Full | 👁️ View | 👁️ View |
| Clients & Partners | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| Maintenance | ✅ Full | 👁️ View | ✅ Full | 👁️ View |
| Drivers | ✅ Full | 👁️ View | ✅ Full | ✅ Full |
| Costs / P&L | ✅ Full | ❌ | 👁️ View | ✅ Full |
| Settings | ✅ Full | ❌ | ✅ Full | ❌ |

**Default Users:**
| Username | Password | Role |
|---|---|---|
| dimitris | petras2024 | owner |
| dispatcher | dispatch24 | dispatcher |
| management | manage24 | management |
| accountant | account24 | accountant |

---

## TMS App — Navigation Structure

```
PLANNING
  Dashboard          — KPIs, active trips overview
  Weekly International Plan
  Weekly National Plan
  Weekly National Pick Ups
  Daily Operational Plan
  Daily Ramp Board

ORDERS MANAGEMENT
  International Orders
  National Orders
  Locations

CLIENTS & PARTNERS
  Clients
  Partners

MAINTENANCE
  Dashboard
  Overview
  Trucks Maintenance History
  Trailers Maintenance History
  Expiry Alerts
  Trucks (CRUD)
  Trailers (CRUD)

DRIVERS
  Drivers (CRUD)
  Driver Payroll

COSTS
  Dashboard
  Fuels (Fuel Import)
  Costs (Trip Costs)
  P&Ls

SETTINGS
```

---

## TMS App — Build Status

### ✅ COMPLETED
| File | Description |
|---|---|
| `index.html` | Login page — Volvo navy/silver, truck photo, role-based auth |
| `app.html` | Full SPA shell — dark sidebar + light content, collapsible nav |
| `logo.png` | Petras Group logo (cropped) |
| `truck.jpg` | Scania truck photo (login background graphic) |
| `truck2.jpg` | Volvo truck photo |

**Live modules in app.html:**
- Dashboard (KPIs + active trips table from Airtable)
- International Orders (list + search)
- Trucks, Trailers, Drivers, Clients, Partners (list view)

**Design system:**
- Fonts: Syne (headings/nav) + DM Sans (body)
- Sidebar: dark navy `#0D2140`, collapsible to icons
- Content: light `#F4F6F9` background, white cards
- Icons: custom SVG line-style (no emoji)
- Nav labels: uppercase, letter-spacing

### ⏳ NEXT — Build Queue (priority order)
1. **Planning → Weekly International Plan** — trips per week, assignment status, filter by week
2. **Planning → Daily Ramp Board** — migrate from Airtable Interface
3. **Orders → International Orders** — full CRUD (create/edit modal)
4. **Orders → National Orders** — full CRUD
5. **Trips module** — migrate petras_assign-2.html
6. **Costs → Fuel Import** — migrate fuel_import.html
7. **Costs → Trip Costs + P&L** — migrate trip_costs.html
8. **Maintenance** — trucks/trailers CRUD + service history
9. **Drivers** — CRUD + payroll
10. **Settings** — user management

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
- Cannot create formula fields via API (UNSUPPORTED_FIELD_TYPE_FOR_CREATE)
- Cannot set rollup filter conditions via API → manual UI only
- Button formula: `RECORD_ID()` not `{Record ID}`

### Greek Plate Matching
```javascript
const greek2latin = {'Ι':'I','Α':'A','Β':'B','Ε':'E','Ζ':'Z','Η':'H',
  'Κ':'K','Μ':'M','Ν':'N','Ο':'O','Ρ':'P','Τ':'T','Υ':'Y','Χ':'X'};
```

### Browser → Anthropic API
- Requires header: `anthropic-dangerous-direct-browser-access: true`
- Missing it causes silent failure

### GitHub Push Protection
- Airtable token in code triggers secret scanning block
- Allow via: repo → Security → Secret scanning → unblock

### Airtable Scripting
- Use `console.log()` not `output.text()`
- `sendEmail()` does NOT exist → use `output.set()` + Send Email action
- PARTNERS table: field is `Adress` (single 'd') — exact match required

---

## Pending — Airtable Manual UI Tasks
1. ⏳ TRIPS rollup filters (6 fields: DADI/External/Reefer liters+cost)
2. ⏳ Total Costs formula update (add DADI Cost + External Cost + Reefer Cost)
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
