# Pre-Mortem: COSTS feature group (TRIP PnL + Καταχώρηση Κόστους + Partner PnL)

_Ημερομηνία: 2026-07-11. Μέθοδος: pre-mortem (Tigers / Paper Tigers / Elephants).
Σενάριο: το COSTS launch-άρει στο Stage-2 Postgres και **αποτυγχάνει σε 6 μήνες** —
κανείς δεν εμπιστεύεται τα margins, η καταχώρηση έχει μείνει πίσω, η σελίδα
εγκαταλείπεται. Δουλεύουμε ανάποδα: τι πήγε στραβά;_

_Βάση ανάλυσης: `TRIP_COSTS_SPEC.md` + `TRIP_COSTS_NOTES.md` (κλειδωμένα
2026-07-05) + νέες κατευθύνσεις owner 2026-07-11 (Trip PnL = μόνο δρομολόγια ·
πιθανή σελίδα Partner PnL · όλα κάτω από κατηγορία COSTS). **Εκκρεμεί** το νέο
direction doc της construction team — όπου επηρεάζει, σημειώνεται._

---

## 🐯 TIGERS — πραγματικοί κίνδυνοι (απαιτούν δράση)

### T1 — Το Round Trip lifecycle δεν έχει state machine _(Launch-blocking)_
Το spec ορίζει την οντότητα, όχι τον **κύκλο ζωής** της. Ποιος/τι:
δημιουργεί το round trip (ΟΚ — planners), το **κλείνει** (completed), ενημερώνει
τις **πραγματικές** ημερομηνίες, το ακυρώνει, το διορθώνει σε truck swap
(βλάβη στο δρόμο, αλλαγή τράκτορα μεσοδρομίς); Χωρίς αυτά το allocation engine
δεν έχει αξιόπιστα παράθυρα και το unallocated bucket φουσκώνει μέχρι παραίτησης.
**Και τα δύο audits το είπαν #1 fragility (sync surface).**

### T2 — Planned vs actual dates: το allocation key είναι λάθος by default _(Launch-blocking)_
Το κλειδί κατανομής είναι (πινακίδα + date window), αλλά τα παράθυρα γεννιούνται
στους planners = **προγραμματισμένες** ημερομηνίες. Στην πράξη: αναχώρηση με μια
μέρα καθυστέρηση, ανεφοδιασμός τη «νεκρή» μέρα μεταξύ δύο trips, δύο trips ίδιου
φορτηγού που μοιράζονται μέρα (άφιξη πρωί / αναχώρηση απόγευμα). Αν δεν
καταγράφονται **actual start/end** (από κάποιον — βλ. blind spot U1), η
λάθος-κατανομή είναι **συστημική**, όχι edge case. Το GPS (MyGeotab) το λύνει
οριστικά, αλλά είναι «later» — μέχρι τότε χρειάζεται ρητή διαδικασία.

### T3 — Δεν υπάρχει process owner για τη χειροκίνητη καταχώρηση _(Launch-blocking — process, όχι κώδικας)_
Driver pay, Έξοδα Μ, λοιπά, ferry, πρόστιμα, external fuel, **km** = manual.
Το spec λέει «Αλεξία», αλλά όχι: **πότε** (εβδομαδιαίο τελετουργικό;), από **ποια
παραστατικά**, και τι την **αναγκάζει** να ολοκληρώσει (π.χ. trip completed →
checklist εκκρεμών κοστών). Χωρίς workflow-trigger, το cost-complete % μένει
χαμηλό, όλα τα margins μένουν «Προσωρινά», ο owner σταματά να κοιτάει τη σελίδα.
**Το feature πεθαίνει από process, όχι από schema.**

### T4 — Ο κανόνας «Πλήρες» (cost-complete) δεν είναι ορισμένος _(Launch-blocking)_
Το badge Προσωρινό/Πλήρες προϋποθέτει ότι το σύστημα **ξέρει** πότε έφτασαν όλα
τα κόστη ενός trip. DKV = 15ήμερο, DADI = εβδομαδιαίο, Spedition = μηνιαίο:
ένα trip είναι «Πλήρες» μόνο όταν (α) έχουν εισαχθεί όλα τα περιοδικά τιμολόγια
που **καλύπτουν το παράθυρό του** (άρα πρέπει να καταγράφεται η περίοδος κάλυψης
κάθε invoice ανά πηγή) και (β) έχει τσεκαριστεί το manual checklist. Χρειάζεται
ρητός αλγόριθμος, αλλιώς το badge είναι εικασία.

