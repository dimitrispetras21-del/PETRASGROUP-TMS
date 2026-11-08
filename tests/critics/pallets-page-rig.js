// Rig — «Παλέτες» redesign Υ3 (owner-approved Figma 28/10, frames N01–N18). Invented data only (the repo is
// public): the orders of tests/critics/orders-week-proof.js for the enrichment, a mocked /pallets/* that keeps its
// movements in memory and records every write. Judged on the DOM and on the requests that left (the write
// bodies are what reaches pl_movements through the Worker):
//   action   — N01: «Θέλουν δράση» counts, groups, red bar > 14 days, stop pallets, place, scheduled, «ακόμη»;
//   confirm  — N12: Enter on a row, «Μετά την επιβεβαίωση», PATCH {taken,given,sheet_source} + POST /confirm,
//              the wizard moves on; a failed confirm and a «no longer pending» stay in the modal (N16 Ζ);
//   noreturn — N03 rows and the grand total; moves — N04/N05 groups, period, multi-word search;
//   balances — N07 + the card N09 (running balance) and its print button;
//   panel    — N11h/N14b: history fallback while /history is 404 (N18 Δ), records (N11h), failure (N18 Γ);
//              reverse needs a reason; the delivery correction N14a posts reverse + replacement + confirm;
//   new      — N15: type tiles, the double-entry warning, POST body;
//   roles    — management: no write button anywhere (N16 Ε); the «Εβδομάδα» tab still draws.
// Run from the MAIN repo root (node_modules), against a server of the tree under test:
//   cd /Users/dimitrispetras/PETRASGROUP-TMS && PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<wt>/ node <tree>/tests/critics/pallets-page-rig.js
const P = require('./orders-week-proof.js');
const path = require('path');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));
const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8792/';
const SHOTS = process.env.PW_SHOT_DIR || path.join(require('os').tmpdir(), 'pallets-page-rig');
require('fs').mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ ' + msg); } };

