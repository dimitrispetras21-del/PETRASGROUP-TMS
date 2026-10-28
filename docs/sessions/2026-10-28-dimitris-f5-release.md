# 28/10 · National v5 F5 · stream (e) release

- **CI:** #118 runs the F5 tests on every PR. #133 extends them to every stream's F5 test (128): full-history checkout for the d2/d3 tests, which read older tips with `git show`.
- **Loaders and bumps:**
  - #126 loads `core/plan-config.js` before every module.
  - #133 bumps every file of #119/#124/#125/#128/#129, with one TIMESTAMP, plus `core/plan-config.js` (changed after #126), `core/rt-feed.js` (#60), `modules/wn5_handover.js` (#115), the label `piece_on_rt` (#127 folded in, closed) and `LOOKUPS_PENDING = false` (Worker deploy 1 c0ccdf77).
  - A content check leaves 0 files served with a stale `?v=`.
- **Proof:** in the real app, the 10 reader pages read PlanConfig 'before' under both the 404 Worker and deploy 1, with only `GET /plan/config` and 0 console errors. The d1/d2/d3 rigs fail the same on bare main: they inject their own PlanConfig, which the real file overwrites. Those are their files, reported to the coordinator.
- **Decided:** the owner skipped the pilot (#122 closed); the cutover moved to 28/10.
- **FE-2 (#131, merges at R-8):**
  - `WN_V5` goes 'off' → 'on'.
  - `MISS_TEXT` is gone: an absent Ε-26 key = a line in the error strip.
  - «Παλιά προβολή» only for weeks before L (Q-10, `modules/weekly_natl_v5.js`, PlanConfig); 'unknown' is said on the bar.
  - Remaining: R-8 live check by the owner (hard reload, week L = v5 without the button, previous week with it, 0 console errors).
