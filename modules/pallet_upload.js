// ═══════════════════════════════════════════════
// MODULE — PALLET UPLOAD MODAL
// Opens from Order detail when Pallet Exchange=true
// Dynamic sheet tabs: 1 per loading location + crossdock (if Veroia Switch)
// AI extraction via Claude Sonnet from uploaded image/PDF
// ═══════════════════════════════════════════════
// Module state uses 'PU' / '_pu' prefix to avoid global collisions.
'use strict';

const PU = {
  orderId: null,
  order: null,
  tabs: [],        // [{idx, label, locId, locName, stopType, done}]
  activeTab: 0,
  fileB64: null,
  fileType: null,
  fileName: null,
  partners: null,  // cached
  locations: null, // cached
};

/* ── Fetch single record by ID ────────────────── */
async function _puFetchRecord(tableId, recId) {
  return atGetOne(tableId, recId);
}

/* ── Entry point ─────────────────────────────── */
async function openPalletUpload(orderId) {
  PU.orderId = orderId;
  PU.activeTab = 0;
  PU.fileB64 = null;

  // Fetch order
  try {
    PU.order = await _puFetchRecord(TABLES.ORDERS, orderId);
  } catch (e) {
    alert('Error loading order: ' + e.message);
    return;
  }
  const f = PU.order.fields;

  // Build tabs — try ORDER_STOPS first, fallback to flat fields
  PU.tabs = [];
  const letters = 'abcdefghij';
  let _puStops = [];
  try {
    _puStops = await stopsLoad(orderId, F.STOP_PARENT_ORDER);
  } catch(e) { console.warn('PU: stopsLoad failed, using flat fields', e); }

  if (_puStops.length) {
    // ORDER_STOPS path: build tabs from stop records
    const loadStops = _puStops.filter(s => s.fields[F.STOP_TYPE] === 'Loading')
      .sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0));
    const crossDockStops = _puStops.filter(s => s.fields[F.STOP_TYPE] === 'Cross-dock');

    for (let i = 0; i < loadStops.length; i++) {
      const sf = loadStops[i].fields;
      const locArr = sf[F.STOP_LOCATION];
      const locId = Array.isArray(locArr) ? locArr[0] : null;
      const locName = locId ? await _puLocName(locId) : `Stop ${i+1}`;
      PU.tabs.push({
        idx: PU.tabs.length,
        label: loadStops.length > 1 ? `Sheet 1${letters[i]}` : 'Sheet 1',
        locId, locName, stopType: 'Loading', done: !!sf[F.STOP_PALLET_SHEET_OK],
        stopRecId: loadStops[i].id,
      });
    }
    // Cross-dock tabs
    for (const cd of crossDockStops) {
      PU.tabs.push({
        idx: PU.tabs.length, label: 'Sheet 2',
        locId: null, locName: 'Veroia Crossdock', stopType: 'Crossdock',
        done: !!cd.fields[F.STOP_PALLET_SHEET_OK], stopRecId: cd.id,
      });
    }
    // If VS order has no cross-dock stop yet, add placeholder tab
    if (f['Veroia Switch'] && !crossDockStops.length) {
      PU.tabs.push({ idx: PU.tabs.length, label: 'Sheet 2', locId: null,
        locName: 'Veroia Crossdock', stopType: 'Crossdock', done: false });
    }
  } else {
    // No ORDER_STOPS found — show empty state
    PU.tabs.push({ idx: 0, label: 'Sheet 1', locId: null,
      locName: 'No stops found', stopType: 'Loading', done: false });
  }

  // Load partners from ref cache
  if (!PU.partners) {
    await preloadReferenceData();
    PU.partners = getRefPartners().slice().sort((a, b) => (a.fields['Company Name'] || '').localeCompare(b.fields['Company Name'] || ''));
  }

  // Get client name for display
  const clientId = Array.isArray(f['Client']) ? f['Client'][0] : null;
  const clientName = clientId ? await _puClientName(clientId) : '';

  _puRenderModal(clientName);
}

