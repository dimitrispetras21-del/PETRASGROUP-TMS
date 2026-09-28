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

// ═══════════════════════════════════════════════════════════════════
// Word (.docx, Office Open XML) → plain text, in the browser.
//
// Why this exists (scan round 4, 28/9/2026): newer carrier orders from DPS
// arrive as .docx, not the legacy binary .doc above. A .docx is a ZIP archive
// of WordprocessingML parts — no zip library is loaded in the browser, so
// this walks the ZIP central directory itself and inflates with the
// platform's own DecompressionStream('deflate-raw') (native in every current
// browser and in Node >= 18 — see tools/scan-eval/lib/app-sandbox.mjs, which
// runs this exact file in a Node vm for the eval harness and needs the same
// global).
//
// Carrier orders routinely put the transport reference or the client's
// address in a page HEADER, and lay cargo lines out as a TABLE — reading only
// word/document.xml would hand the model an order with no reference and no
// rows, so headers, footers and footnotes are folded in too, and table rows/
// cells keep \t / \n structure instead of collapsing into one paragraph.
//
// Fails LOUDLY (throws) on anything it does not understand — same contract as
// docLegacyToText above: no document.xml, a corrupt zip, an unsupported
// compression method, or inflated output past the size guard below must
// reach the dispatcher as "cannot read", never an empty prefilled form.
// ═══════════════════════════════════════════════════════════════════

// Cap on TOTAL inflated bytes across every part read from one file. A zip's
// central directory can CLAIM any "uncompressed size" it likes, so the only
// guard worth having counts bytes actually produced by DecompressionStream,
// never the (untrusted) metadata — a real zip bomb lies about this exact field.
const DOCX_MAX_INFLATED_BYTES = 20 * 1024 * 1024;

function _docxU8(buffer) { return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer); }

// ── ZIP: central directory + local headers, stored/deflate only (the only
// two methods a Word-produced .docx ever uses — no general zip library needed) ──
function _docxFindEocd(u8) {
  const from = Math.max(0, u8.length - 22 - 65535); // EOCD record + up to a 64KB comment
  for (let i = u8.length - 22; i >= from; i--) {
    if (u8[i] === 0x50 && u8[i + 1] === 0x4B && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) return i;
  }
  return -1;
}

function _docxCentralDirectory(u8, dv) {
  const eocd = _docxFindEocd(u8);
  if (eocd < 0) throw new Error('.docx: not a zip file (no end-of-central-directory record)');
  const total = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let i = 0; i < total; i++) {
    if (off + 46 > u8.length || dv.getUint32(off, true) !== 0x02014b50) throw new Error('.docx: malformed central directory');
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOffset = dv.getUint32(off + 42, true);
    const nameStart = off + 46;
    if (nameStart + nameLen > u8.length) throw new Error('.docx: malformed central directory');
    const name = new TextDecoder('utf-8').decode(u8.subarray(nameStart, nameStart + nameLen));
    entries.set(name, { method, compSize, localOffset });
    off = nameStart + nameLen + extraLen + commentLen;
  }
  return entries;
}

// budget: { used } shared across every part of ONE file, so the cap is on the
// file's total output, not reset per-part (a bomb could otherwise be split
// across many small parts, each individually under the limit).
async function _docxInflate(bytes, method, budget) {
  let out;
  if (method === 0) {
    out = bytes; // stored, no compression
  } else if (method === 8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('.docx: this runtime cannot inflate zip entries (no DecompressionStream)');
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (budget.used + n > DOCX_MAX_INFLATED_BYTES) throw new Error('.docx: inflated content exceeds the size limit (possible zip bomb)');
      chunks.push(value);
    }
    out = new Uint8Array(n);
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
  } else {
    throw new Error(`.docx: unsupported zip compression method (${method})`);
  }
  budget.used += out.length;
  if (budget.used > DOCX_MAX_INFLATED_BYTES) throw new Error('.docx: content exceeds the size limit (possible zip bomb)');
  return out;
}

async function _docxReadPart(u8, dv, entry, budget) {
  const off = entry.localOffset;
  if (off + 30 > u8.length || dv.getUint32(off, true) !== 0x04034b50) throw new Error('.docx: malformed local file header');
  const nameLen = dv.getUint16(off + 26, true);
  const extraLen = dv.getUint16(off + 28, true);
  const dataStart = off + 30 + nameLen + extraLen;
  if (dataStart + entry.compSize > u8.length) throw new Error('.docx: truncated zip entry');
  const inflated = await _docxInflate(u8.subarray(dataStart, dataStart + entry.compSize), entry.method, budget);
  return new TextDecoder('utf-8').decode(inflated);
}

