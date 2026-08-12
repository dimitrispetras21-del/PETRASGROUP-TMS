# Παλέτες Φ2 — Feeders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Οι κινήσεις παλετών να δημιουργούνται αυτόματα από τις ροές orders/status/αναθέσεων, με minimal UI εκκρεμών + χειροκίνητη φόρμα + διόρθωση ανταλλαγής.

**Architecture:** Frontend-driven feeders σε ΕΝΑ νέο αρχείο `core/pallet-feed.js` (idempotent, μη-μπλοκάρον), κουμπωμένο με 1-γραμμα hooks στα υπάρχοντα modules. Ο Worker αποκτά legacy→pg ref resolver (το facade δίνει recXXX ids, το pl_movements θέλει bigint), sheets endpoints (Supabase Storage) και διευρυμένα δικαιώματα accountant. Migration 004: bucket + στήλη `order_id` + FKs σε ON DELETE SET NULL. Spec: `docs/PALLETS_F2_FEEDERS.md` · Γονικό: `docs/PALLETS_ARCHITECTURE.md`.

**Tech Stack:** Vanilla JS SPA · Cloudflare Worker (bundled `worker/src/index.js`) · Supabase Postgres + Storage · χωρίς test framework — verification: `node --check` + browser δοκιμή φορμών + live smoke.

## Global Constraints

- taken/given ΠΑΝΤΑ από τη δική μας σκοπιά· υπόλοιπο = given − taken· θετικό = μας χρωστάει.
- Εθνικό partner leg = διαφανής αγωγός: ΚΑΜΙΑ εγγραφή partner (spec §2). Διεθνές VS leg: PARTNER_PICKUP (export) / PARTNER_DROPOFF (import), μόνο όταν `Is Partner Trip` και `Veroia Switch` και `Pallet Exchange`.
- Feeders: idempotent (έλεγχος πριν από δημιουργία) + μη-μπλοκάρον (αποτυχία → `showErrorToast(...,'warn')`, το order σώζεται κανονικά).
- Confirmed κινήσεις: ΠΟΤΕ edit/delete από feeders — μόνο pending δημιουργούνται/ενημερώνονται/σβήνονται.
- ADJUSTMENT: owner-only (API το επιβάλλει). Accountant (Αλεξία): αποκτά POST/PATCH/confirm/reverse/sheets — ΟΧΙ delete, ΟΧΙ ADJUSTMENT.
- Κάθε task: `git add` + commit + push (CLAUDE.md). Αλλαγή σε module/core αρχείο ⇒ bump `?v=` στο app.html στην ΙΔΙΑ αλλαγή.
- **Ό,τι αγγίζει φόρμες παραγγελιών (orders_intl/orders_natl) ΑΝΟΙΓΕΙ και δοκιμάζεται στον browser πριν το push** (CLAUDE.md — ατύχημα 10/08).
- Ονόματα πεδίων: `'Pallet Exchange'`, `'Veroia Switch'` (χωρίς trailing space), `'Direction'` (Export/Import), `'Is Partner Trip'`, stops: `'Stop Type'`(Loading/Unloading), `'Pallets'`, `'Location'`, `'Client at Stop'`.
- Worker deploy ΜΟΝΟ `wrangler deploy` από `worker/`. SQL στη Supabase ΜΟΝΟ με Monaco setValue/clipboard (όχι πληκτρολόγηση).

---

### Task 1: Migration 004 — bucket, order_id, FKs ON DELETE SET NULL

**Files:**
- Create: `worker/migrations/004_pallets_f2.sql`

**Interfaces:**
- Consumes: `pl_movements` (003), `storage.buckets` (Supabase), `orders(id)`.
- Produces: στήλη `pl_movements.order_id`, bucket `pallet-sheets` — τα χρησιμοποιούν Tasks 2-4. FKs `order_stop_id`/`cons_load_id`/`order_id` γίνονται ON DELETE SET NULL (αλλιώς cascade delete order με confirmed κινήσεις θα ΜΠΛΟΚΑΡΕ σε FK violation).

- [ ] **Step 1: Γράψε το migration**

Πλήρες περιεχόμενο `worker/migrations/004_pallets_f2.sql`:

```sql
-- ============================================================
-- ΠΑΛΕΤΕΣ Φ2 — Migration 004 (PALLETS_F2_FEEDERS §3.3, §5)
-- Τρέξε ΟΛΟΚΛΗΡΟ στο Supabase SQL editor (project gatejgbpyodlepkvqkgf).
-- ============================================================

-- Α. Σύνδεση κίνησης με order (για partner movements που δεν έχουν στάση)
alter table pl_movements add column order_id bigint references orders(id);
create index pl_mov_order on pl_movements (order_id) where order_id is not null;

-- Β. FKs σε ON DELETE SET NULL: το ιστορικό (confirmed) επιβιώνει της
-- διαγραφής order/στάσης — αλλιώς το cascade delete του order μπλοκάρει.
alter table pl_movements drop constraint pl_movements_order_stop_id_fkey;
alter table pl_movements add constraint pl_movements_order_stop_id_fkey
  foreign key (order_stop_id) references order_stops(id) on delete set null;
alter table pl_movements drop constraint pl_movements_cons_load_id_fkey;
alter table pl_movements add constraint pl_movements_cons_load_id_fkey
  foreign key (cons_load_id) references consolidated_loads(id) on delete set null;
alter table pl_movements drop constraint pl_movements_order_id_fkey;
alter table pl_movements add constraint pl_movements_order_id_fkey
  foreign key (order_id) references orders(id) on delete set null;

-- Γ. Private bucket για τα αρχεία δελτίων (upload ΜΟΝΟ μέσω Worker)
insert into storage.buckets (id, name, public)
  values ('pallet-sheets', 'pallet-sheets', false)
  on conflict (id) do nothing;

-- ============================================================
-- ΕΛΕΓΧΟΣ (τρέξε μετά — όλα χωρίς error):
--   select order_id from pl_movements limit 1;
--   select id, public from storage.buckets where id = 'pallet-sheets';  -- 1 γραμμή, public=false
-- ============================================================

-- 004_rollback (ΜΟΝΟ αν χρειαστεί):
-- alter table pl_movements drop column if exists order_id;
-- delete from storage.buckets where id = 'pallet-sheets';
```

- [ ] **Step 2: Έλεγχος ονομάτων constraints**

Τα ονόματα `pl_movements_*_fkey` είναι τα default του Postgres για inline
FKs του 003. Επιβεβαίωσε με ανάγνωση του `worker/migrations/003_pallets_schema.sql`
ότι οι FKs ορίστηκαν inline ΧΩΡΙΣ ρητό όνομα (άρα ισχύει το default). Αν
κάποιο όνομα διαφέρει, το Task 7 Step 1 (verification στο SQL editor) θα το
δείξει — πρόσθεσε τότε `select conname from pg_constraint where conrelid =
'pl_movements'::regclass;` για τα σωστά ονόματα.

- [ ] **Step 3: Commit**

