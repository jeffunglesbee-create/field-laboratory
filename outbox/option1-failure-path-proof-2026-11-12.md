# Option 1, the failure path measured on a runner (2026-11-12)

Question (Rule 89, with its artifact): when `Install Chromium` fails in the `verify` job of `.github/workflows/verify.yml` as edited by `f41b9d3`, do the 20 steps that need a browser skip, do the 70 that do not still run, is the job red, and does it say why? (Counting: 90 of the 95 steps after the install have a `run` script and are tabulated, 20 + 70. The other five are the four `upload-artifact` steps and the final step, which has a script too and is the red one. The guard prints 95 steps read for this reason; before the six self-tests were split out of their gated steps it was 20 browser, 75 browser-free, now 20 and 76.) And what does a step killed by its `timeout-minutes` conclude as, the case the final step's `!= 'success'` was written for?

Method: two throwaway branches cut from the edited workflow, never merged (`proof-fastfail` at `a9ced65`, `proof-timeout` at `ee12972`). **Both are still on the remote**: this sentence first said they were deleted, and a review found them there. Deleting a remote branch is refused from the authoring sandbox (`git push origin --delete` fails with `send-pack: unexpected disconnect`, every time, one branch at a time too), so someone who can must delete them; each carries a sabotaged `verify.yml` and can be dispatched, each with the install broken on purpose and one appended step that reads this job's steps from the Actions API and prints them against `outbox/verify-step-browser-classification-2026-11-12.json`. `verify.yml` dispatched on each at 02:34Z.

| | run 1: a broken download host | run 2: the install exceeds its limit |
|---|---|---|
| run | `verify` 43142364471, branch `proof-fastfail` | `verify` 43142368299, branch `proof-timeout` |
| sabotage | `PLAYWRIGHT_DOWNLOAD_HOST=https://playwright-download.invalid` on the install step | `run: sleep 600 && npx playwright install chromium` with `timeout-minutes: 3` kept |
| `Install Chromium` | 3 s (02:35:27 to 02:35:30); the API shows its conclusion as `success` because of `continue-on-error: true` | killed at its 3-minute limit (the run took 7 minutes against 4); the same API conclusion |
| the final step's message | `The Chromium install did not succeed (outcome: failure)` | `The Chromium install did not succeed (outcome: failure)` |
| steps that need a browser (20) | `{'skipped': 20}` | `{'skipped': 20}` |
| steps that need none (70) | `{'success': 70}` | `{'success': 69, '-': 1}`: the one is `Status read against the LIVE GitHub API`, which the API still showed `in_progress` when the evidence step read it, the step directly before the final one; the final step's log and the job's conclusion show it ran to completion |
| `The F# suite, on the F# harness` | `success` | `success` |
| the final step | `failure` (step 108) | ran and `exit 1` (its log) |
| the `verify` job | `failure` | `failure` |
| `browser-gate`, `push-lands`, `claim-sweep`, `patent-watch`, `drama-backfill` jobs | all `success` | all `success` |

What this settles:

1. **The design works as written on a runner.** With the install failing, the 20 browser steps are skipped, the F# suite and the 69 or 70 other steps run and pass, the job is red, and the red names its cause. **Before this change the same failure skipped only the steps with no `if`, not all 90**: on the tree at `3528bb5`, 67 of the 94 steps after the install had none (19 need a browser, 48 do not, so 48 browser-free steps are newly rescued); the other 27 were gated on `!cancelled() && steps.build.outcome == 'success'`, `always()` or `failure()` and ran anyway. On the tree of the 2026-11-11 outage itself (`7e1a7e5`, 105 steps) 63 were skipped: 17 need a browser, 44 do not, and 2 are the setup actions' post-job cleanups (measured by running this guard's classification over that tree, and cross-checked against the independent table with 0 disagreements).
2. **A step killed by `timeout-minutes` has `outcome: failure`.** That was a claim from the runner's source (`StepsRunner.cs`) and unobserved in this repository; it is observed now, in run 2. The final step's `!= 'success'` and a `== 'failure'` test behave the same on both failure modes measured here; `!=` stays because it also covers `cancelled` and `skipped`, which these runs did not produce.
3. **With `continue-on-error`, the API's `conclusion` of the install step is `success` and only its `outcome` (the `steps` context) is `failure`.** Anything that reads a run's step table to learn whether the install worked must read the final step, not the install step's conclusion. The final step is the red one.
4. A process the timed-out shell started (`sleep 600`) survived until the job's cleanup ("Terminate orphan process: pid (3756) (sleep)"). It matters only to an install that leaves children; the runner removes them.

