#!/usr/bin/env bash
# pre-deploy.sh — Run checks and bump versions before deploying
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS_DIR="$REPO_ROOT/scripts"

echo "============================================"
echo "  Pre-Deploy Checklist — Petras Group TMS"
echo "============================================"
echo ""

# --- Step 1: Bump versions ---
echo "--- Step 1: Cache-bust version bump ---"
bash "$SCRIPTS_DIR/bump-versions.sh"
echo ""

# --- Step 2: Check for console.log (warn only) ---
echo "--- Step 2: Checking for console.log statements ---"
LOG_COUNT=$(grep -rn 'console\.log' "$REPO_ROOT/core/" "$REPO_ROOT/modules/" 2>/dev/null | wc -l | tr -d ' ')
if [ "$LOG_COUNT" -gt 0 ]; then
  echo "  WARNING: Found $LOG_COUNT console.log statement(s):"
  grep -rn 'console\.log' "$REPO_ROOT/core/" "$REPO_ROOT/modules/" 2>/dev/null | head -20
  echo "  (This is a warning only — not blocking deploy)"
else
  echo "  No console.log statements found."
fi
echo ""

# --- Step 3: Check for API keys outside config.js ---
echo "--- Step 3: Checking for exposed API keys ---"
FAIL=0
for f in $(find "$REPO_ROOT/core" "$REPO_ROOT/modules" -name '*.js' 2>/dev/null); do
  if grep -qE "pat[A-Za-z0-9]{14,}" "$f" 2>/dev/null; then
    echo "  FAIL: Possible Airtable PAT in $f"
    FAIL=1
  fi
  if grep -qE "sk-ant-" "$f" 2>/dev/null; then
    echo "  FAIL: Possible Anthropic key in $f"
    FAIL=1
  fi
  if grep -qE "ghp_[A-Za-z0-9]{36,}" "$f" 2>/dev/null; then
    echo "  FAIL: Possible GitHub token in $f"
    FAIL=1
  fi
done

if [ "$FAIL" -eq 1 ]; then
  echo ""
  echo "  BLOCKED: API keys found outside config.js. Remove them before deploying."
  exit 1
fi
echo "  No exposed API keys found."
echo ""

# --- Step 4: Stage and show status ---
echo "--- Step 4: Staging changes ---"
cd "$REPO_ROOT"
git add -A
echo ""
git status
echo ""

# --- Step 5: Confirm ---
echo "============================================"
read -rp "Commit and push? (y/N): " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  read -rp "Commit message: " MSG
  git commit -m "$MSG"
  git push
  echo ""
  echo "Deployed!"
else
  echo "Aborted. Changes are staged but not committed."
fi