```bash
git add worker/migrations/004_pallets_f2.sql
git commit -m "feat(pallets): migration 004 — order_id, FKs set null, bucket δελτίων (Φ2)"
git push
```

---

### Task 2: Worker — accountant perms + legacy-ref resolver

**Files:**
- Modify: `worker/src/index.js` — μπλοκ pallets (PL_PERMS ~γρ.2562, PL_FIELDS ~γρ.2570, handlePallets branches).

**Interfaces:**
- Consumes: υπάρχοντα `dbSelectRaw`, `PL_FIELDS`, branches Φ1.
- Produces: (α) `PL_PERMS.accountant` διευρυμένο· (β) `plResolveRefs(env, body)` — δέχεται `client_rec/partner_rec/location_rec/order_stop_rec/cons_load_rec/order_rec` (legacy recXXX) και τα μετατρέπει σε `client_id/...` pg bigint· (γ) GET movements δέχεται `order_stop_rec=` και `order_rec=`· (δ) `PL_FIELDS` + `"order_id"`. Τα Tasks 4/6 στέλνουν ΜΟΝΟ `*_rec` refs από το frontend feeder (το UI στέλνει pg ids από lookups).

- [ ] **Step 1: Διεύρυνε PL_PERMS**

Αντικατέστησε τις γραμμές accountant/management του `PL_PERMS`:

```js
  accountant: { movements: ["GET", "POST", "PATCH"], confirm: ["POST"], reverse: ["POST"], sheets: ["GET", "POST"], balances: ["GET"], lookups: ["GET"] },
  management: { balances: ["GET"] }
```

και πρόσθεσε `sheets: ["GET", "POST"]` στα objects των owner, dispatcher, warehouse (ο warehouse ΧΩΡΙΣ reverse — μένει ως έχει κατά τα άλλα).

- [ ] **Step 2: Πρόσθεσε "order_id" στο PL_FIELDS**

```js
var PL_FIELDS = ["movement_date", "counterparty_type", "client_id", "partner_id", "location_id", "event_type", "taken", "given", "order_stop_id", "cons_load_id", "order_id", "sheet_url", "sheet_source", "reversal_of", "reason", "notes"];
```

- [ ] **Step 3: Πρόσθεσε τον resolver (μετά το plValidate)**

```js
// Το facade μιλάει legacy ids (recXXX)· το pl_movements θέλει pg bigint.
// Ο resolver είναι το ΜΟΝΟ σημείο μετάφρασης — το frontend στέλνει *_rec.
var PL_REF_MAP = {
  client_rec: { table: "clients", col: "client_id" },
  partner_rec: { table: "partners", col: "partner_id" },
  location_rec: { table: "locations", col: "location_id" },
  order_stop_rec: { table: "order_stops", col: "order_stop_id" },
  cons_load_rec: { table: "consolidated_loads", col: "cons_load_id" },
  order_rec: { table: "orders", col: "order_id" }
};
async function plResolveRefs(env, body) {
  const out = {};
  for (const [refKey, { table, col }] of Object.entries(PL_REF_MAP)) {
    const legacy = body[refKey];
    if (!legacy) continue;
    const { rows } = await dbSelectRaw(env, table, new URLSearchParams({ legacy_id: `eq.${legacy}`, select: "id" }));
    if (!rows.length) throw new Error(`Unknown ${refKey}: ${legacy}`);
    out[col] = rows[0].id;
  }
  return out;
}
__name(plResolveRefs, "plResolveRefs");
```

- [ ] **Step 4: Δέσε τον resolver στο POST, στο PATCH και στο replacement του reverse**

Στο POST branch, ΠΡΙΝ το `const err = plValidate(row);` πρόσθεσε:

```js
      try { Object.assign(row, await plResolveRefs(env, body)); }
      catch (e) { return jsonError(e.message, 400, origin, env); }
```

Στο PATCH branch, ΠΡΙΝ το `const merged = ...` πρόσθεσε το αντίστοιχο:

```js
      try { Object.assign(patch, await plResolveRefs(env, body)); }
      catch (e) { return jsonError(e.message, 400, origin, env); }
```

Στο reverse branch, μέσα στο `if (body.replacement ...)`, μετά το ctPick:

```js
        try { Object.assign(replacementRow, await plResolveRefs(env, body.replacement)); }
        catch (e) { return jsonError(e.message, 400, origin, env); }
```

- [ ] **Step 5: GET filters με legacy refs**

Στο GET movements branch, μετά τα υπάρχοντα φίλτρα, πρόσθεσε:

```js
      if (q.get("order_stop_rec")) {
        try {
          const r = await plResolveRefs(env, { order_stop_rec: q.get("order_stop_rec") });
          params.append("order_stop_id", `eq.${r.order_stop_id}`);
        } catch (e) { return jsonOk({ records: [] }, origin, env); }
      }
      if (q.get("order_rec")) {
        try {
          const r = await plResolveRefs(env, { order_rec: q.get("order_rec") });
          params.append("order_id", `eq.${r.order_id}`);
        } catch (e) { return jsonOk({ records: [] }, origin, env); }
      }
```

(Άγνωστο ref στο GET = κενή λίστα, όχι 400 — ο feeder ρωτάει «υπάρχει;».)

- [ ] **Step 6: Έλεγχος σύνταξης + commit**

Run: `node --check worker/src/index.js` → exit 0.

```bash
git add worker/src/index.js
git commit -m "feat(pallets): accountant perms + legacy-ref resolver + order_id (Φ2)"
git push
```

---

### Task 3: Worker — /pallets/sheets (Storage upload + signed URL)

**Files:**
- Modify: `worker/src/index.js` — νέα branches στο handlePallets, πριν το τελικό 404.

**Interfaces:**
- Consumes: `env.SUPABASE_URL`, `env.SUPABASE_SERVICE_KEY`, bucket `pallet-sheets` (Task 1).
- Produces: `POST /pallets/sheets` body `{filename, content_base64}` → `{path}`· `GET /pallets/sheets?path=` → `{url}` (signed, 1h). Το Task 6 UI τα καλεί.

- [ ] **Step 1: Πρόσθεσε τα branches**

```js
    // ---- POST /pallets/sheets  {filename, content_base64} → Storage ----
    // Ο browser ΔΕΝ μιλάει στο Storage — μόνο μέσω εδώ (service key).
    if (resource === "sheets" && method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || !body.filename || !body.content_base64) {
        return jsonError("filename + content_base64 required", 400, origin, env);
      }
      let bytes;
      try { bytes = Uint8Array.from(atob(body.content_base64), (c) => c.charCodeAt(0)); }
      catch { return jsonError("Invalid base64", 400, origin, env); }
      if (bytes.length > 8 * 1024 * 1024) return jsonError("File too large (max 8MB)", 400, origin, env);
      const safeName = String(body.filename).replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
      const path = `${Date.now()}-${safeName}`;
      const up = await fetch(`${env.SUPABASE_URL}/storage/v1/object/pallet-sheets/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/octet-stream" },
        body: bytes
      });
      if (!up.ok) {
        const d = await up.text().catch(() => "");
        console.error("PALLETS sheet upload", up.status, d.slice(0, 200));
        return jsonError("Upload failed", 500, origin, env);
      }
      await audit(env, { actor: caller.sub, role: caller.role, action: "upload", table: "pallet-sheets", recordId: path });
      return jsonOk({ path }, origin, env, 201);
    }
    // ---- GET /pallets/sheets?path=  → signed URL (1 ώρα) ----
    if (resource === "sheets" && method === "GET") {
      const p = url.searchParams.get("path");
      if (!p) return jsonError("path required", 400, origin, env);
      const sg = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/pallet-sheets/${encodeURIComponent(p).replace(/%2F/g, "/")}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 3600 })
      });
      if (!sg.ok) return jsonError("Sign failed", 500, origin, env);
      const data = await sg.json();
      return jsonOk({ url: `${env.SUPABASE_URL}/storage/v1${data.signedURL}` }, origin, env);
    }
