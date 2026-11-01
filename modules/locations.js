// ═══════════════════════════════════════════════
// MODULE — LOCATIONS v2 (κύμα 2, Figma w2-locations-overview 161:592)
// ═══════════════════════════════════════════════
// Module state uses 'LOC' / '_loc' prefix to avoid global collisions.
'use strict';

const LOC = {
  records: [],
  filtered: [],
  sortCol: 'Name',
  sortDir: 1,
  page: 1,
  pageSize: 50,
  editingId: null,
  loaded: false,
  // Β (owner 25/8): φίλτρο 4 τύπων κίνησης — ο δείκτης χτίζεται lazily
  // από order_stops+γονείς την πρώτη φορά που θα ζητηθεί.
  moveFilter: '',
  moveIdx: null,
  // Το chip «N χωρίς συντεταγμένες» είναι φίλτρο, όχι διακόσμηση: η δουλειά
  // της οθόνης ξεκινά από εκεί (σημείο χωρίς συντεταγμένες = καρφίτσα που
  // λείπει από τον χάρτη και δρομολόγιο που δεν υπολογίζεται).
  noCoords: false,
  mapOpen: false,
};

// ── Entry point ────────────────────────────────
async function renderLocations() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Φόρτωση τοποθεσιών…');
  try {
    if (!LOC.loaded) {
      LOC.records = await _locFetchAll();
      LOC.loaded = true;
    }
    c.innerHTML = _locShell();
    _locBindEvents();
    _locBuildFilterOptions();
    _locApplyFilters();
  } catch (e) {
    // Failure ≠ empty (DESIGN.md #7): what did not load, what that does NOT
    // mean, one retry. The raw e.message («Failed to fetch») goes to the log only.
    c.innerHTML = `<div role="alert" style="max-width:560px;margin:var(--space-8) auto 0;padding:var(--space-4);border:1px solid var(--danger);border-radius:var(--radius);background:var(--surface-card);color:var(--text);font-size:var(--text-body);display:flex;flex-direction:column;gap:var(--space-2)">
      <b style="font-family:'Syne',sans-serif;font-size:var(--text-base);color:var(--danger)">Δεν φορτώθηκαν — οι τοποθεσίες</b>
      <span>Αυτό δεν σημαίνει ότι δεν υπάρχουν τοποθεσίες. Έλεγξε τη σύνδεση και ξαναδοκίμασε.</span>
      <span><button type="button" class="btn btn-primary btn-sm" onclick="renderLocations()">Ξαναδοκίμασε</button></span></div>`;
    if (typeof logError === 'function') logError(e, 'renderLocations load');
  }
}

// ── Shell ──────────────────────────────────────
// Μία μπάρα (τίτλος + πλήθος + φίλτρα + chip + αναζήτηση + ενέργειες) πάνω
// από τον πίνακα — ο σκελετός του κύματος 1 (.entity-v2), ώστε ο κανόνας #5
// (≥20 γραμμές ορατές στα 1080p) να βγαίνει από το ίδιο CSS και όχι από νέο.
// Η παλιά καρτέλα «Επισκόπηση» (KPI + μπάρες ανά χώρα/κίνηση) έφυγε: το
// drill-down της γίνεται από τα φίλτρα Χώρα/Κίνηση της μπάρας, και η
// «Ελλιπή στοιχεία» έγινε επιλογή του φίλτρου Χώρα. Ο χάρτης παραμένει
// στην ίδια σελίδα (owner 12/8) — εναλλάσσεται με τον πίνακα από το κουμπί.
function _locShell() {
  return `
<div class="entity-layout entity-v2">
  <div class="entity-list-panel" id="locListPanel">
    <div class="ev2-bar">
      <span class="ev2-title">Τοποθεσίες</span>
      <span class="ev2-count" id="locCount"></span>
      <select class="svc-filter" id="locCountryFilter">
        <option value="">Χώρα: Όλες</option>
      </select>
      <select class="svc-filter" id="locTypeFilter">
        <option value="">Τύπος: Όλοι</option>
      </select>
      <select class="svc-filter" id="locMoveFilter" title="Τύπος κίνησης από το ιστορικό στάσεων — μετάφραση εμφάνισης, τίποτα δεν γράφεται">
        <option value="">Κίνηση: Όλες</option>
        <option>ΕΞΑΓΩΓΗ</option>
        <option>ΕΙΣΑΓΩΓΗ</option>
        <option>ΚΑΘΟΔΟΣ</option>
        <option>ΑΝΟΔΟΣ</option>
      </select>
      <button type="button" class="loc-chip" id="locNoCoords" aria-pressed="false"
        title="Μόνο τοποθεσίες χωρίς συντεταγμένες — δεν εμφανίζονται στον χάρτη"></button>
      <input class="ev2-search" id="locSearch" placeholder="Αναζήτηση ονόματος, πόλης, διεύθυνσης…">
      <button type="button" class="btn btn-ghost btn-sm loc-map-btn" id="locMapBtn">Χάρτης</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="_locOpenCreate()">+ Νέα τοποθεσία</button>
    </div>

    <div class="entity-table-wrap" id="locTableWrap">
      <table id="locTable">
        <thead>
          <tr>
            <th class="loc-th" data-col="Name">ΟΝΟΜΑΣΙΑ ↕</th>
            <th class="loc-th" data-col="City">ΠΟΛΗ ↕</th>
            <th class="loc-th" data-col="Country">ΧΩΡΑ ↕</th>
            <th class="loc-th">ΤΥΠΟΣ</th>
            <th class="loc-th">ΣΥΝΤΕΤΑΓΜΕΝΕΣ</th>
            <th class="loc-th loc-th-act"></th>
          </tr>
        </thead>
        <tbody id="locTbody"></tbody>
      </table>
    </div>
    <div id="locPager" class="loc-pager"></div>

    <!-- Χάρτης — γεμίζει από το locations_map.js με το πρώτο άνοιγμα -->
    <div id="locMapHost" class="loc-map-host"></div>
  </div>
</div>

<style>
/* Κεφαλίδες ταξινόμησης: το ↕ είναι μέρος του κειμένου της στήλης */
#locTable thead th.loc-th[data-col] { cursor: pointer; }
#locTable thead th.loc-th[data-col]:hover { color: var(--text); }
#locTable thead th.loc-th-act { width: 80px; }
/* Οι γραμμές ανοίγουν καρτέλα (Βήμα 4, 25/8) */
#locTable tbody tr { cursor: pointer; }
#locTable tbody tr:hover td { background: var(--surface-sunken); }
/* Κάθε αριθμός σε στήλη (συντεταγμένες, πλήθη) ευθυγραμμίζεται — ΜΕΡΟΣ Γ. */
#locTable td { font-variant-numeric: tabular-nums; }
/* Κελί δύο σειρών (DESIGN.md ΜΕΡΟΣ Ζ.1): όνομα πάνω, διεύθυνση κάτω αχνά —
   λύνει το πλάτος χωρίς κοπή (κανόνας #6) και χωρίς δεύτερη στήλη. */
.loc-cell2 { display: flex; flex-direction: column; justify-content: center; line-height: 14px; }
.loc-cell2 .loc-name { font-weight: 500; color: var(--text); }
.loc-cell2 .loc-sub { font-size: var(--text-xs); color: var(--text-dim); line-height: 13px; margin-top: 1px; }
.loc-coord { color: var(--text-mid); text-decoration: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
.loc-coord:hover { color: var(--text); }
/* Άγνωστο ≠ μηδέν (κανόνας #3). Η πλήρης φράση σε χρώμα προσοχής ΜΟΝΟ στις
   συντεταγμένες — το λειτουργικό κενό που φιλτράρει το chip. Πόλη/Χώρα/Τύπος
   λείπουν σε εκατοντάδες εγγραφές (575 αταξινόμητα, 25/8): με φράση παντού η
   στήλη γίνεται τοίχος πορτοκαλί και το χρώμα παύει να διακρίνει (κανόνας #4). */
.loc-miss { color: var(--warn); font-size: var(--text-xs); white-space: nowrap; }
.loc-dash { color: var(--text-dim); }
.loc-type { color: var(--text-mid); }
.loc-act-btn { background: none; border: none; cursor: pointer; padding: var(--space-1) var(--space-2); border-radius: var(--radius); color: var(--text-dim); transition: all .12s; font-size: var(--text-sm); line-height: 1; }
.loc-act-btn:hover { background: var(--surface-sunken); color: var(--text); }
.loc-act-btn.del:hover { background: var(--danger-bg); color: var(--danger); }
/* Chip-φίλτρο: πλήθος σε χρώμα προσοχής ΚΑΙ λέξη (κανόνας #2). Με μηδέν γίνεται
   disabled, όχι αόρατο (Δ2): ο αναγνώστης βλέπει ότι ο λογαριασμός είναι στο 0. */
.loc-chip { display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-1) var(--space-3); border-radius: var(--radius-full); border: 1px solid var(--border); background: var(--surface-card); font: inherit; font-size: var(--text-sm); color: var(--text-mid); cursor: pointer; white-space: nowrap; }
.loc-chip b { color: var(--warn); font-variant-numeric: tabular-nums; }
.loc-chip:hover:not(:disabled) { background: var(--surface-sunken); }
.loc-chip[aria-pressed="true"] { background: var(--surface-dark); border-color: var(--surface-dark); color: var(--text-on-dark); }
.loc-chip[aria-pressed="true"] b { color: var(--text-on-dark); }
.loc-chip:disabled { color: var(--text-dim); background: var(--surface-page); cursor: default; }
.loc-chip:disabled b { color: var(--text-dim); }
.loc-chip:empty { display: none; }
.loc-pager { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-6); border-top: 1px solid var(--border); justify-content: flex-end; background: var(--surface-card); flex-shrink: 0; }
.loc-pager-btn { background: var(--surface-page); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-1) var(--space-3); font-size: var(--text-xs); color: var(--text-mid); cursor: pointer; transition: all .12s; }
.loc-pager-btn:hover:not(:disabled) { border-color: var(--surface-dark); color: var(--text); }
.loc-pager-btn.active { background: var(--surface-dark); color: var(--text-on-dark); border-color: var(--surface-dark); font-weight: 700; }
.loc-pager-btn:disabled { opacity: .3; cursor: not-allowed; }
.loc-pager-info { font-size: var(--text-xs); color: var(--text-dim); margin-right: var(--space-2); font-variant-numeric: tabular-nums; }
/* Εναλλαγή πίνακα/χάρτη μέσα στο ίδιο panel: ο χάρτης παίρνει τον χώρο του
   πίνακα. Όσο είναι display:none το Leaflet μετρά μηδενικό ύψος — γι' αυτό
   το _lmapOpen κάνει invalidateSize σε κάθε επόμενο άνοιγμα. */
.loc-map-host { display: none; flex: 1; min-height: 0; }
.loc-map-on #locTableWrap, .loc-map-on #locPager { display: none; }
.loc-map-on .loc-map-host { display: block; }
/* Lat/Lon/Τηλέφωνο σε 3 ίσες στήλες μέσα στη φόρμα (Figma 218:1010).
   Ειδικός συνδυασμός επιλογέα (όχι .form-grid μόνο) ώστε να νικά με
   βεβαιότητα το grid-template-columns:1fr 1fr του .form-grid — χωρίς αυτό
   η σειρά της κατάταξης στο CSS θα αποφάσιζε, όχι το intent. */
.form-grid.loc-form-row3 { grid-template-columns: 1fr 1fr 1fr; }
/* Γεωκωδικοποίηση ως σύνδεσμος, όχι κουμπί περιγράμματος (Figma 218:1010) */
.loc-geo-row { flex-direction: row; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
.loc-geo-link { background: none; border: none; padding: 0; font: inherit; font-weight: 600; color: var(--accent); cursor: pointer; }
.loc-geo-link:hover { text-decoration: underline; }
.loc-geo-caption { font-size: var(--text-xs); color: var(--text-dim); }
</style>`;
}

