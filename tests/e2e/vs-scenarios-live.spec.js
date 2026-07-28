// ============================================================================
// vs-scenarios-live.spec.js — Phase 4: the 5 Veroia Switch scenarios, LIVE
// ----------------------------------------------------------------------------
// Runs the canonical TESTING.md scenarios against the post-C2 production app:
// real login, the real order modal filled via its own field contract, the real
// submitIntlOrder/deleteIntlOrder paths (i.e. the frontend sync logic under
// test), with outcomes verified through the Worker 2 facade, not the UI text.
//
// Data discipline:
//   - Every record carries Reference 'ZZ-C2TEST-*' so the post-run diff can
//     separate test churn from the frozen-reference baseline.
//   - Scenario 4's drag-to-truck half is DELIBERATELY SKIPPED: it lives in the
//     petras-assign iframe, which still writes to Airtable, and nothing may
//     write to the frozen reference.
//   - Cleanup deletes every created order through the app's own delete path,
//     which doubles as extra cascade coverage.
// Credentials via env (PW_TMS_USER/PW_TMS_PASS + owner creds for verification).
// ============================================================================

const { test, expect } = require('@playwright/test');

const USER = process.env.PW_TMS_USER || '';
const PASS = process.env.PW_TMS_PASS || '';

const BACKEND = 'https://petras-tms-backend-staging.petrasgroup.workers.dev';
const ORIGIN = 'https://dimitrispetras21-del.github.io';
const BASE = 'appElT5CQV6JQvym8';

const T = {
  ORDERS: 'tblgHlNmLBH3JTdIM',
  STOPS: 'tblaeY5QOHAS1gyE8',
  NAT_ORDERS: 'tblGHCCsTMqAy4KR2',
  NAT_LOADS: 'tblVW42cZnfC47gTb',
  GL: 'tblxUAaIsUMEDl3qQ',
};

// Real records from the frozen reference dump (read-only lookups).
const CLIENT = 'rec0223S7nAieiVDQ';            // KIRIL STOYCHEV-97 LTD
const LOC_GR_LOAD = 'recxXaCF5gd4X2UqP';       // Nestle Hellas Aspropyrgos
const LOC_DE = 'rec0XHAxGFXPgTomr';            // Edeka Fruchtkontor Süd, DE
const LOC_HU = 'rec0AJUCbB8IJNbzM';            // Tesco Központi Raktár, HU
const LOC_GR_DELIV = 'rec08nR4rv2dn0gem';      // DkCo Warehouse B, GR
const SUPPLIERS = ['rec07YeGx6owbqYSq', 'rec0kwGRHagjr0kyc', 'rec0sro5AfKl7Pe6F'];

// Current-week dates so the weekly views show the rows without navigation.
function isoPlus(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}
const LOAD_DATE = isoPlus(1);
const DELIV_DATE = isoPlus(4);
const EXPECT_CD_EXPORT = isoPlus(2);  // Export: loading + 1
const EXPECT_CD_IMPORT = isoPlus(3);  // Import: delivery - 1

