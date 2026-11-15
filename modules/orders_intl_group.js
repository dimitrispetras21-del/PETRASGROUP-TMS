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
// The note sign of the design (owner 14/11): a small «!», its words only when pointed at.
const note = (msg) => `<i class="igx-note" data-t="${esc(msg)}" aria-label="${esc(msg)}">!</i>`;
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

// (t, i) → { num, seq } for submitIntlOrder: the point's number inside its order = its rank among the order's own
// points in the panel; in a groupage also its place in the load (113 «Load Seq»). A single load writes no Load Seq.
function stopPosFor(m) {
  const s = IG.s;
  return (t, i) => {
    const list = t === 'l' ? s.lo : s.dl, pk = `${m.key}:${t}:${i}`;
    const at = list.indexOf(pk);
    if (at < 0) return null;
    const own = list.filter(x => x.startsWith(`${m.key}:${t}:`));
    return { num: own.indexOf(pk) + 1, seq: s.mode === 'group' ? at + 1 : null };
  };
}

// ── Shell ─────────────────────────────────────────────────────────────────────
// The look of the redesign (owner 15/11: «ακριβώς το σχέδιο»): docs/design/redesign-2026-11/index.html, screens s3 / #f6
// — Manrope, ink #000010, accent #0B63CE, sheet #F5F6F7 with white cards. Scoped to this form (#modal.modal--igx): the
// other screens keep the current look until the redesign reaches them. The form of 8/11 inside keeps its markup and
// ids (its save reads them); it is dressed here by CSS and by a few moves of its own nodes (dress()).
function ensureStyles() {
  if (!document.getElementById('igxFont')) {
    const l = document.createElement('link');
    l.id = 'igxFont'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }
  if (document.getElementById('igxStyles')) return;
  const st = document.createElement('style');
  st.id = 'igxStyles';
  st.textContent = `
  #modal.modal--igx{--ink:#000010;--body:#333340;--help:#666873;--ph:#7C7E88;--line:#E9EAEB;--bg:#F5F6F7;--accent:#0B63CE;--link:#0A54B0;--accent-bg:#E6F0FC;--amber:#A8520A;--amber-line:#E8B45A;--red:#C92A31;--ctl:#D9DBE0;
    width:1240px;max-width:96vw;max-height:94vh;padding:0;border:0;border-radius:24px;background:var(--bg);box-shadow:0 24px 60px -24px rgba(10,18,32,.32),0 0 0 1px rgba(10,18,32,.06);
    font:400 14px/1.4 'Manrope',system-ui,sans-serif;color:var(--body);-webkit-font-smoothing:antialiased}
  #modal.modal--igx .modal-header,#modal.modal--igx .modal-footer{display:none}
  #modal.modal--igx .modal-body{padding:0}
  .igx .num{font-variant-numeric:tabular-nums}
  .igx-top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:10px;height:76px;padding:0 28px;background:#fff;border-bottom:1px solid var(--line)}
  .igx-top h1{margin:0 8px 0 0;font:400 24px/1.15 'Manrope',sans-serif;letter-spacing:-.6px;color:var(--ink);white-space:nowrap}
  .igx-top .sp{flex:1}
  .igx-seg{display:inline-flex;background:#E6E8EC;border-radius:999px;padding:3px}
  .igx-seg button{height:34px;padding:0 16px;border:0;border-radius:999px;background:none;font:500 14px 'Manrope',sans-serif;color:var(--help);white-space:nowrap;cursor:pointer}
  .igx-seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
  .igx-seg button:disabled{opacity:.45;cursor:not-allowed}
  .igx-pill{height:40px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:#fff;font:500 14px 'Manrope',sans-serif;color:var(--body);display:inline-flex;align-items:center;gap:8px;white-space:nowrap;cursor:pointer}
  .igx-pill:hover{border-color:#CFD2D8}
  .igx-pill.b{width:100%;justify-content:center;background:var(--ink);border-color:var(--ink);color:#fff}
  .igx-pill.b:hover{background:#24242F}
  .igx-pill.b:disabled{background:#E6E8EC;border-color:#E6E8EC;color:var(--ph);cursor:default}
  .igx-cl{width:40px;height:40px;border:0;border-radius:50%;background:var(--bg);display:grid;place-items:center;color:var(--body);cursor:pointer;flex:none}
  .igx svg.ic{width:16px;height:16px;flex:none;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .igx-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;padding:18px 24px 24px;align-items:start}
  @media (max-width:980px){.igx-grid{grid-template-columns:1fr}}
  .igx-card{background:#fff;border-radius:16px}
  .igx-main{padding:20px 24px}
  .igx-h{display:flex;align-items:baseline;gap:10px;margin:0 0 14px;font:600 16px 'Manrope',sans-serif;color:var(--ink)}
  .igx-h small{font-weight:500;font-size:14px;color:var(--help)}
  .igx-m{margin-bottom:8px}
  .igx.group .igx-m.open{border-radius:16px;box-shadow:inset 0 0 0 1.5px var(--accent);padding:0 14px 14px}
  .igx-mh{display:none;grid-template-columns:22px minmax(0,1.15fr) minmax(0,1.3fr) 70px 56px 86px 18px 18px;gap:0 12px;align-items:center;height:48px;border-radius:14px;background:var(--bg);padding:0 12px;cursor:pointer}
  .igx.group .igx-mh{display:grid}
  .igx.group .igx-m.open>.igx-mh{background:none;padding:0;height:52px}
  .igx-mh b{font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .igx-mh>span{color:var(--body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13.5px}
  .igx-mh .n{text-align:right}
  .igx-mh .np{color:var(--red);font-weight:600;font-size:13px}
  .igx-mh .ap{font-size:10px;font-weight:700;border-radius:4px;padding:1px 5px;background:var(--accent-bg);color:var(--link);margin-left:6px}
  .igx-mh button{border:0;background:none;padding:0;display:flex;color:var(--help);cursor:pointer}
  .igx-mh button:hover{color:var(--red)}
  .igx-mh svg.ic{width:15px;height:15px;color:var(--help)}
  .igx-onum{width:22px;height:22px;border-radius:7px;background:var(--ink);color:#fff;font-size:12px;font-weight:600;display:grid;place-items:center;font-style:normal;flex:none}
  .igx-add{display:none;gap:18px;flex-wrap:wrap;margin-top:6px}
  .igx.group .igx-add{display:flex}
  .igx-lnk{display:inline-flex;align-items:center;gap:8px;height:32px;border:0;background:none;padding:0;font:500 14px 'Manrope',sans-serif;color:var(--link);cursor:pointer}
  .igx-lnk:disabled{color:var(--help);cursor:not-allowed}
  .igx-side{padding:20px 22px;position:sticky;top:94px}
  .igx-lbl{margin:0;font-size:11px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:var(--help)}
  .igx-ol{margin:6px 0 16px}
  .igx-pt{display:grid;grid-template-columns:14px 22px minmax(0,1fr) 30px;gap:0 9px;align-items:center;height:46px;border-top:1px solid var(--line);background:#fff;cursor:grab;user-select:none}
  .igx-pt:first-child{border-top:0}
  .igx-pt svg.ic{width:14px;height:14px;color:#A9ABB3}
  .igx-pt .igx-onum{background:var(--bg);color:var(--ink)}
  .igx-pt b{display:block;font-weight:600;color:var(--ink);font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .igx-pt b i{font-style:normal;font-weight:400;color:var(--help)}
  .igx-pt small{display:block;color:var(--help);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .igx-pt>.num{text-align:right;font-weight:500;color:var(--ink);font-size:13.5px}
  .igx-pt.drag{opacity:.45}
  .igx-pt.over{box-shadow:inset 0 2px 0 var(--accent)}
  .igx-empty{font-size:12px;color:var(--help);padding:6px 0}
  .igx-sum{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0 0 16px}
  .igx-sum dt{color:var(--help)}
  .igx-sum dd{margin:0;text-align:right;color:var(--ink);font-weight:500;display:flex;gap:8px;justify-content:flex-end;align-items:center}
  .igx-sum .warn{color:var(--red)}
  .igx-extra{display:flex;justify-content:center;gap:14px;margin-top:8px;font-size:12px;color:var(--help)}
  .igx-extra button{border:0;background:none;padding:0;font:inherit;color:var(--link);cursor:pointer}
  .igx-note{position:relative;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#fff;border:1.5px solid var(--amber);color:var(--amber);font-size:11px;font-weight:700;line-height:1;cursor:help;flex:none;font-style:normal;margin-left:4px}
  .igx-note::after{content:attr(data-t);position:absolute;bottom:calc(100% + 8px);right:-10px;background:var(--ink);color:#fff;font-weight:500;font-size:12.5px;line-height:1.4;padding:8px 11px;border-radius:10px;width:max-content;max-width:250px;white-space:normal;text-align:left;opacity:0;transform:translateY(4px);pointer-events:none;transition:opacity 120ms,transform 120ms;z-index:30}
  .igx-note:hover::after{opacity:1;transform:none;transition-delay:.18s}
  .igx-pick{border:1px solid var(--line);border-radius:14px;padding:10px;margin-top:8px;background:#fff;max-height:340px;overflow:auto}
  .igx-pick input[type=search]{width:100%;margin-bottom:8px}
  .igx-pick .row{display:flex;gap:8px;align-items:center;padding:8px 6px;border-bottom:1px solid var(--line);font-size:13.5px;cursor:pointer}
  .igx-pick .row:hover{background:var(--bg)}
  .igx-pick .row.dim{color:var(--help)}
  .igx-pick .row .x{flex:1}
  .igx-pick .row input[type=number]{width:70px}
  .igx-busy{font-size:12px;color:var(--help);padding:4px 0}
  /* the form of one order (orders_intl.js), dressed as the design */
  .igx .oi2{gap:14px;font:400 14px/1.4 'Manrope',sans-serif;color:var(--body)}
  .igx .oi2-sec,.igx .oi2-dirrow,.igx .oi2-sum,.igx .oi-lot-ck{display:none}
  .igx .oi2-f{gap:6px;font-size:12px;color:var(--body)}
  .igx .oi2-f>span:first-child,.igx .oi2 .oi-temp-head{display:flex;align-items:center;gap:6px;height:17px;font:600 12px 'Manrope',sans-serif;color:var(--body)}
  .igx .oi2 .form-input{height:40px;padding:0 12px;border:1px solid var(--ctl);border-radius:10px;background:#fff;font:400 14px 'Manrope',sans-serif;color:var(--ink)}
  .igx .oi2 .form-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-bg);outline:none}
  .igx .oi2 .oi2-num{text-align:left}
  .igx .oi2 textarea.oi2-ta{min-height:40px;padding:10px 12px}
  .igx .oi2-r3,.igx .oi2-cargo{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px;align-items:start}
  .igx .oi2-r3>*{grid-column:span 4}
  .igx .oi2-cargo>*:nth-child(1){grid-column:span 3;order:1}
  .igx .oi2-cargo>*:nth-child(3){grid-column:span 3;order:2}
  .igx .oi2-cargo>*:nth-child(4){grid-column:span 4;order:3}
  .igx .oi2-cargo>*:nth-child(2){grid-column:span 2;order:4}
  .igx .oi2-cargo>*:nth-child(5){grid-column:span 4;order:5}
  .igx .oi2-cargo>*:nth-child(6){grid-column:span 4;order:6}
  .igx .oi2-cargo>.igx-dlv{grid-column:span 4;order:7}
  .igx .oi2-seg{height:auto;padding:3px;gap:0;border-radius:999px;background:var(--bg)}
  .igx .oi2-seg button,.igx .oi2-seg label{height:34px;padding:0 16px;border-radius:999px;font:500 14px 'Manrope',sans-serif;color:var(--help)}
  .igx #f_ReeferModeSeg button{padding:0 12px}
  .igx .oi2-seg button.on,.igx .oi2-seg label.on{background:#fff;color:var(--ink);font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.08)}
  .igx .oi2-seg button:disabled{opacity:.45;cursor:not-allowed}
  .igx .oi2-pts{gap:8px}
  .igx .oi2-rows{gap:8px}
  .igx .oi2-th,.igx .oi2-stop,.igx #oi2sec_l .oi2-th,.igx #oi2sec_l .oi2-stop{grid-template-columns:34px minmax(0,1fr) 104px 100px 46px 108px 50px 46px 22px;gap:0 10px}
  .igx .oi2-th{padding:0 12px 0;font-size:11px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:var(--help)}
  .igx .oi2-th>span:first-child{grid-column:1 / span 2;text-transform:none;letter-spacing:0;font-size:13px;font-weight:600;color:var(--ink)}
  .igx .oi2-stop{position:relative;background:var(--bg);border-radius:14px;padding:8px 12px}
  .igx .oi2-stop .form-input,.igx .oi2-stop .oi2-hrs-all{height:38px;border-color:transparent;background:#fff}
  .igx .oi2-stop .form-input:hover,.igx .oi2-stop .oi2-hrs-all:hover{border-color:var(--ctl)}
  .igx .oi2-stop .oi2-hrs-all{border-radius:10px;font:400 14px 'Manrope',sans-serif;color:var(--ph)}
  .igx .oi2-stop .oi2-hrs-all .oi2-link{display:none}
  .igx .igx-gr{grid-column:1;display:flex;align-items:center;justify-content:flex-end;gap:2px;color:var(--help);font-weight:600;cursor:grab}
  .igx .igx-gr svg.ic{width:13px;height:13px;color:#A9ABB3}
  .igx .oi2-stop>.oi2-c-loc,.igx .oi2-th>span:first-child{grid-column:2}
  .igx .oi2-th>span:first-child{grid-column:1 / span 2}
  .igx .oi2-stop>[id^="dt_"],.igx .oi2-th>.c-dt{grid-column:3}
  .igx .oi2-stop>.oi2-hrs,.igx .oi2-th>.c-hrs{grid-column:4}
  .igx .oi2-stop>[id^="pal_"],.igx .oi2-th>.c-pal{grid-column:5}
  .igx .oi2-stop>[id^="ref_"],.igx .oi2-th>.c-ref{grid-column:6}
  .igx .oi2-stop>.oi2-c-ex,.igx .oi2-th>.oi2-c-ex{grid-column:7;text-align:center}
  .igx .oi2-stop>.oi2-c-vs,.igx .oi2-th>.oi2-c-vs{grid-column:8;text-align:center}
  .igx .oi2-stop>.oi2-rm,.igx .oi2-stop>span:empty,.igx .oi2-th>span:last-child{grid-column:9}
  .igx .oi2-stop,.igx .oi2-th{grid-auto-flow:dense}
  .igx .oi2-c-ex input[type=checkbox],.igx .oi2-c-vs input[type=checkbox],.igx .oi2-vshead input{width:18px;height:18px;accent-color:var(--accent)}
  .igx .oi2-vshead{font-size:0;gap:0}
  .igx .oi2-vshead::after{content:'Βέροια';font-size:11px}
  .igx .oi2-vshead input{display:none}
  .igx .oi2-c-ex{visibility:hidden}
  .igx .oi2.ex-col .oi2-c-ex,.igx .oi2.igx-ex .oi2-c-ex{visibility:visible}
  .igx .oi2 .oi2-exn,.igx .oi2.ex-fix #oi2sec_l .oi2-exn{display:none}
  .igx .oi2.ex-fix #oi2sec_l .oi2-c-ex input[type=checkbox]{display:inline-block}
  .igx .oi2-rm{color:var(--help);font-size:15px}
  .igx .oi2-stop input[type=date]{padding:0 8px;font-size:13.5px;cursor:pointer}
  .igx .oi2-stop input[type=date]::-webkit-calendar-picker-indicator{display:none}
  .igx .oi2-stop .oi2-hrs-all,.igx .oi2-stop .oi2-hm{padding:0 8px}
  .igx .oi2-cargo>.oi2-f:nth-child(3){position:relative}
  .igx .oi2 .oi-temp-head .oi-cmr-tick{position:absolute;right:12px;bottom:11px;display:inline-flex;align-items:center;gap:5px;font:500 12px 'Manrope',sans-serif;color:var(--body);z-index:1}
  .igx .oi2 .oi-cmr-tick input{width:16px;height:16px;accent-color:var(--accent)}
  .igx .oi2 #f_Price.igx-miss{border-color:var(--amber-line);background:#FFFBF2}
  .igx .igx-tools{display:flex;gap:10px;align-items:center;margin-top:2px}
  .igx .igx-tools .sp{flex:1}
  .igx .igx-tools .oi2-add{display:inline-flex;align-items:center;gap:8px;height:32px;font:500 14px 'Manrope',sans-serif;color:var(--link)}
  .igx .igx-tools .oi2-ck{font:500 13px 'Manrope',sans-serif;color:var(--body);height:32px}
  .igx .igx-tools .oi2-ck input{width:18px;height:18px;accent-color:var(--accent)}
  .igx .igx-tools .oi2-docs .od-form-pick{font:500 14px 'Manrope',sans-serif;color:var(--body)}
  .igx .igx-tools .oi2-docs .od-form-hint{display:none}
  .igx .oi2-notes{display:block}
  .igx .oi-req-bad{border-color:var(--amber-line)!important;background:#FFFBF2!important}
  .igx .oi-req-msg{display:none}
  `;
  document.head.appendChild(st);
}

