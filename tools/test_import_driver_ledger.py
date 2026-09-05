import unittest, tempfile, os, datetime as dt, sys, io, urllib.error
from decimal import Decimal
from unittest.mock import patch
import openpyxl
from import_driver_ledger import parse_workbook, compute_balance, classify, payload_rows, post_import

def make_xlsx(rows):
    wb = openpyxl.Workbook(); ws = wb.active
    ws['E1'] = 'ΟΔΗΓΟΣ  ΤΕΣΤ'
    for col, h in zip('CEFGHIJK', ['ΗΜΕΡΟΜΗΝΙΑ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', 'ΥΠΟΛΟΙΠΟ', 'ΑΞΙΑ ΔΡΟΜΟΛΟΓΙΟΥ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ ΥΠΟΛΟΙΠΟ']):
        ws[f'{col}3'] = h
    r = 4
    for row in rows:
        for col, v in row.items(): ws[f'{col}{r}'] = v
        r += 1
    ws[f'C{r}'] = 'ΣΥΝΟΛΟ'; ws[f'F{r}'] = f'=SUM(F4:F{r-1})'
    p = os.path.join(tempfile.mkdtemp(), 't.xlsx'); wb.save(p); return p

class PayloadRowsTests(unittest.TestCase):
    def test_payload_rows_filters_underscore_and_none(self):
        rows = [{'entry_type':'trip','entry_date':'2024-08-10','date_end':None,'route':'X','trip_value':800.0,'advance':200.0,'expenses':0.0,'_row':4}]
        result = payload_rows(rows)
        expected = [{'entry_type':'trip','entry_date':'2024-08-10','route':'X','trip_value':800.0,'advance':200.0,'expenses':0.0}]
        self.assertEqual(result, expected)

    def test_payload_rows_filters_empty_string(self):
        # A trip with no description classifies with route='' — must not be sent
        # as an empty string (would store route='' instead of leaving it unset).
        rows = [{'entry_type':'trip','entry_date':'2024-08-10','route':'','trip_value':800.0,'advance':200.0,'expenses':0.0,'_row':5}]
        result = payload_rows(rows)
        expected = [{'entry_type':'trip','entry_date':'2024-08-10','trip_value':800.0,'advance':200.0,'expenses':0.0}]
        self.assertEqual(result, expected)

class ClassifyTests(unittest.TestCase):
    def test_trip(self):
        r = classify(1, dt.datetime(2024, 8, 10), dt.datetime(2024, 8, 15), 'ΒΕΡΟΙΑ-ΙΤΑΛΙΑ-ΒΕΡΟΙΑ', 200, 0, 800)
        self.assertEqual(r, {'entry_type': 'trip', 'entry_date': '2024-08-10', 'date_end': '2024-08-15',
                             'route': 'ΒΕΡΟΙΑ-ΙΤΑΛΙΑ-ΒΕΡΟΙΑ', 'trip_value': 800.0, 'advance': 200.0, 'expenses': 0.0})
    def test_cash_and_bank(self):
        self.assertEqual(classify(None, dt.datetime(2024, 9, 10), None, 'ΜΕΤΡΗΤΑ', 650, 0, 0),
                         {'entry_type': 'payment_cash', 'entry_date': '2024-09-10', 'amount': 650.0})
        self.assertEqual(classify(None, dt.datetime(2024, 9, 2), None, 'ΚΑΤΑΘΕΣΗ ΤΡΑΠΕΖΑ ETE', 600, 0, 0)['entry_type'], 'payment_bank')
    def test_unknown_row_raises(self):
        with self.assertRaises(ValueError):
            classify(None, dt.datetime(2024, 9, 2), None, 'ΔΩΡΟ ΠΑΣΧΑ', 100, 0, 0)
    def test_national_without_number_is_trip(self):
        self.assertEqual(classify(None, dt.datetime(2025, 8, 19), None, 'ΑΘΗΝΑ', 100, 0, 230)['entry_type'], 'trip')

class ParseTests(unittest.TestCase):
    def test_balance_and_year_typo_flag(self):
        p = make_xlsx([
            {'B': 1, 'C': dt.datetime(2024, 8, 10), 'D': dt.datetime(2024, 8, 15), 'E': 'ΒΕΡΟΙΑ-ΙΤΑΛΙΑ-ΒΕΡΟΙΑ', 'F': 200, 'G': 0, 'I': 800},
            {'C': dt.datetime(2024, 8, 19), 'E': 'ΜΕΤΡΗΤΑ', 'F': 600, 'G': 0, 'I': 0},
            {'B': 2, 'C': dt.datetime(2025, 12, 27), 'D': dt.datetime(2025, 1, 3), 'E': 'ΒΕΡΟΙΑ-ΑΥΣΤΡΙΑ', 'F': 300, 'G': 88, 'I': 950},
        ])
        rows, anomalies, excel_final = parse_workbook(p)
        self.assertEqual(len(rows), 3)
        self.assertEqual(compute_balance(rows), Decimal('738.00'))   # (800-200) - 600 + (950-(300-88)) = 738
        self.assertTrue(any('C > D' in a for a in anomalies))
        self.assertIsNone(excel_final)   # openpyxl-written file has no cached formula values

class PostImportTests(unittest.TestCase):
    def test_http_error_caught_first_with_server_body(self):
        """HTTPError is caught before URLError and includes server response body."""
        error_body = b'{"error":"row 3: amount required"}'
        http_err = urllib.error.HTTPError(url='http://test', code=422, msg='Unprocessable', hdrs=None, fp=io.BytesIO(error_body))
        with patch('import_driver_ledger.urllib.request.urlopen', side_effect=http_err):
            with self.assertRaises(SystemExit) as cm:
                post_import({'driver_id': 'rec123', 'rows': []}, 'token_xyz')
            msg = str(cm.exception)
            self.assertTrue(msg.startswith('✗ HTTP 422:'), f'Got: {msg}')
            self.assertIn('amount required', msg)

    def test_url_error_caught_after_http_error(self):
        """URLError (non-HTTP) is caught and includes reason."""
        url_err = urllib.error.URLError('Name or service not known')
        with patch('import_driver_ledger.urllib.request.urlopen', side_effect=url_err):
            with self.assertRaises(SystemExit) as cm:
                post_import({'driver_id': 'rec123', 'rows': []}, 'token_xyz')
            msg = str(cm.exception)
            self.assertTrue(msg.startswith('✗ network error:'), f'Got: {msg}')
            self.assertIn('Name or service not known', msg)

if __name__ == '__main__':
    unittest.main()
