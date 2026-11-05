# Session record: the HEAD-moved refusal says what is true of each path

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 10 item 7 (`scripts/mutation-check.mjs` only). Assignment H3, commit 1 of 4.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Probe, before building (Rule 100)

On this clone, 2026-11-05, in a scratch git repository holding the real scripts: `MUTATION_KILL_AT=world-applied node scripts/mutation-check.mjs --only outbox-stub` (exit 137, write-ups are stubs), then `git checkout -- outbox` (write-ups equal the stash again, `git status` empty), an unrelated commit so HEAD moves, then `--heal`. Output: `a path it touched is neither as it was nor as the mutation left it (outbox/cc-session-2026-11-05-one.md, outbox/cc-session-2026-11-05-two.md): HEAD has moved since the kill, so a path that now matches HEAD cannot be told from one that was put back ... Put back from .mutation-state/world/outbox-stub only the paths that are still as the mutation left them`. The first clause is false of those paths, and the advice does not apply to them. The premise holds.

## What was built

`healAt`, the `diverged` branch for a world mutation: the message only. `planHeal`, `pathState`, `worldState`, `strayPaths` and the decision to refuse are untouched. With HEAD moved, a stray path the snapshot does not list matches HEAD; that is where a path put back ends up and where a committed stub or edit ends up, and the marker cannot tell them apart. Such paths are now named under `HEAD has moved since the kill and a path it touched now matches HEAD (LIST), ... so the two cannot be told apart` with `Compare ... with <stash>`; an edited path keeps `neither as it was nor as the mutation left it (LIST): it changed after the kill`; both are named when both are present. A `list` helper (six names, then `and N more`) replaces the inline expression.

**One departure from the probe's design, on purpose.** The probe's tail dropped the sentence `Put back from <stash> only the paths that are still as the mutation left them`. That advice still applies to a touched path that is not listed (still a stub), so it stays, and a compare sentence is added only when a path matches HEAD. Consequence: the existing anchor of `world-refusal-offers-the-restore-command` (`its restore command would overwrite the ones listed.`) did not change and needed no re-anchor; `world-refusal-does-not-name-the-path` did (its inline list became `list(edited)`).

**Not done:** telling a restored path from a committed stub. That needs the marker to record each `before` blob, a behaviour change, not a message.

## Verified

- Self-test: 146 clauses before, 149 after (3 new). Clauses written first, run on the unfixed message: 144/148, the two direct clauses FAIL (the other two are the nested self-tests those clauses start). Fixed: 149/149.
- A guard in my own new code (`moved ?` in the at-HEAD list) survived a hand mutation at 148/148: nothing asserted that the message must not say HEAD moved when it had not. A third clause does; the same mutation is then 146/149, that clause FAIL.
- 3 new table entries plus the re-anchored `world-refusal-does-not-name-the-path` and the unchanged `world-refusal-offers-the-restore-command`, through the harness (`--ids`): 6/6 checks passed (5 mutations caught, plus the baseline), tree restored. By hand, the clauses that go red: `head-moved-refusal-calls-a-path-at-head-edited` 3 (the existing committed-stub clause and both new HEAD clauses); `-lists-a-path-at-head-as-edited` 2; `-says-head-moved-when-it-did-not` 1; `world-refusal-does-not-name-the-path` 3. Each also turns the two nested self-test clauses red.

## Not covered, stated

- The message reads a snapshot that lists only paths that differ from HEAD; a path at HEAD that really was put back and one that was committed as a stub print the same sentence. That is what the message now says, and it is all it can say.
