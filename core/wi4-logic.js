// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL v4 — pure logic (global WI4)
// ─────────────────────────────────────────────────────────────────────
// Spec: docs/weekly-intl-redesign/TECH_DESIGN.md §b, §d. Owner: WP1.
//
// Plain functions on plain objects: no DOM, no WINTL, no Date.now() (today
// and now are arguments), so the row rail, the day header and the queue read
// ONE rule each (principle 3) and node --test can prove them without a
// browser. The same file loads as a browser global and as a node module.
//
// At load it only defines WI4 — no listener, timer, observer or fetch (§b
// step 6, checked by tests/wi4-contract.test.js).
//
// Dates: every date argument is a LOCAL calendar day 'YYYY-MM-DD' (what
// toLocalDate() returns). A datetime is never sliced here: slicing a UTC ISO
// string gives the wrong day near midnight in Athens. Anything that is not
// 'YYYY-MM-DD' counts as «no date», and no date is never «plenty of time»
// (same rule as preorderLevel in modules/preorder.js).
// ═══════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const freeze = Object.freeze;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Whole days from `a` to `b` (b − a), or null when either is not a day.
// Date.UTC on both sides: no DST hour can turn 1 day into 0.96.
function dayDiff(a, b) {
  if (!DAY_RE.test(String(a || '')) || !DAY_RE.test(String(b || ''))) return null;
  const u = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((u(b) - u(a)) / 86400000);
}

const GR_DOW = freeze(['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ']);
// «Τρί 6/10» — the board's own day format (rules sheet: no year, no zero pad).
function dayLabel(d) {
  if (!DAY_RE.test(String(d || ''))) return '';
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)));
  return `${GR_DOW[t.getUTCDay()]} ${t.getUTCDate()}/${t.getUTCMonth() + 1}`;
}

// ─── §b Flag decision ──────────────────────────────────────────────────
// Three states. Anything else — a typo, `true`, undefined, a stale cached
// config.js without the key — reads as 'off' (principle 5: unknown = closed).
// The caller compares normFlag(x) with x to send its one console.warn: this
// file never logs, so the rule stays testable.
function normFlag(flag) {
  return flag === 'pilot' || flag === 'on' ? flag : 'off';
}

/** → 'v4' | 'old'. 'off' overrides every opt-in, so the owner never has to
 *  ask each user to visit ?wi4=0 to stop the pilot. */
function v2Decide({ flag, pilot, user, optIn } = {}) {
  const f = normFlag(flag);
  if (f === 'off') return 'old';
  if (optIn === '0') return 'old';
  if (f === 'on') return 'v4';
  const list = Array.isArray(pilot) ? pilot : [];
  return optIn === '1' || (user != null && user !== '' && list.includes(user)) ? 'v4' : 'old';
}

// ─── §d.1 Points ───────────────────────────────────────────────────────
const POINTS_DEFAULTS = freeze({ min: 56, gap: 8, badge: 12, chip: 34, placeMin: 46, dateTick: false });

/**
 * stops = [{n, label, place, pallets, done, delayH}] in stop order;
 * widthPx = one points column, measured once per paint.
 * → {shown:[stop + {badge, tick}], more:{count, pallets, hidden, title}|null, hidePlace}
 *
 * Fit rule (rules 1–2), with the opts as given:
 *   all n (n ≤ 4):      n·min + (n−1)·gap            ≤ width
 *   k + «+N» chip:      k·min + (k−1)·gap + gap + chip ≤ width
 * With the defaults this is the board's own drawing: at 207px a groupage of
 * five shows 2 points + «+3» (Figma 1097:2895). It also means a 4-stop column
 * at 200–207px shows 2 + «+2», not the «3 + +1» the §d.1 prose estimated
 * (3 points + chip need 226px). Reported to the coordinator, not bent here.
 */
