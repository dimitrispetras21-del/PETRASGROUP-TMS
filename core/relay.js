// ═══════════════════════════════════════════════════════════════════════
// CORE — LOCAL RELAY (τοπική παράδοση / τοπική φόρτωση), migration 060
// ─────────────────────────────────────────────────────────────────────
// Owner 4/10/2026: «οκ προχωρα με τις τοπικες παραδοσεις». The owner's
// answers (Q1–Q5) and the Φ1 limits: docs/DECISION_LOG.md, 2026-10-04
// «Τοπικός οδηγός για παράδοση/φόρτωση».
//
// A local driver delivers an import (or loads an export) around Veroia while
// the INTERNATIONAL driver stays on the order, its round trip and its payroll.
// The relay is a LOCAL MOVES row tied to the order (Parent Order + Move Kind).
// It never writes to the order: changing the order's driver instead moves the
// WHOLE round trip and payroll to the local.
//
// One source for every screen (αρχή 3): Weekly International and Daily Ops
// read relays through loadForOrders and open the same panel; the Drivers card
// and the payroll card read a driver's track record through loadForDriver.
// Screen code only renders.
//
// Facade labels used (LOCAL MOVES map in the Worker — every one must exist
// there FOR THIS TABLE, CLAUDE.md facade trap #1):
//   written: Parent Order, Move Kind, Driver, Truck, Trailer,
//            From Location (delivery) / To Location (loading), Time From
//   read:    the same + Date, Status (+ Description in the track record)
//   NEVER written: Date and Status — 060's BEFORE trigger derives them
//   (Date = the order's customer day, Status = Pending/Assigned from Driver).
//   Typing them here would be a second source of truth for both.
//   NOT in Φ1: Handover Date (owner Q3 4/10: «παραλείπουμε αυτό το κομμάτι»).
//
// Reading: FIND/ARRAYJOIN on {Parent Order} / {Driver} — LOCAL MOVES has a
// `links` block in the Worker, so the facade turns it into <column> = <id>.
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const KINDS = ['relay_delivery', 'relay_loading'];
// Veroia Cross-Dock (CLAUDE.md special id): the default hand-over point.
const VEROIA_LOC = 'recJucKOhC1zh4IP3';
// 50 order ids per request. Measured 4/10: one FIND term on {Parent Order} is
// 58 characters raw, 80 once encoded — 50 terms ≈ 4.1 KB of URL (90 were
// ≈ 7.5 KB), far inside Cloudflare's 16 KB. A Daily Ops day is under 50
// orders (one request); a Weekly board takes two or three.
const BATCH = 50;
// Every label a screen reads from a relay row. An explicit list keeps the
// select narrow and the URL bounded (coordinator 4/10).
const FIELDS = ['Parent Order', 'Move Kind', 'Driver', 'Truck', 'Trailer', 'From Location', 'To Location', 'Time From', 'Date', 'Status'];
// The probe. After 060 move_kind is NOT NULL, so this term is always true.
// It sits in the FILTER on purpose: an unknown label in fields[] is dropped
// with 200 OK (facade trap #1), but an unknown label in a filter is the one
// facade path that is loud — a 422, logged by the Worker. So a Worker without
// the 060 map fails the read (banner, closed menu) even on a day with 0
// relays to betray it, instead of offering a save that cannot work
// (coordinator 4/10: degrade visibly against the old Worker).
const KIND_KNOWN = '{Move Kind}!=BLANK()';

function kindFor(orderFields) {
  const d = orderFields && orderFields['Direction'];
  return d === 'Import' ? 'relay_delivery' : d === 'Export' ? 'relay_loading' : null;
}
// The customer's day of the order for this kind — what 060 copies into Date.
// orders.loading/delivery_datetime are `date` columns: no time zone involved.
function orderDay(orderFields, kind) {
  if (!orderFields) return '';
  const v = kind === 'relay_delivery' ? orderFields['Delivery DateTime'] : orderFields['Loading DateTime'];
  return v ? toLocalDate(v) : '';
}
function menuLabel(kind) {
  return kind === 'relay_delivery' ? 'Παράδοση με τοπικό οδηγό' : 'Φόρτωση με τοπικό οδηγό';
}
const KIND_TAG = { relay_delivery: 'ΠΑΡΑΔΟΣΗ ΤΟΠ.', relay_loading: 'ΦΟΡΤΩΣΗ ΤΟΠ.' };

