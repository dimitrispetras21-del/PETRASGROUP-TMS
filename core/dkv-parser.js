/* dkv-parser.js — DKV fuel-card statement parser (Φ1, spec docs/superpowers/specs/2026-09-08-dkv-import-design.md)
 *
 * Plain script, no imports, no DOM, no fetch — runs identically in the
 * browser (loaded by app.html) and in Node (tests/dkv/*, and later the
 * Worker bundle). Text must come from pdf.js only (browser and Node use
 * the same pdfjs-dist@3.11.174 legacy build) — a different extractor
 * joins lines differently and the parser would "work in tests, not on
 * screen" (spec §2).
 *
 * Shapes were derived empirically against the real 31/08/2026 ZIP (31
 * PDFs, all 19 European countries DKV issues in), not guessed from the
 * spec text alone — the spec's line examples were captured with pypdf,
 * which joins differently than pdf.js. Every regex/heuristic below is
 * backed by at least one real transaction line inspected in tests/dkv/.
 */
(function (root) {
  'use strict';

  // Φ2 (Worker) writes this into ct_cost_docs.parser_version on every commit
  // (spec docs/superpowers/specs/2026-09-08-dkv-import-design.md §4 metrics
  // table) so "διορθώσεις ανά 100 γραμμές" can be tracked per parser build,
  // not guessed from a git commit the accountant never sees. Bump on any
  // change to the line-shape or matching rules below.
  var VERSION = '1.0.0';

  // ─── pdf.js text-item → line grouping ────────────────────────────
  /**
   * Combine two PDF transform matrices (each [a,b,c,d,e,f], representing
   * [[a,c,e],[b,d,f],[0,0,1]]) the way pdf.js's Util.transform(m1, m2)
   * does: m1 ∘ m2. No pdfjs dependency needed — it is 6 multiplications.
   */
  function combineTransforms(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
  }

  /**
   * pdf.js getTextContent() gives a flat list of positioned text items in
   * RAW PDF content-stream space. DKV statement pages are stored with
   * `/Rotate 90` (verified on the real 31/08/2026 ZIP: page.rotate === 90),
   * so raw item.transform[4]/[5] are NOT the visual x/y — they are swapped
   * and would group text from unrelated table columns into the same "row"
   * (verified: without the viewport transform, digits from different
   * amount columns interleave into garbage like "64,4665,22"). `viewport`
   * (from page.getViewport({scale:1})) carries the rotation as a
   * transform; combining it with each item's transform (combineTransforms)
   * yields the true on-screen position, matching what a human reading the
   * PDF sees. This is the ONE place browser and Node text extraction share
   * (not duplicated in tests/dkv/extract.js) — it guarantees identical
   * lines in both environments.
   */
  function pdfTextItemsToLines(textContent, viewport) {
    const items = (textContent && textContent.items) || [];
    if (!items.length) return [];
    const vpTransform = (viewport && viewport.transform) || [1, 0, 0, 1, 0, 0];

    // Round y to absorb sub-pixel jitter between glyphs on the same
    // visual line (DKV's layout engine does not perfectly align baselines).
    const Y_TOLERANCE = 2;
    const rows = []; // [{y, items:[{x,str,width}]}]

    for (const it of items) {
      const str = it.str;
      if (str === undefined) continue;
      const combined = combineTransforms(vpTransform, it.transform);
      const x = combined[4];
      const y = combined[5];
      let row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ x, str, width: it.width || 0 });
    }

    // After the viewport transform, y grows downward (top of page = small y).
    rows.sort((a, b) => a.y - b.y);

    const lines = rows.map((row) => {
      row.items.sort((a, b) => a.x - b.x);
      let line = '';
      let prevEnd = null;
      for (const it of row.items) {
        if (prevEnd !== null) {
          const gap = it.x - prevEnd;
          // A gap wider than ~0.5pt is a real word/column boundary; pdf.js
          // already returns `str` chunks that don't span whitespace, so
          // any positive gap of meaningful size is a space in the source.
          if (gap > 0.5) line += ' ';
        }
        line += it.str;
        prevEnd = it.x + it.width;
      }
      return line.replace(/\s+/g, ' ').trim();
    });

    return lines.filter((l) => l.length > 0);
  }

  // ─── number / date helpers ────────────────────────────────────────

  /** Parse a European-formatted number: "1.234,56" (2dp), "149,240" (3dp
   *  liters), "1,9790" (4dp unit price), or a plain thousands-grouped
   *  integer with no decimals at all — "18.846" (HUF, 0 decimal places). */
  function parseNum(raw) {
    if (raw === undefined || raw === null) return null;
    let s = String(raw).trim();
    if (s === '' || s === '-') return null;
    let neg = false;
    if (s.startsWith('-')) { neg = true; s = s.slice(1); }
    if (!/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) && !/^\d+(,\d+)?$/.test(s)) return null;
    s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    if (Number.isNaN(n)) return null;
    return round2(neg ? -n : n);
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /** "17.08.2026" → "2026-08-17" */
  function toIsoDate(ddmmyyyy) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ddmmyyyy || '');
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  /** CZ/HU/PL/BG statement toll lines are billed as one half-month total per
   *  vehicle (spec §1) rather than per-day — the invoice date is the charge
   *  date for the WHOLE period, not a single trip. Split the month at the
   *  15th, matching the T4E operator invoices' own "Billing Period" (seen
   *  on the real T4E PDFs: "01.08.2026 - 15.08.2026" / 16th–end). */
  function halfMonthBounds(ddmmyyyy) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ddmmyyyy || '');
    if (!m) return { from: null, to: null };
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const yyyy = parseInt(m[3], 10);
    // The statement line carries the BILLING date of the half-month, which is
    // the day after the period (T4E docs in the real ZIP: line dated 16.08 =
    // period 01–15/08, line dated 31.08 = period 16–31/08). So a billing day
    // ≤ 16 closes the first half, a day 1–2 closes the previous month's second
    // half, anything later closes the second half. (8/9: the old «dd ≤ 15»
    // rule put every 16.08 line into 16–31 and no passage day ever fitted.)
    if (dd <= 2) {
      const pm = mm === 1 ? 12 : mm - 1;
      const py = mm === 1 ? yyyy - 1 : yyyy;
      const pLast = new Date(py, pm, 0).getDate();
      return { from: `${py}-${pad2(pm)}-16`, to: `${py}-${pad2(pm)}-${pad2(pLast)}` };
    }
    if (dd <= 16) {
      return { from: `${yyyy}-${pad2(mm)}-01`, to: `${yyyy}-${pad2(mm)}-15` };
    }
    const lastDay = new Date(yyyy, mm, 0).getDate();
    return { from: `${yyyy}-${pad2(mm)}-16`, to: `${yyyy}-${pad2(mm)}-${pad2(lastDay)}` };
  }

  // Ελληνικά λατινικόμορφα → λατινικά ισοδύναμα σε πινακίδες (spec §1: IAB1096, IAZ 8302).
  const GREEK_LOOKALIKES = { 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X' };

  function normalizePlate(raw) {
    if (!raw) return null;
    let s = String(raw).trim().toUpperCase();
    s = s.replace(/[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]/g, (ch) => GREEK_LOOKALIKES[ch] || ch);
    s = s.replace(/\s+/g, '');
    return s || null;
  }

  // ─── product code → category seed map (spec §1, §3 — NOT guessed from
  // text: an unknown code must fall to 'other' + get flagged, per spec
  // rule §6.4, not be silently absorbed by a text-based heuristic). ──────
  const PRODUCT_CATEGORY = {
    '0009': 'fuel',       // DIESEL / ON
    '0012': 'fuel',       // PREMIUM DIESEL
    '0016': 'adblue',     // ADBLUE
    '0902': 'tolls',      // Maut A - DKV BOX (AT)
    '0925': 'tolls',      // Tolls BG - DKV BOX
    '0926': 'tolls',      // Úthasználati HU DKV
    '0928': 'tolls',      // Toll PL DKV BOX
    '0933': 'tolls',      // Maut SK - DKV BOX
    '0935': 'tolls',
    '0936': 'tolls',      // Toll CZ DKV BOX
    '0063': 'ferry_train', // bridge toll (DONAU 2 CALAFAT κλπ.)
    '0949': 'dkv',         // Mautsystemgebühr / DKV toll-system fee
    'LI05': 'dkv',         // DKV LIVE Advanced FM
    'LI06': 'dkv',
    '0GRS': 'dkv',         // Service charge bank
  };

  function categoryForProduct(code) {
    if (!code) return 'other';
    return PRODUCT_CATEGORY[code] || 'other';
  }

  // ─── doc type / country / currency detection ──────────────────────
  function detectDocType(name, lines) {
    // Filenames are stable and unambiguous ("...  _AT_E-INVOICE_...",
    // "..._E-List of passages_...") — cheaper and more reliable than
    // scanning translated page text across 19 languages.
    if (/E-SUMMARY/i.test(name)) return 'summary';
    if (/List of passages/i.test(name)) return 'passages';
    if (/E-T4E/i.test(name)) return 't4e'; // operator invoice — covered by the STATEMENT, not counted again (spec §1)
    if (/Reverse Charge/i.test(name)) return 'reverse_charge';
    if (/E-STATEMENT/i.test(name)) return 'statement';
    if (/E-INVOICE/i.test(name)) return 'invoice';
    // Fallback for an unexpected filename: sniff the extracted text.
    const text = lines.join('\n');
    if (/E-SUMMARY/i.test(text)) return 'summary';
    if (/List of passages/i.test(text)) return 'passages';
    if (/Reverse Charge/i.test(text)) return 'reverse_charge';
    if (/STATEMENT OF ACCOUNT/i.test(text)) return 'statement';
    if (/E-INVOICE/i.test(text)) return 'invoice';
    return 'unknown';
  }

  function detectCountry(name) {
    // Filenames: "<customerNo>_<date>_<CC>_<doctype...>.pdf" — CC is the
    // 3rd underscore-separated segment when present (E-SUMMARY has none).
    const parts = name.split('_');
    return /^[A-Z]{2,3}$/.test(parts[2]) ? parts[2] : null;
  }

  const CURRENCY_LABEL_RE = /(?:Currency|Währung|Waluta|Валута|Valuta|Pénznem|Měna|Mena|Moneda)\s*:\s*([A-Za-z]{3})/;
  const CURRENCY_CODES = new Set(['EUR', 'CZK', 'HUF', 'PLN', 'RSD', 'BGN', 'RON']);
  function detectCurrency(lines) {
    const text = lines.join(' ');
    const m = CURRENCY_LABEL_RE.exec(text);
    return m ? m[1].toUpperCase() : 'EUR';
  }

  // "Invoice number:" (Rechnungsnummer/Invoice number) is the number that
  // actually shows up in E-SUMMARY for E-INVOICE / Reverse Charge docs —
  // NOT the "Ticket number DKV" that appears just above it on the same
  // page (verified: AT invoice prints both; E-SUMMARY's Austria row uses
  // the "Invoice number" one, 26/001042475/987). STATEMENT docs only ever
  // print "Document number:", which IS the one E-SUMMARY lists.
  function extractDocNo(lines) {
    const text = lines.join(' ');
    let m = /Invoice number:\s*(\S+)/.exec(text);
    if (m) return m[1];
    m = /Document number:\s*(\S+)/.exec(text);
    if (m) return m[1];
    return null;
  }

  // ─── transaction-line parsing ──────────────────────────────────────
  // ST/LTR/PC/KUS/DB (AT/DE/GR/PL/SK/HU…) plus locale variants seen on the
  // real ZIP: KOM. (HR/RS "komad"), бр./л. (BG Cyrillic "pieces"/"liters").
  const UNIT_TOKENS = new Set(['ST', 'LTR', 'PC', 'KUS', 'DB', 'KOM.', 'бр.', 'л.']);
  const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
  const TIME_RE = /^\d{2}:\d{2}$/;
  const HALFMONTH_REF_RE = /^\d{4}-[A-Z]{2,4}-\d+$/; // "2026-CZE-0000187207"

  /**
   * Parse one transaction data line (already known to start with a date).
   * Column layout differs per country/doc (2 to 9 trailing amount
   * numbers — verified across AT/BG/CZ/DE/GR/HR/HU/PL/RO/RS/SI/SK real
   * lines), but the SUFFIX is stable: the amount columns always end
   * ...[net, vat, gross] (or just [gross] / [net, gross] when the
   * document has no VAT split), optionally followed by one more EUR
   * equivalent when the document currency isn't EUR. So instead of
   * hard-coding a column count per country, we anchor on the unit token
   * (ST/LTR/PC/KUS/DB, always right after the product code) and read the
   * trailing numbers by COUNT + a sanity check (net+vat≈gross), not by
   * per-country position tables.
   */
  function parseTransactionLine(line, ctx) {
    const tokens = line.trim().split(/\s+/);
    if (!DATE_RE.test(tokens[0])) return null;
    const date = tokens[0];

    let unitIdx = -1;
    for (let i = 1; i < tokens.length; i++) {
      if (UNIT_TOKENS.has(tokens[i])) { unitIdx = i; break; }
    }
    if (unitIdx === -1 || unitIdx + 2 > tokens.length) return null; // not a parseable transaction row

    const unit = tokens[unitIdx];
    // Reverse-charge docs (spec §1) insert an extra "Currency" column
    // between Product and Unit (header: "Product Currency Unit Quantity…",
    // verified on the real GR Reverse Charge PDFs) — skip over it so the
    // product code isn't misread as "EUR".
    let codeIdx = unitIdx - 1;
    if (CURRENCY_CODES.has(tokens[codeIdx])) codeIdx--;
    const productCode = tokens[codeIdx];
    const quantity = parseNum(tokens[unitIdx + 1]);
    const amountTokens = tokens.slice(unitIdx + 2);
    const amounts = amountTokens.map(parseNum).filter((n) => n !== null);
    if (!amounts.length) return null;

    const isForeign = ctx.currency && ctx.currency !== 'EUR';
    let remaining = amounts.slice();
    let gross_eur = null;
    if (isForeign) gross_eur = remaining.pop();

    const gross = remaining.length ? remaining[remaining.length - 1] : null;
    let net = null;
    let vat = null;
    if (remaining.length >= 3) {
      const candNet = remaining[remaining.length - 3];
      const candVat = remaining[remaining.length - 2];
      if (gross !== null && Math.abs(candNet + candVat - gross) < 0.02) {
        net = candNet;
        vat = candVat;
      } else {
        net = gross;
        vat = 0;
      }
    } else if (remaining.length === 2) {
      net = remaining[0];
      vat = gross !== null ? round2(gross - net) : null;
    } else if (remaining.length === 1) {
      net = gross;
      vat = 0;
    }
    const unitPrice = remaining.length ? remaining[0] : null;

    // Everything between the date and the product name's start is
    // station/city/transaction-number/time/(kilometer reading) — we don't
    // need to split those precisely (not part of the reconciliation gate),
    // just capture time + the longest digit run as a best-effort `ref` for
    // the passages join, and the rest as free-text `station`.
    const middleEnd = findProductNameStart(tokens, codeIdx);
    const middle = tokens.slice(1, middleEnd);
    const product = tokens.slice(middleEnd, codeIdx).join(' ');

    let time = null;
    let ref = null;
    let halfMonthRef = null;
    const stationWords = [];
    for (const tok of middle) {
      if (TIME_RE.test(tok)) { time = tok; continue; }
      if (HALFMONTH_REF_RE.test(tok)) { halfMonthRef = tok; continue; }
      if (/^\d{6,}$/.test(tok)) {
        if (!ref || tok.length > ref.length) ref = tok;
        continue;
      }
      stationWords.push(tok);
    }
    let station = null;
    let city = null;
    if (stationWords.length > 1) {
      city = stationWords[stationWords.length - 1];
      station = stationWords.slice(0, -1).join(' ');
    } else if (stationWords.length === 1) {
      station = stationWords[0];
    }

    const category = categoryForProduct(productCode);
    const isHalfMonth = ctx.docType === 'statement' && category === 'tolls' && !!halfMonthRef;

    let service_date = null;
    let period_from = null;
    let period_to = null;
    if (isHalfMonth) {
      const bounds = halfMonthBounds(date);
      period_from = bounds.from;
      period_to = bounds.to;
    } else {
      service_date = toIsoDate(date);
    }

    let net_eur = null;
    let vat_eur = null;
    if (isForeign && gross_eur !== null && gross) {
      const fx = gross !== 0 ? gross_eur / gross : null;
      net_eur = fx !== null && net !== null ? round2(net * fx) : null;
      vat_eur = fx !== null && vat !== null ? round2(vat * fx) : null;
    } else if (!isForeign) {
      net_eur = net;
      vat_eur = vat;
    }

    return {
      source: 'DKV',
      doc_type: ctx.docType,
      country: ctx.country,
      vehicle_raw: ctx.vehicle ? ctx.vehicle.raw : null,
      plate: ctx.vehicle ? ctx.vehicle.plate : null,
      card_no: ctx.vehicle ? ctx.vehicle.card_no : null,
      service_date,
      period_from,
      period_to,
      product_code: productCode,
      product,
      category,
      station,
      city,
      time,
      ref,
      quantity,
      unit,
      unit_price: unitPrice,
      net,
      vat,
      gross,
      currency: ctx.currency,
      net_eur,
      vat_eur,
      gross_eur: isForeign ? gross_eur : gross,
      fx_rate: isForeign && gross ? round2(gross_eur / gross) : (isForeign ? null : 1),
    };
  }

  /** Walk back from the product-code token, over the product-name words,
   *  stopping at the first token that is a date/time/long-digit-run/dash-ref
   *  (the boundary between the "middle" section and the product name). */
  function findProductNameStart(tokens, codeIdx) {
    let i = codeIdx - 1; // step onto the last word of the product name
    while (i >= 1) {
      const tok = tokens[i];
      if (TIME_RE.test(tok) || /^\d{6,}$/.test(tok) || HALFMONTH_REF_RE.test(tok) || DATE_RE.test(tok)) {
        return i + 1;
      }
      i--;
    }
    return 1;
  }

  const VEHICLE_RE = /^VEHICLE:\s*(.+?)\s+(?:CARD NO\.?|DKV Box No)\s*:\s*(\S+)/i;

  function parseInvoiceLike(lines, docType, country) {
    const currency = detectCurrency(lines);
    const ctx = { docType, country, currency, vehicle: null };
    const outLines = [];
    const errors = [];

    for (const line of lines) {
      const vm = VEHICLE_RE.exec(line);
      if (vm) {
        ctx.vehicle = { raw: vm[1], plate: normalizePlate(vm[1]), card_no: vm[2] };
        continue;
      }
      if (DATE_RE.test((line.split(/\s+/)[0] || ''))) {
        const parsed = parseTransactionLine(line, ctx);
        if (parsed) {
          outLines.push(parsed);
        } else {
          // A line that starts with a date but doesn't fit our shape —
          // flag it rather than silently dropping it (spec §6.3).
          errors.push({ reason: 'unrecognized-transaction-line', line });
        }
      }
    }
    return { currency, lines: outLines, errors };
  }

  function parseInvoice(lines, country) {
    return parseInvoiceLike(lines, 'invoice', country);
  }
  function parseStatement(lines, country) {
    return parseInvoiceLike(lines, 'statement', country);
  }
  function parseReverseCharge(lines, country) {
    return parseInvoiceLike(lines, 'reverse_charge', country);
  }

  // ─── passages (List of passages) ──────────────────────────────────
  // Two real layouts exist (verified across all 9 "List of passages" PDFs
  // in the ZIP), and only the filename tells you nothing — you have to
  // look at the PAN header line itself:
  //  (a) AT-style (only AT in this ZIP): "PAN <pan> OBU-ID <obu> KFZ-KZ
  //      <plate> Ref. <ref> Datum: <date> DKV BOX EUROPE" — one header per
  //      (plate, day), rows are "<time> <road> <section> <cat> <info> <ext>
  //      <net> <vat> <gross> <currency>", closed by a "» Total" line. This
  //      is the one that joins to an invoice line via `ref` (spec §1).
  //  (b) Entry/exit-style (BG/CZ/DE/HR/HU/PL/SI/SK): "PAN <pan> OBU-ID <obu>
  //      KFZ-KZ <plate> [Emission class ...]" — ONE header for the WHOLE
  //      statement period, no date/ref. Rows are "<entry_date> <entry_time>
  //      <exit_date> <exit_time> <country> <route...> <km> [<air>] <net>"
  //      with only a net amount (0% VAT tolls, matches the aggregated
  //      half-month statements these countries use) — no per-day "Total"
  //      line, so grouping by (plate, day) happens here from each row's
  //      own entry date.
  // The plate is captured as a plate-shaped token (2–3 letters, 3–4 digits,
  // optional 2 letters, optional inner space), never as «everything up to the
  // end»: entry/exit style lists (CZ/DE/PL/SI/SK) append «Emission class …» /
  // «CO2 class …» after the plate, and a lazy `.+?` swallowed it (8/9: plate
  // lengths of 17–38 chars → no passages group ever matched a statement line).
  const PASSAGES_HEADER_RE = /^PAN\s+(\S+)\s+OBU-ID\s+(?:\S+\s+)?KFZ-KZ\s+([A-ZΑ-Ω]{1,3}\s?\d{3,4}\s?[A-ZΑ-Ω]{0,2})(?=\s|$)(?:\s+Ref\.\s+(\S+))?(?:\s+Datum:\s+(\d{2}\.\d{2}\.\d{4}))?(?:\s.*)?$/;
  const PASSAGE_ROW_RE = /^(\d{2}:\d{2})\s+(\S+)\s+(.+?)\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+([A-Z]{3})$/;
  const PASSAGE_TOTAL_RE = /^»\s*(?:Total|Celkem|Общо|Skupaj|Celkovo|Ukupno|Összesen)\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+([A-Z]{3})$/i;
  const ENTRY_EXIT_ROW_RE = /^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\s+(.*)$/;

  function isNumericToken(tok) {
    return parseNum(tok) !== null;
  }

  /** Entry/exit row: trailing numeric tokens are [km] or [km, air, net] or
   *  [km, net] — the exact count varies (Air is sometimes blank), but the
   *  LAST one is always the net amount (verified against every sample
   *  inspected in tests/dkv/). */
  function parseEntryExitRow(line) {
    const m = ENTRY_EXIT_ROW_RE.exec(line);
    if (!m) return null;
    const restTokens = m[3].trim().split(/\s+/);
    let i = restTokens.length - 1;
    while (i >= 0 && isNumericToken(restTokens[i])) i--;
    if (i === restTokens.length - 1) return null; // no trailing number at all
    const net = parseNum(restTokens[restTokens.length - 1]);
    const section = restTokens.slice(0, i + 1).join(' ');
    return { entryDate: m[1], time: m[2], section, net };
  }

  function parsePassages(lines, country) {
    const docCurrency = detectCurrency(lines);
    const groups = [];
    const dayGroupIndex = new Map(); // "plate|isoDate" -> group, for entry/exit-style
    let current = null;   // active AT-style group
    let panCtx = null;    // active entry/exit-style PAN header (no fixed date)

    for (const line of lines) {
      const hm = PASSAGES_HEADER_RE.exec(line);
      if (hm) {
        const plate = normalizePlate(hm[2]);
        if (hm[4]) {
          current = {
            source: 'DKV',
            doc_type: 'passages',
            country,
            pan: hm[1],
            vehicle_raw: hm[2],
            plate,
            ref: hm[3] || null,
            service_date: toIsoDate(hm[4]) || null,
            passages: [],
            net: null,
            vat: null,
            gross: null,
            currency: null,
          };
          groups.push(current);
          panCtx = null;
        } else {
          panCtx = { pan: hm[1], plate };
          current = null;
        }
        continue;
      }

      if (current) {
        const rm = PASSAGE_ROW_RE.exec(line);
        if (rm) {
          current.passages.push({
            time: rm[1],
            road: rm[2],
            section: rm[3],
            net: parseNum(rm[5]),
            vat: parseNum(rm[6]),
            gross: parseNum(rm[7]),
          });
          current.currency = rm[8];
          continue;
        }
        const tm = PASSAGE_TOTAL_RE.exec(line);
        if (tm) {
          // Authoritative per-day total straight from the PDF — preferred
          // over summing our own row parse (avoids float drift).
          current.net = parseNum(tm[2]);
          current.vat = parseNum(tm[3]);
          current.gross = parseNum(tm[4]);
          current.currency = tm[5];
          continue;
        }
      }

      if (panCtx) {
        const er = parseEntryExitRow(line);
        if (er) {
          const isoDate = toIsoDate(er.entryDate);
          const key = panCtx.plate + '|' + isoDate;
          let g = dayGroupIndex.get(key);
          if (!g) {
            g = {
              source: 'DKV',
              doc_type: 'passages',
              country,
              pan: panCtx.pan,
              vehicle_raw: null,
              plate: panCtx.plate,
              ref: null, // entry/exit-style docs carry no per-transaction ref (spec: these countries bill half-month aggregates instead)
              service_date: isoDate,
              passages: [],
              net: 0,
              vat: 0,
              gross: 0,
              currency: docCurrency,
            };
            dayGroupIndex.set(key, g);
            groups.push(g);
          }
          g.passages.push({ time: er.time, road: null, section: er.section, net: er.net, vat: 0, gross: er.net });
          g.net = round2(g.net + (er.net || 0));
          g.gross = g.net;
        }
      }
    }

    return groups;
  }

  // ─── E-SUMMARY (reconciliation gate) ──────────────────────────────
  const SUMMARY_ROW_RE = /^(.+?)\s+(Invoice|Statement of account|Reverse Charge)\s+(\S+)\s+([A-Z]{3})\s+([\d.,-]+)\s+([\d.,-]+)\s+EUR$/;

  function parseSummary(lines) {
    const docs = [];
    for (const line of lines) {
      const m = SUMMARY_ROW_RE.exec(line);
      if (!m) continue;
      docs.push({
        country_label: m[1].trim(),
        doc_type_label: m[2],
        doc_no: m[3],
        currency: m[4],
        total_native: parseNum(m[5]),
        total_eur: parseNum(m[6]),
      });
    }
    return { docs };
  }

  // ─── top level ─────────────────────────────────────────────────────
  function parseDkv(files) {
    const result = {
      docs: [],
      lines: [],
      passages: [],
      summary: null,
      errors: { unparsed: [], unknownProductCodes: [], unknownPlates: [] },
    };
    const seenProductCodes = new Set();

    for (const f of files) {
      const lines = f.lines || (f.text ? f.text.split('\n') : []);
      const docType = detectDocType(f.name, lines);
      const country = detectCountry(f.name);
      const docNo = extractDocNo(lines);
      const docEntry = { name: f.name, doc_type: docType, country, doc_no: docNo, currency: null, lines_count: 0 };
      result.docs.push(docEntry);

      if (docType === 'summary') {
        result.summary = parseSummary(lines);
        continue;
      }
      if (docType === 'passages') {
        const groups = parsePassages(lines, country);
        for (const g of groups) { g.doc_no = docNo; }
        result.passages.push(...groups);
        continue;
      }
      if (docType === 't4e') {
        continue; // operator invoice, covered by the matching STATEMENT (spec §1)
      }
      if (docType === 'invoice' || docType === 'statement' || docType === 'reverse_charge') {
        const parsed = parseInvoiceLike(lines, docType, country);
        docEntry.currency = parsed.currency;
        docEntry.lines_count = parsed.lines.length;
        // seq = position of the line inside its document. It is part of the
        // import_key because DKV's `ref` is NOT unique: two refuels minutes apart
        // share one ref, and reverse-charge pages number every line 0000001.
        // Same file → same order → same key (critic 8/9: 19 collisions without it).
        let seq = 0;
        for (const ln of parsed.lines) {
          ln.doc_no = docNo;
          ln.seq = seq++;
          result.lines.push(ln);
          if (ln.product_code && !PRODUCT_CATEGORY[ln.product_code] && !seenProductCodes.has(ln.product_code)) {
            seenProductCodes.add(ln.product_code);
            result.errors.unknownProductCodes.push(ln.product_code);
          }
        }
        for (const e of parsed.errors) {
          result.errors.unparsed.push({ doc: f.name, doc_no: docNo, ...e });
        }
        // A doc whose text clearly carries money but produced zero lines
        // is a parser gap, not an empty document (spec §6.3).
        if (parsed.lines.length === 0 && /[\d.,]+,\d{2}/.test(lines.join(' '))) {
          result.errors.unparsed.push({ doc: f.name, doc_no: docNo, reason: 'no-lines-parsed' });
        }
        continue;
      }
      // Unknown doc type entirely (e.g. a layout we've never seen).
      result.errors.unparsed.push({ doc: f.name, doc_no: docNo, reason: 'unknown-doc-type' });
    }

    return result;
  }

  const api = {
    VERSION,
    pdfTextItemsToLines,
    combineTransforms,
    parseNum,
    round2,
    toIsoDate,
    halfMonthBounds,
    normalizePlate,
    categoryForProduct,
    PRODUCT_CATEGORY,
    detectDocType,
    detectCountry,
    detectCurrency,
    extractDocNo,
    parseTransactionLine,
    parseInvoice,
    parseStatement,
    parseReverseCharge,
    parsePassages,
    parseSummary,
    parseDkv,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DkvParser = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
