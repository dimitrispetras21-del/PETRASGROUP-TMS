// Rig — print.html: every data text is escaped where it enters HTML (4/10/2026).
//   (a) ordinary texts (Greek, «&» in a company name, quotes, apostrophes) print
//       IDENTICALLY — #doc innerText (and every href/src) of the page under
//       test equals the one of PRINT_BASE_REV, sheet by sheet;
//   (b) markup typed into Notes / Goods / Reference / a location name / any
//       other field prints as that same text and creates no element;
//   (c) the WhatsApp text stays plain text (identical to PRINT_BASE_REV apart
//       from the two 7/10 lines, see waBefore0710, and the Veroia date, see
//       vsDateAside, and carries the typed markup as typed).
// Sheets: driver, partner, group cover (+2), Veroia Switch, flat locations
// with a split-leg title.
// Group route (owner 7/10, feat/group-route-message): the group's cover now
// orders its stops with groupRoute and the group is ONE WhatsApp text — so for
// the group only the per-order documents are compared with PRINT_BASE_REV; the
// cover's route, headings and numbering are checked against the rule (d), and
// the one text for plain text + typed markup (c). wa-text-rig.js (5) checks the
// text line by line. Backend fully stubbed; the page's clock is fixed.
// Run from the MAIN repo root (its node_modules), static server on 8788:
//   PW_BASE_URL=http://localhost:8788/.claude/worktrees/<dir>/ node <dir>/tests/critics/print-escape-rig.js
// PRINT_REV=<git rev> tests that revision's print.html instead of the working
// file (served at the same URL, so core/*.js load as usual); PRINT_BASE_REV
// (default bb49d28a) is the reference for (a)/(c). Exit 1 on any ✗.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE = process.env.PW_BASE_URL || 'http://localhost:8788/';
const REV = process.env.PRINT_REV || 'work';
const BASE_REV = process.env.PRINT_BASE_REV || 'bb49d28a';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const T = { ORD: 'tblgHlNmLBH3JTdIM', PAR: 'tblLHl5m8bqONfhWv', TRK: 'tblEAPExIAjiA3asD', TRL: 'tblDcrqRJXzPrtYLm',
  DRV: 'tbl7UGmYhc2Y82pPs', LOC: 'tblxu8DRfTQOFRCzS', STP: 'tblaeY5QOHAS1gyE8' };

const src = rev => rev === 'work' ? fs.readFileSync(path.join(ROOT, 'print.html'), 'utf8')
  : execSync('git -C ' + JSON.stringify(ROOT) + ' show ' + rev + ':print.html', { encoding: 'utf8' });

// One fixture shape, two text sets: t(k) gives the text of field k.
function fixture(t) {
  const loc = (id, k, extra) => ({ id, fields: Object.assign({ Name: t(k + 'name'), Address: t(k + 'addr'), City: t(k + 'city'),
    'State/province': t(k + 'state'), Country: 'GR', Latitude: t(k + 'lat'), Longitude: t(k + 'lng'),
    'Opening Hours': t(k + 'hours'), 'Delivery Days': t(k + 'days') }, extra || {}) });
  const LOCS = [loc('recLoc1', 'l1'), loc('recLoc2', 'l2'), loc('recLoc3', 'l3'), loc('recJucKOhC1zh4IP3', 'vs')];
  const stop = (id, type, n, l, k) => ({ id, fields: { 'Stop Type': type, 'Stop Number': n, Location: [l],
    DateTime: t(k + 'dt'), Pallets: t(k + 'pal'), Goods: t(k + 'goods'), Temperature: t(k + 'temp') } });
  const STOPS = [stop('recS1', 'Loading', 1, 'recLoc1', 's1'), stop('recS2', 'Cross-dock', 2, 'recLoc3', 's2'),
    stop('recS3', 'Unloading', 3, 'recLoc2', 's3'), stop('recS4', 'Loading', 1, 'recLoc2', 's4'), stop('recS5', 'Unloading', 2, 'recLoc3', 's5')];
  const order = (id, stops, extra) => ({ id, fields: Object.assign({
    'Order No': t('ordno'), Reference: t('ref'), Goods: t('goods'), Notes: t('notes'), 'Temperature °C': t('temp'),
    'Refrigerator Mode': t('refr'), 'Total Pallets': t('pal'), 'Pallet Type': t('paltype'), 'Gross Weight kg': t('gw'),
    'Week Number': t('wk'), 'Pallet Exchange': true, 'High Risk Flag': true, 'National Groupage': true,
    Driver: ['recDrv'], Truck: ['recTrk'], Trailer: ['recTrl'], Partner: ['recPar'], 'Partner Truck Plates': t('pplates'),
    'Partner Rate': 1450.5, 'Loading DateTime': t('ldt'), 'Delivery DateTime': t('ddt'),
    'Loading Summary': t('lsum'), 'Delivery Summary': t('dsum'), 'Client Summary': t('csum'), 'ORDER STOPS': stops }, extra || {}) });
  const ORDERS = [order('recOrdA', ['recS1', 'recS2', 'recS3']), order('recOrdB', ['recS4', 'recS5']),
    order('recOrdV', [], { 'Veroia Switch': true, 'Veroia Cross-dock': ['recJucKOhC1zh4IP3'], 'Cross-dock Date': t('cdd') }),
    order('recOrdF', [], { 'Loading Location 1': ['recLoc1'], 'Unloading Location 1': ['recLoc2'],
      'Loading Pallets 1': t('pal'), 'Parent Order': ['recOrdA'], 'Leg No': 1 })];
  return { LOCS, STOPS, ORDERS,
    PARTNERS: [{ id: 'recPar', fields: { 'Company Name': t('pname'), 'VAT Number': t('pvat'), Adress: t('paddr'), Email: t('pmail') } }],
    DRIVERS: [{ id: 'recDrv', fields: { 'Full Name': t('dname') } }],
    TRUCKS: [{ id: 'recTrk', fields: { 'License Plate': t('tplate'), 'Tare Weight kg': 7000 } }],
    TRAILERS: [{ id: 'recTrl', fields: { 'License Plate': t('trplate'), 'Tare Weight kg': 6500 } }],
    USER: t('user') };
}

