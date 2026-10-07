// Rig — print.html WhatsApp text (waBuild), Pantelis 7/10/2026:
//   (1) every stop WITH coordinates gets its own line «📍 *LAT, LNG*» — the
//       numbers alone, bare once WhatsApp hides the * markers — directly above
//       the unchanged maps link; a stop WITHOUT coordinates prints as before;
//       the Veroia cross-dock stop (export loading / import delivery, driver
//       and partner sheet) follows the same rule;
//   (2) every document's text ends with ONE «ℹ️ automated message» line, GR on
//       the driver sheet, EN on the partner sheet, after the ☎️ office line;
//   (3) nothing else moves: the text equals the reference revision's text with
//       exactly (1), (2) and (4b) inserted, and the paper (#doc) is identical
//       apart from the (4b) line;
//   (4) «Κατά CMR» (owner 7/10, Παντελής — feat/temp-per-cmr-front):
//       (4a) an order with 'Temp Per CMR' prints NO number anywhere — WhatsApp
//            «🌡 *Θερμοκρασία: όπως γράφει το CMR · <mode>*» (EN on the partner
//            sheet), the paper chip and the stop card «όπως γράφει το CMR»,
//            even with a figure left on the order and on its stops; a group
//            cover with one such member says «2°C / όπως γράφει το CMR»;
//       (4b) EVERY text carries «🌡 Τήρησε τη θερμοκρασία που γράφει το CMR.»
//            (EN «Keep the temperature stated on the CMR.») right before the
//            pallet-exchange line, number or not, and every document of the
//            paper (cover included) carries the same line once, under the chips.
// Backend fully stubbed; the page's clock is fixed. Run from the MAIN repo root
// (its node_modules), static server serving the worktree:
//   PW_BASE_URL=http://127.0.0.1:8991/.claude/worktrees/<dir>/ node <dir>/tests/critics/wa-text-rig.js
// PRINT_REV=<git rev> tests that revision's print.html instead of the working
// file; PRINT_BASE_REV (default 2fceaafd, main before this change) is the
// reference for (3). Exit 1 on any ✗.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8991/';
const REV = process.env.PRINT_REV || 'work';
const BASE_REV = process.env.PRINT_BASE_REV || '2fceaafd';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const T = { ORD: 'tblgHlNmLBH3JTdIM', PAR: 'tblLHl5m8bqONfhWv', TRK: 'tblEAPExIAjiA3asD', TRL: 'tblDcrqRJXzPrtYLm',
  DRV: 'tbl7UGmYhc2Y82pPs', LOC: 'tblxu8DRfTQOFRCzS', STP: 'tblaeY5QOHAS1gyE8' };
const FOOT = {
  driver: 'ℹ️ Αυτοματοποιημένο μήνυμα. Αν κάτι σας φαίνεται λάθος, επικοινωνήστε με το γραφείο.',
  partner: 'ℹ️ Automated message. If anything looks wrong, please contact the office.',
};
// (4) owner 7/10: the «keep the CMR temperature» line (4b) and the CMR wording (4a).
const KEEP = { driver: '🌡 Τήρησε τη θερμοκρασία που γράφει το CMR.', partner: '🌡 Keep the temperature stated on the CMR.' };
const CMRW = { driver: 'όπως γράφει το CMR', partner: 'as stated on the CMR' };
const CMRL = { driver: '🌡 *Θερμοκρασία: όπως γράφει το CMR', partner: '🌡 *Temperature: as stated on the CMR' };

const src = rev => rev === 'work' ? fs.readFileSync(path.join(ROOT, 'print.html'), 'utf8')
  : execSync('git -C ' + JSON.stringify(ROOT) + ' show ' + rev + ':print.html', { encoding: 'utf8' });
// Same page with the office numbers filled in (they ship empty), to prove the
// closing line comes AFTER the ☎️ line once it exists.
const withPhones = h => h.replace("const OFFICE_PHONE='';", "const OFFICE_PHONE='+30 23320 00000';")
  .replace("const EMERGENCY_PHONE='';", "const EMERGENCY_PHONE='+30 690 0000000';");

// Locations as the Worker serves them: Latitude/Longitude are JSON numbers.
// Generic names — the repo is public.
const loc = (id, Name, City, Country, lat, lng) => ({ id, fields: Object.assign({ Name, Address: 'Street 1', City, Country },
  lat != null ? { Latitude: lat, Longitude: lng } : {}) });
