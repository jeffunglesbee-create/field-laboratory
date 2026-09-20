# Claude Code Command — Correct the stale `CLOUDFLARE_API_TOKEN` line in README.md

**Date:** 2026-09-07
**Repo:** field-laboratory
**Branch:** main — commit directly, do not create a feature branch or PR
**Type:** B (bug fix — documentation correctness)
**Why this is a CC-CMD and not a chat commit:** `README.md` is not in the
WRITE_ALLOWLIST (`docs/`, `HANDOFF.md`, `CODE_MAP.json`). Chat is structurally
unable to make this edit.

**Status:** CLOSED. Executed 2026-09-07; `outbox/cc-session-2026-09-07-readme-token-claim-correction.md`
records it. `README.md` now states the secret is installed and pastes the
verbatim Courier response rather than asserting it.

## CONTEXT

The final line of `README.md` reads:

> Deployment needs a `CLOUDFLARE_API_TOKEN` secret that only a human can add —
> see `docs/DEPLOY.md`.

The "only a human can add" clause is false and has been since 2026-08-10, when
the Courier OIDC bootstrap installed the secret programmatically with no human
entering a credential. Execution record:
`field-relay-nba/outbox/cc-session-2026-08-10-laboratory-secret-bootstrap.md`,
status DONE, confidence 96.

Verified independently on 2026-09-08:
`https://field-laboratory.jeffunglesbee.workers.dev` returns HTTP 200, 47,101
bytes, `<title>FIELD Laboratory — desk scoreboard</title>`. The page is deployed.

**A token is still genuinely required.** Do not rewrite this to say no secret is
needed. The false part is the agency claim, not the requirement.

**Why it matters more here than in most repos:** field-laboratory has no
`HANDOFF.md`. The README *is* the handoff record, so a stale line in it is read
by the next session as current state — which is exactly what happened during the
2026-09-07 queue audit, where the README was read as evidence the bootstrap had
not completed.

## TASK 0 — PROBE

1. Read the real current final line of `README.md`. If it has already been
   corrected, stop and report that — do not assume this document is current.
2. Re-verify the deployed page returns 200 before asserting it in prose. If it
   does not, stop: the correction's premise has changed and this needs rethinking
   rather than editing.

## TASK 1 — Replace the line

Replace it with text that (a) keeps the requirement, (b) states the secret is
installed, (c) names how and when it was installed, (d) cites the outbox record,
and (e) dates the live verification. Do not overstate: cite the confidence score
as recorded rather than presenting it as certainty.

## TASK 2 — Name the failure mode in the README's own vocabulary

The README already maintains a table of verification failure shapes, and already
documents one instance of a negative result being kept past the evidence that
retired it (the `Verify.fs` / `CHECK-PROOF.md` paragraph, stale for 25 days).
This is a second instance of the same shape, 29 days stale.

Add a brief note recording it as such. The README's credibility rests on it
reporting its own misses; a silent correction would be the same error again.

## TASK 3 — Consider a real `HANDOFF.md` (report, do not build unprompted)

`HANDOFF.md` is in the WRITE_ALLOWLIST for this repo and does not exist. Assess
in the outbox whether the README should keep carrying handoff duty. Recommend;
do not create it in this session without Jeff's decision — that is a governance
change, not a doc fix.

## DONE CONDITION

- `README.md` final section pasted verbatim in the outbox, showing the corrected
  text.
- Task 0.2 probe result recorded (real HTTP status and byte count).
- Commit SHA recorded.

## TASK 4 — Outbox manifest (last task)

`outbox/cc-session-2026-09-07-readme-token-claim-correction.md` with the probe
output, the before/after text, the commit SHA, and the Task 3 recommendation.
