# Β0 — Τιμολόγηση από την καταχώρηση: πλάνο υλοποίησης

> **Για agents που εκτελούν:** ΑΠΑΙΤΕΙΤΑΙ sub-skill: `superpowers:subagent-driven-development` (προτείνεται) ή `superpowers:executing-plans`, εργασία ανά εργασία. Τα βήματα έχουν checkbox (`- [ ]`) για παρακολούθηση.

**Goal:** Κάθε παραγγελία (διεθνής, εθνική, η παρτίδα αποθήκης και η pre-order) γίνεται «προς κοπή» μόλις καταχωρηθεί. Μόνο η τιμή > 0 μπλοκάρει, όχι η παράδοση, το απόθεμα ή το δελτίο παλετών. Το checkbox «Invoiced» και το PATCH του accountant μένουν όπως είναι. (Owner 21/10/2026, spec `docs/superpowers/specs/2026-10-21-national-v5-design.md`, «Χρήματα» πρώτη κουκκίδα και §6 Β0.)

**Architecture:** Δύο σκέλη σε **ένα PR** (`fix/invoice-from-registration`):
1. **Front end.** Ο κανόνας ζει σε ένα σημείο, το `OrdersData` του `core/orders-common.js`: σύνολο, `stateOf`, `ageOf` και ο έλεγχος δελτίου. Από εκεί διαβάζουν τα badges του hub, το «Προς τιμολόγηση», το «Χωρίς τιμή» και η «Εβδομάδα». Ακολουθούν οι καθρέφτες του κανόνα: η κάρτα τιμολόγησης, το «Χωρίς τιμή», η σήμανση παρτίδας στη φόρμα διεθνούς, και το `OrdersStock.reopenable`/`closeText`.
2. **Βάση.** Το draft `071a` ξαναγράφει τους τρεις φρουρούς του 057 (`stock_guard_lots`, `stock_guard_orders`, `stock_guard_natl`), ξεκινώντας από το **ζωντανό** κείμενό τους με αντικαταστάσεις φυλαγμένες με md5 (μοτίβο 069). Κάθε κανόνας που διάβαζε το «τιμολογήθηκε» ως «η παρτίδα τελείωσε» φεύγει. Μένει μόνο το πάγωμα της **τιμής**. Στον ελεγκτή: το S-03 απενεργοποιείται με αιτία, και το B-15 μετρά την παρτίδα από τη δική της παράδοση. Τα τρία αρχεία SQL που γράφουν **παράγονται** από `tools/build-071a.mjs`, ποτέ με το χέρι.

**Tech Stack:** Vanilla JS (browser + `node --test`), Postgres/Supabase (PL/pgSQL, ένα DO block), PGlite για τοπική απόδειξη (`tms-auditor`), Playwright rigs (`tests/critics/*`).

## Global Constraints

- **Κανόνες session (CLAUDE.md):** branch από `origin/main` (κανόνας 8). **Ποτέ push στο `main`**: push του branch, PR, και το merge το κάνει ο Δημήτρης. Ποτέ force push.
- **Βάση:** από τον agent μόνο SELECT. Το `071a` το τρέχει **ο owner**, στον SQL editor, **μετά τις 15:00**, με **ρητό «ναι» στη συνομιλία**, με σειρά verify → dry run → 071a → verify. **Πρώτα η βάση, μετά το merge του PR**, ώστε να μην υπάρχει ούτε στιγμή όπου η οθόνη προσφέρει κάτι που η βάση αρνείται. Στην επαναφορά, η σειρά αντιστρέφεται.
- **Κάθε αλλαγή αρχείου front end:** bump του `?v=` του στο `app.html` **και** του `SW_VERSION` στο `sw.js`, με το ίδιο TIMESTAMP (εργασία 7).
- **Σχόλια κώδικα στα αγγλικά**, και εξηγούν το ΓΙΑΤΙ. Συζήτηση και έγγραφα στα ελληνικά.
- **Τα SQL αρχεία μόνο ASCII.** Τα ελληνικά ταξιδεύουν ως base64 (προηγούμενο: 066).
- **Χωρίς αλλαγή στον Worker.** Το `invoiceMarkError` (τιμή + ΤΠΥ) μένει ως έχει. Το `stockRuleError` μεταφράζει όποιο `stock:<code>` σε 422.
- **Το `DECISION_LOG` ΔΕΝ είναι μέρος αυτού του πλάνου.** Γράφεται αλλού.
- **Το repo είναι δημόσιο.** Τα fixtures είναι συνθετικά, και ονόματα πελατών δεν μπαίνουν σε commit.
- **«Η απόδειξη είναι ο πίνακας»:** η εργασία 15 μετρά τη λίστα της οθόνης απέναντι σε SELECT, πριν και μετά.

---

## Αποφάσεις του owner: ΚΛΕΙΣΤΕΣ (owner 22/10/2026)

Και οι τρεις απαντήθηκαν, και το πλάνο είναι γραμμένο ήδη με τις απαντήσεις. Δεν ξανασυζητιούνται εδώ.

**Α. ΝΑΙ: φεύγουν και τα 14 σημεία των φρουρών παρτίδας· μένει μόνο το πάγωμα της τιμής** (owner 22/10: «Ναι, παγώνει μόνο η τιμή»). Το spec όριζε τρεις φρουρούς (`invoice_incomplete`, `lot_invoiced` στα `:1302, :1368, :1378`). Το ζωντανό κείμενο έχει **14** σημεία όπου το «τιμολογήθηκε» σημαίνει «η παρτίδα τελείωσε»: 4 `lot_invoiced` και 1 `reopen_invoiced` στο `stock_guard_lots`, και από 5 `lot_invoiced` και 1 `invoice_incomplete` στα `stock_guard_orders` και `stock_guard_natl`. Αν άλλαζαν μόνο οι τρεις, μια παρτίδα τιμολογημένη από την καταχώρηση δεν θα έδινε ποτέ κομμάτι, δεν θα έσβηνε κομμάτι, δεν θα γινόταν παρτίδα αν τιμολογήθηκε πρώτα, και δεν θα ξανάνοιγε ή θα αποσημαινόταν. Φεύγουν και τα 14. Μένει **μόνο** το πάγωμα της τιμής μετά το τιμολόγιο (`:1378` και το εθνικό αντίστοιχο), γιατί το τιμολόγιο γράφει αυτή την τιμή.

**Β. ΝΑΙ: οι pre-orders (Ops Status `Provisional`, Παντελής) ΕΜΦΑΝΙΖΟΝΤΑΙ στο «Προς τιμολόγηση»** (owner 22/10: «Ναι, και αυτά»). Το `stateOf` δεν επιστρέφει πια ποτέ `pending`: μια pre-order με τιμή είναι «προς κοπή», και χωρίς τιμή είναι «Χωρίς τιμή». Τι έγινε για να μείνει ο κανόνας συνεπής:
- **Δελτίο παλετών:** ρωτιέται μόνο για **παραδομένη** παραγγελία. Μια pre-order δεν έχει παραδοθεί, οπότε δεν ρωτιέται, όπως κάθε μη παραδομένη. Τίποτα ειδικό για τις pre-orders.
- **Ηλικία (`ageOf`), «Παλαιότερη εκκρεμής», «καθυστέρηση > 30»:** από την παράδοση, και «—» πριν από αυτήν. Το ίδιο ισχύει για τις pre-orders.
- **«Χωρίς τιμή»:** διαβάζει το ίδιο `stateOf`, άρα οι pre-orders χωρίς τιμή μπαίνουν. Στις 22/10 και οι 4 pre-orders ήταν χωρίς τιμή, άρα «Χωρίς τιμή» 30, όχι 26. Το φίλτρο της ενότητας «Συμπληρώθηκαν σήμερα» δεν εξαιρεί πια το `pending` (εργασία 4), γιατί δεν παράγεται.
- **«Εβδομάδα»** (`orders_week_view.js`): το κλειδί `pending` («σε εξέλιξη») δεν παράγεται πια από το `stateOf`. Μένει στον κώδικα της «Εβδομάδας» ως νεκρό κλαδί, όπως τα `stock`/`sheets` (βλ. «Εκτός πλάνου»).
- Έλεγξα (grep `Provisional`/`Ops Status` σε `core/`, `modules/`): **καμία άλλη διαδρομή τιμολόγησης** δεν εξαιρεί τις pre-orders. Τα `weekly_intl.js:7455/7602/7693` και το `lot_provisional` του 057 αφορούν το **απόθεμα**: μια παρτίδα pre-order δεν δίνει κομμάτια. Δεν αφορούν την τιμολόγηση, και μένουν.
- Fixtures: το `i8` του `orders-invoicing-view` φεύγει, και το `recX5` του rig «Χωρίς τιμή» γίνεται «ακυρωμένη» (εργασίες 5 και 6).

**Γ. ΝΑΙ: ελεγκτής** (απόφαση 21/10, επιβεβαίωση owner 22/10). Το S-03 (P1, κάθε ώρα, «τιμολογημένη παρτίδα που δεν είναι πλήρης») **απενεργοποιείται με αιτία**· από 21/10 αυτό είναι κανονική κατάσταση. Το B-15 (ουρά, P3) μετρά την παρτίδα από τη **δική της** παράδοση, όπως η οθόνη (`OrdersData.ageOf`).

---

## Τι μετρήθηκε στην παραγωγή 22/10/2026 (μόνο SELECT)

| Τι | Τιμή |
|---|---|
| `md5(prosrc)` `stock_guard_lots` / `_orders` / `_natl` | `46e61e5f4c1e74af19cba5ddaa9f2975` / `20833484dffdf168b1e1de9fdc242027` / `26b4cc060ab15152a51693c9f0a67f81`. Είναι **ίσα byte προς byte** με τα σώματα του `worker/migrations/drafts/057_stock_lots.sql`. Το 057 εκτελέστηκε, αν και το αρχείο μένει στο `drafts/`. |
| Ιδιότητες φρουρών | `SECURITY INVOKER`, `search_path=public`, owner `postgres`, ACL `{postgres=X, service_role=X}`, 3 triggers `enabled = O` |
| Ελεγκτής | S-03 enabled, `md5(sql_text)=0df9746599fb62724c719d2f467ff280` · B-15 `40d8808efe298f7321a8706dc726a784` · B-54 `red_value=37` = ζωντανά triggers |
| Παρτίδες | 2 ζωντανές, 0 τιμολογημένες, 2 όχι πλήρεις· 1 διεθνές κομμάτι, 0 εθνικά |
| Διεθνείς ανοιχτές (χωρίς κομμάτια και σκέλη) | **σήμερα** «προς κοπή» 19, «χωρίς τιμή» 22 (παραδομένες) → **με Β0** 47 και **30**. Μέσα και οι 4 pre-orders, όλες χωρίς τιμή (απόφαση Β). |
| Εθνικές ανοιχτές | 1 με τιμή, ίδια και με τους δύο κανόνες |
| Διεθνείς με ανταλλαγή παλετών, ατιμολόγητες, όχι παραδομένες | 13. Αυτές **δεν** ρωτούνται πια για δελτίο. |
| Next free migration | `070` (ValueDriven draft) πιασμένο, `071` κρατημένο για το σχήμα national v5 → **`071a`** |

Η βάση των αριθμών των tests είναι `origin/main` `62d09f9d`: `node --test` = **686/686**. Το rig «Προς τιμολόγηση» βγάζει 79/80, και το «Φύλλο ERP» stock-orders 322/323· και οι δύο αποτυχίες υπάρχουν ήδη, βλ. εργασία 6.

## Χάρτης αρχείων

| Αρχείο | Ευθύνη |
|---|---|
| `tests/invoice-from-registration.test.js` (νέο) | Ο νέος κανόνας, γραμμένος πρώτα, αποτυγχάνει πρώτα (8 tests) |
| `core/orders-common.js` | `OrdersData`: σύνολο, `stateOf`, `ageOf`, δελτίο μόνο μετά την παράδοση· `OrdersStock.reopenable`, `closeText` |
| `modules/orders_invoicing_view.js` | Κάρτα «Προς τιμολόγηση»: πού βρίσκεται η παράδοση, η παρτίδα ως πληροφορία, «Κλείσιμο υπολοίπου» στους ΕΛΕΓΧΟΥΣ, χωρίς προειδοποίηση «πριν την παράδοση», χωρίς `lotDone` |
| `modules/orders_noprice_view.js` | «Χωρίς τιμή»: ίδια ηλικία με το `ageOf`, χωρίς τα νεκρά κλαδιά «stock» |
| `modules/orders_intl.js` | Η σήμανση παρτίδας δεν απαγορεύεται πια σε τιμολογημένη (καθρέφτης του 071a) |
| `tests/orders-stock.test.js`, `tests/orders-invoicing-view.test.js`, `tests/orders-week-view.test.js` | Τα tests του παλιού κανόνα περνούν στον νέο |
| `tests/critics/stock-orders-rig.js`, `tests/critics/orders-noprice-proof.js` | Rigs: οι παλιοί ισχυρισμοί περνούν στον νέο κανόνα |
| `app.html`, `sw.js` | Cache bust |
| `tms-auditor/checks/S-03.sql`, `tms-auditor/checks/B-15.sql`, `worker/migrations/drafts/047b_monitoring_seed.sql` | Ελεγκτής: πηγή + παραγόμενο seed |
| `worker/migrations/drafts/tools/build-071a.mjs` (νέο) | Παράγει τα 3 αρχεία SQL που γράφουν |
| `worker/migrations/drafts/071a_invoice_from_registration.sql` / `_dryrun.sql` / `_rollback.sql` (νέα, παραγόμενα) | Η αλλαγή, η πρόβα, η επαναφορά |
| `worker/migrations/drafts/071a_invoice_from_registration_verify.sql` (νέο) | Μόνο ανάγνωση, «before»/«after» |
| `tests/sql-071a-drafts.test.js` (νέο) | Αλυσίδα md5, ASCII, ένα DO block, τι φεύγει και τι μένει |
| `tms-auditor/test/rules-071a.test.mjs` (νέο) | PGlite: 17 περιπτώσεις πριν, μετά και μετά την επαναφορά· πρόβα· άρνηση |
| `docs/sessions/2026-10-22-dimitris-invoice-from-registration.md` (νέο) | Ίχνος session |

**Γιατί δεν υπάρχει `_test.sql` για την παραγωγή:** οι κανόνες αποδεικνύονται στο PGlite με το **ίδιο ακριβώς** κείμενο συναρτήσεων (το 057 = το ζωντανό, με απόδειξη md5) και με τα **ίδια παραγόμενα αρχεία** που θα τρέξει ο owner. Ένα `_test.sql` στην παραγωγή θα έγραφε δοκιμαστικές παραγγελίες πάνω από τα triggers RT και μισθοδοσίας για να αποδείξει ό,τι αποδεικνύει ήδη το PGlite. Στην παραγωγή τρέχουν το verify (md5 και μετρήσεις) και ο έλεγχος μέχρι τον πίνακα (εργασία 15).

---

### Εργασία 0: Branch από το φρέσκο `main`

**Files:** κανένα.

- [ ] **Βήμα 1: fetch και branch**

```bash
cd /Users/dimitrispetras/PETRASGROUP-TMS
git fetch origin
git worktree add .claude/worktrees/b0-invoice -b fix/invoice-from-registration origin/main
cd .claude/worktrees/b0-invoice
git log --oneline -15 origin/main
```

Αναμενόμενο: `HEAD` = `origin/main`. Αν από το `62d09f9d` άλλαξαν τα αρχεία του χάρτη, διάβασέ τα πριν γράψεις:

```bash
git log --oneline 62d09f9d..origin/main -- core/orders-common.js modules/orders_invoicing_view.js modules/orders_noprice_view.js modules/orders_intl.js tests/orders-stock.test.js tests/orders-invoicing-view.test.js tests/orders-week-view.test.js tests/critics/stock-orders-rig.js tests/critics/orders-noprice-proof.js tms-auditor/checks worker/migrations/drafts/057_stock_lots.sql app.html sw.js
```

Αναμενόμενο: κενό, ή commits που διαβάζεις πριν συνεχίσεις. Αν το `git fetch` αποτύχει, **σταμάτα** (κανόνας 8).

- [ ] **Βήμα 2: γραμμή βάσης**

```bash
TZ=Europe/Athens node --test tests/*.test.js tests/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```

Αναμενόμενο στο `62d09f9d`: `ℹ tests 686`, `ℹ pass 686`, `ℹ fail 0`. Σημείωσε τον αριθμό σου, γιατί οι επόμενοι στόχοι είναι σχετικοί με αυτόν.

---

### Εργασία 1: Ο νέος κανόνας ως test, που αποτυγχάνει πρώτα

**Files:**
- Create: `tests/invoice-from-registration.test.js`

**Interfaces (στόχος, που ακόμη δεν ισχύει):**
- `OrdersData.loadInvoicingSet()` διαβάζει ORDERS και NATIONAL ORDERS με `OR({Status}!="Cancelled",{Invoiced}=1)`
- `OrdersData.stateOf(set, rec)` → `{key:'invoiced'|'cancelled'|'pending'|'blocked'|'ready', reason?:'price', noSheets?:true}`, και το `pending` δεν επιστρέφεται πια (pre-orders μέσα, απόφαση Β)
- `OrdersData.ageOf(set, rec)` → ημέρες από την παράδοση, ή `null` πριν από αυτήν
- `OrdersInvoicingView.pure.dateCheck(dateYmd, todayYmd)` (2 ορίσματα)· το `lotDone` δεν υπάρχει πια
- `OrdersStock.reopenable(lot)` ανεξάρτητο από το `Invoiced`

- [ ] **Βήμα 1: γράψε το test**

```js
// tests/invoice-from-registration.test.js — run: TZ=Europe/Athens node --test tests/invoice-from-registration.test.js
// B0 (owner 21/10/2026, spec docs/superpowers/specs/2026-10-21-national-v5-design.md «Χρήματα»): every
// order — international, national, a stock lot too — is invoiced from its registration. Not the delivery,
// not the stock, not the pallet slip; only a price > 0 stops it (Worker invoiceMarkError + migration 043).
// These are the rules of OrdersData (core/orders-common.js), the ONE place the hub badges, «Προς
// τιμολόγηση», «Χωρίς τιμή» and the week view read, plus the pieces of «Προς τιμολόγηση» and of
// OrdersStock that followed the old rule. The base side (071a) is proven in tms-auditor/test/rules-071a.test.mjs.
process.env.TZ = 'Europe/Athens';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'data-helpers.js'), 'utf8'));
global.TmsWeek = require('../core/tms-week.js');
const { OrdersCommon, OrdersData, OrdersStock } = require('../core/orders-common.js');
global.OrdersCommon = OrdersCommon;
global.OrdersData = OrdersData;
global.OrdersStock = OrdersStock;
const V = require('../modules/orders_invoicing_view.js');

const TODAY = OrdersCommon.today();
const at = n => OrdersCommon.addDays(TODAY, n) + 'T10:00:00';   // n < 0 = past, n > 0 = future

// ── a little in-memory facade (same shape as tests/orders-stock.test.js) ──
let calls, db;
beforeEach(() => {
  calls = [];
  db = { orders: [], natl: [], lots: [] };
  global.TABLES = { ORDERS: 'tblO', NAT_ORDERS: 'tblN', STOCK_LOTS: 'tblStockLots' };
  global.FEATURES = { ORDER_SPLIT: true, STOCK_LOTS: true };
  global.ROLE = 'accountant';
  global.atGet = async (table, formula) => {
    calls.push(['atGet', table, formula]);
    return (table === 'tblO' ? db.orders : db.natl).map(r => ({ id: r.id, fields: Object.assign({}, r.fields) }));
  };
  global.atGetAll = async (table, opts) => {
    calls.push(['atGetAll', table, (opts || {}).filterByFormula || '']);
    return table === 'tblStockLots' ? db.lots.map(r => ({ id: r.id, fields: Object.assign({}, r.fields) })) : [];
  };
  global.plFetch = async url => { calls.push(['plFetch', url]); return { records: [] }; };
});

const intl = (id, f) => ({ id, _type: 'intl', fields: Object.assign({ Direction: 'Export', Client: ['recA'] }, f) });
const natl = (id, f) => ({ id, _type: 'natl', fields: Object.assign({ Direction: 'North→South', Client: ['recG'] }, f) });
const SET = extra => Object.assign({ intl: [], natl: [], gate: {}, gateFailed: false, stock: new Map(), stockFailed: false }, extra);

test('the set: every order that is not cancelled (an invoiced one stays) — the delivery no longer filters', async () => {
  await OrdersData.loadInvoicingSet(true);
  const reads = calls.filter(c => c[0] === 'atGet').map(c => [c[1], c[2]]);
  assert.deepStrictEqual(reads, [['tblO', 'OR({Status}!="Cancelled",{Invoiced}=1)'], ['tblN', 'OR({Status}!="Cancelled",{Invoiced}=1)']]);
});

test('an order not yet delivered, priced, is «ready» — international and national', () => {
  const s = SET();
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('i1', { Status: 'Assigned', Price: 1200, 'Delivery DateTime': at(3) })), { key: 'ready' });
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('i2', { Status: 'Pending', Price: 900 })), { key: 'ready' }, 'no dates at all');
  assert.deepStrictEqual(OrdersData.stateOf(s, natl('n1', { Price: 500, 'Delivery DateTime': at(5) })), { key: 'ready' });
});

test('only the price blocks; a pre-order is invoiced like any order (owner 22/10); cancelled and invoiced keep their state', () => {
  const s = SET();
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('i1', { Status: 'Assigned', 'Delivery DateTime': at(3) })), { key: 'blocked', reason: 'price' });
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('i2', { Status: 'Assigned', Price: 0 })), { key: 'blocked', reason: 'price' }, '0 € = no price');
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('i3', { Status: 'Pending', Price: 800, 'Ops Status': 'Provisional' })), { key: 'ready' }, 'a pre-order: ready');
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('i3b', { Status: 'Pending', 'Ops Status': 'Provisional' })), { key: 'blocked', reason: 'price' }, 'an unpriced pre-order: «Χωρίς τιμή»');
  assert.strictEqual(OrdersData.stateOf(s, intl('i4', { Status: 'Cancelled', Price: 800 })).key, 'cancelled');
  assert.strictEqual(OrdersData.stateOf(s, intl('i5', { Status: 'Assigned', Price: 800, Invoiced: true, 'Invoice Number': '0900' })).key, 'invoiced');
});

test('a stock lot is invoiced like any order: waiting for its pieces, or its lots unread, it is «ready»', () => {
  const lot = intl('iL', { Status: 'Delivered', Price: 3300, 'Own Stock Lot': 'recLot1', 'Delivery DateTime': at(-2) });
  const waiting = { id: 'recLot1', fields: { Complete: false, Pieces: 2, 'Pieces Delivered': 0, 'Remaining Pallets': 13 } };
  assert.deepStrictEqual(OrdersData.stateOf(SET({ stock: new Map([['recLot1', waiting]]) }), lot), { key: 'ready' });
  assert.deepStrictEqual(OrdersData.stateOf(SET({ stock: null, stockFailed: true }), lot), { key: 'ready' }, 'a failed lot read no longer blocks');
  const transit = intl('iL2', { Status: 'In Transit', Price: 3300, 'Own Stock Lot': 'recLot1' });
  assert.deepStrictEqual(OrdersData.stateOf(SET(), transit), { key: 'ready' }, 'not yet in the warehouse');
});

test('the pallet slip is asked about only after the delivery', async () => {
  const s = SET({ gate: { iD: { sheets_ok: false }, iU: { sheets_ok: false } } });
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('iD', { Status: 'Delivered', Price: 1000, 'Pallet Exchange': true })), { key: 'ready', noSheets: true });
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('iU', { Status: 'Assigned', Price: 1000, 'Pallet Exchange': true })), { key: 'ready' }, 'no slip can exist before the delivery');
  db.orders = [intl('iD', { Status: 'Delivered', Price: 1000, 'Pallet Exchange': true }), intl('iU', { Status: 'Assigned', Price: 1000, 'Pallet Exchange': true })];
  await OrdersData.loadInvoicingSet(true);
  assert.deepStrictEqual(calls.filter(c => c[0] === 'plFetch').map(c => c[1]), ['/pallets/gate?order_recs=iD']);
});

test('age: days since the order\'s own delivery, a lot too; none before the delivery', () => {
  assert.strictEqual(OrdersData.ageOf(SET(), intl('a', { Status: 'Delivered', 'Delivery DateTime': at(-5) })), 5);
  assert.strictEqual(OrdersData.ageOf(SET(), intl('b', { Status: 'Assigned', 'Delivery DateTime': at(3) })), null, 'never «-3 ημέρες»');
  assert.strictEqual(OrdersData.ageOf(SET(), intl('c', { Status: 'Pending' })), null);
  const lot = intl('L', { Status: 'Delivered', 'Own Stock Lot': 'recLot1', 'Delivery DateTime': at(-40) });
  assert.strictEqual(OrdersData.ageOf(SET({ stock: new Map([['recLot1', { id: 'recLot1', fields: { Complete: false } }]]) }), lot), 40,
    'from its own delivery into the warehouse (B-15 counts the same since 071a)');
});

test('«Προς τιμολόγηση»: an order not yet delivered is a row «προς κοπή»; the invoice date may precede the delivery', () => {
  const set = SET({ intl: [intl('iU', { Status: 'Assigned', Price: 1200, Reference: 'U-1', 'Loading DateTime': at(1), 'Delivery DateTime': at(3) })] });
  const items = V.scopeFilter(V.annotate(set, () => 'Πελάτης'), 'all');
  assert.deepStrictEqual(items.map(it => [it.id, it.state, it.days, it.when]), [['iU', 'ready', null, OrdersCommon.ymd(at(3))]]);
  assert.strictEqual(V.stateWord(items[0]), 'προς κοπή');
  assert.deepStrictEqual(V.dateCheck(TODAY, TODAY), {}, 'today, before the delivery: no warning');
  assert.ok(V.dateCheck(OrdersCommon.addDays(TODAY, 1), TODAY).error, 'tomorrow is still an error');
  assert.strictEqual(V.lotDone, undefined, 'the lot\'s completion date went with the gate');
});

test('a closed lot reopens whatever its invoice (071a); the close no longer promises «μέχρι να τιμολογηθεί»', () => {
  global.ROLE = 'dispatcher';
  const closedInvoiced = { id: 'recLot1', fields: { 'Closed At': '2026-10-04T13:00:00Z', 'Closed Note': 'x', Invoiced: true } };
  assert.strictEqual(OrdersStock.reopenable(closedInvoiced), true);
  const t = OrdersStock.closeText({ id: 'recLot1', fields: { 'Remaining Pallets': 2, Pieces: 2 } }).join(' ');
  assert.ok(!/τιμολογ/.test(t), t);
});
```

