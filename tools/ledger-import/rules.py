"""Pure rules for the ledger import (v2). No I/O, no Worker, no Supabase.

v2 after the first real run over 156 workbooks: the Excel model is uniform —
every line is ΑΞΙΑ − ΕΛΑΒΕ + ΕΞΟΔΑ — so classification is by *shape* first
(which amount columns are filled) and by keyword second. A keyword can only
turn a line into a payment when the line has no ΑΞΙΑ; otherwise ΤΡΑΠΕΖΟΥΝΤΑ
would be a bank deposit.
"""
import datetime as dt, re, unicodedata
from decimal import Decimal, ROUND_HALF_UP

class Unknown(Exception):
    """A row shape the rules do not recognise. The driver goes to needs_decision."""

# Payroll sheets mix Latin lookalikes into Greek words (KATAΘΕΣΗ, KAT.TΡΑΠEZA).
LATIN_TO_GREEK = str.maketrans('ABEHIKMNOPTXYZ', 'ΑΒΕΗΙΚΜΝΟΡΤΧΥΖ')

def norm(s):
    s = unicodedata.normalize('NFD', str(s)).upper()
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').strip()
    return s.translate(LATIN_TO_GREEK)

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
    ('cash',     ('ΜΕΤΡΗΤ',)),          # holds TEXT (the payment label) in most layouts
    ('bank',     ('ΚΑΤΑΘΕΣ', 'ΤΡΑΠΕΖ')),
]
SEQ_LABELS = ('Α/Α', 'ΑΑ', 'Α.Α', 'Α.Α.', 'ΝΟ', '#')
REQUIRED = ('advance', 'expenses')
BANK_KEYS = tuple(norm(k) for k in ('ΚΑΤΑΘΕΣ', 'ΤΡΑΠΕΖ', 'ΚΑΤ.', 'EUROBANK', 'ΠΕΙΡΑΙ', 'IBAN'))
ETE_RE = re.compile(r'(^|[^Α-Ω])ΕΤΕ([^Α-Ω]|$)')            # Εθνική Τράπεζα, as a word
ADJUST_KEYS = ('ΠΙΣΤΩΣ', 'ΧΡΕΩΣ', 'ΔΙΟΡΘ', 'ΔΩΡΟ', 'ΕΠΙΔΟΜ', 'ΜΠΟΝ', 'BONUS', 'ΛΑΘ')
CARRY_KEYS = ('ΜΕΤΑΦΟΡΑ', 'ΥΠΟΛΟΙΠΟ')

