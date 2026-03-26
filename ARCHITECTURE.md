# PETRAS GROUP TMS — PLANNING ARCHITECTURE v2.0

## STATUS: PENDING IMPLEMENTATION (Session 17, 26/03/2026)

---

## TABLES

| Table | ID | Role |
|-------|-----|------|
| ORDERS | tblgHlNmLBH3JTdIM | International orders (Export/Import) |
| NAT_ORDERS | tblGHCCsTMqAy4KR2 | National orders (direct only, NOT for VS) |
| GL_LINES | tblxUAaIsUMEDl3qQ | 1 record per stop (groupage) |
| CONS_LOADS | tbl5XSLQjOnG6yLCW | 1 record per truck (groupage consolidation) |
| NAT_LOADS | tblVW42cZnfC47gTb | **SINGLE planning table** — every national movement |
| RAMP_PLAN | tblT8W5WcuToBQNiY | Daily ramp operations at Veroia |

### NAT_LOADS Fields (verified in Airtable)
```
Source Type        — 'Direct' / 'VS' / 'Groupage'
Source Record      — recID of parent (ORDERS / NAT_ORDERS / CL)
Source Orders      — recID (same as Source Record for now)
Direction          — 'ΚΑΘΟΔΟΣ' / 'ΑΝΟΔΟΣ' (Greek in DB, display as ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ in UI)
Pickup Location 1  — linked record (location)
Delivery Location 1 — linked record (location)
Loading DateTime   — ISO datetime
Delivery DateTime  — ISO datetime
Client             — text
Goods              — text
Temperature C      — number
Total Pallets      — number
Pallet Exchange    — checkbox
Reference          — text
Status             — 'Pending' / 'Assigned' / 'In Transit' / 'Delivered'
Name               — auto-generated "Client — Date"
Truck              — linked record (to add)
Trailer            — linked record (to add)
Driver             — linked record (to add)
Partner            — linked record (to add)
Partner Rate       — number (to add)
Matched Load       — linked record to another NAT_LOADS (to add)
```

---

## VEROIA SWITCH (VS) — COMPLETE LOGIC

### What it is
Internal cross-docking at VERMION FRESH / CROSS-DOCK (recJucKOhC1zh4IP3).
An international order splits into 2 legs:
- **International leg**: Europe ↔ Veroia (ORDERS table)
- **National leg**: Veroia ↔ Greece (NAT_LOADS table)

### VS EXPORT (ΑΝΟΔΟΣ = South→North)

```
Supplier (Greece) →[load]→ VEROIA [unload/cross-dock] →[load]→ Europe [deliver]
```

**Example**: Αγροχημική Λάππα → Veroia → Tesco Budapest

| Field | INTL ORDER | NAT_LOADS (auto-created) |
|-------|-----------|--------------------------|
| Direction | Export | ΑΝΟΔΟΣ |
| Source Type | — | 'VS' |
| Loading Location | Αγροχημική Λάππα | **Αγροχημική Λάππα** (= INTL Loading Loc) |
| Loading DateTime | 24/03 | **24/03** (= INTL Loading DateTime) |
| Unloading Location | Tesco Budapest | **VERMION FRESH / CROSS-DOCK** (Veroia, fixed) |
| Unloading DateTime | 27/03 | **25/03** (= INTL Loading DateTime + 1 day) |
| Pallets | 17 | 17 (same) |
| Client | Tesco | Tesco (same) |

**Logic**: Supplier loads → truck drives to Veroia → arrives next day → cross-dock → international leg begins.

### VS IMPORT (ΚΑΘΟΔΟΣ = North→South)

```
Europe [load] → VEROIA [unload/cross-dock] →[load]→ Client (Greece) [deliver]
```

**Example**: Fruchthof Meissen → Veroia → Spreafico Hellas Αθήνα

| Field | INTL ORDER | NAT_LOADS (auto-created) |
|-------|-----------|--------------------------|
| Direction | Import | ΚΑΘΟΔΟΣ |
| Source Type | — | 'VS' |
| Loading Location | Fruchthof Meissen | **VERMION FRESH / CROSS-DOCK** (Veroia, fixed) |
| Loading DateTime | 24/03 | **29/03** (= INTL Delivery DateTime - 1 day) |
| Unloading Location | Spreafico Αθήνα | **Spreafico Αθήνα** (= INTL Unloading Loc) |
| Unloading DateTime | 30/03 | **30/03** (= INTL Delivery DateTime) |
| Pallets | 29 | 29 (same) |
| Client | Spreafico | Spreafico (same) |

**Logic**: International truck arrives Veroia → cross-dock → national truck loads next day → delivers to Greek client.