- [ ] **Βήμα 2: τρέξε το· πρέπει να αποτύχει**

```bash
TZ=Europe/Athens node --test tests/invoice-from-registration.test.js 2>&1 | grep -E "^ℹ (pass|fail)"
```

Αναμενόμενο: `ℹ pass 0`, `ℹ fail 8`.

---

### Εργασία 2: `OrdersData` / `OrdersStock` (`core/orders-common.js`)

**Files:**
- Modify: `core/orders-common.js`

**Interfaces:** όπως η εργασία 1. Το `ageOf(set, rec)` κρατά το `set` στην υπογραφή, ώστε να μην αλλάξει κανείς από τους καλούντες (`orders_week_view.js:668`, `orders_invoicing_view.js:60`).

- [ ] **Βήμα 1: οι αλλαγές** (Edit με ακριβές `old_string`· η σειρά δεν παίζει ρόλο, γιατί κάθε `old_string` εμφανίζεται ακριβώς μία φορά στο `62d09f9d`)

**core/orders-common.js — αλλαγή 1.** Το «Άνοιγμα ξανά» δεν εξαρτάται πια από το τιμολόγιο (καθρέφτης του 071a).

Βρες ακριβώς:

```js
  // invoiced (the base refuses after — reopen_invoiced). The accountant closes
  // (Ε3) but does not reopen: owner/dispatcher decide whether pallets move.
  reopenable(lot) {
    const g = (lot && lot.fields) || {};
    return !!g['Closed At'] && g['Invoiced'] !== true && OrdersStock.canWrite();
  },
```

Αντικατάστησε με:

```js
  // invoiced or not: since 071a (owner 21/10/2026, B0) the base no longer
  // ties the close to the invoice (reopen_invoiced is gone). The accountant
  // closes (Ε3) but does not reopen: owner/dispatcher decide whether pallets move.
  reopenable(lot) {
    const g = (lot && lot.fields) || {};
    return !!g['Closed At'] && OrdersStock.canWrite();
  },
```

**core/orders-common.js — αλλαγή 2.**

Βρες ακριβώς:

```js
  // already accepts a reopen until the lot is invoiced (057 stock_guard_lots:
  // closed_note → NULL clears closed_at; reopen_invoiced refuses after the
  // invoice). The read-back decides: reopened only when «Closed At» is gone
```

Αντικατάστησε με:

```js
  // already accepts a reopen (057 stock_guard_lots: closed_note → NULL clears
  // closed_at; since 071a also after the invoice). The read-back decides:
  // reopened only when «Closed At» is gone
```

**core/orders-common.js — αλλαγή 3.**

Βρες ακριβώς:

```js
  // (lot_closed in the base), and it reopens only until invoiced. With no
```

Αντικατάστησε με:

```js
  // (lot_closed in the base), and it can be reopened (071a: invoiced too). With no
```

**core/orders-common.js — αλλαγή 4.**

Βρες ακριβώς:

```js
    return [head, 'Γράφονται χαμένες· η παρτίδα δεν δίνει άλλα κομμάτια.', 'Ανοίγει ξανά μέχρι να τιμολογηθεί.'];
```

Αντικατάστησε με:

```js
    return [head, 'Γράφονται χαμένες· η παρτίδα δεν δίνει άλλα κομμάτια.', 'Ανοίγει ξανά αν χρειαστεί.'];
```

**core/orders-common.js — αλλαγή 5.**

Βρες ακριβώς:

```js
// Both views (and the page's counters) read the SAME records with the SAME
// pallet gate — loaded once per render, deduped while in flight. Same query as
// invoicing.js had: every delivered/invoiced international order, and every
// national order whose delivery date passed (nationals never get «Delivered»).
```

Αντικατάστησε με:

```js
// Both views (and the page's counters) read the SAME records with the SAME
// rules — loaded once per render, deduped while in flight. Owner 21/10/2026
// (B0): every order is invoiced from its registration, so the set is every
// order that is not cancelled (international and national alike); the
// delivery no longer filters.
```

**core/orders-common.js — αλλαγή 6.**

Βρες ακριβώς:

```js
      const today = OrdersCommon.today();
      const intlF = 'OR({Status}="Delivered",{Status}="Invoiced",{Invoiced}=1)';
      const natlF = `OR({Status}="Delivered",{Status}="Invoiced",{Invoiced}=1,AND(IS_BEFORE({Delivery DateTime},'${today}'),{Status}!="Cancelled"))`;
```

Αντικατάστησε με:

```js
      // Not cancelled, or invoiced (a cancelled order that was invoiced stays in
      // «Τιμολογημένες», as before). The facade turns != into «neq OR is null»,
      // so an order with no Status is in the set (all 6 national orders on 22/10).
      const intlF = 'OR({Status}!="Cancelled",{Invoiced}=1)';
      const natlF = intlF;
```

**core/orders-common.js — αλλαγή 7.**

Βρες ακριβώς:

```js
  // Pallet-slip gate (docs/PALLETS_ARCHITECTURE.md §4.1): /pallets/gate for the
  // not-yet-invoiced international orders with pallet exchange. On failure the
  // old per-order check applies and the view shows a banner (gateFailed).
  async _loadGate(set) {
    const ids = set.intl.filter(r => r.fields['Pallet Exchange'] && !OrdersCommon.isInvoiced(r.fields)).map(r => r.id);
```

Αντικατάστησε με:

```js
  // Pallet-slip check (docs/PALLETS_ARCHITECTURE.md §4.1): /pallets/gate for the
  // DELIVERED, not-yet-invoiced international orders with pallet exchange. It
  // blocks nothing since 20/10 (the card says «δελτίο → Αλεξία»); before the
  // delivery no slip can exist, so those orders are not asked about (B0, 21/10)
  // — a «λείπει δελτίο» on an order still on the road would be noise. On
  // failure the old per-order check applies and the view shows a banner.
  async _loadGate(set) {
    const ids = set.intl.filter(r => r.fields['Pallet Exchange'] && !OrdersCommon.isInvoiced(r.fields) && OrdersCommon.isDelivered(r)).map(r => r.id);
```

**core/orders-common.js — αλλαγή 8.**

Βρες ακριβώς:

```js
  // The lots of the set: their completeness decides whether they may be
  // invoiced. Read only when the set holds a lot. A failed read blocks every
  // lot (stockFailed) and the view says so — never «ready» on a guess.
```

Αντικατάστησε με:

```js
  // The lots of the set, for the card (pieces, close, reopen). Since 21/10
  // (B0) their completeness no longer decides the invoice. Read only when the
  // set holds a lot; a failed read is said on the card (stockFailed).
```

**core/orders-common.js — αλλαγή 9.**

Βρες ακριβώς:

```js
  // not invoice: its lots stay blocked ('stock', lot null), never «ready».
```

Αντικατάστησε με:

```js
  // not invoice: its cards would show no lot state.
```

**core/orders-common.js — αλλαγή 10.**

Βρες ακριβώς:

```js
  // Days a delivered record has waited to be invoiced (null = no age). A lot
  // (057) is «Delivered» when the WAREHOUSE received it, but it may be invoiced
  // only once complete — so its wait starts at «Completed On», and there is no
  // age while it is incomplete (E-05, impact map 4/10; the auditor's B-15
  // counts a lot from completed_on too). One rule for every invoicing KPI.
  ageOf(set, rec) {
    const f = rec.fields || {};
    if (!OrdersStock.isLot(f)) return OrdersCommon.daysSinceDelivery(rec);
    const lot = set && set.stock ? set.stock.get(OrdersStock.lotRecOfLot(f)) : null;
    const done = lot && lot.fields && lot.fields['Completed On'];
    return done ? OrdersCommon.daysBetween(OrdersCommon.ymd(done), OrdersCommon.today()) : null;
  },
```

Αντικατάστησε με:

```js
  // Days an order has waited since its delivery (null = not delivered yet, or
  // no date). Owner 21/10/2026 (B0): a lot is an order like any other — its
  // age counts from its own delivery into the warehouse, no longer from the
  // day it became complete. The auditor's B-15 counts the same way since 071a
  // (one rule: «Παλαιότερη εκκρεμής» and the queue cannot disagree). A future
  // delivery has no age: «-3 ημέρες» would read as a typo. `set` is kept so
  // the callers (week view, «Προς τιμολόγηση», «Χωρίς τιμή») stay unchanged.
  ageOf(set, rec) {
    const d = OrdersCommon.daysSinceDelivery(rec);
    return d !== null && d >= 0 ? d : null;
  },
```

**core/orders-common.js — αλλαγή 11.**

Βρες ακριβώς:

```js
  // One state per record, one reason per blocked record (with who unblocks it).
  //   'invoiced' · 'ready' (noSheets: slip missing, 20/10) · 'blocked' (reason:
  //   'price', 'stock' → the lot's pieces) · 'pending' (not delivered)
  // A lot (057) is delivered when the WAREHOUSE received it, but it is invoiced
  // once, only when complete (every piece delivered and nothing left, or the
  // remainder closed) — the same rule stock_guard_orders enforces on
  // «Invoiced»; 'stock' carries the lot record (null = not read) for the text.
  stateOf(set, rec) {
    const f = rec.fields;
    if (OrdersCommon.isInvoiced(f)) return { key: 'invoiced' };
    if (f['Status'] === 'Cancelled') return { key: 'cancelled' };
    if (!OrdersCommon.isDelivered(rec)) return { key: 'pending' };
    if (!OrdersCommon.hasPrice(f)) return { key: 'blocked', reason: 'price' };
    if (OrdersStock.isLot(f)) {
      const lot = (set.stock && set.stock.get(OrdersStock.lotRecOfLot(f))) || null;
      if (set.stockFailed || !lot || lot.fields['Complete'] !== true) return { key: 'blocked', reason: 'stock', lot };
    }
    // Owner 20/10/2026: the ERP invoice no longer waits for the pallet slip —
    // Eirini invoices, Alexia uploads after. Ready, with noSheets so every view
    // still says «λείπει δελτίο». Decided HERE so the hub badge, the Weekly,
    // «Χωρίς τιμή» and «Προς τιμολόγηση» cannot disagree.
    if (!OrdersData.sheetsOk(set, rec)) return { key: 'ready', noSheets: true };
    return { key: 'ready' };
  },
```

Αντικατάστησε με:

```js
  // One state per record — owner 21/10/2026 (B0): every order is invoiced from
  // its registration; not the delivery, not the stock, not the pallet slip.
  //   'invoiced' · 'cancelled' · 'blocked' (reason 'price': no price > 0, the
  //   one thing that stops an invoice — the Worker's invoiceMarkError and 043
  //   refuse it too) · 'ready' (noSheets: delivered with a pallet slip missing
  //   — the card still chases it, 20/10). No 'pending' any more: a pre-order
  //   (Ops Status Provisional) is invoiced like any order (owner 22/10/2026).
  //   'pending' stays a key the callers know (week view «σε εξέλιξη»); this
  //   function no longer returns it.
  // A lot (057) is an order like any other here: since 071a the base no longer
  // refuses its invoice before its pieces arrive. Decided HERE so the hub
  // badge, the Weekly, «Χωρίς τιμή» and «Προς τιμολόγηση» cannot disagree.
  stateOf(set, rec) {
    const f = rec.fields;
    if (OrdersCommon.isInvoiced(f)) return { key: 'invoiced' };
    if (f['Status'] === 'Cancelled') return { key: 'cancelled' };
    if (!OrdersCommon.hasPrice(f)) return { key: 'blocked', reason: 'price' };
    if (OrdersCommon.isDelivered(rec) && !OrdersData.sheetsOk(set, rec)) return { key: 'ready', noSheets: true };
    return { key: 'ready' };
  },
```

- [ ] **Βήμα 2: έλεγχος σύνταξης και το νέο test**

```bash
node --check core/orders-common.js && TZ=Europe/Athens node --test tests/invoice-from-registration.test.js 2>&1 | grep -E "^ℹ (pass|fail)"
```

Αναμενόμενο: `ℹ pass 7`, `ℹ fail 1`. Αποτυγχάνει μόνο το «Προς τιμολόγηση: …», γιατί θέλει την εργασία 3.

---

### Εργασία 3: Η κάρτα «Προς τιμολόγηση» (`modules/orders_invoicing_view.js`)

**Files:**
- Modify: `modules/orders_invoicing_view.js`

**Interfaces:**
- `pure.dateCheck(dateYmd, todayYmd)` → `{error}` ή `{}`, χωρίς πια `warn`
- `pure.lotDone` αφαιρείται· `annotate()` → `when = deliv` για κάθε γραμμή, χωρίς πεδίο `lot`
- `closeRemainder(id)` διαβάζει την παρτίδα με `lotOf(it)`, όχι από το `it.lot`

Τι αλλάζει στην οθόνη: ο υπότιτλος· η κεφαλίδα της κάρτας («Παράδοση 25/10» ως κενός κύκλος για μη παραδομένη, «Στην αποθήκη» / «Ολοκληρώθηκε» για παρτίδα, και «Περιμένει κομμάτια n/N» ως πληροφορία)· στους ΕΛΕΓΧΟΥΣ το ουδέτερο «Παράδοση … · δεν έχει γίνει ακόμη», το «Δελτία παλετών · μετά την παράδοση», και το «Κλείσιμο υπολοίπου…» κάτω από τη γραμμή της παρτίδας· καμία προειδοποίηση ημερομηνίας πριν από την παράδοση.

- [ ] **Βήμα 1: οι αλλαγές**

**modules/orders_invoicing_view.js — αλλαγή 1.**

Βρες ακριβώς:

```js
// migration 043). A missing pallet slip (/pallets/gate) no longer blocks the
// invoice (owner 20/10/2026): the order is «προς κοπή» and its card keeps the
// red «δελτίο → Αλεξία» check, so the slip is still chased after the invoice.
```

Αντικατάστησε με:

```js
// migration 043). A missing pallet slip (/pallets/gate) no longer blocks the
// invoice (owner 20/10/2026): the order is «προς κοπή» and its card keeps the
// red «δελτίο → Αλεξία» check, so the slip is still chased after the invoice.
// Owner 21/10/2026 (B0): every order — a stock lot too — is «προς κοπή» from
// its registration; the delivery is shown on the card, it no longer gates.
```

**modules/orders_invoicing_view.js — αλλαγή 2.**

Βρες ακριβώς:

```js
        state: st.key, reason: st.reason || '', noSheets: !!st.noSheets, lot: st.lot || null,
```

Αντικατάστησε με:

```js
        state: st.key, reason: st.reason || '', noSheets: !!st.noSheets,
```

**modules/orders_invoicing_view.js — αλλαγή 3.**

Βρες ακριβώς:

```js
      const deliv = OC.ymd(f['Delivery DateTime']);
      const done = lotDone(set, rec);
      return {
```

Αντικατάστησε με:

```js
      const deliv = OC.ymd(f['Delivery DateTime']);
      return {
```

**modules/orders_invoicing_view.js — αλλαγή 4.**

Βρες ακριβώς:

```js
        // E-05: a lot's age counts from «Completed On», none while incomplete.
        days: OrdersData.ageOf(set, rec),
```

Αντικατάστησε με:

```js
        // B0 (21/10): from the order's own delivery, a lot too; none before it.
        days: OrdersData.ageOf(set, rec),
```

**modules/orders_invoicing_view.js — αλλαγή 5.**

Βρες ακριβώς:

```js
        erp: erpDelivery(rec, del, deliv),
        lotDone: done,
        // Round 1 O3 (critic-2 E2-03, critic-5 S5-05, critic-4 C4-04): ONE
        // date per lot — its last delivery (or the close, when no piece was
        // ever delivered). The card header, the KPI «Παλαιότερη εκκρεμής»,
        // the sort, the age and the invoice-date check (a gate) read it. Since
        // OWNER-Q9 (4/10) it is NOT printed on the ERP papers: those carry
        // the order's own delivery (erpDelivery). Every other order: its
        // delivery, as before.
        when: done ? done.date : deliv,
```

Αντικατάστησε με:

```js
        erp: erpDelivery(rec, del, deliv),
        // ONE date per order — its delivery, a lot too since B0 (21/10): the
        // lot's completion was a gate date (Round 1 O3) and the gate is gone.
        // The KPI «Παλαιότερη εκκρεμής» and the sort read it.
        when: deliv,
```

**modules/orders_invoicing_view.js — αλλαγή 6.**

Βρες ακριβώς:

```js
  // stay on the card (ΕΛΕΓΧΟΙ), and the lot still waits for its pieces
  // before it can be invoiced (gate, owner «α» 3/10 — OrdersData.stateOf).
```

Αντικατάστησε με:

```js
  // stay on the card (ΕΛΕΓΧΟΙ); since B0 (21/10) the lot is invoiced from its
  // registration like any order.
```

**modules/orders_invoicing_view.js — αλλαγή 7.**

Βρες ακριβώς:

```js
  // A lot's ONE date (round 1 O3; critic-2 C2-03): «Completed On» — the day
  // the lot became invoiceable, which the age already counts from — else its
  // last piece (still waiting), else its close. The last piece alone split
  // from the age when the remainder was closed days later, and let an invoice
  // dated between the two pass the date check. null for any other order; date
  // '' when the lot record was not read. Read by the card header, the age, the
  // sort and the invoice-date gate — never printed on the ERP papers (OWNER-Q9).
  function lotDone(set, rec) {
    const f = rec.fields || {};
    if (!(rec._type === 'intl' && typeof OrdersStock !== 'undefined' && OrdersStock.isLot(f))) return null;
    const lot = set && set.stock ? set.stock.get(OrdersStock.lotRecOfLot(f)) : null;
    if (!lot) return { date: '' };
    const g = lot.fields || {}, d = g['Completed On'] || g['Last Piece Delivered'] || g['Closed At'];
    return { date: d ? OrdersCommon.ymd(d) : '' };
  }
  // Only what this view is about: delivered orders (and the invoiced ones).
  // Not-yet-delivered and cancelled never belong to «Παραδομένες».
```

Αντικατάστησε με:

```js
  // Only what this view is about: every registered order (B0, 21/10) and the
  // invoiced ones. Cancelled orders and pre-orders never belong here.
```

**modules/orders_invoicing_view.js — αλλαγή 8.**

Βρες ακριβώς:

```js
  // Date rules of the ERP invoice: after today = error (an invoice cannot be
  // issued tomorrow); before the delivery = warning only (it happens, rarely).
  // A lot's date is its completion, not a delivery (C2-03): the words say so.
  function dateCheck(dateYmd, todayYmd, delivYmd, isLot) {
    if (!dateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return { error: 'συμπλήρωσε ημερομηνία' };
    if (dateYmd > todayYmd) return { error: 'μετά τη σημερινή (' + OrdersCommon.dm(todayYmd) + ')' };
    if (delivYmd && dateYmd < delivYmd) return { warn: (isLot ? 'πριν την ολοκλήρωση της παρτίδας (' : 'πριν την παράδοση (') + OrdersCommon.dm(delivYmd) + ') — σίγουρα;' };
    return {};
  }
```

Αντικατάστησε με:

```js
  // Date rules of the ERP invoice: after today = error (an invoice cannot be
  // issued tomorrow). Before the delivery is normal since B0 (owner 21/10/2026:
  // invoiced from registration) — the old «πριν την παράδοση — σίγουρα;» would
  // now fire on most invoices, and a warning that always fires is never read.
  function dateCheck(dateYmd, todayYmd) {
    if (!dateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return { error: 'συμπλήρωσε ημερομηνία' };
    if (dateYmd > todayYmd) return { error: 'μετά τη σημερινή (' + OrdersCommon.dm(todayYmd) + ')' };
    return {};
  }
```

**modules/orders_invoicing_view.js — αλλαγή 9.**

Βρες ακριβώς:

```js
  // C2-04: the last column «Κατάσταση», the words of the print (stateWord) —
  // since OWNER-Q9 a lot waiting for its pieces looks like any order on this
  // sheet, so the state is the one thing that says «not yet». Last, so no
  // column moves for whoever reads the file by position.
```

Αντικατάστησε με:

```js
  // C2-04: the last column «Κατάσταση», the words of the print (stateWord):
  // «προς κοπή», «χωρίς τιμή» or the ΤΠΥ. Last, so no column moves for
  // whoever reads the file by position.
```

**modules/orders_invoicing_view.js — αλλαγή 10.**

Βρες ακριβώς:

```js
      : it.state === 'blocked' ? (it.reason === 'price' ? 'χωρίς τιμή' : it.reason === 'stock' ? 'περιμένει κομμάτια' : 'λείπει δελτίο')
```

Αντικατάστησε με:

```js
      : it.state === 'blocked' ? 'χωρίς τιμή'
```

**modules/orders_invoicing_view.js — αλλαγή 11.**

Βρες ακριβώς:

```js
    metricsOf, dirWord, stockText, erpDelivery, lotDone, allocWhy, stateWord };
```

Αντικατάστησε με:

```js
    metricsOf, dirWord, stockText, erpDelivery, allocWhy, stateWord };
```

**modules/orders_invoicing_view.js — αλλαγή 12.**

Βρες ακριβώς:

```js
    ctx.setSub('Παραδομένες ανά πελάτη · εβδομάδα όπως στο Weekly (εξαγωγή κατά παράδοση, εισαγωγή κατά φόρτωση)');
```

Αντικατάστησε με:

```js
    ctx.setSub('Ανά πελάτη, από την καταχώρηση · εβδομάδα όπως στο Weekly (εξαγωγή κατά παράδοση, εισαγωγή κατά φόρτωση)');
```

**modules/orders_invoicing_view.js — αλλαγή 13.**

Βρες ακριβώς:

```js
    if (S.set.stockFailed) banners.push('Η κατάσταση των παρτίδων αποθήκης δεν φόρτωσε — κάθε παρτίδα εμφανίζεται μπλοκαρισμένη. Δεν σημαίνει ότι περιμένει κομμάτια· ξαναδοκίμασε.');
```

Αντικατάστησε με:

```js
    if (S.set.stockFailed) banners.push('Η κατάσταση των παρτίδων αποθήκης δεν φόρτωσε — η κάρτα δεν δείχνει τα κομμάτια τους. Η τιμολόγηση δεν επηρεάζεται· ξαναδοκίμασε.');
```

**modules/orders_invoicing_view.js — αλλαγή 14.**

Βρες ακριβώς:

```js
    if (it.state === 'blocked') {
      // O4 (critic-2 E2-10): a lot waiting for its pieces is normal work in
      // progress nobody can act on here — neutral, not the red of «χωρίς
      // τιμή». A false red teaches to ignore red.
      if (it.reason === 'stock') return `<span class="oiv-st wait" title="${esc(stockText(it.lot))}"><i class="oiv-dot wait"></i>περιμένει κομμάτια</span>`;
      return '<span class="oiv-st bad"><i class="oiv-dot fill"></i>χωρίς τιμή</span>';
    }
```

Αντικατάστησε με:

```js
    if (it.state === 'blocked') return '<span class="oiv-st bad"><i class="oiv-dot fill"></i>χωρίς τιμή</span>';
```

**modules/orders_invoicing_view.js — αλλαγή 15.**

Βρες ακριβώς:

