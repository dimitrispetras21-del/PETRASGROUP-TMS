# Φ2 · Η ανατομία του Worker όπου «κουμπώνει» το `/plan/*`

> Μόνο ανάγνωση, 22/10/2026. Πηγή: `origin/main` 97798ba8 (`worker/src/index.js`, 5.836 γραμμές).
> Οι αριθμοί γραμμών του tech draft (`62d09f9d`) **ισχύουν ακόμη**: `git diff 62d09f9d origin/main -- worker/src/index.js` είναι κενό.
> Βάση: ένα SELECT στο `pg_proc` (§4.3). Καμία εγγραφή, κανένα deploy, κανένα commit.
> Τεστ αφετηρίας: `node --test worker/test/*.test.mjs worker/src/rt-rules.test.mjs` → **189/189 pass**.
> Το `node --test worker/test/` (με φάκελο, όχι glob) αποτυγχάνει στο Node 24 («test failed» στο `worker/test:1:1`), άρα το πλάνο γράφει την εντολή με glob.

---

## 0. Ποια πηγή του Worker είναι ζωντανή (κανόνας μίας πηγής)

| Τι | Τιμή | Απόδειξη |
|---|---|---|
| Τελευταίο καταγεγραμμένο deploy | **Worker 2f2851c0**, 7/10 βράδυ, από `deploy/worker-temp-cmr` @ **bb8ba2db**· επαναφορά = `wrangler rollback c358f99a` | `docs/DECISION_LOG.md:2943-2946` |
| Sync στο main | `491ea7ec` «συγχρονισμός πηγής … Worker 2f2851c0». `git diff --stat origin/deploy/worker-temp-cmr 491ea7ec -- worker/src worker/test` = **κενό** | git |
| Main μετά το sync | +24 γραμμές στο `index.js` (VD 19/10: `GET /costs/rt` δέχεται `driver_id`, `trailer_id`, `order_ids`, γρ. 3756-3779) + `costs-rt-filter.test.mjs` + `fixtures/expect-vectors.*` (e7b82175) | `git diff origin/deploy/worker-temp-cmr origin/main -- worker/` |
| Έγινε deploy η αλλαγή της VD 19/10; | **Δεν βρέθηκε καταγραφή.** Και τα δύο session τη γράφουν ως «Χρειάζεται deploy του Worker από το `main`» | `docs/sessions/2026-10-19-vd-nick-rt-card-filter.md:6`, `…-rt-find-order.md:5` |
| Branches Worker που ΔΕΝ είναι ζωντανά | `deploy/worker-presence` (WP8, `_expect` + `POST /presence`, θέλει SQL 068), `deploy/worker-stop-delay` (067, `15458d57`). Κανένα δεν είναι πρόγονος του main | DECISION_LOG:3328-3341· `docs/weekly-intl-redesign/TECH_DESIGN.md:991` |
| Κάτοχος αλυσίδας v5 | `deploy/worker-plan` (Φ2→Φ3→Φ5) = dimitris, owner 22/10. **Το branch δεν υπάρχει ακόμη στο origin** | DECISION_LOG:4049, `git ls-remote` |

**Συμπέρασμα:** το `worker/src` του main **δεν** είναι ίδιο με το ζωντανό. Είναι το ζωντανό + 24 γραμμές που δεν έχουν ανέβει (προσθετικές: τρεις προαιρετικές παράμετροι σε GET, καμία αλλαγή όταν λείπουν).

**Παγίδα για τον κανόνα 2 (`merge-base --is-ancestor`):** το `bb8ba2db` **δεν** είναι πρόγονος του main, γιατί το sync έγινε με αντιγραφή αρχείων (`491ea7ec`) και όχι με merge. Άρα:
- `git merge-base --is-ancestor origin/deploy/worker-temp-cmr <κλάδος>` αποτυγχάνει για κάθε κλάδο που ξεκινά από το main.
- Ο έλεγχος πρέπει να γίνει **σε περιεχόμενο**, με την πρόταση: `git diff origin/deploy/worker-temp-cmr <κλάδος> -- worker/src/index.js` = μόνο προσθήκες (οι 24 της VD + η Φ2).
- Εναλλακτικά: `491ea7ec` ως «ζωντανή πηγή» στο `--is-ancestor`, αφού είναι byte-ίδιο με το `bb8ba2db` στο `worker/src` και στο `worker/test`.

**Απόφαση για το πλάνο Φ2 (owner):**
- (α) `deploy/worker-plan` από **`origin/main`**. Το πρώτο deploy της αλυσίδας ανεβάζει **και** τις 24 γραμμές της VD (δύο αλλαγές σε ένα deploy, αρχή 7).
- (β) Πρώτα ένα μικρό deploy των 24 γραμμών από το main, με φρουρό, sync και έλεγχο, και μετά η Φ2 από εκεί.

Και στις δύο, πριν από το deploy κατεβαίνει το ζωντανό bundle από το CF API, για να επιβεβαιωθεί ότι είναι ακόμη το 2f2851c0.

---

## 1. Πώς είναι φτιαγμένο το αρχείο (bundling)

