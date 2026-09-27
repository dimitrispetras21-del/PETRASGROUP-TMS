// ═══════════════════════════════════════════════════════════════════
// Legacy Word (.doc, Word 97-2003) → plain text, in the browser.
//
// Why this exists (scan round 2, 27/9/2026): DPS sends transport orders as
// old binary .doc files. The scanner rejected them at the upload gate (4 of
// 15 golden documents), and Claude cannot read .doc directly. The text layer
// of these files is tiny (~1 kB), so reading it here and sending TEXT is both
// possible and far cheaper than any image route.
//
// Format: an OLE2 Compound File ([MS-CFB]) holding a "WordDocument" stream
// and a "0Table"/"1Table" stream ([MS-DOC]). The text lives in pieces listed
// by the piece table (CLX) — reading the WordDocument stream as a flat string
// would mix text with formatting bytes and miss fast-saved edits.
//
// Fails LOUDLY (throws) on anything it does not understand: an encrypted or
// unusual file must reach the dispatcher as "cannot read", never as an empty
// order that looks like the AI found nothing.
// ═══════════════════════════════════════════════════════════════════

function docLegacyToText(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const u16 = o => dv.getUint16(o, true);
  const u32 = o => dv.getUint32(o, true);

  if (u8.length < 512 || u32(0) !== 0xE011CFD0 || u32(4) !== 0xE11AB1A1) {
    throw new Error('not an OLE2 (.doc) file');
  }
  const secSize = 1 << u16(0x1E);
  const miniSecSize = 1 << u16(0x20);
  const nFatSecs = u32(0x2C);
  const dirStart = u32(0x30);
  const miniCutoff = u32(0x38);
  const miniFatStart = u32(0x3C);
  let difatSec = u32(0x44);
  const ENDCHAIN = 0xFFFFFFFE, FREESECT = 0xFFFFFFFF;
  const secOff = s => 512 + s * secSize;

  // FAT sector list: 109 entries in the header, the rest in DIFAT sectors.
  const fatSecs = [];
  for (let i = 0; i < 109 && fatSecs.length < nFatSecs; i++) fatSecs.push(u32(0x4C + i * 4));
  for (let guard = 0; difatSec !== ENDCHAIN && difatSec !== FREESECT && fatSecs.length < nFatSecs; guard++) {
    if (guard > 10000) throw new Error('.doc: DIFAT loop');
    const base = secOff(difatSec);
    for (let i = 0; i < secSize / 4 - 1 && fatSecs.length < nFatSecs; i++) fatSecs.push(u32(base + i * 4));
    difatSec = u32(base + secSize - 4);
  }
  const fat = [];
  for (const s of fatSecs) for (let i = 0; i < secSize / 4; i++) fat.push(u32(secOff(s) + i * 4));

  const chain = (start, next) => {
    const out = [];
    for (let s = start; s !== ENDCHAIN && s !== FREESECT; s = next[s]) {
      if (out.length > next.length || s >= next.length) throw new Error('.doc: broken sector chain');
      out.push(s);
    }
    return out;
  };
  const readBig = (start, size) => {
    const out = new Uint8Array(size);
    let pos = 0;
    for (const s of chain(start, fat)) {
      const n = Math.min(secSize, size - pos);
      if (n <= 0) break;
      out.set(u8.subarray(secOff(s), secOff(s) + n), pos);
      pos += n;
    }
    if (pos < size) throw new Error('.doc: stream shorter than declared');
    return out;
  };

  // Directory: 128-byte entries.
  const dirBytes = chain(dirStart, fat).length * secSize;
  const dir = readBig(dirStart, dirBytes);
  const ddv = new DataView(dir.buffer);
  const entries = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const nameLen = ddv.getUint16(off + 0x40, true);
    const type = dir[off + 0x42];
    if (!type) continue;
    let name = '';
    for (let i = 0; i + 2 < nameLen; i += 2) name += String.fromCharCode(ddv.getUint16(off + i, true));
    entries.push({ name, type, start: ddv.getUint32(off + 0x74, true), size: ddv.getUint32(off + 0x78, true) });
  }
  const root = entries.find(e => e.type === 5);
  if (!root) throw new Error('.doc: no root entry');

  let miniStream = null, miniFat = null;
  const readStream = name => {
    const e = entries.find(x => x.name === name && x.type === 2);
    if (!e) return null;
    if (e.size >= miniCutoff) return readBig(e.start, e.size);
    if (!miniStream) {
      miniStream = readBig(root.start, root.size);
      miniFat = [];
      for (const s of chain(miniFatStart, fat)) for (let i = 0; i < secSize / 4; i++) miniFat.push(u32(secOff(s) + i * 4));
    }
    const out = new Uint8Array(e.size);
    let pos = 0;
    for (const s of chain(e.start, miniFat)) {
      const n = Math.min(miniSecSize, e.size - pos);
      if (n <= 0) break;
      out.set(miniStream.subarray(s * miniSecSize, s * miniSecSize + n), pos);
      pos += n;
    }
    return out;
  };

  const wd = readStream('WordDocument');
  if (!wd) throw new Error('.doc: no WordDocument stream (not a Word file?)');
  const w = new DataView(wd.buffer);
  if (w.getUint16(0, true) !== 0xA5EC) throw new Error('.doc: bad Word signature');
  const flags = w.getUint16(0x0A, true);
  if (flags & 0x0100) throw new Error('.doc is password-protected — open it in Word and save without a password');
  const table = readStream(flags & 0x0200 ? '1Table' : '0Table');
  if (!table) throw new Error('.doc: table stream missing');
  const fcClx = w.getUint32(0x1A2, true);
  const lcbClx = w.getUint32(0x1A6, true);
  if (!lcbClx || fcClx + lcbClx > table.length) throw new Error('.doc: no piece table');

  // CLX = Prc* then one Pcdt (0x02, lcb, PlcPcd).
  const t = new DataView(table.buffer);
  let p = fcClx;
  while (table[p] === 0x01) p += 3 + t.getUint16(p + 1, true);
  if (table[p] !== 0x02) throw new Error('.doc: malformed piece table');
  const lcb = t.getUint32(p + 1, true);
  const plc = p + 5;
  const n = (lcb - 4) / 12;
  if (!Number.isInteger(n) || n < 1) throw new Error('.doc: malformed piece table');

  const cp1252 = typeof TextDecoder !== 'undefined' ? new TextDecoder('windows-1252') : null;
  const u16le = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : null;
  let text = '';
  for (let i = 0; i < n; i++) {
    const cpStart = t.getUint32(plc + i * 4, true);
    const cpEnd = t.getUint32(plc + (i + 1) * 4, true);
    const pcd = plc + (n + 1) * 4 + i * 8;
    const fc = t.getUint32(pcd + 2, true);
    const len = cpEnd - cpStart;
    if (len <= 0) continue;
    if (fc & 0x40000000) {
      const off = (fc & ~0x40000000) >>> 1;
      text += cp1252.decode(wd.subarray(off, off + len));
    } else {
      text += u16le.decode(wd.subarray(fc, fc + len * 2));
    }
  }
  return cleanWordText(text);
}

// Word control characters → readable text. Field codes ({HYPERLINK "..."})
// are dropped so the model sees the display text only.
function cleanWordText(s) {
  // 0x13 field begin … 0x14 separator … 0x15 end: keep the result part.
  let out = '', depth = 0, inCode = [];
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c === 0x13) { depth++; inCode.push(true); continue; }
    if (c === 0x14) { if (depth) inCode[depth - 1] = false; continue; }
    if (c === 0x15) { if (depth) { depth--; inCode.pop(); } continue; }
    if (depth && inCode[depth - 1]) continue;
    out += ch;
  }
  return out
    .replace(/\r\x07/g, '\t').replace(/\x07/g, '\t')   // table cell / row marks
    .replace(/[\r\x0B\x0C]/g, '\n')                      // paragraph, line & page breaks
    .replace(/[\x00-\x08\x0E-\x1F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

if (typeof module !== 'undefined' && module.exports) module.exports = { docLegacyToText };