// Local dates relative to today, as the page computes them (localToday).
const iso = off => { const d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const sgn = n => n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0';
const NAMES = { 10: 'Berger Obst KG', 11: 'Nordfrisch GmbH', 12: 'Delta Logistics', 13: 'Gamma Foods', 14: 'Kappa Fruits' };
const OBST = { name: 'Obst Hof GmbH', city: 'Stubenberg', country: 'AT' }, KAUF = { name: 'Kaufland', city: 'Plovdiv', country: 'BG' };
let MOVES, nextId;
function seed() {
  nextId = 900;
  const mv = (id, o) => Object.assign({ id, code: 'PM-' + id, counterparty_type: 'CLIENT', taken: 0, given: 0, status: 'pending', event_type: 'LOADING',
    created_by: 'demo_dispatcher', created_at: iso(-25) + 'T08:00:00Z' }, o);
  const C = (cid, o) => mv(o.id, Object.assign({ client_id: cid, clients: { company_name: NAMES[cid] } }, o));
  MOVES = [
    C(10, { id: 1, order_id: 1241, movement_date: iso(-20), taken: 11, location_id: 607, locations: OBST, order_stop_id: 501, order_stops: { pallets: 11, pallets_exchanged: 11 } }),
    C(10, { id: 2, order_id: 1246, movement_date: iso(-7), taken: 29, location_id: 607, locations: OBST, order_stop_id: 502, order_stops: { pallets: 30, pallets_exchanged: null } }),
    C(10, { id: 3, order_id: 1243, movement_date: iso(3), taken: 8, location_id: 607, locations: OBST, order_stop_id: 503 }),
    C(11, { id: 4, order_id: 1244, movement_date: iso(-2), taken: 10, location_id: 700, locations: { name: 'Zeeland Coldstore', city: 'Vlissingen', country: 'NL' }, order_stop_id: 504 }),
    mv(5, { counterparty_type: 'PARTNER', partner_id: 20, partners: { company_name: 'Trans Nord ΕΠΕ' }, event_type: 'PARTNER_DROPOFF', movement_date: iso(-6), given: 33 }),
    C(12, { id: 6, order_id: 1248, movement_date: iso(-30), taken: 5, order_stop_id: 506 }),
    C(13, { id: 7, movement_date: iso(-31), taken: 6 }),
    C(14, { id: 8, movement_date: iso(-32), taken: 7 }),
    C(10, { id: 9, order_id: 1241, event_type: 'DELIVERY', status: 'confirmed', movement_date: iso(-10), taken: 0, given: 10, location_id: 800, locations: KAUF, order_stop_id: 509, confirmed_at: iso(-9) + 'T09:00:00Z', confirmed_by: 'demo_accountant' }),
    C(10, { id: 10, order_id: 1246, event_type: 'DELIVERY', status: 'confirmed', movement_date: iso(-5), taken: 13, given: 13, location_id: 800, locations: KAUF, order_stop_id: 510, confirmed_at: iso(-5) + 'T10:00:00Z' }),
    C(11, { id: 11, order_id: 1244, status: 'confirmed', movement_date: iso(-40), taken: 24, given: 0, sheet_source: 'MANUAL', confirmed_at: '2026-09-11T08:17:00Z', confirmed_by: 'demo_accountant' }),
    C(10, { id: 12, status: 'reversed', movement_date: iso(-12), taken: 3 }),
    C(10, { id: 13, order_id: 1248, status: 'confirmed', movement_date: iso(-3), taken: 22, given: 5, location_id: 607, locations: OBST, order_stop_id: 513 })
  ];
}
const balOf = (k, id) => MOVES.filter(m => m[k] === id && m.status === 'confirmed').reduce((s, m) => s + m.given - m.taken, 0);
const pendOf = (k, id) => MOVES.filter(m => m[k] === id && m.status === 'pending').length;
const balances = type => type === 'clients'
  ? Object.keys(NAMES).map(Number).map(c => ({ client_id: c, client_name: NAMES[c], balance: balOf('client_id', c), pending_count: pendOf('client_id', c) }))
  : [{ partner_id: 20, partner_name: 'Trans Nord ΕΠΕ', balance: balOf('partner_id', 20), pending_count: pendOf('partner_id', 20) }];

async function newPage(browser, role, opts = {}) {
  const page = await P.newPage(browser, role);
  page._bad = [];
  page.on('response', r => { if (r.status() >= 400 && !/\/history$|week-checks/.test(r.url()) && !opts.expectFail) page._bad.push(r.status() + ' ' + r.url()); });
  const writes = [];
  page._writes = writes;
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  page.route('**/pallets/**', async route => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname.replace(/^.*\/pallets\//, ''), m = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    if (m !== 'GET') writes.push({ m, p, body });
    if (p === 'gate') return json(route, { records: P.ORDERS.map(o => ({ order_rec: o.id, order_id: o.fields['Order No'], sheets_ok: true })) });
    if (p === 'lookups/search') {
      const t = u.searchParams.get('type');
      return json(route, { records: t === 'locations' ? [{ id: 607, name: 'Obst Hof GmbH', kind: 'L' }] : [{ id: 10, name: 'Berger Obst KG', kind: 'C' }] });
    }
    if (p === 'lookups') return json(route, { clients: [], partners: [], locations: [] });
    if (p === 'balances/clients/10') return json(route, { records: [{ location_name: 'Kaufland', balance: 10 }, { location_name: 'Obst Hof GmbH', balance: -17 }] });
    if (p.startsWith('balances')) return json(route, { records: balances(u.searchParams.get('type')) });
    if (p.startsWith('week-checks')) return json(route, { error: 'Not found' }, 404);
    const hm = p.match(/^movements\/(\d+)\/history$/);
    if (hm) {
      if (opts.history === 'fail') return json(route, { error: 'boom' }, 500);
      if (!opts.history) return json(route, { error: 'Not found' }, 404);
      return json(route, { records: opts.history });
    }
    if (p === 'movements' && m === 'GET') {
      const c = u.searchParams.get('client_id'), pa = u.searchParams.get('partner_id');
      const rows = MOVES.filter(x => (!c || x.client_id === +c) && (!pa || x.partner_id === +pa));
      return json(route, { records: rows.slice().sort((a, b) => (a.movement_date < b.movement_date ? 1 : a.movement_date > b.movement_date ? -1 : b.id - a.id)), truncated: false, cap: 9990 });
    }
    if (p === 'movements' && m === 'POST') {
      const rec = Object.assign({ id: nextId++, code: 'PM-' + nextId, status: body.confirm ? 'confirmed' : 'pending' }, body);
      MOVES.push(rec); return json(route, { record: rec });
    }
    const mm = p.match(/^movements\/(\d+)(?:\/(confirm|reverse))?$/);
    if (mm) {
      const mv = MOVES.find(x => x.id === +mm[1]);
      if (!mv) return json(route, { error: 'Not found' }, 404);
      if (!mm[2] && m === 'PATCH') { Object.assign(mv, body); return json(route, { record: mv }); }
      if (!mm[2] && m === 'DELETE') { MOVES.splice(MOVES.indexOf(mv), 1); return json(route, { deleted: true }); }
      if (mm[2] === 'confirm') {
        if (opts.failConfirm) return json(route, { error: 'Η επιβεβαίωση απορρίφθηκε (δοκιμή)' }, 400);
        if (opts.goneConfirm) return json(route, { error: 'Only pending movements can be confirmed' }, 409);
        mv.status = 'confirmed'; return json(route, { record: mv });
      }
      if (mm[2] === 'reverse') {
        mv.status = 'reversed';
        const r = body.replacement ? Object.assign({ id: nextId++, status: 'pending' }, body.replacement) : null;
        if (r) MOVES.push(r);
        return json(route, { reversed: mv, replacement: r });
      }
    }
    return json(route, { records: [] });
  });
  return page;
}
async function open(page) {
  await gotoPage(page, 'pallet_ledger', BASE_URL);
  try { await page.waitForSelector('.plv-nav', { timeout: 30000 }); await page.waitForSelector('#plvBody .plv-r', { timeout: 30000 }); }
  catch (e) { console.log('    page: ' + (await page.locator('#content').innerText()).slice(0, 400) + ' | errors: ' + page._errors.join(' | ')); throw e; }
}
const body = page => page.locator('#plvBody').innerText();
const row = (page, id) => page.locator(`#plvBody tr[data-id="${id}"]`);
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });

