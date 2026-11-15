# Claude Code Command — the pre-commit hook does not run the two guards that parse workflow YAML, and each of them has gone red after a commit had landed

**Branch:** main — commit directly, do not create a feature branch or PR (a work branch is used only to run `verify-full`, and lands on `main` by merge with the run id in the message)
**Repo:** field-laboratory
**Filed:** 2026-11-15 by CC, on the owner's word ("Brief and hook", Sun 2026-11-15 06:53 ET), as the residual named in `outbox/cc-session-2026-11-14-tls-stage.md` (the browser guard ran only in `verify.yml`'s job `browser-gate`, and the first form of the TLS workflow guard went red there)
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** DONE 2026-11-15. Approved by the owner ("Brief and hook", Sun 2026-11-15 06:53 ET). Built on the work branch `brief-hook` and landed on `main` as `4b66f5d7` with the brief-phase CC-CMD, after a scored `verify-full`, 43716154931, at 530 of 530 (ledger id `58e81d25cca8-9ac77ec85710`) on `58e81d25`, the commit that carries the hook change; `verify` 43721275726 on the branch head `d5ef64d0`, and `verify` 43721845406 and `guards` 43721845434 on the landing, are green. All five done conditions are met, each with its artifact in the Outcome. Three things differ from the plan and are in the Outcome: the hook runs the guards on every commit and not when a workflow file is staged, `check-push-lands.py` is a second guard in it, and Task 2b (the second guard's missing-PyYAML message) was added during the build. Whether a fresh cloud session has PyYAML is not established. The premises were tested before filing (`outbox/brief-hook-premises-2026-11-15.txt`, sections B), and the PyYAML row and the hook's timing were corrected during the build. Session record: `outbox/cc-session-2026-11-15-brief-hook.md`.

---

## What was measured

Two scripts in `scripts/` import PyYAML, and both read `.github/workflows/*.yml`: `check-browser-gate.py` and `check-push-lands.py`. Neither has a local caller. `package.json` defines `check:browser-gate` and nothing runs it; `check-push-lands.py` has no `package.json` entry at all. Both run in `verify.yml` only (jobs `browser-gate` and `push-lands`), so a bad workflow edit is found in CI after the commit exists.

Both have been found that way: `push-lands` on 2026-10-28, `verify` run 40649230876 on the first landing (`db9890d`) of `docs/CC-CMD-2026-10-28-gate-baseline-step-autostash.md`, whose record says the harness and `workflow-check` had been run locally and `check-push-lands.py` had not (`outbox/cc-session-2026-10-28-gate-baseline-step.md`); and `browser-gate` on 2026-11-14 (`a69191d5`, the first form of the TLS workflow guard, fixed by `9ec6907c`; `outbox/cc-session-2026-11-14-tls-stage.md`).

The owner's offer was one hook line "when a workflow file is staged". A staged workflow file is not the only edit that reddens the browser guard: it decides whether a step needs a browser by reading the entry script the step runs. In a scratch copy, one added `import { chromium } from "playwright"` and a `chromium.launch()` in `scripts/check-script-orphans.mjs`, nothing else changed, turned the guard from `verdict: gated` to exit 1 (`step 'No script a workflow depends on became unreachable' needs a browser and must carry steps.chromium.outcome == 'success'`). The same file with only a comment naming playwright stayed green (section B4). So the trigger "a workflow is staged" misses the script-only edit.

Cost, measured: the browser guard 1.5 s and its self-test 2.7 s; `check-push-lands.py` with its self-test 0.3 s (section B2). The hook as it stood ran 43.9 to 45.3 s in the three before-cases of `outbox/hook-runs-the-workflow-guards-proof-2026-11-15.txt` (section 2), and 47.2 to 48.0 s with the two lines (section 3). The figure first written here, "about 38 s", is in no artifact and is withdrawn.

## Related, read before building (BUILD-ON-A)

Searched 2026-11-15 by content (`check-browser-gate`, `browser-gate`, `.githooks`, `pre-commit`, `check-push-lands`, `push-lands`) in `docs/CC-CMD-*.md`. Status, rulings and holds were read; what this does with each:

- `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md` (PARTIAL; six open items): the browser guard's origin. This adds no item to it and closes none of its six. A pointer to this file is added to its "Option 1: built" text so a reader of the guard finds where it runs.
- `docs/CC-CMD-2026-10-19-precommit-hook-needs-build.md` (DONE): the hook describes itself as "a fast, no-network, no-build gate", and that CC-CMD made a missing build a named state instead of a refusal. Both guards read files and run nothing; neither needs a build or a network.
- `docs/CC-CMD-2026-10-28-gate-baseline-step-autostash.md` and `docs/CC-CMD-2026-10-10-schedule-path-respects-verify.md`: where `check-push-lands.py` came from and where it first went red. Not edited.
- `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md` and `docs/CC-CMD-2026-11-03-gate-state-hazards.md` (BUILT, DONE): rulings about the hook refusing a tree a killed mutation run left mutated. Not touched; the new lines sit after `check:setup-script` and do not change that order.
- The hook's own header: "a pre-commit that ran all of it is one nobody keeps enabled". Two guards at about 4 s are the cost this accepts, measured, against a hook of 44 to 45 s.

## Premises, and the one command that tested each (Rule 100)

| premise | the command | what it said |
|---|---|---|
| nothing runs these guards locally | `grep` for both names in the hook, `package.json`, `scripts/gate-checks.mjs`, `scripts/confidence.mjs` | only the `package.json` definition of `check:browser-gate`; no caller |
| "a workflow file is staged" is a wide enough trigger | a script-only mutation of an ungated step's entry script, guard run, tree restored | refuted: exit 1 on a script-only edit; the comment-only control stayed green |
| the two guards are cheap enough for every commit | `time` on each, self-test included | 1.5 s + 2.7 s, and 0.3 s |
| PyYAML is there in a cloud session | `import yaml` here, with and without `-s`; its install dates and what requires it; whether `scripts/install_pkgs.sh` or `docs/SETUP-SCRIPT.md` install it | present here in two copies, both older than this container's boot (2026-11-15 06:53): the user site (`pip show`: required by `conan`, `mkdocs`, `mkdocs-get-deps`, `pymdown-extensions`, `pyyaml_env_tag`; dist-info dated 2026-11-03 17:13:23 EST) and the system site-packages (`/usr/local/lib/python3.13/site-packages/yaml`, directory dated 2026-11-03 17:38:30 EST, the copy `python3 -s` imports; section 5 of the proof record). Neither the install script nor the setup text mentions it; the user-site copy is there as a dependency of the packages named, and what put the system copy there is not established. NOT ESTABLISHED for a fresh session |
| a guard without PyYAML says what to install, as Design 3 assumed | `python3 -S` on each guard (every site-packages disabled) | refuted for `check-push-lands.py`: a raw `ModuleNotFoundError` at its module-level `import yaml`, no remedy named. `check-browser-gate.py` names it. Task 2b fixes it |

## Task 0 — probe block (run at filing)

```
git log --oneline -3
git branch --show-current
cat .githooks/pre-commit | grep -n "npm run"
grep -n '"check:browser-gate"\|"check:push-lands"' package.json
python3 scripts/check-browser-gate.py --self-test | tail -1
python3 scripts/check-push-lands.py --self-test | tail -1
```

Expected at filing: the work branch `brief-hook` cut from `4799ab1c`; the hook with ten `npm run` lines and neither guard among them; `check:browser-gate` present and `check:push-lands` absent; `262/262 checks passed` for the first guard.

## Design

1. **Both guards run on every commit**, not on a trigger. The trigger "a workflow is staged" is refuted above; a path list right enough to be safe would have to copy what the guards read (workflows, composite actions, every entry script a step runs, `package.json`), and the guards, not a second list in the hook, are the authority on that. Two lines, after `check:setup-script`, each in the hook's style: `npm run --silent check:browser-gate` and `npm run --silent check:push-lands`, with the dated comment the other lines carry (what went red, where, and why it runs on every commit; no timing figure, which the hook's own header rules out and `outbox/hook-runs-the-workflow-guards-proof-2026-11-15.txt` carries).
2. **`check:push-lands`** is added to `package.json` beside `check:browser-gate` (self-test, then the real tree), so the hook calls both the same way and `verify.yml`'s direct calls are unchanged.
3. **No silent skip.** If PyYAML is missing, the guard exits 1 with its own message naming the remedy and the hook fails. `check-browser-gate.py` already did; `check-push-lands.py` did not (a raw `ModuleNotFoundError`, found while proving Task 2), so Task 2b gives it the same three lines. Nothing detects the absence and passes. Provisioning PyYAML for a session is not done here: whether a fresh session has it is not established, and `scripts/install_pkgs.sh` cannot be tested from this one.
4. **What does not change:** the existing hook lines and their order, both guards' logic (Task 2b adds only the missing-PyYAML handling to `check-push-lands.py`), `verify.yml`, `scripts/mutate-push-lands.py` (it breaks a copy and stays a CI job).

