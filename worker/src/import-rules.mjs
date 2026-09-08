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
const LITRE_UNITS = new Set(['LTR', 'L', 'LT', 'LITER', 'LITRE']);
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

export function splitByPassages(lines, passages) {
  const passagesList = passages || [];
  const errors = { split: [] };
  const out = [];
  let lines_split = 0;
  let lines_created = 0;

  for (const line of lines || []) {
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
    // Tolerance in the DOCUMENT currency: dozens of per-passage amounts each
    // rounded to 2 decimals (0,1576 → 0,16) drift by more than 0,01 in CZK/HUF
    // (7 Czech lines matched to 3 decimals and were still refused). 0,1% of
    // the line, floor 0,05. The EUR side is exact regardless: children are
    // scaled from the parent's EUR and the last day absorbs the remainder.
    const tolerance = Math.max(0.05, Math.abs(lineLocal || 0) * 0.001);
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
    const n = groups.length;
    const parentNetEur = line.net_eur || 0;
    const parentVatEur = line.vat_eur || 0;
    const parentGrossEur = line.gross_eur || 0;
    let runNet = 0;
    let runVat = 0;
    let runGross = 0;
    groups.forEach((g, idx) => {
      const num = localAmount(g, useGross);
      const ratio = lineLocal ? num / lineLocal : (n ? 1 / n : 0);
      let netEur;
      let vatEur;
      let grossEur;
      if (idx < n - 1) {
        netEur = round2(parentNetEur * ratio);
        vatEur = round2(parentVatEur * ratio);
        grossEur = round2(parentGrossEur * ratio);
        runNet = round2(runNet + netEur);
        runVat = round2(runVat + vatEur);
        runGross = round2(runGross + grossEur);
      } else {
        // LAST day (chronologically) absorbs whatever rounding left behind,
        // so Σ children EUR == parent EUR exactly (spec §4).
        netEur = round2(parentNetEur - runNet);
        vatEur = round2(parentVatEur - runVat);
        grossEur = round2(parentGrossEur - runGross);
      }
      out.push({
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
      });
      lines_created++;
    });
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
function dateOverlaps(line, rt) {
  const start = rt.date_start;
  const end = rt.date_end || rt.date_start;
  if (!start) return false;
  if (line.service_date) return line.service_date >= start && line.service_date <= end;
  if (line.period_from && line.period_to) return line.period_from <= end && line.period_to >= start;
  return false;
}

function overlapDays(line, rt) {
  const start = rt.date_start;
  const end = rt.date_end || rt.date_start;
  const from = line.period_from || line.service_date;
  const to = line.period_to || line.service_date;
  if (!from || !to || !start) return 0;
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
export function reconcile(lines, summaryDocs) {
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
  return { ok, per_doc };
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
