// ═══════════════════════════════════════════════
// CORE — ENTITY ENGINE
// Generic CRUD renderer for master data tables
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// ΚΟΙΝΟΣ ΚΑΝΟΝΑΣ — ΣΤΗΛΕΣ ΠΟΥ ΔΕΝ ΕΧΟΥΝ ΠΕΙ ΠΟΤΕ ΤΙΠΟΤΑ
// ═══════════════════════════════════════════════════════════════════════
// ΤΙ ΛΥΝΕΙ (μετρημένο 3/9/2026): ΑΝΑΝΕΩΘΗΚΕ 65/65 κενή · ΑΣΦΑΛΙΣΤΗΣ
// ρυμουλκών 37/37 (δεν υπάρχει καν στήλη `insurance_partner` στο trailers) ·
// Πόλη/Τηλέφωνο συνεργείων 0/70 · Επαφή συνεργατών 0/432 · Reference/
// Μεταφορικό/Δελτίο στο Ισοζύγιο. Έπιαναν 26–31% του πλάτους σε αρκετούς
// πίνακες, και οι παύλες τους έχουν ΜΕΓΑΛΥΤΕΡΗ αντίθεση (17.85:1) από τα
// ίδια τα δεδομένα — τραβούσαν το μάτι περισσότερο από την πληροφορία.
//
// ΓΙΑΤΙ ΕΔΩ και όχι σε δικό του `core/dead-columns.js`: νέο αρχείο σημαίνει
// νέο <script> στο app.html, που αυτός ο γύρος δεν αγγίζει. Το entity.js
// φορτώνεται πριν από ΟΛΑ τα modules (app.html:117), άρα οι τέσσερις οθόνες
// που το καλούν (entity · maintenance · locations · pallet_ledger) το βρίσκουν
// έτοιμο. Μεταφέρεται αυτούσιο αν κάποτε γίνει δικό του αρχείο.
//
// ΤΟ ΚΑΤΩΦΛΙ ΕΙΝΑΙ ΑΠΟΦΑΣΗ, ΟΧΙ ΛΕΠΤΟΜΕΡΕΙΑ — και είναι 100%. Το 93% ΔΕΝ
// κρύβεται: το ΟΔΟΜΕΤΡΟ έχει 76 πραγματικές τιμές σε 1.095 γραμμές (Supabase
// 3/9, σε ΚΑΘΕ έτος: 21+43+8) και αυτές ακριβώς οι 76 είναι που ψάχνει
// κάποιος. Κάθε κατώφλι κάτω από το 100% κρύβει δεδομένα από κάποιον· το 100%
// δεν είναι κρίση, είναι μέτρηση. Αλλάζει σε ΕΝΑ σημείο: DEAD_COL_THRESHOLD.
//
// «ΟΡΑΤΕΣ ΓΡΑΜΜΕΣ», ΟΧΙ ΟΛΟΣ Ο ΠΙΝΑΚΑΣ: ο κανόνας κρίνει ό,τι αποδίδεται τώρα,
// γι' αυτό δουλεύει πάνω στο DOM και όχι πάνω στα records. Συνέπεια που είναι
// χαρακτηριστικό, όχι σφάλμα: η Επαφή πελατών (1 γεμάτη στις 1.920) κρύβεται
// στις πρώτες 500 και ΞΑΝΑΕΜΦΑΝΙΖΕΤΑΙ μόλις η αναζήτηση φέρει τον έναν πελάτη
// που την έχει. Το ίδιο ανά σελίδα στις Τοποθεσίες.
//
// ΤΟ ΠΕΔΙΟ ΔΕΝ ΧΑΝΕΤΑΙ: μόνο `display:none`. Τα <th>/<td> μένουν στο DOM, και
// η καρτέλα, η φόρμα και η εξαγωγή CSV διαβάζουν από τα δεδομένα — δεν
// περνούν από εδώ καθόλου.
//
// ΚΑΙ ΑΚΟΥΓΕΤΑΙ (αρχή 1): κάτω από τον πίνακα μπαίνει γραμμή που ΟΝΟΜΑΖΕΙ τις
// στήλες που κρύφτηκαν, με κουμπί επαναφοράς. Χωρίς αυτό θα ήταν σιωπηλή
// εξαφάνιση πεδίου — ακριβώς το λάθος που το έργο ήδη πλήρωσε.

// Κενό = τίποτα ή σκέτη παύλα. Το «— δεν έχει καταχωρηθεί» ΔΕΝ είναι κενό:
// είναι πρόταση, και η στήλη που τη γράφει κάνει τη δουλειά της.
const DEAD_COL_EMPTY_RE = /^[\s—–-]*$/;
// 1 = κενή σε ΟΛΕΣ τις ορατές γραμμές. Βλ. «ΤΟ ΚΑΤΩΦΛΙ» παραπάνω πριν το αλλάξεις.
const DEAD_COL_THRESHOLD = 1;

const _deadColRevealed = new Set();   // κλειδιά που ο χρήστης ξε-έκρυψε
const _deadColRoots = {};             // κλειδί → ρίζα, για το toggle

/**
 * Κρύβει οπτικά κάθε στήλη που είναι κενή σε όλες τις ορατές γραμμές.
 * Ξαναεκτελείται σε κάθε βάψιμο· είναι idempotent (καθαρίζει πρώτα τα δικά της).
 * @param {HTMLElement|string} root - πίνακας ή περιέκτης πινάκων (id ή στοιχείο).
 *   Περιέκτης ΜΟΝΟ όταν όλοι οι πίνακες μέσα μοιράζονται τις ίδιες στήλες
 *   (Ισοζύγιο: μία κεφαλίδα, ένας πίνακας ανά ομάδα). Στις Λήξεις περνιέται
 *   κάθε πίνακας ΧΩΡΙΣΤΑ: φορτηγά και ρυμούλκες έχουν ίδιο πλήθος στηλών αλλά
 *   ο ΑΣΦΑΛΙΣΤΗΣ είναι γεμάτος μόνο στα φορτηγά.
 * @param {string} key - σταθερό κλειδί ανά πίνακα· κρατά το «Εμφάνιση» ζωντανό
 *   μετά από repaint (κάθε πάτημα στην αναζήτηση ξαναγράφει το innerHTML).
 */
function collapseEmptyColumns(root, key) {
  const el = typeof root === 'string' ? document.getElementById(root) : root;
  if (!el) return;
  _deadColRoots[key] = el;

  // Πάντα από μηδέν. Ο πίνακας των Τοποθεσιών ΔΕΝ ξαναχτίζεται σε κάθε βάψιμο
  // (αλλάζει μόνο το tbody), οπότε κεφαλίδα κρυμμένη στη σελίδα 1 θα έμενε
  // κρυμμένη και στη σελίδα 7 που έχει τιμές.
  el.querySelectorAll('[data-deadcol]').forEach(n => {
    n.style.display = ''; n.removeAttribute('data-deadcol');
  });
  const prev = document.querySelector(`[data-deadcol-note="${key}"]`);
  if (prev) prev.remove();

  const trs = [...el.querySelectorAll('tr')];
  const headRow = trs.find(r => r.querySelector('th'));
  if (!headRow) return;
  const head = [...headRow.cells];
  // Γραμμές δεδομένων = ίδιο πλήθος κελιών με την κεφαλίδα. Αυτό κόβει τις
  // γραμμές colspan (κενή κατάσταση, «πρώτες 500 από…»), που αλλιώς θα
  // μετριόνταν ως ένα κενό κελί σε κάθε στήλη και θα έκρυβαν ΟΛΟΝ τον πίνακα.
  const rows = trs.filter(r => r !== headRow && !r.querySelector('th')
                               && r.cells.length === head.length);
  if (!rows.length) return;   // κενός πίνακας: οι κεφαλίδες ΜΕΝΟΥΝ

  const label = th => (th.textContent.trim() || th.getAttribute('title') || '');
  const dead = [];
  head.forEach((th, i) => {
    // Στήλη χωρίς όνομα = στήλη ενεργειών/εικονιδίου, δεν κρίνεται από κείμενο.
    // Το title μετράει ως όνομα: το «Δελτίο» του Ισοζυγίου ζει μόνο εκεί.
    if (!label(th) || th.hasAttribute('data-keep-col')) return;
    const empty = rows.filter(r => DEAD_COL_EMPTY_RE.test(r.cells[i].textContent)).length;
    if (empty / rows.length >= DEAD_COL_THRESHOLD) dead.push(i);
  });
  if (!dead.length) return;

  const hidden = !_deadColRevealed.has(key);
  if (hidden) {
    // Τα <col> κρύβονται ΜΑΖΙ με τα κελιά: με table-layout:fixed (Ισοζύγιο) τα
    // πλάτη έρχονται από το colgroup, οπότε κρυμμένο κελί με ορατό col αφήνει
    // τη στήλη να κρατά τον χώρο της και δεν κερδίζεται τίποτα.
    const cgs = [...el.querySelectorAll('colgroup')].filter(g => g.children.length === head.length);
    dead.forEach(i => {
      [head[i], ...rows.map(r => r.cells[i]), ...cgs.map(g => g.children[i])]
        .forEach(n => { n.style.display = 'none'; n.setAttribute('data-deadcol', ''); });
    });
  }

  const note = document.createElement('div');
  note.setAttribute('data-deadcol-note', key);
  note.style.cssText = 'display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;'
    + 'padding:var(--space-2) var(--space-3);color:var(--text-dim);font-size:var(--text-xs)';
  const txt = document.createElement('span');
  txt.textContent = (hidden ? 'Κρυμμένες στήλες — καμία τιμή στις γραμμές που βλέπεις: '
                            : 'Χωρίς καμία τιμή στις γραμμές που βλέπεις: ');
  const names = document.createElement('b');
  names.style.fontWeight = '600';
  names.textContent = dead.map(i => label(head[i])).join(', ');
  txt.appendChild(names);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = hidden ? 'Εμφάνιση' : 'Απόκρυψη';
  btn.style.cssText = 'background:none;border:0;padding:0;cursor:pointer;'
    + 'color:var(--accent-text);font:inherit;text-decoration:underline';
  btn.onclick = () => toggleDeadColumns(key);
  note.append(txt, btn);
  el.insertAdjacentElement('afterend', note);
}

function toggleDeadColumns(key) {
  if (_deadColRevealed.has(key)) _deadColRevealed.delete(key);
  else _deadColRevealed.add(key);
  const el = _deadColRoots[key];
  if (el && el.isConnected) collapseEmptyColumns(el, key);
}

