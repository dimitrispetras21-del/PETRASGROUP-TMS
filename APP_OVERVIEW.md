# PETRAS GROUP TMS — App Overview

## What it is
A web-based Transport Management System (TMS) for Petras Group, a cold chain logistics company operating refrigerated trucks between Greece and Central/Eastern Europe.

Built as a single-page application (SPA) with vanilla JavaScript, Airtable as the database, and hosted on GitHub Pages. No backend server — everything runs in the browser.

## The business
Petras Group picks up perishable goods (fruits, vegetables, dairy) from Greek producers, consolidates them at a cross-dock warehouse in Veroia (Northern Greece), and delivers them to supermarket chains across Europe (Germany, Hungary, Austria, Czech Republic, Italy, etc.). They also handle the reverse: importing goods from European suppliers to Greek retailers.

Each truck does a round trip: export outbound, pick up an import load abroad, and return. Maximizing this two-way utilization is the core business challenge.

---

## Architecture

```
Browser (Vanilla JS SPA)
  |
  |-- app.html (shell, loads all modules)
  |-- config.js (Airtable credentials, table IDs, permissions)
  |
  |-- core/
  |     auth.js     — Login, roles (owner/dispatcher/management/accountant)
  |     api.js      — Airtable REST API wrapper with localStorage caching
  |     router.js   — Sidebar navigation, page routing
  |     utils.js    — Date helpers (toLocalDate, localToday), formatting
  |     ui.js       — Shared UI components (modals, toasts, loading states)
  |     entity.js   — Generic CRUD engine for master data tables
  |     ai-chat.js  — "Nakis" AI assistant (Claude API + tool calling)
  |
  |-- modules/
  |     dashboard.js       — Operations command center
  |     weekly_intl.js     — International weekly planner
  |     weekly_natl.js     — National weekly planner
  |     daily_ramp.js      — Veroia warehouse ramp board
  |     daily_ops.js       — Daily operations checklist
  |     orders_intl.js     — International order CRUD
  |     orders_natl.js     — National order CRUD
  |     maintenance.js     — Fleet maintenance dashboard
  |     performance.js     — Employee performance metrics
  |     invoicing.js       — Invoice tracking
  |     locations.js       — Location manager
  |     pallet_ledger.js   — Europallet tracking
  |     pallet_upload.js   — AI pallet sheet extractor
  |
  |-- assets/style.css     — Global design system
  |
  v
Airtable (15 tables)
  ORDERS, NAT_ORDERS, NAT_LOADS, GL_LINES, CONS_LOADS,
  TRUCKS, TRAILERS, DRIVERS, CLIENTS, PARTNERS, LOCATIONS,
  RAMP_PLAN, MAINT_REQ, MAINT_HISTORY, PALLET_LEDGER
```

### Database: Airtable
All data lives in Airtable. The app communicates via REST API. Caching strategy: stable tables (locations, trucks, drivers) cached 30min in localStorage; dynamic tables (orders) cached 2min in memory only.

### Authentication
Simple role-based login stored in localStorage. Four roles with a permission matrix controlling what each user can see and do.

