#!/usr/bin/env node
// Round 4 failure-cause analysis (task 1 of docs/scan/04 follow-up).
// For every failed CRITICAL check on the `dev` split, checks — mechanically,
// where the field type allows it — whether the golden (expected) value can be
// found in the source document text at all. This tells apart:
//   (a) engine wrong   — value IS in the document, engine missed/misread it
//   (b) truth not derivable — golden value does not appear in the document
//       (the saved order was changed/defaulted after the document was sent)
//   (d) matching error — right text read, wrong/empty client/location record
// (c) (golden/matching bookkeeping error) is not auto-detectable here; it
// shows up as an "unclear" bucket for a human to look at.
//
// Reads only from .local/ (private, gitignored). Prints an aggregate summary
// (safe for a public-repo commit message) and writes a detailed per-check
// report to a file under .local/ for the operator's own reading.
//
// Usage:
//   node tools/scan-eval/analyze-failures-r4.mjs --golden <golden-full.json> \
//     --results <results.json> --split dev --out <report.md>
import fs from 'node:fs';
import path from 'node:path';
import { scoreRun, filterGolden, CRITICAL } from './lib/score.mjs';
import { normNumber, normPalletType, normText } from './lib/normalize.mjs';

function arg(name, dflt = null) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : dflt;
}

