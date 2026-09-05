#!/usr/bin/env python3
"""Parse every workbook in work/xlsx into nodes (one per sheet) with rows already
normalised by rules.py. Reads twice per file: formulas off (data_only=True) so the
cached ΠΡΟΟΔΕΥΤΙΚΟ is visible. Nothing here decides anything — it records."""
import datetime as dt, json, os, sys, warnings
import openpyxl
from rules import detect_header, classify, fix_date, raw_balance, to_date, is_num, d2, Unknown
warnings.filterwarnings('ignore')

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, 'work')
PICK = ('seq', 'date', 'date_end', 'route', 'advance', 'expenses', 'value', 'balance', 'running', 'cash', 'bank')

def jsonable(v):
    if isinstance(v, (dt.datetime, dt.date)): return v.isoformat()[:10]
    if isinstance(v, float) and v != v: return None
    return v

def parse_sheet(ws, today):
    head = list(ws.iter_rows(min_row=1, max_row=min(ws.max_row or 0, 400), values_only=True))
    h = detect_header(head)
    if h is None: return None
    cols = h['cols']
    rows, unknown, cells_used = [], [], []
    for rn, raw in enumerate(ws.iter_rows(min_row=h['row'] + 1, values_only=True), h['row'] + 1):
        cells = {f: (raw[cols[f] - 1] if f in cols and cols[f] <= len(raw) else None) for f in PICK}
        try:
            e = classify(cells)
        except Unknown as ex:
            unknown.append({'row': rn, 'reason': str(ex), 'cells': {k: jsonable(v) for k, v in cells.items()}})
            cells_used.append(cells)      # amounts of unknown rows still count in the raw balance
            continue
        if e == 'STOP': break
        if e is None: continue
        rows.append({'row': rn, 'entry': e, 'cells': {k: jsonable(v) for k, v in cells.items()}, 'date_fix': None, 'date_problem': None})
        cells_used.append(cells)
    # date repair needs neighbours, so it runs after the pass
    dates = [dt.date.fromisoformat(r['entry']['entry_date']) for r in rows]
    for i, r in enumerate(rows):
        prev = max((d for d in dates[:i] if d <= today), default=None)
        nxt = next((d for d in dates[i + 1:] if d <= today), None)
        fx = fix_date(dates[i], prev, nxt, today)
        if fx is None:
            r['date_problem'] = 'date %s not plausible and not repairable by year alone' % dates[i].isoformat()
        elif fx[1]:
            r['date_fix'] = {'from': dates[i].isoformat(), 'to': fx[0].isoformat(), 'note': fx[1]}
            r['entry']['entry_date'] = fx[0].isoformat()
            r['entry']['note'] = fx[1]
        end = r['entry'].get('date_end')
        if end and end < r['entry']['entry_date']:
            r['date_problem'] = (r['date_problem'] or '') + ' date_end %s before entry_date' % end
    running_last = None
    if 'running' in cols:
        for r in reversed(rows):
            v = r['cells'].get('running')
            if is_num(v): running_last = str(d2(v)); break
    balance_sum = None
    if 'balance' in cols:
        vals = [c.get('balance') for c in cells_used if is_num(c.get('balance'))]
        balance_sum = str(sum((d2(v) for v in vals), d2(0))) if vals else None
    ds = sorted(dt.date.fromisoformat(r['entry']['entry_date']) for r in rows)
    return {'sheet': ws.title, 'header_row': h['row'], 'cols': cols, 'out_of_scope': h['out_of_scope'],
            'rows': rows, 'unknown': unknown, 'raw_final': str(raw_balance(cells_used)) if cells_used else None,
            'running_last': running_last, 'balance_sum': balance_sum,
            'first_date': ds[0].isoformat() if ds else None, 'last_date': ds[-1].isoformat() if ds else None,
            'n_rows': len(rows)}

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
    unk = sum(len(n['unknown']) for n in nodes); probs = sum(1 for n in nodes for r in n['rows'] if r['date_problem'])
    fixes = sum(1 for n in nodes for r in n['rows'] if r['date_fix'])
    mism = sum(1 for n in nodes if n['running_last'] and n['raw_final'] != n['running_last'])
    print('nodes %d · rows %d · unknown rows %d · date fixes %d · date problems %d · out_of_scope %d · raw≠running %d'
          % (len(nodes), sum(n['n_rows'] for n in nodes), unk, fixes, probs, sum(n['out_of_scope'] for n in nodes), mism))

if __name__ == '__main__':
    main()
