#!/usr/bin/env python3
"""Deterministic plan builder. The graph (which sheets continue which, what an
opening balance means, which Excel trip is which RT) is decided by people or by
the analyst agents in work/decisions/<key>.json; everything that follows from
those decisions — thousands of rows, break lines, patches, sums — is built here,
the same way every time. Anything the rules cannot settle becomes a precise
needs_decision question instead of a guess."""
import argparse, datetime as dt, glob, hashlib, json, os, sys
from collections import Counter
from decimal import Decimal
from rules import d2

HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.join(HERE, 'work')
TOL = Decimal('0.05')

def file_sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()

def delta(e):
    if e['entry_type'] == 'trip': return d2(e.get('trip_value')) - (d2(e.get('advance')) - d2(e.get('expenses')))
    if e['entry_type'] == 'adjustment': return d2(e['amount'])
    return -d2(e['amount'])

def sig(e):
    """Row identity for duplicate/crosscheck comparison: what money moved, when."""
    return (e['entry_type'], e['entry_date'], e.get('trip_value'), e.get('advance'), e.get('expenses'), e.get('amount'))

def adj(date, amount, note, src):
    return {'entry_type': 'adjustment', 'entry_date': date, 'amount': float(d2(amount)), 'note': note, 'src': src}

def clean(e, src):
    out = {k: v for k, v in e.items() if v is not None}
    out['src'] = src
    return out

