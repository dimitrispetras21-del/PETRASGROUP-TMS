# Εισαγωγή DKV — «το ιδανικό scan» (8/9/2026)

Owner: «θέλω να γίνεται upload, και μετά να ανοίγει μια φόρμα με όλα τα έξοδα
προσυμπληρωμένα στο σωστό truck/RT. Μετά DADI.» Και: «αν κάνουμε διόρθωση, την επόμενη
φορά να είναι πιο έξυπνο.» Figma: Screens → `w6-expenses-v6-dkv-import` (522:1011).

## 1. Τι είναι το αρχείο (μετρήθηκε στο πραγματικό ZIP του 31/08/2026, 31 PDF)

| Τύπος εγγράφου | Πλήθος | Τι δίνει |
|---|---|---|
| E-INVOICE / E-STATEMENT ανά χώρα | 17 | μπλοκ `VEHICLE: <πινακίδα> CARD NO.: …`, γραμμές `dd.mm.yyyy <σταθμός> <κωδ.> <συναλλαγή> [ώρα] <προϊόν> <κωδ. προϊόντος> <μονάδα> <ποσότητα> <τιμή> … <καθαρό> <ΦΠΑ> <μικτό> [EUR ισοδύναμο]` |
| E-List of passages ανά χώρα | 9 | ανά όχημα ΚΑΙ ημέρα: `PAN … KFZ-KZ <πινακίδα> Ref. <ref> Datum: dd.mm.yyyy`, μία γραμμή ανά διέλευση με ώρα, αυτοκινητόδρομο, τμήμα, καθαρό, ΦΠΑ, μικτό |
| E-SUMMARY | 1 | λίστα όλων των εγγράφων με σύνολα — η πύλη συμφωνίας |
| T4E (BALM/CZE/PLE/BGR) | 4 | τιμολόγια παρόχων διοδίων (περίοδος 01–15 / 16–31) — ΔΕΝ μετρούν ξανά, καλύπτονται από τα STATEMENT |
| Reverse Charge | 2 | γενικά τέλη (DKV LIVE, service charge) χωρίς όχημα |

Παρατηρήσεις που καθορίζουν τη σχεδίαση:
- Η ημερομηνία του τιμολογίου είναι **ημερομηνία χρέωσης** (AT: 17/08 για διαδρομή 13/08). Οι λίστες
  διελεύσεων έχουν την **πραγματική ημέρα**. Για CZ/HU/PL/BG οι STATEMENT γραμμές είναι **δεκαπενθήμερο**
  ανά όχημα· η λίστα διελεύσεων τις σπάει ανά ημέρα.
- Συναλλαγή ↔ διέλευση δένουν με το `Ref.` (τα τελευταία ψηφία του αριθμού συναλλαγής).
- Καύσιμα: `DIESEL`/`ON`/`PREMIUM DIESEL` σε `LTR` με τιμή/λίτρο· `ADBLUE` σε LTR. Κωδικοί προϊόντος
  σταθεροί (0009 diesel, 0012 premium, 0016 adblue, 0902/0925/0926/0928/0933/0935/0936 διόδια BOX ανά
  χώρα, 0063 γέφυρα, 0949 τέλος συστήματος, LI05/LI06/0GRS γενικά τέλη).
- Ξένο νόμισμα (CZK/HUF/PLN/RSD): η γραμμή τελειώνει με το ισοδύναμο EUR.
- Πινακίδες: `IAB1096` και `IAZ 8302` (με κενό) → κανονικοποίηση = αφαίρεση κενών, upper, ελληνικά
  Ι/Α/Β/Ζ → λατινικά. Ο πίνακας φορτηγών έχει `IAB1096`, `IAZ8302`. Άγνωστη πινακίδα → `ct_plate_aliases`.
- Σε RS το τιμολόγιο δεν διαβάζεται με την ίδια γραμμή-πρότυπο (5 σελίδες, άλλη διάταξη) → πηγαίνει στο
  δίχτυ AI (§4) ή σε δεύτερο πρότυπο· η πύλη συμφωνίας το αποκαλύπτει.

## 2. Αρχιτεκτονική — πού τρέχει τι