function points(stops, widthPx, opts) {
  const o = Object.assign({}, POINTS_DEFAULTS, opts || {});
  const list = Array.isArray(stops) ? stops : [];
  const n = list.length;
  if (!n) return { shown: [], more: null, hidePlace: false };
  const width = Number(widthPx);
  // Unmeasured width (column not in the DOM yet): never shrink on a guess,
  // fall back to the plain rule — ≤4 all, 5+ first 3 — and let the next paint
  // measure.
  const measured = Number.isFinite(width) && width > 0;
  const allFit = (k) => k * o.min + (k - 1) * o.gap <= width;
  const chipFit = (k) => k * o.min + k * o.gap + o.chip <= width;
  let k;
  if (n <= 4) {
    if (!measured || allFit(n)) k = n;
    else { k = n - 1; while (k > 1 && !chipFit(k)) k--; }
  } else {
    k = 3;
    if (measured) while (k > 1 && !chipFit(k)) k--;
  }
  // At least one point always shows: a column of only «+N» would hide the
  // one thing the dispatcher reads first.
  k = Math.max(1, k);
  const hidden = list.slice(k);
  const more = hidden.length ? {
    count: hidden.length,
    pallets: hidden.reduce((s, x) => s + (Number(x && x.pallets) || 0), 0),
    hidden,
    title: hidden.map((x) => [x && x.label, x && x.place].filter(Boolean).join(' · ')).join('\n'),
  } : null;
  let hidePlace = false;
  if (measured) {
    const perPoint = (width - (k - 1) * o.gap - (more ? o.gap + o.chip : 0)) / k;
    hidePlace = perPoint - o.badge < o.placeMin;
  }
  const single = n === 1;
  const shown = list.slice(0, k).map((s, i) => Object.assign({}, s, {
    // Rule 6: a single stop has no number badge (name and place as today).
    badge: single ? null : (s && s.n != null ? s.n : i + 1),
    // Rule 5: one stop + a date chip that already carries the ✓ → no second ✓.
    tick: !!(s && s.done) && !(single && o.dateTick),
  }));
  return { shown, more, hidePlace };
}

// ─── §d.2 Flags ────────────────────────────────────────────────────────
// Words: today's vocabulary (rules sheet 958:747). One table, read by the row
// rail, the day header and the queue.
const TEXT = freeze({
  NO_TRUCK: 'χωρίς φορτηγό',
  EMPTY_RETURN: 'κενό γύρισμα',
  NAT_NO_CARRIER: 'σκέλος χωρίς μεταφορέα',
  NAT_UNKNOWN: 'Τα εθνικά σκέλη δεν φορτώθηκαν — δεν σημαίνει ότι δεν έχουν μεταφορέα',
  DATE_MISMATCH: 'ασυνέπεια ημερομηνιών',
  OVER_33: 'πάνω από 33π',
  LATE: 'καθυστέρηση',
  PREORDER: 'pre-order χωρίς μετατροπή',
  SAVE_FAILED: 'δεν αποθηκεύτηκε',
});

// The one button a queue card offers (§e #2); WI4Actions maps it to the
// existing opener. Never a write by itself.
const ACT = freeze({
  NO_TRUCK: 'assign', EMPTY_RETURN: 'newImport', NAT_NO_CARRIER: 'national',
  NAT_UNKNOWN: 'retry', SOURCE_UNKNOWN: 'retry', DATE_MISMATCH: 'date',
  OVER_33: 'open', SAME_DAY: 'open', LATE: 'open', PREORDER: 'convert',
  SAVE_FAILED: 'retry', STOCK_LATE: 'loose', STOCK_LOOSE: 'loose', STOCK_LOT: 'lot',
});

const RANK = freeze({ red: 2, amber: 1 });
const worst = (reasons) => reasons.reduce((w, r) => ((RANK[r.level] || 0) > (RANK[w] || 0) ? r.level : w), null);
const reason = (code, level, text, date, extra) =>
  Object.assign({ code, level, text, act: ACT[code] || 'open', date: DAY_RE.test(String(date || '')) ? date : null }, extra || {});

// red when the day is today+1 or earlier (past included); no date = red too.
const nearLevel = (d, today) => { const k = dayDiff(today, d); return k === null || k <= 1 ? 'red' : 'amber'; };

/**
 * facts (built impurely by WIV2.factsOf):
 *   {kind:'export'|'import'|'leg'|'split'|'relay', saved, partner, loadDate,
 *    delDate, returnDate, returnPlace?, hasReturn,
 *    natLegs:[{side:'to'|'from', date, carrier:boolean}], natState,
 *    stockState, pallets, vsCdDate, natDelDate, natLoadDate?,
 *    sameDayClash:string|null, late, preorder:{level}|null, syncErr, executing}
 * → {level:'red'|'amber'|null, reasons:[{code, level, text, act, date}]}
 *
 * NAT_UNKNOWN / SOURCE_UNKNOWN are board-level (one per board / per failed
 * source), never per row: see sourceReasons().
 */
