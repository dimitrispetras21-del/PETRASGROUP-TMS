#!/usr/bin/env python3
"""
Migration: Unified Status System
Run once: python3 scripts/migrate_status_cleanup.py

Steps:
  1. Add new RAMP Status options ('Planned','Done') via Metadata API
  2. Migrate RAMP records: Greek statuses -> Planned/Done
  3. Migrate ORDERS: Status='Loaded' -> 'In Transit'
     Sync Ops Status into Status where Ops Status is more advanced

IDEMPOTENT: safe to re-run.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
import urllib.error

AT_TOKEN = os.environ.get(
    'AT_TOKEN',
    'patpPJXnFYnxdgoK3.a2162b09fbb214628114ff2ce68bb5a7b30aea2061b14f9562a1ab222585cf08'
)
AT_BASE = 'appElT5CQV6JQvym8'

T_ORDERS = 'tblgHlNmLBH3JTdIM'
T_RAMP = 'tblT8W5WcuToBQNiY'

HEADERS = {
    'Authorization': f'Bearer {AT_TOKEN}',
    'Content-Type': 'application/json',
}

RAMP_STATUS_MAP = {
    'Προγραμματισμένο': 'Planned',
    '✅ Έγινε': 'Done',
    'Ολοκληρώθηκε': 'Done',
    'Έφτασε': 'Planned',
    'Φόρτωση': 'Planned',
    'Εκφόρτωση': 'Planned',
    'Αναβλήθηκε': 'Planned',
    '⏩ Postponed': 'Planned',
}

STATUS_RANK = {
    '': 0, 'Pending': 1, 'Assigned': 2,
    'Loaded': 3, 'In Transit': 3,
    'Delivered': 4, 'Invoiced': 5, 'Cancelled': 6,
}
OPS_TO_STATUS = {
    'Loaded': 'In Transit',
    'In Transit': 'In Transit',
    'Delivered': 'Delivered',
}


def http(url, method='GET', body=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode('utf-8')
        raise RuntimeError(f'{method} {url} -> {e.code}: {body_txt}')


def at_fetch(table, fields=None):
    records = []
    offset = ''
    base_params = []
    if fields:
        for f in fields:
            base_params.append(f'fields[]={urllib.parse.quote(f)}')
    while True:
        params = ['pageSize=100'] + base_params[:]
        if offset:
            params.append(f'offset={urllib.parse.quote(offset)}')
        url = f'https://api.airtable.com/v0/{AT_BASE}/{table}?' + '&'.join(params)
        _, data = http(url)
        records.extend(data.get('records', []))
        offset = data.get('offset', '')
        if not offset:
            break
    return records


def at_patch_batch(table, records):
    out = []
    for i in range(0, len(records), 10):
        batch = records[i:i+10]
        url = f'https://api.airtable.com/v0/{AT_BASE}/{table}'
        _, data = http(url, method='PATCH', body={'records': batch, 'typecast': True})
        out.extend(data.get('records', []))
        time.sleep(0.22)  # rate limit
    return out


# ── STEP 1: Report RAMP Status schema (typecast=true will add new options) ──

def ensure_ramp_status_options():
    print('\n[1/4] Checking RAMP Status schema...')
    url = f'https://api.airtable.com/v0/meta/bases/{AT_BASE}/tables'
    _, data = http(url)

    ramp_table = next((t for t in data['tables'] if t['id'] == T_RAMP), None)
    if not ramp_table:
        raise RuntimeError('RAMP table not found in schema')

    status_field = next((f for f in ramp_table['fields'] if f['name'] == 'Status'), None)
    if not status_field:
        raise RuntimeError('Status field not found in RAMP')

    existing_choices = status_field.get('options', {}).get('choices', [])
    existing_names = [c['name'] for c in existing_choices]
    print('  Current RAMP Status options:', ', '.join(existing_names))
    print('  Note: PAT lacks schema.bases:write — using typecast=true in PATCH to auto-create Planned/Done')


# ── STEP 2: Migrate RAMP records ───────────────────────────────────

def migrate_ramp_statuses():
    print('\n[2/4] Migrating RAMP records...')
    records = at_fetch(T_RAMP, fields=['Status'])
    print(f'  Fetched {len(records)} RAMP records')

    updates = []
    already_clean = 0
    unmapped = set()

    for r in records:
        cur = r.get('fields', {}).get('Status')
        if not cur:
            continue
        if cur in ('Planned', 'Done'):
            already_clean += 1
            continue
        nxt = RAMP_STATUS_MAP.get(cur)
        if not nxt:
            unmapped.add(cur)
            continue
        updates.append({'id': r['id'], 'fields': {'Status': nxt}})

    if unmapped:
        print('  WARNING Unmapped values (skipped):', ', '.join(unmapped))
    print(f'  Already clean: {already_clean} | To migrate: {len(updates)}')

    if updates:
        at_patch_batch(T_RAMP, updates)
        print(f'  OK Migrated {len(updates)} RAMP records')


# ── STEP 3: Migrate ORDERS Status ──────────────────────────────────

def migrate_orders_statuses():
    print('\n[3/4] Migrating ORDERS Status (Loaded -> In Transit, sync from Ops Status)...')
    records = at_fetch(T_ORDERS, fields=['Status', 'Ops Status'])
    print(f'  Fetched {len(records)} ORDER records')

    updates = []
    kept = 0

    for r in records:
        f = r.get('fields', {})
        cur = (f.get('Status') or '').strip()
        ops = (f.get('Ops Status') or '').strip()
        nxt = cur

        if cur == 'Loaded':
            nxt = 'In Transit'

        ops_mapped = OPS_TO_STATUS.get(ops)
        if ops_mapped and STATUS_RANK.get(ops_mapped, 0) > STATUS_RANK.get(nxt, 0):
            nxt = ops_mapped

        if nxt != cur:
            updates.append({'id': r['id'], 'fields': {'Status': nxt}})
        else:
            kept += 1

    print(f'  Kept: {kept} | To update: {len(updates)}')

    if updates:
        at_patch_batch(T_ORDERS, updates)
        print(f'  OK Migrated {len(updates)} ORDER records')


# ── STEP 4: Report ─────────────────────────────────────────────────

def report_ops_status():
    print('\n[4/4] Ops Status field usage report (for manual cleanup)...')
    records = at_fetch(T_ORDERS, fields=['Ops Status'])
    used = [r for r in records if r.get('fields', {}).get('Ops Status')]
    print(f'  {len(used)} ORDERS still have Ops Status set.')
    print('  Field is deprecated -- code no longer reads/writes it.')
    print('  ACTION: Once you have verified all flows, delete "Ops Status" field from ORDERS in Airtable UI.')


def main():
    print('=' * 56)
    print('  STATUS UNIFICATION MIGRATION')
    print(f'  Base: {AT_BASE}')
    print('=' * 56)
    try:
        ensure_ramp_status_options()
        migrate_ramp_statuses()
        migrate_orders_statuses()
        report_ops_status()
        print('\n' + '=' * 56)
        print('  OK MIGRATION COMPLETE')
        print('=' * 56 + '\n')
    except Exception as e:
        print(f'\nFAILED: {e}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
