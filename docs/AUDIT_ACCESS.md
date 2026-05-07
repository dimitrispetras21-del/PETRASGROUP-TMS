# Audit Access Setup

What access the audit team needs, why, and how to provision it safely.
The owner (Dimitris) is responsible for granting these — don't give a
production-level Airtable PAT or production owner credentials.

---

## 🎯 What they need vs why

| Resource | Required? | Risk if abused | Recommended access level |
|---|---|---|---|
| **GitHub repo** | yes | Low — read access exposes only what's already public | Read-only collaborator |
| **Live app login** | yes | Low — can mutate but limited to one role | Dedicated `dispatcher` user, NOT owner |
| **Airtable schema** | yes | None | Provide a Meta API export OR read-only PAT |
| **Airtable data** | optional | HIGH if write — can break production | Duplicate base (preferred) OR read-only PAT |
| **Anthropic API** | optional | Cost only | Separate API key with low monthly cap |
| **Cloudflare Worker repo** | optional | None | They get it from `/worker/` in repo |

---

## 1. GitHub repo (free, low risk)

Add the audit team as **collaborators with read access**:

1. Go to https://github.com/dimitrispetras21-del/PETRASGROUP-TMS/settings/access
2. Click **Add people**
3. Add their GitHub usernames
4. Set role: **Read** (default is Write — change to Read)
5. They get an invite email

If they need to open PRs, change to **Triage** or **Write**. For a pure
audit, **Read** is enough.

---

## 2. Live app login (1 dedicated test user)

**Don't share the owner password**. Create a dedicated audit account:

### Option A — Reuse `kelesmitos` (existing dispatcher)
- Username: `kelesmitos`
- Password: (in your spreadsheet, search for "Δημήτρης Κελεσμήτος")
- Role: dispatcher
- Pros: already exists
- Cons: any actions they take look like they came from him

### Option B — Add a dedicated `auditor` user (recommended)

1. Pick a strong random password, hash it:
   ```bash
   echo -n 'YOUR_PASSWORD_HERE' | shasum -a 256 | cut -d' ' -f1
   ```
   That gives you a 64-char hex SHA-256 hash.

2. Edit two files (paste the hash where indicated):

   **`config.js` line ~253-260** (the `USERS` array):
   ```js
   { username: 'auditor', hash: 'PASTE_64CHAR_HASH_HERE', role: 'dispatcher', name: 'Audit Team' },
   ```

   **`index.html` line ~316-323** (same array):
   ```js
   { username: 'auditor', hash: 'PASTE_64CHAR_HASH_HERE', role: 'dispatcher', name: 'Audit Team' },
   ```

3. Bump cache-bust on both files (`?v=TIMESTAMP` in `app.html`).
4. Push to `main`.
5. Send the audit team: `username: auditor`, `password: <plaintext you picked>`.
6. **After audit ends**: remove the entries + push.

> If you want me to make this change, send me a strong password (private channel).

---

## 3. Airtable access — the careful part 🟡

Here's where you need to choose. The auditors **don't need write access**;
they need to understand the schema + verify that field names + data shapes
match the docs.

### 🥇 Option A: **Duplicate base** (recommended, ZERO risk)

Best for in-depth audit with real data:

1. Open Airtable → workspace → click `…` next to base `Petras Group TMS`
2. **Duplicate base** → name it something like `Audit Copy 2026-05`
3. ✅ Check "Duplicate records"
4. New base gets a different ID like `appXYZ123ABC`
5. Click **Share** on the duplicate → add the audit team's emails as Editors
6. Send them: "Use the base named *Audit Copy 2026-05*. The schema is
   identical to production but mutations are isolated."

**Pros**: full data, full mutation freedom, zero prod risk.
**Cons**: 5 min setup, costs an extra base slot in your Airtable plan.

### 🥈 Option B: **Read-only PAT** (medium effort, no data leakage risk)

Generate a PAT scoped to read-only on the prod base:

1. Go to https://airtable.com/create/tokens
2. Create new token:
   - Name: "Audit team read-only — May 2026"
   - Scopes: **`data.records:read`** + **`schema.bases:read`**
   - Access: only the Petras Group TMS base
3. Copy the token (`pat...`)
4. Send it to the auditors (private channel)
5. They use it for `https://api.airtable.com/v0/appElT5CQV6JQvym8/...`
   queries to inspect data + schema without write access.

