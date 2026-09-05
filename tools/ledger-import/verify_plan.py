#!/usr/bin/env python3
"""Deterministic gate between the analysts and the write path. An LLM wrote the
plan; this file refuses anything the Worker or the arithmetic would refuse later,
so a rejection costs seconds instead of a cancelled batch."""
import glob, json, os, re, sys
from decimal import Decimal
from rules import d2

HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.join(HERE, 'work')
TYPES = ('trip', 'payment_cash', 'payment_bank', 'adjustment')
ROW_FIELDS = {'entry_type', 'entry_date', 'date_end', 'route', 'trip_value', 'advance', 'expenses', 'amount', 'note', 'src'}
ISO_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
TRIP_ONLY_FIELDS = ('date_end', 'route', 'trip_value', 'advance', 'expenses')
BATCH_ROW_CAP = 2000   # Worker cap, index.js: "rows: max 2000 per file"

def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)

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
    # Symmetric identity gate: map and plan must agree on create vs. reuse
    if not map_entry.get('driver_id') and plan.get('driver_id'):
        errs.append('plan has driver_id %s but the map says create — identity mismatch' % plan['driver_id'])
    if map_entry.get('driver_id') and plan.get('create_driver'):
        errs.append('plan creates a driver but the map has driver_id %s' % map_entry['driver_id'])
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
        rows = b.get('rows', [])
        if len(rows) > BATCH_ROW_CAP: errs.append('batch %s has %d rows > Worker cap %d' % (b['file_id'], len(rows), BATCH_ROW_CAP))
        bal = Decimal('0')
        for i, r in enumerate(rows, 1):
            extra = set(r) - ROW_FIELDS
            if extra: errs.append('batch %s row %d has forbidden fields %s' % (b['file_id'], i, sorted(extra)))   # rt_id lands here
            if r.get('entry_type') not in TYPES: errs.append('batch %s row %d bad entry_type' % (b['file_id'], i)); continue
            if not r.get('entry_date') or not ISO_DATE.match(str(r.get('entry_date'))):
                errs.append('batch %s row %d entry_date must be YYYY-MM-DD' % (b['file_id'], i))
            # Mirror the Worker's per-type shape (ledger-rules.mjs validateNewEntry): a
            # trip never carries amount, a payment/adjustment never carries trip fields —
            # catching it here costs seconds, catching it live costs a cancelled batch.
            if r['entry_type'] == 'trip':
                if r.get('amount') is not None: errs.append('batch %s row %d: amount is not allowed on a trip' % (b['file_id'], i))
                if not r.get('route'): errs.append('batch %s row %d trip without route' % (b['file_id'], i))
                for f in ('trip_value', 'advance', 'expenses'):
                    v = r.get(f)
                    if v is not None and (not is_number(v) or v < 0):
                        errs.append('batch %s row %d: %s must be a number ≥ 0' % (b['file_id'], i, f))
                # Mirror the Worker's date_end validation (validateNewEntry)
                if r.get('date_end') is not None:
                    if not ISO_DATE.match(str(r.get('date_end'))):
                        errs.append('batch %s row %d date_end must be YYYY-MM-DD' % (b['file_id'], i))
                    elif str(r.get('date_end')) < str(r.get('entry_date')):
                        errs.append('batch %s row %d date_end cannot be before entry_date' % (b['file_id'], i))
            else:
                for f in TRIP_ONLY_FIELDS:
                    if r.get(f) is not None: errs.append('batch %s row %d: %s is not allowed on a %s' % (b['file_id'], i, f, r['entry_type']))
                if not (is_number(r.get('amount')) and (r['amount'] != 0 if r['entry_type'] == 'adjustment' else r['amount'] > 0)):
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

def cross_plan_errors(plans):
    """plans: {driver_key: plan}. I7 — a driver_id or a batch file_id claimed by two
    plans means two independent reviews of the same money; reject both rather than
    trust whichever commit.py happens to run first."""
    by_driver, by_file = {}, {}
    for key, plan in plans.items():
        did = plan.get('driver_id')
        if did is not None: by_driver.setdefault(did, []).append(key)
        for b in plan.get('batches', []):
            by_file.setdefault(b.get('file_id'), []).append(key)
    extra = {}
    for did, keys in by_driver.items():
        if len(set(keys)) > 1:
            for key in set(keys):
                others = sorted(set(k for k in keys if k != key))
                extra.setdefault(key, []).append('driver_id %s also used by plan(s) %s' % (did, ', '.join(others)))
    for fid, keys in by_file.items():
        if len(set(keys)) > 1:
            for key in set(keys):
                others = sorted(set(k for k in keys if k != key))
                extra.setdefault(key, []).append('file %s also imported by plan(s) %s' % (fid, ', '.join(others)))
    return extra

def main(paths):
    inv = json.load(open(os.path.join(WORK, 'inventory.json'), encoding='utf-8'))['nodes']
    auto = json.load(open(os.path.join(WORK, 'auto_rows.json'), encoding='utf-8'))
    m = json.load(open(os.path.join(WORK, 'map.json'), encoding='utf-8'))
    plans = {}
    for p in sorted(paths or glob.glob(os.path.join(WORK, 'plans', '*.json'))):
        plan = json.load(open(p, encoding='utf-8'))
        plans[plan.get('driver_key')] = plan
    cross = cross_plan_errors(plans)
    bad = 0
    for key in sorted(plans):
        plan = plans[key]
        errs = verify(plan, inv, auto, m.get(key)) + cross.get(key, [])
        if errs: bad += 1; print('REJECT %s: %s' % (key, '; '.join(errs)))
        else: print('OK %s (%s)' % (key, plan.get('status')))
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main(sys.argv[1:])
