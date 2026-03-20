// ═══════════════════════════════════════════════════════════════
// DAILY RAMP BOARD — v1.0
// Veroia warehouse view
// Shows Παραλαβές + Φορτώσεις for selected date
// Date picker: Σήμερα / Αύριο / Custom
// ═══════════════════════════════════════════════════════════════

'use strict';

const RAMP = {
  date:    new Date().toISOString().split('T')[0],
  records: [],
  trucks:  [],
  drivers: [],
  _editId: null,
};

/* ── CSS ──────────────────────────────────────────────────────── */
(function(){
  if (document.getElementById('ramp-css')) return;
  const s = document.createElement('style'); s.id = 'ramp-css';
  s.textContent = `
.ramp-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
.ramp-date-btn { padding:6px 14px; font-size:11px; font-weight:600; border-radius:5px;
  border:1px solid var(--border-mid); background:var(--bg); color:var(--text-mid); cursor:pointer; }
.ramp-date-btn.active { background:var(--navy-mid); color:#fff; border-color:var(--navy-mid); }
.ramp-date-input { padding:6px 10px; font-size:11px; border-radius:5px;
  border:1px solid var(--border-mid); background:var(--bg); color:var(--text); outline:none; }
.ramp-cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media(max-width:900px) { .ramp-cols { grid-template-columns:1fr; } }
.ramp-col { display:flex; flex-direction:column; gap:0; }
.ramp-col-head {
  display:flex; align-items:center; justify-content:space-between;
  padding:10px 14px; border-radius:8px 8px 0 0;
  font-size:11px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase;
}
.ramp-col-head.παραλαβη { background:#065F46; color:#ECFDF5; }
.ramp-col-head.φορτωση  { background:#1E3A8A; color:#EFF6FF; }
.ramp-col-body { border:1px solid var(--border-mid); border-top:none; border-radius:0 0 8px 8px;
  overflow:hidden; background:var(--bg-card); }
.ramp-row { padding:10px 14px; border-bottom:1px solid var(--border);
  display:grid; grid-template-columns:52px 1fr auto; gap:10px; align-items:start;
  transition:background .1s; cursor:pointer; }
.ramp-row:last-child { border-bottom:none; }
.ramp-row:hover { background:var(--bg-hover); }
.ramp-row.done  { opacity:.55; }
.ramp-time { font-family:'Syne',sans-serif; font-size:14px; font-weight:700;
  color:var(--text); line-height:1; }
.ramp-time.unset { font-size:10px; color:var(--text-dim); font-weight:400; font-style:italic; }
.ramp-info { display:flex; flex-direction:column; gap:2px; min-width:0; }
.ramp-main { font-size:12px; font-weight:700; color:var(--text);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ramp-sub  { font-size:10.5px; color:var(--text-mid); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ramp-badges { display:flex; gap:4px; flex-wrap:wrap; margin-top:2px; }
.ramp-badge { font-size:8px; font-weight:700; letter-spacing:.8px; padding:2px 6px;
  border-radius:3px; text-transform:uppercase; }
.rb-pallets { background:rgba(59,130,246,0.12); color:#60A5FA; }
.rb-temp    { background:rgba(14,165,233,0.12); color:#38BDF8; }
.rb-done    { background:rgba(5,150,105,0.12);  color:#34D399; }
.rb-post    { background:rgba(217,119,6,0.12);  color:#F59E0B; }
.rb-plan    { background:rgba(184,196,208,0.1); color:var(--text-dim); }
.ramp-actions { display:flex; flex-direction:column; gap:4px; align-items:flex-end; }
.ramp-act-btn { font-size:9px; font-weight:700; letter-spacing:.5px; padding:3px 8px;
  border-radius:4px; border:1px solid var(--border-mid); background:none;
  color:var(--text-dim); cursor:pointer; white-space:nowrap; }
.ramp-act-btn:hover { background:var(--bg-hover); color:var(--text); }
.ramp-act-btn.done { border-color:rgba(5,150,105,0.3); color:#34D399; }
.ramp-act-btn.post { border-color:rgba(217,119,6,0.3); color:#F59E0B; }
.ramp-empty { padding:36px 20px; text-align:center; color:var(--text-dim); font-size:12px; font-style:italic; }
.ramp-add-btn { margin:8px 14px 12px; padding:6px 12px; font-size:11px; font-weight:600;
  border-radius:5px; border:1.5px dashed var(--border-mid); background:none;
  color:var(--text-dim); cursor:pointer; width:calc(100% - 28px); text-align:center; }
.ramp-add-btn:hover { border-color:var(--accent); color:var(--accent); background:rgba(11,25,41,0.03); }

/* inline edit */
.ramp-edit-row { padding:10px 14px; border-bottom:1px solid var(--border);
  background:rgba(11,25,41,0.04); }
.ramp-edit-grid { display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:8px; }
.ramp-edit-field { display:flex; flex-direction:column; gap:3px; }
.ramp-edit-lbl { font-size:8.5px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:var(--text-dim); }
.ramp-edit-inp { padding:6px 9px; font-size:11px; border-radius:5px;
  border:1px solid var(--border-mid); background:var(--bg-card); color:var(--text); outline:none; }
.ramp-edit-inp:focus { border-color:rgba(11,25,41,0.4); }
.ramp-edit-actions { display:flex; gap:6px; }
`;
  document.head.appendChild(s);
})();