```

- [ ] **Step 2: Έλεγχος σύνταξης + 401 smoke + commit**

Run: `node --check worker/src/index.js` → exit 0. Από `worker/`: `npx wrangler dev --local`, `curl -s http://localhost:8787/pallets/sheets` → `{"error":"Unauthorized"}` 401. Kill wrangler.

```bash
git add worker/src/index.js
git commit -m "feat(pallets): /pallets/sheets — upload δελτίων στο Storage + signed URLs (Φ2)"
git push
```

---

### Task 4: core/pallet-feed.js + script tag

**Files:**
- Create: `core/pallet-feed.js`
- Modify: `app.html` — νέο tag μετά το `core/ai-chat.js` (γρ. ~126), πριν το `<!-- 3. Modules -->`.

**Interfaces:**
- Consumes: globals `PROXY_URL`, `TABLES`, `F`, `atGetOne`, `stopsLoad(orderId, parentField)`, `showErrorToast` — όλα φορτωμένα πριν (core block).
- Produces (globals — τα καλεί το Task 5): `plOnOrderSaved(orderId, source)` (source: 'intl'|'natl'), `plOnDelivered(orderId)`, `plOnIntlPartnerAssigned(orderId)`, `plOnOrderDeleted(orderId, source)`, `plOnExchangeOff(orderId, source)`, και `plFetch(path, opts)` (το χρησιμοποιεί και το Task 6 UI).

- [ ] **Step 1: Γράψε το αρχείο**

Πλήρες περιεχόμενο `core/pallet-feed.js`:

```js
// ═══════════════════════════════════════════════════════════
// CORE — PALLET FEEDERS (Φ2, spec docs/PALLETS_F2_FEEDERS.md)
// Όλη η λογική αυτόματης τροφοδότησης του ημερολογίου παλετών σε ΕΝΑ σημείο.
// Κανόνες: idempotent (έλεγχος πριν τη δημιουργία), μη-μπλοκάρον (αποτυχία
// feeder = toast, ΠΟΤΕ δεν μπλοκάρει το order), αγγίζει ΜΟΝΟ pending.
// Ο Worker κάνει τη μετάφραση legacy recXXX → pg ids (στέλνουμε *_rec).
// ═══════════════════════════════════════════════════════════
'use strict';

async function plFetch(path, opts = {}) {
  const jwt = localStorage.getItem('tms_jwt');
  const res = await fetch(PROXY_URL + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: 'Bearer ' + jwt } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

// Μη-μπλοκάρον περίβλημα: ΚΑΘΕ feeder περνάει από εδώ.
async function _plSafe(label, fn) {
  try { return await fn(); }
  catch (e) {
    console.warn('[pallet-feed]', label, e && e.message);
    if (typeof showErrorToast === 'function') {
      showErrorToast('Παλέτες: απέτυχε ' + label + ' — καταχώρησε χειροκίνητα από το Ισοζύγιο', 'warn', 8000);
    }
    return null;
  }
}

function _plToday() { return new Date().toISOString().slice(0, 10); }
function _plDate(dt) { return dt ? String(dt).slice(0, 10) : _plToday(); }

async function _plLoadOrder(orderId, source) {
  const tableId = source === 'intl' ? TABLES.ORDERS : TABLES.NAT_ORDERS;
  const parentField = source === 'intl' ? F.STOP_PARENT_ORDER : F.STOP_PARENT_NAT;
  const rec = await atGetOne(tableId, orderId);
  const stops = await stopsLoad(orderId, parentField);
  return { rec, stops };
}

function _plClientRec(fields) {
  const c = fields['Client'];
  return Array.isArray(c) ? c[0] : (c || null);
}

// ── Feeder §3.1: αποθήκευση order → pending LOADING ανά στάση φόρτωσης ──
async function plOnOrderSaved(orderId, source) {
  return _plSafe('δημιουργία εκκρεμών φόρτωσης', async () => {
    const { rec, stops } = await _plLoadOrder(orderId, source);
    if (!rec) return;
    if (!rec.fields['Pallet Exchange']) return plOnExchangeOff(orderId, source);
    const clientRec = _plClientRec(rec.fields);
    for (const s of stops) {
      if (s.fields[F.STOP_TYPE] !== 'Loading') continue;
      const existing = await plFetch('/pallets/movements?order_stop_rec=' + encodeURIComponent(s.id));
      const cur = (existing.records || [])[0];
      const pallets = parseInt(s.fields[F.STOP_PALLETS], 10) || 0;
      if (!cur) {
        await plFetch('/pallets/movements', { method: 'POST', body: {
          movement_date: _plDate(s.fields[F.STOP_DATETIME]),
          counterparty_type: 'CLIENT',
          client_rec: clientRec,
          location_rec: (s.fields[F.STOP_LOCATION] || [])[0] || null,
          event_type: 'LOADING',
          taken: pallets, given: 0,
          order_stop_rec: s.id, order_rec: orderId
        }});
      } else if (cur.status === 'pending' && cur.taken !== pallets) {
        await plFetch('/pallets/movements/' + cur.id, { method: 'PATCH', body: { taken: pallets } });
      }
      // confirmed: δεν αγγίζεται ποτέ από feeder
    }
  });
}

// ── Feeder §3.2: Status → Delivered → confirmed DELIVERY net 0 ανά παράδοση ──
async function plOnDelivered(orderId) {
  return _plSafe('εγγραφές παράδοσης', async () => {
    const { rec, stops } = await _plLoadOrder(orderId, 'intl');
    if (!rec || !rec.fields['Pallet Exchange']) return;
    const clientRec = _plClientRec(rec.fields);
    for (const s of stops) {
      if (s.fields[F.STOP_TYPE] !== 'Unloading') continue;
      const existing = await plFetch('/pallets/movements?order_stop_rec=' + encodeURIComponent(s.id));
      if ((existing.records || []).length) continue; // ήδη γραμμένη
      const pallets = parseInt(s.fields[F.STOP_PALLETS], 10) || 0;
      if (!pallets) continue;
      await plFetch('/pallets/movements', { method: 'POST', body: {
        movement_date: _plToday(),
        counterparty_type: 'CLIENT',
        client_rec: clientRec,
        location_rec: (s.fields[F.STOP_LOCATION] || [])[0] || null,
        event_type: 'DELIVERY',
        taken: pallets, given: pallets,
        order_stop_rec: s.id, order_rec: orderId,
        confirm: true
      }});
    }
  });
}

// ── Feeder §3.3: διεθνής ανάθεση σε partner (VS μόνο) ──
async function plOnIntlPartnerAssigned(orderId) {
  return _plSafe('εκκρεμής partner', async () => {
    const rec = await atGetOne(TABLES.ORDERS, orderId);
    if (!rec) return;
    const f = rec.fields;
    const partnerRec = Array.isArray(f['Partner']) ? f['Partner'][0] : null;
    const eligible = f['Pallet Exchange'] && f['Veroia Switch'] && f['Is Partner Trip'] && partnerRec;
    const evType = f['Direction'] === 'Import' ? 'PARTNER_DROPOFF' : 'PARTNER_PICKUP';
    // Υπάρχουσα partner-εγγραφή του order (μας αφορά ΜΟΝΟ pending)
    const existing = await plFetch('/pallets/movements?order_rec=' + encodeURIComponent(orderId));
    const cur = (existing.records || []).find(m =>
      (m.event_type === 'PARTNER_PICKUP' || m.event_type === 'PARTNER_DROPOFF') && m.status === 'pending');
    if (!eligible) {
      if (cur) await plFetch('/pallets/movements/' + cur.id, { method: 'DELETE' });
      return;
    }
    const pallets = parseInt(f['Pallets'], 10) || 0;
    const qty = { // PICKUP: δίνουμε γεμάτες· DROPOFF: παίρνουμε γεμάτες (spec §2)
      taken: evType === 'PARTNER_DROPOFF' ? pallets : 0,
      given: evType === 'PARTNER_PICKUP' ? pallets : 0
    };
    if (!cur) {
      await plFetch('/pallets/movements', { method: 'POST', body: {
        movement_date: _plToday(),
        counterparty_type: 'PARTNER',
        partner_rec: partnerRec,
        location_rec: 'recJucKOhC1zh4IP3', // Βέροια Cross-Dock (spec §3.3)
        event_type: evType,
        ...qty,
        order_rec: orderId
      }});
    } else {
      await plFetch('/pallets/movements/' + cur.id, { method: 'PATCH', body: { partner_rec: partnerRec, event_type: evType, ...qty } });
    }
  });
}

// ── §3.1: Pallet Exchange OFF → σβήνονται ΜΟΝΟ οι pending του order ──
async function plOnExchangeOff(orderId, source) {
  return _plSafe('καθαρισμός εκκρεμών (PE off)', async () => {
    const existing = await plFetch('/pallets/movements?order_rec=' + encodeURIComponent(orderId));
    for (const m of (existing.records || [])) {
      if (m.status === 'pending') await plFetch('/pallets/movements/' + m.id, { method: 'DELETE' });
    }
  });
}

// ── Cascade delete order → ίδια συμπεριφορά: pending φεύγουν, confirmed μένουν ──
async function plOnOrderDeleted(orderId, source) {
  return plOnExchangeOff(orderId, source);
}

window.plFetch = plFetch;
window.plOnOrderSaved = plOnOrderSaved;
window.plOnDelivered = plOnDelivered;
window.plOnIntlPartnerAssigned = plOnIntlPartnerAssigned;
window.plOnExchangeOff = plOnExchangeOff;
window.plOnOrderDeleted = plOnOrderDeleted;
```

