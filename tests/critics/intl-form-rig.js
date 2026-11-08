// Rig: the new international order form (owner 8/11, change 13; Figma 2590:7735 Φ1–Φ6; base 111 + Worker --ifs).
//
// Usage (cwd = the MAIN repo root: it holds node_modules and .har/):
//   node <worktree>/tests/critics/intl-form-rig.js <baseURL> <outDir>
// baseURL serves the code under test (e.g. http://localhost:8788/.claude/worktrees/<dir>/).
// Worker responses are STUBBED in memory (ORDERS, ORDER STOPS, LOCATIONS, CLIENTS); the proof is the request BODY the
// form sends, never a toast. Fixture names are generic — the repo is public.
//
// Stages: Φ1 new import one-to-one (buttons, hours, «όλες με ανταλλαγή», prefill from the last order + undo, the body)
// · Φ2 import with VS, 2 loadings / 4 deliveries (VS per point, exchange per point, the Veroia stop = the VS points)
// · Φ3 export CHEP (exchange locked «Όχι», VS on the loadings) · edit of a stored order (hours / exchange / VS drawn
// back; an unchanged save names no new label; a cleared hour is sent as null) · «διόρθωση…» (a number of a loading
// point, a number over the stop refused) · «σε απόθεμα» in the ΠΑΡΑΔΟΣΗ head.
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '../..');
const req = m => require(require.resolve(m, { paths: [process.cwd(), ROOT] }));
const { chromium } = req('playwright');
const { preparePage, gotoPage } = require(path.join(__dirname, 'auth.js'));

const [,, BASE_URL, OUT_DIR] = process.argv;
if (!BASE_URL || !OUT_DIR) { console.error('usage: node intl-form-rig.js <baseURL> <outDir>'); process.exit(2); }
fs.mkdirSync(OUT_DIR, { recursive: true });
const shot = n => path.join(OUT_DIR, 'intl-form-' + n + '.png');

const ORDERS = 'tblgHlNmLBH3JTdIM', STOPS = 'tblaeY5QOHAS1gyE8', LOCATIONS = 'tblxu8DRfTQOFRCzS', CLIENTS = 'tblFWKAQVUzAM8mCE';
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = ymd(new Date());
const LOC = (id, Name, City, Country) => ({ id, fields: { Name, City, Country } });
const LOCS = [LOC('recLA', 'Farm A', 'Stubenberg', 'AT'), LOC('recLB', 'Farm B', 'Ried', 'AT'), LOC('recG1', 'Market One', 'Thessaloniki', 'GR'),
  LOC('recG2', 'Fresh Two', 'Larisa', 'GR'), LOC('recG3', 'Foods Three', 'Athens', 'GR'), LOC('recG4', 'Bakery Four', 'Athens', 'GR'),
  LOC('recSE', 'Buyer Five', 'Helsingborg', 'SE')];
