import unittest, datetime as dt, sys, os
from decimal import Decimal
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from rules import detect_header, classify, fix_date, raw_balance, Unknown, d2, to_date

D = dt.date

class TestHeader(unittest.TestCase):
    def test_standard_layout_with_unlabeled_end_date(self):
        # ΑΙΜΙΛΙΟΣ layout: header row 3, B=Α/Α C=ΗΜΕΡΟΜΗΝΙΑ D=(end, unlabeled) E=ΔΡΟΜΟΛΟΓΙΟ F=ΕΛΑΒΕ G=ΕΞΟΔΑ I=ΑΞΙΑ ΔΡΟΜ. J=ΥΠΟΛΟΙΠΟ K=ΠΡΟΟΔΕΥΤΙΚΟ
        rows = [(None,)*11, ('ΚΑΡΤΕΛΑ',) + (None,)*10,
                (None, 'Α/Α', 'ΗΜΕΡΟΜΗΝΙΑ', None, 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ ΔΡΟΜ.', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ')]
        h = detect_header(rows)
        self.assertEqual(h['row'], 3)
        self.assertEqual(h['cols']['date'], 3)
        self.assertEqual(h['cols']['date_end'], 4)
        self.assertEqual(h['cols']['route'], 5)
        self.assertEqual(h['cols']['value'], 9)
        self.assertEqual(h['cols']['running'], 11)
        self.assertFalse(h['out_of_scope'])

    def test_shifted_layout_with_lixi_and_metrita(self):
        rows = [('ΗΜΕΡ.', 'ΛΗΞΗ', 'ΜΕΤΡΗΤΑ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΚΟΣΤΟΣ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ')]
        h = detect_header(rows)
        self.assertEqual(h['row'], 1)
        self.assertEqual(h['cols']['date_end'], 2)
        self.assertEqual(h['cols']['cash'], 3)
        self.assertEqual(h['cols']['value'], 8)

    def test_old_monthly_layout_is_out_of_scope(self):
        rows = [(None, 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ Δ', None, 'ΗΜΕΡ', 'ΕΠΙΣΗΜΗ', 'ΤΡΑΠΕΖΑ', 'ΥΠΟΛΟΙΠΟ')]
        self.assertTrue(detect_header(rows)['out_of_scope'])

    def test_no_header(self):
        self.assertIsNone(detect_header([('a', 'b'), (1, 2)]))

class TestClassify(unittest.TestCase):
    def test_trip(self):
        e = classify({'date': D(2024, 3, 13), 'date_end': D(2024, 3, 20), 'route': 'ΓΕΡΜΑΝΙΑ', 'advance': 300, 'expenses': 120.5, 'value': 450})
        self.assertEqual(e['entry_type'], 'trip')
        self.assertEqual(e['trip_value'], 450.0)
        self.assertEqual(e['date_end'], '2024-03-20')

    def test_trip_blank_value_is_none(self):
        e = classify({'date': D(2024, 3, 13), 'route': 'ΑΘΗΝΑ', 'advance': 100, 'seq': 12})
        self.assertEqual(e['entry_type'], 'trip')
        self.assertIsNone(e['trip_value'])
        self.assertIsNone(e['expenses'])   # blank stays NULL, explicit 0 would be 0.0

    def test_cash_payment_by_description(self):
        e = classify({'date': D(2024, 4, 1), 'route': 'ΜΕΤΡΗΤΑ', 'advance': 200})
        self.assertEqual(e, {'entry_type': 'payment_cash', 'entry_date': '2024-04-01', 'amount': 200.0})

    def test_bank_payment_by_column(self):
        e = classify({'date': D(2024, 4, 30), 'bank': 500, 'advance': 500})
        self.assertEqual(e['entry_type'], 'payment_bank')
        self.assertEqual(e['amount'], 500.0)

    def test_carry_row(self):
        e = classify({'date': D(2025, 1, 1), 'route': 'ΜΕΤΑΦΟΡΑ ΥΠΟΛΟΙΠΟΥ', 'balance': 123.45})
        self.assertEqual(e['entry_type'], 'carry')
        self.assertEqual(e['amount'], 123.45)

    def test_blank_and_stop(self):
        self.assertIsNone(classify({'date': None, 'route': None}))
        self.assertEqual(classify({'route': 'ΣΥΝΟΛΟ', 'value': 999}), 'STOP')
        self.assertEqual(classify({'date': 'ΣΥΝΟΛΟ'}), 'STOP')

    def test_unknown_raises(self):
        with self.assertRaises(Unknown):
            classify({'date': D(2024, 1, 1), 'route': 'ΔΩΡΟ ΠΑΣΧΑ', 'advance': 150})
        with self.assertRaises(Unknown):
            classify({'route': 'ΓΕΡΜΑΝΙΑ', 'value': 400})       # amounts but no date

class TestFixDate(unittest.TestCase):
    today = D(2026, 9, 5)
    def test_year_typo_in_future_is_fixed(self):
        r = fix_date(D(2026, 12, 27), D(2025, 12, 20), D(2026, 1, 5), self.today)
        self.assertEqual(r[0], D(2025, 12, 27))
        self.assertIn('2026-12-27', r[1])
    def test_in_range_untouched(self):
        self.assertEqual(fix_date(D(2025, 6, 1), D(2025, 5, 1), D(2025, 7, 1), self.today), (D(2025, 6, 1), None))
    def test_ambiguous_returns_none(self):
        # no neighbours to pin the year: two candidate years fit → refuse
        self.assertIsNone(fix_date(D(2026, 12, 27), None, None, self.today))
    def test_end_before_start_is_ambiguous_when_neighbours_do_not_pin(self):
        self.assertIsNone(fix_date(D(2024, 12, 27), D(2025, 12, 20), None, self.today))

class TestBalance(unittest.TestCase):
    def test_raw_balance(self):
        cells = [{'value': 450, 'advance': 300, 'expenses': 120.5}, {'advance': 200}, {'value': None, 'advance': None, 'expenses': 30}]
        self.assertEqual(raw_balance(cells), Decimal('100.50'))
    def test_d2_and_to_date(self):
        self.assertEqual(d2('1.005'), Decimal('1.01'))
        self.assertEqual(to_date(dt.datetime(2024, 1, 2, 10)), D(2024, 1, 2))
        self.assertEqual(to_date('02/01/2024'), D(2024, 1, 2))
        self.assertIsNone(to_date('ΣΥΝΟΛΟ'))

if __name__ == '__main__':
    unittest.main()
