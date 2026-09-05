import unittest, tempfile, os, sys, datetime as dt
import openpyxl
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from inventory import parse_sheet

def book(rows):
    wb = openpyxl.Workbook(); ws = wb.active
    for r in rows: ws.append(list(r))
    return ws

class TestParseSheet(unittest.TestCase):
    def test_standard_sheet(self):
        ws = book([
            ('ΚΑΡΤΕΛΑ',),
            (None,),
            (None, 'Α/Α', 'ΗΜΕΡΟΜΗΝΙΑ', None, 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ'),
            (None, 1, dt.datetime(2024, 3, 13), dt.datetime(2024, 3, 20), 'ΓΕΡΜΑΝΙΑ', 300, 120.5, None, 450, 270.5, 270.5),
            (None, None, dt.datetime(2024, 4, 1), None, 'ΜΕΤΡΗΤΑ', 200, None, None, None, -200, 70.5),
            (None, 2, dt.datetime(2025, 12, 27), None, 'ΑΘΗΝΑ', 100, None, None, 230, 130, 200.5),   # ok
            (None, 3, dt.datetime(2026, 12, 30), None, 'ΠΑΤΡΑ', 100, None, None, 230, 130, 330.5),   # year typo → 2025? no: after 2025-12-27 and before next → fixed to 2025-12-30
            (None, 4, dt.datetime(2026, 1, 4), None, 'ΘΕΣΣΑΛΟΝΙΚΗ', 0, None, None, 80, 80, 410.5),
            (None, None, 'ΣΥΝΟΛΟ', None, None, 700, 120.5, None, 990, None, None),
        ])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertEqual(n['header_row'], 3)
        self.assertEqual(n['n_rows'], 5)
        self.assertEqual([r['entry']['entry_type'] for r in n['rows']], ['trip', 'payment_cash', 'trip', 'trip', 'trip'])
        self.assertEqual(n['raw_final'], '410.50')
        self.assertEqual(n['running_last'], '410.50')
        self.assertEqual(n['rows'][3]['date_fix']['to'], '2025-12-30')
        self.assertEqual(n['rows'][3]['entry']['entry_date'], '2025-12-30')
        self.assertEqual(n['unknown'], [])
        self.assertEqual(n['first_date'], '2024-03-13')

    def test_unknown_rows_are_collected_not_fatal(self):
        ws = book([('ΗΜΕΡ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ'),
                   (dt.datetime(2024, 1, 5), 'ΔΩΡΟ ΠΑΣΧΑ', 150, None, None, None, -150)])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertEqual(len(n['unknown']), 1)
        self.assertIn('ΔΩΡΟ', n['unknown'][0]['reason'])
        self.assertIsNone(n['running_last'])
        self.assertEqual(n['balance_sum'], '-150.00')

    def test_no_header_returns_none(self):
        self.assertIsNone(parse_sheet(book([('x', 'y'), (1, 2)]), today=dt.date(2026, 9, 5)))

if __name__ == '__main__':
    unittest.main()
