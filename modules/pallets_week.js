// ═══════════════════════════════════════════════════════════
// MODULE — ΠΑΛΕΤΕΣ › ΕΒΔΟΜΑΔΑ (owner 2–3/11/2026)
// Design: docs/design/pallets-weekly-view-2026-11-02.md (rounds 3 + 4, approved 3/11), Figma N24–N28.
// One week as the Weekly International draws it — the SAME read and rows as «Παραγγελίες › Εβδομάδα»
// (OrdersWeekView.load / buildWeek / daySections, numbers from WI4 through OrdersWeekView.boardOf) — with each
// end's pallet exchange instead of money. Nothing here is a second rule:
//   - the week of an order: OrdersCommon.weekStartOf;
//   - the writes: plvConfirmCore / plvFixCore (pallet_ledger.js) and plRecordStops (core/pallet-feed.js);
//   - the paperclip: OrdersCommon.docClip; the assignment paper: OrdersWeekView.rowDocsOf / docsInner (print.html);
//   - the trip divider: .trip-row / .trip-part; the day band: .ow4-day / .ow4-day-0.
// The «Ελέγχθηκε» mark (/pallets/week-checks, migration 104) shows only when that route answers: until 104 and
// its Worker are live it is not drawn at all (no dead control).
// ═══════════════════════════════════════════════════════════
'use strict';