// ── WordprocessingML → text ──────────────────────────────────────────
function _docxDecodeEntities(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, ent) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[ent];
  });
}

// One pass over the raw XML, tag name only (no real XML parser is loaded in
// the browser): w:p closing -> newline, w:tab -> \t, w:br/w:cr -> newline. A
// table row becomes ONE line: w:tc opens add \t (except the row's first
// cell) and w:tr closing adds \n, so a row survives as tab-separated columns
// instead of one line per cell — inside a cell, a paragraph boundary is a
// SPACE inserted before the next paragraph starts (never after the last one,
// or every cell would end in a stray space+tab before the next column).
// w:instrText (field codes), w:delText and anything inside w:del
// (tracked-change deletions) are dropped entirely — not what is printed on
// the page, and a deleted run showing up would look like a live instruction.
function _docxXmlToText(xml) {
  const tokenRe = /<[^>]+>|[^<]+/g;
  let out = '', skipDepth = 0, tableDepth = 0, rowHasCell = false, cellFirstPara = true, m;
  while ((m = tokenRe.exec(xml))) {
    const tok = m[0];
    if (tok[0] !== '<') { if (skipDepth === 0) out += _docxDecodeEntities(tok); continue; }
    const closing = tok[1] === '/';
    const nameMatch = /^<\/?([a-zA-Z0-9_]+:[a-zA-Z0-9_]+)/.exec(tok);
    const name = nameMatch ? nameMatch[1] : '';
    switch (name) {
      case 'w:del': case 'w:instrText': case 'w:delText':
        // Self-closing forms carry no text and must not open a skip: Word
        // writes <w:del w:id=".." .../> inside w:rPr to mark a deleted
        // paragraph mark, and an empty field code can be <w:instrText/>.
        // Counted as an "open", either one silently dropped the REST of the
        // document (review of round 4).
        if (!/\/\s*>$/.test(tok)) skipDepth = Math.max(0, skipDepth + (closing ? -1 : 1));
        break;
      case 'w:tab':
        if (!closing && skipDepth === 0) out += '\t';
        break;
      case 'w:br': case 'w:cr':
        if (!closing && skipDepth === 0) out += '\n';
        break;
      case 'w:tbl':
        if (skipDepth === 0) tableDepth = Math.max(0, tableDepth + (closing ? -1 : 1));
        break;
      case 'w:tr':
        if (skipDepth === 0) { if (!closing) rowHasCell = false; else out += '\n'; }
        break;
      case 'w:tc':
        if (!closing && skipDepth === 0) { if (rowHasCell) out += '\t'; rowHasCell = true; cellFirstPara = true; }
        break;
      case 'w:p':
        // Belt and braces: deletions and field codes live inside runs, so no
        // skip may outlive its paragraph — a malformed/unknown construct can
        // cost at most one paragraph, never the rest of the document.
        if (closing) skipDepth = 0;
        if (skipDepth === 0) {
          if (tableDepth > 0) { if (!closing) { if (!cellFirstPara) out += ' '; cellFirstPara = false; } }
          else if (closing) out += '\n';
        }
        break;
    }
  }
  return out;
}

/**
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {Promise<string>}
 */
async function docxToText(buffer) {
  const u8 = _docxU8(buffer);
  if (u8.length < 22 || u8[0] !== 0x50 || u8[1] !== 0x4B) throw new Error('.docx: not a zip file');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const entries = _docxCentralDirectory(u8, dv);
  if (!entries.has('word/document.xml')) throw new Error('.docx: no word/document.xml found (not a Word file?)');

  const byPrefix = prefix => [...entries.keys()].filter(n => n.startsWith(prefix) && n.endsWith('.xml')).sort();
  const headers = byPrefix('word/header');
  const footers = byPrefix('word/footer');
  const footnotes = entries.has('word/footnotes.xml') ? ['word/footnotes.xml'] : [];

  const budget = { used: 0 };
  const parts = [];
  for (const name of [...headers, 'word/document.xml', ...footers, ...footnotes]) {
    parts.push(_docxXmlToText(await _docxReadPart(u8, dv, entries.get(name), budget)));
  }
  return parts.filter(Boolean).join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

if (typeof module !== 'undefined' && module.exports) module.exports = { docLegacyToText, docxToText };
