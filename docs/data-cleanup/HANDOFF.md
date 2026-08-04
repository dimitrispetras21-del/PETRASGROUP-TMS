# Σημείωμα συνέχειας — καταγραφή στόλου

_Κατάσταση 2026-08-03. Η επόμενη συνεδρία συνεχίζει ΑΠΟ ΕΔΩ._

## Τι κάνουμε
Καταγραφή στοιχείων & εγγράφων για κάθε όχημα, από τους φακέλους Google Drive
του `vermionfresh@gmail.com`, ώστε να ενημερωθεί σωστά το TMS **μία φορά**.

**Μέθοδος:** `search_files` με `parentId = '<folder id>'` ανά όχημα. Οι
ημερομηνίες λήξης βγαίνουν από τα **ονόματα αρχείων** (κρατάμε πάντα το
νεότερο κάθε είδους). Τεχνικά στοιχεία (Euro, μοντέλο, πλαίσιο) από
`read_file_content` στη «Βεβαίωση EURO» ή στην «Άδεια κυκλοφορίας».
**Καταγραφή στο `FLEET-DOCS-2026-08-03.md` + commit μετά από κάθε 2-3 οχήματα.**

## Κανόνες που έχουν κλειδώσει
- **Πινακίδες:** λατινικά, κεφαλαία, **χωρίς κενά** (owner, 3/8). Πίνακας
  μετατροπής: `FLEET-PLATES-2026-08-03.md` — 23 από 36 αλλάζουν, καμία σύγκρουση.
- **Πριν αλλάξει πινακίδα στο TMS:** πρέπει να ενημερωθεί ΤΑΥΤΟΧΡΟΝΑ και το
  `Vehicle Plate` (κείμενο) στο MAINT_HISTORY, αλλιώς ορφανεύει το ιστορικό.
- **CB8427XT → CB3584BO** (μετονομασία, owner 3/8/2026).
- Οι λήξεις στο TMS είναι μπαγιάτικες, όχι πραγματικές — τα έγγραφα ανανεώθηκαν.

## ✅ Ολοκληρωμένα (17)
Ελλάδα: IAZ8302 · IAB4162 · IAB2106 · IAB2107 · IAB2108 · IAB2109 · IAB4166 ·
IAZ4445 · IAZ5561 · IAZ5562 · IAB1096 · NXA9647 · NXA9624 · IAZ7245 · IAZ7244 ·
IAB2103 — Βουλγαρία: CB1286KE

## ⏳ Υπόλοιπα — folder IDs έτοιμα

**Βουλγαρία (10):**
- CB1284KE `1y9SWVA_fMk3ggnQliJY9v7589ncik50Z`
- CB4612PE `1W-xxdVN_Jg5-JSj75jusrWSahDRrXgLk`
- CB8214OB `1VR6zhyI1LO0V-2vpiswbOcA-UeJGF8xR`
- CB0138HO `13tfvXnAbBpDzOoMzaRSad9ud0X3HiFJj`
- CB0142HO `1jltbz5n8vFStGThL324KPTiklEBnV5ZF`
- CB3584BO `1AN8KXGr-D_DYJC2IRx4aVVreNCJAeQXX` (+ παλιός «CB 8427 XT» `1Hd8PbzI5O6Ua63iE305DJC16QRAs6CCQ`)
- CB5284TP `1HV4SwVb12JmRw2515-kbLSBkEgY43Bdb`
- CB5871TT `1HW1HUlkXLWuo5lBwDYo8j7KQmwg51fJx`
- CB0229PB `1I1IgNOyunwgow2z72V3Qk8ftko6efmlL`
- CB8425XT `1HylWLb7HXREh1TAYhWIqbUK-FwvFQbrL`

**Θάλαμοι (~20):** ρίζα `1-vuWsm6d7On7FOQpAI7DjERnbncUCT_T` — **δεν έχει
απαριθμηθεί ακόμα**· πρώτο βήμα: λίστα υποφακέλων. Πινακίδες τύπου `Ρ 11983`
(ελληνικό Ρ) — 20 στο Excel του 2024.

**Ελλάδα ανενεργά / εκκρεμή (φάκελοι):**
IAB1099 `14AW9wF7F8HceGgywLlxPPIvdYOtxRC0V` · HMM6272 `13-M9P2xwky--yD-VWntDpUrEyYqYeP_D`
(+dup `17LnIbUTMmxACfUr4silAUFKBTX9tzCZW`) · EKA7481 `16twQwK78MfRRbhl-Jd0vJibdvshyeJDG` ·
IAA6166 `17ExztjtaxT44jxMyIK-tqlUFSgOsDqtD` · HMP1421 `1KZiElxknrQJkCBqiPASRuREmQiWgduTb` ·
NKN5245 `10qLmtAhPuOo5al4AvwsjQUhofdOwYR4f` · IAB2102 `15e1iwWPfBpX6W8xWQj1uBMYKMUkXQKzB`
(+dup `1723YASIVUmRcHpDJPWC6m6iDxAqArCCt`) · IAB2103-dup `175e1E2zAcEjrgQO6YYU2-Mo64_qnf_LR` ·
IAA4166 `1nSIsKRaeNj3AuaZE5Pm1p4FuXy6_B105`

**Φάκελοι χωρίς πινακίδα στο όνομα (θέλουν ταυτοποίηση από την άδεια μέσα):**
«New aero» `1KBHeq6keek-wFXOQmXB54m12fGgEDWHt` · «Νέο VOLVO» `174LXilz2p3og2Sv394PjZ9c7vjdoiNsn` ·
«Νέο SCANIA» `1723qbYumtjgIi1MmnqIvAIAi6DI2RESC` · «ΝΕΟ SCANIA 1» `14RnFq056YBLJ1-doQNXfUM_-Ansptq6T` ·
«ΝΕΟ VOLVO 1» `14UhW5MqZrM03qpS0kptiuledljcIyhDb`

**Παλαιότερα (πιθανώς εκτός στόλου):** ΙΑΕ 1504 · ΙΑΑ 6182 · ΙΑΕ 5675 ·
ΕΚΑ 3363 · ΙΑΕ 5809 · ΙΑΒ 1077 · ΙΑΖ 5568 · ΝΧΑ 9557 · ΙΑΕ 5512

## Εκκρεμότητες προς owner
- **Ρεζερβουάρ (λίτρα):** δεν υπάρχει σε κανένα έγγραφο — από προδιαγραφές μοντέλου.
- **IAZ4445:** ΚΤΕΟ έληξε 11-6-2026 · ασφάλεια/πράσινη λήγουν 3-4/8/2026.
- **4 διπλοί φάκελοι Βουλγαρίας** + 4 ελληνικοί — ενοποίηση πριν από μαζική ενημέρωση.
