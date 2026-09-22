# part-a — Παραγγελίες / Weekly / Daily Ops (F-05..F-27, χωρίς ramp/pallet internals)

Ομάδα α, base SHA `549a2a4`. 187 nodes, 247 edges, 14 failure_modes, 9 cross_deps, 8 checks_existing, 6 gaps.
Πηγές: ανάγνωση κώδικα (όχι βάση, όχι δίκτυο) των owned αρχείων + `worker/migrations/013,018,020,023,028,030,031,033,037,045` +
σύγκριση με `02a`/`02b` (22/9). Κάθε γραμμή ελέγχθηκε με grep/read στο τρέχον `base SHA` — οι περισσότερες γραμμές
του `02a` ταίριαξαν σχεδόν byte-προς-byte (π.χ. `_syncVeroiaSwitch` στο `orders_intl.js:1229`, ίδια γραμμή).

## Τι επιβεβαιώθηκε ρητά (πέρα από το `02a`)

1. **`delete_order_cascade` (RPC)**: το `DELETE /v0/orders` **δεν** πάει στο απλό soft-delete (`handleFacadeDelete`) —
   δρομολογείται σε `handleOrderCascadeDelete` (`worker/src/index.js:4795`), που καλεί RPC `delete_order_cascade`
   (`worker/src/index.js:2873`). Το σώμα της συνάρτησης **δεν** είναι στο repo (ζει μόνο στη βάση) — μόνο το σχόλιο
   του migration `023` (γρ. 3-10) λέει τι σκουπίζει: stops, national orders/loads, groupage lines, consolidated
   loads, ramp, pallet ledgers. Η 8-βημάτων χειροκίνητη αλυσίδα του `deleteIntlOrder` (F-08) τρέχει **μετά** και
   ξανα-προσπαθεί να σβήσει ό,τι το RPC ήδη σκούπισε — πιθανή διπλή προσπάθεια (`FM-a-03`). Ό,τι το RPC **δεν**
   καλύπτει (RT σκέλη, PARTNER_ASSIGN) παραμένει γνήσια δουλειά του front end.
2. **`Assigned At` ΕΙΝΑΙ mapped** (`worker/src/index.js:1225` `assigned_at`) — διόρθωση στο `02a` F-14, που το
   ανέφερε ως πιθανό FUF.
3. **`local_moves` είναι ζωντανό** και πλήρως mapped (`worker/src/index.js:1698-1721`, όλα τα labels του
   `_wnSaveLocal` ταιριάζουν) — λύνει την «ασάφεια Α14» του `04` για το κομμάτι mapping (μένει η προϋπόθεση deploy:
   `db/migrations/2026-09-03_fixes.sql` πρέπει να έχει τρέξει για τη στήλη `legacy_id`).
4. **`Source Record` alias** στο NAT_LOADS (`worker/src/index.js:1629-1631`) επιβεβαιώθηκε ζωντανό — η `_syncVeroiaSwitch`
   γράφει/φιλτράρει σωστά.
5. **`Matched Import ID` και `Rotation ID` είναι scalar columns, όχι FK** (`worker/src/index.js:1204,1219`) —
   επιβεβαιώνει το «χωρίς σύνδεσμο βάσης» του `02a` F-16/F-18.

## Νέα ευρήματα (πέρα από `02a`/`02b`)

- **F-24 (Matched Load, εθνικά)**: δύο ανεξάρτητα `atSafePatch` (`weekly_natl.js:2129,2132`) χωρίς transaction ή
  αμοιβαιότητα στη βάση· το UI έχει ήδη ενοποιήσει αισιόδοξα τις δύο γραμμές πριν ολοκληρωθεί το δεύτερο write
  (`FM-a-09`) — δεν υπήρχε στο `02a`/`02b` σε αυτό το επίπεδο λεπτομέρειας.
- **F-26 asymmetry**: το `_opsStatFinal` (In Transit) **δεν** καλεί `syncOrderDownstream` καθόλου — μόνο
  `atSafePatch` + `paSyncStatus` (`modules/daily_ops.js:901-916`, επιβεβαιωμένο με ανάγνωση). Ένα VS export που
  περνά σε In Transit εξαρτάται αποκλειστικά από τον DB trigger `national_load_follow_order` για να ακολουθήσει
  το `national_loads` — το front end δεν το ελέγχει ποτέ (`FM-a-13`).
