# tools/ledger-import/tests/test_inventory.py
import unittest, sys, os, datetime as dt
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
            (None, None, 'ΗΜΕΡΟΜΗΝΙΑ', None, 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ'),
            (None, 1, dt.datetime(2024, 3, 13), dt.datetime(2024, 3, 20), 'ΓΕΡΜΑΝΙΑ', 300, 120.5, None, 450, 270.5, 270.5),
            (None, None, dt.datetime(2024, 4, 1), None, 'ΜΕΤΡΗΤΑ', 200, None, None, None, -200, 70.5),
            (None, None, None, None, 'ΑΠΌ ΠΩΛΗΣΗ ΕΥΡΩΠΑΛΕΤΩΝ', 90, 0, None, 0, -90, -19.5),   # no date → inherits 2024-04-01
            (None, 2, dt.datetime(2024, 12, 27), None, 'ΑΘΗΝΑ', 100, None, None, 230, 130, 110.5),
            (None, 3, dt.datetime(2025, 12, 30), None, 'ΠΑΤΡΑ', 100, None, None, 230, 130, 240.5),   # spike: a year off → 2024-12-30
            (None, 4, dt.datetime(2025, 1, 4), None, 'ΘΕΣΣΑΛΟΝΙΚΗ', 0, None, None, 80, 80, 320.5),
            (None, None, dt.datetime(2025, 1, 6), None, 'ΣΗΜΕΙΩΣΗ ΧΩΡΙΣ ΠΟΣΑ', None, None, None, None, None, None),
            (None, None, None, None, None, 790, 120.5, None, 990, None, None),                       # totals without the word
            (None, None, 'ΣΥΝΟΛΟ', None, None, 790, 120.5, None, 990, None, None),
        ])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertEqual(n['header_row'], 3)
        self.assertEqual(n['cols']['seq'], 2)
        self.assertEqual(n['n_rows'], 6)
        self.assertEqual([r['entry']['entry_type'] for r in n['rows']], ['trip', 'payment_cash', 'payment_cash', 'trip', 'trip', 'trip'])
        self.assertEqual(n['rows'][2]['entry']['entry_date'], '2024-04-01')
        self.assertTrue(n['rows'][2]['date_inherited'])
        self.assertIn('προηγούμενη γραμμή', n['rows'][2]['entry']['note'])
        self.assertEqual(n['rows'][4]['date_fix']['to'], '2024-12-30')
        self.assertEqual(n['rows'][4]['entry']['entry_date'], '2024-12-30')
        self.assertEqual(n['raw_final'], '320.50')
        self.assertEqual(n['running_last'], '320.50')
        self.assertEqual(n['totals_skipped'], 2)
        self.assertEqual(n['text_only_skipped'], 1)
        self.assertEqual(n['unknown'], [])
        self.assertEqual(n['first_date'], '2024-03-13')

    def test_unknown_rows_are_collected_not_fatal(self):
        ws = book([('ΗΜΕΡ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ'),
                   (dt.datetime(2024, 1, 5), None, 100, 30, None, None, -70)])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertEqual(len(n['unknown']), 1)
        self.assertIsNone(n['running_last'])
        self.assertEqual(n['balance_sum'], '-70.00')
        self.assertEqual(n['raw_final'], '-70.00')

    def test_first_row_without_date_is_unknown(self):
        ws = book([('ΗΜΕΡ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ', 'ΥΠΟΛΟΙΠΟ'),
                   (None, 'ΜΕΤΡΗΤΑ', 100, None, None, None, -100)])
        n = parse_sheet(ws, today=dt.date(2026, 9, 5))
        self.assertEqual(n['n_rows'], 0)
        self.assertIn('no previous row', n['unknown'][0]['reason'])

    def test_no_header_returns_none(self):
        self.assertIsNone(parse_sheet(book([('x', 'y'), (1, 2)]), today=dt.date(2026, 9, 5)))

if __name__ == '__main__':
    unittest.main()
