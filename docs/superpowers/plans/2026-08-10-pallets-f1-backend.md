# Παλέτες Φ1 — Backend (migration 003 + /pallets/* routes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Το ημερολόγιο παλετών στη Supabase (`pl_movements` + views υπολοίπων) και τα `/pallets/*` endpoints στον Worker 2 με κανόνες pending→confirmed→reversed.

**Architecture:** Ίδιο μοτίβο με τα costs (ct_*): ένα migration SQL που ο owner τρέχει στο Supabase SQL editor, και ένας inline handler `handlePallets` στο `worker/src/index.js` με δικό του permissions map, που χρησιμοποιεί τα υπάρχοντα helpers (`getCaller`, `dbSelect`, `dbSelectRaw`, `dbInsert`, `ctDbPatch`, `ctPick`, `audit`, `jsonOk`, `jsonError`). Spec: `docs/PALLETS_ARCHITECTURE.md`.

**Tech Stack:** Postgres (Supabase, PostgREST μέσω service key) · Cloudflare Worker (vanilla JS, χωρίς framework) · χωρίς test framework στο worker — verification με `node --check` + `wrangler dev` smoke (401) + post-deploy curl.

## Global Constraints

- **Σημασιολογία taken/given (ΠΑΝΤΑ από τη δική μας σκοπιά):** `taken` = παλέτες που πήραμε ΕΜΕΙΣ από τον αντισυμβαλλόμενο, `given` = που δώσαμε ΕΜΕΙΣ σε αυτόν. Επίδραση υπολοίπου = `given − taken`. Θετικό υπόλοιπο = μας χρωστάει. Παράδειγμα PARTNER_PICKUP: ο partner πήρε 33 φορτωμένες από εμάς και άφησε 10 άδειες → `given=33, taken=10` → +23 μας χρωστάει.
- **Αντιλογισμός (οριστική σημασιολογία, διόρθωση του spec §6):** reverse = η αρχική εγγραφή γίνεται `status='reversed'` (βγαίνει από το υπόλοιπο, μένει στο ιστορικό, `reason` υποχρεωτικό) + ΠΡΟΑΙΡΕΤΙΚΗ νέα σωστή εγγραφή με `reversal_of = <id αρχικής>`. ΔΕΝ δημιουργείται εγγραφή-καθρέφτης — θα μετρούσε διπλά.
- Confirmed εγγραφές: ΠΟΤΕ edit/delete. Pending: ελεύθερο edit/delete. Υπόλοιπα ΜΟΝΟ από confirmed.
- Πρόσβαση στη βάση ΜΟΝΟ μέσω Worker service key· enforcement στο API layer (`PL_PERMS`) όπως τα costs.
- SQL στη Supabase: ΜΟΝΟ clipboard paste (`pbcopy < file`) στο SQL editor μέσω Chrome — το πληκτρολόγημα αλλοιώνει newlines (κανόνας από τα costs, 10/8).
- Worker deploys ΜΟΝΟ με `wrangler deploy` από το `worker/` (owner). Ποτέ από dashboard editor.
- Μετά από κάθε task: `git add` + `git commit` + `git push` (CLAUDE.md). Δεν χρειάζεται bump `?v=` στο app.html — η Φ1 δεν αγγίζει frontend αρχεία.
- Ρόλοι συστήματος: `owner, dispatcher, warehouse, accountant, management`.
- Event types: `LOADING, DELIVERY, PARTNER_PICKUP, PARTNER_DROPOFF, RETURN_OUT, RETURN_IN, ADJUSTMENT`.

---

### Task 1: Migration 003 — schema `pl_*`

**Files:**
- Create: `worker/migrations/003_pallets_schema.sql`

**Interfaces:**
- Consumes: υπάρχοντες πίνακες `clients(id, company_name)`, `partners(id, company_name)`, `locations(id, name)`, `order_stops(id)`, `consolidated_loads(id)`.
- Produces: πίνακας `pl_movements`, sequence `pl_code_seq`, views `pl_v_balance_clients`, `pl_v_balance_partners`, `pl_v_client_locations` — τα ονόματα αυτά χρησιμοποιούνται αυτούσια στα Tasks 2–5.

- [ ] **Step 1: Γράψε το migration αρχείο**

Πλήρες περιεχόμενο του `worker/migrations/003_pallets_schema.sql`:

```sql
-- ============================================================
-- ΠΑΛΕΤΕΣ Φ1 — Migration 003: schema pl_* (PALLETS_ARCHITECTURE §5)
-- Τρέξε το ΟΛΟΚΛΗΡΟ στο Supabase SQL editor (project gatejgbpyodlepkvqkgf)
-- με clipboard paste (pbcopy) — ΟΧΙ πληκτρολόγηση.
-- RLS: ενεργοποιείται εδώ χωρίς policies = πρόσβαση ΜΟΝΟ με service key
-- (ίδια κατάσταση με τα ct_* — εκεί έγινε χειροκίνητα μετά το 001).
-- Κανόνες status/αντιλογισμού: enforcement στο API layer (Worker), όχι εδώ.
-- ============================================================

-- 5.1 Το ημερολόγιο — μία γραμμή = μία κίνηση, ποτέ δεν σβήνεται (confirmed)
create sequence pl_code_seq start 1001;
create table pl_movements (
  id                bigint generated always as identity primary key,
  code              text unique not null default ('PM-' || nextval('pl_code_seq')::text),
  movement_date     date not null,
  counterparty_type text not null check (counterparty_type in ('CLIENT','PARTNER')),
  client_id         bigint references clients(id),
  partner_id        bigint references partners(id),
  location_id       bigint references locations(id),   -- σημείο (drill-down, όχι λογαριασμός)
  event_type        text not null check (event_type in
    ('LOADING','DELIVERY','PARTNER_PICKUP','PARTNER_DROPOFF',
     'RETURN_OUT','RETURN_IN','ADJUSTMENT')),
  -- taken/given ΠΑΝΤΑ από τη δική μας σκοπιά: taken = πήραμε εμείς,
  -- given = δώσαμε εμείς. Υπόλοιπο = Σ(given − taken). Θετικό = μας χρωστάει.
  taken             integer not null default 0 check (taken >= 0),
  given             integer not null default 0 check (given >= 0),
  order_stop_id     bigint references order_stops(id),
  cons_load_id      bigint references consolidated_loads(id),
  sheet_url         text,                          -- το δελτίο παλετών (upload)
  sheet_source      text check (sheet_source in ('UPLOAD_AI','UPLOAD','MANUAL')),
  status            text not null default 'pending'
                    check (status in ('pending','confirmed','reversed')),
  reversal_of       bigint references pl_movements(id),  -- η ΝΕΑ σωστή εγγραφή δείχνει την αντιλογισμένη
  reason            text,                          -- υποχρεωτικό σε ADJUSTMENT + στον αντιλογισμό
  notes             text,
  created_by        text not null,
  created_at        timestamptz not null default now(),
  confirmed_by      text,
  confirmed_at      timestamptz,
  constraint one_counterparty check (
    (counterparty_type = 'CLIENT'  and client_id  is not null and partner_id is null) or
    (counterparty_type = 'PARTNER' and partner_id is not null and client_id  is null)),
  constraint adjustment_needs_reason check (event_type <> 'ADJUSTMENT' or reason is not null)
);
create index pl_mov_client  on pl_movements (client_id, status);
create index pl_mov_partner on pl_movements (partner_id, status);
create index pl_mov_stop    on pl_movements (order_stop_id) where order_stop_id is not null;
create index pl_mov_cons    on pl_movements (cons_load_id)  where cons_load_id  is not null;
alter table pl_movements enable row level security;

-- 5.2 Views — υπόλοιπα ΜΟΝΟ από confirmed, τα pending χωριστή στήλη
create or replace view pl_v_balance_clients as
select
  c.id           as client_id,
  c.company_name as client_name,
  coalesce(sum(m.given - m.taken) filter (where m.status = 'confirmed'), 0) as balance,
  count(*)       filter (where m.status = 'pending')                        as pending_count
from clients c
join pl_movements m on m.client_id = c.id
group by c.id, c.company_name;

create or replace view pl_v_balance_partners as
select
  p.id           as partner_id,
  p.company_name as partner_name,
  coalesce(sum(m.given - m.taken) filter (where m.status = 'confirmed'), 0) as balance,
  count(*)       filter (where m.status = 'pending')                        as pending_count
from partners p
join pl_movements m on m.partner_id = p.id
group by p.id, p.company_name;

create or replace view pl_v_client_locations as
select
  m.client_id,
  m.location_id,
  l.name as location_name,
  coalesce(sum(m.given - m.taken) filter (where m.status = 'confirmed'), 0) as balance,
  count(*)       filter (where m.status = 'pending')                        as pending_count
from pl_movements m
left join locations l on l.id = m.location_id
where m.client_id is not null
group by m.client_id, m.location_id, l.name;
```

