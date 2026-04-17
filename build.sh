#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Build script for Petras Group TMS
# Uses esbuild to bundle + minify all JS/CSS into dist/
# Also generates app.prod.html that loads the bundle
# ═══════════════════════════════════════════════════════════
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
DIST="$ROOT/dist"
mkdir -p "$DIST"

# JS files in exact load order (matches app.html script tags)
JS_FILES=(
  "config.js"
  "core/constants.js"
  "core/auth.js"
  "core/api.js"
  "core/utils.js"
  "core/ui.js"
  "core/entity.js"
  "core/data-helpers.js"
  "core/form-helpers.js"
  "core/stops-helpers.js"
  "core/pa-helpers.js"
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
  "modules/ceo_dashboard.js"
)

echo "═══════════════════════════════════════════════════════"
echo " Petras Group TMS — Production Build"
echo "═══════════════════════════════════════════════════════"
echo ""

# Step 1: Concatenate all JS into a single entry file
ENTRY="$DIST/app.entry.js"
> "$ENTRY"
TOTAL_FILES=0
for f in "${JS_FILES[@]}"; do
  filepath="$ROOT/$f"
  if [ ! -f "$filepath" ]; then
    echo "  WARNING: $f not found, skipping"
    continue
  fi
  echo "/* === $f === */" >> "$ENTRY"
  cat "$filepath" >> "$ENTRY"
  echo "" >> "$ENTRY"
  TOTAL_FILES=$((TOTAL_FILES + 1))
done
ENTRY_SIZE=$(wc -c < "$ENTRY" | tr -d ' ')
echo "Concatenated $TOTAL_FILES files: ${ENTRY_SIZE} bytes ($(echo "scale=1; $ENTRY_SIZE/1024" | bc) KB)"

# Step 2: Bundle + minify with esbuild
TS=$(date +%s)
BUNDLE="$DIST/app.${TS}.min.js"
if command -v npx &>/dev/null && npx esbuild --version &>/dev/null 2>&1; then
  echo "Bundling with esbuild..."
  npx esbuild "$ENTRY" \
    --bundle=false \
    --minify \
    --target=es2018 \
    --legal-comments=none \
    --outfile="$BUNDLE" 2>&1 | grep -v "^$" || true
  rm "$ENTRY"
elif command -v npx &>/dev/null && npx terser --version &>/dev/null 2>&1; then
  echo "esbuild not available, falling back to terser..."
  npx terser "$ENTRY" --compress passes=2 --mangle --output "$BUNDLE"
  rm "$ENTRY"
else
  echo "No minifier available — copying concatenated file (run 'npm install')"
  mv "$ENTRY" "$BUNDLE"
fi

# Clean old bundles, keep only newest
find "$DIST" -name "app.*.min.js" -not -name "app.${TS}.min.js" -delete 2>/dev/null || true
BUNDLE_SIZE=$(wc -c < "$BUNDLE" | tr -d ' ')
echo "JS bundle: ${BUNDLE_SIZE} bytes ($(echo "scale=1; $BUNDLE_SIZE/1024" | bc) KB)"

# Step 3: Bundle CSS
CSS_SRC="$ROOT/assets/style.css"
CSS_BUNDLE="$DIST/style.${TS}.min.css"
if [ -f "$CSS_SRC" ]; then
  if command -v npx &>/dev/null && npx esbuild --version &>/dev/null 2>&1; then
    npx esbuild "$CSS_SRC" --minify --outfile="$CSS_BUNDLE" 2>&1 | grep -v "^$" || true
  else
    sed 's|/\*[^*]*\*\+\([^/*][^*]*\*\+\)*/||g' "$CSS_SRC" \
      | tr '\n' ' ' \
      | sed 's/  */ /g; s/ *{ */{/g; s/ *} */}/g; s/ *: */:/g; s/ *; */;/g; s/ *, */,/g; s/;}/}/g' \
      > "$CSS_BUNDLE"
  fi
  find "$DIST" -name "style.*.min.css" -not -name "style.${TS}.min.css" -delete 2>/dev/null || true
  CSS_SIZE=$(wc -c < "$CSS_BUNDLE" | tr -d ' ')
  echo "CSS bundle: ${CSS_SIZE} bytes ($(echo "scale=1; $CSS_SIZE/1024" | bc) KB)"
fi

# Step 4: Generate app.prod.html — production HTML using single bundle
PROD_HTML="$ROOT/app.prod.html"
JS_BASENAME=$(basename "$BUNDLE")
CSS_BASENAME=$(basename "$CSS_BUNDLE")

# Take dev app.html, replace all script/style tags with the bundle
python3 - "$ROOT/app.html" "$PROD_HTML" "$JS_BASENAME" "$CSS_BASENAME" <<'PYEOF'
import sys, re
src, dst, jsname, cssname = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
with open(src) as f:
    html = f.read()
# Replace stylesheet link
html = re.sub(
    r'<link rel="stylesheet" href="assets/style\.css\?v=\d+">',
    f'<link rel="stylesheet" href="dist/{cssname}">',
    html
)
# Replace ALL script tags between "═══ SCRIPTS" and "═══ Global error handlers" with single bundle
def replace_scripts(m):
    return f'<!-- BUNDLED: {jsname} -->\n<script src="dist/{jsname}"></script>'
html = re.sub(
    r'<!-- 1\. Config.*?<script src="modules/ceo_dashboard\.js\?v=\d+"></script>',
    replace_scripts,
    html,
    flags=re.DOTALL
)
with open(dst, 'w') as f:
    f.write(html)
print(f"  Generated {dst}")
PYEOF

echo ""
echo "═══════════════════════════════════════════════════════"
echo " Build Complete"
echo "═══════════════════════════════════════════════════════"
echo "  dist/$JS_BASENAME ($(echo "scale=1; $BUNDLE_SIZE/1024" | bc) KB)"
[ -f "$CSS_BUNDLE" ] && echo "  dist/$CSS_BASENAME ($(echo "scale=1; $CSS_SIZE/1024" | bc) KB)"
echo "  app.prod.html (uses the bundle)"
echo ""
SAVINGS=$(echo "scale=0; 100 - ($BUNDLE_SIZE * 100 / $ENTRY_SIZE)" | bc 2>/dev/null || echo "?")
echo "JS minification savings: ${SAVINGS}%"
echo ""
echo "Test locally:"
echo "  python3 -m http.server 8080"
echo "  open http://localhost:8080/app.prod.html"