// A partner's truck runs the order: there is no own tractor for «ίδιος» and
// the partner's trailer is not on our list.
function isPartnerRun(f) {
  return !!(f && (getLinkedId(f['Partner']) || f['Is Partner Trip'] === true || f['Is Partner Trip'] === 'Yes'));
}

// Why this order cannot take a relay ('' = it can). The SAME refusals as
// 060's INSERT guard, said before the click instead of after it — the base
// stays the rule (αρχή 4), this only keeps the menu honest.
//   hidden (menu item not shown): no_direction, vs, cancelled, preorder, split_parent
//   shown disabled:               partner, no_date
// 'partner' is a Φ1 screen rule, not a base one (060 does not refuse it):
// a local relay is offered on orders our own fleet runs (DECISION_LOG
// 2026-10-04). An existing relay on such an order can still be edited.
function blockReason(orderRec, opts) {
  const f = (orderRec && orderRec.fields) || {};
  const kind = kindFor(f);
  if (!kind) return 'no_direction';
  if (f['Veroia Switch']) return 'vs';
  if (f['Status'] === 'Cancelled') return 'cancelled';
  if (typeof isPreorder === 'function' && isPreorder(f)) return 'preorder';
  if (opts && opts.isSplitParent) return 'split_parent';
  if (isPartnerRun(f)) return 'partner';
  if (!orderDay(f, kind)) return 'no_date';
  return '';
}
function isHiddenReason(r) { return !!r && r !== 'no_date' && r !== 'partner'; }

// Which order a relay belongs to, in words a dispatcher recognises: the
// Reference, else the client, with the order number to tell two of the same
// client apart, else the order number alone. Reference is empty on most
// imports (70 of 82 in review round 3, 5/10), so a menu or sub-row keyed on
// it alone named nothing. Raw text: each screen escapes it.
function orderName(orderFields) {
  const f = orderFields || {};
  const ref = String(f['Reference'] || '').trim();
  if (ref) return ref;
  const cid = getLinkedId(f['Client']);
  const c = cid && typeof getRefClients === 'function' ? getRefClients().find(r => r.id === cid) : null;
  const client = String((c && c.fields['Company Name']) || f['Client Name'] || f['Client Summary'] || '').trim();
  const no = f['Order No'] != null && f['Order No'] !== '' ? '#' + f['Order No'] : '';
  return [client, no].filter(Boolean).join(' ');
}

// «Done» is the ORDER's status, never copied into the relay (060 status CHECK).
function isDone(orderFields, kind) {
  const st = orderFields && orderFields['Status'];
  return kind === 'relay_delivery' ? st === 'Delivered' : (st === 'In Transit' || st === 'Delivered');
}

function _noKind(msg) { const e = new Error(msg); e.code = 'no_move_kind'; return e; }
// One LOCAL MOVES read for every loader: the probe's 422 said in words, the
// same check on the rows, Cancelled moves dropped (a cancelled move did not
// happen and covers nothing — 060's unique index ignores it too). THROWS on
// failure: a screen must say «δεν φορτώθηκαν», never draw an empty,
// confident «none» (αρχή 1).
async function _read(params) {
  let recs;
  try {
    recs = await atGetAll(TABLES.LOCAL_MOVES, params, false);
  } catch (e) {
    // The facade answers an unknown filter label with «Unsupported query for
    // this table»; the only label here an older Worker lacks is «Move Kind».
    if (/unsupported query/i.test(String(e && e.message))) throw _noKind('ο Worker αρνήθηκε το φίλτρο «Move Kind» — χρειάζεται ο Worker του 060');
    throw e;
  }
  // move_kind is NOT NULL in the base, so a row WITHOUT «Move Kind» means the
  // Worker map lacks the label (facade trap #2 hides NULLs and unknowns alike).
  // Guessing the kind from the order's direction would work today and lie the
  // day the rules change — refuse loudly instead.
  if (recs.some(r => !r.fields || !('Move Kind' in r.fields))) throw _noKind('ο Worker δεν επιστρέφει «Move Kind» (χρειάζεται ο χάρτης LOCAL MOVES του 060)');
  return recs.filter(r => r.fields['Status'] !== 'Cancelled');
}