```js
  // The lot's line(s) in ΕΛΕΓΧΟΙ — the ONE place its block reason is said
  // (O4, critic-5 S5-04: the header and the action block only point here).
  // Waiting is neutral («–»), a failed read stays red. A closed lot shows the
  // close where she works (O2, critic-2 E2-02): pallets, reason, date — and,
  // for owner/dispatcher while not invoiced, «Άνοιγμα ξανά» (O1).
  function lotCheck(it) {
    if (!isLotIt(it)) return '';
    const lot = lotOf(it);
    if (it.state === 'invoiced') return lot && lot.fields['Closed At'] ? `<div class="oiv-ck na"><i>–</i><span>${esc(OrdersStock.closedLine(lot))}</span></div>` : '';
    if (S.set.stockFailed || !lot) return `<div class="oiv-ck bad"><i>✗</i><span>Παρτίδα · ${esc(stockText(null))}</span></div>`;
    const g = lot.fields, n = v => Number(v) || 0;
    if (g['Complete'] !== true) return `<div class="oiv-ck na"><i>–</i><span>Παρτίδα · ${esc(stockText(lot))}</span></div>`;
```

Αντικατάστησε με:

```js
  // The lot's line(s) in ΕΛΕΓΧΟΙ — its pieces' progress, an information since
  // B0 (owner 21/10/2026), never a block (O4, critic-5 S5-04: neutral «–», a
  // failed read stays red). «Κλείσιμο υπολοίπου…» is offered here, where she
  // works, whatever the invoice (071a). A closed lot shows the close (O2,
  // critic-2 E2-02): pallets, reason, date — and, for owner/dispatcher,
  // «Άνοιγμα ξανά» (O1).
  function lotCheck(it) {
    if (!isLotIt(it)) return '';
    const lot = lotOf(it);
    if (S.set.stockFailed || !lot) return `<div class="oiv-ck bad"><i>✗</i><span>Παρτίδα · ${esc(stockText(null))}</span></div>`;
    const g = lot.fields, n = v => Number(v) || 0;
    if (g['Complete'] !== true) {
      const close = OrdersStock.canClose() && OrdersStock.closable(lot)
        ? `<button type="button" class="oiv-warn-btn" onclick="OrdersInvoicingView.closeRemainder('${esc(it.id)}')">Κλείσιμο υπολοίπου…</button>` : '';
      return `<div class="oiv-ck na"><i>–</i><span>Παρτίδα · ${esc(stockText(lot))}</span></div>` + close;
    }
```

**modules/orders_invoicing_view.js — αλλαγή 16.**

Βρες ακριβώς:

```js
  function closeRemainder(id) {
    const it = itemById(id);
    if (!it || !it.lot || !OrdersStock.canClose()) return;
    OrdersStock.openCloseModal(it.lot, async () => {
```

Αντικατάστησε με:

```js
  function closeRemainder(id) {
    const it = itemById(id), lot = it && lotOf(it);
    if (!it || !lot || !OrdersStock.canClose()) return;
    OrdersStock.openCloseModal(lot, async () => {
```

**modules/orders_invoicing_view.js — αλλαγή 17.**

Βρες ακριβώς:

```js
  // O1 (critic-2 E2-01): «Άνοιγμα ξανά» of a closed, not invoiced lot. The
  // base accepts it until the invoice (reopen_invoiced); the read-back
  // decides. Then the set is re-read: the lot is blocked again.
  async function reopenLot(id) {
    const it = itemById(id), lot = it && lotOf(it);
    if (!it || !lot || S.busy || it.state === 'invoiced' || !OrdersStock.reopenable(lot)) return;
    const label = OrdersStock.lotLabel(lot), off = Number(lot.fields['Written Off Pallets']) || 0;
    if (!(await confirmAction(`Άνοιγμα ξανά της παρτίδας ${label};\nΟι ${off} παλέτες γυρίζουν στο υπόλοιπο· η παρτίδα περιμένει ξανά κομμάτια και δεν τιμολογείται μέχρι να ολοκληρωθεί.`,
```

Αντικατάστησε με:

```js
  // O1 (critic-2 E2-01): «Άνοιγμα ξανά» of a closed lot — invoiced or not since
  // 071a (owner 21/10/2026: the invoice no longer closes a lot). The read-back
  // decides; then the set is re-read.
  async function reopenLot(id) {
    const it = itemById(id), lot = it && lotOf(it);
    if (!it || !lot || S.busy || !OrdersStock.reopenable(lot)) return;
    const label = OrdersStock.lotLabel(lot), off = Number(lot.fields['Written Off Pallets']) || 0;
    if (!(await confirmAction(`Άνοιγμα ξανά της παρτίδας ${label};\nΟι ${off} παλέτες γυρίζουν στο υπόλοιπο· η παρτίδα περιμένει ξανά κομμάτια.`,
```

**modules/orders_invoicing_view.js — αλλαγή 18.**

Βρες ακριβώς:

```js
    const delivered = it.state !== 'pending' && !!it.deliv;
    const ready = it.state === 'ready';
    let status;
    // A lot is never «Παραδόθηκε» on its intake date (plan §8, critic-4
    // C4-04). C2-02: a lot still waiting for pieces says so — whatever ELSE
    // blocks it (an unpriced lot used to read «Τελευταίο κομμάτι —»); a
    // complete one carries its one date (C2-03) under «Ολοκληρώθηκε».
    const lotRec = isLotIt(it) ? lotOf(it) : null, lg = (lotRec && lotRec.fields) || {};
    const lotWaiting = isLotIt(it) && lg['Complete'] !== true;
    const nPieces = Number(lg['Pieces']) || 0;
    const waitWord = 'Περιμένει κομμάτια' + (nPieces ? ' ' + (Number(lg['Pieces Delivered']) || 0) + '/' + nPieces : '');
    const doneWord = isLotIt(it) ? 'Ολοκληρώθηκε' : 'Παραδόθηκε';
    if (it.state === 'invoiced') status = `<span><i class="oiv-dot ok"></i>Τιμολογήθηκε ${f['Invoice Date'] ? dm(f['Invoice Date']) : ''}</span><span><i class="oiv-dot hollow"></i>${f['Invoice Number'] ? 'ΤΠΥ ' + esc(f['Invoice Number']) : 'χωρίς αριθμό'}</span>`;
    else if (lotWaiting) status = `<span><i class="oiv-dot ok"></i>Στην αποθήκη ${dm(it.deliv)}</span><span><i class="oiv-dot hollow"></i>${waitWord}</span>`
      + (it.reason === 'price' ? '<span><i class="oiv-dot bad"></i>χωρίς τιμή</span>' : '');
    else if (it.state === 'blocked') status = `<span><i class="oiv-dot ok"></i>${isLotIt(it) ? doneWord + ' ' + dm(it.when) : 'Παραδόθηκε ' + dm(it.deliv)}</span><span><i class="oiv-dot bad"></i>${it.reason === 'price' ? 'χωρίς τιμή' : 'παρτίδα → κομμάτια'}</span>`;
    else status = `<span><i class="oiv-dot ok"></i>${doneWord} ${dm(it.when)}</span><span><i class="oiv-dot hollow"></i>προς κοπή${it.days !== null ? ' · ' + it.days + (it.days === 1 ? ' ημέρα' : ' ημέρες') : ''}</span>`
      + (it.noSheets ? '<span><i class="oiv-dot bad"></i>δελτίο → Αλεξία</span>' : '');
```

Αντικατάστησε με:

```js
    // B0 (owner 21/10/2026): an order is invoiced from its registration, so the
    // card says where its delivery stands instead of assuming it happened.
    const delivered = OC().isDelivered(it.rec) && !!it.deliv;
    const ready = it.state === 'ready';
    let status;
    // A lot is never «Παραδόθηκε» on its intake date (plan §8, critic-4
    // C4-04): «Στην αποθήκη», then «Ολοκληρώθηκε» once complete (C2-05, the
    // catalog's word). Its pieces' progress (C2-02) is said beside it — an
    // information since B0, never a block.
    const lotRec = isLotIt(it) ? lotOf(it) : null, lg = (lotRec && lotRec.fields) || {};
    const lotComplete = !!lotRec && lg['Complete'] === true;
    const nPieces = Number(lg['Pieces']) || 0;
    const wait = lotRec && !lotComplete
      ? `<span><i class="oiv-dot hollow"></i>Περιμένει κομμάτια${nPieces ? ' ' + (Number(lg['Pieces Delivered']) || 0) + '/' + nPieces : ''}</span>` : '';
    const where = lotComplete ? 'Ολοκληρώθηκε' + (lg['Completed On'] ? ' ' + dm(lg['Completed On']) : '')
      : delivered ? (isLotIt(it) ? 'Στην αποθήκη ' : 'Παραδόθηκε ') + dm(it.deliv)
      : it.deliv ? 'Παράδοση ' + dm(it.deliv) : 'Χωρίς ημερομηνία παράδοσης';
    const whereHtml = `<span><i class="oiv-dot ${delivered || lotComplete ? 'ok' : 'hollow'}"></i>${where}</span>`;
    if (it.state === 'invoiced') status = `<span><i class="oiv-dot ok"></i>Τιμολογήθηκε ${f['Invoice Date'] ? dm(f['Invoice Date']) : ''}</span><span><i class="oiv-dot hollow"></i>${f['Invoice Number'] ? 'ΤΠΥ ' + esc(f['Invoice Number']) : 'χωρίς αριθμό'}</span>` + wait;
    else if (it.state === 'blocked') status = whereHtml + '<span><i class="oiv-dot bad"></i>χωρίς τιμή</span>' + wait;
    else status = whereHtml + `<span><i class="oiv-dot hollow"></i>προς κοπή${it.days !== null ? ' · ' + it.days + (it.days === 1 ? ' ημέρα' : ' ημέρες') : ''}</span>`
      + wait + (it.noSheets ? '<span><i class="oiv-dot bad"></i>δελτίο → Αλεξία</span>' : '');
```

**modules/orders_invoicing_view.js — αλλαγή 19.**

Βρες ακριβώς:

```js
    else if (!f['Pallet Exchange']) sheets = ck(true, 'Δελτία παλετών · δεν απαιτούνται');
```

Αντικατάστησε με:

```js
    else if (!f['Pallet Exchange']) sheets = ck(true, 'Δελτία παλετών · δεν απαιτούνται');
    else if (!delivered) sheets = ck(null, 'Δελτία παλετών · μετά την παράδοση');
```

**modules/orders_invoicing_view.js — αλλαγή 20.**

Βρες ακριβώς:

```js
    const checks = ck(delivered, delivered ? (isLotIt(it) ? 'Παραλήφθηκε στην αποθήκη ' : 'Παραδόθηκε ') + dm(it.deliv) : 'Δεν έχει παραδοθεί')
```

Αντικατάστησε με:

```js
    // Not delivered yet is no fault since B0: neutral «–», never a red ✗.
    const checks = ck(delivered ? true : null, delivered ? (isLotIt(it) ? 'Παραλήφθηκε στην αποθήκη ' : 'Παραδόθηκε ') + dm(it.deliv)
        : it.deliv ? 'Παράδοση ' + dm(it.deliv) + ' · δεν έχει γίνει ακόμη' : 'Χωρίς ημερομηνία παράδοσης')
```

**modules/orders_invoicing_view.js — αλλαγή 21.**

Βρες ακριβώς:

```js
    if (it.state === 'blocked') {
      let who;
      if (it.reason === 'price') {
```

Αντικατάστησε με:

```js
    if (it.state === 'blocked') {
      // 'price' is the only block since B0 (21/10): stateOf no longer blocks a
      // lot on its pieces, and a missing slip has not blocked since 20/10.
      if (it.reason === 'price') {
```

**modules/orders_invoicing_view.js — αλλαγή 22.**

Βρες ακριβώς:

```js
      else if (it.reason === 'stock') {
        // Ε3: whoever is working closes a remainder that will never leave;
        // the base refuses while a piece or the intake is not delivered.
        // closable(), not the chip: a received lot with no piece drawn must be
        // closable too, or its one invoice can never be issued.
        const canCl = it.lot && OrdersStock.canClose() && OrdersStock.closable(it.lot);
        const btn = canCl ? `<button type="button" class="oiv-warn-btn" onclick="OrdersInvoicingView.closeRemainder('${esc(it.id)}')">Κλείσιμο υπολοίπου…</button>` : '';
        // O4: the reason lives in ΕΛΕΓΧΟΙ; here only the rule, neutral.
        return `<section><div class="oiv-muted small" role="note">Τιμολογείται μία φορά, μετά το τελευταίο κομμάτι.</div>${btn}</section>`;
      }
      // No sheets branch: since 20/10 a missing slip is «ready» (stateOf), so
      // the owner-only override it needed is gone with it.
      return `<section><div class="oiv-block" role="note">${esc(who)}</div></section>`;
    }
```

Αντικατάστησε με:

```js
    }
```

**modules/orders_invoicing_view.js — αλλαγή 23.**

Βρες ακριβώς:

```js
    const dc = dateCheck(dateEl.value, today(), it.when, isLotIt(it));
    const dup = dupCheck(S.all, n, it);
    const lines = [];
    if (dc.error) lines.push(`<span class="oiv-bad">Ημερομηνία ${esc(dc.error)}</span>`);
    else if (dc.warn) lines.push(`<span class="oiv-warn">Ημερομηνία ${esc(dc.warn)}</span>`);
    else lines.push('<span class="oiv-muted">σήμερα ή παλαιότερη</span>');
```

Αντικατάστησε με:

```js
    const dc = dateCheck(dateEl.value, today());
    const dup = dupCheck(S.all, n, it);
    const lines = [];
    if (dc.error) lines.push(`<span class="oiv-bad">Ημερομηνία ${esc(dc.error)}</span>`);
    else lines.push('<span class="oiv-muted">σήμερα ή παλαιότερη</span>');
```

**modules/orders_invoicing_view.js — αλλαγή 24 (όλες οι εμφανίσεις, replace_all).** Δύο ίδιες γραμμές (submit και saveEdit): αντικατάσταση και των δύο.

Βρες ακριβώς:

```js
    const dc = dateCheck(d, today(), it.when, isLotIt(it));
```

Αντικατάστησε με:

```js
    const dc = dateCheck(d, today());
```

**modules/orders_invoicing_view.js — αλλαγή 25.**

Βρες ακριβώς:

```js
    toast(now && now.state === 'ready' ? `Η τιμή ${OC().eurSym(n)} καταχωρήθηκε — γράψε τον ΤΠΥ`
      : now && now.state === 'blocked' && now.reason === 'stock' ? `Η τιμή ${OC().eurSym(n)} καταχωρήθηκε — η παρτίδα περιμένει κομμάτια πριν τιμολογηθεί`
      : `Η τιμή ${OC().eurSym(n)} καταχωρήθηκε`);
```

Αντικατάστησε με:

```js
    toast(now && now.state === 'ready' ? `Η τιμή ${OC().eurSym(n)} καταχωρήθηκε — γράψε τον ΤΠΥ`
      : `Η τιμή ${OC().eurSym(n)} καταχωρήθηκε`);
```

- [ ] **Βήμα 2: σύνταξη και test**

```bash
node --check modules/orders_invoicing_view.js && TZ=Europe/Athens node --test tests/invoice-from-registration.test.js 2>&1 | grep -E "^ℹ (pass|fail)"
```

Αναμενόμενο: `ℹ pass 8`, `ℹ fail 0`.

- [ ] **Βήμα 3: δεν έμεινε αναφορά σε ό,τι αφαιρέθηκε**

```bash
grep -nE "lotDone|reason === 'stock'|isLot\)\)|dateCheck\([^)]*it\.when|it\.lot\b|let who" modules/orders_invoicing_view.js
```

Αναμενόμενο: καμία γραμμή.

---

### Εργασία 4: «Χωρίς τιμή» και η σήμανση παρτίδας στη φόρμα διεθνούς

**Files:**
- Modify: `modules/orders_noprice_view.js`
- Modify: `modules/orders_intl.js`

- [ ] **Βήμα 1: `modules/orders_noprice_view.js`**

**modules/orders_noprice_view.js — αλλαγή 1.**

Βρες ακριβώς:

```js
  // The list: delivered, not invoiced, no price > 0 (stateOf decides), in scope.
```

Αντικατάστησε με:

```js
  // The list: registered (B0, owner 21/10/2026), not invoiced, no price > 0
  // (stateOf decides), in scope.
```

**modules/orders_noprice_view.js — αλλαγή 2.**

Βρες ακριβώς:

```js
  const _days = r => OrdersCommon.daysSinceDelivery(r);
```

Αντικατάστησε με:

```js
  // The same age as «Προς τιμολόγηση» (OrdersData.ageOf): since B0 an order not
  // yet delivered is listed too, and it shows «—», never «-3».
  const _days = r => OrdersData.ageOf(null, r);
```

**modules/orders_noprice_view.js — αλλαγή 3.**

Βρες ακριβώς:

```js
      // Only orders that belong to THIS list's world: delivered (in the set) and
      // no longer missing a price. A price typed today on an order still in
      // planning is a dispatcher's normal edit, not a «συμπλήρωση» from here.
```

Αντικατάστησε με:

```js
      // Only orders that belong to THIS list's world: registered (in the set —
      // since B0 an order in planning and a pre-order are in it too) and no
      // longer missing a price. A cancelled order stays out.
```

**modules/orders_noprice_view.js — αλλαγή 4.**

Βρες ακριβώς:

```js
      if (st.key === 'pending' || st.key === 'cancelled' || (st.key === 'blocked' && st.reason === 'price')) continue;
```

Αντικατάστησε με:

```js
      if (st.key === 'cancelled' || (st.key === 'blocked' && st.reason === 'price')) continue;
```

**modules/orders_noprice_view.js — αλλαγή 5.**

Βρες ακριβώς:

```js
        : st.key === 'invoiced' ? '→ τιμολογήθηκε'
        // Round 1 O5 (critic-2 E2-09): a priced lot is not ready — it waits for its pieces.
        : st.key === 'blocked' && st.reason === 'stock' ? '→ περιμένει κομμάτια (παρτίδα)'
        : '';
```

Αντικατάστησε με:

```js
        : st.key === 'invoiced' ? '→ τιμολογήθηκε'
        : '';
```

**modules/orders_noprice_view.js — αλλαγή 6.**

Βρες ακριβώς:

```js
      // O5 (critic-2 E2-09): «πέρασε στα Προς τιμολόγηση» was not true for a
      // lot — it lands there blocked until its last piece (or a close).
      const _st = OrdersData.stateOf(V.set, rec);
      if (_st.key === 'blocked' && _st.reason === 'stock') toast(`Η τιμή καταχωρήθηκε — η παρτίδα ${lbl} περιμένει κομμάτια πριν τιμολογηθεί`);
      else toast(`Η τιμή καταχωρήθηκε — η ${lbl} πέρασε στα Προς τιμολόγηση`);
```

Αντικατάστησε με:

```js
      // B0 (21/10): a priced order — a lot too — is «προς κοπή» at once.
      toast(`Η τιμή καταχωρήθηκε — η ${lbl} πέρασε στα Προς τιμολόγηση`);
```

- [ ] **Βήμα 2: `modules/orders_intl.js`** (καθρέφτης του 071a: η τιμολογημένη παραγγελία μπορεί να γίνει παρτίδα)

**modules/orders_intl.js — αλλαγή 1.**

Βρες ακριβώς:

```js
    srcInvoiced: !!f['Invoiced'], srcLeg: !!getLinkedId(f['Parent Order']) };
```

Αντικατάστησε με:

```js
    srcLeg: !!getLinkedId(f['Parent Order']) };
```

**modules/orders_intl.js — αλλαγή 2.**

Βρες ακριβώς:

```js
  // OWNER-Q8 answered 4/10 (owner+dispatcher, also after delivery, never
  // invoiced) — impact map G-30: the box is on a new order and on any existing
```

Αντικατάστησε με:

```js
  // OWNER-Q8 answered 4/10 (owner+dispatcher, also after delivery; «never
  // invoiced» lifted by 071a, owner 21/10/2026: invoicing starts at
  // registration) — impact map G-30: the box is on a new order and on any existing
```

**modules/orders_intl.js — αλλαγή 3.**

Βρες ακριβώς:

```js
  // its title saying why (invoiced included).
```

Αντικατάστησε με:

```js
  // its title saying why.
```

**modules/orders_intl.js — αλλαγή 4.**

Βρες ακριβώς:

```js
// group, not invoiced. The save then sends ONLY the mark (POST STOCK LOTS).
```

Αντικατάστησε με:

```js
// group (invoiced or not, since 071a). The save then sends ONLY the mark (POST STOCK LOTS).
```

**modules/orders_intl.js — αλλαγή 5.**

Βρες ακριβώς:

```js
  let why = f['Invoiced'] ? 'Τιμολογήθηκε'
    : f['Veroia Switch'] ? 'Έχει Veroia Switch — βγάλ\' το πρώτα'
```

Αντικατάστησε με:

```js
  let why = f['Veroia Switch'] ? 'Έχει Veroia Switch — βγάλ\' το πρώτα'
```

**modules/orders_intl.js — αλλαγή 6.**

Βρες ακριβώς:

```js
      // lot_empty, lot_invoiced, no_split; the base still decides).
```

Αντικατάστησε με:

```js
      // lot_empty, no_split; the base still decides — 071a lifted lot_invoiced).
```

**modules/orders_intl.js — αλλαγή 7.**

Βρες ακριβώς:

```js
        if (_SK.srcInvoiced) _vErrors.push('Τιμολογημένη παραγγελία δεν γίνεται παρτίδα');

```

Αντικατάστησε με:

```js
// (τίποτα: η γραμμή διαγράφεται)
```

- [ ] **Βήμα 3: σύνταξη και καμία αναφορά που περίσσεψε**

```bash
node --check modules/orders_noprice_view.js && node --check modules/orders_intl.js && grep -nE "reason === 'stock'|srcInvoiced|key === 'pending'" modules/orders_noprice_view.js modules/orders_intl.js
```

Αναμενόμενο: καμία γραμμή από το grep.

- [ ] **Βήμα 4: όλη η σουίτα. Αποτυγχάνουν ΜΟΝΟ τα tests του παλιού κανόνα**

```bash
TZ=Europe/Athens node --test tests/*.test.js tests/*.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"
```

Αναμενόμενο στο `62d09f9d`: `ℹ fail 26`. Είναι τα tests που ισχυρίζονται τον παλιό κανόνα, και τα αλλάζει η εργασία 5: «states…», «scope filter…», «week strip…», «base list…», «KPIs…», «grouping…», «next order…», «invoice date…», «CSV…», «metrics…», «stock: the piece…», «OWNER-Q9…» (2), «age of a lot…», «O3…», «C2-03…», «C2-04…» στο `orders-invoicing-view`· «O1 reopenable…», «O1 closeText…», «loadInvoicingSet…» (2), «stateOf with stock…», «G-07…», «E-05…» στο `orders-stock`· και «stock: a piece…», «stock: oldest pending…» στο `orders-week-view`.

---

### Εργασία 5: Τα παλιά tests περνούν στον νέο κανόνα

**Files:**
- Modify: `tests/orders-stock.test.js`
- Modify: `tests/orders-invoicing-view.test.js`
- Modify: `tests/orders-week-view.test.js`

Η αρχή: ό,τι ήταν αληθινό **και** για τον νέο κανόνα μένει. Ό,τι ήταν η πύλη αλλάζει σε «ready» ή στην ηλικία από την παράδοση. Δύο tests (O3, C2-03) δοκιμάζουν μόνο την ημερομηνία-πύλη της παρτίδας και την προειδοποίηση· **σβήνονται**, γιατί αυτή η συμπεριφορά δεν υπάρχει πια (αρχή 8). Το fixture `i8` του `orders-invoicing-view` (μια «In Transit» που έμενε εκτός) **φεύγει**: με τον νέο κανόνα δεν υπάρχει πια μη ακυρωμένη παραγγελία εκτός λίστας. Οι αριθμοί των υπόλοιπων tests μένουν ίδιοι, και το «μη παραδομένη / pre-order = μέσα» το καλύπτει το νέο test της εργασίας 1.

- [ ] **Βήμα 1: `tests/orders-stock.test.js`**

**tests/orders-stock.test.js — αλλαγή 1.**

Βρες ακριβώς:

```js
test('O1 reopenable: closed and not invoiced, owner/dispatcher only (the accountant closes, does not reopen)', () => {
```

Αντικατάστησε με:

```js
test('O1 reopenable: closed (invoiced or not since 071a), owner/dispatcher only (the accountant closes, does not reopen)', () => {
```

**tests/orders-stock.test.js — αλλαγή 2.**

Βρες ακριβώς:

```js
  assert.strictEqual(OrdersStock.reopenable(lotRec('recLot1', { 'Closed At': 'x', Invoiced: true })), false, 'invoiced (reopen_invoiced)');
```

Αντικατάστησε με:

```js
  assert.strictEqual(OrdersStock.reopenable(lotRec('recLot1', { 'Closed At': 'x', Invoiced: true })), true, 'invoiced too (071a, owner 21/10: invoicing starts at registration)');
```

**tests/orders-stock.test.js — αλλαγή 3.**

Βρες ακριβώς:

```js
assert.match(t, /Ανοίγει ξανά μέχρι να τιμολογηθεί/);
```

Αντικατάστησε με:

```js
assert.match(t, /Ανοίγει ξανά αν χρειαστεί/);
```

**tests/orders-stock.test.js — αλλαγή 4.**

Βρες ακριβώς:

```js
  const st = OrdersData.stateOf(set, set.intl[1]);
  assert.deepStrictEqual([st.key, st.reason, st.lot && st.lot.id], ['blocked', 'stock', 'recLot1']);
```

