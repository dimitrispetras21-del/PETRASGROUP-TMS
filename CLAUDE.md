# PETRAS GROUP TMS — Claude Code Context

## Project Overview
Airtable-based Transport Management System for Petras Group / Vermio Fresh AE.
International temperature-controlled road transport: Greece ↔ Central/Eastern Europe.

## Key Rule
**Always ask before making performance, caching, architecture, or infrastructure changes.**
Only make the specific change requested. No "while I'm here" improvements without asking.

---

## Repositories
- **TMS App**: `https://github.com/dimitrispetras21-del/PETRASGROUP-TMS`
  - Deployed at: `https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/app.html`
- **Standalone apps**: `https://github.com/dimitrispetras21-del/petras-assign`
  - Deployed at: `https://dimitrispetras21-del.github.io/petras-assign/`

## Credentials (never commit these to public files)
- **Airtable API Token**: stored in `.env.local` (ask Dimitris)
- **Airtable Base ID**: `appElT5CQV6JQvym8`
- **GitHub Token**: stored in `.env.local` (ask Dimitris)

---

## Airtable Table IDs
| Table | ID |
|---|---|
| ORDERS | tblgHlNmLBH3JTdIM |
| TRIPS | tblgoyV26PBc6L9uE |
| TRIP COSTS | tblWUus6uSpqE1LMW |
| TRUCKS | tblEAPExIAjiA3asD |
| TRAILERS | tblDcrqRJXzPrtYLm |
| DRIVERS | tblTJ5HJCTFLuMrdb |
| PARTNERS | tbl... (check config.js) |
| CLIENTS | tblFWKAQVUzAM8mCE |
| LOCATIONS | tblxu8DRfTQOFRCzS |
| NATIONAL TRIPS | tbloI9yAxxyOJpMyr |
| NATIONAL ORDERS | tblGHCCsTMqAy4KR2 |
| FUEL RECEIPTS | tblxRFsMeVhlLrBjF |
| GROUPAGE LINES | tblxUAaIsUMEDl3qQ |
| CONSOLIDATED LOADS | tbl5XSLQjOnG6yLCW |

---

## File Structure
```
PETRASGROUP-TMS/
├── app.html              # Main entry point — loads all JS modules
├── config.js             # Table IDs, constants
├── assets/
│   └── style.css         # Global styles (--accent: #0284C7 cold chain blue)
├── core/
│   ├── api.js            # atGet, atGetAll, atPatch, atCreate, atDelete + localStorage cache
│   ├── auth.js           # User auth, roles
│   ├── router.js         # Page navigation + module loading
│   └── utils.js, ui.js, entity.js
└── modules/
    ├── orders_intl.js    # International Orders page
    ├── orders_natl.js    # National Orders page
    ├── weekly_intl.js    # Weekly International planner
    ├── weekly_natl.js    # Weekly National planner
    ├── daily_ramp.js     # Ramp plan
    └── dashboard.js      # Dashboard
```

**petras-assign repo** (standalone apps):
```
petras-assign/
├── national_consolidation.html   # National Pick Ups planner (embedded as iframe in TMS)
├── petras_assign.html            # International trip assignment
└── fuel_import.html              # Fuel receipt importer
```

---

## Architecture Rules

### Sync Chain (CRITICAL — never break this)
```
ORDERS (Veroia Switch=ON) → NATIONAL ORDERS (auto-created)
NATIONAL ORDERS (National Groupage=ON) → GROUPAGE LINES (auto-created)
GROUPAGE LINES (Status: Unassigned/Assigned) → CONSOLIDATED LOADS (created by planner)
```

### GL Records Rule (CRITICAL)
**GROUPAGE LINES records are NEVER deleted.**
- On restore/undo: set Status='Unassigned' only
- On Groupage OFF: set Status='Unassigned' only
- Only CONSOLIDATED LOADS records get deleted

### Design System
- Primary accent: `#0284C7` (cold chain blue)
- Hover: `#0369A1`
- Navy sidebar: `#0B1929`
- Fonts: Syne (headings) + DM Sans (body)
- Buttons: `.btn-new-order` (navy→blue hover), `.btn-scan` (blue outline)

### Deploy Process
After editing any file, bump its `?v=` cache version in `app.html`:
```bash
# Example
sed -i '' 's/orders_natl.js?v=[0-9]*/orders_natl.js?v=TIMESTAMP/' app.html
git add . && git commit -m "description" && git push
```

---

## Key Operational Concepts
- **Veroia Switch**: Cross-docking at Vermion/Veroia warehouse — internal operation, never show to clients
- **Wednesday Cutoff**: All export orders accepted until Wednesday for weekend delivery
- **Proactive Pulse Protocol**: 3-stage client communication (Mission Start / Pre-Alert / Fresh-Check Close)
- **National Groupage**: Multiple small suppliers consolidated into one truck (S→N direction)
- **ΑΝΟΔΟΣ** = South→North, **ΚΑΘΟΔΟΣ** = North→South

---

## Common Tasks & How To Ask
- "Πρόσθεσε κουμπί X στη σελίδα Y" → edit the relevant module .js file
- "Φτιάξε το bug στο Z" → find and fix in module
- "Πρόσθεσε field X στο Airtable" → use Airtable Metadata API
- "Ανέβασε τις αλλαγές" → git add/commit/push + bump cache version

## Language
User communicates in Greek. Respond in Greek for discussion, English for code comments.