/* ── Resolve location name ───────────────────── */
async function _puLocName(locId) {
  if (!PU.locations) {
    await preloadReferenceData();
    PU.locations = getRefLocations();
  }
  const loc = PU.locations.find(l => l.id === locId);
  return loc ? (loc.fields['Name'] || loc.fields['City'] || locId) : locId;
}

async function _puClientName(clientId) {
  try {
    const rec = await _puFetchRecord(TABLES.CLIENTS, clientId);
    return rec.fields['Company Name'] || '';
  } catch { return ''; }
}

/* ── Render modal ────────────────────────────── */
function _puRenderModal(clientName) {
  const f = PU.order.fields;
  const partnerOpts = (PU.partners || [])
    .map(p => `<option value="${p.id}">${p.fields['Company Name'] || p.id}</option>`)
    .join('');

  const tabsHtml = PU.tabs.map((t, i) => `
    <div class="pu-tab ${i === 0 ? 'active' : ''} ${t.done ? 'done' : ''}"
         data-idx="${i}" onclick="selectPalletTab(${i})">
      <span class="pu-tab-num">${t.done ? '✓' : (i + 1)}</span>
      <span class="pu-tab-label">${t.locName}</span>
      <span class="pu-tab-type">${t.stopType}</span>
    </div>
  `).join('');

  const html = `
  <div class="pu-overlay" id="puOverlay" onclick="if(event.target===this)closePalletUpload()">
    <div class="pu-modal">
      <div class="pu-header">
        <h2>Pallet Exchange</h2>
        <button class="pu-close" onclick="closePalletUpload()">&times;</button>
      </div>

      <div class="pu-strip">
        <div><span class="pu-strip-label">Order</span><span class="pu-strip-val">${f['Order Number'] || '—'}</span></div>
        <div><span class="pu-strip-label">Direction</span><span class="pu-strip-val">${f['Direction'] || '—'}</span></div>
        <div><span class="pu-strip-label">Client</span><span class="pu-strip-val">${clientName || '—'}</span></div>
        <div><span class="pu-strip-label">Pallets</span><span class="pu-strip-val">${f['Total Pallets'] || '—'}</span></div>
      </div>

      <div class="pu-tabs" id="puTabs">${tabsHtml}</div>

      <div class="pu-body" id="puBody">
        ${_puTabContent(0)}
      </div>
    </div>
  </div>`;

  // Remove existing overlay if any
  document.getElementById('puOverlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

/* ── Tab content ─────────────────────────────── */
function _puTabContent(idx) {
  const tab = PU.tabs[idx];
  if (!tab) return '';
  const isLoading = tab.stopType === 'Loading';

  return `
  <div class="pu-upload-section" id="puUploadSection">
    <div class="pu-upload-zone" id="puDropZone"
         onclick="document.getElementById('puFileInput').click()"
         ondragover="event.preventDefault();this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="event.preventDefault();this.classList.remove('drag-over');_puHandleFile(event.dataTransfer.files[0])">
      <input type="file" id="puFileInput" accept="image/*,.pdf" style="display:none"
             onchange="_puHandleFile(this.files[0])">
      <div class="pu-upload-icon">📄</div>
      <div class="pu-upload-text">Drop image or PDF here, or click to select</div>
      <div class="pu-upload-hint">JPG, PNG, PDF — max 10 MB</div>
    </div>

    <div id="puFilePreview" style="display:none" class="pu-file-preview">
      <span id="puFileName"></span>
      <button class="btn btn-sm" onclick="_puClearFile()">✕</button>
    </div>

    <button class="btn btn-scan" id="puBtnExtract" onclick="_puExtractAI()" disabled>
      AI Extract
    </button>
    <div id="puAiStatus" class="pu-status" style="display:none"></div>
  </div>

  <div class="pu-confirm-section" id="puConfirmSection" style="display:none">
    <div class="pu-balance-row">
      <div class="pu-balance-card">
        <div class="pu-balance-num" id="puBalanceNum">0</div>
        <div class="pu-balance-desc" id="puBalanceDesc">—</div>
      </div>
    </div>

    <div class="pu-form-grid">
      <div class="pu-field">
        <label>Pallets OUT (left at supplier)</label>
        <input type="number" id="puOut" value="0" min="0" oninput="_puUpdateBalance()">
      </div>
      <div class="pu-field">
        <label>Pallets IN (taken from supplier)</label>
        <input type="number" id="puIn" value="0" min="0" oninput="_puUpdateBalance()">
      </div>
      <div class="pu-field">
        <label>Date</label>
        <input type="date" id="puDate">
      </div>
      <div class="pu-field">
        <label>Transport No.</label>
        <input type="text" id="puTransport" placeholder="e.g. ABC123">
      </div>
      ${isLoading ? `
      <div class="pu-field pu-full-width">
        <label class="pu-toggle-label">
          <input type="checkbox" id="puChargePartner" onchange="_puTogglePartner()">
          <span>Charge Partner</span>
        </label>
      </div>
      ` : ''}
      <div class="pu-field ${isLoading ? 'pu-partner-field' : ''}" id="puPartnerField"
           style="${isLoading ? 'display:none' : ''}">
        <label>Partner</label>
        <select id="puPartner">
          <option value="">— Select Partner —</option>
          ${(PU.partners || []).map(p =>
            `<option value="${p.id}">${p.fields['Company Name'] || p.id}</option>`
          ).join('')}
        </select>
      </div>
      <div class="pu-field">
        <label>Issuer</label>
        <input type="text" id="puIssuer" readonly>
      </div>
      <div class="pu-field pu-full-width">
        <label>Notes</label>
        <textarea id="puNotes" rows="2"></textarea>
      </div>
    </div>

    <div class="pu-actions">
      <button class="btn" onclick="_puBackToUpload()">Back</button>
      <button class="btn btn-new-order" onclick="_puSave()">Save Sheet</button>
    </div>
  </div>`;
}

/* ── Tab selection ───────────────────────────── */
function selectPalletTab(idx) {
  PU.activeTab = idx;
  PU.fileB64 = null;
  PU.fileType = null;

  // Update tab styling
  document.querySelectorAll('.pu-tab').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });

  // Render tab content
  document.getElementById('puBody').innerHTML = _puTabContent(idx);
}