Not shown: the same failure in the other places that install a browser, none of them changed and none covered by the guard. `grep -n 'playwright install' .github/workflows/*.yml .github/actions/*/action.yml` (2026-11-12) lists 11 install sites besides this one (10 other workflow files and the composite action; `font-dependence-probe.yml` also names the command in a comment, which is not a site): `verify-full.yml` (the `full` job), the `mutation-shard` composite action, `live-check.yml` (which failed on 2026-11-11 too), and the probe workflows `client-sections-probe`, `font-dependence-probe`, `forecast-live-probe`, `lineups-card-probe`, `lineups-live-probe`, `live-score-probe`, `metrics-screenshot` and `open-meteo-egress-probe`. Also not shown: a failure that is neither a failed download nor a timeout, and a cancelled run.

## Second measurement: the final step as fixed (`6ea67d9`), two more runs (2026-11-12 05:02Z)

The review of `3528bb5` changed the final step (the outcome comes in through `env: INSTALL_OUTCOME` and the script prints one of three messages) and moved six self-tests into their own plain step, so the first measurement above is of an older workflow. Same method on the same two branches, fast-forwarded to a tree that is `6ea67d9` plus one sabotage and the evidence step (`proof-fastfail` at `35800cd`, `proof-timeout` at `b772460`; the second branch's name is a leftover, its scenario is now an EARLIER step failing, which skips the install). `verify.yml` dispatched on each.

| | run 1: the install fails | run 2: a step before the install fails |
|---|---|---|
| run | `verify` 43158658704, `proof-fastfail` | `verify` 43158662089, `proof-timeout` |
| sabotage | `PLAYWRIGHT_DOWNLOAD_HOST=https://playwright-download.invalid` on the install step | a step `PROOF - a step before the install fails` (`exit 1`) inserted before it |
| `Install Chromium`, in the API | `success` in 2 s (`continue-on-error`); the `steps` context says `failure` | `skipped` |
| `INSTALL_OUTCOME` in the final step's log | `failure` | `skipped` |
| the final step's `::error::` line | `The Chromium install did not succeed (outcome: failure). The steps that need a browser were skipped. This commit is NOT verified.` | `The Chromium install was skipped because an earlier step failed. That step, not the install, is the cause. The steps that need a browser did not run. This commit is NOT verified.` |
| the final step, and the `verify` job | `failure`, `failure` | `failure`, `failure` |
| steps that need a browser (20) | `{'skipped': 20}` | `{'skipped': 20}` |
| steps that need none (70 tabulated) | `{'success': 69, '-': 1}` (the one is still `in_progress` in the evidence step's snapshot, as in the first measurement) | `{'skipped': 48, 'success': 22}`: a step failed first, so every step with no `if` was skipped, which is GitHub's default and the case this message names; the 22 that ran are the ones gated on `!cancelled()` or `always()` |
| `The browser checks' own self-tests, which launch no browser` | `success` (step 14) | `skipped` (an earlier step failed) |
| `The F# suite, on the F# harness` | `success` (step 84) | `skipped` (same reason) |

What this settles. **Run 1 is the case the branch exists for and it holds with the fixed workflow:** the install fails, the F# suite, the six self-tests and the other browser-free steps run and pass, the 20 browser steps are skipped, the job is red, and the red says why. **Run 2 shows the `skipped` branch of the message on a runner**, and why the old text ("every other step ran") was false there: the F# suite did not run, because something else failed first, and the message now says that thing is the cause.

**A finding from these runs, fixed afterwards.** The `browser-gate` job FAILED on both proof branches, which is correct: the proof's own evidence step is appended after the final step and is a heredoc `gh` step the reader refuses. It also shows the guard running on a runner image (python3, PyYAML and bash present; 135 of 135 self-test checks, the real-tree read in about a second). Its output listed five problems, one of them inverted advice: for a final step that is merely not last it said the final step "needs no browser and must not wait for the install", before the real message. That is review finding 26(c), left as a nit, and a runner showed it; the guard now exempts the final step from that rule wherever it is, with a fixture and a sweep mutant.

Not shown, still: a cancelled run (the `cancelled` message), an empty outcome (a renamed id; the guard refuses a renamed id by the id rules and runs the final step with an empty outcome locally), and the other places that install a browser.
