#!/usr/bin/env bash
# check-change.sh — ΜΗΧΑΝΙΚΟΙ έλεγχοι πριν το push, ΧΩΡΙΣ μοντέλο (βήμα 4, DRAFT 22/9/2026).
# Χρήση:  scripts/check-change.sh [BASE] [HEAD]      (προεπιλογή: origin/main HEAD — δηλ. ΟΛΟ το push, όχι ένα commit)
# Έξοδος: μία γραμμή ανά έλεγχο [ΠΡΑΣΙΝΟ|ΚΟΚΚΙΝΟ|ΓΚΡΙ] Μx — τι κάλυψε — λεπτομέρειες.
# Exit: 0 = όλα πράσινα · 1 = τουλάχιστον ένα ΚΟΚΚΙΝΟ · 2 = κανένα κόκκινο αλλά ΓΚΡΙ (εκτός κάλυψης → θέλει άνθρωπο/ρόλο 1).
# Αρχή (owner 22/9): «ένας έλεγχος που δεν ξέρει κάτι λέει ΓΚΡΙ, όχι πράσινο». Τίποτα hardcoded: modules/core από app.html,
# *_PERMS/TABLES/διαδρομές από τον Worker, ώστε ό,τι νέο είτε καλύπτεται είτε βγαίνει γκρι.
# Δεν αγγίζει το working tree: διαβάζει BASE/HEAD με git show. Το μόνο που εκτελεί: node --check σε προσωρινά αντίγραφα.
set -u
BASE="${1:-origin/main}"; HEAD_="${2:-HEAD}"
REVIEWED="2026-09-22"          # τελευταία αναθεώρηση των ίδιων των ελέγχων (14 ημέρες → ΓΚΡΙ υπενθύμιση)
MAX_AGE_DAYS=14
RED=0; GREY=0
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
say(){ printf '%s\n' "$*"; }
res(){ # res <ΠΡΑΣΙΝΟ|ΚΟΚΚΙΝΟ|ΓΚΡΙ> <id> <coverage> <details>
  case "$1" in ΚΟΚΚΙΝΟ) RED=1;; ΓΚΡΙ) GREY=1;; esac
  say "[$1] $2 — κάλυψη: $3 — $4"; }
at(){ git show "$1:$2" 2>/dev/null; }   # at <ref> <path>
days_since(){ # days_since YYYY-MM-DD
  local t; t=$(date -j -f %Y-%m-%d "$1" +%s 2>/dev/null || date -d "$1" +%s 2>/dev/null) || { echo 9999; return; }
  echo $(( ( $(date +%s) - t ) / 86400 )); }

say "check-change (DRAFT) · BASE=$BASE · HEAD=$HEAD_ · αναθεώρηση ελέγχων: $REVIEWED"
git rev-parse --verify -q "$BASE" >/dev/null || { say "[ΓΚΡΙ] BASE '$BASE' δεν υπάρχει"; exit 2; }
CHANGED="$(git diff --name-only "$BASE" "$HEAD_")"
ADDED_LINES="$(git diff "$BASE" "$HEAD_" -- . ':(exclude)docs/*' | grep -E '^\+[^+]' | sed 's/^+//')"
NCH=$(printf '%s\n' "$CHANGED" | grep -c . || true)
say "αλλαγμένα αρχεία: $NCH"
[ "$NCH" -eq 0 ] && { say "[ΓΚΡΙ] τίποτα δεν άλλαξε μεταξύ $BASE και $HEAD_"; exit 2; }

