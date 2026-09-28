// ═══════════════════════════════════════════════════════════════════
// ORDER SCAN — ENGINE v2 (scan round 2, 27/9/2026)
//
// Behind a switch: the production scanner stays the old one until the owner
// approves (localStorage 'tms_scan_engine' = 'v2' turns this on per browser).
//
// What changed against v1 and why (measured on the golden set, docs/scan/03-*):
//   • ONE model call per document. v1 made 3–4 (Haiku classifier → tool loop
//     → Haiku JSON clean-up → Opus retry). Structured outputs
//     (output_config.format) guarantee parseable JSON, so the clean-up call
//     and the regex JSON repair have nothing left to do.
//   • TEXT, not pictures, when the document has a text layer (PDF via pdf.js,
//     legacy Word .doc and .docx via core/doc-text.js). A 3-page carrier order costs
//     ~3k tokens as text vs ~7k as PDF. Scans without a text layer (photos,
//     image-only PDFs) still go as the image/PDF itself.
//   • Client / location matching happens HERE, in code, over ALL records the
//     app already has cached (~1,920 clients, ~1,230 locations). v1 sent the
//     model the first 50 clients / 80 locations alphabetically, i.e. a list
//     that almost never contained the right answer. The model only sees a
//     short candidate list pre-selected from names that literally appear in
//     the document, and its pick is re-checked by the deterministic score.
//   • Per-field confidence + a short source quote, so the review screen can
//     show WHERE a value came from.
//   • The static prefix (instructions) is prompt-cached; the schema never
//     changes (a changed output_config.format invalidates the cache).
//
// If it breaks, how do we know? Every failure throws with a message the
// dispatcher sees in the scan panel (never an empty form that looks like
// "the AI found nothing"): unreadable .doc, max_tokens truncation, refusal,
// Worker errors (incl. «credit exhausted», see scanCallAnthropic).
// ═══════════════════════════════════════════════════════════════════

// Measured choice (docs/scan/03-engine-v2-2026-09-27.md): model/effort are
// kept in one object so tools/scan-eval can run the SAME code with other
// settings on the golden set — never a copy of the prompt.
const SCAN_V2 = {
  model: 'claude-sonnet-5',
  effort: 'low',            // output_config.effort
  thinking: 'disabled',     // 'disabled' | 'adaptive'
  mode: 'auto',             // 'auto' | 'text' | 'pdf'  (auto = text when the text layer is usable)
  maxTokens: 4000,
  minCharsPerPage: 150,     // below this a PDF page is treated as a scan (no usable text layer)
  maxClientCandidates: 6,
  maxLocationCandidates: 20,
  // Round 3 (docs/scan/04): ids of LOCATIONS records known to be stored with
  // the wrong country (e.g. an EU address filed under GR — verified in round 2,
  // docs/scan/03 #1). Not populated in production yet — nobody has wired a data
  // -quality registry into the app. tools/scan-eval builds this list read-only
  // (see build-data-quality.mjs) and the eval harness feeds it in for testing;
  // until a real registry exists, the override in _sv2PickLocation stays
  // inert (null) and country mismatches are never crossed — see the comment
  // there for why an empty field beats a wrong guess.
  dataQualityLocationIds: null,
};

function scanEngineV2On() {
  try { return localStorage.getItem('tms_scan_engine') === 'v2'; } catch (e) { return false; }
}

// Files the v2 engine can read (v1 gate: images + PDF only).
function scanV2Accepts(file) {
  const n = (file && file.name || '').toLowerCase();
  return file.type.startsWith('image/') || file.type === 'application/pdf'
    || file.type === 'application/msword' || /\.doc$/.test(n)
    || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/.test(n);
}

// ─── Static prompt (cached prefix) ─────────────────────────────────
const SCAN_V2_SYSTEM = `You extract transport orders for Petras Group / Vermion Fresh, a Greek refrigerated road carrier (FTL and groupage, Greece <-> EU).
The document is a transport order, carrier order or booking confirmation that a CUSTOMER sent to us. We are the carrier.

WHO IS THE CLIENT
- client_name = the company that ordered the transport from us and will pay us: usually the issuer/letterhead/signature company of the document.
- Never Petras, Vermion, Vermion Fresh or any of our addresses (Naousa, Kopanos, Veria) — that is us.
- Never the shipper, supplier or consignee unless it is also the issuer.
- If the header shows an agency, brand or department and the document also names the legal entity behind it (footer with registry number, managing directors, bank details), the client is that legal entity.
- If a CLIENT CANDIDATES list is given, set client_candidate to the matching code (e.g. "C2"); "" if none fits.

STOPS
- One stop per physical address where goods are loaded ("loading") or unloaded ("delivery"), in route order: all loadings first, then deliveries.
- Several consignees listed with pallet splits (e.g. "9PLTS ALPHA / 8PLTS BETA ...") = one delivery stop each, with its pallets.
- company = the company at that address as written; address/postcode/city as written; city in Latin script (transliterate Greek, e.g. ΑΣΠΡΟΠΥΡΓΟΣ -> Aspropyrgos); country = ISO 3166-1 alpha-2 (GR, DE, IT, CZ, AT, HU, BG ...), inferred from postcode prefix, address or language if not printed.
- date = YYYY-MM-DD. If a window or two days are given ("26 & 27/09", "Thursday or Friday"), use the FIRST day. Documents are from 2026 unless the year is printed. time = HH:MM or a short window ("08:00-12:00"), "" if none.
- pallets = pallets loaded/unloaded at that stop, digits only; "" if the stop does not say. Carrier-order tables often repeat the supplier on every unloading row: a loading stop's pallets are those of its loading row(s) only, never loading + unloading rows added together.
- If a LOCATION CANDIDATES list is given, set candidate to the code (e.g. "L4") of the SAME company at the SAME site; a suburb or district of the printed city counts as the same place, a same-named company in another region does not. "" if none is clearly the same.
- ref = the stop's own loading/delivery reference if printed, else "".

FIELDS  (each: v = value, c = confidence 0..1, q = the shortest exact quote from the document that proves v, max 60 chars; v "" and c 0 when the document does not state it)
- reference: the order/transport/booking number the customer uses for this transport (labels like Transport number, Order No, Auftragsnr., Objednávka, Αρ. παραγγελίας). SAP print-outs may show raw field codes instead of labels: the transport order is the code containing TANUM or TKNUM; BKK/BANK codes are bank references. The file name often repeats the reference. Value only, as printed, keep leading zeros. Not a VAT, customer, bank or tax number. If a separate "code"/"kód" number is printed next to one specific loading location (a supplier's own shipment code), prefer THAT over a generic order/contract number at the top of the document — the top number is often the forwarder's own filing number, reused across many unrelated shipments.
- goods: short description of the cargo, in the document's language.
- gross_weight_kg: total gross weight in kg, digits only (22.500 kg -> 22500; 21 t -> 21000). Prefer the value labelled gross weight / weight section over a weight inside a loading instruction. Placeholders such as 0, 1, 1,00 mean "not stated".
- pallets: total pallets loaded on the truck, digits only; count pallets, never crates, boxes or cartons. A cargo line whose article IS pallets (EP, Europaletten, Ευρωπαλέτες) gives the pallet count, whatever unit code follows the number (normally = the sum of the loading stops = the sum of the delivery stops). "Number:" printed next to the weight is the pallet count. Placeholders (1, 1,00) mean "not stated".
- pallet_type: EUR (Euro/EPAL/EP/Europalette/Ευρωπαλέτες), CHEP, or Industrial (IP/Industrie). "" if not stated. A legend listing all pallet codes is not a statement; the code used on the cargo line is.
- temperature_c: the set-point the reefer must hold, a single number (+4C -> 4, -18 -> -18, "0C" -> 0). If the document gives a range, the upper bound for chilled (+2/+8 -> 8) and the lower for frozen. If two different values appear, prefer the one in the goods/cargo section and put the other in warnings. "" for ambient or not stated.
- price: the agreed freight we are paid, total for the transport, number with "." as decimal separator (2.200,00 EUR -> 2200). If priced per pallet/ton, multiply out and say so in warnings. 0,00 means not stated. currency = ISO code (EUR, ...), "" if no price.
- notes: one short line of operationally important instructions (pallet exchange, thermograph print, trailer requirements, slot times, documents to bring). "" if none.
- warnings: anything ambiguous or contradictory a dispatcher must check (conflicting dates/weights/temperatures, unreadable parts, more than one order). Empty list if none.

GENERAL
- One document can hold several separate transport orders (different references or different trucks): return one entry in orders[] for each. Usually there is exactly one.
- Copy values, never invent them. Empty string beats a guess. Confidence below 0.6 means a person must check it.
- Ignore boilerplate terms and conditions, SAP placeholder text ("... was MISSING!"), bank details and legends.`;

