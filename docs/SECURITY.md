# Security — Threat Model & Known Gaps

Honest about what we protect against and what we don't.

---

## Trust model

This app is designed for **internal use by 6 trusted users** of Petras
Group. The threat model has been calibrated accordingly. **It's NOT
ready for**:

- Multi-tenant / customer-facing deployment
- Anonymous or public registration
- Untrusted users with browser DevTools
- Federated auth / SSO

---

## What we DO protect

| Threat | Defence |
|---|---|
| Direct data tampering via UI | Role-based UI gates (sidebar, page guards) |
| URL-based bypass | `navigate()` permission check (commit `64d11d3`) |
| Session hijack via stale cookie | 8-hour session expiry, signed-in browser only |
| Role escalation via localStorage edit | `_authRoleTampered()` cross-check against `USERS` array (commit `64d11d3`) |
| API rate limit DoS to Airtable | Client-side queue (`_atQueue`) + 5 req/sec rate gate |
| Anthropic API rate limit | Prompt caching + retry with backoff (commit `f668f5e`) |
| User pasting passwords in plain text | All `USERS` entries use SHA-256 hashes (no plaintext stored) |
| CSRF on Airtable | Airtable PAT scoped to specific base (workspace-level) |
| XSS via document scan content | `escapeHtml()` on all user-controlled output |
| XSS via Νάκης action chips | Whitelisted handlers only (`navigate`, `openCommandPalette`, `_aicSetInput`) — see commit `8ff3819` |
| Cascade delete data loss | Confirmation dialogs + `_delFail` counter + undo buffer |

---

## What we DO NOT protect (yet)

These are documented in [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md). Restating
the security-relevant ones here for the threat model:

### 🔴 S1. API tokens in browser source
**Risk**: Anyone with DevTools sees `AT_TOKEN` (Airtable PAT, full r/w)
and `ANTH_KEY` (Anthropic, billable API access).

**Threat scenarios**:
- A dispatcher screenshares to a client during demo → token visible
- A team member's browser extension reads localStorage / source
- A laptop is stolen → tokens accessible offline
- A printed screenshot of DevTools → token compromise

**Why not fixed yet**: the Cloudflare Worker proxy in `/worker/` is
written but not deployed. Once deployed:
- `USE_PROXY = true` in config.js
- Worker holds AT_TOKEN server-side
- Browser only sees a JWT (8h expiry, scoped to user)
- Worker enforces CORS + rate limit + auth

**Estimated work**: ~30 min to deploy, ~30 min to verify in prod.

### 🟠 S2. Password hashing — unsalted SHA-256
Passwords are stored as `sha256(plaintext)`. No salt, no per-user pepper.
Implications:
- Same password across users → same hash → both compromised if one is.
- Rainbow-table attack feasible (SHA-256 of common passwords is in public
  dictionaries).
- Owner can see/decrypt user passwords if they know the original plaintext.

**Mitigation in place**:
- Hashes are in `index.html` source, not in localStorage (no per-browser exposure).
- `sha256Salted(username, password)` exists (commit `a7c68e2`) — uses
  username as salt — but **no users have migrated to it**. Login flow
  tries salted first, falls back to legacy. After all users log in once,
  owner can paste new salted hashes from console output and remove legacy.

**Why not fixed yet**: requires a coordinated migration with all users
logging in once.

### 🟡 S3. No CSRF token on Airtable mutations
Airtable PAT auth is essentially a bearer token. There's no CSRF
protection because the app is the only client. However, if a malicious
site got hold of `AT_TOKEN` (S1), they could write to the base.

**Mitigation**: S1 fix (Worker proxy) closes this — Worker rejects requests
without valid Origin / JWT.

### 🟡 S4. Airtable PAT has full r/w on entire base
If S1 happens, the attacker has full access to **all** tables, including
financial (TRIP_COSTS, FUEL, DRIVER_LEDGER) and HR (DRIVERS).

**Mitigation in design**:
- Worker would expose only specific endpoints, not the full Airtable API
- Could narrow further by table/operation

