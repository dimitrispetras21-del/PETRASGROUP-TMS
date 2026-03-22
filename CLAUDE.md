# PETRAS GROUP TMS — Claude Code Context

## PRIME DIRECTIVE
Ask before making performance, caching, architecture, or infrastructure changes.
Only make the specific change requested. No unrequested improvements.
After every file change: bump its `?v=TIMESTAMP` in app.html + git add/commit/push.

---

## Repositories
- **TMS App**: `https://github.com/dimitrispetras21-del/PETRASGROUP-TMS`
  - Live: `https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/app.html`
- **Standalone apps**: `https://github.com/dimitrispetras21-del/petras-assign`
  - Live: `https://dimitrispetras21-del.github.io/petras-assign/`

## Credentials
Store in `.env.local` — never commit. Ask Dimitris for values.
- Airtable PAT: `patpPJXnFYnxdgoK3.*`
- Airtable Base ID: `appElT5CQV6JQvym8`
- GitHub Token: `ghp_S98IhpFBSDxt*`

---

## Table IDs
| Table | ID |
|---|---|
| ORDERS | tblgHlNmLBH3JTdIM |
| NATIONAL ORDERS | tblGHCCsTMqAy4KR2 |
| GROUPAGE LINES | tblxUAaIsUMEDl3qQ |
| CONSOLIDATED LOADS | tbl5XSLQjOnG6yLCW |
| TRIP COSTS | tblWUus6uSpqE1LMW |
| FUEL RECEIPTS | tblxRFsMeVhlLrBjF |
| PALLET LEDGER | tblAAH3N1bIcBRPXi |
| RAMP PLAN | tblT8W5WcuToBQNiY |
| TRUCKS | tblEAPExIAjiA3asD |
| TRAILERS | tblDcrqRJXzPrtYLm |
| DRIVERS | tbl7UGmYhc2Y82pPs |
| CLIENTS | tblFWKAQVUzAM8mCE |
| PARTNERS | tblLHl5m8bqONfhWv |
| LOCATIONS | tblxu8DRfTQOFRCzS |

Special: Veroia Cross-Dock location = `recJucKOhC1zh4IP3`

---

## File Structure
```
PETRASGROUP-TMS/
├── app.html              ← Shell + all <script> tags with ?v= cache busting
├── config.js             ← AT_TOKEN, AT_BASE, TABLES constants
├── assets/style.css      ← Global styles
├── core/
│   ├── api.js            ← atGet/atGetAll/atPatch/atCreate/atDelete + localStorage cache
│   ├── auth.js           ← Roles: dispatcher/warehouse/management
│   ├── router.js         ← navigate(), sidebar render, page routing
│   ├── utils.js
│   ├── ui.js
│   └── entity.js         ← Generic CRUD for master data
└── modules/
    ├── orders_intl.js    ← International Orders CRUD
    ├── orders_natl.js    ← National Orders CRUD
    ├── weekly_intl.js    ← Weekly International planner
    ├── weekly_natl.js    ← Weekly National planner
    ├── daily_ramp.js     ← Ramp Board (Veroia WH)
    └── dashboard.js

petras-assign/
├── national_consolidation.html  ← National Pick Ups (embedded as iframe in TMS)
├── fuel_import.html             ← Fuel receipt importer
└── pallet_upload_v2.html        ← AI pallet sheet extractor
```

---

## Architecture Rules (CRITICAL)

### Sync Chain — never break
```
ORDERS (Veroia Switch=ON) → NATIONAL ORDERS (auto-created)
  ↓ National Groupage=ON
GROUPAGE LINES (1 per stop, Status: Unassigned/Assigned)
  ↓ national_consolidation.html drag & drop
CONSOLIDATED LOADS (1 per truck)
  ↓ appears in
Weekly National ΑΝΟΔΟΣ column
```

### GL Records — NEVER deleted
- On restore: set Status='Unassigned' only
- On Groupage OFF: set Status='Unassigned' only  
- Only CONSOLIDATED LOADS records get deleted on restore