// ── Events ─────────────────────────────────────
function _locBindEvents() {
  document.getElementById('locSearch').addEventListener('input', () => { LOC.page = 1; _locApplyFilters(); });
  document.getElementById('locCountryFilter').addEventListener('change', () => { LOC.page = 1; _locApplyFilters(); });
  document.getElementById('locTypeFilter').addEventListener('change', () => { LOC.page = 1; _locApplyFilters(); });
  document.getElementById('locMoveFilter').addEventListener('change', async (e) => {
    LOC.moveFilter = e.target.value; LOC.page = 1;
    if (LOC.moveFilter && !LOC.moveIdx) await _locBuildMoveIdx();
    _locApplyFilters();
  });
  document.getElementById('locNoCoords').addEventListener('click', () => {
    LOC.noCoords = !LOC.noCoords; LOC.page = 1;
    _locApplyFilters();
  });
  document.getElementById('locMapBtn').addEventListener('click', _locToggleMap);
  document.querySelectorAll('.loc-th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (LOC.sortCol === col) LOC.sortDir *= -1;
      else { LOC.sortCol = col; LOC.sortDir = 1; }
      LOC.page = 1;
      _locApplyFilters();
    });
  });
}

// Ο χάρτης χτίζεται με το πρώτο άνοιγμα, όχι με τη σελίδα: το Leaflet (54 KB)
// και το fetch των συνεργείων δεν χρεώνονται σε όποιον δεν τον ανοίξει ποτέ
// (owner 12/8). Στα επόμενα ανοίγματα το _lmapOpen κάνει invalidateSize.
function _locToggleMap() {
  LOC.mapOpen = !LOC.mapOpen;
  const panel = document.getElementById('locListPanel');
  const btn = document.getElementById('locMapBtn');
  if (!panel || !btn) return;
  panel.classList.toggle('loc-map-on', LOC.mapOpen);
  btn.textContent = LOC.mapOpen ? 'Λίστα' : 'Χάρτης';
  if (LOC.mapOpen && typeof _lmapOpen === 'function') _lmapOpen();
}

// ── Filter options ─────────────────────────────
function _locBuildFilterOptions() {
  const cf = document.getElementById('locCountryFilter');
  // LO-2: η παλιά κάρτα «Ελλιπή Στοιχεία» οδηγούσε εδώ — μένει ως μόνιμη επιλογή
  { const o = document.createElement('option'); o.value = '__missing'; o.textContent = '— Ελλιπή στοιχεία'; cf.appendChild(o); }

  // One list everywhere (owner 5/9): options collapse on the ISO code so
  // «GR» and «Greece» are ONE entry instead of two — CL-1/PA-1's bug, here
  // for LOCATIONS too. Labels are always the Greek name; the value stays
  // the code so the predicate below compares like-for-like.
  const codes = new Set();
  let hasUnknown = false;
  LOC.records.forEach(r => {
    const raw = r.fields.Country;
    if (!raw) return;
    const c = typeof countryCode === 'function' ? countryCode(raw) : null;
    if (c) codes.add(c); else hasUnknown = true;
  });
  [...codes].sort((a, b) => countryName(a).localeCompare(countryName(b), 'el'))
    .forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = countryName(c); cf.appendChild(o); });
  // K3: a spelling countryCode() cannot resolve is never dropped from the
  // filter — one shared bucket instead of one stray option per misspelling.
  if (hasUnknown) { const o = document.createElement('option'); o.value = '__unknown'; o.textContent = 'άγνωστη γραφή'; cf.appendChild(o); }

  // Τύποι από τα ΔΕΔΟΜΕΝΑ, όχι από σταθερή λίστα: η παλιά είχε «Office»,
  // «Budapest Hub», «Service / Workshop» που δεν υπάρχουν σε καμία εγγραφή
  // (νεκρές επιλογές = ψέμα, αρχή 8). Οι γραφές του ελεύθερου Type (μετρημένο 3/9: 6 διακριτές, 98% κενές — ΟΧΙ «60+» όπως γράφτηκε αρχικά)
  // φαίνονται έτσι ως έχουν — ποιότητα δεδομένων ορατή, όχι κρυμμένη.
  const types = [...new Set(LOC.records.map(r => (r.fields.Type || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'el'));
  const tf = document.getElementById('locTypeFilter');
  types.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; tf.appendChild(o); });
}

function _locHasCoords(f) {
  return f.Latitude != null && f.Longitude != null;
}

