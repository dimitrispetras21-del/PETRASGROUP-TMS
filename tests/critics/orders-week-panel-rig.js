// Rig — «Παραγγελίες › Εβδομάδα»: the Weekly boards' row order, and the order
// card opened IN the week (owner 2/11/2026, for Ειρήνη).
//
// Same synthetic week and mocks as tests/critics/orders-week-proof.js (invented
// data only — the repo is public), plus 'Client Name' on every order (the text
// the Weekly sorts by). Judged on the DOM and on the requests that left, never
// on the code under test:
//   order  — for each day, the RT rows of «Εβδομάδα» come in the order their
//            orders first appear on the Weekly International board of the SAME
//            mocked week (read from that board's DOM, rows by data-oid).
//   card   — a click on an RT / a national row opens the catalog's card
//            (#intlDetail / #natlDetail) over the week: the week is still on
//            screen, the hub still on «Εβδομάδα»; Esc closes it.
//   save   — «Διόρθωση» (accountant) in that card sends ONE PATCH to ORDERS
//            with the new Price, the week repaints the amount, the card stays.
//   invoice — ΤΠΥ / αυτοπαράδοση / τιμή / αναίρεση from the week's ΤΠΥ and ΠΟΣΟ cells
//            (owner 3/11): each action's PATCH body = «Προς τιμολόγηση»'s, the line repaints.
//
// Run from the MAIN repo root (node_modules + .har), against a server of the
// tree under test:
//   cd /Users/dimitrispetras/PETRASGROUP-TMS && \
//   PW_BASE_URL=http://127.0.0.1:8791/ node <tree>/tests/critics/orders-week-panel-rig.js
const P = require('./orders-week-proof.js');
const path = require('path');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8791/';
// Never inside the clone (public repo): the OS temp folder unless PW_SHOT_DIR says otherwise.
const SHOTS = process.env.PW_SHOT_DIR || path.join(require('os').tmpdir(), 'orders-week-panel');
require('fs').mkdirSync(SHOTS, { recursive: true });

// No 'Client Name' on the orders: the live Worker map has none for ORDERS (only STOCK LOTS), so the
// Weekly's client key is empty in production and so it is here (it was added here until 2/11).

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ ' + msg); } };
const dm = ymd => `${Number(ymd.slice(8, 10))}/${Number(ymd.slice(5, 7))}`;
// order rec id → RT code, from the mocked /costs/rt (Order No = the pg id the legs carry)
const rtOfOrder = new Map();
for (const rt of P.RTS) if (rt.status !== 'cancelled') for (const l of rt.ct_rt_legs) {
  const o = P.ORDERS.find(x => x.fields['Order No'] === l.order_id);
  if (o && !rtOfOrder.has(o.id)) rtOfOrder.set(o.id, rt.code);
}

// «Εβδομάδα»: { 'd/m': [RT codes of that day's own rows] } (guests and «ΧΩΡΙΣ RT» left out).
const weekDays = page => page.evaluate(() => {
  const out = {}; let cur = null;
  const card = document.querySelector('.ow4-sec .ow4-card');
  for (const el of card.children) {
    if (el.classList.contains('ow4-day')) { const m = el.textContent.match(/(\d{1,2}\/\d{1,2})/); cur = m && !/ΧΩΡΙΣ|ΜΕΤΑΦΕΡΘΗΚΕ/.test(el.textContent) ? m[1] : null; if (cur) out[cur] = []; continue; }
    if (!cur || !el.classList.contains('ow4-row') || el.classList.contains('ow4-hd')) continue;
    const tag = (el.querySelector('.ow4-c-rt .ow4-l2') || {}).textContent || '';
    if (/^από /.test(tag)) continue;   // a guest: the Weekly has no row for it on this day
    const l1 = el.querySelector('.ow4-c-rt .ow4-l1').cloneNode(true);
    l1.querySelectorAll('.ow4-no').forEach(x => x.remove());   // the code alone, without the board number
    out[cur].push(l1.textContent.trim());
  }
  return out;
});
// «Εβδομάδα»: every international order line, its order id and the number it shows.
const weekNos = page => page.evaluate(() => [...document.querySelectorAll('.ow4-sec .ow4-card > .ow4-row:not(.ow4-hd):not(.ow4-nat) .ow4-sub[data-owvopen^="intl:"]')].map(el => ({
  code: ((el.closest('.ow4-row').querySelector('.ow4-c-rt .ow4-l1') || {}).textContent || '').trim(),
  id: el.dataset.owvopen.slice(5),
  no: ((el.querySelector('.ow4-no') || {}).textContent || '').trim(),
})));
// Weekly International: order id → the number of the board row that draws it, read from the board's DOM:
// a row with a number gives it to every order inside it and to the sub-rows (legs) under it.
const boardNos = page => page.evaluate(() => {
  const out = {};
  document.querySelectorAll('section.wi4-day .wi4-day-body').forEach(body => {
    let cur = null;
    for (const el of body.children) {
      const t = ((el.querySelector('.wi4-c-idx .wi4-no') || {}).textContent || '').trim();
      if (/^\d+$/.test(t) && !el.classList.contains('wi4-subrow')) cur = +t;
      else if (!el.classList.contains('wi4-subrow')) cur = null;
      if (cur == null) continue;
      [el, ...el.querySelectorAll('[data-oid]')].forEach(x => { const id = x.dataset && x.dataset.oid; if (id && !(id in out)) out[id] = cur; });
    }
  });
  return out;
});
// Weekly International: { 'YYYY-MM-DD': [order rec ids, in row order] }.
const boardDays = page => page.evaluate(() => {
  const out = {};
  document.querySelectorAll('section.wi4-day[data-day]').forEach(s => {
    out[s.dataset.day] = [...s.querySelectorAll('.wi4-row[data-oid]')].map(r => r.dataset.oid).filter(Boolean);
  });
  return out;
});

// The Weekly reads exports and imports apart ({Direction}='Export' / 'Import'); the shared mock answers every
// ORDERS read with all orders, which would draw each export twice (once as an «import»).
const boardReads = page => page.route(`**/${P.T.ORDERS}**`, route => {
  const u = decodeURIComponent(route.request().url());
  const ex = /\{Direction\}='Export'/.test(u), im = /\{Direction\}='Import'/.test(u);
  if (route.request().method() !== 'GET' || ex === im || /RECORD_ID/.test(u)) return route.fallback();
  // cancelled orders stay: the board's reads have no Status condition (weekly_intl.js _wiLoad)
  const recs = P.ORDERS.filter(r => r.fields.Direction === (ex ? 'Export' : 'Import'));
  return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ records: recs }) });
});

async function scnOrder(browser) {
  console.log('\n[order] «Εβδομάδα» = Weekly International, day by day');
  const page = await P.newPage(browser, 'owner');
  await boardReads(page);
  await P.openWeek(page);
  const week = await weekDays(page);
  const wNos = await weekNos(page);
  await page.screenshot({ path: path.join(SHOTS, 'week-intl.png') });
  // One day, for the owner: from its header to the next one, in each view.
  const TUE = P.day(3).slice(0, 10);
  const weekTue = await page.evaluate(label => {
    const days = [...document.querySelectorAll('.ow4-sec .ow4-card > .ow4-day')];
    const i = days.findIndex(d => d.textContent.includes(label));
    const a = days[i].getBoundingClientRect(), b = days[i + 1].getBoundingClientRect(), c = days[i].parentElement.getBoundingClientRect();
    return { x: c.left, y: a.top + scrollY, width: c.width, height: b.top - a.top };
  }, dm(TUE));
  await page.setViewportSize({ width: 1440, height: 2000 });
  const weekPng = await page.screenshot({ clip: weekTue });
  await page.setViewportSize({ width: 1440, height: 960 });
  await gotoPage(page, 'weekly_intl', BASE_URL);
  await page.waitForSelector('section.wi4-day', { timeout: 30000 });
  // the board opens on today's week; the proof week is the last complete one
  await page.click('button[aria-label="Προηγούμενη εβδομάδα"]');
  await page.waitForFunction(from => !!document.querySelector(`section.wi4-day[data-day="${from}"]`), P.WEEK_FROM, { timeout: 30000 });
  await page.waitForTimeout(400);
  const board = await boardDays(page);
  const bNos = await boardNos(page);
  // The number on «Εβδομάδα» = the board's, row by row (owner 2/11, «το 1 να αντιστοιχεί στο 1 του weekly»).
  let numbered = 0, bad = [];
  for (const r of wNos) {
    const want = bNos[r.id] != null ? String(bNos[r.id]) : '—';
    if (want !== '—') numbered++;
    if (r.no !== want) bad.push(`${r.code} ${r.id}: shows «${r.no}», the board «${want}»`);
  }
  ok(!bad.length && numbered >= 12, `every order line's number = the Weekly line that draws it (${numbered} numbered of ${wNos.length})` + (bad.length ? ': ' + bad.join(' | ') : ''));
  const boardMax = Math.max(...Object.values(bNos));
  const shown = new Set(); wNos.forEach(r => { if (bNos[r.id] != null && r.no !== '—') shown.add(bNos[r.id]); });
  const missing = [...new Set(Object.values(bNos))].filter(n => !shown.has(n));
  ok(true, `board numbers 1–${boardMax}; not on «Εβδομάδα»: ${missing.length ? missing.join(', ') : 'none'} (orders without a round trip or in another section)`);
  await page.screenshot({ path: path.join(SHOTS, 'weekly-intl.png') });
  const boardPng = await page.locator(`section.wi4-day[data-day="${TUE}"]`).screenshot();
  // side by side: Weekly left, «Εβδομάδα» right, same day, same mocked week
  const img = b => 'data:image/png;base64,' + b.toString('base64');
  const cmp = await page.context().newPage();
  await cmp.setViewportSize({ width: 2600, height: 900 });
  await cmp.setContent(`<body style="margin:0;background:#F4F6F9;font:600 15px 'DM Sans',sans-serif;color:#0B1929"><div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
    <div><div style="margin:0 0 8px">Εβδομαδιαίο Διεθνών · ${dm(TUE)}</div><img src="${img(boardPng)}"></div>
    <div><div style="margin:0 0 8px">Παραγγελίες › Εβδομάδα · ${dm(TUE)}</div><img src="${img(weekPng)}"></div></div></body>`);
  await cmp.screenshot({ path: path.join(SHOTS, 'same-day-side-by-side.png'), fullPage: true });
  await cmp.close();
  let compared = 0;
  for (const [ymd, oids] of Object.entries(board)) {
    if (ymd < P.WEEK_FROM || ymd > P.WEEK_TO) continue;
    const mine = week[dm(ymd)] || [];
    // the Weekly's order, one RT per first appearance, only RTs that are rows of this day here
    const seen = new Set(), expect = [];
    for (const oid of oids) { const c = rtOfOrder.get(oid); if (c && !seen.has(c) && mine.includes(c)) { seen.add(c); expect.push(c); } }
    if (!expect.length && !mine.length) continue;
    compared++;
    ok(JSON.stringify(mine.filter(c => seen.has(c))) === JSON.stringify(expect),
      `${dm(ymd)}: «Εβδομάδα» ${JSON.stringify(mine)} follows the Weekly ${JSON.stringify(expect)}`);
  }
  ok(compared >= 3, `${compared} days compared (≥ 3)`);
  ok(P.realErrors(page).length === 0, 'order: 0 page/console errors ' + JSON.stringify(P.realErrors(page)).slice(0, 300));
  await page.context().close();
}