async function runAction(browser) {
  console.log('\n— accountant: Προς ενέργεια (N01) + confirm (N12)');
  seed();
  const page = await newPage(browser, 'accountant');
  await open(page);
  await shot(page, 'n01');
  const need = await page.locator('.plv-need').innerText();
  ok(/Εκκρεμείς\s*7/.test(need), '«Θέλουν δράση»: 7 due pending (the scheduled one does not count) — ' + need.replace(/\s+/g, ' '));
  ok(/Χωρίς πλήρη επιστροφή\s*1/.test(need), '«Χωρίς πλήρη επιστροφή 1» (PM-9: given 10 > taken 0)');
  const bals = Object.keys(NAMES).map(c => balOf('client_id', +c));
  const owed = bals.filter(b => b > 0).reduce((s, b) => s + b, 0), owe = -bals.filter(b => b < 0).reduce((s, b) => s + b, 0);
  ok(need.includes(`μας οφείλουν ${owed}`) && need.includes(`οφείλουμε ${owe}`), `right side: owed ${owed} · owe ${owe} (from the balance view)`);
  const b = await body(page);
  const heads = await page.locator('#plvBody .plv-gn').allInnerTexts();
  ok(heads.slice(0, 3).join('|').toUpperCase() === 'NORDFRISCH GMBH|BERGER OBST KG|ΣΥΝΕΡΓΑΤΕΣ', 'groups: latest client first, partners after the first two — ' + heads.join(' | '));
  ok(/3 ακόμη πελάτες · 3 εκκρεμείς/.test(b), '«3 ακόμη πελάτες · 3 εκκρεμείς» behind «Εμφάνιση όλων»');
  ok(await row(page, 1).evaluate(e => e.classList.contains('plv-late')), 'PM-1 (20 days) carries the red bar');
  ok(!(await row(page, 2).evaluate(e => e.classList.contains('plv-late'))), 'PM-2 (7 days) does not');
  ok(/11 παλ\.\s*11 με ανταλλαγή/.test(await row(page, 1).innerText()), 'stop pallets: «11 παλ. · 11 με ανταλλαγή» (embed)');
  ok(/Stubenberg, AT/.test(await row(page, 1).innerText()), 'place under the point: «Stubenberg, AT»');
  ok(/20 ημέρες/.test(await row(page, 1).innerText()), 'Αναμονή: «20 ημέρες»');
  ok(/Προγραμματισμένες · 1 φόρτωση μετά από σήμερα/.test(b), 'scheduled line: 1 loading after today');
  ok(b.includes('υπόλοιπο ' + sgn(balOf('client_id', 10))), 'Berger group head: «υπόλοιπο ' + sgn(balOf('client_id', 10)) + '»');
  await page.locator('.plv-more', { hasText: 'ακόμη' }).click();
  ok((await page.locator('#plvBody .plv-gn').count()) === 6, '«Εμφάνιση όλων»: 6 groups');
  await page.fill('#plvQ', '#1241');
  await page.waitForTimeout(150);
  ok((await page.locator('#plvBody tr.plv-r').count()) === 1 && (await row(page, 1).count()) === 1, '«#1241» → PM-1 only');
  await page.fill('#plvQ', 'zzzz');
  await page.waitForTimeout(150);
  ok(/Καμία κίνηση για «zzzz»/.test(await body(page)), 'empty search: «Καμία κίνηση για «zzzz»» (N16 Α)');
  await page.locator('#plvBody .plv-a', { hasText: 'Καθαρισμός' }).click();
  page._writes.length = 0;
  await row(page, 2).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.plv-modal', { timeout: 5000 });
  const mt = await page.locator('.plv-modal').innerText();
  ok(/Επιβεβαίωση φόρτωσης/.test(mt) && /\d+ από 7/.test(mt), 'Enter → «Επιβεβαίωση φόρτωσης», counter «N από 7»');
  ok(/Παλέτες στάσης\s*30/.test(mt), 'info: «Παλέτες στάσης 30»');
  await page.fill('#plvGiven', '5');
  const bal10 = balOf('client_id', 10);
  const after = await page.locator('#plvAfter').innerText();
  ok(after.includes(`${sgn(bal10)} → ${sgn(bal10 + 5 - 29)}`), `«Μετά την επιβεβαίωση: ${sgn(bal10)} → ${sgn(bal10 - 24)}» — ${after.replace(/\s+/g, ' ')}`);
  await shot(page, 'n12');
  await page.locator('#plvConfirmGo').click();
  await page.waitForTimeout(800);
  const pw = page._writes.find(w => w.m === 'PATCH' && w.p === 'movements/2'), cw = page._writes.find(w => w.p === 'movements/2/confirm');
  ok(pw && pw.body.taken === 29 && pw.body.given === 5 && pw.body.sheet_source === 'MANUAL', 'PATCH movements/2 {taken:29, given:5, sheet_source:MANUAL} — ' + JSON.stringify(pw && pw.body));
  ok(!!cw && MOVES.find(m => m.id === 2).status === 'confirmed', 'POST movements/2/confirm → table (mock): confirmed');
  ok(await page.locator('.plv-modal').count() === 1 && /από/.test(await page.locator('.plv-mcnt').innerText().catch(() => '')), 'the wizard moved on to the next pending');
  await page.keyboard.press('Escape');
  const errs = page._errors.filter(e => !/status of 404/.test(e));
  ok(errs.length === 0 && page._bad.length === 0, 'no console / page errors' + (errs.length || page._bad.length ? ': ' + [...errs, ...page._bad].join(' | ') : ''));
  await page.close();
}

