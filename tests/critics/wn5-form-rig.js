// Rig — National v5 F4α forms (T20 order form; T21 leg form; T22 VS day/destination). Judged by what reached the
// fake /plan/* (S.plan: method, path, body, count, order) and by what the page shows; never by a toast. Synthetic
// week of tests/critics/wn5-rig-kit.js. The default answer of every non-dry write is 409 writes_closed, as deployed
// until day L; scenarios script their own answers with sentinel messages.
// Usage: node tests/critics/wn5-form-rig.js [order groupage unknown reused replayed edit leg leg-anodos …]
//        WN5_TREE=<git archive origin/main> node tests/critics/wn5-form-rig.js   (plain-main proof: NO-GO, exit 1)
// Exit: 0 green · 1 a check failed · 2 unknown scenario.
'use strict';
const K = require('./wn5-rig-kit.js');

const DLG = '.wi4-dlg[role="dialog"][data-wn5="order"]';
const C41 = { rec: 'recWn5Cli41', label: 'ΠΕΛΑΤΗΣ Α' }, C42 = { rec: 'recWn5Cli42', label: 'ΠΕΛΑΤΗΣ Β' }, C43 = { rec: 'recWn5Cli43', label: 'ΠΕΛΑΤΗΣ Γ' };
const HUB = { rec: 'recJucKOhC1zh4IP3', label: 'ΒΕΡΟΙΑ TEST' }, ATH = { rec: 'recWn5LocAth', label: 'ATHENS TEST' },
  ASP = { rec: 'recWn5LocAsp', label: 'ASPROPYRGOS TEST' }, LAR = { rec: 'recWn5LocLar', label: 'LARISA TEST' }, THE = { rec: 'recWn5LocThe', label: 'THESSALONIKI TEST' };
// the board's day format (WI4.dayLabel: «Δευ 12/10», no zero pad), recomputed here so the rig does not trust the page
const WI4dl = (d) => { const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)));
  return ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'][t.getUTCDay()] + ' ' + t.getUTCDate() + '/' + (t.getUTCMonth() + 1); };
const r = (loc, day, from, to, pal) => Object.assign({}, loc, { day, from, to, pal });
const ORDER_A = { client: C41, price: 310, temp: 4, pe: false, loads: [r(ASP, '2026-10-14', '11:00', '12:00', 6)], drops: [r(ATH, '2026-10-15', '08:00', '10:00', 6)] };

// Fills order block i of the open form through the REAL pickers (fhPickLinked) and inputs.
async function fillOrder(page, i, o) {
  await page.evaluate(([i, o, dlg]) => {
    const box = document.querySelector(dlg);
    let blocks = box.querySelectorAll('.wn5f-ord');
    while (blocks.length <= i) { box.querySelector('[data-act="add-order"]').click(); blocks = box.querySelectorAll('.wn5f-ord'); }
    const b = blocks[i];
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    fhPickLinked(b.querySelector('[data-cpick]').dataset.cpick, o.client.rec, o.client.label);
    set(b.querySelector('[data-f="price"]'), String(o.price));
    if (o.temp != null) set(b.querySelector('[data-f="temp"]'), String(o.temp));
    b.querySelector(`[data-pe="${o.pe ? 'yes' : 'no'}"]`).click();
    for (const k of ['load', 'drop']) {
      const want = o[k + 's'];
      const rows = () => b.querySelectorAll(`.wn5f-rows[data-k="${k}"] .wn5f-row`);
      while (rows().length < want.length) b.querySelector(`[data-act="add-row"][data-k="${k}"]`).click();
      rows().forEach((row, j) => {
        const x = want[j];
        fhPickLinked(row.dataset.pid, x.rec, x.label);
        set(row.querySelector('[data-f="day"]'), x.day);
        if (x.from) set(row.querySelector('[data-f="from"]'), x.from);
        set(row.querySelector('[data-f="to"]'), x.to);
        set(row.querySelector('[data-f="pal"]'), String(x.pal));
      });
    }
  }, [i, o, DLG]);
}
async function openForm(page, prefill) {
  await page.evaluate((p) => WN5Form.openOrder(p), prefill || {});
  await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
}
const save = (page, dlg) => page.click(`${dlg || DLG} [data-act="save"]`);
async function guard(page, ok, scn) {
  if (ok(scn, 'WN5Form present', await K.has(page, 'WN5Form'))) return true;
  await page.context().close();
  return false;
}
// Chrome logs every aborted external request (fonts, CDNs: the kit aborts what would leave the machine) and every
// scripted 4xx/5xx answer of the fake /plan/* as «Failed to load resource»: network lines, not an error of the page.
// So is the one logError line per scripted 5xx («[TMS ERROR] planFetch … rig sentinel …»: every 5xx is logged once
// by design, counted in the «unknown» scenario). Every other console error fails the scenario.
const appConsole = (S) => S.console.filter((m) => !/^Failed to load resource/.test(m) && !/^\[TMS ERROR\] planFetch [A-Z]+ \/plan\/[^:]*: PlanError: rig sentinel /.test(m));
async function closeClean(page, S, ok, scn) {
  ok(scn, 'no page errors, no console errors', !S.pageErrors.length && !appConsole(S).length, S.pageErrors.concat(appConsole(S)));
  await page.context().close();
}
const noStore = (page, id) => page.evaluate((x) => !(JSON.stringify(sessionStorage) + JSON.stringify(localStorage) + JSON.stringify(history.state) + location.href).includes(x), id);