const SCAN_V2_SCHEMA = (() => {
  const f = { $ref: '#/$defs/f' };
  const str = { type: 'string' };
  return {
    type: 'object',
    $defs: {
      f: {
        type: 'object',
        properties: { v: str, c: { type: 'number' }, q: str },
        required: ['v', 'c', 'q'],
        additionalProperties: false,
      },
      stop: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['loading', 'delivery'] },
          company: str, address: str, postcode: str, city: str, country: str,
          date: str, time: str, pallets: str, ref: str, candidate: str,
          c: { type: 'number' }, q: str,
        },
        required: ['type', 'company', 'address', 'postcode', 'city', 'country', 'date', 'time', 'pallets', 'ref', 'candidate', 'c', 'q'],
        additionalProperties: false,
      },
      order: {
        type: 'object',
        properties: {
          client_name: f, client_candidate: str, reference: f, goods: f, gross_weight_kg: f,
          pallets: f, pallet_type: f, temperature_c: f, price: f, currency: str,
          stops: { type: 'array', items: { $ref: '#/$defs/stop' } },
          notes: str,
          warnings: { type: 'array', items: str },
        },
        required: ['client_name', 'client_candidate', 'reference', 'goods', 'gross_weight_kg', 'pallets', 'pallet_type',
          'temperature_c', 'price', 'currency', 'stops', 'notes', 'warnings'],
        additionalProperties: false,
      },
    },
    properties: { orders: { type: 'array', items: { $ref: '#/$defs/order' } } },
    required: ['orders'],
    additionalProperties: false,
  };
})();

// ─── Text layer ────────────────────────────────────────────────────
/**
 * PDF text via pdf.js, rebuilt into visual lines. pdf.js returns glyph runs in
 * content-stream order, which for table-heavy carrier orders is not reading
 * order, and splits accented letters into their own runs ("M ü nchen"): runs are
 * grouped by baseline, sorted by x, and joined without a space when they touch.
 */
async function scanV2PdfText(buf) {
  const pdfjs = await _scanLoadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice ? buf.slice(0) : buf), isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      const size = Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || 8;
      let row = rows.find(r => Math.abs(r.y - y) <= size * 0.35);
      if (!row) { row = { y, runs: [] }; rows.push(row); }
      row.runs.push({ x, w: it.width || 0, s: it.str, size });
    }
    rows.sort((a, b) => b.y - a.y);
    const lines = rows.map(r => {
      r.runs.sort((a, b) => a.x - b.x);
      let out = '', end = null;
      for (const run of r.runs) {
        if (end != null) {
          const gap = run.x - end;
          out += gap < run.size * 0.15 ? '' : gap < run.size * 1.5 ? ' ' : '   ';
        }
        out += run.s.trim() === run.s ? run.s : run.s.trim();
        end = run.x + run.w;
      }
      return out;
    });
    pages.push(lines.join('\n'));
  }
  return { pages: pages.length, perPage: pages, text: pages.map((t, i) => (pages.length > 1 ? `--- page ${i + 1} ---\n` : '') + t).join('\n\n') };
}

