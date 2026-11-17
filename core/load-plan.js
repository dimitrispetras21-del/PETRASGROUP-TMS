// ═══════════════════════════════════════════════════════════════════════════
// HOW A REEFER BOX IS LOADED — capacity and row layout by pallet type (owner 17/11/2026).
//
// Why one file: every screen counted a truck as a flat 33 pallets. 33 is true only for euro pallets; industrial
// pallets take more room, so a mixed load fits fewer. The rules live here, plain functions, no DOM, so the form panel
// (and later the Weekly, Εθνικά v5, the base's over_33 warning) all count the same way (principle 3).
//
// The owner's rules (17/11):
//   - box 13.2 m long × 2.4 m wide. Lengths are kept in decimetres (integers) so no float rounding moves a row.
//   - euro 0.8 × 1.2 (CHEP is the same size). Rows: «μαχαίρι» (knife) 3 across, 1.2 m; «διπλή» (double) 2 across,
//     0.8 m; «μονή» (single) 1 pallet flat in the middle, 0.8 m.
//   - industrial 1.0 × 1.2, only two across: a row is 1.0 m with 2 pallets; an odd one stands alone in its 1.0 m row.
//   - singles only at the front, alternating and starting AND ending with a double: D S D S … D. Then knife. Knife is
//     preferred over double; extra doubles only to make the count work. Never end with a single.
//   - why singles exist: the load spreads along the box and is not front-heavy. «Σαν να βάλαμε 2 έξτρα παλέτες με 2
//     μονές»: a single holds 1 pallet in the room of 2. As many singles as fit up to 12.8 m, never to the doors (the
//     room at the back is for the bars): euro + singles ≤ 32. 32 pallets go without singles (front-heavy is
//     acceptable there); 31 and below take them.
//   - industrials at the front by the cab; an odd one shares its row with a flat euro («δόντι»), staggered doubles
//     after it. A lone pallet in the last row stands at a wall; earlier, a euro single stays in the middle.
//     Details at plan().
// Knife (3 per 12 dm) and double (2 per 8 dm) both take 4 dm a pallet, which is why the 33 holds and why a single
// costs exactly one pallet of room.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const BOX = 132;                       // dm
const ROW = Object.freeze({ K: 12, D: 8, S: 8, I: 10 });
const PER = { K: 3, D: 2, S: 1 };

// 'Industrial' → industrial; EUR, CHEP and empty (the form's default) → euro.
function isInd(type) { return /^ind/i.test(String(type == null ? '' : type).trim()); }
// A part pallet still takes a place.
const n0 = v => { const x = Math.ceil(Number(v) || 0); return x > 0 ? x : 0; };

// The most euro pallets that fit in len dm: max 3k + 2d with 12k + 8d ≤ len.
function euroFill(len) {
  let best = 0;
  for (let k = 0; 12 * k <= len; k++) best = Math.max(best, 3 * k + 2 * Math.floor((len - 12 * k) / 8));
  return best;
}
const I_MAX = Math.floor(BOX / ROW.I);   // 13 industrial rows
function indRowsFit(ind) { return Math.min(Math.ceil(n0(ind) / 2), I_MAX); }

// The euro rows for e pallets in len dm, front to back, or null for e = 1 (one pallet makes no double; plan() puts
// it alone as a single, at the wall since it is the last row).
// Most singles first (spread), then most knife; extra doubles right after the D S … D block.
// From 32 up no singles (owner 17/11: «32 παλ είναι οκ το μπροστοβαρο. 31 και κάτω θέλει μονή»).
const NO_SINGLE_FROM = 32;
// Singles spread the load to 12.8 m (the room of 32), never to the doors: «ο στόχος είναι να φτάσουμε τις 32, άρα τα
// 12,8 μέτρα. Όχι έως πίσω για ασφάλεια» (owner 17/11). So 29 EUR → 3 singles.
const SAFE = 4;   // dm left free at the back when singles are used
function euroRows(e, len) {
  if (e === 0) return [];
  for (let s = e >= NO_SINGLE_FROM ? 0 : Math.max(0, Math.floor((e - 2) / 3)); s >= 0; s--) {
    const rest = s ? e - (3 * s + 2) : e;
    const front = s ? 16 * s + 8 : 0;
    for (let k = Math.floor(rest / 3); k >= 0; k--) {
      if ((rest - 3 * k) % 2) continue;
      const d = (rest - 3 * k) / 2;
      if (front + 12 * k + 8 * d > (s ? len - SAFE : len)) continue;
      const rows = [];
      for (let j = 0; j < s; j++) rows.push('D', 'S');
      if (s) rows.push('D');
      for (let j = 0; j < d; j++) rows.push('D');
      for (let j = 0; j < k; j++) rows.push('K');
      return rows;
    }
  }
  return null;
}