async function scnOrder({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin);
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, {});
  ok(scn, 'the order form opened (.wi4-dlg[role=dialog][data-wn5=order])', await K.count(page, DLG) === 1);
  const txt = await K.text(page, DLG);
  ok(scn, 'label «Τιμή € (χωρίς ΦΠΑ) *»', txt.includes('Τιμή € (χωρίς ΦΠΑ) *'), txt.slice(0, 200));
  ok(scn, 'windows «Παράθυρο από – έως *»', txt.includes('Παράθυρο από – έως *'));
  ok(scn, 'truck optional: «Φορτηγό (προαιρετικό)» with «— ΠΡΟΣ ΑΝΑΘΕΣΗ»', txt.includes('Φορτηγό (προαιρετικό)') && txt.includes('ΠΡΟΣ ΑΝΑΘΕΣΗ'));
  // fidelity T20 (Figma 2011:9641/9704): an empty day reads as a whole hint, never Chrome's cut «dd/mm/yy»
  const dayE = await page.evaluate((d) => [...document.querySelectorAll(`${d} .wn5f-day`)].map((w) => w.querySelector('.wn5f-dayt').textContent), DLG);
  ok(scn, 'empty day fields: «ηη/μμ/εεεε» in the head, «ηη/μμ» in each row', dayE.length >= 3 && dayE[0] === 'ηη/μμ/εεεε' && dayE.slice(1).every((x) => x === 'ηη/μμ'), dayE);
  await page.keyboard.press('ArrowRight');   // role=dialog: the week must not move under the open form
  ok(scn, '← → do not change the week while the form is open', await K.count(page, DLG) === 1 && (await page.evaluate(() => WN5.snapshot().week)) === '2026-10-10');
  await fillOrder(page, 0, ORDER_A);
  // the weekday the frame shows in a row («Τετ 14/10», no year); the native text hidden while not edited
  const dayF = await page.evaluate((d) => [...document.querySelectorAll(`${d} .wn5f-row .wn5f-day`)].map((w) => ({ t: w.querySelector('.wn5f-dayt').textContent,
    vis: getComputedStyle(w.querySelector('.wn5f-dayt')).display !== 'none', ink: getComputedStyle(w.querySelector('input')).color })), DLG);
  ok(scn, 'filled day fields show the weekday: «Τετ 14/10» / «Πέμ 15/10», the native text hidden', dayF.length === 2
    && dayF[0].t === 'Τετ 14/10' && dayF[1].t === 'Πέμ 15/10' && dayF.every((x) => x.vis && x.ink === 'rgba(0, 0, 0, 0)'), dayF);
  await save(page);
  await page.waitForTimeout(3500);   // > the 1 s + 2 s of _atRetry: a resend would show here
  const posts = K.planOf(S, 'POST', '/plan/orders');
  ok(scn, 'one press → exactly one POST /plan/orders', posts.length === 1, posts.length);
  const b = (posts[0] && posts[0].body) || {};
  const rid = b.request_id;
  const rest = Object.assign({}, b); delete rest.request_id;
  ok(scn, 'request_id is a uuid v4', K.UUID4.test(rid || ''), rid);
  ok(scn, 'body = form state, exact keys, numbers as numbers, Athens offset', JSON.stringify(rest) === JSON.stringify({ orders: [{ client_id: 41, price: 310, pallet_exchange: false, temperature_c: 4,
    shipments: [{ origin_location_id: 3, dest_location_id: 2, pallets: 6, load_from: '2026-10-14T11:00:00+03:00', load_to: '2026-10-14T12:00:00+03:00',
      deliver_from: '2026-10-15T08:00:00+03:00', deliver_to: '2026-10-15T10:00:00+03:00' }] }] }), rest);
  ok(scn, 'no truck → no target, no stops (ΠΡΟΣ ΑΝΑΘΕΣΗ)', !('target' in b) && !('stops' in b));
  ok(scn, 'only Authorization + Content-Type sent', posts[0] && !Object.keys(posts[0].headers).some((h) => /^x-tms/i.test(h)), posts[0] && posts[0].headers);
  ok(scn, '409 writes_closed → the strip shows the Worker message as is', /rig sentinel writes_closed/.test(await K.text(page, `${DLG} [data-strip]`)), await K.text(page, `${DLG} [data-strip]`));
  ok(scn, 'after 409 the save is disabled (Ε-6)', await page.evaluate((d) => document.querySelector(`${d} [data-act="save"]`).disabled, DLG));
  ok(scn, 'the request_id lives in memory only', rid ? await noStore(page, rid) : false);
  await page.context().close();

  // the «+» of a row: same form, target = the row's side, stops = existing stop by id + one new place
  const p2 = await K.openApp(browser, origin);
  await p2.page.evaluate(() => WN5Act.plus(101, 'KATHODOS', document.querySelector('#content .wn5-row[data-rt="101"]') || document.querySelector('#content .wn5')));
  await p2.page.click('.wi4-dlg[data-wn5="plus"] >> text=Νέα παραγγελία').catch(() => {});
  await p2.page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
  ok(scn, '«+» → «Νέα παραγγελία» opens the same form, the «+» window is gone', await K.count(p2.page, DLG) === 1 && await K.count(p2.page, '.wi4-dlg[data-wn5="plus"]') === 0);
  const tg = await p2.page.evaluate((d) => { const s = document.querySelector(`${d} #wn5f-tgt`); return s ? { v: s.value, dis: s.disabled } : null; }, DLG);
  ok(scn, 'the cycle and side come prefilled and locked', tg && tg.v === '101' && tg.dis, tg);
  // fidelity T20 (Figma 2011:9641): the prefilled Veroia day in the head reads «Δευ 12/10/2026» (weekday + year)
  const hd = await p2.page.evaluate((d) => { const w = document.querySelector(`${d} .wn5f-head .wn5f-day`); return w && { v: w.querySelector('input').value, t: w.querySelector('.wn5f-dayt').textContent }; }, DLG);
  ok(scn, 'the head day shows the weekday and the year of its value', !!hd && /^\d{4}-\d\d-\d\d$/.test(hd.v)
    && hd.t === WI4dl(hd.v) + '/' + hd.v.slice(0, 4) && /^(Κυρ|Δευ|Τρί|Τετ|Πέμ|Παρ|Σάβ) /.test(hd.t), hd);
  await fillOrder(p2.page, 0, { client: C42, price: 120, temp: 2, pe: true, loads: [r(HUB, '2026-10-12', '16:00', '18:00', 4)], drops: [r(LAR, '2026-10-13', '10:00', '12:00', 4)] });
  await save(p2.page);
  await p2.page.waitForTimeout(1500);
  const b2 = (K.planOf(p2.S, 'POST', '/plan/orders')[0] || {}).body || {};
  ok(scn, '«+» body: target {rt_id:101, side:KATHODOS}', JSON.stringify(b2.target) === JSON.stringify({ rt_id: 101, side: 'KATHODOS' }), b2.target);
  ok(scn, '«+» body: Veroia by its stop_id, Larisa as one new stop', JSON.stringify(b2.stops) === JSON.stringify([{ ref: 's1', stop_id: 1001 },
    { ref: 's2', location_id: 4, side: 'KATHODOS', planned_from: '2026-10-13T10:00:00+03:00', planned_to: '2026-10-13T12:00:00+03:00' }]), b2.stops);
  await p2.page.context().close();

  // «+ Άδειες παλέτες · 1 €» (Figma 9624; the ΠΡΟΡΥΘΜΙΣΗ of 10022, Ε-39): a prefill only — nothing is sent by it
  const p3 = await K.openApp(browser, origin);
  await p3.page.evaluate(() => WN5Form.openOrder({ side: 'ANODOS', preset: 'empties' }));
  await p3.page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
  const pre = await p3.page.evaluate((d) => {
    const b = [...document.querySelectorAll(`${d} .wn5f-ord`)].pop();
    if (!b) return null;
    const drop = b.querySelector('.wn5f-rows[data-k="drop"] .wn5f-row');
    return { goods: b.querySelector('[data-f="goods"]').value, price: b.querySelector('[data-f="price"]').value,
      drop: drop ? (document.getElementById('lv_' + drop.dataset.pid) || {}).value : null, btn: !!document.querySelector(`${d} [data-act="add-empties"]`) };
  }, DLG);
  ok(scn, '«Άδειες παλέτες · 1 €»: goods + price 1 prefilled, Veroia the delivery point on ΑΝΟΔΟΣ, the button is in the form, nothing sent',
    !!pre && pre.goods === 'Άδειες παλέτες' && pre.price === '1' && pre.drop === HUB.rec && pre.btn && !K.planOf(p3.S, 'POST', '/plan/orders').length, pre);
  await p3.page.context().close();

  // ✈ «Νέα παραγγελία σε αυτό το σκέλος ›» → «Κάθοδος» (S-45, Figma 2011:8858): the same short form as the «+»
  const p4 = await K.openApp(browser, origin);
  await p4.page.evaluate(() => WN5.rowMenu(null, 101));
  await p4.page.click('#wn5-menu [data-item="new-order"]', { timeout: 2000 }).catch(() => {});
  await p4.page.click('#wn5-menu [data-item="new-order-k"]', { timeout: 2000 }).catch(() => {});
  await p4.page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
  const mk = await p4.page.evaluate((d) => { const t = document.querySelector(`${d} #wn5f-tgt`), r = document.querySelector(`${d} #wn5f-dir`);
    return t && r ? { tgt: t.value, tdis: t.disabled, dir: r.value, ddis: r.disabled } : null; }, DLG);
  ok(scn, '✈ new-order-k opens the short form', !!mk && mk.tgt === '101' && mk.tdis && mk.dir === 'KATHODOS' && mk.ddis && await K.count(p4.page, '#wn5-menu') === 0, mk);
  ok(scn, 'no page errors', ![S, p2.S, p3.S, p4.S].some((x) => x.pageErrors.length), S.pageErrors.concat(p2.S.pageErrors, p3.S.pageErrors, p4.S.pageErrors));
  ok(scn, 'no console errors', ![S, p2.S, p3.S, p4.S].some((x) => appConsole(x).length), [S, p2.S, p3.S, p4.S].flatMap(appConsole));
  await p4.page.context().close();
}

