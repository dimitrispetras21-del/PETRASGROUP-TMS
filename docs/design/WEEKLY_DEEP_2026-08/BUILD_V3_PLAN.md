# BUILD v3 — Weekly International (εγκεκριμένο πρωτότυπο v3.1 → πραγματική σελίδα)

Εντολή owner 8/8 βράδυ: «πάμε να χτίσουμε το Weekly International».
Branch: `feat/weekly-v3-ui` → Φάσεις Β/Γ σε δικά τους branches.
Rollout όρος: μικρά PRs, live verify στην τρέχουσα, revert-first.

## Φάση Α — v3.1 οπτικό κέλυφος (ΑΥΤΟ το PR)
Μόνο render layer του `modules/weekly_intl.js` + νέο scoped CSS `.wk3-*`
(ΔΕΝ αγγίζονται τα κοινά `wi-*` — τα χρησιμοποιεί το Weekly National).
Η λειτουργικότητα από κάτω ΑΘΙΚΤΗ: popover ανάθεσης, drag ταίριασμα,
δεξί κλικ groupage, saves/locks/PA/VS sync, sync ⟳/✓/⚠, quiet mode.

1. Sheet tabs εβδομάδων (αντικαθιστούν τη λωρίδα ±3) + badge φάσης.
2. Tally μία γραμμή (αντικαθιστά Command Center + διπλά chips): ✨(Φάση Β
   placeholder μετρητής εκκρεμών-με-διαθέσιμους), εξαγ/εισαγ/εκκρεμή/κενά
   ως κλικ→scroll. Search+φίλτρο σε λεπτή 2η γραμμή (η πραγματική σελίδα
   τα χρειάζεται — το mock όχι). fetchPreviousWeekStats/on-time: φεύγουν
   από intl (το tally δεν τα έχει — Π5β ήδη τα έκρυβε).
3. Γραμμές 34px μονόγραμμες: ημ. ΦΟΡΤΩΣΗΣ μπροστά από τον τόπο, ΧΩΡΙΣ
   παράδοση (τη λέει η μέρα-ομάδα), meta = παλέτες+badges δεξιά tabular.
4. Κόκκινα πεδία = κενά: import-cell κόκκινο σε own χωρίς import (κλικ →
   highlight αδιάθετων I-rows), ΚΑΙ παραμένει drop target για drag.
   Un pill: κενό dashed κόκκινο (χωρίς λέξεις). ΜΑΤΑΙΩΘΗΚΕ αργότερα (δεν
   υπάρχει status ακύρωσης στα ORDERS ακόμη — Φάση Β ερώτημα).
5. Day headers τυπογραφικοί + ΣΗΜΕΡΑ accent + ζέβρωμα ανά μέρα + ράγα
   αριθμών + I# αρίθμηση (υπάρχει). Sticky: tabs/cols/days.
6. ⎙ ανά γραμμή → υπάρχον `printOrderSheet` (ήδη λειτουργικό).
7. VS route: «ld/8 · Vermion Fresh Cross-Dock VS → …» όταν Veroia Switch.

## Φάση Β — λειτουργικά (επόμενο PR, μετά live verify Α)
✨ προτάσεις με ✓ (default: πρώτα δικός στόλος — διαθέσιμος οδηγός κατά
Χ+2 + φορτηγό χωρίς ανάθεση στο διάστημα· ο owner δεν όρισε αλλιώς) ·
πάνελ ΟΔΗΓΟΙ·561/2006 (Χ+2, ⚡Χ+1 ένδειξη) · δεξί κλικ import → μεταφορά
εβδομάδας (⛔ διευκρίνιση: shift ημερομηνιών ±7 ή άλλο πεδίο;) ·
κατάσταση ΜΑΤΑΙΩΘΗΚΕ (⛔ πεδίο/τιμή Status;).

## Φάση Γ — 5-στηλο feeds + λοιπά (μετά τη Β)
Στήλες ΠΡΟΣ/ΑΠΟ ΒΕΡΟΙΑ από NAT_LOADS (join μέσω VS σύνδεσης/Source
Record) · dark mode (απόφαση: όλο το app ή μόνο εδώ;) · ρόλος αποθήκης
χωρίς κόμιστρα (can() checks) · Weekly National v3 (κανόνας Β7 — με ό,τι
μάθαμε εδώ).

## Εκκρεμότητες εκτός σελίδας
Worker deploy (Group ID/Opening Hours/Delivery Days) — έτοιμο στο
~/Downloads/worker-wave3-index.js, το τρέχει ο owner.
