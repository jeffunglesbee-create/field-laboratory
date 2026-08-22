# Outbox — automate the cross-repo skill install on a runner

**Date:** 2026-08-22
**Ships:** `.github/workflows/adhd-skill-sync.yml` + `scripts/sync-adhd-skill.mjs`
— install the i-have-adhd skill into field-relay-nba and jubilant-bassoon from a
GitHub runner via the Contents API, committing only when the file is absent or
drifted (idempotent, direct commit, no PR).

Leaving the sibling install as a curl for a human is un-automated terminal work;
the runner does it. Dispatch-only (no CI until asked), dry-run default. The one
thing a runner cannot self-provision is a credential for another repo, so it
needs a `SIBLING_REPO_TOKEN` secret. Self-test 5/5 (create/update/skip decision,
base64 round-trip, front-matter gate).

**Note:** committed `[skip ci]` for the Actions budget; this outbox entry was
added retroactively to satisfy the per-commit source/outbox rule.
