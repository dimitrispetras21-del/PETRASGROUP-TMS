// Proof rig — «Η ανάθεση δεν κλειδώνει ποτέ» on the Weekly INTERNATIONAL board
// (owner 4/10/2026) + finding B-08 «Καθαρισμός ανάθεσης δεν καθαρίζει τα μέλη
// της ομάδας». The board OPENS in a real browser against an in-memory facade;
// every ORDERS write and every RT leg DELETE is captured IN ORDER, and the
// assertions read the payloads and the facade's rows — not the toast.
// The facade also plays the two DB triggers that make the order of writes
// matter (worker/migrations/013): rt_sync_from_order copies an order's vehicle
// onto every leg of its non-cancelled RT (closed ones too), and a leg DELETE
// on a closed/complete RT is refused 409 like the Worker's canRemoveLeg; an RT
// left with 0 legs becomes 'cancelled' (rt_recompute).
//   (a) re-assign a Delivered order: one confirm → vehicle PATCH without Status; cancel → 0 writes
//   (b) clear an Assigned row → Pending; clear a Delivered row → confirm → vehicle cleared, Status kept
//   (c) clear a grouped row: every Group ID member cleared (GI member too), decided per RT:
//       RT fully cleared → no leg DELETE; RT with an outside leg → members' legs DELETEd first;
//       closed RT with an outside leg → 409 → nothing written
//   (c4) RT with a national (nat_load) leg → the order's leg DELETEd first, the nat leg stays
//   (c5) row spanning TWO mixed RTs, one open + one closed → refused before the confirm, 0 writes
//   (c6) partner group, one member Delivered → its PARTNER ASSIGNMENT row is kept (payable)
//   (d) _wiCancelGroupMember on an executing member → confirm, leg first, no Status Pending
// Run from the MAIN repo root:
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<wt>/ node .claude/worktrees/<wt>/tests/critics/wi-assign-never-locks-proof.js
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const T = { ORD: 'tblgHlNmLBH3JTdIM', TRK: 'tblEAPExIAjiA3asD', DRV: 'tbl7UGmYhc2Y82pPs', PA: 'tblUhgqnmiam5MGNK' };
const VERBATIM = 'μεταφέρεται/σβήνει δρομολόγιο + μισθοδοσία, ακόμη και σε κλειστό δρομολόγιο';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

