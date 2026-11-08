// ═══════════════════════════════════════════════════════════════
// P&L PAPERS — «Αποτέλεσμα δρομολογίου» (A4 portrait, Figma 2542:7735) and
// «Αποτέλεσμα δρομολογίων εβδομάδας» (A4 landscape, Figma 2537:7735).
// Approved by the owner 3/11/2026 («Ναι, εγκρίνω»); design and rules:
// docs/design/prints-pnl-week-2026-11-03.md. Owner only (answer 1).
//
// Pure functions: data in (GET /costs/pnl-paper, GET /costs/lookups), HTML out.
// print_pnl.html loads this file; tests/pnl-paper.test.js runs it in node.
//
// The paper computes NOTHING of its own (principle 3): every amount is a row of
// the 105 views (ct_v_rt_complete, ct_v_rt_cost_cat, ct_v_rt_revenue_legs) or of
// ct_v_rt_pnl. It only lays the rows out, and PROVES that its rows add up to
// ct_v_rt_pnl (revenue, cost_net, cost_vat) to the cent. A row set that does not
// add up = no paper, and the page says which trip (principle 1): a printed sum
// that disagrees with the screen would be believed.
//
// Owner rules (3/11): «complete» = trip expenses + driver value (ct_v_rt_complete,
// the one rule in the database); result WITH the VAT of the expenses
// (profit_worst); anything missing → «—», never «up to X»; every expense
// category on its own row, tolls per country (MK = «Σκόπια»).
// ═══════════════════════════════════════════════════════════════
'use strict';

// The expense categories in the order of the approved frame (Α1). Labels come
// from CT_CATEGORY_LABELS (modules/costs.js) — one list, never a copy here.
const PNLP_CAT_ORDER = ['fuel', 'reefer_fuel', 'tolls', 'dkv', 'adblue', 'ferry_train', 'accommodation', 'spedition',
  'fines', 'restatement', 'fixed_alloc', 'other'];
// fixed_alloc (Tier-2) has no row unless a trip carries it: it is not an expense
// someone forgets to enter, so a «—» row for it would be noise on every paper.
const PNLP_CAT_ALWAYS = new Set(PNLP_CAT_ORDER.filter(c => c !== 'fixed_alloc'));
const PNLP_MISSING_WORD = { fuel: 'καύσιμα', tolls: 'διόδια', driver: 'αξία οδηγού', partner_rate: 'κόμιστρο συνεργάτη',
  price: 'τιμή φορτίου', trip_type: 'τύπος δρομολογίου' };
const PNLP_WEEKDAY = ['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σάβ'];

const pnlpEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pnlpCents = n => Math.round(Number(n || 0) * 100);
const pnlpNum = n => n != null && n !== '' && Number.isFinite(Number(n));
// 1.234,50 — no € in the cells (the column says «€»); a loss in parentheses,
// the same convention as the TRIP PnL screen (ctEurP).
function pnlpAmt(n) {
  if (!pnlpNum(n)) return '—';
  const v = Number(n);
  const s = Math.abs(v).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? '(' + s + ')' : s;
}
function pnlpPct(n) {
  if (!pnlpNum(n)) return '—';
  const v = Number(n);
  const s = Math.abs(v).toLocaleString('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  return v < 0 ? '(' + s + ')' : s;
}
function pnlpDate(s) {
  const p = String(s || '').slice(0, 10).split('-');
  return p.length === 3 && p[0] ? { y: p[0], m: p[1], d: p[2] } : null;
}
const pnlpDM = s => { const d = pnlpDate(s); return d ? d.d + '/' + d.m : '—'; };
const pnlpDMY = s => { const d = pnlpDate(s); return d ? d.d + '/' + d.m + '/' + d.y : '—'; };
// «17–22/10», «28/10–02/11», «17/10» — the days of a trip in one cell
function pnlpSpan(a, b) {
  const x = pnlpDate(a), y = pnlpDate(b);
  if (!x) return '—';
  if (!y || (x.d === y.d && x.m === y.m)) return x.d + '/' + x.m;
  return x.m === y.m ? x.d + '–' + y.d + '/' + y.m : x.d + '/' + x.m + '–' + y.d + '/' + y.m;
}
function pnlpWeekday(s) {
  const d = pnlpDate(s);
  return d ? PNLP_WEEKDAY[new Date(Number(d.y), Number(d.m) - 1, Number(d.d), 12).getDay()] : '';
}
// «Επώνυμο Α.» (design §5.7): the database keeps «Επώνυμο Όνομα»
function pnlpDriverShort(full) {
  const p = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '';
  return p.length === 1 ? p[0] : p[0] + ' ' + p[1].charAt(0) + '.';
}
function pnlpCountry(code) {
  if (!code) return 'χωρίς χώρα';
  if (String(code).trim().toUpperCase() === 'MK') return 'Σκόπια';   // owner 3/11: «διόδια Σκοπίων»
  return typeof countryName === 'function' ? countryName(code) : String(code);
}
function pnlpCatLabel(cat) {
  const labels = typeof CT_CATEGORY_LABELS === 'object' && CT_CATEGORY_LABELS ? CT_CATEGORY_LABELS : {};
  return labels[cat] || cat;
}
const pnlpById = rows => { const m = {}; (rows || []).forEach(r => { m[r.id] = r; }); return m; };
const pnlpByRt = rows => { const m = {}; (rows || []).forEach(r => { (m[r.rt_id] = m[r.rt_id] || []).push(r); }); return m; };
const pnlpOneByRt = rows => { const m = {}; (rows || []).forEach(r => { if (!(r.rt_id in m)) m[r.rt_id] = r; }); return m; };

function pnlpTruck(lk, id) { const r = ((lk && lk.trucks) || []).find(x => x.id === id); return r ? r.license_plate : ''; }
function pnlpDriver(lk, id) { const r = ((lk && lk.drivers) || []).find(x => x.id === id); return r ? pnlpDriverShort(r.full_name) : ''; }
function pnlpPartner(lk, id) { const r = ((lk && lk.partners) || []).find(x => x.id === id); return r ? r.company_name : ''; }
// The name of a trip for a person (never a code): «IAZ4445 · 22/08», «Trans Balkan · 17/10»
function pnlpTripName(t, lk) {
  const who = t.trip_type === 'PARTNER' ? pnlpPartner(lk, t.partner_id) : pnlpTruck(lk, t.truck_id);
  return (who || 'δρομολόγιο') + ' · ' + pnlpDM(t.date_start);
}
// The words of the TRIP PnL screen (ctStatusBadge), so paper and screen agree
function pnlpStatus(t, legsN) {
  return t.status === 'complete' ? 'Οριστικό' : t.status === 'closed' ? 'Ολοκληρώθηκε'
    : (legsN || t.status === 'in_progress') ? 'Σε εξέλιξη' : 'Σχεδιασμένο';
}

function pnlpIndex(d) {
  return {
    trips: d.trips || [], complete: pnlpOneByRt(d.complete), cat: pnlpByRt(d.cost_cat), costs: pnlpOneByRt(d.costs),
    rts: pnlpById(d.rts), pc: pnlpByRt(d.partner_cost), legs: pnlpByRt(d.legs), revLegs: pnlpByRt(d.revenue_legs), v5: pnlpByRt(d.v5_lines),
    orders: pnlpById(d.orders), natLoads: pnlpById(d.nat_loads), natOrders: pnlpById(d.nat_orders),
    clients: pnlpById(d.clients), locs: pnlpById(d.locations)
  };
}

// The money of ONE trip, split the way the paper shows it. Every euro of
// ct_v_rt_costs.lines_net + wear lands in exactly one place:
//   categories (ct_v_rt_cost_cat, without partner_rate) · partner · driver value ·
//   driver expenses · wear.
// partner: the rule of ct_v_rt_costs (073) — a v5 trip (model 2) the v5 partner
// cost, otherwise the invoice when there is one, else the planned rate. That rule
// is the database's; the paper repeats it only to SHOW the amount, and the check
// below refuses the paper the day the two disagree (measured 8/11: 0 of 257 trips).
function pnlpMoney(t, ix) {
  const id = t.id;
  const costs = ix.costs[id];
  const rt = ix.rts[id];
  if (!costs || !rt) return { error: 'λείπουν τα κόστη του' };
  const byCat = {};
  let partnerLineVat = 0, partnerLines = 0;
  (ix.cat[id] || []).forEach(c => {
    if (c.category === 'partner_rate') { partnerLineVat += Number(c.vat || 0); partnerLines += Number(c.lines || 0); return; }
    const k = byCat[c.category] = byCat[c.category] || { lines: 0, net: 0, vat: 0, countries: [] };
    k.lines += Number(c.lines || 0); k.net += Number(c.net || 0); k.vat += Number(c.vat || 0);
    if (c.category === 'tolls') k.countries.push({ code: c.toll_country, lines: Number(c.lines || 0), net: Number(c.net || 0), vat: Number(c.vat || 0) });
  });
  const pcSum = (ix.pc[id] || []).reduce((a, r) => a + Number(r.cost || 0), 0);
  const invoiced = Number(costs.partner_invoiced || 0), planned = Number(costs.partner_planned || 0);
  const partner = rt.model === 2 ? pcSum : (invoiced !== 0 ? invoiced : planned);
  const driverValue = costs.dl_trip_value, driverExp = costs.dl_expenses;
  const wear = Number(costs.wear || 0);
  const catNet = Object.values(byCat).reduce((a, k) => a + k.net, 0);
  const catVat = Object.values(byCat).reduce((a, k) => a + k.vat, 0);
  const net = catNet + partner + Number(driverValue || 0) + Number(driverExp || 0) + wear;
  const vat = catVat + partnerLineVat;
  let error = null;
  if (pnlpCents(net) !== pnlpCents(t.cost_net)) error = `τα κόστη του αθροίζουν ${pnlpAmt(net)} αντί για ${pnlpAmt(t.cost_net)}`;
  else if (pnlpCents(vat) !== pnlpCents(t.cost_vat)) error = `ο ΦΠΑ του αθροίζει ${pnlpAmt(vat)} αντί για ${pnlpAmt(t.cost_vat)}`;
  return { byCat, partner, partnerLines, partnerLineVat, partnerInvoiced: rt.model !== 2 && invoiced !== 0, driverValue, driverExp, wear, error };
}

function pnlpPlace(ix, id) {
  const l = ix.locs[id];
  return l ? (l.city || l.name || '') : '';
}
const pnlpFromTo = (ix, a, b) => (pnlpPlace(ix, a) || '—') + ' → ' + (pnlpPlace(ix, b) || '—');
const pnlpDir = d => /imp/i.test(String(d || '')) ? 'Εισαγωγή' : /exp/i.test(String(d || '')) ? 'Εξαγωγή' : 'Φορτίο';
function pnlpPallets(o) {
  let s = 0, any = false;
  for (let i = 1; i <= 10; i++) { const v = o['loading_pallets_' + i]; if (pnlpNum(v)) { s += Number(v); any = true; } }
  return any ? s : null;
}
// From → to of a trip, for the week paper: its first leg in order; a v5 national
// trip (no legs) its first national order
function pnlpRoute(t, ix) {
  for (const v of (ix.v5[t.id] || [])) {
    const n = v.nat_order_id != null ? ix.natOrders[v.nat_order_id] : null;
    if (n && (n.pickup_location_1_id != null || n.delivery_location_1_id != null)) return pnlpFromTo(ix, n.pickup_location_1_id, n.delivery_location_1_id);
  }
  for (const l of (ix.legs[t.id] || [])) {
    const o = l.order_id != null ? ix.orders[l.order_id] : null;
    if (o && (o.loading_location_1_id != null || o.unloading_location_1_id != null)) return pnlpFromTo(ix, o.loading_location_1_id, o.unloading_location_1_id);
    const n = l.nat_load_id != null ? ix.natLoads[l.nat_load_id] : null;
    if (n && (n.pickup_location_1_id != null || n.delivery_location_1_id != null)) return pnlpFromTo(ix, n.pickup_location_1_id, n.delivery_location_1_id);
  }
  return '—';
}

// ── Α1 · one trip ──────────────────────────────────────────────
// → { ok, refused: [reasons], ...the rows }
function pnlTripModel(data, lookups) {
  const ix = pnlpIndex(data || {});
  const t = ix.trips[0];
  if (!t) return { ok: false, refused: ['Το δρομολόγιο δεν βρέθηκε'] };
  const name = pnlpTripName(t, lookups);
  const cmp = ix.complete[t.id];
  const refused = [];
  if (!cmp) refused.push(`${name}: λείπει ο κανόνας «πλήρες» του δρομολογίου`);
  const money = pnlpMoney(t, ix);
  if (money.error) refused.push(`${name}: ${money.error}`);
  const missing = new Set((cmp && cmp.missing) || []);

  // Revenue: one row per load, the Veroia Switch money on its own row (design §4.2)
  const rev = [];
  let revSum = 0, priceMissing = false;
  (ix.revLegs[t.id] || []).forEach(l => {
    revSum += Number(l.rev_intl || 0) + Number(l.rev_natl || 0);
    if (l.source === 'v5') {
      const n = ix.natOrders[l.nat_order_id] || {};
      const c = ix.clients[n.client_id];
      const amount = pnlpNum(l.rev_natl) && Number(l.rev_natl) !== 0 ? Number(l.rev_natl) : null;
      if (l.missing) priceMissing = true;
      rev.push({ days: pnlpSpan(n.loading_datetime, n.delivery_datetime), load: 'Εθνικό · ' + pnlpFromTo(ix, n.pickup_location_1_id, n.delivery_location_1_id),
        client: c ? c.company_name : '', pallets: pnlpNum(n.pallets) ? Number(n.pallets) : null, amount, dag: !!l.missing });
      return;
    }
    if (l.order_id != null) {
      const o = ix.orders[l.order_id] || {};
      const c = ix.clients[o.client_id];
      // 0 = no price (owner 13/10); a split order's second leg carries none by design (no †)
      const price = pnlpNum(l.intl_price) && Number(l.intl_price) !== 0 ? Number(l.intl_price) : null;
      const dag = l.carries_price !== false && price == null;
      if (dag) priceMissing = true;
      rev.push({ days: pnlpSpan(o.loading_datetime, o.delivery_datetime), load: pnlpDir(o.direction) + ' · ' + pnlpFromTo(ix, o.loading_location_1_id, o.unloading_location_1_id),
        client: c ? c.company_name : '', pallets: pnlpPallets(o), amount: price, dag,
        note: l.carries_price === false && price == null ? 'β΄ σκέλος · η τιμή στο α΄' : '' });
      if (Number(l.intl_vs_charge || 0) !== 0) rev.push({ sub: true, load: 'Χρέωση Βέροιας (εσωτερική μεταφορά)', amount: -Number(l.intl_vs_charge) });
      return;
    }
    if (l.nat_load_id != null) {
      const n = ix.natLoads[l.nat_load_id] || {};
      const price = Number(l.natl_price || 0), vs = Number(l.natl_vs_income || 0);
      rev.push({ days: pnlpSpan(n.loading_datetime, n.delivery_datetime), load: 'Εθνικό · ' + pnlpFromTo(ix, n.pickup_location_1_id, n.delivery_location_1_id),
        client: n.client || '', pallets: pnlpNum(n.total_pallets) ? Number(n.total_pallets) : null,
        amount: price !== 0 ? price : null, dag: false, note: price === 0 && vs === 0 ? 'χωρίς αξία' : '' });
      if (vs !== 0) rev.push({ sub: true, load: 'Έσοδο Βέροιας (εσωτερική μεταφορά)', amount: vs });
    }
  });
  if (pnlpCents(revSum) !== pnlpCents(t.revenue)) refused.push(`${name}: τα φορτία αθροίζουν ${pnlpAmt(revSum)} αντί για ${pnlpAmt(t.revenue)} έσοδα`);

  // Costs: every category on its own row (owner 3/11), tolls per country
  const owned = t.trip_type === 'OWNED';
  const costs = [];
  if (!money.error) {
    const known = new Set(PNLP_CAT_ORDER);
    PNLP_CAT_ORDER.concat(Object.keys(money.byCat).filter(c => !known.has(c)).sort()).forEach(cat => {
      const k = money.byCat[cat];
      if (!k && !PNLP_CAT_ALWAYS.has(cat)) return;
      const miss = (cat === 'fuel' && missing.has('fuel')) || (cat === 'tolls' && missing.has('tolls'));
      // a partner's fuel / tolls are his costs, not ours missing: blank, not «—» (design §5.1)
      const na = !owned && !k && (cat === 'fuel' || cat === 'reefer_fuel' || cat === 'tolls');
      costs.push({ label: pnlpCatLabel(cat), lines: k ? k.lines : null, net: k ? k.net : null, vat: k ? k.vat : null, miss, na, bold: cat === 'tolls' && !!k });
      if (cat === 'tolls' && k) {
        k.countries.slice().sort((a, b) => b.net - a.net).forEach(c => costs.push({ sub: true, label: pnlpCountry(c.code), lines: c.lines, net: c.net, vat: c.vat }));
      }
    });
    if (!owned || money.partner !== 0 || money.partnerLines) {
      costs.push({ label: pnlpCatLabel('partner_rate'), source: money.partnerInvoiced ? 'τιμολόγιο συνεργάτη' : 'ανάθεση',
        lines: money.partnerLines || null, net: money.partner !== 0 ? money.partner : null, vat: money.partnerLineVat || null, miss: missing.has('partner_rate') });
    }
    if (owned) {
      costs.push({ label: 'Οδηγός · αξία δρομολογίου', source: 'Μισθοδοσία', lines: undefined, vat: undefined, net: pnlpNum(money.driverValue) ? Number(money.driverValue) : null, miss: missing.has('driver') });
      costs.push({ label: 'Οδηγός · έξοδα', source: 'Μισθοδοσία', lines: undefined, vat: undefined, net: pnlpNum(money.driverExp) && Number(money.driverExp) !== 0 ? Number(money.driverExp) : null });
      costs.push({ label: 'Φθορά οχήματος', source: 'χιλιόμετρα', lines: undefined, vat: undefined, net: money.wear !== 0 ? money.wear : null });
    }
  }
  const complete = !!(cmp && cmp.complete) && missing.size === 0;
  return {
    ok: refused.length === 0, refused, t, name, owned,
    vehicle: owned ? (pnlpTruck(lookups, t.truck_id) || '—') + ' · ιδιόκτητο' : (pnlpPartner(lookups, t.partner_id) || '—') + ' · συνεργάτης',
    driver: owned ? (pnlpDriver(lookups, t.driver_id) || '—') : '—',
    status: pnlpStatus(t, (ix.legs[t.id] || []).length),
    rev, revenue: Number(t.revenue || 0), priceMissing,
    costs, costNet: Number(t.cost_net || 0), costVat: Number(t.cost_vat || 0),
    complete, missing: [...missing].map(m => PNLP_MISSING_WORD[m] || m),
    result: complete ? Number(t.profit_worst) : null, margin: complete ? t.margin_worst_pct : null
  };
}

// ── Β · the trips of a week ────────────────────────────────────
// Columns as the approved frame: ΕΣΟΔΑ · ΚΑΥΣΙΜΑ (truck + reefer) · ΔΙΟΔΙΑ ·
// ΟΔΗΓΟΣ (value + expenses) · ΚΟΜΙΣΤΡΟ · ΛΟΙΠΑ (every other category and the
// wear, design §5.4: no wear column) · ΚΟΣΤΗ (= cost_net) · ΦΠΑ · ΑΠΟΤΕΛΕΣΜΑ · ΠΕΡΙΘ.
// A cell is a number, null («—»: nothing written), undefined (blank: does not
// apply — a partner's fuel, tolls, driver) or 'miss' («λείπει»).
function pnlWeekModel(data, lookups) {
  const ix = pnlpIndex(data || {});
  const refused = [];
  if (data && data.truncated) refused.push('Η εβδομάδα έχει περισσότερα δρομολόγια από όσα διαβάζει το χαρτί (120)');
  const rows = ix.trips.map(t => {
    const name = pnlpTripName(t, lookups);
    const cmp = ix.complete[t.id];
    if (!cmp) { refused.push(`${name}: λείπει ο κανόνας «πλήρες» του δρομολογίου`); return null; }
    const m = pnlpMoney(t, ix);
    if (m.error) { refused.push(`${name}: ${m.error}`); return null; }
    const missing = new Set(cmp.missing || []);
    const owned = t.trip_type === 'OWNED';
    const has = c => !!m.byCat[c];
    const catNet = c => (m.byCat[c] ? m.byCat[c].net : 0);
    const fuel = catNet('fuel') + catNet('reefer_fuel'), tolls = catNet('tolls');
    const driver = Number(m.driverValue || 0) + Number(m.driverExp || 0);
    const other = Object.keys(m.byCat).filter(c => !['fuel', 'reefer_fuel', 'tolls'].includes(c)).reduce((a, c) => a + m.byCat[c].net, 0) + m.wear;
    const driverWritten = pnlpNum(m.driverValue) || (pnlpNum(m.driverExp) && Number(m.driverExp) !== 0);
    const complete = !!cmp.complete && missing.size === 0;
    const drv = pnlpDriver(lookups, t.driver_id);
    return {
      t, owned, complete,
      days: pnlpSpan(t.date_start, t.date_end),
      who: owned ? (pnlpTruck(lookups, t.truck_id) || '—') + (drv ? ' · ' + drv : '') : (pnlpPartner(lookups, t.partner_id) || '—') + ' · συνεργάτης',
      route: pnlpRoute(t, ix),
      revenue: Number(t.revenue || 0), dag: missing.has('price'),
      fuel: missing.has('fuel') ? 'miss' : (has('fuel') || has('reefer_fuel')) ? fuel : owned ? null : undefined,
      tolls: missing.has('tolls') ? 'miss' : has('tolls') ? tolls : owned ? null : undefined,
      driver: missing.has('driver') ? 'miss' : driverWritten ? driver : owned ? null : undefined,
      partner: missing.has('partner_rate') ? 'miss' : m.partner !== 0 ? m.partner : owned ? undefined : null,
      other: other !== 0 ? other : null,
      cost: Number(t.cost_net || 0), vat: Number(t.cost_vat || 0),
      // what each column adds to the week (a «λείπει» cell adds what IS written)
      sum: { fuel, tolls, driver, partner: m.partner, other },
      result: complete ? Number(t.profit_worst) : null, margin: complete ? t.margin_worst_pct : null
    };
  }).filter(Boolean);
  const S = k => rows.reduce((a, r) => a + Number(k(r) || 0), 0);
  const full = rows.filter(r => r.complete);
  const fullRev = full.reduce((a, r) => a + r.revenue, 0), fullRes = full.reduce((a, r) => a + r.result, 0);
  const missIn = k => rows.filter(r => r[k] === 'miss').length;
  return {
    ok: refused.length === 0, refused, rows,
    total: { revenue: S(r => r.revenue), dag: rows.some(r => r.dag), fuel: S(r => r.sum.fuel), tolls: S(r => r.sum.tolls), driver: S(r => r.sum.driver),
      partner: S(r => r.sum.partner), other: S(r => r.sum.other), cost: S(r => r.cost), vat: S(r => r.vat) },
    missIn: { revenue: rows.filter(r => r.dag).length, fuel: missIn('fuel'), tolls: missIn('tolls'), driver: missIn('driver'), partner: missIn('partner') },
    full: { n: full.length, revenue: fullRev, cost: full.reduce((a, r) => a + r.cost, 0), vat: full.reduce((a, r) => a + r.vat, 0),
      result: fullRes, margin: fullRev > 0 ? Math.round(fullRes / fullRev * 1000) / 10 : null }
  };
}

// ── HTML ───────────────────────────────────────────────────────
function pnlpHead(sub, tag) {
  return '<div class="pp-head"><div><div class="pp-brand">PETRAS GROUP</div><div class="pp-sub">' + pnlpEsc(sub) + '</div></div>'
    + '<div class="pp-tag"><div>Εσωτερικό έγγραφο · μόνο ιδιοκτήτης</div><div>' + pnlpEsc(tag) + '</div></div></div>';
}
function pnlpWeekTag(dateStr) {
  const w = typeof ctWeekOf === 'function' ? ctWeekOf(dateStr) : null;
  return w ? 'Εβδομάδα ' + pnlpDM(w.start) + ' – ' + pnlpDMY(w.end) : '';
}
const PNLP_MISS = '<span class="pp-miss">λείπει</span>';
function pnlpCell(v) {
  if (v === 'miss') return '<td class="r">' + PNLP_MISS + '</td>';
  if (v === undefined) return '<td class="r"></td>';
  return '<td class="r">' + pnlpAmt(v) + '</td>';
}
// The refusal page: what could not be printed and why — never a half paper
function pnlRefusedHtml(title, reasons) {
  return '<div class="pp-refused"><div class="pp-refused-t">Το χαρτί «' + pnlpEsc(title) + '» δεν βγήκε</div>'
    + '<div>Τα ποσά του δεν συμφωνούν με την οθόνη, ή δεν διαβάστηκαν όλα. Ένα χαρτί με λάθος άθροισμα θα το πίστευε κάποιος· γι\' αυτό δεν τυπώνεται.</div>'
    + '<ul>' + reasons.map(r => '<li>' + pnlpEsc(r) + '</li>').join('') + '</ul></div>';
}

function pnlTripHtml(m) {
  const t = m.t;
  let n = 0;
  const revRows = m.rev.map(r => {
    if (r.sub) return '<tr class="pp-subrow"><td></td><td></td><td colspan="3">' + pnlpEsc(r.load) + '</td><td class="r">' + pnlpAmt(r.amount) + '</td></tr>';
    n++;
    return '<tr><td>' + n + '</td><td class="nw">' + pnlpEsc(r.days) + '</td><td>' + pnlpEsc(r.load)
      + (r.note ? ' <span class="pp-word">' + pnlpEsc(r.note) + '</span>' : '') + '</td><td>' + pnlpEsc(r.client) + '</td>'
      + '<td class="r">' + (r.pallets == null ? '—' : r.pallets) + '</td><td class="r">' + (r.amount == null ? '—' + (r.dag ? '†' : '') : pnlpAmt(r.amount)) + '</td></tr>';
  }).join('') || '<tr><td colspan="6" class="pp-word">Κανένα δεμένο φορτίο</td></tr>';
  const costRows = m.costs.map(c => {
    if (c.sub) return '<tr class="pp-subrow"><td class="pp-ind">' + pnlpEsc(c.label) + '</td><td></td><td class="r">' + c.lines + '</td><td class="r">' + pnlpAmt(c.net) + '</td><td class="r">' + (c.vat ? pnlpAmt(c.vat) : '—') + '</td></tr>';
    // undefined = the column does not apply to the row (the driver, the wear: no cost lines, no VAT) → blank
    const lines = c.na || c.lines === undefined ? '' : c.lines ? c.lines : '—';
    const net = c.na ? '' : c.miss ? PNLP_MISS : c.net == null ? '—' : pnlpAmt(c.net);
    const vat = c.na || c.vat === undefined || c.net == null ? '' : c.vat ? pnlpAmt(c.vat) : '—';
    return '<tr' + (c.bold ? ' class="pp-bold"' : '') + '><td>' + pnlpEsc(c.label) + '</td><td class="pp-word">' + pnlpEsc(c.source || '') + '</td>'
      + '<td class="r">' + lines + '</td><td class="r">' + net + '</td><td class="r">' + vat + '</td></tr>';
  }).join('');
  const dag = m.priceMissing ? '†' : '';
  return pnlpHead('Αποτέλεσμα δρομολογίου', pnlpWeekTag(t.date_start))
    + '<h1 class="pp-title">Αποτέλεσμα δρομολογίου</h1>'
    + '<div class="pp-meta">'
      + '<div><span class="k">Φορτηγό</span><span class="v b">' + pnlpEsc(m.vehicle) + '</span></div>'
      + '<div><span class="k">Περίοδος</span><span class="v b">' + pnlpDMY(t.date_start) + (t.date_end ? ' – ' + pnlpDMY(t.date_end) : '') + '</span></div>'
      + '<div><span class="k">Οδηγός</span><span class="v">' + pnlpEsc(m.driver) + '</span></div>'
      + '<div><span class="k">Κατάσταση</span><span class="v">' + pnlpEsc(m.status) + '</span></div>'
    + '</div>'
    + '<h2 class="pp-h2">Έσοδα</h2>'
    + '<table class="pp-t"><thead><tr><th>Α/Α</th><th>Ημ/νίες</th><th>Φορτίο</th><th>Πελάτης</th><th class="r">Παλ.</th><th class="r">Καθαρό €</th></tr></thead>'
    + '<tbody>' + revRows + '</tbody>'
    + '<tfoot><tr class="pp-tot"><td colspan="5">Σύνολο εσόδων</td><td class="r">' + pnlpAmt(m.revenue) + dag + '</td></tr></tfoot></table>'
    + '<h2 class="pp-h2">Κόστη</h2>'
    + '<table class="pp-t"><thead><tr><th>Κατηγορία</th><th>Πηγή</th><th class="r">Γραμμές</th><th class="r">Καθαρό €</th><th class="r">ΦΠΑ €</th></tr></thead>'
    + '<tbody>' + costRows + '</tbody>'
    + '<tfoot><tr class="pp-tot"><td colspan="3">Σύνολο κοστών</td><td class="r">' + pnlpAmt(m.costNet) + '</td><td class="r">' + pnlpAmt(m.costVat) + '</td></tr></tfoot></table>'
    + '<div class="pp-res">'
      + '<h2 class="pp-h2">Αποτέλεσμα</h2>'
      + '<div class="pp-rrow"><span>Έσοδα</span><span>' + pnlpAmt(m.revenue) + dag + '</span></div>'
      + '<div class="pp-rrow"><span>Κόστη, καθαρά</span><span>− ' + pnlpAmt(m.costNet) + '</span></div>'
      + '<div class="pp-rrow"><span>ΦΠΑ εξόδων</span><span>− ' + pnlpAmt(m.costVat) + '</span></div>'
      + '<div class="pp-rrow pp-final"><span>Αποτέλεσμα</span><span>' + (m.complete ? pnlpAmt(m.result) + ' €' : '—') + '</span></div>'
      + '<div class="pp-rrow pp-word"><span>Περιθώριο</span><span>' + (m.complete ? pnlpPct(m.margin) : '—') + '</span></div>'
      + (m.complete ? '' : '<div class="pp-missline">Λείπει: ' + pnlpEsc(m.missing.join(', ')) + '</div>')
    + '</div>'
    + '<div class="pp-foot">Καθαρά ποσά· το αποτέλεσμα αφαιρεί και τον ΦΠΑ των εξόδων. Όλες οι κατηγορίες εξόδων, τα διόδια ανά χώρα· «—» = καμία γραμμή. '
      + 'Πλήρες = έξοδα δρομολογίου και αξία οδηγού· αν λείπει ένα: «λείπει» και αποτέλεσμα «—». † φορτίο χωρίς τιμή.</div>';
}

function pnlWeekHtml(m, from, to) {
  const body = m.rows.map((r, i) => '<tr><td>' + (i + 1) + '</td><td class="nw">' + pnlpEsc(r.days) + '</td><td>' + pnlpEsc(r.who) + '</td><td>' + pnlpEsc(r.route) + '</td>'
    + '<td class="r">' + pnlpAmt(r.revenue) + (r.dag ? '†' : '') + '</td>'
    + pnlpCell(r.fuel) + pnlpCell(r.tolls) + pnlpCell(r.driver) + pnlpCell(r.partner) + pnlpCell(r.other)
    + '<td class="r">' + pnlpAmt(r.cost) + '</td><td class="r">' + (r.vat ? pnlpAmt(r.vat) : '—') + '</td>'
    + '<td class="r b">' + (r.complete ? pnlpAmt(r.result) : '—') + '</td><td class="r">' + (r.complete ? pnlpPct(r.margin) : '—') + '</td></tr>').join('')
    || '<tr><td colspan="14" class="pp-word">Κανένα δρομολόγιο με έναρξη αυτή την εβδομάδα</td></tr>';
  const T = m.total, M = m.missIn, F = m.full;
  const allFull = m.rows.length > 0 && F.n === m.rows.length;
  const mi = k => '<td class="r pp-misscount">' + (k ? k : '') + '</td>';
  return pnlpHead('Αποτέλεσμα δρομολογίων εβδομάδας', 'Εβδομάδα ' + pnlpDM(from) + ' – ' + pnlpDMY(to))
    + '<h1 class="pp-title">Αποτέλεσμα δρομολογίων εβδομάδας</h1>'
    + '<div class="pp-meta">'
      + '<div><span class="k">Εβδομάδα</span><span class="v b">' + pnlpWeekday(from) + ' ' + pnlpDM(from) + ' – ' + pnlpWeekday(to) + ' ' + pnlpDMY(to) + '</span></div>'
      + '<div><span class="k">Δρομολόγια</span><span class="v b">' + m.rows.length + ' · πλήρη ' + F.n + '</span></div>'
      + '<div><span class="k">Κριτήριο</span><span class="v">ημέρα έναρξης δρομολογίου</span></div>'
      + '<div><span class="k">Ποσά</span><span class="v">καθαρά · αποτέλεσμα μετά τον ΦΠΑ εξόδων</span></div>'
    + '</div>'
    + '<table class="pp-t pp-week"><thead><tr><th>Α/Α</th><th>Ημ/νίες</th><th>Φορτηγό · οδηγός</th><th>Διαδρομή</th><th class="r">Έσοδα</th><th class="r">Καύσιμα</th>'
      + '<th class="r">Διόδια</th><th class="r">Οδηγός</th><th class="r">Κόμιστρο</th><th class="r">Λοιπά</th><th class="r">Κόστη</th><th class="r">ΦΠΑ</th>'
      + '<th class="r">Αποτέλεσμα</th><th class="r">Περιθ.</th></tr></thead>'
    + '<tbody>' + body + '</tbody>'
    + '<tfoot>'
      + '<tr class="pp-tot"><td colspan="4">Σύνολο εβδομάδας</td><td class="r">' + pnlpAmt(T.revenue) + (T.dag ? '†' : '') + '</td><td class="r">' + pnlpAmt(T.fuel) + '</td>'
        + '<td class="r">' + pnlpAmt(T.tolls) + '</td><td class="r">' + pnlpAmt(T.driver) + '</td><td class="r">' + pnlpAmt(T.partner) + '</td><td class="r">' + pnlpAmt(T.other) + '</td>'
        + '<td class="r">' + pnlpAmt(T.cost) + '</td><td class="r">' + pnlpAmt(T.vat) + '</td><td class="r">' + (allFull ? pnlpAmt(F.result) : '—') + '</td>'
        + '<td class="r">' + (allFull ? pnlpPct(F.margin) : '—') + '</td></tr>'
      + '<tr class="pp-missrow"><td colspan="4">Λείπει σε</td>' + mi(M.revenue) + mi(M.fuel) + mi(M.tolls) + mi(M.driver) + mi(M.partner) + '<td colspan="5"></td></tr>'
      + '<tr class="pp-fullrow"><td colspan="4">Μόνο τα πλήρη · ' + F.n + ' από ' + m.rows.length + '</td><td class="r">' + (F.n ? pnlpAmt(F.revenue) : '—') + '</td><td colspan="5"></td>'
        + '<td class="r">' + (F.n ? pnlpAmt(F.cost) : '—') + '</td><td class="r">' + (F.n ? pnlpAmt(F.vat) : '—') + '</td><td class="r b">' + (F.n ? pnlpAmt(F.result) : '—') + '</td><td class="r">' + (F.n ? pnlpPct(F.margin) : '—') + '</td></tr>'
    + '</tfoot></table>'
    + '<div class="pp-foot">Καθαρά ποσά· το αποτέλεσμα αφαιρεί και τον ΦΠΑ των εξόδων. Πλήρες = έξοδα δρομολογίου (καύσιμα, διόδια ή κόμιστρο) και αξία οδηγού· '
      + 'αν λείπει ένα: «λείπει» και αποτέλεσμα «—». Κενό: δεν αφορά. † φορτίο χωρίς τιμή, αποτέλεσμα «—». Λοιπά: οι άλλες κατηγορίες εξόδων και η φθορά. Ζημιά σε παρένθεση.</div>';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pnlTripModel, pnlWeekModel, pnlTripHtml, pnlWeekHtml, pnlRefusedHtml, pnlpAmt, pnlpSpan, pnlpDriverShort, pnlpCountry };
}
