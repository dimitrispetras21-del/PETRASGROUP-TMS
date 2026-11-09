// Rig — «Παλέτες › Εβδομάδα» (owner 2–3/11/2026, Αλεξία). Invented data only (the repo is public): the week and
// orders of tests/critics/orders-week-proof.js, a few of them with pallet exchange, plus a mocked /pallets/* that
// keeps its movements in memory and records every write. Judged on the DOM and on the requests that left:
//   view    — the tab draws the week: rows of the Weekly, ✓ on a finished exchange, «−N» on a short return,
//             red «—» on a missing record, the summary counts, the statement and the drivers tables;
//   confirm — the cell editor sends the page's own writes: PATCH {taken, given, sheet_source} then POST /confirm,
//             and the week repaints from the re-read movements;
//   missing — «Καταχώρηση» writes ONLY that end's stops with no movement, dated by the stop (POST body);
//   fix     — the delivery correction: POST /reverse {replacement: DELIVERY, taken, given, notes = the reason};
//   failure — a failed /confirm is said in the row with the step that did not happen;
//   mark    — «Ελέγχθηκε» is not drawn while /pallets/week-checks answers 404; with it, the mark POSTs the week;
//   docs    — a click on ΑΝΑΘΕΣΗ shows the Weekly's own print.html.
//   route   — the order panel draws the shared route diagram (owner 8/11 #5) from that order's own stops.
//             From 1600px wide it is a 400px column beside the panel (core/route-diagram-column.js); PW_COL_DIR =
//             where pallets-col.png goes.
// Run from the MAIN repo root (node_modules), against a server of the tree under test:
//   cd /Users/dimitrispetras/PETRASGROUP-TMS && PW_BASE_URL=http://127.0.0.1:8792/ node <tree>/tests/critics/pallets-week-rig.js
const P = require('./orders-week-proof.js');
const path = require('path');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));
const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8792/';
const SHOTS = process.env.PW_SHOT_DIR || path.join(require('os').tmpdir(), 'pallets-week-rig');
require('fs').mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ ' + msg); } };

// Exchange on a few orders of the mocked week, each with one loading and one delivery stop.
const PE = { 1241: 22, 1246: 18, 1243: 16, 1244: 14, 1248: 20 };
const STOPS = [];
for (const o of P.ORDERS) {
  const no = o.fields['Order No'];
  if (!PE[no]) continue;
  o.fields['Pallet Exchange'] = true;
  o.fields['ORDER STOPS'] = ['recS' + no + 'L', 'recS' + no + 'D'];
  STOPS.push({ id: 'recS' + no + 'L', fields: { 'Parent Order': [o.id], 'Stop Type': 'Loading', Pallets: PE[no], Location: o.fields['Loading Location 1'], DateTime: o.fields['Loading DateTime'] } });
  STOPS.push({ id: 'recS' + no + 'D', fields: { 'Parent Order': [o.id], 'Stop Type': 'Unloading', Pallets: PE[no], Location: o.fields['Unloading Location 1'], DateTime: o.fields['Delivery DateTime'] } });
}
const cid = { 1241: 10, 1246: 11, 1243: 12, 1244: 13, 1248: 14 };
let MOVES, nextId;
function seed() {
  nextId = 900;
  const mv = (id, no, ev, status, taken, given) => ({ id, order_id: no, event_type: ev, status, taken, given, counterparty_type: 'CLIENT', client_id: cid[no],
    movement_date: P.day(0).slice(0, 10), _stop: 'recS' + no + (ev === 'LOADING' ? 'L' : 'D'), location_id: null, order_stop_id: 5000 + id });
  MOVES = [
    mv(1, 1241, 'LOADING', 'confirmed', 22, 0), mv(2, 1241, 'DELIVERY', 'confirmed', 22, 22),   // ✓
    mv(3, 1246, 'LOADING', 'pending', 18, 0),                                                    // pending; delivery missing
    mv(4, 1243, 'LOADING', 'confirmed', 16, 0), mv(5, 1243, 'DELIVERY', 'confirmed', 6, 16),    // −10
    mv(6, 1248, 'LOADING', 'confirmed', 20, 0), mv(7, 1248, 'DELIVERY', 'confirmed', 20, 20),
    // 1244: nothing at all — both ends missing
  ];
}
const balances = () => Object.values(cid).map(c => ({ client_id: c, client_name: 'Πελάτης ' + c, pending_count: MOVES.filter(m => m.client_id === c && m.status === 'pending').length,
  balance: MOVES.filter(m => m.client_id === c && m.status === 'confirmed').reduce((s, m) => s + m.given - m.taken, 0) }));