/* ── File handling ───────────────────────────── */
function _puHandleFile(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    alert('File too large (max 10 MB)');
    return;
  }

  PU.fileName = file.name;
  PU.fileType = file.type || 'image/jpeg';

  const reader = new FileReader();
  reader.onload = () => {
    PU.fileB64 = reader.result.split(',')[1];
    document.getElementById('puFilePreview').style.display = 'flex';
    document.getElementById('puFileName').textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
    document.getElementById('puBtnExtract').disabled = false;
  };
  reader.readAsDataURL(file);
}

function _puClearFile() {
  PU.fileB64 = null;
  PU.fileType = null;
  PU.fileName = null;
  document.getElementById('puFilePreview').style.display = 'none';
  document.getElementById('puBtnExtract').disabled = true;
  document.getElementById('puFileInput').value = '';
}

/* ── AI Extraction (uses shared scan-helpers for preprocessing + retry) ── */
async function _puExtractAI() {
  const btn = document.getElementById('puBtnExtract');
  const status = document.getElementById('puAiStatus');
  btn.disabled = true;
  status.style.display = 'flex';
  status.className = 'pu-status loading';
  status.innerHTML = '<div class="spinner"></div><span>AI reading document...</span>';

  try {
    // Build a File-like blob from cached base64 if needed, OR use the cached data directly.
    // Existing PU code stores PU.fileB64 + PU.fileType; we adapt to scan-helpers schema.
    const content = PU.fileType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: PU.fileB64 } }
      : { type: 'image',    source: { type: 'base64', media_type: PU.fileType, data: PU.fileB64 } };

    // Few-shot from past pallet-sheet corrections (if any)
    const examples = (typeof scanGetTrainingExamples === 'function')
      ? scanGetTrainingExamples('PALLET_SHEET', 2) : [];
    const messages = [];
    examples.forEach(ex => {
      messages.push({ role: 'user', content: [{ type: 'text', text: 'Extract pallet data:' }] });
      messages.push({ role: 'assistant', content: [{ type: 'text', text: JSON.stringify(ex.corrected) }] });
    });
    messages.push({ role: 'user', content: [content, { type: 'text', text: 'Extract pallet exchange data from this document. JSON only.' }] });

    const sysPrompt = `Extract pallet exchange / pallet ledger data from logistics documents (Greek δελτίο παλετών, EUR/EPAL exchange forms, transport pallet sheets).
Return ONLY valid JSON, no markdown.

Output schema:
{
  "transport_number": "transport / order reference number, or null",
  "date": "YYYY-MM-DD",
  "issuer_company": "name of the company issuing the document (often the supplier/loader)",
  "carrier_company": "transport company executing the trip",
  "pallets_loaded": integer (pallets given to truck — empty if not stated),
  "pallets_returned": integer (empty pallets returned to supplier — 0 if none),
  "pallet_type": "EUR | EPAL | EUROPALETA | OTHER | null",
  "driver_signed": true | false,
  "company_signed": true | false,
  "confidence": "HIGH | MEDIUM | LOW",
  "field_confidence": {
    "transport_number": 0-1,
    "date": 0-1,
    "pallets_loaded": 0-1,
    "pallets_returned": 0-1,
    "issuer_company": 0-1
  },
  "notes": "any handwritten remarks, exception text"
}

KEY RULES:
- Empty / unstated numeric fields → 0 (NOT null)
- Greek pallet sheets often use "Παλέτες" (full) and "Άδειες" (empty)
- "ΦΟΡΤΩΘΗΚΑΝ" / "Loaded" / "Pris" = pallets_loaded
- "ΕΠΙΣΤΡΟΦΗ" / "Returned" / "Rendu" = pallets_returned
- Greek date formats common: DD/MM/YYYY → convert to YYYY-MM-DD
- Signatures: any visible mark in signature box → true
- Numbers handwritten with cross-outs: lower confidence to 0.6`;

    // PALLET_SHEET → Sonnet tier (numerical data, low complexity, ~$0.024/scan).
    const palletModel = (typeof scanModelForType === 'function')
      ? scanModelForType('PALLET_SHEET')
      : (typeof SCAN_MODEL !== 'undefined' ? SCAN_MODEL : 'claude-sonnet-4-20250514');

    const data = (typeof scanCallAnthropic === 'function')
      ? await scanCallAnthropic({
          model: palletModel,
          max_tokens: (typeof SCAN_MAX_TOKENS !== 'undefined' ? SCAN_MAX_TOKENS : 4000),
          system: sysPrompt,
          messages,
        })
      : await (async () => {  // fallback if helpers not loaded
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': ANTH_KEY,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, system: sysPrompt, messages }),
          });
          if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || 'API error ' + res.status); }
          return res.json();
        })();

    const raw = data.content.find(c => c.type === 'text')?.text || '{}';
    const parsed = (typeof scanExtractJSON === 'function')
      ? scanExtractJSON(raw)
      : JSON.parse(raw.replace(/```json|```/g, '').trim());
    parsed._docType = 'PALLET_SHEET';

    status.style.display = 'none';
    btn.disabled = false;
    _puShowConfirm(parsed);
  } catch (e) {
    status.className = 'pu-status error';
    status.innerHTML = '❌ Error: ' + e.message;
    btn.disabled = false;
    if (typeof logError === 'function') logError(e, 'pallet_upload_extract');
  }
}