Αντικατάστησε με:

```js
  assert.deepStrictEqual(OrdersData.stateOf(set, set.intl[1]), { key: 'ready' }, 'B0 (21/10): a lot is invoiced from its registration');
```

**tests/orders-stock.test.js — αλλαγή 5.**

Βρες ακριβώς:

```js
test('loadInvoicingSet: no lot in the set → no STOCK LOTS request; a failed lot read blocks every lot', async () => {
```

Αντικατάστησε με:

```js
test('loadInvoicingSet: no lot in the set → no STOCK LOTS request; a failed lot read is said (stockFailed) and blocks nothing', async () => {
```

**tests/orders-stock.test.js — αλλαγή 6.**

Βρες ακριβώς:

```js
  assert.deepStrictEqual(OrdersData.stateOf(set, set.intl[0]), { key: 'blocked', reason: 'stock', lot: null }, 'never «ready» on a guess');
```

Αντικατάστησε με:

```js
  assert.deepStrictEqual(OrdersData.stateOf(set, set.intl[0]), { key: 'ready' }, 'B0: the lot record no longer decides the invoice');
```

**tests/orders-stock.test.js — αλλαγή 7.**

Αντικατάστησε ολόκληρο το μπλοκ που αρχίζει με τη γραμμή `test('stateOf with stock: complete → ready; price first; not delivered → pending; invoiced → invoiced', () => {` και τελειώνει στο πρώτο `});` που κλείνει το test του, με:

```js
test('stateOf with stock (B0, 21/10): a lot is «ready» like any priced order — complete or not, delivered or not', () => {
  const lot = r => ({ id: r, _type: 'intl', fields: { Status: 'Delivered', Price: 3300, 'Own Stock Lot': 'recLot1', 'Delivery DateTime': D(5) } });
  const set = l => ({ intl: [], natl: [], gate: {}, gateFailed: false, stock: new Map([['recLot1', l]]), stockFailed: false });
  assert.deepStrictEqual(OrdersData.stateOf(set(lotRec('recLot1', { Complete: true })), lot('a')), { key: 'ready' });
  assert.deepStrictEqual(OrdersData.stateOf(set(lotRec('recLot1', {})), lot('a')), { key: 'ready' }, 'incomplete: ready too');
  const noPrice = lot('a'); delete noPrice.fields.Price;
  assert.deepStrictEqual(OrdersData.stateOf(set(lotRec('recLot1', {})), noPrice), { key: 'blocked', reason: 'price' }, 'the price is the one block');
  const transit = lot('a'); transit.fields.Status = 'In Transit';
  assert.deepStrictEqual(OrdersData.stateOf(set(lotRec('recLot1', {})), transit), { key: 'ready' }, 'not yet in the warehouse: ready');
  const inv = lot('a'); inv.fields.Invoiced = true;
  assert.strictEqual(OrdersData.stateOf({ intl: [], natl: [], gate: {} }, inv).key, 'invoiced', 'an invoiced lot needs no lot record');
  assert.deepStrictEqual(OrdersData.stateOf({ intl: [], natl: [], gate: {}, gateFailed: false }, lot('a')), { key: 'ready' }, 'a set built without stock readies a lot too');
  // a complete lot with a missing slip is ready, flagged (owner 20/10: the slip no longer blocks)
  const pe = lot('a'); pe.fields['Pallet Exchange'] = true;
  const s2 = set(lotRec('recLot1', { Complete: true })); s2.gate = { a: { sheets_ok: false } };
  assert.deepStrictEqual(OrdersData.stateOf(s2, pe), { key: 'ready', noSheets: true });
});
```

**tests/orders-stock.test.js — αλλαγή 8.**

Βρες ακριβώς:

```js
test('G-07: the warehouse role never reads STOCK LOTS (no grant → no 403 storm); its lots stay blocked', async () => {
```

Αντικατάστησε με:

```js
test('G-07: the warehouse role never reads STOCK LOTS (no grant → no 403 storm); nothing is blocked for it either', async () => {
```

**tests/orders-stock.test.js — αλλαγή 9.**

Βρες ακριβώς:

```js
  assert.deepStrictEqual(OrdersData.stateOf(set, set.intl[0]), { key: 'blocked', reason: 'stock', lot: null }, 'never «ready» without its lot');
```

Αντικατάστησε με:

```js
  assert.deepStrictEqual(OrdersData.stateOf(set, set.intl[0]), { key: 'ready' }, 'B0: no lot read, nothing blocked');
```

**tests/orders-stock.test.js — αλλαγή 10.**

Αντικατάστησε ολόκληρο το μπλοκ που αρχίζει με τη γραμμή `test('E-05: ageOf — a lot from «Completed On» (null while incomplete), every other order from its delivery', () => {` και τελειώνει στο πρώτο `});` που κλείνει το test του, με:

```js
test('ageOf (B0, 21/10): every order from its own delivery, a lot too; none before the delivery', () => {
  const lot = { id: 'a', _type: 'intl', fields: { Status: 'Delivered', 'Own Stock Lot': 'recLot1', 'Delivery DateTime': D(40) } };
  const set = l => ({ stock: new Map([['recLot1', l]]) });
  assert.strictEqual(OrdersData.ageOf(set(lotRec('recLot1', {})), lot), 40);
  assert.strictEqual(OrdersData.ageOf(set(lotRec('recLot1', { Complete: true, 'Completed On': daysAgo(3) })), lot), 40, '«Completed On» no longer counts');
  assert.strictEqual(OrdersData.ageOf({ stock: null }, lot), 40, 'the lot record is not needed');
  assert.strictEqual(OrdersData.ageOf({}, order('p', { 'Delivery DateTime': D(5) })), 5);
  assert.strictEqual(OrdersData.ageOf({}, order('f', { 'Delivery DateTime': D(-3) })), null, 'a future delivery has no age');
});
```

- [ ] **Βήμα 2: `tests/orders-invoicing-view.test.js`**

**tests/orders-invoicing-view.test.js — αλλαγή 1.**

Βρες ακριβώς:

```js
      // cancelled + not delivered: never in the view
      intl('i7', { 'Order No': 1250, Status: 'Cancelled', Client: ['recA'], Price: 10, 'Delivery DateTime': d(PREV, 1) }),
      intl('i8', { 'Order No': 1251, Status: 'In Transit', Client: ['recA'], Price: 10, 'Delivery DateTime': d(PREV, 1) }),
```

Αντικατάστησε με:

```js
      // cancelled: never in the view. An order not yet delivered, and a pre-order,
      // ARE in it since B0 (owner 21-22/10, tests/invoice-from-registration.test.js).
      intl('i7', { 'Order No': 1250, Status: 'Cancelled', Client: ['recA'], Price: 10, 'Delivery DateTime': d(PREV, 1) }),
```

**tests/orders-invoicing-view.test.js — αλλαγή 2.**

Βρες ακριβώς:

```js
  assert.ok(!inView.includes('i7') && !inView.includes('i8'));
```

Αντικατάστησε με:

```js
  assert.ok(!inView.includes('i7'));
```

**tests/orders-invoicing-view.test.js — αλλαγή 3.**

Βρες ακριβώς:

```js
test('states: ready / blocked(price) / slip-only = ready+noSheets (owner 20/10) / invoiced; cancelled and in-transit leave the view', () => {
```

Αντικατάστησε με:

```js
test('states: ready / blocked(price) / slip-only = ready+noSheets (owner 20/10) / invoiced; a cancelled order leaves the view', () => {
```

**tests/orders-invoicing-view.test.js — αλλαγή 4.**

Αντικατάστησε ολόκληρο το μπλοκ που αρχίζει με τη γραμμή `test('invoice date: future = error, before delivery = warning', () => {` και τελειώνει στο πρώτο `});` που κλείνει το test του, με:

```js
test('invoice date: future = error; before the delivery is normal since B0 (21/10)', () => {
  assert.ok(V.dateCheck(OrdersCommon.addDays(TODAY, 1), TODAY).error);
  assert.deepStrictEqual(V.dateCheck(OrdersCommon.addDays(PREV, -1), TODAY), {});
  assert.deepStrictEqual(V.dateCheck(TODAY, TODAY), {});
  assert.ok(V.dateCheck('', TODAY).error);
});
```

**tests/orders-invoicing-view.test.js — αλλαγή 5.**

Αντικατάστησε ολόκληρο το μπλοκ που αρχίζει με τη γραμμή `test('stock: the piece never appears and changes no total; the lot waits, then is one ready invoice', async () => {` και τελειώνει στο πρώτο `});` που κλείνει το test του, με:

```js
test('stock (B0, 21/10): the piece never appears and changes no total; the lot is one ready invoice from the start', async () => {
  const name = id => CLIENTS[id] || '';
  const without = V.scopeFilter(V.annotate(await stockSet([LOT_ORDER], STOCK_LOT(false)), name), 'all');
  const withPiece = V.scopeFilter(V.annotate(await stockSet([LOT_ORDER, PIECE_ORDER], STOCK_LOT(false)), name), 'all');
  assert.ok(!withPiece.some(it => it.id === 'iP'), 'the piece is not an invoicing row');
  assert.deepStrictEqual(withPiece.map(it => it.id), without.map(it => it.id));
  assert.deepStrictEqual(V.kpis(V.baseList(withPiece, PREV)), V.kpis(V.baseList(without, PREV)), 'no KPI moves because of the piece');
  assert.deepStrictEqual([...V.weekStats(withPiece)], [...V.weekStats(without)]);
  assert.deepStrictEqual(V.metricsOf(withPiece), V.metricsOf(without));
  assert.deepStrictEqual(V.tabCounts(V.baseList(withPiece, 'open')), V.tabCounts(V.baseList(without, 'open')));
  const lot = withPiece.find(it => it.id === 'iL');
  assert.deepStrictEqual([lot.state, lot.reason], ['ready', ''], 'waiting for its pieces, priced: ready (B0)');
  assert.strictEqual(V.stockText(STOCK_LOT(false)), 'περιμένει κομμάτια: 13p στην αποθήκη · 1 σε κίνηση', 'O4: no zero term (the card\'s ΕΛΕΓΧΟΙ line)');
  assert.strictEqual(V.stockText(null), 'η κατάσταση της παρτίδας δεν διαβάστηκε');
  const done = V.scopeFilter(V.annotate(await stockSet([LOT_ORDER, PIECE_ORDER], STOCK_LOT(true, { 'Remaining Pallets': 0, 'Pieces Delivered': 2 })), name), 'all');
  assert.deepStrictEqual(V.kpis(V.baseList(done, PREV)), V.kpis(V.baseList(withPiece, PREV)), 'completing the lot moves no KPI: it was ready already');
  assert.strictEqual(done.filter(it => it.ref === 'LOT-1' || it.ref === 'PC-1').length, 1, 'one invoice for the lot, none for the piece');
});
```

**tests/orders-invoicing-view.test.js — αλλαγή 6.**

Βρες ακριβώς:

```js
  // the gate keeps the lot's own date (card header, age, sort, invoice-date check)
  assert.deepStrictEqual(lot.lotDone, { date: lastPiece });
  assert.strictEqual(V.lotDone({ stock: null }, LOT_ORDER).date, '', 'lot record not read → no date, never the intake');
  assert.strictEqual(V.lotDone(set, fixture().intl[1]), null, 'an ordinary order has no lot date');
```

Αντικατάστησε με:

```js
  // B0 (21/10): the lot's one date is its own delivery, like any order (no gate date any more)
  assert.strictEqual(lot.when, own);
```

**tests/orders-invoicing-view.test.js — αλλαγή 7.**

Αντικατάστησε ολόκληρο το μπλοκ που αρχίζει με τη γραμμή `// E-05 (impact map 4/10): a lot waits to be invoiced from «Completed On».` και τελειώνει στο πρώτο `});` που κλείνει το test του, με:

```js
// B0 (owner 21/10/2026): a lot is owed from its own delivery into the warehouse, like any order.
test('age of a lot (B0, 21/10): from its own delivery into the warehouse, complete or not', async () => {
  const name = id => CLIENTS[id] || '';
  const old = Object.assign({}, LOT_ORDER, { fields: Object.assign({}, LOT_ORDER.fields, { 'Delivery DateTime': OrdersCommon.addDays(TODAY, -45) + 'T10:00:00' }) });
  const open = V.scopeFilter(V.annotate(await stockSet([old], STOCK_LOT(false)), name), 'all').find(it => it.id === 'iL');
  assert.strictEqual(open.days, 45, 'waiting for its pieces: still owed 45 days');
  const done = V.scopeFilter(V.annotate(await stockSet([old], STOCK_LOT(true, { 'Completed On': OrdersCommon.addDays(TODAY, -2) })), name), 'all').find(it => it.id === 'iL');
  assert.strictEqual(done.days, 45, '«Completed On» no longer counts');
  assert.strictEqual(V.metricsOf([done]).overdue, 1, 'owed 45 days = overdue like any order (B-15 counts it the same since 071a)');
});
```

**tests/orders-invoicing-view.test.js — αλλαγή 8.**

Βρες ακριβώς:

```js
test('OWNER-Q9: a closed lot\'s ERP row = the order\'s own pallets; the close only dates the gate', async () => {
```

Αντικατάστησε με:

```js
test('OWNER-Q9: a closed lot\'s ERP row = the order\'s own pallets; the close changes no date (B0)', async () => {
```

**tests/orders-invoicing-view.test.js — αλλαγή 9.**

Βρες ακριβώς:

```js
  // C2-03 (round 3): the lot's one date is «Completed On» (the close, 1 day ago), not the last piece (3 days).
  assert.deepStrictEqual([lot.state, lot.erp.date, lot.erp.pallets, lot.when], ['ready', OrdersCommon.ymd(LOT_ORDER.fields['Delivery DateTime']), '33', closedOn]);
```

Αντικατάστησε με:

```js
  // B0 (21/10): the lot's one date is its own delivery — the close changes no date.
  const own = OrdersCommon.ymd(LOT_ORDER.fields['Delivery DateTime']);
  assert.deepStrictEqual([lot.state, lot.erp.date, lot.erp.pallets, lot.when], ['ready', own, '33', own]);
```

**tests/orders-invoicing-view.test.js — αλλαγή 10.**

Βρες ακριβώς:

```js
  // zero pieces, whole lot written off (Ε3): the gate date is the close
  const zero = STOCK_LOT(true, { 'Remaining Pallets': 33, Pieces: 0, 'Pieces Delivered': 0, 'Delivered Pallets': 0, 'Written Off Pallets': 33,
    'Closed At': closedOn + 'T13:00:00Z', 'Closed Note': 'ο πελάτης τα πήρε', 'Completed On': closedOn });
  assert.deepStrictEqual(V.lotDone({ stock: new Map([['recLot1', zero]]) }, LOT_ORDER), { date: closedOn });

```

Αντικατάστησε με:

```js
// (τίποτα: οι γραμμές διαγράφονται)
```

**tests/orders-invoicing-view.test.js — αλλαγή 11.** Το test ελέγχει την ημερομηνία-πύλη της παρτίδας και την προειδοποίηση «πριν το τελευταίο κομμάτι», που φεύγουν μαζί με την πύλη.

Διάγραψε ολόκληρο το μπλοκ που αρχίζει με τη γραμμή `// Round 1 O3 (critic-2 E2-03, critic-5 S5-05): one date per lot — the KPI` και τελειώνει στο πρώτο `});` που κλείνει το test του (μαζί με την κενή γραμμή που ακολουθεί).

**tests/orders-invoicing-view.test.js — αλλαγή 12.** Ίδιος λόγος: η προειδοποίηση «πριν την ολοκλήρωση της παρτίδας» δεν υπάρχει πια.

Διάγραψε ολόκληρο το μπλοκ που αρχίζει με τη γραμμή `// Critic-2 C2-03 (round 3): ONE date per lot = «Completed On» (fallback the last` και τελειώνει στο πρώτο `});` που κλείνει το test του (μαζί με την κενή γραμμή που ακολουθεί).

**tests/orders-invoicing-view.test.js — αλλαγή 13.**

Αντικατάστησε ολόκληρο το μπλοκ που αρχίζει με τη γραμμή `// Critic-2 C2-04 (round 3): a lot still waiting for its pieces looks like any` και τελειώνει στο πρώτο `});` που κλείνει το test του, με:

```js
// Critic-2 C2-04 (round 3) + B0 (21/10): the ERP sheet's «Κατάσταση» of a lot still
// waiting for its pieces is the one of any order: «προς κοπή».
test('C2-04 (B0): the ERP CSV says «προς κοπή» for a lot still waiting for its pieces', async () => {
  const name = id => CLIENTS[id] || '';
  const items = V.scopeFilter(V.annotate(await stockSet([LOT_ORDER], STOCK_LOT(false)), name), 'all');
  const row = V.csvRows(V.groupByClient(V.baseList(items, 'open')), () => null).find(r => r[1] === 'LOT-1');
  assert.strictEqual(row[12], 'προς κοπή');
  assert.strictEqual(V.stateWord(items.find(it => it.id === 'iL')), 'προς κοπή');
});
```

- [ ] **Βήμα 3: `tests/orders-week-view.test.js`**

**tests/orders-week-view.test.js — αλλαγή 1.**

Βρες ακριβώς:

```js
test('stock: a piece in an RT is shown, never counted; no total changes because of it; the lot blocks as «stock»', () => {
```

Αντικατάστησε με:

```js
test('stock: a piece in an RT is shown, never counted; no total changes because of it; the lot is «ready» like any priced order (B0)', () => {
```

**tests/orders-week-view.test.js — αλλαγή 2.**

Βρες ακριβώς:

```js
  // the lot itself: delivered INTO the warehouse, blocked until its pieces are delivered
```

Αντικατάστησε με:

```js
  // the lot itself (B0, owner 21/10/2026): invoiced from its registration — never blocked on its pieces
```

**tests/orders-week-view.test.js — αλλαγή 3.**

Βρες ακριβώς:

```js
  assert.strictEqual(t.blocked.stock, 1);
  assert.strictEqual(t.blocked.price, 1, 'the unpriced export is still «price»');
```

Αντικατάστησε με:

```js
  assert.strictEqual(t.blocked.stock, 0);
  assert.strictEqual(t.blocked.price, 1, 'the unpriced export is still «price»');
```

**tests/orders-week-view.test.js — αλλαγή 4.**

Αντικατάστησε ολόκληρο το μπλοκ που αρχίζει με τη γραμμή `// E-05 (impact map 4/10): «παλαιότερη εκκρεμής» of a lot counts from its` και τελειώνει στο πρώτο `});` που κλείνει το test του, με:

```js
// B0 (owner 21/10/2026): «παλαιότερη εκκρεμής» of a lot counts from its own
// delivery, like every order (OrdersData.ageOf, carried by the page's state function).
test('stock: oldest pending counts a lot from its own delivery, like every order (B0)', () => {
  const { OrdersStock, OrdersData } = require('../core/orders-common.js');
  global.OrdersStock = OrdersStock;
  const LOT = o('recLot', 1300, { Direction: 'Import', 'Loading DateTime': '2026-09-20T08:00', 'Delivery DateTime': '2026-09-21T08:00', Price: 3300, Status: 'Delivered', 'Own Stock Lot': 'recLot1' });
  const set = { intl: [], natl: [], gate: {}, gateFailed: false, stockFailed: false,
    stock: new Map([['recLot1', { id: 'recLot1', fields: { Complete: false } }]]) };
  const bare = r => OrdersData.stateOf(set, r);
  const paged = Object.assign(r => OrdersData.stateOf(set, r), { ageOf: r => OrdersData.ageOf(set, r) });
  assert.strictEqual(W.totals([LOT], paged).oldest, OrdersCommon.daysSinceDelivery(LOT), 'incomplete lot → its delivery age');
  assert.strictEqual(W.totals([LOT], bare).oldest, OrdersCommon.daysSinceDelivery(LOT), 'the bare state function agrees');
  set.stock.get('recLot1').fields = { Complete: true, 'Completed On': OrdersCommon.addDays(OrdersCommon.today(), -1) };
  assert.strictEqual(W.totals([LOT], paged).oldest, OrdersCommon.daysSinceDelivery(LOT), '«Completed On» no longer counts');
});
```

Το stub `stateOf` της γρ. 55 (`if (f.Status !== 'Delivered') return { key: 'pending' }`) **μένει**. Δοκιμάζει τη μηχανική της «Εβδομάδας» με ένα δικό του stub, όχι τον κανόνα τιμολόγησης.

- [ ] **Βήμα 4: όλη η σουίτα**

```bash
TZ=Europe/Athens node --test tests/*.test.js tests/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```

Αναμενόμενο στο `62d09f9d`: `ℹ tests 692`, `ℹ pass 692`, `ℹ fail 0`. Ο λογαριασμός: 686 − 2 σβησμένα + 8 νέα. Αν το `main` έχει προχωρήσει, ο αριθμός είναι ο δικός σου της εργασίας 0 + 6, με `fail 0`.

---

### Εργασία 6: Rigs, έλεγχος στην οθόνη με stubs

**Files:**
- Modify: `tests/critics/stock-orders-rig.js`
- Modify: `tests/critics/orders-noprice-proof.js`

- [ ] **Βήμα 1: `tests/critics/orders-noprice-proof.js`.** Το `recX5` γίνεται **ακυρωμένη**, γιατί με τον νέο κανόνα μόνο μια ακυρωμένη μένει εκτός λίστας (μη παραδομένες και pre-orders μπαίνουν). Έτσι μένουν ίδιοι και οι υπόλοιποι αριθμοί του rig.

**tests/critics/orders-noprice-proof.js — αλλαγή 1.**

Βρες ακριβώς:

```js
//   recX5  #1240 NO price but still Assigned (not delivered)         → NOT listed
```

Αντικατάστησε με:

```js
//   recX5  #1240 NO price, CANCELLED                                → NOT listed (since B0, 21-22/10,
//          an order not yet delivered and a pre-order ARE listed)
```

**tests/critics/orders-noprice-proof.js — αλλαγή 2.**

Βρες ακριβώς:

```js
  intl('recX5', { 'Order No': 1240, Reference: 'PL-0001', Client: ['recC1'], Status: 'Assigned', 
```

Αντικατάστησε με:

```js
  intl('recX5', { 'Order No': 1240, Reference: 'PL-0001', Client: ['recC1'], Status: 'Cancelled', 
```

**tests/critics/orders-noprice-proof.js — αλλαγή 3.**

Βρες ακριβώς:

```js
'undelivered order without price (#1240) is NOT listed'
```

Αντικατάστησε με:

```js
'a cancelled order without price (#1240) is NOT listed'
```

**tests/critics/orders-noprice-proof.js — αλλαγή 4.**

Βρες ακριβώς:

```js
//   recX5 also has a today audit fill — pending, so NOT a «συμπλήρωση» of this list.
```

Αντικατάστησε με:

```js
//   recX5 also has a today audit fill — cancelled, so NOT a «συμπλήρωση» of this list.
```

**tests/critics/orders-noprice-proof.js — αλλαγή 5.**

Βρες ακριβώς:

```js
pending #1240 and the 3200→3300
```

Αντικατάστησε με:

```js
cancelled #1240 and the 3200→3300
```

- [ ] **Βήμα 2: `tests/critics/stock-orders-rig.js`**

**tests/critics/stock-orders-rig.js — αλλαγή 1.**

Βρες ακριβώς:

```js
  ok(ti.disabled && ti.title === 'Τιμολογήθηκε', 'R1 / OWNER-Q8 «never invoiced»: an invoiced order — box disabled, title «Τιμολογήθηκε» — ' + JSON.stringify(ti));
```

Αντικατάστησε με:

```js
  ok(ti.disabled && ti.title === tp.title, '071a (owner 21/10): the invoice no longer bars the mark — the invoiced order gets the same answer as the plain one — ' + JSON.stringify(ti));
```

**tests/critics/stock-orders-rig.js — αλλαγή 2.**

Βρες ακριβώς:

```js
  ok(/TEST-STOCK-LOT/.test(body) && /περιμένει κομμάτια/.test(body), 'the lot is listed, blocked «περιμένει κομμάτια»');
```

Αντικατάστησε με:

```js
  const lotRowTxt = (await page.locator('#oivBody tr.oiv-r', { hasText: 'TEST-STOCK-LOT' }).innerText()).replace(/\s+/g, ' ');
  ok(/προς κοπή/.test(lotRowTxt) && !/περιμένει κομμάτια/.test(lotRowTxt), 'B0 (21/10): the lot is listed «προς κοπή» while its pieces are out — ' + lotRowTxt);
```

**tests/critics/stock-orders-rig.js — αλλαγή 3.**

Βρες ακριβώς:

```js
  ok(!neutral.rowBad && neutral.rowWait && /\bna\b/.test(neutral.ck || '') && !neutral.block, 'O4: waiting is neutral — list, ΕΛΕΓΧΟΙ and action block carry no red — ' + JSON.stringify(neutral));
```

Αντικατάστησε με:

```js
  ok(!neutral.rowBad && !neutral.rowWait && /\bna\b/.test(neutral.ck || '') && !neutral.block, 'B0: the pieces are a neutral ΕΛΕΓΧΟΙ line; no red, no «περιμένει» chip, no block — ' + JSON.stringify(neutral));
```