async function newPage(browser, role, opts = {}) {
  const page = await P.newPage(browser, role);
  // Until 104 is live /pallets/week-checks answers 404 by design (the mark hides): every OTHER failed response is an error.
  page._bad = [];
  page.on('response', r => { if (r.status() >= 400 && !/\/pallets\/week-checks/.test(r.url())) page._bad.push(r.status() + ' ' + r.url()); });
  const writes = [];
  page._writes = writes;
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const clean = m => { const c = Object.assign({}, m); delete c._stop; return c; };
  page.route(`**/${P.T.ORDERS}/rec*`, route => {   // atGetOne (plRecordStops → _plLoadOrder)
    const id = (decodeURIComponent(route.request().url()).match(/\/(recO\d+)/) || [])[1];
    const o = P.ORDERS.find(x => x.id === id);
    return json(route, o || {}, o ? 200 : 404);
  });
  page.route('**/tblaeY5QOHAS1gyE8**', route => {
    const ids = [...decodeURIComponent(route.request().url()).matchAll(/RECORD_ID\(\)="(rec[A-Za-z0-9]+)"/g)].map(m => m[1]);
    return json(route, { records: STOPS.filter(s => ids.includes(s.id)) });
  });
  page.route('**/pallets/**', async route => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname.replace(/^.*\/pallets\//, ''), m = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    if (m !== 'GET') writes.push({ m, p, body });
    if (p === 'gate') return json(route, { records: P.ORDERS.map(o => ({ order_rec: o.id, order_id: o.fields['Order No'], sheets_ok: true })) });
    if (p === 'lookups') return json(route, { clients: [], partners: [], locations: [] });
    if (p.startsWith('balances')) return json(route, { records: u.searchParams.get('type') === 'clients' ? balances() : [] });
    if (p.startsWith('week-checks')) {
      if (!opts.checks) return json(route, { error: 'Not found' }, 404);
      if (m === 'POST') { const rec = { id: 1, week_start: body.week_start, checked_by: 'demo_accountant', checked_at: new Date().toISOString(), undone_at: null }; opts.checks.push(rec); return json(route, { record: rec }); }
      if (/changes/.test(p)) return json(route, { changed: [], moved: [], untracked: [], note_only: 0, audit_failed: 0, checked_at: new Date().toISOString() });
      return json(route, { records: opts.checks });
    }
    if (p === 'movements' && m === 'GET') {
      const st = u.searchParams.get('order_stop_rec');
      return json(route, { records: (st ? MOVES.filter(x => x._stop === st) : MOVES).map(clean), truncated: false, cap: 9990 });
    }
    if (p === 'movements' && m === 'POST') {
      const no = Number(String(body.order_rec).replace('recO', ''));
      const rec = { id: nextId++, order_id: no, event_type: body.event_type, status: body.confirm ? 'confirmed' : 'pending', taken: body.taken, given: body.given,
        counterparty_type: 'CLIENT', client_id: cid[no], movement_date: body.movement_date, _stop: body.order_stop_rec, location_id: null };
      MOVES.push(rec); return json(route, { record: clean(rec) });
    }
    const mm = p.match(/^movements\/(\d+)(?:\/(confirm|reverse))?$/);
    if (mm) {
      const mv = MOVES.find(x => x.id === +mm[1]);
      if (!mv) return json(route, { error: 'gone' }, 404);
      if (!mm[2] && m === 'PATCH') { Object.assign(mv, { taken: body.taken, given: body.given }); return json(route, { record: clean(mv) }); }
      if (mm[2] === 'confirm') {
        if (opts.failConfirm) return json(route, { error: 'Η επιβεβαίωση απορρίφθηκε (δοκιμή)' }, 409);
        mv.status = 'confirmed'; return json(route, { record: clean(mv) });
      }
      if (mm[2] === 'reverse') {
        mv.status = 'reversed';
        const r = Object.assign({ id: nextId++, status: 'pending', _stop: mv._stop }, body.replacement);
        MOVES.push(r); return json(route, { reversed: clean(mv), replacement: clean(r) });
      }
    }
    return json(route, { records: [] });
  });
  return page;
}
async function openTab(page) {
  await gotoPage(page, 'pallet_ledger', BASE_URL);
  await page.waitForSelector('.plv-nav', { timeout: 30000 });   // the page's bar (Υ3 redesign; .plv-tab before)
  await page.evaluate(() => plvTab('week'));
  // the view opens on this week; the mocked orders are in the last complete one (orders-week-proof's W0)
  try { await page.waitForSelector('.plw-strip', { timeout: 30000 }); }
  catch (e) { console.log('    page: ' + (await page.locator('#content').innerText()).slice(0, 400) + ' | errors: ' + page._errors.join(' | ')); throw e; }
  await page.locator(`[data-plwweek="${P.WEEK_FROM}"]`).first().click();
  await page.waitForSelector('.plw .plw-row', { timeout: 30000 });
}
// the leg element of an order number (its client line carries «#1246»)
const leg = (page, no) => page.locator('.plw-leg', { hasText: '#' + no }).first();

