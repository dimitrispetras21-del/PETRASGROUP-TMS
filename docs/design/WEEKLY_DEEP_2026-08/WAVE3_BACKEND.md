# Wave 3 — Backend βήματα (Supabase + Worker) · εγκρίθηκε 8/8 (Α + ΟΚ)

Ο frontend του Κύματος 3 είναι ήδη live και **ανθεκτικός**: όσο λείπουν τα
πεδία, η ομάδα groupage δουλεύει μόνο in-memory (με ρητό ⚠ μήνυμα) και τα
Opening Hours/Delivery Days απλώς δεν τυπώνονται. Μόλις μπουν τα παρακάτω,
όλα ενεργοποιούνται χωρίς άλλη αλλαγή frontend.

## 1. Supabase DDL (μία φορά, στο SQL editor)

```sql
ALTER TABLE orders    ADD COLUMN IF NOT EXISTS group_id      text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS opening_hours text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS delivery_days text;
```

## 2. Worker facade map (repo petras-tms-backend, `src/lib/facade-tables.js`)

- Στο block του **ORDERS** (`tblgHlNmLBH3JTdIM`), στα `fields`:
  `"Group ID": "group_id",`
- Στο block των **LOCATIONS** (`tblxu8DRfTQOFRCzS`), στα `fields`:
  `"Opening Hours": "opening_hours",`
  `"Delivery Days": "delivery_days",`

Deploy τον Worker. Τίποτα άλλο.

## 3. Μετά την ενεργοποίηση

- Δοκιμή: Weekly International → δεξί κλικ → Group with → **Ανανέωση** → η
  ομάδα πρέπει να ξαναχτιστεί (×N badge + κουμπί «⎙ ομάδα ×N»).
- Γέμισμα Opening Hours/Delivery Days ΜΟΝΟ στις τακτικές τοποθεσίες (λίστα
  συχνών W15-22 από τον auditor — ζητήθηκε να ΜΗΝ μπει σε public repo).
- Follow-up (μικρό): προσθήκη των 2 πεδίων στη φόρμα της σελίδας Locations
  (`modules/locations.js` — fetch `:505` + φόρμα) ώστε να γεμίζουν από το UI.