// Lucide-style line icons (the design's set), inline: the app loads no icon font.
const IC = {
  grip: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  down: '<path d="m6 9 6 6 6-6"/>', up: '<path d="m18 15-6-6-6 6"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 12v6"/><path d="m15 15-3-3-3 3"/>',
  list: '<path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="M18 9v6"/><path d="M21 12h-6"/>',
  pkg: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  link: '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
};
const ic = k => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;

function segHtml(id, opts, value) {
  const fn = id === 'igxMode' ? 'setMode' : 'setDir';
  return `<span class="igx-seg" id="${id}">${opts.map(([v, l, dis, why]) =>
    `<button type="button" data-v="${esc(v)}" class="${value === v ? 'on' : ''}"${dis ? ` disabled title="${esc(why || '')}"` : ''} onclick="IntlGroup.${fn}('${v}')">${esc(l)}</button>`).join('')}</span>`;
}

function isPieceRec(f) { return typeof OrdersStock !== 'undefined' && !!f && OrdersStock.isPiece(f); }
// The design has no footer: the save sits under the side panel. What the footer of 8/11 also offered stays, small,
// under it (duplicate an order, skip a scan of the queue).
function extrasHtml(recId, f, scanQueue) {
  const x = [];
  if (recId && !isPieceRec(f)) x.push(`<button type="button" title="Νέα παραγγελία με ίδια στοιχεία — αλλάζεις μόνο ημερομηνίες" onclick="duplicateIntlOrder('${esc(recId)}')">Διπλασιασμός</button>`);
  if (scanQueue) x.push(`<button type="button" title="Προσπέρασε αυτό το σκαν χωρίς αποθήκευση" onclick="closeModal();_scanQueueNext()">Παράλειψη → (${window._scanQueue.length} ακόμη)</button>`);
  return x.length ? `<div class="igx-extra">${x.join('<span>·</span>')}</div>` : '';
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
  const s0 = IG.s = { mode: 'single', dir: f['Direction'] || (piece ? 'Import' : ''), members: [], open: null, lo: [], dl: [],
    base: gid ? gid.split('|')[0] : '', key: 0, saving: false, assign: null, isNew, removed: [] };
  const title = piece ? 'Κομμάτι από απόθεμα'
    : isNew ? 'Νέα διεθνής παραγγελία'
    : (typeof isPreorder === 'function' && isPreorder(f)) ? 'Μετατροπή pre-order σε παραγγελία'
    : gid ? 'Groupage' : (f['Order No'] ? 'Παραγγελία #' + f['Order No'] : 'Επεξεργασία παραγγελίας');
  const scanQueue = !!(isNew && !piece && window._scanQueue && window._scanQueue.length);
  s0.title = title;
  const body = `<div class="igx" id="igx">
    <div class="igx-top" id="igxTop"></div>
    <div class="igx-grid">
      <div class="igx-card igx-main">
        <div class="igx-h" id="igxHead"></div>
        <div id="igxList" oninput="IntlGroup.changed()" onchange="IntlGroup.changed()" onfocusout="IntlGroup.changed()"></div>
        <div class="igx-add" id="igxAdd"></div>
        <div id="igxPick"></div>
      </div>
      <aside class="igx-card igx-side">
        <p class="igx-lbl">Σειρά φόρτωσης</p><div class="igx-ol" id="igxLo"></div>
        <p class="igx-lbl">Σειρά παράδοσης</p><div class="igx-ol" id="igxDl"></div>
        <dl class="igx-sum num" id="igxSum"></dl>
        <button type="button" class="igx-pill b" id="btnSubmit" onclick="IntlGroup.save()">Αποθήκευση</button>
        ${extrasHtml(recId, f, scanQueue)}
      </aside>
    </div>
    <div id="scanStatus" hidden></div>
  </div>`;
  const modal = document.getElementById('modal');
  modal.style.maxWidth = '';
  openModal(title, body, '');
  modal.classList.add('modal--igx');
  watchClose();
  // Ctrl + Enter saves, as the design says under the button
  document.getElementById('igx')?.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } });
  const s = IG.s;
  if (recId && gid) {
    // A member of a groupage opens the whole load (owner 15/11). Members = the identical Group ID text (the board
    // collapses by it and the form writes it so); an old group with another text on some members is opened by what
    // matches — never joined by guess.
    s.mode = 'group';
    let recs = [];
    try { recs = await atGetAll(TABLES.ORDERS, { filterByFormula: `{Group ID}='${gid.replace(/'/g, "\\'")}'` }, false) || []; }
    catch (e) { showErrorToast('Δεν διαβάστηκαν οι παραγγελίες του groupage — ανοίγει μόνο αυτή', 'warn', 12000); }
    if (!recs.some(r => r.id === recId)) recs.unshift({ id: recId, fields: f });
    const list = (gid.split('|')[1] || '').split(',').filter(Boolean);
    const pos = id => { const k = list.indexOf(id); return k < 0 ? 99 : k; };
    recs.sort((a, b) => pos(a.id) - pos(b.id) || String((a.fields || {})['Loading DateTime'] || '').localeCompare(String((b.fields || {})['Loading DateTime'] || '')));
    s.assign = assignmentOf(recs);
    for (const r of recs) await addMember({ recId: r.id, f: r.fields || {}, orig: true }, { quiet: true });
    await initialOrder();
    expand(s.members.find(m => m.recId === recId) || s.members[0]);
  } else {
    await addMember({ recId: recId || null, f, label, prefill, piece, orig: !!recId }, { quiet: true });
    recomputeAssign();
    syncOrder();
  }
  // the form of one order sets its own width class (960px, orders_intl.js); the shell is wider
  modal.classList.remove('modal--oi2');
  paint();
}