/* ── ENTRY POINT ──────────────────────────────────────────────── */
async function renderDailyRamp() {
  document.getElementById('topbarTitle').textContent = 'Daily Ramp Board';
  const content = document.getElementById('content');
  content.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:60px;color:var(--text-dim)">
    <div class="spinner"></div> Φόρτωση ράμπας…</div>`;

  try {
    await _rampLoadAssets();
    await _rampLoadRecords();
    _rampPaint();
  } catch(e) {
    content.innerHTML = `<div style="color:var(--danger);padding:40px">Σφάλμα: ${e.message}</div>`;
    console.error('renderDailyRamp:', e);
  }
}

/* ── ASSETS ───────────────────────────────────────────────────── */
async function _rampLoadAssets() {
  if (RAMP.trucks.length) return;
  const [t, d] = await Promise.all([
    atGetAll(TABLES.TRUCKS,  { fields:['License Plate'], filterByFormula:'{Active}=TRUE()' }, false),
    atGetAll(TABLES.DRIVERS, { fields:['Full Name'],     filterByFormula:'{Active}=TRUE()' }, false),
  ]);
  RAMP.trucks  = t.map(r => ({ id:r.id, label:r.fields['License Plate']||r.id }));
  RAMP.drivers = d.map(r => ({ id:r.id, label:r.fields['Full Name']||r.id }));
}

/* ── LOAD RECORDS ─────────────────────────────────────────────── */
async function _rampLoadRecords() {
  const filter = `{Plan Date}='${RAMP.date}'`;
  const recs = await atGetAll(TABLES.RAMP, {
    filterByFormula: filter,
    fields: ['Plan Date','Time','Type','Status','Pallets','Goods',
             'Supplier/Client','Notes','Postponed To','Order','Truck','Driver'],
  }, false);

  // Sort: records with Time first (ascending), then unset
  recs.sort((a, b) => {
    const ta = a.fields['Time']||'ZZ';
    const tb = b.fields['Time']||'ZZ';
    return ta.localeCompare(tb);
  });

  RAMP.records = recs;
}

/* ── PAINT ────────────────────────────────────────────────────── */
function _rampPaint() {
  const paral  = RAMP.records.filter(r => r.fields['Type'] === 'Παραλαβή');
  const fortw  = RAMP.records.filter(r => r.fields['Type'] === 'Φόρτωση');
  const other  = RAMP.records.filter(r => !['Παραλαβή','Φόρτωση'].includes(r.fields['Type']));

  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now()+86400000).toISOString().split('T')[0];
  const fmtDate  = d => {
    try { const p=d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; } catch { return d; }
  };

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:14px">
      <div>
        <div class="page-title">Daily Ramp Board</div>
        <div class="page-sub">Βέροια · ${fmtDate(RAMP.date)} ·
          <span style="color:var(--success)">${paral.length} παραλαβές</span>
          <span style="margin:0 4px">·</span>
          <span style="color:rgba(147,197,253,0.9)">${fortw.length} φορτώσεις</span>
        </div>
      </div>
      <button class="btn btn-ghost" onclick="renderDailyRamp()">Refresh</button>
    </div>

    <div class="ramp-toolbar">
      <button class="ramp-date-btn ${RAMP.date===today?'active':''}"
        onclick="_rampSetDate('${today}')">Σήμερα</button>
      <button class="ramp-date-btn ${RAMP.date===tomorrow?'active':''}"
        onclick="_rampSetDate('${tomorrow}')">Αύριο</button>
      <input type="date" class="ramp-date-input" value="${RAMP.date}"
        onchange="_rampSetDate(this.value)">
    </div>

    <div class="ramp-cols">
      <div class="ramp-col">
        <div class="ramp-col-head παραλαβη">
          <span>↓ Παραλαβές</span>
          <span style="font-weight:400;opacity:.7">${paral.length}</span>
        </div>
        <div class="ramp-col-body">
          ${paral.length ? paral.map(r => _rampRowHTML(r)).join('') : '<div class="ramp-empty">Χωρίς παραλαβές</div>'}
          <button class="ramp-add-btn" onclick="_rampOpenAdd('Παραλαβή')">+ Προσθήκη παραλαβής</button>
        </div>
      </div>
      <div class="ramp-col">
        <div class="ramp-col-head φορτωση">
          <span>↑ Φορτώσεις</span>
          <span style="font-weight:400;opacity:.7">${fortw.length}</span>
        </div>
        <div class="ramp-col-body">
          ${fortw.length ? fortw.map(r => _rampRowHTML(r)).join('') : '<div class="ramp-empty">Χωρίς φορτώσεις</div>'}
          <button class="ramp-add-btn" onclick="_rampOpenAdd('Φόρτωση')">+ Προσθήκη φόρτωσης</button>
        </div>
      </div>
    </div>
    ${other.length ? `
    <div style="margin-top:16px">
      <div class="ramp-col-head παραλαβη" style="border-radius:8px 8px 0 0;background:#4B5563">Άλλα (${other.length})</div>
      <div class="ramp-col-body">${other.map(r => _rampRowHTML(r)).join('')}</div>
    </div>` : ''}
  `;
}

