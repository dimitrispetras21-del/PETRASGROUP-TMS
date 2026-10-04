// Proof rig — local relay on the Weekly INTERNATIONAL board (migration 060,
// owner 4/10/2026 «οκ προχωρα με τις τοπικες παραδοσεις»; decisions in
// docs/DECISION_LOG.md 2026-10-04).
//
// The board OPENS in a real browser against an in-memory facade. The facade
// plays the base's rules for LOCAL MOVES the way 060 writes them (Date and
// Status derived, never typed; one live relay per order and kind; the local
// driver is never the order's driver; refusals come back as the Worker's 422
// with the Greek text), so every assertion reads the PAYLOAD that was sent
// and the ROW the facade holds afterwards — never the toast.
//
// Scenarios (Β7, Weekly side; no availability work — owner Q3 4/10):
//   (1) import Monday with a relay: sub-row «⤷ ΠΑΡΑΔΟΣΗ ΤΟΠ.», «ίδιο» tractor, badge on the card
//   (2) export with a loading relay, other tractor + drop-and-hook trailer
//   (3) groupage of 3 members with the same local driver: 3 sub-rows, one badge
//   (4) a Cancelled relay does not show and does not count as «exists»
//   (5) a relay without driver: «ΠΡΟΣ ΑΝΑΘΕΣΗ»
//   (6) an old Worker (422 on the «Move Kind» filter): error banner, menu disabled
//  (6b) the board paints before the relays answer; items say «φορτώνουν»
//   (7) menus: VS / cancelled / pre-order hidden; split parent never, its leg yes;
//       matched pair says which (εξαγωγή / εισαγωγή) explicitly
//   (8) create: exact labels, no Date/Status sent, read-back, sub-row appears
//   (9) edit: «ΠΡΟΣ ΑΝΑΘΕΣΗ» + «ίδιος» send [] and the row ends with NO Driver/Truck
//  (10) a label the Worker drops silently → read-back catches it → ⚠ stays visible
//  (11) a DB refusal (422) keeps the panel open with «Δεν αποθηκεύτηκε: …»
//  (12) delete from the sub-row menu → DELETE, re-read proves it is gone
//  (13) assignment popover carries the «…με τοπικό οδηγό» hint
//  (14) read-only role: no relay panel from the sub-row
//  (15) partner-run order: item closed with the reason; an existing relay stays
//       editable, its panel names the partner and has no «ίδιος»
//  (16) a sub-row click opens THAT relay even if the order's direction changed
//  (17) the split panel warns about a relay on the parent
//  (18) a failed re-read after a delete is said apart from a failed delete
//
// Run from the MAIN repo root (the .har lookup in auth.js is cwd-relative):
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/lr-weekly/ node .claude/worktrees/lr-weekly/tests/critics/local-relay-weekly-proof.js
// MODE=before → only the «before» screenshots (run against the unchanged base).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const MODE = process.env.MODE || 'after';
const SHOTS = path.resolve(__dirname, '../../docs/data-audit/2026-10/shots');
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const T = { ORD: 'tblgHlNmLBH3JTdIM', TRK: 'tblEAPExIAjiA3asD', TRL: 'tblDcrqRJXzPrtYLm', DRV: 'tbl7UGmYhc2Y82pPs', LOC: 'tblxu8DRfTQOFRCzS', PTN: 'tblLHl5m8bqONfhWv', LM: 'local_moves' };
const VEROIA = 'recJucKOhC1zh4IP3';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