## Task 1 — the test first, and it fails on purpose (Rule 90)

Before the hook has the lines: in a scratch worktree, run the hook on a clean tree (it must end `pre-commit: ok` and print neither guard), then stage the script-only mutation and run it again (it must still end `pre-commit: ok`, which is the gap). **Artifact:** both runs' output.

## Task 2 — the lines

Add the two lines and `check:push-lands`. In the scratch worktree: (a) the script-only mutation, staged, the hook must exit 1 and name `check-browser-gate`; (b) a workflow mutation for the second guard (the landing verification removed from one push-retry loop), the hook must exit 1 and name `push-lands`; (c) the clean tree, `pre-commit: ok`, with the time the two lines add. Each mutation proves it was applied and which files changed, and the tree is restored. **Artifact:** the three outputs.

## Task 2b — the second guard says what to install (added during the build; Task 2 showed Design 3's premise false for it)

`python3 -S scripts/check-push-lands.py` (every site-packages disabled) ends on a traceback and names no remedy; `check-browser-gate.py` names it. The change is the browser guard's `try: import yaml` / `except ImportError: sys.exit(...)`, applied to `check-push-lands.py`'s module-level import, and the hook's comment says each guard says so. The check, written first: exit 1 AND the output holds `needs PyYAML (python3 -m pip install pyyaml)`. It must fail on the committed guard, pass on the fixed one, pass on the browser guard as a reference, and fail on three mutants of the fix (the remedy text removed; the message printed with exit 0, a skip that reads as a pass; the handler deleted), each mutant with a unique anchor and a copy that differs from the source before a verdict is printed. **Artifact:** `outbox/push-lands-pyyaml-message-2026-11-15.txt`, which also holds the whole hook run with PyYAML unreachable (exit 1, ending on the first guard's message) and the guard's own controls with PyYAML present (self-test 12/12, the real scan OK, `scripts/mutate-push-lands.py` 6 of 6).

