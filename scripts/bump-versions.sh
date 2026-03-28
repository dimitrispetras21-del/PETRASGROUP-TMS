#!/usr/bin/env bash
# bump-versions.sh — Auto cache-bust all ?v= params in app.html and SW_VERSION in sw.js
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_HTML="$REPO_ROOT/app.html"
SW_JS="$REPO_ROOT/sw.js"

TS=$(date +%s)

echo "=== Cache-bust: v=$TS ==="

# --- app.html: replace all ?v=NNNNNN with ?v=$TS ---
if [[ ! -f "$APP_HTML" ]]; then
  echo "ERROR: app.html not found at $APP_HTML"
  exit 1
fi

COUNT=$(grep -cE '\?v=[0-9]+' "$APP_HTML" || true)
sed -i '' -E "s/\?v=[0-9]+/?v=$TS/g" "$APP_HTML"
echo "  app.html: updated $COUNT references to ?v=$TS"

# --- sw.js: update SW_VERSION ---
if [[ -f "$SW_JS" ]]; then
  sed -i '' -E "s/const SW_VERSION = '.*';/const SW_VERSION = 'tms-sw-v$TS';/" "$SW_JS"
  echo "  sw.js:    SW_VERSION = 'tms-sw-v$TS'"
else
  echo "  sw.js:    not found, skipped"
fi

echo "=== Done ==="
