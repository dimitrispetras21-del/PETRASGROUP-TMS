import unittest, datetime as dt, sys, os
from decimal import Decimal
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from rules import detect_header, classify, fix_date, raw_balance, Unknown, d2, to_date, norm

D = dt.date

class TestNorm(unittest.TestCase):
    def test_latin_lookalikes_become_greek(self):
        # norm() is for keyword matching only: Latin letters that look Greek become Greek,
        # so genuine Latin words come out mangled — that is accepted, never displayed.
        self.assertTrue(norm('KATAΘΕΣΗ FRESH').startswith('ΚΑΤΑΘΕΣΗ '))
        self.assertTrue(norm('kat.tΡΑΠEZA eur').startswith('ΚΑΤ.ΤΡΑΠΕΖΑ'))
    def test_accents_stripped(self):
        self.assertEqual(norm('Κατάθεση από ΟΕ'), 'ΚΑΤΑΘΕΣΗ ΑΠΟ ΟΕ')

class TestHeader(unittest.TestCase):
    def test_standard_layout_with_unlabeled_end_date_and_seq(self):
        rows = [(None,)*11, ('ΚΑΡΤΕΛΑ',) + (None,)*10,
                (None, None, 'ΗΜΕΡΟΜΗΝΙΑ', None, 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ ΔΡΟΜ.', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ')]
        h = detect_header(rows)
        self.assertEqual(h['row'], 3)
        self.assertEqual(h['cols']['date'], 3)
        self.assertEqual(h['cols']['date_end'], 4)
        self.assertEqual(h['cols']['seq'], 2)          # unlabeled column left of the date
        self.assertEqual(h['cols']['route'], 5)
        self.assertEqual(h['cols']['value'], 9)
        self.assertEqual(h['cols']['running'], 11)
        self.assertFalse(h['out_of_scope'])

    def test_metrita_column_is_not_taken_as_end_date(self):
        # ΜΟΥΡΑΤΙΔΗΣ layout: A=α/α B=ΗΜΕΡ C=ΜΕΤΡΗΤΑ(text) D=ΔΡΟΜΟΛΟΓΙΟ ...
        rows = [(None, 'ΗΜΕΡ.', 'ΜΕΤΡΗΤΑ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', 'ΥΠΟΛΟΙΠΟ', 'ΑΞΙΑ Δ', None, 'ΠΡΟΟΔΕΥΤΙΚΟ')]
        h = detect_header(rows)
        self.assertEqual(h['cols']['cash'], 3)
        self.assertNotIn('date_end', h['cols'])
        self.assertEqual(h['cols']['seq'], 1)

    def test_labeled_seq_latin(self):
        rows = [('A/A', 'ΗΜΕΡΟΜΗΝΙΑ', 'ΛΗΞΗ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΚΟΣΤΟΣ', 'ΥΠΟΛΟΙΠΟ')]
        h = detect_header(rows)
        self.assertEqual(h['cols']['seq'], 1)
        self.assertEqual(h['cols']['date_end'], 3)
        self.assertEqual(h['cols']['value'], 8)

    def test_old_monthly_layout_is_out_of_scope(self):
        rows = [(None, 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', None, 'ΑΞΙΑ Δ', None, 'ΗΜΕΡ', 'ΕΠΙΣΗΜΗ', 'ΤΡΑΠΕΖΑ', 'ΥΠΟΛΟΙΠΟ')]
        self.assertTrue(detect_header(rows)['out_of_scope'])

    def test_unlabeled_date_and_route_are_inferred_from_data(self):
        rows = [(None, 'Σεπτέμβριος 2023', None, None, None, None, None, None, None),
                (None, None, None, 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', 'ΥΠΟΛΟΙΠΟ', 'ΑΞΙΑ ΔΡ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ'),
                (None, None, None, None, None, None, None, None, 0),
                (None, dt.datetime(2023, 9, 14), 'ΘΕΣΣΑΛΟΝΙΚΗ', 0, 0, 0, 60, 60, 60),
                (None, dt.datetime(2023, 9, 15), 'ΑΘΗΝΑ', 100, 20, 80, 230, 150, 210),
                (None, dt.datetime(2023, 9, 20), 'ΜΕΤΡΗΤΑ', 200, 0, 200, 0, -200, 10)]
        h = detect_header(rows)
        self.assertEqual(h['row'], 2)
        self.assertEqual(h['cols']['date'], 2)
        self.assertEqual(h['cols']['route'], 3)
        self.assertEqual(h['cols']['seq'], 1)
        self.assertEqual(h['cols']['value'], 7)

    def test_no_header(self):
        self.assertIsNone(detect_header([('a', 'b'), (1, 2)]))

class TestClassify(unittest.TestCase):
    def test_trip(self):
        e = classify({'date': D(2024, 3, 13), 'date_end': D(2024, 3, 20), 'route': 'ΓΕΡΜΑΝΙΑ', 'advance': 300, 'expenses': 120.5, 'value': 450})
        self.assertEqual(e['entry_type'], 'trip'); self.assertEqual(e['trip_value'], 450.0); self.assertEqual(e['date_end'], '2024-03-20')

    def test_trip_blank_value_is_none(self):
        e = classify({'date': D(2024, 3, 13), 'route': 'ΑΘΗΝΑ', 'advance': 100, 'seq': 12})
        self.assertEqual(e['entry_type'], 'trip'); self.assertIsNone(e['trip_value']); self.assertIsNone(e['expenses'])

    def test_place_with_advance_and_expenses_is_pending_trip(self):
        e = classify({'date': D(2021, 5, 15), 'route': 'ΘΕΣΣΑΛΟΝΙΚΗ', 'advance': 75, 'expenses': 25})
        self.assertEqual(e['entry_type'], 'trip'); self.assertIsNone(e['trip_value']); self.assertEqual(e['expenses'], 25.0)

    def test_trapezounta_is_a_trip_not_a_bank_payment(self):
        e = classify({'date': D(2024, 3, 13), 'route': 'ΤΡΑΠΕΖΟΥΝΤΑ', 'advance': 500, 'value': 4000, 'expenses': 300})
        self.assertEqual(e['entry_type'], 'trip'); self.assertEqual(e['trip_value'], 4000.0)

    def test_cash_payment_by_description(self):
        e = classify({'date': D(2024, 4, 1), 'route': 'ΜΕΤΡΗΤΑ ', 'advance': 200, 'expenses': 0, 'value': 0})
        self.assertEqual(e['entry_type'], 'payment_cash'); self.assertEqual(e['amount'], 200.0); self.assertEqual(e['entry_date'], '2024-04-01')

    def test_bank_payment_by_latin_description_in_cash_column(self):
        label = 'KAT.TΡΑΠEZA EUR'          # Latin K,A,T,T,E,Z,A around Greek Ρ,Α,Π — as typed in the sheet
        e = classify({'date': D(2020, 8, 31), 'cash': label, 'advance': 500, 'expenses': 0})
        self.assertEqual(e['entry_type'], 'payment_bank'); self.assertEqual(e['amount'], 500.0); self.assertEqual(e['note'], label)

    def test_advance_only_with_label_is_cash_payment(self):
        e = classify({'date': D(2022, 10, 4), 'route': 'ΚΑΥΣΙΜΑ ΠΡΑΤΗΡΙΟ', 'advance': 27, 'expenses': 0, 'value': 0})
        self.assertEqual(e, {'entry_type': 'payment_cash', 'entry_date': '2022-10-04', 'amount': 27.0, 'note': 'ΚΑΥΣΙΜΑ ΠΡΑΤΗΡΙΟ'})

    def test_advance_only_without_label_is_cash_payment(self):
        e = classify({'date': D(2022, 10, 4), 'advance': 400})
        self.assertEqual(e['entry_type'], 'payment_cash'); self.assertEqual(e['amount'], 400.0); self.assertNotIn('note', e)

    def test_bank_payment_by_amount_in_bank_column(self):
        e = classify({'date': D(2024, 4, 30), 'bank': 500, 'route': 'ΚΑΤΑΘΕΣΗ'})
        self.assertEqual(e['entry_type'], 'payment_bank'); self.assertEqual(e['amount'], 500.0)

    def test_negative_advance_is_adjustment(self):
        e = classify({'date': D(2019, 7, 24), 'route': 'ΜΕΤΡΗΤΑ', 'advance': -297.34})
        self.assertEqual(e['entry_type'], 'adjustment'); self.assertEqual(e['amount'], 297.34)

    def test_value_only_credit_is_adjustment(self):
        e = classify({'route': 'ΠΙΣΤΩΣΗ ΛΟΓΟΥ ΛΑΘΟΥΣ ΑΞΙΑΣ ΔΡΟΜ', 'value': 50, 'advance': 0, 'expenses': 0})
        self.assertEqual(e['entry_type'], 'adjustment'); self.assertEqual(e['amount'], 50.0); self.assertIsNone(e['entry_date'])

    def test_payment_keyword_with_value_and_no_advance_is_unknown(self):
        with self.assertRaises(Unknown):
            classify({'date': D(2023, 7, 10), 'route': 'ΜΕΤΡΗΤΑ', 'advance': 0, 'value': 250})

    def test_carry_row(self):
        e = classify({'date': D(2025, 1, 1), 'route': 'ΜΕΤΑΦΟΡΑ ΥΠΟΛΟΙΠΟΥ', 'balance': 123.45})
        self.assertEqual(e['entry_type'], 'carry'); self.assertEqual(e['amount'], 123.45)

    def test_blank_text_only_and_totals(self):
        self.assertIsNone(classify({'date': None, 'route': None}))
        self.assertIsNone(classify({'date': D(2024, 1, 1), 'route': 'ΣΗΜΕΙΩΣΗ'}))                    # text only, no money
        self.assertEqual(classify({'route': 'ΣΥΝΟΛΟ', 'value': 999}), 'TOTALS')
        self.assertEqual(classify({'value': 999, 'advance': 100, '_row_text': 'ΣΥΝΟΛΑ 2023'}), 'TOTALS')
        self.assertEqual(classify({'value': 26030, 'advance': 30014.2, 'expenses': 3225.2}), 'TOTALS')   # numbers only, no date, no text

    def test_no_date_with_label_returns_none_date(self):
        e = classify({'route': 'ΑΠΌ ΠΩΛΗΣΗ ΕΥΡΩΠΑΛΕΤΩΝ', 'advance': 90, 'expenses': 0, 'value': 0})
        self.assertEqual(e['entry_type'], 'payment_cash'); self.assertIsNone(e['entry_date'])

    def test_unknown_advance_and_expenses_without_label(self):
        with self.assertRaises(Unknown):
            classify({'date': D(2024, 1, 1), 'advance': 100, 'expenses': 30})

    def test_dated_row_mentioning_synoliko_is_not_totals(self):
        e = classify({'date': D(2024, 5, 10), 'route': 'ΓΕΡΜΑΝΙΑ', 'advance': 300, 'expenses': 50, 'value': 800,
                      '_row_text': 'ΓΕΡΜΑΝΙΑ ΣΥΝΟΛΙΚΟ ΦΟΡΤΙΟ 24 ΠΑΛΕΤΕΣ'})
        self.assertEqual(e['entry_type'], 'trip'); self.assertEqual(e['trip_value'], 800.0)

    def test_synolo_cell_is_totals_even_with_a_date(self):
        self.assertEqual(classify({'date': D(2024, 12, 31), 'route': 'ΣΥΝΟΛΟ', 'value': 9000, 'advance': 5000, 'expenses': 300}), 'TOTALS')
        self.assertEqual(classify({'date': D(2024, 12, 31), 'route': 'ΓΕΝΙΚΟ ΣΥΝΟΛΟ', 'value': 9000}), 'TOTALS')

    def test_payment_line_with_expenses_nets_them(self):
        e = classify({'date': D(2024, 4, 1), 'route': 'ΜΕΤΡΗΤΑ', 'advance': 200, 'expenses': 5, 'value': 0})
        self.assertEqual(e['entry_type'], 'payment_cash'); self.assertEqual(e['amount'], 195.0)
        self.assertIn('ΕΞΟΔΑ 5.00', e['note'])

    def test_payment_line_with_expenses_equal_to_amount_is_zero_net(self):
        # ΚΑΤΑΘΕΣΗ ΠΕΙΡΑΙΩΣ 120 / ΕΞΟΔΑ 120: the company paid an expense through the
        # driver; the driver's balance does not move, so there is nothing to record.
        self.assertEqual(classify({'date': D(2024, 4, 1), 'route': 'ΚΑΤΑΘΕΣΗ ΠΕΙΡΑΙΩΣ', 'advance': 120, 'expenses': 120}), 'ZERO_NET')
        with self.assertRaises(Unknown):
            classify({'date': D(2024, 4, 1), 'route': 'ΚΑΤΑΘΕΣΗ', 'advance': 5, 'expenses': 9})

class TestFixDate(unittest.TestCase):
    today = D(2026, 9, 5)
    def test_year_typo_in_future_is_fixed(self):
        r = fix_date(D(2026, 12, 27), [D(2025, 12, 20), D(2025, 12, 22), D(2026, 1, 5)], self.today)
        self.assertEqual(r[0], D(2025, 12, 27)); self.assertIn('2026-12-27', r[1])
    def test_spike_a_year_off_inside_the_past_is_fixed(self):
        r = fix_date(D(2025, 12, 27), [D(2024, 12, 20), D(2024, 12, 29), D(2025, 1, 5)], self.today)
        self.assertEqual(r, (D(2024, 12, 27), 'ημ/νία Excel 2025-12-27 → 2024-12-27 (έτος)'))
    def test_out_of_order_but_near_is_untouched(self):
        self.assertEqual(fix_date(D(2025, 5, 1), [D(2025, 6, 1), D(2025, 6, 3)], self.today), (D(2025, 5, 1), None))
    def test_no_neighbours_future_is_none(self):
        self.assertIsNone(fix_date(D(2026, 12, 27), [], self.today))
    def test_month_day_swap_is_not_repaired(self):
        self.assertIsNone(fix_date(D(2022, 9, 12), [D(2022, 2, 2), D(2022, 2, 5), D(2022, 2, 7)], self.today))

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
