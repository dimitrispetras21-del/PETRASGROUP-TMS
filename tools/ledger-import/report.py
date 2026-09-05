#!/usr/bin/env python3
"""Two views of the same run. The owner view has names next to balances and
lives only in work/. The public view has counts and categories and is the only
thing that goes into docs/ — the repo is public."""
import glob, json, os, collections

HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.join(HERE, 'work')

def load_dir(sub):
    return {json.load(open(p, encoding='utf-8'))['driver_key']: json.load(open(p, encoding='utf-8'))
            for p in glob.glob(os.path.join(WORK, sub, '*.json'))}

def build(plans, reviews, mapping, nodes, auto):
    owner, pub = [], []
    owner.append('# Εισαγωγή καρτελών — dry run\n')
    owner.append('| Οδηγός | id | Κατάσταση | Review | Γραμμές | Δρομ. | Πληρ. | PATCH RT | Υπόλοιπο | Εκτός | Σημειώσεις |')
    owner.append('|---|---|---|---|---|---|---|---|---|---|---|')
    kinds = collections.Counter(); status = collections.Counter(); decisions = collections.Counter()
    unknown_desc = collections.Counter(); matches = []; creates = []
    for key in sorted(plans):
        p = plans[key]; r = reviews.get(key, {}); rows = [x for b in p['batches'] for x in b['rows']]
        c = collections.Counter(x['entry_type'] for x in rows); kinds.update(c)
        status[(p['status'], r.get('verdict', '—'))] += 1
        outs = sum(1 for n in p['nodes'] if n['role'] != 'chain')
        notes = []
        if p.get('create_driver'): notes.append('ΝΕΟΣ ΟΔΗΓΟΣ'); creates.append((key, p['create_driver']))
        if p.get('date_fixes'): notes.append('%d διορθ. έτους' % len(p['date_fixes']))
        if p.get('auto_unmatched'): notes.append('%d auto χωρίς Excel' % len(p['auto_unmatched']))
        for d in p.get('needs_decision', []): decisions[d.split(':')[0]] += 1
        owner.append('| %s | %s | %s | %s | %d | %d | %d | %d | %s | %d | %s |' % (
            key, p.get('driver_id') or '—', p['status'], r.get('verdict', '—'), len(rows), c['trip'],
            c['payment_cash'] + c['payment_bank'], len(p['patches']), p['expected_total_balance'], outs, ', '.join(notes)))
        for m in p['patches']: matches.append((key, m['dl_id'], m.get('note', ''), m.get('trip_value'), m.get('advance'), m.get('expenses')))
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
    pub.append('# Εισαγωγή ιστορικού μισθοδοσίας — συγκεντρωτικά\n')
    pub.append('- Οδηγοί με σχέδιο: %d · έτοιμα/ok: %d · θέλουν απόφαση: %d' % (len(plans), status[('ready', 'ok')], sum(v for k, v in status.items() if k[0] == 'needs_decision')))
    pub.append('- Γραμμές προς εισαγωγή: %d (δρομολόγια %d, μετρητά %d, κατάθεση %d, προσαρμογές %d)' % (sum(kinds.values()), kinds['trip'], kinds['payment_cash'], kinds['payment_bank'], kinds['adjustment']))
    pub.append('- PATCH σε auto γραμμές RT: %d · auto χωρίς αντίστοιχο Excel: %d' % (len(matches), sum(len(p.get('auto_unmatched', [])) for p in plans.values())))
    pub.append('- Νέοι οδηγοί: %d · κόμβοι εκτός (duplicate/out_of_scope): %d' % (len(creates), sum(1 for p in plans.values() for n in p['nodes'] if n['role'] != 'chain')))
    pub.append('- Κατηγορίες «θέλει απόφαση»: ' + ', '.join('%s (%d)' % kv for kv in decisions.most_common()))
    return '\n'.join(owner) + '\n', '\n'.join(pub) + '\n'

def main():
    plans = load_dir('plans'); reviews = load_dir('reviews')
    m = json.load(open(os.path.join(WORK, 'map.json'), encoding='utf-8'))
    nodes = json.load(open(os.path.join(WORK, 'inventory.json'), encoding='utf-8'))['nodes']
    auto = json.load(open(os.path.join(WORK, 'auto_rows.json'), encoding='utf-8'))
    o, p = build(plans, reviews, m, nodes, auto)
    open(os.path.join(WORK, 'report.md'), 'w', encoding='utf-8').write(o)
    open(os.path.join(WORK, 'report-public.md'), 'w', encoding='utf-8').write(p)
    print(p)

if __name__ == '__main__':
    main()
