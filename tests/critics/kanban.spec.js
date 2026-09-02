// Κριτής kanban — για τις δύο οθόνες που ΔΕΝ είναι πίνακες.
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ: τα weekly_intl/weekly_natl δεν έχουν συμβόλαιο (contract.spec
// διαβάζει th/label — ένα kanban δεν έχει). Από 28/8 η σουίτα τα αναφέρει ως
// «ΓΝΩΣΤΟ ΚΕΝΟ» και κανείς κριτής δεν φυλάει την ταυτότητά τους. Το κύμα 4
// έγραψε στο Figma (w4-kanban-contract, 165:678) ΤΙ πρέπει να μετρά ένας
// κριτής εκεί που δεν υπάρχουν στήλες. Αυτό το αρχείο είναι τα σημεία 1–3
// εκείνου του συμβολαίου, σε κώδικα.
//
// ΜΟΝΟ ό,τι μετριέται ανεξάρτητα από την υλοποίηση: ορατό ΚΕΙΜΕΝΟ, όχι
// κλάσεις/ids. Η νέα υλοποίηση (παρτίδα 3, 3/9/2026) γράφεται ΤΗΝ ΩΡΑ που
// γράφεται αυτός ο κριτής — ένας επιλογέας DOM θα δέσμευε τον agent σε δική
// μου δομή. Το κείμενο των κεφαλίδων είναι ΑΠΑΡΑΒΑΤΗ ΤΑΥΤΟΤΗΤΑ κατά το
// συμβόλαιο· ο agent το ξέρει.
//
// Απόλυτος κανόνας, όχι καστάνια: δεν υπάρχει καταγεγραμμένο χρέος για ένα
// κριτή που γεννιέται σήμερα.

const { test, expect } = require('@playwright/test');
const UNITS = require('./units');
const { preparePage, gotoPage } = require('./auth');

// Σημείο 1 του συμβολαίου — δομή στηλών, απαράβατη ταυτότητα.
const IDENTITY = {
  weekly_intl: { columns: ['ΠΡΟΣ ΒΕΡΟΙΑ', 'ΕΞΑΓΩΓΗ', 'ΑΝΑΘΕΣΗ', 'ΕΙΣΑΓΩΓΗ', 'ΑΠΟ ΒΕΡΟΙΑ'], sections: [] },
  weekly_natl: { columns: ['ΚΑΘΟΔΟΣ', 'ΑΝΑΘΕΣΗ', 'ΑΝΟΔΟΣ'],                                sections: ['ΤΟΠΙΚΕΣ ΠΑΡΑΔΟΣΕΙΣ'] },
};
// Σημείο 2 — natl: και οι 7 ημέρες ΠΑΝΤΑ ορατές (Δ2), η κενή μέρα λέει «Καμία κίνηση».
const DAYS = ['ΚΥΡΙΑΚΗ', 'ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ'];

const KANBAN_UNITS = UNITS.filter(u => IDENTITY[u.unit]);

// Ίδια απόδειξη απόδοσης με το semantics.spec — ΚΑΙ η απόρριψη μηνύματος auth
// (μάθημα 3/9: 207 bytes «No session token» περνούσαν ως «απέδωσε»).
async function renderedText(page, unit) {
  await expect(page.locator('#sidebar'), `${unit}: το κέλυφος δεν φόρτωσε`).toBeVisible({ timeout: 15000 });
  const body = (await page.locator('#content').innerText()).trim();
  expect(body.length, `${unit}: κενή οθόνη`).toBeGreaterThan(0);
  expect(/No session token|Sign in again/.test(body), `${unit}: μήνυμα auth αντί για οθόνη`).toBe(false);
  return body;
}

for (const unit of KANBAN_UNITS) {
  test(`kanban: ${unit.unit} — ταυτότητα στηλών, ημέρες, παρονομαστές`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await preparePage(page, 'owner');
    await gotoPage(page, unit.routes[0], baseURL);
    await page.waitForTimeout(3000);
    const text = await renderedText(page, unit.unit);
    const upper = text.toUpperCase();
    const id = IDENTITY[unit.unit];

    // 1 · ΔΟΜΗ ΣΤΗΛΩΝ — κάθε κεφαλίδα υπάρχει ως κείμενο. Το πλήθος ελέγχεται
    // έμμεσα: λείπει μία = λείπει ταυτότητα.
    const missingCols = id.columns.filter(c => !upper.includes(c));
    expect(missingCols, `${unit.unit}: λείπουν κεφαλίδες στηλών (σημείο 1): ${missingCols.join(', ')}`).toHaveLength(0);
    const missingSecs = id.sections.filter(s => !upper.includes(s));
    expect(missingSecs, `${unit.unit}: λείπει ενότητα (σημείο 1): ${missingSecs.join(', ')}`).toHaveLength(0);

    // 2 · ΗΜΕΡΕΣ — μόνο natl: και οι 7, πάντα.
    if (unit.unit === 'weekly_natl') {
      const missingDays = DAYS.filter(d => !upper.includes(d));
      expect(missingDays, `${unit.unit}: η κενή μέρα πρέπει να ΦΑΙΝΕΤΑΙ (Δ2) — λείπουν: ${missingDays.join(', ')}`).toHaveLength(0);
    }

    // 3 · TALLY — κάθε ποσοστό με παρονομαστή. «74%» μόνο του = αποτυχία·
    // «74% (29/39)» ή «29/39 · 74%» περνά. Ελέγχεται ανά γραμμή κειμένου: ένα
    // ποσοστό χωρίς κλάσμα x/y στην ίδια γραμμή είναι ορφανό.
    // Παράθυρο ΔΥΟ γραμμών: το innerText σπάει «20 / 28» σε δύο γραμμές μέσα
    // σε πλακίδιο (μετρήθηκε 3/9 στον παλιό κώδικα — ψευδώς θετικό χωρίς αυτό).
    const lines = text.split('\n');
    const orphans = lines
      .map((line, i) => ({ line, win: (lines[i - 1] || '') + ' ' + line + ' ' + (lines[i + 1] || '') }))
      .filter(({ line, win }) => /\d+\s?%/.test(line) && !/\d+\s?\/\s?\d+/.test(win))
      .map(({ line }) => line.trim().slice(0, 60));
    expect(orphans, `${unit.unit}: ποσοστά χωρίς παρονομαστή (σημείο 3):\n${orphans.join('\n')}`).toHaveLength(0);
  });
}
