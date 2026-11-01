// Rig — National v5 F4α forms (T20 order form; T21 leg form; T22 VS day/destination). Judged by what reached the
// fake /plan/* (S.plan: method, path, body, count, order) and by what the page shows; never by a toast. Synthetic
// week of tests/critics/wn5-rig-kit.js. The default answer of every non-dry write is 409 writes_closed, as deployed
// until day L; scenarios script their own answers with sentinel messages.
// Usage: node tests/critics/wn5-form-rig.js [order nowin nopp groupage unknown reused replayed edit edit-ride edit-follow edit-add edit-remove edit-read-fail edit-twoday veroia-edit day-type leg leg-anodos stop-time miss leg-add … pr3b]
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
const appConsole = (S) => S.console.filter((m) => !/^Failed to load resource/.test(m) && !/^\[TMS ERROR\] planFetch [A-Z]+ \/plan\/\S*: PlanError: rig sentinel /.test(m));
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
  // F4 (owner 28/10, 080): the price is optional — no «*», the field says what empty means
  ok(scn, 'label «Τιμή € (χωρίς ΦΠΑ)» without «*»', txt.includes('Τιμή € (χωρίς ΦΠΑ)') && !txt.includes('Τιμή € (χωρίς ΦΠΑ) *'), txt.slice(0, 200));
  // F1 (owner 28/10): the window is optional — the head says what an empty one is, no «*»
  ok(scn, 'windows «Παράθυρο από – έως · κενό: όλη η ημέρα»', txt.includes('Παράθυρο από – έως · κενό: όλη η ημέρα') && !txt.includes('Παράθυρο από – έως *'));
  ok(scn, 'truck optional: «Φορτηγό (προαιρετικό)» with «— ΠΡΟΣ ΑΝΑΘΕΣΗ»', txt.includes('Φορτηγό (προαιρετικό)') && txt.includes('ΠΡΟΣ ΑΝΑΘΕΣΗ'));
  // fidelity T20 (Figma 2011:9641/9704): an empty day reads as a whole hint, never Chrome's cut «dd/mm/yy»
  // live fix 28/10: the day is typed text (.wn5f-dayx); empty, its placeholder is the hint
  const dayE = await page.evaluate((d) => [...document.querySelectorAll(`${d} .wn5f-day`)].map((w) => { const x = w.querySelector('.wn5f-dayx'); return x && !x.value ? x.placeholder : x && x.value; }), DLG);
  ok(scn, 'empty day fields: «ηη/μμ/εεεε» in the head, «ηη/μμ» in each row', dayE.length >= 3 && dayE[0] === 'ηη/μμ/εεεε' && dayE.slice(1).every((x) => x === 'ηη/μμ'), dayE);
  await page.keyboard.press('ArrowRight');   // role=dialog: the week must not move under the open form
  ok(scn, '← → do not change the week while the form is open', await K.count(page, DLG) === 1 && (await page.evaluate(() => WN5.snapshot().week)) === '2026-10-10');
  await fillOrder(page, 0, ORDER_A);
  // the weekday the frame shows in a row («Τετ 14/10», no year); the native text hidden while not edited
  const dayF = await page.evaluate((d) => [...document.querySelectorAll(`${d} .wn5f-row .wn5f-day`)].map((w) => ({ t: (w.querySelector('.wn5f-dayx') || {}).value,
    nat: getComputedStyle(w.querySelector('.wn5f-dayp')).opacity })), DLG);
  ok(scn, 'filled day fields show the weekday: «Τετ 14/10» / «Πέμ 15/10», the native date input not drawn', dayF.length === 2
    && dayF[0].t === 'Τετ 14/10' && dayF[1].t === 'Πέμ 15/10' && dayF.every((x) => x.nat === '0'), dayF);
  await save(page);
  await page.waitForTimeout(3500);   // > the 1 s + 2 s of _atRetry: a resend would show here
  const posts = K.planOf(S, 'POST', '/plan/orders');
  ok(scn, 'one press → exactly one POST /plan/orders', posts.length === 1, posts.length);
  const b = (posts[0] && posts[0].body) || {};
  const rid = b.request_id;
  const rest = Object.assign({}, b); delete rest.request_id;
  ok(scn, 'request_id is a uuid v4', K.UUID4.test(rid || ''), rid);
  // 075 (stream a2, 028e9e57): the order's «Κατεύθυνση» reaches the base — `direction` sits after pallet_exchange
  ok(scn, 'body = form state, exact keys, numbers as numbers, Athens offset', JSON.stringify(rest) === JSON.stringify({ orders: [{ client_id: 41, price: 310, pallet_exchange: false, direction: 'KATHODOS', temperature_c: 4,
    shipments: [{ origin_location_id: 3, dest_location_id: 2, pallets: 6, load_from: '2026-10-14T11:00:00+03:00', load_to: '2026-10-14T12:00:00+03:00',
      deliver_from: '2026-10-15T08:00:00+03:00', deliver_to: '2026-10-15T10:00:00+03:00' }] }] }), rest);
  ok(scn, 'no truck → no target, no stops (ΠΡΟΣ ΑΝΑΘΕΣΗ)', !('target' in b) && !('stops' in b));
  ok(scn, 'only Authorization + Content-Type sent', posts[0] && !Object.keys(posts[0].headers).some((h) => /^x-tms/i.test(h)), posts[0] && posts[0].headers);
  ok(scn, '409 writes_closed → the strip shows the Worker message as is', /rig sentinel writes_closed/.test(await K.text(page, `${DLG} [data-strip]`)), await K.text(page, `${DLG} [data-strip]`));
  ok(scn, 'after 409 the save is disabled (Ε-6)', await page.evaluate((d) => document.querySelector(`${d} [data-act="save"]`).disabled, DLG));
  ok(scn, 'the request_id lives in memory only', rid ? await noStore(page, rid) : false);
  await page.context().close();

  // the «+» of a row: same form, target = the row's side, stops = existing stop by id + one new place (a 200, for F50)
  const p2 = await K.openApp(browser, origin, { plan: { 'POST /plan/orders': () => [200, { ok: true, op: 'plan_orders_create', dry_run: false, ids: { nat_order_ids: [3999] }, warnings: [], notice_ids: [] }] } });
  await p2.page.evaluate(() => WN5Act.plus(101, 'KATHODOS', document.querySelector('#content .wn5-row[data-rt="101"]') || document.querySelector('#content .wn5')));
  await p2.page.click('.wi4-dlg[data-wn5="plus"] >> text=Νέα παραγγελία').catch(() => {});
  await p2.page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
  ok(scn, '«+» → «Νέα παραγγελία» opens the same form, the «+» window is gone', await K.count(p2.page, DLG) === 1 && await K.count(p2.page, '.wi4-dlg[data-wn5="plus"]') === 0);
  const tg = await p2.page.evaluate((d) => { const s = document.querySelector(`${d} #wn5f-tgt`); return s ? { v: s.value, dis: s.disabled } : null; }, DLG);
  ok(scn, 'the cycle and side come prefilled and locked', tg && tg.v === '101' && tg.dis, tg);
  // fidelity T20 (Figma 2011:9641): the prefilled Veroia day in the head reads «Δευ 12/10/2026» (weekday + year)
  const hd = await p2.page.evaluate((d) => { const w = document.querySelector(`${d} .wn5f-head .wn5f-day`); return w && { v: w.querySelector('.wn5f-dayp').value, t: w.querySelector('.wn5f-dayx').value }; }, DLG);
  ok(scn, 'the head day shows the weekday and the year of its value', !!hd && /^\d{4}-\d\d-\d\d$/.test(hd.v)
    && hd.t === WI4dl(hd.v) + '/' + hd.v.slice(0, 4) && /^(Κυρ|Δευ|Τρί|Τετ|Πέμ|Παρ|Σάβ) /.test(hd.t), hd);
  await fillOrder(p2.page, 0, { client: C42, price: 120, temp: 2, pe: true, loads: [r(HUB, '2026-10-12', '16:00', '18:00', 4)], drops: [r(LAR, '2026-10-13', '10:00', '12:00', 4)] });
  await save(p2.page);
  await p2.page.waitForTimeout(1500);
  const b2 = (K.planOf(p2.S, 'POST', '/plan/orders')[0] || {}).body || {};
  ok(scn, '«+» body: target {rt_id:101, side:KATHODOS}', JSON.stringify(b2.target) === JSON.stringify({ rt_id: 101, side: 'KATHODOS' }), b2.target);
  ok(scn, '«+» body: Veroia by its stop_id, Larisa as one new stop', JSON.stringify(b2.stops) === JSON.stringify([{ ref: 's1', stop_id: 1001 },
    { ref: 's2', location_id: 4, side: 'KATHODOS', planned_from: '2026-10-13T10:00:00+03:00', planned_to: '2026-10-13T12:00:00+03:00' }]), b2.stops);
  // F50 (owner 31/10): after the save and the re-read the cycle that took the order is the row in hand
  const f50 = await p2.page.evaluate(() => { const rs = [...document.querySelectorAll('#content .wn5 .wn5-row.wn5-focus')]; return { keys: rs.map((e) => e.dataset.key), flash: !!(rs[0] && rs[0].classList.contains('wn5-flash'))}; });
  ok(scn, 'F50 · «+» → new order saved: the cycle\'s row (rt:101) is marked and flashes — main: nothing', JSON.stringify(f50.keys) === '["rt:101"]' && f50.flash, f50);
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

  // ✈ «Νέα παραγγελία σε αυτό το δρομολόγιο ›» → «Κάθοδος» (S-45, Figma 2011:8858): the same short form as the «+»
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