// Live relays of these orders.
async function loadForOrders(ids) {
  const uniq = [...new Set((ids || []).filter(id => /^rec[A-Za-z0-9]+$/.test(String(id || ''))))];
  if (!uniq.length) return [];
  const chunks = [];
  for (let i = 0; i < uniq.length; i += BATCH) chunks.push(uniq.slice(i, i + BATCH));
  const parts = await Promise.all(chunks.map(chunk => {
    const terms = chunk.map(id => `FIND("${id}",ARRAYJOIN({Parent Order},","))>0`);
    const anyOrder = terms.length === 1 ? terms[0] : `OR(${terms.join(',')})`;
    return _read({ filterByFormula: `AND(${anyOrder},${KIND_KNOWN})`, fields: FIELDS });
  }));
  const want = new Set(uniq);
  return [].concat(...parts).filter(r => KINDS.includes(r.fields['Move Kind'])
    && want.has(getLinkedId(r.fields['Parent Order'])));
}

// orderId → { relay_delivery: rec, relay_loading: rec }
function index(recs) {
  const by = {};
  (recs || []).forEach(r => {
    const oid = getLinkedId(r.fields['Parent Order']);
    if (!oid) return;
    const slot = by[oid] = by[oid] || {};
    // 060's unique index allows ONE live relay per order and kind; a second
    // one here is a base fault worth a console line, not a silent overwrite.
    if (slot[r.fields['Move Kind']]) console.warn('[relay] two live relays of one kind on', oid, r.id);
    else slot[r.fields['Move Kind']] = r;
  });
  return by;
}

const _drv = id => (getRefDrivers().find(r => r.id === id) || {}).fields || null;
const _trk = id => (getRefTrucks().find(r => r.id === id) || {}).fields || null;
const _trl = id => (getRefTrailers().find(r => r.id === id) || {}).fields || null;
// The order forms' location cache when Weekly has loaded it, else the
// reference preload (the Drivers card and the payroll card never load forms).
const _loc = id => {
  if (!id) return '';
  const m = typeof _fhLocationsMap !== 'undefined' ? _fhLocationsMap[id] : '';
  if (m) return m;
  const r = typeof getRefLocations === 'function' ? getRefLocations().find(x => x.id === id) : null;
  return (r && (r.fields['Name'] || r.fields['City'])) || '';
};
const _short = s => String(s || '').split(',')[0].trim();
const _WD = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
// «Δευ 05/10» — the weekly boards' own day format, so a relay reads like its
// order; «Δευ 05/10/26» in a track record that spans years.
function fmtDay(iso, withYear) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d)) return iso;
  return `${_WD[d.getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}${withYear ? '/' + iso.slice(2, 4) : ''}`;
}

// Everything a screen needs to draw one relay — no HTML, each screen keeps its look.
function summary(rec, orderRec) {
  const f = rec.fields || {}, of = (orderRec && orderRec.fields) || {};
  const kind = f['Move Kind'];
  const drvId = getLinkedId(f['Driver']);
  const trkId = getLinkedId(f['Truck']);
  const trlId = getLinkedId(f['Trailer']);
  const ptId = getLinkedId(kind === 'relay_delivery' ? f['From Location'] : f['To Location']);
  const ordTrkId = getLinkedId(of['Truck']);
  const day = f['Date'] ? toLocalDate(f['Date']) : '';
  const want = orderDay(of, kind);
  return {
    kind, tag: KIND_TAG[kind] || 'ΤΟΠ.',
    day, time: f['Time From'] || '',
    driverId: drvId, driverName: drvId ? ((_drv(drvId) || {})['Full Name'] || '—') : '',
    // Truck empty = the order's own tractor (060: truck_id NULL = «ίδιος»).
    sameTractor: !trkId,
    tractor: trkId ? ((_trk(trkId) || {})['License Plate'] || '—') : ((ordTrkId && (_trk(ordTrkId) || {})['License Plate']) || ''),
    trailer: trlId ? ((_trl(trlId) || {})['License Plate'] || '—') : '',
    trailerSwap: !!(trlId && getLinkedId(of['Trailer']) && trlId !== getLinkedId(of['Trailer'])),
    point: _short(_loc(ptId)) || (ptId ? '—' : ''),
    pointDir: kind === 'relay_delivery' ? 'από' : 'προς',
    done: isDone(of, kind),
    // 060 keeps Date = the order's day; a gap means the order lost its date
    // or a trigger did not run — shown, never hidden (B-65 «day» reports it).
    dayMismatch: !!(want && day && want !== day) || !!(want && !day),
  };
}
// «ίδιο INT-1 · ρυμ. TRL-1» — one wording on the board, in Daily Ops and in
// the track record. Raw text: each screen escapes it.
function vehicleText(s) {
  return [(s.sameTractor ? 'ίδιο ' : 'άλλο ') + (s.tractor || 'φορτηγό'), s.trailer ? 'ρυμ. ' + s.trailer : ''].filter(Boolean).join(' · ');
}