// ── Filter + Sort ──────────────────────────────
function _locApplyFilters() {
  const q       = (document.getElementById('locSearch')?.value || '').toLowerCase().trim();
  const country = document.getElementById('locCountryFilter')?.value || '';
  const type    = document.getElementById('locTypeFilter')?.value || '';

  LOC.filtered = LOC.records.filter(r => {
    if (LOC.moveFilter) {
      // Δείκτης που απέτυχε να χτιστεί = ΚΑΝΕΝΑ φιλτράρισμα σιωπηλά — ο
      // χειριστής το έμαθε με toast στο _locBuildMoveIdx και το φίλτρο μηδενίστηκε.
      const set = LOC.moveIdx && LOC.moveIdx.get(r.id);
      if (!set || !set.has(LOC.moveFilter)) return false;
    }
    const f = r.fields;
    if (LOC.noCoords && _locHasCoords(f)) return false;
    if (country === '__missing') { if (f.Country && f.City) return false; }
    else if (country === '__unknown') {
      if (!f.Country || (typeof countryCode === 'function' && countryCode(f.Country))) return false;
    }
    else if (country && (typeof countryCode === 'function' ? countryCode(f.Country) !== country : f.Country !== country)) return false;
    if (type && (f.Type || '').trim() !== type) return false;
    if (q) {
      const hay = [f.Name, f.City, f.Country, f.Address].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  LOC.filtered.sort((a, b) => {
    const av = (a.fields[LOC.sortCol] || '').toString().toLowerCase();
    const bv = (b.fields[LOC.sortCol] || '').toString().toLowerCase();
    return av < bv ? -LOC.sortDir : av > bv ? LOC.sortDir : 0;
  });

  const total = LOC.records.length;
  const el = document.getElementById('locCount');
  if (el) el.textContent = LOC.filtered.length === total
    ? `${total.toLocaleString('el-GR')} εγγραφές`
    : `${LOC.filtered.length.toLocaleString('el-GR')} από ${total.toLocaleString('el-GR')}`;

  // Το chip μετρά ΟΛΕΣ τις εγγραφές χωρίς συντεταγμένες, όχι τις φιλτραρισμένες:
  // είναι ο λογαριασμός που εκκρεμεί, ανεξάρτητα από το τι κοιτάς τώρα.
  const chip = document.getElementById('locNoCoords');
  if (chip) {
    const n = LOC.records.filter(r => !_locHasCoords(r.fields)).length;
    chip.innerHTML = `<b>${n.toLocaleString('el-GR')}</b> χωρίς συντεταγμένες`;
    chip.disabled = !n && !LOC.noCoords;
    chip.setAttribute('aria-pressed', LOC.noCoords ? 'true' : 'false');
  }
  _locRenderTable();
}

// ── Table ──────────────────────────────────────
function _locRenderTable() {
  const start = (LOC.page - 1) * LOC.pageSize;
  const slice = LOC.filtered.slice(start, start + LOC.pageSize);
  const tbody = document.getElementById('locTbody');
  if (!tbody) return;

  if (!LOC.filtered.length) {
    // Κενό ≠ αποτυχία (κανόνας #7): η φόρτωση πέτυχε. Δύο διαφορετικά κενά —
    // «δεν βρέθηκε με τα φίλτρα» και «δεν υπάρχει καμία» — ώστε το δεύτερο να
    // μη διαβάζεται ως «χαλάρωσε τα φίλτρα».
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:var(--space-8);color:var(--text-dim)">${LOC.records.length ? 'Καμία τοποθεσία με αυτά τα φίλτρα.' : 'Καμία τοποθεσία καταχωρημένη.'}</td></tr>`;
    document.getElementById('locPager').innerHTML = '';
    // ΚΑΙ εδώ: χωρίς αυτή την κλήση, στήλη κρυμμένη στην προηγούμενη σελίδα θα
    // έμενε κρυμμένη πάνω από άδειο πίνακα — κεφαλίδες που λείπουν χωρίς λόγο.
    collapseEmptyColumns('locTableWrap', 'locations');
    return;
  }

  tbody.innerHTML = slice.map(r => {
    const f = r.fields;
    const hasCoords = _locHasCoords(f);
    const mapsUrl = hasCoords ? `https://maps.google.com?q=${f.Latitude},${f.Longitude}` : '';
    return `<tr onclick="_locOpenCard('${r.id}')">
      <td><div class="loc-cell2"><div class="loc-name">${_locEsc(f.Name || '—')}</div>${f.Address ? `<div class="loc-sub">${_locEsc(f.Address)}</div>` : ''}</div></td>
      <td>${f.City ? _locEsc(f.City) : '<span class="loc-dash">—</span>'}</td>
      <td>${f.Country ? (typeof countryIsKnown === 'function' && !countryIsKnown(f.Country)
        // K3/K7: a spelling countryCode() cannot resolve is shown, muted, with the
        // reason — never silently swapped for a guess or hidden as a dash.
        ? `<span class="loc-dash" title="άγνωστη γραφή — χρειάζεται διόρθωση">${_locEsc(countryName(f.Country))}</span>`
        : _locEsc(typeof countryName === 'function' ? countryName(f.Country) : f.Country)) : '<span class="loc-dash">—</span>'}</td>
      <td class="loc-type">${f.Type ? _locEsc(f.Type) : '<span class="loc-dash">—</span>'}</td>
      <td>
        ${hasCoords
          ? `<a class="loc-coord" href="${mapsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${f.Latitude.toFixed(4)}, ${f.Longitude.toFixed(4)} ↗</a>`
          : '<span class="loc-miss">— δεν έχει καταχωρηθεί</span>'}
      </td>
      <td onclick="event.stopPropagation()" style="text-align:right;padding-right:var(--space-4)">
        <button class="loc-act-btn" onclick="_locOpenEdit('${r.id}')" title="Επεξεργασία">✏️</button>
        ${r.id === F.VEROIA_LOC
          ? '<span class="loc-act-btn" title="Κλειδωμένο — κλειδί της αλυσίδας Veroia Switch" style="cursor:default;opacity:0.5">🔒</span>'
          : `<button class="loc-act-btn del" onclick="_locConfirmDelete('${r.id}','${_locEsc(f.Name||'').replace(/'/g,"\\'")}') " title="Διαγραφή">🗑️</button>`}
      </td>
    </tr>`;
  }).join('');

  // ΤΥΠΟΣ: 26 γεμάτες στις 1.164 (Supabase 3/9), αλλά η σελίδα δείχνει 50 τη
  // φορά — άρα στις περισσότερες σελίδες είναι κενή σε ΟΛΕΣ τις ορατές γραμμές
  // και κρύβεται, ενώ ξαναεμφανίζεται στη σελίδα που έχει τιμές. Η κεφαλίδα δεν
  // ξαναχτίζεται εδώ (αλλάζει μόνο το tbody), γι' αυτό η collapseEmptyColumns
  // καθαρίζει πρώτα ό,τι έκρυψε την προηγούμενη φορά.
  collapseEmptyColumns('locTableWrap', 'locations');

  _locRenderPager();
}

function _locRenderPager() {
  const total = LOC.filtered.length;
  const pages = Math.ceil(total / LOC.pageSize);
  const pager = document.getElementById('locPager');
  if (!pager) return;
  if (pages <= 1) {
    pager.innerHTML = `<span class="loc-pager-info">${total.toLocaleString('el-GR')} εγγραφές</span>`;
    return;
  }
  const p = LOC.page;
  let html = `<span class="loc-pager-info">${((p-1)*LOC.pageSize+1).toLocaleString('el-GR')}–${Math.min(p*LOC.pageSize,total).toLocaleString('el-GR')} από ${total.toLocaleString('el-GR')}</span>`;
  html += `<button class="loc-pager-btn" onclick="_locGoPage(${p-1})" ${p===1?'disabled':''}>‹</button>`;
  const range = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - p) <= 2) range.push(i);
    else if (range[range.length - 1] !== '…') range.push('…');
  }
  range.forEach(pg => {
    if (pg === '…') html += `<span class="loc-pager-btn" style="cursor:default;opacity:.4;pointer-events:none">…</span>`;
    else html += `<button class="loc-pager-btn ${pg===p?'active':''}" onclick="_locGoPage(${pg})">${pg}</button>`;
  });
  html += `<button class="loc-pager-btn" onclick="_locGoPage(${p+1})" ${p===pages?'disabled':''}>›</button>`;
  pager.innerHTML = html;
}

function _locGoPage(p) {
  LOC.page = p;
  _locRenderTable();
  document.getElementById('locTableWrap')?.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Create / Edit ──────────────────────────────
function _locOpenCreate() {
  LOC.editingId = null;
  LOC.dupOk = null;
  openModal('Νέα τοποθεσία', _locFormHTML({}),
    `<button class="btn btn-ghost" onclick="closeModal()">Άκυρο</button>
     <button class="btn btn-primary" id="locSaveBtn" onclick="_locSave()">Αποθήκευση</button>`);
  setTimeout(() => document.getElementById('locGeoBtn')?.addEventListener('click', _locGeocode), 50);
}

function _locOpenEdit(id) {
  const rec = LOC.records.find(r => r.id === id);
  if (!rec) return;
  LOC.editingId = id;
  openModal('Επεξεργασία τοποθεσίας', _locFormHTML(rec.fields),
    `<button class="btn btn-ghost" onclick="closeModal()">Άκυρο</button>
     <button class="btn btn-primary" id="locSaveBtn" onclick="_locSave()">Αποθήκευση</button>`);
  setTimeout(() => document.getElementById('locGeoBtn')?.addEventListener('click', _locGeocode), 50);
}

function _locFormHTML(f) {
  return `
<datalist id="locTDL">${['Client Depot','Fuel Station','Partner Warehouse','ΣΥΝΕΡΓΕΙΟ','Custom Point','Veroia Hub','Πλυντήριο'].map(t => `<option value="${t}">`).join('')}</datalist>
<div class="loc-dup" id="locDupWarn" hidden></div>
<div class="form-grid">
  <div class="form-field span-2">
    <label class="form-label">Όνομα *</label>
    <input id="locF_name" class="form-input" placeholder="π.χ. VERMION FRESH, Veroia" value="${_locEsc(f.Name||'')}">
    <div style="font-size:var(--text-xs);color:var(--text-dim);margin-top:var(--space-1)">Λατινικοί χαρακτήρες (greeklish), όπως όλες οι εγγραφές — κανόνας 9/8.</div>
  </div>
  <div class="form-field">
    <label class="form-label">Χώρα</label>
    <!-- One list everywhere (owner 5/9): a free-text datalist spread misspellings
         (this field is the reason CL-1/PA-1 exist) — see core/countries.js. -->
    <select id="locF_country" class="form-input">${countryOptionsHtml(f.Country)}</select>
  </div>
  <div class="form-field">
    <label class="form-label">Πόλη</label>
    <input id="locF_city" class="form-input" placeholder="π.χ. Veroia" value="${_locEsc(f.City||'')}">
  </div>
  <div class="form-field span-2">
    <label class="form-label">Διεύθυνση</label>
    <input id="locF_address" class="form-input" placeholder="Οδός, Τ.Κ.…" value="${_locEsc(f.Address||'')}">
  </div>
  <div class="form-field span-2">
    <label class="form-label">Τύπος</label>
    <input id="locF_type" class="form-input" list="locTDL" placeholder="π.χ. Client Depot" value="${_locEsc(f.Type||'')}">
  </div>
  <div class="form-field">
    <label class="form-label">Ωράριο</label>
    <input id="locF_hours" class="form-input" placeholder="π.χ. 06:00–14:00" value="${_locEsc(f['Opening Hours']||'')}">
  </div>
  <div class="form-field">
    <label class="form-label">Ημέρες παράδοσης</label>
    <input id="locF_days" class="form-input" placeholder="π.χ. Δευ–Παρ" value="${_locEsc(f['Delivery Days']||'')}">
  </div>
  <div class="form-field span-2">
    <!-- Lat/Lon/Τηλέφωνο σε μία γραμμή τριών ίσων στηλών — Figma 218:1010 -->
    <div class="form-grid loc-form-row3">
      <div class="form-field">
        <label class="form-label">Γεωγρ. πλάτος (Latitude)</label>
        <input id="locF_lat" class="form-input" type="number" step="any" placeholder="40.5211" value="${f.Latitude != null ? f.Latitude : ''}">
      </div>
      <div class="form-field">
        <label class="form-label">Γεωγρ. μήκος (Longitude)</label>
        <input id="locF_lon" class="form-input" type="number" step="any" placeholder="22.2033" value="${f.Longitude != null ? f.Longitude : ''}">
      </div>
      <div class="form-field">
        <label class="form-label">Τηλέφωνο</label>
        <input id="locF_phone" class="form-input" placeholder="π.χ. 210 558 4237" value="${_locEsc(f.Phone||'')}">
      </div>
    </div>
  </div>
  <div class="form-field span-2">
    <label class="form-label">Σημειώσεις</label>
    <input id="locF_notes" class="form-input" placeholder="π.χ. χωρίς κλαρκ — τηλεφώνησε πριν" value="${_locEsc(f.Notes||'')}">
  </div>
  <div class="form-field span-2 loc-geo-row">
    <button class="loc-geo-link" id="locGeoBtn">Εύρεση συντεταγμένων</button>
    <span class="loc-geo-caption">από τη διεύθυνση, αλλιώς από όνομα + πόλη</span>
  </div>
</div>`;
}

async function _locSave() {
  let name = document.getElementById('locF_name')?.value.trim();
  if (!name) { toast('Το όνομα είναι υποχρεωτικό', 'danger'); return; }
  // Latin-only names (owner 9/8): 9 of the 29 locations created in the last 14
  // days were typed in Greek and are invisible to the transliterated search.
  // Transliterate (ELOT, case kept) instead of refusing — the dispatcher keeps working.
  if (/[Ͱ-Ͽ]/.test(name) && typeof _fhTranslit === 'function') {
    name = _fhTranslit(name);
    toast('Το όνομα γράφτηκε με λατινικούς χαρακτήρες: ' + name, 'info');
  }
  const fields = { Name: name };
  const country = document.getElementById('locF_country')?.value.trim();
  let city      = document.getElementById('locF_city')?.value.trim();
  // the city too (owner 1/11, F16): «ΑΣΠΡΟΠΥΡΓΟΣ» next to «Aspropyrgos» made one town two
  if (city && /[Ͱ-Ͽ]/.test(city) && typeof _fhTranslit === 'function') city = _fhTranslit(city);
  const address = document.getElementById('locF_address')?.value.trim();
  const type    = document.getElementById('locF_type')?.value.trim();
  const lat     = parseFloat(document.getElementById('locF_lat')?.value);
  const lon     = parseFloat(document.getElementById('locF_lon')?.value);
  if (country)    fields.Country   = country;
  if (city)       fields.City      = city;
  if (address)    fields.Address   = address;
  if (type)       fields.Type      = type;
  if (!isNaN(lat)) fields.Latitude  = lat;
  if (!isNaN(lon)) fields.Longitude = lon;
  const hours = document.getElementById('locF_hours')?.value.trim();
  const days  = document.getElementById('locF_days')?.value.trim();
  if (hours) fields['Opening Hours'] = hours;
  if (days)  fields['Delivery Days'] = days;
  // Notes/Phone: στέλνονται ΠΑΝΤΑ (κενό = null) — το «στείλε μόνο αν γεμάτο»
  // έκανε τιμή που καθαρίστηκε να μην ξαναγράφεται ποτέ (μοτίβο read-drop).
  fields['Notes'] = document.getElementById('locF_notes')?.value.trim() || null;
  fields['Phone'] = document.getElementById('locF_phone')?.value.trim() || null;

  const btn = document.getElementById('locSaveBtn');
  // F16: a place that looks like one already in the list is said before it is created; a second press creates it
  // (relaxed rules, owner 31/10: a warning, never a refusal). An edit is not checked: it changes a place, adds none.
  if (!LOC.editingId) {
    const sig = JSON.stringify([fields.Name, fields.City, fields.Country, fields.Latitude, fields.Longitude]);
    const dup = LOC.dupOk === sig ? [] : locDupFind(fields, null);
    if (dup.length) {
      LOC.dupOk = sig;
      _locShowDup(document.getElementById('locDupWarn'), dup, (d) => `<button type="button" class="btn btn-ghost btn-sm" onclick="closeModal();_locOpenEdit('${_locEsc(d.id)}')">Άνοιξε αυτή</button>`);
      if (btn) btn.textContent = 'Δημιουργία νέας';
      return;
    }
  }
  if (btn) { btn.textContent = 'Αποθήκευση…'; btn.disabled = true; }
  try {
    const data = LOC.editingId
      ? await atPatch(TABLES.LOCATIONS, LOC.editingId, fields)
      : await atCreate(TABLES.LOCATIONS, fields);
    if (data.error) throw new Error(data.error.message || 'Η αποθήκευση απέτυχε');
    // F52: the order forms' pickers see the new / renamed place without a reload — never an offline-queued one, whose
    // temporary id no order may point at (as locScanSave below, code review)
    if (typeof fhLocationSaved === 'function' && !data._offline && !String(data.id || '').startsWith('offline_')) fhLocationSaved(data);
    if (LOC.editingId) {
      const idx = LOC.records.findIndex(r => r.id === LOC.editingId);
      if (idx !== -1) LOC.records[idx] = data;
    } else {
      LOC.records.unshift(data);
    }
    closeModal();
    _locApplyFilters();
    // Ο χάρτης χτίζεται μία φορά και κρατά δικό του αντίγραφο των σημείων: χωρίς
    // αυτό, αλλαγή συντεταγμένων έδειχνε πράσινο toast ενώ η καρφίτσα έμενε στο
    // παλιό σημείο μέχρι reload — ο χρήστης θα νόμιζε ότι έσωσε λάθος.
    if (typeof _lmapRefresh === 'function') _lmapRefresh();
    toast(LOC.editingId ? 'Η τοποθεσία ενημερώθηκε ✓' : 'Η τοποθεσία δημιουργήθηκε ✓', 'success');
  } catch (e) {
    reportError('Η αποθήκευση απέτυχε', e);
    if (btn) { btn.textContent = 'Αποθήκευση'; btn.disabled = false; }
  }
}

// F18 (owner 28/10): the ADDRESS first, then name + city. OpenStreetMap rarely knows a client's company name, so the
// name search found nothing for one of the two places created in the live test and the place stayed without a pin,
// although its street address was typed in the form. ONE rule with the scan (_locGeoTries below): the address try
// must hit a house number, no try takes a town, road or postcode area. The person is told WHICH search matched and
// what OpenStreetMap found, so a pin from the name is never taken for the address's, and a search that never ran
// (network, rate limit) is never reported as «nothing found» (principle 1). The fields stay editable.
async function _locGeocode() {
  const name    = document.getElementById('locF_name')?.value.trim();
  const city    = document.getElementById('locF_city')?.value.trim();
  const country = document.getElementById('locF_country')?.value.trim();
  const address = document.getElementById('locF_address')?.value.trim();
  // The select now stores the ISO code (GR), not free text (Greece) — Nominatim's
  // free-text q= matches the full country name far more reliably than a bare code.
  const countryQ = country && typeof countryName === 'function' ? countryName(country, 'en') : country;
  const tries = [
    { by: 'τη διεύθυνση', q: address ? [address, city, countryQ] : [], house: true },
    // without a name, «city, country» can only answer the town, which no try takes: not asked (as the scan)
    { by: 'όνομα + πόλη', q: name ? [name, city, countryQ] : [], house: false },
  ].filter((t) => t.q.length);
  if (!tries.length) { toast('Συμπλήρωσε πρώτα διεύθυνση ή όνομα', 'danger'); return; }
  const btn = document.getElementById('locGeoBtn');
  if (btn) { btn.textContent = 'Αναζήτηση…'; btn.disabled = true; }
  try {
    const r = await _locGeoTries(tries);
    if (r.hit) {
      document.getElementById('locF_lat').value = r.hit.lat.toFixed(6);
      document.getElementById('locF_lon').value = r.hit.lon.toFixed(6);
      // OpenStreetMap text is anybody's: escaped, toast() writes its message as HTML
      const found = escapeHtml(r.hit.found.split(',').slice(0, 3).join(','));
      toast(`Οι συντεταγμένες βρέθηκαν από ${r.by}${found ? ': ' + found : ''} — έλεγξέ τες στον χάρτη`, r.by === tries[0].by && tries[0].house ? 'success' : 'warn');
    } else if (r.failed.length === tries.length) toast('Η γεωκωδικοποίηση απέτυχε', 'danger');
    else {
      const ran = tries.map((t) => t.by).filter((by) => !r.failed.includes(by));
      toast(`Δεν βρέθηκε αποτέλεσμα (${ran.join(', ')})${r.failed.length ? ` · η αναζήτηση με ${r.failed.join(', ')} δεν ολοκληρώθηκε — δοκίμασε ξανά` : ''}`, 'danger');
    }
  } finally { if (btn) { btn.textContent = 'Εύρεση συντεταγμένων'; btn.disabled = false; } }
}

// ── New place from an order scan (T44, walkthrough item 16) ──────────────────
// A scanned stop that matched no location can be saved as one from the scan
// preview itself, instead of leaving the scan, creating it on Τοποθεσίες and
// scanning again. It cannot reuse the form above: openModal is a single modal
// (it would replace the preview) and _locSave is bound to this page (LOC.records,
// its filters, closeModal). So this is its own small inline path. A person
// checks name, city and country before anything is written. The map pin is
// looked up when the form opens and SHOWN, with what was found and a map link,
// in two fields the person keeps, corrects or clears (Dimitris 16/10 call
// [00:04:35]: «να αφήνει κενό μόνο τις συντεταγμένες»); the save writes what the
// form holds, because the order's WhatsApp text prints one pin per stop.
const _LOC_SCAN = {};          // uid → { onSaved(item) }; one entry per unmatched stop on screen
const _LOC_SCAN_PENDING = {};  // normalized label → the create in flight, so one place is created once
let _locScanSeq = 0;           // makes every control unique: a re-scan reuses stop positions (L0, D0…)

// Nominatim answers too vague to be a stop: a town, a road, a postcode area.
const _LOC_GEO_VAGUE = new Set(['city', 'town', 'village', 'hamlet', 'municipality', 'county', 'state', 'region',
  'country', 'postcode', 'suburb', 'quarter', 'neighbourhood', 'road']);

/**
 * Nominatim lookup → {lat, lon, found} or null (found = the address
 * OpenStreetMap matched); never throws, never waits more than 4 s per try. Tries name + city + country,
 * then the street address + city + country (the form's «Εύρεση συντεταγμένων» tries the address first, F18):
 * OpenStreetMap rarely knows a client's company name, but a
 * scanned document usually carries the address. A hit that is only a town,
 * a road or a postcode area is refused, and the address try must have a
 * house number (measured 16/10: «Odos 5, 41222, Larisa» returned the Larisa
 * ring road). A wrong pin sends the driver to the wrong place; none is safer.
 */
async function _locGeocodeQuery(name, city, country, address) {
  const countryQ = country && typeof countryName === 'function' ? countryName(country, 'en') : country;
  const tries = [
    { by: 'name', q: [name, city, countryQ], house: false },
    { by: 'address', q: address ? [address, city, countryQ] : [], house: true },
  ].filter((t) => t.q[0]);
  return (await _locGeoTries(tries)).hit;
}
// The ONE try loop of both geocoders (code review 28/10: the form had its own, with another rule). tries: [{by, q,
// house}] in order → {hit: {lat, lon, found}, by} or {hit: null, failed: [by of every try that got no answer]}.
// A hit with a house number is an address (an OSM address node comes as class «place», type «house»); without one,
// a town, road, postcode area or boundary is refused, and a try that wants a house (the address) refuses it too.
async function _locGeoTries(tries) {
  const failed = [];
  let asked = false;
  for (const t of tries) {
    let hit = null;
    // Nominatim allows one request a second: the second try waits, or it is the one rate-limited
    if (asked) await new Promise((r) => setTimeout(r, 1000));
    asked = true;
    try {
      const q = t.q.filter(Boolean).join(', ');
      const opt = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(4000) } : {};
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`, opt);
      // a 429 / 5xx with a JSON body is a search that did not run, never «nothing found»
      if (!r.ok) throw new Error('nominatim ' + r.status);
      const d = await r.json();
      hit = d && d[0];
    } catch (e) { failed.push(t.by); continue; }   // timeout, network or rate limit: the next try, else no pin
    if (!hit) continue;
    const house = !!(hit.address && hit.address.house_number);
    if (t.house && !house) continue;
    if (!house && (_LOC_GEO_VAGUE.has(hit.addresstype) || hit.class === 'boundary' || hit.class === 'place' || hit.class === 'highway')) continue;
    return { hit: { lat: +parseFloat(hit.lat).toFixed(6), lon: +parseFloat(hit.lon).toFixed(6), found: String(hit.display_name || '') }, by: t.by };
  }
  return { hit: null, failed };
}

/**
 * The «+ Αποθήκευση ως νέα τοποθεσία» control under one unmatched scan stop.
 * key: the stop's place in this preview ([A-Za-z0-9]); stop: the scan's stop
 * ({location_name, address, postcode, city, country}); onSaved({id, label}):
 * the caller links the stop and repaints its own row.
 */
function locScanNewHTML(key, stop, onSaved) {
  const uid = key + '_' + (++_locScanSeq);
  _LOC_SCAN[uid] = { onSaved };
  const s = stop || {};
  const id = (p) => `locScan_${uid}_${p}`;
  const addr = [s.address, s.postcode].filter(Boolean).join(', ');
  return `<div class="loc-scan-new" id="${id('box')}">
    <button type="button" class="btn btn-ghost btn-sm" id="${id('open')}" onclick="locScanToggle('${uid}')">+ Αποθήκευση ως νέα τοποθεσία</button>
    <div class="loc-scan-form" id="${id('form')}" hidden>
      <div class="form-grid">
        <div class="form-field span-2"><label class="form-label">Όνομα *</label>
          <input id="${id('name')}" class="form-input" value="${_locEsc(s.location_name || '')}"></div>
        <div class="form-field"><label class="form-label">Πόλη</label>
          <input id="${id('city')}" class="form-input" value="${_locEsc(s.city || '')}"></div>
        <div class="form-field"><label class="form-label">Χώρα</label>
          <select id="${id('country')}" class="form-input">${countryOptionsHtml(s.country || '')}</select></div>
        <div class="form-field span-2"><label class="form-label">Διεύθυνση</label>
          <input id="${id('address')}" class="form-input" value="${_locEsc(addr)}"></div>
        <div class="form-field"><label class="form-label">Γεωγρ. πλάτος (Latitude)</label>
          <input id="${id('lat')}" class="form-input" type="number" step="any" oninput="locScanMapLink('${uid}')"></div>
        <div class="form-field"><label class="form-label">Γεωγρ. μήκος (Longitude)</label>
          <input id="${id('lon')}" class="form-input" type="number" step="any" oninput="locScanMapLink('${uid}')"></div>
        <div class="form-field span-2 loc-scan-geo">
          <span id="${id('geo')}" class="loc-scan-geo-msg"></span>
          <a id="${id('map')}" class="loc-geo-link" target="_blank" rel="noopener" hidden>δες στον χάρτη</a>
          <button type="button" class="loc-geo-link" onclick="locScanFind('${uid}')">Εύρεση ξανά</button>
        </div>
      </div>
      <div class="loc-dup" id="${id('dup')}" hidden></div>
      <div class="loc-scan-hint">Λατινικοί χαρακτήρες, όπως όλες οι τοποθεσίες. Έλεγξε τις συντεταγμένες στον χάρτη· άφησέ τες κενές αν δεν είσαι σίγουρος.</div>
      <div class="loc-scan-actions">
        <button type="button" class="btn btn-ghost btn-sm" onclick="locScanToggle('${uid}')">Άκυρο</button>
        <button type="button" class="btn btn-primary btn-sm" id="${id('save')}" onclick="locScanSave('${uid}')">Αποθήκευση τοποθεσίας</button>
      </div>
    </div>
  </div>`;
}

function locScanToggle(uid) {
  const form = document.getElementById(`locScan_${uid}_form`);
  const open = document.getElementById(`locScan_${uid}_open`);
  if (!form) return;
  form.hidden = !form.hidden;
  if (open) open.hidden = !form.hidden;
  if (!form.hidden) document.getElementById(`locScan_${uid}_name`)?.focus();
  const ctx = _LOC_SCAN[uid];
  if (!form.hidden && ctx && !ctx.looked) { ctx.looked = true; locScanFind(uid); }
}

// The map link follows whatever the two fields hold, typed or found.
function locScanMapLink(uid) {
  const a = document.getElementById(`locScan_${uid}_map`);
  if (!a) return;
  const lat = parseFloat(document.getElementById(`locScan_${uid}_lat`)?.value);
  const lon = parseFloat(document.getElementById(`locScan_${uid}_lon`)?.value);
  const ok = isFinite(lat) && isFinite(lon);
  a.hidden = !ok;
  if (ok) a.href = `https://maps.google.com/?q=${lat},${lon}`;
}

// Look the pin up from the form's current name, city, country and address and
// show what was found; a person decides. Nothing reliable: the fields are left
// empty (a value the person typed is never overwritten by «nothing found»).
async function locScanFind(uid) {
  const v = (p) => (document.getElementById(`locScan_${uid}_${p}`)?.value || '').trim();
  const msg = document.getElementById(`locScan_${uid}_geo`);
  const lat = document.getElementById(`locScan_${uid}_lat`), lon = document.getElementById(`locScan_${uid}_lon`);
  if (!msg || !lat || !lon) return;
  msg.textContent = 'Αναζήτηση συντεταγμένων…';
  const geo = await _locGeocodeQuery(v('name'), v('city'), v('country'), v('address'));
  if (!document.getElementById(`locScan_${uid}_geo`)) return;   // the form was saved or replaced meanwhile
  if (geo) {
    lat.value = geo.lat; lon.value = geo.lon;
    msg.textContent = 'Βρέθηκε: ' + (geo.found || `${geo.lat}, ${geo.lon}`);
  } else {
    msg.textContent = 'Δεν βρέθηκε αξιόπιστο σημείο· συμπλήρωσε τις συντεταγμένες ή άφησέ τες κενές.';
  }
  locScanMapLink(uid);
}

// The same place already exists: same label AND, when both have one, the same
// street address (two branches of one chain in one city share a label).
function _locScanExisting(label, address) {
  const refs = typeof getRefLocations === 'function' ? getRefLocations() : [];
  const norm = (x) => _fhNorm(String(x || ''));
  return _fhLocationsArr.find((l) => {
    if (norm(l.label) !== norm(label)) return false;
    const rec = refs.find((r) => r.id === l.id);
    const theirs = rec && rec.fields ? rec.fields.Address : '';
    return !address || !theirs || norm(theirs) === norm(address);
  }) || null;
}

// F16 (owner 1/11): the same place typed again under another spelling («AV VASILOPOULOS, OINOFYTA» / «AB VASILOPOULOS»).
// Never a refusal (relaxed rules, owner 31/10): the person sees the places that look the same, takes one or creates
// the new one anyway. Two tests over the list already in memory: the same name once the company forms (S.A., GmbH…),
// punctuation, case and a trailing country code are gone, in the same country; or a shared word of the name within
// 500 m. The database cleans how a place is written (090: country code, one space); whether two names are one place
// is a person's call, so it is asked here and never decided by a rule.
const _LOC_FORMS = new RegExp('(^| )(s a|a e|abee|avee|mavee|ike|mon ike|o e|e e|epe|mepe|ltd|gmbh|srl|s r l|spa|s p a|bv|b v|nv|kg|co|ag|inc|plc|pc|p c|sp z o o|d o o|doo|eood|ood|sa|ae|oe|ee)(?= |$)', 'g');
const _locCC = (v) => (typeof countryCode === 'function' && countryCode(v)) || String(v || '').trim().toUpperCase() || null;
function _locDupKey(name, cc) {
  let k = (typeof _fhNorm === 'function' ? _fhNorm(name) : String(name || '').toLowerCase()).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) k = k.replace(_LOC_FORMS, ' ').replace(/\s+/g, ' ').trim();
  if (cc) k = k.replace(new RegExp(' ' + cc.toLowerCase() + '$'), '');
  return k;
}
function _locKm(a1, o1, a2, o2) {
  const r = Math.PI / 180, x = Math.sin((a2 - a1) * r / 2), y = Math.sin((o2 - o1) * r / 2);
  return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a1 * r) * Math.cos(a2 * r) * y * y));
}
// fields: {Name, City, Country, Latitude, Longitude}; the list: the Locations page's own when it is open, else the
// app's reference list (both from the facade, deleted places left out). Up to 3 lookalikes, {id, label, why}.
function locDupFind(fields, excludeId) {
  const cc = _locCC(fields.Country), key = _locDupKey(fields.Name, cc);
  if (!key) return [];
  const words = key.split(' ').filter((w) => w.length >= 4);
  const lat = parseFloat(fields.Latitude), lon = parseFloat(fields.Longitude);
  const recs = (LOC.records && LOC.records.length) ? LOC.records : (typeof getRefLocations === 'function' ? getRefLocations() : []);
  const out = [];
  for (const r of recs || []) {
    const g = r && r.fields;
    if (!g || !g.Name || r.id === excludeId) continue;
    const c2 = _locCC(g.Country), k2 = _locDupKey(g.Name, c2);
    let why = null;
    if (k2 === key && (!cc || !c2 || cc === c2)) why = 'ίδιο όνομα';
    else if (isFinite(lat) && isFinite(lon) && g.Latitude != null && g.Longitude != null
      && words.some((w) => k2.split(' ').includes(w)) && _locKm(lat, lon, +g.Latitude, +g.Longitude) < 0.5) why = 'ίδιο σημείο';
    if (why) out.push({ id: r.id, label: _fhLocLabel(g), why });
    if (out.length === 3) break;
  }
  return out;
}
// The warning, in either form: what looks the same, why, and one action per place (open it / take it).
function _locShowDup(el, dup, actionHtml) {
  if (!el) return;
  el.innerHTML = `<div class="loc-dup-t">Υπάρχει ήδη:</div>`
    + dup.map((d) => `<div class="loc-dup-row"><span><b>${escapeHtml(d.label)}</b> <span class="loc-dup-why">${d.why}</span></span>${actionHtml(d)}</div>`).join('')
    + `<div class="loc-dup-n">Αν είναι άλλη τοποθεσία, πάτησε «Δημιουργία νέας».</div>`;
  el.hidden = false;
}
function locScanUse(uid, id) {
  const ctx = _LOC_SCAN[uid];
  const rec = (typeof getRefLocations === 'function' ? getRefLocations() : []).find((r) => r.id === id);
  const label = (_fhLocationsArr.find((l) => l.id === id) || {}).label || (rec && rec.fields ? _fhLocLabel(rec.fields) : '');
  if (!ctx || !label) return;
  _locScanLinked(uid, ctx, { id, label }, 'Συνδέθηκε με την τοποθεσία που υπάρχει ήδη', 'info');
}