function flags(facts, today) {
  const f = facts || {};
  const out = [];
  const truckRow = f.kind === 'export' || f.kind === 'import';

  // NO_TRUCK — never silent (§d.2): red today–tomorrow, amber beyond, never
  // nothing. Only full rows carry an assignment: a rota leg shares its truck,
  // a split header's legs are full rows of their own, a relay is a local
  // driver.
  if (truckRow && !f.saved && !f.partner) out.push(reason('NO_TRUCK', nearLevel(f.loadDate, today), TEXT.NO_TRUCK, f.loadDate));

  // EMPTY_RETURN — own truck, export, no import. Rules sheet: nothing while
  // R > today+2, amber from R−2 to R, red after R. No R = amber: we know the
  // truck comes back empty, not since when. A partner never gets it (the
  // cell says «Μόνο εξαγωγή · συνεργάτης», a fact, not a flag).
  if (f.kind === 'export' && f.saved && !f.partner && !f.hasReturn) {
    const k = dayDiff(f.returnDate, today); // today − R
    const level = k === null ? 'amber' : k > 0 ? 'red' : k >= -2 ? 'amber' : null;
    if (level) {
      const from = dayLabel(f.returnDate);
      const text = [TEXT.EMPTY_RETURN, from ? 'από ' + from : '', f.returnPlace || ''].filter(Boolean).join(' · ');
      out.push(reason('EMPTY_RETURN', level, text, f.returnDate, { age: k === null ? null : Math.max(0, k) }));
    }
  }

  // NAT_NO_CARRIER — only on a READ national state (§d.2a). 'loading'/'err'
  // say nothing per row: an unread leg is not a leg without a carrier.
  if (f.natState === 'ok' && Array.isArray(f.natLegs)) {
    for (const leg of f.natLegs) {
      if (leg && !leg.carrier) out.push(reason('NAT_NO_CARRIER', nearLevel(leg.date, today), TEXT.NAT_NO_CARRIER, leg.date, { side: leg.side }));
    }
  }

  // DATE_MISMATCH — VS import reaches Βέροια after its national delivery, or
  // a VS export's cross-dock day comes before its national loading.
  if (DAY_RE.test(String(f.vsCdDate || ''))) {
    const bad = (f.kind === 'import' && dayDiff(f.natDelDate, f.vsCdDate) > 0)
      || (f.kind === 'export' && dayDiff(f.vsCdDate, f.natLoadDate) > 0);
    if (bad) out.push(reason('DATE_MISMATCH', 'amber', TEXT.DATE_MISMATCH, f.vsCdDate));
  }

  // 33 pallets is allowed (decision 9/10); only more is a flag.
  if (Number(f.pallets) > 33) out.push(reason('OVER_33', 'amber', TEXT.OVER_33, f.loadDate));
  if (f.sameDayClash) out.push(reason('SAME_DAY', 'amber', String(f.sameDayClash), f.loadDate));
  if (f.late) out.push(reason('LATE', 'amber', TEXT.LATE, f.delDate));
  const pl = f.preorder && f.preorder.level;
  if (pl === 'red' || pl === 'amber') out.push(reason('PREORDER', pl, TEXT.PREORDER, f.loadDate));
  if (f.syncErr) out.push(reason('SAVE_FAILED', 'red', TEXT.SAVE_FAILED, f.loadDate, { detail: String(f.syncErr) }));

  return { level: worst(out), reasons: out };
}

/**
 * Board-level reasons for sources that did not load (§d.2a «Άγνωστο ≠ άδειο»).
 * src = {natState, crossWeekOk, relayState, stockState}. One reason per failed
 * source: a failed read is never a smaller number, it is an item that says so.
 */
const SOURCE_NAMES = freeze({ crossWeek: 'φορτώσεις W+1', relay: 'τοπικές παραδόσεις/φορτώσεις', stock: 'απόθεμα' });
function sourceReasons(src) {
  const s = src || {};
  const out = [];
  if (s.natState === 'err') out.push(reason('NAT_UNKNOWN', 'amber', TEXT.NAT_UNKNOWN, null, { source: 'national' }));
  const unk = (source) => out.push(reason('SOURCE_UNKNOWN', 'amber',
    `Δεν φορτώθηκε: ${SOURCE_NAMES[source]} — δεν σημαίνει ότι δεν υπάρχουν`, null, { source }));
  if (s.crossWeekOk === false) unk('crossWeek');
  if (s.relayState === 'err') unk('relay');
  if (s.stockState === 'failed') unk('stock');
  return out;
}

