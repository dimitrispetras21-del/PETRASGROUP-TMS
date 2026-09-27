// INVENTED documents built byte by byte for the v2 tests and the UI smoke:
// a one-page PDF with a real text layer and a Word 97 .doc. No real data.
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