- **F-27 δύο δρόμοι**: `_opsChangeDayGo` περιμένει (`await`) το `syncOrderDownstream` και αναφέρει αποτυχία στο
  toast (το μοναδικό σημείο που το κάνει)· το γειτονικό `_opsSvF` (inline πεδίο) δεν καλεί sync **καθόλου** —
  ίδιος πίνακας, ίδια στήλες, διαφορετική συμπεριφορά ανάλογα με το ΠΩΣ έγινε η αλλαγή (`FM-a-12`).
- **RBAC λεπτομέρεια (ΑΝΑΚΛΗΘΗΚΕ από τον συνθέτη 22/9):** ο ισχυρισμός της ομάδας α για το `DELETE` παραγγελιών δεν επιβεβαιώθηκε από την πρωτογενή πηγή· η σωστή διαδρομή εξουσιοδότησης είναι ευαίσθητη και ζει στην ιδιωτική σημείωση S-1 προς τον συντονιστή (όχι σε δημόσιο repo).

## Failure modes — 5 πιο σημαντικά σιωπηλά

1. `FM-a-03` — διπλή προσπάθεια cascade delete (front end πάνω σε RPC) μπερδεύει το μέτρημα `_delFail`.
2. `FM-a-13` — F-26 In Transit δεν καλεί sync· εξαρτάται 100% από trigger υγείας που το front δεν ελέγχει.
3. `FM-a-04` — Ακύρωση (F-07) δεν αγγίζει ποτέ το RT (μόνο `changedFields:['Status']`).
4. `FM-a-09` — Matched Load (F-24) δύο μη-ατομικές γραφές, optimistic UI merge πριν ολοκληρωθούν.
5. `FM-a-12` — F-27 inline save (`_opsSvF`) χωρίς κανένα sync, ίδιος πίνακας με το `_opsChangeDayGo` που έχει.

## Ό,τι δεν επαληθεύτηκε (gaps, βλ. και `gaps[]` στο JSON)

Το σώμα του `delete_order_cascade` (μόνο DB, καμία πρόσβαση εδώ)· επιμέρους γραμμές μέσα σε `_wiDoSplit`,
`_wiRotAdd`, `_wiImpShift`, `_wiDoHandoverChange` (η ίδια η συνάρτηση επιβεβαιώθηκε, όχι κάθε εσωτερική κλήση —
`status: probable`)· ο trigger `trg_national_orders_soft_delete_cascade` (μόνο από `02b`)· F-28/F-29 (ramp) και
pallet-feed.js internals (ρητά εκτός ownership — μόνο τα cross_dep call-sites καταγράφηκαν).

## cross_deps (9)

Προς **β** (costs/payroll): `/costs/rt` κλήσεις από `rt-feed.js`, ramp-sync fire-and-forget με επίδραση στο RT
reopen (045). Προς **γ** (pallets): `/pallets/gate` bridge, `plOnDelivered`/`plOnIntlPartnerAssigned` call sites.
Προς **δ** (ramp): `_rampAutoSync` fire-and-forget από κάθε `syncOrderDownstream`, F-29 «Done» που γράφει πίσω σε
`orders`/`national_orders`/`national_loads`. Προς **ε** (auth/api/cache): όλα τα `ep:*` περνούν από
`core/api.js` (JWT/401/offline/cache/undo — δεν αγγίχτηκε εδώ)· gating σελίδων μέσω `core/router.js`+`core/auth.js`.

## Σημείωση μεθόδου

Οι γραμμές κώδικα σε `weekly_intl.js`/`weekly_natl.js` επιβεβαιώθηκαν στο επίπεδο ορισμού συνάρτησης (grep) και σε
αντιπροσωπευτικά δείγματα εσωτερικού περιεχομένου (π.χ. `_wiSaveFromPopover`, `_wnSaveFromPopover`,
`_wnSaveMatch`, `_wnSaveLocal` διαβάστηκαν πλήρως)· όπου δεν ανοίχτηκε κάθε εσωτερική γραμμή, το edge είναι
`status: "probable"` με σημείωση, όχι `confirmed` — σύμφωνα με τον κανόνα 2 του SCHEMA.
