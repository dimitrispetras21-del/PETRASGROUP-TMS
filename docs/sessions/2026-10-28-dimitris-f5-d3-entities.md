# 2026-10-28 · dimitris · National v5 F5, stream (d3): Ε12 + Ε13 readers (master data, Locations)

- **Changed:** `core/entity.js` + `modules/locations.js`, dormant until day L (PlanConfig `before` = no v5 call, byte-identical to `origin/main`).
  - **Partner card «Αναθέσεις»:** + the partner's v5 cycles (one «NAT» row each, rate = sum of its segment rates).
  - **Driver/truck/trailer card:** + cycles joined by a handover (072b segments). A v5 cycle reads «ολοκληρωμένο» from `ended`, not «προγραμματισμένο» for ever.
  - **Location card:** + v5 stops and national shipments still to assign. The ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ filter includes v5-only places.
  - `locations_map.js` unchanged: it opens the same card.
- **Read:** one new Worker read, `GET /plan/activity` (`partner_id|driver_id|truck_id|trailer_id|location_id = N`, `location_id = all`). It was asked of (b)/(a1) for deploy 1 through the coordinator on 28/10. Contract in the PR body. Ids go through `PlanIds` (`/plan/lookups`), never by name (locations are Latin-only).
- **Decided:** the client card needs nothing: a v5 national order already carries client, places and price, so (d3) does not use d1's `/plan/nat-state`.
  - `_renderPartnersStatsStrip`, `_renderClientsStatsStrip`, `_loadEntityHistory`, `_renderClientOrders` and `_renderPartnerAssignments` are dead code: all six screens are v2, and no config has `history:`. They are not changed and not deleted here (principle 8 → separate PR).
- **Proof:**
  - `tests/f5-d3-entities-v5.test.mjs`: 19/19. NO-GO on `origin/main`: 12 v5 cases red.
  - `tests/critics/f5-d3-entities-rig.js`: 42/42, 0 app console errors, flag-off text equal to the tip. NO-GO on the tip: 15 ✗.
  - Full suite: 960/961. The one red is F4α-T29 (bump), which is stream (e)'s by plan §10.
- **Left:**
  - (b)/(a1) must ship `/plan/activity` in deploy 1; without it the readers say «δεν διαβάστηκαν» after L.
  - (e) bumps `?v=` / `SW_VERSION` after merge.
  - Live check after deploy 1: `/plan/activity` answers empty and the cards are unchanged.

## Follow-up 28/10 (branch `fix/f5-d3-checks`, after #128 merged)
- **Two stale checks fixed (stream (e) found them):**
  - the unit test compared with `origin/main`, which is the file itself after the merge; it now uses the pinned `5f55a943`, as d2 does;
  - the rig set `window.PlanConfig`, which the real `core/plan-config.js` (loaded since #126) overwrote; it now answers `GET /plan/config` and adds section G (`/plan/config` fails → `unknown` → v5 still read).
- **Proof:**
  - unit 24/24; NO-GO on `5f55a943`: 13 ✗;
  - rig 52/52 on the branch and 52/52 on the LIVE Pages front end; NO-GO on `5f55a943`: 19 ✗;
  - the executed 074a `plan_activity` has the same shape as the readers.
- **Not provable from here:** that the live Worker serves `/plan/activity` (`/plan/*` answers 401 before routing, even for an unknown path), and real-data counts. Both need the owner's session.