Σημείωση DELETE permission: το `plOnExchangeOff` καλεί DELETE — το έχουν
owner/dispatcher. Αν ο χρήστης είναι accountant/warehouse το DELETE θα
γυρίσει 403 και το _plSafe θα δείξει toast — αποδεκτό: PE toggle και
cascade delete γίνονται από dispatchers/owner στα orders modules (perm
'orders' full).

- [ ] **Step 2: Script tag στο app.html**

Μετά τη γραμμή `<script src="core/ai-chat.js?v=...">` πρόσθεσε (TS = τρέχον unix timestamp):

```html
<script src="core/pallet-feed.js?v=TS"></script>
```

- [ ] **Step 3: Έλεγχος σύνταξης**

Run: `node --check core/pallet-feed.js` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add core/pallet-feed.js app.html
git commit -m "feat(pallets): core/pallet-feed.js — feeders Φ2 (idempotent, μη-μπλοκάρον)"
git push
```

Σημείωση: το αρχείο φορτώνεται αλλά ΔΕΝ καλείται από πουθενά ακόμα — ασφαλές deploy.

---

### Task 5: Hooks στα modules + αφαίρεση νεκρού κώδικα + browser δοκιμή

**Files:**
- Modify: `modules/orders_intl.js` (submitIntlOrder ~γρ.1656· deleteIntlOrder ~γρ.2578-2600· _syncVeroiaSwitch ~γρ.913-935)
- Modify: `modules/orders_natl.js` (submitNatlOrder ~γρ.958· deleteNatlOrder ~γρ.1438-1460)
- Modify: `modules/daily_ops.js` (_opsDel ~γρ.572· _opsOvAct ~γρ.625)
- Modify: `modules/weekly_intl.js` (_wiSaveFromPopover ~γρ.1895· _wiSave ~γρ.2021-2038)
- Modify: `core/order-sync.js` (γρ.86-91 + cleanupPLorphans 179-223 + window export ~246-250)
- Modify: `app.html` (bump `?v=` όλων των παραπάνω)

**Interfaces:**
- Consumes: τα 5 globals του Task 4.
- Produces: ζωντανούς feeders σε όλες τις ροές.

- [ ] **Step 1: orders_intl.js — submitIntlOrder hook**

Μετά το μπλοκ `if (_formStops.length) { await stopsSave(...); }` (~γρ.1656) πρόσθεσε:

```js
    // Παλέτες Φ2: εκκρεμείς LOADING ανά στάση (idempotent, μη-μπλοκάρον)
    if (typeof plOnOrderSaved === 'function') await plOnOrderSaved(savedOrderId, 'intl');
```

- [ ] **Step 2: orders_intl.js — αφαίρεση 2 νεκρών PALLET_LEDGER cleanup μπλοκ**

Σβήσε ΟΛΟΚΛΗΡΑ τα try-μπλοκ «Delete Pallet Ledger entries linked via ORDER_STOPS» στο `_syncVeroiaSwitch` (~γρ.913-935, σχόλιο «3b.») και στο `deleteIntlOrder` (~γρ.2578-2600, σχόλιο «4.»). Στη θέση του δεύτερου βάλε:

```js
    // Παλέτες Φ2: pending φεύγουν, confirmed μένουν (ιστορικό)
    if (typeof plOnOrderDeleted === 'function') await plOnOrderDeleted(recId, 'intl');
