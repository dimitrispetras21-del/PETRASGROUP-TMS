# COSTS — Αρχιτεκτονικό Σχέδιο

_v1 · 2026-08-10 · συντάκτης: Claude · βασίζεται στο κλειδωμένο
`TRIP_COSTS_SPEC.md` (+ §10.3) και το `TRIP_COSTS_DECISION_LOG.md` έως 10/8.
ΔΕΝ ξανανοίγει αποφάσεις μοντέλου — μόνο ΠΩΣ χτίζεται._

---

## 0. Πλαίσιο

- **Stack**: Supabase/Postgres (project `gatejgbpyodlepkvqkgf`) πίσω από Worker
  (Cloudflare) — όλα τα tables στη Supabase από το cutover 28/7.
- **Κανάλι build (locked §10.3)**: Claude γράφει SQL migrations → ο owner τα
  τρέχει στο Supabase SQL editor. Κώδικας API στο δικό μας repo.
- **Κυριότητα Worker 2 (owner, 10/8 βράδυ)**: η συνεργασία με satsilem /
  Valuedriven ΟΛΟΚΛΗΡΩΘΗΚΕ — παρέδωσε το v2 foundation και έκλεισε. Το
  Worker 2 περνά σε δική μας κυριότητα: source of truth γίνεται το repo μας,
  τα deploys γίνονται από εμάς με wrangler. Το split-brain ρίσκο του
  docs/worker/README.md παύει να υφίσταται μόλις ολοκληρωθεί η υιοθεσία (Φ0).
- **Auth σήμερα (από snapshot Worker 2)**: custom JWT (username+role claims,
  JWT_SECRET), ρόλοι `owner / management / accountant / dispatcher /
  warehouse`, `can(role, table, method)` PERMISSIONS map, Worker → PostgREST
  με `SUPABASE_SERVICE_KEY`, audit log σε κάθε mutation. Οι dispatchers
  αποκλείονται ρητά από cost/P&L tables (σενάριο R-04).

## 1. Backend home — ✅ ΑΠΟΦΑΣΙΣΤΗΚΕ (owner, 2026-08-10)

**Επέκταση του Worker 2, με δική μας κυριότητα.** Ο satsilem παραδόθηκε το
project και η συνεργασία έκλεισε· το ζητούμενο ήταν να χτίσει την
αρχιτεκτονική — **πατάμε πάνω σε αυτή**: ίδιο Worker, ίδιο JWT/auth, ίδιο
PERMISSIONS pattern, ίδιο facade + audit. Τα Costs endpoints (§4, §6)
μπαίνουν ως νέα routes στον ΙΔΙΟ κώδικα. Ένα API, ένα deploy, καμία αλλαγή
στο auth.

**Προαπαιτούμενο — Φ0 «Υιοθεσία Worker 2»:**
1. Κατέβασμα του ΤΡΕΧΟΝΤΟΣ deployed script με το CF API (εντολή στο
   docs/worker/README.md) — και για staging (`petras-tms-backend-staging`)
   και για το production Worker.
2. Το script μπαίνει στο repo μας ως source (`worker/src/`) + `wrangler.toml`·
   τα secrets (JWT_SECRET, SUPABASE_SERVICE_KEY) ΜΕΝΟΥΝ στο Cloudflare — δεν
   αντιγράφονται πουθενά.
3. Πρώτο no-op deploy από εμάς (wrangler) + smoke test (login, ένα GET) ⇒
   επιβεβαίωση κυριότητας. Από εδώ και πέρα ΚΑΘΕ αλλαγή: repo → wrangler,
   ποτέ dashboard editor (αυτό ήταν η πηγή του split-brain).
4. Ευκαιρία: τα χειροκίνητα TABLE_MAP fields του 5/8 (TRUCKS/TRAILERS —
   docs/worker/README.md) περνούν επιτέλους στο source μόνιμα.

## 2. Data model (SQL — Supabase)

Όλα σε schema `public`, πρόθεμα `ct_` (costs) για μηδενική σύγκρουση με
πίνακες του satsilem. Χρήματα: `numeric(10,2)`. Ημερομηνίες: `date`.