### VS DATE FORMULAS (CRITICAL)

```javascript
// Export VS (ΑΝΟΔΟΣ) — supplier → Veroia
natLoadingDT  = intlOrder['Loading DateTime']           // same day
natDeliveryDT = intlOrder['Loading DateTime'] + 1 day   // next day

// Import VS (ΚΑΘΟΔΟΣ) — Veroia → client
natLoadingDT  = intlOrder['Delivery DateTime'] - 1 day  // day before delivery
natDeliveryDT = intlOrder['Delivery DateTime']           // same day
```

### VS LOCATION RULES

| Direction | NAT_LOADS Pickup | NAT_LOADS Delivery |
|-----------|-----------------|-------------------|
| **ΑΝΟΔΟΣ** (Export VS) | INTL Loading Location (supplier GR) | **VERMION FRESH / CROSS-DOCK** |
| **ΚΑΘΟΔΟΣ** (Import VS) | **VERMION FRESH / CROSS-DOCK** | INTL Unloading Location (client GR) |

---

## GROUPAGE (GRP) — COMPLETE LOGIC

### What it is
Multiple small suppliers/recipients consolidated into 1 truck.

### ΑΝΟΔΟΣ Groupage (multiple suppliers → Veroia)

```
Order 1 (VS+GRP) → GL Line: Αγροχημική Λάππα, 10 pal, 24/03
Order 2 (VS+GRP) → GL Line: Spreafico Hellas, 8 pal, 24/03
Order 3 (VS+GRP) → GL Line: Dole Hellas, 12 pal, 24/03
                      ↓
              National Pick Ups (drag & drop)
                      ↓
              CONSOLIDATED LOAD:
                Loading: Αγροχημική, Spreafico, Dole (multi-stop)
                Delivery: VERMION FRESH / CROSS-DOCK
                Total: 30 pal
                Direction: ΑΝΟΔΟΣ
                      ↓
              NAT_LOADS (Source Type='Groupage')
```

### ΚΑΘΟΔΟΣ Groupage (Veroia → multiple recipients)

```
Order 1 (VS+GRP) → GL Line: Spreafico Αθήνα, 15 pal, 30/03
Order 2 (VS+GRP) → GL Line: Lidl Ασπρόπυργος, 18 pal, 30/03
                      ↓
              National Pick Ups (drag & drop)
                      ↓
              CONSOLIDATED LOAD:
                Loading: VERMION FRESH / CROSS-DOCK
                Delivery: Spreafico, Lidl (multi-stop)
                Total: 33 pal
                Direction: ΚΑΘΟΔΟΣ
                      ↓
              NAT_LOADS (Source Type='Groupage')
```

---

## 5 SCENARIOS — COMPLETE FLOWS

### Scenario 1: Simple International (no VS)
```
USER → ORDERS (Export/Import)
  → Weekly International (source: ORDERS)
  → Assign truck/partner
  NO national impact.
```

### Scenario 2: International + VS (no groupage)
```
USER → ORDERS (VS=ON)
  → AUTO: NAT_LOADS (Source Type='VS')
  → Weekly National shows it
  → Assign truck/partner in Weekly National

  VS OFF → DELETE: NAT_LOADS + RAMP
```

### Scenario 3: International + VS + Groupage
```
USER → ORDERS (VS=ON, GRP=ON)
  → AUTO: GL_LINES (1 per stop, Status=Unassigned)
  → National Pick Ups: drag GL → truck
  → AUTO: CONSOLIDATED_LOADS (1 per truck)
  → AUTO: NAT_LOADS (Source Type='Groupage')
  → Weekly National shows CL

  VS OFF → DELETE: GL + CL + NAT_LOADS + RAMP
  GRP OFF → DELETE: GL + CL + NAT_LOADS(Groupage)
```

### Scenario 4: National Order (direct, no groupage)
```
USER → NAT_ORDERS
  → AUTO: NAT_LOADS (Source Type='Direct')
  → Weekly National shows it
  → Assign truck/partner
```

### Scenario 5: National Order + Groupage
```
USER → NAT_ORDERS (GRP=ON)
  → AUTO: GL_LINES (1 per stop)
  → National Pick Ups: drag GL → truck
  → AUTO: CONSOLIDATED_LOADS
  → AUTO: NAT_LOADS (Source Type='Groupage')
  → Weekly National shows CL

  GRP OFF → DELETE: GL + CL + NAT_LOADS(Groupage)
```

---

## INTERFACES & SOURCES

