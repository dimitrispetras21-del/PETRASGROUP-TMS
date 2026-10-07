// Rig — print.html WhatsApp text (waBuild), Pantelis 7/10/2026:
//   (1) every stop WITH coordinates gets its own line «📍 *LAT, LNG*» — the
//       numbers alone, bare once WhatsApp hides the * markers — directly above
//       the unchanged maps link; a stop WITHOUT coordinates prints as before;
//       the Veroia cross-dock stop (export loading / import delivery, driver
//       and partner sheet) follows the same rule;
//   (2) every document's text ends with ONE «ℹ️ automated message» line, GR on
//       the driver sheet, EN on the partner sheet, after the ☎️ office line;
//   (3) nothing else moves: the text equals the reference revision's text with
//       exactly (1) and (2) inserted, and the paper (#doc) is identical.
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
const STOPS = [
  stop('recS1', 'Loading', 1, 'recLocA', '2026-10-08T07:00:00'), stop('recS2', 'Unloading', 2, 'recLocN', '2026-10-10'),
  stop('recS3', 'Loading', 1, 'recLocA', '2026-10-08'), stop('recS4', 'Unloading', 2, 'recLocB', '2026-10-11T09:00:00'),
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
    order('recOrdV', ['recS3', 'recS4'], { 'Veroia Switch': true, 'Veroia Cross-dock': ['recJucKOhC1zh4IP3'], 'Cross-dock Date': '2026-10-09' })],
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
  const out = await page.evaluate(() => ({ text: document.getElementById('doc').innerText, wa: (typeof _waArr !== 'undefined' ? _waArr : []).slice() }));
  await ctx.close();
  return Object.assign(out, { errors });
}

// The reference text with exactly the two additions: a coordinates line above
// each maps link, and the closing line at the end of each document.
const expectFromBase = (msg, foot) => msg.replace(/^📍 https:\/\/maps\.google\.com\/\?q=([^,\n]+),([^\n]+)$/gm, '📍 *$1, $2*\n$&') + '\n\n' + foot;
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
    const want = a0.wa.map(m => expectFromBase(m, FOOT[sheet]));
    const same = JSON.stringify(a.wa) === JSON.stringify(want);
    ok(same, '(3) text = reference + exactly the two additions' + (same ? '' : ' — got ' + JSON.stringify(a.wa[0]).slice(0, 400)));
    ok(a.text === a0.text && /Συντ\/νες: |Coords: /.test(a.text), '(3) the paper is identical to ' + BASE_REV + ' and already prints the coordinates');
  }
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
