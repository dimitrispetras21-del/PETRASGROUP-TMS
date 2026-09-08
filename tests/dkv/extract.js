#!/usr/bin/env node
'use strict';
/*
 * DKV extraction helper (Node, Φ1 test harness).
 *
 * Unzips a DKV statement ZIP and extracts text from every PDF using
 * pdfjs-dist@3.11.174 legacy build — the SAME version and build the
 * browser loads from CDN (core/scan-helpers.js:175). Two different pdf
 * extraction libraries (e.g. pypdf vs pdf.js) join lines differently, so
 * using anything else here would make the parser "work in tests, not on
 * screen" (spec §2).
 *
 * Usage:
 *   NODE_PATH=/path/to/main-repo/node_modules node tests/dkv/extract.js <zip-path> [--dump <out-dir>]
 *
 * As a library:
 *   const { extractZip } = require('./extract');
 *   const files = await extractZip(zipPath); // [{name, text, lines}]
 */

const fs = require('fs');
const path = require('path');

const JSZip = require('jszip');
// legacy build works under plain Node (no DOM/worker needed for text extraction)
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

/**
 * Turn pdf.js getTextContent() items into lines, grouping by y-coordinate.
 * This is the exact same grouping the browser side (core/dkv-parser.js)
 * uses, so it lives in dkv-parser.js as pdfTextItemsToLines and is just
 * re-exported here for convenience.
 */
const { pdfTextItemsToLines } = require('../../core/dkv-parser.js');

async function extractPdfText(buffer) {
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const pagesLines = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    // DKV pages carry /Rotate 90 — the viewport is what turns raw content-stream
    // coordinates into true on-screen position (see dkv-parser.js comment above
    // pdfTextItemsToLines). Without it, lines interleave unrelated table columns.
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const lines = pdfTextItemsToLines(textContent, viewport);
    pagesLines.push(lines);
  }
  const pageLines = pagesLines.flat();
  const text = pageLines.join('\n');
  return { text, lines: pageLines, pages: pagesLines };
}

async function extractZip(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const entries = Object.values(zip.files)
    .filter((f) => !f.dir && /\.pdf$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const out = [];
  for (const entry of entries) {
    const content = await entry.async('nodebuffer');
    const { text, lines } = await extractPdfText(content);
    out.push({ name: entry.name, text, lines });
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const zipPath = args[0];
  if (!zipPath) {
    console.error('Usage: node extract.js <zip-path> [--dump <out-dir>]');
    process.exit(1);
  }
  const dumpIdx = args.indexOf('--dump');
  const dumpDir = dumpIdx !== -1 ? args[dumpIdx + 1] : null;

  const files = await extractZip(zipPath);
  console.log(`Extracted ${files.length} PDF(s) from ${path.basename(zipPath)}`);

  if (dumpDir) {
    fs.mkdirSync(dumpDir, { recursive: true });
    for (const f of files) {
      const outName = f.name.replace(/[\\/]/g, '_').replace(/\.pdf$/i, '.txt');
      fs.writeFileSync(path.join(dumpDir, outName), f.text, 'utf8');
    }
    console.log(`Dumped text to ${dumpDir}`);
  } else {
    for (const f of files) {
      console.log(`--- ${f.name} (${f.lines.length} lines) ---`);
    }
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { extractZip, extractPdfText };
