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
//   (5) group route (owner 7/10, IAB4166 — feat/group-route-message): a group
//       is ONE WhatsApp text — header + driver/vehicle once, «ΦΟΡΤΩΣΕΙΣ» 1..N
//       then «ΠΑΡΑΔΟΣΕΙΣ» 1..M, each stop tagged «· #<order>», a cargo block
//       per order, the CMR / ☎️ / closing lines once. IMPORT: pickups in the
//       dispatcher's order, drops by date; EXPORT: drops in the dispatcher's
//       order, pickups by date (ties: dispatcher order, then stop sequence).
//       The paper cover prints the SAME sequence and numbers (route, sections,
//       delivery sequence); copyWA, the share menu's «Αντιγραφή κειμένου» and
//       the Worker's /print/pdf?format=text expression all give that one text;
//   (6) single orders: text AND paper byte-for-byte equal to PRINT_SINGLE_REV
//       (default 6849a9b4, the branch base) — the group change touches no
//       single document, apart from the corrections of (7);
//   (7) review 7/10 (NO_GO findings 3–6, coordinator decisions):
//       (7a) the Veroia stop is dated by the order's Cross-dock Date — the date
//            its sheet's Veroia card prints — and estimated (export Loading +1,
//            import Delivery −1) only when that is empty, the day shifted on
//            the written date: the same «09/10/2026 07:00» in Athens and in New
//            York; text, cover and the order's own sheet agree. A single text
//            changes only where the real date differs from the estimate;
//       (7b) a split leg (no ORDER STOPS, no summaries) gets its flat-column
//            places (flatLoc) in the text and on the cover, like its own sheet;
//       (7c) if the group text cannot be built, the per-order texts go out
//            instead (never an empty text), the page says so and the console
//            has the error; a local rig posts nothing to /app-errors. «Says
//            so» = SEEN: document.elementFromPoint at the note's centre is the
//            note, below the fixed toolbar, at 1200 and at 390 px wide — read
//            innerText alone passed while the bar covered the note (review
//            7/10); the locations' failure note shares the placement and the
//            same check;
//       (7d) stop numbers 8️⃣ 9️⃣ 🔟, then «#11» — never a number-less «▪️».
// Backend fully stubbed; the page's clock is fixed. Run from the MAIN repo root
// (its node_modules), static server serving the worktree:
//   PW_BASE_URL=http://127.0.0.1:8991/.claude/worktrees/<dir>/ node <dir>/tests/critics/wa-text-rig.js
// PRINT_REV=<git rev> tests that revision's print.html instead of the working
// file; PRINT_BASE_REV (default 2fceaafd, main before this change) is the
// reference for (3); PRINT_SINGLE_REV (default 6849a9b4) the reference for (6).
// RIG_SHOTS=<dir> also saves screenshots of the (7c) failure notes there.
// Exit 1 on any ✗.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8991/';
const REV = process.env.PRINT_REV || 'work';
const BASE_REV = process.env.PRINT_BASE_REV || '2fceaafd';
const SINGLE_REV = process.env.PRINT_SINGLE_REV || '6849a9b4';
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
  // (5) the IAB4166 shape (owner 7/10): two imports loading in Austria, one
  // delivering twice in Bulgaria, the other twice in Greece. Generic names.
  loc('recLocVo', 'Packer V', 'Voitsberg', 'AT', 47.0446, 15.1567),
  loc('recLocSt', 'Packer S', 'Stubenberg', 'AT', 47.2441, 15.8019),
  loc('recLocB1', 'Client B1', 'Sofia', 'BG', 42.6977, 23.3219),
  loc('recLocB2', 'Client B2', 'Plovdiv', 'BG', 42.1354, 24.7453),
  loc('recLocG1', 'Client G1', 'Thessaloniki', 'GR', 40.6401, 22.9444),
  loc('recLocG2', 'Client G2', 'Athens', 'GR', 37.9838, 23.7275),
];
const stop = (id, type, n, l, dt) => ({ id, fields: { 'Stop Type': type, 'Stop Number': n, Location: [l], DateTime: dt, Pallets: 10 } });
const stopT = (id, type, n, l, dt, t) => { const x = stop(id, type, n, l, dt); x.fields.Temperature = t; return x; };
const STOPS = [
  stop('recS1', 'Loading', 1, 'recLocA', '2026-10-08T07:00:00'), stop('recS2', 'Unloading', 2, 'recLocN', '2026-10-10'),
  stop('recS3', 'Loading', 1, 'recLocA', '2026-10-08'), stop('recS4', 'Unloading', 2, 'recLocB', '2026-10-11T09:00:00'),
  // (4a) stops of a «κατά CMR» order that still carry their own figure — it must not print
  stopT('recS5', 'Loading', 1, 'recLocA', '2026-10-08T07:00:00', 5), stopT('recS6', 'Unloading', 2, 'recLocB', '2026-10-10', 5),
  // (5) 461: loads 08/10 Voitsberg, delivers 12/10 GR ×2 · 463: loads 09/10 Stubenberg, delivers 11/10 BG ×2
  stop('recP461L', 'Loading', 1, 'recLocVo', '2026-10-08'), stop('recP461U1', 'Unloading', 2, 'recLocG1', '2026-10-12T08:00:00'),
  stop('recP461U2', 'Unloading', 3, 'recLocG2', '2026-10-12T14:00:00'),
  stop('recP463L', 'Loading', 1, 'recLocSt', '2026-10-09'), stop('recP463U1', 'Unloading', 2, 'recLocB1', '2026-10-11'),
  stop('recP463U2', 'Unloading', 3, 'recLocB2', '2026-10-11'),
  // (5) an export group of three, dispatcher order E1, E2, E3: E2 and E3 load the
  // same day (tie → dispatcher order), E1 a day later; E2 delivers BEFORE E1.
  stop('recPE1L', 'Loading', 1, 'recLocA', '2026-10-10'), stop('recPE1U', 'Unloading', 2, 'recLocB', '2026-10-13'),
  stop('recPE2L', 'Loading', 1, 'recLocG1', '2026-10-09'), stop('recPE2U', 'Unloading', 2, 'recLocN', '2026-10-12'),
  stop('recPE3L', 'Loading', 1, 'recLocG2', '2026-10-09'), stop('recPE3U', 'Unloading', 2, 'recLocB1', '2026-10-14'),
  // (7d) one loading and eleven drops
  stop('recPM0', 'Loading', 1, 'recLocA', '2026-10-09'),
  ...Array.from({ length: 11 }, (_, i) => stop('recPM' + (i + 1), 'Unloading', i + 2, ['recLocB', 'recLocG1', 'recLocG2', 'recLocB1', 'recLocB2'][i % 5], '2026-10-12')),
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
    order('recOrdC2', ['recS5', 'recS6'], { 'Temp Per CMR': true, 'Veroia Switch': true, 'Veroia Cross-dock': ['recJucKOhC1zh4IP3'], 'Cross-dock Date': '2026-10-09' }),
    // (5) IAB4166 shape; 463 is «κατά CMR», carries no notes and does not exchange pallets
    order('rec461', ['recP461L', 'recP461U1', 'recP461U2'], { 'Order No': 461, Reference: 'REF-461', 'Loading DateTime': '2026-10-08', 'Delivery DateTime': '2026-10-12' }),
    order('rec463', ['recP463L', 'recP463U1', 'recP463U2'], { 'Order No': 463, Reference: 'REF-463', Goods: 'Pears', 'Total Pallets': 20, 'Pallet Exchange': false,
      'Temp Per CMR': true, Notes: undefined, 'Loading DateTime': '2026-10-09', 'Delivery DateTime': '2026-10-11' }),
    order('recE1', ['recPE1L', 'recPE1U'], { 'Order No': 501, Reference: 'REF-E1' }),
    order('recE2', ['recPE2L', 'recPE2U'], { 'Order No': 502, Reference: 'REF-E2' }),
    order('recE3', ['recPE3L', 'recPE3U'], { 'Order No': 503, Reference: 'REF-E3' }),
    // (7a) import Veroia whose real cross-dock day (09/10) is NOT Delivery −1 (10/10)
    order('recOrdV2', ['recS3', 'recS4'], { 'Order No': 470, Reference: 'REF-V2', 'Veroia Switch': true, 'Veroia Cross-dock': ['recJucKOhC1zh4IP3'],
      'Cross-dock Date': '2026-10-09', 'Delivery DateTime': '2026-10-11' }),
    // (7a) no Cross-dock Date, local-time order dates (no zone): the estimate
    order('recOrdV3', ['recS3', 'recS4'], { 'Order No': 471, Reference: 'REF-V3', 'Veroia Switch': true, 'Veroia Cross-dock': ['recJucKOhC1zh4IP3'],
      'Loading DateTime': '2026-10-08T07:00:00', 'Delivery DateTime': '2026-10-11T09:00:00' }),
    // (7b) a split leg: no ORDER STOPS, no summaries — only the flat columns
    order('recOF', [], { 'Order No': 600, Reference: 'REF-OF', 'Loading Summary': undefined, 'Delivery Summary': undefined,
      'Loading Location 1': ['recLocVo'], 'Unloading Location 1': ['recLocB2'] }),
    // (7d) twelve stops
    order('recM', ['recPM0'].concat(Array.from({ length: 11 }, (_, i) => 'recPM' + (i + 1))), { 'Order No': 700, Reference: 'REF-M' })],
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
  // 6th: (7a) the order's Cross-dock Date as printed — the Veroia stop's date in the text
  ['driver · Veroia export', 'orderId=recOrdV&leg=export&sheet=driver', 'driver', [CO(L('recJucKOhC1zh4IP3')), CO(L('recLocB'))], null, '09/10/2026'],
  ['partner · Veroia export', 'orderId=recOrdV&leg=export&sheet=partner', 'partner', [CO(L('recJucKOhC1zh4IP3')), CO(L('recLocB'))], null, '09/10/2026'],
  ['driver · Veroia import', 'orderId=recOrdV&leg=import&sheet=driver', 'driver', [CO(L('recLocA')), CO(L('recJucKOhC1zh4IP3'))], null, '09/10/2026'],
  ['partner · Veroia import', 'orderId=recOrdV&leg=import&sheet=partner', 'partner', [CO(L('recLocA')), CO(L('recJucKOhC1zh4IP3'))], null, '09/10/2026'],
  // The group of 2 that stood here compared one text per order with the
  // reference; a group is ONE text since (5) — it is checked there.
];

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const J = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