const ORDINARY = {
  l1name: 'Αγρόκτημα Βέροιας & Υιοί', l1addr: 'Οδός Ελιάς 5', l1city: 'Νάουσα', l1state: 'Ημαθία', l1lat: '40.6295', l1lng: '22.0681', l1hours: '08:00–16:00', l1days: 'Δευ–Παρ',
  l2name: 'Lidl "Ecser" DC', l2addr: 'Ipari út 2', l2city: 'Ecser', l2state: 'Pest', l2lat: '47.4444', l2lng: '19.3333', l2hours: '06:00-14:00', l2days: "Mon–Fri (no Sat's)",
  l3name: "O'Brien Fresh Hub", l3addr: 'Str. Gării 1', l3city: 'Arad', l3state: '', l3lat: '46.17', l3lng: '21.31', l3hours: '', l3days: '',
  vsname: 'VERMION FRESH & CROSS-DOCK', vsaddr: 'Κόπανος 59200', vscity: 'Νάουσα', vsstate: '', vslat: '40.63', vslng: '22.07', vshours: '', vsdays: '',
  s1dt: '2026-10-05T07:00:00', s1pal: 10, s1goods: 'Μήλα & αχλάδια', s1temp: 0,
  s2dt: '2026-10-06', s2pal: 10, s2goods: 'Μήλα', s2temp: 1,
  s3dt: '2026-10-07T09:15:00', s3pal: 10, s3goods: 'Μήλα "Extra"', s3temp: 2,
  s4dt: '2026-10-05', s4pal: 5, s4goods: 'Ροδάκινα', s4temp: 3, s5dt: '2026-10-08', s5pal: 5, s5goods: 'Ροδάκινα', s5temp: 3,
  ordno: 312, ref: 'PO-77 "A&B"', goods: 'Ροδάκινα & νεκταρίνια "Extra"', notes: "Προσοχή: τηλ. +30 23320 12345 — O'Neil's dock",
  temp: 2, refr: 'Continuous', pal: 33, paltype: 'EUR', gw: 18000, wk: 41, pplates: 'ΚΖΗ-1234 / ΡΖΒ-55',
  ldt: '2026-10-05T08:30:00', ddt: '2026-10-07', lsum: 'Αγρόκτημα Βέροιας & Υιοί, Νάουσα', dsum: 'Lidl "Ecser" DC, Ecser',
  csum: 'Lidl & Co', cdd: '2026-10-06', pname: 'Trans & Co "Balkan" Α.Ε.', pvat: 'EL123456789', paddr: 'Λεωφ. Νίκης 1, Θεσ/νίκη',
  pmail: 'ops@trans.example', dname: 'Γιώργος Παπα-Δόπουλος', tplate: 'ΚΖΗ-1234', trplate: 'ΡΖΒ-55', user: "Ειρήνη O'Neil & Σία",
};
// Markup typed into every text field; every tag carries a data-mk attribute.
const MK = k => '<b data-mk="' + k + '">' + k + '</b>';
const MARKUP = Object.assign({}, ORDINARY, Object.fromEntries(
  ['l1name', 'l1addr', 'l1city', 'l1state', 'l1hours', 'l1days', 'l2name', 'l3name', 'vsname', 'vsaddr',
    's1goods', 's3goods', 'ordno', 'ref', 'goods', 'notes', 'refr', 'paltype', 'pplates', 'lsum', 'dsum', 'csum',
    'pname', 'pvat', 'paddr', 'pmail', 'dname', 'tplate', 'trplate', 'user'].map(k => [k, MK(k)])), {
  l1lat: '40.6"data-mk="lat', l1lng: '22.0<i data-mk="lng">x</i>', s1temp: MK('s1temp'), temp: MK('temp'), gw: MK('gw'),
  s1pal: MK('s1pal'), pal: MK('pal'), wk: MK('wk'), s1dt: MK('s1dt'), ldt: MK('ldt'),
});