# ── ΑΝΑΚΑΛΥΨΗ (από τον κώδικα στο HEAD, όχι σταθερές) ──────────────────────────────────────────
APP="$(at "$HEAD_" app.html)"; SW_H="$(at "$HEAD_" sw.js)"; SW_B="$(at "$BASE" sw.js)"
IDX="$(at "$HEAD_" worker/src/index.js)"; IDX_B="$(at "$BASE" worker/src/index.js)"
KNOWN_MODULES="$(printf '%s' "$APP" | grep -oE 'src="(modules|core)/[^"?]+' | sed 's/src="//' | sort -u)"
PERMS_NAMES="$(printf '%s' "$IDX" | grep -oE '^(var|const|let) +[A-Za-z_]*PERM[A-Za-z_]*' | awk '{print $2}' | sort -u)"
PERMS_NAMES_B="$(printf '%s' "$IDX_B" | grep -oE '^(var|const|let) +[A-Za-z_]*PERM[A-Za-z_]*' | awk '{print $2}' | sort -u)"
ROUTE_PREFIXES_B="$(printf '%s' "$IDX_B" | grep -oE 'pathname(\.startsWith\(| === |\.indexOf\()"/[A-Za-z0-9_-]+' | grep -oE '/[A-Za-z0-9_-]+$' | sort -u)"
TABLES_KEYS="$(printf '%s' "$IDX" | grep -oE '^ *"?[A-Z][A-Za-z0-9 /().&-]{1,40}"?: *"[a-z_0-9]+"' | sed -E 's/^ *"?//; s/"?: *"[a-z_0-9]+"$//' | sort -u)"
NTK=$(printf '%s\n' "$TABLES_KEYS" | grep -c . || true)
printf '%s' "$IDX" > "$TMP/idx.js"; printf '%s' "$APP" > "$TMP/app.html"; printf '%s\n' "$TABLES_KEYS" > "$TMP/tables.txt"
printf '%s\n' "$KNOWN_MODULES" > "$TMP/modules.txt"; printf '%s\n' "$PERMS_NAMES_B" > "$TMP/perms_b.txt"; printf '%s\n' "$ROUTE_PREFIXES_B" > "$TMP/routes_b.txt"
gi(){ grep "$@" "$TMP/idx.js" >/dev/null 2>&1; }    # grep στον Worker χωρίς pipe (αποφυγή SIGPIPE)
gt(){ grep "$@" "$TMP/tables.txt" >/dev/null 2>&1; }
gm(){ grep "$@" "$TMP/modules.txt" >/dev/null 2>&1; }
gp(){ grep "$@" "$TMP/perms_b.txt" >/dev/null 2>&1; }
gr(){ grep "$@" "$TMP/routes_b.txt" >/dev/null 2>&1; }
KNOWN_AREAS='^(modules/|core/|worker/src/|worker/migrations/|worker/test/|worker/wrangler\.toml|tests/|docs/|assets/|scripts/|sw\.js$|app\.html$|index\.html$|print\.html$|config\.js$|CLAUDE\.md$|README|\.github/|package\.json$|playwright\.config\.js$|\.gitignore$|\.nojekyll$|\.claude/)'

# ── Μ0 ΚΑΛΥΨΗ: αρχεία εκτός γνωστών περιοχών → ΓΚΡΙ ───────────────────────────────────────────
UNKNOWN_FILES="$(printf '%s\n' "$CHANGED" | grep -vE "$KNOWN_AREAS" || true)"
NEW_MODULES="$(printf '%s\n' "$CHANGED" | grep -E '^(modules|core)/.*\.js$' | while read -r f; do gm -x "$f" || echo "$f"; done)"
if [ -n "$UNKNOWN_FILES$NEW_MODULES" ]; then
  res ΓΚΡΙ "Μ0 πεδίο" "$NCH αρχεία vs γνωστές περιοχές + $(printf '%s\n' "$KNOWN_MODULES" | grep -c .) φορτωμένα modules/core" "εκτός κάλυψης — θέλει άνθρωπο/ρόλο 1: $(printf '%s %s' "$UNKNOWN_FILES" "$NEW_MODULES" | tr '\n' ' ')"
else res ΠΡΑΣΙΝΟ "Μ0 πεδίο" "$NCH αρχεία, όλα σε γνωστές περιοχές" "—"; fi

# ── Μ1 conflict markers ────────────────────────────────────────────────────────────────────────
HITS=""; N=0
while read -r f; do [ -z "$f" ] && continue; N=$((N+1))
  h=$(at "$HEAD_" "$f" | grep -nE '^(<{7}|={7}|>{7})' | head -3 | tr '\n' ';'); [ -n "$h" ] && HITS="$HITS $f:$h"; done <<< "$CHANGED"
[ -n "$HITS" ] && res ΚΟΚΚΙΝΟ "Μ1 markers" "$N αρχεία" "$HITS" || res ΠΡΑΣΙΝΟ "Μ1 markers" "$N αρχεία" "—"

# ── Μ2 node --check σε κάθε .js/.mjs που άλλαξε ────────────────────────────────────────────────
JS="$(printf '%s\n' "$CHANGED" | grep -E '\.(js|mjs)$' | grep -vE '^tests/critics/.*\.har' || true)"; N=0; BAD=""
if ! command -v node >/dev/null; then res ΓΚΡΙ "Μ2 σύνταξη" "0" "node δεν υπάρχει στο PATH — δεν ελέγχθηκε"; else
  while read -r f; do [ -z "$f" ] && continue; git cat-file -e "$HEAD_:$f" 2>/dev/null || continue; N=$((N+1))
    at "$HEAD_" "$f" > "$TMP/$(basename "$f")"; node --check "$TMP/$(basename "$f")" 2>/dev/null || BAD="$BAD $f"; done <<< "$JS"
  [ -n "$BAD" ] && res ΚΟΚΚΙΝΟ "Μ2 σύνταξη" "$N αρχεία js" "node --check απέτυχε:$BAD" || res ΠΡΑΣΙΝΟ "Μ2 σύνταξη" "$N αρχεία js" "—"; fi

# ── Μ3 bump ?v= ↔ SW_VERSION (ανά push: BASE→HEAD) ─────────────────────────────────────────────
FE="$(printf '%s\n' "$CHANGED" | grep -E '^(modules|core)/.*\.js$|^assets/style\.css$|^config\.js$' || true)"; N=0; MISS=""
if [ -n "$FE" ]; then
  APP_B="$(at "$BASE" app.html)"
  while read -r f; do [ -z "$f" ] && continue; git cat-file -e "$HEAD_:$f" 2>/dev/null || continue; N=$((N+1))
    vb=$(printf '%s' "$APP_B" | grep -oE "$f\?v=[0-9]+" | head -1); vh=$(printf '%s' "$APP" | grep -oE "$f\?v=[0-9]+" | head -1)
    [ -z "$vh" ] && { MISS="$MISS $f(δεν φορτώνεται από app.html)"; continue; }; [ "$vb" = "$vh" ] && MISS="$MISS $f(?v= ίδιο)"; done <<< "$FE"
  swb=$(printf '%s' "$SW_B" | grep -oE "SW_VERSION *= *'[^']+'" | head -1); swh=$(printf '%s' "$SW_H" | grep -oE "SW_VERSION *= *'[^']+'" | head -1)
  [ "$swb" = "$swh" ] && MISS="$MISS sw.js(SW_VERSION ίδιο)"
  [ -n "$MISS" ] && res ΚΟΚΚΙΝΟ "Μ3 bump" "$N front-end αρχεία + sw.js" "$MISS" || res ΠΡΑΣΙΝΟ "Μ3 bump" "$N front-end αρχεία + sw.js" "όλα τα ?v= νέα, SW_VERSION $swh"
else res ΠΡΑΣΙΝΟ "Μ3 bump" "0 front-end αρχεία" "n.a."; fi

# ── Μ4 πεδίο front ↔ χάρτης TABLES (heuristic, προειδοποίηση = ΓΚΡΙ) ───────────────────────────
if [ -z "$IDX" ]; then res ΓΚΡΙ "Μ4 πεδία" "0" "worker/src/index.js δεν βρέθηκε στο HEAD"; else
  LABELS="$(printf '%s\n' "$ADDED_LINES" | grep -E "fields\[['\"]|atPatch\(|atCreate\(|fields *= *\{|['\"][A-Z][A-Za-z ]+['\"] *:" | grep -oE "['\"][A-Z][A-Za-z0-9 /().&-]{2,40}['\"]" | tr -d "'\"" | sort -u)"
  N=$(printf '%s\n' "$LABELS" | grep -c . || true); UNK=""
  while read -r l; do [ -z "$l" ] && continue; gt -xF "$l" || gi -F "\"$l\"" || gi -E "(^| )$l:" || UNK="$UNK «$l»"; done <<< "$LABELS"
  [ -n "$UNK" ] && res ΓΚΡΙ "Μ4 πεδία" "$N νέα labels vs $NTK κλειδιά χάρτη" "δεν βρέθηκαν στον Worker (σιωπηλή απόρριψη;):$UNK" || res ΠΡΑΣΙΝΟ "Μ4 πεδία" "$N νέα labels vs $NTK κλειδιά χάρτη" "—"; fi

# ── Μ5 νέες διαδρομές Worker ↔ *_PERMS (ανακάλυψη ονομάτων) ────────────────────────────────────
if printf '%s\n' "$CHANGED" | grep -q '^worker/src/index.js$'; then
  NEWP="$(printf '%s\n' "$PERMS_NAMES" | while read -r p; do [ -n "$p" ] && ! gp -x "$p" && echo "$p"; done)"
  NEWR="$(printf '%s\n' "$ADDED_LINES" | grep -oE 'pathname(\.startsWith\(| === |\.indexOf\()"/[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)?' | grep -oE '"/.*' | tr -d '"' | sort -u)"
  N=$(printf '%s\n' "$NEWR" | grep -c . || true); OUT=""; UNC=""
  while read -r r; do [ -z "$r" ] && continue; pre="/$(echo "$r" | cut -d/ -f2)"; seg="$(echo "$r" | cut -d/ -f3)"
    gr -x "$pre" || { UNC="$UNC $r(νέο πρόθεμα)"; continue; }
    [ -n "$seg" ] && ! gi -E "(^|[^A-Za-z_])$seg *:" && OUT="$OUT $r(χωρίς γραμμή σε $(printf '%s' "$PERMS_NAMES" | tr '\n' ','))"; done <<< "$NEWR"
  [ -n "$NEWP" ] && UNC="$UNC νέος πίνακας δικαιωμάτων: $(echo $NEWP)"
  if [ -n "$UNC" ]; then res ΓΚΡΙ "Μ5 δικαιώματα" "$N νέες διαδρομές vs προθέματα {$(echo $ROUTE_PREFIXES_B)} και $(printf '%s\n' "$PERMS_NAMES" | grep -c .) πίνακες" "εκτός κάλυψης:$UNC"
  elif [ -n "$OUT" ]; then res ΓΚΡΙ "Μ5 δικαιώματα" "$N νέες διαδρομές" "χωρίς εμφανή γραμμή δικαιώματος:$OUT"
  else res ΠΡΑΣΙΝΟ "Μ5 δικαιώματα" "$N νέες διαδρομές, $(printf '%s\n' "$PERMS_NAMES" | grep -c .) πίνακες ($(echo $PERMS_NAMES))" "—"; fi
else res ΠΡΑΣΙΝΟ "Μ5 δικαιώματα" "index.js αμετάβλητο" "n.a."; fi

# ── Μ8 κεφαλίδα + αρίθμηση migration + νέος πίνακας ↔ χάρτης ───────────────────────────────────
MIG="$(printf '%s\n' "$CHANGED" | grep -E '^worker/migrations/[0-9]{3}_.*\.sql$' || true)"
if [ -n "$MIG" ]; then N=0; BADH=""; UNT=""
  MAXB=$(git ls-tree --name-only "$BASE" worker/migrations/ | grep -oE '/[0-9]{3}_' | tr -d '/_' | sort -n | tail -1)
  while read -r f; do [ -z "$f" ] && continue; N=$((N+1)); head8="$(at "$HEAD_" "$f" | head -8)"
    printf '%s' "$head8" | grep -qiE 'ΕΚΤΕΛΕΣΤΗΚΕ|ΕΚΤΕΛΕΣΜΕΝ|ΔΕΝ ΕΧΕΙ ΤΡΕΞΕΙ|DRAFT|NOT EXECUTED|EXECUTED' || BADH="$BADH $f(χωρίς κεφαλίδα κατάστασης)"
    num=$(basename "$f" | cut -c1-3); [ "${num#0}" -le "${MAXB#0}" ] 2>/dev/null && ! git cat-file -e "$BASE:$f" 2>/dev/null && BADH="$BADH $f(αριθμός ≤ $MAXB)"
    for t in $(at "$HEAD_" "$f" | grep -ioE 'create table (if not exists )?[a-z_.]+' | awk '{print $NF}' | sed 's/public\.//'); do
      gi -F "\"$t\"" || UNT="$UNT $t"; done; done <<< "$MIG"
  [ -n "$BADH" ] && res ΚΟΚΚΙΝΟ "Μ8 migrations" "$N αρχεία, max στο BASE $MAXB" "$BADH" || res ΠΡΑΣΙΝΟ "Μ8 migrations" "$N αρχεία, max στο BASE $MAXB" "κεφαλίδες/αρίθμηση ΟΚ"
  [ -n "$UNT" ] && res ΓΚΡΙ "Μ8β νέοι πίνακες" "$N migrations vs χάρτης Worker" "πίνακας χωρίς αντιστοιχία στον Worker (χρειάζεται χάρτη/PERMS;):$UNT"
else res ΠΡΑΣΙΝΟ "Μ8 migrations" "0 migrations" "n.a."; fi

# ── Μ9 writer δημιουργίας μέσα σε save/edit handler (heuristic → ΓΚΡΙ) ─────────────────────────
W="$(git diff -U40 "$BASE" "$HEAD_" -- 'modules/*.js' 'core/*.js' | awk '/^(\+|-)?(async )?function [A-Za-z_]*([Ss]ave|[Ee]dit|[Uu]pdate|[Ss]ubmit)[A-Za-z_]*\(/{fn=$0} /^\+.*(atCreate\(|[Ww]rite[A-Za-z]*Chain\(|_create[A-Za-z]*\()/{ if (fn!="") print fn " → " $0; fn="" }' | head -5)"
[ -n "$W" ] && res ΓΚΡΙ "Μ9 writer" "handlers save/edit/update/submit στο diff" "atCreate μέσα σε handler επεξεργασίας; έλεγξε recId→atPatch: $(echo "$W" | tr '\n' ' ' | cut -c1-200)" || res ΠΡΑΣΙΝΟ "Μ9 writer" "handlers save/edit/update/submit στο diff" "—"

# ── Μ10 ΛΗΞΗ: ετικέτες [επαλ. YYYY-MM-DD] στο εγχειρίδιο + αναθεώρηση των ελέγχων ─────────────
KN="$(at "$HEAD_" docs/grok-bot/skill-tms-knowledge.md)"
TAGS="$(printf '%s' "$KN" | grep -oE '\[επαλ\. [0-9]{4}-[0-9]{2}-[0-9]{2}\]' | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')"
NT=$(printf '%s\n' "$TAGS" | grep -c . || true); OLD=0
for d in $TAGS; do [ "$(days_since "$d")" -gt "$MAX_AGE_DAYS" ] && OLD=$((OLD+1)); done
if [ "$NT" -eq 0 ]; then res ΓΚΡΙ "Μ10 λήξη εγχειριδίου" "0 ετικέτες" "το εγχειρίδιο δεν έχει ετικέτες [επαλ. YYYY-MM-DD] — δεν ξέρουμε πόσο παλιοί είναι οι κανόνες"
elif [ "$OLD" -gt 0 ]; then res ΓΚΡΙ "Μ10 λήξη εγχειριδίου" "$NT ετικέτες" "$OLD κανόνες > $MAX_AGE_DAYS ημέρες χωρίς επαλήθευση"
else res ΠΡΑΣΙΝΟ "Μ10 λήξη εγχειριδίου" "$NT ετικέτες" "όλες ≤ $MAX_AGE_DAYS ημέρες"; fi
A=$(days_since "$REVIEWED"); [ "$A" -gt "$MAX_AGE_DAYS" ] && res ΓΚΡΙ "Μ11 λήξη ελέγχων" "REVIEWED=$REVIEWED" "οι ίδιοι οι έλεγχοι δεν αναθεωρήθηκαν εδώ και $A ημέρες (>$MAX_AGE_DAYS) — μία ώρα αναθεώρησης" || res ΠΡΑΣΙΝΟ "Μ11 λήξη ελέγχων" "REVIEWED=$REVIEWED" "$A ημέρες"

# ── Σύνοψη ────────────────────────────────────────────────────────────────────────────────────
if [ "$RED" -eq 1 ]; then say "ΣΥΝΟΨΗ: ΚΟΚΚΙΝΟ — μη κάνεις push (exit 1)"; exit 1
elif [ "$GREY" -eq 1 ]; then say "ΣΥΝΟΨΗ: ΓΚΡΙ — κάτι εκτός κάλυψης ή ληγμένο: κάλεσε τον ρόλο 1 («τι είναι αυτό το νέο πράγμα και τι αγγίζει») ή άνθρωπο (exit 2)"; exit 2
else say "ΣΥΝΟΨΗ: ΠΡΑΣΙΝΟ (exit 0) — μόνο μηχανικά· δεν λέει τίποτα για επιχειρησιακή ορθότητα"; exit 0; fi