- Το `worker/src/index.js` **δεν** είναι πια σκέτο bundle. Είναι ESM πηγή με `import`. Το wrangler (esbuild) το πακετάρει μαζί με:
  - `./ledger-rules.mjs`, `./ledger-month.mjs`, `./rt-rules.mjs`, `./costs-line-rules.mjs`, `./import-rules.mjs`
  - `../../core/dkv-parser.js` (CJS)
  - `@cloudflare/puppeteer`, για το οποίο χρειάζεται `npm install` στο `worker/` (`index.js:1-14`, `worker/package.json`)
- Τα σχόλια-ενότητες `// src/lib/cors.js`, `// src/middleware/rbac.js` κ.λπ. είναι κατάλοιπα του παλιού bundle. Οργανώνουν το αρχείο αλλά δεν είναι χωριστά αρχεία.
- Σύμβαση: κάθε συνάρτηση ακολουθείται από `__name(fn, "fn")` (`index.js:16-17`). Δεν είναι υποχρεωτικό, γιατί τα `COSTS_PERMS`, `ctCan` και `plCan` δεν το έχουν.
- **`var` και `const` στο ανώτατο επίπεδο.** Οι χάρτες δικαιωμάτων γράφονται `var` (`PERMISSIONS` :451, `COSTS_PERMS` :3498, `PL_PERMS` :5229, `TABLES` :899). Οι πίνακες ελληνικών κειμένων γράφονται `const` (`STOCK_CHECK_TEXT` :3107, `RELAY_RULE_TEXT` :3145, `RELAY_CHECK_TEXT` :3166).
  - **Μετρημένο** με το τοπικό esbuild 0.20.2 (`--bundle --format=esm`): το top-level `const X = {` βγαίνει ως `var X = {` και το `var` μένει `var`. Η μορφή του object μένει (`owner: { board: ["GET"], "vs-state": ["GET"] }`) και τα σχόλια φεύγουν.
  - Άρα το σημάδι `var PLAN_PERMS = {` επιβιώνει στο ζωντανό bundle **μόνο αν το `PLAN_PERMS` χρησιμοποιείται** (από το `planCan`), αλλιώς το esbuild το αφαιρεί ως νεκρό κώδικα.
  - Συνέπεια για τα τεστ: τα τεστ «σηκώνουν» κομμάτια από την **πηγή** με regex. Το `liftVar` (`stock-lots.test.mjs:24-28`) δέχεται `var|const`. Το `local-relay-contract.test.mjs:38-43` όμως ζητά ρητά `const STOCK_CHECK_TEXT`, `const RELAY_RULE_TEXT` και `const RELAY_CHECK_TEXT`.
  - Κάθε νέος χάρτης γράφεται σε μορφή που το regex `(?:var|const) NAME = \{[\s\S]*?\n\};\n` πιάνει: κλείσιμο `};` στη στήλη 0, μόνο του στη γραμμή.

---

## 2. Δρομολόγηση (`index_default.fetch`, `index.js:5761-5833`)

```js
var FACADE_PATH = /^\/v0\/[^/]+\/([^/]+)(?:\/([^/]+))?\/?$/;   // :5759
...
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });          // :5770-5772
    }
    const allowlist = (env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim());
    if (origin && !allowlist.includes(origin)) {
      return jsonError("Origin not allowed", 403, origin, env);           // :5773-5776
    }
...
    if (url.pathname.startsWith("/costs/")) {
      return handleCosts(request, url, origin, env);                      // :5802-5804
    }
    if (url.pathname.startsWith("/pallets/")) {
      return handlePallets(request, url, origin, env);                    // :5805-5807
    }
    if (url.pathname.startsWith("/docs/")) {
      return handleDocs(request, url, origin, env);                       // :5808-5810
    }
    if (url.pathname === "/performance/delivery" && request.method === "GET") { ... }  // :5811
    const facadeMatch = url.pathname.match(FACADE_PATH);                  // :5814
    ...
    return jsonError("Not found", 404, origin, env);                      // :5831
```

- Η σειρά είναι: OPTIONS → origin → `/health` → `/auth/login` → `/audit` → `/app-errors` → `/v1/ai/messages` → `/api/locations` → `/print/pdf` → `/costs/` → `/pallets/` → `/docs/` → `/performance/delivery` → facade → 404.
- **Η θέση του `/plan/`:** μία γραμμή αμέσως μετά το `/costs/` (:5804), όπως λέει το tech draft:
  `if (url.pathname.startsWith("/plan/")) return handlePlan(request, url, origin, env, ctx);`
  Το `ctx` χρειάζεται μόνο αν ο handler θέλει `waitUntil`. Το `handleCosts` δεν το παίρνει.
- Αίτημα **χωρίς** `Origin` header περνά τον έλεγχο origin, που μπλοκάρει μόνο origin εκτός λίστας. Η προστασία είναι το JWT.
- **Δεν υπάρχει top-level try/catch στο `fetch`.** Μια εξαίρεση έξω από το try ενός handler γίνεται CF 1101 χωρίς CORS headers, και ο browser τη βλέπει ως «network error». Γι' αυτό το `handleCosts` τυλίγει όλο το σώμα του σε try (:3565 → catch :4894-4897 → `jsonError("Costs request failed", 500)`). Το `handlePlan` πρέπει να κάνει το ίδιο.
- Facade: άγνωστο `tableId` → `tableConfig` = null → **404** «Table not available on this backend» (:2441-2444, :2619-2620). Οι πίνακες v5 **δεν** μπαίνουν στο `TABLES`, όπως ορίζει το tech draft. Σήμερα το `grep` για `shipments|shipment_pieces|rt_stops|piece_legs|plan_config|plan_notices|PLAN_` στο `index.js` βγάζει **0**.

