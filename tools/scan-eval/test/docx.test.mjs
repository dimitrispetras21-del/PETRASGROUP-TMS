// core/doc-text.js's docxToText() — a hand-rolled ZIP central-directory
// reader + WordprocessingML-to-text pass, no library. Only INVENTED documents
// (makeDocx/makeZip/makeDocxBomb, tools/scan-eval/test/synthetic-docs.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { makeZip, makeDocx, makeDocxBomb, SYNTH_DOCX } from './synthetic-docs.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const { docxToText } = require(path.join(REPO, 'core/doc-text.js'));

test('docx: plain paragraph text', async () => {
  const text = await docxToText(makeDocx());
  assert.match(text, new RegExp(`Transport order ${SYNTH_DOCX.reference}`));
});

test('docx: a tab inside a run stays a tab, not a space', async () => {
  const text = await docxToText(makeDocx());
  assert.match(text, new RegExp(`Reference:\\t${SYNTH_DOCX.reference}`));
});

test('docx: table rows/cells — one row per line, columns tab-separated', async () => {
  const text = await docxToText(makeDocx());
  const [c0, c1] = SYNTH_DOCX.table[0], [c2, c3] = SYNTH_DOCX.table[1];
  assert.match(text, new RegExp(`${c0}\\t${c1}`));
  assert.match(text, new RegExp(`${c2}\\t${c3}`));
  // Rows are on separate lines, not run together.
  const lines = text.split('\n');
  assert.ok(lines.some(l => l.includes(c0) && l.includes(c1) && !l.includes(c2)), 'row 1 is its own line');
  assert.ok(lines.some(l => l.includes(c2) && l.includes(c3) && !l.includes(c0)), 'row 2 is its own line');
});

test('docx: header text is included (carrier orders print the reference there)', async () => {
  const text = await docxToText(makeDocx());
  assert.ok(text.includes(SYNTH_DOCX.header), 'header text missing from output');
});

test('docx: footer text is included', async () => {
  const text = await docxToText(makeDocx());
  assert.ok(text.includes(SYNTH_DOCX.footer), 'footer text missing from output');
});

test('docx: a tracked-change deletion (w:del/w:delText) never reaches the output', async () => {
  const text = await docxToText(makeDocx());
  assert.ok(!text.includes(SYNTH_DOCX.deletedText), 'deleted run leaked into the output');
  assert.ok(text.includes('Goods: frozen peas'), 'the run AFTER the deletion must still be read');
});

test('docx: an XML entity (&amp;) decodes to a literal character', async () => {
  const text = await docxToText(makeDocx());
  assert.ok(text.includes('Alpha & Beta Logistics'), 'entity not decoded');
  assert.ok(!text.includes('&amp;'), 'raw entity leaked into the output');
});

test('docx: Greek UTF-8 text decodes correctly', async () => {
  const text = await docxToText(makeDocx());
  assert.ok(text.includes('Παραγγελία μεταφοράς'), 'Greek text corrupted or missing');
});

test('docx: stored (method 0) and deflated (method 8) parts both decode — same fixture, mixed methods', async () => {
  // makeDocx()'s default already mixes methods (document.xml deflated,
  // header1.xml stored) — the assertions above already prove that combo
  // works; this test additionally proves BOTH all-stored and all-deflated
  // decode too, so no method is silently only "accidentally" supported.
  const allStored = await docxToText(makeDocx({ document: 0, header: 0, footer: 0 }));
  const allDeflated = await docxToText(makeDocx({ document: 8, header: 8, footer: 8 }));
  for (const text of [allStored, allDeflated]) {
    assert.match(text, new RegExp(`Transport order ${SYNTH_DOCX.reference}`));
    assert.ok(text.includes(SYNTH_DOCX.header));
  }
});

test('docx: corrupt zip -> clear error, never empty text', async () => {
  await assert.rejects(() => docxToText(Buffer.from('not a zip at all')), /not a zip file/);
  await assert.rejects(() => docxToText(Buffer.from('%PDF-1.4 also not a zip')), /not a zip file/);
});

test('docx: a real zip missing word/document.xml -> clear error', async () => {
  const zip = makeZip([{ name: 'word/other.xml', data: Buffer.from('<x/>'), method: 0 }]);
  await assert.rejects(() => docxToText(zip), /no word\/document\.xml/);
});

test('docx: truncated zip (cut mid-entry) -> clear error, not a crash', async () => {
  const zip = makeDocx();
  await assert.rejects(() => docxToText(zip.subarray(0, zip.length - 40)));
});

test('docx: zip-bomb guard — inflated output past the cap throws instead of hanging/allocating', async () => {
  const bomb = makeDocxBomb(25 * 1024 * 1024); // deflates to a few KB, inflates past the 20MB cap
  await assert.rejects(() => docxToText(bomb), /size limit|zip bomb/);
});

// Review of round 4 (B2): a self-closing skip element must not open a skip.
// Word writes <w:del .../> inside w:rPr for a deleted paragraph mark, and an
// empty field code can be <w:instrText/>; counted as an "open", everything
// after it vanished silently.
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const docXml = body => `<?xml version="1.0"?><w:document ${W_NS}><w:body>${body}</w:body></w:document>`;

test('docx: self-closing w:del / w:instrText do not swallow the rest of the document', async () => {
  const xml = docXml('<w:p><w:r><w:t>BEFORE-2031</w:t></w:r></w:p>'
    + '<w:p><w:pPr><w:rPr><w:del w:id="1" w:author="x" w:date="2031-01-01T00:00:00Z"/></w:rPr></w:pPr><w:r><w:t>MIDDLE-2031</w:t></w:r></w:p>'
    + '<w:p><w:r><w:instrText/></w:r><w:r><w:t>AFTER-2031</w:t></w:r></w:p>');
  const text = await docxToText(makeZip([{ name: 'word/document.xml', data: Buffer.from(xml), method: 0 }]));
  assert.match(text, /BEFORE-2031/);
  assert.match(text, /MIDDLE-2031/);
  assert.match(text, /AFTER-2031/);
});

test('docx: an unclosed skip element costs at most its own paragraph', async () => {
  const xml = docXml('<w:p><w:r><w:instrText>FIELD</w:r></w:p><w:p><w:r><w:t>NEXT-PARA-2031</w:t></w:r></w:p>');
  const text = await docxToText(makeZip([{ name: 'word/document.xml', data: Buffer.from(xml), method: 0 }]));
  assert.match(text, /NEXT-PARA-2031/);
});
