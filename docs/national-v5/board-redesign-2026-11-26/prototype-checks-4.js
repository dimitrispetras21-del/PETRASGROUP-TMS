// behaviour checks, part 4: his own grammar, Greek keyboard, long lines, the key legend
const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(900);
  const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
  const st = () => p.evaluate(() => window.__pz.state());
  const clip = () => p.evaluate(() => [...document.querySelectorAll('.pz-side:not(.wrap)')].filter((x) => x.scrollWidth > x.clientWidth + 1).length);
  const wipe = async () => { if (await p.locator('.pz-in').count()) await p.locator('.pz-in').fill(''); await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); };
  const rowOf = (plate) => p.locator('.pz-day.today .pz-row', { hasText: plate });
  ok(await clip() === 0, 'no line is clipped at rest, the four-piece line included');
  ok(await p.locator('#pz.keys').count() === 1, 'the key legend shows the first time');
  // the whole line the way he writes it, capitals without accents, one Enter
  await rowOf('HMA 4102').locator('.pz-side.a').click();
  await p.keyboard.type('5 Χ ΤΡΙΠΟΛΗ (-9200) + 12 ΠΑΛ ΚΟΡΙΝΘΟΣ (9214) // 17 ΠΑΛ'); await p.waitForTimeout(150);
  ok(await p.locator('.pz-pop .pz-op').count() === 2, 'two pieces are proposed, the total agrees so nothing else is said');
  await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  let r = (await st()).rows.find((x) => x.trk && x.trk.i === 1 && x.day === 'thu');
  ok(r.a.length === 4 && r.a[2].ref === '9200' && r.a[2].q === 5 && r.a[3].ref === '9214' && r.a[3].q === 12, 'both pieces are on the truck after one Enter');
  ok(await p.locator('#pz.keys').count() === 0, 'the legend is gone after the first thing written');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  // his total does not agree with the sum
  await rowOf('HMA 4104').locator('.pz-side.a').click(); await p.keyboard.type('20 ΑΡΓΟΣ (-6814) // 33'); await p.waitForTimeout(150);
  ok((await p.locator('.pz-pop').innerText()).includes('γράφεις 33, είναι 20'), 'a total that does not agree is said before Enter');
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok((await rowOf('HMA 4104').locator('.pz-cap.over').innerText()).includes('γράφεις 33'), 'and stays on the line after it');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  // two references for one number: it asks, it does not guess
  await rowOf('HMA 4106').locator('.pz-side.a').click(); await p.keyboard.type('40 ΑΡΓΟΣ (6814/0801)'); await p.waitForTimeout(150);
  ok((await p.locator('.pz-pop').innerText()).includes('πόσες από καθεμία'), 'two references for one number are asked, with what each one has');
  const before = JSON.stringify((await st()).rows.map((x) => x.a.length)); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  ok(before === JSON.stringify((await st()).rows.map((x) => x.a.length)), 'and Enter writes nothing');
  await wipe();
  // «-11» right after a parenthesis is a new piece of 11 pallets, not a reference
  const rd = await p.evaluate(() => window.__pz.read('22 ΑΡΓΟΣ(-6814) -11 ΑΡΓΟΣ (-6999) // 33 ΠΑΛ'));
  ok(rd.total === 33 && rd.list.length === 2 && rd.list[1].q === 11 && rd.list[1].refs[0] === '6999', '«(-6814) -11 … (-6999) // 33» reads as 22 + 11');
  const rd2 = await p.evaluate(() => window.__pz.read('ΠΕΛΑΤΗΣ ΓΙΑ ΠΑΤΡΑ (240Ε)'));
  ok(rd2.list[0].price === 240 && !rd2.list[0].refs.length && rd2.list[0].dest[0] === 'ΠΑΤΡΑ', 'a price in parentheses is a price, «ΓΙΑ» marks the destination');
  // Greek keyboard: the keys answer by their place, whatever letter they give
  const key = (key, code, mod) => p.evaluate(([k, c, m]) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: c, bubbles: true, cancelable: true, metaKey: !!m })), [key, code, mod]);
  const n0 = (await st()).rows.length; await key('ν', 'KeyN'); await p.waitForTimeout(150);
  ok((await st()).rows.length === n0 + 1, '«ν» on a Greek keyboard opens a new line');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  const a0 = (await st()).rows.find((x) => x.trk && x.trk.i === 3 && x.day === 'thu').a.length; await key('ζ', 'KeyZ', true); await p.waitForTimeout(150);
  ok((await st()).rows.find((x) => x.trk && x.trk.i === 3 && x.day === 'thu').a.length === a0 - 1, '⌘ + «ζ» undoes');
  // a truck is found without accents and with Greek letters in the place of Latin ones
  await rowOf('HMA 4107').count(); await p.locator('.pz-day', { hasText: 'ΠΑΡ 27' }).locator('.pz-row', { hasText: 'φορτηγό' }).locator('.pz-trk').click();
  await p.keyboard.type('ΗΜΑ 4108'); await p.waitForTimeout(150);
  ok((await p.locator('.pz-pop').innerText()).includes('HMA 4108'), 'a plate typed with Greek capitals finds the truck');
  await p.keyboard.press('ControlOrMeta+A'); await p.keyboard.type('οδηγος θ'); await p.waitForTimeout(150);
  ok((await p.locator('.pz-pop').innerText()).includes('HMA 4108'), 'a driver typed without accents finds the truck');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  // what the last review broke, kept broken-proof
  const tot = async () => { const s = await st(); return s.rows.reduce((n, r) => n + r.k.concat(r.a).reduce((m, x) => m + (x.q || 0), 0), 0) + s.store.reduce((n, x) => n + x.q, 0); };
  const T0 = await tot(); const side = (pl, sd) => rowOf(pl).locator('.pz-side.' + sd); 
  await side('HMA 4102', 'k').click(); await p.keyboard.type('5 Τρ + 3 Αθ'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  let r2 = (await st()).rows.find((x) => x.trk && x.trk.i === 1 && x.day === 'thu');
  ok(r2.k.length === 2 && r2.k[1].ref === '7001' && (await p.locator('.pz-in').inputValue()) === '5 Τρ', 'a piece that fits two loads is not chosen for him: it stays in the cursor');
  await wipe();
  await side('HMA 4102', 'a').click(); await p.keyboard.type('22 ΑΡΓΟΣ ΕΠΕΙΓΟΝ'); await p.keyboard.press('Enter'); await p.waitForTimeout(120);
  ok(await tot() === T0, 'a word that is not a place does not become a new order'); await wipe();
  await side('HMA 4102', 'a').click(); await p.keyboard.type('0 ΑΡΓΟΣ (6814)'); await p.keyboard.press('Enter'); await p.keyboard.press('ControlOrMeta+A'); await p.keyboard.type('330 ΑΡΓΟΣ (6814)'); await p.keyboard.press('Enter'); await p.waitForTimeout(120);
  ok(!(await st()).rows.some((x) => x.trk && x.a.some((y) => y.ref === '6814' && y.q === 33)), '0 or 330 pallets take nothing'); await wipe();
  await side('HMA 4106', 'a').click(); await p.keyboard.type('33 ΑΡΓΟΣ (6814) // 30'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  ok(/γράφεις 30, είναι \d+/.test(await rowOf('HMA 4106').locator('.pz-cap.over').last().innerText()), 'his total stays on the line after Enter');
  await p.keyboard.press('Backspace'); await p.waitForTimeout(120); ok(await rowOf('HMA 4106').locator('.pz-cap.over').count() === 0 || !(await rowOf('HMA 4106').locator('.pz-cap.over').innerText()).includes('γράφεις'), 'and leaves with the piece'); await wipe();
  await side('HMA 4106', 'a').click(); await p.keyboard.type('22 ΑΡΓΟΣ (6814) + 5 ΤΡΙ'); await p.keyboard.press('Escape'); await p.waitForTimeout(120);
  ok((await rowOf('HMA 4106').locator('.pz-draft').innerText()).includes('22 ΑΡΓΟΣ (6814) + 5 ΤΡΙ'), 'Esc keeps what he typed, in the line');
  await side('HMA 4104', 'a').click(); await p.keyboard.type('Χ'); await p.keyboard.press('Enter'); await p.waitForTimeout(120);
  ok(await rowOf('HMA 4104').locator('.pz-x').count() === 1 && await rowOf('HMA 4104').locator('.pz-empty.soon').count() === 0, '«Χ» marks the side empty on purpose and it stops asking');
  await p.keyboard.press('Escape'); await key('ζ', 'KeyZ', true); await p.waitForTimeout(150);
  ok(await rowOf('HMA 4104').locator('.pz-x').count() === 0 && (await rowOf('HMA 4106').locator('.pz-draft').count()) === 1, 'undo takes the «Χ» back and leaves the unfinished text of the other line');
  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', code: 'KeyZ', bubbles: true, cancelable: true, metaKey: true, shiftKey: true }))); await p.waitForTimeout(150);
  ok(await rowOf('HMA 4104').locator('.pz-x').count() === 1, 'redo puts it back');
  await p.locator('.pz-day.today [data-new]').click(); await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); const n1 = (await st()).rows.length; await key('ν', 'KeyN'); await p.waitForTimeout(150);
  ok((await st()).rows.length === n1 + 1, 'N still works after a new line was opened and left'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  await side('HMA 4105', 'k').count(); await p.locator('.pz-day', { hasText: 'ΠΑΡ 27' }).locator('.pz-row', { hasText: 'HMA 4105' }).locator('.pz-side.k').click(); await p.keyboard.type('Ασπρόπυργος'); await p.waitForTimeout(150);
  ok((await p.locator('.pz-pop .pz-op').first().innerText()).includes('2η ημέρα'), 'a place alone proposes what waits for it, with the days it sits');
  await wipe(); await p.locator('.pz-day', { hasText: 'ΠΑΡ 27' }).locator('.pz-row', { hasText: 'HMA 4105' }).locator('.pz-side.a').click(); await p.keyboard.type('Λαμία'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    ok(await p.locator('.pz-want').count() === 1, 'a place with nothing waiting stays on the line as «→ Λαμία»'); await p.keyboard.press('Escape');
  ok(await tot() === T0, 'pallets conserved through all of it (' + T0 + ')');
  // second review: a bare number is never guessed, loads are never lost through a stale position
  const say = async (pl, sd, text) => { await side(pl, sd).click(); await p.locator('.pz-in').fill(text); await p.waitForTimeout(120); const x = (await p.locator('.pz-pop').count()) ? await p.locator('.pz-pop').innerText() : ''; await p.keyboard.press('Enter'); await p.waitForTimeout(120); return x; };
  const T1 = await tot();
  let m1 = await say('HMA 4102', 'a', '22 ΠΕΛΑΤΗΣ Η ΑΡΓΟΣ 0801'); ok(m1.includes('-0801') && !m1.includes('-6814'), '«… ΑΡΓΟΣ 0801» is the load 0801, not a price and not another load'); await p.keyboard.press('Backspace'); await wipe();
  m1 = await say('HMA 4102', 'a', '22 ΠΕΛΑΤΗΣ ΑΡΓΟΣ 6899'); ok(m1.includes('δεν περιμένει') && await tot() === T1, 'four digits that match nothing are asked, not made a price'); await wipe();
  m1 = await say('HMA 4102', 'a', '22 ΑΡΓΟΥΣ ΑΡΓΟΣ'); ok(m1.includes('δεν είναι πελάτης') && await tot() === T1, 'a word that is not a client does not become an order'); await wipe();
  m1 = await say('HMA 4102', 'a', '330 ΑΡΓΟΣ'); ok(m1.includes('330 παλέτες') && await tot() === T1, '330 before a place is not a price'); await wipe();
  m1 = await say('HMA 4102', 'a', '22 ΠΑΛ'); ok(m1.includes('τι είναι') , 'a line that says nothing gets an answer, not silence'); await wipe();
  m1 = await say('HMA 4102', 'a', '6814 Άργος'); ok(m1.includes('-6814') && !m1.includes('παλέτες;'), 'a line that starts with the reference of a waiting load finds it'); await p.keyboard.press('Backspace'); await wipe();
  const rd3 = await p.evaluate(() => window.__pz.read('22 ΑΡΓΟΣ (6814) // 22 + 5 ΤΡΙΠΟΛΗ (9200)'));
  ok(rd3.list.length === 2 && rd3.total === 22, 'what he writes after his total is still read');
  // the «all» proposal after loads moved between lines without a truck
  const un = p.locator('.pz-day.today .pz-row.wait'); const n0w = await un.count();
  await un.first().locator('.pz-side.a').click(); await p.locator('.pz-in').fill('(0810)'); await p.keyboard.press('Enter'); await p.waitForTimeout(120); await wipe();
  const T2 = await tot(); await side('HMA 4105', 'a').count();
  await p.locator('.pz-day', { hasText: 'ΠΑΡ 27' }).locator('.pz-row', { hasText: 'HMA 4107' }).locator('.pz-side.a').click(); await p.locator('.pz-in').fill('ΛΑΡΙΣΑ'); await p.keyboard.press('Enter'); await p.waitForTimeout(150); await wipe();
  const s9 = await st(); ok(await tot() === T2 && !s9.rows.some((r) => r.k.concat(r.a).some((x) => x.q === 0)), 'taking a load found by its place loses nothing and leaves no empty piece (' + T2 + ')');
  await p.locator('[data-keys]').click(); ok(await p.locator('#pz.keys').count() === 1, '«?» brings the legend back');
  ok(await clip() === 0, 'no line is clipped after all of this');
  console.log('errors', JSON.stringify(errs)); await b.close(); })();
