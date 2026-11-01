// Rig — locations, owner 1/11 (F15, F16, the space a person types), front end only. Judged by what reached the fake
// facade and /plan/* (method, path, body) and by the DOM; never by a toast. Synthetic data only (public repo).
//   dup    «Τοποθεσίες → Νέα»: a place that looks like one in the list is said first (no POST); the second press
//          creates it (one POST); a Greek city is written in Latin letters
//   f15    the national v5 order form: a place not in the list is made from the picker («+ Νέα τοποθεσία»), lands in
//          the field, and the order is sent with its number
//   use    the order forms' new-place panel: «Χρήση αυτής» on the warning takes the place that exists, no POST
//   space  a place stored with a no-break space is found by the plain space a person types
// Usage: node tests/critics/locations-dup-rig.js [dup f15 use space]   (cwd: the main repo, for playwright)
// Exit: 0 green · 1 a check failed · 2 unknown scenario.
'use strict';
const K = require('./wn5-rig-kit.js');

const ORDER = '.wi4-dlg[role="dialog"][data-wn5="order"]';
const LOC_PATH = /\/tblxu8DRfTQOFRCzS$/;
const NBSP = String.fromCharCode(160);

// the facade's LOCATIONS: the kit's places plus, when asked, more; a POST answers with the record it would make
async function facade(page, opts = {}) {
  const st = { posts: [], created: null };
  const extra = opts.extra || [];
  await page.route(`**/${K.HOST}/v0/**`, async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (req.method() === 'POST' && LOC_PATH.test(p)) {
      const body = JSON.parse(req.postData() || '{}');
      st.posts.push(body);
      st.created = { id: 'recLocRigNew', fields: body.fields };
      return json(st.created);
    }
    if (req.method() === 'GET' && LOC_PATH.test(p)) return json({ records: K.FACADE_LOCS.concat(extra, st.created ? [st.created] : []) });
    return route.fallback();
  });
  return st;
}