async function render(browser, html, qs, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: (opts && opts.viewport) || { width: 1200, height: 900 }, serviceWorkers: 'block' },
    opts && opts.tz ? { timezoneId: opts.tz } : {}));
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-07T10:00:00'));
  await page.addInitScript(() => {
    localStorage.setItem('tms_jwt', 'rig'); localStorage.setItem('tms_user', JSON.stringify({ name: 'Rig User' }));
    // (5) every copy (📋 WhatsApp button, share menu) lands here, not in the OS clipboard.
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { (window.__copied = window.__copied || []).push(t); return Promise.resolve(); } } });
  });
  // (7c) opts.noLocs: the LOCATIONS read comes back empty → the page's locations failure note.
  const byTable = { [T.ORD]: FX.ORDERS, [T.PAR]: FX.PARTNERS, [T.TRK]: FX.TRUCKS, [T.TRL]: FX.TRAILERS, [T.DRV]: FX.DRIVERS, [T.LOC]: opts && opts.noLocs ? [] : FX.LOCS, [T.STP]: FX.STOPS };
  const appErrors = [];   // (7c) POSTs to the production error log
  await page.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname === HOST && u.pathname.endsWith('/app-errors')) { appErrors.push(r.request().postData()); return J(r, {}); }
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
  const errors = [], consoleErrors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
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
    // (5) the group cover (first document of a packet): route, section headings, cards in order.
    const cov = docs > 1 ? doc.querySelector('.p-doc') : null;
    const cover = cov && {
      route: [...cov.querySelectorAll('.route2 .side')].map(s => s.querySelector('.n').innerText + ' | ' + s.querySelector('.d').innerText),
      sections: [...cov.querySelectorAll('.section-title')].map(e => e.innerText),
      tls: [...cov.querySelectorAll('.tl')].map(tl => [...tl.querySelectorAll('.stop')].map(st => st.querySelector('.num').innerText + ' ' + st.querySelector('.name').innerText
        + ' · ' + (st.querySelector('.stoptag') ? st.querySelector('.stoptag').innerText.split('\n')[0] : ''))),
      seq: ([...cov.querySelectorAll('.meta-item')].find(e => /ΣΕΙΡΑ ΠΑΡΑΔΟΣΗΣ|Delivery Sequence/i.test(e.innerText)) || { innerText: '' }).innerText.split('\n').pop(),
      // (7a) the date on each cover card
      dts: [...cov.querySelectorAll('.tl')].map(tl => [...tl.querySelectorAll('.stop')].map(st => st.querySelector('.big').innerText)),
    };
    // (7a/7b) every document's cards (name, date, address+coordinates) and its route strip
    const sheets = [...doc.querySelectorAll('.p-doc')].map(d => ({
      stops: [...d.querySelectorAll('.stop')].map(st => ({ name: st.querySelector('.name').innerText, dt: (st.querySelector('.big') || {}).innerText || '',
        addr: (st.querySelector('.addr') || {}).innerText || '' })),
      strip: [...d.querySelectorAll('.route2 .side')].map(x => x.querySelector('.n').innerText + ' | ' + x.querySelector('.d').innerText),
    }));
    const n = document.getElementById('waGroupFailed');
    // (7c) Is a failure note really SEEN? The topmost element at its centre must
    // be the note itself (or inside it) — not the fixed toolbar over it.
    const bar = document.querySelector('.pbar'), barBottom = bar ? Math.round(bar.getBoundingClientRect().bottom) : 0;
    const seen = id => {
      const e = document.getElementById(id);
      if (!e) return null;
      const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { visible: !!hit && e.contains(hit), top: Math.round(r.top), bottom: Math.round(r.bottom), barBottom,
        hit: hit ? hit.tagName + (hit.id ? '#' + hit.id : '') + (typeof hit.className === 'string' && hit.className ? '.' + hit.className.split(' ')[0] : '') : 'none' };
    };
    return { text: doc.innerText, full, keep, docs, chips, cardTemps, cover, sheets, note: n ? n.innerText : '',
      seen: { waGroupFailed: seen('waGroupFailed'), locsFailed: seen('locsFailed') },
      wa: (typeof _waArr !== 'undefined' ? _waArr : []).slice() };
  });
  if (opts && opts.shot && process.env.RIG_SHOTS) await page.screenshot({ path: path.join(process.env.RIG_SHOTS, opts.shot) });
  if (opts && opts.channels) {
    // (5) the three ways the text leaves the page: the 📋 WhatsApp button (copyWA),
    // the print button's share menu «Αντιγραφή κειμένου» (getText), and the
    // expression the Worker evaluates for /print/pdf?format=text.
    await page.click('.pbar-btn.wa');
    await page.click('.pbar-btn:not(.wa)', { button: 'right' });
    await page.click('#shMenu button:has-text("Αντιγραφή κειμένου")');
    await page.waitForFunction(() => (window.__copied || []).length >= 2, null, { timeout: 5000 });
    out.copied = await page.evaluate(() => window.__copied.slice());
    out.worker = await page.evaluate(() => (window._waArr || []).join('\n\n\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\n\n'));
  }
  if (opts && opts.printMedia) {   // (7c) the note speaks about the phone text: not on the paper
    await page.emulateMedia({ media: 'print' });
    out.notePrinted = await page.evaluate(() => { const n = document.getElementById('waGroupFailed'); return !!n && getComputedStyle(n).display !== 'none'; });
  }
  await ctx.close();
  return Object.assign(out, { errors, consoleErrors, appErrors });
}

