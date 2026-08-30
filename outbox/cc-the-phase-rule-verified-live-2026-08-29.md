# The phase rule now proves itself against the deployed page

**Date:** 2026-08-29
**Scope:** `scripts/brief-phase-live-check.mjs` (new),
`.github/workflows/live-check.yml`

## What was unproven

`briefsByGame` gained a phase rule earlier today: on a finished game, prefer the
after-play brief. It was measured on `data/brief-recency-corpus.json` and proved
by rebuilding with and without the change — 189 → 200 of 239 final games showing
`game_recap`.

Every one of those numbers came from a captured file, checked against a local
server. Both are copies. The rule itself lives in F# that has to compile,
bundle, deploy, and then run in a real browser against a live payload this repo
does not control, and nothing looked at that end of it.

This repo has the case study for exactly that gap in its own CLAUDE.md:
`Sport.Bundesliga` was correct in source, compiled 71/71, and rendered
`UNMODELLED SPORT`, because only half of `npm run build` had run.

## What the check does

Fetches the same `/context/date` the page fetched, computes what the rule says
each final game's card should show, and asserts the DOM agrees. Relay → decode →
render → DOM.

The expectation is written independently rather than imported from
`build/Journalism.js`. Importing it would make the check agree with the source by
construction — it would pass on a stale live bundle, because both sides would
come from the same freshly-built local tree. That is the failure being guarded
against, so a divergence between the two is a finding rather than an error.

The artifact is a per-game table, not a boolean:

```
  game                                      expected      shown
  Frankfurt @ Union Berlin                  game_recap    game_recap
  …
```

### Three states, and the middle one is not a pass

| | |
|---|---|
| `NOT OBSERVABLE` | no final game on the slate carries both phases — nothing to prefer, so the rule is untested. Emits `::warning::`, never green-by-default |
| `FAIL` | a card shows a during-play kind while an after-play brief for that game exists in the payload |
| `PASS` | every such game shows its after-play brief |

Self-test 6/6, including the bug as a fixture: a `game_live` and a `game_recap`
on one final game must not expect `game_live` — the screenshot that started this
showed `GAME_LIVE` on a 3-3 final.

## Two selectors written from memory, both wrong, both caught by probing

The first draft read the slate date from `.date-nav__label`. **No such class
exists anywhere in this codebase.** `page.textContent` on a missing selector
returns null, the code fell back to today's date, and the check would have
passed while looking at a different slate than the page.

The real element is `#viewed-date` — an id written by `report "viewed-date"`
(`src/Program.fs:200`), not a class. And it does not always hold a date: with
`?data=` pinned to a committed capture it reads `"pinned to a committed capture"`
(`src/Program.fs:407`). So the shape is now asserted rather than trusted, and
anything else fails loudly instead of fetching a nonsense URL.

One command answered both — `grep` for the class names the F# actually emits.
The repo's own rule, applied to the file being written to enforce the repo's own
rules.

## Where it runs

`live-check.yml`, which fires on `workflow_run: [deploy] completed` and daily at
06:37 UTC. So every deploy verifies this rule against itself, and the daily beat
catches the other direction — the artifact is fine but the relay's shape moved
under it.

Costs nothing extra: `live-check` already launches Chromium and already has the
egress this needs.

## Verify

```
node scripts/brief-phase-live-check.mjs --self-test          # 6/6
URL=https://field-laboratory.jeffunglesbee.workers.dev/ \
  node scripts/brief-phase-live-check.mjs                    # the live table
npm run check:workflows                                      # 6/6
npm run check:script-orphans                                 # 3/3
```

## The hook caught this file, one commit after the hook gained that check

`check:import-purity` was added to `.githooks/pre-commit` in the previous
commit, after three modules written this session each ran and exited on import.
This file was the fourth: it exports `briefMatches` and `expectedKind` for its
own self-test, and ran its executable half at module scope.

```
Probed 26 exporting module(s) in scripts/
FAIL  importing a module never runs it or exits the process
      → scripts/brief-phase-live-check.mjs: the import terminated the process (exit 1)
```

Guarded with `isMain(import.meta.url)` like the other three. The commit was
blocked at the door in about a second, rather than failing step 55 of 60 in CI
six minutes later and blocking a deploy — which is what the previous three cost.
