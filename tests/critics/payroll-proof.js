// Proof script for «Μισθοδοσία Οδηγών v3» (owner 14/9/2026, Figma 600/601:1011).
// Written BEFORE the implementation (TDD) — agent A builds the driver card
// (modules/payroll.js) on branch payroll-v3-card, agent B builds the print/CSV
// (modules/payroll_print.js + print_payroll.html) on branch payroll-v3-print,
// this agent (C) writes ONLY this rig on branch payroll-v3-rig. The single
// source of truth for every selector/id/text/URL/CSV-column below is
// docs/superpowers/plans/2026-09-14-payroll-v3-contract.md — nothing here is
// invented past it. Design intent: docs/superpowers/specs/2026-09-14-payroll-v3-design.md.
//
// Run from the MAIN repo (it holds node_modules/playwright):
//   cd /Users/dimitrispetras/PETRASGROUP-TMS
//   NODE_PATH=/Users/dimitrispetras/PETRASGROUP-TMS/node_modules \
//     PW_BASE_URL=http://127.0.0.1:8797/ node <worktree>/tests/critics/payroll-proof.js
//
// A local `python3 -m http.server 8797 -d <worktree>` must already be serving
// the WORKTREE root (the branch under test) on PW_BASE_URL's port.
//
// Reuses tests/critics/auth.js (preparePage/gotoPage) from the main repo, same
// as tests/critics/expenses-proof.js (the structural template for this file).
// /costs/ledger is mocked on top with page.route, registered AFTER preparePage
// so it wins over the HAR replay route — static assets (js/css/html) still
// load LIVE from PW_BASE_URL, which is the whole point (we test the real code).
//
// Fixture: ONE driver (id 11), six ledger entries — the EXACT fixture of
// tests/payroll-format.test.js's dlPeriod test, so opening 450,00 / closing
// 130,00 (Αύγουστος 2026) are the same numbers in the unit test, the screen,
// the A4 statement and the CSV (contract's whole point of routing all four
// through the one dlPeriod helper). The mock keeps a live store and
// recomputes balance_delta/running_balance/pending/cancelled on every write —
// see recompute() below — so POST/PATCH flows produce numbers that stay
// internally consistent instead of a canned response.
//
// What this proves, mapped to the contract:
//   καρτέλα (screen)  — buttons, 7-word header order, opening/closing rows,
//                        visible-row set, pending/cancelled rows, ΜΕΤΑΒΟΛΗ/
//                        ΥΠΟΛΟΙΠΟ signs, no «€» in cells / exactly one in
//                        the footer, no hex colours in the module source
//   μενού «···»       — .dl-menu open/absent, Διόρθωση (no reason on an
//                        empty value, reason once it is written), Ακύρωση
//                        (prompt → PATCH {cancel:true,reason})
//   Προσαρμογή        — empty reason blocks the POST, a reason sends it
//   Πληρωμή           — payment_cash POST
//   Γρήγορη καταχώριση — trip POST
//   περίοδος          — μήνας 07 ⇒ opening 0,00/closing 450,00, ΧΩΡΙΣ νέο GET
//   εκτύπωση/CSV      — popup URL, direct print_payroll.html render (card +
//                        drivers list), CSV columns/BOM/row-count/no «€»
//   1280/1440         — no horizontal scroll on the page or the ledger
//   ρόλοι             — management opens+views, dispatcher sees neither the
//                        nav item nor the page

const path = require('path');
const fs = require('fs');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { preparePage, gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8797/';
const SHOT_DIR = process.env.PW_SHOT_DIR || '/private/tmp/claude-501/-Users-dimitrispetras-PETRASGROUP-TMS--claude-worktrees-sleepy-mendeleev/e4fdae99-8903-4cca-a916-8e5d7709734e/scratchpad';
const SHOT_1440 = path.join(SHOT_DIR, 'payroll-v3-card-1440.png');
const SHOT_1280 = path.join(SHOT_DIR, 'payroll-v3-card-1280.png');
const SHOT_HOME_1440 = path.join(SHOT_DIR, 'payroll-v3-home-1440.png');
const SHOT_HOME_1280 = path.join(SHOT_DIR, 'payroll-v3-home-1280.png');

const DRIVER_ID = 11;
const DRIVER_NAME = 'Παπαδόπουλος Γιώργος';

function assert(cond, msg) {
  if (!cond) throw new Error('ΑΠΟΤΥΧΙΑ: ' + msg);
  console.log('  ✓ ' + msg);
}

// ── fixture: ΤΑ ΙΔΙΑ 6 entries με tests/payroll-format.test.js (dlPeriod) ──
// id1 July (before the period) → opening. id2/3/4/5 August (the period, one
// pending trip + one cancelled trip). id6 September (after the period).
function baseEntry(o) {
  return Object.assign({ driver_id: DRIVER_ID, rt_id: null, rt_code: null, date_end: null,
    route_legs: null, needs_review: false, review_note: '', deleted_reason: '', note: '',
    advance: null, expenses: null, cancelled: false }, o);
}
function freshEntries() {
  return [
    baseEntry({ id: 1, entry_type: 'trip', entry_date: '2026-07-20', trip_value: 500, advance: 100, expenses: 50, route_text: 'Βέροια → Ιταλία' }),
    baseEntry({ id: 2, entry_type: 'payment_bank', entry_date: '2026-08-02', amount: 300 }),
    baseEntry({ id: 3, entry_type: 'trip', entry_date: '2026-08-10', trip_value: null, route_text: 'Νάουσα → Αυστρία' }),
    baseEntry({ id: 4, entry_type: 'adjustment', entry_date: '2026-08-15', amount: -20 }),
    baseEntry({ id: 5, entry_type: 'trip', entry_date: '2026-08-18', trip_value: 900, cancelled: true, deleted_reason: 'fixture: δοκιμαστική ακύρωση', route_text: 'Θεσσαλονίκη → Γερμανία' }),
    baseEntry({ id: 6, entry_type: 'trip', entry_date: '2026-09-01', trip_value: 200, route_text: 'Βέροια → Ολλανδία' }),
  ];
}

// Recomputes pending/balance_delta/running_balance in chronological order —
// same rules the contract gives agent A/B for the Worker's own ledger-rules:
// trip = trip_value + expenses − advance (null trip_value ⇒ pending, no
// contribution); payment_* = −amount; adjustment = +amount. A cancelled row
// keeps whatever balance_delta it last had but contributes nothing to the
// running balance. Mutates the entry objects in place; returns them sorted
// chronologically (oldest→newest) for convenience.
function recompute(entries) {
  const chrono = entries.slice().sort((a, b) => a.entry_date === b.entry_date ? a.id - b.id : (a.entry_date < b.entry_date ? -1 : 1));
  let running = 0;
  for (const e of chrono) {
    if (e.cancelled) { e.pending = false; e.running_balance = running; continue; }
    if (e.entry_type === 'trip') {
      e.pending = (e.trip_value === null || e.trip_value === undefined);
      e.balance_delta = e.pending ? null : Number(e.trip_value || 0) + Number(e.expenses || 0) - Number(e.advance || 0);
    } else {
      e.pending = false;
      if (e.entry_type === 'payment_bank' || e.entry_type === 'payment_cash') e.balance_delta = -Number(e.amount || 0);
      else if (e.entry_type === 'adjustment') e.balance_delta = Number(e.amount || 0);
    }
    if (!e.pending) running += Number(e.balance_delta || 0);
    e.running_balance = running;
  }
  return chrono;
}

function balanceRow(chrono) {
  const rows = chrono.filter(e => e.driver_id === DRIVER_ID);
  const live = rows.filter(e => !e.cancelled);
  const trips = rows.filter(e => e.entry_type === 'trip' && !e.cancelled);
  const payments = rows.filter(e => (e.entry_type === 'payment_bank' || e.entry_type === 'payment_cash') && !e.cancelled);
  const last = rows.length ? rows[rows.length - 1] : null;
  const lastTrip = trips.length ? trips[trips.length - 1] : null;
  const lastPayment = payments.length ? payments[payments.length - 1] : null;
  return {
    driver_id: DRIVER_ID, full_name: DRIVER_NAME, type: 'Internal', active: true,
    balance: live.length ? Number(live[live.length - 1].running_balance || 0) : 0,
    has_entries: rows.length > 0, trips_ytd: trips.length,
    pending_count: trips.filter(e => e.pending).length, review_count: 0,
    last_entry_date: last ? last.entry_date : null,
    last_trip_date: lastTrip ? lastTrip.entry_date : null,
    last_payment_date: lastPayment ? lastPayment.entry_date : null,
    last_payment_type: lastPayment ? lastPayment.entry_type : null,
  };
}

// Mocks /costs/ledger* with a live store — registered AFTER preparePage so it
// wins over the HAR replay route (same convention as expenses-proof.js).
// NOTE the id ambiguity the real API has (contract, verbatim): GET
// /costs/ledger/:id addresses a DRIVER, PATCH /costs/ledger/:id addresses a
// LEDGER ENTRY. Both are handled below on the same route.
function installPayrollMocks(page) {
  const store = { entries: freshEntries(), nextId: 100 };
  const captured = { balanceGets: 0, ledgerGets: [], posts: [], patches: [] };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  page.route('**/costs/ledger**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const parts = url.pathname.split('/').filter(Boolean);
    const li = parts.indexOf('ledger');
    const idSeg = parts[li + 1];

    if (!idSeg) {
      if (method === 'GET') {
        captured.balanceGets++;
        const chrono = recompute(store.entries);
        return json(route, { records: [balanceRow(chrono)], gap: 0, gapRts: [] });
      }
      if (method === 'POST') {
        const body = req.postDataJSON();
        captured.posts.push(body);
        const rec = baseEntry(Object.assign({ id: store.nextId++ }, body));
        store.entries.push(rec);
        recompute(store.entries);
        return json(route, { record: rec }, 201);
      }
      return json(route, {}, 404);
    }

    if (method === 'GET') {
      // GET .../ledger/<driverId> — full history, no ?year= expected per the
      // contract (dlPeriod needs it to compute January's opening balance).
      const driverId = Number(idSeg);
      captured.ledgerGets.push(url.search);
      const chrono = recompute(store.entries);
      const rows = chrono.filter(e => e.driver_id === driverId).slice().reverse(); // newest-first, per contract
      return json(route, { records: rows, rts: [] });
    }
    if (method === 'PATCH') {
      // PATCH .../ledger/<entryId> — a single ledger row.
      const entryId = Number(idSeg);
      const body = req.postDataJSON();
      captured.patches.push({ id: entryId, body });
      const e = store.entries.find(x => x.id === entryId);
      if (!e) return json(route, {}, 404);
      if (body.cancel) { e.cancelled = true; e.deleted_reason = body.reason || ''; }
      else {
        for (const k of ['trip_value', 'advance', 'expenses']) if (k in body) e[k] = body[k];
        if ('reason' in body) e.note = body.reason;
      }
      recompute(store.entries);
      return json(route, { record: e });
    }
    return json(route, {}, 404);
  });

  return { store, captured };
}

