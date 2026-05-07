# Changelog — Annotated

The last ~50 commits with the "why", grouped by theme. Use this to
understand recent direction. For exhaustive log, see `git log --oneline`.

---

## Active development phases (last 6 weeks)

### Phase A — Crash test + audit fixes
After a multi-week build period, we ran a comprehensive audit + live
"crash test" simulation. Found ~25 real bugs.

| Commit | Topic |
|---|---|
| `a8871aa` | 11 crash-test bugs (H4-H7, M8-M11) |
| `7d7a3df` | 10 static-audit bugs (A1-A2 critical, B1-B6 high, C2-C3 medium) |
| `1fc462c` | 8 confirmed bugs from parallel simulation |
| `85255a4` | Phase 1+2 — 14 critical/high bug fixes |

### Phase B — Pre-launch hardening
A/B/C/D/E "chunks" addressing API timeouts, security, ramp board,
dashboard, Sentry stub.

| Commit | Topic |
|---|---|
| `64d11d3` | Pre-launch hardening (API timeouts, role escalation guard, Sentry SDK) |
| `935d2b5` | Browser verification follow-ups (overdue count subtitle, etc.) |
| `666b263` | Playwright + cleanup |

### Phase C — Mobile + visual consistency
Mobile audit found bottom-bar nav was hiding 27/31 items. Visual audit
found design drift across pages.

| Commit | Topic |
|---|---|
| `f420aea` | Mobile optimization for planning section (off-canvas drawer) |
| `a78a356` | Visual consistency v3 (unified design tokens, dark navy cards) |

### Phase D — Production polish
Search/filter, CSV exports, PDF print, period filter on Performance.

| Commit | Topic |
|---|---|
| `7a8c245` | Production polish — search/filter + CSV exports |
| `2afc1bd` | Period filter (Performance dashboard) + PDF print |
| `a430abd` | Performance 422 fix + .gitignore for `.claude/` internal state |

### Phase E — Scan v2/v3 (the AI document parser)
Started simple, layered on preprocessing → tools → fast mode → revert.

| Commit | Topic |
|---|---|
| `4fa095c` | Scan v2: preprocessing, retry, doc-type, mobile camera, PDF preview |
| `bf8d189` | Tiered model selection (Opus for complex, Sonnet for simple) |
| `688c209` | Phase 2+3+4: fuzzy match, ref-injection, active learning, tool use |
| `f668f5e` | JSON parse robustness + rate-limit defence (prompt caching) |
| `9910c72` | Prefill all stops from scan in Open Form flow |
| `74d36f9` | Extract Reference / Transport number from documents |
| `0cefbdc` | **FAST mode** (single-call, no tools) — 4–8s but bad matches |
| `6fdef33` | **Reverted FAST mode** to tool-use (kept duplicate detection) |
| `5d9e9ed` | Parallel tools + tool result cache + progress messages + Notes field |

### Phase F — Νάκης AI assistant
| Commit | Topic |
|---|---|
| `8ff3819` | Agentic Νάκης + smart notifications (Tier 1+2+3): action chips, citations, multimodal upload, push, grouping |
| `a7c68e2` | Νάκης hardening: localized errors, retry, profile-key fix, tier, abort, reset confirm |

### Phase G — Recent fixes (today)
| Commit | Topic |
|---|---|
| `d6e0765` | False-positive Status validator + auto-purge stale errors |
| `d198ac4` | Add Cancel + Delete to International + Cancel to National |
| `6a6078c` | Cascade delete: removed `fields:['Name']` (table doesn't have it) + `cleanupOrphanGL` |
| `3f7b8b5` | PARTNER_ASSIGN orphan cascade + full-base `cleanupOrphans()` |

---

## Recurring fix patterns

### Field-naming traps (5+ commits)
- `Veroia Switch` no trailing space
- `Adress` (single 'd') in PARTNERS+CLIENTS
- `Week Number` is a formula field, not writable
- `Loading Points` / `Delivery Points` removed from fields[] in Performance (didn't exist)
- `Name` removed from cascade fields[] in delete (NAT_LOADS / RAMP / CONS_LOADS don't have Name)

If something throws `422 Unknown field name`, check this list first.

### Silent failures (multiple commits)
The codebase had a bad habit of swallowing errors silently with
`.catch(() => {})`. Static audit caught most. Pattern is now:
```js
.catch(e => { console.warn('[ctx] failed:', e.message); /* fallback */ })
```

### Race conditions (Daily Ramp)
The 2-minute auto-refresh used to wipe in-flight edits. Fixed with:
- Skip refresh if any input/select is focused (commit prior to f420aea)
- Edit cooldown flag — 10s grace after any mutation (commit ~64d11d3)
- Optimistic in-memory update before re-render (`_rampPostpone`)

### Cascade reliability
Initial cascade-delete was per-step `try/catch` that silently aborted on
422. Recent fixes:
- Removed `fields:['Name']` (was causing 422)
- Added PARTNER_ASSIGN to cascade chain
- New `cleanupOrphans()` for legacy orphans

---

## Major architectural decisions

### Architecture v2.0 (recorded in `/ARCHITECTURE.md`)
- VS sync writes to NAT_LOADS directly (bypasses NAT_ORDERS)
- NAT_LOADS is the single source for Weekly National
- 5 canonical sync scenarios with documented date logic

### Tool use vs FAST mode (this week)
We tried single-call extraction with full ref injection (commit `0cefbdc`).
Faster but **the model picked wrong matches** when names overlapped
(e.g. "BERLIN-FRUCHTHOF" vs "Berlin Fresh Market"). Reverted to tool-use.

Lesson: **AI accuracy on narrow targeted searches > full context dump**.

### Per-doc-type model tier (commit `bf8d189`)
- CARRIER_ORDER, CMR, UNKNOWN → Opus 4.6 (max accuracy, ~$0.12/scan)
- DELIVERY_NOTE, PALLET_SHEET → Sonnet 4 (~$0.024/scan)

For Petras volume (~100 scans/month), tiered cost is ~$6/mo vs $12 Opus-only
or $2.40 Sonnet-only.

### `cleanupOrphans()` over schema FK enforcement
Airtable doesn't enforce FK. We accept that orphans will happen and
provide a sweep tool that runs from console (`cleanupOrphans()` in
[`DEBUGGING.md`](./DEBUGGING.md)).

---

## What we know we'll need to revisit

1. **Bundle the JS** — cold load is 8–12s on slow 4G. Bundler would cut to ~3s.
2. **Centralised audit log** — currently per-user localStorage. Move to a
   `_AUDIT_LOG` Airtable table.
3. **Cap chat history** — unbounded growth, will hit localStorage quota.
4. **Cloudflare Worker deploy** — closes the API token exposure (S1).
5. **Sentry DSN configured** — error tracking is currently localStorage-only.
6. **Test data cleanup** — ~1090 records skewing KPIs.

---

## How to read commit messages

Convention used:
- `feat(scope): summary` — new feature
- `fix(scope): summary` — bugfix
- `refactor(scope): summary` — internal change, no behavior diff
- `perf(scope): summary` — perf improvement
- `chore(scope): summary` — tooling, deps, etc.
- `revert(scope): summary` — undoes a previous commit

The body explains the **why** when non-obvious. If you find a commit with
a single-line body, it's probably a true one-liner.

```bash
# Specific topic
git log --oneline --grep="cascade"
git log --oneline --grep="scan"

# Specific file history
git log --follow --oneline core/scan-helpers.js | head -30

# Show full body of a commit
git show <hash> --stat
git show <hash> --no-patch
```
