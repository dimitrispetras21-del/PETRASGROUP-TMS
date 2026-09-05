import unittest, sys, os, copy
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from make_plan import build_plan

def row(rn, date, typ='trip', **kw):
    e = {'entry_type': typ, 'entry_date': date}
    if typ == 'trip': e.update({'date_end': None, 'route': kw.pop('route', 'R'), 'trip_value': kw.pop('value', None), 'advance': kw.pop('advance', None), 'expenses': kw.pop('expenses', None)})
    else: e['amount'] = kw.pop('amount')
    if 'note' in kw: e['note'] = kw.pop('note')
    return {'row': rn, 'entry': e, 'cells': {}, 'date_fix': kw.pop('fix', None), 'date_problem': kw.pop('problem', None), 'date_inherited': False}

def node(file_id, sheet, rows, **kw):
    n = {'file_id': file_id, 'file_name': file_id + '.xlsx', 'sheet': sheet, 'out_of_scope': False, 'rows': rows, 'unknown': [],
         'running_breaks': [], 'opening_balance': None, 'rounding_residual': None, 'running_consistent': True,
         'first_date': min(r['entry']['entry_date'] for r in rows) if rows else None, 'last_date': max(r['entry']['entry_date'] for r in rows) if rows else None,
         'n_rows': len(rows), 'expected_final': kw.pop('final')}
    n.update(kw); return n

ENTRY = {'driver_id': 8, 'files': ['F1'], 'crosscheck': []}

