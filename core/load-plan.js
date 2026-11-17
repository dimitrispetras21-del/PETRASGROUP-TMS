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
// Most singles first (spread), then most knife; extra doubles right after the D S … D block. noSingles: a euro run
// that is not the first one in the box (singles go only at the front of the euro).
// From 32 up no singles (owner 17/11: «32 παλ είναι οκ το μπροστοβαρο. 31 και κάτω θέλει μονή»).
const NO_SINGLE_FROM = 32;
// Singles spread the load to 12.8 m (the room of 32), never to the doors: «ο στόχος είναι να φτάσουμε τις 32, άρα τα
// 12,8 μέτρα. Όχι έως πίσω για ασφάλεια» (owner 17/11). So 29 EUR → 3 singles.
const SAFE = 4;   // dm left free at the back when singles are used
function euroRows(e, len, noSingles) {
  if (e === 0) return [];
  for (let s = noSingles || e >= NO_SINGLE_FROM ? 0 : Math.max(0, Math.floor((e - 2) / 3)); s >= 0; s--) {
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

// The layout of one load, as a sequence of parts from the cab to the doors.
// The order of the parts is the order of DELIVERY, read backwards: «φορτώνουμε με τον τρόπο που πρέπει να αδειάσει,
// last in, first out» (owner 17/11). The first delivery stands at the doors, the last one at the cab. A form with no
// order of its own (plan() below) puts the industrials first, by the cab (owner 17/11 «Ναι, μπροστά»).
// Consecutive parts of the same kind form one run; the row rules apply to a run, and a row may hold pallets of two
// parts (a knife row: 2 of one delivery, 1 of the next).
// An odd number of industrials with euro after them (owner 17/11): the last industrial shares its 1.0 m row with one
// euro pallet laid flat beside it (1.2 + 1.2 = 2.4 m across). The euro is 0.8 long, so that side of the box is 0.2 m
// ahead of the other («δόντι»). A gap between rows lets the first pallet tip forward and the rest follow like
// dominoes (owner 17/11), so after that row the euro go as doubles, staggered: each side flush against the pallet in
// front of it. No knife or single there: «η πλάκα θα ήταν πιο εύκολη και στην αντίληψη του χώρου» (owner 17/11).
// A lone pallet in the last row stands against a side wall (nothing behind it but the bars); a lone industrial
// always does, never in the middle (it could fall).
// parts: [{ n, ind }] cab → doors. → { rows: [{ k: 'K'|'D'|'S'|'I'|'X', n, at, len, stag?, wall?, cells }], used,
//   placed, dropped }. cells: [{ part, ind?, x, y, w, h }] in dm, x along the box from the row's start (a staggered cell
//   is at −2), y across (0 = one side wall, 24 = the other). dropped = pallets that do not fit after the last row.
function minLen(run) { return run.ind ? Math.ceil(run.n / 2) * ROW.I : run.n === 1 ? 8 : 4 * run.n; }
function layout(parts) {
  const P = (parts || []).map((x, i) => ({ i, n: n0(x && x.n), ind: !!(x && x.ind) })).filter(x => x.n);
  const runs = [];
  for (const x of P) {
    const r = runs[runs.length - 1];
    if (r && r.ind === x.ind) { r.n += x.n; for (let j = 0; j < x.n; j++) r.q.push(x.i); }
    else runs.push({ ind: x.ind, n: x.n, q: Array(x.n).fill(x.i) });
  }
  const onlyInd = runs.length === 1 && runs[0].ind;
  const rows = [];
  let at = 0, stag = 0, firstEuro = true, dropped = 0, tailStag = 0;   // tailStag: the euro run before ended staggered
  const deferred = [];   // lone euro pallets that would leave a front-back gap: they go to the doors (below)
  const push = (k, cells, len, extra) => { rows.push(Object.assign({ k, n: cells.length, at, len, cells }, extra)); at += len; };
  const cell = (part, x, y, w, h, ind) => Object.assign({ part, x, y, w, h }, ind ? { ind: true } : {});
  for (let ri = 0; ri < runs.length; ri++) {
    const r = runs[ri], take = () => r.q.shift();
    if (r.ind) {
      stag = 0;
      // After staggered euro the two sides end 0.2 m apart. A front-back gap there is a sure fall (owner 17/11), so
      // the first industrial on the short side is turned (1.2 m along, 1.0 m across): both sides end level. It goes
      // flush against the industrial beside it, «ώστε να μη μείνει χώρος ανάμεσα στις παλέτες»; the 0.2 m stays at
      // the wall, to the side (owner 17/11).
      if (tailStag && !onlyInd && r.q.length >= 2 && BOX - at >= ROW.I) {
        push('I', [cell(take(), 0, 0, 10, 12, 1), cell(take(), -tailStag, 12, ROW.I + tailStag, 10, 1)], ROW.I, { turned: true });
      }
      tailStag = 0;
      // what fits: whole rows up to the doors
      const fitRows = Math.floor((BOX - at) / ROW.I);
      const pat = (onlyInd ? indOnly(Math.min(r.q.length, 2 * I_MAX)) : Array(Math.floor(r.q.length / 2)).fill(2).concat(r.q.length % 2 ? [1] : [])).slice(0, fitRows);
      for (const m of pat) {
        if (m === 2) { push('I', [cell(take(), 0, 0, 10, 12, 1), cell(take(), 0, 12, 10, 12, 1)], ROW.I); continue; }
        const nx = runs[ri + 1];
        if (!onlyInd && nx && !nx.ind && nx.q.length) {
          push('X', [cell(take(), 0, 0, 10, 12, 1), cell(nx.q.shift(), 0, 12, 8, 12)], ROW.I);
          stag = 2;
        } else push('I', [cell(take(), 0, 0, 10, 12, 1)], ROW.I);   // lone: at the wall
      }
      dropped += r.q.length; r.q.length = 0;
      continue;
    }
    if (stag) {
      // after the «δόντι»: one pallet a side every 0.8 m, the euro side (lower) 0.2 m ahead
      const top = Math.floor((BOX - at) / 8);   // the euro side holds this many or one more
      for (let j = 0; j < top && r.q.length >= 2; j++) push('D', [cell(take(), 0, 0, 8, 12), cell(take(), -stag, 12, 8, 12)], 8, { stag });
      // The odd one left. Last in the box: on the euro side, which is 0.2 m ahead (the other side may be full).
      // With more rows after it, a lone pallet there leaves a gap front-to-back on the other side, and «λόγω των
      // φρεναρισμάτων και του γκαζιού θα έχει συνεχώς ταλάντωση … είναι σίγουρο ότι θα πέσει»; a gap to the side
      // is harmless (owner 17/11). So it goes to the doors, against the wall, behind the bars.
      if (r.q.length) {
        if (ri < runs.length - 1) deferred.push(take());
        else if (at - stag + 8 <= BOX) push('S', [cell(take(), -stag, 12, 8, 12)], 8, { stag });
      }
    } else {
      const later = runs.slice(ri + 1).reduce((a, x) => a + minLen(x), 0);
      const len = Math.max(0, BOX - at - later);
      const e = Math.min(r.q.length, euroFill(BOX - at));
      // a later part that will not fit anyway does not take singles away from this one
      const kinds = euroRows(e, Math.max(len, Math.min(BOX - at, 4 * e)), !firstEuro) || ['S'];
      for (const k of kinds) {
        if (k === 'K') push('K', [cell(take(), 0, 0, 12, 8), cell(take(), 0, 8, 12, 8), cell(take(), 0, 16, 12, 8)], 12);
        else if (k === 'D') push('D', [cell(take(), 0, 0, 8, 12), cell(take(), 0, 12, 8, 12)], 8);
        else push('S', [cell(take(), 0, 6, 8, 12)], 8);
      }
    }
    firstEuro = false;
    tailStag = stag;
    stag = 0;
    dropped += r.q.length; r.q.length = 0;
  }
  for (const part of deferred) {
    if (at + 8 <= BOX) push('S', [cell(part, 0, 6, 8, 12)], 8);
    else dropped++;
  }
  // A single in the last row stands against the side wall: nothing behind it holds it (owner 17/11 «αν είναι
  // τελευταία, πάντα τοίχο· αν είναι πιο νωρίς, όπου δεν μπορούμε να βάλουμε μπάρες, μπαίνει μέσα»).
  // Why: a single earlier in the box is held by the rows around it, and in the middle it sways less and keeps the
  // box evenly weighted left / right; the last one has nothing behind it but the bars, so it leans on a wall.
  const last = rows[rows.length - 1];
  if (last && last.k === 'S') { last.wall = true; if (!last.stag) last.cells[0].y = 0; }
  const used = rows.reduce((a, r) => Math.max(a, ...r.cells.map(c => r.at + c.x + c.w)), 0);
  return { rows, used, placed: rows.reduce((a, r) => a + r.n, 0), dropped };
}

// Capacity for this mix = the industrials + the euro that fit in the length they leave (+ the one beside an odd
// industrial: one euro a side every 0.8 m after it). 33 euro only, 26 industrial only, 32 for 20 euro + 4 industrial
// (the owner's example). Independent of the order of the parts: the number a form shows does not move when a
// delivery is dragged.
function capacity(counts) {
  const ind = n0(counts && counts.ind);
  const ir = indRowsFit(ind), iFit = Math.min(ind, 2 * ir), room = BOX - ir * ROW.I;
  return iFit + (iFit % 2 ? 1 + Math.floor(room / 8) + Math.floor((room + 2) / 8) : euroFill(room));
}
// One load without an order of parts: industrials by the cab, then euro. → layout + { eur, ind, total, cap, over }.
// over = pallets above the capacity (shown as a warning, never a refusal).
function plan(counts) {
  const eur = n0(counts && counts.eur), ind = n0(counts && counts.ind);
  const cap = capacity({ ind });
  return Object.assign(layout([{ n: ind, ind: true }, { n: eur }]), { eur, ind, total: eur + ind, cap, over: Math.max(0, eur + ind - cap) });
}

// The box seen from above as an SVG string (no DOM, so the panel and the printed sheets draw the same picture).
// Upright: the cab at the top, the doors at the bottom, as the ramp and the forklift see the box (owner 17/11,
// «κάθετα»). opts:
//   scale = px per dm · font = text size factor (paper) · width = px for the labels on the right
//   parts = [{ label, sub, tag, key }] by part index: each part gets the colour of its key (the delivery number, so
//     a card on the sheet and its pallets match), a bracket with its label, and its tag written in every pallet
//   numbers = write the tags in the pallets (on by default from scale 3)
//   tone = 'slate' (blues, greys, white — the one the screens use), 'cool' | 'earth' (muted palettes), 'blue' | 'grey' (two tints of one colour), none (bright, one per delivery)
//   guide = write «start here» by the cab and «first out» by the doors (the forklift sheet)
//   family = the font of the texts (a paper of the redesign: Manrope)
// Without parts: euro blue, industrial amber.
const TAG = { K: 'Μ', D: 'Δ', S: 'Ο', I: 'Β', X: 'Β+Π' };
const PAL = ['#BAE6FD', '#FDE68A', '#BBF7D0', '#FBCFE8', '#DDD6FE', '#FED7AA', '#A5F3FC', '#E5E7EB'];
const INK = ['#0369A1', '#B45309', '#15803D', '#BE185D', '#6D28D9', '#C2410C', '#0E7490', '#4B5563'];
// Quieter tones (owner 17/11, «πολύ χρωματιστά»): one hue in two tints, alternating by delivery, so neighbours in the
// box differ while the number in the pallet says which delivery it is. 'colour' keeps one colour per delivery.
const TONES = {
  blue: { fill: ['#E7EFFA', '#C3D7F2'], ink: ['#0B3F80'] },
  grey: { fill: ['#FFFFFF', '#E3E5E8'], ink: ['#1B1D29'] },
  // muted palettes, every colour at about the same lightness so none shouts (owner 17/11 «μια παλέτα χρωμάτων»)
  // blues, greys and white only (owner 17/11 «αποχρώσεις του μπλε, γκρι, άσπρο»): light and darker alternate, so
  // two neighbouring deliveries never share a shade; the number in the pallet does the rest
  // Odd deliveries light, even ones clearly darker (≥ 25% apart), so two neighbours stay apart on a black-and-white
  // printer too; the even ones also get a heavier outline (independent critic 17/11).
  slate: { fill: ['#B4BDC9', '#FFFFFF', '#A9C3E6', '#E8EBEF', '#7E97BA', '#EEF4FB'], ink: ['#0B2A55', '#1B1D29', '#0B2A55', '#1B1D29', '#0B2A55', '#1B1D29'], heavy: true },
  cool: { fill: ['#DCE7F5', '#D5ECE8', '#E3EAD6', '#F2E8D5', '#E8E0EF', '#E1E5EA'], ink: ['#1F4E8C', '#1D675F', '#4A672C', '#87611E', '#664782', '#47525F'] },
  earth: { fill: ['#E9E3D7', '#DCE5E0', '#EEDDD8', '#DDE2EB', '#EDE6CF', '#E4E1E6'], ink: ['#5E5340', '#3E5E50', '#8A4B3C', '#3F5272', '#7A6526', '#5A5262'] },
};
// [fill, ink] of a delivery key in a tone
function paint(k, tone) {
  const t = TONES[tone];
  return t ? [t.fill[k % t.fill.length], t.ink[k % t.ink.length]] : [PAL[k % PAL.length], INK[k % INK.length]];
}
let _svgN = 0;   // one hatch pattern id per drawing: two drawings on one page must not share it
function svg(p, opts) {
  const o = opts || {}, sc = o.scale || 2.4, parts = o.parts || null, f = o.font || 1;
  const numbers = o.numbers != null ? o.numbers : sc >= 3;
  const key = i => { const pt = parts && parts[i]; return pt && pt.key != null ? pt.key : i; };
  const tagW = 16 * f, boxW = 24 * sc, cab = 13 * f, top = cab + 3, boxH = BOX * sc, lw = parts ? (o.width != null ? o.width : 150) : 0;
  const W = tagW + boxW + (parts ? 12 + lw : 4), H = top + boxH + 16 * f;
  const hid = 'lph' + (++_svgN);
  const out = [];
  const colour = c => parts ? paint(key(c.part), o.tone) : c.ind ? ['#FDE68A', '#B45309'] : ['#BAE6FD', '#0369A1'];
  const span = {};
  for (const r of p.rows) {
    for (const c of r.cells) {
      const y0 = r.at + c.x, [fill, ink] = colour(c);
      const x = tagW + c.y * sc + 0.75, y = top + y0 * sc + 0.75, w = c.h * sc - 1.5, h = c.w * sc - 1.5;
      // a single is a pallet like any other: solid outline, told apart only by its place (critic 17/11: a dashed one
      // read as an empty or optional place)
      const sw = (TONES[o.tone] && TONES[o.tone].heavy && parts && key(c.part) % 2 === 0 ? 1.8 : 0.9) * Math.max(1, sc / 4);
      out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(1.4 * Math.min(sc, 4)).toFixed(1)}" fill="${fill}" stroke="${ink}" stroke-width="${sw.toFixed(2)}"/>`);
      // an industrial is the bigger pallet: hatched, so it reads apart from a euro of the same delivery
      if (c.ind) out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(1.4 * Math.min(sc, 4)).toFixed(1)}" fill="url(#${hid})" style="color:${ink}"/>`);
      const tag = parts && parts[c.part] && parts[c.part].tag;
      if (numbers && tag != null && tag !== '') {
        const fs = Math.max(8, Math.min(w, h) * 0.66);
        out.push(`<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + fs * 0.36).toFixed(1)}" text-anchor="middle" style="font-size:${fs.toFixed(1)}px;font-weight:700;fill:${ink}">${esc(tag)}</text>`);
      }
      const sp = span[c.part] || (span[c.part] = [y0, y0 + c.w]);
      sp[0] = Math.min(sp[0], y0); sp[1] = Math.max(sp[1], y0 + c.w);
    }
    out.push(`<text class="lp-t" x="${tagW - 4}" y="${(top + (r.at + r.len / 2) * sc + 3 * f).toFixed(1)}" text-anchor="end">${TAG[r.k]}</text>`);
  }
  if (parts) {
    // one bracket per part, in box order; labels that would overlap are pushed down
    let next = 0;
    const bx = tagW + boxW + 5;
    Object.keys(span).map(Number).sort((a, b) => span[a][0] - span[b][0]).forEach(i => {
      const [a, b] = span[i], y1 = top + a * sc + 1, y2 = top + b * sc - 1, ink = paint(key(i), o.tone)[1];
      out.push(`<path d="M${bx} ${y1.toFixed(1)}h4V${y2.toFixed(1)}h-4" fill="none" stroke="${ink}" stroke-width="${1.4 * f}"/>`);
      const pt = parts[i] || {};
      const ty = Math.max(next, (y1 + y2) / 2 - (pt.sub ? 9 : 4) * f);
      out.push(`<text class="lp-l" x="${bx + 9}" y="${(ty + 8 * f).toFixed(1)}" style="fill:${ink}">${esc(pt.label || '')}</text>`);
      if (pt.sub) out.push(`<text class="lp-s" x="${bx + 9}" y="${(ty + 20 * f).toFixed(1)}">${esc(pt.sub)}</text>`);
      next = ty + (pt.sub ? 27 : 14) * f;
    });
  }
  const free = BOX - p.used, cx = tagW + boxW / 2;
  // opts.guide: the rule written on the drawing itself, by the cab and by the doors (critic 17/11)
  if (o.guide) {
    const gx = tagW + boxW + 14;
    out.push(`<text class="lp-g" x="${gx}" y="${(top + 6 * sc).toFixed(1)}">◀ ΞΕΚΙΝΑ ΕΔΩ</text><text class="lp-gs" x="${gx}" y="${(top + 6 * sc + 17 * f).toFixed(1)}">μπαίνει πρώτο</text>`);
    const end = top + Math.min(p.used, BOX) * sc;
    out.push(`<text class="lp-g" x="${gx}" y="${(end - 17 * f).toFixed(1)}">◀ ΠΡΩΤΟ ΕΞΩ</text><text class="lp-gs" x="${gx}" y="${end.toFixed(1)}">παράδοση 1</text>`);
  }
  // the bars at the back: the room left behind the load is where they go (owner 17/11)
  const bars = free >= 2
    ? `<line x1="${tagW + 3}" x2="${tagW + boxW - 3}" y1="${(top + (p.used + 1) * sc).toFixed(1)}" y2="${(top + (p.used + 1) * sc).toFixed(1)}" stroke="#0B1929" stroke-width="${2.2 * f}" stroke-linecap="round"/>` +
      (free >= 10 ? `<text class="lp-t" x="${cx}" y="${(top + (p.used + 1) * sc + 10 * f).toFixed(1)}" text-anchor="middle">μπάρες · ${(free / 10).toFixed(1).replace('.', ',')} μ</text>` : '')
    : '';
  return `<svg class="lp" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="${W.toFixed(0)}" role="img" aria-label="${esc(aria(p))}">` +
    `<defs><pattern id="${hid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="1.2" opacity=".35"/></pattern></defs>` +
    `<style>.lp text{font-family:${o.family || "'DM Sans',sans-serif"}}.lp-t{font-size:${10 * f}px;font-weight:700;fill:#1F2937}` +
    `.lp-l{font-size:${9.5 * f}px;font-weight:700}.lp-s{font-size:${10 * f}px;fill:#334155}.lp-c{font-size:${Math.min(7.5 * f, boxW / 6.2)}px;font-weight:700;fill:#fff;letter-spacing:.04em}.lp-g{font-size:${14 * f}px;font-weight:800;fill:#0B63CE}.lp-gs{font-size:${10 * f}px;font-weight:600;fill:#334155}</style>` +
    // the cab: a navy cap on the front wall
    `<rect x="${tagW}" y="0" width="${boxW}" height="${cab}" rx="${cab / 2}" fill="#0B1929"/>` +
    `<text class="lp-c" x="${cx}" y="${(cab / 2 + 2.6 * f).toFixed(1)}" text-anchor="middle">ΚΑΜΠΙΝΑ</text>` +
    `<rect x="${tagW}" y="${top}" width="${boxW}" height="${boxH}" rx="3" fill="#F8FAFC" stroke="#0B1929" stroke-width="${1.6 * f}"/>` +
    out.join('') + bars +
    // the doors: the back wall drawn as two open leaves
    `<path d="M${tagW} ${top + boxH}l${-6 * f} ${8 * f}M${tagW + boxW} ${top + boxH}l${6 * f} ${8 * f}" stroke="#0B1929" stroke-width="${1.4 * f}" fill="none"/>` +
    `<text class="lp-t" x="${cx}" y="${(H - 3).toFixed(1)}" text-anchor="middle" style="font-weight:700;fill:#0B1929">ΠΟΡΤΕΣ</text></svg>`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
// «5 μαχαίρι · 5 διπλές · 4 μονές» — the words for the row counts (and the drawing's label for a screen reader).
function aria(p) {
  const c = { K: 0, D: 0, S: 0, I: 0, X: 0 };
  p.rows.forEach(r => { c[r.k]++; });
  return [c.K ? c.K + ' μαχαίρι' : '', c.D ? c.D + (c.D === 1 ? ' διπλή' : ' διπλές') : '', c.S ? c.S + (c.S === 1 ? ' μονή' : ' μονές') : '',
    c.I ? c.I + (c.I === 1 ? ' σειρά βιομηχανικές' : ' σειρές βιομηχανικές') : '', c.X ? '1 βιομηχανική + πλάκα' : ''].filter(Boolean).join(' · ');
}

const LoadPlan = Object.freeze({ BOX, ROW, isInd, euroFill, capacity, euroRows, layout, plan, svg, words: aria, paint });
if (typeof module !== 'undefined' && module.exports) module.exports = LoadPlan;
else globalThis.LoadPlan = LoadPlan;
})();