// ── Entity Config Registry ───────────────────────
const ENTITY_CONFIG = {

  clients: {
    tableId: TABLES.CLIENTS,
    label: 'Clients',
    labelSingle: 'Client',
    // Wave 1, fifth entity (Figma clients-overview 118:309, client-card
    // 122:636, clients-form 120:395). Carries TWO of the three dead fields
    // (plan §2.1): contact_person and payment_terms_days — 0/1.920 written,
    // the Worker map has no columns for them. Shown as designed: «—» in
    // list/card, disabled with the reason in the form, skipped on save.
    // The card shows VOLUME and FREQUENCY only — never revenue or margin
    // (owner lock 23/8: the dispatcher has full access here).
    v2: true,
    titleV2: 'Πελάτες',
    activeLabels: ['Ενεργός', 'Ανενεργός'],
    defaultFilters: [{ field: 'Active', val: 'true', type: 'bool' }],
    formTitles: ['Νέος πελάτης', 'Επεξεργασία πελάτη'],
    cardSubtitle: ['Country', 'City'],
    cardSubtitleSep: ' · ',
    cardSpecsTitle: 'Επικοινωνία',
    cardSpecs: [
      { f: 'Contact Person',     label: 'Υπεύθυνος επαφής' },   // dead — renders «—»
      { f: 'Phone',              label: 'Τηλέφωνο', phone: true },
      { f: 'Email',              label: 'Email' },
      { f: 'Adress',             label: 'Διεύθυνση' },
      { f: 'VAT Number',         label: 'ΑΦΜ' },
      { f: 'Payment Terms Days', label: 'Όροι πληρωμής' },      // dead — renders «—»
    ],
    cardActivity: 'orders',
    cardActivityTitle: 'Δραστηριότητα',
    cardRecentTitle: 'Πρόσφατες παραγγελίες',
    perm: 'clients',
    searchFields: ['Company Name', 'City', 'Contact Person', 'VAT Number'],
    searchHint: 'Αναζήτηση: εταιρεία, πόλη, επαφή, ΑΦΜ…',
    filters: [
      { field: 'Country', label: 'Χώρα', type: 'dynamic', allLabel: 'Όλες' },
      { field: 'Active',  label: 'Κατάσταση', type: 'bool', options: [
        { val: '', label: 'Όλα' },
        { val: 'true',  label: 'Ενεργός' },
        { val: 'false', label: 'Ανενεργός' },
      ]},
    ],
    columns: [
      { field: 'Company Name',  label: 'Εταιρεία',  primary: true },
      { field: 'Country',       label: 'Χώρα' },
      { field: 'City',          label: 'Πόλη' },
      { field: 'Contact Person',label: 'Επαφή' },
      { field: 'Phone',         label: 'Τηλέφωνο' },
      { field: 'Active',        label: 'Κατάσταση', type: 'active' },
    ],
    // Per clients-form 120:395: Στοιχεία εταιρείας / Επικοινωνία, with the
    // two dead fields disabled + the reason spelled out.
    formFields: [
      { section: 'Στοιχεία εταιρείας', fields: [
        { f: 'Company Name', label: 'Επωνυμία', req: true },
        { f: 'VAT Number',   label: 'ΑΦΜ' },
      ]},
      // Empty section label — see the "sec.section" comment in buildEntityModal:
      // this is a 3-col continuation of ΣΤΟΙΧΕΙΑ ΕΤΑΙΡΕΙΑΣ above, not a new
      // heading (clients-form 120:395 puts Χώρα/Πόλη/Διεύθυνση on one row).
      { section: '', cols: 3, fields: [
        { f: 'Country',      label: 'Χώρα' },
        { f: 'City',         label: 'Πόλη' },
        { f: 'Adress',       label: 'Διεύθυνση' },
      ]},
      { section: 'Επικοινωνία', fields: [
        { f: 'Contact Person', label: 'Υπεύθυνος επαφής',
        },
        { f: 'Phone',          label: 'Τηλέφωνο' },
        { f: 'Email',          label: 'Email', type: 'email' },
        { f: 'Payment Terms Days', label: 'Όροι πληρωμής (ημέρες)', type: 'number',
        },
      ]},
    ],
    // detailSections/history intentionally absent — the v2 card replaced them.
  },

  partners: {
    tableId: TABLES.PARTNERS,
    label: 'Partners',
    labelSingle: 'Partner',
    // Wave 1, sixth entity (Figma partners-overview 118:622, partner-card
    // 122:703, partners-form 120:463). One dead field: contact_person
    // (0/214). The card shows assignment volume — the old panel's margin,
    // revenue and rates do NOT return (owner lock 23/8; the mock has none).
    v2: true,
    titleV2: 'Συνεργάτες',
    activeLabels: ['Ενεργός', 'Ανενεργός'],
    defaultFilters: [{ field: 'Active', val: 'true', type: 'bool' }],
    formTitles: ['Νέος συνεργάτης', 'Επεξεργασία συνεργάτη'],
    cardSubtitle: ['Country'],
    cardSpecsTitle: 'Επικοινωνία',
    cardSpecs: [
      { f: 'Contact Person', label: 'Υπεύθυνος επαφής' },   // dead — renders «—»
      { f: 'Phone',          label: 'Τηλέφωνο', phone: true },
      { f: 'Email',          label: 'Email' },
      { f: 'Adress',         label: 'Διεύθυνση' },
      { f: 'VAT Number',     label: 'ΑΦΜ' },
    ],
    cardActivity: 'assignments',
    cardActivityTitle: 'Αναθέσεις',
    cardRecentTitle: 'Πρόσφατες αναθέσεις',
    perm: 'clients',
    searchFields: ['Company Name', 'Contact Person', 'VAT Number'],
    searchHint: 'Αναζήτηση: εταιρεία, επαφή, ΑΦΜ…',
    filters: [
      { field: 'Country', label: 'Χώρα', type: 'dynamic', allLabel: 'Όλες' },
      { field: 'Active',  label: 'Κατάσταση', type: 'bool', options: [
        { val: '', label: 'Όλα' },
        { val: 'true',  label: 'Ενεργός' },
        { val: 'false', label: 'Ανενεργός' },
      ]},
    ],
    columns: [
      { field: 'Company Name',  label: 'Εταιρεία',  primary: true },
      { field: 'Country',       label: 'Χώρα' },
      { field: 'Contact Person',label: 'Επαφή' },
      { field: 'Phone',         label: 'Τηλέφωνο' },
      { field: 'Email',         label: 'Email' },
      { field: 'Active',        label: 'Κατάσταση', type: 'active' },
    ],
    formFields: [
      { section: 'Στοιχεία εταιρείας', fields: [
        { f: 'Company Name', label: 'Επωνυμία', req: true },
        { f: 'VAT Number',   label: 'ΑΦΜ' },
        { f: 'Country',      label: 'Χώρα' },
        { f: 'Adress',       label: 'Διεύθυνση' },
      ]},
      { section: 'Επικοινωνία', fields: [
        { f: 'Contact Person', label: 'Υπεύθυνος επαφής',
        },
        { f: 'Phone',          label: 'Τηλέφωνο' },
        { f: 'Email',          label: 'Email', type: 'email' },
      ]},
    ],
    // detailSections/history intentionally absent — the v2 card replaced them.
  },

  drivers: {
    tableId: TABLES.DRIVERS,
    label: 'Drivers',
    labelSingle: 'Driver',
    // Wave 1, third entity (Figma driver-overview 116:300, drivers-form
    // 120:521). Non-vehicle card: license instead of documents, the salary
    // dead-field notice, round trips with the truck plate, and the per-truck
    // aggregation. No mileage, no maintenance sections.
    v2: true,
    titleV2: 'Οδηγοί',
    countNoun: ['οδηγός', 'οδηγοί'],
    activeLabels: ['Ενεργός', 'Ανενεργός'],
    defaultFilters: [{ field: 'Active', val: 'true', type: 'bool' }],
    formTitles: ['Νέος οδηγός', 'Επεξεργασία οδηγού'],
    typeLabels: { Internal: 'Εσωτερικός', External: 'Εξωτερικός' },
    cardSubtitle: ['Phone'],
    cardTag: { f: 'Type', emphasize: ['Internal'] },
    cardDocsTitle: 'Δίπλωμα',
    cardDocsLink: false,   // maint_expiry tracks vehicles, not licences
    cardActivity: 'orders',
    cardActivityTitle: 'Παραδόσεις',
    // Ο σύνδεσμος «Driver» υπάρχει στον χάρτη του Worker (ORDERS links).
    // Το ποσοστό βγαίνει από τις ΠΑΡΑΓΓΕΛΙΕΣ, όχι από τα round trips: τα
    // ct_round_trips έχουν 14 γραμμές για 99 orders μέχρι να γίνει η Φ2.
    cardActivityLink: 'Driver',
    cardDocs: [
      // labelField: the row leads with the licence NUMBER (mock), the static
      // label is only the fallback for a driver with no number recorded.
      { f: 'License Expiry', label: 'Δίπλωμα', labelField: 'License Number' },
    ],
    // Salary: the FIRST of the three dead fields (plan §2.1) — 0/59 rows have
    // a value because the Worker map has no salary column. Shown as designed:
    // the truth, not a zero. perm 'full' = same visibility as the column
    // (DV-3: dispatcher never sees payroll).
    cardNotice: {
      title: 'Μισθός', f: 'Salary Base', perm: 'full',
      emptyText: 'Δεν έχει καταχωρηθεί',
      helper: 'Το πεδίο δεν αποθηκεύεται ακόμη — εκκρεμεί στήλη στη βάση.',
    },
    cardRt: true,
    cardTruckAgg: true,
    perm: 'drivers',
    searchFields: ['Full Name', 'License Number'],
    searchHint: 'Αναζήτηση: όνομα, αρ. διπλώματος…',
    filters: [
      { field: 'Type', label: 'Τύπος', type: 'select', options: [
        { val: '', label: 'Όλα' },
        { val: 'Internal', label: 'Εσωτερικός' },
        { val: 'External', label: 'Εξωτερικός' },
      ]},
      { field: 'Active', label: 'Κατάσταση', type: 'bool', options: [
        { val: '', label: 'Όλα' },
        { val: 'true',  label: 'Ενεργός' },
        { val: 'false', label: 'Ανενεργός' },
      ]},
    ],
    columns: [
      { field: 'Full Name',      label: 'Οδηγός', primary: true },
      { field: 'Phone',          label: 'Τηλέφωνο' },
      { field: 'Type',           label: 'Τύπος', type: 'tag', emphasize: ['Internal'] },
      // Η στήλη «Μισθός» ΕΦΥΓΕ από τη λίστα (owner 3/9). ΔΕΝ κρύφτηκε: το
      // κρύψιμο λέει «κενή σήμερα, ίσως γεμίσει αύριο», και εδώ αυτό είναι
      // ψέμα — δεν υπάρχει στήλη salary/wage στο `drivers` (information_schema
      // 29/8, ξαναμετρημένο 3/9), άρα δεν μπορεί να γεμίσει χωρίς migration.
      // Το πεδίο ΔΕΝ χάθηκε: μένει στη φόρμα (κλειδωμένο, με τον λόγο) και στην
      // καρτέλα (cardNotice «Δεν έχει καταχωρηθεί») — εκεί όπου η απουσία
      // εξηγείται αντί να καταλαμβάνει μια στήλη με 59 παύλες.
      { field: 'License Number', label: 'Αρ. διπλώματος' },
      { field: 'License Expiry', label: 'Δίπλωμα έως', type: 'expiry' },
      { field: 'Active',         label: 'Κατάσταση', type: 'active' },
    ],
    // Per drivers-form 120:521 — same fields; Μισθός disabled with the reason
    // spelled out. Disabled fields are also SKIPPED on save (see
    // saveEntityRecord): the facade would silently drop the value and toast
    // success — the trap this screen family exists to close.
    formFields: [
      { section: 'Στοιχεία', fields: [
        { f: 'Full Name',   label: 'Ονοματεπώνυμο', req: true },
        { f: 'Type',        label: 'Τύπος', type: 'select', options: [
          { val: 'Internal', label: 'Εσωτερικός' }, { val: 'External', label: 'Εξωτερικός' }] },
        { f: 'Phone',       label: 'Τηλέφωνο' },
        { f: 'Salary Base', label: 'Βασικός μισθός', type: 'number',
          // ΔΙΑΦΕΡΕΙ από τα άλλα τρία: εδώ η ΣΤΗΛΗ ΔΕΝ ΥΠΑΡΧΕΙ στη βάση
          // (επαληθεύτηκε 29/8 με information_schema — δεν υπάρχει salary/wage
          // στο drivers). Δεν αρκεί deploy· θέλει migration, δηλαδή απόφαση
          // owner. Μέχρι τότε μένει κλειστό: ανοιχτό πεδίο που πετά την τιμή
          // με μήνυμα επιτυχίας είναι χειρότερο από κλειδωμένο (αρχή 1).
          disabled: true, disabledReason: 'Δεν αποθηκεύεται — δεν υπάρχει στήλη στη βάση' },
      ]},
      { section: 'Δίπλωμα', fields: [
        { f: 'License Number', label: 'Αρ. διπλώματος' },
        { f: 'License Expiry', label: 'Δίπλωμα έως', type: 'date' },
      ]},
    ],
    // detailSections intentionally absent — the v2 card replaced the panel.
  },

  trucks: {
    tableId: TABLES.TRUCKS,
    label: 'Trucks',
    labelSingle: 'Truck',
    // Wave 1 (Figma truck-overview 103:290): one header bar, no stats strip,
    // 40px rows. Per-entity flag so the other five screens keep the old path
    // until their own turn — one screen at a time (plan 2026-08-29 §3).
    v2: true,
    titleV2: 'Φορτηγά',
    countNoun: ['όχημα', 'οχήματα'],
    // «Ενεργό» (vehicle), not the generic Active/Inactive — DESIGN.md ΜΕΡΟΣ Ε:
    // the screen speaks Greek; the boolean stays untouched in the DB.
    activeLabels: ['Ενεργό', 'Ανενεργό'],
    // The mock's default state is «Κατάσταση: Ενεργός» pre-selected: the working
    // set is the active fleet, inactive is one click away on the same chip.
    defaultFilters: [{ field: 'Active', val: 'true', type: 'bool' }],
    // Record card (embedded in truck-overview 103:290). Docs render ALWAYS,
    // a missing date says so — a truck with no recorded ΚΤΕΟ is exactly the
    // information that was found by audit months late (the ATP incident).
    cardSubtitle: ['Brand', 'Model'],
    cardKm: true,    // trailers have no odometer — the section exists only here
    cardMaint: true,
    cardRt: true,
    cardDocs: [
      { f: 'KTEO Expiry',      label: 'ΚΤΕΟ' },
      { f: 'KEK Expiry',       label: 'ΚΕΚ' },
      { f: 'Insurance Expiry', label: 'Ασφάλεια' },
    ],
    cardSpecs: [
      { f: 'VIN',               label: 'VIN' },
      { f: 'Euro Standard',     label: 'Euro', stripPrefix: 'Euro ' },
      { f: 'Tare Weight kg',    label: 'Απόβαρο', unit: 'kg', num: true },
      { f: 'Year',              label: 'Έτος 1ης ταξ.' },
      { f: 'Insurance Partner', label: 'Ασφαλιστής' },
      { f: 'Notes',             label: 'Σημειώσεις' },
    ],
    perm: 'maintenance',
    searchFields: ['License Plate', 'VIN', 'Brand', 'Model', 'Insurance Partner'],
    searchHint: 'Αναζήτηση: πινακίδα, VIN, μάρκα…',
    filters: [
      { field: 'Brand',  label: 'Μάρκα',  type: 'dynamic' },
      { field: 'Active', label: 'Κατάσταση', type: 'bool', options: [
        { val: '', label: 'Όλα' },
        { val: 'true',  label: 'Ενεργός' },
        { val: 'false', label: 'Ανενεργός' },
      ]},
      { field: '_compliance', label: 'Έγγραφα', type: 'select', options: [
        { val: '', label: 'Όλα' },
        { val: 'expired',  label: 'Με ληγμένο' },
        { val: 'expiring', label: 'Λήγει <30 ημ.' },
        { val: 'ok',       label: 'Όλα εντάξει' },
      ]},
    ],
    columns: [
      { field: 'License Plate',       label: 'Πινακίδα', primary: true },
      { field: 'Brand',               label: 'Μάρκα' },
      { field: 'Model',               label: 'Μοντέλο' },
      { field: 'Year',                label: 'Έτος', type: 'number' },
      { field: 'Euro Standard',       label: 'Euro', stripPrefix: 'Euro ' },
      { field: 'Tare Weight kg',      label: 'Απόβαρο', type: 'number', unit: 'kg' },
      { field: 'VIN',                 label: 'VIN' },
      { field: 'Active',              label: 'Κατάσταση', type: 'active' },
    ],
    // Regrouped per the truck-form mock (119:345): same 12 fields, nothing
    // lost — Τεχνικά and Σημειώσεις split out of the two old sections.
    formTitles: ['Νέο φορτηγό', 'Επεξεργασία φορτηγού'],
    formFields: [
      { section: 'Ταυτότητα', fields: [
        { f: 'License Plate', label: 'Πινακίδα', req: true },
        { f: 'VIN',           label: 'Αριθμός πλαισίου (VIN)' },
      ]},
      // Empty section label — 3-col continuation of ΤΑΥΤΟΤΗΤΑ above
      // (truck-form 119:345: Μάρκα/Μοντέλο/Έτος share one row).
      { section: '', cols: 3, fields: [
        { f: 'Brand',         label: 'Μάρκα' },
        { f: 'Model',         label: 'Μοντέλο' },
        { f: 'Year',          label: 'Έτος (1η ταξ.)', type: 'number' },
      ]},
      { section: 'Τεχνικά', fields: [
        { f: 'Euro Standard', label: 'Euro', type: 'select', options: ['Euro 3','Euro 4','Euro 5','Euro 6'] },
        { f: 'Tare Weight kg', label: 'Απόβαρο (kg)', type: 'number' },
      ]},
      { section: 'Έγγραφα', fields: [
        { f: 'KTEO Expiry',       label: 'ΚΤΕΟ έως',     type: 'date' },
        { f: 'KEK Expiry',        label: 'ΚΕΚ έως',      type: 'date' },
        { f: 'Insurance Expiry',  label: 'Ασφάλεια έως', type: 'date' },
        { f: 'Insurance Partner', label: 'Ασφαλιστής' },
      ]},
      { section: 'Σημειώσεις', fields: [
        { f: 'Notes', label: 'Σημειώσεις', type: 'textarea' },
      ]},
    ],
    // Inline validation (v2 form): '' = ok, otherwise the message under the
    // field. Only the rule the mock defines — nothing invented.
    validators: {
      'Tare Weight kg': v => v !== '' && parseFloat(v) < 0 ? 'Το απόβαρο δεν μπορεί να είναι αρνητικό' : '',
    },
    // detailSections intentionally absent: the v2 record card (cardDocs/
    // cardSpecs above) replaced the old detail panel for trucks — a stale
    // parallel list here would be a second source of truth.
  },

  trailers: {
    tableId: TABLES.TRAILERS,
    label: 'Trailers',
    labelSingle: 'Trailer',
    // Wave 1, second entity (Figma trailers-overview 118:935, trailer-card
    // 122:569, trailers-form 120:573). Same v2 engine as trucks; differences
    // are config: type badge, no mileage section, no insurer.
    v2: true,
    titleV2: 'Ρυμούλκες',
    countNoun: ['ρυμούλκα', 'ρυμούλκες'],
    activeLabels: ['Ενεργό', 'Ανενεργό'],
    defaultFilters: [{ field: 'Active', val: 'true', type: 'bool' }],
    formTitles: ['Νέα ρυμούλκα', 'Επεξεργασία ρυμούλκας'],
    cardSubtitle: ['Brand', 'Model'],
    cardSubtitleExtra: 'Year',
    // Display-only Greek for stored English values (ΜΕΡΟΣ Ε: η μετάφραση στην
    // εμφάνιση, ποτέ με γράψιμο νέων τιμών). DB today: Reefer 32,
    // Curtainsider 7, Ρυμούλκα 1 (μετρήθηκε 29/8). Emphasis on Reefer only —
    // the cold chain is the business.
    typeLabels: { Reefer: 'Ψυγείο', Curtainsider: 'Τέντα' },
    cardTag: { f: 'Trailer Type', emphasize: ['Reefer'] },
    cardMaint: true,
    cardRt: true,
    cardDocs: [
      { f: 'KTEO Expiry',      label: 'ΚΤΕΟ' },
      { f: 'FRC Expiry',       label: 'ATP/FRC' },
      { f: 'Insurance Expiry', label: 'Ασφάλεια' },
    ],
    cardSpecs: [
      { f: 'VIN',            label: 'VIN' },
      { f: 'Tare Weight kg', label: 'Απόβαρο', unit: 'kg', num: true },
      { f: 'Year',           label: 'Έτος 1ης ταξ.' },
      { f: 'Notes',          label: 'Σημειώσεις' },
    ],
    validators: {
      'Tare Weight kg': v => v !== '' && parseFloat(v) < 0 ? 'Το απόβαρο δεν μπορεί να είναι αρνητικό' : '',
    },
    perm: 'maintenance',
    searchFields: ['License Plate', 'VIN', 'Brand', 'Model', 'Trailer Type'],
    searchHint: 'Αναζήτηση: πινακίδα, VIN, τύπος…',
    filters: [
      { field: 'Trailer Type', label: 'Τύπος',   type: 'dynamic', labels: { Reefer: 'Ψυγείο', Curtainsider: 'Τέντα' } },
      { field: 'Active',       label: 'Κατάσταση', type: 'bool', options: [
        { val: '', label: 'Όλα' },
        { val: 'true',  label: 'Ενεργός' },
        { val: 'false', label: 'Ανενεργός' },
      ]},
      { field: '_compliance', label: 'Έγγραφα', type: 'select', options: [
        { val: '', label: 'Όλα' },
        { val: 'expired',  label: 'Με ληγμένο' },
        { val: 'expiring', label: 'Λήγει <30 ημ.' },
        { val: 'ok',       label: 'Όλα εντάξει' },
      ]},
    ],
    columns: [
      { field: 'License Plate',           label: 'Πινακίδα',  primary: true },
      { field: 'Brand',                   label: 'Μάρκα' },
      { field: 'Model',                   label: 'Μοντέλο' },
      { field: 'Year',                    label: 'Έτος', type: 'number' },
      // Badge, not plain text (mock): Ψυγείο highlighted — the cold chain is
      // what the dispatcher scans for. Stored value stays English.
      { field: 'Trailer Type',            label: 'Τύπος', type: 'tag', emphasize: ['Reefer'] },
      { field: 'VIN',                     label: 'VIN' },
      { field: 'Tare Weight kg',          label: 'Απόβαρο', type: 'number', unit: 'kg' },
      { field: 'Active',                  label: 'Κατάσταση', type: 'active' },
    ],
    // Regrouped per trailers-form 120:573 — same 10 fields, nothing lost.
    formFields: [
      { section: 'Ταυτότητα', fields: [
        { f: 'License Plate', label: 'Πινακίδα', req: true },
        { f: 'VIN',           label: 'Αριθμός πλαισίου (VIN)' },
      ]},
      // Empty section label — 3-col continuation of ΤΑΥΤΟΤΗΤΑ above
      // (trailers-form 120:573: Μάρκα/Μοντέλο/Έτος share one row).
      { section: '', cols: 3, fields: [
        { f: 'Brand',         label: 'Μάρκα' },
        { f: 'Model',         label: 'Μοντέλο' },
        { f: 'Year',          label: 'Έτος (1η ταξ.)', type: 'number' },
      ]},
      { section: 'Τεχνικά', fields: [
        { f: 'Trailer Type',  label: 'Τύπος', type: 'select', options: [
          { val: 'Reefer', label: 'Ψυγείο' }, { val: 'Curtainsider', label: 'Τέντα' },
          'Box', 'Flatbed', 'Tanker', 'Ρυμούλκα'] },
        { f: 'Tare Weight kg', label: 'Απόβαρο (kg)', type: 'number' },
      ]},
      { section: 'Έγγραφα', fields: [
        { f: 'KTEO Expiry',      label: 'ΚΤΕΟ έως',     type: 'date' },
        { f: 'FRC Expiry',       label: 'ATP/FRC έως',  type: 'date' },
        { f: 'Insurance Expiry', label: 'Ασφάλεια έως', type: 'date' },
        { f: 'Notes',            label: 'Σημειώσεις',   type: 'textarea' },
      ]},
    ],
    // detailSections intentionally absent — the v2 card replaced the panel.
  },

  workshops: {
    tableId: TABLES.WORKSHOPS,
    label: 'Workshops',
    labelSingle: 'Workshop',
    // Wave 1, fourth entity (Figma workshops-overview 118:1356, workshop-card
    // 122:762, workshops-form 120:654). The list's Εργασίες/Δαπάνη/Τελευταία
    // columns come from the maint_history enrichment — now a standalone step
    // (_enrichWorkshopsV2), no longer welded to the old stats strip.
    v2: true,
    titleV2: 'Συνεργεία',
    countNoun: ['συνεργείο', 'συνεργεία'],
    // «Ενεργός» to match the wording the Κατάσταση filter always had here.
    activeLabels: ['Ενεργός', 'Ανενεργός'],
    defaultFilters: [{ field: 'Active', val: 'true', type: 'bool' }],
    formTitles: ['Νέο συνεργείο', 'Επεξεργασία συνεργείου'],
    cardSubtitle: ['City'],
    // Specialty values are already Greek in the DB — lavender pill (mock).
    cardTag: { f: 'Specialty', style: 'ecard-badge-svc' },
    cardSpecsTitle: 'Επικοινωνία',
    cardSpecs: [
      { f: 'Contact Person', label: 'Υπεύθυνος επαφής' },
      { f: 'Phone',          label: 'Τηλέφωνο', phone: true },
      { f: 'Email',          label: 'Email' },
      { f: 'Address',        label: 'Διεύθυνση' },
    ],
    cardUsage: true,
    cardMaint: true,
    cardMaintBy: 'workshop',
    cardMaintTitle: 'Πρόσφατες εργασίες',
    perm: 'maintenance',
    // Aliases/Notes είναι αναζητήσιμα επίτηδες: το import της 6-8-2026 έγραψε εκεί τις
    // 107 παλιές γραφές του Excel («ΣΑΡΑΚΑΚΗ», «SOULIS»…), οπότε αναζήτηση με το όνομα
    // που θυμάται ο χρήστης βρίσκει το συνεργείο ακόμη κι αν καταχωρήθηκε αλλιώς.
    searchFields: ['Name', 'City', 'Contact Person', 'Specialty', 'Aliases', 'Notes', 'Phone', 'VAT Number'],
    searchHint: 'Αναζήτηση: όνομα, παλιά γραφή, πόλη, ειδικότητα, ΑΦΜ, τηλέφωνο…',
    filters: [
      { field: 'Specialty', label: 'Ειδικότητα', type: 'dynamic' },
      { field: 'Country',   label: 'Χώρα',       type: 'dynamic' },
      // Το φίλτρο «Πόλη» ΕΦΥΓΕ (owner 3/9): `workshops.city` είναι 0/70 στη
      // Supabase, άρα το dynamic dropdown πρόσφερε μία και μόνη επιλογή —
      // «Όλα». Ένα φίλτρο που δεν φιλτράρει υπόσχεται δεδομένα που δεν
      // υπάρχουν. Η ΣΤΗΛΗ μένει (η στήλη city υπάρχει και μπορεί να γεμίσει)
      // και κρύβεται μόνη της από τον κανόνα των κενών στηλών.
      { field: 'Active',    label: 'Κατάσταση',    type: 'bool', options: [
        { val: '', label: 'Όλα' },
        { val: 'true',  label: 'Ενεργός' },
        { val: 'false', label: 'Ανενεργός' },
      ]},
    ],
    columns: [
      { field: 'Name',           label: 'Όνομα',      primary: true },
      // Plain text, no pin (mock 118:1356) — the pin said nothing the word
      // next to it did not.
      { field: 'City',           label: 'Πόλη' },
      { field: 'Specialty',      label: 'Ειδικότητα' },
      { field: 'Phone',          label: 'Τηλέφωνο' },
      // keepEmpty: γεμίζουν από το _enrichWorkshopsV2, ΜΕΤΑ το πρώτο βάψιμο.
      { field: '_serviceCount',  label: 'Εργασίες', type: 'number', keepEmpty: true },
      { field: '_totalSpend',    label: 'Δαπάνη',    type: 'currency', keepEmpty: true },
      { field: '_lastUsed',      label: 'Τελευταία χρήση', type: 'date_rel', keepEmpty: true },
      { field: 'Active',         label: 'Κατάσταση', type: 'active' },
    ],
    // Per workshops-form 120:654: Στοιχεία / Επικοινωνία / Διεύθυνση.
    formFields: [
      { section: 'Στοιχεία', fields: [
        { f: 'Name',           label: 'Επωνυμία', req: true },
        // Ίδιες ακριβώς τιμές με όσες έγραψε το import — αλλιώς κάθε επεξεργασία
        // συνεργείου θα δημιουργούσε νέα, παράλληλη ειδικότητα και το φίλτρο θα
        // γέμιζε διπλές κατηγορίες (αγγλικές από τη φόρμα, ελληνικές από τα δεδομένα).
        { f: 'Specialty',      label: 'Ειδικότητα', type: 'select', options: ['Σέρβις','Ελαστικά','Φρένα/ανάρτηση','Ψύξη','Κινητήρας','Ηλεκτρικά','Αμάξωμα','Πέταλο/κοτσαδούρα','Έλεγχοι'] },
      ]},
      { section: 'Επικοινωνία', fields: [
        { f: 'Contact Person', label: 'Υπεύθυνος επαφής' },
        { f: 'Phone',          label: 'Τηλέφωνο' },
        { f: 'Email',          label: 'Email', type: 'email' },
      ]},
      { section: 'Διεύθυνση', fields: [
        // PARTNERS + CLIENTS use 'Adress' (typo, single 'd'). WORKSHOPS is
        // assumed to use correctly-spelled 'Address' per current Airtable schema.
        // If a 422 'Unknown field name: Address' appears for WORKSHOPS, change here.
        { f: 'Address',        label: 'Διεύθυνση' },
        { f: 'City',           label: 'Πόλη' },
        { f: 'Notes',          label: 'Σημειώσεις', type: 'textarea' },
      ]},
    ],
    // detailSections intentionally absent — the v2 card replaced the panel.
  },

};

