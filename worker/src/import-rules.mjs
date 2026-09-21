// Pure logic for /costs/import/* (Φ2, spec docs/superpowers/specs/2026-09-08-dkv-import-design.md
// §4, §5, §6). Lives outside index.js so it can be tested with plain Node scripts
// (tests/dkv/run-import-rules.js) without a Worker runtime or a database — same pattern
// as rt-rules.mjs / ledger-rules.mjs. Nothing here talks to Supabase; the Worker fetches
// trucks/aliases/rules/round-trips and passes them in as plain arrays.

// ─── import_key (spec §6 gate #2) ───────────────────────────────────────────
// The same transaction must never be written twice, even if the ZIP is
// re-parsed from a different path. Missing pieces become '' (not skipped) so
// the key stays positionally stable — two lines that differ only in a field
// both hold blank would otherwise collide.
export function buildImportKey(line) {
  // `seq` (line position inside its document, set by the parser) is what makes
  // the key unique: on the real August 2026 ZIP the tuple without it collided
  // 19 times (same ref for two refuels, ref=0000001 on every reverse-charge line).
  // `sub` (round 2, splitByPassages below) is empty ('') for a line that was
  // never split — only a half-month toll line broken into per-day children
  // carries 1..n here, so those children (same doc_no/seq/ref/plate/date/code
  // as their parent) still get distinct keys.
  const parts = [line.doc_no, line.seq, line.ref, line.plate, line.service_date, line.product_code, line.sub];
  return parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('|');
}

// ─── parser/preview line → ct_cost_lines row (critic 8/9, blocker 1) ────────
// The parser speaks the document's language (service_date, net/vat in the
// document currency, net_eur/vat_eur, plate, country, quantity in LTR). The
// table speaks EUR and its own column names. This is the ONE place that
// translates; the commit handler never picks parser fields into the row
// directly, so a foreign-currency line can never land as if it were euros.
// 'Л.'/'Л' = the Bulgarian statement's Cyrillic «л.» after toUpperCase (real
// ZIP 31/08/2026: two DIESEL lines on the BG invoice landed without liters —
// the parser had read quantity 400,12 / 350,01, this set just did not name
// the unit). Owner 14/9: liters must always be present for fuel.
const LITRE_UNITS = new Set(['LTR', 'L', 'LT', 'LITER', 'LITRE', 'Л.', 'Л']);
export function toCostLineRow(ln) {
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const netEur = ln.net_eur != null ? ln.net_eur : (ln.currency == null || ln.currency === 'EUR' ? ln.net : null);
  const vatEur = ln.vat_eur != null ? ln.vat_eur : (ln.currency == null || ln.currency === 'EUR' ? ln.vat : null);
  const liters = ln.liters != null ? ln.liters
    : (ln.unit && LITRE_UNITS.has(String(ln.unit).toUpperCase()) ? ln.quantity : null);
  const noteParts = ['DKV', ln.doc_no, ln.product, ln.country].filter(Boolean);
  const row = {
    rt_id: ln.rt_id != null ? ln.rt_id : null,
    truck_id: ln.truck_id != null ? ln.truck_id : null,
    category: ln.category,
    pay_source: 'DKV', // the import IS the DKV statement (migration 032)
    toll_country: ln.toll_country || ln.country || null,
    net: num(netEur),
    vat: num(vatEur) == null ? 0 : num(vatEur),
    line_date: ln.line_date || ln.service_date || ln.period_to || null,
    plate_raw: ln.plate_raw || ln.vehicle_raw || ln.plate || null,
    km_reading: ln.km_reading != null ? Math.round(Number(ln.km_reading)) : null,
    liters: num(liters),
    station: ln.station || null,
    note: ln.note || noteParts.join(' · ')
  };
  // w11 (owner 21/9, θέμα 9): an aggregated line keeps its members in
  // `details` (jsonb, migration 038) — per passage / per fee source — so the
  // frame can open «11 διελεύσεις ▸» without the table holding 11 rows.
  if (Array.isArray(ln.details) && ln.details.length) row.details = ln.details;
  // A line that reaches the table without a euro amount or a date would be the
  // «green toast, wrong data» failure — refuse it by name instead.
  const missing = [];
  if (row.net == null || !Number.isFinite(row.net)) missing.push('net_eur');
  if (!row.line_date) missing.push('line_date');
  if (!row.category) missing.push('category');
  return { row, missing };
}

// A pre-DB check so a duplicate inside the SAME submitted batch gets a named
// 409 (spec §5 commit: "on 23505 → 409 listing the duplicate keys") instead of
// depending on Postgres's error text alone.
export function findDuplicateImportKeys(lines) {
  const seen = new Set();
  const dups = new Set();
  for (const l of lines || []) {
    const k = (l && l.import_key) || buildImportKey(l || {});
    if (seen.has(k)) dups.add(k);
    else seen.add(k);
  }
  return [...dups];
}