const CLIENTS_FX = [{ id: 'recCliA', fields: { 'Company Name': 'Πελάτης Α', City: 'Wien', Country: 'AT' } }];
const st = (id, parent, type, n, loc, pal, dt, extra) => ({ id, fields: Object.assign({ 'Parent Order': [parent], 'Stop Type': type, 'Stop Number': n, Location: [loc], Pallets: pal, DateTime: dt }, extra || {}) });
function fixtures() {
  return {
    orders: [
      // the client's last order: the prefill source (Φ1 «από #598»)
      { id: 'recLast', fields: { 'Order No': 598, Direction: 'Import', Type: 'International', Status: 'Delivered', Client: ['recCliA'], 'Loading DateTime': addDays(TODAY, -10), 'Temperature °C': 4, 'Refrigerator Mode': 'Continuous', 'Pallet Type': 'EUR', 'ORDER STOPS': ['recS0'] } },
      // a stored VS import: hours on one stop, exchange 0 on one, one delivery direct
      { id: 'recEd', fields: { 'Order No': 612, Direction: 'Import', Type: 'International', Status: 'Pending', Client: ['recCliA'], Price: 3100, Goods: 'Μήλα', 'Temperature °C': 2,
        'Refrigerator Mode': 'Continuous', 'Pallet Type': 'EUR', 'Pallet Exchange': true, 'Veroia Switch': true, 'VS CD Date': addDays(TODAY, 3),
        'Loading DateTime': addDays(TODAY, 1), 'Delivery DateTime': addDays(TODAY, 4), 'Temp Per CMR': false, 'ORDER STOPS': ['recE1', 'recE2', 'recE3', 'recEc'] } },
    ],
    stops: [
      st('recS0', 'recLast', 'Loading', 1, 'recLA', 33, addDays(TODAY, -10)),
      st('recE1', 'recEd', 'Loading', 1, 'recLA', 30, addDays(TODAY, 1)),
      st('recE2', 'recEd', 'Unloading', 1, 'recG1', 12, addDays(TODAY, 4), { 'Time From': '06:00', 'Time To': '08:00', 'Pallets Exchanged': 0, 'Via Hub': false }),
      st('recE3', 'recEd', 'Unloading', 2, 'recG3', 18, addDays(TODAY, 4)),
      st('recEc', 'recEd', 'Cross-dock', 1, 'recJucKOhC1zh4IP3', 18, addDays(TODAY, 3)),
    ],
  };
}

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.log('  ✗ ' + m); } };