### 2.1 Ανατομία ενός «οικογενειακού» handler (πρότυπο `handleCosts` :3555)

```js
async function handleCosts(request, url, origin, env) {
  const caller = await getCaller(request, env);
  if (!caller) return jsonError("Unauthorized", 401, origin, env);
  const seg = url.pathname.split("/").filter(Boolean);
  const resource = seg[1] || "";
  const recId = seg[2] || null;
  const method = request.method;
  if (!ctCan(caller.role, resource, method)) {
    return jsonError("Forbidden", 403, origin, env);
  }
  try {
    // ---- GET /costs/lookups ... ----
    if (resource === "lookups" && method === "GET") { ... }
    ...
    return jsonError("Not found", 404, origin, env);
  } catch (e) {
    console.error(`COSTS ${method} ${url.pathname}`, e.message);
    return jsonError("Costs request failed", 500, origin, env);
  }
}
```

- 401 χωρίς token, και **πριν** από κάθε κλήση στη βάση.
- 403 όταν το `ctCan` αρνείται, πριν από το try και πριν από κάθε κλήση στη βάση. Τα τεστ το καρφώνουν με `calls.length === 0` (`stock-lots.test.mjs:309-324`).
- Ένα resource που ο ρόλος δεν έχει → 403. Ένα resource που έχει αλλά δεν υλοποιείται → 404 μέσα στο try.
- Το `/pallets/` χρησιμοποιεί άλλη υπο-δρομολόγηση (`index.js:5302-5307`): `action = seg[3]`, και τα `confirm`/`reverse` είναι δικά τους resources στο `PL_PERMS`. Είναι το πρότυπο για ενέργειες όπως `/plan/rt/:id/clear` και `/plan/rt/:id/move-side`.

---

## 3. Auth (JWT, ρόλος)

- `getCaller` (`index.js:148-154`):
  ```js
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return jwtVerify(match[1], env.JWT_SECRET);
  ```
- `jwtVerify` (:86-105): HMAC-SHA256 (`getSigningKey` :64), payload JSON, απορρίπτει μόνο `payload.exp < now` (το `exp` το γράφει πάντα το login). Επιστρέφει όλο το payload.
- Login (:108-146): `POST /rest/v1/rpc/verify_login` με service key → `jwtSign({ sub: user.username, role: user.role, name: user.name, iat, exp: now + 8h })`.
- Στους handlers: **`caller.sub`** = actor (username) και **`caller.role`** = ρόλος. Αυτό είναι το `p_actor` που θα περνά το `/plan/*` στις `plan_*` (πρότυπο: `p_actor: "import:" + caller.sub`, :4265).
- Άγνωστος ρόλος → `PERMISSIONS[role]`, `COSTS_PERMS[role]` ή `PL_PERMS[role]` = undefined → false → 403. Αυτό είναι deny-by-default σε επίπεδο ρόλου.

---

## 4. Δικαιώματα

### 4.1 `PERMISSIONS` (facade, `index.js:451-688`) + `can` (:689-695)

```js
function can(role, table, method) {
  const roleMap = PERMISSIONS[role];
  if (!roleMap) return false;
  const tableRule = roleMap[table] || roleMap["*"];
  if (!tableRule) return false;
  return tableRule.includes(method);
}
```

- **Δεν** είναι deny-by-default για νέους πίνακες: το `"*"` αντικαθιστά (παγίδα 3).
  - owner `"*"`: όλα (:453)
  - management `"*": ["GET"]` (:472)
  - accountant `"*": ["GET"]` (:522)
  - dispatcher και warehouse: **χωρίς** wildcard (:575-582, :664)
- Γι' αυτό οι πίνακες v5 μένουν εκτός `TABLES`. Αν έμπαιναν, θα άνοιγαν αυτόματα για ανάγνωση σε management και accountant.

### 4.2 Χωριστοί χάρτες, deny-by-default ανά resource

| Χάρτης | Γραμμή | Έλεγχος | Σημείωση |
|---|---|---|---|
| `COSTS_PERMS` | `index.js:3498-3527` | `ctCan` :3528-3531 | `warehouse: {}` ρητά· νέο resource = 403 σε όλους μέχρι να μπει γραμμή |
| `PL_PERMS` | `:5229-5248` (+ `gate` :5251, `owner.override` :5252) | `plCan` :5253-5256 | προσθήκες μετά τον ορισμό με βρόχο, κάτι που δεν αντιγράφεται στο `PLAN_PERMS`: μία πηγή, όλα μέσα στο literal |
| `PERF_SCOPES` | `:4918-4922` | `roles: [...]` ανά scope | allow-list ανά scope |
| `PL_READERS` | `:2070` | `cfgForRole` :2071-2081 | allow-list πεδίων P&L |
| `AUDIT_READERS` / `ERROR_READERS` | `:195` / `:372` | — | — |

```js
function ctCan(role, resource, method) {
  const r = COSTS_PERMS[role];
  return !!(r && r[resource] && r[resource].includes(method));
}
```