### 🟡 S5. Audit log is per-browser localStorage
There's no centralised audit trail. If a user takes a destructive action,
the only record is in their browser's localStorage. If they clear it (or
the auto-purge runs), the trail is lost.

**Mitigation planned**:
- Move `tms_audit` to a centralised `_AUDIT_LOG` Airtable table
- Owner gets a "Audit Trail" view of all team mutations
- Estimated work: 1 day

### 🟡 S6. No 2FA / MFA
Login is username + SHA-256 hash. No second factor. A leaked password
is full account compromise.

**Mitigation considered**:
- Once Worker is deployed, can add TOTP (Google Authenticator) at the
  worker layer
- Not on roadmap yet

### 🟢 S7. No rate-limit on login attempts
Brute force could try thousands of password hashes per second. With 6
known usernames + SHA-256 + no salt, weak passwords are vulnerable.

**Mitigation in place**:
- All current passwords are NOT in common dictionaries (we checked)
- Login is client-side only (no server to limit), but each attempt requires
  a full page load + hash compute → naturally slow
- After Worker deploy: server-side throttling possible

---

## Personal data (GDPR-relevant)

Tables containing PII:
- **DRIVERS**: name, phone, KTEO/license expiry, payroll
- **CLIENTS**: company info, contacts (some), `Adress`
- **PARTNERS**: same as clients
- **WORKSHOPS**: contact info

Rights handling (currently informal):
- **Right to access** — owner can export from Airtable (manual)
- **Right to erasure** — owner can delete record (manual; cascade not
  guaranteed clean — see KNOWN_ISSUES §A1)
- **Right to portability** — CSV export buttons on relevant pages
  (commits `7a8c245`, `2afc1bd`)

No formal privacy policy is published; users are internal employees who
have signed broader employment agreements.

---

## Dependencies (supply-chain)

| Dep | Source | Pinned? |
|---|---|---|
| Anthropic SDK | (not used — direct fetch) | n/a |
| pdf.js | CDN: `cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174` | yes (version pinned) |
| Sentry | CDN: `browser.sentry-cdn.com/7.120.0/bundle.min.js` | yes + SRI hash |
| Lucide icons | inline SVG (no external dep) | n/a |
| Fuse.js (was considered) | not actually used; fuzzy logic is hand-rolled | n/a |

**Risk**: pdf.js + Sentry CDN compromise. SRI helps for Sentry; pdf.js
has no SRI. Not in any active CDN compromise list.

---

## Deployment surface

- **GitHub Pages**: serves static files. CSP not set.
- **Service Worker** (`sw.js`): caches app shell + static assets. Doesn't
  cache API responses. Auto-updates on `controller.postMessage('SKIP_WAITING')`.
- **Anthropic API**: direct browser → API (S1).
- **Airtable API**: direct browser → API (S1).

No CDN / WAF / DDoS protection beyond what GH Pages and Cloudflare provide.

---

## Recommended audit checks

The auditor should verify:

1. **Token exposure**: Open DevTools → view source → grep for `pat` / `sk-ant`
   tokens. They should NOT be visible after Worker deploy (S1).
2. **Role bypass**: Login as `eirini` (accountant), open console,
   `navigate('ceo_dashboard')`. Should toast "Access Denied" + stay on current page.
3. **localStorage tampering**: Edit `tms_user.role` to `owner`, reload.
   Should redirect to login (`_authRoleTampered`).
4. **Cascade delete safety**: Delete an order with linked NL/GL/CL/RAMP.
   Verify all are removed. Run `cleanupOrphans()` after — should return
   "no orphans".
5. **XSS attempt**: Submit an order with Notes = `<script>alert(1)</script>`.
   Should render as text (escaped), not execute.
6. **Concurrent edit**: Two browsers, same order, both edit different
   fields, save. Second save should detect conflict (`atSafePatch`) — ONLY
   in modules that use it; many still use `atPatch` directly (S A3).

---

## Reporting security issues

Don't open public GitHub issues for security findings. Send to the owner
directly via private channel. We'll triage + add to [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md)
once a fix is in flight.
