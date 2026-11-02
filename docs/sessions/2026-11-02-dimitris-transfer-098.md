# 2026-11-02 · dimitris · Μεταφόρτωση σε οποιοδήποτε σημείο: 098 (στάση μεταφόρτωσης και κανόνες)

- **Άλλαξε:** προσχέδιο 098 (`worker/migrations/drafts/098_plan_transfer_point*.sql`, 5 αρχεία + `build-098.mjs`): 4 στήλες στο `rt_stops` και 5 συναρτήσεις από το ζωντανό κείμενο με φρουρό md5. Δεν ανοίγει τίποτα μόνο του, γιατί καμία πράξη δεν γράφει ακόμη μεταφόρτωση (099).
- **Μετρήθηκε:** SELECT στην παραγωγή 2/11, μετά την 097: τα 6 md5 και η όψη ίδια με το αντίγραφο· 126 στάσεις, καμία τιμή μεταφόρτωσης.
- **Αποφασίστηκε:** η μεταφόρτωση ενώνει ακριβείς στάσεις, όχι τόπους· ο τόπος του σημείου-κειμένου πάει στο 099 (`docs/DECISION_LOG.md` 2/11).
- **Απόδειξη:** PGlite `tms-auditor/test/plan-098.test.mjs` 15/15 (NO-GO στα ζωντανά, GO για εθνική και VS, αρνήσεις, σπάσιμο, επαναφορά)· `tests/sql-098-drafts.test.js` 5/5.
- **Μένει:** ο owner τρέχει dry run → 098 → verify μετά τις 15:00· το 099 ξεκινά μετά την εκτέλεση της 098, με go του συντονιστή.
- **Εκτελέστηκε 2/11 (owner, μετά τις 15:00):** dry run → `098 ran: leg 2f70aa1b…, shipment 6afcc505…, split f1993aeb…, rt_update 2ed8efd0…, carriers 59be1a67…, transfer columns 4`· 098 → `2f70aa1b…, 4`· verify → `098 in place`, changed_texts 0, transfer_columns 4, transfer_stops 0, linked_stops 0, waiting_at_point 0, shipments_refused 0, b54_matches true. Τα 5 αρχεία βγήκαν από το `drafts/` (κανόνας 5).