// ─── §d.3 Day header, plurals, queue ───────────────────────────────────
// Decided copy, round 11. [singular, plural].
const PLURAL = freeze({
  truck: freeze(['φορτηγό', 'φορτηγά']),
  load: freeze(['φορτίο', 'φορτία']),
  emptyReturn: freeze(['κενό γύρισμα', 'κενά γυρίσματα']),
  natNoCarrier: freeze(['σκέλος χωρίς μεταφορέα', 'σκέλη χωρίς μεταφορέα']),
  pending: freeze(['εκκρεμές', 'εκκρεμή']),
  urgent: freeze(['επείγον', 'επείγοντα']),
  day: freeze(['ημέρα', 'ημέρες']),
});
function plural(n, key) {
  const w = PLURAL[key];
  // A missing key is a coding error: loud here, never a blank on the board.
  if (!w) throw new Error('WI4.plural: unknown key ' + key);
  return `${n} ${Number(n) === 1 ? w[0] : w[1]}`;
}

/**
 * rowsFacts = every facts object of ONE day: rows, sub-rows, split legs and
 * national legs all count, so the totals equal the queue (round 11).
 * → {trucks, byCode:{CODE:n}, todayEmpty, emptyOldest}
 *   trucks      = full rows (export / import-only) of the day;
 *   todayEmpty  = empty returns that start today;
 *   emptyOldest = the oldest empty-return gap in days (0 = none past).
 */
function dayCounts(rowsFacts, today) {
  const byCode = {};
  let trucks = 0, todayEmpty = 0, emptyOldest = 0;
  for (const f of rowsFacts || []) {
    if (f && (f.kind === 'export' || f.kind === 'import')) trucks++;
    for (const r of flags(f, today).reasons) {
      byCode[r.code] = (byCode[r.code] || 0) + 1;
      if (r.code === 'EMPTY_RETURN') {
        if (r.date && r.date === today) todayEmpty++;
        if (r.age != null && r.age > emptyOldest) emptyOldest = r.age;
      }
    }
  }
  return { trucks, byCode, todayEmpty, emptyOldest };
}

/** «4 φορτηγά · 1 χωρίς φορτηγό · 2 κενά γυρίσματα (1 από σήμερα) · 1 σκέλος χωρίς μεταφορέα».
 *  opts.natState 'loading'|'err' replaces the leg count: an unread leg is
 *  never counted, and never counted as zero either (§d.2a). */
function dayText(counts, opts) {
  const c = counts || {};
  const by = c.byCode || {};
  const parts = [plural(c.trucks || 0, 'truck')];
  if (by.NO_TRUCK) parts.push(`${by.NO_TRUCK} ${TEXT.NO_TRUCK}`);
  if (by.EMPTY_RETURN) {
    // «(N από σήμερα)» when some start today, else «(N ημέρες)» with the
    // oldest gap; no parenthesis when every gap is still ahead.
    const paren = c.todayEmpty ? ` (${c.todayEmpty} από σήμερα)` : c.emptyOldest > 0 ? ` (${plural(c.emptyOldest, 'day')})` : '';
    parts.push(plural(by.EMPTY_RETURN, 'emptyReturn') + paren);
  }
  const nat = opts && opts.natState;
  if (nat === 'err' || nat === 'loading') parts.push('εθνικά σκέλη: δεν φορτώθηκαν');
  else if (by.NAT_NO_CARRIER) parts.push(plural(by.NAT_NO_CARRIER, 'natNoCarrier'));
  return parts.join(' · ');
}

// Queue groups: what stops a load, what costs, what wants a look. Any code
// not listed is 'look'; an item may carry its own `group`.
const GROUP = freeze({
  NO_TRUCK: 'stop', NAT_NO_CARRIER: 'stop', SAVE_FAILED: 'stop',
  EMPTY_RETURN: 'cost', STOCK_LATE: 'cost',
});
const GROUP_ORDER = freeze({ stop: 0, cost: 1, look: 2 });

/** The queue items of one facts object, keyed by order id (`key`) and the
 *  row it is drawn in (`rowKey`), so a card resolves its row at click time. */
function items(facts, today, ids) {
  const k = ids || {};
  return flags(facts, today).reasons.map((r) => queueItem(r, k.key, k.rowKey));
}
function queueItem(r, key, rowKey) {
  return Object.assign({}, r, { group: r.group || GROUP[r.code] || 'look', key: key == null ? '' : String(key), rowKey: rowKey == null ? null : rowKey });
}

