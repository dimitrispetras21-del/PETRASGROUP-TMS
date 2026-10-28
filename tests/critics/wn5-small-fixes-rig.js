// Rig — National v5, owner findings of the real-user test of 28/10 (docs/sessions/2026-10-28-dimitris-v5-real-user-test.md),
// the front-end ones: F22 (a leg click after a week change «does nothing»), F25 (a tab keeps an old day L), long place
// names, a folded day that looks emptied, F18 («Εύρεση συντεταγμένων» by the address first). Judged by what reached the
// fake /plan/* and Nominatim (S.plan, the request log) and by the DOM; never by a screenshot. Synthetic data only.
// Usage: node tests/critics/wn5-small-fixes-rig.js [f22 f25 names fold f18]
//        WN5_TREE=<git archive origin/main> node tests/critics/wn5-small-fixes-rig.js   (plain-main proof: NO-GO, exit 1)
// Exit: 0 green · 1 a check failed · 2 unknown scenario.
'use strict';
const K = require('./wn5-rig-kit.js');

const NOW_MS = Date.parse(K.NOW);
const mk = (w, add) => { const b = K.week(); b.week = w; for (const c of b.cycles) { c.rt_id += add; c.code += '-' + add; } return b; };
const toasts = (page) => page.evaluate(() => (window.__ev || []).filter((x) => x.k === 'toast').map((x) => String(x.a[0])));
const boards = (S) => K.planOf(S, 'GET', '/plan/board');

// F22: a heavy week — its first read lands, every re-read (the leg form's, one per click) is the base's timeout.
async function f22({ browser, origin, ok, scn }) {
  const B = { '2026-10-10': mk('2026-10-10', 0), '2026-10-17': mk('2026-10-17', 100) };
  const cnt = {};
  const { page, S } = await K.openApp(browser, origin, { plan: {
    'GET /plan/board': async (e) => {
      const w = e.q.week; const n = cnt[w] = (cnt[w] || 0) + 1;
      if (w === '2026-10-17' && n >= 2) { await K.sleep(1500); return K.planErr(503, 'SERVER', 'slow'); }
      return [200, B[w] || Object.assign(K.week(), { week: w, cycles: [], waiting: [] })];
    },
    'GET /plan/config': async () => [200, { cutover_day: '2026-10-10', opened_at: '2026-10-08T12:00:00Z', writes_open: true }] } });
  await page.waitForTimeout(600);
  // the open reads the board once: a PlanConfig 'after' on the v5 board already drawn repaints the bar only
  ok(scn, 'the app open reads GET /plan/board once (was twice ~40 ms apart)', boards(S).length === 1, boards(S).map((x) => x.at + 'ms'));
  await page.click('#wn5-top .wi4-tab[data-w="43"]');
  await page.waitForFunction(() => document.querySelector('#content .wn5[data-state="ok"][data-week="2026-10-17"]'), null, { timeout: 8000 });
  const st = await page.evaluate(() => ({ snap: WN5.snapshot().week, board: WN5.state().board && WN5.state().board.week, rows: [...document.querySelectorAll('#content .wn5-row[data-rt]')].map((r) => r.dataset.rt) }));
  ok(scn, 'after the tab: the state is the week on screen (W43)', st.snap === '2026-10-17' && st.board === '2026-10-17' && st.rows.join() === '201,202', st);
  const before = boards(S).length;
  await page.click('#content .wn5-row[data-rt="201"] .wn5-fl');
  await page.waitForTimeout(150);
  const busy = await page.evaluate(() => { const r = document.querySelector('#content .wn5-row[data-rt="201"]'); return { cls: !!r && r.classList.contains('wn5-leg-busy'), aria: r && r.getAttribute('aria-busy') }; });
  ok(scn, 'the clicked row says at once that it is reading (.wn5-leg-busy, aria-busy)', busy.cls && busy.aria === 'true', busy);
  // a click on ANOTHER row while the read runs is told why it waits (never a silent nothing)
  await page.click('#content .wn5-row[data-rt="202"] .wn5-afl', { force: true }).catch(() => {});
  await page.waitForTimeout(100);
  const other = await toasts(page);
  ok(scn, 'a click on another row during the read says it waits', other.some((t) => /Ανοίγει ήδη ένα άλλο σκέλος/.test(t)), other);
  // an impatient second and third click while the read runs: still ONE read
  await page.click('#content .wn5-row[data-rt="201"] .wn5-kto', { force: true }).catch(() => {});
  await page.click('#content .wn5-row[data-rt="201"] .wn5-kpal', { force: true }).catch(() => {});
  await page.waitForTimeout(2500);
  ok(scn, 'three clicks during one slow read = one GET /plan/board', boards(S).length - before === 1, boards(S).slice(before).map((x) => x.at + 'ms ' + x.status));
  const ts = await toasts(page);
  ok(scn, 'the failed read is said as such («ο πίνακας δεν ξαναδιαβάστηκε … ο κύκλος υπάρχει»), with the base\'s message',
    ts.some((t) => /Το σκέλος δεν άνοιξε: ο πίνακας δεν ξαναδιαβάστηκε \(rig sentinel slow\)/.test(t)), ts);
  // ONE #toast (core/ui.js): what stays on screen is the read failure, never «Ο κύκλος δεν βρέθηκε»
  const shown = await page.evaluate(() => { const t = document.getElementById('toast'); return t ? t.textContent : ''; });
  ok(scn, 'the toast left on screen is the read failure, not «δεν βρέθηκε»', /δεν ξαναδιαβάστηκε/.test(shown) && !/δεν βρέθηκε/.test(shown), shown);
  const after = await page.evaluate(() => { const r = document.querySelector('#content .wn5-row[data-rt="201"]'); return { busy: !!r && r.classList.contains('wn5-leg-busy'), strip: !!document.querySelector('#content .wn5-strip') }; });
  ok(scn, 'the row is no longer busy and the board\'s error strip is on screen', !after.busy && after.strip, after);
  await page.context().close();
}

