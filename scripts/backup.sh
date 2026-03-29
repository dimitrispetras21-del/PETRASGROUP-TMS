#!/usr/bin/env bash
# ═══════════════════════════════════════════════
# PETRAS GROUP TMS — Airtable Backup Script
# Exports key tables as JSON, handles pagination,
# rotates backups (keeps last 7 days).
# ═══════════════════════════════════════════════
set -euo pipefail

# ── Configuration ─────────────────────────────
# Override via environment variables or let the script read from config.js
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -z "${AT_TOKEN:-}" ] || [ -z "${AT_BASE:-}" ]; then
  # Try to read from config.js
  CONFIG_FILE="$PROJECT_DIR/config.js"
  if [ -f "$CONFIG_FILE" ]; then
    AT_TOKEN="${AT_TOKEN:-$(grep -oP "AT_TOKEN\s*[:=]\s*['\"]?\Kpat[^'\";,]*" "$CONFIG_FILE" 2>/dev/null || true)}"
    AT_BASE="${AT_BASE:-$(grep -oP "AT_BASE\s*[:=]\s*['\"]?\Kapp[^'\";,]*" "$CONFIG_FILE" 2>/dev/null || true)}"
  fi
fi

if [ -z "${AT_TOKEN:-}" ]; then
  echo "ERROR: AT_TOKEN not set. Export it or ensure config.js is present."
  echo "Usage: AT_TOKEN=patXXX AT_BASE=appXXX $0"
  exit 1
fi
if [ -z "${AT_BASE:-}" ]; then
  echo "ERROR: AT_BASE not set. Export it or ensure config.js is present."
  exit 1
fi

BACKUP_ROOT="${BACKUP_DIR:-$PROJECT_DIR/backups}"
TODAY=$(date +%Y-%m-%d)
BACKUP_DIR="$BACKUP_ROOT/$TODAY"
KEEP_DAYS=7
API_BASE="https://api.airtable.com/v0"

# ── Table definitions ─────────────────────────
declare -A TABLES=(
  ["ORDERS"]="tblgHlNmLBH3JTdIM"
  ["NATIONAL_ORDERS"]="tblGHCCsTMqAy4KR2"
  ["NAT_LOADS"]="tblVW42cZnfC47gTb"
  ["GROUPAGE_LINES"]="tblxUAaIsUMEDl3qQ"
  ["CONSOLIDATED_LOADS"]="tbl5XSLQjOnG6yLCW"
  ["CLIENTS"]="tblFWKAQVUzAM8mCE"
  ["PARTNERS"]="tblLHl5m8bqONfhWv"
  ["TRUCKS"]="tblEAPExIAjiA3asD"
  ["DRIVERS"]="tbl7UGmYhc2Y82pPs"
)

# ── Functions ─────────────────────────────────

# Fetch all records from a table with pagination
fetch_table() {
  local table_name="$1"
  local table_id="$2"
  local output_file="$BACKUP_DIR/${table_name}.json"
  local offset=""
  local page=0
  local all_records="[]"

  while true; do
    page=$((page + 1))
    local url="${API_BASE}/${AT_BASE}/${table_id}?pageSize=100"
    if [ -n "$offset" ]; then
      url="${url}&offset=${offset}"
    fi

    local response
    response=$(curl -s -w "\n%{http_code}" \
      -H "Authorization: Bearer ${AT_TOKEN}" \
      -H "Content-Type: application/json" \
      "$url" 2>/dev/null)

    local http_code
    http_code=$(echo "$response" | tail -n1)
    local body
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" -ne 200 ]; then
      echo "  ERROR: HTTP $http_code fetching $table_name (page $page)"
      echo "  Response: $(echo "$body" | head -c 200)"
      return 1
    fi

    # Handle rate limiting (429)
    if [ "$http_code" -eq 429 ]; then
      echo "  Rate limited, waiting 30s..."
      sleep 30
      continue
    fi

    # Extract records and merge
    local page_records
    page_records=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(json.dumps(data.get('records', [])))
" 2>/dev/null)

    all_records=$(python3 -c "
import sys, json
existing = json.loads(sys.argv[1])
new_recs = json.loads(sys.argv[2])
existing.extend(new_recs)
print(json.dumps(existing))
" "$all_records" "$page_records" 2>/dev/null)

    # Check for offset (more pages)
    offset=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('offset', ''))
" 2>/dev/null)

    # Small delay to respect rate limits (5 req/sec)
    sleep 0.25

    if [ -z "$offset" ]; then
      break
    fi
  done

  # Write final JSON
  echo "$all_records" | python3 -m json.tool > "$output_file" 2>/dev/null || \
    echo "$all_records" > "$output_file"

  # Count records and file size
  local count
  count=$(python3 -c "import sys,json; print(len(json.load(open('$output_file'))))" 2>/dev/null || echo "?")
  local size
  size=$(du -h "$output_file" | cut -f1)

  printf "  %-22s %6s records  %8s\n" "$table_name" "$count" "$size"
}

# ── Main ──────────────────────────────────────

echo "═══════════════════════════════════════════════"
echo " PETRAS GROUP TMS — Airtable Backup"
echo " Date: $TODAY"
echo "═══════════════════════════════════════════════"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"
echo "Backup directory: $BACKUP_DIR"
echo ""

# Export each table
echo "Exporting tables..."
echo "──────────────────────────────────────────────"

failed=0
for table_name in "${!TABLES[@]}"; do
  table_id="${TABLES[$table_name]}"
  if ! fetch_table "$table_name" "$table_id"; then
    failed=$((failed + 1))
  fi
done

echo "──────────────────────────────────────────────"

# Total backup size
total_size=$(du -sh "$BACKUP_DIR" | cut -f1)
echo ""
echo "Total backup size: $total_size"

if [ $failed -gt 0 ]; then
  echo "WARNING: $failed table(s) failed to export."
fi

# ── Rotate old backups (keep last 7 days) ─────
echo ""
echo "Cleaning old backups (keeping last $KEEP_DAYS days)..."
deleted=0
if [ -d "$BACKUP_ROOT" ]; then
  for dir in "$BACKUP_ROOT"/????-??-??; do
    [ -d "$dir" ] || continue
    dir_name=$(basename "$dir")
    # Calculate age in days
    if date -j -f "%Y-%m-%d" "$dir_name" "+%s" >/dev/null 2>&1; then
      # macOS date
      dir_epoch=$(date -j -f "%Y-%m-%d" "$dir_name" "+%s" 2>/dev/null)
      now_epoch=$(date "+%s")
    elif date -d "$dir_name" "+%s" >/dev/null 2>&1; then
      # GNU date (Linux)
      dir_epoch=$(date -d "$dir_name" "+%s" 2>/dev/null)
      now_epoch=$(date "+%s")
    else
      continue
    fi
    age_days=$(( (now_epoch - dir_epoch) / 86400 ))
    if [ "$age_days" -gt "$KEEP_DAYS" ]; then
      echo "  Removing: $dir_name ($age_days days old)"
      rm -rf "$dir"
      deleted=$((deleted + 1))
    fi
  done
fi

if [ $deleted -eq 0 ]; then
  echo "  No old backups to remove."
else
  echo "  Removed $deleted old backup(s)."
fi

echo ""
echo "Backup complete."