/* ── ROW HTML ─────────────────────────────────────────────────── */
function _rampRowHTML(rec) {
  if (RAMP._editId === rec.id) return _rampEditRowHTML(rec);

  const f      = rec.fields;
  const time   = f['Time'] || null;
  const status = f['Status'] || 'Προγραμματισμένο';
  const isDone = status === '✅ Έγινε';
  const isPost = status === '⏩ Postponed';

  const truckId  = (f['Truck'] ||[])[0]?.id || null;
  const driverId = (f['Driver']||[])[0]?.id || null;
  const truck    = truckId  ? RAMP.trucks.find(t=>t.id===truckId)?.label||'' : '';
  const driver   = driverId ? RAMP.drivers.find(d=>d.id===driverId)?.label||'' : '';

  const mainLine = [truck, driver].filter(Boolean).join(' · ') || (f['Supplier/Client']||'—');
  const subLine  = f['Goods'] || '';

  const statusBadge = isDone
    ? `<span class="ramp-badge rb-done">✓ Έγινε</span>`
    : isPost
    ? `<span class="ramp-badge rb-post">⏩ Postponed</span>`
    : `<span class="ramp-badge rb-plan">${status}</span>`;

  return `<div class="ramp-row${isDone?' done':''}" onclick="_rampToggleEdit('${rec.id}')">
    <div class="${time ? 'ramp-time' : 'ramp-time unset'}">${time || '—:—'}</div>
    <div class="ramp-info">
      <div class="ramp-main">${mainLine}</div>
      ${subLine ? `<div class="ramp-sub">${subLine}</div>` : ''}
      <div class="ramp-badges">
        ${f['Pallets'] ? `<span class="ramp-badge rb-pallets">${f['Pallets']} pal</span>` : ''}
        ${statusBadge}
      </div>
    </div>
    <div class="ramp-actions" onclick="event.stopPropagation()">
      ${!isDone ? `<button class="ramp-act-btn done" onclick="_rampMarkDone('${rec.id}')">✓ Έγινε</button>` : ''}
      ${!isPost && !isDone ? `<button class="ramp-act-btn post" onclick="_rampPostpone('${rec.id}')">⏩ Αύριο</button>` : ''}
    </div>
  </div>`;
}