async function scnCard(browser) {
  console.log('\n[card] the catalog\'s card opens over the week');
  const page = await P.newPage(browser, 'accountant');
  const patches = [];
  // Registered after installMocks: a PATCH on ORDERS is recorded and answered as the Worker does.
  await page.route(`**/${P.T.ORDERS}/**`, route => {
    const req = route.request();
    if (req.method() !== 'PATCH') return route.fallback();
    const body = req.postDataJSON();
    patches.push({ url: req.url(), body });
    const rid = req.url().split('/').pop().split('?')[0];
    const rec = P.ORDERS.find(r => r.id === rid);
    if (rec) Object.assign(rec.fields, body.fields);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: rid, fields: rec ? rec.fields : body.fields }) });
  });
  await P.openWeek(page);
  // RT-1204 (export #1248 Pella, 3.650,00): its row opens #1248's card
  const row = () => page.locator('.ow4-row', { has: page.locator('.ow4-c-rt .ow4-l1', { hasText: 'RT-1204' }) });
  await row().locator('.ow4-c-rt').click();
  await page.waitForSelector('.owv-cards #intlDetail:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(600);   // the card's own slide-in (oi-slide) before measuring / the shot
  const s1 = await page.evaluate(() => ({
    body: (document.querySelector('#intlDetail') || {}).textContent || '',
    week: !!document.querySelector('.ow4 .ow4-state'),
    fixed: getComputedStyle(document.getElementById('intlDetail')).position,
    right: Math.round(document.getElementById('intlDetail').getBoundingClientRect().right) === innerWidth,
    natlHidden: document.getElementById('natlDetail').classList.contains('hidden'),
  }));
  ok(/PO-4471/.test(s1.body), 'RT-1204 → the card of #1248 (PO-4471) is open');
  ok(s1.week, 'the week is still painted under the card');
  ok(s1.fixed === 'fixed' && s1.right, 'the card floats over the board, flush right (position ' + s1.fixed + ')');
  ok(s1.natlHidden, 'the national panel stays closed');
  await page.screenshot({ path: path.join(SHOTS, 'card-intl-over-week.png') });
  // a repaint of the week («Ανά όχημα» and back) keeps the card open, without a new slide-in
  for (const mode of ['vehicle', 'day']) {
    // the toggle sits under the open card (it floats over the right side): clicked through the DOM
    await page.evaluate(m => document.querySelector(`[data-owvmode="${m}"]`).click(), mode);
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => { const p = document.getElementById('intlDetail'); return { open: !!p && !p.classList.contains('hidden'), anim: p ? p.style.animationName : '' }; });
    ok(st.open && st.anim === 'none', `«${mode === 'vehicle' ? 'Ανά όχημα' : 'Ανά ημέρα'}» repaint: the card stays open, no slide-in (${JSON.stringify(st)})`);
  }

  // «Διόρθωση» → one PATCH on ORDERS, the week repaints, the card stays
  const before = await row().locator('.ow4-l .ow4-n').first().textContent();
  await page.click('#intlDetail [data-oi-act="quick-edit"]');
  await page.waitForSelector('#oqe-Price', { timeout: 10000 });
  await page.fill('#oqe-Price', '3700');
  await page.click('#oqe-save');
  // closeModal() keeps the DOM and drops .open; a refused save keeps it open with #oqe-err
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open') || (document.getElementById('oqe-err') || {}).textContent, null, { timeout: 10000 });
  ok(!(await page.evaluate(() => (document.getElementById('oqe-err') || {}).textContent || '')), 'the form closed without an error line');
  await page.waitForTimeout(300);
  const after = await row().locator('.ow4-l .ow4-n').first().textContent();
  ok(patches.length === 1, `one PATCH left (${patches.length})`);
  ok(patches[0] && /recO1248/.test(patches[0].url) && patches[0].body.fields && Number(patches[0].body.fields.Price) === 3700
    && Object.keys(patches[0].body.fields).length === 1, 'PATCH ORDERS/recO1248 {Price: 3700} only: ' + JSON.stringify(patches[0] && patches[0].body));
  ok(/3\.650,00/.test(before) && /3\.700,00/.test(after), `the week repainted the amount: ${before.trim()} → ${after.trim()}`);
  ok(await page.locator('.owv-cards #intlDetail:not(.hidden)').count() === 1, 'the card is still open after the save');
  ok(await page.evaluate(() => document.getElementById('intlDetail').style.animationName === 'none'), 'the repaint did not slide the card in again');
  await page.screenshot({ path: path.join(SHOTS, 'card-after-correction.png') });

  // a national row → #natlDetail, the international card closes; ΑΝΑΘΕΣΗ from the week's load
  await page.locator('.ow4-row.ow4-nat[data-owvopen="natl:recN427"] .ow4-c-rt').click();
  await page.waitForSelector('.owv-cards #natlDetail:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(600);
  const s2 = await page.evaluate(() => {
    const a = document.querySelector('#natlDetail [data-assign]');
    return { intlHidden: document.getElementById('intlDetail').classList.contains('hidden'), assign: a ? a.dataset.assign : '', text: a ? a.textContent : '' };
  });
  ok(s2.intlHidden, 'opening a national closes the international card');
  ok(s2.assign === 'own', `national #427: ΑΝΑΘΕΣΗ from its load = own truck («${s2.text.trim()}»)`);
  await page.screenshot({ path: path.join(SHOTS, 'card-natl-over-week.png') });
  // #430: no load, not groupage → the catalog's own «εκτός Εβδομαδιαίου»
  await page.locator('.ow4-row.ow4-nat[data-owvopen="natl:recN430"] .ow4-c-rt').click();
  await page.waitForTimeout(300);
  const a430 = await page.evaluate(() => { const a = document.querySelector('#natlDetail [data-assign]'); return a ? a.dataset.assign : ''; });
  ok(a430 === 'out', `national #430 without a load: «${a430}» (the catalog rule), never a guess`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok(await page.locator('.owv-cards #natlDetail.hidden').count() === 1, 'Esc closes the card');
  ok(await page.locator('.ow4 .ow4-state').count() === 1, 'and the week is still there');
  ok(P.realErrors(page).length === 0, 'card: 0 page/console errors ' + JSON.stringify(P.realErrors(page)).slice(0, 300));
  await page.context().close();
}

// «align» (owner 2/11, «δεν υπάρχει καλή ευθυγράμμιση»): ONE column template per side — every row and
// sub-row of a card starts each column (route, client, ΤΠΥ, amount) where the header does (±1px), at three
// widths, «Ανά ημέρα» and «Ανά όχημα», international and national cards.
async function scnAlign(browser) {
  console.log('\n[align] every column starts where its header does');
  const page = await P.newPage(browser, 'owner');
  await P.openWeek(page);
  const measure = () => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.ow4-sec .ow4-card').forEach((card, ci) => {
      for (const side of ['l', 'r']) {
        const head = card.querySelector(`.ow4-hd .ow4-${side} .ow4-sub`);
        if (!head) continue;
        const hx = [...head.children].map(c => Math.round(c.getBoundingClientRect().left));
        card.querySelectorAll(`.ow4-row:not(.ow4-hd) .ow4-${side} .ow4-sub:not(.ow4-none)`).forEach(sub => {
          const x = [...sub.children].map(c => Math.round(c.getBoundingClientRect().left));
          const off = x.map((v, i) => v - hx[i]).filter(d => Math.abs(d) > 1);
          if (off.length) out.push(`card ${ci} ${side}: ${((sub.closest('.ow4-row').querySelector('.ow4-c-rt .ow4-l1') || {}).textContent || '').trim()} cols ${JSON.stringify(x)} vs header ${JSON.stringify(hx)}`);
        });
      }
    });
    return { bad: out, subs: document.querySelectorAll('.ow4-sec .ow4-row:not(.ow4-hd) .ow4-sub:not(.ow4-none)').length };
  });
  for (const w of [1280, 1440, 1920]) {
    for (const mode of ['day', 'vehicle']) {
      await page.setViewportSize({ width: w, height: 960 });
      await page.evaluate(m => { const b = document.querySelector(`[data-owvmode="${m}"]`); if (b) b.click(); }, mode);
      await page.waitForTimeout(500);
      const r = await measure();
      ok(!r.bad.length && r.subs > 10, `${w}px «${mode === 'day' ? 'Ανά ημέρα' : 'Ανά όχημα'}»: ${r.subs} order lines, every column on the header's x` + (r.bad.length ? ` — ${r.bad.length} off: ` + r.bad.slice(0, 3).join(' | ') : ''));
      if (mode === 'day') await page.screenshot({ path: path.join(SHOTS, `align-${w}.png`), fullPage: false });
    }
  }
  ok(P.realErrors(page).length === 0, 'align: 0 page/console errors ' + JSON.stringify(P.realErrors(page)).slice(0, 300));
  await page.context().close();
}

