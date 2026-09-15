# ΜΕΘΟΔΟΣ — πώς βγήκαν τα ευρήματα και πώς ξανατρέχουν

Κανένα αρχείο του project δεν άλλαξε. Τα scripts έτρεξαν σε `/tmp/audit` με
`acorn` + `acorn-walk` εγκατεστημένα εκτός repo (`npm i acorn acorn-walk` σε
`/tmp/audit`, ώστε να μη πειραχτεί το `package.json`).

## Γιατί όχι grep

Το grep δίνει και τα δύο είδη λάθους σε αυτό το repo:

- **Ψευδώς θετικά**: το `'Insurance Partner'` φαίνεται ως εγγραφή σε TRAILERS
  (`modules/maintenance.js:373` γράφει σε `tableId` που μπορεί να είναι και
  TRUCKS και TRAILERS) — αλλά το call site (`:578`) περνά **μόνο** `'Truck'`.
  Χωρίς ανάγνωση θα είχε καταγραφεί εύρημα που δεν υπάρχει. Ίδιο για το
  `'Active'` στο `core/entity.js:1310` (υπάρχει σε όλους τους 6 πίνακες).
- **Ψευδώς αρνητικά**: τα labels χτίζονται δυναμικά — `fields[F.PA_NAT_LOAD]`,
  `` fields[`Delivery Location ${i}`] ``, `{[fld]: v}`, `_dF('Carrier', f['Carrier Type'])`.
  Ένα grep για `'Nat Load'` βρίσκει τη σταθερά στο `config.js`, όχι τη χρήση.

Άρα: **μηχανή για την εξάντληση, μάτι για την επιβεβαίωση**. Κάθε εύρημα της
αναφοράς έχει ανοιχτεί και διαβαστεί στο αρχείο του.

## Βήμα 1 — εξαγωγή του χάρτη του Worker (χωρίς αντιγραφή στο χέρι)

Το `var TABLES = {...}` του `worker/src/index.js` κόβεται με acorn και
αποτιμάται, ώστε τα σύνολα labels να είναι **ακριβώς** αυτά που βλέπει ο Worker:

```js
const acorn = require('acorn');
const src = require('fs').readFileSync('/workspace/worker/src/index.js', 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
const d = ast.body.flatMap(n => n.type === 'VariableDeclaration' ? n.declarations : [])
                  .find(d => d.id.name === 'TABLES');
const TABLES = new Function('return ' + src.slice(d.init.start, d.init.end))();
// ανά πίνακα: writable = fields ∪ aliases ∪ links ∪ linkAliases
//             readable = fields ∪ computed ∪ links ∪ reverseLinks
//             filterable = fields ∪ computed ∪ aliases   (filterFieldMap)
```

Αποτέλεσμα: 22 configs. Ίδια τεχνική για το `TABLES` και το `F` του `config.js`
(εκεί εντοπίστηκε και το διπλό κλειδί `SCAN_TRAINING`, εύρημα A-8, μετρώντας τα
`properties` του AST).

## Βήμα 2 — εντοπισμός κάθε εγγραφής στο front end

Για κάθε αρχείο σε `core/` και `modules/`: parse με acorn, και για κάθε
`CallExpression` προς `atCreate`/`atPatch`/`atSafePatch`/`atPatchUndoable`/
`atCreateBatch`/`atPatchBatch`:

1. λύση του 1ου argument σε table id (`TABLES.X` → `config.js`, ή literal),
2. λύση του payload:
   - `ObjectExpression` → κλειδιά, μαζί με computed (`[F.X]`) και spread,
   - `Identifier` → όλες οι αναθέσεις `name['Label'] = …` / `name[F.X] = …` μέσα
     στην **περικλείουσα συνάρτηση** (γι' αυτό χρειάστηκε ο υπολογισμός του
     στενότερου function scope),
3. διασταύρωση με το `writable` σύνολο του πίνακα.

