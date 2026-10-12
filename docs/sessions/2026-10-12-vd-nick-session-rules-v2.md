# 2026-10-12 · vd-nick · session rules v2

- From Cowork's review of PR #38, decided with Nick: parallel work is allowed, one branch per topic; "one topic per session" dropped; whose work is whose shows in the branch prefix (`vd/` for Valuedriven), the session file name and the Now line.
- The shared log became one file per session in `docs/sessions/`, so parallel PRs do not collide; the Now block lost its "Live" part, which went stale within hours.
- Rule 5: the backup check before database changes is paused until an off-laptop backup exists. Rule 6 allows worktrees. Rule 7 allows the "Create pull request" link while `gh` is not installed.
- Left: Dimitris installs `gh` (`brew install gh && gh auth login`) and corrects his Now lines; who gets called when production breaks.