### T5 — «Ποιο ποσό» μετράει ένα cost line; (VAT/net/gross) _(Launch-blocking — ορισμός, μία απόφαση)_
Τα DKV invoices έχουν multi-currency γραμμές, μετατροπές σε EUR, reverse-charge,
και **γραμμές επιστροφής ΦΠΑ**. Ο parser πρέπει να αποφασίσει από την πρώτη μέρα:
κόστος = μικτό (με ξένο ΦΠΑ), καθαρό, ή EUR-ποσό τιμολογίου; Η διαφορά αλλάζει
το margin έως ~20% σε διόδια/καύσιμα ορισμένων χωρών. Το «VAT recovery out of
v1» είναι σωστό ως **feature**, αλλά ο **ορισμός του ποσού** δεν αναβάλλεται —
κρίνεται στη σχεδίαση του parser. Μία απόφαση, τεράστια συνέπεια.

### T6 — Migration sequencing: το COSTS εξαρτάται από planners + orders _(Launch-blocking — απόφαση αλληλουχίας)_
Τα round trips **γεννιούνται στους planners** και το revenue έρχεται από
`Orders.Price`. Άρα το COSTS **δεν μπορεί** να χτιστεί στο Postgres πριν
μεταναστεύσουν orders + weekly planners — αλλιώς χρειάζεται Airtable↔Postgres
bridge (κρυφό, μεγάλο scope, διπλή πηγή αλήθειας). Η σειρά μετάβασης πρέπει να
κλειδωθεί με την construction team **πριν** γραφτεί κώδικας COSTS.
_(Εδώ θα βαρύνει το νέο direction doc.)_

### T7 — Plate matching: υποτιμημένο _(Fast-follow, με launch-blocking σπόρο)_
Alias table προβλέπεται (spec §11.5), αλλά: OCR παραλλαγές, βουλγάρικες
πινακίδες, **γραμμές που αναφέρουν τρέιλερ αντί για τράκτορα** (P61335 στο
Trivium παράδειγμα), αντικαταστάσεις/ενοικιαζόμενα. Day-1 πρέπει να υπάρχουν:
alias πίνακας + review queue + alert όταν άγνωστη πινακίδα εμφανίζεται
επανειλημμένα. Η τελειοποίηση είναι fast-follow.

### T8 — Roles/RLS: τα κόστη είναι τα πιο ευαίσθητα δεδομένα της εταιρείας _(Launch-blocking)_
Έξοδα Μ (αδικαιολόγητα μετρητά), driver pay, margins ανά πελάτη. Στο τωρινό TMS
ο έλεγχος ρόλων είναι client-side. Στο Postgres/Supabase πρέπει να είναι **RLS
στη βάση**, όχι στο UI: Owner+Accountant γράφουν, Owner+Management διαβάζουν,
dispatchers **τίποτα**. Αν οδηγοί/υπάλληλοι δουν margins ή τα Έξοδα Μ άλλων,
η ζημιά είναι επιχειρησιακή, όχι τεχνική.

### T9 — Duplicate/correction invoices → διπλά κόστη _(Fast-follow)_
Το ίδιο DKV zip ανεβαίνει δύο φορές → διπλό κόστος σιωπηλά. Credit notes /
διορθωτικά με **αρνητικά ποσά** πρέπει να ρέουν μέσα από το allocation (μειώνουν
κόστος) — οι parsers συχνά σπάνε εκεί. Χρειάζεται: unique invoice number +
idempotent import + υποστήριξη αρνητικών γραμμών.

---

## 🐅 PAPER TIGERS — φαίνονται τρομακτικά, δεν είναι

| # | Ανησυχία | Γιατί όχι |
|---|----------|-----------|
| P1 | Spedition auto-allocation | €60/μήνα (Trivium). Σωστά deferred· manual. |
| P2 | Accommodation pipeline | Σπάνιο· manual αρκεί (κλειδωμένο). |
| P3 | Airtable rate limits/όγκος | Αδιάφορο — το build είναι Postgres. |
| P4 | 15-χωρο toll grid από μέρα 1 | Το DKV parsing δίνει χώρα ανά γραμμή έτσι κι αλλιώς· το grid είναι View, όχι input. Nice-to-have. |
| P5 | «Χωρίς GPS δεν γίνεται» | Γίνεται — με actual dates + manual km, αρκεί να έχουν owner (βλ. T2/U3). Το GPS αναβαθμίζει, δεν ξεμπλοκάρει. |
| P6 | Fixed-cost allocation | Σωστά Tier-2· το πεδίο υπάρχει, μηδενικό. |

---

## 🐘 ELEPHANTS — αυτά που δεν συζητιούνται αρκετά

### E1 — Η Αλεξία έχει ερωτηθεί;
Όλο το capture βάρος πέφτει σε έναν άνθρωπο. Χωρητικότητα, εκπαίδευση, δικό της
input στη φόρμα (τη σχεδιάζουμε ΓΙΑ εκείνη). Αν δεν συν-σχεδιαστεί το Mode B με
τον χρήστη του, θα χρησιμοποιεί Excel δίπλα. → **Δράση: 1 ώρα walkthrough του
mockup με την Αλεξία πριν το build.**

