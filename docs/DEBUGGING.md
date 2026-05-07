# Debugging & Diagnostic Reference

A working knowledge of the console commands + state inspection patterns
saves hours when reproducing or fixing issues.

All commands below are runnable directly in the live app's DevTools console
when logged in.

---

## Quick health checks

```js
// Who am I logged in as?
JSON.parse(localStorage.getItem('tms_user'))

// What page?
currentPage

// Memory cache stats
Object.keys(_MEM)
Object.keys(_MEM).map(k => [k, _MEM[k]?.length || 'n/a'])

// localStorage cache (stable tables — 30min TTL)
Object.keys(localStorage).filter(k => k.startsWith('tms_'))

// Online/offline
navigator.onLine

// Service Worker status
navigator.serviceWorker.controller?.scriptURL
navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => r.scope))
```

---

## Error log

The app maintains a per-user error log in localStorage with severity inference,
deduplication, and auto-purge after 14 days.

```js
// View recent errors (most recent first)
getErrorLog()

// Show all critical errors
getErrorLog().filter(e => e.severity === 'critical')

// Errors by context
getErrorLog().filter(e => e.ctx === 'field_validation')

// Export to JSON file
const log = getErrorLog();
const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = `tms-errors-${localToday()}.json`;
a.click();

// Force a test error
logError(new Error('test'), 'manual_test');

// Open the Error Log UI
navigate('error_log')

// Wipe everything (irreversible)
localStorage.removeItem('tms_errors'); _errorLog.length = 0;
```

The auto-purge runs once per session 2.5s after boot. Entries older than
14 days are silently removed.

---

## Audit log

Every CRUD operation through `atPatch`/`atCreate`/`atDelete` is logged
locally with timestamp + user + role + field keys.

```js
// View
JSON.parse(localStorage.getItem('tms_audit') || '[]')

// Last 10
JSON.parse(localStorage.getItem('tms_audit') || '[]').slice(-10)

// Filter by user
JSON.parse(localStorage.getItem('tms_audit') || '[]').filter(e => e.user === 'Dimitris Petras')

// Filter by table
JSON.parse(localStorage.getItem('tms_audit') || '[]').filter(e => e.table === 'tblgHlNmLBH3JTdIM')
```

Capped at 200 entries (FIFO). Per-user / per-browser — there is no
centralised audit log (see KNOWN_ISSUES §M-something).

---

## Cleanup commands

```js
// Full orphan sweep — finds + deletes:
//   • GROUPAGE_LINES with no live parent (cascades to CL + NL)
//   • PARTNER_ASSIGN with no live Order/NatLoad
//   • RAMP records linked to deleted orders
//   • NAT_LOADS (Direct VS) with deleted Source Record
cleanupOrphans()

// Legacy — just GL (use cleanupOrphans() instead)
cleanupOrphanGL()

// Wipe scan training cache
localStorage.removeItem('tms_scan_training');

// Wipe Νάκης state for current user (forces interview re-run)
localStorage.removeItem(_nakisProfileKey());
localStorage.removeItem(_nakisHistoryKey());
localStorage.removeItem(_nakisNotifsKey());
location.reload();

// Force-flush ALL caches (next read hits API)
Object.keys(_MEM).forEach(k => delete _MEM[k]);
Object.keys(localStorage).filter(k => k.startsWith('tms_cache_')).forEach(k => localStorage.removeItem(k));
location.reload();
```

---

## API debugging

```js
// Hit Airtable directly (uses auth + cache helpers)
await atGetAll(TABLES.ORDERS, { filterByFormula: '{Status}="Pending"', maxRecords: 5 }, false)

// Get a single record (cached)
await atGetOne(TABLES.ORDERS, 'recXXX')

// Force-refresh a single table (bypasses 30min localStorage cache)
invalidateCache(TABLES.ORDERS)
await atGet(TABLES.ORDERS)  // re-fetches all

// View pending offline writes (when online again, they flush)
JSON.parse(localStorage.getItem('tms_offline_queue') || '[]')

// Reference data (loaded once on boot)
getRefClients().length
getRefLocations().length
getRefDrivers()
getRefTrucks()
```

### Inspect a field validator expectation
```js
_FIELD_EXPECTATIONS  // { tableId: { fields: [...], context: '...' } }
```

### Test the retry logic
```js
// Simulate: response promise that always 500s once then succeeds
// (Manual test — easier to just unplug network briefly and watch retry kick in)
```

---

## Scan helpers — diagnostic

```js
// Test fuzzy matching
scanFuzzyMatch('Athens', [
  { id: 'rec1', label: 'Αθήνα' },
  { id: 'rec2', label: 'Berlin' }
], { threshold: 0.5 })
// → [{id:'rec1', label:'Αθήνα', score:1}]   (alias resolves)

// Greek alias dictionary
SCAN_ALIASES['ATH']     // 'Αθήνα'
SCAN_ALIASES['THESS']   // 'Θεσσαλονίκη'

// Reference data injection helper (what the AI sees)
const refData = scanGetReferenceData(50, 80);
console.log(scanBuildReferenceBlock(refData));  // copy-paste-able prompt block

// Recent corrections (few-shot pool)
JSON.parse(localStorage.getItem('tms_scan_training') || '[]')

// Trigger a doc-type classification
await scanDetectDocType(base64String, 'image/jpeg')

// Tier model for a doc type
scanModelForType('CARRIER_ORDER')   // 'claude-opus-4-6'
scanModelForType('PALLET_SHEET')    // 'claude-sonnet-4-20250514'

// Robust JSON parse (handles preamble, smart quotes, code fences)
scanExtractJSON('Now I have... {"foo": "bar"}')   // {foo:'bar'}
```

