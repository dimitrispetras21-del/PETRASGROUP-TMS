# Audit Findings

Drop one Markdown file per issue here, naming `YYYY-MM-DD-short-slug.md`.

Examples:
- `2026-05-08-cascade-delete-misses-pa.md`
- `2026-05-09-greek-char-in-csv.md`

Use the template in [`../TESTING.md`](../TESTING.md) "How to report findings".

The owner reviews this folder weekly. Confirmed issues migrate to
[`../KNOWN_ISSUES.md`](../KNOWN_ISSUES.md) under the appropriate severity.
Fixed issues stay here as a record of what was found.

---

## Conventions

**Severity**:
- 🔴 critical — security, data loss, can't deploy
- 🟠 high — silent misbehaviour, major UX
- 🟡 medium — known limitation, monitor
- 🟢 low — cosmetic, nice-to-have

**Status** (add to top of each finding):
- 📥 reported (just submitted)
- 🔍 triaged (acknowledged, in queue)
- 🔧 fixing (active work)
- ✅ fixed (commit linked)
- ❌ won't fix (rationale documented)
- 🤔 needs discussion

---

## Index

(Empty — first finding submission populates this.)