async function scnGroupage({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin);
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, {});
  await page.click(`${DLG} [data-mode="groupage"]`);
  await fillOrder(page, 0, { client: C41, price: 640, temp: 2, pe: true, loads: [r(THE, '2026-10-12', '08:00', '10:00', 6), r(ASP, '2026-10-12', '10:30', '12:00', 4)], drops: [r(ATH, '2026-10-13', '06:00', '08:00', 10)] });
  await fillOrder(page, 1, { client: C42, price: 420, temp: 4, pe: false, loads: [r(HUB, '2026-10-12', '16:00', '18:00', 12)], drops: [r(ASP, '2026-10-13', '07:00', '09:00', 12)] });
  await fillOrder(page, 2, { client: C43, price: 380, temp: 2, pe: true, loads: [r(HUB, '2026-10-12', '16:00', '18:00', 8)], drops: [r(ATH, '2026-10-13', '09:00', '11:00', 8)] });
  const label = await K.text(page, `${DLG} [data-act="save"]`);
  ok(scn, 'title «Νέο groupage εθνικής»', (await K.text(page, `${DLG} .wi4-dlg-t`)) === 'Νέο groupage εθνικής');
  ok(scn, 'button «Αποθήκευση · 3 παραγγελίες»', label === 'Αποθήκευση · 3 παραγγελίες', label);
  const sum = await K.text(page, `${DLG} [data-sum]`);
  ok(scn, 'summary «3 παραγγελίες → 4 αποστολές»', sum.includes('3 παραγγελίες → 4 αποστολές'), sum.slice(0, 300));
  ok(scn, 'no mixed-temperature line before the save (Ε-3: only from the answer)', !/Μεικτές/.test(await K.text(page, DLG)));
  await save(page);
  await page.waitForTimeout(1500);
  const posts = K.planOf(S, 'POST', '/plan/orders');
  ok(scn, '3 orders = ONE POST /plan/orders', posts.length === 1, posts.length);
  const b = (posts[0] && posts[0].body) || {};
  ok(scn, 'body.orders has 3 orders, the first with 2 shipments', Array.isArray(b.orders) && b.orders.length === 3 && b.orders[0].shipments.length === 2, b.orders && b.orders.map((o) => o.shipments.length));
  await closeClean(page, S, ok, scn);
}

