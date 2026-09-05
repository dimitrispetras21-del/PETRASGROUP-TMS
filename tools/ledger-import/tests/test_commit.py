import unittest, sys, os, json, copy
from unittest.mock import MagicMock
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import commit as C

def api_with(responses):
    api = MagicMock()
    api.post.side_effect = responses.get('post', [])
    api.patch.side_effect = responses.get('patch', [])
    api.get.side_effect = responses.get('get', [])
    return api

PLAN = {'driver_key': 'X', 'driver_id': None, 'create_driver': {'Full Name': 'X Y', 'Active': True},
        'batches': [{'file_id': 'F1', 'file_name': 'X.xlsx', 'expected_final': '100.00',
                     'rows': [{'entry_type': 'trip', 'entry_date': '2024-01-10', 'route': 'A', 'trip_value': 400.0, 'advance': 300.0, 'src': {'sheet': 'S', 'row': 4}}]}],
        'patches': [{'dl_id': 900, 'trip_value': 450.0, 'advance': 300.0, 'note': 'Excel: B', 'src': {'sheet': 'S', 'row': 6}}],
        'expected_total_balance': '250.00', 'status': 'ready'}

class TestCommit(unittest.TestCase):
    def test_ensure_driver_creates_then_resolves_numeric_id(self):
        api = api_with({'post': [{'id': 'recNEW', 'fields': {'Full Name': 'X Y'}}],
                        'get': [{'drivers': [{'id': 77, 'legacy_id': 'recNEW', 'full_name': 'X Y', 'active': True}]}]})
        state = {}; saved = []
        self.assertEqual(C.ensure_driver(api, dict(PLAN), state, save=lambda s: saved.append(dict(s))), 77)
        api.post.assert_called_once_with('/v0/appElT5CQV6JQvym8/tbl7UGmYhc2Y82pPs', {'fields': {'Full Name': 'X Y', 'Active': True}})
        self.assertEqual(state['X']['driver_id'], 77)
        self.assertEqual(len(saved), 1)                      # state persisted the moment the id is known

    def test_ensure_driver_is_idempotent_from_state(self):
        api = api_with({})
        self.assertEqual(C.ensure_driver(api, dict(PLAN), {'X': {'driver_id': 77}}, save=lambda s: None), 77)
        api.post.assert_not_called()

    def test_import_batch_strips_src_rt_id_and_checks_balance(self):
        api = api_with({'post': [{'batch': 'b1', 'rows': 1, 'balance': '100.00'}]})
        batch = copy.deepcopy(PLAN['batches'][0]); batch['rows'][0]['rt_id'] = 5
        out = C.import_batch(api, 8, batch, file_hash='abc')
        body = api.post.call_args[0][1]
        self.assertNotIn('src', body['rows'][0]); self.assertNotIn('rt_id', body['rows'][0])
        self.assertEqual(out['batch'], 'b1')

    def test_import_batch_balance_mismatch_raises(self):
        api = api_with({'post': [{'batch': 'b1', 'rows': 1, 'balance': '99.00'}]})
        with self.assertRaises(C.Mismatch): C.import_batch(api, 8, PLAN['batches'][0], file_hash='abc')

    def test_import_batch_409_becomes_mismatch_with_reconcile_hint(self):
        api = MagicMock(); api.post.side_effect = C.ApiError(409, 'this file was already imported')
        with self.assertRaises(C.Mismatch) as cm: C.import_batch(api, 8, PLAN['batches'][0], file_hash='abc')
        self.assertIn('dl_import_batches', str(cm.exception))

    def test_apply_patches_only_null_fields(self):
        api = api_with({'patch': [{'id': 900}]})
        auto = [{'dl_id': 900, 'driver_id': 8, 'trip_value': None, 'advance': None, 'expenses': None, 'note': None}]
        C.apply_patches(api, 8, PLAN['patches'], auto, {'X': {}}, 'X')
        api.patch.assert_called_once_with('/costs/ledger/900', {'trip_value': 450.0, 'advance': 300.0, 'note': 'Excel: B'})

    def test_apply_patches_keeps_existing_note(self):
        api = api_with({'patch': [{'id': 900}]})
        auto = [{'dl_id': 900, 'driver_id': 8, 'trip_value': None, 'advance': None, 'expenses': None, 'note': 'παλιά σημείωση'}]
        C.apply_patches(api, 8, PLAN['patches'], auto, {'X': {}}, 'X')
        self.assertEqual(api.patch.call_args[0][1]['note'], 'παλιά σημείωση · Excel: B')

    def test_apply_patches_refuses_written_field(self):
        api = api_with({})
        auto = [{'dl_id': 900, 'driver_id': 8, 'trip_value': 1.0, 'advance': None, 'expenses': None}]
        with self.assertRaises(C.Mismatch): C.apply_patches(api, 8, PLAN['patches'], auto, {'X': {}}, 'X')
        api.patch.assert_not_called()

    def test_proof_uses_newest_running_balance(self):
        api = api_with({'get': [{'records': [{'id': 2, 'running_balance': '250.00'}, {'id': 1, 'running_balance': '100.00'}], 'rts': []}]})
        self.assertEqual(C.proof(api, 8), '250.00')

    def test_save_is_atomic(self):
        import tempfile, json, os
        d = tempfile.mkdtemp(); p = os.path.join(d, 'state.json')
        C.save({'a': 1}, path=p)
        self.assertEqual(json.load(open(p)), {'a': 1}); self.assertEqual(os.listdir(d), ['state.json'])

if __name__ == '__main__':
    unittest.main()