async function runConfirmFail(browser) {
  console.log('\n— a failed confirm and a movement that is no longer pending stay in the modal (N16 Ζ)');
  for (const [opt, re, label] of [['failConfirm', /γράφτηκαν \(πήραμε 29 · δώσαμε 0\), η επιβεβαίωση όχι/, 'values written, confirm not'], ['goneConfirm', /δεν είναι πια εκκρεμής/, 'no longer pending']]) {
    seed();
    const page = await newPage(browser, 'accountant', { [opt]: true, expectFail: true });
    await open(page);
    await row(page, 2).hover();   // the row's button shows on hover / focus (N01)
    await page.locator('#plvBody tr[data-id="2"] .plv-go').click();
    await page.waitForSelector('.plv-modal');
    await page.locator('#plvConfirmGo').click();
    await page.waitForSelector('.plv-err', { timeout: 5000 });
    const t = await page.locator('.plv-err').innerText();
    ok(re.test(t), label + ': ' + t.replace(/\s+/g, ' '));
    ok(MOVES.find(m => m.id === 2).status === 'pending', 'table (mock): still pending');
    await page.close();
  }
}

async function runViews(browser) {
  console.log('\n— Χωρίς πλήρη επιστροφή (N03), Κινήσεις (N04/N05), Υπόλοιπα (N07), καρτέλα (N09)');
  seed();
  const page = await newPage(browser, 'accountant');
  await open(page);
  await page.evaluate(() => plvAct('noreturn'));
  await page.waitForTimeout(200);
  ok((await row(page, 9).count()) === 1 && /\+10/.test(await row(page, 9).innerText()), 'N03: PM-9 «Δεν γύρισαν +10»');
  ok(/Γενικό σύνολο/.test(await body(page)), 'N03: «Γενικό σύνολο»');
  await shot(page, 'n03');
  await page.evaluate(() => plvTab('moves'));
  await page.waitForTimeout(200);
  const live = MOVES.filter(m => m.status !== 'reversed').length;
  ok((await page.locator('.plv-sub').innerText()) === `${live} από ${live} κινήσεις`, `subtitle «${live} από ${live} κινήσεις» (reversed out)`);
  ok((await row(page, 12).count()) === 0, 'a reversed movement is not listed');
  ok(/υπόλοιπο πελάτη/.test(await body(page)), 'N04: group head «υπόλοιπο πελάτη»');
  await shot(page, 'n04');
  await page.evaluate(() => plvGroupBy('location'));
  await page.waitForTimeout(150);
  const lh = await page.locator('#plvBody .plv-gn').allInnerTexts();
  ok(lh.some(h => /OBST HOF GMBH · STUBENBERG, AT/i.test(h)), 'N05: by point «OBST HOF GMBH · STUBENBERG, AT» — ' + lh.join(' | '));
  await page.fill('#plvQ', 'Kaufland Berger');
  await page.waitForTimeout(150);
  ok((await page.locator('#plvBody tr.plv-r').count()) === 2, '«Kaufland Berger» (AND) → the 2 Kaufland deliveries of Berger');
  await page.fill('#plvQ', '');
  await page.waitForTimeout(100);
  const mo = iso(0).slice(0, 7);
  await page.selectOption('.plv-per select', mo);
  await page.waitForTimeout(150);
  const inMonth = MOVES.filter(m => m.status !== 'reversed' && m.movement_date.startsWith(mo)).length;
  ok((await page.locator('#plvBody tr.plv-r').count()) === inMonth, `period «${mo}»: ${inMonth} movements`);
  await page.evaluate(() => plvTab('bal'));
  await page.waitForTimeout(200);
  const bt = await body(page);
  ok(/Καθαρό/.test(bt) && /Μας οφείλουν/.test(bt) && /Εκκρεμείς εκτός υπολοίπου/.test(bt), 'N07: summary (Καθαρό / Μας οφείλουν / Οφείλουμε / Εκκρεμείς εκτός υπολοίπου)');
  ok(/με μηδενικό υπόλοιπο/.test(bt), 'N07: «… με μηδενικό υπόλοιπο» row');
  await shot(page, 'n07');
  await page.locator('#plvBody tr.plv-r', { hasText: 'Berger Obst KG' }).click();
  await page.waitForSelector('.plv-ch h2', { timeout: 5000 });
  const ct = await page.locator('.plv-in').innerText();
  const b10 = balOf('client_id', 10);
  ok(/Berger Obst KG/.test(await page.locator('.plv-ch h2').innerText()), 'N09: card «Berger Obst KG»');
  ok(ct.includes(b10 < 0 ? 'Οφείλουμε' : 'Μας οφείλει') && ct.includes(String(Math.abs(b10))), `N09: header balance ${b10}`);
  const runs = await page.locator('.plv-box tr.plv-r td:nth-last-child(3)').allInnerTexts();
  ok(runs.filter(x => x !== '—').pop() === sgn(b10), 'N09: the last running balance = the view balance (' + runs.join(',') + ')');
  ok(await page.locator('button', { hasText: 'Εκτύπωση' }).count() === 1, 'N09: «Εκτύπωση» button');
  ok(/Υπόλοιπο ανά σημείο · 2 σημεία/.test(ct), 'the balance per point is kept, folded');
  await shot(page, 'n09');
  await page.locator('.plv-back').click();
  await page.waitForSelector('#plvBody');
  ok(await page.locator('.plv-nav button.on').innerText() === 'Υπόλοιπα', 'back → Υπόλοιπα');
  await page.close();
}

