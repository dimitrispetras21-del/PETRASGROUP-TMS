# TRIP PnL — Page Design (mockup spec)

_Approved by owner 2026-07-05. Companion to `docs/TRIP_COSTS_SPEC.md` (§8 UI
spec). "TRIP PnL" is the confirmed page name, replacing "Trip Costs" in all
UI copy. This document specifies the **HTML design mockup**, which serves as
the visual specification handed to the Stage-2 Postgres implementation team._

## Deliverable

One self-contained file: `docs/design/trip_pnl_mockup.html`.

- No dependencies beyond Google Fonts (Syne + DM Sans). Opens by double-click.
- Inline CSS replicating the TMS design system: accent `#0284C7` (hover
  `#0369A1`), navy `#0B1929`, bg `#F4F6F9`, loss red `#7F1D1D`, owned-fleet
  navy `#0C2D5C`, partner dark green.
- Vanilla JS + hardcoded fake dataset. Greek UI labels, English code comments.
- Not linked from app.html; it is a design artifact, not a production module.

## Shell

Header: page title **TRIP PnL**, two tabs — **Κερδοφορία** (Mode A, default)
and **Καταχώρηση Κόστους** (Mode B) — plus a period filter (Εβδομάδα / Μήνας /
Custom) top-right.

## Mode A — Κερδοφορία

1. **KPI band**, 6 cards: Έσοδα περιόδου · Κόστη περιόδου · Καθαρό Margin % ·
   Ζημιογόνα trips (red) · Μέσο €/km · Cost-complete %.
2. **Toolbar**: Group-by selector — Δρομολόγια (default) / Φορτηγό / Πελάτης /
   Lane, all four functional against the fake data. Remaining lenses from
   NOTES §8 (driver, week, owned-vs-partner, direction, brand) appear as
   disabled options marked "(v2)".
3. **Round-trips list**, sorted worst-margin-first: dates · truck or partner ·
   lane (e.g. GR→DE) · revenue · cost · **margin % pill** (red <0%, amber
   0–10%, green >10%) · badge Προσωρινό/Πλήρες (cost-completeness).
4. **Drill-down panel** (slide-in on row click): cost breakdown by category
   (Καύσιμα, Διόδια, DKV, Οδηγός, Έξοδα Μ, AdBlue, Ferry/Train, Πρόστιμα,
   Λοιπά), revenue lines from the linked orders (read-only), and the list of
   **allocated invoice lines** (freight-bill audit trail).

## Mode B — Καταχώρηση Κόστους

Three-step visual flow (stepper): **1 Scan/Upload → 2 Preview & έγκριση →
3 Auto-allocate**.

- Step 2 shows parsed invoice lines (plate · date · category · €) with a
  confirm action — mirrors the verify-before-commit rule (NOTES §6).
- **Reconciliation bar**: Σ allocated + Σ unallocated == invoice total, with
  ✓/✗ state.
- **Unallocated review bucket**: lines that matched no trip window, awaiting
  manual assignment — never silently dropped.

## Fake dataset

~12 realistic round trips: real-looking plates (IAZ8302, IAB1096, IAB2103…),
lanes GR→DE/NL/IT/AT, 2–3 partner trips (flat partner rate, no cost detail),
2 loss-making, 1–2 provisional (incomplete costs), one solo leg (import €0).
Every UI state must be visible in the default view.

## Out of scope

Real Airtable/API calls, auth/roles, routing integration, responsiveness
below tablet width (desktop-first artifact), the remaining v2 lenses.

## Acceptance

Owner reviews rendered mockup (screenshots + local open) and approves; the
file plus this spec are then part of the implementation-team handoff package.