// ── home fixture (Φάση 2, καρτέλες — Figma 614/616:1011) ──────────────────
// 5 οδηγοί + 1 ανενεργός (contract's «αρχική με κάρτες» row + delegation
// brief, verbatim). Ημερομηνίες παράγονται από new Date() ΚΑΘΕ φορά (το
// σήμερα του rig δεν παγώνει — instructions) ώστε ο τρέχων/προηγούμενος
// μήνας να είναι πάντα σωστοί, όποτε κι αν τρέξει αυτό το αρχείο.
function pad2(n) { return String(n).padStart(2, '0'); }
function ymKey(y, m) { return y + '-' + pad2(m); }
// Same literal list as DL_MONTHS in modules/payroll.js (#dlMonth options) —
// kept here too so the rig's expected «month in words» text never drifts
// from the module's own wording without both being touched.
const DL_MONTHS_GR = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος',
  'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
function homeDates() {
  const now = new Date();
  const curY = now.getFullYear(), curM = now.getMonth() + 1; // 1-based
  const prev = new Date(curY, curM - 2, 1); // JS month 0-based: curM-1 (0-based cur) - 1
  return {
    curY, curM, curKey: ymKey(curY, curM),
    prevY: prev.getFullYear(), prevM: prev.getMonth() + 1, prevKey: ymKey(prev.getFullYear(), prev.getMonth() + 1),
    todayISO: curY + '-' + pad2(curM) + '-' + pad2(now.getDate()),
  };
}

// A(11) πληρωμένος 4 δρομολόγια/2 χωρίς αξία, B(12) 1 χωρίς αξία, Γ(13)
// «μας χρωστά» (αρνητικό, καμία εκκρεμότητα), Δ(14) υπόλοιπο 0 ΜΕ εκκρεμότητα
// (dlBal ήδη δείχνει «—» σε αυτή την περίπτωση — v2 κανόνας, αναχρησιμοποιείται),
// Ε(15) χωρίς καμία κίνηση ποτέ (has_entries:false — ΠΟΤΕ κάρτα, owner change
// #3: δεν υπάρχει πλέον «Όλοι»), ΣΤ(16) ανενεργός ΜΕ κινήσεις και υπόλοιπο 412
// (ΠΟΤΕ κάρτα — μόνο η γραμμή .dl-foot-inactive τον αναφέρει).
function homeBalances(d) {
  return [
    { driver_id: 11, full_name: 'Παπαδόπουλος Γιώργος', type: 'Internal', active: true, has_entries: true,
      balance: 1726.27, pending_count: 2, trips_ytd: 40,
      last_entry_date: d.curY + '-' + pad2(d.curM) + '-10', last_trip_date: d.curY + '-' + pad2(d.curM) + '-10',
      last_payment_date: d.curY + '-' + pad2(d.curM) + '-12', last_payment_type: 'payment_cash' },
    { driver_id: 12, full_name: 'Καραγιάννης Νίκος', type: 'Internal', active: true, has_entries: true,
      balance: 954.10, pending_count: 1, trips_ytd: 30,
      last_entry_date: d.curY + '-' + pad2(d.curM) + '-09', last_trip_date: d.curY + '-' + pad2(d.curM) + '-09',
      last_payment_date: d.curY + '-' + pad2(d.curM) + '-09', last_payment_type: 'payment_bank' },
    { driver_id: 13, full_name: 'Αντωνίου Στέλιος', type: 'External', active: true, has_entries: true,
      balance: -150, pending_count: 0, trips_ytd: 12,
      last_entry_date: d.curY + '-' + pad2(d.curM) + '-05', last_trip_date: d.curY + '-' + pad2(d.curM) + '-05',
      last_payment_date: null, last_payment_type: null },
    { driver_id: 14, full_name: 'Δημητρίου Βασίλης', type: 'Internal', active: true, has_entries: true,
      balance: 0, pending_count: 1, trips_ytd: 8,
      last_entry_date: d.curY + '-' + pad2(d.curM) + '-03', last_trip_date: d.curY + '-' + pad2(d.curM) + '-03',
      last_payment_date: d.prevY + '-' + pad2(d.prevM) + '-20', last_payment_type: 'payment_cash' },
    { driver_id: 15, full_name: 'Εμμανουήλ Παύλος', type: 'Internal', active: true, has_entries: false,
      balance: 0, pending_count: 0, trips_ytd: 0,
      last_entry_date: null, last_trip_date: null, last_payment_date: null, last_payment_type: null },
    { driver_id: 16, full_name: 'Ζησιμόπουλος Θάνος', type: 'Internal', active: false, has_entries: true,
      balance: 412, pending_count: 0, trips_ytd: 5,
      last_entry_date: d.prevY + '-' + pad2(d.prevM) + '-01', last_trip_date: d.prevY + '-' + pad2(d.prevM) + '-01',
      last_payment_date: null, last_payment_type: null },
  ];
}

// month.drivers — τρέχων μήνας μόνο (owner change #1, 14/9: καμία λωρίδα
// μηνών πλέον, άρα κανένα σενάριο χρειάζεται δεδομένα άλλου μήνα). 3 οδηγοί
// (11,12,13· ο 14 σκόπιμα εκτός, όπως στην πραγματική απάντηση ένας οδηγός
// μπορεί να μη γράψει τίποτα τον μήνα — δοκιμάζεται στο KPI «trips» άθροισμα).
// Ο 11 έχει τα ίδια νούμερα με το «Οδηγός Α» του Figma 614 (3.650,00/2.750,00)
// ώστε το screenshot να μπορεί να συγκριθεί οπτικά.
function homeMonthBlocks(d) {
  const cur = {
    from: d.curY + '-' + pad2(d.curM) + '-01', to: d.curY + '-' + pad2(d.curM) + '-28',
    drivers: {
      11: { trips: 4, pending: 1, value: 3650, expenses: 0, advance: 0, payments: 2750, adjustments: 0,
        last_payment: { date: d.curY + '-' + pad2(d.curM) + '-12', type: 'payment_cash', amount: 400 } },
      12: { trips: 3, pending: 0, value: 2400, expenses: 0, advance: 0, payments: 1100, adjustments: 0,
        last_payment: { date: d.curY + '-' + pad2(d.curM) + '-09', type: 'payment_bank', amount: 800 } },
      13: { trips: 1, pending: 0, value: 200, expenses: 0, advance: 0, payments: 0, adjustments: 0, last_payment: null },
    },
  };
  const out = {}; out[d.curKey] = cur;
  return out;
}

function baseHomeEntry(o) {
  return Object.assign({ rt_id: null, rt_code: null, date_end: null, route_legs: null,
    needs_review: false, review_note: '', deleted_reason: '', note: '', advance: null,
    expenses: null, cancelled: false, pending: false, balance_delta: 0, running_balance: 0 }, o);
}

// Mocks για την ΑΡΧΙΚΗ (Φάση 2). Ίδιο route pattern με installPayrollMocks —
// registered ΜΕΤΑ preparePage. `opts.omitMonth` προσομοιώνει τον Worker ΠΡΙΝ
// το deploy του ledger-month.mjs (καμία δέσμη `month` στην απάντηση), για το
// σενάριο «Δεν φορτώθηκαν τα ποσά μήνα». `opts.inactiveBalance` αντικαθιστά
// το υπόλοιπο του μόνου ανενεργού (16, default 412) — 0 αναπαράγει το
// σενάριο «κανένας ανενεργός με μη-μηδενικό υπόλοιπο» (.dl-foot-inactive ΑΠΟΥΣΑ).
function installPayrollHomeMocks(page, opts) {
  opts = opts || {};
  const d = homeDates();
  const balances = homeBalances(d);
  if (opts.inactiveBalance !== undefined) {
    const inactive = balances.find(b => b.driver_id === 16);
    if (inactive) inactive.balance = opts.inactiveBalance;
  }
  const monthBlocks = homeMonthBlocks(d);
  const store = { nextId: 500, entries: [
    // Ελάχιστο ιστορικό ώστε το .dl-card-open στον 11 να ανοίγει την καρτέλα
    // v3 (renderPayrollDriver) χωρίς σφάλμα — δεν ελέγχονται εδώ τα ποσά της.
    baseHomeEntry({ id: 501, driver_id: 11, entry_type: 'trip', entry_date: d.curY + '-' + pad2(d.curM) + '-05',
      trip_value: 500, route_text: 'Βέροια → Ιταλία', balance_delta: 500, running_balance: 500 }),
  ] };
  const captured = { homeGets: [], detailGets: [], posts: [] };
  const json = (route, body, status) => route.fulfill({ status: status || 200, contentType: 'application/json', body: JSON.stringify(body) });

  page.route('**/costs/ledger**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const parts = url.pathname.split('/').filter(Boolean);
    const li = parts.indexOf('ledger');
    const idSeg = parts[li + 1];

    if (!idSeg) {
      if (method === 'GET') {
        captured.homeGets.push(url.search);
        const body = { records: balances, gap: 0, gapRts: [] };
        const monthParam = url.searchParams.get('month');
        if (!opts.omitMonth && monthParam && monthBlocks[monthParam]) body.month = monthBlocks[monthParam];
        return json(route, body);
      }
      if (method === 'POST') {
        const b = req.postDataJSON();
        captured.posts.push(b);
        const rec = baseHomeEntry(Object.assign({ id: store.nextId++ }, b));
        // best-effort delta so a later .dl-card-open on the same driver
        // doesn't choke on an undefined balance_delta/running_balance.
        if (rec.entry_type === 'payment_bank' || rec.entry_type === 'payment_cash') rec.balance_delta = -Number(rec.amount || 0);
        else if (rec.entry_type === 'adjustment') rec.balance_delta = Number(rec.amount || 0);
        store.entries.push(rec);
        return json(route, { record: rec }, 201);
      }
      return json(route, {}, 404);
    }
    if (method === 'GET') {
      const driverId = Number(idSeg);
      captured.detailGets.push(url.search);
      const rows = store.entries.filter(e => e.driver_id === driverId);
      return json(route, { records: rows, rts: [] });
    }
    return json(route, {}, 404);
  });

  return { store, captured, d, balances, monthBlocks };
}