/** { kind: 'text'|'pdf'|'image', text?, pages?, base64?, mediaType?, why } */
async function scanV2PrepareInput(file, mode = SCAN_V2.mode) {
  const name = (file.name || '').toLowerCase();
  const buf = await file.arrayBuffer();
  if (file.type === 'application/msword' || /\.doc$/.test(name)) {
    let text;
    try { text = docLegacyToText(buf); }
    catch (e) { throw new Error(`Δεν διαβάζεται το Word αρχείο (${e.message}) — αποθηκεύστε το ως PDF και ξαναδοκιμάστε.`); }
    if (text.replace(/\s+/g, '').length < 40) throw new Error('Το Word αρχείο δεν έχει κείμενο — αποθηκεύστε το ως PDF και ξαναδοκιμάστε.');
    return { kind: 'text', text, pages: null, why: 'doc' };
  }
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/.test(name)) {
    let text;
    try { text = await docxToText(buf); }
    catch (e) { throw new Error(`Δεν διαβάζεται το Word αρχείο (${e.message}) — αποθηκεύστε το ως PDF και ξαναδοκιμάστε.`); }
    if (text.replace(/\s+/g, '').length < 40) throw new Error('Το Word αρχείο δεν έχει κείμενο — αποθηκεύστε το ως PDF και ξαναδοκιμάστε.');
    return { kind: 'text', text, pages: null, why: 'docx' };
  }
  if (file.type === 'application/pdf' || /\.pdf$/.test(name)) {
    const b64 = () => _scanArrayBufferToBase64(buf);
    if (mode === 'pdf') return { kind: 'pdf', base64: b64(), mediaType: 'application/pdf', why: 'forced' };
    let t = null;
    try { t = await scanV2PdfText(buf); } catch (e) { console.warn('[scan v2] pdf text layer failed:', e && e.message); }
    // A trailing stamp/blank page must not push a good text layer to the image route.
    const chars = t ? t.perPage.map(pg => pg.replace(/\s+/g, '').length) : [];
    const dense = t && chars[0] >= SCAN_V2.minCharsPerPage && chars.reduce((a, b) => a + b, 0) / chars.length >= SCAN_V2.minCharsPerPage;
    if (dense || (t && mode === 'text')) return { kind: 'text', text: t.text, pages: t.pages, why: 'text-layer' };
    return { kind: 'pdf', base64: b64(), mediaType: 'application/pdf', why: t ? 'thin-text-layer' : 'no-text-layer' };
  }
  // Images: same auto-rotate/resize as v1.
  const pre = await scanPreprocessFile(file);
  return { kind: 'image', base64: pre.base64, mediaType: pre.mediaType, why: 'image' };
}

