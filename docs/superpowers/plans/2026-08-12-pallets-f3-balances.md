# Παλέτες Φ3 — Ισοζύγιο (εργαλείο διεκδίκησης) — Spec & Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Η Αλεξία να βλέπει ποιος μας χρωστάει, πόσο, **πόσο καιρό**, και πού δημιουργήθηκε η οφειλή — ώστε να παίρνει τηλέφωνο.

**Architecture:** Καμία αλλαγή στον Worker — τα `/pallets/balances` endpoints κάνουν `select *` στα views, άρα νέες στήλες περνάνε αυτόματα. Ένα migration (006) προσθέτει το `open_since` στα δύο views υπολοίπων· η σελίδα `modules/pallet_ledger.js` αποκτά δύο καρτέλες (Πελάτες / Συνεργάτες) με ανάλυση.

**Απόφαση owner (12/8):** το Ισοζύγιο είναι **εργαλείο διεκδίκησης**, όχι απλή εικόνα κατάστασης. Άρα ταξινόμηση κατά προτεραιότητα και ηλικία οφειλής στην πρώτη οθόνη.

## Global Constraints

- **«Ανοιχτό από» = η ημερομηνία από την οποία το υπόλοιπο ΔΕΝ ξαναμηδένισε** — όχι η πρώτη κίνηση. Αν κάποιος χρωστούσε, ξόφλησε και ξαναχρωστάει, μετράει από την τελευταία εκκαθάριση. Υπόλοιπο 0 ⇒ `open_since` NULL.
- Υπόλοιπα ΜΟΝΟ από `status='confirmed'`· τα pending χωριστά ως «εκκρεμείς».
- Θετικό υπόλοιπο = **μας χρωστάει**· αρνητικό = **χρωστάμε**.
- `create or replace view`: νέες στήλες ΜΟΝΟ στο τέλος, χωρίς αλλαγή των υπαρχουσών (αλλιώς αποτυγχάνει).
- Τα views κρατούν `with (security_invoker = true)` — χωρίς αυτό παρακάμπτουν το RLS.
- Ελληνικά labels· λειτουργικό σε tablet· ίδιο entry `renderPalletLedger` (router.js:300).
- `?v=` bump στο app.html σε κάθε αλλαγή αρχείου· commit + push ανά task.

---

### Task 1: Migration 006 — `open_since` στα views υπολοίπων

**Files:** Create `worker/migrations/006_pallets_ageing.sql`

**Produces:** στήλη `open_since date` στα `pl_v_balance_clients` / `pl_v_balance_partners` — την καταναλώνει το Task 2.

- [ ] **Step 1:** Γράψε το migration (πλήρες περιεχόμενο):

