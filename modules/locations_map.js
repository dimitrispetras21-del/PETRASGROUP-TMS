// ═══════════════════════════════════════════════
// MODULE — LOCATIONS MAP (καρτέλα «Χάρτης» της σελίδας Locations)
// ═══════════════════════════════════════════════
// Δεν είναι δική του σελίδα: ζει μέσα στο locations.js και διαβάζει τα ΙΔΙΑ
// records (LOC.records) που έχει ήδη φορτώσει η σελίδα. Μηδέν επιπλέον fetch
// για τοποθεσίες — μόνο ένα, εφάπαξ, για τα συνεργεία.
// State prefix 'LMAP' / '_lmap' ώστε να μη συγκρούεται με το LOC.
'use strict';

const LMAP = {
  libReady: false,      // το Leaflet φορτώνεται με το ΠΡΩΤΟ άνοιγμα, όχι στο boot
  built: false,
  map: null, pinLayer: null, cluster: null,
  markerOf: new Map(),
  pts: [],
  workshops: null,
  circle: null, cMark: null,
  cliColor: {}, cliCount: {},
  S: {
    cats: null, clients: null, q: '', colorBy: 'cat', grouped: false,
    radiusKm: null, center: null, nearCat: 'all', sel: null
  }
};

// Χρώματα από tokens, όχι ωμά hex (DESIGN.md #1): εδώ μένουν ΟΝΟΜΑΤΑ
// μεταβλητών του style.css, οι τιμές λύνονται σε runtime (_lmapVar) επειδή το
// Leaflet γράφει SVG attributes που δεν καταλαβαίνουν var(). Τα --map-* μπήκαν
// στο :root στις 3/9/2026 (ολοκληρωτής, μετά το merge της μονάδας)· μέχρι
// τότε hub/wash δανείζονταν --navy-mid/--accent-hover και η 12άδα πελατών
// ξαναχρησιμοποιούσε 12 άσχετα tokens, μερικά σχεδόν ίδια μεταξύ τους.
const LMAP_CATS = {
  client:   { label: 'Πελάτες',               v: '--accent' },
  hub:      { label: 'Αποθήκες / Cross-dock', v: '--map-hub' },
  workshop: { label: 'Συνεργεία',             v: '--danger' },
  customs:  { label: 'Τελωνεία',              v: '--warn' },
  fuel:     { label: 'Καύσιμα',               v: '--ok' },
  wash:     { label: 'Πλυντήρια',             v: '--map-wash' },
  partner:  { label: 'Συνεργάτες',            v: '--chip-partner' },
  unknown:  { label: 'Αταξινόμητα',           v: '--text-dim' },
};
function _lmapVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
Object.keys(LMAP_CATS).forEach(k => Object.defineProperty(LMAP_CATS[k], 'color', { get() { return _lmapVar(this.v); } }));

// Κατηγορική 12άδα «Χρώμα: πελάτης» — ένα token ανά θέση, ώστε δύο γειτονικοί
// πελάτες να μη μοιράζονται ποτέ χρώμα (πριν: --danger και --danger-strong
// ήταν σχεδόν ίδια).
const LMAP_CLI_VARS = Array.from({ length: 12 }, (_, i) => `--map-cli-${i + 1}`);

// ── Lazy load Leaflet ──────────────────────────
// Τοπικά αρχεία, όχι CDN (owner 12/8): μπαίνουν στο service-worker cache όπως
// κάθε άλλο asset, ο χάρτης δεν εξαρτάται από τρίτον, δεν σπάει offline.
// Φορτώνονται ΜΟΝΟ όταν πατηθεί η καρτέλα — αλλιώς 54 KB θα κατέβαιναν σε κάθε
// σελίδα του TMS για ένα χαρακτηριστικό που ίσως δεν ανοίξει ποτέ.
function _lmapLoadLib() {
  if (LMAP.libReady) return Promise.resolve();
  const base = 'vendor/leaflet/';
  const css = href => new Promise(res => {
    if (document.querySelector('link[href="' + href + '"]')) return res();
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    l.onload = res; l.onerror = res;   // το CSS δεν είναι λόγος να μη σηκωθεί ο χάρτης
    document.head.appendChild(l);
  });
  const js = src => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res;
    s.onerror = () => rej(new Error('Απέτυχε η φόρτωση ' + src));
    document.head.appendChild(s);
  });
  return Promise.all([
    css(base + 'leaflet.css'),
    css(base + 'markercluster.css'),
    css(base + 'markercluster.default.css')
  ])
  .then(() => js(base + 'leaflet.js'))        // το markercluster απαιτεί ήδη φορτωμένο L
  .then(() => js(base + 'markercluster.js'))
  .then(() => { LMAP.libReady = true; });
}