async function scnUnknown({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { plan: { 'POST /plan/orders': () => K.planErr(500, 'SERVER', 'plan_unknown') } });
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, {});
  await fillOrder(page, 0, ORDER_A);
  await save(page);
  await page.waitForTimeout(3500);
  let posts = K.planOf(S, 'POST', '/plan/orders');
  ok(scn, '500 plan_unknown → exactly one POST (no automatic resend)', posts.length === 1, posts.length);
  ok(scn, 'the strip «μπορεί να αποθηκεύτηκε» is the Worker message as is', /rig sentinel plan_unknown/.test(await K.text(page, `${DLG} [data-strip]`)));
  ok(scn, '«Έλεγχος στο board» is offered', await K.count(page, `${DLG} [data-act="check-board"]`) === 1);
  await save(page);
  await page.waitForTimeout(800);
  posts = K.planOf(S, 'POST', '/plan/orders');
  ok(scn, 'second press carries the SAME request_id', posts.length === 2 && posts[0].body.request_id === posts[1].body.request_id, posts.map((x) => x.body && x.body.request_id));
  ok(scn, 'second press carries the SAME bytes', posts.length === 2 && posts[0].raw === posts[1].raw);
  await page.click(`${DLG} .wn5f-ft [data-act="cancel"]`);
  await openForm(page, {});
  await fillOrder(page, 0, ORDER_A);
  await save(page);
  await page.waitForTimeout(800);
  posts = K.planOf(S, 'POST', '/plan/orders');
  ok(scn, 'after closing the form the next open mints a new request_id', posts.length === 3 && posts[2].body.request_id !== posts[0].body.request_id, posts.map((x) => x.body && x.body.request_id));
  ok(scn, 'no request_id in sessionStorage / history / URL', await noStore(page, posts[0].body.request_id));
  const logged = await page.evaluate(() => (window.__ev || []).filter((x) => x.k === 'logError' && /planFetch POST \/plan\/orders/.test(String(x.a[1]))).length);
  ok(scn, 'each 500 plan_unknown is logged exactly once (3 POSTs → 3 logError)', logged === posts.length, { logged, posts: posts.length });
  await closeClean(page, S, ok, scn);
}