```sql
-- 2.1 Ρυθμίσεις (owner-only)
create table ct_settings (
  key   text primary key,          -- 'x_export' | 'x_import' | 'pallet_eur' | 'vat_default' | 'wear_fallback_eur_km'
  value numeric not null,
  updated_at timestamptz default now()
);
insert into ct_settings values
  ('x_export', 850, now()), ('x_import', 650, now()), ('pallet_eur', 12, now()),
  ('vat_default', 0.24, now()), ('wear_fallback_eur_km', 0.082, now());

-- 2.2 Round Trips — η ραχοκοκαλιά (ΕΝΑΣ πίνακας, scope field — locked)
create table ct_round_trips (
  id           bigint generated always as identity primary key,
  code         text unique,                      -- 'RT-2618' (sequence, human-readable)
  scope        text not null check (scope in ('INTL','NATL')),
  trip_type    text not null check (trip_type in ('OWNED','PARTNER')),
  truck_id     bigint references trucks(id),     -- required OWNED (constraint κάτω)
  driver_id    bigint references drivers(id),
  partner_id   bigint references partners(id),   -- required PARTNER
  date_start   date not null,                    -- allocation window ─┐ ΤΟ ΚΛΕΙΔΙ
  date_end     date,                             -- nullable όσο τρέχει ┘ του engine
  status       text not null default 'planned'
               check (status in ('planned','in_progress','closed','complete','cancelled')),
  total_km     integer,                          -- manual τώρα, MyGeotab Phase 2
  source       text not null default 'planner' check (source in ('planner','manual')),
  created_by   text not null,                    -- username από JWT
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  constraint owned_needs_truck     check (trip_type <> 'OWNED'   or truck_id   is not null),
  constraint partner_needs_partner check (trip_type <> 'PARTNER' or partner_id is not null)
);

-- 2.3 Σκέλη → orders. Ένα RT έχει 0..n legs ανά κατεύθυνση (groupage = πολλά
-- orders στο ίδιο leg). Έσοδα ΠΟΤΕ δεν αντιγράφονται — πάντα JOIN στο Price.
create table ct_rt_legs (
  id          bigint generated always as identity primary key,
  rt_id       bigint not null references ct_round_trips(id) on delete cascade,
  direction   text not null check (direction in ('EXPORT','IMPORT','ANODOS','KATHODOS')),
  order_id    bigint references orders(id),      -- INTL
  nat_load_id bigint references nat_loads(id),   -- NATL
  constraint one_source check ((order_id is null) <> (nat_load_id is null))
);
create unique index on ct_rt_legs(order_id)    where order_id    is not null;  -- 1 order → 1 RT
create unique index on ct_rt_legs(nat_load_id) where nat_load_id is not null;

-- 2.4 Παραστατικά κόστους (DKV/DADI/standalone/manual)
create table ct_cost_docs (
  id          bigint generated always as identity primary key,
  source      text not null check (source in ('DKV','DADI','STANDALONE','MANUAL')),
  entity      text check (entity in ('VERMION_FRESH','EUROFRESH')),
  invoice_no  text,
  period_from date,
  period_to   date,
  total_gross numeric(10,2),                    -- για το reconciliation guard
  status      text not null default 'draft'
              check (status in ('draft','confirmed')),   -- verify-before-commit
  file_url    text,                              -- Supabase storage (το σκαν)
  created_by  text not null,
  created_at  timestamptz default now()
);

-- 2.5 Γραμμές κόστους — Ο ΕΝΑΣ πίνακας που τα κρατά όλα (και fuel ledger)
create table ct_cost_lines (
  id          bigint generated always as identity primary key,
  doc_id      bigint references ct_cost_docs(id) on delete cascade,  -- null = χειροκίνητο (Shape C)
  rt_id       bigint references ct_round_trips(id),                  -- null = ΑΚΑΤΑΝΕΜΗΤΟ
  category    text not null,        -- 'fuel','tolls','dkv','adblue','driver_pay',
                                    -- 'cash_m','spedition','accommodation',
                                    -- 'ferry_train','fines','partner_rate','other'
  toll_country char(2),             -- MK,RS,HU,AT,SK,CZ,BE,PL,HR,SI,DE,NL,IT,RO,BG
  net         numeric(10,2) not null default 0,   -- ΦΠΑ ΧΩΡΙΣΤΑ (locked §10.3)
  vat         numeric(10,2) not null default 0,
  line_date   date,
  plate_raw   text,                 -- ό,τι γράφει το τιμολόγιο
  truck_id    bigint references trucks(id),       -- μετά το plate matching
  km_reading  integer,              -- ένδειξη οδομέτρου (reconciliation + consumption)
  liters      numeric(8,2),         -- fuel ledger: capture once, consume twice
  station     text,
  alloc_status text not null default 'unallocated'
              check (alloc_status in ('allocated','unallocated','review')),
  note        text,
  created_by  text not null,
  created_at  timestamptz default now()
);
create index on ct_cost_lines(rt_id);
create index on ct_cost_lines(alloc_status) where alloc_status <> 'allocated';

-- 2.6 Πινακίδες — aliases (ελληνικές/βουλγαρικές γραφές, OCR παραλλαγές)
create table ct_plate_aliases (
  alias    text primary key,        -- normalized: uppercase, χωρίς κενά/παύλες
  truck_id bigint not null references trucks(id)
);
```

**Views (τα νούμερα ΔΕΝ αποθηκεύονται — υπολογίζονται):**

