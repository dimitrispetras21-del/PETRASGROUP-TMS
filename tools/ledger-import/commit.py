#!/usr/bin/env python3
"""The only file that writes. Dry run by default. Sequential per driver:
ensure driver → import each batch → PATCH matched auto rows → GET proof.
A mismatch stops the whole run (nothing after it is attempted) and prints the
batch ids so the owner can decide on dl_cancel_batch."""
import argparse, datetime as dt, glob, hashlib, json, os, sys, urllib.error, urllib.request
from decimal import Decimal
from rules import d2
from verify_plan import verify

HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.join(HERE, 'work')
PROXY = 'https://petras-tms-backend-staging.petrasgroup.workers.dev'
DRIVERS_PATH = '/v0/appElT5CQV6JQvym8/tbl7UGmYhc2Y82pPs'
RECONCILE_HINT = 'select * from dl_import_batches order by created_at desc limit 5;'

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
            with urllib.request.urlopen(req, timeout=180) as res: return json.load(res)
        except urllib.error.HTTPError as e: raise ApiError(e.code, e.read().decode(errors='replace'))
        except urllib.error.URLError as e: raise ApiError(0, 'network: %s' % e.reason)
    def post(self, path, body): return self._req('POST', path, body)
    def patch(self, path, body): return self._req('PATCH', path, body)
    def get(self, path): return self._req('GET', path)

def read_token():
    for line in open(os.path.join(HERE, '..', '..', '.env.local'), encoding='utf-8'):
        if line.startswith('TMS_JWT='): return line.split('=', 1)[1].strip().strip('"')
    sys.exit('✗ TMS_JWT missing from .env.local (owner token, 8h) — the owner pastes it, agents never see it')

def ensure_driver(api, plan, state, save=None):
    key = plan['driver_key']; st = state.setdefault(key, {})
    if st.get('driver_id'): return st['driver_id']
    if plan.get('driver_id'):
        st['driver_id'] = plan['driver_id']
        if save: save(state)
        return st['driver_id']
    legacy = st.get('created_legacy_id')
    if legacy is None:
        fields = {k: v for k, v in plan['create_driver'].items() if v not in (None, '')}
        rec = api.post(DRIVERS_PATH, {'fields': fields})
        legacy = rec['id']
        st['created_legacy_id'] = legacy
        # B3: persist the moment the POST returns, before the lookup below — if the
        # process dies here, a rerun must resolve this legacy_id instead of POSTing again
        if save: save(state)
    # the facade answers with legacy_id only; the numeric id lives in /costs/lookups
    drivers = api.get('/costs/lookups')['drivers']
    match = [d for d in drivers if d.get('legacy_id') == legacy]
    if len(match) != 1: raise Mismatch('created driver (legacy_id %s) not found in lookups' % legacy)
    st['driver_id'] = match[0]['id']
    if save: save(state)
    return st['driver_id']

def clean_rows(rows):
    # Strip 'src' (parser metadata) and 'rt_id' (defense in depth; verify_plan and Worker both refuse rt_id)
    return [{k: v for k, v in r.items() if k not in ('src', 'rt_id') and v is not None} for r in rows]

def import_batch(api, driver_id, batch, file_hash):
    # I3 — the plan recorded the workbook's hash when it was built and reviewed;
    # if the file on disk has since changed, the reviewed rows no longer match it.
    if batch.get('file_hash') and batch['file_hash'] != file_hash:
        raise Mismatch('%s: workbook changed since the plan was built — rebuild and re-review' % batch['file_name'])
    body = {'driver_id': driver_id, 'file_name': batch['file_name'], 'file_hash': file_hash, 'rows': clean_rows(batch['rows'])}
    try:
        out = api.post('/costs/ledger/import', body)
    except ApiError as e:
        if e.status == 409:
            raise Mismatch('file %s already imported (409) but not in state.json — reconcile by hand: select * from dl_import_batches where file_hash = %r' % (batch['file_name'], file_hash))
        raise
    if d2(out['balance']) != d2(batch['expected_final']):
        raise Mismatch('batch %s server balance %s ≠ expected %s' % (out['batch'], out['balance'], batch['expected_final']))
    return out