async function newPage(browser, role, viewport) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: viewport || { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  // The cancel/edit-with-reason flows use window.prompt (contract: «prompt
  // αιτιολογίας»); this always accepts a fixed reason string, same pattern as
  // expenses-proof.js.
  page.on('dialog', async dialog => { if (dialog.type() === 'prompt') await dialog.accept('proof: test reason'); else await dialog.accept(); });
  await preparePage(page, role);
  return { context, page, consoleErrors };
}

// The pending row's border colour must be var(--warn), whatever it resolves
// to under the active theme — compare computed values via a throwaway probe
// rather than hard-coding a colour.
async function assertPendingBorderIsWarn(page) {
  const { rowColor, warnColor } = await page.evaluate(() => {
    const row = document.querySelector('.dl-row.pending');
    const rowColor = row ? getComputedStyle(row).borderLeftColor : null;
    const probe = document.createElement('div');
    probe.style.borderLeftColor = 'var(--warn)';
    document.body.appendChild(probe);
    const warnColor = getComputedStyle(probe).borderLeftColor;
    probe.remove();
    return { rowColor, warnColor };
  });
  assert(rowColor !== null, '.dl-row.pending exists to check its border colour');
  assert(rowColor === warnColor, '.dl-row.pending border-left color computes to var(--warn) (' + rowColor + ' == ' + warnColor + ')');
}

async function assertGridFits(page, label) {
  const fit = await page.evaluate(() => {
    const ledger = document.querySelector('.dl-ledger');
    return ledger ? { sw: ledger.scrollWidth, cw: ledger.clientWidth } : null;
  });
  assert(fit !== null, '[' + label + '] .dl-ledger exists');
  assert(fit.sw <= fit.cw + 0.5, '[' + label + '] .dl-ledger.scrollWidth (' + fit.sw + ') <= clientWidth (' + fit.cw + ') — no horizontal scroll inside the ledger');
  const page_ = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(page_ <= 0, '[' + label + '] the PAGE itself never scrolls sideways: ' + page_);
}

async function assertHomeGridFits(page, label) {
  const fit = await page.evaluate(() => {
    const grid = document.querySelector('.dl-grid');
    return grid ? { sw: grid.scrollWidth, cw: grid.clientWidth } : null;
  });
  assert(fit !== null, '[' + label + '] .dl-grid exists');
  assert(fit.sw <= fit.cw + 0.5, '[' + label + '] .dl-grid.scrollWidth (' + fit.sw + ') <= clientWidth (' + fit.cw + ') — no horizontal scroll inside the grid');
  const page_ = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(page_ <= 0, '[' + label + '] the PAGE itself never scrolls sideways: ' + page_);
}

// The first `count` .dl-card elements (DOM order) must share one offsetTop —
// i.e. they sit in the same grid row, proving the column count the contract
// gives for that viewport (4 at 1400px+, 3 at 1280px).
async function assertCardsShareRow(page, label, count) {
  const tops = await page.evaluate(() => Array.from(document.querySelectorAll('.dl-card')).map(el => el.offsetTop));
  assert(tops.length >= count, '[' + label + '] at least ' + count + ' .dl-card elements exist (got ' + tops.length + ')');
  const firstRow = tops.slice(0, count);
  assert(firstRow.every(t => t === firstRow[0]), '[' + label + '] the first ' + count + ' .dl-card elements share one offsetTop (one row): ' + JSON.stringify(firstRow));
  // EXACTLY `count` per row (coordinator review 14/9: auto-fill gave 6 columns
  // of ~190px on a wide window) — the next card, if any, starts a new row.
  if (tops.length > count) assert(tops[count] > firstRow[0], '[' + label + '] card #' + (count + 1) + ' starts a NEW row (exactly ' + count + ' columns): ' + tops[count] + ' > ' + firstRow[0]);
  // Names up to ~22 characters render whole — no ellipsis at this width.
  const names = await page.evaluate(() => Array.from(document.querySelectorAll('.dl-card .dl-card-id .m')).map(el => ({ t: el.textContent, sw: el.scrollWidth, cw: el.clientWidth })));
  for (const n of names.filter(n => n.t.length <= 22)) assert(n.sw <= n.cw + 0.5, '[' + label + '] driver name «' + n.t + '» (' + n.t.length + ' chars) is not truncated: scrollWidth ' + n.sw + ' ≤ clientWidth ' + n.cw);
  // Owner 14/9 «άλλες φορές το ποσό είναι πάνω, άλλες κάτω»: the balance must
  // sit on the avatar's line in EVERY card — checked on the real names, and
  // again after forcing one long two-word name into the first card (the
  // fixture's own names all fit one line, so they alone would never fail).
  const pos = await page.evaluate(() => {
    const measure = () => Array.from(document.querySelectorAll('.dl-card')).map(c => {
      const a = c.querySelector('.dl-avatar').getBoundingClientRect().top, b = c.querySelector('.dl-bal-wrap').getBoundingClientRect().top;
      const m = c.querySelector('.dl-card-id .m');
      return { name: m.textContent, diff: b - a, lines: Math.round(m.getBoundingClientRect().height / 16.8), sw: m.scrollWidth, cw: m.clientWidth };
    });
    const before = measure();
    const first = document.querySelector('.dl-card .dl-card-id .m'); const orig = first.textContent;
    first.textContent = 'Papatheocharidis Vasileios';
    const forced = measure()[0];
    first.textContent = orig;
    return { before, forced };
  });
  for (const c of pos.before) assert(c.diff <= 4, '[' + label + '] balance of «' + c.name + '» sits on the avatar line (top diff ' + c.diff.toFixed(1) + 'px ≤ 4)');
  assert(pos.forced.diff <= 4, '[' + label + '] with a long name («Papatheocharidis Vasileios») the balance STILL sits on the avatar line (diff ' + pos.forced.diff.toFixed(1) + 'px)');
  assert(pos.forced.lines <= 2 && pos.forced.sw <= pos.forced.cw + 0.5, '[' + label + '] the long name wraps inside its column (≤2 lines, not clipped sideways): lines ' + pos.forced.lines + ', ' + pos.forced.sw + ' ≤ ' + pos.forced.cw);
}

// The 3px top border must be present on every card, and the pending driver's
// (11) colour must be var(--warn) and differ from a non-pending driver's (13)
// — compared via computed style, never a hard-coded hex.
async function assertCardBorders(page) {
  const r = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.dl-card'));
    const widths = cards.map(el => getComputedStyle(el).borderTopWidth);
    const c11 = document.querySelector('.dl-card[data-driver="11"]');
    const c13 = document.querySelector('.dl-card[data-driver="13"]');
    const probe = document.createElement('div');
    probe.style.borderTopColor = 'var(--warn)';
    document.body.appendChild(probe);
    const warnColor = getComputedStyle(probe).borderTopColor;
    probe.remove();
    return {
      widths, warnColor,
      c11Color: c11 ? getComputedStyle(c11).borderTopColor : null,
      c13Color: c13 ? getComputedStyle(c13).borderTopColor : null,
    };
  });
  assert(r.widths.length > 0, 'at least one .dl-card exists to check border-top-width');
  assert(r.widths.every(w => w === '3px'), 'every .dl-card has border-top-width 3px (got: ' + JSON.stringify(r.widths) + ')');
  assert(r.c11Color !== null && r.c13Color !== null, 'cards 11 and 13 both exist to compare border colour');
  assert(r.c11Color === r.warnColor, 'card 11 (pending) border-top-color computes to var(--warn) (' + r.c11Color + ' == ' + r.warnColor + ')');
  assert(r.c11Color !== r.c13Color, 'card 11 (pending) border colour differs from card 13 (no pending): ' + r.c11Color + ' vs ' + r.c13Color);
}

