# Session 2026-11-16: the no-launch trap, round 5 (items B10, B11, A0 to A7)

Branch `proof-r5-trap`, from `9043fa75` on `gate-items-2-7`. Area: `scripts/no-launch-check.mjs` and its entries in `scripts/mutation-check.mjs`. The record the fixes are written against is `outbox/review-round-5-findings-2026-11-16.md`. Threat model, as the guard states it at its NOT_WORK comment: a careless edit, not a deliberate one. One commit per finding group, in the order below; this note grows with each commit and is staged with every one.

Baselines at `9043fa75`, measured before any edit: `node scripts/no-launch-check.mjs --self-test` printed `35/36 checks passed` (the one failure, `the axis-check mutation needs build/`, needs `build/`, which only CI has, and is the same at every commit below); `python3 scripts/check-browser-gate.py --plain-commands` lists 70 commands.

How the red-on-purpose lines below were produced. `node scripts/mutation-check.mjs --only <id>` prints `PASS [<id>]` when the expectation fails under the mutation, and here its baseline is already red on the build/ check (`FAIL the unmutated tree passes every expectation`: 1 of 1 distinct expectation already failing), so on this machine a PASS line alone cannot tell a caught mutant from the standing failure. Each `PASS` line below is therefore paired with the self-test run of the same mutation on a scratch copy of the tree (the entry's `find` applied once, asserted unique, then `node scripts/no-launch-check.mjs --self-test`), listing the check that went red and is not the build/ one. On CI, where the baseline is green, the PASS line is the whole proof.

## Commit 1, A2: the label and the verdict are one function

Class: REACHABLE as a careless edit (the label had an expression of its own, `r.exit === 0 && !r.launches.length ? 'ok' : 'PROBLEM'`; the reviewer's `!r.exit` printed `ok [self-test] .../pk.mjs (exit null; 0 launch(es); 0.0 s)` for a SIGKILLed command, with the self-test at 35/36).

Change: `export const isClean = r => r.exit === 0 && r.launches.length === 0`, and the label (`show` in `measure`), the problems of `verdictOf` (`results.filter(x => !isClean(x))`) and the count in its closing line (`results.filter(isClean).length`) all read it. Nothing else says what a clean command is.

Fixtures: a LITERAL 6-row table for `isClean` (exit 0 clean; SIGKILL with exit null, exit 1, a launch, exit 3 with a launch, SIGTERM with a launch: each not); a measure() run of three commands (one SIGKILLs itself, one is clean, one swallows a launch) whose printed lines are read: the SIGKILLed one is `PROBLEM` and says `exit null`, the launching one is `PROBLEM`, the clean one `ok`, and each label equals `isClean` of its own result.

Red on purpose (self-test run of the mutation on a scratch copy, then the harness's own line):
- `no-launch-check-label-not-the-verdicts` (the label reads `!r.exit && !r.launches.length`, the reviewer's mutation made precise): 36/38, red by `THE LABEL OF A COMMAND IS THE VERDICT'S: a SIGKILLed command is PROBLEM (exit null)...`. `PASS  [no-launch-check-label-not-the-verdicts] the per-command label is the verdict's own isClean: a command killed by a signal is not ok`
- `no-launch-check-closing-count-not-the-verdicts`: 36/38, red by `A COMMAND KILLED BY A SIGNAL IS NOT A CLEAN COMMAND...` (the closing line counted it). `PASS  [no-launch-check-closing-count-not-the-verdicts] ...`
- `no-launch-check-isclean-ignores-launches`: 32/38, red by `MUTATION: one command that attempts a launch makes the verdict not ok, and names it` and `isClean: exit 0 with no launch is clean...`. `PASS  [no-launch-check-isclean-ignores-launches] ...`
- `no-launch-check-incomplete-ignored` and `no-launch-check-signal-exit-read-as-clean`, existing entries re-anchored on `isClean` (their old anchors, `else if (r.exit !== 0)`, no longer exist): 32/38 and 33/38, red by `MUTATION: a command that did not complete...` and `isClean: ...`. `PASS  [no-launch-check-incomplete-ignored] ...`, `PASS  [no-launch-check-signal-exit-read-as-clean] ...`

Self-test after: 37/38 (the build/ check is the one failure; 36 checks before this commit, plus the isClean table and the label fixture). `node scripts/mutation-check.mjs --anchors`: `checked 1668 of 1671 mutation anchors; 0 stale`.

## Commit 2, A6: the two heavy commands are not measured at the same time either

Class: REACHABLE as a careless edit, red-not-green (a timing flake, as the reviewer rated it): `for (const c of heavy) {...}` replaced by `await Promise.all(heavy.map(...))` left the self-test at 35/36 and the reviewer's probe printed `overlap=true`. The order fixture listed one heavy name only.

Change: none in the code (the loop is serial by construction; the fixture is what was missing). The order fixture now holds BOTH heavy commands (`scripts/mutation-check.mjs` and `scripts/mutation-lib.mjs` stand-ins, 300 ms each, each appending its own start and end to one shared log), listed apart among four others. Checks: the four others started only after BOTH heavy ones ended (was: after one), and one heavy interval ended before the other began.

Red on purpose:
- `no-launch-check-heavy-overlap` (new; the `for` replaced by `Promise.all`, the reviewer's 6e): 37/39, red by `THE TWO HEAVY COMMANDS ARE NOT MEASURED AT THE SAME TIME EITHER` and by nothing else (the old first-and-alone check stays green under it, as the reviewer saw). `PASS  [no-launch-check-heavy-overlap] the heavy commands are measured one at a time, not at the same time as each other`
- the two existing entries still red, now by checks that read both heavy commands: `no-launch-check-heavy-in-the-pool` 36/39 (`THE HARNESS'S COMMAND IS MEASURED FIRST AND ALONE`, and the new check), `no-launch-check-heavy-misses-lib` 36/39. `PASS  [no-launch-check-heavy-in-the-pool] ...`, `PASS  [no-launch-check-heavy-misses-lib] ...`

Self-test after: 38/39 (build/ check the one failure). Anchors: `checked 1669 of 1672 mutation anchors; 0 stale`.

## Commit 3, B11 and A3: every member of the stub through the default import; A7 named

Classes. B11 and A3's remaining variant are the same input: `import pw from 'playwright'` (the usual way to import a CJS package) read the ESM stub's `export default {...}`, which lists the six names a second time and had no check; `export default {}` left the self-test at 35/36 and a swallowed `pw.chromium.launch()` then read as 0 launches (`Cannot read properties of undefined (reading 'launch')`). REACHABLE: the member list is written twice in the stub, so drift between the two copies is an ordinary edit. A7 (a vendored COPY of the library outside `node_modules/playwright(-core)/`) is CONTRIVED, see below.

Change: checks only, plus the header. (1) The same 19 trap calls the namespace and require checks make, made through `import pw from 'playwright'`; each must leave its own line. (2) A LITERAL list of the six names (`_android`, `_electron`, `chromium`, `devices`, `firefox`, `webkit`): `Object.keys` of the namespace (the six and `default`), of the default export and of `require('playwright')` must each equal it, so `devices` (not a trap, an empty object) is pinned too. (3) The header's "not covered" list names A7: `require('<repo>/vendor/pwcore')` loads the real library, the hook stubs only the two package names and paths that land inside `node_modules/playwright(-core)/`.

Red on purpose:
- the reviewer's exact B11 mutation, `export default {}` (scratch copy, not a table entry): 38/41, red by `EVERY MEMBER OF THE STUB IS A TRAP THROUGH THE DEFAULT IMPORT too` and `THE STUB OFFERS EXACTLY THE SIX NAMES`.
- `no-launch-check-stub-esm-default-lacks-members` (default export `{ chromium, devices, _electron }`, the reviewer's 3g to 3i together): 38/41, red by both. `PASS  [no-launch-check-stub-esm-default-lacks-members] every member of the ESM stub is a trap through the default import too: the default export names the same six as the named exports`
- `no-launch-check-stub-esm-default-lacks-android` (only `_android` missing from the default export): 38/41, red by both. `PASS  [no-launch-check-stub-esm-default-lacks-android] the default export of the ESM stub has _android`
- the existing stub entries still red, and now also by the new checks: `no-launch-check-stub-connect-missing` 38/41, `no-launch-check-stub-cjs-webkit-missing` 38/41, `no-launch-check-stub-esm-firefox-missing` 21/41. `PASS  [no-launch-check-stub-connect-missing] ...`, `PASS  [no-launch-check-stub-cjs-webkit-missing] ...`, `PASS  [no-launch-check-stub-esm-firefox-missing] ...`

Self-test after: 40/41 (build/ check the one failure). Anchors: `checked 1671 of 1674 mutation anchors; 0 stale`.