function _scanArrayBufferToBase64(buf) {
  const u8 = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

// ─── Deterministic matching over ALL clients / locations ───────────
// Legal forms and filler words carry no identity: "DPS LOGISTICS SA" and
// "DPS LOGISTICS Α.Ε" are the same company.
const _SV2_STOP = new Set(('sa ae a e s o ltd limited gmbh mbh co kg ag ug srl spa sro spol r s bv nv oe ee epe ike ike kft zrt bt '
  + 'sp zoo z oo llc inc plc sas sarl ab as oy doo dd ad eood ood the and of for und et de la le der die das van von '
  + 'company trading group depo depot warehouse').split(' '));
const _SV2_SELF = ['petras', 'vermion'];

function _sv2Norm(s) {
  const t = typeof _fhNorm === 'function' ? _fhNorm(s) : String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return t.replace(/&/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
function _sv2Tokens(s) {
  return _sv2Norm(s).split(' ').filter(w => w.length >= 3 && !_SV2_STOP.has(w) && !/^\d+$/.test(w));
}
function _sv2Lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// Token similarity: exact 1; transliteration/typo variants (inofyta/oinofyta) 0.8.
function _sv2TokSim(a, b) {
  if (a === b) return 1;
  if (a.length >= 5 && b.length >= 5) {
    if (a.startsWith(b) || b.startsWith(a)) return 0.85;
    const d = _sv2Lev(a, b);
    if (d / Math.max(a.length, b.length) <= 0.2) return 0.8;
  }
  return 0;
}

// Index built once per reference list (memoised on the array identity + length).
const _sv2IndexCache = new WeakMap();
function _sv2Index(records, kind) {
  const hit = _sv2IndexCache.get(records);
  if (hit && hit.n === records.length) return hit;
  const items = records.map(r => {
    const f = r.fields || {};
    const name = kind === 'client' ? (f['Company Name'] || '') : (f['Name'] || '');
    const city = kind === 'client' ? '' : (f['City'] || '');
    const cc = kind === 'client' ? null : (typeof countryCode === 'function' ? countryCode(f['Country']) : null);
    return { id: r.id, name, city, cc, toks: [...new Set(_sv2Tokens(name))], cityN: _sv2Norm(city) };
  });
  const df = new Map();
  for (const it of items) for (const t of it.toks) df.set(t, (df.get(t) || 0) + 1);
  const idf = t => Math.log(1 + items.length / (df.get(t) || 0.5));
  const idx = { n: records.length, items, idf, df, byId: new Map(items.map(i => [i.id, i])) };
  _sv2IndexCache.set(records, idx);
  return idx;
}

function _sv2Acronym(toks) { return toks.map(t => t[0]).join(''); }

// Weighted token overlap (0..1) between a query name and a record name.
function _sv2NameScore(qToks, item, idf) {
  if (!qToks.length || !item.toks.length) return 0;
  // Abbreviation / compound-word identity (round 4, docs/scan/04 task 3):
  // plain per-token overlap scores ZERO when a company is filed under an
  // initialism ("BRD XYZ") but the document spells it out ("Blue Ridge
  // Dairy"), or the reverse — the document says "COLD LINE" as two words,
  // the record has it glued into one, "Coldline". Found by hand: this let an
  // UNRELATED record that merely shares ordinary words (e.g. the delivery
  // city) outscore the actually-correct one. Either direction counts as a
  // full identity match, whichever side is abbreviated.
  const qJoin = qToks.join(''), itJoin = item.toks.join('');
  const qAcr = _sv2Acronym(qToks), itAcr = _sv2Acronym(item.toks);
  const isAbbrev = t => t.length >= 2 && t.length <= 6 && /^[a-z]+$/.test(t);
  const identity =
    (qToks.length >= 2 && item.toks.some(t => t === qAcr && isAbbrev(t))) ||
    (item.toks.length >= 2 && qToks.some(t => t === itAcr && isAbbrev(t))) ||
    (qJoin.length >= 6 && item.toks.includes(qJoin)) ||
    (itJoin.length >= 6 && qToks.includes(itJoin));
  if (identity) return 0.9;
  let hit = 0;
  for (const q of qToks) {
    let best = 0;
    for (const t of item.toks) { const s = _sv2TokSim(q, t); if (s > best) best = s; if (best === 1) break; }
    hit += best * idf(q);
  }
  const qW = qToks.reduce((s, q) => s + idf(q), 0);
  const tW = item.toks.reduce((s, t) => s + idf(t), 0);
  // Half overlap (Dice), half "is everything the document says in this
  // record": "ACME" vs "Acme Fruits SA" is the same firm even
  // though the record has an extra word.
  return (2 * hit) / (qW + tW) * 0.5 + (hit / qW) * 0.5;
}
function _sv2CitySim(a, b) {
  if (!a || !b) return 0;
  if (a === b || a.includes(b) || b.includes(a)) return 1;
  return _sv2TokSim(a.replace(/ /g, ''), b.replace(/ /g, '')) >= 0.8 ? 0.8 : 0;
}

// ─── Client order history (round 3) ─────────────────────────────────
// A duplicate pair of location records (same company, two neighbouring towns)
// scores almost identically on name/city and used to fall through to "leave
// empty" (docs/scan/03 #2). The client's OWN past orders are a real fact, not
// a guess: if they have used exactly one of the tied records before, that
// breaks the tie. Memoised per client id for the lifetime of the page/process
// — a client's site list changes rarely enough that a stale answer for a few
// minutes is harmless, and refetching per stop inside one scan would be four
// round trips for a four-stop order.
const _sv2HistoryCache = new Map();
async function scanV2ClientHistoryLocations(clientId) {
  if (!clientId) return new Set();
  if (_sv2HistoryCache.has(clientId)) return _sv2HistoryCache.get(clientId);
  const p = (async () => {
    try {
      if (typeof atGetAll !== 'function' || typeof TABLES === 'undefined' || typeof F === 'undefined') return new Set();
      const filter = `FIND("${clientId}",ARRAYJOIN({${F.CLIENT}},","))>0`;
      const fields = [F.LOADING_LOC1, F.LOADING_LOC2, F.LOADING_LOC3, F.UNLOADING_LOC1, F.UNLOADING_LOC2, F.UNLOADING_LOC3];
      // Read-only GET through the same facade/cache the rest of the app uses
      // (core/api.js atGetAll) — no write path touched, ORDERS stays SELECT-only.
      const recs = await atGetAll(TABLES.ORDERS, { filterByFormula: filter, fields }, true);
      const ids = new Set();
      for (const r of recs) for (const fld of fields) for (const id of (r.fields?.[fld] || [])) ids.add(id);
      return ids;
    } catch (e) { console.warn('[scan v2] client history lookup failed:', e && e.message); return new Set(); }
  })();
  _sv2HistoryCache.set(clientId, p);
  return p;
}

// The eval harness (tools/scan-eval) scans MANY documents in one process/vm
// context to avoid re-loading the app for every doc — but that means the
// module-level cache above would happily survive from one golden document to
// the next. Two different golden docs can share a client (they do, in the
// current set), each with its OWN exclude-the-answer-key filter (run-current.
// mjs's scanExcludeFor); without a reset between docs, the SECOND doc would
// silently get the FIRST doc's (differently-filtered) cached history —
// exactly the leakage this cache was never designed to prevent, because in
// the real browser there is only ever one client's context at a time and no
// "exclude" concept at all. A no-op in production (never called there).
function scanV2ResetPerScanCaches() {
  _sv2HistoryCache.clear();
}

// Address text for postcode matching (LOCATIONS records don't carry a
// dedicated postcode column — CLAUDE.md confirms only Name/City/Country/
// Address). Fetched once, separately from the shared getRefLocations() list,
// so this file's extra column never touches core/api.js's cached reference
// shape used by every other module (prime directive: no unrequested cache
// changes elsewhere).
let _sv2AddrMapPromise = null;
async function scanV2LocationAddressMap() {
  if (_sv2AddrMapPromise) return _sv2AddrMapPromise;
  _sv2AddrMapPromise = (async () => {
    try {
      if (typeof atGetAll !== 'function' || typeof TABLES === 'undefined') return new Map();
      const recs = await atGetAll(TABLES.LOCATIONS, { fields: ['Address'] }, true);
      return new Map(recs.map(r => [r.id, _sv2Norm(r.fields && r.fields.Address || '')]));
    } catch (e) { console.warn('[scan v2] location address lookup failed:', e && e.message); return new Map(); }
  })();
  return _sv2AddrMapPromise;
}

// ─── Confidence calibration (round 3) ────────────────────────────────
// Round 2 measured buckets below 0.5 confidence at 80-94% correct (docs/scan/
// 03) — the model hedges even when the quote it gave IS in the document.
// A verified quote is cheap, independent evidence the extraction is real
// (copied, not invented); an unverifiable one (paraphrase, or none given) is
// the opposite signal. Blending both beats trusting either alone.
function _sv2QuoteVerified(q, text) {
  if (!q || !text) return null;           // nothing to check (image/PDF input, or no quote)
  const nq = _sv2Norm(q);
  if (!nq) return null;
  return _sv2Norm(text).includes(nq);
}
function _sv2Calibrate(rawC, q, text) {
  const v = _sv2QuoteVerified(q, text);
  if (v == null) return rawC;             // no text layer to check against — leave as reported
  return v ? Math.max(rawC, 0.92) : Math.min(rawC, 0.4);
}
// Same idea for a match re-checked deterministically against ALL records
// (not just the model's shortlist): a near-certain code match (score >= 0.85)
// is itself real evidence, so the BETTER of the two signals wins instead of
// the worse one (a plain Math.min reproduced the same under-confidence bug —
// a hedging model score dragging down an already-verified match).
function _sv2Combine(modelC, matchC) {
  if (matchC <= 0) return 0;
  if (matchC >= 0.85) return Math.max(modelC, matchC);
  return Math.min(Math.max(modelC, 0.3), matchC + 0.15);
}

// ─── Pallet count fallback (round 3) ─────────────────────────────────
// Carrier orders print the cargo summary as one line, e.g.
// "Weight: 3 500,00 kg, Number: 33,00, CBM: 75,00, LDM: 13,60" — the pallet
// count is "Number:". The model reads this correctly most of the time but not
// always (round 2: empty in 1 of 3 runs on the same document, docs/scan/03
// #3) even though the prompt already calls this pattern out. A deterministic
// regex reads the same line the model had; used only when the model left
// pallets empty, and always flagged with a warning so it is never silently
// trusted over a value a person or the model actually stated.
function _sv2PalletsFromText(text) {
  if (!text) return null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+/g, ' ');
    // Require both "Number:" and "LDM" on the line: the anchor that this is
    // the cargo-summary line, not an unrelated "Order Number" elsewhere.
    const m = /number\s*:\s*([\d]+(?:[.,]\d+)?)[^\n]*\bldm\b/i.exec(line);
    if (!m) continue;
    const n = _sv2Num(m[1]);
    // "1" / "1,00" is the same placeholder-for-not-stated the model is told
    // to ignore (SCAN_V2_SYSTEM) — a fallback must honour the same rule.
    if (n && n > 1 && n <= 40) return Math.round(n);
  }
  return null;
}

/** Client: ranked [{id, name, score}] for an extracted name. */
function scanV2RankClients(name, clients) {
  const idx = _sv2Index(clients, 'client');
  const q = [...new Set(_sv2Tokens(name))];
  if (!q.length) return [];
  return idx.items.map(it => ({ id: it.id, name: it.name, score: _sv2NameScore(q, it, idx.idf) }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * Location: every plausible record for an extracted stop, best first.
 * @param {Map<string,string>} [addrMap] record id -> normalised Address text
 *   (scanV2LocationAddressMap) — a postcode printed on the document, matched
 *   against the record's stored address, tells two same-named-company,
 *   same-country duplicates apart when city spelling alone cannot (round 3,
 *   docs/scan/04 task 3: "suburb vs registered city, duplicate records").
 */
function _sv2ScoreLocation(stop, it, idx, addrMap) {
  const city = _sv2Norm(stop.city);
  // "ACME - CITYNAME": the city inside a company line is not part of the
  // name — left in, it made every "..., CITYNAME" record look alike.
  if (!stop._q) {
    const all = [...new Set(_sv2Tokens(stop.company))];
    const noCity = all.filter(t => !city.split(' ').includes(t));
    stop._q = noCity.length ? noCity : all;
  }
  const q = stop._q;
  // The record's city may be written anywhere in the stop ("ACME EXPRESS
  // CITYNAME LTD" with a suburb as city), and records often carry the city
  // only in the name ("Chain Storename, AT").
  const hay = stop._hay || (stop._hay = ' ' + _sv2Norm([stop.company, stop.address, stop.city].join(' ')) + ' ');
  const cityToks = city.split(' ').filter(w => w.length >= 3);
  const nameS = _sv2NameScore(q, it, idx.idf);
  // Postcode is a stronger locator than city spelling (a suburb's postcode
  // still narrows to the parent city's registered record). Digits only: the
  // document may print "GR-54628" or "54628 Thessaloniki".
  const pc = (stop.postcode || '').replace(/\D/g, '');
  const addr = addrMap && addrMap.get(it.id);
  const pcHit = pc.length >= 3 && addr && addr.includes(pc) ? 0.95 : 0;
  const cityS = Math.max(_sv2CitySim(city, it.cityN),
    it.cityN && it.cityN.length >= 4 && hay.includes(' ' + it.cityN + ' ') ? 0.9 : 0,
    cityToks.some(c => it.toks.includes(c)) ? 0.9 : 0,
    pcHit);
  const cc = stop._cc !== undefined ? stop._cc : (stop._cc = typeof countryCode === 'function' ? countryCode(stop.country) : null);
  const sameCountry = !cc || !it.cc || cc === it.cc;
  let score = 0.65 * nameS + 0.35 * cityS;
  if (!sameCountry) score *= 0.4;            // wrong country: almost never the same place
  return { id: it.id, label: [it.name, it.city, it.cc].filter(Boolean).join(', '), score, nameS, cityS, sameCountry, pcHit: pcHit > 0 };
}
function scanV2RankLocations(stop, locations, limit = 5, addrMap) {
  const idx = _sv2Index(locations, 'location');
  const out = [];
  for (const it of idx.items) {
    const r = _sv2ScoreLocation(stop, it, idx, addrMap);
    if (r.nameS >= 0.2 || r.cityS >= 1) out.push(r);
  }
  out.sort((a, b) => b.score - a.score);
  return limit ? out.slice(0, limit) : out;
}

/**
 * Candidates for the prompt: records whose distinctive name words literally
 * appear in the document text. Cheap (no model), and gives the model the ids
 * it could never guess. Empty when the document has no text layer.
 */
function scanV2Candidates(text, records, kind, max) {
  if (!text || !records || !records.length) return [];
  const idx = _sv2Index(records, kind);
  const counts = new Map();
  for (const w of _sv2Norm(text).split(' ')) if (w.length >= 3) counts.set(w, (counts.get(w) || 0) + 1);
  const byLen = new Map();
  for (const w of counts.keys()) { if (!byLen.has(w.length)) byLen.set(w.length, []); byLen.get(w.length).push(w); }
  // Occurrences of a record word in the text, allowing one typo for long words
  // (the document spells a name with B, the record with P).
  const memo = new Map();
  const occ = t => {     // { n: occurrences, w: 1 exact | 0.6 one-typo }
    if (memo.has(t)) return memo.get(t);
    let r = { n: counts.get(t) || 0, w: 1 };
    if (!r.n && t.length >= 6) {
      let n = 0;
      for (const L of [t.length - 1, t.length, t.length + 1]) {
        for (const w of byLen.get(L) || []) if (w[0] === t[0] && _sv2Lev(w, t) <= 1) n += counts.get(w);
      }
      r = { n, w: 0.6 };
    }
    memo.set(t, r);
    return r;
  };
  const scored = [];
  for (const it of idx.items) {
    if (kind === 'client' && _SV2_SELF.some(s => it.toks.includes(s))) continue;
    const hit = it.toks.filter(t => occ(t).n > 0);
    // At least one DISTINCTIVE word (in <=4 records) must appear exactly, or
    // a long one with a typo: "fresh", "logistics", "fruit" alone would pull
    // in half the list.
    if (!hit.some(t => (idx.df.get(t) || 0) <= 4 && (occ(t).w === 1 || t.length >= 8))) continue;
    const coverage = hit.reduce((a, t) => a + occ(t).w, 0) / it.toks.length;
    let s = hit.reduce((a, t) => a + occ(t).w * idx.idf(t) * (1 + 0.3 * Math.log(occ(t).n)), 0) * (0.5 + coverage);
    if (kind === 'location' && it.cityN && it.cityN.split(' ').every(w => occ(w).n > 0)) s += 3;
    scored.push({ it, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, max).map((x, i) => ({
    code: (kind === 'client' ? 'C' : 'L') + (i + 1), id: x.it.id,
    label: kind === 'client' ? x.it.name : [x.it.name, x.it.city, x.it.cc].filter(Boolean).join(' | '),
  }));
}

/**
 * @param {Set<string>} [history] location ids this client used on past orders
 *   (scanV2ClientHistoryLocations) — breaks ties between duplicate records.
 * @param {Set<string>} [dqFlags] location ids KNOWN to carry the wrong country
 *   (tools/scan-eval data-quality scan; null in production — see SCAN_V2
 *   .dataQualityLocationIds). Only with both this AND history do we cross a
 *   country mismatch; see the comment at that branch for why.
 * @param {Map<string,string>} [addrMap] scanV2LocationAddressMap
 */
function _sv2PickLocation(stop, cands, locations, history, dqFlags, addrMap) {
  const ranked = scanV2RankLocations(stop, locations, 0, addrMap);
  const idx = _sv2Index(locations, 'location');
  const [a, b] = ranked;
  const cand = stop.candidate && cands.find(c => c.code === stop.candidate.trim());

  // Duplicate records for the same company in neighbouring towns score almost
  // identically and used to fall through to "ambiguous, leave empty" (docs/
  // scan/03 #2). A near-tie where the client has used exactly ONE of the
  // contenders before is not ambiguous to a dispatcher who knows this client
  // — it is settled by precedent, so settle it the same way here.
  if (a && history && history.size) {
    const tied = ranked.filter(r => r.score >= a.score - 0.08 && r.nameS >= 0.5);
    if (tied.length > 1) {
      const inHist = tied.filter(r => history.has(r.id));
      if (inHist.length === 1) return { id: inHist[0].id, score: Math.max(0.75, a.score), by: 'history-tiebreak' };
    }
  }

  if (cand) {
    const r = _sv2ScoreLocation(stop, idx.byId.get(cand.id), idx, addrMap);
    if (r.sameCountry && (r.nameS >= 0.25 || r.cityS >= 0.8) && (!a || r.score >= a.score - 0.1)) {
      return { id: cand.id, score: Math.max(0.7, r.score), by: 'model+check' };
    }
    // Country mismatch: a bare name/city match is not enough on its own to
    // override what the document itself says about the country (a same-named
    // company abroad is common). We only cross it when TWO independent facts
    // agree: the client has actually shipped to/from this exact record before
    // (history — not a guess), AND the record is already confirmed bad by a
    // data-quality pass (dqFlags), so the mismatch is a known DATA error, not
    // a real difference. Neither signal alone is enough (round 3 decision,
    // docs/scan/04): an empty field with a warning beats a wrong pick.
    if (!r.sameCountry && history && history.has(cand.id) && dqFlags && dqFlags.has(cand.id)
        && (r.nameS >= 0.25 || r.cityS >= 0.8)) {
      return { id: cand.id, score: 0.6, by: 'history+dq-override' };
    }
  }
  if (a && a.score >= 0.5 && (!b || a.score - b.score >= 0.04 || a.nameS >= 0.9)) return { id: a.id, score: a.score, by: 'code' };
  // Same distinctive company, same country, city written differently (a
  // suburb, a district): accept only if no other record in that country
  // comes close on the name — and say so through a low score.
  if (a && a.nameS >= 0.75 && a.sameCountry && ranked.filter(r => r.sameCountry && r.nameS >= a.nameS - 0.15).length === 1) {
    return { id: a.id, score: 0.45, by: 'name-only' };
  }
  return { id: null, score: a ? a.score : 0, by: 'none' };
}

function _sv2PickClient(order, cands, clients) {
  const name = order.client_name?.v || '';
  const ranked = scanV2RankClients(name, clients);
  const cand = order.client_candidate && cands.find(c => c.code === order.client_candidate.trim());
  if (cand) {
    const idx = _sv2Index(clients, 'client');
    const s = _sv2NameScore([...new Set(_sv2Tokens(name))], idx.byId.get(cand.id), idx.idf);
    if (s >= 0.3 || !name) return { id: cand.id, name: idx.byId.get(cand.id).name, score: Math.max(0.7, s), by: 'model+check' };
  }
  const [a, b] = ranked;
  if (a && a.score >= 0.6 && (!b || a.score - b.score >= 0.05 || a.score >= 0.95)) return { id: a.id, name: a.name, score: a.score, by: 'code' };
  return { id: null, name: null, score: a ? a.score : 0, by: 'none' };
}

// ─── Value parsing ──────────────────────────────────────────────────
function _sv2Num(v) {
  if (v == null) return null;
  // Unicode minus / dashes ("−18", "–18") must stay a minus: stripped, a
  // frozen load would be prefilled as +18 °C.
  let s = String(v).trim().replace(/[\u2212\u2013\u2014]/g, '-').replace(/[^\d,.\-+]/g, '');
  if (!s || s === '-' || s === '+') return null;
  // "22.500" / "2.200,00" / "21,000" / "8.5"
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (/^\-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function _sv2PalletType(v) {
  const t = String(v || '').toLowerCase();
  if (!t) return null;
  if (/chep/.test(t)) return 'CHEP';
  if (/indus|^ip$/.test(t)) return 'Industrial';
  if (/eur|epal|^ep$|ευρω/.test(t)) return 'EUR';
  return null;
}
function _sv2Date(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

// ─── The call ───────────────────────────────────────────────────────
function scanV2BuildRequest(input, clientCands, locCands, opts = {}) {
  const o = { ...SCAN_V2, ...opts };
  const parts = [];
  if (clientCands.length) parts.push('CLIENT CANDIDATES (code: name)\n' + clientCands.map(c => `${c.code}: ${c.label}`).join('\n'));
  if (locCands.length) parts.push('LOCATION CANDIDATES (code: name | city | country)\n' + locCands.map(c => `${c.code}: ${c.label}`).join('\n'));
  const content = [];
  if (input.kind === 'text') {
    parts.push(`DOCUMENT TEXT (extracted from the file; line breaks approximate the layout)\n<document>\n${input.text}\n</document>`);
  } else {
    content.push({ type: input.kind === 'pdf' ? 'document' : 'image', source: { type: 'base64', media_type: input.mediaType, data: input.base64 } });
  }
  if (opts.fileName) parts.push(`FILE NAME: ${opts.fileName}`);
  parts.push('Extract the transport order(s).');
  content.push({ type: 'text', text: parts.join('\n\n') });
  const req = {
    model: o.model,
    max_tokens: o.maxTokens,
    system: [{ type: 'text', text: SCAN_V2_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema: SCAN_V2_SCHEMA } },
  };
  // Haiku 4.5 takes neither effort nor adaptive thinking.
  if (!/haiku/.test(o.model)) {
    req.output_config.effort = o.effort;
    req.thinking = { type: o.thinking };
  }
  return req;
}

/**
 * One document → the v1-shaped object _scanPreview/_scanOpen already consume,
 * plus `_v2` (per-field confidence/quotes, matches, usage) and `_moreOrders`
 * (orders 2..n of a multi-order document; the form prefills the first).
 */
async function scanV2Extract(file, opts = {}) {
  const o = { ...SCAN_V2, ...opts };
  const input = await scanV2PrepareInput(file, o.mode);
  const clients = (typeof getRefClients === 'function' ? getRefClients() : []) || [];
  const locations = (typeof getRefLocations === 'function' ? getRefLocations() : []) || [];
  const clientCands = input.kind === 'text' ? scanV2Candidates(input.text, clients, 'client', o.maxClientCandidates) : [];
  const locCands = input.kind === 'text' ? scanV2Candidates(input.text, locations, 'location', o.maxLocationCandidates) : [];

  const req = scanV2BuildRequest(input, clientCands, locCands, { ...o, fileName: file.name || '' });
  const t0 = Date.now();
  // One logical call. scanCallAnthropic still retries 5xx/timeouts up to 2× (the
  // Worker gives up at 60 s → worst case ~3 min); a 4xx (credit exhausted) surfaces at once.
  const res = await scanCallAnthropic(req, { timeoutMs: 90000 });
  const ms = Date.now() - t0;
  if (res.stop_reason === 'max_tokens') throw new Error('Η απάντηση του AI κόπηκε (max_tokens) — το έγγραφο είναι πολύ μεγάλο για αυτόματη ανάγνωση.');
  if (res.stop_reason === 'refusal') throw new Error('Το AI αρνήθηκε να διαβάσει το έγγραφο.');
  const text = (res.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  let out;
  try { out = JSON.parse(text); } catch (e) { throw new Error('Μη έγκυρη απάντηση AI (JSON) — ξαναδοκιμάστε.'); }
  const orders = Array.isArray(out.orders) ? out.orders : [];
  if (!orders.length) throw new Error('Το AI δεν βρήκε εντολή μεταφοράς στο έγγραφο.');

  const meta = { engine: 'v2', model: res.model || o.model, input: input.kind, why: input.why, ms, usage: res.usage || null,
    client_candidates: clientCands.length, location_candidates: locCands.length, orders: orders.length,
    text: input.kind === 'text' ? input.text : null };
  // Data-quality flags come from the eval harness only today (SCAN_V2
  // .dataQualityLocationIds is null in production — see its comment).
  const dqFlags = o.dataQualityLocationIds ? new Set(o.dataQualityLocationIds) : null;
  const addrMap = await scanV2LocationAddressMap().catch(() => new Map());
  const mapped = [];
  for (const ord of orders) mapped.push(await _sv2ToV1(ord, clientCands, locCands, clients, locations, meta, { dqFlags, addrMap }));
  const first = mapped[0];
  first._moreOrders = mapped.slice(1);
  if (mapped.length > 1) {
    first._v2.warnings.unshift(`Το έγγραφο περιέχει ${mapped.length} παραγγελίες — προσυμπληρώθηκε η 1η (${mapped.map(m => m.reference || '—').join(', ')}).`);
  }
  return first;
}

async function _sv2ToV1(ord, clientCands, locCands, clients, locations, meta, opts = {}) {
  const { dqFlags = null, addrMap = null } = opts;
  const fv = k => (ord[k] && typeof ord[k].v === 'string' ? ord[k].v.trim() : '');
  const fc = k => (ord[k] && fv(k) ? Number(ord[k].c) || 0 : 0);
  // Calibrated confidence for a top-level field: blends the model's own
  // number with whether its quote is actually IN the document (see
  // _sv2Calibrate). field_confidence (not _v2.fields[k].c, which stays the
  // raw model value for audit) is what the review screen and the eval
  // harness read, so this is where round 3's calibration fix lives.
  const fcCal = k => _sv2Calibrate(fc(k), ord[k] && ord[k].q, meta.text);
  const client = _sv2PickClient(ord, clientCands, clients);
  const history = client.id ? await scanV2ClientHistoryLocations(client.id) : new Set();
  const stops = (ord.stops || []).map(s => {
    const pick = _sv2PickLocation(s, locCands, locations, history, dqFlags, addrMap);
    const cc = typeof countryCode === 'function' ? (countryCode(s.country) || s.country || '') : s.country;
    return {
      type: s.type, location_name: s.company || '', location_id: pick.id, city: s.city || '', city_gr: '', country: cc,
      date: _sv2Date(s.date), time: s.time || '', pallets: _sv2Num(s.pallets), ref: s.ref || '',
      _match: pick, _c: Number(s.c) || 0, _q: s.q || '', address: s.address || '', postcode: s.postcode || '',
    };
  });
  const loading = stops.filter(s => s.type === 'loading');
  const delivery = stops.filter(s => s.type === 'delivery');
  let pallets = _sv2Num(fv('pallets'));
  const loadSum = loading.reduce((a, s) => a + (s.pallets || 0), 0);
  if (!pallets && loadSum) pallets = loadSum;
  const warnings = [...(ord.warnings || [])];
  let palletsFromFallback = false;
  if (!pallets && meta.text) {
    const fb = _sv2PalletsFromText(meta.text);
    if (fb) {
      pallets = fb;
      palletsFromFallback = true;
      warnings.push(`Παλέτες δεν εντοπίστηκαν από το μοντέλο· συμπληρώθηκαν από το κείμενο (Number: ${fb}) — έλεγξε.`);
    }
  }
  // Carrier-order tables repeat the supplier on every unloading row; the model
  // sometimes adds them up (loading row + every unloading row, 27/9). When every delivery
  // states its pallets, their sum is the load — say so, never silently.
  const delSum = delivery.every(s => s.pallets != null) ? delivery.reduce((a, s) => a + s.pallets, 0) : null;
  if (delSum && loading.length === 1 && loading[0].pallets != null && loading[0].pallets !== delSum
      && (loading[0].pallets === 2 * delSum || (loading[0].pallets > 34 && delSum <= 34))) {
    const was = loading[0].pallets;
    warnings.push(`Παλέτες φόρτωσης ${was} ≠ άθροισμα παραδόσεων ${delSum} — κρατήθηκε ${delSum}, έλεγξε.`);
    loading[0].pallets = delSum;
    if (pallets === was || pallets > 34 || pallets === 2 * delSum) pallets = delSum;
  }
  if (pallets && pallets > 34) warnings.push(`${pallets} παλέτες σε ένα φορτηγό — έλεγξε (μέγιστο ~33-34).`);
  if (pallets && loading.length === 1 && loading[0].pallets == null) loading[0].pallets = pallets;
  if (pallets && delivery.length === 1 && delivery[0].pallets == null) delivery[0].pallets = pallets;

  // Pallet type default (round 4, docs/scan/04): the great majority of this
  // fleet's carrier orders never print a pallet type at all — a mechanical
  // check of 30 new documents found the type simply absent from the text in
  // every "wrong" case, never a different type the model misread. EUR is the
  // fleet's overwhelming convention (round 4 golden: ~88% of stated types).
  // Guessing it when nothing is printed is still a guess, so it always stays
  // below the "must check" line (SCAN_V2_SYSTEM: <0.6) and always warns —
  // same pattern as the pallets-from-text fallback above, never silent.
  let palletType = _sv2PalletType(fv('pallet_type'));
  let palletTypeDefaulted = false;
  if (!palletType && pallets) {
    palletType = 'EUR';
    palletTypeDefaulted = true;
    warnings.push('Τύπος παλέτας δεν αναφέρεται στο έγγραφο — υποτέθηκε EUR (συνηθισμένος τύπος), έλεγξε.');
  }

  // Direction is a fact about the route, not something to ask the model for.
  const lc = loading[0]?.country, dc = delivery[delivery.length - 1]?.country;
  let direction = null;
  if (lc === 'GR' && dc && dc !== 'GR') direction = 'Export';
  else if (lc && lc !== 'GR') direction = 'Import';

  const price = _sv2Num(fv('price'));
  const currency = (ord.currency || '').toUpperCase();
  if (price && currency && currency !== 'EUR') warnings.push(`Τιμή σε ${currency}, όχι EUR — έλεγξε πριν την αποθήκευση.`);
  const temp = _sv2Num(fv('temperature_c'));

  // Ambiguous date window (round 4, docs/scan/04): a document that offers two
  // candidate days for one stop ("Friday or Saturday", "13 ή 14/09") is not
  // settled by the text at all — round 4's golden set found the actual
  // execution date split both ways (sometimes the earlier day, sometimes the
  // later, sometimes neither, once the shipment slipped past both). Picking
  // either option is a genuine 50/50 guess, so this stays a HIGH-confidence
  // guess turning into a silently-wrong prefill; the fix is not to gamble on
  // which day (tried "always later" against the live golden set — it broke
  // as many correct dates as it fixed, see docs/scan/04) but to say so: keep
  // the model's own first-day answer, cap confidence, and warn by name.
  // "FRIDAY 04 or SATURDAY 05/09/2026", "ΚΥΡΙΑΚΗ 13 ή ΔΕΥΤΕΡΑ 14/09/2026": a
  // weekday name (letters) commonly sits between "or"/"ή" and the second day.
  const ambiguousDateInDoc = meta.text && /\b\d{1,2}\s*(?:or|ή)\s*(?:[\p{L}]+\s+)?\d{1,2}\s*[\/.\-]\s*\d{1,2}\b/iu.test(meta.text);
  if (ambiguousDateInDoc) {
    warnings.push('Το έγγραφο δίνει δύο πιθανές ημερομηνίες (π.χ. "04 ή 05") — επιβεβαίωσε τις ημερομηνίες πριν αποθηκεύσεις.');
  }

  const matchConf = m => (m.id ? Math.min(1, m.score + 0.2) : 0);
  const minC = xs => (xs.length ? Math.min(...xs) : 0);
  const stopConf = s => _sv2Combine(_sv2Calibrate(s._c, s._q, meta.text), matchConf(s._match));
  const fieldConf = {
    client_name: client.id ? _sv2Combine(fc('client_name') || 0.5, matchConf(client)) : 0,
    reference: fcCal('reference'),
    pallets: pallets > 34 ? 0.3 : palletsFromFallback ? 0.55 : (fcCal('pallets') || (loadSum ? 0.7 : 0)),
    temperature_c: fcCal('temperature_c'),
    pallet_type: palletTypeDefaulted ? 0.3 : fcCal('pallet_type'),
    dates: Math.min(minC(stops.map(s => (s.date ? _sv2Calibrate(s._c, s._q, meta.text) : 0))), ambiguousDateInDoc ? 0.4 : 1),
    loading_stops: minC(loading.map(stopConf)),
    delivery_stops: minC(delivery.map(stopConf)),
    stop_pallets: minC(stops.filter(s => s.pallets != null).map(s => _sv2Calibrate(s._c, s._q, meta.text))),
  };
  const crit = [fieldConf.client_name, fieldConf.reference || 1, fieldConf.loading_stops, fieldConf.delivery_stops, fieldConf.dates];
  const worst = Math.min(...crit);
  const quotes = {};
  for (const k of ['client_name', 'reference', 'goods', 'gross_weight_kg', 'pallets', 'pallet_type', 'temperature_c', 'price']) {
    if (ord[k]) quotes[k] = { v: fv(k), c: fc(k), q: ord[k].q || '' };
  }
  return {
    client_name: fv('client_name'),
    client_id: client.id,
    reference: fv('reference') || null,
    goods: fv('goods') || null,
    gross_weight_kg: _sv2Num(fv('gross_weight_kg')) || null,
    pallets: pallets || null,
    pallet_type: palletType,
    temperature_c: temp,
    direction,
    price_eur: price || null,
    notes: [ord.notes, ...warnings].filter(Boolean).join(' · ') || null,
    confidence: worst >= 0.85 ? 'HIGH' : worst >= 0.6 ? 'MEDIUM' : 'LOW',
    field_confidence: fieldConf,
    loading_stops: loading,
    delivery_stops: delivery,
    _engine: 'v2',
    _docType: 'CARRIER_ORDER',
    _model: meta.model,
    _modelLabel: (typeof scanModelLabel === 'function' ? scanModelLabel(meta.model) : meta.model) + ' · v2 · ' + (meta.input === 'text' ? 'κείμενο' : meta.input),
    // meta.text (the full document text, used above only to calibrate
    // confidence) is deliberately left out here — no reason to keep a whole
    // document's text alive in every prefilled form / training example.
    _v2: { ...meta, text: undefined, fields: quotes, client_match: client, warnings },
  };
}

if (typeof window !== 'undefined') {
  Object.assign(window, { SCAN_V2, scanEngineV2On, scanV2Accepts, scanV2Extract, scanV2PrepareInput, scanV2BuildRequest,
    scanV2RankClients, scanV2RankLocations, scanV2Candidates, SCAN_V2_SCHEMA, SCAN_V2_SYSTEM });
}