/* ── INLINE EDIT ROW ──────────────────────────────────────────── */
function _rampEditRowHTML(rec) {
  const f = rec.fields;
  const truckId  = (f['Truck'] ||[])[0]?.id || '';
  const driverId = (f['Driver']||[])[0]?.id || '';

  const truckOpts  = RAMP.trucks.map(t  => `<option value="${t.id}"  ${t.id===truckId ?'selected':''}>${t.label}</option>`).join('');
  const driverOpts = RAMP.drivers.map(d => `<option value="${d.id}"  ${d.id===driverId?'selected':''}>${d.label}</option>`).join('');
  const statusOpts = ['Προγραμματισμένο','✅ Έγινε','⏩ Postponed']
    .map(s => `<option value="${s}" ${f['Status']===s?'selected':''}>${s}</option>`).join('');

  return `<div class="ramp-edit-row">
    <div class="ramp-edit-grid">
      <div class="ramp-edit-field">
        <span class="ramp-edit-lbl">Ώρα</span>
        <input class="ramp-edit-inp" id="re_time" type="text" placeholder="08:00"
          value="${f['Time']||''}" style="width:70px">
      </div>
      <div class="ramp-edit-field">
        <span class="ramp-edit-lbl">Τράκτορας</span>
        <select class="ramp-edit-inp" id="re_truck" style="width:130px">
          <option value="">—</option>${truckOpts}
        </select>
      </div>
      <div class="ramp-edit-field">
        <span class="ramp-edit-lbl">Οδηγός</span>
        <select class="ramp-edit-inp" id="re_driver" style="width:150px">
          <option value="">—</option>${driverOpts}
        </select>
      </div>
      <div class="ramp-edit-field">
        <span class="ramp-edit-lbl">Παλέτες</span>
        <input class="ramp-edit-inp" id="re_pallets" type="number" min="0"
          value="${f['Pallets']||''}" style="width:70px">
      </div>
      <div class="ramp-edit-field">
        <span class="ramp-edit-lbl">Εμπόρευμα</span>
        <input class="ramp-edit-inp" id="re_goods" type="text"
          value="${(f['Goods']||'').replace(/"/g,'&quot;')}" style="width:150px">
      </div>
      <div class="ramp-edit-field">
        <span class="ramp-edit-lbl">Status</span>
        <select class="ramp-edit-inp" id="re_status" style="width:150px">${statusOpts}</select>
      </div>
    </div>
    <div class="ramp-edit-actions">
      <button class="btn btn-success" style="font-size:11px;padding:5px 16px"
        onclick="_rampSaveEdit('${rec.id}')">Αποθήκευση</button>
      <button class="btn btn-ghost" style="font-size:11px;padding:5px 12px"
        onclick="_rampCancelEdit()">Ακύρωση</button>
      <button class="btn btn-ghost" style="font-size:11px;padding:5px 12px;color:var(--danger)"
        onclick="_rampDelete('${rec.id}')">Διαγραφή</button>
    </div>
  </div>`;
}

/* ── ACTIONS ──────────────────────────────────────────────────── */
function _rampSetDate(d) {
  RAMP.date = d;
  RAMP._editId = null;
  renderDailyRamp();
}

function _rampToggleEdit(id) {
  RAMP._editId = RAMP._editId === id ? null : id;
  _rampRepaint();
}

function _rampCancelEdit() {
  RAMP._editId = null;
  _rampRepaint();
}

function _rampRepaint() {
  // Re-paint without full reload
  RAMP.records.sort((a,b) => (a.fields['Time']||'ZZ').localeCompare(b.fields['Time']||'ZZ'));
  _rampPaint();
}

async function _rampSaveEdit(recId) {
  const time    = document.getElementById('re_time')?.value.trim();
  const truckId = document.getElementById('re_truck')?.value;
  const driverId= document.getElementById('re_driver')?.value;
  const pallets = document.getElementById('re_pallets')?.value;
  const goods   = document.getElementById('re_goods')?.value.trim();
  const status  = document.getElementById('re_status')?.value;

  const fields = {};
  if (time)    fields['Time']    = time;
  if (status)  fields['Status']  = { name: status };
  if (goods)   fields['Goods']   = goods;
  if (pallets) fields['Pallets'] = parseFloat(pallets);
  if (truckId)  fields['Truck']  = [truckId];
  else          fields['Truck']  = [];
  if (driverId) fields['Driver'] = [driverId];
  else          fields['Driver'] = [];

  try {
    await atPatch(TABLES.RAMP, recId, fields);
    invalidateCache(TABLES.RAMP);
    // Update local
    const rec = RAMP.records.find(r => r.id===recId);
    if (rec) {
      if (time)    rec.fields['Time']    = time;
      if (status)  rec.fields['Status']  = status;
      if (goods)   rec.fields['Goods']   = goods;
      if (pallets) rec.fields['Pallets'] = parseFloat(pallets);
      rec.fields['Truck']  = truckId  ? [{id:truckId}]  : [];
      rec.fields['Driver'] = driverId ? [{id:driverId}] : [];
    }
    RAMP._editId = null;
    toast('Αποθηκεύτηκε ✓');
    _rampRepaint();
  } catch(e) { toast('Σφάλμα: '+e.message, 'danger'); }
}