**tests/critics/stock-orders-rig.js — αλλαγή 4.**

Βρες ακριβώς:

```js
  ok(await page.locator('#oivNum').count() === 0, 'no invoice form while blocked');
```

Αντικατάστησε με:

```js
  ok(await page.locator('#oivNum').count() === 1, 'B0: the ΤΠΥ form is there while the pieces are out');
```

**tests/critics/stock-orders-rig.js — αλλαγή 5.**

Βρες ακριβώς:

```js
  ok(mtxt === 'Μένουν 2 παλέτες στην αποθήκη. Γράφονται χαμένες· η παρτίδα δεν δίνει άλλα κομμάτια. Ανοίγει ξανά μέχρι να τιμολογηθεί.', 'O1: the modal names the consequence — ' + mtxt);
```

Αντικατάστησε με:

```js
  ok(mtxt === 'Μένουν 2 παλέτες στην αποθήκη. Γράφονται χαμένες· η παρτίδα δεν δίνει άλλα κομμάτια. Ανοίγει ξανά αν χρειαστεί.', 'O1: the modal names the consequence — ' + mtxt);
```

**tests/critics/stock-orders-rig.js — αλλαγή 6.**

Βρες ακριβώς:

```js
  // O3: an invoice dated before the last piece is warned about (it passed silently against the intake)
  await page.fill('#oivDate', addDays(TODAY, -2));
  await page.dispatchEvent('#oivDate', 'input');
  ok(/πριν την ολοκλήρωση της παρτίδας \(/.test(await page.locator('#oivHint').innerText()), 'C2-03: invoice date before the completion → «πριν την ολοκλήρωση της παρτίδας» warning');
```

Αντικατάστησε με:

```js
  // B0 (21/10): an invoice dated before the lot's completion is normal — no warning any more
  await page.fill('#oivDate', addDays(TODAY, -2));
  await page.dispatchEvent('#oivDate', 'input');
  ok(!/πριν/.test(await page.locator('#oivHint').innerText()), 'B0: invoice date before the completion → no warning');
```

**tests/critics/stock-orders-rig.js — αλλαγή 7.**

Βρες ακριβώς:

```js
// re-read, the lot waits again. A refusal (lot invoiced meanwhile) is said once
// by core/api.js and the card adds only the context.
```

Αντικατάστησε με:

```js
// re-read, the lot waits for its pieces again (still «προς κοπή», B0). A refusal
// (e.g. the lot was unmarked meanwhile) is said once by core/api.js and the card
// adds only the context.
```

**tests/critics/stock-orders-rig.js — αλλαγή 8.**

Βρες ακριβώς:

```js
  // refused once (the lot was invoiced meanwhile): the base's sentence once, the card only the context
  cap.reopenFail = { type: 'STOCK_RULE', code: 'reopen_invoiced', message: 'Τιμολογημένη παρτίδα δεν ξανανοίγει' };
```

Αντικατάστησε με:

```js
  // refused once (071a lifted reopen_invoiced; a lot unmarked meanwhile still refuses):
  // the base's sentence once, the card only the context
  cap.reopenFail = { type: 'STOCK_RULE', code: 'lot_missing', message: 'Η παρτίδα δεν είναι ενεργή' };
```

**tests/critics/stock-orders-rig.js — αλλαγή 9.**

Βρες ακριβώς:

```js
  ok((both.match(/Τιμολογημένη παρτίδα δεν ξανανοίγει/g) || []).length === 1,
```

Αντικατάστησε με:

```js
  ok((both.match(/Η παρτίδα δεν είναι ενεργή/g) || []).length === 1,
```

**tests/critics/stock-orders-rig.js — αλλαγή 10.**

Βρες ακριβώς:

```js
  await page.waitForFunction(() => /περιμένει κομμάτια/.test(([...document.querySelectorAll('#oivBody tr.oiv-r')].find(tr => /TEST-STOCK-LOT/.test(tr.innerText)) || {}).innerText || ''), null, { timeout: 10000 });
```

Αντικατάστησε με:

```js
  await page.waitForFunction(() => /άνοιξε ξανά — περιμένει κομμάτια/.test((document.getElementById('toast') || {}).innerText || ''), null, { timeout: 10000 });
  const reRow = (await page.locator('#oivBody tr.oiv-r', { hasText: 'TEST-STOCK-LOT' }).innerText()).replace(/\s+/g, ' ');
  ok(/προς κοπή/.test(reRow), 'B0: the reopened lot stays «προς κοπή» — ' + reRow);
```

**tests/critics/stock-orders-rig.js — αλλαγή 11.**

Βρες ακριβώς:

```js
  ok(set.st && set.st.key === 'blocked' && set.st.reason === 'stock' && set.failed === false, 'G-07: its lot stays blocked, no «failed» banner — ' + JSON.stringify(set.st));
```

Αντικατάστησε με:

```js
  ok(set.st && set.st.key === 'ready' && set.failed === false, 'G-07 + B0: no lot read and nothing blocked, no «failed» banner — ' + JSON.stringify(set.st));
```

- [ ] **Βήμα 3: σερβίρισε το worktree και τρέξε τα τέσσερα rigs** (cwd = το κύριο repo, γιατί εκεί είναι τα `node_modules` και το `.har`)

```bash
cd /Users/dimitrispetras/PETRASGROUP-TMS/.claude/worktrees/b0-invoice && (python3 -m http.server 8797 --bind 127.0.0.1 >/dev/null 2>&1 &)
cd /Users/dimitrispetras/PETRASGROUP-TMS
WT=.claude/worktrees/b0-invoice; OUT=/tmp/b0-rig; mkdir -p $OUT
PW_BASE_URL=http://127.0.0.1:8797/ PW_SHOT_DIR=$OUT node $WT/tests/critics/orders-invoicing-proof.js 2>&1 | grep -E "✗|assertions"
PW_BASE_URL=http://127.0.0.1:8797/ PW_SHOT_DIR=$OUT node $WT/tests/critics/orders-noprice-proof.js 2>&1 | grep -E "✗|assertions"
PW_BASE_URL=http://127.0.0.1:8797/ PW_SHOT_DIR=$OUT node $WT/tests/critics/orders-week-proof.js 2>&1 | grep -E "✗|assertions"
node $WT/tests/critics/stock-orders-rig.js http://127.0.0.1:8797/ $OUT 2>&1 | grep -E "✗|passed"
```

Αναμενόμενο. Μετρήθηκε σε αντίγραφο του `62d09f9d` με όλες τις αλλαγές των εργασιών 2–6:
- invoicing: `79/80 assertions`, και αποτυγχάνει μόνο το `✗ CSV header = the 12 ERP columns`. **Υπήρχε ήδη:** 79/80 και στο `62d09f9d` χωρίς αλλαγές, γιατί το «Φύλλο ERP» έχει 13 στήλες από τη C2-04.
- noprice: `74/74 assertions`
- week: `74/74 assertions`
- stock: `323 passed, 1 failed`, και αποτυγχάνει μόνο το `✗ C2-02: unpriced lot still waiting → … «χωρίς τιμή → owner» …`. **Υπήρχε ήδη:** 322 passed και 1 failed, το ίδιο, στο `62d09f9d`. Το +1 είναι ο νέος ισχυρισμός «the reopened lot stays «προς κοπή»».

Οποιοδήποτε **άλλο** `✗`: σταμάτα και διόρθωσε πριν το commit.

- [ ] **Βήμα 4: σταμάτα τον server**

```bash
pkill -f "http.server 8797"
```

---

### Εργασία 7: Cache bust και commit του front end

**Files:**
- Modify: `app.html` (4 γραμμές `?v=`), `sw.js` (`SW_VERSION`)

- [ ] **Βήμα 1: ένα TIMESTAMP για όλα**

```bash
TS=$(date +%s)
sed -i '' -E "s#(core/orders-common\.js\?v=)[0-9]+#\1$TS#; s#(modules/orders_invoicing_view\.js\?v=)[0-9]+#\1$TS#; s#(modules/orders_noprice_view\.js\?v=)[0-9]+#\1$TS#; s#(modules/orders_intl\.js\?v=)[0-9]+#\1$TS#" app.html
sed -i '' -E "s#^const SW_VERSION = '[0-9]+';#const SW_VERSION = '$TS';#" sw.js
grep -nE "orders-common\.js|orders_invoicing_view\.js|orders_noprice_view\.js|orders_intl\.js" app.html; grep -n "^const SW_VERSION" sw.js
TZ=Europe/Athens node --test tests/sw-app-shell.test.js 2>&1 | grep -E "^ℹ (pass|fail)"
```

Αναμενόμενο: οι 4 γραμμές του `app.html` (137, 161, 165, 167 στο `62d09f9d`) και το `SW_VERSION` δείχνουν το ίδιο `$TS`· `ℹ pass 3`, `ℹ fail 0`.

- [ ] **Βήμα 2: commit** (ρητές διαδρομές, όχι `git add -A`)

```bash
git add core/orders-common.js modules/orders_invoicing_view.js modules/orders_noprice_view.js modules/orders_intl.js \
  tests/invoice-from-registration.test.js tests/orders-stock.test.js tests/orders-invoicing-view.test.js tests/orders-week-view.test.js \
  tests/critics/stock-orders-rig.js tests/critics/orders-noprice-proof.js app.html sw.js
git commit -m "$(cat <<'EOF'
Invoicing from registration (B0): every order, a stock lot too, is «προς κοπή» once registered

Owner 21/10/2026 (spec national-v5 «Χρήματα», phase B0): only a price > 0 stops
an invoice — not the delivery, not the stock, not the pallet slip. OrdersData
reads every order that is not cancelled; stateOf no longer has a «not
delivered», «stock» or «pending» block — pre-orders are in (owner 22/10); ageOf counts
from the order's own delivery, a lot too; the pallet slip is asked about only
after the delivery. The invoicing card says where the delivery stands, shows a
lot's pieces as information and offers «Κλείσιμο υπολοίπου» in ΕΛΕΓΧΟΙ; no
«πριν την παράδοση» date warning. Mirrors of 071a: reopenable and the lot mark
no longer depend on the invoice. Front first only AFTER 071a ran (owner).

Tests: node 692/692 (8 new, 2 removed with the gate they tested). Rigs:
invoicing 79/80, stock 323/324 — the same pre-existing failure each as on
origin/main; noprice 74/74, week 74/74.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Εργασία 8: Ελεγκτής, οι πηγές S-03 / B-15 και το seed

**Files:**
- Modify: `tms-auditor/checks/S-03.sql` (γρ. 15)
- Modify: `tms-auditor/checks/B-15.sql` (γρ. 14 και 16)
- Regenerate: `worker/migrations/drafts/047b_monitoring_seed.sql`

- [ ] **Βήμα 1: `tms-auditor/checks/S-03.sql`.** Η γραμμή 15 `-- enabled: yes` γίνεται:

```sql
-- enabled: no: 071a (owner 21/10/2026): κάθε παραγγελία τιμολογείται από την καταχώρηση, και η παρτίδα επίσης· τιμολογημένη παρτίδα που περιμένει ακόμη κομμάτια είναι πλέον κανονική κατάσταση, όχι εύρημα.
```

Το SQL του S-03 **δεν αλλάζει**. Το 071a το ελέγχει με md5 και το απενεργοποιεί, δεν το σβήνει.

- [ ] **Βήμα 2: `tms-auditor/checks/B-15.sql`.** Στο τέλος της γραμμής 14 (`-- source: …ζωντανό μόνο μετά τα 057 + 057b`) πρόσθεσε:

```text
 · 071a (owner 21/10/2026): η παρτίδα μετρά από τη δική της παράδοση, όπως κάθε παραγγελία (ίδιος κανόνας με το OrdersData.ageOf)
```

και η γραμμή 16 (το SQL) γίνεται:

```sql
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status='Delivered' AND o.invoiced IS NOT TRUE AND o.parent_order_id IS NULL AND o.stock_lot_id IS NULL AND coalesce(o.actual_delivery_date,o.delivery_datetime) < current_date-30;
```

- [ ] **Βήμα 3: ξαναπαράγαγε το seed**

```bash
node tms-auditor/checks/build-seed.mjs
git diff --stat worker/migrations/drafts/047b_monitoring_seed.sql
```

Αναμενόμενο: `seed: 91 checks (85 enabled) → …047b_monitoring_seed.sql`, και αλλάζουν ακριβώς 2 γραμμές του seed (B-15 και S-03), `2 insertions(+), 2 deletions(-)`.

---

### Εργασία 9: Ο builder του 071a και τα τρία αρχεία SQL που γράφουν

**Files:**
- Create: `worker/migrations/drafts/tools/build-071a.mjs`
- Create (παραγόμενα): `worker/migrations/drafts/071a_invoice_from_registration.sql`, `…_dryrun.sql`, `…_rollback.sql`

**Interfaces (exports του builder, για τα tests):** `DRAFTS`, `SRC_057`, `TARGETS`, `md5`, `LIVE_MD5`, `LIVE_B15_MD5`, `LIVE_S03_MD5`, `LIVE_B15_SQL`, `body057(src, fn)`, `SUBS`, `FNS`, `generate(src057)`, `auditorRows()`, `buildApply/buildDryRun/buildRollback(g, a)`, `buildAll()`.

Πώς δουλεύει το 071a: ένα DO block. Πρώτα **φύλακες**: το md5 του `prosrc` κάθε φρουρού πρέπει να είναι το ζωντανό της 22/10, να μην είναι SECURITY DEFINER και να έχει `search_path=public`· τα 3 triggers ενεργά· S-03 και B-15 όπως μετρήθηκαν· B-54 = ο ζωντανός αριθμός triggers. Μετά, για κάθε φρουρό, παίρνει το **ζωντανό** κείμενο, κάνει τις αντικαταστάσεις (το παλιό κείμενο ως base64), ελέγχει ότι η καθεμία βρέθηκε **ακριβώς μία** φορά, ελέγχει το md5 του αποτελέσματος, και τρέχει `CREATE OR REPLACE` (κρατά oid, owner, grants και trigger). Ύστερα ελέγχει ξανά το md5 και το ACL. Τέλος: S-03 off, B-15 νέο κείμενο, B-54 αμετάβλητο. Το rollback ξαναγράφει **ολόκληρο** το κείμενο του 057 (base64) και ελέγχει md5 πριν και μετά.

- [ ] **Βήμα 1: γράψε τον builder**

```js
// Generates the three WRITING files of 071a from their sources (principle 3: generated, never retyped):
//   071a_invoice_from_registration.sql           the change (ONE DO block)
//   071a_invoice_from_registration_dryrun.sql    the same block + a deliberate error: NOTHING kept
//   071a_invoice_from_registration_rollback.sql  the exact way back (ONE DO block)
//   node worker/migrations/drafts/tools/build-071a.mjs          (writes all three)
//   node worker/migrations/drafts/tools/build-071a.mjs --check  (exit 1 if a committed file drifted)
// Sources:
//   - the three stock guards as they LIVE: 057's function bodies byte for byte (prosrc md5 read on
//     production 22/10/2026 = the md5 of 057's text, asserted below);
//   - SUBS: every place where «invoiced» stood for «the lot is finished» (owner 21/10/2026: every order,
//     a lot included, is invoiced from its registration). The ONLY invoice rule left in the guards is the
//     lot PRICE freeze (the invoice states that price; OWNER-Q4 4/10);
//   - the auditor rows B-15 and S-03 exactly as tms-auditor/checks/*.sql state them (the seed 047b is
//     generated from the same files, so the base and the seed cannot disagree).
// Greek travels as base64 (precedent 066): the generated files are ASCII only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadChecks } from '../../../../tms-auditor/checks/load.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DRAFTS = path.resolve(HERE, '..');
export const SRC_057 = path.join(DRAFTS, '057_stock_lots.sql');
export const TARGETS = {
  apply: '071a_invoice_from_registration.sql',
  dryrun: '071a_invoice_from_registration_dryrun.sql',
  rollback: '071a_invoice_from_registration_rollback.sql',
};
export const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const count = (hay, needle) => hay.split(needle).length - 1;

// prosrc md5 of the three guards, read on production 22/10/2026 (SELECT md5(prosrc) FROM pg_proc ...).
export const LIVE_MD5 = {
  stock_guard_lots: '46e61e5f4c1e74af19cba5ddaa9f2975',
  stock_guard_orders: '20833484dffdf168b1e1de9fdc242027',
  stock_guard_natl: '26b4cc060ab15152a51693c9f0a67f81',
};
// The auditor rows as they live (read 22/10/2026): 071a changes them only if they are still these.
export const LIVE_B15_MD5 = '40d8808efe298f7321a8706dc726a784';
export const LIVE_S03_MD5 = '0df9746599fb62724c719d2f467ff280';
export const LIVE_B15_SQL = "SELECT count(*) FROM orders o LEFT JOIN stock_v_lots l ON l.order_id = o.id WHERE o.deleted_at IS NULL AND o.status='Delivered' AND o.invoiced IS NOT TRUE AND o.parent_order_id IS NULL AND o.stock_lot_id IS NULL AND CASE WHEN l.id IS NULL THEN coalesce(o.actual_delivery_date,o.delivery_datetime) < current_date-30 ELSE l.complete AND l.completed_on < current_date-30 END";

// The body of `create function public.<fn>()` in 057 = what Postgres keeps as prosrc.
export function body057(src, fn) {
  const i = src.indexOf(`create function public.${fn}() returns trigger`);
  if (i < 0) throw new Error(`057: ${fn} not found`);
  const a = src.indexOf('$f$', i) + 3;
  const b = src.indexOf('$f$', a);
  return src.slice(a, b);
}

const C = '-- 071a (owner 21/10/2026): ';
export const SUBS = [
  // ── stock_guard_lots ───────────────────────────────────────────────────────────────────────────
  { fn: 'stock_guard_lots', old: '    v_invoiced boolean;\n', new: '' },
  { fn: 'stock_guard_lots', old: `    -- invoiced read from the source row itself (also when the source is deleted).
    v_invoiced := coalesce((select o2.invoiced from public.orders o2 where o2.id = new.order_id),
                           (select n2.invoiced from public.national_orders n2 where n2.id = new.nat_order_id),
                           false);

`, new: `    ${C}the source's invoice no longer judges anything here: an invoiced
    -- lot is marked, closed, reopened and unmarked like any other.

` },
  { fn: 'stock_guard_lots', old: `      if v_invoiced then
        perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — δεν καταργείται');
      end if;
`, new: '' },
  { fn: 'stock_guard_lots', old: 'is distinct from old.warehouse_charge and v_invoiced then', new: 'is distinct from old.warehouse_charge and <source invoiced> then' },
  { fn: 'stock_guard_lots', old: `        if coalesce(o.invoiced, false) then
          perform stock_raise('lot_invoiced', 'Τιμολογημένη παραγγελία δεν γίνεται παρτίδα');
        end if;
        if public.order_pallets(o) <= 0 then`, new: `        if public.order_pallets(o) <= 0 then` },
  { fn: 'stock_guard_lots', old: `        if coalesce(n.invoiced, false) then
          perform stock_raise('lot_invoiced', 'Τιμολογημένη παραγγελία δεν γίνεται παρτίδα');
        end if;
`, new: '' },
  { fn: 'stock_guard_lots', old: `      if v_invoiced then
        perform stock_raise('reopen_invoiced', 'Τιμολογημένη παρτίδα δεν ξανανοίγει');
      end if;
`, new: '' },
  { fn: 'stock_guard_lots', old: `      if v_invoiced then
        perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — δεν αλλάζει');
      end if;
`, new: '' },
  // ── stock_guard_orders ─────────────────────────────────────────────────────────────────────────
  { fn: 'stock_guard_orders', old: '    v_done    bigint;\n', new: '' },
  { fn: 'stock_guard_orders', old: `        -- Locked like a draw: a delete racing «Invoiced» on the lot queues behind it (or before it).
        perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
        if coalesce((select coalesce(so.invoiced, sn.invoiced, false)
                       from public.stock_lots s
                       left join public.orders so on so.id = s.order_id
                       left join public.national_orders sn on sn.id = s.nat_order_id
                      where s.id = new.stock_lot_id), false) then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — αναίρεσε πρώτα το τιμολόγιο');
        end if;
`, new: `        -- Locked like a draw (D-22). ${C.slice(3)}the lot's invoice no longer refuses a delete.
        perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
` },
  { fn: 'stock_guard_orders', old: 'select v.client_id, v.warehouse_location_id, v.ops_status, v.invoiced, v.closed_at, v.stock_pallets, v.intake_status',
    new: 'select v.client_id, v.warehouse_location_id, v.ops_status, v.closed_at, v.stock_pallets, v.intake_status' },
  { fn: 'stock_guard_orders', old: `        if st.invoiced then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — αναίρεσε πρώτα το τιμολόγιο');
        end if;
`, new: `        ${C}an invoiced lot still gives pieces (invoiced from registration).
` },
  { fn: 'stock_guard_orders', old: `      -- Once the lot is invoiced, the piece's status is frozen (round 1, critic-3 Σ-08 / critic-2
      -- E2-11): an Undo of «Παραδόθηκε» or a form re-save after the invoice would leave an invoiced
      -- lot with a piece «in transit» — invoiced AND incomplete, found only by S-03 an hour later.
      -- Revivals and inserts are already judged above (lot_invoiced). Only a piece LEAVING Delivered
      -- can race the invoice mark (which reads «all delivered»), so only that takes the lot lock —
      -- FOR NO KEY UPDATE like every draw (D-22); other status steps never lock the lot.
      if tg_op = 'UPDATE' and not v_revived and new.status is distinct from old.status then
        if old.status = 'Delivered' then
          perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
        end if;
        if coalesce((select coalesce(so.invoiced, sn.invoiced, false)
                       from public.stock_lots s
                       left join public.orders so on so.id = s.order_id
                       left join public.national_orders sn on sn.id = s.nat_order_id
                      where s.id = new.stock_lot_id), false) then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — η κατάσταση του κομματιού δεν αλλάζει· αναίρεσε πρώτα το τιμολόγιο');
        end if;
      end if;
`, new: `      ${C}the lot's invoice no longer freezes a piece's status (the round-1
      -- freeze assumed the invoice came last; it now comes first). A piece LEAVING Delivered still takes
      -- the lot lock, FOR NO KEY UPDATE like every draw (D-22): the close reads "all delivered".
      if tg_op = 'UPDATE' and not v_revived and new.status is distinct from old.status
         and old.status = 'Delivered' then
        perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
      end if;
` },
  { fn: 'stock_guard_orders', old: `      select count(*), count(*) filter (where p.delivered), coalesce(sum(p.pallets), 0)
        into v_pieces, v_done, v_drawn
`, new: `      select count(*), coalesce(sum(p.pallets), 0)
        into v_pieces, v_drawn
` },
  { fn: 'stock_guard_orders', old: `        -- Round 1 (critic-2 E2-11, the source side of Σ-08): an invoiced lot's intake stays
        -- delivered — the status of the source no longer changes while «Invoiced» stays on. Clearing
        -- «Invoiced» in the same save passes (the 043 guard decides who may do that).
        if old.invoiced is true and new.invoiced is true and new.status is distinct from old.status then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — η κατάσταση της παραλαβής δεν αλλάζει· αναίρεσε πρώτα το τιμολόγιο');
        end if;
`, new: `        ${C}the intake's status follows the warehouse after the invoice too.
` },
  { fn: 'stock_guard_orders', old: `Clearing
        -- «Invoiced» in the same save passes, like the status freeze above.`, new: `Clearing
        -- the invoice in the same save passes. 071a keeps THIS rule: the invoice states the price.` },
  { fn: 'stock_guard_orders', old: `      -- ONE invoice for the whole lot, only when everything arrived (owner 3–4/10): judged with the
      -- NEW status, so «Delivered + Invoiced» in one save is judged as the save would leave it.
      if new.invoiced is true and (tg_op = 'INSERT' or old.invoiced is not true) then
        if not coalesce(new.status = 'Delivered' and v_pieces = v_done
                        and (v_new_p - v_drawn = 0 or v_lot.closed_at is not null), false) then
          perform stock_raise('invoice_incomplete',
            format('Η παρτίδα δεν τιμολογείται ακόμη: %s παλέτες στην αποθήκη, %s κομμάτια σε εξέλιξη',
                   trim_scale(v_new_p - v_drawn), v_pieces - v_done));
        end if;
      end if;
`, new: `      ${C}a lot is invoiced like any order, from its registration. The
      -- old "one invoice only when everything arrived" refusal (invoice_incomplete) is gone.
` },
  // ── stock_guard_natl ───────────────────────────────────────────────────────────────────────────
  { fn: 'stock_guard_natl', old: '    v_done    bigint;\n', new: '' },
  { fn: 'stock_guard_natl', old: `        perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
        if coalesce((select coalesce(so.invoiced, sn.invoiced, false)
                       from public.stock_lots s
                       left join public.orders so on so.id = s.order_id
                       left join public.national_orders sn on sn.id = s.nat_order_id
                      where s.id = new.stock_lot_id), false) then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — αναίρεσε πρώτα το τιμολόγιο');
        end if;
        if old.status = 'In Transit'`, new: `        perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
        ${C}the lot's invoice no longer refuses a delete.
        if old.status = 'In Transit'` },
  { fn: 'stock_guard_natl', old: 'select v.client_id, v.warehouse_location_id, v.ops_status, v.invoiced, v.closed_at, v.stock_pallets, v.intake_status',
    new: 'select v.client_id, v.warehouse_location_id, v.ops_status, v.closed_at, v.stock_pallets, v.intake_status' },
  { fn: 'stock_guard_natl', old: `        if st.invoiced then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — αναίρεσε πρώτα το τιμολόγιο');
        end if;
`, new: `        ${C}an invoiced lot still gives pieces (invoiced from registration).
` },
  { fn: 'stock_guard_natl', old: `      -- Invoiced lot → the piece's status is frozen (round 1 Σ-08, see stock_guard_orders). National
      -- «delivered» is derived from status AND date, so a delivery date moved past today (delivered
      -- → not) is the same step back as a status change; a date correction that stays delivered passes.
      if tg_op = 'UPDATE' and not v_revived
         and (new.status is distinct from old.status
              or public.stock_natl_delivered(new.status, new.delivery_datetime)
                 is distinct from public.stock_natl_delivered(old.status, old.delivery_datetime)) then
        if public.stock_natl_delivered(old.status, old.delivery_datetime) then
          perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
        end if;
        if coalesce((select coalesce(so.invoiced, sn.invoiced, false)
                       from public.stock_lots s
                       left join public.orders so on so.id = s.order_id
                       left join public.national_orders sn on sn.id = s.nat_order_id
                      where s.id = new.stock_lot_id), false) then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — η κατάσταση του κομματιού δεν αλλάζει· αναίρεσε πρώτα το τιμολόγιο');
        end if;
      end if;
`, new: `      ${C}the lot's invoice no longer freezes a piece's status or date
      -- (see stock_guard_orders). A piece LEAVING delivered still takes the lot lock (D-22).
      if tg_op = 'UPDATE' and not v_revived
         and (new.status is distinct from old.status
              or public.stock_natl_delivered(new.status, new.delivery_datetime)
                 is distinct from public.stock_natl_delivered(old.status, old.delivery_datetime))
         and public.stock_natl_delivered(old.status, old.delivery_datetime) then
        perform 1 from public.stock_lots s where s.id = new.stock_lot_id for no key update;
      end if;
` },
  { fn: 'stock_guard_natl', old: `      select count(*), count(*) filter (where p.delivered), coalesce(sum(p.pallets), 0)
        into v_pieces, v_done, v_drawn
`, new: `      select count(*), coalesce(sum(p.pallets), 0)
        into v_pieces, v_drawn
` },
  { fn: 'stock_guard_natl', old: `        -- Round 1 (E2-11, see stock_guard_orders): an invoiced lot's intake stays delivered — status
        -- and the date-derived «delivered» of the national source no longer change while invoiced.
        if old.invoiced is true and new.invoiced is true
           and (new.status is distinct from old.status
                or public.stock_natl_delivered(new.status, new.delivery_datetime)
                   is distinct from public.stock_natl_delivered(old.status, old.delivery_datetime)) then
          perform stock_raise('lot_invoiced', 'Η παρτίδα τιμολογήθηκε — η κατάσταση της παραλαβής δεν αλλάζει· αναίρεσε πρώτα το τιμολόγιο');
        end if;
`, new: `        ${C}the intake's status follows the warehouse after the invoice too.
` },
  { fn: 'stock_guard_natl', old: `      if new.invoiced is true and (tg_op = 'INSERT' or old.invoiced is not true) then
        if not coalesce(public.stock_natl_delivered(new.status, new.delivery_datetime) and v_pieces = v_done
                        and (v_new_p - v_drawn = 0 or v_lot.closed_at is not null), false) then
          perform stock_raise('invoice_incomplete',
            format('Η παρτίδα δεν τιμολογείται ακόμη: %s παλέτες στην αποθήκη, %s κομμάτια σε εξέλιξη',
                   trim_scale(v_new_p - v_drawn), v_pieces - v_done));
        end if;
      end if;
`, new: `      ${C}a lot is invoiced like any order, from its registration
      -- (invoice_incomplete is gone, see stock_guard_orders).
` },
];
export const FNS = ['stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl'];


