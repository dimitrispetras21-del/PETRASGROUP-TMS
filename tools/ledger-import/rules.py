"""Pure rules for the ledger import. No I/O, no Worker, no Supabase — so every
rule is testable and the analysts (LLM agents) reason about inputs that were
normalised the same way for every one of the 30 sheet layouts.
"""
import datetime as dt, re, unicodedata
from decimal import Decimal, ROUND_HALF_UP

class Unknown(Exception):
    """A row shape the rules do not recognise. The driver goes to needs_decision;
    we never guess what a payroll row meant."""

# Header keywords per field. Matching is on the upper-cased, accent-stripped cell.
FIELD_KEYS = [
    ('official', ('ΕΠΙΣΗΜ',)),          # 2017-2019 monthly model → whole sheet out of scope
    ('running',  ('ΠΡΟΟΔ',)),
    ('balance',  ('ΥΠΟΛΟΙΠ',)),
    ('value',    ('ΑΞΙΑ', 'ΚΟΣΤΟΣ')),
    ('expenses', ('ΕΞΟΔΑ',)),
    ('advance',  ('ΕΛΑΒΕ',)),
    ('route',    ('ΔΡΟΜΟΛ', 'ΠΕΡΙΓΡΑΦ')),
    ('date_end', ('ΛΗΞΗ', 'ΕΠΙΣΤΡΟΦ')),
    ('date',     ('ΗΜΕΡ',)),
    ('cash',     ('ΜΕΤΡΗΤ',)),
    ('bank',     ('ΚΑΤΑΘΕΣ', 'ΤΡΑΠΕΖ')),
    ('seq',      ('Α/Α',)),
]
REQUIRED = ('advance', 'expenses')

def norm(s):
    s = unicodedata.normalize('NFD', str(s)).upper()
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').strip()

def d2(v):
    return Decimal(str(v if v not in (None, '') else 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def to_date(v):
    if isinstance(v, dt.datetime): return v.date()
    if isinstance(v, dt.date): return v
    if isinstance(v, str):
        m = re.match(r'^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\s*$', v)
        if m:
            d, mo, y = (int(x) for x in m.groups())
            if y < 100: y += 2000
            try: return dt.date(y, mo, d)
            except ValueError: return None
    return None

def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)

def detect_header(rows):
    """First row where ≥3 distinct fields match wins. `date_end` falls back to the
    unlabeled column right after `date` when it sits before `route` — the most
    common layout labels only the start date and leaves the end date unlabeled."""
    for i, row in enumerate(rows, 1):
        cols = {}
        for j, cell in enumerate(row, 1):
            if cell in (None, ''): continue
            n = norm(cell)
            for field, keys in FIELD_KEYS:
                if field not in cols and any(k in n for k in keys):
                    cols[field] = j; break
        if len(cols) >= 3 and all(f in cols for f in REQUIRED):
            if 'date_end' not in cols and 'date' in cols and 'route' in cols and cols['date'] + 1 < cols['route']:
                cols['date_end'] = cols['date'] + 1
            return {'row': i, 'cols': cols, 'out_of_scope': 'official' in cols}
    return None

def classify(c):
    """c = {field: raw cell}. Returns entry dict, None (blank), or 'STOP' (ΣΥΝΟΛΟ)."""
    desc = norm(c.get('route') or '')
    if 'ΣΥΝΟΛΟ' in desc or 'ΣΥΝΟΛΟ' in norm(c.get('date') or ''): return 'STOP'
    nums = {k: c.get(k) for k in ('advance', 'expenses', 'value', 'balance', 'cash', 'bank')}
    has_amount = any(is_num(v) and v != 0 for v in nums.values())
    date = to_date(c.get('date')) or to_date(c.get('date_end'))
    if not desc and not has_amount and c.get('seq') in (None, ''): return None
    if date is None: raise Unknown('row with amounts/description but no date: %r' % (c.get('route'),))
    iso = date.isoformat()
    adv = float(d2(c['advance'])) if is_num(c.get('advance')) else None
    if 'ΜΕΤΡΗΤ' in desc or (is_num(c.get('cash')) and c.get('cash') != 0 and not is_num(c.get('value'))):
        amt = adv if adv else (float(d2(c['cash'])) if is_num(c.get('cash')) else None)
        if not amt or amt <= 0: raise Unknown('cash payment without positive amount: %r' % (c.get('route'),))
        return {'entry_type': 'payment_cash', 'entry_date': iso, 'amount': amt}
    if 'ΚΑΤΑΘΕΣ' in desc or 'ΤΡΑΠΕΖ' in desc or (is_num(c.get('bank')) and c.get('bank') != 0 and not is_num(c.get('value'))):
        amt = adv if adv else (float(d2(c['bank'])) if is_num(c.get('bank')) else None)
        if not amt or amt <= 0: raise Unknown('bank payment without positive amount: %r' % (c.get('route'),))
        return {'entry_type': 'payment_bank', 'entry_date': iso, 'amount': amt}
    if ('ΜΕΤΑΦΟΡΑ' in desc or 'ΥΠΟΛΟΙΠΟ' in desc) and not is_num(c.get('value')) and not is_num(c.get('advance')):
        if not is_num(c.get('balance')): raise Unknown('carry row without balance: %r' % (c.get('route'),))
        return {'entry_type': 'carry', 'entry_date': iso, 'amount': float(d2(c['balance']))}
    value_present = is_num(c.get('value')) and c['value'] != 0
    # A trip needs a value or a sequence number. A described row with only an
    # advance could be a gift, a loan or a trip — that is a human's call.
    if value_present or c.get('seq') not in (None, ''):
        end = to_date(c.get('date_end'))
        return {'entry_type': 'trip', 'entry_date': iso,
                'date_end': end.isoformat() if end else None,
                'route': (str(c.get('route') or '').strip() or None),
                'trip_value': float(d2(c['value'])) if is_num(c.get('value')) else None,
                'advance': adv,
                'expenses': float(d2(c['expenses'])) if is_num(c.get('expenses')) else None}
    raise Unknown('unrecognised row: %r' % (c.get('route'),))

def fix_date(cur, prev, nxt, today, slack=dt.timedelta(days=400)):
    """Return (date, note). Untouched when plausible. A date in the future or >400
    days out of sequence is repaired only when changing the YEAR alone lands it
    between its neighbours — anything else is None (needs a human)."""
    def plausible(d):
        return d <= today and (prev is None or d >= prev) and (nxt is None or d <= nxt)
    if plausible(cur): return (cur, None)
    if prev is None or nxt is None: return None       # not enough context to pin the year
    cands = set()
    for y in {cur.year - 1, cur.year + 1, prev.year, nxt.year}:
        try: d = cur.replace(year=y)
        except ValueError: continue
        if plausible(d): cands.add(d)
    if len(cands) != 1: return None
    fixed = cands.pop()
    return (fixed, 'ημ/νία Excel %s → %s (έτος)' % (cur.isoformat(), fixed.isoformat()))

def raw_balance(cells_list):
    """Σ ΑΞΙΑ − Σ ΕΛΑΒΕ + Σ ΕΞΟΔΑ over raw cells. Independent of classification,
    so a mis-classified row cannot hide a balance error."""
    tot = Decimal('0')
    for c in cells_list:
        tot += d2(c.get('value') if is_num(c.get('value')) else 0)
        tot -= d2(c.get('advance') if is_num(c.get('advance')) else 0)
        tot += d2(c.get('expenses') if is_num(c.get('expenses')) else 0)
    return tot.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