async function runPanel(browser) {
  console.log('\n— panel (N11h / N14b / N18) and the delivery correction (N14a)');
  seed();
  let page = await newPage(browser, 'accountant');
  await open(page);
  await page.evaluate(() => plvTab('moves'));
  await row(page, 11).click();
  await page.waitForSelector('.plv-panel');
  await page.waitForFunction(() => !/Φόρτωση ιστορικού/.test(document.getElementById('plvHist').innerText));
  const h = await page.locator('#plvHist').innerText();
  ok(/Από τα στοιχεία της κίνησης/.test(h) && /Επιβεβαίωση/.test(h) && /D\. Accountant/.test(h), '/history 404 → who/when from the movement (N18 Δ): ' + h.replace(/\s+/g, ' ').slice(0, 140));
  page._writes.length = 0;
  await page.locator('.plv-pfoot .plv-a', { hasText: 'Αντιλογισμός' }).click();
  await page.waitForTimeout(200);
  ok(page._writes.length === 0, 'reverse without a reason writes nothing');
  await page.fill('#plvRevReason', 'λάθος πελάτης');
  await page.locator('.plv-pfoot .plv-a', { hasText: 'Αντιλογισμός' }).click();
  await page.waitForTimeout(600);
  const rv = page._writes.find(w => w.p === 'movements/11/reverse');
  ok(rv && rv.body.reason === 'λάθος πελάτης' && !rv.body.replacement && MOVES.find(m => m.id === 11).status === 'reversed', 'POST movements/11/reverse {reason} → table (mock): reversed');
  await page.evaluate(() => plvTab('moves'));
  await row(page, 10).click();
  await page.waitForSelector('.plv-panel');
  await page.locator('.plv-pfoot button', { hasText: 'Διόρθωση ανταλλαγής' }).click();
  await page.waitForSelector('#plvRealTaken');
  await page.fill('#plvRealTaken', '6');
  await page.fill('#plvFixNote', 'δεν είχαν άδειες');
  ok(/Μετά τη διόρθωση/.test(await page.locator('.plv-modal').innerText()), 'N14a: «Μετά τη διόρθωση» shows');
  await shot(page, 'n14a');
  page._writes.length = 0;
  await page.locator('.plv-modal button', { hasText: 'Καταχώρηση διόρθωσης' }).click();
  await page.waitForTimeout(800);
  const fx = page._writes.find(w => w.p === 'movements/10/reverse');
  const r = fx && fx.body.replacement;
  ok(r && r.event_type === 'DELIVERY' && r.taken === 6 && r.given === 13 && r.client_id === 10 && /δεν είχαν άδειες/.test(fx.body.reason), 'reverse {replacement: DELIVERY taken 6 given 13} — ' + JSON.stringify(r));
  ok(page._writes.some(w => /^movements\/\d+\/confirm$/.test(w.p)), 'the replacement is confirmed');
  await page.close();
  seed();
  page = await newPage(browser, 'accountant', { history: [
    { action: 'create', changed_by: 'demo_dispatcher', changed_at: '2026-10-16T09:05:00Z', before: null, after: { taken: 28, given: 0, status: 'pending' } },
    { action: 'update', changed_by: 'demo_dispatcher', changed_at: '2026-10-20T14:40:00Z', before: { taken: 28, given: 0 }, after: { taken: 30, given: 0 } },
    { action: 'update', changed_by: 'demo_accountant', changed_at: '2026-10-24T07:12:00Z', before: { taken: 30, given: 0 }, after: { taken: 22, given: 5 } }] });
  await open(page);
  await row(page, 2).click();
  await page.waitForSelector('.plv-panel');
  await page.waitForFunction(() => !/Φόρτωση ιστορικού/.test(document.getElementById('plvHist').innerText));
  const h2 = await page.locator('#plvHist').innerText();
  ok(/Πήραμε 30 → 22 · Δώσαμε 0 → 5/.test(h2) && /από την παραγγελία #1246/.test(h2) && /Οι τρέχουσες τιμές \(Πήραμε 29 · Δώσαμε 0\)/.test(h2),
    'N11h lines + «από την παραγγελία #1246» + N18 ΣΤ (current values without a line): ' + h2.replace(/\s+/g, ' ').slice(0, 160));
  ok(/Μετά την επιβεβαίωση/.test(await page.locator('.plv-panel').innerText()), 'pending panel: «Μετά την επιβεβαίωση»');
  await shot(page, 'n11h');
  await page.close();
  seed();
  page = await newPage(browser, 'accountant', { history: 'fail', expectFail: true });
  await open(page);
  await row(page, 2).click();
  await page.waitForSelector('.plv-hfail', { timeout: 5000 });
  ok(/Το ιστορικό δεν φορτώθηκε/.test(await page.locator('.plv-hfail').innerText()), 'N18 Γ: «Το ιστορικό δεν φορτώθηκε» + retry');
  await page.close();
}