def build_plan(key, entry, nodes, auto_rows, decision, file_hashes=None):
    dec = decision or {}
    file_hashes = file_hashes or {}
    needs = list(dec.get('needs_decision', [])); warnings = []
    files = entry.get('files', [])
    dec_nodes = {(d['file_id'], d['sheet']): d for d in dec.get('nodes', [])}
    dec_open = {(d['file_id'], d['sheet']): d for d in dec.get('openings', [])}
    dec_carry = {(d['file_id'], d['sheet'], d['row']): d for d in dec.get('carries', [])}
    settled = {(d['file_id'], d['sheet']) for d in dec.get('settled', [])}
    overlaps_ok = {tuple(x) for x in dec.get('overlaps_ok', [])}          # pairs of sheet names whose date overlap a human accepted
    date_overrides = {(d['file_id'], d['sheet'], d['row']): d for d in dec.get('date_overrides', [])}
    if dec.get('skip'):
        # Owner 6/9/2026: an inactive driver's unresolved past is not imported — a returning
        # driver starts from zero. The plan says so instead of pretending to be ready.
        return {'driver_key': key, 'driver_id': entry.get('driver_id'), 'create_driver': entry.get('create'), 'nodes': [], 'batches': [], 'patches': [],
                'cutoff': None, 'auto_unmatched': [], 'date_fixes': [], 'needs_decision': ['ΠΑΡΑΛΕΙΨΗ: ' + str(dec.get('skip_why', 'απόφαση'))],
                'warnings': [], 'crosscheck': {}, 'expected_total_balance': '0.00', 'status': 'skip'}
    canon = [n for f in files for n in nodes if n['file_id'] == f]
    cross = [n for n in nodes if n['file_id'] in entry.get('crosscheck', [])]
    roles = {}
    for n in canon:
        k = (n['file_id'], n['sheet'])
        roles[k] = dec_nodes[k]['role'] if k in dec_nodes else ('out_of_scope' if n['out_of_scope'] or n['n_rows'] == 0 else 'chain')
    chain = sorted([n for n in canon if roles[(n['file_id'], n['sheet'])] == 'chain'], key=lambda n: (n['first_date'] or '9999', files.index(n['file_id'])))
    # rule 3 — auto-duplicate: every row of A appears in B ⇒ A is an extract of B
    sigs = {(n['file_id'], n['sheet']): Counter(sig(r['entry']) for r in n['rows'] if r['entry']['entry_type'] != 'carry') for n in chain}
    non_carry_counts = {(n['file_id'], n['sheet']): sum(1 for r in n['rows'] if r['entry']['entry_type'] != 'carry') for n in chain}
    for a in list(chain):
        ka = (a['file_id'], a['sheet'])
        if ka in dec_nodes or not a['rows']: continue
        a_sigs = sigs[ka]
        if not a_sigs: continue  # skip if all rows are carry rows
        for b in chain:
            kb = (b['file_id'], b['sheet'])
            if kb == ka or non_carry_counts[kb] <= non_carry_counts[ka]: continue
            if all(sigs[kb][s] >= c for s, c in a_sigs.items()):
                roles[ka] = 'duplicate'; chain.remove(a); warnings.append('%s/%s: rows ⊆ %s/%s → duplicate' % (a['file_id'][:8], a['sheet'], b['file_id'][:8], b['sheet'])); break
    # rule 2 — overlapping chain nodes
    for i in range(1, len(chain)):
        if (chain[i - 1]['sheet'], chain[i]['sheet']) in overlaps_ok: continue
        if chain[i - 1]['last_date'] and chain[i]['first_date'] and chain[i]['first_date'] < chain[i - 1]['last_date']:
            needs.append('φύλλα %s και %s επικαλύπτονται χρονικά (%s > %s)' % (chain[i - 1]['sheet'], chain[i]['sheet'], chain[i - 1]['last_date'], chain[i]['first_date']))
    plan_nodes = [{'file_id': n['file_id'], 'file_name': n['file_name'], 'sheet': n['sheet'], 'role': roles[(n['file_id'], n['sheet'])],
                   'expected_final': n['expected_final'], 'opening_carry_skipped': False, 'why': dec_nodes.get((n['file_id'], n['sheet']), {}).get('why')} for n in canon]
    pn = {(x['file_id'], x['sheet']): x for x in plan_nodes}
    # rules 4-7 — emit lines per chain node
    lines = []          # (file_id, entry dict with src)
    prev_final = None; prev_node = None; date_fixes = []
    for n in chain:
        k = (n['file_id'], n['sheet']); node_lines = []; src0 = {'file_id': n['file_id'], 'sheet': n['sheet']}
        first_date = n['first_date']; last_date = n['last_date']
        # continuity / settlement of the previous sheet
        opening = d2(n['opening_balance']) if n.get('opening_balance') else None
        first_carry = next((r for r in n['rows'] if r['entry']['entry_type'] == 'carry'), None)
        carries_prev = (opening is not None and prev_final is not None and abs(opening - prev_final) <= TOL) or \
                       (first_carry is not None and prev_final is not None and abs(d2(first_carry['entry']['amount']) - prev_final) <= TOL)
        if prev_node is not None and prev_final is not None and abs(prev_final) > TOL and not carries_prev:
            pk = (prev_node['file_id'], prev_node['sheet'])
            if pk in settled:
                lines.append((prev_node['file_id'], adj(prev_node['last_date'], -prev_final, 'εξόφληση εκτός καρτέλας (απόφαση αναλυτή): %s' % next(d.get('why', '—') for d in dec['settled'] if (d['file_id'], d['sheet']) == pk), {'file_id': pk[0], 'sheet': pk[1], 'row': None})))
            else:
                needs.append('το φύλλο %s κλείνει με %s και το επόμενο (%s) ξεκινά από 0 — εξοφλήθηκε εκτός καρτέλας;' % (prev_node['sheet'], prev_final, n['sheet']))
        # opening balance
        skipped = Decimal('0'); opening_event = None
        if opening is not None and opening != 0:
            action = dec_open.get(k, {}).get('action') or ('skip' if carries_prev else 'adjust')
            if action == 'skip': skipped += opening; opening_event = opening
            else:
                if abs(opening) > 1000 and k not in dec_open: needs.append('υπόλοιπο έναρξης %s στο φύλλο %s χωρίς προηγούμενο φύλλο που να το εξηγεί' % (opening, n['sheet']))
                node_lines.append(adj(first_date, opening, 'υπόλοιπο έναρξης φύλλου %s στο Excel' % n['sheet'], dict(src0, row=None)))
        breaks = {}
        for b in n.get('running_breaks', []): breaks.setdefault(b['row'], []).append(b)
        for r in n['rows']:
            e = r['entry']; src = dict(src0, row=r['row'])
            if r.get('date_fix'): date_fixes.append(dict(r['date_fix'], sheet=n['sheet'], row=r['row']))
            ok_ = (n['file_id'], n['sheet'], r['row'])
            if ok_ in date_overrides and e['entry_type'] != 'carry':
                o = date_overrides[ok_]; e = dict(e)
                e['note'] = ((e.get('note') or '') + ' · ' if e.get('note') else '') + 'ημ/νία Excel %s → %s (απόφαση: %s)' % (e['entry_date'], o['entry_date'], o.get('why', '—'))
                date_fixes.append({'from': e['entry_date'], 'to': o['entry_date'], 'note': 'απόφαση', 'sheet': n['sheet'], 'row': r['row']})
                e['entry_date'] = o['entry_date']
            # I2: a negative trip_value/advance/expenses in the Excel is almost always a
            # typo or a sign error, not a real reversal — a human decides, the row still
            # passes through so the sheet's own arithmetic checks below stay meaningful.
            if e['entry_type'] == 'trip' and any(e.get(f) is not None and e[f] < 0 for f in ('trip_value', 'advance', 'expenses')):
                needs.append('αρνητικό ποσό σε δρομολόγιο: %s γρ. %d' % (n['sheet'], r['row']))
            if e['entry_type'] == 'carry':
                if d2(e['amount']) == 0:
                    continue
                # the inventory derives opening_balance from the carry row, so opening and
                # first carry are one event; skip the carry without double-counting
                if r is first_carry and opening_event is not None and abs(d2(e['amount']) - opening_event) <= TOL:
                    breaks.pop(r['row'], None); continue
                ck = (n['file_id'], n['sheet'], r['row'])
                action = dec_carry.get(ck, {}).get('action') or ('skip' if (r is first_carry and carries_prev) else 'adjust')
                if action == 'skip': skipped += d2(e['amount'])
                else:
                    if abs(d2(e['amount'])) > 1000 and ck not in dec_carry: needs.append('μεταφορά υπολοίπου %s στο φύλλο %s γρ. %d χωρίς προηγούμενο φύλλο που να την εξηγεί' % (e['amount'], n['sheet'], r['row']))
                    node_lines.append(adj(e['entry_date'], e['amount'], 'μεταφορά υπολοίπου από Excel %s γρ. %d' % (n['sheet'], r['row']), src))
                breaks.pop(r['row'], None)
            else:
                node_lines.append(clean(e, src))
            for b in breaks.get(r['row'], []):
                node_lines.append(adj(b['entry_date'], b['diff'], 'διαφορά ΠΡΟΟΔΕΥΤΙΚΟΥ στο Excel, φύλλο %s γρ. %d: %s' % (n['sheet'], r['row'], b['diff']), dict(src0, row=r['row'])))
        if n.get('rounding_residual'):
            node_lines.append(adj(last_date, n['rounding_residual'], 'διαφορά στρογγυλοποίησης Excel, φύλλο %s: %s' % (n['sheet'], n['rounding_residual']), dict(src0, row=None)))
        for u in n.get('unknown', []): needs.append('%s γρ. %d: %s' % (n['sheet'], u['row'], u['reason']))
        for t in n.get('text_amount_rows', []): needs.append('ποσό ως κείμενο: %s γρ. %d/%s/%s' % (n['sheet'], t['row'], t['field'], t['text']))
        for r in n['rows']:
            if r.get('date_problem') and (n['file_id'], n['sheet'], r['row']) not in date_overrides: needs.append('%s γρ. %d: %s' % (n['sheet'], r['row'], r['date_problem']))
        if n.get('running_consistent') is False: needs.append('%s: το ΠΡΟΟΔΕΥΤΙΚΟ του Excel δεν συμφωνεί με τις γραμμές (raw %s, αναμενόμενο %s)' % (n['sheet'], n.get('raw_final'), n['expected_final']))
        node_final = sum((delta(x) for x in node_lines), Decimal('0'))
        running_final = node_final + skipped
        pn[k]['opening_carry_skipped'] = skipped != 0
        if n['expected_final'] is None: needs.append('%s: χωρίς ΠΡΟΟΔΕΥΤΙΚΟ και χωρίς στήλη ΥΠΟΛΟΙΠΟ' % n['sheet'])
        else:
            expected = d2(n['expected_final']) - skipped
            if abs(node_final - expected) > Decimal('0.005'): needs.append('%s: άθροισμα γραμμών %s ≠ expected_final %s' % (n['sheet'], node_final, n['expected_final']))
        lines.extend((n['file_id'], x) for x in node_lines)
        prev_final, prev_node = running_final, n
    # rule 8 — crosscheck
    chain_sigs = Counter(sig(x) for _, x in lines if x['entry_type'] != 'adjustment')
    crosscheck = {}
    for c in cross:
        missing = sum(max(0, cnt - chain_sigs.get(s, 0)) for s, cnt in Counter(sig(r['entry']) for r in c['rows'] if r['entry']['entry_type'] != 'carry').items())
        crosscheck[c['file_id']] = crosscheck.get(c['file_id'], 0) + missing
    # rule 9 — RT overlap
    driver_id = entry.get('driver_id')
    auto = sorted([a for a in auto_rows if driver_id and a['driver_id'] == driver_id], key=lambda a: a['entry_date'])
    cutoff = None; patches = []; used = set()
    if auto:
        cutoff = (dt.date.fromisoformat(auto[0]['entry_date']) - dt.timedelta(days=1)).isoformat()
        forced = {}; unmatched_forced = set()
        for m in dec.get('matches', []):
            if m.get('src') is None: unmatched_forced.add(m['dl_id'])
            else: forced[(m['src']['file_id'], m['src']['sheet'], m['src']['row'])] = m['dl_id']
        matchable = {a['dl_id']: a for a in auto if a.get('trip_value') is None and a['dl_id'] not in unmatched_forced}
        # Phase 1 — score every (post-cutoff trip, auto row) pair. A one-day local trip
        # and a week-long RT can share a start date; the return date tells them apart.
        pairs = []; assigned = {}          # excel index -> dl_id
        for i, (fid, x) in enumerate(lines):
            if x['entry_type'] != 'trip' or x['entry_date'] <= cutoff: continue
            sk = (x['src']['file_id'], x['src']['sheet'], x['src']['row'])
            if sk in forced:
                if forced[sk] in matchable: assigned[i] = forced[sk]
                continue
            d0 = dt.date.fromisoformat(x['entry_date']); e0 = dt.date.fromisoformat(x['date_end']) if x.get('date_end') else None
            for a in matchable.values():
                ds = abs((dt.date.fromisoformat(a['entry_date']) - d0).days)
                if ds > 2: continue
                de = abs((dt.date.fromisoformat(a['date_end']) - e0).days) if (e0 and a.get('date_end')) else 0
                pairs.append((ds + de, ds, i, a['dl_id']))
        used = set(assigned.values())
        for score, ds, i, dl in sorted(pairs):        # Phase 2 — best score first, each side once
            if i in assigned or dl in used: continue
            assigned[i] = dl; used.add(dl)
        kept = []
        for i, (fid, x) in enumerate(lines):
            if i not in assigned: kept.append((fid, x)); continue
            target = matchable[assigned[i]]
            p = {'dl_id': target['dl_id']}
            for f in ('trip_value', 'advance', 'expenses'):
                if x.get(f) is not None: p[f] = x[f]
            note = 'Excel: %s · %s%s' % (x.get('route', ''), x['entry_date'], ('→' + x['date_end']) if x.get('date_end') else '')
            if x.get('note'): note += ' · ' + x['note']
            p['note'] = note; p['src'] = x['src']; patches.append(p)
        lines = kept
    auto_unmatched = [{'dl_id': a['dl_id'], 'entry_date': a['entry_date']} for a in auto if a['dl_id'] not in used]
    # rule 10 — batches
    batches = []
    for f in files:
        rows = [x for fid, x in lines if fid == f]
        if not rows: continue
        fname = next(n['file_name'] for n in canon if n['file_id'] == f)
        batches.append({'file_id': f, 'file_name': fname, 'rows': rows, 'file_hash': file_hashes.get(f),
                         'expected_final': str(sum((delta(x) for x in rows), Decimal('0')).quantize(Decimal('0.01')))})
    total = sum((d2(b['expected_final']) for b in batches), Decimal('0')) + sum((d2(p.get('trip_value')) - (d2(p.get('advance')) - d2(p.get('expenses'))) for p in patches), Decimal('0'))
    if chain and prev_final is not None and not needs and abs(total - prev_final) > Decimal('0.005'):
        needs.append('σύνολο καρτέλας %s ≠ τελευταίο ΠΡΟΟΔΕΥΤΙΚΟ %s' % (total, prev_final))
    if not chain: needs.append('κανένα φύλλο καρτέλας προς εισαγωγή')
    return {'driver_key': key, 'driver_id': driver_id, 'create_driver': entry.get('create'),
            'nodes': plan_nodes, 'batches': batches, 'patches': patches, 'cutoff': cutoff, 'auto_unmatched': auto_unmatched,
            'date_fixes': date_fixes, 'needs_decision': needs, 'warnings': warnings, 'crosscheck': crosscheck,
            'expected_total_balance': str(total.quantize(Decimal('0.01'))), 'status': 'ready' if not needs else 'needs_decision'}

