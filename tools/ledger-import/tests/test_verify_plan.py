import unittest, sys, os, copy
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from verify_plan import verify, cross_plan_errors

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

    def test_plan_driver_id_when_map_says_create_is_rejected(self):
        m = {'driver_id': None, 'create': {'Full Name': 'X Y', 'Active': True}, 'files': ['F1'], 'crosscheck': []}
        self.assertTrue(any('map says create' in e for e in verify(plan(driver_id=42), [NODE], AUTO, m)))

    def test_create_driver_when_map_has_id_is_rejected(self):
        p = plan(driver_id=None, create_driver={'Full Name': 'X Y', 'Active': True})
        self.assertTrue(any('map has driver_id' in e for e in verify(p, [NODE], AUTO, MAP)))

    # I2 — per-type checks mirroring the Worker (ledger-rules.mjs)
    def test_trip_amount_forbidden(self):
        p = plan(); p['batches'][0]['rows'][0]['amount'] = 5.0
        self.assertTrue(any('amount is not allowed on a trip' in e for e in verify(p, [NODE], AUTO, MAP)))

    def test_trip_negative_value_rejected(self):
        p = plan(); p['batches'][0]['rows'][0]['trip_value'] = -1.0
        self.assertTrue(any('trip_value must be a number' in e for e in verify(p, [NODE], AUTO, MAP)))

    def test_payment_forbids_trip_fields(self):
        p = plan(); p['batches'][0]['rows'] = [{'entry_type': 'payment_cash', 'entry_date': '2024-02-01', 'amount': 50.0, 'route': 'X', 'src': {'sheet': 'S1', 'row': 5}}]
        p['batches'][0]['expected_final'] = '-50.00'
        self.assertTrue(any('route is not allowed on a payment_cash' in e for e in verify(p, [NODE], AUTO, MAP)))

    def test_entry_date_bad_format_rejected(self):
        p = plan(); p['batches'][0]['rows'][0]['entry_date'] = '10/01/2024'
        self.assertTrue(any('entry_date must be YYYY-MM-DD' in e for e in verify(p, [NODE], AUTO, MAP)))

    def test_batch_over_worker_cap_rejected(self):
        p = plan()
        row = {'entry_type': 'payment_cash', 'entry_date': '2024-01-01', 'amount': 1.0, 'src': {'sheet': 'S1', 'row': 1}}
        p['batches'][0]['rows'] = [row] * 2001
        p['batches'][0]['expected_final'] = '-2001.00'
        self.assertTrue(any('Worker cap' in e for e in verify(p, [NODE], AUTO, MAP)))

    # I7 — cross-plan guards
    def test_cross_plan_same_driver_id_rejects_both(self):
        extra = cross_plan_errors({'A': {'driver_id': 8, 'batches': []}, 'B': {'driver_id': 8, 'batches': []}})
        self.assertIn('A', extra); self.assertIn('B', extra)
        self.assertTrue(any('driver_id 8' in e for e in extra['A']))

    def test_cross_plan_same_file_id_rejects_both(self):
        extra = cross_plan_errors({'A': {'driver_id': 1, 'batches': [{'file_id': 'F1'}]}, 'B': {'driver_id': 2, 'batches': [{'file_id': 'F1'}]}})
        self.assertIn('A', extra); self.assertIn('B', extra)

    def test_cross_plan_no_overlap_is_clean(self):
        extra = cross_plan_errors({'A': {'driver_id': 1, 'batches': [{'file_id': 'F1'}]}, 'B': {'driver_id': 2, 'batches': [{'file_id': 'F2'}]}})
        self.assertEqual(extra, {})

    def test_trip_date_end_before_entry_date_rejected(self):
        p = plan()
        p['batches'][0]['rows'][0]['date_end'] = '2024-01-09'  # before entry_date '2024-01-10'
        errs = verify(p, [NODE], AUTO, MAP)
        self.assertTrue(any('date_end' in e for e in errs))

    def test_skip_status_passes_with_reason(self):
        self.assertEqual(verify(plan(status='skip', needs_decision=['ΠΑΡΑΛΕΙΨΗ: inactive']), [NODE], AUTO, MAP), [])
        self.assertTrue(verify(plan(status='skip', needs_decision=[]), [NODE], AUTO, MAP))

    def test_decided_date_override_clears_unrepaired_flag(self):
        node = copy.deepcopy(NODE); node['rows'][0]['date_problem'] = 'spike'
        self.assertTrue(any('unrepaired' in e for e in verify(plan(), [node], AUTO, MAP)))
        p = plan(date_fixes=[{'from': '2024-01-10', 'to': '2024-02-10', 'note': 'απόφαση', 'sheet': 'S1', 'row': 4}])
        self.assertFalse(any('unrepaired' in e for e in verify(p, [node], AUTO, MAP)))

if __name__ == '__main__':
    unittest.main()
