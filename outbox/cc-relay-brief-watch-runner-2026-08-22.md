# Outbox — a self-closing brief-defect ticket on the relay, cross-repo, no PR

**Date:** 2026-08-22
**Ships:** `scripts/relay-brief-watch.mjs` + `scripts/soccer-brief-defect.mjs`
(shared scanner), wired into the scheduled drift-sentinel.

Reads live EPL briefs over the relay HTTP API, scans them with the shared
soccer-brief-defect scanner, and via the GitHub API files/updates an issue ON
field-relay-nba carrying the verbatim offenders + enumerated failing rows —
closing it itself the first run every EPL brief is clean. Direct issue
write/close, never a PR. Rides drift-sentinel (no new CI), non-fatal, and skips
cleanly when `SIBLING_REPO_TOKEN` is absent. Self-test 10/10.

**Note:** committed `[skip ci]` for the Actions budget; this outbox entry was
added retroactively to satisfy the per-commit source/outbox rule.