```sql
-- ============================================================
-- ΠΑΛΕΤΕΣ Φ3 — Migration 006: ηλικία οφειλής στα views υπολοίπων
-- Τρέξε ΟΛΟΚΛΗΡΟ στο Supabase SQL editor (project gatejgbpyodlepkvqkgf).
--
-- open_since = από πότε είναι ΑΝΟΙΧΤΗ η τρέχουσα οφειλή. ΟΧΙ η πρώτη κίνηση
-- του λογαριασμού: αν ο πελάτης χρωστούσε τον Μάιο, ξόφλησε τον Ιούνιο και
-- ξαναχρωστάει από τον Ιούλιο, η οφειλή είναι Ιουλίου. Υπολογίζεται ως η
-- πρώτη κίνηση ΜΕΤΑ την τελευταία φορά που το τρέχον υπόλοιπο μηδένισε.
-- Υπόλοιπο 0 σήμερα ⇒ open_since NULL (δεν υπάρχει ανοιχτή οφειλή).
--
-- ΠΡΟΣΟΧΗ: create or replace view δέχεται νέες στήλες ΜΟΝΟ στο τέλος.
-- ============================================================

create or replace view pl_v_balance_clients with (security_invoker = true) as
with conf as (
  select client_id, movement_date, id, (given - taken) as delta
  from pl_movements
  where status = 'confirmed' and client_id is not null
),
run as (
  select client_id, movement_date,
         sum(delta) over (partition by client_id order by movement_date, id) as running
  from conf
),
lastzero as (
  select client_id, max(movement_date) as zero_date
  from run where running = 0 group by client_id
),
ageing as (
  select r.client_id, min(r.movement_date) as open_since
  from run r
  left join lastzero z on z.client_id = r.client_id
  where z.zero_date is null or r.movement_date > z.zero_date
  group by r.client_id
)
select
  c.id           as client_id,
  c.company_name as client_name,
  coalesce(sum(m.given - m.taken) filter (where m.status = 'confirmed'), 0) as balance,
  count(*)       filter (where m.status = 'pending')                        as pending_count,
  a.open_since
from clients c
join pl_movements m on m.client_id = c.id
left join ageing a on a.client_id = c.id
group by c.id, c.company_name, a.open_since;

create or replace view pl_v_balance_partners with (security_invoker = true) as
with conf as (
  select partner_id, movement_date, id, (given - taken) as delta
  from pl_movements
  where status = 'confirmed' and partner_id is not null
),
run as (
  select partner_id, movement_date,
         sum(delta) over (partition by partner_id order by movement_date, id) as running
  from conf
),
lastzero as (
  select partner_id, max(movement_date) as zero_date
  from run where running = 0 group by partner_id
),
ageing as (
  select r.partner_id, min(r.movement_date) as open_since
  from run r
  left join lastzero z on z.partner_id = r.partner_id
  where z.zero_date is null or r.movement_date > z.zero_date
  group by r.partner_id
)
select
  p.id           as partner_id,
  p.company_name as partner_name,
  coalesce(sum(m.given - m.taken) filter (where m.status = 'confirmed'), 0) as balance,
  count(*)       filter (where m.status = 'pending')                        as pending_count,
  a.open_since
from partners p
join pl_movements m on m.partner_id = p.id
left join ageing a on a.partner_id = p.id
group by p.id, p.company_name, a.open_since;

-- ============================================================
-- ΕΛΕΓΧΟΣ:
--   select * from pl_v_balance_clients limit 5;   -- + στήλη open_since
--   select * from pl_v_balance_partners limit 5;
--   -- λογικός έλεγχος: όποιος έχει balance = 0 πρέπει να έχει open_since NULL
--   select count(*) from pl_v_balance_clients where balance = 0 and open_since is not null;  -- 0
-- ============================================================

-- 006_rollback: ξανατρέξε τα δύο view definitions του 003/004 χωρίς το ageing CTE.
```

- [ ] **Step 2:** Commit `git add worker/migrations/006_pallets_ageing.sql && git commit -m "feat(pallets): migration 006 — ηλικία ανοιχτής οφειλής στα views (Φ3)" && git push`

---

### Task 2: Καρτέλες Πελάτες / Συνεργάτες + ανάλυση

**Files:** Modify `modules/pallet_ledger.js`, `app.html` (?v= bump)

**Consumes:** `plFetch`, `/pallets/balances?type=clients|partners`, `/pallets/balances/clients/:id` (ανάλυση ανά σημείο), `/pallets/movements?client_id=|partner_id=` (ιστορικό), `open_since` (Task 1).

**Produces:** καρτέλες `clients` / `partners` στο `PLV.tab`, γραμμή συνολικής εικόνας, drill-down.

- [ ] **Step 1: Κατάσταση + φόρτωση**

Στο `PLV` object πρόσθεσε: `balances: {clients: null, partners: null}`.

Στη `renderPalletLedger`, μετά τη φόρτωση των movements/lookups, φόρτωσε ΚΑΙ τα δύο υπόλοιπα παράλληλα:

```js
    const [bc, bp] = await Promise.all([
      plFetch('/pallets/balances?type=clients'),
      plFetch('/pallets/balances?type=partners')
    ]);
    PLV.balances.clients = bc.records || [];
    PLV.balances.partners = bp.records || [];
```

- [ ] **Step 2: Δύο νέες καρτέλες**

Στον πίνακα καρτελών του `_plvDraw`, πρόσθεσε μετά τις υπάρχουσες:
`['clients', 'Πελάτες'], ['partners', 'Συνεργάτες']`

- [ ] **Step 3: Γραμμή συνολικής εικόνας (πάνω από τις καρτέλες)**

