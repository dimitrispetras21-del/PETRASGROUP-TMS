# Σημείωμα συνέχειας — καταγραφή στόλου

_Κατάσταση 2026-08-04. Η επόμενη συνεδρία συνεχίζει ΑΠΟ ΕΔΩ._

> ⚠️ **Η ΒΑΣΗ ΕΙΝΑΙ SUPABASE** (project `gatejgbpyodlepkvqkgf`, creds σε
> `.env.local`) — ΟΧΙ Airtable. **4-8-2026: Η ΤΑΥΤΟΤΗΤΑ ΣΤΟΛΟΥ ΠΕΡΑΣΤΗΚΕ στη
> βάση** (πινακίδες κανονικοποιημένες, μοντέλα, VIN/EURO/τύποι σε notes, +3 νέοι
> θάλαμοι, 3 ανενεργά) — βλ. FLEET-IMPORT-REPORT-2026-08-04.md. Τα **expiry
> documents ΔΕΝ έχουν περαστεί** (απόφαση owner — επόμενη φάση). Εκκρεμεί
> ταυτοποίηση IZN1725/YTO3803 (trucks στη βάση χωρίς φάκελο Drive).

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

## ✅ Ολοκληρωμένα (27)
Ελλάδα: IAZ8302 · IAB4162 · IAB2106 · IAB2107 · IAB2108 · IAB2109 · IAB4166 ·
IAZ4445 · IAZ5561 · IAZ5562 · IAB1096 · NXA9647 · NXA9624 · IAZ7245 · IAZ7244 ·
IAB2103 — Βουλγαρία (ΟΛΑ, 4-8-2026): CB1286KE · CB1284KE · CB4612PE · CB8214OB ·
CB0138HO · CB0142HO · CB3584BO · CB5284TP · CB5871TT · CB0229PB · CB8425XT

**🔴 Νέα ευρήματα 4-8-2026 (βλ. FLEET-DOCS):** CB0229PB ΚΤΕΟ έληξε 2-6-2026 ·
DECLARATIONS όλων των ΒΓ λήγουν 4-5/8/2026 (πλην CB8214OB) · CB8214OB πράσινη
λήγει 9-8-2026. Παλιός φάκελος «CB 8427 XT» ασφαλής για αρχειοθέτηση.

## ⏳ Υπόλοιπα

**Θάλαμοι — ✅ ΚΑΤΑΓΡΑΦΗΚΑΝ ΟΛΟΙ 4-8-2026 (38 GR + 19 BG) στο FLEET-DOCS.**
Κύρια ευρήματα: 3 ληγμένα ΚΤΕΟ ΒΓ (Ε3714ΕΕ/E9263EE/Ε9066ΕΕ) · Ρ12345 ληγμένα
ΚΤΕΟ+ασφάλεια · ~14 μονάδες πιθανώς εκτός χρήσης · E9166EE κενός φάκελος ·
4 νέοι CB θάλαμοι leasing 2025 (πιθανώς λείπουν από TMS). Το ευρετήριο
φακέλων παρακάτω μένει για αναφορά:

Ρίζα `1-vuWsm6d7On7FOQpAI7DjERnbncUCT_T` — «ΕΛΕΓΧΟΣ - ΣΕΡΒΙΣ ΘΑΛΑΜΩΝ.xlsx»
`1FDhV2K6m9UfJY6Kk93gKv2Fhdgo7Xl-f` (ενημ. 5/2026) + 2 υποφάκελοι:

_Ελλάδα (38 φάκελοι, `1BWxIf216g6Isx5-XJ8WLRa9TEDsWC5Y2`):_
Ρ 68471 `1IGlaDOYDvMXDX06mlcbOVDdnOHCpTJBM` · P 50063 `1aMmGFspu-VYwbD9TxnWeP9mxEoMvSdoC` ·
ΤΒ 53142 ΚΟΥΡΤΙΝΑ `1dKkztVovFbL5m_8YaXs0awjP1c3gQ0T3` · Ρ 55494 ΡΥΜΟΥΛΚΑ `17E0qHFOspPck2Mg4zX7Rcfw3XITl1m7n` ·
Ρ 67301 `19FFF0C6YE2I0kdSS70nzNJNBlfuYcMo_` · Ρ 67294 ΚΟΥΡΤΙΝΑ `18jC5zMKT27slRqf6ArkqTxDzGI3iXcfh` ·
Νέος Θάλαμος `17PMDIiY1o6xLJremTLf254KqIktWk20g` · Ρ 12345 `11PWqSMLqLw-dAnssDIuUqzu3lNO6gidy` ·
Ρ 67294 (dup;) `10m0VtuDWlYuRcD8tnf8qWRbeqZbA5h7q` · Ρ 47331 `1FOksohorPjAVXCFXtjdpPzV3z2ZiqCXM` ·
Ρ 41754 `1GZg663insaPkJ7ojmuqsQ-OT_mezXknr` · Ρ 59487 `1FNNbUJklU2GxLXcSqFkTtb-fzDh6xZUB` ·
Ρ 49559 ΚΟΥΡΤΙΝΑ `1G_9xxqxYToRsRObFVNSp3JlUidP1k8jk` · Ρ 41755 ΚΟΥΡΤΙΝΑ `1Fb_Qtbwxp4NqptrSsi06ql3DU01siWXO` ·
Ρ 66542 `1FccWVJwiMdrDW2_nv0kR2qWIqYr50E9R` · Ρ 59482 `1EkMmsGYUc8EaUUw1uy2SrzVuOT7wU7Co` ·
Ρ 61335 `1FoPSFQYkIBx4yzJcYrV92v8p8V_VtHlt` · Ρ 53802 `1FprvIjB3nuaan71hFHSzVsFJMx6OPNbg` ·
Ρ 59524 ΚΟΥΡΤΙΝΑ `1FUIcPbt8YkHKK_JjVlYnHHru1FYCT0jH` · Ρ 42643 `1FFA6YJh8ZXjqgDRv5xG_cPfnB0I5LPk5` ·
Ρ 11983 `1G8dil919SaXcJIy11L8IZe0ubXN4hZc8` · P 59498 `1FdeZkvOiEJ1GJz5Z6jOdrCLIl697kTOk` ·
Krone Κουρτίνα `1FnW19RPR5rZgpwXP7rWGimNVP5nIGZ1-` · Ρ 61334 ΚΟΥΡΤΙΝΑ `1GR9PHiPIwGjnSLOAbSVL-NVJBzvltVp8` ·
Ρ 59483 `1G9tzpFQ2TZkicn6PBs6Tk2wTexFHQU1D` · Ρ 42595 `1G1GWVs4PY8XG-7Aj-9AbMNsRdQYvSylP` ·
Ρ 55492 `1G-ePG2qCx67rryFuBY9jzo75WV5Cfl2N` · Ρ 59526 `1GYS23WEO2YTIn4P8bn1Vic53ztrq5YxJ` ·
Ρ 50711 `1GMHqlOrIPOROBHGG5eBuf9laxxD5mDuV` · Ρ 48311 `1G_AvjgGBqCUCGjYVN31Juvx5XEBKfr-8` ·
Ρ 42596 `1Ew00OTeND7h--gXnpx7kpoTM1Fy7A38T` · Ρ 41756 `1GLtCDcUFKSnU5gkI5fA9WRW_Eff_fU4f` ·
Ρ 55494 (dup με ΡΥΜΟΥΛΚΑ;) `1FgZyHE9ur-MCMDaXuZCu-cf3dU8cFTW5` · Ρ 53206 ΚΟΥΡΤΙΝΑ `1Fl7L6Gdy9Uk-ueZbHKh9QLgXp6x74b8E` ·
Ρ 36917 ΚΟΥΡΤΙΝΑ `1EqZJxUDZgoa-SaTMRxo7xagyaMa_2ltA` · Ρ 53617 `1FCEHFm57N4ihZMb0j17CzZca6p4Tlz1C` ·
Ρ 40069 `1GCr13WUxuUc8mmeAdCbqi9rbFdg2iB7g` · Ρ 59498 (dup!) `1FELbXfBc_slorql66AXkP8dinlFJaPlt`
— ⚠️ 3 πιθανά διπλά: Ρ 67294, Ρ 55494, Ρ 59498.

_Βουλγαρία (19 φάκελοι, `1BWnRYQma72glaMzjTJtXvjl2KJrYJmqr`):_
CB 2998 EE `1v274JSFPz_pTqdUi7ajjMHzXBUpdxRRt` · CB 3001 EE `1ETCiOI5qkDsf7hr91hy0c193cqip_349` ·
CB 3006 EE `17NNJUPvcj6g7bRZGFXrMV_gPEVtwSToV` · CB 3002 EE `12Vq4vQiVUr8vYrjDSEH6f_2099_A0PoN` ·
E 9019EE `1PjOVr1rg8hQSl-aKHk6SiUnGjt9M7PaB` · CB 4406 EB `1Gt5q7HUR3mN-2qSArvopyrVs9Hba9S0G` ·
Ε 5811 ΕΕ `1GtwOClyOgGxNmWAkxiznQlaK501dSfqU` · Ε 5819 ΕΕ `1H5jbJNSeNJuIGp2xcVet77HabMvJCxFU` ·
Ε 9160 ΕΕ `1H2nu8c-KyM4SHjKFw0pI2ZVq4DHqX9jd` · E 9180 EE `1H5eT1Wc1kyiWSrpIv5qhw7BONntlCkcU` ·
Ε 4199 ΕΕ `1HCLcUHWKLYD2VY5wMh6CfQFYD1Aqe8S6` · E 9267 EE `1HBHzC7EsxnqWvWrlr_X-a3cWYOSCeI96` ·
Ε 4297 ΕΕ `1Gwj4n3v0Rkul8EK9w6HO38GBKlw-eVTa` · E 9263 EE `1HFC4uicj1IwdwROiDA1Fd_mvNoZJbNwV` ·
Ε 9066 ΕΕ `1HJFxo5QWHWK4G5hHf_bzCemjDs4Q8mNT` · Ε 8453 ΕΕ `1Gx_9EyztPZ2NSQDuAxmKhf8S5pMY0P7T` ·
Ε 5298 ΕΕ `1H5IL-reM8_DqbdICII9UBskD7li3mhpv` · Ε 3714 ΕΕ `1H9kokBg4mfDKnWi7WpHwM6RklZn7qeMy` ·
E 9166 EE `1Fnw7Hf5vbPk3TrvU6rb0AkCzW8LNWaqe`
— Οι «Ε xxxx ΕΕ» του κεντρικού ευρετηρίου Βουλγαρίας είναι ΕΔΩ (θάλαμοι/ρυμουλκούμενα, όχι τράκτορες).

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