Το script σημείωσε χωριστά **19 σημεία όπου δεν λύθηκε κανένα label** (π.χ.
`atCreateBatch(TABLES.ORDER_STOPS, toCreate)`). Αυτά είναι τα τυφλά σημεία της
αυτόματης ανάλυσης και διαβάστηκαν **όλα** χειροκίνητα — από εκεί βγήκαν τα
`core/stops-helpers.js`, `modules/pallet_upload.js`, `modules/daily_ramp.js:298`,
`modules/weekly_natl.js:702`.

Τα δυναμικά labels (`{[fld]: v}`) λύθηκαν διαβάζοντας τα call sites: για το
`modules/daily_ops.js:449-454` σημαίνει να διαβαστούν τα `chk(...)`/`timeSelect(...)`
στο `:470-510`, για το `modules/weekly_intl.js:961` τα `_wk3PickDate(...)` στο
`:762`, `:1157`, `:1179`.

## Βήμα 3 — τα φίλτρα με τον ΠΡΑΓΜΑΤΙΚΟ μεταφραστή

Αντί να ξαναγραφτεί η γραμματική (και να μαντευτεί), κόπηκε το τμήμα
`// src/lib/formula-translate.js` … `// src/lib/facade-links.js` από το
`worker/src/index.js` και αποτιμήθηκε:

```js
let code = src.slice(src.indexOf('// src/lib/formula-translate.js'),
                     src.indexOf('// src/lib/facade-links.js'))
              .replace(/__name\([^)]*\);?/g, '');
const { applyFilter, UnsupportedFilter } = new Function(
  code + '\nreturn { applyFilter, UnsupportedFilter };')();
```

Κάθε `filterByFormula` του front end υλοποιήθηκε (template literals με
placeholder τιμές: `recPLACEHOLDER123` για ids, `2026-08-01` για ημερομηνίες) και
πέρασε από `preResolveLinkTerms`-ισοδύναμο + `applyFilter` με τον χάρτη του
σωστού πίνακα. 90 σημεία, 49 καθαρά, 23 αποτυχίες, 18 μη επιλύσιμα αυτόματα.

**Και τα 41 (23+18) διαβάστηκαν στο αρχείο.** 8 από τις 23 αποτυχίες ήταν
ψευδώς θετικά της αντικατάστασης τιμών (λίστα στο `02_FILTERS_422.md §3`). Αυτό
είναι ακριβώς ο λόγος που δεν αρκεί το αυτόματο matching.

## Βήμα 4 — αχρησιμοποίητα labels και νεκρές αναγνώσεις

Για κάθε label που ο Worker δέχεται και κανένα σημείο εγγραφής δεν στέλνει,
αναζητήθηκε αν αναφέρεται καθόλου στο front end (`core/`, `modules/`, `app.html`,
`print.html`, `index.html`). Τα αποτελέσματα ήταν θορυβώδη, επειδή ίδια labels
υπάρχουν σε πολλούς πίνακες (`Notes`, `Partner`, `Date`), γι' αυτό ο **Πίνακας Β**
και το `03_DEAD_READS.md` γράφτηκαν αφού ελέγχθηκε **σε ποιον πίνακα** αναφέρεται
κάθε ανάγνωση.

## Τι θα άξιζε να γίνει test αντί για audit

Τα Βήματα 1-3 είναι ντετερμινιστικά και τρέχουν σε δευτερόλεπτα. Ένα script που:

1. χτίζει το `writable`/`readable`/`filterable` ανά πίνακα από το bundle του Worker,
2. σαρώνει τα σημεία εγγραφής/φίλτρων του front end,
3. αποτυγχάνει (exit ≠ 0) σε **νέο** άγνωστο label ή σε φίλτρο που δεν
   μεταφράζεται,

θα έπιανε ολόκληρη την κατηγορία WP-1/WP-2 **πριν** το push, αντί να την ψάχνει
audit κάθε λίγους μήνες. Δεν το πρόσθεσα: δεν αλλάζω αρχεία σε αυτό το πέρασμα.
