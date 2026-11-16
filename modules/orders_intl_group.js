// ═══════════════════════════════════════════════════════════════════════════
// ONE INTERNATIONAL FORM: single load and groupage (owner 15/11/2026)
// Design: docs/design/redesign-2026-11/groupage-from-the-form.md (19 decisions), mock-up index.html s3 / #f3 / #f6.
//
// The order form of 8/11 (modules/orders_intl.js) stays the engine: every check, the stops, the VS sync, the
// pallets, the stock rules, the scan file. This file is the shell around it:
//   - head: «Απλό φορτίο | Groupage» and «Εξαγωγή | Εισαγωγή» (one direction for the whole load);
//   - the orders, one under the other; the open one is the form of 8/11, the others a line with a bin;
//   - add by «Παραγγελία», «Από αρχείο», «Υπάρχουσα», «Κομμάτι από απόθεμα» (import only, owner 15/11);
//   - a side panel «Σειρά φόρτωσης» / «Σειρά παράδοσης», dragged PER POINT (owner 15/11 «Ανά σημείο»);
//   - «Αποθήκευση · N παραγγελίες»: N SEPARATE orders in the catalogue, tied by one Group ID.
//
// Why the form of one order is reused and not rewritten: it carries two months of rules (lots, pieces, VS per point,
// hours, the exchange per point, the read-backs). Each order of a groupage is that form, mounted in its own element;
// only the open one is in the page (the field ids are the form's own, unique in the page), the others are kept
// detached with their values and their per-form state (INTL_ORDERS.*, the scan file, the client order files).
//
// What a groupage save writes, and why in this order (risks 1, 2, 4, 5 of the impact check):
//   1. every order is CHECKED first (submitIntlOrder dryRun): a refusal on order 3 leaves nothing written;
//   2. the orders are written one after the other, each with the base Group ID (identical text on all members, so
//      the board collapses them and 066 joins them on one round trip) and its points' place «Load Seq» (113);
//      an order already created in an earlier press is PATCHED, never created twice (its id is kept per order);
//   3. the full Group ID «base|id1,id2,…» on every member, read back: the order list the old Weekly, the driver
//      sheet and the round-trip feed read today (export = delivery order, import = loading order). It is DERIVED
//      from the per-point places, never edited apart, so the two cannot disagree after a save of this form;
//   4. the points read back: a «Load Seq» the server did not keep is said, loud (principle 2);
//   5. the round trip once for the whole load, the pending match once, one repaint.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const IG = { s: null };
// orders_intl.js is an IIFE: its state and steps come through window._OI only (named there).
const OI = () => window._OI;
const ST = () => window._OI.st();
const MAX_PAL = 33;   // the truck the scan preview and the form already measure against

function on() { return typeof FEATURES !== 'undefined' && FEATURES.INTL_GROUP_FORM === true; }
const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v));
const note = (msg) => `<span class="igx-note" title="${esc(msg)}" aria-label="${esc(msg)}">!</span>`;
const dayOf = d => (typeof PlainRef !== 'undefined' && d ? PlainRef.day(d) : (d || ''));

// ── The per-form state of orders_intl.js, kept per order ─────────────────────
const OI_KEYS = ['_createdId', '_markPending', '_markPendingCtx', '_whPool', '_loadedFields', '_preConvert',
  '_preConvertCountry', '_stock', '_stopsFail', '_prefill', '_formSnap'];
function capture() {
  const g = {};
  OI_KEYS.forEach(k => { g[k] = ST()[k]; });
  g.sCntL = window._sCntL; g.sCntU = window._sCntU;
  g.scanDoc = window._scanPendingDoc || null; g.scanRes = window._scanResult || null;
  g.reqAck = OI().getAck();
  g.docs = typeof OrderDocs !== 'undefined' && OrderDocs.formState ? OrderDocs.formState() : null;
  return g;
}
function restore(g) {
  if (!g) return;
  OI_KEYS.forEach(k => { ST()[k] = g[k]; });
  window._sCntL = g.sCntL; window._sCntU = g.sCntU;
  if (g.scanDoc) window._scanPendingDoc = g.scanDoc; else delete window._scanPendingDoc;
  window._scanResult = g.scanRes || null;
  OI().setAck(g.reqAck);
  if (g.docs && typeof OrderDocs !== 'undefined' && OrderDocs.formUse) OrderDocs.formUse(g.docs);
}

// ── Reading one order's form (attached or detached: querySelector on its own node) ──
const q = (m, id) => m.node.querySelector('#' + id);
const val = (m, id) => { const e = q(m, id); return e ? String(e.value || '').trim() : ''; };
function natSide(dir) { return dir === 'Import' ? 'u' : dir === 'Export' ? 'l' : ''; }
function points(m) {
  const out = [];
  const dir = val(m, 'f_Direction') || IG.s.dir;
  const vsOn = !!q(m, 'f_VeroiaSwitch')?.checked;
  const client = val(m, 'ls_client');
  for (const t of ['l', 'u']) {
    m.node.querySelectorAll(`#stops_${t} .oi2-stop`).forEach(row => {
      const i = Number(String(row.id).split('_').pop());
      const loc = val(m, `lv_${t}_${i}`);
      if (!loc) return;   // a point without a place is not saved (submitIntlOrder): not in the order either
      const name = (typeof _fhLocationsMap !== 'undefined' && _fhLocationsMap[loc]) || val(m, `ls_${t}_${i}`);
      const vs = vsOn && natSide(dir) === t && !!q(m, `vh_${t}_${i}`)?.checked;
      out.push({ pk: `${m.key}:${t}:${i}`, m, t, i, loc, name, client, vs,
        date: val(m, `dt_${t}_${i}`), tf: val(m, `tf_${t}_${i}`), tt: val(m, `tt_${t}_${i}`),
        pal: parseFloat(val(m, `pal_${t}_${i}`)) || 0, sid: val(m, `sid_${t}_${i}`) });
    });
  }
  return out;
}
function allPoints() { return IG.s.members.flatMap(points); }

// The order lists follow the points: a removed point leaves, a new one goes to the END (owner 15/11, «από αρχείο»
// step 6 — then dragged where wanted).
function syncOrder() {
  const s = IG.s, pts = allPoints();
  for (const t of ['l', 'u']) {
    const have = pts.filter(p => p.t === t).map(p => p.pk);
    const k = t === 'l' ? 'lo' : 'dl';
    const kept = s[k].filter(pk => have.includes(pk));
    s[k] = kept.concat(have.filter(pk => !kept.includes(pk)));
  }
  return pts;
}