// ── Κατηγοριοποίηση ────────────────────────────
// Το πεδίο Type είναι ελεύθερο κείμενο με 60+ γραφές («ΣΥΝΕΡΓΕΙΟ», «SERVICE»,
// «clinet vermion », κενά στο τέλος). Μέχρι να υπάρξει κανονική στήλη category,
// την παράγουμε εδώ. ΠΡΟΣΟΧΗ: αλλαγή γραφής στο Type αλλάζει χρώμα καρφίτσας
// χωρίς να το καταλάβει κανείς — γι' αυτό τα «Αταξινόμητα» μένουν ορατά ως φίλτρο.
const _LMAP_RULES = [
  ['workshop', /ΣΥΝΕΡΓΕΙΟ|SERVICE|VOLVO|SCANIA|\bMAN\b|ΗΛΕΚΤΡΟΛΟΓ|ΕΛΑΣΤΙΚ|DIESEL|ΦΡΕΝ|ΤΑΧΟΓΡΑΦ|TRANSERVICE/],
  ['customs',  /CUSTOM|ΤΕΛΩΝΕΙ/],
  ['fuel',     /ΚΑΥΣΙΜ|ΠΡΑΤΗΡΙΟ|ΠΕΤΡΕΛΑΙ|FUEL/],
  ['wash',     /ΠΛΥΝΤΗΡΙ|WASH/],
  ['hub',      /VEROIA HUB|CROSS-?DOCK|ΜΕΤΑΦΟΡΤΩΣ|DEPOT|WAREHOUSE|ΑΠΟΘΗΚ|UMSCHLAG/],
  ['partner',  /^PARTNER|PARTNER\s*:/],
  ['client',   /CLIENT|CLINET|ΠΕΛΑΤ/],
];
function _lmapNorm(s) {
  return String(s || '').normalize('NFKC').replace(/ /g, ' ').trim().toUpperCase();
}
function _lmapCategorize(type, name) {
  const hay = _lmapNorm(type) + ' || ' + _lmapNorm(name);
  for (let i = 0; i < _LMAP_RULES.length; i++) {
    if (_LMAP_RULES[i][1].test(hay)) return _LMAP_RULES[i][0];
  }
  return type ? 'client' : 'unknown';
}
function _lmapClientOf(type) {
  const m = _lmapNorm(type).match(/CL[IE]{2}NT\s*:?\s*(.+)/);
  if (!m) return '';
  return m[1].replace(/\s*\(.*?\)\s*/g, '').replace(/[:\]]+$/, '').trim();
}

// Μεταγραφή ΕΛ→ΛΑΤ για να ταιριάξουν συνεργεία (ελληνικά) με τοποθεσίες
// (λατινικά, κανόνας 9/8). Χωρίς αυτήν το matching βρίσκει 2 στα 70.
const _LMAP_DI = { 'ΑΙ':'AI','ΕΙ':'I','ΟΙ':'I','ΟΥ':'OU','ΑΥ':'AV','ΕΥ':'EV','ΜΠ':'B','ΝΤ':'D',
  'ΓΚ':'G','ΤΣ':'TS','ΤΖ':'TZ','ΧΡ':'CHR','ΧΛ':'CHL','ΘΕ':'THE','ΘΑ':'THA','ΘΗ':'THI','ΘΟ':'THO' };
const _LMAP_MO = { 'Α':'A','Β':'V','Γ':'G','Δ':'D','Ε':'E','Ζ':'Z','Η':'I','Θ':'TH','Ι':'I','Κ':'K',
  'Λ':'L','Μ':'M','Ν':'N','Ξ':'X','Ο':'O','Π':'P','Ρ':'R','Σ':'S','Τ':'T','Υ':'Y','Φ':'F',
  'Χ':'CH','Ψ':'PS','Ω':'O' };
