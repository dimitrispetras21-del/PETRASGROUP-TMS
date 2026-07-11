# Trip Costs / Margin Engine — Build Specification

_Canonical specification for the per-trip cost & margin module ("Trip Costs").
DB-agnostic: written so it can be built natively in the new Postgres/Supabase
schema during the Stage 2 migration, rather than built on Airtable and migrated
after. Hand this to the implementation team._

_Author: Claude. Date: 2026-06-11 (decisions locked 2026-06-12; NOTES open
questions resolved 2026-07-05 — see §10.1).
Status: **LOCKED — ready for implementation.** All owner decisions confirmed (§10)._

---

## 0. Why this exists (the business case)

Petras Group's profit lever is **`utilisation × margin-per-trip`, not volume**
(see the owner's strategy deck). Today the company scales **blind**: the gross
margin per international trip (~€1,700–2,700) is an *estimate before* fixed-cost
allocation and wear. Without a per-trip cost capture, "are we growing the
profit or just the volume?" is unanswerable.

This module captures the **per-trip variable costs** (the "ΔΡΟΜΟΛΟΓΙΟΥ" expense
group) and derives **net profit and margin % per trip, per lane, per truck, per
customer**. It is the #1 system investment in the business plan, and it is
explicitly **out of scope for the Valuedriven v2** foundation work — so it is
specified here to be folded into the new database build.

---

## 1. Current state (what already exists)

The Airtable table **`TRIP COSTS`** (`tblWUus6uSpqE1LMW`) is **already ~80%
built** — 63 fields including per-country tolls and margin formulas. The work is
**rationalisation + re-wiring**, not greenfield. Three problems to fix in the
rebuild:

| # | Problem | Action in rebuild |
|---|---------|-------------------|
| 1 | Links to the **legacy `TRIPS` table** (`tblgoyV26PBc6L9uE`), not the current `ORDERS`/`NATIONAL ORDERS`/`NAT_LOADS` model | Re-link to `ORDERS` + `NATIONAL ORDERS` |
| 2 | Cost fields display **`$`**, revenue displays **`€`** (cosmetic — same stored numbers, but misleading) | Unify everything to **€** |
| 3 | **Dual model**: a simple `Category`/`Amount` pair AND a detailed per-field model coexist | Drop the simple pair; keep the detailed model |

---

## 2. Granularity — the core model decision

The owner's answer was **"it depends"** — correctly, because it depends on who
carried the trip. The model resolves this with **one rule**:

> **One Trip Cost record = one truck's journey (a round-trip loop).**
> It links to the order(s) it carried (1 export + 1 matched import, or a solo leg).

| Case | How it's costed | Why |
|------|-----------------|-----|
| **Owned fleet, round trip** (export + matched import) | ONE record. Full cost detail (fuel, tolls, driver, etc.). Revenue = sum of both linked orders' Price. | Fuel/tolls/driver are **physically shared** across the loop and cannot be cleanly split per leg. |
| **Owned fleet, solo leg** (export with no return found) | ONE record linked to 1 order. Same cost detail. | Empty return leg is itself the cost signal (dead km). |
| **Partner-carried leg** | ONE record, `Trip Type = PARTNER`. Cost = the flat **Partner Rate** only (no fuel/toll detail — we don't see the partner's costs). Revenue = linked order's Price. | A partner is a flat-rate purchase per load; per-leg is the natural unit. |

So granularity is **per round-trip for owned**, **per leg for partner** — both
expressed as the same entity, distinguished by `Trip Type`. This matches the
existing table (which already has `Trip Type: OWNED FLEET / PARTNER` and separate
`Partner Rate Export / Import`).

**National legs are NOT separately costed (owner decision).** The Veroia-Switch
feeder legs (local trucks collecting suppliers → Veroia, or Veroia → Greek
client) are treated as **part of the parent international trip's economics** — a
single international round-trip is the cost unit, and the short local feeder cost
is folded into it (or into `other_expenses`), not tracked as its own record.
Consequently: **there is no standalone national/domestic trip-cost record in
v1**, and pure-domestic ("Independent") national orders are **not margin-tracked
in v1** (they have revenue via `Price` but no cost capture by design). This
removes the need for a national-specific cost grid.

---

## 3. Entity model

### 3.1 `trip_cost` (the main entity)

**Identity & links**
| Field | Type | Notes |
|-------|------|-------|
| `id` | auto PK | (Airtable: `Trip Cost ID` autoNumber) |
| `trip_type` | enum | `OWNED_FLEET` \| `PARTNER` |
| `export_order` | FK → ORDERS | nullable (solo-import trips) |
| `import_order` | FK → ORDERS | nullable (solo-export trips) |
| `truck` | FK → TRUCKS | nullable for partner |
| `driver` | FK → DRIVERS | nullable for partner |
| `partner` | FK → PARTNERS | required when `trip_type = PARTNER` |
| `trip_start_date` | date | |
| `trip_end_date` | date | |
| `week_number` | int | derived from trip_start_date (do NOT free-type) |

**Cost inputs (owned trips) — all € numeric, default 0**
Grouped by the business's 6th expense category ("ΔΡΟΜΟΛΟΓΙΟΥ" — per-trip variable):

| Field | Business category | Source |
|-------|-------------------|--------|
| `fuel_cost` | Καύσιμα | derived from fuel system (DADI/external/reefer) — see §5 |
| `tolls_total` | Διόδια | sum of per-country tolls (§3.2) |
| `dkv_cost` | DKV | **separate card** from DADI (confirmed) — own field, manual or DKV-card import |
| `driver_pay` | Μισθός/αμοιβή οδηγού | manual — driver wages for the trip |
| `accommodation` | Διαμονή | manual — lodging on the road |
| `driver_cash_expenses` | **Έξοδα Μ** | manual — **undocumented cash expenses drivers make on the road (no receipt)**. A real cost that reduces true margin, so it must be captured even though it has no paper trail. Keep visibility role-restricted (Owner/Accountant only). |
| `spedition_cost` | Spedition | manual **(NEW — gap)** |
| `adblue_cost` | AdBlue | manual **(NEW — gap)** |
| `ferry_train_cost` | Καράβια/Τρένα | manual **(NEW — gap in detailed model)** |
| `fines` | Πρόστιμα | manual |
| `tires_service` | (wear) | manual |
| `other_expenses` | Λοιπά | manual |

**Cost inputs (partner trips)**
| Field | Notes |
|-------|-------|
| `partner_rate_export` | € — what we pay the partner for the export leg |
| `partner_rate_import` | € — for the import leg |

**Fixed-cost allocation (optional, Tier 2)**
| `fixed_cost_allocation` | € | per-trip share of truck fixed costs (insurance, KTEO, financing). Leave 0 for v1; enable when fleet-fixed data exists. Note: business doc flags that gross margin today is *before* this — so this field is what turns "gross" into "true net". |

### 3.2 Per-country tolls (sub-fields of `tolls_total`)

Keep the existing 15-country breakdown (operationally useful for lane analysis):
`MK, RS, HU, AT, SK, CZ, BE, PL, HR, SL, DE, NL, IT, RO, BG` — each € numeric.
`tolls_total = SUM(all country tolls)`.

### 3.3 Fuel detail (sub-fields of `fuel_cost`)

Existing fields to keep: `fuel_truck1_liters`, `fuel_truck2_liters`,
`total_fuel_liters`, `external_fuel_liters`, `dadi_next_trip_liters`,
`total_km`. Fuel **cost** (€) is looked up from the fuel/refueling system
(DADI card + external + reefer) — see §5. `fuel_efficiency_km_per_liter =
total_km / total_fuel_liters`.

---

## 4. Revenue derivation (auto from Orders — owner's decision)

Revenue is **never re-typed**. It is derived from the linked orders' `Price`:

```
export_revenue = export_order.Price   (€, from ORDERS)
import_revenue = import_order.Price    (€, from ORDERS)
total_revenue  = export_revenue + import_revenue
```

- Revenue comes from the **international** export/import orders only. The
  Veroia-Switch national feeder legs carry **no separate revenue** (the customer
  pays one door-to-door price, already on the international order) — consistent
  with §2 (national legs are part of the international trip, not costed or
  revenued separately).
- In Postgres: a JOIN / generated column.
- **Implication:** the existing manual `Export Revenue` / `Import Revenue`
  currency fields become **computed**, not entry fields. This removes
  double-entry and keeps revenue consistent with what the dispatcher/accountant
  already entered on the order.

---

## 5. Fuel cost integration

Fuel is the largest variable cost and should not be hand-typed. The current
table already lookups `DADI Cost`, `External Cost`, `Reefer Cost` from a fuel
system. Preserve this:

```
fuel_cost = dadi_cost + external_cost + reefer_cost
```

Where DADI = the fuel-card system. The `Refueling Status` flag
(`✅ OK / 🔴 PROBLEM / ⏳ Pending Check`) reconciles card liters vs trip liters —
keep it as a data-quality guard.

---

## 6. Computed fields (formulas / generated columns)

| Field | Formula |
|-------|---------|
| `total_costs` | `fuel_cost + tolls_total + dkv_cost + driver_pay + accommodation + driver_cash_expenses + spedition_cost + adblue_cost + ferry_train_cost + fines + tires_service + other_expenses + partner_rate_export + partner_rate_import + fixed_cost_allocation` |
| `total_revenue` | see §4 |
| `net_profit` | `total_revenue − total_costs` |
| `profit_margin_pct` | `net_profit / total_revenue × 100` (guard div/0) |
| `cost_per_km` | `total_costs / total_km` |
| `revenue_per_km` | `total_revenue / total_km` |
| `fuel_per_km` | `fuel_cost / total_km` |
| `pnl_status` | `net_profit >= 0 ? 'PROFIT' : 'LOSS'` (drives red/green UI + loss alerts) |

All currency **€**. All formulas must guard division-by-zero (return null/0).

---

## 7. Mapping from the existing 63-field Airtable table

**Keep (re-typed to €):** Trip Cost ID, Trip Type, all 15 toll countries, Total
Tolls, fuel liter fields, Total KM, Driver Pay, Accommodation, Fines, Tires
Service, Other Expenses, Partner Rate Export/Import, all formula fields (Total
Costs, Net Profit, Profit Margin %, Cost per KM, Revenue per KM, Fuel
Efficiency, PNL Status), Truck/Driver/Week lookups, DADI/External/Reefer
liters+cost lookups, Refueling Status, Trip Start/End Date.

**Re-wire:** `Trip Link → TRIPS` becomes `export_order/import_order → ORDERS`
(international round-trip; no national-orders link — national isn't costed, §2).

**Convert to computed:** `Export Revenue`, `Import Revenue` → rollup/JOIN from
`Orders.Price` (§4).

**Add (business categories missing from detailed model):** `dkv_cost`
(separate card), `driver_cash_expenses` (Έξοδα Μ — undocumented), `spedition_cost`,
`adblue_cost`, `ferry_train_cost`, `fixed_cost_allocation` (present but 0 in v1).

**Drop:** the simple `Category` / `Amount` / first `Notes` triplet (legacy
alternate model); the standalone `Fuel Truck 1/2 Liters` if fuel is fully
system-sourced.

---

## 8. UI module spec (`trip_costs.js` / new-stack equivalent)

> **Page name (owner-confirmed 2026-07-05): "TRIP PnL"** — use this in all UI
> copy instead of "Trip Costs". Approved visual mockup:
> `docs/design/trip_pnl_mockup.html` (design spec:
> `docs/superpowers/specs/2026-07-05-trip-pnl-design.md`).

Split-view, consistent with the Orders pages:

- **KPI bar:** Total costs (period), Total revenue, **Net margin %**,
  **Loss-making trip count** (red), Avg cost/km, CSV export.
- **Filters:** date range, truck, driver, partner-vs-owned, lane (country pair),
  margin band (e.g. `<0%`, `0–10%`, `>10%`), customer.
- **List table:** Trip date · Truck/Partner · Lane · Revenue · Cost · **Margin %**
  (red/green) · PNL status.
- **Detail panel:** full cost breakdown (the 6 categories) + revenue from linked
  orders + computed margins.
- **Entry form:** link selector (pick export order + import order, or partner +
  leg) → cost fields → live-computed totals. Revenue auto-fills from the linked
  orders (read-only).
- **Loss alert:** trips with `pnl_status = LOSS` surface on the CEO Dashboard
  "top loss-making routes" panel (which is currently a placeholder).

**Roles:** entry = Accountant (Αλεξία) + Owner. Read = Owner + Management.
Dispatchers: none (cost data is sensitive — see audit security finding on
role enforcement).

---

## 9. Migration coordination notes (for the implementation team)

- Trip Costs is **operational data** linked to `ORDERS`/`NATIONAL ORDERS`, which
  Stage 2 moves to Postgres. **Build `trip_cost` as a native table in the new
  Postgres schema**, with FKs to the migrated `orders` table — do not build it
  on Airtable and migrate later.
- Revenue derivation (§4) becomes a **JOIN**, not a rollup — cleaner in Postgres.
- The audit-log requirement (Stage 2) should cover `trip_cost` mutations too
  (who entered/edited a cost, before/after) — cost data is financially
  sensitive.
- Enforce `trip_type = PARTNER ⟹ partner required` and
  `trip_type = OWNED_FLEET ⟹ truck required` as DB constraints.

---

## 10. Decisions locked (owner-confirmed 2026-06-12)

1. ✅ **"Έξοδα Μ"** = undocumented cash expenses drivers make on the road (no
   receipt). Modelled as its own field `driver_cash_expenses`, distinct from
   `driver_pay` (wages) and `accommodation` (lodging). Role-restricted.
2. ✅ **DKV** = a **separate card** from DADI → its own `dkv_cost` field.
3. ✅ **Fixed-cost allocation** = **out of v1** (field present, defaults 0).
   Turning it on later needs per-truck monthly fixed data (insurance, KTEO,
   financing) — Tier-2.
4. ✅ **National trips** = **not costed**. Treated as part of the parent
   international trip; pure-domestic orders are not margin-tracked in v1 (§2).
   ⚠️ **Superseded (TRIP_COSTS_NOTES.md §3):** national loads ARE costed — every
   national load becomes a national round trip in Weekly National, with the VS
   split modelled as internal transfer pricing (price − X / X).

### 10.1 Decisions locked (owner-confirmed 2026-07-05 — resolves NOTES §10)

1. ✅ **VS transfer price X** = a **standard fixed € amount** (single settings
   value, not per-km / not %-of-price; exact € set at build time).
2. ✅ **One `round_trips` table** with a `scope` field
   (`International` | `National`) — not two tables.
3. ✅ **AdBlue** = two sources: (a) bulk purchase invoice bought by the company
   (own stock), and (b) road top-ups paid with the **DKV card**, which arrive as
   DKV invoice lines → shape-A auto-allocation.
4. ✅ **Partner rates** = auto from the order's `Partner Rate` field (no re-typing).
5. ✅ **Driver pay** = **per-trip**, manual entry for v1 (not monthly salary).
6. ✅ **Consumption anomaly checks** = yes — GPS tracking (MyGeotab) will be
   connected and cross-checked against fuel/km data; thresholds defined at
   build time.
7. ✅ **km source** = manual now; MyGeotab GPS later.

8. ✅ **Spedition** (locked 2026-07-05, verified on a real invoice) = **very
   rare and small — deferred, define in the future**. Real May-2026 invoice
   from Trivium Szeged Kft. (HU customs agent): 3 customs clearances × €20 =
   €60/month, reverse charge, billed to VERMION FRESH. v1: keep the
   `spedition_cost` field, **manual entry** when it occurs — no allocation
   pipeline. Future-proofing note: the accompanying "Specifikáció" sheet DOES
   carry per-line detail (date + truck/trailer plates, e.g. `IAZ8302/P61335` +
   customs ref + amount), so shape-A auto-allocation is possible later if
   volume ever grows.

9. ✅ **Accommodation (Διαμονή)** (locked 2026-07-05) = **very rare** —
   `accommodation` field stays, **manual entry** when it occurs; no pipeline.
10. ✅ **Exact € value of X** (VS transfer price) = **deferred to build time** —
    the mechanism is locked (standard fixed €, single settings value, item 1);
    only the number is set later.

### Still open
- **VAT recovery** — the business doc notes an unmodelled VAT-refund benefit on
  some expenses. Out of scope for margin v1; flag for a future finance view.

**→ With that, every modelling decision is locked. The spec is complete and
ready to hand to the implementation team (Stage-2 Postgres build).**

### 10.2 Decisions locked (owner-confirmed 2026-07-11 — pre-mortem review)

_Context: the Valuedriven "Petras TMS v2" proposal (26/05/2026) is now the
confirmed build direction. Answers below respond to
`PreMortem-COSTS-2026-07-11.md`._

1. ✅ **Build platform & sequencing (Valuedriven proposal):** Node.js API proxy
   + Supabase PostgreSQL for operational tables (ORDERS, NATIONAL ORDERS,
   GROUPAGE LINES, CONSOLIDATED LOADS, Audit Log). **Reference tables (CLIENTS,
   PARTNERS, DRIVERS, TRUCKS, LOCATIONS) remain in Airtable.** The Costs &
   invoicing module is **explicitly out of v2 scope — Phase 2 or later**, built
   on the new foundation after cutover. GPS (MyGeotab) also Phase 2+.
   ⚠️ Build note: the allocation engine keys on truck plates, which live in the
   Airtable **reference** DB — plate lookups must go through the API layer.
2. ✅ **Trip PnL record creation (lifecycle trigger):** order entered → placed →
   drivers assigned → once the **full round trip exists (import + export)**, a
   Trip PnL log is **auto-created**. Any later change to orders or assignments
   **must propagate automatically** to the Trip PnL record (this is the
   sync-surface requirement both audits flagged — now an explicit owner
   requirement, resolves pre-mortem T1 creation half).
3. ✅ **Trip closure:** no manual process defined/desired. Direction: **MyGeotab
   geofence** — an HQ zone is already configured; the truck entering the zone
   closes the trip. Since GPS is Phase 2+, an **interim manual close** (by
   dispatcher) is required until then (resolves T1 closure half + T2 actual
   end-date, when GPS lands).
4. ✅ **Cost-entry owner:** ALL expense entry is done by **Αλεξία** — DKV 15-day
   invoice via document upload + OCR recognition; everything else manual typed
   amounts (confirms §11.6 with a single named owner; T3 process cadence still
   to be defined with her).
5. ✅ **VAT / amount rule (resolves T5):** TMS amounts are **net (ex-VAT)** by
   convention. If an uploaded invoice carries VAT, the system books the **full
   VAT-inclusive amount as cost** — worst-case principle: recovery is never
   assumed ("από τη στιγμή που το πληρώνουμε, δεν είμαστε σίγουροι ότι θα το
   εισπράξουμε πίσω"). VAT recovery stays a future finance view.
6. ✅ **VS transfer price X — exact values (supersedes §10.1 item 1 "single
   value"):** TWO settings values. **Import leg (Veroia → southern Greece) =
   €650. Export leg = €850.** The amount is deducted from the international
   order's total price: the international trip shows price − X; the national
   round trip's revenue = X.
7. ✅ **National leg / partner reconciliation:** the national leg is computed at
   the leg's **agreed price**; **Ειρήνη** then verifies that the agreed amount
   matches the partner's invoice (reconciliation step). PnL is computed on
   agreed price, not on the invoice.

8. ✅ **Historical cut-over (Q6):** **clean start** — PnL only for trips from
   go-live day onward. No backfill, no retroactive cost entry; trends build
   forward from day one.
9. ✅ **COSTS menu IA, v1 (Q9):** one parent category **COSTS** with four pages:
   **TRIP PnL** (per-trip profitability, natl + intl) · **Καταχώρηση Κόστους**
   (Αλεξία's capture page: OCR upload + manual) · **Partner PnL** (agreed price
   + Ειρήνη reconciliation) · **Κατανάλωση** (consumption/anomalies, feeds from
   the shared fuel ledger). Fleet-maintenance costs: recommendation on the
   table — reuse the existing Maintenance module (service records already carry
   Cost/Odometer/Invoice per vehicle) and add a **bridge** (12-month maintenance
   € ÷ km → calibrated per-km wear rate for Shape D, and later Tier-2 fixed
   allocation) instead of a fifth capture page — locked as item 10.
10. ✅ **Fleet-maintenance bridge (locked 2026-07-11):** NO fifth COSTS page.
    The existing Maintenance module is the capture point (service records
    already carry Cost / Odometer km / Invoice Number per vehicle). Build the
    bridge instead: **calibrated per-km wear rate** = Σ(maintenance costs,
    trailing 12 months) ÷ Σ(km, same period), per truck (fleet average as
    fallback for new/low-data trucks) → feeds Shape D (tires/wear) in Trip PnL
    instead of a hand-set settings value; later the same data feeds Tier-2
    `fixed_cost_allocation` (insurance/KTEO expiries already tracked there).

11. ✅ **Roles — final results are OWNER-ONLY (locked 2026-07-11; supersedes
    §8 "Roles"):** the computed PnL outputs (net profit, margins, TRIP PnL /
    Partner PnL analytics pages, CEO-dashboard loss panels) are visible to
    the **Owner only**. Αλεξία keeps cost-ENTRY access (Καταχώρηση Κόστους —
    inputs, not results); Ειρήνη keeps the agreed-vs-invoice reconciliation
    view (amount matching, no margins); Management/dispatchers see nothing.
    Enforce at the database layer (RLS), not just in the UI (pre-mortem T8).

**→ All pre-mortem issues resolved. Spec fully locked as of 2026-07-11;
remaining opens are process-only (Αλεξία's weekly capture ritual, mockup
walkthrough with her before build).**

---

## 11. Data sourcing & cost allocation (the core of the infrastructure)

Fuel + tolls (DKV + DADI) is the **single largest cost** in the business. This
section is verified against **real invoices** (a DKV 15-day ZIP and DADI
Bulgarian PDFs), not assumed. The decisive finding shapes the whole build:

> **Both DKV and DADI invoices carry per-vehicle + per-date line detail.**
> So each cost line can be allocated to the **exact trip** — no ratio-splitting.

### 11.1 The four sourcing shapes

| Shape | Sources | Categories | Mechanism |
|-------|---------|------------|-----------|
| **A. Periodic consolidated, per vehicle+date** | DKV (15-day), DADI (≈weekly) | fuel, tolls, DKV, adblue? | **Allocate by plate+date** (§11.2) |
| **B. Standalone per-invoice** | individual | external fuel, reefer fuel, ferry/train, fines, some tolls, spedition | attach to a specific trip |
| **C. Manual per-trip** | Accountant (Αλεξία) | driver pay?, Έξοδα Μ | typed on the trip |
| **D. Per-km rate** | computed | tires/service (a ΣΥΝΤΗΡΗΣ cost pulled into margin) | rate × trip km |

### 11.2 The allocation rule (Shape A — the engine)

Every DKV/DADI line item exposes: **vehicle plate · date · amount** (+ km
reading + driver). Allocation is deterministic, not estimated:

```
for each invoice line L:
    find trip T where  T.truck.plate == L.plate
                  AND  T.trip_start_date ≤ L.date ≤ T.trip_end_date
    add L.amount to T.<cost field for L's category>
```

- **No splitting by ratio** — each refuel / toll passage lands on the trip the
  truck was actually running.
- **Edge cases to handle:** line date on an idle day (no trip) → "unallocated"
  bucket for review; two trips same plate same day → tie-break by time or assign
  to the trip whose window the timestamp falls in; plate not matched → review
  queue. Build an **"unallocated costs" review list** — never silently drop.
- The **km reading** on each line additionally reconciles trip distance (and
  feeds `total_km`, hence cost/km & fuel-efficiency).

### 11.3 Per-source specifics

**DKV** — billed to **VERMION FRESH S.A.** (customer `4100137826`), 15-day cycle:
- Combined **tolls** ("E-List of passages", per country: plate `KFZ-KZ` + date +
  motorway + amount) **and fuel** ("E-Statement of account": plate + date +
  station + liters + km + amount).
- Per-country files (AT/BG/CZ/DE/GR/HR/HU/IT/RO/RS/SI/SK) → feed the 15-country
  toll grid. Multi-currency (CZK/HUF/RON/RSD) converted to EUR; VAT reverse-charge
  + refund lines present.
- **Machine-readable PDFs** → parse programmatically (highest ROI given it's the
  biggest cost and structured).

**DADI** — billed to **EUROFRESH EOOD** (Bulgarian), fuel:
- Each receipt = plate + date + driver + km reading + amount.
- **Scanned images (no text layer) → needs OCR.** Route through the **existing
  TMS AI scan pipeline** (`core/scan-helpers.js` / Νάκης) — this is exactly the
  document-extraction capability already built. Bulgarian-language model prompt.

### 11.4 Two legal entities, same trucks

DKV → VERMION FRESH, DADI → EUROFRESH; both fuel the **same fleet**. Allocation
keys on the **truck plate**, independent of billing entity. Store
`source_entity` (VERMION FRESH / EUROFRESH) + `source_invoice_no` on every cost
line for accounting reconciliation and the multi-entity VAT view.

### 11.5 Plate matching

Invoice plates (Greek `IAB1096`, `IAB2103`, `IAZ4445`; Bulgarian `OB-####`,
`CB-#### PE`) must map to `TRUCKS.License Plate`. Build a **plate alias /
normalization table** (Greek vs Bulgarian formats, spacing, OCR variants) — the
allocation engine depends on clean plate matching.

### 11.6 Ingestion approach (recommended)

| Source | Recommended ingestion |
|--------|----------------------|
| DKV | **Automated parse** of the PDF package → line items → allocation engine. Biggest cost, structured data, highest ROI. |
| DADI | **AI-OCR** via existing scan pipeline (Bulgarian); fallback manual entry of per-vehicle totals. |
| Standalone (external/reefer fuel, ferry, fines) | Attach to trip — light scan or manual. |
| Driver pay, Έξοδα Μ | Manual per-trip. |
| Tires/service | Per-km rate × trip km (set the €/km rate in settings). |

### 11.7 Still open (owner input)

- **Driver pay** — per-trip amount (bonus/πριμ) or monthly salary? (If salary →
  belongs in ΠΑΓΕΙΑ ΕΤΑΙΡΕΙΑΣ, not per-trip.)
- **Sources** for: accommodation (#8), AdBlue (#11), Other (#15), partner rates
  (#16-17 — from order `Partner Rate` auto, or separate?).
- **Spedition "καρτέλα"** — running account with a forwarding agent, settled
  periodically? (If so, it's Shape A/B hybrid.)

---

_This spec supersedes the earlier `session_22_trip_costs_handoff` proposal,
which predated reading the real 63-field schema and assumed a near-empty table.
Section 10 decisions confirmed with the owner on 2026-06-12._
