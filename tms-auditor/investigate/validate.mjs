// Machine check of a diagnosis BEFORE it is stored (monitoring.record_diagnosis) or sent.
// A report that fails is NOT stored and NOT sent as a diagnosis: the alert stays «διάγνωση: εκκρεμεί» and
// the failure itself is counted (reliability measurement: reports passed / reports produced).
// Encodes the lessons of docs/grok-bot/reviews/2026-09-22-*: evidence from the package only, no invented
// times, no ellipses, no write SQL / fixes, «ΔΕΝ ΒΛΕΠΩ» never empty, code-read ≠ production-tested.
export const CATEGORIES = ['ΤΕΚΜΗΡΙΩΜΕΝΟ ΤΕΧΝΙΚΟ ΕΛΑΤΤΩΜΑ', 'ΠΙΘΑΝΟ ΠΡΟΒΛΗΜΑ', 'ΛΕΙΤΟΥΡΓΙΚΗ ΕΚΚΡΕΜΟΤΗΤΑ',
  'ΕΓΚΕΚΡΙΜΕΝΗ ΕΞΑΙΡΕΣΗ', 'ΑΝΕΠΑΡΚΗ ΣΤΟΙΧΕΙΑ'];
export const MANDATORY_NOT_SEEN = ['έκδοση του Worker', 'τι είδε ο χρήστης'];
const WRITE_SQL = /\b(insert\s+into|update\s+\w+\s+set|delete\s+from|alter\s+table|drop\s+(table|function|view|schema)|truncate|grant\s+|revoke\s+|create\s+(table|function|trigger|role))\b/i;
const FIX_VERBS = /(διόρθωσ[εα]|σβήσ[εσ]|διέγραψ[εα]|άλλαξε\s+την\s+τιμή|τρέξε\s+(το\s+)?(update|delete|insert)|κάνε\s+deploy|push\s+στο\s+main|apply\s+migration)/i;
const SECRET = /(eyJ[A-Za-z0-9_-]{10,}\.|sk-ant-[A-Za-z0-9-]{6,}|service_role\s*key|postgres(ql)?:\/\/[^\s]+:[^\s]+@)/i;
const PII = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+?\d[\d\s]{9,}\d)/;
const ELLIPSIS = /(\.\.\.|…)/;

function* strings(o, path = '') {
  if (typeof o === 'string') yield [path, o];
  else if (Array.isArray(o)) for (let i = 0; i < o.length; i++) yield* strings(o[i], `${path}[${i}]`);
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) yield* strings(o[k], path ? `${path}.${k}` : k);
}

// "incident.value", "history[0].value", "audit_last20[2]", "code:modules/x.js:120" — must resolve in the package.
export function resolveEvidence(pkg, ref) {
  if (typeof ref !== 'string' || !ref) return false;
  // Code evidence: the FILE must be one of the package's code_pointers (the line may differ: a reader may
  // cite the relevant range inside a pointed file — the first real diagnosis did exactly that, correctly).
  if (ref.startsWith('code:')) {
    const file = ref.slice(5).split(':')[0];
    return (pkg.code_pointers || []).some((c) => c.src && c.src.split(':')[0] === file)
        || (pkg.code_excerpts || []).some((e) => e.file === file);
  }
  let cur = pkg;
  for (const part of ref.replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (cur == null || !(part in Object(cur))) return false;
    cur = cur[part];
  }
  return cur !== undefined;
}

export function validateReport(report, pkg) {
  const errs = [];
  if (!report || typeof report !== 'object') return { ok: false, errs: ['report is not an object'] };
  if (!CATEGORIES.includes(report.category)) errs.push(`category «${report.category}» not one of ${CATEGORIES.length}`);
  if (report.incident_key !== pkg?.incident?.key) errs.push('incident_key does not match the package');
  for (const f of ['summary', 'business_impact', 'hypothesis', 'would_confirm']) {
    if (typeof report[f] !== 'string' || !report[f].trim()) errs.push(`${f} missing`);
  }
  if (!report.next_step || !['owner', 'dispatcher', 'accountant', 'management', 'συντονιστής'].includes(report.next_step.who) || !report.next_step.action)
    errs.push('next_step {who, action} missing or who not a role');
  const facts = Array.isArray(report.facts) ? report.facts : [];
  if (report.category !== 'ΑΝΕΠΑΡΚΗ ΣΤΟΙΧΕΙΑ' && facts.length === 0) errs.push('no facts');
  for (const [i, f] of facts.entries()) {
    if (!resolveEvidence(pkg, f.evidence)) errs.push(`fact ${i}: evidence «${f.evidence}» is not in the package`);
  }
  if (report.category === 'ΤΕΚΜΗΡΙΩΜΕΝΟ ΤΕΧΝΙΚΟ ΕΛΑΤΤΩΜΑ') {
    const code = facts.some((f) => String(f.evidence).startsWith('code:'));
    const data = facts.some((f) => !String(f.evidence).startsWith('code:'));
    if (!(code && data)) errs.push('ΤΕΚΜΗΡΙΩΜΕΝΟ needs BOTH a code pointer and a data fact (read code ≠ tested production)');
  }
  const notSeen = Array.isArray(report.not_seen) ? report.not_seen : [];
  if (notSeen.length < 3) errs.push('not_seen («ΔΕΝ ΒΛΕΠΩ») needs ≥ 3 items — never empty');
  for (const m of MANDATORY_NOT_SEEN) if (!notSeen.some((x) => String(x).includes(m))) errs.push(`not_seen must include «${m}»`);

  // Times: every HH:MM mentioned must exist in the package's rendered Athens times (no invented hours).
  const allowedTimes = new Set((pkg.times_athens || []).map((t) => t.slice(-5)));
  for (const [p, s] of strings(report)) {
    if (WRITE_SQL.test(s)) errs.push(`${p}: contains write SQL`);
    if (FIX_VERBS.test(s)) errs.push(`${p}: proposes a fix/action beyond reading («${s.match(FIX_VERBS)[0]}»)`);
    if (SECRET.test(s)) errs.push(`${p}: secret-like string`);
    if (PII.test(s)) errs.push(`${p}: e-mail/phone-like string`);
    if (ELLIPSIS.test(s)) errs.push(`${p}: ellipsis — say the whole thing or say «δεν ξέρω»`);
    for (const t of s.match(/\b([01]\d|2[0-3]):[0-5]\d\b/g) || []) if (!allowedTimes.has(t)) errs.push(`${p}: time ${t} not in the package`);
  }
  if (JSON.stringify(report).length > 16000) errs.push('report > 16 KB');
  return { ok: errs.length === 0, errs };
}

// Reports come back from a model as text: take the LAST fenced ```json block (models may think aloud before it).
export function extractReport(text) {
  const blocks = [...String(text).matchAll(/```json\s*([\s\S]*?)```/g)];
  if (!blocks.length) return { report: null, err: 'no ```json block' };
  try { return { report: JSON.parse(blocks[blocks.length - 1][1]), err: null }; } catch (e) { return { report: null, err: 'json: ' + e.message }; }
}