| Interface | Source Table | Filters |
|-----------|-------------|---------|
| **Weekly International** | ORDERS | Type=International, Week=X |
| **Weekly National** | **NAT_LOADS only** | Week=X, grouped by date |
| **National Pick Ups** | GL_LINES (unassigned) + CONS_LOADS | Status filter |
| **Daily Ramp Board** | RAMP_PLAN | Date=today |
| **International Orders** | ORDERS | CRUD |
| **National Orders** | NAT_ORDERS | CRUD |
| **Daily Ops Plan** | ORDERS | Status=Assigned/In Transit |
| **Dashboard** | ORDERS + NAT_LOADS + TRUCKS | Aggregations |
| **Invoicing** | ORDERS | Status=Delivered, invoice fields |

---

## DELETE / CLEANUP CHAINS

| Action | Cascade Deletes |
|--------|----------------|
| **VS OFF** | NAT_LOADS (where Source Record = this order, Source Type='VS') + RAMP |
| **VS OFF + had GRP** | GL + CL + NAT_LOADS (Source Type='Groupage') + RAMP |
| **Groupage OFF (VS path)** | GL + CL + NAT_LOADS(Groupage) |
| **Groupage OFF (NAT path)** | GL + CL + NAT_LOADS(Groupage) |
| **Delete INTL Order** | NAT_LOADS + GL + CL + RAMP |
| **Delete NAT Order** | NAT_LOADS + GL + CL |
| **Restore CL** | GL → Status='Unassigned', DELETE CL + NAT_LOADS(Groupage) |
| **Split CL** | GL → Status='Unassigned' (removed lines), update CL pallets |

### GL RULES (CRITICAL — NEVER BREAK)
```
⚠️ NEVER delete GL records on restore/unassign
   → ONLY set Status='Unassigned'

⚠️ ONLY delete GL when:
   → VS OFF (parent order loses VS flag)
   → Groupage OFF (parent order loses groupage flag)
   → Parent order is deleted entirely
```

---

## DIRECTION VALUES

### In Database
- NAT_ORDERS: `'North→South'` / `'South→North'` (arrow chars)
- CONS_LOADS: `'ΚΑΘΟΔΟΣ'` / `'ΑΝΟΔΟΣ'` (Greek) — DO NOT CHANGE (petras-assign uses this)
- NAT_LOADS: `'ΚΑΘΟΔΟΣ'` / `'ΑΝΟΔΟΣ'` (Greek)

### In UI
- ΚΑΘΟΔΟΣ = North→South (Veroia → Greece clients)
- ΑΝΟΔΟΣ = South→North (Greece suppliers → Veroia)

### In Code (config.js F constants)
```javascript
F.DIR_NS = 'North→South'    // for NAT_ORDERS
F.DIR_SN = 'South→North'    // for NAT_ORDERS
F.CL_KATHODOS = 'ΚΑΘΟΔΟΣ'   // for CONS_LOADS + NAT_LOADS
F.CL_ANODOS = 'ΑΝΟΔΟΣ'      // for CONS_LOADS + NAT_LOADS
```

---

## FIELD NAME TRAPS (DO NOT RENAME — handle in code)

```javascript
'Veroia Switch '    // trailing space — use F.VEROIA_SWITCH
' Week Number'      // leading space, formula, NOT writable — use F.WEEK_NUM
'Adress'            // single 'd' in PARTNERS — use F.ADDRESS
```

---

## IMPLEMENTATION PLAN

### Phase 1: NAT_LOADS integration (NEXT SESSION)
1. Add missing fields to NAT_LOADS table (Truck, Trailer, Driver, Partner, Partner Rate, Matched Load)
2. Rewrite VS sync in `orders_intl.js`: ORDERS → NAT_LOADS (skip NO for VS)
3. Rewrite `weekly_natl.js` to source from NAT_LOADS only
4. Fix date logic (VS dates as documented above)
5. Fix cleanup chains (VS OFF, GRP OFF, Delete)
6. Update Dashboard to read NAT_LOADS instead of NAT_ORDERS for national stats

### Phase 2: Testing
1. Purge all test data
2. Create 10 manual orders through UI (mix of all 5 scenarios)
3. Verify each scenario end-to-end
4. Verify cleanup chains (VS OFF, delete, restore)

### Phase 3: Cleanup
1. Remove dead NO-creation code for VS path
2. Update NAT_ORDERS CRUD to also write to NAT_LOADS (for direct national orders)
3. Update national_consolidation.html if needed (separate repo: petras-assign)

---

## IMPORTANT: DO NOT CHANGE
- petras-assign repo (national_consolidation.html) — uses Greek direction in CL
- Field names in Airtable (trailing/leading spaces)
- CL direction format (ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ)
- Pallet Exchange logic (unchanged)