// ── State ────────────────────────────────────────
const _entityState = {};
// Sort state per entity: { col: null|index, dir: 0|1|2 }
const _entitySort = {};

// ── Main Renderer ─────────────────────────────────
async function renderEntity(entityKey) {
  const cfg = ENTITY_CONFIG[entityKey];
  if (!cfg) return renderComingSoon(entityKey);

  const c = document.getElementById('content');
  c.innerHTML = showLoading();

  let records;
  try {
    records = await atGet(cfg.tableId);
  } catch (e) {
    if (cfg.v2) {
      // Rule #7 (DESIGN.md): a failed load must never look like an empty
      // table or an eternal skeleton. Old-path screens keep their current
      // behaviour until each one's own redesign step.
      // What happened · what it does NOT mean · what to do (DESIGN.md #7). The
      // retry re-enters here rather than reloading, so the sidebar and the
      // session stay as they were.
      c.innerHTML = showError('Δεν φορτώθηκαν οι εγγραφές — δεν σημαίνει ότι δεν υπάρχουν. Έλεγξε τη σύνδεση και ξαναδοκίμασε.')
        + `<div style="text-align:center;padding:0 0 16px"><button type="button" class="btn btn-secondary btn-sm" onclick="renderEntity('${entityKey}')">Ξαναδοκίμασε</button></div>`;
      if (typeof logError === 'function') logError(e, 'entity list load');
      return;
    }
    throw e;
  }

  _entityState[entityKey] = { records, filtered: records, selected: null, q: '', filters: {} };
  if (cfg.v2 && cfg.defaultFilters) {
    for (const df of cfg.defaultFilters) {
      _entityState[entityKey].filters[df.field] = { val: df.val, type: df.type };
    }
  }

  // Report the row count for every master-data page in one place. This is where
  // "36 trucks" comes from, while the Dashboard and Maintenance both say 27 —
  // they count only Active. Nothing on screen says so, which is why the audit
  // read it as a third fleet total. Reporting both numbers lets the audit state
  // the reason instead of flagging a fault.
  // See docs/design/DEEP_AUDIT_2026-08-04/trucks.md TR-3.
  if (typeof reportPageMetrics === 'function') {
    const hasActive = records.some(r => 'Active' in (r.fields || {}));
    reportPageMetrics(entityKey, Object.assign(
      { total: records.length },
      hasActive ? { active: records.filter(r => r.fields['Active']).length } : {}
    ));
  }

  // Build dynamic filter options
  const dynamicOpts = {};
  for (const fi of cfg.filters) {
    if (fi.type === 'dynamic') {
      // CL-1/PA-1: το φίλτρο χώρας πρόσφερε GR · GREECE · ΕΛΛΑΔΑ ως τρεις
      // ΞΕΧΩΡΙΣΤΕΣ επιλογές, οπότε όποιος διάλεγε «GR» έχανε σιωπηλά τους
      // άλλους δύο. Οι επιλογές ομαδοποιούνται πλέον στην κανονική μορφή· η
      // τιμή της εγγραφής μένει ανέγγιχτη.
      const _isCountry = /country|χωρα|χώρα/i.test(fi.field) || /country/i.test(fi.label || '');
      dynamicOpts[fi.field] = [...new Set(records
        .map(r => _isCountry && typeof normalizeCountry === 'function'
          ? normalizeCountry(r.fields[fi.field]) : r.fields[fi.field])
        .filter(Boolean))].sort();
      if (_isCountry) dynamicOpts['__norm__' + fi.field] = true;
    }
  }

  const canEdit = can(cfg.perm) === 'full';

  const _i = n => (typeof icon === 'function') ? icon(n, 16) : '';

  // Shared by both layouts. The selected-attr matters only when defaultFilters
  // pre-set state (v2); on the old path it is always empty, output unchanged.
  const _sel = (fi, v) => {
    const cur = _entityState[entityKey].filters[fi.field];
    return cur && cur.val === v ? 'selected' : '';
  };
  const filtersHTML = cfg.filters.map(fi => {
    if (fi.type === 'bool' || fi.type === 'select') {
      // ΜΕΡΟΣ Δ2 «ανενεργό»: an option that would match nothing is disabled
      // (grey, not selectable) instead of leading to an empty table. Counted
      // on the UNFILTERED records with the very predicate the filter applies
      // (_entityFilterPred), so the option and the result can never disagree.
      // A predicate the engine cannot build leaves the option live.
      const _dead = o => {
        if (!o.val) return false;
        const pred = _entityFilterPred(cfg, fi.field, o.val, fi.type);
        return !!pred && !records.some(pred);
      };
      return `<select class="svc-filter" onchange="entityFilter('${entityKey}','${fi.field}',this.value,'${fi.type||''}')">
        ${fi.options.map(o => `<option value="${o.val}" ${_sel(fi, o.val)}${_dead(o) ? ' disabled title="Καμία εγγραφή"' : ''}>${fi.label}: ${o.label}</option>`).join('')}
      </select>`;
    } else if (fi.type === 'dynamic') {
      const opts = dynamicOpts[fi.field] || [];
      // fi.labels: display-only Greek for stored English values (ΜΕΡΟΣ Ε).
      // The option VALUE stays raw so filtering matches the records.
      return `<select class="svc-filter" onchange="entityFilter('${entityKey}','${fi.field}',this.value,'')">
        <option value="">${fi.label}: ${fi.allLabel || 'Όλα'}</option>
        ${opts.map(o => `<option value="${o}">${(fi.labels && fi.labels[o]) || o}</option>`).join('')}
      </select>`;
    }
    return '';
  }).join('');

  if (cfg.v2) {
    // Wave 1 layout (Figma truck-overview 103:290): title, count, filters,
    // search and the primary action live in ONE bar inside the list panel.
    // The old page-header + stats strip cost two rows that rule #5
    // (≥20 rows visible at 1080p) cannot afford — spec 2026-08-29 §3.
    // Expiries live in the record card, never in the list (spec §3); the
    // Έγγραφα filter chip stays because it already exists.
    c.innerHTML = `
    <div class="entity-layout entity-v2">
      <div class="entity-list-panel">
        <div class="ev2-bar">
          <span class="ev2-title">${cfg.titleV2 || cfg.label}</span>
          <span class="ev2-count" id="${entityKey}_count"></span>
          ${filtersHTML}
          <input class="ev2-search" placeholder="${cfg.searchHint || 'Αναζήτηση…'}"
            oninput="entitySearch('${entityKey}', this.value)" id="${entityKey}_search">
          ${canEdit ? `
          <button class="btn btn-primary btn-sm ev2-new" onclick="openEntityCreate('${entityKey}')">
            ${_i('plus')}
            Νέα εγγραφή
          </button>` : ''}
        </div>
        <div class="ev2-stats" id="${entityKey}_stats_strip"></div>
        <div class="entity-table-wrap" id="${entityKey}_table"></div>
      </div>
      <div class="entity-detail-panel hidden" id="${entityKey}_detail"></div>
    </div>`;
    // One shared path renders table + count, so the default filters are
    // applied exactly the way a user's own click would apply them.
    applyEntityFilters(entityKey);
    _renderStatsBarV2(entityKey, records);
    if (entityKey === 'workshops') _enrichWorkshopsV2(entityKey, records);
    return;
  }

  c.innerHTML = `
    <div class="page-header" style="margin-bottom:var(--space-4)">
      <div>
        <div class="page-title">${cfg.label}</div>
        <div class="page-sub" id="${entityKey}_sub">${records.length} ${records.length===1?'εγγραφή':'εγγραφές'}</div>
      </div>
      ${canEdit ? `
      <button class="btn btn-primary btn-sm" onclick="openEntityCreate('${entityKey}')">
        ${_i('plus')}
        Νέα εγγραφή
      </button>` : ''}
    </div>

    ${(entityKey === 'partners' || entityKey === 'clients' || entityKey === 'workshops' || entityKey === 'drivers' || entityKey === 'trucks' || entityKey === 'trailers') ? `<div id="${entityKey}_stats_strip" style="margin-bottom:var(--space-4)"></div>` : ''}

    <div class="entity-layout">
      <div class="entity-list-panel">
        <div class="entity-toolbar-v2">
          <div class="entity-search-wrap">
            ${_i('search')}
            <input class="entity-search-input" placeholder="${cfg.searchHint || 'Αναζήτηση…'}"
              oninput="entitySearch('${entityKey}', this.value)" id="${entityKey}_search">
          </div>
          ${filtersHTML}
          <span class="entity-count-chip" id="${entityKey}_count">${records.length}</span>
        </div>
        <div class="entity-table-wrap" id="${entityKey}_table">
          ${buildEntityTable(entityKey, records)}
        </div>
      </div>
      <div class="entity-detail-panel hidden" id="${entityKey}_detail"></div>
    </div>`;

  if (entityKey === 'partners')  _renderPartnersStatsStrip(records);
  if (entityKey === 'clients')   _renderClientsStatsStrip(records);
  // DV-5/TR-5/TL-5: ο στόλος είχε μηδέν KPI ενώ Clients/Partners είχαν τρία.
  if (entityKey === 'drivers' || entityKey === 'trucks' || entityKey === 'trailers')
    _renderFleetStatsStrip(entityKey, records);
}

// ── Μπάρα γενικών στατιστικών, v2 (owner 29/8/2026) ────────────────────────
// Η προηγούμενη μπάρα ΧΑΘΗΚΕ ΣΙΩΠΗΛΑ στη μετάβαση σε v2: το νέο layout έπαψε
// να αποδίδει το <div id="..._stats_strip">, οι τρεις παλιές συναρτήσεις
// ξεκινούν με `if (!el) return;`, και οι κλήσεις τους έμειναν ΜΕΤΑ το
// `return` του v2 κλάδου. Και οι έξι οθόνες είναι v2 — άρα δεν έτρεχαν ποτέ.
// Τίποτα δεν έσπασε, τίποτα δεν το είπε (αρχή 1). Μετρημένο 29/8/2026.
//
// ΚΑΝΟΝΑΣ ΠΕΡΙΕΧΟΜΕΝΟΥ: μόνο ό,τι υπολογίζεται από τα records που ο πίνακας
// ήδη φόρτωσε. Καμία νέα κλήση. Οι παλιές strips Πελατών/Συνεργατών σάρωναν
// ORDERS + NATIONAL ORDERS ολόκληρα σε κάθε φόρτωση σελίδας — αλλαγή
// απόδοσης, που κατά την PRIME DIRECTIVE δεν μπαίνει χωρίς ρητή απόφαση.
const _EXPIRY_FIELDS = {
  drivers:  ['License Expiry'],
  trucks:   ['KTEO Expiry', 'KEK Expiry', 'Insurance Expiry'],
  trailers: ['KTEO Expiry', 'FRC Expiry', 'Insurance Expiry'],
};

function _renderStatsBarV2(entityKey, records) {
  const el = document.getElementById(entityKey + '_stats_strip');
  if (!el) return;
  // Ό,τι φέρει € κρύβεται από dispatcher/warehouse (costs:'none', config.js:334-345).
  // Ίδια πύλη με τον σύνδεσμο TRIP PnL πιο κάτω — μία πηγή αλήθειας για τα ποσά.
  const showMoney = typeof can === 'function' && can('costs') !== 'none';
  const stat = (label, value, color) =>
    `<span class="ev2-stat"><span class="ev2-stat-label">${label}</span>` +
    `<span class="ev2-stat-value"${color ? ` style="color:${color}"` : ''}>${value}</span></span>`;

  const active = records.filter(r => r.fields['Active']).length;
  const out = [stat('Σύνολο', records.length)];

  const EXP = _EXPIRY_FIELDS[entityKey];
  if (EXP) {
    const now = Date.now();
    let expired = 0, soon = 0, unknown = 0;
    for (const r of records) {
      const days = EXP.map(f => r.fields[f]).filter(Boolean)
        .map(v => Math.floor((new Date(v).getTime() - now) / 86400000));
      // Κανόνας #3: «καμία ημερομηνία καταχωρημένη» ΔΕΝ είναι «όλα εντάξει».
      // Μετριέται χωριστά, αλλιώς ένα όχημα χωρίς ΚΤΕΟ φαίνεται συμμορφούμενο.
      if (!days.length) { unknown++; continue; }
      if (days.some(d => d < 0)) expired++;
      else if (days.some(d => d <= 30)) soon++;
    }
    out.push(stat(entityKey === 'drivers' ? 'Ενεργοί' : 'Ενεργά', active,
      active ? 'var(--ok)' : 'var(--text-dim)'));
    out.push(stat(entityKey === 'drivers' ? 'Ληγμένο δίπλωμα' : 'Ληγμένο έγγραφο', expired,
      expired ? 'var(--danger)' : 'var(--ok)'));
    out.push(stat('Λήγει <30 ημ.', soon, soon ? 'var(--warn)' : 'var(--text-dim)'));
    if (unknown) out.push(stat('Χωρίς ημερομηνία', unknown, 'var(--text-mid)'));
  } else if (entityKey === 'workshops') {
    // Τα _serviceCount/_totalSpend έρχονται από το _enrichWorkshopsV2, που
    // τρέχει ΜΕΤΑ. Ώσπου να έρθουν, οι δύο τελευταίες μετρήσεις λείπουν αντί
    // να δείχνουν 0 — και η enrichment ξανακαλεί αυτή τη συνάρτηση.
    const used = records.filter(r => r.fields['_serviceCount']).length;
    out.push(stat('Ενεργά', active, active ? 'var(--ok)' : 'var(--text-dim)'));
    if (records.some(r => r.fields['_serviceCount'] != null)) {
      out.push(stat('Σε χρήση', used, used ? 'var(--ok)' : 'var(--text-dim)'));
      const jobs = records.reduce((s, r) => s + (r.fields['_serviceCount'] || 0), 0);
      out.push(stat('Εργασίες', jobs));
      if (showMoney) {
        const spend = records.reduce((s, r) => s + (r.fields['_totalSpend'] || 0), 0);
        out.push(stat('Δαπάνη', '€' + Math.round(spend).toLocaleString('el-GR')));
      }
    }
  } else {
    // clients / partners — η δουλειά εδώ είναι «ποιον καλώ», οπότε μετριέται
    // αυτό ακριβώς: πόσοι ΔΕΝ έχουν τηλέφωνο. Χώρες = πόσες διακριτές τιμές
    // έχει το φίλτρο, που κάνει ορατή και την ασυνέπεια (GR/GREECE/ΕΛΛΑΔΑ).
    const noPhone = records.filter(r => !r.fields['Phone']).length;
    const countries = new Set(records.map(r => r.fields['Country']).filter(Boolean)).size;
    out.push(stat('Ενεργοί', active, active ? 'var(--ok)' : 'var(--text-dim)'));
    out.push(stat('Χώρες', countries));
    out.push(stat('Χωρίς τηλέφωνο', noPhone, noPhone ? 'var(--warn)' : 'var(--ok)'));
  }

  el.innerHTML = out.join('');
}

// ── Fleet stats strips (DV-5, TR-5, TL-5) ─────────────────
// Purely from the records already fetched for the table — no extra requests.
// «Λήξεις» counts vehicles/drivers with at least one EXPIRED document, and
// «<30 ημ.» those whose nearest expiry lands inside the next month.
function _renderFleetStatsStrip(entityKey, records) {
  const el = document.getElementById(entityKey + '_stats_strip');
  if (!el) return;
  const EXP = entityKey === 'drivers' ? ['License Expiry']
            : entityKey === 'trucks'  ? ['KTEO Expiry','KEK Expiry','Insurance Expiry']
            : ['KTEO Expiry','FRC Expiry','Insurance Expiry'];
  const now = Date.now();
  let expired = 0, soon = 0;
  for (const r of records) {
    const days = EXP.map(f => r.fields[f]).filter(Boolean)
      .map(v => Math.floor((new Date(v).getTime() - now) / 86400000));
    if (!days.length) continue;
    if (days.some(d => d < 0)) expired++;
    else if (days.some(d => d <= 30)) soon++;
  }
  const active = records.filter(r => r.fields['Active']).length;
  const card = (label, val, color) => {
    const valColor = (!color || color === 'var(--text)') ? 'var(--text-inverse)' : color;
    return `<div class="tms-stat-card" style="min-width:140px;flex:0 0 auto">
      <div class="tms-stat-label">${label}</div>
      <div class="tms-stat-value" style="color:${valColor};font-variant-numeric:tabular-nums">${val}</div>
    </div>`;
  };
  el.innerHTML = `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:var(--space-4)">
    ${card('Σύνολο', records.length)}
    ${card(entityKey === 'drivers' ? 'Ενεργοί' : 'Ενεργά', active, active ? 'var(--panel-ok)' : 'var(--panel-dim)')}
    ${card(entityKey === 'drivers' ? 'Ληγμένο δίπλωμα' : 'Με ληγμένο έγγραφο', expired, expired ? 'var(--panel-bad-hi)' : 'var(--panel-ok)')}
    ${card('Λήγει <30 ημ.', soon, soon ? 'var(--panel-warn)' : 'var(--panel-dim)')}
  </div>`;
}

