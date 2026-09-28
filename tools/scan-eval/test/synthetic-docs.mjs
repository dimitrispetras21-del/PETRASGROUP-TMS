// INVENTED documents built byte by byte for the v2 tests and the UI smoke:
// a one-page PDF with a real text layer, a Word 97 .doc, and a .docx. No real data.
import zlib from 'node:zlib';

export const SYNTH_LINES = ['Acme Frozen Foods GmbH', 'Transport order SYN-0001', 'Loading: Alpha Cold Store, 99999 Testdorf, DE, 10.01.2031',
  'Delivery: Gamma Warehouse, Samplepolis, GR, 13.01.2031', 'Goods: frozen peas, 20 EUR pallets, 12.000 kg, -18 C',
  'Freight: 1.500,00 EUR', 'Terms and conditions apply to this synthetic order and nothing else.'];

/** Minimal one-page PDF with a real text layer (Helvetica, one line per entry). */
export function makePdf(lines) {
  const esc = s => s.replace(/[()\\]/g, '\\$&');
  const content = 'BT /F1 11 Tf 50 750 Td 14 TL ' + lines.map(l => `(${esc(l)}) Tj T*`).join(' ') + ' ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/**
 * Minimal Word 97 .doc: OLE2 container (512-byte sectors) with a WordDocument
 * stream (FIB + cp1252 text) and a 0Table stream holding a one-piece CLX.
 */
export function makeDoc(text, { password = false } = {}) {
  const SEC = 512, END = 0xFFFFFFFE, FREE = 0xFFFFFFFF;
  const wd = Buffer.alloc(4096);
  wd.writeUInt16LE(0xA5EC, 0);
  wd.writeUInt16LE(password ? 0x0100 : 0, 0x0A);
  wd.writeUInt32LE(0, 0x1A2);              // fcClx
  wd.writeUInt32LE(21, 0x1A6);             // lcbClx
  const body = Buffer.from(text.replace(/\n/g, '\r'), 'latin1');
  body.copy(wd, 2048);
  const tbl = Buffer.alloc(4096);
  tbl[0] = 0x02; tbl.writeUInt32LE(16, 1);
  tbl.writeUInt32LE(0, 5); tbl.writeUInt32LE(body.length, 9);           // CPs
  tbl.writeUInt32LE((2048 * 2) | 0x40000000, 15);                        // PCD.fc (compressed)
  const head = Buffer.alloc(SEC, 0);
  Buffer.from('D0CF11E0A1B11AE1', 'hex').copy(head, 0);
  head.writeUInt16LE(0x3E, 0x18); head.writeUInt16LE(3, 0x1A); head.writeUInt16LE(0xFFFE, 0x1C);
  head.writeUInt16LE(9, 0x1E); head.writeUInt16LE(6, 0x20);
  head.writeUInt32LE(1, 0x2C); head.writeUInt32LE(1, 0x30); head.writeUInt32LE(4096, 0x38);
  head.writeUInt32LE(END, 0x3C); head.writeUInt32LE(0, 0x40); head.writeUInt32LE(END, 0x44); head.writeUInt32LE(0, 0x48);
  for (let i = 0; i < 109; i++) head.writeUInt32LE(i === 0 ? 0 : FREE, 0x4C + i * 4);
  const fat = Buffer.alloc(SEC, 0xFF);
  const setFat = (i, v) => fat.writeUInt32LE(v >>> 0, i * 4);
  setFat(0, 0xFFFFFFFD); setFat(1, END);
  for (let s = 2; s < 9; s++) setFat(s, s + 1); setFat(9, END);
  for (let s = 10; s < 17; s++) setFat(s, s + 1); setFat(17, END);
  const dir = Buffer.alloc(SEC, 0);
  const entry = (i, name, type, start, size) => {
    const o = i * 128;
    Buffer.from(name + '\0', 'utf16le').copy(dir, o);
    dir.writeUInt16LE((name.length + 1) * 2, o + 0x40);
    dir[o + 0x42] = type;
    dir.writeUInt32LE(FREE, o + 0x44); dir.writeUInt32LE(FREE, o + 0x48); dir.writeUInt32LE(FREE, o + 0x4C);
    dir.writeUInt32LE(start >>> 0, o + 0x74); dir.writeUInt32LE(size, o + 0x78);
  };
  entry(0, 'Root Entry', 5, END, 0);
  entry(1, 'WordDocument', 2, 2, 4096);
  entry(2, '0Table', 2, 10, 4096);
  return Buffer.concat([head, fat, dir, wd, tbl]);
}

// ── .docx (Office Open XML) — a hand-built ZIP, no library ──────────────
// Round 4 (28/9/2026): core/doc-text.js's docxToText() parses the ZIP central
// directory itself; these tests must build a REAL zip (not just "some bytes
// that vaguely look like one") to exercise that parser, including BOTH
// compression methods a .docx can carry.

/**
 * Minimal ZIP container: local file headers + central directory + EOCD, no
 * data descriptors, no comments — just enough for docxToText() to read.
 * @param {Array<{name:string, data:Buffer, method:0|8}>} files method 0 =
 *   stored, 8 = deflate (the only two methods a Word-produced .docx uses).
 */
export function makeZip(files) {
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const compData = f.method === 8 ? zlib.deflateRawSync(f.data) : f.data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);              // version needed
    local.writeUInt16LE(0, 6);               // flags
    local.writeUInt16LE(f.method, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); // mod time/date (unchecked)
    local.writeUInt32LE(0, 14);              // crc32 (docxToText never verifies it)
    local.writeUInt32LE(compData.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);              // extra field length
    const localEntry = Buffer.concat([local, nameBuf, compData]);
    localParts.push(localEntry);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(f.method, 10);
    central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(compData.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);       // local header offset
    centralParts.push(Buffer.concat([central, nameBuf]));
    offset += localEntry.length;
  }
  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