// «docs» (owner 2/11, «μόνο το έγγραφο της ανάθεσης να δω»): a click on ΑΝΑΘΕΣΗ shows THE paper the Weekly prints
// for that load — print.html with the same query, one frame per leg, read-only, over the week. Judged against the
// Weekly's own printers (window.open captured), never against the code under test.
async function scnDocs(browser) {
  console.log('\n[docs] ΑΝΑΘΕΣΗ → the same assignment document as the Weekly');
  const page = await P.newPage(browser, 'owner');
  await boardReads(page);
  // print.html reads one order at a time (/v0/<base>/<table>/<rec>): answered from the same synthetic week
  await page.route(/\/v0\/[^/]+\/tblgHlNmLBH3JTdIM\/rec[A-Za-z0-9]+/, route => {
    const id = route.request().url().split('/').pop().split('?')[0];
    const r = P.ORDERS.find(x => x.id === id);
    return route.fulfill({ status: r ? 200 : 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r || { error: 'NOT_FOUND' }) });
  });
  await P.openWeek(page);
  const queries = {};
  const strip = q => q.replace(/&noprint=1$/, '');
  for (const code of ['RT-1204', 'RT-1202', 'RT-1203']) {
    const row = page.locator('.ow4-row', { has: page.locator('.ow4-c-rt .ow4-l1', { hasText: code }) });
    await row.locator('.ow4-asg').click();
    await page.waitForSelector('#owvDocs:not(.hidden) iframe', { timeout: 10000 });
    await page.waitForTimeout(1500);
    const st = await page.evaluate(() => ({
      srcs: [...document.querySelectorAll('#owvDocs iframe')].map(f => f.getAttribute('src')),
      titles: [...document.querySelectorAll('#owvDocs .owv-doc-t')].map(t => t.textContent.trim()),
      card: !document.getElementById('intlDetail').classList.contains('hidden'),
    }));
    queries[code] = st.srcs.map(s => strip(s.replace(/^print\.html\?/, '')));
    ok(st.srcs.length > 0 && st.srcs.every(s => /^print\.html\?.*&noprint=1$/.test(s)), `${code}: ${st.srcs.length} document(s), print.html only, never printing by itself — ${st.titles.join(' | ')}`);
    ok(!st.card, `${code}: a click on ΑΝΑΘΕΣΗ does not open the order card`);
    if (code === 'RT-1204') {
      const frames = page.frames().map(f => f.url());
      ok(!frames.some(u => /app\.html/.test(u) && u !== page.url()), 'no second app.html in the frames: ' + frames.filter(u => u !== page.url()).map(u => u.replace(/^.*\//, '')).join(', '));
      const fr = page.frames().find(f => /print\.html/.test(f.url()));
      const txt = fr ? await fr.locator('body').innerText().catch(() => '') : '';
      ok(/PO-4471|1248/.test(txt), 'the frame shows order #1248\'s sheet (' + txt.replace(/\s+/g, ' ').slice(0, 80) + '…)');
      await page.screenshot({ path: path.join(SHOTS, 'docs-week-RT-1204.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      ok(await page.locator('#owvDocs.hidden').count() === 1 && await page.locator('.ow4 .ow4-state').count() === 1, 'Esc closes the documents; the week is as it was');
    } else {
      await page.click('#owvDocs [data-owvdocs="close"]');
      ok(await page.locator('#owvDocs.hidden').count() === 1, `${code}: × closes the documents`);
    }
  }
  // The Weekly's own printers for the same loads: window.open captured, nothing opened.
  await gotoPage(page, 'weekly_intl', BASE_URL);
  await page.waitForSelector('section.wi4-day', { timeout: 30000 });
  await page.click('button[aria-label="Προηγούμενη εβδομάδα"]');
  await page.waitForFunction(from => !!document.querySelector(`section.wi4-day[data-day="${from}"]`), P.WEEK_FROM, { timeout: 30000 });
  await page.waitForTimeout(400);
  const board = await page.evaluate(() => {
    const got = [];
    window.open = (u) => { got.push(String(u).replace(/^.*print\.html\?/, '')); return null; };
    const out = {};
    for (const oid of ['recO1248', 'recO1243', 'recO1244', 'recO1245', 'recO1247']) {
      const row = document.querySelector(`.wi4-row[data-oid="${oid}"]`);
      if (!row) { out[oid] = null; continue; }
      got.length = 0;
      row.querySelectorAll('.wi4-prt').forEach(b => b.click());
      out[oid] = got.slice();
    }
    return out;
  });
  const want = { 'RT-1204': [...board.recO1248], 'RT-1202': [...board.recO1243],
    'RT-1203': [...board.recO1244, ...board.recO1245, ...board.recO1247].filter(q => /leg=export/.test(q)) };
  for (const [code, qs] of Object.entries(queries)) {
    const exp = queries[code].filter(q => /leg=export/.test(q)), boardExp = (want[code] || []).filter(q => /leg=export/.test(q));
    ok(exp.length > 0 && JSON.stringify(exp) === JSON.stringify(boardExp), `${code}: export paper(s) = the Weekly's printer ${JSON.stringify(boardExp)} (week: ${JSON.stringify(exp)})`);
  }
  ok(queries['RT-1202'].every(q => /sheet=partner/.test(q)) && want['RT-1202'].every(q => /sheet=partner/.test(q)), 'RT-1202 (partner): «Φύλλο Συνεργάτη» on both screens, as the Weekly decides (owner 9/8)');
  // a screenshot of the same paper as the Weekly's printer opens it (local copy of print.html, no print dialog)
  const pp = await page.context().newPage();
  await pp.goto(BASE_URL + 'print.html?' + want['RT-1204'].filter(q => /leg=export/.test(q))[0] + '&noprint=1');
  await pp.waitForTimeout(1500);
  await pp.screenshot({ path: path.join(SHOTS, 'docs-weekly-RT-1204.png') });
  await pp.close();
  ok(P.realErrors(page).length === 0, 'docs: 0 page/console errors ' + JSON.stringify(P.realErrors(page)).slice(0, 300));
  await page.context().close();
}

// «natv5» (owner 8/11/2026): after day L the national rows carry the Weekly National v5's number of their truck
// (the number the board paints for that rt_id), «—» with the reason otherwise, and a click on their ΑΝΑΘΕΣΗ shows
// the board's driver sheet of that truck and side in a frame — nothing printed, nothing copied, no second app.
// The board is tests/fixtures/wn5-week.json (rows 1…8 = RT-T101…T108, one per rt_id in board order) served for the
// asked week; /plan/nat-state names the trucks by RT code, as 074a does.
async function scnNatV5(browser) {
  console.log('\n[natv5] Εθνικά v5: αριθμός του Εβδομαδιαίου Εθνικών + φύλλο οδηγού στην ΑΝΑΘΕΣΗ');
  const page = await P.newPage(browser, 'owner');
  await boardReads(page);
  // the fixture's days moved to the rig's week (its week is 10/10): every ISO day + the same number of days
  const raw = require('fs').readFileSync(path.join(__dirname, '..', 'fixtures', 'wn5-week.json'), 'utf8');
  const shift = Math.round((Date.parse(P.WEEK_FROM + 'T00:00:00Z') - Date.parse(JSON.parse(raw).week + 'T00:00:00Z')) / 864e5);
  const fix = JSON.parse(raw.replace(/\b(20\d\d-\d\d-\d\d)/g, (d) => new Date(Date.parse(d + 'T00:00:00Z') + shift * 864e5).toISOString().slice(0, 10)));
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const asked = [];
  await page.route('**/plan/config', route => json(route, { cutover_day: '2026-08-01', opened_at: '2026-08-01T05:00:00Z', writes_open: true }));
  const car = (kind, code, side, truck) => ({ kind, truck: truck || null, trailer: null, driver: kind === 'owned' ? 'Driver Test' : null, partner: kind === 'partner' ? 'Partner Test' : null, code, side, day: null });
  const ST = {
    427: [car('owned', 'RT-T106', 'KATHODOS', 'TST-2108')],
    430: [car('owned', 'RT-T102', 'KATHODOS', 'TST-2106'), car('partner', 'RT-T104', 'ANODOS')],   // split at Veroia
    429: [],                                                                                        // waits for a vehicle
  };
  await page.route(/\/plan\/nat-state/, route => {
    const ids = (new URL(route.request().url()).searchParams.get('nat_order_ids') || '').split(',').filter(Boolean);
    const out = {};
    for (const id of ids) out[id] = ST[id] ? { n_pieces: 1, n_executed: 0, executed: false, planned: ST[id].length > 0, late: false, hub_side: 'KATHODOS', carriers: ST[id] } : 'missing';
    return json(route, out);
  });
  await page.route(/\/plan\/board\?/, route => {
    const wk = new URL(route.request().url()).searchParams.get('week');
    asked.push(wk);
    return json(route, Object.assign({}, fix, { week: wk }));
  });
  await page.route(/\/plan\/lookups/, route => json(route, { locations: [1, 2, 3, 4, 5, 6, 7, 8].map(k => ({ id: k, legacy_id: k === 1 ? 'recJucKOhC1zh4IP3' : 'recDEF' + k,
    name: k === 1 ? 'ΒΕΡΟΙΑ TEST' : 'Place Test ' + k, address: 'Street ' + k, city: null, phone: '2100000000', is_hub: k === 1 })), clients: [], trucks: [], trailers: [], drivers: [], partners: [] }));
  await page.addInitScript(() => {
    window.__copied = 0; window.__printed = 0;
    try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => { window.__copied++; return Promise.resolve(); } } }); } catch (_) {}
  });
  await P.openWeek(page);
  await page.waitForSelector('.ow4-row.ow4-nat', { timeout: 15000 });
  ok(asked.length >= 1 && asked.every(w => w === P.WEEK_FROM), `the week's v5 board is read for the week on screen (${JSON.stringify(asked)})`);
  const natNo = async (client) => page.evaluate((cl) => {
    const row = [...document.querySelectorAll('.ow4-row.ow4-nat')].find(r => r.textContent.includes(cl));
    const no = row && row.querySelector('.ow4-no');
    return row ? { no: no ? no.textContent.trim() : null, title: no ? no.getAttribute('title') : null, doc: !!row.querySelector('[data-owvnatdoc]') } : null;
  }, client);
  const a = await natNo('Ορεινά Γαλακτοκομικά'), b = await natNo('4500131302'), w = await natNo('Ελαιώνας Μεσογείου'), old = await natNo('Αρκαδικά Κηπευτικά');
  ok(a && a.no === '6' && /Εθνικών/.test(a.title) && a.doc, `#427 on RT-T106 = row 6 of the board (${JSON.stringify(a)})`);
  ok(b && b.no === '2 · 4' && b.doc, `#430 split on RT-T102 + RT-T104 = «2 · 4» (${JSON.stringify(b)})`);
  ok(w && w.no === '—' && /περιμένει όχημα/.test(w.title) && !w.doc, `#429 waiting = «—», «περιμένει όχημα», no document (${JSON.stringify(w)})`);
  ok(old && old.no === '—' && /παλιού μοντέλου/.test(old.title), `#431 (old model) = «—» with its reason (${JSON.stringify(old)})`);
  // the numbered rows of a day come in number order
  const order = await page.evaluate(() => [...document.querySelectorAll('.ow4-row.ow4-nat .ow4-no')].map(n => n.textContent.trim()).filter(t => t !== '—'));
  ok(order.length >= 2, 'national numbers on screen: ' + order.join(', '));

  // ΑΝΑΘΕΣΗ of #430 → two sheets (Κάθοδος RT-T102, Άνοδος RT-T104), each a frame of the board's sheet
  const row = page.locator('.ow4-row.ow4-nat', { hasText: '4500131302' }).first();
  await row.locator('.ow4-asg').click();
  await page.waitForFunction(() => document.querySelectorAll('#owvDocs:not(.hidden) iframe').length === 2, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({
    titles: [...document.querySelectorAll('#owvDocs .owv-doc-t')].map(t => t.textContent.trim()),
    srcs: [...document.querySelectorAll('#owvDocs iframe')].map(f => f.getAttribute('src')),
    head: (document.querySelector('#owvDocs .owv-docs-h span') || {}).textContent,
    card: !document.getElementById('natlDetail') || !document.getElementById('natlDetail').classList.contains('hidden'),
    copied: window.__copied,
  }));
  ok(/Κάθοδος — Φύλλο Οδηγού · RT-T102/.test(st.titles[0]) && /Άνοδος — Φύλλο Οδηγού · RT-T104/.test(st.titles[1]), 'titles: ' + st.titles.join(' | '));
  ok(st.srcs.every(s => s === null), 'the frames are the sheet itself (srcdoc), never print.html or a second app');
  ok(st.head === 'RT-T102 · RT-T104', 'header names both trucks: ' + st.head);
  ok(st.copied === 0, 'nothing copied (the board\'s ⎙ copies the WhatsApp text; here it is read-only)');
  const fr = page.frames().filter(f => f !== page.mainFrame());
  const txt = await Promise.all(fr.map(f => f.locator('body').innerText().catch(() => '')));
  ok(txt.length === 2 && /TST-2106/.test(txt[0]) && /ΚΑΘΟΔΟΣ|Κάθοδος/i.test(txt[0]), 'frame 1 = the driver sheet of RT-T102 ΚΑΘΟΔΟΣ (' + (txt[0] || '').replace(/\s+/g, ' ').slice(0, 90) + '…)');
  ok(/ΣΥΝΕΡΓΑΤΗΣ/.test(txt[1] || ''), 'frame 2 = the partner\'s sheet of RT-T104 (' + (txt[1] || '').replace(/\s+/g, ' ').slice(0, 90) + '…)');
  await page.screenshot({ path: path.join(SHOTS, 'natv5-docs.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok(await page.locator('#owvDocs.hidden').count() === 1, 'Esc closes the documents');
  // Enter on the ΑΝΑΘΕΣΗ of #427 opens its one sheet
  await page.locator('.ow4-row.ow4-nat', { hasText: 'Ορεινά Γαλακτοκομικά' }).first().locator('[data-owvnatdoc]').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('#owvDocs:not(.hidden) iframe').length === 1, null, { timeout: 10000 });
  ok(/RT-T106/.test(await page.locator('#owvDocs .owv-doc-t').first().textContent()), 'Enter opens #427\'s sheet (RT-T106)');
  await page.click('#owvDocs [data-owvdocs="close"]');
  await page.screenshot({ path: path.join(SHOTS, 'natv5-week.png'), fullPage: true });
  ok(P.realErrors(page).length === 0, 'natv5: 0 page/console errors ' + JSON.stringify(P.realErrors(page)).slice(0, 300));
  await page.context().close();
}

// «natv5carry» (owner 8/11/2026: «12 · W44»): every truck of the week's board started the week before (the fixture's
// days sit in the previous week), so on this week's board each is a continuation without a number. The previous
// week's board numbers them: #427 on RT-T106 reads «6 · W<prev>», and the sheet still opens from this week's board.
async function scnNatV5Carry(browser) {
  console.log('\n[natv5carry] Εθνικά v5: συνέχεια = ο αριθμός της εβδομάδας του φορτηγού');
  const page = await P.newPage(browser, 'owner');
  await boardReads(page);
  const raw = require('fs').readFileSync(path.join(__dirname, '..', 'fixtures', 'wn5-week.json'), 'utf8');
  const day = (iso, d) => new Date(Date.parse(iso + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10);
  const prev = day(P.WEEK_FROM, -7);
  const shift = Math.round((Date.parse(prev + 'T00:00:00Z') - Date.parse(JSON.parse(raw).week + 'T00:00:00Z')) / 864e5);
  const fixPrev = JSON.parse(raw.replace(/\b(20\d\d-\d\d-\d\d)/g, (d) => day(d, shift)));
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const asked = [];
  await page.route('**/plan/config', route => json(route, { cutover_day: '2026-08-01', opened_at: '2026-08-01T05:00:00Z', writes_open: true }));
  await page.route(/\/plan\/nat-state/, route => {
    const ids = (new URL(route.request().url()).searchParams.get('nat_order_ids') || '').split(',').filter(Boolean);
    const out = {};
    for (const id of ids) out[id] = id === '427' ? { n_pieces: 1, n_executed: 0, executed: false, planned: true, late: false, hub_side: 'KATHODOS',
      carriers: [{ kind: 'owned', truck: 'TST-2108', trailer: null, driver: 'Driver Test', partner: null, code: 'RT-T106', side: 'ANODOS', day: null }] } : 'missing';
    return json(route, out);
  });
  // the week on screen: the same cycles (days of the previous week) → all continuations; the previous week: its own
  await page.route(/\/plan\/board\?/, route => {
    const wk = new URL(route.request().url()).searchParams.get('week');
    asked.push(wk);
    return json(route, Object.assign({}, fixPrev, { week: wk }));
  });
  await page.route(/\/plan\/lookups/, route => json(route, { locations: [1, 2, 3, 4, 5, 6, 7, 8].map(k => ({ id: k, legacy_id: k === 1 ? 'recJucKOhC1zh4IP3' : 'recDEF' + k,
    name: k === 1 ? 'ΒΕΡΟΙΑ TEST' : 'Place Test ' + k, address: 'Street ' + k, city: null, phone: '2100000000', is_hub: k === 1 })), clients: [], trucks: [], trailers: [], drivers: [], partners: [] }));
  await P.openWeek(page);
  await page.waitForSelector('.ow4-row.ow4-nat', { timeout: 15000 });
  ok(asked.includes(P.WEEK_FROM) && asked.includes(prev), `both boards read: this week and the continuations' week (${JSON.stringify(asked)})`);
  const wPrev = await page.evaluate(w => TmsWeek.numOf(new Date(w + 'T12:00:00')), prev);
  const a = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.ow4-row.ow4-nat')].find(r => r.textContent.includes('Ορεινά Γαλακτοκομικά'));
    const no = row && row.querySelector('.ow4-no');
    return row ? { no: no ? no.textContent.trim() : null, title: no ? no.getAttribute('title') : null, doc: !!row.querySelector('[data-owvnatdoc]') } : null;
  });
  ok(a && a.no === `6 · W${wPrev}` && /προηγούμενη εβδομάδα/.test(a.title) && a.doc, `#427 (continuation of RT-T106) = «6 · W${wPrev}», its sheet opens (${JSON.stringify(a)})`);
  ok(P.realErrors(page).length === 0, 'natv5carry: 0 page/console errors ' + JSON.stringify(P.realErrors(page)).slice(0, 300));
  await page.context().close();
}

// The Worker's PATCH on ORDERS / NATIONAL ORDERS, as «invoice» and «cardinv» need it: recorded, answered with the
// record (null = column emptied), behind the base's invoice_mark_guard (043 / 101). cap.fail = the next PATCH's 422.
async function invoiceMocks(page) {
  const cap = { patches: [], fail: null, guarded: [] };
  const H = { 'access-control-allow-origin': '*' };
  for (const [tbl, list, name] of [[P.T.ORDERS, P.ORDERS, 'orders'], [P.T.NAT_ORDERS, P.NAT, 'national_orders']]) {
    // Registered after installMocks: a PATCH is recorded and answered as the Worker does (null = column emptied).
    await page.route(`**/${tbl}/rec**`, route => {
      const req = route.request();
      if (req.method() !== 'PATCH') return route.fallback();
      const rid = req.url().split('/').pop().split('?')[0];
      const body = req.postDataJSON();
      cap.patches.push({ table: name, id: rid, fields: body.fields });
      if (cap.fail) { const m = cap.fail; cap.fail = null; return route.fulfill({ status: 422, contentType: 'application/json', headers: H, body: JSON.stringify({ error: m }) }); }
      const rec = list.find(r => r.id === rid);
      // The base's invoice_mark_guard (043 / 101), as read LIVE on 3/11 (SELECT prosrc): a write that keeps or
      // makes a row invoiced and touches its number, price or self delivery passes only as a self delivery, or
      // with a ΤΠΥ and a price > 0. Every write of this scenario goes through it, as in production.
      const guard = (before, patch) => {
        const after = Object.assign({}, before, patch);
        const touched = ['Invoice Number', 'Price', 'Self Delivery'].some(k => k in patch && patch[k] !== before[k]);
        if (after.Invoiced !== true || !(before.Invoiced !== true || touched)) return null;
        if (after['Self Delivery'] === true) return null;
        if (!String(after['Invoice Number'] || '').trim()) return 'Δεν σημαίνεται τιμολογημένη χωρίς αριθμό τιμολογίου (ΤΠΥ) του ERP';
        if (!(Number(after.Price) > 0)) return 'Δεν σημαίνεται τιμολογημένη χωρίς τιμή';
        return null;
      };
      const g = rec ? guard(rec.fields, body.fields || {}) : null;
      cap.guarded.push({ id: rid, refused: g });
      if (g) return route.fulfill({ status: 422, contentType: 'application/json', headers: H, body: JSON.stringify({ error: g }) });
      if (rec) for (const [k, v] of Object.entries(body.fields || {})) { if (v === null) delete rec.fields[k]; else rec.fields[k] = v; }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ id: rid, fields: rec ? rec.fields : body.fields }) });
    });
  }
  return cap;
}

