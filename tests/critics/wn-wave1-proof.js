// Proof rig — Weekly National, Wave 1 (4/10/2026, report §4 #3 #4 #5 #7 #10 #12 #13).
// The board OPENS in a real browser against a small in-memory facade that
// behaves like the Worker where it matters here: IS_AFTER/IS_BEFORE compare in
// UTC, `fields[]` projects the record (an unrequested field is ABSENT), and a
// NULL/[] write deletes the field. Every PATCH/POST/DELETE is captured and the
// assertions read the PAYLOADS — what reaches the base — not the toast.
// Clock frozen at Mon 5/10/2026 09:00 Athens → current week W41 = Sat 3/10–Fri 9/10.
// Run from the MAIN repo root:
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<wt>/ node .claude/worktrees/<wt>/tests/critics/wn-wave1-proof.js
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const T = { NL: 'tblVW42cZnfC47gTb', NO: 'tblGHCCsTMqAy4KR2', TR: 'tblEAPExIAjiA3asD', TL: 'tblDcrqRJXzPrtYLm', DR: 'tbl7UGmYhc2Y82pPs', PT: 'tblLHl5m8bqONfhWv', PA: 'tblUhgqnmiam5MGNK' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

// ── The «base» ──────────────────────────────────────────────────────────────
const NS = 'North→South', SN = 'South→North';
function nl(id, dir, load, extra) {
  const d = new Date(load); d.setUTCHours(d.getUTCHours() + 6);
  return { id, fields: Object.assign({ Direction: dir, 'Loading DateTime': load, 'Delivery DateTime': d.toISOString(), Status: 'Pending', 'Total Pallets': 10 }, extra) };
}
function seed() {
  const own = (t, dr, tl) => Object.assign({ Truck: [t], Driver: [dr], Status: 'Assigned', 'Is Partner Trip': false }, tl ? { Trailer: [tl] } : {});
  const par = (rate, plates) => ({ Partner: ['recPartner00001A'], 'Is Partner Trip': true, 'Partner Truck Plates': plates, 'Partner Rate': rate, Status: 'Assigned' });
  return {
    [T.TR]: [{ id: 'recTruck000001AA', fields: { 'License Plate': 'ΚΖΗ 1001', Active: true } }, { id: 'recTruck000002AA', fields: { 'License Plate': 'ΚΖΗ 1002', Active: true } }],
    [T.TL]: [{ id: 'recTrailer0001AA', fields: { 'License Plate': 'ΡΥΜ 0001', Active: true } }],
    [T.DR]: [{ id: 'recDriver00001AA', fields: { 'Full Name': 'Driver One', Active: true } }, { id: 'recDriver00002AA', fields: { 'Full Name': 'Driver Two', Active: true } }],
    [T.PT]: [{ id: 'recPartner00001A', fields: { 'Company Name': 'Partner Co' } }],
    [T.NO]: [{ id: 'recNatOrderC0001', fields: { Status: 'Assigned', Direction: NS } }],
    [T.PA]: [
      { id: 'recPAnC000000001', fields: { 'Nat Load': ['recNlC000000000A'], Partner: ['recPartner00001A'], 'Partner Rate': 400, Status: 'Assigned' } },
      { id: 'recPAsC000000001', fields: { 'Nat Load': ['recNlsC00000000A'], Partner: ['recPartner00001A'], 'Partner Rate': 400, Status: 'Assigned' } },
    ],
    [T.NL]: [
      // #3 — week membership (UTC timestamps; Athens = UTC+3)
      nl('recNl120prevFri0', NS, '2026-10-02T09:00:00.000Z', Object.assign(own('recTruck000002AA', 'recDriver00002AA'), { Client: 'PREV FRIDAY 120', Status: 'Delivered', 'Matched Load': 'recNlsSatOf120AA' })),
      nl('recNlsSatOf120AA', SN, '2026-10-03T06:00:00.000Z', { Client: 'SAT ANODOS OF 120', 'Matched Load': 'recNl120prevFri0' }),
      nl('recNlSat00000000', NS, '2026-10-03T06:00:00.000Z', { Client: 'SATURDAY 3-10' }),
      nl('recNlFri00000000', NS, '2026-10-09T15:00:00.000Z', { Client: 'FRIDAY 9-10', 'Matched Load': 'recNlsNextSat000' }),
      nl('recNlsNextSat000', SN, '2026-10-10T07:00:00.000Z', { Client: 'NEXT SAT ANODOS', 'Matched Load': 'recNlFri00000000' }),
      nl('recNlsStrayNext0', SN, '2026-10-10T08:00:00.000Z', { Client: 'STRAY NEXT SAT' }),
      // #5 — match after assignment
      nl('recNlA000000000A', NS, '2026-10-05T06:00:00.000Z', Object.assign(own('recTruck000001AA', 'recDriver00001AA', 'recTrailer0001AA'), { Client: 'NS-A', 'Pallet Exchange': true })),
      nl('recNlsA00000000A', SN, '2026-10-06T06:00:00.000Z', { Client: 'SN-A' }),
      nl('recNlB000000000A', NS, '2026-10-05T07:00:00.000Z', Object.assign(own('recTruck000001AA', 'recDriver00001AA'), { Client: 'NS-B' })),
      nl('recNlsB00000000A', SN, '2026-10-06T07:00:00.000Z', Object.assign(own('recTruck000002AA', 'recDriver00002AA'), { Client: 'SN-B own truck' })),
      nl('recNlP000000000A', NS, '2026-10-05T08:00:00.000Z', Object.assign(par(350, 'ΙΑΒ 1099'), { Client: 'NS-P' })),
      nl('recNlsP00000000A', SN, '2026-10-06T08:00:00.000Z', { Client: 'SN-P' }),
      // #12 — clear vs right-click unassign (partner pair + a standalone ΑΝΟΔΟΣ)
      nl('recNlC000000000A', NS, '2026-10-07T06:00:00.000Z', Object.assign(par(400, 'ΙΑΒ 2000'), { Client: 'NS-C', 'Source National Order': ['recNatOrderC0001'], 'Matched Load': 'recNlsC00000000A' })),
      nl('recNlsC00000000A', SN, '2026-10-08T06:00:00.000Z', Object.assign(par(400, 'ΙΑΒ 2000'), { Client: 'SN-C', 'Matched Load': 'recNlC000000000A' })),
      nl('recNlsD00000000A', SN, '2026-10-08T07:00:00.000Z', Object.assign(own('recTruck000002AA', 'recDriver00002AA'), { Client: 'SN-D alone' })),
    ],
  };
}
function applyFields(target, fields) {
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete target[k]; else target[k] = v;
  }
}
// Worker: IS_AFTER → gt, IS_BEFORE → lt, the date read as UTC midnight.
function nlWindow(f) {
  const a = f.match(/IS_AFTER\(\{Loading DateTime\},'(\d{4}-\d{2}-\d{2})'\)/);
  const b = f.match(/IS_BEFORE\(\{Loading DateTime\},'(\d{4}-\d{2}-\d{2})'\)/);
  if (!a && !b) return null;
  return r => { const t = Date.parse(r.fields['Loading DateTime'] || ''); return (!a || t > Date.parse(a[1] + 'T00:00:00Z')) && (!b || t < Date.parse(b[1] + 'T00:00:00Z')); };
}