### Design System
- Dark navy sidebar (#0B1929) with icon navigation
- Light content area (#F4F6F9)
- Dashboard uses Bloomberg-style dark cards
- Fonts: Syne (headings), DM Sans (body)
- Accent: #0284C7 (cold chain blue)

---

## Pages — What each one does

### 1. Dashboard (Operations Command Center)
The homepage. Bloomberg-style dark-card layout showing real-time status at a glance.
- **5 KPI cards**: Unassigned exports, unassigned imports, fleet utilization (usage rate formula: working_days x 4.5 x 4.5%), empty return legs, on-time delivery percentage
- **Departures/Deliveries**: Today and tomorrow's scheduled operations with truck plates and status
- **High Risk panel**: Orders delivering within 48h that have no truck assigned
- **Fleet Usage Rate**: Per-truck utilization bars for current and next week, showing idle trucks
- **Fleet Alerts**: Expired or expiring vehicle documents (KTEO, KEK, Insurance)
- **Weekly Score**: Composite score (0-100) based on assignment rate, on-time, compliance, and empty legs
- Auto-refreshes every 5 minutes.

### 2. Weekly International
The main planning tool. A spreadsheet-like 4-column view for one week at a time.

| # | EXPORT | ASSIGNMENT | IMPORT |
|---|--------|------------|--------|
| 1 | Route + dates | Truck pill | Matched return load |

- **Exports** (left column): Orders grouped by delivery date. Shows route, dates, pallets, badges (VEROIA, GRP).
- **Assignment** (center): Click to assign truck/trailer/driver or partner. Navy pill = owned fleet, green = partner, red = unassigned.
- **Imports** (right column): Return loads. Drag an import onto an export row to match them (same truck does both trips).
- **Auto-Match button**: Algorithm that scores export-import pairs by geographic distance (Haversine formula using lat/lng from LOCATIONS table) and date overlap. Suggests best matches for confirmation.
- **Right-click context menu**: Groupage (combine multiple orders on one truck), split, clear assignment.
- **Week navigation**: Horizontal scrollbar with week pills. Week numbers match Airtable's WEEKNUM (Sunday-start).
- **Filtering**: Exports filtered by Airtable Week Number field (delivery-based). Imports filtered by Loading DateTime range within the week.

### 3. Weekly National
Same layout philosophy as Weekly International but for domestic Greek routes. 3 columns:
- **KATHODOS** (North to South): Deliveries from Veroia warehouse to Greek cities
- **ANATHESI** (Assignment): Truck/partner pills
- **ANODOS** (South to North): Pickups from Greek suppliers heading to Veroia

Data comes exclusively from the NAT_LOADS table, which is populated automatically from three sources:
- Veroia Switch orders (international orders that cross-dock at Veroia)
- Direct national orders
- Consolidated groupage loads

Supports drag-drop matching of KATHODOS with ANODOS (same truck does delivery + return pickup).

### 4. Daily Ramp Board
Warehouse operations view for the Veroia cross-dock facility.
- **Two columns**: Inbound (incoming trucks) and Outbound (departing trucks)
- **KPIs**: Inbound pallets, outbound pallets, net flow, stock total, progress
- **Time management**: Dropdown to assign arrival/departure times
- **Postpone**: Move a record to tomorrow if delayed
- **Stock tracking**: Running total of goods in warehouse, with aging indicators
- **Timeline**: All operations sorted chronologically
- Auto-syncs records from ORDERS and NAT_LOADS.

### 5. Daily Ops Plan
Real-time operations checklist for the dispatcher running today's trips.
- **4 sections**: Export Loading, Export Delivery, Import Loading, Import Delivery
- **Per-order checklist**: Docs Ready, Temp OK, CMR Photo Received, Client Notified, Driver Notified
- **Auto-status transitions**: When all loading checks are ticked, prompts to set status to "Loaded". When all delivery checks are ticked, prompts "Delivered (On Time)".
- **Overdue banner**: Orders past delivery date that are still in transit
- **KPI bar**: Pending/Loaded/Delivered counts with progress bars

### 6. International Orders
Full CRUD table for international transport orders.
- **Filters**: Direction (Export/Import), Status, Brand, Week, Trip assignment
- **Multi-stop support**: Up to 10 loading locations and 10 unloading locations per order
- **Veroia Switch**: Toggle that automatically creates national leg records in NAT_LOADS
- **National Groupage**: Toggle that creates groupage line records for consolidation
- **Detail panel**: Full order information with edit/delete capabilities

### 7. National Orders
CRUD table for domestic Greek transport orders.
- Same structure as International Orders but with Greek-specific fields
- Auto-syncs to NAT_LOADS table on save (Source Type = 'Direct')
- Duplicate prevention: warns if an order with same client + loading date already exists

### 8. National Pick Ups
Embedded iframe from a separate repository (petras-assign). Drag-and-drop consolidation tool for grouping multiple small pickups into consolidated truck loads.

### 9. Maintenance
Fleet management dashboard with multiple sub-pages:
- **Dashboard**: Bloomberg-style overview of fleet health, expiry timeline, compliance status
- **Expiry Alerts**: Traffic-light grid showing document status per vehicle
- **Work Orders**: Create and track maintenance requests (SOS/Immediate/Normal priority)
- **Service Records**: Historical maintenance log
- **Truck/Trailer History**: Per-vehicle maintenance timeline

### 10. My Performance (HR Module)
Personal performance dashboard for each user, matching the Bloomberg design.
- **4 KPI cards**: Role-specific metrics (Fleet Usage, Empty Legs, On-Time, Weekly Score for owner; different KPIs for dispatcher/management/accountant)
- **Weekly Score Trend**: Last 4 weeks as colored bar chart
- **Score Circle**: SVG ring visualization with per-KPI breakdown bars
- **Nakis Feedback**: AI-generated performance commentary
- **Recent Deliveries**: Table of last 10 delivered orders with On Time/Delayed pills
- Formula: Usage Rate = min(working_days x 4.5 x 4.5%, 100%)

### 11. Master Data Pages
Generic CRUD pages powered by entity.js for:
- **Clients**: Company profiles
- **Partners**: Subcontractor trucking companies
- **Drivers**: Employee records with license expiry tracking
- **Trucks**: Vehicle records with KTEO/KEK/Insurance expiry
- **Trailers**: Trailer records with FRC/Insurance expiry
- **Locations**: Pickup/delivery points with GPS coordinates (Latitude/Longitude)
- **Workshops**: Maintenance service providers
- **Pallet Ledger**: Europallet balance tracking per client

### 12. Invoicing
Order invoicing workflow with CSV export capability.

---

## Key Concepts

### Veroia Switch
The core logistical operation. International orders can be flagged as "Veroia Switch" which means the goods cross-dock at the Veroia warehouse. This automatically creates a national transport leg:
- **Export VS**: Greek supplier loads truck, drives to Veroia, goods are transferred to international truck heading to Europe
- **Import VS**: International truck arrives at Veroia, goods transferred to national truck for Greek delivery

### Round Trip Matching
Every owned truck ideally does export + import on the same trip (truck goes to Germany loaded, picks up return load in Germany, comes back loaded). The Auto-Match algorithm uses Haversine distance between export delivery location and import loading location to suggest optimal pairings.

### Fleet Usage Rate
Custom metric: working_days x 4.5 x 4.5%. A truck that works 5 days/week scores 100%. Based on the difference between Loading and Delivery dates per order, excluding partner trips.

### Role-Based Access
| Role | Planning | Orders | Maintenance | Costs |
|------|----------|--------|-------------|-------|
| Owner | Full | Full | Full | Full |
| Dispatcher | Full | Full | View | None |
| Management | View | View | Full | View |
| Accountant | View | View | View | Full |

---

## AI Assistant — Nakis

A floating chat widget powered by Claude API with tool calling.

### Capabilities
- **Read orders/fleet data** via Airtable API tools
- **Create work orders** for maintenance
- **Navigate** to any TMS page
- **Set reminders** stored in localStorage
- **Contextual awareness**: Reads current page data (WINTL/WNATL/RAMP/OPS globals) and injects into system prompt
- **Role-based alerts**: Maintenance alerts only for maintenance roles, planning alerts only for planning roles

### Onboarding Interview
First-time users get a 7-question interview to build a personal profile (role, priorities, pain points, preferred detail level). Profile stored in localStorage and used to personalize all future interactions.

### Observer
Background process that scans for:
- Unassigned orders delivering in <48h (critical)
- Orders unassigned >24h (warning)
- Empty return legs this week (info)
- Vehicle document expiry (for maintenance roles)
- User-set reminders due today

---

## Data Flow — The Complete Chain

```
International Order created
  |
  |-- Veroia Switch ON?
  |     YES --> Auto-create NAT_LOADS (Source='VS')
  |     |       Dates: Export VS = Load same day, Deliver +1 day
  |     |               Import VS = Load -1 day, Deliver same day
  |     |-- Groupage ON?
  |     |     YES --> Create GL_LINES (1 per stop)
  |     |             National Pick Ups drag-drop --> CONS_LOADS
  |     |             Auto-create NAT_LOADS (Source='Groupage')
  |     NO --> Direct international order (no national leg)
  |
  |-- Weekly International shows it (filtered by Week Number)
  |-- Dashboard counts it in KPIs
  |-- Daily Ramp creates RAMP record if loading/delivery today
  |-- Daily Ops shows it if loading/delivery today/tomorrow

National Order created
  |-- Auto-create NAT_LOADS (Source='Direct')
  |-- Weekly National shows it
  |-- Daily Ramp creates RAMP record
```

---

## Tech Stack
- **Frontend**: Vanilla JavaScript (no framework), HTML, CSS
- **Database**: Airtable (REST API)
- **Hosting**: GitHub Pages (static site)
- **AI**: Anthropic Claude API (Sonnet 4) via direct browser access
- **Maps**: Haversine distance calculation using stored lat/lng coordinates
- **Caching**: localStorage (30min stable), sessionStorage (chat history), memory (2min dynamic)