const LOCS = [
  loc('recLocA', 'Packhouse A', 'Naousa', 'GR', 40.6295123, 22.0681456),
  loc('recLocB', 'Depot B', 'Plattling', 'DE', 48.8871451, 12.6252663),
  loc('recLocN', 'Client N (no coords)', 'Arad', 'RO', null, null),
  loc('recJucKOhC1zh4IP3', 'Cross-dock V', 'Kopanos', 'GR', 40.6312, -0.5),   // negative: the sign stays glued to its number only
];
const stop = (id, type, n, l, dt) => ({ id, fields: { 'Stop Type': type, 'Stop Number': n, Location: [l], DateTime: dt, Pallets: 10 } });
const stopT = (id, type, n, l, dt, t) => { const x = stop(id, type, n, l, dt); x.fields.Temperature = t; return x; };
const STOPS = [
  stop('recS1', 'Loading', 1, 'recLocA', '2026-10-08T07:00:00'), stop('recS2', 'Unloading', 2, 'recLocN', '2026-10-10'),
  stop('recS3', 'Loading', 1, 'recLocA', '2026-10-08'), stop('recS4', 'Unloading', 2, 'recLocB', '2026-10-11T09:00:00'),
  // (4a) stops of a «κατά CMR» order that still carry their own figure — it must not print
  stopT('recS5', 'Loading', 1, 'recLocA', '2026-10-08T07:00:00', 5), stopT('recS6', 'Unloading', 2, 'recLocB', '2026-10-10', 5),
];
const order = (id, stops, extra) => ({ id, fields: Object.assign({
  'Order No': 400 + stops.length, Reference: 'REF-' + id.slice(-1), Goods: 'Apples', Notes: 'Gate 4',
  'Temperature °C': 2, 'Refrigerator Mode': 'Continuous', 'Total Pallets': 33, 'Pallet Type': 'EUR', 'Week Number': 41,
  'Pallet Exchange': true, Driver: ['recDrv'], Truck: ['recTrk'], Trailer: ['recTrl'], Partner: ['recPar'],
  'Partner Truck Plates': 'AB-1234', 'Loading DateTime': '2026-10-08T07:00:00', 'Delivery DateTime': '2026-10-10',
  'Loading Summary': 'Packhouse A, Naousa', 'Delivery Summary': 'Depot B, Plattling', 'ORDER STOPS': stops }, extra || {}) });
const FX = {
  LOCS, STOPS,
  ORDERS: [order('recOrdA', ['recS1', 'recS2']),
    order('recOrdV', ['recS3', 'recS4'], { 'Veroia Switch': true, 'Veroia Cross-dock': ['recJucKOhC1zh4IP3'], 'Cross-dock Date': '2026-10-09' }),
    // (4a) «κατά CMR» with a leftover 2 °C on the order (and 5 on its stops); one without a reefer mode
    order('recOrdC', ['recS5', 'recS6'], { 'Temp Per CMR': true }),
    order('recOrdD', ['recS5', 'recS6'], { 'Temp Per CMR': true, 'Refrigerator Mode': undefined, 'Order No': 499 }),
    order('recOrdC2', ['recS5', 'recS6'], { 'Temp Per CMR': true, 'Veroia Switch': true, 'Veroia Cross-dock': ['recJucKOhC1zh4IP3'], 'Cross-dock Date': '2026-10-09' })],
  PARTNERS: [{ id: 'recPar', fields: { 'Company Name': 'Carrier P' } }],
  DRIVERS: [{ id: 'recDrv', fields: { 'Full Name': 'Driver D' } }],
  TRUCKS: [{ id: 'recTrk', fields: { 'License Plate': 'TRK-1' } }],
  TRAILERS: [{ id: 'recTrl', fields: { 'License Plate': 'TRL-1' } }],
};
const CO = l => l.fields.Latitude + ', ' + l.fields.Longitude;   // the coordinates as typed into a GPS unit
const L = id => LOCS.find(x => x.id === id);

