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
const T = { NL: 'tblVW42cZnfC47gTb', NO: 'tblGHCCsTMqAy4KR2', TR: 'tblEAPExIAjiA3asD', TL: 'tblDcrqRJXzPrtYLm', DR: 'tbl7UGmYhc2Y82pPs', PT: 'tblLHl5m8bqONfhWv', PA: 'tblUhgqnmiam5MGNK', LOC: 'tblxu8DRfTQOFRCzS' };
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
    [T.LOC]: [{ id: 'recLocVeroia0001', fields: { Name: 'CROSS-DOCK', City: 'Veroia', Country: 'Greece' } }],
    [T.NO]: [{ id: 'recNatOrderC0001', fields: { Status: 'Assigned', Direction: NS } },
      { id: 'recNatOrderT0001', fields: { Status: 'In Transit', Direction: NS } },
      { id: 'recNatOrderE0001', fields: { Status: 'Pending', Direction: NS } }],
    [T.PA]: [
      { id: 'recPAnC000000001', fields: { 'Nat Load': ['recNlC000000000A'], Partner: ['recPartner00001A'], 'Partner Rate': 400, Status: 'Assigned' } },
      { id: 'recPAsC000000001', fields: { 'Nat Load': ['recNlsC00000000A'], Partner: ['recPartner00001A'], 'Partner Rate': 400, Status: 'Assigned' } },
      // review 4/10 (HIGH): PA rows of trips that already ran = payables
      { id: 'recPAdP000000001', fields: { 'Nat Load': ['recNlDP00000000A'], Partner: ['recPartner00001A'], 'Partner Rate': 300, Status: 'Delivered', 'Assignment Date': '2026-09-30' } },
      { id: 'recPAdO000000001', fields: { 'Nat Load': ['recNlDO00000000A'], Partner: ['recPartner00001A'], 'Partner Rate': 250, Status: 'Delivered', 'Assignment Date': '2026-09-29' } },
      { id: 'recPAsT000000001', fields: { 'Nat Load': ['recNlsT00000000A'], Partner: ['recPartner00001A'], 'Partner Rate': 200, Status: 'In Transit', 'Assignment Date': '2026-10-01' } },
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
      // owner 4/10 «η ανάθεση δεν κλειδώνει ποτέ» — executed / cancelled / plain loads (Thu 8/10)
      nl('recNlT000000000A', NS, '2026-10-08T08:00:00.000Z', Object.assign(own('recTruck000002AA', 'recDriver00002AA'), { Client: 'NS-T in transit', Status: 'In Transit', 'Source National Order': ['recNatOrderT0001'] })),
      nl('recNlDel0000000A', NS, '2026-10-08T09:00:00.000Z', Object.assign(own('recTruck000001AA', 'recDriver00001AA'), { Client: 'NS-DEL delivered', Status: 'Delivered' })),
      nl('recNlX000000000A', NS, '2026-10-08T10:00:00.000Z', Object.assign(own('recTruck000001AA', 'recDriver00001AA'), { Client: 'NS-X cancelled', Status: 'Cancelled' })),
      nl('recNlE000000000A', NS, '2026-10-08T11:00:00.000Z', { Client: 'NS-E pending', 'Source National Order': ['recNatOrderE0001'] }),
      nl('recNlsV00000000A', SN, '2026-10-08T12:00:00.000Z', { Client: 'SN-V delivered no vehicle', Status: 'Delivered' }),
      // owner 4/10 «(α) Ακριβώς σαν ανατεθειμένο»: twins that differ ONLY in Status
      nl('recNlTwinAssign0', NS, '2026-10-03T07:00:00.000Z', Object.assign(own('recTruck000002AA', 'recDriver00002AA'), { Client: 'TWIN', Status: 'Assigned' })),
      nl('recNlTwinDeliv00', NS, '2026-10-03T07:00:00.000Z', Object.assign(own('recTruck000002AA', 'recDriver00002AA'), { Client: 'TWIN', Status: 'Delivered' })),
      nl('recNlsTwinAssign', SN, '2026-10-03T08:00:00.000Z', Object.assign(own('recTruck000001AA', 'recDriver00001AA'), { Client: 'TWIN-SN', Status: 'Assigned' })),
      nl('recNlsTwinDeliv0', SN, '2026-10-03T08:00:00.000Z', Object.assign(own('recTruck000001AA', 'recDriver00001AA'), { Client: 'TWIN-SN', Status: 'Delivered' })),
      nl('recNlDP00000000A', NS, '2026-10-08T14:00:00.000Z', Object.assign(par(300, 'ΙΑΒ 3000'), { Client: 'NS-DP delivered partner', Status: 'Delivered' })),
      nl('recNlDO00000000A', NS, '2026-10-08T15:00:00.000Z', Object.assign(own('recTruck000001AA', 'recDriver00001AA'), { Client: 'NS-DO delivered own + old PA', Status: 'Delivered' })),
      nl('recNlsT00000000A', SN, '2026-10-08T16:00:00.000Z', Object.assign(par(200, 'ΙΑΒ 4000'), { Client: 'SN-T in transit partner', Status: 'In Transit' })),
      // a Delivered load whose delivery time has NOT passed: the date alone decides
      nl('recNlFutDeliv000', NS, '2026-10-08T13:00:00.000Z', Object.assign(own('recTruck000002AA', 'recDriver00002AA'), { Client: 'FUTURE DELIVERED', Status: 'Delivered' })),
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

async function openBoard(browser, opts = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const db = seed(); if (opts.noLocations) db[T.LOC] = []; if (opts.mutate) opts.mutate(db);
  const S = { db, writes: [], nlReads: [], errors: [], failGet: new Set() };
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
      if (rid && S.failGet.has(rid)) return json(route, { error: { type: 'SERVER_ERROR' } }, 500);
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
    // same stub for every path compared below; records each dialog so a rig
    // can count them (owner 4/10: ONE confirm) and answer «Ακύρωση» with false
    window.__realConfirm = window.confirmAction;
    window.__confirms = []; window.__confirmAnswer = true;
    window.confirmAction = async (m) => { window.__confirms.push(String(m)); return window.__confirmAnswer; };
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

  // owner 4/10 Q7 «Όπως τα διεθνή»: an ΑΝΟΔΟΣ with its OWN, different truck takes the
  // ΚΑΘΟΔΟΣ vehicle after ONE confirm naming both — not silent, not refused, not two trucks
  await page.evaluate(() => { window.__confirms = []; });
  await dropOn(page, 'recNlsB00000000A', 'recNlB000000000A'); await settle(page);
  const cB = await page.evaluate(() => window.__confirms);
  ok(cB.length === 1 && /είχε φορτηγό ΚΖΗ 1002/.test(cB[0]) && /θα πάρει φορτηγό ΚΖΗ 1001/.test(cB[0]), 'ΑΝΟΔΟΣ with its OWN truck: ONE confirm «είχε … θα πάρει …»: ' + JSON.stringify(cB));
  p = patchesTo(S, 'recNlsB00000000A');
  ok(p[0] && Object.keys(p[0]).join() === 'Matched Load'
     && p[1] && p[1].Truck.length === 0 && p[1].Partner.length === 0 && !('Status' in p[1])
     && p[2] && p[2].Truck[0] === 'recTruck000001AA' && p[2].Driver[0] === 'recDriver00001AA' && p[2]['Partner Rate'] === null,
     'ΑΝΟΔΟΣ with its OWN truck: Matched Load → EMPTY vehicle (its own RT leg leaves, no Status) → the ΚΑΘΟΔΟΣ vehicle: ' + JSON.stringify(p));
  ok((nlOf(S, 'recNlsB00000000A').Truck || [])[0] === 'recTruck000001AA', 'base: the pair is on ONE truck (ΚΖΗ 1001)');

  await dropOn(page, 'recNlsP00000000A', 'recNlP000000000A'); await settle(page);
  const vp = patchesTo(S, 'recNlsP00000000A').find(x => 'Partner' in x);
  ok(vp && vp.Partner[0] === 'recPartner00001A' && vp['Is Partner Trip'] === true && vp['Partner Truck Plates'] === 'ΙΑΒ 1099' && vp.Status === 'Assigned',
     'partner: PATCH on the ΑΝΟΔΟΣ = ' + JSON.stringify(vp));
  ok(vp && !('Partner Rate' in vp) && !('Partner Rate' in nlOf(S, 'recNlsP00000000A')), 'partner: rate NOT copied (owner 4/10 §8.5: one rate, on the ΚΑΘΟΔΟΣ)');
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

// ── §4 #7 · the PE badge on national loads ──────────────────────────────────
SECTIONS.push(async browser => {
  console.log('\n── §4 #7 · PE (pallet exchange) badge');
  const { page, S } = await openBoard(browser);
  ok(S.nlReads.some(f => f.includes('Pallet Exchange')), 'the week read asks the facade for «Pallet Exchange»');
  const peA = await page.$$eval(`#wn-row-${await rowIdOf(page, 'recNlA000000000A')} .wi-b-pe`, els => els.map(e => e.textContent));
  ok(peA.length === 1 && peA[0] === 'PE', 'load with Pallet Exchange shows the «PE» badge (wi-b-pe, as on Weekly International)');
  const peB = await page.$$eval(`#wn-row-${await rowIdOf(page, 'recNlB000000000A')} .wi-b-pe`, els => els.length);
  ok(peB === 0, 'load without Pallet Exchange shows none');
  ok(await page.$$eval('#wn-rows .wi-b-pe', els => els.length) === 1, 'exactly one PE badge on the board (1 PE load in the week)');
  await page.context().close();
});

// ── §4 #10 · the «free» signal says what it counts ──────────────────────────
SECTIONS.push(async browser => {
  console.log('\n── §4 #10 · «ΧΩΡΙΣ ΕΘΝΙΚΗ ΑΝΑΘΕΣΗ ΣΗΜΕΡΑ» (same number)');
  const { page } = await openBoard(browser);
  const sig = await page.$eval('.wn4-free', el => ({ text: el.innerText.replace(/\s+/g, ' ').trim(), title: el.title }));
  ok(/^ΧΩΡΙΣ ΕΘΝΙΚΗ ΑΝΑΘΕΣΗ ΣΗΜΕΡΑ/.test(sig.text) && !/ΕΛΕΥΘΕΡΑ/.test(sig.text), 'label: «' + sig.text + '»');
  // today Mon 5/10: NS-A and NS-B on ΚΖΗ 1001, NS-P on a partner → 1 of 2 trucks without a national assignment
  ok(/1\/2$/.test(sig.text), 'number unchanged by the relabel: 1/2 (ΚΖΗ 1001 busy today, ΚΖΗ 1002 not)');
  ok(/διεθνείς αναθέσεις ΔΕΝ μετρώνται/.test(sig.title), 'tooltip says the international assignments are not counted');
  const sub = await page.$eval('.wk3-sub', el => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  ok(sub.sw <= sub.cw + 1, `filter row does not overflow at 1600px (${sub.sw} ≤ ${sub.cw})`);
  await page.context().close();
});

// ── §4 #12 · popover «Καθαρισμός» = right-click «Αφαίρεση ανάθεσης» ────────
const writesOf = S => S.writes.map(w => ({ m: w.m, tid: w.tid, rid: w.rid, body: w.body }));
async function clearBy(browser, how, sel, answer = true) {
  const { page, S } = await openBoard(browser);
  await page.evaluate(a => { window.__confirmAnswer = a; }, answer);
  const rowSel = await page.evaluate(s => s.startsWith('#') ? s : '#wn-row-' + WNATL.rows.find(r => r.orderId === s).id, sel);
  if (how === 'ctx') {
    await page.click(`${rowSel}${rowSel.startsWith('#wn-sn-') ? '' : ' .wk3-leg'}`, { button: 'right', position: { x: 20, y: 10 } });
    await page.click('#wn-ctx .wi-ctx-item:has-text("Αφαίρεση ανάθεσης")');
  } else {
    await page.click(`${rowSel} .wk3-assign`);
    await page.waitForSelector('#wn-popover .wi-pop-cancel', { timeout: 5000 });
    await page.click('#wn-popover .wi-pop-cancel');
  }
  await page.waitForTimeout(2500);
  const pill = await page.$eval(`${rowSel} .wk3-pill`, el => el.innerText).catch(() => '');
  const out = { writes: writesOf(S), pill, confirms: await page.evaluate(() => window.__confirms), popOpen: await page.$eval('#wn-popover', el => getComputedStyle(el).display !== 'none' && el.innerText.trim() !== ''), errors: S.errors };
  await page.context().close();
  return out;
}
SECTIONS.push(async browser => {
  console.log('\n── §4 #12 · «Καθαρισμός» does exactly what right-click «Αφαίρεση ανάθεσης» does');
  const a = await clearBy(browser, 'ctx', 'recNlC000000000A');
  const b = await clearBy(browser, 'pop', 'recNlC000000000A');
  ok(a.writes.length > 0 && JSON.stringify(a.writes) === JSON.stringify(b.writes), `ΚΑΘΟΔΟΣ (partner, matched): identical write sequence — ${a.writes.length} writes each`);
  const sC = b.writes.find(w => w.m === 'PATCH' && w.rid === 'recNlsC00000000A');
  const nC = b.writes.find(w => w.m === 'PATCH' && w.rid === 'recNlC000000000A');
  ok(nC && nC.body.fields['Partner Rate'] === null && nC.body.fields.Status === 'Pending' && nC.body.fields.Partner.length === 0, 'Καθαρισμός: ΚΑΘΟΔΟΣ partner + rate cleared, Status Pending');
  ok(sC && sC.body.fields['Partner Rate'] === null && sC.body.fields.Partner.length === 0, 'Καθαρισμός: the matched ΑΝΟΔΟΣ is cleared too');
  ok(b.writes.filter(w => w.m === 'DELETE' && w.tid === T.PA).map(w => w.rid).sort().join() === 'recPAnC000000001,recPAsC000000001', 'Καθαρισμός: both PARTNER ASSIGNMENT rows deleted');
  ok(b.writes.some(w => w.m === 'PATCH' && w.tid === T.NO && w.body.fields.Status === 'Pending'), 'Καθαρισμός: source national order back to Pending');
  ok(/ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(b.pill) && !b.popOpen, 'Καθαρισμός: popover closed and the board repainted the row as «ΠΡΟΣ ΑΝΑΘΕΣΗ» (pill: ' + b.pill.replace(/\s+/g, ' ') + ', popover open: ' + b.popOpen + ')');
  const c = await clearBy(browser, 'ctx', '#wn-sn-recNlsD00000000A');
  const d = await clearBy(browser, 'pop', '#wn-sn-recNlsD00000000A');
  ok(c.writes.length > 0 && JSON.stringify(c.writes) === JSON.stringify(d.writes), `standalone ΑΝΟΔΟΣ: identical write sequence — ${c.writes.length} writes each`);
  ok(/χωρίς όχημα/.test(d.pill), 'standalone ΑΝΟΔΟΣ: repainted as «ΑΝΟ · χωρίς όχημα»');
  ok([a, b, c, d].every(x => x.errors.length === 0), 'no page errors');
});

// ── §4 #13 · «Άκυρο» on «νέα άνοδος» leaves no pending match ────────────────
const openNewSn = async (page, nsId) => {
  const rowId = await rowIdOf(page, nsId);
  await page.click(`#wn-ci-${rowId} .wn4-drop`);
  try { await page.waitForSelector('#modalOverlay.open', { timeout: 20000 }); }
  catch (e) { console.log('form did not open; toasts:', JSON.stringify(await page.evaluate(() => window.__toasts)), 'pending:', await pending(page)); throw e; }
  await page.waitForTimeout(300);
};
const pending = page => page.evaluate(() => window._wnPendingMatch ? window._wnPendingMatch.nsId : null);
SECTIONS.push(async browser => {
  console.log('\n── §4 #13 · cancel/close of «νέα άνοδος» clears the pending match');
  const { page, S } = await openBoard(browser);
  await openNewSn(page, 'recNlSat00000000');
  ok(await pending(page) === 'recNlSat00000000', 'empty ΑΝΟΔΟΣ cell → form open, pending match = this ΚΑΘΟΔΟΣ');
  ok(await page.$eval('#nf_Direction', el => el.value) === 'South→North', 'form prefilled ΑΝΟΔΟΣ');
  await page.click('#modalFooter button:has-text("Άκυρο")');
  await page.waitForTimeout(400);
  ok(await pending(page) === null, '«Άκυρο» → pending match gone');
  const before = S.writes.length;
  await page.evaluate(() => window._wnConsumePendingMatch('recNlsP00000000A', { Direction: 'South→North' }));
  await page.waitForTimeout(500);
  ok(S.writes.length === before && !nlOf(S, 'recNlsP00000000A')['Matched Load'], 'the next ΑΝΟΔΟΣ created is NOT bound to the cancelled ΚΑΘΟΔΟΣ (0 writes)');

  await openNewSn(page, 'recNlSat00000000');
  await page.click('#modal .modal-close');
  await page.waitForTimeout(400);
  ok(await pending(page) === null, '✕ in the header → pending match gone too');

  await openNewSn(page, 'recNlSat00000000');
  await page.evaluate(async () => { await window._wnConsumePendingMatch('recNlsP00000000A', { Direction: 'South→North' }); closeModal(); });
  await page.waitForTimeout(800);
  ok(nlOf(S, 'recNlsP00000000A')['Matched Load'] === 'recNlSat00000000' && nlOf(S, 'recNlSat00000000')['Matched Load'] === 'recNlsP00000000A',
     'save path unchanged: a created ΑΝΟΔΟΣ is still bound (Matched Load on both loads)');
  ok(await pending(page) === null, 'and nothing is left pending after it');
  ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
  await page.context().close();

  // submitNatlOrder's duplicate guard opens a REAL confirmAction on the same
  // overlay mid-save: closing that dialog must not drop the pending match.
  const dp = await openBoard(browser);
  await openNewSn(dp.page, 'recNlSat00000000');
  await dp.page.evaluate(() => { window.__realConfirm('Πιθανό duplicate'); });
  await dp.page.waitForSelector('#_cfaOk'); await dp.page.click('#_cfaOk'); await dp.page.waitForTimeout(400);
  ok(await pending(dp.page) === 'recNlSat00000000', 'duplicate confirm inside the save → «Αποθήκευση ως νέα»: pending match KEPT');
  await dp.page.evaluate(async () => { await window._wnConsumePendingMatch('recNlsP00000000A', { Direction: 'South→North' }); closeModal(); });
  await dp.page.waitForTimeout(800);
  ok(nlOf(dp.S, 'recNlsP00000000A')['Matched Load'] === 'recNlSat00000000', '… and the ΑΝΟΔΟΣ saved after it is still bound');
  await openNewSn(dp.page, 'recNlSat00000000');
  await dp.page.evaluate(() => { window.__realConfirm('Πιθανό duplicate'); });
  await dp.page.waitForSelector('#_cfaCancel'); await dp.page.click('#_cfaCancel'); await dp.page.waitForTimeout(400);
  ok(await pending(dp.page) === null, 'duplicate confirm → «Ακύρωση» (save stopped) → pending match gone at once (review 4/10)');
  await openNewSn(dp.page, 'recNlSat00000000');
  await dp.page.evaluate(() => { window.__realConfirm('Πιθανό duplicate'); });
  await dp.page.waitForSelector('#_cfaOk'); await dp.page.keyboard.press('Escape'); await dp.page.waitForTimeout(400);
  ok(await pending(dp.page) === null, 'duplicate confirm → Escape → pending match gone');
  await openNewSn(dp.page, 'recNlSat00000000');
  await dp.page.evaluate(() => { window.__realConfirm('Πιθανό duplicate'); });
  await dp.page.waitForSelector('#_cfaOk'); await dp.page.keyboard.press('Enter'); await dp.page.waitForTimeout(400);
  ok(await pending(dp.page) === 'recNlSat00000000', 'duplicate confirm → Enter (= OK, save goes on) → pending match KEPT');
  await dp.page.evaluate(() => { window.__realConfirm('δεύτερος έλεγχος'); });
  await dp.page.waitForSelector('#_cfaCancel'); await dp.page.click('#_cfaCancel'); await dp.page.waitForTimeout(400);
  ok(await pending(dp.page) === null, '… a SECOND guard dialog cancelled → pending match gone');
  await dp.page.context().close();

  // The form refuses to open when the locations are not loaded (P1 4/10):
  // that path must not leave a pending match either.
  const nl0 = await openBoard(browser, { noLocations: true });
  await nl0.page.click(`#wn-ci-${await rowIdOf(nl0.page, 'recNlSat00000000')} .wn4-drop`);
  await nl0.page.waitForTimeout(2500);
  const t0 = await nl0.page.evaluate(() => window.__toasts.map(t => t[0]).join(' | '));
  ok(/η φόρμα δεν άνοιξε/.test(t0) && await pending(nl0.page) === null, 'form never opened (no locations) → no pending match left');
  await nl0.page.context().close();
});

// ── owner 4/10 «η ανάθεση δεν κλειδώνει ποτέ» ──────────────────────────────
SECTIONS.push(async browser => {
  console.log('\n── owner 4/10 (1) · unassign: Assigned → Pending only, an executed row keeps its status');
  const t = await clearBy(browser, 'ctx', 'recNlT000000000A');
  const pT = t.writes.find(w => w.m === 'PATCH' && w.rid === 'recNlT000000000A');
  ok(pT && pT.body.fields.Truck.length === 0 && !('Status' in pT.body.fields), 'In Transit load: vehicle cleared, NO Status in the payload: ' + JSON.stringify(pT && pT.body.fields));
  ok(!t.writes.some(w => w.tid === T.NO), 'its In Transit national order is not written (no Pending)');
  const c = await clearBy(browser, 'pop', 'recNlC000000000A');
  const pC = c.writes.find(w => w.m === 'PATCH' && w.rid === 'recNlC000000000A');
  ok(pC && pC.body.fields.Status === 'Pending', 'Assigned load: «Καθαρισμός» → Status Pending');
  ok(c.writes.some(w => w.tid === T.NO && w.body.fields.Status === 'Pending'), 'Assigned national order → Pending');
  ok([t, c].every(x => x.errors.length === 0), 'no page errors');
});

// popover «Αποθήκευση/Ενημέρωση ανάθεσης» with a chosen truck; answer = the confirm's answer
async function assignBy(browser, nlId, truckId, answer = true) {
  const { page, S } = await openBoard(browser);
  const rowId = await rowIdOf(page, nlId);
  await page.click(`#wn-row-${rowId} .wk3-assign`);
  await page.waitForSelector(`#wn-pop-btn-${rowId}`, { timeout: 5000 });
  await page.evaluate(([r, t, a]) => { document.getElementById(`wsd-v-tk_wn_${r}`).value = t; window.__confirmAnswer = a; }, [rowId, truckId, answer]);
  const before = S.writes.length;
  await page.click(`#wn-pop-btn-${rowId}`);
  await page.waitForTimeout(2500);
  const out = { writes: S.writes.slice(before), confirms: await page.evaluate(() => window.__confirms), toasts: await page.evaluate(() => window.__toasts), S, errors: S.errors };
  await page.context().close();
  return out;
}
SECTIONS.push(async browser => {
  console.log('\n── owner 4/10 (2) · assignment never moves a status backwards');
  const e = await assignBy(browser, 'recNlE000000000A', 'recTruck000002AA');
  const pE = e.writes.find(w => w.m === 'PATCH' && w.rid === 'recNlE000000000A');
  ok(pE && pE.body.fields.Truck[0] === 'recTruck000002AA' && pE.body.fields.Status === 'Assigned', 'Pending load: vehicle + Status Assigned');
  ok(e.writes.some(w => w.tid === T.NO && w.rid === 'recNatOrderE0001' && w.body.fields.Status === 'Assigned'), 'its Pending national order → Assigned');
  const t = await assignBy(browser, 'recNlT000000000A', 'recTruck000001AA');
  const pT = t.writes.find(w => w.m === 'PATCH' && w.rid === 'recNlT000000000A');
  ok(pT && pT.body.fields.Truck[0] === 'recTruck000001AA' && !('Status' in pT.body.fields), 'In Transit load: vehicle written, NO Status in the payload: ' + JSON.stringify(pT && pT.body.fields));
  ok(!t.writes.some(w => w.tid === T.NO), 'its In Transit national order is not written');
  ok(t.S.db[T.NL].find(r => r.id === 'recNlT000000000A').fields.Status === 'In Transit', 'base: still In Transit');
  ok([e, t].every(x => x.errors.length === 0), 'no page errors');
});

const EXEC_TXT = /μεταφέρεται\/σβήνει δρομολόγιο \+ μισθοδοσία, ακόμη και σε κλειστό δρομολόγιο/;
const nlWrites = x => x.writes.filter(w => w.m !== 'GET' && (w.tid === T.NL || w.tid === T.NO || w.tid === T.PA));
SECTIONS.push(async browser => {
  console.log('\n── owner 4/10 (3) · executed rows: ONE confirm, never a refusal; Cancelled still refused');
  const d = await assignBy(browser, 'recNlDel0000000A', 'recTruck000002AA', true);
  const pD = d.writes.find(w => w.m === 'PATCH' && w.rid === 'recNlDel0000000A');
  ok(d.confirms.length === 1 && EXEC_TXT.test(d.confirms[0]), 're-assign a Delivered load → exactly ONE confirm with the RT/payroll text');
  ok(pD && pD.body.fields.Truck[0] === 'recTruck000002AA' && !('Status' in pD.body.fields), 'confirmed → vehicle written, NO Status in the payload: ' + JSON.stringify(pD && pD.body.fields));
  ok(d.S.db[T.NL].find(r => r.id === 'recNlDel0000000A').fields.Status === 'Delivered', 'base: still Delivered');
  const dn = await assignBy(browser, 'recNlDel0000000A', 'recTruck000002AA', false);
  ok(dn.confirms.length === 1 && nlWrites(dn).length === 0, '«Ακύρωση» → 0 writes (' + nlWrites(dn).length + ')');

  const t = await clearBy(browser, 'ctx', 'recNlT000000000A');
  ok(t.confirms.length === 1 && EXEC_TXT.test(t.confirms[0]), 'clear an In Transit load → ONE confirm (executed text), not two');
  const tn = await clearBy(browser, 'ctx', 'recNlT000000000A', false);
  ok(nlWrites(tn).length === 0, 'clear an In Transit load, «Ακύρωση» → 0 writes');
  const a = await clearBy(browser, 'pop', 'recNlC000000000A');
  ok(a.confirms.length === 1 && a.confirms[0] === 'Αφαίρεση ανάθεσης;', 'clear an Assigned load → the plain dialog, once');

  const x = await assignBy(browser, 'recNlX000000000A', 'recTruck000002AA', true);
  ok(nlWrites(x).length === 0 && x.confirms.length === 0, 'Cancelled load: assignment still refused, 0 writes');
  const xc = await clearBy(browser, 'ctx', 'recNlX000000000A');
  ok(nlWrites(xc).length === 0 && xc.confirms.length === 0, 'Cancelled load: unassign still refused, 0 writes, no dialog');

  // match that puts the ΚΑΘΟΔΟΣ vehicle on a Delivered ΑΝΟΔΟΣ (§4 #5 + owner 4/10)
  for (const answer of [true, false]) {
    const { page, S } = await openBoard(browser);
    await page.evaluate(a => { window.__confirmAnswer = a; }, answer);
    await dropOn(page, 'recNlsV00000000A', 'recNlA000000000A'); await settle(page);
    const c = await page.evaluate(() => window.__confirms);
    const v = patchesTo(S, 'recNlsV00000000A');
    if (answer) {
      const vv = v.find(f => 'Truck' in f);
      ok(c.length === 1 && EXEC_TXT.test(c[0]) && vv && vv.Truck[0] === 'recTruck000001AA' && !('Status' in vv), 'match onto a Delivered ΑΝΟΔΟΣ: ONE confirm → vehicle copied, NO Status: ' + JSON.stringify(vv));
    } else {
      ok(c.length === 1 && S.writes.filter(w => w.m !== 'GET').length === 0, 'match onto a Delivered ΑΝΟΔΟΣ, «Ακύρωση» → 0 writes');
    }
    await page.context().close();
  }
  ok([d, dn, t, tn, a, x, xc].every(r => r.errors.length === 0), 'no page errors');
});

// ── owner 4/10 «(α) Ακριβώς σαν ανατεθειμένο» · Delivered is invisible on the board ──
SECTIONS.push(async browser => {
  console.log('\n── owner 4/10 · an auto-Delivered load looks EXACTLY like an Assigned one');
  const { page, S } = await openBoard(browser);
  const norm = (html, rowId, recId) => html
    .split(recId).join('REC')
    .replace(new RegExp('(wn-row-|wn-ci-|wn-sync-|wn-stops-|wn-grpb-|data-row-id="|,|\\()' + rowId + '\\b', 'g'), '$1ID')
    .replace(/<div class="wk3-num">\d+/, '<div class="wk3-num">N')
    .replace(/title="(Άνοδος )?A?\d+"/, 'title="N"').replace(/>A\d+</, '>AN<');
  const rowHtml = async (recId, sn) => {
    const rowId = await rowIdOf(page, recId);
    const sel = sn ? `#wn-sn-${recId}` : `#wn-row-${rowId}`;
    return norm(await page.$eval(sel, el => el.outerHTML), rowId, recId);
  };
  for (const mode of ['quiet', 'details']) {
    if (mode === 'details') { await page.evaluate(() => _wnToggleDetails()); await page.waitForSelector('#wn-rows'); await page.waitForTimeout(800); }
    const a = await rowHtml('recNlTwinAssign0'), d = await rowHtml('recNlTwinDeliv00');
    ok(a.length > 200 && a === d, `ΚΑΘΟΔΟΣ (${mode}): Delivered row HTML === Assigned row HTML (ids aside)` + (a === d ? '' : '\n      A: ' + a.slice(0, 400) + '\n      D: ' + d.slice(0, 400)));
    const as = await rowHtml('recNlsTwinAssign', true), ds = await rowHtml('recNlsTwinDeliv0', true);
    ok(as.length > 200 && as === ds, `ΑΝΟΔΟΣ (${mode}): Delivered row HTML === Assigned row HTML (ids aside)`);
  }
  const board = await page.$eval('.wn4', el => el.innerText);
  ok(!/παραδόθηκε|Παραδόθηκε|Delivered/.test(board), 'no «παραδόθηκε»/«Delivered» anywhere in the visible board text');
  const legend = await page.$eval('#wn-legend', el => el.textContent);
  ok(/✓ φορτώθηκε \(Status\)/.test(legend) && !/παραδόθηκε/.test(legend), 'legend: «✓ φορτώθηκε (Status)» only');
  const tally = await page.$$eval('.wn4-foot .t', els => els.map(e => e.innerText).find(t => /πέρασε η ώρα παράδοσης/.test(t)) || '');
  const expect = await page.evaluate(() => {
    const all = [...WNATL.data.northsouth, ...WNATL.data.southnorth];
    return WNATL.rows.filter(r => { const f = all.find(x => x.id === r.orderId)?.fields || {}; const t = Date.parse(f['Delivery DateTime'] || ''); return f.Status !== 'Cancelled' && t < Date.now(); }).length + '/' + WNATL.rows.length;
  });
  ok(tally.startsWith(expect), `counter by date only: «${tally.replace(/\s+/g, ' ')}» (expected ${expect})`);
  ok(await page.evaluate(() => OrdersCommon.deliveredByDate('Delivered', '2026-10-08T16:00:00Z') === false && OrdersCommon.deliveredByDate('Assigned', '2026-10-02T16:00:00Z') === true),
     'deliveredByDate: a written Delivered with a future date does NOT count; a past date counts whatever the Status');
  ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
  await page.context().close();
});

// ── review 4/10 (HIGH) · PA rows of executed loads are payables: never deleted, status kept ──
SECTIONS.push(async browser => {
  console.log('\n── review 4/10 · PARTNER ASSIGNMENT rows of executed loads stay');
  const paDel = x => x.writes.filter(w => w.m === 'DELETE' && w.tid === T.PA).map(w => w.rid);
  const c = await clearBy(browser, 'ctx', 'recNlDP00000000A');
  ok(c.writes.some(w => w.m === 'PATCH' && w.rid === 'recNlDP00000000A' && w.body.fields.Partner.length === 0), 'Delivered partner load: unassign clears the vehicle on the load');
  ok(paDel(c).length === 0, 'Delivered partner load: its PA row is NOT deleted (right-click / Καθαρισμός)');
  const sn = await clearBy(browser, 'ctx', '#wn-sn-recNlsT00000000A');
  ok(sn.writes.some(w => w.m === 'PATCH' && w.rid === 'recNlsT00000000A') && paDel(sn).length === 0, 'In Transit partner ΑΝΟΔΟΣ: unassign clears the load, PA row NOT deleted');
  const pl = await clearBy(browser, 'pop', 'recNlC000000000A');
  ok(paDel(pl).sort().join() === 'recPAnC000000001,recPAsC000000001', 'planned (Assigned) partner pair: PA rows still deleted as before');
  const o = await assignBy(browser, 'recNlDO00000000A', 'recTruck000002AA', true);
  ok(o.writes.some(w => w.m === 'PATCH' && w.rid === 'recNlDO00000000A') && paDel(o).length === 0, 'Delivered load re-assigned to own truck: its PA row NOT deleted');
  // partner re-assignment (new rate) on a Delivered partner load
  {
    const { page, S } = await openBoard(browser);
    const rowId = await rowIdOf(page, 'recNlDP00000000A');
    await page.click(`#wn-row-${rowId} .wk3-assign`);
    await page.waitForSelector(`#wn-pop-btn-${rowId}`, { timeout: 5000 });
    await page.fill(`#wn-pop-rate-${rowId}`, '320');
    const before = S.writes.length;
    await page.click(`#wn-pop-btn-${rowId}`); await page.waitForTimeout(2500);
    const w = S.writes.slice(before);
    const paP = w.find(x => x.m === 'PATCH' && x.tid === T.PA && x.rid === 'recPAdP000000001');
    ok(paP && paP.body.fields['Partner Rate'] === 320 && !('Status' in paP.body.fields) && !('Assignment Date' in paP.body.fields),
       'Delivered partner re-assignment: PA PATCH carries the new rate, NO Status, NO Assignment Date: ' + JSON.stringify(paP && paP.body.fields));
    const pa = S.db[T.PA].find(r => r.id === 'recPAdP000000001').fields;
    ok(pa.Status === 'Delivered' && pa['Assignment Date'] === '2026-09-30', 'base: PA stays Delivered, assigned 30/9');
    ok(!w.some(x => x.m === 'POST' && x.tid === T.PA), 'no second PA row created');
    await page.context().close();
  }
  ok([c, sn, pl, o].every(x => x.errors.length === 0), 'no page errors');
});

// ── review 4/10 (LOWs, coordinator: tonight) ────────────────────────────────
SECTIONS.push(async browser => {
  console.log('\n── review 4/10 LOW a · a create that ends without consuming the match drops it');
  const { page, S } = await openBoard(browser);
  // retry case: the save fails while OUR form is still open → kept for the retry
  await openNewSn(page, 'recNlSat00000000');
  await page.evaluate(async () => { await submitNatlOrder(); });
  await page.waitForTimeout(600);
  ok(await page.$('#modalOverlay.open #nf_Direction') && await pending(page) === 'recNlSat00000000',
     'save refused with the form still open (retry possible) → pending match KEPT');
  await page.click('#modalFooter button:has-text("Άκυρο")'); await page.waitForTimeout(400);
  // OK on the duplicate dialog (form replaced), then the save ends without a load
  await openNewSn(page, 'recNlSat00000000');
  await page.evaluate(() => { window.__realConfirm('Πιθανό duplicate'); });
  await page.waitForSelector('#_cfaOk'); await page.click('#_cfaOk'); await page.waitForTimeout(400);
  ok(await pending(page) === 'recNlSat00000000', 'duplicate dialog → OK: pending kept while the save is in flight');
  await page.evaluate(async () => { await submitNatlOrder(); });
  await page.waitForTimeout(600);
  ok(await pending(page) === null, '… the save then ends without a load (form gone) → pending match dropped at once, not after 30\'');
  const before = S.writes.length;
  await page.evaluate(() => window._wnConsumePendingMatch('recNlsP00000000A', { Direction: 'South→North' }));
  await page.waitForTimeout(500);
  ok(S.writes.length === before && !nlOf(S, 'recNlsP00000000A')['Matched Load'], 'the next ΑΝΟΔΟΣ is NOT bound to that ΚΑΘΟΔΟΣ (0 writes)');
  ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
  await page.context().close();

  console.log('\n── review 4/10 LOW b · status unreadable → PA rows fail CLOSED');
  const paDel = x => x.filter(w => w.m === 'DELETE' && w.tid === T.PA);
  // a failed read is retried by core/api.js (1s + 2s per load) — wait for the
  // load PATCH itself, then let the PA step run, instead of a fixed delay
  const untilWrite = async (page, S, pred) => {
    for (let t = 0; t < 40 && !S.writes.some(pred); t++) await page.waitForTimeout(500);
    await page.waitForTimeout(2000);
  };
  {
    const { page, S } = await openBoard(browser);
    ['recNlC000000000A', 'recNlsC00000000A'].forEach(id => S.failGet.add(id));
    const rowSel = '#wn-row-' + await rowIdOf(page, 'recNlC000000000A');
    await page.click(`${rowSel} .wk3-leg`, { button: 'right', position: { x: 20, y: 10 } });
    await page.click('#wn-ctx .wi-ctx-item:has-text("Αφαίρεση ανάθεσης")');
    await untilWrite(page, S, w => w.m === 'PATCH' && w.rid === 'recNlC000000000A');
    const w = writesOf(S);
    ok(w.some(x => x.m === 'PATCH' && x.rid === 'recNlC000000000A'), 'right-click unassign, status read failed → the load is still cleared');
    ok(paDel(w).length === 0, 'right-click unassign, status read failed → NO PA row deleted: ' + JSON.stringify(paDel(w).map(x => x.rid)));
    ok(S.db[T.PA].some(r => r.id === 'recPAnC000000001') && S.db[T.PA].some(r => r.id === 'recPAsC000000001'), 'base: both PA rows still there');
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }
  {
    const { page, S } = await openBoard(browser);
    // standalone ΑΝΟΔΟΣ (recNlsD) given a PA row for this case only — the PA
    // lookup reads the whole table and filters in the page (pa-helpers)
    S.db[T.PA].push({ id: 'recPAsD000000001', fields: { 'Nat Load': ['recNlsD00000000A'], Partner: ['recPartner00001A'], 'Partner Rate': 150, Status: 'Assigned' } });
    S.failGet.add('recNlsD00000000A');
    await page.click('#wn-sn-recNlsD00000000A', { button: 'right', position: { x: 20, y: 10 } });
    await page.click('#wn-ctx .wi-ctx-item:has-text("Αφαίρεση ανάθεσης")');
    await untilWrite(page, S, w => w.m === 'PATCH' && w.rid === 'recNlsD00000000A');
    ok(writesOf(S).some(w => w.m === 'PATCH' && w.rid === 'recNlsD00000000A') && paDel(writesOf(S)).length === 0, 'standalone ΑΝΟΔΟΣ unassign, status read failed → load cleared, NO PA row deleted');
    await page.context().close();
  }
  {
    const { page, S } = await openBoard(browser);
    ['recNlC000000000A', 'recNlsC00000000A'].forEach(id => S.failGet.add(id));
    const rowId = await rowIdOf(page, 'recNlC000000000A');
    await page.click(`#wn-row-${rowId} .wk3-assign`);
    await page.waitForSelector(`#wn-pop-btn-${rowId}`, { timeout: 5000 });
    await page.fill(`#wn-pop-rate-${rowId}`, '450');
    const before = S.writes.length;
    await page.click(`#wn-pop-btn-${rowId}`);
    await untilWrite(page, S, w => w.m === 'PATCH' && w.tid === T.PA);
    const paP = S.writes.slice(before).filter(x => x.m === 'PATCH' && x.tid === T.PA);
    ok(paP.length > 0 && paP.every(x => !('Status' in x.body.fields) && !('Assignment Date' in x.body.fields)),
       'partner re-assign, status read failed → PA PATCH without Status/Assignment Date (not rewritten «Assigned»): ' + JSON.stringify(paP.map(x => x.body.fields)));
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }
});

// ── owner 4/10 §8.5 · ONE partner rate per round trip, on the ΚΑΘΟΔΟΣ only ──
SECTIONS.push(async browser => {
  console.log('\n── owner 4/10 §8.5 · partner rate written on the ΚΑΘΟΔΟΣ only');
  const nlP = x => x.filter(w => w.m === 'PATCH' && w.tid === T.NL);
  const paP = x => x.filter(w => w.m === 'PATCH' && w.tid === T.PA);
  // recNlC + recNlsC: partner pair, 400 on BOTH legs and on both PA rows (the pre-4/10 way)
  {
    const { page, S } = await openBoard(browser);
    const rowId = await rowIdOf(page, 'recNlC000000000A');
    await page.click(`#wn-row-${rowId} .wk3-assign`);
    await page.waitForSelector(`#wn-pop-btn-${rowId}`, { timeout: 5000 });
    ok(await page.$eval(`#wn-pop-rate-${rowId}`, el => el.value) === '400', 'pair: popover shows ONE rate (400)');
    ok(/κάθοδος \+ άνοδος/.test(await page.$eval(`#wn-pop-rate-${rowId}`, el => el.previousElementSibling.textContent)), 'pair: label says the rate is for κάθοδος + άνοδος');
    await page.fill(`#wn-pop-rate-${rowId}`, '450');
    const before = S.writes.length;
    await page.click(`#wn-pop-btn-${rowId}`); await page.waitForTimeout(2500);
    const w = S.writes.slice(before);
    const ns = nlP(w).find(x => x.rid === 'recNlC000000000A'), sn = nlP(w).find(x => x.rid === 'recNlsC00000000A');
    ok(ns && ns.body.fields['Partner Rate'] === 450, 'ΚΑΘΟΔΟΣ load PATCH: Partner Rate 450');
    ok(sn && 'Partner Rate' in sn.body.fields && sn.body.fields['Partner Rate'] === null && sn.body.fields.Partner[0] === 'recPartner00001A',
       'ΑΝΟΔΟΣ load PATCH: same partner, Partner Rate null: ' + JSON.stringify(sn && sn.body.fields));
    const pn = paP(w).find(x => x.rid === 'recPAnC000000001'), ps = paP(w).find(x => x.rid === 'recPAsC000000001');
    ok(pn && pn.body.fields['Partner Rate'] === 450, 'ΚΑΘΟΔΟΣ PA row: rate 450');
    ok(ps && 'Partner Rate' in ps.body.fields && ps.body.fields['Partner Rate'] === null, 'ΑΝΟΔΟΣ PA row: rate cleared (null): ' + JSON.stringify(ps && ps.body.fields));
    const sum = ['recNlC000000000A', 'recNlsC00000000A'].reduce((a, id) => a + (Number(nlOf(S, id)['Partner Rate']) || 0), 0);
    const paSum = S.db[T.PA].filter(r => ['recPAnC000000001', 'recPAsC000000001'].includes(r.id)).reduce((a, r) => a + (Number(r.fields['Partner Rate']) || 0), 0);
    ok(sum === 450 && paSum === 450, `base: the pair carries 450 once — loads Σ ${sum}, PA rows Σ ${paSum} (034 sums per leg)`);
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }
  // legacy pair: rate only on the ΑΝΟΔΟΣ → shown as the round-trip rate, moved to the ΚΑΘΟΔΟΣ on save
  {
    const { page, S } = await openBoard(browser, { mutate: db => { delete db[T.NL].find(r => r.id === 'recNlC000000000A').fields['Partner Rate']; } });
    const rowId = await rowIdOf(page, 'recNlC000000000A');
    await page.click(`#wn-row-${rowId} .wk3-assign`);
    await page.waitForSelector(`#wn-pop-btn-${rowId}`, { timeout: 5000 });
    ok(await page.$eval(`#wn-pop-rate-${rowId}`, el => el.value) === '400', 'rate only on the ΑΝΟΔΟΣ → popover shows it as the round-trip rate (400)');
    await page.click(`#wn-pop-btn-${rowId}`); await page.waitForTimeout(2500);
    ok(nlOf(S, 'recNlC000000000A')['Partner Rate'] === 400 && !('Partner Rate' in nlOf(S, 'recNlsC00000000A')), 'saved: 400 moved to the ΚΑΘΟΔΟΣ, ΑΝΟΔΟΣ empty');
    await page.context().close();
  }
  // a standalone ΑΝΟΔΟΣ is its own trip: it keeps its own rate
  {
    const { page, S } = await openBoard(browser);
    const before = S.writes.length;
    await page.evaluate(() => { const r = WNATL.rows.find(x => x.type === 'southnorth' && x.orderId === 'recNlsD00000000A'); r.partnerId = 'recPartner00001A'; r.partnerRate = '180'; });
    await page.evaluate(() => _wnSaveFromPopover(WNATL.rows.find(x => x.type === 'southnorth' && x.orderId === 'recNlsD00000000A').id));
    await page.waitForTimeout(2500);
    const d = nlP(S.writes.slice(before)).find(x => x.rid === 'recNlsD00000000A');
    ok(d && d.body.fields['Partner Rate'] === 180, 'standalone ΑΝΟΔΟΣ: keeps its own rate (180)');
    await page.context().close();
  }
  // match of two legs that each already carry a rate → heard, nothing guessed
  {
    const { page, S } = await openBoard(browser, { mutate: db => {
      const sn = db[T.NL].find(r => r.id === 'recNlsP00000000A'); Object.assign(sn.fields, { Partner: ['recPartner00001A'], 'Is Partner Trip': true, 'Partner Rate': 300, Status: 'Assigned' });
    } });
    await dropOn(page, 'recNlsP00000000A', 'recNlP000000000A'); await settle(page);
    const t = await page.evaluate(() => window.__toasts.map(x => x[0]).join(' | '));
    ok(/Κόμιστρο και στην κάθοδο και στην άνοδο/.test(t), 'match of two rated legs → warning toast');
    ok(!S.writes.some(w => w.m === 'PATCH' && w.body && w.body.fields && 'Partner Rate' in w.body.fields), 'match writes no Partner Rate');
    await page.context().close();
  }
});

// ── owner 4/10 (Q2+Q3) · unmatch «×»: the ΑΝΟΔΟΣ leaves without assignment, the ΚΑΘΟΔΟΣ keeps truck + RT ──
SECTIONS.push(async browser => {
  console.log('\n── owner 4/10 · «×» unmatch: ΑΝΟΔΟΣ without vehicle, ΚΑΘΟΔΟΣ untouched');
  const pairOwn = db => {
    const ns = db[T.NL].find(r => r.id === 'recNlB000000000A'), sn = db[T.NL].find(r => r.id === 'recNlsB00000000A');
    ns.fields['Matched Load'] = 'recNlsB00000000A'; sn.fields['Matched Load'] = 'recNlB000000000A';
    sn.fields.Truck = ['recTruck000001AA']; sn.fields.Driver = ['recDriver00001AA'];   // same truck as the ΚΑΘΟΔΟΣ (one RT from 5/10)
  };
  const unmatch = (page, ns, sn) => page.evaluate(([n, s]) => _wnUnmatch(WNATL.rows.find(r => r.orderId === n).id, s), [ns, sn]);
  {
    const { page, S } = await openBoard(browser, { mutate: pairOwn });
    const before = S.writes.length;
    await unmatch(page, 'recNlB000000000A', 'recNlsB00000000A'); await settle(page);
    const w = S.writes.slice(before).filter(x => x.m !== 'GET');
    const seq = w.map(x => x.tid === T.NL ? x.rid.slice(0, 8) + ':' + Object.keys(x.body.fields).join('+') : x.m + ' ' + x.tid);
    ok(seq[0] === 'recNlB00:Matched Load' && seq[1] === 'recNlsB0:Matched Load', 'match cleared on BOTH loads first: ' + seq.slice(0, 2).join(' , '));
    const vi = w.findIndex(x => x.tid === T.NL && x.rid === 'recNlsB00000000A' && 'Truck' in x.body.fields);
    ok(vi > 1, 'THEN the ΑΝΟΔΟΣ vehicle is cleared (write #' + (vi + 1) + ')');
    const snF = nlOf(S, 'recNlsB00000000A'), nsF = nlOf(S, 'recNlB000000000A');
    ok(!snF.Truck && !snF.Driver && !snF.Partner && snF.Status === 'Pending' && !snF['Matched Load'], 'base: ΑΝΟΔΟΣ has no vehicle, Pending, no match: ' + JSON.stringify(snF).slice(0, 160));
    ok((nsF.Truck || [])[0] === 'recTruck000001AA' && nsF.Status === 'Assigned' && !nsF['Matched Load'], 'base: ΚΑΘΟΔΟΣ keeps its truck and status');
    ok(!w.some(x => x.tid === T.NL && x.rid === 'recNlB000000000A' && Object.keys(x.body.fields).some(k => k !== 'Matched Load')), 'ΚΑΘΟΔΟΣ: nothing but Matched Load written');
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }
  {
    // partner pair: the ΑΝΟΔΟΣ PA row goes with its vehicle, the ΚΑΘΟΔΟΣ row stays
    const { page, S } = await openBoard(browser);
    const before = S.writes.length;
    await unmatch(page, 'recNlC000000000A', 'recNlsC00000000A'); await settle(page);
    const w = S.writes.slice(before);
    ok(w.filter(x => x.m === 'DELETE' && x.tid === T.PA).map(x => x.rid).join() === 'recPAsC000000001', 'partner pair: only the ΑΝΟΔΟΣ PA row deleted');
    ok(!nlOf(S, 'recNlsC00000000A').Partner && (nlOf(S, 'recNlC000000000A').Partner || [])[0] === 'recPartner00001A', 'base: ΑΝΟΔΟΣ without partner, ΚΑΘΟΔΟΣ keeps it');
    await page.context().close();
  }
  {
    // owner Q8 «πάντα βγαίνει η ανάθεση»: an executed ΑΝΟΔΟΣ loses its vehicle too —
    // after ONE confirm; its Status is not set back and its PA row (a payable) stays
    const { page, S } = await openBoard(browser, { mutate: db => { pairOwn(db); db[T.NL].find(r => r.id === 'recNlsB00000000A').fields.Status = 'Delivered'; } });
    const before = S.writes.length;
    await unmatch(page, 'recNlB000000000A', 'recNlsB00000000A'); await settle(page);
    const c = await page.evaluate(() => window.__confirms);
    ok(c.length === 1 && /σε εκτέλεση/.test(c[0]) && /αφαιρεί την ανάθεση της ανόδου/.test(c[0]), 'Delivered ΑΝΟΔΟΣ: ONE confirm that says what happens: ' + JSON.stringify(c));
    const w = S.writes.slice(before).filter(x => x.m !== 'GET');
    const v = w.find(x => x.tid === T.NL && x.rid === 'recNlsB00000000A' && 'Truck' in x.body.fields);
    ok(v && !('Status' in v.body.fields), 'Delivered ΑΝΟΔΟΣ: vehicle cleared, NO Status in the payload');
    const f = nlOf(S, 'recNlsB00000000A');
    ok(!f.Truck && f.Status === 'Delivered', 'base: Delivered ΑΝΟΔΟΣ without vehicle, still Delivered');
    ok((nlOf(S, 'recNlB000000000A').Truck || [])[0] === 'recTruck000001AA', 'base: ΚΑΘΟΔΟΣ keeps its truck');
    await page.context().close();
  }
  {
    // «Ακύρωση» in that confirm → nothing written
    const { page, S } = await openBoard(browser, { mutate: db => { pairOwn(db); db[T.NL].find(r => r.id === 'recNlsB00000000A').fields.Status = 'In Transit'; } });
    await page.evaluate(() => { window.__confirmAnswer = false; });
    const before = S.writes.length;
    await unmatch(page, 'recNlB000000000A', 'recNlsB00000000A'); await settle(page);
    ok(S.writes.slice(before).filter(x => x.m !== 'GET').length === 0 && nlOf(S, 'recNlsB00000000A')['Matched Load'] === 'recNlB000000000A', 'In Transit ΑΝΟΔΟΣ, «Ακύρωση» → 0 writes, pair kept');
    await page.context().close();
  }
  {
    // status unreadable → treated like executed: one confirm, vehicle cleared, no Status, PA kept
    const { page, S } = await openBoard(browser, { mutate: pairOwn });
    S.failGet.add('recNlsB00000000A');
    const before = S.writes.length;
    await unmatch(page, 'recNlB000000000A', 'recNlsB00000000A');
    for (let t = 0; t < 30 && !S.writes.slice(before).some(x => x.m === 'PATCH' && x.rid === 'recNlsB00000000A' && 'Truck' in x.body.fields); t++) await page.waitForTimeout(500);
    await settle(page);
    const v = S.writes.slice(before).find(x => x.m === 'PATCH' && x.rid === 'recNlsB00000000A' && 'Truck' in x.body.fields);
    ok((await page.evaluate(() => window.__confirms)).length === 1 && v && !('Status' in v.body.fields), 'unreadable ΑΝΟΔΟΣ status: one confirm, vehicle cleared, NO Status written');
    await page.context().close();
  }
});

// ── owner 4/10 Q7 · match swap: cancel writes nothing; partner swap moves the PA row ──
SECTIONS.push(async browser => {
  console.log('\n── owner 4/10 Q7 · match of an ΑΝΟΔΟΣ that has its own vehicle');
  {
    const { page, S } = await openBoard(browser);
    await page.evaluate(() => { window.__confirmAnswer = false; });
    const before = S.writes.length;
    await dropOn(page, 'recNlsB00000000A', 'recNlB000000000A'); await settle(page);
    ok(S.writes.slice(before).filter(x => x.m !== 'GET').length === 0 && (nlOf(S, 'recNlsB00000000A').Truck || [])[0] === 'recTruck000002AA' && !nlOf(S, 'recNlsB00000000A')['Matched Load'],
       '«Ακύρωση» in the confirm → 0 writes, no match, own truck kept');
    await page.context().close();
  }
  {
    // ΑΝΟΔΟΣ on a partner of its own (PA row 150) matched under an own-truck ΚΑΘΟΔΟΣ → PA row goes
    const { page, S } = await openBoard(browser, { mutate: db => {
      Object.assign(db[T.NL].find(r => r.id === 'recNlsA00000000A').fields, { Partner: ['recPartner00001A'], 'Is Partner Trip': true, 'Partner Rate': 150, Status: 'Assigned' });
      db[T.PA].push({ id: 'recPAsA000000001', fields: { 'Nat Load': ['recNlsA00000000A'], Partner: ['recPartner00001A'], 'Partner Rate': 150, Status: 'Assigned' } });
    } });
    const before = S.writes.length;
    await dropOn(page, 'recNlsA00000000A', 'recNlA000000000A'); await settle(page);
    const c = await page.evaluate(() => window.__confirms);
    ok(c.length === 1 && /είχε συνεργάτη Partner Co/.test(c[0]) && /θα πάρει φορτηγό ΚΖΗ 1001/.test(c[0]), 'partner → own truck: ONE confirm naming both: ' + JSON.stringify(c));
    const f = nlOf(S, 'recNlsA00000000A');
    ok((f.Truck || [])[0] === 'recTruck000001AA' && !f.Partner && !('Partner Rate' in f) && f['Is Partner Trip'] === false, 'base: ΑΝΟΔΟΣ on the ΚΑΘΟΔΟΣ truck, partner + rate gone');
    ok(S.writes.slice(before).some(x => x.m === 'DELETE' && x.tid === T.PA && x.rid === 'recPAsA000000001'), 'its PA row (planned) deleted');
    await page.context().close();
  }
});

(async () => {
  const browser = await chromium.launch();
  for (const s of SECTIONS) await s(browser);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