```

ΠΡΟΣΟΧΗ σειράς: το hook μπαίνει ΠΡΙΝ διαγραφεί το ίδιο το order record
(το plOnOrderDeleted κάνει resolve το order_rec — αν το order έχει ήδη
σβηστεί από τη βάση, ο resolver δεν θα βρει τίποτα και θα γυρίσει κενά).
(Στο _syncVeroiaSwitch: μόνο αφαίρεση, χωρίς αντικατάσταση — το VS toggle δεν αγγίζει παλέτες.)

- [ ] **Step 3: orders_natl.js — hook + αφαίρεση cleanup**

Μετά το `if (_natStops.length) await stopsSave(savedNatlId, _natStops, F.STOP_PARENT_NAT);` (~γρ.958), ΜΕΣΑ στο ίδιο try, πρόσθεσε:

```js
      if (typeof plOnOrderSaved === 'function') await plOnOrderSaved(savedNatlId, 'natl');
```

Σβήσε το νεκρό cleanup μπλοκ στο `deleteNatlOrder` (~γρ.1438-1460, «3b.») και βάλε στη θέση του (ΠΡΙΝ τη διαγραφή του order record):

```js
    if (typeof plOnOrderDeleted === 'function') await plOnOrderDeleted(recId, 'natl');
```

- [ ] **Step 4: daily_ops.js — Delivered hooks (2 σημεία)**

Στο `_opsDel` μετά το επιτυχές `atSafePatch(TABLES.ORDERS,id,{'Status':'Delivered',...})` (~γρ.573):

```js
  if (typeof plOnDelivered === 'function') plOnDelivered(id);
```

Το ίδιο μία γραμμή στο `_opsOvAct` (~γρ.625-632) μετά το δικό του Status:'Delivered' patch. (Χωρίς await — fire-and-forget, το UI δεν περιμένει.)

- [ ] **Step 5: weekly_intl.js — partner hooks (2 σημεία)**

Στο `_wiSaveFromPopover` μετά το επιτυχές `atSafePatch(TABLES.ORDERS,orderId,expFields)` (~γρ.1895) και στο `_wiSave` μετά το αντίστοιχο patch (~γρ.2021-2038):

```js
    if (typeof plOnIntlPartnerAssigned === 'function') plOnIntlPartnerAssigned(orderId);
```

(Καλείται και σε partner ΚΑΙ σε own-truck ανάθεση — ο feeder αποφασίζει μόνος: αν δεν είναι eligible σβήνει τυχόν pending. Fire-and-forget.)

- [ ] **Step 6: order-sync.js — αντικατάσταση PE-toggle cleanup**

Αντικατέστησε το μπλοκ γρ.86-91 με:

```js
    // 5. Παλέτες Φ2: PE toggle → sync εκκρεμών (ON: δημιουργία, OFF: καθαρισμός pending)
    if (!skipPL && changedFields.includes('Pallet Exchange')) {
      await run('PL feed sync', async () => {
        if (typeof plOnOrderSaved === 'function') await plOnOrderSaved(orderId, source);
      });
    }
```

Σβήσε ΟΛΟΚΛΗΡΗ τη `cleanupPLorphans` (γρ.179-223) και τη γραμμή
`window.cleanupPLorphans = ...` από τα exports (~γρ.246-250). Έλεγξε με
`grep -rn "cleanupPLorphans" modules/ core/` ότι δεν έμεινε καμία αναφορά.

- [ ] **Step 7: app.html — bump ?v=**

Νέο κοινό timestamp στα: `modules/orders_intl.js`, `modules/orders_natl.js`, `modules/daily_ops.js`, `modules/weekly_intl.js`, `core/order-sync.js`.

- [ ] **Step 8: Έλεγχος σύνταξης ΟΛΩΝ**

Run: `for f in modules/orders_intl.js modules/orders_natl.js modules/daily_ops.js modules/weekly_intl.js core/order-sync.js; do node --check $f || echo "FAIL $f"; done`
Expected: κανένα FAIL.

- [ ] **Step 9: BROWSER ΔΟΚΙΜΗ ΠΡΙΝ ΤΟ PUSH (κανόνας CLAUDE.md — υποχρεωτικό)**

Τοπικό serve: `python3 -m http.server 8000` στο repo root, browser στο `http://localhost:8000/app.html`. ΣΗΜΕΙΩΣΗ: τα /pallets καλέσματα χτυπάνε τον LIVE Worker — οι feeders όμως δεν είναι deployed για άλλους χρήστες πριν το push, και οι δοκιμές καθαρίζονται (cascade delete):
1. Login. International Orders → New Order → ελάχιστη παραγγελία-δοκιμή (Reference: ΔΟΚΙΜΗ-PL-Φ2) με Pallet Exchange ON, 1 Loading στάση 33 παλέτες → Save. Expected: σώζεται, κονσόλα καθαρή.
2. Κονσόλα: `plFetch('/pallets/movements?order_rec=<orderId>').then(r=>console.log(r.records))` → 1 pending LOADING, taken 33.
3. Edit → Save ξανά → ξανά βήμα 2 → ΠΑΛΙ 1 εγγραφή (idempotency ✓).
4. Pallet Exchange OFF → Save → 0 εγγραφές. Ξανά ON → Save → 1 pending.
5. Cascade delete της δοκιμαστικής → 0 εγγραφές.
6. National Orders → New → δοκιμή με PE ON → 1 pending → διαγραφή.
7. Κονσόλα καθαρή σε ΟΛΑ τα βήματα.

- [ ] **Step 10: Commit + push**

```bash
git add modules/orders_intl.js modules/orders_natl.js modules/daily_ops.js modules/weekly_intl.js core/order-sync.js app.html
git commit -m "feat(pallets): hooks feeders σε orders/daily_ops/weekly_intl + αφαίρεση νεκρού PALLET_LEDGER κώδικα (Φ2)"
git push
```

---

### Task 6: pallet_ledger.js — minimal UI Φ2

**Files:**
- Rewrite: `modules/pallet_ledger.js` (πλήρης αντικατάσταση των 514 γραμμών)
- Modify: `app.html` (bump ?v= του pallet_ledger.js)

**Interfaces:**
- Consumes: `plFetch` (Task 4), endpoints Φ1/Φ2 (`/pallets/movements`, `/confirm`, `/reverse`, `/sheets`, `/lookups`), `toast`, `showErrorToast`, router entry `renderPalletLedger` (ΔΕΝ αλλάζει όνομα — το καλεί το router.js:300).
- Produces: σελίδα με 3 προβολές (Εκκρεμείς / Χωρίς πλήρη επιστροφή / Όλες), modal επιβεβαίωσης με δελτίο+upload, «Διόρθωση ανταλλαγής» σε DELIVERY, φόρμα «Νέα κίνηση». Ελληνικά labels. Λειτουργικό σε tablet.

- [ ] **Step 1: Γράψε το νέο αρχείο**

Πλήρης αντικατάσταση του `modules/pallet_ledger.js`:

```js
// ═══════════════════════════════════════════════════════════
// MODULE — ΙΣΟΖΥΓΙΟ ΠΑΛΕΤΩΝ (Φ2 minimal: εκκρεμείς + διορθώσεις + νέα κίνηση)
// Πηγή: /pallets/* (Worker). Το πλήρες Ισοζύγιο (υπόλοιπα/drill-down) = Φ3.
// ═══════════════════════════════════════════════════════════
'use strict';

const PLV = { movements: [], lookups: null, tab: 'pending', busy: false };

async function renderPalletLedger() {
  const c = document.getElementById('content');
  c.style.padding = ''; c.style.overflow = '';
  c.innerHTML = '<div style="text-align:center;padding:60px;color:var(--panel-dim)">Φόρτωση κινήσεων παλετών...</div>';
  try {
    const [mv, lk] = await Promise.all([
      plFetch('/pallets/movements'),
      PLV.lookups ? Promise.resolve(PLV.lookups) : plFetch('/pallets/lookups')
    ]);
    PLV.movements = mv.records || [];
    PLV.lookups = lk;
  } catch (e) {
    c.innerHTML = `<div style="padding:40px;color:var(--danger)">Σφάλμα φόρτωσης: ${e.message}</div>`;
    return;
  }
  _plvDraw();
}

function _plvName(m) {
  if (m.counterparty_type === 'CLIENT') {
    const cl = (PLV.lookups.clients || []).find(x => x.id === m.client_id);
    return cl ? cl.company_name : ('Πελάτης #' + m.client_id);
  }
  const p = (PLV.lookups.partners || []).find(x => x.id === m.partner_id);
  return p ? p.company_name : ('Partner #' + m.partner_id);
}
function _plvLoc(m) {
  const l = (PLV.lookups.locations || []).find(x => x.id === m.location_id);
  return l ? l.name : '';
}
const PLV_EVENT_GR = {
  LOADING: 'Φόρτωση', DELIVERY: 'Παράδοση', PARTNER_PICKUP: 'Παραλαβή από partner',
  PARTNER_DROPOFF: 'Παράδοση από partner', RETURN_OUT: 'Επιστροφή αδειών',
  RETURN_IN: 'Παραλαβή αδειών', ADJUSTMENT: 'Τακτοποίηση'
};

function _plvRows() {
  if (PLV.tab === 'pending') return PLV.movements.filter(m => m.status === 'pending');
  if (PLV.tab === 'noreturn') return PLV.movements.filter(m =>
    m.status === 'confirmed' && m.event_type === 'DELIVERY' && m.given > m.taken);
  return PLV.movements.filter(m => m.status !== 'reversed');
}

function _plvDraw() {
  const c = document.getElementById('content');
  const pend = PLV.movements.filter(m => m.status === 'pending').length;
  const rows = _plvRows();
  c.innerHTML = `
  <div style="padding:20px;max-width:1100px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <h1 style="font-family:Syne;font-size:22px;margin:0">Ισοζύγιο Παλετών</h1>
      <button class="btn-new-order" onclick="plvNewMovement()">+ Νέα κίνηση</button>
    </div>
    <div style="display:flex;gap:8px;margin:16px 0;flex-wrap:wrap">
      ${[['pending', 'Εκκρεμείς (' + pend + ')'], ['noreturn', 'Χωρίς πλήρη επιστροφή'], ['all', 'Όλες οι κινήσεις']].map(([id, lbl]) =>
        `<button onclick="plvTab('${id}')" style="padding:8px 16px;border-radius:20px;border:1px solid var(--accent);cursor:pointer;font-size:13px;${PLV.tab === id ? 'background:var(--accent);color:#fff' : 'background:transparent;color:var(--accent)'}">${lbl}</button>`).join('')}
    </div>
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="text-align:left;color:var(--panel-dim)">
        <th style="padding:8px">Κωδ.</th><th>Ημ/νία</th><th>Είδος</th><th>Αντισυμβαλλόμενος</th>
        <th>Σημείο</th><th style="text-align:right">Πήραμε</th><th style="text-align:right">Δώσαμε</th>
        <th>Κατάσταση</th><th></th>
      </tr>
      ${rows.map(m => `
      <tr style="border-top:1px solid var(--line,#e2e8f0)">
        <td style="padding:8px">${m.code}</td>
        <td>${m.movement_date}</td>
        <td>${PLV_EVENT_GR[m.event_type] || m.event_type}</td>
        <td>${_plvName(m)}</td>
        <td>${_plvLoc(m)}</td>
        <td style="text-align:right">${m.taken}</td>
        <td style="text-align:right">${m.given}</td>
        <td>${m.status === 'pending' ? '<span style="color:#92400E;font-weight:600">εκκρεμής</span>' : m.status === 'confirmed' ? '<span style="color:var(--accent)">οριστική</span>' : 'αντιλογισμένη'}</td>
        <td style="white-space:nowrap">
          ${m.status === 'pending' ? `<button class="btn-scan" style="padding:4px 12px" onclick="plvOpenConfirm(${m.id})">Επιβεβαίωση</button>` : ''}
          ${m.status === 'confirmed' && m.event_type === 'DELIVERY' ? `<button class="btn-scan" style="padding:4px 12px" onclick="plvFixDelivery(${m.id})">Διόρθωση ανταλλαγής</button>` : ''}
          ${m.sheet_url ? `<a href="#" onclick="plvViewSheet('${m.sheet_url.replace(/'/g, '')}');return false" style="margin-left:6px;font-size:12px">δελτίο</a>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="9" style="padding:30px;text-align:center;color:var(--panel-dim)">Καμία κίνηση εδώ</td></tr>'}
    </table>
    </div>
  </div>
  <div id="plvModal"></div>`;
}

function plvTab(t) { PLV.tab = t; _plvDraw(); }

/* ── Modal επιβεβαίωσης εκκρεμούς ── */
function plvOpenConfirm(id) {
  const m = PLV.movements.find(x => x.id === id);
  if (!m) return;
  document.getElementById('plvModal').innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(11,25,41,.55);display:flex;align-items:center;justify-content:center;z-index:1000" onclick="if(event.target===this)plvCloseModal()">
    <div style="background:var(--panel,#fff);border-radius:12px;padding:24px;width:min(440px,92vw)">
      <h3 style="font-family:Syne;margin:0 0 6px">Επιβεβαίωση — ${m.code}</h3>
      <div style="font-size:13px;color:var(--panel-dim);margin-bottom:14px">${PLV_EVENT_GR[m.event_type]} · ${_plvName(m)}</div>
      <label style="font-size:13px">Πήραμε (παλέτες)<input id="plvTaken" type="number" min="0" value="${m.taken}" style="width:100%;padding:10px;margin:4px 0 12px;font-size:16px"></label>
      <label style="font-size:13px">Δώσαμε (παλέτες)<input id="plvGiven" type="number" min="0" value="${m.given}" style="width:100%;padding:10px;margin:4px 0 12px;font-size:16px"></label>
      <label style="font-size:13px">Δελτίο (φωτο/PDF — προαιρετικό)<input id="plvFile" type="file" accept="image/*,.pdf" style="width:100%;margin:4px 0 14px"></label>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-scan" onclick="plvCloseModal()">Άκυρο</button>
        <button class="btn-new-order" onclick="plvDoConfirm(${m.id})">Επιβεβαίωση κίνησης</button>
      </div>
    </div>
  </div>`;
}
function plvCloseModal() { document.getElementById('plvModal').innerHTML = ''; }

async function _plvUploadIfAny() {
  const fi = document.getElementById('plvFile');
  if (!fi || !fi.files || !fi.files[0]) return null;
  const file = fi.files[0];
  const b64 = await new Promise((ok, err) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = err; r.readAsDataURL(file);
  });
  const res = await plFetch('/pallets/sheets', { method: 'POST', body: { filename: file.name, content_base64: b64 } });
  return res.path;
}

