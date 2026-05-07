# Performance — Bottlenecks & Budgets

What's fast, what's slow, and where the time actually goes.

---

## Cold load (first visit)

| Phase | Time | Notes |
|---|---|---|
| HTML parse | ~50ms | Single-page shell |
| JS scripts (~30 files) | 1.5–2s on 5G; 8–12s on 4G | No bundler; each file is its own request |
| Service Worker register | non-blocking | Caches shell + assets for next visit |
| `init()` runs | ~100ms | Validates session, renders sidebar, navigates |
| First page render | ~300ms–2s | Depends on which page (Dashboard heaviest) |
| API preload (parallel) | ~1–3s | Reference tables: TRUCKS, TRAILERS, DRIVERS, PARTNERS, CLIENTS, LOCATIONS |

**Total cold load**: 3–5s desktop, **8–12s slow 4G**.

### Why slow 4G is rough
- ~30 JS files × ~30KB avg = 900KB transfer
- ~5–8 parallel Airtable requests on first paint
- HTTPS handshake per origin (Airtable, Anthropic, GitHub Pages)

### Mitigation already done
- Service Worker caches everything after first load — warm load is ~500ms
- Reference data localStorage cache (30 min TTL) — avoids re-fetching across reloads
- Parallel preload via `Promise.all`

### Mitigation NOT done (open work)
- No bundler. ~30 sequential script-tag fetches on cold load.
  Bundling with esbuild would cut this to 1–3 files. Estimated effort: 1 day.
- No code-splitting. Modules load even if user never visits that page.
  Lazy-load on `navigate()` would save ~300KB.
- No HTTP/2 push (GH Pages limitation).

---

## Per-page render

Measured logged in as `owner` on a typical 5G connection, after warm load.

| Page | Time-to-interactive | Notes |
|---|---|---|
| Dashboard | 1–2s | Loads ORDERS (last 30d) + NAT_LOADS + reference data + ORDER_STOPS for deadhead calc |
| CEO Dashboard | 2–4s | Loads ORDERS + NAT_LOADS + MAINT_HISTORY + multiple aggregations |
| Weekly International | 1.5–2s | Filters orders by week + match logic |
| Weekly National | 1–1.5s | NAT_LOADS only (single source after Architecture v2) |
| Daily Ops Plan | 1.5–2s | Today + tomorrow ORDERS + ORDER_STOPS + overdue scan |
| Daily Ramp Board | 1–1.5s | RAMP records + sync from ORDER_STOPS (background) |
| International Orders (table view) | 0.5–1s | Cached after first load |
| National Orders | 0.5–1s | Same |
| Locations / Clients / Partners / Drivers / Trucks / Trailers | 0.3–0.8s | Reference data already preloaded |
| Performance | 1–2s | Computes 20+ KPIs from cached data |
| Maintenance | 1–1.5s | Loads MAINT_HISTORY + workshops + truck/trailer references |
| Invoicing | 1–1.5s | Aggregates ORDERS + NAT_ORDERS by status |
| Pallet Ledger | 1–2s | Two ledger tables + locations + clients lookup |

---

## AI scan flow

The most user-visible "slow" operation. **Total: 15–35s** for a typical
multi-stop OGL Carrier Order.

| Phase | Time | Why |
|---|---|---|
| 1. Image preprocessing | 0.5–2s | Auto-rotate (EXIF) + resize to 2000px + JPEG re-encode |
| 2. Doc-type detection (Haiku) | 1–3s | One-shot classify call |
| 3. Initial extraction (Opus + image) | 5–10s | Big input — image (~3K tokens) + system prompt with ref data (~5K) |
| 4. Tool calls (search_clients × N + search_locations × N) | 3–5s × 3–4 turns = 10–20s | **Bulk of the time** |
| 5. Cleanup call (Haiku, JSON-only) | 2–3s | Strips conversational preamble |

### What's been tried for speed

| Attempt | Result |
|---|---|
| FAST mode (single call, full ref injection, no tools) | 4–8s but **wrong matches** when client/location names overlap. Reverted (commit `6fdef33`). |
| Parallel tool execution within a turn | ~3–5s saved (commit `5d9e9ed`) |
| Tool result cache within session | ~1–3s saved on docs with repeating supplier names |
| Prompt caching on system prompt + image | ~50% token cost saved on subsequent scans within 5 min |
| Image cap 2000→1600px | rolled back — trade-off too aggressive |

### What's NOT been tried

- **Streaming the final extraction** — the Anthropic API supports it,
  scan-helpers does not currently use it for the structured output. Would
  give better perceived speed but no real time saved.
- **Server-side scan via Cloudflare Worker + KV cache** — would avoid the
  browser-to-Anthropic latency for repeat similar docs. Effort: 1 day.
- **Multi-stage extraction** (cheap pass → confidence check → expensive pass) —
  could be faster on average. Risk: harder to debug.

---

## API throughput

### Airtable rate limit
**5 requests/second per base.** The app respects this via `_atQueue` (in
`api.js`) which serialises requests with a min interval gate.

### When it shows up
- Bulk operations (e.g. submitting an order with 6 ORDER_STOPS = 7 calls)
- VS sync chain (1 PATCH on order → 1 PATCH on NAT_LOAD per direction → ORDER_STOPS calls)
- Cascade delete of an order with 6 stops + 6 GL + 3 CL + 6 NL = ~20 calls