const PalletsWeek = (() => {
  const OWV = () => OrdersWeekView, OC = () => OrdersCommon;
  const esc = s => escapeHtml(String(s == null ? '' : s));
  const SINCE = '2026-08-10';          // the pallet ledger's first day (Φ1 live 10/8): «από 10/8»
  const REASONS = ['δεν είχαν άδειες', 'τις άφησε σε άλλο σημείο', 'γύρισαν με το φορτηγό', 'άλλο'];
  const S = { week: null, data: null, built: null, board: null, nums: null, rows: [], stops: null, stopsFailed: false,
    filter: null, all: false, q: '', ed: null, panel: null, checks: null, checksLive: false, changes: null,
    showChanges: false, busy: false, loadErr: null, root: null, route: new Map(), v5: null };
  const canWrite = () => typeof can !== 'function' || can('costs') === 'full' || can('orders') === 'full';
  const canCheck = () => typeof ROLE !== 'undefined' && (ROLE === 'owner' || ROLE === 'accountant');

  // ── data ─────────────────────────────────────────────────
  const isPE = rec => !!(rec && rec.fields && rec.fields['Pallet Exchange']);
  const pgOf = rec => OWV().pgIdOf(rec);
  const live = m => m.status !== 'reversed';
  // The week a movement belongs to: its order's week (the page's rule), else its own date. An order the ledger
  // could not read = no week («χωρίς εβδομάδα»), said beside the end-of-week balance, never guessed.
  function moveWeek(m) {
    if (m.order_id != null) {
      const o = (PLV.orderById || {})[m.order_id];
      return o ? OC().weekStartOf(o) : null;
    }
    return OC().weekStartOfYmd(m.movement_date);
  }
  // order pg id → its live LOADING / DELIVERY movements; rebuilt when the movements are (re)read, never per cell
  let _idx = null, _idxOf = null;
  function movesOf(rec) {
    const pg = pgOf(rec); if (!pg) return { L: [], D: [] };
    if (_idxOf !== PLV.movements) {
      _idx = new Map(); _idxOf = PLV.movements;
      for (const m of PLV.movements) {
        if (!live(m) || m.order_id == null || (m.event_type !== 'LOADING' && m.event_type !== 'DELIVERY')) continue;
        const k = String(m.order_id), e = _idx.get(k) || { L: [], D: [] };
        e[m.event_type === 'LOADING' ? 'L' : 'D'].push(m); _idx.set(k, e);
      }
    }
    return _idx.get(pg) || { L: [], D: [] };
  }
  function endStat(list) {
    const c = list.filter(m => m.status === 'confirmed'), p = list.filter(m => m.status === 'pending');
    const sum = (a, k) => a.reduce((s, m) => s + (+m[k] || 0), 0);
    return { n: list.length, nc: c.length, np: p.length, ct: sum(c, 'taken'), cg: sum(c, 'given'), pt: sum(p, 'taken'), pg: sum(p, 'given'), c, p };
  }
  // Stops of an end that should have a movement and have none — only for a delivered order with exchange (the
  // design's «λείπει καταγραφή»: loading stops, delivery stops with pallets). null = stops not read.
  function missingOf(rec, end, mv) {
    if (!isPE(rec) || (rec.fields || {})['Status'] !== 'Delivered') return 0;
    if (!S.stops) return null;
    const st = S.stops.get(rec.id); if (!st) return null;
    const need = end === 'L' ? st.L : st.D;
    return Math.max(0, need - (end === 'L' ? mv.L.length : mv.D.length));
  }
  async function loadStops(recs) {
    const ids = recs.flatMap(r => r.fields['ORDER STOPS'] || []);
    const out = new Map(), batches = [];
    for (let i = 0; i < ids.length; i += 90) {
      const f = `OR(${ids.slice(i, i + 90).map(id => `RECORD_ID()="${id}"`).join(',')})`;
      batches.push(atGetAll(TABLES.ORDER_STOPS, { filterByFormula: f, fields: [F.STOP_PARENT_ORDER, F.STOP_TYPE, F.STOP_PALLETS, F.STOP_PALLETS_EXCHANGED] }, false));
    }
    // The count follows what the feeders write (plOrderGate's stops): every loading stop except one whose
    // «Pallets Exchanged» is a set 0 (_plNoExchangeStop, core/pallet-feed.js — the same rule, never a copy),
    // every delivery stop with pallets.
    (await Promise.all(batches)).flat().forEach(s => {
      const p = s.fields[F.STOP_PARENT_ORDER], pid = Array.isArray(p) ? p[0] : p; if (!pid) return;
      const e = out.get(pid) || { L: 0, D: 0 };
      if (s.fields[F.STOP_TYPE] === 'Loading' && !_plNoExchangeStop(s)) e.L++;
      if (s.fields[F.STOP_TYPE] === 'Unloading' && (parseInt(s.fields[F.STOP_PALLETS], 10) || 0) > 0) e.D++;
      out.set(pid, e);
    });
    // an order read with no stop row is a known zero, not «unknown»
    recs.forEach(r => { if (!out.has(r.id)) out.set(r.id, { L: 0, D: 0 }); });
    return out;
  }
  async function reloadMoves() {
    const [mv, bc] = await Promise.all([plFetch('/pallets/movements'), plFetch('/pallets/balances?type=clients')]);
    PLV.movements = mv.records || []; PLV.cut = _plvCut(mv);
    PLV.balances.clients = bc.records || [];
  }
  async function loadChecks() {
    S.checks = null; S.changes = null;
    if (!S.data) return;
    const strip = S.data.strip;
    try {
      const r = await plFetch(`/pallets/week-checks?from=${strip[0]}&to=${strip[strip.length - 1]}`);
      S.checks = r.records || []; S.checksLive = true;
    } catch (e) { S.checksLive = false; return; }   // 104 not live yet: the mark is not drawn
    const mk = liveMark(S.week);
    if (mk) {
      try { S.changes = await plFetch(`/pallets/week-checks/${mk.id}/changes?ids=${weekMoveIds().join(',')}`); }
      catch (e) { S.changes = { failed: true }; }
    }
  }
  const liveMark = w => (S.checks || []).find(c => String(c.week_start).slice(0, 10) === w && !c.undone_at) || null;

  // ── the week ─────────────────────────────────────────────
  const weekOrders = w => (S.data ? S.data.intl : []).filter(r => !OWV().isSplitLeg(r) && OC().weekStartOf(r) === w);
  function weekMoveIds() {
    const pgs = new Set(weekOrders(S.week).filter(isPE).map(pgOf).filter(Boolean));
    return PLV.movements.filter(m => live(m) && m.order_id != null && pgs.has(String(m.order_id))).map(m => m.id);
  }
  function weekStats(w) {
    const orders = weekOrders(w).filter(isPE);
    const t = { orders: orders.length, taken: 0, given: 0, pending: 0, short: 0, missing: 0, moves: 0, unknownStops: false };
    for (const r of orders) {
      const mv = movesOf(r);
      for (const m of [...mv.L, ...mv.D]) {
        t.moves++;
        if (m.status === 'pending') t.pending++;
        else { t.taken += +m.taken || 0; t.given += +m.given || 0; }
      }
      const d = endStat(mv.D);
      if (d.nc && !d.np && d.cg > d.ct) t.short++;
      for (const end of ['L', 'D']) {
        const k = missingOf(r, end, mv);
        if (k == null) t.unknownStops = true; else t.missing += k;
      }
    }
    t.delta = t.given - t.taken;
    return t;
  }

  // A load lands only on the week it was asked for: two ‹ › clicks in flight never let the older answer overwrite
  // the newer week (the page would then wait on «Φόρτωση» for a week it no longer shows).
  async function load(force) {
    const week = S.week;
    const d = await OWV().load(week, 'intl', force);
    const built = OWV().buildWeek({ week, intl: d.intl, natl: [], rts: d.rts, cancelled: d.cancelled, stopDates: d.stopDates });
    let board = null, nums = null;
    try { board = OWV().boardOf(d, week); nums = WI4.numberOf(board.built, board.no); }
    catch (e) { console.error('pallets week: Weekly numbers', e); }
    const pe = d.intl.filter(r => isPE(r) && (r.fields || {})['Status'] === 'Delivered');
    let stops = null, stopsFailed = false;
    try { stops = await loadStops(pe); } catch (e) { console.error('pallets week: stops', e); stopsFailed = true; }
    if (week !== S.week) return false;
    Object.assign(S, { loadErr: null, data: d, built, board, nums, stops, stopsFailed, route: new Map(), v5: null });
    await loadChecks();
    return week === S.week;
  }

  // ── cells ────────────────────────────────────────────────
  // One end's two numbers (Π · Δ). Confirmed = the number; pending only = grey «◦N» (owner-approved mark);
  // both = the confirmed number and «+◦N» under it; a missing record = red «—» that writes it.
  function endCells(rec, end, mv, ref) {
    const st = endStat(mv[end]);
    const miss = missingOf(rec, end, mv);
    const num = (v, cls, title) => `<span class="plw-v${cls ? ' ' + cls : ''}"${title ? ` title="${esc(title)}"` : ''}>${v}</span>`;
    let pi, di, act = '';
    const under = ['', ''];
    if (!st.n) {
      if (miss) {
        act = canWrite() ? ` data-plwact="rec:${ref}:${end}" role="button" tabindex="0" title="Λείπει καταγραφή — κλικ για καταχώρηση"` : ' title="Λείπει καταγραφή"';
        pi = num('—', 'plw-miss'); di = num('—', 'plw-miss');
      } else { pi = num(''); di = num(''); }
    } else if (!st.nc) {
      pi = num('◦' + st.pt, 'plw-pend', 'εκκρεμεί, δεν μετρά'); di = num('◦' + st.pg, 'plw-pend', 'εκκρεμεί, δεν μετρά');
    } else {
      pi = num(st.ct, st.ct ? '' : 'plw-zero'); di = num(st.cg, st.cg ? '' : 'plw-zero');
      if (st.np) {
        if (st.pt) under[0] = `<span class="plw-u plw-pend" title="το εκκρεμές μέρος — δεν μετρά">+◦${st.pt}</span>`;
        if (st.pg) under[1] = `<span class="plw-u plw-pend" title="το εκκρεμές μέρος — δεν μετρά">+◦${st.pg}</span>`;
      }
      if (end === 'D' && !st.np && st.cg > st.ct) under[0] = `<span class="plw-u plw-short" title="δεν γύρισαν ${st.cg - st.ct}">−${st.cg - st.ct}</span>`;
    }
    if (!act && canWrite()) {
      if (st.np === 1 && st.n === 1) act = ` data-plwact="conf:${st.p[0].id}" role="button" tabindex="0" title="Επιβεβαίωση"`;
      else if (st.np) act = ` data-plwact="panel:${ref}" role="button" tabindex="0" title="Περισσότερες κινήσεις — στο πάνελ"`;
      else if (end === 'D' && st.nc === 1 && st.cg > st.ct) act = ` data-plwact="fix:${st.c[0].id}" role="button" tabindex="0" title="Διόρθωση ανταλλαγής · τι έγιναν"`;
    }
    const open = S.ed && S.ed.cell === `${ref}:${end}`;
    return `<div class="plw-end${act ? ' plw-act' : ''}${open ? ' plw-on' : ''}"${act}><div class="plw-pd">${pi}${di}</div><div class="plw-pd plw-unders">${under[0] || '<span></span>'}${under[1] || '<span></span>'}</div></div>`;
  }
  function done(rec, mv) {
    const L = endStat(mv.L), D = endStat(mv.D);
    return isPE(rec) && L.n && D.n && !L.np && !D.np && !missingOf(rec, 'L', mv) && !missingOf(rec, 'D', mv);
  }
  function legHtml(l, side, ri, li) {
    const O = OC();
    if (!l.rec) return `<div class="plw-leg plw-leg-no trip-part"><div class="plw-c plw-g">#${esc(l.orderId)} εκτός εύρους</div></div>`;
    const rec = l.rec, f = rec.fields || {}, e = OWV().endsOf(rec), ref = `${ri}.${li}`;
    const no = S.nums ? S.nums.get(rec.id) : undefined;
    const route = `<div class="plw-c plw-route"><div class="plw-l1" title="${esc((e.from || '—') + ' → ' + (e.to || '—'))}">${no != null ? `<span class="plw-no">${no}</span>` : ''}${esc(e.from || '—')}${e.nFrom ? ` +${e.nFrom}` : ''} <span class="plw-ar">→</span> ${esc(e.to || '—')}${e.nTo ? ` +${e.nTo}` : ''}</div>
      <div class="plw-l2">${esc(OWV().dayShort(e.load) || '—')} <span class="plw-ar">→</span> ${esc(OWV().dayShort(e.del) || '—')}</div></div>`;
    const cl = OWV().clientRaw(f) || '—';
    const pal = parseInt(f['Total Pallets'] || f['Pallets'] || 0, 10);
    const client = `<div class="plw-c plw-client"><div class="plw-l1" title="${esc(cl)}">${esc(cl)}</div>
      <div class="plw-l2">${esc(O.numLabel(rec))}${pal ? ` · ${pal} παλ.` : ''}${isPE(rec) ? ' <span class="plw-pe">PE</span>' : ''} ${O.docClip(rec, 'intl')}</div></div>`;
    if (!isPE(rec)) {
      const cells = [route, client, '<div class="plw-c plw-nope">χωρίς ανταλλαγή</div>'];
      return `<div class="plw-leg plw-leg-no trip-part${!l.inWeek ? ' plw-off' : ''}" data-plwleg="${ref}">${(side === 'l' ? cells : cells.reverse()).join('')}</div>`;
    }
    const mv = movesOf(rec);
    const tick = `<div class="plw-tick">${done(rec, mv) ? '<span class="plw-ok" title="ανταλλαγή ολοκληρώθηκε (όλα οριστικά)">✓</span>' : ''}</div>`;
    const ends = `<div class="plw-ends">${endCells(rec, 'L', mv, ref)}${endCells(rec, 'D', mv, ref)}</div>`;
    const cells = side === 'l' ? [route, client, tick, ends] : [ends, tick, client, route];
    const ed = S.ed && S.ed.ref === ref ? edLine(S.ed) : '';
    return `<div class="plw-leg trip-part${!l.inWeek ? ' plw-off' : ''}${ed ? ' plw-editing' : ''}" data-plwleg="${ref}">${cells.join('')}${ed}</div>`;
  }
  const emptySide = t => `<div class="plw-leg plw-leg-no trip-part"><div class="plw-c plw-g">${t}</div></div>`;
  function rowHtml(r, ri) {
    const v = OWV().vehicleOf(r.vehicleRec);
    const exp = r.exp.length ? r.exp.map((l, li) => legHtml(l, 'l', ri, 'e' + li)).join('') : emptySide('Χωρίς εξαγωγή');
    const imp = r.imp.length ? r.imp.map((l, li) => legHtml(l, 'r', ri, 'i' + li)).join('') : emptySide('Χωρίς εισαγωγή');
    const docs = S.board ? OWV().rowDocsOf(S.board, r) : [];
    const asg = `<div class="plw-asg${docs.length ? ' plw-act' : ''}"${docs.length ? ` data-plwdoc="${ri}" role="button" tabindex="0" title="Έγγραφο ανάθεσης"` : ''}>
      <div class="plw-l1 plw-veh">${v.kind === 'none' ? `<span class="plw-g">${esc(v.text)}</span>` : `<span class="plw-plate">${esc(v.plate)}</span>`}${docs.length ? ' <span class="plw-doc">⎙</span>' : ''}</div>
      <div class="plw-l2">${v.kind === 'none' ? '' : esc(v.who)}</div></div>`;
    return `<div class="plw-row trip-row"><div class="plw-side">${exp}</div>${asg}<div class="plw-side plw-r">${imp}</div></div>`;
  }

  // ── the editor line (the row grows one line while it is open, design N27) ──
  function edLine(ed) {
    const err = ed.err ? `<div class="plw-err">${esc(ed.err)}</div>` : '';
    if (ed.kind === 'conf') {
      const m = PLV.movements.find(x => x.id === ed.id);
      if (!m) return '';
      return `<div class="plw-ed" data-plwed="1">
        <label>Π <input class="plw-in" data-plwin="taken" type="number" min="0" value="${esc(ed.taken ?? m.taken)}"></label>
        <label>Δ <input class="plw-in" data-plwin="given" type="number" min="0" value="${esc(ed.given ?? m.given)}"></label>
        <label class="plw-sheet" title="Δελτίο (προαιρετικά)">+ δελτίο<input type="file" data-plwin="file" accept="image/*,application/pdf" hidden></label>
        <span class="plw-g">${esc(ed.fileName || '')}</span>
        <button class="plw-btn" data-plwgo="save">Επιβεβαίωση ↵</button><span class="plw-hint">↵ επιβεβαίωση · Esc</span>${err}</div>`;
    }
    if (ed.kind === 'fix') {
      const m = PLV.movements.find(x => x.id === ed.id);
      if (!m) return '';
      return `<div class="plw-ed" data-plwed="1">
        <span>Παράδοση: δώσαμε ${esc(m.given)}. Πόσες πήραμε πραγματικά;</span>
        <input class="plw-in" data-plwin="taken" type="number" min="0" value="${esc(ed.taken ?? m.taken)}">
        <span class="plw-g">Τι έγιναν;</span>${REASONS.map(t => `<button class="plw-reason${ed.reason === t ? ' on' : ''}" data-plwreason="${esc(t)}">${ed.reason === t ? '✓ ' : ''}${esc(t)}</button>`).join('')}
        ${ed.reason === 'άλλο' ? `<input class="plw-in plw-note" data-plwin="note" placeholder="τι έγινε" value="${esc(ed.note || '')}">` : ''}
        <button class="plw-btn" data-plwgo="save">Καταχώρηση διόρθωσης ↵</button><span class="plw-hint">ερωτάται, δεν μπλοκάρει · Esc</span>${err}</div>`;
    }
    const what = ed.end === 'L' ? 'φόρτωσης' : 'παράδοσης';
    return `<div class="plw-ed" data-plwed="1"><span>Καταχώρηση ${what}: γράφονται μόνο οι στάσεις που δεν έχουν κίνηση, με την ημερομηνία τους${ed.end === 'L' ? ' (εκκρεμής, μετά επιβεβαίωση)' : ' (οριστική 1:1, όπως στο «Παραδόθηκε»)'}.</span>
      <button class="plw-btn" data-plwgo="save">Καταχώρηση ↵</button><span class="plw-hint">Esc</span>${err}</div>`;
  }
  function legByRef(ref) {
    if (!ref) return null;
    const [ri, li] = ref.split('.'), r = S.rows[+ri]; if (!r || !li) return null;
    return (li[0] === 'e' ? r.exp : r.imp)[+li.slice(1)] || null;
  }
  // The leg a movement draws on (its order), for the conf / fix editors opened from a cell.
  function refOfMove(id) {
    const m = PLV.movements.find(x => x.id === id); if (!m) return null;
    for (let ri = 0; ri < S.rows.length; ri++) {
      const r = S.rows[ri];
      for (const [k, list] of [['e', r.exp], ['i', r.imp]]) {
        const li = list.findIndex(l => l.rec && pgOf(l.rec) === String(m.order_id));
        if (li >= 0) return { ref: `${ri}.${k}${li}`, end: m.event_type === 'LOADING' ? 'L' : 'D' };
      }
    }
    return null;
  }
  function openEd(act) {
    const [kind, a, b] = act.split(':');
    if (kind === 'conf' || kind === 'fix') {
      const id = +a, at = refOfMove(id); if (!at) return;
      S.ed = { kind, id, ref: at.ref, cell: `${at.ref}:${at.end}` };
    } else if (kind === 'rec') {
      S.ed = { kind, ref: a, end: b, cell: `${a}:${b}` };
    } else return;
    draw();
    focusEd();
  }
  function focusEd() {
    const i = S.root && S.root.querySelector('[data-plwed] .plw-in, [data-plwed] .plw-btn');
    if (i) { i.focus(); if (i.select) i.select(); }
  }
  function keepEd() {
    if (!S.ed || !S.root) return;
    const v = k => { const i = S.root.querySelector(`[data-plwed] [data-plwin="${k}"]`); return i ? i.value : undefined; };
    if (v('taken') !== undefined) S.ed.taken = v('taken');
    if (v('given') !== undefined) S.ed.given = v('given');
    if (v('note') !== undefined) S.ed.note = v('note');
  }
  // After a write: re-read the movements (never assume what was written, principle 2) and redraw the week from the
  // Worker's answer. A failure re-reads too and says which step did not happen.
  const STEP = { values: 'οι τιμές δεν γράφτηκαν', confirm: 'οι τιμές γράφτηκαν· η επιβεβαίωση δεν έγινε', reverse: 'η διόρθωση δεν έγινε',
    upload: 'το δελτίο δεν ανέβηκε· τίποτα δεν γράφτηκε' };
  async function saveEd() {
    if (!S.ed || S.busy) return;
    if (_plvBlockReadOnly()) return;
    keepEd();
    const ed = S.ed;
    S.busy = true; ed.err = null;
    try {
      if (ed.kind === 'conf') {
        const m = PLV.movements.find(x => x.id === ed.id);
        const taken = parseInt(ed.taken ?? (m && m.taken), 10) || 0, given = parseInt(ed.given ?? (m && m.given), 10) || 0;
        // the page's own rule (plvDoConfirm), said in the row
        if (m && m.event_type !== 'ADJUSTMENT' && taken + given === 0) { ed.err = 'Μηδενικές ποσότητες — συμπλήρωσε πόσες παλέτες πήραμε ή δώσαμε'; draw(); focusEd(); return; }
        let sheetPath = null;
        if (ed.file) { try { sheetPath = await plvUploadSheet(ed.file); } catch (e) { e.plvStep = 'upload'; throw e; } }
        await plvConfirmCore(ed.id, { taken, given, sheetPath });
      } else if (ed.kind === 'fix') {
        const m = PLV.movements.find(x => x.id === ed.id);
        const note = ed.reason === 'άλλο' ? (ed.note || 'άλλο') : (ed.reason || '');
        await plvFixCore(m, { realTaken: parseInt(ed.taken ?? m.taken, 10) || 0, note });
      } else {
        const l = legByRef(ed.ref);
        const out = await plRecordStops(l.rec.id, ed.end === 'L' ? 'LOADING' : 'DELIVERY');
        if (!out.created) ed.err = 'Δεν γράφτηκε τίποτα: οι στάσεις έχουν ήδη κίνηση ή δεν έχουν παλέτες';
      }
      await reloadMoves();
      await loadChecks();
      if (!ed.err) { S.ed = null; if (ed.ref !== 'panel') S._next = 'next'; }
      draw();
      focusEd();
    } catch (e) {
      ed.err = (STEP[e.plvStep] ? STEP[e.plvStep] + ': ' : '') + _plvErrMsg(e);
      try { await reloadMoves(); } catch (_) { ed.err += ' · η ανανέωση των κινήσεων απέτυχε — ξαναφόρτωσε τη σελίδα'; }
      draw(); focusEd();
    } finally { S.busy = false; }
  }
  function closeEd() { if (!S.ed) return false; S.ed = null; draw(); return true; }

  // ── «Ελέγχθηκε» (shown only when /pallets/week-checks answers) ──
  async function check(again) {
    if (S.busy) return;
    const ids = weekMoveIds();
    if (again && S.changes && ((S.changes.untracked || []).length || S.changes.audit_failed)
        && !confirm('Κάποιες αλλαγές δεν καταγράφηκαν. Νέος έλεγχος; Το κενό μένει στο ιστορικό.')) return;
    S.busy = true;
    try {
      await plFetch('/pallets/week-checks', { method: 'POST', body: { week_start: S.week, movement_ids: ids, missing_stop_ids: [], empty_week: ids.length === 0, again: !!again } });
      S.showChanges = false;
      await loadChecks();
    } catch (e) { toast('Το σημάδι δεν γράφτηκε: ' + _plvErrMsg(e), 'error'); await loadChecks(); }
    finally { S.busy = false; draw(); }
  }
  async function uncheck() {
    const mk = liveMark(S.week); if (!mk || S.busy) return;
    if (!confirm(`Αναίρεση ελέγχου ${OC().dm(S.week)} – ${OC().dm(OC().addDays(S.week, 6))}; Το σημάδι φεύγει· μένει στο ιστορικό.`)) return;
    S.busy = true;
    try { await plFetch(`/pallets/week-checks/${mk.id}`, { method: 'PATCH', body: {} }); await loadChecks(); }
    catch (e) { toast('Η αναίρεση δεν έγινε: ' + _plvErrMsg(e), 'error'); await loadChecks(); }
    finally { S.busy = false; draw(); }
  }
  const nChanged = c => c && !c.failed ? (c.changed || []).length + (c.moved || []).length + (c.untracked || []).length : null;
  function checkHtml() {
    if (!S.checksLive) return '';
    const mk = liveMark(S.week);
    if (!mk) return canCheck() ? '<span class="plw-sep"></span><button class="plw-check" data-plwck="mark" title="Σήμανση της εβδομάδας ως ελεγμένης"><span class="plw-box"></span>Ελέγχθηκε</button>' : '';
    const n = nChanged(S.changes);
    const ch = S.changes && S.changes.failed ? ' <span class="plw-g">· δεν μετρήθηκε</span>'
      : n ? ` <button class="plw-link plw-amber" data-plwck="changes">● ${n} άλλαξαν →</button>` : '';
    const box = canCheck() ? '<button class="plw-check on" data-plwck="undo" title="Αναίρεση ελέγχου"><span class="plw-box">✓</span>Ελέγχθηκε</button>' : '<span class="plw-check on"><span class="plw-box">✓</span>Ελέγχθηκε</span>';
    return `<span class="plw-sep"></span>${box} <span class="plw-g">${esc(mk.checked_by)} · ${esc(OC().dm(mk.checked_at))}</span>${ch}`;
  }
  function changesHtml() {
    if (!S.showChanges || !S.changes || S.changes.failed) return '';
    const c = S.changes, mv = id => PLV.movements.find(m => m.id === id);
    const stTxt = s => s === 'pending' ? 'εκκρεμής' : s === 'confirmed' ? 'οριστική' : 'αντιλογισμένη';
    const desc = x => {
      const w = x.was, n = x.now;
      if (!w && n) return `πήραμε ${n.taken} · δώσαμε ${n.given}`;
      if (w && !n) return `διαγράφηκε · <s>πήραμε ${w.taken} · δώσαμε ${w.given}</s>`;
      const parts = [];
      if (w.status !== n.status) parts.push(`${stTxt(w.status)} › ${stTxt(n.status)}`);
      if (w.taken !== n.taken) parts.push(`πήραμε ${w.taken} › ${n.taken}`);
      if (w.given !== n.given) parts.push(`δώσαμε ${w.given} › ${n.given}`);
      return parts.join(' · ') || 'αντισυμβαλλόμενος';
    };
    const orderOf = id => { const m = mv(id), o = m && (PLV.orderById || {})[m.order_id]; return o ? `${OC().numLabel(o)} · ${OWV().clientRaw(o.fields) || ''}` : (m && m.order_id != null ? '#' + m.order_id : '—'); };
    const rows = [...(c.changed || []).map(x => [x, 'changed']), ...(c.moved || []).map(x => [x, 'moved']), ...(c.untracked || []).map(x => [x, 'untracked'])]
      .sort((a, b) => orderOf(a[0].id).localeCompare(orderOf(b[0].id), 'el'));
    const kindTxt = { moved: '<span class="plw-amber">● πήγε σε άλλη εβδομάδα</span>', untracked: '<span class="plw-miss">● άλλαξε χωρίς ίχνος</span>' };
    return `<div class="plw-sec"><div class="plw-sech"><b>Άλλαξαν μετά τον έλεγχο</b> <span class="plw-amber">${nChanged(c)} κινήσεις</span>
        <span class="plw-g">· από ${esc(OC().dm(c.checked_at))}</span>${c.audit_failed ? ' <span class="plw-miss">● κάποιες αλλαγές δεν καταγράφηκαν</span>' : ''}
        <span class="plw-sp"></span>${canCheck() ? '<button class="plw-btn plw-ghost" data-plwck="again">✓ Ελέγχθηκε ξανά</button>' : ''}<button class="plw-x" data-plwck="hide" title="Κλείσιμο">×</button></div>
      <table class="plw-tbl"><thead><tr><th>ΠΑΡΑΓΓΕΛΙΑ</th><th>ΤΙ ΑΛΛΑΞΕ</th><th>ΠΟΙΟΣ</th><th>ΠΟΤΕ</th></tr></thead><tbody>
      ${rows.map(([x, k]) => `<tr><td>${esc(orderOf(x.id))}</td><td>${kindTxt[k] || desc(x)}</td><td class="plw-g">${esc(x.by || '')}</td><td class="plw-g">${x.at ? esc(OC().dm(x.at)) : ''}</td></tr>`).join('')}
      </tbody></table>${c.note_only ? `<div class="plw-foot">+ ${c.note_only} μόνο σημείωση</div>` : ''}</div>`;
  }

  // ── the statement, the drivers, the rest ─────────────────
  const sgn = v => v == null ? '—' : v > 0 ? '+' + v : String(v).replace('-', '−');
  function statementHtml() {
    const w = S.week, by = new Map(), noWeek = new Map();
    const peWeek = new Set(weekOrders(w).filter(isPE).map(pgOf).filter(Boolean));
    for (const m of PLV.movements) {
      if (!live(m) || m.counterparty_type !== 'CLIENT' || m.client_id == null) continue;
      // the week's own orders decide «this week» (S.data); the ledger's order map only places the OTHER weeks
      const mw = m.order_id != null && peWeek.has(String(m.order_id)) ? w : moveWeek(m);
      if (mw == null) { noWeek.set(m.client_id, (noWeek.get(m.client_id) || 0) + 1); continue; }
      const e = by.get(m.client_id) || { orders: new Set(), taken: 0, given: 0, pending: 0, later: 0, inWeek: false };
      if (mw === w && m.order_id != null && peWeek.has(String(m.order_id))) {
        e.inWeek = true; e.orders.add(m.order_id);
        if (m.status === 'pending') e.pending++; else { e.taken += +m.taken || 0; e.given += +m.given || 0; }
      }
      // End of week «as it looks today»: today's balance minus the confirmed changes of the LATER weeks.
      if (mw > w && m.status === 'confirmed') e.later += (+m.given || 0) - (+m.taken || 0);
      by.set(m.client_id, e);
    }
    const bal = new Map((PLV.balances.clients || []).map(b => [b.client_id, b]));
    const rows = [...by.entries()].filter(([, e]) => e.inWeek).map(([id, e]) => {
      const b = bal.get(id), today = b ? b.balance : null;
      return Object.assign({ id, name: (b && b.client_name) || ('#' + id) }, e,
        { delta: e.given - e.taken, today, end: today == null ? null : today - e.later, nw: noWeek.get(id) || 0 });
    }).sort((a, b) => a.name.localeCompare(b.name, 'el'));
    if (!rows.length) return '';
    const tot = rows.reduce((t, r) => ({ o: t.o + r.orders.size, t: t.t + r.taken, g: t.g + r.given, p: t.p + r.pending }), { o: 0, t: 0, g: 0, p: 0 });
    return `<div class="plw-sec"><div class="plw-sech"><b>Κατάσταση εβδομάδας</b> <span class="plw-g">${esc(OWV().dayShort(w))} – ${esc(OWV().dayShort(OC().addDays(w, 6)))} · ανά αντισυμβαλλόμενο · οριστικές</span></div>
      <table class="plw-tbl plw-num"><thead><tr><th>ΑΝΤΙΣΥΜΒΑΛΛΟΜΕΝΟΣ</th><th>ΠΑΡΑΓΓΕΛΙΕΣ</th><th>ΠΗΡΑΜΕ</th><th>ΔΩΣΑΜΕ</th><th>ΜΕΤΑΒΟΛΗ</th><th>ΕΚΚΡΕΜΕΙΣ</th><th title="όπως φαίνεται σήμερα: υπόλοιπο σήμερα − μεταβολές επόμενων εβδομάδων">ΤΕΛΟΣ ΕΒΔ.</th><th>ΥΠΟΛΟΙΠΟ ΣΗΜΕΡΑ</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.name)}</td><td>${r.orders.size}</td><td>${r.taken}</td><td>${r.given}</td><td>${sgn(r.delta)}</td><td>${r.pending}</td>
        <td>${sgn(r.end)}${r.nw ? ` <span class="plw-g" title="${r.nw} κινήσεις χωρίς εβδομάδα: η παραγγελία τους δεν διαβάστηκε">+${r.nw} χωρίς εβδομάδα</span>` : ''}</td><td>${sgn(r.today)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>Σύνολο εβδομάδας</td><td>${tot.o}</td><td>${tot.t}</td><td>${tot.g}</td><td>${sgn(tot.g - tot.t)}</td><td>${tot.p}</td><td></td><td></td></tr></tfoot></table>
      ${PLV.cut ? `<div class="plw-foot">${_plvCutNote(PLV.cut, true)}</div>` : ''}
      ${PLV.enrichFail ? '<div class="plw-foot" style="color:var(--warn)">⚠ οι παραγγελίες του Ισοζυγίου δεν διαβάστηκαν: το «Τέλος εβδ.» μετρά μόνο αυτή την εβδομάδα — οι κινήσεις των άλλων εβδομάδων είναι «χωρίς εβδομάδα»</div>' : ''}</div>`;
  }
  function driversHtml() {
    const wkPg = new Set(weekOrders(S.week).map(pgOf).filter(Boolean));
    const by = new Map();
    for (const m of PLV.movements) {
      if (m.status !== 'confirmed' || m.event_type !== 'DELIVERY' || !(+m.given > +m.taken) || String(m.movement_date) < SINCE) continue;
      const o = (PLV.orderById || {})[m.order_id] || (S.data ? S.data.intl.find(r => pgOf(r) === String(m.order_id)) : null);
      const did = o ? getLinkedId(o.fields['Driver']) : null;
      const d = did ? getRefDrivers().find(x => x.id === did) : null;
      const name = d ? d.fields['Full Name'] : 'χωρίς οδηγό';
      const e = by.get(name) || { wn: 0, wp: 0, an: 0, ap: 0 };
      const n = (+m.given) - (+m.taken);
      e.an++; e.ap += n;
      if (wkPg.has(String(m.order_id))) { e.wn++; e.wp += n; }
      by.set(name, e);
    }
    const rows = [...by.entries()].sort((a, b) => b[1].ap - a[1].ap);
    if (!rows.length) return '';
    const z = v => v ? v : '<span class="plw-zero">0</span>';
    const t = rows.reduce((s, [, e]) => ({ wn: s.wn + e.wn, wp: s.wp + e.wp, an: s.an + e.an, ap: s.ap + e.ap }), { wn: 0, wp: 0, an: 0, ap: 0 });
    return `<div class="plw-sec"><div class="plw-sech"><b>Δεν γύρισαν ανά οδηγό</b> <span class="plw-g">οριστικές παραδόσεις με δώσαμε &gt; πήραμε · από τις κινήσεις, καμία νέα καταχώρηση</span></div>
      <table class="plw-tbl plw-num"><thead><tr><th>ΟΔΗΓΟΣ ΠΑΡΑΓΓΕΛΙΑΣ</th><th>ΕΒΔ. ΠΑΡΑΔΟΣΕΙΣ</th><th>ΕΒΔ. ΠΑΛΕΤΕΣ</th><th>ΑΠΟ 10/8 ΠΑΡΑΔ.</th><th>ΑΠΟ 10/8 ΠΑΛΕΤΕΣ</th></tr></thead><tbody>
      ${rows.map(([n, e]) => `<tr><td>${esc(n)}</td><td>${z(e.wn)}</td><td>${z(e.wp)}</td><td>${e.an}</td><td>${e.ap}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>Σύνολο</td><td>${t.wn}</td><td>${t.wp}</td><td>${t.an}</td><td>${t.ap}</td></tr></tfoot></table>
      ${PLV.enrichFail ? '<div class="plw-foot" style="color:var(--warn)">⚠ οι παραγγελίες του Ισοζυγίου δεν διαβάστηκαν: όσες δεν είναι σε αυτή την εβδομάδα φαίνονται «χωρίς οδηγό»</div>' : ''}</div>`;
  }
  function othersHtml() {
    const w = S.week;
    const inW = m => live(m) && OC().weekStartOfYmd(m.movement_date) === w;
    const partners = PLV.movements.filter(m => inW(m) && m.counterparty_type === 'PARTNER').length;
    const noOrder = PLV.movements.filter(m => inW(m) && m.order_id == null && m.counterparty_type !== 'PARTNER' && m.piece_leg_id == null).length;
    const natl = PLV.movements.filter(m => inW(m) && m.piece_leg_id != null).length;
    const line = (t, n) => `<div class="plw-other"><b>${t}</b> <span class="plw-g">${n ? n + ' κινήσεις' : 'καμία κίνηση'}</span></div>`;
    return `<div class="plw-sec">${line('Συνεργάτες', partners)}${line('Χωρίς παραγγελία', noOrder)}${line('Εθνικές', natl)}</div>`;
  }

  // ── the page ─────────────────────────────────────────────
  function stripHtml() {
    const sel = S.week, strip = S.data.strip;
    return `<div class="plw-strip"><button class="plw-nav" data-plwweek="${OC().addDays(sel, -7)}" title="Προηγούμενη εβδομάδα">‹</button>
      ${strip.map(w => {
        const t = weekStats(w), m = S.checksLive ? liveMark(w) : null;
        const changed = m && w === sel ? nChanged(S.changes) : 0;
        const mark = m ? (changed ? ` <span class="plw-ok">✓</span> <span class="plw-amber">${changed} άλλαξαν</span>` : ' <span class="plw-ok">✓ ελέγχθηκε</span>') : '';
        const l2 = t.orders ? `${sgn(t.delta)} · ${t.pending} ${t.pending === 1 ? 'εκκρεμής' : 'εκκρεμείς'}${t.missing ? ` <span class="plw-miss">● ${t.missing} λείπει καταγραφή</span>` : ''}` : 'καμία παραγγελία με ανταλλαγή';
        return `<button class="plw-wk${w === sel ? ' on' : ''}" data-plwweek="${w}"><span class="plw-wl1">${esc(OC().dm(w))} – ${esc(OC().dm(OC().addDays(w, 6)))}${mark}</span><span class="plw-wl2">${l2}</span></button>`;
      }).join('')}
      <button class="plw-nav" data-plwweek="${OC().addDays(sel, 7)}" title="Επόμενη εβδομάδα">›</button></div>`;
  }
  function summaryHtml(t) {
    const f = S.filter;
    const chip = (k, n, txt, red) => n ? `<button class="plw-link${f === k ? ' on' : ''}${red ? ' plw-red' : ''}" data-plwfilter="${k}">${n} ${txt} →</button>` : `<span class="plw-g">0 ${txt}</span>`;
    return `<div class="plw-sum"><b>${esc(OC().dm(S.week))} – ${esc(OC().dm(OC().addDays(S.week, 6)))}</b>
      <span>${t.orders} παραγγελίες με ανταλλαγή</span><span class="plw-g">·</span><span class="plw-g">πήραμε</span><b>${t.taken}</b><span class="plw-g">·</span><span class="plw-g">δώσαμε</span><b>${t.given}</b><span class="plw-g">·</span><span class="plw-g">μεταβολή</span><b>${sgn(t.delta)}</b>
      ${chip('pending', t.pending, t.pending === 1 ? 'εκκρεμής' : 'εκκρεμείς')}<span class="plw-g">·</span>${chip('short', t.short, 'χωρίς πλήρη επιστροφή')}<span class="plw-g">·</span>${chip('missing', t.missing, 'λείπει καταγραφή', true)}
      ${t.unknownStops ? '<span class="plw-g" title="Οι στάσεις δεν διαβάστηκαν: το «λείπει καταγραφή» δεν μετρήθηκε">⚠ στάσεις μη διαθέσιμες</span>' : ''}
      <span class="plw-sp"></span>${checkHtml()}<button class="plw-link" data-plwgo="moves">${t.moves} κινήσεις →</button></div>`;
  }
  function rowMatches(r) {
    const legs = [...r.exp, ...r.imp].filter(l => l.rec);
    if (!S.all && !legs.some(l => isPE(l.rec))) return false;
    if (S.filter) {
      const hit = legs.some(l => {
        if (!isPE(l.rec)) return false;
        const mv = movesOf(l.rec);
        if (S.filter === 'missing') return !!(missingOf(l.rec, 'L', mv) || missingOf(l.rec, 'D', mv));
        if (S.filter === 'pending') return [...mv.L, ...mv.D].some(m => m.status === 'pending');
        const d = endStat(mv.D); return !!(d.nc && !d.np && d.cg > d.ct);
      });
      if (!hit) return false;
    }
    if (S.q) {
      const q = S.q.toLowerCase(), v = OWV().vehicleOf(r.vehicleRec);
      const txt = [v.text, ...legs.map(l => [OC().numLabel(l.rec), OWV().clientRaw(l.rec.fields), l.rec.fields['Reference']].join(' '))].join(' ').toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  }
  function tableHtml() {
    const all = [...S.built.rows, ...S.built.noRt];
    all.forEach(r => { r.nos = S.nums ? OWV().rowNumbers(r, S.nums) : []; });
    S.rows = all;
    const shown = all.filter(rowMatches);
    const sec = OWV().daySections(S.week, shown.filter(r => r.kind === 'rt'));
    const noRt = shown.filter(r => r.kind !== 'rt');
    const idx = r => all.indexOf(r);
    let body = '';
    for (const dd of sec.days) {
      if (!dd.rows.length) { body += `<div class="ow4-day ow4-day-0">${esc(OWV().dayFull(dd.day))} · καμία παραγγελία</div>`; continue; }
      body += `<div class="ow4-day">${esc(OWV().dayLabel(dd.day))}</div>` + dd.rows.map(r => rowHtml(r, idx(r))).join('');
    }
    if (sec.moved.length) body += '<div class="ow4-day">ΜΕΤΑΦΕΡΘΗΚΕ ΣΕ ΑΥΤΗ ΤΗΝ ΕΒΔΟΜΑΔΑ</div>' + sec.moved.map(r => rowHtml(r, idx(r))).join('');
    if (sec.other.length) body += '<div class="ow4-day">ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ</div>' + sec.other.map(r => rowHtml(r, idx(r))).join('');
    if (noRt.length) body += '<div class="ow4-day">ΧΩΡΙΣ ΔΡΟΜΟΛΟΓΙΟ</div>' + noRt.map(r => rowHtml(r, idx(r))).join('');
    const hEnd = '<span class="plw-hend"><span>ΦΟΡΤΩΣΗ</span><span>Π · Δ</span></span><span class="plw-hend"><span>ΠΑΡΑΔΟΣΗ</span><span>Π · Δ</span></span>';
    const headL = `<div class="plw-hl"><span>ΕΞΑΓΩΓΗ · ΔΙΑΔΡΟΜΗ</span><span>ΠΕΛΑΤΗΣ</span><span></span><span class="plw-hends">${hEnd}</span></div>`;
    const headR = `<div class="plw-hl plw-r"><span class="plw-hends">${hEnd}</span><span></span><span>ΕΙΣΑΓΩΓΗ · ΠΕΛΑΤΗΣ</span><span>ΔΙΑΔΡΟΜΗ</span></div>`;
    const nPE = all.filter(r => [...r.exp, ...r.imp].some(l => l.rec && isPE(l.rec))).length;
    const fName = { missing: 'Λείπει καταγραφή', pending: 'Εκκρεμείς', short: 'Χωρίς πλήρη επιστροφή' }[S.filter];
    return `<div class="plw-tools"><b>Διεθνείς</b>${S.filter ? ` <button class="plw-chip" data-plwfilter="">${fName} ${shown.length} ×</button>` : ''}
        <span class="plw-sp"></span><input class="plw-q" data-plwq placeholder="Αναζήτηση: #αρ., πελάτης, όχημα, οδηγός" value="${esc(S.q)}">
        <span class="plw-seg"><button class="${S.all ? '' : 'on'}" data-plwall="0">Με ανταλλαγή ${nPE}</button><button class="${S.all ? 'on' : ''}" data-plwall="1">Όλες ${all.length}</button></span></div>
      <div class="plw-card"><div class="plw-head">${headL}<div class="plw-hasg">ΑΝΑΘΕΣΗ · ΔΡΟΜΟΛΟΓΙΟ · ΟΔΗΓΟΣ</div>${headR}</div>${body || '<div class="plw-empty">Καμία γραμμή</div>'}</div>
      ${S.data.rtCapped ? '<div class="plw-foot">⚠ τα δρομολόγια κόπηκαν στα 500: κάποιες γραμμές ίσως λείπουν</div>' : ''}${S.built.rtFailed ? '<div class="plw-foot">⚠ τα δρομολόγια δεν διαβάστηκαν: οι παραγγελίες φαίνονται χωρίς δρομολόγιο</div>' : ''}
      ${S.nums ? '' : '<div class="plw-foot">⚠ η αρίθμηση του Εβδομαδιαίου δεν υπολογίστηκε</div>'}${S.stopsFailed ? '<div class="plw-foot">⚠ οι στάσεις δεν διαβάστηκαν: το «λείπει καταγραφή» δεν μετρήθηκε</div>' : ''}`;
  }
  function draw() {
    const root = S.root; if (!root || !root.isConnected) return;
    if (S.loadErr) { root.innerHTML = `<div class="plv-fail"><b>Η εβδομάδα δεν φορτώθηκε</b> Δεν σημαίνει ότι δεν υπάρχουν κινήσεις. Αιτία: ${esc(S.loadErr)} <div style="margin-top:12px"><button class="plv-btn-ghost" data-plwgo="retry">Ξαναδοκίμασε</button></div></div>`; return; }
    if (!S.data || S.data.week !== S.week) { root.innerHTML = '<div class="plv-empty">Φόρτωση εβδομάδας…</div>'; return; }
    const t = weekStats(S.week);
    root.innerHTML = `${_PLW_STYLE}<div class="plw">${stripHtml()}${summaryHtml(t)}${changesHtml()}${tableHtml()}${othersHtml()}${statementHtml()}${driversHtml()}
      <div class="plw-foot">Π = πήραμε · Δ = δώσαμε · ◦ γκρι = εκκρεμής, δεν μετρά · 0 αχνό = γνωστό μηδέν · +◦N κάτω από τιμή = το εκκρεμές μέρος · −N κάτω από το Π = δεν γύρισαν N · ✓ = ανταλλαγή ολοκληρώθηκε · + στα υπόλοιπα = μας χρωστά · Τέλος εβδ. = όπως φαίνεται σήμερα</div>
      </div><div class="owv-docs hidden" id="plwDocs" role="dialog" aria-label="Έγγραφα ανάθεσης"></div>${panelHtml()}`;
    OC().whenDocs(() => { if (S.root && S.root.isConnected) draw(); });
    // Enter → the next pending of the week (design N27): the first pending cell in the order the week shows them.
    if (S._next) {
      S._next = null;
      const nx = root.querySelector('.plw-row [data-plwact^="conf:"]');
      if (nx) openEd(nx.getAttribute('data-plwact'));
    }
  }

  // ── the route diagram of the panel's order (owner 8/11 #5, core/route-diagram.js — one component for the
  // three week screens). Read when the panel opens, once per order per load: loadStops reads only the counting
  // fields, and only of delivered PE orders, so it cannot feed the diagram.
  // A VS order's national leg comes from the v5 boards of this week and its two neighbours (the leg can be planned
  // in the week before or after the order's week, as orders_week_view's v5Earlier knows). No board readable = null,
  // and the diagram then says «εκτελεστής: δεν διαβάστηκε» (never «χωρίς ανάθεση», principle 1).
  function weekBoards() {
    const week = S.week;
    if (!S.v5 || S.v5.week !== week) {
      const at = n => { const x = new Date(week + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
      const one = w => planFetch('GET', '/plan/board?week=' + w, { designed: ['no_route'] }).then(b => (b && b.week === w ? b : null)).catch(() => null);
      S.v5 = { week, p: Promise.all([at(-7), week, at(7)].map(one)).then(bs => bs.filter(Boolean)) };
    }
    return S.v5.p;
  }
  async function loadRoute(rec) {
    S.route.set(rec.id, { loading: true });
    const ids = (rec.fields || {})['ORDER STOPS'] || [], route = S.route;
    let st;
    try {
      const stops = ids.length ? await atGetAll(TABLES.ORDER_STOPS, { filterByFormula: `OR(${ids.map(id => `RECORD_ID()="${id}"`).join(',')})`,
        fields: [F.STOP_NUMBER, F.STOP_TYPE, F.STOP_LOCATION, F.STOP_DATETIME, F.STOP_PALLETS, 'Completed At'] }, false) : [];
      let natLeg = null, natLegNote = null;
      if ((rec.fields || {})['Veroia Switch']) {
        const bs = await weekBoards();
        natLeg = bs.length ? RouteDiagramAdapters.natLegFromBoard(bs, pgOf(rec)) : null;
        // all three boards read and the leg on none of them (before day L its leg lives in national_loads): not a
        // read failure. One board unread = the leg may be on it, so the red «δεν διαβάστηκε» stays.
        if (bs.length === 3 && !natLeg) natLegNote = 'εκτελεστής: εκτός Εβδομαδιαίου v5';
      }
      st = { stops, natLeg, natLegNote };
    } catch (e) { console.error('pallets week: route', e); st = { err: true }; }
    if (route !== S.route) return;   // a reload or another week started meanwhile
    route.set(rec.id, st);
    const l = S.panel && legByRef(S.panel);
    if (l && l.rec && l.rec.id === rec.id) draw();
  }
  function routeHtml(rec) {
    const st = S.route.get(rec.id);
    if (!st) { loadRoute(rec); return '<div class="plw-g">φόρτωση διαδρομής…</div>'; }
    if (st.loading) return '<div class="plw-g">φόρτωση διαδρομής…</div>';
    if (st.err) return '<div class="plw-red">Η διαδρομή δεν διαβάστηκε.</div>';
    // a shape the diagram refuses (InputError) costs the diagram only, never the panel or the page
    try {
      return RouteDiagram.render(RouteDiagramAdapters.facadeOrder(rec, st.stops, {
        today: RouteDiagramAdapters.athensDay(new Date().toISOString()), locMeta: id => OC()._locMeta(id), natLeg: st.natLeg, natLegNote: st.natLegNote }));
    } catch (e) { console.error('pallets week: route diagram', e); return '<div class="plw-red">Η διαδρομή δεν σχεδιάστηκε.</div>'; }
  }

  // ── the order panel (design N28): the order's movements with the same quick entry ──
  function panelHtml() {
    if (!S.panel) return '';
    const l = legByRef(S.panel); if (!l || !l.rec) return '';
    const rec = l.rec, mv = movesOf(rec), all = [...mv.L, ...mv.D].sort((a, b) => String(a.movement_date).localeCompare(String(b.movement_date)));
    const loc = id => { const x = ((PLV.lookups && PLV.lookups.locations) || []).find(y => y.id === id); return x ? x.name : ''; };
    const rowsH = all.map(m => {
      const editing = S.ed && S.ed.id === m.id && S.ed.ref === 'panel';
      const act = !canWrite() ? '' : m.status === 'pending' ? `<button class="plw-link" data-plwpanel="conf:${m.id}">Επιβεβαίωση</button>`
        : m.event_type === 'DELIVERY' && +m.given > +m.taken ? `<button class="plw-link" data-plwpanel="fix:${m.id}">Διόρθωση</button>` : '';
      return `<div class="plw-prow${editing ? ' plw-editing' : ''}"><span class="plw-g">${esc(OC().dm(m.movement_date))}</span> <span class="plw-tag">${m.event_type === 'LOADING' ? 'ΦΟΡΤΩΣΗ' : 'ΠΑΡΑΔΟΣΗ'}</span>
        <span>${esc(loc(m.location_id))}</span><span class="plw-sp"></span><span class="${m.status === 'pending' ? 'plw-pend' : ''}">${m.status === 'pending' ? 'εκκρεμής · ' : ''}πήραμε ${m.taken} · δώσαμε ${m.given}</span> ${act}
        ${editing ? edLine(S.ed) : ''}</div>`;
    }).join('') || '<div class="plw-g">καμία κίνηση</div>';
    const recEd = S.ed && S.ed.kind === 'rec' && S.ed.ref === S.panel ? edLine(S.ed) : '';
    const miss = ['L', 'D'].map(e => { const k = missingOf(rec, e, mv); return k && canWrite() ? `<button class="plw-link plw-red" data-plwpanel="rec:${e}">Καταχώρηση ${e === 'L' ? 'φόρτωσης' : 'παράδοσης'} (${k} ${k === 1 ? 'στάση' : 'στάσεις'})</button>` : ''; }).join(' ');
    const row = S.rows[+S.panel.split('.')[0]];
    const hasDoc = S.board && row && OWV().rowDocsOf(S.board, row).length;
    return `<div class="plw-panel" role="dialog" aria-label="Παλέτες παραγγελίας"><div class="plw-ph"><b>${esc(OC().numLabel(rec))} · ${esc(OWV().clientRaw(rec.fields) || '')}</b> ${OC().docClip(rec, 'intl')}<button class="plw-x" data-plwpanel="close" title="Κλείσιμο (Esc)">×</button></div>
      <div class="plw-pb"><div class="plw-ptitle">ΚΙΝΗΣΕΙΣ</div>${rowsH}${miss ? `<div class="plw-pmiss">${miss}</div>${recEd}` : ''}
      <div class="plw-ptitle">ΔΙΑΔΡΟΜΗ</div>${routeHtml(rec)}
      <div class="plw-ptitle">ΕΝΕΡΓΕΙΕΣ</div><div class="plw-pacts"><button class="plw-link" data-plwpanel="card">Καρτέλα παραγγελίας</button>${hasDoc ? ' · <button class="plw-link" data-plwpanel="doc">Έγγραφο ανάθεσης</button>' : ''}</div></div></div>`;
  }

  // ── events ───────────────────────────────────────────────
  function onClick(e) {
    if (e.target.closest('.od-badge')) return;
    const t = e.target.closest('[data-plwweek],[data-plwfilter],[data-plwall],[data-plwact],[data-plwgo],[data-plwck],[data-plwdoc],[data-plwreason],[data-plwpanel],[data-owvdocs],[data-plwleg],[data-plwed]');
    if (!t) return;
    const a = k => t.getAttribute(k);
    if (t.hasAttribute('data-plwed')) return;   // a click inside the editor line is the editor's
    if (t.hasAttribute('data-plwweek')) { S.week = a('data-plwweek'); S.ed = null; S.panel = null; S.filter = null; S.showChanges = false; return go(); }
    if (t.hasAttribute('data-plwfilter')) { const v = a('data-plwfilter') || null; S.filter = S.filter === v ? null : v; return draw(); }
    if (t.hasAttribute('data-plwall')) { S.all = a('data-plwall') === '1'; return draw(); }
    if (t.hasAttribute('data-plwreason')) { keepEd(); if (S.ed) S.ed.reason = a('data-plwreason'); return draw(); }
    if (t.hasAttribute('data-plwact')) { const v = a('data-plwact'); if (v.startsWith('panel:')) { S.panel = v.slice(6); S.ed = null; return draw(); } return openEd(v); }
    if (t.hasAttribute('data-plwgo')) {
      const g = a('data-plwgo');
      if (g === 'save') return saveEd();
      if (g === 'retry') return go(true);
      if (g === 'moves') { PLV.from = S.week; PLV.to = OC().addDays(S.week, 6); return plvTab('all'); }
      return;
    }
    if (t.hasAttribute('data-plwck')) {
      const k = a('data-plwck');
      if (k === 'mark') return check(false);
      if (k === 'again') return check(true);
      if (k === 'undo') return uncheck();
      if (k === 'changes') { S.showChanges = !S.showChanges; return draw(); }
      if (k === 'hide') { S.showChanges = false; return draw(); }
      return;
    }
    if (t.hasAttribute('data-plwdoc')) return openDocs(+a('data-plwdoc'));
    if (t.hasAttribute('data-owvdocs')) return closeDocs();
    if (t.hasAttribute('data-plwpanel')) {
      const v = a('data-plwpanel'), l = legByRef(S.panel);
      if (v === 'close') { S.panel = null; S.ed = null; return draw(); }
      if (v === 'card') return l && l.rec && typeof openIntlCardWith === 'function' ? openIntlCardWith(l.rec) : null;
      if (v === 'doc') return openDocs(+S.panel.split('.')[0]);
      const [kind, x] = v.split(':');
      if (kind === 'rec') { S.ed = { kind: 'rec', ref: S.panel, end: x, cell: `${S.panel}:${x}` }; draw(); return focusEd(); }
      S.ed = { kind, id: +x, ref: 'panel', cell: 'panel' }; draw(); return focusEd();
    }
    if (t.hasAttribute('data-plwleg')) { S.panel = a('data-plwleg'); S.ed = null; return draw(); }
  }
  function openDocs(ri) {
    const r = S.rows[ri], box = document.getElementById('plwDocs');
    if (!r || !box || !S.board) return;
    const docs = OWV().rowDocsOf(S.board, r); if (!docs.length) return;
    S.panel = null; S.ed = null; draw();
    const b2 = document.getElementById('plwDocs');
    b2.innerHTML = OWV().docsInner(r, docs); b2.classList.remove('hidden');
  }
  function closeDocs() { const b = document.getElementById('plwDocs'); if (b && !b.classList.contains('hidden')) { b.classList.add('hidden'); b.innerHTML = ''; return true; } return false; }
  function onKey(e) {
    if (!S.root || !S.root.isConnected) return;
    if (e.key === 'Escape') {
      if (closeDocs() || closeEd() || (S.panel && (S.panel = null, draw(), true))) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    const tg = e.target;
    if (e.key === 'Enter' && tg.closest && tg.closest('[data-plwed]') && !(tg.matches && tg.matches('button'))) { e.preventDefault(); return saveEd(); }
    if (e.key === 'Enter' && tg.matches && tg.matches('[data-plwact],[data-plwdoc]')) { e.preventDefault(); return tg.click(); }
    if (e.key === '/' && !(tg.matches && tg.matches('input,textarea,select'))) { const q = S.root.querySelector('[data-plwq]'); if (q) { e.preventDefault(); q.focus(); } }
  }
  function onInput(e) {
    if (e.target.matches('[data-plwq]')) {
      S.q = e.target.value; clearTimeout(S._qt);
      S._qt = setTimeout(() => { const pos = e.target.selectionStart; draw(); const q = S.root && S.root.querySelector('[data-plwq]'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 250);
    }
    if (e.target.matches('[data-plwin="file"]') && S.ed && e.type === 'change') { keepEd(); S.ed.file = e.target.files[0] || null; S.ed.fileName = S.ed.file ? S.ed.file.name : ''; draw(); focusEd(); }
  }

  let wired = false;
  async function go(force) {
    S.data = force ? null : S.data;
    draw();
    const want = S.week;
    try { await load(force); } catch (e) { console.error('pallets week: load', e); if (want === S.week) S.loadErr = _plvErrMsg(e); }
    if (want === S.week) draw();
  }
  async function render(root) {
    S.root = root;
    if (!S.week) S.week = OC().weekStartOfYmd(OC().ymd(new Date().toISOString()));
    if (!wired) { wired = true; document.addEventListener('keydown', onKey, true); }
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    if (S.data && S.data.week === S.week) { draw(); return; }
    return go();
  }
  return { render, _test: { endStat, moveWeek, weekStats, missingOf, S } };
})();

// Tokens of the Weekly (DESIGN.md Β); the day band and the trip divider are the shared classes, not restyled here.
const _PLW_STYLE = `<style>
.plw{font-variant-numeric:tabular-nums;color:var(--wi4-ink);font-size:12.5px}
.plw-strip{display:flex;align-items:stretch;gap:6px;border:1px solid var(--wi4-line-2);border-radius:6px;padding:6px;background:#fff}
.plw-wk{flex:1;text-align:left;border:1px solid transparent;border-radius:4px;background:none;padding:4px 10px;cursor:pointer;display:flex;flex-direction:column;gap:2px;min-width:0;font:inherit;color:inherit}
.plw-wk.on{border-color:var(--accent,#0284C7)}.plw-wl1{font-weight:600;font-size:13px;white-space:nowrap}.plw-wl2{font-size:11px;color:var(--wi4-grey-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.plw-nav{border:1px solid var(--wi4-line-2);background:none;border-radius:4px;width:28px;cursor:pointer}
.plw-sum{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0;padding-bottom:10px;border-bottom:1px solid var(--wi4-line-2)}
.plw-g{color:var(--wi4-grey-2)}.plw-sp{flex:1}.plw-red{color:var(--danger,#B91C1C)}.plw-amber{color:#B45309}.plw-ok{color:#15803D;font-weight:600}
.plw-miss{color:var(--danger,#B91C1C);font-weight:500}.plw-pend{color:var(--wi4-grey-3,#98a2b3)}.plw-zero{color:var(--wi4-grey-3,#98a2b3)}.plw-short{color:var(--wi4-grey-1,#344054);font-weight:500}
.plw-link{background:none;border:0;padding:0;cursor:pointer;color:var(--accent-dark,#0369A1);font:inherit}.plw-link.on{text-decoration:underline}.plw-link.plw-red{color:var(--danger,#B91C1C)}.plw-link.plw-amber{color:#B45309}
.plw-sep{width:1px;height:20px;background:var(--wi4-line-2)}
.plw-check{display:inline-flex;align-items:center;gap:6px;background:none;border:0;cursor:pointer;font:inherit;color:inherit;padding:0}
.plw-box{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1.5px solid var(--wi4-grey-3,#98a2b3);border-radius:3px;font-size:10px;color:#fff;box-sizing:border-box}
.plw-check.on .plw-box{background:#15803D;border-color:#15803D}
.plw-tools{display:flex;align-items:center;gap:10px;margin:10px 0}.plw-q{width:280px;padding:5px 8px;border:1px solid var(--wi4-line-2);border-radius:4px;font:inherit}
.plw-seg{display:inline-flex;background:var(--bg-row-alt,#F8FAFC);border-radius:4px;padding:3px}.plw-seg button{border:0;background:none;padding:3px 10px;cursor:pointer;font:inherit;color:var(--wi4-grey-2)}.plw-seg button.on{background:#fff;color:var(--wi4-ink);border-radius:3px;font-weight:500}
.plw-chip{border:1px solid var(--wi4-line-2);background:#fff;border-radius:12px;padding:2px 10px;cursor:pointer;font:inherit}
.plw-card{border:1px solid var(--wi4-line-2);border-radius:6px;background:#fff}
.plw-head{display:grid;grid-template-columns:minmax(0,1fr) 150px minmax(0,1fr);position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid var(--wi4-line-2);font-size:10.5px;font-weight:500;color:var(--wi4-grey-2);letter-spacing:.02em}
.plw-hl,.plw-leg{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr) 16px 168px;column-gap:12px;align-items:start}
.plw-hl.plw-r,.plw-r .plw-leg{grid-template-columns:168px 16px minmax(0,1.1fr) minmax(0,1fr)}
.plw-hl{padding:8px 10px}.plw-hasg{padding:8px 10px;border-left:1px solid var(--wi4-line-3);border-right:1px solid var(--wi4-line-3)}
.plw-hends{display:grid;grid-template-columns:80px 80px;column-gap:8px}.plw-hend{display:flex;flex-direction:column;align-items:center}
.plw-row{display:grid;grid-template-columns:minmax(0,1fr) 150px minmax(0,1fr)}
.plw-side{display:flex;flex-direction:column;min-width:0}
.plw-leg{padding:8px 10px;min-height:36px;box-sizing:border-box;cursor:pointer}.plw-leg:hover{background:var(--wi4-hover,#F1F5F9)}
.plw-leg.plw-leg-no{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr) 196px;cursor:default}.plw-r .plw-leg.plw-leg-no{grid-template-columns:196px minmax(0,1.1fr) minmax(0,1fr)}
.plw-leg.plw-leg-no:hover{background:none}.plw-leg.plw-off{opacity:.55}.plw-leg.plw-editing{background:#F0F9FF}
.plw-c{min-width:0}.plw-l1{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:16px}.plw-l2{font-size:11px;color:var(--wi4-grey-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:15px}
.plw-no{display:inline-block;min-width:22px;color:var(--wi4-grey-2);font-size:11px}
.plw-ar{color:var(--wi4-grey-3,#98a2b3)}.plw-pe{border:1px solid var(--wi4-line-2);border-radius:3px;padding:0 3px;font-size:10px;color:var(--wi4-grey-1,#344054)}
.plw-nope{color:var(--wi4-grey-2);font-size:11.5px}
.plw-tick{padding-top:1px;text-align:center}.plw-tick .plw-ok{font-size:13px}
.plw-ends{display:grid;grid-template-columns:80px 80px;column-gap:8px}
.plw-end{border-radius:3px}.plw-end.plw-act{cursor:pointer}.plw-end.plw-act:hover,.plw-end.plw-on{outline:1px solid var(--accent,#0284C7)}
.plw-pd{display:grid;grid-template-columns:36px 36px;column-gap:8px}.plw-v{text-align:right;line-height:16px;min-height:16px}.plw-u{display:block;text-align:right;font-size:10.5px;line-height:13px}
.plw-asg{padding:8px 10px;border-left:1px solid var(--wi4-line-3);border-right:1px solid var(--wi4-line-3);min-width:0}.plw-asg.plw-act{cursor:pointer}.plw-asg.plw-act:hover .plw-plate{text-decoration:underline}
.plw-plate{font-family:'DM Mono',monospace;font-size:12px}.plw-doc{color:var(--accent-dark,#0369A1)}
.plw-ed{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px;font-size:12px;cursor:default}
.plw-in{width:52px;padding:3px 6px;border:1.5px solid var(--accent,#0284C7);border-radius:3px;font:inherit;text-align:right}.plw-note{width:180px;text-align:left}
.plw-btn{background:var(--wi4-ink,#0B1929);color:#fff;border:0;border-radius:4px;padding:4px 10px;cursor:pointer;font:inherit}.plw-btn.plw-ghost{background:#fff;color:var(--accent-dark,#0369A1);border:1px solid var(--accent,#0284C7)}
.plw-hint{color:var(--wi4-grey-2);font-size:11px}.plw-sheet{color:var(--accent-dark,#0369A1);cursor:pointer}
.plw-reason{background:none;border:0;padding:0 4px;cursor:pointer;font:inherit;color:var(--wi4-grey-2)}.plw-reason.on{color:var(--wi4-ink);font-weight:500}
.plw-err{flex-basis:100%;color:var(--danger,#B91C1C);font-weight:500}
.plw-sec{margin-top:22px}.plw-sech{display:flex;align-items:center;gap:8px;margin-bottom:8px}.plw-sech b{font-size:14px}
.plw-tbl{width:100%;border-collapse:collapse}.plw-tbl th{font-size:10.5px;font-weight:500;color:var(--wi4-grey-2);text-align:left;padding:6px 8px;border-bottom:1px solid var(--wi4-line-2);position:sticky;top:0;background:var(--bg,#F4F6F9)}
.plw-tbl td{padding:7px 8px;border-bottom:1px solid var(--wi4-line-3)}.plw-num th:not(:first-child),.plw-num td:not(:first-child){text-align:right}
.plw-tbl tfoot td{font-weight:600;border-top:3px double var(--wi4-line-2);border-bottom:0}
.plw-other{margin-top:6px}.plw-foot{margin-top:10px;font-size:11px;color:var(--wi4-grey-2)}
.plw-x{background:none;border:0;font-size:18px;cursor:pointer;color:var(--wi4-grey-2)}
.plw-panel{position:fixed;top:0;right:0;bottom:0;width:480px;background:#fff;box-shadow:-8px 0 24px rgba(11,25,41,.12);z-index:50;display:flex;flex-direction:column}
.plw-ph{display:flex;align-items:center;gap:8px;padding:18px 22px;background:var(--wi4-ink,#0B1929);color:#fff}.plw-ph .plw-x{color:#fff;margin-left:auto}
.plw-pb{padding:14px 22px;overflow:auto}.plw-ptitle{font-size:10.5px;letter-spacing:.08em;color:var(--wi4-grey-2);margin:14px 0 8px}
.plw-prow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--wi4-line-3)}.plw-prow.plw-editing{background:#F0F9FF}
.plw-tag{font-size:9.5px;letter-spacing:.06em;border:1px solid var(--wi4-line-2);border-radius:3px;padding:0 4px;color:var(--wi4-grey-1,#344054)}
.plw-pmiss{margin-top:8px}.plw-empty{padding:20px;color:var(--wi4-grey-2)}
</style>`;

if (typeof window !== 'undefined') window.PalletsWeek = PalletsWeek;