async function plvDoConfirm(id) {
  if (PLV.busy) return; PLV.busy = true;
  try {
    const taken = parseInt(document.getElementById('plvTaken').value, 10) || 0;
    const given = parseInt(document.getElementById('plvGiven').value, 10) || 0;
    const path = await _plvUploadIfAny();
    const patch = { taken, given, sheet_source: path ? 'UPLOAD' : 'MANUAL' };
    if (path) patch.sheet_url = path;
    await plFetch('/pallets/movements/' + id, { method: 'PATCH', body: patch });
    await plFetch('/pallets/movements/' + id + '/confirm', { method: 'POST' });
    toast('Κίνηση επιβεβαιώθηκε ✓');
    plvCloseModal(); await renderPalletLedger();
  } catch (e) { showErrorToast('Αποτυχία επιβεβαίωσης: ' + e.message, 'error'); }
  finally { PLV.busy = false; }
}

/* ── Διόρθωση ανταλλαγής (σενάριο Lidl): reverse + σωστό replacement ── */
function plvFixDelivery(id) {
  const m = PLV.movements.find(x => x.id === id);
  if (!m) return;
  document.getElementById('plvModal').innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(11,25,41,.55);display:flex;align-items:center;justify-content:center;z-index:1000" onclick="if(event.target===this)plvCloseModal()">
    <div style="background:var(--panel,#fff);border-radius:12px;padding:24px;width:min(440px,92vw)">
      <h3 style="font-family:Syne;margin:0 0 6px">Διόρθωση ανταλλαγής — ${m.code}</h3>
      <div style="font-size:13px;color:var(--panel-dim);margin-bottom:14px">Δώσαμε ${m.given} γεμάτες. Πόσες άδειες πήραμε ΠΡΑΓΜΑΤΙΚΑ;</div>
      <label style="font-size:13px">Πήραμε (πραγματικά)<input id="plvRealTaken" type="number" min="0" value="0" style="width:100%;padding:10px;margin:4px 0 12px;font-size:16px"></label>
      <label style="font-size:13px">Σημείωση (τι έγινε)<input id="plvFixNote" type="text" placeholder="π.χ. Lidl — δεν είχαν άδειες" style="width:100%;padding:10px;margin:4px 0 14px"></label>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-scan" onclick="plvCloseModal()">Άκυρο</button>
        <button class="btn-new-order" onclick="plvDoFix(${m.id})">Καταχώρηση διόρθωσης</button>
      </div>
    </div>
  </div>`;
}

async function plvDoFix(id) {
  if (PLV.busy) return; PLV.busy = true;
  try {
    const m = PLV.movements.find(x => x.id === id);
    const realTaken = parseInt(document.getElementById('plvRealTaken').value, 10) || 0;
    const note = document.getElementById('plvFixNote').value || '';
    const res = await plFetch('/pallets/movements/' + id + '/reverse', { method: 'POST', body: {
      reason: 'Διόρθωση ανταλλαγής παράδοσης' + (note ? ' — ' + note : ''),
      replacement: {
        movement_date: m.movement_date, counterparty_type: m.counterparty_type,
        client_id: m.client_id, partner_id: m.partner_id, location_id: m.location_id,
        event_type: 'DELIVERY', taken: realTaken, given: m.given,
        order_stop_id: m.order_stop_id, order_id: m.order_id, notes: note
      }
    }});
    if (res.replacement) await plFetch('/pallets/movements/' + res.replacement.id + '/confirm', { method: 'POST' });
    toast('Διόρθωση καταχωρήθηκε ✓');
    plvCloseModal(); await renderPalletLedger();
  } catch (e) { showErrorToast('Αποτυχία διόρθωσης: ' + e.message, 'error'); }
  finally { PLV.busy = false; }
}

/* ── Νέα χειροκίνητη κίνηση ── */
function plvNewMovement() {
  const cls = (PLV.lookups.clients || []).map(c => `<option value="C:${c.id}">${c.company_name}</option>`).join('');
  const prs = (PLV.lookups.partners || []).map(p => `<option value="P:${p.id}">${p.company_name}</option>`).join('');
  const locs = (PLV.lookups.locations || []).map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  document.getElementById('plvModal').innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(11,25,41,.55);display:flex;align-items:center;justify-content:center;z-index:1000" onclick="if(event.target===this)plvCloseModal()">
    <div style="background:var(--panel,#fff);border-radius:12px;padding:24px;width:min(460px,92vw);max-height:90vh;overflow:auto">
      <h3 style="font-family:Syne;margin:0 0 14px">Νέα κίνηση παλετών</h3>
      <label style="font-size:13px">Είδος<select id="plvNmType" style="width:100%;padding:10px;margin:4px 0 12px">
        <option value="RETURN_OUT">Επιστροφή αδειών (δίνουμε)</option>
        <option value="RETURN_IN">Παραλαβή αδειών (παίρνουμε)</option>
        <option value="PARTNER_PICKUP">Partner πήρε από εμάς</option>
        <option value="PARTNER_DROPOFF">Partner μάς έφερε</option>
        <option value="ADJUSTMENT">Τακτοποίηση/διαγραφή οφειλής (μόνο owner)</option>
      </select></label>
      <label style="font-size:13px">Αιτιολογία (υποχρεωτική για τακτοποίηση)<input id="plvNmReason" type="text" style="width:100%;padding:10px;margin:4px 0 12px"></label>
      <label style="font-size:13px">Αντισυμβαλλόμενος<select id="plvNmParty" style="width:100%;padding:10px;margin:4px 0 12px">
        <optgroup label="Πελάτες">${cls}</optgroup><optgroup label="Partners">${prs}</optgroup>
      </select></label>
      <label style="font-size:13px">Σημείο (προαιρετικό)<select id="plvNmLoc" style="width:100%;padding:10px;margin:4px 0 12px"><option value="">—</option>${locs}</select></label>
      <label style="font-size:13px">Ημερομηνία<input id="plvNmDate" type="date" value="${new Date().toISOString().slice(0, 10)}" style="width:100%;padding:10px;margin:4px 0 12px"></label>
      <div style="display:flex;gap:10px">
        <label style="font-size:13px;flex:1">Πήραμε<input id="plvNmTaken" type="number" min="0" value="0" style="width:100%;padding:10px;margin:4px 0 12px"></label>
        <label style="font-size:13px;flex:1">Δώσαμε<input id="plvNmGiven" type="number" min="0" value="0" style="width:100%;padding:10px;margin:4px 0 12px"></label>
      </div>
      <label style="font-size:13px">Δελτίο (φωτο/PDF — προαιρετικό)<input id="plvFile" type="file" accept="image/*,.pdf" style="width:100%;margin:4px 0 6px"></label>
      <label style="font-size:13px">Σημείωση<input id="plvNmNote" type="text" style="width:100%;padding:10px;margin:4px 0 14px"></label>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-scan" onclick="plvCloseModal()">Άκυρο</button>
        <button class="btn-new-order" onclick="plvDoCreate()">Καταχώρηση + Επιβεβαίωση</button>
      </div>
    </div>
  </div>`;
}