```sql
-- Έσοδα RT: Σ Price των legs· σε VS international αφαιρείται το Χ και
-- πιστώνεται στο εθνικό RT (internal transfer, locked §10.2 item 6).
create view ct_v_rt_revenue as ...;   -- JOIN legs → orders.price / nat_loads
                                      -- + case VS: intl = price − x, natl = x

-- PnL: net cost = Σ(net) + wear· gross = net + Σ(vat)· wear (Shape D) =
-- rate(truck) × total_km, rate από maintenance bridge (κάτω).
create view ct_v_rt_pnl as ...;       -- margin_worst (με ΦΠΑ, primary)
                                      -- + margin_ex_vat (locked §10.3)

-- Maintenance bridge: Σ(maint_history.cost, 12μηνο) ÷ Σ(km) ανά truck,
-- fallback ct_settings.wear_fallback_eur_km (locked §10.2 item 10).
create view ct_v_wear_rate as ...;

-- Κατανάλωση: από ct_cost_lines (liters, km_reading) ανά truck/περίοδο.
create view ct_v_consumption as ...;

-- Partner PnL: αναθέσεις PARTNER + ζημιά παλετών από pallet ledger
-- (μη επιστραφείσες × pallet_eur) — αφαιρείται από το καθαρό (locked 10/8).
create view ct_v_partner_pnl as ...;
```

## 3. Round Trip lifecycle

```
planned ──(ημ/νία έναρξης ή 1η κατανομή)──▶ in_progress
   │                                            │
   │                              (χειροκίνητο κλείσιμο dispatcher·
   │                               MyGeotab geofence Phase 2)
   │                                            ▼
cancelled ◀──(ακύρωση — ΜΟΝΟ αν 0 γραμμές)   closed
                                                │
                        (όλα τα περιοδικά τιμολόγια της περιόδου
                         confirmed + 0 unallocated για το truck)
                                                ▼
                                            complete   ← badge «Πλήρες»
```

**Δημιουργία — δύο δρόμοι (locked 10/8):**
1. **Auto από planners** (κύριος δρόμος): όταν στο Weekly Intl κλείνει ζευγάρι
   export+import (ή solo), ο planner καλεί `POST /rt` με τα legs· στο Weekly
   Natl κάθε NAT_LOAD ανάθεση ⇒ εθνικό RT. Ο planner ήδη ξέρει truck, driver,
   dates — ΔΕΝ ξαναρωτάμε τον χρήστη.
2. **Manual** (Καταχώρηση Κόστους, modal «+ Νέο»): ίδιο endpoint,
   `source='manual'` — δίχτυ ασφαλείας για ξεχασμένα/ειδικά δρομολόγια.