/* ── Show confirmation ───────────────────────── */
function _puShowConfirm(data) {
  const tab = PU.tabs[PU.activeTab];
  const isLoading = tab.stopType === 'Loading';

  // Hide upload, show confirm
  document.getElementById('puUploadSection').style.display = 'none';
  document.getElementById('puConfirmSection').style.display = 'block';

  const out = data.pallets_loaded || 0;
  const inn = data.pallets_returned || 0;

  // At Loading Stop: truck TOOK pallets = IN for us, empties left = OUT from us
  // At Crossdock: truck GAVE pallets = OUT from us
  if (isLoading) {
    document.getElementById('puOut').value = inn; // empties returned to supplier
    document.getElementById('puIn').value = out;  // full pallets taken
  } else {
    document.getElementById('puOut').value = out;
    document.getElementById('puIn').value = inn;
  }

  document.getElementById('puDate').value = data.date || localToday();
  document.getElementById('puTransport').value = data.transport_number || '';
  document.getElementById('puIssuer').value = data.issuer_company || '';

  _puUpdateBalance();
}

function _puBackToUpload() {
  document.getElementById('puUploadSection').style.display = 'block';
  document.getElementById('puConfirmSection').style.display = 'none';
}

/* ── Balance update ──────────────────────────── */
function _puUpdateBalance() {
  const out = parseInt(document.getElementById('puOut').value) || 0;
  const inn = parseInt(document.getElementById('puIn').value) || 0;
  const bal = out - inn;

  const numEl = document.getElementById('puBalanceNum');
  const descEl = document.getElementById('puBalanceDesc');

  numEl.textContent = bal === 0 ? 'BALANCED' : bal > 0 ? `+${bal}` : String(bal);
  numEl.className = 'pu-balance-num ' + (bal > 0 ? 'positive' : bal < 0 ? 'negative' : 'zero');

  descEl.textContent = bal > 0
    ? `They owe us ${bal} pallets`
    : bal < 0
      ? `We owe them ${Math.abs(bal)} pallets`
      : 'Balanced — no debt';
}

