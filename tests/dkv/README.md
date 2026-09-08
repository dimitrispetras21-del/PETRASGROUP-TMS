# DKV import — Φ1 (parser + tests)

Spec: `docs/superpowers/specs/2026-09-08-dkv-import-design.md`.

The parser (`core/dkv-parser.js`) is a plain script — no imports, no DOM,
no fetch — so it runs identically in the browser (loaded by `app.html`,
Φ3) and in Node (here). It must be fed text extracted by **pdf.js only**
(`pdfjs-dist@3.11.174`, same version and legacy build the browser loads
from CDN, see `core/scan-helpers.js:175`) — a different PDF library joins
lines differently and the parser would silently stop matching on screen.

## Two test runs

### 1. Real ZIP (`run.js`) — the proof

Loads the real DKV statement ZIP from `.local/dkv/` (gitignored — this
repo is **public**, real supplier/customer data never gets committed, see
`.gitignore` and CLAUDE.md "ΚΑΘΕ SESSION"), extracts every PDF's text with
`pdfjs-dist` legacy build, runs `parseDkv`, and reconciles each
invoice/statement/reverse-charge document's Σ gross against its E-SUMMARY
line (spec §6 gate #1, tolerance 0,01).

```bash
NODE_PATH=/path/to/main-repo/node_modules node tests/dkv/run.js [zip-path]
```

- Default zip path (if omitted): the first `*.ZIP` found in `.local/dkv/` (gitignored — real statements never enter the repo).
- `NODE_PATH` must point at the **main repo's** `node_modules` (this
  worktree does not have its own) — it's where `pdfjs-dist` and `jszip`
  live.
- No ZIP present → the script prints a message and exits 0 (expected on
  CI / a fresh clone — the file is local-only).
- Exit code **1** if any document's parsed Σ gross differs from its
  E-SUMMARY total by more than 0,01 (excluding documents that produced no
  lines at all, which are reported separately as "UNPARSED").

The report:

```
=== DKV Φ1 — per-document reconciliation ===
doc_no | type | country | vehicles | lines | parsed_gross | summary_total | status
...
=== Passages ===
...
=== Unparsed ===
...
=== Unknown product codes ===
...
=== Unknown plates ===
...
=== Totals ===
...
```

- **Per-document table**: one row per invoice/statement/reverse-charge
  document. `status` is `OK` (Σ gross matches E-SUMMARY within 0,01),
  `DIFF <amount>` (doesn't match — this fails the run), `UNPARSED` (zero
  lines extracted — the document's layout isn't recognized), or
  `NO-SUMMARY-MATCH` (parsed fine but no E-SUMMARY row with the same
  doc_no was found).
- **Passages**: how many (plate × day) groups were extracted, and how
  many of the AT-style groups' `Ref.` successfully joins to an invoice
  line's transaction number (spec §1: "Ref. equals the tail of the
  transaction number").
- **Unparsed**: documents/lines the parser gave up on. On the real
  31/08/2026 ZIP this section is **empty** — including the RS invoice,
  which the spec flagged as a likely casualty of its 5-page layout (that
  was written from a pypdf-based read; pdf.js, with the page-rotation fix
  below, parses it fine).