// ── Workshops enrichment (v2) ───────────────────────────────────────────────
// Εργασίες/Δαπάνη/Τελευταία χρήση are DERIVED list columns: one pass over
// maint_history, attached to the in-memory records, one re-render. Extracted
// from the old stats strip, which the v2 layout removed — the columns must
// not die with the strip. Unused workshops stay UNSET on purpose: the columns
// read «—», never 0/€0 — rule #3, and the fix for the 4 unknown-as-zero
// workshop cells measured on 28/8.
async function _enrichWorkshopsV2(entityKey, workshops) {
  try {
    const history = await safeFetch(
      () => atGetAll(TABLES.MAINT_HISTORY, { fields: ['Workshop', 'Cost', 'Date'] }, true),
      'workshops: maintenance history'
    );
    if (didFail(history)) throw new Error('maintenance history failed');
    const count = {}, spend = {}, last = {};
    for (const r of history) {
      const wid = (r.fields['Workshop'] || [])[0];
      if (!wid) continue;
      count[wid] = (count[wid] || 0) + 1;
      spend[wid] = (spend[wid] || 0) + (parseFloat(r.fields['Cost']) || 0);
      const d = r.fields['Date'];
      if (d && (!last[wid] || d > last[wid])) last[wid] = d;
    }
    for (const w of workshops) {
      if (!count[w.id]) continue;   // never used → stays unset → «—»
      w.fields['_serviceCount'] = count[w.id];
      w.fields['_totalSpend'] = spend[w.id];
      w.fields['_lastUsed'] = last[w.id] || '';
    }
    applyEntityFilters(entityKey);
    // Η μπάρα αποδόθηκε πριν φτάσει το ιστορικό: τότε είχε μόνο Σύνολο/Ενεργά.
    // Τώρα που υπάρχουν Εργασίες/Δαπάνη, ξανασχεδιάζεται με αυτά.
    _renderStatsBarV2(entityKey, workshops);
  } catch (e) {
    // Rule #7/#1: the three columns stay «—» AND the screen says why —
    // a silent enrichment failure would read as «κανένα συνεργείο σε χρήση».
    const bar = document.querySelector('.ev2-bar');
    if (bar && !document.getElementById('ev2_enrich_warn')) {
      bar.insertAdjacentHTML('beforeend',
        '<span id="ev2_enrich_warn" class="ecard-fail">⚠ Εργασίες/Δαπάνη δεν φόρτωσαν</span>');
    }
    if (typeof logError === 'function') logError(e, 'workshops enrichment');
  }
}

// ── Partners top stats strip ──────────────────────
async function _renderPartnersStatsStrip(partners) {
  const el = document.getElementById('partners_stats_strip');
  if (!el) return;
  try {
    const allPA = await atGetAll(TABLES.PARTNER_ASSIGN, {
      // Margin Percent / Client Revenue: διαβάζονται στα :1179 και :1210-1211 αλλά
      // δεν ζητιούνταν — άρα μέσο περιθώριο και έσοδα έβγαιναν μόνιμα 0 (audit 25/8).
      fields: [F.PA_PARTNER, F.PA_STATUS, F.PA_RATE, F.PA_ASSIGN_DATE,
               'Margin Percent', 'Client Revenue'],
    }, false);

    const activePartners = partners.filter(p => p.fields['Active']).length;
    const activeAssign   = allPA.filter(r => ['Assigned','In Transit'].includes(r.fields[F.PA_STATUS]||'')).length;

    // This-month spend
    const now = new Date();
    const yyyymm = toLocalDate(now).slice(0, 7); // CL-3: local month, not UTC
    const monthSpend = allPA
      .filter(r => (r.fields[F.PA_ASSIGN_DATE]||'').startsWith(yyyymm))
      .reduce((s,r)=>s+(parseFloat(r.fields[F.PA_RATE])||0), 0);

    // Top 3 partners by total rate
    const byPartner = {};
    for (const r of allPA) {
      const pid = (r.fields[F.PA_PARTNER]||[])[0];
      if (!pid) continue;
      byPartner[pid] = (byPartner[pid] || 0) + (parseFloat(r.fields[F.PA_RATE])||0);
    }
    const pNameById = {};
    for (const p of partners) pNameById[p.id] = p.fields['Company Name'] || '—';
    const top3 = Object.entries(byPartner)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,3)
      .map(([pid,total]) => ({ name: pNameById[pid]||'Unknown', total }));

    const card = (label, val, color) => {
      const valColor = (!color || color === 'var(--text)') ? 'var(--text-inverse)' : color;
      return `<div class="tms-stat-card" style="min-width:140px;flex:0 0 auto">
        <div class="tms-stat-label">${label}</div>
        <div class="tms-stat-value" style="color:${valColor}">${val}</div>
      </div>`;
    };

    const topHTML = top3.length
      ? `<div class="tms-stat-card" style="flex:1;min-width:260px">
          <div class="tms-stat-label" style="margin-bottom:6px">Top 3 Συνεργάτες (All Time)</div>
          ${top3.map((p,i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px">
              <span style="color:rgba(255,255,255,0.85)"><strong style="color:var(--panel-accent)">#${i+1}</strong> ${p.name}</span>
              <span style="color:var(--text-inverse);font-weight:700">€${Math.round(p.total).toLocaleString()}</span>
            </div>`).join('')}
        </div>`
      : '';

    el.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${card('Ενεργοί Συνεργάτες', activePartners)}
        ${card('Ενεργές Αναθέσεις', activeAssign, activeAssign>0?'var(--accent)':'var(--text-dim)')}
        ${card('Τρέχων Μήνας', '€'+Math.round(monthSpend).toLocaleString(), 'var(--success)')}
        ${topHTML}
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:11px">Stats unavailable</div>`;
    if (typeof logError === 'function') logError(e, 'entity stats widget');
  }
}

// ── Clients top stats strip ───────────────────────
async function _renderClientsStatsStrip(clients) {
  const el = document.getElementById('clients_stats_strip');
  if (!el) return;
  try {
    const [intl, natl] = await Promise.all([
      atGetAll(TABLES.ORDERS,     { fields: ['Client','Status','Price','Loading DateTime'] }, false),
      atGetAll(TABLES.NAT_ORDERS, { fields: ['Client','Status','Price','Loading DateTime'] }, false),
    ]);
    const all = [...intl, ...natl];

    const activeClients = clients.filter(c => c.fields['Active']).length;
    const activeOrders  = all.filter(r => !['Delivered','Invoiced','Cancelled'].includes(r.fields['Status']||'')).length;

    const yyyymm = toLocalDate(new Date()).slice(0, 7); // CL-3: local month, not UTC
    const monthRev = all
      .filter(r => (r.fields['Loading DateTime']||'').startsWith(yyyymm))
      .reduce((s,r)=>s+(parseFloat(r.fields['Price'])||0), 0);

    // Top 3 clients by total revenue (all time)
    const byClient = {};
    for (const r of all) {
      const cid = (r.fields['Client']||[])[0];
      if (!cid) continue;
      byClient[cid] = (byClient[cid] || 0) + (parseFloat(r.fields['Price'])||0);
    }
    const cNameById = {};
    for (const c of clients) cNameById[c.id] = c.fields['Company Name'] || '—';
    const top3 = Object.entries(byClient)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,3)
      .map(([cid,total]) => ({ name: cNameById[cid]||'Unknown', total }));

    const card = (label, val, color) => {
      const valColor = (!color || color === 'var(--text)') ? 'var(--text-inverse)' : color;
      return `<div class="tms-stat-card" style="min-width:140px;flex:0 0 auto">
        <div class="tms-stat-label">${label}</div>
        <div class="tms-stat-value" style="color:${valColor}">${val}</div>
      </div>`;
    };

    const topHTML = top3.length
      ? `<div class="tms-stat-card" style="flex:1;min-width:260px">
          <div class="tms-stat-label" style="margin-bottom:6px">Top 3 Πελάτες (All Time)</div>
          ${top3.map((p,i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px">
              <span style="color:rgba(255,255,255,0.85)"><strong style="color:var(--panel-accent)">#${i+1}</strong> ${p.name}</span>
              <span style="color:var(--text-inverse);font-weight:700">€${Math.round(p.total).toLocaleString()}</span>
            </div>`).join('')}
        </div>`
      : '';

    el.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${card('Ενεργοί Πελάτες', activeClients)}
        ${card('Ανοιχτές Παραγγελίες', activeOrders, activeOrders>0?'var(--accent)':'var(--text-dim)')}
        ${card('Τρέχων Μήνας', '€'+Math.round(monthRev).toLocaleString(), 'var(--success)')}
        ${topHTML}
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:11px">Stats unavailable</div>`;
    if (typeof logError === 'function') logError(e, 'entity stats widget');
  }
}

function entitySortToggle(entityKey, colIdx) {
  if (!_entitySort[entityKey]) _entitySort[entityKey] = { col: null, dir: 0 };
  const s = _entitySort[entityKey];
  if (s.col === colIdx) {
    s.dir = (s.dir + 1) % 3;
    if (s.dir === 0) s.col = null;
  } else {
    s.col = colIdx;
    s.dir = 1;
  }
  applyEntityFilters(entityKey);
}

function _entitySortRecords(entityKey, recs) {
  const s = _entitySort[entityKey];
  if (!s || s.col === null || s.dir === 0) {
    // DV-4: with no user sort, drivers came back in DB order and the first
    // screen was mostly Inactive people. Active first; DB order within each
    // group (sort() is stable). Only when the user hasn't chosen a column —
    // an explicit sort must keep meaning exactly what they clicked.
    if (entityKey === 'drivers') {
      // The column is LABELLED «Status» but the field is the boolean 'Active'
      // — the first version compared fields['Status'], which doesn't exist,
      // so nothing sorted. Caught live on the dispatcher check (7/8).
      return [...recs].sort((a, b) => (b.fields['Active'] ? 1 : 0) - (a.fields['Active'] ? 1 : 0));
    }
    return recs;
  }
  const cfg = ENTITY_CONFIG[entityKey];
  // ΠΡΕΠΕΙ να είναι η ΙΔΙΑ λίστα με αυτήν που παρήγαγε τις κεφαλίδες: ο δείκτης
  // ταξινόμησης έρχεται από τη θέση στη ΦΙΛΤΡΑΡΙΣΜΕΝΗ λίστα, οπότε αν εδώ
  // διαβαζόταν η πλήρης cfg.columns, μια κρυμμένη στήλη θα μετατόπιζε τους
  // δείκτες και θα ταξινομούσε ΑΛΛΗ στήλη από αυτήν που πάτησε ο χρήστης.
  const col = _entityVisibleCols(cfg)[s.col];
  if (!col) return recs;
  const dir = s.dir === 1 ? 1 : -1;
  // H13 fix: explicit handlers for new column types so sorting matches display order
  const isNum = col.type === 'number' || col.type === 'currency'
                || col.field.match(/Year|Salary|Tank|Weight|Capacity|Pallets|Lt|kg|HP/i);
  const isDate = col.type === 'expiry' || col.type === 'date_rel'
                 || col.field.match(/Date|Expiry/i);
  const isCompliance = col.type === 'compliance';
  return [...recs].sort((a, b) => {
    let va = a.fields[col.field], vb = b.fields[col.field];
    if (va == null) va = ''; if (vb == null) vb = '';
    if (isNum) return ((parseFloat(va)||0) - (parseFloat(vb)||0)) * dir;
    if (isDate) {
      // For date_rel and expiry, sort by underlying timestamp (not display string).
      // Fallbacks: empty string → epoch 0 (sorts to oldest in ascending).
      const ta = va ? new Date(va).getTime() : 0;
      const tb = vb ? new Date(vb).getTime() : 0;
      return ((isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb)) * dir;
    }
    if (isCompliance) {
      // Sort by worst expiry status across all doc fields in the compliance column.
      // 0 = expired (worst), 1 = expiring <30d, 2 = ok, 3 = missing.
      const scoreOf = r => {
        let worst = 3;
        (col.fields || []).forEach(fc => {
          const d = r.fields[fc.field];
          if (!d) return;
          const days = Math.ceil((new Date(d) - new Date()) / 86400000);
          const s = days < 0 ? 0 : days < 30 ? 1 : 2;
          if (s < worst) worst = s;
        });
        return worst;
      };
      return (scoreOf(a) - scoreOf(b)) * dir;
    }
    if (col.type === 'active') { va = va ? 'Active' : 'Inactive'; vb = vb ? 'Active' : 'Inactive'; }
    return String(va).toLowerCase().localeCompare(String(vb).toLowerCase()) * dir;
  });
}

/**
 * Empty state for the entity tables, distinguishing two situations the old
 * copy collapsed into one.
 *
 * It used to always say "Try adjusting filters or create a new X". On Workshops
 * — 0 records in the database, no filter active — that sent the user off to
 * fiddle with filters that were not the cause, and hid the real message: the
 * table is empty, and 66 work orders have nowhere to be assigned. An empty
 * result after filtering and an empty table are different problems with
 * different next steps.
 *
 * One change, six pages (clients, partners, workshops, trucks, trailers,
 * drivers). See docs/design/DEEP_AUDIT_2026-08-04/workshops.md WS-2.
 *
 * @param {string} entityKey
 * @param {Object} cfg - ENTITY_CONFIG entry
 * @returns {string} HTML
 */
function _entityEmptyState(entityKey, cfg) {
  const st = _entityState[entityKey] || {};
  const totalUnfiltered = (st.records || []).length;
  const isFiltered = totalUnfiltered > 0;
  const illustration = (entityKey === 'trucks' || entityKey === 'trailers') ? 'truck'
    : isFiltered ? 'search' : 'inbox';

  if (typeof showEmpty !== 'function') {
    return `<div style="text-align:center;padding:40px;color:var(--text-dim)">${
      isFiltered ? 'Καμία εγγραφή με αυτά τα φίλτρα' : 'Δεν υπάρχει καμία εγγραφή ακόμη'}</div>`;
  }

  if (isFiltered) {
    return showEmpty({
      illustration,
      title: 'Καμία εγγραφή με αυτά τα φίλτρα',
      description: `Υπάρχουν ${totalUnfiltered} συνολικά — δοκίμασε να καθαρίσεις την αναζήτηση ή τα φίλτρα.`,
      action: { label: 'Καθαρισμός φίλτρων', onClick: `clearEntityFilters('${entityKey}')` },
    });
  }
  return showEmpty({
    illustration,
    title: 'Δεν υπάρχει καμία εγγραφή ακόμη',
    description: 'Ο πίνακας είναι κενός — δεν φταίνε τα φίλτρα.',
    action: { label: `+ ${cfg.labelSingle}`, onClick: `openEntityCreate('${entityKey}')` },
  });
}

/**
 * Reset search + filters for an entity page. Re-renders through renderEntity so
 * the visible controls are rebuilt from state (line 326 resets q and filters);
 * resetting state alone would leave the inputs showing values that no longer
 * apply. atGet is cached, so this does not necessarily hit the network.
 * Called from the filtered empty state — see _entityEmptyState above.
 * @param {string} entityKey
 */
function clearEntityFilters(entityKey) {
  renderEntity(entityKey);
}

/**
 * Οι στήλες που επιτρέπεται να δει ο τρέχων ρόλος.
 * Μια στήλη με perm:'full' κρύβεται όταν το δικαίωμα του τμήματος είναι μόνο
 * ανάγνωση (DV-3). ΣΗΜΕΡΑ ΚΑΜΙΑ ΣΤΗΛΗ ΔΕΝ ΤΟ ΧΡΗΣΙΜΟΠΟΙΕΙ: η μόνη που το είχε
 * ήταν ο ΜΙΣΘΟΣ των οδηγών, που αφαιρέθηκε 3/9 (δεν υπάρχει στήλη στη βάση).
 * Ο μηχανισμός μένει γιατί η επόμενη στήλη μισθοδοσίας/κόστους θα τον θέλει.
 * CLIENT-SIDE ΜΟΝΟ: το πεδίο εξακολουθεί να επιστρέφεται από το backend.
 * @param {Object} cfg - ENTITY_CONFIG entry
 * @returns {Array} ορατές στήλες
 */
// DV-7: display-only τηλέφωνο — τα δεδομένα μένουν όπως γράφτηκαν.
// «+30 693 683 0209» και «6936862513» εμφανίζονται ομοιόμορφα: +30 693 686 2513.
function _fmtPhone(v) {
  if (!v) return v;
  const d = String(v).replace(/[^\d+]/g, '');
  const ten = d.startsWith('+30') ? d.slice(3) : d.startsWith('0030') ? d.slice(4) : d.startsWith('30') && d.length === 12 ? d.slice(2) : d;
  if (/^\d{10}$/.test(ten)) return '+30 ' + ten.slice(0,3) + ' ' + ten.slice(3,6) + ' ' + ten.slice(6);
  return String(v);
}

function _entityVisibleCols(cfg) {
  return cfg.columns.filter(c => !c.perm || can(cfg.perm) === c.perm);
}

// Render cap: 500 rows max to keep DOM responsive. Previously was a silent 200 cap
// which hid entries in growing tables (clients/partners > 200). Now we render up to
// 500 and say so twice — in the count next to the title and in a footer row —
// so nobody reads «1.820 εγγραφές» over a table that holds 500.
const ENTITY_RENDER_CAP = 500;

function buildEntityTable(entityKey, records) {
  const cfg = ENTITY_CONFIG[entityKey];
  // TR-2/TL-3: δύο πινακίδες που κανονικοποιούνται στην ΙΔΙΑ τιμή είναι σχεδόν
  // σίγουρα η ίδια εγγραφή δύο φορές — ΙΑΒ 1099 και IAB1099. Σημαίνονται ώστε
  // να τις δει άνθρωπος. ΔΕΝ ενώνονται και ΔΕΝ γράφεται τίποτα: η πινακίδα
  // είναι κλειδί σύνδεσης, και μια αυτόματη συγχώνευση θα έσπαγε linked records.
  const _plateField = (cfg.columns.find(c => /plate|πινακ/i.test(c.field || '')) || {}).field;
  const _dupPlates = new Set();
  if (_plateField && typeof normalizePlate === 'function') {
    const seen = new Map();
    records.forEach(r => {
      const n = normalizePlate(r.fields[_plateField]);
      if (!n) return;
      if (seen.has(n)) _dupPlates.add(n); else seen.set(n, r.id);
    });
  }
  // Πύλη ρόλου ανά στήλη (DV-3) — χωρίς χρήστη σήμερα· βλ. _entityVisibleCols.
  const cols = _entityVisibleCols(cfg);
  const s = _entitySort[entityKey] || { col: null, dir: 0 };
  const sortedRecs = _entitySortRecords(entityKey, records);
  const ths = cols.map((c, i) => {
    const arrow = s.col===i ? (s.dir===1?' <span style="color: var(--accent-text)">▲</span>':s.dir===2?' <span style="color: var(--accent-text)">▼</span>':'') : '';
    // Sorting was mouse-only; aria-sort also tells a screen reader the state.
    const ariaSort = s.col===i ? (s.dir===1?'ascending':s.dir===2?'descending':'none') : 'none';
    // Numeric cells render right-aligned (see the 'number' branch in the cell
    // renderer); the header did not, so every numeric column read as misaligned —
    // header hugging the left edge, values far right. Match the cell alignment.
    // v2: right-aligned are ONLY variable-length quantities (unit columns) and
    // money — Year is a fixed 4-digit label and stays left (spec 2026-08-29 §3).
    const alignRight = cfg.v2 ? (c.type === 'currency' || !!c.unit)
                              : (c.type === 'number' || c.type === 'currency');
    // keepEmpty: εξαίρεση από τον κανόνα των κενών στηλών, για στήλες που
    // γεμίζουν ΜΕΤΑ το πρώτο βάψιμο. Χωρίς αυτό οι τρεις στήλες εμπλουτισμού
    // των Συνεργείων κρύβονταν στο πρώτο render και επανέρχονταν 200ms μετά —
    // ο πίνακας αναπηδούσε μπροστά στα μάτια του χρήστη σε κάθε φόρτωση.
    return `<th ${c.keepEmpty ? 'data-keep-col ' : ''}style="cursor:pointer;user-select:none${alignRight?';text-align:right':''}" aria-sort="${ariaSort}" tabindex="0" role="button"
      onclick="entitySortToggle('${entityKey}',${i})"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();entitySortToggle('${entityKey}',${i})}">${c.label}${arrow}</th>`;
  }).join('');
  const truncated = sortedRecs.length > ENTITY_RENDER_CAP;
  const rowsToRender = truncated ? sortedRecs.slice(0, ENTITY_RENDER_CAP) : sortedRecs;
  return `<table>
    <thead><tr>${ths}<th></th></tr></thead>
    <tbody>
      ${sortedRecs.length === 0
        ? `<tr><td colspan="${cols.length+1}" style="padding:0">${_entityEmptyState(entityKey, cfg)}</td></tr>`
        : rowsToRender.map(r => buildEntityRow(entityKey, r, cols, _plateField, _dupPlates)).join('')
      }
      ${truncated ? `<tr><td colspan="${cols.length+1}" style="padding:8px 16px;background:var(--warn-bg);color:var(--warn);font-size:12px;text-align:center;font-variant-numeric:tabular-nums">⚠ Εμφανίζονται οι πρώτες ${ENTITY_RENDER_CAP} από ${sortedRecs.length.toLocaleString('el-GR')} — στένεψε με αναζήτηση ή φίλτρο για να δεις τις υπόλοιπες</td></tr>` : ''}
    </tbody>
  </table>`;
}