// F1 (owner 28/10, real-user test of National v5): a point without a window is saved as its whole day, 00:00–23:59
// (the schema keeps a window on every national point; the base invents no hour), and the form says «όλη η ημέρα».
// One end alone is refused by name, nothing sent. On plain main the empty window is refused: NO-GO.
async function scnNoWin({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin);
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, {});
  // one end only: refused on screen, nothing sent
  await fillOrder(page, 0, { client: C41, price: 310, temp: 4, pe: false, loads: [r(ASP, '2026-10-14', '08:00', '', 6)], drops: [r(ATH, '2026-10-15', '', '', 6)] });
  await save(page);
  await page.waitForTimeout(600);
  const err = await K.text(page, `${DLG} [data-err]`);
  ok(scn, 'one end only → «φόρτωση 1: παράθυρο: ΗΗ:ΛΛ και στα δύο άκρα, ή κανένα (όλη η ημέρα)», nothing sent',
    err.includes('φόρτωση 1: παράθυρο: ΗΗ:ΛΛ και στα δύο άκρα, ή κανένα (όλη η ημέρα)') && !K.planOf(S, 'POST', '/plan/orders').length, err);
  // both ends empty on both points: whole day, said in the summary before the save
  await page.evaluate((d) => { const x = document.querySelector(`${d} .wn5f-rows[data-k="load"] [data-f="from"]`); x.value = ''; x.dispatchEvent(new Event('input', { bubbles: true })); }, DLG);
  const sum = await K.text(page, `${DLG} [data-sum]`);
  ok(scn, 'the summary names both points «όλη η ημέρα», never 00:00–23:59', sum.includes('Τετ όλη η ημέρα') && sum.includes('Πέμ όλη η ημέρα') && !sum.includes('00:00–23:59'), sum.slice(0, 400));
  // half of the head's Veroia window is named at the head, nothing sent (code review 28/10)
  const headFrom = (v) => page.evaluate(([d, x]) => { const i = document.querySelector(`${d} #wn5f-vfrom`); i.value = x; i.dispatchEvent(new Event('input', { bubbles: true })); }, [DLG, v]);
  await headFrom('06:00');
  await save(page);
  await page.waitForTimeout(500);
  const eh = await K.text(page, `${DLG} [data-err]`);
  ok(scn, 'head «από» alone → «Παράθυρο φόρτωσης Βέροιας: ΗΗ:ΛΛ και στα δύο άκρα, ή κανένα», nothing sent', eh.includes('Παράθυρο φόρτωσης Βέροιας: ΗΗ:ΛΛ και στα δύο άκρα, ή κανένα') && !K.planOf(S, 'POST', '/plan/orders').length, eh);
  await headFrom('');
  await save(page);
  await page.waitForTimeout(1500);
  const posts = K.planOf(S, 'POST', '/plan/orders');
  const sh = posts.length === 1 && posts[0].body.orders && posts[0].body.orders[0].shipments;
  ok(scn, 'one press → one POST; the shipment carries 00:00–23:59 of each point\'s day, Athens offset', !!sh && JSON.stringify(sh) === JSON.stringify([{ origin_location_id: 3, dest_location_id: 2, pallets: 6,
    load_from: '2026-10-14T00:00:00+03:00', load_to: '2026-10-14T23:59:00+03:00', deliver_from: '2026-10-15T00:00:00+03:00', deliver_to: '2026-10-15T23:59:00+03:00' }]), sh || posts.length);
  await page.context().close();
  // ΑΝΟΔΟΣ to Veroia («Άφιξη ως»): empty = the whole day (changed on purpose 1/11, owner: ONE Veroia default «όλη η
  // ημέρα» — empty was a 23:59 = 23:59 deadline, read back as «23:59–23:59» in «Ανάθεση»)
  const p2 = await K.openApp(browser, origin);
  await p2.page.evaluate(() => WN5Form.openOrder({ side: 'ANODOS' }));
  await p2.page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
  await fillOrder(p2.page, 0, { client: C42, price: 120, temp: 2, pe: false, loads: [r(LAR, '2026-10-14', '', '', 4)], drops: [r(HUB, '2026-10-14', '', '', 4)] });
  const head = await K.text(p2.page, DLG);
  ok(scn, 'ΑΝΟΔΟΣ: «Άφιξη ως · κενό: όλη η ημέρα» heads the Veroia arrival, «Άφιξη Βέροιας ως» has no «*»', head.includes('Άφιξη ως · κενό: όλη η ημέρα') && head.includes('Άφιξη Βέροιας ως') && !head.includes('Άφιξη Βέροιας ως *'), head.slice(0, 400));
  await save(p2.page);
  await p2.page.waitForTimeout(1500);
  const b2 = (K.planOf(p2.S, 'POST', '/plan/orders')[0] || {}).body || {};
  const s2 = b2.orders && b2.orders[0].shipments[0];
  ok(scn, 'ΑΝΟΔΟΣ body: loading 00:00–23:59, the arrival at Veroia the whole day 00:00–23:59 (1/11)', !!s2 && s2.load_from === '2026-10-14T00:00:00+03:00' && s2.load_to === '2026-10-14T23:59:00+03:00'
    && s2.deliver_from === '2026-10-14T00:00:00+03:00' && s2.deliver_to === '2026-10-14T23:59:00+03:00', s2);
  ok(scn, 'no page errors, no console errors', ![S, p2.S].some((x) => x.pageErrors.length || appConsole(x).length), [S, p2.S].flatMap((x) => x.pageErrors.concat(appConsole(x))));
  await p2.page.context().close();
}

// F1/F4 (owner 28/10, SQL 080): price and pallets empty = not known yet. The form says it («τιμή λείπει», «;π»,
// «σύνολο ;/33») and sends price null / pallets null — never 0. NO-GO on main and on PR A (both refused there).
async function scnNoPP({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin);
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, {});
  const head = await K.text(page, DLG);
  ok(scn, 'labels «Τιμή € (χωρίς ΦΠΑ)» and «Παλέτες · κενό: ;», no «*» on either', head.includes('Τιμή € (χωρίς ΦΠΑ)') && !head.includes('Τιμή € (χωρίς ΦΠΑ) *')
    && head.includes('Παλέτες · κενό: ;') && !head.includes('Παλέτες *'), head.slice(0, 400));
  await fillOrder(page, 0, { client: C41, price: '', temp: 4, pe: false, loads: [r(ASP, '2026-10-14', '08:00', '10:00', '')], drops: [r(ATH, '2026-10-15', '', '', '')] });
  const sum = await K.text(page, `${DLG} [data-sum]`);
  const osum = await K.text(page, `${DLG} [data-osum]`);
  ok(scn, 'the summary says «;/33 παλέτες», the order line «;π · τιμή λείπει»', sum.includes(';/33 παλέτες') && osum.includes(';π') && osum.includes('τιμή λείπει'), { sum: sum.slice(0, 200), osum });
  await save(page);
  await page.waitForTimeout(1500);
  const posts = K.planOf(S, 'POST', '/plan/orders');
  const o = posts.length === 1 && posts[0].body.orders && posts[0].body.orders[0];
  ok(scn, 'one POST: price null and the shipment\'s pallets null — never 0', !!o && o.price === null && o.shipments.length === 1 && o.shipments[0].pallets === null, o || posts.length);
  ok(scn, 'no page errors, no console errors', !S.pageErrors.length && !appConsole(S).length, S.pageErrors.concat(appConsole(S)));
  await page.context().close();
  // code review xhigh r1/r2: the edit form (077 read) of an order WITHOUT a price whose point riding RT-T101 has unknown
  // pallets, and a second point waiting with unknown pallets: both written here (B-100, the card and the Veroia panel
  // send the desk here); one PATCH with both.
  const rd = K.orders()[3001];
  rd.order.price = null; rd.order.pallets = null;
  rd.shipments[0].pallets = null;
  rd.shipments.push(Object.assign(K.clone(K.orders()[3101].shipments[0]), { shipment_id: 5304, pallets: null }));
  // code review xhigh r4: a two-day point of unknown pallets (locked, pallets open, ×) and a point at Veroia (its loading
  // locked, ×) — ↺ gives each field back the lock it was drawn with
  rd.shipments.push(Object.assign(K.clone(K.orders()[3101].shipments[0]), { shipment_id: 5305, pallets: null, deliver_to: '2026-10-16T07:00:00+00:00' }));
  rd.shipments.push(Object.assign(K.clone(K.orders()[3101].shipments[0]), { shipment_id: 5306, pallets: 3, at_hub: true, waits: true }));
  const plan = { 'GET /plan/orders/3001': () => [200, rd],
    'PATCH /plan/orders/3001': () => [200, { ok: true, op: 'plan_order_update', dry_run: false, ids: { nat_order_id: 3001, shipment_ids: [] }, warnings: [], notice_ids: [] }] };
  const p2 = await K.openApp(browser, origin, { plan });
  await openForm(p2.page, { natOrderId: 3001 });
  const ed = await p2.page.evaluate((d) => {
    const row = (id) => { const r = document.querySelector(`${d} [data-ship="${id}"]`); if (!r) return null;
      const pal = r.querySelector('[data-f="pal"]'), lf = r.querySelector('[data-f="lfrom"]');
      return { ro: r.hasAttribute('data-ro'), palOnly: r.hasAttribute('data-palonly'), palOn: !!pal && !pal.disabled, ph: pal && pal.placeholder, winOff: !!lf && lf.disabled }; };
    const pr = document.querySelector(`${d} [data-f="price"]`);
    return { ride: row(5202), wait: row(5304), pricePh: pr && pr.placeholder, priceLabel: pr && pr.closest('label').textContent,
      note: document.querySelector(d).innerText.includes('δεν έχει ακόμη τιμή') }; }, DLG);
  ok(scn, 'edit of an order without price: the price says «λείπει» (no «*»), with the note to write it when known',
    !!ed && ed.pricePh === 'λείπει' && ed.note && !/\*/.test(ed.priceLabel || ''), ed);
  // F30 (#170): a riding point is edited in place, so its unknown pallets are written in its own row
  ok(scn, 'the point riding RT-T101 with unknown pallets: edited in place (F30), pallets open, «άγνωστες»',
    !!ed && !!ed.ride && !ed.ride.ro && ed.ride.palOn && ed.ride.ph === 'άγνωστες', ed && ed.ride);
  ok(scn, 'the waiting point with unknown pallets: editable, pallets «άγνωστες»', !!ed && !!ed.wait && !ed.wait.ro && ed.wait.palOn && !ed.wait.winOff && ed.wait.ph === 'άγνωστες', ed && ed.wait);
  await p2.page.fill(`${DLG} [data-ship="5202"] [data-f="pal"]`, '10')   // throws (and names it) if the field is locked;
  await p2.page.fill(`${DLG} [data-ship="5304"] [data-f="pal"]`, '4')   // throws (and names it) if the field is locked;
  const lk = (id) => p2.page.evaluate(([d, i]) => { const r = document.querySelector(`${d} [data-ship="${i}"]`);
    const g = (k) => { const x = r.querySelector(`[data-f="${k}"]`); return x ? !x.disabled : null; };
    return { pal: g('pal'), lfrom: g('lfrom'), dfrom: g('dfrom'), rm: r.hasAttribute('data-rm') }; }, [DLG, id]);
  const x = (id) => p2.page.click(`${DLG} [data-ship="${id}"] [data-act="del-ship"]`);
  const two0 = await lk(5305);
  await p2.page.fill(`${DLG} [data-ship="5305"] [data-f="pal"]`, '3')   // throws (and names it) if the field is locked;
  await x(5305); const two1 = await lk(5305); await x(5305); const two2 = await lk(5305);
  await x(5306); await x(5306); const hub2 = await lk(5306);
  ok(scn, 'two-day point of unknown pallets: pallets open, windows locked; × closes them all; ↺ gives back exactly that',
    two0.pal === true && two0.lfrom === false && two0.dfrom === false && two1.pal === false && two1.rm && two2.pal === true && two2.lfrom === false && two2.dfrom === false && !two2.rm, { two0, two1, two2 });
  ok(scn, 'a point at Veroia: after × and ↺ its loading stays locked, its delivery and pallets open', hub2.lfrom === false && hub2.dfrom === true && hub2.pal === true, hub2);
  await x(5305);   // marked: it sends its removal, never the pallets typed before
  await save(p2.page);
  await p2.page.waitForTimeout(1200);
  const pt = K.planOf(p2.S, 'PATCH', '/plan/orders/3001');
  const sent = pt[0] ? Object.assign({}, pt[0].body) : null;
  if (sent) delete sent.request_id;
  ok(scn, 'one PATCH /plan/orders/3001 {shipments:[{5202, pallets:10}, {5304, pallets:4}, {5305, remove}]} — pallets only, no window, no price',
    pt.length === 1 && JSON.stringify(sent) === JSON.stringify({ shipments: [{ shipment_id: 5202, pallets: 10 }, { shipment_id: 5304, pallets: 4 }, { shipment_id: 5305, remove: true }] }), pt.map((x) => x.body));
  ok(scn, 'edit: no page errors', !p2.S.pageErrors.length, p2.S.pageErrors);
  await p2.page.context().close();
  // code review xhigh r3: N×1 with the one delivery left empty and both loads known (allowed) — the delivery stop of the
  // summary carries the shipments' 10, never «;π»
  const p4 = await K.openApp(browser, origin, {});
  await openForm(p4.page, {});
  await fillOrder(p4.page, 0, { client: C41, price: '', temp: 4, pe: false, loads: [r(ASP, '2026-10-14', '08:00', '10:00', 4), r(THE, '2026-10-14', '11:00', '12:00', 6)],
    drops: [r(ATH, '2026-10-15', '08:00', '10:00', '')] });
  const seqTxt = await p4.page.evaluate((d) => [...document.querySelectorAll(`${d} .wn5f-seq li`)].map((li) => li.textContent), DLG);
  ok(scn, 'N×1, delivery empty, loads 4 + 6: the delivery stop says «10π», the loads «4π» / «6π», no «;π»',
    seqTxt.some((x) => /παράδοση/.test(x) && /10π$/.test(x)) && seqTxt.some((x) => /4π$/.test(x)) && seqTxt.some((x) => /6π$/.test(x)) && !seqTxt.some((x) => x.includes(';π')), seqTxt);
  await p4.page.context().close();
  // a WRITTEN price is never emptied (072 no_price): said at the field, nothing sent
  const p3 = await K.openApp(browser, origin, {});
  await openForm(p3.page, { natOrderId: 3101 });
  await p3.page.fill(`${DLG} [data-f="price"]`, '');
  await save(p3.page);
  await p3.page.waitForTimeout(600);
  ok(scn, 'an emptied written price: «η παραγγελία έχει ήδη τιμή», no PATCH', K.planOf(p3.S, 'PATCH', '/plan/orders/3101').length === 0
    && /η παραγγελία έχει ήδη τιμή/.test(await K.text(p3.page, `${DLG} [data-err]`)));
  await p3.page.context().close();
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