const SHEETS = [
  ['driver', 'orderId=recOrdA&leg=export&sheet=driver'],
  ['partner', 'orderId=recOrdA&leg=export&sheet=partner'],
  ['group', 'orderIds=recOrdA,recOrdB&leg=export&sheet=driver'],
  ['veroia', 'orderId=recOrdV&leg=export&sheet=driver'],
  ['flat+leg', 'orderId=recOrdF&leg=import&sheet=partner'],
];

// Pantelis 7/10 (feat/wa-coords-footer) added two WhatsApp lines on purpose:
// the bare coordinates above each maps link and the closing «automated
// message» line. wa-text-rig.js asserts them exactly; here they are set aside
// so (c) keeps comparing everything else with BASE_REV, which predates them.
const waBefore0710 = s => s.replace(/\n📍 \*[^\n]*\*(?=\n📍 https:)/g, '').replace(/\n\nℹ️ [^\n]*(?=\n====\n|$)/g, '');
// Owner 7/10 (feat/temp-per-cmr-front): every text and every paper document
// carries «🌡 keep the temperature on the CMR» — asserted exactly by
// wa-text-rig.js (4b); set aside here like the two lines above. The fixtures
// hold no «κατά CMR» order, so nothing else of that change can appear here.
const waBeforeCmr = s => s.replace(/\n🌡 (Τήρησε τη θερμοκρασία που γράφει το CMR|Keep the temperature stated on the CMR)\.(?=\n)/g, '');

// Review 7/10 finding 3 (feat/group-route-message, coordinator decision): the
// Veroia stop of a WhatsApp text is dated like its sheet's Veroia card — the
// order's Cross-dock Date, the estimate (export Loading +1 day) only when that
// is empty, the day shifted on the written date (vsCdDate). BASE_REV printed
// the estimate even next to a real date, through toISOString() (08:30 local →
// «06/10/2026 05:30» in Athens). That one date is set aside for (c) and
// asserted on its own; wa-text-rig.js checks the rule in full.
const VS_HEAD = /^(\S+ \*(ΦΟΡΤΩΣΗ|LOADING)\* · )[^\n]*(?=\n)/;
const vsHead = (s, name) => { const b = s.split('\n\n').find(x => x.split('\n')[1] === name); return b ? b.split('\n')[0] : ''; };
const vsDateAside = (s, name) => s.split('\n\n').map(b => b.split('\n')[1] === name ? b.replace(VS_HEAD, '$1<cross-dock date>') : b).join('\n\n');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const J = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

