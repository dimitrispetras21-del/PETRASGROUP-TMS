# 08 — P1: Απόκρυψη headers στα Cloudflare Workers Logs — DRAFT (βήμα 1, προετοιμασία μόνο)

Σύνταξη 22/9/2026 · **Κατάσταση: ΕΠΙΛΟΓΗ (i) ΕΚΤΕΛΕΣΤΗΚΕ 22/9/2026 21:08 EEST** (owner: main 2dfa287, `wrangler deploy` έκδοση 8cb4f167, φρουρός των τριών 12/1/1 πριν και μετά, bindings/secrets ίδια, /health OK). Επαλήθευση από το Observability API (συντονιστής 21:12): `logs.invocation_logs=false` στη ρύθμιση παραγωγής· events `cf-worker-event` 327 την ώρα πριν → **0** μετά. **Εκκρεμεί:** απόδειξη ότι ένα `cf-worker-log` (console.*) φτάνει (ελεγκτής ded595a P3 [2]) — δοκιμή με login owner ή πρώτη πρωινή κίνηση 23/9. Τα παλιά logs λήγουν μόνα τους ως 29/9· ως τότε κανένα bot στα CF logs. Επιλογή (ii) παραμένει DRAFT. Η αιτιολόγηση του P1 δόθηκε στον owner εκτός repo (το repo είναι δημόσιο)· εδώ μόνο η γενική διατύπωση: **τα invocation logs του Worker περιέχουν το πλήρες αίτημα, μαζί με headers που δεν πρέπει να διαβάζονται από τρίτους.**

## Τι ισχύει σήμερα (επαληθευμένο)

- `worker/wrangler.toml:36-37`: `[observability] enabled = true` — τίποτα άλλο (χωρίς `[observability.logs]`, χωρίς `head_sampling_rate`).
- Ο Worker **δεν** γράφει ο ίδιος τα headers. Τα γράφει **αυτόματα** η Cloudflare σε κάθε αίτημα ως **invocation log** (`$metadata.type = "cf-worker-event"`, με `$workers.event.request.headers.*`). Επιβεβαιώθηκε 22/9 από `observability_keys` (τα κλειδιά headers υπάρχουν στο dataset) και από τα CF docs («Each Workers invocation returns a single invocation log that contains details such as the Request, Response, and related metadata»).
- Retention: **7 ημέρες** (CF docs: «stores all logs … for up to 7 days»). Δηλαδή ό,τι λογκαρίστηκε σήμερα, εξαφανίζεται μόνο του 7 ημέρες **μετά** την αλλαγή.
- Τα δικά μας `console.error/warn` (54 στον κώδικα) **δεν** εμφανίστηκαν στο dataset τις τελευταίες 7 ημέρες (query `cf-worker-log` κενό) — είτε δεν συνέβη σφάλμα, είτε δεν φτάνουν. **ΔΕΝ ΕΛΕΓΧΘΗΚΕ** η αιτία.

## Η ρύθμιση που κόβει τα headers (από τα CF docs, 22/9)

```toml
[observability]
enabled = true

  [observability.logs]
  invocation_logs = false
```

«Invocation logs can be disabled in wrangler by adding the `invocation_logs = false` configuration.» Με αυτό **σταματά όλο** το αυτόματο invocation log (request + response + metadata), όχι μόνο τα headers. Τα `console.log/error/warn` του Worker **συνεχίζουν** να καταγράφονται. **Δεν βρέθηκε** στα docs ρύθμιση που να κόβει **μόνο** τα headers και να κρατά status/διαδρομή — αν υπάρχει, δεν επαληθεύτηκε.

**Συνέπεια που πρέπει να ξέρει ο owner:** μόλις κλείσουν τα invocation logs, οι έλεγχοι Α4/Α5/Β4/Β5 του `02-έλεγχοι.md` (5xx, exceptions, αποτυχημένες αποθηκεύσεις, 401) **δεν έχουν πια δεδομένα** — εκτός αν ο Worker γράψει δική του γραμμή ανά αίτημα (επιλογή ii).

## Επιλογή (i) — Μόνο ρύθμιση (χωρίς κώδικα)

