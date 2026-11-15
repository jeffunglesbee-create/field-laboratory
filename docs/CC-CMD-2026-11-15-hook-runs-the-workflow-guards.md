# Claude Code Command — the pre-commit hook does not run the two guards that parse workflow YAML, and each of them has gone red after a commit had landed

**Branch:** main — commit directly, do not create a feature branch or PR (a work branch is used only to run `verify-full`, and lands on `main` by merge with the run id in the message)
**Repo:** field-laboratory
**Filed:** 2026-11-15 by CC, on the owner's word ("Brief and hook", Sun 2026-11-15 06:53 ET), as the residual named in `outbox/cc-session-2026-11-14-tls-stage.md` (the browser guard ran only in `verify.yml`'s job `browser-gate`, and the first form of the TLS workflow guard went red there)
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** FILED 2026-11-15. Not started when this line was written; the premises below were tested before filing and every one of them is in `outbox/brief-hook-premises-2026-11-15.txt` (sections B).

---

## What was measured

Two scripts in `scripts/` import PyYAML, and both read `.github/workflows/*.yml`: `check-browser-gate.py` and `check-push-lands.py`. Neither has a local caller. `package.json` defines `check:browser-gate` and nothing runs it; `check-push-lands.py` has no `package.json` entry at all. Both run in `verify.yml` only (jobs `browser-gate` and `push-lands`), so a bad workflow edit is found in CI after the commit exists.

Both have been found that way: `push-lands` on 2026-10-28, `verify` run 40649230876 on the first landing (`db9890d`) of `docs/CC-CMD-2026-10-28-gate-baseline-step-autostash.md`, whose record says the harness and `workflow-check` had been run locally and `check-push-lands.py` had not (`outbox/cc-session-2026-10-28-gate-baseline-step.md`); and `browser-gate` on 2026-11-14 (`a69191d5`, the first form of the TLS workflow guard, fixed by `9ec6907c`; `outbox/cc-session-2026-11-14-tls-stage.md`).

The owner's offer was one hook line "when a workflow file is staged". A staged workflow file is not the only edit that reddens the browser guard: it decides whether a step needs a browser by reading the entry script the step runs. In a scratch copy, one added `import { chromium } from "playwright"` and a `chromium.launch()` in `scripts/check-script-orphans.mjs`, nothing else changed, turned the guard from `verdict: gated` to exit 1 (`step 'No script a workflow depends on became unreachable' needs a browser and must carry steps.chromium.outcome == 'success'`). The same file with only a comment naming playwright stayed green (section B4). So the trigger "a workflow is staged" misses the script-only edit.

Cost, measured: the browser guard 1.5 s and its self-test 2.7 s; `check-push-lands.py` with its self-test 0.3 s (section B2). The hook runs about 38 s.

## Related, read before building (BUILD-ON-A)

Searched 2026-11-15 by content (`check-browser-gate`, `browser-gate`, `.githooks`, `pre-commit`, `check-push-lands`, `push-lands`) in `docs/CC-CMD-*.md`. Status, rulings and holds were read; what this does with each:

- `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md` (PARTIAL; six open items): the browser guard's origin. This adds no item to it and closes none of its six. A pointer to this file is added to its "Option 1: built" text so a reader of the guard finds where it runs.
- `docs/CC-CMD-2026-10-19-precommit-hook-needs-build.md` (DONE): the hook describes itself as "a fast, no-network, no-build gate", and that CC-CMD made a missing build a named state instead of a refusal. Both guards read files and run nothing; neither needs a build or a network.
- `docs/CC-CMD-2026-10-28-gate-baseline-step-autostash.md` and `docs/CC-CMD-2026-10-10-schedule-path-respects-verify.md`: where `check-push-lands.py` came from and where it first went red. Not edited.
- `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md` and `docs/CC-CMD-2026-11-03-gate-state-hazards.md` (BUILT, DONE): rulings about the hook refusing a tree a killed mutation run left mutated. Not touched; the new lines sit after `check:setup-script` and do not change that order.
- The hook's own header: "a pre-commit that ran all of it is one nobody keeps enabled". Two guards at about 4 s are the cost this accepts, measured, against a hook of about 38 s.

## Premises, and the one command that tested each (Rule 100)

