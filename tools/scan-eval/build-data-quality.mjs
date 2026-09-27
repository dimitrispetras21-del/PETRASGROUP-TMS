#!/usr/bin/env node
// Round 3 (docs/scan/04, task 4): a read-only pass over the LOCATIONS
// reference data that flags records likely to cause a wrong or empty scan
// match — the three patterns named in the task and already seen on the
// golden set (docs/scan/03 #1/#2/#4):
//   country_gr_minority   — a city name shared by several records where GR
//                           is the minority country (candidate "foreign site
//                           filed under GR").
//   duplicate_company     — two+ records with near-identical company-name
//                           tokens in the same country (candidate duplicate
//                           sites for one client, e.g. neighbouring towns).
//   missing_city           — nothing but the bare company name to match a
//                           document stop against (ref-cache.json does not
//                           carry Address — see build-client-history.mjs for
//                           the one place that fetches it — so this pass
//                           only sees City).
//
// This DECIDES NOTHING about which record is "right" — it is deliberately a
// list of candidates for a human to look at, exactly like a SELECT count, not
// a fix. No writes: Supabase/the facade stay SELECT-only (CLAUDE.md). Record
// ids + reasons go to .local/ (real data, public repo); the summary printed
// to stdout is counts only and is what's safe to paste into a report.
//
//   node tools/scan-eval/build-data-quality.mjs [--ref <ref-cache.json>]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

// core/countries.js's own countryCode() already normalises the mixed spellings
// the LOCATIONS/PARTNERS data carries ("GR" vs "Greece" vs "ΕΛΛΑΔΑ" — its own
// comment says the table is mixed until migration 015). Reusing it here
// instead of a naive toUpperCase() avoids a false "foreign country" flag on
// every record that simply spells the SAME country differently — an early
// version of this script did exactly that on live data before this fix.
const countryCtx = { console: { warn() {}, log() {} }, Intl };
vm.createContext(countryCtx);
vm.runInContext(fs.readFileSync(path.join(REPO, 'core/countries.js'), 'utf8'), countryCtx, { filename: 'core/countries.js' });
const countryCode = v => countryCtx.countryCode(v);

function arg(name, dflt = null) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : dflt;
}

function findGoldenDir() {
  if (process.env.SCAN_GOLDEN_DIR) return process.env.SCAN_GOLDEN_DIR;
  let d = REPO;
  for (let i = 0; i < 6; i++) {
    const c = path.join(d, '.local', 'scan-golden');
    if (fs.existsSync(c)) return c;
    d = path.dirname(d);
  }
  return path.join(REPO, '.local', 'scan-golden');
}

// Same normalisation family as core/scan-engine-v2.js's _sv2Norm/_sv2Tokens
// (accent-strip, lowercase, non-alnum -> space), kept independent here on
// purpose — this is a standalone read-only audit script, not part of the
// scan path, and should not need to load the browser sandbox to run.
const STOP = new Set(('sa ae a e s o ltd limited gmbh mbh co kg ag ug srl spa sro spol r s bv nv oe ee epe ike ike kft zrt bt '
  + 'sp zoo z oo llc inc plc sas sarl ab as oy doo dd ad eood ood the and of for und et de la le der die das van von '
  + 'company trading group depo depot warehouse').split(' '));
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
function tokens(s) {
  return norm(s).split(' ').filter(w => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}
function jaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  let hit = 0; for (const t of sa) if (sb.has(t)) hit++;
  return hit / new Set([...sa, ...sb]).size;
}

function main() {
  const goldenDir = findGoldenDir();
  const refPath = arg('ref', path.join(goldenDir, 'ref-cache.json'));
  if (!fs.existsSync(refPath)) throw new Error(`${refPath} not found — run run-current.mjs once (any engine) to build the reference cache, or pass --ref`);
  const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
  const locations = ref.locations || [];

  const items = locations.map(r => ({
    id: r.id,
    name: r.fields?.Name || '',
    city: r.fields?.City || '',
    cityN: norm(r.fields?.City || ''),
    country: countryCode(r.fields?.Country) || (r.fields?.Country ? `?${r.fields.Country}` : ''),
    toks: tokens(r.fields?.Name || ''),
  }));

  const flags = new Map(); // id -> Set(reason)
  const flag = (id, reason) => { if (!flags.has(id)) flags.set(id, new Set()); flags.get(id).add(reason); };

  // 1) missing city/address — nothing to match a document stop against.
  for (const it of items) {
    if (!it.cityN) flag(it.id, 'missing_city');
  }

  // 2) city shared by several records where GR is the minority country —
  // candidate "foreign site filed under GR" (docs/scan/03 #1: one such record
  // was confirmed by hand on the golden set).
  const byCity = new Map();
  for (const it of items) { if (!it.cityN || it.cityN.length < 4) continue; if (!byCity.has(it.cityN)) byCity.set(it.cityN, []); byCity.get(it.cityN).push(it); }
  for (const [cityN, group] of byCity) {
    if (group.length < 2) continue;
    const byCountry = new Map();
    for (const it of group) byCountry.set(it.country, (byCountry.get(it.country) || 0) + 1);
    if (byCountry.size < 2) continue;                    // all the same country: not a mismatch
    const grN = byCountry.get('GR') || 0;
    const maxOther = Math.max(...[...byCountry.entries()].filter(([c]) => c !== 'GR').map(([, n]) => n));
    if (grN > 0 && grN < maxOther) {
      for (const it of group) if (it.country === 'GR') flag(it.id, 'country_gr_minority');
    }
  }

  // 3) duplicate company across (near-)neighbouring sites: near-identical
  // name tokens, same country, different city — candidate duplicate records
  // for one client (docs/scan/03 #2).
  const byCountryList = new Map();
  for (const it of items) { if (!it.toks.length) continue; if (!byCountryList.has(it.country)) byCountryList.set(it.country, []); byCountryList.get(it.country).push(it); }
  for (const list of byCountryList.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.cityN === b.cityN) continue;               // same site, not a duplicate-town case
        if (jaccard(a.toks, b.toks) >= 0.6) { flag(a.id, 'duplicate_company'); flag(b.id, 'duplicate_company'); }
      }
    }
  }

  const byReason = {};
  for (const reasons of flags.values()) for (const r of reasons) byReason[r] = (byReason[r] || 0) + 1;

  const outDir = path.join(goldenDir, 'data-quality');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(outDir, `locations-${stamp}.json`);
  if (!path.resolve(outPath).split(path.sep).includes('.local')) throw new Error('refusing to write outside .local/');
  const detailed = [...flags.entries()].map(([id, reasons]) => {
    const it = items.find(x => x.id === id);
    return { id, name: it.name, city: it.city, country: it.country, reasons: [...reasons] };
  });
  fs.writeFileSync(outPath, JSON.stringify({ built_at: new Date().toISOString(), total_locations: items.length,
    flagged: detailed.length, by_reason: byReason, records: detailed }, null, 2));

  console.log(`${items.length} locations scanned, ${detailed.length} flagged`);
  console.log('by reason (anonymised — counts only):', JSON.stringify(byReason));
  console.log(`full record list (ids + names — real data): ${outPath}`);
}

main();
