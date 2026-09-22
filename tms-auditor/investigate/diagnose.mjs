// Provider-independent diagnosis: diagnose(package, opts) → { report, provider, model, tokens, valid, errs }.
// Providers (owner 22/9): 1) 'claude-routine' — the primary path: a scheduled Claude Code cloud routine does
// the reasoning inside the subscription; here the adapter only BUILDS the brief it reads and PARSES/VALIDATES
// what it wrote. 2) 'mock' — deterministic rules for tests. 3) 'anthropic-api' — stub: no paid API plan
// exists (owner 22/9) and the Worker's old ANTHROPIC_API_KEY must NOT be used. (Another provider can be
// added later as one more entry in PROVIDERS.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReport, extractReport } from './validate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROMPT = fs.readFileSync(path.join(HERE, 'prompt.md'), 'utf8');

// "Model per difficulty, not always the most expensive": MECH/P1 need the deepest reading of code + data,
// P2 is routine correlation, P3/P4 are mostly queue/exception classification.
export function selectModel(severity) {
  return { MECH: 'opus', P1: 'opus', P2: 'sonnet', P3: 'haiku', P4: 'haiku' }[severity] || 'sonnet';
}

// Hard limits (brief §Γ). Over a limit the adapter returns NO diagnosis (never a fake one): the alert keeps
// «διάγνωση: εκκρεμεί — όριο …» and the incident is still notified (alerts never wait for the model).
// max_tokens_in is ENFORCED (review B 23/9 #2): estimated from the brief (~3 chars/token, conservative for
// Greek + code); over it, code excerpts are dropped from the end WITH a visible marker, and if the brief is
// still too big the adapter refuses (no diagnosis) instead of sending it.
export const LIMITS = { per_day: 5, max_extra_reads: 0, max_tokens_in: 60000, chars_per_token: 3 };
export const estimateTokens = (text) => Math.ceil(String(text).length / LIMITS.chars_per_token);

export function fitToBudget(pkg) {
  const p = structuredClone(pkg); let dropped = 0;
  while (estimateTokens(brief(p)) > LIMITS.max_tokens_in && (p.code_excerpts || []).length) { p.code_excerpts.pop(); dropped++; }
  if (dropped) p.code_excerpts_truncated = `[περικόπηκε: ${dropped} απόσπασμα(τα) για το όριο ${LIMITS.max_tokens_in} tokens — ζήτα τα με «ζήτα: αρχείο:γραμμές»]`;
  return { pkg: p, tokens: estimateTokens(brief(p)), fits: estimateTokens(brief(p)) <= LIMITS.max_tokens_in };
}

export function brief(pkg) {
  return `${PROMPT}\n\n<package>\n${JSON.stringify(pkg, null, 1)}\n</package>\n`;
}

function mockDiagnose(pkg) {
  const c = pkg.check || {}; const i = pkg.incident;
  const facts = [{ text: `Τιμή ${i.value} έναντι «${i.expected}»`, evidence: 'incident.value' }];
  if ((pkg.history || []).length) facts.push({ text: `Ιστορικό ${pkg.history.length} μετρήσεων`, evidence: 'history[0].value' });
  if ((pkg.code_pointers || []).length) facts.push({ text: `Σχετικός κώδικας κατά τον γράφο: ${pkg.code_pointers[0].src}`, evidence: `code:${pkg.code_pointers[0].src}` });
  let category = 'ΠΙΘΑΝΟ ΠΡΟΒΛΗΜΑ';
  if (i.severity === 'MECH') category = 'ΑΝΕΠΑΡΚΗ ΣΤΟΙΧΕΙΑ';
  else if (!(pkg.audit_last20 || []).length && !(pkg.code_pointers || []).length) category = 'ΑΝΕΠΑΡΚΗ ΣΤΟΙΧΕΙΑ';
  return {
    incident_key: i.key, category,
    summary: `${c.id || i.key}: ${c.title || 'μηχανισμός'} = ${i.value}`,
    business_impact: c.impact || 'Ο ελεγκτής δεν βλέπει — η σιωπή δεν σημαίνει «όλα καλά».',
    facts, hypothesis: 'Μερική αλυσίδα εγγραφής (το ένα βήμα γράφτηκε, το επόμενο όχι).',
    would_confirm: 'Οι γραμμές audit των ids του πακέτου γύρω από την πρώτη εμφάνιση.',
    next_step: { who: 'owner', action: 'Ανάγνωση της εγγραφής στην οθόνη της ροής και απόφαση αν είναι αναμενόμενο.' },
    not_seen: ['η έκδοση του Worker στην παραγωγή', 'τι είδε ο χρήστης στην οθόνη', 'αιτήματα που απορρίφθηκαν (403/422/500) πριν το Επίπεδο Α'],
  };
}

export const PROVIDERS = {
  mock: async (pkg) => ({ report: mockDiagnose(pkg), model: 'mock', tokens: { in: 0, out: 0 } }),
  // The routine writes its answer as text; the adapter's job is to parse and validate it. `opts.routineText`
  // is that text (the local proof passes the output of an isolated Claude session run with brief(pkg)).
  'claude-routine': async (pkg, opts) => {
    if (!opts.routineText) return { report: null, model: opts.model, tokens: null, err: 'PENDING_ROUTINE: brief written, no answer yet' };
    const { report, err } = extractReport(opts.routineText);
    return { report, model: opts.model || selectModel(pkg.incident.severity), tokens: opts.tokens || null, err };
  },
  'anthropic-api': async () => ({ report: null, model: null, tokens: null,
    err: 'NOT CONFIGURED: owner 22/9 — no paid Anthropic API plan; the Worker ANTHROPIC_API_KEY must not be used' }),
};

export async function diagnose(pkg, opts = {}) {
  const provider = opts.provider || 'claude-routine';
  if ((opts.usedToday || 0) >= LIMITS.per_day) return { provider, valid: false, report: null, errs: [`ΕΚΚΡΕΜΕΙ — όριο ημέρας (${LIMITS.per_day})`] };
  const fit = fitToBudget(pkg);
  if (!fit.fits) return { provider, valid: false, report: null, errs: [`brief ≈ ${fit.tokens} tokens > όριο ${LIMITS.max_tokens_in} — δεν στάλθηκε`] };
  pkg = fit.pkg;
  const fn = PROVIDERS[provider];
  if (!fn) return { provider, valid: false, report: null, errs: [`unknown provider ${provider}`] };
  const out = await fn(pkg, { ...opts, model: opts.model || selectModel(pkg.incident.severity) });
  if (!out.report) return { provider, valid: false, report: null, model: out.model, tokens: out.tokens, errs: [out.err || 'no report'] };
  const v = validateReport(out.report, pkg);
  return { provider, valid: v.ok, errs: v.errs, report: v.ok ? { ...out.report, model: out.model, tokens: out.tokens, provider } : null,
           rejected: v.ok ? null : out.report, model: out.model, tokens: out.tokens };
}