/**
 * @param {string} [plateField] - όνομα πεδίου πινακίδας, από buildEntityTable
 * @param {Set<string>} [dupPlates] - κανονικοποιημένες πινακίδες που εμφανίζονται >1 φορά
 *   ΠΡΕΠΕΙ να περνιούνται ως ορίσματα: υπολογίζονται μία φορά ανά πίνακα στη
 *   buildEntityTable, που είναι ΑΛΛΗ εμβέλεια από αυτήν εδώ.
 */
function buildEntityRow(entityKey, r, cols, plateField, dupPlates) {
  const f = r.fields;
  const cfg = ENTITY_CONFIG[entityKey];
  const cells = cols.map(col => {
    // stripPrefix: ΜΟΝΟ εμφάνιση, ποτέ η αποθηκευμένη τιμή. Η στήλη «Euro»
    // κρατά «Euro 6», οπότε η επικεφαλίδα και κάθε κελί έλεγαν τη λέξη δύο
    // φορές — 28 περιττές επαναλήψεις σε μία οθόνη. Μετονομασία της ετικέτας
    // αποκλείεται: το «Euro» είναι ένα από τα 24 πεδία του συμβολαίου (σκληρή
    // πύλη, entity.json) και θα έριχνε τον κριτή #1.
    const _raw = f[col.field];
    const val = (col.stripPrefix && typeof _raw === 'string' && _raw.startsWith(col.stripPrefix))
      ? _raw.slice(col.stripPrefix.length) : _raw;
    if (col.type === 'active') {
      // v2 speaks Greek on screen (DESIGN.md ΜΕΡΟΣ Ε); the stored boolean and
      // the old screens' English badge stay as they are until their own turn.
      const onL  = (cfg.v2 && cfg.activeLabels) ? cfg.activeLabels[0] : 'Active';
      const offL = (cfg.v2 && cfg.activeLabels) ? cfg.activeLabels[1] : 'Inactive';
      return `<td><span class="badge ${val ? 'badge-green' : 'badge-grey'}">${val ? onL : offL}</span></td>`;
    }
    if (col.type === 'tag') {
      // Pill with display-only Greek label; emphasis (cold-chain blue) only
      // for the values the mock highlights. Stored value untouched.
      if (!val) return '<td style="color:var(--text-dim)">—</td>';
      const lbl = (cfg.typeLabels && cfg.typeLabels[val]) || val;
      const hi = (col.emphasize || []).includes(val);
      return `<td><span class="badge ${hi ? 'ev2-tag-hi' : 'badge-grey'}">${lbl}</span></td>`;
    }
    if (col.type === 'expiry' && val) {
      return `<td>${expiryLabel(val)}</td>`;
    }
    if (col.type === 'compliance') {
      // Show KT/KK/INS or KT/FRC/INS mini-blocks based on multiple expiry fields
      const blocks = (col.fields || []).map(fc => {
        const d = f[fc.field];
        if (!d) return `<span class="md-comp-block none">${fc.label}</span>`;
        const days = Math.ceil((new Date(d) - new Date()) / 86400000);
        const cls = days < 0 ? 'expired' : days < 30 ? 'warn' : 'ok';
        return `<span class="md-comp-block ${cls}" title="${fc.label} · ${d}${days < 0 ? ' (expired ' + Math.abs(days) + 'd ago)' : ' (' + days + 'd left)'}">${fc.label}</span>`;
      }).join('');
      return `<td style="white-space:nowrap"><div style="display:inline-flex;gap:3px">${blocks}</div></td>`;
    }
    if (col.type === 'temp_range') {
      // Display min/max temp range compactly
      const min = f['Temp Range Min °C'];
      const max = f['Temp Range Max °C'];
      if (min == null && max == null) return '<td style="color:var(--text-dim)">—</td>';
      return `<td style="white-space:nowrap;font-family:'DM Sans',monospace;font-size:11px;color:var(--text-mid)">${min != null ? min : '?'}°/${max != null ? max : '?'}°</td>`;
    }
    if (col.type === 'city') {
      // City with map pin icon prefix
      if (!val) return '<td style="color:var(--text-dim)">—</td>';
      const pin = (typeof icon === 'function') ? icon('map_pin', 12) : '';
      return `<td><span style="display:inline-flex;align-items:center;gap:4px;color:var(--text-mid)">${pin}${val}</span></td>`;
    }
    if (col.type === 'currency') {
      if (cfg.v2) {
        // Enrichment leaves unused rows UNSET on purpose: unknown/none reads
        // «—», never €0 (rule #3 — the workshops unknown-as-zero cells die here).
        if (val == null || val === '') return '<td style="color:var(--text-dim);text-align:right;font-variant-numeric:tabular-nums">—</td>';
        return `<td style="font-variant-numeric:tabular-nums;text-align:right;font-weight:600">€${Math.round(val).toLocaleString('el-GR')}</td>`;
      }
      if (val == null || val === 0) return '<td style="color:var(--text-dim);font-variant-numeric:tabular-nums">€0</td>';
      return `<td style="font-variant-numeric:tabular-nums;font-weight:600">€${Math.round(val).toLocaleString()}</td>`;
    }
    if (col.type === 'date_rel') {
      if (cfg.v2) {
        // Absolute Greek date (mock 118:1356) — «3d ago» made the reader do
        // the math the screen already knew.
        if (!val) return '<td style="color:var(--text-dim)">—</td>';
        return `<td style="white-space:nowrap;font-variant-numeric:tabular-nums">${_ecDate(val)}</td>`;
      }
      if (!val) return '<td style="color:var(--text-dim);font-size:11px">Never</td>';
      const days = Math.floor((Date.now() - new Date(val).getTime()) / 86400000);
      const label = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 30 ? `${days}d ago` : days < 365 ? `${Math.round(days/30)}mo ago` : `${Math.round(days/365)}y ago`;
      const color = days < 30 ? 'var(--success)' : days < 90 ? 'var(--text-mid)' : 'var(--text-dim)';
      return `<td style="color:${color};font-size:11px;white-space:nowrap" title="${val}">${label}</td>`;
    }
    // Empty numerics used to fall through to the generic (left-aligned) cell below,
    // so a column mixed right-aligned digits with left-aligned em-dashes and read as
    // broken. Keep the whole numeric column on one axis, filled or not.
    if (col.type === 'number') {
      // Η μονάδα (π.χ. kg) μπαίνει δίπλα στον αριθμό, σε πιο σβηστό χρώμα ώστε
      // η στήλη να διαβάζεται ως αριθμοί και όχι ως κείμενο (owner 6-8-2026).
      const unit = col.unit && val != null && val !== ''
        ? ` <span style="color:var(--text-dim);font-size:11px">${col.unit}</span>` : '';
      // v2: thousands separator (7.420) — but only where a unit marks a
      // measured quantity. Year is a label, not an amount: «2.021» is wrong.
      const num = (cfg.v2 && col.unit && val != null && val !== '' && !isNaN(parseFloat(val)))
        ? parseFloat(val).toLocaleString('el-GR') : val;
      const shown = num != null && num !== '' ? num : '—';
      // v2 alignment mirrors the header rule above: only unit quantities right.
      const alignRight = cfg.v2 ? !!col.unit : true;
      return `<td style="font-variant-numeric:tabular-nums${alignRight ? ';text-align:right' : ''}">${shown}${unit}</td>`;
    }
    if (col.primary) {
      const dup = plateField && col.field === plateField && typeof normalizePlate === 'function'
        && dupPlates && dupPlates.has(normalizePlate(val));
      // A plate is a number in a column (ΜΕΡΟΣ Γ): tabular digits so ΙΑΒ 1099
      // and ΙΑΒ 1100 line up. 11px is the floor for text that is read.
      const numeric = plateField && col.field === plateField ? ' style="font-variant-numeric:tabular-nums"' : '';
      return `<td${numeric}><strong style="color:var(--text)">${val || '—'}</strong>${dup
        ? ' <span title="Υπάρχει άλλη εγγραφή με οπτικά ίδια πινακίδα — ελληνικά/λατινικά ομόγλυφα ή κενό" style="font-size:11px;font-weight:700;color:var(--warn);white-space:nowrap">⚠ διπλότυπο;</span>'
        : ''}</td>`;
    }
    if (col.field === 'Phone' && val) return `<td style="font-variant-numeric:tabular-nums;white-space:nowrap">${_fmtPhone(val)}</td>`;
    return `<td>${val != null && val !== '' ? val : '—'}</td>`;
  }).join('');

  // The whole row selects a record, so it must be reachable without a mouse.
  // role+tabindex rather than a <button> wrapper because a <tr> cannot contain
  // one without breaking the table. One change, six master-data pages.
  // See docs/design/DEEP_AUDIT_2026-08-04/clients.md CL-4 / trucks.md TR-6.
  return `<tr onclick="selectEntity('${entityKey}','${r.id}')" id="row_${r.id}"
    tabindex="0" role="button" aria-label="Άνοιγμα εγγραφής"
    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectEntity('${entityKey}','${r.id}')}">${cells}
    <td style="width:32px">
      <button type="button" class="btn-icon" aria-label="Επεξεργασία" onclick="event.stopPropagation();openEntityEdit('${entityKey}','${r.id}')">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M11 2l3 3-9 9H2v-3l9-9z"/>
        </svg>
      </button>
    </td>
  </tr>`;
}

// ── Search / Filter ───────────────────────────────
function entitySearch(entityKey, q) {
  _entityState[entityKey].q = q.toLowerCase();
  applyEntityFilters(entityKey);
}

function entityFilter(entityKey, field, val, type) {
  const st = _entityState[entityKey];
  if (!val) { delete st.filters[field]; }
  else       { st.filters[field] = { val, type }; }
  applyEntityFilters(entityKey);
}

/**
 * The predicate one filter value applies to a record — or null when the
 * engine has no rule for it (then the filter is a no-op, as before).
 * Lives apart from applyEntityFilters because the filter dropdowns count
 * their options with it (ΜΕΡΟΣ Δ2, zero → disabled); a second copy of these
 * rules next to the <option>s would drift (principle 3).
 * @returns {null|function(Object):boolean}
 */
function _entityFilterPred(cfg, field, val, type) {
  // Το ταίριασμα γίνεται στην ίδια κανονική μορφή που παρήγαγε την επιλογή,
  // αλλιώς «GR» δεν θα έβρισκε ποτέ τις εγγραφές που λένε «ΕΛΛΑΔΑ».
  if (/country|χωρα|χώρα/i.test(field) && typeof normalizeCountry === 'function') {
    return r => normalizeCountry(r.fields[field]) === normalizeCountry(val);
  }
  if (field === '_compliance') {
    // Compliance filter: check expiry dates from the compliance column config
    const complianceCol = cfg.columns.find(c => c.type === 'compliance');
    if (!complianceCol) return null;
    return r => {
      const statuses = complianceCol.fields.map(fc => {
        const d = r.fields[fc.field];
        if (!d) return 'none';
        const days = Math.ceil((new Date(d) - new Date()) / 86400000);
        return days < 0 ? 'expired' : days < 30 ? 'expiring' : 'ok';
      });
      if (val === 'expired')  return statuses.includes('expired');
      if (val === 'expiring') return statuses.includes('expiring') && !statuses.includes('expired');
      if (val === 'ok')       return statuses.every(s => s === 'ok' || s === 'none');
      return true;
    };
  }
  if (type === 'bool') {
    const boolVal = val === 'true';
    return r => !!r.fields[field] === boolVal;
  }
  return r => String(r.fields[field] || '') === val;
}

function applyEntityFilters(entityKey) {
  const cfg = ENTITY_CONFIG[entityKey];
  const st  = _entityState[entityKey];
  let recs  = st.records;

  if (st.q) {
    // TR-2/TL-3: οι πινακίδες έχουν ανάμεικτα ελληνικά/λατινικά ομόγλυφα
    // (ΙΑΖ8302 με ελληνικό γιώτα δίπλα σε IAZ7245 με λατινικό I) και άλλοτε
    // με κενό, άλλοτε χωρίς. Είναι οπτικά ταυτόσημα και δεν βρίσκονταν ΠΟΤΕ
    // μεταξύ τους. Η αναζήτηση δοκιμάζει και την κανονική μορφή· η αρχική
    // αναζήτηση υποστρώματος παραμένει, ώστε να μη χαθεί κανένα αποτέλεσμα.
    const qPlate = (typeof normalizePlate === 'function') ? normalizePlate(st.q) : '';
    recs = recs.filter(r => cfg.searchFields.some(sf => {
      const raw = String(r.fields[sf] || '');
      if (raw.toLowerCase().includes(st.q)) return true;
      return !!qPlate && typeof normalizePlate === 'function'
        && normalizePlate(raw).includes(qPlate);
    }));
  }
  for (const [field, { val, type }] of Object.entries(st.filters)) {
    const pred = _entityFilterPred(cfg, field, val, type);
    if (pred) recs = recs.filter(pred);
  }

  st.filtered = recs;
  const noun = cfg.countNoun || ['εγγραφή', 'εγγραφές'];
  document.getElementById(entityKey + '_table').innerHTML = buildEntityTable(entityKey, recs);
  // Η ΜΟΝΗ διαδρομή που αποδίδει τον πίνακα και για τις έξι οθόνες — άρα και το
  // μόνο σημείο που χρειάζεται ο κανόνας των κενών στηλών.
  collapseEmptyColumns(entityKey + '_table', 'entity:' + entityKey);
  // When the table is capped, the count says so HERE, at the top, and not
  // only in the footer 500 rows down that nobody scrolls to (principle 1).
  const capped = recs.length > ENTITY_RENDER_CAP ? `πρώτες ${ENTITY_RENDER_CAP} από ` : '';
  document.getElementById(entityKey + '_count').textContent =
    capped + recs.length.toLocaleString('el-GR') + ' ' + (recs.length === 1 ? noun[0] : noun[1]);
}