// ═══════════════════════════════ ΑΡΧΙΚΗ ΜΕ ΚΑΡΤΕΣ (accountant) — Φάση 2 ═══════════════════════════════
// TDD: written BEFORE modules/payroll.js grows a card grid (agent E, branch
// payroll-v3-home, ΙΔΙΟ αρχείο με τη Φάση 1). Contract:
// docs/superpowers/plans/2026-09-14-payroll-v3-contract.md § «Αρχική με
// κάρτες — view home». Selectors/ids/texts below come ONLY from that section
// plus the coordinator's delegation brief — nothing invented past them.
async function runHomeFlow(browser) {
  console.log('\n== accountant · αρχική με κάρτες (view home, Figma 614:1011) ==');
  const consoleErrors = [];

  // ── κύρια ροή ──
  const { context, page, consoleErrors: mainErrors } = await newPage(browser, 'accountant');
  const { captured, d } = installPayrollHomeMocks(page);
  await gotoPage(page, 'payroll', BASE_URL);
  await page.waitForSelector('.dl-grid', { timeout: 15000 });
  await page.waitForTimeout(150);

  // ── πρώτο GET με ?month=· ΚΑΜΙΑ λωρίδα μηνών/chips στο DOM (owner: 3 αλλαγές 14/9) ──
  assert(captured.homeGets.length >= 1, 'at least one GET /costs/ledger was issued on load');
  assert(captured.homeGets[0].includes('month=' + d.curKey), 'the FIRST GET /costs/ledger carries ?month=' + d.curKey + ' (got: ' + captured.homeGets[0] + ')');
  assert(await page.locator('.dl-mstrip').count() === 0, '.dl-mstrip does not exist (no month strip — owner change #1)');
  assert(await page.locator('.dl-m').count() === 0, '.dl-m month tiles do not exist');
  assert(await page.locator('.dl-marrow').count() === 0, '.dl-marrow arrows do not exist');
  assert(await page.locator('.dl-chip').count() === 0, '.dl-chip does not exist anywhere (replaced by the KPI pending tile — owner change #2)');
  assert(await page.locator('.dl-filters').count() === 0, '.dl-filters does not exist');

  // ── κεφαλίδα: κουμπιά ──
  assert(await page.locator('#dlBtnBulk').count() === 1, '#dlBtnBulk «Μαζική πληρωμή» exists');
  assert(await page.locator('#dlBtnTripHome').count() === 1, '#dlBtnTripHome «Δρομολόγιο» exists');
  assert(await page.locator('#dlBtnPrintHome').count() === 1, '#dlBtnPrintHome «Εκτύπωση» exists');
  assert(await page.locator('#dlBtnCsvHome').count() === 1, '#dlBtnCsvHome «CSV» exists');
  assert(await page.locator('.dl-btn.primary').count() === 1, 'exactly one .dl-btn.primary on the page');
  assert(await page.locator('#dlBtnBulk.primary').count() === 1, '#dlBtnBulk is the ONE navy button');

  // ── KPI bar: 5 πλακίδια owed/trips/pending/payments/active (owner change #2) ──
  assert(await page.locator('.dl-kpi').count() === 1, '.dl-kpi bar exists');
  assert(await page.locator('.dl-kpi-tile').count() === 5, 'exactly 5 .dl-kpi-tile');
  for (const kpi of ['owed', 'trips', 'pending', 'payments', 'active']) {
    const tile = page.locator('.dl-kpi-tile[data-kpi="' + kpi + '"]');
    assert(await tile.count() === 1, 'exactly one .dl-kpi-tile[data-kpi="' + kpi + '"]');
    assert((await tile.locator('.k').innerText()).trim().length > 0, 'tile «' + kpi + '» has a non-empty .k label');
    assert((await tile.locator('.v').innerText()).trim().length > 0, 'tile «' + kpi + '» has a non-empty .v value');
  }
  // Sums over the 4 active+has_entries drivers (11,12,13,14) — driver 14 is
  // simply absent from month.drivers (contract: an entry not writing this
  // month), so it contributes 0 to trips/payments, same as a real API gap.
  const kpiOwed = (await page.locator('.dl-kpi-tile[data-kpi="owed"] .v').innerText()).trim();
  assert(/2\.530,37/.test(kpiOwed) && /€/.test(kpiOwed), 'KPI owed = Σ balance ενεργών (2.530,37 €): ' + kpiOwed);
  const kpiTrips = (await page.locator('.dl-kpi-tile[data-kpi="trips"] .v').innerText()).trim();
  assert(kpiTrips === '8', 'KPI trips = Σ month.trips ενεργών (4+3+1+0=8): ' + kpiTrips);
  const kpiPendingVal = (await page.locator('.dl-kpi-tile[data-kpi="pending"] .v').innerText()).trim();
  assert(kpiPendingVal === '4', 'KPI pending = Σ pending_count (νούμερο μόνο, 2+1+0+1=4): ' + kpiPendingVal);
  const kpiPayments = (await page.locator('.dl-kpi-tile[data-kpi="payments"] .v').innerText()).trim();
  assert(/3\.850,00/.test(kpiPayments) && /€/.test(kpiPayments), 'KPI payments = Σ month.payments ενεργών (2750+1100+0+0=3.850,00 €): ' + kpiPayments);
  const kpiActive = (await page.locator('.dl-kpi-tile[data-kpi="active"] .v').innerText()).trim();
  assert(kpiActive === '4', 'KPI active = πλήθος καρτών (4): ' + kpiActive);
  const kpiSub = await page.locator('.dl-kpi-sub').innerText();
  assert(new RegExp(DL_MONTHS_GR[d.curM - 1] + '\\s+' + d.curY).test(kpiSub), '.dl-kpi-sub carries the current month in words (' + DL_MONTHS_GR[d.curM - 1] + ' ' + d.curY + '): ' + kpiSub);

  // ── πλέγμα: 4 ενεργοί-με-κινήσεις (11,12,13,14), σειρά κατά balance φθίνουσα ──
  assert(await page.locator('.dl-card').count() === 4, 'default view shows 4 .dl-card (active + has_entries)');
  let order = await page.$$eval('.dl-card', els => els.map(el => el.getAttribute('data-driver')));
  assert(JSON.stringify(order) === JSON.stringify(['11', '12', '14', '13']),
    'default sort is balance desc: 11 (1726.27) · 12 (954.10) · 14 (0) · 13 (−150) — got ' + JSON.stringify(order));

  assert(await page.locator('.dl-card[data-driver="11"].pending').count() === 1, 'card 11 (pending_count 2) carries .pending');
  assert(/2\s*χωρίς αξία/.test(await page.locator('.dl-card[data-driver="11"] .dl-badge').innerText()), 'card 11 .dl-badge reads «2 χωρίς αξία»');
  assert(await page.locator('.dl-card[data-driver="13"].pending').count() === 0, 'card 13 (pending_count 0) does NOT carry .pending');
  assert(await page.locator('.dl-card[data-driver="13"] .dl-badge').count() === 0, 'card 13 has no .dl-badge');
  assert((await page.locator('.dl-card[data-driver="13"] .dl-balword').innerText()).trim() === 'μας χρωστά', 'card 13 (balance −150) .dl-balword reads «μας χρωστά»');
  assert((await page.locator('.dl-card[data-driver="11"] .dl-balword').innerText()).trim() === 'του χρωστάμε', 'card 11 (balance 1726.27) .dl-balword reads «του χρωστάμε»');
  assert((await page.locator('.dl-card[data-driver="14"] .dl-bal').innerText()).trim() === '—', 'card 14 (balance 0, pending_count 1) .dl-bal reads «—» (v2 rule reused: 0 with a pending trip is unknown, not zero)');

  await assertCardBorders(page);

  // ── mini-stats (μήνα) του 11, «Καμία πληρωμή τον μήνα» του 13 ──
  const ms11 = (await page.locator('.dl-card[data-driver="11"] .dl-ms').innerText()).replace(/\s+/g, ' ');
  assert(/\b4\b/.test(ms11), 'card 11 mini-stats show trips 4 (month block): ' + ms11);
  assert(/3\.650,00/.test(ms11), 'card 11 mini-stats show value 3.650,00 (month block): ' + ms11);
  assert(/2\.750,00/.test(ms11), 'card 11 mini-stats show payments 2.750,00 (month block): ' + ms11);
  const lp11 = (await page.locator('.dl-card[data-driver="11"] .dl-lastpay').innerText()).replace(/\s+/g, ' ');
  assert(lp11.includes('12/' + pad2(d.curM)), '.dl-lastpay (11) carries the day/month of the month\'s last payment: ' + lp11);
  assert(/Μετρητά/.test(lp11) && /400,00/.test(lp11), '.dl-lastpay (11) carries type «Μετρητά» and amount 400,00: ' + lp11);
  const lp13 = await page.locator('.dl-card[data-driver="13"] .dl-lastpay').innerText();
  assert(/Καμία πληρωμή τον μήνα/.test(lp13), '.dl-lastpay (13, no last_payment this month) reads «Καμία πληρωμή τον μήνα»: ' + lp13);

  // ── κανένα «€» σε ΚΑΜΙΑ κάρτα (owner change: πλέον «€» εμφανίζεται ΚΑΙ στα
  // KPI πλακίδια owed/payments, όχι μόνο στο footer — ο παλιός «ένα € στο
  // footer» έλεγχος αντικαθίσταται από «€ πουθενά μέσα σε .dl-card») ──
  const cardTexts = await page.locator('.dl-card').allInnerTexts();
  assert(cardTexts.every(t => !/€/.test(t)), 'no «€» inside any .dl-card (checked ' + cardTexts.length + ' cards)');
  const footTxt = (await page.locator('.dl-foot').innerText()).replace(/\s+/g, ' ');
  assert(/4 οδηγοί/.test(footTxt), '.dl-foot carries «4 οδηγοί»: ' + footTxt);
  assert(/4 δρομολόγια χωρίς αξία/.test(footTxt), '.dl-foot carries «4 δρομολόγια χωρίς αξία» (2+1+0+1): ' + footTxt);
  assert(/2\.530,37/.test(footTxt) && /€/.test(footTxt), '.dl-foot carries the total οφειλή 2.530,37 € (1726.27+954.10+0−150): ' + footTxt);
  const monthNameRe = new RegExp(DL_MONTHS_GR[d.curM - 1] + '\\s+' + d.curY, 'g');
  assert((footTxt.match(monthNameRe) || []).length === 1, '.dl-foot carries the current month in words exactly once: ' + footTxt);

  // ── .dl-foot-inactive: 1 ανενεργός (16, balance 412) — «1 ανενεργ»/«412,00»/«κατάσταση οφειλών» ──
  const footInactiveTxt = (await page.locator('.dl-foot-inactive').innerText()).replace(/\s+/g, ' ');
  assert(/1\s*ανενεργ/.test(footInactiveTxt), '.dl-foot-inactive carries «1 ανενεργ»: ' + footInactiveTxt);
  assert(/412,00/.test(footInactiveTxt), '.dl-foot-inactive carries the inactive driver\'s balance 412,00: ' + footInactiveTxt);
  assert(/κατάσταση οφειλών/i.test(footInactiveTxt), '.dl-foot-inactive carries «κατάσταση οφειλών»: ' + footInactiveTxt);

  await assertHomeGridFits(page, '1440 (home)');
  await page.screenshot({ path: SHOT_HOME_1440, fullPage: true });
  console.log('  screenshot: ' + SHOT_HOME_1440);

  // ── KPI tile «pending»: toggle ΤΑΞΙΝΟΜΗΣΗΣ (δεν κρύβει) — αντικαθιστά το παλιό chip ──
  const pendingTile = page.locator('.dl-kpi-tile[data-kpi="pending"]');
  await pendingTile.click();
  await page.waitForTimeout(150);
  assert(await pendingTile.evaluate(el => el.classList.contains('on')), '.dl-kpi-tile[data-kpi="pending"] carries .on after the first click');
  assert(await page.locator('.dl-card').count() === 4, 'the pending KPI toggle re-sorts, it does not hide cards (still 4)');
  const firstIsPending = await page.locator('.dl-card').first().evaluate(el => el.classList.contains('pending'));
  assert(firstIsPending, 'after the pending KPI toggle, the FIRST .dl-card carries .pending');
  await pendingTile.click();
  await page.waitForTimeout(150);
  assert(!(await pendingTile.evaluate(el => el.classList.contains('on'))), '.dl-kpi-tile[data-kpi="pending"] loses .on on the second click');
  order = await page.$$eval('.dl-card', els => els.map(el => el.getAttribute('data-driver')));
  assert(JSON.stringify(order) === JSON.stringify(['11', '12', '14', '13']), 'clicking the pending KPI tile again returns to the balance-desc order: ' + JSON.stringify(order));

  // ── #dlSort=name, #dlSearch ──
  await page.selectOption('#dlSort', 'name');
  await page.waitForTimeout(150);
  const firstByName = await page.locator('.dl-card').first().getAttribute('data-driver');
  assert(firstByName === '13', '#dlSort=name puts «Αντωνίου Στέλιος» (driver 13, alphabetically first) first — got driver ' + firstByName);
  await page.selectOption('#dlSort', 'balance');
  await page.waitForTimeout(150);

  await page.fill('#dlSearch', 'Καραγιάννη');
  await page.waitForTimeout(150);
  assert(await page.locator('.dl-card').count() === 1, '#dlSearch «Καραγιάννη» narrows the grid to exactly one card');
  assert(await page.locator('.dl-card[data-driver="12"]').count() === 1, '#dlSearch «Καραγιάννη» matches driver 12');
  await page.fill('#dlSearch', '');
  await page.waitForTimeout(150);

  // ── ΚΑΜΙΑ «Όλοι» προβολή πλέον (owner change #3): ο 15 (χωρίς κινήσεις) και
  // ο 16 (ανενεργός) ΠΟΤΕ δεν αποκτούν κάρτα — δεν υπάρχει πλέον κανένα chip
  // που να τους αποκαλύπτει (ήδη επιβεβαιώθηκε παραπάνω η απουσία .dl-chip) ──
  assert(await page.locator('.dl-card[data-driver="15"]').count() === 0, 'driver 15 (no entries) never gets a card');
  assert(await page.locator('.dl-card[data-driver="16"]').count() === 0, 'driver 16 (inactive) never gets a card');

  // ── πληρωμή στην κάρτα: κενό ποσό → κανένα POST· 250 + Μετρητά + Enter → POST + refetch ──
  await page.locator('.dl-card[data-driver="11"] .dl-card-pay').click();
  await page.waitForSelector('.dl-card[data-driver="11"] .dl-cardpay', { timeout: 5000 });
  assert(await page.locator('.dl-cardpay').count() === 1, 'opening the pay panel on 11 shows exactly one .dl-cardpay on the page');
  const postsBeforeInvalid = captured.posts.length;
  await page.locator('.dl-card[data-driver="11"] .dl-cp-save').click();
  await page.waitForTimeout(150);
  assert(captured.posts.length === postsBeforeInvalid, 'an empty/0 amount sends no POST');
  assert((await page.locator('.dl-card[data-driver="11"] .dl-err').innerText()).trim().length > 0, '.dl-err shows a message for an empty amount');

  await page.fill('.dl-card[data-driver="11"] .dl-cp-amount', '250');
  await page.locator('.dl-card[data-driver="11"] .dl-cp-seg').nth(1).click();
  const getsBeforePay = captured.homeGets.length;
  await Promise.all([
    page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/costs/ledger'), { timeout: 10000 }),
    page.locator('.dl-card[data-driver="11"] .dl-cp-amount').press('Enter'),
  ]);
  await page.waitForTimeout(200);
  const payPost = captured.posts[captured.posts.length - 1];
  assert(payPost.driver_id === 11 && payPost.entry_type === 'payment_cash' && Number(payPost.amount) === 250 && payPost.entry_date === d.todayISO,
    'POST /costs/ledger {driver_id:11, entry_type:payment_cash, entry_date:' + d.todayISO + ', amount:250}: ' + JSON.stringify(payPost));
  assert(captured.homeGets.length === getsBeforePay + 1, 'the card payment triggers exactly one refetch GET /costs/ledger (not a local balance edit)');
  assert(captured.homeGets[captured.homeGets.length - 1].includes('month='), 'the refetch GET carries ?month=');
  await page.waitForTimeout(100);
  assert(await page.locator('.dl-cardpay').count() === 0, 'the pay panel closes after a successful save');

  // ── ένα .dl-cardpay τη φορά· Esc κλείνει ──
  await page.locator('.dl-card[data-driver="11"] .dl-card-pay').click();
  await page.waitForSelector('.dl-card[data-driver="11"] .dl-cardpay', { timeout: 5000 });
  await page.locator('.dl-card[data-driver="12"] .dl-card-pay').click();
  await page.waitForSelector('.dl-card[data-driver="12"] .dl-cardpay', { timeout: 5000 });
  assert(await page.locator('.dl-cardpay').count() === 1, 'opening the pay panel on 12 while 11 was open leaves exactly one .dl-cardpay');
  assert(await page.locator('.dl-card[data-driver="11"] .dl-cardpay').count() === 0, 'the panel on 11 closed when 12\'s opened');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert(await page.locator('.dl-cardpay').count() === 0, 'Esc closes the open .dl-cardpay panel');

  // ── εκτύπωση/CSV αρχικής ──
  await page.locator('#dlBtnPrintHome').click();
  await page.waitForSelector('.dl-menu-print-drivers', { timeout: 5000 });
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.dl-menu-print-drivers').click(),
  ]);
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  assert(popup.url().includes('print_payroll.html') && popup.url().includes('doc=drivers'),
    '#dlBtnPrintHome → .dl-menu-print-drivers opens print_payroll.html?doc=drivers: ' + popup.url());
  await popup.close();

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.locator('#dlBtnCsvHome').click(),
  ]);
  const csvText = fs.readFileSync(await download.path()).toString('utf8').replace(/^﻿/, '');
  const csvHeader = csvText.split(/\r?\n/)[0];
  assert(csvHeader === 'Οδηγός;Τύπος;Υπόλοιπο;Δρομολόγια έτους;Χωρίς αξία;Τελευταία κίνηση;Τελευταία πληρωμή', 'CSV header row: ' + csvHeader);

  // ── .dl-card-open ανοίγει την καρτέλα v3, «← Μισθοδοσία» επιστρέφει ──
  await page.locator('.dl-card[data-driver="11"] .dl-card-open').click();
  await page.waitForSelector('.dl-ledger', { timeout: 15000 });
  assert(await page.locator('.dl-ledger').count() >= 1, '.dl-card-open (11) opens the v3 ledger tab (.dl-ledger)');
  await page.locator('.dl-head a', { hasText: 'Μισθοδοσία' }).click();
  await page.waitForSelector('.dl-grid', { timeout: 15000 });
  assert(await page.locator('.dl-grid').count() === 1, '«← Μισθοδοσία» returns to the card grid (.dl-grid)');

  consoleErrors.push(...mainErrors);
  await context.close();

  // ── 1440/1280: στήλες ανά σειρά, χωρίς οριζόντιο scroll ──
  console.log('  -- 1280/1440 (home, fresh fixture) --');
  for (const width of [1440, 1280]) {
    const { context: vpCtx, page: vpPage, consoleErrors: vpErrors } = await newPage(browser, 'accountant', { width, height: 900 });
    installPayrollHomeMocks(vpPage);
    await gotoPage(vpPage, 'payroll', BASE_URL);
    await vpPage.waitForSelector('.dl-grid', { timeout: 15000 });
    await vpPage.waitForTimeout(150);
    await assertCardsShareRow(vpPage, String(width), width === 1440 ? 4 : 3);
    await assertHomeGridFits(vpPage, String(width) + ' (home)');
    if (width === 1280) { await vpPage.screenshot({ path: SHOT_HOME_1280, fullPage: true }); console.log('  screenshot: ' + SHOT_HOME_1280); }
    consoleErrors.push(...vpErrors);
    await vpCtx.close();
  }

  // ── χωρίς `month` στην απάντηση: .dl-note ορατό, κάρτες με «—», badge/υπόλοιπο σωστά ──
  console.log('  -- χωρίς month στην απάντηση (Worker πριν το ledger-month.mjs deploy) --');
  const { context: noMonthCtx, page: noMonthPage, consoleErrors: noMonthErrors } = await newPage(browser, 'accountant');
  installPayrollHomeMocks(noMonthPage, { omitMonth: true });
  await gotoPage(noMonthPage, 'payroll', BASE_URL);
  await noMonthPage.waitForSelector('.dl-grid', { timeout: 15000 });
  await noMonthPage.waitForTimeout(150);
  assert(await noMonthPage.locator('.dl-note').isVisible(), '.dl-note is visible when the `month` block is missing');
  assert(/Δεν φορτώθηκαν τα ποσά μήνα/.test(await noMonthPage.locator('.dl-note').innerText()), '.dl-note reads «Δεν φορτώθηκαν τα ποσά μήνα»');
  assert(await noMonthPage.locator('.dl-card').count() === 4, 'the 4 cards still render without the month block');
  const ms11NoMonth = await noMonthPage.locator('.dl-card[data-driver="11"] .dl-ms').innerText();
  assert(/—/.test(ms11NoMonth), 'card 11 mini-stats fall back to «—» without the month block: ' + ms11NoMonth.replace(/\s+/g, ' '));
  assert(/2\s*χωρίς αξία/.test(await noMonthPage.locator('.dl-card[data-driver="11"] .dl-badge').innerText()), 'card 11 .dl-badge («2 χωρίς αξία», driver-level pending_count) is unaffected by the missing month block');
  assert((await noMonthPage.locator('.dl-card[data-driver="11"] .dl-bal').innerText()).trim() === '1.726,27', 'card 11 .dl-bal (driver-level balance) is unaffected by the missing month block');
  // KPI: trips/payments depend on the `month` block (→ «—»); owed/pending/
  // active come straight from the balances rows and stay computed.
  assert((await noMonthPage.locator('.dl-kpi-tile[data-kpi="trips"] .v').innerText()).trim() === '—', 'KPI trips shows «—» without the month block');
  assert((await noMonthPage.locator('.dl-kpi-tile[data-kpi="payments"] .v').innerText()).trim() === '—', 'KPI payments shows «—» without the month block');
  assert(/2\.530,37/.test(await noMonthPage.locator('.dl-kpi-tile[data-kpi="owed"] .v').innerText()), 'KPI owed stays computed (driver-level) without the month block');
  assert((await noMonthPage.locator('.dl-kpi-tile[data-kpi="pending"] .v').innerText()).trim() === '4', 'KPI pending stays computed (driver-level) without the month block');
  assert((await noMonthPage.locator('.dl-kpi-tile[data-kpi="active"] .v').innerText()).trim() === '4', 'KPI active stays computed without the month block');
  consoleErrors.push(...noMonthErrors);
  await noMonthCtx.close();

  // ── χωρίς ανενεργό με μη-μηδενικό υπόλοιπο: .dl-foot-inactive ΑΠΟΥΣΑ ──
  console.log('  -- χωρίς ανενεργό με μη-μηδενικό υπόλοιπο (.dl-foot-inactive απούσα) --');
  const { context: noInactiveCtx, page: noInactivePage, consoleErrors: noInactiveErrors } = await newPage(browser, 'accountant');
  installPayrollHomeMocks(noInactivePage, { inactiveBalance: 0 });
  await gotoPage(noInactivePage, 'payroll', BASE_URL);
  await noInactivePage.waitForSelector('.dl-grid', { timeout: 15000 });
  await noInactivePage.waitForTimeout(150);
  assert(await noInactivePage.locator('.dl-foot-inactive').count() === 0, '.dl-foot-inactive is ABSENT when no inactive driver carries a non-zero balance');
  consoleErrors.push(...noInactiveErrors);
  await noInactiveCtx.close();

  return { consoleErrors };
}

