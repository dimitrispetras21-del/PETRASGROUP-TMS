#!/bin/bash
# Build script for Petras Group TMS
# Concatenates and minifies JS/CSS into dist/

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
DIST="$ROOT/dist"

mkdir -p "$DIST"

# ── JS files in exact load order (matches app.html script tags) ──
JS_FILES=(
  "config.js"
  "core/constants.js"
  "core/auth.js"
  "core/api.js"
  "core/utils.js"
  "core/ui.js"
  "core/entity.js"
  "core/router.js"
  "core/ai-chat.js"
  "modules/dashboard.js"
  "modules/weekly_intl.js"
  "modules/weekly_natl.js"
  "modules/daily_ramp.js"
  "modules/maintenance.js"
  "modules/orders_intl.js"
  "modules/orders_natl.js"
  "modules/locations.js"
  "modules/daily_ops.js"
  "modules/pallet_upload.js"
  "modules/pallet_ledger.js"
  "modules/invoicing.js"
  "modules/performance.js"
)

echo "=== Petras Group TMS Build ==="
echo ""

# ── Step 1: Concatenate JS ──
CONCAT="$DIST/app.concat.js"
> "$CONCAT"

for f in "${JS_FILES[@]}"; do
  filepath="$ROOT/$f"
  if [ ! -f "$filepath" ]; then
    echo "WARNING: $f not found, skipping"
    continue
  fi
  echo "/* === $f === */" >> "$CONCAT"
  cat "$filepath" >> "$CONCAT"
  echo "" >> "$CONCAT"
done

CONCAT_SIZE=$(wc -c < "$CONCAT" | tr -d ' ')
echo "JS concatenated: ${CONCAT_SIZE} bytes ($(echo "scale=1; $CONCAT_SIZE/1024" | bc) KB)"

# ── Step 2: Minify JS ──
if command -v npx &>/dev/null && npx terser --version &>/dev/null 2>&1; then
  echo "Minifying JS with terser..."
  npx terser "$CONCAT" \
    --compress drop_console=false,passes=2 \
    --mangle \
    --output "$DIST/app.min.js"
  rm "$CONCAT"
else
  echo "terser not available, using concatenated output (run 'npm install' first for minification)"
  mv "$CONCAT" "$DIST/app.min.js"
fi

MIN_JS_SIZE=$(wc -c < "$DIST/app.min.js" | tr -d ' ')
echo "JS output:       ${MIN_JS_SIZE} bytes ($(echo "scale=1; $MIN_JS_SIZE/1024" | bc) KB)"

# ── Step 3: Minify CSS ──
CSS_SRC="$ROOT/assets/style.css"
if [ -f "$CSS_SRC" ]; then
  CSS_ORIG_SIZE=$(wc -c < "$CSS_SRC" | tr -d ' ')
  echo ""
  echo "CSS original:    ${CSS_ORIG_SIZE} bytes ($(echo "scale=1; $CSS_ORIG_SIZE/1024" | bc) KB)"

  # Simple CSS minification: strip comments, collapse whitespace, trim
  sed 's|/\*[^*]*\*\+\([^/*][^*]*\*\+\)*/||g' "$CSS_SRC" \
    | tr '\n' ' ' \
    | sed 's/  */ /g' \
    | sed 's/ *{ */{/g' \
    | sed 's/ *} */}/g' \
    | sed 's/ *: */:/g' \
    | sed 's/ *; */;/g' \
    | sed 's/ *, */,/g' \
    | sed 's/;}/}/g' \
    > "$DIST/style.min.css"

  CSS_MIN_SIZE=$(wc -c < "$DIST/style.min.css" | tr -d ' ')
  echo "CSS minified:    ${CSS_MIN_SIZE} bytes ($(echo "scale=1; $CSS_MIN_SIZE/1024" | bc) KB)"
else
  echo "WARNING: assets/style.css not found"
fi

# ── Summary ──
echo ""
echo "=== Build Complete ==="
echo "  dist/app.min.js    $(echo "scale=1; $MIN_JS_SIZE/1024" | bc) KB"
if [ -f "$DIST/style.min.css" ]; then
  echo "  dist/style.min.css $(echo "scale=1; $CSS_MIN_SIZE/1024" | bc) KB"
fi
echo ""
if [ "$CONCAT_SIZE" -gt 0 ] 2>/dev/null; then
  SAVINGS=$(echo "scale=0; 100 - ($MIN_JS_SIZE * 100 / $CONCAT_SIZE)" | bc)
  echo "JS savings: ${SAVINGS}%"
fi