| premise | the command | what it said |
|---|---|---|
| nothing runs these guards locally | `grep` for both names in the hook, `package.json`, `scripts/gate-checks.mjs`, `scripts/confidence.mjs` | only the `package.json` definition of `check:browser-gate`; no caller |
| "a workflow file is staged" is a wide enough trigger | a script-only mutation of an ungated step's entry script, guard run, tree restored | refuted: exit 1 on a script-only edit; the comment-only control stayed green |
| the two guards are cheap enough for every commit | `time` on each, self-test included | 1.5 s + 2.7 s, and 0.3 s |
| PyYAML is there in a cloud session | `import yaml` here; its install date; whether `scripts/install_pkgs.sh` or `docs/SETUP-SCRIPT.md` install it | present here (user site, installed 2026-11-03 17:13:23 EST, one second before `conan`, and before this container booted at 2026-11-15 06:53); neither the install script nor the setup text mentions it. NOT ESTABLISHED for a fresh session |

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

1. **Both guards run on every commit**, not on a trigger. The trigger "a workflow is staged" is refuted above; a path list right enough to be safe would have to copy what the guards read (workflows, composite actions, every entry script a step runs, `package.json`), and the guards, not a second list in the hook, are the authority on that. Two lines, after `check:setup-script`, each in the hook's style: `npm run --silent check:browser-gate` and `npm run --silent check:push-lands`, with the dated comment the other lines carry (what went red, where, and what it cost).
2. **`check:push-lands`** is added to `package.json` beside `check:browser-gate` (self-test, then the real tree), so the hook calls both the same way and `verify.yml`'s direct calls are unchanged.
3. **No silent skip.** If PyYAML is missing, the guard exits with its own message naming the remedy and the hook fails. Nothing detects the absence and passes. Provisioning PyYAML for a session is not done here: whether a fresh session has it is not established, and `scripts/install_pkgs.sh` cannot be tested from this one.
4. **What does not change:** the existing hook lines and their order, the two guards, `verify.yml`, `scripts/mutate-push-lands.py` (it breaks a copy and stays a CI job).

## Task 1 — the test first, and it fails on purpose (Rule 90)

Before the hook has the lines: in a scratch worktree, run the hook on a clean tree (it must end `pre-commit: ok` and print neither guard), then stage the script-only mutation and run it again (it must still end `pre-commit: ok`, which is the gap). **Artifact:** both runs' output.

## Task 2 — the lines

Add the two lines and `check:push-lands`. In the scratch worktree: (a) the script-only mutation, staged, the hook must exit 1 and name `check-browser-gate`; (b) a workflow mutation for the second guard (the landing verification removed from one push-retry loop), the hook must exit 1 and name `push-lands`; (c) the clean tree, `pre-commit: ok`, with the time the two lines add. Each mutation proves it was applied and which files changed, and the tree is restored. **Artifact:** the three outputs.

## Task 3 — gates and landing

On the work branch with the brief CC-CMD's commits (`docs/CC-CMD-2026-11-15-brief-phase-card-identity.md`): one scored `verify-full`, one merge. Every commit of the branch runs the hook, so the new lines run on their own landing.

## Task 4 — the manifest is last

`outbox/cc-session-2026-11-15-brief-hook.md`.

## Done conditions

1. Task 1's second run ends `pre-commit: ok` on a staged script-only mutation (the gap, shown), and Task 2's (a) and (b) exit 1 naming their guards (the gap, closed).
2. Task 2's (c) ends `pre-commit: ok` and the added time is printed.
3. The branch's commits each ran the two lines (their hook output shows `browser-gate` and `push-lands`); `verify-full` at 530 of 530 on the tip; the landing's `verify` and `guards` green.
4. The pointer line is in `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md` and that file's guards are green.

## What this does not establish (said before it is built)

- That a fresh cloud session has PyYAML. If it does not, the first commit in it fails with the guard's own message, which names `python3 -m pip install pyyaml`. That remedy was not run in a session without PyYAML.
- That the hook is enabled in every session: `scripts/install_pkgs.sh` sets `core.hooksPath` in cloud sessions only; a local machine opts in.
- That these two are the only CI-only guards of this class. The census is of the scripts that import PyYAML (2 of 13 `.py` files). A guard written in Node that reads workflows is not counted, and `check:workflows` already runs in the hook.

## Not in scope

Provisioning PyYAML; the wording of the guard's missing-PyYAML message; `scripts/mutate-push-lands.py`; any other guard.