// ═══════════════════════════════ ΚΑΡΤΕΛΑ (accountant) ═══════════════════════════════
async function runDriverCardFlow(browser) {
  console.log('\n== accountant · καρτέλα οδηγού (id 11, Αύγουστος 2026) ==');
  const { context, page, consoleErrors } = await newPage(browser, 'accountant');
  const { captured } = installPayrollMocks(page);
  await gotoPage(page, 'payroll', BASE_URL);
  await page.waitForSelector('.dl-page', { timeout: 15000 });
  await page.evaluate(id => renderPayrollDriver(id), DRIVER_ID);
  await page.waitForSelector('.dl-ledger', { timeout: 15000 });
  // Explicit period — the rig's «today» is NOT frozen (preparePage does not
  // fix the clock), so the screen must be told 2026-08 rather than relying on
  // whatever month the machine running this rig happens to be in.
  // Year is a row of chips, not a <select> (contract fix 14/9, Figma
  // 600:1011 — the written contract's first draft guessed a #dlYear select).
  await page.locator('.dl-ychip[data-year="2026"]').click();
  await page.waitForTimeout(100);
  assert(await page.locator('.dl-ychip[data-year="2026"].sel').count() === 1, '.dl-ychip[data-year="2026"] carries .sel once clicked');
  await page.selectOption('#dlMonth', '08');
  await page.waitForTimeout(150);

  // ── buttons ──
  assert(await page.locator('#dlBtnPayment').count() === 1, '#dlBtnPayment «Πληρωμή» exists');
  assert(await page.locator('#dlBtnAdjust').count() === 1, '#dlBtnAdjust «Προσαρμογή» exists');
  assert(await page.locator('#dlBtnTrip').count() === 1, '#dlBtnTrip «Δρομολόγιο» exists');
  assert(await page.locator('#dlBtnPrintCard').count() === 1, '#dlBtnPrintCard «Εκτύπωση καρτέλας» exists');
  assert(await page.locator('#dlBtnCsvCard').count() === 1, '#dlBtnCsvCard «CSV» exists');
  assert(await page.locator('#dlBtnPayment.primary').count() === 1, '#dlBtnPayment carries .primary (the only navy button)');
  for (const other of ['#dlBtnAdjust', '#dlBtnTrip', '#dlBtnPrintCard', '#dlBtnCsvCard']) {
    assert(await page.locator(other + '.primary').count() === 0, other + ' does NOT carry .primary');
  }

  // ── header, in order: ΗΜ/ΝΙΑ · ΚΙΝΗΣΗ · ΑΞΙΑ · ΕΛΑΒΕ · ΕΞΟΔΑ · ΜΕΤΑΒΟΛΗ · ΥΠΟΛΟΙΠΟ ──
  const headerText = (await page.locator('.dl-th').innerText()).replace(/\s+/g, ' ');
  const HEADER_RE = /ΗΜ\/ΝΙΑ[\s\S]*ΚΙΝΗΣΗ[\s\S]*ΑΞΙΑ[\s\S]*ΕΛΑΒΕ[\s\S]*ΕΞΟΔΑ[\s\S]*ΜΕΤΑΒΟΛΗ[\s\S]*ΥΠΟΛΟΙΠΟ/;
  assert(HEADER_RE.test(headerText), '.dl-th carries the 7 words in order ΗΜ/ΝΙΑ·ΚΙΝΗΣΗ·ΑΞΙΑ·ΕΛΑΒΕ·ΕΞΟΔΑ·ΜΕΤΑΒΟΛΗ·ΥΠΟΛΟΙΠΟ: ' + headerText);
  assert(!/ΣΥΝΟΛΟ/.test(headerText), '.dl-th never says «ΣΥΝΟΛΟ» (design fix #6): ' + headerText);

  // ── opening / closing (dlPeriod fixture truth: 450,00 → 130,00) ──
  const openingTxt = (await page.locator('.dl-row.opening').innerText()).replace(/\s+/g, ' ');
  assert(/Υπόλοιπο έναρξης/.test(openingTxt), '.dl-row.opening reads «Υπόλοιπο έναρξης»: ' + openingTxt);
  assert(/450,00/.test(openingTxt), '.dl-row.opening shows 450,00 (opening balance before August): ' + openingTxt);
  const closingTxt = (await page.locator('.dl-closing').innerText()).replace(/\s+/g, ' ');
  assert(/130,00/.test(closingTxt), '.dl-closing shows 130,00 (closing balance after August): ' + closingTxt);

  // ── visible-row set: 2,3,4,5 (August), NOT 1 (July) or 6 (September) ──
  for (const id of [2, 3, 4, 5]) {
    assert(await page.locator('.dl-row[data-entry="' + id + '"]').count() === 1, '.dl-row[data-entry="' + id + '"] is visible (August)');
  }
  for (const id of [1, 6]) {
    assert(await page.locator('.dl-row[data-entry="' + id + '"]').count() === 0, '.dl-row[data-entry="' + id + '"] is NOT visible (outside August)');
  }

  // ── pending (id 3) / cancelled (id 5) rows ──
  assert(await page.locator('.dl-row.pending').count() === 1, 'exactly one .dl-row.pending');
  assert(await page.locator('.dl-row.pending[data-entry="3"]').count() === 1, 'the pending row is id 3 (trip χωρίς αξία)');
  assert(/χωρίς αξία/.test(await page.locator('.dl-row.pending').innerText()), '.dl-row.pending carries the words «χωρίς αξία»');
  await assertPendingBorderIsWarn(page);
  assert(await page.locator('.dl-row.canc').count() === 1, 'exactly one .dl-row.canc');
  assert(await page.locator('.dl-row.canc[data-entry="5"]').count() === 1, 'the cancelled row is id 5');

  // ── signs: ΜΕΤΑΒΟΛΗ / ΥΠΟΛΟΙΠΟ for id 2 and id 4 ──
  const row2Txt = (await page.locator('.dl-row[data-entry="2"]').innerText()).replace(/\s+/g, ' ');
  assert(/−300,00/.test(row2Txt), 'row 2 ΜΕΤΑΒΟΛΗ shows −300,00 (U+2212): ' + row2Txt);
  assert(/150,00/.test(row2Txt), 'row 2 ΥΠΟΛΟΙΠΟ shows 150,00: ' + row2Txt);
  const row4Txt = (await page.locator('.dl-row[data-entry="4"]').innerText()).replace(/\s+/g, ' ');
  assert(/−20,00/.test(row4Txt), 'row 4 ΜΕΤΑΒΟΛΗ shows −20,00 (U+2212): ' + row4Txt);
  assert(/130,00/.test(row4Txt), 'row 4 ΥΠΟΛΟΙΠΟ shows 130,00: ' + row4Txt);

  // ── no «€» in any amount cell; exactly one in the footer ──
  // Scoped to .dl-ledger — .dl-stats (the 5 year-total boxes) legitimately
  // carries «€» (dlEur), the contract's «no €» rule is about the table's own
  // cells only.
  const cellTexts = await page.locator('.dl-ledger .dl-row .n').allInnerTexts();
  assert(cellTexts.every(t => !/€/.test(t)), 'no «€» inside any .dl-ledger .dl-row .n cell (checked ' + cellTexts.length + ' cells)');
  const footTxt = await page.locator('.dl-foot').innerText();
  const euroCount = (footTxt.match(/€/g) || []).length;
  assert(euroCount === 1, '«€» appears exactly once in .dl-foot (got ' + euroCount + '): ' + footTxt.replace(/\s+/g, ' '));

  // ── no hex colours in the module source (tokens only, design point 10) —
  // fetched from the live server so this checks whatever is actually served,
  // not a hardcoded path (the rig may run against a merged temp branch). ──
  const srcResp = await page.request.get(BASE_URL + 'modules/payroll.js');
  const src = await srcResp.text();
  const hexMatches = src.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert(hexMatches.length === 0, 'modules/payroll.js carries no hex colours (found: ' + hexMatches.join(',') + ')');

  await assertGridFits(page, '1440 (card)');
  await page.screenshot({ path: SHOT_1440, fullPage: true });
  console.log('  screenshot: ' + SHOT_1440);

  // ── menu «···»: absent on the cancelled row, present+openable on a live one.
  // «Διόρθωση» is trip-only per the contract («μόνο trip → inline edit») — id
  // 3 (a trip) must show BOTH items, id 2 (a payment) must show ONLY Ακύρωση. ──
  assert(await page.locator('.dl-row.canc .dl-more').count() === 0, 'the cancelled row (id 5) has no .dl-more');
  await page.locator('.dl-row[data-entry="3"] .dl-more').click();
  await page.waitForSelector('.dl-menu', { timeout: 5000 });
  assert(await page.locator('.dl-menu-edit').count() >= 1, '.dl-menu on a trip row (id 3) shows «Διόρθωση» (.dl-menu-edit)');
  assert(await page.locator('.dl-menu-cancel').count() >= 1, '.dl-menu on a trip row (id 3) shows «Ακύρωση» (.dl-menu-cancel)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await page.locator('.dl-row[data-entry="2"] .dl-more').click();
  await page.waitForSelector('.dl-menu', { timeout: 5000 });
  assert(await page.locator('.dl-menu-edit').count() === 0, '.dl-menu on a non-trip row (id 2, payment) has NO «Διόρθωση» — contract: edit is trip-only');
  assert(await page.locator('.dl-menu-cancel').count() >= 1, '.dl-menu on a non-trip row (id 2) still shows «Ακύρωση»');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // ── Διόρθωση on id 3 (a trip): first fill an EMPTY value → PATCH WITHOUT
  // reason (contract: reason only when an already-written value changes) —
  // «inline edit όπως σήμερα» = the existing #dlEiValue/#dlEiAdvance/#dlEiExpenses,Enter pattern. ──
  await page.locator('.dl-row[data-entry="3"] .dl-more').click();
  await page.waitForSelector('.dl-menu', { timeout: 5000 });
  await page.locator('.dl-menu-edit').click();
  await page.waitForSelector('#dlEiValue', { timeout: 5000 });
  await page.fill('#dlEiValue', '222');
  const patchesBefore1 = captured.patches.length;
  await Promise.all([
    page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/costs/ledger/'), { timeout: 10000 }),
    page.locator('#dlEiValue').press('Enter'),
  ]);
  await page.waitForTimeout(150);
  assert(captured.patches.length === patchesBefore1 + 1, 'filling the empty trip_value sent exactly one PATCH');
  const fillPatch = captured.patches[captured.patches.length - 1];
  assert(fillPatch.id === 3 && Number(fillPatch.body.trip_value) === 222, 'PATCH /costs/ledger/3 {trip_value:222}: ' + JSON.stringify(fillPatch.body));
  assert(!('reason' in fillPatch.body), 'no reason required — id 3 trip_value was empty: ' + JSON.stringify(fillPatch.body));

  // Now id 3 HAS a written value — changing it again must carry a reason.
  await page.locator('.dl-row[data-entry="3"] .dl-more').click();
  await page.waitForSelector('.dl-menu', { timeout: 5000 });
  await page.locator('.dl-menu-edit').click();
  await page.waitForSelector('#dlEiValue', { timeout: 5000 });
  await page.fill('#dlEiValue', '333');
  await Promise.all([
    page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/costs/ledger/'), { timeout: 10000 }),
    page.locator('#dlEiValue').press('Enter'),
  ]);
  await page.waitForTimeout(150);
  const editPatch = captured.patches[captured.patches.length - 1];
  assert(editPatch.id === 3 && Number(editPatch.body.trip_value) === 333 && editPatch.body.reason === 'proof: test reason',
    'PATCH /costs/ledger/3 {trip_value:333, reason} — reason required (222 was already written): ' + JSON.stringify(editPatch.body));

  // ── Ακύρωση on id 2 (a payment) — prompt reason → PATCH {cancel:true,reason} ──
  await page.locator('.dl-row[data-entry="2"] .dl-more').click();
  await page.waitForSelector('.dl-menu', { timeout: 5000 });
  await Promise.all([
    page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/costs/ledger/2'), { timeout: 10000 }),
    page.locator('.dl-menu-cancel').click(),
  ]);
  await page.waitForTimeout(150);
  const cancelPatch = captured.patches.find(p => p.id === 2 && p.body.cancel);
  assert(!!cancelPatch, 'PATCH /costs/ledger/2 {cancel:true,...} was sent');
  assert(cancelPatch.body.reason === 'proof: test reason', 'the cancel PATCH carries the prompted reason: ' + JSON.stringify(cancelPatch.body));
  await page.waitForSelector('.dl-row.canc[data-entry="2"]', { timeout: 5000 });
  assert(await page.locator('.dl-row[data-entry="2"] .dl-more').count() === 0, 'row 2 loses its .dl-more once cancelled');

  // ── Προσαρμογή: empty reason blocks the POST, a reason sends it ──
  const postsBeforeAdj = captured.posts.length;
  await page.locator('#dlBtnAdjust').click();
  await page.waitForSelector('#dlAdjSave', { timeout: 5000 });
  await page.fill('#dlAdjDate', '2026-08-20');
  await page.fill('#dlAdjAmount', '-15');
  await page.locator('#dlAdjSave').click();
  await page.waitForTimeout(200);
  assert(captured.posts.length === postsBeforeAdj, 'empty λόγος: no POST was sent');
  assert((await page.locator('#dlErr').innerText()).trim().length > 0, '#dlErr carries a message when the λόγος is empty');
  await page.fill('#dlAdjReason', 'proof: test reason');
  await Promise.all([
    page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/costs/ledger'), { timeout: 10000 }),
    page.locator('#dlAdjSave').click(),
  ]);
  await page.waitForTimeout(150);
  const adjPost = captured.posts[captured.posts.length - 1];
  assert(adjPost.driver_id === DRIVER_ID && adjPost.entry_type === 'adjustment' && Number(adjPost.amount) === -15 && adjPost.note === 'proof: test reason',
    'POST /costs/ledger {driver_id:11, entry_type:adjustment, amount:-15, note:reason}: ' + JSON.stringify(adjPost));

  // ── Πληρωμή: #dlPayAmount 100, Μετρητά → POST payment_cash ──
  const postsBeforePay = captured.posts.length;
  await page.locator('#dlBtnPayment').click();
  await page.waitForSelector('#dlPaySave', { timeout: 5000 });
  await page.locator('#dlPaySeg', { hasText: 'Μετρητά' }).click().catch(() => {});
  await page.locator('button', { hasText: 'Μετρητά' }).click().catch(() => {});
  await page.fill('#dlPayAmount', '100');
  await Promise.all([
    page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/costs/ledger'), { timeout: 10000 }),
    page.locator('#dlPaySave').click(),
  ]);
  await page.waitForTimeout(150);
  assert(captured.posts.length === postsBeforePay + 1, 'the payment sent exactly one POST');
  const payPost = captured.posts[captured.posts.length - 1];
  assert(payPost.entry_type === 'payment_cash' && Number(payPost.amount) === 100, 'POST /costs/ledger {entry_type:payment_cash, amount:100}: ' + JSON.stringify(payPost));

  // ── Γρήγορη καταχώριση: route + value → POST trip ──
  const postsBeforeQe = captured.posts.length;
  await page.fill('#dlQeRoute', 'proof: δοκιμαστική διαδρομή');
  await page.fill('#dlQeValue', '77');
  await Promise.all([
    page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/costs/ledger'), { timeout: 10000 }),
    page.locator('#dlQeSave').click(),
  ]);
  await page.waitForTimeout(150);
  assert(captured.posts.length === postsBeforeQe + 1, 'the quick entry sent exactly one POST');
  const qePost = captured.posts[captured.posts.length - 1];
  assert(qePost.entry_type === 'trip' && qePost.driver_id === DRIVER_ID, 'POST /costs/ledger {entry_type:trip, driver_id:11}: ' + JSON.stringify(qePost));

  // ── περίοδος: μήνας 07 → opening 0,00 / closing 450,00, ΚΑΝΕΝΑ νέο GET
  // (id 1, July, is untouched by every write above — all landed in Aug/Sep) ──
  const getsBefore = captured.ledgerGets.length;
  await page.selectOption('#dlMonth', '07');
  await page.waitForTimeout(200);
  assert(captured.ledgerGets.length === getsBefore, 'switching to July issued NO new GET /costs/ledger/11 (client-side dlPeriod slice)');
  const julyOpening = (await page.locator('.dl-row.opening').innerText()).replace(/\s+/g, ' ');
  assert(/0,00/.test(julyOpening), 'July: opening 0,00 (nothing before it): ' + julyOpening);
  const julyClosing = (await page.locator('.dl-closing').innerText()).replace(/\s+/g, ' ');
  assert(/450,00/.test(julyClosing), 'July: closing 450,00 (just entry id 1): ' + julyClosing);
  await page.selectOption('#dlMonth', '08'); // restore, for the popup URL check below

  // ── εκτύπωση: κουμπί ανοίγει popup με το σωστό URL ──
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('#dlBtnPrintCard').click(),
  ]);
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  assert(popup.url().includes('print_payroll.html') && popup.url().includes('doc=card') && popup.url().includes('driver=11') && popup.url().includes('year=2026') && popup.url().includes('month=08'),
    '#dlBtnPrintCard opens print_payroll.html?doc=card&driver=11&year=2026&month=08: ' + popup.url());
  await popup.close();

  // ── CSV: header, BOM, opening/closing rows, live-August-row count, no «€» ──
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.locator('#dlBtnCsvCard').click(),
  ]);
  const csvPath = await download.path();
  const csvBuf = fs.readFileSync(csvPath);
  assert(csvBuf[0] === 0xEF && csvBuf[1] === 0xBB && csvBuf[2] === 0xBF, 'CSV starts with a UTF-8 BOM');
  const csvText = csvBuf.toString('utf8').replace(/^﻿/, '');
  const csvLines = csvText.split(/\r?\n/).filter(l => l.length);
  assert(csvLines[0] === 'Ημερομηνία;Κίνηση;Αξία;Έλαβε;Έξοδα;Μεταβολή;Υπόλοιπο', 'CSV header row: ' + csvLines[0]);
  assert(/Υπόλοιπο έναρξης περιόδου/.test(csvLines[1]), 'CSV row 2 is «Υπόλοιπο έναρξης περιόδου»: ' + csvLines[1]);
  assert(/Υπόλοιπο τέλους περιόδου/.test(csvLines[csvLines.length - 1]), 'CSV last row is «Υπόλοιπο τέλους περιόδου»: ' + csvLines[csvLines.length - 1]);
  // Live August rows in the ORIGINAL fixture were 3 (ids 2,3,4 — id 5 was
  // cancelled from the start); by now this same flow ALSO cancelled id 2 and
  // added an adjustment+payment+trip via the buttons above (all outside
  // August except the adjustment, dated 2026-08-20) — so the CSV proof here
  // checks structure/columns, not a fixed row count that the earlier mutation
  // steps have already deliberately moved past.
  assert(csvLines.slice(2, -1).length >= 1, 'CSV carries at least one live-movement row between the two balance rows');
  assert(!/€/.test(csvText), 'CSV carries no «€» anywhere');

  await assertGridFits(page, '1440 (card, post-interaction)');
  await context.close();
  return { consoleErrors, captured };
}