// [name, query, sheet, coordinates expected in the text, stop name printed WITHOUT coordinates]
const SHEETS = [
  ['driver · coords + none', 'orderId=recOrdA&leg=export&sheet=driver', 'driver', [CO(L('recLocA'))], 'Client N (no coords)'],
  ['partner · coords + none', 'orderId=recOrdA&leg=export&sheet=partner', 'partner', [CO(L('recLocA'))], 'Client N (no coords)'],
  ['driver · Veroia export', 'orderId=recOrdV&leg=export&sheet=driver', 'driver', [CO(L('recJucKOhC1zh4IP3')), CO(L('recLocB'))]],
  ['partner · Veroia export', 'orderId=recOrdV&leg=export&sheet=partner', 'partner', [CO(L('recJucKOhC1zh4IP3')), CO(L('recLocB'))]],
  ['driver · Veroia import', 'orderId=recOrdV&leg=import&sheet=driver', 'driver', [CO(L('recLocA')), CO(L('recJucKOhC1zh4IP3'))]],
  ['partner · Veroia import', 'orderId=recOrdV&leg=import&sheet=partner', 'partner', [CO(L('recLocA')), CO(L('recJucKOhC1zh4IP3'))]],
  ['driver · group of 2', 'orderIds=recOrdA,recOrdV&leg=export&sheet=driver', 'driver',
    [CO(L('recLocA')), CO(L('recJucKOhC1zh4IP3')), CO(L('recLocB'))], 'Client N (no coords)'],
];

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const J = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

async function render(browser, html, qs) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-07T10:00:00'));
  await page.addInitScript(() => { localStorage.setItem('tms_jwt', 'rig'); localStorage.setItem('tms_user', JSON.stringify({ name: 'Rig User' })); });
  const byTable = { [T.ORD]: FX.ORDERS, [T.PAR]: FX.PARTNERS, [T.TRK]: FX.TRUCKS, [T.TRL]: FX.TRAILERS, [T.DRV]: FX.DRIVERS, [T.LOC]: FX.LOCS, [T.STP]: FX.STOPS };
  await page.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname === HOST) {
      const m = u.pathname.match(/\/v0\/[^/]+\/([^/]+)(?:\/([^/]+))?$/);
      if (!m) return J(r, {});
      const rows = byTable[m[1]] || [];
      if (m[2]) return J(r, rows.find(x => x.id === m[2]) || {});
      const ids = (u.searchParams.get('filterByFormula') || '').match(/rec[A-Za-z0-9]+/g);
      return J(r, { records: ids ? rows.filter(x => ids.includes(x.id)) : rows });
    }
    if (u.pathname.endsWith('/print.html')) return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return r.continue();
    return r.abort();   // fonts, QR images: not part of the text
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + 'print.html?' + qs + '&noprint=1');
  await page.waitForFunction(() => document.getElementById('doc').style.display === 'block', null, { timeout: 15000 });
  const out = await page.evaluate(() => {
    const doc = document.getElementById('doc');
    // (4b) the paper line is read, then set aside: «text» stays comparable with
    // the reference revision, which predates it. «full» keeps it.
    const full = doc.innerText, keep = [...doc.querySelectorAll('.cmr-keep')].map(e => e.innerText);
    const docs = doc.querySelectorAll('.p-doc').length;
    const chips = [...doc.querySelectorAll('.chip.temp .v')].map(e => e.innerText);
    const cardTemps = [...doc.querySelectorAll('.stop .f')].filter(e => /^(Θερμοκρασία|Temperature)/.test(e.innerText)).map(e => e.innerText);
    doc.querySelectorAll('.cmr-keep').forEach(e => e.remove());
    return { text: doc.innerText, full, keep, docs, chips, cardTemps, wa: (typeof _waArr !== 'undefined' ? _waArr : []).slice() };
  });
  await ctx.close();
  return Object.assign(out, { errors });
}

// The reference text with exactly the three additions: a coordinates line above
// each maps link, the (4b) CMR line right before the pallet-exchange line, and
// the closing line at the end of each document.
const expectFromBase = (msg, foot, keep) => msg.replace(/^📍 https:\/\/maps\.google\.com\/\?q=([^,\n]+),([^\n]+)$/gm, '📍 *$1, $2*\n$&')
  .replace(/^🔁 /m, keep + '\n🔁 ') + '\n\n' + foot;
// The stop block (header line to the blank line) that names this place.
const blockOf = (msg, name) => (msg.split('\n\n').find(b => b.split('\n')[1] === name) || '');