// ─── normalize (spec §5 step c) ─────────────────────────────────────────────
// ctx.trucks: [{id, plate}] — plate ALREADY normalized (DkvParser.normalizePlate),
//   the Worker does that before calling in so this file has no parser dependency.
// ctx.plateAliases: [{alias, truck_id}] — ct_plate_aliases, alias already normalized.
// ctx.rules: [{kind, key, value}] — ct_import_rules rows for source in (DKV, ANY).
// A saved rule OVERRIDES the parser's seed map (spec §4 table: "κωδ. προϊόντος →
// κατηγορία ... rule overrides seed") — it exists specifically to correct a bad seed.
export function applyRules(lines, ctx) {
  const trucks = (ctx && ctx.trucks) || [];
  const aliases = (ctx && ctx.plateAliases) || [];
  const rules = (ctx && ctx.rules) || [];
  const plateRules = rules.filter((r) => r.kind === 'plate');
  const productRules = rules.filter((r) => r.kind === 'product');
  const categoryRules = rules.filter((r) => r.kind === 'category');
  const stationRules = rules.filter((r) => r.kind === 'station');

  return (lines || []).map((line) => {
    const out = { ...line };

    if (out.plate) {
      const truck = trucks.find((t) => t.plate === out.plate);
      if (truck) {
        out.truck_id = truck.id;
      } else {
        const alias = aliases.find((a) => a.alias === out.plate);
        if (alias) {
          out.truck_id = alias.truck_id;
        } else {
          const rule = plateRules.find((r) => r.key === out.plate);
          if (rule && rule.value && rule.value.truck_id != null) out.truck_id = rule.value.truck_id;
        }
      }
    }

    if (out.product_code) {
      const rule = productRules.find((r) => r.key === out.product_code);
      if (rule && rule.value && rule.value.category) out.category = rule.value.category;
    }
    // Only a code the seed map (and any product rule) both missed falls back
    // to a text match — a code-level rule is always the more specific source.
    if (out.category === 'other' && out.product) {
      const rule = categoryRules.find((r) => r.key === out.product);
      if (rule && rule.value && rule.value.category) out.category = rule.value.category;
    }

    if (out.station) {
      const rule = stationRules.find((r) => r.key === out.station);
      if (rule && rule.value && rule.value.country) out.country = rule.value.country;
    }

    return out;
  });
}

