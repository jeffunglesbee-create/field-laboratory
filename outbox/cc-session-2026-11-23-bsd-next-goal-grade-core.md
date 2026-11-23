# CC session 2026-11-23 — the BSD next-goal grader's pure core (built, not yet run on the vendor's ledger)

**Spec:** `docs/CC-CMD-2026-11-22-bsd-next-goal-grade-against-field-timelines.md`. The owner answered both of its unblocks on 2026-11-23: the proof may run, and it runs from field-relay-nba's runner ("Yes, run from relays runner"). This entry pairs the source commit with its record (staged-outbox gate); the result is recorded in the spec and in a close-out when the run has happened.

## What this commit adds (all under `scripts/`, none wired into this repository's CI)

- `bsd-next-goal-grade-core.mjs` — the rule and the counting, PURE: imports nothing, reads no file, environment or network, returns counts. It is loaded by field-relay-nba's runner, in the same process as the BSD token, which is why the check asserts its purity of its source text.
- `check-bsd-next-goal-grade-core.mjs` — 10 scenarios, 57 assertions on synthetic calls and captures with hand-derived answers, plus 600 generated calls whose answers are known by construction; `--self-test` proves the check goes red on a grader that takes the wrong goal.
- `mutate-bsd-next-goal-grade-core.mjs` — 133 mutations of the core and the check's own gates; every one caught, none unapplied. Equivalent mutants are listed in its header with the reason, not counted.
- `fixtures/bsd-next-goal-grade-synthetic.mjs` — synthetic goal rows and ledger rows in the shape of the committed real examples (`data/bsd-flow-*`, field-relay-nba `outbox/bsd-next-goal-probe-latest.json`). Nothing in it is vendor data.

## The rule, in one paragraph

For a call with side S, outcome O and score_at_call (a, b): k = a + b. Goal rows are ordered by running total (never by position or minute); a capture whose goal rows lack a running score, or whose totals are not exactly 1..n, is not trusted and its calls are not applicable under a named reason. The resolving goal is the one with total k + 1; the capture's score before it must equal (a, b); FIELD's side is the side whose running score rose by one; the call agrees when FIELD's verdict (hit if that side is S) equals O. `is_home` is not used for the side. Every call is placed exactly once.

## Not yet verified

That the real captures satisfy the rule's premises (running scores on every goal row; totals 1..n) is counted by the first live run, not assumed: the artifact carries the premise counts. An independent adversarial review of the rule, the checks and the runner is under way before that run (the first version of the census was wrong because a premise had been tested against the code and not against the data).