function assertLocal(p, what) {
  if (!path.resolve(p).split(path.sep).includes('.local')) {
    throw new Error(`${what} must live under .local/ (gitignored): ${p}`);
  }
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Builds sha256 -> text lookup by scanning every text/inventory.json sibling
// of the golden dir's text* folders.
function buildTextIndex(goldenDir) {
  const idx = new Map();
  for (const entry of fs.readdirSync(goldenDir)) {
    if (!entry.startsWith('text')) continue;
    const dir = path.join(goldenDir, entry);
    const invPath = path.join(dir, 'inventory.json');
    if (!fs.existsSync(invPath)) continue;
    let inv;
    try { inv = JSON.parse(fs.readFileSync(invPath, 'utf8')); } catch { continue; }
    for (const item of inv) {
      if (!item.sha256) continue;
      const txtPath = path.join(dir, item.file + '.txt');
      if (fs.existsSync(txtPath) && !idx.has(item.sha256)) {
        idx.set(item.sha256, txtPath);
      }
    }
  }
  return idx;
}

function loadLocations(goldenDir) {
  const p = path.join(goldenDir, 'db-locations.json');
  if (!fs.existsSync(p)) return new Map();
  const rows = JSON.parse(fs.readFileSync(p, 'utf8'));
  return new Map(rows.map(r => [r.legacy_id, r]));
}

function loadClients(goldenDir) {
  const p = path.join(goldenDir, 'db-clients.json');
  if (!fs.existsSync(p)) return new Map();
  const rows = JSON.parse(fs.readFileSync(p, 'utf8'));
  return new Map(rows.map(r => [r.legacy_id, r]));
}

// Phone/fax lines are noise for every numeric field check below (a country
// code like "+30" or a 4-digit exchange reads as a plausible pallet count or
// weight fragment otherwise) — found by hand when "+30" in a footer phone
// number false-positived a pallet-count match. Generic (not template-specific):
// any line that smells like a phone/fax number, regardless of sender.
function stripPhoneLines(text) {
  return text.split('\n').filter(line =>
    !/\btel\b|\bfax\b|\bphone\b/i.test(line) &&
    !/\(?\+\)?\s?\d{1,3}[\s.]\d{3,4}[.\s]\d{3,4}/.test(line)
  ).join('\n');
}

function textFor(sha256, textIdx, cache) {
  if (cache.has(sha256)) return cache.get(sha256);
  const p = textIdx.get(sha256);
  let t = null;
  if (p) { try { t = fs.readFileSync(p, 'utf8'); } catch { t = null; } }
  const norm = t ? stripAccents(stripPhoneLines(t).toLowerCase()) : null;
  cache.set(sha256, norm);
  return norm;
}

// Whole-word only (\b...\b) — a naive substring match on "eur" false-positived
// on company names like "...EUROLOGIC A.E." that have nothing to do with
// pallet type (found by hand while checking this script's own output).
const PALLET_WORD_RE = new RegExp(
  '\\b(eur|epal|chep|industrial|dusseldorf|d(?:ü|u)sseldorf)\\b|\\beuro[- ]?pallet(?:s)?\\b', 'i');

function classifyCheck(check, docText, goldenDoc, locations, clients) {
  const reasons = [];
  const exp = check.expected;
  if (docText == null) return { verdict: 'unclear', reason: 'no_text_extracted' };

  if (check.check === 'pallet_type') {
    // A bare "eur" also means the currency (nearly every European order
    // states a price "... EUR") — found by hand: two Czech-template docs
    // false-positived on "2 900,00 eur" (price), not a pallet type at all.
    // Require the word to share a line with a pallet-count/pallet keyword,
    // same guard as the numeric pallet checks below.
    const found = docText.split('\n').some(line => PALLET_WORD_RE.test(line) && /plt|pallet|palet/.test(line));
    return found
      ? { verdict: 'a_candidate', reason: 'pallet_type_word_present_but_wrong' }
      : { verdict: 'b_candidate', reason: 'pallet_type_not_stated_in_doc' };
  }

  if (check.check === 'pallets' || check.check === 'stop_pallets') {
    const n = normNumber(Array.isArray(exp) ? exp[0] : exp);
    if (n == null) return { verdict: 'unclear', reason: 'expected_not_numeric' };
    const asInt = String(Math.trunc(n));
    // Token boundary on BOTH sides must exclude '.'/',' too, or this matches
    // the integer part of a GPS coordinate ("14.765435") or a thousands-cut
    // weight ("22.500") — found by hand checking this script's own output
    // against the source document.
    const re = new RegExp(`(?<![\\d.,])${asInt}(?![\\d.,])`, 'g');
    if (!re.test(docText)) return { verdict: 'b_candidate', reason: 'pallet_count_not_in_doc' };
    // Stronger evidence: the number sits near a pallet-count keyword
    // (same line) rather than being any random number in the document.
    const nearKeyword = docText.split('\n').some(line =>
      new RegExp(`(?<![\\d.,])${asInt}(?![\\d.,])`).test(line) && /plt|pallet|palet/.test(line));
    // A raw digit match with no pallet-context word nearby is almost always
    // coincidence (a street number, a CBM/LDM stat, a page count) rather than
    // a pallet figure the engine misread — verified by hand against several
    // docs (e.g. "METALWEG 15" matched a pallet count of 15 that was never
    // actually stated). Treat it the same as "not in doc" rather than a
    // separate unresolved bucket.
    return nearKeyword
      ? { verdict: 'a_candidate', reason: 'pallet_count_present_but_wrong' }
      : { verdict: 'b_candidate', reason: 'pallet_count_not_in_doc' };
  }

  if (check.check === 'temperature_c') {
    const n = normNumber(Array.isArray(exp) ? exp[0] : exp);
    if (n == null) return { verdict: 'unclear', reason: 'expected_not_numeric' };
    const asInt = Math.trunc(n);
    const variants = [`+${asInt}c`, `${asInt}c`, `-${asInt}c`, `(${asInt}c`, `+${asInt} c`, `${asInt} c`];
    const found = variants.some(v => docText.includes(v));
    return found
      ? { verdict: 'a_candidate', reason: 'temperature_present_but_wrong' }
      : { verdict: 'b_candidate', reason: 'temperature_not_in_doc' };
  }

  if (check.check === 'reference') {
    const raw = String(Array.isArray(exp) ? exp[0] : exp);
    const digits = raw.replace(/[^0-9A-Za-z]/g, '');
    if (!digits) return { verdict: 'unclear', reason: 'expected_empty' };
    const found = digits.length >= 4 && docText.replace(/[^0-9a-z]/g, '').includes(digits.toLowerCase());
    return found
      ? { verdict: 'a_candidate', reason: 'reference_present_but_wrong' }
      : { verdict: 'b_or_c_candidate', reason: 'reference_not_found_verbatim' };
  }

  if (check.check === 'stop_dates') {
    const iso = Array.isArray(exp) ? exp[0] : exp;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return { verdict: 'unclear', reason: 'expected_not_iso_date' };
    const dd = String(+m[3]), mm = String(+m[2]);
    const dd0 = m[3], mm0 = m[2];
    const variants = [`${dd0}/${mm0}`, `${dd0}-${mm0}`, `${dd0}.${mm0}`, `${dd}/${mm}`, `${dd}-${mm}`];
    const found = variants.some(v => docText.includes(v));
    // Ambiguous "day X or day Y" wording is the dominant pattern we saw by
    // hand — detect it so the report can separate "not mentioned at all"
    // from "document offers two options, ops picked one afterwards".
    const hasOr = / or /.test(docText) && /\d{1,2}\s*(\/|-|\.)\s*\d{1,2}/.test(docText);
    if (found) return { verdict: 'a_candidate', reason: 'date_present_but_wrong' };
    return { verdict: 'b_candidate', reason: hasOr ? 'date_ambiguous_or_construct' : 'date_not_in_doc' };
  }

  if (check.check === 'gross_weight_kg' || check.check === 'price') {
    const n = normNumber(Array.isArray(exp) ? exp[0] : exp);
    if (n == null) return { verdict: 'unclear', reason: 'expected_not_numeric' };
    const asInt = String(Math.trunc(n));
    // European docs write weight/price with a thousands '.' ("22.500kg") —
    // search for the digits with the separator optionally present, not just
    // the bare integer (which would never match "22.500" as one token).
    const withSep = asInt.length > 3
      ? asInt.slice(0, asInt.length - 3) + '[.,]?' + asInt.slice(-3) : asInt;
    const re = new RegExp(`(?<![\\d.,])${withSep}(?![\\d.,])`);
    const found = re.test(docText);
    return found
      ? { verdict: 'a_candidate', reason: `${check.check}_present_but_wrong` }
      : { verdict: 'b_candidate', reason: `${check.check}_not_in_doc` };
  }

  if (check.check === 'client_id') {
    const id = Array.isArray(exp) ? exp[0] : exp;
    const rec = clients.get(id);
    if (!rec) return { verdict: 'unclear', reason: 'client_record_missing' };
    const name = stripAccents(String(rec.name || '').toLowerCase());
    const tokens = name.split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4);
    const hit = tokens.length && tokens.some(t => docText.includes(t));
    return hit
      ? { verdict: 'd_candidate', reason: 'client_name_present_wrong_or_empty_match' }
      : { verdict: 'b_or_c_candidate', reason: 'client_name_not_recognisable_in_doc' };
  }

  if (check.check === 'stops') {
    // location match/count checks: expected is an array of acceptable ids
    // (any_of) for a .location key, or a number for a .count key.
    if (check.key.endsWith('.location')) {
      const ids = Array.isArray(exp) ? exp : [exp];
      const rec = locations.get(ids[0]);
      if (!rec) return { verdict: 'unclear', reason: 'location_record_missing' };
      const city = stripAccents(String(rec.city || '').toLowerCase());
      const name = stripAccents(String(rec.name || '').toLowerCase());
      const cityHit = city && city.length >= 3 && docText.includes(city);
      const nameTokens = name.split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4);
      const nameHit = nameTokens.some(t => docText.includes(t));
      if (check.got == null) {
        return (cityHit || nameHit)
          ? { verdict: 'd_candidate', reason: 'location_in_doc_but_engine_returned_null' }
          : { verdict: 'b_or_c_candidate', reason: 'location_city_not_recognisable_in_doc' };
      }
      const gotRec = locations.get(check.got);
      const sameCity = gotRec && rec.city && gotRec.city && normText(rec.city) === normText(gotRec.city) === false
        ? false : (gotRec && rec.city && gotRec.city && normText(rec.city) !== normText(gotRec.city) && normText(rec.name || '') === normText(gotRec.name || ''));
      return sameCity
        ? { verdict: 'd_candidate', reason: 'location_duplicate_record_same_company_other_city' }
        : { verdict: 'd_candidate', reason: 'location_wrong_record_matched' };
    }
    return { verdict: 'unclear', reason: 'stop_count_mismatch' };
  }

  return { verdict: 'unclear', reason: 'no_rule_for_check' };
}