// ── PANEL ───────────────────────────────────────────────────────────────
// host = { open(title, ctxLine, bodyHtml, footerHtml), close() } — the screen's
// own small panel; this module builds what goes inside it.
let _cur = null;

function _opts(list, sel, skipId, skipNote) {
  return list.map(o => {
    const dis = skipId && o.id === skipId;
    return `<option value="${escapeHtml(o.id)}"${o.id === sel ? ' selected' : ''}${dis ? ' disabled' : ''}>${escapeHtml(o.label)}${dis ? ' — ' + skipNote : ''}</option>`;
  }).join('');
}

async function openPanel(o) {
  const order = o.order, of = order.fields || {};
  const kind = o.kind || kindFor(of);
  const existing = o.existing || null;
  const ef = (existing && existing.fields) || {};
  if (typeof fhLoadLocations === 'function') await fhLoadLocations();

  const byName = (a, b) => a.label.localeCompare(b.label, 'el');
  const drvVal = existing ? getLinkedId(ef['Driver']) : '';
  const trkVal = existing ? getLinkedId(ef['Truck']) : '';
  // Active ones only — plus whoever the relay already names: an edit must
  // never open on «ΠΡΟΣ ΑΝΑΘΕΣΗ» because its driver went inactive, or the
  // save would clear him without anyone choosing that.
  // An External driver is named as such: the relay creates a ΤΟΠΙΚΟ payroll
  // line for whoever is picked, so the choice must be a conscious one.
  const drivers = getRefDrivers().filter(r => r.fields['Active'] || r.id === drvVal)
    .map(r => ({ id: r.id, label: (r.fields['Full Name'] || r.id) + (r.fields['Type'] === 'External' ? ' (εξωτ.)' : '') + (r.fields['Active'] ? '' : ' (ανενεργός)') })).sort(byName);
  const ordTrk = getLinkedId(of['Truck']), ordTrl = getLinkedId(of['Trailer']), ordDrv = getLinkedId(of['Driver']);
  // «Άλλος» never lists the order's own tractor: that is «ίδιος» (truck NULL),
  // and the same plate typed as «other» is what B-65 calls truck-copy.
  const trucks = getRefTrucks().filter(r => (r.fields['Active'] || r.id === trkVal) && (r.id !== ordTrk || r.id === trkVal))
    .map(r => ({ id: r.id, label: r.fields['License Plate'] || r.id })).sort(byName);
  const trailers = getRefTrailers().map(r => ({ id: r.id, label: r.fields['License Plate'] || r.id })).sort(byName);

  // The trip keeps ONE trailer (rt_sync); what the local pulls is recorded on
  // the relay. Prefilled with the order's, changeable for a drop-and-hook.
  const trlVal = existing ? getLinkedId(ef['Trailer']) : ordTrl;
  const ptLabel = kind === 'relay_delivery' ? 'From Location' : 'To Location';
  const ptVal = existing ? getLinkedId(ef[ptLabel]) : VEROIA_LOC;
  const timeVal = ef['Time From'] || '';

  const intlName = ordDrv ? ((_drv(ordDrv) || {})['Full Name'] || '—') : '';
  const intlPlate = ordTrk ? ((_trk(ordTrk) || {})['License Plate'] || '') : '';
  const intl = [intlName, intlPlate].filter(Boolean).join(' · ');
  const dayTxt = fmtDay(orderDay(of, kind));
  const isDel = kind === 'relay_delivery';
  // A partner-run order (a relay made before the partner was assigned): no
  // own tractor exists, so «ίδιος» would record the partner's truck as ours.
  const partnerRun = isPartnerRun(of);
  // An order with no tractor yet: «ίδιος» stays allowed — it is read live, so
  // it becomes whatever tractor the order gets, and a relay is often planned
  // before the international is assigned (a disabled «ίδιος» would force a
  // tractor onto a «ΠΡΟΣ ΑΝΑΘΕΣΗ» relay). But it is said, next to the choice:
  // until the order is assigned the local has no vehicle, and the auditor's
  // B-65 «no-vehicle» reports it from the day before (review round 3, 5/10).
  const noOrdTrk = !ordTrk && !partnerRun;
  const ptnId = getLinkedId(of['Partner']);
  const ptnName = ptnId && typeof getRefPartners === 'function' ? ((getRefPartners().find(r => r.id === ptnId) || {}).fields || {})['Company Name'] || '' : '';
  const useOther = !!trkVal || partnerRun;
  const note = partnerRun
    ? `Την παραγγελία την εκτελεί συνεργάτης${ptnName ? ` (<b>${escapeHtml(ptnName)}</b>)` : ''}· ο τοπικός καταγράφεται χωριστά, μόνο με δικό μας τράκτορα.`
    : `Ο διεθνής${intl ? ` (<b>${escapeHtml(intl)}</b>)` : ' (δεν έχει ανατεθεί ακόμη)'} μένει στην παραγγελία και στο δρομολόγιο· ο τοπικός καταγράφεται χωριστά.`;

  _cur = { order, kind, existing, host: o.host, onDone: o.onDone, busy: false, ptLabel, ordDrv, partnerRun };

  // OWNER-Q2 answered 4/10 (both: salary = track record only, per_trip = daily
  // ΤΟΠΙΚΟ line): the local is «recorded separately» — whether that record
  // also pays him is the payroll's business (drivers.pay_basis), never shown
  // here: the dispatcher never sees payroll.
  // Compact on purpose: the host panel is ~360px wide and capped in height,
  // and a scrolled panel hides its own title and save button.
  const lbl = 'display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text);white-space:nowrap';
  const body = `
    <div class="wn3-pnote">${note}</div>
    <div class="wi-panel-fields" style="flex-direction:column;align-items:stretch;gap:8px" oninput="Relay._err('')" onchange="Relay._err('')">
      <div id="rly_day" style="display:flex;align-items:baseline;gap:6px;font-size:13px;color:var(--text)"><span class="wi-plbl">${isDel ? 'Παράδοση στον πελάτη' : 'Φόρτωση'}</span>
        <b>${escapeHtml(dayTxt)}</b> <small style="color:var(--text-dim)">από την παραγγελία</small></div>
      <div class="wi-pf"><span class="wi-plbl">Τοπικός οδηγός</span>
        <select class="form-select" id="rly_drv"><option value="">— ΠΡΟΣ ΑΝΑΘΕΣΗ —</option>${_opts(drivers, drvVal, ordDrv, 'ο διεθνής της παραγγελίας')}</select></div>
      <div class="wi-pf"><span class="wi-plbl">Τράκτορας</span>
        <div style="display:flex;align-items:center;gap:10px">
          <label style="${lbl}${partnerRun ? ';opacity:.5' : ''}"${partnerRun ? ' title="Ο τράκτορας της παραγγελίας είναι του συνεργάτη"' : ''}><input type="radio" name="rly_tm" value="same"${useOther ? '' : ' checked'}${partnerRun ? ' disabled' : ''} onchange="Relay._tm()"> ίδιος${intlPlate ? ' (' + escapeHtml(intlPlate) + ')' : noOrdTrk ? ' (κανένας ακόμη)' : ''}</label>
          <label style="${lbl}"><input type="radio" name="rly_tm" value="other"${useOther ? ' checked' : ''} onchange="Relay._tm()"> άλλος</label>
          <select class="form-select" id="rly_trk" style="flex:1;min-width:0"${useOther ? '' : ' disabled'}><option value="">—</option>${_opts(trucks, trkVal)}</select>
        </div>${noOrdTrk ? `<div id="rly_notrk" role="note"${useOther ? ' hidden' : ''} style="font-size:12px;font-weight:600;color:var(--danger);line-height:1.3;margin-top:3px">Η παραγγελία δεν έχει ακόμη τράκτορα — με «ίδιος» ο τοπικός μένει χωρίς όχημα μέχρι να ανατεθεί.</div>` : ''}</div>
      <div style="display:flex;gap:8px">
        <div class="wi-pf" style="flex:1;min-width:0"><span class="wi-plbl">Ρυμούλκα</span>
          <select class="form-select" id="rly_trl"><option value="">—</option>${_opts(trailers, trlVal)}</select></div>
        <div class="wi-pf" style="flex:0 0 92px"><span class="wi-plbl">Ώρα</span>
          <input class="form-input" id="rly_time" placeholder="07:00" value="${escapeHtml(timeVal)}"></div>
      </div>
      <div class="wi-pf"><span class="wi-plbl">${isDel ? 'Από — πού παραλαμβάνει ο τοπικός το φορτηγό' : 'Προς — πού παραδίδει ο τοπικός το φορτηγό'}</span>
        ${fhLocSelect('rly_pt', ptVal)}</div>
    </div>`;
  // The refusal sits next to the save button: the body never grows, so the
  // panel never scrolls its own buttons away at the moment they matter.
  const footer = `<span id="rly_err" role="alert" hidden style="flex:1;min-width:0;font-size:12px;font-weight:600;color:var(--danger);line-height:1.3"></span>
    <button class="btn btn-ghost" onclick="Relay._close()">Άκυρο</button>
    <button class="btn btn-success" id="rly_submit" onclick="Relay._submit()">${existing ? 'Αποθήκευση' : 'Καταχώρηση'}</button>`;
  const name = orderName(of);
  const ctx = `${escapeHtml(name)}${name ? ' · ' : ''}${escapeHtml(_short(of['Loading Summary']) || '—')} → ${escapeHtml(_short(of['Delivery Summary']) || '—')}`;
  o.host.open(existing ? (isDel ? 'Τοπική παράδοση — αλλαγή' : 'Τοπική φόρτωση — αλλαγή') : menuLabel(kind), ctx, body, footer);
}