async function openBoard(browser) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const db = seed();
  const S = { db, writes: [], nlReads: [], errors: [] };
  page.on('pageerror', e => S.errors.push(String(e)));
  page.on('dialog', d => d.accept());
  // Clock BEFORE preparePage: its fake session is stamped with Date.now() and
  // expires 8h later — stamped with the real time it is already expired at
  // the frozen Monday 09:00.
  await page.clock.setFixedTime(new Date('2026-10-05T09:00:00+03:00'));
  await preparePage(page, 'dispatcher');
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, async route => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const mm = u.pathname.match(/\/v0\/[^/]+\/(tbl[A-Za-z0-9]+)(?:\/(rec[A-Za-z0-9]+))?$/);
    if (!mm) return m === 'GET' ? json(route, { records: [] }) : json(route, { ok: true });
    const [, tid, rid] = mm; const tbl = db[tid] || (db[tid] = []);
    if (m === 'GET') {
      if (rid) { const r = tbl.find(x => x.id === rid); return r ? json(route, r) : json(route, { error: { type: 'NOT_FOUND' } }, 404); }
      const f = u.searchParams.get('filterByFormula') || '';
      let out = tbl;
      if (tid === T.NL) {
        S.nlReads.push(u.searchParams.getAll('fields[]'));
        const w = nlWindow(f); if (w) out = out.filter(w);
        if (/\{Is Partner Trip\}=1/.test(f)) out = out.filter(r => r.fields['Is Partner Trip']);
      }
      const want = u.searchParams.getAll('fields[]');
      if (want.length) out = out.map(r => ({ id: r.id, fields: Object.fromEntries(Object.entries(r.fields).filter(([k]) => want.includes(k))) }));
      return json(route, { records: out });
    }
    const body = req.postDataJSON ? req.postDataJSON() : null;
    S.writes.push({ m, tid, rid, body });
    if (m === 'PATCH') { const r = tbl.find(x => x.id === rid); if (r) applyFields(r.fields, body.fields); return json(route, r || {}); }
    if (m === 'POST') { const r = { id: 'recNew' + S.writes.length, fields: {} }; applyFields(r.fields, body.fields); tbl.push(r); return json(route, r); }
    if (m === 'DELETE') { const i = tbl.findIndex(x => x.id === rid); if (i >= 0) tbl.splice(i, 1); return json(route, { id: rid, deleted: true }); }
    return route.fallback();
  });
  await gotoPage(page, 'weekly_natl', BASE);
  try { await page.waitForSelector('#wn-rows', { timeout: 30000 }); }
  catch (e) { console.log('board did not render:', page.url(), (await page.evaluate(() => document.body.innerText)).slice(0, 600), S.errors); throw e; }
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__toasts = [];
    const t0 = window.toast; window.toast = (m, k) => { window.__toasts.push([String(m), k || '']); try { return t0 && t0(m, k); } catch (_) {} };
    window.confirmAction = async () => true;   // same stub for every path compared below
  });
  return { page, S };
}
const rowIdOf = (page, nlId) => page.evaluate(id => (WNATL.rows.find(r => r.orderId === id) || {}).id, nlId);
const nlOf = (S, id) => S.db[T.NL].find(r => r.id === id).fields;
const settle = page => page.waitForTimeout(1200);

