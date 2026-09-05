import unittest, sys, os, copy
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from verify_plan import verify

NODE = {'file_id': 'F1', 'file_name': 'X.xlsx', 'sheet': 'S1', 'out_of_scope': False, 'raw_final': '100.00', 'running_last': '100.00', 'running_consistent': True, 'expected_final': '100.00',
        'rows': [{'row': 4, 'entry': {'entry_type': 'trip', 'entry_date': '2024-01-10', 'date_end': None, 'route': 'A', 'trip_value': 400.0, 'advance': 300.0, 'expenses': None}, 'date_problem': None},
                 {'row': 5, 'entry': {'entry_type': 'payment_cash', 'entry_date': '2024-02-01', 'amount': 0.0}, 'date_problem': None}],
        'unknown': []}
AUTO = [{'dl_id': 900, 'driver_id': 8, 'entry_date': '2026-08-14', 'trip_value': None, 'advance': None, 'expenses': None}]
MAP = {'driver_id': 8, 'files': ['F1'], 'crosscheck': []}

def plan(**over):
    p = {'driver_key': 'X', 'driver_id': 8, 'create_driver': None,
         'nodes': [{'file_id': 'F1', 'sheet': 'S1', 'role': 'chain', 'expected_final': '100.00'}],
         'batches': [{'file_id': 'F1', 'file_name': 'X.xlsx', 'expected_final': '100.00',
                      'rows': [{'entry_type': 'trip', 'entry_date': '2024-01-10', 'route': 'A', 'trip_value': 400.0, 'advance': 300.0, 'src': {'sheet': 'S1', 'row': 4}}]}],
         'patches': [{'dl_id': 900, 'trip_value': 450.0, 'advance': 300.0, 'expenses': 0.0, 'note': 'Excel: B', 'src': {'sheet': 'S1', 'row': 6}}],
         'cutoff': '2026-08-13', 'auto_unmatched': [], 'date_fixes': [], 'needs_decision': [],
         'expected_total_balance': '250.00', 'status': 'ready'}
    p.update(over); return p

class TestVerify(unittest.TestCase):
    def test_ok(self):
        self.assertEqual(verify(plan(), [NODE], AUTO, MAP), [])
    def test_batch_balance_mismatch(self):
        p = plan(); p['batches'][0]['rows'][0]['trip_value'] = 100.0
        self.assertTrue(any('batch balance' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_rt_id_in_import_row_rejected(self):
        p = plan(); p['batches'][0]['rows'][0]['rt_id'] = 5
        self.assertTrue(any('rt_id' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_patch_on_written_field_rejected(self):
        auto = copy.deepcopy(AUTO); auto[0]['trip_value'] = 10.0
        self.assertTrue(any('not NULL' in e for e in verify(plan(), [NODE], auto, MAP)))
    def test_patch_wrong_driver_rejected(self):
        auto = copy.deepcopy(AUTO); auto[0]['driver_id'] = 9
        self.assertTrue(any('driver' in e for e in verify(plan(), [NODE], auto, MAP)))
    def test_duplicate_patch_target(self):
        p = plan(); p['patches'].append(dict(p['patches'][0]))
        self.assertTrue(any('twice' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_payment_zero_rejected(self):
        p = plan(); p['batches'][0]['rows'].append({'entry_type': 'payment_cash', 'entry_date': '2024-02-01', 'amount': 0.0, 'src': {'sheet': 'S1', 'row': 5}})
        self.assertTrue(any('amount' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_total_balance_mismatch(self):
        p = plan(expected_total_balance='999.00')
        self.assertTrue(any('total' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_needs_decision_status_skips_balance_checks_but_needs_reasons(self):
        p = plan(status='needs_decision', needs_decision=[])
        self.assertTrue(any('needs_decision' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_inconsistent_node_rejected(self):
        node = dict(NODE); node['running_consistent'] = False
        self.assertTrue(any('inconsistent' in e for e in verify(plan(), [node], AUTO, MAP)))
    def test_file_not_in_map(self):
        self.assertTrue(any('map' in e for e in verify(plan(), [NODE], AUTO, {'driver_id': 8, 'files': [], 'crosscheck': []})))
    def test_driver_id_must_match_map(self):
        self.assertTrue(any('map driver' in e for e in verify(plan(driver_id=9), [NODE], AUTO, {'driver_id': 8, 'files': ['F1'], 'crosscheck': []})))
    def test_driver_id_and_create_driver_together_rejected(self):
        p = plan(create_driver={'Full Name': 'X Y', 'Active': True})
        self.assertTrue(any('both' in e for e in verify(p, [NODE], AUTO, MAP)))
    def test_create_driver_plan_needs_map_create(self):
        p = plan(driver_id=None, create_driver={'Full Name': 'X Y', 'Active': True})
        self.assertTrue(any('map has no create' in e for e in verify(p, [NODE], AUTO, {'driver_id': None, 'files': ['F1'], 'crosscheck': []})))

if __name__ == '__main__':
    unittest.main()
