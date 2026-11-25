// Rig — National v5, 114 (owner 8/11 "first a split", again 25/11): «Σπάσε…» on a «ΠΡΟΣ ΑΝΑΘΕΣΗ» row whose ONE load
// waits at its own loading point. Judged by what reached the fake /plan/* (S.plan: the POST /plan/pieces/split body,
// the assign source) and by what the board shows; never by a toast. Synthetic week of tests/critics/wn5-rig-kit.js
// (4101: 8 pallets of ΠΕΛΑΤΗΣ Α, waiting at ASPROPYRGOS TEST).
// Usage (cwd = a tree with node_modules): node tests/critics/wn5-split-start-rig.js [split-gate split-start split-sum split-refused split-parts]
//        WN5_TREE=<git archive origin/main> node tests/critics/wn5-split-start-rig.js   (plain-main proof: NO-GO, exit 1)
// Exit: 0 green · 1 a check failed · 2 unknown scenario.
'use strict';
const K = require('./wn5-rig-kit.js');

const DLG = '.wi4-dlg[role="dialog"][data-wn5="split"]';
const ROW = (id) => `.wn5-row[data-piece="${id}"]`;
// the board as a base after 114 says it: every waiting item carries parent_piece_id (null for a whole load)
const board114 = () => { const b = K.week(); for (const w of b.waiting) w.parent_piece_id = null; return b; };
// the same load after «Σπάσε» 3 + 5: two parts of 4101, each its own line
function boardParts() {
  const b = board114();
  const w = b.waiting[0];
  b.waiting = [Object.assign({}, w, { piece_id: 4201, pallets: 3, parent_piece_id: 4101 }), Object.assign({}, w, { piece_id: 4202, pallets: 5, parent_piece_id: 4101 })];
  return b;
}
const splitOf = (S) => K.planOf(S, 'POST', '/plan/pieces/split');
async function openSplit(page) {
  await page.click(`${ROW(4101)} .wn5-wmore`).catch(() => {});
  await page.click('.wn5-hub-pop [data-v="split"]').catch(() => {});
  await page.waitForSelector(DLG, { timeout: 5000 }).catch(() => {});
}
async function fill(page, a, b) {
  await page.fill(`${DLG} [data-part-pal][data-i="0"]`, a);
  await page.fill(`${DLG} [data-part-pal][data-i="1"]`, b);
}
const saveOff = (page) => page.evaluate((d) => { const b = document.querySelector(`${d} [data-act="save"]`); return !b || b.disabled; }, DLG);
async function done(page, S, ok, scn) {
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// a base before 114 (no parent_piece_id in waiting[]): the row offers nothing - a press would only be refused
async function scnGate({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin);
  ok(scn, 'board without parent_piece_id (base before 114): no «⋯» on the waiting row', await K.count(page, `${ROW(4101)} .wn5-wmore`) === 0
    && await K.count(page, ROW(4101)) === 1);
  await done(page, S, ok, scn);
}
async function scnStart({ browser, origin, ok, scn, shots }) {
  const { page, S } = await K.openApp(browser, origin, { board: board114(), viewport: { width: 1440, height: 900 },
    plan: { 'POST /plan/pieces/split': (e, S2) => { S2.board = boardParts(); return [200, { ok: true, op: 'plan_split_piece', dry_run: false,
      ids: { piece_ids: [4201, 4202], leg_ids: [], rt_ids: [] }, warnings: [], notice_ids: [] }]; } } });
  ok(scn, 'after 114: «⋯» on the waiting row of one load with known pallets', await K.count(page, `${ROW(4101)} .wn5-wmore`) === 1);
  if (shots) await page.screenshot({ path: `${shots}/after-split-row.png` });
  await openSplit(page);
  ok(scn, '«⋯» → «Σπάσε…» opens the split window: two parts, no truck list, no «φεύγει ως»', await K.count(page, DLG) === 1
    && await K.count(page, `${DLG} [data-part-pal]`) === 2 && await K.count(page, `${DLG} select`) === 0 && !/φεύγει/.test(await K.text(page, DLG)), await K.text(page, DLG));
  ok(scn, 'the window says the sum and that each part stays «ΠΡΟΣ ΑΝΑΘΕΣΗ»; no RT code, no bare #', /Άθροισμα 8· κάθε μέρος μένει «ΠΡΟΣ ΑΝΑΘΕΣΗ»/.test(await K.text(page, DLG))
    && !/RT-|#\d/.test(await K.text(page, DLG)), await K.text(page, DLG));
  await fill(page, '3', '5');
  await page.waitForTimeout(100);
  ok(scn, '3 + 5 = 8 ✓ and «Σπάσε» lights', /3 \+ 5 = 8 ✓/.test(await K.text(page, `${DLG} .wn5-sum`)) && !(await saveOff(page)), await K.text(page, `${DLG} .wn5-sum`));
  if (shots) await page.screenshot({ path: `${shots}/after-split-dialog.png` });
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(1200);
  const sent = splitOf(S);
  const body = sent[0] && Object.assign({}, sent[0].body);
  const rid = body && body.request_id;
  if (body) delete body.request_id;
  ok(scn, 'ONE POST /plan/pieces/split {piece_id:4101, parts:[{pallets:3},{pallets:5}]} + a request_id, nothing else',
    sent.length === 1 && JSON.stringify(body) === JSON.stringify({ piece_id: 4101, parts: [{ pallets: 3 }, { pallets: 5 }] }) && K.UUID4.test(rid || ''), sent.map((x) => x.body));
  ok(scn, 'no other write (no /plan/legs, no move)', S.plan.filter((x) => x.m !== 'GET').length === 1, S.plan.filter((x) => x.m !== 'GET').map((x) => x.m + ' ' + x.path));
  ok(scn, 'the re-read board: two «ΠΡΟΣ ΑΝΑΘΕΣΗ» rows, one per part (3 and 5), the window closed', await K.count(page, ROW(4201)) === 1
    && await K.count(page, ROW(4202)) === 1 && await K.count(page, ROW(4101)) === 0 && await K.count(page, DLG) === 0);
  if (shots) await page.screenshot({ path: `${shots}/after-split-parts.png` });
  await done(page, S, ok, scn);
}
async function scnSum({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { board: board114() });
  await openSplit(page);
  await fill(page, '3', '4');
  await page.waitForTimeout(100);
  ok(scn, '3 + 4: «πρέπει 8», «Σπάσε» off', /πρέπει 8/.test(await K.text(page, `${DLG} .wn5-sum`)) && await saveOff(page), await K.text(page, `${DLG} .wn5-sum`));
  await page.click(`${DLG} [data-act="more"]`);
  await page.fill(`${DLG} [data-part-pal][data-i="2"]`, '1');
  await page.waitForTimeout(100);
  ok(scn, '«+ ακόμη ένα μέρος» → 3 + 4 + 1 = 8 ✓, «Σπάσε» on', /3 \+ 4 \+ 1 = 8 ✓/.test(await K.text(page, `${DLG} .wn5-sum`)) && !(await saveOff(page)));
  ok(scn, 'nothing sent while typing', splitOf(S).length === 0);
  await done(page, S, ok, scn);
}
// the load took a truck since the board was read: the base refuses (not_at_hub); said in words, the window stays
async function scnRefused({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { board: board114(),
    plan: { 'POST /plan/pieces/split': () => K.planErr(422, 'PLAN_RULE', 'not_at_hub') } });
  await openSplit(page);
  await fill(page, '3', '5');
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(1000);
  ok(scn, 'refused not_at_hub → «Δεν σπάει: το φορτίο μπήκε ήδη σε φορτηγό — ανανέωσε», the window open, one POST',
    /Δεν σπάει: το φορτίο μπήκε ήδη σε φορτηγό — ανανέωσε/.test(await K.text(page, `${DLG} .wn5-dlg-msg`)) && await K.count(page, DLG) === 1 && splitOf(S).length === 1,
    await K.text(page, `${DLG} .wn5-dlg-msg`));
  await done(page, S, ok, scn);
}
// each part goes alone: «ΠΡΟΣ ΑΝΑΘΕΣΗ» of a part opens the assignment of THAT piece, never the order's group
async function scnParts({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { board: boardParts() });
  await page.evaluate(() => { const f = WN5Act.assign; window.__src = []; WN5Act.assign = function (src, ctx) { window.__src.push(JSON.parse(JSON.stringify(src))); return f.apply(this, arguments); }; });
  await page.click(`${ROW(4202)} [data-act="assign"]`);
  await page.waitForTimeout(600);
  const src = await page.evaluate(() => window.__src);
  ok(scn, '«ΠΡΟΣ ΑΝΑΘΕΣΗ» of the 5-pallet part → assign {pieces:[{piece_id:4202}]}, no group', JSON.stringify(src) === JSON.stringify([{ pieces: [{ piece_id: 4202 }] }]), src);
  ok(scn, 'the parts can split again (each its own load at the loading point): «⋯» on both rows', await K.count(page, `${ROW(4201)} .wn5-wmore`) === 1
    && await K.count(page, `${ROW(4202)} .wn5-wmore`) === 1);
  await done(page, S, ok, scn);
}

K.run({
  scenarios: { 'split-gate': scnGate, 'split-start': scnStart, 'split-sum': scnSum, 'split-refused': scnRefused, 'split-parts': scnParts },
  globals: ['WN5Hub', 'WN5Act'],
  go: 'a load waiting at its loading point splits into parts with no truck (one POST, the sum checked), each part is its own «ΠΡΟΣ ΑΝΑΘΕΣΗ» row assigned alone, and a base before 114 shows nothing',
}).catch((e) => { console.error(e); process.exit(1); });