const SECTIONS = [];

// ── §4 #3 · the week shows only its own Saturday–Friday ─────────────────────
SECTIONS.push(async browser => {
  console.log('\n── §4 #3 · week membership (W41 = Sat 3/10 – Fri 9/10)');
  const { page, S } = await openBoard(browser);
  const text = await page.$eval('#wn-rows', el => el.innerText);
  const days = await page.$$eval('#wn-rows [data-day]', els => els.map(e => e.dataset.day));
  ok(await page.evaluate(() => WNATL.week) === 41, 'board opened on W41');
  ok(!/PREV FRIDAY 120/.test(text), 'load of Fri 2/10 (the «120») is NOT on the board');
  ok(!days.includes('2026-10-02'), 'no «ΠΑΡΑΣΚΕΥΗ 02/10» day panel: ' + days.join(','));
  ok(/SATURDAY 3-10/.test(text), 'load of Sat 3/10 is on the board');
  ok(/FRIDAY 9-10/.test(text), 'load of Fri 9/10 is on the board');
  ok(days.length === 7 && days[0] === '2026-10-03' && days[6] === '2026-10-09', 'exactly the 7 days Sat 3/10 … Fri 9/10');
  ok(/NEXT SAT ANODOS/.test(await page.$eval('#wn-ci-' + await rowIdOf(page, 'recNlFri00000000'), el => el.innerText)), 'Fri 9/10 ΚΑΘΟΔΟΣ keeps its Sat 10/10 ΑΝΟΔΟΣ inline (pair lives in the ΚΑΘΟΔΟΣ week)');
  ok(!/STRAY NEXT SAT/.test(text), 'unmatched ΑΝΟΔΟΣ of Sat 10/10 is not on W41');
  ok(!/SAT ANODOS OF 120/.test(text), 'ΑΝΟΔΟΣ already shown under the W40 «120» is not repeated here as unmatched');
  ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
  await page.context().close();
});

// ── §4 #4 · no order-print buttons on national rows ─────────────────────────
SECTIONS.push(async browser => {
  console.log('\n── §4 #4 · order print hidden on national rows');
  const { page, S } = await openBoard(browser);
  const nRows = await page.$$eval('#wn-rows [data-row-id]', els => els.length);
  const prt = await page.$$eval('#wn-rows .wk3-prt', els => els.length);
  const glyph = await page.$eval('#wn-rows', el => (el.innerText.match(/⎙/g) || []).length);
  ok(nRows > 0 && prt === 0 && glyph === 0, `no ⎙ / ⎙A button on ${nRows} national rows (buttons ${prt}, glyphs ${glyph})`);
  const nsId = await rowIdOf(page, 'recNlSat00000000');
  await page.click(`#wn-row-${nsId} .wk3-leg`, { button: 'right' });
  let items = await page.$$eval('#wn-ctx .wi-ctx-item', els => els.map(e => e.textContent.trim()));
  ok(items.length > 0 && !items.some(t => /Εκτύπωση/.test(t)), 'ΚΑΘΟΔΟΣ right-click menu has no «Εκτύπωση»: ' + items.join(' | '));
  await page.evaluate(() => _wnCtxClose());
  await page.click('#wn-sn-recNlsD00000000A', { button: 'right' });
  items = await page.$$eval('#wn-ctx .wi-ctx-item', els => els.map(e => e.textContent.trim()));
  ok(items.length > 0 && !items.some(t => /Εκτύπωση/.test(t)), 'ΑΝΟΔΟΣ right-click menu has no «Εκτύπωση»: ' + items.join(' | '));
  const pills = await page.$$eval('#wn-rows .wk3-assign', els => els.map(e => getComputedStyle(e).gridTemplateColumns));
  ok(pills.length > 0 && pills.every(g => g.split(' ').length === 3), 'assignment cell keeps its 3-column grid');
  ok(await page.evaluate(() => typeof window._wnPrint === 'undefined' && typeof window._wnPrintSn === 'undefined'), 'the dead print handlers are gone from window');
  ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
  await page.context().close();
});