// F25: a tab opened before day L moved. «Παλιά προβολή» stored; L 17/10 at open → W42 shows the OLD board; the base
// then says 10/10 (079 moved it). The page must notice at its next render after 5 min, and at once on ↻.
async function f25({ browser, origin, ok, scn }) {
  let day = '2026-10-17';
  const { page, S } = await K.openApp(browser, origin, { plan: {
    'GET /plan/config': async () => [200, { cutover_day: day, opened_at: '2026-10-08T12:00:00Z', writes_open: true }] } });
  await page.evaluate(() => { localStorage.setItem('tms_wn5', '0'); return renderWeeklyNatl(); });
  await page.waitForTimeout(800);
  ok(scn, 'precondition: with «Παλιά προβολή» and L 17/10 the week of 10/10 is on the old board', !(await K.count(page, '#content > .wn5')));
  day = '2026-10-10';
  const cfg0 = K.planOf(S, 'GET', '/plan/config').length;
  await page.clock.setFixedTime(new Date(NOW_MS + 6 * 60 * 1000));
  await page.evaluate(() => renderWeeklyNatl());   // what a week tab or a save does
  await page.waitForTimeout(400);
  await page.evaluate(() => renderWeeklyNatl());   // the next render after the recheck landed
  try { await page.waitForFunction(() => document.querySelector('#content > .wn5[data-state="ok"]'), null, { timeout: 5000 }); } catch (_) { /* judged below */ }
  ok(scn, 'GET /plan/config asked again after 5 min', K.planOf(S, 'GET', '/plan/config').length > cfg0, K.planOf(S, 'GET', '/plan/config').length);
  ok(scn, 'the week ≥ the new L is the v5 board now (the old view is set aside)', (await K.count(page, '#content > .wn5')) === 1);
  let ts = await toasts(page);
  ok(scn, 'the move is said: «Η ημέρα μετάβασης εθνικών άλλαξε: 17/10 → 10/10»', ts.some((t) => /άλλαξε: 17\/10 → 10\/10/.test(t)), ts);
  // ↻ asks at once (no 5 min wait)
  day = '2026-10-03';
  const cfg1 = K.planOf(S, 'GET', '/plan/config').length;
  await page.click('#wn5-top .wn5-upd', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(800);
  ok(scn, '↻ asks GET /plan/config at once', K.planOf(S, 'GET', '/plan/config').length > cfg1);
  ts = await toasts(page);
  ok(scn, '↻ finds the next move: «10/10 → 3/10»', ts.some((t) => /άλλαξε: 10\/10 → 3\/10/.test(t)), ts);
  await page.context().close();
}

// Long names: at most two lines, then «…»; the whole stop in the point's title.
async function names({ browser, origin, ok, scn }) {
  const LONG = 'ASPROPYRGOS TEST LOGISTICS CENTRE OF A VERY LONG SYNTHETIC COMPANY NAME BUILDING B GATE 4';
  const lookups = K.clone(K.LOOKUPS);
  lookups.locations.find((l) => l.id === 3).name = LONG;
  const { page } = await K.openApp(browser, origin, { lookups, viewport: { width: 1440, height: 900 } });
  await page.waitForTimeout(400);
  const r = await page.evaluate((long) => [...document.querySelectorAll('#content .wn5 .wn5-pt[data-stop] > .wi4-l1')].map((el) => {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || 14;
    const pt = el.closest('.wn5-pt');
    return { t: el.textContent, lines: Math.round(el.getBoundingClientRect().height / lh), clamp: cs.webkitLineClamp, cut: el.scrollHeight > el.clientHeight + 1,
      title: pt.getAttribute('title') || '', long: el.textContent === long };
  }), LONG);
  const longs = r.filter((x) => x.long);
  ok(scn, 'the long place is on the board', longs.length >= 1, r.map((x) => x.t));
  ok(scn, 'no place line is taller than two lines', r.every((x) => x.lines <= 2), r.map((x) => `${x.lines} · ${x.t.slice(0, 30)}`));
  ok(scn, 'the long one is cut with the clamp (-webkit-line-clamp 2, content longer than the box)', longs.every((x) => x.clamp === '2' && x.cut), longs);
  ok(scn, 'the whole name is in the point\'s title', longs.every((x) => x.title.startsWith(LONG)), longs.map((x) => x.title));
  await page.context().close();
}

// A folded day says what it hides; a click on that line opens it again.
async function fold({ browser, origin, ok, scn }) {
  const { page } = await K.openApp(browser, origin);
  const d = await page.evaluate(() => {
    const sec = [...document.querySelectorAll('#content .wn5-day')].find((s) => s.querySelector('.wn5-row'));
    return { date: sec.dataset.date, rows: sec.querySelectorAll('.wn5-row').length };
  });
  await page.click(`#content .wn5-day[data-date="${d.date}"] > .wn5-dayh`);
  const c = await page.evaluate((date) => {
    const sec = document.querySelector(`#content .wn5-day[data-date="${date}"]`);
    const h = sec.querySelector('.wn5-dayhid');
    return { closed: sec.classList.contains('closed'), text: h ? h.textContent : null, seen: !!h && h.getBoundingClientRect().width > 0 && getComputedStyle(h).display !== 'none' };
  }, d.date);
  const want = `▸ ${d.rows} ${d.rows === 1 ? 'γραμμή κρυμμένη' : 'γραμμές κρυμμένες'} · άνοιγμα`;
  ok(scn, `the folded day says «${want}»`, c.closed && c.seen && c.text === want, c);
  const open = await K.count(page, '#content .wn5-day:not(.closed) .wn5-dayhid');
  const hidden = await page.evaluate(() => [...document.querySelectorAll('#content .wn5-day:not(.closed) .wn5-dayhid')].every((h) => getComputedStyle(h).display === 'none'));
  ok(scn, 'an open day shows no such line', hidden, open);
  if (c.seen) await page.click(`#content .wn5-day[data-date="${d.date}"] .wn5-dayhid`);
  const re = await page.evaluate((date) => !document.querySelector(`#content .wn5-day[data-date="${date}"]`).classList.contains('closed'), d.date);
  ok(scn, 'a click on it opens the day again', re);
  await page.context().close();
}

// F18: the address first, then name + city, and the person is told which one matched.
async function f18({ browser, origin, ok, scn }) {
  const { page } = await K.openApp(browser, origin);
  const asked = [];
  let mode = 'house';
  await page.route('**/nominatim.openstreetmap.org/**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    asked.push(q);
    const byAddr = /Test Street 9/.test(q);
    if (byAddr && mode === 'netfail') return route.abort('timedout');   // the address search never gets an answer
    if (!byAddr && mode === 'netfail') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' });
    let body = [];
    if (byAddr && mode === 'house') body = [{ lat: '40.111111', lon: '22.111111', addresstype: 'building', class: 'building', display_name: 'Test Street 9, Larisa, Greece', address: { house_number: '9' } }];
    // an OSM address node: class «place», type «house» (code review: the address-first try must take it)
    if (byAddr && mode === 'node') body = [{ lat: '40.333333', lon: '22.333333', class: 'place', type: 'house', addresstype: 'place', display_name: 'Test Street 9, Larisa, Greece', address: { house_number: '9' } }];
    // OpenStreetMap text is anybody's: it must reach the toast as text
    if (byAddr && mode === 'html') body = [{ lat: '40.444444', lon: '22.444444', addresstype: 'building', class: 'building', display_name: '<img src=x id=rigx onerror="window.__rigx=1">, Larisa', address: { house_number: '9' } }];
    if (byAddr && mode === 'road') body = [{ lat: '40.5', lon: '22.5', addresstype: 'road', class: 'highway', display_name: 'Test Street, Larisa, Greece', address: {} }];
    if (!byAddr && mode !== 'none') body = [{ lat: '39.222222', lon: '21.222222', addresstype: 'industrial', class: 'landuse', display_name: 'Synthetic Depot, Larisa, Greece', address: {} }];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await page.evaluate(() => navigate('locations'));
  await page.waitForTimeout(500);
  const run = async (m) => {
    mode = m; asked.length = 0;
    await page.evaluate(() => { const ev = window.__ev || []; ev.length = 0; });
    await page.evaluate(() => _locOpenCreate());
    await page.waitForSelector('#locF_name', { timeout: 5000 });
    await page.fill('#locF_name', 'SYNTHETIC DEPOT');
    await page.fill('#locF_city', 'Larisa');
    await page.fill('#locF_address', 'Test Street 9, 41222');
    await page.waitForTimeout(150);
    await page.click('#locGeoBtn');
    await page.waitForTimeout(600);
    const v = await page.evaluate(() => ({ lat: document.getElementById('locF_lat').value, lon: document.getElementById('locF_lon').value }));
    const ts = await toasts(page);
    await page.evaluate(() => closeModal());
    return { v, ts, asked: asked.slice() };
  };
  let r = await run('house');
  ok(scn, 'address + city first (the first Nominatim query is the address)', /^Test Street 9, 41222, Larisa/.test(r.asked[0] || ''), r.asked);
  ok(scn, 'the address hit fills the pin (40.111111 / 22.111111)', r.v.lat === '40.111111' && r.v.lon === '22.111111', r.v);
  ok(scn, 'it says the address matched', r.ts.some((t) => /βρέθηκαν από τη διεύθυνση: Test Street 9/.test(t)), r.ts);
  r = await run('node');
  ok(scn, 'an OSM address node (class place, type house) is the address hit', r.v.lat === '40.333333' && r.asked.length === 1, r);
  r = await run('html');
  const x = await page.evaluate(() => ({ js: !!window.__rigx, el: !!document.getElementById('rigx') }));
  ok(scn, 'the found text is shown as text, never as HTML', r.v.lat === '40.444444' && !x.js && !x.el && r.ts.some((t) => t.includes('&lt;img')), { x, ts: r.ts });
  r = await run('road');
  ok(scn, 'an address that only finds the road falls back to name + city', r.asked.length === 2 && /^SYNTHETIC DEPOT, Larisa/.test(r.asked[1] || '') && r.v.lat === '39.222222', r);
  ok(scn, 'it says name + city matched', r.ts.some((t) => /βρέθηκαν από όνομα \+ πόλη/.test(t)), r.ts);
  r = await run('netfail');
  ok(scn, 'an address search that never ran is not reported as «nothing found» for the address', r.v.lat === ''
    && r.ts.some((t) => /Δεν βρέθηκε αποτέλεσμα \(όνομα \+ πόλη\) · η αναζήτηση με τη διεύθυνση δεν ολοκληρώθηκε/.test(t)), r.ts);
  r = await run('none');
  ok(scn, 'nothing found: says which searches ran, no pin', r.v.lat === '' && r.ts.some((t) => /Δεν βρέθηκε αποτέλεσμα \(τη διεύθυνση, όνομα \+ πόλη\)/.test(t)), r);
  await page.context().close();
}

K.run({ scenarios: { f22, f25, names, fold, f18 }, globals: ['WN5', 'PlanConfig'],
  go: 'F22 / F25 / long names / folded day / F18 hold' });