**`PLAN_PERMS` = ακριβώς το σχήμα του `COSTS_PERMS` + `ctCan`** (tech draft :263). Πρόταση θέσης: αμέσως πριν το `handlePlan`, ως νέα ενότητα `// src/routes/plan.js` μετά το `handleCosts` (κλείνει στο :4899) και πριν το `// src/routes/performance.js` (:4901). Έτσι το σημάδι `var PLAN_PERMS = {` βρίσκεται μία φορά, σε στήλη 0:

```js
var PLAN_PERMS = {
  owner:      { board: ["GET"], "vs-state": ["GET"], orders: ["POST", "PATCH"], rt: ["POST", "PATCH"], ... },
  dispatcher: { ... },
  management: { board: ["GET"], "vs-state": ["GET"] },
  accountant: { board: ["GET"], "vs-state": ["GET"] },
  warehouse:  { board: ["GET"], "vs-state": ["GET"] }
};
function planCan(role, resource, method) {
  const r = PLAN_PERMS[role];
  return !!(r && r[resource] && r[resource].includes(method));
}
```

- Ο πίνακας ρόλων × resource είναι στο tech draft :265-272. Η γραμμή του warehouse έχει «χωρίς `Price`» στο board, που σημαίνει απογύμνωση πεδίου στον handler.
- Το `partner_rate` επιστρέφεται μόνο σε owner/dispatcher.
- Κανένα `"*"` δεν μπαίνει μέσα στο `PLAN_PERMS`. Ο φρουρός `plan-tables-guard.test.mjs` (tech draft :284) το ελέγχει.

### 4.3 Η βάση (SELECT 22/10)

| Συνάρτηση | Επιστρέφει | SECURITY DEFINER | EXECUTE service_role / anon |
|---|---|---|---|
| `delete_order_cascade` | jsonb | ναι | ναι / όχι |
| `dl_import` | jsonb | ναι | ναι / όχι |
| `log_unknown_field` | bigint | όχι | ναι / όχι |
| `verify_login` | TABLE(...) | ναι | ναι / όχι |
| `plan_chk`, `plan_rt_window_sync` (071) | trigger | ναι | όχι / όχι |
| `plan_rt_problem`, `plan_shipment_problem`, `plan_leg_problem`, `plan_local_loading_problem` (071) | text | όχι | όχι / όχι |

- **Σύγκρουση ονομάτων:** το πρόθεμα `plan_` είναι ήδη πιασμένο από 6 συναρτήσεις του 071. Οι νέες της 072 δεν πρέπει να τις ξαναορίσουν. Η 072 θέλει φρουρό «υπάρχει ήδη».
- **Καμία RPC που καλεί σήμερα ο Worker δεν επιστρέφει `void`.** Το `dbRpc` κάνει `return res.json()` χωρίς να ελέγξει σώμα. Μια συνάρτηση `void` απαντά με κενό σώμα (204 στην PostgREST 12), οπότε το `res.json()` πετάει εξαίρεση **μετά** από επιτυχημένη εγγραφή και ο χρήστης βλέπει 500 για κάτι που έγινε (αρχή 1).
  - ⇒ Κάθε `plan_*` της 072 **`RETURNS jsonb`**, όπως τα `dl_import` και `delete_order_cascade`.

---

## 5. Κλήσεις στη βάση (PostgREST με service key)

Όλα με `apikey` + `Authorization: Bearer ${env.SUPABASE_SERVICE_KEY}` προς `${env.SUPABASE_URL}/rest/v1/...`.

| Helper | Γραμμή | Τι | Κρατά `e.pg`; |
|---|---|---|---|
| `dbSelect(env, table, {select, limit, order})` | :157-175 | GET· `throw new Error("dbSelect …")` | όχι |
| `dbSelectRaw(env, table, URLSearchParams)` | :177-192 | GET· επιστρέφει `{ rows, contentRange }` | όχι (μόνο 200 χαρακτήρες στο message) |
| `dbInsert(env, table, row)` | :239-262 | POST, `Prefer: return=representation`· 1η γραμμή | **ναι** |
| `dbInsertMany(env, table, rows)` | :265-286 | POST πίνακα = **μία συναλλαγή** | **ναι** |
| `dbUpdate(env, table, col, val, patch)` | :323-346 | PATCH `col=eq.val`· 1η γραμμή ή null | **ναι** |
| `ctDbPatch(env, table, filterString, patch)` | :3441-3466 | PATCH με ελεύθερο φίλτρο· `rows[0] \|\| null` | **ναι** |
| **`dbRpc(env, fn, args)`** | **:348-369** | POST `/rest/v1/rpc/<fn>`, `return res.json()` | **ναι** |
| `audit(env, entry)` / `auditMany` | :699-715 / :304-321 | INSERT `audit_log`· η αποτυχία μόνο καταγράφεται | — |

