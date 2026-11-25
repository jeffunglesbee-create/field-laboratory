# CC session 2026-11-25 — why `verify` was red, and the two harnesses that were not copy-based

**Task:** the owner's "clean up reds and ESPN core API mirror failures" (2026-11-25). Relay half: `outbox/cc-session-2026-11-25-espn-reference-grade-runner.md` (the mirror's golf rule) in field-relay-nba.

## What was red, and the one cause each had

- **`verify` step "The mutate scripts break a copy, never the tracked tree" (`npm run check:mutate-copy`).** Red since the BSD next-goal grader's harness landed (the other session's records name it "log step 71, the BSD grader's": 45442481067, 45478103493, 45535289999), and red again with the ESPN reference grade's. Every `scripts/mutate-*` file is held to seven clauses (`scripts/mutate-copy-check.mjs`). Measured locally with `npm run check:mutate-copy`:
  - `mutate-bsd-next-goal-grade-core.mjs`: printed no `N of N mutations caught` line, no `positive control: ...` line, and ran its check from the repo, so a copy that cannot run could not stop it. Clauses 1 to 4 failed.
  - `mutate-espn-reference-grade-core.mjs` (new today): no `positive control` line, the same missing enforcement, and it left `espn-ref-mutate-*` directories in `$TMPDIR` (clauses 2, 3, 4, 7).
  A red `verify` skips the `deploy` workflow_run, so the published build stayed at `e290b24`, behind `49f53f0`, and `live-check` failed at "The deploy landed" (run 45663912109). One cause, three symptoms.
- **`guards` and `verify` step 69 ("No script a workflow depends on became unreachable")**: the three ESPN core scripts were not in `docs/unreachable-scripts.txt`. Declared in `8be63509`; guards run on it is green; step 69 passes in verify run 45672033558.

## What changed

- Both harnesses now make the mutation on a copy of `scripts/` in a real-path temp directory removed when the script ends, run the check FROM THAT COPY with `--self-test` (the BSD check's own self-test; for the ESPN check the flag is accepted and changes nothing, documented in its header), print `positive control: the unmutated copy passes`, stop with `UNMUTATED` in the line when the copy is red or silent, and print `N of N mutations caught.`
- `node scripts/mutate-copy-check.mjs --only bsd-next-goal-grade-core` and `--only espn-reference-grade-core`: 9 of 9 checks each (all seven clauses). The BSD harness still catches 430 of 430, the ESPN harness 78 of 78.

## Result (read from the runs, 2026-11-25)

- `verify` run 45676518707 on `bc6059d6`: **success** (the first green on main since the BSD grader's harness landed; it ran the whole `check:mutate-copy`, so `weather-availability`'s `build` error was local to a container with no `build/`).
- `deploy` run 45678111888 (workflow_run on that verify): **success**; the published build is no longer behind.
- `live-check` on `292c7b9` (18:46Z): **success**, so "The deploy landed" passes; it was red on `b3127b7` (45663912109) only because verify had skipped the deploy.
- `guards` on `8be63509` and `bc6059d6`: success.

## Not verified

- Nothing about the three reds is open. The owner's decision on Task 3 of the independent-reference CC-CMD is unrelated and still waits.
