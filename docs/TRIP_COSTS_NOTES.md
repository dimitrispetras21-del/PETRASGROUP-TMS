# Trip Costs / Expenses Page — Working Brainstorm Notes

_Captured 2026-06-12. These are evolving design notes from a brainstorm, NOT the
locked spec. They **extend and partly supersede** `TRIP_COSTS_SPEC.md` (noted
inline). Fold into the spec once the open questions ❓ are locked._

Legend: ✓ decided · ❓ open · ⚠️ watch-out

---

## 1. Core architecture — the Round Trip is the spine

✓ The unit of everything is the **Round Trip** (a truck's loop), made a
**first-class entity**. It replaces the legacy `TRIPS` table and the
`Matched Import ID` text field.

✓ Round Trips are **born in the weekly planners** — that's where they're really
created:
- **Weekly International** → international round trips (export + matched import)
- **Weekly National** → national round trips (ΚΑΘΟΔΟΣ + ΑΝΟΔΟΣ matching).
  **Weekly National is the single source of truth for national.**

✓ **Trip Costs hangs off the Round Trip** and pulls trip data from it (truck,
legs, dates, revenue). Costs do NOT re-derive the pairing.

🔑 **The lock between planning and costing:** a Round Trip carries
**(truck + date window)** — which is exactly the key the cost-allocation engine
needs to match invoice lines (plate + date) to a trip. A truck does >1 trip/week,
so the date windows are what separate which refuel/toll belongs to which trip.

❓ **One table vs two** — leaning **ONE** `round_trips` table with a `scope`
field (`International` | `National`); legs link to ORDERS (intl) or NAT_LOADS
(natl). Rationale: Trip Costs hangs off one thing; vehicle/driver stats unify
across intl+natl; the allocation engine works identically. Confirm.

⚠️ More sync surface (round trip ↔ order re-assignments) = the #1 fragility per
both audits. Must stay in sync when matches change.

---

## 2. Round Trip — what it records

- ID, Week, Status (planned / in progress / completed)
- `scope`: International | National
- Resource: Truck + Driver + Trailer **or** Partner; `trip_type`: OWNED | PARTNER
- **Leg 1 (Export)**: link to order(s) — multiple if groupage
- **Leg 2 (Import)**: link to order(s) — empty/€0 if solo
- **Date window**: start (export loading) → end (import delivery)  ← allocation key
- Derived: revenue (Σ legs' Price), lane, km

---

## 3. Round Trip edge cases (resolved ✓)

1. ✓ **Solo leg** (export, no return) → leg 2 revenue = **€0**. The empty return
   shows as cost over zero revenue → dead km "hurts" the margin correctly.
2. ✓ **Two different partners** on the two legs → **2 separate records**.
3. ✓ **Groupage** → one leg, multiple orders; revenue sums them.
   ⚠️ Needs **Weekly Plan UX**: a way to **compress multiple orders into one
   cell/leg** (a "merge orders → one leg" action). New WP requirement.
4. ✓ **VS split** (international leg crosses-docks at Veroia):
   - International price is **reduced by a standard amount X**.
   - **2 round trips** created: 1 international (in Weekly Intl, revenue = price − X)
     + 1 national (in Weekly Natl, revenue = X), generated from the existing
     `NAT_LOADS` Source=VS record.
   - Net revenue conserved, just split → **internal transfer pricing**. Makes the
     international AND the national/local truck each show a fair margin.
5. ✓ **Re-match** → round trip + its allocated costs follow the change.

**⚠️ Supersedes spec §2/§10:** the earlier "national legs are NOT costed" is
**replaced**. Now **all** national loads (VS, direct, groupage) → national round
trips in Weekly National → they **are** costed/margin-tracked.

---

## 4. Cost categories + data sourcing

Scope = the **ΔΡΟΜΟΛΟΓΙΟΥ** expense group (8 items) + tires (from maintenance,
per-km) + driver/partner. Sourcing per category:

| Category | Source | Type |
|----------|--------|------|
| Καύσιμα **DADI** | weekly consolidated invoice → **scan → auto-allocate** per truck/chamber | A |
| **DKV** (tolls + card) | 15-day consolidated invoice → **scan → auto-allocate** | A |
| Λοιπά καύσιμα & διόδια | manual (Αλεξία) | C |
| **Έξοδα Μ** | manual; undocumented cash, no receipt; role-restricted | C |
| Driver pay | manual, per-trip | C |
| Λοιπά (other) | manual | C |
| **Spedition** | monthly consolidated, **2 companies** | A |
| Φθορά / tires | **per-km × standard €/km rate** (set in settings) | D |
| Ferry/Train, Fines, External/Reefer fuel | standalone invoices → attach to trip | B |
| Partner rate | ❓ from order's `Partner Rate` (auto)? | — |
| AdBlue (#11), Accommodation (#8) | ❓ not yet answered | — |
| **Revenue** | ✓ auto from `Orders.Price` | — |

---

## 5. The 4 cost "shapes" + the allocation engine

The central infrastructure insight — costs arrive in 4 different shapes:

- **A — Consolidated periodic, per truck/chamber** (DADI weekly · DKV 15-day ·
  Spedition monthly) → **must be allocated** to round trips by (plate + date window).
- **B — Standalone per-invoice** → attach to a specific trip.
- **C — Manual per-trip entry** (driver pay, Έξοδα Μ, other).
- **D — Per-km allocation** (tires, standard rate).

❓ For shape A: does the invoice carry **dated refuel/toll lines** (match each to
the trip whose window contains the date) or just a **truck total** for the period
(split by km / days)? Determines the allocation algorithm.

---

## 6. Three safety points (must-have)

1. ✓ **Verify before commit** — DADI is scanned Bulgarian with poor OCR (DKV is
   clean/machine-readable). Flow: scan → **preview → user confirms** → allocate.
   (Ties to the lesson: we reverted FAST scan because accuracy > speed.)
2. ✓ **Reconciliation guard** — `Σ(allocated) + Σ(unallocated) == invoice total`.
   Catches missed lines on the biggest cost.
3. ✓ **Provisional vs Complete margin** — a trip isn't complete until all periodic
   invoices that touch it arrive. Show a "costs complete?" badge; margin is
   provisional until then.
- ✓ Allocation needs the round trip to **exist first**; anything unmatched →
  **unallocated review bucket**.

---

## 7. Page format — two modes

✓ Consistent with the existing split-view + dark-card patterns.

- **Mode A — "Κερδοφορία" (margin):** KPI band (margin %, revenue, cost,
  loss-making count, €/km, cost-complete %) + round-trips list (**sort
  worst-first**, margin pills red/amber/green, provisional/complete badge) +
  drill-down (cost breakdown by category + revenue from orders + **which invoice
  lines were allocated** = freight-bill audit).
- **Mode B — "Καταχώρηση κόστους" (cost capture):** invoice scan → preview/verify
  → reconcile → auto-allocate, with the unallocated review bucket.

(Mockup of Mode A produced in chat 2026-06-12.)

---

## 8. Analytics lenses — one dataset, a "Group by" selector

✓ Not separate pages — **one margin dataset, pivot by**:

- **Vehicle / Driver** (financial: margin per truck) — owner's view #1
- **Week** (trend) + random-sample **audit/spot-check** — owner's view #2
- **Customer** — addresses the #1 risk (top-5 = 40–50%): are the big clients
  actually profitable?
- **Lane / route** — pricing + "top loss-making routes" (already a CEO-dashboard
  placeholder)
- **Owned vs Partner** (same lane) — make-vs-buy decision for 3-5x scaling
- **Direction** (export vs import) — backhaul contribution
- **Brand / entity** (Petras vs DPS; VERMION vs EUROFRESH)
- **Cost-anomaly** (filter) — €/km outliers → theft / inefficiency / mis-allocation

---

## 9. Fuel — "capture once, consume twice"

✓ Fuel is special: one capture, two consumers.

```
DADI/DKV scan → FUEL LEDGER (raw: truck·date·liters·cost·chamber) ← single source
                      │
        ┌─────────────┴─────────────┐
   Trip Costs                  Consumption / Fleet
   (allocated → cost → margin)  (L/100km, efficiency, anomalies)
```

- ✓ Half exists already: TRIP_COSTS lookups `DADI/External/Reefer Liters & Cost`
  from a `FUEL RECEIPTS` table → fuel data is already separate from costing.
- ✓ **Two by-vehicle lenses**: financial (margin/truck, audience Owner) vs
  operational (consumption/truck, audience **Maintenance/Θοδωρής** + fraud
  detection). Different purpose → a dedicated **Consumption page** is worth it,
  as a consumer of the shared fuel ledger (not instead of costs).
- ⚠️ Consumption = liters / **km**. km is manual now (`Total KM`) → only as
  reliable as the entry. **GPS (MyGeotab, on the roadmap)** would make it
  automatic/accurate → "unlocks later".
- ✓ Principle: separate **Capture pages** (scan → ledger) from **Analytics
  pages** (margin, consumption). The DADI/DKV scan is the shared entry point.

---

## 10. Open questions — RESOLVED 2026-07-05 (owner answers; folded into SPEC §10.1)

1. ✓ **Standard amount X** (VS transfer price): **standard fixed € amount**,
   single settings value (exact € set at build time).
2. ✓ **One `round_trips` table** with `scope` field — confirmed ONE.
3. ✓ **Spedition monthly invoice**: verified on real invoice (Trivium Szeged
   Kft., May 2026 — 3 × €20 customs clearances). Very rare/small → **deferred**;
   manual entry in v1. The Specifikáció sheet has per-line plate+date detail,
   so auto-allocation is possible later. (SPEC §10.1 item 8.)
4. ✓ **AdBlue**: two sources — bulk purchase invoice by the company (own stock)
   + road top-ups paid with the DKV card (→ DKV lines, shape-A auto-allocate).
   ❓ **Accommodation (#8)** sourcing still open (manual per-trip assumed).
5. ✓ **Partner rates** — auto from order's `Partner Rate`.
6. ✓ **DADI/DKV invoice granularity** — dated per-vehicle lines (verified on
   real invoices, SPEC §11) → deterministic per-trip allocation.
7. ✓ **Consumption anomaly checks** — yes; GPS tracking (MyGeotab) will be
   connected and cross-checked against fuel/km data. Thresholds at build time.
8. ✓ **km source** — manual now; MyGeotab GPS later.

Bonus (from SPEC §11.7): ✓ **Driver pay** = per-trip, manual entry for v1.

---

## 11. Build / coordination notes

- ✓ **Spec-only from us**; build native in Valuedriven's Stage-2 Postgres
  migration (no Airtable-then-migrate double work).
- ✓ Round Trip = **new first-class table in Postgres**; retire legacy `TRIPS` +
  `Matched Import ID`.
- ⚠️ Watch the sync surface (round trip ↔ order re-assignments).
- 📌 These notes **evolve `TRIP_COSTS_SPEC.md`** (esp. §2/§10 national costing,
  and add the Round Trip entity). Fold in when the ❓ above are locked.
