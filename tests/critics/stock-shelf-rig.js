// Rig: Weekly International «ΑΠΟΘΕΜΑ» (stock lots Φ1, plan stock-lots-v5 §6.8).
//
// Usage (cwd = the MAIN repo root: it holds node_modules and .har/):
//   node <worktree>/tests/critics/stock-shelf-rig.js <baseURL> <outDir>
// baseURL serves the code under test (e.g. python3 -m http.server on the
// worktree). Reference data (trucks, drivers, partners, locations, clients)
// replays from the 28/8 HAR (tests/critics/auth.js); ORDERS, STOCK LOTS and
// LOCAL_MOVES are answered by an in-memory facade below, so every write the
// board makes is CAPTURED, never sent anywhere.
//
// The REAL OrdersStock (core/orders-common.js) runs; the rig stops loudly if it
// is missing. The piece FORM is always replaced by a stub that "saves" at once —
// POST of the real OrdersStock.pieceFields(...) then the _wiOnPieceSaved hook,
// the contract's order — because the real modal would wait for a human and
// block every later click (it did, 4/10: «modalOverlay intercepts pointer
// events»). The real form's own path is covered by the FRONT-ORDERS rig.
//
// Screens at 1440: shelf with 2 lots · no shelf · read failure · management
// (chip panel without buttons) · fullscreen · the «+ Κομμάτι» panel · a lot
// with no piece drawn offering «Κλείσιμο υπολοίπου». Payloads: Case A lone
// import, Case A group with «|», Case B (its hook 35 min late, and off the
// board), loose-piece join, return to stock, reorder then «Ακύρωση groupage»
// of the member the export points at, a DB refusal (422 STOCK_RULE) reaching
// the screen in Greek, the counters without lots/loose pieces, the lot drag
// refusal.
//
// Round 0 of the impact map (4/10) adds: ⎙I prints the whole import group
// (PR-01), the matched-import menu finds the group by any member (PR-02), the
// week print and CSV name pieces and lots (PR-10, B-25), the lone-lead lock
// only after the piece exists (B-04), «Επιστροφή» of a lone piece clears its
// group and sends the round-trip leg DELETE before the vehicle PATCH (B-04a,
// D-23 — /costs and /pallets/gate are answered by the facade below), no piece
// on a partner on any path (B-05), «×» returns a piece to stock (B-07), no
// «Groupage εισαγωγών» for a piece (B-09), no Undo left after a stock action
// (B-13), loose pieces only on the shelf (B-19), Case A refused on a moving
// import (B-22), no «Σπάσιμο σκέλους» on a piece or lot (B-28), no [Διαγραφή]
// on a matched piece (DL-06), and the three data-independent changes proven
// with FEATURES.STOCK_LOTS = false (G-42).
//
// Round 1 (critics 1/3/4/5, 4/10) adds: the compact chip and a flag only for a
// problem (W1), the red flag only from «Pieces Moving» (D3, absent → no red),
// «ΑΠΟΘΕΜΑ · N» lists every lot, the loose button hidden at 0 and «εκπρόθεσμα»
// (C1-02); the lot panel without repeats or zero lines, close primary only
// when asked, «Άνοιγμα παρτίδας» (W2); the lot badge without pallets (W3); the
// words (W4); a re-read of the lead before the join, lost answers decided by a
// read, no join on a truckless lead (W5, Σ-01/Σ-07); D1 — a stale Group ID is
// not a truck (W6); a lot on our own truck gets the lot menu (W7); a DB refusal
// on screen once (W8, D2); prints (W9: C4-06, C4-07, K11); the auto-match
// count and no piece in a rewritten suffix (W10: K9, K10); «ή κομμάτι από
// ΑΠΟΘΕΜΑ» in an empty return box (W11, C1-05).
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '../..');
const req = m => require(require.resolve(m, { paths: [process.cwd(), ROOT] }));
const { chromium } = req('playwright');
const { preparePage, gotoPage } = require(path.join(__dirname, 'auth.js'));
let [,, baseURL, outDir] = process.argv;
const MAIN = require.main === module;
if (MAIN) {
  if (!baseURL || !outDir) { console.error('usage: node stock-shelf-rig.js <baseURL> <outDir>'); process.exit(2); }
  fs.mkdirSync(outDir, { recursive: true });
}
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const ORDERS = 'tblgHlNmLBH3JTdIM', LOTS = 'tblStockLots';

// Bridge to the closest RECORDED request (same as rota-matched-import-rig):
// the app asks for more fields[] than on 28/8 (e.g. truck expiries), so an
// exact-URL replay aborts and the whole reference preload fails. Same path,
// same params except fields[] and dates → the recording with the most fields
// in common is replayed instead.
const { repair } = require(path.join(__dirname, 'repair-har.js'));
const DATE_RE = /\d{4}-\d{2}-\d{2}/g;
const keyOf = u => { const x = new URL(u); return x.pathname + '?' + [...x.searchParams.entries()].filter(([k]) => k !== 'fields[]').map(([k, v]) => k + '=' + v.replace(DATE_RE, 'D')).sort().join('&'); };
const fieldsOf = u => new Set(new URL(u).searchParams.getAll('fields[]'));
let _idx = null;
function harIndex() {
  if (_idx) return _idx;
  const all = new Set(), byKey = new Map();
  for (const e of JSON.parse(fs.readFileSync(repair(), 'utf8')).log.entries) {
    if (!e.request.url.includes(HOST) || e.request.method !== 'GET') continue;
    all.add(e.request.url);
    const k = keyOf(e.request.url); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(e.request.url);
  }
  return (_idx = { all, byKey });
}
function bridge(route) {
  const r = route.request(); const { all, byKey } = harIndex();
  if (r.method() !== 'GET' || all.has(r.url())) return route.fallback();
  const cands = byKey.get(keyOf(r.url())) || [];
  if (!cands.length) return route.fallback();            // auth.js aborts it: unknown stays loud
  const want = fieldsOf(r.url()); let best = null, bestN = -1;
  for (const c of cands) { const n = [...fieldsOf(c)].filter(f => want.has(f)).length; if (n > bestN) { bestN = n; best = c; } }
  return route.fallback({ url: best });
}

