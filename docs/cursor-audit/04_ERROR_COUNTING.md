# ΛΑΘΟΣ ΜΕΤΡΗΣΗ ΣΦΑΛΜΑΤΩΝ — άλλες περιπτώσεις του τύπου WP-5

Το WP-5 περιγράφει έναν μετρητή που αυξάνεται και σε αποτυχία **ανάγνωσης**.
Το ίδιο σχήμα υπάρχει σε τέσσερις ακόμη συναρτήσεις, και σε **όλες** ο μετρητής
αυξάνεται από ερώτημα που αποτυγχάνει **μόνιμα** (τα 422 του
`02_FILTERS_422.md`), όχι σποραδικά.

## Η δομή που το προκαλεί

```js
try {                                          // εξωτερικό try = ΑΝΑΓΝΩΣΗ
  const cls = await atGetAll(TABLES.CONS_LOADS, {
    filterByFormula: `FIND("${gl.id}",ARRAYJOIN({Groupage Lines},","))>0`,   // → 422 ΠΑΝΤΑ
  }, false);
  for (const cl of cls) { … await atDelete(…) … }
} catch(e) { _delFail++; }                     // μετρά «απέτυχε διαγραφή»
```

Το `atGetAll` σκάει πριν προλάβει να επιχειρηθεί οποιαδήποτε διαγραφή. Ο
μετρητής λέει «N linked records failed», ενώ **δεν επιχειρήθηκε κανένα** — και,
χειρότερα, τα CL/NL που έπρεπε να σβηστούν μένουν.

## Τα σημεία

| Συνάρτηση | Ανάγνωση που σκάει | `catch` που μετρά | Μήνυμα προς τον χρήστη |
|---|---|---|---|
| `deleteIntlOrder` — `modules/orders_intl.js:2551` | `:2580` (`{Groupage Lines}`) και `:2600` (`{Order}` σε RAMP) | `:2591`, `:2606` | `:2644` «Order deleted (N linked records failed — δες error log)» |
| `deleteNatlOrder` — `modules/orders_natl.js:1464` | `:1493` (`{Groupage Lines}`), `:1518` (`{National Order}` σε RAMP), `:1540` (`{Nat Load}` σε PA) | `:1507`, `:1524`, `:1546` | `:1557` «Order deleted (N linked records failed — check data)» |
| `cleanupOrphanGL` — `modules/orders_intl.js:2665` | `:2709` | `:2722` | `:2732-2735` |
| `cleanupOrphans` — `modules/orders_intl.js:2751` | `:2822` | `:2830` | `:2854-2857` |

## Ένα μήνυμα που είναι αριθμητικά λάθος

Στο `cleanupOrphanGL` ο μετρητής αυξάνεται **μία φορά ανά orphan** (`:2722`),
επειδή το ερώτημα CL σκάει σε κάθε επανάληψη. Το ίδιο το GL, όμως, σβήνεται
κανονικά στο `:2724`. Το μήνυμα στο `:2733` είναι:

```js
`Καθαρίστηκαν ${orphans.length - _delFail} orphans (${_delFail} failed …)`
```

Με 5 orphans: `_delFail === 5` → **«Καθαρίστηκαν 0 orphans (5 failed)»**, ενώ
και τα 5 GL έχουν σβηστεί. Ο χρήστης θα το ξανατρέξει· τη δεύτερη φορά δεν θα
βρει τίποτα και θα υποθέσει ότι κάτι διορθώθηκε μόνο του.

## Καταπινόμενα σφάλματα με ψευδή επιβεβαίωση (ίδια οικογένεια)

