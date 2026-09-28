# scan-eval — μέτρηση του scan παραγγελιών (Γύρος 1 «μέτρηση πρώτα»)

Σχέδιο: `docs/scan/01-erevna-2026-09-27.md`. Εδώ ζει **μόνο κώδικας και συνθετικά δεδομένα**.

## ⛔ Ιδιωτικότητα — το repo είναι δημόσιο
Πραγματικά έγγραφα, κείμενά τους, `golden.json`, αποτελέσματα ανά έγγραφο, αναφορές με τιμές:
**μόνο** στο `.local/scan-golden/` (gitignored — έλεγχος: `git check-ignore -v .local/scan-golden/golden.json`).
Τα scripts αρνούνται να γράψουν έξοδο εκτός `.local/`. Σε μηνύματα commit / αναφορές: μόνο
`score.mjs --aggregate-only` (αριθμοί, χωρίς τιμές).

```
.local/scan-golden/
  docs/            τα πρωτότυπα (PDF, .doc)
  text/            εξαγόμενο κείμενο + inventory.json (sha256, τύπος, σελίδες)
  golden.json      η αλήθεια ανά έγγραφο (+ build-golden.mjs που το παράγει)
  ground-truth-queries.sql   τα SELECT με τα οποία βρέθηκαν οι αποθηκευμένες παραγγελίες
  ref-cache.json   πελάτες/τοποθεσίες όπως τα φορτώνει η εφαρμογή (24h cache)
  results/         ένα αρχείο ανά εκτέλεση
```

## Αρχεία
| Αρχείο | Τι κάνει |
|---|---|
| `extract-text.mjs` | inventory + κείμενο: PDF με pdfjs-dist 3.11.174 (η ίδια έκδοση με το app), `.doc` με το macOS `textutil` |
| `run-current.mjs` | τρέχει το scan πάνω στο golden set: σημερινή μηχανή (`results/current-*.json`) ή, με `--engine v2`, τη μηχανή του γύρου 2 (`results/v2-*.json`) μέσα από την ΙΔΙΑ ροή της εφαρμογής |
| `lib/app-sandbox.mjs` | φορτώνει τον **ίδιο τον κώδικα** της εφαρμογής (config.js, core/scan-helpers.js, core/doc-text.js, core/scan-engine-v2.js, core/form-helpers.js, core/countries.js και τις συναρτήσεις scan του modules/orders_intl.js) σε Node vm — όχι αντίγραφο prompts. `engine:'v2'` γυρίζει τον ίδιο διακόπτη με τον browser |
| `ui-smoke.mjs` | η πραγματική φόρμα σε Chromium (Playwright), backend mocked με επινοημένα δεδομένα: .doc → v2 → προσυμπλήρωση |
| `test/synthetic-docs.mjs` | επινοημένο PDF με text layer και Word .doc, φτιαγμένα byte-προς-byte |
| `lib/mock-fetch.mjs` | ψεύτικος Worker για `--dry-run` και τα tests |
| `score.mjs` + `lib/score.mjs` | βαθμολόγηση golden × results |
| `lib/normalize.mjs` | ημερομηνίες→ISO, αριθμοί με ευρωπαϊκά διαχωριστικά, χώρες→ISO2, τύπος παλέτας, reference |
| `fixtures/synthetic-*.json` | **επινοημένα** δεδομένα (έτος 2031, recSynth…) για tests/dry-run |

