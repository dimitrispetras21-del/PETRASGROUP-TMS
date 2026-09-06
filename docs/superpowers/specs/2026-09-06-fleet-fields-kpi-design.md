# Στόλος: ταχογράφος, επόμενη συντήρηση, χώρα, κάρτες KPI — σχέδιο & πλάνο (owner 6/9/2026, εγκρίθηκε 20:05)

## Γιατί
Το audit 6/9 βρήκε ότι η Συντήρηση ζητά πέντε πεδία που δεν υπάρχουν ως στήλες (`Tachograph Expiry`,
`ADR Expiry`, `Next Maintenance Date`, `Pallet Capacity`, `ATP Expiry`) — οι στήλες τους στην οθόνη είναι
μόνιμα κενές. Owner: «κρατάμε tachograph_expiry και next_maintenance, μόνο σε φορτηγά, είναι πολύ σημαντικά·
εθνικότητα σε φορτηγά/ρυμούλκες με ταξινόμηση· μεγάλες κάρτες KPI, π.χ. ηλικία στόλου».

## Global constraints
- Γλώσσα οθόνης ελληνικά, σχόλια κώδικα αγγλικά. Λιγότερες λέξεις, μία λέξη ανά έννοια στην κεφαλίδα.
- Κάθε νέο label περνά από τον χάρτη `TABLES` του Worker για τον συγκεκριμένο πίνακα (silent-drop trap).
- Supabase = SELECT μόνο· η migration ΕΚΤΕΛΕΙΤΑΙ μόνο με ρητό ναι του owner (μαζί με 016 + deploy).
- Μετά από αλλαγή αρχείου front end: bump `?v=` στο app.html ΚΑΙ `SW_VERSION` στο sw.js με το ίδιο TIMESTAMP.
- Κανένα άλλο πεδίο/feature πέρα από τα παρακάτω.

## Βάση — `worker/migrations/017_fleet.sql` (ΔΕΝ εκτελείται σε αυτό το πλάνο)
```sql
begin;
alter table trucks   add column if not exists tachograph_expiry date;
alter table trucks   add column if not exists next_maintenance  date;
alter table trucks   add column if not exists country text;
alter table trailers add column if not exists country text;
alter table trucks   drop constraint if exists trucks_country_iso2;
alter table trucks   add constraint trucks_country_iso2   check (country is null or country ~ '^[A-Z]{2}$');
alter table trailers drop constraint if exists trailers_country_iso2;
alter table trailers add constraint trailers_country_iso2 check (country is null or country ~ '^[A-Z]{2}$');
-- Prefill from plate shape (owner 6/9): GR trucks ΑΒΓ1234 (3 letters+4 digits), GR trailers Ρ12345 (P+5 digits),
-- BG plates 1-2 letters + 4 digits + 2 letters (CB0138HO, E3714EE). Anything else stays NULL for the owner.
update trucks   set country='GR' where country is null and deleted_at is null and license_plate ~ '^[A-Z]{3}[0-9]{4}$';
update trucks   set country='BG' where country is null and deleted_at is null and license_plate ~ '^[A-Z]{1,2}[0-9]{4}[A-Z]{2}$';
update trailers set country='GR' where country is null and deleted_at is null and license_plate ~ '^P[0-9]{5}$';
update trailers set country='BG' where country is null and deleted_at is null and license_plate ~ '^[A-Z]{1,2}[0-9]{4}[A-Z]{2}$';
comment on column trucks.tachograph_expiry is 'Tachograph calibration valid until (owner 6/9/2026)';
comment on column trucks.next_maintenance  is 'Next planned service date (owner 6/9/2026)';
comment on column trucks.country   is 'Registration country, ISO-3166 alpha-2 (owner 6/9/2026)';
comment on column trailers.country is 'Registration country, ISO-3166 alpha-2 (owner 6/9/2026)';
commit;
-- Proof: select country, count(*) from trucks where deleted_at is null group by 1;   -- expect GR≈25, BG≈11, NULL=0..1 (TB53142?)
--        select country, count(*) from trailers where deleted_at is null group by 1; -- expect GR≈23 (P…), BG≈16, NULL≈1 (TB53142)
```

## Worker — `worker/src/index.js` (deploy μαζί με τη ράμπα)
- TRUCKS (`pg: "trucks"`): `"Tachograph Expiry": "tachograph_expiry"`, `"Next Maintenance Date": "next_maintenance"`, `Country: "country"`.
- TRAILERS (`pg: "trailers"`): `Country: "country"`.
Labels ακριβώς αυτά — τα `modules/maintenance.js` ήδη ζητά `Tachograph Expiry` και `Next Maintenance Date`.