/**
 * → a NEW array, ordered: red before amber; inside a level stop → cost → look;
 *   stop by nearest date, cost by oldest gap (age desc, then date), look by
 *   date. No date sorts first (unknown is never «plenty of time»). Ties break
 *   by key (order id), never by fetch order. Items with no level are dropped.
 */
function queue(list, today) {
  const t = (d) => (DAY_RE.test(String(d || '')) ? d : '');
  const age = (x) => (x.age != null ? x.age : (() => { const k = dayDiff(x.date, today); return k === null ? Infinity : k; })());
  return (list || []).filter((x) => x && RANK[x.level]).map((x) => Object.assign({}, x, { group: x.group || GROUP[x.code] || 'look' }))
    .sort((a, b) => {
      if (RANK[a.level] !== RANK[b.level]) return RANK[b.level] - RANK[a.level];
      const ga = GROUP_ORDER[a.group] ?? 2, gb = GROUP_ORDER[b.group] ?? 2;
      if (ga !== gb) return ga - gb;
      if (a.group === 'cost') { const d = age(b) - age(a); if (d) return d > 0 ? 1 : -1; }
      const da = t(a.date), db = t(b.date);
      if (da !== db) return da < db ? -1 : 1;
      const ka = String(a.key || ''), kb = String(b.key || '');
      if (ka !== kb) return ka < kb ? -1 : 1;
      return String(a.code) < String(b.code) ? -1 : String(a.code) > String(b.code) ? 1 : 0;
    });
}

/** Rules sheet «Σύμπτυξη ημέρας»: true only when every full row has a truck
 *  (or a partner), every export has a return (or a partner), and nothing on
 *  the day has any reason. An empty day is not collapsible (it is one line
 *  «Καμία κίνηση»). Unread national legs keep the day open: unknown ≠ fine. */
function collapsible(dayFacts, today) {
  const list = dayFacts || [];
  if (!list.length) return false;
  return list.every((f) => {
    if (!f) return false;
    if (f.natState && f.natState !== 'ok') return false;
    if (f.kind === 'export' || f.kind === 'import') {
      if (!f.saved && !f.partner) return false;
      if (f.kind === 'export' && !f.partner && !f.hasReturn) return false;
    }
    return flags(f, today).reasons.length === 0;
  });
}

/** days = [{date, facts:[…]}] → the first day (by date) holding a red reason,
 *  else today. */
function openDay(days, today) {
  const sorted = (days || []).filter((d) => d && DAY_RE.test(String(d.date || ''))).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const hit = sorted.find((d) => (d.facts || []).some((f) => flags(f, today).level === 'red'));
  return hit ? hit.date : today;
}

// ─── §d.4 Keyboard ─────────────────────────────────────────────────────
// By e.code, so a Greek layout works (A=Α, D=Δ, P=Π, N=Ν, O=Ο). The «?» sheet
// and the menu hint letters read THIS list, so they show only keys that work.
// Not bound tonight (owner question, PLAN §5.2): ←/→ (week stays in
// core/ui.js:407), [ ], E/I, ⌘Z (no undo exists).
const KEYMAP = freeze([
  freeze({ code: 'ArrowUp', shift: false, action: 'rowPrev', keys: '↑', label: 'προηγούμενη σειρά', needsRow: false }),
  freeze({ code: 'ArrowDown', shift: false, action: 'rowNext', keys: '↓', label: 'επόμενη σειρά', needsRow: false }),
  freeze({ code: 'Enter', shift: false, action: 'menu', keys: 'Enter', label: 'μενού φορτίου', needsRow: true }),
  freeze({ code: 'KeyA', shift: false, action: 'assign', keys: 'A', label: 'ανάθεση', needsRow: true }),
  freeze({ code: 'KeyD', shift: false, action: 'date', keys: 'D', label: 'ημερομηνία', needsRow: true }),
  freeze({ code: 'KeyP', shift: false, action: 'print', keys: 'P', label: 'εκτύπωση / WhatsApp', needsRow: true }),
  freeze({ code: 'KeyN', shift: false, action: 'newImport', keys: 'N', label: 'νέα εισαγωγή (κενό γύρισμα)', needsRow: true }),
  freeze({ code: 'KeyO', shift: false, action: 'open', keys: 'O', label: 'άνοιγμα παραγγελίας', needsRow: true }),
  freeze({ code: 'KeyQ', shift: false, action: 'queueNext', keys: 'Q', label: 'επόμενο της ουράς', needsRow: false }),
  freeze({ code: 'Slash', shift: false, action: 'search', keys: '/', label: 'αναζήτηση', needsRow: false }),
  freeze({ code: 'Slash', shift: true, action: 'help', keys: '?', label: 'όλες οι συντομεύσεις', needsRow: false }),
  freeze({ code: 'Escape', shift: false, action: 'escape', keys: 'Esc', label: 'κλείσιμο / καθάρισμα', needsRow: false }),
]);

