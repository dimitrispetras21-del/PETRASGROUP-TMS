import unittest, sys, os, json, copy, hashlib, tempfile
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
        self.assertEqual(len(saved), 2)                      # B3: once right after the POST (created_legacy_id), once after the lookup resolves driver_id

    def test_ensure_driver_crash_between_post_and_lookup_resumes_without_repost(self):
        # B3: the lookup after the POST finds no match (server not caught up yet,
        # or the process died before this line ran last time) — Mismatch, but
        # created_legacy_id must survive so a retry never re-creates the driver.
        api = api_with({'post': [{'id': 'recNEW'}], 'get': [{'drivers': []}, {'drivers': [{'id': 77, 'legacy_id': 'recNEW'}]}]})
        state = {}
        with self.assertRaises(C.Mismatch):
            C.ensure_driver(api, dict(PLAN), state, save=lambda s: None)
        self.assertEqual(state['X']['created_legacy_id'], 'recNEW')
        self.assertNotIn('driver_id', state['X'])
        self.assertEqual(C.ensure_driver(api, dict(PLAN), state, save=lambda s: None), 77)
        api.post.assert_called_once()                        # never re-POSTed on the second call

    def test_ensure_driver_is_idempotent_from_state(self):
        api = api_with({})
        self.assertEqual(C.ensure_driver(api, dict(PLAN), {'X': {'driver_id': 77}}, save=lambda s: None), 77)
        api.post.assert_not_called()

    def test_ensure_driver_reuse_path_saves(self):
        api = api_with({}); saved = []
        plan = dict(PLAN); plan['driver_id'] = 8; plan['create_driver'] = None
        self.assertEqual(C.ensure_driver(api, plan, {}, save=lambda s: saved.append(1)), 8)
        self.assertEqual(saved, [1]); api.post.assert_not_called()

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

    def test_apply_patches_saves_after_each_patch(self):
        # I4: a crash between two patches must not repeat the one already sent
        api = api_with({'patch': [{'id': 900}]})
        auto = [{'dl_id': 900, 'driver_id': 8, 'trip_value': None, 'advance': None, 'expenses': None, 'note': None}]
        state = {'X': {}}; saved = []
        C.apply_patches(api, 8, PLAN['patches'], auto, state, 'X', save=lambda s: saved.append(dict(s['X'])))
        self.assertEqual(len(saved), 1); self.assertEqual(saved[0]['patched'], [900])

    def test_import_batch_rejects_stale_workbook(self):
        # I3: the plan recorded the file's hash at build time — a workbook that
        # changed since must not be imported under the old, reviewed rows
        batch = dict(PLAN['batches'][0]); batch['file_hash'] = 'reviewed-hash'
        with self.assertRaises(C.Mismatch) as cm:
            C.import_batch(api_with({}), 8, batch, file_hash='current-hash-on-disk')
        self.assertIn('workbook changed', str(cm.exception))

    def test_dry_run_bodies_builds_without_network(self):
        # I2: dry run builds the same bodies apply_patches/import_batch would send
        auto = [{'dl_id': 900, 'driver_id': 8, 'trip_value': None, 'advance': None, 'expenses': None, 'note': None}]
        plan = dict(PLAN); plan['driver_id'] = 8; plan['create_driver'] = None
        batch_bodies, patch_bodies = C.dry_run_bodies(plan, auto)
        self.assertEqual(len(batch_bodies), 1); self.assertNotIn('src', batch_bodies[0][0])
        self.assertEqual(patch_bodies, [{'trip_value': 450.0, 'advance': 300.0, 'note': 'Excel: B'}])

    def test_proof_uses_newest_running_balance(self):
        api = api_with({'get': [{'records': [{'id': 2, 'running_balance': '250.00'}, {'id': 1, 'running_balance': '100.00'}], 'rts': []}]})
        self.assertEqual(C.proof(api, 8), '250.00')

    def test_save_is_atomic(self):
        import tempfile, json, os
        d = tempfile.mkdtemp(); p = os.path.join(d, 'state.json')
        C.save({'a': 1}, path=p)
        self.assertEqual(json.load(open(p)), {'a': 1}); self.assertEqual(os.listdir(d), ['state.json'])