function _tm() {
  const other = (document.querySelector('input[name="rly_tm"]:checked') || {}).value === 'other';
  const sel = document.getElementById('rly_trk');
  if (sel) { sel.disabled = !other; if (!other) sel.value = ''; }
  const warn = document.getElementById('rly_notrk');
  if (warn) warn.hidden = other;
}
function _err(msg) {
  const el = document.getElementById('rly_err');
  if (!el) return;
  el.hidden = !msg; el.textContent = msg || '';
}
function _close() { const c = _cur; _cur = null; if (c && c.host) c.host.close(); }

async function _submit() {
  const c = _cur; if (!c || c.busy) return;
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const drv = v('rly_drv');
  const other = (document.querySelector('input[name="rly_tm"]:checked') || {}).value === 'other';
  const trk = other ? v('rly_trk') : '';
  const trl = v('rly_trl');
  const pt = v('lv_rly_pt');
  const time = v('rly_time');
  // Same rules as 060's CHECKs, said in the panel before the round trip.
  if (!pt) return _err(c.kind === 'relay_delivery' ? 'Διάλεξε από πού παραλαμβάνει ο τοπικός το φορτηγό.' : 'Διάλεξε πού παραδίδει ο τοπικός το φορτηγό.');
  if (other && !trk) return _err(c.partnerRun ? 'Διάλεξε τον δικό μας τράκτορα — την παραγγελία την εκτελεί συνεργάτης.' : 'Διάλεξε τον άλλο τράκτορα — ή «ίδιος με της παραγγελίας».');
  if (drv && !trl) return _err('Με τοπικό οδηγό η ρυμούλκα γράφεται πάντα — διάλεξέ την.');
  if (drv && drv === c.ordDrv) return _err('Ο τοπικός δεν μπορεί να είναι ο ίδιος ο διεθνής της παραγγελίας.');
  if (time && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) return _err('Η ώρα γράφεται ΩΩ:ΛΛ, π.χ. 07:00.');
  _err('');

  const orderId = c.order.id;
  const isEdit = !!c.existing;
  const fields = {};
  if (!isEdit) { fields['Parent Order'] = [orderId]; fields['Move Kind'] = c.kind; }
  // On edit an empty choice sends [] / null so the facade writes NULL — an
  // omitted label would keep the old driver/tractor and look saved (200 OK).
  if (drv) fields['Driver'] = [drv]; else if (isEdit) fields['Driver'] = [];
  if (trk) fields['Truck'] = [trk]; else if (isEdit) fields['Truck'] = [];
  if (trl) fields['Trailer'] = [trl]; else if (isEdit) fields['Trailer'] = [];
  fields[c.ptLabel] = [pt];
  if (time) fields['Time From'] = time; else if (isEdit) fields['Time From'] = null;

  c.busy = true;
  const btn = document.getElementById('rly_submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Αποθήκευση…'; }
  let id;
  try {
    // No toolbar Undo for a relay: it would re-write from the cache without
    // this read-back (an absent Truck there means «ίδιος», which an undo
    // cannot send back) and label itself with the raw record id. The relay's
    // own doors (edit, delete) are the way back.
    const rec = isEdit
      ? await atSuppressUndo(atPatch)(TABLES.LOCAL_MOVES, c.existing.id, fields)
      : await atCreate(TABLES.LOCAL_MOVES, fields, { noUndo: true });
    id = isEdit ? c.existing.id : rec && rec.id;
    if (!id) throw new Error('χωρίς αναγνωριστικό εγγραφής');
  } catch (e) {
    // A 422 from the Worker carries the base's refusal in Greek (HINT
    // local_relay:<code>); api.js already toasted it — here it stays in the
    // panel next to the fields, and the panel stays open to fix it.
    c.busy = false;
    if (_cur !== c) return;   // panel already closed: api.js's toast is the message
    if (btn) { btn.disabled = false; btn.textContent = isEdit ? 'Αποθήκευση' : 'Καταχώρηση'; }
    _err('Δεν αποθηκεύτηκε: ' + ((e && e.message) || 'άγνωστο σφάλμα'));
    return;
  }
  // αρχή 2: the POST's 200 proves nothing — an unmapped label is dropped with
  // 200 OK. Read the row back and check every label sent, plus what the base
  // must have derived (Date = order day, Status from the driver).
  let problems;
  try {
    const back = await atGetOne(TABLES.LOCAL_MOVES, id);
    problems = verify(back, { orderId, kind: c.kind, drv, trk, trl, ptLabel: c.ptLabel, pt, time, day: orderDay(c.order.fields, c.kind) });
  } catch (e) {
    problems = ['ανάγνωση: ' + ((e && e.message) || 'απέτυχε')];
  }
  // Close only the panel this save came from: if the user closed it and
  // opened another relay meanwhile, that one stays open (and keeps _cur).
  if (_cur === c) _close();
  if (typeof c.onDone === 'function') c.onDone({ id, created: !isEdit, ok: !problems.length, problems, orderId });
}