const _WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

// Fixed INVENTED content (year 2031) exercising every WordprocessingML shape
// the reader must handle in one document: a plain paragraph, a tab inside a
// run, an XML entity, a tracked-change deletion that must NOT reach the
// output, Greek text, and a 2x2 table — plus a page header carrying the
// reference (carrier orders often print it there, not in the body).
export const SYNTH_DOCX = {
  reference: 'DX-0001',
  header: 'DPS LOGISTICS HEADER REF-HDR-0001',
  footer: 'Footer note 2031',
  deletedText: 'SHOULD NOT APPEAR',
  table: [['Alpha Cold Store', '10 pallets'], ['Beta Warehouse', '5 pallets']],
};

function _docxDocumentXml() {
  const s = SYNTH_DOCX;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${_WNS}><w:body>
<w:p><w:r><w:t>Transport order ${s.reference}</w:t></w:r></w:p>
<w:p><w:r><w:t>Reference:</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>${s.reference}</w:t></w:r></w:p>
<w:p><w:r><w:t>Client: Alpha &amp; Beta Logistics</w:t></w:r></w:p>
<w:p><w:del w:id="1" w:author="test" w:date="2031-01-10T00:00:00Z"><w:r><w:delText>${s.deletedText}</w:delText></w:r></w:del><w:r><w:t>Goods: frozen peas</w:t></w:r></w:p>
<w:p><w:r><w:t>Παραγγελία μεταφοράς — ψυγείο, -18C</w:t></w:r></w:p>
<w:tbl>
<w:tr><w:tc><w:p><w:r><w:t>${s.table[0][0]}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${s.table[0][1]}</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>${s.table[1][0]}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${s.table[1][1]}</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
</w:body></w:document>`;
}
function _docxHeaderXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${_WNS}><w:p><w:r><w:t>${SYNTH_DOCX.header}</w:t></w:r></w:p></w:hdr>`;
}
function _docxFooterXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${_WNS}><w:p><w:r><w:t>${SYNTH_DOCX.footer}</w:t></w:r></w:p></w:ftr>`;
}

/**
 * A minimal but complete .docx (document + header + footer). `methods` lets a
 * test force stored (0) vs deflated (8) per part; the default already mixes
 * both so ONE fixture exercises both compression paths the reader supports.
 * @param {{document?:0|8, header?:0|8, footer?:0|8}} [methods]
 */
export function makeDocx(methods = {}) {
  const m = { document: 8, header: 0, footer: 8, ...methods };
  return makeZip([
    { name: 'word/document.xml', data: Buffer.from(_docxDocumentXml(), 'utf8'), method: m.document },
    { name: 'word/header1.xml', data: Buffer.from(_docxHeaderXml(), 'utf8'), method: m.header },
    { name: 'word/footer1.xml', data: Buffer.from(_docxFooterXml(), 'utf8'), method: m.footer },
  ]);
}

/**
 * A .docx whose only part is huge, highly repetitive text (deflates to almost
 * nothing) — for the zip-bomb guard: DecompressionStream must be made to
 * produce > the cap, not just have a central directory that CLAIMS a big size.
 */
export function makeDocxBomb(sizeBytes) {
  const xml = `<?xml version="1.0"?><w:document ${_WNS}><w:body><w:p><w:r><w:t>${'A'.repeat(sizeBytes)}</w:t></w:r></w:p></w:body></w:document>`;
  return makeZip([{ name: 'word/document.xml', data: Buffer.from(xml, 'utf8'), method: 8 }]);
}