// ── Detail Panel ──────────────────────────────────
function selectEntity(entityKey, recId) {
  const cfg = ENTITY_CONFIG[entityKey];
  const st  = _entityState[entityKey];
  const rec = st.records.find(r => r.id === recId);
  if (!rec) return;

  document.querySelectorAll(`#${entityKey}_table tbody tr`).forEach(tr => tr.classList.remove('selected'));
  const row = document.getElementById('row_' + recId);
  if (row) row.classList.add('selected');

  const panel = document.getElementById(entityKey + '_detail');
  panel.classList.remove('hidden');

  if (cfg.v2) { _renderEntityCardV2(entityKey, rec, panel); return; }

  const f = rec.fields;
  const primaryField = cfg.columns.find(c => c.primary)?.field || Object.keys(f)[0];
  const title = f[primaryField] || recId.slice(-6);
  const canEdit = can(cfg.perm) === 'full';

  panel.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">${title}</div>
      <div class="detail-actions">
        ${(entityKey === 'trucks' || entityKey === 'trailers') ? `<button type="button" class="btn btn-ghost btn-sm" title="Ιστορικό service αυτού του οχήματος" onclick="_openVehicleHistory('${entityKey}','${(f['License Plate']||'').replace(/'/g,"\\'")}')">Ιστορικό ›</button>` : ''}
        ${canEdit ? `<button type="button" class="btn-icon" title="Edit" onclick="openEntityEdit('${entityKey}','${recId}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M11 2l3 3-9 9H2v-3l9-9z"/>
          </svg>
        </button>
        <button class="active-toggle ${f['Active'] ? 'on' : 'off'}" onclick="toggleActive('${entityKey}','${recId}',${!f['Active']})">
          ${f['Active'] ? '● Active' : '○ Inactive'}
        </button>` : ''}
        <button type="button" class="btn-icon" onclick="document.getElementById('${entityKey}_detail').classList.add('hidden')">✕</button>
      </div>
    </div>
    <div class="detail-body">
      ${cfg.detailSections.map(sec => `
        <div class="detail-section">
          <div class="detail-section-title">${sec.title}</div>
          ${sec.fields.map(field => {
            let val = f[field];
            if (val == null || val === '') return '';
            let displayVal = val;
            if (typeof val === 'boolean') displayVal = val ? 'Yes' : 'No';
            if (field.includes('Expiry') || field.includes('Date')) displayVal = expiryLabel(val);
            // PA-5: the raw DB field name leaked to the UI — «Adress» (the
            // PARTNERS/CLIENTS typo) was shown verbatim. The form already
            // defines a display label per field; reuse it here. The DB field
            // name itself must NOT change — records and filters depend on it.
            const fdef = (cfg.formFields || []).flatMap(s2 => s2.fields).find(x => x.f === field);
            const lbl = fdef?.label || field;
            if (fdef?.unit) displayVal = `${displayVal} ${fdef.unit}`;
            return `<div class="detail-field">
              <span class="detail-field-label">${lbl}</span>
              <span class="detail-field-value">${displayVal}</span>
            </div>`;
          }).join('')}
        </div>
      `).join('')}
      ${cfg.history ? `<div class="detail-section">
        <div class="detail-section-title">${cfg.history.type==='partner'?'Assignments & Performance':cfg.history.type==='client'?'Orders & Performance':'Order History'}</div>
        <div id="entity_history_${recId}" style="font-size:11px;color:var(--text-dim)">Loading...</div>
      </div>` : ''}
    </div>`;

  // Load order history async
  if (cfg.history) _loadEntityHistory(cfg.history.type, recId, title);
}

// ── Record card v2 (Wave 1, Figma truck-overview 103:290) ──────────────────
// Instant half: header, documents, specs — everything already on the record.
// Async half: mileage, round trips, damages — each section fetches on its own
// and each failure speaks for itself (rule #7): a dead backend section shows a
// warning, never a blank. Section bodies carry the record id in their DOM ids,
// so a response landing after the user selected ANOTHER record finds no
// element and silently expires instead of painting stale data.

function _ecEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function _ecDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return _ecEsc(d);
  return dt.toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '');
}

// ct_round_trips.status vocabulary (owner 5/9/2026) — no RT code on screen,
// so the status word is the only thing the card says about where a round
// trip stands. An unmapped value falls back to the raw text (K3: unknown is
// shown, never hidden as if it matched one of the known five).
const RT_STATUS_WORD = { planned: 'προγραμματισμένο', in_progress: 'σε εξέλιξη', closed: 'κλειστό', complete: 'ολοκληρωμένο', cancelled: 'ακυρωμένο' };

function _ecRange(a, b) {
  const da = a ? new Date(a) : null, db = b ? new Date(b) : null;
  const fm = d => d.toLocaleDateString('el-GR', { day: '2-digit', month: 'short' }).replace(/\./g, '');
  if (da && db) {
    if (da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear())
      return String(da.getDate()).padStart(2, '0') + '–' + fm(db);
    return fm(da) + ' – ' + fm(db);
  }
  return da ? fm(da) : db ? fm(db) : '—';
}

// Document line: the words carry the meaning, the color only repeats it
// (rule #2). A missing date is said out loud — a truck with no recorded ΚΤΕΟ
// is exactly what the audit found months late (rule #3: unknown is not fine).
function _ecDocState(val) {
  if (!val) return { dot: 'none', text: 'δεν έχει καταχωρηθεί', cls: 'dim', date: '—' };
  const days = Math.ceil((new Date(val) - new Date()) / 86400000);
  if (days < 0)   return { dot: 'bad',  text: `έληξε πριν ${Math.abs(days)} ${Math.abs(days) === 1 ? 'ημέρα' : 'ημέρες'}`, cls: 'bad',  date: _ecDate(val) };
  if (days <= 30) return { dot: 'warn', text: `λήγει σε ${days} ${days === 1 ? 'ημέρα' : 'ημέρες'}`, cls: 'warn', date: _ecDate(val) };
  return { dot: 'ok', text: 'εντάξει', cls: 'ok', date: _ecDate(val) };
}

const _ecPlate = s => (typeof normalizePlate === 'function')
  ? normalizePlate(s) : String(s || '').toUpperCase().replace(/\s/g, '');

function _renderEntityCardV2(entityKey, rec, panel) {
  const cfg = ENTITY_CONFIG[entityKey];
  const f = rec.fields;
  const recId = rec.id;
  const canEdit = can(cfg.perm) === 'full';
  const primaryField = cfg.columns.find(c => c.primary)?.field || Object.keys(f)[0];
  const title = f[primaryField] || recId.slice(-6);
  // Phones render formatted, same as the list column (DV-7).
  const sub = (cfg.cardSubtitle || []).map(x => x === 'Phone' ? _fmtPhone(f[x]) : f[x]).filter(Boolean).join(cfg.cardSubtitleSep || ' ')
    + (cfg.cardSubtitleExtra && f[cfg.cardSubtitleExtra] ? ' · ' + f[cfg.cardSubtitleExtra] : '');
  const [onL, offL] = cfg.activeLabels || ['Ενεργό', 'Ανενεργό'];
  // Type badge next to the status badge (trailer-card mock: ΨΥΓΕΙΟ).
  const tagV = cfg.cardTag ? f[cfg.cardTag.f] : null;
  const tagHTML = tagV
    ? `<span class="badge ${cfg.cardTag.style || ((cfg.cardTag.emphasize || []).includes(tagV) ? 'ev2-tag-hi' : 'badge-grey')}">${_ecEsc((cfg.typeLabels && cfg.typeLabels[tagV]) || tagV)}</span>`
    : '';

  const docsHTML = (cfg.cardDocs || []).map(d => {
    const s = _ecDocState(f[d.f]);
    // labelField: the row can lead with a value from the record itself —
    // the driver card shows the licence NUMBER, not a static word.
    const lbl = d.labelField ? (f[d.labelField] || d.label) : d.label;
    return `<div class="ecard-doc">
      <span class="ecard-dot ${s.dot}"></span>
      <span class="ecard-doc-label">${_ecEsc(lbl)}</span>
      <span class="ecard-doc-date">${s.date}</span>
      <span class="ecard-doc-state ${s.cls}">${s.text}</span>
    </div>`;
  }).join('');

  const specsHTML = (cfg.cardSpecs || []).map(sp => {
    let v = f[sp.f];
    if (v == null || v === '')
      return `<div class="ecard-spec"><span class="ecard-spec-label">${sp.label}</span><span class="ecard-spec-val dim">—</span></div>`;
    if (sp.num && !isNaN(parseFloat(v))) v = parseFloat(v).toLocaleString('el-GR');
    if (sp.phone) v = _fmtPhone(v);
    // Μόνο εμφάνιση, ποτέ η αποθηκευμένη τιμή: το πεδίο κρατά «Euro 6» ενώ η
    // ετικέτα λέει ήδη «Euro» — «Euro | Euro 6». Μετονομασία της ετικέτας δεν
    // γίνεται: το «Euro» είναι ένα από τα 24 πεδία του συμβολαίου (σκληρή
    // πύλη, entity.json) και θα έπεφτε ο κριτής #1.
    if (sp.stripPrefix && typeof v === 'string' && v.startsWith(sp.stripPrefix))
      v = v.slice(sp.stripPrefix.length);
    return `<div class="ecard-spec"><span class="ecard-spec-label">${sp.label}</span><span class="ecard-spec-val">${_ecEsc(v)}${sp.unit ? ` <span class="dim">${sp.unit}</span>` : ''}</span></div>`;
  }).join('');

  // «όλα →» to TRIP PnL only for roles with full costs access — the page is
  // not in anyone else's navigation, and a link into a screen you cannot use
  // is noise, not access.
  const rtLink = (typeof can === 'function' && can('costs') === 'full')
    ? `<button type="button" class="ecard-link" onclick="navigate('costs')">όλα →</button>` : '';

  panel.innerHTML = `
    <div class="ecard-head">
      <div class="ecard-head-main">
        <div class="ecard-title-row">
          <span class="ecard-title">${_ecEsc(title)}</span>
        </div>
        ${/* Status + type pill + meta text on one row under the title
              (Figma client-card 122:636 / driver-overview 116:300) — moved
              out of the title row so a long name never pushes the pills off
              to one side. One status indicator only: canEdit gets the LIVE
              button (still calling toggleActive, styled as the same pill so
              it doesn't read as a second, different control); read-only
              roles keep the static badge. Two indicators of the same state
              at once was the audit-29/8 bug this replaces, not reintroduces. */''}
        <div class="ecard-meta-row">
          ${canEdit
            ? `<button type="button" class="badge ${f['Active'] ? 'badge-green' : 'badge-grey'}" onclick="toggleActive('${entityKey}','${recId}',${!f['Active']})">${f['Active'] ? onL : offL}</button>`
            : `<span class="badge ${f['Active'] ? 'badge-green' : 'badge-grey'}">${f['Active'] ? onL : offL}</span>`}
          ${tagHTML}
          ${sub ? `<span class="ecard-sub">${_ecEsc(sub)}</span>` : ''}
          <span id="ec_${recId}_svc"></span>
        </div>
      </div>
      <div class="detail-actions">
        ${canEdit ? `<button type="button" class="btn-icon" title="Επεξεργασία" onclick="openEntityEdit('${entityKey}','${recId}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 2l3 3-9 9H2v-3l9-9z"/></svg>
        </button>` : ''}
        <button type="button" class="btn-icon" onclick="document.getElementById('${entityKey}_detail').classList.add('hidden')">✕</button>
      </div>
    </div>
    <div class="detail-body ecard-body">
      ${cfg.cardKm ? `<div class="ecard-sec">
        <div class="ecard-sec-title">Χιλιόμετρα</div>
        <div class="ecard-sec-body" id="ec_${recId}_km">Φόρτωση…</div>
      </div>` : ''}
      ${(cfg.cardDocs || []).length ? `<div class="ecard-sec">
        <div class="ecard-sec-title">${cfg.cardDocsTitle || 'Έγγραφα'}
          ${cfg.cardDocsLink === false ? '' : `<button type="button" class="ecard-link" onclick="navigate('maint_expiry')">Διαχείριση →</button>`}
        </div>
        ${docsHTML}
      </div>` : ''}
      ${cfg.cardNotice && (!cfg.cardNotice.perm || can(cfg.perm) === cfg.cardNotice.perm) ? `<div class="ecard-sec">
        <div class="ecard-sec-title">${cfg.cardNotice.title}</div>
        ${f[cfg.cardNotice.f] != null && f[cfg.cardNotice.f] !== ''
          ? `<div class="ecard-spec-val">${_ecEsc(f[cfg.cardNotice.f])}</div>`
          : `<div class="ecard-empty">${cfg.cardNotice.emptyText}</div>
             ${cfg.cardNotice.helper ? `<div class="ecard-km-sub">${cfg.cardNotice.helper}</div>` : ''}`}
      </div>` : ''}
      ${(cfg.cardSpecs || []).length ? `<div class="ecard-sec">
        <div class="ecard-sec-title">${cfg.cardSpecsTitle || 'Στοιχεία οχήματος'}</div>
        ${specsHTML}
      </div>` : ''}
      ${cfg.cardUsage ? `<div class="ecard-sec">
        <div class="ecard-sec-title">Χρήση</div>
        <div class="ecard-usage">
          <div class="ecard-usage-item"><span class="ecard-usage-num">${f['_serviceCount'] != null ? f['_serviceCount'] : '—'}</span><span class="ecard-usage-lbl">εργασίες</span></div>
          <div class="ecard-usage-item"><span class="ecard-usage-num">${f['_totalSpend'] != null ? '€' + Math.round(f['_totalSpend']).toLocaleString('el-GR') : '—'}</span><span class="ecard-usage-lbl">δαπάνη</span></div>
          <div class="ecard-usage-item"><span class="ecard-usage-num">${f['_lastUsed'] ? _ecDate(f['_lastUsed']) : '—'}</span><span class="ecard-usage-lbl">τελευταία</span></div>
        </div>
      </div>` : ''}
      ${cfg.cardRt ? `<div class="ecard-sec">
        <div class="ecard-sec-title">Round trips ${rtLink}</div>
        <div class="ecard-sec-body" id="ec_${recId}_rt">Φόρτωση…</div>
      </div>` : ''}
      ${cfg.cardTruckAgg ? `<div class="ecard-sec">
        <div class="ecard-sec-title">Με ποια φορτηγά</div>
        <div class="ecard-sec-body" id="ec_${recId}_agg">Φόρτωση…</div>
      </div>` : ''}
      ${cfg.cardActivity ? `<div class="ecard-sec">
        <div class="ecard-sec-title">${cfg.cardActivityTitle || 'Δραστηριότητα'}</div>
        <div class="ecard-sec-body" id="ec_${recId}_act">Φόρτωση…</div>
      </div>
      <div class="ecard-sec">
        <div class="ecard-sec-title">${cfg.cardRecentTitle || 'Πρόσφατες'}
          ${cfg.cardActivity === 'orders' ? `<button type="button" class="ecard-link" onclick="navigate('orders_intl')">όλες →</button>` : ''}
        </div>
        <div class="ecard-sec-body" id="ec_${recId}_recent">Φόρτωση…</div>
      </div>` : ''}
      ${cfg.cardMaint ? `<div class="ecard-sec">
        <div class="ecard-sec-title">${cfg.cardMaintTitle || 'Ζημιές & επισκευές'}
          ${cfg.cardMaintBy === 'workshop'
            ? `<button type="button" class="ecard-link" onclick="navigate('maint_svc')">όλες →</button>`
            : `<button type="button" class="ecard-link" onclick="_openVehicleHistory('${entityKey}','${String(f['License Plate'] || '').replace(/'/g, "\\'")}')">όλα →</button>`}
        </div>
        <div class="ecard-sec-body" id="ec_${recId}_mh">Φόρτωση…</div>
      </div>` : ''}
    </div>`;

  if (cfg.cardMaint) _loadEntityCardMaint(entityKey, rec);
  if (cfg.cardRt) _loadEntityCardRT(entityKey, rec);
  if (cfg.cardActivity) _loadEntityCardActivity(entityKey, rec);
}

async function _loadEntityCardMaint(entityKey, rec) {
  const cfg = ENTITY_CONFIG[entityKey];
  const recId = rec.id;
  const plate = String(rec.fields['License Plate'] || '');
  const byWorkshop = cfg && cfg.cardMaintBy === 'workshop';
  try {
    const hist = await atGetAll(TABLES.MAINT_HISTORY, {
      fields: ['Truck', 'Trailer', 'Workshop', 'Vehicle Plate', 'Date', 'Description', 'Type', 'Cost', 'Odometer km'],
    }, true);
    // Fetch ALL and filter client-side, like modules/maintenance.js does: the
    // link field is authoritative, the plate string is the legacy fallback —
    // and plates need normalizePlate (Greek/Latin homoglyphs, TR-2).
    const linkField = byWorkshop ? 'Workshop' : (entityKey === 'trailers' ? 'Trailer' : 'Truck');
    const mine = hist.filter(r =>
      ((r.fields[linkField] || [])[0] === recId) ||
      (!byWorkshop && !!plate && _ecPlate(r.fields['Vehicle Plate']) === _ecPlate(plate))
    ).sort((a, b) => String(b.fields['Date'] || '').localeCompare(String(a.fields['Date'] || '')));

    const kmEl = document.getElementById(`ec_${recId}_km`);
    if (kmEl) {
      // Latest recorded odometer reading. NOT a live odometer: 72/1091 history
      // rows carry a reading (measured 29/8), so absence is the common case
      // and must say so instead of showing a stale-looking zero (rule #3).
      // The mock's «επόμενο σέρβις» progress bar is NOT built: next_service_km
      // is 0/1091 — unbacked design, recorded in OBSERVATIONS for the owner.
      const withOdo = mine.filter(r => r.fields['Odometer km'] != null && r.fields['Odometer km'] !== '');
      kmEl.innerHTML = withOdo.length
        ? `<div class="ecard-km"><span class="ecard-km-num">${parseFloat(withOdo[0].fields['Odometer km']).toLocaleString('el-GR')}</span><span class="ecard-km-unit">χλμ</span></div>
           <div class="ecard-km-sub">τελευταία ένδειξη σε σέρβις · ${_ecDate(withOdo[0].fields['Date'])}</div>`
        : `<div class="ecard-empty">Δεν έχει καταχωρηθεί ένδειξη χιλιομέτρων.</div>`;
    }

    const mhEl = document.getElementById(`ec_${recId}_mh`);
    if (mhEl) {
      // Σύνοψη ζημιών/επισκευών (owner 30/8): «εκτός από τις σημειώσεις ανά
      // record να γράφουν και γενικά στατιστικά — σύνολο ζημιών».
      // Το κόστος δείχνει «—» όταν ΚΑΜΙΑ εργασία δεν έχει καταχωρημένο ποσό:
      // κανόνας #3 — «δεν κοστολογήθηκε» δεν είναι «κόστισε 0». Οι εργασίες
      // ΧΩΡΙΣ ποσό μετριούνται χωριστά, ώστε ένα χαμηλό σύνολο να μη
      // διαβάζεται ως «φθηνό όχημα» ενώ απλώς λείπουν τιμολόγια.
      const costs = mine.map(r => r.fields['Cost']).filter(c => c != null && c !== '');
      const totalCost = costs.reduce((s, c) => s + (parseFloat(c) || 0), 0);
      const noCost = mine.length - costs.length;
      const sumHTML = mine.length ? `<div class="ecard-usage">
          <div class="ecard-usage-item"><span class="ecard-usage-num">${mine.length}</span><span class="ecard-usage-lbl">${mine.length === 1 ? 'εργασία' : 'εργασίες'}</span></div>
          <div class="ecard-usage-item"><span class="ecard-usage-num">${costs.length ? '€' + Math.round(totalCost).toLocaleString('el-GR') : '—'}</span><span class="ecard-usage-lbl">σύνολο</span></div>
          ${noCost ? `<div class="ecard-usage-item"><span class="ecard-usage-num">${noCost}</span><span class="ecard-usage-lbl">χωρίς κόστος</span></div>` : ''}
        </div>` : '';
      mhEl.innerHTML = mine.length
        ? sumHTML + mine.slice(0, 3).map(r => {
            const rf = r.fields;
            const cost = rf['Cost'] != null && rf['Cost'] !== ''
              ? '€' + Math.round(parseFloat(rf['Cost']) || 0).toLocaleString('el-GR') : '—';
            // Workshop card leads with the amount (mock 122:762) and names the
            // vehicle; vehicle cards lead with the date.
            return byWorkshop
              ? `<div class="ecard-row">
                  <span class="ecard-row-code">${cost}</span>
                  <span class="ecard-row-date">${_ecDate(rf['Date'])}</span>
                  <span class="ecard-row-main">${_ecEsc([rf['Vehicle Plate'], rf['Description'] || rf['Type']].filter(Boolean).join(' — ') || '—')}</span>
                </div>`
              : `<div class="ecard-row">
              <span class="ecard-row-date">${_ecDate(rf['Date'])}</span>
              <span class="ecard-row-main">${_ecEsc(rf['Description'] || rf['Type'] || '—')}</span>
              <span class="ecard-row-amt">${cost}</span>
            </div>`;
          }).join('') + (mine.length > 3 ? `<div class="ecard-more">+${mine.length - 3} ακόμη</div>` : '')
        : `<div class="ecard-empty">Καμία εργασία καταγεγραμμένη ${byWorkshop ? 'για αυτό το συνεργείο' : 'για αυτό το όχημα'}.</div>`;
    }
  } catch (e) {
    // ΜΙΑ αποτυχία → ΕΝΑ μήνυμα. Πριν (audit 29/8) η ίδια πρόταση γραφόταν
    // και στις δύο ενότητες, και μαζί με το «δεν φόρτωσαν τα δρομολόγια» η
    // καρτέλα φορτηγού έδειχνε ΤΡΙΑ προειδοποιητικά — από δύο αιτίες. Δεν
    // ήταν πιο ειλικρινής, φαινόταν σπασμένη.
    //
    // Το μήνυμα μένει στο «mh» (ΖΗΜΙΕΣ & ΕΠΙΣΚΕΥΕΣ), που ΕΙΝΑΙ το ιστορικό
    // συντήρησης. Τα ΧΙΛΙΟΜΕΤΡΑ είναι ΠΑΡΑΓΩΓΟ αυτού, οπότε παίρνουν «—»:
    // κανόνας #3 (άγνωστο, όχι μηδέν) και κανόνας #1 τηρείται — η αποτυχία
    // ακούγεται, μία φορά, στην ενότητα που της ανήκει.
    const kmEl = document.getElementById(`ec_${recId}_km`);
    if (kmEl) kmEl.innerHTML = `<div class="ecard-empty">—</div>`;
    const mhFail = document.getElementById(`ec_${recId}_mh`);
    if (mhFail) mhFail.innerHTML = `<div class="ecard-fail">⚠ Δεν φόρτωσε το ιστορικό συντήρησης.</div>`;
    if (typeof logError === 'function') logError(e, 'entity card: maint history');
  }

  // «ΣΕ ΣΕΡΒΙΣ»: an open In-Progress maintenance request on this plate.
  // Supplementary — its failure is logged but must not take the card down.
  try {
    if (!plate) return;   // workshops: no plate, no «ΣΕ ΣΕΡΒΙΣ» badge to compute
    const reqs = await atGetAll(TABLES.MAINT_REQ, { fields: ['Vehicle Plate', 'Status'] }, true);
    const inSvc = reqs.some(r => r.fields['Status'] === 'In Progress'
      && !!plate && _ecPlate(r.fields['Vehicle Plate']) === _ecPlate(plate));
    const el = document.getElementById(`ec_${recId}_svc`);
    if (el && inSvc) el.innerHTML = `<span class="badge ecard-badge-svc">ΣΕ ΣΕΡΒΙΣ</span>`;
  } catch (e) {
    if (typeof logError === 'function') logError(e, 'entity card: maint_req');
  }
}