def patch_body(p, a):
    body = {k: p[k] for k in ('trip_value', 'advance', 'expenses', 'note') if k in p and p[k] is not None}
    for f in ('trip_value', 'advance', 'expenses'):
        if f in body and a.get(f) is not None: raise Mismatch('patch %s: %s already written on the auto row' % (p['dl_id'], f))
    # Preserve existing notes: concatenate with ' · ' separator
    if a.get('note') and 'note' in body:
        body['note'] = a['note'] + ' · ' + body['note']
    return body

def apply_patches(api, driver_id, patches, auto_rows, state, key, save=None):
    auto = {a['dl_id']: a for a in auto_rows}
    done = state[key].setdefault('patched', [])
    for p in patches:
        if p['dl_id'] in done: continue
        a = auto.get(p['dl_id'])
        if a is None or a['driver_id'] != driver_id: raise Mismatch('patch %s: not an auto row of driver %s' % (p['dl_id'], driver_id))
        body = patch_body(p, a)
        api.patch('/costs/ledger/%d' % p['dl_id'], body)
        done.append(p['dl_id'])
        if save: save(state)   # I4 — a crash mid-batch of patches must not repeat an already-applied one

def proof(api, driver_id):
    recs = api.get('/costs/ledger/%d' % driver_id)['records']
    return str(d2(recs[0]['running_balance'])) if recs else '0.00'

def file_sha(file_id, index):
    local = next(i['local'] for i in index if i['id'] == file_id)
    return hashlib.sha256(open(local, 'rb').read()).hexdigest()

def dry_run_bodies(plan, auto_rows):
    # I2 — build exactly the bodies the live commit would send, and run the same
    # per-patch checks apply_patches would run, without any network call.
    auto = {a['dl_id']: a for a in auto_rows}
    batch_bodies = [clean_rows(b['rows']) for b in plan['batches']]
    patch_bodies = []
    for p in plan['patches']:
        a = auto.get(p['dl_id'])
        if a is None: raise Mismatch('patch %s: not an auto row' % p['dl_id'])
        if plan.get('driver_id') and a['driver_id'] != plan['driver_id']:
            raise Mismatch('patch %s: not an auto row of driver %s' % (p['dl_id'], plan['driver_id']))
        patch_bodies.append(patch_body(p, a))
    return batch_bodies, patch_bodies