async function dup({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, {});
  const st = await facade(page);
  await page.evaluate(() => navigate('locations'));
  await page.waitForTimeout(800);
  await page.evaluate(() => _locOpenCreate());
  await page.waitForSelector('#locF_name', { timeout: 5000 }).catch(() => {});
  // «ATHENS TEST» is in the list (kit); typed again as «Athens Test S.A.», ΑΘΗΝΑ, GR
  await page.fill('#locF_name', 'Athens Test S.A.');
  await page.fill('#locF_city', 'ΑΘΗΝΑ');
  await page.selectOption('#locF_country', 'GR').catch(() => {});
  await page.click('#locSaveBtn');
  await page.waitForTimeout(500);
  const warn = await page.evaluate(() => { const w = document.getElementById('locDupWarn'); return w && !w.hidden ? w.textContent : ''; });
  ok(scn, 'the first press says «Υπάρχει ήδη: ATHENS TEST …» and sends nothing', /Υπάρχει ήδη/.test(warn) && /ATHENS TEST/.test(warn) && st.posts.length === 0, [warn, st.posts]);
  ok(scn, 'the button now reads «Δημιουργία νέας»', (await K.text(page, '#locSaveBtn')) === 'Δημιουργία νέας', await K.text(page, '#locSaveBtn'));
  await page.click('#locSaveBtn');
  await page.waitForTimeout(800);
  const f = st.posts[0] && st.posts[0].fields;
  ok(scn, 'the second press creates it: ONE POST to LOCATIONS', st.posts.length === 1, st.posts);
  ok(scn, 'the Greek city went in Latin letters (ΑΘΗΝΑ → ATHINA), the country as the code', !!f && f.City === 'ATHINA' && f.Country === 'GR', f);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

async function f15({ browser, origin, ok, scn }) {
  const lookups = K.clone(K.LOOKUPS);
  let made = false;
  const { page, S } = await K.openApp(browser, origin, { lookups, plan: {
    // the base's catalogue has the place once it exists (plan_lookups reads the table)
    'GET /plan/lookups': async (e, St) => [200, made ? Object.assign(K.clone(St.lookups), { locations: St.lookups.locations.concat([{ id: 7, legacy_id: 'recLocRigNew', name: 'KOZANI DEPOT TEST', address: null, city: 'Kozani', phone: null }]) }) : St.lookups] } });
  const st = await facade(page);
  await page.evaluate(() => WN5Form.openOrder({}));
  await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
  const pid = await page.evaluate((o) => document.querySelector(`${o} .wn5f-rows[data-k="load"] .wn5f-row`).dataset.pid, ORDER);
  await page.fill(`#ls_${pid}`, 'Kozani Depot Test');
  await page.waitForTimeout(200);
  const opt = await page.evaluate((id) => { const d = document.getElementById('ls_' + id + '_d'); return d && d.style.display !== 'none' ? d.textContent : ''; }, pid);
  ok(scn, 'a place the list does not hold: the picker offers «+ Νέα τοποθεσία «Kozani Depot Test»»', /\+ Νέα τοποθεσία «Kozani Depot Test»/.test(opt), opt);
  await page.dispatchEvent(`#ls_${pid}_d .wn5f-newloc-opt`, 'mousedown');
  await page.waitForTimeout(300);
  const panel = await page.evaluate((o) => {
    const p = document.querySelector(`${o} .wn5f-newloc`);
    const name = p && p.querySelector('input[id$="_name"]');
    const cc = p && p.querySelector('select[id$="_country"]');
    const form = p && p.querySelector('.loc-scan-form');
    return { here: !!p, open: !!form && !form.hidden, name: name && name.value, cc: cc && cc.value };
  }, ORDER);
  ok(scn, 'the new-place panel opens under the row, open, with the typed name and Greece', panel.here && panel.open && panel.name === 'Kozani Depot Test' && panel.cc === 'GR', panel);
  await page.evaluate((o) => {
    const p = document.querySelector(`${o} .wn5f-newloc`);
    p.querySelector('input[id$="_city"]').value = 'ΚΟΖΑΝΗ';
    p.querySelector('input[id$="_name"]').value = 'KOZANI DEPOT TEST';
  }, ORDER);
  made = true;
  await page.click(`${ORDER} .wn5f-newloc button.btn-primary`);
  await page.waitForTimeout(1200);
  const f = st.posts[0] && st.posts[0].fields;
  ok(scn, 'ONE POST to LOCATIONS: the name, the city in Latin letters, GR', st.posts.length === 1 && f && f.Name === 'KOZANI DEPOT TEST' && f.City === 'KOZANI' && f.Country === 'GR', st.posts);
  const field = await page.evaluate((id) => ({ v: document.getElementById('lv_' + id).value, l: document.getElementById('ls_' + id).value }), pid);
  ok(scn, 'the field holds the new place (its record id and label) — no reload, no trip to «Τοποθεσίες»', field.v === 'recLocRigNew' && /KOZANI DEPOT TEST/.test(field.l), field);
  // the order goes out with the new place's number
  await page.evaluate((o) => {
    const b = document.querySelector(`${o} .wn5f-ord`);
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    fhPickLinked(b.querySelector('[data-cpick]').dataset.cpick, 'recWn5Cli41', 'ΠΕΛΑΤΗΣ Α');
    b.querySelector('[data-pe="no"]').click();
    const lr = b.querySelector('.wn5f-rows[data-k="load"] .wn5f-row'), dr = b.querySelector('.wn5f-rows[data-k="drop"] .wn5f-row');
    fhPickLinked(dr.dataset.pid, 'recWn5LocAth', 'ATHENS TEST');
    set(lr.querySelector('[data-f="day"]'), '2026-10-14'); set(dr.querySelector('[data-f="day"]'), '2026-10-15');
    set(lr.querySelector('[data-f="pal"]'), '6');
    const v = document.querySelector('#wn5f-vday'); if (v) set(v, '2026-10-14');
  }, ORDER);
  await page.waitForTimeout(200);
  await page.click(`${ORDER} [data-act="save"]`, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const posts = K.planOf(S, 'POST', '/plan/orders');
  const sh = posts[0] && posts[0].body && posts[0].body.orders && posts[0].body.orders[0] && posts[0].body.orders[0].shipments[0];
  ok(scn, 'ONE POST /plan/orders loading at the new place by its number (origin_location_id 7)', posts.length === 1 && !!sh && sh.origin_location_id === 7,
    posts.map((x) => x.raw).concat([await K.text(page, `${ORDER} [data-err]`), await K.text(page, `${ORDER} [data-strip]`)]));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

async function use({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, {});
  const st = await facade(page);
  await page.evaluate(() => WN5Form.openOrder({}));
  await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
  const pid = await page.evaluate((o) => document.querySelector(`${o} .wn5f-rows[data-k="load"] .wn5f-row`).dataset.pid, ORDER);
  await page.fill(`#ls_${pid}`, 'Larisa Test GmbH');
  await page.waitForTimeout(200);
  await page.dispatchEvent(`#ls_${pid}_d .wn5f-newloc-opt`, 'mousedown');
  await page.waitForTimeout(300);
  await page.evaluate((o) => { document.querySelector(`${o} .wn5f-newloc input[id$="_city"]`).value = 'Larisa'; }, ORDER);
  await page.click(`${ORDER} .wn5f-newloc button.btn-primary`);
  await page.waitForTimeout(600);
  const warn = await page.evaluate((o) => { const w = document.querySelector(`${o} .wn5f-newloc .loc-dup`); return w && !w.hidden ? w.textContent : ''; }, ORDER);
  ok(scn, '«Larisa Test GmbH»: the panel says «Υπάρχει ήδη: LARISA TEST …» and sends nothing', /Υπάρχει ήδη/.test(warn) && /LARISA TEST/.test(warn) && st.posts.length === 0, [warn, st.posts]);
  await page.click(`${ORDER} .wn5f-newloc .loc-dup button`);
  await page.waitForTimeout(400);
  const field = await page.evaluate((id) => ({ v: document.getElementById('lv_' + id).value, l: document.getElementById('ls_' + id).value }), pid);
  ok(scn, '«Χρήση αυτής» puts the existing place in the field, nothing created', field.v === 'recWn5LocLar' && /LARISA TEST/.test(field.l) && st.posts.length === 0, [field, st.posts]);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

async function space({ browser, origin, ok, scn }) {
  const NB = { id: 'recLocRigNb', fields: { Name: 'VERMION TEST' + NBSP + ' (WAREHOUSE)', City: 'Kopanos', Country: 'GR' } };
  const { page, S } = await K.openApp(browser, origin, {});
  await facade(page, { extra: [NB] });
  await page.evaluate(() => WN5Form.openOrder({}));
  await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
  const got = await page.evaluate((o) => {
    const r = document.querySelector(`${o} .wn5f-rows[data-k="load"] .wn5f-row`);
    WN5Form.locDrop(r.dataset.pid, 'vermion test (ware');
    const d = document.getElementById('ls_' + r.dataset.pid + '_d');
    return d ? d.textContent : '';
  }, ORDER);
  ok(scn, 'typed with one plain space, the place stored with a no-break space is found', /VERMION TEST/.test(got), got.slice(0, 200));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

K.run({ scenarios: { dup, f15, use, space }, globals: ['WN5', 'WN5Act', 'WN5Form'],
  go: 'F15 / F16 warning / spaces hold' });