async function locScanSave(uid) {
  const ctx = _LOC_SCAN[uid];   // captured now: a re-scan while this save runs must not get its result
  if (!ctx) return;
  const v = (p) => (document.getElementById(`locScan_${uid}_${p}`)?.value || '').trim();
  let name = v('name');
  if (!name) { toast('Το όνομα είναι υποχρεωτικό', 'danger'); return; }
  const btn = document.getElementById(`locScan_${uid}_save`);
  const busy = (on) => { if (btn) { btn.textContent = on ? 'Αποθήκευση…' : 'Αποθήκευση τοποθεσίας'; btn.disabled = on; } };
  busy(true);
  try {
    // The duplicate check and the pickers read this list; a page that never
    // loaded it (Εβδομαδιαίο Εθνικών opens the scan without it) would compare
    // against nothing and, after a push, leave every picker with one place.
    if (typeof fhLoadLocations === 'function') await fhLoadLocations();
    if (!_fhLocationsArr.length) throw new Error('Οι τοποθεσίες δεν φόρτωσαν· δοκίμασε ξανά');
    // Latin-only names (owner 9/8), as _locSave: transliterate, never refuse.
    if (/[Ͱ-Ͽ]/.test(name) && typeof _fhTranslit === 'function') {
      name = _fhTranslit(name);
      toast('Το όνομα γράφτηκε με λατινικούς χαρακτήρες: ' + name, 'info');
    }
    let city = v('city');
    const country = v('country'), address = v('address');
    if (city && /[Ͱ-Ͽ]/.test(city) && typeof _fhTranslit === 'function') city = _fhTranslit(city);
    // The pin is what the form holds: found and checked, typed, or empty.
    const latS = v('lat'), lonS = v('lon');
    let geo = null;
    if (latS || lonS) {
      const la = parseFloat(latS), lo = parseFloat(lonS);
      if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
        throw new Error('Συμπλήρωσε και τις δύο συντεταγμένες σωστά (πλάτος -90 έως 90, μήκος -180 έως 180) ή άφησέ τες κενές');
      }
      geo = { lat: la, lon: lo };
    }
    // The label the order form's pickers use (core/form-helpers.js fhLoadLocations).
    const label = _fhLocLabel({ Name: name, City: city, Country: country });
    const same = _locScanExisting(label, address);
    if (same) { _locScanLinked(uid, ctx, same, 'Υπάρχει ήδη αυτή η τοποθεσία, συνδέθηκε με τη στάση', 'info'); return; }
    const sig = JSON.stringify([name, city, country, latS, lonS]);
    if (ctx.dupOk !== sig) {
      const dup = locDupFind({ Name: name, City: city, Country: country, Latitude: latS, Longitude: lonS }, null);
      if (dup.length) {
        ctx.dupOk = sig;
        _locShowDup(document.getElementById(`locScan_${uid}_dup`), dup,
          (d) => `<button type="button" class="btn btn-ghost btn-sm" onclick="locScanUse('${uid}','${_locEsc(d.id)}')">Χρήση αυτής</button>`);
        busy(false);
        if (btn) btn.textContent = 'Δημιουργία νέας';
        return;
      }
    }
    const pkey = _fhNorm(label) + '|' + _fhNorm(address);
    let job = _LOC_SCAN_PENDING[pkey];
    if (!job) {
      job = _LOC_SCAN_PENDING[pkey] = (async () => {
        const fields = { Name: name };
        if (city) fields.City = city;
        if (country) fields.Country = country;
        if (address) fields.Address = address;
        if (geo) { fields.Latitude = geo.lat; fields.Longitude = geo.lon; }
        const rec = await atCreate(TABLES.LOCATIONS, fields);
        // Offline, atCreate queues the write and returns a temporary id that no
        // order may point at.
        if (!rec || rec.error || !rec.id || rec._offline || String(rec.id).startsWith('offline_')) {
          throw new Error((rec && rec.error && rec.error.message) || 'Η τοποθεσία δεν αποθηκεύτηκε (χωρίς σύνδεση;)');
        }
        const item = { id: rec.id, label };
        // The pickers read this shared list; without the push the stop could
        // not be picked in the order form until the next reload. The fields
        // sent give the same label (core/form-helpers.js fhLocationSaved, F52).
        fhLocationSaved({ id: rec.id, fields });
        // atCreate cleared every reference list (trucks … locations, clients);
        // the next scan matches against them, so they are read again now.
        if (typeof preloadReferenceData === 'function') {
          try { await preloadReferenceData(); } catch (e) { if (typeof logError === 'function') logError(e, 'locScanSave: reference reload'); }
        }
        return { item };
      })().finally(() => { delete _LOC_SCAN_PENDING[pkey]; });
    }
    const { item } = await job;
    _locScanLinked(uid, ctx, item, geo ? 'Η τοποθεσία δημιουργήθηκε ✓'
      : 'Η τοποθεσία δημιουργήθηκε χωρίς συντεταγμένες· συμπλήρωσέ τες στις Τοποθεσίες', geo ? 'success' : 'warn');
  } catch (e) {
    reportError('Η τοποθεσία δεν αποθηκεύτηκε', e);
    busy(false);
  }
}