// The load's vehicle (owner 15/11, decision 5): an order added to a load that already has a truck / partner takes the
// same truck, driver, matched import and status at once. Read from the members as stored; members that disagree
// give no source (a sign is shown, nothing is copied). The partner fee is NOT copied: one fee per truck (decision 4).
const ASSIGN_LABELS = ['Truck', 'Trailer', 'Driver', 'Partner', 'Is Partner Trip', 'Partner Truck Plates', 'Status', 'Matched Import ID'];
function assignmentOf(recs) {
  const lid = v => (typeof getLinkedId === 'function' ? getLinkedId(v) : (Array.isArray(v) ? v[0] : v)) || '';
  const withVeh = recs.filter(r => lid((r.fields || {})['Truck']) || lid((r.fields || {})['Partner']));
  if (!withVeh.length) return null;
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
  const same = (getLinkedId(f['Truck']) || '') === a.truck && (getLinkedId(f['Partner']) || '') === a.partner;
  return same ? null : a.fields;
}

// The panel's first order for a load saved before 113 (or by the old Weekly): what each point holds as «Load Seq»
// when every point has one; otherwise the old rule — the Group ID order list (export: deliveries, import: loadings),
// then the stop number; the other side by day, then the order list (impact check G, «empty = the old rule»).
async function initialOrder() {
  const s = IG.s;
  const seqBySid = {};
  await Promise.all(s.members.filter(m => m.recId).map(async m => {
    try { (await stopsLoad(m.recId, F.STOP_PARENT_ORDER)).forEach(st => { seqBySid[st.id] = st.fields[F.STOP_LOAD_SEQ]; }); }
    catch (e) { console.warn('igx: stops of', m.recId, e); }
  }));
  const pts = allPoints();
  const rankM = m => s.members.indexOf(m);
  for (const t of ['l', 'u']) {
    const mine = pts.filter(p => p.t === t);
    const allSeq = mine.length && mine.every(p => p.sid && seqBySid[p.sid] != null && seqBySid[p.sid] !== '');
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
  dress(m);
  wireRowDrag(m);
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
    ? `<button type="button" class="igx-pill" onclick="IntlGroup.fromFile()">${ic('scan')}Σάρωση εντολής πελάτη</button>`
    : (s.isNew && !piece && !pre && OI().fromPdf ? `<button type="button" class="igx-pill" onclick="window._OI.fromPdf()">${ic('scan')}Σάρωση εντολής πελάτη</button>` : '');
  el.innerHTML = `<h1>${esc(s.title || '')}</h1>` + segHtml('igxMode', [['single', 'Απλό φορτίο', s.members.length > 1, 'Πρώτα διέγραψε τις άλλες παραγγελίες'],
      ['group', 'Groupage', pre, 'Το pre-order γίνεται πρώτα παραγγελία']], s.mode)
    + segHtml('igxDir', [['Export', 'Εξαγωγή', piece, 'Κομμάτι από απόθεμα = εισαγωγή'], ['Import', 'Εισαγωγή']], s.dir)
    + '<span class="sp"></span>' + scanBtn
    + `<button type="button" class="igx-cl" title="Εντολή πελάτη" aria-label="Εντολή πελάτη" onclick="document.querySelector('#igx #odFormPick')?.click()">${ic('clip')}</button>`
    + `<button type="button" class="igx-cl" aria-label="Κλείσιμο" onclick="closeModal()">${ic('x')}</button>`;
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
  const v = piece ? '<span class="n">στην παρτίδα</span>'
    : price ? `<span class="n num">${esc(Number(price).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</span>`
    : '<span class="n"><span class="np">χωρίς τιμή</span></span>';
  const signs = [m.file ? note('Από το αρχείο «' + m.file + '»') : '',
    needsVehicle(m) ? note('Θα πάρει το φορτηγό του groupage με την αποθήκευση') : '',
    val(m, 'f_Direction') && IG.s.dir && val(m, 'f_Direction') !== IG.s.dir ? note('Άλλη κατεύθυνση από του groupage') : ''].join('');
  return `<i class="igx-onum">${n}</i><b>${esc(val(m, 'ls_client') || 'Νέα παραγγελία')}${piece ? '<span class="ap">ΑΠ</span>' : ''}${signs}</b>
    <span>${esc(route || '—')}</span><span class="num">${esc(L[0] && L[0].date ? dayOf(L[0].date) : '')}</span>
    <span class="n num">${pal ? pal + ' παλ.' : ''}</span>${v}${ic(IG.s.open === m.key ? 'up' : 'down')}
    <button type="button" title="Διαγραφή παραγγελίας" aria-label="Διαγραφή παραγγελίας" onclick="event.stopPropagation();IntlGroup.remove('${m.key}')">${ic('trash')}</button>`;
}

function paintList() {
  const s = IG.s;
  s.members.forEach((m, k) => { const h = document.querySelector(`#igm_${m.key} .igx-mh`); if (h) h.innerHTML = lineHtml(m, k + 1); });
  const head = document.getElementById('igxHead');
  if (head) head.innerHTML = s.mode === 'group' ? `Παραγγελίες<small class="num">${s.members.length}</small>` : 'Παραγγελία';
  const add = document.getElementById('igxAdd');
  if (add) {
    const imp = s.dir === 'Import';
    const stockOn = typeof OrdersStock !== 'undefined' && OrdersStock.on() && OrdersStock.canWrite();
    add.innerHTML = `<button type="button" class="igx-lnk" onclick="IntlGroup.addNew()">${ic('plus')}Παραγγελία</button>
      <button type="button" class="igx-lnk" title="PDF ή εικόνα· γίνεται νέα παραγγελία του groupage" onclick="IntlGroup.fromFile()">${ic('file')}Από αρχείο</button>
      <button type="button" class="igx-lnk" title="Παραγγελία που έχει ήδη καταχωρηθεί" onclick="IntlGroup.pickExisting()">${ic('list')}Υπάρχουσα</button>
      ${stockOn ? `<button type="button" class="igx-lnk" onclick="IntlGroup.pickPiece()"${imp ? ' title="Κομμάτι από παρτίδα που είναι στην αποθήκη"' : ' disabled title="Κομμάτι από απόθεμα μπαίνει μόνο σε groupage εισαγωγής"'}>${ic('pkg')}Κομμάτι από απόθεμα</button>` : ''}`;
  }
  document.getElementById('igx')?.classList.toggle('group', s.mode === 'group');
}

// ── Side panel ────────────────────────────────────────────────────────────────
function ptHtml(p, n, group) {
  const hrs = p.tf || p.tt ? `${p.tf || ''}–${p.tt || ''}` : '';
  const sub = [group ? p.client : '', p.date ? dayOf(p.date) : '', hrs].filter(Boolean).join(' · ');
  // A loading point through Veroia is written as its supplier, «(Veroia Cross Dock)» beside it (owner 15/11, 1).
  return `<div class="igx-pt" draggable="true" data-pk="${esc(p.pk)}" title="Σύρε για αλλαγή σειράς">
    ${ic('grip')}<i class="igx-onum">${n}</i>
    <span><b>${esc(p.name || '—')}${p.vs ? ' <i>(Veroia Cross Dock)</i>' : ''}</b><small>${esc(sub)}</small></span>
    <span class="num">${p.pal || ''}</span></div>`;
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
    if (s.assign && s.assign.mixed) rows.push(['Φορτηγό', `διαφορετικά${note('Οι παραγγελίες του groupage έχουν διαφορετικό φορτηγό — η ανάθεση γίνεται στο Εβδομαδιαίο')}`]);
  } else {
    const m = s.members[0];
    if (m && peOf(m) === true) {
      const ticks = pts.map(p => !!q(m, `ex_${p.t}_${p.i}`)?.checked), on = ticks.filter(Boolean).length;
      rows.push(['Ανταλλαγή', `${on} από ${ticks.length} σημεία${on < ticks.length ? note(ticks.length - on === 1 ? 'Ένα σημείο χωρίς ανταλλαγή' : (ticks.length - on) + ' σημεία χωρίς ανταλλαγή') : ''}`]);
    } else if (m && peOf(m) === false) rows.push(['Ανταλλαγή', 'όχι']);
    // the Veroia day and pallets: the same words the form of 8/11 computes (its summary strip, hidden here)
    const vs = m && m.node.querySelector('#oiBalance .oi2-vschip');
    if (vs) rows.push(['Βέροια', esc(vs.textContent.replace(/^Βέροια\s*/, '').replace(/\s*παλέτες$/, ''))]);
    if (missing) rows.push(['Τιμή', note('Λείπει η τιμή — αποθηκεύεται και χωρίς')]);
  }
  el.innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  const btn = document.getElementById('btnSubmit');
  if (btn && !s.saving) btn.textContent = s.mode === 'group' ? `Αποθήκευση · ${s.members.length} παραγγελίες` : 'Αποθήκευση';
}
function peOf(m) {
  const r = m.node.querySelector('input[name=f_PalletExch]:checked');
  return r ? r.value === 'yes' : null;
}