// Applies SUBS to the live texts: every target exactly once, in order. Throws on any deviation.
export function generate(src057) {
  const out = {};
  for (const fn of FNS) {
    const live = body057(src057, fn);
    if (md5(live) !== LIVE_MD5[fn]) throw new Error(`${fn}: 057's text (md5 ${md5(live)}) is not the live text ${LIVE_MD5[fn]}`);
    const subs = SUBS.filter((s) => s.fn === fn);
    let next = live;
    for (const s of subs) {
      if (count(next, s.old) !== 1) throw new Error(`${fn}: target not exactly once: ${JSON.stringify(s.old.slice(0, 60))}`);
      if (nonAscii(s.new).length) throw new Error(`${fn}: a new text must be ASCII: ${JSON.stringify(s.new.slice(0, 60))}`);
      next = next.replace(s.old, () => s.new);
    }
    out[fn] = { live, next, subs };
  }
  return out;
}

// The auditor rows after 071a, from the ONE source the seed is built from.
export function auditorRows() {
  const { checks, errors } = loadChecks();
  if (errors.length) throw new Error('tms-auditor/checks lint: ' + errors.join('; '));
  const b15 = checks.find((c) => c.id === 'B-15');
  const s03 = checks.find((c) => c.id === 'S-03');
  if (!b15 || !s03) throw new Error('B-15 / S-03 missing from tms-auditor/checks');
  if (s03.enabled) throw new Error('S-03.sql must say "-- enabled: no: <reason>" (071a disables it)');
  if (md5(s03.sql) !== LIVE_S03_MD5) throw new Error('S-03.sql text is not the live one - 071a only disables it');
  if (md5(b15.sql) === LIVE_B15_MD5) throw new Error('B-15.sql still holds the pre-071a text');
  if (md5(LIVE_B15_SQL) !== LIVE_B15_MD5) throw new Error('LIVE_B15_SQL does not match its md5');
  if (nonAscii(b15.sql).length) throw new Error('B-15 text must be ASCII');
  return { b15Sql: b15.sql, s03Reason: s03.disabled_reason };
}