- **Unknown product codes**: product codes seen in the data that aren't
  in the seed map (`core/dkv-parser.js` `PRODUCT_CATEGORY`). This is
  **by design** (spec §6 gate #4) — those lines get `category: 'other'`
  and are flagged rather than silently guessed at. Confirmed harmless
  ones (DE toll code 0900, RO 0519, HR 0533, RS 0517, and the GR
  Reverse-Charge DKV-service codes 0920/0922/01AP/0BGS/0CZS/0DES/0PLS)
  become real seed-map entries once product names are confirmed with the
  owner — until then they route to `other` correctly rather than being
  mis-categorized.
- **Unknown plates**: skipped unless `.local/dkv/plates.json` exists (a
  JSON array of known plate strings, gitignored, not provided) — per the
  task instructions, this check is optional and silently skipped when the
  file is absent.

### 2. Synthetic fixtures (`run-synthetic.js`) — the regression test

```bash
node tests/dkv/run-synthetic.js
```

No `NODE_PATH` needed (`dkv-parser.js` itself has zero dependencies). This
is the test that actually lives in version control: `fixtures/synthetic-
invoice.txt`, `fixtures/synthetic-passages.txt`, `fixtures/synthetic-
summary.txt` are hand-written text shaped exactly like real pdf.js output,
for a fake company ("EXAMPLE FRESH S.A."), fake plates (`XX1234`,
`XX5678`), and fake amounts. It asserts (75 assertions):

- Number parsing (`parseNum`): 2/3/4-decimal European numbers, thousands
  grouping, HUF-style whole numbers with no decimal comma, negative
  (discount) amounts, rejection of non-numeric input.
- Plate normalization: space-stripping, uppercasing, Greek-lookalike →
  Latin mapping.
- Product-code → category mapping, including an unknown code correctly
  falling to `other` and getting flagged (not silently guessed).
- Filename-driven doc-type/country detection for all 6 doc types.
- Currency-label detection across German/Polish/Hungarian header variants,
  defaulting to EUR when no label is found.
- `halfMonthBounds` for both halves of a month, including a non-leap
  February.
- A full `parseDkv` run over the 3 fixtures: the no-vehicle general fee
  line, a toll line (with plate, category, ref extraction), a fuel line
  (liters + unit price), and the unknown-product-code line all parse with
  the expected fields; Σ gross reconciles against the fixture's E-SUMMARY
  row; the passages group's `Ref.` is a suffix of the toll line's
  transaction number (the join rule from spec §1).

## What extract.js is for

`tests/dkv/extract.js` is the Node-side text extraction helper used by
`run.js`: it unzips with `jszip`, runs `pdfjs-dist` legacy `getDocument` +
`getTextContent()` per page, and turns the items into lines via
`DkvParser.pdfTextItemsToLines` — the exact same function the browser will
call in Φ3, so browser and Node see identical text.

It also has a `--dump` mode for inspecting real extracted text without
running the full parser:

```bash
NODE_PATH=/path/to/main-repo/node_modules node tests/dkv/extract.js \
  /path/to/zip --dump .local/dkv/text
```

Writes one `.txt` file per PDF into the given (gitignored) directory.

## The page-rotation gotcha (why pdfTextItemsToLines takes a viewport)

DKV statement PDFs are stored with `/Rotate 90` (confirmed via
`page.rotate` on the real ZIP). pdf.js's `getTextContent()` returns item
positions in **raw, unrotated content-stream space** — using those
directly groups text from unrelated table columns into the same "line"
(observed: digits from different amount columns interleaving into
garbage like `"64,4665,22"`). `pdfTextItemsToLines(textContent, viewport)`
combines each item's transform with `page.getViewport({scale:1}).transform`
before grouping by y — that's what turns the raw stream into the actual
on-screen reading order. Both `extract.js` (Node) and the future browser
loader (Φ3) must pass the page's viewport, not just its text content.

## Known unparsed / uncertain areas going into Φ2

- **T4E operator invoices** (BALM/CZE/PLE/BGR) are detected (`doc_type:
  't4e'`) but deliberately not parsed for lines — the spec says they
  don't count again, they're covered by the matching STATEMENT document.
- **Passages docs are not part of the reconciliation gate** — E-SUMMARY
  never lists them, so a passages parsing gap in some locale would not be
  caught by `run.js`'s exit code. Two real layouts exist and are both
  handled (see the comment above `parsePassages` in `core/dkv-parser.js`):
  AT's per-day box-transaction list (has `Ref.`/`Datum:`, joins to an
  invoice line) and the entry/exit gate list used by every other country
  in this ZIP (BG/CZ/DE/HR/HU/PL/SI/SK — no `Ref.`, grouped by each row's
  own entry date instead). Only the AT-style groups can join to an
  invoice line by design — the other countries bill half-month
  aggregates with no per-transaction reference to join against.
- **Station/city splitting** is a best-effort heuristic (last word of the
  free-text block = city, rest = station name) — it is not part of any
  reconciliation gate and has not been verified per-country.
