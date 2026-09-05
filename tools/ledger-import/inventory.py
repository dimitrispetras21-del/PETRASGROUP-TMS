#!/usr/bin/env python3
"""Parse every workbook in work/xlsx into nodes (one per sheet) with rows already
normalised by rules.py. Reads with data_only=True so the cached ΠΡΟΟΔΕΥΤΙΚΟ is
visible. Nothing here decides anything — it records, and it repairs only what
rules.py allows (year spikes, missing dates inherited from the line above), each
repair written into the row's note."""
import datetime as dt, json, os, warnings
from decimal import Decimal
import openpyxl
from rules import detect_header, classify, fix_date, raw_balance, is_num, d2, Unknown
warnings.filterwarnings('ignore')

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, 'work')
PICK = ('seq', 'date', 'date_end', 'route', 'advance', 'expenses', 'value', 'balance', 'running', 'cash', 'bank')
INHERIT_NOTE = 'ημ/νία από προηγούμενη γραμμή (κενή στο Excel)'

def jsonable(v):
    if isinstance(v, (dt.datetime, dt.date)): return v.isoformat()[:10]
    if isinstance(v, float) and v != v: return None
    return v

def add_note(entry, text):
    entry['note'] = (entry['note'] + ' · ' + text) if entry.get('note') else text

def parse_sheet(ws, today):
    head = list(ws.iter_rows(min_row=1, max_row=min(ws.max_row or 0, 400), values_only=True))
    h = detect_header(head)
    if h is None: return None
    cols = h['cols']
    rows, unknown, cells_used = [], [], []
    totals_skipped = text_only = 0
    for rn, raw in enumerate(ws.iter_rows(min_row=h['row'] + 1, values_only=True), h['row'] + 1):
        cells = {f: (raw[cols[f] - 1] if f in cols and cols[f] <= len(raw) else None) for f in PICK}
        cells['_row_text'] = ' '.join(str(v) for v in raw if isinstance(v, str))
        try:
            e = classify(cells)
        except Unknown as ex:
            unknown.append({'row': rn, 'reason': str(ex), 'cells': {k: jsonable(v) for k, v in cells.items() if k != '_row_text'}})
            if cells.get('date') is not None: cells_used.append(cells)   # a dated money line counts even if unclassified
            continue
        if e == 'TOTALS': totals_skipped += 1; continue
        if e is None:
            if any(v not in (None, '') for v in raw): text_only += 1
            continue
        inherited = False
        if e['entry_date'] is None:
            if not rows:
                unknown.append({'row': rn, 'reason': 'row without a date and no previous row to inherit from', 'cells': {k: jsonable(v) for k, v in cells.items() if k != '_row_text'}})
                continue
            e['entry_date'] = rows[-1]['entry']['entry_date']; inherited = True; add_note(e, INHERIT_NOTE)
        rows.append({'row': rn, 'entry': e, 'cells': {k: jsonable(v) for k, v in cells.items() if k != '_row_text'},
                     'date_fix': None, 'date_problem': None, 'date_inherited': inherited})
        cells_used.append(cells)
    dates = [dt.date.fromisoformat(r['entry']['entry_date']) for r in rows]
    for i, r in enumerate(rows):
        nb = [d for d in dates[max(0, i - 3):i] + dates[i + 1:i + 4] if d <= today]
        fx = fix_date(dates[i], nb, today)
        if fx is None:
            r['date_problem'] = 'date %s is a spike and not repairable by year alone' % dates[i].isoformat()
        elif fx[1]:
            r['date_fix'] = {'from': dates[i].isoformat(), 'to': fx[0].isoformat(), 'note': fx[1]}
            r['entry']['entry_date'] = fx[0].isoformat(); add_note(r['entry'], fx[1])
        end = r['entry'].get('date_end')
        if end and end < r['entry']['entry_date']:
            r['date_problem'] = ((r['date_problem'] or '') + ' date_end %s before entry_date' % end).strip()
    running_last, opening, breaks, consistent = None, None, [], None
    if 'running' in cols:
        # Walk the cached ΠΡΟΟΔΕΥΤΙΚΟ against our own deltas. Rows without a running
        # value (a blank cell in the middle) accumulate into `acc` until the next
        # cached value. The first cached value fixes the opening balance; every later
        # jump that the row's own amounts do not explain is a break.
        prev_run, acc = None, Decimal('0')
        for r in rows:
            c = r['cells']
            delta = d2(c.get('value') if is_num(c.get('value')) else 0) - d2(c.get('advance') if is_num(c.get('advance')) else 0) + d2(c.get('expenses') if is_num(c.get('expenses')) else 0)
            acc += delta
            run = c.get('running')
            if not is_num(run): continue
            run = d2(run)
            if prev_run is None:
                opening = run - acc
            else:
                diff = run - (prev_run + acc)
                if abs(diff) > Decimal('0.05'):
                    breaks.append({'row': r['row'], 'entry_date': r['entry']['entry_date'], 'diff': str(diff)})
            prev_run, acc = run, Decimal('0')
            running_last = str(run)
        if opening is not None and abs(opening) <= Decimal('0.05'): opening = None
        if running_last is not None:
            raw = raw_balance(cells_used)
            consistent = (raw + (opening or Decimal('0')) + sum((Decimal(b['diff']) for b in breaks), Decimal('0'))).quantize(Decimal('0.01')) == d2(running_last)
    balance_sum = None
    if 'balance' in cols:
        vals = [c.get('balance') for c in cells_used if is_num(c.get('balance'))]
        balance_sum = str(sum((d2(v) for v in vals), d2(0))) if vals else None
    ds = sorted(dt.date.fromisoformat(r['entry']['entry_date']) for r in rows)
    return {'sheet': ws.title, 'header_row': h['row'], 'cols': cols, 'out_of_scope': h['out_of_scope'],
            'rows': rows, 'unknown': unknown, 'raw_final': str(raw_balance(cells_used)) if cells_used else None,
            'running_last': running_last, 'balance_sum': balance_sum,
            'opening_balance': str(opening) if opening is not None else None, 'running_breaks': breaks, 'running_consistent': consistent,
            'first_date': ds[0].isoformat() if ds else None, 'last_date': ds[-1].isoformat() if ds else None,
            'n_rows': len(rows), 'totals_skipped': totals_skipped, 'text_only_skipped': text_only}