const sqlStr = (s) => "'" + s.replace(/'/g, "''") + "'";
const nonAscii = (s) => [...s].filter((c) => c.charCodeAt(0) > 127);
const want = (g) => FNS.map((fn) => `"${fn}": ["${LIVE_MD5[fn]}", "${md5(g[fn].next)}"]`).join(', ');
const TRIGGERS = `ARRAY['stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl']`;
const COUNT_TRG = `SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public'`;

// The DO block of 071a (shared verbatim by the dry run).
function applyBlock(g, a) {
  const rows = [];
  for (const fn of FNS) g[fn].subs.forEach((s, i) => rows.push(`      ('${fn}', ${i + 1}, ${sqlStr(b64(s.old))}, ${sqlStr(s.new)})`));
  return `DECLARE
  r record; g text; src text; acl_before text; k int; m text;
  trg_before int; trg_after int;
  want CONSTANT jsonb := '{${want(g)}}';
BEGIN
  -- CREATE OR REPLACE FUNCTION waits for no table lock, but a stuck session could still hold the
  -- function: give up after 5 s instead of queueing - the whole block rolls back, run it again later.
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS (read only): the base is what was measured 22/10/2026.
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '071a: monitoring.checks does not exist (047 must run first)';
  END IF;
  FOREACH g IN ARRAY ${TRIGGERS} LOOP
    SELECT md5(p.prosrc) INTO m FROM pg_proc p WHERE p.oid = to_regprocedure('public.' || g || '()');
    IF m IS NOT DISTINCT FROM want->g->>1 THEN
      RAISE EXCEPTION '071a: % already holds the 071a text - run 071a_invoice_from_registration_verify.sql instead', g;
    END IF;
    IF m IS DISTINCT FROM want->g->>0 THEN
      RAISE EXCEPTION '071a: % is not the 057 text read 22/10 (md5 %) - stop, re-measure', g, m;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.' || g || '()')
                AND (p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public'])) THEN
      RAISE EXCEPTION '071a: % is SECURITY DEFINER or has another search_path than 057 gave it - stop', g;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O' AND tgname = ANY (${TRIGGERS})) <> 3 THEN
    RAISE EXCEPTION '071a: the three stock_guard triggers are not all enabled (S-02) - stop';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'S-03' AND enabled AND md5(sql_text) = '${LIVE_S03_MD5}') THEN
    RAISE EXCEPTION '071a: auditor S-03 is not the enabled check read 22/10 - stop, re-measure';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-15' AND md5(sql_text) = '${LIVE_B15_MD5}') THEN
    RAISE EXCEPTION '071a: auditor B-15 is not the text read 22/10 - stop, re-measure';
  END IF;
  ${COUNT_TRG.replace('SELECT count(*) FROM', 'SELECT count(*) INTO trg_before FROM')};
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL) THEN
    RAISE EXCEPTION '071a: B-54 red_value is not the live trigger count % - a migration changed triggers without bumping it, re-measure', trg_before;
  END IF;

  -- 1. The three guards, each from its LIVE text with the substitutions of
  --    worker/migrations/drafts/tools/build-071a.mjs (old text as base64: it holds Greek).
  FOREACH g IN ARRAY ${TRIGGERS} LOOP
    SELECT p.prosrc, p.proacl::text INTO src, acl_before FROM pg_proc p WHERE p.oid = ('public.' || g || '()')::regprocedure;
    FOR r IN
      SELECT s.seq, convert_from(decode(s.old_b64, 'base64'), 'UTF8') AS old_t, s.new_t
        FROM (VALUES
${rows.join(',\n')}
        ) AS s(fname, seq, old_b64, new_t)
       WHERE s.fname = g ORDER BY s.seq
    LOOP
      k := (length(src) - length(replace(src, r.old_t, ''))) / length(r.old_t);
      IF k <> 1 THEN
        RAISE EXCEPTION '071a: % substitution % found % times (expected exactly 1) - stop', g, r.seq, k;
      END IF;
      src := replace(src, r.old_t, r.new_t);
    END LOOP;
    IF md5(src) <> want->g->>1 THEN
      RAISE EXCEPTION '071a: the generated % is not the text built and tested (md5 %) - stop', g, md5(src);
    END IF;
    -- CREATE OR REPLACE keeps the oid, the owner, the grants and the trigger that calls it.
    EXECUTE format('CREATE OR REPLACE FUNCTION public.%I() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS %L', g, src);
    IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = ('public.' || g || '()')::regprocedure) <> want->g->>1
       OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = ('public.' || g || '()')::regprocedure) IS DISTINCT FROM acl_before THEN
      RAISE EXCEPTION '071a proof: % does not hold the generated text, or its grants changed', g;
    END IF;
  END LOOP;

  -- 2. AUDITOR (text = tms-auditor/checks/S-03.sql and B-15.sql, the files the 047b seed is built from).
  --    S-03 "invoiced lot not complete" was the P1 alarm of the old one-invoice rule: from today it is a
  --    normal state, an hourly false P1 would teach everyone to ignore the true ones. Disabled, never
  --    deleted: a disabled check is reported as a GAP with its reason.
  UPDATE monitoring.checks
     SET enabled = false, disabled_reason = convert_from(decode(${sqlStr(b64(a.s03Reason))}, 'base64'), 'UTF8')
   WHERE id = 'S-03' AND enabled AND md5(sql_text) = '${LIVE_S03_MD5}';
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '071a: S-03 not disabled (% rows)', k; END IF;
  --    B-15 (queue, P3): a lot counts from its own delivery like every order - the same rule as the
  --    screen's OrdersData.ageOf (one rule, principle 3). Before: from the day the lot became complete.
  UPDATE monitoring.checks SET sql_text = ${sqlStr(a.b15Sql)}
   WHERE id = 'B-15' AND md5(sql_text) = '${LIVE_B15_MD5}';
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '071a: B-15 not updated (% rows)', k; END IF;

  -- 3. B-54: no trigger is added or dropped.
  ${COUNT_TRG.replace('SELECT count(*) FROM', 'SELECT count(*) INTO trg_after FROM')};
  IF trg_after <> trg_before THEN
    RAISE EXCEPTION '071a proof: trigger count % -> % (expected unchanged)', trg_before, trg_after;
  END IF;

  RAISE NOTICE '071a OK: stock_guard_lots/_orders/_natl rewritten (only the lot price still freezes with the invoice), S-03 disabled, B-15 counts lots from their delivery, triggers % unchanged', trg_after;
`;
}

const RESULT_ROW = (g) => `SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.stock_guard_lots()'::regprocedure) = '${md5(g.stock_guard_lots.next)}'
             AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.stock_guard_orders()'::regprocedure) = '${md5(g.stock_guard_orders.next)}'
             AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.stock_guard_natl()'::regprocedure) = '${md5(g.stock_guard_natl.next)}'
            THEN '071a OK' ELSE '071a NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O' AND tgname = ANY (${TRIGGERS})) AS guard_triggers,
       (SELECT enabled FROM monitoring.checks WHERE id = 'S-03') AS s03_enabled,
       (SELECT md5(sql_text) FROM monitoring.checks WHERE id = 'B-15') AS b15_md5;`;

export function buildApply(g, a) {
  return `-- 071a - INVOICING FROM REGISTRATION: the stock guards of 057 stop treating "invoiced" as "the lot is finished".
--
-- GENERATED by worker/migrations/drafts/tools/build-071a.mjs - DO NOT EDIT BY HAND (tests/sql-071a-drafts.test.js
-- fails on any drift). DRAFT - NOT EXECUTED. Owner decision 21/10/2026 (spec docs/superpowers/specs/
-- 2026-10-21-national-v5-design.md, "Chrimata" first bullet, phase B0): every order - international and national,
-- a stock lot included - is invoiced as soon as it is registered. Nothing blocks it: not the delivery, not the
-- stock, not the pallet slip.
--
-- WHO / WHEN / ORDER: the owner, in the Supabase SQL editor, AFTER 15:00 (the team works 05:30-14:30), with an
-- explicit yes in the chat, the evening the front end of fix/invoice-from-registration is merged:
--   1. 071a_invoice_from_registration_verify.sql   read only: every line says "before"
--   2. 071a_invoice_from_registration_dryrun.sql   this block + a deliberate error: NOTHING kept
--   3. 071a_invoice_from_registration.sql          (this file)
--   4. 071a_invoice_from_registration_verify.sql   every line says "after"
-- No Worker change goes with it: the Worker maps the hint 'stock:<code>' of any refusal to a 422, and
-- invoiceMarkError (price + ERP number) is untouched. ASCII only (clipboard-safe). ONE DO block = ONE
-- statement: an error anywhere undoes all of it (the SQL editor is not atomic across statements - lesson 056).
--
-- WHY: 057 (4/10) enforced "ONE invoice per lot, only when everything arrived" inside the base, and froze the
-- lot after its invoice. With invoicing from registration the invoice comes FIRST, so every rule that read
-- "invoiced" as "finished" would now stop the lot's ordinary life:
--   stock_guard_orders / stock_guard_natl
--     - invoice_incomplete (a lot invoiced before its pieces arrive)          -> removed
--     - lot_invoiced on a new piece / a pallet change of a piece (the DRAW)   -> removed (else an invoiced lot
--                                                                               could never give a piece)
--     - lot_invoiced on a piece delete                                        -> removed
--     - lot_invoiced on a piece's status (and, national, its delivery date)   -> removed
--     - lot_invoiced on the lot source's own status                           -> removed
--     - lot_invoiced on the lot source's PRICE                                -> KEPT (the invoice states it)
--   stock_guard_lots
--     - an invoiced order may not become a lot (intl + national)              -> removed
--     - an invoiced lot may not be unmarked / reopened / have its close note changed -> removed
-- Unused after that, and removed so the text does not lie (principle 8): v_invoiced (lots), v_done (orders,
-- natl), v_lot's v.invoiced column in the draw select. Every other rule of 057 is byte for byte unchanged
-- (over_draw, piece_no_truck, lot_frozen, close_early, lot_has_pieces, ...).
-- Auditor: S-03 (P1 hourly "invoiced lot not complete") is disabled with its reason; B-15 (queue) counts a
-- lot from its own delivery, as the invoicing screen does.
--
-- MEASURED 22/10/2026 (SELECT only): prosrc of the three guards = 057's text byte for byte (md5 below);
-- 2 live lots, 0 invoiced, 1 international piece, 0 national pieces. No existing row changes: the guards
-- judge only future writes.
--
-- REVERSE: 071a_invoice_from_registration_rollback.sql (the three guards back to 057's text byte for byte,
-- S-03 on, B-15 back). Order: revert the front end first (PR revert + SW_VERSION), then the rollback.
--
-- EXPECTED: NOTICE "071a OK: ..." and ONE result row "071a OK | 3 | false | ${md5(a.b15Sql)}".
-- Anything else (an ERROR): nothing was kept - copy the message to the coordinator.

DO $do$
${applyBlock(g, a)}END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
${RESULT_ROW(g)}
`;
}

export function buildDryRun(g, a) {
  return `-- 071a DRY RUN - GENERATED by worker/migrations/drafts/tools/build-071a.mjs. DO NOT EDIT BY HAND.
-- WHY ONE DO BLOCK: the Supabase SQL editor is NOT atomic across statements (lesson 056), but ONE DO block is
--   ONE statement: its final error undoes everything inside it. ASCII only.
-- WHAT: 071a's own block, statement for statement (every guard, the three rewrites and their proofs, the two
--   auditor rows), then a read of the result, ENDING WITH A DELIBERATE ERROR: NOTHING is kept.
-- WHEN: after 15:00, BEFORE 071a_invoice_from_registration.sql.
-- EXPECTED (the red ERROR is deliberate): a NOTICE "071a OK: ..." and then
--   ERROR: P0001: DRY RUN 071a finished - EVERYTHING UNDONE, nothing kept  ||  lots <md5> orders <md5> natl <md5> S-03 false B-15 <md5>
--   Anything else (an ERROR from one of 071a's guards): do NOT run 071a, copy the message to the coordinator.

DO $dry$
DECLARE
  res text;
BEGIN
  -- ===== 071a_invoice_from_registration.sql, verbatim =====
  DECLARE
  ${applyBlock(g, a).replace(/^DECLARE\n/, '')}  END;
  -- ===== what it did =====
  res := format('lots %s orders %s natl %s S-03 %s B-15 %s',
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.stock_guard_lots()'::regprocedure),
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.stock_guard_orders()'::regprocedure),
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.stock_guard_natl()'::regprocedure),
    (SELECT enabled FROM monitoring.checks WHERE id = 'S-03'),
    (SELECT md5(sql_text) FROM monitoring.checks WHERE id = 'B-15'));
  RAISE EXCEPTION 'DRY RUN 071a finished - EVERYTHING UNDONE, nothing kept  ||  %', res;
END
$dry$;
`;
}

export function buildRollback(g, a) {
  const rows = FNS.map((fn) => `      ('${fn}', ${sqlStr(b64(g[fn].live))})`).join(',\n');
  return `-- 071a ROLLBACK - GENERATED by worker/migrations/drafts/tools/build-071a.mjs. DO NOT EDIT BY HAND.
-- The three stock guards back to 057's text BYTE FOR BYTE (carried whole, as base64: it holds Greek), S-03 enabled
-- again, B-15 back to its 057b text. ONE DO block, ASCII only, after 15:00, explicit yes.
-- ORDER: revert the front end of fix/invoice-from-registration FIRST (PR revert, SW_VERSION bump), then this file,
-- then 071a_invoice_from_registration_verify.sql (every line "before").
-- WARNING (the truth, not a fault): any lot invoiced while 071a was live and still incomplete makes S-03 red at its
-- next hourly run - under the old rule that IS a finding. The old guards judge only future writes: such a lot's
-- pieces can then neither be drawn nor change status until its invoice is undone (owner).

DO $do$
DECLARE
  r record; src text; m text; k int; acl_before text;
  want CONSTANT jsonb := '{${want(g)}}';
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  FOR r IN SELECT * FROM (VALUES
${rows}
    ) AS s(fname, body_b64) LOOP
    SELECT md5(p.prosrc), p.proacl::text INTO m, acl_before FROM pg_proc p WHERE p.oid = ('public.' || r.fname || '()')::regprocedure;
    IF m IS DISTINCT FROM want->r.fname->>1 THEN
      RAISE EXCEPTION '071a ROLLBACK: % is not the 071a text (md5 %) - nothing to roll back, or someone changed it since: stop', r.fname, m;
    END IF;
    src := convert_from(decode(r.body_b64, 'base64'), 'UTF8');
    IF md5(src) <> want->r.fname->>0 THEN
      RAISE EXCEPTION '071a ROLLBACK: the carried 057 text of % is damaged (md5 %) - stop', r.fname, md5(src);
    END IF;
    EXECUTE format('CREATE OR REPLACE FUNCTION public.%I() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS %L', r.fname, src);
    IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = ('public.' || r.fname || '()')::regprocedure) <> want->r.fname->>0
       OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = ('public.' || r.fname || '()')::regprocedure) IS DISTINCT FROM acl_before THEN
      RAISE EXCEPTION '071a ROLLBACK proof: % is not 057''s text again, or its grants changed', r.fname;
    END IF;
  END LOOP;
  UPDATE monitoring.checks SET enabled = true, disabled_reason = NULL WHERE id = 'S-03' AND NOT enabled AND md5(sql_text) = '${LIVE_S03_MD5}';
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '071a ROLLBACK: S-03 not re-enabled (% rows)', k; END IF;
  UPDATE monitoring.checks SET sql_text = ${sqlStr(LIVE_B15_SQL)}
   WHERE id = 'B-15' AND md5(sql_text) = '${md5(a.b15Sql)}';
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '071a ROLLBACK: B-15 not restored (% rows)', k; END IF;
  RAISE NOTICE '071a ROLLBACK OK: the three stock guards hold 057''s text again, S-03 enabled, B-15 restored';
END $do$;
`;
}

export function buildAll(src057 = fs.readFileSync(SRC_057, 'utf8')) {
  const g = generate(src057);
  const a = auditorRows();
  const files = { [TARGETS.apply]: buildApply(g, a), [TARGETS.dryrun]: buildDryRun(g, a), [TARGETS.rollback]: buildRollback(g, a) };
  for (const [f, s] of Object.entries(files)) if (nonAscii(s).length) throw new Error(`${f}: not ASCII`);
  return { g, a, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { g, files } = buildAll();
  const check = process.argv.includes('--check');
  let drift = 0;
  for (const [f, s] of Object.entries(files)) {
    const p = path.join(DRAFTS, f);
    if (check) { if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== s) { console.error('DRIFT: ' + f); drift++; } }
    else { fs.writeFileSync(p, s); console.log('wrote ' + f + ' (' + s.length + ' bytes)'); }
  }
  for (const fn of FNS) console.log(`${fn}: ${LIVE_MD5[fn]} -> ${md5(g[fn].next)}`);
  if (drift) process.exit(1);
}
```

- [ ] **Βήμα 2: παράγαγε τα αρχεία**

```bash
node worker/migrations/drafts/tools/build-071a.mjs
```

Αναμενόμενο (τα μεγέθη αφορούν το `62d09f9d`):

```text
wrote 071a_invoice_from_registration.sql (28297 bytes)
wrote 071a_invoice_from_registration_dryrun.sql (25130 bytes)
wrote 071a_invoice_from_registration_rollback.sql (68010 bytes)
stock_guard_lots: 46e61e5f4c1e74af19cba5ddaa9f2975 -> 231b539e429f5d404d0eaa46618d79c5
stock_guard_orders: 20833484dffdf168b1e1de9fdc242027 -> 63aa751d93cc8b34afa5587912de7045
stock_guard_natl: 26b4cc060ab15152a51693c9f0a67f81 -> e941edbca9ff1bbeba0c89d49eb71cb3
```

Αν ο builder πετάξει `target not exactly once` ή `is not the live text`, το 057 ή το SUBS άλλαξε: **σταμάτα**, μην «διορθώσεις» το md5.

- [ ] **Βήμα 3: διάβασε τη διαφορά του κειμένου των φρουρών** (για τον έλεγχο της εργασίας 14)

```bash
node -e '
import("./worker/migrations/drafts/tools/build-071a.mjs").then(m => { const fs = require("fs"); const { g } = m.buildAll();
  for (const fn of m.FNS) { fs.writeFileSync("/tmp/" + fn + ".057.sql", g[fn].live); fs.writeFileSync("/tmp/" + fn + ".071a.sql", g[fn].next); } })'
for f in stock_guard_lots stock_guard_orders stock_guard_natl; do diff /tmp/$f.057.sql /tmp/$f.071a.sql; done
```

Αναμενόμενο: φεύγουν μόνο τα μπλοκ `lot_invoiced` και `reopen_invoiced` του `stock_guard_lots`, τα `invoice_incomplete`, και τα `lot_invoiced` των orders/natl **εκτός** από το πάγωμα τιμής· φεύγουν επίσης οι `v_invoiced`, `v_done` και `v.invoiced`· οι κλειδαριές `for no key update` μένουν και οι 4 σε κάθε φρουρό orders/natl.

---

### Εργασία 10: Verify, μόνο ανάγνωση

**Files:**
- Create: `worker/migrations/drafts/071a_invoice_from_registration_verify.sql`

- [ ] **Βήμα 1: γράψε το αρχείο**

```sql
-- 071a VERIFY - READ ONLY (SELECT only, writes nothing). ASCII only.
-- Run it BEFORE 071a: every "state" line says "before". Run it AFTER 071a: every "state" line says "after".
-- The "ok ..." lines must say ok in both runs. Anything "UNKNOWN" or "STOP": do not go on, copy the result
-- to the coordinator. The fingerprints are those of worker/migrations/drafts/tools/build-071a.mjs
-- (tests/sql-071a-drafts.test.js fails if they drift from it).
SELECT 'stock_guard_lots' AS what,
       CASE md5(prosrc) WHEN '46e61e5f4c1e74af19cba5ddaa9f2975' THEN 'before'
                        WHEN '231b539e429f5d404d0eaa46618d79c5' THEN 'after'
                        ELSE 'UNKNOWN ' || md5(prosrc) END AS state
  FROM pg_proc WHERE oid = 'public.stock_guard_lots()'::regprocedure
UNION ALL
SELECT 'stock_guard_orders',
       CASE md5(prosrc) WHEN '20833484dffdf168b1e1de9fdc242027' THEN 'before'
                        WHEN '63aa751d93cc8b34afa5587912de7045' THEN 'after'
                        ELSE 'UNKNOWN ' || md5(prosrc) END
  FROM pg_proc WHERE oid = 'public.stock_guard_orders()'::regprocedure
UNION ALL
SELECT 'stock_guard_natl',
       CASE md5(prosrc) WHEN '26b4cc060ab15152a51693c9f0a67f81' THEN 'before'
                        WHEN 'e941edbca9ff1bbeba0c89d49eb71cb3' THEN 'after'
                        ELSE 'UNKNOWN ' || md5(prosrc) END
  FROM pg_proc WHERE oid = 'public.stock_guard_natl()'::regprocedure
UNION ALL
SELECT 'auditor S-03',
       CASE WHEN enabled AND md5(sql_text) = '0df9746599fb62724c719d2f467ff280' THEN 'before'
            WHEN NOT enabled AND md5(sql_text) = '0df9746599fb62724c719d2f467ff280' AND disabled_reason LIKE '071a (owner 21/10/2026)%' THEN 'after'
            ELSE 'UNKNOWN' END
  FROM monitoring.checks WHERE id = 'S-03'
UNION ALL
SELECT 'auditor B-15',
       CASE md5(sql_text) WHEN '40d8808efe298f7321a8706dc726a784' THEN 'before'
                          WHEN '8e4f22fd86852cf10e2e00b48e1bd2ee' THEN 'after'
                          ELSE 'UNKNOWN ' || md5(sql_text) END
  FROM monitoring.checks WHERE id = 'B-15'
UNION ALL
SELECT 'stock_guard triggers enabled',
       CASE WHEN count(*) = 3 THEN 'ok 3' ELSE 'STOP ' || count(*) END
  FROM pg_trigger
 WHERE NOT tgisinternal AND tgenabled = 'O' AND tgname IN ('stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl')
UNION ALL
SELECT 'guards: invoker, search_path, closed to the API roles',
       CASE WHEN count(*) = 3 THEN 'ok' ELSE 'STOP ' || count(*) END
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl')
   AND NOT p.prosecdef AND p.proconfig = ARRAY['search_path=public']
   AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
UNION ALL
SELECT 'B-54 red_value = live trigger count',
       CASE WHEN (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') = count(*) THEN 'ok ' || count(*) ELSE 'STOP ' || count(*) END
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
 WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public'
UNION ALL
SELECT 'lots: live / invoiced / not complete',
       count(*) || ' / ' || count(*) FILTER (WHERE invoiced) || ' / ' || count(*) FILTER (WHERE NOT complete)
  FROM stock_v_lots;
```

- [ ] **Βήμα 2: τρέξε το στην παραγωγή** (SELECT μόνο, επιτρέπεται: Supabase MCP `execute_sql`, project `gatejgbpyodlepkvqkgf`, με το σώμα του αρχείου)

Αναμενόμενο (μετρήθηκε 22/10):

| what | state |
|---|---|
| stock_guard_lots | before |
| stock_guard_orders | before |
| stock_guard_natl | before |
| auditor S-03 | before |
| auditor B-15 | before |
| stock_guard triggers enabled | ok 3 |
| guards: invoker, search_path, closed to the API roles | ok |
| B-54 red_value = live trigger count | ok 37 |
| lots: live / invoiced / not complete | 2 / 0 / 2 |

Οποιοδήποτε `UNKNOWN` ή `STOP`: σταμάτα, κάποιος άλλαξε κάτι μετά τις 22/10. Ξαναμέτρησε.

---

### Εργασία 11: Το στατικό test των drafts

**Files:**
- Create: `tests/sql-071a-drafts.test.js`

- [ ] **Βήμα 1: γράψε το test**

```js
// tests/sql-071a-drafts.test.js - run: node --test tests/sql-071a-drafts.test.js
// The 071a drafts (worker/migrations/drafts/071a_invoice_from_registration*) at build time, plain node, no
// database (principle 6: a stale fingerprint fails here, not at 15:30 on the owner's evening):
//   - ASCII only (the owner pastes them; a clipboard has mangled Greek before - Greek travels as base64);
//   - the writing files are ONE DO block (the SQL editor is not atomic across statements); verify writes nothing;
//   - the three writing files are GENERATED by tools/build-071a.mjs, never hand-edited;
//   - the md5 chain: 057's text in the repo IS the live text (read 22/10), the apply guards on it, the rollback
//     carries it back byte for byte, the verify names both fingerprints;
//   - what 071a removes and keeps, counted per refusal code: only the «invoiced means finished» rules go, the
//     lot PRICE freeze and every other rule of 057 stay, and no lock is lost.
// The rules themselves run on PGlite: tms-auditor/test/rules-071a.test.mjs.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DRAFTS = path.join(__dirname, '..', 'worker/migrations/drafts');
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');
const FILES = fs.readdirSync(DRAFTS).filter((f) => f.startsWith('071a_'));
const DO_FILES = ['071a_invoice_from_registration.sql', '071a_invoice_from_registration_dryrun.sql', '071a_invoice_from_registration_rollback.sql'];
const READ_ONLY = ['071a_invoice_from_registration_verify.sql'];
const builder = () => import(path.join(DRAFTS, 'tools/build-071a.mjs'));
const codes = (t) => { const o = {}; for (const m of t.matchAll(/stock_raise\('([a-z_]+)'/g)) o[m[1]] = (o[m[1]] || 0) + 1; return o; };
const n = (t, s) => t.split(s).length - 1;

test('the four 071a files are all there', () => {
  assert.deepStrictEqual(FILES.slice().sort(), DO_FILES.concat(READ_ONLY).sort());
});

test('ASCII only', () => {
  for (const f of FILES) assert.deepStrictEqual([...read(f)].filter((c) => c.charCodeAt(0) > 127), [], f);
});

test('each writing file is ONE DO block; the verify file writes nothing', () => {
  for (const f of DO_FILES) assert.strictEqual((read(f).match(/^DO \$/gm) || []).length, 1, f);
  const sql = read(READ_ONLY[0]).replace(/--[^\n]*/g, '').replace(/'[^']*'/g, "''");
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|GRANT|REVOKE|TRUNCATE|DO)\b/i);
});

test('the writing files are regenerated from their sources (node worker/migrations/drafts/tools/build-071a.mjs)', async () => {
  const { buildAll } = await builder();
  const { files } = buildAll();
  for (const [f, s] of Object.entries(files)) assert.strictEqual(read(f), s, `${f} drifted - regenerate it`);
});

test('md5 chain: 057 in the repo = the live text 071a guards on; the rollback carries it back; verify names both', async () => {
  const { buildAll, LIVE_MD5, md5, FNS } = await builder();
  const { g } = buildAll();
  const apply = read(DO_FILES[0]), rollback = read(DO_FILES[2]), verify = read(READ_ONLY[0]);
  for (const fn of FNS) {
    assert.strictEqual(md5(g[fn].live), LIVE_MD5[fn], `${fn}: 057's text is the live one (read 22/10)`);
    const after = md5(g[fn].next);
    assert.ok(apply.includes(`"${fn}": ["${LIVE_MD5[fn]}", "${after}"]`), `${fn}: 071a guards on both fingerprints`);
    assert.ok(verify.includes(`'${LIVE_MD5[fn]}' THEN 'before'`) && verify.includes(`'${after}' THEN 'after'`), `${fn}: verify names both`);
    const b64 = Buffer.from(g[fn].live, 'utf8').toString('base64');
    assert.strictEqual(n(rollback, `('${fn}', '${b64}')`), 1, `${fn}: the rollback carries 057's text whole`);
  }
});

test('what 071a removes and what it keeps (counted per refusal code), and no lock is lost', async () => {
  const { buildAll } = await builder();
  const { g } = buildAll();
  const removed = {
    stock_guard_lots: { lot_invoiced: [4, 0], reopen_invoiced: [1, 0] },
    stock_guard_orders: { lot_invoiced: [5, 1], invoice_incomplete: [1, 0] },
    stock_guard_natl: { lot_invoiced: [5, 1], invoice_incomplete: [1, 0] },
  };
  for (const [fn, want] of Object.entries(removed)) {
    const before = codes(g[fn].live), after = codes(g[fn].next);
    for (const [code, [b, a]] of Object.entries(want)) assert.deepStrictEqual([before[code] || 0, after[code] || 0], [b, a], `${fn} ${code}`);
    for (const code of Object.keys(before)) if (!want[code]) assert.strictEqual(after[code], before[code], `${fn}: ${code} untouched`);
    for (const lock of ['for no key update', 'for update', 'for share', 'for key share']) assert.strictEqual(n(g[fn].next, lock), n(g[fn].live, lock), `${fn}: «${lock}» kept`);
    for (const dead of ['v_invoiced', 'v_done', 'st.invoiced', 'v.invoiced']) assert.strictEqual(n(g[fn].next, dead), 0, `${fn}: no ${dead} left`);
  }
  // the one lot_invoiced left is the PRICE freeze (the invoice states the price, OWNER-Q4 4/10)
  for (const fn of ['stock_guard_orders', 'stock_guard_natl']) {
    assert.match(g[fn].next, /if old\.invoiced is true and new\.invoiced is true and new\.price is distinct from old\.price then\n\s+perform stock_raise\('lot_invoiced'/, fn);
  }
});

test('071a writes S-03 and B-15 exactly as tms-auditor/checks say; the rollback restores the 22/10 text', async () => {
  const { buildAll, LIVE_B15_SQL } = await builder();
  const { a } = buildAll();
  const apply = read(DO_FILES[0]), rollback = read(DO_FILES[2]);
  assert.ok(apply.includes(Buffer.from(a.s03Reason, 'utf8').toString('base64')), 'S-03 reason (base64) = S-03.sql');
  assert.ok(apply.includes(`SET sql_text = '${a.b15Sql.replace(/'/g, "''")}'`), 'B-15 text = B-15.sql');
  assert.ok(rollback.includes(`SET sql_text = '${LIVE_B15_SQL.replace(/'/g, "''")}'`), 'rollback: B-15 back to 22/10');
  assert.match(a.s03Reason, /^071a \(owner 21\/10\/2026\)/, 'the verify file matches the reason by this prefix');
});
```

- [ ] **Βήμα 2: τρέξε το**

```bash
node --test tests/sql-071a-drafts.test.js 2>&1 | grep -E "^(✔|✖)|^ℹ (pass|fail)"
```

Αναμενόμενο: 7 `✔`, `ℹ pass 7`, `ℹ fail 0`.

---

### Εργασία 12: Η απόδειξη στο PGlite

**Files:**
- Create: `tms-auditor/test/rules-071a.test.mjs`

Τι αποδεικνύει: 17 περιπτώσεις (11 διεθνείς, 4 εθνικές και 2 «ίδιες πάντα») πάνω στους φρουρούς **όπως ζουν**. Κάθε περίπτωση συναντά την παλιά άρνηση. Μετά το **παραγόμενο** 071a περνά· εξαίρεση το πάγωμα τιμής (C8, N4) και δύο άσχετοι κανόνες (X1 `over_draw`, X2 `piece_executed`), που αρνούνται και τις δύο φορές. Μετά το **παραγόμενο** rollback ξαναβρίσκει την παλιά άρνηση. Αποδεικνύει επίσης ότι το dry run δεν κρατά τίποτα, και ότι το 071a αρνείται να τρέξει δεύτερη φορά, με ξένο κείμενο φρουρού ή με B-54 εκτός βήματος.

- [ ] **Βήμα 1: γράψε το test**

```js
// 071a (owner 21/10/2026, B0: every order - a stock lot too - is invoiced from its registration), proved on
// PGlite, the local Postgres the auditor already uses (no network, nothing reaches production).
// The three stock guards are created from 057's text, which IS the live text (md5-proven in
// tests/sql-071a-drafts.test.js). The fixture's stock_v_lots / stock_v_pieces are TABLES (DRAFT_057 in
// test/fixtures), so each case writes the rows the views would compute. Every case runs on 057's guards (it
// meets the old refusal), then after the GENERATED 071a file (it passes - except the lot PRICE freeze and two
// unrelated rules, which must refuse both times), then after the GENERATED rollback (the old refusal again).
// The dry run and 071a's own refusals run here too.
// Run: cd tms-auditor && npm install && node --test test/rules-071a.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createDb } from '../lib/db.mjs';
import { DRAFTS, SRC_057, TARGETS, LIVE_MD5, LIVE_B15_SQL, LIVE_B15_MD5, buildAll, md5 } from '../../worker/migrations/drafts/tools/build-071a.mjs';

const SRC = fs.readFileSync(SRC_057, 'utf8');
const { g, a } = buildAll();
const FILE = (k) => fs.readFileSync(path.join(DRAFTS, TARGETS[k]), 'utf8');
const FNS = Object.keys(LIVE_MD5);

// One `create function public.<name>(` statement of 057, up to and including its closing `$f$;`.
function fn057(name) {
  const at = SRC.indexOf(`  create function public.${name}(`);
  assert.ok(at >= 0, `057: ${name} not found`);
  const open = SRC.indexOf('$f$', at);
  const close = SRC.indexOf('$f$', open + 3);
  return SRC.slice(at, close + 4);
}
const TRIGGERS = SRC.split('\n').filter((l) => /^ {2}create trigger stock_guard_(lots|orders|natl) /.test(l)).join('\n');

// The fixture + 057's functions and triggers + the auditor rows as production holds them on 22/10 (the
// committed seed already carries 071a's S-03 / B-15, so they are put back to the live text first).
async function db057() {
  const db = await createDb({ roles: false });
  for (const fn of ['order_pallets', 'stock_natl_delivered', 'stock_raise', ...FNS]) await db.exec(fn057(fn));
  await db.exec(TRIGGERS);
  await db.query(`UPDATE monitoring.checks SET enabled = true, disabled_reason = NULL WHERE id = 'S-03'`);
  await db.query(`UPDATE monitoring.checks SET sql_text = $1 WHERE id = 'B-15'`, [LIVE_B15_SQL]);
  const { n } = (await db.query(`SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public'`)).rows[0];
  await db.query(`UPDATE monitoring.checks SET red_value = $1, baseline = NULL WHERE id = 'B-54'`, [n]);
  return db;
}
const srcMd5 = async (db, fn) => (await db.query(`SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = $1::regprocedure`, [`public.${fn}()`])).rows[0].m;
const check = async (db, id) => (await db.query(`SELECT enabled, disabled_reason, md5(sql_text) AS m FROM monitoring.checks WHERE id = $1`, [id])).rows[0];

// The refusal's code: the hint 'stock:<code>' (057's stock_raise); the Greek message as a fallback.
const MSG = [
  [/^(Η παρτίδα τιμολογήθηκε|Τιμολογημένη παραγγελία δεν γίνεται παρτίδα)/, 'lot_invoiced'],
  [/^Η παρτίδα δεν τιμολογείται ακόμη/, 'invoice_incomplete'],
  [/^Τιμολογημένη παρτίδα δεν ξανανοίγει/, 'reopen_invoiced'],
  [/^Υπέρβαση αποθέματος/, 'over_draw'],
  [/^Κομμάτι σε κίνηση ή παραδομένο δεν σβήνεται/, 'piece_executed'],
];
function codeOf(e) {
  if (e && typeof e.hint === 'string' && e.hint.startsWith('stock:')) return e.hint.slice(6);
  const hit = MSG.find(([re]) => re.test(String(e && e.message)));
  return hit ? hit[1] : 'ERROR ' + (e && e.message);
}
// setup runs with the triggers OFF (replica): it builds a state the guards may no longer let one write
// reach (e.g. an invoiced lot under 057). The action runs with the triggers ON. Nothing is kept.
async function attempt(db, setup, action) {
  await db.exec('BEGIN');
  try {
    await db.exec(`SET LOCAL session_replication_role = replica;\n${setup}\nSET LOCAL session_replication_role = origin;`);
    try { await db.exec(action); return 'OK'; } catch (e) { return codeOf(e); }
  } finally { await db.exec('ROLLBACK'); }
}

// ── fixture rows (ids 9xxx, legacy recT071a…; client 7 and truck 55 need no row: the fixture has no FKs) ──
const WH = `INSERT INTO locations (id, name) VALUES (9001, 'TEST 071a warehouse');`;
const SRC_O = (inv) => `INSERT INTO orders (id, legacy_id, status, client_id, unloading_location_1_id, loading_pallets_1, price, invoiced, invoice_number)
  VALUES (9101, 'recT071aSRC', 'Pending', 7, 9001, 33, 3300, ${inv}, ${inv ? "'T-071a'" : 'NULL'});`;
const LOT = `INSERT INTO stock_lots (id, legacy_id, order_id) VALUES (9301, 'recT071aLOT', 9101);`;
const VLOT = (inv) => `INSERT INTO stock_v_lots (id, order_id, client_id, warehouse_location_id, invoiced, stock_pallets, intake_status, intake_delivered, pieces, pieces_delivered, complete)
  VALUES (9301, 9101, 7, 9001, ${inv}, 33, 'Pending', false, 0, 0, false);`;
const PIECE = (status, truck) => `INSERT INTO orders (id, legacy_id, status, client_id, loading_location_1_id, loading_pallets_1, stock_lot_id, truck_id)
  VALUES (9201, 'recT071aP1', '${status}', 7, 9001, 5, 9301, ${truck ? 55 : 'NULL'});
  INSERT INTO stock_v_pieces (lot_id, piece_kind, piece_id, pallets, status, delivered, on_truck) VALUES (9301, 'intl', 9201, 5, '${status}', ${status === 'Delivered'}, ${!!truck});`;
const DRAW = `INSERT INTO orders (id, legacy_id, status, client_id, loading_location_1_id, loading_pallets_1, stock_lot_id)
  VALUES (9202, 'recT071aP2', 'Pending', 7, 9001, 5, 9301);`;
const CLOSED = `UPDATE stock_lots SET closed_note = 'TEST', closed_at = now() WHERE id = 9301;
  UPDATE stock_v_lots SET closed_note = 'TEST', closed_at = now(), intake_delivered = true WHERE id = 9301;`;
const NSRC = (inv) => `INSERT INTO national_orders (id, legacy_id, client_id, delivery_location_1_id, pallets, price, delivery_datetime, invoiced, invoice_number)
  VALUES (9401, 'recT071aNSRC', 7, 9001, 33, 500, current_date + 40, ${inv}, ${inv ? "'T-071a'" : 'NULL'});`;
const NLOT = `INSERT INTO stock_lots (id, legacy_id, nat_order_id) VALUES (9302, 'recT071aNLOT', 9401);`;
const NVLOT = (inv) => `INSERT INTO stock_v_lots (id, nat_order_id, client_id, warehouse_location_id, invoiced, stock_pallets, intake_delivered, pieces, pieces_delivered, complete)
  VALUES (9302, 9401, 7, 9001, ${inv}, 33, false, 0, 0, false);`;
const NDRAW = `INSERT INTO national_orders (id, legacy_id, client_id, pickup_location_1_id, pallets, delivery_datetime, stock_lot_id)
  VALUES (9402, 'recT071aNP1', 7, 9001, 5, current_date + 45, 9302);`;
const INV_LOT = WH + SRC_O(true) + LOT + VLOT(true);

// [name, setup, action, on 057's guards, after 071a]
const CASES = [
  ['C1 an invoiced order is marked as a lot', WH + SRC_O(true), LOT, 'lot_invoiced', 'OK'],
  ['C2 a lot is invoiced before its pieces arrive', WH + SRC_O(false) + LOT + VLOT(false),
    `UPDATE orders SET invoiced = true, invoice_number = 'T-071a' WHERE id = 9101;`, 'invoice_incomplete', 'OK'],
  ['C3 an invoiced lot gives a piece', INV_LOT, DRAW, 'lot_invoiced', 'OK'],
  ['C4 a piece of an invoiced lot is delivered', INV_LOT + PIECE('In Transit', true), `UPDATE orders SET status = 'Delivered' WHERE id = 9201;`, 'lot_invoiced', 'OK'],
  ['C5 a delivered piece of an invoiced lot steps back', INV_LOT + PIECE('Delivered', true), `UPDATE orders SET status = 'In Transit' WHERE id = 9201;`, 'lot_invoiced', 'OK'],
  ['C6 a loose piece of an invoiced lot is deleted', INV_LOT + PIECE('Pending', false), `UPDATE orders SET deleted_at = now() WHERE id = 9201;`, 'lot_invoiced', 'OK'],
  ['C7 an invoiced lot is received in the warehouse', INV_LOT, `UPDATE orders SET status = 'Delivered' WHERE id = 9101;`, 'lot_invoiced', 'OK'],
  ['C8 KEPT: an invoiced lot changes its price', INV_LOT, `UPDATE orders SET price = 3400 WHERE id = 9101;`, 'lot_invoiced', 'lot_invoiced'],
  ['C9 an invoiced closed lot is reopened', INV_LOT + CLOSED, `UPDATE stock_lots SET closed_note = NULL WHERE id = 9301;`, 'reopen_invoiced', 'OK'],
  ['C10 the close note of an invoiced lot is corrected', INV_LOT + CLOSED, `UPDATE stock_lots SET closed_note = 'TEST 2' WHERE id = 9301;`, 'lot_invoiced', 'OK'],
  ['C11 an invoiced lot with no pieces is unmarked', INV_LOT, `UPDATE stock_lots SET deleted_at = now() WHERE id = 9301;`, 'lot_invoiced', 'OK'],
  ['N1 an invoiced national order is marked as a lot', WH + NSRC(true), NLOT, 'lot_invoiced', 'OK'],
  ['N2 a national lot is invoiced before its pieces', WH + NSRC(false) + NLOT + NVLOT(false),
    `UPDATE national_orders SET invoiced = true, invoice_number = 'T-071a' WHERE id = 9401;`, 'invoice_incomplete', 'OK'],
  ['N3 an invoiced national lot gives a piece', WH + NSRC(true) + NLOT + NVLOT(true), NDRAW, 'lot_invoiced', 'OK'],
  ['N4 KEPT: an invoiced national lot changes its price', WH + NSRC(true) + NLOT + NVLOT(true),
    `UPDATE national_orders SET price = 600 WHERE id = 9401;`, 'lot_invoiced', 'lot_invoiced'],
  ['X1 UNCHANGED: a draw above the stock', WH + SRC_O(false) + LOT + VLOT(false)
    + `INSERT INTO stock_v_pieces (lot_id, piece_kind, piece_id, pallets) VALUES (9301, 'intl', 9999, 30);`, DRAW, 'over_draw', 'over_draw'],
  ['X2 UNCHANGED: a delivered piece is not deleted', WH + SRC_O(false) + LOT + VLOT(false) + PIECE('Delivered', true),
    `UPDATE orders SET deleted_at = now() WHERE id = 9201;`, 'piece_executed', 'piece_executed'],
];

test('on 057\'s guards (production today) every case meets its old refusal', async () => {
  const db = await db057();
  for (const fn of FNS) assert.strictEqual(await srcMd5(db, fn), LIVE_MD5[fn], `${fn} = the live text`);
  for (const [name, setup, action, before] of CASES) assert.strictEqual(await attempt(db, setup, action), before, name);
});

test('after the generated 071a: invoicing from registration passes; the price freeze and the other rules still refuse', async () => {
  const db = await db057();
  await db.exec(FILE('apply'));
  for (const fn of FNS) assert.strictEqual(await srcMd5(db, fn), md5(g[fn].next), fn);
  for (const [name, setup, action, , after] of CASES) assert.strictEqual(await attempt(db, setup, action), after, name);
  const s03 = await check(db, 'S-03'), b15 = await check(db, 'B-15');
  assert.deepStrictEqual([s03.enabled, s03.disabled_reason], [false, a.s03Reason], 'S-03 off, with its reason');
  assert.strictEqual(b15.m, md5(a.b15Sql), 'B-15 = tms-auditor/checks/B-15.sql');
  await assert.rejects(db.exec(FILE('apply')), /already holds the 071a text/, 'a second run refuses');
});

test('the dry run ends in its deliberate error and keeps nothing', async () => {
  const db = await db057();
  await assert.rejects(db.exec(FILE('dryrun')), /DRY RUN 071a finished - EVERYTHING UNDONE, nothing kept/);
  for (const fn of FNS) assert.strictEqual(await srcMd5(db, fn), LIVE_MD5[fn], fn);
  assert.strictEqual((await check(db, 'S-03')).enabled, true);
  assert.strictEqual((await check(db, 'B-15')).m, LIVE_B15_MD5);
});

test('071a refuses a guard that is not 057\'s text, and a B-54 out of step', async () => {
  const db = await db057();
  await db.exec(`CREATE OR REPLACE FUNCTION public.stock_guard_natl() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $f$ begin return new; end $f$;`);
  await assert.rejects(db.exec(FILE('apply')), /stock_guard_natl is not the 057 text read 22\/10/);
  const db2 = await db057();
  await db2.query(`UPDATE monitoring.checks SET red_value = red_value + 1 WHERE id = 'B-54'`);
  await assert.rejects(db2.exec(FILE('apply')), /B-54 red_value is not the live trigger count/);
});

test('the rollback gives 057\'s guards back byte for byte, and the old refusals with them', async () => {
  const db = await db057();
  await db.exec(FILE('apply'));
  await db.exec(FILE('rollback'));
  for (const fn of FNS) assert.strictEqual(await srcMd5(db, fn), LIVE_MD5[fn], fn);
  assert.strictEqual((await check(db, 'S-03')).enabled, true);
  assert.strictEqual((await check(db, 'B-15')).m, LIVE_B15_MD5);
  for (const [name, setup, action, before] of CASES) assert.strictEqual(await attempt(db, setup, action), before, `${name} (after the rollback)`);
  await assert.rejects(db.exec(FILE('rollback')), /is not the 071a text/, 'a second rollback refuses');
});
```

- [ ] **Βήμα 2: εγκατάσταση PGlite** (devDependency του `tms-auditor/package.json`, `@electric-sql/pglite@0.5.8`· το `node_modules` είναι στο `.gitignore`)

```bash
cd tms-auditor && npm install --no-audit --no-fund && cd ..
```

- [ ] **Βήμα 3: τρέξε το νέο test και όλο το `tms-auditor`**

```bash
cd tms-auditor && node --test test/rules-071a.test.mjs 2>&1 | grep -E "^(✔|✖)|^ℹ (pass|fail)"; node --test test/*.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"; cd ..
```

Αναμενόμενο: 5 `✔`, `ℹ pass 5`, `ℹ fail 0`. Στο σύνολο, `ℹ fail 0`: το `catalog.test.mjs` επιβεβαιώνει ότι το seed της εργασίας 8 ταιριάζει με τα αρχεία.

**Αν αποτύχει περίπτωση «on 057's guards»:** το fixture δεν φτιάχνει την κατάσταση που νομίζουμε. Διόρθωσε το **fixture**, ποτέ την προσδοκία. **Αν αποτύχει «after the generated 071a»:** το 071a έχει λάθος. Διόρθωσε το SUBS στον builder και ξανατρέξε τις εργασίες 9–12.

**Αυτή η εργασία δεν έτρεξε κατά τη σύνταξη του πλάνου** (το PGlite δεν ήταν εγκατεστημένο). Οι εργασίες 9, 10 και 11 έτρεξαν σε αντίγραφο, και το verify έτρεξε στην παραγωγή.

---

### Εργασία 13: Commit της βάσης

- [ ] **Βήμα 1: όλα τα tests μαζί**

```bash
TZ=Europe/Athens node --test tests/*.test.js tests/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"
node worker/migrations/drafts/tools/build-071a.mjs --check
```

Αναμενόμενο: `ℹ tests 699`, `ℹ pass 699`, `ℹ fail 0` (692 + 7)· το `--check` χωρίς `DRIFT`.

- [ ] **Βήμα 2: commit**

```bash
git add worker/migrations/drafts/tools/build-071a.mjs worker/migrations/drafts/071a_invoice_from_registration.sql \
  worker/migrations/drafts/071a_invoice_from_registration_dryrun.sql worker/migrations/drafts/071a_invoice_from_registration_rollback.sql \
  worker/migrations/drafts/071a_invoice_from_registration_verify.sql worker/migrations/drafts/047b_monitoring_seed.sql \
  tms-auditor/checks/S-03.sql tms-auditor/checks/B-15.sql tests/sql-071a-drafts.test.js tms-auditor/test/rules-071a.test.mjs
git commit -m "$(cat <<'EOF'
071a draft: the stock guards of 057 stop treating «invoiced» as «the lot is finished»

Owner 21/10/2026 (B0): a lot is invoiced from its registration, so the invoice
now comes FIRST. 057 refused, after an invoice, every draw, piece delete, piece
or intake status change, mark, unmark, reopen and close-note edit, and refused
the invoice itself until everything arrived (invoice_incomplete). All of these
go; the lot PRICE freeze stays (the invoice states it). Built from the live
text (prosrc md5 = 057's text, read 22/10) by tools/build-071a.mjs with
md5-guarded substitutions; the rollback carries 057's text back whole.
Auditor: S-03 disabled with its reason, B-15 counts a lot from its own
delivery like OrdersData.ageOf. Proven on PGlite (17 cases before / after /
after rollback). NOT EXECUTED: owner, after 15:00, explicit yes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Εργασία 14: Ίχνος session, code review, push, PR

**Files:**
- Create: `docs/sessions/2026-10-22-dimitris-invoice-from-registration.md`

- [ ] **Βήμα 1: το αρχείο session** (έως 5 κουκκίδες)

```markdown
# 2026-10-22 · dimitris · Τιμολόγηση από την καταχώρηση (Β0)

- Άλλαξε (front, PR fix/invoice-from-registration): «Προς τιμολόγηση»/«Χωρίς τιμή»/badges = κάθε μη ακυρωμένη παραγγελία από την καταχώρηση· η παρτίδα όπως κάθε παραγγελία· δελτίο παλετών μόνο μετά την παράδοση· καμία προειδοποίηση «πριν την παράδοση». Pre-orders μέσα (owner 22/10).
- Βάση (draft, ΔΕΝ εκτελέστηκε): 071a ξαναγράφει τους 3 φρουρούς του 057 από το ζωντανό κείμενο· μένει μόνο το πάγωμα τιμής· S-03 off, B-15 από την παράδοση. Απόδειξη PGlite 17 περιπτώσεις.
- Σειρά (owner, μετά τις 15:00, ρητό «ναι»): verify → dry run → 071a → verify → merge PR → μέτρηση λίστας vs SELECT (πλάνο, εργασία 15).
- Αποφασίστηκε (owner 22/10): Α 071a σε όλα τα 14 σημεία, μένει μόνο το πάγωμα τιμής· Β pre-orders μέσα· Γ S-03 απενεργοποιημένο με αιτία, B-15 από την παράδοση.
- Μένει: dashboards (metrics.revenueReadyToInvoice/overdueInvoices, CEO «αδρανούν») μένουν «παραδομένα»· νεκρά κλειδιά stock/sheets στο orders_week_view· τίτλος B-16 «μπλοκαρισμένες»· `/pallets/override` στον Worker.
```

- [ ] **Βήμα 2: commit**

```bash
git add docs/sessions/2026-10-22-dimitris-invoice-from-registration.md
git commit -m "$(cat <<'EOF'
Session record: invoicing from registration (B0), front + 071a draft

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Βήμα 3: code review** (κανόνας owner 20/10: βάση/χρήματα → `xhigh`)

Τρέξε `/code-review xhigh` πάνω στο diff `origin/main...HEAD`. Κάθε εύρημα διορθώνεται, ή καταγράφεται στο PR με αιτία. Μετά από διόρθωση ξανατρέχουν οι εργασίες 5 (βήμα 4), 11 και 12 (βήμα 3).

- [ ] **Βήμα 4: push του branch και PR** (ποτέ `main`)

```bash
git fetch origin && git log --oneline HEAD..origin/main -- core modules tests tms-auditor worker/migrations app.html sw.js
```

Αν βγάλει commits: `git merge origin/main`, ξανά οι εργασίες 5 (βήμα 4), 7 (βήμα 1, με νέο TS αν άλλαξαν τα ίδια αρχεία), 11 και 13 (βήμα 1), και μετά:

```bash
git push -u origin fix/invoice-from-registration
gh pr create --title "Β0: τιμολόγηση από την καταχώρηση (front + draft 071a)" --body "$(cat <<'EOF'
## Τι
Owner 21/10/2026 (spec national-v5 «Χρήματα», §6 Β0): κάθε παραγγελία — διεθνής, εθνική, και η παρτίδα αποθήκης — είναι «προς κοπή» μόλις καταχωρηθεί. Μόνο η τιμή > 0 μπλοκάρει.

## Πώς
- Front: `OrdersData` (σύνολο, stateOf, ageOf, δελτίο μόνο μετά την παράδοση) + κάρτα «Προς τιμολόγηση», «Χωρίς τιμή», σήμανση παρτίδας.
- Βάση: draft `071a` (ΔΕΝ εκτελέστηκε) — οι 3 φρουροί του 057 χωρίς το «τιμολογήθηκε = τελείωσε»· μένει το πάγωμα τιμής. S-03 off, B-15 από την παράδοση.

## ΣΕΙΡΑ (owner, μετά τις 15:00, ρητό «ναι»)
1. `071a_invoice_from_registration_verify.sql` → όλα «before»
2. `071a_invoice_from_registration_dryrun.sql` → σκόπιμο ERROR «DRY RUN 071a finished - EVERYTHING UNDONE»
3. `071a_invoice_from_registration.sql` → «071a OK | 3 | false | 8e4f22fd…»
4. verify → όλα «after»
5. **Μετά** merge αυτού του PR (ποτέ πριν: η οθόνη θα πρόσφερε τιμολόγηση παρτίδας που η βάση αρνείται)

## Αποδείξεις
- node 699/699 (8 νέα για τον κανόνα, 7 για τα drafts· 2 σβήστηκαν μαζί με την πύλη που έλεγχαν)
- PGlite `tms-auditor/test/rules-071a.test.mjs`: 17 περιπτώσεις πριν / μετά / μετά το rollback
- Rigs: invoicing 79/80, stock 323/324 (η ίδια προϋπάρχουσα αποτυχία το καθένα), noprice 74/74, week 74/74
- Verify στην παραγωγή 22/10: όλα «before»

## Αποφάσεις owner που περιέχει
Κλειστές, owner 22/10: Α. 071a σε όλα τα 14 σημεία, μένει μόνο το πάγωμα τιμής · Β. pre-orders μέσα · Γ. S-03 off / B-15 από την παράδοση

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Αν το push απορριφθεί ως «protected branch»: **σταμάτα και πες το**.

---

### Εργασία 15: Το βράδυ του owner. Πρώτα η βάση, μετά το merge, μετά μέτρηση μέχρι τον πίνακα

Το τρέχει ο owner, **μετά τις 15:00**, με **ρητό «ναι» στη συνομιλία**. Ο agent ετοιμάζει, δεν εκτελεί εγγραφή.

- [ ] **Βήμα 1: «πριν» στην οθόνη και στον πίνακα** (πριν από οτιδήποτε άλλο)

Στην εφαρμογή, ως owner: Παραγγελίες → «Προς τιμολόγηση» → «Όλες οι ανοιχτές», εμβέλεια «Όλες». Σημείωσε το «Προς κοπή · N» και το «Μπλοκαρισμένες · M», το badge του hub, και το «Χωρίς τιμή · K». Στην κονσόλα του browser (μόνο ανάγνωση):

```js
const s = await OrdersData.loadInvoicingSet(true);
const c = { intl: { ready: 0, no_price: 0 }, natl: { ready: 0, no_price: 0 } };
for (const r of OrdersData.all(s)) { const k = OrdersData.stateOf(s, r); if (k.key === 'ready') c[r._type].ready++; else if (k.key === 'blocked' && k.reason === 'price') c[r._type].no_price++; }
JSON.stringify(c);
```

Και στον πίνακα, το ίδιο λεπτό. Ο **παλιός** κανόνας: παραδομένες διεθνείς, και εθνικές με περασμένη ημερομηνία:

```sql
SELECT 'intl' AS t, count(*) FILTER (WHERE coalesce(price,0) > 0) AS ready, count(*) FILTER (WHERE NOT coalesce(price,0) > 0) AS no_price
  FROM orders WHERE deleted_at IS NULL AND stock_lot_id IS NULL AND parent_order_id IS NULL AND invoiced IS NOT TRUE AND status = 'Delivered'
UNION ALL
SELECT 'natl', count(*) FILTER (WHERE coalesce(price,0) > 0), count(*) FILTER (WHERE NOT coalesce(price,0) > 0)
  FROM national_orders WHERE deleted_at IS NULL AND stock_lot_id IS NULL AND invoiced IS NOT TRUE
   AND status IS DISTINCT FROM 'Cancelled' AND delivery_datetime < current_date;
```

Αναμενόμενο «πριν»: κονσόλα = SELECT. Εξαίρεση οι παρτίδες που περιμένουν κομμάτια, που η κονσόλα τις μετρά «blocked/stock»: διαφορά ≤ 1 στο `ready`, γιατί στις 22/10 μόνο 1 παρτίδα ήταν παραδομένη στην αποθήκη. Οθόνη «Προς κοπή» = `intl.ready + natl.ready` της κονσόλας. Στις 22/10: SELECT intl 19 / 22, natl 1 / 0.

- [ ] **Βήμα 2: η βάση** (owner, SQL editor, με αυτή τη σειρά. Κάθε αρχείο επικολλάται **μέσα στη συνομιλία**, όχι μέσω του πρόχειρου)
  1. `071a_invoice_from_registration_verify.sql` → όλα `before`, `ok 3`, `ok`, `ok 37`.
  2. `071a_invoice_from_registration_dryrun.sql` → NOTICE `071a OK: …` και **σκόπιμο** `ERROR: P0001: DRY RUN 071a finished - EVERYTHING UNDONE, nothing kept  ||  lots 231b539e429f5d404d0eaa46618d79c5 orders 63aa751d93cc8b34afa5587912de7045 natl e941edbca9ff1bbeba0c89d49eb71cb3 S-03 false B-15 8e4f22fd86852cf10e2e00b48e1bd2ee`. Οποιοδήποτε άλλο ERROR: **μην** τρέξεις το 071a.
  3. `071a_invoice_from_registration.sql` → NOTICE `071a OK: …` και η γραμμή `071a OK | 3 | false | 8e4f22fd86852cf10e2e00b48e1bd2ee`.
  4. Verify → όλα `after`, `ok 3`, `ok`, `ok 37`, `2 / 0 / 2`.

- [ ] **Βήμα 3: merge του PR** (Δημήτρης), και 1–3 λεπτά για το GitHub Pages. Σε όλα τα ανοιχτά tabs: ανανέωση· ο service worker φέρνει το νέο `SW_VERSION`.

- [ ] **Βήμα 4: «μετά», μέχρι τον πίνακα**

Ξανά η κονσόλα του βήματος 1, και στον πίνακα ο **νέος** κανόνας:

```sql
SELECT 'intl' AS t, count(*) FILTER (WHERE coalesce(price,0) > 0) AS ready, count(*) FILTER (WHERE NOT coalesce(price,0) > 0) AS no_price
  FROM orders WHERE deleted_at IS NULL AND stock_lot_id IS NULL AND parent_order_id IS NULL AND invoiced IS NOT TRUE
   AND status IS DISTINCT FROM 'Cancelled'
UNION ALL
SELECT 'natl', count(*) FILTER (WHERE coalesce(price,0) > 0), count(*) FILTER (WHERE NOT coalesce(price,0) > 0)
  FROM national_orders WHERE deleted_at IS NULL AND stock_lot_id IS NULL AND invoiced IS NOT TRUE
   AND status IS DISTINCT FROM 'Cancelled';
```

Αναμενόμενο «μετά», **ακριβώς ίσα**: κονσόλα `intl.ready` = SELECT `intl.ready`, κονσόλα `intl.no_price` = SELECT `intl.no_price`, και το ίδιο για τις εθνικές. Οθόνη «Προς κοπή · N» = `intl.ready + natl.ready`, «Μπλοκαρισμένες · M» = `intl.no_price + natl.no_price` = «Χωρίς τιμή · K»· badge hub (accountant) = N. Στις 22/10 ο νέος κανόνας έδινε intl 47 / 30, natl 1 / 0. Οποιαδήποτε διαφορά: **ανάφερε τις ids** και μην προχωρήσεις στην επόμενη δουλειά.

- [ ] **Βήμα 5: μία κάρτα με το μάτι** (owner): μια διεθνής «Assigned» με ημερομηνία παράδοσης στο μέλλον. Πρέπει να δείχνει στην κεφαλίδα «Παράδοση dd/mm» (κενός κύκλος) και «προς κοπή», στους ΕΛΕΓΧΟΥΣ «– Παράδοση dd/mm · δεν έχει γίνει ακόμη», και το πεδίο ΤΠΥ. **Μην καταχωρήσεις τιμολόγιο ως δοκιμή.** Η πρώτη πραγματική καταχώρηση της Ειρήνης ελέγχεται με:

```sql
SELECT legacy_id, status, invoiced, invoice_number, invoice_date, price FROM orders
 WHERE deleted_at IS NULL AND invoiced AND invoice_date >= current_date - 1 AND status IS DISTINCT FROM 'Delivered';
```

Αναμενόμενο: η γραμμή υπάρχει, με `invoiced = true`, αριθμό και τιμή, ενώ δεν είναι παραδομένη. Στις 22/10 το ερώτημα γύρισε 0 γραμμές, όπως έπρεπε· η στήλη `updated_at` δεν υπάρχει στο `orders`, γι' αυτό το φίλτρο είναι στο `invoice_date`.

---

### Εργασία 16 (μόνο αν χρειαστεί): Επαναφορά

- [ ] **Βήμα 1:** revert του PR στο `main` (νέο PR revert, με bump `SW_VERSION`, merge από τον Δημήτρη). **Πρώτα το front**, ώστε η οθόνη να μην προσφέρει ό,τι θα αρνηθεί η βάση.
- [ ] **Βήμα 2:** owner, μετά τις 15:00, ρητό «ναι»: `071a_invoice_from_registration_rollback.sql` → NOTICE `071a ROLLBACK OK: …`, και μετά verify → όλα `before`.
- [ ] **Βήμα 3:** όσες παρτίδες τιμολογήθηκαν όσο ζούσε το 071a και δεν είναι πλήρεις κάνουν το S-03 κόκκινο στον επόμενο ωριαίο έλεγχο. Με τον παλιό κανόνα αυτό **είναι** εύρημα, όχι βλάβη. Τα κομμάτια τους δεν κινούνται μέχρι να αναιρεθεί το τιμολόγιο (owner).

---

## Τι θα δει διαφορετικά το λογιστήριο (για να το πει ο owner στην Αλεξία και στην Ειρήνη)

1. **«Προς τιμολόγηση» = κάθε παραγγελία με τιμή, από τη στιγμή που καταχωρείται**, όχι μόνο οι παραδομένες. Στις 22/10 οι διεθνείς «προς κοπή» θα ήταν 47 αντί για 19. Το badge του hub μεγαλώνει ανάλογα.
2. **Η κάρτα λέει πού βρίσκεται η παράδοση:** «Παράδοση 25/10» με κενό κύκλο αν δεν έχει γίνει, «Παραδόθηκε 25/10» αν έγινε. Στους ΕΛΕΓΧΟΥΣ το «δεν έχει γίνει ακόμη» είναι ουδέτερο (–), όχι κόκκινο. Η τιμολόγηση πριν από την παράδοση είναι κανονική.
3. **Καμία προειδοποίηση «πριν την παράδοση — σίγουρα;»** στην ημερομηνία ΤΠΥ. Μένει μόνο το «όχι μελλοντική ημερομηνία».
4. **Δελτίο παλετών:** το κόκκινο «δελτίο → Αλεξία» εμφανίζεται **μόνο μετά την παράδοση**. Πριν από αυτήν, «Δελτία παλετών · μετά την παράδοση». Το δελτίο δεν μπλοκάρει, όπως ισχύει από 20/10.
5. **Παρτίδες αποθήκης:** τιμολογούνται μία φορά, από την καταχώρηση, όπως κάθε παραγγελία. Το «περιμένει κομμάτια» δεν μπλοκάρει πια· η πρόοδος των κομματιών φαίνεται ως πληροφορία («Περιμένει κομμάτια 1/2»). Το «Κλείσιμο υπολοίπου…» είναι στους ΕΛΕΓΧΟΥΣ της κάρτας, και η παρτίδα μπορεί να ξανανοίξει ακόμη κι αν τιμολογήθηκε (owner/dispatcher). **Η τιμή μιας τιμολογημένης παρτίδας παραμένει κλειδωμένη.**
6. **«Χωρίς τιμή» μεγαλώνει:** μπαίνουν και οι μη παραδομένες και οι pre-orders χωρίς τιμή (στις 22/10: 30 αντί για 22, από τις οποίες 4 pre-orders). Οι τιμές μπορούν να γραφτούν νωρίτερα.
7. **Ημέρες / «Παλαιότερη εκκρεμής» / «καθυστέρηση > 30»:** μετρούν από την παράδοση. Πριν από την παράδοση η στήλη δείχνει «—». Μια παρτίδα μετρά από την παραλαβή της στην αποθήκη, όχι από το τελευταίο κομμάτι.
8. **Pre-orders (Παντελής, «Provisional») εμφανίζονται κι αυτές** (owner 22/10): με τιμή είναι «προς κοπή», χωρίς τιμή είναι στο «Χωρίς τιμή». Το δελτίο παλετών και η ηλικία ακολουθούν την παράδοση, όπως σε κάθε παραγγελία.
9. **«Εβδομάδα»:** όταν ένα RT έχει μη παραδομένες παραγγελίες με τιμή, η στήλη τιμολόγησης γράφει «προς κοπή» αντί για «σε εξέλιξη».
10. Ο υπότιτλος της σελίδας γράφει «Ανά πελάτη, από την καταχώρηση» αντί για «Παραδομένες ανά πελάτη».

## Εκτός πλάνου (ερωτήσεις για τον owner, χωρίς αλλαγή εδώ)

- **Dashboards:** το `core/metrics.js` `revenueReadyToInvoice` (με παλιό έλεγχο δελτίων και εκτός παρτίδων) και το `overdueInvoices`, καθώς και το CEO «αδρανούν σε παραδοθέντα», μένουν «παραδομένα». Είναι άλλο μέτρο (παραδόθηκε και δεν τιμολογήθηκε = ρίσκο ταμείου), αλλά το σχόλιο του `metrics.js:58-63` («a LOT … is invoiced once, only when COMPLETE») γίνεται ψευδές. Να αποφασιστεί αν ευθυγραμμίζεται.
- **`orders_week_view.js`:** τα κλειδιά `stock` (και `sheets`, από 20/10) στα `REASON`/`REASON_ORDER`/`totals` δεν παράγονται πια από το `stateOf`, και από 22/10 ούτε το `pending` («σε εξέλιξη», `rtInvoicing` / `weekStatus` / `stLabel`). Είναι νεκρά· αφαίρεση σε επόμενο PR μαζί με τα tests τους.
- **B-16** («Πύλη παλετών: παραδομένες μπλοκαρισμένες», ουρά): μετρά σωστά τις παραδομένες χωρίς δελτίο, αλλά ο τίτλος λέει «μπλοκαρισμένες». Αλλαγή τίτλου σε επόμενο seed.
- **Worker:** το `/pallets/override` είναι νεκρό από 20/10 (session 20/10), και αφαιρείται στο επόμενο deploy της αλυσίδας Worker.
- **Rigs, προϋπάρχουσες αποτυχίες:** «CSV header = the 12 ERP columns» (invoicing) και «C2-02 … χωρίς τιμή → owner» (stock). Υπήρχαν ήδη στο `62d09f9d`, δεν τις αγγίζει αυτό το PR.

## Αν σπάσει, πώς θα το μάθουμε

- **Ο κανόνας τιμολόγησης** ζει σε ένα σημείο (`OrdersData`), και τα 8 tests της εργασίας 1 τον κρατούν. Η εργασία 15 μετρά οθόνη = κονσόλα = SELECT.
- **Οι φρουροί:** το S-02 (P1, κάθε ώρα) φωνάζει αν κλείσει trigger. Το verify δείχνει `UNKNOWN` αν κάποιος αλλάξει το κείμενο. Τα B-11 και B-12 (P1) πιάνουν τιμολογημένη χωρίς ΤΠΥ ή χωρίς τιμή. Το S-03 είναι απενεργοποιημένο **με αιτία**, οπότε ο ελεγκτής το αναφέρει ως GAP, όχι ως πράσινο.
- **Το πάγωμα τιμής παρτίδας** μένει στη βάση (C8/N4 στο PGlite), και η άρνηση φτάνει στην οθόνη ως 422 με ελληνικό μήνυμα.