// F13 / F21 (077, live test 28/10): the edit form opens on GET /plan/orders/:id (the kit answers K.orders()), shows
// every value, sends only what changed — nothing when nothing changed — and adds / removes a point. Judged by the
// bodies that reached the fake /plan/*.
const UPD_OK = (id, extra) => () => [200, { ok: true, op: 'plan_order_update', dry_run: false,
  ids: Object.assign({ nat_order_id: id, shipment_ids: [], new_shipment_ids: [], new_piece_ids: [], removed_shipment_ids: [] }, extra || {}), warnings: [], notice_ids: [] }];
const fval = (page, sel) => page.evaluate(([d, s]) => { const x = document.querySelector(`${d} ${s}`); return x ? x.value : null; }, [DLG, sel]);
const UUIDRE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function scnEdit({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { plan: { 'PATCH /plan/orders/3101': UPD_OK(3101) } });
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, { natOrderId: 3101 });
  ok(scn, 'the form read the order once: GET /plan/orders/3101', K.planOf(S, 'GET', '/plan/orders/3101').length === 1, S.plan.map((x) => x.m + ' ' + x.path));
  const v = { price: await fval(page, '[data-f="price"]'), ref: await fval(page, '[data-f="ref"]'), goods: await fval(page, '[data-f="goods"]'),
    notes: await fval(page, '[data-f="notes"]'), temp: await fval(page, '[data-f="temp"]'),
    pe: await page.evaluate((d) => document.querySelector(`${d} [data-peh]`).dataset.peh, DLG) };
  ok(scn, 'every value of the read is shown (price, reference, goods, notes, temperature, PE yes)', JSON.stringify(v) === JSON.stringify({ price: '310', ref: 'N-T101', goods: 'Γιαούρτι', notes: 'ράμπα 2', temp: '4', pe: 'yes' }), v);
  // whole-frame r2 (Figma 2069:7984 / 8007 / 7992): the ΑΠΟΣΤΟΛΕΣ day fields 100 wide with their weekday label whole
  // inside (clear of the picker glyph at the right end), pallets 70.
  const ship = await page.evaluate((d) => {
    const r = document.querySelector(`${d} .wn5f-ship`);
    if (!r) return null;
    const w = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null);
    // live fix 28/10: the day is typed text with the calendar button at its right end; the label must fit (no scroll)
    const day = (k) => { const i = r.querySelector(`[data-f="${k}"]`), w = i && i.closest('.wn5f-day'), t = w && w.querySelector('.wn5f-dayx');
      if (!t) return null;
      return { w: Math.round(w.getBoundingClientRect().width), t: t.value, room: t.scrollWidth <= t.clientWidth ? 24 : 0, cal: !!w.querySelector('.wn5f-dayc') }; };
    return { l: day('lday'), d: day('dday'), pal: w(r.querySelector('[data-f="pal"]')) };
  }, DLG);
  ok(scn, 'ΑΠΟΣΤΟΛΕΣ: day fields 100 with the label whole («Τετ 14/10», no scroll) and a calendar button, pallets 70 (2069:7984 / 7992)',
    !!ship && [ship.l, ship.d].every((x) => x && x.w === 100 && /^\S+ \d{1,2}\/\d{1,2}$/.test(x.t) && x.room >= 24 && x.cal) && ship.pal === 70, ship);
  ok(scn, 'one point only: no × (the last point is never removed here)', await K.count(page, `${DLG} [data-ship] [data-act="del-ship"]`) === 0);
  // open + save with no change = 0 requests (the DB-level proof: plan-077.test.mjs U1, 0 rows written)
  await save(page);
  await page.waitForTimeout(400);
  ok(scn, 'open + «Αποθήκευση» with no change → 0 PATCH, the line «Τίποτα δεν άλλαξε»', K.planOf(S, 'PATCH', '/plan/orders/3101').length === 0
    && /Τίποτα δεν άλλαξε/.test(await K.text(page, `${DLG} [data-err]`)));
  await page.fill(`${DLG} [data-f="price"]`, '330');
  await save(page);
  await page.waitForTimeout(1000);
  const p = K.planOf(S, 'PATCH', '/plan/orders/3101');
  const sent = p[0] ? Object.assign({}, p[0].body) : null;
  if (sent) delete sent.request_id;
  ok(scn, 'one PATCH /plan/orders/3101 with only {set:{price:330}} besides its request_id', p.length === 1 && JSON.stringify(sent) === JSON.stringify({ set: { price: 330 } }), p.map((x) => x.body));
  ok(scn, 'the edit carries the open form\'s request_id (decision 44, 077)', !!p[0] && UUIDRE.test(String(p[0].body.request_id)), p[0] && p[0].body);
  ok(scn, 'the request_id is in memory only', !!p[0] && await noStore(page, p[0].body.request_id));
  await closeClean(page, S, ok, scn);
}
// F30 (owner 28/10): an order ON a cycle — its riding point keeps its leg and cycle, and its pallets, day and window
// change here, in place (072 plan_order_update takes them). Before F30 the point was shown read-only and the only way
// was «Πίσω στην αναμονή» → edit → assign again (a new cycle, new RT ids). The truck's stops are named under the point,
// with «Αλλαγή ώρας στάσης ›» (F29): the stop does not follow by itself and the form says so.
async function scnEditRide({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { plan: { 'PATCH /plan/orders/3001': UPD_OK(3001) } });
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, { natOrderId: 3001 });
  ok(scn, 'an order ON a cycle opens with its price and notes (not on the board: F13)', await fval(page, '[data-f="price"]') === '420' && await fval(page, '[data-f="notes"]') === 'κλήση πριν');
  const row = await page.evaluate((d) => { const r = document.querySelector(`${d} [data-ship="5202"]`);
    return r && { ro: r.hasAttribute('data-ro'), live: ['lday', 'lfrom', 'lto', 'dday', 'dfrom', 'dto', 'pal'].map((k) => !r.querySelector(`[data-f="${k}"]`).disabled),
      txt: r.textContent, x: !!r.querySelector('[data-act="del-ship"]') }; }, DLG);
  ok(scn, 'the riding point: every day, window and pallets field live, «σε κύκλο RT-T101», no × (it leaves only by «Μεταφορά σε…»)',
    !!row && !row.ro && row.live.every(Boolean) && /σε κύκλο RT-T101/.test(row.txt) && !row.x, row);
  const stop = await page.evaluate((d) => { const x = document.querySelector(`${d} [data-shipstop="5202"]`);
    return x && { t: x.textContent.replace(/\s+/g, ' '), b: [...x.querySelectorAll('[data-act="stop-time"]')].map((b) => b.dataset.stop + ':' + b.dataset.side) }; }, DLG);
  ok(scn, 'under it the truck\'s stops: «RT-T101 · φόρτωση Δευ 12/10 16:00–18:00» and «RT-T101 · παράδοση Τρί 13/10 07:00–09:00», each with «Αλλαγή ώρας στάσης ›»',
    !!stop && stop.t.includes('RT-T101 · φόρτωση Δευ 12/10 16:00–18:00') && stop.t.includes('RT-T101 · παράδοση Τρί 13/10 07:00–09:00')
    && JSON.stringify(stop.b) === JSON.stringify(['1001:KATHODOS', '1003:KATHODOS']), stop);
  // 081: the note claims neither «follows» nor «does not» (the base decides, and before 081 runs it never follows)
  ok(scn, 'the form says before the save that the line after it tells whether the truck\'s stop changed', /Μετά την αποθήκευση γράφεται αν άλλαξε και η στάση του φορτηγού/.test(await K.text(page, `${DLG} [data-ridenote]`)));
  ok(scn, 'Κατεύθυνση disabled on a cycle (the cycle\'s side holds)', await page.evaluate((d) => document.querySelector(`${d} [data-f="dir"]`).disabled, DLG));
  // the owner's waiting fixes (#17, #84 …): 1 pallet → 30, and a delivery one day later, in ONE save; notes emptied on purpose
  await page.fill(`${DLG} [data-ship="5202"] [data-f="pal"]`, '30');
  await typeDay(page, `${DLG} [data-ship="5202"] .wn5f-day:has([data-f="dday"])`, '14/10');
  await page.fill(`${DLG} [data-f="notes"]`, '');
  // changes not saved + «Αλλαγή ώρας στάσης ›» = they would be lost: refused with the reason, the form stays
  await page.click(`${DLG} [data-shipstop="5202"] [data-act="stop-time"][data-stop="1003"]`);
  ok(scn, 'unsaved changes + «Αλλαγή ώρας στάσης ›» → the line says save first, no panel, the form stays', await K.count(page, DLG) === 1
    && await K.count(page, '.wi4-dlg[data-wn5="date"]') === 0 && /Αποθήκευσε πρώτα/.test(await K.text(page, `${DLG} [data-err]`)));
  await save(page);
  await page.waitForTimeout(1000);
  const p = K.planOf(S, 'PATCH', '/plan/orders/3001');
  const b = p[0] ? Object.assign({}, p[0].body) : {};
  delete b.request_id;
  const sh = b.shipments && b.shipments[0];
  ok(scn, 'one PATCH /plan/orders/3001: {set:{notes:null}} + the riding point 5202 with pallets 30 and its delivery on 14/10 07:00–09:00, nothing else',
    p.length === 1 && JSON.stringify(b.set) === JSON.stringify({ notes: null }) && b.shipments.length === 1 && !!sh && sh.shipment_id === 5202 && sh.pallets === 30
    && Object.keys(sh).sort().join() === 'deliver_from,deliver_to,pallets,shipment_id'
    && Date.parse(sh.deliver_from) === Date.parse('2026-10-14T07:00:00+03:00') && Date.parse(sh.deliver_to) === Date.parse('2026-10-14T09:00:00+03:00'), p.map((x) => x.body));
  const done = await K.text(page, `${DLG} [data-done]`);
  ok(scn, 'saved, before 081 (no stops_moved in the answer): the line says the truck\'s stop did not change and where to change it', /Αποθηκεύτηκε/.test(done) && /η ώρα της στάσης του φορτηγού δεν άλλαξε/.test(done), done);
  await page.click(`${DLG} [data-shipstop="5202"] [data-act="stop-time"][data-stop="1003"]`);
  await page.waitForSelector('.wi4-dlg[data-wn5="date"]', { timeout: 6000 }).catch(() => {});
  ok(scn, 'after the save «Αλλαγή ώρας στάσης ›» closes the form and opens the day panel of THAT stop (1003)', await K.count(page, DLG) === 0
    && await page.evaluate(() => { const x = document.querySelector('.wi4-dlg[data-wn5="date"]'); return x ? x.dataset.stop : null; }) === '1003');
  await closeClean(page, S, ok, scn);
}
// 081 (owner 31/10): the base moves the point's own truck stop in the same save (ids.stops_moved) and names a stop it
// kept (warnings stop_kept: shared with another point). The form says both: the moved one in the line, the kept one in
// the warning strip; never «the stop did not change» for a stop that moved.
async function scnEditFollow({ browser, origin, ok, scn }) {
  const ans = () => [200, { ok: true, op: 'plan_order_update', dry_run: false,
    ids: { nat_order_id: 3001, shipment_ids: [5202], new_shipment_ids: [], new_piece_ids: [], removed_shipment_ids: [],
      stops_moved: [{ stop_id: 1003, rt_id: 101, rt_code: 'RT-T101', shipment_ids: [5202],
        after: { planned_from: '2026-10-14T07:00:00+03:00', planned_to: '2026-10-14T09:00:00+03:00' } }] },
    warnings: [{ code: 'stop_kept', reason: 'shared', stop_id: 1001, rt_id: 101, rt_code: 'RT-T101', shipment_ids: [5202],
      others: [{ shipment_id: 5301, nat_order_id: 3002, order_id: null }] }], notice_ids: [] }];
  const { page, S } = await K.openApp(browser, origin, { plan: { 'PATCH /plan/orders/3001': ans } });
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, { natOrderId: 3001 });
  await typeDay(page, `${DLG} [data-ship="5202"] .wn5f-day:has([data-f="dday"])`, '14/10');
  await save(page);
  await page.waitForTimeout(1000);
  ok(scn, 'one PATCH /plan/orders/3001', K.planOf(S, 'PATCH', '/plan/orders/3001').length === 1);
  const done = await K.text(page, `${DLG} [data-done]`);
  ok(scn, 'saved: «η στάση του φορτηγού ακολούθησε (RT-T101)», and never «δεν άλλαξε» in the line', /Αποθηκεύτηκε/.test(done)
    && /η στάση του φορτηγού ακολούθησε \(RT-T101\)/.test(done) && !/δεν άλλαξε/.test(done), done);
  const row = await page.evaluate((d) => { const x = document.querySelector(`${d} [data-shipstop="5202"]`); return x ? x.textContent.replace(/\s+/g, ' ') : ''; }, DLG);
  ok(scn, 'the stop row under the point shows the moved stop where it is now: «RT-T101 · παράδοση Τετ 14/10 07:00–09:00»; the loading row as it was',
    row.includes('RT-T101 · παράδοση Τετ 14/10 07:00–09:00') && row.includes('RT-T101 · φόρτωση Δευ 12/10 16:00–18:00') && !row.includes('Τρί 13/10'), row);
  const strip = await K.text(page, `${DLG} .wn5-strip[data-kind="warning"]`);
  ok(scn, 'the kept shared stop in the warning strip: RT-T101, 1 other point, «Αλλαγή ώρας στάσης ›» changes it for all',
    /η στάση του φορτηγού στο RT-T101 δεν άλλαξε: εξυπηρετεί και 1 άλλο σημείο · «Αλλαγή ώρας στάσης ›» την αλλάζει για όλα/.test(strip), strip);
  await closeClean(page, S, ok, scn);
}