### E2 — Το groupage «merge orders → one leg» είναι requirement των planners, κανείς δεν το έχει αναλάβει
Χωρίς αυτό, δεν φτιάχνονται σωστά groupage round trips → κενό στα δεδομένα από
μέρα 1. Πρέπει να μπει ρητά στο scope των planner αλλαγών στη μετάβαση.

### E3 — Knowledge transfer στη νέα construction team
Το spec προϋποθέτει βαθύ context: Veroia Switch, ΑΝΟΔΟΣ/ΚΑΘΟΔΟΣ, δύο νομικές
οντότητες, δύο brands, «Έξοδα Μ». Χωρίς glossary + handoff session, θα χτίσουν
κάτι σωστό-τεχνικά και λάθος-επιχειρησιακά. → glossary doc + 1 session.

### E4 — Ποιότητα του `Orders.Price`
Το revenue **δεν** πληκτρολογείται — έρχεται από το Price της παραγγελίας. Αν οι
dispatchers αφήνουν Price κενό/λάθος, το margin είναι λάθος με αέρα αξιοπιστίας.
Χρειάζεται gate: trip δεν γίνεται «Πλήρες» αν λείπει Price σε linked order.

### E5 — Διάσταση νομικής οντότητας στο revenue
Στα κόστη κρατάμε `source_entity` (VERMION/EUROFRESH). Στο revenue; Ποια
οντότητα τιμολογεί τον πελάτη ανά order; Αν χρειάζεται ποτέ PnL ανά οντότητα
(λογιστήριο/φοροτεχνικά), η διάσταση πρέπει να υπάρχει και στις δύο πλευρές.

### E6 — Partner PnL: agreed rate ή invoiced amount;
Νέα ιδέα owner (2026-07-11): σελίδα «Partner Tracks PnL». Ανοιχτό: το κόστος
partner = το συμφωνημένο Partner Rate (auto από order) ή το **πραγματικό
τιμολόγιο** του partner (που μπορεί να έχει extra: αναμονές, πρόστιμα);
Αν το δεύτερο → νέο input pipeline (partner invoices) που δεν υπάρχει στο spec.
Επίσης IA: στα NOTES §8 το owned-vs-partner ήταν **lens** στο ίδιο dataset,
όχι ξεχωριστή σελίδα — θέλει απόφαση.

### E7 — Trips χωρίς παραγγελίες (repositioning / κενά δρομολόγια)
Φορτηγό μετακινείται άδειο για να πιάσει φορτίο αλλού: κανένα order, μηδέν
revenue, υπαρκτά κόστη. Το μοντέλο (legs → orders) δεν το προβλέπει. Πού πάνε
αυτά τα κόστη; (Πρόταση: round trip με 0 legs, revenue €0 — ίδια λογική με solo.)

### E8 — Οδηγοί: αλλαγή/διπλός οδηγός μεσοδρομίς
Ένα trip, δύο οδηγοί (relay ή double-manning): το driver_pay και το «ποιος
οδηγούσε» για anomaly checks σπάει το 1-trip-1-driver. Σπάνιο; Επιβεβαίωσε.

### E9 — Κριτήρια επιτυχίας του ίδιου του feature
Πότε λέμε «δουλεύει»; Πρόταση: ≥90% των trips «Πλήρη» εντός 21 ημερών ·
unallocated < 5% των γραμμών/μήνα · ο owner κοιτάει τη σελίδα κάθε εβδομάδα.
Χωρίς μετρήσιμο στόχο, δεν θα ξέρουμε αν απέτυχε — θα το νιώσουμε απλώς.

### E10 — Αναθεώρηση του X
Το X (VS transfer price) είναι fixed € σε settings. Ποιος/πότε το αναθεωρεί
(καύσιμα ακριβαίνουν → το εθνικό σκέλος δείχνει τεχνητά κερδοφόρο/ζημιογόνο);
Πρόταση: ετήσιο review, logged αλλαγή με ημερομηνία ισχύος (όχι αναδρομική).

### E11 — Πολιτική ιστορικού (cut-over)
Backfill παλιών trips ή καθαρή αφετηρία από μια εβδομάδα-ορόσημο; Το backfill
τρώει εβδομάδες και θα είναι ελλιπές· η καθαρή αφετηρία σημαίνει «trend από το
μηδέν». Απόφαση owner, όχι ομάδας.

---

## 🎯 Action plans — Launch-Blocking Tigers

