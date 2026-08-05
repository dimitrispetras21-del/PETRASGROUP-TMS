# Snapshot του deployed Worker 2 — γιατί υπάρχει εδώ

`petras-tms-backend-staging-2026-08-05.js` είναι **ακριβές αντίγραφο του κώδικα
που έτρεχε στο Cloudflare** στις 5-8-2026 (ανάπτυξη 15:05 UTC), κατεβασμένο με
το CF API. Δεν είναι πηγαίος κώδικας και **δεν γίνεται build/deploy από εδώ.**

## Το πρόβλημα που τεκμηριώνει

Ιστορικό αναπτύξεων του `petras-tms-backend-staging` (5-8-2026):

| Ημερομηνία | Πηγή | Από |
|---|---|---|
| 5-8 15:05 · 11:59 · 11:14 · 09:18 | **dash** (χειροκίνητα στον editor) | dimitrispetras21@gmail.com |
| 3-8 09:26 · 09:21 | **wrangler** (πηγαίος κώδικας) | satsilem@gmail.com |

Η τελευταία ανάπτυξη **από repo** έγινε 3-8-2026. Ό,τι προστέθηκε μετά ζει
**μόνο στο deployed αντίγραφο**. Το επόμενο `wrangler deploy` από τον πηγαίο
κώδικα του satsilem τα σβήνει.

Ότι οι γραμμές μπήκαν χειροκίνητα φαίνεται από τη στοίχιση μέσα στο αρχείο:
`"VIN": "vin"` υπερ-στοιχισμένο, `"Year"` / `"Tare Weight kg"` χωρίς στοίχιση.

## Τι ΠΡΕΠΕΙ να περάσει στον πηγαίο κώδικα (TABLE_MAP)

```js
tblEAPExIAjiA3asD: {                    // TRUCKS
  name: "TRUCKS", pg: "trucks",
  fields: {
    "License Plate": "license_plate",
    "VIN": "vin",
    Brand: "brand",
    Model: "model",
    Active: "active",
    "KTEO Expiry": "kteo_expiry",
    "KEK Expiry": "kek_expiry",
    "Insurance Expiry": "insurance_expiry",
    "Insurance Partner": "insurance_partner",
    "Euro Standard": "euro_standard",
    "Year": "year",
    "Tare Weight kg": "tare_weight_kg",
    Notes: "notes"
  }
},
tblDcrqRJXzPrtYLm: {                    // TRAILERS
  name: "TRAILERS", pg: "trailers",
  fields: {
    "License Plate": "license_plate",
    "VIN": "vin",
    Active: "active",
    "KTEO Expiry": "kteo_expiry",
    "Insurance Expiry": "insurance_expiry",
    "FRC Expiry": "frc_expiry",
    "Brand": "brand",
    "Model": "model",
    "Year": "year",
    "Trailer Type": "trailer_type",
    "Tare Weight kg": "tare_weight_kg",
    Notes: "notes"
  }
},
```

Χωρίς αυτά, τα στοιχεία ταυτότητας στόλου (μάρκα/μοντέλο/έτος/VIN/απόβαρο)
υπάρχουν στη βάση αλλά **δεν φτάνουν ποτέ στο UI**.

## Πώς ξανακατεβαίνει το τρέχον deployed script

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/scripts/petras-tms-backend-staging" -H "Authorization: Bearer $CF_API_TOKEN" -o worker.js
```

⚠️ Το CF API επιστρέφει **μόνο metadata** για παλιότερες εκδόσεις (όχι σώμα),
οπότε δεν γίνεται diff με την έκδοση της 3-8 — δεν ξέρουμε τι *άλλο* πέρα από
τα mappings μπήκε χειροκίνητα. Γι' αυτό κρατάμε αυτό το snapshot.
