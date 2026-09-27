#!/usr/bin/env node
// Inventory + plain-text extraction for the scan golden set.
//
// Usage:  node tools/scan-eval/extract-text.mjs <docs-dir> <out-dir>
// Writes <out-dir>/<file>.txt per document and <out-dir>/inventory.json.
//
// Why these tools: no system packages are installed for this (no poppler).
// PDFs go through pdfjs-dist 3.11.174 — the same version the app loads from
// the CDN (core/scan-helpers.js), resolved from the repo's node_modules.
// Legacy Word .doc goes through macOS `textutil`, which ships with the OS.
// Both input and output live under .local/ (gitignored, public repo).
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

export async function pdfToText(buf) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    // Group glyph runs into visual lines by rounded y, then order by x —
    // pdf.js returns runs in content-stream order, which for table-heavy
    // carrier orders is not reading order.
    const lines = new Map();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 2) * 2;
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y).push({ x: it.transform[4], s: it.str });
    }
    const ys = [...lines.keys()].sort((a, b) => b - a);
    const text = ys.map(y => lines.get(y).sort((a, b) => a.x - b.x).map(r => r.s).join('  ')).join('\n');
    pages.push(text);
  }
  return { pages: doc.numPages, text: pages.map((t, i) => `=== page ${i + 1} ===\n${t}`).join('\n\n') };
}

export function docToText(file) {
  // textutil prints to stdout with -stdout; errors surface as a thrown exception
  const out = execFileSync('/usr/bin/textutil', ['-convert', 'txt', '-stdout', file], { maxBuffer: 32 * 1024 * 1024 });
  return out.toString('utf8');
}

export function sniffType(buf) {
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.readUInt32BE(0) === 0xD0CF11E0) return 'doc-legacy';          // OLE2 compound file
  if (buf.slice(0, 2).toString('latin1') === 'PK') return 'zip-office'; // .docx/.xlsx
  if (buf.readUInt16BE(0) === 0xFFD8) return 'jpeg';
  if (buf.slice(1, 4).toString('latin1') === 'PNG') return 'png';
  return 'unknown';
}

async function main() {
  const [inDir, outDir] = process.argv.slice(2);
  if (!inDir || !outDir) { console.error('usage: extract-text.mjs <docs-dir> <out-dir>'); process.exit(2); }
  fs.mkdirSync(outDir, { recursive: true });
  const inventory = [];
  for (const name of fs.readdirSync(inDir).sort()) {
    const full = path.join(inDir, name);
    if (!fs.statSync(full).isFile() || name.startsWith('.')) continue;
    const buf = fs.readFileSync(full);
    const type = sniffType(buf);
    const entry = { file: name, sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length, type, pages: null, chars: 0, error: null };
    try {
      let text = '';
      if (type === 'pdf') { const r = await pdfToText(buf); text = r.text; entry.pages = r.pages; }
      else if (type === 'doc-legacy' || type === 'zip-office') { text = docToText(full); }
      else throw new Error('no extractor for type ' + type);
      entry.chars = text.replace(/\s+/g, '').length;
      // A PDF with pages but no text layer is a scan: the text file would be
      // empty and every later step would silently see "nothing". Say so.
      if (entry.chars < 50) entry.error = 'little or no text layer (scanned image?) — needs OCR';
      fs.writeFileSync(path.join(outDir, name + '.txt'), text);
    } catch (e) {
      entry.error = e.message;
    }
    inventory.push(entry);
    console.log(`${entry.type.padEnd(10)} ${String(entry.pages ?? '-').padStart(2)}p ${String(entry.chars).padStart(6)}ch ${entry.error ? 'ERR ' + entry.error : 'ok'}  ${entry.sha256.slice(0, 12)}`);
  }
  fs.writeFileSync(path.join(outDir, 'inventory.json'), JSON.stringify(inventory, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