```
Browser                              Worker                              Postgres
─────────                            ──────                              ────────
ZIP → JSZip → pdf.js text ανά PDF ─► POST /costs/import/parse            ct_cost_docs (draft)
                                      ├─ hash ZIP → ήδη υπάρχει; 409     storage: cost-docs/<hash>.zip
                                      ├─ dkv-parser (κανόνες)  → lines
                                      ├─ λεξικά ct_import_rules → normalize
                                      ├─ AI μόνο για unparsed pages
                                      ├─ πύλη: Σ lines == E-SUMMARY
                                      └─ match RT (plate+day) + score
                                     ◄─ preview JSON
Προεπισκόπηση (Figma 522:1011)
διορθώσεις → «να ισχύει στο εξής;» ─► POST /costs/import/commit          ct_cost_lines (doc_id, rt_id,
                                      ├─ insert lines (idempotent/doc)      alloc_status, truck_id, plate_raw)
                                      ├─ rules από διορθώσεις              ct_import_rules (+1 ανά διόρθωση)
                                      ├─ few-shot από AI-διορθώσεις        scan_examples (doc_type='dkv')
                                      └─ doc.status='confirmed', metrics   ct_cost_docs.total_gross, lines_*
```

- **Ο parser είναι ένα αρχείο, `core/dkv-parser.js`**, καθαρή συνάρτηση `parseDkv(files: {name, text}[]) →
  {docs, lines, passages, summary, errors}`, χωρίς DOM, χωρίς fetch. Φορτώνεται από το app.html ΚΑΙ από
  Node (`module.exports` guard) ώστε τα τεστ να τρέχουν στο ίδιο ακριβώς κείμενο που δίνει το pdf.js
  (Node: `pdfjs-dist@3.11.174` legacy build — η ίδια έκδοση με το app, `core/scan-helpers.js:175`).
- Το κείμενο βγαίνει ΜΟΝΟ από pdf.js (browser και Node), όχι από pypdf/pdftotext — διαφορετικά εργαλεία
  δίνουν διαφορετικές γραμμές και ο parser θα «δούλευε στα τεστ, όχι στην οθόνη».
- Ο browser στέλνει το κείμενο, ο Worker τρέχει τον parser (το ίδιο αρχείο, bundled). Μία υλοποίηση,
  δύο περιβάλλοντα.

## 3. Σχήμα εξόδου του parser (σταθερό — και για το AI)

```js
line = {
  source: 'DKV', doc_no: '26/654301512/001', doc_type: 'invoice'|'statement'|'passages'|'reverse_charge'|'summary',
  country: 'AT', vehicle_raw: 'IAZ 8302', plate: 'IAZ8302' | null, card_no,
  service_date: '2026-08-13',            // πραγματική ημέρα όταν υπάρχει (passages), αλλιώς ημερομηνία χρέωσης
  period_from, period_to,                // μόνο για δεκαπενθήμερα (CZ/HU/PL/BG)
  product_code: '0902', product: 'Maut A - DKV BOX', category: 'tolls'|'fuel'|'reefer_fuel'|'adblue'|'ferry_train'|'dkv'|'other',
  station, city, time, ref: '0000000056155890',
  quantity: 1, unit: 'ST'|'LTR'|'PC', unit_price,
  net, vat, gross, currency: 'EUR', net_eur, vat_eur, gross_eur, fx_rate,
  passages: [{time, road, section, net, vat, gross}]   // μόνο όταν doc_type='passages', ομαδοποιημένα ανά (plate, day)
}
```
Κανόνας κατηγορίας: από λεξικό `product_code → category` (αρχικό seed από την §1), όχι από κείμενο.

## 4. Οι τρεις μνήμες (πώς «μαθαίνει»)

| Μνήμη | Πίνακας | Τι γράφεται | Πότε |
|---|---|---|---|
| Λεξικά | `ct_import_rules` (νέος, migration 024): `kind` (plate\|product\|station\|category\|rt_pref), `key`, `value` jsonb, `source`, `hits`, `created_by`, `created_at` | «0949 → tolls», «SHELL PIERIAS → GR», «IAZ 8302 → truck 17» | όταν η Αλεξία διορθώσει και απαντήσει «ναι, στο εξής» |
| Παραδείγματα AI | `scan_examples` (υπάρχει· `doc_type='dkv'`, `corrected` jsonb = {input_text, output_lines}) | ζεύγος «τι είδε → τι ήταν σωστό» | μόνο για γραμμές που έβγαλε το AI (όχι ο parser) |
| Προτιμήσεις RT | `ct_import_rules` kind='rt_pref': key = {plate, overlap:'two_rts', line_type} → value = {rule:'split_by_passages'\|'most_days'\|'latest'} | τι διάλεξε όταν υπήρχαν δύο RT | στη διόρθωση πρότασης |

Σκορ ταιριάσματος: `plate` γνωστή ΚΑΙ `service_date` μέσα σε ακριβώς ένα RT (date_start ≤ d ≤ date_end,
status ≠ cancelled) → **sure**· δύο RT → **suggest** (το RT με τις περισσότερες ημέρες της περιόδου, ή
σπάσιμο ανά ημέρα αν υπάρχουν passages)· χωρίς πινακίδα ή χωρίς RT → **none** (πάει
`alloc_status='unallocated'`, γενικά τέλη με σημείωση «γενικά έξοδα DKV»).