**Τι κάνει ο owner:**
1. Στο repo: προσθήκη των 2 γραμμών `[observability.logs]` / `invocation_logs = false` κάτω από το `enabled = true` στο `worker/wrangler.toml` (γραμμές 36-37). Commit.
2. Deploy Worker: `cd worker && CLOUDFLARE_API_TOKEN=$CF_API_TOKEN npx wrangler deploy` — **μετά τις 15:00**, με φρουρό των τριών **πριν και μετά** (`CLAUDE.md` §Ο φρουρός: `order_stops … "DELETE"` για dispatcher, `"VS CD Date": "cross_dock_date"`, τα 4 πεδία WORKSHOPS). Καμία αλλαγή κώδικα, άρα ο φρουρός πρέπει να βγει 3/3 ταυτόσημα.
3. Επαλήθευση: 10 λεπτά μετά, στο dashboard Workers → petras-tms-backend-staging → Logs: **δεν** πρέπει να εμφανίζονται νέα events τύπου invocation· ή από το MCP: `observability_keys` για το τελευταίο 10λεπτο δεν πρέπει να περιέχει `$workers.event.request.headers.*`.
4. 7 ημέρες αργότερα (29/9): τα παλιά logs έχουν λήξει μόνα τους. Μέχρι τότε **κανένα bot/connector στο CF**.

**Dashboard αντί wrangler:** στα docs η ρύθμιση περιγράφεται μόνο μέσω wrangler. Αν το dashboard έχει αντίστοιχο διακόπτη («Invocation logs» στο Settings → Observability), **δεν επαληθεύτηκε** — και ό,τι αλλάξει στο dashboard **δεν** ζει στο repo (κίνδυνος split-brain, `CLAUDE.md` §Ο WORKER). Πρόταση: **μόνο μέσω wrangler.toml + deploy.**

**Τι απαιτεί το πλάνο:** Workers Logs είναι διαθέσιμο στο υπάρχον πλάνο (ήδη ενεργό). Το `invocation_logs` δεν αναφέρεται ως χαρακτηριστικό πληρωμένου πλάνου. **Δεν επαληθεύτηκε** για το συγκεκριμένο πλάνο του λογαριασμού.

**Τι χάνεται:** όλα τα ανά-αίτημα δεδομένα (status, μέθοδος, διαδρομή, χώρα, χρόνοι). Οι έλεγχοι CF του 02 γίνονται μόνιμα ΓΚΡΙ.

**Ρίσκο:** χαμηλό — μία γραμμή ρύθμισης, αναστρέψιμη με το αντίθετο deploy.

## Επιλογή (ii) — Ρύθμιση (i) + ο Worker γράφει δική του γραμμή χωρίς headers

**Πού «λογκάρει» ο Worker σήμερα:** πουθενά ανά αίτημα. Το σημείο εισόδου κάθε αιτήματος είναι ο handler `async fetch(request, env, ctx)` στο `worker/src/index.js:4737`, που διαβάζει `Origin` (4738), φτιάχνει CORS (4739), διαβάζει `url` (4740), απαντά OPTIONS (4741-4743), ελέγχει allowlist (4744-4747) και δρομολογεί. Εκεί μπορεί να μπει **μία** γραμμή `console.log` μετά την απάντηση, με **μόνο** ό,τι χρειάζονται οι έλεγχοι: μέθοδος, διαδρομή (χωρίς query), status, διάρκεια, **ρόλος** από το JWT (όχι το token, όχι username), και **ποτέ** headers/body.

**Προτεινόμενο diff — ΩΣ ΚΕΙΜΕΝΟ, δεν εφαρμόστηκε:**

```
worker/wrangler.toml (γραμμές 36-37):
 [observability]
 enabled = true
+
+  # P1 (owner 22/9): τα αυτόματα invocation logs περιέχουν όλα τα request headers.
+  # Κλείνουν· ο Worker γράφει δική του γραμμή ανά αίτημα χωρίς headers (index.js fetch).
+  [observability.logs]
+  invocation_logs = false

worker/src/index.js (γύρω από 4737):
   async fetch(request, env, ctx) {
+    const t0 = Date.now();
+    let res;
+    try {
+      res = await handleFetch(request, env, ctx);   // = το σημερινό σώμα του fetch, μεταφερμένο ως έχει
+    } catch (e) {
+      console.error(JSON.stringify({ kind: "req", method: request.method, path: new URL(request.url).pathname, status: 500, ms: Date.now() - t0, err: String(e && e.message).slice(0, 200) }));
+      throw e;
+    }
+    // Μία γραμμή ανά αίτημα, ΧΩΡΙΣ headers/body/query/username: μόνο ό,τι θέλουν οι έλεγχοι Α4/Α5/Β4/Β5.
+    // Ο ρόλος βγαίνει από το JWT ήδη επαληθευμένο μέσα στο handleFetch (best-effort, null αν λείπει).
+    console.log(JSON.stringify({ kind: "req", method: request.method, path: new URL(request.url).pathname, status: res.status, ms: Date.now() - t0, role: (res.headers.get("x-tms-role") || null) }));
+    return res;
   }
```

