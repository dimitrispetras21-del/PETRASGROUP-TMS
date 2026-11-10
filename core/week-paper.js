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
const PAGE = Object.freeze({ first: 158, next: 185, minRow: 4.4, maxRow: 6.6, dayUnits: 1.3 });
function size(nRows, nDays) {
  const units = Math.max(1, nRows + PAGE.dayUnits * nDays);
  let pages = 1, rh = PAGE.first / units;
  // .975: a row never breaks in two, so each page boundary wastes up to a part of a row
  while (rh < PAGE.minRow && pages < 12) { pages++; rh = (PAGE.first + (pages - 1) * PAGE.next) * 0.975 / units; }
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
.wp .b td.p { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
.wp .cl { font-weight: 700; }
.wp .ar { color: var(--mut); margin: 0 .25em; }
.wp .more { color: var(--body); font-size: .88em; font-weight: 500; }
/* delivered: readable grey with a tick, never faint */
.wp .b td.dn, .wp .b td.dn .cl, .wp .b td.dn .ar, .wp .b td.dn .more { color: var(--done); font-weight: 400; }
.wp .tick { margin-right: .25em; }
.wp .b td.tkc { padding: 0 .35em; }
.wp .tk { display: flex; align-items: center; gap: .55em; background: var(--tk); border-radius: 2pt; height: calc(var(--rh) - 1.1mm); line-height: 1;
  padding: 0 .6em; overflow: hidden; }
.wp .tk .pl { font: 500 .97em 'DM Mono', monospace; color: var(--navy); }
.wp .tk .dr { color: var(--body); font-size: .93em; overflow: hidden; text-overflow: ellipsis; }
.wp .tk.p { background: #DCFCE7; }
.wp .tk.p .pl { font: 700 .8em 'DM Sans', sans-serif; letter-spacing: .08em; color: var(--green); }
.wp .tk.p .dr { color: var(--green); font-weight: 500; }
.wp .tk.x { background: none; border: .9pt dashed var(--red); color: var(--red); font-weight: 700; }
.wp .gap { display: inline-block; border: .9pt dashed var(--red); color: var(--red); font-weight: 700; border-radius: 2pt; padding: 0 .55em; line-height: 1.32; vertical-align: middle; }
.wp .gap.am { border-color: var(--amber); color: var(--amber); margin-left: .35em; }
.wp .vs { display: inline-block; background: var(--vs); color: var(--vsink); font-weight: 700; border-radius: 2pt; padding: 0 .5em; line-height: 1.36;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; border: .9pt solid var(--vs); }
.wp .vs.ok { background: #EEF2F7; border-color: #EEF2F7; color: var(--done); font-weight: 500; }
.wp .vs.x { border: .9pt dashed var(--red); }
.wp .vs.q { background: none; border: .9pt dashed var(--mut); color: var(--body); }
.wp .legend { margin-top: 5pt; font-size: 7.2pt; color: var(--body); display: flex; gap: 14pt; align-items: center; white-space: nowrap; }
.wp .legend .vs, .wp .legend .gap { font-size: 7pt; margin: 0 3pt 0 0; }
`;

// state: 'done' (the national part ran) · 'plan' (a national truck has it) · 'none' (no national truck) ·
// 'unknown' (the national read has not answered: never drawn as «no truck», unknown ≠ empty)
function vsHTML(v) {
  if (!v) return '';
  const cls = { done: ' ok', none: ' x', unknown: ' q' }[v.state] || '';
  const more = v.more ? ' +' + v.more : '';
  return `<span class="vs${cls}">${v.state === 'done' ? '✓ ' : ''}${_esc(pointName(v.name))}${more}</span>`;
}
// x = an export or import side: {client, dest, more, piece, lot, pre}. An import pre-order has no place yet and
// is drawn by rowHTML (client + tag); an export pre-order keeps its route and gets the tag after it. «ΑΠ» = a piece taken from stock; a lot goes
// to the warehouse, not to the client (the marks of the old week sheet, impact map 4/10 PR-10).
function sideHTML(x) {
  const m = x.more ? ` <span class="more">+${x.more}</span>` : '';
  return `${x.piece ? '<span class="more">ΑΠ</span> ' : ''}<span class="cl">${_esc(x.client || '—')}</span><span class="ar">→</span>${_esc(x.dest || '—')}${m}` +
    (x.lot ? ' <span class="more">→ ΑΠΟΘΗΚΗ</span>' : '') + (x.pre ? ' <span class="gap am">Pre-order</span>' : '');
}
function truckHTML(t) {
  if (!t || t.kind === 'none') return '<td class="tkc"><div class="tk x">Χωρίς φορτηγό</div></td>';
  if (t.kind === 'par') return `<td class="tkc"><div class="tk p"><span class="pl">ΣΥΝ</span><span class="dr">${_esc(t.name || '—')}</span></div></td>`;
  return `<td class="tkc"><div class="tk"><span class="pl">${_esc(t.plate || '—')}</span><span class="dr">${_esc(t.name || '')}</span></div></td>`;
}
// unknown pallets are «—», never 0; a group with a member off the record says «22+;» (the board's «22 +?»)
const _unk = (x) => x.pallets == null || x.pallets === '';
const _pal = (x) => (_unk(x) ? '—' : _esc(x.pallets) + (x.palMiss ? '<span class="more">+;</span>' : ''));
const _arrow = (s) => _esc(s).replace(/ → /g, '<span class="ar">→</span>');

function rowHTML(r, cls) {
  const ex = r.ex, im = r.im;
  const c = [`<td class="i">${_esc(r.no == null ? '' : r.no)}</td>`, `<td>${vsHTML(r.up)}</td>`];
  if (ex) {
    const g = ex.done ? ' dn' : '';
    c.push(`<td class="dt${g}">${ex.done ? '<span class="tick">✓</span>' : ''}${_esc(ex.date || '—')}</td>`,
      `<td class="${g.trim()}">${sideHTML(ex)}</td>`, `<td class="p${g}">${_pal(ex)}</td>`);
  } else c.push('<td></td><td></td><td></td>');
  c.push(truckHTML(r.truck));
  if (r.gap) c.push('<td></td>', '<td><span class="gap">Κενό γύρισμα</span></td>', '<td></td>');
  else if (im && im.unread) c.push('<td></td>', '<td><span class="gap am" style="margin-left:0">Εισαγωγή εκτός προβολής</span></td>', '<td></td>');
  else if (im) {
    const g = im.done ? ' dn' : '';
    const txt = im.pre ? `<span class="cl">${_esc(im.client || '—')}</span> <span class="gap am">Pre-order</span>` : sideHTML(im);
    c.push(`<td class="dt${g}">${im.done ? '<span class="tick">✓</span>' : ''}${_arrow(im.dates || '—')}</td>`,
      `<td class="${g.trim()}">${txt}</td>`, `<td class="p${g}">${im.pre && !(+im.pallets > 0) ? '' : _pal(im)}</td>`);   // a pre-order's 0 is nobody's count
  } else c.push('<td></td><td></td><td></td>');
  c.push(`<td>${vsHTML(r.dn)}</td>`);
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

/** p = { week, range, stamp, days: [{ head, today, rows: [row] }] }; row = { no, up, ex, truck, im, gap, dn }
 *  (see rowHTML / vsHTML / sideHTML for the fields; a side's pallets: null = unknown, palMiss = partly known;
 *  a row may carry `rid`, the board row's id: never printed, the board rig compares the two row by row). Days without rows are not printed. */
function intlHTML(p) {
  const days = (p.days || []).filter((d) => d.rows && d.rows.length);
  const all = days.reduce((a, d) => a.concat(d.rows), []);
  const sz = size(all.length, days.length), T = tally(all);
  const body = [];
  for (const d of days) {
    const t = tally(d.rows);
    const w = workWords(t).map(([c, s]) => `<span class="w${c}">${s}</span>`).join('');
    // a day with imports only (they load that day) says so, never «0 εξαγωγές · 0 π.»
    const head = t.exports ? `${plural(t.exports, 'εξαγωγή', 'εξαγωγές')} · ${t.pallets} π.${t.palUnknown ? ' +;' : ''}` : plural(d.rows.length, 'εισαγωγή', 'εισαγωγές');
    body.push(`<tr class="day${d.today ? ' today' : ''}"><td colspan="10">${_esc(d.head)}${d.today ? '<span class="t">σήμερα</span>' : ''}` +
      `<span>${head}</span>${w}</td></tr>`);
    d.rows.forEach((r, j) => body.push(rowHTML(r, [j === 0 ? 'f' : '', j === d.rows.length - 1 ? 'l' : '', d.today ? 'td' : ''].filter(Boolean))));
  }
  const act = workWords(T).map(([c, s]) => { const i = s.indexOf(' '); return `<span class="${c.trim()}"><b>${s.slice(0, i)}</b>${s.slice(i + 1)}</span>`; }).join('');
  const title = `Εβδομάδα ${_esc(p.week)} · Διεθνή`;
  // The legend explains only what this sheet holds: a mark that is not on the page is not a line to read.
  const hasVs = all.some((r) => r.up || r.dn);
  const legend = [
    hasVs && '<span><span class="vs">Irinoupoli Sud</span>Veroia Switch · το σημείο του εθνικού</span>',
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
.wp col.k-i{width:1.8%} .wp col.k-up{width:12.8%} .wp col.k-ed{width:5%} .wp col.k-ex{width:20.8%} .wp col.k-p{width:2.8%} .wp col.k-tk{width:14.4%} .wp col.k-id{width:9.4%} .wp col.k-im{width:19%} .wp col.k-dn{width:11.2%}
</style><div class="wp">
<header class="mast"><div><h1>Εβδομάδα ${_esc(p.week)} · <em>Διεθνή</em></h1><div class="sub">${_esc(p.range)} <i>· στοιχεία ${_esc(p.stamp)}</i></div></div>
<div class="kpi"><span class="big"><b>${T.exports}</b><span>${T.exports === 1 ? 'εξαγωγή' : 'εξαγωγές'}</span></span><span class="mid"><b>${T.pallets}</b><span>π.${T.palUnknown ? ' +;' : ''}</span></span></div></header>
<div class="act">${act ? '<label>ΘΕΛΟΥΝ ΔΡΑΣΗ</label>' + act : ''}</div>
<table class="b"><colgroup><col class="k-i"><col class="k-up"><col class="k-ed"><col class="k-ex"><col class="k-p"><col class="k-tk"><col class="k-id"><col class="k-im"><col class="k-p"><col class="k-dn"></colgroup>
<thead><tr><th></th><th class="vh">ΑΝΟΔΟΣ · ΑΠΟ</th><th>ΦΟΡΤΩΣΗ</th><th>ΕΞΑΓΩΓΗ <small>· ανά ημέρα παράδοσης</small></th><th class="r">Π.</th><th>ΦΟΡΤΗΓΟ</th><th>ΦΟΡΤ. → ΠΑΡ.</th><th>ΕΙΣΑΓΩΓΗ</th><th class="r">Π.</th><th class="vh">ΚΑΘΟΔΟΣ · ΠΡΟΣ</th></tr></thead>
<tbody>${body.join('')}</tbody></table>
<div class="legend">${legend.join('')}</div>
</div>`;
}

const WeekPaper = Object.freeze({ intlHTML, size, tally, pointName, PAGE });
if (typeof module !== 'undefined') module.exports = WeekPaper; else window.WeekPaper = WeekPaper;
})();