async function render(browser, html, fx, qs) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-04T10:00:00'));
  await page.addInitScript(u => { localStorage.setItem('tms_jwt', 'rig'); localStorage.setItem('tms_user', JSON.stringify({ name: u })); }, fx.USER);
  const byTable = { [T.ORD]: fx.ORDERS, [T.PAR]: fx.PARTNERS, [T.TRK]: fx.TRUCKS, [T.TRL]: fx.TRAILERS, [T.DRV]: fx.DRIVERS, [T.LOC]: fx.LOCS, [T.STP]: fx.STOPS };
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
  const out = await page.evaluate(() => ({
    // (feat/temp-per-cmr-front) the paper CMR line is set aside, see waBeforeCmr.
    text: (document.querySelectorAll('#doc .cmr-keep').forEach(e => e.remove()), document.getElementById('doc').innerText),
    docs: [...document.querySelectorAll('#doc .p-doc')].map(e => e.innerText),
    cover: document.querySelectorAll('#doc .p-doc').length > 1 ? (c => ({
      route: [...c.querySelectorAll('.route2 .side')].map(x => x.querySelector('.n').innerText + ' | ' + x.querySelector('.d').innerText),
      sections: [...c.querySelectorAll('.section-title')].map(x => x.innerText),
      tls: [...c.querySelectorAll('.tl')].map(tl => [...tl.querySelectorAll('.stop')].map(x => x.querySelector('.num').innerText + ' ' + x.querySelector('.name').innerText)),
    }))(document.querySelector('#doc .p-doc')) : null,
    mk: [...document.querySelectorAll('[data-mk]')].map(e => e.tagName + ':' + e.getAttribute('data-mk')),
    urls: [...document.querySelectorAll('#doc [href], #doc [src]')].map(e => e.getAttribute('href') || e.getAttribute('src')),
    wa: (typeof _waArr !== 'undefined' ? _waArr : []).join('\n====\n'),
    waN: (typeof _waArr !== 'undefined' ? _waArr : []).length,
  }));
  await ctx.close();
  out.wa = waBeforeCmr(waBefore0710(out.wa));
  return Object.assign(out, { errors });
}