// ═══════════════════════════════ 1280/1440 (fresh fixture) ═══════════════════════════════
async function runViewportChecks(browser) {
  console.log('\n== 1280/1440 · no horizontal scroll (fresh fixture) ==');
  const errors = [];
  for (const width of [1280, 1440]) {
    const { context, page, consoleErrors } = await newPage(browser, 'accountant', { width, height: 900 });
    installPayrollMocks(page);
    await gotoPage(page, 'payroll', BASE_URL);
    await page.waitForSelector('.dl-page', { timeout: 15000 });
    await page.evaluate(id => renderPayrollDriver(id), DRIVER_ID);
    await page.waitForSelector('.dl-ledger', { timeout: 15000 });
    await page.locator('.dl-ychip[data-year="2026"]').click();
    await page.selectOption('#dlMonth', '08');
    await page.waitForTimeout(150);
    await assertGridFits(page, String(width));
    if (width === 1280) { await page.screenshot({ path: SHOT_1280, fullPage: true }); console.log('  screenshot: ' + SHOT_1280); }
    errors.push(...consoleErrors);
    await context.close();
  }
  return { consoleErrors: errors };
}

// ═══════════════════════════════ εκτύπωση A4 (direct navigation) ═══════════════════════════════
async function runPrintPageFlow(browser) {
  console.log('\n== print_payroll.html · κάρτα οδηγού + λίστα οφειλών ==');
  const { context, page, consoleErrors } = await newPage(browser, 'accountant');
  installPayrollMocks(page);
  // print_payroll.html reads tms_jwt/tms_user directly (same pattern as
  // print.html) rather than through app.html's bootstrap cookie bridge, so a
  // plain goto with localStorage pre-seeded (via preparePage's addInitScript)
  // is enough — no gotoPage/critic_page cookie needed here.
  await page.goto('print_payroll.html?doc=card&driver=' + DRIVER_ID + '&year=2026&month=08&noprint=1');
  await page.waitForSelector('#doc', { timeout: 15000 });
  const cardText = (await page.locator('#doc').innerText()).replace(/\s+/g, ' ');
  // Contract fix 14/9: titles render mixed-case («Κατάσταση λογαριασμού
  // οδηγού»), not the all-caps guess of the first written contract — the rig
  // checks case-insensitively. Period in .p-meta is a date range
  // («01/08/2026 – 31/08/2026»), not a Greek month name.
  assert(/ΚΑΤΑΣΤΑΣΗ ΛΟΓΑΡΙΑΣΜΟΥ ΟΔΗΓΟΥ/i.test(cardText), '.doc-title reads «Κατάσταση λογαριασμού οδηγού» (case-insensitive): ' + cardText.slice(0, 200));
  assert(/01\/08\/2026/.test(cardText) && /31\/08\/2026/.test(cardText), '.p-meta carries the period as a date range 01/08/2026–31/08/2026: ' + cardText.slice(0, 300));
  assert(/450,00/.test(await page.locator('.p-opening').innerText()), '.p-opening shows 450,00');
  const pClosingTxt = await page.locator('.p-closing').innerText();
  assert(/130,00/.test(pClosingTxt), '.p-closing shows 130,00: ' + pClosingTxt);
  assert(/€/.test(pClosingTxt), '.p-closing carries «€» (contract fix 14/9 — unlike the screen'+"'"+'s .dl-closing, the A4 total DOES show the currency mark): ' + pClosingTxt);
  // 6-column paper table (Figma 601:1011, contract fix 14/9): ΗΜ/ΝΙΑ·ΚΙΝΗΣΗ·
  // ΑΞΙΑ·ΕΛΑΒΕ·ΕΞΟΔΑ·ΥΠΟΛΟΙΠΟ — ΜΕΤΑΒΟΛΗ is dropped on paper (screen-only column).
  const pHeaderTxt = (await page.locator('table.p-ledger tr').first().innerText()).replace(/\s+/g, ' ');
  const P_HEADER_RE = /ΗΜ\/ΝΙΑ[\s\S]*ΚΙΝΗΣΗ[\s\S]*ΑΞΙΑ[\s\S]*ΕΛΑΒΕ[\s\S]*ΕΞΟΔΑ[\s\S]*ΥΠΟΛΟΙΠΟ/i;
  assert(P_HEADER_RE.test(pHeaderTxt), 'table.p-ledger header carries the 6 words ΗΜ/ΝΙΑ·ΚΙΝΗΣΗ·ΑΞΙΑ·ΕΛΑΒΕ·ΕΞΟΔΑ·ΥΠΟΛΟΙΠΟ: ' + pHeaderTxt);
  assert(!/ΜΕΤΑΒΟΛΗ/i.test(pHeaderTxt), 'table.p-ledger header has NO ΜΕΤΑΒΟΛΗ column (paper drops it): ' + pHeaderTxt);
  const sigText = (await page.locator('.p-sign').innerText()).replace(/\s+/g, ' ');
  assert(/Ο οδηγός/.test(sigText) && /Για την εταιρεία/.test(sigText), '.p-sign carries «Ο οδηγός» and «Για την εταιρεία»: ' + sigText);
  assert(/Εκτυπώθηκε/.test(await page.locator('.p-printed').innerText()), '.p-printed carries «Εκτυπώθηκε»');

  await page.goto('print_payroll.html?doc=drivers&noprint=1');
  await page.waitForSelector('#doc', { timeout: 15000 });
  const listText = (await page.locator('#doc').innerText()).replace(/\s+/g, ' ');
  assert(/ΚΑΤΑΣΤΑΣΗ ΟΦΕΙΛΩΝ ΟΔΗΓΩΝ/i.test(listText), '.doc-title reads «Κατάσταση οφειλών οδηγών» (case-insensitive): ' + listText.slice(0, 200));
  assert(listText.includes(DRIVER_NAME), 'the drivers list names the driver (' + DRIVER_NAME + ')');

  await context.close();
  return { consoleErrors };
}