function _locScanLinked(uid, ctx, item, msg, kind) {
  if (ctx && typeof ctx.onSaved === 'function') ctx.onSaved(item);
  const box = document.getElementById(`locScan_${uid}_box`);
  if (box) box.innerHTML = `<span class="loc-scan-done">✓ ${escapeHtml(item.label)}</span>`;
  if (_LOC_SCAN[uid] === ctx) delete _LOC_SCAN[uid];
  toast(msg, kind || 'success');
}

// ── Delete ─────────────────────────────────────
function _locConfirmDelete(id, name) {
  openModal('Διαγραφή τοποθεσίας;',
    `<div style="color:var(--text-mid);font-size:var(--text-base);line-height:1.7">
      Διαγραφή της <strong style="color:var(--text)">${name}</strong>;<br>
      <span style="color:var(--danger);font-size:var(--text-sm)">Οι παραγγελίες που τη δηλώνουν ως σημείο θα χάσουν την αναφορά.</span>
     </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Άκυρο</button>
     <button class="btn btn-danger" onclick="_locDoDelete('${id}')">Διαγραφή</button>`);
}

async function _locDoDelete(id) {
  // The Veroia cross-dock is not an ordinary location: the whole Veroia Switch
  // chain (ORDERS -> NAT_ORDERS -> GL -> CL -> RAMP) resolves through this one
  // record id. Deleting it was a single click that breaks national planning,
  // and nothing in the UI said so.
  // See docs/design/DEEP_AUDIT_2026-08-04/locations.md LO-4.
  if (id === F.VEROIA_LOC) {
    closeModal();
    toast('Το Veroia Cross-Dock δεν διαγράφεται — είναι κλειδί της αλυσίδας Veroia Switch', 'danger');
    return;
  }
  closeModal();
  try {
    const data = await atSoftDelete(TABLES.LOCATIONS, id);
    if (data.error) throw new Error(data.error.message || 'Η διαγραφή απέτυχε');
    LOC.records = LOC.records.filter(r => r.id !== id);
    _locApplyFilters();
    if (typeof _lmapRefresh === 'function') _lmapRefresh();
    toast('Η τοποθεσία διαγράφηκε', 'success');
  } catch (e) { reportError('Η διαγραφή απέτυχε', e); }
}