### Airtable API Critical Patterns
```js
// Linked records: plain string array
fields['Driver'] = ['recABC123']       // ✅
fields['Driver'] = [{id: 'recABC123'}] // ❌ INVALID_RECORD_ID

// Filter for linked record
filterByFormula = `FIND("recXXX", ARRAYJOIN({Linked Order}, ","))>0`
// NOT SEARCH() — unreliable

// Checkbox filter
filterByFormula = `{National Groupage}=1`  // use 1 not TRUE()

// Direction field in NATIONAL ORDERS: arrow chars
'North→South' (ΚΑΘΟΔΟΣ), 'South→North' (ΑΝΟΔΟΣ)

// Direction field in CONSOLIDATED LOADS: Greek
'ΚΑΘΟΔΟΣ', 'ΑΝΟΔΟΣ'  — NOT English

// Field name traps:
' Week Number'  ← leading space, formula, NOT writable
'Veroia Switch ' ← trailing space
'Adress' ← one 'd' in PARTNERS table
```

### Deploy pattern
```bash
# After editing any module file:
# 1. Edit file
# 2. Bump version in app.html: modules/orders_natl.js?v=TIMESTAMP
# 3. git add . && git commit -m "description" && git push
```

---

## Design System
- Primary accent: `#0284C7` (cold chain blue), hover: `#0369A1`
- Sidebar: `#0B1929` navy, active item: blue left border `#38BDF8`
- Fonts: Syne (headings) + DM Sans (body)
- Button classes: `.btn-new-order` (navy→blue), `.btn-scan` (blue outline)
- Assignment cards: navy blue (owned fleet), dark green (partner), dark red (unassigned)

---

## Module Status (March 2026)
### Live ✅
- Weekly International (assignment, groupage, drag-drop)
- Weekly National (ΚΑΘΟΔΟΣ / ΑΝΟΔΟΣ / CONSOLIDATED LOADS)
- National Pick Ups (embedded iframe from national_consolidation.html)
- International Orders CRUD
- National Orders CRUD
- Locations, Clients, Partners, Drivers (entity.js)
- Daily Ramp Board
- Fuel Import, Pallet Upload (standalone apps)

### Critical — Next to build 🔴
- Trip Costs / P&L entry (trip_costs.js)
- Fuel Receipts management UI (fuels.js)
- P&L Dashboard (pnl.js)

### Post-launch 🔵
- Fleet management (fleet.js)
- Driver Payroll (payroll.js)
- MyGeotab GPS integration via Make.com
- Settings (settings.js)

---

## Key Business Concepts
- **Veroia Switch**: Internal cross-docking at Vermion/Veroia — NEVER tell clients
- **Wednesday Cutoff**: Export orders accepted until Wed for weekend delivery
- **ΑΝΟΔΟΣ** = South→North (suppliers → Veroia), **ΚΑΘΟΔΟΣ** = North→South
- **Proactive Pulse**: 3-stage client comms (Mission Start / Pre-Alert / Fresh-Check Close)
- **National Groupage**: Multiple small suppliers consolidated into one truck

## Language
User (Dimitris) communicates in Greek. Respond in Greek for discussion, English for code comments.


---

## Current Build Status (March 2026)

### Live ✅
- Weekly International — full assignment, groupage, drag-drop, remove import
- Weekly National — ΚΑΘΟΔΟΣ / ΑΝΑΘΕΣΗ / ΑΝΟΔΟΣ + CONSOLIDATED LOADS display
- National Pick Ups — embedded as iframe (national_consolidation.html)
- International Orders CRUD
- National Orders CRUD (Pickup/Delivery/Client columns working)
- Locations manager
- Daily Ramp Board
- Clients / Partners / Drivers CRUD
- Fuel Import (DADI + DKV)
- Pallet Upload (AI extraction)
- National Consolidation Planner (drag-drop, save, restore, split)
- Veroia Switch sync chain (ORDERS → NO → GL, never-delete GL rule)
- localStorage cache (30min for stable tables)

### Critical — Next to build
- Trip Costs P&L entry (trip_costs.js)
- Fuel receipts UI in TMS (fuels.js)
- P&L dashboard (pnl.js)

### Known Issues
- 1,090 test records in Airtable need cleanup
- RAMP PLAN automation script ready but not added to Airtable
- Driver Payroll bulk import pending

### Design System
- Accent: `#0284C7` (Cold Chain Blue)
- Hover: `#0369A1`
- Sidebar navy: `#0B1929`
- Unassigned pills: `#7F1D1D` (dark red)
- Owned fleet pills: `#0C2D5C` (deep navy)
- Fonts: Syne (headings) + DM Sans (body)
- Button classes: `.btn-new-order` (navy→blue), `.btn-scan` (blue outline)