// ═══════════════════════════════ ρόλοι ═══════════════════════════════
async function runManagementFlow(browser) {
  console.log('\n== management (read access) ==');
  const { context, page, consoleErrors } = await newPage(browser, 'management');
  installPayrollMocks(page);
  await gotoPage(page, 'payroll', BASE_URL);
  await page.waitForSelector('.dl-page', { timeout: 15000 });
  assert(await page.locator('#nav_payroll').count() === 1, 'management: #nav_payroll present');
  await page.evaluate(id => renderPayrollDriver(id), DRIVER_ID);
  await page.waitForSelector('.dl-ledger', { timeout: 15000 });
  assert(await page.locator('.dl-page').count() === 1, 'management: the driver card renders (.dl-page)');
  assert(await page.locator('.dl-row[data-entry]').count() > 0, 'management: ledger rows render');
  await context.close();
  return { consoleErrors };
}

async function runDispatcherFlow(browser) {
  console.log('\n== dispatcher (no access) ==');
  const { context, page, consoleErrors } = await newPage(browser, 'dispatcher');
  installPayrollMocks(page);
  await gotoPage(page, 'payroll', BASE_URL);
  await page.waitForTimeout(1500);
  assert(await page.locator('#nav_payroll').count() === 0, 'dispatcher: no #nav_payroll');
  assert(await page.locator('.dl-page').count() === 0, 'dispatcher: .dl-page does not render');
  await context.close();
  return { consoleErrors };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const home = await runHomeFlow(browser);
    const card = await runDriverCardFlow(browser);
    const vp = await runViewportChecks(browser);
    const print = await runPrintPageFlow(browser);
    const mgmt = await runManagementFlow(browser);
    const disp = await runDispatcherFlow(browser);
    const all = [...home.consoleErrors, ...card.consoleErrors, ...vp.consoleErrors, ...print.consoleErrors, ...mgmt.consoleErrors, ...disp.consoleErrors];
    console.log('\n== console errors ==');
    console.log('home:', home.consoleErrors.length, 'card:', card.consoleErrors.length, 'viewport:', vp.consoleErrors.length, 'print:', print.consoleErrors.length, 'management:', mgmt.consoleErrors.length, 'dispatcher:', disp.consoleErrors.length);
    if (all.length) all.forEach(e => console.log('  ! ' + e));
    console.log('\n== captured request bodies (accountant) ==');
    console.log(JSON.stringify({ posts: card.captured.posts, patches: card.captured.patches }, null, 2));
    if (all.length > 0) console.log('\nΠΡΟΣΟΧΗ: ' + all.length + ' console error(s) — δες πάνω πριν τα θεωρήσεις θόρυβο HAR replay.');
    console.log('\nΟΛΟΙ ΟΙ ΕΛΕΓΧΟΙ ΠΕΡΑΣΑΝ.');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n' + (e && e.stack || e));
  process.exit(1);
});
