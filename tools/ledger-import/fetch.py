#!/usr/bin/env python3
"""Fetch every ledger workbook from the Drive folder «μισθοδοσία» by fileId.

Why by id and not by name: three names exist twice in the folder root with
different content, and `rclone copy` silently keeps one of them. `lsjson`
gives us the Drive id; `backend copyid` fetches exactly that object.
"""
import json, os, re, subprocess, sys

REMOTE = 'petras-drive:'
ROOT_ID = '1J93m8yBVEa1-RDo7loYpUWKhI03u1pz5'
WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'work')
EXCLUDE_DIRS = ('διαφ ΚΑΡΤΕΛ', 'ΑΞΙΑ ΔΡΟΜΟΛΟΓΙΩΝ ΕΣΩΤΕΡΙΚΟΥ')

def list_drive():
    out = subprocess.run(['rclone', 'lsjson', '-R', '--files-only', '--drive-root-folder-id', ROOT_ID, REMOTE],
                         check=True, capture_output=True, text=True).stdout
    items = []
    for it in json.loads(out):
        path = it['Path']
        if not path.lower().endswith('.xlsx'): continue
        if os.path.basename(path).startswith('~$'): continue          # Excel lock files, 165 bytes
        if any(path.startswith(d + '/') for d in EXCLUDE_DIRS): continue
        items.append({'id': it['ID'], 'name': os.path.basename(path), 'path': path,
                      'size': it['Size'], 'modified': it['ModTime']})
    return items

def safe(name):
    return re.sub(r'[^\w.\- ]', '_', name)

def main():
    os.makedirs(os.path.join(WORK, 'xlsx'), exist_ok=True)
    items = list_drive()
    for it in items:
        dest = os.path.join(WORK, 'xlsx', f"{it['id']}__{safe(it['name'])}")
        it['local'] = dest
        if os.path.exists(dest) and os.path.getsize(dest) == it['size']:
            continue
        subprocess.run(['rclone', 'backend', 'copyid', REMOTE, it['id'], dest], check=True, capture_output=True)
    json.dump(items, open(os.path.join(WORK, 'drive-index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(items)} workbooks · {sum(1 for i in items if "/" not in i["path"])} in root · '
          f'{sum(1 for i in items if i["path"].startswith("ΣΤΑΜΑΤΗΣΑΝ/"))} in ΣΤΑΜΑΤΗΣΑΝ')

if __name__ == '__main__':
    main()