## Εντολές
```bash
# tests (χωρίς δίκτυο, χωρίς πραγματικά δεδομένα)
node --test tools/scan-eval/test/*.test.mjs

# 1. inventory + κείμενο
node tools/scan-eval/extract-text.mjs .local/scan-golden/docs .local/scan-golden/text

# 2. έλεγχος ότι το golden set είναι καλοσχηματισμένο (πρέπει 100%)
node tools/scan-eval/score.mjs --golden .local/scan-golden/golden.json --oracle --aggregate-only

# 3. baseline — dry-run (ψεύτικος Worker, κανένα κόστος)
node tools/scan-eval/run-current.mjs --dry-run

# 3'. baseline — ΠΡΑΓΜΑΤΙΚΟ (κοστίζει· χρειάζεται φρέσκο JWT)
#   app → login → DevTools console: localStorage.getItem('tms_jwt') → αντιγραφή
read -s TMS_JWT && export TMS_JWT          # επικόλληση, Enter — δεν φαίνεται, δεν μπαίνει στο history
node tools/scan-eval/run-current.mjs                 # δείχνει εκτίμηση κόστους, ΔΕΝ στέλνει
node tools/scan-eval/run-current.mjs --confirm-cost  # στέλνει

# 3''. μηχανή v2 (γύρος 2) — ίδια ροή, ίδιο σκορ. Το JWT μπορεί να διαβαστεί από το .env.local χωρίς να τυπωθεί:
node --env-file=.env.local tools/scan-eval/run-current.mjs --engine v2 --budget 12 --confirm-cost
#   --model claude-opus-5 | claude-haiku-4-5-20251001   --mode pdf|text|auto   --effort low|medium   --thinking adaptive
#   κάθε live εκτέλεση γράφεται στο results/ledger.jsonl· --budget σταματά ΠΡΙΝ το όριο (σύνολο ledger)
# 3'''. αλλαγές matching/φόρμας χωρίς κόστος: ίδιες απαντήσεις μοντέλου, νέος κώδικας μετά το μοντέλο
node tools/scan-eval/run-current.mjs --engine v2 --replay .local/scan-golden/results/v2-<ts>.json
# UI: η φόρμα όπως τη βλέπει ο dispatcher (κανένα token, καμία εγγραφή)
node tools/scan-eval/ui-smoke.mjs [--shot .local/scan-golden/results/ui.png]

# 4. βαθμολογία
node tools/scan-eval/score.mjs --golden .local/scan-golden/golden.json --results .local/scan-golden/results/current-<ts>.json

# 4'. Γύρος 4 — golden-full.json (v1 15 + v2 55 νέα, docs/ + docs-lastmonth-flat/ μαζί):
node tools/scan-eval/run-current.mjs --engine v2 --golden .local/scan-golden/golden-full.json --dry-run
#   --docs <dir1,dir2>  ρητοί φάκελοι εγγράφων, δοκιμάζονται πρώτοι· μετά το `dir` του κάθε golden doc· μετά 'docs'
#   --include-unscored  τρέχει ΚΑΙ τα scored:false (δίδυμα/αταίριαστα) — default τα προσπερνά
node tools/scan-eval/score.mjs --golden .local/scan-golden/golden-full.json --results <results.json> --split dev|heldout|all
#   --split default 'all' (μόνο scored:true)· ανά έγγραφο δείχνει και ανάλυση ανά template (bare id, ποτέ όνομα σε --aggregate-only)
```
Τρέχει από τον κύριο φάκελο **ή** από worktree (το `.local/scan-golden` βρίσκεται ανεβαίνοντας γονείς· ή `SCAN_GOLDEN_DIR=`).

## Τι αναπαράγει ακριβώς το baseline
Τη ροή batch του «New Order from Scan» (International): `_scanHandleFiles` (πύλη τύπου/μεγέθους) →
`_scanExtractCore` (Haiku ταξινόμηση → μοντέλο ανά τύπο → βρόχος εργαλείων search_clients/search_locations
με τα 50 πρώτα clients / 80 locations στο prompt → Haiku «καθάρισμα» → κλιμάκωση σε Opus αν φτωχό) →
`_scanPreview` (fuzzy matching πελάτη/τοποθεσιών) → `_scanOpen` (ό,τι θα έβλεπε ο dispatcher στη φόρμα).
Η **πρόβλεψη που βαθμολογείται είναι η προσυμπλήρωση της φόρμας**, όχι το ωμό JSON (κρατιέται κι αυτό στο `raw`).

Διαφορές από τον browser, σκόπιμες:
- **Παραδείγματα few-shot:** κενά (όπως φρέσκος browser, και όπως ο πίνακας `scan_examples` στις 27/9: 0 γραμμές).
  Ως τις 27/9 το `TABLES.SCAN_TRAINING` δηλωνόταν δύο φορές και κέρδιζε το κενό — διορθώθηκε στο feat/scan-engine-v2.
  Για να μετρηθεί ένας συγκεκριμένος browser: `--examples <json>`. Η v2 δεν χρησιμοποιεί few-shot.
- **Έλεγχος διπλού Reference:** stub (κενό) — δεν επηρεάζει την εξαγωγή και δεν διαβάζει παραγγελίες.
- **Προεπισκόπηση PDF:** stub (φορτώνει pdf.js από CDN, άσχετο με την εξαγωγή).
- **Origin header:** προστίθεται (ο browser το βάζει μόνος· χωρίς αυτό ο Worker γυρίζει 403).

Έγγραφα που η πύλη απορρίπτει (σήμερα **κάθε .doc/.docx/.eml**) γράφονται `status: rejected` και
μετρούν ως λάθος σε κάθε πεδίο — είναι αποτυχίες του σημερινού scan, όχι «εκτός δείγματος».