def run(plans, reviews, auto_rows, index, inventory_nodes, mapping, api, state, commit):
    for key in sorted(plans):
        plan = plans[key]; review = reviews.get(key, {})
        if plan['status'] != 'ready' or review.get('verdict') != 'ok':
            print('skip %s (%s / %s)' % (key, plan['status'], review.get('verdict'))); continue
        if state.get(key, {}).get('done'): print('done already %s' % key); continue
        # B2 — re-verify the plan's own arithmetic/identity invariants, and bind the
        # review to these exact bytes: a review of a plan file that has since
        # changed on disk is not a review of what we are about to write.
        errs = verify(plan, inventory_nodes, auto_rows, mapping.get(key))
        if errs: raise Mismatch('%s: verify_plan rejected: %s' % (key, '; '.join(errs)))
        plan_sha256 = hashlib.sha256(open(os.path.join(WORK, 'plans', key + '.json'), 'rb').read()).hexdigest()
        if review.get('plan_sha256') != plan_sha256:
            raise Mismatch('%s: plan changed since review (reviewed %s ≠ current %s)' % (key, review.get('plan_sha256'), plan_sha256))
        print('%s %s: %d batches, %d patches, expect %s' % ('COMMIT' if commit else 'dry', key, len(plan['batches']), len(plan['patches']), plan['expected_total_balance']))
        if not commit:
            batch_bodies, patch_bodies = dry_run_bodies(plan, auto_rows)
            print('  dry-run built %d batch(es) / %d rows, %d patch(es)' % (len(batch_bodies), sum(len(b) for b in batch_bodies), len(patch_bodies)))
            continue
        driver_id = ensure_driver(api, plan, state, save=save)
        st = state[key]; st.setdefault('batches', {})
        # I1 — proof is a delta: capture the balance before this import so the
        # final check is "did the balance move by exactly what the plan says",
        # not "is the absolute balance some number" (which a reused driver's
        # pre-existing entries would make meaningless).
        if 'before' not in st:
            st['before'] = '0.00' if not plan.get('driver_id') else proof(api, driver_id)
            save(state)
        for b in plan['batches']:
            if b['file_id'] in st['batches']: continue
            out = import_batch(api, driver_id, b, file_sha(b['file_id'], index))
            st['batches'][b['file_id']] = out['batch']; save(state)
            print('  import %s → batch %s' % (b['file_id'], out['batch']))
        apply_patches(api, driver_id, plan['patches'], auto_rows, state, key, save=save)
        got = proof(api, driver_id)
        moved = d2(got) - d2(st['before'])
        if moved != d2(plan['expected_total_balance']):
            st['proof'] = {'before': st['before'], 'got': got, 'delta': str(moved), 'expected': plan['expected_total_balance']}; save(state)
            raise Mismatch('%s: ledger moved %s ≠ expected %s (before %s, now %s) — batches %s' % (key, moved, plan['expected_total_balance'], st['before'], got, st['batches']))
        st['proof'] = {'before': st['before'], 'got': got, 'delta': str(moved), 'expected': plan['expected_total_balance']}; st['done'] = True; save(state)
        print('  ✓ %s balance %s (Δ %s)' % (key, got, moved))

def save(state, path=None):
    # Atomic write: write to .tmp then rename to avoid partial state if interrupted
    if path is None:
        path = os.path.join(WORK, 'state.json')
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)

def select_plans(plans, only):
    # B4 — a typo'd --only key must never silently mean "run everything else"
    if not only: return plans
    unknown = set(only) - set(plans)
    if unknown: sys.exit('✗ unknown driver key(s): %s' % ', '.join(sorted(unknown)))
    return {k: v for k, v in plans.items() if k in only}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--commit', action='store_true'); ap.add_argument('--only', nargs='+')
    a = ap.parse_args()
    load = lambda sub: {json.load(open(p, encoding='utf-8'))['driver_key']: json.load(open(p, encoding='utf-8')) for p in glob.glob(os.path.join(WORK, sub, '*.json'))}
    plans, reviews = load('plans'), load('reviews')
    plans = select_plans(plans, a.only)
    auto = json.load(open(os.path.join(WORK, 'auto_rows.json'), encoding='utf-8'))
    index = json.load(open(os.path.join(WORK, 'drive-index.json'), encoding='utf-8'))
    inventory_nodes = json.load(open(os.path.join(WORK, 'inventory.json'), encoding='utf-8'))['nodes']
    mapping = json.load(open(os.path.join(WORK, 'map.json'), encoding='utf-8'))
    sp = os.path.join(WORK, 'state.json'); state = json.load(open(sp, encoding='utf-8')) if os.path.exists(sp) else {}
    os.makedirs(os.path.join(WORK, 'logs'), exist_ok=True)
    log = open(os.path.join(WORK, 'logs', 'commit-%s.log' % dt.datetime.now().strftime('%Y%m%d-%H%M%S')), 'a', encoding='utf-8')
    api = Api(read_token(), log) if a.commit else None
    try:
        run(plans, reviews, auto, index, inventory_nodes, mapping, api, state, a.commit)
    except (Mismatch, ApiError) as e:
        print('✗ STOP: %s\n  reconcile: %s' % (e, RECONCILE_HINT)); sys.exit(2)

if __name__ == '__main__':
    main()