def main():
    today = dt.date.today()
    index = json.load(open(os.path.join(WORK, 'drive-index.json'), encoding='utf-8'))
    nodes = []
    for it in index:
        wb = openpyxl.load_workbook(it['local'], data_only=True, read_only=True)
        for ws in wb.worksheets:
            n = parse_sheet(ws, today)
            if n is None: continue
            n.update({'file_id': it['id'], 'file_name': it['name'], 'path': it['path'],
                      'folder': 'ΣΤΑΜΑΤΗΣΑΝ' if it['path'].startswith('ΣΤΑΜΑΤΗΣΑΝ/') else 'root', 'modified': it['modified']})
            nodes.append(n)
    out = {'generated': dt.datetime.now().isoformat(timespec='seconds'), 'nodes': nodes}
    json.dump(out, open(os.path.join(WORK, 'inventory.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    R = [r for n in nodes for r in n['rows']]
    print('nodes %d · rows %d · unknown rows %d · date fixes %d · date problems %d · date inherited %d · totals skipped %d · text-only %d · out_of_scope %d · running inconsistent %d · sheets with breaks %d · opening balances %d'
          % (len(nodes), len(R), sum(len(n['unknown']) for n in nodes), sum(1 for r in R if r['date_fix']), sum(1 for r in R if r['date_problem']),
             sum(1 for r in R if r['date_inherited']), sum(n['totals_skipped'] for n in nodes), sum(n['text_only_skipped'] for n in nodes),
             sum(n['out_of_scope'] for n in nodes), sum(1 for n in nodes if n['running_consistent'] is False), sum(1 for n in nodes if n['running_breaks']), sum(1 for n in nodes if n['opening_balance'])))

if __name__ == '__main__':
    main()