**Pros**: no duplicate base needed, scoped permissions.
**Cons**: they can read **all** data including financial.
**Important**: revoke the token when audit ends.

### 🥉 Option C: **Schema export only** (zero data exposure)

Send them just the schema as JSON. They mock data locally:

```bash
curl -sH "Authorization: Bearer $AT_TOKEN" \
  "https://api.airtable.com/v0/meta/bases/appElT5CQV6JQvym8/tables" \
  > schema-2026-05.json
```

Send `schema-2026-05.json` to the auditors. They get the field structure
without any actual records.

**Pros**: zero data leakage.
**Cons**: they can't validate the docs against real data patterns.

### ❌ NOT recommended

- **Sharing the production PAT** in `config.js` — they'd have full r/w
  to the prod base. (This is exactly the security risk in `KNOWN_ISSUES.md` §S1.)
- **Adding them as Editor on prod** — same risk if they run a script.

---

## 4. Anthropic API (optional)

If they want to test scan flows / Νάκης end-to-end, give them a **separate
API key with a monthly spending cap**:

1. https://console.anthropic.com → Settings → Workspaces
2. Create a workspace called "Audit Sandbox"
3. Set **monthly spend limit**: $20-50
4. Generate an API key for that workspace
5. Send the key to the auditors

They can drop this in their local `config.js` (overriding `ANTH_KEY`)
without touching production.

---

## 5. Cloudflare Worker (informational only)

The Worker code lives in `/worker/` in the repo. They get it automatically
via the GitHub access. **They don't need a Cloudflare account** unless
they're auditing the deploy/infra side.

---

## 📋 Setup checklist (copy-paste for your reference)

When provisioning access:

- [ ] **GitHub**: invited as Read collaborators
- [ ] **Live app**: dedicated `auditor` user added (or shared `kelesmitos`)
  - [ ] config.js + index.html updated
  - [ ] cache-bust bumped
  - [ ] pushed to main
  - [ ] credentials sent privately
- [ ] **Airtable**: chose Option A / B / C
  - [ ] If A: duplicate base named, auditors invited
  - [ ] If B: read-only PAT generated, sent privately
  - [ ] If C: schema JSON exported, sent
- [ ] **Anthropic** (if they need scan testing):
  - [ ] Audit Sandbox workspace created
  - [ ] Monthly cap set
  - [ ] API key sent privately
- [ ] **Communication channel** agreed:
  - [ ] Slack / Discord / shared Notion / email
  - [ ] How they should report findings (PR? `docs/audit-findings/`? email?)

---

## 🔒 Off-boarding (when audit completes)

Don't forget:

- [ ] Remove `auditor` user from config.js + index.html (push to main)
- [ ] Revoke read-only Airtable PAT (https://airtable.com/create/tokens)
- [ ] Delete duplicate Audit base (if Option A)
- [ ] Revoke Anthropic API key
- [ ] Remove GitHub collaborators
- [ ] Rotate any credentials they had visibility on (Airtable PAT, etc.)

---

## ❓ Common auditor questions you can pre-answer

**Q: Why is the Anthropic key in `config.js`?**
A: Acknowledged in [`KNOWN_ISSUES.md` §S1](./KNOWN_ISSUES.md#s1-api-tokens-exposed-in-browser).
The Cloudflare Worker proxy in `/worker/` is the fix; not yet deployed.

**Q: Is there a staging environment?**
A: No. Pushes to main go straight to GH Pages production. Deploys are
manual; no CI gate. See [`KNOWN_ISSUES.md` §M2](./KNOWN_ISSUES.md).

**Q: Where are the tests?**
A: `tests/` directory — unit tests in `test-runner.html` (open in browser),
e2e in `tests/e2e/` (Playwright, requires Node). Neither runs in CI yet.
See [`TESTING.md`](./TESTING.md) for canonical flows.

**Q: Why are some field names wrong (Adress, etc.)?**
A: Schema accumulated typos kept for backwards compatibility. Documented
in [`SCHEMA.md`](./SCHEMA.md) "Field naming traps".

**Q: How do I reproduce a sync chain bug?**
A: See [`DEBUGGING.md`](./DEBUGGING.md) "Sync chain debugging" + the 5
canonical scenarios in [`TESTING.md`](./TESTING.md).