## Front end
### A. `core/entity.js` — trucks & trailers config (v2)
- Στήλη `{ field: 'Country', label: 'Χώρα' }` αμέσως μετά την Πινακίδα, και στους δύο.
- Φίλτρο `{ field: 'Country', label: 'Χώρα', type: 'dynamic', allLabel: 'Όλες' }` πρώτο στη λίστα φίλτρων (όπως clients).
- Προεπιλεγμένη ταξινόμηση: Χώρα, μετά Πινακίδα. Αν το v2 δεν έχει έννοια default sort, πρόσθεσε `defaultSort: ['Country','License Plate']` και υλοποίησέ το στο σημείο που ταξινομεί το v2 (μία θέση, όχι ανά οθόνη).
- Φόρμα: `{ f: 'Country', label: 'Χώρα', type: 'country' }` στην Ταυτότητα (ίδιος τύπος με clients).
- Φορτηγά μόνο: Έγγραφα `+ { f: 'Tachograph Expiry', label: 'Ταχογράφος έως', type: 'date' }`· νέα ενότητα `{ section: 'Συντήρηση', fields: [{ f: 'Next Maintenance Date', label: 'Επόμενη συντήρηση', type: 'date' }] }`· `cardDocs + { f: 'Tachograph Expiry', label: 'Ταχογράφος' }`· `cardSpecs + { f: 'Next Maintenance Date', label: 'Επόμενη συντήρηση' }` (ή στο cardMaint αν εκεί ταιριάζει — μία θέση).
- Το φίλτρο `_compliance` (ληγμένο / λήγει <30 ημ.) μετρά και τον ταχογράφο στα φορτηγά. Βρες πού ορίζεται η λίστα των expiry πεδίων ανά οντότητα και πρόσθεσέ το ΕΚΕΙ (μία πηγή), όχι δεύτερη λίστα.
### B. `modules/maintenance.js`
- Αφαίρεσε `ADR Expiry` και `Pallet Capacity` και `ATP Expiry` από τα `fields:` και από κάθε render/στήλη. Οι ρυμούλκες δείχνουν FRC (κλειδωμένη απόφαση). Τα `Tachograph Expiry`/`Next Maintenance Date` ΜΕΝΟΥΝ (γίνονται πραγματικά με το deploy).
- Οι critics ξαναπαίζουν HAR κατά ακριβές URL: αν αλλάξει η λίστα `fields`, δες `tests/critics/repair-har.js` για την επιδιόρθωση του HAR της μονάδας maintenance και τρέξε την· αν δεν εφαρμόζεται, γράψ' το στο report.
### C. Κάρτες KPI (trucks & trailers μόνο) — `core/entity.js` v2
Config `kpiCards: (records) => [{ label, value, sub, onClick }]` ανά οντότητα, απόδοση σε μία σειρά 4 καρτών κάτω από την κεφαλίδα v2 και πάνω από τα φίλτρα, μόνο όταν το config την ορίζει. Ύφος: ίδιο με `.dh-card` του dashboard (navy τίτλος, μεγάλο νούμερο, υπότιτλος dim), grid 4 στηλών, 1 στήλη < 720px.
1. **Ηλικία στόλου**: μέση τιμή `currentYear − Year` στα ενεργά με έτος, 1 δεκαδικό· sub: «23 από 36 με έτος». Χωρίς κανένα έτος → «—».
2. **Ανά χώρα**: value = «GR 25 · BG 11», sub = «χωρίς χώρα 1» αν υπάρχουν κενά.
3. **Λήγουν σε 30 ημ.**: πλήθος οχημάτων με ≥1 έγγραφο (ίδια λίστα expiry με το `_compliance`) που λήγει σε ≤30 ημέρες ή έχει λήξει· κλικ → εφαρμόζει φίλτρο `_compliance=expiring` (ή `expired` αν έτσι μετρά ήδη το φίλτρο· κράτα συνέπεια με την υπάρχουσα λογική).
4. **Συντήρηση 14 ημ.** (φορτηγά μόνο· στις ρυμούλκες η κάρτα λείπει, 3 κάρτες): πλήθος με `Next Maintenance Date` ≤ 14 ημέρες ή ληγμένη· κλικ → ταξινόμηση κατά `Next Maintenance Date` αύξουσα.
Οι κάρτες υπολογίζονται από τα records που ήδη έχει η οθόνη (καμία νέα κλήση).

## Πλάνο εκτέλεσης
- T1 (Worker + migration): §Βάση + §Worker. Έλεγχος: `node --check worker/src/index.js`, `node --test worker/test/`. Commit, ΧΩΡΙΣ deploy.
- T2 (entity + maintenance): §A + §B. Έλεγχος: `node --check`, `npm run critics -- entity maintenance` αν τρέχει τοπικά, αλλιώς report. Bump + commit.
- T3 (KPI cards): §C. Bump + commit.
- Review ανά task (Sonnet), τελικό review (Opus) πριν το deploy. Απόδειξη μετά το deploy: SQL counts ανά χώρα, αποθήκευση ενός ταχογράφου από τη φόρμα → `select tachograph_expiry from trucks where id=…`.