// ── Dressing the form of one order as the design (no field, id or rule changes) ──
// Labels in the design's words; the points' header in the design's columns; a grip and a number on each point; the
// «Σε πελάτη | Σε απόθεμα» switch drives the form's own «σε απόθεμα» tick (its rules stay in orders_intl.js); the
// add-point links, «Υψηλό ρίσκο» and «Εντολή πελάτη» on one line above the notes. Run once per order, and the rows
// again after every change (new points).
function dress(m) {
  const n = m.node;
  const relabel = (sel, txt) => { const e = n.querySelector(sel); if (e) e.textContent = txt; };
  const r3 = n.querySelectorAll('.oi2-r3 > .oi2-f > span:first-child');
  if (r3[1]) r3[1].textContent = 'Αναφορά πελάτη';
  if (r3[2]) r3[2].textContent = 'Τιμή, καθαρή';
  const cargo = n.querySelectorAll('.oi2-cargo > .oi2-f > span:first-child');
  ['Εμπόρευμα', 'Βάρος', null, 'Ψυκτικό', 'Παλέτα', 'Ανταλλαγή παλετών'].forEach((t, k) => { if (t && cargo[k] && !cargo[k].classList.contains('oi-temp-head')) cargo[k].textContent = t; });
  relabel('#f_TempLbl', 'Θερμοκρασία');
  const w = n.querySelector('#f_GrossWeight'); if (w) w.placeholder = 'kg';
  const rf = cargo[3];
  if (rf && IG.s.mode === 'group' && !rf.querySelector('.ic')) rf.insertAdjacentHTML('beforeend', `<span title="Ίδιο για όλο το groupage" style="display:flex;color:var(--help)">${ic('link')}</span>`);
  for (const t of ['l', 'u']) {
    const th = n.querySelector(`#oi2sec_${t} .oi2-th`); if (!th || th.dataset.igx) continue;
    th.dataset.igx = '1';
    const sp = [...th.children];
    sp[0].textContent = t === 'l' ? 'Φόρτωση' : 'Παράδοση';
    const cls = t === 'l' ? ['c-ref', 'c-dt', 'c-hrs', 'c-pal'] : ['c-dt', 'c-hrs', 'c-pal'];
    const txt = t === 'l' ? ['Αναφορά', 'Ημέρα', 'Ώρες', 'Παλ.'] : ['Ημέρα', 'Ώρες', 'Παλ.'];
    cls.forEach((c, k) => { if (sp[k + 1]) { sp[k + 1].className = c; sp[k + 1].textContent = txt[k]; } });
    const ex = th.querySelector('.oi2-c-ex'); if (ex) ex.textContent = 'Ανταλλ.';
  }
  // «Σε πελάτη | Σε απόθεμα»: a switch over the form's own tick
  const lot = n.querySelector('#f_StockLot'), cg = n.querySelector('.oi2-cargo');
  if (lot && cg && !cg.querySelector('.igx-dlv')) {
    const inGroup = IG.s.mode === 'group';
    const why = lot.disabled ? (lot.closest('label')?.title || '') : inGroup ? 'Μέσα σε groupage θέλει πρώτα αλλαγή στη βάση' : '';
    cg.insertAdjacentHTML('beforeend', `<div class="oi2-f igx-dlv"><span>Παράδοση</span><span class="oi2-seg" id="igxDlvSeg">
      <button type="button" data-v="0" class="${lot.checked ? '' : 'on'}" onclick="IntlGroup._dlv(this)">Σε πελάτη</button>
      <button type="button" data-v="1" class="${lot.checked ? 'on' : ''}"${why && !lot.checked ? ` disabled title="${esc(why)}"` : ''} onclick="IntlGroup._dlv(this)">Σε απόθεμα</button></span></div>`);
  }
  // one line under the points: add a point, high risk, the client's order; then the notes
  const notes = n.querySelector('.oi2-notes');
  if (notes && !n.querySelector('.igx-tools')) {
    const tools = document.createElement('div');
    tools.className = 'igx-tools';
    for (const id of ['btn_addL', 'btn_addU']) {
      const b = n.querySelector('#' + id); if (!b) continue;
      b.innerHTML = ic('plus') + (id === 'btn_addL' ? 'Σημείο φόρτωσης' : 'Σημείο παράδοσης');
      tools.appendChild(b);
    }
    tools.insertAdjacentHTML('beforeend', '<span class="sp"></span>');
    const hr = notes.querySelector('.oi2-ck'); if (hr) { hr.lastChild.textContent = ' Υψηλό ρίσκο'; tools.appendChild(hr); }
    const docs = notes.querySelector('.oi2-docs'); if (docs) tools.appendChild(docs);
    notes.before(tools);
    const ta = n.querySelector('#f_Notes'); if (ta) ta.placeholder = 'Για τον οδηγό ή τη ράμπα';
  }
  const oi2 = n.querySelector('.oi2'); if (oi2) oi2.classList.toggle('igx-ex', peOf(m) === true);
  dressRows(m);
}
// A grip and the point's number on every row, in the order of the side panel (the panel's drag moves the rows too,
// so the number in the form and in the panel are the same). Moving a row keeps its node: ids and values stay.
function dressRows(m) {
  const s = IG.s;
  for (const t of ['l', 'u']) {
    const box = m.node.querySelector(`#stops_${t}`); if (!box) continue;
    const list = t === 'l' ? s.lo : s.dl;
    const rows = [...box.querySelectorAll('.oi2-stop')];
    const rank = r => { const at = list.indexOf(`${m.key}:${t}:${String(r.id).split('_').pop()}`); return at < 0 ? 1e6 + rows.indexOf(r) : at; };
    rows.slice().sort((a, b) => rank(a) - rank(b)).forEach(r => box.appendChild(r));
    [...box.querySelectorAll('.oi2-stop')].forEach((r, k) => {
      let g = r.querySelector('.igx-gr');
      if (!g) { r.insertAdjacentHTML('afterbegin', `<b class="igx-gr" draggable="true" title="Σύρε για αλλαγή σειράς"></b>`); g = r.querySelector('.igx-gr'); }
      g.innerHTML = ic('grip') + (k + 1);
    });
  }
  const oi2 = m.node.querySelector('.oi2'); if (oi2) oi2.classList.toggle('igx-ex', peOf(m) === true);
  // a missing price: the field in amber and a «!» beside its label (design s3), never a refusal
  const pr = q(m, 'f_Price'), lab = pr && pr.closest('.oi2-f')?.querySelector('span');
  if (pr && pr.tagName === 'INPUT' && lab) {
    const miss = !String(pr.value || '').trim();
    pr.classList.toggle('igx-miss', miss);
    const has = lab.querySelector('.igx-note');
    if (miss && !has) lab.insertAdjacentHTML('beforeend', note('Λείπει. Αποθηκεύεται και χωρίς τιμή· θα φανεί στο «Χωρίς τιμή».'));
    if (!miss && has) has.remove();
  }
  if (!m.node._igxDate) {
    m.node._igxDate = true;
    // the calendar icon is hidden (design: the day as text); a click on the day opens the browser's own picker
    m.node.addEventListener('click', e => { const d = e.target; if (d && d.type === 'date' && typeof d.showPicker === 'function') { try { d.showPicker(); } catch (_) {} } });
  }
}
function _dlv(btn) {
  const lot = document.querySelector('#igx #f_StockLot'); if (!lot || btn.disabled) return;
  const want = btn.dataset.v === '1';
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
  if (lot.checked !== want) { lot.checked = want; lot.dispatchEvent(new Event('change', { bubbles: true })); }
  changed();
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
// The grip on a point in the form drags it too (design: «Σύρε για αλλαγή σειράς»), inside its own list of the load:
// the same move as the side panel, so both always show one order.
function wireRowDrag(m) {
  if (m.node._igxDrag) return;
  m.node._igxDrag = true;
  const pkOf = r => { const id = String(r.id); const t = id.split('_')[1]; return `${m.key}:${t}:${id.split('_').pop()}`; };
  m.node.addEventListener('dragstart', e => {
    const g = e.target.closest && e.target.closest('.igx-gr'); if (!g) return;
    _dragPk = pkOf(g.closest('.oi2-stop'));
    try { e.dataTransfer.setData('text/plain', _dragPk); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
  });
  m.node.addEventListener('dragover', e => {
    const r = e.target.closest && e.target.closest('.oi2-stop'); if (!r || !_dragPk) return;
    if (pkOf(r).split(':')[1] !== _dragPk.split(':')[1]) return;
    e.preventDefault();
  });
  m.node.addEventListener('drop', e => {
    const r = e.target.closest && e.target.closest('.oi2-stop'); const s = IG.s; if (!r || !_dragPk || !s) return;
    const k = _dragPk.split(':')[1] === 'l' ? 'lo' : 'dl';
    if (!s[k].includes(_dragPk)) return;
    e.preventDefault();
    s[k] = moveBefore(s[k], _dragPk, pkOf(r));
    _dragPk = null;
    paint();
  });
  m.node.addEventListener('dragend', () => { _dragPk = null; });
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
  s.members.forEach(dressRows);
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
    await deleteIntlOrder(savedId, { rerender: async () => { gone = true; } });
    if (!gone) return;   // cancelled or refused: deleteIntlOrder already said why
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
      await submitIntlOrder(m.recId || '', { dryRun: true, gid: '', dupAsked: !!m.dupAsked, stopPos: stopPosFor(m) });
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
    if (typeof rtOnOrderSaved === 'function' && s.assign && !s.assign.mixed) {
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
  remove, save, _filter, _addExisting, _addPiece, _dlv,
  // pure helpers (tests/intl-group.test.js)
  _assignmentOf: assignmentOf, _moveBefore: moveBefore, _orderByFirstPoint: orderByFirstPoint, _state: () => IG.s };
})();
