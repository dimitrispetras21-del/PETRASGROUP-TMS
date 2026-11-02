// Rig + shots — «Σύνθεση φορτίων» on the SHARED drafts (102 + Worker #239, owner 2/11), behind localStorage
// tms_wn5_compose = '1'. The real app on a synthetic week (public repo: no real names), 1440×900.
// The fake base (DB below) answers /plan/drafts* as #239 does: plan_drafts_read's shape, plan_h_ok on a write, and a
// refusal as 422 {error:{type:'PLAN_RULE', code, message}} with message = #239's PLAN_RULE_TEXT[code] + « (detail)»,
// read from worker/src/index.js (never retyped). It keeps 102's rules: the version check (draft_stale), one live draft
// per piece (piece_in_draft), the side of the point (draft_side), ack never clears a blocking mark (draft_not_ready),
// realize = EXACTLY the draft's live pieces (draft_pieces), whole pieces with no to_hub (bad_input, owner Ε2).
// Judged by what reached the fake /plan/* (S.plan, «the table») and by the DB after it, never by a screenshot.
// Scenarios: off · drafts (cards, marks, ack, create, move, remove, day, delete, «Δημιουργία όλων» with one draft
// blocked and one refused piece_busy) · anod (Ε2 direct, a draft beyond the week, «παλιό») · two (two users:
// draft_stale and piece_in_draft).
// Usage: node tests/critics/wn5-compose-rig.js [off drafts anod two] [--shots <dir>]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const K = require('./wn5-rig-kit.js');

const SRC = fs.readFileSync(path.join(K.TREE, 'worker/src/index.js'), 'utf8');
const TEXT = (() => { const m = /const PLAN_RULE_TEXT = (\{[\s\S]*?\n\});/.exec(SRC); if (!m) throw new Error('PLAN_RULE_TEXT not found'); return vm.runInNewContext('(' + m[1] + ')'); })();
for (const c of ['draft_gone', 'draft_stale', 'draft_side', 'draft_pieces', 'draft_not_ready', 'draft_piece_missing', 'piece_in_draft', 'piece_busy', 'bad_input']) {
  if (typeof TEXT[c] !== 'string') throw new Error('PLAN_RULE_TEXT has no ' + c + ' (the Worker of #239 is not in this tree)');
}
const TODAY = '2026-10-13';
const HUB = 1;

// ═══ the week ═══
const VS = { kind: 'vs_import', nat_order_id: null, order_stop_id: null, client_id: 42, client: 'ΠΕΛΑΤΗΣ Β', temperature_c: 2, is_stock: false, leave_by: null, overdue: false,
  inbound_rt_id: null, for_split: true, pallet_exchange: false, price: null, position_location_id: 1, nat_from_location_id: 1, load_from: null, load_to: null, deliver_from: null, deliver_to: null };
const NAT = { kind: 'national', order_id: null, order_stop_id: null, client_id: 43, client: 'ΠΕΛΑΤΗΣ Γ', temperature_c: 4, is_stock: false, leave_by: null, overdue: false,
  pallet_exchange: false, price: null, direction: 'ANODOS', deliver_from: null, deliver_to: null };
const vs = (id, ready, due, loc, pal, o) => Object.assign({}, VS, { piece_id: id, shipment_id: id + 1000, order_id: id - 2000, reference: 'VS-T' + id,
  nat_to_location_id: loc, nat_ready_day: ready, nat_due_day: due, pallets: pal }, o || {});
const an = (id, pos, to, pal, day, from, o) => Object.assign({}, NAT, { piece_id: id, shipment_id: id + 1000, nat_order_id: id - 1000, reference: 'N-T' + id, pallets: pal,
  position_location_id: pos, nat_from_location_id: pos, nat_to_location_id: to, nat_ready_day: day, nat_due_day: day,
  load_from: day + 'T' + from + ':00+03:00', load_to: day + 'T' + String(Number(from.slice(0, 2)) + 2).padStart(2, '0') + from.slice(2) + ':00+03:00' }, o || {});
// 4806 was assigned elsewhere since it went into a draft (not on the board any more); 4904 is ready next week (not in
// this week's waiting[]: 072 plan_board reads up to Friday) — the drafts read is the only place that names them
const EXTRA = { 4806: Object.assign(vs(4806, '2026-10-14', '2026-10-15', 2, 7), { at_hub: true }),
  4904: Object.assign(an(4904, 3, 1, 9, '2026-10-17', '08:00'), { at_hub: false }) };
function board() {
  const b = K.week();
  b.hub = [vs(4801, '2026-10-12', '2026-10-13', 4, 6, { overdue: true }), vs(4802, '2026-10-13', '2026-10-14', 2, 8), vs(4803, '2026-10-13', '2026-10-14', 3, 5),
    vs(4804, '2026-10-13', '2026-10-14', 4, 9, { temperature_c: 4 }), vs(4805, '2026-10-15', '2026-10-17', 5, 4), vs(4807, '2026-10-14', '2026-10-15', 3, 6)];
  // ΑΝΟΔΟΣ waiting in the South: 4901 / 4902 end at Veroia, 4903 goes on to Thessaloniki — DIRECT (owner Ε2)
  b.waiting.push(an(4901, 2, 1, 10, '2026-10-14', '08:00'), an(4902, 3, 1, 8, '2026-10-14', '11:00', { temperature_c: 2 }),
    an(4903, 2, 5, 6, '2026-10-14', '09:00', { client: 'ΠΕΛΑΤΗΣ Α', client_id: 41, nat_due_day: '2026-10-15' }));
  return b;
}
const nowOf = (S, id) => {
  const it = [...S.board.hub.map((x) => Object.assign({ at_hub: true }, x)), ...S.board.waiting.map((x) => Object.assign({ at_hub: false }, x))].find((x) => x.piece_id === id);
  return it || (EXTRA[id] ? Object.assign({}, EXTRA[id]) : null);
};
const snapOf = (p) => ({ pallets: p.pallets, position_location_id: p.position_location_id, nat_to_location_id: p.nat_to_location_id,
  nat_ready_day: p.nat_ready_day, nat_due_day: p.nat_due_day, client_id: p.client_id });