// ─── per-day split of half-month toll lines (round 2, spec §1 "CZ/HU/PL/BG
// STATEMENT γραμμές είναι δεκαπενθήμερο ανά όχημα· η λίστα διελεύσεων τις
// σπάει ανά ημέρα") ────────────────────────────────────────────────────────
// Called by the Worker's parse handler right after DkvParser.parseDkv and
// BEFORE applyRules — it works on the parser's own line/passages shape
// (plate/country/service_date already normalized by the parser), not on
// anything applyRules or matchRoundTrip add.
//
// A half-month statement line for tolls (period_from/period_to set,
// category==='tolls') is one aggregate charge; the "List of passages" PDF
// for the same vehicle/period gives the real per-day amounts. We only ever
// trust the split when the passages found for that (plate, country, period)
// sum to the statement line's own net (or gross, when the line has no net —
// spec: "also try gross if the statement line carries gross only") within
// 0,01 — otherwise the line is left exactly as parsed and the mismatch is
// reported, never guessed past (CLAUDE.md «ό,τι δεν γίνεται, πρέπει να
// ακούγεται»).
// ISO date ± n days, computed on the calendar (no timezone) — used only to
// widen half-month windows by DKV's one-day billing cut.
function shiftDay(iso, days) {
  if (!iso) return iso;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

function localAmount(obj, useGross) {
  const v = useGross ? obj.gross : obj.net;
  return typeof v === 'number' ? v : 0;
}

// Proportional EUR split of `line` over `groups` (one child per group), the
// child's share = its local amount / `lineLocal`. 2dp per child, the LAST
// child absorbs the rounding so Σ children EUR == parent EUR exactly (spec
// §4). `extra(g, idx)` adds per-child fields (day, plate …).
function splitChildren(line, groups, lineLocal, useGross, extra) {
  const n = groups.length;
  const parentNetEur = line.net_eur || 0;
  const parentGrossEur = line.gross_eur || 0;
  let runNet = 0;
  let runGross = 0;
  return groups.map((g, idx) => {
    const num = localAmount(g, useGross);
    const ratio = lineLocal ? num / lineLocal : (n ? 1 / n : 0);
    let netEur;
    let vatEur;
    let grossEur;
    if (idx < n - 1) {
      netEur = round2(parentNetEur * ratio);
      grossEur = round2(parentGrossEur * ratio);
      runNet = round2(runNet + netEur);
      runGross = round2(runGross + grossEur);
    } else {
      netEur = round2(parentNetEur - runNet);
      grossEur = round2(parentGrossEur - runGross);
    }
    // vat = gross − net on EVERY child (not its own proportional rounding):
    // the table stores net and vat only, so each row's net+vat must be the
    // gross the gate certified; Σ children vat still equals the parent's
    // (parent vat = parent gross − parent net, parser rule 17/9).
    vatEur = round2(grossEur - netEur);
    return {
      ...line,
      service_date: g.service_date,
      period_from: null,
      period_to: null,
      net: g.net,
      vat: g.vat,
      gross: g.gross,
      net_eur: netEur,
      vat_eur: vatEur,
      gross_eur: grossEur,
      sub: idx + 1,
      split_from_seq: line.seq,
      passages_count: (g.passages || []).length,
      note: 'από λίστα διελεύσεων',
      service_date_source: 'passages',
      ...(extra ? extra(g, idx) : {}),
    };
  });
}

// Tolerance in the DOCUMENT currency: dozens of per-passage amounts each
// rounded to 2 decimals (0,1576 → 0,16) drift by more than 0,01 in CZK/HUF
// (7 Czech lines matched to 3 decimals and were still refused). 0,1% of
// the line, floor 0,05. The EUR side is exact regardless: children are
// scaled from the parent's EUR and the last day absorbs the remainder.
function amountTolerance(lineLocal) {
  return Math.max(0.05, Math.abs(lineLocal || 0) * 0.001);
}

export function splitByPassages(lines, passages) {
  const passagesList = passages || [];
  const errors = { split: [] };
  const out = [];
  let lines_split = 0;
  let lines_created = 0;

  for (const line of lines || []) {
    // w9 (17/9/2026): a toll line WITHOUT a vehicle (IT «Pedaggio», HR
    // «Cestarina» — the invoice prints one aggregate for the whole month and
    // every truck) is split over the passages list of THAT invoice: joined by
    // the passages doc's «Reference to the invoice» (the DKV ticket the
    // invoice prints as ticket_no) or its invoice number. The amount gate is
    // the line's base gross (Price/Unit × qty) — the only figure equal to Σ
    // «Imp. lordo»/«Bruto» of the passages (the line's net/gross also carry
    // DKV's service fee and VAT). Children take the group's plate and day, so
    // applyRules/matchRoundTrip downstream see a normal per-vehicle line.
    const isNoPlateTolls = !line.plate && line.category === 'tolls' && !!(line.doc_no || line.ticket_no);
    if (isNoPlateTolls) {
      const groups = passagesList
        .filter((g) => (line.ticket_no && g.invoice_ref === line.ticket_no) ||
          (line.doc_no && (g.invoice_no === line.doc_no || g.invoice_ref === line.doc_no)))
        .sort((a, b) => (a.service_date < b.service_date ? -1 : a.service_date > b.service_date ? 1 : String(a.plate || '').localeCompare(String(b.plate || ''))));
      const groupsSum = round2(groups.reduce((s, g) => s + localAmount(g, true), 0));
      // First of base gross / net / gross that the passages add up to.
      const candidates = [line.base_gross, line.net, line.gross].filter((v) => typeof v === 'number');
      const lineLocal = candidates.find((v) => Math.abs(groupsSum - v) <= amountTolerance(v));
      if (!groups.length || lineLocal === undefined) {
        errors.split.push({ doc_no: line.doc_no, seq: line.seq, reason: 'passages-sum-mismatch', line_net: line.net, line_base_gross: line.base_gross, passages_net: groupsSum, groups: groups.length });
        out.push({ ...line, service_date_source: 'invoice' });
        continue;
      }
      lines_split++;
      const children = splitChildren(line, groups, lineLocal, true, (g) => ({
        plate: g.plate || null,
        vehicle_raw: g.vehicle_raw || null,
        card_no: g.card_no || line.card_no || null,
        plate_source: 'passages',
      }));
      out.push(...children);
      lines_created += children.length;
      continue;
    }

    const isHalfMonthTolls = !!(line.period_from && line.period_to && line.category === 'tolls');
    if (!isHalfMonthTolls) {
      out.push(joinRefToPassages(line, passagesList));
      continue;
    }

    // DKV's day cut is not midnight: a passage on the 15th at night is billed
    // in the 16–31 statement, one on 31/07 in 01–15/08 (real ZIP 8/9: PL and
    // BG lines). So the period is widened by one day on each side; the amount
    // gate below is what decides whether the widened set is the right one.
    const from = shiftDay(line.period_from, -1);
    const to = shiftDay(line.period_to, 1);
    const groups = passagesList
      .filter((g) => g.plate && g.plate === line.plate && g.country === line.country &&
        g.service_date >= from && g.service_date <= to)
      .sort((a, b) => (a.service_date < b.service_date ? -1 : a.service_date > b.service_date ? 1 : 0));

    // Prefer net (0% VAT tolls, the common case); fall back to gross only
    // when the line itself has no net figure to compare against.
    const useGross = line.net == null && line.gross != null;
    const lineLocal = useGross ? line.gross : line.net;
    const groupsSum = round2(groups.reduce((s, g) => s + localAmount(g, useGross), 0));
    const tolerance = amountTolerance(lineLocal);
    const gateOk = lineLocal != null && groups.length > 0 && Math.abs(groupsSum - lineLocal) <= tolerance;

    if (!gateOk) {
      errors.split.push({
        doc_no: line.doc_no,
        seq: line.seq,
        reason: 'passages-sum-mismatch',
        line_net: line.net,
        passages_net: groupsSum,
        groups: groups.length,
      });
      out.push({ ...line, service_date_source: 'invoice' });
      continue;
    }

    lines_split++;
    const children = splitChildren(line, groups, lineLocal, useGross, null);
    out.push(...children);
    lines_created += children.length;
  }

  return { lines: out, errors, stats: { lines_split, lines_created } };
}

// ─── real day for ref-joined invoice lines (round 2, AT/SI/SK style) ────────
// The invoice's transaction number is the FULL number (e.g.
// "20260000000056155890"); the passages header only ever prints the tail
// ("Ref. 0000000056155890") — so the join is a SUFFIX match in either
// direction, never equality (verified against the real ZIP: an equality
// join found 0 matches). Only trusted when it resolves to exactly one
// passages group for the same plate — an ambiguous join is worse than none.
function joinRefToPassages(line, passagesList) {
  if (line.ref && line.plate) {
    const matches = passagesList.filter((g) =>
      g.plate === line.plate && g.ref && (line.ref.endsWith(g.ref) || g.ref.endsWith(line.ref))
    );
    if (matches.length === 1) {
      return {
        ...line,
        service_date: matches[0].service_date,
        passages_count: (matches[0].passages || []).length,
        service_date_source: 'passages',
      };
    }
  }
  return { ...line, service_date_source: 'invoice' };
}

// ─── round-trip matching (spec §4 "Σκορ ταιριάσματος") ──────────────────────
// ±1 day tolerance on the RT's own window (spec Δ1, 13/9): DKV bills the
// departure day before an RT's date_start (and, symmetrically, a day after
// date_end) — measured 13/9: 10 of 98 unallocated lines were 1-2 days before
// an RT start. Same one-day billing cut already tolerated when splitting
// half-month toll lines against passages (shiftDay above) — a 2+ day gap is
// still a genuine miss, not widened past.
function dateOverlaps(line, rt) {
  const start = rt.date_start;
  const end = rt.date_end || rt.date_start;
  if (!start) return false;
  const tolStart = shiftDay(start, -1);
  const tolEnd = shiftDay(end, 1);
  if (line.service_date) return line.service_date >= tolStart && line.service_date <= tolEnd;
  if (line.period_from && line.period_to) return line.period_from <= tolEnd && line.period_to >= tolStart;
  return false;
}

// Kept widened by the same ±1 day tolerance as dateOverlaps above — this
// picks the best of several overlapping candidates, so a candidate that only
// qualifies via the tolerance must count its days the same way, or the
// "most days wins" heuristic would silently ignore the extra day it was
// matched on.
function overlapDays(line, rt) {
  if (!rt.date_start) return 0;
  const start = shiftDay(rt.date_start, -1);
  const end = shiftDay(rt.date_end || rt.date_start, 1);
  const from = line.period_from || line.service_date;
  const to = line.period_to || line.service_date;
  if (!from || !to) return 0;
  const lo = from > start ? from : start;
  const hi = to < end ? to : end;
  if (lo > hi) return 0;
  return Math.round((new Date(hi) - new Date(lo)) / 86400000) + 1;
}

// rts: [{id, truck_id, status, date_start, date_end}], already filtered to
// status <> cancelled by the caller's DB query is fine, but this re-checks
// status too — a caller that forgets the filter must not silently match a
// cancelled round trip.
export function matchRoundTrip(line, rts, rules) {
  // DKV's own account/box fees (product_code seed 'dkv' — 0949, LI05/06,
  // 0BGS/CZS/DES/PLS/GRS, 0920, 0922, 01AP) are never a trip cost, no matter
  // what plate or date is printed on the line — a fee line naming a vehicle
  // is still an account-level charge, not that vehicle's expense (round 2
  // 8/9/2026). Checked first, before the plate/truck logic below, so it
  // wins even when the line otherwise looks fully resolved.
  if (line.category === 'dkv') {
    return { match: 'none', rt_id: null, alternatives: [], general: true, none_reason: 'general_fee' };
  }
  // Reverse-charge / general fees carry no vehicle at all (spec §1) — these
  // are never "unmatched", they are general by definition.
  if (!line.plate) {
    return { match: 'none', rt_id: null, alternatives: [], general: true, none_reason: 'no_plate' };
  }
  if (line.truck_id == null) {
    return { match: 'none', rt_id: null, alternatives: [], general: false, none_reason: 'unknown_plate' };
  }
  const candidates = (rts || []).filter(
    (rt) => rt.status !== 'cancelled' && rt.truck_id === line.truck_id && dateOverlaps(line, rt)
  );
  if (!candidates.length) return { match: 'none', rt_id: null, alternatives: [], general: false, none_reason: 'no_rt_on_date' };
  if (candidates.length === 1) return { match: 'sure', rt_id: candidates[0].id, alternatives: [], none_reason: null };

  const prefRule = (rules || []).find((r) => r.kind === 'rt_pref' && r.key === line.plate);
  let chosen = null;
  if (prefRule && prefRule.value && prefRule.value.rt_id != null) {
    chosen = candidates.find((c) => c.id === prefRule.value.rt_id) || null;
  }
  if (!chosen) {
    let best = null;
    for (const c of candidates) {
      const days = overlapDays(line, c);
      if (!best || days > best.days) best = { candidate: c, days };
    }
    chosen = best.candidate;
  }
  return {
    match: 'suggest',
    rt_id: chosen.id,
    alternatives: candidates.filter((c) => c.id !== chosen.id).map((c) => c.id),
    none_reason: null,
  };
}

// ─── proportional allocation of DKV account fees (spec Δ2, §Δ 13/9) ────────
// A DKV account/box fee (category 'dkv') is never itself a trip cost —
// matchRoundTrip above always returns none/general_fee for one, no matter
// what plate or date it carries — but it IS a real cost of running trucks
// during the statement period, so instead of sitting "προς ανάθεση" forever
// it is spread across the round trips that actually had DKV charges in that
// period, weighted by what each RT already owes there (owner decision 13/9,
// spec §0.5: "αναλογικά με τις χρεώσεις DKV κάθε δρομολογίου στην περίοδο").
// A fee naming a plate only ever lands on that vehicle's own RTs.

// The window used to find candidate RTs for a fee line: the line's own
// period_from/period_to when it has one (rare for a fee — only if it were
// ever half-month structured), ELSE the statement's own period (passed in by
// the caller, spec §5's ct_cost_docs.period_from/period_to) — a fee line
// genuinely covers the whole billing period, not the one calendar day it
// happens to be dated (owner rule, spec §0.5: "επιμερίζονται στα δρομολόγια
// της περιόδου"). dkv-parser gives every line a service_date, including a
// general fee (§1 makeLine) — using that as the window would only ever reach
// RTs within ±1 day of that one day, missing the rest of the period entirely
// (review finding, round 2: a fee dated 31/08 must still reach an RT from
// early in a 01-31/08 statement). service_date is only the LAST resort, for
// when no statement period was passed in at all. No date anywhere → nothing
// to compute a window from, line left exactly as it arrived (spec: "αν δεν
// υπάρχει, μένει ως έχει" — never guessed past).
function feeLinePeriod(line, statementPeriod) {
  if (line.period_from && line.period_to) return { from: line.period_from, to: line.period_to };
  if (statementPeriod && statementPeriod.period_from && statementPeriod.period_to) {
    return { from: statementPeriod.period_from, to: statementPeriod.period_to };
  }
  if (line.service_date) return { from: line.service_date, to: line.service_date };
  return null;
}

// Same ±1 day tolerance as dateOverlaps (Δ1) — a fee is billed on the same
// DKV departure-day cut as any other line.
function rtOverlapsPeriod(rt, period) {
  if (!rt.date_start) return false;
  const start = shiftDay(rt.date_start, -1);
  const end = shiftDay(rt.date_end || rt.date_start, 1);
  return period.from <= end && period.to >= start;
}

// Splits `total` (a single amount field on the parent, e.g. net or vat)
// across `weights` in proportion, 2dp, with the LAST share absorbing
// whatever rounding left behind so Σ shares === total exactly (same rule
// splitByPassages uses for its per-day EUR split). `total` not being a
// number (field absent on the parent) yields an array of nulls — a field the
// parent never carried is never invented on the children.
function splitAmount(total, weights, totalWeight) {
  if (typeof total !== 'number') return weights.map(() => null);
  const n = weights.length;
  const shares = [];
  let running = 0;
  weights.forEach((w, idx) => {
    if (idx < n - 1) {
      const share = round2(total * (w / totalWeight));
      shares.push(share);
      running = round2(running + share);
    } else {
      shares.push(round2(total - running));
    }
  });
  return shares;
}

// Amount fields mirrored onto children when the parent carries them — the
// same set toCostLineRow/splitByPassages deal in (native + EUR, net/vat/gross).
const FEE_AMOUNT_FIELDS = ['net', 'vat', 'gross', 'net_eur', 'vat_eur', 'gross_eur'];

// lines: the post-matchRoundTrip array (rt_id/match/import_key already set —
// a fee line needs OTHER lines' rt_id to weight against, so this must run
// after matchRoundTrip, not before it).
// rts: [{id, truck_id, status, date_start, date_end}] — same shape matchRoundTrip takes.
// statementPeriod: optional {period_from, period_to} — the whole import's
// own period, used as the last fallback when a fee has no date of its own.
export function allocateFees(lines, rts, statementPeriod) {
  const out = [];
  let fees_allocated = 0;
  let fee_children = 0;
  let fees_no_rt = 0;

  for (const line of lines || []) {
    const isFee = line.category === 'dkv' && (line.match === 'none' || line.rt_id == null);
    if (!isFee) {
      out.push(line);
      continue;
    }

    const period = feeLinePeriod(line, statementPeriod);
    if (!period) {
      // No date anywhere on the line and no statement period passed in —
      // nothing to compute a window from. Left completely untouched: this is
      // not the same as "no RT found" (fee_no_rt), no attempt was made.
      out.push(line);
      continue;
    }

    let candidateRts = (rts || []).filter((rt) => rt.status !== 'cancelled' && rtOverlapsPeriod(rt, period));
    // A fee naming a vehicle only ever spreads across that vehicle's own RTs.
    if (line.truck_id != null) candidateRts = candidateRts.filter((rt) => rt.truck_id === line.truck_id);
    // Eligible only if the RT already has at least one allocated line from
    // this same import to weight against — an RT with a date-window overlap
    // but nothing charged to it yet has nothing to share the fee proportionally to.
    const weighted = candidateRts
      .filter((rt) => (lines || []).some((l) => l.rt_id === rt.id))
      .map((rt) => ({
        rt,
        // Weight = the RT's own DKV charges this import (fuel/tolls/adblue/ferry —
        // every category except 'dkv' itself, which is the fee being spread).
        weight: (lines || [])
          .filter((l) => l.rt_id === rt.id && l.category !== 'dkv')
          .reduce((s, l) => s + (typeof l.net === 'number' ? l.net : 0), 0),
      }));
    const totalWeight = weighted.reduce((s, c) => s + c.weight, 0);

    if (!weighted.length || totalWeight <= 0) {
      // A fee is never "προς ανάθεση" like a normal unmatched line (spec §Γ)
      // — it gets its own reason so the screen can exclude it from that count.
      out.push({ ...line, none_reason: 'fee_no_rt' });
      fees_no_rt++;
      continue;
    }

    fees_allocated++;
    const weightsArr = weighted.map((c) => c.weight);
    const splitByField = {};
    for (const field of FEE_AMOUNT_FIELDS) splitByField[field] = splitAmount(line[field], weightsArr, totalWeight);

    weighted.forEach((c, idx) => {
      const child = {
        ...line,
        rt_id: c.rt.id,
        match: 'sure',
        alloc_status: 'allocated',
        none_reason: null,
        general: false,
        alternatives: [],
        sub: idx + 1,
        note: `επιμερισμός · ${line.note || ''}`,
      };
      // The Worker sets import_key on every line BEFORE this function runs
      // (matchRoundTrip step, index.js) — the `{...line}` spread above would
      // otherwise leave every child carrying the PARENT's key unchanged,
      // since sub alone doesn't retroactively change an already-computed
      // string. Recompute now that sub is set (buildImportKey's 7th field) so
      // each child gets its own key — the commit path only recomputes when
      // import_key is MISSING (index.js: `ln.import_key || buildImportKey(ln)`),
      // so a stale, duplicate key here would hit the 409 dedupe gate.
      child.import_key = buildImportKey(child);
      for (const field of FEE_AMOUNT_FIELDS) {
        const share = splitByField[field][idx];
        if (share !== null) child[field] = share;
      }
      // Same remainder rule as splitChildren: a child's vat is its gross − net.
      if (typeof child.gross_eur === 'number' && typeof child.net_eur === 'number') child.vat_eur = round2(child.gross_eur - child.net_eur);
      if (typeof child.gross === 'number' && typeof child.net === 'number') child.vat = round2(child.gross - child.net);
      out.push(child);
      fee_children++;
    });
  }

  return { lines: out, stats: { fees_allocated, fee_children, fees_no_rt }, errors: [] };
}

// ─── reconciliation (spec §6 gate #1) ───────────────────────────────────────
function grossEur(line) {
  const g = line.gross_eur != null ? line.gross_eur : line.gross;
  return typeof g === 'number' ? g : 0;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

// lines: invoice/statement/reverse_charge lines only (never passages — spec
// §6.1 "passages docs are not gated" holds automatically here because passage
// groups are never in this array, they live in parsed.passages instead).
// summaryDocs: parsed.summary.docs ({doc_no, total_eur, ...}).
// meta (optional, w9 17/9): { summary: parsed.summary, refunds: parsed.refunds }
// adds the E-SUMMARY footer checks — Σ rows == printed rows total, Σ REMOBIS
// refund documents == «VAT Refund total», rows − refund == «» Total» (what
// DKV collects). A footer figure that is missing fails its check: the gate
// never passes on silence (αρχή 1). Callers that pass no meta get the old
// per-document result unchanged (no `totals` key).
export function reconcile(lines, summaryDocs, meta) {
  const byDoc = new Map();
  for (const l of lines || []) {
    if (!l.doc_no) continue;
    byDoc.set(l.doc_no, (byDoc.get(l.doc_no) || 0) + grossEur(l));
  }
  const summaryByDoc = new Map((summaryDocs || []).map((d) => [d.doc_no, d]));
  const per_doc = [];
  let ok = true;
  for (const [doc_no, rawSum] of byDoc) {
    const parsed_gross = round2(rawSum);
    const summaryDoc = summaryByDoc.get(doc_no);
    const summary_total = summaryDoc ? summaryDoc.total_eur : null;
    const diff = summary_total != null ? round2(parsed_gross - summary_total) : null;
    const docOk = summary_total != null && Math.abs(diff) <= 0.01;
    if (!docOk) ok = false;
    per_doc.push({ doc_no, parsed_gross, summary_total, diff, ok: docOk });
  }
  if (!meta) return { ok, per_doc };

  const summary = meta.summary || {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const rowsSum = round2((summaryDocs || []).reduce((s, d) => s + (num(d.total_eur) || 0), 0));
  const rowsTotal = num(summary.rows_total_eur);
  // DKV prints the refund negative on the BG layout («VAT Refund total −1.395,21»);
  // reported as a positive receivable everywhere downstream.
  const vatRefund = Math.abs(num(summary.vat_refund_eur) || 0);
  const payable = num(summary.payable_eur);
  const refundDocs = round2((meta.refunds || []).reduce((s, r) => s + (num(r.total_eur) || 0), 0));
  const rows_ok = rowsTotal !== null && Math.abs(rowsSum - rowsTotal) <= 0.01;
  const refund_ok = Math.abs(refundDocs - vatRefund) <= 0.01;
  const payable_ok = payable !== null && rowsTotal !== null && Math.abs(round2(rowsTotal - vatRefund) - payable) <= 0.01;
  const totals = {
    rows_sum_eur: rowsSum,
    rows_total_eur: rowsTotal,
    vat_refund_eur: vatRefund,
    refund_docs_eur: refundDocs,
    payable_eur: payable,
    rows_ok,
    refund_ok,
    payable_ok,
    ok: rows_ok && refund_ok && payable_ok,
  };
  return { ok: ok && totals.ok, per_doc, totals };
}

export function sumGrossEur(lines) {
  return round2((lines || []).reduce((s, l) => s + grossEur(l), 0));
}

// ─── migration 024 not-yet-executed guard (spec: "code must cope with the
// table/columns missing: catch PostgREST 42P01/42703 and continue") ────────
const MISSING_RELATION_CODES = ['42P01', '42703'];
export function isMissingRelationError(message) {
  const s = String(message || '');
  return MISSING_RELATION_CODES.some((code) => s.includes(`"code":"${code}"`));
}

// ─── w11 θέμα 9 (owner 21/9): ONE line per RT × country × statement for tolls,
// ONE «Τέλη DKV» line per RT × statement for account fees ────────────────────
//
// WHY (measured 21/9 on the three imported statements): the Serbian toll
// statement lists every PASSAGE (115 / 75 / 118 lines → 18 / 11 / 19
// rt-day groups, up to 10 a day); allocateFees split every general fee into
// every RT of the period (374 children on doc 3, shares of 0,00–0,07 €,
// 531 rows without a truck, 220 with net 0). The accountant reads a trip as
// «Διόδια RS 250 €», not as eleven 4,62 € rows. Fuel / AdBlue / reefer are
// NEVER aggregated (Κ2 odometer per refuel, liters per fill, and the manual
// twin check below works per fill).
//
// Idempotent: a member of an earlier aggregation (a line carrying `details`)
// contributes its members again, so the commit can re-run the same function
// on lines the accountant re-assigned in the preview and still end with one
// line per key. Sums are exact: every member already has 2 decimals, so the
// sum of members == round2(sum) and the E-SUMMARY gate is untouched.
const AGG_TOLL_CATEGORIES = new Set(['tolls']);
const AGG_AMOUNT_FIELDS = ['net', 'vat', 'gross', 'net_eur', 'vat_eur', 'gross_eur'];

function memberOf(line) {
  return {
    date: line.service_date || line.line_date || null,
    seq: line.seq != null ? line.seq : null,
    ref: line.ref || null,
    doc_no: line.doc_no || null,
    product: line.product || null,
    country: line.toll_country || line.country || null,
    net_eur: typeof line.net_eur === 'number' ? line.net_eur : (typeof line.net === 'number' ? line.net : null),
    vat_eur: typeof line.vat_eur === 'number' ? line.vat_eur : (typeof line.vat === 'number' ? line.vat : null),
    gross_eur: typeof line.gross_eur === 'number' ? line.gross_eur : (typeof line.gross === 'number' ? line.gross : null),
    net: typeof line.net === 'number' ? line.net : null,
    vat: typeof line.vat === 'number' ? line.vat : null,
    gross: typeof line.gross === 'number' ? line.gross : null,
    currency: line.currency || null,
    import_key: line.import_key || buildImportKey(line),
  };
}

function sumField(members, field) {
  let any = false; let total = 0;
  for (const m of members) { if (typeof m[field] === 'number') { any = true; total += m[field]; } }
  return any ? round2(total) : null;
}

function isoDayDiff(a, b) {
  if (!a || !b) return null;
  return Math.round((Date.parse(String(b).slice(0, 10)) - Date.parse(String(a).slice(0, 10))) / 86400000);
}

/**
 * aggregateLines(lines, { statementDocNo, rts })
 *   - tolls with an rt_id: key = doc_no|rt_id|country → one line
 *   - fee children (category 'dkv', rt_id set): key = rt_id → one «Τέλη DKV» line per RT
 *   - everything else (fuel family, unallocated tolls, ferries, fines, other) passes through
 * Returns { lines, stats:{ toll_groups, toll_members, fee_groups, fee_members } }.
 */
export function aggregateLines(lines, opts = {}) {
  const statementDocNo = opts.statementDocNo || null;
  const rtById = new Map((opts.rts || []).map((r) => [r.id, r]));
  const out = [];
  const tollGroups = new Map();
  const feeGroups = new Map();
  const order = []; // first-seen order of group keys, to keep the preview stable

  for (const line of lines || []) {
    const members = Array.isArray(line.details) && line.details.length ? line.details : [memberOf(line)];
    if (AGG_TOLL_CATEGORIES.has(line.category) && line.rt_id != null) {
      const cc = line.toll_country || line.country || '';
      const key = `${line.doc_no || ''}|${line.rt_id}|${cc}`;
      if (!tollGroups.has(key)) { tollGroups.set(key, { first: line, members: [] }); order.push(['toll', key]); }
      tollGroups.get(key).members.push(...members);
      continue;
    }
    if (line.category === 'dkv' && line.rt_id != null) {
      const key = String(line.rt_id);
      if (!feeGroups.has(key)) { feeGroups.set(key, { first: line, members: [] }); order.push(['fee', key]); }
      feeGroups.get(key).members.push(...members);
      continue;
    }
    out.push(line);
  }

  let toll_members = 0; let fee_members = 0;
  for (const [kind, key] of order) {
    const g = kind === 'toll' ? tollGroups.get(key) : feeGroups.get(key);
    const first = g.first;
    const members = g.members.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (a.seq || 0) - (b.seq || 0));
    const dates = members.map((m) => m.date).filter(Boolean).sort();
    const from = dates[0] || first.service_date || null;
    const to = dates[dates.length - 1] || first.service_date || null;
    const agg = { ...first, details: members, agg: { kind: kind === 'toll' ? 'tolls' : 'fees', count: members.length, from, to } };
    for (const f of AGG_AMOUNT_FIELDS) agg[f] = sumField(members, f);
    // a single-member group is still «aggregated» (same shape, same key) — the
    // preview shows it plainly, the commit treats it identically
    agg.service_date = to;
    agg.line_date = to;
    agg.sub = '';
    // the worst member status wins: a group with one «suggest» member still
    // needs the accountant's eye
    const statuses = (lines || []).filter((l) => l.rt_id === first.rt_id && (kind === 'toll' ? AGG_TOLL_CATEGORIES.has(l.category) : l.category === 'dkv')).map((l) => l.match);
    agg.match = statuses.includes('none') ? 'none' : statuses.includes('suggest') ? 'suggest' : (first.match || 'sure');
    const span = from && to && from !== to ? `${fmtDM(from)}–${fmtDM(to)}` : fmtDM(to);
    if (kind === 'toll') {
      const cc = first.toll_country || first.country || '';
      agg.toll_country = cc || null;
      agg.note = `Διόδια ${cc} · ${span} · ${members.length} ${members.length === 1 ? 'διέλευση' : 'διελεύσεις'} · DKV ${first.doc_no || ''}`.trim();
      agg.import_key = `${first.doc_no || ''}|AGG|${first.plate || ''}|${first.rt_id}|tolls|${cc}`;
      toll_members += members.length;
    } else {
      const rt = rtById.get(first.rt_id);
      const docNo = statementDocNo || first.doc_no || '';
      const sources = new Set(members.map((m) => `${m.doc_no || ''}/${m.seq != null ? m.seq : ''}`));
      agg.toll_country = null;
      agg.country = null;
      agg.product = 'Τέλη DKV';
      if (rt && rt.truck_id != null && agg.truck_id == null) agg.truck_id = rt.truck_id;
      agg.note = `Τέλη DKV · κατάσταση ${docNo} · ${sources.size} ${sources.size === 1 ? 'πηγή' : 'πηγές'} · επιμερισμός κατά καθαρό`;
      agg.import_key = `${docNo}|AGG|${first.rt_id}|dkv`;
      fee_members += members.length;
    }
    out.push(agg);
  }
  return { lines: out, stats: { toll_groups: tollGroups.size, toll_members, fee_groups: feeGroups.size, fee_members } };
}

function fmtDM(iso) {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}

// ─── w11 θέμα 0 (owner 21/9): manual lines that the statement now repeats ───
//
// Measured 21/9: the accountant enters a refuel from the receipt (pay_source
// DKV) days before the DKV statement arrives; when the statement is imported
// the same fill appears again. The three real pairs matched on LITERS exactly
// (100 / 200 / 29,57 L) while the amounts differed 3–6 % (receipt price vs
// statement price + VAT) — so the key is liters for the fuel family and the
// gross ±0,02 for everything else, same vehicle (truck or RT), ±1 day.
// The category may differ inside the fuel family (a manual «reefer» fill that
// the statement files under diesel), so the family, not the exact category.
const FUEL_FAMILY = new Set(['fuel', 'reefer_fuel', 'adblue']);

function grossOf(line) {
  if (typeof line.gross_eur === 'number') return line.gross_eur;
  const n = typeof line.net === 'number' ? line.net : Number(line.net || 0);
  const v = typeof line.vat === 'number' ? line.vat : Number(line.vat || 0);
  return round2(n + v);
}
function litersOf(line) {
  if (line.liters != null) return Number(line.liters);
  if (line.unit && LITRE_UNITS.has(String(line.unit).toUpperCase()) && line.quantity != null) return Number(line.quantity);
  return null;
}

/**
 * findManualTwins(importLines, manualRows)
 *   importLines: preview/commit lines (import_key, rt_id, truck_id, category, service_date/line_date, liters/quantity, amounts)
 *   manualRows:  ct_cost_lines rows with doc_id IS NULL (id, rt_id, truck_id, category, line_date, liters, net, vat, note, pay_source, created_by)
 * Returns [{ import_key, manual_id, reason:'liters'|'gross', manual:{…}, line:{…} }] — one entry per (import line, manual row) pair.
 */
export function findManualTwins(importLines, manualRows) {
  const twins = [];
  for (const line of importLines || []) {
    if (line.category === 'dkv') continue; // account fees never have a receipt
    const lineDate = line.line_date || line.service_date || null;
    if (!lineDate) continue;
    const lineLiters = litersOf(line);
    const lineGross = grossOf(line);
    const fuel = FUEL_FAMILY.has(line.category);
    for (const m of manualRows || []) {
      if (m.doc_id != null) continue;
      const sameVehicle = (line.rt_id != null && m.rt_id != null && Number(m.rt_id) === Number(line.rt_id))
        || (line.truck_id != null && m.truck_id != null && Number(m.truck_id) === Number(line.truck_id));
      if (!sameVehicle) continue;
      const dd = isoDayDiff(lineDate, m.line_date);
      if (dd == null || Math.abs(dd) > 1) continue;
      let reason = null;
      if (fuel && FUEL_FAMILY.has(m.category)) {
        const ml = m.liters != null ? Number(m.liters) : null;
        if (lineLiters != null && ml != null && Math.abs(lineLiters - ml) < 0.005) reason = 'liters';
      } else if (!fuel && m.category === line.category) {
        const mg = round2(Number(m.net || 0) + Number(m.vat || 0));
        if (Math.abs(mg - lineGross) <= 0.02) reason = 'gross';
      }
      if (!reason) continue;
      twins.push({
        import_key: line.import_key || buildImportKey(line),
        manual_id: m.id,
        reason,
        manual: { id: m.id, rt_id: m.rt_id, category: m.category, line_date: m.line_date, liters: m.liters, gross: round2(Number(m.net || 0) + Number(m.vat || 0)), note: m.note || null, pay_source: m.pay_source || null, created_by: m.created_by || null },
        line: { category: line.category, date: lineDate, liters: lineLiters, gross: lineGross, plate: line.plate || null, rt_id: line.rt_id != null ? line.rt_id : null }
      });
    }
  }
  return twins;
}