class TestRun(unittest.TestCase):
    """run() reads the plan file straight off disk (to hash the exact reviewed
    bytes — B2), so these tests point commit.WORK at a scratch directory."""
    REUSE_PLAN = {'driver_key': 'X', 'driver_id': 8, 'create_driver': None,
                  'batches': [{'file_id': 'F1', 'file_name': 'X.xlsx', 'expected_final': '100.00',
                               'rows': [{'entry_type': 'trip', 'entry_date': '2024-01-10', 'route': 'A', 'trip_value': 400.0, 'advance': 300.0, 'src': {'sheet': 'S', 'row': 4}}]}],
                  'patches': [{'dl_id': 900, 'trip_value': 450.0, 'advance': 300.0, 'note': 'Excel: B', 'src': {'sheet': 'S', 'row': 6}}],
                  'expected_total_balance': '250.00', 'status': 'ready'}
    AUTO = [{'dl_id': 900, 'driver_id': 8, 'trip_value': None, 'advance': None, 'expenses': None, 'note': None}]
    MAPPING = {'X': {'driver_id': 8, 'files': ['F1'], 'crosscheck': []}}

    def setUp(self):
        self.orig_work = C.WORK
        self.tmp = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.tmp, 'plans'))
        C.WORK = self.tmp
        self.plan_path = os.path.join(self.tmp, 'plans', 'X.json')
        json.dump(self.REUSE_PLAN, open(self.plan_path, 'w', encoding='utf-8'))
        self.plan_sha256 = hashlib.sha256(open(self.plan_path, 'rb').read()).hexdigest()
        local = os.path.join(self.tmp, 'X.xlsx'); open(local, 'wb').write(b'workbook bytes')
        self.index = [{'id': 'F1', 'local': local}]

    def tearDown(self):
        C.WORK = self.orig_work

    def test_run_rejects_stale_review_hash(self):
        # B2: the review was written against different bytes than the plan on disk
        reviews = {'X': {'verdict': 'ok', 'plan_sha256': 'not-the-real-hash'}}
        with self.assertRaises(C.Mismatch) as cm:
            C.run({'X': self.REUSE_PLAN}, reviews, self.AUTO, self.index, [], self.MAPPING, None, {}, commit=False)
        self.assertIn('changed since review', str(cm.exception))

    def test_run_rejects_verify_plan_failure(self):
        # B2: re-verify before touching a driver — here the map doesn't know this key
        reviews = {'X': {'verdict': 'ok', 'plan_sha256': self.plan_sha256}}
        with self.assertRaises(C.Mismatch) as cm:
            C.run({'X': self.REUSE_PLAN}, reviews, self.AUTO, self.index, [], {}, None, {}, commit=False)
        self.assertIn('verify_plan rejected', str(cm.exception))

    def test_run_dry_run_builds_bodies_with_no_api_calls(self):
        # I2: same checks, no network — api=None must never be touched
        reviews = {'X': {'verdict': 'ok', 'plan_sha256': self.plan_sha256}}
        C.run({'X': self.REUSE_PLAN}, reviews, self.AUTO, self.index, [], self.MAPPING, None, {}, commit=False)

    def test_run_commit_computes_delta_not_absolute_balance(self):
        # I1: the driver already has a 40.00 balance before this import (from
        # earlier manual entries/RT auto rows); proof must check that the balance
        # moved by expected_total_balance, not that it now equals it.
        reviews = {'X': {'verdict': 'ok', 'plan_sha256': self.plan_sha256}}
        api = api_with({
            'get': [{'records': [{'id': 5, 'running_balance': '40.00'}]},      # before
                    {'records': [{'id': 6, 'running_balance': '290.00'}]}],    # after
            'post': [{'batch': 'b1', 'rows': 1, 'balance': '100.00'}],
            'patch': [{'id': 900}],
        })
        state = {}
        C.run({'X': self.REUSE_PLAN}, reviews, self.AUTO, self.index, [], self.MAPPING, api, state, commit=True)
        self.assertEqual(state['X']['before'], '40.00')
        self.assertEqual(state['X']['proof']['delta'], '250.00')
        self.assertTrue(state['X']['done'])

if __name__ == '__main__':
    unittest.main()