async function newPage(browser) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 1000 }, locale: 'el-GR', timezoneId: 'Europe/Athens' });
  const page = await ctx.newPage();
  const cap = { orderPosts: [], orderPatches: [], stopCreates: [], stopPatches: [], errors: [], fx: fixtures(), seq: 0, dialogs: [] };
  page.on('pageerror', e => cap.errors.push(String(e)));
  page.on('dialog', d => { cap.dialogs.push(d.message()); d.accept(); });
  await preparePage(page, 'dispatcher');
  const json = (r, body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(/\/tbl[A-Za-z0-9]{14}(\?|\/|$)/, async r => {
    const q = r.request(), m = q.method();
    if (m === 'GET') return json(r, q.url().match(/\/rec[A-Za-z0-9]+(\?|$)/) ? { id: 'x', fields: {} } : { records: [] });
    if (m === 'DELETE') return json(r, { deleted: true });
    const b = q.postDataJSON() || {};
    if (b.records) return json(r, { records: b.records.map((x, i) => ({ id: 'recStub' + (++cap.seq) + i, fields: x.fields })) });
    return json(r, { id: 'recStub' + (++cap.seq), fields: b.fields || {} });
  });
  for (const p of ['**/pallets/**', '**/costs/**', '**/plan/**']) await page.route(p, r => json(r, { records: [] }));
  await page.route(`**/${LOCATIONS}**`, r => json(r, { records: LOCS }));
  await page.route(`**/${CLIENTS}**`, r => {
    const one = r.request().url().match(/\/(rec[A-Za-z0-9]+)(\?|$)/);
    return json(r, one ? (CLIENTS_FX.find(c => c.id === one[1]) || { id: one[1], fields: {} }) : { records: CLIENTS_FX });
  });
  await page.route(`**/${STOPS}**`, r => {
    const q = r.request(), m = q.method();
    if (m === 'GET') {
      const u = decodeURIComponent(q.url());
      return json(r, { records: cap.fx.stops.filter(s => u.includes('"' + s.id + '"')) });
    }
    if (m === 'DELETE') return json(r, { deleted: true });
    const b = q.postDataJSON() || {};
    const recs = b.records || [{ id: (q.url().match(/\/(rec[A-Za-z0-9]+)/) || [])[1], fields: b.fields }];
    (m === 'POST' ? cap.stopCreates : cap.stopPatches).push(...recs.map(x => Object.assign({ id: x.id }, x.fields)));
    return json(r, { records: recs.map((x, i) => ({ id: x.id || 'recNS' + (++cap.seq) + i, fields: x.fields })) });
  });
  await page.route(`**/${ORDERS}**`, async r => {
    const q = r.request(), m = q.method(), url = decodeURIComponent(q.url());
    const one = url.match(/\/(rec[A-Za-z0-9]+)(\?|$)/);
    if (m === 'GET') {
      if (one) return json(r, cap.fx.orders.find(o => o.id === one[1]) || { id: one[1], fields: { 'ORDER STOPS': [] } });
      const f = (url.match(/filterByFormula=([^&]*)/) || [])[1] || '';
      if (f.includes('{Reference}')) return json(r, { records: [] });
      if (f.includes('ARRAYJOIN({Client}')) { cap.lastReads = (cap.lastReads || 0) + 1; return json(r, { records: cap.fx.orders.filter(o => o.id === 'recLast') }); }
      return json(r, { records: [] });
    }
    const b = q.postDataJSON() || {};
    if (m === 'POST') {
      cap.orderPosts.push(b.fields);
      const id = 'recNew' + cap.orderPosts.length;
      cap.fx.orders.push({ id, fields: Object.assign({ 'ORDER STOPS': [] }, b.fields) });
      return json(r, { id, fields: b.fields });
    }
    cap.orderPatches.push(b.fields);
    return json(r, { id: one && one[1], fields: b.fields });
  });
  page._cap = cap;
  return page;
}
const seg = (page, id, v) => page.click(`#${id}Seg button[data-v="${v}"]`);
const pick = (page, id, rec, label) => page.evaluate(([i, r, l]) => fhPickLinked(i, r, l), [id, rec, label]);
const sumText = page => page.$eval('#oiBalance', e => e.innerText.replace(/\s+/g, ' ').trim());
const modalClip = page => page.$eval('#modal', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
async function openNew(page) {
  await page.evaluate(() => openIntlCreate());
  await page.waitForSelector('#oi2', { timeout: 15000 });
}
async function save(page, cap) {
  const n0 = cap.orderPosts.length + cap.orderPatches.length;
  await page.click('#btnSubmit');
  for (let k = 0; k < 30 && cap.orderPosts.length + cap.orderPatches.length === n0; k++) await page.waitForTimeout(300);
  await page.waitForTimeout(1500);
}

async function run() {
  const browser = await chromium.launch();
  const page = await newPage(browser);
  const cap = page._cap;
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForFunction(() => typeof openIntlCreate === 'function', null, { timeout: 20000 });

  console.log('\nΦ1 · new import, one loading, one delivery');
  await openNew(page);
  ok(await page.$eval('#modalTitle', e => e.innerText.includes('Νέα παραγγελία') && e.innerText.includes('Από PDF')), 'head: «Νέα παραγγελία» + «Από PDF»');
  ok(await page.$eval('#f_DirectionSeg', e => e.closest('#oi2') !== null), 'the direction is inside the form, not in the head (round 4)');
  await seg(page, 'f_Direction', 'Import');
  await pick(page, 'client', 'recCliA', 'Πελάτης Α');
  await page.dispatchEvent('#ls_client', 'focusout');
  await page.waitForSelector('#oiPrefill:not([hidden])', { timeout: 8000 }).catch(() => {});
  const pre = await page.evaluate(() => ({ chip: document.getElementById('oiPrefill').innerText, loc: document.getElementById('lv_l_1').value,
    temp: document.getElementById('f_Temp').value, reefer: document.getElementById('f_ReeferMode').value, pt: document.getElementById('f_PalletType').value }));
  ok(/από #598/.test(pre.chip) && pre.loc === 'recLA' && pre.temp === '4' && pre.reefer === 'Continuous' && pre.pt === 'EUR', 'prefill from the last order: point, °C, reefer, pallet + «από #598» — ' + JSON.stringify(pre));
  await page.screenshot({ path: shot('F1-prefill'), clip: await modalClip(page) });
  await page.click('#oiPrefill .oi2-link');
  const und = await page.evaluate(() => ({ loc: document.getElementById('lv_l_1').value, temp: document.getElementById('f_Temp').value, reefer: document.getElementById('f_ReeferMode').value, hidden: document.getElementById('oiPrefill').hidden }));
  ok(!und.loc && !und.temp && !und.reefer && und.hidden, '«αναίρεση» empties what the prefill filled — ' + JSON.stringify(und));
  await page.dispatchEvent('#ls_client', 'focusout');   // same client: no second fill
  ok((cap.lastReads || 0) === 1, 'the same client is not read twice');
  await page.fill('#f_Reference', '4127'); await page.fill('#f_Price', '2450'); await page.fill('#f_Goods', 'Φρέσκα λαχανικά');
  await page.fill('#f_GrossWeight', '19800'); await page.fill('#f_Temp', '4');
  await seg(page, 'f_ReeferMode', 'Continuous'); await seg(page, 'f_PalletType', 'EUR');
  await page.click('#f_PalletExch label:has(input[value="yes"])');
  await pick(page, 'l_1', 'recLA', 'Farm A'); await page.fill('#dt_l_1', addDays(TODAY, 1)); await page.fill('#pal_l_1', '33');
  await pick(page, 'u_1', 'recG3', 'Foods Three'); await page.fill('#dt_u_1', addDays(TODAY, 3)); await page.fill('#pal_u_1', '33');
  await page.click('#hrs_u_1 .oi2-hrs-all');
  await page.fill('#tf_u_1', '600'); await page.dispatchEvent('#tf_u_1', 'blur');
  await page.fill('#tt_u_1', '10.00'); await page.dispatchEvent('#tt_u_1', 'blur');
  ok(await page.$eval('#tf_u_1', e => e.value) === '06:00' && await page.$eval('#tt_u_1', e => e.value) === '10:00', 'a typed hour reads as the national forms: «600» → 06:00, «10.00» → 10:00');
  await page.evaluate(() => _oiBalanceUpdate());
  const s1 = await sumText(page);
  ok(/33 → 33 παλέτες/.test(s1) && /όλες με ανταλλαγή/.test(s1) && /διόρθωση…/.test(s1), 'summary: «33 → 33 παλέτες · όλες με ανταλλαγή · διόρθωση…» — ' + s1);
  ok(await page.$eval('#oi2', e => !e.classList.contains('ex-col')), 'one-to-one: no exchange column (the whole load)');
  ok(await page.$eval('#oi2sec_u', e => e.classList.contains('vs-col')), 'import: the VS column is on the deliveries');
  await page.screenshot({ path: shot('F1'), clip: await modalClip(page) });
  await save(page, cap);
  const o1 = cap.orderPosts[0] || {};
  ok(o1.Direction === 'Import' && o1['Pallet Exchange'] === true && o1['Refrigerator Mode'] === 'Continuous' && o1['Pallet Type'] === 'EUR' && o1['Veroia Switch'] === false && o1.Price === 2450,
    'ORDERS POST: Import, exchange yes, Continuous, EUR, no VS, price — ' + JSON.stringify({ d: o1.Direction, pe: o1['Pallet Exchange'], vs: o1['Veroia Switch'] }));
  const u1 = cap.stopCreates.find(s => s['Stop Type'] === 'Unloading'), l1 = cap.stopCreates.find(s => s['Stop Type'] === 'Loading');
  ok(u1 && u1['Time From'] === '06:00' && u1['Time To'] === '10:00', 'ORDER STOPS: the delivery carries 06:00 – 10:00');
  ok(l1 && !('Time From' in l1) && !('Via Hub' in l1) && !('Pallets Exchanged' in l1), 'a new stop with nothing to say names no new label (all day, every pallet, no VS)');
  ok(!cap.stopCreates.some(s => s['Stop Type'] === 'Cross-dock'), 'no VS = no Veroia stop');

  console.log('\nΦ2 · import with VS, 2 loadings, 4 deliveries');
  cap.stopCreates.length = 0;
  await openNew(page);
  await seg(page, 'f_Direction', 'Import');
  await pick(page, 'client', 'recCliA', 'Πελάτης Α');
  await page.fill('#f_Price', '3100'); await page.fill('#f_Temp', '2'); await page.fill('#f_Goods', 'Μήλα, αχλάδια');
  await seg(page, 'f_ReeferMode', 'Continuous'); await seg(page, 'f_PalletType', 'EUR');
  await page.click('#f_PalletExch label:has(input[value="yes"])');
  await page.click('#btn_addL');
  for (const i of [2, 3, 4]) await page.click('#btn_addU');
  const L = [['recLA', 'Farm A', 30], ['recLB', 'Farm B', 18]], U = [['recG1', 'Market One', 8], ['recG2', 'Fresh Two', 10], ['recG3', 'Foods Three', 15], ['recG4', 'Bakery Four', 15]];
  for (const [i, [r, n, p]] of L.entries()) { await pick(page, 'l_' + (i + 1), r, n); await page.fill(`#dt_l_${i + 1}`, addDays(TODAY, 1)); await page.fill(`#pal_l_${i + 1}`, String(p)); }
  for (const [i, [r, n, p]] of U.entries()) { await pick(page, 'u_' + (i + 1), r, n); await page.fill(`#dt_u_${i + 1}`, addDays(TODAY, 3)); await page.fill(`#pal_u_${i + 1}`, String(p)); }
  await page.click('#hrs_l_2 .oi2-hrs-all'); await page.fill('#tf_l_2', '13:00'); await page.fill('#tt_l_2', '15:00');
  ok(await page.$eval('#oi2', e => e.classList.contains('ex-col')), '«Ναι» with 2+ points: the exchange column shows');
  ok(await page.evaluate(() => [...document.querySelectorAll('.oi2-c-ex input[type=checkbox]')].every(b => b.checked)), '«Ναι» ticked every point, loading and delivery');
  await page.check('#f_VeroiaSwitch');
  await page.uncheck('#vh_u_1');
  ok(await page.$eval('#f_VeroiaSwitch', e => e.checked && e.indeterminate), 'VS head: «–» with 3 of 4');
  for (const id of ['ex_l_2', 'ex_u_1', 'ex_u_2']) await page.uncheck('#' + id);
  const s2 = await sumText(page);
  ok(/48 → 48 παλέτες/.test(s2) && /ανταλλαγή: φόρτωση 30 · παράδοση 30 ✓/.test(s2) && /Βέροια .* · 40 παλέτες/.test(s2) && !/διόρθωση/.test(s2), 'summary: 48 → 48 · ανταλλαγή 30 / 30 ✓ · Βέροια … · 40 παλέτες — ' + s2);
  await page.uncheck('#ex_u_3');
  ok(/ανταλλαγή: φόρτωση 30 · παράδοση 15/.test(await sumText(page)) && await page.$eval('#oiBalance .warn', e => /ανταλλαγή/.test(e.innerText)).catch(() => false), 'β2: 30 ≠ 15 is amber, not a refusal');
  await page.check('#ex_u_3');
  await page.screenshot({ path: shot('F2'), clip: await modalClip(page) });
  await save(page, cap);
  const o2 = cap.orderPosts[1] || {};
  ok(o2['Veroia Switch'] === true, 'ORDERS POST: Veroia Switch true (some point ticked)');
  const byLoc = id => cap.stopCreates.find(s => (s.Location || [])[0] === id) || {};
  ok(byLoc('recG1')['Via Hub'] === false && !('Via Hub' in byLoc('recG2')) && !('Via Hub' in byLoc('recLA')), 'Via Hub: false on the direct delivery only (ticked = follows = nothing sent; loadings none)');
  ok(byLoc('recLB')['Pallets Exchanged'] === 0 && byLoc('recG1')['Pallets Exchanged'] === 0 && byLoc('recG2')['Pallets Exchanged'] === 0
    && !('Pallets Exchanged' in byLoc('recLA')) && !('Pallets Exchanged' in byLoc('recG3')), 'Pallets Exchanged: 0 on the three unticked, nothing on the ticked');
  ok(byLoc('recLB')['Time From'] === '13:00' && byLoc('recLB')['Time To'] === '15:00', 'the second loading carries 13:00 – 15:00');
  const cd = cap.stopCreates.find(s => s['Stop Type'] === 'Cross-dock');
  ok(cd && cd.Pallets === 40, 'the Veroia stop = the VS points: 10 + 15 + 15 = 40 — ' + (cd && cd.Pallets));

  console.log('\nΦ3 · export CHEP, VS on the loadings');
  await openNew(page);
  await seg(page, 'f_Direction', 'Export');
  await seg(page, 'f_PalletType', 'CHEP');
  const lockPe = await page.evaluate(() => ({ locked: document.getElementById('f_PalletExch').classList.contains('locked'), no: peRead('f') === false }));
  ok(lockPe.locked && lockPe.no, 'CHEP: the exchange locks on «Όχι»');
  ok(await page.$eval('#oi2sec_l', e => e.classList.contains('vs-col')) && !!(await page.$('#oi2vsh_l #f_VeroiaSwitch')), 'export: the VS column and its head move to the loadings');
  await page.check('#f_TempCmr');
  ok(await page.$eval('#f_Temp', e => e.disabled), '«CMR»: °C greys out');
  ok(/χωρίς ανταλλαγή \(CHEP\)/.test(await sumText(page)), 'summary: «χωρίς ανταλλαγή (CHEP)»');
  await page.screenshot({ path: shot('F3'), clip: await modalClip(page) });
  await page.evaluate(() => closeModal());

  console.log('\nedit · a stored order');
  cap.stopPatches.length = 0;
  await page.evaluate(fx => { window.__rigFx = fx; }, cap.fx.orders.find(o => o.id === 'recEd').fields);
  await page.evaluate(() => openIntlEditWith('recEd', window.__rigFx));
  await page.waitForSelector('#oi2 #stoprow_u_2', { timeout: 15000 });
  const ed = await page.evaluate(() => ({ title: document.getElementById('modalTitle').innerText, open: document.getElementById('hrs_u_1').classList.contains('open'),
    tf: document.getElementById('tf_u_1').value, ex1: document.getElementById('ex_u_1').checked, ex2: document.getElementById('ex_u_2').checked,
    vh1: document.getElementById('vh_u_1').checked, vh2: document.getElementById('vh_u_2').checked, head: document.getElementById('f_VeroiaSwitch').indeterminate }));
  ok(/Παραγγελία #612/.test(ed.title) && /Stubenberg → Thessaloniki/.test(ed.title), 'head: «Παραγγελία #612 · Stubenberg → Thessaloniki · day» — ' + ed.title.replace(/\s+/g, ' '));
  ok(ed.open && ed.tf === '06:00' && !ed.ex1 && ed.ex2 && !ed.vh1 && ed.vh2 && ed.head, 'stored hours open, exchange 0 unticked, VS false unticked, head «–» — ' + JSON.stringify(ed));
  await page.screenshot({ path: shot('edit'), clip: await modalClip(page) });
  await save(page, cap);
  const newLabels = ['Time From', 'Time To', 'Via Hub', 'Pallets Exchanged'];
  ok(cap.stopPatches.length > 0 && cap.stopPatches.every(s => newLabels.every(k => !(k in s))), 'an unchanged save names none of the new labels (' + cap.stopPatches.length + ' stops patched)');
  cap.stopPatches.length = 0;
  await page.evaluate(() => openIntlEditWith('recEd', window.__rigFx));
  await page.waitForSelector('#oi2 #stoprow_u_2', { timeout: 15000 });
  await page.fill('#tf_u_1', ''); await page.fill('#tt_u_1', '');
  await page.check('#vh_u_1');
  await save(page, cap);
  const e2 = cap.stopPatches.find(s => s.id === 'recE2') || {};
  ok(e2['Time From'] === null && e2['Time To'] === null && e2['Via Hub'] === null && !('Pallets Exchanged' in e2), 'cleared hours go as null; VS ticked again goes as null (follows) — ' + JSON.stringify(e2));

  console.log('\n«διόρθωση…» · a number of a loading point');
  cap.stopCreates.length = 0;
  await openNew(page);
  await seg(page, 'f_Direction', 'Import');
  await pick(page, 'client', 'recCliA', 'Πελάτης Α');
  await page.fill('#f_Temp', '2'); await page.fill('#f_Price', '1000');
  await seg(page, 'f_ReeferMode', 'Continuous'); await seg(page, 'f_PalletType', 'EUR');
  await page.click('#f_PalletExch label:has(input[value="yes"])');
  await pick(page, 'l_1', 'recLA', 'Farm A'); await page.fill('#dt_l_1', addDays(TODAY, 1)); await page.fill('#pal_l_1', '30');
  await pick(page, 'u_1', 'recSE', 'Buyer Five'); await page.fill('#dt_u_1', addDays(TODAY, 3)); await page.fill('#pal_u_1', '30');
  await page.evaluate(() => _oiBalanceUpdate());
  await page.click('#oiBalance .oi2-link');
  ok(await page.$eval('#exn_l_1', e => getComputedStyle(e).display !== 'none'), '«διόρθωση…» opens one number per loading point');
  await page.fill('#exn_l_1', '40');
  const n0 = cap.orderPosts.length;
  await page.click('#btnSubmit'); await page.waitForTimeout(1500);
  ok(cap.orderPosts.length === n0, 'a number over the stop (40 of 30) is refused before anything is written');
  await page.fill('#exn_l_1', '10');
  await page.click('#hrs_u_1 .oi2-hrs-all'); await page.fill('#tf_u_1', '25:00');
  const n1 = cap.orderPosts.length;
  await page.click('#btnSubmit'); await page.waitForTimeout(1500);
  ok(cap.orderPosts.length === n1, 'an hour that is not ΩΩ:ΛΛ (25:00) is refused before anything is written');
  await page.fill('#tf_u_1', '');
  const s6 = await sumText(page);
  ok(/10 από 30 με ανταλλαγή/.test(s6) && /όλες ξανά/.test(s6) && !/λείπουν/.test(s6), 'summary (Φ4 β): «10 από 30 με ανταλλαγή · όλες ξανά» — ' + s6);
  await page.screenshot({ path: shot('fix'), clip: await modalClip(page) });
  await save(page, cap);
  const lf = cap.stopCreates.find(s => s['Stop Type'] === 'Loading') || {};
  ok(lf['Pallets Exchanged'] === 10, 'Pallets Exchanged 10 on the loading — ' + lf['Pallets Exchanged']);

  console.log('\n«σε απόθεμα»');
  await openNew(page);
  const lotLbl = await page.$eval('#oi2sec_u .oi2-sec', e => e.innerText).catch(() => '');
  const hasLot = !!(await page.$('#f_StockLot'));
  ok(!hasLot || /σε απόθεμα/.test(lotLbl), 'the lot tick reads «σε απόθεμα» in the ΠΑΡΑΔΟΣΗ head' + (hasLot ? '' : ' (stock lots off for this role: no tick)') + ' — ' + lotLbl.replace(/\s+/g, ' '));
  await page.evaluate(() => closeModal());

  ok(cap.errors.length === 0, 'no page error — ' + cap.errors.join(' | '));
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