// ── The «base» ──────────────────────────────────────────────────────────────
// Neutral names and no amounts: the repo is public.
const ORD = (id, dir, ref, ld, dd, extra = {}) => ({ id, fields: Object.assign({
  Type: 'International', Direction: dir, Reference: ref, Status: 'Assigned',
  'Loading DateTime': ld, 'Delivery DateTime': dd, 'Total Pallets': 10,
  'Loading Summary': dir === 'Import' ? 'Supplier NL, Venlo, NL' : 'Packer, Skydra, GR',
  'Delivery Summary': dir === 'Import' ? 'Customer, Naousa, GR' : 'Buyer, Munich, DE',
}, extra) });
const OWN = (n) => ({ Truck: ['recTrk' + n], Trailer: ['recTrl' + n], Driver: ['recDrv' + n] });
function seed() {
  const db = {
    [T.TRK]: [1, 2, 3, 4, 5, 6, 7].map(n => ({ id: 'recTrk' + n, fields: { 'License Plate': 'INT-' + n, Active: true } }))
      .concat([{ id: 'recTrkL', fields: { 'License Plate': 'LOC-1', Active: true } }]),
    [T.TRL]: [1, 2, 3, 4, 5, 6, 7].map(n => ({ id: 'recTrl' + n, fields: { 'License Plate': 'TRL-' + n } }))
      .concat([{ id: 'recTrlL', fields: { 'License Plate': 'TRL-L' } }]),
    [T.DRV]: [1, 2, 3, 4, 5, 6, 7].map(n => ({ id: 'recDrv' + n, fields: { 'Full Name': 'Intl ' + n, Active: true } }))
      .concat([{ id: 'recDrvL1', fields: { 'Full Name': 'Local A', Active: true } },
               { id: 'recDrvL2', fields: { 'Full Name': 'Local B', Active: true } }]),
    [T.LOC]: [
      { id: VEROIA, fields: { Name: 'CROSS-DOCK', City: 'Veroia', Country: 'GR' } },
      { id: 'recLocC', fields: { Name: 'Customer', City: 'Naousa', Country: 'GR' } },
    ],
    [T.PTN]: [{ id: 'recPtn1', fields: { 'Company Name': 'Partner X' } }],
    [T.ORD]: [
      ORD('recImp1', 'Import', 'I1-MON', '2026-10-03', '2026-10-05', Object.assign({ Status: 'In Transit' }, OWN(1))),
      ORD('recImp3', 'Import', 'I3-NEW', '2026-10-04', '2026-10-06', OWN(3)),
      ORD('recImp4', 'Import', 'I4-NODRV', '2026-10-05', '2026-10-07', OWN(4)),
      ORD('recImpVS', 'Import', 'I5-VS', '2026-10-05', '2026-10-08', { 'Veroia Switch': true }),
      ORD('recImpCx', 'Import', 'I6-CANC', '2026-10-06', '2026-10-08', { Status: 'Cancelled' }),
      ORD('recExp1', 'Export', 'E1-SKYDRA', '2026-10-03', '2026-10-06', Object.assign({ 'Matched Import ID': 'recImp2' }, OWN(2))),
      ORD('recImp2', 'Import', 'I2-MATCH', '2026-10-07', '2026-10-09', OWN(2)),
      ...['recG1', 'recG2', 'recG3'].map((id, k) => ORD(id, 'Export', 'G' + (k + 1), '2026-10-03', '2026-10-07',
        Object.assign({ 'Group ID': 'GRP-AAA|recG1,recG2,recG3' }, OWN(5)))),
      ORD('recSP', 'Export', 'SP-PARENT', '2026-10-04', '2026-10-08', {}),
      ORD('recSL1', 'Export', 'SP-LEG1', '2026-10-04', '2026-10-05', Object.assign({ 'Parent Order': ['recSP'], 'Leg No': 1 }, OWN(6))),
      ORD('recSL2', 'Export', 'SP-LEG2', '2026-10-05', '2026-10-08', Object.assign({ 'Parent Order': ['recSP'], 'Leg No': 2 }, OWN(7))),
      ORD('recPre', 'Export', 'PRE-1', '2026-10-06', '', { 'Ops Status': 'Provisional', Status: 'Pending' }),
      ORD('recImpP', 'Import', 'I7-PARTNER', '2026-10-04', '2026-10-06', { Partner: ['recPtn1'], 'Is Partner Trip': true }),
      ORD('recImpP2', 'Import', 'I9-PARTNER2', '2026-10-05', '2026-10-07', { Partner: ['recPtn1'], 'Is Partner Trip': true }),
      ORD('recImpU', 'Import', 'I8-UNASSIGNED', '2026-10-04', '2026-10-06', {}),
    ],
    [T.LM]: [
      { id: 'recLM1', fields: { 'Move Kind': 'relay_delivery', 'Parent Order': ['recImp1'], Driver: ['recDrvL1'], Trailer: ['recTrl1'], 'From Location': [VEROIA], 'Time From': '07:00' } },
      { id: 'recLMc', fields: { 'Move Kind': 'relay_delivery', 'Parent Order': ['recImp3'], Trailer: ['recTrl3'], 'From Location': [VEROIA], Status: 'Cancelled' } },
      { id: 'recLM4', fields: { 'Move Kind': 'relay_delivery', 'Parent Order': ['recImp4'], Trailer: ['recTrl4'], 'From Location': [VEROIA] } },
      { id: 'recLM2', fields: { 'Move Kind': 'relay_loading', 'Parent Order': ['recExp1'], Driver: ['recDrvL2'], Truck: ['recTrkL'], Trailer: ['recTrlL'], 'To Location': [VEROIA], 'Time From': '06:00' } },
      ...['recG1', 'recG2', 'recG3'].map((oid, k) => ({ id: 'recLMg' + (k + 1), fields: { 'Move Kind': 'relay_loading', 'Parent Order': [oid], Driver: ['recDrvL1'], Trailer: ['recTrl5'], 'To Location': [VEROIA], 'Time From': ['05:00', '05:30', '06:00'][k] } })),
      { id: 'recLM5', fields: { 'Move Kind': 'relay_loading', 'Parent Order': ['recSL1'], Driver: ['recDrvL2'], Trailer: ['recTrl6'], 'To Location': [VEROIA] } },
      // written before the order went to a partner
      { id: 'recLMp', fields: { 'Move Kind': 'relay_delivery', 'Parent Order': ['recImpP2'], Driver: ['recDrvL1'], Trailer: ['recTrl1'], 'From Location': [VEROIA] } },
    ],
  };
  return db;
}
function applyFields(target, fields) {
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete target[k]; else target[k] = v;
  }
}
const orderOf = (db, rec) => db[T.ORD].find(o => o.id === ((rec.fields['Parent Order'] || [])[0]));
// What 060's BEFORE trigger does to a relay row (Date from the order, Status from the driver).
function derive(db, rec) {
  const o = orderOf(db, rec); if (!o) return;
  const kind = rec.fields['Move Kind'];
  const day = kind === 'relay_delivery' ? o.fields['Delivery DateTime'] : o.fields['Loading DateTime'];
  if (day) rec.fields.Date = String(day).slice(0, 10);
  if (rec.fields.Status !== 'Cancelled') rec.fields.Status = rec.fields.Driver ? 'Assigned' : 'Pending';
}
// The Worker's 422 for a DB refusal (SQLSTATE 23514 + HINT local_relay:<code>).
const RULE = {
  same_driver: 'Ο τοπικός είναι ο ίδιος ο οδηγός της παραγγελίας',
  relay_exists: 'Η παραγγελία έχει ήδη τοπική κίνηση αυτού του είδους',
  vs: 'Η παραγγελία περνά από Veroia Switch',
};

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 }, serviceWorkers: 'block', timezoneId: 'Europe/Athens' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-05T09:00:00+03:00'));
  const db = seed();
  db[T.LM].forEach(r => derive(db, r));
  const S = { db, log: [], errors: [], armed: false, lmGets: 0, failLmGets: 0 };
  page.on('pageerror', e => S.errors.push(String(e)));
  page.on('dialog', d => d.accept());
  await preparePage(page, opts.role || 'dispatcher');
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const shape = (r) => {
    const out = { id: r.id, fields: Object.assign({}, r.fields) };
    if (opts.noMoveKind) delete out.fields['Move Kind'];
    return out;
  };
  let seq = 0;
  await page.route(`**/${HOST}/**`, async route => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const body = (() => { try { return req.postDataJSON(); } catch (_) { return null; } })();
    if (!u.pathname.startsWith('/v0/')) {
      if (m !== 'GET' && S.armed) S.log.push({ k: 'other', m, path: u.pathname });
      return json(route, m === 'GET' ? { records: [] } : { ok: true });
    }
    const mm = u.pathname.match(/\/v0\/[^/]+\/([A-Za-z0-9_]+)(?:\/(rec[A-Za-z0-9]+))?$/);
    if (!mm) return json(route, m === 'GET' ? { records: [] } : { ok: true });
    const [, tid, rid] = mm; const tbl = db[tid] || (db[tid] = []);
    const f = u.searchParams.get('filterByFormula') || '';
    if (tid === T.LM) {
      const live = tbl.filter(r => !r._deleted);
      if (m === 'GET' && !rid) {
        S.lmGets++;
        if (S.armed) S.log.push({ k: 'lmget', f, fields: u.searchParams.getAll('fields[]') });
        S.lastLmGet = { f, fields: u.searchParams.getAll('fields[]') };
        // The live (pre-060) Worker has no «Move Kind» label: an unknown label
        // in a FILTER is its one loud path — 422, «Unsupported query».
        if (opts.noMoveKind && /\{Move Kind\}/.test(f)) return json(route, { error: 'Unsupported query for this table' }, 422);
        if (S.failLmGets > 0) { S.failLmGets--; return json(route, { error: 'Forbidden' }, 403); }
        if (opts.lmDelay) await new Promise(r => setTimeout(r, opts.lmDelay));
        let out;
        const ids = [...f.matchAll(/FIND\("(rec[A-Za-z0-9]+)",ARRAYJOIN\(\{Parent Order\}/g)].map(x => x[1]);
        if (ids.length) out = live.filter(r => ids.includes((r.fields['Parent Order'] || [])[0]));
        else if (/\{Date\}/.test(f)) out = live;          // the pre-060 {Date} window read
        else out = [];
        return json(route, { records: out.map(shape) });
      }
      if (m === 'GET' && rid) {
        const r = live.find(x => x.id === rid);
        if (S.armed) S.log.push({ k: 'lmget1', id: rid });
        return r ? json(route, shape(r)) : json(route, { error: { type: 'NOT_FOUND', message: 'Record not found' } }, 404);
      }
      if (S.armed) S.log.push({ k: 'lm' + m.toLowerCase(), id: rid, fields: body && body.fields });
      if (m === 'POST') {
        const fields = Object.assign({}, body.fields);
        (opts.dropLabels || []).forEach(l => delete fields[l]);     // the Worker map silently lacks it
        const rec = { id: 'recLMnew' + (++seq), fields: {} };
        applyFields(rec.fields, fields);
        const o = orderOf(db, rec);
        if (opts.refuse) return json(route, { error: { type: 'LOCAL_RELAY_RULE', code: opts.refuse, message: RULE[opts.refuse] } }, 422);
        if (o && rec.fields.Driver && (o.fields.Driver || [])[0] === rec.fields.Driver[0]) return json(route, { error: { type: 'LOCAL_RELAY_RULE', code: 'same_driver', message: RULE.same_driver } }, 422);
        if (live.some(r => r.fields.Status !== 'Cancelled' && (r.fields['Parent Order'] || [])[0] === (rec.fields['Parent Order'] || [])[0] && r.fields['Move Kind'] === rec.fields['Move Kind'])) {
          return json(route, { error: { type: 'LOCAL_RELAY_RULE', code: 'relay_exists', message: RULE.relay_exists } }, 422);
        }
        if (!rec.fields['Move Kind']) rec.fields['Move Kind'] = 'local';
        derive(db, rec);
        tbl.push(rec);
        return json(route, shape(rec));
      }
      if (m === 'PATCH' && rid) {
        const r = live.find(x => x.id === rid); if (!r) return json(route, { error: { type: 'NOT_FOUND' } }, 404);
        const fields = Object.assign({}, body.fields);
        (opts.dropLabels || []).forEach(l => delete fields[l]);
        applyFields(r.fields, fields); derive(db, r);
        return json(route, shape(r));
      }
      if (m === 'DELETE' && rid) {
        const r = live.find(x => x.id === rid); if (!r) return json(route, { error: { type: 'NOT_FOUND' } }, 404);
        r._deleted = true;
        return json(route, { id: rid, deleted: true });
      }
      return json(route, {});
    }
    if (m === 'GET') {
      if (rid) { const r = tbl.find(x => x.id === rid); return r ? json(route, r) : json(route, { error: { type: 'NOT_FOUND' } }, 404); }
      if (tid !== T.ORD) return json(route, { records: tbl });
      let out = [];
      let g;
      if ((g = f.match(/\{Group ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Group ID'] === g[1]);
      else if ((g = f.match(/\{Matched Import ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Matched Import ID'] === g[1]);
      else if (/RECORD_ID\(\)/.test(f)) { const want = new Set((f.match(/rec[A-Za-z0-9]+/g) || [])); out = tbl.filter(r => want.has(r.id)); }
      else if ((g = f.match(/\{Direction\}='(Export|Import)'/)) && /International/.test(f)) out = tbl.filter(r => r.fields.Direction === g[1]);
      return json(route, { records: out });
    }
    if (S.armed) S.log.push({ k: m.toLowerCase(), tid, id: rid, fields: body && body.fields ? body.fields : body });
    if (m === 'PATCH' && rid) { const r = tbl.find(x => x.id === rid); if (r) applyFields(r.fields, body.fields); return json(route, r || {}); }
    if (m === 'POST') return json(route, { id: 'recNew', fields: (body && body.fields) || {} });
    if (m === 'DELETE') return json(route, { id: rid, deleted: true });
    return json(route, {});
  });
  await gotoPage(page, 'weekly_intl', BASE);
  await page.waitForFunction(() => window.WINTL && WINTL.rows && WINTL.rows.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__toasts = []; const t0 = window.toast; window.toast = (m, k) => { window.__toasts.push(String(m)); try { return t0 && t0(m, k); } catch (_) {} }; });
  return { page, S };
}

const rowIdOf = (page, oid) => page.evaluate(o => (WINTL.rows.find(r => (r.orderIds || []).includes(o) || r.orderId === o) || {}).id, oid);
// Right-click the element and return the menu's item labels (and whether each is disabled).
async function menuOf(page, selector) {
  await page.evaluate(() => { const c = document.getElementById('wi-ctx'); if (c) c.style.display = 'none'; });
  await page.locator(selector).first().click({ button: 'right' });
  await page.waitForTimeout(150);
  return page.$$eval('#wi-ctx .wi-ctx-i', els => els.map(e => ({ t: e.textContent.trim(), dis: !!e.disabled, on: e.getAttribute('onclick') || '' })));
}
async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
  console.log('  📷 ' + name);
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (MODE === 'before') {
      const { page } = await newPage(browser);
      await shot(page, 'local-relay-weekly-before-board-1440.png');
      await menuOf(page, '#wi-imp-recImp3');
      await shot(page, 'local-relay-weekly-before-menu-1440.png');
      await page.evaluate(() => { const c = document.getElementById('wi-ctx'); if (c) c.style.display = 'none'; });
      await page.locator('#wi-imp-recImp3 .wk3-assign').click();
      await page.waitForTimeout(300);
      await shot(page, 'local-relay-weekly-before-popover-1440.png');
      await page.context().close();
      return;
    }
    await scenarios(browser);
  } finally {
    await browser.close();
    if (MODE === 'before') console.log('before shots done');
  }
  if (MODE !== 'before') {
    console.log(`\n${pass} OK, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  }
})().catch(e => { console.error(e); process.exit(1); });

// A context-menu call without a mouse: the menus read only these event fields.
const EV = 'Object.assign({preventDefault(){},stopPropagation(){},clientX:400,clientY:300},{currentTarget:document.body})';
async function ctxItems(page, call) {
  await page.evaluate(() => { const c = document.getElementById('wi-ctx'); if (c) { c.style.display = 'none'; c.innerHTML = ''; } });
  await page.evaluate(c => (0, eval)(c), call);
  await page.waitForTimeout(120);
  return page.$$eval('#wi-ctx .wi-ctx-i', els => els.map(e => ({ t: e.textContent.trim(), dis: !!e.disabled, tip: e.getAttribute('title') || '' })));
}
const relayItems = items => items.filter(i => /τοπικό οδηγό|Τοπική (παράδοση|φόρτωση)/.test(i.t));
const subText = (page, id) => page.$eval(`.wi-rly-row[data-rly-id="${id}"]`, el => el.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
async function waitIdle(page) { await page.waitForTimeout(900); }
async function openRelay(page, oid) {
  await page.evaluate(o => _wiRelayOpen(o), oid);
  await page.waitForFunction(() => { const p = document.getElementById('wi-panel'); return p && p.style.display === 'block' && document.getElementById('rly_submit'); }, null, { timeout: 5000 });
}

async function scenarios(browser) {
  // ── Page A: dispatcher, the normal facade ──────────────────────────────
  {
    const { page, S } = await newPage(browser);
    console.log('\n(1)–(5) the board draws what the facade holds');
    const t1 = await subText(page, 'recLM1');
    ok(t1 && /ΠΑΡΑΔΟΣΗ ΤΟΠ\./.test(t1) && /Δευ 05\/10 07:00/.test(t1) && /Local A/.test(t1) && /ίδιο INT-1/.test(t1) && /ρυμ\. TRL-1/.test(t1) && /από CROSS-DOCK/.test(t1), '(1) import relay sub-row: ' + t1);
    ok(/✓/.test(t1 || '') === false, '(1) In Transit import → the relay is not shown as done (done = the ORDER Delivered)');
    ok(await page.$eval('#wi-imp-recImp1 .wi-rly-b', e => e.textContent.trim()).catch(() => null) === '⇄ τοπ.', '(1) badge «⇄ τοπ.» on the import\'s assignment card');
    const t2 = await subText(page, 'recLM2');
    ok(t2 && /ΦΟΡΤΩΣΗ ΤΟΠ\./.test(t2) && /Σάβ 03\/10 06:00/.test(t2) && /Local B/.test(t2) && /άλλο LOC-1/.test(t2) && /ρυμ\. TRL-L \(άλλη από της παραγγελίας\)/.test(t2) && /προς CROSS-DOCK/.test(t2), '(2) export relay, other tractor + drop-and-hook: ' + t2);
    const e1Row = await rowIdOf(page, 'recExp1');
    ok(await page.$$eval(`#wi-row-${e1Row} .wi-rly-b`, els => els.length) === 1, '(2) one badge on the matched pair\'s card');
    const g = await Promise.all(['recLMg1', 'recLMg2', 'recLMg3'].map(id => subText(page, id)));
    ok(g.every(t => t && /Local A/.test(t) && /ΦΟΡΤΩΣΗ ΤΟΠ\./.test(t)), '(3) groupage: three sub-rows, same local driver');
    const gRow = await rowIdOf(page, 'recG1');
    ok(await page.$$eval(`#wi-row-${gRow} .wi-rly-b`, els => els.length) === 1, '(3) groupage: ONE badge on the group\'s card');
    ok(await page.$('.wi-rly-row[data-rly-id="recLMc"]') === null, '(4) the Cancelled relay is not drawn');
    ok((await subText(page, 'recLM4') || '').includes('ΠΡΟΣ ΑΝΑΘΕΣΗ') && await page.$('.wi-rly-row[data-rly-id="recLM4"] .wi-rly-need') !== null, '(5) relay without driver → red «ΠΡΟΣ ΑΝΑΘΕΣΗ»');
    ok((await subText(page, 'recLM5') || '').includes('SP-LEG1'), '(7) the split LEG\'s relay is drawn under the split frame');
    ok(await page.$('.wi-rly-fail') === null, 'no failure banner when the read succeeded');
    const lg = S.lastLmGet || {};
    ok(/,\{Move Kind\}!=BLANK\(\)\)$/.test(lg.f || '') && /^AND\(/.test(lg.f || ''), 'the relay read carries the «Move Kind» probe in its filter: ' + String(lg.f).slice(0, 60) + '…');
    ok(JSON.stringify(lg.fields) === JSON.stringify(['Parent Order', 'Move Kind', 'Driver', 'Truck', 'Trailer', 'From Location', 'To Location', 'Time From', 'Date', 'Status']), 'the relay read names its fields[] (bounded URL): ' + JSON.stringify(lg.fields));
    ok(((lg.f || '').match(/FIND\(/g) || []).length <= 50, 'at most 50 orders per relay request');
    await shot(page, 'local-relay-weekly-after-board-1440.png');

    console.log('\n(7) menus');
    const i3 = await rowIdOf(page, 'recImp3');
    let it = relayItems(await ctxItems(page, `_wiImpCtx(${EV},${i3})`));
    ok(it.length === 1 && it[0].t === 'Παράδοση με τοπικό οδηγό…' && !it[0].dis, '(4)(7) import with only a Cancelled relay → «Παράδοση με τοπικό οδηγό…» (create): ' + JSON.stringify(it));
    await menuOf(page, '#wi-imp-recImp3');   // the real right-click path, for the picture
    await shot(page, 'local-relay-weekly-after-menu-1440.png');
    it = relayItems(await ctxItems(page, `_wiImpCtx(${EV},${await rowIdOf(page, 'recImp1')})`));
    ok(it.length === 1 && it[0].t === 'Τοπική παράδοση: αλλαγή…', '(7) import that has one → «Τοπική παράδοση: αλλαγή…»');
    ok(relayItems(await ctxItems(page, `_wiImpCtx(${EV},${await rowIdOf(page, 'recImpVS')})`)).length === 0, '(7) Veroia Switch import → no relay item');
    ok(relayItems(await ctxItems(page, `_wiImpCtx(${EV},${await rowIdOf(page, 'recImpCx')})`)).length === 0, '(7) cancelled import → no relay item');
    ok(relayItems(await ctxItems(page, `_wiCtx(${EV},${await rowIdOf(page, 'recPre')})`)).length === 0, '(7) pre-order → its own menu, no relay item');
    const spRow = await page.evaluate(() => (WINTL.rows.find(r => r.hasSplitLegs) || {}).id);
    ok(relayItems(await ctxItems(page, `_wiSplitHeaderCtx(${EV},${spRow})`)).length === 0, '(7) split parent header → no relay item');
    it = relayItems(await ctxItems(page, `_wiCtx(${EV},${await rowIdOf(page, 'recSL1')})`));
    ok(it.length === 1 && it[0].t === 'Τοπική φόρτωση: αλλαγή…', '(7) split leg 1 → its own relay: ' + JSON.stringify(it));
    it = relayItems(await ctxItems(page, `_wiCtx(${EV},${await rowIdOf(page, 'recSL2')})`));
    ok(it.length === 1 && it[0].t === 'Φόρτωση με τοπικό οδηγό…', '(7) split leg 2 → «Φόρτωση με τοπικό οδηγό…»');
    it = relayItems(await ctxItems(page, `_wiCtx(${EV},${e1Row})`));
    ok(it.length === 2 && it[0].t === 'Τοπική φόρτωση: αλλαγή — εξαγωγή E1-SKYDRA…' && it[1].t === 'Παράδοση με τοπικό οδηγό — εισαγωγή I2-MATCH…', '(7) matched pair row names BOTH explicitly: ' + JSON.stringify(it.map(x => x.t)));
    await shot(page, 'local-relay-weekly-after-menu-matched-1440.png');
    it = relayItems(await ctxItems(page, `_wiMatchedImpCtx(${EV},${e1Row})`));
    ok(it.length === 1 && it[0].t === 'Παράδοση με τοπικό οδηγό — εισαγωγή I2-MATCH…', '(7) matched import card → only the import, named: ' + JSON.stringify(it.map(x => x.t)));
    it = relayItems(await ctxItems(page, `_wiCtx(${EV},${gRow})`));
    ok(it.length === 3 && it.every((x, k) => x.t === `Τοπική φόρτωση: αλλαγή — εξαγωγή G${k + 1}…`), '(7) group row → one named item per member');
    it = relayItems(await ctxItems(page, `_wiSegCtx(${EV},${gRow},'recG2',false)`));
    ok(it.length === 1 && it[0].t === 'Τοπική φόρτωση: αλλαγή — εξαγωγή G2…', '(7) segment menu → that member only');
    await page.evaluate(() => { const c = document.getElementById('wi-ctx'); if (c) c.style.display = 'none'; });

    console.log('\n(15) partner-run orders');
    it = relayItems(await ctxItems(page, `_wiImpCtx(${EV},${await rowIdOf(page, 'recImpP')})`));
    ok(it.length === 1 && it[0].dis && /συνεργάτης/.test(it[0].tip), '(15) partner-run import, no relay → item shown CLOSED with the reason: ' + JSON.stringify(it));
    it = relayItems(await ctxItems(page, `_wiImpCtx(${EV},${await rowIdOf(page, 'recImpP2')})`));
    ok(it.length === 1 && !it[0].dis && it[0].t === 'Τοπική παράδοση: αλλαγή…', '(15) partner-run import WITH a relay → still editable: ' + JSON.stringify(it));
    await page.evaluate(() => { const c = document.getElementById('wi-ctx'); if (c) c.style.display = 'none'; });
    await openRelay(page, 'recImpP2');
    const pp = await page.evaluate(() => ({
      note: document.querySelector('#wi-panel .wn3-pnote').textContent,
      sameDis: document.querySelector('input[name="rly_tm"][value="same"]').disabled,
      other: document.querySelector('input[name="rly_tm"][value="other"]').checked,
      trkEnabled: !document.getElementById('rly_trk').disabled,
    }));
    ok(/συνεργάτης/.test(pp.note) && /Partner X/.test(pp.note) && !/Ο διεθνής \(δεν έχει ανατεθεί/.test(pp.note), '(15) the panel names the partner, not «δεν έχει ανατεθεί»: ' + pp.note);
    ok(pp.sameDis && pp.other && pp.trkEnabled, '(15) «ίδιος» disabled, «άλλος» chosen, tractor list open');
    S.armed = true; S.log = [];
    await page.click('#rly_submit'); await page.waitForTimeout(300);
    ok(/δικό μας τράκτορα/.test(await page.$eval('#rly_err', e => e.textContent)) && !S.log.some(l => l.k === 'lmpatch'), '(15) saving without our own tractor is refused in the panel, nothing sent');
    S.armed = false;
    await page.evaluate(() => _wiPanelClose());

    console.log('\n(16) the sub-row opens THAT relay');
    // The order's direction changed after the relay was written (060 never
    // blocks an order edit; B-65 reports it): the click must still edit the
    // clicked relay, not offer a new one of the other kind.
    await page.evaluate(() => { WINTL.data.imports.find(o => o.id === 'recImp1').fields.Direction = 'Export'; });
    await page.locator('.wi-rly-row[data-rly-id="recLM1"]').click();
    await page.waitForFunction(() => { const p = document.getElementById('wi-panel'); return p && p.style.display === 'block' && document.getElementById('rly_submit'); }, null, { timeout: 5000 });
    const t16 = await page.evaluate(() => ({ title: document.querySelector('#wi-panel .wi-panel-title').textContent, drv: document.getElementById('rly_drv').value }));
    ok(t16.title === 'Τοπική παράδοση — αλλαγή' && t16.drv === 'recDrvL1', '(16) click → edit of recLM1 (delivery), not «Φόρτωση με τοπικό οδηγό»: ' + JSON.stringify(t16));
    await page.evaluate(() => { _wiPanelClose(); WINTL.data.imports.find(o => o.id === 'recImp1').fields.Direction = 'Import'; });

    console.log('\n(17) split panel warns about the parent\'s relay');
    await page.evaluate(r => _wiPanelSplit(r), await rowIdOf(page, 'recImp1'));
    await page.waitForTimeout(300);
    const w17 = await page.$eval('#wi-panel .wi-panel-warn', e => e.textContent).catch(() => '');
    ok(/τοπική παράδοση/.test(w17) && /σκέλος/.test(w17), '(17) «…έχει τοπική παράδοση — …δήλωσέ την ξανά στο σκέλος…»: ' + w17);
    await page.evaluate(() => _wiPanelClose());
    await page.evaluate(r => _wiPanelSplit(r), await rowIdOf(page, 'recImp3'));
    await page.waitForTimeout(300);
    ok(await page.$('#wi-panel .wi-panel-warn') === null, '(17) no warning on an order without a live relay (recImp3: only a Cancelled one)');
    await page.evaluate(() => _wiPanelClose());

    console.log('\n(8) create');
    await openRelay(page, 'recImp3');
    const pre = await page.evaluate(() => ({
      title: document.querySelector('#wi-panel .wi-panel-title').textContent,
      trl: document.getElementById('rly_trl').value, pt: document.getElementById('lv_rly_pt').value,
      same: document.querySelector('input[name="rly_tm"][value="same"]').checked,
      trkDisabled: document.getElementById('rly_trk').disabled,
      intlDisabled: !!document.querySelector('#rly_drv option[value="recDrv3"][disabled]'),
      day: document.getElementById('rly_day').textContent,
      note: document.querySelector('#wi-panel .wn3-pnote').textContent,
      hasHandover: /άφιξη|φτάνει Βέροια|Handover/i.test(document.getElementById('wi-panel').innerText),
    }));
    ok(pre.title === 'Παράδοση με τοπικό οδηγό', '(8) panel title');
    ok(pre.trl === 'recTrl3' && pre.pt === VEROIA && pre.same && pre.trkDisabled, '(8) trailer prefilled from the order, point = Veroia, tractor «ίδιος»');
    ok(pre.intlDisabled, '(8) the international driver is listed but cannot be picked');
    ok(/Τρί 06\/10/.test(pre.day), '(8) the customer day comes read-only from the order: ' + pre.day);
    ok(/Intl 3 · INT-3/.test(pre.note) && /μένει στην παραγγελία/.test(pre.note), '(8) the panel says the international stays: ' + pre.note);
    ok(!pre.hasHandover, '(8) no handover day in Φ1 (owner Q3 4/10)');
    // UI rule before the round trip: a driver without a trailer is refused locally.
    await page.selectOption('#rly_drv', 'recDrvL2');
    await page.selectOption('#rly_trl', '');
    S.armed = true; S.log = [];
    await page.click('#rly_submit'); await page.waitForTimeout(300);
    ok(/ρυμούλκα/.test(await page.$eval('#rly_err', e => e.textContent)) && !S.log.some(l => l.k === 'lmpost'), '(8) driver without trailer → refused in the panel, nothing sent');
    await page.selectOption('#rly_trl', 'recTrl3');
    await page.fill('#rly_time', '07:30');
    await shot(page, 'local-relay-weekly-after-panel-1440.png');
    S.log = [];
    await page.click('#rly_submit');
    await page.waitForFunction(() => document.getElementById('wi-panel').style.display !== 'block', null, { timeout: 8000 });
    await waitIdle(page);
    const post = S.log.find(l => l.k === 'lmpost');
    ok(post && JSON.stringify(Object.keys(post.fields).sort()) === JSON.stringify(['Driver', 'From Location', 'Move Kind', 'Parent Order', 'Time From', 'Trailer']), '(8) POST labels exactly: ' + (post && Object.keys(post.fields).join(', ')));
    ok(post && post.fields['Move Kind'] === 'relay_delivery' && post.fields['Parent Order'][0] === 'recImp3' && post.fields.Driver[0] === 'recDrvL2' && post.fields['From Location'][0] === VEROIA && post.fields['Time From'] === '07:30', '(8) POST values');
    ok(post && !('Date' in post.fields) && !('Status' in post.fields) && !('Truck' in post.fields), '(8) no Date/Status (the base derives them), no Truck («ίδιος» = NULL)');
    const iPost = S.log.indexOf(post), iBack = S.log.findIndex(l => l.k === 'lmget1');
    ok(iBack > iPost, '(8) the record is READ BACK after the POST');
    const newRec = S.db[T.LM].find(r => r.id.startsWith('recLMnew'));
    ok(newRec && newRec.fields.Date === '2026-10-06' && newRec.fields.Status === 'Assigned', '(8) facade row: Date = order delivery day, Status Assigned');
    const tn = newRec && await subText(page, newRec.id);
    ok(tn && /Local B/.test(tn) && /Τρί 06\/10 07:30/.test(tn) && await page.$(`.wi-rly-row[data-rly-id="${newRec && newRec.id}"].err`) === null, '(8) the new sub-row is drawn, no ⚠: ' + tn);
    ok(!S.log.some(l => l.tid === T.ORD && l.k !== 'get'), '(8) no write to ORDERS — the order is never touched');
    ok((await page.evaluate(() => window.__toasts)).some(t => /καταχωρήθηκε/.test(t)), '(8) success said only after the read-back');
    ok(await page.evaluate(() => typeof getUndoAction === 'function' && getUndoAction() === null), '(8) no toolbar Undo armed by the relay create');

    console.log('\n(9) edit: back to «ΠΡΟΣ ΑΝΑΘΕΣΗ» + «ίδιος» clears Driver/Truck');
    await openRelay(page, 'recExp1');
    ok(await page.$eval('input[name="rly_tm"][value="other"]', e => e.checked) && await page.$eval('#rly_trk', e => e.value) === 'recTrkL', '(9) edit opens with «άλλος» LOC-1');
    await shot(page, 'local-relay-weekly-after-panel-loading-1440.png');
    await page.selectOption('#rly_drv', '');
    await page.check('input[name="rly_tm"][value="same"]');
    S.log = [];
    await page.click('#rly_submit');
    await page.waitForFunction(() => document.getElementById('wi-panel').style.display !== 'block', null, { timeout: 8000 });
    await waitIdle(page);
    const patch = S.log.find(l => l.k === 'lmpatch');
    ok(patch && patch.id === 'recLM2' && Array.isArray(patch.fields.Driver) && patch.fields.Driver.length === 0 && Array.isArray(patch.fields.Truck) && patch.fields.Truck.length === 0, '(9) PATCH sends Driver: [] and Truck: []');
    ok(patch && !('Parent Order' in patch.fields) && !('Move Kind' in patch.fields), '(9) kind and parent are not re-sent (immutable in 060)');
    const lm2 = S.db[T.LM].find(r => r.id === 'recLM2');
    ok(lm2 && !('Driver' in lm2.fields) && !('Truck' in lm2.fields) && lm2.fields.Status === 'Pending', '(9) facade row: NO Driver, NO Truck, Status Pending');
    const t9 = await subText(page, 'recLM2');
    ok(t9 && /ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(t9) && /ίδιο INT-2/.test(t9), '(9) sub-row redrawn: ' + t9);
    ok(await page.evaluate(() => getUndoAction() === null), '(9) no toolbar Undo armed by the relay edit');

    console.log('\n(12) delete');
    await page.evaluate(() => _wiRelayConfirmDel('recLM4', 'recImp4'));
    await page.waitForTimeout(200);
    S.log = [];
    await page.click('#wi-panel .btn-danger');
    await page.waitForTimeout(1200);
    ok(S.log.some(l => l.k === 'lmdelete' && l.id === 'recLM4'), '(12) DELETE sent');
    const delIdx = S.log.findIndex(l => l.k === 'lmdelete');
    ok(S.log.slice(delIdx + 1).some(l => l.k === 'lmget' && /recImp4/.test(l.f)), '(12) the order\'s relays are re-read after the DELETE');
    ok(await page.$('.wi-rly-row[data-rly-id="recLM4"]') === null && (await page.evaluate(() => window.__toasts)).some(t => /Η τοπική διαγράφηκε ✓/.test(t)), '(12) gone from the board, success after the re-read');

    console.log('\n(18) delete, then the re-read fails');
    await page.evaluate(() => { window.__toasts = []; });
    await page.evaluate(() => _wiRelayConfirmDel('recLMg3', 'recG3'));
    await page.waitForTimeout(200);
    S.log = []; S.failLmGets = 1;
    await page.click('#wi-panel .btn-danger');
    await page.waitForTimeout(1200);
    const t18 = await page.evaluate(() => window.__toasts);
    ok(S.log.some(l => l.k === 'lmdelete' && l.id === 'recLMg3'), '(18) DELETE sent');
    ok(t18.some(t => /διαγράφηκε, αλλά η επανανάγνωση απέτυχε/.test(t)) && !t18.some(t => /Η διαγραφή απέτυχε/.test(t)), '(18) said as «διαγράφηκε, αλλά η επανανάγνωση απέτυχε», never «η διαγραφή απέτυχε»: ' + JSON.stringify(t18));
    ok(await page.$('.wi-rly-fail') !== null, '(18) the banner offers ↻');
    await page.evaluate(() => _wiRelayReload()); await waitIdle(page);
    ok(await page.$('.wi-rly-fail') === null && await page.$('.wi-rly-row[data-rly-id="recLMg3"]') === null, '(18) ↻ re-reads: banner gone, the deleted relay is not drawn');

    console.log('\n(13) assignment popover hint');
    await page.locator('#wi-imp-recImp3 .wk3-assign').click();
    await page.waitForTimeout(300);
    const hint = await page.$eval('#wi-popover .wi-rly-hint', e => e.textContent).catch(() => '');
    ok(/«…με τοπικό οδηγό»/.test(hint) && /μεταφέρει ΟΛΟ το δρομολόγιο/.test(hint), '(13) hint on an order that has a driver: ' + hint);
    await shot(page, 'local-relay-weekly-after-popover-1440.png');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.locator('#wi-imp-recImpU .wk3-assign').click();
    await page.waitForTimeout(300);
    ok(await page.$('#wi-popover') !== null && await page.$('#wi-popover .wi-rly-hint') === null && /ΣΥΝΕΡΓΑΤΗΣ/.test(await page.$eval('#wi-popover', e => e.innerText).catch(() => '')), '(13) no hint on a first assignment (no driver yet)');
    ok(S.errors.length === 0, 'page A: no page errors ' + S.errors.join(' | '));
    await page.context().close();
  }

  // ── Page B: the Worker drops «Trailer» silently (facade trap #1) ────────
  {
    console.log('\n(10) a dropped label is caught by the read-back');
    const { page, S } = await newPage(browser, { dropLabels: ['Trailer'] });
    await openRelay(page, 'recImp3');
    await page.selectOption('#rly_drv', 'recDrvL1');
    S.armed = true;
    await page.click('#rly_submit');
    await page.waitForFunction(() => document.getElementById('wi-panel').style.display !== 'block', null, { timeout: 8000 });
    await waitIdle(page);
    const rec = S.db[T.LM].find(r => r.id.startsWith('recLMnew'));
    const toasts = await page.evaluate(() => window.__toasts);
    ok(toasts.some(t => /ΔΕΝ επιβεβαιώθηκαν: Ρυμούλκα/.test(t)), '(10) error names the label: ' + toasts.filter(t => /επιβεβαι/.test(t)).join(' | '));
    ok(rec && await page.$(`.wi-rly-row[data-rly-id="${rec.id}"].err`) !== null, '(10) the sub-row carries ⚠');
    await page.evaluate(() => _wiRelayReload()); await waitIdle(page);
    ok(rec && await page.$(`.wi-rly-row[data-rly-id="${rec.id}"].err`) !== null, '(10) ⚠ survives a repaint');
    ok(S.errors.length === 0, 'page B: no page errors ' + S.errors.join(' | '));
    await page.context().close();
  }

  // ── Page C: the base refuses (Worker 422 with the Greek text) ───────────
  {
    console.log('\n(11) a DB refusal stays in the panel');
    const { page, S } = await newPage(browser, { refuse: 'vs' });
    await openRelay(page, 'recImp3');
    await page.selectOption('#rly_drv', 'recDrvL1');
    S.armed = true;
    await page.click('#rly_submit');
    await page.waitForFunction(() => { const e = document.getElementById('rly_err'); return e && !e.hidden; }, null, { timeout: 8000 });
    const err = await page.$eval('#rly_err', e => e.textContent);
    ok(/^Δεν αποθηκεύτηκε: Η παραγγελία περνά από Veroia Switch/.test(err), '(11) panel says: ' + err);
    ok(await page.$eval('#wi-panel', e => e.style.display) === 'block' && !(await page.$eval('#rly_submit', e => e.disabled)), '(11) panel stays open, button usable again');
    ok(S.log.filter(l => l.k === 'lmpost').length === 1 && !S.log.some(l => l.k === 'lmget1'), '(11) ONE POST (422 is not retried), no read-back of a row that does not exist');
    await shot(page, 'local-relay-weekly-after-refused-1440.png');
    ok(S.errors.length === 0, 'page C: no page errors ' + S.errors.join(' | '));
    await page.context().close();
  }

  // ── Page D: old Worker without «Move Kind» ──────────────────────────────
  {
    console.log('\n(6) an old Worker: 422 on the «Move Kind» filter');
    const { page, S } = await newPage(browser, { noMoveKind: true });
    const banner = await page.$eval('.wi-rly-fail', e => e.innerText).catch(() => '');
    ok(/δεν φορτώθηκαν/.test(banner) && /Move Kind/.test(banner) && /060/.test(banner), '(6) the old Worker\'s 422 becomes the banner: ' + banner.replace(/\s+/g, ' ').slice(0, 200));
    ok(await page.$$eval('.wi-rly-row', els => els.length) === 0, '(6) no sub-row drawn from a read we cannot trust');
    const it = relayItems(await ctxItems(page, `_wiImpCtx(${EV},${await rowIdOf(page, 'recImp3')})`));
    ok(it.length === 1 && it[0].dis, '(6) menu item present but disabled');
    await page.evaluate(() => { const c = document.getElementById('wi-ctx'); if (c) c.style.display = 'none'; });
    await shot(page, 'local-relay-weekly-after-no-move-kind-1440.png');
    ok(S.errors.length === 0, 'page D: no page errors ' + S.errors.join(' | '));
    await page.context().close();
  }

  // ── Page F: the relays answer late — the board does not wait ────────────
  {
    console.log('\n(6b) the board paints before the relays answer');
    const { page, S } = await newPage(browser, { lmDelay: 4000 });
    const st = await page.evaluate(() => WINTL.relay && WINTL.relay.state);
    ok(st === 'loading' && await page.$$eval('.wk3-row', els => els.length) > 5, '(6b) rows drawn while the relay read is still out (state ' + st + ')');
    const it = relayItems(await ctxItems(page, `_wiImpCtx(${EV},${await rowIdOf(page, 'recImp3')})`));
    ok(it.length === 1 && it[0].dis && /φορτώνουν/.test(it[0].tip), '(6b) the item is closed «…φορτώνουν ακόμη»: ' + JSON.stringify(it));
    await page.evaluate(() => { const c = document.getElementById('wi-ctx'); if (c) c.style.display = 'none'; });
    await page.waitForFunction(() => WINTL.relay && WINTL.relay.state === 'ok', null, { timeout: 10000 });
    await page.waitForTimeout(200);
    ok(await page.$('.wi-rly-row[data-rly-id="recLM1"]') !== null, '(6b) the sub-rows arrive with the relays (one repaint)');
    ok(S.errors.length === 0, 'page F: no page errors ' + S.errors.join(' | '));
    await page.context().close();
  }

  // ── Page E: read-only role ──────────────────────────────────────────────
  {
    console.log('\n(14) read-only role');
    const { page, S } = await newPage(browser, { role: 'management' });
    ok(await page.$('.wi-rly-row[data-rly-id="recLM1"]') !== null, '(14) management sees the relay sub-row');
    await page.locator('.wi-rly-row[data-rly-id="recLM1"]').click();
    await page.waitForTimeout(300);
    ok(await page.$eval('#wi-panel', e => e.style.display) !== 'block', '(14) a click opens no panel');
    ok((await page.evaluate(() => window.__toasts)).some(t => /Μόνο ανάγνωση/.test(t)), '(14) «Μόνο ανάγνωση» said');
    ok(S.errors.length === 0, 'page E: no page errors ' + S.errors.join(' | '));
    await page.context().close();
  }
}