/* ── Toggle partner field ────────────────────── */
function _puTogglePartner() {
  const checked = document.getElementById('puChargePartner')?.checked;
  const field = document.getElementById('puPartnerField');
  if (field) field.style.display = checked ? '' : 'none';
}

/* ── SAVE ─────────────────────────────────────── */
async function _puSave() {
  const tab = PU.tabs[PU.activeTab];
  const isLoading = tab.stopType === 'Loading';
  const f = PU.order.fields;

  const outVal = parseInt(document.getElementById('puOut').value) || 0;
  const inVal = parseInt(document.getElementById('puIn').value) || 0;
  const date = document.getElementById('puDate').value;
  const transport = document.getElementById('puTransport').value;
  const issuer = document.getElementById('puIssuer').value;
  const notes = document.getElementById('puNotes').value;
  const partnerId = document.getElementById('puPartner')?.value;

  // Build notes string
  const noteParts = [
    transport ? `Transport: ${transport}` : '',
    issuer ? `Issuer: ${issuer}` : '',
    notes,
  ].filter(Boolean).join(' | ');

  // Get client ID from order
  const clientId = Array.isArray(f['Client']) ? f['Client'][0] : null;

  const records = [];

  if (isLoading) {
    // --- SUPPLIER RECORDS (always) ---
    // OUT = empties we left at supplier
    if (outVal > 0) {
      records.push(_puBuildRecord('OUT', outVal, 'Client', {
        date, notes: noteParts, locId: tab.locId, clientId, stopType: 'Loading',
      }));
    }
    // IN = full pallets we took from supplier
    if (inVal > 0) {
      records.push(_puBuildRecord('IN', inVal, 'Client', {
        date, notes: noteParts, locId: tab.locId, clientId, stopType: 'Loading',
      }));
    }

    // --- PARTNER RECORDS (optional) ---
    const chargePartner = document.getElementById('puChargePartner')?.checked;
    if (chargePartner && partnerId) {
      // Partner took pallets on our behalf = OUT (they owe us)
      if (inVal > 0) {
        records.push(_puBuildRecord('OUT', inVal, 'Partner', {
          date, notes: noteParts, partnerId, stopType: 'Loading',
        }));
      }
      // Partner left empties = IN (reduces their debt)
      if (outVal > 0) {
        records.push(_puBuildRecord('IN', outVal, 'Partner', {
          date, notes: noteParts, partnerId, stopType: 'Loading',
        }));
      }
    }
  } else {
    // --- CROSSDOCK: Partner records only ---
    if (!partnerId) {
      alert('Please select a Partner for the crossdock sheet');
      return;
    }
    // Partner took pallets from Veroia = OUT (they owe us)
    if (outVal > 0) {
      records.push(_puBuildRecord('OUT', outVal, 'Partner', {
        date, notes: noteParts, partnerId, stopType: 'Crossdock',
      }));
    }
    // Partner left empties at Veroia = IN (reduces debt)
    if (inVal > 0) {
      records.push(_puBuildRecord('IN', inVal, 'Partner', {
        date, notes: noteParts, partnerId, stopType: 'Crossdock',
      }));
    }
  }

  if (records.length === 0) {
    alert('No pallets to record (both OUT and IN are 0)');
    return;
  }

  // Save all records
  try {
    for (const rec of records) {
      await atCreate(TABLES.PALLET_LEDGER, rec);
    }

    // Mark tab as done
    tab.done = true;
    const tabEl = document.querySelectorAll('.pu-tab')[PU.activeTab];
    if (tabEl) {
      tabEl.classList.add('done');
      tabEl.querySelector('.pu-tab-num').textContent = '✓';
    }

    // Update ORDERS flags
    const loadingTabs = PU.tabs.filter(t => t.stopType === 'Loading');
    const crossdockTabs = PU.tabs.filter(t => t.stopType === 'Crossdock');

    const patch = {};
    if (loadingTabs.length > 0 && loadingTabs.every(t => t.done)) {
      patch['Pallet Sheet 1 Uploaded'] = true;
    }
    if (crossdockTabs.length > 0 && crossdockTabs.every(t => t.done)) {
      patch['Pallet Sheet 2 Uploaded'] = true;
    }

    if (Object.keys(patch).length > 0) {
      await atPatch(TABLES.ORDERS, PU.orderId, patch);
    }

    // Show success, move to next tab or close
    const nextUndone = PU.tabs.find(t => !t.done);
    if (nextUndone) {
      selectPalletTab(nextUndone.idx);
    } else {
      // All done — close after brief delay
      const body = document.getElementById('puBody');
      body.innerHTML = `<div style="text-align:center;padding:40px">
        <div style="font-size:48px;margin-bottom:16px">✓</div>
        <div style="font-size:18px;font-weight:600;color:var(--success,#10B981)">All sheets uploaded!</div>
        <div style="margin-top:8px;color:#64748B">${records.length} records created</div>
      </div>`;
      setTimeout(closePalletUpload, 2000);
    }
  } catch (e) {
    alert('Error saving: ' + e.message);
  }
}

/* ── Build a single PALLET LEDGER record ─────── */
function _puBuildRecord(direction, pallets, counterpartyType, opts) {
  const rec = {
    'Direction': direction,
    'Pallets': pallets,
    'Pallet Type': 'EUR/EPAL',
    'Counterparty Type': counterpartyType,
    'Stop Type': opts.stopType,
    'AI Extracted': true,
    'Verified': false,
    'Order': [PU.orderId],
  };

  if (opts.date) rec['Date'] = opts.date;
  if (opts.notes) rec['Notes'] = opts.notes;
  if (opts.locId) rec['Loading Supplier'] = [opts.locId];
  if (opts.clientId) rec['Client Account'] = [opts.clientId];
  if (opts.partnerId) rec['Partner Account'] = [opts.partnerId];

  return rec;
}

/* ── Close modal ─────────────────────────────── */
function closePalletUpload() {
  document.getElementById('puOverlay')?.remove();
  PU.orderId = null;
  PU.order = null;
  PU.fileB64 = null;
}
