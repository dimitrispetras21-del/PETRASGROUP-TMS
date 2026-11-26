const { chromium } = require('playwright'); const path = require('path');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const open = async () => { await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(900); };
  const st = () => p.evaluate(() => window.__pz.state());
  const chip = async () => (await p.locator('.pz-chip.red').innerText().catch(() => '0')).replace(/\D/g, '');
  await open(); const c0 = await chip();
  // past day + Backspace: the load goes back to ITS day and is still counted
  await p.locator('.pz-row.done', { hasText: 'HMA 4103' }).last().locator('.pz-side.a').click(); await p.keyboard.type('6814'); await p.waitForTimeout(150);
  ok(/από ΠΕΜ 26/.test(await p.locator('.pz-pop').innerText()), 'proposal names the day of a load from another day');
  await p.keyboard.press('Enter'); await p.waitForTimeout(150); await p.keyboard.press('Backspace'); await p.waitForTimeout(150);
  let s = await st(); ok(s.rows.some((r) => !r.trk && r.day === 'thu' && r.a.some((x) => x.ref === '6814' && x.q === 33)), 'Backspace returns it to Thursday, whole');
  ok(await chip() === c0, 'the «χωρίς φορτηγό» count is unchanged (' + c0 + ')'); await p.keyboard.press('Escape');
  // more pallets than the load has
  await open(); await p.locator('.pz-day.today .pz-row', { hasText: 'HMA 4106' }).locator('.pz-side.a').click(); await p.keyboard.type('40 Άργος 6814'); await p.waitForTimeout(150);
  ok(/έχει μόνο 33/.test(await p.locator('.pz-pop').innerText()), '40 of a 33-pallet load says «έχει μόνο 33»');
  await p.keyboard.press('Enter'); await p.waitForTimeout(150); s = await st();
  ok(s.rows.some((r) => r.trk && r.a.some((x) => x.ref === '6814' && x.q === 33 && x.asked === 40)), 'Enter takes the 33 there are and the line keeps «έγραψες 40»'); await p.keyboard.press('Backspace'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  // wrong word with a right reference
  await p.locator('.pz-day.today .pz-row', { hasText: 'HMA 4106' }).locator('.pz-side.a').click(); await p.keyboard.type('22 Αργκος 6814'); await p.waitForTimeout(150);
  ok(/-6814 είναι Άργος/.test(await p.locator('.pz-pop').innerText()), 'a wrong place with a right reference gets the right reason'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  // the price of a new order is kept and shown
  await open(); await p.locator('.pz-day.today .pz-row', { hasText: 'HMA 4104' }).locator('.pz-side.a').click(); await p.keyboard.type('17 Κασάπης Πάτρα 850'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  s = await st(); ok(s.rows.some((r) => r.a.some((x) => x.price === 850)) && /850 €/.test(await p.locator('.pz-day.today .pz-row', { hasText: 'HMA 4104' }).innerText()), 'the typed price is stored and shown');
  await p.keyboard.press('Escape');
  // a plate typed and left stays; N then Esc costs no undo
  await p.locator('.pz-day.today .pz-trk.none').first().click(); await p.keyboard.type('4199'); await p.locator('.pz-hd h3').click(); await p.waitForTimeout(150);
  ok(await p.locator('.pz-trk .pz-draft').count() === 1, 'a plate typed and left stays in the line, marked');
  const before = (await st()).rows.length; await p.keyboard.press('n'); await p.keyboard.press('Escape'); await p.keyboard.press('Meta+z'); await p.waitForTimeout(150);
  s = await st(); ok(s.rows.some((r) => r.a.some((x) => x.price === 850)) === false && s.rows.length <= before, 'N, Esc, ⌘Z undoes the last real change (the new order), not an empty line');
  // the proposal on the last line stays inside the sheet
  await open(); await p.locator('.pz-row', { hasText: 'HMA 4108' }).last().locator('.pz-side.a').click(); await p.keyboard.type('6814'); await p.waitForTimeout(200);
  const inside = await p.evaluate(() => { const a = document.querySelector('.pz-pop').getBoundingClientRect(), s = document.querySelector('[data-scroll]').getBoundingClientRect(); return a.bottom <= s.bottom + 1 && a.top >= s.top - 1; });
  ok(inside, 'the proposal of the last line opens inside the sheet'); await p.screenshot({ path: process.argv[3] + '/proto-last.png' });
  console.log('errors', errs); await b.close(); })();