- [ ] **Step 2: Έλεγχος πληρότητας με το spec**

Διάβασε το `docs/PALLETS_ARCHITECTURE.md` §5 δίπλα στο νέο αρχείο και τσέκαρε: όλα τα πεδία του §5.1 υπάρχουν, τα 7 event types σωστά, το one_counterparty constraint ίδιο, τα 3 views με τα ονόματα του §5.2. Καμία εκτέλεση SQL εδώ — η εφαρμογή στη βάση γίνεται στο Task 6 από τον owner.

- [ ] **Step 3: Commit**

```bash
git add worker/migrations/003_pallets_schema.sql
git commit -m "feat(pallets): migration 003 — pl_movements + balance views (Φ1)"
git push
```

---

### Task 2: Worker — permissions map, skeleton, GET movements, lookups

**Files:**
- Modify: `worker/src/index.js` — δύο σημεία: (α) νέος κώδικας αμέσως ΜΕΤΑ το `__name(handleCosts, "handleCosts");` (γραμμή ~2556), (β) route hook μέσα στο `fetch` αμέσως ΜΕΤΑ το μπλοκ `if (url.pathname.startsWith("/costs/"))` (γραμμή ~2596).

**Interfaces:**
- Consumes: υπάρχοντα helpers του αρχείου — `getCaller(request, env) → {sub, role}|null`, `dbSelect(env, table, {select, order, limit})`, `dbSelectRaw(env, table, URLSearchParams) → {rows}`, `jsonOk(data, origin, env, status=200)`, `jsonError(message, status, origin, env)`.
- Produces: `PL_EVENT_TYPES` (array), `PL_PERMS` (map), `plCan(role, resource, method)`, `handlePallets(request, url, origin, env)` — τα Tasks 3–5 προσθέτουν branches ΜΕΣΑ στο try του `handlePallets`.

- [ ] **Step 1: Πρόσθεσε το skeleton μετά το handleCosts**

Ακριβώς μετά τη γραμμή `__name(handleCosts, "handleCosts");` πρόσθεσε:

```js
// src/routes/pallets.js — ΠΑΛΕΤΕΣ Φ1 (PALLETS_ARCHITECTURE §5/§6)
// Ημερολόγιο pl_movements: CRUD + confirm/reverse + balances.
// taken/given ΠΑΝΤΑ από τη δική μας σκοπιά (taken = πήραμε εμείς).
var PL_EVENT_TYPES = ["LOADING", "DELIVERY", "PARTNER_PICKUP", "PARTNER_DROPOFF", "RETURN_OUT", "RETURN_IN", "ADJUSTMENT"];
var PL_PERMS = {
  owner:      { movements: ["GET", "POST", "PATCH", "DELETE"], confirm: ["POST"], reverse: ["POST"], balances: ["GET"], lookups: ["GET"] },
  dispatcher: { movements: ["GET", "POST", "PATCH", "DELETE"], confirm: ["POST"], reverse: ["POST"], balances: ["GET"], lookups: ["GET"] },
  warehouse:  { movements: ["GET", "POST", "PATCH"], confirm: ["POST"], balances: ["GET"], lookups: ["GET"] },
  accountant: { movements: ["GET"], balances: ["GET"], lookups: ["GET"] },
  management: { balances: ["GET"] }
};
function plCan(role, resource, method) {
  const r = PL_PERMS[role];
  return !!(r && r[resource] && r[resource].includes(method));
}
async function handlePallets(request, url, origin, env) {
  const caller = await getCaller(request, env);
  if (!caller) return jsonError("Unauthorized", 401, origin, env);
  const seg = url.pathname.split("/").filter(Boolean);
  // /pallets/movements            → resource=movements
  // /pallets/movements/:id        → recId
  // /pallets/movements/:id/confirm|reverse → action (δικό του permission resource)
  const action = seg[3] || null;
  const resource = action === "confirm" || action === "reverse" ? action : seg[1] || "";
  const recId = seg[2] || null;
  const method = request.method;
  if (!plCan(caller.role, resource, method)) {
    return jsonError("Forbidden", 403, origin, env);
  }
  try {
    // ---- GET /pallets/lookups (dropdowns: πελάτες, partners, τοποθεσίες) ----
    if (resource === "lookups" && method === "GET") {
      const [clients, partners, locations] = await Promise.all([
        dbSelect(env, "clients", { select: "id,company_name,active", order: "company_name.asc", limit: 500 }),
        dbSelect(env, "partners", { select: "id,company_name,active", order: "company_name.asc", limit: 500 }),
        dbSelect(env, "locations", { select: "id,name", order: "name.asc", limit: 1e3 })
      ]);
      return jsonOk({ clients, partners, locations }, origin, env);
    }
    // ---- GET /pallets/movements?status=&counterparty_type=&client_id=&partner_id=&event_type=&from=&to=&order_stop_id=&cons_load_id= ----
    if (resource === "movements" && method === "GET" && !recId) {
      const q = url.searchParams;
      const params = new URLSearchParams();
      params.set("select", "*");
      params.set("order", "movement_date.desc,id.desc");
      params.set("limit", "300");
      if (q.get("status")) params.append("status", `eq.${q.get("status")}`);
      if (q.get("counterparty_type")) params.append("counterparty_type", `eq.${q.get("counterparty_type")}`);
      if (q.get("client_id")) params.append("client_id", `eq.${q.get("client_id")}`);
      if (q.get("partner_id")) params.append("partner_id", `eq.${q.get("partner_id")}`);
      if (q.get("event_type")) params.append("event_type", `eq.${q.get("event_type")}`);
      if (q.get("order_stop_id")) params.append("order_stop_id", `eq.${q.get("order_stop_id")}`);
      if (q.get("cons_load_id")) params.append("cons_load_id", `eq.${q.get("cons_load_id")}`);
      if (q.get("from")) params.append("movement_date", `gte.${q.get("from")}`);
      if (q.get("to")) params.append("movement_date", `lte.${q.get("to")}`);
      const { rows } = await dbSelectRaw(env, "pl_movements", params);
      return jsonOk({ records: rows }, origin, env);
    }
    return jsonError("Not found", 404, origin, env);
  } catch (e) {
    console.error(`PALLETS ${method} ${url.pathname}`, e.message);
    return jsonError("Pallets request failed", 500, origin, env);
  }
}
__name(handlePallets, "handlePallets");
```

- [ ] **Step 2: Πρόσθεσε το route hook στο fetch**

Μέσα στο `index_default.fetch`, ακριβώς μετά το μπλοκ:

```js
    if (url.pathname.startsWith("/costs/")) {
      return handleCosts(request, url, origin, env);
    }
```

πρόσθεσε:

```js
    if (url.pathname.startsWith("/pallets/")) {
      return handlePallets(request, url, origin, env);
    }
```

- [ ] **Step 3: Έλεγχος σύνταξης**

Run: `node --check worker/src/index.js`
Expected: καμία έξοδος (exit 0).

- [ ] **Step 4: Smoke test με wrangler dev**

Run (από το `worker/`): `npx wrangler dev --local` και σε δεύτερο shell:

```bash
curl -s http://localhost:8787/pallets/movements
```

Expected: `{"error":"Unauthorized"}` με status 401 (δεν υπάρχει token — αυτό αποδεικνύει ότι το route έδεσε και ο guard δουλεύει). Επίσης `curl -s http://localhost:8787/health` → `{"status":"ok",...}`. Σταμάτα το wrangler dev.

- [ ] **Step 5: Commit**

```bash
git add worker/src/index.js
git commit -m "feat(pallets): /pallets skeleton — perms map, GET movements, lookups (Φ1)"
git push
```

---

### Task 3: POST / PATCH / DELETE movements (κανόνες pending)

**Files:**
- Modify: `worker/src/index.js` — μέσα στο try του `handlePallets`, ΠΡΙΝ το `return jsonError("Not found", ...)`.

**Interfaces:**
- Consumes: `ctPick(body, fields)` (γενικό helper, ήδη στο αρχείο), `dbInsert`, `dbSelectRaw`, `ctDbPatch(env, table, filter, patch)` (γενικό PATCH helper των costs — επαναχρησιμοποιείται αυτούσιο), `audit(env, {actor, role, action, table, recordId, before, after})`.
- Produces: `PL_FIELDS` (array με τα γραπτά πεδία) και `plValidate(row) → string|null` — το Task 4 καλεί την `plValidate` στο confirm.

- [ ] **Step 1: Πρόσθεσε PL_FIELDS + plValidate πάνω από το handlePallets**

