// Normalisers for comparing scanner output with the golden set.
// Pure functions, no I/O — covered by test/normalize.test.mjs.

// Dates → 'YYYY-MM-DD'. Accepts ISO (with or without time), dd.mm.yyyy,
// dd/mm/yyyy, dd-mm-yyyy and 2-digit years. Anything else → null (never a
// guess: a wrongly-normalised date would be scored as "correct").
export function normDate(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return iso(y, +m[2], +m[1]);
  }
  return null;
}

function iso(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Numbers from document-style strings: "22.500kg", "3.723,00 EUR",
// "2 200,00", "21,000", "-18C", 1300. European thousands separators are the
// norm in these documents, so a single '.' or ',' followed by exactly three
// digits is read as a thousands separator ("22.500" → 22500).
export function normNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,\-+ ]/g, '').trim().replace(/\s+/g, '');
  if (!s || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // both present: the later one is the decimal separator
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    if (parts.length > 2 || tail.length === 3) s = parts.join('');   // thousands
    else s = parts.join('.');                                           // decimal
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normText(v) {
  if (v == null) return null;
  const s = String(v).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return s || null;
}

// References: case-insensitive, separators ignored. Leading zeros are kept —
// "0012345678" and "12345678" are different strings for a duplicate check.
export function normRef(v) {
  if (v == null) return null;
  const s = String(v).toUpperCase().replace(/[^0-9A-Z]/g, '');
  return s || null;
}

const COUNTRY = {
  GR: ['gr', 'el', 'greece', 'hellas', 'ελλαδα', 'ελλάδα'],
  DE: ['de', 'd', 'germany', 'deutschland'],
  IT: ['it', 'i', 'italy', 'italia'],
  AT: ['at', 'a', 'austria', 'österreich', 'osterreich'],
  CZ: ['cz', 'czech republic', 'czechia'],
  HU: ['hu', 'h', 'hungary', 'magyarország'],
  BG: ['bg', 'bulgaria'],
  RO: ['ro', 'romania'],
  PL: ['pl', 'poland'],
  SK: ['sk', 'slovakia'],
  SI: ['si', 'slovenia'],
  HR: ['hr', 'croatia'],
  RS: ['rs', 'serbia'],
  NL: ['nl', 'netherlands'],
  FR: ['fr', 'france'],
  ES: ['es', 'spain'],
  BE: ['be', 'belgium'],
};
const COUNTRY_LOOKUP = Object.fromEntries(Object.entries(COUNTRY).flatMap(([k, vs]) => vs.map(v => [v, k])));
export function normCountry(v) {
  const t = normText(v);
  if (!t) return null;
  return COUNTRY_LOOKUP[t] || t.toUpperCase();
}

const PALLET = { eur: 'EUR', ep: 'EUR', epal: 'EUR', euro: 'EUR', 'euro pallet': 'EUR', europallet: 'EUR',
  chep: 'CHEP', ind: 'Industrial', industrial: 'Industrial', ip: 'Industrial', ds: 'DUS', dusseldorf: 'DUS' };
export function normPalletType(v) {
  const t = normText(v);
  if (!t) return null;
  return PALLET[t] || t;
}

export function normDirection(v) {
  const t = normText(v);
  if (!t) return null;
  if (t.startsWith('exp')) return 'Export';
  if (t.startsWith('imp')) return 'Import';
  return t;
}

// Ids: string or [string] → string (first). Record ids are compared exactly.
export function normId(v) {
  if (Array.isArray(v)) v = v[0];
  if (v == null || v === '') return null;
  return String(v).trim() || null;
}

// Goods are free text; a scanner answer counts as right if it shares at least
// half of the golden words (ignoring very short tokens). Deliberately lenient:
// goods is not a critical field.
export function goodsMatch(truth, got) {
  const tok = s => new Set((normText(s) || '').split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3));
  const a = tok(truth), b = tok(got);
  if (!a.size) return null;
  let hit = 0;
  for (const w of a) if (b.has(w) || [...b].some(x => x.startsWith(w) || w.startsWith(x))) hit++;
  return hit / a.size >= 0.5;
}

// Confidence to 0..1: numbers pass through, HIGH/MEDIUM/LOW map to fixed points.
export function normConfidence(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Math.max(0, Math.min(1, v));
  const t = String(v).toUpperCase();
  return t === 'HIGH' ? 0.9 : t === 'MEDIUM' ? 0.7 : t === 'LOW' ? 0.4 : null;
}
