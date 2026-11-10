// The printed week (owner 9–10/11/2026, design approved «οκ το προχωράμε»): one A4 landscape sheet that speaks
// the language of the Weekly board — white day groups, caps day header with counters (red = work, today blue),
// the truck in the middle on grey-blue, Veroia Switch in the blue box of the old Excel, red dashed = work.
//
// PURE: plain data in, an HTML string out. It never reads the board, the DOM or the clock, so node tests run it
// and the screen stays the ONE place that decides what a row is (modules/weekly_intl_v2.js builds the data from
// the board's own model). Every number the sheet prints (masthead, strip, day headers) is counted HERE from the
// rows it draws, so a header can never disagree with the rows under it.
(function () {
'use strict';

const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// DM Sans 700 and DM Mono are not in the print shell (core/utils.js _printWeekShell loads 400/500 only).
const FONTS = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@500&display=swap';

// Page arithmetic, in mm (A4 landscape, margins of the CSS below). The rows FILL the page: a small week gets
// tall rows and ~8.5pt, a 52-truck week 4.7mm rows on two pages. Measured on the approved mock (9/11): the
// masthead + strip + column header + legend take 33mm of the first page's 191mm; a later page loses only the
// repeated column header. A day header costs 1.3 rows.
const PAGE = Object.freeze({ first: 158, firstNatl: 137, next: 185, minRow: 4.4, maxRow: 6.6, dayUnits: 1.3 });
function size(nRows, nDays, first, minRow) {
  const F = first || PAGE.first, MIN = minRow || PAGE.minRow;   // the national sheet has two tables: its fixed part is taller
  const units = Math.max(1, nRows + PAGE.dayUnits * nDays);
  let pages = 1, rh = F / units;
  // .975: a row never breaks in two, so each page boundary wastes up to a part of a row
  while (rh < MIN && pages < 12) { pages++; rh = (F + (pages - 1) * PAGE.next) * 0.975 / units; }
  rh = Math.min(rh, PAGE.maxRow);
  return { pages, rh: +rh.toFixed(2), fs: +Math.max(7.6, Math.min(8.5, rh * 1.7)).toFixed(2) };
}

// «Irinoupoli Sud (ΟΤ 12), Aspropyrgos» → «Irinoupoli Sud»: the name of the point, never the town (owner 9/11).
function pointName(s) { return String(s == null ? '' : s).split(/[,(]/)[0].trim() || '—'; }
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

const CSS = `
.wp, .wp * { color: inherit; font-family: inherit; box-sizing: border-box; margin: 0; padding: 0; }
@page { size: A4 landscape; margin: 8mm 9mm 11mm;
  @bottom-right { content: "Σελίδα " counter(page) " / " counter(pages); font: 7pt 'DM Sans', sans-serif; color: #94A3B8; } }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { padding: 0 !important; margin: 0; }
.wp { --navy:#0B1929; --blue:#0284C7; --red:#B91C1C; --green:#14532D; --amber:#B45309; --ink:#0F172A; --body:#475569;
  --mut:#94A3B8; --done:#64748B; --rule:#E2E8F0; --edge:#B4C0CE; --tk:#E6ECF3; --vs:#DBEAFE; --vsink:#1E3A8A;
  font: var(--fs)/1.25 'DM Sans', sans-serif; color: var(--ink); background: #fff; }
/* The masthead must never be wider than the page: an overflow makes Chromium shrink the WHOLE sheet to fit
   (measured 9/11: every size came out 13% smaller). Hence overflow:hidden and the counters on their own line. */
.wp .mast { display: flex; align-items: flex-end; gap: 14pt; border-bottom: 1.6pt solid var(--navy); padding-bottom: 5pt; overflow: hidden; }
.wp .mast h1 { font: 700 19pt/1 'Syne', sans-serif; color: var(--navy); white-space: nowrap; }
.wp .mast h1 em { font-style: normal; color: var(--blue); }
.wp .mast .sub { font-size: 8.4pt; color: var(--body); margin-top: 3.5pt; white-space: nowrap; }
.wp .mast .sub i { font-style: normal; color: var(--mut); }
.wp .kpi { margin-left: auto; display: flex; align-items: flex-end; gap: 14pt; white-space: nowrap; }
.wp .kpi .big b { font: 700 26pt/.8 'DM Sans', sans-serif; color: var(--navy); font-variant-numeric: tabular-nums; }
.wp .kpi span span { font-size: 8.8pt; color: var(--body); margin-left: 3pt; }
.wp .kpi .mid b { font-size: 13pt; line-height: 1; color: var(--navy); }
.wp .act { display: flex; gap: 16pt; align-items: baseline; padding: 4.5pt 0 0 .1em; white-space: nowrap; overflow: hidden; min-height: 14pt; }
.wp .act label { font-size: 6.9pt; font-weight: 700; letter-spacing: .09em; color: var(--mut); }
.wp .act span { color: var(--red); font-size: 8.8pt; font-weight: 500; }
.wp .act b { font-size: 11.5pt; line-height: 1; font-weight: 700; margin-right: 3pt; font-variant-numeric: tabular-nums; }
.wp .act .am { color: var(--amber); }
.wp table.b { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 4pt; }
.wp .b th { font-size: .72em; font-weight: 700; letter-spacing: .09em; color: var(--mut);
  text-align: left; padding: 2.5pt .55em 0; white-space: nowrap; overflow: hidden; }
.wp .b th small { font-size: 1em; font-weight: 500; letter-spacing: .02em; }
.wp .b th.vh { color: #1D4ED8; }
.wp .b th.r { text-align: right; }
.wp .b td { height: var(--rh); padding: 0 .55em; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border-top: .5pt solid var(--rule); }
.wp .b tr { break-inside: avoid; }
.wp .b td:first-child { border-left: .8pt solid var(--edge); }
.wp .b td:last-child { border-right: .8pt solid var(--edge); }
.wp .b tr.f td { border-top: .8pt solid var(--edge); }
.wp .b tr.l td { border-bottom: .8pt solid var(--edge); }
.wp .b tr.td td { border-color: #BAE0F5; }
.wp .b tr.td td:first-child { border-left: 1pt solid var(--blue); }
.wp .b tr.td td:last-child { border-right: 1pt solid var(--blue); }
.wp .b tr.td.f td { border-top: 1pt solid var(--blue); }
.wp .b tr.td.l td { border-bottom: 1pt solid var(--blue); }
.wp .b tr.day { break-after: avoid; }
.wp .b tr.day td { height: calc(var(--rh) * 1.3); vertical-align: bottom; padding: 0 0 .28em .1em; border: 0;
  font-weight: 700; font-size: .96em; letter-spacing: .07em; color: var(--navy); overflow: visible; }
.wp .b tr.day td span { font-weight: 500; letter-spacing: 0; color: var(--body); margin-left: .9em; }
.wp .b tr.day td span.w { color: var(--red); font-weight: 700; margin-left: .7em; }
.wp .b tr.day td span.w.am { color: var(--amber); }
.wp .b tr.day td span.t { color: var(--blue); margin-left: .5em; }
.wp .b tr.day.today td { color: var(--blue); }
.wp .b td.i { color: var(--mut); font-size: .78em; text-align: right; padding: 0 .5em 0 0; font-variant-numeric: tabular-nums; }
.wp .b td.dt { color: var(--body); font-size: .93em; font-variant-numeric: tabular-nums; }
.wp .b td.p { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; padding: 0 .3em 0 0; overflow: visible; }
/* Real names are long (live week 46, 10/11: «3…» for 33 pallets, destinations cut off whole). The words of a
   load, of the truck and of the national points take a second line before they are cut: the row grows. */
.wp .b td.wr { white-space: normal; line-height: 1.16; padding-top: .12em; padding-bottom: .12em; }
.wp .cl { font-weight: 700; }
.wp .ar { color: var(--mut); margin: 0 .25em; }
.wp .more { color: var(--body); font-size: .88em; font-weight: 500; }
/* delivered: readable grey with a tick, never faint */
.wp .b td.dn, .wp .b td.dn .cl, .wp .b td.dn .ar, .wp .b td.dn .more { color: var(--done); font-weight: 400; }
.wp .tick { margin-right: .25em; }
.wp .b td.tkc { padding: 0 .35em; }
.wp .tk { display: flex; align-items: center; gap: .1em .55em; background: var(--tk); border-radius: 2pt; min-height: calc(var(--rh) - 1.1mm); line-height: 1.1;
  padding: .12em .6em; overflow: hidden; }
/* in a row that is already tall (its load or its points take lines) the driver goes under the plates, whole;
   in a one-line row he stays beside them and is cut: the truck alone never makes a row taller */
.wp .tk.w { flex-wrap: wrap; }
.wp .tk .pl { flex: none; font: 500 .97em 'DM Mono', monospace; color: var(--navy); }
/* the trailer's plate (Pantelis 10/11, «είναι σημαντικό»): a load is found in the yard by its trailer */
.wp .tk .tr { flex: none; font: 500 .9em 'DM Mono', monospace; color: var(--body); margin-left: -.3em; }
.wp .tk .dr { color: var(--body); font-size: .93em; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wp .tk.p { background: #DCFCE7; }
.wp .tk.p .pl { font: 700 .8em 'DM Sans', sans-serif; letter-spacing: .08em; color: var(--green); }
.wp .tk.p .dr { color: var(--green); font-weight: 500; }
/* a partner's plates are free text of any length: they go to a line of their own before the name is cut */
.wp .tk.p .tr { flex: 0 1 auto; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: 0; color: var(--green); }
.wp .tk.x { background: none; border: .9pt dashed var(--red); color: var(--red); font-weight: 700; }
.wp .gap { display: inline-block; border: .9pt dashed var(--red); color: var(--red); font-weight: 700; border-radius: 2pt; padding: 0 .55em; line-height: 1.32; vertical-align: middle; }
.wp .gap.am { border-color: var(--amber); color: var(--amber); margin-left: .35em; }
.wp .vs { display: inline-block; background: var(--vs); color: var(--vsink); font-weight: 700; border-radius: 2pt; padding: 0 .5em; line-height: 1.36;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; border: .9pt solid var(--vs); }
.wp .vs.ok { background: #EEF2F7; border-color: #EEF2F7; color: var(--done); font-weight: 500; }
.wp .vs.x { border: .9pt dashed var(--red); }
.wp .vs.q { background: none; border: .9pt dashed var(--mut); color: var(--body); }
/* The national end of a row (owner 10/11): EVERY point and the day beside them, so the national dispatcher reads
   from this sheet what he has to bring and to take. One blue box, one point a line, cut only at the box's edge:
   as separate boxes on one line each was four letters on the live week (10/11). The day never shrinks. */
.wp .vw { display: flex; align-items: center; gap: .35em; min-width: 0; }
.wp .vw .vs { flex: 0 1 auto; min-width: 0; font-size: .9em; line-height: 1.16; padding: .08em .45em; }
.wp .vw .vs .pt { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wp .vw .vd { flex: none; color: var(--body); font-size: .93em; font-variant-numeric: tabular-nums; white-space: nowrap; }
.wp .vw.r .vd { margin-left: auto; padding-left: .2em; }
.wp .vw.dn .vd { color: var(--done); }
/* national sheet: section titles, the Veroia ledger (one line per day, numbers only, names where a truck is missing) */
.wp .h { display: flex; align-items: baseline; gap: 8pt; margin-top: 7pt; font: 700 .98em 'DM Sans', sans-serif; letter-spacing: .07em; color: var(--navy); }
.wp .h span { font-weight: 500; letter-spacing: 0; color: var(--mut); font-size: .9em; }
.wp .b th.g { padding-left: 1.6em; padding-bottom: 1pt; }
.wp .b th.q, .wp .b td.q { text-align: right; padding-right: 1.1em; }
.wp .b td.q { font-weight: 700; font-variant-numeric: tabular-nums; }
.wp .b td.q.no { color: var(--red); } .wp .b td.q.am { color: var(--amber); } .wp .b td.q.ok { color: var(--done); font-weight: 500; }
.wp .b td.dd { font-weight: 700; color: var(--navy); } .wp .b td.dd.now { color: var(--blue); }
.wp .b td.dd small { font-weight: 500; color: var(--body); font-size: .9em; margin-left: .4em; }
.wp .b td.sp { border-left: .8pt solid var(--edge); padding-left: 1em; } .wp .b th.sp { padding-left: 1em; }
.wp .it { margin-right: 1em; } .wp .it b { font-size: .93em; margin-left: .2em; }
.wp .it .mono, .wp .vs .mono { font-family: 'DM Mono', monospace; font-weight: 500; }
.wp .it > .mono { color: var(--body); font-size: .93em; margin-left: .35em; }
.wp .none { color: #CBD5E1; }
.wp .b td.dn .vs { background: #EEF2F7; border-color: #EEF2F7; color: var(--done); font-weight: 500; }
.wp .b tr.day td span.mu { color: var(--mut); }
/* wraps, never overflows: a legend wider than the page would shrink the whole sheet (see .mast) */
.wp .legend { margin-top: 5pt; font-size: 7.2pt; color: var(--body); display: flex; flex-wrap: wrap; gap: 2pt 14pt; align-items: center; }
.wp .legend > span { white-space: nowrap; }
.wp .legend .vs, .wp .legend .gap { font-size: 7pt; margin: 0 3pt 0 0; }
`;

// state: 'done' (the national part ran) · 'plan' (a national truck has it) · 'none' (no national truck) ·
// 'unknown' (the national read has not answered: never drawn as «no truck», unknown ≠ empty)
// v = { points: [names], date, state }: every point is drawn (owner 10/11); `side` 'up' = the day first (the
// supplier's loading day), 'dn' = the day last (the delivery day), each beside the points it belongs to.
function vsHTML(v, side) {
  if (!v) return '';
  const cls = { done: ' ok', none: ' x', unknown: ' q' }[v.state] || '';
  const pts = v.points && v.points.length ? v.points : ['—'];
  const box = `<span class="vs${cls}">${pts.map((n, i) => `<span class="pt">${v.state === 'done' && i === 0 ? '✓ ' : ''}${_esc(pointName(n))}</span>`).join('')}</span>`;
  const day = v.date ? `<span class="vd">${_esc(v.date)}</span>` : '';
  return `<div class="vw${side === 'dn' ? ' r' : ''}${v.state === 'done' ? ' dn' : ''}">${side === 'dn' ? box + day : day + box}</div>`;
}
// x = an export or import side: {client, dest, more, piece, lot, pre}. An import pre-order has no place yet and
// is drawn by rowHTML (client + tag); an export pre-order keeps its route and gets the tag after it. «ΑΠ» = a piece taken from stock; a lot goes
// to the warehouse, not to the client (the marks of the old week sheet, impact map 4/10 PR-10).
function sideHTML(x) {
  const m = x.more ? ` <span class="more">+${x.more}</span>` : '';
  return `${x.piece ? '<span class="more">ΑΠ</span> ' : ''}<span class="cl">${_esc(x.client || '—')}</span><span class="ar">→</span>${_esc(x.dest || '—')}${m}` +
    (x.lot ? ' <span class="more">→ ΑΠΟΘΗΚΗ</span>' : '') + (x.pre ? ' <span class="gap am">Pre-order</span>' : '');
}
function truckHTML(t, tall) {
  const w = tall ? ' w' : '';
  if (!t || t.kind === 'none') return '<td class="tkc"><div class="tk x">Χωρίς φορτηγό</div></td>';
  // a partner's plates are free text («ΕΚΑ1234 / Ρ5678»): after the name, which is what the office knows him by
  if (t.kind === 'par') return `<td class="tkc"><div class="tk p${w}"><span class="pl">ΣΥΝ</span><span class="dr">${_esc(t.name || '—')}</span>${t.plates ? `<span class="tr">${_esc(t.plates)}</span>` : ''}</div></td>`;
  return `<td class="tkc"><div class="tk${w}"><span class="pl">${_esc(t.plate || '—')}</span>${t.trailer ? `<span class="tr">· ${_esc(t.trailer)}</span>` : ''}<span class="dr">${_esc(t.name || '')}</span></div></td>`;
}
// unknown pallets are «—», never 0; a group with a member off the record says «22+;» (the board's «22 +?»)
const _unk = (x) => x.pallets == null || x.pallets === '';
const _pal = (x) => (_unk(x) ? '—' : _esc(x.pallets) + (x.palMiss ? '<span class="more">+;</span>' : ''));
const _arrow = (s) => _esc(s).replace(/ → /g, '<span class="ar">→</span>');

function rowHTML(r, cls) {
  const ex = r.ex, im = r.im;
  const c = [`<td class="i">${_esc(r.no == null ? '' : r.no)}</td>`, `<td class="wr">${vsHTML(r.up, 'up')}</td>`];
  if (ex) {
    const g = ex.done ? ' dn' : '';
    c.push(`<td class="dt${g}">${ex.done ? '<span class="tick">✓</span>' : ''}${_esc(ex.date || '—')}</td>`,
      `<td class="wr${g}">${sideHTML(ex)}</td>`, `<td class="p${g}">${_pal(ex)}</td>`);
  } else c.push('<td></td><td></td><td></td>');
  c.push(truckHTML(r.truck, rowLines(r) > 1));
  // The import's two days stand each beside its own point (Pantelis 10/11): loading before the client, delivery
  // after the destination.
  if (r.gap) c.push('<td></td>', '<td><span class="gap">Κενό γύρισμα</span></td>', '<td></td>', '<td></td>');
  else if (im && im.unread) c.push('<td></td>', '<td><span class="gap am" style="margin-left:0">Εισαγωγή εκτός προβολής</span></td>', '<td></td>', '<td></td>');
  else if (im) {
    const g = im.done ? ' dn' : '';
    const txt = im.pre ? `<span class="cl">${_esc(im.client || '—')}</span> <span class="gap am">Pre-order</span>` : sideHTML(im);
    c.push(`<td class="dt${g}">${im.done ? '<span class="tick">✓</span>' : ''}${_esc(im.load || '—')}</td>`,
      `<td class="wr${g}">${txt}</td>`, `<td class="dt${g}">${_esc(im.del || '')}</td>`, `<td class="p${g}">${im.pre && !(+im.pallets > 0) ? '' : _pal(im)}</td>`);   // a pre-order's 0 is nobody's count
  } else c.push('<td></td><td></td><td></td><td></td>');
  c.push(`<td class="wr">${vsHTML(r.dn, 'dn')}</td>`);
  return `<tr class="${cls.join(' ')}">${c.join('')}</tr>`;
}

// Upper case is WRITTEN in the column header: CSS upper-casing keeps the Greek tonos in some browsers («ΦΌΡΤΩΣΗ»).
// What a set of rows needs: the ONE count behind the strip and every day header.
// The paper counts AHEAD of the board on purpose (design approved 10/11): the board's day header names an empty
// return only from two days before the truck is back (WI4.flags), a sheet printed on Monday for the whole week
// names every own truck that has nothing to bring back. Each count equals the marks drawn under it.
function tally(rows) {
  const t = { exports: 0, pallets: 0, palUnknown: 0, palMark: 0, empty: 0, noTruck: 0, dnNone: 0, upNone: 0, pre: 0, piece: 0, lot: 0 };
  for (const r of rows) {
    if (r.ex) { t.exports++; if (_unk(r.ex)) t.palUnknown++; else { t.pallets += +r.ex.pallets || 0; if (r.ex.palMiss) t.palUnknown++; } }
    for (const x of [r.ex, r.im]) { if (x && x.piece) t.piece++; if (x && x.lot) t.lot++; if (x && x.palMiss && !_unk(x)) t.palMark++; }
    if (r.gap) t.empty++;
    if (!r.truck || r.truck.kind === 'none') t.noTruck++;
    if (r.dn && r.dn.state === 'none') t.dnNone++;
    if (r.up && r.up.state === 'none') t.upNone++;
    if (r.im && r.im.pre) t.pre++;
    if (r.ex && r.ex.pre) t.pre++;
  }
  return t;
}
function workWords(t) {
  return [
    t.empty && ['', plural(t.empty, 'κενό γύρισμα', 'κενά γυρίσματα')],
    t.noTruck && ['', t.noTruck + ' χωρίς φορτηγό'],
    t.dnNone && ['', plural(t.dnNone, 'κάθοδος χωρίς εθνικό', 'κάθοδοι χωρίς εθνικό')],
    t.upNone && ['', plural(t.upNone, 'άνοδος χωρίς εθνικό', 'άνοδοι χωρίς εθνικό')],
    t.pre && [' am', t.pre + ' pre-order'],
  ].filter(Boolean);
}

// Letters one line of a column takes, at the sheet's own type (CAP), and the lines a row needs (1–4).
const CAP = Object.freeze({ ex: 30, im: 26 });
function rowLines(r) {
  const len = (x) => (x ? String(x.client || '').length + String(x.dest || '').length + 3 + (x.more ? 3 : 0) + (x.pre ? 10 : 0) + (x.lot ? 10 : 0) : 0);
  const vs = (v) => (v && v.points ? v.points.length : 0);
  return Math.min(4, Math.max(1, vs(r.up), vs(r.dn), Math.ceil(len(r.ex) / CAP.ex), Math.ceil(len(r.im) / CAP.im)));
}

/** p = { week, range, stamp, days: [{ head, today, rows: [row] }] }; row = { no, up, ex, truck, im, gap, dn };
 *  up / dn = { points, date, state }; truck = { kind, plate, trailer, name } | { kind:'par', name, plates }; im = { load, del, … }
 *  (see rowHTML / vsHTML / sideHTML for the fields; a side's pallets: null = unknown, palMiss = partly known;
 *  a row may carry `rid`, the board row's id: never printed, the board rig compares the two row by row). Days without rows are not printed. */
function intlHTML(p) {
  const days = (p.days || []).filter((d) => d.rows && d.rows.length);
  const all = days.reduce((a, d) => a.concat(d.rows), []);
  // Rows grow when their words take more lines: the page arithmetic counts them — one line per national point,
  // and the letters of a load or a truck against what one line of its column takes (measured on the live week
  // 46, 10/11). An estimate, on the generous side: a sheet that leaves room is better than one row alone on a
  // second page. A line more costs .9 of a row, and single rows may be 4mm here (the type stays 7.6pt).
  const extra = all.reduce((n, r) => n + (rowLines(r) - 1) * 0.9, 0);
  const sz = size(all.length + extra, days.length, PAGE.first, 4), T = tally(all);
  const body = [];
  for (const d of days) {
    const t = tally(d.rows);
    const w = workWords(t).map(([c, s]) => `<span class="w${c}">${s}</span>`).join('');
    // a day with imports only (they load that day) says so, never «0 εξαγωγές · 0 π.»
    const head = t.exports ? `${plural(t.exports, 'εξαγωγή', 'εξαγωγές')} · ${t.pallets} π.${t.palUnknown ? ' +;' : ''}` : plural(d.rows.length, 'εισαγωγή', 'εισαγωγές');
    body.push(`<tr class="day${d.today ? ' today' : ''}"><td colspan="11">${_esc(d.head)}${d.today ? '<span class="t">σήμερα</span>' : ''}` +
      `<span>${head}</span>${w}</td></tr>`);
    d.rows.forEach((r, j) => body.push(rowHTML(r, [j === 0 ? 'f' : '', j === d.rows.length - 1 ? 'l' : '', d.today ? 'td' : ''].filter(Boolean))));
  }
  const act = workWords(T).map(([c, s]) => { const i = s.indexOf(' '); return `<span class="${c.trim()}"><b>${s.slice(0, i)}</b>${s.slice(i + 1)}</span>`; }).join('');
  const title = `Εβδομάδα ${_esc(p.week)} · Διεθνή`;
  // The legend explains only what this sheet holds: a mark that is not on the page is not a line to read.
  const hasVs = all.some((r) => r.up || r.dn);
  const legend = [
    hasVs && '<span><span class="vs">Irinoupoli Sud</span>Veroia Switch · κάθε σημείο του εθνικού, με την ημέρα του</span>',
    (T.dnNone || T.upNone) && '<span><span class="vs x">Lidl Trikala</span>χωρίς εθνικό φορτηγό</span>',
    all.some((r) => (r.up && r.up.state === 'unknown') || (r.dn && r.dn.state === 'unknown')) && '<span><span class="vs q">Lidl Trikala</span>το εθνικό δεν διαβάστηκε</span>',
    T.pre && '<span><span class="gap am">Pre-order</span>χωρίς στοιχεία ακόμη</span>',
    T.piece && '<span>ΑΠ από απόθεμα</span>', T.lot && '<span>→ ΑΠΟΘΗΚΗ παράδοση σε αποθήκη</span>',
    (T.palUnknown || T.palMark) && '<span>+; παλέτες χωρίς καταγραφή</span>',   // palMark: «+;» printed on any side, an import's too
    '<span>✓ έγινε</span>', '<span>+2 ακόμη δύο σημεία</span>',
  ].filter(Boolean);
  return `<link rel="stylesheet" href="${FONTS}" media="none" onload="this.media='all'"><style>${CSS}
@page { @bottom-left { content: "Petras Group TMS · ${title} · στοιχεία ${_esc(p.stamp)}"; font: 7pt 'DM Sans', sans-serif; color: #94A3B8; } }
.wp { --fs:${sz.fs}pt; --rh:${sz.rh}mm; }
.wp col.k-i{width:1.6%} .wp col.k-up{width:14.2%} .wp col.k-ed{width:4.9%} .wp col.k-ex{width:17.6%} .wp col.k-p{width:2.8%} .wp col.k-tk{width:17.6%} .wp col.k-id{width:4.3%} .wp col.k-im{width:15%} .wp col.k-dl{width:4.6%} .wp col.k-dn{width:14.6%}
</style><div class="wp">
<header class="mast"><div><h1>Εβδομάδα ${_esc(p.week)} · <em>Διεθνή</em></h1><div class="sub">${_esc(p.range)} <i>· στοιχεία ${_esc(p.stamp)}</i></div></div>
<div class="kpi"><span class="big"><b>${T.exports}</b><span>${T.exports === 1 ? 'εξαγωγή' : 'εξαγωγές'}</span></span><span class="mid"><b>${T.pallets}</b><span>π.${T.palUnknown ? ' +;' : ''}</span></span></div></header>
<div class="act">${act ? '<label>ΘΕΛΟΥΝ ΔΡΑΣΗ</label>' + act : ''}</div>
<table class="b"><colgroup><col class="k-i"><col class="k-up"><col class="k-ed"><col class="k-ex"><col class="k-p"><col class="k-tk"><col class="k-id"><col class="k-im"><col class="k-dl"><col class="k-p"><col class="k-dn"></colgroup>
<thead><tr><th></th><th class="vh">ΑΝΟΔΟΣ · ΦΟΡΤΩΣΗ ΑΠΟ</th><th>ΦΟΡΤΩΣΗ</th><th>ΕΞΑΓΩΓΗ <small>· ανά ημέρα παράδοσης</small></th><th class="r">Π.</th><th>ΦΟΡΤΗΓΟ · ΘΑΛΑΜΟΣ</th><th>ΦΟΡΤΩΣΗ</th><th>ΕΙΣΑΓΩΓΗ</th><th>ΠΑΡΑΔ.</th><th class="r">Π.</th><th class="vh">ΚΑΘΟΔΟΣ · ΠΑΡΑΔΟΣΗ ΣΕ</th></tr></thead>
<tbody>${body.join('')}</tbody></table>
<div class="legend">${legend.join('')}</div>
</div>`;
}

// ═══ The national week ═══════════════════════════════════════════════════
// Two tables on one sheet (design approved 10/11): the Veroia ledger — per day at Veroia, the pallets of the
// international loads that go down from it and come up to it, with a national truck and without, naming only
// what has no truck — and the week's trips, the truck in the middle, descent left and ascent right.
// The blue box here holds the PLATE of the international truck (owner 10/11, «Ναι, με πινακίδα»): the box on the
// international sheet names the national point, so the two sheets read into each other.
const DOW = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
const DOW_HEAD = ['ΚΥΡΙΑΚΗ', 'ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const _utc = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)));
const _add = (d, n) => { const t = _utc(d); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const _isDay = (d) => DAY_RE.test(String(d || ''));
const dayShort = (d) => (_isDay(d) ? DOW[_utc(d).getUTCDay()] + ' ' + (+d.slice(8, 10)) : '');
const dayDm = (d) => (_isDay(d) ? DOW[_utc(d).getUTCDay()] + ' ' + (+d.slice(8, 10)) + '/' + (+d.slice(5, 7)) : '');
const dayHead = (d) => (_isDay(d) ? DOW_HEAD[_utc(d).getUTCDay()] + ' ' + (+d.slice(8, 10)) + '/' + (+d.slice(5, 7)) : '');
const _num = (x) => (x == null || x === '' || !isFinite(+x) ? 0 : +x);
const _r1 = (n) => Math.round(n * 10) / 10;
// the point with the most pallets names the end, the others are «+N»
function _best(points) {
  if (!points || !points.length) return null;
  let b = points[0];
  points.forEach((p) => { if (_num(p.pallets) > _num(b.pallets)) b = p; });
  return { name: b.name || '—', more: points.length - 1 };
}

/** Plain data of the national sheet from the board JSON and the model the screen drew (WN5L.model). Pure.
 *  o = { numbers: Map rtId → n (WN5L.boardNumbers), platesOf(orderId) → [plates] | undefined (undefined = the
 *  international trucks were not read), weekNoOf(saturday) → week number, dayOf(iso) → 'YYYY-MM-DD' (Athens), weekNo, range, stamp }. Every row of model.days is on the sheet. */
function natlModel(board, m, o) {
  const hubId = m.hubId, week = m.week, last = _add(week, 6), today = m.today;
  const platesOf = o.platesOf || (() => undefined);
  const isHub = (s) => hubId != null && Number(s.location_id) === Number(hubId);
  const cycleOf = new Map((board.cycles || []).map((c) => [c.rt_id, c]));
  // the international orders loaded (descent) or unloaded (ascent) at a Veroia stop of a cycle
  const vsAt = (c, stopId, act) => {
    const s = c && (c.stops || []).find((x) => x.stop_id === stopId);
    return s ? [...new Set((s.legs || []).filter((l) => l.act === act && String(l.kind || '').startsWith('vs_') && l.order_id != null).map((l) => l.order_id))] : [];
  };
  const vsEnd = (orders, more) => {
    let plates = [], unread = false;
    orders.forEach((id) => { const p = platesOf(id); if (p === undefined) unread = true; else p.forEach((x) => { if (!plates.includes(x)) plates.push(x); }); });
    return { vs: true, plates, unread, more: more || 0 };
  };
  const lab = (a, b) => [dayShort(a), dayShort(b)].filter(Boolean).filter((x, i, l) => i === 0 || x !== l[0]).join(' → ');
  const side = (sd, c, r, kind) => {
    if (!sd || sd.gap) return null;
    let from, to;
    if (kind === 'dn') {
      const orders = c && sd.veroia ? vsAt(c, sd.veroia.stopId, 'load') : (r.kind === 'unassigned' && r.vs && sd.veroia && r.group && r.group.order_id != null ? [r.group.order_id] : []);
      from = sd.veroia ? (orders.length ? vsEnd(orders, sd.from.length) : { name: 'Βέροια', more: sd.from.length }) : _best(sd.from);
      to = _best(sd.to);
    } else {
      from = _best(sd.from);
      const hubTo = r.kind === 'unassigned' ? sd.to.filter((p) => p.hub).length : (r.end ? 1 : 0);
      const others = r.kind === 'unassigned' ? sd.to.filter((p) => !p.hub) : sd.to;
      const orders = c && r.end ? vsAt(c, r.end.stopId, 'unload') : (r.kind === 'unassigned' && r.vs && hubTo && r.group && r.group.order_id != null ? [r.group.order_id] : []);
      to = hubTo ? (orders.length ? vsEnd(orders, others.length) : { name: 'Βέροια', more: others.length }) : _best(others);
    }
    return { dates: lab(sd.day, sd.toDay), from: from || { name: '—', more: 0 }, to: to || { name: '—', more: 0 },
      pallets: sd.palUnknown && !sd.pallets ? null : sd.pallets, palMiss: !!(sd.palUnknown && sd.pallets), done: sd.sideDim === true };
  };
  // c = the raw cycle: the missing driver is read from the base's own field, never from the tile's words
  const truck = (r, c) => {
    const t = (r.tiles || [])[0] || { type: 'un' };
    const more = Math.max(0, (r.tiles || []).length - 1);
    if (t.type === 'par') return { kind: 'par', name: t.line1 || '—', more };
    if (t.type === 'own') { const nd = c ? !c.driver : false; return { kind: 'own', plate: String(t.line1 || '—').split(' · ')[0], name: nd ? '' : String(t.line2 || ''), noDriver: nd, more }; }   // the name stays the tile's: a segment's own driver
    return { kind: 'none' };
  };
  const days = [];
  for (const d of m.days || []) {
    const rows = [];
    for (const r of d.rows || []) {
      const c = r.kind === 'cycle' ? cycleOf.get(r.rtId) : null;
      const own = (r.tiles || []).some((t) => t.type === 'own');
      const dn = side(r.kath, c, r, 'dn'), up = side(r.anod, c, r, 'up');
      rows.push({ no: r.kind === 'cycle' ? (r.carried ? '' : (o.numbers && o.numbers.get(r.rtId)) || '') : '',
        // a trip of another week stands whole on this board, marked with that week's number (owner 8/11)
        away: r.away ? (o.weekNoOf ? o.weekNoOf(r.away.week) : r.away.week) : null,
        kind: r.kind, truck: truck(r, c), dn, up,
        // an own truck that goes down and has nothing to bring up; a partner's «μόνο κάθοδος» is a fact, not work
        // and only while it can still be given one: a descent already done is history, not work
        noUp: r.kind === 'cycle' && !!r.kath && !up && own && r.kath.sideDim !== true });
      // a load the same truck takes on the way (a rota): its own line, as on the board
      for (const x of r.rota || []) {
        const leg = { dates: lab(x.day, x.toDay), from: { name: (x.from && x.from.name) || '—', more: 0 }, to: { name: (x.to && x.to.name) || '—', more: 0 }, pallets: x.pallets == null ? null : x.pallets, palMiss: false,
          done: !!(x.to && x.to.dim === true) };
        rows.push({ no: '↳', kind: 'rota', truck: truck(r, c), dn: x.side === 'KATHODOS' ? leg : null, up: x.side === 'ANODOS' ? leg : null, noUp: false });
      }
    }
    // ahead = today or later, known only when the model knows today: an empty day that is over is not work
    days.push({ date: d.date, head: dayHead(d.date), today: d.date === today, ahead: today != null && d.date >= today, rows });
  }
  // The ledger: international pallets per day AT VEROIA. With a truck = the legs a cycle loads / unloads at its
  // Veroia stop (the base's own stops); without = the board's waiting VS rows, on the day they stand at Veroia
  // (descent: its loading day there) or are due there (ascent).
  const L = new Map();
  const cell = (day) => { if (!L.has(day)) L.set(day, { dn: { w: 0, done: true, n: 0, x: 0, items: [] }, up: { w: 0, done: true, n: 0, x: 0, items: [] } }); return L.get(day); };
  const rowOf = new Map();
  let noDay = 0;
  for (const d of m.days || []) for (const r of d.rows || []) if (r.kind === 'cycle') rowOf.set(r.rtId, r);
  for (const c of board.cycles || []) for (const s of c.stops || []) {
    if (!isHub(s)) continue;
    // the stop's day as the board has it: stop_day, else the day of its window (o.dayOf = WN5L.athensDay)
    const day = _isDay(s.stop_day) ? s.stop_day : (o.dayOf ? o.dayOf(s.planned_to) : null);
    const vs = (s.legs || []).some((l) => (l.kind === 'vs_import' && l.act === 'load') || (l.kind === 'vs_export' && l.act === 'unload'));
    // never dropped in silence: a Veroia stop with no day is counted and said under the ledger's title
    if (!_isDay(day)) { if (vs) noDay++; continue; }
    // a stop before the week that HAS a vehicle belongs to the earlier week's sheet (its trip stands on this board
    // whole, marked «W45»); one still without a vehicle is this week's overdue work and stays («Εκκρεμή»)
    if (day < week && s.has_vehicle === true) continue;
    for (const k of ['dn', 'up']) {
      const legs = (s.legs || []).filter((l) => (k === 'dn' ? l.kind === 'vs_import' && l.act === 'load' : l.kind === 'vs_export' && l.act === 'unload'));
      if (!legs.length) continue;
      const e = cell(day)[k], pal = _r1(legs.reduce((a, l) => a + _num(l.pallets), 0));
      // «με φορτηγό» only when the trip HAS a vehicle (the base's has_vehicle): a trip drawn «Χωρίς φορτηγό» is work
      if (s.has_vehicle === true) { e.w += pal; e.n++; if (s.executed !== true) e.done = false; continue; }
      const r = rowOf.get(c.rt_id), sd = r && (k === 'dn' ? r.kath : r.anod);
      const b = (sd && !sd.gap && _best(k === 'dn' ? sd.to : sd.from)) || { name: '—', more: 0 };
      const end = vsEnd([...new Set(legs.map((l) => l.order_id).filter((x) => x != null))]);
      e.x += pal; e.items.push({ name: b.name, more: b.more, pallets: pal, plates: end.plates, unread: end.unread });
    }
  }
  for (const d of m.days || []) for (const r of d.rows || []) {
    if (r.kind !== 'unassigned' || !r.vs) continue;
    const k = r.kath ? 'dn' : 'up', sd = r.kath || r.anod;
    const day = k === 'dn' ? (sd.day || sd.toDay) : (sd.toDay || sd.day);
    const e = cell(_isDay(day) ? day : '')[k];
    const b = _best(k === 'dn' ? sd.to : sd.from) || { name: '—', more: 0 };
    const p = r.group && r.group.order_id != null ? platesOf(r.group.order_id) : [];
    e.x += _num(sd.pallets);
    e.items.push({ name: b.name, more: b.more, pallets: sd.pallets, plates: p || [], unread: p === undefined });
  }
  const ledger = [];
  const old = [...L.keys()].filter((d) => d < week).sort();
  const sum = (ds, k, f) => _r1(ds.reduce((a, d) => a + L.get(d)[k][f], 0));
  const line = (label, note, ds, tone, isToday) => ({ label, note, today: !!isToday, tone,
    dn: { w: sum(ds, 'dn', 'w'), done: ds.some((d) => L.get(d).dn.n) && ds.every((d) => L.get(d).dn.done), x: sum(ds, 'dn', 'x'), items: ds.reduce((a, d) => a.concat(L.get(d).dn.items), []) },
    up: { w: sum(ds, 'up', 'w'), done: ds.some((d) => L.get(d).up.n) && ds.every((d) => L.get(d).up.done), x: sum(ds, 'up', 'x'), items: ds.reduce((a, d) => a.concat(L.get(d).up.items), []) } });
  const since = old.find(_isDay);
  if (old.length) ledger.push(line('Εκκρεμή', since ? 'από ' + (+since.slice(8, 10)) + '/' + (+since.slice(5, 7)) : '', old, 'am', false));
  for (let i = 0; i < 7; i++) { const d = _add(week, i); ledger.push(line(dayDm(d), d === today ? 'σήμερα' : '', L.has(d) ? [d] : [], '', d === today)); }
  [...L.keys()].filter((d) => d > last).sort().forEach((d) => ledger.push(line(dayDm(d), '', [d], '', false)));
  return { week: o.weekNo, range: o.range, stamp: o.stamp, ledger, days, noDay, platesUnread: ledger.some((l) => l.dn.items.concat(l.up.items).some((i) => i.unread)) || days.some((d) => d.rows.some((r) => [r.dn, r.up].some((x) => x && [x.from, x.to].some((e) => e.unread)))) };
}

function natlTally(p) {
  const rows = p.days.reduce((a, d) => a.concat(d.rows), []);
  return { trips: rows.filter((r) => r.kind === 'cycle').length,
    // counted by the red box drawn (a load no truck has taken, or a trip whose truck is still to be assigned)
    // a rota line shares its trip's truck: the missing truck is counted once, on the trip's own line
    dnNone: rows.filter((r) => r.kind !== 'rota' && r.truck.kind === 'none' && r.dn).length, upNone: rows.filter((r) => r.kind !== 'rota' && r.truck.kind === 'none' && r.up && !r.dn).length,
    noUp: rows.filter((r) => r.noUp).length, noDriver: rows.filter((r) => r.kind === 'cycle' && r.truck.noDriver).length,
    old: _r1(p.ledger.filter((l) => l.tone === 'am').reduce((a, l) => a + l.dn.x + l.up.x, 0)) };
}
function _endHTML(e, bold) {
  const more = e.more ? ` <span class="more">+${e.more}</span>` : '';
  // the plate(s) of the international truck; not read = said («διεθνές ;»); an order no truck has yet = «Βέροια»
  if (e.vs) return `<span class="vs">${e.plates.length ? `<span class="mono">${_esc(e.plates.join(' · '))}</span>` : (e.unread ? 'διεθνές ;' : 'Βέροια')}</span>${more}`;
  return (bold ? `<span class="cl">${_esc(e.name)}</span>` : _esc(e.name)) + more;
}
// Descent: the delivery point is the bold one; ascent: the loading point.
function _legHTML(l, kind) {
  if (!l) return '<td></td><td></td><td></td>';
  const g = l.done ? ' dn' : '';
  return `<td class="dt${g}">${l.done ? '<span class="tick">✓</span>' : ''}${_arrow(l.dates || '—')}</td>` +
    `<td class="${g.trim()}">${_endHTML(l.from, kind === 'up')}<span class="ar">→</span>${_endHTML(l.to, kind === 'dn')}</td><td class="p${g}">${_pal(l)}</td>`;
}
function _natTruckHTML(t) {
  if (!t || t.kind === 'none') return '<td class="tkc"><div class="tk x">Χωρίς φορτηγό</div></td>';
  const more = t.more ? `<span class="more">+${t.more}</span>` : '';
  if (t.kind === 'par') return `<td class="tkc"><div class="tk p"><span class="pl">ΣΥΝ</span><span class="dr">${_esc(t.name)}</span>${more}</div></td>`;
  return `<td class="tkc"><div class="tk"><span class="pl">${_esc(t.plate)}</span>${t.noDriver ? '<span class="gap">χωρίς οδηγό</span>' : `<span class="dr">${_esc(t.name)}</span>`}${more}</div></td>`;
}
function natlHTML(p) {
  const T = natlTally(p);
  const nRows = p.days.reduce((a, d) => a + d.rows.length, 0);
  // days with no trip print as ONE line per run («ΔΕΥΤΕΡΑ 9 – ΠΑΡΑΣΚΕΥΗ 13/11 · κανένα δρομολόγιο»), red from today on
  const groups = [];
  p.days.forEach((d) => { const g = groups[groups.length - 1]; if (!d.rows.length && g && g.empty) { g.to = d; g.today = g.today || d.today; g.ahead = g.ahead || d.ahead; } else groups.push({ empty: !d.rows.length, from: d, to: d, today: d.today, ahead: d.ahead, d }); });
  const sz = size(nRows + p.ledger.length, groups.length, PAGE.firstNatl);
  const body = [];
  for (const g of groups) {
    if (g.empty) {
      const head = g.from === g.to ? g.from.head : `${g.from.head.replace(/\/\d+$/, '')} – ${g.to.head}`;
      body.push(`<tr class="day${g.today ? ' today' : ''}"><td colspan="8">${_esc(head)}${g.today ? '<span class="t">από σήμερα</span>' : ''}<span class="${g.ahead ? 'w' : 'mu'}">κανένα δρομολόγιο</span></td></tr>`);
      continue;
    }
    const d = g.d, rows = d.rows;
    const n = rows.filter((r) => r.kind === 'cycle').length, x = rows.filter((r) => r.kind !== 'rota' && r.truck.kind === 'none').length;
    const w = [x && `${x} χωρίς φορτηγό`, rows.filter((r) => r.noUp).length && `${rows.filter((r) => r.noUp).length} χωρίς άνοδο`,
      rows.filter((r) => r.kind === 'cycle' && r.truck.noDriver).length && `${rows.filter((r) => r.kind === 'cycle' && r.truck.noDriver).length} χωρίς οδηγό`].filter(Boolean).map((s) => `<span class="w">${s}</span>`).join('');
    body.push(`<tr class="day${d.today ? ' today' : ''}"><td colspan="8">${_esc(d.head)}${d.today ? '<span class="t">σήμερα</span>' : ''}<span>${plural(n, 'δρομολόγιο', 'δρομολόγια')}</span>${w}</td></tr>`);
    rows.forEach((r, j) => {
      const cls = [j === 0 ? 'f' : '', j === rows.length - 1 ? 'l' : '', d.today ? 'td' : ''].filter(Boolean).join(' ');
      const no = r.away != null ? `<span class="more">W${_esc(r.away)}</span>` : _esc(r.no);
      const up = r.noUp ? '<td></td><td><span class="gap">Χωρίς άνοδο</span></td><td></td>' : _legHTML(r.up, 'up');
      body.push(`<tr class="${cls}"><td class="i">${no}</td>${_legHTML(r.dn, 'dn')}${_natTruckHTML(r.truck)}${up}</tr>`);
    });
  }
  const q = (v, cls) => (v ? `<td class="q ${cls || ''}">${v}</td>` : '<td class="q"><span class="none">—</span></td>');
  const items = (its) => its.map((i) => `<span class="it"><span class="vs x">${_esc(pointName(i.name))}${i.more ? ' +' + i.more : ''}</span>` +
    (its.length > 1 && i.pallets != null ? `<b>${_esc(i.pallets)} π.</b>` : '') + (i.plates.length ? `<span class="mono">${_esc(i.plates.join(' · '))}</span>` : i.unread ? '<span class="more"> διεθνές ;</span>' : '') + '</span>').join('');
  const led = p.ledger.map((l, j) => {
    const cls = [j === 0 ? 'f' : '', j === p.ledger.length - 1 ? 'l' : ''].filter(Boolean).join(' ');
    const wth = (e) => (e.w ? `<td class="q${e.done ? ' ok' : ''}">${e.done ? '✓ ' : ''}${e.w}</td>` : '<td class="q"><span class="none">—</span></td>');
    return `<tr class="${cls}"><td class="dd${l.today ? ' now' : ''}">${_esc(l.label)}<small>${_esc(l.note || '')}</small></td>${wth(l.dn)}${q(l.dn.x, l.tone || 'no')}<td>${items(l.dn.items)}</td>` +
      `${wth(l.up).replace('class="q', 'class="q sp')}${q(l.up.x, l.tone || 'no')}<td>${items(l.up.items)}</td></tr>`;
  }).join('');
  const act = [T.dnNone && [T.dnNone, T.dnNone === 1 ? 'κάθοδος χωρίς φορτηγό' : 'κάθοδοι χωρίς φορτηγό'], T.upNone && [T.upNone, T.upNone === 1 ? 'άνοδος χωρίς φορτηγό' : 'άνοδοι χωρίς φορτηγό'],
    T.noUp && [T.noUp, T.noUp === 1 ? 'δρομολόγιο χωρίς άνοδο' : 'δρομολόγια χωρίς άνοδο'], T.noDriver && [T.noDriver, 'χωρίς οδηγό']].filter(Boolean)
    .map(([n, s]) => `<span><b>${n}</b>${s}</span>`).join('') + (T.old ? `<span class="am"><b>${T.old} π.</b>εκκρεμή</span>` : '');
  const all = p.days.reduce((a, d) => a.concat(d.rows), []);
  const hasVs = all.some((r) => [r.dn, r.up].some((x) => x && (x.from.vs || x.to.vs)));
  const hasX = p.ledger.some((l) => l.dn.items.length || l.up.items.length);
  const legend = [hasVs && '<span><span class="vs"><span class="mono">IAZ8302</span></span>Veroia Switch · το διεθνές φορτηγό</span>',
    hasX && '<span><span class="vs x">Lidl Trikala</span>χωρίς εθνικό φορτηγό</span>',
    p.platesUnread && '<span>διεθνές ; = η πινακίδα δεν διαβάστηκε</span>',
    all.some((r) => r.truck.kind === 'par') && '<span><span class="tk p" style="display:inline-flex;height:auto;padding:1pt 4pt;margin-right:3pt"><span class="pl">ΣΥΝ</span></span>συνεργάτης</span>',
    all.some((r) => r.away != null) && `<span>W${_esc(all.find((r) => r.away != null).away)} δρομολόγιο άλλης εβδομάδας</span>`,
    '<span>✓ έγινε</span>', '<span>+1 ακόμη ένα σημείο ή φορτηγό</span>'].filter(Boolean);
  const title = `Εβδομάδα ${_esc(p.week)} · Εθνικά`;
  return `<link rel="stylesheet" href="${FONTS}" media="none" onload="this.media='all'"><style>${CSS}
@page { @bottom-left { content: "Petras Group TMS · ${title} · στοιχεία ${_esc(p.stamp)}"; font: 7pt 'DM Sans', sans-serif; color: #94A3B8; } }
.wp { --fs:${sz.fs}pt; --rh:${sz.rh}mm; }
.wp col.l-d{width:11.5%} .wp col.l-q{width:8.2%} .wp col.l-t{width:27.5%} .wp col.l-u{width:28.2%}
.wp col.k-i{width:2.8%} .wp col.k-dt{width:10.6%} .wp col.k-dn{width:25.5%} .wp col.k-p{width:3.2%} .wp col.k-tk{width:16.6%} .wp col.k-up{width:27.5%}
</style><div class="wp">
<header class="mast"><div><h1>Εβδομάδα ${_esc(p.week)} · <em>Εθνικά</em></h1><div class="sub">${_esc(p.range)} <i>· στοιχεία ${_esc(p.stamp)}</i></div></div>
<div class="kpi"><span class="big"><b>${T.trips}</b><span>${T.trips === 1 ? 'δρομολόγιο' : 'δρομολόγια'}</span></span></div></header>
<div class="act">${act ? '<label>ΘΕΛΟΥΝ ΔΡΑΣΗ</label>' + act : ''}</div>
<div class="h">ΒΕΡΟΙΑ · VEROIA SWITCH <span>παλέτες διεθνών ανά ημέρα στη Βέροια</span>${p.noDay ? `<span style="color:var(--red);font-weight:700">${p.noDay} ${p.noDay === 1 ? 'στάση Βέροιας χωρίς ημέρα δεν μετρήθηκε' : 'στάσεις Βέροιας χωρίς ημέρα δεν μετρήθηκαν'}</span>` : ''}</div>
<table class="b"><colgroup><col class="l-d"><col class="l-q"><col class="l-q"><col class="l-t"><col class="l-q"><col class="l-q"><col class="l-u"></colgroup>
<thead><tr><th></th><th class="vh g" colspan="3">ΚΑΘΟΔΟΣ · ΑΠΟ ΒΕΡΟΙΑ</th><th class="vh g sp" colspan="3">ΑΝΟΔΟΣ · ΠΡΟΣ ΒΕΡΟΙΑ</th></tr>
<tr><th></th><th class="q">ΜΕ ΦΟΡΤΗΓΟ</th><th class="q">ΧΩΡΙΣ ΦΟΡΤΗΓΟ</th><th>ΠΡΟΣ · ΔΙΕΘΝΕΣ ΦΟΡΤΗΓΟ</th><th class="q sp">ΜΕ ΦΟΡΤΗΓΟ</th><th class="q">ΧΩΡΙΣ ΦΟΡΤΗΓΟ</th><th>ΑΠΟ · ΔΙΕΘΝΕΣ ΦΟΡΤΗΓΟ</th></tr></thead>
<tbody>${led}</tbody></table>
<div class="h">ΔΡΟΜΟΛΟΓΙΑ <span>ανά ημέρα, όπως στον πίνακα</span></div>
<table class="b"><colgroup><col class="k-i"><col class="k-dt"><col class="k-dn"><col class="k-p"><col class="k-tk"><col class="k-dt"><col class="k-up"><col class="k-p"></colgroup>
<thead><tr><th></th><th>ΦΟΡΤ. → ΠΑΡ.</th><th>ΚΑΘΟΔΟΣ</th><th class="r">Π.</th><th>ΦΟΡΤΗΓΟ</th><th>ΦΟΡΤ. → ΠΑΡ.</th><th>ΑΝΟΔΟΣ</th><th class="r">Π.</th></tr></thead>
<tbody>${body.join('')}</tbody></table>
<div class="legend">${legend.join('')}</div>
</div>`;
}

const WeekPaper = Object.freeze({ intlHTML, natlHTML, natlModel, natlTally, size, tally, pointName, dayShort, PAGE });
if (typeof module !== 'undefined') module.exports = WeekPaper; else window.WeekPaper = WeekPaper;
})();
