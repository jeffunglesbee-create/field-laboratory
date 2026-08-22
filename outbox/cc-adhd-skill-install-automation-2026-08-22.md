# Outbox — automate the i-have-adhd skill install + drift-verify

**Date:** 2026-08-22
**Ships:** `scripts/install-adhd-skill.mjs` (portable, self-verifying installer),
`check:adhd-skill` wired into the scheduled drift-sentinel, and the sibling-repo
CC-CMD.

The installer fetches the skill byte-verbatim from `ayghri/i-have-adhd`, writes
`.claude/skills/`, reads it back to confirm byte-identical, and refuses malformed
front-matter; idempotent, repo-agnostic, runnable via `curl … | node -`.
`--check` (in drift-sentinel) re-verifies the byte match each run, warning rather
than failing if the source CDN is briefly unreachable. Self-test 4/4.

**Note:** committed `[skip ci]` for the Actions budget; this outbox entry was
added retroactively to satisfy the per-commit source/outbox rule.
