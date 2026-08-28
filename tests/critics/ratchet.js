// One-way ratchet for the recorded baselines that CAPTURE mode rewrites.
//
// WHY this exists: `npm run critics:capture` re-runs every unit and overwrites
// docs/redesign/error-baseline.json and semantics-baseline.json with whatever
// it observes. Nothing stopped that from writing a LOOSER file than the one it
// replaced. So the single command a person reaches for when a contract needs
// refreshing ("just re-capture") would also bless, in the same silent step, a
// brand-new console error and a screen that started printing €0 where it used
// to print a dash — the exact regressions critics #5 and #6 exist to catch.
// Recording a violation as "known" is a decision; it must never be a side
// effect of a convenience command.
//
// Mechanism, deliberately the smallest one that actually prevents it: capture
// compares what it is about to write against what is already on disk, and if
// the new file is looser in ANY of the recorded dimensions it throws, naming
// every loosened item. Widening then requires the human to re-run with
// CRITICS_WIDEN=1, which is a sentence they have to type and can be seen in a
// shell history and in CI config. Narrowing (fewer errors, fewer zero-cells)
// always passes without a flag — that is the ratchet turning the right way.
//
// NOT a git-diff check and NOT a lock file: those either need the working tree
// to be clean (it is not, mid-redesign) or add a second source of truth for
// the same numbers, which principle #3 in CLAUDE.md forbids.

const FLAG = 'CRITICS_WIDEN';

// `widened` is a list of human-readable lines, each one thing that got looser.
// Callers build it; this only decides what happens next.
function guardWidening(what, widened) {
  if (!widened.length) return;
  const lines = widened.map(w => `  · ${w}`).join('\n');
  if (process.env[FLAG] === '1') {
    // Loud even when allowed: the flag permits the widening, it does not hide
    // it. This line is the record of what the human agreed to.
    console.log(`\n⚠ ΧΑΛΑΡΩΣΕ το ${what} (${FLAG}=1):\n${lines}`);
    return;
  }
  throw new Error(
    `${what}: η καταγραφή θα ΧΑΛΑΡΩΝΕ το baseline — δεν γράφτηκε τίποτα.\n${lines}\n` +
    `Αν είναι σκόπιμο, ξανατρέξε με ${FLAG}=1. Αλλιώς είναι υποχώρηση, όχι νέα βάση.`
  );
}

module.exports = { guardWidening, FLAG };
