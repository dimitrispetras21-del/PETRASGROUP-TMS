#!/usr/bin/env python3
"""Import one driver's Excel ledger (ΑΙΜΙΛΙΟΣ.xlsx layout) into the TMS ledger.

Dry run by default: parses, classifies, computes the final balance and compares
it with the workbook's last ΠΡΟΟΔΕΥΤΙΚΟ. Nothing is sent unless --commit AND the
two numbers agree. Unknown row shapes STOP the run — the tool never guesses.

    python3 tools/import_driver_ledger.py ~/Drive/μισθοδοσία/ΑΙΜΙΛΙΟΣ.xlsx
    python3 tools/import_driver_ledger.py ~/Drive/μισθοδοσία/ΑΙΜΙΛΙΟΣ.xlsx --commit --token "$TMS_JWT"
"""
import argparse, hashlib, json, os, sys, urllib.request, urllib.error
from decimal import Decimal, ROUND_HALF_UP
import openpyxl

PROXY = 'https://petras-tms-backend-staging.petrasgroup.workers.dev'
MAP_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'driver-ledger-map.json')
HEADER_ROW = 3

def d2(v):
    return Decimal(str(v or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def iso(dtv):
    return dtv.date().isoformat() if hasattr(dtv, 'date') else None

def classify(b, c, d, e, f, g, i):
    """One Excel row -> ledger entry dict, or None for a blank row.
    b=Α/Α c=start d=end e=description f=ΕΛΑΒΕ g=ΕΞΟΔΑ i=ΑΞΙΑ."""
    desc = (e or '').strip().upper()
    if not desc and not c and not d:
        return None
    start = c or d
    if start is None:
        raise ValueError(f'row without a date: {e!r}')
    value = d2(i)
    if b is not None or value > 0:
        return {'entry_type': 'trip', 'entry_date': iso(start), 'date_end': iso(d) if d else None,
                'route': (e or '').strip(), 'trip_value': float(value), 'advance': float(d2(f)), 'expenses': float(d2(g))}
    if 'ΜΕΤΡΗΤ' in desc:
        return {'entry_type': 'payment_cash', 'entry_date': iso(start), 'amount': float(d2(f))}
    if 'ΚΑΤΑΘΕΣ' in desc or 'ΤΡΑΠΕΖ' in desc:
        return {'entry_type': 'payment_bank', 'entry_date': iso(start), 'amount': float(d2(f))}
    raise ValueError(f'unknown row shape: {e!r} (F={f}, I={i}) — decide by hand')

def parse_workbook(path):
    wb = openpyxl.load_workbook(path)
    ws = wb.worksheets[0]
    rows, anomalies = [], []
    for r in range(HEADER_ROW + 1, ws.max_row + 1):
        b, c, d, e, f, g, i = (ws.cell(r, col).value for col in (2, 3, 4, 5, 6, 7, 9))
        if isinstance(c, str) and c.strip().upper() == 'ΣΥΝΟΛΟ':
            break
        entry = classify(b, c, d, e, f, g, i)
        if entry is None:
            continue
        if c and d and c > d:
            anomalies.append(f'row {r}: C > D ({c.date()} > {d.date()}) — year typo? kept as is')
        if entry['entry_type'] == 'trip' and d2(f) == 0:
            anomalies.append(f'row {r}: trip with ΕΛΑΒΕ = 0 (allowed, reported)')
        entry['_row'] = r
        rows.append(entry)
    # cached value of the last ΠΡΟΟΔΕΥΤΙΚΟ (column K); None when the file was
    # never recalculated (e.g. written by openpyxl)
    ws2 = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    excel_final = None
    for r in range(ws2.max_row, HEADER_ROW, -1):
        v = ws2.cell(r, 11).value
        if isinstance(v, (int, float)):
            excel_final = d2(v); break
    return rows, anomalies, excel_final

def payload_rows(rows):
    """Filter out private (_*), None-valued, and empty-string keys from entry dicts.
    A trip with no description parses to route='' — sending that would store an
    empty string instead of leaving the column unset (Worker distinguishes the two)."""
    return [{k: v for k, v in e.items() if not k.startswith('_') and v is not None and v != ''} for e in rows]

def compute_balance(rows):
    bal = Decimal('0')
    for e in rows:
        if e['entry_type'] == 'trip':
            bal += d2(e['trip_value']) - (d2(e['advance']) - d2(e['expenses']))
        else:
            bal -= d2(e['amount'])
    return bal.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def post_import(payload, token):
    """POST to /costs/ledger/import and return parsed response dict.
    On HTTPError: calls sys.exit with server error body.
    On URLError: calls sys.exit with network error reason.
    """
    req = urllib.request.Request(PROXY + '/costs/ledger/import', data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token}, method='POST')
    try:
        with urllib.request.urlopen(req) as res:
            return json.load(res)
    # HTTPError first: it subclasses URLError and carries the server's error body.
    except urllib.error.HTTPError as err:
        sys.exit(f'✗ HTTP {err.code}: {err.read().decode()[:300]}')
    except urllib.error.URLError as err:
        # Network error: DNS failure, connection refused, timeout, etc.
        sys.exit(f'✗ network error: {err.reason}')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('xlsx'); ap.add_argument('--commit', action='store_true')
    ap.add_argument('--token', default=os.environ.get('TMS_JWT'))
    a = ap.parse_args()
    name = os.path.splitext(os.path.basename(a.xlsx))[0].strip().upper()
    mapping = json.load(open(MAP_FILE, encoding='utf-8'))
    if name not in mapping:
        sys.exit(f'✗ {name}: no driver id in {MAP_FILE} — add it by hand (Greek file name → drivers.id)')
    driver_id = mapping[name]
    rows, anomalies, excel_final = parse_workbook(a.xlsx)
    bal = compute_balance(rows)
    kinds = {}
    for e in rows: kinds[e['entry_type']] = kinds.get(e['entry_type'], 0) + 1
    print(f'{name} → driver {driver_id} · {len(rows)} rows · {kinds}')
    for x in anomalies: print('  ⚠', x)
    print(f'  computed balance {bal} · Excel last ΠΡΟΟΔΕΥΤΙΚΟ {excel_final}')
    if excel_final is None or bal != excel_final:
        sys.exit('✗ balance does not match the workbook — NOT importing')
    print('  ✓ balance matches')
    if not a.commit:
        print('  dry run — add --commit to write'); return
    if not a.token: sys.exit('✗ --token (or $TMS_JWT) required for --commit')
    payload = {'driver_id': driver_id, 'file_name': os.path.basename(a.xlsx),
               'file_hash': hashlib.sha256(open(a.xlsx, 'rb').read()).hexdigest(),
               'rows': payload_rows(rows)}
    out = post_import(payload, a.token)
    print(f'  ✓ imported batch {out["batch"]}: {out["rows"]} rows, server balance {out["balance"]}')
    if d2(out['balance']) != bal:
        sys.exit('✗ SERVER BALANCE DIFFERS — ask the owner to run dl_cancel_batch on this batch')

if __name__ == '__main__':
    main()