// Labels that did not land as sent, in the dispatcher's words. Exported for the rig.
function verify(back, want) {
  const f = (back && back.fields) || {};
  const p = [];
  const link = l => getLinkedId(f[l]) || '';
  if (link('Parent Order') !== want.orderId) p.push('Παραγγελία');
  if (f['Move Kind'] !== want.kind) p.push('Είδος');
  if (link('Driver') !== (want.drv || '')) p.push('Οδηγός');
  if (link('Truck') !== (want.trk || '')) p.push('Τράκτορας');
  if (link('Trailer') !== (want.trl || '')) p.push('Ρυμούλκα');
  if (link(want.ptLabel) !== want.pt) p.push(want.kind === 'relay_delivery' ? 'Από' : 'Προς');
  if ((f['Time From'] || '') !== (want.time || '')) p.push('Ώρα');
  if (want.day && toLocalDate(f['Date'] || '') !== want.day) p.push('Ημέρα (η βάση δεν την πήρε από την παραγγελία)');
  if (f['Status'] !== (want.drv ? 'Assigned' : 'Pending')) p.push('Κατάσταση (η βάση δεν την υπολόγισε)');
  return p;
}

// Soft delete through the facade. The DELETE's 200 is not the proof that the
// row left the live set: the caller re-reads the relays and judges from that
// read (and says so apart when only the re-read failed).
async function remove(id) {
  await atDelete(TABLES.LOCAL_MOVES, id);
}