async function scnEditAdd({ browser, origin, ok, scn }) {
  const plan = { 'PATCH /plan/orders/3001': UPD_OK(3001, { new_shipment_ids: [5301], new_piece_ids: [4301] }) };
  const { page, S } = await K.openApp(browser, origin, { plan });
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, { natOrderId: 3001 });
  await page.click(`${DLG} [data-act="add-ship"][data-k="drop"]`);
  const nw = await page.evaluate((d) => { const r = document.querySelector(`${d} [data-newship]`);
    const g = (k) => r.querySelector(`[data-f="${k}"]`).value;
    return r && { o: document.getElementById('lv_' + r.dataset.po).value, ol: document.getElementById('ls_' + r.dataset.po).value,
      d: document.getElementById('lv_' + r.dataset.pd).value, win: [g('lday'), g('lfrom'), g('lto'), g('dday'), g('dfrom'), g('dto')] }; }, DLG);
  ok(scn, '«+ σημείο παράδοσης»: the order\'s loading place pre-picked, the delivery empty, the order\'s days, windows empty = the whole day (F1)',
    !!nw && nw.o === 'recJucKOhC1zh4IP3' && nw.ol === 'ΒΕΡΟΙΑ TEST' && nw.d === '' && JSON.stringify(nw.win) === JSON.stringify(['2026-10-12', '', '', '2026-10-13', '', '']), nw);
  await save(page);
  await page.waitForTimeout(400);
  ok(scn, 'no delivery place picked → refused on screen, nothing sent', K.planOf(S, 'PATCH', '/plan/orders/3001').length === 0
    && /διάλεξε τοποθεσία παράδοσης/.test(await K.text(page, `${DLG} [data-err]`)));
  await page.evaluate((d) => { const r = document.querySelector(`${d} [data-newship]`); fhPickLinked(r.dataset.pd, 'recWn5LocAth', 'ATHENS TEST');
    const p = r.querySelector('[data-f="pal"]'); p.value = '1'; p.dispatchEvent(new Event('input', { bubbles: true })); }, DLG);
  await save(page);
  await page.waitForTimeout(1000);
  const p = K.planOf(S, 'PATCH', '/plan/orders/3001');
  const b = p[0] && p[0].body;
  ok(scn, 'one PATCH: exactly ONE new shipment (no shipment_id), the riding point absent, no set', p.length === 1 && !b.set && Array.isArray(b.shipments)
    && b.shipments.length === 1 && !('shipment_id' in b.shipments[0]), p.map((x) => x.body));
  ok(scn, 'the new point: 1 → 2, 1 pallet, 00:00–23:59 Athens on 12/10 and 13/10', !!b && JSON.stringify(b.shipments[0]) === JSON.stringify({ origin_location_id: 1, dest_location_id: 2, pallets: 1,
    load_from: '2026-10-12T00:00:00+03:00', load_to: '2026-10-12T23:59:00+03:00', deliver_from: '2026-10-13T00:00:00+03:00', deliver_to: '2026-10-13T23:59:00+03:00' }), b && b.shipments);
  ok(scn, 'the add carries the open form\'s request_id (a creation: decision 44)', !!b && UUIDRE.test(String(b.request_id)));
  const done = await K.text(page, `${DLG} [data-done]`);
  ok(scn, 'saved: the line says the new point waits ΠΡΟΣ ΑΝΑΘΕΣΗ (owner 28/10: one board move puts it on a truck)', /Αποθηκεύτηκε/.test(done) && /ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(done), done);
  await closeClean(page, S, ok, scn);
}
async function scnEditRemove({ browser, origin, ok, scn }) {
  const orders = K.orders();
  orders[3101].shipments.push(Object.assign({}, orders[3101].shipments[0], { shipment_id: 5203, dest_location_id: 4, pallets: 2 }));
  const { page, S } = await K.openApp(browser, origin, { orders, plan: { 'PATCH /plan/orders/3101': UPD_OK(3101, { removed_shipment_ids: [5203] }) } });
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, { natOrderId: 3101 });
  ok(scn, 'two waiting points: each has its ×', await K.count(page, `${DLG} [data-ship] [data-act="del-ship"]`) === 2);
  // ↺ undoes the mark before «Αποθήκευση»: the point is back, its fields live again
  await page.click(`${DLG} [data-ship="5203"] [data-act="del-ship"]`);
  await page.click(`${DLG} [data-ship="5203"] [data-act="del-ship"]`);
  ok(scn, '× then ↺: the point is back with live fields', await page.evaluate((d) => { const r = document.querySelector(`${d} [data-ship="5203"]`);
    return !!r && !r.hasAttribute('data-rm') && [...r.querySelectorAll('input')].every((x) => !x.disabled); }, DLG));
  await page.click(`${DLG} [data-ship="5203"] [data-act="del-ship"]`);
  ok(scn, 'the × marks the point (struck, fields disabled), never drops it from the screen', await page.evaluate((d) => { const r = document.querySelector(`${d} [data-ship="5203"]`);
    return !!r && r.hasAttribute('data-rm') && [...r.querySelectorAll('input')].every((x) => x.disabled); }, DLG));
  await save(page);
  await page.waitForTimeout(1000);
  const p = K.planOf(S, 'PATCH', '/plan/orders/3101');
  const b = p[0] && p[0].body;
  ok(scn, 'one PATCH: {shipments:[{shipment_id:5203, remove:true}]} + request_id, the other point absent', p.length === 1 && JSON.stringify(b.shipments) === JSON.stringify([{ shipment_id: 5203, remove: true }])
    && !b.set && UUIDRE.test(String(b.request_id)), p.map((x) => x.body));
  // saved: the form adds no row it could no longer send
  await page.click(`${DLG} [data-act="add-ship"][data-k="drop"]`);
  ok(scn, 'after the save «+ σημείο παράδοσης» adds nothing', await K.count(page, `${DLG} [data-newship]`) === 0);
  await closeClean(page, S, ok, scn);
}
// a stored window over midnight cannot sit in one day field per side: shown, never sent (it would come back shortened)
async function scnEditTwoDay({ browser, origin, ok, scn }) {
  const orders = K.orders();
  Object.assign(orders[3101].shipments[0], { deliver_from: '2026-10-15T19:00:00+00:00', deliver_to: '2026-10-15T23:00:00+00:00' });   // 22:00 → 02:00 Athens
  orders[3101].shipments.push(Object.assign({}, K.orders()[3101].shipments[0], { shipment_id: 5204, dest_location_id: 4, pallets: 2 }));
  const { page, S } = await K.openApp(browser, origin, { orders, plan: { 'PATCH /plan/orders/3101': UPD_OK(3101) } });
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, { natOrderId: 3101 });
  const row = await page.evaluate((d) => { const r = document.querySelector(`${d} [data-ship="5201"]`);
    return r && { ro: r.hasAttribute('data-ro'), dis: [...r.querySelectorAll('input')].every((x) => x.disabled), txt: r.textContent }; }, DLG);
  ok(scn, 'a delivery window 22:00 → 02:00: the point is shown read-only with the reason', !!row && row.ro && row.dis && /παράθυρο σε δύο ημέρες/.test(row.txt), row);
  // still removable (077 allows it): × marks it, its fields stay disabled, ↺ keeps them disabled
  await page.click(`${DLG} [data-ship="5201"] [data-act="del-ship"]`);
  await page.click(`${DLG} [data-ship="5201"] [data-act="del-ship"]`);
  ok(scn, '× then ↺ on the read-only point: its fields stay disabled', await page.evaluate((d) => [...document.querySelectorAll(`${d} [data-ship="5201"] input`)].every((x) => x.disabled), DLG));
  await page.click(`${DLG} [data-ship="5201"] [data-act="del-ship"]`);
  await page.fill(`${DLG} [data-f="notes"]`, 'αλλαγή');
  await save(page);
  await page.waitForTimeout(1000);
  const p = K.planOf(S, 'PATCH', '/plan/orders/3101');
  const sent = p[0] ? Object.assign({}, p[0].body) : null;
  if (sent) delete sent.request_id;
  ok(scn, 'notes + the removal of the two-day point: never its window, the other point absent', p.length === 1
    && JSON.stringify(sent) === JSON.stringify({ set: { notes: 'αλλαγή' }, shipments: [{ shipment_id: 5201, remove: true }] }), p.map((x) => x.body));
  await closeClean(page, S, ok, scn);
}
async function scnEditReadFail({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { plan: { 'GET /plan/orders/3101': () => K.planErr(503, 'SCHEMA_BEHIND', 'schema_behind') } });
  if (!(await guard(page, ok, scn))) return;
  await page.evaluate(() => { window.__toasts = []; const t = window.toast; window.toast = function (m, ty) { window.__toasts.push([String(m), ty]); return t && t.apply(this, arguments); }; });
  const opened = await page.evaluate(() => WN5Form.openOrder({ natOrderId: 3101 }));
  await page.waitForTimeout(400);
  const ts = await page.evaluate(() => window.__toasts);
  ok(scn, 'a read that fails opens NO form (never values it could not read) and says why', opened === false && await K.count(page, DLG) === 0
    && ts.some(([m, ty]) => /#3101 δεν διαβάστηκε — η φόρμα δεν άνοιξε: rig sentinel schema_behind/.test(m) && ty === 'danger'), ts);
  ok(scn, 'nothing written', K.planOf(S, 'PATCH', /\/plan\/orders\//).length === 0);
  await closeClean(page, S, ok, scn);
}

// Live F23 (28/10): an order sent back to Veroia (hub[], for_split, no live legs) — ✈ on the Veroia panel → its card →
// «Επεξεργασία». The form read waiting[] only and said «άλλη εβδομάδα»: the dates could not be fixed. hub[] carries no
// origin, price, PE or side (072 / 074a), so the route names Veroia and nothing the board did not send is sent.
async function scnVeroiaEdit({ browser, origin, ok, scn }) {
  const b = K.week();
  b.hub.push({ piece_id: 4155, shipment_id: 5255, kind: 'national', order_id: null, nat_order_id: 3150, order_stop_id: null, pallets: 4, leave_by: null,
    nat_ready_day: '2026-10-12', nat_due_day: '2026-10-12', overdue: false, is_stock: false, inbound_rt_id: null, client_id: 43, client: 'ΠΕΛΑΤΗΣ Γ', reference: null,
    temperature_c: null, nat_to_location_id: 2, for_split: true,
    load_from: '2026-10-15T07:00:00+03:00', load_to: '2026-10-15T09:00:00+03:00', deliver_from: '2026-10-16T14:00:00+03:00', deliver_to: '2026-10-16T16:00:00+03:00' });
  // a second part of the same shipment, also left at Veroia by «Σπάσε…» (code review: one row per shipment, not per piece)
  b.hub.push(Object.assign({}, b.hub[b.hub.length - 1], { piece_id: 4156, pallets: 3 }));
  // the live catalogue names its hub (074a plan_lookups is_hub)
  const lookups = JSON.parse(JSON.stringify(K.LOOKUPS));
  for (const l of lookups.locations) l.is_hub = l.id === 1;
  const plan = { 'PATCH /plan/orders/3150': () => [200, { ok: true, op: 'plan_order_update', dry_run: false, ids: { nat_order_id: 3150, shipment_ids: [5255] }, warnings: [], notice_ids: [] }] };
  const { page, S } = await K.openApp(browser, origin, { board: b, lookups, plan });
  if (!(await guard(page, ok, scn))) return;
  await page.click('#wn5-hub [data-hub="open"]', { timeout: 3000 }).catch(() => {});
  await page.click('#content .wn5 .wn5-hub-it[data-piece="4155"] .wi4-plane[data-act="ocard"]', { timeout: 3000 }).catch(() => {});
  await page.click('.wi4-dlg.wn5-ocard [data-act="edit"]', { timeout: 3000 }).catch(() => {});
  await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
  const form = await page.evaluate((d) => {
    const x = document.querySelector(d); if (!x) return null;
    const r = x.querySelector('[data-ship="5255"]');
    return { t: x.querySelector('.wi4-dlg-t').textContent, route: r ? r.querySelector('span').textContent : null,
      days: r ? ['lday', 'dday'].map((k) => { const i = r.querySelector(`[data-f="${k}"]`); return i ? [i.value, i.disabled] : null; }) : null,
      pdis: r ? r.querySelector('[data-f="pal"]').disabled : null,
      price: x.querySelector('[data-f="price"]').value,
      rows: x.querySelectorAll('[data-ship="5255"]').length, pal: r ? r.querySelector('[data-f="pal"]').value : null,
      dir: (x.querySelector('[data-f="dir"] option[value=""]') || {}).textContent };
  }, DLG);
  // at Veroia the loading already happened: its day is shown, locked; the delivery and the pallets stay editable (F23)
  ok(scn, 'Veroia panel ✈ → card → «Επεξεργασία» opens #3150: load day 15/10 locked (loaded), delivery 16/10 and pallets editable', !!form && /#3150/.test(form.t)
    && JSON.stringify(form.days) === JSON.stringify([['2026-10-15', true], ['2026-10-16', false]]) && form.pdis === false, form);
  ok(scn, 'the route names Veroia, where the piece stands, then its destination — never «#undefined»', !!form && form.route === 'ΒΕΡΟΙΑ TEST → ATHENS TEST · στη Βέροια', form && form.route);
  ok(scn, 'the edit read the order (077, F13): GET /plan/orders/3150', K.planOf(S, 'GET', '/plan/orders/3150').length === 1);
  ok(scn, 'one row for shipment 5255, the shipment\'s own pallets (4 + 3 = 7), never a row per piece', !!form && form.rows === 1 && form.pal === '7', form);
  // F13: the read carries what hub[] does not - the side as stored (none here) and the price
  ok(scn, 'the side as the order stores it (none: «δεν έχει δηλωθεί»), the price from the read (250)', !!form && form.dir === '— δεν έχει δηλωθεί' && form.price === '250', form);
  await page.fill(`${DLG} [data-ship="5255"] [data-f="dday"]`, '2026-10-17').catch(() => {});
  await save(page).catch(() => {});
  await page.waitForTimeout(1000);
  const p = K.planOf(S, 'PATCH', '/plan/orders/3150');
  const want = { deliver_from: '2026-10-17T14:00:00+03:00', deliver_to: '2026-10-17T16:00:00+03:00' };
  const sh = p[0] && p[0].body && p[0].body.shipments && p[0].body.shipments[0];
  ok(scn, 'one PATCH /plan/orders/3150: shipment 5255 with its two new delivery ends only — no load, pallets, price, PE or side', p.length === 1 && !p[0].body.set && Object.keys(p[0].body).sort().join() === 'request_id,shipments'
    && p[0].body.shipments.length === 1 && sh.shipment_id === 5255 && Object.keys(sh).length === 3 && Object.keys(want).every((k) => Date.parse(sh[k]) === Date.parse(want[k])), p.map((x) => x.body));
  // the side: an order waiting at Veroia has nothing planned onward, so it can still be corrected (F23)
  ok(scn, 'Κατεύθυνση stays editable for an order waiting at Veroia', await page.evaluate((d) => !document.querySelector(`${d} [data-f="dir"]`).disabled, DLG));
  await closeClean(page, S, ok, scn);
}

// Live 28/10: «typing in the date fields of the edit form does not change the value, only the picker works». The user
// clicks the day where it shows («Πέμ 15/10») and types: the day must be what was typed, the field must say it, the save
// must send it. Driven through the wrapper (.wn5f-day) and the real keyboard, so the same presses run on main (NO-GO).
async function typeDay(page, sel, keys) {
  const w = await page.$(sel);
  if (!w) return false;
  const b = await w.boundingBox();
  await page.mouse.click(b.x + b.width * 0.4, b.y + b.height / 2);
  await page.keyboard.type(keys);
  await page.keyboard.press('Tab');
  return true;
}
async function scnDayType({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { plan: { 'PATCH /plan/orders/3101': UPD_OK(3101) } });
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, { natOrderId: 3101 });
  const W = `${DLG} [data-ship="5201"] .wn5f-day:has([data-f="dday"])`;
  const shown = () => page.evaluate((s) => { const w = document.querySelector(s); if (!w) return null;
    const x = w.querySelector('.wn5f-dayx'); return { v: w.querySelector('[data-f="dday"]').value, t: x ? x.value : w.textContent, red: !!x && x.classList.contains('bad') }; }, W);
  await typeDay(page, W, '17/10');
  const a = await shown();
  ok(scn, 'a click on the shown day + «17/10» typed → the day is 2026-10-17 and the field reads «Σάβ 17/10»', !!a && a.v === '2026-10-17' && a.t === 'Σάβ 17/10', a);
  for (const [keys, want] of [['18/10/2026', '2026-10-18'], ['1910', '2026-10-19'], ['20.10.26', '2026-10-20']]) {
    await typeDay(page, W, keys);
    const g = await shown();
    ok(scn, `«${keys}» typed → ${want}`, !!g && g.v === want, g);
  }
  // a text that is no day: kept as typed, in red, the day empty — the save names it and sends nothing (principle 1)
  await typeDay(page, W, '32/10');
  const bad = await shown();
  ok(scn, '«32/10» stays as typed, in red, and the day is empty', !!bad && bad.t === '32/10' && bad.red && bad.v === '', bad);
  await save(page);
  await page.waitForTimeout(400);
  ok(scn, '… then «Αποθήκευση» names the day and sends nothing', K.planOf(S, 'PATCH', '/plan/orders/3101').length === 0
    && /ημέρα/.test(await K.text(page, `${DLG} [data-err]`)), await K.text(page, `${DLG} [data-err]`));
  await typeDay(page, W, '17/10');
  await save(page);
  await page.waitForTimeout(1000);
  const p = K.planOf(S, 'PATCH', '/plan/orders/3101');
  const sh = p[0] && p[0].body.shipments && p[0].body.shipments[0];
  ok(scn, 'one PATCH: the typed delivery day 17/10 with its hours kept, 08:00–10:00 Athens', p.length === 1 && !!sh && sh.shipment_id === 5201
    && Date.parse(sh.deliver_from) === Date.parse('2026-10-17T08:00:00+03:00') && Date.parse(sh.deliver_to) === Date.parse('2026-10-17T10:00:00+03:00'), p.map((x) => x.body));
  await page.context().close();

  // the create form's row day and its head day (with the year) take typing the same way
  const p2 = await K.openApp(browser, origin);
  await openForm(p2.page, {});
  await typeDay(p2.page, `${DLG} .wn5f-rows[data-k="drop"] .wn5f-row .wn5f-day`, '21/10');
  await typeDay(p2.page, `${DLG} .wn5f-head .wn5f-day`, '22/10/2026');
  const c = await p2.page.evaluate((d) => ({ row: document.querySelector(`${d} .wn5f-rows[data-k="drop"] [data-f="day"]`).value, head: document.querySelector(`${d} #wn5f-vday`).value,
    headT: (document.querySelector(`${d} .wn5f-head .wn5f-dayx`) || {}).value }), DLG);
  ok(scn, 'create form: row «21/10» → 2026-10-21, head «22/10/2026» → 2026-10-22 reading «Πέμ 22/10/2026»', c.row === '2026-10-21' && c.head === '2026-10-22' && c.headT === 'Πέμ 22/10/2026', c);
  // code review: a Veroia row's day typed wrong is never filled over by the head's Veroia day (it stays red)
  await p2.page.evaluate((d) => { const r = document.querySelector(`${d} .wn5f-rows[data-k="load"] .wn5f-row`); fhPickLinked(r.dataset.pid, 'recJucKOhC1zh4IP3', 'ΒΕΡΟΙΑ TEST'); }, DLG);
  await typeDay(p2.page, `${DLG} .wn5f-rows[data-k="load"] .wn5f-row .wn5f-day`, '31/11');
  const vr = await p2.page.evaluate((d) => { const w = document.querySelector(`${d} .wn5f-rows[data-k="load"] .wn5f-row .wn5f-day`);
    return { v: w.querySelector('[data-f="day"]').value, t: w.querySelector('.wn5f-dayx').value, red: w.querySelector('.wn5f-dayx').classList.contains('bad') }; }, DLG);
  ok(scn, 'a Veroia row: «31/11» stays red and empty — the head\'s day (22/10) does not fill over it', vr.v === '' && vr.t === '31/11' && vr.red, vr);
  ok(scn, 'every day field has its calendar button (the picker stays)', await p2.page.evaluate((d) => [...document.querySelectorAll(`${d} .wn5f-day`)].every((w) => !!w.querySelector('.wn5f-dayc[data-act="day-pick"]')), DLG));
  await closeClean(p2.page, p2.S, ok, scn);
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

// F29 (live 28/10): the stop times of a cycle outside Veroia could not be changed from any screen — the leg form showed
// them read-only, Δ4 moved only the Veroia stop or the whole side, while 072 plan_rt_update takes stops[]. Now every
// stop line of the leg form opens the day panel of THAT stop: its own dry run, its day and window as stops[] alone.
async function scnStopTime({ browser, origin, ok, scn }) {
  const PV = { ok: true, op: 'plan_rt_update', dry_run: true, needs_confirm: false, preview: {
    before: { start_at: '2026-10-12T16:00:00+03:00', end_at: '2026-10-13T22:00:00+03:00', date_start: '2026-10-12', date_end: '2026-10-13' },
    after: { start_at: '2026-10-12T16:00:00+03:00', end_at: '2026-10-13T22:00:00+03:00', date_start: '2026-10-12', date_end: '2026-10-13' },
    next_rt: null, conflict: null, vs_day: [], warnings: [] } };
  const plan = { 'PATCH /plan/rt/101': (e) => (e.body && e.body.dry_run === true ? [200, PV]
    : [200, { ok: true, op: 'plan_rt_update', dry_run: false, ids: { rt_id: 101, stop_ids: [1003] }, warnings: [], notice_ids: [] }]) };
  const { page, S } = await K.openApp(browser, origin, { board: legWeek(), plan });
  if (!(await guard(page, ok, scn))) return;
  await openLegBy(page, 101, 'KATHODOS');
  ok(scn, 'every stop line of «ΣΕΙΡΑ ΣΤΑΣΕΩΝ» has its «Αλλαγή ώρας ›» (3 stops)', await K.count(page, `${LEG} .wn5f-seq li [data-act="stop-time"]`) === 3);
  const seqH = await page.evaluate((d) => [...document.querySelectorAll(`${d} .wn5f-seq li`)].map((li) => Math.round(li.getBoundingClientRect().height)), LEG);
  ok(scn, 'each stop line stays one line (h ≤ 23) with its button', seqH.length === 3 && seqH.every((h) => h <= 23), seqH);
  await page.click(`${LEG} .wn5f-seq li[data-stop="1003"] [data-act="stop-time"]`).catch(() => {});
  const D = '.wi4-dlg[data-wn5="date"]';
  await page.waitForSelector(D, { timeout: 6000 }).catch(() => {});
  const head = await page.evaluate((d) => { const x = document.querySelector(d); return x && { t: x.querySelector('.wi4-dlg-t').textContent, stop: x.dataset.stop,
    from: (x.querySelector('[data-win="from"]') || {}).value, to: (x.querySelector('[data-win="to"]') || {}).value }; }, D);
  ok(scn, 'the leg form closes and the panel of stop 1003 opens: «Ώρα στάσης · ASPROPYRGOS TEST», its window 07:00–09:00', await K.count(page, LEG) === 0
    && !!head && head.t === 'Ώρα στάσης · ASPROPYRGOS TEST' && head.stop === '1003' && head.from === '07:00' && head.to === '09:00', head);
  ok(scn, 'nothing changed → no request', K.planOf(S, 'PATCH', '/plan/rt/101').length === 0);
  await page.fill(`${D} [data-win="from"]`, '10:00');
  await page.fill(`${D} [data-win="to"]`, '12:00');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  const strip = (x) => { const o = Object.assign({}, x.body); delete o.dry_run; return JSON.stringify(o); };
  const want1 = JSON.stringify({ stops: [{ stop_id: 1003, planned_from: '2026-10-13T10:00:00+03:00', planned_to: '2026-10-13T12:00:00+03:00' }] });
  let c = K.planOf(S, 'PATCH', '/plan/rt/101');
  ok(scn, 'a new window → a dry run PATCH /plan/rt/101 with stops[] of THAT stop only (no shift, no other stop)', c.length >= 1 && c[c.length - 1].body.dry_run === true && strip(c[c.length - 1]) === want1, c.map((x) => x.raw));
  const res = await K.text(page, `${D} .wn5-datep-r`);
  ok(scn, 'the result names that stop only: «Τρί 13/10 → Τρί 13/10 · 10:00–12:00» and «Αλλάζει μόνο αυτή η στάση»',
    res.includes('Τρί 13/10 → Τρί 13/10 · 10:00–12:00') && res.includes('Αλλάζει μόνο αυτή η στάση') && (res.match(/→/g) || []).length === 1, res.slice(0, 400));
  await page.click(`${D} [data-day="2026-10-14"]`);
  await page.waitForTimeout(500);
  c = K.planOf(S, 'PATCH', '/plan/rt/101');
  const want2 = JSON.stringify({ stops: [{ stop_id: 1003, planned_from: '2026-10-14T10:00:00+03:00', planned_to: '2026-10-14T12:00:00+03:00' }] });
  ok(scn, 'another day → the same stop on 14/10 10:00–12:00, still one stop, no shift', strip(c[c.length - 1]) === want2 && c[c.length - 1].body.dry_run === true, c.map((x) => x.raw));
  await page.click(`${D} [data-act="save"]`);
  await page.waitForTimeout(1000);
  const real = K.planOf(S, 'PATCH', '/plan/rt/101').filter((x) => !(x.body && x.body.dry_run === true));
  ok(scn, '«Αποθήκευση» → ONE PATCH /plan/rt/101 with the body of the last dry run', real.length === 1 && real[0].raw === want2, real.map((x) => x.raw));
  await closeClean(page, S, ok, scn);
}

// F26 (live 28/10): an order without a delivery place does not save, and the form did not say why clearly (the lines
// came after a press, under a long form). A red «Λείπει: τόπος παράδοσης» stands beside «Αποθήκευση» while it lacks.
async function scnMiss({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin);
  if (!(await guard(page, ok, scn))) return;
  await openForm(page, {});
  await fillOrder(page, 0, ORDER_A);
  // the destination typed as a name but not picked from the list (an unknown place): no place id
  await page.evaluate((d) => { const r = document.querySelector(`${d} .wn5f-rows[data-k="drop"] .wn5f-row`);
    document.getElementById('lv_' + r.dataset.pid).value = ''; const t = document.getElementById('ls_' + r.dataset.pid); t.value = 'ΑΓΝΩΣΤΟΣ ΠΡΟΟΡΙΣΜΟΣ';
    t.dispatchEvent(new Event('input', { bubbles: true })); }, DLG);
  const why = () => page.evaluate((d) => { const x = document.querySelector(`${d} .wn5f-ft .wn5-why`);
    return x ? { t: x.textContent, c: getComputedStyle(x).color, vis: x.getBoundingClientRect().width > 0 } : null; }, DLG);
  const w1 = await why();
  ok(scn, 'before any press: a red «Λείπει: τόπος παράδοσης» beside «Αποθήκευση»', !!w1 && w1.t === 'Λείπει: τόπος παράδοσης' && w1.vis && w1.c === 'rgb(185, 28, 28)', w1);
  await save(page);
  await page.waitForTimeout(400);
  ok(scn, 'a press sends nothing', K.planOf(S, 'POST', '/plan/orders').length === 0);
  await page.evaluate((d) => { const r = document.querySelector(`${d} .wn5f-rows[data-k="drop"] .wn5f-row`); fhPickLinked(r.dataset.pid, 'recWn5LocAth', 'ATHENS TEST'); }, DLG);
  await page.click(`${DLG} [data-f="price"]`);   // a blur refreshes (fhPickLinked fires no input)
  ok(scn, 'the place picked → the line goes', (await why()) === null);
  await page.context().close();
  // the edit form: a new point without its delivery place says the same
  const p2 = await K.openApp(browser, origin);
  await openForm(p2.page, { natOrderId: 3101 });
  await p2.page.click(`${DLG} [data-act="add-ship"][data-k="drop"]`);
  const w2 = await p2.page.evaluate((d) => { const x = document.querySelector(`${d} .wn5f-ft .wn5-why`); return x ? x.textContent : null; }, DLG);
  ok(scn, 'edit form, «+ σημείο παράδοσης» not filled → «Λείπει: τόπος παράδοσης»', w2 === 'Λείπει: τόπος παράδοσης', w2);
  await closeClean(p2.page, p2.S, ok, scn);
}

// A-7 (Figma audit 28/10): «+ σημείο φόρτωσης / παράδοσης» and «+ παραγγελία» inside the leg form (read-only by plan
// T21). A point goes through the order's edit form (077: it waits, owner 28/10) and the saved line leads back to this
// leg's «+», where «Πρόσθεσε» is one press; «+ παραγγελία» is the create form on this cycle and side.
async function scnLegAdd({ browser, origin, ok, scn }) {
  const plan = { 'PATCH /plan/orders/3001': UPD_OK(3001, { new_shipment_ids: [5301], new_piece_ids: [4301] }) };
  const { page, S } = await K.openApp(browser, origin, { board: legWeek(), plan });
  if (!(await guard(page, ok, scn))) return;
  await openLegBy(page, 101, 'KATHODOS');
  ok(scn, 'each national block has «+ σημείο φόρτωσης» and «+ σημείο παράδοσης», the VS none', await K.count(page, `${LEG} [data-nat="3001"] [data-act="add-point"]`) === 2
    && await K.count(page, `${LEG} [data-nat="3004"] [data-act="add-point"]`) === 2 && await K.count(page, `${LEG} [data-vs] [data-act="add-point"]`) === 0);
  ok(scn, 'the leg has «+ παραγγελία»', await K.count(page, `${LEG} [data-act="leg-add-order"]`) === 1);
  // code review: a price typed in the leg form and not saved is not lost by these exits
  await page.fill(`${LEG} [data-nat="3001"] [data-f="price"]`, '999');
  await page.click(`${LEG} [data-nat="3001"] [data-act="add-point"][data-k="drop"]`);
  ok(scn, 'a price typed and not saved + «+ σημείο» → the line says save first, the leg form stays, nothing opened', await K.count(page, LEG) === 1 && await K.count(page, DLG) === 0
    && /Αποθήκευσε πρώτα/.test(await K.text(page, `${LEG} [data-err]`)));
  await page.fill(`${LEG} [data-nat="3001"] [data-f="price"]`, '');
  // code review: the row A-7 opens with is not «a change» — the riding point's stop time still opens at once
  await page.click(`${LEG} [data-nat="3001"] [data-act="add-point"][data-k="drop"]`);
  await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
  await page.click(`${DLG} [data-shipstop="5202"] [data-act="stop-time"][data-stop="1003"]`).catch(() => {});
  await page.waitForSelector('.wi4-dlg[data-wn5="date"]', { timeout: 6000 }).catch(() => {});
  ok(scn, 'the edit form opened by «+ σημείο» with its untouched row: «Αλλαγή ώρας στάσης ›» opens the panel, no «save first»',
    await K.count(page, '.wi4-dlg[data-wn5="date"]') === 1 && await K.count(page, DLG) === 0);
  await page.keyboard.press('Escape');
  await openLegBy(page, 101, 'KATHODOS');
  await page.click(`${LEG} [data-nat="3001"] [data-act="add-point"][data-k="drop"]`);
  await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
  ok(scn, '«+ σημείο παράδοσης» → the leg form closes, #3001 opens to edit (GET /plan/orders/3001) with ONE new delivery row', await K.count(page, LEG) === 0
    && K.planOf(S, 'GET', '/plan/orders/3001').length === 2 && await K.count(page, `${DLG} [data-newship][data-k="drop"]`) === 1);
  await page.evaluate((d) => { const r = document.querySelector(`${d} [data-newship]`); fhPickLinked(r.dataset.pd, 'recWn5LocAth', 'ATHENS TEST');
    const x = r.querySelector('[data-f="pal"]'); x.value = '2'; x.dispatchEvent(new Event('input', { bubbles: true })); }, DLG);
  await save(page);
  await page.waitForTimeout(1000);
  const p = K.planOf(S, 'PATCH', '/plan/orders/3001');
  ok(scn, 'one PATCH: exactly one new point (no shipment_id), 2 pallets', p.length === 1 && p[0].body.shipments.length === 1 && !('shipment_id' in p[0].body.shipments[0])
    && p[0].body.shipments[0].pallets === 2, p.map((x) => x.body));
  const done = await K.text(page, `${DLG} [data-done]`);
  ok(scn, 'saved: «ΠΡΟΣ ΑΝΑΘΕΣΗ» and the way back «Στο RT-T101 · ΚΑΘΟΔΟΣ ›»', /ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(done) && done.includes('Στο RT-T101 · ΚΑΘΟΔΟΣ ›'), done);
  await page.click(`${DLG} [data-act="to-leg"]`);
  await page.waitForSelector('.wi4-dlg[data-wn5="plus"]', { timeout: 6000 }).catch(() => {});
  ok(scn, '«Στο RT-T101 ›» → the form closes and the «+» of RT-T101 ΚΑΘΟΔΟΣ opens (its waiting list: one press «Πρόσθεσε»)', await K.count(page, DLG) === 0
    && await K.count(page, '.wi4-dlg[data-wn5="plus"]') === 1 && /Πρόσθεσε στην ΚΑΘΟΔΟ/.test(await K.text(page, '.wi4-dlg[data-wn5="plus"] .wi4-dlg-t')));
  ok(scn, 'no other write than the one PATCH (the board move is the user\'s next press)', S.plan.filter((x) => x.m !== 'GET').length === 1, S.plan.filter((x) => x.m !== 'GET').map((x) => x.m + ' ' + x.path));
  await page.keyboard.press('Escape');
  await openLegBy(page, 101, 'KATHODOS');
  await page.click(`${LEG} [data-act="leg-add-order"]`);
  await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
  const tg = await page.evaluate((d) => { const s = document.querySelector(`${d} #wn5f-tgt`), r = document.querySelector(`${d} #wn5f-dir`);
    return s && { v: s.value, dis: s.disabled, dir: r.value, ddis: r.disabled, t: document.querySelector(`${d} .wi4-dlg-t`).textContent }; }, DLG);
  ok(scn, '«+ παραγγελία» → the create form on RT-T101 ΚΑΘΟΔΟΣ, cycle and side set and locked', !!tg && tg.v === '101' && tg.dis && tg.dir === 'KATHODOS' && tg.ddis && /Νέα παραγγελία/.test(tg.t), tg);
  await closeClean(page, S, ok, scn);
}

// F44/F46 (live simulation 31/10): «+» → «Νέα παραγγελία» put «Ημ. άφιξης Βέροιας» on the cycle's START day (the
// «+» passes it as day): Thu 29 for a cycle that stops at Veroia on Fri 30, fixed by hand three times. The cycle's own
// Veroia stop on that side fixes the day; with none yet, the arrival the screen filled follows the order's loading
// (F33's rule: on or after its loading), and a day the user typed stays theirs.
async function scnF44({ browser, origin, ok, scn }) {
  const vday = (page) => page.$eval(`${DLG} #wn5f-vday`, (i) => i.value).catch(() => null);
  { // RT-T101 starts Mon 12/10, its ΑΝΟΔΟΣ stops at Veroia Tue 13/10; RT-T102 (Wed 14/10) is all ΑΝΟΔΟΣ
    const { page, S } = await K.openApp(browser, origin, { board: K.week() });
    if (!(await guard(page, ok, scn))) return;
    await page.evaluate(() => WN5Form.openOrder({ side: 'ANODOS', day: '2026-10-12', rtId: 101 }));
    await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
    const v = await vday(page);
    ok(scn, '«+» of RT-T101 ΑΝΟΔΟΣ (cycle day Mon 12/10): «Ημ. άφιξης Βέροιας» = its Veroia stop Tue 13/10 — main: Mon 12/10', v === '2026-10-13', v);
    const pt = await page.$eval(`${DLG} .wn5f-rows[data-k="load"] [data-f="day"]`, (i) => i.value).catch(() => null);
    // F57 (owner 31/10) replaced «the points keep the cycle's day»: a point the screen filled takes the Veroia day
    ok(scn, '… the filled loading point is on that Veroia day Tue 13/10 (F57; before: the cycle\'s Mon 12/10)', pt === '2026-10-13', pt);
    await closeClean(page, S, ok, scn);
  }
  { // no Veroia stop on the ΑΝΟΔΟΣ yet: RT-T101 without its two ΑΝΟΔΟΣ stops
    const b = K.week();
    b.cycles[0].stops = b.cycles[0].stops.filter((x) => x.side === 'KATHODOS');
    const { page, S } = await K.openApp(browser, origin, { board: b });
    if (!(await guard(page, ok, scn))) return;
    await page.evaluate(() => WN5Form.openOrder({ side: 'ANODOS', day: '2026-10-12', rtId: 101 }));
    await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
    const v0 = await vday(page);
    await page.fill(`${DLG} .wn5f-rows[data-k="load"] .wn5f-dayx`, '14/10');
    await page.waitForTimeout(200);
    const v1 = await vday(page);
    ok(scn, 'no Veroia stop: loading typed Wed 14/10 → the filled arrival follows to Wed 14/10 — main: stays Mon 12/10', v0 === '2026-10-12' && v1 === '2026-10-14', { v0, v1 });
    // the Veroia point row the screen filled follows the header (the live «fixed by hand 3 times» was this row)
    await page.evaluate((d) => { const r = document.querySelector(`${d} .wn5f-rows[data-k="drop"] .wn5f-row`); fhPickLinked(r.dataset.pid, 'recJucKOhC1zh4IP3', 'ΒΕΡΟΙΑ TEST'); }, DLG);
    await page.waitForTimeout(150);
    await page.fill(`${DLG} .wn5f-rows[data-k="load"] .wn5f-dayx`, '15/10');
    await page.waitForTimeout(200);
    const rowDay = await page.$eval(`${DLG} .wn5f-rows[data-k="drop"] [data-f="day"]`, (i) => i.value).catch(() => null);
    ok(scn, '… the Veroia point row follows too (loading Thu 15/10 → Veroia row Thu 15/10)', rowDay === '2026-10-15' && (await vday(page)) === '2026-10-15', rowDay);
    await page.fill(`${DLG} .wn5f-day:has(#wn5f-vday) .wn5f-dayx`, '16/10');
    await page.waitForTimeout(150);
    await page.fill(`${DLG} .wn5f-rows[data-k="load"] .wn5f-dayx`, '13/10');
    await page.waitForTimeout(200);
    const v2 = await vday(page);
    ok(scn, '… an arrival the user typed (Fri 16/10) stays when the loading changes again', v2 === '2026-10-16', v2);
    await closeClean(page, S, ok, scn);
  }
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
    // 092 (option a): «Ορισμός ημέρας» previews ({preview: true}), «Επιβεβαίωση» sends the act
    'POST /plan/vs/day': (e) => (e.body && e.body.preview === true
      ? [200, { ok: true, op: 'plan_vs_set_day', dry_run: true, preview: { vs_day: { from: '2026-10-12', to: e.body.day }, trucks: [], pallets: null, warnings: [] } }]
      : ++dayN === 1
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
  await page.waitForTimeout(800);
  await page.click(`${V} [data-act="vs-day-ok"]`);
  await page.waitForTimeout(1200);
  const days = K.planOf(S, 'POST', '/plan/vs/day').filter((x) => !(x.body && x.body.preview));
  ok(scn, 'one change = ONE POST /plan/vs/day {order_id:2101, day:"2026-10-14"} after its preview', days.length === 1 && JSON.stringify(days[0].body) === JSON.stringify({ order_id: 2101, day: '2026-10-14' }), days.map((x) => x.body));
  ok(scn, 'after 200 with notice_ids: «γράφτηκε στη διεθνή και στα φορτηγά, ο διεθνών ειδοποιήθηκε»', /γράφτηκε στη διεθνή και στα φορτηγά, ο διεθνών ειδοποιήθηκε/.test(await K.text(page, `${V} [data-vsok]`)));
  ok(scn, 'vs_day_differs → a warning line', await K.count(page, `${LEG} .wn5-strip[data-kind="warning"]`) >= 1);
  await page.click(`${V} [data-act="vs-day"]`);
  await page.waitForTimeout(800);
  await page.click(`${V} [data-act="vs-day-ok"]`);
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
  // 092: two previews (they keep nothing) + the 3 VS writes
  ok(scn, 'exactly the 3 VS writes (and their 2 previews) reached /plan', S.plan.filter((x) => x.m !== 'GET').length - writes0 === 5
    && S.plan.filter((x) => x.m !== 'GET' && !(x.body && x.body.preview)).length - writes0 === 3, S.plan.filter((x) => x.m !== 'GET').map((x) => x.m + ' ' + x.path));
  await closeClean(page, S, ok, scn);
  // 072 board: no order_stop_id on legs → the destination button is off and says why
  const p2 = await K.openApp(browser, origin, { board: vsWeek(false) });
  await p2.page.evaluate(() => WN5Form.openLeg(101, 'KATHODOS'));
  await p2.page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
  ok(scn, 'without order_stop_id «Αλλαγή προορισμού» is disabled, with the reason', await p2.page.evaluate((v) => { const b = document.querySelector(`${v} [data-act="vs-place"]`); return !!b && b.disabled; }, V)
    && /όταν το board φέρνει τη στάση της διεθνούς/.test(await K.text(p2.page, V)));
  await closeClean(p2.page, p2.S, ok, scn);
}

// Third PR of «Weekly Εθνικών v5 → 8/10», group B (owner via coordinator 1/11): F5, F2, one Veroia default «όλη η
// ημέρα», the Groupage label, and B-24 checked with two orders. Each check names what plain c533d04e shows.
async function scnPr3b({ browser, origin, ok, scn }) {
  // F5 · a place picked from its list with ONE real click; the next keys land in the row's day, nothing else
  {
    const { page, S } = await K.openApp(browser, origin, { viewport: { width: 1440, height: 900 } });
    if (!(await guard(page, ok, scn))) return;
    await openForm(page, {});
    const ROW = `${DLG} .wn5f-rows[data-k="load"] .wn5f-row`;
    await page.click(`${ROW} .wn5f-loc input.form-input`);
    await page.keyboard.type('LARISA');
    await page.waitForTimeout(200);
    await page.click(`${ROW} .linked-drop-item`, { timeout: 3000 }).catch(() => {});
    const foc = await page.evaluate((R) => { const a = document.activeElement, row = document.querySelector(R);
      return { inDay: !!a && a.classList.contains('wn5f-dayx') && row.contains(a), rec: document.getElementById('lv_' + row.dataset.pid).value }; }, ROW);
    await page.keyboard.type('14/10');
    await page.keyboard.press('Tab');
    const after = await page.evaluate((R) => { const row = document.querySelector(R);
      return { day: row.querySelector('[data-f="day"]').value, rec: document.getElementById('lv_' + row.dataset.pid).value, label: document.getElementById('ls_' + row.dataset.pid).value }; }, ROW);
    ok(scn, 'F5 · one click on «LARISA TEST» picks it and the focus is the row\'s day — main: the focus falls to the page', foc.inDay && foc.rec === LAR.rec, foc);
    ok(scn, 'F5 · «14/10» typed next is that row\'s day (2026-10-14), the place stays LARISA — main: the keys go nowhere',
      after.day === '2026-10-14' && after.rec === LAR.rec && /LARISA TEST/.test(after.label), after);
    // the Groupage label says what it does (one client with many deliveries uses it too): no «πελάτες»
    const g = await K.text(page, `${DLG} [data-mode="groupage"] .wn5f-mode-s`);
    ok(scn, 'Groupage · «Πολλές παραγγελίες, ένα φορτηγό», never «Πολλοί πελάτες» — main: «Πολλοί πελάτες, …»', g === 'Πολλές παραγγελίες, ένα φορτηγό', g);
    await closeClean(page, S, ok, scn);
  }
  // F2 + one default · an ΑΝΟΔΟΣ asks the Veroia arrival only when it goes to Veroia; empty = «όλη η ημέρα»
  {
    const { page, S } = await K.openApp(browser, origin);
    await page.evaluate(() => WN5Form.openOrder({ side: 'ANODOS' }));
    await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
    const asked = () => page.evaluate((d) => ['#wn5f-vday', '#wn5f-vto'].map((x) => { const i = document.querySelector(`${d} ${x}`); return getComputedStyle(i.closest('.wn5f-f')).visibility; }), DLG);
    await fillOrder(page, 0, { client: C42, price: 120, temp: 2, pe: false, loads: [r(LAR, '2026-10-14', '', '', 4)], drops: [r(ATH, '2026-10-14', '', '', 4)] });
    const off = await asked();
    ok(scn, 'F2 · ΑΝΟΔΟΣ Larisa → Athens: no Veroia day, no «Άφιξη Βέροιας ως» — main: both asked', off.every((v) => v === 'hidden'), off);
    await fillOrder(page, 0, { client: C42, price: 120, temp: 2, pe: false, loads: [r(LAR, '2026-10-14', '', '', 4)], drops: [r(HUB, '2026-10-14', '', '', 4)] });
    const on = await asked();
    ok(scn, 'F2 · the delivery becomes Veroia: both fields come back, in place', on.every((v) => v === 'visible'), on);
    const sum = await K.text(page, `${DLG} [data-sum]`);
    ok(scn, 'one default · the empty Veroia arrival reads «Τετ όλη η ημέρα», never «ως Τετ 23:59» — main: «ως Τετ 23:59»', sum.includes('Τετ όλη η ημέρα') && !/ως Τετ 23:59/.test(sum), sum.slice(0, 300));
    await closeClean(page, S, ok, scn);
  }
  // one default · the «+» short form of a cycle whose Veroia arrival ends the day opens with the field empty (= «όλη η
  // ημέρα»), and the ΑΝΟΔΟΣ leg form names that arrival «όλη η ημέρα»
  {
    const b = K.week();
    Object.assign(b.cycles[0].stops[4], { planned_from: '2026-10-13T00:00:00+03:00', planned_to: '2026-10-13T23:59:00+03:00' });
    const { page, S } = await K.openApp(browser, origin, { board: b });
    await page.evaluate(() => WN5Form.openOrder({ side: 'ANODOS', day: '2026-10-13', rtId: 101 }));
    await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
    const vto = await page.$eval(`${DLG} #wn5f-vto`, (i) => i.value).catch(() => null);
    ok(scn, 'one default · «+» ΑΝΟΔΟΣ of RT-T101 (Veroia 00:00–23:59): «Άφιξη Βέροιας ως» empty, not «23:59» — main: 23:59', vto === '', vto);
    await page.keyboard.press('Escape');
    await page.evaluate(() => WN5Form.openLeg(101, 'ANODOS'));
    await page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
    const h = await K.text(page, `${LEG} .wn5f-head`);
    ok(scn, 'one default · the ΑΝΟΔΟΣ leg form: «Άφιξη Βέροιας» «Τρί 13/10 · όλη η ημέρα» — main: «· 23:59»', h.includes('Τρί 13/10 · όλη η ημέρα') && !h.includes('· 23:59'), h);
    await closeClean(page, S, ok, scn);
  }
  // B-24 (Figma audit 28/10, «27 + 6 = 33/33»): the leg form's total chip with two orders, checked with data that has them
  {
    const b = K.week();
    b.cycles[0].stops[0].legs[0].pallets = 27; b.cycles[0].stops[1].legs[0].pallets = 27;
    const { page, S } = await K.openApp(browser, origin, { board: b });
    await page.evaluate(() => WN5Form.openLeg(101, 'KATHODOS'));
    await page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
    const cap = await K.text(page, `${LEG} [data-cap]`);
    ok(scn, 'B-24 · VS 27π + N-T001 6π on the ΚΑΘΟΔΟΣ: the chip reads «27 + 6 = 33/33» (already so on main: verified, not changed)', cap === '27 + 6 = 33/33', cap);
    await closeClean(page, S, ok, scn);
  }
}

K.run({
  scenarios: { order: scnOrder, nowin: scnNoWin, nopp: scnNoPP, groupage: scnGroupage, unknown: scnUnknown, reused: scnReused, replayed: scnReplayed, edit: scnEdit, 'edit-ride': scnEditRide, 'edit-follow': scnEditFollow, 'edit-add': scnEditAdd, 'edit-remove': scnEditRemove, 'edit-read-fail': scnEditReadFail, 'edit-twoday': scnEditTwoDay, 'veroia-edit': scnVeroiaEdit, 'day-type': scnDayType, leg: scnLeg, 'leg-anodos': scnLegAnodos, 'stop-time': scnStopTime, miss: scnMiss, 'leg-add': scnLegAdd, vs: scnVs, f44: scnF44, pr3b: scnPr3b },
  globals: ['WN5Form'],
  go: 'the v5 order forms send one body per press, from the form only, with one request_id per open form',
}).catch((e) => { console.error(e); process.exit(1); });
