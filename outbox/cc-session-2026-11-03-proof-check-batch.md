# Session 2026-11-03 — proof-check: one batched compile (`docs/CC-CMD-2026-11-03-proof-check-shards.md`, DONE)

Session: https://claude.ai/code/session_017RuhXKQdbuZ7W9Q7sR1Vrm

## Result

| | before | after | where read |
|---|---|---|---|
| the gate row `doc claims are compiler-verified, not prose` | 729 to 760 s (four sharded gates), 733 to 776 s (three unsharded) | **15 s** | ledger line `8b1ee4425697-7c985ab97947`, `rowSeconds` |
| the gate step of `verify-full` | 975 to 1869 s | **354 s**, 530/530, `failing: []` | same line |
| the whole `verify-full` run | 19 min 19 s and 32 min 39 s | **7 min 5 s** (17:05:22 to 17:12:27Z) | run 41680758770 |
| the eight mutation shards | 3 min to 31 min | 3 min 28 s to 6 min 10 s | the run's jobs |
| the same row on the 4-core dev container | 133 builds at about 12 s under load | 84 s for the whole run; the batch compile is 12 to 16 s | local runs, `/tmp/proof-quiet.log` |

The scored run is `verify-full` 41680758770 on `proof-batch` at tree `8b1ee44` (dispatched on the branch, `main` was `25840c2` throughout, so the landing is a fast-forward).

## What was built

Task 0 changed the design. The filed CC-CMD sharded the 134 cases over a CI matrix. Probing the premise (a case costs a compile) found it false for type errors: the F# compiler keeps checking after an error in one function. So `scripts/proof-check.mjs` injects all 133 cases as their own `__proofN` functions, compiles ONCE with the error cap lifted, and places each error in the case whose lines it falls in. Sharding was not built.

- A real case passes only when the BATCH confirms it. Every unconfirmed case is also compiled alone by the old method, only to say why; a case that passes alone but was not confirmed fails the run (the batch is blind to it). No quiet fallback to serial speed.
- Two controls in every run (a case that compiles, a case rejected with another code): each must fail for its own reason, and each probes the attribution (the clean one must have no error placed in its lines, the other some).
- A batch that reports no error at all is repeated once, visibly; twice is a failing check with the output's tail.
- `--only`, `--out`, `--max-errors` refuse an empty value, a bare trailing flag and the `--flag=value` form (exit 2). The old `--only` ran the full suite in all three cases, silently.
- `--self-test` 7 to 24 clauses.

## Commits

`30281bc` batch built; `439d5b9` real case needs the batch, controls assert why, lookbehind on the file name; `2d9e57b` sweeps and oracle; `727fc71` second-review fixes, sharper controls, dead-batch repeat, CC-CMD rewritten; `4be022e` three stale cost comments; `8b1ee44` sweep v3; `a3ac790` and `4b28863` are the gate's own ledger commits; the landing commit, its `verify` and `deploy` runs are at the bottom of this file.

## Evidence

- ORACLE (the old method run over all 133 cases in a throwaway copy, each case's SET of error codes, against the batch's): **identical for 133 of 133**; the stated code present 133 of 133 both ways; 6 cases carry more than one code. `outbox/proof-check-oracle-2026-11-03.json`, `outbox/proof-check-sweeps-2026-11-03.txt`.
- RULE 90 SWEEPS: 18 mutations of the pure half, 18 caught; 20 mutations of the live run, each as expected (three are expected to go green and say what that proves: L13 puts the quiet fallback back, N1 is a batch that dies once and is repeated, N3b removes the sharpness check). One mutation survived in the first live sweep (L3, `rejected = true`): an equivalent mutant on the verdict, which exposed that the controls did not assert WHY they failed; they do now. Another (L7, error cap not lifted) went green after 1030 s: that is the design flaw the real-case rule fixes.
- PARSE-ERROR PREMISE measured, not assumed: an unclosed expression in one injected function, then an ordinary FS0001 in the next: only FS0058, FS0010, FS3156 and FS3118 came back. A parse-class proof case cannot be batched.
- REVIEW 1 (45 agents, five dimensions, two skeptics per finding): 1 finding confirmed (a done condition named the wrong workflow). 19 refuted as "no wrong verdict", of which these were right anyway and are fixed: a quiet fallback to serial speed, controls that did not check why they failed, a `Scoreboard.fs` suffix match, three false comments.
- REVIEW 2 (47 agents, delta plus a fresh pass): 17 confirmed, mostly false sentences in comments, output text and the CC-CMD; fixed. Three behaviours worth fixing were also fixed: a dead batch compile showed only 133 identical failures, the `--out` JSON said `ok` for a failed case, and `--only` still fell back silently.
- Counts: 133 cases, not 134 (`grep -h "<!-- proof:"` also counts the prose mention at `docs/ODDS-PROOF.md:290`; the script's parser never did). 141 checks in a full run.

## Adjacent findings, not changed here (Rule 69)

- `scripts/proof-check.mjs:96` points to a function `livenessOf` that does not exist (the comment predates this change).
- A SIGINT or SIGTERM sent while a build is running is not handled until the build returns (`execSync` blocks the event loop); the refuse message's `kill <pid>` therefore works late. Reproduced by a reviewer with a shim; it predates this change.
- `restore()` removes the state directory before the registry phase starts; a SIGKILL during that phase leaves `src/Desk.fs` mutated with nothing to heal from. Predates this change.
- The baseline build and the two controls have no crash repeat; only the batch does. The F# compiler crashed about one fresh full compile in a hundred on the runners (`docs/CC-CMD-2026-11-03-fable-compiler-crash.md`); `dotnet build` was not measured separately.

## What this does not prove

- That the CI runner's per-compile cost matches the dev container's: the container measured 12 to 14 s for a failing compile, the runner 5.8 s. The CI figure is the ledger's 15 s.
- That the 133 cases are the right 133.
- That a parse-class case can be added: it cannot, and the run fails loudly if one is.
- `verify` does not run this script; the proof of this change is the `verify-full` run above, not a green `verify`.