A worst-case cascade can take **8–10 seconds** purely waiting for rate limit.

### Queue behavior
- `_atQueue` is a simple FIFO with a min-interval gate.
- 429 from Airtable triggers exponential backoff (1s, 2s, 4s) up to 3
  retries, then surfaces friendly message.
- POST/PATCH/DELETE got 30s timeout via `_fetchWithTimeout` (was infinite hang
  before commit a8871aa).

### Worker-mode throughput
With Cloudflare Worker (S1 in `KNOWN_ISSUES.md`):
- Worker enforces 4 concurrent requests to Airtable (server-side queue)
- Browser → Worker is fast; Worker → Airtable parallelised
- Throughput **roughly 2x** the current direct mode

---

## Anthropic API budgets

### Per-call costs (Sonnet 4)
- Image (~2K tokens) + system prompt (~5K) + output (~1K) ≈ $0.024 per scan
- Νάκης response (~3K input + ~500 output) ≈ $0.015 per turn

### Per-call costs (Opus 4.6)
- Same scan ≈ $0.12 per call (5× more expensive)
- Used for CARRIER_ORDER + CMR + UNKNOWN doc types

### Daily quota guard
Νάκης has a per-user-per-day soft cap of 100k tokens
(`_DAILY_TOKEN_LIMIT` in `core/ai-chat.js`). When exceeded, the user sees a
"daily limit reached" message instead of submitting.

### Rate limit
**30,000 input tokens per minute** for Opus on the Petras account. Hit
this once during multi-tool-call scans (commit f668f5e). Mitigated via
prompt caching + reduced MAX_TOOL_LOOPS.

---

## localStorage budgets

The app aggressively uses localStorage for caching + state. Browser typical
limit is 5–10 MB per origin.

| Key prefix | Size estimate | Notes |
|---|---|---|
| `tms_cache_<tableId>` | up to 1 MB per table | Reference data, 30 min TTL |
| `tms_errors` | up to 200 KB | 200-entry cap, 14-day auto-purge |
| `tms_audit` | up to 200 KB | 200-entry cap |
| `aic_history_<user>` | **unbounded** | Chat history — biggest growth vector |
| `nakis_profile_<user>` | <2 KB | Interview answers |
| `nakis_notifs_<user>` | <50 KB | Νάκης reminders, capped at ~30 |
| `tms_scan_training` | <100 KB | 30-correction cap |
| `tms_offline_queue` | <50 KB | Pending writes when offline |

A power user with 6 months of chat history could hit the 5 MB ceiling.
**Action**: cap `aic_history_*` at last N=200 messages OR rotate
out >30 days. Open task.

---

## Render budgets

### Entity tables
- 500-row render cap (commit 7d7a3df) — beyond that, footer warning + use search.
- Currently safe: ~400 partners, ~200 clients, ~100 drivers, ~50 trucks/trailers.
- Will need virtual scrolling at 1000+ records per table.

### Weekly Intl/Natl
- Renders all rows for the current week (~5–30 typical, 50 max during peak).
- Drag-drop is lightweight; no virtualisation needed at this scale.

### Daily Ramp
- Auto-refresh every 2 minutes if the user isn't editing (skips if input/select is focused).
- Has cooldown flag (`_rampInEditCooldown`) — 10s grace after any edit.

### Daily Ops
- Filters applied client-side. ORDER_STOPS lookup done in batches of 90 (Airtable formula limit).

---

## Memory cache (`_MEM`)

In-memory + localStorage two-tier cache.

| Tier | TTL | Tables |
|---|---|---|
| Memory only | 2 min | ORDERS, NAT_ORDERS, NAT_LOADS, GL_LINES, CONS_LOADS, RAMP, ORDER_STOPS — frequently changing |
| Memory + localStorage | 30 min | LOCATIONS, TRUCKS, TRAILERS, DRIVERS, PARTNERS, CLIENTS — stable reference |

`invalidateCache(tableId)` purges both tiers. `invalidateRefData()` purges
the normalised reference data layer (`getRefClients()` etc.).

---

## When users say "it's slow"

Order of investigation:
1. **Cold or warm?** First load is always 3–5s. If they mean 8–12s warm,
   something's wrong.
2. **Network?** Throttle DevTools to "Slow 4G" and reproduce.
3. **Specific page?** Some pages legitimately take 1–2s to render.
4. **Scan-related?** Yes, scans are 15–35s. We know.
5. **API rate limit?** Check `getErrorLog()` for 429s.
6. **Cache miss storm?** Force a hard refresh (Cmd+Shift+R) and see if
   first re-load is fast (cache primed) — if no, problem is real.

---

## Work-in-progress / open improvements

- **Bundler** — would cut cold load by 50%. Bigger refactor.
- **Code splitting per page** — lazy-load modules on `navigate()`. Smaller
  effort but touches every module.
- **Cap chat history**.
- **Virtual scrolling** for entity tables (only when data > 500).
- **Worker mode** — improves API latency + security (S1 in KNOWN_ISSUES).
- **Streaming JSON extraction** — perceived faster scan.