Μετρικές ανά έγγραφο (στήλες στο `ct_cost_docs`, migration 024): `lines_total`, `lines_sure`,
`lines_corrected`, `lines_unallocated`, `parser_version`. Στην οθόνη: «διορθώσεις ανά 100 γραμμές».

## 5. Endpoints (Worker, `COSTS_PERMS.import`: owner, accountant)

- `POST /costs/import/parse` body `{source:'DKV', zip_name, zip_sha256, files:[{name, text}]}` →
  αν sha256 υπάρχει σε `ct_cost_docs` με status confirmed → 409 «έχει ήδη εισαχθεί (ημ/νία, ποιος)».
  Αλλιώς: parse → normalize (rules) → AI για `errors.unparsed` (προαιρετικό, flag) → reconcile → match →
  `{doc:{...}, lines:[...+match], reconcile:{ok, summary_total, lines_total, per_doc:[...]}, metrics}`.
  Αποθηκεύει ct_cost_docs draft + το ZIP (bucket `cost-docs`, path `<sha256>.zip`, private, signed URL).
- `POST /costs/import/commit` body `{doc_id, lines:[{...final}], rules:[{kind,key,value}], examples:[...]}`
  → μία συναλλαγή: insert `ct_cost_lines` (doc_id, rt_id, truck_id, plate_raw, category, line_date,
  net/vat σε EUR, liters, station, note = «DKV 26/… · <προϊόν> · <χώρα>»), insert rules, insert examples,
  update doc (confirmed, metrics). Idempotent: doc ήδη confirmed → 409.
- `GET /costs/import/docs` → λίστα εγγράφων (για «Παραστατικά» στην καρτέλα και για επανάληψη).

## 6. Πύλες («αν σπάσει, πώς θα το μάθω»)

1. Σ(gross όλων των γραμμών ανά έγγραφο) == σύνολο εγγράφου στο E-SUMMARY, ανοχή 0,01 € → αλλιώς
   κόκκινη λωρίδα «Δεν συμφωνεί: <έγγραφο> <διαφορά>» και το κουμπί καταχώρησης κλειδώνει.
2. Κάθε γραμμή έχει `doc_no` και `ref` → μοναδικότητα (doc_no, ref, plate, service_date, product_code)
   στη βάση (unique index, migration 024) → η ίδια συναλλαγή δεν ξαναγράφεται ποτέ.
3. Σελίδα που δεν έδωσε καμία γραμμή αλλά έχει ποσά → `errors.unparsed` → εμφανίζεται, δεν αγνοείται.
4. Άγνωστος κωδικός προϊόντος → κατηγορία `other` + σημαία «νέος κωδικός <x>» → μετά τη διόρθωση γίνεται κανόνας.

## 7. Φάσεις

- **Φ1 Parser + τεστ (τώρα):** `core/dkv-parser.js`, `tests/dkv/` με Node harness (pdfjs-dist legacy,
  jszip) που τρέχει πάνω στο πραγματικό ZIP από `.local/dkv/` (gitignored — ΔΗΜΟΣΙΟ repo) και σε ένα
  συνθετικό fixture κειμένου που μπαίνει στο repo (ανώνυμα ονόματα/ποσά). Απόδειξη: ο parser βγάζει
  γραμμές για 17/17 έγγραφα, Σ ανά έγγραφο == E-SUMMARY, 0 unparsed εκτός RS (αναμενόμενο, καταγράφεται).
- **Φ2 Worker:** endpoints §5, migration 024, bucket. Deploy owner.
- **Φ3 Οθόνη:** ανέβασμα (JSZip + pdf.js), προεπισκόπηση 522:1011, διορθώσεις + «στο εξής;», commit,
  «Παραστατικά» στην καρτέλα δρομολογίου.
- **Φ4 DADI:** νέο πρότυπο `core/dadi-parser.js`, ίδια §3/§4/§5.
- **Φ5 AI δίχτυ + few-shot:** για unparsed σελίδες, με `scan_examples`· ίδιος βρόχος στο σκανάρισμα
  παραγγελιών.

## 8. Γύρος 3 (owner 8/9 απόγευμα, «εγκρίνω») — επιμερισμός, χώρες, καύσιμα, σύστημα οθονών

**Αρχή:** κάθε ευρώ της DKV καταχωρείται (ήδη ισχύει — και οι αδιάθετες γράφονται) ΚΑΙ φορτώνεται
κάπου με γνωστό τρόπο. Κάθε γραμμή κρατά `alloc_method` ώστε να φαίνεται και να αλλάζει.