Σημειώσεις για όποιον το υλοποιήσει (όχι εδώ): (α) το «`x-tms-role`» είναι **μία** από τις δυνατές λύσεις για να φτάσει ο ρόλος στο log χωρίς να ξαναδιαβαστεί το JWT — εναλλακτικά ένα module-level `WeakMap` ανά request· ο header να μη φύγει προς τον browser (να αφαιρεθεί πριν το return)· (β) το `path` **χωρίς** query (`filterByFormula` κ.λπ. είχαν επιχειρησιακά δεδομένα)· (γ) `console.log` JSON μιας γραμμής, ώστε το CF να το ευρετηριάσει ως πεδία· (δ) το OPTIONS preflight (49% των αιτημάτων) μπορεί να παραλειφθεί από το log για μισό όγκο.

**Σειρά deploy (μία αλλαγή, αναστρέψιμη, εκτός ωρών — αρχή 7):**
1. Πρώτα η **(i)** μόνη της (μία μέρα): επιβεβαίωση ότι τα headers έπαψαν να λογκάρονται, τίποτα άλλο.
2. Μετά η **(ii)** ως ξεχωριστό commit + deploy: φρουρός των τριών πριν/μετά· `worker/test` (26/26) πριν· smoke (login + μία ανάγνωση) μετά· έλεγχος ότι το νέο `kind:"req"` εμφανίζεται στο CF και **δεν** περιέχει headers.
3. Οι έλεγχοι Α4/Α5/Β4/Β5 του 02 ξαναγράφονται πάνω στο `kind:"req"` (status/method/path) αντί για `$workers.event.*` — στο ίδιο έγγραφο, μετά.

**Τι χάνεται:** χώρα/πόλη/colo/χρόνοι CPU ανά αίτημα (δεν τα χρησιμοποιεί κανένας έλεγχος). **Τι κερδίζεται:** και ρόλος ανά αίτημα (σήμερα δεν υπάρχει πουθενά χωρίς headers) — χρήσιμο για τη δεύτερη φάση (04 §4) χωρίς πρόσωπα.

**Ρίσκο:** μεσαίο — αγγίζει τον fetch handler της παραγωγής. Περιορίζεται επειδή το σώμα μετακινείται ως έχει (`handleFetch`) και η νέα γραμμή είναι μετά την απάντηση.

## Πρόταση

**(i) τώρα, (ii) την επόμενη εβδομάδα.** Η (i) κλείνει το P1 με μία γραμμή και μηδενικό ρίσκο κώδικα· το μόνο κόστος είναι ότι οι 4 έλεγχοι CF μένουν ΓΚΡΙ μέχρι τη (ii). Αν ο owner προτιμά να μη μείνει «τυφλός» ούτε μία εβδομάδα, γίνονται μαζί — αλλά σε **δύο** commits/deploys με τη σειρά παραπάνω, όχι ένα.

Μέχρι να εφαρμοστεί η (i) **και** να περάσουν 7 ημέρες: **κανένα CF token σε bot/connector** (`03` §P1).

## Τι ΔΕΝ επαληθεύτηκε

Αν το dashboard έχει διακόπτη για invocation logs· αν το πλάνο επηρεάζει τη ρύθμιση· γιατί τα σημερινά `console.error` δεν φαίνονται στο dataset (αν δεν φτάνουν, η (ii) δεν θα δουλέψει — να δοκιμαστεί **πρώτα** με ένα `console.log` σε `/health`)· αν Logpush/Tail Workers (δεν χρησιμοποιούνται) έχουν κρατήσει αντίγραφα.