async function _loadEntityCardRT(entityKey, rec) {
  const cfg = ENTITY_CONFIG[entityKey];
  const recId = rec.id;
  const body = () => document.getElementById(`ec_${recId}_rt`);
  try {
    if (typeof ctFetch !== 'function') throw new Error('ctFetch unavailable');
    // /costs/rt carries NO money columns (worker: «λίστα ΧΩΡΙΣ αποτελέσματα
    // PnL») — safe for every role that can read it. Entity facade IDs (recXXXX)
    // map via /costs/lookups.legacy_id to Postgres IDs for filtering round trips.
    // This avoids fragile name/plate string matching (spelling variants, renames).
    const isTrailer = entityKey === 'trailers';
    const isDriver = entityKey === 'drivers';
    const lk = await ctFetch('/costs/lookups');
    // Match this entity record's facade ID (recId) to find the Postgres ID
    const pgId = isDriver
      ? (lk.drivers || []).find(x => x.legacy_id === recId)?.id
      : ((isTrailer ? lk.trailers : lk.trucks) || [])
          .find(x => x.legacy_id === recId)?.id;
    let el = body();
    if (!el) return;
    if (pgId === undefined) {
      const noMatch = `<div class="ecard-empty">${isDriver ? 'Ο οδηγός' : 'Το όχημα'} δεν έχει αντιστοιχιστεί στα δρομολόγια κόστους.</div>`;
      el.innerHTML = noMatch;
      // The aggregation feeds off the same match — it must not stay «Φόρτωση…».
      const aggE = document.getElementById(`ec_${recId}_agg`);
      if (aggE) aggE.innerHTML = noMatch;
      return;
    }
    // Fetch round trips filtered by the Postgres ID; for trucks, the worker
    // handles the filter server-side. For drivers/trailers, filter client-side.
    const res = await ctFetch(isTrailer || isDriver ? '/costs/rt' : '/costs/rt?truck_id=' + pgId);
    el = body();
    if (!el) return;
    let recsAll = res.records || [];
    if (isTrailer) recsAll = recsAll.filter(r => r.trailer_id === pgId);
    if (isDriver)  recsAll = recsAll.filter(r => r.driver_id === pgId);
    const rts = recsAll.slice(0, 5);
    const plateById = {};
    for (const x of lk.trucks || []) plateById[x.id] = x.license_plate;
    // Leg block (owner 5/9): /costs/rt now carries route_legs from
    // dl_v_rt_route (migration 012, merged in the worker) — same shape and
    // renderer as the driver ledger (core/utils.js:rtLegBlockHtml), so this
    // card and the ledger never disagree on what a leg shows (αρχή 3).
    // No RT code on screen (owner rule) — it only lives in the title attr.
    el.innerHTML = rts.length
      ? rts.map(rt => {
          const status = RT_STATUS_WORD[rt.status] || _ecEsc(rt.status || '—');
          const legs = Array.isArray(rt.route_legs) && rt.route_legs.length
            ? rtLegBlockHtml(rt.route_legs)
            : `<div class="ecard-empty">${rt.route_text ? _ecEsc(rt.route_text) : 'Καμία καταγεγραμμένη διαδρομή.'}</div>`;
          return `<div class="ecard-rt" title="${_ecEsc(rt.code || ('RT-' + rt.id))}">
            <div class="ecard-rt-head">
              <span class="ecard-row-date">${_ecRange(rt.date_start, rt.date_end)}</span>
              <span class="ecard-row-state">${status}</span>
            </div>
            ${legs}
          </div>`;
        }).join('')
      : `<div class="ecard-empty">Καμία καταγεγραμμένη διαδρομή.</div>`;

    // «Με ποια φορτηγά» (driver card): per-truck round-trip counts from the
    // SAME fetch — bars are relative to the driver's own busiest truck.
    if (cfg && cfg.cardTruckAgg) {
      const aggEl = document.getElementById(`ec_${recId}_agg`);
      if (aggEl) {
        const byTruck = {};
        for (const r of recsAll) {
          if (r.truck_id == null) continue;
          byTruck[r.truck_id] = (byTruck[r.truck_id] || 0) + 1;
        }
        const rows = Object.entries(byTruck).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const max = rows.length ? rows[0][1] : 0;
        aggEl.innerHTML = rows.length
          ? rows.map(([tid, n]) => `<div class="ecard-agg-row">
              <span class="ecard-row-code">${_ecEsc(plateById[tid] || ('#' + tid))}</span>
              <span class="ecard-agg-n">${n} round trip${n === 1 ? '' : 's'}</span>
              <span class="ecard-agg-bar"><span style="width:${Math.round(n / max * 100)}%"></span></span>
            </div>`).join('')
          : `<div class="ecard-empty">Καμία καταγεγραμμένη διαδρομή.</div>`;
      }
    }
  } catch (e) {
    // A 403 is an answer, not an outage — say which of the two it is. The
    // aggregation feeds off the same fetch, so it fails alongside.
    const msg = /forbidden|403/i.test(String(e && e.message))
      ? `<div class="ecard-empty">Ο ρόλος σου δεν έχει πρόσβαση στα δρομολόγια.</div>`
      : `<div class="ecard-fail">⚠ Δεν φόρτωσαν τα δρομολόγια.</div>`;
    const el = body();
    if (el) el.innerHTML = msg;
    const aggEl = document.getElementById(`ec_${recId}_agg`);
    if (aggEl) aggEl.innerHTML = msg;
    if (typeof logError === 'function') logError(e, 'entity card: round trips');
  }
}

// ── Activity (clients: orders · partners: assignments) ─────────────────────
// Volume and frequency ONLY — no prices, no margins, no rates: the dispatcher
// has full access to these screens and never sees P&L (owner lock 23/8). The
// fetches deliberately exclude every money field the old panel used to pull.
// ── Επίδοση παράδοσης — ΕΝΑΣ ορισμός για όλες τις καρτέλες ─────────────────
// ΟΡΙΣΜΟΣ (owner 30/8/2026): «στην ώρα του» είναι ό,τι ο dispatcher σήμανε
// «Παραδόθηκε». Το κουμπί «Delay» γράφει 'Delayed'. Τελεία.
//
// ⛔ ΜΗΝ ΤΟ ΥΠΟΛΟΓΙΣΕΙΣ ΠΟΤΕ ΑΠΟ ΗΜΕΡΟΜΗΝΙΕΣ. Το actual_delivery_date
// καταγράφει ΠΟΤΕ ΠΑΤΗΘΗΚΕ ΤΟ ΚΟΥΜΠΙ, όχι πότε παραδόθηκε το φορτίο: η ομάδα
// δουλεύει 05:30-14:30, οπότε μια παράδοση Κυριακής σημαίνεται τη Δευτέρα.
// Μετρημένο 30/8: 51 από 89 έχουν actual > planned και ΚΑΜΙΑ δεν είναι
// αργοπορία. Ένας «έξυπνος» υπολογισμός από ημερομηνίες θα κατηγορούσε
// οδηγούς για 51 αργοπορίες που δεν συνέβησαν ποτέ.
//
// Επιστρέφει null όταν καμία εγγραφή δεν έχει ένδειξη — κανόνας #3: «δεν
// ξέρουμε» δεν γράφεται 0%.
function _ecOnTime(perfValues) {
  const judged = perfValues.filter(p => p === 'On Time' || p === 'Delayed');
  if (!judged.length) return null;
  const onTime = judged.filter(p => p === 'On Time').length;
  // «unjudged» = όσες δεν κρίθηκαν ποτέ. Εμφανίζεται δίπλα στο ποσοστό, ώστε
  // ένα 100% από 3 στις 40 να μη διαβάζεται σαν 100% από 40.
  return { pct: Math.round(onTime * 100 / judged.length), judged: judged.length,
           unjudged: perfValues.length - judged.length };
}

async function _loadEntityCardActivity(entityKey, rec) {
  const cfg = ENTITY_CONFIG[entityKey];
  const recId = rec.id;
  const actEl = () => document.getElementById(`ec_${recId}_act`);
  const recEl = () => document.getElementById(`ec_${recId}_recent`);
  const kpi = (n, l) => `<div class="ecard-usage-item"><span class="ecard-usage-num">${n}</span><span class="ecard-usage-lbl">${l}</span></div>`;
  try {
    let rows = [], k1, k2, k3, k4 = '', k5 = '';
    if (cfg.cardActivity === 'orders') {
      // Ο σύνδεσμος είναι παραμετρικός: πελάτης → {Client}, οδηγός → {Driver}.
      // Έτσι ο ΟΡΙΣΜΟΣ της επίδοσης μένει ΕΝΑΣ (αρχή 3)· χωρίς αυτό η καρτέλα
      // οδηγού θα χρειαζόταν δεύτερο, παράλληλο υπολογισμό.
      const linkField = cfg.cardActivityLink || 'Client';
      const filter = `FIND("${recId}", ARRAYJOIN({${linkField}}, ","))>0`;
      const [intl, natl] = await Promise.all([
        // «Delivery Performance» + «Price»: ο owner ζήτησε 30/8 ποσοστό
        // παράδοσης και τζίρο ανά πελάτη. Μπαίνουν στο ΥΠΑΡΧΟΝ fetch —
        // κανένα νέο αίτημα, καμία αλλαγή απόδοσης.
        atGetAll(TABLES.ORDERS,     { filterByFormula: filter, fields: ['Reference', 'Loading Location 1', 'Unloading Location 1', 'Loading DateTime', 'Delivery Performance', 'Price'] }, false),
        atGetAll(TABLES.NAT_ORDERS, { filterByFormula: filter, fields: ['Reference', 'Pickup Location 1', 'Delivery Location 1', 'Loading DateTime', 'Delivery Performance', 'Price'] }, false),
      ]);
      const all = [
        ...intl.map(r => ({ ref: r.fields['Reference'],
          date: String(r.fields['Loading DateTime'] || '').slice(0, 10),
          perf: r.fields['Delivery Performance'] || '',
          price: parseFloat(r.fields['Price']) || 0,
          route: (typeof orderRoute === 'function' && orderRoute(r.fields, 24)) || '' })),
        ...natl.map(r => ({ ref: r.fields['Reference'],
          date: toLocalDate(r.fields['Loading DateTime']),
          perf: r.fields['Delivery Performance'] || '',
          price: parseFloat(r.fields['Price']) || 0,
          route: `${getLocationName(getLinkedId(r.fields['Pickup Location 1'])) || '—'} → ${getLocationName(getLinkedId(r.fields['Delivery Location 1'])) || '—'}` })),
      ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      rows = all.slice(0, 3).map(o => ({ code: o.ref ? '#' + o.ref : '—', date: o.date, main: o.route || '—' }));
      const total = all.length;
      const lastD = total ? all[0].date : null;
      // Lifetime monthly rate: total / months between first and last order
      // (min one month) — the mock's «4,2 τον μήνα», computed honestly.
      let perMonth = null;
      if (total) {
        const firstD = all[total - 1].date;
        const months = Math.max(1, (new Date(lastD) - new Date(firstD)) / (30.44 * 86400000));
        perMonth = (total / months).toLocaleString('el-GR', { maximumFractionDigits: 1 });
      }
      k1 = kpi(total, total === 1 ? 'παραγγελία' : 'παραγγελίες');
      k2 = kpi(lastD ? _ecDate(lastD) : '—', 'τελευταία');
      k3 = kpi(perMonth != null ? perMonth : '—', 'τον μήνα');
      // Ποσοστό παράδοσης + τζίρος (owner 30/8). Το ποσοστό δείχνει ΠΑΝΤΑ σε
      // πόσες παραγγελίες στηρίζεται: «100%» από 3 κρίσεις δεν είναι το ίδιο
      // πράγμα με «100%» από 300, και χωρίς τον παρονομαστή διαβάζονται ίδια.
      const ot = _ecOnTime(all.map(o => o.perf));
      k4 = kpi(ot ? ot.pct + '%' : '—', ot ? `στην ώρα (${ot.judged})` : 'στην ώρα');
      // Τζίρος ΜΟΝΟ για πελάτη: το ίδιο ποσό στην καρτέλα οδηγού θα διαβαζόταν
      // ως αμοιβή του οδηγού, ενώ είναι έσοδο από τον πελάτη.
      if (linkField === 'Client') {
        const rev = all.reduce((s, o) => s + o.price, 0);
        k5 = kpi(rev ? '€' + Math.round(rev).toLocaleString('el-GR') : '—', 'τζίρος');
      }
    } else {
      const pa = await paListByPartner(recId);
      const activeN = pa.filter(r => ['Assigned', 'In Transit'].includes(r.fields[F.PA_STATUS] || '')).length;
      const sorted = [...pa].sort((a, b) => String(b.fields[F.PA_ASSIGN_DATE] || '').localeCompare(String(a.fields[F.PA_ASSIGN_DATE] || '')));
      rows = sorted.slice(0, 3).map(r => ({
        code: (Array.isArray(r.fields[F.PA_ORDER]) && r.fields[F.PA_ORDER].length) ? 'INTL' : 'NAT',
        date: String(r.fields[F.PA_ASSIGN_DATE] || '').slice(0, 10),
        main: r.fields[F.PA_STATUS] || '—',
      }));
      k1 = kpi(pa.length, pa.length === 1 ? 'ανάθεση' : 'αναθέσεις');
      k2 = kpi(sorted.length && sorted[0].fields[F.PA_ASSIGN_DATE]
        ? _ecDate(String(sorted[0].fields[F.PA_ASSIGN_DATE]).slice(0, 10)) : '—', 'τελευταία');
      k3 = kpi(activeN, activeN === 1 ? 'ενεργή' : 'ενεργές');
      // Τζίρος συνεργάτη = τι του πληρώσαμε. Δωρεάν: το paListByPartner ζητά
      // ΟΛΑ τα πεδία ({}), οπότε το Rate έχει ήδη έρθει.
      const paid = pa.reduce((s, r) => s + (parseFloat(r.fields[F.PA_RATE]) || 0), 0);
      k5 = kpi(paid ? '€' + Math.round(paid).toLocaleString('el-GR') : '—', 'τζίρος');
      // Ποσοστό παράδοσης: η επίδοση ζει στην ΠΑΡΑΓΓΕΛΙΑ, όχι στην ανάθεση.
      // Χωριστό try ώστε μια αποτυχία εδώ να χάνει ΜΟΝΟ αυτό το νούμερο και
      // όχι όλη την καρτέλα. Χωρίς filterByFormula: ο πίνακας έχει ~100
      // γραμμές και είναι στην cache· ένα φίλτρο σε άγνωστο πεδίο θα γύριζε
      // 422 (η μόνη διαδρομή του facade που κάνει θόρυβο).
      try {
        const linked = new Set(pa.flatMap(r => r.fields[F.PA_ORDER] || []));
        if (linked.size) {
          const ords = await atGetAll(TABLES.ORDERS, { fields: ['Delivery Performance'] }, false);
          const ot = _ecOnTime(ords.filter(o => linked.has(o.id))
            .map(o => o.fields['Delivery Performance'] || ''));
          if (ot) k4 = kpi(ot.pct + '%', `στην ώρα (${ot.judged})`);
        }
      } catch (e) {
        if (typeof logError === 'function') logError(e, 'partner card: on-time');
      }
    }
    const a = actEl();
    if (a) a.innerHTML = `<div class="ecard-usage">${k1}${k2}${k3}${k4}${k5}</div>`;
    const rEl = recEl();
    if (rEl) rEl.innerHTML = rows.length
      ? rows.map(o => `<div class="ecard-row">
          <span class="ecard-row-code">${_ecEsc(o.code)}</span>
          <span class="ecard-row-date">${o.date ? _ecDate(o.date) : '—'}</span>
          <span class="ecard-row-main">${_ecEsc(o.main)}</span>
        </div>`).join('')
      : `<div class="ecard-empty">${cfg.cardActivity === 'orders' ? 'Καμία παραγγελία καταγεγραμμένη.' : 'Καμία ανάθεση καταγεγραμμένη.'}</div>`;
  } catch (e) {
    for (const g of [actEl(), recEl()]) {
      if (g) g.innerHTML = `<div class="ecard-fail">⚠ Δεν φόρτωσε το ιστορικό.</div>`;
    }
    if (typeof logError === 'function') logError(e, 'entity card: activity');
  }
}

// ── Order History for Clients & Partners ─────────
// Two-row cell (DESIGN.md ΜΕΡΟΣ Ζ): origin above, destination below, dimmed.
// Replaces an ellipsis at 120–140px that cut location names — rule #6: the
// dispatcher phones these places, so the name is never clipped.
function _entityRouteCell(route) {
  const parts = String(route || '—').split(' → ');
  if (parts.length < 2) return parts[0];
  return `<div>${parts[0]}</div><div style="color:var(--text-dim)">→ ${parts.slice(1).join(' → ')}</div>`;
}

async function _loadEntityHistory(type, recId, name) {
  const el = document.getElementById('entity_history_' + recId);
  if (!el) return;
  try {
    let orders = [];
    if (type === 'client') {
      // Client linked in ORDERS + NAT_ORDERS tables
      const filter = `FIND("${recId}", ARRAYJOIN({Client}, ","))>0`;
      const [intl, natl] = await Promise.all([
        atGetAll(TABLES.ORDERS,     { filterByFormula: filter, fields: ['Direction','Loading Location 1','Unloading Location 1','Status','Total Pallets','Loading DateTime','Price','Delivery Performance'] }, false),
        atGetAll(TABLES.NAT_ORDERS, { filterByFormula: filter, fields: ['Direction','Pickup Location 1','Delivery Location 1','Status','Pallets','Loading DateTime','Price','Delivery Performance'] }, false),
      ]);
      orders = [
        ...intl.map(r => ({ type:'INTL', dir:r.fields['Direction']||'—', route:orderRoute(r.fields, 20)||'—', status:r.fields['Status']||'—', pals:r.fields['Total Pallets']||0, date:(r.fields['Loading DateTime']||'').substring(0,10), price:parseFloat(r.fields['Price'])||0, perf:r.fields['Delivery Performance']||'' })),
        ...natl.map(r => ({ type:'NATL', dir:r.fields['Direction']||'—', route:`${getLocationName(getLinkedId(r.fields['Pickup Location 1']))||'—'} → ${getLocationName(getLinkedId(r.fields['Delivery Location 1']))||'—'}`, status:r.fields['Status']||'—', pals:r.fields['Pallets']||0, date:toLocalDate(r.fields['Loading DateTime']), price:parseFloat(r.fields['Price'])||0, perf:r.fields['Delivery Performance']||'' })),
      ];
      _renderClientOrders(el, orders);
      return;
    } else if (type === 'partner') {
      // Partner assignments via PARTNER_ASSIGN table (unified INTL + NAT)
      const paRecs = await paListByPartner(recId);
      _renderPartnerAssignments(el, paRecs);
      return;
    }
    orders.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    if (!orders.length) {
      el.innerHTML = '<div style="color:var(--text-dim);padding:8px 0;font-size:11px">No orders found</div>';
      return;
    }
    el.innerHTML = `
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">${orders.length} orders</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Date</th>
          <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Type</th>
          <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Route</th>
          <th style="text-align:center;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Pal</th>
          <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Status</th>
        </tr></thead>
        <tbody>${orders.slice(0,30).map(o => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:4px 6px;color:var(--text-mid)">${o.date||'—'}</td>
          <td style="padding:4px 6px"><span style="font-size:9px;font-weight:700;color:${o.type==='INTL'?'var(--accent)':'var(--success)'}">${o.type}</span></td>
          <td style="padding:4px 6px;color:var(--text)">${_entityRouteCell(o.route)}</td>
          <td style="padding:4px 6px;text-align:center;color:var(--text-mid)">${o.pals}</td>
          <td style="padding:4px 6px"><span class="badge ${o.status==='Delivered'?'badge-green':o.status==='Invoiced'?'badge-blue':o.status==='Assigned'?'badge-yellow':'badge-grey'}" style="font-size:9px">${o.status}</span></td>
        </tr>`).join('')}${orders.length>30?`<tr><td colspan="5" style="padding:6px;text-align:center;color:var(--text-dim)">+${orders.length-30} more</td></tr>`:''}</tbody>
      </table>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:11px">Failed to load orders list</div>`;
    if (typeof logError === 'function') logError(e, 'entity orders table');
  }
}