```js
async function dbRpc(env, fn, args) {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/${fn}`;
  const res = await fetch(url, { method: "POST", headers: { apikey: ..., Authorization: ..., "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(`dbRpc ${fn} ${res.status}: ${detail.slice(0, 200)}`);
    // Same as dbInsert: keep the parsed PostgREST error for stockRuleError()
    // (delete_order_cascade soft-deletes the order, which the 057 guard may refuse).
    try { err.pg = JSON.parse(detail); } catch {}
    throw err;
  }
  return res.json();
}
```

- **Το σχήμα του σφάλματος που διαβάζει ο χαρτογράφος:** `e.pg = { code, message, details, hint }`, το σώμα σφάλματος της PostgREST, αναλυμένο από **όλο** το σώμα (όχι από το κομμένο στους 200 χαρακτήρες). Τεστ: `stock-lots.test.mjs:465` «a Greek message longer than the 200-char log cut still maps».
- Σήμερα 3 κλήσεις `dbRpc`:
  - `log_unknown_field` :747
  - `delete_order_cascade` :3377 → `stockRuleError` :3383
  - `dl_import` :4265 → regex `DL_DUPLICATE_FILE` → 409
- **Ατομικότητα:** μία κλήση RPC = μία συναλλαγή. Οι κανόνες του 071 είναι `DEFERRABLE INITIALLY DEFERRED` (constraint triggers `plan_chk_*` :764-780 και τα EXCLUDE του 071b), άρα η άρνηση έρχεται **στο COMMIT** της κλήσης. Μία `plan_*` ανά αίτημα, ποτέ αλυσίδα από δύο RPC (η πρώτη θα είχε γίνει commit).
- **Το actor ταξιδεύει ως παράμετρος:** `p_actor: caller.sub` (πρότυπο :4265). Το audit της αλλαγής το γράφει η `plan_*` στη βάση (tech draft :42). Ο Worker προσθέτει το δικό του `audit()` **μόνο** σε επιτυχία, όπως το `handleOrderCascadeDelete` :3390-3398.

---

## 6. Ο ΕΝΑΣ χαρτογράφος αρνήσεων: `stockRuleError` / `stockRuleResponse`

### 6.1 Πλήρης κώδικας (`index.js:3184-3238`)

```js
function stockRuleError(e) {
  const pg = e && e.pg;
  if (!pg || typeof pg !== "object") return null;
  const code = String(pg.code || "");
  const message = String(pg.message || "");
  const hint = typeof pg.hint === "string" ? pg.hint : "";
  // 'local_relay:' (060): the hint is the marker, whatever SQLSTATE carried
  // it — a relay refusal must never fall back to the 500 path because of a
  // different errcode.
  if (hint.startsWith("local_relay:")) {
    const rc = hint.slice("local_relay:".length).trim();
    return {
      type: "LOCAL_RELAY_RULE",
      code: rc,
      message: Object.prototype.hasOwnProperty.call(RELAY_RULE_TEXT, rc) ? RELAY_RULE_TEXT[rc] : `Η τοπική κίνηση δεν αποθηκεύτηκε (${rc || "χωρίς κωδικό"}): ${message}`
    };
  }
  if (code === "23514") {
    // 'stock:' (057) only under 23514 ...
    if (hint.startsWith("stock:")) return { code: hint.slice(6), message };
    const m = /check constraint "([^"]+)"/.exec(message);
    if (!m) return null;
    if (Object.prototype.hasOwnProperty.call(STOCK_CHECK_TEXT, m[1])) {
      return { code: m[1], message: STOCK_CHECK_TEXT[m[1]] };
    }
    if (Object.prototype.hasOwnProperty.call(RELAY_CHECK_TEXT, m[1])) return { type: "LOCAL_RELAY_RULE", code: m[1], message: RELAY_CHECK_TEXT[m[1]] };
    if (m[1].startsWith("local_moves_")) {
      return { type: "LOCAL_RELAY_RULE", code: m[1], message: `Η τοπική κίνηση δεν αποθηκεύτηκε: κανόνας ${m[1]}` };
    }
    return null;
  }
  if (code === "23505" && /stock_lots_(order|nat)_live/.test(message)) {
    return { code: "lot_exists", message: "Η παραγγελία είναι ήδη παρτίδα" };
  }
  if (code === "23505" && /local_moves_relay_once/.test(message)) {
    return { type: "LOCAL_RELAY_RULE", code: "relay_exists", message: RELAY_RULE_TEXT.relay_exists };
  }
  return null;
}