// «invoice» (owner 3/11, Eirini's main table): ΤΠΥ, «Αυτοπαράδοση», price entry, price correction, ΤΠΥ
// correction and undo from the week's ΤΠΥ / ΠΟΣΟ cells. The proof is the PATCH BODY (the same fields as
// «Προς τιμολόγηση»), then the line the week repaints from the record the mock Worker returned.
async function scnInvoice(browser) {
  console.log('\n[invoice] ΤΠΥ / αυτοπαράδοση / τιμή / αναίρεση from the week (owner 3/11)');
  const page = await P.newPage(browser, 'accountant');
  const cap = await invoiceMocks(page);
  await P.openWeek(page);
  const today = await page.evaluate(() => OrdersCommon.today());
  const sub = id => `.ow4-sub[data-owvopen="${id.startsWith('recN') ? 'natl' : 'intl'}:${id}"]`;
  const cell = (id, m) => page.locator(`${sub(id)} [data-owved="${m}"]`).first();
  const txt = async (id, m) => ((await cell(id, m).textContent()) || '').trim();
  const edGone = () => page.waitForFunction(() => !document.getElementById('owvEd'), null, { timeout: 10000 });
  const last = () => cap.patches[cap.patches.length - 1];
  const body = p => JSON.stringify(p && p.fields);
  const confirmOk = async re => {
    await page.waitForSelector('#_cfaOk', { state: 'visible', timeout: 10000 });
    const t = await page.locator('#modalOverlay').textContent();
    ok(re.test(t), 'the confirm says ' + re + ' — «' + t.replace(/\s+/g, ' ').trim().slice(0, 110) + '»');
    await page.click('#_cfaOk');
  };

  ok(await page.locator('[data-owved]').count() > 0, 'accountant: the ΤΠΥ and ΠΟΣΟ cells are buttons');
  ok(await page.locator(`${sub('recN440')} [data-owved]`).count() === 0, 'old VS national #440: no editor (the international order carries the price)');

  // 1 · ΤΠΥ: a duplicate of ANOTHER client asks the question of «Προς τιμολόγηση»; cancel / Esc = no PATCH
  await cell('recO1247', 'tpy').click();
  await page.waitForSelector('#owvEd [data-owvedin="num"]');
  ok(await page.evaluate(() => { const e = document.getElementById('owvEd'); return !!e.previousElementSibling && e.previousElementSibling.matches('.ow4-sub[data-owvopen="intl:recO1247"]'); }), 'ΤΠΥ click → the editor opens right under the line of #1247');
  ok(await page.evaluate(() => (document.activeElement || {}).dataset && document.activeElement.dataset.owvedin === 'num'), 'the ΤΠΥ box has the focus');
  ok(await page.locator('#owvEd [data-owvedin="date"]').inputValue() === today, 'date = today, as in «Προς τιμολόγηση»');
  await page.keyboard.type('0461');
  await page.waitForTimeout(150);
  ok(/0461 υπάρχει ήδη στην .+ άλλου πελάτη/.test(await page.locator('#owvEdHint').textContent()), 'live line under the box: «υπάρχει ήδη … άλλου πελάτη»');
  await page.screenshot({ path: path.join(SHOTS, 'invoice-tpy-dup.png') });
  await page.keyboard.press('Enter');
  await page.waitForSelector('#_cfaCancel', { state: 'visible' });
  ok(/Ένα τιμολόγιο ERP δεν αφορά δύο πελάτες/.test(await page.locator('#modalOverlay').textContent()), 'Enter → the same confirm as «Προς τιμολόγηση»');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ok(cap.patches.length === 0 && await page.locator('#owvEd').count() === 1, 'Esc in the dialog: no PATCH, the dialog closes and the editor stays');
  await page.fill('#owvEd [data-owvedin="num"]', 'T-9001');
  await page.keyboard.press('Enter');
  await edGone();
  ok(cap.patches.length === 1 && last().table === 'orders' && last().id === 'recO1247'
    && body(last()) === JSON.stringify({ Invoiced: true, 'Invoice Number': 'T-9001', 'Invoice Date': today }), 'ΤΠΥ → ONE PATCH orders/recO1247 {Invoiced, Invoice Number, Invoice Date}: ' + body(last()));
  ok(/✓ T-9001/.test(await txt('recO1247', 'tpy')), 'the line repaints in place: «✓ T-9001»');

  // 2 · «Αυτοπαράδοση» (101) and its undo (the box cleared IN the same write)
  await cell('recO1259', 'tpy').click();
  await page.waitForSelector('#owvEd [data-owvedact="self"]');
  await page.click('#owvEd [data-owvedact="self"]');
  await edGone();
  ok(last().id === 'recO1259' && body(last()) === JSON.stringify({ Invoiced: true, 'Self Delivery': true, 'Invoice Number': null, 'Invoice Date': today }), 'tick → PATCH {Invoiced, Self Delivery, Invoice Number: null, Invoice Date}: ' + body(last()));
  ok(/αυτοπαράδοση/.test(await txt('recO1259', 'tpy')), 'the line: «✓ αυτοπαράδοση»');
  await cell('recO1259', 'tpy').click();
  await page.waitForSelector('#owvEd [data-owvedact="undo"]');
  await page.click('#owvEd [data-owvedact="undo"]');
  await confirmOk(/αυτοπαράδοση και η ημερομηνία σβήνουν/);
  await page.waitForSelector('#owvEd [data-owvedin="num"]', { timeout: 10000 });
  ok(last().id === 'recO1259' && body(last()) === JSON.stringify({ Invoiced: false, 'Invoice Number': null, 'Invoice Date': null, 'Self Delivery': false }), 'undo self → PATCH clears Invoiced, number, date AND Self Delivery: ' + body(last()));
  ok(/προς κοπή/.test(await txt('recO1259', 'tpy')), 'the line is «προς κοπή» again; the ΤΠΥ box is open under it');
  ok(await page.locator('#owvEd [data-owvedin="num"]').inputValue() === '', 'the new ΤΠΥ box is empty (nothing carried over)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok(await page.locator('#owvEd').count() === 0, 'Esc closes the editor');

  // 3 · price entry on an unpriced order (owner 21/10: the price, then the ΤΠΥ)
  ok(/τιμή/.test(await txt('recO1260', 'tpy')), '#1260 (0 €) says «τιμή» in ΤΠΥ');
  await cell('recO1260', 'tpy').click();
  await page.waitForSelector('#owvEd [data-owvedin="price"]');
  ok(/πρώτα η τιμή/i.test(await page.locator('#owvEd').textContent()), 'ΤΠΥ of an unpriced order → «Χωρίς τιμή · πρώτα η τιμή»');
  await page.screenshot({ path: path.join(SHOTS, 'invoice-price-first.png') });
  const n3 = cap.patches.length;
  await page.fill('#owvEd [data-owvedin="price"]', 'abc');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  ok(cap.patches.length === n3 && /μεγαλύτερο του 0/.test(await page.locator('#owvEd .owv-ed-err').textContent()), '«abc» → said in the row, no PATCH');
  await page.fill('#owvEd [data-owvedin="price"]', '1.250,00');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#owvEd [data-owvedin="num"]', { timeout: 10000 });
  ok(last().id === 'recO1260' && body(last()) === JSON.stringify({ Price: 1250 }), 'price → ONE PATCH {Price: 1250}: ' + body(last()));
  ok(/1\.250,00/.test(await txt('recO1260', 'amt')) && /προς κοπή/.test(await txt('recO1260', 'tpy')), 'the line repaints 1.250,00 · προς κοπή, and the ΤΠΥ box opens in the same place');
  await page.keyboard.press('Escape');

  // 4 · price correction (ΠΟΣΟ of a priced, not invoiced order)
  await cell('recO1255', 'amt').click();
  await page.waitForSelector('#owvEd [data-owvedin="price"]');
  ok(await page.locator('#owvEd [data-owvedin="price"]').inputValue() === '2.800,00', 'ΠΟΣΟ click → the price box holds 2.800,00');
  await page.fill('#owvEd [data-owvedin="price"]', '2950');
  await page.keyboard.press('Enter');
  await edGone();
  ok(last().id === 'recO1255' && body(last()) === JSON.stringify({ Price: 2950 }), 'correction → PATCH {Price: 2950}: ' + body(last()));
  ok(/2\.950,00/.test(await txt('recO1255', 'amt')), 'the line repaints 2.950,00');

  // 5 · an invoiced order's price changes (owner 3/11, «Όχι, να αλλάζει»): owner / accountant, asked first
  await cell('recO1244', 'amt').click();
  await page.waitForSelector('#owvEd [data-owvedin="price"]');
  const ed5 = await page.locator('#owvEd').textContent();
  ok(/Τιμολογημένη \(ΤΠΥ 0463\)/.test(ed5) && /το τιμολόγιο στο ERP δεν αλλάζει από εδώ/.test(ed5), 'invoiced #1244: the price box says «Τιμολογημένη (ΤΠΥ 0463) · το τιμολόγιο στο ERP δεν αλλάζει από εδώ»');
  await page.screenshot({ path: path.join(SHOTS, 'invoice-price-invoiced.png') });
  const n5 = cap.patches.length;
  await page.fill('#owvEd [data-owvedin="price"]', '1200');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#_cfaCancel', { state: 'visible' });
  const q5 = await page.locator('#modalOverlay').textContent();
  ok(/Αλλαγή τιμής της #1244 \(ΤΠΥ 0463\)/.test(q5) && /Το τιμολόγιο στο ERP ΔΕΝ αλλάζει από εδώ/.test(q5), 'Enter → asked first, in the undo\'s words: «' + q5.replace(/\s+/g, ' ').trim().slice(0, 140) + '»');
  await page.click('#_cfaCancel'); await page.waitForTimeout(200);
  ok(cap.patches.length === n5 && await page.locator('#owvEd').count() === 1, 'cancel → no PATCH, the editor stays');
  const st0 = await page.locator('.ow4-st').textContent();
  await page.keyboard.press('Enter');
  await confirmOk(/ERP ΔΕΝ αλλάζει/);
  await edGone();
  ok(last().id === 'recO1244' && body(last()) === JSON.stringify({ Price: 1200 }), 'invoiced price → ONE PATCH {Price: 1200}: ' + body(last()));
  ok(cap.guarded[cap.guarded.length - 1].refused === null, 'the base guard 043 lets it through (ΤΠΥ 0463 + price > 0)');
  ok(/1\.200,00/.test(await txt('recO1244', 'amt')) && /✓ 0463/.test(await txt('recO1244', 'tpy')), 'the line repaints 1.200,00 and stays ✓ 0463');
  ok((await page.locator('.ow4-st').textContent()) !== st0, 'the week\'s statement repaints from the Worker\'s answer');
  // undo, from the ΤΠΥ editor
  await cell('recO1244', 'tpy').click();
  await page.waitForSelector('#owvEd [data-owvedact="undo"]');
  await page.click('#owvEd [data-owvedact="undo"]');
  await confirmOk(/ΤΠΥ 0463/);
  // the correction form already has a ΤΠΥ box: wait for the LINE, repainted from the Worker's answer
  await page.waitForFunction(() => /προς κοπή/.test((document.querySelector('.ow4-sub[data-owvopen="intl:recO1244"] [data-owved="tpy"]') || {}).textContent || ''), null, { timeout: 10000 });
  ok(last().id === 'recO1244' && body(last()) === JSON.stringify({ Invoiced: false, 'Invoice Number': null, 'Invoice Date': null }), 'undo → PATCH {Invoiced: false, Invoice Number: null, Invoice Date: null}: ' + body(last()));
  ok(await page.locator('#owvEd [data-owvedin="num"]').inputValue() === '', 'the new ΤΠΥ box under it is empty');
  const t1244 = await txt('recO1244', 'tpy');
  ok(/προς κοπή/.test(t1244), 'the line: «προς κοπή»; the ΤΠΥ box is open under it — «' + t1244 + '»');
  await page.keyboard.press('Escape');

  // 5b · a self delivery's price (101: invoiced, no ΤΠΥ) — the base's exception lets it through
  await cell('recO1255', 'tpy').click();
  await page.waitForSelector('#owvEd [data-owvedact="self"]');
  await page.click('#owvEd [data-owvedact="self"]');
  await edGone();
  await cell('recO1255', 'amt').click();
  await page.waitForSelector('#owvEd [data-owvedin="price"]');
  ok(/Τιμολογημένη \(αυτοπαράδοση\)/.test(await page.locator('#owvEd').textContent()), 'self delivery #1255: «Τιμολογημένη (αυτοπαράδοση)»');
  await page.fill('#owvEd [data-owvedin="price"]', '3000');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#_cfaOk', { state: 'visible' });
  const q5b = await page.locator('#modalOverlay').textContent();
  ok(/Αλλαγή τιμής της #1255 \(αυτοπαράδοση\)/.test(q5b) && !/ERP ΔΕΝ αλλάζει/.test(q5b), 'asked, without the ERP sentence (there is no ERP invoice)');
  await page.click('#_cfaOk');
  await edGone();
  ok(last().id === 'recO1255' && body(last()) === JSON.stringify({ Price: 3000 }), 'self delivery price → PATCH {Price: 3000}: ' + body(last()));
  ok(cap.guarded[cap.guarded.length - 1].refused === null, 'the base guard 101 lets it through (self delivery, no ΤΠΥ)');
  ok(/3\.000,00/.test(await txt('recO1255', 'amt')) && /αυτοπαράδοση/.test(await txt('recO1255', 'tpy')), 'the line repaints 3.000,00 · αυτοπαράδοση');

  // 6 · ΤΠΥ correction on an invoiced order: number and date only
  await cell('recO1238', 'tpy').click();
  await page.waitForSelector('#owvEd [data-owvedin="num"]');
  ok(await page.locator('#owvEd [data-owvedin="num"]').inputValue() === '0458', 'invoiced #1238: the box holds its ΤΠΥ 0458');
  await page.fill('#owvEd [data-owvedin="num"]', '0459');
  await page.keyboard.press('Enter');
  await confirmOk(/Ο αριθμός 0458 θα αντικατασταθεί από 0459/);
  await edGone();
  ok(last().id === 'recO1238' && JSON.stringify(Object.keys(last().fields)) === JSON.stringify(['Invoice Number', 'Invoice Date']) && last().fields['Invoice Number'] === '0459', 'Διόρθωση ΤΠΥ → PATCH {Invoice Number, Invoice Date}: ' + body(last()));
  ok(/✓ 0459/.test(await txt('recO1238', 'tpy')), 'the line: «✓ 0459»');

  // 7 · a national order: its own table
  await cell('recN431', 'tpy').click();
  await page.waitForSelector('#owvEd [data-owvedin="num"]');
  await page.fill('#owvEd [data-owvedin="num"]', 'N-77');
  await page.keyboard.press('Enter');
  await edGone();
  ok(last().table === 'national_orders' && last().id === 'recN431' && body(last()) === JSON.stringify({ Invoiced: true, 'Invoice Number': 'N-77', 'Invoice Date': today }), 'national #431 → PATCH national_orders/recN431: ' + body(last()));

  // 8 · a refusal stays in the row: no repaint as success, the typed number kept
  cap.fail = 'Δεν σημαίνεται τιμολογημένη χωρίς τιμή';
  await cell('recO1256', 'tpy').click();
  await page.waitForSelector('#owvEd [data-owvedin="num"]');
  await page.fill('#owvEd [data-owvedin="num"]', 'T-9002');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#owvEd .owv-ed-err', { timeout: 10000 });
  const errT = await page.locator('#owvEd .owv-ed-err').textContent();
  ok(last().id === 'recO1256' && /Δεν γράφτηκε/.test(errT) && /χωρίς τιμή/.test(errT), '422 → «Δεν γράφτηκε: …» under the line: «' + errT.trim() + '»');
  ok(/προς κοπή/.test(await txt('recO1256', 'tpy')) && await page.locator('#owvEd [data-owvedin="num"]').inputValue() === 'T-9002', 'the line stays «προς κοπή», «T-9002» is still typed');
  await page.screenshot({ path: path.join(SHOTS, 'invoice-refused.png') });
  await page.keyboard.press('Escape');

  // 9 · the other clicks are as they were: the order line opens the card, the editor gives way
  await cell('recO1248', 'tpy').click();
  await page.waitForSelector('#owvEd');
  await page.locator(`${sub('recO1248')} .ow4-c`).nth(1).click();
  await page.waitForSelector('.owv-cards #intlDetail:not(.hidden)', { timeout: 10000 });
  ok(await page.locator('.ow4-card #owvEd').count() === 0 && await page.locator('.owv-cards #intlDetail #owvEd').count() === 1, 'a click on the client opens the order card: the line\'s editor closes, the card carries «Τιμολόγηση» (8/11)');
  await page.keyboard.press('Escape');
  // an editor left open never comes back from another view (code review high: stale / stuck editor)
  await cell('recO1248', 'tpy').click();
  await page.waitForSelector('#owvEd');
  await page.evaluate(() => OrdersHub.setView('invoicing'));
  await page.waitForTimeout(800);
  await page.evaluate(() => OrdersHub.setView('week'));
  await page.waitForSelector('.ow4 .ow4-state', { timeout: 30000 });
  await page.waitForTimeout(300);
  ok(await page.locator('#owvEd').count() === 0, 'another view and back: the editor left open is not mounted again');
  ok(await page.locator('[data-owved]').count() > 0, 'and the cells still open it');
  const total = cap.patches.length;
  ok(total === 12, `${total} PATCHes in all — one per write, none from opening, cancelling or a wrong price`);
  ok(cap.guarded.filter(x => x.refused).length === 0, 'the base guard refused none of the screen\'s writes (the 422 was the scenario\'s own)');
  ok(P.realErrors(page, /422|Δεν σημαίνεται/).length === 0, 'invoice: 0 page/console errors but the deliberate 422 ' + JSON.stringify(P.realErrors(page, /422|Δεν σημαίνεται/)).slice(0, 300));
  await page.context().close();

  // 10 · who may not invoice sees the week as before
  const mg = await P.newPage(browser, 'management');
  await P.openWeek(mg);
  ok(await mg.locator('[data-owved]').count() === 0, 'management: no ΤΠΥ / ΠΟΣΟ editor (it cannot invoice today either)');
  await mg.locator(`${sub('recO1247')} .ow4-c`).nth(2).click();
  await mg.waitForSelector('.owv-cards #intlDetail:not(.hidden)', { timeout: 10000 });
  ok(true, 'management: a click on ΤΠΥ opens the order card, as before');
  await mg.context().close();
}

// «cardinv» (owner 8/11, change 12: «ΠΑΝΕΛ … να σημειώνεται ΤΠΥ, τιμή και αυτοπαράδοση»; «Και στο πλαϊνό
// πάνελ»): the order card opened in the week carries «Τιμολόγηση» — the cells' own editor, mounted in the card.
// The proof is again the PATCH BODY (same fields as the cells / «Προς τιμολόγηση»), then the line AND the card,
// repainted from the record the mock Worker returned. Orders untouched by «invoice» (it runs before, same fixture).
async function scnCardInv(browser) {
  console.log('\n[cardinv] «Τιμολόγηση» in the order card over the week (owner 8/11)');
  const page = await P.newPage(browser, 'accountant');
  const cap = await invoiceMocks(page);
  await P.openWeek(page);
  const today = await page.evaluate(() => OrdersCommon.today());
  const sub = id => `.ow4-sub[data-owvopen="${id.startsWith('recN') ? 'natl' : 'intl'}:${id}"]`;
  const panelSel = id => (id.startsWith('recN') ? '.owv-cards #natlDetail' : '.owv-cards #intlDetail');
  const sec = id => `${panelSel(id)} .owv-card-inv`;
  const txt = async (id, m) => ((await page.locator(`${sub(id)} [data-owved="${m}"]`).first().textContent()) || '').trim();
  const cardTxt = async id => ((await page.locator(panelSel(id)).textContent()) || '').replace(/\s+/g, ' ');
  const last = () => cap.patches[cap.patches.length - 1];
  const body = p => JSON.stringify(p && p.fields);
  const open = async id => {
    // a cell of the line that is not ΤΠΥ / ΠΟΣΟ (the client) opens the card, as a click does — the ΑΝΟΔΟΣ side
    // draws its columns mirrored, so never by position
    await page.locator(`${sub(id)} .ow4-c:not(.ow4-edc)`).first().click();
    await page.waitForSelector(`${sec(id)} #owvEd`, { timeout: 10000 });
  };
  const confirmOk = async re => {
    await page.waitForSelector('#_cfaOk', { state: 'visible', timeout: 10000 });
    const q = await page.locator('#modalOverlay').textContent();
    ok(re.test(q), 'the confirm says ' + re + ' — «' + q.replace(/\s+/g, ' ').trim().slice(0, 110) + '»');
    await page.click('#_cfaOk');
  };
  const n0 = cap.patches.length;

  // 1 · an unpriced order: price first, then the ΤΠΥ box in the same section (owner 21/10)
  await open('recO1249');
  ok(await page.evaluate(() => { const s = document.querySelector('.owv-cards #intlDetail .owv-card-inv'); const p = s && s.previousElementSibling; return !!p && /Στοιχεία/.test(p.textContent); }), 'the section «Τιμολόγηση» sits right under «Στοιχεία» (Τιμή · Τιμολογήθηκε)');
  ok(/Χωρίς τιμή · πρώτα η τιμή/i.test(await page.locator(sec('recO1249')).textContent()), '#1249 (no price): «Χωρίς τιμή · πρώτα η τιμή»');
  ok(await page.locator(`${sec('recO1249')} .owv-ed-sw`).count() === 0, 'no «Τιμολόγιο / Τιμή» switch before the price');
  ok(await page.evaluate(() => !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#owvEd'))), 'opening the card to read it: the caret is not moved into a box');
  ok(await page.locator('.ow4-card #owvEd').count() === 0, 'no editor under the line at the same time');
  await page.screenshot({ path: path.join(SHOTS, 'cardinv-price-first.png') });
  await page.fill('#owvEd [data-owvedin="price"]', '1.500,00');
  await page.keyboard.press('Enter');
  await page.waitForSelector(`${sec('recO1249')} [data-owvedin="num"]`, { timeout: 10000 });
  ok(last().table === 'orders' && last().id === 'recO1249' && body(last()) === JSON.stringify({ Price: 1500 }), 'price → ONE PATCH orders/recO1249 {Price: 1500}: ' + body(last()));
  ok(/1\.500,00/.test(await txt('recO1249', 'amt')), 'the line repaints 1.500,00');
  ok(/1\.500/.test(await cardTxt('recO1249')), 'the card\'s «Τιμή» says the new price');
  ok(await page.evaluate(() => (document.activeElement || {}).dataset && document.activeElement.dataset.owvedin === 'num'), 'the ΤΠΥ box opens in the card with the focus');

  // 2 · ΤΠΥ from the card
  await page.fill('#owvEd [data-owvedin="num"]', 'C-501');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /C-501/.test((document.querySelector('.owv-cards #intlDetail') || {}).textContent || ''), null, { timeout: 10000 });
  ok(last().id === 'recO1249' && body(last()) === JSON.stringify({ Invoiced: true, 'Invoice Number': 'C-501', 'Invoice Date': today }), 'ΤΠΥ → PATCH {Invoiced, Invoice Number, Invoice Date}: ' + body(last()));
  ok(/✓ C-501/.test(await txt('recO1249', 'tpy')), 'the line: «✓ C-501»');
  ok(/Τιμολογήθηκε\s*Ναι · ΤΠΥ C-501/.test(await cardTxt('recO1249')), 'the card: «Τιμολογήθηκε Ναι · ΤΠΥ C-501»');
  ok(/διόρθωση/i.test(await page.locator(sec('recO1249')).textContent()) && await page.locator(`${sec('recO1249')} [data-owvedact="undo"]`).count() === 1, 'the section is now the ΤΠΥ correction, with «Αναίρεση τιμολόγησης»');
  await page.screenshot({ path: path.join(SHOTS, 'cardinv-invoiced.png') });

  // 3 · «Τιμή» tab: an invoiced order's price, asked first (owner 3/11)
  await page.click(`${sec('recO1249')} [data-owvedact="mode:amt"]`);
  await page.waitForSelector(`${sec('recO1249')} [data-owvedin="price"]`);
  ok(await page.locator('#owvEd [data-owvedin="price"]').inputValue() === '1.500,00', '«Τιμή» tab → the price box holds 1.500,00');
  await page.fill('#owvEd [data-owvedin="price"]', '1600');
  await page.keyboard.press('Enter');
  await confirmOk(/ERP ΔΕΝ αλλάζει/);
  await page.waitForFunction(() => /1\.600/.test((document.querySelector('.ow4-sub[data-owvopen="intl:recO1249"] [data-owved="amt"]') || {}).textContent || ''), null, { timeout: 10000 });
  ok(last().id === 'recO1249' && body(last()) === JSON.stringify({ Price: 1600 }), 'invoiced price → PATCH {Price: 1600}: ' + body(last()));
  ok(cap.guarded[cap.guarded.length - 1].refused === null, 'the base guard 043 lets it through (ΤΠΥ + price > 0)');

  // 4 · undo from the card
  await page.click(`${sec('recO1249')} [data-owvedact="mode:tpy"]`);
  await page.click(`${sec('recO1249')} [data-owvedact="undo"]`);
  await confirmOk(/ΤΠΥ C-501/);
  await page.waitForFunction(() => /προς κοπή/.test((document.querySelector('.ow4-sub[data-owvopen="intl:recO1249"] [data-owved="tpy"]') || {}).textContent || ''), null, { timeout: 10000 });
  ok(last().id === 'recO1249' && body(last()) === JSON.stringify({ Invoiced: false, 'Invoice Number': null, 'Invoice Date': null }), 'undo → PATCH {Invoiced: false, Invoice Number: null, Invoice Date: null}: ' + body(last()));
  ok(/Τιμολογήθηκε\s*Όχι/.test(await cardTxt('recO1249')) && await page.locator(`${sec('recO1249')} [data-owvedin="num"]`).count() === 1, 'the card: «Τιμολογήθηκε Όχι», the section offers the ΤΠΥ again');

  // 5 · «Αυτοπαράδοση» from the card (another order: the section follows the card)
  await open('recO1257');
  ok(await page.locator('.owv-card-inv').count() === 1, 'one section, in the card now open');
  await page.click(`${sec('recO1257')} [data-owvedact="self"]`);
  await page.waitForFunction(() => /αυτοπαράδοση/.test((document.querySelector('.owv-cards #intlDetail') || {}).textContent || ''), null, { timeout: 10000 });
  ok(last().id === 'recO1257' && body(last()) === JSON.stringify({ Invoiced: true, 'Self Delivery': true, 'Invoice Number': null, 'Invoice Date': today }), 'tick → PATCH {Invoiced, Self Delivery, Invoice Number: null, Invoice Date}: ' + body(last()));
  ok(/αυτοπαράδοση/.test(await txt('recO1257', 'tpy')) && /Τιμολογήθηκε\s*Ναι · αυτοπαράδοση/.test(await cardTxt('recO1257')), 'the line «✓ αυτοπαράδοση», the card «Τιμολογήθηκε Ναι · αυτοπαράδοση»');

  // 6 · what she types survives the card repainting itself (its stops arriving re-draw the whole panel)
  await open('recO1243');
  await page.click('#owvEd [data-owvedin="num"]');
  await page.keyboard.type('KEEP-1');
  await page.evaluate(() => selectIntlOrder('recO1243'));
  await page.waitForSelector(`${sec('recO1243')} [data-owvedin="num"]`);
  ok(await page.locator('#owvEd [data-owvedin="num"]').inputValue() === 'KEEP-1', 'the card repaints: the section is back and «KEEP-1» is still typed');

  // 7 · a refusal stays in the card, the typed number kept
  cap.fail = 'Δεν σημαίνεται τιμολογημένη χωρίς τιμή';
  await page.press('#owvEd [data-owvedin="num"]', 'Enter');
  await page.waitForSelector(`${sec('recO1243')} .owv-ed-err`, { timeout: 10000 });
  const errT = await page.locator('#owvEd .owv-ed-err').textContent();
  ok(last().id === 'recO1243' && /Δεν γράφτηκε/.test(errT), '422 → «Δεν γράφτηκε: …» in the card: «' + errT.trim() + '»');
  ok(/προς κοπή/.test(await txt('recO1243', 'tpy')) && await page.locator('#owvEd [data-owvedin="num"]').inputValue() === 'KEEP-1', 'the line stays «προς κοπή», «KEEP-1» still typed');
  await page.screenshot({ path: path.join(SHOTS, 'cardinv-refused.png') });

  // 8 · Esc is the card's: card and section close together; a ΤΠΥ cell still opens the line's editor
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok(await page.locator('.owv-cards #intlDetail.hidden').count() === 1, 'Esc closes the card (one press, no section left to close first)');
  await page.locator(`${sub('recO1243')} [data-owved="tpy"]`).first().click();
  await page.waitForSelector('.ow4-card #owvEd [data-owvedin="num"]');
  ok(await page.locator('#owvEd').count() === 1, 'a ΤΠΥ cell opens the editor under the line, as before (one editor)');
  await page.keyboard.press('Escape');

  // 9 · a national order's card: its own table
  await open('recN434');
  await page.fill('#owvEd [data-owvedin="num"]', 'N-88');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /✓ N-88/.test((document.querySelector('.ow4-sub[data-owvopen="natl:recN434"] [data-owved="tpy"]') || {}).textContent || ''), null, { timeout: 10000 });
  ok(last().table === 'national_orders' && last().id === 'recN434' && body(last()) === JSON.stringify({ Invoiced: true, 'Invoice Number': 'N-88', 'Invoice Date': today }), 'national card #434 → PATCH national_orders/recN434: ' + body(last()));
  await page.screenshot({ path: path.join(SHOTS, 'cardinv-natl.png') });
  await page.keyboard.press('Escape');

  // 10 · where the line has no editor, neither has the card: the old VS national
  await page.locator(`${sub('recN440')} .ow4-c:not(.ow4-edc)`).first().click();
  await page.waitForSelector('.owv-cards #natlDetail:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(400);
  ok(await page.locator('.owv-card-inv').count() === 0, 'old VS national #440: no «Τιμολόγηση» in its card (the international order carries the price)');
  const n = cap.patches.length - n0;
  // price, ΤΠΥ, invoiced price, undo, self delivery, the refused one (422), the national ΤΠΥ
  ok(n === 7, `${n} PATCHes from the card — one per write, none from opening, switching, repainting or Esc`);
  ok(cap.guarded.filter(x => x.refused).length === 0, 'the base guard refused none of the card\'s writes (the 422 was the scenario\'s own)');
  ok(P.realErrors(page, /422|Δεν σημαίνεται/).length === 0, 'cardinv: 0 page/console errors but the deliberate 422 ' + JSON.stringify(P.realErrors(page, /422|Δεν σημαίνεται/)).slice(0, 300));
  await page.context().close();

  // 11 · who may not invoice: the card as before, no section
  const mg = await P.newPage(browser, 'management');
  await P.openWeek(mg);
  await mg.locator(`${sub('recO1248')} .ow4-c:not(.ow4-edc)`).first().click();
  await mg.waitForSelector('.owv-cards #intlDetail:not(.hidden)', { timeout: 10000 });
  ok(await mg.locator('.owv-card-inv').count() === 0, 'management: the card has no «Τιμολόγηση» (it cannot invoice today either)');
  await mg.context().close();
}

(async () => {
  console.log('Στόχος: ' + BASE_URL + ' · εβδομάδα ' + P.WEEK_FROM + ' – ' + P.WEEK_TO);
  const browser = await chromium.launch();
  try {
    await scnDocs(browser);
    await scnNatV5(browser);
    await scnNatV5Carry(browser);
    await scnAlign(browser);
    await scnOrder(browser);
    await scnCard(browser);
    // last: it writes into the shared fixture (P.ORDERS / P.NAT)
    await scnInvoice(browser);
    await scnCardInv(browser);
  } catch (e) {
    failed++;
    console.log('  ✗ ΚΑΤΑΡΡΕΥΣΗ: ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  console.log(`\n${passed}/${passed + failed} assertions · screenshots → ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})();