## Μορφές
**golden (`scan-golden/v1`)** — ανά έγγραφο `orders[]` (ένα αρχείο μπορεί να έχει πολλές παραγγελίες). Κάθε πεδίο
`{v, src: doc|saved|doc+saved, contested?, any_of?, note?}`. `v: null` = το έγγραφο δεν το λέει → **δεν βαθμολογείται**.
`any_of` = αποδεκτά record ids (διπλοεγγραφές τοποθεσιών). Στάσεις: `{type: loading|delivery, location_ids[], date, pallets, country, time?, contested_count?, contested_location?}`.
`disagreements[]` = διαφορές εγγράφου ↔ αποθηκευμένης παραγγελίας (`conflict` / `doc_only`).

**results (`scan-results/v1`)** — ανά έγγραφο `{doc_id, status: ok|rejected|error, orders:[{client_id, reference, direction, goods,
gross_weight_kg, pallets, pallet_type, temperature_c, price, stops:[{type, location_id, date, pallets, country}], confidence:{…}}],
calls:[{model, usage, stop_reason, cost}], cost_usd, truncated}`. Κάθε νέα μηχανή (Γύρος 2) γράφει την ίδια μορφή.

**golden (`scan-golden/v2`, Γύρος 4)** — v1 + ανά έγγραφο `template` (bare id `T01`…`Tnn` — το όνομα οικογένειας ζει
ΜΟΝΟ στο `golden.templates`, ποτέ στο `doc.template`, ώστε το `--aggregate-only` να μην τη διαρρεύσει), `split:
'dev'|'heldout'` (ανά template — 30% των templates, στρογγυλοποίηση πάνω, εξαιρουμένων όσων περιέχουν από τα παλιά
15· δες σημείωση παρακάτω αν ο στόχος δεν πιάστηκε), `scored: true|false` και `duplicates_of: <doc_id>|null`.
`scored:false` = δίδυμο άλλου εγγράφου (`duplicates_of`) ή **καμία αποθηκευμένη παραγγελία δεν βρέθηκε** — δεν
υπάρχει αλήθεια να ελεγχθεί, οπότε το score.mjs/run-current.mjs το αγνοούν από προεπιλογή. Ο κανόνας αλήθειας
άλλαξε για τα νέα έγγραφα (`truth_rule_new` στο ίδιο το αρχείο): **η αποθηκευμένη παραγγελία είναι η αλήθεια**
(owner: «στο TMS έχω βάλει τα σωστά»), όχι το έγγραφο όπως στα παλιά 15 (`truth_rule_old15`, αμετάβλητο) — δύο
κανόνες αλήθειας στο ΙΔΙΟ αρχείο, καθένας κρατά την πηγή του (`src: 'saved'` έναντι `doc`/`doc+saved`).

## Μετρικές
- ακρίβεια ανά πεδίο (και χωρίς τα `contested`)
- % εγγράφων με **όλα τα κρίσιμα σωστά**: πελάτης, reference, παλέτες, θερμοκρασία, ημερομηνίες στάσεων, στάσεις (πλήθος + τοποθεσία)
- βαθμονόμηση: ακρίβεια ανά κάδο βεβαιότητας (0.9+ πρέπει να σημαίνει ≥ 98% σωστά)
- κόστος/χρόνος ανά έγγραφο, `truncated` όταν κάποια κλήση έκοψε σε `max_tokens`

## Αν σπάσει, πώς θα το μάθω
- μετονομασία/αφαίρεση συνάρτησης του scan path → `sandbox.test.mjs` κόκκινο (δεν μετράμε σιωπηλά άλλο πράγμα)
- αλλαγή στα πεδία που προφορτώνει το app (`_REF_FIELDS`) → test κόκκινο
- golden χωρίς αποτέλεσμα → `WARNING … have no result` και μετρά ως `missing`
- ληγμένο JWT → σταματά πριν σταλεί οτιδήποτε
- golden με λάθος μορφή → `--oracle` < 100%
- Γύρος 4: ο στόχος «held-out ≥ 25% των scored εγγράφων» **δεν πιάστηκε** στο `golden-full.json` — 5 από τα 6
  templates περιέχουν έγγραφο από τα παλιά 15 (πρέπει `dev`), οπότε μόνο 1 template (3 έγγραφα, 6,7%) ήταν
  ελεύθερο για held-out. Δεν είναι σφάλμα του script· είναι το πραγματικό σχήμα των εγγράφων του μήνα
  (η μεγάλη πλειοψηφία επαναχρησιμοποιεί τα ίδια sender forms με τα 15 του tuning). Θέλει περισσότερα, πιο
  ποικίλα πρότυπα πελατών πριν έχει νόημα ένα πραγματικό held-out σετ (δες Δ στο docs/scan/04).
