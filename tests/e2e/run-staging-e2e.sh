#!/usr/bin/env bash
# ============================================================================
# run-staging-e2e.sh, drive the REAL app in a browser against the NEW backend
# ----------------------------------------------------------------------------
# One command for the whole flow, because it has moving parts (generate the
# staging config, serve the files, mint a JWT, run Playwright, clean up). This
# is the browser-level proof the app works on the Stage 2 stack, the thing curl
# and the backend's own suite could not show.
#
# What it proves: the app loads against the new backend, its data requests go to
# the Worker (never Airtable), the facade returns Airtable-shaped records, and a
# reference grid renders real migrated rows. What it does NOT cover: the login
# screen (frontend sends {passwordHash}, backend wants {password}, a known
# finding) and the sync-chain tables (not deployed on the staging Worker yet).
#
# Requires: a seeded staging user (ops/seed-staging-users.sh in the backend repo)
# and its password in $STG_PASS (or edit below). Nothing here is committed.
#
# Usage:  STG_PASS='<staging owner password>' tests/e2e/run-staging-e2e.sh
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/../.."

BACKEND="https://petras-tms-backend-staging.petrasgroup.workers.dev"
ORIGIN="https://dimitrispetras21-del.github.io"
STG_USER="${STG_USER:-stg_owner}"
PORT="${PORT:-8899}"

if [ -z "${STG_PASS:-}" ]; then
  echo "STG_PASS not set (the staging owner's password from ops/seed-staging-users.sh)." >&2
  exit 1
fi

# 1. Generate config.staging.js + app.staging.html from the real files.
tests/e2e/make-staging-config.sh "$BACKEND"

# 2. Mint a JWT via the deployed Worker's real login endpoint.
echo "Logging in as $STG_USER ..."
JWT=$(curl -s -X POST "$BACKEND/auth/login" \
        -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
        -d "$(python3 -c 'import json,sys;print(json.dumps({"username":sys.argv[1],"password":sys.argv[2]}))' "$STG_USER" "$STG_PASS")" \
      | python3 -c 'import json,sys;print(json.load(sys.stdin).get("token",""))')
if [ -z "$JWT" ]; then
  echo "Login failed (check STG_USER / STG_PASS against the seeded staging users)." >&2
  exit 1
fi

# 3. Serve the repo over http (background), stop it on exit no matter what.
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
sleep 1

# 4. Run the browser suite.
LOCAL_ORIGIN="http://localhost:$PORT" STAGING_JWT="$JWT" \
  npx playwright test tests/e2e/staging-backend.spec.js --project=chromium