## Task 3 — gates and landing

On the work branch with the brief CC-CMD's commits (`docs/CC-CMD-2026-11-15-brief-phase-card-identity.md`): one scored `verify-full`, one merge. The commit that carries the hook change and every commit after it run the two lines in their own hook; the branch's earlier commits predate the lines, and the merge commit runs no pre-commit hook, so the landing's `verify` (jobs `browser-gate` and `push-lands`) is the CI run of both. `verify-full` scores the commit that carries the hook change; Task 2b's commit comes after it, and `check-push-lands.py` runs in CI only in `verify.yml`'s job `push-lands` (the `grep` over `.github/`, `scripts/` and `package.json` is in the Task 2b record), so `verify` on the branch head is what covers it.

## Task 4 — the manifest is last

`outbox/cc-session-2026-11-15-brief-hook.md`.

## Done conditions

1. Task 1's second run ends `pre-commit: ok` on a staged script-only mutation (the gap, shown), and Task 2's (a) and (b) exit 1 naming their guards (the gap, closed).
2. Task 2's (c) ends `pre-commit: ok` and the added time is printed.
3. The hook change's commit and the commits after it ran the two lines in their own hook (their output shows `verdict: gated` and `OK: all 26 push-retry loop(s) verify that the push landed.`); `verify-full` at 530 of 530 on the commit that carries the hook change; `verify` green on the branch head and on the landing, and `guards` green on the landing.
4. The pointer line is in `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md` and that file's guards are green.
5. Task 2b's check fails on the committed `check-push-lands.py`, passes on the fixed one, and fails on its three mutants; the whole hook with PyYAML unreachable exits 1 on a guard's install message.

## Outcome, 2026-11-15

