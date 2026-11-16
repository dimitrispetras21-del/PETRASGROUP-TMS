// ═══════════════════════════════════════════════════════════════════════════
// ONE LOAD, MANY ORDERS — the pure rules every screen uses to put a groupage together (owner 15–16/11/2026).
//
// Why one file: the board, the round-trip feed, the order form, the driver sheet (print.html, which loads no module)
// and «Παραγγελίες › Εβδομάδα» each assembled a load on their own. When one of them changed, the others did not
// (principle 3). Plain functions, no DOM, no fetch except readMembers (which calls the page's atGetAll).
//
// What a member carries (modules/orders_intl_group.js):
//   - Group ID «base|id1,id2,…»: while a save is running every member has the base only; when it ends, the full
//     text with the order list. A save that stops half-way leaves members with different texts, so a load is
//     always joined by its BASE, never by the identical text.
//   - each stop: its place in the load, «Load Seq» (113), counted separately for loadings and for deliveries.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
'use strict';

// «GRP-X|a,b» → «GRP-X». Empty for no group.
function base(gid) { return String(gid == null ? '' : gid).split('|')[0].trim(); }
function sameLoad(a, b) { const x = base(a); return !!x && x === base(b); }
// The one membership rule (code review 16/11). A live order is in the load of its base. A CANCELLED order is not on
// the truck: it counts only with a text identical to the one asked or to a live member's (as before 16/11, when only
// the identical text joined) — by base alone, a cancelled order with an older text would come back into the load.
// recs = every order read for that base; → the members, in the order given.
function membersOf(recs, gid, withCancelled) {
  const t = r => String(((r && r.fields) || {})['Group ID'] || '').trim();
  const dead = r => ((r && r.fields) || {})['Status'] === 'Cancelled';
  const mine = (recs || []).filter(r => sameLoad(t(r), gid));
  if (!withCancelled) return mine.filter(r => !dead(r));
  const texts = new Set(mine.filter(r => !dead(r)).map(t).concat([String(gid == null ? '' : gid).trim()]));
  return mine.filter(r => !dead(r) || texts.has(t(r)));
}
// The order list of a load, from the first member that carries one (a member saved before the save stopped has none).
function orderList(recs) {
  for (const r of recs || []) {
    const l = (String(((r && r.fields) || {})['Group ID'] || '').split('|')[1] || '').split(',').filter(Boolean);
    if (l.length) return l;
  }
  return [];
}
// The facade filter that finds every member by base. The facade has no «starts with» (formula-translate.js), so
// this asks for «contains» and the caller keeps only sameLoad — a base that is part of another base is dropped there.
// A base with a quote cannot go inside SEARCH(LOWER("…")); then the identical text is asked, as before 16/11, inside
// the other quote (the facade's equality does not unescape \'). A text with both quotes cannot be asked at all: null.
function membersFormula(gid) {
  const b = base(gid);
  if (!b) return null;
  if (!/["'\\]/.test(b)) return `SEARCH(LOWER("${b}"), LOWER({Group ID}))`;
  const t = String(gid).trim();
  if (!t.includes('"')) return `{Group ID}="${t}"`;
  if (!t.includes("'")) return `{Group ID}='${t}'`;
  return null;
}
// Every LIVE member of the load of `gid`, read from the server. Throws when the read fails: «the group could not be
// read» is never the same as «the group has one member». A cancelled order is not on the truck: by base it can come
// back with an older text, and given the truck again it would be «Assigned» again (code review 16/11). withCancelled:
// also the cancelled members with the load's identical text (membersOf) — a clear must take the truck off them too.
async function readMembers(gid, useCache, withCancelled) {
  const f = membersFormula(gid);
  if (!f) { if (base(gid)) throw new Error('Group ID με χαρακτήρες που δεν αναζητούνται'); return []; }
  const recs = await atGetAll(TABLES.ORDERS, { filterByFormula: f }, !!useCache);
  return membersOf(recs, gid, withCancelled);
}

// The stored places of one side of a load are used only when every point has one and no two share it (the rule
// written in DECISION_LOG with 113); anything else falls back to the old rule — never a guessed order.
function seqUsable(vals) {
  if (!vals || !vals.length) return false;
  const n = vals.map(v => (v == null || v === '' ? NaN : Number(v)));
  return n.every(x => Number.isInteger(x) && x > 0) && new Set(n).size === n.length;
}
// The list sorted by its places, or null when the places are not usable (the caller then keeps its own rule).
function sortBySeq(list, seqOf) {
  const vals = (list || []).map(seqOf);
  if (!seqUsable(vals)) return null;
  return list.slice().sort((a, b) => Number(seqOf(a)) - Number(seqOf(b)));
}

// The orders of one round trip in the order of their load (113): items = [{ rec, stops }] in the trip's order.
// The members of one load keep the slots they hold in the list and are put in the order of their first point on the
// side the load's order is set for (export: deliveries, import: loadings — the same side as the Group ID list), when
// the places of that side are usable across the load. Otherwise, and for every order outside a groupage, the list
// stays exactly as it came.
function orderByLoad(items) {
  const out = (items || []).slice();
  const groups = {};
  out.forEach((it, k) => {
    const b = base(((it && it.rec && it.rec.fields) || {})['Group ID']);
    if (b) (groups[b] = groups[b] || []).push(k);
  });
  for (const slots of Object.values(groups)) {
    if (slots.length < 2) continue;
    const members = slots.map(k => out[k]);
    const dirs = new Set(members.map(it => (it.rec.fields || {})['Direction']));
    if (dirs.size !== 1) continue;
    const type = dirs.has('Import') ? 'Loading' : 'Unloading';
    const pts = [];
    members.forEach((it, m) => (it.stops || []).forEach(s => {
      if (((s && s.fields) || {})['Stop Type'] === type) pts.push({ m, seq: s.fields['Load Seq'] });
    }));
    const sorted = sortBySeq(pts, p => p.seq);
    if (!sorted) continue;
    const first = members.map((_, m) => { const k = sorted.findIndex(p => p.m === m); return k < 0 ? 1e6 : k; });
    const order = members.map((_, m) => m).sort((a, b) => first[a] - first[b] || a - b);
    slots.forEach((k, j) => { out[k] = members[order[j]]; });
  }
  return out;
}

// The day an order writes as «Loading DateTime» / «Delivery DateTime»: the earliest of its points of that type, not
// the first point in the panel (a drag can put a later day first). Compared as text ('YYYY-MM-DD[THH:MM…]', one
// format per form), so two points on one day give the earlier time. A point without one does not count. null when
// no point has a day.
function earliest(dates) {
  const d = (dates || []).filter(x => x != null && String(x).trim() !== '').map(String);
  if (!d.length) return null;
  return d.reduce((a, b) => (b < a ? b : a));
}

const LoadGroup = Object.freeze({ base, sameLoad, membersOf, orderList, membersFormula, readMembers, seqUsable, sortBySeq, orderByLoad, earliest });
// node: a module; anywhere else a global of the realm that loads it (the page, print.html, a test's vm context —
// readMembers then calls that realm's atGetAll)
if (typeof module !== 'undefined' && module.exports) module.exports = LoadGroup;
else globalThis.LoadGroup = LoadGroup;
})();
