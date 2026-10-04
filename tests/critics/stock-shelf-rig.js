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
// Until FRONT-ORDERS is merged, OrdersStock and openIntlPieceCreate do not
// exist in the app: the rig installs stubs with the §5.2 signatures (only if
// they are missing, so the same rig runs unchanged after the merge). The
// piece-form stub "saves" at once: POST of OrdersStock.pieceFields(...) and the
// _wiOnPieceSaved hook, exactly the contract's order.
//
// Screens at 1440: shelf with 2 lots · no shelf · read failure · management
// (chip panel without buttons) · fullscreen · the «+ Κομμάτι» panel. Payloads:
// Case A lone import, Case A group with «|», Case B, loose-piece join, return
// to stock, a DB refusal (422 STOCK_RULE) reaching the screen in Greek, the
// counters without lots/loose pieces, and the lot drag refusal.
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
function makeFacade() {
  const F = { orders: {}, lots: {}, writes: [], unknown: [], failLots: false, refuse: null, seq: 0 };
  const isEmpty = v => v == null || (Array.isArray(v) && !v.length);
  const pals = f => { let s = 0; for (let i = 1; i <= 10; i++) s += +(f['Loading Pallets ' + i] || 0); return s; };
  const link = v => Array.isArray(v) ? v[0] : (v || null);
  const lotOfOrder = id => Object.values(F.lots).find(l => link(l.fields.Order) === id);
  const pieces = lotId => Object.values(F.orders).filter(o => !o.deleted && link(o.fields['Stock Lot']) === lotId);
  const matchedBy = id => Object.values(F.orders).some(o => !o.deleted && o.fields['Matched Import ID'] === id);
  // Read shape of the facade: NULL / empty links are ABSENT (CLAUDE.md trap 2),
  // computed labels come from the read view.
  F.read = o => {
    const f = {};
    for (const [k, v] of Object.entries(o.fields)) if (!isEmpty(v)) f[k] = v;
    f['Total Pallets'] = pals(o.fields);
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
    f['Pieces Without Truck'] = ps.filter(p => !link(p.fields.Truck) && !link(p.fields.Partner)
      && !String(p.fields['Group ID'] || '').trim() && !matchedBy(p.id) && p.fields.Status !== 'Delivered').length;
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
    // A DB refusal on demand: the Worker's 422 STOCK_RULE (contract §4.4).
    if (F.refuse && F.refuse.recId === recId && m === 'PATCH') {
      const e = F.refuse; F.refuse = null;
      return send(422, { error: { type: 'STOCK_RULE', code: e.code, message: e.message } });
    }
    if (m === 'PATCH') { const rec = F.patch(recId, body.fields || {}); return rec ? send(200, rec) : send(404, { error: { type: 'NOT_FOUND' } }); }
    if (m === 'POST') return send(200, F.create(body.fields || {}));
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
  // Loose piece P3 of lot A (no truck, no group).
  o('recRIGP3000000003', { Direction: 'Import', Client: [C1], 'Stock Lot': ['recRIGSTOCKLOTA1'], 'Loading DateTime': d(5, 7), 'Delivery DateTime': d(6), 'Loading Pallets 1': 4, 'Loading Location 1': [WH], 'Unloading Location 1': [L3], Reference: 'TEST-STOCK-P3' });
  // Lot B (#318): not received yet, but a piece is already moving → «nointake».
  o('recRIGLOTB0000318', { Direction: 'Import', Client: [C2], 'Loading DateTime': d(-9), 'Delivery DateTime': d(-8), 'Loading Pallets 1': 24, 'Loading Location 1': [L3], 'Unloading Location 1': [WH2], Partner: [PA2], 'Is Partner Trip': true, Status: 'Assigned' });
  F.lots.recRIGSTOCKLOTB1 = { id: 'recRIGSTOCKLOTB1', fields: { Order: ['recRIGLOTB0000318'], 'Lot No': 318, 'Source Kind': 'intl', Reference: 'LOT-B', 'Client Rec': C2, 'Client Name': ref.clientName[C2], 'Warehouse Rec': WH2, 'Warehouse Name': ref.locName[WH2], 'Warehouse City': ref.locCity[WH2], 'Warehouse Country': ref.locCountry[WH2], 'Intake Status': 'Assigned', 'Intake Delivered': false, 'Stock Pallets': 24 } };
  o('recRIGP4000000004', Object.assign({ Direction: 'Import', Client: [C2], 'Stock Lot': ['recRIGSTOCKLOTB1'], 'Loading DateTime': d(-2), 'Delivery DateTime': d(-1), 'Loading Pallets 1': 6, 'Loading Location 1': [WH2], 'Unloading Location 1': [L2], Reference: 'TEST-STOCK-P4' }, veh(T5, D1), { Status: 'In Transit' }));
}

// Page-side stubs (§5.2 signatures) — installed only when missing.
async function installStubs(page) {
  await page.evaluate(() => {
    FEATURES.STOCK_LOTS = true;
    TABLES.STOCK_LOTS = TABLES.STOCK_LOTS || 'tblStockLots';
    window.__rig = { pieceCalls: [], closeCalls: [], toasts: [], stubbed: [] };
    if (typeof OrdersStock === 'undefined') {
      window.__rig.stubbed.push('OrdersStock');
      const safe = async (fn) => { try { return await fn(); } catch (e) { return { ok: false, failed: true, error: e }; } };
      window.OrdersStock = {
        on() { return typeof FEATURES !== 'undefined' && FEATURES.STOCK_LOTS === true && !!(typeof TABLES !== 'undefined' && TABLES.STOCK_LOTS); },
        isPiece(f) { return !!getLinkedId(f && f['Stock Lot']); },
        isLot(f) { return !!(f && f['Own Stock Lot']); },
        lotRecOfPiece(f) { return getLinkedId(f && f['Stock Lot']) || null; },
        lotRecOfLot(f) { return (f && f['Own Stock Lot']) || null; },
        lotNumLabel(f) { const n = f && f['Stock Lot Order No']; return n ? (f['Stock Lot Source'] === 'natl' ? 'Ε-' : '#') + n : '—'; },
        lotLabel(lot) { const f = (lot && lot.fields) || {}; return f['Lot No'] ? (f['Source Kind'] === 'natl' ? 'Ε-' : '#') + f['Lot No'] : '—'; },
        canWrite() { return ['owner', 'dispatcher'].includes(ROLE); },
        canClose() { return ['owner', 'dispatcher', 'accountant'].includes(ROLE); },
        // Literal §5.2 rule. NOTE (open issue for FRONT-ORDERS): 'close' fires on
        // a received lot with 0 pieces (0 === 0) — the rig data avoids that case.
        chip(lot, today) {
          const f = lot.fields || {}, rem = +(f['Remaining Pallets'] || 0), stock = +(f['Stock Pallets'] || 0);
          const days = f['Received On'] ? Math.round((new Date(today + 'T12:00:00') - new Date(String(f['Received On']).slice(0, 10) + 'T12:00:00')) / 864e5) : null;
          let key = 'ok';
          if (!f['Intake Delivered'] && (+f['Pieces'] || 0) > (+f['Pieces Without Truck'] || 0)) key = 'nointake';
          else if (f['Intake Delivered'] && (+f['Pieces'] || 0) === (+f['Pieces Delivered'] || 0) && rem > 0 && !f['Closed At']) key = 'close';
          else if (f['Intake Delivered'] && days > 21) key = 'aging';
          return { key, days, remaining: rem, stock };
        },
        pieceFields(lot, presets, values) {
          const p = presets || {}, lf = lot.fields || {};
          const out = Object.assign({}, values || {}, { 'Stock Lot': [lot.id], Client: [lf['Client Rec']], Direction: 'Import', Type: 'International', 'Loading Location 1': [lf['Warehouse Rec']], 'Pallet Exchange': false });
          for (let i = 2; i <= 10; i++) out['Loading Location ' + i] = [];
          if (p.groupId) out['Group ID'] = p.groupId;
          if (p.truck) out.Truck = [p.truck]; if (p.trailer) out.Trailer = [p.trailer]; if (p.driver) out.Driver = [p.driver];
          out.Status = p.status === 'Assigned' ? 'Assigned' : 'Pending';
          if (p.loadingDate) out['Loading DateTime'] = p.loadingDate;
          if (p.deliveryDate) out['Delivery DateTime'] = p.deliveryDate;
          delete out.Price;
          return out;
        },
        loadLots(formula) { return safe(async () => ({ ok: true, lots: await atGetAll(TABLES.STOCK_LOTS, formula ? { filterByFormula: formula } : {}, false) })); },
        loadOpen() { return this.loadLots('{Complete}=0'); },
        loadPieces(lotRec) { return safe(async () => ({ ok: true, pieces: await atGetAll(TABLES.ORDERS, { filterByFormula: `FIND("${lotRec}",ARRAYJOIN({Stock Lot},","))>0` }, false) })); },
        loadLoosePieces() { return safe(async () => ({ ok: true, pieces: await atGetAll(TABLES.ORDERS, { filterByFormula: "AND({Stock Lot}!=BLANK(),{Truck}=BLANK(),{Partner}=BLANK(),{Status}!='Delivered')" }, false) })); },
        openCloseModal(lot) { window.__rig.closeCalls.push(lot.id); },
      };
    }
    if (typeof openIntlPieceCreate === 'undefined') {
      window.__rig.stubbed.push('openIntlPieceCreate');
      window.openIntlPieceCreate = async (lot, presets) => {
        window.__rig.pieceCalls.push({ lot: lot.id, presets: JSON.parse(JSON.stringify(presets || {})) });
        const values = { 'Loading Pallets 1': 5, Reference: 'TEST-STOCK-NEW', 'Unloading Location 1': [getRefLocations()[0].id] };
        const fields = OrdersStock.pieceFields(lot, presets, values);
        const rec = await atCreate(TABLES.ORDERS, fields);
        if (typeof window._wiOnPieceSaved === 'function') await window._wiOnPieceSaved(rec.id, fields, presets && presets.context);
        await renderWeeklyIntl();
      };
    }
    // Side systems this rig does not exercise: round trips, downstream sync.
    window.rtOnOrderSaved = async () => null;
    window.rtOnImportUnmatched = async () => null;
    window.rtFindForOrder = async () => ({ pg: null, rt: null });
    window.syncOrderDownstream = async () => null;
    window.confirmAction = async () => true;
    const t0 = window.toast, e0 = window.showErrorToast;
    window.toast = (m, ty) => { window.__rig.toasts.push((ty || 'success') + ': ' + m); return t0 && t0(m, ty); };
    window.showErrorToast = (m, ty) => { window.__rig.toasts.push((ty || 'error') + ': ' + m); return e0 && e0(m, ty); };
    invalidateCache(TABLES.ORDERS);
  });
}

async function openBoard(browser, role, F, opts) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL, locale: 'el-GR', timezoneId: 'Europe/Athens' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('requestfailed', r => { if (r.url().includes(HOST)) errs.push('requestfailed: ' + decodeURIComponent(r.url()).slice(0, 220)); });
  page.on('dialog', d => d.accept());
  await preparePage(page, role);
  await installRoutes(page, F);
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
  // opts.switchOff: no stubs, FEATURES.STOCK_LOTS untouched — the board as it
  // ships today (used by the switch-off parity check).
  if (!(opts && opts.switchOff)) await installStubs(page);
  await page.evaluate(async () => { invalidateCache(TABLES.ORDERS); await renderWeeklyIntl(); });
  await page.waitForTimeout(F.failLots ? 6500 : 1200);
  // A board that did not paint must stop the rig loudly, with what it said.
  const painted = await page.evaluate(() => ({ ok: !!document.querySelector('#content .wk3.wi2'), page: typeof currentPage !== 'undefined' ? currentPage : '?', text: (document.getElementById('content') || {}).innerText }));
  if (!painted.ok) throw new Error(`board not painted (${role}, page=${painted.page}): ${String(painted.text || '').slice(0, 400)} · console: ${errs.slice(0, 5).join(' / ')} · unknown: ${F.unknown.join(' / ')}`);
  return { ctx, page, errs, ref };
}

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
    await shot(page, 'stock-shelf-2lots-compact-header-1440.png'); out.screens.push('stock-shelf-2lots-compact-header-1440.png');

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
      apLoose: !!document.querySelector('#wi-imp-recRIGP3000000003 .wi-b-ap'),
      lot: (document.querySelector('#wi-imp-recRIGLOTA0000312 .wi-b-lot') || {}).textContent || null,
      lastTile: (() => { const p = [...document.querySelectorAll('.wk3-segpill')].find(x => x.querySelector('[data-order-id="recRIGP2000000002"]')); const s = p ? [...p.querySelectorAll('.wk3-seg[data-order-id]')] : []; return s.length ? s[s.length - 1].dataset.orderId : null; })(),
    }));
    ok('badges', badges.apTile.length >= 1 && /Κομμάτι 5\/33p · παρτίδα #312/.test(badges.apTile[0]) && badges.apLoose && /ΑΠΟΘΗΚΗ/.test(badges.lot || '') && badges.lastTile === 'recRIGP2000000002', badges);

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
    ok('panel_free_space', /Ελεύθερος χώρος εισαγωγής: 33 − 0 = 33p/.test(panel) && /#312/.test(panel) && /Κομμάτια χωρίς φορτηγό/.test(panel), panel.replace(/\n/g, ' | '));
    await shot(page, 'stock-panel-add-piece-1440.png'); out.screens.push('stock-panel-add-piece-1440.png');
    await page.evaluate(() => _wiPanelClose());

    // Case A — lone import: suffix on the lead, then ONE POST with that Group ID.
    let n0 = F.writes.length;
    await join(page, 'recRIGE1000000001', 'lot', 'recRIGSTOCKLOTA1');
    await page.waitForTimeout(1500);
    const wA = writesSince(F, n0);
    const lead = wA.find(w => w.m === 'PATCH' && w.rec === 'recRIGI1000000001');
    const post = wA.find(w => w.m === 'POST');
    const gidA = lead && lead.fields['Group ID'];
    ok('caseA_lone_suffix_on_lead', !!gidA && /^GI-[0-9A-Z]+\|recRIGI1000000001$/.test(gidA), lead);
    ok('caseA_lone_post', post && post.fields['Group ID'] === gidA && JSON.stringify(post.fields['Stock Lot']) === '["recRIGSTOCKLOTA1"]' && post.fields.Status === 'Assigned' && !('Price' in post.fields) && post.fields.Truck && post.fields.Truck[0] === F.orders.recRIGI1000000001.fields.Truck[0], post);
    const presetsA = await page.evaluate(() => window.__rig.pieceCalls.slice(-1)[0]);
    ok('caseA_presets', presetsA && presetsA.presets.lockLoadingDate === true && presetsA.presets.context && presetsA.presets.context.kind === 'A', presetsA);
    const afterA = await page.evaluate(() => { const r = WINTL.rows.find(x => x.type === 'import' && (x.orderIds || []).includes('recRIGI1000000001'));
      return r ? { lead: r.orderId, ids: r.orderIds, sync: (WINTL._syncLog || {}) } : null; });
    ok('caseA_piece_last_lead_kept', afterA && afterA.lead === 'recRIGI1000000001' && afterA.ids.length === 2, afterA);

    // Case A — group with «|»: no Group ID write on the members.
    n0 = F.writes.length;
    await join(page, 'recRIGE2000000002', 'lot', 'recRIGSTOCKLOTA1');
    await page.waitForTimeout(1500);
    const wG = writesSince(F, n0);
    ok('caseA_group_untouched', !wG.some(w => w.m === 'PATCH' && /recRIGI[23]/.test(w.rec || '')) && wG.some(w => w.m === 'POST' && w.fields['Group ID'] === 'GI-RIGGRP|recRIGI2000000002,recRIGI3000000003'), wG);

    // Case B — POST (no Group ID), then the export's Matched Import ID, then the vehicle.
    n0 = F.writes.length;
    await join(page, 'recRIGE3000000003', 'lot', 'recRIGSTOCKLOTA1');
    await page.waitForTimeout(2000);
    const wB = writesSince(F, n0);
    const postB = wB.find(w => w.m === 'POST');
    const matchB = wB.find(w => w.m === 'PATCH' && w.rec === 'recRIGE3000000003');
    const newB = (F.created || []).slice(-1)[0];
    ok('caseB_post_then_match', postB && !postB.fields['Group ID'] && matchB && matchB.fields['Matched Import ID'] === newB
      && wB.findIndex(w => w === postB) < wB.findIndex(w => w === matchB)
      && wB.some(w => w.m === 'PATCH' && w.rec === newB && w.fields.Truck && w.fields.Status === 'Assigned'), { newB, wB });

    // Loose piece join (Case A on E4's group whose suffix is «GI-RIGRET|I4»): ONE PATCH.
    n0 = F.writes.length;
    await join(page, 'recRIGE4000000004', 'piece', 'recRIGP3000000003');
    await page.waitForTimeout(1500);
    const wL = writesSince(F, n0).filter(w => w.rec === 'recRIGP3000000003');
    ok('loose_one_patch', wL.length === 1 && wL[0].fields['Group ID'] === 'GI-RIGRET|recRIGI4000000004' && wL[0].fields.Status === 'Assigned' && wL[0].fields['Loading DateTime'] && wL[0].fields['Delivery DateTime'] && wL[0].fields.Truck, wL);

    // Return to stock from the «ΑΠ» tile of P2: Group ID '' + vehicle off + Pending.
    n0 = F.writes.length;
    await page.evaluate(async () => { const row = WINTL.rows.find(r => r.type === 'import' && (r.orderIds || []).includes('recRIGP2000000002'));
      await _wiStockReturn(row.id, 'recRIGP2000000002', true); });
    await page.waitForTimeout(1200);
    const wR = writesSince(F, n0).filter(w => w.rec === 'recRIGP2000000002');
    ok('return_to_stock_payload', wR.length === 1 && wR[0].fields['Group ID'] === '' && Array.isArray(wR[0].fields.Truck) && !wR[0].fields.Truck.length && wR[0].fields.Status === 'Pending', wR);

    // A DB refusal reaches the screen in Greek, with ⚠ on the row.
    await page.evaluate(async () => { await renderWeeklyIntl(); }); await page.waitForTimeout(1200);
    F.refuse = { recId: 'recRIGP2000000002', code: 'lot_closed', message: 'Η παρτίδα έκλεισε — όχι νέα κομμάτια ή αλλαγές παλετών' };
    const rE1b = await rowIdOf(page, 'recRIGE1000000001');
    const before = JSON.stringify(F.orders.recRIGP2000000002.fields);
    await join(page, 'recRIGE1000000001', 'piece', 'recRIGP2000000002');
    await page.waitForTimeout(1500);
    const refusal = await page.evaluate(r => ({ toasts: window.__rig.toasts.slice(-4), sync: (document.getElementById('wi-sync-' + r) || {}).textContent }), rE1b);
    ok('db_refusal_greek', refusal.toasts.some(t => /Η παρτίδα έκλεισε/.test(t)) && refusal.sync === '⚠' && JSON.stringify(F.orders.recRIGP2000000002.fields) === before, refusal);
    await shot(page, 'stock-db-refusal-1440.png'); out.screens.push('stock-db-refusal-1440.png');

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
  {
    const F = makeFacade();
    const { ctx, page } = await openBoard(browser, 'management', F);
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

  await browser.close();
  const failed = Object.entries(out.checks).filter(([, v]) => !v.ok).map(([k]) => k);
  console.log(JSON.stringify(out, null, 1));
  console.log(`\nRESULT: ${Object.keys(out.checks).length - failed.length}/${Object.keys(out.checks).length} OK${failed.length ? ' — FAILED: ' + failed.join(', ') : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('✗', e && e.stack || e); process.exit(1); });

module.exports = { makeFacade, installRoutes, buildStore, installStubs, openBoard, setBase: u => { baseURL = u; } };