```js
function _plvOverview() {
  const all = [...(PLV.balances.clients || []), ...(PLV.balances.partners || [])];
  const owed = all.filter(b => b.balance > 0).reduce((s, b) => s + b.balance, 0);
  const owe  = all.filter(b => b.balance < 0).reduce((s, b) => s - b.balance, 0);
  const net = owed - owe;
  const box = (lbl, val, col) => `<div style="flex:1 1 150px;background:var(--panel,#fff);border:1px solid var(--line,#e2e8f0);border-radius:10px;padding:12px 16px">
    <div style="font-size:11px;color:var(--panel-dim);text-transform:uppercase;letter-spacing:.04em">${lbl}</div>
    <div style="font-family:Syne;font-size:22px;font-weight:700;color:${col}">${val} pal</div></div>`;
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:16px 0">
    ${box('Μας οφείλουν', owed, '#15803D')}
    ${box('Οφείλουμε', owe, '#B91C1C')}
    ${box('Καθαρό', (net > 0 ? '+' : '') + net, net >= 0 ? 'var(--accent)' : '#B91C1C')}
  </div>`;
}
```

Κάλεσέ το στο `_plvDraw` αμέσως μετά τον τίτλο.

- [ ] **Step 4: Απόδοση λίστας υπολοίπων**

```js
function _plvDays(d) {
  if (!d) return '';
  const days = Math.floor((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86400000);
  return days <= 0 ? 'σήμερα' : days + ' ημ.';
}

function _plvBalanceTable(kind) {
  const rows = (PLV.balances[kind] || [])
    .filter(b => b.balance !== 0 || b.pending_count > 0)
    .sort((a, b) => b.balance - a.balance); // πρώτα όποιος μας χρωστάει τα περισσότερα
  if (!rows.length) return '<div style="padding:30px;text-align:center;color:var(--panel-dim)">Κανένα ανοιχτό υπόλοιπο</div>';
  const idKey = kind === 'clients' ? 'client_id' : 'partner_id';
  const nameKey = kind === 'clients' ? 'client_name' : 'partner_name';
  return `<div style="overflow-x:auto"><table class="plv-tbl" style="width:100%;border-collapse:collapse;font-size:13px">
    <tr style="text-align:left;color:var(--panel-dim)">
      <th>${kind === 'clients' ? 'Πελάτης' : 'Συνεργάτης'}</th>
      <th style="text-align:right">Υπόλοιπο</th><th>Ανοιχτό από</th>
      <th style="text-align:right">Εκκρεμείς</th><th></th></tr>
    ${rows.map(b => `<tr style="border-top:1px solid var(--line,#e2e8f0);cursor:pointer" onclick="plvDrill('${kind}',${b[idKey]})">
      <td>${b[nameKey] || ('#' + b[idKey])}</td>
      <td style="text-align:right;font-weight:700;color:${b.balance > 0 ? '#15803D' : b.balance < 0 ? '#B91C1C' : 'inherit'}">${b.balance > 0 ? '+' : ''}${b.balance}</td>
      <td>${_plvDays(b.open_since)}</td>
      <td style="text-align:right">${b.pending_count || ''}</td>
      <td style="color:var(--accent);font-size:12px">ανάλυση →</td></tr>`).join('')}
  </table></div>`;
}
```

Στο `_plvDraw`: αν `PLV.tab==='clients'` ή `'partners'`, εμφάνισε `_plvBalanceTable(PLV.tab)` αντί για τον πίνακα κινήσεων, και κρύψε τα φίλτρα αναζήτησης/ημερομηνίας (αφορούν κινήσεις). Το Export CSV μένει ορατό.

- [ ] **Step 5: Ανάλυση (drill-down) σε modal**

```js
async function plvDrill(kind, id) {
  const nameKey = kind === 'clients' ? 'client_name' : 'partner_name';
  const idKey = kind === 'clients' ? 'client_id' : 'partner_id';
  const row = (PLV.balances[kind] || []).find(b => b[idKey] === id);
  const el = document.getElementById('plvModal');
  el.innerHTML = '<div style="position:fixed;inset:0;background:rgba(11,25,41,.55);display:flex;align-items:center;justify-content:center;z-index:1000"><div style="background:var(--panel,#fff);border-radius:12px;padding:24px">Φόρτωση...</div></div>';
  try {
    const q = kind === 'clients' ? 'client_id=' + id : 'partner_id=' + id;
    const [hist, locs] = await Promise.all([
      plFetch('/pallets/movements?' + q),
      kind === 'clients' ? plFetch('/pallets/balances/clients/' + id) : Promise.resolve({ records: [] })
    ]);
    const moves = (hist.records || []).filter(m => m.status !== 'reversed');
    const locRows = (locs.records || []).filter(l => l.balance !== 0);
    el.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(11,25,41,.55);display:flex;align-items:center;justify-content:center;z-index:1000" onclick="if(event.target===this)plvCloseModal()">
      <div style="background:var(--panel,#fff);border-radius:12px;padding:24px;width:min(720px,94vw);max-height:88vh;overflow:auto">
        <h3 style="font-family:Syne;margin:0 0 4px">${row ? row[nameKey] : ''}</h3>
        <div style="font-size:13px;color:var(--panel-dim);margin-bottom:16px">
          Υπόλοιπο <b style="color:${row && row.balance > 0 ? '#15803D' : '#B91C1C'}">${row ? (row.balance > 0 ? '+' : '') + row.balance : '—'} pal</b>
          ${row && row.open_since ? ' · ανοιχτό ' + _plvDays(row.open_since) : ''}</div>
        ${locRows.length ? `<div style="font-size:12px;font-weight:700;color:var(--panel-dim);margin-bottom:6px">ΑΝΑ ΣΗΜΕΙΟ</div>
        <table class="plv-tbl" style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px">
          ${locRows.map(l => `<tr style="border-top:1px solid var(--line,#e2e8f0)"><td>${l.location_name || '—'}</td>
          <td style="text-align:right;font-weight:700;color:${l.balance > 0 ? '#15803D' : '#B91C1C'}">${l.balance > 0 ? '+' : ''}${l.balance}</td></tr>`).join('')}
        </table>` : ''}
        <div style="font-size:12px;font-weight:700;color:var(--panel-dim);margin-bottom:6px">ΙΣΤΟΡΙΚΟ</div>
        <table class="plv-tbl" style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="text-align:left;color:var(--panel-dim)"><th>Ημ/νία</th><th>Είδος</th><th>Σημείο</th>
            <th style="text-align:right">Πήραμε</th><th style="text-align:right">Δώσαμε</th><th>Κατάσταση</th></tr>
          ${moves.map(m => `<tr style="border-top:1px solid var(--line,#e2e8f0)">
            <td>${m.movement_date}</td><td>${PLV_EVENT_GR[m.event_type] || m.event_type}</td>
            <td>${_plvLoc(m)}</td><td style="text-align:right">${m.taken}</td>
            <td style="text-align:right">${m.given}</td>
            <td>${m.status === 'pending' ? 'εκκρεμής' : 'οριστική'}</td></tr>`).join('') ||
            '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--panel-dim)">Καμία κίνηση</td></tr>'}
        </table>
        <div style="display:flex;justify-content:flex-end;margin-top:16px">
          <button class="btn-scan" onclick="plvCloseModal()">Κλείσιμο</button></div>
      </div>
    </div>`;
  } catch (e) {
    el.innerHTML = '';
    showErrorToast('Αποτυχία ανάλυσης: ' + e.message, 'error');
  }
}
```

- [ ] **Step 6: CSV υπολοίπων**

Στην `plvExportCSV`, αν `PLV.tab` είναι `clients`/`partners`, εξάγαγε τη λίστα υπολοίπων (Αντισυμβαλλόμενος, Υπόλοιπο, Ανοιχτό από, Ημέρες, Εκκρεμείς) αντί για κινήσεις. Κράτα το BOM.

- [ ] **Step 7: Exports**

`window.plvDrill = plvDrill;` — χωρίς αυτό η γραμμή δεν ανοίγει.

- [ ] **Step 8:** `node --check modules/pallet_ledger.js` → exit 0 · `?v=` bump · commit + push.

---

### Task 3: Εφαρμογή + επαλήθευση live (controller)

- [ ] Migration 006 στο Supabase SQL editor + οι έλεγχοι του αρχείου (ιδίως: balance=0 ⇒ open_since NULL).
- [ ] Στο live app: καρτέλες Πελάτες/Συνεργάτες αποδίδουν· συνολική εικόνα σωστή· drill-down ανοίγει με ανά-σημείο + ιστορικό· CSV κατεβαίνει· κονσόλα καθαρή.
- [ ] Docs: ενότητα Φ3 στο `docs/PALLETS_SCHEMA_APPLIED_2026-08-10.md` + μνήμη.
