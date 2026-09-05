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
  const countries = [...new Set(LOC.records.map(r => r.fields.Country).filter(Boolean))].sort();
  const cf = document.getElementById('locCountryFilter');
  // LO-2: η παλιά κάρτα «Ελλιπή Στοιχεία» οδηγούσε εδώ — μένει ως μόνιμη επιλογή
  { const o = document.createElement('option'); o.value = '__missing'; o.textContent = '— Ελλιπή στοιχεία'; cf.appendChild(o); }
  countries.forEach(c => { const o = document.createElement('option'); o.value = o.textContent = c; cf.appendChild(o); });

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
    else if (country && f.Country !== country) return false;
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
      <td>${f.Country ? _locEsc(f.Country) : '<span class="loc-dash">—</span>'}</td>
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
  const countries = [...new Set(LOC.records.map(r => r.fields.Country).filter(Boolean))].sort();
  return `
<datalist id="locCDL">${countries.map(c => `<option value="${_locEsc(c)}">`).join('')}</datalist>
<datalist id="locTDL">${['Client Depot','Fuel Station','Partner Warehouse','ΣΥΝΕΡΓΕΙΟ','Custom Point','Veroia Hub','Πλυντήριο'].map(t => `<option value="${t}">`).join('')}</datalist>
<div class="form-grid">
  <div class="form-field span-2">
    <label class="form-label">Όνομα *</label>
    <input id="locF_name" class="form-input" placeholder="π.χ. VERMION FRESH, Veroia" value="${_locEsc(f.Name||'')}">
    <div style="font-size:var(--text-xs);color:var(--text-dim);margin-top:var(--space-1)">Λατινικοί χαρακτήρες (greeklish), όπως όλες οι εγγραφές — κανόνας 9/8.</div>
  </div>
  <div class="form-field">
    <label class="form-label">Χώρα</label>
    <input id="locF_country" class="form-input" list="locCDL" placeholder="π.χ. Greece" value="${_locEsc(f.Country||'')}">
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
  <div class="form-field">
    <label class="form-label">Σημειώσεις</label>
    <input id="locF_notes" class="form-input" placeholder="π.χ. χωρίς κλαρκ — τηλεφώνησε πριν" value="${_locEsc(f.Notes||'')}">
  </div>
  <div class="form-field span-2">
    <button class="btn btn-ghost" id="locGeoBtn" style="width:100%;justify-content:center">Εύρεση συντεταγμένων από όνομα + πόλη</button>
  </div>
</div>`;
}

async function _locSave() {
  const name = document.getElementById('locF_name')?.value.trim();
  if (!name) { toast('Το όνομα είναι υποχρεωτικό', 'danger'); return; }
  const fields = { Name: name };
  const country = document.getElementById('locF_country')?.value.trim();
  const city    = document.getElementById('locF_city')?.value.trim();
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
  if (btn) { btn.textContent = 'Αποθήκευση…'; btn.disabled = true; }
  try {
    const data = LOC.editingId
      ? await atPatch(TABLES.LOCATIONS, LOC.editingId, fields)
      : await atCreate(TABLES.LOCATIONS, fields);
    if (data.error) throw new Error(data.error.message || 'Η αποθήκευση απέτυχε');
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

async function _locGeocode() {
  const name    = document.getElementById('locF_name')?.value.trim();
  const city    = document.getElementById('locF_city')?.value.trim();
  const country = document.getElementById('locF_country')?.value.trim();
  const q = [name, city, country].filter(Boolean).join(', ');
  if (!q) { toast('Συμπλήρωσε πρώτα όνομα ή πόλη', 'danger'); return; }
  const btn = document.getElementById('locGeoBtn');
  if (btn) { btn.textContent = 'Αναζήτηση…'; btn.disabled = true; }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`);
    const d = await r.json();
    if (d[0]) {
      document.getElementById('locF_lat').value = parseFloat(d[0].lat).toFixed(6);
      document.getElementById('locF_lon').value = parseFloat(d[0].lon).toFixed(6);
      toast('Οι συντεταγμένες συμπληρώθηκαν ✓', 'success');
    } else { toast('Δεν βρέθηκε αποτέλεσμα', 'danger'); }
  } catch (e) { toast('Η γεωκωδικοποίηση απέτυχε', 'danger'); }
  finally { if (btn) { btn.textContent = 'Εύρεση συντεταγμένων από όνομα + πόλη'; btn.disabled = false; } }
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
const LOCC = { openId: null, stops: null, orderById: {}, natById: {}, natOrdById: {}, pgByRec: {}, failed: false };

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
      headers: jwt ? { Authorization: 'Bearer ' + jwt } : {}
    });
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
  LOCC.openId = id; LOCC.stops = null; LOCC.failed = false; LOCC.pgByRec = {};
  panel.innerHTML = _locCardHtml(rec, '<div class="locc-empty">Φόρτωση ιστορικού…</div>');
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
  if (LOCC.openId === id) panel.innerHTML = _locCardHtml(rec, null);
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

function _locTypeChips() {
  if (!LOCC.stops || LOCC.failed || !LOCC.stops.length) return '';
  const by = {};
  LOCC.stops.forEach(s => { const t = _locStopMoveType(s); if (t) by[t] = (by[t] || 0) + 1; });
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
    <div class="locc-meta">${_locEsc(f.City || '—')} · ${_locEsc(f.Country || '—')}</div>
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
  const history = LOCC.stops.length ? `
    <div class="locc-sect">Ιστορικό <span class="n">· ${LOCC.stops.length} ${LOCC.stops.length === 1 ? 'κίνηση' : 'κινήσεις'}</span></div>
    <div class="locc-rows">${LOCC.stops.map(_locHistRow).join('')}</div>`
    : `<div class="locc-sect">Ιστορικό</div>
       <div class="locc-empty">Καμία κίνηση καταγεγραμμένη για αυτή την τοποθεσία.
       Το ιστορικό ξεκινά με την πρώτη στάση παραγγελίας που θα τη δηλώσει σημείο φόρτωσης ή παράδοσης.</div>`;
  return head + info + goods + history;
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