// ── in-memory facade ─────────────────────────────────────────────────────────
const athensYmd = d => { if (!d) return ''; const t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString('sv-SE', { timeZone: 'Europe/Athens' }); };
function makeFacade() {
  // noMoving: the Worker does not serve «Pieces Moving» yet (D3 fallback).
  // lose: {recId, n} — the PATCH lands but its answer is lost n times (Σ-07);
  // loseNextPost: the same for the next created piece's first PATCHes.
  const F = { orders: {}, lots: {}, writes: [], unknown: [], failLots: false, refuse: null, refusePost: null, seq: 0, rt: null, costsOther: [],
    noMoving: false, lose: null, loseNextPost: false };
  const nos = {}; let nextNo = 1000;
  F.no = id => { const m = /LOT[A-Z]0*(\d+)$/.exec(id); return m ? +m[1] : (nos[id] || (nos[id] = ++nextNo)); };
  const isEmpty = v => v == null || (Array.isArray(v) && !v.length);
  const pals = f => { let s = 0; for (let i = 1; i <= 10; i++) s += +(f['Loading Pallets ' + i] || 0); return s; };
  const link = v => Array.isArray(v) ? v[0] : (v || null);
  const lotOfOrder = id => Object.values(F.lots).find(l => link(l.fields.Order) === id);
  const pieces = lotId => Object.values(F.orders).filter(o => !o.deleted && link(o.fields['Stock Lot']) === lotId);
  // Read shape of the facade: NULL / empty links are ABSENT (CLAUDE.md trap 2),
  // computed labels come from the read view.
  F.read = o => {
    const f = {};
    for (const [k, v] of Object.entries(o.fields)) if (!isEmpty(v)) f[k] = v;
    f['Total Pallets'] = pals(o.fields);
    // 'Order No' = the order's id (order_no = id on all 283 live rows, SELECT
    // 4/10): a lot's rec ends in its number (…LOTA0000312 = #312), every
    // other order gets its own number from 1001 on.
    f['Order No'] = F.no(o.id);
    const lp = link(o.fields['Stock Lot']);
    if (lp && F.lots[lp]) { f['Stock Lot Order No'] = F.lots[lp].fields['Lot No']; f['Stock Lot Source'] = 'intl'; }
    const own = lotOfOrder(o.id); if (own) f['Own Stock Lot'] = own.id;
    return { id: o.id, createdTime: '2026-10-01T00:00:00.000Z', fields: f };
  };
  // stock_v_lots, computed from the orders like the view does.
  F.readLot = l => {
    const f = Object.assign({}, l.fields);
    const ps = pieces(l.id);
    const drawn = ps.reduce((s, p) => s + pals(p.fields), 0);
    f['Drawn Pallets'] = drawn; f['Remaining Pallets'] = f['Stock Pallets'] - drawn;
    f['Pieces'] = ps.length;
    f['Pieces Delivered'] = ps.filter(p => p.fields.Status === 'Delivered').length;
    // D1 (round 1): on a truck = Truck or Partner, nothing else (stock_v_pieces.on_truck).
    f['Pieces Without Truck'] = ps.filter(p => !link(p.fields.Truck) && !link(p.fields.Partner) && p.fields.Status !== 'Delivered').length;
    // D3 (round 1): stock_v_lots.pieces_moving — In Transit/Delivered with a
    // loading day before today (the S-06 threshold); absent while not served.
    if (!F.noMoving) f['Pieces Moving'] = ps.filter(p => ['In Transit', 'Delivered'].includes(p.fields.Status) && athensYmd(p.fields['Loading DateTime']) < athensYmd(new Date())).length;
    f['Complete'] = false; f['Invoiced'] = false;
    for (const k of Object.keys(f)) if (f[k] == null) delete f[k];
    return { id: l.id, fields: f };
  };
  F.list = (table, formula) => {
    const fm = formula || '';
    if (table === LOTS) {
      const all = Object.values(F.lots).map(F.readLot);
      let m = /RECORD_ID\(\)\s*=\s*['"]([^'"]+)['"]/.exec(fm);
      if (m) return all.filter(l => l.id === m[1]);
      if (/\{Complete\}\s*=\s*0/.test(fm)) return all.filter(l => !l.fields.Complete);
      if (!fm) return all;
      F.unknown.push(table + ' ' + fm); return [];
    }
    const live = Object.values(F.orders).filter(o => !o.deleted);
    let m;
    if (/\{Week Number\}/.test(fm)) return [];
    if (/\{Direction\}='Export'/.test(fm)) return live.filter(o => o.fields.Direction === 'Export').map(F.read);
    if (/\{Direction\}='Import'/.test(fm)) return live.filter(o => o.fields.Direction === 'Import').map(F.read);
    if ((m = /^\{Group ID\}='([^']*)'$/.exec(fm))) return live.filter(o => o.fields['Group ID'] === m[1]).map(F.read);
    if ((m = /^\{Matched Import ID\}='([^']*)'$/.exec(fm))) return live.filter(o => o.fields['Matched Import ID'] === m[1]).map(F.read);
    if ((m = /FIND\("([^"]+)",ARRAYJOIN\(\{Stock Lot\},","\)\)>0/.exec(fm))) return pieces(m[1]).map(F.read);
    if (/\{Stock Lot\}!=BLANK\(\)/.test(fm)) return live.filter(o => link(o.fields['Stock Lot']) && !link(o.fields.Truck) && !link(o.fields.Partner) && o.fields.Status !== 'Delivered').map(F.read);
    if ((m = /RECORD_ID\(\)\s*=\s*['"]([^'"]+)['"]/.exec(fm))) return live.filter(o => o.id === m[1]).map(F.read);
    F.unknown.push(table + ' ' + fm); return [];
  };
  F.patch = (id, fields) => {
    const o = F.orders[id]; if (!o) return null;
    for (const [k, v] of Object.entries(fields)) { if (isEmpty(v)) delete o.fields[k]; else o.fields[k] = v; }
    return F.read(o);
  };
  // Round trips, just enough for _wiRtLeave (core/rt-feed.js rtFindForOrder →
  // /pallets/gate → /costs/rt, then DELETE /costs/rt/<id>/legs). F.rt = null:
  // no round trip anywhere. The DELETE lands in F.writes, so its place among
  // the ORDERS writes is the proof of «leg first, vehicle second» (D-23).
  F.costs = (m, url) => {
    const p = url.pathname;
    if (p === '/pallets/gate') { const pg = F.rt && F.rt.pg[url.searchParams.get('order_recs')]; return { records: pg != null ? [{ order_id: pg }] : [] }; }
    if (p === '/costs/rt' && m === 'GET') return { records: F.rt ? [{ id: F.rt.id, code: F.rt.code, status: 'planned', ct_rt_legs: F.rt.legs.map(order_id => ({ order_id })) }] : [] };
    const lg = /^\/costs\/rt\/(\d+)\/legs$/.exec(p);
    if (lg && m === 'DELETE') {
      const pg = +url.searchParams.get('order_id');
      if (F.rt) F.rt.legs = F.rt.legs.filter(x => x !== pg);
      F.writes.push({ m: 'DELETE', table: 'ct_rt_legs', recId: String(pg) });
      return { ok: true };
    }
    F.costsOther.push(m + ' ' + p + url.search); return { records: [] };
  };
  F.create = fields => {
    const id = 'recRIGNEW' + String(++F.seq).padStart(5, '0');
    F.orders[id] = { id, fields: {} }; F.patch(id, fields);
    (F.created = F.created || []).push(id);
    return F.read(F.orders[id]);
  };
  return F;
}

async function installRoutes(page, F) {
  await page.route(`**/${HOST}/**`, async route => {
    const r = route.request(), url = new URL(r.url());
    const hdr = { 'content-type': 'application/json', 'access-control-allow-origin': r.headers()['origin'] || '*' };
    const send = (status, body) => route.fulfill({ status, headers: hdr, body: JSON.stringify(body) });
    const seg = url.pathname.split('/').filter(Boolean);   // v0 / base / table / [rec]
    const table = seg[2], recId = seg[3];
    if (F.ready && (seg[0] === 'costs' || seg[0] === 'pallets')) return send(200, F.costs(r.method(), url));
    if (!F.ready || ![ORDERS, LOTS, 'local_moves'].includes(table)) return bridge(route);
    if (table === 'local_moves') return send(200, { records: [] });
    const m = r.method();
    if (table === LOTS) {
      if (F.failLots) return send(500, { error: { type: 'SERVER_ERROR', message: 'stock read failed (rig)' } });
      if (m === 'GET' && !recId) return send(200, { records: F.list(LOTS, url.searchParams.get('filterByFormula')) });
      if (m === 'GET') { const l = F.lots[recId]; return l ? send(200, F.readLot(l)) : send(404, { error: { type: 'NOT_FOUND' } }); }
      F.writes.push({ m, table, recId, body: r.postDataJSON() }); return send(200, { id: recId || 'recLOTNEW', fields: {} });
    }
    if (m === 'GET' && !recId) return send(200, { records: F.list(ORDERS, url.searchParams.get('filterByFormula')) });
    if (m === 'GET') { const o = F.orders[recId]; return o && !o.deleted ? send(200, F.read(o)) : send(404, { error: { type: 'NOT_FOUND', message: 'not found' } }); }
    const body = r.postDataJSON ? r.postDataJSON() : null;
    F.writes.push({ m, table, recId: recId || null, fields: body && body.fields });
    // A write that LANDS but whose answer is lost (Σ-07): applied, then the
    // connection fails — core/api.js retries and finally throws.
    if (F.lose && F.lose.recId === recId && m === 'PATCH' && F.lose.n > 0) {
      F.lose.n--; F.patch(recId, body.fields || {}); F.lost = (F.lost || 0) + 1;
      return route.abort('failed');
    }
    // A DB refusal on demand: the Worker's 422 STOCK_RULE (contract §4.4).
    if (F.refuse && F.refuse.recId === recId && m === 'PATCH') {
      const e = F.refuse; F.refuse = null;
      return send(422, { error: { type: 'STOCK_RULE', code: e.code, message: e.message } });
    }
    if (m === 'PATCH') { const rec = F.patch(recId, body.fields || {}); return rec ? send(200, rec) : send(404, { error: { type: 'NOT_FOUND' } }); }
    if (m === 'POST' && F.refusePost) { const e = F.refusePost; F.refusePost = null; return send(422, { error: { type: 'STOCK_RULE', code: e.code, message: e.message } }); }
    if (m === 'POST') { const rec = F.create(body.fields || {}); if (F.loseNextPost) { F.loseNextPost = false; F.lose = { recId: rec.id, n: 3 }; } return send(200, rec); }
    if (m === 'DELETE') { if (F.orders[recId]) F.orders[recId].deleted = true; return send(200, { id: recId, deleted: true }); }
    return route.fallback();
  });
}

// Synthetic week, built on real reference ids so the pills carry plates.
function buildStore(F, ref, opts) {
  const o = (id, f) => { F.orders[id] = { id, fields: Object.assign({ Type: 'International', Status: 'Pending' }, f) }; };
  const d = (n, h) => { const t = new Date(ref.ws + 'T12:00:00'); t.setDate(t.getDate() + n); t.setHours(h || 8, 0, 0, 0); return t.toISOString(); };
  const [T1, T2, T3, T4, T5] = ref.trucks, [D1, D2, D3, D4] = ref.drivers, [PA1, PA2] = ref.partners;
  const [C1, C2] = ref.clients, [L1, L2, L3, WH, WH2] = ref.locs;
  const veh = (t, dr) => ({ Truck: [t], Driver: [dr], Status: 'Assigned' });
  // Export with a lone matched import → Case A, lone.
  o('recRIGE1000000001', Object.assign({ Direction: 'Export', Client: [C1], 'Loading DateTime': d(1), 'Delivery DateTime': d(2), 'Loading Pallets 1': 20, 'Loading Location 1': [L1], 'Unloading Location 1': [L2], 'Matched Import ID': 'recRIGI1000000001', Reference: 'EXP-1' }, veh(T1, D1)));
  o('recRIGI1000000001', Object.assign({ Direction: 'Import', Client: [C2], 'Loading DateTime': d(3, 6), 'Delivery DateTime': d(5), 'Loading Pallets 1': 26, 'Loading Location 1': [L2], 'Unloading Location 1': [L1], Reference: 'IMP-1' }, veh(T1, D1)));
  // Export with a matched GI group that already has «|» → Case A, untouched suffix.
  o('recRIGE2000000002', Object.assign({ Direction: 'Export', Client: [C1], 'Loading DateTime': d(1), 'Delivery DateTime': d(3), 'Loading Pallets 1': 18, 'Loading Location 1': [L1], 'Unloading Location 1': [L3], 'Matched Import ID': 'recRIGI2000000002', Reference: 'EXP-2' }, veh(T2, D2)));
  o('recRIGI2000000002', Object.assign({ Direction: 'Import', Client: [C2], 'Loading DateTime': d(4), 'Delivery DateTime': d(6), 'Loading Pallets 1': 10, 'Loading Location 1': [L3], 'Unloading Location 1': [L1], 'Group ID': 'GI-RIGGRP|recRIGI2000000002,recRIGI3000000003' }, veh(T2, D2)));
  o('recRIGI3000000003', Object.assign({ Direction: 'Import', Client: [C1], 'Loading DateTime': d(4), 'Delivery DateTime': d(6), 'Loading Pallets 1': 8, 'Loading Location 1': [L2], 'Unloading Location 1': [L1], 'Group ID': 'GI-RIGGRP|recRIGI2000000002,recRIGI3000000003' }, veh(T2, D2)));
  // Export, own truck, no import → Case B.
  o('recRIGE3000000003', Object.assign({ Direction: 'Export', Client: [C2], 'Loading DateTime': d(2), 'Delivery DateTime': d(4), 'Loading Pallets 1': 30, 'Loading Location 1': [L1], 'Unloading Location 1': [L2], Reference: 'EXP-3' }, veh(T3, D3)));
  // Export matched to a GI group whose 2nd member is a PIECE → «ΑΠ» tile + return to stock.
  o('recRIGE4000000004', Object.assign({ Direction: 'Export', Client: [C2], 'Loading DateTime': d(1), 'Delivery DateTime': d(2), 'Loading Pallets 1': 22, 'Loading Location 1': [L1], 'Unloading Location 1': [L3], 'Matched Import ID': 'recRIGI4000000004', Reference: 'EXP-4' }, veh(T4, D4)));
  o('recRIGI4000000004', Object.assign({ Direction: 'Import', Client: [C2], 'Loading DateTime': d(3), 'Delivery DateTime': d(5), 'Loading Pallets 1': 20, 'Loading Location 1': [L3], 'Unloading Location 1': [L1], 'Group ID': 'GI-RIGRET|recRIGI4000000004' }, veh(T4, D4)));
  // Partner row (no «+ Κομμάτι») and an unassigned row (disabled, with reason).
  o('recRIGE5000000005', { Direction: 'Export', Client: [C1], 'Loading DateTime': d(2), 'Delivery DateTime': d(3), 'Loading Pallets 1': 33, 'Loading Location 1': [L1], 'Unloading Location 1': [L2], Partner: [PA1], 'Is Partner Trip': true, Status: 'Assigned' });
  o('recRIGE6000000006', { Direction: 'Export', Client: [C2], 'Loading DateTime': d(3), 'Delivery DateTime': d(5), 'Loading Pallets 1': 12, 'Loading Location 1': [L1], 'Unloading Location 1': [L3] });
  // A normal unmatched import (the ONLY one the counters may count).
  o('recRIGI5000000005', { Direction: 'Import', Client: [C1], 'Loading DateTime': d(2), 'Delivery DateTime': d(4), 'Loading Pallets 1': 12, 'Loading Location 1': [L2], 'Unloading Location 1': [L1] });
  if (opts.noStock) return;
  // Lot A (#312): source = an import to the warehouse with a partner, delivered.
  o('recRIGLOTA0000312', { Direction: 'Import', Client: [C1], 'Loading DateTime': d(0), 'Delivery DateTime': d(0, 16), 'Loading Pallets 1': 33, 'Loading Location 1': [L2], 'Unloading Location 1': [WH], Partner: [PA2], 'Is Partner Trip': true, Status: 'Delivered', Notes: 'Η αποθήκη μέτρησε 31 αντί για 33 (2 σπασμένες)' });
  F.lots.recRIGSTOCKLOTA1 = { id: 'recRIGSTOCKLOTA1', fields: { Order: ['recRIGLOTA0000312'], 'Lot No': 312, 'Source Kind': 'intl', Reference: 'LOT-A', 'Source Notes': 'Η αποθήκη μέτρησε 31 αντί για 33 (2 σπασμένες)', 'Client Rec': C1, 'Client Name': ref.clientName[C1], 'Warehouse Rec': WH, 'Warehouse Name': ref.locName[WH], 'Warehouse City': ref.locCity[WH], 'Warehouse Country': ref.locCountry[WH], 'Intake Status': 'Delivered', 'Intake Delivered': true, 'Received On': ref.receivedA, 'Stock Pallets': 33 } };
  // Piece P2 of lot A inside E4's import group (not in the suffix → last).
  o('recRIGP2000000002', Object.assign({ Direction: 'Import', Client: [C1], 'Stock Lot': ['recRIGSTOCKLOTA1'], 'Loading DateTime': d(3), 'Delivery DateTime': d(5), 'Loading Pallets 1': 5, 'Loading Location 1': [WH], 'Unloading Location 1': [L1], 'Group ID': 'GI-RIGRET|recRIGI4000000004', Reference: 'TEST-STOCK-P2' }, veh(T4, D4)));
  // Loose piece P3 of lot A (no truck, no group). opts.noLoose: none at all.
  if (!opts.noLoose) o('recRIGP3000000003', { Direction: 'Import', Client: [C1], 'Stock Lot': ['recRIGSTOCKLOTA1'], 'Loading DateTime': d(5, 7), 'Delivery DateTime': d(6), 'Loading Pallets 1': 4, 'Loading Location 1': [WH], 'Unloading Location 1': [L3], Reference: 'TEST-STOCK-P3' });
  // Lot B (#318): not received yet, but a piece is already moving → «nointake».
  o('recRIGLOTB0000318', { Direction: 'Import', Client: [C2], 'Loading DateTime': d(-9), 'Delivery DateTime': d(-8), 'Loading Pallets 1': 24, 'Loading Location 1': [L3], 'Unloading Location 1': [WH2], Partner: [PA2], 'Is Partner Trip': true, Status: 'Assigned' });
  F.lots.recRIGSTOCKLOTB1 = { id: 'recRIGSTOCKLOTB1', fields: { Order: ['recRIGLOTB0000318'], 'Lot No': 318, 'Source Kind': 'intl', Reference: 'LOT-B', 'Client Rec': C2, 'Client Name': ref.clientName[C2], 'Warehouse Rec': WH2, 'Warehouse Name': ref.locName[WH2], 'Warehouse City': ref.locCity[WH2], 'Warehouse Country': ref.locCountry[WH2], 'Intake Status': 'Assigned', 'Intake Delivered': false, 'Stock Pallets': 24 } };
  o('recRIGP4000000004', Object.assign({ Direction: 'Import', Client: [C2], 'Stock Lot': ['recRIGSTOCKLOTB1'], 'Loading DateTime': d(-2), 'Delivery DateTime': d(-1), 'Loading Pallets 1': 6, 'Loading Location 1': [WH2], 'Unloading Location 1': [L2], Reference: 'TEST-STOCK-P4' }, veh(T5, D1), { Status: 'In Transit' }));
  // Lot D (#325): not received yet, its one piece only ASSIGNED to a truck for
  // a later day — normal planning, no red (critic-1 C1-01, D3).
  o('recRIGLOTD0000325', { Direction: 'Import', Client: [C1], 'Loading DateTime': d(1), 'Delivery DateTime': d(2), 'Loading Pallets 1': 12, 'Loading Location 1': [L3], 'Unloading Location 1': [WH2], Partner: [PA1], 'Is Partner Trip': true, Status: 'Assigned' });
  F.lots.recRIGSTOCKLOTD1 = { id: 'recRIGSTOCKLOTD1', fields: { Order: ['recRIGLOTD0000325'], 'Lot No': 325, 'Source Kind': 'intl', Reference: 'LOT-D', 'Client Rec': C1, 'Client Name': ref.clientName[C1], 'Warehouse Rec': WH2, 'Warehouse Name': ref.locName[WH2], 'Warehouse City': ref.locCity[WH2], 'Warehouse Country': ref.locCountry[WH2], 'Intake Status': 'Assigned', 'Intake Delivered': false, 'Stock Pallets': 12 } };
  o('recRIGP7000000007', Object.assign({ Direction: 'Import', Client: [C1], 'Stock Lot': ['recRIGSTOCKLOTD1'], 'Loading DateTime': d(12), 'Delivery DateTime': d(13), 'Loading Pallets 1': 4, 'Loading Location 1': [WH2], 'Unloading Location 1': [L2], Reference: 'TEST-STOCK-P7' }, veh(T2, D2)));
  if (opts.r1) {
    // Round 1 (W5/W6/C1-02): two more lone matched pairs (E7/I9, E8/I10), a
    // Case B export (E9), a loose piece whose delivery day passed (P8) and a
    // loose piece left with the Group ID of a deleted lead (P9, Σ-04).
    o('recRIGE7000000007', Object.assign({ Direction: 'Export', Client: [C1], 'Loading DateTime': d(1), 'Delivery DateTime': d(2), 'Loading Pallets 1': 16, 'Loading Location 1': [L1], 'Unloading Location 1': [L2], 'Matched Import ID': 'recRIGI9000000009', Reference: 'EXP-7' }, veh(T3, D3)));
    o('recRIGI9000000009', Object.assign({ Direction: 'Import', Client: [C2], 'Loading DateTime': d(3), 'Delivery DateTime': d(5), 'Loading Pallets 1': 14, 'Loading Location 1': [L2], 'Unloading Location 1': [L1], Reference: 'IMP-9' }, veh(T3, D3)));
    o('recRIGE8000000008', Object.assign({ Direction: 'Export', Client: [C2], 'Loading DateTime': d(1), 'Delivery DateTime': d(3), 'Loading Pallets 1': 18, 'Loading Location 1': [L1], 'Unloading Location 1': [L3], 'Matched Import ID': 'recRIGIA000000010', Reference: 'EXP-8' }, veh(T5, D4)));
    o('recRIGIA000000010', Object.assign({ Direction: 'Import', Client: [C1], 'Loading DateTime': d(4), 'Delivery DateTime': d(6), 'Loading Pallets 1': 12, 'Loading Location 1': [L3], 'Unloading Location 1': [L1], Reference: 'IMP-10' }, veh(T5, D4)));
    o('recRIGE9000000009', Object.assign({ Direction: 'Export', Client: [C1], 'Loading DateTime': d(2), 'Delivery DateTime': d(4), 'Loading Pallets 1': 20, 'Loading Location 1': [L1], 'Unloading Location 1': [L3], Reference: 'EXP-9' }, veh(T4, D1)));
    o('recRIGP8000000008', { Direction: 'Import', Client: [C1], 'Stock Lot': ['recRIGSTOCKLOTA1'], 'Loading DateTime': d(-5), 'Delivery DateTime': d(-4), 'Loading Pallets 1': 2, 'Loading Location 1': [WH], 'Unloading Location 1': [L2], Reference: 'TEST-STOCK-P8' });
    o('recRIGP9000000009', { Direction: 'Import', Client: [C1], 'Stock Lot': ['recRIGSTOCKLOTA1'], 'Loading DateTime': d(3), 'Delivery DateTime': d(5), 'Loading Pallets 1': 3, 'Loading Location 1': [WH], 'Unloading Location 1': [L3], 'Group ID': 'GI-DEAD|recRIGDEAD0000001', Reference: 'TEST-STOCK-P9' });
  }
  if (opts.extra) {
    // Export lot #330 on our own truck (a lot's row offers no split, prints «→ ΑΠΟΘΗΚΗ»).
    o('recRIGLOTE0000330', Object.assign({ Direction: 'Export', Client: [C1], 'Loading DateTime': d(2), 'Delivery DateTime': d(3), 'Loading Pallets 1': 14, 'Loading Location 1': [L1], 'Unloading Location 1': [WH] }, veh(T5, D2)));
    F.lots.recRIGSTOCKLOTE1 = { id: 'recRIGSTOCKLOTE1', fields: { Order: ['recRIGLOTE0000330'], 'Lot No': 330, 'Source Kind': 'intl', Reference: 'LOT-E', 'Client Rec': C1, 'Client Name': ref.clientName[C1], 'Warehouse Rec': WH, 'Warehouse Name': ref.locName[WH], 'Warehouse City': ref.locCity[WH], 'Warehouse Country': ref.locCountry[WH], 'Intake Status': 'Assigned', 'Intake Delivered': false, 'Stock Pallets': 14 } };
    // A truckless GI group that holds a piece (what «×» left before B-07): I7 + P6.
    o('recRIGI7000000007', { Direction: 'Import', Client: [C2], 'Loading DateTime': d(4), 'Delivery DateTime': d(6), 'Loading Pallets 1': 9, 'Loading Location 1': [L3], 'Unloading Location 1': [L1], 'Group ID': 'GI-RIGOFF|recRIGI7000000007' });
    o('recRIGP6000000006', { Direction: 'Import', Client: [C1], 'Stock Lot': ['recRIGSTOCKLOTA1'], 'Loading DateTime': d(4), 'Delivery DateTime': d(6), 'Loading Pallets 1': 3, 'Loading Location 1': [WH], 'Unloading Location 1': [L2], 'Group ID': 'GI-RIGOFF|recRIGI7000000007', Reference: 'TEST-STOCK-P6' });
    // Case B pair whose vehicle copy never landed: E3 → P5 (piece, no vehicle).
    F.orders.recRIGE3000000003.fields['Matched Import ID'] = 'recRIGP5000000005';
    o('recRIGP5000000005', { Direction: 'Import', Client: [C1], 'Stock Lot': ['recRIGSTOCKLOTA1'], 'Loading DateTime': d(4), 'Delivery DateTime': d(5), 'Loading Pallets 1': 2, 'Loading Location 1': [WH], 'Unloading Location 1': [L3], Reference: 'TEST-STOCK-P5' });
    // A plain unmatched import: «Groupage εισαγωγών» still has a candidate to offer.
    o('recRIGI8000000008', { Direction: 'Import', Client: [C2], 'Loading DateTime': d(5), 'Delivery DateTime': d(6), 'Loading Pallets 1': 5, 'Loading Location 1': [L2], 'Unloading Location 1': [L1] });
  }
  if (!opts.zeroLot) return;
  // Lot C (#320): received, NO piece ever drawn (the client collected it / damaged whole).
  o('recRIGLOTC0000320', { Direction: 'Import', Client: [C2], 'Loading DateTime': d(-6), 'Delivery DateTime': d(-5), 'Loading Pallets 1': 10, 'Loading Location 1': [L3], 'Unloading Location 1': [WH], Partner: [PA2], 'Is Partner Trip': true, Status: 'Delivered' });
  F.lots.recRIGSTOCKLOTC1 = { id: 'recRIGSTOCKLOTC1', fields: { Order: ['recRIGLOTC0000320'], 'Lot No': 320, 'Source Kind': 'intl', Reference: 'LOT-C', 'Client Rec': C2, 'Client Name': ref.clientName[C2], 'Warehouse Rec': WH, 'Warehouse Name': ref.locName[WH], 'Warehouse City': ref.locCity[WH], 'Warehouse Country': ref.locCountry[WH], 'Intake Status': 'Delivered', 'Intake Delivered': true, 'Received On': ref.receivedA, 'Stock Pallets': 10 } };
}

// Page-side stubs: the piece form ALWAYS (see the header); everything stock
// itself is the app's real code.
// switchOff: FEATURES.STOCK_LOTS stays as config.js ships it (false) — the
// side-system stubs and the captures below are still needed to drive the
// board (a real confirm modal would wait for a human).
async function installStubs(page, switchOff) {
  await page.evaluate(off => {
    if (!off) FEATURES.STOCK_LOTS = true;
    TABLES.STOCK_LOTS = TABLES.STOCK_LOTS || 'tblStockLots';
    window.__rig = { pieceCalls: [], toasts: [], confirms: [], opened: [], printed: [], csv: [], beforeHook: null, formMode: null };
    if (typeof OrdersStock === 'undefined') throw new Error('OrdersStock missing — this rig runs on the merged front (FRONT-ORDERS + FRONT-WEEKLY)');
    window.openIntlPieceCreate = async (lot, presets) => {
      window.__rig.pieceCalls.push({ lot: lot.id, presets: JSON.parse(JSON.stringify(presets || {})) });
      // formMode 'cancel' = the dispatcher closes the form: nothing is saved.
      if (window.__rig.formMode === 'cancel') return;
      const values = { 'Loading Pallets 1': 5, Reference: 'TEST-STOCK-NEW', 'Unloading Location 1': [getRefLocations()[0].id] };
      const fields = OrdersStock.pieceFields(lot, presets, values);
      // A refused POST: the real form shows it and stays open — no hook.
      let rec;
      try { rec = await atCreate(TABLES.ORDERS, fields); }
      catch (e) { window.__rig.toasts.push('form refused: ' + (e && e.message)); return; }
      const ctx = presets && presets.context;
      // a case may age the context / leave the page / change the lead (via
      // window.__rigSet, a node binding) before the hook runs
      if (typeof window.__rig.beforeHook === 'function') await window.__rig.beforeHook(ctx);
      if (typeof window._wiOnPieceSaved === 'function') await window._wiOnPieceSaved(rec.id, fields, ctx);
      await renderWeeklyIntl();
    };
    // Side systems this rig does not exercise: round trips, downstream sync.
    // The REAL rtFindForOrder is kept aside for the leg-first proof (D-23).
    window.__rig.rtFind0 = window.rtFindForOrder;
    window.rtOnOrderSaved = async () => null;
    window.rtOnImportUnmatched = async () => null;
    window.rtFindForOrder = async () => ({ pg: null, rt: null });
    window.syncOrderDownstream = async () => null;
    window.confirmAction = async t => { window.__rig.confirms.push(String(t)); return true; };
    // Prints and downloads are captured, never opened.
    window.open = u => { window.__rig.opened.push(String(u)); return null; };
    window._printWeekShell = (title, html) => { window.__rig.printed.push({ title, html }); };
    const cou = URL.createObjectURL.bind(URL);
    URL.createObjectURL = b => { if (b && b.text) b.text().then(t => window.__rig.csv.push(t)); return cou(b); };
    const t0 = window.toast, e0 = window.showErrorToast;
    window.toast = (m, ty) => { window.__rig.toasts.push((ty || 'success') + ': ' + m); return t0 && t0(m, ty); };
    window.showErrorToast = (m, ty) => { window.__rig.toasts.push((ty || 'error') + ': ' + m); return e0 && e0(m, ty); };
    invalidateCache(TABLES.ORDERS);
  }, !!switchOff);
}

async function openBoard(browser, role, F, opts) {
  const ctx = await browser.newContext({ viewport: { width: RIG_W, height: 900 }, baseURL, locale: 'el-GR', timezoneId: 'Europe/Athens' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('requestfailed', r => { if (r.url().includes(HOST)) errs.push('requestfailed: ' + decodeURIComponent(r.url()).slice(0, 220)); });
  page.on('dialog', d => d.accept());
  await preparePage(page, role);
  await installRoutes(page, F);
  // Round 1 (Σ-01): a case changes the SERVER's copy of an order while the
  // piece form is open — the page calls this binding from beforeHook.
  await page.exposeFunction('__rigSet', (id, field, val) => {
    const o = F.orders[id]; if (!o) return false;
    if (val == null || (Array.isArray(val) && !val.length)) delete o.fields[field]; else o.fields[field] = val;
    return true;
  });
  await gotoPage(page, 'weekly_intl', baseURL);
  await page.locator('#sidebar').waitFor({ timeout: 20000 });
  await page.waitForFunction(() => typeof WINTL !== 'undefined' && typeof renderWeeklyIntl === 'function', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const ref = await page.evaluate(() => {
    const act = getRefTrucks().filter(r => r.fields.Active);
    const drv = getRefDrivers().filter(r => r.fields.Active);
    const locs = getRefLocations().filter(r => r.fields.Name && r.fields.Country);
    const ws = toLocalDate(TmsWeek.start(WINTL.week));
    const rcv = new Date(localToday() + 'T12:00:00'); rcv.setDate(rcv.getDate() - 12);
    const pick = (a, n) => a.slice(0, n).map(r => r.id);
    const L = locs.slice(0, 5);
    return { ws, receivedA: toLocalDate(rcv), trucks: pick(act, 5), drivers: pick(drv, 4), partners: pick(getRefPartners(), 2),
      clients: pick(getRefClients().filter(r => r.fields['Company Name']), 2), locs: L.map(r => r.id),
      locName: Object.fromEntries(L.map(r => [r.id, r.fields.Name])), locCity: Object.fromEntries(L.map(r => [r.id, r.fields.City || ''])),
      locCountry: Object.fromEntries(L.map(r => [r.id, r.fields.Country])),
      clientName: Object.fromEntries(getRefClients().slice(0, 50).map(r => [r.id, r.fields['Company Name']])) };
  });
  if (!F.built) { buildStore(F, ref, opts || {}); F.built = true; }
  F.ready = true;
  // opts.switchOff: FEATURES.STOCK_LOTS untouched — the board as it ships
  // today (G-42); only the side systems and captures are stubbed.
  await installStubs(page, !!(opts && opts.switchOff));
  await page.evaluate(async () => { invalidateCache(TABLES.ORDERS); await renderWeeklyIntl(); });
  await page.waitForTimeout(F.failLots ? 6500 : 1200);
  // A board that did not paint must stop the rig loudly, with what it said.
  const painted = await page.evaluate(() => ({ ok: !!document.querySelector('#content .wk3.wi2'), page: typeof currentPage !== 'undefined' ? currentPage : '?', text: (document.getElementById('content') || {}).innerText }));
  if (!painted.ok) throw new Error(`board not painted (${role}, page=${painted.page}): ${String(painted.text || '').slice(0, 400)} · console: ${errs.slice(0, 5).join(' / ')} · unknown: ${F.unknown.join(' / ')}`);
  return { ctx, page, errs, ref };
}

// RIG_W=1920 repeats every screen at that width; file names keep «-1440» so
// before/after sets compare by name — the width lives in the output folder.
const RIG_W = +(process.env.RIG_W || 1440);
const shot = (page, name) => page.screenshot({ path: path.join(outDir, name) });
const rowIdOf = (page, oid) => page.evaluate(o => (WINTL.rows.find(r => (r.orderIds || [r.orderId]).includes(o)) || {}).id, oid);
// Join through the REAL panel: open «+ Κομμάτι από απόθεμα» on the truck's
// row, click the lot / loose piece button it offers.
async function join(page, oid, kind, id) {
  const rid = await rowIdOf(page, oid);
  await page.evaluate(r => _wiStockPanel(r), rid); await page.waitForTimeout(300);
  const i = await page.evaluate(([k, x]) => ((k === 'lot' ? WINTL._stkPick.lots : WINTL._stkPick.loose) || []).findIndex(o => o.id === x), [kind, id]);
  if (i < 0) throw new Error(`the panel does not offer ${kind} ${id}`);
  await page.locator(`#wi-panel .wi-stk-opt[onclick="_wiStockPick('${kind}',${i})"]`).click();
}
const writesSince = (F, n) => F.writes.slice(n).map(w => ({ m: w.m, table: w.table, rec: w.recId, fields: w.fields || w.body }));
// B-13: after a stock action the top-bar Undo holds nothing (core/api.js).
const undoOf = page => page.evaluate(() => { const a = getUndoAction(); return a ? { type: a.type, rec: a.recId, prev: a.prevFields } : null; });
// (waits for a painted board first: a write that repaints without awaiting it
// would otherwise leave no #wi-ctx for a moment)
const ctxMenu = async (page, js) => { await page.waitForFunction(() => !!document.getElementById('wi-ctx'), null, { timeout: 15000 }); await page.waitForTimeout(300);
  await page.evaluate(js); await page.waitForTimeout(250);
  const t = await page.evaluate(() => ({ text: (document.getElementById('wi-ctx') || {}).innerText || '', dis: [...document.querySelectorAll('#wi-ctx .wi-ctx-i.dis')].map(b => b.textContent + ' [' + b.title + ']') }));
  await page.keyboard.press('Escape'); await page.evaluate(() => { const c = document.getElementById('wi-ctx'); if (c) c.style.display = 'none'; });
  return t.text.replace(/\n/g, ' | ') + (t.dis.length ? ' || disabled: ' + t.dis.join(' ; ') : ''); };
const fakeEv = `({preventDefault(){},stopPropagation(){},currentTarget:document.body,target:document.body,clientX:300,clientY:300})`;

if (MAIN) (async () => {
  const out = { screens: [], checks: {} };
  const ok = (name, cond, detail) => { out.checks[name] = { ok: !!cond, detail }; };
  const browser = await chromium.launch();

  // 1) dispatcher — shelf with 2 lots, menus, payloads
  {
    const F = makeFacade();
    const { ctx, page, errs } = await openBoard(browser, 'dispatcher', F);
    const shelf = await page.evaluate(() => {
      const el = document.getElementById('wi-shelf'), host = document.querySelector('.wk3.wi2');
      const cols = document.querySelector('.wk3-cols');
      return { exists: !!el, firstChild: el && el.parentElement.firstElementChild === el, hasShelf: host.classList.contains('has-shelf'),
        text: el && el.innerText.replace(/\s+/g, ' ').trim(), chips: el ? [...el.querySelectorAll('.wi-shelf-chip')].map(c => c.className + ' | ' + c.innerText.replace(/\s+/g, ' ')) : [],
        colsTop: getComputedStyle(cols).top, height: el && el.getBoundingClientRect().height,
        money: /€|price|rate|τιμ/i.test(el ? el.innerText : '') };
    });
    ok('shelf_first_child_28px', shelf.exists && shelf.firstChild && shelf.hasShelf && Math.round(shelf.height) === 28 && shelf.colsTop === '28px', shelf);
    ok('shelf_no_money', !shelf.money, shelf.text);
    // Chips that do not fit are never cut silently: the fade says «more», the
    // loose-pieces count stays pinned in view.
    const fit = await page.evaluate(() => { const l = document.querySelector('.wi-shelf-list'), b = document.querySelector('.wi-shelf-loose');
      const lr = b.getBoundingClientRect(), sr = document.getElementById('wi-shelf').getBoundingClientRect();
      return { over: l.scrollWidth > l.clientWidth + 1, fade: l.classList.contains('ovf'), looseInView: lr.right <= sr.right + 1 && lr.left >= sr.left }; });
    ok('shelf_overflow_signalled', fit.fade === fit.over && fit.looseInView, fit);
    ok('shelf_nointake_first', /nointake/.test(shelf.chips[0] || ''), shelf.chips);
    // Owner 4/10: «πάνω δεξιά, όχι αριστερά» — the strip ends at the sheet's
    // right edge and never starts in the left quarter (the export client
    // column); the urgent first chip is still whole. Scrolled → left fade too.
    const side = await page.evaluate(() => {
      const inn = document.querySelector('#wi-shelf .wi-shelf-in').getBoundingClientRect(),
        sh = document.querySelector('main.wk3-sheet').getBoundingClientRect(),
        l = document.querySelector('.wi-shelf-list'), c0 = l.querySelector('.wi-shelf-chip').getBoundingClientRect(), lr = l.getBoundingClientRect();
      const r = { rightGap: Math.round(sh.right - inn.right), leftShare: +((inn.left - sh.left) / sh.width).toFixed(2),
        firstWhole: c0.left >= lr.left - 1 && c0.right <= lr.right + 1 };
      l.scrollLeft = l.scrollWidth; _wiShelfFit(); r.leftFade = l.scrollLeft > 1 ? l.classList.contains('ovl') : 'no-scroll';
      l.scrollLeft = 0; _wiShelfFit(); r.leftFadeOffAtStart = !l.classList.contains('ovl');
      return r; });
    ok('shelf_top_right', side.rightGap <= 16 && side.leftShare >= 0.24 && side.firstWhole && side.leftFade !== false && side.leftFadeOffAtStart, side);
    await shot(page, 'stock-shelf-2lots-compact-header-1440.png'); out.screens.push('stock-shelf-2lots-compact-header-1440.png');

    // W1 (round 1): «▣ Αποθήκη · Πελάτης 18/24p» — no bar, no country code, no
    // days — and a flag only for a problem; the label is a button counting
    // the lots that need a look. D3: red ONLY from «Pieces Moving» (lot B: a
    // piece In Transit before the intake); lot D's piece is merely ASSIGNED
    // before its intake → no flag (C1-01).
    const w1 = await page.evaluate(() => {
      const el = document.getElementById('wi-shelf'), list = el.querySelector('.wi-shelf-list').getBoundingClientRect();
      const chip = id => { const c = el.querySelector(`.wi-shelf-chip[data-lot="${id}"]`); if (!c) return null;
        const r = c.getBoundingClientRect();
        return { cls: c.className, n: (c.querySelector('.n') || {}).textContent, fl: (c.querySelector('.fl') || {}).textContent || '', kids: [...c.children].map(k => k.tagName + (k.className ? '.' + k.className : '')).join(' '),
          w: Math.round(r.width), whole: r.left >= list.left - 1 && r.right <= list.right + 1 }; };
      const lbl = el.querySelector('.wi-shelf-lbl');
      return { lbl: lbl && lbl.textContent.replace(/\s+/g, ' ').trim(), lblTag: lbl && lbl.tagName,
        bar: !!el.querySelector('.wi-shelf-bar'), cc: !!el.querySelector('.wi-shelf-chip .cc'), days: !!el.querySelector('.wi-shelf-chip .d'),
        a: chip('recRIGSTOCKLOTA1'), b: chip('recRIGSTOCKLOTB1'), d: chip('recRIGSTOCKLOTD1') };
    });
    const whole = [w1.a, w1.b, w1.d].filter(c => c && c.whole).length;
    ok('w1_chip_compact', !w1.bar && !w1.cc && !w1.days && w1.a && /^\d+\/\d+p$/.test(w1.a.n || '') && !w1.a.fl
      && w1.a.kids === 'SPAN B SPAN.sep B.n', w1);
    // The urgent chip is always whole; with real names (HAR reference data)
    // one more fits only from 1920 — names are never cut (DESIGN Κ6), so the
    // label's list is what shows every lot at 1440.
    ok('w1_chips_fit', w1.b && w1.b.whole && whole >= (RIG_W >= 1920 ? 2 : 1), { whole, widths: [w1.a, w1.b, w1.d].map(c => c && c.w) });
    ok('w1_label_button_flag_count', w1.lblTag === 'BUTTON' && w1.lbl === 'ΑΠΟΘΕΜΑ · 3 · 1 ⚠', w1.lbl);
    ok('d3_red_only_from_pieces_moving', w1.b && /nointake/.test(w1.b.cls) && w1.b.fl === 'σε κίνηση χωρίς παραλαβή', w1.b);
    ok('c101_assigned_before_intake_no_flag', w1.d && /\bok\b/.test(w1.d.cls) && !w1.d.fl, w1.d);

    // «ΑΠΟΘΕΜΑ · N» opens EVERY lot, the urgent first; a line opens its lot.
    await page.locator('#wi-shelf .wi-shelf-lbl').click(); await page.waitForTimeout(400);
    const all = await page.evaluate(() => ({ title: (document.querySelector('#wi-panel .wi-panel-title') || {}).textContent,
      lines: [...document.querySelectorAll('#wi-panel .wi-stk-opt[data-lot]')].map(b => b.dataset.lot + ' | ' + b.innerText.replace(/\s+/g, ' ')) }));
    await shot(page, 'stock-shelf-all-lots-1440.png'); out.screens.push('stock-shelf-all-lots-1440.png');
    let allOpen = '';
    if (all.lines.length) { await page.locator('#wi-panel .wi-stk-opt[data-lot="recRIGSTOCKLOTA1"]').click(); await page.waitForTimeout(700);
      allOpen = await page.evaluate(() => (document.querySelector('#wi-panel .wi-panel-title') || {}).textContent || ''); }
    ok('w1_label_lists_all_lots', all.title === 'Ανοιχτές παρτίδες' && all.lines.length === 3 && all.lines[0].startsWith('recRIGSTOCKLOTB1')
      && /σε κίνηση χωρίς παραλαβή/.test(all.lines[0]) && /^#312 · /.test(allOpen), { all, allOpen });

    // W2: lot A's panel — the pieces' header from the read, no «(0 παραδόθηκαν)»;
    // «+ Κομμάτι» primary, no close (pieces still out); «Άνοιγμα παρτίδας»
    // opens the lot ORDER by id. Lot B: the problem said ONCE.
    const pA = await page.evaluate(() => { const p = document.getElementById('wi-panel');
      return { ctx: (p.querySelector('.wi-panel-ctx') || {}).innerText || '', text: p.innerText.replace(/\s+/g, ' '),
        btns: [...p.querySelectorAll('.wi-panel-ft button')].map(b => b.textContent.trim() + ' [' + b.className + ']') }; });
    const openedLot = await page.evaluate(async () => { const o = window.openIntlEditWith, got = [];
      window.openIntlEditWith = id => got.push(id);
      try { const b = document.querySelector('#wi-panel .wi-stk-link'); if (b) { b.click(); await new Promise(r => setTimeout(r, 400)); } } finally { window.openIntlEditWith = o; }
      return got; });
    ok('w2_lot_panel_once_no_zero', /^.+ · υπόλοιπο \d+\/33p · παραλαβή [^·]*\d/.test(pA.ctx) && /Άνοιγμα παρτίδας/.test(pA.ctx)
      && /Κομμάτια · 2 /.test(pA.text + ' ') && !/παραδόθηκαν/.test(pA.text) && pA.btns.length === 1 && /^\+ Κομμάτι \[btn btn-primary\]$/.test(pA.btns[0])
      && openedLot.join() === 'recRIGLOTA0000312', { pA, openedLot });
    await page.evaluate(() => _wiStockLotOpen(document.querySelector('#wi-shelf .wi-shelf-lbl'), 'recRIGSTOCKLOTB1')); await page.waitForTimeout(800);
    const panB = await page.evaluate(() => document.getElementById('wi-panel').innerText.replace(/\s+/g, ' '));
    ok('w2_problem_said_once', (panB.match(/παραλαβή/g) || []).length === 1 && /1 κομμάτι κινείται, αλλά η παραλαβή στην αποθήκη δεν σημειώθηκε — Ημερήσιο, «Παραλαβή αποθήκης»/.test(panB) && !/εκεί σημειώνεται η παραλαβή/.test(panB), panB.slice(0, 300));
    await page.evaluate(() => _wiPanelClose());

    // Counters: the lot row and the loose piece are not «unmatched».
    const counters = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.wk3-sub .wi2-btn')].find(b => /Αυτόματο ταίριασμα/.test(b.textContent));
      WINTL.filterStatus = 'unmatched'; _wiApplyFilter();
      const vis = [...document.querySelectorAll('#wi-rows [data-row-id]')].filter(el => el.style.display !== 'none' && el.id.startsWith('wi-imp-')).map(el => el.id.replace('wi-imp-', ''));
      WINTL.filterStatus = ''; _wiApplyFilter();
      return { autoBtn: btn ? btn.textContent.trim() : null, unmatchedVisible: vis };
    });
    ok('counters_exclude_lot_and_loose', /\(1\)/.test(counters.autoBtn || '') && counters.unmatchedVisible.length === 1 && counters.unmatchedVisible[0] === 'recRIGI5000000005', counters);

    // Badges: «ΑΠ» on the piece tile, «→ ΑΠΟΘΗΚΗ» on the lot row.
    const badges = await page.evaluate(() => ({
      apTile: [...document.querySelectorAll('.wk3-seg .wi-b-ap')].map(b => b.title),
      loosePieceRow: !!document.getElementById('wi-imp-recRIGP3000000003'),
      lot: (document.querySelector('#wi-imp-recRIGLOTA0000312 .wi-b-lot') || {}).textContent || null,
      lastTile: (() => { const p = [...document.querySelectorAll('.wk3-segpill')].find(x => x.querySelector('[data-order-id="recRIGP2000000002"]')); const s = p ? [...p.querySelectorAll('.wk3-seg[data-order-id]')] : []; return s.length ? s[s.length - 1].dataset.orderId : null; })(),
    }));
    ok('badges', badges.apTile.length >= 1 && /Κομμάτι 5\/33p · παρτίδα #312/.test(badges.apTile[0]) && /ΑΠΟΘΗΚΗ/.test(badges.lot || '') && badges.lastTile === 'recRIGP2000000002', badges);
    ok('w3_lot_badge_no_pallets', badges.lot === '→ ΑΠΟΘΗΚΗ', badges.lot);

    // B-19: the loose piece P3 lives on the shelf only — no board row, not in
    // «ΕΙΣΑΓΩΓΗ · N», and «ΚΕΝΑ ΓΥΡΙΣΜΑΤΑ» lights neither it nor a lot row.
    const b19 = await page.evaluate(() => {
      const all = WINTL.rows.filter(r => r.type === 'import' && !r.adj && !r.legOf).length;
      const hdr = [...document.querySelectorAll('.wk3-cols .c')].map(c => c.textContent).find(t => /ΕΙΣΑΓΩΓΗ/.test(t)) || '';
      _wk3Gaps();
      const lit = [...document.querySelectorAll('[id^="wi-imp-"]')].filter(el => el.style.background).map(el => el.id.slice(7));
      return { all, hdr: hdr.replace(/\s+/g, ' ').trim(), lit, p3Row: !!document.getElementById('wi-imp-recRIGP3000000003'),
        shelfLoose: (document.querySelector('.wi-shelf-loose') || {}).textContent };
    });
    ok('loose_piece_shelf_only', !b19.p3Row && b19.hdr === `ΕΙΣΑΓΩΓΗ · ${b19.all - 1}` && /^1 κομμάτι χωρίς φορτηγό$/.test(b19.shelfLoose || '')
      && !b19.lit.some(id => /LOT|recRIGP3/.test(id)) && b19.lit.includes('recRIGI5000000005'), b19);

    // PR-01: ⎙I of a truck whose import is a GI group prints the WHOLE group —
    // button, share query (data-shq → /print/pdf) and the opened URL.
    const pr01 = await page.evaluate(() => {
      const r = WINTL.rows.find(x => x.type === 'export' && x.orderIds.includes('recRIGE4000000004'));
      const b = document.querySelector(`#wi-row-${r.id} .wk3-prt.r`); const n = window.__rig.opened.length; b.click();
      return { title: b.title, shq: b.dataset.shq, url: window.__rig.opened.slice(n)[0] || '' };
    });
    ok('pr01_group_print_E4', /Εκτύπωση ομάδας \(import\) — 2 έγγραφα/.test(pr01.title)
      && /^orderIds=recRIGI4000000004,recRIGP2000000002&leg=import&sheet=driver$/.test(pr01.shq || '') && /[?&]orderIds=recRIGI4000000004,recRIGP2000000002&leg=import/.test(pr01.url), pr01);

    // Lot drag refusal.
    const drag = await page.evaluate(() => { const n = window.__rig.toasts.length; const el = document.getElementById('wi-imp-recRIGLOTA0000312');
      const ev = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }); el.dispatchEvent(ev);
      return { prevented: ev.defaultPrevented, toast: window.__rig.toasts.slice(n) }; });
    ok('lot_drag_refused', drag.prevented && drag.toast.some(t => /Η παρτίδα πάει στην αποθήκη — δεν ταιριάζεται/.test(t)), drag);

    // Menus: own truck → item; partner → none; unassigned → disabled with reason; lot row → restricted.
    const menuOf = async (oid, sel) => {
      const rid = await rowIdOf(page, oid);
      await page.locator(sel(rid)).first().click({ button: 'right' }); await page.waitForTimeout(250);
      const t = await page.locator('#wi-ctx').innerText();
      const dis = await page.evaluate(() => [...document.querySelectorAll('#wi-ctx .wi-ctx-i.dis')].map(b => b.textContent + ' [' + b.title + ']'));
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      return t.replace(/\n/g, ' | ') + (dis.length ? ' || disabled: ' + dis.join(' ; ') : '');
    };
    const mOwn = await menuOf('recRIGE3000000003', rid => `#wi-row-${rid} .wk3-leg:not(.imp)`);
    const mPar = await menuOf('recRIGE5000000005', rid => `#wi-row-${rid} .wk3-leg:not(.imp)`);
    const mUn = await menuOf('recRIGE6000000006', rid => `#wi-row-${rid} .wk3-leg:not(.imp)`);
    const mLot = await menuOf('recRIGLOTA0000312', () => `#wi-imp-recRIGLOTA0000312 .wk3-leg.imp`);
    ok('menu_own_has_item', /\+ Κομμάτι από απόθεμα/.test(mOwn), mOwn);
    ok('menu_partner_no_item', !/Κομμάτι από απόθεμα/.test(mPar), mPar);
    ok('menu_unassigned_item_disabled', /disabled: .*\+ Κομμάτι από απόθεμα… \[Πρώτα ανάθεση σε δικό μας φορτηγό\]/.test(mUn), mUn);
    ok('menu_lot_restricted', /ΠΑΡΤΙΔΑ → ΑΠΟΘΗΚΗ/.test(mLot) && /Απόθεμα/.test(mLot) && !/Groupage|Ομαδοποίηση|ρότα/.test(mLot), mLot);

    // The «+ Κομμάτι από απόθεμα» panel on the Case B truck (free space 33 − 0).
    const rE3 = await rowIdOf(page, 'recRIGE3000000003');
    await page.evaluate(r => _wiStockPanel(r), rE3); await page.waitForTimeout(400);
    const panel = await page.locator('#wi-panel').innerText();
    // S5-08 (round 1): one line «Ελεύθερα 33p (ενδεικτικά)», no arithmetic
    // sentence or disclaimer, no empty section.
    ok('panel_free_space', /Ελεύθερα 33p \(ενδεικτικά\)/.test(panel) && !/33 − 0|Το 33 είναι|Κανένα/.test(panel) && /#312/.test(panel) && /Κομμάτια χωρίς φορτηγό/.test(panel) && /υπόλοιπο \d+p/.test(panel), panel.replace(/\n/g, ' | '));
    await shot(page, 'stock-panel-add-piece-1440.png'); out.screens.push('stock-panel-add-piece-1440.png');
    await page.evaluate(() => _wiPanelClose());

    // W11 (C1-05): E3's «ΚΕΝΟ IMPORT» box offers the stock; the link opens the
    // «+ Κομμάτι από απόθεμα» panel of THAT row, never a new plain import.
    const gap = await page.evaluate(async r => {
      const b = document.querySelector(`#wi-ci-${r} .wi2-gapstk-b`); const n = window.__rig.pieceCalls.length;
      if (b) { b.click(); await new Promise(x => setTimeout(x, 400)); }
      const t = (document.querySelector('#wi-panel .wi-panel-title') || {}).textContent || '';
      _wiPanelClose();
      return { link: b ? b.textContent : null, box: (document.querySelector(`#wi-ci-${r}`) || {}).innerText, panel: t, rowPick: (WINTL._stkPick || {}).rowId === r, forms: window.__rig.pieceCalls.length - n };
    }, rE3);
    ok('c105_gap_box_offers_stock', gap.link === 'ή κομμάτι από ΑΠΟΘΕΜΑ' && gap.panel === '+ Κομμάτι από απόθεμα' && gap.rowPick && gap.forms === 0, gap);

    // Case A — lone import (B-04): the POST creates the piece WITHOUT group and
    // vehicle, THEN the lead gets «GI-…|lead», THEN the piece gets that exact
    // Group ID + the lead's truck (the round-trip trigger finds the export's
    // trip only through the lead's Group ID).
    let n0 = F.writes.length;
    await join(page, 'recRIGE1000000001', 'lot', 'recRIGSTOCKLOTA1');
    await page.waitForTimeout(1500);
    const wA = writesSince(F, n0);
    const iPost = wA.findIndex(w => w.m === 'POST');
    const post = wA[iPost];
    const newA = (F.created || []).slice(-1)[0];
    const iLead = wA.findIndex(w => w.m === 'PATCH' && w.rec === 'recRIGI1000000001');
    const lead = wA[iLead];
    const gidA = lead && lead.fields['Group ID'];
    const iJoin = wA.findIndex(w => w.m === 'PATCH' && w.rec === newA);
    const joinA = wA[iJoin];
    ok('caseA_lone_suffix_on_lead_after_post', !!gidA && /^GI-[0-9A-Z]+\|recRIGI1000000001$/.test(gidA) && iPost >= 0 && iPost < iLead, { iPost, iLead, lead });
    ok('caseA_lone_post', post && !('Group ID' in post.fields) && !(post.fields.Truck || []).length && post.fields.Status === 'Pending' && JSON.stringify(post.fields['Stock Lot']) === '["recRIGSTOCKLOTA1"]' && !('Price' in post.fields), post);
    ok('caseA_lone_piece_on_truck_after_lock', joinA && iLead < iJoin && joinA.fields['Group ID'] === gidA && joinA.fields.Status === 'Assigned' && joinA.fields.Truck && joinA.fields.Truck[0] === F.orders.recRIGI1000000001.fields.Truck[0]
      && F.orders[newA].fields['Group ID'] === gidA, { iJoin, joinA });
    const presetsA = await page.evaluate(() => window.__rig.pieceCalls.slice(-1)[0]);
    ok('caseA_presets', presetsA && presetsA.presets.lockLoadingDate === true && presetsA.presets.context && presetsA.presets.context.kind === 'A'
      && presetsA.presets.context.lockLead === true && !presetsA.presets.groupId && !presetsA.presets.truck, presetsA);
    const undo = {};
    undo.caseA_lone = await undoOf(page);
    // PR-01 on the truck the piece just joined: the opened URL carries every member.
    const pr01b = await page.evaluate(() => {
      const r = WINTL.rows.find(x => x.type === 'export' && x.orderIds.includes('recRIGE1000000001'));
      const b = document.querySelector(`#wi-row-${r.id} .wk3-prt.r`); const n = window.__rig.opened.length; b.click();
      return { title: b.title, url: window.__rig.opened.slice(n)[0] || '' };
    });
    ok('pr01_group_print_after_join', new RegExp(`[?&]orderIds=recRIGI1000000001,${newA}&leg=import`).test(pr01b.url) && /2 έγγραφα/.test(pr01b.title), pr01b);
    const afterA = await page.evaluate(() => { const r = WINTL.rows.find(x => x.type === 'import' && (x.orderIds || []).includes('recRIGI1000000001'));
      return r ? { lead: r.orderId, ids: r.orderIds, sync: (WINTL._syncLog || {}) } : null; });
    ok('caseA_piece_last_lead_kept', afterA && afterA.lead === 'recRIGI1000000001' && afterA.ids.length === 2, afterA);

    // Case A — group with «|»: no Group ID write on the members.
    n0 = F.writes.length;
    await join(page, 'recRIGE2000000002', 'lot', 'recRIGSTOCKLOTA1');
    await page.waitForTimeout(1500);
    const wG = writesSince(F, n0);
    // Σ-01 (round 1): the POST carries no group and no vehicle; ONE patch
    // after a fresh read of the lead puts the piece on the truck.
    const newG = (F.created || []).slice(-1)[0];
    const postG = wG.find(w => w.m === 'POST'), patchG = wG.find(w => w.m === 'PATCH' && w.rec === newG);
    ok('caseA_group_untouched', !wG.some(w => w.m === 'PATCH' && /recRIGI[23]/.test(w.rec || '')) && F.orders[newG].fields['Group ID'] === 'GI-RIGGRP|recRIGI2000000002,recRIGI3000000003', wG);
    ok('sigma01_group_post_bare_then_one_patch', postG && !('Group ID' in postG.fields) && !(postG.fields.Truck || []).length && postG.fields.Status === 'Pending'
      && patchG && patchG.fields['Group ID'] === 'GI-RIGGRP|recRIGI2000000002,recRIGI3000000003' && patchG.fields.Status === 'Assigned'
      && JSON.stringify(patchG.fields.Truck) === JSON.stringify(F.orders.recRIGI2000000002.fields.Truck), { postG, patchG });
    undo.caseA_group = await undoOf(page);

    // Reorder, then «Ακύρωση groupage» of the member the export POINTS at (not
    // the lead any more): the export's pointer must follow the group's lead.
    const seg = await page.evaluate(async () => {
      const find = () => WINTL.rows.find(r => r.type === 'import' && (r.orderIds || []).includes('recRIGI2000000002'));
      const row = find();
      window._wiSegDrag = { rowId: row.id, orderId: 'recRIGI3000000003' };
      await _wiSegDrop({ preventDefault() {} }, row.id, 'recRIGI2000000002');
      await renderWeeklyIntl();
      const g = find(), e = WINTL.rows.find(r => r.type === 'export' && r.orderIds.includes('recRIGE2000000002'));
      return { rowId: g.id, lead: g.orderId, ptr: e.importId, ids: g.orderIds };
    });
    // PR-02: the export points at I2, the group's lead is now I3 — the
    // matched-import menu still finds the group (by any member).
    const pr02 = await page.evaluate(async () => {
      const e = WINTL.rows.find(r => r.type === 'export' && r.orderIds.includes('recRIGE2000000002'));
      const n = window.__rig.toasts.length;
      _wiMatchedImpCtx({ preventDefault() {}, stopPropagation() {}, currentTarget: document.body, clientX: 300, clientY: 300 }, e.id);
      await new Promise(r => setTimeout(r, 200));
      const c = document.getElementById('wi-ctx'); const t = c ? c.innerText : '';
      if (c) c.style.display = 'none';
      return { menu: t.replace(/\n/g, ' | '), toasts: window.__rig.toasts.slice(n) };
    });
    ok('pr02_matched_menu_by_any_member', /Εκτύπωση…/.test(pr02.menu) && !pr02.toasts.some(t => /δεν βρέθηκε/.test(t)), pr02);
    n0 = F.writes.length;
    await page.evaluate(async r => { await _wiCancelGroupMember(r, 'recRIGI2000000002', true); }, seg.rowId);
    await page.waitForTimeout(600);
    const e2 = F.orders.recRIGE2000000002.fields, i2 = F.orders.recRIGI2000000002.fields;
    ok('reorder_then_cancel_pointed_member', seg.lead === 'recRIGI3000000003' && seg.ptr === 'recRIGI2000000002'
      && e2['Matched Import ID'] === 'recRIGI3000000003' && !String(i2['Group ID'] || '') && !i2.Truck,
      { seg, e2ptr: e2['Matched Import ID'], i2, writes: writesSince(F, n0).map(w => w.rec + ' ' + JSON.stringify(w.fields)) });
    // K10 (round 1): the residue left after I2 went is [I3, piece] — the
    // suffix pins I3 only; the piece carries the same string and stays last.
    const g3 = F.orders.recRIGI3000000003.fields['Group ID'], gP = F.orders[newG].fields['Group ID'];
    ok('k10_residue_never_pins_a_piece', g3 === 'GI-RIGGRP|recRIGI3000000003' && gP === g3, { g3, gP });

    // Case B — POST (no Group ID), then the export's Matched Import ID, then the vehicle.
    // The hook runs 35 minutes after the panel opened: the old 30-minute guard
    // returned silently there and the piece stayed on the shelf (review P2).
    n0 = F.writes.length;
    await page.evaluate(() => { window.__rig.beforeHook = ctx => { if (ctx) ctx.at -= 35 * 60 * 1000; }; });
    await join(page, 'recRIGE3000000003', 'lot', 'recRIGSTOCKLOTA1');
    await page.waitForTimeout(2000);
    await page.evaluate(() => { window.__rig.beforeHook = null; });
    const wB = writesSince(F, n0);
    const postB = wB.find(w => w.m === 'POST');
    const matchB = wB.find(w => w.m === 'PATCH' && w.rec === 'recRIGE3000000003');
    const newB = (F.created || []).slice(-1)[0];
    ok('caseB_post_then_match', postB && !postB.fields['Group ID'] && matchB && matchB.fields['Matched Import ID'] === newB
      && wB.findIndex(w => w === postB) < wB.findIndex(w => w === matchB)
      && wB.some(w => w.m === 'PATCH' && w.rec === newB && w.fields.Truck && w.fields.Status === 'Assigned'), { newB, wB });
    undo.caseB = await undoOf(page);

    // Case B whose hook runs after the page changed: said loudly, nothing written.
    n0 = F.writes.length;
    const offB = await page.evaluate(async () => {
      const n = window.__rig.toasts.length, cp = currentPage;
      currentPage = 'orders_intl';
      try { await window._wiOnPieceSaved('recRIGP3000000003', {}, { kind: 'B', expOid: 'recRIGE6000000006', at: Date.now() }); }
      finally { currentPage = cp; }
      return window.__rig.toasts.slice(n);
    });
    ok('caseB_off_board_loud', offB.some(t => /^error: Το κομμάτι αποθηκεύτηκε ΧΩΡΙΣ φορτηγό \(η σελίδα άλλαξε/.test(t)) && writesSince(F, n0).length === 0, offB);

    // Loose piece join (Case A on E4's group whose suffix is «GI-RIGRET|I4»): ONE PATCH.
    n0 = F.writes.length;
    await join(page, 'recRIGE4000000004', 'piece', 'recRIGP3000000003');
    await page.waitForTimeout(1500);
    const wL = writesSince(F, n0).filter(w => w.rec === 'recRIGP3000000003');
    ok('loose_one_patch', wL.length === 1 && wL[0].fields['Group ID'] === 'GI-RIGRET|recRIGI4000000004' && wL[0].fields.Status === 'Assigned' && wL[0].fields['Loading DateTime'] && wL[0].fields['Delivery DateTime'] && wL[0].fields.Truck, wL);
    undo.loose_join = await undoOf(page);

    // Return to stock from the «ΑΠ» tile of P2: Group ID null (main e1a66597:
    // never '' — the RT triggers would join every '' into one group) + vehicle off + Pending.
    n0 = F.writes.length;
    await page.evaluate(async () => { const row = WINTL.rows.find(r => r.type === 'import' && (r.orderIds || []).includes('recRIGP2000000002'));
      await _wiStockReturn(row.id, 'recRIGP2000000002', true); });
    await page.waitForTimeout(1200);
    const wR = writesSince(F, n0).filter(w => w.rec === 'recRIGP2000000002');
    ok('return_to_stock_payload', wR.length === 1 && wR[0].fields['Group ID'] === null && Array.isArray(wR[0].fields.Truck) && !wR[0].fields.Truck.length && wR[0].fields.Status === 'Pending', wR);
    const tR = await page.evaluate(() => window.__rig.toasts.slice(-3));
    ok('w4_return_toast', tR.includes('success: Επέστρεψε στο απόθεμα ✓') && !tR.some(t => /Αφαιρέθηκε από το groupage/.test(t)), tR);
    undo.return_group = await undoOf(page);

    // A DB refusal reaches the screen in Greek, with ⚠ on the row.
    await page.evaluate(async () => { await renderWeeklyIntl(); }); await page.waitForTimeout(1200);
    F.refuse = { recId: 'recRIGP2000000002', code: 'lot_closed', message: 'Η παρτίδα έκλεισε — όχι νέα κομμάτια ή αλλαγές παλετών' };
    const rE1b = await rowIdOf(page, 'recRIGE1000000001');
    const before = JSON.stringify(F.orders.recRIGP2000000002.fields);
    await join(page, 'recRIGE1000000001', 'piece', 'recRIGP2000000002');
    await page.waitForTimeout(1500);
    const refusal = await page.evaluate(r => ({ toasts: window.__rig.toasts.slice(-4), sync: (document.getElementById('wi-sync-' + r) || {}).textContent, tip: (document.getElementById('wi-sync-' + r) || {}).title }), rE1b);
    ok('db_refusal_greek', refusal.toasts.some(t => /Η παρτίδα έκλεισε/.test(t)) && refusal.sync === '⚠' && JSON.stringify(F.orders.recRIGP2000000002.fields) === before, refusal);
    // D2 (round 1): the DB's sentence on screen ONCE (core/api.js); the
    // Weekly adds only what happened. The row's ⚠ keeps the reason.
    ok('d2_refusal_said_once', refusal.toasts.filter(t => /Η παρτίδα έκλεισε/.test(t)).length === 1
      && refusal.toasts.some(t => /^error: Το κομμάτι ΔΕΝ μπήκε στο φορτηγό — έμεινε στο απόθεμα/.test(t)) && /Η παρτίδα έκλεισε/.test(refusal.tip || ''), refusal);
    await shot(page, 'stock-db-refusal-1440.png'); out.screens.push('stock-db-refusal-1440.png');

    // B-04 (b): E3's import is now the lone matched piece newB. «+ Κομμάτι»
    // again, then the form is CANCELLED → nothing written, newB untouched
    // (the old code had already locked it: «GI-…|newB», a one-member group).
    await page.evaluate(async () => { await renderWeeklyIntl(); }); await page.waitForTimeout(1200);
    const newBfields = () => JSON.stringify(F.orders[newB].fields);
    let before4 = newBfields();
    n0 = F.writes.length;
    await page.evaluate(() => { window.__rig.formMode = 'cancel'; });
    await join(page, 'recRIGE3000000003', 'lot', 'recRIGSTOCKLOTA1'); await page.waitForTimeout(1200);
    ok('b04_cancelled_form_writes_nothing', writesSince(F, n0).length === 0 && newBfields() === before4, writesSince(F, n0));
    // … and a REFUSED POST (422 over-draw) → only the refused POST, no lock.
    n0 = F.writes.length;
    F.refusePost = { code: 'over_draw', message: 'Η παρτίδα δεν έχει τόσες παλέτες' };
    await page.evaluate(() => { window.__rig.formMode = null; });
    await join(page, 'recRIGE3000000003', 'lot', 'recRIGSTOCKLOTA1'); await page.waitForTimeout(1500);
    const wRef = writesSince(F, n0);
    ok('b04_refused_post_lead_untouched', wRef.length === 1 && wRef[0].m === 'POST' && newBfields() === before4, wRef);
    // … and a loose piece whose join the DB refuses: the lock written for it
    // is taken back, so newB ends as it was.
    F.refuse = { recId: 'recRIGP2000000002', code: 'lot_closed', message: 'Η παρτίδα έκλεισε — όχι νέα κομμάτια ή αλλαγές παλετών' };
    n0 = F.writes.length;
    await join(page, 'recRIGE3000000003', 'piece', 'recRIGP2000000002'); await page.waitForTimeout(1500);
    const wUndo = writesSince(F, n0).map(w => w.m + ' ' + w.rec + ' ' + JSON.stringify(w.fields));
    ok('b04_refused_join_lock_undone', wUndo.length === 3 && /^PATCH .+"Group ID":"GI-[0-9A-Z]+\|/.test(wUndo[0]) && wUndo[0].startsWith('PATCH ' + newB)
      && wUndo[1].startsWith('PATCH recRIGP2000000002') && wUndo[2] === `PATCH ${newB} {"Group ID":null}` && newBfields() === before4, wUndo);

    // B-04 (a) + D-23: «Επιστροφή» of a lone matched piece that still carries
    // a one-member «GI-…|piece» (left by the old lock). The round-trip leg
    // DELETE goes out BEFORE the vehicle PATCH (the trigger copies a vehicle
    // change onto the whole trip), and the group is cleared too — null.
    F.orders[newB].fields['Group ID'] = 'GI-LEGACY|' + newB;
    // pg = the order's own «Order No» (019: order_no = orders.id) — what the
    // shared lookup _wiRtOf reads (main f896b588), not /pallets/gate.
    const pgE3 = F.no('recRIGE3000000003'), pgB = F.no(newB);
    F.rt = { id: 901, code: 'RT-RIG1', legs: [pgE3, pgB], pg: { recRIGE3000000003: pgE3, [newB]: pgB } };
    await page.evaluate(async () => { window.rtFindForOrder = window.__rig.rtFind0; invalidateCache(TABLES.ORDERS); await renderWeeklyIntl(); });
    await page.waitForTimeout(1200);
    n0 = F.writes.length;
    await page.evaluate(async () => { const e = WINTL.rows.find(r => r.type === 'export' && r.orderIds.includes('recRIGE3000000003')); await _wiStockReturnLone(e.id); });
    await page.waitForTimeout(1500);
    const wD = writesSince(F, n0);
    const iDel = wD.findIndex(w => w.m === 'DELETE' && w.table === 'ct_rt_legs' && w.rec === String(pgB));
    const iVeh = wD.findIndex(w => w.m === 'PATCH' && w.rec === newB && Array.isArray(w.fields.Truck) && !w.fields.Truck.length);
    ok('d23_leg_delete_before_vehicle_patch', iDel >= 0 && iVeh > iDel && F.rt.legs.join() === String(pgE3)
      && !wD.some(w => w.m === 'PATCH' && w.rec === 'recRIGE3000000003' && 'Truck' in (w.fields || {})), { iDel, iVeh, legs: F.rt.legs, wD: wD.map(w => w.m + ' ' + w.table + ' ' + w.rec + ' ' + JSON.stringify(w.fields || {})) });
    const pB = F.orders[newB].fields;
    ok('b04_lone_return_clears_group', !('Group ID' in pB) && !pB.Truck && pB.Status === 'Pending' && wD.some(w => w.m === 'PATCH' && w.rec === newB && w.fields['Group ID'] === null), pB);
    undo.return_lone = await undoOf(page);
    await page.evaluate(() => { window.rtFindForOrder = async () => ({ pg: null, rt: null }); });
    F.rt = null;

    // B-07: «×» on E4, whose import group is [I4, P3 (piece)] — the confirm
    // says the piece returns to stock; the piece leaves the group (null) and
    // its truck; the lone survivor I4 is no group any more (as «Ακύρωση
    // groupage» leaves it); the shelf re-reads.
    n0 = F.writes.length;
    const b07 = await page.evaluate(async () => {
      const e = WINTL.rows.find(r => r.type === 'export' && r.orderIds.includes('recRIGE4000000004'));
      const c0 = window.__rig.confirms.length;
      // the real «×» of the group pill, whatever function it calls
      document.querySelector(`#wi-row-${e.id} .wk3-unm`).click(); await new Promise(r => setTimeout(r, 2500));
      return { confirm: window.__rig.confirms.slice(c0).join(' / '), loose: (WINTL.data.stock && WINTL.data.stock.loose || []).map(p => p.id) };
    });
    const p3 = F.orders.recRIGP3000000003.fields, i4 = F.orders.recRIGI4000000004.fields;
    ok('b07_unmatch_returns_piece', /#312 \(4p\) βγαίνει και από την ομάδα και επιστρέφει στο απόθεμα/.test(b07.confirm)
      && !('Group ID' in p3) && !p3.Truck && !('Group ID' in i4) && !i4.Truck && !F.orders.recRIGE4000000004.fields['Matched Import ID']
      && b07.loose.includes('recRIGP3000000003'), { b07, p3, i4, writes: writesSince(F, n0).map(w => w.m + ' ' + w.rec + ' ' + JSON.stringify(w.fields || {})) });
    undo.unmatch_piece = await undoOf(page);
    ok('b13_no_undo_after_stock_actions', Object.values(undo).every(v => v === null), undo);

    // Fullscreen: the strip stays inside the sheet; a chip click leaves fullscreen and opens the panel.
    await page.evaluate(async () => { await renderWeeklyIntl(); }); await page.waitForTimeout(1200);
    await page.locator('.wk-more-t').click(); await page.locator('#wi-fs').click(); await page.waitForTimeout(700);
    const fs1 = await page.evaluate(() => ({ fs: !!document.fullscreenElement, shelfInside: !!(document.fullscreenElement && document.fullscreenElement.querySelector('#wi-shelf')) }));
    await shot(page, 'stock-shelf-fullscreen-1440.png'); out.screens.push('stock-shelf-fullscreen-1440.png');
    await page.locator('.wi-shelf-chip').first().click(); await page.waitForTimeout(900);
    const fs2 = await page.evaluate(() => ({ fs: !!document.fullscreenElement, panel: getComputedStyle(document.getElementById('wi-panel')).display, text: document.getElementById('wi-panel').innerText.replace(/\s+/g, ' ').slice(0, 300) }));
    ok('fullscreen_shelf_and_exit', fs1.fs && fs1.shelfInside && !fs2.fs && fs2.panel === 'block', { fs1, fs2 });
    await shot(page, 'stock-lot-panel-dispatcher-1440.png'); out.screens.push('stock-lot-panel-dispatcher-1440.png');
    // Background reads of OTHER screens (command center: unassigned loads; a
    // bare list) are answered empty on purpose; anything else unrecognised is
    // a read this board makes that the rig does not model → red.
    const foreign = f => /\{Truck\}=BLANK\(\),IS_AFTER\(\{Delivery DateTime\}/.test(f) || /^tblgHlNmLBH3JTdIM\s*$/.test(f);
    out.checks.unknownFormulas = { ok: !F.unknown.filter(f => !foreign(f)).length, detail: F.unknown };
    out.checks.consoleErrors = { ok: true, detail: errs.slice(0, 8) };
    await ctx.close();
  }

  // 2) management — shelf visible, chip panel without buttons, no menus.
  //    The Worker here does NOT serve «Pieces Moving» (D3 fallback): no red.
  {
    const F = makeFacade(); F.noMoving = true;
    const { ctx, page } = await openBoard(browser, 'management', F);
    const nm = await page.evaluate(() => [...document.querySelectorAll('#wi-shelf .wi-shelf-chip')].map(c => c.dataset.lot + ' ' + c.className));
    ok('d3_label_absent_no_red', nm.length === 3 && !nm.some(c => /nointake/.test(c)), nm);
    await page.locator('.wi-shelf-chip').first().click(); await page.waitForTimeout(900);
    const m = await page.evaluate(() => ({ shelf: !!document.getElementById('wi-shelf'), buttons: [...document.querySelectorAll('#wi-panel .wi-panel-ft button, #wi-panel .wi2-unlink')].map(b => b.textContent.trim()) }));
    ok('management_read_only', m.shelf && !m.buttons.length, m);
    await shot(page, 'stock-shelf-management-1440.png'); out.screens.push('stock-shelf-management-1440.png');
    await ctx.close();
  }

  // 3) no stock — no strip, header at its old place.
  {
    const F = makeFacade();
    const { ctx, page } = await openBoard(browser, 'dispatcher', F, { noStock: true });
    const n = await page.evaluate(() => ({ shelf: !!document.getElementById('wi-shelf') && document.getElementById('wi-shelf').innerHTML !== '', has: document.querySelector('.wk3.wi2').classList.contains('has-shelf'), colsTop: getComputedStyle(document.querySelector('.wk3-cols')).top }));
    ok('no_stock_no_strip', !n.shelf && !n.has && n.colsTop === '0px', n);
    await shot(page, 'stock-shelf-none-1440.png'); out.screens.push('stock-shelf-none-1440.png');
    await ctx.close();
  }

  // 4) read failure — red strip, never silent.
  {
    const F = makeFacade(); F.failLots = true;
    const { ctx, page } = await openBoard(browser, 'dispatcher', F);
    const t = await page.evaluate(() => (document.getElementById('wi-shelf') || {}).innerText || '');
    ok('failure_red_strip', /ΑΠΟΘΕΜΑ — δεν φορτώθηκε ↻/.test(t), t);
    await shot(page, 'stock-shelf-failed-1440.png'); out.screens.push('stock-shelf-failed-1440.png');
    await ctx.close();
  }

  // 5) a received lot with NO piece drawn: no «κλείσιμο;» nudge on the chip,
  //    but «Κλείσιμο υπολοίπου…» IS offered (else its one invoice never comes).
  {
    const F = makeFacade();
    const { ctx, page } = await openBoard(browser, 'dispatcher', F, { zeroLot: true, noLoose: true });
    // W1 (S5-01): no loose piece anywhere → no «0 κομμάτια χωρίς φορτηγό».
    const lz = await page.evaluate(() => ({ btn: !!document.querySelector('#wi-shelf .wi-shelf-loose'), text: (document.getElementById('wi-shelf') || {}).innerText }));
    ok('w1_loose_hidden_at_zero', !lz.btn && !/χωρίς φορτηγό/.test(lz.text || ''), lz);
    await page.locator('.wi-shelf-chip[data-lot="recRIGSTOCKLOTC1"]').click(); await page.waitForTimeout(900);
    const z = await page.evaluate(() => ({ chip: (document.querySelector('.wi-shelf-chip[data-lot="recRIGSTOCKLOTC1"]') || {}).className,
      buttons: [...document.querySelectorAll('#wi-panel .wi-panel-ft button')].map(b => b.textContent.trim()),
      cls: [...document.querySelectorAll('#wi-panel .wi-panel-ft button')].map(b => b.textContent.trim() + ' [' + b.className + ']'),
      text: document.getElementById('wi-panel').innerText.replace(/\s+/g, ' ').slice(0, 260) }));
    // W2 (C1-04, S5-07): a fresh lot with no piece — no zero lines, «+ Κομμάτι»
    // is the main action and «Κλείσιμο υπολοίπου…» only a ghost (offered).
    ok('w2_zero_lot_close_not_primary', z.cls.includes('+ Κομμάτι [btn btn-primary]') && z.cls.includes('Κλείσιμο υπολοίπου… [btn btn-ghost]')
      && !/Κομμάτια ·|Κανένα κομμάτι|0 παραδόθηκαν/.test(z.text), z);
    await shot(page, 'stock-lot-zero-pieces-close-1440.png'); out.screens.push('stock-lot-zero-pieces-close-1440.png');
    // A missing button is a red check, never a crash before RESULT.
    let modal = '';
    if (z.buttons.includes('Κλείσιμο υπολοίπου…')) {
      await page.locator('#wi-panel .wi-panel-ft button', { hasText: 'Κλείσιμο υπολοίπου' }).click(); await page.waitForTimeout(500);
      modal = await page.evaluate(() => (document.getElementById('modal') || {}).innerText || '');
    }
    // The modal's words are OrdersStock's (round 1 O1 names a no-piece close
    // «ΟΛΗ η παρτίδα»); the rig accepts both the old and the new sentence.
    ok('zero_piece_lot_closable', !/ close/.test(z.chip || '') && z.buttons.includes('Κλείσιμο υπολοίπου…') && /Μένουν 10 παλέτες|ΟΛΗ η παρτίδα \(10 παλέτες\)/.test(modal), { z, modal: modal.replace(/\s+/g, ' ').slice(0, 200) });
    await ctx.close();
  }

  // 6) prints, CSV, partners, groupage, menus — a fresh week with an export
  //    lot (#330, own truck), a truckless GI group holding a piece (I7 + P6)
  //    and a Case B pair whose vehicle copy never landed (E3 → P5).
  {
    const F = makeFacade();
    const { ctx, page } = await openBoard(browser, 'dispatcher', F, { extra: true });
    const rowOf = oid => rowIdOf(page, oid);

    // K9 (round 1): «Αυτόματο ταίριασμα (N)» = what the auto-match will take:
    // unmatched import rows holding no lot and no piece. The truckless group
    // I7 + P6 is unmatched but never auto-matched — it is not in N.
    const k9 = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.wk3-sub .wi2-btn')].find(b => /Αυτόματο ταίριασμα/.test(b.textContent));
      const stockIn = r => (r.orderIds || [r.orderId]).some(id => { const x = WINTL.data.imports.find(i => i.id === id); return !!x && (OrdersStock.isPiece(x.fields) || OrdersStock.isLot(x.fields)); });
      const want = WINTL.rows.filter(r => r.type === 'import' && !r.matchedTo && !stockIn(r)).map(r => r.orderId);
      return { btn: btn ? btn.textContent.trim() : null, n: btn ? +((/\((\d+)\)/.exec(btn.textContent) || [])[1]) : 0, want };
    });
    ok('k9_auto_match_count_is_what_it_takes', k9.n === k9.want.length && !k9.want.includes('recRIGI7000000007'), k9);
    // Round 1b (reviewer P3-1): an adjacent-week import is not in the tally, so not in «(N)» either —
    // alone it showed a button main never showed. I8 (plain, unmatched) moves to another plan week.
    const autoCnt = () => page.evaluate(() => { const b = [...document.querySelectorAll('.wk3-sub .wi2-btn')].find(x => /Αυτόματο ταίριασμα/.test(x.textContent)); return b ? +((/\((\d+)\)/.exec(b.textContent) || [])[1]) : 0; });
    const rerender = () => page.evaluate(async () => { invalidateCache(TABLES.ORDERS); await renderWeeklyIntl(); });
    const k9before = await autoCnt();
    const i8 = F.orders.recRIGI8000000008.fields;
    const ws = await page.evaluate(() => WINTL._range.ws);
    const nextWs = (() => { const t = new Date(ws + 'T12:00:00'); t.setDate(t.getDate() + 7); return t.toISOString().slice(0, 10); })();
    i8['Plan Week Start'] = nextWs; await rerender();
    const k9adj = { before: k9before, after: await autoCnt(), adjRow: await page.evaluate(() => !!WINTL.rows.find(r => r.orderId === 'recRIGI8000000008' && r.adj)) };
    delete i8['Plan Week Start']; await rerender();
    k9adj.restored = await autoCnt();
    ok('k9_1b_adjacent_week_not_counted', k9adj.adjRow && k9adj.after === k9adj.before - 1 && k9adj.restored === k9adj.before, k9adj);

    // C4-06 (round 1): the import-only group's ⎙I (I7 + P6) has the share
    // menu query, like the matched export row's.
    const c406 = await page.evaluate(() => { const b = document.querySelector('#wi-imp-recRIGI7000000007 .wk3-prt.r'); return b ? { shq: b.dataset.shq || null, title: b.title } : null; });
    ok('c406_import_only_group_share', !!c406 && /^orderIds=recRIGI7000000007,recRIGP6000000006&leg=import&sheet=driver$/.test(c406.shq || ''), c406);

    // PR-10: the week's paper lists every member of a truck's import group,
    // «ΑΠ» before a piece; a lot row says «→ ΑΠΟΘΗΚΗ».
    const pw = await page.evaluate(() => { const n = window.__rig.printed.length; _wiPrintWeek(); return (window.__rig.printed[n] || {}).html || ''; });
    const pwRows = pw.split('<tr>').slice(1);
    const e4 = pwRows.find(r => /ΙΔ\./.test(r) && /<br>ΑΠ /.test(r)) || '';
    ok('pr10_week_print_members', !!e4 && (e4.match(/<br>/g) || []).length === 1 && pwRows.some(r => /→ ΑΠΟΘΗΚΗ/.test(r)), { e4: e4.replace(/\s+/g, ' ').slice(0, 400), lotRows: pwRows.filter(r => /ΑΠΟΘΗΚΗ/.test(r)).length });
    // C4-07 (round 1): the paper's «N εισαγωγές» is the board's «ΕΙΣΑΓΩΓΗ · N».
    const hdrN = await page.evaluate(() => (/ΕΙΣΑΓΩΓΗ\s*·\s*(\d+)/.exec([...document.querySelectorAll('.wk3-cols .c')].map(c => c.textContent).join(' ')) || [])[1]);
    const pwN = (/(\d+) εισαγωγές/.exec(pw) || [])[1];
    ok('c407_week_print_counts_board_imports', !!pwN && pwN === hdrN, { pwN, hdrN });
    // K11 (round 1): the export column is never blank — «Loading/Delivery
    // Summary» is not a facade field; the board's place chain fills it.
    const routes = pwRows.map(r => (r.split('<td')[2] || '').replace(/^[^>]*>/, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    const blank = routes.filter(t => { const [a, b] = t.split(' → '); return !a || a === '—' || !b || /^(—|·|$)/.test(b.trim()); });
    ok('k11_week_print_route_not_blank', routes.length > 0 && !blank.length, { routes: routes.slice(0, 4), blank });

    // B-25/PR-11: CSV «Απόθεμα» column and a filled «Order No».
    await page.evaluate(() => _wiExportCSV()); await page.waitForTimeout(500);
    const csv = await page.evaluate(() => window.__rig.csv.slice(-1)[0] || '');
    const lines = csv.replace(/^\ufeff/, '').split('\n');
    const col = (l, i) => (l.match(/"((?:[^"]|"")*)"/g) || [])[i];
    const byNo = n => lines.find(l => col(l, 0) === `"${n}"`) || '';
    const noOf = id => F.no(id);
    ok('b25_csv_stock_column', col(lines[0], 13) === '"Απόθεμα"' && lines.slice(1).every(l => col(l, 0) !== '""')
      && col(byNo(312), 13) === '"Παρτίδα #312"' && col(byNo(330), 13) === '"Παρτίδα #330"' && col(byNo(noOf('recRIGP3000000003')), 13) === '"Κομμάτι #312"'
      && col(byNo(noOf('recRIGP4000000004')), 13) === '"Κομμάτι #318"' && col(byNo(noOf('recRIGI5000000005')), 13) === '""',
      lines.slice(0, 3).concat(['…', byNo(312), byNo(noOf('recRIGP3000000003')), byNo(noOf('recRIGI5000000005'))]));

    // B-05: no piece on a partner — popover (export whose import group holds
    // a piece), popover via the server-only GI sibling, drag/drop of a loose
    // piece and of a group onto a partner export. Toast, and nothing written.
    const PA = await page.evaluate(() => getRefPartners()[0].id);
    const tryPartner = async (oid, hide) => {
      const rid = await rowOf(oid); const n0 = F.writes.length;
      const t = await page.evaluate(async ([r, pa, hideId]) => {
        const n = window.__rig.toasts.length;
        if (hideId) WINTL.data.imports = WINTL.data.imports.filter(x => x.id !== hideId);   // «not in this view»
        _wiField(r, 'partnerId', pa); _wiField(r, 'partnerRate', '500'); _wiField(r, 'partnerRateImp', '300');
        await _wiSaveFromPopover(r); return window.__rig.toasts.slice(n);
      }, [rid, PA, hide || null]);
      return { toasts: t, writes: writesSince(F, n0).length };
    };
    const popE4 = await tryPartner('recRIGE4000000004');
    const popI7 = await tryPartner('recRIGI7000000007', 'recRIGP6000000006');
    await page.evaluate(async () => { invalidateCache(TABLES.ORDERS); await renderWeeklyIntl(); }); await page.waitForTimeout(1200);
    const drop = async (impId, expOid) => { const rid = await rowOf(expOid); const n0 = F.writes.length;
      const t = await page.evaluate(async ([i, r]) => { const n = window.__rig.toasts.length; window._wiDragging = i; await _wiDropOnRow({ preventDefault() {} }, r); return window.__rig.toasts.slice(n); }, [impId, rid]);
      return { toasts: t, writes: writesSince(F, n0).length }; };
    const dropLoose = await drop('recRIGP3000000003', 'recRIGE5000000005');
    const dropGroup = await drop('recRIGI4000000004', 'recRIGE5000000005');
    const own = r => r.writes === 0 && r.toasts.some(t => /Κομμάτι αποθέματος μόνο σε δικό μας φορτηγό/.test(t) && !/Φ1/.test(t));
    ok('b05_no_piece_on_partner', own(popE4) && own(popI7) && own(dropLoose) && own(dropGroup), { popE4, popI7, dropLoose, dropGroup });

    // B-09: a row holding a piece offers no «Groupage εισαγωγών», no
    // candidate list offers one, and _wiImpGroup refuses one.
    const rI7 = await rowOf('recRIGI7000000007'), rI5 = await rowOf('recRIGI5000000005');
    const mI7 = await ctxMenu(page, `_wiImpCtx(${fakeEv},${rI7})`);
    const cand = await page.evaluate(r => { _wiPanelGroupBuild(r, true); const v = [...document.querySelectorAll('.wiGrpPick')].map(b => +b.value);
      _wiPanelClose(); return v.map(id => (WINTL.rows.find(x => x.id === id) || {}).orderIds || []); }, rI5);
    let n6 = F.writes.length;
    const grpT = await page.evaluate(async ([a, b]) => { const n = window.__rig.toasts.length; await _wiImpGroup(a, b); return window.__rig.toasts.slice(n); }, [rI5, rI7]);
    ok('b09_no_import_groupage_with_piece', !/Groupage εισαγωγών/.test(mI7) && !cand.flat().some(id => /recRIGP/.test(id)) && cand.length > 0
      && writesSince(F, n6).length === 0 && grpT.some(t => /«\+ Κομμάτι από απόθεμα…»/.test(t)), { mI7, cand, grpT });

    // B-28: no «Σπάσιμο σκέλους» on a piece's row or a lot's row; a plain export keeps it.
    const mP4 = await ctxMenu(page, `_wiImpCtx(${fakeEv},${await rowOf('recRIGP4000000004')})`);
    const mLot = await ctxMenu(page, `_wiCtx(${fakeEv},${await rowOf('recRIGLOTE0000330')})`);
    const mE6 = await ctxMenu(page, `_wiCtx(${fakeEv},${await rowOf('recRIGE6000000006')})`);
    ok('b28_no_split_on_piece_or_lot', !/Σπάσιμο σκέλους/.test(mP4) && !/Σπάσιμο σκέλους/.test(mLot) && /Σπάσιμο σκέλους/.test(mE6), { mP4, mLot, mE6 });
    // W7 (Σ-05, round 1): a lot on OUR truck (#330) is still a lot — the lot
    // menu, never grouping, rota or merge (the DB refuses them: lot_grouped).
    ok('w7_own_truck_lot_gets_lot_menu', /ΠΑΡΤΙΔΑ → ΑΠΟΘΗΚΗ/.test(mLot) && !/Ομαδοποίηση|ρότα|Συγχώνευση|Καθαρισμός ανάθεσης/.test(mLot), mLot);

    // DL-06: in lot #312's panel, P5 (Case B import of E3, no vehicle yet)
    // has no [Διαγραφή]; the truly loose P3 has.
    await page.evaluate(() => _wiStockLotOpen(document.body, 'recRIGSTOCKLOTA1')); await page.waitForTimeout(900);
    const dl = await page.evaluate(() => { const has = id => { const el = [...document.querySelectorAll('#wi-stk-pieces .wi-stk-piece')].find(x => (x.getAttribute('onclick') || '').includes(id)); return el ? !!el.querySelector('.wi2-unlink') : null; };
      const r = { p5: has('recRIGP5000000005'), p3: has('recRIGP3000000003') }; _wiPanelClose(); return r; });
    ok('dl06_no_delete_on_matched_piece', dl.p5 === false && dl.p3 === true, dl);

    // B-22: E4's import starts moving (the server says In Transit, the board
    // still says Assigned) → the join is refused before any write; after a
    // repaint the menu item is disabled with the reason.
    F.orders.recRIGI4000000004.fields.Status = 'In Transit';
    n6 = F.writes.length;
    const t0 = await page.evaluate(() => window.__rig.toasts.length);
    await join(page, 'recRIGE4000000004', 'lot', 'recRIGSTOCKLOTA1'); await page.waitForTimeout(1200);
    const live = { writes: writesSince(F, n6).length, toasts: await page.evaluate(n => window.__rig.toasts.slice(n), t0), forms: await page.evaluate(() => window.__rig.pieceCalls.length) };
    await page.evaluate(async () => { invalidateCache(TABLES.ORDERS); await renderWeeklyIntl(); }); await page.waitForTimeout(1200);
    const mE4 = await ctxMenu(page, `_wiCtx(${fakeEv},${await rowOf('recRIGE4000000004')})`);
    ok('b22_no_case_a_on_moving_import', live.writes === 0 && live.forms === 0 && live.toasts.some(t => /σε κίνηση — όχι νέο κομμάτι/.test(t))
      && /disabled: .*\+ Κομμάτι από απόθεμα… \[σε κίνηση — όχι νέο κομμάτι\]/.test(mE4), { live, mE4 });
    await shot(page, 'stock-round0-extra-1440.png'); out.screens.push('stock-round0-extra-1440.png');

    // W6 / D1 (round 1): P6 sits in the truckless group GI-RIGOFF with I7. A
    // group is not a truck: the shelf lists it «χωρίς φορτηγό», the «+ Κομμάτι»
    // panel offers it, and the join OVERWRITES its old group (Σ-04).
    await page.evaluate(() => _wiStockLooseOpen(document.body)); await page.waitForTimeout(300);
    const p6line = await page.evaluate(() => { const el = [...document.querySelectorAll('#wi-panel .wi-stk-piece')].find(x => (x.getAttribute('onclick') || '').includes('recRIGP6000000006')); _wiPanelClose(); return el ? el.innerText.replace(/\s+/g, ' ') : null; });
    const rE1x = await rowOf('recRIGE1000000001');
    const offered = await page.evaluate(r => { _wiStockPanel(r); const ids = ((WINTL._stkPick || {}).loose || []).map(p => p.id); _wiPanelClose(); return ids; }, rE1x);
    let d1err = '';
    const n7 = F.writes.length;
    try { await join(page, 'recRIGE1000000001', 'piece', 'recRIGP6000000006'); await page.waitForTimeout(1500); } catch (e) { d1err = String(e.message || e); }
    const p6 = F.orders.recRIGP6000000006.fields, i1g = F.orders.recRIGI1000000001.fields['Group ID'];
    ok('d1_truckless_group_piece_is_loose_and_joinable', /· χωρίς φορτηγό ·/.test(p6line || '') && offered.includes('recRIGP6000000006') && !d1err
      && !!i1g && /\|recRIGI1000000001$/.test(i1g) && p6['Group ID'] === i1g && JSON.stringify(p6.Truck) === JSON.stringify(F.orders.recRIGI1000000001.fields.Truck),
      { p6line, offered, d1err, i1g, p6g: p6['Group ID'], writes: writesSince(F, n7).map(w => w.m + ' ' + w.rec + ' ' + JSON.stringify(w.fields || {})) });
    await ctx.close();
  }

  // 7) FEATURES.STOCK_LOTS = false (as config.js ships) — G-42: the three
  //    data-independent Weekly changes are proven, not just present.
  {
    const F = makeFacade();
    const { ctx, page } = await openBoard(browser, 'dispatcher', F, { switchOff: true });
    const off = await page.evaluate(() => ({ sw: FEATURES.STOCK_LOTS, shelf: !!document.getElementById('wi-shelf'), p3Row: !!document.getElementById('wi-imp-recRIGP3000000003') }));
    ok('g42_switch_off_board', off.sw === false && !off.shelf && off.p3Row, off);   // no shelf = no home: the loose piece keeps its row
    // (1) row pallets = Σ group members: I2 (10p) + I3 (8p) = 18p.
    const grpRow = await rowIdOf(page, 'recRIGI3000000003');
    const pals = await page.evaluate(r => { _wiPanelGroupBuild(r, true); const t = document.getElementById('wi-panel').innerText; _wiPanelClose(); return t.replace(/\s+/g, ' '); }, grpRow);
    ok('g42_off_row_pallets_sum', /\b18p( \/ 33p|\))/.test(pals), pals.slice(0, 300));
    // (2) the export finds its group by ANY member: after a reorder the lead is
    //     I3 while E2 still points at I2 — E2's row still draws both tiles.
    const seg = await page.evaluate(async () => {
      const find = () => WINTL.rows.find(r => r.type === 'import' && (r.orderIds || []).includes('recRIGI2000000002'));
      window._wiSegDrag = { rowId: find().id, orderId: 'recRIGI3000000003' };
      await _wiSegDrop({ preventDefault() {} }, find().id, 'recRIGI2000000002');
      await renderWeeklyIntl();
      const g = find(), e = WINTL.rows.find(r => r.type === 'export' && r.orderIds.includes('recRIGE2000000002'));
      const tiles = [...document.querySelectorAll(`#wi-row-${e.id} .wk3-seg[data-order-id]`)].map(x => x.dataset.orderId);
      return { rowId: g.id, lead: g.orderId, ptr: e.importId, tiles: [...new Set(tiles)] };
    });
    ok('g42_off_group_pill_any_member', seg.lead === 'recRIGI3000000003' && seg.ptr === 'recRIGI2000000002' && seg.tiles.includes('recRIGI2000000002') && seg.tiles.includes('recRIGI3000000003'), seg);
    // (3) the member the export points at leaves → Matched Import ID follows the lead.
    await page.evaluate(async r => { await _wiCancelGroupMember(r, 'recRIGI2000000002', true); }, seg.rowId);
    await page.waitForTimeout(600);
    ok('g42_off_pointer_follows_lead', F.orders.recRIGE2000000002.fields['Matched Import ID'] === 'recRIGI3000000003', F.orders.recRIGE2000000002.fields);
    await shot(page, 'stock-switch-off-1440.png'); out.screens.push('stock-switch-off-1440.png');
    await ctx.close();
  }

  // 8) Round 1 — the join against a server that moves (critic-3 Σ-01/Σ-07),
  //    D1 in Case B (a stale group is cleared before the match) and the loose
  //    pieces whose delivery day passed (critic-1 C1-02).
  {
    const F = makeFacade();
    const { ctx, page, ref } = await openBoard(browser, 'dispatcher', F, { r1: true });
    const [T1, , , , T5] = ref.trucks, [, , D3] = ref.drivers;
    const toastsSince = n => page.evaluate(k => window.__rig.toasts.slice(k), n);
    const nT = () => page.evaluate(() => window.__rig.toasts.length);

    // C1-02: P8 (loose, delivery 4 days ago) — the button says it, warn; the
    // list marks the line.
    const late = await page.evaluate(() => { const b = document.querySelector('#wi-shelf .wi-shelf-loose'); return b ? { text: b.textContent.trim(), cls: b.className } : null; });
    await page.evaluate(() => _wiStockLooseOpen(document.querySelector('#wi-shelf .wi-shelf-loose'))); await page.waitForTimeout(300);
    const p8line = await page.evaluate(() => { const el = [...document.querySelectorAll('#wi-panel .wi-stk-piece')].find(x => (x.getAttribute('onclick') || '').includes('recRIGP8000000008')); return el ? el.innerText.replace(/\s+/g, ' ') : null; });
    await shot(page, 'stock-loose-late-1440.png'); out.screens.push('stock-loose-late-1440.png');
    await page.evaluate(() => _wiPanelClose());
    ok('c102_loose_late_said', !!late && late.text === '3 κομμάτια χωρίς φορτηγό · 1 εκπρόθεσμο' && /\blate\b/.test(late.cls) && /εκπρόθεσμο/.test(p8line || ''), { late, p8line });
    // D1: P9 (stale «GI-DEAD|…», no truck) lives on the shelf, not as a board row.
    const p9row = await page.evaluate(() => !!document.getElementById('wi-imp-recRIGP9000000009'));
    ok('d1_stale_group_piece_on_shelf_not_board', !p9row, { p9row });

    // Σ-07b: the lone lead's lock LANDS but its answer is lost → the board
    // reads I1, finds the lock, and joins P3 (it used to stop: «η σειρά ΔΕΝ
    // γράφτηκε», the lead left in a one-member group, the piece on the shelf).
    F.lose = { recId: 'recRIGI1000000001', n: 3 };
    let t0 = await nT();
    await join(page, 'recRIGE1000000001', 'piece', 'recRIGP3000000003'); await page.waitForTimeout(6500);
    const g1 = F.orders.recRIGI1000000001.fields['Group ID'], p3f = F.orders.recRIGP3000000003.fields;
    let tt = await toastsSince(t0);
    ok('sigma07b_lost_lock_answer_read_back', !!g1 && p3f['Group ID'] === g1 && JSON.stringify(p3f.Truck) === JSON.stringify(F.orders.recRIGI1000000001.fields.Truck)
      && tt.some(t => /^success: Το κομμάτι μπήκε στο φορτηγό ✓/.test(t)) && !tt.some(t => /ΔΕΝ γράφτηκε|ΔΕΝ μπήκε/.test(t)), { g1, p3g: p3f['Group ID'], tt });
    F.lose = null;

    // Σ-07a: a new piece on E7's lone lead I9 — the join patch LANDS, its
    // answer is lost → said as on the truck, the lead's lock kept.
    F.loseNextPost = true;
    t0 = await nT();
    await join(page, 'recRIGE7000000007', 'lot', 'recRIGSTOCKLOTA1'); await page.waitForTimeout(6500);
    const new7 = (F.created || []).slice(-1)[0], n7f = F.orders[new7].fields, g9 = F.orders.recRIGI9000000009.fields['Group ID'];
    tt = await toastsSince(t0);
    ok('sigma07a_lost_join_answer_is_on_truck', !!g9 && n7f['Group ID'] === g9 && JSON.stringify(n7f.Truck) === JSON.stringify(F.orders.recRIGI9000000009.fields.Truck)
      && !tt.some(t => /ΧΩΡΙΣ φορτηγό|ΔΕΝ μπήκε|ΠΡΟΣΟΧΗ/.test(t)), { new7, g9, n7g: n7f['Group ID'], tt });
    F.lose = null; F.loseNextPost = false;

    // Σ-01 (driver): while the form is open, E2's lead I2 gets ANOTHER driver
    // → the one join patch carries the NEW driver (it used to POST the old
    // one, which rt_sync_from_order then wrote over the whole round trip).
    let n8 = F.writes.length;
    await page.evaluate(d => { window.__rig.beforeHook = async () => { await window.__rigSet('recRIGI2000000002', 'Driver', [d]); }; }, D3);
    await join(page, 'recRIGE2000000002', 'lot', 'recRIGSTOCKLOTA1'); await page.waitForTimeout(1500);
    await page.evaluate(() => { window.__rig.beforeHook = null; });
    const newD = (F.created || []).slice(-1)[0], wD1 = writesSince(F, n8);
    const postD = wD1.find(w => w.m === 'POST'), patchD = wD1.find(w => w.m === 'PATCH' && w.rec === newD);
    ok('sigma01_new_driver_written', postD && !(postD.fields.Driver || []).length && !(postD.fields.Truck || []).length
      && patchD && JSON.stringify(patchD.fields.Driver) === JSON.stringify([D3]) && JSON.stringify(F.orders[newD].fields.Driver) === JSON.stringify([D3]), { postD, patchD });

    // Σ-01 (truck): while the form is open, E8's lead I10 moves to another
    // truck → no lock, no join: the piece waits on the shelf, said why.
    n8 = F.writes.length; t0 = await nT();
    await page.evaluate(t => { window.__rig.beforeHook = async () => { await window.__rigSet('recRIGIA000000010', 'Truck', [t]); }; }, T1);
    await join(page, 'recRIGE8000000008', 'lot', 'recRIGSTOCKLOTA1'); await page.waitForTimeout(1500);
    await page.evaluate(() => { window.__rig.beforeHook = null; });
    const newT = (F.created || []).slice(-1)[0], wT = writesSince(F, n8);
    tt = await toastsSince(t0);
    ok('sigma01_truck_changed_no_join', wT.length === 1 && wT[0].m === 'POST' && !F.orders.recRIGIA000000010.fields['Group ID'] && !F.orders[newT].fields.Truck
      && tt.some(t => /^error: Το κομμάτι αποθηκεύτηκε ΧΩΡΙΣ φορτηγό \(το φορτηγό της εισαγωγής άλλαξε στο μεταξύ\)/.test(t)), { wT: wT.map(w => w.m + ' ' + w.rec + ' ' + JSON.stringify(w.fields)), tt });

    // Σ-07c: E4's import lead I4 has NO truck on the server (the board still
    // shows one) → refused before any write; no form opens.
    delete F.orders.recRIGI4000000004.fields.Truck;
    n8 = F.writes.length; t0 = await nT();
    const forms0 = await page.evaluate(() => window.__rig.pieceCalls.length);
    await join(page, 'recRIGE4000000004', 'lot', 'recRIGSTOCKLOTA1'); await page.waitForTimeout(1200);
    tt = await toastsSince(t0);
    ok('sigma07c_truckless_lead_refused', writesSince(F, n8).length === 0 && (await page.evaluate(() => window.__rig.pieceCalls.length)) === forms0
      && tt.some(t => /δεν έχει φορτηγό στη βάση — πρώτα ανάθεση — δεν γράφτηκε τίποτα/.test(t)), { tt, writes: writesSince(F, n8) });

    // D1, Case B: P9 still carries «GI-DEAD|…». Joined to E9 (own truck, no
    // import), its group is cleared FIRST — else the match would copy the
    // vehicle to whatever group that string names.
    await page.evaluate(async () => { invalidateCache(TABLES.ORDERS); await renderWeeklyIntl(); }); await page.waitForTimeout(1200);
    n8 = F.writes.length;
    let cbErr = '';
    try { await join(page, 'recRIGE9000000009', 'piece', 'recRIGP9000000009'); await page.waitForTimeout(2000); } catch (e) { cbErr = String(e.message || e); }
    const wB9 = writesSince(F, n8);
    const iClr = wB9.findIndex(w => w.m === 'PATCH' && w.rec === 'recRIGP9000000009' && w.fields && w.fields['Group ID'] === null);
    const iMatch = wB9.findIndex(w => w.m === 'PATCH' && w.rec === 'recRIGE9000000009' && w.fields && w.fields['Matched Import ID'] === 'recRIGP9000000009');
    const p9 = F.orders.recRIGP9000000009.fields;
    ok('d1_caseB_stale_group_cleared_before_match', !cbErr && iClr >= 0 && iMatch > iClr && !('Group ID' in p9) && !!p9.Truck,
      { cbErr, iClr, iMatch, writes: wB9.map(w => w.m + ' ' + w.rec + ' ' + JSON.stringify(w.fields || {})) });
    await shot(page, 'stock-r1-joins-1440.png'); out.screens.push('stock-r1-joins-1440.png');
    await ctx.close();
  }

  await browser.close();
  const failed = Object.entries(out.checks).filter(([, v]) => !v.ok).map(([k]) => k);
  console.log(JSON.stringify(out, null, 1));
  console.log(`\nRESULT: ${Object.keys(out.checks).length - failed.length}/${Object.keys(out.checks).length} OK${failed.length ? ' — FAILED: ' + failed.join(', ') : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('✗', e && e.stack || e); process.exit(1); });

module.exports = { makeFacade, installRoutes, buildStore, installStubs, openBoard, setBase: u => { baseURL = u; } };