// ═══ the fake base: plan_drafts / plan_draft_pieces, shared by every page of a scenario (two users = two pages) ═══
let DB;
function seed() {
  const B = { board: board() }, at = '2026-10-13T08:15:00+03:00';
  const piece = (id, o) => Object.assign({ piece_id: id, snap: snapOf(nowOf(B, id)), state: null, removed: null }, o || {});
  const d = (id, side, day, pieces, o) => Object.assign({ draft_id: id, side, point_location_id: HUB, day, win_from: null, win_to: null, truck_id: null, trailer_id: null,
    driver_id: null, partner_id: null, version: 1, created_by: 'demo_dispatcher', created_at: '2026-10-12T17:00:00+03:00', updated_by: 'demo_dispatcher',
    updated_at: '2026-10-12T17:00:00+03:00', pieces, end: null }, o || {});
  DB = { next: 16, replay: new Map(), audit: [], realize: [], fail: { 13: ['piece_busy', '4807'] }, drafts: [
    // Φορτίο 1: 4803 had 7 pallets when it went in, 5 now (amber, «Εντάξει»); someone else changed it this morning
    d(11, 'KATHODOS', '2026-10-13', [piece(4802), piece(4803, { snap: Object.assign(snapOf(nowOf(B, 4803)), { pallets: 7 }) })],
      { version: 2, updated_by: 'sotiris', updated_at: at }),
    // Φορτίο 2: 4806 was assigned elsewhere — a blocking mark: not ready, never sent by «Δημιουργία όλων»
    d(12, 'KATHODOS', '2026-10-14', [piece(4806, { state: 'assigned' })]),
    d(13, 'KATHODOS', '2026-10-14', [piece(4807)]),
    d(14, 'KATHODOS', '2026-10-16', [piece(4805)]),
    // ΑΝΟΔΟΣ: one for Saturday 17/10 (beyond the week), made 5 days ago — NOT old (Ε4); one for yesterday — old
    d(21, 'ANODOS', '2026-10-17', [piece(4903), piece(4904)], { created_at: '2026-10-08T10:00:00+03:00', updated_at: '2026-10-08T10:00:00+03:00' }),
    d(22, 'ANODOS', '2026-10-12', [piece(4902)])] };
}
const live = (d) => !d.end;
const lp = (d) => d.pieces.filter((p) => !p.removed);
// 102 v_plan_draft_piece_state: the state NOW against the snap
function state(S, p) {
  const n = nowOf(S, p.piece_id);
  if (p.state) return { state: p.state, changed: [], blocking: ['dead', 'split', 'assigned', 'moved'].includes(p.state), piece: n };
  if (!n) return { state: 'dead', changed: [], blocking: true, piece: null };
  const ch = ['pallets', 'nat_to_location_id', 'nat_ready_day', 'nat_due_day', 'client_id'].filter((f) => n[f] !== p.snap[f]);
  if (n.position_location_id !== p.snap.position_location_id) return { state: 'moved', changed: ch, blocking: true, piece: n };
  return { state: ch.length ? 'changed' : 'ok', changed: ch, blocking: false, piece: n };
}
function json(S, d) {
  const ps = lp(d).map((p) => { const s = state(S, p); return { piece_id: p.piece_id, state: s.state, changed: s.changed, blocking: s.blocking, snap: p.snap, piece: s.piece }; });
  const o = {};
  for (const k of ['draft_id', 'side', 'point_location_id', 'day', 'win_from', 'win_to', 'truck_id', 'trailer_id', 'driver_id', 'partner_id', 'version', 'created_by', 'created_at', 'updated_by', 'updated_at']) o[k] = d[k];
  return Object.assign(o, { old: d.day < TODAY, ready: ps.length > 0 && !ps.some((p) => p.blocking), pieces: ps });
}
const rule = (code, detail) => [422, { error: { type: 'PLAN_RULE', code, message: detail ? `${TEXT[code]} (${detail})` : TEXT[code] } }];
const ok200 = (op, ids) => [200, { ok: true, op, dry_run: false, ids, warnings: [], notice_ids: [] }];
class Refuse extends Error { constructor(code, detail) { super(code); this.r = rule(code, detail); } }
const keys = (o, allowed) => { for (const k of Object.keys(o || {})) if (!allowed.includes(k)) throw new Refuse('bad_input', 'unknown key ' + k); };
function lock(id, version) {
  const d = DB.drafts.find((x) => x.draft_id === id);
  if (typeof version !== 'number') throw new Refuse('bad_input', 'version');
  if (!d || !live(d)) throw new Refuse('draft_gone', String(id));
  if (d.version !== version) throw new Refuse('draft_stale', d.draft_id + ':' + d.version);
  d.before = JSON.parse(JSON.stringify(Object.assign({}, d, { before: undefined })));   // 102: the audit's before = the row as locked
  return d;
}
function touch(d, actor, what) {
  const before = d.before;
  d.version += 1; d.updated_by = actor; d.updated_at = new Date(Date.parse(K.NOW) + DB.audit.length * 60000).toISOString();
  DB.audit.push({ draft: d.draft_id, at: d.updated_at, actor, role: 'dispatcher', action: 'update', table: 'plan_drafts', record_id: String(d.draft_id), before, after: JSON.parse(JSON.stringify(Object.assign({}, d, { before: undefined }))), what });
}
function add(S, d, id, actor, snap) {
  const n = nowOf(S, id);
  if (!n) throw new Refuse('piece_dead', String(id));
  const other = DB.drafts.find((x) => live(x) && lp(x).some((p) => p.piece_id === id));
  if (other) throw new Refuse('piece_in_draft', id + ':' + other.draft_id + (other === d ? ':same' : ''));
  if ((d.side === 'KATHODOS') !== (n.position_location_id === d.point_location_id)) throw new Refuse('draft_side', id + ':' + d.side);
  d.pieces.push({ piece_id: id, snap: snap || snapOf(n), state: null, removed: null });
  DB.audit.push({ draft: d.draft_id, at: K.NOW, actor, role: 'dispatcher', action: 'create', table: 'plan_draft_pieces', record_id: String(id), before: null, after: { piece_id: id } });
}
// the realized load onto the board (as 083 new_rt.later + 072): no vehicle, its stops and legs, the pieces off waiting
function write(S, body) {
  const side = body.target.side, rt = 900 + DB.realize.length;
  let sid = 9000 + rt * 10, lid = 9500 + rt * 10;
  const stops = body.stops.map((s, i) => Object.assign(K.stop(sid++, i + 1, side, s.location_id, s.planned_from, s.planned_to, []), { has_vehicle: false }));
  const at = (loc) => stops.find((x) => x.location_id === loc);
  for (const p of body.pieces) {
    const it = nowOf(S, p.piece_id);
    const o = { kind: it.kind, order_id: it.order_id, nat_order_id: it.nat_order_id, reference: it.reference, client: it.client, client_id: it.client_id, temperature_c: it.temperature_c };
    const l = lid++, pick = at(it.position_location_id), drop = at(it.nat_to_location_id);
    if (pick) pick.legs.push(K.leg(l, it.piece_id, 'load', it.pallets, o));
    if (drop) drop.legs.push(K.leg(l, it.piece_id, 'unload', it.pallets, o));
  }
  stops.sort((a, z) => Date.parse(a.planned_from) - Date.parse(z.planned_from)).forEach((s, i) => { s.seq = i + 1; });
  S.board.cycles.push({ rt_id: rt, code: 'RT-T' + rt, trip_type: 'OWNED', truck_id: null, truck: null, trailer_id: null, trailer: null, driver_id: null, driver: null,
    partner_id: null, partner: null, partner_rate: null, start_at: stops[0].planned_from, end_at: stops[stops.length - 1].planned_to, date_start: stops[0].stop_day,
    date_end: stops[stops.length - 1].stop_day, ended: false, stops });
  const ids = new Set(body.pieces.map((p) => p.piece_id));
  S.board.hub = S.board.hub.filter((h) => !ids.has(h.piece_id));
  S.board.waiting = S.board.waiting.filter((w) => !ids.has(w.piece_id));
  return rt;
}
// one handler for every /plan/drafts* route, as PLAN_ROUTES of #239 maps them; actor = the page's user
function drafts(actor) {
  return async (e, S) => {
    const m = e.m, p = e.path, b = e.body || {};
    let x;
    try {
      if (m === 'GET' && p === '/plan/drafts') {
        if (Object.keys(e.q).some((k) => k !== 'point')) return [400, { error: { type: 'CLIENT', code: 'bad_point', message: 'rig: bad point' } }];
        const pt = e.q.point == null ? null : Number(e.q.point);
        return [200, { point_location_id: pt, today: TODAY, drafts: DB.drafts.filter((d) => live(d) && (pt == null || d.point_location_id === pt))
          .sort((a, z) => a.day.localeCompare(z.day) || a.draft_id - z.draft_id).map((d) => json(S, d)) }];
      }
      if (m === 'GET' && (x = /^\/plan\/drafts\/(\d+)\/history$/.exec(p))) {
        const id = Number(x[1]);
        if (!DB.drafts.some((d) => d.draft_id === id)) throw new Refuse('draft_gone', String(id));
        return [200, { draft_id: id, rows: DB.audit.filter((a) => a.draft === id).map((a) => ({ at: a.at, actor: a.actor, role: a.role, action: a.action, table: a.table, record_id: a.record_id, before: a.before, after: a.after })) }];
      }
      if (m === 'POST' && p === '/plan/drafts') {
        keys(b, ['side', 'point_location_id', 'day', 'win', 'vehicle', 'pieces', 'request_id']);
        if (DB.replay.has(b.request_id)) return DB.replay.get(b.request_id);
        if (!['KATHODOS', 'ANODOS'].includes(b.side) || !/^\d{4}-\d{2}-\d{2}$/.test(b.day || '')) throw new Refuse('bad_input', 'side/day');
        const d = { draft_id: DB.next++, side: b.side, point_location_id: b.point_location_id, day: b.day, win_from: null, win_to: null, truck_id: null, trailer_id: null,
          driver_id: null, partner_id: null, version: 1, created_by: actor, created_at: K.NOW, updated_by: actor, updated_at: K.NOW, pieces: [], end: null };
        const before = DB.drafts.length;
        DB.drafts.push(d);
        try { for (const it of b.pieces || []) { keys(it, ['piece_id']); add(S, d, it.piece_id, actor); } } catch (err) { DB.drafts.length = before; DB.next--; throw err; }   // one transaction
        DB.audit.push({ draft: d.draft_id, at: K.NOW, actor, role: 'dispatcher', action: 'create', table: 'plan_drafts', record_id: String(d.draft_id), before: null, after: { day: d.day } });
        const r = ok200('plan_draft_create', { draft_id: d.draft_id, version: 1 });
        DB.replay.set(b.request_id, r);
        return r;
      }
      if (m === 'POST' && p === '/plan/drafts/move') {
        keys(b, ['piece_ids', 'from', 'to']);
        const A = lock(b.from.draft_id, b.from.version), Z = lock(b.to.draft_id, b.to.version);
        if (A.side !== Z.side) throw new Refuse('draft_side', A.draft_id + ':' + Z.draft_id);
        for (const id of b.piece_ids) {
          const r = lp(A).find((q) => q.piece_id === id);
          if (!r) throw new Refuse('draft_piece_missing', id + ':' + A.draft_id);
          r.removed = 'moved';
          add(S, Z, id, actor, r.snap);
        }
        touch(A, actor, 'move out'); touch(Z, actor, 'move in');
        return ok200('plan_draft_move', { from: { draft_id: A.draft_id, version: A.version }, to: { draft_id: Z.draft_id, version: Z.version } });
      }
      if (m === 'PATCH' && (x = /^\/plan\/drafts\/(\d+)$/.exec(p))) {
        keys(b, ['version', 'day', 'win', 'vehicle']);
        const d = lock(Number(x[1]), b.version);
        if ('day' in b) d.day = b.day;
        if ('win' in b) { d.win_from = b.win ? b.win.from : null; d.win_to = b.win ? b.win.to : null; }
        if ('vehicle' in b) { const v = b.vehicle || {}; d.truck_id = v.truck_id || null; d.trailer_id = v.trailer_id || null; d.driver_id = v.driver_id || null; d.partner_id = v.partner_id || null; }
        touch(d, actor, 'update');
        return ok200('plan_draft_update', { draft_id: d.draft_id, version: d.version });
      }
      if (m === 'POST' && (x = /^\/plan\/drafts\/(\d+)\/pieces$/.exec(p))) {
        keys(b, ['version', 'add', 'remove', 'ack']);
        const d = lock(Number(x[1]), b.version);
        for (const id of b.remove || []) { const r = lp(d).find((q) => q.piece_id === id); if (!r) throw new Refuse('draft_piece_missing', id + ':' + d.draft_id); r.removed = 'manual'; }
        for (const id of b.ack || []) {
          const r = lp(d).find((q) => q.piece_id === id);
          if (!r) throw new Refuse('draft_piece_missing', id + ':' + d.draft_id);
          if (state(S, r).blocking) throw new Refuse('draft_not_ready', id + ':ack');
          r.snap = snapOf(nowOf(S, id));
        }
        for (const it of b.add || []) { keys(it, ['piece_id']); add(S, d, it.piece_id, actor); }
        touch(d, actor, 'pieces');
        return ok200('plan_draft_pieces', { draft_id: d.draft_id, version: d.version });
      }
      if (m === 'POST' && (x = /^\/plan\/drafts\/(\d+)\/delete$/.exec(p))) {
        keys(b, ['version', 'reason']);
        const d = lock(Number(x[1]), b.version);
        const n = lp(d).length;
        for (const r of lp(d)) r.removed = 'draft_deleted';
        d.end = 'deleted';
        touch(d, actor, 'delete');
        return ok200('plan_draft_delete', { draft_id: d.draft_id, pieces_released: n });
      }
      if (m === 'POST' && (x = /^\/plan\/drafts\/(\d+)\/realize$/.exec(p))) {
        keys(b, ['version', 'legs', 'request_id']);
        if (DB.replay.has(b.request_id)) return DB.replay.get(b.request_id);
        const d = lock(Number(x[1]), b.version), l = b.legs || {};
        keys(l, ['pieces', 'target', 'stops']);
        for (const it of l.pieces || []) keys(it, ['piece_id', 'pickup', 'drop']);   // to_hub = bad_input (owner Ε2)
        const have = lp(d).map((q) => q.piece_id).sort(), sent = (l.pieces || []).map((q) => q.piece_id).sort();
        if (!have.length) throw new Refuse('draft_empty', String(d.draft_id));
        if (JSON.stringify(have) !== JSON.stringify(sent)) throw new Refuse('draft_pieces', String(d.draft_id));
        const bad = lp(d).find((q) => state(S, q).blocking);
        if (bad) throw new Refuse('draft_not_ready', bad.piece_id + ':' + state(S, bad).state);
        if (!l.target || l.target.side !== d.side) throw new Refuse('bad_input', 'legs.target.side');
        if (DB.fail[d.draft_id]) throw new Refuse(...DB.fail[d.draft_id]);   // 072 plan_h_put's own refusal, as the base would
        const rt = write(S, l);
        for (const r of lp(d)) r.removed = 'realized';
        d.end = 'realized';
        DB.realize.push({ draft_id: d.draft_id, rt });
        touch(d, actor, 'realize');
        const r = ok200('plan_draft_realize', { draft_id: d.draft_id, rt_id: rt, stop_ids: [], leg_ids: [], piece_ids: sent });
        DB.replay.set(b.request_id, r);
        return r;
      }
      return [404, { error: { type: 'CLIENT', code: 'not_found', message: 'rig: no route ' + m + ' ' + p } }];
    } catch (err) {
      if (err instanceof Refuse) return err.r;
      throw err;
    }
  };
}
async function open(browser, origin, flag, role) {
  const actor = 'demo_' + (role || 'dispatcher');
  const h = drafts(actor);
  // every /plan/drafts* path to the one handler (the kit looks a route up by its exact path)
  const plan = new Proxy({}, { get: (t, k) => (typeof k === 'string' && / \/plan\/drafts(\/|$)/.test(k) ? h : undefined) });
  const o = await K.openApp(browser, origin, { board: board(), viewport: { width: 1440, height: 900 }, plan, role });
  await o.page.evaluate((f) => { if (f) localStorage.setItem('tms_wn5_compose', '1'); else localStorage.removeItem('tms_wn5_compose'); }, flag);
  await o.page.reload();
  await o.page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  if (flag) await o.page.waitForFunction(() => / πρόχειρα/.test((document.querySelector('#wn5-hub') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
  o.S.plan.length = 0;
  return o;
}
const txt = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);
const writes = (S) => S.plan.filter((x) => x.m !== 'GET');
const reads = (S, after) => S.plan.filter((x) => x.m === 'GET' && x.path === '/plan/drafts' && x.at >= after).length;
const card = (id) => `#wn5-hub .wn5-cd[data-draft="${id}"]`;
async function openPanel(page, side) {
  await page.click('#wn5-hub [data-cmp="open"]');
  if (side === 'ANODOS') await page.click('#wn5-hub .wn5-cmp-tab[data-side="ANODOS"]');
  await page.evaluate(() => document.getElementById('wn5-hub').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(150);
}

async function off({ browser, origin, ok, scn }) {
  seed();
  const { page, S } = await open(browser, origin, false);
  await page.waitForTimeout(400);
  const t = await txt(page, '#wn5-hub');
  ok(scn, 'flag off: the Veroia board as it is («ΒΕΡΟΙΑ», no «ΣΥΝΘΕΣΗ»)', !!t && /^ΒΕΡΟΙΑ/.test(t) && !/ΣΥΝΘΕΣΗ/.test(t), t);
  ok(scn, 'flag off: no GET /plan/drafts, no «σε πρόχειρο» on the Weekly', !S.plan.some((x) => /^\/plan\/drafts/.test(x.path)) && !(await K.count(page, '.wn5-indraft')), S.plan.map((x) => x.path));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

async function draftsScn({ browser, origin, ok, scn, shots }) {
  seed();
  const { page, S } = await open(browser, origin, true);
  const line = await txt(page, '#wn5-hub');
  ok(scn, 'closed: «ΣΥΝΘΕΣΗ ΦΟΡΤΙΩΝ · ΚΑΘΟΔΟΣ 2 στη Βέροια · 15π · ΑΝΟΔΟΣ 1 προς Βέροια · 10π · 6 πρόχειρα» (parts in drafts are not listed again)',
    /^ΣΥΝΘΕΣΗ ΦΟΡΤΙΩΝ · ΚΑΘΟΔΟΣ 2 στη Βέροια · 15π · ΑΝΟΔΟΣ 1 προς Βέροια · 10π · 6 πρόχειρα/.test(line || ''), line);
  // Ε1: the ΑΝΟΔΟΣ parts in a draft stay ΠΡΟΣ ΑΝΑΘΕΣΗ rows of the Weekly, with «σε πρόχειρο»; the one not in a draft has none
  const e1 = await page.evaluate(() => [4901, 4902, 4903].map((id) => { const r = document.querySelector(`#content .wn5-row[data-piece="${id}"]`); const m = r && r.querySelector('.wn5-indraft');
    return { id, row: !!r && /ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(r.textContent), mark: !!m && !m.hidden && m.textContent.trim() }; }));
  ok(scn, 'Ε1: 4902 / 4903 (in drafts) are ΠΡΟΣ ΑΝΑΘΕΣΗ rows with «σε πρόχειρο»; 4901 (no draft) is a row without it',
    JSON.stringify(e1) === JSON.stringify([{ id: 4901, row: true, mark: false }, { id: 4902, row: true, mark: 'σε πρόχειρο' }, { id: 4903, row: true, mark: 'σε πρόχειρο' }]), e1);
  if (shots) {
    await page.evaluate(() => { const r = document.querySelector('#content .wn5-row[data-piece="4903"]'); if (r) r.scrollIntoView({ block: 'center' }); });
    await page.screenshot({ path: `${shots}/drafts-0-weekly-mark.png` });
    await page.evaluate(() => document.getElementById('wn5-hub').scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${shots}/drafts-1-closed.png` });
  }
  await openPanel(page, 'KATHODOS');
  ok(scn, 'Ε1: every drafts read so far asked no point (every point: the marks need all)', S.plan.filter((x) => x.path === '/plan/drafts').every((x) => !('point' in x.q)), S.plan.map((x) => x.path + JSON.stringify(x.q)));
  const cards = await page.evaluate(() => [...document.querySelectorAll('#wn5-hub .wn5-cd')].map((c) => ({ id: Number(c.dataset.draft), n: c.querySelector('.wn5-cd-n').textContent,
    who: c.querySelector('.wn5-cd-who').textContent, go: !c.querySelector('[data-cd="realize"]').disabled, blk: c.querySelectorAll('.wn5-cd-p.blk').length,
    chg: (c.querySelector('.wn5-cd-chg') || {}).textContent || '', why: c.querySelector('[data-cwhy]').textContent })));
  ok(scn, 'ΚΑΘΟΔΟΣ: four cards «Φορτίο 1…4» in the read\'s order (day, id)', JSON.stringify(cards.map((c) => [c.id, c.n])) === '[[11,"Φορτίο 1"],[12,"Φορτίο 2"],[13,"Φορτίο 3"],[14,"Φορτίο 4"]]', cards);
  ok(scn, 'Φορτίο 1: who wrote last («αλλαγή: sotiris Τρί 13/10 08:15»); the amber «7 → 5 παλέτες» on 4803, still ready', !!cards[0] && /αλλαγή: sotiris Τρί 13\/10 08:15/.test(cards[0].who) && /7 → 5 παλέτες/.test(cards[0].chg) && cards[0].go, cards[0]);
  ok(scn, 'Φορτίο 2: a thin red bar «ανατέθηκε αλλού» on 4806, «Δημιουργία» off, «Λείπει: 1 φορτίο να βγει»', !!cards[1] && cards[1].blk === 1 && !cards[1].go && /1 φορτίο να βγει/.test(cards[1].why), cards[1]);
  const all0 = await txt(page, '#wn5-hub [data-cmp="all"]');
  ok(scn, '«Δημιουργία όλων (3 έτοιμα)»: the blocked draft does not count', all0 === 'Δημιουργία όλων (3 έτοιμα)', all0);
  if (shots) await page.screenshot({ path: `${shots}/drafts-2-cards.png` });

  // «Εντάξει» on the amber change: POST /pieces {version, ack}, then a fresh read
  let t0 = Date.now() - S.t0;
  await page.click(`${card(11)} [data-cd="ack"]`);
  await page.waitForTimeout(500);
  let w = writes(S);
  ok(scn, '«Εντάξει»: ONE POST /plan/drafts/11/pieces {version: 2, ack: [4803]}, a fresh read after, the amber mark gone',
    w.length === 1 && w[0].path === '/plan/drafts/11/pieces' && JSON.stringify(w[0].body) === '{"version":2,"ack":[4803]}' && reads(S, t0) >= 1 && !(await K.count(page, `${card(11)} .wn5-cd-chg`)), w.map((x) => x.raw));

  // tick 4801 + 4804 → «+ φορτίο με 2»: POST /plan/drafts with a request_id, the default day today (4801's day passed)
  S.plan.length = 0;
  await page.click('#wn5-hub .wn5-cr[data-piece="4801"] .wn5-hub-ck');
  await page.click('#wn5-hub .wn5-cr[data-piece="4804"] .wn5-hub-ck');
  const nb = await txt(page, '#wn5-hub [data-cmp="new"]');
  await page.click('#wn5-hub [data-cmp="new"]');
  await page.waitForTimeout(500);
  w = writes(S);
  const cb = w[0] && w[0].body;
  ok(scn, `«${nb}»: ONE POST /plan/drafts {side KATHODOS, point 1, day ${TODAY}, the two pieces} + a uuid request_id`, w.length === 1 && w[0].path === '/plan/drafts' && !!cb
    && cb.side === 'KATHODOS' && cb.point_location_id === 1 && cb.day === TODAY && JSON.stringify(cb.pieces) === '[{"piece_id":4801},{"piece_id":4804}]' && K.UUID4.test(cb.request_id || ''), w.map((x) => x.raw));
  const nd = await page.evaluate(() => ({ left: [...document.querySelectorAll('#wn5-hub .wn5-cr')].map((r) => Number(r.dataset.piece)), c16: !!document.querySelector('#wn5-hub .wn5-cd[data-draft="16"]') }));
  ok(scn, 'the new draft is a card; its parts left the list (one place only)', nd.c16 && !nd.left.includes(4801) && !nd.left.includes(4804), nd);

  // move 4804 from the new draft to the one with 4805 (draft 14): ONE call with both versions
  S.plan.length = 0;
  await page.hover(`${card(16)} .wn5-cd-p[data-piece="4804"]`);
  await page.selectOption(`${card(16)} .wn5-cd-p[data-piece="4804"] .wn5-cd-mv`, '14');
  await page.waitForTimeout(500);
  w = writes(S);
  ok(scn, 'move: ONE POST /plan/drafts/move {piece_ids [4804], from {16, v1}, to {14, v1}}', w.length === 1 && w[0].path === '/plan/drafts/move'
    && JSON.stringify(w[0].body) === '{"piece_ids":[4804],"from":{"draft_id":16,"version":1},"to":{"draft_id":14,"version":1}}', w.map((x) => x.raw));
  // × on 4801 = back to the list
  S.plan.length = 0;
  await page.hover(`${card(16)} .wn5-cd-p[data-piece="4801"]`);
  await page.click(`${card(16)} .wn5-cd-p[data-piece="4801"] [data-cd="remove"]`);
  await page.waitForTimeout(500);
  w = writes(S);
  ok(scn, '×: ONE POST /plan/drafts/16/pieces {version 2, remove [4801]}; 4801 back on the list', w.length === 1 && JSON.stringify(w[0].body) === '{"version":2,"remove":[4801]}'
    && !!(await K.count(page, '#wn5-hub .wn5-cr[data-piece="4801"]')), w.map((x) => x.raw));
  // the day of a draft, any day (beyond the week too)
  S.plan.length = 0;
  await page.fill(`${card(16)} .wn5-cd-day`, '2026-10-19');
  await page.dispatchEvent(`${card(16)} .wn5-cd-day`, 'change');
  await page.waitForTimeout(500);
  w = writes(S);
  ok(scn, 'day: ONE PATCH /plan/drafts/16 {version 3, day 2026-10-19} (next week: a draft is built days ahead)', w.length === 1 && w[0].m === 'PATCH' && JSON.stringify(w[0].body) === '{"version":3,"day":"2026-10-19"}', w.map((x) => x.raw));
  // history: who / when / what, read from the base
  await page.click(`${card(16)} [data-cd="tools"]`);
  await page.click(`${card(16)} [data-cd="hist"]`);
  await page.waitForTimeout(400);
  const hist = await txt(page, `${card(16)} .wn5-cd-hist`);
  ok(scn, '«Ιστορικό»: GET /plan/drafts/16/history, a line per change with the person', S.plan.some((x) => x.m === 'GET' && x.path === '/plan/drafts/16/history') && /demo_dispatcher/.test(hist || '') && /ημέρα/.test(hist || ''), hist);
  if (shots) await page.screenshot({ path: `${shots}/drafts-3-tools.png` });
  // Ε3: delete, a second press; soft in the base
  S.plan.length = 0;
  await page.click(`${card(16)} [data-cd="delete"]`);
  const sure = await txt(page, `${card(16)} [data-cd="delete"]`);
  await page.click(`${card(16)} [data-cd="delete"]`);
  await page.waitForTimeout(500);
  w = writes(S);
  ok(scn, `Ε3 «Διαγραφή» → «${sure}» → ONE POST /plan/drafts/16/delete {version 4}; the card gone, the draft soft-deleted in the base`,
    sure === 'Σίγουρα; Διαγραφή' && w.length === 1 && w[0].path === '/plan/drafts/16/delete' && JSON.stringify(w[0].body) === '{"version":4}'
    && !(await K.count(page, card(16))) && DB.drafts.find((d) => d.draft_id === 16).end === 'deleted', w.map((x) => x.raw));

  // «Δημιουργία όλων»: one realize per ready draft, in order, its own request_id; 13 refused by the base (piece_busy)
  S.plan.length = 0;
  const all1 = await txt(page, '#wn5-hub [data-cmp="all"]');
  await page.click('#wn5-hub [data-cmp="all"]');
  await page.waitForFunction(() => !!document.querySelector('#wn5-hub .wn5-cmp-res'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const rz = S.plan.filter((x) => x.m === 'POST' && /\/realize$/.test(x.path));
  const ids = rz.map((x) => Number(x.path.split('/')[3]));
  const rids = rz.map((x) => x.body.request_id);
  ok(scn, `«${all1}»: realize 11, 13, 14 in that order — never 12 (blocked)`, all1 === 'Δημιουργία όλων (3 έτοιμα)' && JSON.stringify(ids) === '[11,13,14]', ids);
  ok(scn, 'each realize: its own uuid request_id, the version it read, legs = {pieces, target, stops} of the engine', rids.length === 3 && rids.every((r) => K.UUID4.test(r || '')) && new Set(rids).size === 3
    && rz.every((x) => typeof x.body.version === 'number' && JSON.stringify(Object.keys(x.body.legs).sort()) === '["pieces","stops","target"]'), rz.map((x) => x.raw));
  const b11 = rz[0] && rz[0].body.legs;
  ok(scn, 'Φορτίο 1: legs.pieces = exactly its parts (4802, 4803), whole, no to_hub; target new_rt {later} ΚΑΘΟΔΟΣ', !!b11 && JSON.stringify(b11.pieces) === '[{"piece_id":4802},{"piece_id":4803}]'
    && JSON.stringify(b11.target) === JSON.stringify({ new_rt: { trip_type: 'OWNED', later: true }, side: 'KATHODOS' }), b11);
  const res = await page.evaluate(() => [...document.querySelectorAll('#wn5-hub .wn5-cmp-res > li')].map((l) => ({ ok: l.className, t: l.textContent })));
  // the one that stayed is named by its number NOW (Φορτίο 2 once 11 and 14 became loads), each with its day
  ok(scn, 'a result per load: ✓ Φορτίο 1 · Τρί 13/10 → προς ανάθεση · ✗ Φορτίο 2 · Τετ 14/10: #239\'s piece_busy text + code — μένει πρόχειρο · ✓ Φορτίο 4 · Παρ 16/10', res.length === 3
    && res[0].ok === 'ok' && /^✓ Φορτίο 1 · Τρί 13\/10 → προς ανάθεση/.test(res[0].t) && res[1].ok === 'no' && /^✗ Φορτίο 2 · Τετ 14\/10: /.test(res[1].t) && res[1].t.includes(TEXT.piece_busy)
    && /μένει πρόχειρο/.test(res[1].t) && /piece_busy$/.test(res[1].t) && res[2].ok === 'ok' && /^✓ Φορτίο 4 · Παρ 16\/10 → προς ανάθεση/.test(res[2].t), res);
  const left = await page.evaluate(() => [...document.querySelectorAll('#wn5-hub .wn5-cd')].map((c) => Number(c.dataset.draft)));
  ok(scn, 'after: the board read again, the drafts read again — 12 and 13 stay drafts, 11 and 14 realized in the base', JSON.stringify(left) === '[12,13]'
    && S.plan.some((x) => x.m === 'GET' && x.path === '/plan/board') && JSON.stringify(DB.realize.map((r) => r.draft_id)) === '[11,14]', { left, realize: DB.realize });
  const rows = await page.evaluate(() => [...document.querySelectorAll('#content .wn5-row[data-rt]')].filter((r) => Number(r.dataset.rt) >= 900).map((r) => /ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(r.textContent)));
  ok(scn, 'the two new loads are ΠΡΟΣ ΑΝΑΘΕΣΗ rows of the Weekly', rows.length === 2 && rows.every(Boolean), rows);
  if (shots) { await page.evaluate(() => document.getElementById('wn5-hub').scrollIntoView({ block: 'start' })); await page.screenshot({ path: `${shots}/drafts-4-realize-all.png` }); }
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

async function anod({ browser, origin, ok, scn, shots }) {
  seed();
  const { page, S } = await open(browser, origin, true);
  await openPanel(page, 'ANODOS');
  const c = await page.evaluate(() => [...document.querySelectorAll('#wn5-hub .wn5-cd')].map((x) => ({ id: Number(x.dataset.draft), day: x.querySelector('.wn5-cd-day').value, old: !!x.querySelector('.wn5-cd-old'),
    parts: [...x.querySelectorAll('.wn5-cd-p')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()) })));
  ok(scn, 'Ε4: the draft for yesterday is «παλιό», the one for Saturday 17/10 made five days ago is not', c.length === 2 && c[0].id === 22 && c[0].old && c[1].id === 21 && !c[1].old, c);
  ok(scn, 'Ε2: 4903 says «→ Thessaloniki» (direct, no «μέσω Βέροιας»); 4904 (next week, not on this board) is listed from the read', !!c[1] && c[1].parts.length === 2
    && c[1].parts.some((t) => /→ Thessaloniki/.test(t)) && !c[1].parts.some((t) => /μέσω/.test(t)), c[1]);
  if (shots) await page.screenshot({ path: `${shots}/anod-1-cards.png` });
  const stand = await page.evaluate(() => WN5.state().board.waiting.some((w) => w.piece_id === 4904));
  ok(scn, 'the part beyond the week never stays in the board (it stands in only inside the engine call)', !stand, stand);
  S.plan.length = 0;
  await page.click(`${card(21)} [data-cd="realize"]`);
  await page.waitForFunction(() => !!document.querySelector('#wn5-hub .wn5-cmp-res'), null, { timeout: 8000 }).catch(() => {});
  const rz = S.plan.filter((x) => x.m === 'POST' && /\/realize$/.test(x.path));
  const l = rz[0] && rz[0].body.legs;
  ok(scn, 'Ε2: ONE realize of 21, pieces [4903, 4904] with no to_hub, target ΑΝΟΔΟΣ new_rt {later}', rz.length === 1 && rz[0].path === '/plan/drafts/21/realize' && !!l
    && JSON.stringify(l.pieces) === '[{"piece_id":4903},{"piece_id":4904}]' && !JSON.stringify(l).includes('to_hub') && l.target.side === 'ANODOS' && l.target.new_rt.later === true, rz.map((x) => x.raw));
  const locs = l ? [...new Set(l.stops.map((s) => s.location_id))].sort() : [];
  ok(scn, 'Ε2: stops = the two pickups (2, 3), Thessaloniki (5) direct for 4903, Veroia (1) only for 4904 that ends there', JSON.stringify(locs) === '[1,2,3,5]', l && l.stops);
  const res = await txt(page, '#wn5-hub .wn5-cmp-res');
  ok(scn, 'the result line «✓ Φορτίο 2 · Σάβ 17/10 → προς ανάθεση»; the draft realized in the base', /✓ Φορτίο 2 · Σάβ 17\/10 → προς ανάθεση/.test(res || '') && DB.realize.some((r) => r.draft_id === 21), res);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// two people on one base: B writes, A still holds the older version
async function two({ browser, origin, ok, scn, shots }) {
  seed();
  const A = await open(browser, origin, true, 'dispatcher'), B = await open(browser, origin, true, 'management');
  await openPanel(A.page, 'KATHODOS');
  await openPanel(B.page, 'KATHODOS');
  // B takes 4802 out of Φορτίο 1 (version 2 → 3)
  await B.page.hover(`${card(11)} .wn5-cd-p[data-piece="4802"]`);
  await B.page.click(`${card(11)} .wn5-cd-p[data-piece="4802"] [data-cd="remove"]`);
  await B.page.waitForTimeout(500);
  const v = DB.drafts.find((d) => d.draft_id === 11);
  ok(scn, 'B: the remove went in (Φορτίο 1 now version 3, written by demo_management)', v.version === 3 && v.updated_by === 'demo_management', { version: v.version, by: v.updated_by });
  // A, on its older screen, changes the day of Φορτίο 1
  const t0 = Date.now() - A.S.t0;
  const day0 = v.day;
  await A.page.fill(`${card(11)} .wn5-cd-day`, '2026-10-15');
  await A.page.dispatchEvent(`${card(11)} .wn5-cd-day`, 'change');
  await A.page.waitForTimeout(600);
  const pw = writes(A.S).filter((x) => x.at >= t0);
  const msg = await txt(A.page, `${card(11)} .wn5-cmp-msg`);
  ok(scn, 'A: ONE PATCH with the version it read (2) → 422 draft_stale; nothing written (day and version as B left them)', pw.length === 1 && pw[0].body.version === 2 && pw[0].status === 422
    && v.day === day0 && v.version === 3, { w: pw.map((x) => [x.raw, x.status]), day: v.day, version: v.version });
  ok(scn, 'A: «Φορτίο 1 άλλαξε από άλλον (demo_management, Τρί 13/10 …) — ξαναφόρτωσε», with the code', /^Φορτίο 1 άλλαξε από άλλον \(demo_management, Τρί 13\/10 \d\d:\d\d\) — ξαναφόρτωσε/.test(msg || '') && /draft_stale$/.test(msg || ''), msg);
  const parts = await A.page.evaluate((s) => [...document.querySelectorAll(s + ' .wn5-cd-p')].map((p) => Number(p.dataset.piece)), card(11));
  ok(scn, 'A: a fresh read after the refusal — the card shows B\'s change (4803 only)', reads(A.S, t0) >= 1 && JSON.stringify(parts) === '[4803]', { parts, reads: reads(A.S, t0) });
  if (shots) await A.page.screenshot({ path: `${shots}/two-1-stale.png` });
  // A again, now on the fresh version: it goes in
  const t1 = Date.now() - A.S.t0;
  await A.page.fill(`${card(11)} .wn5-cd-day`, '2026-10-15');
  await A.page.dispatchEvent(`${card(11)} .wn5-cd-day`, 'change');
  await A.page.waitForTimeout(500);
  const pw2 = writes(A.S).filter((x) => x.at >= t1);
  ok(scn, 'A: the next press sends version 3 and goes in (version 4, day 15/10)', pw2.length === 1 && pw2[0].body.version === 3 && pw2[0].status === 200 && v.version === 4 && v.day === '2026-10-15', pw2.map((x) => [x.raw, x.status]));
  // piece_in_draft: both tick 4801; B adds it to the draft of 16/10 (14) first, then A to Φορτίο 1
  await B.page.click('#wn5-hub .wn5-cr[data-piece="4801"] .wn5-hub-ck');
  await B.page.click(`${card(14)} [data-cd="add"]`);
  await B.page.waitForTimeout(500);
  await A.page.click('#wn5-hub .wn5-cr[data-piece="4801"] .wn5-hub-ck');
  const t2 = Date.now() - A.S.t0;
  await A.page.click(`${card(11)} [data-cd="add"]`);
  await A.page.waitForTimeout(600);
  const aw = writes(A.S).filter((x) => x.at >= t2);
  const m2 = await txt(A.page, `${card(11)} .wn5-cmp-msg`);
  const n14 = await txt(A.page, `${card(14)} .wn5-cd-n`);
  ok(scn, `A: the add → 422 piece_in_draft; the screen names the draft in words («Είναι ήδη στο ${n14}»), with #239's text and the code`, aw.length === 1 && aw[0].status === 422
    && (m2 || '').startsWith('Είναι ήδη στο ' + n14 + ' · ') && (m2 || '').includes(TEXT.piece_in_draft + ' (4801:14)') && /piece_in_draft$/.test(m2 || ''), { m2, w: aw.map((x) => [x.raw, x.status]) });
  ok(scn, 'no page errors (A, B)', !A.S.pageErrors.length && !B.S.pageErrors.length, [A.S.pageErrors, B.S.pageErrors]);
  await A.page.context().close();
  await B.page.context().close();
}

K.run({ scenarios: { off, drafts: draftsScn, anod, two }, globals: ['WN5', 'WN5Hub', 'WN5Compose'],
  go: '«Σύνθεση φορτίων» on shared drafts: cards, Ε1 marks, every write with its version, «Δημιουργία όλων» per draft (one blocked, one refused), Ε2 direct, Ε4 old, two users (draft_stale, piece_in_draft)' });