function _lmapKey(t) {
  let s = String(t || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const k in _LMAP_DI) s = s.split(k).join(_LMAP_DI[k]);
  s = s.split('').map(c => _LMAP_MO[c] || c).join('');
  return s.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Ένα συνεργείο δένει με τοποθεσία ΜΟΝΟ αν η τοποθεσία μοιάζει όντως συνεργείο.
// Χωρίς αυτόν τον φρουρό, «ΜΑΡΜΑΡΑΣ» κολλάει στο «Marmaras fruits» και ο οδηγός
// με βλάβη στέλνεται σε φρουτεμπόριο (μετρήθηκε: 9 τέτοια σε 19 υποψήφια).
const _LMAP_WS_OK = /SYNERGEIO|SERVICE|SCANIA|VOLVO|\bMAN\b|FRENON|FRENA|TACHO|EVROFRENO|EUROFRENO/i;

function _lmapEnrichWorkshops() {
  if (!LMAP.workshops || !LMAP.workshops.length) return;
  const byKey = new Map();
  LMAP.pts.forEach(p => {
    const k = _lmapKey(p.n);
    if (k && !byKey.has(k)) byKey.set(k, p);
  });
  for (const w of LMAP.workshops) {
    const f = w.fields || {};
    const nm = f['Name'];
    if (!nm) continue;
    const ck = _lmapKey(nm);
    if (ck.length < 4) continue;
    let hit = byKey.get(ck);
    if (!hit) {
      const toks = ck.split(' ').filter(t => t.length >= 5);
      if (toks.length) {
        for (const pair of byKey) {
          if (toks.some(t => pair[0].indexOf(t) >= 0)) { hit = pair[1]; break; }
        }
      }
    }
    if (hit && _LMAP_WS_OK.test(hit.n)) {
      hit.g  = 'workshop';
      hit.sp = f['Specialty'] || '';
      hit.ph = f['Phone'] || '';
      hit.ct = f['Contact Person'] || '';
    }
  }
}

// Ένα σημείο με λάθος συντεταγμένες τραβούσε ολόκληρο το κάδρο: μετρήθηκε
// 3/9/2026 το «VF Hellas» (χώρα Greece) στο 8.10 / 23.56 — Κεντρική Αφρική.
// Το fitBounds άνοιγε ως τον Ισημερινό, >60% του καμβά έβγαινε Ατλαντικός και
// Αφρική, και στα 1440×900 όλη η Ευρώπη χωρούσε σε ~200×170px.
// Το σημείο ΜΕΝΕΙ στον χάρτη και στη λίστα — κόβεται μόνο από το ΚΑΔΡΟ. Αν το
// κρύβαμε, το λάθος δεδομένο γινόταν αόρατο και δεν θα το διόρθωνε ποτέ κανείς
// (αρχή 1)· γι' αυτό δηλώνεται και ρητά, με το όνομά του, πάνω από τα φίλτρα.
const _LMAP_EU = { s: 33, n: 72, w: -12, e: 42 };
function _lmapInEurope(p) {
  return p.la >= _LMAP_EU.s && p.la <= _LMAP_EU.n && p.lo >= _LMAP_EU.w && p.lo <= _LMAP_EU.e;
}

// ── Δεδομένα ───────────────────────────────────
function _lmapBuildPoints() {
  LMAP.pts = [];
  const recs = (typeof LOC !== 'undefined' && LOC.records) || [];
  for (const r of recs) {
    const f = r.fields || {};
    const la = parseFloat(f['Latitude']), lo = parseFloat(f['Longitude']);
    if (!isFinite(la) || !isFinite(lo)) continue;   // 8 σημεία δεν έχουν γεωκωδικοποιηθεί ακόμη
    const t = f['Type'] || '';
    LMAP.pts.push({
      // One list everywhere (owner 5/9): k always carries the Greek name, whatever
      // spelling/code the record stores — every popup/tooltip below reads it as-is.
      id: r.id, n: f['Name'] || '—', c: f['City'] || '',
      k: f['Country'] ? (typeof countryName === 'function' ? countryName(f['Country']) : f['Country']) : '',
      t: t, g: _lmapCategorize(t, f['Name']), cl: _lmapClientOf(t),
      la: la, lo: lo, sp: '', ph: '', ct: ''
    });
  }
  _lmapEnrichWorkshops();
}

// ── Entry point (καλείται από το locations.js) ──
async function _lmapOpen() {
  const host = document.getElementById('locMapHost');
  if (!host) return;
  if (LMAP.built) { setTimeout(() => LMAP.map && LMAP.map.invalidateSize(), 30); return; }

  host.innerHTML = '<div class="lmap-msg">Φόρτωση χάρτη…</div>';
  try {
    // Τα συνεργεία είναι «καλό να υπάρχουν»: αν πέσει το fetch, ο χάρτης ανοίγει
    // με 15 συνεργεία αντί 19 — δεν κλειδώνει ολόκληρη η καρτέλα για ένα extra.
    const res = await Promise.all([
      _lmapLoadLib(),
      atGetAll(TABLES.WORKSHOPS,
        { fields: ['Name', 'City', 'Specialty', 'Phone', 'Contact Person', 'Active'] }, true)
        .catch(e => { if (typeof logError === 'function') logError(e, '_lmapOpen workshops'); return []; })
    ]);
    LMAP.workshops = res[1] || [];
    _lmapBuildPoints();
    if (!LMAP.pts.length) {
      host.innerHTML = '<div class="lmap-msg">Καμία τοποθεσία με συντεταγμένες.</div>';
      return;
    }
    _lmapRender(host);
    LMAP.built = true;
  } catch (e) {
    if (typeof logError === 'function') logError(e, '_lmapOpen');
    // Failure ≠ empty (DESIGN.md #7): the empty case above says «καμία τοποθεσία
    // με συντεταγμένες»; this one must not be readable the same way.
    host.innerHTML = '<div class="lmap-msg">Δεν φορτώθηκε — ο χάρτης. Αυτό δεν σημαίνει ότι δεν υπάρχουν τοποθεσίες.<br>' +
      '<button type="button" class="btn btn-primary btn-sm" style="margin-top:var(--space-3)" ' +
      'onclick="LMAP.built=false;_lmapOpen()">Ξαναδοκίμασε</button></div>';
  }
}

// Καλείται από το _locSave() του locations.js μετά από επιτυχή εγγραφή.
// Ο χάρτης κρατά δικό του αντίγραφο (LMAP.pts) φτιαγμένο από τα LOC.records:
// χωρίς ρητό ξαναχτίσιμο, μια αλλαγή συντεταγμένων άφηνε την καρφίτσα στο παλιό
// σημείο ενώ η λίστα και το toast έδειχναν επιτυχία. Δεν αγγίζουμε το view του
// χρήστη (κέντρο/zoom) — μόνο τα σημεία.
function _lmapRefresh() {
  if (!LMAP.built || !LMAP.map) return;   // δεν έχει ανοίξει ποτέ η καρτέλα
  const sel = LMAP.S.sel;
  _lmapBuildPoints();
  _lmapDraw();
  // Αν το ανοιχτό panel αφορά σημείο που άλλαξε, δείξε τις νέες τιμές· αν
  // διαγράφηκε, κλείσε το αντί να δείχνει εγγραφή που δεν υπάρχει πια.
  if (sel) {
    const p = LMAP.pts.find(x => x.id === sel);
    if (p) { LMAP.S.sel = sel; _lmapDetail(p); } else _lmapCloseDetail();
  }
}

function _lmapEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
// Haversine — ίδιος τύπος με core/utils.js (dead-km)
function _lmapKm(a, b, c, d) {
  const R = 6371, t = x => x * Math.PI / 180, dl = t(c - a), dn = t(d - b);
  return 2 * R * Math.asin(Math.sqrt(
    Math.pow(Math.sin(dl / 2), 2) +
    Math.cos(t(a)) * Math.cos(t(c)) * Math.pow(Math.sin(dn / 2), 2)));
}

function _lmapRender(host) {
  const S = LMAP.S;
  const cliCount = {};
  LMAP.pts.forEach(p => { if (p.cl) cliCount[p.cl] = (cliCount[p.cl] || 0) + 1; });
  const topCli = Object.keys(cliCount).sort((a, b) => cliCount[b] - cliCount[a]).slice(0, 12);
  LMAP.cliColor = {};
  topCli.forEach((c, i) => LMAP.cliColor[c] = _lmapVar(LMAP_CLI_VARS[i]));
  LMAP.cliCount = cliCount;
  S.cats = new Set(Object.keys(LMAP_CATS));
  S.clients = new Set(topCli);

  // Το catCnt δεν είναι μόνο νούμερο δίπλα στην ετικέτα: ΦΙΛΤΡΑΡΕΙ ποιες
  // κατηγορίες γράφονται καθόλου (3/9/2026). Το .lmap-acc-b έχει max-height
  // 186px· με «Πελάτες 0» και «Συνεργάτες 0» μέσα το ύψος πήγαινε 206px και
  // έκοβε στη μέση την «Αταξινόμητα 1.116» — το 96,5% των σημείων — αφήνοντας
  // το checkbox της απρόσιτο. Δύο άδειες γραμμές έκρυβαν τη μόνη που μετράει.
  const catCnt = {};
  LMAP.pts.forEach(p => catCnt[p.g] = (catCnt[p.g] || 0) + 1);
  const outEu = LMAP.pts.filter(p => !_lmapInEurope(p));
  const outEuHint = outEu.length
    ? `<div class="lmap-hint"><b>${outEu.length}</b> εκτός Ευρώπης — έξω από το κάδρο:
       ${outEu.slice(0, 3).map(p => _lmapEsc(p.n)).join(', ')}${outEu.length > 3 ? '…' : ''}.
       Πιθανό λάθος συντεταγμένων.</div>`
    : '';

  host.innerHTML =
`<div class="lmap-grid" id="lmapGrid">
  <div class="lmap-pane">
    <div class="lmap-tools">
      <input class="search-input" id="lmapQ" placeholder="Αναζήτηση ονόματος, πόλης…"
             autocomplete="off" style="max-width:none;width:100%">
      <div class="lmap-seg">
        <button id="lmapPin" class="on" onclick="_lmapSetGrouped(false)">📌 Καρφίτσες</button>
        <button id="lmapGrp" onclick="_lmapSetGrouped(true)">🔢 Ομάδες</button>
      </div>
      <div class="lmap-seg" style="margin-top:var(--space-2)">
        <button id="lmapCCat" class="on" onclick="_lmapSetColorBy('cat')">Χρώμα: κατηγορία</button>
        <button id="lmapCCli" onclick="_lmapSetColorBy('client')">Χρώμα: πελάτης</button>
      </div>
      ${outEuHint}
    </div>
    <div class="lmap-acc" id="lmapAccCat">
      <button class="lmap-acc-h" onclick="this.parentNode.classList.toggle('closed')">
        Τι είναι το σημείο <span class="ar">▾</span></button>
      <div class="lmap-acc-b">${Object.keys(LMAP_CATS).filter(k => catCnt[k]).map(k => `
        <label class="lmap-ck"><input type="checkbox" checked data-k="${k}">
          <span class="lmap-dot" style="background:${LMAP_CATS[k].color}"></span>
          <span>${LMAP_CATS[k].label}</span>
          <span class="n">${(catCnt[k] || 0).toLocaleString('el-GR')}</span></label>`).join('')}</div>
    </div>
    <div class="lmap-acc closed" id="lmapAccCli">
      <button class="lmap-acc-h" onclick="this.parentNode.classList.toggle('closed')">
        Επίπεδα ανά πελάτη <span class="ar">▾</span></button>
      <div class="lmap-acc-b">${topCli.map(c => `
        <label class="lmap-ck"><input type="checkbox" checked data-c="${_lmapEsc(c)}">
          <span class="lmap-dot" style="background:${LMAP.cliColor[c]}"></span>
          <span>${_lmapEsc(c)}</span><span class="n">${cliCount[c]}</span></label>`).join('')}
        <div class="lmap-hint">Οι 12 μεγαλύτεροι. Φιλτράρουν μόνο σε «Χρώμα: πελάτης».</div></div>
    </div>
    <div class="lmap-list-h"><span id="lmapListTitle">Σημεία</span><span id="lmapListCnt"></span></div>
    <div class="lmap-list" id="lmapList"></div>
  </div>

  <div class="lmap-mwrap">
    <div id="lmapMap"></div>
    <div class="lmap-bar" id="lmapBar"><span id="lmapBarTxt"></span>
      <button class="x" onclick="_lmapExitRadius()" aria-label="Κλείσιμο ακτίνας">×</button></div>
    <div class="lmap-rad">
      <div class="lb">Τι υπάρχει κοντά</div>
      <div class="row">${[50, 100, 200, 400].map(r =>
        `<button data-r="${r}" onclick="_lmapArm(${r})">${r === 400 ? '400 km' : r}</button>`).join('')}</div>
    </div>
  </div>

  <div class="lmap-det" id="lmapDet"></div>
</div>`;

  LMAP.map = L.map('lmapMap', { zoomControl: false }).setView([48, 14], 5);
  L.control.zoom({ position: 'bottomright' }).addTo(LMAP.map);
  // Υπόβαθρο OSM standard, χωρίς κλειδί. Ήταν CARTO Voyager (owner 12/8, μετά
  // από οπτική σύγκριση 6 υποβάθρων, «24/24 tiles καθαρά»). Η ΥΠΗΡΕΣΙΑ ΑΛΛΑΞΕ
  // από τότε: 3/9/2026 τα voyager tiles γυρίζουν 200 OK αλλά με ψημένο μέσα στην
  // εικόνα «API KEY REQUIRED», διαγώνια, δεκάδες φορές ανά οθόνη — τα ονόματα
  // χωρών δεν διαβάζονται. Δεν παραβιάζεται απόφαση· ακυρώθηκε η προϋπόθεσή της.
  // Χάνουμε το @2x ({r}): το OSM δεν σερβίρει retina tiles. Αν ξαναβρεθεί
  // key-free καθαρό υπόβαθρο, εδώ αλλάζει — μία γραμμή.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(LMAP.map);

  LMAP.pinLayer = L.layerGroup();
  LMAP.cluster = L.markerClusterGroup({
    maxClusterRadius: 48, showCoverageOnHover: false,
    iconCreateFunction: function (c) {
      const n = c.getChildCount(), s = n < 10 ? 30 : n < 100 ? 38 : 46;
      return L.divIcon({ className: '', iconSize: [s, s],
        html: '<div class="lmap-cl" style="width:' + s + 'px;height:' + s + 'px">' + n + '</div>' });
    }
  });
  LMAP.map.addLayer(LMAP.pinLayer);
  LMAP.map.on('click', e => { if (S.radiusKm) _lmapSetCenter(e.latlng.lat, e.latlng.lng); });

  host.querySelectorAll('#lmapAccCat input').forEach(i => i.onchange = () => {
    i.checked ? S.cats.add(i.dataset.k) : S.cats.delete(i.dataset.k); _lmapDraw();
  });
  host.querySelectorAll('#lmapAccCli input').forEach(i => i.onchange = () => {
    i.checked ? S.clients.add(i.dataset.c) : S.clients.delete(i.dataset.c); _lmapDraw();
  });
  let qt;
  document.getElementById('lmapQ').oninput = e => {
    clearTimeout(qt);
    const v = e.target.value;
    qt = setTimeout(() => { S.q = v.trim().toLowerCase(); _lmapDraw(); }, 170);
  };

  _lmapDraw();
  // invalidateSize πριν το fitBounds: στο πρώτο paint ο grid container δεν έχει
  // ύψος, το Leaflet υπολογίζει zoom σε μηδενικό viewport και κολλάει στο maxZoom
  // (19) — άδειος χάρτης. Μετρήθηκε στο demo, δεν υποτέθηκε.
  requestAnimationFrame(() => {
    LMAP.map.invalidateSize();
    // Κάδρο μόνο στα ευρωπαϊκά σημεία (βλ. _LMAP_EU). Το maxZoom φρουρεί την
    // αντίθετη ακρότητα: με φιλτραρισμένα λίγα και κοντινά σημεία το fitBounds
    // θα κόλλαγε σε επίπεδο δρόμου, όπου το δίκτυο δεν διαβάζεται καθόλου.
    const fit = LMAP.pts.filter(_lmapInEurope);
    LMAP.map.fitBounds(L.latLngBounds((fit.length ? fit : LMAP.pts).map(p => [p.la, p.lo])),
      { padding: [25, 25], maxZoom: 11 });
  });
}

// ── Σχεδίαση ───────────────────────────────────
function _lmapColorOf(p) {
  if (LMAP.S.colorBy === 'client') return (p.cl && LMAP.cliColor[p.cl]) || _lmapVar('--text-dim');
  return (LMAP_CATS[p.g] || LMAP_CATS.unknown).color;
}
const _LMAP_IC = new Map();
function _lmapIcon(color, big) {
  const k = color + (big ? 'b' : '');
  if (_LMAP_IC.has(k)) return _LMAP_IC.get(k);
  const w = big ? 25 : 19, h = big ? 35 : 27;
  const paper = _lmapVar('--bg-card');
  const i = L.divIcon({
    className: 'lmap-pin', iconSize: [w, h], iconAnchor: [w / 2, h], tooltipAnchor: [0, -h + 6],
    html: '<svg width="' + w + '" height="' + h + '" viewBox="0 0 24 34" aria-hidden="true">' +
      '<path d="M12 33.5C12 33.5 23 20.4 23 12A11 11 0 1 0 1 12c0 8.4 11 21.5 11 21.5z" fill="' +
      color + '" stroke="' + paper + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<circle cx="12" cy="12" r="4" fill="' + paper + '" fill-opacity=".92"/></svg>'
  });
  _LMAP_IC.set(k, i); return i;
}
function _lmapVisible(p) {
  const S = LMAP.S;
  if (!S.cats.has(p.g)) return false;
  // Σε «χρώμα: πελάτης» τα επίπεδα ΦΙΛΤΡΑΡΟΥΝ, δεν χρωματίζουν μόνο — αυτό κάνει
  // το My Maps όταν ξετσεκάρεις layer, και αυτό περιμένει ο χρήστης.
  if (S.colorBy === 'client' && p.cl && !S.clients.has(p.cl)) return false;
  if (S.q && (p.n + ' ' + p.c + ' ' + p.k + ' ' + p.cl).toLowerCase().indexOf(S.q) < 0) return false;
  return true;
}
function _lmapDraw() {
  const S = LMAP.S;
  LMAP.cluster.clearLayers(); LMAP.pinLayer.clearLayers(); LMAP.markerOf.clear();
  const vis = LMAP.pts.filter(_lmapVisible), ms = [];
  for (const p of vis) {
    const big = p.g !== 'client' && p.g !== 'unknown';
    // Τα σπάνια (συνεργείο, τελωνείο) μπροστά — αλλιώς το ένα συνεργείο της
    // περιοχής θάβεται κάτω από τις εκατοντάδες καρφίτσες πελατών.
    const m = L.marker([p.la, p.lo],
      { icon: _lmapIcon(_lmapColorOf(p), big), zIndexOffset: big ? 1000 : 0 });
    m.on('click', () => { _lmapSelect(p); _lmapDetail(p); });
    m.bindTooltip(p.n, { direction: 'top', opacity: 0.94 });
    LMAP.markerOf.set(p.id, m); ms.push(m);
  }
  if (S.grouped) LMAP.cluster.addLayers(ms); else ms.forEach(m => LMAP.pinLayer.addLayer(m));
  _lmapList(vis);
}

function _lmapList(vis) {
  const S = LMAP.S;
  let items = vis, title = 'Σημεία', extra = null;
  if (S.center) {
    const la = S.center[0], lo = S.center[1];
    const all = vis.map(p => {
      const o = Object.assign({}, p); o.d = _lmapKm(la, lo, p.la, p.lo); return o;
    }).filter(p => p.d <= S.radiusKm);
    const present = [];
    all.forEach(p => { if (present.indexOf(p.g) < 0) present.push(p.g); });
    // Το φίλτρο κατηγορίας δεν επιβιώνει σε σημείο που δεν την έχει: αλλιώς
    // ψάχνεις συνεργείο στη Ρουμανία, κλικάρεις Ρότερνταμ και βλέπεις κενή
    // λίστα ενώ γύρω υπάρχουν 90 σημεία — χωρίς τίποτα να το εξηγεί.
    if (S.nearCat !== 'all' && present.indexOf(S.nearCat) < 0) S.nearCat = 'all';
    extra = { present: present, all: all };
    items = (S.nearCat === 'all' ? all : all.filter(p => p.g === S.nearCat))
              .sort((a, b) => a.d - b.d);
    title = 'Σε ' + S.radiusKm + ' km';
  } else {
    items = items.slice().sort((a, b) => a.n.localeCompare(b.n, 'el'));
  }

  document.getElementById('lmapListTitle').textContent = title;
  document.getElementById('lmapListCnt').textContent = items.length.toLocaleString('el-GR');

  const chips = extra ? '<div class="lmap-chips">' + ['all'].concat(extra.present).map(g => {
    const n = g === 'all' ? extra.all.length : extra.all.filter(p => p.g === g).length;
    return '<button data-g="' + g + '" class="' + (S.nearCat === g ? 'on' : '') + '">' +
      (g === 'all' ? 'Όλα' : LMAP_CATS[g].label) + ' ' + n + '</button>';
  }).join('') + '</div>' : '';

  // Πλαφόν 400: με 1.156 καρφίτσες η λίστα είναι εργαλείο πλοήγησης, όχι εξαγωγή.
  // Το πλαφόν ΔΗΛΩΝΕΤΑΙ — σιωπηλή κοπή θα διαβαζόταν σαν «αυτά είναι όλα».
  const CAP = 400;
  document.getElementById('lmapList').innerHTML = chips + items.slice(0, CAP).map(p =>
    '<div class="lmap-li' + (S.sel === p.id ? ' sel' : '') + '" data-i="' + _lmapEsc(p.id) + '">' +
      '<span class="lmap-dot" style="background:' + _lmapColorOf(p) + '"></span>' +
      '<div class="tx"><div class="t">' + _lmapEsc(p.n) + '</div><div class="s">' +
        _lmapEsc(p.c || p.k || '—') + (p.cl ? ' · ' + _lmapEsc(p.cl) : '') +
        (p.sp ? ' · ' + _lmapEsc(p.sp) : '') + '</div></div>' +
      (p.d != null ? '<span class="km">' + p.d.toFixed(0) + ' km</span>' : '') +
    '</div>').join('')
    + (items.length > CAP ? '<div class="lmap-more">…και άλλα ' +
        (items.length - CAP).toLocaleString('el-GR') +
        '. Φιλτράρισε ή χρησιμοποίησε ακτίνα.</div>' : '')
    + (items.length === 0 ? '<div class="lmap-empty">Κανένα σημείο με αυτά τα φίλτρα.</div>' : '');

  document.querySelectorAll('.lmap-chips button').forEach(b =>
    b.onclick = () => { S.nearCat = b.dataset.g; _lmapDraw(); });
  document.querySelectorAll('.lmap-li').forEach(el => el.onclick = () => {
    const p = LMAP.pts.find(x => x.id === el.dataset.i);
    if (!p) return;
    _lmapSelect(p); _lmapDetail(p);
    const m = LMAP.markerOf.get(p.id);
    // Σε ομαδοποίηση η καρφίτσα κρύβεται μέσα σε cluster και το setView δεν την
    // αποκαλύπτει· σε προβολή καρφιτσών είναι ήδη ορατή.
    if (m && S.grouped) LMAP.cluster.zoomToShowLayer(m, () => m.openTooltip());
    else {
      LMAP.map.setView([p.la, p.lo], Math.max(LMAP.map.getZoom(), 11));
      if (m) m.openTooltip();
    }
  });
}
function _lmapSelect(p) {
  LMAP.S.sel = p.id;
  document.querySelectorAll('.lmap-li').forEach(e => e.classList.toggle('sel', e.dataset.i === p.id));
  const el = document.querySelector('.lmap-li.sel');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function _lmapSetGrouped(on) {
  LMAP.S.grouped = on;
  LMAP.map.removeLayer(on ? LMAP.pinLayer : LMAP.cluster);
  LMAP.map.addLayer(on ? LMAP.cluster : LMAP.pinLayer);
  document.getElementById('lmapPin').classList.toggle('on', !on);
  document.getElementById('lmapGrp').classList.toggle('on', on);
  _lmapDraw();
}
function _lmapSetColorBy(m) {
  LMAP.S.colorBy = m;
  document.getElementById('lmapCCat').classList.toggle('on', m === 'cat');
  document.getElementById('lmapCCli').classList.toggle('on', m === 'client');
  document.getElementById('lmapAccCli').classList.toggle('closed', m !== 'client');
  document.getElementById('lmapAccCat').classList.toggle('closed', m === 'client');
  _lmapDraw();
}

// ── Ακτίνα ─────────────────────────────────────
function _lmapArm(r) {
  const S = LMAP.S;
  S.radiusKm = r;
  document.querySelectorAll('.lmap-rad button').forEach(b =>
    b.classList.toggle('on', Number(b.dataset.r) === r));
  LMAP.map.getContainer().style.cursor = 'crosshair';
  document.getElementById('lmapBar').classList.add('show');
  document.getElementById('lmapBarTxt').textContent = 'Ακτίνα ' + r + ' km — κάνε κλικ στον χάρτη';
  if (S.center) _lmapSetCenter(S.center[0], S.center[1]);
}
function _lmapSetCenter(la, lo) {
  const S = LMAP.S;
  S.center = [la, lo];
  if (LMAP.circle) LMAP.map.removeLayer(LMAP.circle);
  if (LMAP.cMark) LMAP.map.removeLayer(LMAP.cMark);
  const accent = _lmapVar('--accent');
  LMAP.circle = L.circle([la, lo], { radius: S.radiusKm * 1000, color: accent, weight: 2,
    fillColor: accent, fillOpacity: 0.06, dashArray: '6 5' }).addTo(LMAP.map);
  LMAP.cMark = L.marker([la, lo], { icon: L.divIcon({ className: '', iconSize: [18, 18],
    iconAnchor: [9, 9], html: '<div class="lmap-ctr"><i></i><b></b></div>' }) }).addTo(LMAP.map);
  LMAP.map.fitBounds(LMAP.circle.getBounds(), { padding: [40, 40] });
  document.getElementById('lmapBarTxt').textContent =
    'Ακτίνα ' + S.radiusKm + ' km — νέο κλικ για άλλο σημείο';
  _lmapDraw();
}
function _lmapExitRadius() {
  const S = LMAP.S;
  if (LMAP.circle) LMAP.map.removeLayer(LMAP.circle);
  if (LMAP.cMark) LMAP.map.removeLayer(LMAP.cMark);
  LMAP.circle = null; LMAP.cMark = null;
  S.center = null; S.radiusKm = null; S.nearCat = 'all';
  document.querySelectorAll('.lmap-rad button').forEach(b => b.classList.remove('on'));
  LMAP.map.getContainer().style.cursor = '';
  document.getElementById('lmapBar').classList.remove('show');
  _lmapDraw();
}

// ── Λεπτομέρειες ───────────────────────────────
function _lmapRow(k, v, note) {
  return '<div class="lmap-r"><span class="k">' + k + '</span><span class="v' +
    (v ? '' : ' e') + '">' + (v ? _lmapEsc(v) : (note || '—')) + '</span></div>';
}
function _lmapDetail(p) {
  const c = LMAP_CATS[p.g] || LMAP_CATS.unknown, isWs = p.g === 'workshop';
  document.getElementById('lmapGrid').classList.add('detail-open');
  // Το grid στενεύει τη στήλη του χάρτη· χωρίς invalidateSize το Leaflet κρατά
  // το παλιό πλάτος και αφήνει λευκή λωρίδα. 220ms = η διάρκεια του transition.
  setTimeout(() => LMAP.map && LMAP.map.invalidateSize(), 220);
  document.getElementById('lmapDet').innerHTML =
`<div class="lmap-dh">
  <button class="lmap-dx" onclick="_lmapCloseDetail()" aria-label="Κλείσιμο">×</button>
  <div class="k"><span class="lmap-dot" style="background:${c.color}"></span>${c.label}</div>
  <h2>${_lmapEsc(p.n)}</h2>
  <div class="l">${_lmapEsc(p.c)}${p.c && p.k ? ' · ' : ''}${_lmapEsc(p.k)}</div>
</div>
<div class="lmap-db">
  <div class="lmap-sect">Στοιχεία</div>
  ${_lmapRow('Πόλη', p.c)}${_lmapRow('Χώρα', p.k)}${_lmapRow('Κατηγορία', c.label)}
  ${isWs ? _lmapRow('Ειδικότητα', p.sp) : _lmapRow('Πελάτης', p.cl)}
  ${_lmapRow('Χαρακτηρισμός', p.t)}
  ${_lmapRow('Συντεταγμένες', p.la.toFixed(5) + ', ' + p.lo.toFixed(5))}

  <div class="lmap-sect">Επικοινωνία</div>
  ${_lmapRow('Τηλέφωνο', p.ph, 'δεν έχει καταχωρηθεί')}
  ${_lmapRow('Επαφή', p.ct, 'δεν έχει καταχωρηθεί')}

  <div class="lmap-sect">Ιστορικό κινήσεων</div>
  <div class="lmap-mt"><button type="button" class="btn btn-sm" onclick="_locOpenCard('${_lmapEsc(p.id)}')">Άνοιγμα καρτέλας τοποθεσίας →</button></div>

  <div class="lmap-sect">Ενέργειες</div>
  <div class="lmap-brow">
    <a class="btn btn-sm" target="_blank" rel="noopener"
       href="https://maps.google.com/?q=${p.la},${p.lo}">Google Maps</a>
    <button class="btn btn-sm" onclick="_lmapNearHere(${p.la},${p.lo})">Τι έχει κοντά</button>
  </div>
  <div class="lmap-brow" style="margin-top:var(--space-2)">
    <button class="btn btn-primary btn-sm" style="flex:1"
      onclick="_lmapEdit('${_lmapEsc(p.id)}')">Επεξεργασία τοποθεσίας</button>
  </div>
</div>`;
}
function _lmapNearHere(la, lo) {
  if (!LMAP.S.radiusKm) _lmapArm(100);
  _lmapSetCenter(la, lo);
}
function _lmapCloseDetail() {
  document.getElementById('lmapGrid').classList.remove('detail-open');
  setTimeout(() => LMAP.map && LMAP.map.invalidateSize(), 220);
  LMAP.S.sel = null;
  document.querySelectorAll('.lmap-li.sel').forEach(e => e.classList.remove('sel'));
}
// Η επεξεργασία περνά στη ΜΙΑ υπάρχουσα φόρμα του locations.js — δεν φτιάχνουμε
// δεύτερη, ώστε validation και κανόνες (π.χ. προστασία Veroia) να μένουν ένα σημείο.
function _lmapEdit(id) {
  if (typeof _locOpenEdit === 'function') { _locOpenEdit(id); return; }
  if (typeof toast === 'function') toast('Η φόρμα επεξεργασίας δεν είναι διαθέσιμη', 'danger');
}
