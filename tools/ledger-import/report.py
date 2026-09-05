#!/usr/bin/env python3
"""Two views of the same run. The owner view has names next to balances and
lives only in work/. The public view has counts and categories and is the only
thing that goes into docs/ — the repo is public."""
import glob, json, os, collections

HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.join(HERE, 'work')

CATEGORIES = [                       # order matters: first match wins
    ('επικαλύπτονται', 'επικάλυψη φύλλων'),
    ('εξοφλήθηκε', 'υπόλοιπο προηγούμενου φύλλου'),
    ('ΠΡΟΟΔΕΥΤΙΚΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ ≠ γραμμές'),
    ('άθροισμα γραμμών', 'ΠΡΟΟΔΕΥΤΙΚΟ ≠ γραμμές'),
    ('expected_final', 'ΠΡΟΟΔΕΥΤΙΚΟ ≠ γραμμές'),
    ('unrecognised', 'άγνωστη γραμμή'),
    ('payment keyword', 'άγνωστη γραμμή'),
    ('advance and expenses', 'άγνωστη γραμμή'),
    ('κανένα φύλλο', 'χωρίς φύλλο καρτέλας'),
    ('date', 'ημερομηνία'), ('ημ/ν', 'ημερομηνία'), ('ημερομην', 'ημερομηνία'), ('spike', 'ημερομηνία'),
    ('υπόλοιπο έναρξης', 'υπόλοιπο έναρξης φύλλου'), ('μεταφορά υπολοίπου', 'υπόλοιπο έναρξης φύλλου'),
]

def categorize(text):
    t = text.lower()
    for key, cat in CATEGORIES:
        if key.lower() in t: return cat
    return 'άλλο'

def load_dir(sub):
    return {json.load(open(p, encoding='utf-8'))['driver_key']: json.load(open(p, encoding='utf-8'))
            for p in glob.glob(os.path.join(WORK, sub, '*.json'))}

