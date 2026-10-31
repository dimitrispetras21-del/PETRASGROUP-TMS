// Rig — National v5 F62 (085, owner 31/10): in «Επεξεργασία παραγγελίας» the client is a field (fhClientSelect) while
// the order is not invoiced, read-only with its reason once GET /plan/orders/:id says invoiced: true. Judged by what
// reached the fake /plan/* (S.plan: the PATCH bodies) and by what the form shows; never by a toast. Synthetic week of
// tests/critics/wn5-rig-kit.js (3101: client 41 «ΠΕΛΑΤΗΣ Α», waiting).
// Usage: node tests/critics/wn5-f62-rig.js [f62-edit f62-invoiced f62-empty f62-typed f62-refused]
//        WN5_TREE=<git archive origin/main> node tests/critics/wn5-f62-rig.js   (plain-main proof: NO-GO, exit 1)
// Exit: 0 green · 1 a check failed · 2 unknown scenario.
'use strict';
const K = require('./wn5-rig-kit.js');

const DLG = '.wi4-dlg[role="dialog"][data-wn5="order"]';
const UPD_OK = (id) => () => [200, { ok: true, op: 'plan_order_update', dry_run: false,
  ids: { nat_order_id: id, shipment_ids: [], new_shipment_ids: [], new_piece_ids: [], removed_shipment_ids: [] }, warnings: [], notice_ids: [] }];
const sentOf = (S) => K.planOf(S, 'PATCH', '/plan/orders/3101').map((x) => { const b = Object.assign({}, x.body); delete b.request_id; return b; });
async function open(page) {
  await page.evaluate(() => WN5Form.openOrder({ natOrderId: 3101 }));
  await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
}
const save = (page) => page.click(`${DLG} [data-act="save"]`);
const client = (page) => page.evaluate((d) => {
  const box = document.querySelector(d);
  const cp = box && box.querySelector('.wn5f-grid4 [data-cpick]');
  const ro = box && box.querySelector('.wn5f-grid4 .wn5f-ro');
  return { picker: !!cp, shown: cp ? (document.getElementById('ls_' + cp.dataset.cpick) || {}).value : ro ? ro.textContent : null,
    rec: cp ? (document.getElementById('lv_' + cp.dataset.cpick) || {}).value : null, title: ro ? ro.title : null, cid: cp ? cp.dataset.cpick : null };
}, DLG);
async function closeClean(page, S, ok, scn) {
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}
// the read of 3101 with invoiced as given (true / false / absent = the read before 085)
const ordersWith = (invoiced) => { const o = K.orders(); if (invoiced !== undefined) o[3101].order.invoiced = invoiced; return o; };