async function scnReused({ browser, origin, ok, scn }) {
  let held = false;
  const plan = {
    // the FIRST press was saved: the stub writes the order into the board, then answers request_reused (no ids)
    'POST /plan/orders': (e, S) => {
      S.board.waiting.push({ piece_id: 4901, shipment_id: 5901, kind: 'national', order_id: null, nat_order_id: 3901, order_stop_id: null, pallets: 6, leave_by: null,
        position_location_id: 3, nat_from_location_id: 3, nat_to_location_id: 2, nat_ready_day: '2026-10-14', nat_due_day: '2026-10-15', overdue: false, is_stock: false,
        client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', reference: null, temperature_c: 4, pallet_exchange: false, load_from: e.body.orders[0].shipments[0].load_from,
        load_to: e.body.orders[0].shipments[0].load_to, deliver_from: e.body.orders[0].shipments[0].deliver_from, deliver_to: e.body.orders[0].shipments[0].deliver_to, price: 310 });
      held = true;
      return K.planErr(422, 'PLAN_RULE', 'request_reused');
    },
    // the re-read after the refusal is held 1 s: «αποθηκεύτηκε» must wait for it
    'GET /plan/board': async (e, S) => { if (held) await K.sleep(1000); return [200, S.board]; },
  };
  const { page, S } = await K.openApp(browser, origin, { plan });
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, {});
  await fillOrder(page, 0, ORDER_A);
  const n0 = K.planOf(S, 'GET', '/plan/board').length;
  await save(page);
  await page.waitForTimeout(400);
  ok(scn, 'while the board re-read is in flight, nothing says «αποθηκεύτηκε»', !(await page.evaluate((d) => { const x = document.querySelector(`${d} [data-done]`); return x && !x.hidden; }, DLG)));
  await page.waitForFunction((d) => { const x = document.querySelector(`${d} [data-done]`); return x && !x.hidden; }, DLG, { timeout: 8000 }).catch(() => {});
  const gets = K.planOf(S, 'GET', '/plan/board');
  const post = K.planOf(S, 'POST', '/plan/orders')[0];
  ok(scn, '422 request_reused → GET /plan/board after the POST', gets.length > n0 && post && gets[gets.length - 1].at > post.at, gets.map((x) => x.at));
  const done = await K.text(page, `${DLG} [data-done]`);
  ok(scn, '«Αποθηκεύτηκε» names the order found on the board (#3901)', /Αποθηκεύτηκε/.test(done) && done.includes('#3901'), done);
  ok(scn, 'no second POST', K.planOf(S, 'POST', '/plan/orders').length === 1);
  await closeClean(page, S, ok, scn);
}

async function scnReplayed({ browser, origin, ok, scn }) {
  const plan = { 'POST /plan/orders': () => [200, { ok: true, op: 'plan_orders_create', dry_run: false, replayed: true,
    ids: { nat_order_ids: [3902], shipment_ids: [5902], piece_ids: [4902], rt_id: null, stop_ids: [], leg_ids: [] },
    warnings: [{ code: 'mixed_temp', rt_id: 101, side: 'KATHODOS', delta_c: 2 }], notice_ids: [] }] };
  const { page, S } = await K.openApp(browser, origin, { plan });
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, {});
  await fillOrder(page, 0, ORDER_A);
  await save(page);
  await page.waitForFunction((d) => { const x = document.querySelector(`${d} [data-done]`); return x && !x.hidden; }, DLG, { timeout: 8000 }).catch(() => {});
  const done = await K.text(page, `${DLG} [data-done]`);
  ok(scn, '200 replayed:true → «Αποθηκεύτηκε» with the first ids', done.includes('#3902') && /πρώτο πάτημα/.test(done), done);
  ok(scn, 'mixed_temp from the answer → a warning line after the save (Ε-3)', await K.count(page, `${DLG} .wn5-strip[data-kind="warning"]`) >= 1);
  // fidelity T20: the attribute alone passed while .wi4-btn's inline-flex kept a dead button drawn — the screen decides
  ok(scn, 'the save button is gone (nothing to resend): hidden and not drawn', await page.evaluate((d) => { const x = document.querySelector(`${d} [data-act="save"]`);
    return x.hidden && getComputedStyle(x).display === 'none' && x.getBoundingClientRect().width === 0; }, DLG));
  ok(scn, 'one POST, then a board re-read', K.planOf(S, 'POST', '/plan/orders').length === 1);
  await closeClean(page, S, ok, scn);
}

async function scnEdit({ browser, origin, ok, scn }) {
  const plan = { 'PATCH /plan/orders/3101': () => [200, { ok: true, op: 'plan_order_update', dry_run: false, ids: { nat_order_id: 3101, shipment_ids: [] }, warnings: [], notice_ids: [] }] };
  const { page, S } = await K.openApp(browser, origin, { plan });
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, { natOrderId: 3101 });
  ok(scn, 'edit opens on the waiting order with its price', (await page.evaluate((d) => document.querySelector(`${d} [data-f="price"]`).value, DLG)) === '310');
  await page.fill(`${DLG} [data-f="price"]`, '330');
  await save(page);
  await page.waitForTimeout(1000);
  const p = K.planOf(S, 'PATCH', '/plan/orders/3101');
  ok(scn, 'one PATCH /plan/orders/3101 with only {set:{price:330}}', p.length === 1 && JSON.stringify(p[0].body) === JSON.stringify({ set: { price: 330 } }), p.map((x) => x.body));
  ok(scn, 'an edit carries no request_id (only the 3 creations do)', p[0] && !('request_id' in p[0].body));
  await closeClean(page, S, ok, scn);
}