def build(plans, reviews, mapping, nodes, auto, skipped_sheets=None, drivers=None):
    skipped_sheets = skipped_sheets or []; drivers = drivers or []
    nbk = {(n['file_id'], n['sheet']): n for n in nodes}
    owner, pub = [], []
    owner.append('# Εισαγωγή καρτελών — dry run\n')
    owner.append('| Οδηγός | id | Κατάσταση | Review | Γραμμές | Δρομ. | Πληρ. | PATCH RT | Υπόλοιπο | Εκτός | Σημειώσεις |')
    owner.append('|---|---|---|---|---|---|---|---|---|---|---|')
    kinds = collections.Counter(); status = collections.Counter(); decisions = collections.Counter()
    unknown_desc = collections.Counter(); matches = []; creates = []
    after_totals_notes = []; text_amounts = []; warnings = []; crosscheck_lines = []
    for key in sorted(plans):
        p = plans[key]; r = reviews.get(key, {}); rows = [x for b in p['batches'] for x in b['rows']]
        c = collections.Counter(x['entry_type'] for x in rows); kinds.update(c)
        status[(p['status'], r.get('verdict', '—'))] += 1
        outs = sum(1 for n in p['nodes'] if n['role'] != 'chain')
        notes = []
        if p.get('create_driver'): notes.append('ΝΕΟΣ ΟΔΗΓΟΣ'); creates.append((key, p['create_driver']))
        if p.get('date_fixes'): notes.append('%d διορθ. έτους' % len(p['date_fixes']))
        if p.get('auto_unmatched'): notes.append('%d auto χωρίς Excel' % len(p['auto_unmatched']))
        for d in p.get('needs_decision', []): decisions[categorize(d)] += 1
        owner.append('| %s | %s | %s | %s | %d | %d | %d | %d | %s | %d | %s |' % (
            key, p.get('driver_id') or '—', p['status'], r.get('verdict', '—'), len(rows), c['trip'],
            c['payment_cash'] + c['payment_bank'], len(p['patches']), p['expected_total_balance'], outs, ', '.join(notes)))
        for m in p['patches']: matches.append((key, m['dl_id'], m.get('note', ''), m.get('trip_value'), m.get('advance'), m.get('expenses')))
        # B5 — sections built from data the code already has, not re-derived by hand
        for pn in p.get('nodes', []):
            n = nbk.get((pn['file_id'], pn['sheet']))
            if n is None: continue
            for m in n.get('after_totals', []): after_totals_notes.append((key, n['sheet'], m['row'], m['label'], m['amount']))
            for t in n.get('text_amount_rows', []): text_amounts.append((key, n['sheet'], t['row'], t['field'], t['text']))
        for w in p.get('warnings', []): warnings.append((key, w))
        for file_id, missing in p.get('crosscheck', {}).items():
            if missing: crosscheck_lines.append((key, file_id, missing))
    for n in nodes:
        for u in n['unknown']: unknown_desc[str(u['cells'].get('route'))[:40]] += 1
    owner.append('\n## Ταιριάσματα Excel → auto RT (PATCH)\n')
    owner.append('| Οδηγός | dl_id | Excel | Αξία | Έλαβε | Έξοδα |\n|---|---|---|---|---|---|')
    owner += ['| %s | %s | %s | %s | %s | %s |' % m for m in matches]
    owner.append('\n## Νέοι οδηγοί που θα δημιουργηθούν\n')
    owner += ['- %s → %s' % (k, json.dumps(c, ensure_ascii=False)) for k, c in creates]
    owner.append('\n## Θέλει απόφαση\n')
    for key in sorted(plans):
        for d in plans[key].get('needs_decision', []): owner.append('- **%s**: %s' % (key, d))
    owner.append('\n## Άγνωστες περιγραφές γραμμών (όλοι οι οδηγοί)\n')
    owner += ['- %s × %d' % (k, v) for k, v in unknown_desc.most_common()]
    owner.append('\n## Φύλλα που δεν διαβάστηκαν\n')                          # B1
    owner.append('| Αρχείο | Φύλλο | Μη κενά κελιά | Πεδία που ταιριάζουν |\n|---|---|---|---|')
    owner += ['| %s | %s | %d | %s |' % (s['file_name'], s['sheet'], s['non_empty_cells'], ', '.join(s['matched_fields']) or '—') for s in skipped_sheets]
    owner.append('\n## Σημειώσεις κάτω από ΣΥΝΟΛΟ\n')
    owner.append('| Οδηγός | Φύλλο | Γρ. | Περιγραφή | Ποσό |\n|---|---|---|---|---|')
    owner += ['| %s | %s | %d | %s | %s |' % (key, sheet, row, label, amount) for key, sheet, row, label, amount in after_totals_notes]
    owner.append('\n## Ποσά ως κείμενο\n')
    owner.append('| Οδηγός | Φύλλο | Γρ. | Στήλη | Κείμενο |\n|---|---|---|---|---|')
    owner += ['| %s | %s | %d | %s | %s |' % (key, sheet, row, field, text) for key, sheet, row, field, text in text_amounts]
    owner.append('\n## Προειδοποιήσεις σχεδίων\n')
    owner += ['- **%s**: %s' % (key, w) for key, w in warnings]
    owner.append('\n## Γραμμές αντιγράφων που λείπουν από το κανονικό\n')
    owner += ['- **%s**: αρχείο %s, %d γραμμ. δεν βρέθηκαν στην κύρια καρτέλα' % (key, file_id, missing) for key, file_id, missing in crosscheck_lines]
    rep = mapping.get('_report', {}) if isinstance(mapping, dict) else {}
    owner.append('\n## Από το map\n')
    owner.append('- Διπλά driver_id: ' + (', '.join(str(x) for x in rep.get('duplicate_driver_ids', [])) or '—'))
    owner.append('- Αρχεία χωρίς αντιστοίχιση: ' + (', '.join('%s (%s)' % (k, v) for k, v in rep.get('unmapped_files', {}).items()) or '—'))
    owner.append('- Οδηγοί στη βάση χωρίς αρχείο καρτέλας: ' + (', '.join(str(x) for x in rep.get('drivers_in_db_without_ledger_file', [])) or '—'))
    owner.append('- active=true στη βάση αλλά αρχείο σε ΣΤΑΜΑΤΗΣΑΝ: ' + (', '.join(str(x) for x in rep.get('db_active_true_but_file_in_stopped_folder', [])) or '—'))
    owner.append('\n## Νέοι οδηγοί δίπλα στους υπάρχοντες\n')
    owner.append('| Νέος | Υπάρχων |\n|---|---|')
    create_names = [c.get('Full Name', k) for k, c in creates]; existing_names = sorted(d[1] for d in drivers)
    for i in range(max(len(create_names), len(existing_names))):
        owner.append('| %s | %s |' % (create_names[i] if i < len(create_names) else '', existing_names[i] if i < len(existing_names) else ''))
    pub.append('# Εισαγωγή ιστορικού μισθοδοσίας — συγκεντρωτικά\n')
    pub.append('- Οδηγοί με σχέδιο: %d · έτοιμα/ok: %d · θέλουν απόφαση: %d' % (len(plans), status[('ready', 'ok')], sum(v for k, v in status.items() if k[0] == 'needs_decision')))
    pub.append('- Γραμμές προς εισαγωγή: %d (δρομολόγια %d, μετρητά %d, κατάθεση %d, προσαρμογές %d)' % (sum(kinds.values()), kinds['trip'], kinds['payment_cash'], kinds['payment_bank'], kinds['adjustment']))
    pub.append('- PATCH σε auto γραμμές RT: %d · auto χωρίς αντίστοιχο Excel: %d' % (len(matches), sum(len(p.get('auto_unmatched', [])) for p in plans.values())))
    pub.append('- Νέοι οδηγοί: %d · κόμβοι εκτός (duplicate/out_of_scope): %d' % (len(creates), sum(1 for p in plans.values() for n in p['nodes'] if n['role'] != 'chain')))
    pub.append('- Κατηγορίες «θέλει απόφαση»: ' + ', '.join('%s (%d)' % kv for kv in decisions.most_common()))
    # B5/B1 — public summary gets counts only, never names/sheets/amounts
    pub.append('- Φύλλα που δεν διαβάστηκαν: %d (μη κενά κελιά %d)' % (len(skipped_sheets), sum(s['non_empty_cells'] for s in skipped_sheets)))
    pub.append('- Σημειώσεις κάτω από ΣΥΝΟΛΟ: %d · ποσά ως κείμενο: %d · προειδοποιήσεις σχεδίων: %d · γραμμές αντιγράφων που λείπουν: %d'
                % (len(after_totals_notes), len(text_amounts), len(warnings), len(crosscheck_lines)))
    pub.append('- Από το map: %d διπλά id, %d αρχεία χωρίς αντιστοίχιση, %d οδηγοί χωρίς αρχείο, %d ασυμφωνίες active/ΣΤΑΜΑΤΗΣΑΝ'
                % (len(rep.get('duplicate_driver_ids', [])), len(rep.get('unmapped_files', {})), len(rep.get('drivers_in_db_without_ledger_file', [])), len(rep.get('db_active_true_but_file_in_stopped_folder', []))))
    return '\n'.join(owner) + '\n', '\n'.join(pub) + '\n'

def main():
    plans = load_dir('plans'); reviews = load_dir('reviews')
    m = json.load(open(os.path.join(WORK, 'map.json'), encoding='utf-8'))
    inv = json.load(open(os.path.join(WORK, 'inventory.json'), encoding='utf-8'))
    nodes = inv['nodes']; skipped_sheets = inv.get('skipped_sheets', [])
    auto = json.load(open(os.path.join(WORK, 'auto_rows.json'), encoding='utf-8'))
    dp = os.path.join(WORK, 'drivers.json')
    drivers = json.load(open(dp, encoding='utf-8')) if os.path.exists(dp) else []
    o, p = build(plans, reviews, m, nodes, auto, skipped_sheets, drivers)
    open(os.path.join(WORK, 'report.md'), 'w', encoding='utf-8').write(o)
    open(os.path.join(WORK, 'report-public.md'), 'w', encoding='utf-8').write(p)
    print(p)

if __name__ == '__main__':
    main()