function stockRuleResponse(rule, origin, env) {
  return jsonOk({ error: { type: rule.type || "STOCK_RULE", code: rule.code, message: rule.message } }, origin, env, 422);
}
```

- Το σχόλιο «ONE mapper» είναι στο :3121-3124.
- Το σχήμα του 422 είναι `{ error: { type, code, message } }`. Το `_atRetry` του front κάνει toast το `error.message` και ξαναδοκιμάζει **μόνο 5xx** (σχόλιο :3227-3234).

### 6.2 Πίνακες κειμένων

| Χάρτης | Γραμμή | Κλειδιά |
|---|---|---|
| `STOCK_CHECK_TEXT` (`const`) | :3107-3114 | 6 CHECK του 057, κατά όνομα constraint |
| `RELAY_RULE_TEXT` (`const`) | :3145-3165 | 17 κωδικοί hint `local_relay:` του 060 (μαζί τα `line_has_relay`, `line_restore` του `dl_entries`) |
| `RELAY_CHECK_TEXT` (`const`) | :3166-3183 | 6 CHECK του 060 + 3 ζωντανά πριν το 060 |
| (στο σώμα) | :3213-3218 | unique indexes 23505: `stock_lots_(order\|nat)_live`, `local_moves_relay_once` |

### 6.3 Κάθε caller (9)

| Γραμμή | Handler | Μετά το map |
|---|---|---|
| :2733 | `handleFacadeCreate` (POST facade, `dbInsert`) | `stockRuleResponse` → 422 |
| :2885 | `facadeBatchCreate` (`dbInsertMany`, μία συναλλαγή) | 422 |
| :2991 | `handleFacadeBatchUpdate` (μία κλήση ανά γραμμή· `auditMany` των προηγούμενων πρώτα) | 422 |
| :3296 | `handleFacadeUpdate` (PATCH ενός) | 422 |
| :3348 | `handleFacadeDelete` (soft delete μέσω `dbUpdate`) | 422 |
| :3383 | `handleOrderCascadeDelete` (`dbRpc delete_order_cascade`) | 422 |
| :4225 | `PATCH /costs/ledger/:id` (`ctDbPatch dl_entries`) | **409**, `jsonError(rule.message, 409)`, δηλαδή string γιατί το `ctFetch` δείχνει `data.error` |
| :4364 | `PATCH /costs/stock-lots/:rec` (`ctDbPatch`) | 422 |
| (ορισμός :3184) | — | — |

Συγγενικοί αλλά χωριστοί μηχανισμοί, που δεν είναι δεύτερος χαρτογράφος κανόνων βάσης:
- `invoiceMarkError` :3066 (422 πριν από τη βάση)
- `schemaBehind060` / `schemaBehind060Response` :3247-3258 (42703 → 503)
- `PATCH /costs/rt/:id` :3847-3854: πιάνει το JSON του μηνύματος → **409 με το μήνυμα της βάσης ως έχει**

### 6.4 Τι αλλάζει η Φ2 στον χαρτογράφο (από το tech draft :276-279, με τα ονόματα της Φ1)

- Νέος κλάδος `hint.startsWith("plan:")` → `{ type: "PLAN_RULE", code, message: PLAN_RULE_TEXT[code] ?? \`… (${code})\` }`.
  - Μπαίνει **πριν** το `if (code === "23514")`, όπως το `local_relay:`, γιατί το `plan_chk` τα στέλνει με 23514 και ο κλάδος του 23514 θα επέστρεφε `null` (το μήνυμα «plan rule broken: …» δεν έχει `check constraint`).
- **Οι κωδικοί `plan:` που σηκώνει ήδη το ζωντανό 071** (27, εξαγωγή από το `071_plan_schema.sql`):
  `chain chain_time hard_delete leg_locked leg_order leg_place leg_stop_dead local_loading_day local_loading_gone local_loading_stop model_locked piece_dead piece_locked piece_parent pieces_alive pieces_sum rt_cancelled rt_not_v2 rt_window shipment_locked side_order split_not_at_hub stop_locked stop_order stop_seq v1_link_on_v2`
  - Μορφή: `raise exception 'plan rule broken: %', prob using errcode = '23514', hint = 'plan:' || split_part(prob, ':', 1)` (071:717-718). Το μήνυμα είναι **ASCII αγγλικό**, όπως στο 060, άρα το ελληνικό ζει στον Worker.
  - Οι κωδικοί της 072 (`no_price`, `truck_busy`, `stale_confirm`, …) προστίθενται στο ίδιο σύνολο.
- **CHECK με όνομα → `PLAN_CHECK_TEXT`.** Ονόματα του 071:
  - `rt_model rt_partner_rate rt_v1_no_window rt_v2_dates rt_v2_scope rt_v2_status rt_v2_window`
  - `shipments_bridge_intl shipments_del shipments_ends shipments_intl_is_bridge shipments_one_parent shipments_pallets shipments_shape shipments_win`
  - `pieces_del pieces_not_own_parent pieces_pallets pieces_split_pair`
  - `rt_stops_del rt_stops_seq rt_stops_side rt_stops_win`
  - `piece_legs_del piece_legs_no piece_legs_two_stops`
  - `plan_notices_desk plan_notices_kind plan_notices_read_pair`
  - `order_stops_via_hub_intl`
- **23505 → unique indexes του 071:** `piece_legs_live_no`, `pl_mov_leg_once`, `shipments_bridge_once`, `locations_one_hub`, `local_moves_nat_loading_once`.
- **23P01 (EXCLUDE του 071b):** `rt_v2_truck_once` → `truck_busy`, `rt_v2_driver_once` → `driver_busy`, κατά όνομα στο message (`conflicting key value violates exclusion constraint "…"`). Είναι DEFERRED, άρα φτάνουν στο COMMIT της RPC.
- **Παγίδα 1, το 071 άλλαξε το `local_moves`:**
  - Ξαναέγραψε `local_moves_kind_chk`, `local_moves_kind_parent` και `local_moves_relay_trailer` (071:338-343) με το νέο είδος `nat_loading`.
  - Πρόσθεσε `local_moves_nat_loading` (CHECK) και `local_moves_nat_loading_once` (unique).
  - Σήμερα:
    - το `local_moves_nat_loading` πέφτει στο γενικό «κανόνας local_moves_nat_loading» (:3209-3211)
    - το `local_moves_nat_loading_once` → `null` → 500
    - τα κείμενα του `RELAY_CHECK_TEXT` για `kind_chk`/`kind_parent` δεν αναφέρουν το νέο είδος
  - Το `local-relay-contract.test.mjs` διαβάζει **μόνο το 060**, οπότε δεν το πιάνει. Η Φ2 χρειάζεται contract test που διαβάζει **071 + 071b + 072**.
- **Παγίδα 2, τα τεστ σηκώνουν τον χαρτογράφο με συγκεκριμένους πίνακες.** Το `stock-lots.test.mjs:36-39` και το `local-relay-contract.test.mjs:38-43` φτιάχνουν το `stockRuleError` με `new Function` και **μόνο** τα 3 σημερινά text tables.
  - Αν ο νέος κώδικας αγγίζει `PLAN_CHECK_TEXT` μέσα στον κλάδο 23514 (που τρέχει για **κάθε** CHECK), τα σημερινά τεστ «everything else → null» (`stock-lots.test.mjs:79-91`, π.χ. `orders_ops_status_check`) θα σκάσουν με `ReferenceError`.
  - ⇒ Η Φ2 ενημερώνει και τις δύο λίστες lift, ή μετακινεί το lift σε έναν κοινό helper.
- **Παγίδα 3, παλιές διαδρομές που ήδη φτάνουν σε κανόνες `plan:`** (σήμερα 0 γραμμές v5, άρα ακόμη απρόσιτες):
  - `POST /costs/rt` που κολλά leg σε RT `model=2` → `ct_rt_legs_v2_guard` → 23514 `plan:v1_link_on_v2` → σήμερα 500 «Costs request failed».
  - `PATCH /costs/rt/:id` σε `model=2` → σήμερα **409 με το αγγλικό** «plan rule broken: …» (:3847-3853). Το tech draft :280 ζητά 409 με ρητό ελληνικό πριν από τη βάση.
  - Facade PATCH/DELETE σε `order_stops` γέφυρας (`plan_chk_bridge_stop` :774) → σήμερα 500 «Failed to update record». Μετά τη Φ2 γίνεται 422 μέσω των callers :3296/:2991/:3348, χωρίς αλλαγή σε αυτούς.

---

## 7. JSON και CORS

```js
function corsHeaders(origin, env) {                          // :20-30
  const allowlist = (env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = allowlist.includes(origin) ? origin : "";
  return { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
           "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
}
function jsonOk(data, origin, env, status = 200) { ... "Content-Type": "application/json", "Cache-Control": "no-store" }   // :32-37
function jsonError(message, status, origin, env) { body: JSON.stringify({ error: message }) ... }                        // :39-44
```

- Δύο μορφές σφάλματος κυκλοφορούν:
  - `{ error: "string" }` (`jsonError`). Το διαβάζουν το `ctFetch` (`modules/costs.js`) και τα `/pallets`.
  - `{ error: { type, code, message } }` (422 του χαρτογράφου). Το διαβάζει το `_atRetry` του `core/api.js`.
- Για το `/plan/*` αποφασίζεται **μία** μορφή, που θα τη διαβάσει το `core/plan-api.js` (Φ4). Το tech draft (:276-283) δίνει 422 με αντικείμενο και 428 για token που λείπει.
- `ALLOWED_ORIGIN` = `https://dimitrispetras21-del.github.io` (`wrangler.toml` `[vars]`).
- Οι μέθοδοι CORS είναι μόνο GET/POST/PATCH/DELETE/OPTIONS. Το `/plan/*` δεν χρειάζεται PUT.

---

## 8. Πώς γράφονται τα τεστ του Worker

- Runner: `node --test` (Node 24), χωρίς dependencies και χωρίς wrangler. Κανένα CI δεν τα τρέχει: το μόνο workflow είναι το `.github/workflows/code-guards.yml` (`tests/check-fail-open.sh`).
- **Επίπεδο 1, κομμάτια «σηκωμένα» από την πηγή** (`stock-lots.test.mjs:24-55`, `local-relay-contract.test.mjs:29-43`, `pl-redact.test.mjs`, `client-formula.test.mjs`): regex στο κείμενο του `index.js` → `new Function(...)`. Ελέγχουν χάρτες (`PERMISSIONS`, `TABLES`, `COSTS_PERMS`) και καθαρές συναρτήσεις. Πάντα στην **πηγή** του deploy, ποτέ σε αντίγραφο.
- **Επίπεδο 2, ο πραγματικός Worker στο Node** (`stock-lots.test.mjs:190-286`, όμοια στα `order-docs`, `local-relay`, `temp-per-cmr`, `costs-rt-filter`):
  ```js
  register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    return next(spec, ctx);
  }`));
  const { default: worker } = await import(pathToFileURL(SRC_PATH).href);
  const env = { JWT_SECRET: 'test-secret-not-real', ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };
  async function token(role, sub = 'tester') { /* HS256 με crypto.subtle */ }
  async function call(role, method, pathAndQuery, body) { ... worker.fetch(req, env, ctx) ... }
  globalThis.fetch = async (url, init = {}) => { /* routes[] + calls[] — unmocked → throw */ };
  ```
  - Το stub της PostgREST καταγράφει κάθε κλήση (`calls`). Ό,τι δεν έχει route **πετάει** «unmocked fetch», οπότε μια απρόσμενη κλήση στη βάση αποτυγχάνει δυνατά.
  - Βοηθοί:
    - `pgError(400, { code: '23514', hint: 'stock:…', message })` για αρνήσεις
    - `auditRows()` για «τίποτα δεν γράφτηκε στο audit σε άρνηση»
    - `calls.length === 0` για «403/400 πριν από κάθε κλήση στη βάση»
  - Για RPC το stub ταιριάζει `table === 'rpc/<fn>'` (:283).
- **Contract test** (`local-relay-contract.test.mjs`): διαβάζει το `.sql` (drafts/ ή κανονικό φάκελο, ποτέ skip όταν λείπει) και αποτυγχάνει:
  - σε hint ή CHECK χωρίς ελληνικό κείμενο
  - σε κλειδί του Worker χωρίς αντίστοιχο στη βάση (νεκρός κώδικας, αρχή 8)
  - Τυπώνει το md5 του αρχείου που έλεγξε.
- **Φρουρός σημαδιών** σε τεστ:
  - `stock-lots.test.mjs:176-184`: οι τρεις
  - `temp-per-cmr.test.mjs:47-54`: οι τρεις + `tblStockLots` + `"Move Kind": "move_kind"` ακριβώς 1
  - Η Φ2 προσθέτει `var PLAN_PERMS = {` = 1 στο ίδιο τεστ ή σε δικό της.
- Τα νέα τεστ που προβλέπει το tech draft (:284-289): `plan-tables-guard.test.mjs`, `plan-contract.test.mjs` (σε 071+071b+072), `plan-perms.test.mjs` (5 ρόλοι × resource × μέθοδος).

---

## 9. Φρουρός deploy: τα σημάδια και πού βρίσκονται

| Σημάδι (CLAUDE.md «Ο WORKER») | Πηγή |
|---|---|
| dispatcher `order_stops: ["GET", "POST", "PATCH", "DELETE"]` | `index.js:593` (μέσα στο `dispatcher:` :575) |
| `"VS CD Date": "cross_dock_date"` (ORDERS) | `index.js:1425` |
| WORKSHOPS `Country`, `Aliases`, `"VAT Number": "tax_id"`, `"Legal Name": "legal_name"` | `index.js:1035-1038` (`tblMiFxbm9ky8PCQi` :1019) |
| `tblStockLots: {` | `index.js:2028` |
| `"Move Kind": "move_kind"` | `index.js:1878` |
| **νέο** `var PLAN_PERMS = {` | προτεινόμενη θέση: νέα ενότητα `// src/routes/plan.js` ανάμεσα στο `handleCosts` (κλείνει :4899) και το `// src/routes/performance.js` (:4901). Μία φορά, στήλη 0, και **σε χρήση** από το `planCan`, αλλιώς το esbuild το σβήνει (§1) |

- Η διαδικασία (CLAUDE.md, `docs/stock-lots/EXECUTION-PHI1.md:35-49`):
  1. Κανόνας 2, merge-base. Εδώ σε περιεχόμενο, βλ. §0.
  2. Αντίγραφο του ζωντανού bundle.
  3. Φρουρός σε περιεχόμενο: bundle προς ανέβασμα **και** ζωντανό μετά, με ξετύλιγμα του multipart. Πριν: `var PLAN_PERMS = {` = **0** στο ζωντανό. Μετά: = 1.
  4. Bindings και secrets 3/3 μέσω CF API.
  5. Smoke: `GET /plan/board` = 200 ως owner, 403 χωρίς token. `POST /plan/orders` ως management = 403.
  6. Sync του `worker/src` και του `worker/test` στο main.
- Το bundle προς ανέβασμα μπορεί να βγει τοπικά με `wrangler deploy --dry-run --outdir <dir>`. Σε αυτό το worktree δεν υπάρχει `worker/node_modules` ούτε wrangler, και το `npm install` χρειάζεται δίκτυο και έγκριση.
- Plain vars στο `wrangler.toml`: `ALLOWED_ORIGIN`, `SUPABASE_URL`, και τα bindings `BROWSER`, `ORDER_DOCS` (R2, eu) πάνω από το `[vars]`. Secrets: `JWT_SECRET`, `SUPABASE_SERVICE_KEY` (το CLAUDE.md λέει και `ANTHROPIC_API_KEY`: 3/3). Η Φ2 **δεν** χρειάζεται νέο binding ή var.

---

## 10. Ανοιχτά για το πλάνο Φ2 (για απόφαση, όχι για λύση εδώ)

1. **Βάση του `deploy/worker-plan`:** από το main (μαζί οι 24 αδοκίμαστες γραμμές της VD) ή πρώτα ξεχωριστό deploy τους (§0). Ο κανόνας 2 εδώ ελέγχεται σε περιεχόμενο ή με `491ea7ec`, όχι με `bb8ba2db`.
2. Μορφή σφάλματος του `/plan/*`: 422 με αντικείμενο (όπως ο facade) ή string (όπως τα `/costs`). Το `core/plan-api.js` της Φ4 θα διαβάσει μία.
3. Ο κλάδος `plan:` μπαίνει πριν τον κλάδο 23514. Τα text tables `PLAN_RULE_TEXT`/`PLAN_CHECK_TEXT` γράφονται `const` δίπλα στα υπάρχοντα (:3107-3183), και ενημερώνονται τα lifts δύο τεστ (§6.4, παγίδα 2).
4. Το contract test πρέπει να καλύπτει και τις αλλαγές του 071 στο `local_moves` (`nat_loading`), που σήμερα δεν ελέγχει κανείς (§6.4, παγίδα 1).
5. Όλες οι `plan_*` γράφονται `RETURNS jsonb` (§4.3), μία RPC ανά αίτημα (DEFERRED κανόνες, §5), `p_actor = caller.sub`.
6. Το `handlePlan` τυλίγει όλο το σώμα του σε try/catch με 500 που ονομάζει τη διαδρομή, γιατί στο `fetch` δεν υπάρχει γενικό catch (§2).