Landed with the brief-phase CC-CMD in one merge, `4b66f5d7` (the run ids are in that CC-CMD's Outcome). The hook change is `58e81d25`; Task 2b's fix is `3aea19d0`. `verify-full` 43716154931 scored `58e81d25` at 530 of 530 (ledger id `58e81d25cca8-9ac77ec85710`, 3,279 s). `verify` 43721275726 on the branch head `d5ef64d0` is green, all six jobs, `browser-gate` and `push-lands` among them; on the landing `verify` 43721845406 and `guards` 43721845434 are green.

| # | result | artifact |
|---|---|---|
| 1 | met: the hook's exit codes over the three cases before the lines are `0 0 0` (a clean tree, a script-only mutation staged, a workflow mutation staged: the gap, shown) and after them `0 1 1`; the script-only case stops on the browser guard (`needs a browser and must carry`) and the workflow case on `FAIL: 1 push-retry loop(s) with nothing after them that checks the push landed`; each mutation proved it was applied and the tree was restored | `outbox/hook-runs-the-workflow-guards-proof-2026-11-15.txt`, sections 2 and 3 |
| 2 | met: the clean tree ends `pre-commit: ok`; the whole hook took 43.9 to 45.3 s before the lines (3 runs) and 47.2 to 48.0 s after (3 runs), a second or two of noise not separated; the two lines run alone took 3.845, 4.000 and 4.141 s (`check:browser-gate`) and 0.412, 0.355 and 0.396 s (`check:push-lands`) | the same file, section 4 |
| 3 | met, with one part not kept: `verify-full` is 530/530 on `58e81d25`; `verify` is green on the branch head and on the landing, `guards` on the landing. The hook output of the commits after the hook change was kept for `b8b43f07` (47.153 s, ending `OK: all 26 push-retry loop(s) verify that the push landed.`) and for the hook run by hand on the merged tree `d5ef64d0` (46.7 s, exit 0, `verdict: gated` and the same OK line). The output of `58e81d25`, `3aea19d0`, `80f99a70` and `1c612af3` was not kept. What is known: the hook at each of the seven commits from `58e81d25` to `4b66f5d7` carries both lines (`git show <sha>:.githooks/pre-commit`, 2 of 2 at each), `core.hooksPath` is `.githooks` in this clone and `scripts/install_pkgs.sh` sets it, and no commit message on the branch carries the `[no-verify: reason]` marker a bypass requires (`grep -ci no-verify` over the messages: 0). That those four ran the hook is inferred from these three facts and not read from output | the run ids above; the session record |
| 4 | met: the pointer is at `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md:96` (commit `1b4459d9`); `guards` and `verify` are green on the landing | `git show 4b66f5d7:docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md` |
| 5 | met: with every site-packages disabled the committed guard fails the check (expected), the fixed guard passes, the browser guard passes as the reference, 3 of 3 mutants are caught, and the whole hook with PyYAML unreachable exits 1 on the browser guard's message; with PyYAML present the guard's self-test is `12/12`, its scan is OK on 26 loops and `scripts/mutate-push-lands.py` catches 6 of 6 | `outbox/push-lands-pyyaml-message-2026-11-15.txt` |

Differences from the plan.

- The hook runs the two guards on every commit. The wording that started this work was one line when a workflow file is staged. Measured before building: a script-only edit turns the browser guard red with no workflow staged, because it classifies a step by the entry script it runs, so a trigger on staged workflow files misses it (`outbox/brief-hook-premises-2026-11-15.txt`, B4).
- `check-push-lands.py` is a second guard in the hook. It is the same class (it reads workflow YAML with PyYAML, and its only caller was `verify.yml`) and it was red in CI after the commit existed, in verify run 40649230876 on 2026-10-28.
- Task 2b was added during the build. Design 3 assumed a guard without PyYAML says what to install; run under `python3 -S`, `check-push-lands.py` died on a `ModuleNotFoundError` and named no remedy. It now carries the browser guard's handling of the missing import.
- The PyYAML row and the hook's timing in the premises were corrected during the build (the premises table above reads as corrected).

Not established. Whether a fresh cloud session has PyYAML: here it was present in two copies older than this container's boot, and neither `scripts/install_pkgs.sh` nor `docs/SETUP-SCRIPT.md` installs it. A box without it stops the commit with the install line, which is the intended behaviour and not a fix for the box. The session record is `outbox/cc-session-2026-11-15-brief-hook.md`.

## What this does not establish (said before it is built)

- That a fresh cloud session has PyYAML. If it does not, the first commit in it fails and the first guard to run says what to install (shown here with PyYAML hidden: the hook exits 1 on `check-browser-gate.py needs PyYAML (python3 -m pip install pyyaml)`). The remedy itself, running that pip command, was not run in a session without PyYAML.
- That the hook is enabled in every session: `scripts/install_pkgs.sh` sets `core.hooksPath` in cloud sessions only; a local machine opts in.
- That these two are the only CI-only guards of this class. The census is of the scripts that import PyYAML (2 of 13 `.py` files). A guard written in Node that reads workflows is not counted, and `check:workflows` already runs in the hook.

## Not in scope

Provisioning PyYAML; the wording of `check-browser-gate.py`'s missing-PyYAML message (Task 2b repeats it in `check-push-lands.py` and changes nothing else there); `scripts/mutate-push-lands.py`; any other guard.