async function runNew(browser) {
  console.log('\n— Νέα κίνηση (N15)');
  seed();
  const page = await newPage(browser, 'accountant');
  await open(page);
  await page.locator('.plv-hact button', { hasText: 'Νέα κίνηση' }).click();
  await page.waitForSelector('#plvNmTypes');
  ok(await page.locator('#plvNmTypes button').count() === 4 && /μόνο ο ιδιοκτήτης/.test(await page.locator('.plv-modal').innerText()), '4 types + the owner-only lock line (accountant)');
  await page.fill('#plvAcQ_plvNmParty', 'Berger');
  await page.waitForSelector('#plvAcList_plvNmParty div');
  await page.locator('#plvAcList_plvNmParty div').first().dispatchEvent('mousedown');
  await page.fill('#plvAcQ_plvNmLoc', 'Obst');
  await page.waitForSelector('#plvAcList_plvNmLoc div');
  await page.locator('#plvAcList_plvNmLoc div').first().dispatchEvent('mousedown');
  await page.fill('#plvNmGiven', '5');
  const dup = await page.locator('#plvNmDup').innerText();
  ok(/υπάρχει ήδη «δώσαμε 5»/.test(dup), 'double-entry warning: ' + dup.replace(/\s+/g, ' '));
  ok(/Μετά την επιβεβαίωση/.test(await page.locator('#plvNmAfter').innerText()), 'footer: «Μετά την επιβεβαίωση»');
  await shot(page, 'n15');
  page._writes.length = 0;
  await page.locator('.plv-modal button', { hasText: 'Καταχώρηση' }).click();
  await page.waitForTimeout(700);
  const w = page._writes.find(x => x.m === 'POST' && x.p === 'movements');
  ok(w && w.body.event_type === 'RETURN_OUT' && w.body.client_id === 10 && w.body.location_id === 607 && w.body.given === 5 && w.body.taken === 0 && w.body.confirm === false && w.body.sheet_source === 'MANUAL',
    'POST movements {RETURN_OUT, client 10, location 607, given 5, confirm:false} — ' + JSON.stringify(w && w.body));
  await page.close();
}