// ── The «base» ──────────────────────────────────────────────────────────────
const EXP = (id, ref, st, truck, drv, extra = {}) => ({ id, fields: Object.assign({
  Type: 'International', Direction: 'Export', Reference: ref, Status: st,
  'Loading DateTime': '2026-10-05T08:00:00', 'Delivery DateTime': '2026-10-07T10:00:00', 'Total Pallets': 10,
}, truck ? { Truck: [truck], Driver: [drv] } : {}, extra) });
const IMP = (id, ref, st, truck, drv, extra = {}) => ({ id, fields: Object.assign({
  Type: 'International', Direction: 'Import', Reference: ref, Status: st,
  'Loading DateTime': '2026-10-08T08:00:00', 'Delivery DateTime': '2026-10-09T10:00:00', 'Total Pallets': 10,
}, truck ? { Truck: [truck], Driver: [drv] } : {}, extra) });
function seed(opts = {}) {
  const trucks = ['recTruck1', 'recTruck2', 'recTruck3', 'recTruck4', 'recTruck5', 'recTruck6', 'recTruck7', 'recTruck8'];
  const db = {
    [T.TRK]: trucks.map((id, i) => ({ id, fields: { 'License Plate': 'TRK-' + (i + 1), Active: true } })),
    [T.DRV]: trucks.map((_, i) => ({ id: 'recDriver' + (i + 1), fields: { 'Full Name': 'Driver ' + (i + 1), Active: true } })),
    [T.ORD]: [
      EXP('recE1', 'E1-DELIV', 'Delivered', 'recTruck1', 'recDriver1'),            // (a)(b) single, Delivered, closed RT 101
      EXP('recE2', 'E2-ASSIG', 'Assigned', 'recTruck3', 'recDriver3'),             // (b) single, Assigned, RT 102
      EXP('recG1a', 'G1A', 'Assigned', 'recTruck4', 'recDriver4', { 'Group ID': 'GRP-AAA|recG1a,recG1b', 'Matched Import ID': 'recI1' }),
      EXP('recG1b', 'G1B', 'Assigned', 'recTruck4', 'recDriver4', { 'Group ID': 'GRP-AAA|recG1a,recG1b', 'Matched Import ID': 'recI1' }),
      IMP('recI1', 'I1-LEAD', 'Assigned', 'recTruck4', 'recDriver4', { 'Group ID': 'GI-BBB' }),
      IMP('recI2', 'I2-GIMEM', 'Delivered', 'recTruck4', 'recDriver4', { 'Group ID': 'GI-BBB' }), // the member B-08 used to miss
      EXP('recX1', 'X1-OTHER', 'Assigned', 'recTruck5', 'recDriver5'),             // unrelated RT 104, must stay untouched
      EXP('recG2a', 'G2A', 'Assigned', 'recTruck6', 'recDriver6', { 'Group ID': 'GRP-CCC|recG2a,recG2b' }),
      EXP('recG2b', 'G2B', 'Assigned', 'recTruck6', 'recDriver6', { 'Group ID': 'GRP-CCC|recG2a,recG2b' }),
      EXP('recR1', 'R1-ROTA', 'Assigned', 'recTruck6', 'recDriver6', { 'Rotation ID': 'recG2a', 'Loading DateTime': '2026-10-08T08:00:00', 'Delivery DateTime': '2026-10-09T10:00:00' }),
      EXP('recG4a', 'G4A-DELIV', 'Delivered', 'recTruck7', 'recDriver7', { 'Group ID': 'GRP-DDD|recG4a,recG4b' }),
      EXP('recG4b', 'G4B', 'Assigned', 'recTruck7', 'recDriver7', { 'Group ID': 'GRP-DDD|recG4a,recG4b' }),
      EXP('recN1', 'N1-NATLEG', 'Assigned', 'recTruck3', 'recDriver3'),             // (c4) RT-108 also carries a nat_load leg
      EXP('recE6', 'E6', 'Assigned', 'recTruck8', 'recDriver8', { 'Matched Import ID': 'recI6' }), // (c5) RT-109 open + rota R6
      EXP('recR6', 'R6-ROTA', 'Assigned', 'recTruck8', 'recDriver8', { 'Rotation ID': 'recE6', 'Loading DateTime': '2026-10-08T08:00:00', 'Delivery DateTime': '2026-10-09T10:00:00' }),
      IMP('recI6', 'I6', 'Assigned', 'recTruck8', 'recDriver8'),                    // (c5) RT-110 CLOSED + Y6
      EXP('recY6', 'Y6-OTHER', 'Delivered', 'recTruck8', 'recDriver8'),
      EXP('recP1', 'P1-PART-DELIV', 'Delivered', null, null, { 'Group ID': 'GRP-PPP|recP1,recP2', Partner: ['recPartner1'], 'Is Partner Trip': true, 'Partner Rate': 500 }),
      EXP('recP2', 'P2-PART', 'Assigned', null, null, { 'Group ID': 'GRP-PPP|recP1,recP2', Partner: ['recPartner1'], 'Is Partner Trip': true, 'Partner Rate': 500 }),
    ],
  };
  // «Order No» = orders.id (migration 019): _wiRtOf (fix/unmatch-leg-first) finds
  // an order's round trip by it, in a date window of /costs/rt?overlap=1.
  const PG = {}; db[T.ORD].forEach((r, i) => { PG[r.id] = 1000 + i; r.fields['Order No'] = PG[r.id]; });
  const leg = id => ({ id: PG[id] * 10, direction: 'EXPORT', order_id: PG[id], nat_load_id: null });
  const rts = [
    { id: 101, code: 'RT-101', status: 'closed', ct_rt_legs: [leg('recE1')] },
    { id: 102, code: 'RT-102', status: 'planned', ct_rt_legs: [leg('recE2')] },
    { id: 103, code: 'RT-103', status: 'planned', ct_rt_legs: ['recG1a', 'recG1b', 'recI1', 'recI2'].map(leg) },
    { id: 104, code: 'RT-104', status: 'planned', ct_rt_legs: [leg('recX1')] },
    { id: 105, code: 'RT-105', status: opts.rt105 || 'planned', ct_rt_legs: ['recG2a', 'recG2b', 'recR1'].map(leg) },
    { id: 107, code: 'RT-107', status: opts.rt107 || 'planned', ct_rt_legs: ['recG4a', 'recG4b'].map(leg) },
    { id: 108, code: 'RT-108', status: 'planned', ct_rt_legs: [leg('recN1'), { id: 77777, direction: 'EXPORT', order_id: null, nat_load_id: 77 }] },
    { id: 109, code: 'RT-109', status: 'planned', ct_rt_legs: ['recE6', 'recR6'].map(leg) },
    { id: 110, code: 'RT-110', status: 'closed', ct_rt_legs: ['recI6', 'recY6'].map(leg) },
    { id: 111, code: 'RT-111', status: 'planned', ct_rt_legs: ['recP1', 'recP2'].map(leg) },
  ];
  db[T.PA] = [
    { id: 'recPA1', fields: { Order: ['recP1'], Partner: ['recPartner1'], 'Partner Rate': 500, Status: 'Delivered' } },
    { id: 'recPA2', fields: { Order: ['recP2'], Partner: ['recPartner1'], 'Partner Rate': 500, Status: 'Assigned' } },
  ];
  rts.forEach(rt => { const o = db[T.ORD].find(r => PG[r.id] === rt.ct_rt_legs[0].order_id); rt.truck = (o.fields.Truck || [])[0] || null; });
  return { db, PG, rts };
}
function applyFields(target, fields) {
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete target[k]; else target[k] = v;
  }
}
const VEH = ['Truck', 'Trailer', 'Driver', 'Partner', 'Is Partner Trip'];

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 }, serviceWorkers: 'block', timezoneId: 'Europe/Athens' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-05T09:00:00+03:00'));
  const { db, PG, rts } = seed(opts);
  const byPg = pg => Object.keys(PG).find(k => PG[k] === pg);
  const S = { db, PG, rts, log: [], errors: [], armed: false };
  page.on('pageerror', e => S.errors.push(String(e)));
  page.on('dialog', d => d.accept());
  await preparePage(page, 'dispatcher');
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  // rt_sync_from_order (013): the order's vehicle → its live RT and every sibling leg.
  const trigger = (rec) => {
    const pg = PG[rec.id];
    for (const rt of rts) {
      if (rt.status === 'cancelled' || !rt.ct_rt_legs.some(l => l.order_id === pg)) continue;
      rt.truck = (rec.fields.Truck || [])[0] || null;
      for (const l of rt.ct_rt_legs) {
        if (l.order_id === pg) continue;
        const sib = db[T.ORD].find(r => r.id === byPg(l.order_id)); if (!sib) continue;
        for (const k of ['Truck', 'Trailer', 'Driver', 'Partner']) { if (rec.fields[k]) sib.fields[k] = rec.fields[k]; else delete sib.fields[k]; }
        if (S.armed) S.log.push({ k: 'trigger', from: rec.id, to: sib.id, rt: rt.id, truck: (rec.fields.Truck || [])[0] || null });
      }
    }
  };
  await page.route(`**/${HOST}/**`, async route => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const body = (() => { try { return req.postDataJSON(); } catch (_) { return null; } })();
    // ── Worker /costs + /pallets/gate ──
    if (u.pathname === '/pallets/gate') {
      const id = u.searchParams.get('order_recs');
      return json(route, { records: PG[id] != null ? [{ order_id: PG[id] }] : [] });
    }
    const legDel = u.pathname.match(/^\/costs\/rt\/(\d+)\/legs$/);
    if (legDel && m === 'DELETE') {
      const rt = rts.find(r => r.id === +legDel[1]); const pg = +u.searchParams.get('order_id');
      if (opts.legDeleteFails) { S.log.push({ k: 'legdel', rt: rt.id, pg, order: byPg(pg), status: 500 }); return json(route, { error: 'stub' }, 500); }
      if (!rt) return json(route, { error: 'Not found' }, 404);
      if (rt.status === 'closed' || rt.status === 'complete') { S.log.push({ k: 'legdel', rt: rt.id, pg, order: byPg(pg), status: 409 }); return json(route, { error: 'closed' }, 409); }
      rt.ct_rt_legs = rt.ct_rt_legs.filter(l => l.order_id !== pg);
      if (!rt.ct_rt_legs.length) rt.status = 'cancelled';
      S.log.push({ k: 'legdel', rt: rt.id, pg, order: byPg(pg), status: 200 });
      return json(route, { deleted: true });
    }
    if (u.pathname === '/costs/rt' && m === 'GET') {
      if (S.armed) S.log.push({ k: 'rtget', q: u.search });
      return json(route, { records: JSON.parse(JSON.stringify(rts)) });
    }
    if (!u.pathname.startsWith('/v0/')) {
      if (m !== 'GET' && S.armed) S.log.push({ k: 'other', m, path: u.pathname });
      return json(route, m === 'GET' ? { records: [] } : { ok: true });
    }
    // ── facade /v0/<base>/<table>[/<rec>] ──
    const mm = u.pathname.match(/\/v0\/[^/]+\/(tbl[A-Za-z0-9]+)(?:\/(rec[A-Za-z0-9]+))?$/);
    if (!mm) return json(route, m === 'GET' ? { records: [] } : { ok: true });
    const [, tid, rid] = mm; const tbl = db[tid] || (db[tid] = []);
    if (m === 'GET') {
      if (rid) { const r = tbl.find(x => x.id === rid); return r ? json(route, r) : json(route, { error: { type: 'NOT_FOUND' } }, 404); }
      if (tid !== T.ORD) return json(route, { records: tbl });
      const f = u.searchParams.get('filterByFormula') || '';
      let out = [];
      let g;
      if ((g = f.match(/\{Group ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Group ID'] === g[1]);
      else if ((g = f.match(/\{Matched Import ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Matched Import ID'] === g[1]);
      else if ((g = f.match(/\{Rotation ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Rotation ID'] === g[1]);
      else if (/RECORD_ID\(\)/.test(f)) { const want = new Set((f.match(/rec[A-Za-z0-9]+/g) || [])); out = tbl.filter(r => want.has(r.id)); }
      else if ((g = f.match(/\{Direction\}='(Export|Import)'/)) && /International/.test(f)) out = tbl.filter(r => r.fields.Direction === g[1]);
      return json(route, { records: out });
    }
    if (S.armed) S.log.push({ k: m.toLowerCase(), tid, id: rid, fields: body && body.fields ? body.fields : body });
    if (m === 'PATCH' && rid) {
      const r = tbl.find(x => x.id === rid);
      if (r) { applyFields(r.fields, body.fields); if (tid === T.ORD && Object.keys(body.fields).some(k => VEH.includes(k) || k === 'Status')) trigger(r); }
      return json(route, r || {});
    }
    if (m === 'POST') return json(route, { id: 'recNew', fields: (body && body.fields) || {} });
    if (m === 'DELETE') return json(route, { id: rid, deleted: true });
    return json(route, {});
  });
  await gotoPage(page, 'weekly_intl', BASE);
  await page.waitForFunction(() => typeof _wiClear === 'function' && window.WINTL && WINTL.rows && WINTL.rows.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__toasts = []; const t0 = window.toast; window.toast = (m, k) => { window.__toasts.push(String(m)); try { return t0 && t0(m, k); } catch (_) {} }; });
  return { page, S };
}
// Runs an action and answers each confirm modal in turn; returns the modal texts.
async function act(page, S, expr, answers) {
  S.armed = true;
  await page.evaluate(e => { window.__done = false; window.__err = null;
    Promise.resolve().then(() => (0, eval)(e)).then(() => { window.__done = true; }, x => { window.__err = String(x); window.__done = true; }); }, expr);
  const seen = []; const ans = [...answers];
  for (let i = 0; i < 6; i++) {
    const h = await page.waitForFunction(() => window.__done ? 'done'
      : (document.getElementById('_cfaOk') && document.getElementById('modalOverlay').classList.contains('open') ? 'modal' : false), null, { timeout: 20000 });
    if ((await h.jsonValue()) === 'done') break;
    seen.push(await page.$eval('#modal', el => el.innerText));
    await page.click(ans.length && ans.shift() ? '#_cfaOk' : '#_cfaCancel');
    await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open') || window.__done, null, { timeout: 5000 });
  }
  await page.waitForTimeout(400);
  S.armed = false;
  return seen;
}
const rowOf = (page, oid) => page.evaluate(id => (WINTL.rows.find(r => (r.orderIds || []).includes(id)) || {}).id, oid);
const ord = (S, id) => S.db[T.ORD].find(r => r.id === id).fields;
const patches = S => S.log.filter(x => x.k === 'patch' && x.tid === T.ORD);
const legDels = S => S.log.filter(x => x.k === 'legdel');
const writes = S => S.log.filter(x => x.k !== 'trigger' && x.k !== 'rtget');
const idx = (S, pred) => S.log.findIndex(pred);

(async () => {
  const browser = await chromium.launch();

  console.log('\n── (a) re-assign a Delivered order (E1, closed RT-101) to TRK-2');
  let { page, S } = await newPage(browser);
  let rid = await rowOf(page, 'recE1');
  await page.evaluate(id => { const r = WINTL.rows.find(x => x.id === id); r.truckId = 'recTruck2'; r.driverId = 'recDriver2'; r.trailerId = ''; }, rid);
  let seen = await act(page, S, `_wiSaveFromPopover(${rid})`, [false]);
  ok(seen.length === 1 && seen[0].includes(VERBATIM) && seen[0].includes('E1-DELIV'), 'cancel: one confirm, verbatim text, names E1-DELIV');
  ok(writes(S).length === 0, 'cancel: 0 writes (' + writes(S).length + ')');
  ok((ord(S, 'recE1').Truck || [])[0] === 'recTruck1', 'cancel: E1 still on TRK-1');
  seen = await act(page, S, `_wiSaveFromPopover(${rid})`, [true]);
  ok(seen.length === 1, 'accept: exactly one confirm (' + seen.length + ')');
  const pE1 = patches(S).find(p => p.id === 'recE1');
  ok(pE1 && (pE1.fields.Truck || [])[0] === 'recTruck2', 'accept: vehicle PATCH Truck=[recTruck2]');
  ok(pE1 && !('Status' in pE1.fields), 'accept: PATCH carries no Status: ' + JSON.stringify(pE1 && Object.keys(pE1.fields)));
  ok(ord(S, 'recE1').Status === 'Delivered', 'E1 Status still Delivered in the base');
  ok(legDels(S).length === 0 && S.rts.find(r => r.id === 101).truck === 'recTruck2', 'no leg DELETE; closed RT-101 follows the new truck (trigger)');
  ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
  await page.context().close();

  console.log('\n── (b1) clear an Assigned row (E2)');
  ({ page, S } = await newPage(browser));
  rid = await rowOf(page, 'recE2');
  seen = await act(page, S, `_wiClear(${rid})`, [true]);
  ok(seen.length === 1 && !seen[0].includes(VERBATIM), 'one plain confirm (no executing order)');
  const pE2 = patches(S).find(p => p.id === 'recE2');
  ok(pE2 && Array.isArray(pE2.fields.Truck) && pE2.fields.Truck.length === 0 && pE2.fields.Status === 'Pending', 'PATCH Truck=[] + Status Pending');
  ok(!ord(S, 'recE2').Truck && ord(S, 'recE2').Status === 'Pending', 'base: E2 no truck, Pending');
  ok(legDels(S).length === 0, 'RT-102 has only E2 → no leg DELETE (whole RT cleared together)');
  await page.context().close();

  console.log('\n── (b2) clear a Delivered row (E1, closed RT-101)');
  ({ page, S } = await newPage(browser));
  rid = await rowOf(page, 'recE1');
  seen = await act(page, S, `_wiClear(${rid})`, [false]);
  ok(seen.length === 1 && seen[0].includes(VERBATIM) && writes(S).length === 0, 'cancel: verbatim confirm, 0 writes');
  seen = await act(page, S, `_wiClear(${rid})`, [true]);
  const pE1c = patches(S).find(p => p.id === 'recE1');
  ok(seen.length === 1 && pE1c && pE1c.fields.Truck.length === 0, 'accept: one confirm, vehicle cleared');
  ok(pE1c && !('Status' in pE1c.fields) && ord(S, 'recE1').Status === 'Delivered', 'Status untouched (Delivered), not in the PATCH');
  ok(legDels(S).length === 0 && S.rts.find(r => r.id === 101).truck === null, 'closed RT-101 (only leg) loses its vehicle via the trigger, no 409 path');
  await page.context().close();

  console.log('\n── (c1) clear grouped export row G1a+G1b, matched import GI group I1+I2 (I2 Delivered), RT-103 = exactly these 4');
  ({ page, S } = await newPage(browser));
  rid = await rowOf(page, 'recG1a');
  seen = await act(page, S, `_wiClear(${rid})`, [true]);
  ok(seen.length === 1 && seen[0].includes(VERBATIM) && seen[0].includes('I2-GIMEM'), 'one confirm, names the executing GI member I2');
  const grp = ['recG1a', 'recG1b', 'recI1', 'recI2'];
  ok(grp.every(id => !ord(S, id).Truck && !ord(S, id).Driver), 'every Group ID member has Truck NULL: ' + grp.map(id => id + '=' + ((ord(S, id).Truck || [])[0] || 'null')).join(' '));
  ok(patches(S).some(p => p.id === 'recI2'), 'I2 (GI member, missed before B-08) got its own PATCH');
  ok(ord(S, 'recI2').Status === 'Delivered' && !('Status' in ((patches(S).find(p => p.id === 'recI2') || {}).fields || { Status: 1 })), 'I2 keeps Delivered, no Status in its PATCH');
  ok(['recG1a', 'recG1b', 'recI1'].every(id => ord(S, id).Status === 'Pending'), 'the Assigned members → Pending');
  ok(legDels(S).length === 0, 'RT-103 legs all cleared together → no leg DELETE');
  ok(ord(S, 'recG1a')['Group ID'] === 'GRP-AAA|recG1a,recG1b' && ord(S, 'recI2')['Group ID'] === 'GI-BBB', 'the groups themselves stay (Group ID not written)');
  ok((ord(S, 'recX1').Truck || [])[0] === 'recTruck5' && S.rts.find(r => r.id === 104).ct_rt_legs.length === 1 && !S.log.some(x => x.id === 'recX1' || x.to === 'recX1'), 'unrelated RT-104 / X1 untouched');
  await page.context().close();

  console.log('\n── (c2) clear grouped row G2a+G2b whose RT-105 also carries rotation leg R1');
  ({ page, S } = await newPage(browser));
  rid = await rowOf(page, 'recG2a');
  seen = await act(page, S, `_wiClear(${rid})`, [true]);
  const firstPatch = idx(S, x => x.k === 'patch' && x.tid === T.ORD);
  const dels = legDels(S);
  ok(dels.length === 2 && dels.every(d => d.status === 200) && dels.map(d => d.order).sort().join(',') === 'recG2a,recG2b', 'legs of G2a and G2b DELETEd: ' + dels.map(d => d.order + ':' + d.status).join(' '));
  ok(firstPatch > -1 && S.log.slice(0, firstPatch).filter(x => x.k === 'legdel').length === 2, 'both leg DELETEs happen BEFORE the first vehicle PATCH (log: ' + writes(S).map(x => x.k + ':' + (x.order || x.id || x.path)).join(' → ') + ')');
  ok(!ord(S, 'recG2a').Truck && !ord(S, 'recG2b').Truck, 'G2a, G2b: Truck NULL');
  ok((ord(S, 'recR1').Truck || [])[0] === 'recTruck6' && (ord(S, 'recR1').Driver || [])[0] === 'recDriver6', 'rotation leg R1 keeps TRK-6/Driver 6 (not wiped by the trigger)');
  ok(S.rts.find(r => r.id === 105).ct_rt_legs.length === 1 && S.rts.find(r => r.id === 105).truck === 'recTruck6', 'RT-105 keeps R1 and its truck');
  ok(!S.log.some(x => x.k === 'trigger' && x.to === 'recR1'), 'no trigger propagation reached R1');
  ok(S.log.some(x => x.k === 'rtget' && /overlap=1/.test(x.q)), 'RT lookup went through the shared _wiRtOf (date window, overlap=1)');
  await page.context().close();

  console.log('\n── (c3) same, but RT-105 is CLOSED → refused before the confirm, nothing written');
  ({ page, S } = await newPage(browser, { rt105: 'closed' }));
  rid = await rowOf(page, 'recG2a');
  seen = await act(page, S, `_wiClear(${rid})`, [true]);
  let tl = await page.evaluate(() => window.__toasts.slice(-1)[0] || '');
  ok(seen.length === 0 && /RT-105 είναι κλειστό/.test(tl), 'no confirm; toast names closed RT-105: «' + tl.slice(0, 90) + '…»');
  ok(writes(S).length === 0, 'zero writes, zero leg DELETEs (' + writes(S).length + ')');
  ok(['recG2a', 'recG2b', 'recR1'].every(id => (ord(S, id).Truck || [])[0] === 'recTruck6'), 'G2a/G2b/R1 all still on TRK-6');
  await page.context().close();

  console.log('\n── (c4) N1 whose RT-108 also carries a national (nat_load) leg');
  ({ page, S } = await newPage(browser));
  rid = await rowOf(page, 'recN1');
  seen = await act(page, S, `_wiClear(${rid})`, [true]);
  const n1d = idx(S, x => x.k === 'legdel' && x.order === 'recN1'), n1p = idx(S, x => x.k === 'patch' && x.id === 'recN1');
  ok(n1d > -1 && S.log[n1d].status === 200 && n1p > n1d, 'N1 leg DELETE (' + n1d + ') before its vehicle PATCH (' + n1p + ')');
  const rt108 = S.rts.find(r => r.id === 108);
  ok(rt108.ct_rt_legs.length === 1 && rt108.ct_rt_legs[0].nat_load_id === 77 && rt108.truck === 'recTruck3', 'RT-108 keeps the nat_load leg and its truck');
  await page.context().close();

  console.log('\n── (c5) E6 row spans RT-109 (open, + rota R6) and RT-110 (CLOSED, + Y6) → refused up front');
  ({ page, S } = await newPage(browser));
  rid = await rowOf(page, 'recE6');
  seen = await act(page, S, `_wiClear(${rid})`, [true]);
  tl = await page.evaluate(() => window.__toasts.slice(-1)[0] || '');
  ok(seen.length === 0 && /RT-110/.test(tl) && !/RT-109/.test(tl), 'no confirm; toast names only closed RT-110');
  ok(writes(S).length === 0 && legDels(S).length === 0, 'zero writes, no leg DELETE on the OPEN RT-109 either (' + writes(S).map(x => x.k + ':' + (x.order || x.id)).join(',') + ')');
  ok(S.rts.find(r => r.id === 109).ct_rt_legs.length === 2 && ['recE6', 'recR6', 'recI6', 'recY6'].every(id => (ord(S, id).Truck || [])[0] === 'recTruck8'), 'RT-109 keeps both legs; E6/R6/I6/Y6 keep TRK-8');
  await page.context().close();

  console.log('\n── (c6) partner group P1 (Delivered) + P2 (Assigned): PA of the executing one is kept');
  ({ page, S } = await newPage(browser));
  rid = await rowOf(page, 'recP1');
  seen = await act(page, S, `_wiClear(${rid})`, [true]);
  const paDels = S.log.filter(x => x.k === 'delete' && x.tid === T.PA).map(x => x.id);
  ok(seen.length === 1 && seen[0].includes(VERBATIM) && seen[0].includes('P1-PART-DELIV'), 'one confirm naming P1 (RT-111 cleared whole → closed-trip promise holds)');
  ok(paDels.join(',') === 'recPA2', 'only P2\'s PARTNER ASSIGNMENT deleted: [' + paDels.join(',') + ']');
  ok(S.db[T.PA].some(r => r.id === 'recPA1' && r.fields['Partner Rate'] === 500), 'P1\'s PA (rate 500, the payable) still in the base');
  ok(!ord(S, 'recP1').Partner && !ord(S, 'recP2').Partner && ord(S, 'recP1').Status === 'Delivered' && ord(S, 'recP2').Status === 'Pending', 'both orders lose the partner; P1 stays Delivered, P2 → Pending');
  await page.context().close();

  console.log('\n── (d) _wiCancelGroupMember on the Delivered member G4a (RT-107 with G4b)');
  ({ page, S } = await newPage(browser));
  rid = await rowOf(page, 'recG4a');
  seen = await act(page, S, `_wiCancelGroupMember(${rid},'recG4a',false)`, [false]);
  ok(seen.length === 1 && seen[0].includes('μεταφέρεται/σβήνει δρομολόγιο + μισθοδοσία') && seen[0].includes('G4A-DELIV') && writes(S).length === 0, 'cancel: one confirm (no «on paper only» refusal), 0 writes');
  ok(!seen[0].includes('ακόμη και σε κλειστό δρομολόγιο') && /ΚΛΕΙΣΤΟ δρομολόγιο που έχει κι άλλες παραγγελίες δεν επιτρέπεται/.test(seen[0]), 'text does not promise the closed trip; says removal from a closed shared trip is refused');
  seen = await act(page, S, `_wiCancelGroupMember(${rid},'recG4a',false)`, [true]);
  const dIdx = idx(S, x => x.k === 'legdel' && x.order === 'recG4a');
  const pIdx = idx(S, x => x.k === 'patch' && x.id === 'recG4a');
  ok(dIdx > -1 && S.log[dIdx].status === 200 && pIdx > dIdx, 'leg DELETE of G4a (' + dIdx + ') before its PATCH (' + pIdx + ')');
  const pG4a = S.log[pIdx];
  ok(pG4a && pG4a.fields['Group ID'] === null && (pG4a.fields.Truck || [1]).length === 0, 'PATCH: Group ID null, Truck []');
  ok(pG4a && !('Status' in pG4a.fields) && ord(S, 'recG4a').Status === 'Delivered', 'no Status Pending for the executing order — still Delivered');
  ok((ord(S, 'recG4b').Truck || [])[0] === 'recTruck7' && S.rts.find(r => r.id === 107).truck === 'recTruck7', 'G4b and RT-107 keep TRK-7');
  ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
  await page.context().close();

  console.log('\n── (d2) the same, leg DELETE fails → nothing written to G4a');
  ({ page, S } = await newPage(browser, { legDeleteFails: true }));
  rid = await rowOf(page, 'recG4a');
  seen = await act(page, S, `_wiCancelGroupMember(${rid},'recG4a',false)`, [true]);
  ok(legDels(S).length === 1 && patches(S).length === 0, 'DELETE 500 → stop, 0 PATCH');
  ok((ord(S, 'recG4a').Truck || [])[0] === 'recTruck7' && ord(S, 'recG4a')['Group ID'], 'G4a unchanged (truck + group)');
  await page.context().close();

  console.log('\n── (d3) the same on a CLOSED RT-107 → 409 → nothing written');
  ({ page, S } = await newPage(browser, { rt107: 'closed' }));
  rid = await rowOf(page, 'recG4a');
  seen = await act(page, S, `_wiCancelGroupMember(${rid},'recG4a',false)`, [true]);
  tl = await page.evaluate(() => window.__toasts.slice(-1)[0] || '');
  ok(legDels(S).length === 1 && legDels(S)[0].status === 409 && patches(S).length === 0, '409 → 0 PATCH; toast: «' + tl.slice(0, 80) + '»');
  ok((ord(S, 'recG4b').Truck || [])[0] === 'recTruck7' && (ord(S, 'recG4a').Truck || [])[0] === 'recTruck7', 'G4a and G4b keep TRK-7');
  await page.context().close();

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