// Industrials only (owner 17/11): «μόνο αν το φορτίο είναι μόνο βιομηχανικές και είναι λίγες αναγκαστικά βάζουμε
// μονές στην αρχή». Same shape as the euro singles: 2-1-2-1-…-2 at the front, then pairs, as many singles as 12 rows
// allow (never to the doors); an odd one left over closes the load. A lone industrial always stands against a side wall, never in
// the middle (it could fall). → pallets per row, front to back.
// «Λίγες» = up to 20 (owner 17/11 «Πάνω από 20»): from 21 industrials no singles, pairs only.
const IND_SINGLES_UP_TO = 20;
function indOnly(i) {
  for (let s = i > IND_SINGLES_UP_TO ? 0 : Math.max(0, Math.floor((i - 2) / 3)); s >= 0; s--) {
    const rest = s ? i - (3 * s + 2) : i;
    // with singles, at most 12 rows (12.0 m): the room at the back stays for the bars, as with the euro
    if ((s ? 2 * s + 1 : 0) + Math.ceil(rest / 2) > (s ? I_MAX - 1 : I_MAX)) continue;
    const rows = [];
    for (let j = 0; j < s; j++) rows.push(2, 1);
    if (s) rows.push(2);
    for (let j = 0; j < Math.floor(rest / 2); j++) rows.push(2);
    if (rest % 2) rows.push(1);
    return rows;
  }
  return [];
}

// The layout of one load. counts = { eur, ind } in pallets.
// Industrials at the front by the cab, euro behind, the free room always at the back for the bars that hold the load
// still (owner 17/11, sketch + «Ναι, μπροστά»).
// An odd number of industrials with euro on board (owner 17/11): the last industrial shares its 1.0 m row with one
// euro pallet laid flat beside it (1.2 + 1.2 = 2.4 m across). The euro is 0.8 long, so that side of the box is 0.2 m
// ahead of the other («δόντι»). A gap between rows lets the first pallet tip forward and the rest follow like
// dominoes (owner 17/11), so after that row the euro go as doubles, staggered: each side flush against the pallet in
// front of it, the 0.2 m coming out at the back with the room for the bars. No knife or single there: «η πλάκα θα
// ήταν πιο εύκολη και στην αντίληψη του χώρου» (owner 17/11).
// → { rows: [{ k: 'K'|'D'|'S'|'I'|'X', n, at, len, stag?, wall? }], eur, ind, total, cap, over, used }
//   n = pallets in the row (X: 2, one of each); at = dm from the front of the box; stag = dm the euro side of a row
//   sits ahead of the other; over = pallets that do not fit (shown as a warning, never a refusal).
function plan(counts) {
  const eur = n0(counts && counts.eur), ind = n0(counts && counts.ind);
  const ir = indRowsFit(ind);
  const iFit = Math.min(ind, 2 * ir);
  const room = BOX - ir * ROW.I;
  const odd = iFit % 2;
  // Beside an odd industrial: the flat euro + one pallet a side every 0.8 m (the euro side starts 0.2 m earlier).
  // That place counts in the capacity even while no euro is on board yet.
  const eMax = odd ? 1 + Math.floor(room / 8) + Math.floor((room + 2) / 8) : euroFill(room);
  const cap = iFit + eMax;
  const over = (ind - iFit) + Math.max(0, eur - eMax);
  const eFit = Math.min(eur, eMax);
  let iRows = [];
  if (!eur && iFit) iRows = indOnly(iFit).map(n => ({ k: 'I', n }));
  else for (let j = 0; j < ir; j++) iRows.push(j === ir - 1 && odd ? { k: 'X', n: 2 } : { k: 'I', n: 2 });
  let eRows;
  if (odd && eFit) {
    eRows = [];
    for (let j = 0; j < Math.floor((eFit - 1) / 2); j++) eRows.push({ k: 'D', n: 2, stag: 2 });
    // the odd one left goes on the euro side, which is 0.2 m ahead: the other side may already be full (room 6 mod 8)
    if ((eFit - 1) % 2) eRows.push({ k: 'S', n: 1, stag: 2 });
  } else {
    // Over capacity: a full box of what fits, no singles (euroRows of the max has none, the length is used up).
    // One euro pallet makes no double: it goes alone, as a single.
    eRows = (euroRows(eFit, room) || ['S']).map(k => ({ k, n: PER[k] }));
  }
  let at = 0;
  const rows = iRows.concat(eRows).map(r => {
    const len = r.k === 'X' ? ROW.I : ROW[r.k];
    const o = Object.assign({}, r, { at, len });
    at += len;
    return o;
  });
  // A single in the last row stands against the side wall: nothing behind it holds it (owner 17/11 «αν είναι
  // τελευταία, πάντα τοίχο· αν είναι πιο νωρίς, όπου δεν μπορούμε να βάλουμε μπάρες, μπαίνει μέσα»).
  // Why: a single earlier in the box is held by the rows around it, and in the middle it sways less and keeps the
  // box evenly weighted left / right; the last one has nothing behind it but the bars, so it leans on a wall.
  const last = rows[rows.length - 1];
  if (last && last.k === 'S') last.wall = true;
  // the euro side of a staggered load ends stag dm earlier
  if (last && last.stag) at = Math.max(at - last.stag, rows.length > 1 ? rows[rows.length - 2].at + rows[rows.length - 2].len : 0);
  return { rows, eur, ind, total: eur + ind, cap, over, used: at };
}
// Capacity for this mix = the industrials + the euro that fit in the length they leave (+ the one beside an odd
// industrial). 33 euro only, 26 industrial only, 32 for 20 euro + 4 industrial (the owner's example).
function capacity(counts) { return plan(counts).cap; }