// ── Fetch ───────────────────────────────────────
async function _locFetchAll() {
  return atGetAll(TABLES.LOCATIONS, {
    // Opening Hours / Delivery Days: η φόρμα τα γράφει και ο Worker τα χαρτογραφεί,
    // αλλά έλειπαν από ΕΔΩ — και το _locOpenEdit δίνει στη φόρμα αυτό ακριβώς το
    // cached record. Αποτέλεσμα: το input πάντα κενό ακόμη κι όταν η βάση είχε τιμή,
    // και το `if (hours)` του _locSave δεν ξανάστελνε ποτέ τίποτα (owner 25/8).
    fields: ['Name','Country','City','Address','Type','Latitude','Longitude',
             'Opening Hours','Delivery Days','Notes','Phone']
  }, false);
}

// ── Utils ───────────────────────────────────────
function _locEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Κάρτα τοποθεσίας (Βήμα 4 v2, owner 25/8: «χωράνε και τα 3 σε μια
// κάρτα και όχι 3 επιλογές») ────────────────────────────────────────────
// ΜΙΑ στήλη χωρίς καρτέλες: ταυτότητα → στοιχεία → προϊόντα → ιστορικό.
// Το ιστορικό είναι η μακριά ουρά — κάτω, όπου το scroll είναι φυσικό.
// Οι 4 τύποι κίνησης (ΕΞΑΓΩΓΗ/ΕΙΣΑΓΩΓΗ/ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ) βγαίνουν από τον
// γονιό κάθε στάσης — ΜΕΤΑΦΡΑΣΗ ΣΤΗΝ ΕΜΦΑΝΙΣΗ μόνο: η βάση κρατά
// Export/Import και βελάκια (σύμβαση CLAUDE.md), τίποτα δεν ξαναγράφεται.
// Μηδενικοί τύποι ΔΕΝ εμφανίζονται (το «Εθνικές 0×» ήταν θόρυβος).
// Η δομή είναι το πρότυπο καρτέλας του συστήματος (owner 2/9, Figma
// w2-location-card 230:821): navy κεφαλή, outline chips, «— δεν έχει
// καταχωρηθεί» για το κενό, δίγραμμο ιστορικό.
const LOCC = { openId: null, stops: null, orderById: {}, natById: {}, natOrdById: {}, pgByRec: {}, failed: false, v5: [], v5Warn: '' };

function _locCardHost() {
  let ov = document.getElementById('loccOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'loccOverlay'; ov.className = 'locc-overlay';
    ov.onclick = _locCloseCard;
    const p = document.createElement('div'); p.id = 'loccPanel'; p.className = 'locc-panel';
    const st = document.createElement('style'); st.id = 'loccStyles'; st.textContent = _locCardCss();
    document.body.append(st, ov, p);
  }
  return document.getElementById('loccPanel');
}

// Μόνο tokens του ΜΕΡΟΥΣ Β (κανόνας #1) — το χρώμα έχει ένα σπίτι, το style.css.
// Μεγέθη μόνο από την κλίμακα (τα 9.5/10.5/11.5/12.5px έγιναν 11/12/13) και
// αποστάσεις μόνο 4/8/12/16/24 (ΜΕΡΟΣ Γ/Δ).
function _locCardCss() { return `
.locc-overlay{position:fixed;inset:0;background:var(--surface-dark);opacity:0;pointer-events:none;transition:opacity .2s;z-index:var(--z-overlay)}
.locc-overlay.open{opacity:.45;pointer-events:auto}
.locc-panel{position:fixed;top:0;right:-560px;width:560px;max-width:96vw;height:100vh;background:var(--surface-card);box-shadow:var(--shadow-panel);transition:right .25s;z-index:var(--z-top);overflow-y:auto}
.locc-panel.open{right:0}
.locc-head{background:var(--surface-dark);color:var(--text-on-dark);padding:var(--space-4) var(--space-6)}
.locc-head h2{font-family:'Syne',sans-serif;font-size:var(--text-lg);margin:0 0 var(--space-1);padding-right:var(--space-6);color:var(--text-on-dark)}
.locc-meta{font-size:var(--text-sm);color:var(--panel-dim)}
.locc-addr{font-size:var(--text-sm);color:var(--panel-dim);margin-top:var(--space-1)}
.locc-close{float:right;background:none;border:none;color:var(--panel-dim);font-size:var(--text-lg);cursor:pointer;margin:0}
.locc-chips{margin-top:var(--space-2);display:flex;gap:var(--space-1);flex-wrap:wrap}
.locc-chip{display:inline-block;padding:0 var(--space-2);line-height:20px;border-radius:var(--radius-full);font-size:var(--text-xs);font-weight:600;letter-spacing:.03em;border:1px solid var(--border-dark);color:var(--text-on-dark)}
.locc-sect{font-size:var(--text-xs);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);padding:var(--space-3) var(--space-6) var(--space-1);border-top:1px solid var(--border)}
.locc-sect:first-of-type{border-top:none}
.locc-sect .n{font-weight:500;letter-spacing:0;text-transform:none}
.locc-rows{padding:0 var(--space-6) var(--space-2)}
.locc-row{display:flex;justify-content:space-between;gap:var(--space-3);font-size:var(--text-body);padding:var(--space-1) 0;border-bottom:1px dashed var(--border)}
.locc-row:last-child{border-bottom:none}
.locc-row .k{color:var(--text-dim);flex-shrink:0}
.locc-row .v{text-align:right}
.locc-h{padding:var(--space-1) 0;border-bottom:1px dashed var(--border)}
.locc-h:last-child{border-bottom:none}
.locc-h1{display:grid;grid-template-columns:52px 92px 1fr 56px;gap:var(--space-2);font-size:var(--text-body);align-items:baseline}
.locc-h1 .num{text-align:right;font-variant-numeric:tabular-nums}
.locc-h1 .who{min-width:0;overflow-wrap:anywhere}
.locc-h2{font-size:var(--text-sm);color:var(--text-dim);margin:0 0 0 60px;font-variant-numeric:tabular-nums}
.locc-stype{display:inline-block;padding:0 var(--space-1);border-radius:var(--radius);font-size:var(--text-xs);font-weight:700;letter-spacing:.05em;border:1px solid var(--border);color:var(--text-mid);background:var(--surface-card);white-space:nowrap}
.locc-empty{font-size:var(--text-body);color:var(--text-dim);padding:var(--space-3) var(--space-6) var(--space-4)}
.locc-miss{color:var(--text-dim)}
.locc-note{font-size:var(--text-body);color:var(--text);background:var(--surface-card);border:1px solid var(--danger);border-radius:var(--radius);padding:var(--space-2) var(--space-3);margin:var(--space-3) var(--space-6)}
.locc-note b{color:var(--danger)}
`; }

function _locCloseCard() {
  document.getElementById('loccOverlay')?.classList.remove('open');
  document.getElementById('loccPanel')?.classList.remove('open');
  LOCC.openId = null;
}

// Γέφυρα rec → αριθμητικό id παραγγελίας (ORD-231): το /pallets/gate είναι η
// υπάρχουσα γέφυρα — κανένα νέο endpoint, παρτίδες ≤250 (Γ, owner 25/8:
// «ο εύκολος κωδικός υπάρχει ήδη» = orders.id).
async function _locGateIds(recs) {
  const jwt = localStorage.getItem('tms_jwt');
  for (let i = 0; i < recs.length; i += 250) {
    const res = await fetch(PROXY_URL + '/pallets/gate?order_recs=' + recs.slice(i, i + 250).join(','), {
      headers: { ...(jwt ? { Authorization: 'Bearer ' + jwt } : {}), ...(typeof tmsReqHeaders === 'function' ? tmsReqHeaders(typeof tmsNewAction === 'function' ? tmsNewAction() + '-1' : null) : {}) }   // Level A id
    });
    if (typeof tmsNoteResponse === 'function') tmsNoteResponse(res);
    if (!res.ok) return; // χωρίς ORD-κωδικούς η κάρτα στέκεται — δεν είναι λόγος αποτυχίας
    const g = await res.json().catch(() => ({}));
    (g.records || []).forEach(r => { LOCC.pgByRec[r.order_rec] = r.order_id; });
  }
}

async function _locOpenCard(id) {
  const rec = LOC.records.find(r => r.id === id); if (!rec) return;
  const panel = _locCardHost();
  document.getElementById('loccOverlay').classList.add('open');
  panel.classList.add('open');
  LOCC.openId = id; LOCC.stops = null; LOCC.failed = false; LOCC.pgByRec = {}; LOCC.v5 = []; LOCC.v5Warn = '';
  panel.innerHTML = _locCardHtml(rec, '<div class="locc-empty">Φόρτωση ιστορικού…</div>');
  const gateP = _v5Gate();   // beside today's reads, not after them (PlanConfig: one read per session)
  try {
    const stops = await atGetAll(TABLES.ORDER_STOPS, {
      filterByFormula: `FIND("${id}", ARRAYJOIN({Location}, ","))>0`
    }, false);
    const orderRecs = [...new Set(stops.map(s => getLinkedId(s.fields['Parent Order'])).filter(Boolean))];
    LOCC.orderById = {};
    if (orderRecs.length) {
      (await atGet(TABLES.ORDERS)).forEach(o => { if (orderRecs.includes(o.id)) LOCC.orderById[o.id] = o; });
      await _locGateIds(orderRecs);
    }
    LOCC.natById = {}; LOCC.natOrdById = {};
    if (stops.some(s => getLinkedId(s.fields['Parent Nat Load']))) {
      (await atGet(TABLES.NAT_LOADS)).forEach(n => { LOCC.natById[n.id] = n; });
    }
    if (stops.some(s => getLinkedId(s.fields['Parent Nat Order']))) {
      (await atGet(TABLES.NAT_ORDERS)).forEach(n => { LOCC.natOrdById[n.id] = n; });
    }
    LOCC.stops = stops.sort((a, b) => String(b.fields['DateTime'] || '').localeCompare(String(a.fields['DateTime'] || '')));
  } catch (e) {
    // Ορατή αποτυχία — ποτέ κενό που μοιάζει με «δεν υπάρχουν κινήσεις». Το
    // e.message («Failed to fetch») πάει στο log, όχι στην οθόνη.
    LOCC.failed = true; LOCC.stops = [];
    if (typeof logError === 'function') logError(e, '_locOpenCard history');
  }
  if (!LOCC.failed) {
    const v5 = await _locLoadV5(id, await gateP);
    if (LOCC.openId !== id) return;   // another card opened meanwhile: its own call owns LOCC
    LOCC.v5 = v5.rows; LOCC.v5Warn = v5.warn;
  }
  if (LOCC.openId === id) panel.innerHTML = _locCardHtml(rec, null);
}

// Ε13 (F5, dormant until day L): a v5 national order has no order_stops (spec 2.1) — its places are its
// shipments, its moves the cycle stops (rt_stops). Both come from /plan/activity and join the same history. Helpers
// _v5* live in core/entity.js (one gate, one id catalogue for every master-data screen). PlanConfig 'before' = no
// call: the card is today's. A failed read keeps today's history and says the rest is missing — never «Καμία
// κίνηση». Places are matched by the catalogue id (PlanIds), never by name (Latin-only names, 9/8).
async function _locLoadV5(recId, gate) {
  const out = { rows: [], warn: '' };
  if (!gate) return out;
  try {
    const ids = await _v5Ids(gate);
    const d = ids && await _v5Activity(gate, 'location_id', ids.id('location', recId));
    if (!d) return out;
    const clientBy = _v5ById(ids, 'client'), truckBy = _v5ById(ids, 'truck'), partnerBy = _v5ById(ids, 'partner');
    const label = (m, k) => (k != null && m.get(k)) ? m.get(k).label : '';
    const onStop = new Set();
    for (const st of d.stops || []) {
      // a cancelled cycle moved nothing: not a move, and its shipments stay «to assign» below
      if (st.rt_status === 'cancelled') continue;
      const loads = Array.isArray(st.loads) ? st.loads : [];
      loads.forEach(l => onStop.add(l.shipment_id));
      const acts = new Set(loads.map(l => l.act));
      const c = st.carrier || {};
      out.rows.push({
        day: _v5Day(st.planned_from),
        move: st.side === 'KATHODOS' ? 'ΚΑΘΟΔΟΣ' : st.side === 'ANODOS' ? 'ΑΝΟΔΟΣ' : null,
        stype: [acts.has('pickup') ? 'ΦΟΡΤΩΣΗ' : '', acts.has('drop') ? 'ΠΑΡΑΔΟΣΗ' : ''].filter(Boolean).join(' · ') || '—',
        client: [...new Set(loads.map(l => label(clientBy, l.client_id)).filter(Boolean))].join(', '),
        pallets: loads.length ? loads.reduce((sum, l) => sum + (Number(l.pallets) || 0), 0) : null,
        refs: [...new Set(loads.map(l => l.reference).filter(Boolean))],
        who: c.trip_type === 'PARTNER' ? label(partnerBy, c.partner_id) : label(truckBy, c.truck_id),
        title: st.code || '',   // no RT code on screen (owner rule): title only
      });
    }
    for (const sh of d.shipments || []) {
      if (onStop.has(sh.shipment_id)) continue;
      out.rows.push({
        day: sh.day || '', move: null, stype: sh.end === 'origin' ? 'ΦΟΡΤΩΣΗ' : 'ΠΑΡΑΔΟΣΗ',
        client: label(clientBy, sh.client_id), pallets: sh.pallets != null ? sh.pallets : null,
        refs: sh.reference ? [sh.reference] : [], who: '— προς ανάθεση', title: '',
      });
    }
    if (d.truncated) out.warn = '⚠ Εθνικά v5: η ανάγνωση έφτασε το όριο — το ιστορικό είναι ελλιπές.';
  } catch (e) {
    out.rows = [];
    out.warn = _v5FailText(gate, e);
    _v5Log(e, '_locOpenCard v5');
  }
  return out;
}

// Οι 4 τύποι κίνησης μιας στάσης, από τον γονιό της (Β):
// orders.Direction Export/Import → ΕΞΑΓΩΓΗ/ΕΙΣΑΓΩΓΗ ·
// NL/NO Direction 'North→South'/'South→North' → ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ.
function _locMoveFromParents(f, ordMap, natMap, natOrdMap) {
  const o = ordMap[getLinkedId(f['Parent Order'])];
  if (o) {
    const d = o.fields['Direction'];
    return d === 'Import' ? 'ΕΙΣΑΓΩΓΗ' : d === 'Export' ? 'ΕΞΑΓΩΓΗ' : null;
  }
  const nl = natMap[getLinkedId(f['Parent Nat Load'])] || natOrdMap[getLinkedId(f['Parent Nat Order'])];
  if (nl) {
    const d = String(nl.fields['Direction'] || '');
    return d.includes('North→South') || d === 'ΚΑΘΟΔΟΣ' ? 'ΚΑΘΟΔΟΣ'
         : d.includes('South→North') || d === 'ΑΝΟΔΟΣ' ? 'ΑΝΟΔΟΣ' : null;
  }
  return null;
}
function _locStopMoveType(s) { return _locMoveFromParents(s.fields, LOCC.orderById, LOCC.natById, LOCC.natOrdById); }

// Δείκτης τοποθεσία → Set(τύπων κίνησης) για το φίλτρο της λίστας (Β):
// ΟΛΕΣ οι στάσεις (267) + γονείς, σε 4 αιτήματα συνολικά — όχι ανά τοποθεσία.
async function _locBuildMoveIdx() {
  const count = document.getElementById('locCount');
  if (count) count.textContent = 'υπολογισμός τύπων κίνησης…';
  try {
    const [stops, orders, nls, nos] = await Promise.all([
      atGetAll(TABLES.ORDER_STOPS, {}, false),
      atGet(TABLES.ORDERS),
      atGet(TABLES.NAT_LOADS),
      atGet(TABLES.NAT_ORDERS)
    ]);
    const om = {}, nm = {}, nom = {};
    orders.forEach(o => { om[o.id] = o; });
    nls.forEach(n => { nm[n.id] = n; });
    nos.forEach(n => { nom[n.id] = n; });
    const idx = new Map();
    stops.forEach(s => {
      const loc = getLinkedId(s.fields['Location']);
      const t = _locMoveFromParents(s.fields, om, nm, nom);
      if (!loc || !t) return;
      if (!idx.has(loc)) idx.set(loc, new Set());
      idx.get(loc).add(t);
    });
    await _locMoveIdxV5(idx);
    LOC.moveIdx = idx;
  } catch (e) {
    // Ορατή αποτυχία: το φίλτρο μηδενίζεται — δεν φιλτράρει «σιωπηλά τίποτα».
    // Το e.message πάει στο log, όχι στο toast (ποτέ «Failed to fetch» στην οθόνη).
    LOC.moveFilter = '';
    const sel = document.getElementById('locMoveFilter'); if (sel) sel.value = '';
    if (typeof logError === 'function') logError(e, '_locBuildMoveIdx');
    if (typeof toast === 'function') toast('Δεν φορτώθηκε ο δείκτης τύπων κίνησης — το φίλτρο καθαρίστηκε. Δεν σημαίνει ότι δεν υπάρχουν κινήσεις. Ξαναδοκίμασε.', 'error');
  }
}

// Ε13: the v5 stops' sides join the index. A failed read throws into _locBuildMoveIdx's catch: the filter is
// cleared and the toast says so — never a filter that silently drops the v5-only places.
async function _locMoveIdxV5(idx) {
  const gate = await _v5Gate();
  if (!gate) return;
  try {
    const ids = await _v5Ids(gate);
    const d = ids && await _v5Activity(gate, 'location_id', 'all');
    if (!d) return;
    if (d.truncated) throw new Error('plan/activity location_id=all truncated');
    const locBy = _v5ById(ids, 'location');
    // A side row the catalogue does not know is either a place newer than the session's catalogue — then a place
    // on this list is missing from it too, and the index would silently miss it: said — or a place not on the list
    // at all (soft-deleted): nothing to filter, skipped. Throwing for the second would break the filter for good.
    const known = new Set(ids.list('location').map(x => x.legacy_id));
    const catalogueBehind = (LOC.records || []).some(r => !known.has(r.id));
    for (const r of d.sides || []) {
      const rec = locBy.get(r.location_id);
      if (!rec && catalogueBehind) throw new Error('plan/activity: location ' + r.location_id + ' not in the catalogue — reload the page');
      if (!rec) continue;
      if (!idx.has(rec.legacy_id)) idx.set(rec.legacy_id, new Set());
      if (r.kathodos > 0) idx.get(rec.legacy_id).add('ΚΑΘΟΔΟΣ');
      if (r.anodos > 0) idx.get(rec.legacy_id).add('ΑΝΟΔΟΣ');
    }
  } catch (e) {
    _v5Log(e, '_locBuildMoveIdx v5');
    throw e;
  }
}

function _locTypeChips() {
  if (!LOCC.stops || LOCC.failed || !(LOCC.stops.length + LOCC.v5.length)) return '';
  const by = {};
  LOCC.stops.forEach(s => { const t = _locStopMoveType(s); if (t) by[t] = (by[t] || 0) + 1; });
  LOCC.v5.forEach(r => { if (r.move) by[r.move] = (by[r.move] || 0) + 1; });
  const order = ['ΕΞΑΓΩΓΗ', 'ΕΙΣΑΓΩΓΗ', 'ΚΑΘΟΔΟΣ', 'ΑΝΟΔΟΣ'];
  const chips = order.filter(t => by[t]).map(t => `<span class="locc-chip">${t} ${by[t]}×</span>`);
  return chips.length ? `<div class="locc-chips">${chips.join('')}</div>` : '';
}

function _locStopClient(s) {
  const cid = getLinkedId(s.fields['Client at Stop']);
  if (cid) {
    const c = getRefClients().find(x => x.id === cid);
    if (c) return c.fields['Company Name'] || '';
  }
  const o = LOCC.orderById[getLinkedId(s.fields['Parent Order'])];
  if (o) {
    const c = getRefClients().find(x => x.id === getLinkedId(o.fields['Client']));
    if (c) return c.fields['Company Name'] || '';
  }
  return '';
}

function _locGoodsAgg() {
  const agg = {};
  (LOCC.stops || []).forEach(s => {
    const g = String(s.fields['Goods'] || '').trim();
    if (!g) return;
    const k = g.toUpperCase();
    (agg[k] = agg[k] || { name: g, n: 0 }); agg[k].n++;
  });
  return agg;
}

function _locCardHtml(rec, loadingBody) {
  const f = rec.fields;
  const miss = '<span class="locc-miss">— δεν έχει καταχωρηθεί</span>';
  const head = `
  <div class="locc-head"><button class="locc-close" onclick="_locCloseCard()">&times;</button>
    <h2>${_locEsc(f.Name || '—')}</h2>
    <div class="locc-meta">${_locEsc(f.City || '—')} · ${_locEsc(f.Country ? (typeof countryName === 'function' ? countryName(f.Country) : f.Country) : '—')}</div>
    ${f.Address ? '<div class="locc-addr">' + _locEsc(f.Address) + '</div>' : ''}
    ${_locTypeChips()}</div>`;
  const maps = (f.Latitude != null && f.Longitude != null)
    ? `${f.Latitude.toFixed(4)}, ${f.Longitude.toFixed(4)} <a href="https://maps.google.com?q=${f.Latitude},${f.Longitude}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Χάρτης</a>`
    : miss;
  const row = (k, v) => `<div class="locc-row"><span class="k">${k}</span><span class="v">${v || miss}</span></div>`;
  const info = `<div class="locc-sect">Στοιχεία</div><div class="locc-rows">
    ${row('Ωράριο', f['Opening Hours'] && _locEsc(f['Opening Hours']))}
    ${row('Ημέρες παράδοσης', f['Delivery Days'] && _locEsc(f['Delivery Days']))}
    ${row('Τύπος', f.Type && _locEsc(f.Type))}
    ${row('Τηλέφωνο', f.Phone && _locEsc(f.Phone))}
    ${row('Σημειώσεις', f.Notes && _locEsc(f.Notes))}
    ${row('Συντεταγμένες', maps)}
  </div>`;
  if (loadingBody != null) return head + info + loadingBody;
  // Τα Στοιχεία είναι στιγμιαία (από την εγγραφή) — μένουν ορατά και όταν το
  // ασύγχρονο μισό (ιστορικό) αποτύχει. Πριν, η αποτυχία έκρυβε και το τηλέφωνο.
  if (LOCC.failed) {
    return head + info + `<div class="locc-note" role="alert"><b>Δεν φορτώθηκε — το ιστορικό κινήσεων.</b> Αυτό δεν σημαίνει ότι δεν υπάρχουν κινήσεις.
      <button type="button" class="btn btn-sm" style="margin-left:var(--space-2)" onclick="_locOpenCard('${rec.id}')">Ξαναδοκίμασε</button></div>`;
  }
  const agg = Object.values(_locGoodsAgg()).sort((a, b) => b.n - a.n);
  const goods = !LOCC.stops.length ? '' : `<div class="locc-sect">Προϊόντα</div><div class="locc-rows">
    ${agg.length
      ? agg.map(g => `<div class="locc-row"><span>${_locEsc(g.name)}</span><span class="v" style="color:var(--text-dim);font-variant-numeric:tabular-nums">${g.n}×</span></div>`).join('')
      : '<div class="locc-row"><span style="color:var(--text-dim)">Κανένα εμπόρευμα καταγεγραμμένο στις στάσεις</span></div>'}
  </div>`;
  const nMoves = LOCC.stops.length + LOCC.v5.length;
  const history = (nMoves ? `
    <div class="locc-sect">Ιστορικό <span class="n">· ${nMoves} ${nMoves === 1 ? 'κίνηση' : 'κινήσεις'}</span></div>
    <div class="locc-rows">${_locHistRowsHtml()}</div>`
    // with the v5 half missing, «no move» would be a claim nobody measured: the alert below says it instead
    : LOCC.v5Warn ? `<div class="locc-sect">Ιστορικό</div>`
    : `<div class="locc-sect">Ιστορικό</div>
       <div class="locc-empty">Καμία κίνηση καταγεγραμμένη για αυτή την τοποθεσία.
       Το ιστορικό ξεκινά με την πρώτη στάση παραγγελίας που θα τη δηλώσει σημείο φόρτωσης ή παράδοσης.</div>`)
    + (LOCC.v5Warn ? `<div class="locc-note" role="alert">${_locEsc(LOCC.v5Warn)}
      <button type="button" class="btn btn-sm" style="margin-left:var(--space-2)" onclick="_locOpenCard('${rec.id}')">Ξαναδοκίμασε</button></div>` : '');
  return head + info + goods + history;
}

// Today's rows as before; with v5 rows, one list by day (newest first). The sort is stable, so today's order
// among equal days is kept.
function _locHistRowsHtml() {
  if (!LOCC.v5.length) return LOCC.stops.map(_locHistRow).join('');
  const items = [
    ...LOCC.stops.map(s => ({ k: String(s.fields['DateTime'] || '').slice(0, 10), html: _locHistRow(s) })),
    ...LOCC.v5.map(r => ({ k: r.day, html: _locV5Row(r) })),
  ];
  return items.sort((a, b) => b.k.localeCompare(a.k)).map(x => x.html).join('');
}

// A v5 move in the same two-line row as _locHistRow: day · type · client · pallets, then references · plate or
// partner (or «— προς ανάθεση» for a national shipment no cycle stops at yet).
function _locV5Row(r) {
  const l2 = [...r.refs, r.who].filter(Boolean).join(' · ');
  return `<div class="locc-h"${r.title ? ` title="${_locEsc(r.title)}"` : ''}>
    <div class="locc-h1">
      <span style="color:var(--text-dim);font-variant-numeric:tabular-nums">${r.day ? fmtDateDM(r.day) + '/' + r.day.slice(2, 4) : '—'}</span>
      <span><span class="locc-stype">${_locEsc(r.stype)}</span></span>
      <span class="who">${r.client ? _locEsc(r.client) : '—'}</span>
      <span class="num">${r.pallets != null ? r.pallets + ' pal' : '—'}</span>
    </div>
    ${l2 ? '<div class="locc-h2">' + _locEsc(l2) + '</div>' : ''}
  </div>`;
}

// Ιστορικό σε ΔΥΟ γραμμές ανά κίνηση (owner 25/8) — αναφορά και πινακίδα
// δεν κόβονται ποτέ: 1η ημ/νία·τύπος·πελάτης·παλέτες, 2η ORD-id·ref·πινακίδα.
// Ούτε ο πελάτης κόβεται (κανόνας #6): τυλίγει σε δεύτερη σειρά αν χρειαστεί.
function _locHistRow(s) {
  const f = s.fields;
  const lbl = { Loading: 'ΦΟΡΤΩΣΗ', Unloading: 'ΠΑΡΑΔΟΣΗ', 'Cross-dock': 'CROSS-DOCK' };
  const o = LOCC.orderById[getLinkedId(f['Parent Order'])];
  const nl = LOCC.natById[getLinkedId(f['Parent Nat Load'])];
  const client = _locStopClient(s) || (nl ? _locEsc(nl.fields['Client'] || '') : '');
  const truckRec = o && getLinkedId(o.fields['Truck']);
  const truck = truckRec ? (getRefTrucks().find(t => t.id === truckRec) || {}).fields : null;
  const plate = truck ? (truck['License Plate'] || truck['Plate'] || '') : '';
  const orec = o && o.id;
  const ord = orec && LOCC.pgByRec[orec] ? 'ORD-' + LOCC.pgByRec[orec] : '';
  const ref = (o && o.fields['Reference']) || f['Reference'] || (nl && nl.fields['Name']) || '';
  const l2 = [ord, ref, plate].filter(Boolean).join(' · ');
  return `<div class="locc-h">
    <div class="locc-h1">
      <span style="color:var(--text-dim);font-variant-numeric:tabular-nums">${f['DateTime'] ? fmtDateDM(f['DateTime']) + '/' + String(f['DateTime']).slice(2, 4) : '—'}</span>
      <span><span class="locc-stype">${lbl[f['Stop Type']] || _locEsc(f['Stop Type'] || '—')}</span></span>
      <span class="who">${client || '—'}</span>
      <span class="num">${f['Pallets'] != null ? f['Pallets'] + ' pal' : '—'}</span>
    </div>
    ${l2 ? '<div class="locc-h2">' + _locEsc(l2) + '</div>' : ''}
  </div>`;
}