| Σημείο | Τι καταπίνεται | Τι λέει η οθόνη |
|---|---|---|
| `modules/orders_intl.js:1569` | 422 στη διαγραφή CL κατά το auto-restore | `:1575` toast **«Το φορτίο διαλύθηκε — συνεχίζει η αποθήκευση…»** — ενώ το CL ζει και τα GL του έγιναν `Unassigned` |
| `modules/orders_natl.js:1105` | 400 «Unknown linked record» από το `_syncNationalLoad` (εύρημα A-6) | `:1117` toast «Order created/updated ✓» — αν και ο χρήστης έχει δει και ένα κόκκινο toast από το `core/api.js:274` |
| `core/order-sync.js:127`, `:156`, `:169` | 422 και σφάλματα patch στην αλυσίδα GL→CL→NL | τίποτα· η αποθήκευση της παραγγελίας δηλώνεται επιτυχής |
| `modules/orders_intl.js:941` | 422 στη διαγραφή RAMP όταν σβήνει το Veroia Switch | τίποτα |
| `core/scan-helpers.js:361` | κάθε αποτυχία γραφής παραδείγματος scan | τίποτα (και ούτε καν στέλνεται, A-8) |
| `core/metrics.js:503`, `:534`, `:552` | 404 του METRICS_SNAPSHOTS | τίποτα (αδρανές) |
| `core/stops-helpers.js:95-97` | **403 Forbidden** στη διαγραφή στάσης: το RBAC δεν δίνει DELETE στα `order_stops` σε κανέναν ρόλο πλην `owner` (`worker/src/index.js:451`, με ρητό σχόλιο `:448-449`). Το `atDelete` πετάει (`core/api.js:548-553`) και εδώ πιάνεται με `console.error` | Η αποθήκευση της παραγγελίας δηλώνεται επιτυχής και η φόρμα δείχνει τη στάση αφαιρεμένη· ο χρήστης βλέπει ένα κόκκινο «Delete failed» χωρίς σύνδεση με τη στάση. Η στάση παραμένει στη βάση. Ίδιο και στις cascade (`modules/orders_intl.js:2615`, `modules/orders_natl.js:1532`), όπου το 403 τροφοδοτεί το `_delFail` |

## Δύο σημεία που τα κάνουν ΣΩΣΤΑ (χρήσιμα ως πρότυπο)

- `modules/daily_ramp.js:298-307`: μετρά **μόνο** αποτυχίες `atCreate`, στέλνει
  στο `logError` και εμφανίζει toast με τον αριθμό.
- `modules/orders_natl.js:980-1001`: ο φύλακας διπλότυπων χρησιμοποιεί `safeFetch`
  + `didFail` και **ρωτά τον χρήστη** όταν ο έλεγχος δεν έγινε, αντί να περάσει
  σιωπηλά. Το σχόλιο `:968-979` εξηγεί γιατί.

---

# Παρατηρήσεις εκτός των τεσσάρων μοτίβων

Δύο πράγματα που δεν είναι κανένα από τα τέσσερα μοτίβα, αλλά προκύπτουν από τον
ίδιο κώδικα και αφορούν κανόνα της αρχιτεκτονικής:

1. **Σκληρή διαγραφή GROUPAGE LINES**, ενώ ο κανόνας είναι «ποτέ διαγραφή, μόνο
   `Status='Unassigned'`»: `modules/orders_intl.js:2592` (`deleteIntlOrder`),
   `:2724` (`cleanupOrphanGL`), `:2829` (`cleanupOrphans`). Τα τρία σημεία καλούν
   `atDelete(TABLES.GL_LINES, …)`. Το RBAC του Worker **δεν** δίνει DELETE στα
   `groupage_lines` για `dispatcher` (`worker/src/index.js:444`), άρα για
   dispatcher θα έρθει 403 και θα μετρηθεί (σωστά αυτή τη φορά) στο `_delFail`.
   Ο `owner` όμως έχει `"*": [… "DELETE"]` (`:366-368`), άρα για owner η διαγραφή
   **περνά** (soft-delete) και ο κανόνας παραβιάζεται. Τα άλλα σημεία του repo
   κάνουν σωστά `Status='Unassigned'` (`modules/orders_natl.js:1085`, `:1510`,
   `modules/orders_intl.js:1209`, `:1570`) και υπάρχει `FIXME(audit)` στο
   `modules/orders_natl.js:1081-1083` και `:1508-1509`.

2. **Διπλή, ασυντόνιστη cascade διαγραφή παραγγελίας**: το front end κάνει τη δική
   του αλυσίδα (`deleteIntlOrder`) και μετά καλεί `atSoftDelete(TABLES.ORDERS, …)`
   (`:2633`), το οποίο στον Worker δεν είναι soft-delete πεδίου αλλά η RPC
   `delete_order_cascade` (`worker/src/index.js:3035-3037`, `:2344-2372`), που
   απαιτεί δικαίωμα **PATCH**, όχι DELETE (`:2349`). Τι κάνει η RPC δεν
   αποδεικνύεται από αυτό το repo — δες `05_UNCERTAIN.md`.
