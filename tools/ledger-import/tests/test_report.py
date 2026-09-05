import unittest, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from report import categorize, build

class TestCategorize(unittest.TestCase):
    def test_fixed_categories(self):
        self.assertEqual(categorize('φύλλα Α και Β επικαλύπτονται χρονικά (…)'), 'επικάλυψη φύλλων')
        self.assertEqual(categorize('το φύλλο Χ κλείνει με -72.00 και το επόμενο ξεκινά από 0 — εξοφλήθηκε εκτός καρτέλας;'), 'υπόλοιπο προηγούμενου φύλλου')
        self.assertEqual(categorize('Φύλλο1 row 166: Trip entry 2024-06-18, date_end 2024-04-23 (54 days before)'), 'ημερομηνία')
        self.assertEqual(categorize('MEL γρ. 151: unrecognised row \'ΠΡΟΣΤΙΜΟ\''), 'άγνωστη γραμμή')
        self.assertEqual(categorize('Φύλλο1: το ΠΡΟΟΔΕΥΤΙΚΟ του Excel δεν συμφωνεί με τις γραμμές'), 'ΠΡΟΟΔΕΥΤΙΚΟ ≠ γραμμές')
        self.assertEqual(categorize('Φύλλο1: άθροισμα γραμμών 167.76 ≠ expected_final 0.00'), 'ΠΡΟΟΔΕΥΤΙΚΟ ≠ γραμμές')
        self.assertEqual(categorize('κανένα φύλλο καρτέλας προς εισαγωγή'), 'χωρίς φύλλο καρτέλας')
        self.assertEqual(categorize('rows without dates in Excel — provide dates'), 'ημερομηνία')
        self.assertEqual(categorize('something else entirely'), 'άλλο')

class TestPublicHasNoNames(unittest.TestCase):
    def test_public_summary_is_counts_only(self):
        plans = {'ΠΑΠΠΗΣ ΓΙΑΝΝΗΣ': {'driver_key': 'ΠΑΠΠΗΣ ΓΙΑΝΝΗΣ', 'driver_id': 8, 'status': 'needs_decision', 'nodes': [], 'batches': [], 'patches': [],
                 'auto_unmatched': [], 'date_fixes': [], 'needs_decision': ['Φύλλο1 γρ. 5: unrecognised row \'ΔΩΡΟ 150\''], 'expected_total_balance': '79.03', 'create_driver': None}}
        owner, public = build(plans, {}, {}, [], [])
        self.assertNotIn('ΠΑΠΠΗΣ', public); self.assertNotIn('79.03', public); self.assertNotIn('ΔΩΡΟ', public)
        self.assertIn('άγνωστη γραμμή (1)', public)
        self.assertIn('ΠΑΠΠΗΣ', owner)

if __name__ == '__main__':
    unittest.main()
