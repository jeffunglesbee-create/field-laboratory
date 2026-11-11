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
