# Επόμενη δουλειά — τεχνικά χαρακτηριστικά στόλου

_Χάρτης κενών, κατάσταση βάσης 2026-08-05. Η επόμενη συνεδρία ξεκινά ΑΠΟ ΕΔΩ._

## Στόχος
Συμπλήρωση των πεδίων **euro_standard, year, tare_weight_kg** (trucks) και
**brand, model, year** (trailers) με ΠΡΑΓΜΑΤΙΚΑ δεδομένα από τις άδειες
κυκλοφορίας στο Drive. Τα πεδία υπάρχουν ήδη στη βάση ΚΑΙ στο mapping του
Worker 2 (deploy 4-8-2026) — δεν χρειάζεται καμία αλλαγή σχήματος/κώδικα.

## Χάρτης κενών (από τη βάση)

| Πίνακας | Πεδίο | Κενά |
|---|---|---|
| trucks (36) | brand | 0 ✅ |
| trucks | model | 6 |
| trucks | euro_standard | **24** |
| trucks | year | **25** |
| trucks | tare_weight_kg | **34** |
| trailers (40) | brand | **39** |
| trailers | model | **40** |
| trailers | year | **36** |
| trailers | trailer_type | 0 ✅ |

**Trucks χωρίς year:** CB1286KE EKA7481 HMM6272 HMP1421 IAA6166 IAB1096 IAB1099
IAB2102 IAB2103 IAB2106 IAB2107 IAB2108 IAB2109 IAB4162 IAZ4445 IAZ5561 IAZ5562
IAZ7244 IAZ7245 IAZ8302 IZN1725 NKN5245 NXA9624 NXA9647 YTO3803

**Trucks χωρίς euro:** τα ίδια + CB5871TT, IAB4166 (πλην IAB2106/2109 που έχουν)

## Πηγή δεδομένων — ΤΙ ΛΕΙΠΕΙ ΚΑΙ ΓΙΑΤΙ
Το `FLEET-DOCS-2026-08-03.md` ΔΕΝ έχει αυτά τα στοιχεία για τα περισσότερα
οχήματα: η καταγραφή 3-4/8 διάβασε **ονόματα αρχείων** (ημερομηνίες λήξης) και
μόνο επιλεκτικά το περιεχόμενο των αδειών (κυρίως τα βουλγάρικα).

**Άρα η επόμενη συνεδρία πρέπει να διαβάσει το ΠΕΡΙΕΧΟΜΕΝΟ των αδειών:**
- Πεδίο (B) = 1η ταξινόμηση → `year`
- Πεδίο (V.9) = EURO → `euro_standard` (μορφή UI: «Euro 6»)
- Πεδίο (G) = απόβαρο kg → `tare_weight_kg`
- Πεδία (D.1)/(D.3) = μάρκα/μοντέλο → `brand`/`model` (κυρίως trailers)

Τα folder IDs ανά όχημα είναι έτοιμα στο `HANDOFF.md`. Το αρχείο λέγεται
συνήθως «Άδεια κυκλοφορίας.pdf» ή «Άδεια μεγάλη/μικρή».

## Μέθοδος που δούλεψε (κράτησέ την)
1. `read_file_content` στην άδεια κάθε οχήματος (~76 αρχεία → παρτίδες 10)
2. Καταγραφή στο FLEET-DOCS + commit ανά παρτίδα
3. Γράψιμο στη βάση με το `step3_run.py` μοτίβο: **dry-run → έγκριση → apply →
   επανάληψη dry-run για idempotency**
4. Credentials: `.env.local` (SUPABASE_URL/SERVICE_KEY, gitignored)

⚠️ Οι άδειες είναι σκαναρισμένα PDF — το OCR βγάζει «θόρυβο». Ό,τι δεν
διαβάζεται καθαρά ΔΕΝ μαντεύεται: μένει κενό και καταγράφεται.

## Εκκρεμότητα από 4-8-2026
Το mapping του Worker 2 μπήκε από το dashboard. **Αν ο satsilem κάνει deploy από
το δικό του source, οι 7 γραμμές χάνονται.** Πρέπει να τις περάσει στο repo του
(TRUCKS: euro_standard/year/tare_weight_kg · TRAILERS: brand/model/year/trailer_type).