Ακριβώς μετά τον ορισμό του `plCan` (και πριν το `async function handlePallets`):

```js
var PL_FIELDS = ["movement_date", "counterparty_type", "client_id", "partner_id", "location_id", "event_type", "taken", "given", "order_stop_id", "cons_load_id", "sheet_url", "sheet_source", "reversal_of", "reason", "notes"];
function plValidate(row) {
  if (!row.movement_date) return "movement_date required";
  if (!PL_EVENT_TYPES.includes(row.event_type)) return "Unknown event_type";
  if (row.counterparty_type === "CLIENT") {
    if (!row.client_id || row.partner_id) return "CLIENT movement needs client_id only";
  } else if (row.counterparty_type === "PARTNER") {
    if (!row.partner_id || row.client_id) return "PARTNER movement needs partner_id only";
  } else return "counterparty_type must be CLIENT or PARTNER";
  const taken = row.taken ?? 0, given = row.given ?? 0;
  if (!Number.isInteger(taken) || taken < 0 || !Number.isInteger(given) || given < 0) {
    return "taken/given must be non-negative integers";
  }
  if (row.event_type === "ADJUSTMENT" && !row.reason) return "ADJUSTMENT requires reason";
  return null;
}
```

- [ ] **Step 2: Πρόσθεσε τα τρία branches μέσα στο try**

Μετά το μπλοκ GET movements (και πριν το τελικό `return jsonError("Not found", ...)`):

