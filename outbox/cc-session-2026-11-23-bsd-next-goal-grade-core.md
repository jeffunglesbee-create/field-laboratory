# CC session 2026-11-23 — the BSD next-goal grader's pure core, revised after an adversarial review (built, not yet run on the vendor's ledger)

**Spec:** `docs/CC-CMD-2026-11-22-bsd-next-goal-grade-against-field-timelines.md`. The owner answered both of its unblocks on 2026-11-23: the proof may run, and it runs from field-relay-nba's runner ("Yes, run from relays runner"). This entry pairs the source commits with their record (staged-outbox gate); the result is recorded in the spec and in a close-out when the run has happened.

## What is under `scripts/` (none of it wired into this repository's CI; the relay's workflow runs the check and the harness)

- `bsd-next-goal-grade-core.mjs` — the rule and the counting, PURE: imports nothing, reads no file, environment or network, returns counts. Rule version 2026-11-23.3. It is loaded by field-relay-nba's runner, in the same process as the BSD token; the check asserts the purity of its source text, which is a tripwire and not a sandbox.
- `check-bsd-next-goal-grade-core.mjs` — 22 scenarios, 200 assertions: hand-derived answers on synthetic calls and captures, a reason-precedence table, running-total defects at late positions, generated calls with known answers (800, 585 of which reach a grade), the diagnostics, and TWO REAL committed captures (`data/bsd-flow-*-incidents.json`), hash-pinned to `data/PROVENANCE.md`. `--self-test` proves the check goes red on a grader that takes the wrong goal.
- `mutate-bsd-next-goal-grade-core.mjs` — 430 mutations (the author's and the second review's) of the core and the check's own gates, every one caught, none unapplied. Equivalent mutants are listed in its header with the reason, not counted.
- `fixtures/bsd-next-goal-grade-synthetic.mjs` — synthetic goal rows and ledger rows in the shape of the committed real examples. Nothing in it is vendor data.

## The rule, in one paragraph

For a call with side S, outcome O and score_at_call (a, b): k = a + b. Goal rows are ordered by running total (never by position or minute); a capture whose goal rows lack a running score, or whose totals are not exactly 1..n, is not trusted and its calls are not applicable under a named reason. The resolving goal is the one with total k + 1; the capture's score before it must equal (a, b); FIELD's side is the side whose running score rose by one; the call agrees when FIELD's verdict (hit if that side is S) equals O. `is_home` is not used for the side (its agreement with the rise is tallied). Every call is placed exactly once.

## What the review changed (two rounds, 71 agents on 2026-11-23: independent reviewers and a skeptic per blocker or important finding)

The first version was not safe to run. Found and fixed: the grader had never been run on a real capture (a hash-pinned real-capture scenario was added); agree and disagree were tallied flat, so a join in doubt could not be told from a clean disagreement (they are now tallied by the distance from the resolving goal to the ledger's `resolved_minute`, with stoppage-time goals told apart, and distinct goals are counted); a vendor `goal_type` of `__proto__` rewrote `Object.prototype` and the tally (tallies are now prototype-free and goal types are sanitised); the premises the spec asks for were not what the artifact counted (G1 to G6 are now counted); 62 of 103 survivors of the reviewers' own mutants were blind spots in the check (closed, and the harness grew from 133 to 225 mutations); an item with no key silently shared another match's capture (fixed).

## Not yet verified

That the real captures satisfy the rule's premises (running scores on every goal row; totals 1..n) is counted by the first live run, not assumed: the artifact carries the premise counts. The second review found no wrong grade; it found 81 behaviours the check could not see (now pinned, and its 159 mutants are in the harness), a premise tally that mislabelled extra-time captures (now `not evaluated (extra time)`), ties and order read from the nominal minute (now the clock, minute and added time), and that the grade job held a write credential (the workflow now commits in a separate job).
