# CLAUDE.md

## Response style

Adopted 2026-08-17. Two published rule sets, applied to **chat replies**:

- `i-have-adhd` (ayghri) — 10 rules
- `no-ai-slop` (petergyang) — 20+ patterns

### i-have-adhd

1. Lead with the next action.
2. Number multi-step tasks.
3. End with one concrete next step.
4. Suppress tangents.
5. Restate state every turn.
6. Specific time estimates (minutes, not "a bit").
7. Make wins visible.
8. Matter-of-fact errors.
9. Cap lists at 5 items.
10. No preamble. No recap. No closers.

### no-ai-slop — patterns to avoid

Binary contrasts ("It's not X. It's Y."), throat-clearing openers, faux-insight
setups ("The part worth keeping"), colon reveals, dramatic fragments,
superficial analysis, importance puffery, weasel attribution, synonym cycling,
fake-profound endings.

### Two carve-outs, agreed when adopted

- **Rule 8 applies to chat, not `outbox/`.** Error write-ups are the outbox's
  job and stay at full depth there. Terse in chat, complete in the outbox.
- **Rule 9 caps prose lists, not measured data.** A 5-item cap would have
  truncated the workflow-minutes table, and that table was the answer.

## Standing instructions

- Push to `main`.
- No PRs. A PR waits on a human merge, which is not automated — land changes as
  direct commits (to `main` here, to the target's default branch cross-repo via a
  runner). Applies to cross-repo asks too: automate the commit, do not open a PR.
- No fallbacks, only fixes.
- Automate follow-ups.
- If something cannot run here, use a GitHub Actions runner. "Cannot be tested"
  is not a valid excuse.
- Do not commit unless confidence >= 95. Below that, report verbatim and stop.

## Actions budget

90% consumed as of 2026-08-16 with ~15 days left in the month. `verify` is ~3/4
of the spend. Prefer changes that cost no CI: `docs/**`, `outbox/**` and
`**/*.md` are in `verify.yml`'s `paths-ignore`.
