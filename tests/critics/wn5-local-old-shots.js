// Screenshots before / after of item D (owner 25/11): local pickups near Veroia and the old requests' fold, at 1440.
// The SAME synthetic scenario on two trees (rule 8/11: screenshot + table of differences):
//   WN5_SHOT_TAG=before WN5_TREE=<git archive of origin/main> node tests/critics/wn5-local-old-shots.js --shots <dir>
//   WN5_SHOT_TAG=after  node tests/critics/wn5-local-old-shots.js --shots <dir>
// Prints one «FACTS» line per item (the words on screen). Never fails a check. Synthetic data only.
'use strict';
const K = require('./wn5-rig-kit.js');

const TAG = process.env.WN5_SHOT_TAG || 'shot';
const facts = (item, o) => console.log('FACTS ' + TAG + ' ' + item + ' ' + JSON.stringify(o));
// Veroia (1) at 40.52 / 22.20; a pickup 14 km away (6), Athens far (2); coordinates only in the reference LOCATIONS
const COORD = { recJucKOhC1zh4IP3: [40.52, 22.2], recWn5LocAth: [37.98, 23.72], recWn5LocAsp: [38.06, 23.59], recWn5LocLar: [39.64, 22.42],
  recWn5LocThe: [40.64, 22.94], recWn5LocNea: [40.64, 22.25] };
function lookups() {
  const lk = K.clone(K.LOOKUPS);
  lk.locations.push({ id: 6, legacy_id: 'recWn5LocNea', name: 'NEAR TEST', address: 'Test Street 6, 59100', city: 'Veria area', phone: 'TEST-PHONE-06' });
  return lk;
}
const facadeLocs = () => lookups().locations.map((l) => ({ id: l.legacy_id, fields: { Name: l.name, City: l.city, Country: 'GR', Latitude: COORD[l.legacy_id][0], Longitude: COORD[l.legacy_id][1] } }));
function board() {
  const b = K.week();
  const vs = (piece_id, order_id, client, ref, from, day, pallets) => ({ piece_id, shipment_id: piece_id + 1000, kind: 'vs_export', order_id, nat_order_id: null,
    order_stop_id: null, pallets, leave_by: null, position_location_id: from, nat_from_location_id: from, nat_to_location_id: 1, nat_ready_day: day, nat_due_day: day,
    overdue: day < '2026-10-10', is_stock: false, client_id: 41, client, reference: ref, temperature_c: 4, pallet_exchange: false, load_from: null, load_to: null,
    deliver_from: null, deliver_to: null, price: null });
  b.waiting.push(vs(4401, 2401, 'ΠΕΛΑΤΗΣ Α', 'VS-T401', 6, '2026-10-14', 8),      // local pickup this week
    vs(4402, 2402, 'ΠΕΛΑΤΗΣ Γ', 'VS-T402', 2, '2026-10-14', 12),                  // far, this week
    vs(4403, 2403, 'ΠΕΛΑΤΗΣ Β', 'VS-T403', 2, '2026-09-29', 6),                   // old, far
    vs(4404, 2404, 'ΠΕΛΑΤΗΣ Α', 'VS-T404', 3, '2026-10-01', 4));                  // old, far
  return b;
}
const view = (page) => page.evaluate(() => {
  const t = (x) => (x ? x.textContent.replace(/\s+/g, ' ').trim() : null);
  const band = document.querySelector('#content .wn5 .wn5-q');
  return {
    band_head: t(band && band.querySelector('.wi4-q-hd')), band_cards: band ? band.querySelectorAll('.wn5-qcard').length : null,
    groups: [...document.querySelectorAll('#content .wn5 .wn5-dgrp-h')].map(t),
    old_open: (document.querySelector('#content details.wn5-dgrp-old') || {}).open === true,
    rows_visible: [...document.querySelectorAll('#content .wn5-row')].filter((x) => x.getClientRects().length > 0).length,
    tiles: [...document.querySelectorAll('#content .wn5-row .wi4-box.un')].filter((x) => x.getClientRects().length > 0).map(t),
    strips: [...document.querySelectorAll('#content .wn5-strip')].map(t),
  };
});

async function d01({ browser, origin, shots }) {
  const { page } = await K.openApp(browser, origin, { board: board(), lookups: lookups(), facadeLocs: facadeLocs(), viewport: { width: 1440, height: 900 } });
  await page.waitForTimeout(800);   // the reference LOCATIONS land and the board paints again
  facts('01-board', await view(page));
  if (shots) await page.screenshot({ path: `${shots}/${TAG}-01-board.png`, fullPage: true });
  const old = await page.$('#content details.wn5-dgrp-old > summary');
  if (old) await old.click();
  const qo = await page.$('#content button.wn5-q-old');
  if (qo) await qo.click();
  await page.waitForTimeout(200);
  facts('02-old-open', await view(page));
  if (shots) await page.screenshot({ path: `${shots}/${TAG}-02-old-open.png`, fullPage: true });
  await page.context().close();
}

K.run({ scenarios: { d01 }, globals: ['WN5', 'WN5Act'], go: 'screenshots taken (facts printed per item)' });
