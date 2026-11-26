const { chromium } = require('playwright'); const path = require('path');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(1200); const out = process.argv[3];
  const st = () => p.evaluate(() => window.__pz.state());
  const total = (s) => s.rows.reduce((t, r) => t + [...r.k, ...r.a].reduce((u, x) => u + (x.q || 0), 0), 0) + s.store.reduce((t, x) => t + x.q, 0);
  const T0 = total(await st()); await p.screenshot({ path: out + '/proto-rest.png' });
  const line = (plate) => p.locator('.pz-day.today .pz-row', { hasText: plate });
  // 1 his own Excel line, character for character
  await line('HMA 4106').locator('.pz-side.a').click(); await p.keyboard.type('22 Άργος 6814'); await p.waitForTimeout(200);
  const prop = await p.locator('.pz-pop').innerText(); ok(/22\s*Άργος/.test(prop) && /6814/.test(prop) && /μένουν 11/.test(prop), 'own line proposes 22 of the 33 of -6814: ' + prop.replace(/\s+/g, ' '));
  await p.screenshot({ path: out + '/proto-typing.png' }); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  let s = await st(); ok(total(s) === T0, 'pallets conserved after a split (' + total(s) + ')');
  ok(s.rows.some((r) => !r.trk && r.a.some((x) => x.ref === '6814' && x.q === 11)), 'the other 11 stay as a line without a truck');
  await p.screenshot({ path: out + '/proto-added.png' });
  // 2 a reference that does not exist is said, never substituted
  await p.keyboard.type('5 Άργος 1234'); await p.waitForTimeout(150); ok(/δεν βρέθηκε/.test(await p.locator('.pz-pop').innerText()), 'unknown reference says «δεν βρέθηκε»');
  // 3 typed text survives a click elsewhere
  await p.locator('.pz-hd h3').click(); await p.waitForTimeout(150); ok(await p.locator('.pz-draft').count() === 1, 'unfinished text stays in the line, marked');
  // 4 backspace returns the piece to a line without a truck; key repeat does not eat the line
  await line('HMA 4106').locator('.pz-side.a').click(); await p.keyboard.press('Escape'); await p.keyboard.press('Backspace'); await p.waitForTimeout(150);
  s = await st(); ok(total(s) === T0, 'pallets conserved after Backspace (' + total(s) + ')');
  ok(s.rows.some((r) => !r.trk && r.a.some((x) => x.ref === '6814' && x.q === 33)), 'the 22 went back to their line: 33 again');
  await p.keyboard.press('Escape');
  // 5 a past day can be written (record after the fact)
  const past = p.locator('.pz-row.done', { hasText: 'HMA 4103' }).last(); await past.locator('.pz-side.k').click(); ok(await p.locator('.pz-in').count() === 1, 'a past line takes the cursor');
  await p.keyboard.press('Escape');
  // 6 a new line in a day, then a truck
  const before = (await st()).rows.length; await p.locator('.pz-day.today [data-new]').click(); await p.keyboard.type('4108'); await p.waitForTimeout(150);
  await p.screenshot({ path: out + '/proto-newline.png' }); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok((await st()).rows.length === before + 1, 'a new line with HMA 4108 exists in today'); await p.keyboard.press('Escape');
  // 7 the load with no truck joins the truck's own line
  await p.locator('.pz-day.today .pz-row', { hasText: 'Τρίπολη' }).first().locator('.pz-trk.none').click(); await p.keyboard.type('4104'); await p.waitForTimeout(200);
  await p.screenshot({ path: out + '/proto-truck.png' }); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  s = await st(); ok(s.rows.filter((r) => r.day === 'thu' && r.trk && r.trk.i === 3).length === 1 && total(s) === T0, 'one line for HMA 4104 today, pallets conserved');
  await p.screenshot({ path: out + '/proto-joined.png' });
  // 8 undo is always reachable
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.keyboard.press('Meta+z'); await p.waitForTimeout(150);
  ok((await st()).rows.filter((r) => r.day === 'thu' && !r.trk).length >= 3, 'undo after two Esc brings the line without a truck back');
  // 9 a new order in words
  await line('HMA 4104').locator('.pz-side.a').click(); await p.keyboard.type('17 Κασάπης Πάτρα 850'); await p.waitForTimeout(200);
  ok(/νέα/.test(await p.locator('.pz-pop').innerText()), 'words + a price = a new order'); await p.screenshot({ path: out + '/proto-new.png' });
  const h0 = await line('HMA 4104').evaluate((e) => e.offsetHeight); ok(h0 <= 40, 'the line keeps its height while typing (' + h0 + 'px)');
  console.log('errors', errs); await b.close(); })();