(async () => {
  const browser = await chromium.launch();
  const html = src(REV), baseHtml = src(BASE_REV);
  console.log('print.html under test: ' + REV + ' · reference: ' + BASE_REV + ' · ' + BASE);
  for (const [name, qs] of SHEETS) {
    console.log('— ' + name);
    const grp = name === 'group';
    const fxO = fixture(k => ORDINARY[k]);
    const a = await render(browser, html, fxO, qs), a0 = await render(browser, baseHtml, fxO, qs);
    ok(!a.errors.length, '(a) no page error' + (a.errors.length ? ': ' + a.errors[0] : ''));
    // A group's cover is new by design (d): its per-order documents must not move.
    const t = grp ? a.docs.slice(1).join('\n') : a.text, t0 = grp ? a0.docs.slice(1).join('\n') : a0.text;
    const diffAt = [...t].findIndex((c, i) => c !== t0[i]);
    ok(t === t0 && (!grp || a.docs.length === a0.docs.length), '(a) ordinary texts print identically to ' + BASE_REV + (grp ? ' (the per-order documents)' : '') + ' (' + t.length + ' chars)'
      + (t === t0 ? '' : ' — first difference: ' + JSON.stringify(t.slice(Math.max(0, diffAt - 30), diffAt + 30)) + ' vs ' + JSON.stringify(t0.slice(Math.max(0, diffAt - 30), diffAt + 30))));
    // The group cover holds the same cards in another order: the same links and QR sources, sorted.
    const u = grp ? a.urls.slice().sort() : a.urls, u0 = grp ? a0.urls.slice().sort() : a0.urls;
    ok(u.length > 0 && JSON.stringify(u) === JSON.stringify(u0), '(a) links and QR sources identical (' + u.length + ')');
    if (name === 'veroia') {
      ok(vsDateAside(a.wa, ORDINARY.vsname) === vsDateAside(a0.wa, ORDINARY.vsname) && a.wa.length > 0, '(c) WhatsApp text identical to ' + BASE_REV + ' apart from the Veroia date');
      ok(/ · 06\/10\/2026$/.test(vsHead(a.wa, ORDINARY.vsname)) && a.text.includes('06/10/2026'),
        '(c) the Veroia stop is dated by the order\'s Cross-dock Date, as on its sheet — ' + JSON.stringify([vsHead(a.wa, ORDINARY.vsname), vsHead(a0.wa, ORDINARY.vsname)]));
    } else if (!grp) ok(a.wa === a0.wa && a.wa.length > 0, '(c) WhatsApp text identical to ' + BASE_REV);
    else {
      ok(a.waN === 1 && a0.waN === 2, '(c) the group is ONE WhatsApp text (it was one per order)');
      for (const v of [ORDINARY.notes, ORDINARY.ref, ORDINARY.l1name, ORDINARY.l2name, ORDINARY.l3name, ORDINARY.goods])
        ok(a.wa.includes(v), '(c) the group text carries ' + JSON.stringify(v) + ' as typed');
      // (d) groupRoute, EXPORT: drops in the dispatcher order (A then B); pickups by
      // date — B's 05/10 (no time = start of the day) before A's 05/10 07:00.
      const c = a.cover || {};
      ok(JSON.stringify(c.route) === JSON.stringify([ORDINARY.l2name + ' | 05/10/2026', ORDINARY.l3name + ' | 08/10/2026']),
        '(d) cover route = first loading → last delivery of the route — ' + JSON.stringify(c.route));
      ok(JSON.stringify(c.sections) === '["ΦΟΡΤΩΣΕΙΣ","ΠΑΡΑΔΟΣΕΙΣ"]', '(d) cover headings — ' + JSON.stringify(c.sections));
      ok(JSON.stringify(c.tls) === JSON.stringify([['1 ' + ORDINARY.l2name, '2 ' + ORDINARY.l1name], ['1 ' + ORDINARY.l2name, '2 ' + ORDINARY.l3name]]),
        '(d) cover cards in groupRoute order, numbered from 1 in each section — ' + JSON.stringify(c.tls));
      const waNames = a.wa.split('\n').map((l, i, ls) => /^\S+ \*(ΦΟΡΤΩΣΗ|ΠΑΡΑΔΟΣΗ)\* · /.test(l) ? ls[i + 1] : null).filter(Boolean);
      ok(JSON.stringify(waNames) === JSON.stringify([].concat(...(c.tls || []).map(tl => tl.map(x => x.replace(/^\d+ /, ''))))),
        '(d) the WhatsApp text lists the same stops in the same order — ' + JSON.stringify(waNames));
    }
    for (const s of ['Αγρόκτημα Βέροιας & Υιοί', 'Trans & Co "Balkan" Α.Ε.', 'PO-77 "A&B"', "O'Neil's dock", "O'Brien Fresh Hub", 'Lidl "Ecser" DC'])
      if (a0.text.includes(s)) ok(a.text.includes(s), '(a) prints ' + JSON.stringify(s));
    const fxM = fixture(k => MARKUP[k]);
    const b = await render(browser, html, fxM, qs), b0 = await render(browser, baseHtml, fxM, qs);
    ok(!b.errors.length, '(b) no page error' + (b.errors.length ? ': ' + b.errors[0] : ''));
    ok(b.mk.length === 0, '(b) markup creates no element' + (b.mk.length ? ' — ' + b.mk.length + ': ' + b.mk.slice(0, 12).join(', ') : ''));
    const shown = Object.keys(MARKUP).filter(k => MARKUP[k] !== ORDINARY[k] && b0.text.indexOf(MARKUP[k]) < 0 && b.text.includes(MARKUP[k]));
    const lost = Object.keys(MARKUP).filter(k => MARKUP[k] !== ORDINARY[k] && /^<b /.test(MARKUP[k]) && b0.mk.some(x => x.endsWith(':' + k)) && !b.text.includes(MARKUP[k]));
    ok(lost.length === 0, '(b) every field that rendered as markup now prints as typed (' + shown.length + ' fields)' + (lost.length ? ' — not as text: ' + lost.join(', ') : ''));
    // Veroia + markup: BASE_REV's estimate parsed the markup «Loading DateTime»,
    // threw, and printed both stops as «—». The real Cross-dock Date needs no
    // parsing, so the stops (and their typed markup) now reach the text.
    if (name === 'veroia') ok(b.wa.includes(MARKUP.notes) && b.wa.includes(MARKUP.vsname) && /^(\S+) \*ΦΟΡΤΩΣΗ\* · 06\/10\/2026$/.test(vsHead(b.wa, MARKUP.vsname)) && !/&lt;|&amp;|&quot;/.test(b.wa),
      '(c) WhatsApp text plain (markup kept as typed), the Veroia stop named and dated by the Cross-dock Date — ' + JSON.stringify(vsHead(b.wa, MARKUP.vsname)));
    else if (!grp) ok(b.wa === b0.wa && b.wa.includes(MARKUP.notes), '(c) WhatsApp text plain and unchanged (markup kept as typed)');
    else ok(b.waN === 1 && [MARKUP.notes, MARKUP.ref, MARKUP.l1name, MARKUP.goods].every(v => b.wa.includes(v)) && !/&lt;|&amp;|&quot;/.test(b.wa),
      '(c) the group text is plain text: typed markup as typed, nothing escaped');
  }
  await browser.close();
  console.log('\n' + pass + ' ✓ · ' + fail + ' ✗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
