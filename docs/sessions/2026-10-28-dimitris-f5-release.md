# 28/10 · National v5 F5 · stream (e) release

- **CI (PR #118):** new job `f5-tests` in `code-guards.yml` runs `tests/plan-config.test.mjs` on every PR. A mutation (`unknown` → `before`) gives 7 fail. Each stream's F5 test gets one line here as its PR lands.
- **Pilot (`feat/f5-wn5-pilot`):**
  - `FEATURES.WN_V5 = 'pilot'`, `WN_V5_USERS = ['dimitris']`, bump `config.js` + `SW_VERSION`.
  - Proof: `tests/wn5-flag.test.js` (2 new tests, 2 fail on main) and rig `tests/critics/wn5-pilot-rig.js` (owner → v5 with only GET /plan/*; owner with «Παλιά προβολή», demo_owner, dispatcher and accountant → the old board with 0 /plan/*; 0 console errors; on main 3 ✗). Identity and board rigs stay GO.
  - Merge Thu 29/10 after 15:00 (plan §9).
- **Decided:** as with WI_V2, under 'pilot' a browser that opens `?wn5=1` also gets the board. Writes stay 409 `writes_closed` in the Worker until day L. The PR says so; the owner can ask for a strict owner-only rule.
- **Remaining:**
  - `LOOKUPS_PENDING = false` after (b)'s Worker sync PR is on main (`tests/wn5-plan-ids.test.mjs` ties it to `worker/src`);
  - loader for `core/plan-config.js` together with its first caller;
  - label `piece_on_rt` (from 074a);
  - a bump PR after each F5 front-end merge;
  - FE-2 ready Friday 12:00.