class TestBuildPlan(unittest.TestCase):
    def test_single_sheet_with_break_and_residual(self):
        n = node('F1', 'S1', [row(4, '2024-01-10', value=500, advance=300, expenses=50), row(5, '2024-01-20', 'payment_cash', amount=200), row(6, '2024-02-01', value=230, advance=100)],
                 running_breaks=[{'row': 6, 'entry_date': '2024-02-01', 'diff': '-100.00'}], rounding_residual='0.07', final='80.07')
        p = build_plan('X', ENTRY, [n], [], None)
        self.assertEqual(p['status'], 'ready', p['needs_decision'])
        types = [r['entry_type'] for r in p['batches'][0]['rows']]
        self.assertEqual(types, ['trip', 'payment_cash', 'trip', 'adjustment', 'adjustment'])
        self.assertEqual(p['batches'][0]['rows'][3]['amount'], -100.0)
        self.assertIn('γρ. 6', p['batches'][0]['rows'][3]['note'])
        self.assertEqual(p['batches'][0]['rows'][4]['amount'], 0.07)
        self.assertEqual(p['batches'][0]['expected_final'], '80.07')
        self.assertEqual(p['expected_total_balance'], '80.07')
        self.assertNotIn('rt_id', p['batches'][0]['rows'][0]); self.assertEqual(p['batches'][0]['rows'][0]['src'], {'file_id': 'F1', 'sheet': 'S1', 'row': 4})

    def test_opening_equal_to_previous_final_is_skipped(self):
        a = node('F1', 'S1', [row(4, '2023-01-10', value=500, advance=300)], final='200.00')
        b = node('F1', 'S2', [row(4, '2024-01-10', value=100, advance=50)], opening_balance='200.00', final='250.00')
        p = build_plan('X', ENTRY, [a, b], [], None)
        self.assertEqual(p['status'], 'ready', p['needs_decision'])
        self.assertEqual([r['entry_type'] for b_ in p['batches'] for r in b_['rows']], ['trip', 'trip'])
        self.assertTrue(next(x for x in p['nodes'] if x['sheet'] == 'S2')['opening_carry_skipped'])
        self.assertEqual(p['expected_total_balance'], '250.00')

    def test_previous_sheet_left_a_balance_and_next_starts_fresh(self):
        a = node('F1', 'S1', [row(4, '2023-01-10', value=500, advance=300)], final='200.00')
        b = node('F1', 'S2', [row(4, '2024-01-10', value=100, advance=50)], final='50.00')
        p = build_plan('X', ENTRY, [a, b], [], None)
        self.assertEqual(p['status'], 'needs_decision'); self.assertTrue(any('εξοφλήθηκε' in d for d in p['needs_decision']))
        # the analyst declares it settled outside the ledger → one −200 adjustment, plan ready, total = 50
        p2 = build_plan('X', ENTRY, [a, b], [], {'settled': [{'file_id': 'F1', 'sheet': 'S1', 'why': 'paid in cash 2023-12'}]})
        self.assertEqual(p2['status'], 'ready', p2['needs_decision'])
        adj = [r for r in p2['batches'][0]['rows'] if r['entry_type'] == 'adjustment']
        self.assertEqual(adj[0]['amount'], -200.0); self.assertEqual(adj[0]['entry_date'], '2023-01-10')
        self.assertEqual(p2['expected_total_balance'], '50.00')

    def test_rt_overlap_matching(self):
        n = node('F1', 'S1', [row(4, '2026-07-01', value=500, advance=300), row(5, '2026-08-15', value=600, advance=300, expenses=20, route='ΓΕΡΜΑΝΙΑ'),
                              row(6, '2026-08-20', 'payment_bank', amount=400), row(7, '2026-08-25', value=230, advance=0, route='ΑΘΗΝΑ')], final='350.00')
        auto = [{'dl_id': 900, 'driver_id': 8, 'entry_date': '2026-08-14', 'date_end': '2026-08-21', 'rt_id': 87, 'rt_code': 'RT-1087', 'trip_value': None, 'advance': None, 'expenses': None, 'note': None},
                {'dl_id': 901, 'driver_id': 8, 'entry_date': '2026-08-30', 'date_end': None, 'rt_id': 88, 'rt_code': 'RT-1088', 'trip_value': None, 'advance': None, 'expenses': None, 'note': None},
                {'dl_id': 950, 'driver_id': 9, 'entry_date': '2026-08-15', 'date_end': None, 'rt_id': 89, 'rt_code': 'RT-1089', 'trip_value': None, 'advance': None, 'expenses': None, 'note': None}]
        p = build_plan('X', ENTRY, [n], auto, None)
        self.assertEqual(p['cutoff'], '2026-08-13')
        self.assertEqual(len(p['patches']), 1); pt = p['patches'][0]
        self.assertEqual(pt['dl_id'], 900); self.assertEqual(pt['trip_value'], 600.0); self.assertEqual(pt['expenses'], 20.0); self.assertIn('ΓΕΡΜΑΝΙΑ', pt['note'])
        self.assertEqual([r['entry_type'] for r in p['batches'][0]['rows']], ['trip', 'payment_bank', 'trip'])   # ΑΘΗΝΑ stays: no auto within 2 days
        self.assertEqual(p['auto_unmatched'], [{'dl_id': 901, 'entry_date': '2026-08-30'}])
        self.assertEqual(p['batches'][0]['expected_final'], '30.00'); self.assertEqual(p['expected_total_balance'], '350.00')
        self.assertEqual(p['status'], 'ready', p['needs_decision'])

    def test_match_override_and_unmatch(self):
        n = node('F1', 'S1', [row(5, '2026-08-15', value=600, advance=300, route='ΓΕΡΜΑΝΙΑ')], final='300.00')
        auto = [{'dl_id': 900, 'driver_id': 8, 'entry_date': '2026-08-14', 'date_end': None, 'rt_id': 87, 'rt_code': 'RT-1087', 'trip_value': None, 'advance': None, 'expenses': None, 'note': None}]
        p = build_plan('X', ENTRY, [n], auto, {'matches': [{'dl_id': 900, 'src': None}]})
        self.assertEqual(p['patches'], []); self.assertEqual(len(p['batches'][0]['rows']), 1)

    def test_unknown_and_inconsistent_go_to_needs_decision(self):
        n = node('F1', 'S1', [row(4, '2024-01-10', value=500, advance=300)], final='200.00', unknown=[{'row': 9, 'reason': 'unrecognised row: ΠΡΟΣΤΙΜΟ', 'cells': {}}], running_consistent=False)
        p = build_plan('X', ENTRY, [n], [], None)
        self.assertEqual(p['status'], 'needs_decision')
        self.assertTrue(any('γρ. 9' in d for d in p['needs_decision'])); self.assertTrue(any('ΠΡΟΟΔΕΥΤΙΚΟ' in d for d in p['needs_decision']))

    def test_duplicate_node_auto_detected_and_decision_role(self):
        a = node('F1', 'S1', [row(4, '2024-01-10', value=500, advance=300), row(5, '2024-02-10', value=100, advance=0)], final='300.00')
        b = node('F1', 'S2', [row(4, '2024-02-10', value=100, advance=0)], final='100.00')
        p = build_plan('X', ENTRY, [a, b], [], None)
        self.assertEqual(next(x for x in p['nodes'] if x['sheet'] == 'S2')['role'], 'duplicate')
        self.assertEqual(p['expected_total_balance'], '300.00')
        p2 = build_plan('X', ENTRY, [a, b], [], {'nodes': [{'file_id': 'F1', 'sheet': 'S2', 'role': 'out_of_scope', 'why': 'test'}]})
        self.assertEqual(next(x for x in p2['nodes'] if x['sheet'] == 'S2')['role'], 'out_of_scope')

    def test_create_driver_and_no_auto(self):
        n = node('F1', 'S1', [row(4, '2026-08-27', value=100, advance=0)], final='100.00')
        entry = {'driver_id': None, 'create': {'Full Name': 'New One', 'Active': True}, 'files': ['F1'], 'crosscheck': []}
        p = build_plan('NEW', entry, [n], [{'dl_id': 1, 'driver_id': 8, 'entry_date': '2026-08-27', 'trip_value': None, 'advance': None, 'expenses': None}], None)
        self.assertIsNone(p['driver_id']); self.assertEqual(p['create_driver']['Full Name'], 'New One'); self.assertIsNone(p['cutoff']); self.assertEqual(p['patches'], [])

    def test_zero_opening_and_zero_carry_are_skipped(self):
        a = node('F1', 'S1', [row(4, '2023-01-10', value=500, advance=500)], final='0.00')
        b = node('F1', 'S2', [row(4, '2024-01-10', 'carry', amount=0.0), row(5, '2024-01-12', value=100, advance=50)], opening_balance='0.00', final='50.00')
        p = build_plan('X', ENTRY, [a, b], [], None)
        self.assertEqual(p['status'], 'ready', p['needs_decision'])
        self.assertEqual([r['entry_type'] for b_ in p['batches'] for r in b_['rows']], ['trip', 'trip'])

    def test_real_opening_plus_zero_carry_is_not_double_counted(self):
        a = node('F1', 'S1', [row(4, '2023-01-10', value=500, advance=300)], final='200.00')
        b = node('F1', 'S2', [row(4, '2024-01-10', value=100, advance=50), row(5, '2024-02-01', 'carry', amount=0.0), row(6, '2024-03-01', value=30, advance=0)],
                 opening_balance='-8.00', final='72.00')          # −8 + 50 + 30 = 72; the −8 is NOT the previous final (200) → emitted as adjustment
        p = build_plan('X', ENTRY, [a, b], [], {'settled': [{'file_id': 'F1', 'sheet': 'S1', 'why': 'paid'}]})
        self.assertEqual(p['status'], 'ready', p['needs_decision'])
        s2 = next(x for x in p['nodes'] if x['sheet'] == 'S2')
        self.assertFalse(s2['opening_carry_skipped'])
        self.assertEqual(p['expected_total_balance'], '72.00')

    def test_carry_row_break_is_not_emitted_twice(self):
        a = node('F1', 'S1', [row(4, '2023-01-10', value=500, advance=300)], final='200.00')
        b = node('F1', 'S2', [row(4, '2024-01-10', 'carry', amount=200.0), row(5, '2024-01-12', value=100, advance=50)],
                 running_breaks=[{'row': 4, 'entry_date': '2024-01-10', 'diff': '200.00'}], final='250.00')
        p = build_plan('X', ENTRY, [a, b], [], None)
        self.assertEqual(p['status'], 'ready', p['needs_decision'])
        self.assertEqual([r['entry_type'] for b_ in p['batches'] for r in b_['rows']], ['trip', 'trip'])
        self.assertEqual(p['expected_total_balance'], '250.00')
        # and when the carry is NOT explained by the previous sheet it is emitted exactly once
        c = node('F1', 'S3', [row(4, '2025-01-10', 'carry', amount=40.0), row(5, '2025-01-12', value=10, advance=0)],
                 running_breaks=[{'row': 4, 'entry_date': '2025-01-10', 'diff': '40.00'}], final='50.00')
        p2 = build_plan('X', ENTRY, [a, b, c], [], None)
        adj_lines = [r for b_ in p2['batches'] for r in b_['rows'] if r['entry_type'] == 'adjustment']
        self.assertEqual([x['amount'] for x in adj_lines], [-250.0, 40.0]) if any('εξόφληση' in x.get('note', '') for x in adj_lines) else self.assertEqual([x['amount'] for x in adj_lines], [40.0])

    def test_extract_sheet_with_leading_carry_is_still_a_duplicate(self):
        a = node('F1', 'S1', [row(4, '2024-01-10', value=500, advance=300), row(5, '2024-02-10', value=100, advance=0)], final='300.00')
        b = node('F1', 'S2', [row(3, '2024-02-01', 'carry', amount=200.0), row(4, '2024-02-10', value=100, advance=0)], final='300.00')
        p = build_plan('X', ENTRY, [a, b], [], None)
        self.assertEqual(next(x for x in p['nodes'] if x['sheet'] == 'S2')['role'], 'duplicate')
        self.assertEqual(p['status'], 'ready', p['needs_decision'])

    def test_rt_match_prefers_matching_span_over_same_start(self):
        rows = [row(97, '2026-08-20', value=50, advance=0, route='ΒΕΡΟΙΑ-ΓΑΛΑΤΑΔΕΣ-ΒΕΡΟΙΑ'),
                row(98, '2026-08-21', value=650, advance=300, expenses=531.2, route='ΒΕΡΟΙΑ-ΟΥΓΓΑΡΙΑ-ΒΟΛΟΣ-ΒΕΡΟΙΑ')]
        rows[0]['entry']['date_end'] = '2026-08-20'; rows[1]['entry']['date_end'] = '2026-08-27'
        n = node('F1', 'S1', rows, final='931.20')
        auto = [{'dl_id': 7, 'driver_id': 8, 'entry_date': '2026-08-20', 'date_end': '2026-08-26', 'rt_id': 10, 'rt_code': 'RT-1010', 'trip_value': None, 'advance': None, 'expenses': None, 'note': None}]
        p = build_plan('X', ENTRY, [n], auto, None)
        self.assertEqual(len(p['patches']), 1)
        self.assertEqual(p['patches'][0]['src']['row'], 98)
        self.assertEqual(p['patches'][0]['trip_value'], 650.0)
        self.assertEqual([r['src']['row'] for r in p['batches'][0]['rows']], [97])

    def test_negative_trip_amount_needs_decision_but_row_still_passes_through(self):
        n = node('F1', 'S1', [row(4, '2024-01-10', value=-50, advance=0)], final='-50.00')
        p = build_plan('X', ENTRY, [n], [], None)
        self.assertEqual(p['status'], 'needs_decision')
        self.assertTrue(any('αρνητικό ποσό σε δρομολόγιο' in d and 'γρ. 4' in d for d in p['needs_decision']))
        self.assertEqual([r['entry_type'] for b_ in p['batches'] for r in b_['rows']], ['trip'])

    def test_text_amount_row_needs_decision(self):
        n = node('F1', 'S1', [row(4, '2024-01-10', value=500, advance=300)], final='200.00',
                  text_amount_rows=[{'row': 6, 'field': 'expenses', 'text': '?'}])
        p = build_plan('X', ENTRY, [n], [], None)
        self.assertEqual(p['status'], 'needs_decision')
        self.assertTrue(any('ποσό ως κείμενο' in d and 'γρ. 6' in d and 'expenses' in d for d in p['needs_decision']))

    def test_file_hash_recorded_on_batch_and_none_when_missing(self):
        n = node('F1', 'S1', [row(4, '2024-01-10', value=500, advance=300)], final='200.00')
        p = build_plan('X', ENTRY, [n], [], None, {'F1': 'abc123'})
        self.assertEqual(p['batches'][0]['file_hash'], 'abc123')
        p2 = build_plan('X', ENTRY, [n], [], None, {})
        self.assertIsNone(p2['batches'][0]['file_hash'])

    def test_opening_and_first_carry_are_one_event(self):
        a = node('F1', 'S1', [row(4, '2023-01-10', value=500, advance=300)], final='200.00')
        b = node('F1', 'S2', [row(4, '2024-01-10', 'carry', amount=200.0), row(5, '2024-01-12', value=100, advance=50)], opening_balance='200.00', final='250.00')
        p = build_plan('X', ENTRY, [a, b], [], None)
        self.assertEqual(p['status'], 'ready', p['needs_decision'])
        self.assertEqual([r['entry_type'] for b_ in p['batches'] for r in b_['rows']], ['trip', 'trip'])
        self.assertEqual(p['expected_total_balance'], '250.00')

if __name__ == '__main__':
    unittest.main()