// ── §4 #5 · matching under an assigned ΚΑΘΟΔΟΣ carries the vehicle over ────
const dropOn = (page, snId, nsId) => page.evaluate(async ([sn, ns]) => {
  const rowId = WNATL.rows.find(r => r.orderId === ns).id;
  window._wnDragging = sn; _wnDropOnRow({ preventDefault() {} }, rowId);
}, [snId, nsId]);
const patchesTo = (S, id) => S.writes.filter(w => w.m === 'PATCH' && w.tid === T.NL && w.rid === id).map(w => w.body.fields);
SECTIONS.push(async browser => {
  console.log('\n── §4 #5 · match copies the vehicle onto the ΑΝΟΔΟΣ (only when it has none)');
  let { page, S } = await openBoard(browser);
  await dropOn(page, 'recNlsA00000000A', 'recNlA000000000A'); await settle(page);
  let p = patchesTo(S, 'recNlsA00000000A');
  const veh = p.find(f => 'Truck' in f);
  ok(p.some(f => f['Matched Load'] === 'recNlA000000000A'), 'own fleet: ΑΝΟΔΟΣ gets its Matched Load');
  ok(veh && veh.Truck[0] === 'recTruck000001AA' && veh.Driver[0] === 'recDriver00001AA' && veh.Trailer[0] === 'recTrailer0001AA' && veh['Is Partner Trip'] === false && veh.Status === 'Assigned',
     'own fleet: PATCH on the ΑΝΟΔΟΣ = ' + JSON.stringify(veh));
  let f = nlOf(S, 'recNlsA00000000A');
  ok((f.Truck || [])[0] === 'recTruck000001AA' && f.Status === 'Assigned', 'base: ΑΝΟΔΟΣ now has truck ' + (f.Truck || []).join() + ', Status ' + f.Status);

  await dropOn(page, 'recNlsB00000000A', 'recNlB000000000A'); await settle(page);
  p = patchesTo(S, 'recNlsB00000000A');
  ok(p.length === 1 && Object.keys(p[0]).join() === 'Matched Load', 'ΑΝΟΔΟΣ with its OWN truck: only Matched Load written: ' + JSON.stringify(p));
  ok((nlOf(S, 'recNlsB00000000A').Truck || [])[0] === 'recTruck000002AA', 'base: its own truck kept');

  await dropOn(page, 'recNlsP00000000A', 'recNlP000000000A'); await settle(page);
  const vp = patchesTo(S, 'recNlsP00000000A').find(x => 'Partner' in x);
  ok(vp && vp.Partner[0] === 'recPartner00001A' && vp['Is Partner Trip'] === true && vp['Partner Truck Plates'] === 'ΙΑΒ 1099' && vp.Status === 'Assigned',
     'partner: PATCH on the ΑΝΟΔΟΣ = ' + JSON.stringify(vp));
  ok(vp && !('Partner Rate' in vp) && !('Partner Rate' in nlOf(S, 'recNlsP00000000A')), 'partner: rate NOT copied (owner decision §8.5 open)');
  ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
  await page.context().close();

  ({ page, S } = await openBoard(browser));
  await page.evaluate(() => {
    const row = WNATL.rows.find(r => r.orderId === 'recNlA000000000A');
    window._wnPendingMatch = { rowId: row.id, nsId: row.orderIds[0], at: Date.now() };
    return window._wnConsumePendingMatch('recNlsP00000000A', { Direction: 'South→North' });
  });
  await settle(page);
  const vc = patchesTo(S, 'recNlsP00000000A').find(x => 'Truck' in x);
  ok(vc && vc.Truck[0] === 'recTruck000001AA' && vc.Driver[0] === 'recDriver00001AA' && vc.Status === 'Assigned',
     '«νέα άνοδος» from the empty cell of an assigned ΚΑΘΟΔΟΣ: vehicle written too = ' + JSON.stringify(vc));
  await page.context().close();
});

(async () => {
  const browser = await chromium.launch();
  for (const s of SECTIONS) await s(browser);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