def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--today', type=dt.date.fromisoformat, default=None,
                     help='YYYY-MM-DD, default today — no rule here depends on it today, kept for parity with inventory.py so a repair run can be pinned end to end')
    ap.add_argument('keys', nargs='*')
    a = ap.parse_args(argv)
    today = a.today or dt.date.today()
    print('using --today %s' % today.isoformat())
    inv = json.load(open(os.path.join(WORK, 'inventory.json'), encoding='utf-8'))['nodes']
    m = json.load(open(os.path.join(WORK, 'map.json'), encoding='utf-8'))
    auto = json.load(open(os.path.join(WORK, 'auto_rows.json'), encoding='utf-8'))
    index = json.load(open(os.path.join(WORK, 'drive-index.json'), encoding='utf-8'))
    file_hashes = {it['id']: file_sha(it['local']) for it in index}
    os.makedirs(os.path.join(WORK, 'plans'), exist_ok=True)
    keys = a.keys or [k for k, v in m.items() if not k.startswith('_') and 'alias_of' not in v and v.get('files')]
    counts = Counter()
    for key in keys:
        dp = os.path.join(WORK, 'decisions', key + '.json')
        decision = json.load(open(dp, encoding='utf-8')) if os.path.exists(dp) else None
        plan = build_plan(key, m[key], inv, auto, decision, file_hashes)
        json.dump(plan, open(os.path.join(WORK, 'plans', key + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        counts[plan['status']] += 1
        print('%-32s %-14s rows %5d patches %2d total %10s %s' % (key[:32], plan['status'], sum(len(b['rows']) for b in plan['batches']), len(plan['patches']), plan['expected_total_balance'], ('· ' + plan['needs_decision'][0][:70]) if plan['needs_decision'] else ''))
    print(dict(counts))

if __name__ == '__main__':
    main(sys.argv[1:])
