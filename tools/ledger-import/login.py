#!/usr/bin/env python3
"""Log in to the Worker as the owner and store the session token in .env.local.

Why this exists (6/9/2026): the import runs through the Worker with the owner's own
JWT, so every write is audited under his account. The owner runs this script himself
in his terminal; the password is typed into getpass (not echoed, not logged) and only
the resulting 8-hour token is written to .env.local as TMS_JWT=. Nothing is printed
except the username, role and expiry.
"""
import getpass, json, os, sys, time, urllib.request, urllib.error

WORKER = 'https://petras-tms-backend-staging.petrasgroup.workers.dev'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ENV = os.path.join(ROOT, '.env.local')


def main():
    username = input('Όνομα χρήστη TMS [dimitris]: ').strip() or 'dimitris'
    password = getpass.getpass('Κωδικός (δεν εμφανίζεται): ')
    if not password:
        print('Κενός κωδικός — τίποτα δεν έγινε.'); return 1
    req = urllib.request.Request(WORKER + '/auth/login', method='POST',
                                 data=json.dumps({'username': username, 'password': password}).encode(),
                                 # The Worker answers 403 to any request without the app's Origin
                                 # (deployed index.js:308), before it even checks the password.
                                 headers={'Content-Type': 'application/json',
                                          'Origin': 'https://dimitrispetras21-del.github.io',
                                          'User-Agent': 'Mozilla/5.0 (ledger-import login)'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print('Λάθος όνομα χρήστη ή κωδικός' if e.code == 401 else 'Ο διακομιστής απάντησε %d' % e.code); return 1
    finally:
        password = None
    token = data.get('token')
    if not token or token.count('.') != 2:
        print('Ο διακομιστής δεν επέστρεψε session.'); return 1
    lines = []
    if os.path.exists(ENV):
        lines = [l for l in open(ENV, encoding='utf-8').read().splitlines() if not l.startswith('TMS_JWT=')]
    lines.append('TMS_JWT=' + token)
    with open(ENV, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    os.chmod(ENV, 0o600)
    user = data.get('user') or {}
    exp = ''
    try:
        import base64
        payload = token.split('.')[1]
        payload += '=' * (-len(payload) % 4)
        exp_ts = json.loads(base64.urlsafe_b64decode(payload)).get('exp')
        if exp_ts:
            exp = time.strftime('%H:%M', time.localtime(exp_ts))
    except Exception:
        pass
    print('OK: session για %s (%s) αποθηκεύτηκε στο .env.local%s' % (
        user.get('username', username), user.get('role', '?'), (' — λήγει %s' % exp) if exp else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
