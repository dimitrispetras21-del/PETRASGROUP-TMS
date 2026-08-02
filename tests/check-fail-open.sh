#!/usr/bin/env bash
#
# check-fail-open.sh — guard against new silent-failure fallbacks.
#
# PURPOSE
#   Fails if a NEW `.catch(() => [])`-style fallback appears on a data fetch.
#   That one pattern caused four production incidents in the week of
#   2026-07-29: a fetch rejected, the empty default rendered as fact, and the
#   user saw a confident wrong answer while nothing reached /app-errors.
#     - the duplicate-order guard answered "no duplicates" to every check
#     - pallet balances displayed "0" for every client
#     - national invoicing discarded invoice numbers while reporting success
#     - the daily backup exited before reaching its credential
#
# WHAT TO DO WHEN THIS FAILS
#   Use safeFetch() from core/utils.js instead. It still fails soft (the page
#   does not break) but it reports the failure and tags the fallback, so a
#   caller can render "could not load" instead of "0":
#
#     BEFORE: const rows = await atGetAll(TABLES.X, opts).catch(() => []);
#     AFTER:  const rows = await safeFetch(() => atGetAll(TABLES.X, opts), 'X list');
#             if (didFail(rows)) { showUnavailable(); return; }
#
# WHY A BASELINE INSTEAD OF ZERO
#   32 pre-existing data-fetch sites are grandfathered. Converting them all in
#   one PR would be a huge untestable diff across every module; each wants its
#   own "what should the UI say instead" decision. So this ratchets: the count
#   may fall, never rise. Lower BASELINE as sites are converted.
#
#   The worst offender is modules/metrics_audit.js, where 12 consecutive
#   fetches each fail open, so a single unreachable table quietly shifts every
#   figure on the metrics page. Good first conversion target.
#
# WHY NOT ESLINT
#   ESLint is not a dependency here and .eslintrc.json is legacy-format (v10
#   requires flat config). Adding and migrating it is a separate change needing
#   its own review. This needs no dependencies and runs in CI or locally.
#
# USAGE
#   bash tests/check-fail-open.sh          # check (exit 1 if count rose)
#   bash tests/check-fail-open.sh --list   # show every current site
#
set -euo pipefail

cd "$(dirname "$0")/.."

# Ratchet. Lower this as sites are converted to safeFetch; never raise it.
# Measured on 2026-08-02 against core/ + modules/.
BASELINE=32

# Data-fetch fallbacks only. Deliberately NOT matched, these swallow on purpose
# and have nothing to report:
#   - res.json().catch(() => ({}))   parsing a possibly-empty error body
#   - sw.js cache fallbacks          offline behaviour IS the feature
#   - fire-and-forget writes         no rendered result to be wrong about
FETCH_CALL='(atGet|atGetAll|atFind|fetchPreviousWeekStats|fetchOnTimeStreak)'
FAIL_OPEN='\.catch\(\s*\(\s*\)\s*=>\s*(\[\]|\{\}|\(\{[^)]*\}\)|null|0)'

# Scan app source only: tests may assert on the pattern, and sw.js is exempt.
#
# Comment lines are excluded, and that exclusion is load-bearing rather than
# cosmetic: the safeFetch docblock in core/utils.js shows the BEFORE pattern it
# replaces, so without this the guard counts its own documentation as a
# violation. Matches `//`, `*`, `/*` and `#` after optional leading whitespace,
# which covers every comment style in these files.
scan() {
  grep -rnE "$FAIL_OPEN" --include='*.js' core/ modules/ 2>/dev/null \
    | grep -E "$FETCH_CALL" \
    | grep -vE '^[^:]+:[0-9]+: *(//|\*|/\*|#)' \
    || true
}

if [ "${1:-}" = "--list" ]; then
  scan | sed 's/^/  /'
  echo
  echo "Total: $(scan | wc -l) (baseline $BASELINE)"
  exit 0
fi

COUNT=$(scan | wc -l)

if [ "$COUNT" -gt "$BASELINE" ]; then
  echo "✗ FAIL: fail-open data fetches rose to $COUNT (baseline $BASELINE)."
  echo
  echo "A new silent-failure fallback was added. Use safeFetch() from"
  echo "core/utils.js instead, so the failure is reported and the caller can"
  echo "tell 'could not load' from 'no rows'. See the header of this script."
  echo
  echo "Current sites:"
  scan | sed 's/^/  /'
  exit 1
fi

if [ "$COUNT" -lt "$BASELINE" ]; then
  echo "✓ PASS: $COUNT fail-open data fetches, down from baseline $BASELINE."
  echo "  Nice — lower BASELINE in this script to $COUNT to lock the gain in."
  exit 0
fi

echo "✓ PASS: $COUNT fail-open data fetches, at baseline."