---

## Νάκης (AI chat) diagnostic

```js
// Current chat state
AiChat.messages
AiChat.isLoading
AiChat.suggestions
AiChat.pending  // pending file attachments

// Token quota for today (per-user, per-day, capped at 100k)
_nakisTokensUsed()
_nakisQuotaPct()

// Profile
_nakisGetProfile()

// Notifs
_nakisGetNotifs()

// Force-abort the current AI call (red stop button equivalent)
_aicAbort()

// Manually trigger render
_aicRenderMsgs()

// Allowed tools for current role
_aicAllowedTools().map(t => t.name)
```

---

## Sync chain debugging

```js
// Trigger a downstream sync manually
await syncOrderDownstream('recXXX', { source: 'intl', changedFields: ['Status'] })

// Check existing GROUPAGE_LINES for an order
await atGetAll(TABLES.GL_LINES, {
  filterByFormula: `FIND("recXXX",ARRAYJOIN({Linked International Order},","))>0`
}, false)

// Check linked NAT_LOADS
await atGetAll(TABLES.NAT_LOADS, {
  filterByFormula: `{Source Record}="recXXX"`
}, false)

// Check linked ORDER_STOPS
await stopsLoad('recXXX', F.STOP_PARENT_ORDER)
```

---

## Performance debugging

```js
// Time an API call
console.time('fetch'); await atGetAll(TABLES.ORDERS); console.timeEnd('fetch');

// Memory cache hit/miss (look for [TMS] log lines if window.TMS_DEBUG = true)
window.TMS_DEBUG = true;
// or persist:
localStorage.setItem('tms_debug', '1');
location.reload();

// Performance API for full page load
window.performance.timing
window.performance.getEntriesByType('navigation')

// Big-data check
Object.keys(localStorage).map(k => [k, localStorage[k].length]).sort((a,b) => b[1]-a[1]).slice(0,10)
// shows top 10 localStorage consumers
```

---

## Permission boundary tests

```js
// Try to navigate to a restricted page
navigate('ceo_dashboard')   // toast 'access denied' if you're not owner

// Test role check
can('ceo_dashboard')     // 'full' | 'view' | 'none'

// View role permissions matrix
PERMS

// Try permission bypass (all should fail safely)
const u = JSON.parse(localStorage.getItem('tms_user'));
u.role = 'owner';
localStorage.setItem('tms_user', JSON.stringify(u));
// On next page load, _authRoleTampered() should force-logout
```

---

## Network debugging

```js
// View network tab — every Airtable call should be EITHER:
//   - https://api.airtable.com/v0/appElT5CQV6JQvym8/...   (USE_PROXY=false, current state)
//   - https://tms-api-proxy.petrasgroup.workers.dev/v0/... (USE_PROXY=true, after worker deploy)

// Check current mode
USE_PROXY

// Check Anthropic call patterns
// → /v1/messages (with x-api-key header)
// → has 'anthropic-dangerous-direct-browser-access': 'true'

// View Service Worker cache
caches.keys().then(console.log)
caches.open('tms-sw-v35-crashtest-fixes').then(c => c.keys()).then(rs => console.log(rs.length, 'cached requests'))
```

---

## UI state debugging

```js
// Force-render the sidebar
renderNav()

// Toggle mobile drawer
toggleMobileNav()

// Show all loading states
document.querySelectorAll('.spinner').forEach(s => console.log(s.parentElement?.outerHTML.slice(0, 200)))

// Show all open modals
[document.getElementById('modal'), document.getElementById('modalOverlay'), document.getElementById('aic-panel')]
  .filter(el => el && el.style.display !== 'none')
```

---

## Useful one-shots from this session's debugging

```js
// Find orphan partner assignments (manual, before cleanupOrphans existed)
(async () => {
  const all = await atGetAll(TABLES.PARTNER_ASSIGN, {}, false);
  const valid = new Set([
    ...(await atGetAll(TABLES.ORDERS, { fields: ['Direction'] }, false)).map(r => r.id),
    ...(await atGetAll(TABLES.NAT_ORDERS, { fields: ['Direction'] }, false)).map(r => r.id),
  ]);
  return all.filter(pa => {
    const orders = pa.fields[F.PA_ORDER] || [];
    return orders.length && !orders.some(id => valid.has(id));
  });
})()

// Diff Airtable schema vs config.js TABLES
const r = await fetch('https://api.airtable.com/v0/meta/bases/' + AT_BASE + '/tables', {
  headers: { Authorization: 'Bearer ' + AT_TOKEN }
});
const data = await r.json();
data.tables.forEach(t => console.log(t.id, t.name, t.fields.length, 'fields'));
```

---

## Where to find existing diagnostic helpers

- `_tmsLog(...)` — gated console.log, only fires when `window.TMS_DEBUG = true`
- `logError(err, ctx)` — adds to error log with severity inference
- `_auditLog(action, table, recId, fields)` — adds to audit log
- `toast(msg, type, durationMs)` — non-blocking UI toast
- `showErrorToast(msg, kind, ms)` — error-styled toast
- `_aicShowToolBadge(toolName)` — flashes the tool name in chat panel

---

## What to capture when reporting a bug

1. `getErrorLog().slice(-5)` — last 5 errors
2. `currentPage` + steps to reproduce
3. `JSON.parse(localStorage.getItem('tms_user'))` — current role
4. Browser + version
5. Network tab screenshot if API-related
6. The actual record ID(s) involved (Airtable URL is fine)