// «Παραγγελία 2 · κομμάτι από απόθεμα · IFCO» — how a stopping message names the order in a groupage (no codes).
function memberLabel(m) {
  const s = IG.s; if (!s || s.mode !== 'group') return '';
  const k = s.members.indexOf(m) + 1, c = val(m, 'ls_client');
  return `Παραγγελία ${k}${m.piece || isPieceRec(m.f) ? ' · κομμάτι από απόθεμα' : ''}${c ? ' · ' + c : ''}`;
}
// (t, i) → { num, seq } for submitIntlOrder: the point's number inside its order = its rank among the order's own
// points in the panel; in a groupage also its place in the load (113 «Load Seq»).
function stopPosFor(m) {
  const s = IG.s;
  return (t, i) => {
    const list = t === 'l' ? s.lo : s.dl, pk = `${m.key}:${t}:${i}`;
    const at = list.indexOf(pk);
    if (at < 0) return null;
    const own = list.filter(x => x.startsWith(`${m.key}:${t}:`));
    if (s.mode === 'group') return { num: own.indexOf(pk) + 1, seq: at + 1 };
    // A single load has no place in a load: a place left from a groupage it was in is cleared (null), and a point
    // that never had one names nothing (undefined), so an untouched order never names the 113 column.
    const sid = val(m, `sid_${t}_${i}`), old = sid && s.seqBySid ? s.seqBySid[sid] : null;
    return { num: own.indexOf(pk) + 1, seq: old != null && old !== '' ? null : undefined };
  };
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function ensureStyles() {
  if (document.getElementById('igxStyles')) return;
  const st = document.createElement('style');
  st.id = 'igxStyles';
  st.textContent = `
  #modal.modal--igx{max-width:1240px;width:96vw}
  .igx-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
  .igx-seg{display:inline-flex;background:var(--surface-sunken,#EEF1F5);border-radius:10px;padding:3px;gap:2px}
  .igx-seg button{border:0;background:transparent;padding:7px 14px;border-radius:8px;font:inherit;font-size:13px;color:var(--text-mid);cursor:pointer}
  .igx-seg button.on{background:var(--surface-card,#fff);color:var(--text);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}
  .igx-seg button:disabled{opacity:.5;cursor:not-allowed}
  .igx-top .igx-scan{margin-left:auto}
  .igx-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}
  @media (max-width:900px){.igx-grid{grid-template-columns:1fr}}
  .igx-h{font-family:Syne,sans-serif;font-weight:700;font-size:15px;margin:0 0 10px}
  .igx-h small{font-weight:500;color:var(--text-dim);margin-left:6px}
  .igx-m{border:1px solid transparent;border-radius:10px;margin-bottom:8px}
  .igx.group .igx-m.open{border-color:var(--accent,#0284C7)}
  .igx.group .igx-m:not(.open) .igx-mh{background:var(--surface-sunken,#F4F6F9)}
  .igx-mh{display:none;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;cursor:pointer;font-size:13px}
  .igx.group .igx-mh{display:flex}
  .igx-mh .n{width:22px;height:22px;border-radius:6px;background:#0B1929;color:#fff;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex:none}
  .igx-mh .c{font-weight:600;min-width:150px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .igx-mh .r{flex:1;color:var(--text-mid);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .igx-mh .d,.igx-mh .p{color:var(--text-mid);white-space:nowrap}
  .igx-mh .v{min-width:86px;text-align:right;white-space:nowrap}
  .igx-mh .v.miss{color:var(--danger,#B91C1C)}
  .igx-mh .ap{font-size:10px;font-weight:700;border-radius:4px;padding:1px 5px;background:#E0F2FE;color:#0369A1}
  .igx-mh button{border:0;background:transparent;cursor:pointer;color:var(--text-dim);font-size:15px;padding:2px 4px}
  .igx-mh button:hover{color:var(--danger,#B91C1C)}
  .igx.group .igx-m.open .igx-mb{padding:0 12px 12px}
  .igx-add{display:none;gap:18px;flex-wrap:wrap;margin-top:6px}
  .igx.group .igx-add{display:flex}
  .igx-add button{border:0;background:transparent;color:var(--accent,#0284C7);font:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:4px 0}
  .igx-add button:disabled{color:var(--text-dim);cursor:not-allowed}
  .igx-side{background:var(--surface-card,#fff);border:1px solid var(--border);border-radius:12px;padding:14px;position:sticky;top:0}
  .igx-sh{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);font-weight:700;margin:4px 0 6px}
  .igx-ol{margin-bottom:12px;min-height:8px}
  .igx-pt{display:flex;align-items:center;gap:8px;padding:7px 4px;border-bottom:1px solid var(--border);font-size:13px;background:var(--surface-card,#fff)}
  .igx-pt[draggable=true]{cursor:grab}
  .igx-pt.drag{opacity:.4}
  .igx-pt.over{box-shadow:inset 0 2px 0 var(--accent,#0284C7)}
  .igx-pt .g{color:var(--text-dim);letter-spacing:-2px}
  .igx-pt .k{width:20px;height:20px;border:1px solid var(--border);border-radius:5px;font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex:none}
  .igx-pt .t{flex:1;min-width:0}
  .igx-pt .t b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .igx-pt .t b i{font-style:normal;font-weight:400;color:var(--text-dim)}
  .igx-pt .t span{display:block;color:var(--text-dim);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .igx-pt .pl{font-weight:600}
  .igx-empty{font-size:12px;color:var(--text-dim);padding:6px 4px}
  .igx-sum{border-top:1px solid var(--border);padding-top:10px;font-size:13px}
  .igx-sum div{display:flex;justify-content:space-between;gap:8px;padding:3px 0}
  .igx-sum div span:first-child{color:var(--text-mid)}
  .igx-sum .warn{color:var(--danger,#B91C1C)}
  .igx-note{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;border:1.5px solid #C2410C;color:#C2410C;font-size:10px;font-weight:800;margin-left:4px;cursor:help;vertical-align:middle}
  .igx .oi2-dirrow{display:none}
  .igx-pick{border:1px solid var(--border);border-radius:10px;padding:10px;margin-top:8px;background:var(--surface-card,#fff);max-height:340px;overflow:auto}
  .igx-pick input[type=search]{width:100%;margin-bottom:8px}
  .igx-pick .row{display:flex;gap:8px;align-items:center;padding:6px 4px;border-bottom:1px solid var(--border);font-size:13px;cursor:pointer}
  .igx-pick .row:hover{background:var(--surface-sunken,#F4F6F9)}
  .igx-pick .row.dim{color:var(--text-mid)}
  .igx-pick .row .x{flex:1}
  .igx-pick .row input[type=number]{width:70px}
  .igx-busy{font-size:12px;color:var(--text-mid);padding:4px 0}
  `;
  document.head.appendChild(st);
}

function segHtml(id, opts, value) {
  const fn = id === 'igxMode' ? 'setMode' : 'setDir';
  return `<span class="igx-seg" id="${id}">${opts.map(([v, l, dis, why]) =>
    `<button type="button" data-v="${esc(v)}" class="${value === v ? 'on' : ''}"${dis ? ` disabled title="${esc(why || '')}"` : ''} onclick="IntlGroup.${fn}('${v}')">${esc(l)}</button>`).join('')}</span>`;
}

function isPieceRec(f) { return typeof OrdersStock !== 'undefined' && !!f && OrdersStock.isPiece(f); }
function footerHtml(recId, f, scanQueue) {
  return `${recId && !isPieceRec(f) ? `<button class="btn btn-ghost oi2-dup" title="Νέα παραγγελία με ίδια στοιχεία — αλλάζεις μόνο ημερομηνίες" onclick="duplicateIntlOrder('${esc(recId)}')">Διπλασιασμός</button>` : ''}
    ${scanQueue ? `<button class="btn btn-ghost" title="Προσπέρασε αυτό το σκαν χωρίς αποθήκευση" onclick="closeModal();_scanQueueNext()">Παράλειψη → (${window._scanQueue.length} ακόμη)</button>` : ''}
    <button class="btn btn-ghost" onclick="closeModal()">Άκυρο</button>
    <button class="btn oi2-save" id="btnSubmit" onclick="IntlGroup.save()">Αποθήκευση</button>`;
}

let _obs = null;
function watchClose() {
  if (_obs) return;
  const overlay = document.getElementById('modalOverlay'), modal = document.getElementById('modal');
  if (!overlay || !modal) return;
  _obs = new MutationObserver(() => {
    if (overlay.classList.contains('open')) return;
    modal.classList.remove('modal--igx');
    IG.s = null;   // a closed form leaves nothing behind for the next one
  });
  _obs.observe(overlay, { attributes: true, attributeFilter: ['class'] });
}

// Every way into the international form arrives here (orders_intl.js _openModal without a mount).
async function openFrom(recId, f, label, prefill, piece) {
  f = f || {};
  ensureStyles();
  const gid = String(f['Group ID'] || '').trim();
  const isNew = !recId;
  IG.s = { mode: 'single', dir: f['Direction'] || (piece ? 'Import' : ''), members: [], open: null, lo: [], dl: [],
    base: gid ? gid.split('|')[0] : '', key: 0, saving: false, assign: null, isNew, removed: [] };
  const title = piece ? 'Κομμάτι από απόθεμα'
    : isNew ? 'Νέα διεθνής παραγγελία'
    : (typeof isPreorder === 'function' && isPreorder(f)) ? 'Μετατροπή pre-order σε παραγγελία'
    : gid ? 'Groupage' : (f['Order No'] ? 'Παραγγελία #' + f['Order No'] : 'Επεξεργασία παραγγελίας');
  const scanQueue = !!(isNew && !piece && window._scanQueue && window._scanQueue.length);
  const body = `<div class="igx" id="igx">
    <div class="igx-top" id="igxTop"></div>
    <div class="igx-grid">
      <div class="igx-main">
        <div class="igx-h" id="igxHead"></div>
        <div id="igxList" oninput="IntlGroup.changed()" onchange="IntlGroup.changed()" onfocusout="IntlGroup.changed()"></div>
        <div class="igx-add" id="igxAdd"></div>
        <div id="igxPick"></div>
      </div>
      <aside class="igx-side">
        <div class="igx-sh">Σειρά φόρτωσης</div><div class="igx-ol" id="igxLo"></div>
        <div class="igx-sh">Σειρά παράδοσης</div><div class="igx-ol" id="igxDl"></div>
        <div class="igx-sum" id="igxSum"></div>
      </aside>
    </div>
    <div id="scanStatus" hidden></div>
  </div>`;
  const modal = document.getElementById('modal');
  modal.style.maxWidth = '';
  openModal(title, body, footerHtml(recId, f, scanQueue));
  modal.classList.add('modal--igx');
  watchClose();
  const s = IG.s;
  if (recId && gid) {
    // A member of a groupage opens the whole load (owner 15/11). Members = the same BASE of the Group ID
    // (LoadGroup): a save that stopped half-way leaves some members with the base only, and they are the same load.
    s.mode = 'group';
    let recs = [];
    try { recs = await LoadGroup.readMembers(gid, false); }
    catch (e) { showErrorToast('Δεν διαβάστηκαν οι παραγγελίες του groupage — ανοίγει μόνο αυτή', 'warn', 12000); }
    if (!recs.some(r => r.id === recId)) recs.unshift({ id: recId, fields: f });
    const list = LoadGroup.orderList([{ fields: f }].concat(recs));
    const pos = id => { const k = list.indexOf(id); return k < 0 ? 99 : k; };
    recs.sort((a, b) => pos(a.id) - pos(b.id) || String((a.fields || {})['Loading DateTime'] || '').localeCompare(String((b.fields || {})['Loading DateTime'] || '')));
    s.assign = assignmentOf(recs);
    for (const r of recs) await addMember({ recId: r.id, f: r.fields || {}, orig: true }, { quiet: true });
    await initialOrder();
    expand(s.members.find(m => m.recId === recId) || s.members[0]);
  } else {
    await addMember({ recId: recId || null, f, label, prefill, piece, orig: !!recId }, { quiet: true });
    recomputeAssign();
    if (recId) await loadSeqs();
    syncOrder();
  }
  // the form of one order sets its own width class (960px, orders_intl.js); the shell is wider
  modal.classList.remove('modal--oi2');
  paint();
}

// The load's vehicle (owner 15/11, decision 5): an order added to a load that already has a truck / partner takes the
// same truck, driver, matched import, status and moved week at once. Read from the members as stored; members that
// disagree give no source (a sign is shown, nothing is copied). The partner fee is NOT copied: one fee per truck
// (decision 4). «Plan Week Start»: the Weekly moves a load's week on every member (16/11), so a new member follows it,
// or it would show alone in the load's natural week.
const ASSIGN_LABELS = ['Truck', 'Trailer', 'Driver', 'Partner', 'Is Partner Trip', 'Partner Truck Plates', 'Status', 'Matched Import ID', 'Plan Week Start'];
// What a load without a truck yet still has: its matched import (export) and its moved week (16/11, audit 6). Only a
// value every member that has one agrees on; → { fields, plan: true } or null.
const PLAN_LABELS = ['Matched Import ID', 'Plan Week Start'];
function planOf(recs) {
  const out = {};
  for (const l of PLAN_LABELS) {
    const vals = new Set(recs.filter(r => l !== 'Matched Import ID' || (r.fields || {})['Direction'] === 'Export')
      .map(r => (r.fields || {})[l]).filter(v => v != null && v !== ''));
    if (vals.size === 1) out[l] = [...vals][0];
  }
  return Object.keys(out).length ? { fields: out, truck: '', partner: '', plan: true } : null;
}
function assignmentOf(recs) {
  const lid = v => (typeof getLinkedId === 'function' ? getLinkedId(v) : (Array.isArray(v) ? v[0] : v)) || '';
  const withVeh = recs.filter(r => lid((r.fields || {})['Truck']) || lid((r.fields || {})['Partner']));
  if (!withVeh.length) return planOf(recs);
  const key = r => lid(r.fields['Truck']) + '|' + lid(r.fields['Partner']);
  const k0 = key(withVeh[0]);
  if (withVeh.some(r => key(r) !== k0)) return { mixed: true };
  const f0 = withVeh[0].fields, out = {};
  for (const l of ASSIGN_LABELS) {
    const v = f0[l];
    if (l === 'Matched Import ID' && f0['Direction'] !== 'Export') continue;
    if (['Truck', 'Trailer', 'Driver', 'Partner'].includes(l)) { const id = lid(v); out[l] = id ? [id] : []; }
    else if (v != null && v !== '') out[l] = v;
  }
  return { fields: out, truck: lid(f0['Truck']), partner: lid(f0['Partner']) };
}
// Recomputed whenever an order already in the catalogue joins («Υπάρχουσα»): an order on a truck that joins a load
// without one makes that truck the load's (code review 15/11).
function recomputeAssign() {
  const s = IG.s;
  s.assign = assignmentOf(s.members.filter(m => m.recId).map(m => ({ id: m.recId, fields: m.f || {} })));
}
function needsVehicle(m) {
  const a = IG.s.assign;
  if (!a || a.mixed || IG.s.mode !== 'group') return null;
  const f = m.f || {};
  if (a.plan) {
    // no truck: only an order JOINING the load (new or «Υπάρχουσα»), never a member opened with it — a save of the
    // load must not rewrite what its members already hold; and only what it does not have yet
    if (m.orig) return null;
    const out = {};
    for (const [k, v] of Object.entries(a.fields)) {
      if (k === 'Matched Import ID' && IG.s.dir !== 'Export') continue;
      if (f[k] == null || f[k] === '') out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  }
  const same = (getLinkedId(f['Truck']) || '') === a.truck && (getLinkedId(f['Partner']) || '') === a.partner;
  return same ? null : a.fields;
}

// Pure: the stored places of one side of a load are used only when every point has one and no two share it (the rule
// written in DECISION_LOG with 113); anything else falls back to the old rule, with a sign — never a guessed order.
// The rule lives in core/load-group.js: the driver sheet (print.html) and the week's route read it too (16/11).
function seqUsable(vals) { return LoadGroup.seqUsable(vals); }
// The places stored on the points of the saved orders in the form, by stop record (113 «Load Seq»).
async function loadSeqs() {
  const s = IG.s, seqBySid = s.seqBySid || (s.seqBySid = {});
  await Promise.all(s.members.filter(m => m.recId).map(async m => {
    try { (await stopsLoad(m.recId, F.STOP_PARENT_ORDER)).forEach(st => { seqBySid[st.id] = st.fields[F.STOP_LOAD_SEQ]; }); }
    catch (e) { console.warn('igx: stops of', m.recId, e); }
  }));
  return seqBySid;
}
// The panel's first order for a load saved before 113 (or by the old Weekly): what each point holds as «Load Seq»
// when it is usable (seqUsable); otherwise the old rule — the Group ID order list (export: deliveries, import:
// loadings), then the stop number; the other side by day, then the order list (impact check G, «empty = the old rule»).
async function initialOrder() {
  const s = IG.s;
  const seqBySid = await loadSeqs();
  s.seqFallback = false;
  const pts = allPoints();
  const rankM = m => s.members.indexOf(m);
  for (const t of ['l', 'u']) {
    const mine = pts.filter(p => p.t === t);
    const vals = mine.map(p => (p.sid ? seqBySid[p.sid] : null));
    const allSeq = seqUsable(vals);
    if (!allSeq && vals.some(v => v != null && v !== '')) s.seqFallback = true;
    const listSide = (s.dir === 'Import' ? 'l' : 'u') === t;
    mine.sort(allSeq ? (a, b) => Number(seqBySid[a.sid]) - Number(seqBySid[b.sid])
      : listSide ? (a, b) => rankM(a.m) - rankM(b.m) || a.i - b.i
      : (a, b) => String(a.date || '9').localeCompare(String(b.date || '9')) || rankM(a.m) - rankM(b.m) || a.i - b.i);
    s[t === 'l' ? 'lo' : 'dl'] = mine.map(p => p.pk);
  }
}

// ── Orders in the form ──────────────────────────────────────────────────────
async function addMember(src, opts) {
  const s = IG.s;
  collapse();
  const m = { key: 'm' + (++s.key), recId: src.recId || null, f: src.f || {}, orig: !!src.orig, piece: !!src.piece,
    file: src.fileName || '', node: document.createElement('div'), g: null };
  m.node.className = 'igx-mnode';
  s.members.push(m);
  const list = document.getElementById('igxList');
  list.insertAdjacentHTML('beforeend', `<div class="igx-m" id="igm_${m.key}"><div class="igx-mh" onclick="IntlGroup.toggle('${m.key}')"></div><div class="igx-mb" id="igmb_${m.key}"></div></div>`);
  document.getElementById('igmb_' + m.key).appendChild(m.node);
  s.open = m.key;
  document.getElementById('igm_' + m.key).classList.add('open');
  await OI().open(m.recId, m.f, src.label || null, src.prefill || null, src.piece || null, m.node);
  document.getElementById('modal')?.classList.remove('modal--oi2');
  if (src.scanDoc) window._scanPendingDoc = src.scanDoc;
  if (src.scanRes) window._scanResult = src.scanRes;
  // A new order of a groupage takes the load's direction and its one reefer setting (owner 15/11: «Μία φορά»).
  if (!m.recId && s.dir && !src.piece) setSeg(m, 'f_Direction', s.dir);
  if (!m.recId && s.mode === 'group') {
    const rf = s.members.map(x => x !== m && val(x, 'f_ReeferMode')).find(Boolean);
    if (rf && !val(m, 'f_ReeferMode')) setSeg(m, 'f_ReeferMode', rf);
  }
  if (!s.dir) s.dir = val(m, 'f_Direction');
  if (src.pal != null) { const p = q(m, 'pal_l_1'); if (p) p.value = String(src.pal); }
  OI().cols();
  if (!opts || !opts.quiet) { syncOrder(); paint(); }
  return m;
}

// Writes a button-group value in an order's form (attached or not), the way _oiSegPick does for a click.
function setSeg(m, id, v) {
  const inp = q(m, id); if (!inp || inp.disabled) return;
  inp.value = v;
  m.node.querySelectorAll(`#${id}Seg button`).forEach(b => b.classList.toggle('on', b.dataset.v === v));
}

function collapse() {
  const s = IG.s; if (!s || !s.open) return;
  const m = s.members.find(x => x.key === s.open);
  if (m) { m.g = capture(); m.node.remove(); document.getElementById('igm_' + m.key)?.classList.remove('open'); }
  s.open = null;
}
function expand(m) {
  const s = IG.s; if (!m) return;
  if (s.open === m.key) return;
  collapse();
  restore(m.g);
  document.getElementById('igmb_' + m.key)?.appendChild(m.node);
  document.getElementById('igm_' + m.key)?.classList.add('open');
  s.open = m.key;
  OI().cols();
}
function toggle(key) {
  const s = IG.s; if (!s || s.saving) return;
  const m = s.members.find(x => x.key === key); if (!m) return;
  if (s.open === key) { collapse(); paint(); return; }
  expand(m); paint();
}

// ── Head: single / groupage, export / import ─────────────────────────────────
function preorderIn() { const s = IG.s; return s.members.some(m => (m.key === s.open ? ST()._preConvert : m.g && m.g._preConvert)); }
// Every «add» goes through here: a pre-order never becomes part of a groupage (owner 15/11, decision 13).
function toGroup() {
  const s = IG.s;
  if (s.mode === 'group') return true;
  if (preorderIn()) { toast('Το pre-order γίνεται πρώτα παραγγελία, μετά μπαίνει σε groupage', 'warn'); return false; }
  s.mode = 'group';
  return true;
}
function hasPiece() { return IG.s.members.some(m => m.piece || isPieceRec(m.f)); }
function setMode(v) {
  const s = IG.s; if (!s || s.saving || v === s.mode) return;
  if (v === 'group' && preorderIn()) { toast('Το pre-order γίνεται πρώτα παραγγελία, μετά μπαίνει σε groupage', 'warn'); return; }
  if (v === 'single' && s.members.length > 1) { toast('Πρώτα διέγραψε τις άλλες παραγγελίες του groupage', 'warn'); return; }
  s.mode = v;
  paint();
}
function setDir(v) {
  const s = IG.s; if (!s || s.saving) return;
  if (v === 'Export' && hasPiece()) { toast('Κομμάτι από απόθεμα υπάρχει μόνο σε εισαγωγή', 'warn'); return; }
  s.dir = v;
  for (const m of s.members) setSeg(m, 'f_Direction', v);
  if (s.open) OI().cols();
  paint();
}
// The reefer is one for the whole truck (owner 15/11), also with a partition: a pick in one order is written in all.
// An old groupage that disagrees is shown with a sign and left as it is until someone picks (decision 19).
function reeferPicked(v) {
  const s = IG.s; if (!s || s.mode !== 'group' || !v) return;
  for (const m of s.members) if (m.key !== s.open) setSeg(m, 'f_ReeferMode', v);
  changed();
}

function paintTop() {
  const s = IG.s, el = document.getElementById('igxTop'); if (!el) return;
  const pre = preorderIn(), piece = hasPiece();
  const scanBtn = s.mode === 'group'
    ? `<button type="button" class="btn btn-ghost btn-sm igx-scan" onclick="IntlGroup.fromFile()">Σάρωση εντολής πελάτη</button>`
    : (s.isNew && !piece && !pre && OI().fromPdf ? `<button type="button" class="btn btn-ghost btn-sm igx-scan" onclick="window._OI.fromPdf()">Σάρωση εντολής πελάτη</button>` : '');
  el.innerHTML = segHtml('igxMode', [['single', 'Απλό φορτίο', s.members.length > 1, 'Πρώτα διέγραψε τις άλλες παραγγελίες'],
      ['group', 'Groupage', pre, 'Το pre-order γίνεται πρώτα παραγγελία']], s.mode)
    + segHtml('igxDir', [['Export', 'Εξαγωγή', piece, 'Κομμάτι από απόθεμα = εισαγωγή'], ['Import', 'Εισαγωγή']], s.dir)
    + scanBtn;
}

// ── The order lines ───────────────────────────────────────────────────────────
function lineHtml(m, n) {
  const pts = points(m);
  const L = pts.filter(p => p.t === 'l'), U = pts.filter(p => p.t === 'u');
  const short = p => String(p.name || '').split(/ · |,/)[0].trim();
  const route = [L[0] ? short(L[0]) : '', U[0] ? short(U[0]) + (U.length > 1 ? ` +${U.length - 1}` : '') : ''].filter(Boolean).join(' → ');
  const pal = L.reduce((a, p) => a + p.pal, 0);
  const piece = m.piece || isPieceRec(m.f);
  const price = val(m, 'f_Price');
  const v = piece ? '<span class="v">στην παρτίδα</span>'
    : price ? `<span class="v">${esc(Number(price).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</span>`
    : '<span class="v miss">χωρίς τιμή</span>';
  const signs = [m.file ? note('Από το αρχείο «' + m.file + '»') : '',
    needsVehicle(m) ? note(IG.s.assign.plan ? 'Θα πάρει το ταίριασμα / την εβδομάδα του groupage με την αποθήκευση' : 'Θα πάρει το φορτηγό του groupage με την αποθήκευση') : '',
    val(m, 'f_Direction') && IG.s.dir && val(m, 'f_Direction') !== IG.s.dir ? note('Άλλη κατεύθυνση από του groupage') : ''].join('');
  return `<span class="n">${n}</span><span class="c">${esc(val(m, 'ls_client') || 'Νέα παραγγελία')}${piece ? ' <span class="ap">ΑΠ</span>' : ''}${signs}</span>
    <span class="r">${esc(route || '—')}</span><span class="d">${esc(L[0] && L[0].date ? dayOf(L[0].date) : '')}</span>
    <span class="p">${pal ? pal + ' παλ.' : ''}</span>${v}<span aria-hidden="true">${IG.s.open === m.key ? '▴' : '▾'}</span>
    <button type="button" title="Διαγραφή παραγγελίας" aria-label="Διαγραφή παραγγελίας" onclick="event.stopPropagation();IntlGroup.remove('${m.key}')">🗑</button>`;
}

function paintList() {
  const s = IG.s;
  s.members.forEach((m, k) => { const h = document.querySelector(`#igm_${m.key} .igx-mh`); if (h) h.innerHTML = lineHtml(m, k + 1); });
  const head = document.getElementById('igxHead');
  if (head) head.innerHTML = s.mode === 'group' ? `Παραγγελίες<small>${s.members.length}</small>` : 'Παραγγελία';
  const add = document.getElementById('igxAdd');
  if (add) {
    const imp = s.dir === 'Import';
    const stockOn = typeof OrdersStock !== 'undefined' && OrdersStock.on() && OrdersStock.canWrite();
    add.innerHTML = `<button type="button" onclick="IntlGroup.addNew()">+ Παραγγελία</button>
      <button type="button" onclick="IntlGroup.fromFile()">Από αρχείο</button>
      <button type="button" onclick="IntlGroup.pickExisting()">Υπάρχουσα</button>
      ${stockOn ? `<button type="button" onclick="IntlGroup.pickPiece()"${imp ? '' : ' disabled title="Κομμάτι από απόθεμα μπαίνει μόνο σε groupage εισαγωγής"'}>Κομμάτι από απόθεμα</button>` : ''}`;
  }
  document.getElementById('igx')?.classList.toggle('group', s.mode === 'group');
}

// ── Side panel ────────────────────────────────────────────────────────────────
function ptHtml(p, n, group) {
  const hrs = p.tf || p.tt ? `${p.tf || ''}–${p.tt || ''}` : '';
  const sub = [group ? p.client : '', p.date ? dayOf(p.date) : '', hrs].filter(Boolean).join(' · ');
  // A loading point through Veroia is written as its supplier, «(Veroia Cross Dock)» beside it (owner 15/11, 1).
  return `<div class="igx-pt" draggable="true" data-pk="${esc(p.pk)}">
    <span class="g" aria-hidden="true">⋮⋮</span><span class="k">${n}</span>
    <span class="t"><b>${esc(p.name || '—')}${p.vs ? ' <i>(Veroia Cross Dock)</i>' : ''}</b><span>${esc(sub)}</span></span>
    <span class="pl">${p.pal || ''}</span></div>`;
}
function paintPanel(pts) {
  const s = IG.s, byPk = Object.fromEntries(pts.map(p => [p.pk, p]));
  for (const [id, k] of [['igxLo', 'lo'], ['igxDl', 'dl']]) {
    const el = document.getElementById(id); if (!el) continue;
    const rows = s[k].map(pk => byPk[pk]).filter(Boolean);
    el.innerHTML = rows.length ? rows.map((p, n) => ptHtml(p, n + 1, s.mode === 'group')).join('') : '<div class="igx-empty">—</div>';
  }
  paintSum(pts);
}
function paintSum(pts) {
  const s = IG.s, el = document.getElementById('igxSum'); if (!el) return;
  const L = pts.filter(p => p.t === 'l'), U = pts.filter(p => p.t === 'u');
  const pal = L.reduce((a, p) => a + p.pal, 0);
  const rows = [];
  rows.push(['Παλέτες', `<span class="${pal > MAX_PAL ? 'warn' : ''}">${pal} / ${MAX_PAL}</span>${pal > MAX_PAL ? note('Πάνω από ' + MAX_PAL + ' παλέτες στο φορτηγό') : ''}`]);
  const free = m => m.piece || isPieceRec(m.f);
  const prices = s.members.map(m => (free(m) ? 0 : parseFloat(val(m, 'f_Price'))));
  const missing = s.members.filter((m, k) => !free(m) && !Number.isFinite(prices[k])).length;
  if (s.mode === 'group') {
    rows.push(['Στον κατάλογο', `${s.members.length} παραγγελίες`]);
    const sum = prices.filter(Number.isFinite).reduce((a, b) => a + b, 0);
    rows.push(['Αξία', `${sum.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €${missing ? note(missing === 1 ? 'Μία παραγγελία χωρίς τιμή' : missing + ' παραγγελίες χωρίς τιμή') : ''}`]);
    const days = U.map(p => p.date).filter(Boolean).sort();
    if (days.length) rows.push(['Παράδοση', days[0] === days[days.length - 1] ? dayOf(days[0]) : `${dayOf(days[0])} – ${dayOf(days[days.length - 1])}`]);
    rows.push(['Σημεία', `${L.length} φόρτωσης · ${U.length} παράδοσης`]);
    const temps = [...new Set(s.members.map(m => (q(m, 'f_TempCmr')?.checked ? 'CMR' : val(m, 'f_Temp'))).filter(Boolean))];
    const reefers = [...new Set(s.members.map(m => val(m, 'f_ReeferMode')).filter(Boolean))];
    const fmtT = t => (t === 'CMR' ? 'κατά CMR' : (Number(t) > 0 ? '+' : '') + t + '°');
    rows.push(['Θερμοκρασία', `${temps.map(fmtT).join(' · ') || '—'}${temps.length > 1 ? note('Χώρισμα μέσα στον θάλαμο') : ''}${reefers.length > 1 ? note('Οι παραγγελίες γράφουν άλλη λειτουργία ψυκτικού — διάλεξε μία') : ''}`]);
    // The delivery order against the days (owner 15/11): a later day before an earlier one is shown, never refused.
    const dlDays = s.dl.map(pk => (U.find(p => p.pk === pk) || {}).date).filter(Boolean);
    if (dlDays.some((d, k) => k && d < dlDays[k - 1])) rows.push(['Σειρά', `<span class="warn">παράδοση πριν από προηγούμενη ημέρα</span>${note('Η σειρά παράδοσης δεν συμφωνεί με τις ημέρες')}`]);
    if (s.seqFallback) rows.push(['Σειρά', `παλιός τρόπος${note('Η σειρά ανά σημείο που είχε γραφτεί δεν ήταν πλήρης ή είχε διπλές θέσεις — δείχνεται η σειρά παραγγελιών· σύρε και αποθήκευσε για να γραφτεί ξανά')}`]);
    if (s.assign && s.assign.mixed) rows.push(['Φορτηγό', `διαφορετικά${note('Οι παραγγελίες του groupage έχουν διαφορετικό φορτηγό — η ανάθεση γίνεται στο Εβδομαδιαίο')}`]);
  } else if (missing) {
    rows.push(['Τιμή', note('Χωρίς τιμή')]);
  }
  el.innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('');
  const btn = document.getElementById('btnSubmit');
  if (btn && !s.saving) btn.textContent = s.mode === 'group' ? `Αποθήκευση · ${s.members.length} παραγγελίες` : 'Αποθήκευση';
}

let _dragPk = null;
function wireDrag() {
  for (const id of ['igxLo', 'igxDl']) {
    const el = document.getElementById(id); if (!el || el._igx) continue;
    el._igx = true;
    const k = id === 'igxLo' ? 'lo' : 'dl';
    el.addEventListener('dragstart', e => { const r = e.target.closest('.igx-pt'); if (!r) return; _dragPk = r.dataset.pk; r.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', _dragPk); } catch (_) {} });
    el.addEventListener('dragend', () => { _dragPk = null; el.querySelectorAll('.drag,.over').forEach(x => x.classList.remove('drag', 'over')); });
    el.addEventListener('dragover', e => {
      if (!IG.s || !_dragPk || !IG.s[k].includes(_dragPk)) return;   // a loading point never goes into the delivery list
      e.preventDefault();
      el.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
      e.target.closest('.igx-pt')?.classList.add('over');
    });
    el.addEventListener('drop', e => {
      const s = IG.s; if (!s || !_dragPk || !s[k].includes(_dragPk)) return;
      e.preventDefault();
      const tgt = e.target.closest('.igx-pt');
      s[k] = moveBefore(s[k], _dragPk, tgt ? tgt.dataset.pk : null);
      _dragPk = null;
      paint();
    });
  }
}
// Pure: pk moved to the place of `before` (null = the end).
function moveBefore(list, pk, before) {
  if (!list.includes(pk) || before === pk) return list.slice();
  const out = list.filter(x => x !== pk);
  const at = before ? out.indexOf(before) : -1;
  out.splice(at < 0 ? out.length : at, 0, pk);
  return out;
}

function paint() {
  const s = IG.s; if (!s) return;
  paintTop();
  paintList();
  const pts = syncOrder();
  paintPanel(pts);
  wireDrag();
}
let _chT = null;
function changed() {
  if (!IG.s) return;
  clearTimeout(_chT);
  _chT = setTimeout(() => { if (IG.s && !IG.s.saving) paint(); }, 120);
}

// ── Adding orders ──────────────────────────────────────────────────────────────
async function addNew() {
  const s = IG.s; if (!s || s.saving || !toGroup()) return;
  await addMember({});
}

// «Από αρχείο» (owner 15/11): PDF and photos (what the scan reads today). Each file read becomes one order of the
// groupage, filled; a file that cannot be read becomes an empty order with the file attached («Γράψ' την»). Its file
// stays with ITS order (one scan slot per order). Decision 17 (one file with many orders) needs the scan to return
// more than one order — today it returns one; parked, said in the PR.
async function fromFile() {
  const s = IG.s; if (!s || s.saving || !toGroup()) return;
  paint();
  const inp = document.createElement('input');
  inp.type = 'file'; inp.multiple = true; inp.accept = 'image/*,application/pdf'; inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('cancel', () => inp.remove(), { once: true });
  inp.addEventListener('change', async () => {
    const files = [...(inp.files || [])].slice(0, 10);
    inp.remove();
    const busy = document.getElementById('igxPick');
    const footer = document.getElementById('modalFooter');
    for (const file of files) {
      if (!IG.s) return;
      if (busy) busy.innerHTML = `<div class="igx-busy">Σάρωση «${esc(file.name)}»…</div>`;
      let args = null, res = null;
      const keepFooter = footer ? footer.innerHTML : '';
      try {
        window._scanResult = null;
        const parsed = file.size > 10 * 1024 * 1024 ? null : await OI().scanExtract(file);
        if (parsed) { parsed._scanFile = file; await OI().scanPreview(parsed); }
        res = window._scanResult;
        if (res) args = OI().scanArgs(res.matched, res.data);
      } catch (e) { console.warn('igx: scan', file.name, e); }
      if (footer) footer.innerHTML = keepFooter;   // the scan preview writes its own footer
      const st = document.getElementById('scanStatus'); if (st) st.innerHTML = '';
      if (!IG.s) return;
      const doc = { file, source: 'scan' };
      if (args) {
        await addMember({ f: args.f, label: args.label, prefill: args.prefill, fileName: file.name, scanDoc: doc, scanRes: { matched: res.matched, data: res.data } });
      } else {
        showErrorToast(`«${file.name}» δεν διαβάστηκε — μπήκε κενή παραγγελία με το αρχείο συνημμένο· γράψ' την`, 'warn', 9000);
        await addMember({ fileName: file.name, scanDoc: doc });
      }
    }
    if (busy) busy.innerHTML = '';
    paint();
  }, { once: true });
  inp.click();
}

// «Υπάρχουσα» (owner 15/11, decision 7): an order already in the catalogue joins; it keeps its number, documents and
// price. The list shows first what fits (same direction, no groupage, no other truck) and keeps the rest selectable
// with a sign (owner 15/11: corrective moves are entered after the fact). A pre-order is not offered (decision 13).
async function pickExisting() {
  const s = IG.s; if (!s || s.saving) return;
  const box = document.getElementById('igxPick'); if (!box) return;
  box.innerHTML = '<div class="igx-busy">Φόρτωση παραγγελιών…</div>';
  const days = allPoints().map(p => p.date).filter(Boolean).sort();
  const c = days[0] ? new Date(days[0] + 'T12:00:00') : new Date();
  const from = new Date(c.getTime() - 14 * 864e5).toISOString().slice(0, 10), to = new Date(c.getTime() + 21 * 864e5).toISOString().slice(0, 10);
  // Both directions are read on purpose: an order entered with the wrong direction must stay findable to be
  // corrected after the fact (owner 15/11); it is listed last, with a sign.
  let recs = [];
  try {
    recs = await atGetAll(TABLES.ORDERS, { filterByFormula: `AND(IS_AFTER({Loading DateTime},'${from}'),IS_BEFORE({Loading DateTime},'${to}'))` }, false) || [];
  } catch (e) { box.innerHTML = `<div class="igx-busy">Οι παραγγελίες δεν διαβάστηκαν — ${esc(e && e.message || 'σφάλμα')}</div>`; return; }
  if (IG.s !== s) return;   // the form was closed (or another opened) while the list loaded
  const inForm = new Set(s.members.map(m => m.recId).filter(Boolean));
  const a = s.assign && !s.assign.mixed ? s.assign : null;
  const rows = recs.filter(r => !inForm.has(r.id) && !(typeof isPreorder === 'function' && isPreorder(r.fields || {}))).map(r => {
    const f = r.fields || {}, why = [];
    if (s.dir && f['Direction'] !== s.dir) why.push('άλλη κατεύθυνση');
    if (String(f['Group ID'] || '').trim()) why.push('είναι σε άλλο groupage');
    if (isPieceRec(f) && s.dir !== 'Import') why.push('κομμάτι από απόθεμα μόνο σε εισαγωγή');
    const veh = getLinkedId(f['Truck']) || getLinkedId(f['Partner']);
    if (veh && (!a || veh !== (a.truck || a.partner))) why.push('έχει άλλο φορτηγό');
    if (getLinkedId(f['Parent Order'])) why.push('σκέλος σπασμένης παραγγελίας');
    return { r, why };
  }).sort((x, y) => x.why.length - y.why.length || String(x.r.fields['Loading DateTime'] || '').localeCompare(String(y.r.fields['Loading DateTime'] || '')));
  IG._pick = rows;
  const label = r => (typeof PlainRef !== 'undefined' ? PlainRef.orderOf(r) : '') || 'Παραγγελία';
  box.innerHTML = `<div class="igx-pick"><input type="search" class="form-input" placeholder="Αναζήτηση πελάτη ή τόπου" oninput="IntlGroup._filter(this.value)">
    <div id="igxPickRows">${rows.slice(0, 120).map((x, k) => `<div class="row${x.why.length ? ' dim' : ''}" data-q="${esc(label(x.r).toLowerCase())}"
      onclick="IntlGroup._addExisting(${k})"><span class="x">${esc(label(x.r))}</span>${x.why.length ? note(x.why.join(' · ')) : ''}</div>`).join('') || '<div class="igx-busy">Καμία παραγγελία σε αυτές τις ημέρες</div>'}</div>
    <div style="text-align:right;margin-top:6px"><button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('igxPick').innerHTML=''">Κλείσιμο</button></div></div>`;
}
function _filter(v) {
  const t = String(v || '').toLowerCase().trim();
  document.querySelectorAll('#igxPickRows .row').forEach(r => { r.style.display = !t || r.dataset.q.includes(t) ? '' : 'none'; });
}
async function _addExisting(k) {
  const x = IG._pick && IG._pick[k]; if (!x || !IG.s) return;
  document.getElementById('igxPick').innerHTML = '';
  if (!toGroup()) return;
  await addMember({ recId: x.r.id, f: x.r.fields || {} });
  recomputeAssign();
  paint();
}

// «Κομμάτι από απόθεμα» (owner 15/11, decisions 8–11): import groupage only; lots with pallets left (their warehouses
// are abroad by the lot rule). The piece is its own order with its lot's locks (orders_intl.js pieceNew): client,
// warehouse as loading point, no price, no exchange. Its pallets leave the lot's balance at its save (the base counts
// every piece of a lot), with or without a truck.
async function pickPiece() {
  const s = IG.s; if (!s || s.saving) return;
  if (s.dir !== 'Import') { toast('Κομμάτι από απόθεμα μπαίνει μόνο σε groupage εισαγωγής', 'warn'); return; }
  const box = document.getElementById('igxPick'); if (!box) return;
  box.innerHTML = '<div class="igx-busy">Φόρτωση παρτίδων…</div>';
  const r = await OrdersStock.loadOpen();
  if (IG.s !== s) return;   // the form was closed (or another opened) while the lots loaded
  if (!r.ok) { box.innerHTML = `<div class="igx-busy">Οι παρτίδες δεν διαβάστηκαν — ${esc(r.error || 'σφάλμα')}</div>`; return; }
  const lots = (r.lots || []).filter(l => Number((l.fields || {})['Remaining Pallets']) > 0);
  IG._lots = lots;
  box.innerHTML = `<div class="igx-pick">${lots.map((l, k) => {
    const g = l.fields || {};
    const since = g['Received On'] ? ' · από ' + dayOf(String(g['Received On']).slice(0, 10)) : '';
    return `<div class="row"><span class="x"><b>${esc(g['Client Name'] || '—')}</b> · ${esc(g['Warehouse Name'] || '')}${esc(since)} · μένουν ${esc(g['Remaining Pallets'])}</span>
      <input type="number" class="form-input" min="1" max="${esc(g['Remaining Pallets'])}" id="igxLotN_${k}" placeholder="παλ.">
      <button type="button" class="btn btn-sm" onclick="IntlGroup._addPiece(${k})">Προσθήκη</button></div>`;
  }).join('') || '<div class="igx-busy">Καμία παρτίδα με υπόλοιπο</div>'}
    <div style="text-align:right;margin-top:6px"><button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('igxPick').innerHTML=''">Κλείσιμο</button></div></div>`;
}
async function _addPiece(k) {
  const lot = IG._lots && IG._lots[k]; if (!lot || !IG.s) return;
  const n = parseFloat(document.getElementById('igxLotN_' + k)?.value);
  if (!(n > 0)) { toast('Γράψε πόσες παλέτες παίρνεις', 'warn'); return; }
  document.getElementById('igxPick').innerHTML = '';
  if (!toGroup()) return;
  await addMember({ piece: { lot, presets: {} }, pal: n });
}

// ── Removing an order (owner 15/11, decision 6): the bin DELETES it ─────────────
// An order never saved, or an existing one added in this form but not saved into the groupage yet, only leaves the
// form. A saved member is deleted with the same confirm and cascade as everywhere (deleteIntlOrder names it by
// client and route). There is no «out of the groupage without deleting» (owner: delete it and enter it again).
async function remove(key) {
  const s = IG.s; if (!s || s.saving) return;
  const m = s.members.find(x => x.key === key); if (!m) return;
  if (s.members.length === 1) { toast('Η μόνη παραγγελία της φόρμας δεν σβήνεται από εδώ — Άκυρο για να κλείσεις', 'warn'); return; }
  const created = m.key === s.open ? ST()._createdId : m.g && m.g._createdId;
  const savedId = (m.orig || m.saved) ? m.recId : (created || null);
  if (savedId) {
    let gone = false;
    // A stock piece on a truck or a partner cannot be deleted by the base (057 piece_on_truck: «Επιστροφή στο απόθεμα»
    // first). The bin does both, in that order, so its pallets go back to the lot (owner 15/11: «να επιστρέψουν ξανά
    // αποθήκη»). A piece already moving or delivered stays refused by the base, with its own words.
    let undo = null;
    if (m.piece || isPieceRec(m.f)) {
      undo = await pieceBackToStock(savedId);
      if (!undo) return;
    }
    await deleteIntlOrder(savedId, { rerender: async () => { gone = true; } });
    if (!gone) {   // cancelled or refused: deleteIntlOrder already said why; the piece goes back on its truck
      if (undo && undo.patch) await pieceUndoBack(savedId, undo.patch, undo.seqWas);
      return;
    }
    s.removed.push(savedId);
  } else if (!confirm('Να φύγει αυτή η παραγγελία από τη φόρμα;')) return;
  if (!IG.s) return;
  if (s.open === key) collapse();
  m.node.remove();
  document.getElementById('igm_' + key)?.remove();
  s.members = s.members.filter(x => x !== m);
  if (!s.open && s.members.length) expand(s.members[s.members.length - 1]);
  paint();
}

// → false (said why, nothing changed) or { patch }: what the piece had, to put it back if the delete does not happen.
async function pieceBackToStock(id) {
  try {
    const cur = await atGetOne(TABLES.ORDERS, id);
    const f = (cur && cur.fields) || {};
    // a piece already loaded or delivered is not taken off its vehicle (the base refuses its delete anyway)
    if (f['Status'] === 'In Transit' || f['Status'] === 'Delivered') {
      showErrorToast('Το κομμάτι έχει ήδη φορτωθεί ή παραδοθεί — δεν γυρίζει στο απόθεμα και δεν σβήνεται', 'warn', 10000);
      return false;
    }
    const onVeh = getLinkedId(f['Truck']) || getLinkedId(f['Partner']) || getLinkedId(f['Trailer']) || getLinkedId(f['Driver']);
    if (!onVeh && !String(f['Group ID'] || '').trim()) return { patch: null };
    if (!confirm('Το κομμάτι φεύγει από το groupage και οι παλέτες του γυρίζουν στην παρτίδα. Συνέχεια;')) return false;
    const was = {};
    for (const k of ['Truck', 'Trailer', 'Driver', 'Partner']) { const v = getLinkedId(f[k]); was[k] = v ? [v] : []; }
    was['Group ID'] = f['Group ID'] || null; was['Status'] = f['Status'] || 'Pending';
    const patch = { 'Truck': [], 'Trailer': [], 'Driver': [], 'Partner': [], 'Group ID': null, 'Status': 'Pending' };
    const res = await atSafePatch(TABLES.ORDERS, id, patch);
    if (res && (res.error || res.conflict)) throw new Error(res.conflict ? 'άλλαξε από άλλον χρήστη' : (res.error.message || res.error.type));
    const again = await atGetOne(TABLES.ORDERS, id);
    const g = (again && again.fields) || {};
    if (getLinkedId(g['Truck']) || getLinkedId(g['Partner']) || String(g['Group ID'] || '').trim()) throw new Error('η ανάγνωση πίσω δείχνει ακόμη φορτηγό ή groupage');
    // Out of the groupage = out of its order too (113 «Load Seq», 16/11): a place left on its points would be read as
    // the order of the next load the piece joins. The piece is already back in stock; a lost clear is said, not undone.
    let seqWas = [];
    try {
      const c = await stopsClearLoadSeq(id);
      seqWas = c.was;
      if (c.lost) showErrorToast(`Το κομμάτι γύρισε στο απόθεμα, αλλά η θέση του στη σειρά του groupage δεν σβήστηκε (${c.lost} ${c.lost === 1 ? 'σημείο' : 'σημεία'}) — ενημέρωσε τον Δημήτρη`, 'warn', 12000);
    } catch (e) {
      showErrorToast('Το κομμάτι γύρισε στο απόθεμα, αλλά η θέση του στη σειρά του groupage δεν διαβάστηκε για να σβηστεί — ενημέρωσε τον Δημήτρη', 'warn', 12000);
      if (typeof logError === 'function') logError(e instanceof Error ? e : new Error(String(e)), 'orders_intl_group piece load seq clear');
    }
    return { patch: was, seqWas };
  } catch (e) {
    showErrorToast('Το κομμάτι δεν γύρισε στο απόθεμα — δεν σβήστηκε τίποτα: ' + (e && e.message || e), 'warn', 12000);
    return false;
  }
}
async function pieceUndoBack(id, was, seqWas) {
  try {
    const res = await atSafePatch(TABLES.ORDERS, id, was);
    if (res && (res.error || res.conflict)) throw new Error(res.conflict ? 'άλλαξε από άλλον χρήστη' : (res.error.message || res.error.type));
    // back in its load = back in its place in the load (the places cleared by pieceBackToStock)
    let seqBad = 0;
    for (const x of seqWas || []) {
      try {
        const r = await atSafePatch(TABLES.ORDER_STOPS, x.id, { [F.STOP_LOAD_SEQ]: x.seq });
        if (r && (r.error || r.conflict)) seqBad++;
      } catch (e) { seqBad++; }
    }
    if (seqBad) showErrorToast('Το κομμάτι γύρισε στο groupage, αλλά η σειρά του δεν ξαναγράφτηκε — άνοιξε το groupage, σύρε και αποθήκευσε', 'warn', 12000);
  } catch (e) {
    showErrorToast('Το κομμάτι δεν σβήστηκε, αλλά έμεινε εκτός φορτηγού — βάλ\' το ξανά από το Εβδομαδιαίο: ' + (e && e.message || e), 'error', 15000);
    if (typeof logError === 'function') logError(e instanceof Error ? e : new Error(String(e)), 'orders_intl_group piece undo');
  }
}

// ── Save ───────────────────────────────────────────────────────────────────────
function saveBtn(text, busy) {
  const b = document.getElementById('btnSubmit'); if (!b) return;
  b.disabled = !!busy;
  b.textContent = text;
}
async function save() {
  const s = IG.s; if (!s || s.saving) return;
  if (s.mode !== 'group') {
    // A single load: the form of 8/11, with the panel's order as the points' numbers.
    const m = s.members[0];
    expand(m);
    syncOrder();
    return submitIntlOrder(m.recId || '', { stopPos: stopPosFor(m) });
  }
  return saveGroup();
}

async function saveGroup() {
  const s = IG.s;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    // An offline create answers a made-up id (core/api.js): the points and the group could not attach to it.
    showErrorToast('Χωρίς σύνδεση — το groupage δεν αποθηκεύεται εκτός σύνδεσης· δεν γράφτηκε τίποτα', 'warn', 9000);
    return;
  }
  if (preorderIn()) { toast('Το pre-order γίνεται πρώτα παραγγελία, μετά μπαίνει σε groupage — δεν γράφτηκε τίποτα', 'warn'); return; }
  s.saving = true;
  const n = s.members.length;
  // Escape / the footer cannot close the form under a running save (modalSetBusy); if it closes anyway, the save
  // stops at the next step and says how far it got — never a TypeError half-way (code review 15/11).
  if (typeof modalSetBusy === 'function') modalSetBusy(true);
  let done = 0;
  const gone = () => IG.s !== s;
  const stop = (msg) => {
    s.saving = false;
    if (typeof modalSetBusy === 'function') modalSetBusy(false);
    if (msg) showErrorToast(msg, 'warn', 15000);
    if (!gone()) paint();
  };
  const closedMsg = () => `Η φόρμα έκλεισε στη μέση της αποθήκευσης — αποθηκεύτηκαν ${done} από ${n} παραγγελίες· άνοιξε το groupage και πάτα ξανά Αποθήκευση`;
  try {
    syncOrder();
    // 1. Every order checked before any is written.
    for (const m of s.members) {
      if (gone()) return stop(closedMsg());
      expand(m); paintList();
      await submitIntlOrder(m.recId || '', { dryRun: true, gid: '', dupAsked: !!m.dupAsked, stopPos: stopPosFor(m), label: memberLabel(m) });
      const r = ST()._lastSave;
      if (!r || !r.ok) return stop(null);   // the reason is on screen, the order stays open; nothing was written
      m.dupAsked = true;
      saveBtn('Έλεγχος…', true);
    }
    // 2. The orders, one after the other, with the base Group ID and the places of their points.
    const base = s.base || ((s.dir === 'Import' ? 'GI-' : 'GRP-') + Date.now().toString(36).toUpperCase());
    s.base = base;
    for (const m of s.members) {
      if (gone()) return stop(closedMsg());
      expand(m); paintList();
      saveBtn(`Αποθήκευση ${done + 1}/${n}…`, true);
      const recId = m.recId || ST()._createdId || '';
      const veh = needsVehicle(m);
      await submitIntlOrder(recId, { gid: base, dupAsked: !!m.dupAsked, stopPos: stopPosFor(m), inherit: veh, noFinish: true });
      const r = ST()._lastSave;
      if (!r || !r.ok || !r.id) {
        return stop(done
          ? `Αποθηκεύτηκαν ${done} από ${n} παραγγελίες — η επόμενη δεν αποθηκεύτηκε (ο λόγος είναι στο προηγούμενο μήνυμα). Διόρθωσε και πάτα ξανά Αποθήκευση: όσες γράφτηκαν δεν ξαναδημιουργούνται.`
          : null);
      }
      m.recId = r.id;
      if (veh) m.f = Object.assign({}, m.f, veh);
      m.saved = true;
      done++;
    }
    // 3. The full Group ID: the order list the old screens read, derived from the per-point places.
    const side = s.dir === 'Import' ? 'lo' : 'dl';
    const ordered = orderByFirstPoint(s.members, s[side]);
    const gid = base + '|' + ordered.map(m => m.recId).join(',');
    saveBtn('Ένωση του groupage…', true);
    const bad = [];
    for (const m of ordered) {
      try {
        const res = await atSafePatch(TABLES.ORDERS, m.recId, { 'Group ID': gid });
        if (res && res.error) throw new Error(res.error.message || res.error.type);
        if (res && res.conflict) throw new Error('άλλαξε από άλλον χρήστη');
        if (String((res && res.fields || {})['Group ID'] || '') !== gid) {
          const back = await atGetOne(TABLES.ORDERS, m.recId);
          if (String((back.fields || {})['Group ID'] || '') !== gid) throw new Error('δεν επιβεβαιώθηκε στην ανάγνωση');
        }
      } catch (e) { bad.push((val(m, 'ls_client') || 'παραγγελία') + ': ' + (e && e.message || e)); }
    }
    // 4. The places of the points, read back (principle 2): before 113 and its Worker the server drops them quietly.
    let seqLost = 0;
    for (const m of ordered) {
      try {
        const st = await stopsLoad(m.recId, F.STOP_PARENT_ORDER);
        seqLost += st.filter(x => x.fields[F.STOP_TYPE] !== 'Cross-dock' && (x.fields[F.STOP_LOAD_SEQ] == null || x.fields[F.STOP_LOAD_SEQ] === '')).length;
      } catch (e) { console.warn('igx: read-back stops', e); }
    }
    // 5. Once for the whole load.
    invalidateCache(TABLES.ORDERS);
    if (typeof rtOnOrderSaved === 'function' && s.assign && !s.assign.mixed && !s.assign.plan) {
      try { await rtOnOrderSaved(ordered[0].recId); } catch (e) { console.warn('igx: rt', e); }
    }
    if (s.isNew && s.dir === 'Import' && typeof window._wiConsumePendingMatch === 'function') {
      try { await window._wiConsumePendingMatch(ordered[0].recId, ordered[0].f || {}); } catch (e) { console.warn('igx: pending match', e); }
    }
    if (typeof logError === 'function' && (bad.length || seqLost)) logError(new Error(`groupage save: group id not written ${bad.length}, load seq lost ${seqLost}`), 'orders_intl_group save');
    const docs = typeof OrderDocs !== 'undefined' ? await OrderDocs.formSettled() : null;
    s.saving = false;
    if (typeof modalSetBusy === 'function') modalSetBusy(false);
    closeModal();
    if (bad.length) showErrorToast('Οι παραγγελίες αποθηκεύτηκαν, αλλά δεν ενώθηκαν όλες στο groupage — ' + bad.join(' · ') + '. Άνοιξε το groupage και πάτα ξανά Αποθήκευση.', 'error', 20000);
    else if (seqLost) showErrorToast(`Το groupage αποθηκεύτηκε, αλλά η σειρά ανά σημείο ΔΕΝ κρατήθηκε από τον διακομιστή (${seqLost} σημεία) — ισχύει η σειρά παραγγελιών· ενημέρωσε τον Δημήτρη (113)`, 'warn', 15000);
    else toast(`Groupage αποθηκεύτηκε · ${n} παραγγελίες ✓${docs && docs.failed ? ' — ένα αρχείο ΔΕΝ ανέβηκε' : ''}`);
    if (typeof currentPage !== 'undefined' && currentPage === 'weekly_intl' && typeof renderWeeklyIntl === 'function') renderWeeklyIntl();
    else if (typeof currentPage !== 'undefined' && currentPage === 'daily_ops' && typeof renderDailyOps === 'function') renderDailyOps();
    else if (typeof renderOrdersIntl === 'function') await renderOrdersIntl();
  } catch (e) {
    reportError('Σφάλμα αποθήκευσης groupage', e);
    stop(null);
  }
}
// Pure: the members in the order of their first point in a list of point keys («mKEY:t:i»).
function orderByFirstPoint(members, list) {
  const at = m => { const k = list.findIndex(pk => pk.startsWith(m.key + ':')); return k < 0 ? 1e6 : k; };
  return [...members].sort((a, b) => at(a) - at(b));
}

window.IntlGroup = { on, openFrom, changed, reeferPicked, setMode, setDir, toggle, addNew, fromFile, pickExisting, pickPiece,
  remove, save, _filter, _addExisting, _addPiece,
  // pure helpers (tests/intl-group.test.js)
  _assignmentOf: assignmentOf, _seqUsable: seqUsable, _stopPosFor: stopPosFor, _setState: (st) => { IG.s = st; }, _moveBefore: moveBefore, _orderByFirstPoint: orderByFirstPoint, _state: () => IG.s };
})();
