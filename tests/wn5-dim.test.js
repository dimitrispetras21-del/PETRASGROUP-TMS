// node --test tests/wn5-dim.test.js
// National v5 F4α Task T6 — executed = 40% by DAY (owner 21–22/10, Figma 2035:7735, rule 2036:7735). The screen
// follows ONLY the base's flags (v_rt_stop_state.dim / side_dim / cycle_dim, copied by WN5L): a past stop the base
// calls not dim stays bold, a future one it calls dim dims — no date is compared on screen (S-89). On top, the
// owner's «ποτέ σβηστό ό,τι θέλει δουλειά»: a load waiting for a vehicle, a cycle without one and a late stop never
// dim, even when a corrupt answer says so. The REAL wi4-logic, wn5-logic and weekly_natl_v5 run in a vm.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/wn5-week.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const cyc = (b, id) => b.cycles.find((c) => c.rt_id === id);
const stop = (b, rt, id) => cyc(b, rt).stops.find((s) => s.stop_id === id);
function html(board, narrow) {
  const store = new Map();
  const ctx = { console: { log() {}, warn() {}, error() {} }, location: { search: '', href: 'https://x/app.html' }, history: { state: null, replaceState() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null } };
  ctx.window = ctx;
  // ≤1600px: one stop per point column (WN5 _visPts reads window.matchMedia)
  if (narrow) ctx.matchMedia = () => ({ matches: true });
  vm.createContext(ctx);
  for (const f of ['core/wi4-logic.js', 'core/wn5-logic.js', 'modules/weekly_natl_v5.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  assert.ok(ctx.WN5 && typeof ctx.WN5._html === 'function', 'renderer _html not found in modules/weekly_natl_v5.js (WN5._html)');
  return ctx.WN5._html(ctx.WN5L.model(board, { today: '2026-10-13' }));
}
const byKey = (h) => new Map(h.split('<div class="wn5-row').slice(1).map((s) => '<div class="wn5-row' + s).map((r) => [(/data-key="([^"]+)"/.exec(r) || [])[1], r]));
const cell = (chunk, cls) => { const m = new RegExp(`<div class="${cls}">([\\s\\S]*?)</div>`).exec(chunk || ''); return m ? m[1] : ''; };

test('F4α-T6: dim class follows the server flags only (stop with past day and dim:false stays bold)', () => {
  const by = byKey(html(FIX));
  assert.match(by.get('rt:101'), /^<div class="wn5-row wn5-dim"/, 'row 1: the whole cycle is executed (cycle_dim)');
  const r102 = by.get('rt:102');
  assert.ok(!/^<div class="wn5-row[^"]*wn5-dim/.test(r102), 'row 102 is not wholly executed');
  assert.match(cell(r102, 'wn5-kd'), /wi4-dc past wn5-dim/, 'its Monday chip dims');
  assert.match(cell(r102, 'wn5-fl'), /<span class="wn5-vh wn5-dim">Βέροια<\/span><span class="wn5-vtime wn5-dim">16:00–18:00/, '«Βέροια» and its window dim');
  assert.ok(!/wn5-dim/.test(cell(r102, 'wn5-kto')), 'the Tuesday deliveries stay bold');
  const b = clone(FIX);
  stop(b, 102, 1101).dim = false;      // a past Veroia loading the base calls not dim
  stop(b, 105, 1403).dim = true;       // a future delivery the base calls dim
  const by2 = byKey(html(b));
  assert.ok(!/wn5-dim/.test(cell(by2.get('rt:102'), 'wn5-fl')) && !/wn5-dim/.test(cell(by2.get('rt:102'), 'wn5-kd')), 'a past stop with dim:false must stay bold');
  assert.match(cell(by2.get('rt:105'), 'wn5-kto'), /class="wi4-pt wn5-pt wn5-dim" data-stop="1403"/, 'a stop the base calls dim must dim');
});

test('F4α-T6: unassigned / late / VS without truck never get .wn5-dim even with dim:true in a corrupt fixture', () => {
  const b = clone(FIX);
  stop(b, 104, 1303).dim = true;                                                          // the late stop
  for (const s of cyc(b, 108).stops) { s.dim = true; s.side_dim = true; s.cycle_dim = true; }   // no vehicle
  const by = byKey(html(b));
  assert.match(by.get('rt:101'), /wn5-dim/, 'a legit executed row must still dim (the guard is not «never dim»)');
  assert.match(cell(by.get('rt:104'), 'wn5-kd'), /wn5-dim/, 'the Monday head of the partner row still dims');
  assert.ok(!/wn5-dim" data-stop="1303"/.test(by.get('rt:104')), 'the late stop dimmed');
  assert.ok(!/wn5-dim/.test(by.get('rt:108')), 'a cycle without a vehicle dimmed');
  for (const k of ['wait:4101', 'wait:4103', 'wait:4104', 'wait:4105']) assert.ok(!/wn5-dim/.test(by.get(k)), k + ' dimmed');
});

test('F4α-T6: at ≤1600 (one slot) a late stop is drawn, never folded into a grey «+N» (rule 2036:7735)', () => {
  const kto = cell(byKey(html(FIX, true)).get('rt:104'), 'wn5-kto');
  assert.match(kto, /class="wi4-pt wn5-pt wn5-late" data-stop="1303"/, 'the late stop of RT-T104 is not drawn at ≤1600');
  assert.ok(!/data-stop="1302"/.test(kto), 'one slot at ≤1600: the on-time stop goes behind «+N»');
  assert.match(kto, /<span class="wi4-more" title="1\. [^"]*"><b>\+1<\/b>/, 'the folded stop keeps its own number 1 in the «+N» title');
  // more late stops than slots: the chip that holds one carries the amber
  const b = clone(FIX);
  stop(b, 104, 1302).has_late = true;
  const kto2 = cell(byKey(html(b, true)).get('rt:104'), 'wn5-kto');
  assert.match(kto2, /<span class="wi4-more wn5-late" title=/, 'a hidden late stop leaves the «+N» grey');
});