```js
    // ---- POST /pallets/movements (χειροκίνητη κίνηση ή feeder Φ2) ----
    // Default: pending. Με body.confirm===true γράφεται κατευθείαν confirmed
    // (μόνο ρόλοι με perm confirm) — για την αυτόματη DELIVERY της Φ2.
    if (resource === "movements" && method === "POST" && !recId) {
      const body = await request.json().catch(() => null);
      if (!body) return jsonError("Invalid request", 400, origin, env);
      const row = ctPick(body, PL_FIELDS);
      row.taken = row.taken ?? 0;
      row.given = row.given ?? 0;
      const err = plValidate(row);
      if (err) return jsonError(err, 400, origin, env);
      if (row.event_type === "ADJUSTMENT" && caller.role !== "owner") {
        return jsonError("ADJUSTMENT is owner-only", 403, origin, env);
      }
      row.created_by = caller.sub;
      if (body.confirm === true) {
        if (!plCan(caller.role, "confirm", "POST")) return jsonError("Forbidden", 403, origin, env);
        // Ίδιοι έλεγχοι με το /confirm — το direct confirm ΔΕΝ παρακάμπτει την πύλη δελτίου.
        const needsSheet = row.event_type !== "DELIVERY" && row.event_type !== "ADJUSTMENT";
        if (needsSheet && !row.sheet_source) {
          return jsonError("Δελτίο παλετών required (sheet_source) before confirm", 400, origin, env);
        }
        if (row.taken + row.given === 0 && row.event_type !== "ADJUSTMENT") {
          return jsonError("taken + given must be > 0", 400, origin, env);
        }
        row.status = "confirmed";
        row.confirmed_by = caller.sub;
        row.confirmed_at = new Date().toISOString();
      }
      const created = await dbInsert(env, "pl_movements", row);
      await audit(env, { actor: caller.sub, role: caller.role, action: "create", table: "pl_movements", recordId: String(created.id), after: created });
      return jsonOk({ record: created }, origin, env, 201);
    }
    // ---- PATCH /pallets/movements/:id (ΜΟΝΟ pending) ----
    if (resource === "movements" && method === "PATCH" && recId) {
      const body = await request.json().catch(() => null);
      if (!body) return jsonError("Invalid request", 400, origin, env);
      const before = await dbSelectRaw(env, "pl_movements", new URLSearchParams({ id: `eq.${recId}`, select: "*" }));
      if (!before.rows.length) return jsonError("Not found", 404, origin, env);
      if (before.rows[0].status !== "pending") {
        return jsonError("Only pending movements can be edited — use reverse for confirmed", 409, origin, env);
      }
      const patch = ctPick(body, PL_FIELDS);
      if (!Object.keys(patch).length) return jsonError("Nothing to update", 400, origin, env);
      const merged = { ...before.rows[0], ...patch };
      const err = plValidate(merged);
      if (err) return jsonError(err, 400, origin, env);
      if (merged.event_type === "ADJUSTMENT" && caller.role !== "owner") {
        return jsonError("ADJUSTMENT is owner-only", 403, origin, env);
      }
      const updated = await ctDbPatch(env, "pl_movements", `id=eq.${encodeURIComponent(recId)}`, patch);
      await audit(env, { actor: caller.sub, role: caller.role, action: "update", table: "pl_movements", recordId: String(recId), before: before.rows[0], after: updated });
      return jsonOk({ record: updated }, origin, env);
    }
    // ---- DELETE /pallets/movements/:id (ΜΟΝΟ pending — δεν μέτρησε ποτέ) ----
    if (resource === "movements" && method === "DELETE" && recId) {
      const before = await dbSelectRaw(env, "pl_movements", new URLSearchParams({ id: `eq.${recId}`, select: "*" }));
      if (!before.rows.length) return jsonError("Not found", 404, origin, env);
      if (before.rows[0].status !== "pending") {
        return jsonError("Confirmed movements are never deleted — use reverse", 409, origin, env);
      }
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/pl_movements?id=eq.${encodeURIComponent(recId)}`, {
        method: "DELETE",
        headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` }
      });
      if (!res.ok) return jsonError("Delete failed", 500, origin, env);
      await audit(env, { actor: caller.sub, role: caller.role, action: "delete", table: "pl_movements", recordId: String(recId), before: before.rows[0] });
      return jsonOk({ deleted: true }, origin, env);
    }
```

- [ ] **Step 3: Έλεγχος σύνταξης**

Run: `node --check worker/src/index.js`
Expected: exit 0, καμία έξοδος.

- [ ] **Step 4: Commit**

```bash
git add worker/src/index.js
git commit -m "feat(pallets): POST/PATCH/DELETE movements με κανόνες pending (Φ1)"
git push
```

---

### Task 4: Confirm & Reverse (η μηχανή καταστάσεων)

**Files:**
- Modify: `worker/src/index.js` — μέσα στο try του `handlePallets`, μετά τα branches του Task 3, πριν το τελικό 404.

**Interfaces:**
- Consumes: `plValidate` (Task 3), `ctDbPatch`, `dbInsert`, `dbSelectRaw`, `audit`.
- Produces: `POST /pallets/movements/:id/confirm` και `POST /pallets/movements/:id/reverse` — το Φ4 gate (Invoiced/PnL) θα ελέγχει `status==='confirmed'` μέσω του GET του Task 2.

- [ ] **Step 1: Πρόσθεσε τα δύο branches**

```js
    // ---- POST /pallets/movements/:id/confirm ----
    // Πύλη δελτίου (spec §4): κάθε χειροκίνητο event θέλει sheet_source.
    // Εξαιρέσεις: DELIVERY (αυτόματη net 0) και ADJUSTMENT (θέλει reason).
    if (action === "confirm" && method === "POST" && recId) {
      const cur = await dbSelectRaw(env, "pl_movements", new URLSearchParams({ id: `eq.${recId}`, select: "*" }));
      if (!cur.rows.length) return jsonError("Not found", 404, origin, env);
      const m = cur.rows[0];
      if (m.status !== "pending") return jsonError("Only pending movements can be confirmed", 409, origin, env);
      const err = plValidate(m);
      if (err) return jsonError(err, 400, origin, env);
      const needsSheet = m.event_type !== "DELIVERY" && m.event_type !== "ADJUSTMENT";
      if (needsSheet && !m.sheet_source) {
        return jsonError("Δελτίο παλετών required (sheet_source) before confirm", 400, origin, env);
      }
      if (m.taken + m.given === 0 && m.event_type !== "ADJUSTMENT") {
        return jsonError("taken + given must be > 0", 400, origin, env);
      }
      const updated = await ctDbPatch(env, "pl_movements", `id=eq.${encodeURIComponent(recId)}`, {
        status: "confirmed",
        confirmed_by: caller.sub,
        confirmed_at: new Date().toISOString()
      });
      await audit(env, { actor: caller.sub, role: caller.role, action: "confirm", table: "pl_movements", recordId: String(recId), before: m, after: updated });
      return jsonOk({ record: updated }, origin, env);
    }
    // ---- POST /pallets/movements/:id/reverse  {reason, replacement?} ----
    // Αντιλογισμός: η αρχική → 'reversed' (εκτός υπολοίπου, μένει στο ιστορικό).
    // Προαιρετικό body.replacement = νέα σωστή εγγραφή (pending) με reversal_of.
    if (action === "reverse" && method === "POST" && recId) {
      const body = await request.json().catch(() => null);
      if (!body || !body.reason || !String(body.reason).trim()) {
        return jsonError("reason required for reverse", 400, origin, env);
      }
      const cur = await dbSelectRaw(env, "pl_movements", new URLSearchParams({ id: `eq.${recId}`, select: "*" }));
      if (!cur.rows.length) return jsonError("Not found", 404, origin, env);
      const m = cur.rows[0];
      if (m.status !== "confirmed") return jsonError("Only confirmed movements can be reversed", 409, origin, env);
      const updated = await ctDbPatch(env, "pl_movements", `id=eq.${encodeURIComponent(recId)}`, {
        status: "reversed",
        reason: String(body.reason).trim()
      });
      let replacement = null;
      if (body.replacement && typeof body.replacement === "object") {
        const row = ctPick(body.replacement, PL_FIELDS);
        row.taken = row.taken ?? 0;
        row.given = row.given ?? 0;
        row.reversal_of = m.id;
        row.created_by = caller.sub;
        const err = plValidate(row);
        if (err) return jsonError(`replacement: ${err}`, 400, origin, env);
        if (row.event_type === "ADJUSTMENT" && caller.role !== "owner") {
          return jsonError("ADJUSTMENT is owner-only", 403, origin, env);
        }
        replacement = await dbInsert(env, "pl_movements", row);
      }
      await audit(env, { actor: caller.sub, role: caller.role, action: "reverse", table: "pl_movements", recordId: String(recId), before: m, after: { ...updated, replacement_id: replacement ? replacement.id : null } });
      return jsonOk({ record: updated, replacement }, origin, env);
    }
```

- [ ] **Step 2: Έλεγχος σύνταξης**

Run: `node --check worker/src/index.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add worker/src/index.js
git commit -m "feat(pallets): confirm + reverse — μηχανή καταστάσεων με αντιλογισμό (Φ1)"
git push
```

---

### Task 5: Balances endpoints

**Files:**
- Modify: `worker/src/index.js` — μέσα στο try του `handlePallets`, μετά τα branches του Task 4, πριν το τελικό 404.

**Interfaces:**
- Consumes: views `pl_v_balance_clients`, `pl_v_balance_partners`, `pl_v_client_locations` (Task 1), `dbSelectRaw`.
- Produces: `GET /pallets/balances?type=clients|partners` και `GET /pallets/balances/clients/:id` (drill-down ανά σημείο) — αυτά καταναλώνει το Ισοζύγιο UI (Φ3).

- [ ] **Step 1: Πρόσθεσε τα δύο branches**

```js
    // ---- GET /pallets/balances/clients/:id (drill-down ανά σημείο) ----
    // ΠΡΙΝ το γενικό branch: εδώ recId="clients" και seg[3]=<client id>.
    if (resource === "balances" && method === "GET" && recId === "clients" && seg[3]) {
      const params = new URLSearchParams();
      params.set("select", "*");
      params.set("client_id", `eq.${seg[3]}`);
      params.set("order", "balance.asc");
      const { rows } = await dbSelectRaw(env, "pl_v_client_locations", params);
      return jsonOk({ records: rows }, origin, env);
    }
    // ---- GET /pallets/balances?type=clients|partners ----
    if (resource === "balances" && method === "GET" && !recId) {
      const type = url.searchParams.get("type") === "partners" ? "partners" : "clients";
      const view = type === "partners" ? "pl_v_balance_partners" : "pl_v_balance_clients";
      const params = new URLSearchParams();
      params.set("select", "*");
      params.set("order", "balance.asc");
      const { rows } = await dbSelectRaw(env, view, params);
      return jsonOk({ type, records: rows }, origin, env);
    }
```

Σημείωση ορθότητας routing: στο path `/pallets/balances/clients/7` το skeleton δίνει `recId="clients"` και `action=seg[3]="7"` — το `action` ΔΕΝ είναι confirm/reverse, άρα το permission resource παραμένει `balances` (σωστό). Το drill-down branch μπαίνει πρώτο για σαφήνεια· το γενικό απαιτεί `!recId` οπότε δεν συγκρούονται.

- [ ] **Step 2: Έλεγχος σύνταξης + τελικό τοπικό smoke**

Run: `node --check worker/src/index.js` → exit 0.
Run (από `worker/`): `npx wrangler dev --local` και:

```bash
curl -s http://localhost:8787/pallets/balances
```

Expected: `{"error":"Unauthorized"}` 401 (route δεμένο, guard ενεργός).

- [ ] **Step 3: Commit**

```bash
git add worker/src/index.js
git commit -m "feat(pallets): balances endpoints από τα pl_v_* views (Φ1)"
git push
```

---

### Task 6: Εφαρμογή στη βάση, deploy & end-to-end επαλήθευση (βήματα OWNER)

**Files:**
- Modify: `docs/PALLETS_ARCHITECTURE.md` (ενημέρωση §6 για τη σημασιολογία αντιλογισμού + status Φ1)
- Create: `docs/PALLETS_SCHEMA_APPLIED_2026-08-XX.md` (μετά την εφαρμογή — ίδιο πρότυπο με COSTS_SCHEMA_APPLIED)

**Interfaces:**
- Consumes: migration 003 (Task 1), πλήρες `/pallets/*` API (Tasks 2–5).
- Produces: live schema + live routes· την επιβεβαίωση καταναλώνει η Φ2 (feeders).

- [ ] **Step 1: Εφαρμογή migration (owner, μέσω Chrome)**

```bash
pbcopy < worker/migrations/003_pallets_schema.sql
```

Μετά: Supabase SQL editor (project gatejgbpyodlepkvqkgf) → paste από clipboard → Run. ΠΟΤΕ πληκτρολόγηση του SQL (αλλοιώνει newlines).

- [ ] **Step 2: Verification queries στο SQL editor**

```sql
select code, status from pl_movements limit 5;          -- [] κενό, χωρίς error
select * from pl_v_balance_clients limit 5;             -- [] κενό, χωρίς error
select * from pl_v_balance_partners limit 5;            -- [] κενό, χωρίς error
select * from pl_v_client_locations limit 5;            -- [] κενό, χωρίς error
```

Expected: όλα τρέχουν χωρίς σφάλμα και γυρνούν 0 γραμμές.

- [ ] **Step 3: Deploy Worker (owner)**

```bash
cd worker && npx wrangler deploy
```

Expected: deploy του `petras-tms-backend-staging` χωρίς error.

- [ ] **Step 4: Post-deploy smoke (με πραγματικό login)**

Πάρε token από το app (login ως dispatcher/owner → localStorage) ή μέσω `POST /auth/login`. Το base URL είναι το `PROXY_URL` από το `config.js` (το *.workers.dev του petras-tms-backend-staging):

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$PROXY_URL/pallets/movements"
```

Expected: `{"records":[]}`. Μετά πλήρης κύκλος:
1. `POST /pallets/movements` με `{"movement_date":"2026-08-11","counterparty_type":"CLIENT","client_id":<id>,"event_type":"LOADING","taken":33,"given":10,"sheet_source":"MANUAL"}` → 201, status pending.
2. `GET /pallets/balances` → πελάτης με balance 0, pending_count 1 (τα pending ΔΕΝ μετράνε).
3. `POST /pallets/movements/<id>/confirm` → 200, status confirmed.
4. `GET /pallets/balances` → balance −23 ✓ (οφείλουμε 23).
5. `POST /pallets/movements/<id>/reverse` με `{"reason":"δοκιμή Φ1"}` → 200, status reversed.
6. `GET /pallets/balances` → balance 0 ✓.
7. `DELETE` στο ίδιο id → 409 (reversed δεν σβήνεται) ✓.

- [ ] **Step 5: Ενημέρωση docs**

Στο `docs/PALLETS_ARCHITECTURE.md` §6, αντικατέστησε τον κανόνα του αντιλογισμού ώστε να λέει: «αντιλογισμός = η αρχική → `reversed` (εκτός υπολοίπου, μένει στο ιστορικό, reason υποχρεωτικό) + προαιρετική νέα σωστή εγγραφή με `reversal_of`». Γράψε το `docs/PALLETS_SCHEMA_APPLIED_2026-08-XX.md` με ό,τι ΟΝΤΩΣ δημιουργήθηκε (πρότυπο: COSTS_SCHEMA_APPLIED_2026-08-10.md).

- [ ] **Step 6: Commit**

```bash
git add docs/PALLETS_ARCHITECTURE.md docs/PALLETS_SCHEMA_APPLIED_*.md
git commit -m "docs(pallets): Φ1 backend live — schema applied + διευκρίνιση αντιλογισμού"
git push
```
