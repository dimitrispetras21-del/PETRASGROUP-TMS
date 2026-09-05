#!/usr/bin/env python3
"""The only file that writes. Dry run by default. Sequential per driver:
ensure driver → import each batch → PATCH matched auto rows → GET proof.
A mismatch stops the whole run (nothing after it is attempted) and prints the
batch ids so the owner can decide on dl_cancel_batch."""
import argparse, datetime as dt, glob, hashlib, json, os, sys, urllib.error, urllib.request
from decimal import Decimal
from rules import d2

HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.join(HERE, 'work')
PROXY = 'https://petras-tms-backend-staging.petrasgroup.workers.dev'
DRIVERS_PATH = '/v0/appElT5CQV6JQvym8/tbl7UGmYhc2Y82pPs'

class ApiError(Exception):
    def __init__(self, status, text): super().__init__('HTTP %s: %s' % (status, text[:300])); self.status = status
class Mismatch(Exception): pass

class Api:
    def __init__(self, token, log): self.token, self.log = token, log
    def _req(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(PROXY + path, data=data, method=method,
                                     headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + self.token})
        self.log.write('%s %s %s\n' % (dt.datetime.now().isoformat(timespec='seconds'), method, path))   # never the token, never the body
        try:
            with urllib.request.urlopen(req, timeout=60) as res: return json.load(res)
        except urllib.error.HTTPError as e: raise ApiError(e.code, e.read().decode(errors='replace'))
    def post(self, path, body): return self._req('POST', path, body)
    def patch(self, path, body): return self._req('PATCH', path, body)
    def get(self, path): return self._req('GET', path)

def read_token():
    for line in open(os.path.join(HERE, '..', '..', '.env.local'), encoding='utf-8'):
        if line.startswith('TMS_JWT='): return line.split('=', 1)[1].strip().strip('"')
    sys.exit('✗ TMS_JWT missing from .env.local (owner token, 8h) — the owner pastes it, agents never see it')

def ensure_driver(api, plan, state):
    key = plan['driver_key']; st = state.setdefault(key, {})
    if st.get('driver_id'): return st['driver_id']
    if plan.get('driver_id'): st['driver_id'] = plan['driver_id']; return st['driver_id']
    fields = {k: v for k, v in plan['create_driver'].items() if v not in (None, '')}
    rec = api.post(DRIVERS_PATH, {'fields': fields})
    legacy = rec['id']
    # the facade answers with legacy_id only; the numeric id lives in /costs/lookups
    drivers = api.get('/costs/lookups')['drivers']
    match = [d for d in drivers if d.get('legacy_id') == legacy]
    if len(match) != 1: raise Mismatch('created driver %s not found in lookups by legacy_id %s' % (fields, legacy))
    st['driver_id'] = match[0]['id']; st['created_legacy_id'] = legacy
    return st['driver_id']

def clean_rows(rows):
    return [{k: v for k, v in r.items() if k != 'src' and v is not None} for r in rows]

def import_batch(api, driver_id, batch, file_hash):
    body = {'driver_id': driver_id, 'file_name': batch['file_name'], 'file_hash': file_hash, 'rows': clean_rows(batch['rows'])}
    out = api.post('/costs/ledger/import', body)
    if d2(out['balance']) != d2(batch['expected_final']):
        raise Mismatch('batch %s server balance %s ≠ expected %s' % (out['batch'], out['balance'], batch['expected_final']))
    return out

def apply_patches(api, driver_id, patches, auto_rows, state, key):
    auto = {a['dl_id']: a for a in auto_rows}
    done = state[key].setdefault('patched', [])
    for p in patches:
        if p['dl_id'] in done: continue
        a = auto.get(p['dl_id'])
        if a is None or a['driver_id'] != driver_id: raise Mismatch('patch %s: not an auto row of driver %s' % (p['dl_id'], driver_id))
        body = {k: p[k] for k in ('trip_value', 'advance', 'expenses', 'note') if k in p and p[k] is not None}
        for f in ('trip_value', 'advance', 'expenses'):
            if f in body and a.get(f) is not None: raise Mismatch('patch %s: %s already written on the auto row' % (p['dl_id'], f))
        api.patch('/costs/ledger/%d' % p['dl_id'], body)
        done.append(p['dl_id'])

def proof(api, driver_id):
    recs = api.get('/costs/ledger/%d' % driver_id)['records']
    return str(d2(recs[0]['running_balance'])) if recs else '0.00'

def file_sha(file_id, index):
    local = next(i['local'] for i in index if i['id'] == file_id)
    return hashlib.sha256(open(local, 'rb').read()).hexdigest()

def run(plans, reviews, auto_rows, index, api, state, commit):
    for key in sorted(plans):
        plan = plans[key]
        if plan['status'] != 'ready' or reviews.get(key, {}).get('verdict') != 'ok':
            print('skip %s (%s / %s)' % (key, plan['status'], reviews.get(key, {}).get('verdict'))); continue
        if state.get(key, {}).get('done'): print('done already %s' % key); continue
        print('%s %s: %d batches, %d patches, expect %s' % ('COMMIT' if commit else 'dry', key, len(plan['batches']), len(plan['patches']), plan['expected_total_balance']))
        if not commit: continue
        driver_id = ensure_driver(api, plan, state)
        st = state[key]; st.setdefault('batches', {})
        for b in plan['batches']:
            if b['file_id'] in st['batches']: continue
            out = import_batch(api, driver_id, b, file_sha(b['file_id'], index))
            st['batches'][b['file_id']] = out['batch']; save(state)
        apply_patches(api, driver_id, plan['patches'], auto_rows, state, key); save(state)
        got = proof(api, driver_id)
        if d2(got) != d2(plan['expected_total_balance']):
            st['proof'] = {'got': got, 'expected': plan['expected_total_balance']}; save(state)
            raise Mismatch('%s: ledger balance %s ≠ expected %s — batches %s' % (key, got, plan['expected_total_balance'], st['batches']))
        st['proof'] = {'got': got, 'expected': plan['expected_total_balance']}; st['done'] = True; save(state)
        print('  ✓ %s balance %s' % (key, got))

def save(state):
    json.dump(state, open(os.path.join(WORK, 'state.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--commit', action='store_true'); ap.add_argument('--only', nargs='*')
    a = ap.parse_args()
    load = lambda sub: {json.load(open(p, encoding='utf-8'))['driver_key']: json.load(open(p, encoding='utf-8')) for p in glob.glob(os.path.join(WORK, sub, '*.json'))}
    plans, reviews = load('plans'), load('reviews')
    if a.only: plans = {k: v for k, v in plans.items() if k in a.only}
    auto = json.load(open(os.path.join(WORK, 'auto_rows.json'), encoding='utf-8'))
    index = json.load(open(os.path.join(WORK, 'drive-index.json'), encoding='utf-8'))
    sp = os.path.join(WORK, 'state.json'); state = json.load(open(sp, encoding='utf-8')) if os.path.exists(sp) else {}
    os.makedirs(os.path.join(WORK, 'logs'), exist_ok=True)
    log = open(os.path.join(WORK, 'logs', 'commit-%s.log' % dt.datetime.now().strftime('%Y%m%d-%H%M%S')), 'a', encoding='utf-8')
    api = Api(read_token(), log) if a.commit else None
    try:
        run(plans, reviews, auto, index, api, state, a.commit)
    except (Mismatch, ApiError) as e:
        print('✗ STOP: %s' % e); sys.exit(2)

if __name__ == '__main__':
    main()