// ── facade helpers (node side, owner JWT) ───────────────────────────────────
let ownerToken = '';
async function apiLogin() {
  const r = await fetch(`${BACKEND}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ username: process.env.PW_OWNER_USER, password: process.env.PW_OWNER_PASS }),
  });
  const d = await r.json();
  if (!d.token) throw new Error('owner login failed');
  ownerToken = d.token;
}
async function apiAll(tableId) {
  const out = [];
  let offset = '';
  do {
    const u = `${BACKEND}/v0/${BASE}/${tableId}?pageSize=100${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`;
    // Fail LOUDLY on a bad page: a silently-dropped page once made a created
    // order look missing and sent the debugging in the wrong direction.
    let r = await fetch(u, { headers: { Authorization: `Bearer ${ownerToken}`, Origin: ORIGIN } });
    if (!r.ok) {
      await new Promise((res) => setTimeout(res, 1500)); // one retry for transient hiccups
      r = await fetch(u, { headers: { Authorization: `Bearer ${ownerToken}`, Origin: ORIGIN } });
      if (!r.ok) throw new Error(`apiAll(${tableId}) HTTP ${r.status} at offset '${offset}'`);
    }
    const d = await r.json();
    out.push(...(d.records || []));
    offset = d.offset || '';
  } while (offset);
  return out;
}
const byRef = (rows, ref) => rows.filter((r) => (r.fields['Reference'] || '') === ref);

// ── in-page order creation through the real modal contract ──────────────────
async function createOrder(page, o) {
  await page.evaluate(() => window.navigate('orders_intl'));
  await page.waitForTimeout(2500);
  await page.evaluate(() => openIntlCreate());
  await page.waitForSelector('#f_Type', { timeout: 10000 });

  await page.evaluate((o) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const chk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };
    set('f_Type', o.type);
    set('f_Direction', o.direction);
    set('f_Price', o.price);
    set('f_Temp', '4');
    set('f_ReeferMode', 'Continuous');
    set('f_PalletType', 'EUR');
    set('f_Reference', o.ref);
    set('f_Notes', 'C2 cutover Phase 4 automated scenario, safe to delete');
    chk('f_VeroiaSwitch', !!o.vs);
    chk('f_Groupage', !!o.grp);
    set('lv_client', o.client);
    o.loads.forEach((s, i) => {
      if (i > 0 && !document.getElementById(`lv_l_${i + 1}`)) _addStop('l');
      set(`lv_l_${i + 1}`, s.loc); set(`pal_l_${i + 1}`, String(s.pal)); set(`dt_l_${i + 1}`, s.dt);
    });
    o.unloads.forEach((s, i) => {
      if (i > 0 && !document.getElementById(`lv_u_${i + 1}`)) _addStop('u');
      set(`lv_u_${i + 1}`, s.loc); set(`pal_u_${i + 1}`, String(s.pal)); set(`dt_u_${i + 1}`, s.dt);
    });
  }, o);

  await page.evaluate(async () => { await submitIntlOrder(''); });
  await page.waitForTimeout(4000); // let the VS/GRP sync cascade settle
}

test.describe.configure({ mode: 'serial' });
test.describe('Veroia Switch scenarios on live production', () => {
  test.skip(!USER || !PASS, 'PW_TMS_USER / PW_TMS_PASS not set');
  test.use({ serviceWorkers: 'block' });
  test.setTimeout(180 * 1000);

  /** @type {import('@playwright/test').Page} */
  let page;
  const airtableCalls = [];

  // Cascade-delete every ZZ-C2TEST-* order (a failed run skips the tail
  // cleanup in serial mode, and stale leftovers break the byRef assertions).
  async function purgeTestOrders() {
    const stale = (await apiAll(T.ORDERS)).filter((o) => (o.fields['Reference'] || '').startsWith('ZZ-C2TEST'));
    for (const o of stale) {
      await fetch(`${BACKEND}/v0/${BASE}/${T.ORDERS}/${o.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}`, Origin: ORIGIN },
      });
    }
    if (stale.length) console.log(`purged ${stale.length} stale test order(s)`);
  }

  test.beforeAll(async ({ browser }) => {
    await apiLogin();
    await purgeTestOrders();
    page = await browser.newPage();
    page.on('dialog', (d) => d.accept());
    page.on('request', (r) => { if (r.url().includes('api.airtable.com')) airtableCalls.push(r.url()); });
    await page.goto('https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/index.html', { waitUntil: 'domcontentloaded' });
    await page.fill('#username', USER);
    await page.fill('#password', PASS);
    await page.click('.btn-login');
    await expect(page).toHaveURL(/app\.html/, { timeout: 20000 });
    await page.waitForSelector('.nav-item', { timeout: 30000 });
  });

  test.afterAll(async () => {
    expect(airtableCalls, `AIRTABLE CONTACTED:\n${airtableCalls.join('\n')}`).toHaveLength(0);
    await page?.close();
  });

  test('Scenario 1: Export VS creates order + stops + Direct ΑΝΟΔΟΣ national load', async () => {
    await createOrder(page, {
      type: 'International', direction: 'Export', price: '1500', ref: 'ZZ-C2TEST-1',
      client: CLIENT, vs: true, grp: false,
      loads: [{ loc: LOC_GR_LOAD, pal: 10, dt: LOAD_DATE }],
      unloads: [{ loc: LOC_DE, pal: 10, dt: DELIV_DATE }],
    });

    const orders = byRef(await apiAll(T.ORDERS), 'ZZ-C2TEST-1');
    expect(orders, 'ORDER not created').toHaveLength(1);
    const oid = orders[0].id;

    const stops = (await apiAll(T.STOPS)).filter((s) => (s.fields['Parent Order'] || []).includes(oid));
    const types = stops.map((s) => s.fields['Stop Type']).sort();
    expect(types, 'expected Loading + Unloading + auto Cross-dock').toEqual(['Cross-dock', 'Loading', 'Unloading']);

    const nls = (await apiAll(T.NAT_LOADS)).filter((n) => (n.fields['Source Orders'] || '') === oid);
    expect(nls, 'no Direct NAT_LOAD for the VS order').toHaveLength(1);
    expect(nls[0].fields['Source Type']).toBe('Direct');
    expect(nls[0].fields['Direction']).toBe('South→North') /* arrows: client unified the vocabulary post-TESTING.md; frozen reference confirms */;
    expect((nls[0].fields['Loading DateTime'] || '').slice(0, 10)).toBe(LOAD_DATE);
    expect((nls[0].fields['Delivery DateTime'] || '').slice(0, 10)).toBe(EXPECT_CD_EXPORT);
  });

  test('Scenario 2: Import VS creates Direct ΚΑΘΟΔΟΣ national load', async () => {
    await createOrder(page, {
      type: 'International', direction: 'Import', price: '1800', ref: 'ZZ-C2TEST-2',
      client: CLIENT, vs: true, grp: false,
      loads: [{ loc: LOC_HU, pal: 8, dt: LOAD_DATE }],
      unloads: [{ loc: LOC_GR_DELIV, pal: 8, dt: DELIV_DATE }],
    });

    const orders = byRef(await apiAll(T.ORDERS), 'ZZ-C2TEST-2');
    expect(orders).toHaveLength(1);
    const oid = orders[0].id;

    const nls = (await apiAll(T.NAT_LOADS)).filter((n) => (n.fields['Source Orders'] || '') === oid);
    expect(nls, 'no Direct NAT_LOAD for the import VS order').toHaveLength(1);
    expect(nls[0].fields['Direction']).toBe('North→South');
    expect((nls[0].fields['Loading DateTime'] || '').slice(0, 10)).toBe(EXPECT_CD_IMPORT);
    expect((nls[0].fields['Delivery DateTime'] || '').slice(0, 10)).toBe(DELIV_DATE);
  });

  test('Scenario 3: turning VS OFF removes the national load, keeps the order', async () => {
    const orders = byRef(await apiAll(T.ORDERS), 'ZZ-C2TEST-1');
    const oid = orders[0].id;

    await page.evaluate(() => window.navigate('orders_intl'));
    await page.waitForTimeout(2500);
    await page.evaluate((oid) => openIntlEdit(oid), oid);
    await page.waitForSelector('#f_VeroiaSwitch', { timeout: 10000 });
    await page.evaluate((oid) => {
      document.getElementById('f_VeroiaSwitch').checked = false;
      return submitIntlOrder(oid);
    }, oid);
    await page.waitForTimeout(4000);

    const nls = (await apiAll(T.NAT_LOADS)).filter((n) => (n.fields['Source Orders'] || '') === oid);
    expect(nls, 'Direct NAT_LOAD should be gone after VS OFF').toHaveLength(0);
    expect(byRef(await apiAll(T.ORDERS), 'ZZ-C2TEST-1'), 'the ORDER itself must survive').toHaveLength(1);
  });

  test('Scenario 4: groupage order creates NAT_ORDER + one GL line per supplier', async () => {
    await createOrder(page, {
      type: 'International', direction: 'Export', price: '900', ref: 'ZZ-C2TEST-4',
      client: CLIENT, vs: true, grp: true,
      loads: SUPPLIERS.map((loc) => ({ loc, pal: 4, dt: LOAD_DATE })),
      unloads: [{ loc: LOC_GR_DELIV, pal: 12, dt: DELIV_DATE }],
    });

    const orders = byRef(await apiAll(T.ORDERS), 'ZZ-C2TEST-4');
    expect(orders).toHaveLength(1);
    const oid = orders[0].id;

    const gls = (await apiAll(T.GL)).filter((g) => (g.fields['Linked International Order'] || []).includes(oid));
    expect(gls.length, 'expected one GL line per supplier').toBe(SUPPLIERS.length);
    for (const g of gls) expect(g.fields['Status']).toBe('Unassigned');

    // Drag-to-truck (CONS_LOAD creation) DELIBERATELY not exercised: it lives
    // in the petras-assign iframe, which still writes to Airtable (frozen).
  });

  test('Scenario 5: cascade delete removes the groupage order and its children', async () => {
    const orders = byRef(await apiAll(T.ORDERS), 'ZZ-C2TEST-4');
    const oid = orders[0].id;

    await page.evaluate(() => window.navigate('orders_intl'));
    await page.waitForTimeout(2500);
    await page.evaluate(async (oid) => { await deleteIntlOrder(oid); }, oid);
    await page.waitForTimeout(5000);

    expect(byRef(await apiAll(T.ORDERS), 'ZZ-C2TEST-4'), 'order should be gone').toHaveLength(0);
    const stops = (await apiAll(T.STOPS)).filter((s) => (s.fields['Parent Order'] || []).includes(oid));
    expect(stops, 'stops should be gone').toHaveLength(0);
    // GL never-delete rule: lines survive as Unassigned OR are gone via the
    // transactional cascade; both count as "no orphaned Assigned lines".
    const gls = (await apiAll(T.GL)).filter((g) => (g.fields['Linked International Order'] || []).includes(oid));
    for (const g of gls) expect(g.fields['Status']).toBe('Unassigned');
  });

  test('Cleanup: delete the remaining test orders through the app', async () => {
    for (const ref of ['ZZ-C2TEST-1', 'ZZ-C2TEST-2']) {
      const found = byRef(await apiAll(T.ORDERS), ref);
      for (const o of found) {
        await page.evaluate(async (oid) => { await deleteIntlOrder(oid); }, o.id);
        await page.waitForTimeout(4000);
      }
      expect(byRef(await apiAll(T.ORDERS), ref), `${ref} should be cleaned up`).toHaveLength(0);
    }
  });
});
