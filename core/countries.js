// ═══════════════════════════════════════════════
// CORE — COUNTRIES
// ═══════════════════════════════════════════════
// One vocabulary for «Country» everywhere (owner 5/9/2026): the STORED value is
// the ISO 3166-1 alpha-2 code (GR, BG, DE …); screens always show a name.
// Names come from the browser's Intl.DisplayNames — nothing to maintain, and
// Greek/English for free (driver sheet Greek, partner sheet English).
//
// Why a code and not a name: half the tables already store codes (clients,
// workshops) and a code is language-neutral; the other half (locations,
// partners) is cleaned by migration 015. Until then the data is MIXED, so
// countryCode() also understands the spellings still in the base — English
// names, Greek names, «GREECE», «Czech Republic», «ΕΛΛΑΔΑ» — and returns null
// for anything it does not recognise (K3: never guess, never invent).

const COUNTRY_CODES = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ '
  + 'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR '
  + 'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP '
  + 'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ '
  + 'NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW '
  + 'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ '
  + 'UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ');

// Listed first in every select: Greece, then the countries the fleet actually
// drives through. Sorted by Greek name at runtime, Greece pinned on top.
const COUNTRY_PRIORITY = ('GR CY BG MK AL RS RO TR HU SK CZ AT SI HR BA ME PL DE NL BE LU FR IT ES PT CH LI GB IE DK SE NO FI IS '
  + 'EE LV LT UA MD BY RU MT SM VA MC AD GE AM AZ').split(' ');

// Spellings the data carries that Intl names do not produce (measured 5/9).
const _COUNTRY_ALIAS = {
  'czech republic': 'CZ', 'bosnia and herzegovina': 'BA', 'fyrom': 'MK', 'hellas': 'GR', 'grc': 'GR', 'gre': 'GR',
  'uk': 'GB', 'great britain': 'GB', 'england': 'GB', 'holland': 'NL', 'deutschland': 'DE', 'italia': 'IT',
  'bgr': 'BG', 'rou': 'RO', 'deu': 'DE', 'ita': 'IT', 'hun': 'HU', 'aut': 'AT', 'nld': 'NL', 'pol': 'PL', 'cze': 'CZ',
  'esp': 'ES', 'fra': 'FR', 'bel': 'BE', 'svk': 'SK', 'svn': 'SI', 'hrv': 'HR',
  'eu-other': null, 'eu': null, 'other': null,
};

// Compare without case or accents: «ΕΛΛΑΔΑ», «Ελλάδα», «ελλαδα» are one word.
const _cnKey = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const _cnCache = {};
function _cnNames(lang) {
  if (!_cnCache[lang]) _cnCache[lang] = new Intl.DisplayNames([lang], { type: 'region' });
  return _cnCache[lang];
}
let _cnReverse = null;
function _cnReverseMap() {
  if (_cnReverse) return _cnReverse;
  const m = {};
  for (const lang of ['en', 'el']) {
    const dn = _cnNames(lang);
    for (const c of COUNTRY_CODES) {
      let n; try { n = dn.of(c); } catch (e) { n = null; }
      if (n && n !== c) m[_cnKey(n)] = c;
    }
  }
  for (const k in _COUNTRY_ALIAS) m[_cnKey(k)] = _COUNTRY_ALIAS[k];
  _cnReverse = m;
  return m;
}

/** ISO code for a stored value in any of today's spellings; null when unknown. */
function countryCode(v) {
  if (v == null) return null;
  const raw = String(v).trim().replace(/\s+/g, ' ');
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(up)) return COUNTRY_CODES.includes(up) ? up : null;
  const hit = _cnReverseMap()[_cnKey(raw)];
  return hit === undefined ? null : hit;
}
function countryIsKnown(v) { return countryCode(v) != null; }

/** Display name (Greek by default, 'en' for the partner sheet). An unrecognised
 *  raw value comes back unchanged — the screen shows it muted, never hides it. */
function countryName(v, lang) {
  const c = countryCode(v);
  if (c) { try { return _cnNames(lang || 'el').of(c) || c; } catch (e) { return c; } }
  return v == null ? '' : String(v).trim();
}

/** <option> list for a country select: «— χώρα —», Europe first, then every
 *  country, Greek names sorted with the code in brackets («Ελλάδα (GR)») so the
 *  native type-ahead works with either. A legacy value the list cannot resolve
 *  stays selected as «… (άγνωστη γραφή)» — the form must not drop it silently. */
function countryOptionsHtml(selected, opts) {
  const o = opts || {};
  const allowEmpty = o.allowEmpty !== false;
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const dn = _cnNames('el');
  const name = c => { try { return dn.of(c) || c; } catch (e) { return c; } };
  const sel = countryCode(selected);
  const raw = selected == null ? '' : String(selected).trim();
  const byName = (a, b) => name(a).localeCompare(name(b), 'el');
  const eu = ['GR'].concat(COUNTRY_PRIORITY.filter(c => c !== 'GR').sort(byName));
  const rest = COUNTRY_CODES.filter(c => !COUNTRY_PRIORITY.includes(c)).sort(byName);
  const opt = c => `<option value="${c}"${c === sel ? ' selected' : ''}>${esc(name(c))} (${c})</option>`;
  let html = allowEmpty ? `<option value=""${!sel && !raw ? ' selected' : ''}>— χώρα —</option>` : '';
  if (raw && !sel) html += `<option value="${esc(raw)}" selected>${esc(raw)} (άγνωστη γραφή)</option>`;
  html += `<optgroup label="Ευρώπη">${eu.map(opt).join('')}</optgroup>`;
  html += `<optgroup label="Όλες οι χώρες">${rest.map(opt).join('')}</optgroup>`;
  return html;
}

if (typeof window !== 'undefined') {
  window.COUNTRY_CODES = COUNTRY_CODES;
  window.COUNTRY_PRIORITY = COUNTRY_PRIORITY;
  window.countryCode = countryCode;
  window.countryIsKnown = countryIsKnown;
  window.countryName = countryName;
  window.countryOptionsHtml = countryOptionsHtml;
} else {
  // `node core/countries.js` — the self-check that keeps the aliases honest.
  const cases = [['GR', 'GR'], ['gr', 'GR'], ['Greece', 'GR'], ['GREECE', 'GR'], ['ΕΛΛΑΔΑ', 'GR'], ['Ελλάδα', 'GR'],
    ['Czech Republic', 'CZ'], ['Czechia', 'CZ'], ['Bosnia and Herzegovina', 'BA'], ['NORTH MACEDONIA', 'MK'], ['North Macedonia', 'MK'],
    ['POLAND', 'PL'], ['Netherlands', 'NL'], ['Holland', 'NL'], ['EU-Other', null], ['', null], [null, null], ['Atlantis', null], ['ZZ', null]];
  let bad = 0;
  for (const [inp, exp] of cases) { const got = countryCode(inp); if (got !== exp) { bad++; console.log('✗', JSON.stringify(inp), '→', got, 'expected', exp); } }
  console.log(`countries self-check: ${cases.length - bad}/${cases.length} ok · ${COUNTRY_CODES.length} codes · GR=${countryName('GR')}/${countryName('GR', 'en')} · unknown=${JSON.stringify(countryName('Atlantis'))}`);
  const html = countryOptionsHtml('Greece');
  console.log('options:', (html.match(/<option/g) || []).length, '· first Europe option:', html.match(/<optgroup label="Ευρώπη"><option[^>]*>([^<]*)/)[1]);
  if (bad) process.exit(1);
}
