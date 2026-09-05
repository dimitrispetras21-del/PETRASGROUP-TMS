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

    def test_skipped_sheets_section_owner_only(self):
        # B1: names/counts land in owner, only the two counts land in public
        skipped = [{'file_id': 'F9', 'file_name': 'ΚΑΠΟΙΟΣ.xlsx', 'sheet': 'Sheet3', 'non_empty_cells': 12, 'matched_fields': ['date']}]
        owner, public = build({}, {}, {}, [], [], skipped_sheets=skipped)
        self.assertIn('ΚΑΠΟΙΟΣ.xlsx', owner); self.assertIn('Sheet3', owner)
        self.assertNotIn('ΚΑΠΟΙΟΣ.xlsx', public); self.assertNotIn('Sheet3', public)
        self.assertIn('Φύλλα που δεν διαβάστηκαν: 1 (μη κενά κελιά 12)', public)

    def test_after_totals_and_text_amounts_sections(self):
        # B5/I8: per-driver detail resolved from the plan's own nodes, joined to inventory
        plans = {'X': {'driver_key': 'X', 'driver_id': 8, 'status': 'ready', 'batches': [], 'patches': [],
                       'nodes': [{'file_id': 'F1', 'sheet': 'S1', 'role': 'chain', 'expected_final': '0.00'}],
                       'auto_unmatched': [], 'date_fixes': [], 'needs_decision': [], 'expected_total_balance': '0.00', 'create_driver': None,
                       'warnings': ['κάτι ασυνήθιστο'], 'crosscheck': {'F2': 3}}}
        nodes = [{'file_id': 'F1', 'sheet': 'S1', 'unknown': [],
                  'after_totals': [{'row': 40, 'label': 'ΔΟΣΗ ΔΑΝΕΙΟΥ', 'amount': -200.0}],
                  'text_amount_rows': [{'row': 12, 'field': 'expenses', 'text': '?'}]}]
        owner, public = build(plans, {}, {}, nodes, [])
        self.assertIn('ΔΟΣΗ ΔΑΝΕΙΟΥ', owner); self.assertIn('S1', owner); self.assertIn('40', owner)
        self.assertIn('expenses', owner); self.assertIn('κάτι ασυνήθιστο', owner)
        self.assertIn('αρχείο F2, 3 γραμμ.', owner)
        self.assertNotIn('ΔΟΣΗ ΔΑΝΕΙΟΥ', public); self.assertNotIn('κάτι ασυνήθιστο', public)
        self.assertIn('Σημειώσεις κάτω από ΣΥΝΟΛΟ: 1 · ποσά ως κείμενο: 1 · προειδοποιήσεις σχεδίων: 1 · γραμμές αντιγράφων που λείπουν: 1', public)

    def test_map_report_section(self):
        mapping = {'_report': {'duplicate_driver_ids': [1], 'unmapped_files': {'F9': 'μόνο μικρό όνομα'},
                                'drivers_in_db_without_ledger_file': [4, 6], 'db_active_true_but_file_in_stopped_folder': [24]}}
        owner, public = build({}, {}, mapping, [], [])
        self.assertIn('Διπλά driver_id: 1', owner); self.assertIn('μόνο μικρό όνομα', owner)
        self.assertIn('Από το map: 1 διπλά id, 1 αρχεία χωρίς αντιστοίχιση, 2 οδηγοί χωρίς αρχείο, 1 ασυμφωνίες active/ΣΤΑΜΑΤΗΣΑΝ', public)

    def test_new_drivers_next_to_existing_two_columns(self):
        plans = {'ΝΕΟΣ': {'driver_key': 'ΝΕΟΣ', 'driver_id': None, 'status': 'ready', 'nodes': [], 'batches': [], 'patches': [],
                 'auto_unmatched': [], 'date_fixes': [], 'needs_decision': [], 'expected_total_balance': '0.00',
                 'create_driver': {'Full Name': 'Νέος Οδηγός'}}}
        drivers = [[1, 'Existing One', True], [2, 'Existing Two', True]]
        owner, public = build(plans, {}, {}, [], [], drivers=drivers)
        self.assertIn('Νέος Οδηγός', owner); self.assertIn('Existing One', owner); self.assertIn('Existing Two', owner)

if __name__ == '__main__':
    unittest.main()
