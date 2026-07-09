#!/usr/bin/env bash
# bump-versions.sh — Auto cache-bust all ?v= params in app.html and SW_VERSION in sw.js
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_HTML="$REPO_ROOT/app.html"
SW_JS="$REPO_ROOT/sw.js"

# GNU sed wants `sed -i -E`, BSD/macOS sed wants `sed -i '' -E`. Detect once and
# branch, so this runs unchanged on the Linux dev box AND on a macOS checkout.
# (The original hardcoded the BSD form, so it had never run on this Linux machine.)
if sed --version >/dev/null 2>&1; then
  sed_inplace() { sed -i -E "$@"; }        # GNU
else
  sed_inplace() { sed -i '' -E "$@"; }     # BSD / macOS
fi

# Refuse to run when nothing changed vs origin/main: a version bump on an
# otherwise-clean tree only creates a spurious cache-bust and a conflict-prone
# diff on the shared ?v=/SW_VERSION lines (see CLAUDE.md → GIT WORKFLOW).
if git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git -C "$REPO_ROOT" diff --quiet origin/main -- \
        ":(exclude)app.html" ":(exclude)sw.js" 2>/dev/null; then
    echo "No source changes vs origin/main (only app.html/sw.js differ, if anything)."
    echo "Skipping cache-bust: bumping the version with no real change is pure churn."
    exit 0
  fi
fi

TS=$(date +%s)

echo "=== Cache-bust: v=$TS ==="

# --- app.html: replace all ?v=NNNNNN with ?v=$TS ---
if [[ ! -f "$APP_HTML" ]]; then
  echo "ERROR: app.html not found at $APP_HTML"
  exit 1
fi

COUNT=$(grep -cE '\?v=[0-9]+' "$APP_HTML" || true)
sed_inplace "s/\?v=[0-9]+/?v=$TS/g" "$APP_HTML"
echo "  app.html: updated $COUNT references to ?v=$TS"

# --- sw.js: update SW_VERSION ---
if [[ -f "$SW_JS" ]]; then
  sed_inplace "s/const SW_VERSION = '.*';/const SW_VERSION = 'tms-sw-v$TS';/" "$SW_JS"
  echo "  sw.js:    SW_VERSION = 'tms-sw-v$TS'"
else
  echo "  sw.js:    not found, skipped"
fi

echo "=== Done ==="