def d2(v):
    return Decimal(str(v if v not in (None, '') else 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)

def num(v):
    """Blank → None (NULL = not recorded); a number, including 0, → float."""
    return float(d2(v)) if is_num(v) else None

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

def detect_header(rows):
    """First row with ≥3 fields incl. ΕΛΑΒΕ and ΕΞΟΔΑ wins. Two fallbacks for
    columns that are almost never labeled: the end date (right after the date,
    before the route) and the Α/Α counter (right before the date)."""
    for i, row in enumerate(rows, 1):
        cols = {}
        for j, cell in enumerate(row, 1):
            if cell in (None, ''): continue
            n = norm(cell)
            if n in SEQ_LABELS:
                cols.setdefault('seq', j); continue
            for field, keys in FIELD_KEYS:
                if field not in cols and any(k in n for k in keys):
                    cols[field] = j; break
        if len(cols) >= 3 and all(f in cols for f in REQUIRED):
            used = set(cols.values())
            if 'date_end' not in cols and 'date' in cols and 'route' in cols and cols['date'] + 1 < cols['route'] and cols['date'] + 1 not in used:
                cols['date_end'] = cols['date'] + 1
            if 'seq' not in cols and 'date' in cols and cols['date'] > 1 and cols['date'] - 1 not in used:
                cols['seq'] = cols['date'] - 1
            return {'row': i, 'cols': cols, 'out_of_scope': 'official' in cols}
    return None

def _has_seq(v):
    return is_num(v) or (isinstance(v, str) and v.strip().isdigit())

def classify(c):
    """c = {field: raw cell, '_row_text': every string cell of the row joined}.
    Returns an entry dict, None (nothing to record), or 'TOTALS' (skip)."""
    # A totals line is a cell that IS the word ΣΥΝΟΛΟ, or a ΣΥΝΟΛ- mention on a
    # line without a date. A dated line that merely mentions ΣΥΝΟΛΙΚΟ ΦΟΡΤΙΟ in
    # its description is a trip and must not vanish into totals_skipped.
    date = to_date(c.get('date')) or to_date(c.get('date_end'))
    route_n = norm(c.get('route') or '')
    if route_n in ('ΣΥΝΟΛΟ', 'ΣΥΝΟΛΑ', 'ΣΥΝΟΛΟ:', 'ΓΕΝΙΚΟ ΣΥΝΟΛΟ') or \
       (date is None and ('ΣΥΝΟΛ' in norm(c.get('_row_text') or '') or 'ΣΥΝΟΛ' in norm(c.get('date') or ''))):
        return 'TOTALS'
    desc = str(c.get('route') or '').strip()
    pay_desc = ' · '.join(str(c.get(k)).strip() for k in ('cash', 'bank') if isinstance(c.get(k), str) and str(c.get(k)).strip())
    label = (desc or pay_desc)[:200]
    carry_kw = any(k in norm(label) for k in CARRY_KEYS)
    has_amount = any(is_num(c.get(k)) and c.get(k) != 0 for k in ('advance', 'expenses', 'value', 'cash', 'bank')) \
        or (carry_kw and is_num(c.get('balance')))
    has_seq = _has_seq(c.get('seq'))
    if not has_amount and not has_seq: return None                       # blank line, or a text-only note
    if date is None and not label and not has_seq: return 'TOTALS'        # numbers alone, no date, no text
    iso = date.isoformat() if date else None                              # None → caller inherits the previous row's date
    adv, exp, val = num(c.get('advance')), num(c.get('expenses')), num(c.get('value'))
    t = norm(label + ' ' + pay_desc)
    bank = any(k in t for k in BANK_KEYS) or bool(ETE_RE.search(t))
    cash = 'ΜΕΤΡΗΤ' in t
    if carry_kw and not val and not adv and not exp:
        if not is_num(c.get('balance')): raise Unknown('carry row without balance: %r' % label)
        return {'entry_type': 'carry', 'entry_date': iso, 'amount': float(d2(c['balance']))}
    if (cash or bank) and val and not adv and not has_seq:
        raise Unknown('payment keyword but the amount is in ΑΞΙΑ: %r' % label)
    if val and not adv and not exp and not has_seq and any(k in t for k in ADJUST_KEYS):
        return {'entry_type': 'adjustment', 'entry_date': iso, 'amount': val, 'note': label}
    # A payment keyword wins over the "expenses = journey" heuristic: a ΜΕΤΡΗΤΑ
    # line with a 5 € bank fee is a payment of ΕΛΑΒΕ − ΕΞΟΔΑ, not a trip to
    # "ΜΕΤΡΗΤΑ". The net keeps the line's Excel arithmetic (ΑΞΙΑ − ΕΛΑΒΕ + ΕΞΟΔΑ).
    if (cash or bank) and not val and not has_seq and adv and adv > 0:
        net = float(d2(adv - (exp or 0)))
        if net <= 0: raise Unknown('payment line whose expenses cancel the amount: %r' % label)
        e = {'entry_type': 'payment_bank' if (bank and not cash) else 'payment_cash', 'entry_date': iso, 'amount': net}
        note = label
        if exp: note = (label + ' · ' if label else '') + 'ΕΞΟΔΑ %.2f στη γραμμή πληρωμής (καθαρό %.2f)' % (exp, net)
        if note: e['note'] = note
        return e
    if val or has_seq or (exp and desc):                                  # a value, a counter, or expenses on a named line = a journey
        end = to_date(c.get('date_end'))
        return {'entry_type': 'trip', 'entry_date': iso,
                'date_end': end.isoformat() if end else None,
                'route': desc or 'χωρίς περιγραφή (Excel)',
                'trip_value': val, 'advance': adv, 'expenses': exp}
    # Advance + expenses with no description, value or counter: could be a trip
    # whose route was never typed or cash handed over with a receipt — a human decides.
    if exp and adv and not (desc or val or has_seq):
        raise Unknown('row has both advance and expenses but no description or value: %r' % label)
    if adv:                                                               # money handed to the driver, nothing else on the line
        if adv < 0:
            return {'entry_type': 'adjustment', 'entry_date': iso, 'amount': -adv, 'note': ('αρνητικό ΕΛΑΒΕ στο Excel: ' + label).strip(': ')}
        e = {'entry_type': 'payment_bank' if (bank and not cash) else 'payment_cash', 'entry_date': iso, 'amount': adv}
        if label: e['note'] = label
        return e
    if cash or bank:                                                      # amount typed in the ΜΕΤΡΗΤΑ/ΚΑΤΑΘΕΣΗ column itself
        col = num(c.get('cash')) if cash else num(c.get('bank'))
        if col and col > 0:
            e = {'entry_type': 'payment_cash' if cash else 'payment_bank', 'entry_date': iso, 'amount': col}
            if label: e['note'] = label
            return e
        raise Unknown('payment keyword without a positive amount: %r' % label)
    raise Unknown('unrecognised row: %r' % label)

def fix_date(cur, neighbours, today, spike=dt.timedelta(days=200), window=dt.timedelta(days=45)):
    """(date, note) or None. Sheets are not chronological (payments are logged with
    earlier dates), so only a *spike* — a date after today or >200 days away from
    every neighbour — is suspect. It is repaired only when changing the YEAR alone
    lands it within 45 days of the neighbours' span; anything else is a human's call."""
    lo = min(neighbours) if neighbours else None
    hi = max(neighbours) if neighbours else None
    if cur <= today and (not neighbours or lo - spike <= cur <= hi + spike): return (cur, None)
    if not neighbours: return None
    cands = set()
    for y in {cur.year - 1, cur.year + 1} | {d.year for d in neighbours}:
        try: d = cur.replace(year=y)
        except ValueError: continue
        if d <= today and lo - window <= d <= hi + window: cands.add(d)
    if len(cands) != 1: return None
    fixed = cands.pop()
    return (fixed, 'ημ/νία Excel %s → %s (έτος)' % (cur.isoformat(), fixed.isoformat()))

def raw_balance(cells_list):
    """Σ ΑΞΙΑ − Σ ΕΛΑΒΕ + Σ ΕΞΟΔΑ over raw cells — independent of classification."""
    tot = Decimal('0')
    for c in cells_list:
        tot += d2(c.get('value') if is_num(c.get('value')) else 0)
        tot -= d2(c.get('advance') if is_num(c.get('advance')) else 0)
        tot += d2(c.get('expenses') if is_num(c.get('expenses')) else 0)
    return tot.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