/** ev = {code, key, shift, ctrl, meta, alt, targetTag, editable}
 *  st = {menuOpen, panelOpen, popoverOpen, dialogOpen, datePanelOpen,
 *        modalOpen, paletteOpen, onPage, rootPresent, hasFocusRow}
 *  → action string | null. Nothing destructive is ever bound. */
function keyAction(ev, st) {
  const e = ev || {}, s = st || {};
  if (!s.onPage || !s.rootPresent) return null;
  if (e.ctrl || e.meta || e.alt) return null;                  // ⌘K, ⌘Z keep today's meaning
  const tag = String(e.targetTag || '').toUpperCase();
  if (e.editable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return null;
  // Open overlays own their keys (e.g. _wiCtxKeydown gives ↑↓/Esc in #wi-ctx).
  if (s.menuOpen || s.panelOpen || s.popoverOpen || s.dialogOpen || s.datePanelOpen || s.modalOpen || s.paletteOpen) return null;
  const hit = KEYMAP.find((k) => k.code === e.code && k.shift === !!e.shift);
  if (!hit) return null;
  if (hit.needsRow && !s.hasFocusRow) return null;
  return hit.action;
}

/** The key shown next to a menu item / in the «?» sheet ('' when unbound). */
function keyHint(action) {
  const k = KEYMAP.find((x) => x.action === action);
  return k ? k.keys : '';
}

// ─── §d.5 Conflict data ────────────────────────────────────────────────
const CONFLICT_LABELS = freeze(['Truck', 'Trailer', 'Driver', 'Partner', 'Partner Truck Plates',
  'Is Partner Trip', 'Matched Import ID', 'Loading DateTime', 'Delivery DateTime', 'VS CD Date']);
const DATE_LABELS = freeze(['Loading DateTime', 'Delivery DateTime', 'VS CD Date']);
const CHECKBOX_LABELS = freeze(['Is Partner Trip']);
// Strict on purpose: V8's Date.parse accepts '12' and 'AB 1 2', so a looser
// rule would call two different plates equal and hide a real conflict.
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function isoEpoch(s) {
  let v = s;
  // A datetime without a zone is UTC, as Postgres stores it — never browser
  // local time, or Athens and the Worker (UTC) would disagree on one pair.
  if (v.includes('T') && !/(Z|[+-]\d{2}:?\d{2})$/.test(v)) v += 'Z';
  v = v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  return Date.parse(v);
}

/** MUST stay equal to the Worker's expectSame: both run
 *  worker/test/fixtures/expect-vectors.json (one file, principle 3). */
function sameValue(a, b, label) {
  if (CHECKBOX_LABELS.includes(label)) {
    // A nullable boolean that rt_sync coalesces to false: absent ≡ false.
    if (a === false) a = null;
    if (b === false) b = null;
  }
  const empty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
  if (empty(a) && empty(b)) return true;
  if (empty(a) || empty(b)) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    const norm = (v) => (Array.isArray(v) ? v : [v]).map((x) => String(x).trim()).sort().join('\0');
    return norm(a) === norm(b);
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const num = (v) => (typeof v === 'number' ? v : String(v).trim() === '' ? NaN : Number(v));
    const na = num(a), nb = num(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  if (DATE_LABELS.includes(label) && typeof a === 'string' && typeof b === 'string' && ISO_RE.test(a.trim()) && ISO_RE.test(b.trim())) {
    const ea = isoEpoch(a.trim()), eb = isoEpoch(b.trim());
    if (Number.isFinite(ea) && Number.isFinite(eb)) return ea === eb;
  }
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return String(a).trim() === String(b).trim();
}

/** changedFields = labels (array) or a fields object; record = the WINTL.data
 *  record the row was painted from. → {label: value-the-user-saw} | undefined. */
function buildExpect(changedFields, record) {
  if (!record || !record.fields) return undefined;
  const labels = Array.isArray(changedFields) ? changedFields : Object.keys(changedFields || {});
  const out = {};
  let n = 0;
  for (const l of labels) {
    if (!CONFLICT_LABELS.includes(l) || Object.prototype.hasOwnProperty.call(out, l)) continue;
    // The facade omits NULL columns (trap 2), so «absent» means «empty».
    // undefined would vanish in JSON.stringify and turn the check off for
    // that label without a sound; null is sent and compared as empty.
    const v = record.fields[l];
    out[l] = v === undefined ? null : v;
    n++;
  }
  return n ? out : undefined;
}

const LABELS_GR = freeze({
  Truck: 'φορτηγό', Trailer: 'ρυμούλκα', Driver: 'οδηγός', Partner: 'συνεργάτης',
  'Partner Truck Plates': 'πινακίδες συνεργάτη', 'Is Partner Trip': 'μεταφορά συνεργάτη',
  'Matched Import ID': 'εισαγωγή', 'Loading DateTime': 'ημερομηνία φόρτωσης',
  'Delivery DateTime': 'ημερομηνία εκφόρτωσης', 'VS CD Date': 'ημερομηνία Βέροιας',
});

function ago(atIso, nowMs) {
  const at = Date.parse(String(atIso || ''));
  if (!Number.isFinite(at) || !Number.isFinite(nowMs)) return '';
  const s = Math.max(0, Math.round((nowMs - at) / 1000));
  if (s < 60) return `πριν ${s}″`;
  const m = Math.round(s / 60);
  if (m < 60) return `πριν ${m}΄`;
  return `πριν ${Math.round(m / 60)}ω`;
}

/**
 * c = the 409 body's error {fields, by, at, current} plus what the dialog
 *     knows: expected (the _expect sent), mine (the user's new values), now (ms).
 * labelsGreek = {label: 'λέξη'} (defaults to LABELS_GR); fmt(label, v)
 *     optional value formatter (names for record ids; dates as «Πέμ 8/10»).
 * → {lead, lines:[{label, name, before, theirs, mine}], text}. PLAIN text:
 *   the caller escapes every value (escapeHtml) before it reaches the DOM.
 * Who: a username only when the Worker sent one (AUDIT_READERS); 'user' →
 * «Άλλος χρήστης», 'auto' → «αυτόματη ενημέρωση», null → no name at all
 * rather than a guess. No article before a name: the board cannot know the
 * gender of «Ο/Η».
 */
function describeConflict(c, labelsGreek, fmt) {
  const x = c || {};
  const names = labelsGreek || LABELS_GR;
  const show = (l, v) => {
    if (typeof fmt === 'function') return fmt(l, v);
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return 'κενό';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'ναι' : 'όχι';
    return String(v);
  };
  const when = ago(x.at, x.now);
  const by = x.by;
  let lead;
  if (by === 'auto') lead = 'Άλλαξε από αυτόματη ενημέρωση';
  else if (by === 'user') lead = 'Άλλος χρήστης την άλλαξε';
  else if (by) lead = `${by} την άλλαξε`;
  else lead = 'Άλλαξε από τότε που την άνοιξες';
  if (when && by) lead += ' ' + when;
  const fields = Array.isArray(x.fields) ? x.fields : [];
  const lines = fields.map((l) => ({
    label: l,
    name: names[l] || l,
    before: show(l, x.expected ? x.expected[l] : undefined),
    theirs: show(l, x.current ? x.current[l] : undefined),
    mine: show(l, x.mine ? x.mine[l] : undefined),
  }));
  const body = lines.map((ln) => `${lines.length > 1 ? ln.name + ': ' : ''}${ln.before} → ${ln.theirs} · Η δική σου επιλογή: ${ln.mine}`).join(' · ');
  return { lead, lines, text: `${lead}${body ? ': ' + body : ''}. Ποια κρατάμε;` };
}

// ─── §d.5 / §g.4 Presence pacing ───────────────────────────────────────
const BEAT_FLOOR = 2500; // the Worker's per-(sub,tab) guard is 2 s; never below 2.5 s

/**
 * → ms until the next beat | null (stop for now: hidden, resume on visible) |
 *   'stop' (stop for the session).
 * failures = consecutive failures including the last one (≥1 when failing).
 * lastStatus 0 = network error.
 */
function beatDelay({ visible, lastInputAgoMs, failures, lastStatus, retryAfterMs, serverNextMs, stop, cfg } = {}) {
  if (!visible) return null;
  if (stop === true || lastStatus === 401 || lastStatus === 403 || lastStatus === 410) return 'stop';
  const n = Math.max(1, Number(failures) || 1);
  const back = (base, cap) => Math.min(cap, base * Math.pow(2, n - 1));
  if (lastStatus === 404) return back(60000, 600000);                      // endpoint not deployed
  if (lastStatus === 0 || (Number(lastStatus) >= 500 && Number(lastStatus) < 600)) return back(15000, 120000);
  // 429 is our own pacing, not an outage: wait what the Worker asked.
  if (lastStatus === 429) return Math.max(BEAT_FLOOR, Number(retryAfterMs) > 0 ? Number(retryAfterMs) : 5000);
  const c = cfg || {};
  const active = Number.isFinite(Number(lastInputAgoMs)) && Number(lastInputAgoMs) < (Number(c.idleAfter) || 120000);
  const base = active ? (Number(c.active) || 5000) : (Number(c.idle) || 30000);
  return Math.max(BEAT_FLOOR, Number(serverNextMs) || 0, base);
}

// ─── §e.9 Per-load menu: sections and icons ───────────────────────────
const TRUCK_FNS = freeze(['_wiPanelAssign', '_wiClear', '_wiStockPanel']);
const IMPORT_FNS = freeze(['_wiUnmatchRow', '_wiUnmatch', '_wiPanelJoinLoad', '_wiStockReturnLone', '_wiPanelWeekShift']);
// Handlers shared by both builders that tell the side by their 2nd argument
// (`…(rowId,true)` = import), e.g. _wiMenuPrint(12,true), _wiPanelGroupBuild(12,true).
const SIDE_ARG_FNS = freeze(['_wiMenuPrint', '_wiPanelGroupBuild']);

/**
 * fn = a handler name or a full onclick string («_wiMenuPrint(12,true);_wiCtxClose()»).
 * from = 'imp' when the item came from _wiImpCtxItems (optional).
 * → 'truck' | 'import' | 'export'. Truck wins: it is drawn once, on top.
 */
function menuSection(fn, from) {
  const s = String(fn || '').trim();
  const m = s.match(/^([A-Za-z_$][\w$]*)\s*(?:\(([^)]*)\))?/);
  const name = m ? m[1] : s;
  if (TRUCK_FNS.includes(name)) return 'truck';
  if (IMPORT_FNS.includes(name)) return 'import';
  if (SIDE_ARG_FNS.includes(name) && m && m[2] != null && String(m[2]).split(',')[1] && String(m[2]).split(',')[1].trim() === 'true') return 'import';
  if (from === 'imp') return 'import';
  return 'export';
}

// handler name → core/icons.js key. «⤷» in old labels gives way to these.
const MENU_ICON = freeze({
  _wiPanelAssign: 'truck', _wiClear: 'trash', _wiStockPanel: 'package',
  _wk3Edit: 'edit', _wiMenuPrint: 'file_text', _wiPrintSplitAll: 'file_text',
  _wiUnmatchRow: 'x', _wiUnmatch: 'x', _wiPanelJoinLoad: 'plus',
  _wiPanelGroupBuild: 'layout_grid', _wiSplit: 'x', _wiCancelGroupMember: 'x',
  _wiPanelRota: 'route', _wiPanelConfirmUnlink: 'x', _wiPanelSplit: 'route',
  _wiRejoinLegs: 'route', _wiPanelHandover: 'map_pin', _wiPanelWeekShift: 'clock',
  _wiRelayOpen: 'user', _wiRelayGrpToggle: 'users', _wiRelayConfirmDel: 'trash',
  _wiStockReturn: 'package', _wiStockReturnLone: 'package', _wiStockLotOfRow: 'package',
  editPreorder: 'edit', deletePreorder: 'trash',
});

const WI4 = freeze({
  // §b
  normFlag, v2Decide,
  // §d.1
  POINTS_DEFAULTS, points,
  // §d.2 / §d.2a
  TEXT, ACT, flags, sourceReasons,
  // §d.3
  PLURAL, plural, dayCounts, dayText, GROUP, items, queue, collapsible, openDay,
  // §d.4
  KEYMAP, keyAction, keyHint,
  // §d.5
  CONFLICT_LABELS, LABELS_GR, sameValue, buildExpect, describeConflict, beatDelay,
  // §e.9
  menuSection, MENU_ICON,
  // shared helpers
  dayDiff, dayLabel,
});

if (typeof module !== 'undefined') module.exports = WI4; else window.WI4 = WI4;
})();