(async () => {
  const browser = await chromium.launch();
  const html = src(REV), baseHtml = src(BASE_REV);
  console.log('print.html under test: ' + REV + ' · reference: ' + BASE_REV + ' · ' + BASE);
  for (const [name, qs, sheet, coords, noCoordsName] of SHEETS) {
    console.log('— ' + name);
    const a = await render(browser, html, qs), a0 = await render(browser, baseHtml, qs);
    ok(!a.errors.length && !a0.errors.length, 'no page error' + (a.errors.length ? ': ' + a.errors[0] : ''));
    ok(a.wa.length > 0 && a.wa.length === a0.wa.length, 'one WhatsApp text per document (' + a.wa.length + ')');
    const all = a.wa.join('\n');
    // (1) the coordinates
    for (const c of coords) {
      const i = all.split('\n').indexOf('📍 *' + c + '*');
      const next = all.split('\n')[i + 1];
      ok(i >= 0, '(1) own coordinates line «📍 *' + c + '*»');
      ok(next === '📍 https://maps.google.com/?q=' + c.replace(', ', ','), '(1) maps link unchanged on the next line — ' + JSON.stringify(next));
    }
    const coLines = all.split('\n').filter(l => /^📍 \*/.test(l));
    ok(coLines.length === coords.length, '(1) one coordinates line per stop with coordinates (' + coLines.length + '/' + coords.length + ')');
    // With the WhatsApp markers hidden the line is the pin, a space, and two
    // bare numbers split by «, » — nothing glued to a number.
    ok(coLines.every(l => /^📍 -?\d+(\.\d+)?, -?\d+(\.\d+)?$/.test(l.replace(/\*/g, ''))), '(1) the numbers stand alone once bold is rendered');
    if (noCoordsName) {
      for (const m of a.wa.filter(m => blockOf(m, noCoordsName))) {
        const b = blockOf(m, noCoordsName), b0 = blockOf(a0.wa[a.wa.indexOf(m)], noCoordsName);
        ok(!/📍/.test(b) && b === b0, '(1) the stop without coordinates prints as before — ' + JSON.stringify(b));
      }
    }
    // (2) the closing line
    for (const m of a.wa) {
      const ls = m.split('\n');
      ok(ls[ls.length - 1] === FOOT[sheet] && ls[ls.length - 2] === '', '(2) ends with a blank line + «' + FOOT[sheet] + '»');
      ok(ls.filter(l => /^ℹ️/.test(l)).length === 1, '(2) the closing line appears once per document');
      ok(!m.includes(FOOT[sheet === 'driver' ? 'partner' : 'driver']), '(2) no closing line of the other language');
    }
    // (3) nothing else moved
    const want = a0.wa.map(m => expectFromBase(m, FOOT[sheet], KEEP[sheet]));
    const same = JSON.stringify(a.wa) === JSON.stringify(want);
    ok(same, '(3) text = reference + exactly the three additions' + (same ? '' : ' — got ' + JSON.stringify(a.wa[0]).slice(0, 400)));
    ok(a.text === a0.text && /Συντ\/νες: |Coords: /.test(a.text), '(3) the paper (without the (4b) line) is identical to ' + BASE_REV + ' and already prints the coordinates');
    // (4b) on a numbered order: the line follows the cargo line with its number, in the sheet's language
    for (const m of a.wa) {
      const ls = m.split('\n'), k = ls.indexOf(KEEP[sheet]);
      ok(k > 0 && ls.filter(l => l === KEEP[sheet]).length === 1 && /^🔁 /.test(ls[k + 1]) && /🌡 \*2°C Continuous\*$/.test(ls[k - 1]),
        '(4b) «' + KEEP[sheet] + '» once, after the cargo line with the number, before 🔁 — ' + JSON.stringify(ls.slice(Math.max(0, k - 1), k + 2)));
      ok(!m.includes(KEEP[sheet === 'driver' ? 'partner' : 'driver']), '(4b) no CMR line of the other language');
    }
    ok(a.docs >= 1 && a.keep.length === a.docs && a.keep.every(t => t === KEEP[sheet]), '(4b) the paper carries the CMR line once per document (' + a.keep.length + '/' + a.docs + ') — ' + JSON.stringify(a.keep));
  }
  // (4a) «κατά CMR» — no reference comparison (the reference has no such order).
  const CMR_SHEETS = [
    ['driver · κατά CMR', 'orderId=recOrdC&leg=export&sheet=driver', 'driver', ' · Continuous'],
    ['partner · κατά CMR', 'orderId=recOrdC&leg=export&sheet=partner', 'partner', ' · Continuous'],
    ['driver · κατά CMR, no reefer mode', 'orderId=recOrdD&leg=export&sheet=driver', 'driver', ''],
    ['partner · κατά CMR + Veroia import', 'orderId=recOrdC2&leg=import&sheet=partner', 'partner', ' · Continuous'],
  ];
  for (const [name, qs, sheet, mode] of CMR_SHEETS) {
    console.log('— ' + name);
    const c = await render(browser, html, qs);
    ok(!c.errors.length, 'no page error' + (c.errors.length ? ': ' + c.errors[0] : ''));
    const m = c.wa[0] || '', ls = m.split('\n'), i = ls.indexOf(CMRL[sheet] + mode + '*');
    ok(c.wa.length === 1 && i > 0, '(4a) own line «' + CMRL[sheet] + mode + '*» — ' + JSON.stringify(ls.filter(l => /🌡/.test(l))));
    ok(ls[i + 1] === KEEP[sheet] && /^🔁 /.test(ls[i + 2]), '(4a/4b) then «' + KEEP[sheet] + '», then 🔁 — ' + JSON.stringify(ls.slice(i, i + 3)));
    ok(/^📦 /.test(ls[i - 1]) && !/🌡/.test(ls[i - 1]), '(4a) the cargo line carries no temperature — ' + JSON.stringify(ls[i - 1]));
    ok(!/°C/.test(m), '(4a) no number in the WhatsApp text (the leftover 2 °C / 5 °C stay out)');
    ok(!/°C/.test(c.full), '(4a) no number anywhere on the paper');
    ok(c.chips.length === 1 && c.chips[0].startsWith(CMRW[sheet]) && (!mode || c.chips[0].includes('Continuous')),
      '(4a) the temperature chip says «' + CMRW[sheet] + '» (+ mode) — ' + JSON.stringify(c.chips));
    ok(c.cardTemps.length >= 1 && c.cardTemps.every(t => t.endsWith(CMRW[sheet])), '(4a) the stop card(s) say «' + CMRW[sheet] + '» — ' + JSON.stringify(c.cardTemps));
    ok(c.keep.length === 1 && c.keep[0] === KEEP[sheet], '(4b) the paper line once — ' + JSON.stringify(c.keep));
  }
  console.log('— driver · group: numbered + κατά CMR');
  const g = await render(browser, html, 'orderIds=recOrdA,recOrdC&leg=export&sheet=driver');
  ok(!g.errors.length, 'no page error' + (g.errors.length ? ': ' + g.errors[0] : ''));
  ok(g.chips[0] === '2°C / ' + CMRW.driver, '(4a) cover chip «2°C / ' + CMRW.driver + '» — ' + JSON.stringify(g.chips));
  ok(g.docs === 3 && g.keep.length === 3 && g.keep.every(t => t === KEEP.driver), '(4b) cover + 2 documents, the CMR line on each (' + g.keep.length + '/' + g.docs + ')');
  ok(g.wa.length === 2 && g.wa.every(m => m.split('\n').filter(l => l === KEEP.driver).length === 1), '(4b) both WhatsApp texts carry the line once');
  ok(/🌡 \*2°C Continuous\*/.test(g.wa[0]) && !g.wa[0].includes(CMRL.driver) && g.wa[1].includes(CMRL.driver + ' · Continuous*') && !/°C/.test(g.wa[1]),
    '(4a) the numbered order keeps its number, the CMR order says CMR — ' + JSON.stringify(g.wa.map(m => m.split('\n').filter(l => /🌡/.test(l)))));

  // (2) with the office numbers filled in: ☎️, a blank line, then the closing line.
  console.log('— driver · office phones filled in');
  const p = await render(browser, withPhones(html), 'orderId=recOrdA&leg=export&sheet=driver');
  const pl = (p.wa[0] || '').split('\n');
  ok(!p.errors.length, 'no page error' + (p.errors.length ? ': ' + p.errors[0] : ''));
  ok(/^☎️ /.test(pl[pl.length - 3]) && pl[pl.length - 2] === '' && pl[pl.length - 1] === FOOT.driver,
    '(2) closing line comes after the ☎️ office line — ' + JSON.stringify(pl.slice(-3)));
  await browser.close();
  console.log('\n' + pass + ' ✓ · ' + fail + ' ✗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