// T21 — the leg form. A second national order on the KATHODOS of RT-T101, so «two blocks changed» can be tried.
function legWeek() {
  const b = K.week();
  const ND = { nat_order_id: 3004, reference: 'N-T004', client_id: 43, client: 'ΠΕΛΑΤΗΣ Γ', temperature_c: 4 };
  b.cycles[0].stops[0].legs.push(K.leg(5004, 4005, 'load', 4, ND));
  b.cycles[0].stops[2].legs.push(K.leg(5004, 4005, 'unload', 4, ND));
  return b;
}
const LEG = '.wi4-dlg[role="dialog"][data-wn5="leg"]';
async function openLegBy(page, rt, side) {
  // the owner's rule (Figma 2011:7737 #3): a click on the leg opens the form — try the real click first
  const sel = `#content .wn5-row[data-rt="${rt}"] [data-leg="${side}"]`;
  const clicked = await page.click(sel, { timeout: 3000 }).then(() => true, () => false);
  await page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
  return clicked;
}
async function scnLeg({ browser, origin, ok, scn }) {
  let patchN = 0;
  const plan = { 'PATCH /plan/orders/3001': () => (++patchN === 1
    ? [200, { ok: true, op: 'plan_order_update', dry_run: false, ids: { nat_order_id: 3001, shipment_ids: [] }, warnings: [{ code: 'mixed_temp', rt_id: 101, side: 'KATHODOS', delta_c: 2 }], notice_ids: [] }]
    : K.planErr(422, 'PLAN_RULE', 'vs_locked')) };
  const { page, S } = await K.openApp(browser, origin, { board: legWeek(), plan });
  if (!(await guard(page, ok, scn))) return;
  ok(scn, 'a click on the KATHODOS leg of RT-T101 opens the leg form', await openLegBy(page, 101, 'KATHODOS') && await K.count(page, LEG) === 1);
  const t = await K.text(page, `${LEG} .wi4-dlg-hd`);
  ok(scn, 'title «Σκέλος · ΚΑΘΟΔΟΣ TST-2104 · Δευ 12/10 · 3 αποστολές»', t.includes('Σκέλος · ΚΑΘΟΔΟΣ TST-2104 · Δευ 12/10') && t.includes('· 3 αποστολές'), t);
  ok(scn, 'capacity badge «21 + 6 + 4 = 31/33»', t.includes('21 + 6 + 4 = 31/33'), t);
  // fidelity (Figma 2011:9305): the clicked side stays marked on the board while its form is open, never after
  ok(scn, 'the clicked side is marked on the board (one .wn5-legsel)', await K.count(page, '#content .wn5-row[data-rt="101"] .wn5-legsel') === 1);
  const vs = await K.text(page, `${LEG} [data-vs="2101"]`);
  ok(scn, 'the VS block is locked: «τιμή και τιμολόγηση στη διεθνή παραγγελία», no price field', vs.includes('τιμή και τιμολόγηση στη διεθνή παραγγελία') && await K.count(page, `${LEG} [data-vs="2101"] [data-f="price"]`) === 0, vs.slice(0, 200));
  ok(scn, '«Μεταφορά σε…» on each VS delivery row', await K.count(page, `${LEG} [data-vs="2101"] [data-act="move"]`) === 1);
  ok(scn, '«Άνοιγμα καρτέλας ›» instead of a delete', await K.count(page, `${LEG} [data-act="card"]`) === 2 && !/Διαγραφή/.test(await K.text(page, `${LEG} .wn5f-body`)));
  ok(scn, '«ΣΕΙΡΑ ΣΤΑΣΕΩΝ ΚΑΤΑ ΩΡΑ» lists the 3 stops of the side', await K.count(page, `${LEG} .wn5f-seq li`) === 3);
  // fidelity (Figma 2011:9574): each stop on one line, h 22, also the Veroia load that carries 3 references
  const seqH = await page.evaluate((d) => [...document.querySelectorAll(`${d} .wn5f-seq li`)].map((li) => Math.round(li.getBoundingClientRect().height)), LEG);
  ok(scn, 'every stop of the order of stops is on one line (h 22)', seqH.length === 3 && seqH.every((h) => h <= 23), seqH);
  ok(scn, 'no mixed-temperature line before a save (no threshold on screen)', !/Μεικτές/.test(await K.text(page, LEG)));
  const disabled = () => page.evaluate((d) => document.querySelector(`${d} [data-act="save"]`).disabled, LEG);
  ok(scn, 'nothing changed → «Αποθήκευση» disabled', await disabled());
  await page.fill(`${LEG} [data-nat="3001"] [data-f="price"]`, '310');
  await page.fill(`${LEG} [data-nat="3004"] [data-f="price"]`, '200');
  ok(scn, 'two orders changed → disabled, with the line that says why', await disabled() && /μία «Αποθήκευση» στέλνει μία/.test(await K.text(page, `${LEG} [data-err]`)));
  await page.fill(`${LEG} [data-nat="3004"] [data-f="price"]`, '');
  ok(scn, 'one order changed → enabled', !(await disabled()));
  await page.click(`${LEG} [data-act="save"]`);
  await page.waitForTimeout(1500);
  const p = K.planOf(S, 'PATCH', /^\/plan\/orders\/\d+$/);
  ok(scn, 'one save = ONE PATCH /plan/orders/3001 {set:{price:310}}', p.length === 1 && p[0].path === '/plan/orders/3001' && JSON.stringify(p[0].body) === JSON.stringify({ set: { price: 310 } }), p.map((x) => [x.path, x.body]));
  ok(scn, 'mixed_temp from the answer → warning line after the save', await K.count(page, `${LEG} .wn5-strip[data-kind="warning"]`) >= 1);
  ok(scn, 'the VS never sends PATCH /plan/orders', !S.plan.some((x) => x.m === 'PATCH' && x.path === '/plan/orders/2101'));
  // a refusal keeps the form open with the Worker's text
  await page.click(`${LEG} .wn5f-ft [data-act="cancel"]`);
  ok(scn, 'closing the form removes the mark', await K.count(page, '#content .wn5-legsel') === 0);
  await openLegBy(page, 101, 'KATHODOS');
  await page.fill(`${LEG} [data-nat="3001"] [data-f="price"]`, '315');
  await page.click(`${LEG} [data-act="save"]`);
  await page.waitForTimeout(1000);
  ok(scn, '422 vs_locked → the Worker message, form open', /rig sentinel vs_locked/.test(await K.text(page, `${LEG} [data-strip]`)) && await K.count(page, LEG) === 1);
  await page.click(`${LEG} [data-vs="2101"] [data-act="move"]`);
  await page.waitForSelector('.wi4-dlg[data-wn5="move"]', { timeout: 6000 }).catch(() => {});
  ok(scn, '«Μεταφορά σε…» closes the leg form and opens the move window', await K.count(page, LEG) === 0 && await K.count(page, '.wi4-dlg[data-wn5="move"]') === 1);
  await closeClean(page, S, ok, scn);
}
async function scnLegAnodos({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin);
  if (!(await guard(page, ok, scn))) return;
  // the side's «+» is its own control (T13): a click on it never opens the leg form too
  await page.click('#content .wn5-row[data-rt="102"] .wn5-plus[data-side="ANODOS"]', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
  ok(scn, 'a click on the side\'s «+» does not open the leg form', await K.count(page, LEG) === 0 && await K.count(page, '[data-wn5-overlay], .wi4-dlg, .wn5-pop') >= 1);
  await page.keyboard.press('Escape');
  await openLegBy(page, 102, 'ANODOS');
  ok(scn, 'the ANODOS leg form of RT-T102 opened', await K.count(page, LEG) === 1);
  const h = await K.text(page, `${LEG} .wn5f-head`);
  ok(scn, 'header «Κάθοδος» «Χωρίς κάθοδο»', h.includes('Κάθοδος') && h.includes('Χωρίς κάθοδο'), h);
  ok(scn, 'header «Άφιξη Βέροιας» «Τετ 14/10 · 22:00»', h.includes('Άφιξη Βέροιας') && h.includes('Τετ 14/10 · 22:00'), h);
  const b = await K.text(page, `${LEG} [data-nat="3003"]`);
  ok(scn, '«ΠΡΟΟΡΙΣΜΟΣ» with «Άφιξη ως *»', b.includes('ΠΡΟΟΡΙΣΜΟΣ') && b.includes('Άφιξη ως *'), b.slice(0, 300));
  const seq = await K.text(page, `${LEG} .wn5f-seq`);
  ok(scn, 'the order of stops ends «ως Τετ 22:00 · Βέροια · τέλος κύκλου»', seq.includes('ως Τετ 22:00') && seq.includes('Βέροια · τέλος κύκλου'), seq);
  await page.click(`${LEG} [data-act="time"]`);
  await page.waitForSelector('[data-wn5="date"]', { timeout: 6000 }).catch(() => {});
  ok(scn, '«Αλλαγή ώρας ›» opens the day panel (Δ4), not a save of this form', await K.count(page, '[data-wn5="date"]') === 1 && !S.plan.some((x) => x.m === 'PATCH' && /^\/plan\/orders\//.test(x.path)));
  await closeClean(page, S, ok, scn);
}

// T22 — VS day and destination from the leg form: one POST per change, never inside the form's save.
function vsWeek(withStop) {
  const b = K.week();
  if (withStop) for (const s of b.cycles[0].stops) for (const l of s.legs) if (l.order_id === 2101) l.order_stop_id = 6101;   // as if the Worker chain added the key (Ε-2)
  return b;
}
async function scnVs({ browser, origin, ok, scn }) {
  let dayN = 0;
  const plan = {
    'POST /plan/vs/day': () => (++dayN === 1
      ? [200, { ok: true, op: 'plan_vs_set_day', dry_run: false, ids: { order_id: 2101 }, warnings: [{ code: 'vs_day_differs', first_hub_day: '2026-10-12' }], notice_ids: [9101] }]
      : K.planErr(422, 'PLAN_RULE', 'vs_not_bridge')),
    'POST /plan/vs/place': () => [200, { ok: true, op: 'plan_vs_set_place', dry_run: false, ids: { order_stop_id: 6101, leg_ids: [], stop_ids: [] }, warnings: [], notice_ids: [9102] }],
  };
  const { page, S } = await K.openApp(browser, origin, { board: vsWeek(true), plan });
  if (!(await guard(page, ok, scn))) return;
  await page.evaluate(() => WN5Form.openLeg(101, 'KATHODOS'));
  await page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
  const V = `${LEG} [data-vs="2101"]`;
  ok(scn, 'the VS block has «Ημέρα» with the Veroia day (Δευ 12/10)', (await page.evaluate((v) => (document.querySelector(`${v} [data-f="vsday"]`) || {}).value, V)) === '2026-10-12');
  const writes0 = S.plan.filter((x) => x.m !== 'GET').length;
  await page.fill(`${V} [data-f="vsday"]`, '2026-10-14');
  await page.click(`${V} [data-act="vs-day"]`);
  await page.waitForTimeout(1200);
  const days = K.planOf(S, 'POST', '/plan/vs/day');
  ok(scn, 'one change = ONE POST /plan/vs/day {order_id:2101, day:"2026-10-14"}', days.length === 1 && JSON.stringify(days[0].body) === JSON.stringify({ order_id: 2101, day: '2026-10-14' }), days.map((x) => x.body));
  ok(scn, 'after 200 with notice_ids: «γράφτηκε και στη διεθνή, ο διεθνών ειδοποιήθηκε»', /γράφτηκε και στη διεθνή, ο διεθνών ειδοποιήθηκε/.test(await K.text(page, `${V} [data-vsok]`)));
  ok(scn, 'vs_day_differs → a warning line', await K.count(page, `${LEG} .wn5-strip[data-kind="warning"]`) >= 1);
  await page.click(`${V} [data-act="vs-day"]`);
  await page.waitForTimeout(1000);
  ok(scn, '422 vs_not_bridge → the Worker message, form open', /rig sentinel vs_not_bridge/.test(await K.text(page, `${LEG} [data-strip]`)) && await K.count(page, LEG) === 1);
  const pid = await page.evaluate((v) => { const b = document.querySelector(`${v} [data-act="vs-place"]`); return b && b.dataset.pid; }, V);
  const offered = await page.evaluate((id) => { WN5Form._locDropNoHub(id, ''); const d = document.getElementById('ls_' + id + '_d'); return d ? d.textContent : ''; }, pid);
  ok(scn, 'the destination picker never offers Veroia', offered.includes('LARISA TEST') && !offered.includes('ΒΕΡΟΙΑ TEST'), offered.slice(0, 200));
  await page.evaluate((id) => fhPickLinked(id, 'recWn5LocLar', 'LARISA TEST'), pid);
  await page.click(`${V} [data-act="vs-place"]`);
  await page.waitForTimeout(1200);
  const places = K.planOf(S, 'POST', '/plan/vs/place');
  ok(scn, 'one change = ONE POST /plan/vs/place {order_stop_id:6101, location_id:4}', places.length === 1 && JSON.stringify(places[0].body) === JSON.stringify({ order_stop_id: 6101, location_id: 4 }), places.map((x) => x.body));
  await page.evaluate((id) => fhPickLinked(id, 'recJucKOhC1zh4IP3', 'ΒΕΡΟΙΑ TEST'), pid);
  await page.click(`${V} [data-act="vs-place"]`);
  await page.waitForTimeout(600);
  ok(scn, 'Veroia pasted as destination → refused on screen, nothing sent', K.planOf(S, 'POST', '/plan/vs/place').length === 1 && /Η Βέροια δεν είναι προορισμός VS/.test(await K.text(page, `${LEG} [data-err]`)));
  ok(scn, 'no PATCH /plan/orders during the VS changes (not the form\'s save)', !S.plan.some((x) => x.m === 'PATCH'));
  ok(scn, 'exactly the 3 VS writes reached /plan', S.plan.filter((x) => x.m !== 'GET').length - writes0 === 3, S.plan.filter((x) => x.m !== 'GET').map((x) => x.m + ' ' + x.path));
  await closeClean(page, S, ok, scn);
  // 072 board: no order_stop_id on legs → the destination button is off and says why
  const p2 = await K.openApp(browser, origin, { board: vsWeek(false) });
  await p2.page.evaluate(() => WN5Form.openLeg(101, 'KATHODOS'));
  await p2.page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
  ok(scn, 'without order_stop_id «Αλλαγή προορισμού» is disabled, with the reason', await p2.page.evaluate((v) => { const b = document.querySelector(`${v} [data-act="vs-place"]`); return !!b && b.disabled; }, V)
    && /όταν το board φέρνει τη στάση της διεθνούς/.test(await K.text(p2.page, V)));
  await closeClean(p2.page, p2.S, ok, scn);
}

K.run({
  scenarios: { order: scnOrder, groupage: scnGroupage, unknown: scnUnknown, reused: scnReused, replayed: scnReplayed, edit: scnEdit, leg: scnLeg, 'leg-anodos': scnLegAnodos, vs: scnVs },
  globals: ['WN5Form'],
  go: 'the v5 order forms send one body per press, from the form only, with one request_id per open form',
}).catch((e) => { console.error(e); process.exit(1); });