async function runMain(browser) {
  console.log('\n— accountant, the view + the three writes');
  seed();
  const page = await newPage(browser, 'accountant');
  await openTab(page);
  const sum = await page.locator('.plw-sum').innerText();
  ok(/5 παραγγελίες με ανταλλαγή/.test(sum), 'summary: 5 orders with exchange (' + sum.replace(/\s+/g, ' ').slice(0, 90) + '…)');
  ok(/1 εκκρεμής/.test(sum), 'summary: 1 pending');
  ok(/3 λείπει καταγραφή/.test(sum), 'summary: 3 missing records (1246 delivery, 1244 both ends)');
  ok(/1 χωρίς πλήρη επιστροφή/.test(sum), 'summary: 1 short return (1243)');
  ok(await leg(page, 1241).locator('.plw-ok').count() === 1, '1241: ✓ on a finished exchange');
  ok((await leg(page, 1243).innerText()).includes('−10'), '1243: «−10» under the delivery Π');
  ok(await leg(page, 1244).locator('.plw-miss').count() === 4, '1244: four red «—» (both ends missing)');
  ok(await page.locator('.plw-check').count() === 0, '«Ελέγχθηκε» not drawn while /pallets/week-checks answers 404');
  ok(await page.locator('.plw-tbl').first().isVisible(), 'statement table drawn');
  ok(/Δεν γύρισαν ανά οδηγό/.test(await page.locator('.plw').innerText()), 'drivers table drawn');
  ok(await page.locator('.ow4-day').count() >= 7, 'day bands (.ow4-day) for the seven days');
  ok(await page.locator('.plw-row.trip-row').count() > 0 && await page.locator('.plw-leg.trip-part').count() > 0, 'shared trip divider classes on rows / legs');
  await page.screenshot({ path: path.join(SHOTS, 'week.png'), fullPage: true });

  // route: the panel of 1241 reads its two stops and draws them as the vertical route
  await page.evaluate(() => { const el = [...document.querySelectorAll('.plw-leg')].find(e => /#1241/.test(e.textContent)); if (el) el.click(); });
  await page.waitForSelector('.plw-panel .rd', { timeout: 10000 }).catch(() => {});
  const rd = await page.locator('.plw-panel .rd').count() ? await page.locator('.plw-panel .rd').innerText() : '';
  ok(/ΔΙΑΔΡΟΜΗ/.test(await page.locator('.plw-panel').innerText().catch(() => '')), 'route: the panel has the ΔΙΑΔΡΟΜΗ section');
  ok(/Φόρτωση/.test(rd) && /Παράδοση/.test(rd), 'route: the diagram draws the loading and the delivery stop');
  await page.locator('.plw-panel').screenshot({ path: path.join(SHOTS, 'panel-route.png') }).catch(() => {});
  ok(await page.locator('.rdc').count() === 0, 'route: below 1600px wide no column, the diagram stays in the panel');
  await page.keyboard.press('Escape');

  // route column (owner 8/11 «Ναι, φτιάξτο»): from 1600px the panel's ΔΙΑΔΡΟΜΗ is a 400px column at the right edge
  // and the panel sits next to it; the column's × puts it back in the panel; Esc closes both
  const geo = () => page.evaluate(() => {
    const p = document.querySelector('.plw-panel'), col = document.querySelector('.rdc');
    const r = el => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
    return { panel: p ? r(p) : null, col: col ? r(col) : null, head: col ? col.querySelector('.rdc-h').textContent.replace(/\s+/g, ' ').trim() : '',
      colRd: col ? col.querySelector('.rd') ? col.querySelector('.rd').innerText : '' : '', panelRoute: p ? /ΔΙΑΔΡΟΜΗ/.test(p.innerText) : false, panelRd: p ? p.querySelectorAll('.rd').length : 0 };
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => { const el = [...document.querySelectorAll('.plw-leg')].find(e => /#1241/.test(e.textContent)); if (el) el.click(); });
  await page.waitForSelector('.rdc .rd', { timeout: 10000 }).catch(() => {});
  let g = await geo();
  ok(!!g.col && g.col.r === 1920 && g.col.w === 400 && g.col.h === 1080, 'column: 400px, full height, at the right edge ' + JSON.stringify(g.col));
  ok(!!g.panel && g.panel.r === 1520, 'column: the panel sits right next to it ' + JSON.stringify(g.panel));
  ok(/Φόρτωση/.test(g.colRd) && /Παράδοση/.test(g.colRd), 'column: draws the order\'s loading and delivery');
  ok(!g.panelRoute && g.panelRd === 0, 'column: no ΔΙΑΔΡΟΜΗ left in the panel (no duplicate)');
  ok(/^Διαδρομή/.test(g.head) && !/RT-/.test(g.head), 'column head: «' + g.head.replace('×', '').trim() + '»');
  const colShot = process.env.PW_COL_DIR;
  if (colShot) { require('fs').mkdirSync(colShot, { recursive: true }); await page.screenshot({ path: path.join(colShot, 'pallets-col.png') }); }
  await page.locator('.rdc .rdc-x').click();
  await page.waitForTimeout(200);
  g = await geo();
  ok(!g.col && !!g.panel && g.panel.r === 1920 && g.panelRoute && g.panelRd === 1, 'column ×: only the column closes, ΔΙΑΔΡΟΜΗ back in the panel at the edge');
  await page.evaluate(() => { const el = [...document.querySelectorAll('.plw-leg')].find(e => /#1243/.test(e.textContent)); if (el) el.click(); });
  await page.waitForSelector('.rdc .rd', { timeout: 10000 }).catch(() => {});
  ok(!!(await geo()).col, 'column: another order\'s panel opens with its column');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForTimeout(300);
  g = await geo();
  ok(!g.col && g.panelRoute && g.panel.r === 1440, 'column: resized to 1440, the diagram is back in the panel');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  g = await geo();
  ok(!g.panel && !g.col, 'column: Esc closes the panel and the column');
  await page.setViewportSize({ width: 1440, height: 960 });

  // confirm: 1246's pending loading
  page._writes.length = 0;
  await leg(page, 1246).locator('[data-plwact^="conf:"]').click();
  await page.locator('[data-plwed] [data-plwin="taken"]').fill('17');
  await page.locator('[data-plwed] [data-plwin="taken"]').press('Enter');
  await page.waitForTimeout(1200);
  const w1 = page._writes;
  ok(w1.length === 2 && w1[0].m === 'PATCH' && w1[0].p === 'movements/3' && JSON.stringify(w1[0].body) === JSON.stringify({ taken: 17, given: 0, sheet_source: 'MANUAL' }),
    'confirm: PATCH movements/3 {taken:17, given:0, sheet_source:MANUAL} — ' + JSON.stringify(w1[0] || null));
  ok(w1[1] && w1[1].m === 'POST' && w1[1].p === 'movements/3/confirm', 'confirm: then POST movements/3/confirm');
  ok(MOVES.find(m => m.id === 3).status === 'confirmed' && MOVES.find(m => m.id === 3).taken === 17, 'table (mock): movement 3 confirmed with taken 17');
  ok((await leg(page, 1246).locator('.plw-end').first().innerText()).includes('17'), 'the row repaints from the re-read: 17');

  // missing: 1246's delivery
  page._writes.length = 0;
  await page.keyboard.press('Escape');
  await leg(page, 1246).locator('[data-plwact$=":D"]').click();
  await page.locator('[data-plwed] [data-plwgo="save"]').click();
  await page.waitForTimeout(1200);
  const posts = page._writes.filter(w => w.m === 'POST' && w.p === 'movements'), post = posts[0];
  ok(!!post && post.body.event_type === 'DELIVERY' && post.body.order_stop_rec === 'recS1246D' && post.body.order_rec === 'recO1246'
    && post.body.taken === 18 && post.body.given === 18 && post.body.confirm === true && post.body.movement_date === P.ORDERS.find(o => o.id === 'recO1246').fields['Delivery DateTime'].slice(0, 10),
    'missing: POST movements {DELIVERY, recS1246D, 18/18, confirm, the stop\'s date} — ' + JSON.stringify(post && post.body));
  ok(posts.length === 1, 'missing: one movement written (only that end\'s stop)');

  // fix: 1243's short delivery
  page._writes.length = 0;
  await leg(page, 1243).locator('[data-plwact^="fix:"]').click();
  await page.locator('[data-plwed] [data-plwin="taken"]').fill('10');
  await page.locator('[data-plwreason="δεν είχαν άδειες"]').click();
  await page.locator('[data-plwed] [data-plwgo="save"]').click();
  await page.waitForTimeout(1200);
  const rev = page._writes.find(w => w.p === 'movements/5/reverse');
  ok(!!rev && rev.body.replacement.event_type === 'DELIVERY' && rev.body.replacement.taken === 10 && rev.body.replacement.given === 16 && rev.body.replacement.notes === 'δεν είχαν άδειες',
    'fix: POST movements/5/reverse {DELIVERY, taken 10, given 16, notes = the reason} — ' + JSON.stringify(rev && rev.body.replacement));
  ok(page._writes.some(w => /^movements\/\d+\/confirm$/.test(w.p) && w.p !== 'movements/5/confirm'), 'fix: the replacement is confirmed');

  // docs
  await page.keyboard.press('Escape');
  const asg = page.locator('[data-plwdoc]').first();
  if (await asg.count()) {
    await asg.click();
    await page.waitForTimeout(300);
    ok(await page.locator('#plwDocs iframe[src^="print.html?"]').count() > 0, 'ΑΝΑΘΕΣΗ → print.html overlay');
    await page.keyboard.press('Escape');
    ok(await page.locator('#plwDocs.hidden').count() === 1, 'Esc closes the documents');
  } else ok(false, 'ΑΝΑΘΕΣΗ has a document');
  const errs = page._errors.filter(e => !/Failed to load resource: the server responded with a status of 404/.test(e));
  ok(errs.length === 0 && page._bad.length === 0, 'no console / page errors; the only 404s are /pallets/week-checks'
    + (errs.length || page._bad.length ? ': ' + [...errs, ...page._bad].join(' | ') : ''));
  await page.close();
}

async function runFailure(browser) {
  console.log('\n— a failed /confirm is said in the row');
  seed();
  const page = await newPage(browser, 'accountant', { failConfirm: true });
  await openTab(page);
  await leg(page, 1246).locator('[data-plwact^="conf:"]').click();
  await page.locator('[data-plwed] [data-plwgo="save"]').click();
  await page.waitForSelector('.plw-err', { timeout: 10000 });
  const err = await page.locator('.plw-err').innerText();
  ok(/οι τιμές γράφτηκαν· η επιβεβαίωση δεν έγινε/.test(err), 'the step is said: ' + err);
  ok(MOVES.find(m => m.id === 3).status === 'pending', 'table (mock): still pending');
  await page.close();
}

async function runMark(browser) {
  console.log('\n— «Ελέγχθηκε» when /pallets/week-checks answers');
  seed();
  const checks = [];
  const page = await newPage(browser, 'accountant', { checks });
  await openTab(page);
  ok(await page.locator('[data-plwck="mark"]').count() === 1, 'the box is drawn for the accountant');
  page._writes.length = 0;
  await page.locator('[data-plwck="mark"]').click();
  await page.waitForTimeout(800);
  const w = page._writes.find(x => x.p === 'week-checks' && x.m === 'POST');
  ok(!!w && w.body.week_start === P.WEEK_FROM && Array.isArray(w.body.movement_ids) && w.body.movement_ids.length === 7 && w.body.again === false,
    'POST week-checks {week_start, the 7 movements of the week, again:false} — ' + JSON.stringify(w && w.body));
  ok(await page.locator('.plw-check.on').count() === 1, 'the stamp is drawn after the write');
  await page.close();
  const disp = await newPage(browser, 'dispatcher', { checks: [] });
  await openTab(disp);
  ok(await disp.locator('[data-plwck="mark"]').count() === 0, 'no box for the dispatcher');
  await disp.close();
}

(async () => {
  console.log('Στόχος: ' + BASE_URL + ' · εβδομάδα ' + P.WEEK_FROM + ' – ' + P.WEEK_TO);
  const browser = await chromium.launch();
  try { await runMain(browser); await runFailure(browser); await runMark(browser); }
  catch (e) { failed++; console.log('  ✗ ΚΑΤΑΡΡΕΥΣΗ: ' + (e && e.stack || e)); }
  finally { await browser.close(); }
  console.log(`\n${passed}/${passed + failed} assertions · screenshots → ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})();