**Sync rules (το #1 fragility κατά τα audits — ρητοί κανόνες):**
- Re-match order σε άλλο RT ⇒ μετακινείται το leg (τα έσοδα είναι JOIN,
  αυτοδιορθώνονται). Οι κατανεμημένες γραμμές κόστους ΜΕΝΟΥΝ στο RT — το
  κόστος είναι φυσική πραγματικότητα του φορτηγού, όχι του order.
- Αλλαγή truck ή dates σε RT με κατανεμημένες γραμμές ⇒ όσες γραμμές πέφτουν
  εκτός νέου παραθύρου γυρνούν `alloc_status='review'` — ΠΟΤΕ σιωπηλή απώλεια.
- Διαγραφή RT: επιτρέπεται μόνο `cancelled` με 0 γραμμές· αλλιώς οι γραμμές
  γυρνούν `unallocated` πρώτα (ο κανόνας never-delete των GL, εφαρμοσμένος
  στα κόστη).

## 4. Allocation engine (server-side ΜΟΝΟ)

```
για κάθε γραμμή L του confirmed doc:
  truck ← exact match plate_raw → trucks.license_plate
          ή ct_plate_aliases[normalize(plate_raw)]
          αλλιώς ⇒ review («άγνωστη πινακίδα»)
  T ← RT με truck_id=truck AND date_start ≤ L.date ≤ coalesce(date_end, today)
     0 αποτελέσματα ⇒ unallocated («ημέρα χωρίς trip»)
     2+ αποτελέσματα ⇒ review (tie-break: στενότερο παράθυρο· αλλιώς χέρι)
  αλλιώς ⇒ L.rt_id = T.id, alloc_status = 'allocated'
```

- **Reconciliation guard**: `Σ(net+vat όλων των γραμμών) == doc.total_gross`,
  αλλιώς το doc δεν γίνεται `confirmed`. Ποτέ σιωπηλά χαμένη γραμμή.
- **Idempotency**: re-run σε ήδη confirmed doc = no-op (οι γραμμές υπάρχουν
  ήδη — δεν ξαναδημιουργούνται).
- **Πού τρέχει**: στο Worker (επιλογές Α/Β) ως endpoint
  `POST /docs/:id/allocate`. Όχι στον browser: owner-only δεδομένα + ενιαία
  λογική + audit.

## 5. Ρόλοι & ασφάλεια

Mirror του υπάρχοντος PERMISSIONS pattern (Worker 2):

| Πίνακας / view | owner | accountant (Αλεξία) | management | dispatcher | warehouse |
|---|---|---|---|---|---|
| ct_round_trips | RW | R + create manual | — | RW μέσω planners + close | — |
| ct_cost_docs / ct_cost_lines | RW | RW (entry) | — | — | — |
| ct_settings | RW | R | — | — | — |
| ct_v_rt_pnl / ct_v_partner_pnl (ΑΠΟΤΕΛΕΣΜΑΤΑ) | **R — ΜΟΝΟ owner** | — | — | — | — |
| ct_v_consumption | R | R | R (Θοδωρής) | — | — |

- Enforcement στο **API layer** (can() map) όπως όλο το v2 σήμερα, + **DB
  grants** ανά ρόλο ως δεύτερη γραμμή άμυνας. Το spec §10.2 item 11 ζητά
  DB-level: με την επιλογή Γ γίνεται πλήρες RLS· με Α/Β ο service key είναι
  κοινός, οπότε το DB-level όριο είναι grants + κανένα endpoint δεν σερβίρει
  PnL χωρίς `role=owner` στο JWT.
- **Audit**: κάθε mutation σε ct_* γράφει στο υπάρχον audit log (ίδιο σχήμα
  actor/action/before/after) — οικονομικά δεδομένα, ρητή απαίτηση spec §9.
- `cash_m` (Έξοδα Μ): εμφανίζεται ΜΟΝΟ σε owner· στην Αλεξία μόνο ως πεδίο
  εισαγωγής, ποτέ σε λίστες/σύνολα.

## 6. Ροές δεδομένων (ποιος γράφει τι)

```
Weekly planners ──POST /rt──▶ ct_round_trips + ct_rt_legs
Αλεξία (Καταχώρηση):
  σκαν DKV ──parse──▶ ct_cost_docs(draft) + lines ──preview/έγκριση──▶
    confirmed ──allocate──▶ lines.rt_id  (unallocated → review bucket)
  σκαν DADI ──AI OCR (υπάρχον scan pipeline)──▶ ίδιο μονοπάτι + διόρθωση
  χειροκίνητα (Shapes B/C) ──form──▶ ct_cost_lines (net+vat, rt_id επιλεγμένο)
Maintenance module ──(υπάρχον)──▶ ct_v_wear_rate (μόνο ανάγνωση από εμάς)
Pallet Ledger ──(υπάρχον)──▶ ct_v_partner_pnl (ζημιά παλετών)
TRIP PnL / Partner PnL / Κατανάλωση ──GET views──▶ read-only UI
```

## 7. Φάσεις υλοποίησης

| Φάση | Παραδοτέο | Εξαρτήσεις |
|---|---|---|
| **Φ0** | Υιοθεσία Worker 2 (§1): source στο repo + wrangler.toml + no-op deploy + smoke test · μόνιμη ενσωμάτωση των χειροκίνητων TABLE_MAP fields | CF πρόσβαση (την έχει ο owner) |
| **Φ1** | SQL migration 001 (schema §2) · routes RT create/close/list στο Worker · χειροκίνητη καταχώρηση (Shape C) · TRIP PnL read (views) | Φ0 |
| **Φ2** | Planners auto-create RT (weekly_intl/natl integration) · sync rules §3 | Φ1 |
| **Φ3** | DKV parser (machine PDF) · allocation engine · reconciliation · review bucket UI | Φ1 |
| **Φ4** | DADI μέσω scan pipeline (OCR + verify) | Φ3 |
| **Φ5** | Κατανάλωση page · maintenance bridge · pallet loss στο Partner PnL | Φ1 |

Clean start (locked): κανένα backfill — PnL μετράει από το go-live της Φ2.

## 8. Ανοιχτά πριν τη Φ1

1. ~~Backend home~~ → ✅ αποφασίστηκε 10/8 (§1: Worker 2, δική μας κυριότητα).
2. **Φ0 — υιοθεσία Worker 2**: κατέβασμα deployed scripts (staging +
   production) με το CF API, wrangler setup, no-op deploy. Χρειάζεται μόνο
   την CF πρόσβαση του owner (dashboard ή API token).
3. FKs προς `trucks/drivers/partners/orders/nat_loads`: να επιβεβαιωθούν τα
   πραγματικά PK types στη Supabase (το σχέδιο υποθέτει bigint identity — αν
   είναι text/uuid, αλλάζουν μόνο οι δηλώσεις FK, τίποτα άλλο). Ένα SELECT
   στο information_schema στη Φ0 το κλείνει.
