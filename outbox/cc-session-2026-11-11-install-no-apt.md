# Session note: the browser install without apt, and bounded (2026-11-11)

**Branch:** `install-no-apt` off `origin/main` `87736ff`. **Owning CC-CMD:** `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md`, options 2 and 3, chosen by the owner ("2 and 3, make it work"). **Not built:** option 1 (the F# suite and other browser-free rows surviving a failed install); it was not chosen.

## Commits on the branch, in order

1. `11680a3` ci: `--with-deps` is gone from all ten install sites (nine workflows and the `mutation-shard` composite action); eight workflow steps take `timeout-minutes: 3`, the composite action and the combined `Install` step of `open-meteo-egress-probe.yml` take `timeout 180` on the install alone (a composite action's step takes no `timeout-minutes`, a limit on the combined step would also bound `npm ci` and the tool restore). Record: `outbox/install-no-apt-red-before-2026-11-11.txt`.
2. `103d54e` check: `scripts/workflow-check.mjs` fails on `--with-deps` / `install-deps` and on an unbounded install, reads composite actions too, and fails on an install command the step reader did not find. 63/63 checks; 14 of 14 breakages caught (`outbox/install-guard-sweep-2026-11-11.txt`).
3. This commit: the measurement, below.

## The measurement (Rule 100: the premises, before anything lands)

The CC-CMD named two unknowns for option 2: the fonts (what the nine packages change) and the replacement (that the install without apt leaves a browser that runs). `scripts/font-dependence-probe.mjs` and `.github/workflows/font-dependence-probe.yml` measure both in one job on one fresh runner:

| premise | the command | artifact |
|---|---|---|
| the install touches no apt | dpkg list hash, `dpkg.log` and apt history sizes before and after; apt, apt-get, dpkg and sudo shimmed on PATH during the install | `outbox/install-no-apt-probe-latest.txt`, `checked 5 of 5 premises` |
| the browser has every shared library | `ldd` over every browser binary the install left | same file |
| the install fits its limit | seconds, against 180 | same file |
| the nine fonts change no layout | the layout-check page at the 10 canonical viewports, at rest and with every card open (20 cells): element boxes, scroll size, fonts drawn; control (same page twice), teeth (every font forced to monospace), then treatment (after `apt-get install` of the nine) | `outbox/font-dependence-latest.{json,txt}`, `checked 20 of 20 cells` |

Locally (sandbox, Chromium 141, the same page): control 0 differ, teeth 20 differ, and the fonts that drew glyphs were the page's own faces (DM Sans, Chakra Petch, Inter). That is the sandbox, not the runner; the runner result is the artifact.

## Open until the runner has answered

Everything below is filled in by the runner's files and the scored gate. This note is updated with them.

## First runner result (run 43100680200, 2026-11-11 21:09Z, commit-back `096fde3`)

`outbox/install-no-apt-probe-latest.txt`: `checked 5 of 5 premises: 5 held` (install 9 s against the 180 s limit; no package changed, dpkg.log and apt history 0 bytes before and after, 0 shimmed apt/dpkg/sudo calls; 2 browser binaries, 0 libraries not found; the nine fonts 0 of 9 before). `outbox/font-dependence-latest.txt`: `checked 20 of 20 cells`, control 0 differ, teeth 20 differ, treatment 0 differ in geometry and 0 in pixels, no font outside the first run's drew a glyph, verdict `fonts-not-needed`. Runner: Ubuntu 26.04.1 LTS image 20261101.186.1, Chromium 151.0.7922.34.

Why a second run: the review of the branch (below) found the probe measured less than its first line suggested, so it was extended and is run again on the tree that lands.

## What the independent review changed (workflow `install-no-apt-review`, five lenses, a skeptic per finding)

- **The check** (`4578ba9`): pinned and scoped package forms, folded scalars, wrapped `timeout` forms, whole-minute step limits, nested and `.yaml` composite actions; 23 new fixtures; sweep 14 -> 33 mutations, 33 of 33 caught.
- **The two `timeout` sites** (`ca90eb0`): `--kill-after=10`, so a process tree that ignores SIGTERM cannot hold the step to the job's own limit.
- **The probe** (this commit): (1) the runner's own `timeout` is measured, plain and with `--kill-after`, as premises 6 and 7 (exit status, seconds, survivors), because the runner image decides whether it is GNU or uutils (Ubuntu 26.04 moved coreutils to uutils; the review ran only GNU 9.4 and uutils 0.0.24 locally); (2) a fallback-text cell draws CJK, Thai, Cyrillic, Greek, Hebrew, Arabic and symbols, outside the verdict, to show which fallback fonts the nine packages would supply, because the layout page carries only Latin text drawn in its own web fonts and a clean verdict says nothing about other scripts; (3) when apt fails the first line says `treatment NOT RUN (0 of 0 cells compared)`; (4) the commit-back step compares the result files on origin with the ones this run wrote, because a conflicted rebase leaves HEAD on the upstream tip and the old `is-ancestor` test then passed.

## Facts read from primary sources during the work (kept, with what each leaves open)

- A composite action's step takes no `timeout-minutes`: GitHub's metadata-syntax page lists run, shell, if, name, id, env, working-directory, uses, with, continue-on-error; `actions/runner` `action_yaml.json` agrees. A `timeout-minutes` on the calling `uses:` step bounds the whole action (build, install and shard), so it cannot be the install's limit. **Not executed on a runner:** whether the key is rejected at action load or ignored.
- A step killed by `timeout-minutes` ends with conclusion `failure` ("The action ... has timed out after N minutes", `StepsRunner.cs`), so `success()`, `failure()`, `always()` and `cancelled()` after it evaluate as after an ordinary failure; none of the 88 later steps of `verify.yml` reads the install step. **Not observed on a real run of this repository.** Fractional values are not supported and `0` means no limit.
- `playwright install chromium` never runs apt, dpkg, sudo or su (strace A/B with a positive control: `--with-deps` made 1 `apt-get` and 3 `dpkg` execves, the plain install none), and its only network dependency is `cdn.playwright.dev` (plus `playwright.download.prss.microsoft.com` as an ffmpeg fallback). **Not measured:** whether those hosts resolve while the Ubuntu names do not; on 2026-11-11 apt ran first and failed, so the browser download was never attempted during the outage. The step limit bounds a recurrence to three minutes and nothing measured says the apt-free install would have passed that day.
- Playwright 1.62.1's launch-time dependency check scans `chrome-linux/`, a directory the x64 Chrome-for-Testing build does not have, so it passes without checking anything. A missing library would not warn at install time; it would show as `error while loading shared libraries` at the first step that launches the browser. The `ldd` premise above is the measurement that stands in for it on this image.
- The install is three downloads (chromium, ffmpeg, headless shell) of up to five attempts each with a 30 s socket idle timeout, so a CDN that connects and stalls could outlast 180 s; the limit ends it at 180 s.
