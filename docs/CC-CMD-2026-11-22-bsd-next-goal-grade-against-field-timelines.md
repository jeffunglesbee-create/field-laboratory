# Claude Code Command — grade BSD's published next-goal calls against FIELD's own goal timelines (counts only, rule fixed before the run)

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory owns the proof (LAB-FIRST-A); the ledger can be read only with a BSD token, see "What only the owner unblocks"
**Filed:** 2026-11-22 by CC, as the follow-on the census CC-CMD owes (Rule 87.4), from the census result
**Type:** A (measurement) — no feature, no surface, nothing shown or pushed (ADR-002 Rules A and F)
**Status:** FILED 2026-11-22, not started. It is a verdict on the vendor; the owner ordered the census counts-only. Blocked on the two owner decisions below.

---

## Why this exists

`field-relay-nba/docs/CC-CMD-2026-11-22-bsd-next-goal-ledger-census.md` (DONE, run 45065701482, artifact `field-relay-nba/outbox/bsd-next-goal-census-latest.json`) counted how much of the vendor's
published next-goal ledger (`GET /api/v2/next-goal/calls/`, 1,746 calls 2026-08-05 to 2026-11-22) FIELD's own goal timelines (`bsd/{slug}/{id}/incidents.json` in R2) can grade:
**370 calls (21.2%)**, in nine leagues, 236 matches (hit 280, miss 90 by the vendor's `outcome`). For all 370 the nearest goal in FIELD's capture is at distance 0 from the ledger's
`resolved_minute`, so the join is clean. The probe before it (`field-relay-nba/docs/CC-CMD-2026-11-22-bsd-next-goal-probe.md`) reproduced the vendor's 73.6% from its own counts (73.43%) and found the gate open for the relay's token.
What nobody has measured: whether the vendor's `outcome` agrees with what FIELD's own record of the match says happened next.

## Related, read before filing (BUILD-ON-A)

Searched 2026-11-22 by content (`next-goal`, `next goal`, `next to score`, `nextgoal`) in this repo's `docs/`, `outbox/` and `scripts/`: no hit. `BSD_API_TOKEN` is referenced by no file in this repo's `.github/` or `scripts/`
(whether the repository's Actions secrets hold it cannot be read from a session). Nothing here undoes or works around a ruling or hold: no `src/` change anywhere, nothing pushed or displayed, the relay `src` hold (2026-11-24) and
the CFL VOID window are untouched.

## Premises, and the one command each (Rule 100)

| # | premise | what refutes it | answered by |
|---|---|---|---|
| G1 | every gradeable call row carries `minute`, `side` and `score_at_call` | one of the 370 without one | a count over the 370 (the census artifact does not hold it) |
| G2 | goal rows carry the running `home_score` and `away_score` after the goal (so the scoring side is read from which score rose, not from `is_home`, which an own goal may flip) | a goal row in the 246 captures without both | a count over their goal rows |
| G3 | a call's `score_at_call` total equals the number of goals the capture holds before the call | a capture whose running score at the call's minute differs from `score_at_call` | a count, reported as the join's quality before any grade |
| G4 | goals can be put in time order | two goals at one minute (order then comes from the running score, not the minute) | a count of captures with a tie |

## The rule, fixed before the run (so the run cannot choose it)

For each of the 370 gradeable calls: let k = `score_at_call.home + score_at_call.away`. FIELD's resolving goal is the (k+1)th goal of the capture in time order (ties broken by the running score). FIELD's side is the
side whose running score rose on that goal. FIELD's verdict is `hit` if that side equals the call's `side`, else `miss`. **Agreement** is FIELD's verdict equal to the ledger's `outcome`. Counts reported: agree, disagree
(by capture state, full time or in play, and by league directory), and every call the rule cannot be applied to, each under one reason. A disagreement is a count and a named reason, never explained away (Rule 77).
No grade of the vendor's probabilities, no Brier, no calibration: those need a rule of their own and are not this document.

## Tasks

0. **Probe block (Rule 87.1).** Re-run the census's counts at current HEAD and read G1 to G4 with one command each on a runner; put their counts in the artifact before any grade. If G2 fails, the side rule changes and this document is re-filed, not patched.
1. **Build** `scripts/` in this repo: the grader, a check on synthetic ledger rows and captures, a mutation harness (the rule's boundaries: k, ties, side, own goals, full time versus in play), written before the check is trusted (Rule 90). Counts-only artifact: no ledger row, team, player or event id leaves the runner (licence v4.0 section 4; this repository is public).
2. **Run** once on a runner. Coverage line with every denominator (Rule 91): `graded N of 370 gradeable of 1,746`.
3. **Record** the result here, in HANDOFF and a session doc (Rule 67).

**Done condition (Rule 89):** an artifact in `outbox/` with `reachedTarget` true, G1 to G4 counts, agree and disagree counts summing with the not-applicable counts to 370, and its mutation table green.

## What the result will not say

That FIELD's captures and the vendor's ledger both come from BSD is the census's finding (370 of 370 `resolved_minute` values are goal minutes in FIELD's capture), so agreement here is **not an independent grade**: if the vendor computes `outcome` from the feed FIELD captured, agreement is expected
and disagreement is the finding. An independent reference (a second source's goal timeline) is out of scope and would be its own CC-CMD.

## What only the owner unblocks (Rule 74)

1. **That the proof may run.** It is a verdict on the vendor; the census was ordered counts-only. Unblocked when the owner says to grade.
2. **Where the ledger token lives.** The ledger needs `BSD_API_TOKEN`; the relay's runner has it and this repository's scripts do not reference it. Either the owner adds the secret to this repository's Actions, or the run executes in field-relay-nba's runner with the grader committed here
   and called from there (the census's own arrangement). Unblocked when the owner picks one; verify with a dispatch whose first step prints `tokenPresent` from the artifact.

## Not in scope

The relay's capture of untracked leagues (1,355 of the 1,746 calls: `bsd-live-capture-path`), any surface, route, push or display of a next-goal read, the plan and renewal decisions, anything in `src/`.