async function runRoles(browser) {
  console.log('\n— management reads only (N16 Ε); the week tab still draws');
  seed();
  const page = await newPage(browser, 'management');
  await open(page);
  ok(await page.locator('.plv-hact button', { hasText: 'Νέα κίνηση' }).count() === 0, 'no «Νέα κίνηση»');
  ok(await page.locator('.plv-go').count() === 0, 'no «Επιβεβαίωση» on the rows');
  ok(/Μόνο ανάγνωση για τον ρόλο σου/.test(await page.locator('.plv-ro').innerText()), 'the read-only line');
  await row(page, 2).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.plv-panel');
  ok(await page.locator('.plv-pfoot').count() === 0, 'Enter opens the panel, with no action');
  await page.keyboard.press('Escape');
  await page.evaluate(() => plvTab('week'));
  await page.waitForTimeout(500);
  ok(await page.locator('#plwRoot').count() === 1 && (await page.locator('.plv-nav button.on').innerText()) === 'Εβδομάδα', '«Εβδομάδα» draws into #plwRoot under the new bar');
  await page.close();
}

(async () => {
  console.log('Στόχος: ' + BASE_URL);
  const browser = await chromium.launch();
  try { await runAction(browser); await runConfirmFail(browser); await runViews(browser); await runPanel(browser); await runNew(browser); await runRoles(browser); }
  catch (e) { failed++; console.log('  ✗ ΚΑΤΑΡΡΕΥΣΗ: ' + (e && e.stack || e)); }
  finally { await browser.close(); }
  console.log(`\n${passed}/${passed + failed} assertions · screenshots → ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})();