// ── Partner: render PA metrics cards + assignment history ─────────
function _renderPartnerAssignments(el, paRecs) {
  // Metrics
  const total     = paRecs.length;
  const active    = paRecs.filter(r => ['Assigned','In Transit'].includes(r.fields[F.PA_STATUS]||'')).length;
  const completed = paRecs.filter(r => r.fields[F.PA_STATUS]==='Delivered').length;
  const totalSpent= paRecs.filter(r => r.fields[F.PA_STATUS]==='Delivered')
                          .reduce((s,r)=>s+(parseFloat(r.fields[F.PA_RATE])||0),0);
  const avgRate   = total ? paRecs.reduce((s,r)=>s+(parseFloat(r.fields[F.PA_RATE])||0),0)/total : 0;
  const marginVals= paRecs.map(r=>parseFloat(r.fields['Margin Percent'])).filter(n=>!isNaN(n));
  const avgMargin = marginVals.length ? marginVals.reduce((s,v)=>s+v,0)/marginVals.length : 0;

  const card = (label,val,color) => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:8px">
      <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px">${label}</div>
      <div style="font-size:15px;font-weight:700;color:${color||'var(--text)'};margin-top:2px">${val}</div>
    </div>`;

  const metricsHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px">
      ${card('Σύνολο', total)}
      ${card('Ενεργά', active, active>0?'var(--accent)':'var(--text-dim)')}
      ${card('Completed', completed, 'var(--success)')}
      ${card('Total Spent', '€'+Math.round(totalSpent).toLocaleString())}
      ${card('Avg Rate', '€'+Math.round(avgRate).toLocaleString())}
      ${card('Avg Margin', avgMargin.toFixed(1)+'%', avgMargin>=20?'var(--success)':avgMargin>=10?'var(--warning)':avgMargin>0?'var(--danger)':'var(--text-dim)')}
    </div>`;

  if (!paRecs.length) {
    el.innerHTML = metricsHTML + '<div style="color:var(--text-dim);padding:8px 0;font-size:11px">No assignments yet</div>';
    return;
  }

  // Sort by assignment date desc
  paRecs.sort((a,b)=>(b.fields[F.PA_ASSIGN_DATE]||'').localeCompare(a.fields[F.PA_ASSIGN_DATE]||''));

  const rowsHTML = paRecs.slice(0,30).map(r => {
    const f      = r.fields;
    const date   = (f[F.PA_ASSIGN_DATE]||'').substring(0,10);
    const rate   = parseFloat(f[F.PA_RATE])||0;
    const rev    = parseFloat(f['Client Revenue'])||0;
    const margin = parseFloat(f['Margin Percent']);
    const status = f[F.PA_STATUS]||'—';
    const isOrder= Array.isArray(f[F.PA_ORDER]) && f[F.PA_ORDER].length;
    const kind   = isOrder ? 'INTL' : 'NAT';
    const kindColor = isOrder ? 'var(--accent)' : 'var(--success)';
    const marginTxt = isNaN(margin) ? '—' : margin.toFixed(1)+'%';
    const marginColor = isNaN(margin) ? 'var(--text-dim)' : margin>=20?'var(--success)':margin>=10?'var(--warning)':'var(--danger)';
    const badgeCls = status==='Delivered'?'badge-green':status==='In Transit'?'badge-blue':status==='Assigned'?'badge-yellow':'badge-grey';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:4px 6px;color:var(--text-mid)">${date||'—'}</td>
      <td style="padding:4px 6px"><span style="font-size:9px;font-weight:700;color:${kindColor}">${kind}</span></td>
      <td style="padding:4px 6px;text-align:right;color:var(--text);font-weight:600">€${rate.toFixed(0)}</td>
      <td style="padding:4px 6px;text-align:right;color:var(--text-mid)">€${rev.toFixed(0)}</td>
      <td style="padding:4px 6px;text-align:right;color:${marginColor};font-weight:600">${marginTxt}</td>
      <td style="padding:4px 6px"><span class="badge ${badgeCls}" style="font-size:9px">${status}</span></td>
    </tr>`;
  }).join('');

  el.innerHTML = metricsHTML + `
    <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">${paRecs.length} assignments</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Date</th>
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Type</th>
        <th style="text-align:right;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Rate</th>
        <th style="text-align:right;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Revenue</th>
        <th style="text-align:right;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Margin</th>
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Status</th>
      </tr></thead>
      <tbody>${rowsHTML}${paRecs.length>30?`<tr><td colspan="6" style="padding:6px;text-align:center;color:var(--text-dim)">+${paRecs.length-30} more</td></tr>`:''}</tbody>
    </table>`;
}

// ── Client: render metrics cards + order history ─────────
function _renderClientOrders(el, orders) {
  // Metrics
  const total     = orders.length;
  const active    = orders.filter(o => !['Delivered','Invoiced','Cancelled'].includes(o.status)).length;
  const delivered = orders.filter(o => ['Delivered','Invoiced'].includes(o.status));
  const revenue   = delivered.reduce((s,o)=>s+(o.price||0), 0);
  const avgValue  = delivered.length ? revenue/delivered.length : 0;
  const perfVals  = orders.filter(o => o.perf === 'On Time' || o.perf === 'Delayed');
  const onTime    = perfVals.filter(o => o.perf === 'On Time').length;
  const onTimePct = perfVals.length ? (onTime / perfVals.length * 100) : 0;

  const card = (label,val,color) => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:8px">
      <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px">${label}</div>
      <div style="font-size:15px;font-weight:700;color:${color||'var(--text)'};margin-top:2px">${val}</div>
    </div>`;

  const metricsHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px">
      ${card('Σύνολο', total)}
      ${card('Ενεργά', active, active>0?'var(--accent)':'var(--text-dim)')}
      ${card('Delivered', delivered.length, 'var(--success)')}
      ${card('Revenue', '€'+Math.round(revenue).toLocaleString())}
      ${card('Avg Value', '€'+Math.round(avgValue).toLocaleString())}
      ${card('On-Time', perfVals.length ? onTimePct.toFixed(0)+'%' : '—',
        !perfVals.length ? 'var(--text-dim)' : onTimePct>=90?'var(--success)':onTimePct>=75?'var(--warning)':'var(--danger)')}
    </div>`;

  if (!orders.length) {
    el.innerHTML = metricsHTML + '<div style="color:var(--text-dim);padding:8px 0;font-size:11px">No orders yet</div>';
    return;
  }

  // Sort by date desc
  orders.sort((a,b) => (b.date||'').localeCompare(a.date||''));

  const rowsHTML = orders.slice(0,30).map(o => {
    const kindColor = o.type==='INTL' ? 'var(--accent)' : 'var(--success)';
    const badgeCls  = o.status==='Delivered'?'badge-green':o.status==='Invoiced'?'badge-blue':o.status==='Assigned'?'badge-yellow':o.status==='In Transit'?'badge-blue':'badge-grey';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:4px 6px;color:var(--text-mid)">${o.date||'—'}</td>
      <td style="padding:4px 6px"><span style="font-size:9px;font-weight:700;color:${kindColor}">${o.type}</span></td>
      <td style="padding:4px 6px;color:var(--text)">${_entityRouteCell(o.route)}</td>
      <td style="padding:4px 6px;text-align:center;color:var(--text-mid)">${o.pals}</td>
      <td style="padding:4px 6px;text-align:right;color:var(--text);font-weight:600">${o.price?'€'+Math.round(o.price):'—'}</td>
      <td style="padding:4px 6px"><span class="badge ${badgeCls}" style="font-size:9px">${o.status}</span></td>
    </tr>`;
  }).join('');

  el.innerHTML = metricsHTML + `
    <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">${orders.length} orders</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Date</th>
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Type</th>
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Route</th>
        <th style="text-align:center;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Pal</th>
        <th style="text-align:right;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Price</th>
        <th style="text-align:left;padding:4px 6px;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim)">Status</th>
      </tr></thead>
      <tbody>${rowsHTML}${orders.length>30?`<tr><td colspan="6" style="padding:6px;text-align:center;color:var(--text-dim)">+${orders.length-30} more</td></tr>`:''}</tbody>
    </table>`;
}

async function toggleActive(entityKey, recId, newVal) {
  await atPatch(ENTITY_CONFIG[entityKey].tableId, recId, { 'Active': newVal });
  invalidateCache(ENTITY_CONFIG[entityKey].tableId);
  await renderEntity(entityKey);
  toast(newVal ? 'Marked as Active' : 'Marked as Inactive');
}

// ── Create / Edit Modal ───────────────────────────
function openEntityCreate(entityKey) {
  buildEntityModal(entityKey, null, {});
}

function openEntityEdit(entityKey, recId) {
  const st  = _entityState[entityKey];
  const rec = st.records.find(r => r.id === recId);
  if (!rec) return;
  buildEntityModal(entityKey, recId, rec.fields);
}

function buildEntityModal(entityKey, recId, fields) {
  const cfg    = ENTITY_CONFIG[entityKey];
  const isEdit = !!recId;
  const isV2   = !!cfg.v2;
  let bodyHTML = '<div class="form-grid cols-1" style="gap:0">';

  for (const sec of cfg.formFields) {
    // sec.section, not sec.title: every ENTITY_CONFIG formFields entry keys
    // its heading as `section`, and this line read `title` — so every modal
    // of all six entities rendered «undefined» headings in production.
    // Caught 29/8 by the form probe; nobody had reported it.
    const secLabel = sec.section || sec.title || '';
    // Empty label = a 3-column continuation row under the PREVIOUS heading
    // (clients-form 120:395: ΣΤΟΙΧΕΙΑ ΕΤΑΙΡΕΙΑΣ is one 2-col row then one
    // 3-col row — a second heading here would just repeat the same word).
    // The grid still gets the heading's top margin so the two rows read as
    // one section instead of colliding.
    bodyHTML += secLabel
      ? `<div style="margin-bottom:4px;margin-top:16px"><div class="detail-section-title">${secLabel}</div></div>`
      : '';
    bodyHTML += `<div class="form-grid${sec.cols === 3 ? ' cols-3' : ''}"${secLabel ? '' : ' style="margin-top:16px"'}>`;
    for (const field of sec.fields) {
      const val = fields[field.f] ?? '';
      let input = '';
      if (field.type === 'textarea') {
        input = `<textarea class="form-textarea" id="ef_${field.f.replace(/\s/g,'_')}" rows="3">${val}</textarea>`;
      } else if (field.type === 'select') {
        const opts = Array.isArray(field.options)
          ? field.options.map(o => typeof o === 'string'
              ? `<option value="${o}" ${val===o?'selected':''}>${o}</option>`
              : `<option value="${o.val}" ${val===o.val?'selected':''}>${o.label}</option>`).join('')
          : '';
        input = `<select class="form-select" id="ef_${field.f.replace(/\s/g,'_')}">
          <option value="">${isV2 ? '— Επιλογή —' : '— Select —'}</option>${opts}</select>`;
      } else if (field.type === 'date') {
        input = `<input class="form-input" type="date" id="ef_${field.f.replace(/\s/g,'_')}" value="${val?val.split('T')[0]:''}">`;
      } else if (field.type === 'number') {
        // No «0» placeholder on dead fields: a grey 0 in a disabled box reads
        // as a stored zero — exactly what rule #3 forbids.
        input = `<input class="form-input" type="number" id="ef_${field.f.replace(/\s/g,'_')}" value="${val}"${field.disabled ? '' : ' placeholder="0"'}>`;
      } else if (field.type === 'email') {
        input = `<input class="form-input" type="email" id="ef_${field.f.replace(/\s/g,'_')}" value="${val}" placeholder="email@example.com">`;
      } else {
        input = `<input class="form-input" type="text" id="ef_${field.f.replace(/\s/g,'_')}" value="${val}" placeholder="${field.label}${field.req?' *':''}">`;
      }
      // Dead fields (plan §2.1): disabled with the reason spelled out — the
      // facade would accept the value, discard it, and toast success.
      if (field.disabled) {
        input = input.replace('<input ', '<input disabled ')
                     .replace('<select ', '<select disabled ')
                     .replace('<textarea ', '<textarea disabled ');
      }
      // v2: a message slot under every field — inline errors instead of the
      // old alert(); «Προαιρετικό» hint on non-required textareas (mock).
      const errSlot = isV2 ? `${field.disabled && field.disabledReason
          ? `<div class="ef-hint">${field.disabledReason}</div>` : ''
        }<div class="ef-err" id="eferr_ef_${field.f.replace(/\s/g,'_')}"></div>${
        field.type === 'textarea' && !field.req ? '<div class="ef-hint">Προαιρετικό</div>' : ''}` : '';
      bodyHTML += `<div class="form-field ${field.type==='textarea'?'span-2':''}">
        <label class="form-label">${field.label}${field.req?' *':''}</label>
        ${input}${errSlot}
      </div>`;
    }
    bodyHTML += '</div>';
  }
  bodyHTML += '</div>';

  const footerHTML = isV2 ? `
    <span class="ef-footnote" id="ef_note_${entityKey}" style="visibility:hidden">Τα πεδία με σφάλμα εμποδίζουν την αποθήκευση</span>
    <button class="btn btn-ghost" onclick="closeModal()">Ακύρωση</button>
    <button class="btn btn-primary" id="ef_save_${entityKey}" onclick="saveEntityRecord('${entityKey}','${recId||''}')">
      ${isEdit ? 'Αποθήκευση' : 'Δημιουργία'}
    </button>` : `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-success" onclick="saveEntityRecord('${entityKey}','${recId||''}')">
      ${isEdit ? 'Save Changes' : 'Create'}
    </button>`;

  // v2 titles come whole from config — genitive/nominative do not compose
  // from one noun («Νέο φορτηγού» is broken Greek). The record's primary
  // field goes to openModal as its own `chip` argument (Figma clients-form
  // 120:395: an accent-coloured span, no dash) instead of being concatenated
  // into the title string — that used to render as plain black text via
  // textContent, losing the colour distinction entirely.
  const primaryF = (cfg.columns.find(c => c.primary) || {}).field;
  const chip = isEdit && primaryF && fields[primaryF] ? fields[primaryF] : '';
  const title = isV2
    ? `${isEdit ? ((cfg.formTitles || [])[1] || 'Επεξεργασία') : ((cfg.formTitles || [])[0] || 'Νέα εγγραφή')}`
    : `${isEdit ? 'Edit' : 'New'} ${cfg.labelSingle}`;
  openModal(title, bodyHTML, footerHTML, chip);

  if (isV2) {
    // One delegated listener re-validates as the user types, so the message
    // (and the disabled save) clears the moment the value becomes valid.
    document.getElementById('modalBody').addEventListener('input', () => entityRevalidate(entityKey));
  }
}

// v2 inline validation. Live pass (submit=false) runs only the cfg.validators
// rules — an empty required field is not an error while the user is still
// filling the form. The submit pass adds the required check. Returns true
// when the form may be saved.
function entityRevalidate(entityKey, submit = false) {
  const cfg = ENTITY_CONFIG[entityKey];
  if (!cfg.v2) return true;
  const rules = cfg.validators || {};
  let errors = 0;
  for (const sec of cfg.formFields) {
    for (const field of sec.fields) {
      if (field.disabled) continue;
      const id = 'ef_' + field.f.replace(/\s/g, '_');
      const el = document.getElementById(id);
      if (!el) continue;
      const v = el.value.trim();
      let msg = '';
      if (submit && field.req && !v) msg = `Το πεδίο «${field.label}» είναι υποχρεωτικό`;
      else if (rules[field.f]) msg = rules[field.f](v) || '';
      el.classList.toggle('error', !!msg);
      const errEl = document.getElementById('eferr_' + id);
      if (errEl) errEl.textContent = msg;
      if (msg) errors++;
    }
  }
  const save = document.getElementById('ef_save_' + entityKey);
  const note = document.getElementById('ef_note_' + entityKey);
  if (save) save.disabled = errors > 0;
  if (note) note.style.visibility = errors ? 'visible' : 'hidden';
  return errors === 0;
}

async function saveEntityRecord(entityKey, recId) {
  const cfg    = ENTITY_CONFIG[entityKey];

  // v2: the full pass (validators + required) paints the messages inline and
  // blocks the save — no alert() (mock truck-form: field errors block saving).
  if (cfg.v2 && !entityRevalidate(entityKey, true)) return;

  const fields = {};
  for (const sec of cfg.formFields) {
    for (const field of sec.fields) {
      if (field.disabled) continue;   // dead field: never sent, never lied about
      const id = 'ef_' + field.f.replace(/\s/g, '_');
      const el = document.getElementById(id);
      if (!el) continue;
      let val = el.value.trim();
      if (!val) continue;
      if (field.type === 'number') val = parseFloat(val);
      fields[field.f] = val;
    }
  }

  if (!cfg.v2) {
    const reqField = cfg.formFields.flatMap(s => s.fields).find(f => f.req);
    if (reqField && !fields[reqField.f]) {
      alert(`Field "${reqField.label}" is required`);
      return;
    }
  }

  const btn = document.activeElement;
  if (btn) { btn.textContent = cfg.v2 ? 'Αποθήκευση…' : 'Saving...'; btn.disabled = true; }

  try {
    if (recId) {
      await atPatch(cfg.tableId, recId, fields);
    } else {
      await atCreate(cfg.tableId, fields);
    }
    invalidateCache(cfg.tableId);
    closeModal();
    toast(cfg.v2 ? (recId ? 'Η εγγραφή ενημερώθηκε' : 'Η εγγραφή δημιουργήθηκε')
                 : (recId ? 'Record updated' : 'Record created'));
    await renderEntity(entityKey);
  } catch(e) {
    if (btn) { btn.textContent = cfg.v2 ? 'Αποθήκευση' : 'Save'; btn.disabled = false; }
    reportError('Σφάλμα αποθήκευσης εγγραφής', e);
  }
}