// The reference text with exactly the three additions: a coordinates line above
// each maps link, the (4b) CMR line right before the pallet-exchange line, and
// the closing line at the end of each document.
const expectFromBase = (msg, foot, keep) => msg.replace(/^📍 https:\/\/maps\.google\.com\/\?q=([^,\n]+),([^\n]+)$/gm, '📍 *$1, $2*\n$&')
  .replace(/^🔁 /m, keep + '\n🔁 ') + '\n\n' + foot;
// The stop block (header line to the blank line) that names this place.
const blockOf = (msg, name) => (msg.split('\n\n').find(b => b.split('\n')[1] === name) || '');

// (5) The IAB4166 shape as the driver / the partner receives it — the whole
// text, frozen: pickups in the dispatcher's order (461 then 463), drops by date
// (463's two Bulgarian drops on 11/10 before 461's two Greek drops on 12/10).
const EXAMPLE = {
  driver: `🚛 *ΕΝΤΟΛΗ W41 · ΕΙΣΑΓΩΓΗ · 461 + 463*
👤 Driver D · TRK-1 / TRL-1

*ΦΟΡΤΩΣΕΙΣ*
1️⃣ *ΦΟΡΤΩΣΗ* · 08/10/2026 · #461
Packer V
Street 1, Voitsberg, Αυστρία
📍 *47.0446, 15.1567*
📍 https://maps.google.com/?q=47.0446,15.1567

2️⃣ *ΦΟΡΤΩΣΗ* · 09/10/2026 · #463
Packer S
Street 1, Stubenberg, Αυστρία
📍 *47.2441, 15.8019*
📍 https://maps.google.com/?q=47.2441,15.8019

*ΠΑΡΑΔΟΣΕΙΣ*
1️⃣ *ΠΑΡΑΔΟΣΗ* · 11/10/2026 · #463
Client B1
Street 1, Sofia, Βουλγαρία
📍 *42.6977, 23.3219*
📍 https://maps.google.com/?q=42.6977,23.3219

2️⃣ *ΠΑΡΑΔΟΣΗ* · 11/10/2026 · #463
Client B2
Street 1, Plovdiv, Βουλγαρία
📍 *42.1354, 24.7453*
📍 https://maps.google.com/?q=42.1354,24.7453

3️⃣ *ΠΑΡΑΔΟΣΗ* · 12/10/2026 08:00 · #461
Client G1
Street 1, Thessaloniki, Ελλάδα
📍 *40.6401, 22.9444*
📍 https://maps.google.com/?q=40.6401,22.9444

4️⃣ *ΠΑΡΑΔΟΣΗ* · 12/10/2026 14:00 · #461
Client G2
Street 1, Athens, Ελλάδα
📍 *37.9838, 23.7275*
📍 https://maps.google.com/?q=37.9838,23.7275

*ΦΟΡΤΙΟ #461*
📦 *33× EUR* · Apples · 🌡 *2°C Continuous*
🔁 *Ανταλλαγή παλετών: ΝΑΙ*
Ref: REF-461
📝 Gate 4

*ΦΟΡΤΙΟ #463*
📦 *20× EUR* · Pears
🌡 *Θερμοκρασία: όπως γράφει το CMR · Continuous*
🔁 *Ανταλλαγή παλετών: ΟΧΙ*
Ref: REF-463

🌡 Τήρησε τη θερμοκρασία που γράφει το CMR.

ℹ️ Αυτοματοποιημένο μήνυμα. Αν κάτι σας φαίνεται λάθος, επικοινωνήστε με το γραφείο.`,
  partner: `🚛 *ORDER W41 · IMPORT · 461 + 463*
👤 Carrier P · AB-1234

*LOADINGS*
1️⃣ *LOADING* · 08/10/2026 · #461
Packer V
Street 1, Voitsberg, Austria
📍 *47.0446, 15.1567*
📍 https://maps.google.com/?q=47.0446,15.1567

2️⃣ *LOADING* · 09/10/2026 · #463
Packer S
Street 1, Stubenberg, Austria
📍 *47.2441, 15.8019*
📍 https://maps.google.com/?q=47.2441,15.8019

*DELIVERIES*
1️⃣ *DELIVERY* · 11/10/2026 · #463
Client B1
Street 1, Sofia, Bulgaria
📍 *42.6977, 23.3219*
📍 https://maps.google.com/?q=42.6977,23.3219

2️⃣ *DELIVERY* · 11/10/2026 · #463
Client B2
Street 1, Plovdiv, Bulgaria
📍 *42.1354, 24.7453*
📍 https://maps.google.com/?q=42.1354,24.7453

3️⃣ *DELIVERY* · 12/10/2026 08:00 · #461
Client G1
Street 1, Thessaloniki, Greece
📍 *40.6401, 22.9444*
📍 https://maps.google.com/?q=40.6401,22.9444

4️⃣ *DELIVERY* · 12/10/2026 14:00 · #461
Client G2
Street 1, Athens, Greece
📍 *37.9838, 23.7275*
📍 https://maps.google.com/?q=37.9838,23.7275

*CARGO #461*
📦 *33× EUR* · Apples · 🌡 *2°C Continuous*
🔁 *Pallet Exchange: YES*
Ref: REF-461
📝 Gate 4

*CARGO #463*
📦 *20× EUR* · Pears
🌡 *Temperature: as stated on the CMR · Continuous*
🔁 *Pallet Exchange: NO*
Ref: REF-463

🌡 Keep the temperature stated on the CMR.

ℹ️ Automated message. If anything looks wrong, please contact the office.`,
};
// The stop header lines of a group text: «1️⃣ *ΦΟΡΤΩΣΗ* · 08/10/2026 · #461» + the name below it.
const groupStops = m => { const ls = m.split('\n'); return ls.map((l, i) => {
  const x = l.match(/^(\S+) \*(ΦΟΡΤΩΣΗ|ΠΑΡΑΔΟΣΗ|LOADING|DELIVERY)\* · (.+) · (#\S+)$/);
  return x && { emo: x[1], load: x[2] === 'ΦΟΡΤΩΣΗ' || x[2] === 'LOADING', dt: x[3], tag: x[4], name: ls[i + 1] };
}).filter(Boolean); };
const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];
// A cargo block «*ΦΟΡΤΙΟ #461*» … up to the blank line.
const cargoBlock = (m, no) => (m.split('\n\n').find(b => /^\*(ΦΟΡΤΙΟ|CARGO) #/.test(b) && b.split('\n')[0].endsWith('#' + no + '*')) || '');
// (7a) the Veroia stop of a text: the block that holds its maps link.
const VS_LINK = '📍 https://maps.google.com/?q=40.6312,-0.5';
const vsBlock = m => m.split('\n\n').find(b => b.split('\n').includes(VS_LINK)) || '';
const vsDate = m => { const h = vsBlock(m).split('\n').find(l => / \*(ΦΟΡΤΩΣΗ|ΠΑΡΑΔΟΣΗ|LOADING|DELIVERY)\* · /.test(l)) || ''; return h.replace(/^\S+ \*[^*]+\* · /, '').replace(/ · #\S+$/, ''); };
// The reference text with the Veroia stop dated d (the deliberate (7a) correction).
const vsFix = (m, d) => d ? m.split('\n\n').map(b => b.split('\n').includes(VS_LINK) ? b.replace(/^(\S+ \*[^*]+\* · )[^\n]*/m, '$1' + d) : b).join('\n\n') : m;
// The Veroia card of a document: the card whose address carries its coordinates.
const vsCard = sh => ((sh && sh.stops) || []).find(x => x.addr.includes('40.6312')) || {};
// (7d) the stop numbers of a text, in order
const stopNums = m => m.split('\n').map(l => (l.match(/^(\S+) \*(ΦΟΡΤΩΣΗ|ΠΑΡΑΔΟΣΗ|LOADING|DELIVERY)\* · /) || [])[1]).filter(Boolean);

(async () => {
  const browser = await chromium.launch();
  const html = src(REV), baseHtml = src(BASE_REV), singleHtml = src(SINGLE_REV);
  console.log('print.html under test: ' + REV + ' · reference: ' + BASE_REV + ' · singles: ' + SINGLE_REV + ' · ' + BASE);
  // (6) a single order: text and paper byte-for-byte as at SINGLE_REV.
  const sameAsSingle = async (r, qs, h, fix) => {
    const s0 = await render(browser, h || singleHtml, qs);
    const same = JSON.stringify(r.wa) === JSON.stringify(s0.wa.map(fix || (m => m))) && r.full === s0.full && r.wa.length === 1;
    ok(same, '(6) single order: WhatsApp text and paper byte-for-byte as ' + SINGLE_REV + (same ? '' : ' — got ' + JSON.stringify(r.wa).slice(0, 300)));
  };
  if (process.env.DUMP) {   // print the texts of a query, for a person to read (no checks)
    const d = await render(browser, html, process.env.DUMP, { channels: true });
    console.log(d.wa.join('\n=====\n')); console.log(JSON.stringify(d.cover, null, 1)); console.log(d.errors);
    await browser.close(); return;
  }
  for (const [name, qs, sheet, coords, noCoordsName, cd] of SHEETS) {
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
    const want = a0.wa.map(m => vsFix(expectFromBase(m, FOOT[sheet], KEEP[sheet]), cd));
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
    if (cd) ok(vsDate(a.wa[0]) === cd && vsCard(a.sheets[0]).dt === cd,
      '(7a) the Veroia stop: the order\'s Cross-dock Date in the text and on its sheet\'s card — ' + JSON.stringify([vsDate(a.wa[0]), vsCard(a.sheets[0]).dt, 'reference: ' + vsDate(a0.wa[0])]));
    await sameAsSingle(a, qs, null, m => vsFix(m, cd));
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
    await sameAsSingle(c, qs);
  }
  console.log('— driver · group: numbered + κατά CMR');
  const g = await render(browser, html, 'orderIds=recOrdA,recOrdC&leg=export&sheet=driver');
  ok(!g.errors.length, 'no page error' + (g.errors.length ? ': ' + g.errors[0] : ''));
  ok(g.chips[0] === '2°C / ' + CMRW.driver, '(4a) cover chip «2°C / ' + CMRW.driver + '» — ' + JSON.stringify(g.chips));
  ok(g.docs === 3 && g.keep.length === 3 && g.keep.every(t => t === KEEP.driver), '(4b) cover + 2 documents, the CMR line on each (' + g.keep.length + '/' + g.docs + ')');
  // (5) one text for the group: the CMR line once for the truck, each order's temperature in its own cargo block
  ok(g.wa.length === 1 && g.wa[0].split('\n').filter(l => l === KEEP.driver).length === 1, '(4b/5) ONE WhatsApp text, the CMR line once');
  // (both fixture orders are «402»: the blocks are read in the dispatcher order A, C)
  const [gA = '', gC = ''] = (g.wa[0] || '').split('\n\n').filter(b => /^\*ΦΟΡΤΙΟ #/.test(b));
  ok(/🌡 \*2°C Continuous\*/.test(gA) && !gA.includes(CMRL.driver) && gC.includes(CMRL.driver + ' · Continuous*') && !/°C/.test(gC),
    '(4a) the numbered order keeps its number, the CMR order says CMR — ' + JSON.stringify([gA, gC]));

  // (5) group route — the IAB4166 shape, the other half, ties, Veroia, partner.
  const tags = (st, load) => st.filter(x => x.load === load).map(x => x.tag);
  const names = (st, load) => st.filter(x => x.load === load).map(x => x.name);
  const emos = (st, load) => st.filter(x => x.load === load).map(x => x.emo);
  const coverNames = c => c ? c.tls.map(tl => tl.map(x => x.replace(/^\d+ /, '').split(' · ')[0])) : [];
  const coverNums = c => c ? c.tls.map(tl => tl.map(x => x.split(' ')[0])) : [];
  for (const sheet of ['driver', 'partner']) {
    console.log('— ' + sheet + ' · group IAB4166 (import 461 + 463)');
    const e = await render(browser, html, 'orderIds=rec461,rec463&leg=import&sheet=' + sheet, { channels: true });
    ok(!e.errors.length, 'no page error' + (e.errors.length ? ': ' + e.errors[0] : ''));
    const m = e.wa[0] || '', st = groupStops(m);
    ok(e.wa.length === 1 && !m.includes('————————'), '(5) ONE WhatsApp text for the group, no «————————» joint');
    ok(m === EXAMPLE[sheet], '(5) the whole text = the expected message' + (m === EXAMPLE[sheet] ? '' : ' — got ' + JSON.stringify(m)));
    ok(JSON.stringify(tags(st, true)) === '["#461","#463"]', '(5) IMPORT: loadings in the dispatcher order 461 → 463 — ' + JSON.stringify(tags(st, true)));
    ok(JSON.stringify(tags(st, false)) === '["#463","#463","#461","#461"]', '(5) IMPORT: deliveries by date 463, 463, 461, 461 — ' + JSON.stringify(tags(st, false)));
    ok(JSON.stringify(emos(st, true)) === JSON.stringify(NUM.slice(0, 2)) && JSON.stringify(emos(st, false)) === JSON.stringify(NUM.slice(0, 4)),
      '(5) numbering restarts per section: loadings 1–2, deliveries 1–4');
    ok(e.copied && e.copied.length === 2 && e.copied.every(t => t === m) && e.worker === m,
      '(5) one producer: 📋 WhatsApp, share menu «Αντιγραφή κειμένου» and the Worker expression give the same text — ' + JSON.stringify((e.copied || []).map(t => t.length).concat([(e.worker || '').length, m.length])));
    const c = e.cover || {};
    ok(JSON.stringify(c.route) === JSON.stringify(['Packer V | 08/10/2026', 'Client G2 | 12/10/2026 14:00']),
      '(5) cover route: first loading → last delivery of the route, not of the last order — ' + JSON.stringify(c.route));
    ok(JSON.stringify(c.sections) === JSON.stringify(sheet === 'driver' ? ['ΦΟΡΤΩΣΕΙΣ', 'ΠΑΡΑΔΟΣΕΙΣ'] : ['LOADINGS', 'DELIVERIES']), '(5) cover sections — ' + JSON.stringify(c.sections));
    ok(JSON.stringify(coverNums(c)) === '[["1","2"],["1","2","3","4"]]', '(5) cover numbering restarts per section like the text — ' + JSON.stringify(coverNums(c)));
    ok(JSON.stringify(coverNames(c)) === JSON.stringify([names(st, true), names(st, false)]),
      '(5) cover and text list the SAME stops in the SAME order — ' + JSON.stringify(coverNames(c)));
    ok(c.tls && /ΠΑΡΑΓΓΕΛΙΑ B · 463/.test(c.tls[1][0]) && /ΠΑΡΑΓΓΕΛΙΑ A · 461/.test(c.tls[1][3]), '(5) cover cards keep their order tag — ' + JSON.stringify(c.tls && c.tls[1]));
    ok(/B\. Client B2 → A\. Client G2$/.test(c.seq || ''), '(5) cover delivery sequence: 463 first, then 461 — ' + JSON.stringify(c.seq));
    ok(e.docs === 3, '(5) the per-order documents still follow the cover (' + e.docs + ')');
  }
  console.log('— driver · group IAB4166, dispatcher put 463 first');
  const r = await render(browser, html, 'orderIds=rec463,rec461&leg=import&sheet=driver');
  const rst = groupStops(r.wa[0] || '');
  ok(!r.errors.length && r.wa.length === 1, 'no page error, one text');
  ok(JSON.stringify(tags(rst, true)) === '["#463","#461"]', '(5) IMPORT: the dispatcher order wins for the loadings, even against the dates — ' + JSON.stringify(tags(rst, true)));
  ok(JSON.stringify(tags(rst, false)) === '["#463","#463","#461","#461"]', '(5) IMPORT: deliveries still by date — ' + JSON.stringify(tags(rst, false)));
  ok(/^🚛 \*ΕΝΤΟΛΗ W41 · ΕΙΣΑΓΩΓΗ · 463 \+ 461\*$/.test((r.wa[0] || '').split('\n')[0]), '(5) header lists the orders in the dispatcher order');
  ok(JSON.stringify(coverNames(r.cover)) === JSON.stringify([names(rst, true), names(rst, false)]), '(5) cover = text — ' + JSON.stringify(coverNames(r.cover)));

  console.log('— driver · export group E1, E2, E3 (dispatcher order)');
  const x = await render(browser, html, 'orderIds=recE1,recE2,recE3&leg=export&sheet=driver', { channels: true });
  const xst = groupStops(x.wa[0] || '');
  ok(!x.errors.length && x.wa.length === 1, 'no page error, one text');
  ok(JSON.stringify(tags(xst, false)) === '["#501","#502","#503"]', '(5) EXPORT: deliveries in the dispatcher order, even though 502 delivers before 501 — ' + JSON.stringify(tags(xst, false)));
  ok(JSON.stringify(tags(xst, true)) === '["#502","#503","#501"]', '(5) EXPORT: loadings by date; 502 and 503 on the same day keep the dispatcher order — ' + JSON.stringify(tags(xst, true)));
  ok(JSON.stringify(coverNames(x.cover)) === JSON.stringify([names(xst, true), names(xst, false)]), '(5) cover = text — ' + JSON.stringify(coverNames(x.cover)));
  ok(JSON.stringify((x.cover || {}).route) === JSON.stringify(['Client G1 | 09/10/2026', 'Client B1 | 14/10/2026']), '(5) cover route — ' + JSON.stringify((x.cover || {}).route));
  ok(x.copied && x.copied.every(t => t === x.wa[0]) && x.worker === x.wa[0], '(5) one producer for copy, share and the Worker');
  ok(['501', '502', '503'].every(n => cargoBlock(x.wa[0] || '', n).includes('Ref: REF-E' + n.slice(2))), '(5) one cargo block per order, with its Ref');

  console.log('— driver · group with a Veroia Switch export (A + V)');
  const v = await render(browser, html, 'orderIds=recOrdA,recOrdV&leg=export&sheet=driver');
  const vm = v.wa[0] || '', vst = groupStops(vm);
  ok(!v.errors.length && v.wa.length === 1, 'no page error, one text');
  ok(JSON.stringify(names(vst, true)) === '["Packhouse A","Cross-dock V"]', '(5) the Veroia cross-dock takes its place by its date (A 08/10 → cross-dock 09/10) — ' + JSON.stringify(vst.filter(s => s.load).map(s => s.name + ' ' + s.dt)));
  for (const c of [CO(L('recLocA')), CO(L('recJucKOhC1zh4IP3')), CO(L('recLocB'))]) {
    const ls = vm.split('\n'), i = ls.indexOf('📍 *' + c + '*');
    ok(i > 0 && ls[i + 1] === '📍 https://maps.google.com/?q=' + c.replace(', ', ','), '(1) coordinates line + maps link «' + c + '»');
  }
  // a section heading sits on the first stop's block: set it aside
  const nb = vm.split('\n\n').map(b => b.replace(/^\*(ΦΟΡΤΩΣΕΙΣ|ΠΑΡΑΔΟΣΕΙΣ)\*\n/, '')).find(b => b.split('\n')[1] === 'Client N (no coords)') || '';
  ok(nb && !/📍/.test(nb), '(1) the stop without coordinates has no 📍 line — ' + JSON.stringify(nb));
  ok(JSON.stringify(coverNames(v.cover)) === JSON.stringify([names(vst, true), names(vst, false)]), '(5) the cover shows the cross-dock where the text does — ' + JSON.stringify(coverNames(v.cover)));
  ok(vm.split('\n').filter(l => /^ℹ️/.test(l)).length === 1 && vm.endsWith('\n\n' + FOOT.driver), '(2) the closing line once, last');

  // (2) with the office numbers filled in: ☎️, a blank line, then the closing line.
  console.log('— driver · office phones filled in');
  const p = await render(browser, withPhones(html), 'orderId=recOrdA&leg=export&sheet=driver');
  const pl = (p.wa[0] || '').split('\n');
  ok(!p.errors.length, 'no page error' + (p.errors.length ? ': ' + p.errors[0] : ''));
  ok(/^☎️ /.test(pl[pl.length - 3]) && pl[pl.length - 2] === '' && pl[pl.length - 1] === FOOT.driver,
    '(2) closing line comes after the ☎️ office line — ' + JSON.stringify(pl.slice(-3)));
  await sameAsSingle(p, 'orderId=recOrdA&leg=export&sheet=driver', withPhones(singleHtml));
  // (5) a group with the office numbers: ☎️ once, then the closing line once, last.
  console.log('— driver · group, office phones filled in');
  const pg = await render(browser, withPhones(html), 'orderIds=rec461,rec463&leg=import&sheet=driver');
  const pgl = (pg.wa[0] || '').split('\n');
  ok(!pg.errors.length && pg.wa.length === 1, 'no page error, one text');
  ok(pgl.filter(l => /^☎️ /.test(l)).length === 1 && /^☎️ /.test(pgl[pgl.length - 3]) && pgl[pgl.length - 1] === FOOT.driver
    && pgl.filter(l => /^ℹ️/.test(l)).length === 1, '(5) ONE ☎️ line and ONE closing line for the whole group — ' + JSON.stringify(pgl.slice(-5)));

  // (7a) The Veroia date: Cross-dock Date first, the estimate only without it.
  console.log('— driver · group import 461 + V2 (Veroia, Cross-dock Date 09/10, Delivery 11/10)');
  const va = await render(browser, html, 'orderIds=rec461,recOrdV2&leg=import&sheet=driver');
  const vast = groupStops(va.wa[0] || ''), vaV = vast.find(x => x.name === 'Cross-dock V') || {};
  ok(!va.errors.length && va.wa.length === 1, 'no page error, one text');
  ok(vaV.dt === '09/10/2026' && vaV.tag === '#470', '(7a) text: the Veroia drop on the Cross-dock Date 09/10, not the estimate 10/10 — ' + JSON.stringify(vaV));
  ok(JSON.stringify(tags(vast, false)) === '["#470","#461","#461"]', '(7a) the real date also places it: 09/10 before 461\'s 12/10 drops — ' + JSON.stringify(tags(vast, false)));
  const vaCov = (va.cover || { tls: [[], []], dts: [[], []] }), vaK = vaCov.tls[1].findIndex(x => /Cross-dock V/.test(x));
  ok(vaK >= 0 && vaCov.dts[1][vaK] === '09/10/2026', '(7a) cover: the same card, the same date — ' + JSON.stringify(vaCov.dts[1]));
  ok(vsCard(va.sheets[2]).dt === '09/10/2026', '(7a) the order\'s own sheet in the same packet says the same date — ' + JSON.stringify(vsCard(va.sheets[2])));
  console.log('— driver · single V2 (import, Cross-dock Date ≠ estimate)');
  const v2 = await render(browser, html, 'orderId=recOrdV2&leg=import&sheet=driver'), v20 = await render(browser, singleHtml, 'orderId=recOrdV2&leg=import&sheet=driver');
  ok(vsDate(v2.wa[0] || '') === '09/10/2026' && vsCard(v2.sheets[0]).dt === '09/10/2026' && vsDate(v20.wa[0] || '') === '10/10/2026',
    '(7a) single text: 09/10 like its sheet (the reference text said the estimate 10/10) — ' + JSON.stringify([vsDate(v2.wa[0] || ''), vsCard(v2.sheets[0]).dt, vsDate(v20.wa[0] || '')]));
  ok(JSON.stringify(v2.wa) === JSON.stringify(v20.wa.map(m => vsFix(m, '09/10/2026'))) && v2.full === v20.full,
    '(7a) nothing else moved: text = reference with that date, paper identical');
  for (const [lg, want] of [['export', '09/10/2026 07:00'], ['import', '10/10/2026 09:00']]) {
    console.log('— driver · single V3 ' + lg + ' (no Cross-dock Date, local-time order dates), Athens vs New York');
    const outs = [];
    for (const tz of ['Europe/Athens', 'America/New_York']) outs.push(await render(browser, html, 'orderId=recOrdV3&leg=' + lg + '&sheet=driver', { tz }));
    const got = outs.map(o => [vsDate(o.wa[0] || ''), vsCard(o.sheets[0]).dt, (o.sheets[0].strip[lg === 'export' ? 0 : 1] || '').split(' | ')[1]]);
    ok(outs.every(o => !o.errors.length) && got.every(g => g.every(x => x === want)),
      '(7a) the estimate ' + (lg === 'export' ? 'Loading +1' : 'Delivery −1') + ' «' + want + '» in the text, on the card and in the header strip, in both zones — ' + JSON.stringify(got));
  }

  // (7b) A split leg: the flat-column places, never «—».
  console.log('— driver · group A + split leg OF (no stops, no summaries)');
  const sl = await render(browser, html, 'orderIds=recOrdA,recOF&leg=export&sheet=driver');
  const slm = sl.wa[0] || '', slst = groupStops(slm);
  const ofSt = slst.filter(x => x.tag === '#600').map(x => (x.load ? 'L ' : 'U ') + x.name);
  ok(!sl.errors.length && sl.wa.length === 1, 'no page error, one text');
  ok(JSON.stringify(ofSt) === '["L Packer V","U Client B2"]' && !slst.some(x => x.name === '—'), '(7b) text: the split leg\'s loading and delivery by name — ' + JSON.stringify(ofSt));
  for (const c of [CO(L('recLocVo')), CO(L('recLocB2'))])
    ok(slm.split('\n').includes('📍 *' + c + '*'), '(7b) …with their coordinates «' + c + '»');
  ok(JSON.stringify(coverNames(sl.cover)) === JSON.stringify([names(slst, true), names(slst, false)]) && !JSON.stringify(coverNames(sl.cover)).includes('"—"'),
    '(7b) cover = text, no «—» card — ' + JSON.stringify(coverNames(sl.cover)));
  ok(JSON.stringify(sl.sheets[2].stops.map(x => x.name)) === '["Packer V","Client B2"]', '(7b) the same places its own sheet prints — ' + JSON.stringify(sl.sheets[2].stops.map(x => x.name)));
  const ofs = await render(browser, html, 'orderId=recOF&leg=export&sheet=driver');
  const ofn = (ofs.wa[0] || '').split('\n').map((l, i, ls) => /^\S+ \*(ΦΟΡΤΩΣΗ|ΠΑΡΑΔΟΣΗ)\* · /.test(l) ? ls[i + 1] : null).filter(Boolean);
  ok(!ofs.errors.length && JSON.stringify(ofn) === '["Packer V","Client B2"]', '(7b) single text of the split leg too — ' + JSON.stringify(ofn));

  // (7c) The group text fails: the per-order texts go out, the page says so.
  console.log('— driver · group IAB4166 with waGroupBuild forced to throw');
  const broken = html.replace('function waGroupBuild(items){', "function waGroupBuild(items){throw new Error('rig: waGroupBuild forced to fail');");
  ok(broken !== html, '(7c) the rig could inject the failure');
  const fb = await render(browser, broken, 'orderIds=rec461,rec463&leg=import&sheet=driver', { channels: true, printMedia: true, shot: 'waGroupFailed-1200.png' });
  const s461 = await render(browser, html, 'orderId=rec461&leg=import&sheet=driver'), s463 = await render(browser, html, 'orderId=rec463&leg=import&sheet=driver');
  ok(!fb.errors.length && fb.docs === 3, 'no page error, the packet still prints (' + fb.docs + ' documents)');
  ok(fb.wa.length === 2 && fb.wa[0] === s461.wa[0] && fb.wa[1] === s463.wa[0], '(7c) _waArr = each order\'s own text, never empty — ' + JSON.stringify(fb.wa.map(m => m.length)));
  const joined = fb.wa.join('\n\n————————\n\n');
  ok(fb.copied && fb.copied.length === 2 && fb.copied.every(t => t === joined) && fb.worker === joined && joined.length > 0, '(7c) 📋, share menu and the Worker carry those texts');
  ok(/ΔΕΝ ΦΤΙΑΧΤΗΚΕ/.test(fb.note) && /ένα κείμενο ανά παραγγελία/.test(fb.note), '(7c) a visible note on the page — ' + JSON.stringify(fb.note));
  ok(fb.notePrinted === false, '(7c) the note is not printed on the paper');
  ok(fb.consoleErrors.some(t => /waGroupBuild/.test(t)), '(7c) the error is logged — ' + JSON.stringify(fb.consoleErrors.slice(0, 2)));
  ok(fb.appErrors.length === 0, '(7c) a local rig writes nothing to the production /app-errors (' + fb.appErrors.length + ')');
  const okg = await render(browser, html, 'orderIds=rec461,rec463&leg=import&sheet=driver');
  ok(okg.note === '' && okg.wa.length === 1, '(7c) no note when the group text is built');
  // (7c) SEEN, not just present: the note clears the fixed toolbar on a desk
  // screen and on a phone, where the bar is a different height.
  const SEEN_AT = [['1200', { width: 1200, height: 900 }], ['390', { width: 390, height: 844 }]];
  const seenOk = s => !!s && s.visible && s.top >= s.barBottom;
  for (const [w, vp] of SEEN_AT) {
    const r = w === '1200' ? fb : await render(browser, broken, 'orderIds=rec461,rec463&leg=import&sheet=driver', { viewport: vp, shot: 'waGroupFailed-' + w + '.png' });
    ok(seenOk(r.seen.waGroupFailed), '(7c) ' + w + 'px: elementFromPoint at the note\'s centre is the note, below the toolbar — ' + JSON.stringify(r.seen.waGroupFailed));
  }
  // The locations' failure note (same box, same rule): an empty LOCATIONS read.
  for (const [w, vp] of SEEN_AT) {
    const r = await render(browser, html, 'orderId=rec461&leg=import&sheet=driver', { viewport: vp, noLocs: true, shot: 'locsFailed-' + w + '.png' });
    ok(!r.errors.length && seenOk(r.seen.locsFailed), '(7c) ' + w + 'px: the locations\' failure note is seen too, below the toolbar — ' + JSON.stringify(r.seen.locsFailed));
  }

  // (7d) Past seven stops.
  const KEYS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  console.log('— driver · group M (1 + 11 drops) + A, export');
  const mg = await render(browser, html, 'orderIds=recM,recOrdA&leg=export&sheet=driver');
  const mgst = groupStops(mg.wa[0] || '');
  ok(!mg.errors.length && mg.wa.length === 1, 'no page error, one text');
  ok(JSON.stringify(emos(mgst, false)) === JSON.stringify(KEYS.concat(['#11', '#12'])) && !/▪️/.test(mg.wa[0] || ''),
    '(7d) drops 1️⃣ … 🔟, then «#11», «#12» — no «▪️» — ' + JSON.stringify(emos(mgst, false)));
  ok(JSON.stringify(coverNums(mg.cover)[1]) === JSON.stringify(Array.from({ length: 12 }, (_, i) => String(i + 1))), '(7d) the cover numbers the same drops 1–12');
  console.log('— driver · single M (12 stops)');
  const ms = await render(browser, html, 'orderId=recM&leg=export&sheet=driver'), ms0 = await render(browser, singleHtml, 'orderId=recM&leg=export&sheet=driver');
  const strip = m => m.replace(/^\S+ (\*(ΦΟΡΤΩΣΗ|ΠΑΡΑΔΟΣΗ)\* · )/gm, 'N $1');
  ok(JSON.stringify(stopNums(ms.wa[0] || '')) === JSON.stringify(KEYS.concat(['#11', '#12'])), '(7d) single text 1️⃣ … 🔟, #11, #12 — ' + JSON.stringify(stopNums(ms.wa[0] || '')));
  ok(stopNums(ms0.wa[0] || '').slice(7).every(x => x === '▪️') && strip(ms.wa[0] || '') === strip(ms0.wa[0] || '') && ms.full === ms0.full,
    '(7d) only the numbers changed (the reference gave stops 8–12 «▪️»); paper identical');
  await browser.close();
  console.log('\n' + pass + ' ✓ · ' + fail + ' ✗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