function main() {
  const goldenPath = arg('golden');
  const resultsPath = arg('results');
  const split = arg('split', 'dev');
  const outPath = arg('out');
  const jsonOutPath = arg('json-out');
  if (!goldenPath || !resultsPath) {
    console.error('usage: analyze-failures-r4.mjs --golden <golden-full.json> --results <results.json> [--split dev] [--out <report.md>] [--json-out <rows.json>]');
    process.exit(1);
  }
  if (jsonOutPath) assertLocal(jsonOutPath, 'json-out');
  const goldenDir = path.dirname(path.resolve(goldenPath));
  assertLocal(goldenPath, 'golden');
  assertLocal(resultsPath, 'results');
  if (outPath) assertLocal(outPath, 'out');

  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  const filtered = filterGolden(golden, { split, scoredOnly: true });
  const { checks } = scoreRun(filtered, results);

  const textIdx = buildTextIndex(goldenDir);
  const locations = loadLocations(goldenDir);
  const clients = loadClients(goldenDir);
  const shaByDoc = new Map(golden.docs.map(d => [d.doc_id, d.sha256]));
  const templateByDoc = new Map(golden.docs.map(d => [d.doc_id, d.template || null]));
  const textCache = new Map();

  // Critical fields are the required scope (task 1); pallet_type/stop_pallets
  // are analysed too (not critical per lib/score.mjs CRITICAL, but flagged as
  // "weak" in the round-4 brief and in scope for task 2's golden correction).
  const EXTRA = ['pallet_type', 'stop_pallets'];
  const failing = checks.filter(c => (c.critical || EXTRA.includes(c.check)) && !c.ok && c.status === 'ok');
  const rows = [];
  const counts = {};
  for (const c of failing) {
    const sha = shaByDoc.get(c.doc_id);
    const docText = textFor(sha, textIdx, textCache);
    const cls = classifyCheck(c, docText, null, locations, clients);
    rows.push({ ...c, template: templateByDoc.get(c.doc_id), verdict: cls.verdict, reason: cls.reason });
    const k = `${c.check}::${cls.verdict}::${cls.reason}`;
    counts[k] = (counts[k] || 0) + 1;
  }

  // Aggregate summary — safe to paste into a commit message / report.
  const byCheckVerdict = {};
  for (const r of rows) {
    const k = r.check;
    byCheckVerdict[k] ||= { a_candidate: 0, b_candidate: 0, b_or_c_candidate: 0, d_candidate: 0, unclear: 0, total: 0 };
    byCheckVerdict[k][r.verdict] = (byCheckVerdict[k][r.verdict] || 0) + 1;
    byCheckVerdict[k].total++;
  }
  console.log(`dev failing critical checks: ${rows.length}`);
  console.log('per-check verdict counts:');
  for (const [check, v] of Object.entries(byCheckVerdict).sort()) {
    console.log(`  ${check.padEnd(16)} total=${String(v.total).padEnd(3)} a=${v.a_candidate}  b=${v.b_candidate}  b/c=${v.b_or_c_candidate}  d=${v.d_candidate}  unclear=${v.unclear}`);
  }

  if (outPath) {
    const lines = ['# Round 4 — mechanical failure-cause analysis (dev split)', '',
      'Private working notes — real values, doc ids only in this file (gitignored under .local/).', ''];
    lines.push('| doc | template | crit | check | key | verdict | reason | expected | got |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      lines.push(`| ${r.doc_id} | ${r.template} | ${r.critical ? 'Y' : ''} | ${r.check} | ${r.key} | ${r.verdict} | ${r.reason} | ${JSON.stringify(r.expected)} | ${JSON.stringify(r.got)} |`);
    }
    fs.writeFileSync(outPath, lines.join('\n') + '\n');
    console.log(`\nfull per-check report written to ${outPath}`);
  }
  if (jsonOutPath) {
    fs.writeFileSync(jsonOutPath, JSON.stringify(rows, null, 1));
    console.log(`machine-readable rows written to ${jsonOutPath} (consumed by mark-contested-r4.mjs)`);
  }
}

main();