// ── TRACK RECORD (a driver's local moves) ─────────────────────────────────
// The owner pays some drivers a fixed salary and others per trip, and wants
// «a track record for every driver, knowing what he did on those days». The
// track record IS the local_moves rows (relays and Weekly National's plain
// errands) — no copy, no amounts ever: the Drivers card shows it to every
// role that sees drivers, the payroll card next to the ledger.
// → newest first: { id, date, kind, rec, order } (order: Order No / Truck /
//   Trailer of a relay's order, null for a plain move).
async function loadForDriver(driverRecId) {
  // Plates and place names come from the shared reference cache. The Drivers
  // page can draw its card before the app's start-up preload has landed
  // (measured in the rig: every plate read «—»), so wait for it here — one
  // shared promise, a no-op once loaded.
  const [recs] = await Promise.all([_read({
    filterByFormula: `AND(FIND("${driverRecId}",ARRAYJOIN({Driver},","))>0,${KIND_KNOWN})`,
    fields: FIELDS.concat(['Description']), sort: [{ field: 'Date', direction: 'desc' }]
  }), typeof preloadReferenceData === 'function' ? preloadReferenceData() : null]);
  // The order number (Order No = the order's own id, owner 7/9) and its
  // tractor: «ίδιο» means the order's tractor, read live, never copied.
  const parents = [...new Set(recs.map(r => getLinkedId(r.fields['Parent Order'])).filter(Boolean))];
  const orders = {};
  for (let b = 0; b < parents.length; b += BATCH) {
    const ff = `OR(${parents.slice(b, b + BATCH).map(id => `RECORD_ID()="${id}"`).join(',')})`;
    (await atGetAll(TABLES.ORDERS, { filterByFormula: ff, fields: ['Order No', 'Truck', 'Trailer'] }, false))
      .forEach(o => { orders[o.id] = o; });
  }
  return recs.map(r => ({ id: r.id, date: r.fields['Date'] ? toLocalDate(r.fields['Date']) : '', kind: r.fields['Move Kind'],
    rec: r, order: orders[getLinkedId(r.fields['Parent Order'])] || null }));
}
// «Παράδοση 415» / «Φόρτωση 431» / «Τοπική κίνηση · <description>». Raw text.
function _histWhat(h) {
  const no = h.order && h.order.fields['Order No'] != null ? String(h.order.fields['Order No']) : '—';
  if (h.kind === 'relay_delivery') return 'Παράδοση ' + no;
  if (h.kind === 'relay_loading') return 'Φόρτωση ' + no;
  const d = h.rec.fields['Description'];
  return 'Τοπική κίνηση' + (d ? ' · ' + d : '');
}
// [vehicle, place] — a relay in the board's words (vehicleText, «από/προς
// <hand-over point>»); a plain errand with its own truck and from → to.
function _histVehPlace(h) {
  const f = h.rec.fields;
  if (KINDS.includes(h.kind)) {
    const s = summary(h.rec, h.order);
    return [vehicleText(s), s.point ? s.pointDir + ' ' + s.point : ''];
  }
  const trk = getLinkedId(f['Truck']), trl = getLinkedId(f['Trailer']);
  const veh = [trk ? ((_trk(trk) || {})['License Plate'] || '—') : '', trl ? 'ρυμ. ' + ((_trl(trl) || {})['License Plate'] || '—') : ''].filter(Boolean).join(' · ');
  const place = [_short(_loc(getLinkedId(f['From Location']))), _short(_loc(getLinkedId(f['To Location'])))].filter(Boolean).join(' → ');
  return [veh, place];
}
const _e = s => escapeHtml(String(s || ''));
// rows → <table> (the payroll card). Classes only (lh-*), see HISTORY_CSS.
function historyTableHtml(rows) {
  return `<table class="lh-t"><thead><tr><th>Ημέρα</th><th>Κίνηση</th><th>Όχημα</th><th>Σημείο</th><th>Ώρα</th></tr></thead><tbody>${
    rows.map(h => { const [veh, place] = _histVehPlace(h), t = h.rec.fields['Time From'];
      return `<tr data-lm="${_e(h.id)}"><td>${fmtDay(h.date, true)}</td><td>${_e(_histWhat(h))}</td><td>${_e(veh) || '—'}</td><td>${_e(place) || '—'}</td><td>${t ? _e(t) : '—'}</td></tr>`; }).join('')
  }</tbody></table>`;
}
// Narrow hosts (the Drivers side card, ~440px): two lines per move instead of
// five columns, which wrapped every cell onto four lines there.
function historyListHtml(rows) {
  return `<div class="lh-l">${rows.map(h => {
    const [veh, place] = _histVehPlace(h), t = h.rec.fields['Time From'];
    return `<div class="lh-i" data-lm="${_e(h.id)}"><div class="lh-a"><b>${_e(_histWhat(h))}</b><span>${fmtDay(h.date, true)}${t ? ' · ' + _e(t) : ''}</span></div>`
      + `<div class="lh-b">${_e([veh, place].filter(Boolean).join(' · ')) || '—'}</div></div>`;
  }).join('')}</div>`;
}
const HISTORY_CSS = `<style>
  .lh-i{padding:6px 0;border-bottom:1px solid var(--border)}
  .lh-i:last-child{border-bottom:0}
  .lh-a{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--text)}
  .lh-a b{font-weight:600}
  .lh-a span{font-size:12px;color:var(--text-dim);white-space:nowrap;font-variant-numeric:tabular-nums}
  .lh-b{font-size:12px;color:var(--text-mid)}
  .lh-t{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
  .lh-t th{text-align:left;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-mid);padding:4px 8px;border-bottom:1px solid var(--border)}
  .lh-t td{padding:4px 8px;border-bottom:1px solid var(--border);color:var(--text)}
  .lh-t tr:last-child td{border-bottom:0}
</style>`;

const Relay = { KINDS, kindFor, orderDay, fmtDay, menuLabel, orderName, blockReason, isHiddenReason, isPartnerRun, isDone,
  loadForOrders, index, summary, vehicleText, openPanel, verify, remove,
  loadForDriver, historyTableHtml, historyListHtml, HISTORY_CSS, _submit, _close, _tm, _err };
if (typeof window !== 'undefined') window.Relay = Relay;
if (typeof module !== 'undefined' && module.exports) module.exports = Relay;
})();