async function _rampMarkDone(recId) {
  try {
    await atPatch(TABLES.RAMP, recId, { 'Status': { name: '✅ Έγινε' } });
    const rec = RAMP.records.find(r => r.id===recId);
    if (rec) rec.fields['Status'] = '✅ Έγινε';
    toast('✅ Έγινε');
    _rampRepaint();
  } catch(e) { toast('Σφάλμα', 'danger'); }
}

async function _rampPostpone(recId) {
  const tomorrow = new Date(Date.now()+86400000).toISOString().split('T')[0];
  try {
    await atPatch(TABLES.RAMP, recId, {
      'Status':       { name: '⏩ Postponed' },
      'Postponed To': tomorrow,
    });
    const rec = RAMP.records.find(r => r.id===recId);
    if (rec) { rec.fields['Status'] = '⏩ Postponed'; rec.fields['Postponed To'] = tomorrow; }
    toast('⏩ Postponed → αύριο');
    _rampRepaint();
  } catch(e) { toast('Σφάλμα', 'danger'); }
}

async function _rampDelete(recId) {
  if (!confirm('Να διαγραφεί αυτή η εγγραφή;')) return;
  try {
    await atDelete(TABLES.RAMP, recId);
    RAMP.records = RAMP.records.filter(r => r.id !== recId);
    RAMP._editId = null;
    toast('Διαγράφηκε');
    _rampRepaint();
  } catch(e) { toast('Σφάλμα', 'danger'); }
}

/* ── ADD NEW RECORD ───────────────────────────────────────────── */
function _rampOpenAdd(type) {
  const truckOpts  = RAMP.trucks.map(t  => `<option value="${t.id}">${t.label}</option>`).join('');
  const driverOpts = RAMP.drivers.map(d => `<option value="${d.id}">${d.label}</option>`).join('');

  openModal(`Νέα ${type}`, `
    <div class="form-grid">
      <div class="form-field">
        <label class="form-label">Ώρα</label>
        <input class="form-input" id="na_time" type="text" placeholder="08:00" style="max-width:100px">
      </div>
      <div class="form-field">
        <label class="form-label">Τράκτορας</label>
        <select class="form-select" id="na_truck"><option value="">—</option>${truckOpts}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Οδηγός</label>
        <select class="form-select" id="na_driver"><option value="">—</option>${driverOpts}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Παλέτες</label>
        <input class="form-input" id="na_pallets" type="number" min="0">
      </div>
      <div class="form-field span-2">
        <label class="form-label">Εμπόρευμα / Σημειώσεις</label>
        <input class="form-input" id="na_goods" type="text" placeholder="π.χ. Φρέσκα φρούτα · -1°C">
      </div>
      <div class="form-field span-2">
        <label class="form-label">Προμηθευτής / Πελάτης</label>
        <input class="form-input" id="na_client" type="text">
      </div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Ακύρωση</button>
     <button class="btn btn-success" onclick="_rampSaveNew('${type}')">Αποθήκευση</button>`
  );
}

async function _rampSaveNew(type) {
  const time     = document.getElementById('na_time')?.value.trim();
  const truckId  = document.getElementById('na_truck')?.value;
  const driverId = document.getElementById('na_driver')?.value;
  const pallets  = document.getElementById('na_pallets')?.value;
  const goods    = document.getElementById('na_goods')?.value.trim();
  const client   = document.getElementById('na_client')?.value.trim();

  const fields = {
    'Plan Date': RAMP.date,
    'Type':      { name: type },
    'Status':    { name: 'Προγραμματισμένο' },
  };
  if (time)    fields['Time']             = time;
  if (pallets) fields['Pallets']          = parseFloat(pallets);
  if (goods)   fields['Goods']            = goods;
  if (client)  fields['Supplier/Client']  = client;
  if (truckId)  fields['Truck']           = [truckId];
  if (driverId) fields['Driver']          = [driverId];

  try {
    const res = await atCreate(TABLES.RAMP, fields);
    if (res?.error) throw new Error(res.error.message);
    invalidateCache(TABLES.RAMP);
    closeModal();
    toast('Προστέθηκε ✓');
    await _rampLoadRecords();
    _rampRepaint();
  } catch(e) { toast('Σφάλμα: '+e.message, 'danger'); }
}
