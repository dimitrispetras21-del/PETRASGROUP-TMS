#!/usr/bin/env python3
"""Deterministic gate between the analysts and the write path. An LLM wrote the
plan; this file refuses anything the Worker or the arithmetic would refuse later,
so a rejection costs seconds instead of a cancelled batch."""
import glob, json, os, sys
from decimal import Decimal
from rules import d2

HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.join(HERE, 'work')
TYPES = ('trip', 'payment_cash', 'payment_bank', 'adjustment')
ROW_FIELDS = {'entry_type', 'entry_date', 'date_end', 'route', 'trip_value', 'advance', 'expenses', 'amount', 'note', 'src'}

def row_delta(r):
    if r['entry_type'] == 'trip':
        return d2(r.get('trip_value')) - (d2(r.get('advance')) - d2(r.get('expenses')))
    if r['entry_type'] == 'adjustment': return d2(r['amount'])
    return -d2(r['amount'])

def verify(plan, nodes, auto_rows, map_entry):
    errs = []
    if plan.get('status') == 'needs_decision':
        if not plan.get('needs_decision'): errs.append('status needs_decision without reasons')
        return errs
    if plan.get('status') != 'ready': errs.append('status must be ready or needs_decision'); return errs
    # Identity is the one thing the arithmetic cannot catch: a wrong driver_id
    # writes a perfectly balanced ledger onto the wrong person.
    if not plan.get('driver_id') and not plan.get('create_driver'): errs.append('neither driver_id nor create_driver')
    if plan.get('driver_id') and plan.get('create_driver'): errs.append('both driver_id and create_driver set — pick one')
    if map_entry is None: errs.append('driver key not in map'); return errs
    if map_entry.get('driver_id') and plan.get('driver_id') != map_entry['driver_id']:
        errs.append('plan driver_id %s ≠ map driver_id %s' % (plan.get('driver_id'), map_entry['driver_id']))
    if plan.get('create_driver') and not map_entry.get('create'):
        errs.append('plan creates a driver but the map has no create block for this key')
    by_id = {(n['file_id'], n['sheet']): n for n in nodes}
    chain = [n for n in plan.get('nodes', []) if n.get('role') == 'chain']
    for n in chain:
        if n['file_id'] not in map_entry.get('files', []): errs.append('chain file %s not a canonical file in map' % n['file_id'])
        src = by_id.get((n['file_id'], n['sheet']))
        if src is None: errs.append('chain node %s/%s not in inventory' % (n['file_id'], n['sheet'])); continue
        if src['out_of_scope']: errs.append('chain node %s is out_of_scope layout' % n['sheet'])
        if src['unknown']: errs.append('chain node %s has %d unknown rows — must be needs_decision' % (n['sheet'], len(src['unknown'])))
        if any(r['date_problem'] for r in src['rows']): errs.append('chain node %s has unrepaired dates' % n['sheet'])
        if src.get('running_consistent') is False: errs.append('chain node %s: Excel ΠΡΟΟΔΕΥΤΙΚΟ inconsistent with rows — needs_decision' % n['sheet'])
    auto = {a['dl_id']: a for a in auto_rows}
    total = Decimal('0')
    for b in plan.get('batches', []):
        bal = Decimal('0')
        for i, r in enumerate(b.get('rows', []), 1):
            extra = set(r) - ROW_FIELDS
            if extra: errs.append('batch %s row %d has forbidden fields %s' % (b['file_id'], i, sorted(extra)))   # rt_id lands here
            if r.get('entry_type') not in TYPES: errs.append('batch %s row %d bad entry_type' % (b['file_id'], i)); continue
            if not r.get('entry_date'): errs.append('batch %s row %d no entry_date' % (b['file_id'], i))
            if r['entry_type'] == 'trip' and not r.get('route'): errs.append('batch %s row %d trip without route' % (b['file_id'], i))
            if r['entry_type'] != 'trip' and not (isinstance(r.get('amount'), (int, float)) and (r['amount'] != 0 if r['entry_type'] == 'adjustment' else r['amount'] > 0)):
                errs.append('batch %s row %d amount must be > 0 (≠ 0 for adjustment)' % (b['file_id'], i))
            bal += row_delta(r)
        if str(bal.quantize(Decimal('0.01'))) != str(d2(b.get('expected_final'))):
            errs.append('batch balance mismatch %s: %s ≠ expected_final %s' % (b['file_id'], bal, b.get('expected_final')))
        total += bal
    seen = set()
    for p in plan.get('patches', []):
        a = auto.get(p.get('dl_id'))
        if a is None: errs.append('patch dl_id %s not an auto row' % p.get('dl_id')); continue
        if a['driver_id'] != plan.get('driver_id'): errs.append('patch dl_id %s belongs to driver %s' % (p['dl_id'], a['driver_id']))
        if p['dl_id'] in seen: errs.append('auto row %s patched twice' % p['dl_id'])
        seen.add(p['dl_id'])
        for f in ('trip_value', 'advance', 'expenses'):
            if f in p and p[f] is not None and a.get(f) is not None: errs.append('patch dl_id %s: %s is not NULL on the auto row' % (p['dl_id'], f))
        total += d2(p.get('trip_value')) - (d2(p.get('advance')) - d2(p.get('expenses')))
    if str(total.quantize(Decimal('0.01'))) != str(d2(plan.get('expected_total_balance'))):
        errs.append('total balance %s ≠ expected_total_balance %s' % (total, plan.get('expected_total_balance')))
    return errs

def main(paths):
    inv = json.load(open(os.path.join(WORK, 'inventory.json'), encoding='utf-8'))['nodes']
    auto = json.load(open(os.path.join(WORK, 'auto_rows.json'), encoding='utf-8'))
    m = json.load(open(os.path.join(WORK, 'map.json'), encoding='utf-8'))
    bad = 0
    for p in sorted(paths or glob.glob(os.path.join(WORK, 'plans', '*.json'))):
        plan = json.load(open(p, encoding='utf-8'))
        errs = verify(plan, inv, auto, m.get(plan.get('driver_key')))
        if errs: bad += 1; print('REJECT %s: %s' % (plan.get('driver_key'), '; '.join(errs)))
        else: print('OK %s (%s)' % (plan.get('driver_key'), plan.get('status')))
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main(sys.argv[1:])