async function scnEdit({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { orders: ordersWith(false), plan: { 'PATCH /plan/orders/3101': UPD_OK(3101) } });
  await open(page);
  const c = await client(page);
  ok(scn, 'not invoiced: «Πελάτης» is a picker holding the order\'s client (ΠΕΛΑΤΗΣ Α, recWn5Cli41)', c.picker && c.shown === 'ΠΕΛΑΤΗΣ Α' && c.rec === 'recWn5Cli41', c);
  await save(page);
  await page.waitForTimeout(400);
  ok(scn, 'open + «Αποθήκευση» with the same client → 0 PATCH, «Τίποτα δεν άλλαξε»', sentOf(S).length === 0 && /Τίποτα δεν άλλαξε/.test(await K.text(page, `${DLG} [data-err]`)));
  if (c.cid) await page.evaluate((id) => fhPickLinked(id, 'recWn5Cli42', 'ΠΕΛΑΤΗΣ Β'), c.cid);
  await save(page);
  await page.waitForTimeout(1000);
  ok(scn, 'another client picked → ONE PATCH /plan/orders/3101 {set:{client_id:42}} (the catalogue\'s number, nothing else)',
    JSON.stringify(sentOf(S)) === JSON.stringify([{ set: { client_id: 42 } }]), sentOf(S));
  await closeClean(page, S, ok, scn);
}
async function scnInvoiced({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { orders: ordersWith(true), plan: { 'PATCH /plan/orders/3101': UPD_OK(3101) } });
  await open(page);
  const c = await client(page);
  ok(scn, 'invoiced: «Πελάτης» is read-only, the client named, the reason in its title', !c.picker && c.shown === 'ΠΕΛΑΤΗΣ Α' && /Τιμολογημένη: ο πελάτης δεν αλλάζει/.test(c.title || ''), c);
  await page.fill(`${DLG} [data-f="notes"]`, 'ράμπα 3');
  await save(page);
  await page.waitForTimeout(1000);
  ok(scn, 'a note changed on an invoiced order → ONE PATCH {set:{notes}} with no client_id', JSON.stringify(sentOf(S)) === JSON.stringify([{ set: { notes: 'ράμπα 3' } }]), sentOf(S));
  await closeClean(page, S, ok, scn);
}
async function scnEmpty({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { orders: ordersWith(false), plan: { 'PATCH /plan/orders/3101': UPD_OK(3101) } });
  await open(page);
  const c = await client(page);
  if (c.cid) {
    await page.fill(`#ls_${c.cid}`, '');
    await page.dispatchEvent(`#ls_${c.cid}`, 'input');
  }
  await save(page);
  await page.waitForTimeout(500);
  ok(scn, 'the client emptied → «Πελάτης: διάλεξε πελάτη από τη λίστα», 0 PATCH', c.picker && sentOf(S).length === 0
    && /Πελάτης: διάλεξε πελάτη από τη λίστα/.test(await K.text(page, `${DLG} [data-err]`)), await K.text(page, `${DLG} [data-err]`));
  await closeClean(page, S, ok, scn);
}
// code review xhigh: a name typed over the picked one, never picked from the list, is no client - never the old
// client sent back in silence; the same after a pick whose text is then typed over
async function scnTyped({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { orders: ordersWith(false), plan: { 'PATCH /plan/orders/3101': UPD_OK(3101) } });
  await open(page);
  const c = await client(page);
  if (c.cid) await page.fill(`#ls_${c.cid}`, 'ΠΕΛΑΤΗΣ Β');
  await save(page);
  await page.waitForTimeout(500);
  ok(scn, 'typed «ΠΕΛΑΤΗΣ Β», not picked → «Πελάτης: διάλεξε πελάτη από τη λίστα», 0 PATCH', c.picker && sentOf(S).length === 0
    && /Πελάτης: διάλεξε πελάτη από τη λίστα/.test(await K.text(page, `${DLG} [data-err]`)), await K.text(page, `${DLG} [data-err]`));
  if (c.cid) {
    await page.evaluate((id) => fhPickLinked(id, 'recWn5Cli42', 'ΠΕΛΑΤΗΣ Β'), c.cid);
    await page.fill(`#ls_${c.cid}`, 'ΠΕΛΑΤΗΣ Γ');
  }
  await save(page);
  await page.waitForTimeout(500);
  ok(scn, 'picked Β then typed «ΠΕΛΑΤΗΣ Γ» over it → refused the same way, 0 PATCH', sentOf(S).length === 0
    && /Πελάτης: διάλεξε πελάτη από τη λίστα/.test(await K.text(page, `${DLG} [data-err]`)));
  await closeClean(page, S, ok, scn);
}
// the base refuses (invoiced meanwhile, 085 invoiced_client): its message is shown as is and the form stays open
async function scnRefused({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { orders: ordersWith(false),
    plan: { 'PATCH /plan/orders/3101': () => K.planErr(422, 'PLAN_RULE', 'invoiced_client') } });
  await open(page);
  const c = await client(page);
  if (c.cid) await page.evaluate((id) => fhPickLinked(id, 'recWn5Cli42', 'ΠΕΛΑΤΗΣ Β'), c.cid);
  await save(page);
  await page.waitForTimeout(1000);
  ok(scn, 'one PATCH sent, refused 422 invoiced_client → the base\'s message in the form, the form open', sentOf(S).length === 1
    && /rig sentinel invoiced_client/.test(await K.text(page, DLG)) && await K.count(page, DLG) === 1, await K.text(page, `${DLG} [data-strip]`));
  await closeClean(page, S, ok, scn);
}

K.run({
  scenarios: { 'f62-edit': scnEdit, 'f62-invoiced': scnInvoiced, 'f62-empty': scnEmpty, 'f62-typed': scnTyped, 'f62-refused': scnRefused },
  globals: ['WN5Form'],
  go: 'the edit form corrects the client while the order is not invoiced, sends its number only when it changed, and keeps it read-only once invoiced',
}).catch((e) => { console.error(e); process.exit(1); });