| Risk | Mitigation | Owner | Πότε |
|------|-----------|-------|------|
| T1 Round-trip lifecycle | Γράψε state machine (created→in-progress→completed→locked, + truck-swap/cancel) ως §-προσθήκη στο spec | Δημήτρης + Claude (spec) | πριν το handoff |
| T2 Actual dates | Αποφάσισε ποιος καταχωρεί actual start/end (dispatcher στο κλείσιμο trip;) και βάλ' το στο UI spec· GPS later = upgrade | Δημήτρης | πριν το handoff |
| T3 Manual-entry process | Όρισε εβδομαδιαίο ritual Αλεξίας + trip-completion checklist στο Mode B | Δημήτρης + Αλεξία | πριν το build |
| T4 Cost-complete rule | Πρόσθεσε στο spec: invoice coverage periods ανά πηγή + checklist ⇒ badge | Claude (spec) | με το νέο direction |
| T5 Ποσό γραμμής (VAT) | Μία απόφαση: κόστος = EUR ποσό τιμολογίου (gross, όπως χρεώνεται) — ή net; Γράψε το στον parser spec | Δημήτρης (με λογιστή) | πριν τον parser |
| T6 Migration sequencing | Κλείδωσε σειρά: orders+planners → round trips → COSTS. Όχι bridge. Επιβεβαίωσε με construction team | Δημήτρης + team | στο επόμενο direction doc |
| T8 RLS | Requirement στο direction doc: DB-level RLS για όλα τα cost tables, όχι UI-only | Construction team | αρχιτεκτονική φάση |

---

## 🕳️ Unknown unknowns — τα blind spots του τωρινού πλάνου (σύνοψη)

Ο owner πιστεύει ότι «έχουμε κατηγοριοποιήσει όλα τα έξοδα και το input τους».
**Σωστό για τις κατηγορίες** — το μοντέλο κατηγοριών είναι πλήρες και verified σε
πραγματικά τιμολόγια. Τα κενά δεν είναι στις κατηγορίες· είναι στα **γεγονότα
και τους ανθρώπους γύρω τους**:

1. **Actual ημερομηνίες trip** — κανείς δεν έχει οριστεί να τις καταγράφει (T2).
2. **Κλείσιμο trip** — δεν υπάρχει το event «ολοκληρώθηκε» (T1).
3. **km ανά trip** — manual, χωρίς owner· από αυτό κρέμονται €/km, κατανάλωση, και ΟΛΟΚΛΗΡΗ η κατηγορία «φθορά/λάστιχα» (Shape D = rate × km).
4. **Ορισμός ποσού** (net/gross/EUR) ανά πηγή (T5).
5. **Ποιος ανεβάζει τα τιμολόγια** — το «scan» έχει χρήστη και συχνότητα; Email-ingestion αυτοματισμός;
6. **Αρνητικές γραμμές / πιστωτικά / διπλο-uploads** (T9).
7. **Έξοδα Μ ως προκαταβολή ή ως έξοδο;** — δίνονται μετρητά στον οδηγό πριν το trip και εκκαθαρίζονται, ή τυπώνεται σύνολο μετά; Αλλάζει το UI και τη λογιστική εικόνα.
8. **Repositioning trips** χωρίς orders (E7).
9. **Partner PnL: rate ή invoice** (E6).
10. **Entity διάσταση στο revenue** (E5).

---

## 📝 Για το επόμενο prompt σου στην construction team

Αν απαντήσεις/συμπεριλάβεις αυτά, το prompt γίνεται πλήρες:

1. Στείλε το **νέο direction doc** (αρχιτεκτονική Stage-2, stack, χρονοδιάγραμμα) — όλα τα T6 ζητήματα κρέμονται από αυτό.
2. **Σειρά μετάβασης** modules (orders/planners πρώτα;) και αν θα υπάρξει περίοδος διπλής λειτουργίας.
3. **Round-trip lifecycle**: ποιος κλείνει το trip, ποιος γράφει actual dates.
4. **Ονόματα process owners**: ποιος ανεβάζει DKV/DADI, ποιος καταχωρεί manual κόστη, πότε.
5. **Ορισμός κόστους** (EUR ποσό τιμολογίου gross ή net ΦΠΑ) — μία γραμμή, με τον λογιστή.
6. **Cut-over date** ιστορικού (backfill ή όχι).
7. **Τιμή X** + κανόνας αναθεώρησης.
8. **Partner PnL scope**: agreed rate μόνο (v1) ή και partner invoices (v2);
9. **IA του COSTS menu**: TRIP PnL · Καταχώρηση Κόστους · Partner PnL(;) · Consumption(;) — τι μπαίνει v1.
10. **Success criteria** (πρόταση στο E9) ώστε η ομάδα να ξέρει τι βελτιστοποιεί.

---

_Αρχείο αποφάσεων αυτής της ανάλυσης: `docs/TRIP_COSTS_DECISION_LOG.md`._