// The box seen from above as an SVG string (no DOM, so the panel and a print page draw the same picture).
// Front (cab) on the left. A knife pallet lies 1.2 along × 0.8 across; double / single 0.8 along × 1.2 across;
// industrial 1.0 along × 1.2 across. Each row carries its letter underneath: Μ(αχαίρι) Δ(ιπλή) Ο(=μονή) Β(ιομηχανική).
const TAG = { K: 'Μ', D: 'Δ', S: 'Ο', I: 'Β', X: 'Β+Π' };
function svg(p, opts) {
  const sc = (opts && opts.scale) || 2.2, W = BOX * sc, H = 24 * sc, top = 14, lab = 12;
  const out = [];
  const rect = (x, y, w, h, cls) => out.push(`<rect class="${cls}" x="${(x * sc).toFixed(1)}" y="${(top + y * sc).toFixed(1)}" width="${(w * sc - 1).toFixed(1)}" height="${(h * sc - 1).toFixed(1)}" rx="1.5"/>`);
  for (const r of p.rows) {
    if (r.k === 'K') for (let j = 0; j < 3; j++) rect(r.at, j * 8, 12, 8, 'lp-e');
    // a staggered double: the side behind the flat euro (lower half) sits stag dm ahead, flush against it
    else if (r.k === 'D') for (let j = 0; j < 2; j++) rect(r.at - (j ? r.stag || 0 : 0), j * 12, 8, 12, 'lp-e');
    // a last single at a wall; after the «δόντι» on the euro side (lower half), flush against the pallet in front
    else if (r.k === 'S') rect(r.at - (r.stag || 0), r.stag ? 12 : r.wall ? 0 : 6, 8, 12, 'lp-e lp-s');
    else if (r.k === 'X') { rect(r.at, 0, 10, 12, 'lp-i'); rect(r.at, 12, 8, 12, 'lp-e'); }   // flat euro flush to the front
    else for (let j = 0; j < r.n; j++) rect(r.at, j * 12, 10, 12, 'lp-i');   // a lone industrial against the wall, never in the middle (owner 17/11)
    out.push(`<text class="lp-t" x="${((r.at + r.len / 2) * sc).toFixed(1)}" y="${top + H + lab - 2}" text-anchor="middle">${TAG[r.k]}</text>`);
  }
  const free = BOX - p.used;
  return `<svg class="lp" viewBox="-1 0 ${W + 2} ${top + H + lab}" width="100%" role="img" aria-label="${esc(aria(p))}">` +
    `<style>.lp-box{fill:none;stroke:#0B1929;stroke-width:1.5}.lp-cab{fill:#0B1929}.lp-e{fill:#BAE6FD;stroke:#0369A1;stroke-width:.8}` +
    `.lp-s{fill:#E0F2FE;stroke-dasharray:2 1.5}.lp-i{fill:#FDE68A;stroke:#B45309;stroke-width:.8}` +
    `.lp-t{font:600 8px 'DM Sans',sans-serif;fill:#64748B}.lp-h{font:700 8px 'DM Sans',sans-serif;fill:#475569}</style>` +
    `<text class="lp-h" x="0" y="9">◀ ΚΑΜΠΙΝΑ</text><text class="lp-h" x="${W}" y="9" text-anchor="end">ΠΟΡΤΕΣ</text>` +
    `<rect class="lp-box" x="0" y="${top - 0.5}" width="${W}" height="${H}" rx="2"/>` + out.join('') +
    (free >= 28 ? `<text class="lp-t" x="${((p.used + free / 2) * sc).toFixed(1)}" y="${top + H / 2 + 3}" text-anchor="middle">${(free / 10).toFixed(1).replace('.', ',')} μ ελεύθερα</text>` : '') +
    `</svg>`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
// «5 μαχαίρι · 5 διπλές · 4 μονές» — the words for the row counts (and the drawing's label for a screen reader).
function aria(p) {
  const c = { K: 0, D: 0, S: 0, I: 0, X: 0 };
  p.rows.forEach(r => { c[r.k]++; });
  return [c.K ? c.K + ' μαχαίρι' : '', c.D ? c.D + (c.D === 1 ? ' διπλή' : ' διπλές') : '', c.S ? c.S + (c.S === 1 ? ' μονή' : ' μονές') : '',
    c.I ? c.I + (c.I === 1 ? ' σειρά βιομηχανικές' : ' σειρές βιομηχανικές') : '', c.X ? '1 βιομηχανική + πλάκα' : ''].filter(Boolean).join(' · ');
}

const LoadPlan = Object.freeze({ BOX, ROW, isInd, euroFill, capacity, euroRows, plan, svg, words: aria });
if (typeof module !== 'undefined' && module.exports) module.exports = LoadPlan;
else globalThis.LoadPlan = LoadPlan;
})();