async function plvDoCreate() {
  if (PLV.busy) return; PLV.busy = true;
  try {
    const [kind, pid] = document.getElementById('plvNmParty').value.split(':');
    const path = await _plvUploadIfAny();
    const body = {
      movement_date: document.getElementById('plvNmDate').value,
      counterparty_type: kind === 'C' ? 'CLIENT' : 'PARTNER',
      event_type: document.getElementById('plvNmType').value,
      taken: parseInt(document.getElementById('plvNmTaken').value, 10) || 0,
      given: parseInt(document.getElementById('plvNmGiven').value, 10) || 0,
      notes: document.getElementById('plvNmNote').value || null,
      reason: (document.getElementById('plvNmReason') || {}).value || null,
      sheet_source: path ? 'UPLOAD' : 'MANUAL',
      confirm: true
    };
    if (kind === 'C') body.client_id = parseInt(pid, 10); else body.partner_id = parseInt(pid, 10);
    const loc = document.getElementById('plvNmLoc').value;
    if (loc) body.location_id = parseInt(loc, 10);
    if (path) body.sheet_url = path;
    await plFetch('/pallets/movements', { method: 'POST', body });
    toast('Κίνηση καταχωρήθηκε ✓');
    plvCloseModal(); await renderPalletLedger();
  } catch (e) { showErrorToast('Αποτυχία: ' + e.message, 'error'); }
  finally { PLV.busy = false; }
}

async function plvViewSheet(path) {
  try {
    const r = await plFetch('/pallets/sheets?path=' + encodeURIComponent(path));
    window.open(r.url, '_blank');
  } catch (e) { showErrorToast('Δεν άνοιξε το δελτίο: ' + e.message, 'error'); }
}

window.renderPalletLedger = renderPalletLedger;
window.plvTab = plvTab; window.plvOpenConfirm = plvOpenConfirm; window.plvCloseModal = plvCloseModal;
window.plvDoConfirm = plvDoConfirm; window.plvFixDelivery = plvFixDelivery; window.plvDoFix = plvDoFix;
window.plvNewMovement = plvNewMovement; window.plvDoCreate = plvDoCreate; window.plvViewSheet = plvViewSheet;
```

Σημείωση: το UI στέλνει pg ids (`client_id` κ.λπ. από τα lookups) — ΔΕΝ χρειάζεται *_rec refs. Το «Νέα κίνηση» κάνει direct confirm (η Αλεξία καταχωρεί τετελεσμένα γεγονότα με δελτίο μπροστά της).

- [ ] **Step 2: Bump ?v= του modules/pallet_ledger.js στο app.html**

- [ ] **Step 3: Έλεγχος σύνταξης**

Run: `node --check modules/pallet_ledger.js` → exit 0.

- [ ] **Step 4: Browser δοκιμή του UI**

Τοπικό serve όπως Task 5 Step 9. Άνοιξε «Pallet Ledger» από το sidebar:
1. Οι 3 καρτέλες αλλάζουν χωρίς errors.
2. «Νέα κίνηση»: RETURN_IN από partner 5 παλέτες MANUAL → εμφανίζεται στην «Όλες», οριστική.
3. Σε όποια pending υπάρχει: «Επιβεβαίωση» → πεδία προσυμπληρωμένα → Άκυρο.
4. Κονσόλα καθαρή.
(Η δοκιμαστική RETURN_IN αντιλογίζεται μετά από owner/dispatcher με reason «δοκιμή Φ2».)

- [ ] **Step 5: Commit + push**

```bash
git add modules/pallet_ledger.js app.html
git commit -m "feat(pallets): νέο minimal UI Ισοζυγίου Φ2 — εκκρεμείς, διόρθωση ανταλλαγής, νέα κίνηση"
git push
```

---

### Task 7: Deploy + εφαρμογή 004 + e2e smoke + docs (owner/controller)

**Files:**
- Modify: `docs/PALLETS_SCHEMA_APPLIED_2026-08-10.md` (προσθήκη ενότητας Φ2)
- Memory update (project_pallets_architecture.md)

**Interfaces:**
- Consumes: όλα τα προηγούμενα.
- Produces: Φ2 live end-to-end.

- [ ] **Step 1: Εφαρμογή migration 004 στη Supabase** — Monaco setValue μέσω Chrome (όπως το 003), Run, verification queries του αρχείου. Αν FK constraint names διαφέρουν (Task 1 Step 2), διόρθωσε επί τόπου με τα conname από pg_constraint.
- [ ] **Step 2: `cd worker && npx wrangler deploy`** → επιτυχές deploy.
- [ ] **Step 3: E2E smoke** (μέσω UI + in-page fetch, owner token):
  1. Δοκιμαστικό intl order με PE ON + 1 Loading στάση → 1 pending LOADING ✓ (αν δεν καλύφθηκε ήδη στο Task 5 Step 9 μετά το deploy).
  2. Επιβεβαίωση εκκρεμούς με upload μικρής εικόνας → confirmed με sheet_url ✓ → «δελτίο» link ανοίγει signed URL ✓.
  3. daily_ops → Delivered → confirmed DELIVERY net 0 ✓.
  4. «Διόρθωση ανταλλαγής» → real taken 0 → αρχική reversed + νέα confirmed given=N/taken=0 ✓ → φαίνεται στη «Χωρίς πλήρη επιστροφή» ✓.
  5. weekly_intl → ανάθεση σε partner (VS) → pending PARTNER_PICKUP ✓ → αφαίρεση ανάθεσης → pending φεύγει ✓.
  6. Cascade delete δοκιμαστικού order → pending φεύγουν, confirmed ΜΕΝΟΥΝ (order_stop_id → null) ✓.
- [ ] **Step 4: Docs + μνήμη** — ενότητα «Φ2 (ημερομηνία)» στο PALLETS_SCHEMA_APPLIED (004, sheets endpoints, feeders, UI, ρόλος accountant)· μνήμη: Φ2 live, Αλεξία/accountant υπεύθυνη, ΣΗΜΕΙΩΣΗ: τα εθνικά ΔΕΝ έχουν Delivered μετάβαση στο UI — ο εθνικός DELIVERY feeder θα κουμπώσει όταν αποκτήσουν (μέχρι τότε: χειροκίνητη φόρμα).
- [ ] **Step 5: Commit + push**

```bash
git add docs/
git commit -m "docs(pallets): Φ2 live — feeders, sheets, UI (εφαρμογή 004 + smoke)"
git push
```