**8.1 Κανόνας επιμερισμού** — δοκιμάζεται με αυτή τη σειρά, η πρώτη που πιάνει κερδίζει:
| # | Περίπτωση | Πού πάει | `alloc_method` |
|---|---|---|---|
| 1 | Ακριβής ημέρα (διελεύσεις, καύσιμα, γέφυρες, AT/SI/SK με ref) μέσα σε ένα RT | στο RT | `exact` |
| 2 | Περίοδος (δεκαπενθήμερο που δεν έσπασε σε ημέρες) με ≥1 RT του φορτηγού μέσα της | σπάσιμο ανά RT **αναλογικά με τις ημέρες επικάλυψης** (7/15 · 8/15), σημείωση «επιμερισμός ημερών», ίδιο `split_from_seq`/`sub`, Σ EUR ακριβές | `days` |
| 3 | Ημέρα χωρίς RT, αλλά RT του ίδιου φορτηγού που ξεκινά/τελειώνει έως **3 ημέρες** μακριά | στο πλησιέστερο RT, με σήμανση «κατ' εκτίμηση» | `nearest` |
| 4 | Ημέρα/περίοδος χωρίς RT εντός 3 ημερών | `rt_id` NULL, `truck_id` γεμάτο → **κόστος φορτηγού** (P&L φορτηγού ναι, P&L δρομολογίου όχι) | `truck` |
| 5 | Γενικά τέλη DKV χωρίς όχημα (κατηγορία `dkv`) | `rt_id` NULL, `truck_id` NULL· στο κλείσιμο μήνα επιμερίζονται ως `fixed_alloc` αναλογικά με τα χιλιόμετρα κάθε φορτηγού (ct_round_trips.total_km) | `fleet` → `km` |
Η οθόνη δείχνει τον τρόπο ως λέξη στη στήλη δρομολογίου («ακριβής», «ημέρες 7/15», «πλησιέστερο», «φορτηγό», «στόλος»)· η Αλεξία μπορεί να αλλάξει RT σε 2–4 και η αλλαγή γίνεται κανόνας `rt_pref`. Στη βάση: στήλη `ct_cost_lines.alloc_method text` (migration 026) + CHECK στις 6 τιμές.
`alloc_status` παραμένει (allocated/unallocated/review) — το `alloc_method` λέει το ΠΩΣ.

**8.2 Ανά δρομολόγιο, ανά χώρα.** Κάθε γραμμή έχει `toll_country`. Νέα view `ct_v_rt_country_costs`
(rt_id, country, category, net_eur, vat_eur, lines) και `ct_v_truck_month_country`. Οθόνες: κεφαλίδα
δρομολογίου (Έξοδα, TRIP PnL) «Βουλγαρία 80 € · Σλοβενία 30 €», κεφαλίδα ομάδας στην εισαγωγή, πίνακας
«χώρα × μήνας» στην καρτέλα φορτηγού.

**8.3 Καύσιμα.** Απόφαση owner 8/9: ΔΕΝ ανοίγει ο πίνακας `fuel` (0 γραμμές, κανένας αναγνώστης —
μετρήθηκε: καμία view, καμία οθόνη). Η αλήθεια των καυσίμων = `ct_cost_lines` κατηγορίες fuel/
reefer_fuel/adblue με liters/km_reading/station/unit_price/toll_country· `ct_v_consumption` ήδη
διαβάζει από εκεί. Χτίζεται οθόνη «Καύσιμα» πάνω στις ίδιες γραμμές (λίτρα & L/100km ανά φορτηγό-μήνα,
€/L ανά χώρα, απόκλιση ανά φορτηγό) και τα ίδια νούμερα στην καρτέλα φορτηγού. Ο `fuel` καταργείται με
migration όταν κλείσει το P&L (αρχή 8).

**8.4 Σύστημα οικονομικών οθονών (Figma πρώτα, μετά κώδικας).** Ένα σετ: πίνακας (στήλες, tabular
ψηφία, ύψος γραμμής 40, hairlines), κεφαλίδα ομάδας, λωρίδα-σύνοψη, φίλτρα, κατάσταση ως λεπτή
γραμμή/κείμενο (όχι πολύχρωμες τελείες), ενέργειες σε hover, κενές/σφάλμα καταστάσεις, εικονίδια
Lucide αντί για unicode. Εφαρμόζεται ΤΑΥΤΟΧΡΟΝΑ σε Εισαγωγή DKV, Έξοδα Δρομολογίων, TRIP PnL,
Μισθοδοσία. Figma: Screens → «fin-system-*» frames.
